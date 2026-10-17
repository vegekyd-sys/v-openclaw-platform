// Candidate e2e: Feishu ingress catch-up (lab/patch-feishu-ingress-catchup.mjs) in a real Gateway.
//
// A private Gateway on the candidate config copy runs V's Feishu plugin (31238429…, patched or not)
// against a local fake Feishu: the REST API the plugin calls, and a WebSocket endpoint that speaks
// the Lark SDK's pbbp2 frame protocol, so the SDK's own reconnect loop, the durable ingress, the
// dedupe store, the handler and a real model turn all run unmodified. No real Feishu credentials are
// used: the candidate config's Feishu, DingTalk, WeCom and Telegram channels are replaced by one fake
// Feishu app whose domain is the fake server. Event-loop stalls are real: SIGSTOP on the Gateway.
//
// FT_PHASE selects one scenario per run (each run stays under the 10-minute candidate call):
//   baseline  V's bytes unpatched: a message sent while the socket is down waits for the re-push
//   reconnect patched: socket cut → pull once → Feishu's re-push dropped; gating; follow-up pass
//   stall     patched: SIGSTOP 22 s with the socket up → pull once; buffered push not doubled
//   restart   patched: pulled message re-pushed after a Gateway restart → persistent marker drops it;
//             a message sent while the Gateway was down is NOT pulled (documented limit)
//   load      patched: 200 chats × 150 listed items over a 2-minute gap; API calls and main thread
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { patchFeishuMonitor } from "../patch-feishu-ingress-catchup.mjs";

const PHASE = process.env.FT_PHASE ?? "reconnect";
const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const BASE_SHA = "31238429f12f79f907bf03702779a83ebe0e70a79ea6ca10b2acdefbcff95dc5";
const PATCHED_SHA = "ffdf7072cf7d93cec6d52ad2f72ed2357d872ef310c7e643d169829ef8671bcc";
const APP_ID = "cli_0000feed0000beef"; // SDK requires cli_ + 16 hex; not a real app
const BOT = "ou_vcatchup_fake_bot";
const ALICE = "ou_vcatchup_alice";
const T_START = Date.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const since = () => `${((Date.now() - T_START) / 1000).toFixed(1)}s`;
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const evidence = { phase: PHASE, steps: [], checks: [] };
const step = (name, data = {}) => { evidence.steps.push({ at: since(), name, ...data }); console.error(`[${since()}] ${name} ${JSON.stringify(data)}`); };
const check = (name, ok, data = {}) => { evidence.checks.push({ name, ok: Boolean(ok), ...data }); if (!ok) console.error(`CHECK FAILED ${name} ${JSON.stringify(data)}`); };

function readSecretsEnv() {
  const env = {};
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/gu, "");
  }
  return env;
}

// ---------------------------------------------------------------- Feishu plugin bytes
const config0 = JSON.parse(fs.readFileSync(configPath, "utf8"));
const feishuDir = config0.plugins.load.paths.find((p) => p.endsWith("/@openclaw/feishu"));
assert(feishuDir?.startsWith(runtime), "must only patch the private candidate runtime");
const monitorFile = path.join(feishuDir, "dist", "monitor.account-WFdlCDhR.js");
const original = fs.readFileSync(monitorFile);
assert.equal(sha256(original), BASE_SHA, "candidate Feishu monitor must be V's bytes");
if (PHASE !== "baseline") {
  const patched = patchFeishuMonitor(original.toString("utf8"));
  assert.equal(sha256(patched), PATCHED_SHA, "rebuilt patch must equal the release file");
  fs.writeFileSync(monitorFile, patched);
  assert.equal(spawnSync(process.execPath, ["--check", monitorFile]).status, 0);
}
evidence.monitorSha = sha256(fs.readFileSync(monitorFile));
// Candidate-only (as in feishu-dm-approvals.mjs): the private runtime has no official install record
// for the relocated Feishu plugin, so the trusted-runtime gate would refuse its ingress queue. Allow
// exactly the Feishu plugin in this private copy; shared VLab and V are untouched.
{
  const dist = path.join(runtime, "openclaw", "dist");
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

// ---------------------------------------------------------------- config: one fake Feishu app, nothing else outbound
const secrets = readSecretsEnv();
assert(secrets.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY missing from shared secrets.env");
const config = JSON.parse(JSON.stringify(config0));
const port = Number(config.gateway?.port);
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
const { appId: _a, appSecret: _s, ...feishuShape } = config.channels.feishu;
config.channels = {
  feishu: {
    ...feishuShape, enabled: true, appId: APP_ID, appSecret: "fake-secret-not-a-credential", domain: FAKE_URL, connectionMode: "websocket",
    requireMention: PHASE === "load" ? true : feishuShape.requireMention, dmPolicy: "open", groupPolicy: "open", allowFrom: ["*"], groupAllowFrom: ["*"],
    resolveSenderNames: false,
  },
};
config.cron = { ...(config.cron ?? {}), enabled: false };
if (config.tools?.web?.search) delete config.tools.web.search; // its provider plugin is not loaded here
const keep = new Set(["feishu", "deepseek", "codex", "moonshot", "vlab-agent-worker-isolation"]); // codex/moonshot: referenced by model config; doctor reinstalls them otherwise
config.plugins.entries = Object.fromEntries(Object.entries(config.plugins.entries ?? {}).filter(([id]) => keep.has(id)));
if (Array.isArray(config.plugins.allow)) config.plugins.allow = config.plugins.allow.filter((id) => keep.has(id));
config.plugins.load.paths = config.plugins.load.paths.filter((p) => p.endsWith("/@openclaw/feishu") || p.includes("deepseek-provider") || p.includes("moonshot-provider") || p.endsWith("/production-worker"));
// Turns run in vlab-worker processes as on V; the Worker reads its own config file (relocated here).
const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0 });
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = JSON.parse(fs.readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
    .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime));
  workerConfig.channels = {}; // the Worker never opens channels; keep real credentials out of it too
  if (workerConfig.cron) workerConfig.cron.enabled = false;
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, JSON.stringify(workerConfig, null, 2), { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
config.bindings = [{ agentId: "makaron", match: { channel: "feishu" } }];
if (config.agents.entries.makaron?.model) config.agents.entries.makaron.model = { primary: "deepseek/deepseek-flash", fallbacks: [] };
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
evidence.config = { channels: Object.keys(config.channels), plugins: Object.keys(config.plugins.entries), requireMention: config.channels.feishu.requireMention, domain: "fake (127.0.0.1)" };

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
  ...process.env, DEEPSEEK_API_KEY: secrets.DEEPSEEK_API_KEY, OPENCLAW_GATEWAY_PORT: String(port),
  TMPDIR: tmpDir, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm"),
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${eldPreload}`.trim(), NODE_EXTRA_CA_CERTS: certFile,
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
const visible = (id) => lines.filter((l) => l.includes("[firsttext-e2e.1]") && l.includes(`"inboundMessageId":"${id}"`) && l.includes('"visibleAtMs":')).length;
const ask = (token) => `只回复四个字和编号，不要调用任何工具：收到 ${token}`;

// ---------------------------------------------------------------- scenarios
const DM = "oc_vcatchup_dm_alice";
const G_MENTION = "oc_vcatchup_group_mention_only";
const G_ALL = "oc_vcatchup_group_all_messages";
async function warmUp() {
  const w1 = addMessage({ id: "om_w1", chat: DM, chatType: "p2p", text: ask("W1") });
  const w2 = addMessage({ id: "om_w2", chat: G_MENTION, chatType: "group", text: ask("W2"), mentionBot: true });
  const w3 = addMessage({ id: "om_w3", chat: G_ALL, chatType: "group", text: ask("W3") }); // no @: this chat pushes everything
  for (const m of [w1, w2, w3]) push(m);
  const ok = await waitReplies(["om_w1", "om_w2", "om_w3"]);
  step("warm-up replies", { ok, w1: repliesTo("om_w1"), w2: repliesTo("om_w2"), w3: repliesTo("om_w3"), visible: ["om_w1", "om_w2", "om_w3"].map(visible), turnErrors: logMatches(/outcome=error/u).length });
  assert(ok, `warm-up turns did not reply\n${redact(lines.slice(-80).join("\n"))}`);
}

async function scenarioReconnect({ patched }) {
  await warmUp();
  const r0 = addMessage({ id: "om_r0", chat: DM, chatType: "p2p", text: ask("R0") });
  push(r0); // on time, acknowledged: the pull must see it as already received
  await waitReplies(["om_r0"]);
  const downAt = Date.now();
  cutSocket(true);
  step("socket cut, reconnects refused");
  await sleep(4000);
  const sent = [
    addMessage({ id: "om_r1", chat: DM, chatType: "p2p", text: ask("R1") }),
    addMessage({ id: "om_r2", chat: G_MENTION, chatType: "group", text: ask("R2"), mentionBot: true }),
    addMessage({ id: "om_r3", chat: G_MENTION, chatType: "group", text: "这条没有 @V，Feishu 本来就不推" }),
    addMessage({ id: "om_r4", chat: G_ALL, chatType: "group", text: ask("R4") }),
    addMessage({ id: "om_r5", chat: G_MENTION, chatType: "group", text: ask("R5"), mentionBot: true, sender: "app" }),
  ];
  await sleep(16_000);
  fake.refusing = false;
  const reconnected = await waitFor("reconnect", () => fake.sockets.size > 0, 30_000);
  const upAt = Date.now();
  step("socket back", { reconnected, downMs: upAt - downAt });
  const pulled = ["om_r1", "om_r2", "om_r4"];
  const got = await waitReplies(pulled, patched ? 150_000 : 60_000);
  const firstReply = Object.fromEntries(pulled.map((id) => [id, fake.replies.find((r) => r.to === id)?.at ?? null]));
  step("after reconnect", { got, replies: Object.fromEntries(sent.map((m) => [m.id, repliesTo(m.id)])), secondsFromSendToReply: Object.fromEntries(pulled.map((id) => [id, firstReply[id] ? Math.round((firstReply[id] - messages.get(id).at) / 1000) : null])) });
  const passLines = logMatches(/ingress catch-up \(WebSocket reconnected/u).map((l) => redact(l.slice(14)));
  if (patched) {
    check("pulled messages answered once after reconnect", got && pulled.every((id) => repliesTo(id) === 1), { replies: pulled.map(repliesTo) });
    check("un-mentioned message in a mention-only group not pulled", repliesTo("om_r3") === 0 && reactionsTo("om_r3") === 0);
    check("app message not pulled", repliesTo("om_r5") === 0 && reactionsTo("om_r5") === 0);
    check("pass log: injected 3, on-time push seen as already received", passLines.some((l) => /injected 3, already received [1-9]/u.test(l)), { passLines });
  } else {
    check("baseline: nothing arrives without Feishu's re-push", !got && pulled.every((id) => repliesTo(id) === 0), { replies: pulled.map(repliesTo), passLines });
  }
  // Feishu's re-push timer: same event, same event_id, minutes later in production; here ≥60 s after sending.
  const wait = Math.max(0, messages.get("om_r4").at + 65_000 - Date.now());
  await sleep(wait);
  const frames = pulled.map((id) => push(messages.get(id)));
  step("Feishu re-push sent", { frames: frames.length });
  if (patched) {
    await sleep(35_000);
    const drops = logMatches(/dropping Feishu re-push of message om_r[124]/u).length;
    check("re-push dropped and acknowledged, no second reply", drops === 3 && pulled.every((id) => repliesTo(id) === 1) && frames.every((f) => fake.acks.get(f)?.code === 200), { drops, replies: pulled.map(repliesTo), acks: frames.map((f) => fake.acks.get(f) ?? null) });
    const ok = await waitFor("follow-up pass", () => logMatches(/ingress catch-up \(follow-up of WebSocket reconnected/u).length > 0, 40_000);
    const follow = logMatches(/ingress catch-up \(follow-up of WebSocket/u).map((l) => redact(l.slice(14)));
    check("follow-up pass injects nothing new", ok && follow.every((l) => /injected 0,/u.test(l)), { follow });
  } else {
    const got2 = await waitReplies(pulled, 150_000);
    check("baseline: the re-push is what delivers them", got2 && pulled.every((id) => repliesTo(id) === 1), { replies: pulled.map(repliesTo), secondsFromSend: pulled.map((id) => Math.round(((fake.replies.find((r) => r.to === id)?.at ?? NaN) - messages.get(id).at) / 1000)) });
  }
  evidence.pass = passLines;
}

async function scenarioStall() {
  await warmUp();
  const stopAt = Date.now();
  process.kill(gateway.pid, "SIGSTOP");
  step("Gateway SIGSTOP (socket stays up)");
  await sleep(3000);
  const s1 = addMessage({ id: "om_s1", chat: DM, chatType: "p2p", text: ask("S1") }); // Feishu gave up pushing
  const s2 = addMessage({ id: "om_s2", chat: G_MENTION, chatType: "group", text: ask("S2"), mentionBot: true });
  const s2frame = push(s2); // pushed into the socket buffer while frozen; read after SIGCONT
  await sleep(19_000);
  process.kill(gateway.pid, "SIGCONT");
  step("Gateway SIGCONT", { stoppedMs: Date.now() - stopAt });
  const got = await waitReplies(["om_s1", "om_s2"]);
  const pass = logMatches(/ingress catch-up \(event loop stalled/u).map((l) => redact(l.slice(14)));
  step("after stall", { got, s1: repliesTo("om_s1"), s2: repliesTo("om_s2"), pass });
  check("stall pull answers the unpushed message once; buffered push not doubled", got && repliesTo("om_s1") === 1 && repliesTo("om_s2") === 1, { s1: repliesTo("om_s1"), s2: repliesTo("om_s2") });
  check("stall pass log", pass.some((l) => /event loop stalled 2\ds\): .*injected 1, already received [1-9]/u.test(l)), { pass });
  check("late ack for buffered push", fake.acks.get(s2frame)?.code === 200, { ack: fake.acks.get(s2frame) ?? null });
  await sleep(Math.max(0, s1.at + 65_000 - Date.now()));
  const f1 = push(s1);
  const f2 = push(s2); // Feishu re-pushes s2 too: its ack came after the 3 s deadline
  await sleep(35_000);
  const drops = logMatches(/dropping Feishu re-push of message om_s1/u).length;
  check("re-push of pulled s1 dropped; re-push of pushed s2 deduped by the handler", drops === 1 && repliesTo("om_s1") === 1 && repliesTo("om_s2") === 1 && fake.acks.get(f1)?.code === 200 && fake.acks.get(f2)?.code === 200, { drops, s1: repliesTo("om_s1"), s2: repliesTo("om_s2") });
  evidence.pass = pass;
}

async function scenarioRestart() {
  await warmUp();
  cutSocket(true);
  await sleep(3000);
  const p1 = addMessage({ id: "om_p1", chat: DM, chatType: "p2p", text: ask("P1") });
  await sleep(5000);
  fake.refusing = false;
  const got = await waitReplies(["om_p1"]);
  check("pulled after reconnect", got && repliesTo("om_p1") === 1, { p1: repliesTo("om_p1") });
  const markerLine = logMatches(/ingress catch-up injected message om_p1/u).length;
  await stopGateway();
  step("Gateway stopped");
  const x1 = addMessage({ id: "om_x1", chat: DM, chatType: "p2p", text: ask("X1") }); // sent while V is down: Feishu cannot push
  await sleep(5000);
  await bootGateway("after restart");
  await sleep(Math.max(0, p1.at + 65_000 - Date.now()));
  const f1 = push(p1); // Feishu's re-push of the pulled message, now to a new process
  await sleep(30_000);
  const drops = logMatches(/dropping Feishu re-push of message om_p1/u).length;
  check("persistent marker drops the re-push in a new process", markerLine === 1 && drops === 1 && repliesTo("om_p1") === 1 && fake.acks.get(f1)?.code === 200, { drops, p1: repliesTo("om_p1"), ack: fake.acks.get(f1) ?? null });
  const xPulled = logMatches(/ingress catch-up injected message om_x1/u).length;
  check("limit: a message sent while the Gateway was down is not pulled by the new process", xPulled === 0 && repliesTo("om_x1") === 0, { xPulled, x1: repliesTo("om_x1"), passes: logMatches(/ingress catch-up \(/u).length });
  push(x1);
  const gotX = await waitReplies(["om_x1"]);
  check("its Feishu re-push still delivers it once", gotX && repliesTo("om_x1") === 1, { x1: repliesTo("om_x1") });
}

async function scenarioLoad() {
  const CHATS = Number(process.env.FT_LOAD_CHATS ?? 200);
  const PER_CHAT = Number(process.env.FT_LOAD_ITEMS ?? 150);
  const chats = Array.from({ length: CHATS }, (_, i) => `oc_vcatchup_load_${String(i).padStart(3, "0")}`);
  // every chat seen once (an un-mentioned push: Feishu pushes these chats everything; requireMention=true so no turns)
  for (const chat of chats) push(addMessage({ id: `om_seen_${chat}`, chat, chatType: "group", text: "hello" }));
  await waitFor("chats noted", () => fake.pushes.filter((p) => p.id.startsWith("om_seen_")).every((p) => fake.acks.get(p.frameId)), 120_000);
  step("load chats noted", { chats: CHATS });
  // already received: 2 user messages per chat pushed (and acknowledged) shortly before the cut
  const oldFrames = [];
  for (const chat of chats) for (let k = 0; k < 2; k += 1) oldFrames.push(push(addMessage({ id: `om_old_${chat}_${k}`, chat, chatType: "group", text: `earlier ${k}` })));
  await waitFor("old pushes acknowledged", () => oldFrames.every((f) => fake.acks.get(f)), 120_000);
  await sleep(5_000);
  const downAt = Date.now();
  cutSocket(true);
  await sleep(120_000);
  // the gap: per chat PER_CHAT-3 other-app messages and 1 user message Feishu never pushed
  for (const chat of chats) {
    for (let k = 0; k < PER_CHAT - 3; k += 1) addMessage({ id: `om_app_${chat}_${k}`, chat, chatType: "group", text: `bot noise ${k}`, sender: "app", at: downAt + 1000 + k * 500 });
    addMessage({ id: `om_new_${chat}`, chat, chatType: "group", text: "gap message", at: downAt + 30_000 });
  }
  const idle = fs.existsSync(eldFile) ? fs.readFileSync(eldFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((s) => s.t > downAt + 30_000 && s.t < Date.now()) : [];
  const listStart = fake.lists.length;
  fake.refusing = false;
  await waitFor("reconnect", () => fake.sockets.size > 0, 30_000);
  const upAt = Date.now();
  const ok = await waitFor("load pass", () => logMatches(/ingress catch-up \(WebSocket reconnected/u).length > 0, 240_000);
  const doneAt = Date.now();
  await sleep(3000);
  const pass = logMatches(/ingress catch-up \(WebSocket reconnected/u).map((l) => redact(l.slice(14)));
  const passLogAt = Number(logMatches(/ingress catch-up \(WebSocket reconnected/u)[0]?.slice(0, 13));
  const calls = fake.lists.slice(listStart).filter((c) => c.at <= doneAt);
  const perSecond = new Map();
  for (const c of calls) perSecond.set(Math.floor(c.at / 1000), (perSecond.get(Math.floor(c.at / 1000)) ?? 0) + 1);
  const firstCall = calls[0]?.at;
  const eld = fs.readFileSync(eldFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((s) => s.pid === gateway.pid);
  const during = eld.filter((s) => s.t >= (firstCall ?? upAt) && s.t <= (passLogAt || doneAt) + 1000);
  const stat = (arr, k) => arr.length ? { max: Math.max(...arr.map((s) => s[k])), mean: arr.reduce((a, s) => a + s[k], 0) / arr.length } : null;
  const injected = logMatches(/ingress catch-up injected message om_new_/u).length;
  evidence.load = {
    chats: CHATS, itemsPerChat: PER_CHAT, gapSeconds: Math.round((upAt - downAt) / 1000), listLatencyMs: fake.listLatencyMs,
    listCalls: calls.length, pages: calls.reduce((a, c) => Math.max(a, c.page + 1), 0), itemsListed: calls.reduce((a, c) => a + c.items, 0),
    peakCallsPerSecond: Math.max(0, ...perSecond.values()), passSeconds: firstCall && passLogAt ? (passLogAt - firstCall) / 1000 : null,
    injected, pass,
    eventLoopDuringPass: { samples: during.length, delayMaxMs: stat(during, "max"), delayP99Ms: stat(during, "p99"), elu: stat(during, "elu") },
    eventLoopIdleBefore: { samples: idle.length, delayMaxMs: stat(idle, "max"), elu: stat(idle, "elu") },
  };
  step("load pass", evidence.load);
  check("load pass completed: each chat's gap message injected once, pushed ones seen", ok && injected === CHATS && pass.some((l) => new RegExp(`injected ${CHATS}, already received ${CHATS * 3}, errors 0`, "u").test(l)), { injected, pass });
  check("Feishu list rate under 50/s", evidence.load.peakCallsPerSecond <= 50, { peak: evidence.load.peakCallsPerSecond });
}

// ---------------------------------------------------------------- run
let failure;
try {
  await bootGateway("first start");
  if (PHASE === "baseline") await scenarioReconnect({ patched: false });
  else if (PHASE === "reconnect") await scenarioReconnect({ patched: true });
  else if (PHASE === "stall") await scenarioStall();
  else if (PHASE === "restart") await scenarioRestart();
  else if (PHASE === "load") await scenarioLoad();
  else if (PHASE === "smoke") { await warmUp(); check("smoke", true); }
  else throw new Error(`unknown FT_PHASE ${PHASE}`);
} catch (err) {
  failure = redact(err?.stack ?? err);
} finally {
  await stopGateway().catch(() => {});
  server.close();
}
evidence.unknownFeishuCalls = Object.fromEntries(fake.unknown);
evidence.replies = Object.fromEntries([...new Set(fake.replies.map((r) => r.to))].filter((id) => !id.startsWith("om_seen_")).map((id) => [id, repliesTo(id)]));
evidence.catchupLog = logMatches(/ingress catch-up|dropping Feishu re-push/u).slice(0, 40).map((l) => redact(l.slice(14)));
evidence.errorsLog = logMatches(/feishu.*(error|failed)/iu).slice(-15).map((l) => redact(l.slice(14)));
evidence.turnErrorLog = logMatches(/outcome=error|FailoverError|No API key|api key|401|403|rate limit|model.*(error|failed)|embedded.*(error|failed)/iu).filter((l) => !/card-phase/u.test(l)).slice(0, 12).map((l) => redact(l.slice(14)).slice(0, 600));
evidence.failure = failure ?? null;
evidence.ok = !failure && evidence.checks.length > 0 && evidence.checks.every((c) => c.ok);
console.log(JSON.stringify(evidence, null, 1));
process.exitCode = evidence.ok ? 0 : 1;
