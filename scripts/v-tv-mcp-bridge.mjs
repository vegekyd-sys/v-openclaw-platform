#!/usr/bin/env node
// One shared Xiaomi TV MCP for every V session.
//
// Before: each Gateway session, each Codex app-server thread and each claude-cli run
// spawned its own `ssh vlab python3 stdio.py` (one V process + one VLab sshd + one VLab
// python + one Home Assistant MCP session each; ~100 at once on 2026-11-26).
// Now: this service keeps ONE upstream (the same ssh command, one MCP session in Home
// Assistant) and serves MCP Streamable HTTP on loopback. Sessions configure
// mcp.servers.xiaomi-tv-remote as a url, so no session spawns a process.
//
// The TV MCP is stateless per connection: its tool list is fixed and its state
// (last command receipt, cloud probe, the single-request lock) is global inside Home
// Assistant. Forwarding every session's requests over one upstream session therefore
// gives the same results; concurrent calls still meet the same "TV busy" lock.
//
// Wire: POST /mcp with one JSON-RPC message or a batch; replies are application/json.
// initialize and ping are answered here (with the upstream's serverInfo/capabilities);
// every other request is forwarded with a fresh upstream id. No SSE stream (GET -> 405),
// no Mcp-Session-Id (stateless). Auth: Authorization: Bearer <token>; requests with an
// Origin header or a non-loopback Host are refused (DNS rebinding).
//
// Configuration (environment):
//   TV_MCP_BRIDGE_LISTEN              host:port, default 127.0.0.1:18791
//   TV_MCP_BRIDGE_TOKEN_FILE          file holding the token: a dotenv file (key below) or
//                                     a file whose only content is the token. Required.
//   TV_MCP_BRIDGE_TOKEN_KEY           dotenv key, default V_TV_MCP_TOKEN
//   TV_MCP_BRIDGE_UPSTREAM            JSON argv of the upstream stdio MCP; default is the
//                                     command V used per session before this bridge
//   TV_MCP_BRIDGE_REQUEST_TIMEOUT_MS  per forwarded request, default 20000
//   TV_MCP_BRIDGE_CONNECT_TIMEOUT_MS  upstream spawn + initialize, default 10000
//   TV_MCP_BRIDGE_RETRY_AFTER_MS      after a failed connect, fail fast for this long, default 2000
//   TV_MCP_BRIDGE_IDLE_CLOSE_MS       close the upstream after this long idle, 0 = never (default)

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { pathToFileURL } from "node:url";

export const VERSION = "1.0.0";
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export const DEFAULT_UPSTREAM = [
  "/usr/bin/ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5",
  "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3",
  "vlab", "/usr/bin/python3", "-I", "/srv/v-ha-lab/tv-mcp/stdio.py",
];
const MAX_BODY_BYTES = 1 << 20;
const MAX_UPSTREAM_LINE_BYTES = 4 << 20;

export function readToken(file, key = "V_TV_MCP_TOKEN") {
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u);
    if (m && m[1] === key) {
      const v = m[2].replace(/^(['"])(.*)\1$/u, "$2");
      if (v) return v;
    }
  }
  const lines = text.split(/\r?\n/u).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 1 && !lines[0].includes("=")) return lines[0];
  throw new Error(`no ${key} in ${file}`);
}

const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** One long-lived stdio MCP client, shared by all HTTP callers. */
export class Upstream {
  constructor({ argv, connectTimeoutMs = 10_000, requestTimeoutMs = 20_000, retryAfterMs = 2_000, idleCloseMs = 0, log = () => {} }) {
    Object.assign(this, { argv, connectTimeoutMs, requestTimeoutMs, retryAfterMs, idleCloseMs, log });
    this.child = null;
    this.ready = null; // { serverInfo, capabilities, protocolVersion, instructions }
    this.connecting = null;
    this.pending = new Map();
    this.nextId = 1;
    this.lastFailure = null; // { at, message }
    this.lastActivity = Date.now();
    this.lastReceived = 0;
    this.stats = { spawns: 0, forwarded: 0, failures: 0 };
    this.idleTimer = null;
  }

  state() {
    return this.ready ? "connected" : this.connecting ? "connecting" : "idle";
  }

  async ensure() {
    if (this.ready && this.child) return this.ready;
    if (this.connecting) return this.connecting;
    if (this.lastFailure && Date.now() - this.lastFailure.at < this.retryAfterMs) {
      throw new Error(this.lastFailure.message);
    }
    this.connecting = this.#connect().then(
      (info) => { this.connecting = null; this.lastFailure = null; return info; },
      (error) => {
        this.connecting = null;
        this.lastFailure = { at: Date.now(), message: error.message };
        this.stats.failures += 1;
        throw error;
      },
    );
    return this.connecting;
  }

  async #connect() {
    this.stats.spawns += 1;
    const child = spawn(this.argv[0], this.argv.slice(1), { stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    let stderrTail = "";
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderrTail = (stderrTail + chunk).slice(-2000); });
    child.stdout.on("data", (chunk) => {
      this.lastReceived = Date.now();
      buffer += chunk;
      if (buffer.length > MAX_UPSTREAM_LINE_BYTES && !buffer.includes("\n")) {
        this.log("upstream line too large; closing");
        child.kill("SIGTERM");
        return;
      }
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) this.#onLine(child, line);
      }
    });
    child.stdin.on("error", () => {});
    const exited = new Promise((resolve) => {
      child.on("error", (error) => { stderrTail += `\n${error.message}`; resolve(); });
      child.on("exit", () => resolve());
    });
    exited.then(() => this.#onExit(child, stderrTail));

    const init = this.#send(child, "initialize", {
      protocolVersion: SUPPORTED_PROTOCOL_VERSIONS[0],
      capabilities: {},
      clientInfo: { name: "v-tv-mcp-bridge", version: VERSION },
    }, this.connectTimeoutMs);
    const exitedEarly = exited.then(() => {
      throw new Error(stderrTail.trim().split("\n").pop() || "upstream exited during initialize");
    });
    exitedEarly.catch(() => {});
    let result;
    try {
      result = await Promise.race([init, exitedEarly]);
    } catch (error) {
      child.kill("SIGTERM");
      throw new Error(`TV MCP upstream unavailable: ${error.message}`);
    }
    this.#write(child, { jsonrpc: "2.0", method: "notifications/initialized" });
    this.ready = {
      protocolVersion: result.protocolVersion,
      capabilities: result.capabilities ?? {},
      serverInfo: result.serverInfo ?? { name: "unknown", version: "0" },
      ...(result.instructions ? { instructions: result.instructions } : {}),
    };
    this.log(`upstream connected pid=${child.pid} server=${this.ready.serverInfo.name}@${this.ready.serverInfo.version} protocol=${this.ready.protocolVersion}`);
    this.#touch();
    return this.ready;
  }

  #write(child, message) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #send(child, method, params, timeoutMs) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const sentAt = Date.now();
      const timer = setTimeout(() => {
        if (!this.pending.delete(id)) return;
        this.#write(child, { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: id, reason: "timeout" } });
        reject(Object.assign(new Error(`TV MCP request timed out after ${timeoutMs} ms`), { code: "timeout", sentAt }));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, child });
      this.#write(child, { jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
    });
  }

  #onLine(child, line) {
    let message;
    try { message = JSON.parse(line); } catch { this.log("upstream sent non-JSON line; ignored"); return; }
    if (message.id !== undefined && message.method === undefined) {
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.resolve({ error: message.error });
      else entry.resolve(message.result ?? {});
      return;
    }
    if (message.id !== undefined && message.method) {
      // Server-initiated request: answer ping, refuse the rest (the TV MCP sends none).
      if (message.method === "ping") this.#write(child, { jsonrpc: "2.0", id: message.id, result: {} });
      else this.#write(child, rpcError(message.id, -32601, "Method not found"));
    }
    // Server notifications (logging, list_changed) have no session to go to; dropped.
  }

  #onExit(child, stderrTail) {
    if (this.child !== child) return;
    this.child = null;
    this.ready = null;
    const reason = stderrTail.trim().split("\n").pop() || "upstream exited";
    for (const [id, entry] of this.pending) {
      if (entry.child !== child) continue;
      this.pending.delete(id);
      clearTimeout(entry.timer);
      entry.reject(new Error(`TV MCP upstream disconnected: ${reason}`));
    }
    clearTimeout(this.idleTimer);
    this.log(`upstream exited (${reason})`);
  }

  #touch() {
    this.lastActivity = Date.now();
    if (!this.idleCloseMs) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.pending.size === 0 && Date.now() - this.lastActivity >= this.idleCloseMs) this.close();
    }, this.idleCloseMs);
    this.idleTimer.unref?.();
  }

  /** Forward one request; resolves to { result } or { error }. */
  async request(method, params) {
    await this.ensure();
    const child = this.child;
    if (!child) throw new Error("TV MCP upstream disconnected");
    this.stats.forwarded += 1;
    this.#touch();
    try {
      const out = await this.#send(child, method, params, this.requestTimeoutMs);
      this.#touch();
      return out.error ? { error: out.error } : { result: out };
    } catch (error) {
      // A request that timed out with nothing at all heard from the upstream since it was
      // sent means a dead link (ssh half-open): drop it so the next request reconnects.
      if (error.code === "timeout" && this.lastReceived < error.sentAt && this.child === child) {
        this.log("upstream silent through a timeout; reconnecting on next request");
        child.kill("SIGTERM");
      }
      throw error;
    }
  }

  close() {
    const child = this.child;
    if (child) child.kill("SIGTERM");
  }
}

function negotiate(requested, upstreamVersion) {
  return SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : upstreamVersion ?? SUPPORTED_PROTOCOL_VERSIONS[0];
}

/** Handle one client JSON-RPC message; returns a response object or null (notification/response). */
export async function handleMessage(upstream, message, log = () => {}) {
  if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") {
    return rpcError(message?.id, -32600, "Invalid Request");
  }
  const { id, method } = message;
  if (method === undefined) return null; // a response to a server request; we never send any
  if (id === undefined || id === null) return null; // notification (initialized, cancelled, ...)
  try {
    if (method === "initialize") {
      const info = await upstream.ensure();
      const who = message.params?.clientInfo;
      log(`initialize client=${String(who?.name ?? "?").slice(0, 60)}@${String(who?.version ?? "?").slice(0, 30)} protocol=${negotiate(message.params?.protocolVersion, info.protocolVersion)}`);
      return {
        jsonrpc: "2.0", id,
        result: {
          protocolVersion: negotiate(message.params?.protocolVersion, info.protocolVersion),
          capabilities: info.capabilities,
          serverInfo: info.serverInfo,
          ...(info.instructions ? { instructions: info.instructions } : {}),
        },
      };
    }
    if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
    const started = Date.now();
    const out = await upstream.request(method, message.params);
    if (method === "tools/call") {
      const isError = out.error ? "rpc-error" : out.result?.isError ? "tool-error" : "ok";
      log(`tools/call ${String(message.params?.name ?? "?").slice(0, 40)} ${isError} ${Date.now() - started}ms`);
    }
    return out.error ? { jsonrpc: "2.0", id, error: out.error } : { jsonrpc: "2.0", id, result: out.result };
  } catch (error) {
    if (method === "tools/call") log(`tools/call ${String(message.params?.name ?? "?").slice(0, 40)} bridge-error ${error.message}`);
    return rpcError(id, -32000, error.message);
  }
}

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}

export function createBridgeServer({ upstream, token, path = "/mcp", allowedHosts, log = () => {} }) {
  const tokenDigest = digest(`Bearer ${token}`);
  const started = Date.now();
  const counts = { http: 0, unauthorized: 0 };
  let lastUnauthorizedLog = 0;
  return http.createServer((req, res) => {
    const send = (status, body, headers = {}) => {
      const text = body === undefined ? "" : JSON.stringify(body);
      res.writeHead(status, { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers });
      res.end(text);
    };
    const url = new URL(req.url, "http://localhost");
    const host = String(req.headers.host ?? "").toLowerCase();
    if (allowedHosts && !allowedHosts.has(host)) return send(403, { error: "host not allowed" });
    if (req.headers.origin !== undefined) return send(403, { error: "browser origins are not allowed" });
    if (url.pathname === "/healthz" && req.method === "GET") {
      return send(200, { ok: true, version: VERSION, upstream: upstream.state(), uptimeMs: Date.now() - started, ...upstream.stats, http: counts.http, unauthorized: counts.unauthorized });
    }
    if (url.pathname !== path) return send(404, { error: "not found" });
    const auth = req.headers.authorization ?? "";
    if (!crypto.timingSafeEqual(digest(auth), tokenDigest)) {
      counts.unauthorized += 1;
      // Classify, never echo: a literal ${VAR} means the client's env lacked the token.
      if (Date.now() - lastUnauthorizedLog > 10_000) {
        lastUnauthorizedLog = Date.now();
        const kind = !auth ? "missing" : /\$\{[A-Z0-9_]+\}/u.test(auth) ? "unexpanded-placeholder" : /^Bearer\s*$/u.test(auth) ? "empty-bearer" : "mismatch";
        log(`unauthorized (${kind}) ua=${String(req.headers["user-agent"] ?? "-").slice(0, 60)} total=${counts.unauthorized}`);
      }
      return send(401, { error: "unauthorized" }, { "www-authenticate": "Bearer" });
    }
    if (req.method !== "POST") return send(405, { error: "method not allowed" }, { allow: "POST" });
    counts.http += 1;
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { send(413, { error: "body too large" }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", async () => {
      if (res.writableEnded) return;
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {
        return send(400, rpcError(null, -32700, "Parse error"));
      }
      const batch = Array.isArray(body);
      const messages = batch ? body : [body];
      if (messages.length === 0) return send(400, rpcError(null, -32600, "Invalid Request"));
      const replies = (await Promise.all(messages.map((m) => handleMessage(upstream, m, log)))).filter(Boolean);
      if (replies.length === 0) return send(202);
      return send(200, batch ? replies : replies[0]);
    });
  });
}

export function parseListen(value = "127.0.0.1:18791") {
  const m = String(value).match(/^(.*):(\d+)$/u);
  if (!m) throw new Error(`bad TV_MCP_BRIDGE_LISTEN ${value}`);
  return { host: m[1].replace(/^\[(.*)\]$/u, "$1"), port: Number(m[2]) };
}

async function main() {
  const env = process.env;
  const log = (line) => process.stderr.write(`${new Date().toISOString()} ${line}\n`);
  const tokenFile = env.TV_MCP_BRIDGE_TOKEN_FILE;
  if (!tokenFile) throw new Error("TV_MCP_BRIDGE_TOKEN_FILE is required");
  const token = readToken(tokenFile, env.TV_MCP_BRIDGE_TOKEN_KEY || "V_TV_MCP_TOKEN");
  if (token.length < 24) throw new Error("token is too short (need >= 24 characters)");
  const { host, port } = parseListen(env.TV_MCP_BRIDGE_LISTEN);
  const num = (name, fallback) => (env[name] ? Number(env[name]) : fallback);
  const upstream = new Upstream({
    argv: env.TV_MCP_BRIDGE_UPSTREAM ? JSON.parse(env.TV_MCP_BRIDGE_UPSTREAM) : DEFAULT_UPSTREAM,
    requestTimeoutMs: num("TV_MCP_BRIDGE_REQUEST_TIMEOUT_MS", 20_000),
    connectTimeoutMs: num("TV_MCP_BRIDGE_CONNECT_TIMEOUT_MS", 10_000),
    retryAfterMs: num("TV_MCP_BRIDGE_RETRY_AFTER_MS", 2_000),
    idleCloseMs: num("TV_MCP_BRIDGE_IDLE_CLOSE_MS", 0),
    log,
  });
  const allowedHosts = new Set([`${host}:${port}`, `localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  const server = createBridgeServer({ upstream, token, allowedHosts, log });
  server.keepAliveTimeout = 65_000;
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve); });
  log(`v-tv-mcp-bridge ${VERSION} listening on ${host}:${port}; upstream ${upstream.argv.join(" ")}`);
  const stop = () => { log("stopping"); upstream.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { process.stderr.write(`v-tv-mcp-bridge: ${error.message}\n`); process.exit(1); });
}
