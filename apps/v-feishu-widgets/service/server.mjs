// Hosts show_widget documents for Feishu: a public page that runs the widget
// and a loopback admin API the presenter writes to. It stays a separate process
// so a stuck Gateway cannot take the page down and the Gateway stays off the
// public internet. Design: docs/feishu-widget-host-20261030.md.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FeishuIdentity, IdentityError } from "./lib/feishu-identity.mjs";
import { WidgetStore, safeEqual } from "./lib/store.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SHELL = fs.readFileSync(path.join(here, "public", "shell.html"), "utf8");
const SHELL_JS = fs.readFileSync(path.join(here, "public", "shell.js"), "utf8");
const SDK_ORIGIN = "https://lf1-cdn-tos.bytegoofy.com";
const MAX_BODY = 512 * 1024;
const MAX_PROMPT_CHARS = 4000;
const PROMPTS_PER_MINUTE = 6;
const VIEWER_TTL_MS = 2 * 60 * 60 * 1000;

const readJson = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); return; }
    chunks.push(chunk);
  });
  req.on("end", () => {
    try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
    catch { reject(Object.assign(new Error("bad json"), { status: 400 })); }
  });
  req.on("error", reject);
});

const sendJson = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/gu, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function createWidgetHost({ pathPrefix = "/v-widgets", publicBaseUrl, adminToken, stateDir, identity, deliver, now = Date.now, log = console.error }) {
  const store = new WidgetStore({ stateDir, now });
  const viewers = new Map(); // ticket -> { widgetId, openId, name, expiresAt }
  const buckets = new Map();
  const auditPath = path.join(stateDir, "audit.jsonl");
  const audit = (entry) => { try { fs.appendFileSync(auditPath, `${JSON.stringify({ at: new Date(now()).toISOString(), ...entry })}\n`, { mode: 0o600 }); } catch (error) { log(`audit: ${error.message}`); } };

  const shellHeaders = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    // 'unsafe-eval' is for Feishu's h5-js-sdk, which evals at load (without it window.h5sdk never
    // appears). This page holds no untrusted content: the widget is in the sandboxed frame.
    "content-security-policy": `default-src 'none'; script-src 'self' 'unsafe-eval' ${SDK_ORIGIN}; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'`,
  };

  const allowed = (key) => {
    const at = now();
    const hits = (buckets.get(key) ?? []).filter((t) => at - t < 60_000);
    if (hits.length >= PROMPTS_PER_MINUTE) return false;
    hits.push(at);
    buckets.set(key, hits);
    return true;
  };

  const publicRoutes = async (req, res, route) => {
    if (req.method === "GET" && route === "/healthz") return sendJson(res, 200, { ok: true });
    if (req.method === "GET" && route === "/shell.js") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache", "x-content-type-options": "nosniff" });
      return res.end(SHELL_JS);
    }
    let match = route.match(/^\/w\/([A-Za-z0-9_-]{32,64})$/u);
    if (req.method === "GET" && match) {
      const widget = store.get(match[1]);
      if (!widget) { res.writeHead(404, shellHeaders); return res.end("<!doctype html><meta charset=utf-8><title>组件已过期</title><p style='font:15px sans-serif;padding:24px'>这个组件已过期，请让 V 重新生成。</p>"); }
      res.writeHead(200, shellHeaders);
      return res.end(SHELL
        .replaceAll("__TITLE__", () => escapeHtml(widget.title))
        .replace("__CONFIG__", () => escapeHtml(JSON.stringify({ id: widget.id, appId: widget.appId, base: pathPrefix, version: widget.version }))));
    }
    match = route.match(/^\/w\/([A-Za-z0-9_-]{32,64})\/frame$/u);
    if (req.method === "GET" && match) {
      const widget = store.get(match[1]);
      if (!widget) { res.writeHead(404); return res.end(); }
      // The sandbox header gives the document an opaque origin even when it is
      // opened directly, so its script can never read this host's responses.
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox allow-scripts",
      });
      return res.end(widget.html);
    }
    match = route.match(/^\/w\/([A-Za-z0-9_-]{32,64})\/meta$/u);
    if (req.method === "GET" && match) {
      const widget = store.get(match[1]);
      return widget ? sendJson(res, 200, { version: widget.version, title: widget.title }) : sendJson(res, 404, { error: "gone" });
    }
    if (req.method === "POST" && route === "/api/identity") {
      const body = await readJson(req);
      const widget = store.get(String(body.id ?? ""));
      if (!widget) return sendJson(res, 404, { error: "gone" });
      if (body.failure) {
        audit({ kind: "sdk-failure", widget: widget.id, errno: Number.isInteger(body.failure.errno) ? body.failure.errno : null, inner: Number.isInteger(body.failure.inner) ? body.failure.inner : null });
        return sendJson(res, 200, { identified: false });
      }
      if (typeof body.code !== "string" || !body.code) return sendJson(res, 400, { error: "code required" });
      const person = await identity.exchange(widget.accountId, body.code);
      if (!(await identity.isMember(widget.accountId, widget.chat, person.openId))) {
        audit({ kind: "identity-refused", widget: widget.id, openId: person.openId });
        return sendJson(res, 403, { error: "not_member" });
      }
      const ticket = crypto.randomBytes(24).toString("base64url");
      viewers.set(ticket, { widgetId: widget.id, openId: person.openId, name: person.name, expiresAt: now() + VIEWER_TTL_MS });
      audit({ kind: "identity", widget: widget.id, openId: person.openId });
      return sendJson(res, 200, { identified: true, ticket, name: person.name });
    }
    if (req.method === "POST" && route === "/api/prompt") {
      const body = await readJson(req);
      const viewer = viewers.get(String(body.ticket ?? ""));
      const widget = viewer && store.get(viewer.widgetId);
      if (!viewer || viewer.expiresAt < now() || !widget || widget.id !== body.id) return sendJson(res, 401, { error: "identify_first" });
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text || text.length > MAX_PROMPT_CHARS) return sendJson(res, 400, { error: "bad_text" });
      if (!allowed(`${viewer.openId}:${widget.id}`)) return sendJson(res, 429, { error: "slow_down" });
      // Membership can change after the ticket was issued.
      if (!(await identity.isMember(widget.accountId, widget.chat, viewer.openId))) return sendJson(res, 403, { error: "not_member" });
      const result = await deliver({ widget, openId: viewer.openId, name: viewer.name, text });
      audit({ kind: "prompt", widget: widget.id, openId: viewer.openId, chars: text.length, runMessageId: result?.messageId ?? null });
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 404, { error: "not_found" });
  };

  const publicServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://local");
    if (url.pathname !== pathPrefix && !url.pathname.startsWith(`${pathPrefix}/`)) return sendJson(res, 404, { error: "not_found" });
    try {
      await publicRoutes(req, res, url.pathname.slice(pathPrefix.length) || "/");
    } catch (error) {
      if (error instanceof IdentityError) {
        audit({ kind: "identity-failed", reason: error.message });
        return sendJson(res, 401, { error: "identity_failed" });
      }
      log(`public ${req.method} ${url.pathname}: ${error.message}`);
      sendJson(res, error.status ?? 500, { error: error.status ? error.message : "internal" });
    }
  });

  const adminServer = http.createServer(async (req, res) => {
    const auth = String(req.headers.authorization ?? "");
    if (!safeEqual(auth, `Bearer ${adminToken}`)) return sendJson(res, 401, { error: "unauthorized" });
    const url = new URL(req.url, "http://local");
    try {
      if (req.method === "POST" && url.pathname === "/v1/widgets") {
        const body = await readJson(req);
        for (const key of ["html", "title", "chat", "sessionKey", "appId"]) {
          if (typeof body[key] !== "string" || !body[key]) return sendJson(res, 400, { error: `${key} required` });
        }
        const widget = store.upsert(body);
        audit({ kind: widget.version === 1 ? "created" : "updated", widget: widget.id, version: widget.version, bytes: Buffer.byteLength(body.html) });
        return sendJson(res, 200, {
          id: widget.id,
          version: widget.version,
          messageId: widget.messageId ?? null,
          url: `${publicBaseUrl}${pathPrefix}/w/${widget.id}`,
          localFrameUrl: `/w/${widget.id}/frame`,
        });
      }
      const match = url.pathname.match(/^\/v1\/widgets\/([A-Za-z0-9_-]{32,64})\/message$/u);
      if (req.method === "POST" && match) {
        const body = await readJson(req);
        store.setMessage(match[1], String(body.messageId ?? ""));
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === "GET" && url.pathname === "/v1/audit") {
        return sendJson(res, 200, { entries: fs.existsSync(auditPath) ? fs.readFileSync(auditPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [] });
      }
      return sendJson(res, 404, { error: "not_found" });
    } catch (error) {
      log(`admin ${req.method} ${url.pathname}: ${error.message}`);
      sendJson(res, error.status ?? 500, { error: error.message });
    }
  });

  return { publicServer, adminServer, store };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const { callInbound } = await import("./lib/gateway.mjs");
  const openclawConfig = JSON.parse(fs.readFileSync(config.openclawConfigPath, "utf8"));
  const host = createWidgetHost({
    pathPrefix: config.pathPrefix ?? "/v-widgets",
    publicBaseUrl: config.publicBaseUrl,
    adminToken: fs.readFileSync(config.adminTokenFile, "utf8").trim(),
    stateDir: config.stateDir,
    identity: new FeishuIdentity({ openclawConfig }),
    deliver: (input) => callInbound(config.openclawDist, input),
  });
  host.publicServer.listen(config.publicPort ?? 23970, config.publicBind ?? "127.0.0.1");
  host.adminServer.listen(config.adminPort ?? 23971, "127.0.0.1");
}
