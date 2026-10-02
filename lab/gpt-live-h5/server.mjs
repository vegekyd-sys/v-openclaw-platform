#!/usr/bin/env node
import { randomUUID, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export function createLiveH5Server({ gateway, offer, preview = false }) {
  const cookie = randomBytes(32).toString("hex");
  let active = null;
  let creatingSession = false;
  const listeners = new Set();
  const json = (res, status, data) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(data)); };
  const close = async () => {
    const old = active;
    if (old) await gateway.request("talk.client.close", { sessionKey: old.sessionKey, voiceSessionId: old.reservation.voiceSessionId });
    if (active === old) active = null;
  };
  const server = createServer(async (req, res) => {
    res.setHeader("referrer-policy", "no-referrer"); res.setHeader("x-content-type-options", "nosniff");
    try {
      const host = req.headers.host ?? "";
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/u.test(host)) return json(res, 403, { error: "实验入口仅支持本机访问" });
      const url = new URL(req.url, `http://${host}`);
      if (req.headers.origin && req.headers.origin !== `http://${host}`) return json(res, 403, { error: "请求来源不匹配" });
      const staticFiles = new Map([
        ["/", [join(here, "index.html"), "text/html; charset=utf-8"]],
        ["/app.js", [join(here, "app.js"), "text/javascript; charset=utf-8"]],
        ["/events.mjs", [join(here, "events.mjs"), "text/javascript; charset=utf-8"]],
        ["/duplex-playback.mjs", [join(here, "duplex-playback.mjs"), "text/javascript; charset=utf-8"]],
        ["/styles.css", [join(here, "../rtc-h5/styles.css"), "text/css; charset=utf-8"]],
        ...["v-idle-nohat-20260922.png", "v-tool-busy-20260922.png"].map((name) => [`/assets/${name}`, [join(here, "../rtc-h5/assets", name), "image/png"]]),
      ]);
      if (req.method === "GET" && staticFiles.has(url.pathname)) {
        if (url.pathname === "/") res.setHeader("set-cookie", `v_live_experiment=${cookie}; HttpOnly; SameSite=Strict; Path=/`);
        const [file, type] = staticFiles.get(url.pathname);
        const contents = await readFile(file);
        res.writeHead(200, { "content-type": type, "cache-control": "no-store" }); res.end(contents); return;
      }
      if (!String(req.headers.cookie ?? "").split(/;\s*/u).includes(`v_live_experiment=${cookie}`)) return json(res, 401, { error: "请先打开实验页面" });
      if (req.method === "GET" && url.pathname === "/api/status") return json(res, 200, { ready: !preview, model: "gpt-live-1-codex" });
      if (preview) return json(res, 503, { error: "当前是页面预览，还未连接 VLab 候选服务。" });
      if (req.method === "GET" && url.pathname === "/api/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        res.write(": connected\n\n"); listeners.add(res); req.on("close", () => listeners.delete(res)); return;
      }
      if (req.method !== "POST") return json(res, 404, { error: "没有这个入口" });
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 70000) return json(res, 413, { error: "请求太大" }); chunks.push(chunk); }
      const params = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      if (url.pathname === "/api/session") {
        if (creatingSession) return json(res, 409, { error: "正在连接 V，请稍等。" });
        creatingSession = true;
        try {
          await close();
          const sessionKey = `agent:makaron:explicit:gpt-live-h5-experiment-${randomUUID()}`;
          const reservation = await gateway.request("talk.client.create", { sessionKey, provider: "openai", model: "gpt-live-1-codex", voice: "sol", mode: "realtime", transport: "webrtc", brain: "agent-consult", capabilities: ["voice-transcript"] }, { timeoutMs: 45000 });
          active = { sessionKey, reservation, touchedAt: Date.now() };
          if (reservation.model !== "gpt-live-1-codex" || reservation.transport !== "webrtc" || reservation.offerUrl !== "/plugins/openai/realtime/calls") {
            await close();
            return json(res, 409, { error: "候选语音配置与 GPT Live 实验不匹配" });
          }
          return json(res, 200, { voiceSessionId: reservation.voiceSessionId, model: reservation.model });
        } finally {
          creatingSession = false;
        }
      }
      if (!active || params.voiceSessionId !== active.reservation.voiceSessionId) return json(res, 409, { error: "通话已结束，请重新开始" });
      active.touchedAt = Date.now();
      if (url.pathname === "/api/offer") {
        if (typeof params.sdp !== "string" || !params.sdp.startsWith("v=0") || params.sdp.length > 65536) return json(res, 400, { error: "语音连接参数无效" });
        const sdp = await offer(active.reservation, params.sdp);
        return json(res, 200, { sdp });
      }
      if (url.pathname === "/api/steer") {
        if (!["steer", "cancel"].includes(params.mode) || typeof params.text !== "string" || !params.text.trim() || params.text.length > 2000) return json(res, 400, { error: "补充内容无效" });
        const result = await gateway.request("talk.client.steer", { sessionKey: active.sessionKey, text: params.text, mode: params.mode });
        if (result?.ok !== true) return json(res, 409, { error: params.mode === "cancel" ? "后台任务暂时没有取消成功，请直接对 V 说明。" : "后台任务没有接受这次补充，请直接对 V 说明。" });
        return json(res, 200, result);
      }
      if (url.pathname === "/api/heartbeat") return json(res, 200, { ok: true });
      if (url.pathname === "/api/close") { await close(); return json(res, 200, { ok: true }); }
      return json(res, 404, { error: "没有这个入口" });
    } catch (error) {
      const message = /requires an active|No active|no active/iu.test(error.message) ? "目前没有正在运行的后台任务，可以直接对 V 说话。" : "这次连接没有完成，请重新开始通话。";
      json(res, 500, { error: message });
    }
  });
  const timer = setInterval(() => { if (active && Date.now() - active.touchedAt > 45000) void close().catch(() => {}); }, 15000); timer.unref();
  const emit = (event) => {
    if (event.event !== "talk.event" || event.payload?.voiceSessionId !== active?.reservation.voiceSessionId) return;
    const item = event.payload.talkEvent;
    if (!["tool.call", "tool.result", "tool.error"].includes(item?.type)) return;
    const message = { voiceSessionId: active.reservation.voiceSessionId, type: item.type, callId: item.callId };
    for (const response of listeners) response.write(`data: ${JSON.stringify(message)}\n\n`);
  };
  return { server, emit, dispose: async () => { clearInterval(timer); for (const response of listeners) response.end(); await close().catch(() => {}); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const preview = process.env.GPT_LIVE_H5_PREVIEW === "1";
  const port = Number(process.env.GPT_LIVE_H5_PORT ?? 26244);
  let gateway, bridge;
  if (!preview) {
    const configPath = process.env.OPENCLAW_CONFIG_PATH;
    const runtime = process.env.GPT_LIVE_H5_RUNTIME_ROOT;
    if (!configPath || !runtime) throw new Error("Candidate config and runtime are required");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const token = String(config.gateway.auth.token).replace(/\$\{([^}]+)\}/gu, (_, key) => process.env[key] ?? "");
    const { GatewayClient } = await import(pathToFileURL(join(runtime, "dist/plugin-sdk/gateway-runtime.js")));
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Candidate Gateway unavailable")), 15000);
      gateway = new GatewayClient({ url: `ws://127.0.0.1:${config.gateway.port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", scopes: ["operator.read", "operator.write", "operator.admin"], onHelloOk: () => { clearTimeout(timeout); resolve(); }, onEvent: (event) => bridge?.emit(event), onConnectError: (error) => { clearTimeout(timeout); reject(error); } }); gateway.start();
    });
    bridge = createLiveH5Server({ gateway, offer: async (reservation, sdp) => {
      const response = await fetch(`http://127.0.0.1:${config.gateway.port}${reservation.offerUrl}`, { method: "POST", headers: { authorization: `Bearer ${reservation.clientSecret}`, "content-type": "application/sdp" }, body: sdp, signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error("Native SDP exchange failed"); return response.text();
    } });
  } else bridge = createLiveH5Server({ preview: true });
  bridge.server.listen(port, "127.0.0.1", () => console.log(JSON.stringify({ ready: true, host: "127.0.0.1", port, preview })));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void bridge.dispose().finally(() => { gateway?.stop(); process.exit(0); }));
}
