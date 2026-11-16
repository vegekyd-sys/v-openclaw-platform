#!/usr/bin/env node
// vrelay: move large files between V, its nodes and Tianyi's Mac through the
// v-relay Worker (Cloudflare R2). Zero dependencies; Node >= 18 on macOS/Linux.
//
//   vrelay put <file>            -> prints an id
//   vrelay get <id|link> [out]   -> downloads, verifies sha256
//   vrelay ls | stat <id> | rm <id>... | link <id> [--hours 24] | health
//   vrelay login --endpoint <url> [--token-file <file>]   (token on stdin otherwise)
//
// Parallel parts/chunks, per-part retry on a fresh connection, slow-part
// restart, resume after interruption, sha256 on both ends, optional upload
// rate limit. See apps/v-relay/README.md.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns';
import net from 'node:net';
import {fileURLToPath} from 'node:url';

const MiB = 1024 * 1024;
const MAX_PART = 95 * MiB;
const MIN_PART = 5 * MiB;
const SLICE = 256 * 1024;
export const VERSION = '0.1.0';

class FatalError extends Error {}
class HttpStatusError extends Error {
  constructor(status, body) { super(`HTTP ${status}: ${String(body).slice(0, 300)}`); this.status = status; }
}

// ---------- parsing helpers ----------

export function parseSize(text) {
  const m = /^(\d+(?:\.\d+)?)\s*([kmgt]?)(i?b)?$/i.exec(String(text).trim());
  if (!m) throw new FatalError(`bad size: ${text}`);
  const mult = {'': 1, k: 1024, m: MiB, g: 1024 * MiB, t: 1024 * 1024 * MiB}[m[2].toLowerCase()];
  return Math.round(Number(m[1]) * mult);
}

// "30mbit" -> bits; "4M"/"4MB" -> bytes; 0/none/off -> unlimited. Returns bytes/s.
export function parseRate(text) {
  if (text == null || text === '') return 0;
  const t = String(text).trim().toLowerCase();
  if (['0', 'none', 'off', 'unlimited'].includes(t)) return 0;
  const m = /^(\d+(?:\.\d+)?)\s*([kmg]?)(bit|bps|b)?(\/s)?$/.exec(t);
  if (!m) throw new FatalError(`bad rate: ${text}`);
  const isBits = m[3] === 'bit' || m[3] === 'bps';
  const mult = isBits ? {'': 1, k: 1e3, m: 1e6, g: 1e9}[m[2]] / 8 : {'': 1, k: 1024, m: MiB, g: 1024 * MiB}[m[2]];
  return Math.round(Number(m[1]) * mult);
}

export function parseArgs(argv) {
  const out = {_: []};
  const flags = new Set(['json', 'force', 'quiet', 'help', 'version', 'route']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { out._.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = (eq > 0 ? a.slice(2, eq) : a.slice(2));
      if (eq > 0) out[key] = a.slice(eq + 1);
      else if (flags.has(key)) out[key] = true;
      else { if (i + 1 >= argv.length) throw new FatalError(`--${key} needs a value`); out[key] = argv[++i]; }
    } else if (a === '-h') out.help = true;
    else if (a === '-q') out.quiet = true;
    else out._.push(a);
  }
  return out;
}

function fmtBytes(n) {
  if (n >= 1024 * MiB) return `${(n / 1024 / MiB).toFixed(2)} GiB`;
  if (n >= MiB) return `${(n / MiB).toFixed(1)} MiB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${n} B`;
}

// ---------- config ----------

export function configPath(env) {
  if (env.VRELAY_CONFIG) return env.VRELAY_CONFIG;
  const base = env.XDG_CONFIG_HOME || path.join(env.HOME || os.homedir(), '.config');
  return path.join(base, 'vrelay', 'config.json');
}

function stateDir(env) {
  const base = env.XDG_CACHE_HOME || path.join(env.HOME || os.homedir(), '.cache');
  return path.join(base, 'vrelay');
}

export function loadConfig(args, env) {
  let file = {};
  const p = configPath(env);
  try {
    const st = fs.statSync(p);
    if ((st.mode & 0o077) !== 0) throw new FatalError(`${p} must not be readable by others (chmod 600)`);
    file = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (error) {
    if (error instanceof FatalError) throw error;
    if (error.code !== 'ENOENT') throw new FatalError(`cannot read ${p}: ${error.message}`);
  }
  let token = env.VRELAY_TOKEN || file.token || '';
  const tokenFile = args['token-file'] || env.VRELAY_TOKEN_FILE || file.tokenFile;
  if (!env.VRELAY_TOKEN && tokenFile) token = fs.readFileSync(tokenFile, 'utf8').trim();
  const pick = (flag, envName, key, fallback) => args[flag] ?? env[envName] ?? file[key] ?? fallback;
  const cfg = {
    endpoint: String(pick('endpoint', 'VRELAY_ENDPOINT', 'endpoint', '')).replace(/\/+$/, ''),
    token,
    putConcurrency: Number(pick('concurrency', 'VRELAY_PUT_CONCURRENCY', 'putConcurrency', 8)),
    getConcurrency: Number(pick('concurrency', 'VRELAY_GET_CONCURRENCY', 'getConcurrency', 16)),
    partSize: parseSize(pick('part-size', 'VRELAY_PART_SIZE', 'partSize', '16M')),
    // Measured from Shanghai 2026-11-16: 8 MiB ranges beat 16 MiB by 25-40% on the same link.
    chunkSize: parseSize(pick('chunk-size', 'VRELAY_CHUNK_SIZE', 'chunkSize', '8M')),
    uploadLimit: parseRate(pick('limit', 'VRELAY_UPLOAD_LIMIT', 'uploadLimit', '0')),
    downloadLimit: parseRate(pick('download-limit', 'VRELAY_DOWNLOAD_LIMIT', 'downloadLimit', '0')),
    family: String(pick('family', 'VRELAY_FAMILY', 'family', '4')),
    idleMs: Number(pick('idle-timeout-ms', 'VRELAY_IDLE_TIMEOUT_MS', 'idleTimeoutMs', 30000)),
    retries: Number(pick('retries', 'VRELAY_RETRIES', 'retries', 8)),
    slowMinMs: Number(pick('slow-min-ms', 'VRELAY_SLOW_MIN_MS', 'slowMinMs', 30000)),
    resolve: String(pick('resolve', 'VRELAY_RESOLVE', 'resolve', '')).split(',').map(s => s.trim()).filter(Boolean),
    allowSmallParts: env.VRELAY_ALLOW_SMALL_PARTS === '1',
  };
  for (const k of ['putConcurrency', 'getConcurrency']) if (!Number.isInteger(cfg[k]) || cfg[k] < 1 || cfg[k] > 64) throw new FatalError(`concurrency must be an integer 1..64 (${k}=${cfg[k]})`);
  if (!['4', '6', 'auto'].includes(cfg.family)) throw new FatalError('family must be 4, 6 or auto');
  return cfg;
}

// ---------- rate limiter ----------

export class Limiter {
  constructor(bytesPerSec, now = () => performance.now()) {
    this.rate = bytesPerSec; this.now = now;
    this.burst = Math.max(SLICE, Math.floor(bytesPerSec / 4));
    this.tokens = this.burst; this.last = now(); this.queue = Promise.resolve();
  }
  take(n) {
    if (!this.rate) return Promise.resolve();
    // Serialize waiters so the shared budget is split fairly.
    const run = async () => {
      for (;;) {
        const t = this.now();
        this.tokens = Math.min(this.burst, this.tokens + (t - this.last) / 1000 * this.rate);
        this.last = t;
        if (this.tokens >= n || (this.tokens >= this.burst)) { this.tokens -= n; return; }
        await new Promise(r => setTimeout(r, Math.max(5, (n - this.tokens) / this.rate * 1000)));
      }
    };
    const p = this.queue.then(run);
    this.queue = p.catch(() => {});
    return p;
  }
}

// ---------- HTTP with per-slot connections ----------

// Route: resolve every address of the relay host, probe them in parallel and
// rank the healthy ones. Seen from Shanghai on 2026-11-16, one of the two
// Cloudflare anycast addresses of a tianyi.live host was reset by the GFW while
// the other worked, so "first address the resolver returns" is not good enough.
export class Route {
  constructor(cfg) { this.cfg = cfg; this.hosts = new Map(); }
  async prepare(url, {timeoutMs = 6000} = {}) {
    const u = new URL(url);
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) || this.hosts.has(host)) return this.hosts.get(host) ?? null;
    let addrs;
    if (this.cfg.resolve?.length) addrs = this.cfg.resolve.map(address => ({address, family: net.isIP(address)})).filter(a => a.family);
    else addrs = await dns.promises.lookup(host, {all: true}).catch(() => []);
    addrs = addrs.filter((a, i) => addrs.findIndex(b => b.address === a.address) === i);
    const pref = this.cfg.family === 'auto' ? 0 : Number(this.cfg.family);
    const ordered = pref ? [...addrs.filter(a => a.family === pref), ...addrs.filter(a => a.family !== pref)] : addrs;
    const probes = await Promise.all(ordered.slice(0, 8).map(a => probe(u, a, timeoutMs).then(ms => ({...a, ms}), error => ({...a, error: error.code || error.message}))));
    const ok = probes.filter(p => p.ms != null);
    const byMs = (a, b) => a.ms - b.ms;
    let healthy = pref ? [...ok.filter(p => p.family === pref).sort(byMs), ...ok.filter(p => p.family !== pref).sort(byMs)] : ok.sort(byMs);
    if (!healthy.length) healthy = ordered; // nothing answered; let retries decide
    const entry = {host, healthy, probes};
    this.hosts.set(host, entry);
    return entry;
  }
  addressFor(host, slot) {
    const entry = this.hosts.get(host);
    if (!entry || !entry.healthy.length) return null;
    return entry.healthy[slot % entry.healthy.length];
  }
  describe() {
    return [...this.hosts.values()].map(e => e.probes.map(p => `${p.address}${p.ms != null ? ` ${Math.round(p.ms)}ms` : ` ${p.error}`}`).join(', ')).join('; ');
  }
}

function pinnedLookup(address) {
  return (host, opts, cb) => {
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    // Always answer asynchronously like dns.lookup: a synchronous answer lets
    // a connect error fire before http.ClientRequest has attached its listener.
    setImmediate(() => {
      if (opts?.all) cb(null, [{address: address.address, family: address.family}]);
      else cb(null, address.address, address.family);
    });
  };
}

function probe(u, address, timeoutMs) {
  const mod = u.protocol === 'https:' ? https : http;
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const req = mod.request(new URL('/v1/health', u), {method: 'GET', agent: false, lookup: pinnedLookup(address), family: address.family, autoSelectFamily: false, timeout: timeoutMs}, res => {
      res.resume();
      res.on('end', () => (res.statusCode < 500 ? resolve(performance.now() - started) : reject(new Error(`HTTP ${res.statusCode}`))));
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), {code: 'TIMEOUT'})));
    req.on('error', reject);
    req.end();
  });
}

// One keep-alive socket per worker slot. reset() drops the socket and moves the
// slot to the next healthy address, so a retry always uses a new connection.
class Connection {
  constructor(cfg) { this.cfg = cfg; this.slot = 0; this.agents = {}; }
  agentFor(protocol) {
    if (this.agents[protocol]) return this.agents[protocol];
    const route = this.cfg.route;
    const slot = this.slot;
    const family = this.cfg.family === 'auto' ? 0 : Number(this.cfg.family);
    const lookup = (host, opts, cb) => {
      if (typeof opts === 'function') { cb = opts; opts = {}; }
      const a = route?.addressFor(host, slot);
      if (a) return pinnedLookup(a)(host, opts, cb);
      return dns.lookup(host, {...opts, family: opts?.all ? 0 : family}, cb);
    };
    const mod = protocol === 'https:' ? https : http;
    return (this.agents[protocol] = new mod.Agent({keepAlive: true, maxSockets: 1, maxFreeSockets: 1, lookup, autoSelectFamily: false}));
  }
  reset(rotate = true) {
    this.destroy();
    if (rotate) this.slot++;
  }
  destroy() { for (const agent of Object.values(this.agents)) agent.destroy(); this.agents = {}; }
}

function send(conn, {method, url, headers = {}, body = null, limiter = null, onSent = null, onData = null, idleMs, register = null}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err, value) => { if (settled) return; settled = true; err ? reject(err) : resolve(value); };
    const u = new URL(url);
    const req = (u.protocol === 'https:' ? https : http).request(u, {method, headers, agent: conn.agentFor(u.protocol)});
    register?.(reason => { req.destroy(new Error(reason)); });
    req.setTimeout(idleMs, () => req.destroy(Object.assign(new Error(`idle ${idleMs} ms`), {code: 'IDLE'})));
    req.on('error', err => done(err));
    req.on('response', res => {
      if (onData && (res.statusCode === 200 || res.statusCode === 206)) {
        (async () => {
          let received = 0;
          for await (const chunk of res) { received += chunk.length; await onData(chunk); }
          if (!res.complete) throw Object.assign(new Error('response ended early'), {code: 'ECONNRESET'});
          return received;
        })().then(received => done(null, {status: res.statusCode, headers: res.headers, received}), err => { res.destroy(); done(err); });
        return;
      }
      const parts = [];
      res.on('data', c => parts.push(c));
      res.on('error', err => done(err));
      res.on('end', () => done(null, {status: res.statusCode, headers: res.headers, body: Buffer.concat(parts)}));
    });
    if (!body || body.length === 0) { req.end(body ?? undefined); return; }
    (async () => {
      for (let off = 0; off < body.length; off += SLICE) {
        if (settled || req.destroyed) return;
        const slice = body.subarray(off, Math.min(body.length, off + SLICE));
        if (limiter) await limiter.take(slice.length);
        if (settled || req.destroyed) return;
        const ok = req.write(slice);
        onSent?.(slice.length);
        if (!ok) await new Promise(r => {
          const finish = () => { req.off('drain', finish); req.off('close', finish); r(); };
          req.on('drain', finish); req.on('close', finish);
        });
      }
      req.end();
    })().catch(err => { req.destroy(err); done(err); });
  });
}

function retryable(error) {
  if (error instanceof FatalError) return false;
  if (error instanceof HttpStatusError) return error.status >= 500 || error.status === 408 || error.status === 429;
  return true;
}

async function api(conn, cfg, method, pathname, {json, headers = {}, auth = true} = {}) {
  const h = {...headers};
  if (auth) h.authorization = `Bearer ${cfg.token}`;
  let body = null;
  if (json !== undefined) { body = Buffer.from(JSON.stringify(json)); h['content-type'] = 'application/json'; h['content-length'] = String(body.length); }
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await send(conn, {method, url: pathname.startsWith('http') ? pathname : cfg.endpoint + pathname, headers: h, body, idleMs: cfg.idleMs});
      if (res.status >= 400) throw new HttpStatusError(res.status, res.body.toString());
      return res;
    } catch (error) {
      lastError = error;
      if (!retryable(error)) throw error;
      conn.reset();
      await sleep(backoff(attempt));
    }
  }
  throw lastError;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const backoff = attempt => Math.min(8000, 300 * 2 ** attempt) * (0.5 + Math.random());

// ---------- parallel scheduler with retry and slow-task restart ----------

// tasks: array of {n, bytes}. run(task, conn, register) -> result. Returns map n->result.
export async function runParallel({tasks, concurrency, cfg, run, onRetry = () => {}, slowFactor = 4, minSlowMs = cfg.slowMinMs ?? 30000, onDone = () => {}}) {
  const queue = [...tasks];
  const results = new Map();
  const attempts = new Map();
  const durations = [];
  const inflight = new Map();
  let fatal = null;
  const median = () => { const s = [...durations].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const watchdog = setInterval(() => {
    if (durations.length < 3) return;
    const limit = Math.max(minSlowMs, slowFactor * median());
    for (const [n, f] of inflight) if (performance.now() - f.started > limit && !f.cancelled) { f.cancelled = true; f.cancel?.(`slow: >${Math.round(limit)} ms`); }
  }, 1000);
  watchdog.unref?.();
  const worker = async () => {
    const conn = new Connection(cfg);
    try {
      while (!fatal && queue.length) {
        const task = queue.shift();
        const flight = {started: performance.now(), cancelled: false, cancel: null};
        inflight.set(task.n, flight);
        try {
          const result = await run(task, conn, fn => { flight.cancel = fn; });
          durations.push(performance.now() - flight.started);
          results.set(task.n, result);
          onDone(task, result);
        } catch (error) {
          const k = (attempts.get(task.n) ?? 0) + 1;
          attempts.set(task.n, k);
          conn.reset(); // retry on a fresh connection, next healthy address
          if (!retryable(error) || k > cfg.retries) { fatal = error; break; }
          onRetry(task, error, k);
          await sleep(flight.cancelled ? 0 : backoff(k - 1));
          queue.push(task);
        } finally {
          inflight.delete(task.n);
        }
      }
    } finally { conn.destroy(); }
  };
  try {
    await Promise.all(Array.from({length: Math.min(concurrency, Math.max(1, tasks.length))}, worker));
  } finally { clearInterval(watchdog); }
  if (fatal) throw fatal;
  return results;
}

// ---------- progress ----------

function progress(stderr, quiet, label, total) {
  const started = performance.now();
  let done = 0, retries = 0, lastPrint = 0;
  const tty = Boolean(stderr.isTTY);
  const print = (final = false) => {
    if (quiet) return;
    const now = performance.now();
    if (!final && now - lastPrint < (tty ? 500 : 5000)) return;
    lastPrint = now;
    const secs = (now - started) / 1000;
    const line = `${label} ${fmtBytes(done)}/${fmtBytes(total)} ${(done / MiB / Math.max(secs, 0.001)).toFixed(2)} MiB/s ${secs.toFixed(1)}s${retries ? ` retries=${retries}` : ''}`;
    stderr.write(tty ? `\r${line}\x1b[K${final ? '\n' : ''}` : `${line}\n`);
  };
  return {
    add(n) { done += n; print(); },
    retry() { retries++; },
    finish() { print(true); return {seconds: (performance.now() - started) / 1000, retries}; },
    get retries() { return retries; },
  };
}

// ---------- hashing ----------

export async function sha256File(file, {start = 0, end} = {}) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    fs.createReadStream(file, {start, end, highWaterMark: 4 * MiB}).on('data', d => hash.update(d)).on('error', reject).on('end', resolve);
  });
  return hash.digest('hex');
}

async function writeJsonAtomic(file, value) {
  await fsp.mkdir(path.dirname(file), {recursive: true, mode: 0o700});
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(value), {mode: 0o600});
  await fsp.rename(tmp, file);
}

async function readJson(file) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return null; }
}

// ---------- put ----------

export async function put(file, args, cfg, io) {
  const st = await fsp.stat(file);
  if (!st.isFile()) throw new FatalError(`${file} is not a regular file`);
  const size = st.size;
  const name = args.name || path.basename(file);
  let partSize = cfg.partSize;
  // Keep under R2's 10000-part limit for very large files.
  while (Math.ceil(size / partSize) > 10000) partSize *= 2;
  if (partSize > MAX_PART) throw new FatalError(`part size ${fmtBytes(partSize)} exceeds ${fmtBytes(MAX_PART)}`);
  if (partSize < MIN_PART && !cfg.allowSmallParts) throw new FatalError(`part size must be at least ${fmtBytes(MIN_PART)} (R2 minimum)`);
  const limiter = cfg.uploadLimit ? new Limiter(cfg.uploadLimit) : null;
  const real = await fsp.realpath(file);
  const stateKey = crypto.createHash('sha256').update(JSON.stringify([cfg.endpoint, real, size, st.mtimeMs, partSize])).digest('hex').slice(0, 32);
  const statePath = path.join(stateDir(io.env), 'put', `${stateKey}.json`);
  let state = await readJson(statePath);

  const hashStarted = performance.now();
  const sha256 = state?.sha256 ?? await sha256File(file);
  const hashSeconds = (performance.now() - hashStarted) / 1000;
  const prog = progress(io.stderr, args.quiet, `put ${name}`, size);
  const conn = new Connection(cfg);
  try {
    if (size <= partSize) {
      const body = size ? await fsp.readFile(file) : Buffer.alloc(0);
      let res;
      for (let attempt = 0; ; attempt++) {
        try {
          res = await send(conn, {method: 'POST', url: `${cfg.endpoint}/v1/objects`, body, limiter, idleMs: cfg.idleMs,
            headers: {authorization: `Bearer ${cfg.token}`, 'content-length': String(size), 'x-relay-sha256': sha256, 'x-relay-name': encodeURIComponent(name)}});
          if (res.status >= 400) throw new HttpStatusError(res.status, res.body.toString());
          break;
        } catch (error) {
          conn.reset();
          if (!retryable(error) || attempt >= cfg.retries) throw error;
          prog.retry(); await sleep(backoff(attempt));
        }
      }
      prog.add(size);
      const info = JSON.parse(res.body.toString());
      return {...info, ...prog.finish(), hashSeconds, parts: 1, concurrency: 1};
    }

    const parts = Math.ceil(size / partSize);
    if (state && (state.size !== size || state.partSize !== partSize || state.endpoint !== cfg.endpoint)) state = null;
    if (!state) {
      const res = await api(conn, cfg, 'POST', '/v1/uploads', {json: {name, size, sha256, partSize}});
      const created = JSON.parse(res.body.toString());
      state = {endpoint: cfg.endpoint, id: created.id, uploadId: created.uploadId, size, partSize, sha256, name, etags: {}};
      await writeJsonAtomic(statePath, state);
    } else if (!args.quiet) {
      io.stderr.write(`resuming ${state.id}: ${Object.keys(state.etags).length}/${parts} parts already uploaded\n`);
    }
    const already = Object.keys(state.etags).reduce((sum, n) => sum + Math.min(partSize, size - (Number(n) - 1) * partSize), 0);
    prog.add(already);
    const tasks = [];
    for (let n = 1; n <= parts; n++) if (!state.etags[n]) tasks.push({n, offset: (n - 1) * partSize, length: Math.min(partSize, size - (n - 1) * partSize)});
    const fh = await fsp.open(file, 'r');
    let saving = Promise.resolve();
    try {
      await runParallel({
        tasks, concurrency: cfg.putConcurrency, cfg,
        onRetry: (task, error, k) => { prog.retry(); if (!args.quiet && io.env.VRELAY_DEBUG) io.stderr.write(`\npart ${task.n} attempt ${k}: ${error.message}\n`); },
        onDone: (task, etag) => { state.etags[task.n] = etag; saving = saving.then(() => writeJsonAtomic(statePath, state)); },
        run: async (task, c, register) => {
          const buf = Buffer.allocUnsafe(task.length);
          const {bytesRead} = await fh.read(buf, 0, task.length, task.offset);
          if (bytesRead !== task.length) throw new FatalError(`${file} changed while uploading`);
          const res = await send(c, {method: 'PUT', url: `${cfg.endpoint}/v1/uploads/${state.id}/parts/${task.n}`, body: buf, limiter, idleMs: cfg.idleMs, register,
            headers: {authorization: `Bearer ${cfg.token}`, 'content-length': String(task.length), 'x-relay-upload-id': state.uploadId}});
          if (res.status === 404) throw new FatalError(`upload ${state.id} no longer exists on the relay (expired or aborted); run put again`);
          if (res.status >= 400) throw new HttpStatusError(res.status, res.body.toString());
          prog.add(task.length);
          return JSON.parse(res.body.toString()).etag;
        },
      });
    } catch (error) {
      if (error instanceof FatalError && /no longer exists/.test(error.message)) await fsp.rm(statePath, {force: true});
      throw error;
    } finally {
      await fh.close();
      await saving;
    }
    const partsList = Array.from({length: parts}, (_, i) => ({partNumber: i + 1, etag: state.etags[i + 1]}));
    const res = await api(conn, cfg, 'POST', `/v1/uploads/${state.id}/complete`, {json: {uploadId: state.uploadId, parts: partsList}});
    await fsp.rm(statePath, {force: true});
    const info = JSON.parse(res.body.toString());
    if (info.sha256 !== sha256 || info.size !== size) throw new FatalError(`relay reports ${info.size} bytes / ${info.sha256}, expected ${size} / ${sha256}`);
    return {...info, ...prog.finish(), hashSeconds, parts, concurrency: cfg.putConcurrency};
  } finally { conn.destroy(); }
}

// ---------- get ----------

function objectUrl(cfg, ref) {
  if (/^https?:\/\//.test(ref)) {
    const u = new URL(ref);
    const id = /^\/v1\/objects\/([a-z0-9]{6,32})$/.exec(u.pathname)?.[1];
    if (!id) throw new FatalError(`not a v-relay object link: ${u.origin}${u.pathname}`);
    return {url: u.toString(), id, auth: false};
  }
  if (!/^[a-z0-9]{6,32}$/.test(ref)) throw new FatalError(`bad id: ${ref}`);
  if (!cfg.endpoint) throw new FatalError('no endpoint configured (vrelay login)');
  return {url: `${cfg.endpoint}/v1/objects/${ref}`, id: ref, auth: true};
}

export async function get(ref, outArg, args, cfg, io) {
  const target = objectUrl(cfg, ref);
  const auth = target.auth ? {authorization: `Bearer ${cfg.token}`} : {};
  const conn = new Connection(cfg);
  let head;
  try { head = await api(conn, cfg, 'HEAD', target.url, {auth: false, headers: auth}); }
  finally { conn.destroy(); }
  const size = Number(head.headers['x-relay-size'] ?? head.headers['content-length']);
  const sha256 = head.headers['x-relay-sha256'];
  const etag = head.headers.etag ?? '';
  const name = (() => { try { return decodeURIComponent(head.headers['x-relay-name'] ?? '') || target.id; } catch { return target.id; } })();
  let out = outArg || path.basename(name) || target.id;
  if (outArg && fs.existsSync(outArg) && fs.statSync(outArg).isDirectory()) out = path.join(outArg, path.basename(name) || target.id);
  if (fs.existsSync(out) && !args.force) throw new FatalError(`${out} exists (use --force)`);
  const partial = `${out}.vrelay-part`;
  const statePath = `${out}.vrelay-state.json`;
  const chunkSize = cfg.chunkSize;
  if (chunkSize < 64 * 1024 || chunkSize > 256 * MiB) throw new FatalError('chunk size must be 64K..256M');
  let state = await readJson(statePath);
  if (!state || state.id !== target.id || state.etag !== etag || state.size !== size || state.chunkSize !== chunkSize || !fs.existsSync(partial)) {
    state = {id: target.id, etag, size, chunkSize, done: []};
    const fh = await fsp.open(partial, 'w');
    await fh.truncate(size); await fh.close();
    await writeJsonAtomic(statePath, state);
  } else if (!args.quiet) {
    io.stderr.write(`resuming ${target.id}: ${state.done.length}/${Math.ceil(size / chunkSize)} chunks already downloaded\n`);
  }
  const done = new Set(state.done);
  const chunks = Math.max(1, Math.ceil(size / chunkSize));
  const tasks = [];
  for (let n = 0; n < chunks; n++) if (!done.has(n) && size > 0) tasks.push({n, offset: n * chunkSize, length: Math.min(chunkSize, size - n * chunkSize)});
  const prog = progress(io.stderr, args.quiet, `get ${name}`, size);
  prog.add(size - tasks.reduce((s, t) => s + t.length, 0));
  const limiter = cfg.downloadLimit ? new Limiter(cfg.downloadLimit) : null;
  const fh = await fsp.open(partial, 'r+');
  let saving = Promise.resolve();
  try {
    await runParallel({
      tasks, concurrency: cfg.getConcurrency, cfg,
      onRetry: (task, error, k) => { prog.retry(); if (!args.quiet && io.env.VRELAY_DEBUG) io.stderr.write(`\nchunk ${task.n} attempt ${k}: ${error.message}\n`); },
      onDone: task => { done.add(task.n); state.done = [...done]; saving = saving.then(() => writeJsonAtomic(statePath, state)); },
      run: async (task, c, register) => {
        let pos = task.offset;
        let got = 0;
        try {
          const res = await send(c, {method: 'GET', url: target.url, idleMs: cfg.idleMs, register,
            headers: {...auth, range: `bytes=${task.offset}-${task.offset + task.length - 1}`},
            onData: async chunk => {
              if (limiter) await limiter.take(chunk.length);
              if (got + chunk.length > task.length) throw new FatalError('relay sent more bytes than requested');
              await fh.write(chunk, 0, chunk.length, pos);
              pos += chunk.length; got += chunk.length; prog.add(chunk.length);
            }});
          if (res.status === 200 && task.length !== size) throw new FatalError('relay ignored the Range header');
          if (res.status >= 400) throw new HttpStatusError(res.status, res.body?.toString() ?? '');
          if (got !== task.length) throw Object.assign(new Error(`short chunk ${got}/${task.length}`), {code: 'SHORT'});
        } catch (error) {
          prog.add(-got);
          throw error;
        }
      },
    });
  } finally {
    await saving;
    await fh.sync().catch(() => {});
    await fh.close();
  }
  const stats = prog.finish();
  const verifyStarted = performance.now();
  const actual = await sha256File(partial);
  const verifySeconds = (performance.now() - verifyStarted) / 1000;
  if (sha256 && actual !== sha256) {
    await fsp.rm(statePath, {force: true});
    await fsp.rm(partial, {force: true});
    throw new FatalError(`sha256 mismatch: got ${actual}, relay says ${sha256}; partial file removed`);
  }
  await fsp.rename(partial, out);
  await fsp.rm(statePath, {force: true});
  return {id: target.id, out, size, sha256: actual, verified: Boolean(sha256), ...stats, verifySeconds, concurrency: cfg.getConcurrency};
}

// ---------- small commands ----------

async function login(args, io) {
  const endpoint = String(args.endpoint ?? '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(endpoint)) throw new FatalError('--endpoint https://... required');
  let token;
  if (args['token-file']) token = fs.readFileSync(args['token-file'], 'utf8').trim();
  else { const chunks = []; for await (const c of io.stdin) chunks.push(c); token = Buffer.concat(chunks).toString().trim(); }
  if (token.length < 24) throw new FatalError('token missing or too short (pass it on stdin or --token-file)');
  const p = configPath(io.env);
  const existing = await readJson(p) ?? {};
  await fsp.mkdir(path.dirname(p), {recursive: true, mode: 0o700});
  await fsp.chmod(path.dirname(p), 0o700);
  const next = {...existing, endpoint, token};
  for (const [flag, key] of [['limit', 'uploadLimit'], ['family', 'family']]) if (args[flag]) next[key] = args[flag];
  await writeJsonAtomic(p, next);
  await fsp.chmod(p, 0o600);
  return {config: p, endpoint};
}

function out(io, args, value, text) {
  io.stdout.write(args.json ? `${JSON.stringify(value)}\n` : `${text}\n`);
}

const HELP = `vrelay ${VERSION} - large file relay over Cloudflare R2 (apps/v-relay)

  vrelay put <file> [--name n] [--concurrency 8] [--part-size 16M] [--limit 30mbit]
  vrelay get <id|signed-link> [out|dir] [--concurrency 16] [--force]
  vrelay ls | stat <id> | rm <id>... | link <id> [--hours 24] | health
  vrelay login --endpoint https://relay.example [--token-file f] [--limit 30mbit]   (token on stdin)

Options: --json  -q/--quiet  --family 4|6|auto (default 4)  --resolve ip1,ip2  --route (print probes)  --download-limit 0
Config: ~/.config/vrelay/config.json (mode 600); env VRELAY_ENDPOINT, VRELAY_TOKEN(_FILE), VRELAY_UPLOAD_LIMIT.
Resume: re-run the same put/get after an interruption. Objects expire on the relay after 7 days.`;

export async function main(argv, io = {stdout: process.stdout, stderr: process.stderr, stdin: process.stdin, env: process.env}) {
  const args = parseArgs(argv);
  const [cmd, ...rest] = args._;
  if (args.version) { io.stdout.write(`${VERSION}\n`); return 0; }
  if (!cmd || args.help || cmd === 'help') { io.stdout.write(`${HELP}\n`); return cmd || args.help ? 0 : 2; }
  if (cmd === 'login') { const r = await login(args, io); out(io, args, r, `saved ${r.config}`); return 0; }
  const cfg = loadConfig(args, io.env);
  const needsAuth = !(cmd === 'get' && /^https?:\/\//.test(rest[0] ?? '')) && cmd !== 'health';
  if (needsAuth && (!cfg.endpoint || !cfg.token)) throw new FatalError(`not configured: run vrelay login (config ${configPath(io.env)})`);
  cfg.route = new Route(cfg);
  const target = cmd === 'get' && /^https?:\/\//.test(rest[0] ?? '') ? rest[0] : cfg.endpoint;
  if (target) {
    await cfg.route.prepare(target);
    if (io.env.VRELAY_DEBUG || args.route) io.stderr.write(`route: ${cfg.route.describe() || 'direct'}\n`);
  }
  const conn = () => new Connection(cfg);
  switch (cmd) {
    case 'put': {
      if (rest.length !== 1) throw new FatalError('usage: vrelay put <file>');
      const r = await put(rest[0], args, cfg, io);
      if (!args.quiet && !args.json) io.stderr.write(`${r.id} ${fmtBytes(r.size)} in ${r.seconds.toFixed(1)}s (${(r.size / MiB / r.seconds).toFixed(2)} MiB/s) sha256 ${r.sha256}\n`);
      out(io, args, r, r.id);
      return 0;
    }
    case 'get': {
      if (rest.length < 1 || rest.length > 2) throw new FatalError('usage: vrelay get <id|link> [out]');
      const r = await get(rest[0], rest[1], args, cfg, io);
      if (!args.quiet && !args.json) io.stderr.write(`sha256 ${r.verified ? 'verified' : 'computed (relay had none)'} ${r.sha256}\n`);
      out(io, args, r, r.out);
      return 0;
    }
    case 'ls': {
      const objects = [];
      let cursor = '';
      do {
        const res = await api(conn(), cfg, 'GET', `/v1/objects${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
        const page = JSON.parse(res.body.toString());
        objects.push(...page.objects); cursor = page.cursor;
      } while (cursor);
      out(io, args, objects, objects.map(o => `${o.id}  ${fmtBytes(o.size).padStart(10)}  ${o.uploaded ?? ''}  ${o.by ?? ''}  ${o.name ?? ''}`).join('\n') || '(empty)');
      return 0;
    }
    case 'stat': {
      const t = objectUrl(cfg, rest[0] ?? '');
      const res = await api(conn(), cfg, 'HEAD', t.url, {auth: false, headers: t.auth ? {authorization: `Bearer ${cfg.token}`} : {}});
      const info = {id: t.id, size: Number(res.headers['x-relay-size']), sha256: res.headers['x-relay-sha256'] ?? null, name: decodeURIComponent(res.headers['x-relay-name'] ?? ''), etag: res.headers.etag ?? null};
      out(io, args, info, `${info.id} ${fmtBytes(info.size)} ${info.sha256} ${info.name}`);
      return 0;
    }
    case 'rm': {
      if (!rest.length) throw new FatalError('usage: vrelay rm <id>...');
      for (const id of rest) { objectUrl(cfg, id); await api(conn(), cfg, 'DELETE', `/v1/objects/${id}`); out(io, args, {deleted: id}, `deleted ${id}`); }
      return 0;
    }
    case 'link': {
      objectUrl(cfg, rest[0] ?? '');
      const hours = Number(args.hours ?? 24);
      const res = await api(conn(), cfg, 'POST', `/v1/objects/${rest[0]}/link`, {json: {ttlSeconds: Math.round(hours * 3600)}});
      const r = JSON.parse(res.body.toString());
      out(io, args, r, r.url);
      return 0;
    }
    case 'health': {
      const res = await api(conn(), cfg, 'GET', '/v1/health', {auth: false});
      out(io, args, JSON.parse(res.body.toString()), res.body.toString());
      return 0;
    }
    default:
      throw new FatalError(`unknown command ${cmd}\n${HELP}`);
  }
}

const invokedDirectly = (() => {
  try { return fs.realpathSync(process.argv[1] ?? '') === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();

if (invokedDirectly) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => {
    process.stderr.write(`vrelay: ${error.message}\n`);
    process.exitCode = error instanceof FatalError || error instanceof HttpStatusError ? 1 : 3;
  });
}
