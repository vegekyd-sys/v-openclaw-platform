#!/usr/bin/env node
// v-link-preview: answers Feishu's url.preview.get for links V produces.
//
//   node server.mjs /etc/v-link-preview/config.json
//
// The Gateway owns the only Feishu long connection, so it receives the callback
// and forwards it here with a short timeout (lab/feishu-link-preview.mjs). All
// reads and card building happen in this process: if it is slow or down, the
// Gateway is unaffected and the link stays a plain link. Loopback only. See README.md.
import fs from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { deliveryFacts, deliveryPreview, parseLink, projectFacts, projectPreview } from "./lib/preview.mjs";

const DEFAULTS = {
  bind: "127.0.0.1",
  port: 23970,
  upstreamTimeoutMs: 1500,
  cacheMs: 15_000,
  staleMs: 600_000,
  refreshMs: 60_000,
  tokenTtlMs: 7 * 86_400_000,
  maxTokens: 1000,
  maxManifestBytes: 1_048_576,
  feishuApiBaseUrl: "https://open.feishu.cn",
};

export function loadConfig(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!raw.publicBaseUrl || !raw.boardApiBaseUrl) throw new Error("publicBaseUrl and boardApiBaseUrl are required");
  const credentials = raw.feishuCredentialsFile ? JSON.parse(fs.readFileSync(raw.feishuCredentialsFile, "utf8")) : null;
  return { ...DEFAULTS, ...raw, credentials };
}

async function readJson(response, limit) {
  const text = await response.text();
  if (text.length > limit) throw new Error("response too large");
  return JSON.parse(text);
}

export function createPreviewService(config, { fetchImpl = fetch, now = Date.now, log = console.log } = {}) {
  const settings = { ...DEFAULTS, ...config };
  const cache = new Map();
  const inFlight = new Map();
  // Project key → the previews to re-pull when its state changes.
  const tracked = new Map();
  let feishuToken = null;
  let tokenCount = 0;

  const request = (url, init = {}) => fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(settings.upstreamTimeoutMs), ...init });

  async function readProject(link) {
    const base = settings.boardApiBaseUrl.replace(/\/+$/u, "");
    const id = encodeURIComponent(link.projectId);
    const [project, decisions] = await Promise.all([
      request(`${base}/api/instances/${id}`),
      // The count is an extra: a project still has a state without it.
      request(`${base}/api/decisions?instanceId=${id}&status=open`).then((response) => (response.ok ? response.json() : null)).catch(() => null),
    ]);
    if (project.status === 404) return null;
    if (!project.ok) throw new Error(`board returned ${project.status}`);
    return projectFacts(await project.json(), decisions?.decisions?.length ?? 0);
  }

  async function readDelivery(link) {
    const response = await request(link.manifestUrl);
    if (!response.ok) throw new Error(`manifest returned ${response.status}`);
    return deliveryFacts(await readJson(response, settings.maxManifestBytes));
  }

  function remember(key, entry) {
    cache.delete(key);
    cache.set(key, entry);
    if (cache.size > 500) cache.delete(cache.keys().next().value);
  }

  // Every viewer of a link pulls separately (a big group means a burst), so
  // concurrent pulls share one read and a recent read answers without one.
  async function factsFor(link) {
    const cached = cache.get(link.key);
    if (cached && now() - cached.at < settings.cacheMs) return { facts: cached.facts, ageMs: 0 };
    let pending = inFlight.get(link.key);
    if (!pending) {
      pending = (link.kind === "project" ? readProject(link) : readDelivery(link))
        .then((facts) => {
          remember(link.key, { facts, at: now() });
          return facts;
        })
        .finally(() => inFlight.delete(link.key));
      inFlight.set(link.key, pending);
    }
    try {
      return { facts: await pending, ageMs: 0 };
    } catch (error) {
      if (cached?.facts && now() - cached.at < settings.staleMs) return { facts: cached.facts, ageMs: now() - cached.at };
      log(`link-preview: ${link.kind} read failed: ${error.message}`);
      return { facts: null, ageMs: 0 };
    }
  }

  function track(link, facts, previewToken) {
    if (link.kind !== "project" || !previewToken || !settings.credentials) return;
    let entry = tracked.get(link.key);
    if (!entry) {
      entry = { link, tokens: new Map(), fingerprint: JSON.stringify(facts) };
      tracked.set(link.key, entry);
    }
    if (!entry.tokens.has(previewToken)) {
      if (tokenCount >= settings.maxTokens) return;
      tokenCount += 1;
    }
    entry.tokens.set(previewToken, now());
  }

  async function preview({ url, previewToken }) {
    const link = parseLink(url, settings.publicBaseUrl);
    if (!link) return null;
    const { facts, ageMs } = await factsFor(link);
    if (!facts) return null;
    track(link, facts, previewToken);
    return link.kind === "project" ? projectPreview(facts, link.url, ageMs) : deliveryPreview(facts, link.url, ageMs);
  }

  async function tenantToken() {
    if (feishuToken && now() < feishuToken.expiresAt) return feishuToken.value;
    const response = await request(`${settings.feishuApiBaseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app_id: settings.credentials.appId, app_secret: settings.credentials.appSecret }),
    });
    const body = await response.json();
    if (body.code !== 0) throw new Error(`tenant token: ${body.code}`);
    feishuToken = { value: body.tenant_access_token, expiresAt: now() + (body.expire - 300) * 1000 };
    return feishuToken.value;
  }

  // Feishu has no push for previews: this asks clients showing them to pull again.
  async function repull(tokens) {
    for (let index = 0; index < tokens.length; index += 10) {
      const response = await request(`${settings.feishuApiBaseUrl}/open-apis/im/v2/url_previews/batch_update`, {
        method: "POST",
        headers: { authorization: `Bearer ${await tenantToken()}`, "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ preview_tokens: tokens.slice(index, index + 10) }),
      });
      const body = await response.json();
      if (body.code !== 0) throw new Error(`url preview update: ${body.code} ${body.msg ?? ""}`);
    }
  }

  async function refreshTracked() {
    for (const [key, entry] of tracked) {
      for (const [token, seenAt] of entry.tokens) {
        if (now() - seenAt > settings.tokenTtlMs) {
          entry.tokens.delete(token);
          tokenCount -= 1;
        }
      }
      if (entry.tokens.size === 0) {
        tracked.delete(key);
        continue;
      }
      const { facts, ageMs } = await factsFor(entry.link);
      if (!facts || ageMs) continue;
      const fingerprint = JSON.stringify(facts);
      if (fingerprint === entry.fingerprint) continue;
      try {
        await repull([...entry.tokens.keys()]);
        entry.fingerprint = fingerprint;
        log(`link-preview: ${key} changed, asked ${entry.tokens.size} previews to pull again`);
      } catch (error) {
        log(`link-preview: ${key} update failed: ${error.message}`);
      }
    }
  }

  return { preview, refreshTracked, stats: () => ({ projects: tracked.size, tokens: tokenCount, cached: cache.size }) };
}

export function startServer(config, options) {
  const service = createPreviewService(config, options);
  const log = options?.log ?? console.log;
  const server = http.createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };
    try {
      if (req.method === "GET" && req.url === "/healthz") return reply(200, { ok: true, ...service.stats() });
      if (req.method !== "POST" || req.url !== "/v1/preview") return reply(404, { error: "not found" });
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16_384) return reply(413, { error: "too large" });
        chunks.push(chunk);
      }
      const started = Date.now();
      const result = await service.preview(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      log(`link-preview: answered ${result ? "card" : "nothing"} in ${Date.now() - started} ms`);
      return result ? reply(200, result) : reply(204);
    } catch (error) {
      log(`link-preview: request failed: ${error.message}`);
      return reply(500, { error: "failed" });
    }
  });
  const timer = config.credentials ? setInterval(() => service.refreshTracked().catch((error) => log(`link-preview: refresh failed: ${error.message}`)), config.refreshMs ?? DEFAULTS.refreshMs) : null;
  timer?.unref();
  server.on("close", () => clearInterval(timer));
  return new Promise((resolve) => server.listen(config.port ?? DEFAULTS.port, config.bind ?? DEFAULTS.bind, () => resolve({ server, service })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig(process.argv[2]);
  await startServer(config);
  console.log(`link-preview: listening on ${config.bind}:${config.port}; updates ${config.credentials ? "on" : "off"}`);
}
