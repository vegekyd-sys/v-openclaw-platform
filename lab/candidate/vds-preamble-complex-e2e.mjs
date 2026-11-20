// Candidate e2e: does the "say one sentence before the first tool call" rule (V workspace AGENTS.md
// rule 4, base vs a rewrite) make complex multi-step /vds tasks slower or worse end to end?
// Sibling of vds-preamble-e2e.mjs (which measured the first visible text on short tasks); same
// environment: one private Gateway with V's Feishu plugin and V's Codex plugin bytes (whole-dist sha
// V_CODEX_DIST_SHA), Codex 0.169.1, real DeepSeek (vds-deepseek-flash, V's alias), a local fake Feishu,
// and a private workspace with V's top-level prompt files (plan support files, never committed) plus
// shared VLab's skills.
//
// Seven tasks with fixtures generated under the private workspace (tasks/<instance>/...) and objective
// checks (final text plus the files the task must produce or fix): multi-file read + summary, run tests
// -> fix -> rerun, log search + arithmetic, notes ("memory") + quote file -> written decision, a script
// that fails twice on the way (permission, missing input), a clue chain, config fix until a validator
// passes. Every arm sees the same fixture content for the same rep.
// PRE_MODE=new: every task instance is a new Feishu DM (new session, new Codex thread).
// PRE_MODE=long: one DM per arm and rep; a large pasted text first (PRE_LONG_CHARS), then the seven
// tasks in the same thread.
// Per turn: sent -> first visible card text, sent -> end of run (V's [firsttext-e2e.1] endAtMs), tool
// calls, model requests, output/reasoning/input tokens (rollout token_usage_record), assistant messages
// and how many of them precede a tool call, final card text length, task check.
import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { createRequire } from "node:module";

const ARMS = (process.env.PRE_ARMS ?? "base,v2").split(",").filter(Boolean);
const MODE = process.env.PRE_MODE ?? "new";
assert(["new", "long"].includes(MODE), "PRE_MODE must be new or long");
const REPS = Number(process.env.PRE_REPS ?? 1);
const ONLY = (process.env.PRE_SCENARIOS ?? "").split(",").filter(Boolean);
const TURN_TIMEOUT_MS = Number(process.env.PRE_TURN_TIMEOUT_MS ?? 600_000);
const V_CODEX_DIST_SHA = process.env.V_CODEX_DIST_SHA ?? "a864aa8ffd263a97b57c03abf890c2fff6c63e2a33bc422804d824f3ae47b4d2";
const V_OWNER = "ou_cb133fd4414f0607e8b46a3195c7b9d8"; // replaced by the fake sender wherever the config names it
const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const secrets = Object.fromEntries(fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u).map((l) => l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/gu, "")]));
assert(secrets.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY missing");
const APP_ID = "cli_0000feed0000beef"; // SDK requires cli_ + 16 hex; not a real app
const BOT = "ou_vpre_fake_bot";
const ALICE = "ou_vpre_alice";
// Feishu direct sessions are keyed by sender (agent:makaron:feishu:direct:<open_id>): every DM chat of
// the run gets its own sender, so its own session and Codex thread. All of them are owners, as Tianyi.
// The chat id is hashed so the arm name never reaches the model.
const dmChat = (arm, scenarioId, rep) => `oc_vpre_dm_${createHash("sha256").update(`cx/${MODE}/${arm}/${scenarioId}/${rep}`).digest("hex").slice(0, 16)}`;
const senderFor = (chat) => (chat.startsWith("oc_vpre_dm_") ? `ou_vpre${createHash("sha256").update(chat).digest("hex").slice(0, 24)}` : ALICE);
const DM_SCENARIOS = ["sales", "calc", "logs", "expo", "report", "chain", "config", "long"];
const T_START = Date.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const since = () => `${((Date.now() - T_START) / 1000).toFixed(1)}s`;
const redact = (s) => {
  let out = String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
  for (const v of Object.values(secrets)) if (v && v.length >= 12) out = out.replaceAll(v, "[redacted]");
  return out;
};
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const evidence = { suite: "complex", mode: MODE, arms: ARMS, reps: REPS, steps: [], checks: [] };
const step = (name, data = {}) => { evidence.steps.push({ at: since(), name, ...data }); console.error(`[${since()}] ${name} ${JSON.stringify(data).slice(0, 600)}`); };
const check = (name, ok, data = {}) => { evidence.checks.push({ name, ok: Boolean(ok), ...data }); if (!ok) console.error(`CHECK FAILED ${name} ${JSON.stringify(data)}`); };

// ---------------------------------------------------------------- inputs (plan support files)
const inputFiles = new Map(); // basename -> absolute path
{
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else inputFiles.set(e.name, f); } };
  if (fs.existsSync("external")) walk("external");
}
const input = (name) => { const f = inputFiles.get(name); assert(f, `support file ${name} missing`); return f; };
const V_FILES = ["AGENTS.md", "SOUL.md", "IDENTITY.md", "USER.md", "MEMORY.md", "TOOLS.md", "HEARTBEAT.md", "PROJECTS.md", "REDLINES.md"];
for (const arm of ARMS) if (arm !== "base") input(`AGENTS.${arm}.md`);
const agentsFor = (arm) => fs.readFileSync(arm === "base" ? input("AGENTS.md") : input(`AGENTS.${arm}.md`));
evidence.inputs = Object.fromEntries([...V_FILES, ...ARMS.filter((a) => a !== "base").map((a) => `AGENTS.${a}.md`)].map((n) => [n, sha256(fs.readFileSync(input(n))).slice(0, 16)]));

// ---------------------------------------------------------------- Codex plugin = V's bytes (as runtime-mix.mjs)
const dist = path.join(runtime, "openclaw", "dist");
if (!fs.existsSync(path.join(stateDir, "npm"))) {
  assert.equal(spawnSync("cp", ["-a", "--reflink=auto", path.join(sharedState, "npm"), path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
}
{
  const sha = (f) => sha256(fs.readFileSync(f));
  const distSha = (dir) => {
    const files = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.isFile()) files.push(f); } };
    walk(dir);
    const lines = files.filter((f) => !/\.bak/u.test(path.basename(f))).map((f) => `dist/${path.relative(dir, f)}`).sort().map((rel) => `${sha(path.join(dir, rel.slice(5)))}  ${rel}\n`);
    return createHash("sha256").update(lines.join("")).digest("hex");
  };
  const codexDists = (base) => (fs.existsSync(path.join(base, "npm", "projects")) ? fs.readdirSync(path.join(base, "npm", "projects")).filter((d) => d.startsWith("openclaw-codex-")).map((d) => path.join(base, "npm", "projects", d, "node_modules", "@openclaw", "codex", "dist")).filter((d) => fs.existsSync(path.join(d, "..", "package.json"))) : []);
  const all = [...codexDists(stateDir), ...codexDists(runtime)];
  const shas = all.map(distSha);
  evidence.codexPlugin = { copies: all.length, allV: shas.every((s) => s === V_CODEX_DIST_SHA) };
  step("codex plugin bytes", evidence.codexPlugin);
  assert(all.length && evidence.codexPlugin.allV, `Codex plugin copies differ from V's bytes: ${shas.map((s) => s.slice(0, 12))}`);
}

// ---------------------------------------------------------------- configuration
const config = JSON.parse(fs.readFileSync(configPath, "utf8").replaceAll(V_OWNER, ALICE));
const port = Number(config.gateway?.port);
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
const VDS_REF = "deepseek/vds-deepseek-flash";
const makaron = config.agents.entries.makaron;
const workspace = makaron.workspace ?? config.agents.defaults.workspace;
assert(workspace.startsWith(scratch), `workspace ${workspace} is not private to this candidate`);
assert(makaron.agentDir.startsWith(stateDir), "agentDir is not private");
const vdsEntry = config.agents.defaults.models?.[VDS_REF];
assert.equal(vdsEntry?.agentRuntime?.id, "codex", "shared config has no /vds codex entry");
for (const target of [config.agents.defaults, makaron]) target.model = { primary: VDS_REF, fallbacks: [] };
config.commands ??= {};
{
  const dmSenders = ARMS.flatMap((arm) => DM_SCENARIOS.flatMap((sid) => Array.from({ length: REPS }, (_, i) => `feishu:${senderFor(dmChat(arm, sid, i + 1))}`)));
  config.commands.ownerAllowFrom = [...new Set([...(config.commands.ownerAllowFrom ?? []).map(String), `feishu:${ALICE}`, ...dmSenders])];
}
// V's plugins.entries.codex (2026-11-20), keeping the candidate's Codex 0.169.1 binary path
{
  const cx = config.plugins.entries.codex;
  assert(cx?.config?.appServer?.command, "codex plugin is not configured");
  cx.enabled = true;
  Object.assign(cx.config, { codexDynamicToolsLoading: "searchable", codexDynamicToolsExclude: ["openclaw"] });
  Object.assign(cx.config.appServer, { mode: "yolo", serviceTier: "priority", approvalPolicy: "never", sandbox: "danger-full-access" });
  evidence.codexBinary = cx.config.appServer.command.replace(/^.*\/(codex-[\d.]+)\/.*$/u, "$1");
}
if (config.cron) config.cron.enabled = false;
if (config.tools?.web?.search) delete config.tools.web.search; // its provider plugins are not loaded here

// Candidate-only (as in feishu-ingress-catchup-e2e.mjs): allow the relocated Feishu plugin's ingress queue.
const feishuDir = config.plugins.load.paths.find((p) => p.endsWith("/@openclaw/feishu"));
assert(feishuDir?.startsWith(runtime), "must only touch the private candidate runtime");
evidence.monitorSha = sha256(fs.readFileSync(path.join(feishuDir, "dist", "monitor.account-WFdlCDhR.js")));
{
  const gate = 'if (record?.origin !== "bundled" && record?.trustedOfficialInstall !== true) throw new Error(`${methodName} is only available for trusted plugins';
  const loaderFile = fs.readdirSync(dist).filter((n) => /^loader-[\w-]{8}\.js$/u.test(n)).map((n) => path.join(dist, n)).find((f) => fs.readFileSync(f, "utf8").includes(gate));
  assert(loaderFile, "trusted-runtime gate not found");
  const src = fs.readFileSync(loaderFile, "utf8");
  assert.equal(src.split(gate).length, 2, "trusted-runtime gate anchor");
  fs.writeFileSync(loaderFile, src.replace(gate, gate.replace("record?.trustedOfficialInstall !== true", 'record?.trustedOfficialInstall !== true && pluginId !== "feishu"')));
}
// V has a paired card renderer (the V app), so its Codex threads get the progress-card line and tool;
// the candidate state has none. PRE_PAIRED_CARD=0 leaves the candidate as it is.
if (process.env.PRE_PAIRED_CARD !== "0") {
  const f = fs.readdirSync(dist).filter((n) => /^device-pairing-[\w-]{8}\.js$/u.test(n)).map((n) => path.join(dist, n)).find((x) => fs.readFileSync(x, "utf8").includes("function hasPairedCardRenderer(baseDir) {"));
  assert(f, "hasPairedCardRenderer not found");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("function hasPairedCardRenderer(baseDir) {", "function hasPairedCardRenderer(baseDir) {\n\treturn Promise.resolve(true);"));
  evidence.pairedCardRenderer = "forced (as V)";
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
    fake.replies.push({ to: m[1], at: Date.now(), msgType }); fake.cardWrites.push({ at: Date.now(), method: "REPLY", path: "/reply", text: String(body).slice(0, 4000) });
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
  if (p.startsWith("/open-apis/cardkit/v1/cards") && req.method === "POST" && /\/cards$/u.test(p)) { fake.cardWrites.push({ at: Date.now(), method: "POST", path: "/cards", text: String(body).slice(0, 4000) }); } if (p.startsWith("/open-apis/cardkit/v1/cards") && req.method === "POST" && /\/cards$/u.test(p)) return json(res, { code: 0, msg: "ok", data: { card_id: `card_${randomUUID()}` } });
  if (p.startsWith("/open-apis/cardkit/v1/cards/") && req.method !== "GET") {
    let text = "";
    try { const b = JSON.parse(body); text = String(b.content ?? b.card?.data ?? b.element ?? b.settings ?? body).slice(0, 4000); } catch {}
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
    sender: sender === "user" ? { id: senderFor(chat), id_type: "open_id", sender_type: "user", tenant_key: "tk_fake" } : { id: "cli_other_app", id_type: "app_id", sender_type: "app", tenant_key: "tk_fake" },
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
      sender: { sender_id: { open_id: senderFor(msg.chat), union_id: `on_${senderFor(msg.chat)}`, user_id: `u_${senderFor(msg.chat)}` }, sender_type: msg.sender, tenant_key: "tk_fake" },
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


// ---------------------------------------------------------------- config: the fake Feishu app, owner sender
const { appId: _a, appSecret: _s, ...feishuShape } = config.channels.feishu;
config.channels = {
  feishu: {
    ...feishuShape, enabled: true, appId: APP_ID, appSecret: "fake-secret-not-a-credential", domain: FAKE_URL, connectionMode: "websocket",
    dmPolicy: "open", groupPolicy: "open", allowFrom: ["*"], groupAllowFrom: ["*"], resolveSenderNames: false, requireMention: false,
  },
};
// as early-tool-status-e2e.mjs: no other channel or background plugin may reach real services
const keep = new Set(["feishu", "deepseek", "codex", "moonshot", "vlab-agent-worker-isolation"]);
config.plugins.entries = Object.fromEntries(Object.entries(config.plugins.entries ?? {}).filter(([id]) => keep.has(id)));
if (Array.isArray(config.plugins.allow)) config.plugins.allow = config.plugins.allow.filter((id) => keep.has(id));
config.plugins.load.paths = config.plugins.load.paths.filter((p) => p.endsWith("/@openclaw/feishu") || p.includes("deepseek-provider") || p.includes("moonshot-provider") || p.endsWith("/production-worker"));
const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "worker isolation plugin is not configured");
Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0 });
{
  const rel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!rel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = JSON.parse(fs.readFileSync(path.join(sharedState, rel), "utf8").replaceAll(sharedState, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime).replaceAll(V_OWNER, ALICE));
  workerConfig.channels = {};
  if (workerConfig.tools?.web?.search) delete workerConfig.tools.web.search;
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, JSON.stringify(workerConfig, null, 2), { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
config.bindings = [{ agentId: "makaron", match: { channel: "feishu" } }];
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
evidence.config = { channels: Object.keys(config.channels), plugins: Object.keys(config.plugins.entries), model: VDS_REF, vdsEntry, owner: config.commands.ownerAllowFrom };

// ---------------------------------------------------------------- private workspace: V's prompt files + shared skills
{
  const sharedConfig = JSON.parse(fs.readFileSync(process.env.VLAB_SHARED_CONFIG_PATH, "utf8"));
  const sharedWs = sharedConfig.agents.entries.makaron?.workspace ?? sharedConfig.agents.defaults.workspace;
  fs.mkdirSync(workspace, { recursive: true });
  for (const d of ["skills", ".agents"]) {
    if (fs.existsSync(path.join(sharedWs, d)) && !fs.existsSync(path.join(workspace, d))) {
      assert.equal(spawnSync("cp", ["-a", "--reflink=auto", path.join(sharedWs, d), path.join(workspace, d)]).status, 0, `copy ${d}`);
    }
  }
  for (const n of V_FILES) fs.copyFileSync(input(n), path.join(workspace, n));
  fs.mkdirSync(path.join(workspace, "assets"), { recursive: true });
  fs.copyFileSync(input("v-avatar.jpg"), path.join(workspace, "assets", "v-avatar.jpg"));
  evidence.workspace = { sharedWs, skills: fs.readdirSync(path.join(workspace, "skills")).length };
}

// ---------------------------------------------------------------- Codex home as V's makaron one
const codexHome = path.join(makaron.agentDir, "codex-home");
{
  const src = path.join(sharedState, "agents", "makaron", "agent", "codex-home");
  fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(codexHome, "config.toml"), `approval_policy = "never"
sandbox_mode = "danger-full-access"

[projects."${workspace}"]
trust_level = "trusted"

[model_providers.deepseek]
request_max_retries = 1
stream_max_retries = 1
name = "DeepSeek"
base_url = "https://api.deepseek.com/v1"
wire_api = "responses"
env_key = "DEEPSEEK_API_KEY"
`, { mode: 0o600 });
  for (const entry of ["plugins", "cache", "skills", "models_cache.json"]) {
    if (fs.existsSync(path.join(src, entry))) fs.cpSync(path.join(src, entry), path.join(codexHome, entry), { recursive: true });
  }
}

// ---------------------------------------------------------------- Gateway
const shortTmp = `/tmp/.vpre-${process.pid}`;
fs.mkdirSync(shortTmp, { recursive: true, mode: 0o700 });
const cacheDir = path.join(scratch, "cache");
fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
const env = {
  ...process.env,
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1", OPENCLAW_DATABASE_VERIFY_RESOURCE_GROUP: "1",
  OPENCLAW_DB91_PROVENANCE_ENABLE: "1", OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE: "1", OPENCLAW_DB91_MAINTENANCE_ENABLE: "1",
  OPENCLAW_WORKER_SESSION_AFFINITY_ENABLE: "1", OPENCLAW_DB91_INTEGRITY_ENABLE: "0", OPENCLAW_DB91_READ_AHEAD_ENABLE: "1",
  OPENCLAW_DB91_STATE_READ_AHEAD_ENABLE: "1", OPENCLAW_DB91_TRAJECTORY_SWEEP_ENABLE: "1",
  PATH: `${path.dirname(process.execPath)}:${process.env.PATH}`, OPENCLAW_PATH_BOOTSTRAPPED: "1", DISABLE_AUTOUPDATER: "1",
  OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: shortTmp, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm"),
  NODE_EXTRA_CA_CERTS: certFile, DEEPSEEK_API_KEY: secrets.DEEPSEEK_API_KEY,
};
const lines = [];
let gateway;
function startGateway() {
  gateway = spawn(process.execPath, ["--experimental-async-context-frame", "--max-old-space-size=8192", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    let rest = "";
    s.on("data", (chunk) => {
      const parts = (rest + chunk).split(/\r?\n/u);
      rest = parts.pop() ?? "";
      lines.push(...parts.filter(Boolean).map((l) => `${Date.now()} ${l.replace(/\x1b\[[0-9;]*m/gu, "")}`));
      if (lines.length > 60000) lines.splice(0, lines.length - 60000);
    });
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
async function bootGateway() {
  const before = fake.connections;
  const t0 = Date.now();
  startGateway();
  let ok;
  try {
    ok = await waitFor("Feishu WebSocket", () => fake.connections > before && fake.sockets.size > 0, 240_000);
  } catch (err) {
    if (!logMatches(/migration inputs changed during startup convergence/u).length) throw err;
    step("Gateway asked for a restart after startup convergence");
    startGateway();
    ok = await waitFor("Feishu WebSocket", () => fake.connections > before && fake.sockets.size > 0, 240_000);
  }
  assert(ok, `Gateway did not open the Feishu WebSocket\n${redact(lines.slice(-60).join("\n"))}`);
  await sleep(3000);
  step("gateway up", { ms: Date.now() - t0, pid: gateway.pid });
}

// ---------------------------------------------------------------- Codex rollouts
// ---------------------------------------------------------------- Codex rollouts
const sessionsDir = path.join(codexHome, "sessions");
const tsMs = (s) => Date.parse(s);
function rolloutTurn(messageId) {
  if (!fs.existsSync(sessionsDir)) return null;
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith(".jsonl")) files.push(f); } };
  walk(sessionsDir);
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    if (!text.includes(messageId)) continue;
    const rows = text.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    let cur = null;
    const turns = [];
    for (const r of rows) {
      const p = r.payload ?? {};
      if (p.type === "task_started") { cur = { started: tsMs(r.timestamp), items: [] }; turns.push(cur); continue; }
      if (!cur) continue;
      if (p.type === "task_complete" || p.type === "turn_aborted") { cur.ended = tsMs(r.timestamp); cur.end = p.type; cur = null; continue; }
      cur.items.push(r);
    }
    const turn = turns.find((t) => t.items.some((r) => r.type === "response_item" && r.payload?.type === "message" && r.payload?.role === "user" && JSON.stringify(r.payload.content).includes(messageId)));
    if (!turn) continue;
    const seq = [];
    const usage = { output: 0, reasoning: 0, inputMax: 0, inputFirst: null, cachedSum: 0, inputSum: 0 };
    for (const r of turn.items) {
      const p = r.payload ?? {};
      const at = tsMs(r.timestamp);
      if (r.type === "token_usage_record") {
        const u = p.usage ?? {};
        usage.output += u.output_tokens ?? 0; usage.reasoning += u.reasoning_output_tokens ?? 0;
        usage.inputMax = Math.max(usage.inputMax, u.input_tokens ?? 0); usage.inputFirst ??= u.input_tokens ?? null;
        usage.inputSum += u.input_tokens ?? 0; usage.cachedSum += u.cached_input_tokens ?? 0;
        seq.push({ k: "req", at });
      } else if (r.type === "response_item" && p.type === "message" && p.role === "assistant") seq.push({ k: "msg", at, phase: p.phase ?? null, text: (p.content ?? []).map((c) => c.text ?? "").join("") });
      else if (r.type === "response_item" && ["function_call", "custom_tool_call", "local_shell_call", "web_search_call"].includes(p.type)) seq.push({ k: "tool", at, name: p.name ?? p.type });
    }
    const firstTool = seq.findIndex((s) => s.k === "tool");
    const msgs = seq.filter((s) => s.k === "msg" && s.text.trim());
    // an assistant message "precedes a tool call" when the next message/tool item after it is a tool call
    const preTool = [];
    for (let i = 0; i < seq.length; i++) {
      if (seq[i].k !== "msg" || !seq[i].text.trim()) continue;
      const next = seq.slice(i + 1).find((s) => s.k !== "req");
      if (next?.k === "tool") preTool.push(seq[i].text.slice(0, 160));
    }
    const before = firstTool >= 0 ? seq.slice(0, firstTool).filter((s) => s.k === "msg" && s.text.trim()) : [];
    const instr = rows.filter((r) => r.type === "response_item" && r.payload?.type === "message" && ["developer", "user"].includes(r.payload.role)).map((r) => (r.payload.content ?? []).map((c) => c.text ?? "").join(""));
    return {
      file: path.basename(f), started: turn.started, ended: turn.ended ?? null, end: turn.end ?? null,
      tools: seq.filter((s) => s.k === "tool").map((s) => s.name), requests: seq.filter((s) => s.k === "req").length, usage,
      preambleBeforeTool: firstTool >= 0 ? before.length > 0 : null, preamble: before[0]?.text?.slice(0, 200) ?? null, preambleAt: before[0]?.at ?? null,
      preToolMsgs: preTool, assistantMessages: msgs.length, assistantChars: msgs.reduce((n, m) => n + m.text.length, 0),
      nonFinalChars: msgs.slice(0, -1).reduce((n, m) => n + m.text.length, 0),
      assistantTexts: msgs.map((m) => m.text), finalText: msgs.at(-1)?.text ?? null,
      fidelity: {
        agentsRule4: instr.some((t) => t.includes("Tool-call process note")),
        agentsVariant: instr.some((t) => t.includes("调工具前先说一句")),
        progressCardLine: instr.some((t) => t.includes("keep your progress card current")),
      },
    };
  }
  return null;
}
const e2e = (id) => {
  for (const l of lines) {
    if (!l.includes("[firsttext-e2e.1]") || !l.includes(`"inboundMessageId":"${id}"`)) continue;
    try { return JSON.parse(l.slice(l.indexOf("{", l.indexOf("[firsttext-e2e.1]")))); } catch {}
  }
  return null;
};

// ---------------------------------------------------------------- fixtures and checks
function rng(seed) {
  let h = parseInt(sha256(Buffer.from(seed)).slice(0, 8), 16);
  return () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const norm = (s) => String(s ?? "").replace(/(\d),(?=\d{3})/gu, "$1").replace(/[¥￥\s]/gu, "");
const hasNum = (t, n) => new RegExp(`(^|[^0-9.])${String(n).replace(".", "\\.")}(?![0-9]|\\.[0-9])`, "u").test(norm(t));
const readIf = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null);
const write = (f, s, mode) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s, mode ? { mode } : undefined); };
const runNode = (dir, file) => spawnSync(process.execPath, [file], { cwd: dir, encoding: "utf8", timeout: 20_000 });

const TASKS = [
  { id: "sales", kind: "multi-file read + summary", make(dir, r) {
    const regions = { east: "华东", west: "华西", north: "华北", south: "华南", central: "华中", online: "线上" };
    let amounts;
    for (;;) {
      amounts = {};
      for (const [k] of Object.entries(regions)) {
        const rows = ["date,product,qty,unit_price"];
        let fen = 0;
        for (let i = 0; i < 20; i++) {
          const qty = ri(r, 1, 40);
          const price = k === "online" ? ri(r, 1990, 29990) : ri(r, 20, 300);
          fen += qty * (k === "online" ? price : price * 100);
          rows.push(`2026-11-${String(ri(r, 1, 18)).padStart(2, "0")},${pick(r, ["展架", "海报", "手提袋", "易拉宝", "样册", "胸牌"])},${qty},${price}`);
        }
        write(path.join(dir, "sales", `${k}.csv`), `${rows.join("\n")}\n`);
        amounts[k] = fen;
      }
      const sorted = Object.values(amounts).sort((a, b) => b - a);
      if (sorted[0] - sorted[1] > 50_000) break;
    }
    write(path.join(dir, "sales", "README.md"), `# 各区域销售明细\n\n每个 csv 一个区域：east=华东，west=华西，north=华北，south=华南，central=华中，online=线上。\n列：date,product,qty,unit_price。\n\n注意：online.csv 的 unit_price 单位是「分」，其余文件的 unit_price 单位是「元」。\n`);
    const top = Object.entries(amounts).sort((a, b) => b[1] - a[1])[0][0];
    const total = Object.values(amounts).reduce((a, b) => a + b, 0);
    return { regions, amounts, top, total };
  },
  prompt: (k) => `tasks/${k}/sales 下是 6 个区域的销售明细，先看 README.md。算出每个区域的销售额（数量×单价，统一换算成元），告诉我销售额最高的区域和 6 个区域合计（保留两位小数），并把各区域金额写进同目录的 summary.md。`,
  check(dir, x, text) {
    const total = (x.total / 100).toFixed(2);
    const summary = readIf(path.join(dir, "sales", "summary.md"));
    const parts = {
      total: hasNum(text, total),
      top: norm(text).includes(x.regions[x.top]) || norm(text).includes(x.top),
      summary: Boolean(summary) && Object.values(x.amounts).every((fen) => hasNum(summary, (fen / 100).toFixed(2))),
    };
    return { ok: Object.values(parts).every(Boolean), parts, expect: { total, top: x.regions[x.top] } };
  } },

  { id: "calc", kind: "run tests -> fix -> rerun", make(dir) {
    write(path.join(dir, "calc", "lib.mjs"), `export const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs) => sum(xs) / xs.length;

export function median(xs) {
  const s = [...xs];
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// nearest-rank percentile
export function percentile(xs, p) {
  const s = [...xs].sort();
  const i = Math.ceil((p / 100) * s.length);
  return s[Math.min(s.length - 1, Math.max(0, i))];
}
`);
    const test = `import assert from "node:assert/strict";
import { sum, mean, median, percentile } from "./lib.mjs";

assert.equal(sum([1, 2, 3]), 6, "sum");
assert.equal(mean([2, 4, 9]), 5, "mean");
assert.equal(median([9, 1, 5]), 5, "median of odd length");
assert.equal(median([8, 2, 4, 6]), 5, "median of even length");
assert.equal(percentile([5, 40, 100, 7, 300], 50), 40, "p50");
assert.equal(percentile([15, 3, 250, 42, 8, 1000, 77, 9, 60, 120], 90), 250, "p90");
console.log("all tests passed");
`;
    write(path.join(dir, "calc", "test.mjs"), test);
    return { testSha: sha256(Buffer.from(test)) };
  },
  prompt: (k) => `tasks/${k}/calc 里的测试现在不通过（在那个目录执行 node test.mjs）。找出原因修好 lib.mjs，不要改 test.mjs，修完再跑一遍确认全部通过，最后告诉我改了什么。`,
  check(dir, x) {
    const run = runNode(path.join(dir, "calc"), "test.mjs");
    const parts = { testsPass: run.status === 0 && /all tests passed/u.test(run.stdout), testUntouched: sha256(fs.readFileSync(path.join(dir, "calc", "test.mjs"))) === x.testSha };
    return { ok: parts.testsPass && parts.testUntouched, parts };
  } },

  { id: "logs", kind: "search + arithmetic", make(dir, r) {
    const services = ["payment", "order", "user", "search", "gateway", "payment-gateway"];
    const peakHour = ri(r, 9, 20);
    const files = Array.from({ length: 8 }, () => []);
    const line = (h, level, svc) => `2026-11-18T${String(h).padStart(2, "0")}:${String(ri(r, 0, 59)).padStart(2, "0")}:${String(ri(r, 0, 59)).padStart(2, "0")}Z ${level} service=${svc} trace=${sha256(Buffer.from(String(r()))).slice(0, 8)} msg="${pick(r, ["timeout", "upstream 502", "charge declined", "retry exhausted", "ok", "cache miss", "slow query"])}"`;
    for (const f of files) for (let i = 0; i < 150; i++) {
      const x = r();
      const level = x < 0.7 ? "INFO" : x < 0.85 ? "WARN" : "ERROR";
      f.push(line(ri(r, 0, 23), level, pick(r, services)));
    }
    for (let i = 0; i < 14; i++) files[ri(r, 0, 7)].push(line(peakHour, "ERROR", "payment"));
    for (let i = 0; i < 6; i++) files[ri(r, 0, 7)].push(line(peakHour === 20 ? 19 : peakHour + 1, "ERROR", "payment-gateway"));
    const all = files.flat();
    const errs = all.filter((l) => / ERROR /u.test(l));
    const pay = errs.filter((l) => / service=payment /u.test(l));
    const byHour = {};
    for (const l of pay) { const h = Number(l.slice(11, 13)); byHour[h] = (byHour[h] ?? 0) + 1; }
    const ranked = Object.entries(byHour).sort((a, b) => b[1] - a[1]);
    assert(Number(ranked[0][0]) === peakHour && ranked[0][1] - ranked[1][1] >= 3, "log fixture peak is not unique");
    files.forEach((f, i) => { f.sort(); write(path.join(dir, "logs", `app-0${i + 1}.log`), `${f.join("\n")}\n`); });
    return { count: pay.length, peakHour, pct: ((pay.length / errs.length) * 100).toFixed(1), allErrors: errs.length };
  },
  prompt: (k) => `tasks/${k}/logs 里是 8 个日志文件。统计 service 恰好等于 payment 的 ERROR 条数（别的服务不算）；这些错误按小时（UTC）分布，哪个小时最多；再算出它们占全部 ERROR 的百分比（保留一位小数）。`,
  check(dir, x, text) {
    const h = x.peakHour;
    const parts = {
      count: hasNum(text, x.count),
      pct: hasNum(text, x.pct),
      hour: new RegExp(`(^|[^0-9])0?${h}(\\s*(点|时|:|：)|\\s*-\\s*${h + 1})`, "u").test(String(text ?? "")),
    };
    return { ok: Object.values(parts).every(Boolean), parts, expect: { count: x.count, pct: x.pct, hour: h } };
  } },

  { id: "expo", kind: "notes (memory) + quote -> written decision", make(dir) {
    const notes = {
      "2026-11-03.md": "# 11-03\n\n- 官网改版预算 12 万，下周和设计确认排期。\n- 展会物料预算先按 8 万控制（含税）。\n- 供应商候选：蓝鲸印务、橙果制作，等两家报价。\n",
      "2026-11-05.md": "# 11-05\n\n- 小红书投放先暂停，等新素材。\n- 年会场地：两个候选，周五去看。\n",
      "2026-11-07.md": "# 11-07\n\n- 和 Tianyi 确认：展会物料预算上调到 9.5 万（含税），之前的 8 万作废。\n- 展位搭建另算，不在物料预算里。\n",
      "2026-11-10.md": "# 11-10\n\n- 展会物料供应商定橙果制作；蓝鲸印务交期要 25 天，赶不上。\n- 官网改版的预算没变。\n",
      "2026-11-12.md": "# 11-12\n\n- 年会场地定了第二个。\n- 周会改到周一上午。\n",
    };
    for (const [n, t] of Object.entries(notes)) write(path.join(dir, "memory", n), t);
    const orange = [["展架 X 型", 24, 380], ["易拉宝", 30, 260], ["背景板喷绘", 4, 6200], ["手提袋（千个）", 12, 1450], ["样册印刷（百本）", 20, 1180], ["胸牌挂绳", 600, 9]];
    const blue = [["展架 X 型", 24, 320], ["易拉宝", 30, 240], ["背景板喷绘", 4, 5600], ["手提袋（千个）", 12, 1300], ["样册印刷（百本）", 20, 1050], ["胸牌挂绳", 600, 8]];
    const table = (rows) => ["| 项目 | 数量 | 单价（元，含税） |", "|---|---|---|", ...rows.map(([n, q, p]) => `| ${n} | ${q} | ${p} |`)].join("\n");
    write(path.join(dir, "expo", "quote.md"), `# 展会物料报价\n\n## 蓝鲸印务\n\n${table(blue)}\n\n## 橙果制作\n\n${table(orange)}\n`);
    const total = orange.reduce((s, [, q, p]) => s + q * p, 0);
    return { budget: 95000, supplier: "橙果", total, diff: 95000 - total };
  },
  prompt: (k) => `我们之前讨论过展会物料的预算和供应商，记在 tasks/${k}/memory/ 的笔记里（按日期）。查一下最后定的预算和供应商，再看 tasks/${k}/expo/quote.md 里那家的报价合计，判断超没超预算、差多少，把结论（预算、供应商、报价合计、是否超支、差额）写进 tasks/${k}/expo/decision.md，再跟我说结论。`,
  check(dir, x, text) {
    const decision = readIf(path.join(dir, "expo", "decision.md"));
    const money = (t, n) => hasNum(t, n) || hasNum(t, (n / 10000).toString()) && /万/u.test(t ?? "");
    const under = x.diff >= 0;
    const parts = {
      decision: Boolean(decision) && decision.includes(x.supplier) && money(decision, x.total) && money(decision, Math.abs(x.diff)),
      text: money(text, Math.abs(x.diff)) && (under ? /(未|没有?|不)超|低于|结余|剩余|富余|还剩|节省|省下/u : /超(支|出|了)/u).test(text ?? ""),
    };
    return { ok: parts.decision && parts.text, parts, expect: { total: x.total, diff: x.diff } };
  } },

  { id: "report", kind: "script fails twice on the way", make(dir, r) {
    const rows = ["id,name,amount"];
    let total = 0;
    for (let i = 1; i <= 37; i++) { const a = ri(r, 100, 9000); total += a; rows.push(`${i},客户${String(i).padStart(2, "0")},${a}`); }
    write(path.join(dir, "report", "data", "input-2026-11.csv"), `${rows.join("\n")}\n`);
    write(path.join(dir, "report", "data", "input-2026-10.csv.bak"), "id,name,amount\n1,旧数据,999999\n");
    write(path.join(dir, "report", "run.sh"), `#!/bin/sh
set -e
cd "$(dirname "$0")"
IN="data/input.csv"
mkdir -p out
awk -F, 'NR > 1 { total += $3 } END { printf "ROWS %d\\nTOTAL %d\\n", NR - 1, total }' "$IN" > out/report.txt
echo "report written to out/report.txt"
`, 0o644);
    return { total, rows: 37 };
  },
  prompt: (k) => `在 tasks/${k}/report 目录里执行 ./run.sh 生成 out/report.txt，然后告诉我报告里的 TOTAL 是多少。`,
  check(dir, x, text) {
    const report = readIf(path.join(dir, "report", "out", "report.txt"));
    const parts = { report: Boolean(report) && new RegExp(`TOTAL ${x.total}\\b`, "u").test(report), text: hasNum(text, x.total) };
    return { ok: parts.report && parts.text, parts, expect: { total: x.total } };
  } },

  { id: "chain", kind: "clue chain (sequential reads)", make(dir, r) {
    const names = Array.from({ length: 40 }, (_, i) => `n${String(i + 1).padStart(2, "0")}.txt`);
    const rest = names.filter((n) => n !== "n07.txt").sort(() => r() - 0.5);
    const chain = ["n07.txt", ...rest.slice(0, 8)];
    const decoys = rest.slice(8);
    const word = `${pick(r, ["青柠", "海盐", "松针", "琥珀", "竹影", "银杏"])}-${ri(r, 1000, 9999)}`;
    const filler = () => Array.from({ length: 5 }, () => pick(r, ["今天的风有点大。", "仓库第三排的灯坏了。", "记得给绿萝浇水。", "复印机又卡纸了。", "楼下咖啡第二杯半价。", "这一页没有什么特别的。"])).join("\n");
    chain.forEach((n, i) => write(path.join(dir, "chain", n), i < chain.length - 1 ? `${filler()}\n下一站：${chain[i + 1]}\n${filler()}\n` : `${filler()}\n暗号：${word}\n`));
    decoys.forEach((n, i) => write(path.join(dir, "chain", n), i % 3 === 0 ? `${filler()}\n暗号：${pick(r, ["青柠", "海盐", "松针", "琥珀", "竹影", "银杏"])}-${ri(r, 1000, 9999)}\n` : `${filler()}\n下一站：${pick(r, decoys)}\n`));
    return { word, files: chain.length };
  },
  prompt: (k) => `tasks/${k}/chain 里有一串线索文件。从 n07.txt 开始，每个文件里的「下一站」指向下一个文件，一直跟到没有「下一站」的文件为止。告诉我那里的暗号，以及一共经过了几个文件（含起点和终点）。`,
  check(dir, x, text) {
    const parts = { word: norm(text).includes(x.word.replace(/\s/gu, "")), files: hasNum(text, x.files) };
    return { ok: parts.word && parts.files, parts, expect: x };
  } },

  { id: "config", kind: "fix config until validator passes", make(dir) {
    const dev = { name: "orders", timeoutMs: 8000, retries: 3, endpoints: { api: "https://api.dev.example", auth: "https://auth.dev.example" }, features: { newCheckout: true } };
    const prod = { name: "orders", timeoutMs: 3000, retries: 5, endpoints: { api: "https://api.example", auth: "http://auth.example" }, features: { newCheckout: true } };
    const devText = `${JSON.stringify(dev, null, 2)}\n`;
    write(path.join(dir, "config", "app.dev.json"), devText);
    write(path.join(dir, "config", "app.prod.json"), `${JSON.stringify(prod, null, 2)}\n`);
    write(path.join(dir, "config", "validate.mjs"), `import fs from "node:fs";
const dev = JSON.parse(fs.readFileSync(new URL("./app.dev.json", import.meta.url)));
const prod = JSON.parse(fs.readFileSync(new URL("./app.prod.json", import.meta.url)));
function fail(msg) { console.error("invalid:", msg); process.exit(1); }
if (prod.name !== dev.name) fail("prod.name must equal dev.name");
if (prod.timeoutMs !== dev.timeoutMs) fail("prod.timeoutMs must equal dev.timeoutMs");
if (!(prod.retries <= 3)) fail("prod.retries must be <= 3");
for (const [k, v] of Object.entries(prod.endpoints ?? {})) if (!String(v).startsWith("https://")) fail(\`prod.endpoints.\${k} must use https\`);
console.log("config OK");
`);
    return { devSha: sha256(Buffer.from(devText)) };
  },
  prompt: (k) => `tasks/${k}/config 里执行 node validate.mjs 现在不通过。按校验要求只改 app.prod.json（app.dev.json 不要动），改到校验通过为止，然后告诉我改了哪几项。`,
  check(dir, x) {
    const run = runNode(path.join(dir, "config"), "validate.mjs");
    const parts = { valid: run.status === 0 && /config OK/u.test(run.stdout), devUntouched: sha256(fs.readFileSync(path.join(dir, "config", "app.dev.json"))) === x.devSha };
    return { ok: parts.valid && parts.devUntouched, parts };
  } },
].filter((t) => !ONLY.length || ONLY.includes(t.id));

function longPaste() {
  const want = Number(process.env.PRE_LONG_CHARS ?? 700_000);
  const parts = [];
  let n = 0;
  for (const d of fs.readdirSync(path.join(workspace, "skills")).sort()) {
    const f = path.join(workspace, "skills", d, "SKILL.md");
    if (!fs.existsSync(f)) continue;
    const t = fs.readFileSync(f, "utf8");
    parts.push(`### ${d}\n${t}`);
    n += t.length;
    if (n >= want) break;
  }
  return parts.join("\n\n").slice(0, want);
}

// ---------------------------------------------------------------- turns
let seq = 0;
function setAgents(arm) { fs.writeFileSync(path.join(workspace, "AGENTS.md"), agentsFor(arm)); }
const instanceKey = (arm, rep, taskId) => sha256(Buffer.from(`${MODE}/${arm}/${rep}/${taskId}`)).slice(0, 6);
function cardText(w) {
  // the visible text of one card write: every "content" string in the JSON body, else the raw body
  const out = [];
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (k === "content" && typeof x === "string") out.push(x); else walk(x); } else if (typeof v === "string" && /^[{[]/u.test(v.trim())) { try { walk(JSON.parse(v)); } catch {} } };
  try { walk(JSON.parse(w.text)); } catch { return w.text ?? ""; }
  return out.join("\n");
}
async function turn({ arm, rep, chat, text, task, dir, fixture, index }) {
  const id = `om_vpre_${++seq}`;
  const msg = addMessage({ id, chat, chatType: "p2p", text });
  const writesBefore = fake.cardWrites.length;
  push(msg);
  const ok = await waitFor(`reply ${id}`, () => e2e(id)?.endAtMs, TURN_TIMEOUT_MS);
  await sleep(1500);
  const rec = e2e(id) ?? {};
  const roll = rolloutTurn(id);
  const writes = fake.cardWrites.slice(writesBefore).filter((w) => w.at >= msg.at);
  const n2 = (s) => String(s ?? "").replace(/\s+/gu, "");
  const keys = (roll?.assistantTexts ?? []).map((x) => n2(x).slice(0, 10)).filter((k) => k.length >= 2);
  const firstTextWrite = writes.find((w) => keys.some((k) => n2(w.text).includes(k)));
  const finalKey = n2(roll?.finalText).slice(0, 10);
  const finalWrites = finalKey.length >= 2 ? writes.filter((w) => n2(w.text).includes(finalKey)) : [];
  const lastFinal = finalWrites.at(-1);
  const verdict = task && roll ? task.check(dir, fixture, roll.finalText) : null;
  const r = {
    arm, mode: MODE, task: task?.id ?? "paste", rep, index, id, chat, sessionKey: rec.sessionKey ?? null, rolloutFile: roll?.file ?? null, replied: Boolean(ok),
    sentToFirstCardTextMs: firstTextWrite ? firstTextWrite.at - msg.at : null,
    sentToAnswerPushMs: rec.firstAnswerPushAtMs ? rec.firstAnswerPushAtMs - rec.sentAtMs : null,
    sentToEndMs: rec.endAtMs ? rec.endAtMs - rec.sentAtMs : null,
    sentToFinalCardMs: lastFinal ? lastFinal.at - msg.at : null,
    rolloutTurnMs: roll?.ended && roll?.started ? roll.ended - roll.started : null,
    tools: roll?.tools?.length ?? null, toolNames: roll?.tools ?? null, requests: roll?.requests ?? null,
    outputTokens: roll?.usage?.output ?? null, reasoningTokens: roll?.usage?.reasoning ?? null, inputTokensMax: roll?.usage?.inputMax ?? null, inputTokensFirst: roll?.usage?.inputFirst ?? null,
    preambleBeforeTool: roll?.preambleBeforeTool ?? null, preamble: roll?.preamble ?? null,
    preToolMsgs: roll?.preToolMsgs?.length ?? null, preToolTexts: roll?.preToolMsgs ?? null,
    assistantMessages: roll?.assistantMessages ?? null, assistantChars: roll?.assistantChars ?? null, nonFinalChars: roll?.nonFinalChars ?? null,
    finalChars: roll?.finalText?.length ?? null, cardFinalChars: lastFinal ? cardText(lastFinal).length : null, cardWrites: writes.length,
    correct: verdict ? verdict.ok : null, checkParts: verdict?.parts ?? null, expect: verdict?.expect ?? null,
    finalText: roll?.finalText?.slice(0, 600) ?? null, fidelity: roll?.fidelity ?? null, rolloutEnd: roll?.end ?? null,
  };
  step("turn", { ...r, finalText: r.finalText?.slice(0, 160), preToolTexts: r.preToolTexts?.slice(0, 4) });
  return r;
}
const stat = (v) => { const s = v.filter((x) => typeof x === "number").sort((a, b) => a - b); const q = (p) => s.length ? s[Math.min(s.length - 1, Math.floor((s.length - 1) * p + 0.5))] : null; return { n: s.length, p50: q(0.5), p90: q(0.9), mean: s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null }; };

let failure;
try {
  await bootGateway();
  const results = [];
  const fixtures = new Map(); // `${arm}/${rep}/${task}` -> { dir, fixture }
  const prepare = (arm, rep, task) => {
    const k = instanceKey(arm, rep, task.id);
    const dir = path.join(workspace, "tasks", k);
    const fixture = task.make(dir, rng(`${task.id}/${rep}`)); // same content for every arm of a rep
    fixtures.set(`${arm}/${rep}/${task.id}`, { dir, fixture, k });
    return { dir, fixture, k };
  };
  for (let rep = 1; rep <= REPS; rep++) {
    if (MODE === "new") {
      for (const [ti, task] of TASKS.entries()) {
        const order = (rep + ti) % 2 === 0 ? ARMS : [...ARMS].reverse();
        for (const arm of order) {
          setAgents(arm);
          const { dir, fixture, k } = prepare(arm, rep, task);
          results.push(await turn({ arm, rep, chat: dmChat(arm, task.id, rep), text: task.prompt(k), task, dir, fixture, index: 0 }));
        }
      }
    } else {
      const order = rep % 2 === 0 ? ARMS : [...ARMS].reverse();
      for (const arm of order) {
        setAgents(arm);
        const chat = dmChat(arm, "long", rep);
        results.push(await turn({ arm, rep, chat, text: `下面是我整理的一批技能文档，先存在这儿，不用看也不用回复，回个"收到"就行：\n\n${longPaste()}`, task: null, index: 0 }));
        for (const [ti, task] of TASKS.entries()) {
          const { dir, fixture, k } = prepare(arm, rep, task);
          results.push(await turn({ arm, rep, chat, text: task.prompt(k), task, dir, fixture, index: ti + 1 }));
        }
      }
    }
  }
  evidence.turns = results;
  const work = results.filter((r) => r.task !== "paste");
  const sum = (rows) => ({
    n: rows.length, correct: rows.filter((r) => r.correct).length, replied: rows.filter((r) => r.replied).length,
    total: stat(rows.map((r) => r.sentToEndMs)), firstText: stat(rows.map((r) => r.sentToFirstCardTextMs)),
    tools: stat(rows.map((r) => r.tools)), requests: stat(rows.map((r) => r.requests)), outputTokens: stat(rows.map((r) => r.outputTokens)),
    reasoningTokens: stat(rows.map((r) => r.reasoningTokens)), inputTokensMax: stat(rows.map((r) => r.inputTokensMax)),
    preambleBeforeTool: `${rows.filter((r) => r.preambleBeforeTool).length}/${rows.filter((r) => r.preambleBeforeTool !== null).length}`,
    preToolMsgs: stat(rows.map((r) => r.preToolMsgs)), assistantMessages: stat(rows.map((r) => r.assistantMessages)),
    nonFinalChars: stat(rows.map((r) => r.nonFinalChars)), finalChars: stat(rows.map((r) => r.finalChars)), cardFinalChars: stat(rows.map((r) => r.cardFinalChars)),
  });
  evidence.summary = Object.fromEntries(ARMS.map((arm) => [arm, sum(work.filter((r) => r.arm === arm))]));
  evidence.byTask = Object.fromEntries(TASKS.map((t) => [t.id, Object.fromEntries(ARMS.map((arm) => [arm, sum(work.filter((r) => r.arm === arm && r.task === t.id))]))]));
  evidence.fidelity = {};
  for (const r of results) if (r.fidelity) evidence.fidelity[r.arm] ??= r.fidelity;
  check("every turn replied", results.every((r) => r.replied), { failed: results.filter((r) => !r.replied).map((r) => r.id) });
  check("rollout found for every turn", results.every((r) => r.tools !== null), { missing: results.filter((r) => r.tools === null).map((r) => r.id) });
  check("arm instructions reached the thread", Object.entries(evidence.fidelity).every(([arm, f]) => (arm === "base" ? f.agentsRule4 && !f.agentsVariant : f.agentsVariant && !f.agentsRule4) && f.progressCardLine), evidence.fidelity);
  const keyArms = new Map();
  for (const r of results) { if (!r.sessionKey) continue; (keyArms.get(r.sessionKey) ?? keyArms.set(r.sessionKey, new Set()).get(r.sessionKey)).add(MODE === "new" ? `${r.arm}/${r.task}/${r.rep}` : `${r.arm}/${r.rep}`); }
  check("every instance has its own session", [...keyArms.values()].every((v) => v.size === 1), { shared: [...keyArms.entries()].filter(([, v]) => v.size > 1).map(([k, v]) => [k, [...v]]) });
} catch (err) {
  failure = redact(err?.stack ?? err);
} finally {
  await stopGateway().catch(() => {});
  server.close();
  fs.rmSync(shortTmp, { recursive: true, force: true });
}
evidence.turnErrorLog = logMatches(/outcome=error|FailoverError|No API key|401|403|rate limit|harness failed|codex app-server.*(error|failed)|compact/iu).filter((l) => !/card-phase/u.test(l)).slice(0, 20).map((l) => redact(l.slice(14)).slice(0, 600));
evidence.failure = failure ?? null;
evidence.ok = !failure && evidence.checks.length > 0 && evidence.checks.every((c) => c.ok);
console.log(JSON.stringify(evidence, null, 1));
for (const [arm, s] of Object.entries(evidence.summary ?? {})) console.log(`RESULT ${MODE} ${arm}: correct ${s.correct}/${s.n}; total p50 ${s.total.p50} p90 ${s.total.p90} ms; first text p50 ${s.firstText.p50} ms; tools mean ${s.tools.mean}; requests mean ${s.requests.mean}; output tokens mean ${s.outputTokens.mean}; pre-tool msgs mean ${s.preToolMsgs.mean}; preamble ${s.preambleBeforeTool}`);
process.exitCode = evidence.ok ? 0 : 1;
