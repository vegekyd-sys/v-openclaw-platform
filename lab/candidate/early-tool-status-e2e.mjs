// Candidate e2e: early tool status (lab/patch-early-tool-status.mjs) on V's current bytes, measured in Feishu.
//
// A private Gateway on the candidate config copy runs V's Feishu plugin and V's vlab-worker runtime
// against a local fake Feishu (REST + the Lark SDK WebSocket frames, taken from
// feishu-ingress-catchup-e2e.mjs) and a loopback DeepSeek. The loopback model makes the timing
// deterministic: a "tool" turn streams reasoning, then a tool call whose header (name, id) arrives
// first and whose arguments take ETS_ARG_MS to stream (V 2026-11-05..07: first toolcall_start ->
// Feishu card start P50 0.55 s, P90 1.86 s, P95 3.74 s on 610 tool-first replies), then the answer;
// a "text" turn answers without a tool. Every reply is a real Feishu turn: inbound WebSocket event,
// dispatcher, Worker turn, Feishu streaming card, final reply. Timings come from V's own
// [firsttext-e2e.1] record and from the fake Feishu's card writes.
//
// ETS_ARM=base  V's bytes (no plan files)
// ETS_ARM=on    + lab/release-files/early-tool-status (builtin + agent-runner, built on V 2026-11-08)
// ETS_ARM=off   the patched files with OPENCLAW_EARLY_TOOL_STATUS=0 (kill switch must equal base)
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { createRequire } from "node:module";

const ARM = process.env.ETS_ARM ?? "base";
assert(["base", "on", "off"].includes(ARM));
const N_TOOL = Number(process.env.ETS_TOOL_TURNS ?? 8);
const N_TEXT = Number(process.env.ETS_TEXT_TURNS ?? 4);
const ARG_MS = Number(process.env.ETS_ARG_MS ?? 1500);
const MODEL_DELAY_MS = Number(process.env.ETS_MODEL_DELAY_MS ?? 1200);
const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const APP_ID = "cli_0000feed0000beef"; // SDK requires cli_ + 16 hex; not a real app
const BOT = "ou_vets_fake_bot";
const ALICE = "ou_vets_alice";
const T_START = Date.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const since = () => `${((Date.now() - T_START) / 1000).toFixed(1)}s`;
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const evidence = { arm: ARM, argMs: ARG_MS, steps: [], checks: [] };
const step = (name, data = {}) => { evidence.steps.push({ at: since(), name, ...data }); console.error(`[${since()}] ${name} ${JSON.stringify(data)}`); };
const check = (name, ok, data = {}) => { evidence.checks.push({ name, ok: Boolean(ok), ...data }); if (!ok) console.error(`CHECK FAILED ${name} ${JSON.stringify(data)}`); };

// ---------------------------------------------------------------- bytes under test
const dist = path.join(runtime, "openclaw", "dist");
const builtinPatched = fs.readFileSync(path.join(dist, "builtin-openclaw-zQV8Wwjr.js"), "utf8").includes("v-early-tool-status-v2");
const runnerPatched = fs.readFileSync(path.join(dist, "agent-runner.runtime-CAdsMsQt.js"), "utf8").includes("v-early-tool-status-v2");
assert.equal(builtinPatched, ARM !== "base", "builtin bytes do not match ETS_ARM");
assert.equal(runnerPatched, ARM !== "base", "agent-runner bytes do not match ETS_ARM");
const config0 = JSON.parse(fs.readFileSync(configPath, "utf8"));
const feishuDir = config0.plugins.load.paths.find((p) => p.endsWith("/@openclaw/feishu"));
assert(feishuDir?.startsWith(runtime), "must only touch the private candidate runtime");
evidence.monitorSha = sha256(fs.readFileSync(path.join(feishuDir, "dist", "monitor.account-WFdlCDhR.js")));
evidence.coreSha = Object.fromEntries(["builtin-openclaw-zQV8Wwjr.js", "agent-runner.runtime-CAdsMsQt.js"].map((f) => [f, sha256(fs.readFileSync(path.join(dist, f)))]));
// Candidate-only (as in feishu-ingress-catchup-e2e.mjs): allow the relocated Feishu plugin's ingress queue.
{
  const gate = 'if (record?.origin !== "bundled" && record?.trustedOfficialInstall !== true) throw new Error(`${methodName} is only available for trusted plugins';
  const loaderFile = fs.readdirSync(dist).filter((n) => /^loader-[\w-]{8}\.js$/u.test(n)).map((n) => path.join(dist, n)).find((f) => fs.readFileSync(f, "utf8").includes(gate));
  assert(loaderFile, "trusted-runtime gate not found");
  const src = fs.readFileSync(loaderFile, "utf8");
  assert.equal(src.split(gate).length, 2, "trusted-runtime gate anchor");
  fs.writeFileSync(loaderFile, src.replace(gate, gate.replace("record?.trustedOfficialInstall !== true", 'record?.trustedOfficialInstall !== true && pluginId !== "feishu"')));
}
const sdkRequire = createRequire(path.join(feishuDir, "node_modules", "@larksuiteoapi", "node-sdk", "package.json"));
const { WebSocketServer } = sdkRequire("ws");

// ---------------------------------------------------------------- pbbp2 frames (Lark SDK WS protocol)
function varint(n) {
  const out = [];
  let v = BigInt(n);
  do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v);
  return Buffer.from(out);
}
const field = (no, wire, body) => Buffer.concat([varint((no << 3) | wire), body]);
const lenField = (no, buf) => field(no, 2, Buffer.concat([varint(buf.length), buf]));
function encodeFrame(f) {
  const parts = [field(1, 0, varint(f.SeqID ?? 0)), field(2, 0, varint(f.LogID ?? 0)), field(3, 0, varint(f.service ?? 1)), field(4, 0, varint(f.method ?? 0))];
  for (const h of f.headers ?? []) parts.push(lenField(5, Buffer.concat([lenField(1, Buffer.from(h.key)), lenField(2, Buffer.from(h.value))])));
  if (f.payload) parts.push(lenField(8, Buffer.from(f.payload)));
  return Buffer.concat(parts);
}
function readFields(buf) {
  const fields = [];
  let i = 0;
  const readVarint = () => { let r = 0n, s = 0n; for (;;) { const b = buf[i++]; r |= BigInt(b & 0x7f) << s; s += 7n; if (!(b & 0x80)) return r; } };
  while (i < buf.length) {
    const tag = Number(readVarint());
    const no = tag >> 3, wire = tag & 7;
    if (wire === 0) fields.push([no, readVarint()]);
    else if (wire === 2) { const len = Number(readVarint()); fields.push([no, buf.subarray(i, i + len)]); i += len; }
    else throw new Error(`unsupported wire type ${wire}`);
  }
  return fields;
}
function decodeFrame(buf) {
  const f = { headers: [] };
  for (const [no, v] of readFields(buf)) {
    if (no === 4) f.method = Number(v);
    else if (no === 5) { const h = {}; for (const [hn, hv] of readFields(v)) h[hn === 1 ? "key" : "value"] = hv.toString(); f.headers.push(h); }
    else if (no === 8) f.payload = Buffer.from(v);
  }
  f.h = Object.fromEntries(f.headers.map((h) => [h.key, h.value]));
  return f;
}

// ---------------------------------------------------------------- fake Feishu
const fake = {
  history: new Map(), // chatId -> [list item]
  replies: [], // { to, at, msgType }
  reactions: [],
  lists: [], // { at, chat, page, items }
  acks: new Map(), // frame message_id -> { code, at }
  pushes: [],
  unknown: new Map(),
  sockets: new Set(),
  connections: 0,
  refusing: false,
  listLatencyMs: Number(process.env.FT_LIST_LATENCY_MS ?? 80),
  seq: 0,
  cardWrites: [],
};
const json = (res, body, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
// The plugin only accepts an https:// custom domain: a throwaway self-signed certificate for 127.0.0.1,
// trusted by the private Gateway through NODE_EXTRA_CA_CERTS only.
const tlsDir = path.join(process.env.VLAB_CANDIDATE_DATA ?? stateDir, "fake-feishu-tls");
fs.mkdirSync(tlsDir, { recursive: true, mode: 0o700 });
const certFile = path.join(tlsDir, "cert.pem");
const keyFile = path.join(tlsDir, "key.pem");
const openssl = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", keyFile, "-out", certFile], { encoding: "utf8" });
assert.equal(openssl.status, 0, `openssl failed: ${openssl.stderr}`);
const server = https.createServer({ cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }, async (req, res) => {
  const url = new URL(req.url, "http://fake");
  let body = "";
  for await (const chunk of req) body += chunk;
  const p = url.pathname;
  let m;
  if (p.endsWith("/tenant_access_token/internal") || p.endsWith("/app_access_token/internal")) return json(res, { code: 0, msg: "ok", tenant_access_token: "t-fake", app_access_token: "a-fake", expire: 7200 });
  if (p === "/callback/ws/endpoint") {
    const port = server.address().port;
    return json(res, { code: 0, msg: "ok", data: { URL: `wss://127.0.0.1:${port}/ws?fpid=1&device_id=fake-device&service_id=1`, ClientConfig: { PingInterval: 120, ReconnectCount: -1, ReconnectInterval: 2, ReconnectNonce: 0 } } });
  }
  if (p === "/open-apis/bot/v3/info") return json(res, { code: 0, msg: "ok", bot: { open_id: BOT, app_name: "V", activate_status: 2 } });
  if (p === "/open-apis/im/v1/messages" && req.method === "GET") {
    const chat = url.searchParams.get("container_id");
    const start = Number(url.searchParams.get("start_time")) * 1000;
    const end = Number(url.searchParams.get("end_time")) * 1000 + 999;
    const size = Number(url.searchParams.get("page_size") ?? 20);
    const offset = Number(url.searchParams.get("page_token") || 0);
    const all = (fake.history.get(chat) ?? []).filter((it) => Number(it.create_time) >= start && Number(it.create_time) <= end).sort((a, b) => Number(a.create_time) - Number(b.create_time));
    const items = all.slice(offset, offset + size);
    fake.lists.push({ at: Date.now(), chat, page: offset / size, items: items.length });
    if (fake.listLatencyMs) await sleep(fake.listLatencyMs);
    const hasMore = offset + size < all.length;
    return json(res, { code: 0, msg: "success", data: { items, has_more: hasMore, ...(hasMore ? { page_token: String(offset + size) } : {}) } });
  }
  if ((m = p.match(/^\/open-apis\/im\/v1\/messages\/([^/]+)\/reply$/u))) {
    let msgType;
    try { msgType = JSON.parse(body).msg_type; } catch {}
    fake.replies.push({ to: m[1], at: Date.now(), msgType });
    return json(res, { code: 0, msg: "ok", data: { message_id: `om_reply_${fake.replies.length}`, chat_id: "oc_x", create_time: String(Date.now()) } });
  }
  if ((m = p.match(/^\/open-apis\/im\/v1\/messages\/([^/]+)\/reactions/u))) {
    if (req.method === "POST") fake.reactions.push({ to: m[1], at: Date.now() });
    return json(res, { code: 0, msg: "ok", data: { reaction_id: `r_${fake.reactions.length}` } });
  }
  if (p === "/open-apis/im/v1/messages" && req.method === "POST") {
    let parsed = {};
    try { parsed = JSON.parse(body); } catch {}
    fake.replies.push({ to: `create:${parsed.receive_id}`, at: Date.now(), msgType: parsed.msg_type });
    return json(res, { code: 0, msg: "ok", data: { message_id: `om_create_${fake.replies.length}` } });
  }
  if ((m = p.match(/^\/open-apis\/im\/v1\/chats\/([^/]+)$/u))) return json(res, { code: 0, msg: "ok", data: { chat_id: m[1], name: "test", chat_mode: "group", chat_type: "private", owner_id: ALICE } });
  if (p.startsWith("/open-apis/contact/v3/users/")) return json(res, { code: 0, msg: "ok", data: { user: { name: "Alice", open_id: ALICE } } });
  if (p.startsWith("/open-apis/cardkit/v1/cards") && req.method === "POST" && /\/cards$/u.test(p)) return json(res, { code: 0, msg: "ok", data: { card_id: `card_${randomUUID()}` } });
  if (p.startsWith("/open-apis/cardkit/v1/cards/") && req.method !== "GET") {
    let text = "";
    try { const b = JSON.parse(body); text = String(b.content ?? b.card?.data ?? b.element ?? b.settings ?? "").slice(0, 160); } catch {}
    fake.cardWrites.push({ at: Date.now(), method: req.method, path: p.replace(/card_[0-9a-f-]+/gu, ":card"), text });
    return json(res, { code: 0, msg: "ok", data: {} });
  }
  const key = `${req.method} ${p.replace(/o[mc]_[A-Za-z0-9_-]+/gu, ":id")}`;
  fake.unknown.set(key, (fake.unknown.get(key) ?? 0) + 1);
  return json(res, { code: 0, msg: "ok", data: {} });
});
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  if (fake.refusing) { socket.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n"); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => {
    fake.connections += 1;
    fake.sockets.add(ws);
    ws.on("close", () => fake.sockets.delete(ws));
    ws.on("message", (data) => {
      const f = decodeFrame(Buffer.from(data));
      if (f.method === 0 && f.h.type === "ping") {
        ws.send(encodeFrame({ method: 0, service: 1, headers: [{ key: "type", value: "pong" }], payload: Buffer.from(JSON.stringify({ PingInterval: 120, ReconnectCount: -1, ReconnectInterval: 2, ReconnectNonce: 0 })) }));
        return;
      }
      if (f.method === 1 && f.h.message_id) {
        let code;
        try { code = JSON.parse(f.payload.toString()).code; } catch {}
        fake.acks.set(f.h.message_id, { code, at: Date.now() });
      }
    });
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const FAKE_URL = `https://127.0.0.1:${server.address().port}`;

// A message exists in the chat history (what im/v1/messages returns); push() also delivers it.
const messages = new Map();
function addMessage({ id, chat, chatType, text, mentionBot = false, sender = "user", at = Date.now() }) {
  const content = JSON.stringify({ text: mentionBot ? `@_user_1 ${text}` : text });
  const msg = { id, chat, chatType, content, mentionBot, sender, at, eventId: `ev_${randomUUID().replaceAll("-", "")}` };
  messages.set(id, msg);
  const item = {
    message_id: id, msg_type: "text", create_time: String(at), update_time: String(at), deleted: false, updated: false, chat_id: chat,
    sender: sender === "user" ? { id: ALICE, id_type: "open_id", sender_type: "user", tenant_key: "tk_fake" } : { id: "cli_other_app", id_type: "app_id", sender_type: "app", tenant_key: "tk_fake" },
    body: { content },
    ...(mentionBot ? { mentions: [{ key: "@_user_1", id: BOT, id_type: "open_id", name: "V", tenant_key: "tk_fake" }] } : {}),
  };
  if (!fake.history.has(chat)) fake.history.set(chat, []);
  fake.history.get(chat).push(item);
  return msg;
}
function push(msg) {
  const envelope = {
    schema: "2.0",
    header: { event_id: msg.eventId, token: "", create_time: String(msg.at), event_type: "im.message.receive_v1", tenant_key: "tk_fake", app_id: APP_ID },
    event: {
      sender: { sender_id: { open_id: ALICE, union_id: "on_vcatchup_alice", user_id: "u_alice" }, sender_type: msg.sender, tenant_key: "tk_fake" },
      message: {
        message_id: msg.id, chat_id: msg.chat, chat_type: msg.chatType, message_type: "text", content: msg.content, create_time: String(msg.at),
        ...(msg.mentionBot ? { mentions: [{ key: "@_user_1", id: { open_id: BOT, union_id: "on_vbot", user_id: null }, name: "V", tenant_key: "tk_fake" }] } : {}),
      },
    },
  };
  const frameId = `frame_${++fake.seq}`;
  let sent = 0;
  for (const ws of fake.sockets) {
    if (ws.readyState !== 1) continue;
    ws.send(encodeFrame({ SeqID: fake.seq, LogID: fake.seq, service: 1, method: 1, headers: [{ key: "type", value: "event" }, { key: "message_id", value: frameId }, { key: "sum", value: "1" }, { key: "seq", value: "0" }, { key: "trace_id", value: randomUUID() }], payload: Buffer.from(JSON.stringify(envelope)) }));
    sent += 1;
  }
  fake.pushes.push({ id: msg.id, frameId, at: Date.now(), sent });
  return frameId;
}
function cutSocket(refuse) {
  fake.refusing = refuse;
  for (const ws of fake.sockets) ws.terminate();
}
// V's own [firsttext-e2e.1] record: one per inbound message the Feishu dispatcher handled (with its
// reply). Replies in p2p are created in the chat, so per-message counts come from the Gateway side.
const repliesTo = (id) => lines.filter((l) => l.includes("[firsttext-e2e.1]") && l.includes(`"inboundMessageId":"${id}"`)).length;
const reactionsTo = (id) => fake.reactions.filter((r) => r.to === id).length;

// ---------------------------------------------------------------- loopback DeepSeek
const calls = []; // { tag, kind, at, headerAt, argsEndAt, textAt }
const ccChunk = (model, delta, finish, usage) => `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model, choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`;
const flatten = (c) => typeof c === "string" ? c : Array.isArray(c) ? c.map((b) => typeof b === "string" ? b : b?.text ?? "").join("") : "";
const TOOL_PREFERENCE = ["session_status", "sessions_list", "agents_list"];
const modelServer = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    const at = Date.now();
    let body = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {}
    if (!/\/chat\/completions\b/u.test(req.url ?? "")) { res.writeHead(404); return res.end(); }
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const users = messages.filter((m) => m.role === "user").map((m) => flatten(m.content));
    const m = /\[ets (tool|text) ([\w-]+)\]/u.exec(users[users.length - 1] ?? "");
    const kind = m?.[1] ?? "other", tag = m?.[2] ?? null;
    const toolDone = messages[messages.length - 1]?.role === "tool";
    const names = (body.tools ?? []).map((t) => t?.function?.name).filter(Boolean);
    const tool = TOOL_PREFERENCE.find((n) => names.includes(n));
    const call = { tag, kind, at, toolDone, tool: null };
    calls.push(call);
    const model = body.model;
    const usage = { prompt_tokens: 1000, completion_tokens: 40, total_tokens: 1040 };
    res.writeHead(200, { "content-type": "text/event-stream" });
    await sleep(MODEL_DELAY_MS);
    res.write(ccChunk(model, { role: "assistant", reasoning_content: "先看一下会话状态，再回答。" }, null));
    await sleep(150);
    if (kind === "tool" && !toolDone && tool) {
      call.tool = tool;
      const id = `call_ets_${tag}`;
      res.write(ccChunk(model, { tool_calls: [{ index: 0, id, type: "function", function: { name: tool, arguments: "" } }] }, null));
      call.headerAt = Date.now();
      // arguments stream for ARG_MS: "{", whitespace pieces, "}" (a valid empty object)
      res.write(ccChunk(model, { tool_calls: [{ index: 0, function: { arguments: "{" } }] }, null));
      const pieces = Math.max(1, Math.round(ARG_MS / 100));
      for (let i = 0; i < pieces; i++) { await sleep(ARG_MS / pieces); res.write(ccChunk(model, { tool_calls: [{ index: 0, function: { arguments: " " } }] }, null)); }
      res.write(ccChunk(model, { tool_calls: [{ index: 0, function: { arguments: "}" } }] }, null));
      call.argsEndAt = Date.now();
      res.end(ccChunk(model, {}, "tool_calls", usage) + "data: [DONE]\n\n");
      return;
    }
    call.textAt = Date.now();
    for (let i = 0; i < 6; i++) { res.write(ccChunk(model, { content: `第${i + 1}段，` }, null)); await sleep(120); }
    res.end(ccChunk(model, { content: `ETS-DONE ${tag ?? "x"}` }, null) + ccChunk(model, {}, "stop", usage) + "data: [DONE]\n\n");
  });
});
await new Promise((resolve) => modelServer.listen(0, "127.0.0.1", resolve));
const standin = `http://127.0.0.1:${modelServer.address().port}/v1`;


// ---------------------------------------------------------------- config: one fake Feishu app, the loopback model
function useStandin(c) {
  const deepseek = c.models?.providers?.deepseek;
  assert(deepseek, "config has no deepseek provider");
  Object.assign(deepseek, { baseUrl: standin, apiKey: "sk-standin-loopback" });
  const model = { primary: "deepseek/deepseek-flash", fallbacks: [] };
  c.agents.defaults.model = model;
  if (c.agents.entries?.makaron) c.agents.entries.makaron.model = model;
  if (c.tools?.web?.search) delete c.tools.web.search;
  if (c.cron) c.cron.enabled = false;
  return c;
}
const config = useStandin(JSON.parse(JSON.stringify(config0)));
const port = Number(config.gateway?.port);
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
const { appId: _a, appSecret: _s, ...feishuShape } = config.channels.feishu;
config.channels = {
  feishu: {
    ...feishuShape, enabled: true, appId: APP_ID, appSecret: "fake-secret-not-a-credential", domain: FAKE_URL, connectionMode: "websocket",
    dmPolicy: "open", groupPolicy: "open", allowFrom: ["*"], groupAllowFrom: ["*"], resolveSenderNames: false,
  },
};
const keep = new Set(["feishu", "deepseek", "codex", "moonshot", "vlab-agent-worker-isolation"]); // codex/moonshot: referenced by model config; doctor reinstalls them otherwise
config.plugins.entries = Object.fromEntries(Object.entries(config.plugins.entries ?? {}).filter(([id]) => keep.has(id)));
if (Array.isArray(config.plugins.allow)) config.plugins.allow = config.plugins.allow.filter((id) => keep.has(id));
config.plugins.load.paths = config.plugins.load.paths.filter((p) => p.endsWith("/@openclaw/feishu") || p.includes("deepseek-provider") || p.includes("moonshot-provider") || p.endsWith("/production-worker"));
const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "worker isolation plugin is not configured");
Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0 });
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const workerConfig = useStandin(JSON.parse(fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
  .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime)));
workerConfig.channels = {}; // the Worker never opens channels
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, JSON.stringify(workerConfig, null, 2), { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
config.bindings = [{ agentId: "makaron", match: { channel: "feishu" } }];
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
evidence.config = { channels: Object.keys(config.channels), plugins: Object.keys(config.plugins.entries), model: "loopback deepseek-flash", domain: "fake (127.0.0.1)" };

// ---------------------------------------------------------------- Gateway, with an event-loop delay sampler
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
const tmpDir = path.join(scratch, "tmp");
const cacheDir = path.join(scratch, "cache");
for (const d of [tmpDir, cacheDir]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
const eldFile = path.join(scratch, "eld.jsonl");
const eldPreload = path.join(scratch, "eld-preload.mjs");
fs.writeFileSync(eldPreload, `import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import fs from "node:fs";
if (process.argv.includes("gateway")) {
  const h = monitorEventLoopDelay({ resolution: 10 }); h.enable();
  let elu = performance.eventLoopUtilization();
  const t = setInterval(() => {
    const next = performance.eventLoopUtilization(); const d = performance.eventLoopUtilization(next, elu); elu = next;
    fs.appendFileSync(${JSON.stringify(eldFile)}, JSON.stringify({ t: Date.now(), pid: process.pid, max: h.max / 1e6, p99: h.percentile(99) / 1e6, mean: h.mean / 1e6, elu: d.utilization }) + "\\n");
    h.reset();
  }, 1000); t.unref();
}
`);
const env = {
  ...process.env, OPENCLAW_GATEWAY_PORT: String(port),
  TMPDIR: tmpDir, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm"),
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${eldPreload}`.trim(), NODE_EXTRA_CA_CERTS: certFile, OPENCLAW_FIRSTTEXT_WORKER_PHASES: "1",
  ...(ARM === "off" ? { OPENCLAW_EARLY_TOOL_STATUS: "0" } : {}),
};
const lines = [];
let gateway;
function startGateway() {
  gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${runtime}/openclaw/dist/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (chunk) => { lines.push(...chunk.split(/\r?\n/u).filter(Boolean).map((l) => `${Date.now()} ${l}`)); if (lines.length > 40000) lines.splice(0, lines.length - 40000); });
  }
}
async function stopGateway() {
  if (!gateway || gateway.exitCode !== null) return;
  gateway.kill("SIGTERM");
  await Promise.race([new Promise((r) => gateway.once("exit", r)), sleep(30_000)]);
  if (gateway.exitCode === null) { gateway.kill("SIGKILL"); await new Promise((r) => gateway.once("exit", r)); }
}
async function waitFor(what, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) throw new Error(`Gateway exited ${gateway.exitCode} while waiting for ${what}\n${redact(lines.slice(-60).join("\n"))}`);
    if (predicate()) return true;
    await sleep(250);
  }
  return false;
}
const logMatches = (re) => lines.filter((l) => re.test(l));
async function bootGateway(label) {
  const before = fake.connections;
  const t0 = Date.now();
  startGateway();
  let ok;
  try {
    ok = await waitFor("Feishu WebSocket", () => fake.connections > before && fake.sockets.size > 0, 180_000);
  } catch (err) {
    // first start on a fresh candidate state can stop once after doctor's convergence; start again
    if (!logMatches(/migration inputs changed during startup convergence/u).length) throw err;
    step("Gateway asked for a restart after startup convergence");
    startGateway();
    ok = await waitFor("Feishu WebSocket", () => fake.connections > before && fake.sockets.size > 0, 180_000);
  }
  assert(ok, `Gateway did not open the Feishu WebSocket (${label})\n${redact(lines.slice(-60).join("\n"))}`);
  await sleep(3000);
  step(`gateway up (${label})`, { ms: Date.now() - t0, pid: gateway.pid });
}
// The agent turn finishes with a reply to the user's message (POST …/messages/:id/reply).
async function waitReplies(ids, timeoutMs = 150_000) {
  return await waitFor(`replies to ${ids}`, () => ids.every((id) => repliesTo(id) >= 1), timeoutMs);
}

// ---------------------------------------------------------------- turns
const e2e = (id) => {
  for (const l of lines) {
    if (!l.includes("[firsttext-e2e.1]") || !l.includes(`"inboundMessageId":"${id}"`)) continue;
    try { return JSON.parse(l.slice(l.indexOf("{", l.indexOf("[firsttext-e2e.1]")))); } catch {}
  }
  return null;
};
const DM = "oc_vets_dm_alice";
let seq = 0;
async function turn(kind) {
  const tag = `${ARM}-${++seq}`;
  const id = `om_ets_${seq}`;
  const msg = addMessage({ id, chat: DM, chatType: "p2p", text: `（自动化测试 early-tool-status）[ets ${kind} ${tag}] 看一下会话状态再回答一句` });
  push(msg);
  const ok = await waitFor(`reply ${id}`, () => e2e(id)?.visibleAtMs, 150_000);
  await sleep(1500);
  const rec = e2e(id) ?? {};
  const mine = calls.filter((c) => c.tag === tag);
  const toolCall = mine.find((c) => c.headerAt);
  const writes = fake.cardWrites.filter((w) => w.at >= msg.at);
  const firstContent = writes.find((w) => /\/content$/u.test(w.path) && w.text.trim() && w.text !== "\u200b");
  const r = {
    kind, tag, id, ok: Boolean(ok), sentAt: msg.at,
    sentToFirstPushMs: rec.firstPushAtMs ? rec.firstPushAtMs - rec.sentAtMs : null,
    sentToCardStartMs: rec.cardStartAtMs ? rec.cardStartAtMs - rec.sentAtMs : null,
    sentToAnswerPushMs: rec.firstAnswerPushAtMs ? rec.firstAnswerPushAtMs - rec.sentAtMs : null,
    headerToFirstPushMs: toolCall && rec.firstPushAtMs ? rec.firstPushAtMs - toolCall.headerAt : null,
    headerToCardStartMs: toolCall && rec.cardStartAtMs ? rec.cardStartAtMs - toolCall.headerAt : null,
    argsEndToFirstPushMs: toolCall && rec.firstPushAtMs ? rec.firstPushAtMs - toolCall.argsEndAt : null,
    textToFirstPushMs: !toolCall && mine.find((c) => c.textAt) && rec.firstPushAtMs ? rec.firstPushAtMs - mine.find((c) => c.textAt).textAt : null,
    firstPushBeforeArgsEnd: toolCall && rec.firstPushAtMs ? rec.firstPushAtMs < toolCall.argsEndAt : null,
    firstContent: firstContent ? { atFromSend: firstContent.at - msg.at, text: firstContent.text.slice(0, 80) } : null,
    modelCalls: mine.length, tool: toolCall?.tool ?? null,
  };
  step("turn", r);
  return r;
}
const stat = (v) => { const s = v.filter((x) => typeof x === "number").sort((a, b) => a - b); const q = (p) => s.length ? s[Math.min(s.length - 1, Math.floor((s.length - 1) * p + 0.5))] : null; return { n: s.length, p50: q(0.5), p90: q(0.9), max: s.length ? s[s.length - 1] : null, all: s }; };

let failure;
try {
  await bootGateway("first start");
  const warm = [await turn("text"), await turn("tool")]; // the Worker's first turns: not measured
  evidence.warm = warm;
  const turns = [];
  const order = [];
  for (let i = 0; i < Math.max(N_TOOL, N_TEXT); i++) { if (i < N_TOOL) order.push("tool"); if (i < N_TEXT && i % 2 === 0) order.push("text"); }
  while (order.filter((k) => k === "text").length < N_TEXT) order.push("text");
  for (const kind of order) turns.push(await turn(kind));
  const tool = turns.filter((t) => t.kind === "tool"), text = turns.filter((t) => t.kind === "text");
  evidence.turns = turns;
  evidence.summary = {
    toolHeaderToFirstPushMs: stat(tool.map((t) => t.headerToFirstPushMs)),
    toolHeaderToCardStartMs: stat(tool.map((t) => t.headerToCardStartMs)),
    toolSentToFirstPushMs: stat(tool.map((t) => t.sentToFirstPushMs)),
    toolSentToAnswerPushMs: stat(tool.map((t) => t.sentToAnswerPushMs)),
    textSentToFirstPushMs: stat(text.map((t) => t.sentToFirstPushMs)),
    textModelToFirstPushMs: stat(text.map((t) => t.textToFirstPushMs)),
    toolFirstPushBeforeArgsEnd: tool.filter((t) => t.firstPushBeforeArgsEnd).length,
  };
  check("every turn replied", turns.every((t) => t.ok) && warm.every((t) => t.ok), { failed: turns.filter((t) => !t.ok).map((t) => t.tag) });
  check("every tool turn called the tool", tool.every((t) => t.tool && t.modelCalls >= 2), { tools: tool.map((t) => t.tool) });
  if (ARM === "on") check("status line pushed while arguments still stream (>= 80% of tool turns)", evidence.summary.toolFirstPushBeforeArgsEnd >= Math.ceil(tool.length * 0.8), { n: evidence.summary.toolFirstPushBeforeArgsEnd, of: tool.length });
  else check("without early status the first push waits for the arguments (all tool turns)", evidence.summary.toolFirstPushBeforeArgsEnd === 0, { n: evidence.summary.toolFirstPushBeforeArgsEnd, of: tool.length });
} catch (err) {
  failure = redact(err?.stack ?? err);
} finally {
  await stopGateway().catch(() => {});
  server.close();
  modelServer.close();
}
evidence.unknownFeishuCalls = Object.fromEntries(fake.unknown);
evidence.errorsLog = logMatches(/feishu.*(error|failed)/iu).slice(-15).map((l) => redact(l.slice(14)));
evidence.turnErrorLog = logMatches(/outcome=error|FailoverError|No API key|api key|401|403|rate limit|model.*(error|failed)|embedded.*(error|failed)/iu).filter((l) => !/card-phase/u.test(l)).slice(0, 12).map((l) => redact(l.slice(14)).slice(0, 600));
evidence.failure = failure ?? null;
evidence.ok = !failure && evidence.checks.length > 0 && evidence.checks.every((c) => c.ok);
console.log(JSON.stringify(evidence, null, 1));
console.log(`RESULT arm=${ARM} argMs=${ARG_MS} tool header->firstPush p50 ${evidence.summary?.toolHeaderToFirstPushMs?.p50} p90 ${evidence.summary?.toolHeaderToFirstPushMs?.p90}; tool sent->firstPush p50 ${evidence.summary?.toolSentToFirstPushMs?.p50}; text sent->firstPush p50 ${evidence.summary?.textSentToFirstPushMs?.p50}; before-args-end ${evidence.summary?.toolFirstPushBeforeArgsEnd}; ok ${evidence.ok}`);
process.exitCode = evidence.ok ? 0 : 1;
