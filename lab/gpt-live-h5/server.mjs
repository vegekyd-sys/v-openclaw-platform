#!/usr/bin/env node
import { randomUUID, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createVoiceAccess } from "./access.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export function createLiveH5Server({ gateway, offer, preview = false, basePath = "", publicOrigin = "", accessToken = "", maxActiveSessions = 8, maxActiveSessionsPerIp = 2 }) {
  basePath = basePath.replace(/\/$/u, "");
  if (basePath && !/^\/[a-zA-Z0-9_-]+$/u.test(basePath)) throw new Error("Invalid voice base path");
  const hosted = Boolean(publicOrigin || accessToken);
  const origin = hosted ? new URL(publicOrigin) : null;
  if (hosted && (origin.protocol !== "https:" || origin.origin !== publicOrigin || !basePath)) throw new Error("Hosted voice requires an HTTPS origin and base path");
  if (!Number.isInteger(maxActiveSessions) || maxActiveSessions < 1 || maxActiveSessions > 50 || !Number.isInteger(maxActiveSessionsPerIp) || maxActiveSessionsPerIp < 1 || maxActiveSessionsPerIp > maxActiveSessions) throw new Error("Invalid voice call limits");
  const access = hosted ? createVoiceAccess(accessToken, basePath) : null;
  const contexts = new Map();
  const local = { active: null, creatingSession: false, listeners: new Set(), touchedAt: Date.now() };
  const attempts = new Map();
  const allow = key => {
    const times = (attempts.get(key) ?? []).filter(at => Date.now() - at < 600000);
    if (times.length >= 6) return false;
    times.push(Date.now()); attempts.set(key, times); return true;
  };
  const cookie = randomBytes(32).toString("hex");
  const json = (res, status, data) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(data)); };
  const close = async (context = local) => {
    const old = context.active;
    if (old) await gateway.request("talk.client.close", { sessionKey: old.sessionKey, voiceSessionId: old.reservation.voiceSessionId });
    if (context.active === old) context.active = null;
  };
  const server = createServer(async (req, res) => {
    res.setHeader("referrer-policy", "no-referrer"); res.setHeader("x-content-type-options", "nosniff");
    try {
      const host = req.headers.host ?? "";
      if (hosted ? host !== origin.host : !/^(127\.0\.0\.1|localhost)(:\d+)?$/u.test(host)) return json(res, 403, { error: "请求入口不匹配" });
      const requestOrigin = hosted ? publicOrigin : `http://${host}`;
      if (req.headers.origin && req.headers.origin !== requestOrigin || hosted && req.method === "POST" && req.headers.origin !== requestOrigin) return json(res, 403, { error: "请求来源不匹配" });
      const url = new URL(req.url, requestOrigin);
      if (basePath && url.pathname === basePath && req.method === "GET") { res.writeHead(308, { location: `${basePath}/${url.search}`, "cache-control": "no-store" }); res.end(); return; }
      if (basePath && !url.pathname.startsWith(`${basePath}/`)) return json(res, 404, { error: "没有这个入口" });
      const pathname = basePath ? url.pathname.slice(basePath.length) : url.pathname;
      const staticFiles = new Map([
        ["/", [join(here, "index.html"), "text/html; charset=utf-8"]],
        ["/app.js", [join(here, "app.js"), "text/javascript; charset=utf-8"]],
        ["/events.mjs", [join(here, "events.mjs"), "text/javascript; charset=utf-8"]],
        ["/duplex-playback.mjs", [join(here, "duplex-playback.mjs"), "text/javascript; charset=utf-8"]],
        ...["microphone-capture.mjs", "transcript-presentation.mjs", "call-sounds.mjs"].map((name) => [`/${name}`, [join(here, name), "text/javascript; charset=utf-8"]]),
        ["/styles.css", [join(here, "styles.css"), "text/css; charset=utf-8"]],
        ...["v-idle-nohat-20260922.png", "v-tool-busy-20260922.png"].map((name) => [`/assets/${name}`, [join(here, "../rtc-h5/assets", name), "image/png"]]),
      ]);
      if (req.method === "GET" && staticFiles.has(pathname)) {
        if (pathname === "/" && !hosted) res.setHeader("set-cookie", `v_live_experiment=${cookie}; HttpOnly; SameSite=Strict; Path=/`);
        const [file, type] = staticFiles.get(pathname);
        const contents = await readFile(file);
        res.writeHead(200, { "content-type": type, "cache-control": "no-store" }); res.end(contents); return;
      }
      const readBody = async () => {
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 70000) throw new Error("Request too large"); chunks.push(chunk); }
        return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      };
      const ip = String(req.headers["cf-connecting-ip"] ?? req.socket.remoteAddress ?? "unknown").slice(0, 128);
      if (hosted && req.method === "POST" && pathname === "/api/access") {
        if (!allow(`access:${ip}`)) return json(res, 429, { error: "尝试次数过多，请稍后再试" });
        const params = await readBody();
        if (!access.accepts(params.access)) return json(res, 403, { error: "分享链接无效或已失效" });
        const visitor = access.issue(res); return json(res, 200, { ok: true, expiresAt: visitor.expiresAt });
      }
      let context = local;
      if (hosted) {
        const visitor = access.read(req);
        if (!visitor) return json(res, 401, { error: "请使用完整的 V 语音分享链接打开" });
        context = contexts.get(visitor.id);
        if (!context) {
          if (contexts.size >= 512) return json(res, 503, { error: "现在访问的人有点多，请稍后再试" });
          context = { active: null, creatingSession: false, listeners: new Set(), touchedAt: Date.now(), ip };
          contexts.set(visitor.id, context);
        }
      } else if (!String(req.headers.cookie ?? "").split(/;\s*/u).includes(`v_live_experiment=${cookie}`)) return json(res, 401, { error: "请先打开实验页面" });
      context.touchedAt = Date.now();
      if (req.method === "GET" && pathname === "/api/status") return json(res, 200, {
        ready: !preview, model: "gpt-live-1-codex", activeCall: Boolean(context.active), creatingSession: context.creatingSession,
      });
      if (preview) return json(res, 503, { error: "当前是页面预览，还未连接 VLab 候选服务。" });
      if (req.method === "GET" && pathname === "/api/events") {
        if (context.listeners.size >= 2) return json(res, 429, { error: "通话连接已打开" });
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        res.write(": connected\n\n"); context.listeners.add(res); req.on("close", () => context.listeners.delete(res)); return;
      }
      if (req.method !== "POST") return json(res, 404, { error: "没有这个入口" });
      const params = await readBody();
      if (pathname === "/api/session") {
        if (context.creatingSession) return json(res, 409, { error: "正在连接 V，请稍等。" });
        if (hosted) {
          const busy = [...contexts.values()].filter(item => item.active || item.creatingSession);
          if (!context.active && busy.length >= maxActiveSessions) return json(res, 503, { error: "现在和 V 说话的人有点多，请稍后再试" });
          if (!context.active && busy.filter(item => item.ip === ip).length >= maxActiveSessionsPerIp) return json(res, 429, { error: "这台设备已有通话，请先结束后再试" });
          if (!allow(`call:${ip}`)) return json(res, 429, { error: "通话开始得太频繁，请稍后再试" });
          context.ip = ip;
        }
        context.creatingSession = true;
        try {
          await close(context);
          const sessionKey = `agent:makaron:explicit:gpt-live-h5-experiment-${randomUUID()}`;
          const reservation = await gateway.request("talk.client.create", { sessionKey, provider: "openai", model: "gpt-live-1-codex", voice: "sol", mode: "realtime", transport: "webrtc", brain: "agent-consult", capabilities: ["voice-transcript"] }, { timeoutMs: 45000 });
          context.active = { sessionKey, reservation, touchedAt: Date.now() };
          if (reservation.model !== "gpt-live-1-codex" || reservation.transport !== "webrtc" || reservation.offerUrl !== "/plugins/openai/realtime/calls") {
            await close(context);
            return json(res, 409, { error: "候选语音配置与 GPT Live 实验不匹配" });
          }
          return json(res, 200, { voiceSessionId: reservation.voiceSessionId, model: reservation.model });
        } finally {
          context.creatingSession = false;
        }
      }
      if (!context.active || params.voiceSessionId !== context.active.reservation.voiceSessionId) return json(res, 409, { error: "通话已结束，请重新开始" });
      context.active.touchedAt = Date.now();
      if (pathname === "/api/offer") {
        if (typeof params.sdp !== "string" || !params.sdp.startsWith("v=0") || params.sdp.length > 65536) return json(res, 400, { error: "语音连接参数无效" });
        const sdp = await offer(context.active.reservation, params.sdp);
        return json(res, 200, { sdp });
      }
      if (pathname === "/api/ready") {
        const result = await gateway.request("talk.client.toolCall", {
          sessionKey: context.active.sessionKey, voiceSessionId: context.active.reservation.voiceSessionId,
          callId: `host-ready-${randomUUID()}`, name: "openclaw_live_call_control", args: { action: "ready" },
        });
        if (result?.ok !== true) return json(res, 409, { error: "接通问候还未就绪，你可以直接说话。" });
        return json(res, 200, { ok: true });
      }
      if (pathname === "/api/steer") {
        if (!["steer", "cancel"].includes(params.mode) || typeof params.text !== "string" || !params.text.trim() || params.text.length > 2000) return json(res, 400, { error: "补充内容无效" });
        const result = await gateway.request("talk.client.steer", { sessionKey: context.active.sessionKey, text: params.text, mode: params.mode });
        if (result?.ok !== true) return json(res, 409, { error: params.mode === "cancel" ? "后台任务暂时没有取消成功，请直接对 V 说明。" : "后台任务没有接受这次补充，请直接对 V 说明。" });
        return json(res, 200, result);
      }
      if (pathname === "/api/heartbeat") return json(res, 200, { ok: true });
      if (pathname === "/api/close") { await close(context); return json(res, 200, { ok: true }); }
      return json(res, 404, { error: "没有这个入口" });
    } catch (error) {
      const message = /requires an active|No active|no active/iu.test(error.message) ? "目前没有正在运行的后台任务，可以直接对 V 说话。" : "这次连接没有完成，请重新开始通话。";
      json(res, error.message === "Request too large" ? 413 : 500, { error: message });
    }
  });
  const timer = setInterval(() => {
    for (const [id, context] of [...contexts, [null, local]]) {
      if (context.active && Date.now() - context.active.touchedAt > 45000) void close(context).catch(() => {});
      if (id && !context.active && !context.creatingSession && !context.listeners.size && Date.now() - context.touchedAt > 1800000) contexts.delete(id);
    }
    for (const [key, times] of attempts) if (!times.some(at => Date.now() - at < 600000)) attempts.delete(key);
  }, 15000); timer.unref();
  const emit = (event) => {
    if (event.event !== "talk.event") return;
    const context = [local, ...contexts.values()].find(item => item.active?.reservation.voiceSessionId === event.payload?.voiceSessionId);
    if (!context) return;
    const item = event.payload.talkEvent;
    if (!["tool.call", "tool.result", "tool.error"].includes(item?.type)) return;
    const message = { voiceSessionId: context.active.reservation.voiceSessionId, type: item.type, callId: item.callId };
    if (item.payload?.name === "openclaw_end_call") {
      message.name = "openclaw_end_call";
      if (typeof item.payload.requestId === "string") message.requestId = item.payload.requestId;
      if (typeof item.payload.originUserTurnId === "string") message.originUserTurnId = item.payload.originUserTurnId;
      if (item.payload.source === "backend_model_client_tool") {
        message.source = item.payload.source;
        for (const field of ["nativeDelegationId", "backendRunId", "backendToolCallId", "status"])
          if (typeof item.payload[field] === "string") message[field] = item.payload[field];
        if (Number.isSafeInteger(item.payload.delegationGeneration)) message.delegationGeneration = item.payload.delegationGeneration;
      }
      if (item.type === "tool.result" && item.payload.closeAfterPlayback === true
        && typeof item.payload.requestId === "string" && item.payload.requestId) {
        message.closeAfterPlayback = true;
      }
    }
    for (const response of context.listeners) response.write(`data: ${JSON.stringify(message)}\n\n`);
  };
  return { server, emit, dispose: async () => {
    clearInterval(timer);
    for (const context of [local, ...contexts.values()]) { for (const response of context.listeners) response.end(); await close(context).catch(() => {}); }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const preview = process.env.GPT_LIVE_H5_PREVIEW === "1";
  const port = Number(process.env.GPT_LIVE_H5_PORT ?? process.env.RTC_H5_PORT ?? 26244);
  let gateway, bridge;
  if (!preview) {
    const configPath = process.env.OPENCLAW_CONFIG_PATH;
    const runtime = process.env.GPT_LIVE_H5_RUNTIME_ROOT ?? process.env.RTC_H5_RUNTIME_ROOT;
    if (!configPath || !runtime) throw new Error("Candidate config and runtime are required");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const token = String(config.gateway.auth.token).replace(/\$\{([^}]+)\}/gu, (_, key) => process.env[key] ?? "");
    const { GatewayClient } = await import(pathToFileURL(join(runtime, "dist/plugin-sdk/gateway-runtime.js")));
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Candidate Gateway unavailable")), 15000);
      gateway = new GatewayClient({ url: `ws://127.0.0.1:${config.gateway.port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", scopes: ["operator.read", "operator.write", "operator.admin"], onHelloOk: () => { clearTimeout(timeout); resolve(); }, onEvent: (event) => bridge?.emit(event), onConnectError: (error) => { clearTimeout(timeout); reject(error); } }); gateway.start();
    });
    bridge = createLiveH5Server({ gateway,
      basePath: process.env.GPT_LIVE_H5_BASE_PATH ?? process.env.RTC_H5_BASE_PATH ?? "",
      publicOrigin: process.env.GPT_LIVE_H5_PUBLIC_ORIGIN ?? process.env.RTC_H5_PUBLIC_ORIGIN
        ?? (process.env.RTC_H5_BASE_PATH && process.env.RTC_H5_ACCESS_TOKEN ? "https://openclaw.tianyi.live" : ""),
      accessToken: process.env.GPT_LIVE_H5_ACCESS_TOKEN ?? process.env.RTC_H5_ACCESS_TOKEN ?? "",
      maxActiveSessions: Number(process.env.RTC_H5_MAX_ACTIVE_SESSIONS ?? 8),
      maxActiveSessionsPerIp: Number(process.env.RTC_H5_MAX_ACTIVE_SESSIONS_PER_IP ?? 2),
      offer: async (reservation, sdp) => {
      const response = await fetch(`http://127.0.0.1:${config.gateway.port}${reservation.offerUrl}`, { method: "POST", headers: { authorization: `Bearer ${reservation.clientSecret}`, "content-type": "application/sdp" }, body: sdp, signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error("Native SDP exchange failed"); return response.text();
    } });
  } else bridge = createLiveH5Server({ preview: true });
  bridge.server.listen(port, "127.0.0.1", () => console.log(JSON.stringify({ ready: true, host: "127.0.0.1", port, preview })));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void bridge.dispose().finally(() => { gateway?.stop(); process.exit(0); }));
}
