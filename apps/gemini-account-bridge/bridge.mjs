#!/usr/bin/env node
// Gemini account bridge: serves the Gemini API generateContent surface that
// OpenClaw's built-in `google-generative-ai` transport speaks, and forwards each
// request to the Antigravity account endpoint (Cloud Code `v1internal`) with the
// OAuth login the official `agy` CLI keeps on disk. Same endpoint and login the
// Scene Gemini relay already uses; nothing here reimplements the agent loop,
// tools or prompt handling -- OpenClaw's PI harness (vlab-worker) does that.
//
// Inbound:  POST /v1beta/models/<model>:streamGenerateContent?alt=sse
//           POST /v1beta/models/<model>:generateContent
//           GET  /healthz
// Auth:     the local Unix user that owns the client socket must be in
//           GEMINI_BRIDGE_ALLOW_USERS (V: openclaw); optionally a key in
//           x-goog-api-key instead (GEMINI_BRIDGE_KEY_FILE), for tunnels/tests.
// Upstream: {project, model: "<model>-<effort>", userAgent, requestId, request}
//           and every response chunk is unwrapped from {response: ...}.
//
// <model> is the bare family id (e.g. gemini-4-neon). The effort suffix the
// account catalog needs (gemini-4-neon-medium) comes from the request's
// thinkingConfig.thinkingLevel, so OpenClaw's /think levels choose the tier.
//
// Env: GEMINI_BRIDGE_ALLOW_USERS, GEMINI_BRIDGE_KEY_FILE (or GEMINI_BRIDGE_KEY), GEMINI_BRIDGE_PORT (25990),
// GEMINI_BRIDGE_HOST (127.0.0.1), GEMINI_BRIDGE_MODELS (gemini-4-neon),
// GEMINI_BRIDGE_DEFAULT_EFFORT (medium), GEMINI_BRIDGE_CONCURRENCY (4),
// AGY_HOME (default $HOME), AGY_BIN (official CLI, used only to refresh the
// login), GEMINI_BRIDGE_UPSTREAM (default daily-cloudcode-pa v1internal).
// Logs carry model, status, timings and token counts only -- never prompts,
// tokens or keys.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';

export const DEFAULT_UPSTREAM = 'https://daily-cloudcode-pa.googleapis.com/v1internal';
export const EFFORTS = ['low', 'medium', 'high', 'xhigh'];
const MAX_BODY = 40 * 1024 * 1024;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const PROJECT_TTL_MS = 10 * 60 * 1000;

const log = (event) => process.stderr.write(JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');

/** Maps an OpenClaw request onto the account catalog id and strips the
 * thinking knobs the account endpoint encodes in the model id instead. */
export function resolveAccountModel(model, request, { allowed, defaultEffort }) {
  const bare = String(model || '').replace(/^models\//, '');
  const suffix = EFFORTS.find((e) => bare.endsWith(`-${e}`));
  const family = suffix ? bare.slice(0, -(suffix.length + 1)) : bare;
  if (!allowed.includes(family)) return null;
  const thinking = request?.generationConfig?.thinkingConfig;
  const asked = String(thinking?.thinkingLevel || '').toLowerCase();
  // OpenClaw sends thinkingLevel for Gemini 3+ ids; `minimal`/`off` map to low,
  // anything above xhigh (max) to xhigh, which is the highest account tier.
  const fromLevel = asked === 'minimal' || asked === 'off' ? 'low'
    : asked === 'max' ? 'xhigh' : EFFORTS.includes(asked) ? asked : undefined;
  const effort = suffix || fromLevel || defaultEffort;
  const next = structuredClone(request ?? {});
  if (next.generationConfig?.thinkingConfig) {
    const { includeThoughts } = next.generationConfig.thinkingConfig;
    next.generationConfig.thinkingConfig = includeThoughts === undefined ? {} : { includeThoughts };
    if (!Object.keys(next.generationConfig.thinkingConfig).length) delete next.generationConfig.thinkingConfig;
  }
  return { family, accountModel: `${family}-${effort}`, effort, request: next };
}

/** Rewrites one upstream SSE `data:` payload ({response: {...}}) to Gemini API shape. */
export function unwrapChunk(text) {
  const parsed = JSON.parse(text);
  return parsed && typeof parsed === 'object' && parsed.response ? parsed.response : parsed;
}

export class AccountLogin {
  constructor({ home, agyBin, now = () => Date.now(), runCli } = {}) {
    this.file = path.join(home, '.gemini/antigravity-cli/antigravity-oauth-token');
    this.home = home;
    this.agyBin = agyBin;
    this.now = now;
    this.runCli = runCli ?? ((args, cwd) => new Promise((resolve, reject) => {
      execFile(this.agyBin, args, { cwd, timeout: 90_000, env: pickEnv(), maxBuffer: 4 << 20 },
        (error) => (error ? reject(error) : resolve()));
    }));
    this.refreshing = null;
  }

  read() {
    const stat = fs.statSync(this.file);
    if (stat.mode & 0o077) throw new BridgeError(503, 'login file must be private (0600)');
    const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    const token = data?.token?.access_token;
    if (!token) throw new BridgeError(503, 'no account login on disk');
    const expiry = Date.parse(data.token.expiry || '') || 0;
    return { token, expiry };
  }

  /** The official CLI refreshes its own login; `/usage` is the cheapest call that does it. */
  async refresh() {
    if (!this.agyBin) throw new BridgeError(503, 'account login expired and AGY_BIN is not set');
    this.refreshing ??= (async () => {
      const work = fs.mkdtempSync(path.join(this.home, 'work', 'bridge-refresh-'));
      try {
        await this.runCli(['--print', '/usage', '--output-format', 'json'], work);
      } finally {
        fs.rmSync(work, { recursive: true, force: true });
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  async token({ force = false } = {}) {
    let current = this.read();
    if (force || current.expiry - this.now() < REFRESH_MARGIN_MS) {
      await this.refresh();
      current = this.read();
      if (current.expiry - this.now() < 60_000) throw new BridgeError(503, 'account login refresh did not produce a fresh token');
    }
    return current.token;
  }
}

function pickEnv() {
  const keep = ['HOME', 'PATH', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TMPDIR'];
  return Object.fromEntries(keep.filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
}

/** uid owning the client end of a loopback TCP connection, from /proc/net/tcp{,6}. */
export function linuxPeerUid(socket, procRoot = '/proc') {
  const hex = (n) => n.toString(16).toUpperCase().padStart(4, '0');
  const clientPort = hex(socket.remotePort);
  const serverPort = hex(socket.localPort);
  for (const file of ['net/tcp', 'net/tcp6']) {
    let text;
    try { text = fs.readFileSync(path.join(procRoot, file), 'utf8'); } catch { continue; }
    for (const line of text.split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 8) continue;
      const [local, remote] = [cols[1], cols[2]];
      if (local.endsWith(`:${clientPort}`) && remote.endsWith(`:${serverPort}`)) {
        const addr = local.split(':')[0];
        // only loopback clients: 127.0.0.0/8 (little-endian ...7F) or ::1 / ::ffff:127.x
        const loopback = addr.length === 8 ? addr.endsWith('7F') : /^0{24}01000000$|^0000000000000000FFFF0000[0-9A-F]{6}7F$/.test(addr);
        if (loopback) return Number(cols[7]);
      }
    }
  }
  return undefined;
}

export class BridgeError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function createBridge(options) {
  const {
    key, allowUids, peerUid = linuxPeerUid, login, allowed = ['gemini-4-neon'], defaultEffort = 'medium', concurrency = 4,
    upstream = DEFAULT_UPSTREAM, fetchImpl = fetch, userAgent = 'antigravity/cli/1.3.3', now = () => Date.now(),
  } = options;
  const uids = new Set(allowUids ?? []);
  if (!uids.size && !key) throw new Error('configure GEMINI_BRIDGE_ALLOW_USERS (local users) and/or a bridge key');
  if (key && key.length < 32) throw new Error('bridge key must be at least 32 characters');
  const keyHash = key ? crypto.createHash('sha256').update(key).digest() : null;
  let inflight = 0;
  let project = null;
  const stats = { requests: 0, ok: 0, failed: 0, consumedCredits: 0, lastError: null, lastOkAt: null };

  // Who may use Tianyi's quota: local Unix users by the uid that owns the
  // client socket (no shared secret to store), or a key when one is configured.
  const authorized = (req) => {
    if (uids.size) {
      const uid = peerUid(req.socket);
      if (uid !== undefined && uids.has(uid)) return { ok: true };
      if (!keyHash) return { ok: false, uid };
    }
    const given = req.headers['x-goog-api-key'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!given) return { ok: false };
    return { ok: crypto.timingSafeEqual(crypto.createHash('sha256').update(String(given)).digest(), keyHash) };
  };

  const call = async (method, body, { stream = false, retryAuth = true } = {}) => {
    const token = await login.token();
    const url = `${upstream}:${method}${stream ? '?alt=sse' : ''}`;
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'user-agent': userAgent, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if ((res.status === 401 || res.status === 403) && retryAuth) {
      await res.body?.cancel?.();
      await login.token({ force: true });
      return call(method, body, { stream, retryAuth: false });
    }
    return res;
  };

  const resolveProject = async () => {
    if (project && now() - project.at < PROJECT_TTL_MS) return project.id;
    const res = await call('loadCodeAssist', { metadata: { ideType: 'ANTIGRAVITY' } });
    if (!res.ok) throw new BridgeError(res.status === 429 ? 429 : 503, `loadCodeAssist ${res.status}`);
    const data = await res.json();
    const tier = data?.paidTier?.id;
    if (typeof data?.cloudaicompanionProject !== 'string' || !data.cloudaicompanionProject) {
      throw new BridgeError(503, 'account has no Code Assist project');
    }
    if (!['g1-pro-tier', 'g1-ultra-tier'].includes(tier)) throw new BridgeError(503, `account tier ${tier ?? 'unknown'} is not a paid plan`);
    project = { id: data.cloudaicompanionProject, at: now(), tier };
    return project.id;
  };

  const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new BridgeError(413, 'request too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

  const sendError = (res, status, message) => {
    if (res.headersSent) { res.end(); return; }
    const googleStatus = { 400: 'INVALID_ARGUMENT', 401: 'UNAUTHENTICATED', 404: 'NOT_FOUND', 413: 'INVALID_ARGUMENT', 429: 'RESOURCE_EXHAUSTED' }[status] ?? 'UNAVAILABLE';
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: status, message, status: googleStatus } }));
  };

  const handleGenerate = async (req, res, model, stream) => {
    if (inflight >= concurrency) { res.setHeader('retry-after', '5'); return sendError(res, 429, 'bridge busy'); }
    inflight += 1;
    const started = now();
    const record = { model, stream };
    stats.requests += 1;
    try {
      const raw = await readBody(req);
      let request;
      try { request = JSON.parse(raw.toString('utf8') || '{}'); } catch { throw new BridgeError(400, 'invalid JSON body'); }
      const mapped = resolveAccountModel(model, request, { allowed, defaultEffort });
      if (!mapped) throw new BridgeError(404, `model ${model} is not served by this bridge`);
      record.accountModel = mapped.accountModel;
      record.bytes = raw.length;
      record.shape = { contents: mapped.request.contents?.length ?? 0, tools: (mapped.request.tools ?? []).reduce((n, t) => n + (t.functionDeclarations?.length ?? 1), 0), keys: Object.keys(mapped.request).sort() };
      const envelope = {
        project: await resolveProject(), model: mapped.accountModel, userAgent: 'antigravity',
        requestId: crypto.randomUUID(), request: mapped.request,
      };
      const up = await call(stream ? 'streamGenerateContent' : 'generateContent', envelope, { stream });
      record.upstreamStatus = up.status;
      if (!up.ok) {
        const text = (await up.text()).slice(0, 2000);
        let message = `upstream ${up.status}`;
        try { message = JSON.parse(text)?.error?.message || message; } catch { /* keep generic */ }
        // OpenClaw only fails over on specific statuses; keep 429 and 4xx
        // meaningful and fold upstream 5xx into 503.
        const status = up.status === 429 || (up.status >= 400 && up.status < 500) ? up.status : 503;
        throw new BridgeError(status, message);
      }
      if (!stream) {
        const data = await up.json();
        if (data?.consumedCredits) stats.consumedCredits += 1;
        const response = data?.response ?? data;
        record.usage = response?.usageMetadata;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(response));
      } else {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
        const decoder = new TextDecoder();
        let buffer = '';
        let first = true;
        const flush = (line) => {
          if (!line.startsWith('data:')) return;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') return;
          const parsed = JSON.parse(payload);
          if (parsed?.consumedCredits) stats.consumedCredits += 1;
          const chunk = parsed?.response ?? parsed;
          if (chunk?.usageMetadata) record.usage = chunk.usageMetadata;
          if (first) { record.firstChunkMs = now() - started; first = false; }
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        };
        for await (const part of up.body) {
          buffer += decoder.decode(part, { stream: true });
          let index;
          while ((index = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, index).replace(/\r$/, '');
            buffer = buffer.slice(index + 1);
            flush(line);
          }
        }
        if (buffer.trim()) flush(buffer.trim());
        res.end();
      }
      stats.ok += 1;
      stats.lastOkAt = new Date(now()).toISOString();
      record.status = 200;
    } catch (error) {
      stats.failed += 1;
      const status = error instanceof BridgeError ? error.status : 503;
      stats.lastError = { at: new Date(now()).toISOString(), status, message: String(error.message).slice(0, 300) };
      record.status = status;
      record.error = String(error.message).slice(0, 300);
      sendError(res, status, error.message);
    } finally {
      inflight -= 1;
      record.ms = now() - started;
      const u = record.usage;
      if (u) record.usage = { in: u.promptTokenCount, out: u.candidatesTokenCount, thoughts: u.thoughtsTokenCount, cached: u.cachedContentTokenCount };
      log({ event: 'generate', ...record });
    }
  };

  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://bridge');
    if (req.method === 'GET' && url.pathname === '/healthz') {
      let login = null;
      try { const { expiry } = options.login.read(); login = { expiresInSeconds: Math.round((expiry - now()) / 1000) }; } catch (e) { login = { error: e.message }; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, models: allowed, inflight, project: project ? { tier: project.tier } : null, login, stats }));
      return;
    }
    const auth = authorized(req);
    if (!auth.ok) {
      log({ event: 'unauthorized', path: url.pathname, peerUid: auth.uid ?? null });
      return sendError(res, 401, 'caller is not allowed to use this bridge');
    }
    const match = /^\/v1beta\/models\/([^/:]+):(streamGenerateContent|generateContent)$/.exec(url.pathname);
    if (req.method === 'POST' && match) {
      handleGenerate(req, res, decodeURIComponent(match[1]), match[2] === 'streamGenerateContent');
      return;
    }
    sendError(res, 404, 'not found');
  });
}

function readKey() {
  if (process.env.GEMINI_BRIDGE_KEY_FILE) return fs.readFileSync(process.env.GEMINI_BRIDGE_KEY_FILE, 'utf8').trim();
  return process.env.GEMINI_BRIDGE_KEY?.trim() || undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const home = process.env.AGY_HOME || os.homedir();
  const allowUids = (process.env.GEMINI_BRIDGE_ALLOW_USERS || '').split(',').map((s) => s.trim()).filter(Boolean)
    .map((name) => (/^\d+$/.test(name) ? Number(name) : Number(execFileSync('id', ['-u', name], { encoding: 'utf8' }).trim())));
  const server = createBridge({
    key: readKey(), allowUids,
    login: new AccountLogin({ home, agyBin: process.env.AGY_BIN }),
    allowed: (process.env.GEMINI_BRIDGE_MODELS || 'gemini-4-neon').split(',').map((s) => s.trim()).filter(Boolean),
    defaultEffort: process.env.GEMINI_BRIDGE_DEFAULT_EFFORT || 'medium',
    concurrency: Number(process.env.GEMINI_BRIDGE_CONCURRENCY || 4),
    upstream: process.env.GEMINI_BRIDGE_UPSTREAM || DEFAULT_UPSTREAM,
  });
  const port = Number(process.env.GEMINI_BRIDGE_PORT || 25990);
  const host = process.env.GEMINI_BRIDGE_HOST || '127.0.0.1';
  server.listen(port, host, () => log({ event: 'listening', host, port }));
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
}
