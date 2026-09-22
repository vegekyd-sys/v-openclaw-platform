#!/usr/bin/env node
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
const sessionKey = process.env.RTC_H5_SESSION_KEY ?? "agent:makaron:f0cf5055";
const adapterPath = process.env.RTC_H5_ADAPTER_PATH ?? join(here, "../volcengine-rtc-managed-room-client.mjs");

if (!stateDir || !configPath || !runtimeRoot) {
  throw new Error("OPENCLAW_STATE_DIR, OPENCLAW_CONFIG_PATH and RTC_H5_RUNTIME_ROOT are required");
}

const config = JSON.parse(await readFile(configPath, "utf8"));
const expandEnv = (value) => String(value).replace(/\$\{([^}]+)\}/gu, (_, key) => process.env[key] ?? "");
const token = expandEnv(config.gateway?.auth?.token ?? "");
if (!token) throw new Error("Gateway token is unavailable");

const { GatewayClient } = await import(pathToFileURL(join(runtimeRoot, "dist/plugin-sdk/gateway-runtime.js")).href);
let connected = false;
let connectError = null;
const pendingRuns = new Map();

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
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
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

const staticFiles = new Map([
  ["/", [join(here, "index.html"), "text/html; charset=utf-8"]],
  ["/index.html", [join(here, "index.html"), "text/html; charset=utf-8"]],
  ["/styles.css", [join(here, "styles.css"), "text/css; charset=utf-8"]],
  ["/app.js", [join(here, "app.js"), "text/javascript; charset=utf-8"]],
  ["/adapter.js", [adapterPath, "text/javascript; charset=utf-8"]],
  ["/volcengine-rtc-4.68.1.esm.js", [join(runtimeRoot, "dist/control-ui/assets/volcengine-rtc-4.68.1.esm.js"), "text/javascript; charset=utf-8"]],
]);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
  try {
    if (request.method === "GET" && staticFiles.has(url.pathname)) {
      const [path, contentType] = staticFiles.get(url.pathname);
      const info = await stat(path);
      const versionedSdk = url.pathname === "/volcengine-rtc-4.68.1.esm.js";
      response.writeHead(200, {
        "content-type": contentType,
        "content-length": info.size,
        "cache-control": versionedSdk ? "public, max-age=31536000, immutable" : "no-store",
      });
      response.end(await readFile(path));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/status") {
      await waitConnected();
      json(response, 200, { connected: true, sessionKey, gateway: "shared-vlab" });
      return;
    }
    if (request.method !== "POST") return json(response, 404, { error: "Not found" });
    await waitConnected();
    const params = await body(request);
    if (url.pathname === "/api/session") {
      const result = await gateway.request("talk.client.create", {
        sessionKey,
        mode: "realtime",
        transport: "managed-room",
        brain: "agent-consult",
        capabilities: ["voice-transcript"],
      }, { timeoutMs: 45_000 });
      return json(response, 200, result);
    }
    if (url.pathname === "/api/transcript") {
      const result = await gateway.request("talk.client.transcript", { sessionKey, ...params, timestamp: Date.now() });
      return json(response, 200, result ?? { ok: true });
    }
    if (url.pathname === "/api/close") {
      const result = await gateway.request("talk.client.close", { sessionKey, voiceSessionId: params.voiceSessionId });
      return json(response, 200, result ?? { ok: true });
    }
    if (url.pathname === "/api/steer") {
      const result = await gateway.request("talk.client.steer", { sessionKey, text: params.text, mode: params.mode });
      return json(response, 200, result ?? { ok: true });
    }
    if (url.pathname === "/api/tool-call") {
      const run = await gateway.request("talk.client.toolCall", {
        sessionKey,
        voiceSessionId: params.voiceSessionId,
        callId: params.callId,
        name: params.name,
        args: params.args ?? {},
      }, { timeoutMs: 30_000 });
      const text = await waitForRunText(run);
      return json(response, 200, { result: text });
    }
    return json(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(`[rtc-h5] ${request.method} ${url.pathname}`, error);
    return json(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, host, () => {
  console.log(JSON.stringify({ ready: true, host, port, sessionKey }));
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    gateway.stop?.();
    server.close(() => process.exit(0));
  });
}
