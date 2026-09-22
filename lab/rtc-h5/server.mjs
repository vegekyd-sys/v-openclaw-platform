#!/usr/bin/env node
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const host = process.env.RTC_H5_HOST ?? "127.0.0.1";
const port = Number(process.env.RTC_H5_PORT ?? 26242);
const stateDir = process.env.OPENCLAW_STATE_DIR;
const configPath = process.env.OPENCLAW_CONFIG_PATH ?? (stateDir ? join(stateDir, "openclaw.json") : undefined);
const runtimeRoot = process.env.RTC_H5_RUNTIME_ROOT;
const fixedSessionKey = process.env.RTC_H5_SESSION_KEY;
const accessToken = process.env.RTC_H5_ACCESS_TOKEN ?? "";
const basePath = (process.env.RTC_H5_BASE_PATH ?? "").replace(/\/$/u, "");
const maxActiveSessions = Number(process.env.RTC_H5_MAX_ACTIVE_SESSIONS ?? 8);
const maxActiveSessionsPerIp = Number(process.env.RTC_H5_MAX_ACTIVE_SESSIONS_PER_IP ?? 2);
const accessCookie = "v_voice_access";
const cookieMaxAgeSeconds = 7 * 24 * 60 * 60;
const sessionIdleMs = 30 * 60 * 1000;
const localCookieSecret = randomBytes(32).toString("hex");
const adapterPath = process.env.RTC_H5_ADAPTER_PATH ?? join(here, "../volcengine-rtc-managed-room-client.mjs");

if (!stateDir || !configPath || !runtimeRoot) {
  throw new Error("OPENCLAW_STATE_DIR, OPENCLAW_CONFIG_PATH and RTC_H5_RUNTIME_ROOT are required");
}
if (accessToken && accessToken.length < 32) throw new Error("RTC_H5_ACCESS_TOKEN must contain at least 32 characters");
if (accessToken && fixedSessionKey) throw new Error("RTC_H5_SESSION_KEY must not be fixed for public access");
if (basePath && (!basePath.startsWith("/") || basePath.includes(".."))) throw new Error("RTC_H5_BASE_PATH must be a safe absolute path");
if (!Number.isInteger(maxActiveSessions) || maxActiveSessions < 1 || maxActiveSessions > 50) throw new Error("RTC_H5_MAX_ACTIVE_SESSIONS must be between 1 and 50");
if (!Number.isInteger(maxActiveSessionsPerIp) || maxActiveSessionsPerIp < 1 || maxActiveSessionsPerIp > maxActiveSessions) {
  throw new Error("RTC_H5_MAX_ACTIVE_SESSIONS_PER_IP is invalid");
}

const config = JSON.parse(await readFile(configPath, "utf8"));
const expandEnv = (value) => String(value).replace(/\$\{([^}]+)\}/gu, (_, key) => process.env[key] ?? "");
const token = expandEnv(config.gateway?.auth?.token ?? "");
if (!token) throw new Error("Gateway token is unavailable");

const { GatewayClient } = await import(pathToFileURL(join(runtimeRoot, "dist/plugin-sdk/gateway-runtime.js")).href);
let connected = false;
let connectError = null;
const pendingRuns = new Map();
const activeSessions = new Map();
const startAttempts = new Map();

const gateway = new GatewayClient({
  url: `ws://127.0.0.1:${Number(config.gateway?.port ?? process.env.OPENCLAW_GATEWAY_PORT ?? 24993)}`,
  token,
  deviceIdentity: null,
  clientName: "cli",
  clientDisplayName: "Xiaohe RTC H5",
  mode: "cli",
  role: "operator",
  scopes: ["operator.read", "operator.write", "operator.admin"],
  onHelloOk: () => { connected = true; connectError = null; },
  onClose: () => { connected = false; },
  onConnectError: (error) => { connected = false; connectError = error; },
  onEvent: (event) => {
    if (event.event !== "chat") return;
    const payload = event.payload;
    const pending = pendingRuns.get(payload?.runId);
    if (!pending) return;
    if (payload.state === "final") {
      const text = extractText(payload.message);
      if (text) pending.resolve(text);
    } else if (payload.state === "aborted" || payload.state === "error") {
      pending.reject(new Error(payload.errorMessage ?? `Agent ${payload.state}`));
    }
  },
});
gateway.start();

function extractText(message) {
  if (!message) return "";
  if (typeof message === "string") return message.trim();
  if (typeof message.text === "string") return message.text.trim();
  if (!Array.isArray(message.content)) return "";
  return message.content.map((item) => item?.type === "text" && typeof item.text === "string" ? item.text : "").filter(Boolean).join("\n").trim();
}

async function waitConnected(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (!connected && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  if (!connected) throw connectError ?? new Error("Gateway connection timed out");
}

async function waitForRunText(run, timeoutMs = 125_000) {
  let timer;
  const live = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error("V 后端处理超时")), timeoutMs);
    pendingRuns.set(run.runId, {
      resolve: (text) => { clearTimeout(timer); pendingRuns.delete(run.runId); resolve(text); },
      reject: (error) => { clearTimeout(timer); pendingRuns.delete(run.runId); reject(error); },
    });
  });
  const reconciled = (async () => {
    const result = await gateway.request("agent.wait", { runId: run.runId, timeoutMs: timeoutMs - 5_000 }, { timeoutMs });
    if (result?.status === "error") throw new Error(result.error ?? "V 后端处理失败");
    const direct = extractText(result?.message ?? result?.result);
    if (direct) return direct;
    const history = await gateway.request("chat.history", { sessionKey: run.agentSessionKey, agentId: run.agentId, limit: 20 });
    const messages = Array.isArray(history?.messages) ? history.messages : [];
    const matching = [...messages].reverse().find((message) => message?.role === "assistant" && message?.__openclaw?.runId === run.runId);
    const text = extractText(matching);
    if (!text) throw new Error("V 已完成，但没有返回可播报文字");
    return text;
  })();
  try {
    return await Promise.race([live, reconciled]);
  } finally {
    clearTimeout(timer);
    pendingRuns.delete(run.runId);
  }
}

function json(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 256 * 1024) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieValue(request, name) {
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

function clientIp(request) {
  const value = request.headers["cf-connecting-ip"] ?? request.headers["x-forwarded-for"] ?? request.socket.remoteAddress ?? "unknown";
  return String(Array.isArray(value) ? value[0] : value).split(",", 1)[0].trim().slice(0, 128);
}

function signVisitor(id, expiresAt) {
  const payload = `${id}.${expiresAt}`;
  return `${payload}.${createHmac("sha256", accessToken || localCookieSecret).update(payload).digest("base64url")}`;
}

function readVisitor(request) {
  const signed = cookieValue(request, accessCookie);
  const [id, expiresAtRaw, signature] = signed.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!/^[a-f0-9]{32}$/u.test(id ?? "") || !Number.isFinite(expiresAt) || expiresAt < Date.now() || !signature) return null;
  return safeEqual(signVisitor(id, expiresAt), signed) ? { id, expiresAt } : null;
}

function setVisitorCookie(response, visitor) {
  const path = `${basePath || ""}/`;
  const secure = accessToken ? "; Secure" : "";
  response.setHeader("set-cookie", `${accessCookie}=${encodeURIComponent(signVisitor(visitor.id, visitor.expiresAt))}; Path=${path}; HttpOnly; SameSite=Strict; Max-Age=${cookieMaxAgeSeconds}${secure}`);
}

function createVisitor(response) {
  const visitor = { id: randomBytes(16).toString("hex"), expiresAt: Date.now() + cookieMaxAgeSeconds * 1000 };
  setVisitorCookie(response, visitor);
  return visitor;
}

function requireVisitor(request, response) {
  const visitor = readVisitor(request);
  if (visitor) return visitor;
  if (!accessToken) return createVisitor(response);
  json(response, 401, { error: "请使用完整的 V 语音分享链接打开" });
  return null;
}

function visitorSessionKey(visitor) {
  if (fixedSessionKey) return fixedSessionKey;
  const suffix = createHash("sha256").update(visitor.id).digest("hex").slice(0, 24);
  return `agent:makaron:voice-h5-${suffix}`;
}

function allowStart(key) {
  const now = Date.now();
  const recent = (startAttempts.get(key) ?? []).filter((entry) => now - entry < 10 * 60 * 1000);
  if (recent.length >= 6) return false;
  recent.push(now);
  startAttempts.set(key, recent);
  return true;
}

function countActiveForIp(ip) {
  return [...activeSessions.values()].filter((entry) => entry.ip === ip).length;
}

const staticFiles = new Map([
  ["/", [join(here, "index.html"), "text/html; charset=utf-8"]],
  ["/index.html", [join(here, "index.html"), "text/html; charset=utf-8"]],
  ["/styles.css", [join(here, "styles.css"), "text/css; charset=utf-8"]],
  ["/app.js", [join(here, "app.js"), "text/javascript; charset=utf-8"]],
  ["/assets/v-idle-nohat-20260922.png", [join(here, "assets/v-idle-nohat-20260922.png"), "image/png"]],
  ["/assets/v-tool-busy-20260922.png", [join(here, "assets/v-tool-busy-20260922.png"), "image/png"]],
  ["/assets/v-tool-very-busy-20260922.png", [join(here, "assets/v-tool-very-busy-20260922.png"), "image/png"]],
  ["/adapter.js", [adapterPath, "text/javascript; charset=utf-8"]],
  ["/volcengine-rtc-4.68.1.esm.js", [join(runtimeRoot, "dist/control-ui/assets/volcengine-rtc-4.68.1.esm.js"), "text/javascript; charset=utf-8"]],
]);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
  const publicPath = url.pathname;
  const pathname = basePath && (publicPath === basePath || publicPath.startsWith(`${basePath}/`))
    ? publicPath.slice(basePath.length) || "/"
    : basePath ? null : publicPath;
  try {
    if (!pathname) return json(response, 404, { error: "Not found" });
    if (request.method === "GET" && basePath && publicPath === basePath) {
      response.writeHead(308, {
        location: `${basePath}/${url.search}`,
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      });
      response.end();
      return;
    }
    if (request.method === "GET" && staticFiles.has(pathname)) {
      const [path, contentType] = staticFiles.get(pathname);
      const info = await stat(path);
      const versionedAsset = pathname === "/volcengine-rtc-4.68.1.esm.js" || pathname.startsWith("/assets/");
      response.writeHead(200, {
        "content-type": contentType,
        "content-length": info.size,
        "cache-control": versionedAsset ? "public, max-age=31536000, immutable" : "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      });
      response.end(await readFile(path));
      return;
    }
    if (request.method === "POST" && pathname === "/api/access") {
      const ip = clientIp(request);
      if (!allowStart(`access:${ip}`)) return json(response, 429, { error: "尝试次数过多，请稍后再试" });
      const params = await body(request);
      if (!accessToken || !safeEqual(params.access ?? "", accessToken)) return json(response, 403, { error: "分享链接无效或已失效" });
      const visitor = createVisitor(response);
      return json(response, 200, { ok: true, expiresAt: visitor.expiresAt });
    }
    const visitor = requireVisitor(request, response);
    if (!visitor) return;
    const sessionKey = visitorSessionKey(visitor);
    if (request.method === "GET" && pathname === "/api/status") {
      await waitConnected();
      return json(response, 200, { connected: true, gateway: "V" });
    }
    if (request.method !== "POST") return json(response, 404, { error: "Not found" });
    await waitConnected();
    const params = await body(request);
    if (pathname === "/api/session") {
      const ip = clientIp(request);
      if (!allowStart(ip)) return json(response, 429, { error: "通话开始得太频繁，请稍后再试" });
      const existing = activeSessions.get(visitor.id);
      if (!existing && activeSessions.size >= maxActiveSessions) return json(response, 503, { error: "现在和 V 说话的人有点多，请稍后再试" });
      if (!existing && countActiveForIp(ip) >= maxActiveSessionsPerIp) return json(response, 429, { error: "这台设备已有通话，请先结束后再试" });
      if (existing?.voiceSessionId) {
        await gateway.request("talk.client.close", { sessionKey, voiceSessionId: existing.voiceSessionId }).catch(() => {});
      }
      const result = await gateway.request("talk.client.create", {
        sessionKey,
        mode: "realtime",
        transport: "managed-room",
        brain: "agent-consult",
        capabilities: ["voice-transcript"],
      }, { timeoutMs: 45_000 });
      activeSessions.set(visitor.id, { ip, sessionKey, voiceSessionId: result.voiceSessionId, touchedAt: Date.now() });
      return json(response, 200, result);
    }
    const active = activeSessions.get(visitor.id);
    if (!active || (params.voiceSessionId && active.voiceSessionId !== params.voiceSessionId)) {
      return json(response, 409, { error: "通话已结束，请重新开始" });
    }
    active.touchedAt = Date.now();
    if (pathname === "/api/transcript") {
      const result = await gateway.request("talk.client.transcript", { sessionKey, ...params, voiceSessionId: active.voiceSessionId, timestamp: Date.now() });
      return json(response, 200, result ?? { ok: true });
    }
    if (pathname === "/api/close") {
      const result = await gateway.request("talk.client.close", { sessionKey, voiceSessionId: active.voiceSessionId });
      activeSessions.delete(visitor.id);
      return json(response, 200, result ?? { ok: true });
    }
    if (pathname === "/api/steer") {
      const result = await gateway.request("talk.client.steer", { sessionKey, text: params.text, mode: params.mode });
      return json(response, 200, result ?? { ok: true });
    }
    if (pathname === "/api/tool-call") {
      const run = await gateway.request("talk.client.toolCall", {
        sessionKey,
        voiceSessionId: active.voiceSessionId,
        callId: params.callId,
        name: params.name,
        args: params.args ?? {},
      }, { timeoutMs: 30_000 });
      const text = await waitForRunText(run);
      return json(response, 200, { result: text });
    }
    return json(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(`[rtc-h5] ${request.method} ${publicPath}`, error);
    return json(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

const cleanup = setInterval(() => {
  const cutoff = Date.now() - sessionIdleMs;
  for (const [visitorId, active] of activeSessions) {
    if (active.touchedAt >= cutoff) continue;
    activeSessions.delete(visitorId);
    gateway.request("talk.client.close", { sessionKey: active.sessionKey, voiceSessionId: active.voiceSessionId }).catch(() => {});
  }
  for (const [key, attempts] of startAttempts) {
    const recent = attempts.filter((entry) => entry >= Date.now() - 10 * 60 * 1000);
    if (recent.length) startAttempts.set(key, recent);
    else startAttempts.delete(key);
  }
}, 60_000);
cleanup.unref();

server.listen(port, host, () => {
  console.log(JSON.stringify({ ready: true, host, port, basePath, accessProtected: Boolean(accessToken), maxActiveSessions }));
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    clearInterval(cleanup);
    gateway.stop?.();
    server.close(() => process.exit(0));
  });
}
