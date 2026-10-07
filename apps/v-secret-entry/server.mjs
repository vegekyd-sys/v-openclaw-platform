#!/usr/bin/env node
// v-secret-entry: a one-time HTTPS link for typing a credential V asked for,
// on channels without a masked input (Telegram, DingTalk, WeCom).
//
//   node server.mjs /etc/v-secret-entry/config.json
//
// Public side (behind cloudflared, path prefix): the entry page and its two
// calls, info and submit. The token travels in the URL fragment and in POST
// bodies only, so it stays out of access logs, link previews and referrers.
// Admin side (loopback only, bearer token): issue and revoke links, read the
// audit. Submitting calls the Gateway's `question.resolve`; the value is
// neither stored nor logged here. See README.md.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LinkError, LinkRegistry } from "./lib/links.mjs";
import { createGatewayResolver } from "./lib/gateway.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, "public");
const ASSETS = { "/": ["index.html", "text/html; charset=utf-8"], "/app.js": ["app.js", "text/javascript; charset=utf-8"], "/app.css": ["app.css", "text/css; charset=utf-8"] };
const PAGE_HEADERS = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

export function loadConfig(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const config = {
    bind: "127.0.0.1",
    publicBind: raw.bind ?? "127.0.0.1",
    publicPort: 23960,
    adminPort: 23961,
    publicBaseUrl: "http://127.0.0.1:23960",
    pathPrefix: "/secret-entry",
    limits: {},
    ...raw,
  };
  for (const key of ["stateDir", "adminTokenFile"]) {
    if (typeof config[key] !== "string" || !config[key]) throw new Error(`config.${key} is required`);
  }
  config.pathPrefix = config.pathPrefix.replace(/\/+$/u, "");
  return config;
}

const readSecretFile = (file) => fs.readFileSync(file, "utf8").split(/\r?\n/u)[0].trim();

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(data), ...PAGE_HEADERS });
  res.end(data);
}

function readJsonBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new LinkError("too-long", 413, "内容太长，无法保存。"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new LinkError("bad-request", 400, "请求格式不对。"));
      }
    });
    req.on("error", reject);
  });
}

function clientIp(req) {
  const cf = req.headers["cf-connecting-ip"];
  return typeof cf === "string" && cf.trim() ? cf.trim() : req.socket?.remoteAddress ?? null;
}

export function createService(config, { resolve, log = console } = {}) {
  fs.mkdirSync(config.stateDir, { recursive: true, mode: 0o700 });
  const adminToken = readSecretFile(config.adminTokenFile);
  if (adminToken.length < 16) throw new Error("admin token is too short");
  const auditFile = path.join(config.stateDir, "audit.jsonl");
  const registry = new LinkRegistry({
    limits: config.limits,
    onAudit: (entry) => fs.appendFileSync(auditFile, `${JSON.stringify(entry)}\n`, { mode: 0o600 }),
  });
  const resolveQuestion = resolve ?? createGatewayResolver({ openclawDist: config.openclawDist });
  const prefix = config.pathPrefix;
  const linkFor = (token) => `${config.publicBaseUrl.replace(/\/+$/u, "")}${prefix}/#${token}`;
  const bodyLimit = registry.limits.maxValueLength * 6 + 4096; // JSON escapes, token

  // ---------------- public ----------------
  const publicServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    let route = url.pathname;
    if (prefix && (route === prefix || route.startsWith(`${prefix}/`))) route = route.slice(prefix.length) || "/";
    else if (prefix) return json(res, 404, { error: "not_found" });
    try {
      if (req.method === "GET" && ASSETS[route]) {
        if (route === "/" && !url.pathname.endsWith("/")) {
          res.writeHead(308, { location: `${prefix}/`, ...PAGE_HEADERS });
          return res.end();
        }
        const [file, type] = ASSETS[route];
        const data = fs.readFileSync(path.join(PUBLIC_DIR, file));
        res.writeHead(200, { "content-type": type, "content-length": data.length, ...PAGE_HEADERS });
        return res.end(data);
      }
      if (req.method === "GET" && route === "/healthz") return json(res, 200, { ok: true });
      if (req.method === "POST" && route === "/api/info") {
        const body = await readJsonBody(req, 4096);
        return json(res, 200, registry.describe(body.token));
      }
      if (req.method === "POST" && route === "/api/submit") {
        const body = await readJsonBody(req, bodyLimit);
        const result = await registry.submit(body.token, body.value, resolveQuestion, { ip: clientIp(req) });
        return json(res, 200, { ok: true, ...result });
      }
      return json(res, 404, { error: "not_found" });
    } catch (error) {
      if (error instanceof LinkError) return json(res, error.status, { error: error.code, message: error.message });
      log.error?.(`v-secret-entry: public request failed: ${error?.name ?? "error"}`);
      return json(res, 500, { error: "internal", message: "出错了，请稍后再试。" });
    }
  });

  // ---------------- admin ----------------
  const adminServer = http.createServer(async (req, res) => {
    if (String(req.headers.authorization ?? "") !== `Bearer ${adminToken}`) return json(res, 401, { error: "unauthorized" });
    const url = new URL(req.url, "http://localhost");
    const match = url.pathname.match(/^\/v1\/links\/(sl_[a-f0-9]{12})$/u);
    try {
      if (req.method === "POST" && url.pathname === "/v1/links") {
        const { link, token } = registry.issue(await readJsonBody(req, 64 * 1024));
        return json(res, 200, { id: link.id, url: linkFor(token), expiresAtMs: link.expiresAtMs });
      }
      if (req.method === "DELETE" && match) return json(res, registry.revoke(match[1]) ? 200 : 404, { ok: true });
      if (req.method === "GET" && url.pathname === "/v1/links") return json(res, 200, { links: registry.list() });
      if (req.method === "GET" && url.pathname === "/v1/audit") {
        const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 1000);
        let lines = [];
        try { lines = fs.readFileSync(auditFile, "utf8").trim().split("\n").filter(Boolean); } catch { /* no audit yet */ }
        return json(res, 200, { entries: lines.slice(-limit).map((line) => JSON.parse(line)) });
      }
      return json(res, 404, { error: "not_found" });
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  });

  const timer = setInterval(() => registry.tick(), 30_000);
  timer.unref();

  return {
    registry,
    linkFor,
    async listen() {
      await new Promise((resolve, reject) => {
        publicServer.once("error", reject);
        publicServer.listen(config.publicPort, config.publicBind, resolve);
      });
      await new Promise((resolve, reject) => {
        adminServer.once("error", reject);
        adminServer.listen(config.adminPort, config.bind, resolve);
      });
      return { publicPort: publicServer.address().port, adminPort: adminServer.address().port };
    },
    async close() {
      clearInterval(timer);
      publicServer.closeAllConnections?.();
      adminServer.closeAllConnections?.();
      await Promise.all([
        new Promise((resolve) => publicServer.close(() => resolve())),
        new Promise((resolve) => adminServer.close(() => resolve())),
      ]);
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? process.env.V_SECRET_ENTRY_CONFIG;
  if (!file) {
    console.error("usage: server.mjs <config.json>");
    process.exit(2);
  }
  const config = loadConfig(file);
  const service = createService(config);
  const ports = await service.listen();
  console.log(JSON.stringify({ event: "listening", ...ports, prefix: config.pathPrefix, publicBind: config.publicBind }));
  const stop = async () => {
    await service.close();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
