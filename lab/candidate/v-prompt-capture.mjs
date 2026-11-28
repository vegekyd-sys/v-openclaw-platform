// Candidate capture: what does V actually send to the model, per runtime? For the de-OpenClaw review
// (docs/v-de-openclaw-review.md). Nothing is changed on V; this runs one private Gateway per arm.
//
// Setup (shared with vds-preamble-e2e.mjs): V's Feishu plugin and V's Codex plugin bytes (whole-dist sha
// V_CODEX_DIST_SHA) with Codex 0.169.1, a local fake Feishu (REST + Lark SDK WebSocket frames), the
// sender configured as the owner, a paired card renderer forced as on V, and a private workspace with
// V's top-level prompt files (AGENTS, SOUL, IDENTITY, USER, MEMORY, TOOLS, HEARTBEAT, PROJECTS,
// REDLINES) plus V's skills (SKILL.md files only, as v-skills.tar). All inputs are plan support files
// read from V; none is committed.
//
// What is recorded:
//   - DeepSeek requests: a local reverse proxy in front of api.deepseek.com records every request body
//     (system prompt, messages, tools) and the streamed response, and forwards unchanged.
//     /vds (Codex app-server, Responses API) and /deepseek (vlab-worker PI, chat completions) go through it.
//   - /vcc: a `claude` stand-in first on PATH records argv, the --append-system-prompt-file content, the
//     --mcp-config (auth redacted) and the MCP tools/list it serves, then fails the turn (no Claude call).
// The MCP tools/list call is refused by the loopback server (unauthorized); /vcc tools are the same OpenClaw
// tool objects the PI run sends, so the deepseek arm covers them.
// Arms (CAP_ARMS): vds, deepseek, vcc. Per arm: a DM identity question, a DM tool question, a group
// identity question with @V. Output: a gzip+base64 bundle of all captures between markers on stdout.
import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const ARMS = (process.env.CAP_ARMS ?? "vds,deepseek,vcc").split(",").filter(Boolean);
const REFS = { vds: "deepseek/vds-deepseek-flash", deepseek: "deepseek/deepseek-flash", vcc: "anthropic/claude-opus-5-5" };
const TURN_TIMEOUT_MS = Number(process.env.CAP_TURN_TIMEOUT_MS ?? 240_000);
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
const BOT = "ou_vcap_fake_bot";
const ALICE = "ou_vcap_alice";
const senderFor = (chat) => (chat.startsWith("oc_vcap_dm_") ? `ou_vcap${createHash("sha256").update(chat).digest("hex").slice(0, 24)}` : ALICE);
const T_START = Date.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const since = () => `${((Date.now() - T_START) / 1000).toFixed(1)}s`;
const redact = (s) => {
  let out = String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
  for (const v of Object.values(secrets)) if (v && v.length >= 12) out = out.replaceAll(v, "[redacted]");
  return out;
};
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const evidence = { arms: ARMS, steps: [], checks: [] };
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
evidence.inputs = Object.fromEntries([...V_FILES, "v-skills.tar"].map((n) => [n, sha256(fs.readFileSync(input(n))).slice(0, 16)]));

// ---------------------------------------------------------------- capture store
const capDir = path.join(scratch, "capture");
fs.mkdirSync(capDir, { recursive: true, mode: 0o700 });
let currentArm = "boot";
let currentTurn = "boot";
let capSeq = 0;
// request bodies stay valid JSON: only the known secret values are replaced (the regex redact() would eat escapes)
const redactSecrets = (s) => { let out = s; for (const v of Object.values(secrets)) if (v && v.length >= 12) out = out.replaceAll(v, "[redacted]"); return out; };
const capWrite = (name, data) => fs.writeFileSync(path.join(capDir, name), typeof data === "string" ? redact(data) : redactSecrets(JSON.stringify(data, null, 1)));

// DeepSeek recording reverse proxy (plain http on loopback; forwards to the real API unchanged)
const proxy = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const n = ++capSeq;
  const tag = `${String(n).padStart(3, "0")}-${currentArm}-${currentTurn}`;
  let parsed = null;
  try { parsed = JSON.parse(body.toString("utf8")); } catch {}
  capWrite(`ds-${tag}.req.json`, { at: Date.now(), method: req.method, path: req.url, bytes: body.length, body: parsed ?? body.toString("utf8").slice(0, 2000) });
  const headers = { ...req.headers };
  delete headers.host; delete headers["accept-encoding"]; delete headers["content-length"];
  const up = https.request({ host: "api.deepseek.com", port: 443, method: req.method, path: req.url, headers: { ...headers, "content-length": body.length } }, (ur) => {
    res.writeHead(ur.statusCode, ur.headers);
    const out = [];
    ur.on("data", (d) => { out.push(d); res.write(d); });
    ur.on("end", () => { res.end(); capWrite(`ds-${tag}.res.txt`, `status ${ur.statusCode}\n${Buffer.concat(out).toString("utf8").slice(0, 400_000)}`); });
  });
  up.on("error", (err) => { capWrite(`ds-${tag}.err.txt`, String(err)); if (!res.headersSent) res.writeHead(502); res.end(); });
  up.end(body);
});
await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
const PROXY = `http://127.0.0.1:${proxy.address().port}`;
step("deepseek proxy", { url: PROXY });

// `claude` stand-in (for /vcc): record and fail
const binDir = path.join(scratch, "bin");
fs.mkdirSync(binDir, { recursive: true });
fs.writeFileSync(path.join(binDir, "claude"), `#!${process.execPath}
const fs = require("fs"), path = require("path");
const out = ${JSON.stringify(capDir)};
const argv = process.argv.slice(2);
// startup probes: answer as a logged-in Claude Code so the claude-cli runtime will run turns
if (argv[0] === "auth") { process.stdout.write(JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty" }) + "\\n"); process.exit(0); }
if (argv[0] === "--version" || argv[0] === "-v") { process.stdout.write("2.1.0 (Claude Code)\\n"); process.exit(0); }
const val = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
const read = (f) => { try { return f ? fs.readFileSync(f, "utf8") : null; } catch (e) { return "unreadable: " + e.message; } };
const stamp = Date.now() + "-" + process.pid;
// claude-cli streams control/user messages on stdin and keeps it open: collect for 3 s, never wait for EOF
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => { stdin += d; });
const mcpRaw = val("--mcp-config");
let mcp = null; try { mcp = JSON.parse(mcpRaw && mcpRaw.trim().startsWith("{") ? mcpRaw : read(mcpRaw)); } catch {}
const rec = { argv, appendSystemPromptFile: read(val("--append-system-prompt-file")), appendSystemPrompt: val("--append-system-prompt"), systemPrompt: val("--system-prompt"), mcpConfig: mcp, envKeys: Object.keys(process.env).filter((k) => /CLAUDE|ANTHROPIC|OPENCLAW|MCP/.test(k)) };
(async () => {
  await new Promise((r) => setTimeout(r, 3000));
  rec.stdin = stdin; // the system prompt arrives here as control_request.initialize.appendSystemPrompt
  process.stdin.pause();
  const servers = (mcp && mcp.mcpServers) || {};
  rec.mcpTools = {};
  for (const [name, s] of Object.entries(servers)) {
    if (!s.url) { rec.mcpTools[name] = { skipped: s.command ? "stdio server" : "no url" }; continue; }
    const h = { "content-type": "application/json", accept: "application/json, text/event-stream", ...(s.headers || {}) };
    const call = async (method, params, id, sid) => {
      const r = await fetch(s.url, { method: "POST", headers: { ...h, ...(sid ? { "mcp-session-id": sid } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
      const t = await r.text();
      const m = t.match(/^data: (.*)$/m);
      return { sid: r.headers.get("mcp-session-id") || sid, json: JSON.parse(m ? m[1] : t) };
    };
    try {
      const init = await call("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "capture", version: "0" } }, 1);
      if (init.sid) await fetch(s.url, { method: "POST", headers: { ...h, "mcp-session-id": init.sid }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
      const list = await call("tools/list", {}, 2, init.sid);
      rec.mcpTools[name] = { server: init.json.result && init.json.result.serverInfo, instructions: init.json.result && init.json.result.instructions, tools: list.json.result ? list.json.result.tools : list.json };
    } catch (e) { rec.mcpTools[name] = { error: String(e) }; }
  }
  if (rec.mcpConfig && rec.mcpConfig.mcpServers) for (const s of Object.values(rec.mcpConfig.mcpServers)) if (s.headers) for (const k of Object.keys(s.headers)) s.headers[k] = "[redacted]";
  fs.writeFileSync(path.join(out, "vcc-" + stamp + ".json"), JSON.stringify(rec, null, 1));
  process.stderr.write("capture stand-in: no Claude call made\\n");
  process.exit(1);
})();
`, { mode: 0o755 });

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
const makaron = config.agents.entries.makaron;
const workspace = makaron.workspace ?? config.agents.defaults.workspace;
assert(workspace.startsWith(scratch), `workspace ${workspace} is not private to this candidate`);
assert(makaron.agentDir.startsWith(stateDir), "agentDir is not private");
for (const [arm, ref] of Object.entries(REFS)) if (ARMS.includes(arm)) assert(config.agents.defaults.models?.[ref], `shared config has no ${ref} (${arm})`);
evidence.modelEntries = Object.fromEntries(ARMS.map((a) => [a, { ref: REFS[a], ...config.agents.defaults.models[REFS[a]] }]));
config.commands ??= {};
const DM_IDS = ARMS.flatMap((arm) => ["who", "tool"].map((k) => `oc_vcap_dm_${arm}_${k}`));
config.commands.ownerAllowFrom = [...new Set([...(config.commands.ownerAllowFrom ?? []).map(String), `feishu:${ALICE}`, ...DM_IDS.map((c) => `feishu:${senderFor(c)}`)])];
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
// PI (vlab-worker) DeepSeek requests through the recording proxy
assert(config.models?.providers?.deepseek, "no deepseek provider");
evidence.deepseekBaseUrlWas = config.models.providers.deepseek.baseUrl;
config.models.providers.deepseek.baseUrl = `${PROXY}/v1`;

// Candidate-only (as in feishu-ingress-catchup-e2e.mjs): allow the relocated Feishu plugin's ingress queue.
const feishuDir = config.plugins.load.paths.find((p) => p.endsWith("/@openclaw/feishu"));
assert(feishuDir?.startsWith(runtime), "must only touch the private candidate runtime");
{
  const gate = 'if (record?.origin !== "bundled" && record?.trustedOfficialInstall !== true) throw new Error(`${methodName} is only available for trusted plugins';
  const loaderFile = fs.readdirSync(dist).filter((n) => /^loader-[\w-]{8}\.js$/u.test(n)).map((n) => path.join(dist, n)).find((f) => fs.readFileSync(f, "utf8").includes(gate));
  assert(loaderFile, "trusted-runtime gate not found");
  const src = fs.readFileSync(loaderFile, "utf8");
  assert.equal(src.split(gate).length, 2, "trusted-runtime gate anchor");
  fs.writeFileSync(loaderFile, src.replace(gate, gate.replace("record?.trustedOfficialInstall !== true", 'record?.trustedOfficialInstall !== true && pluginId !== "feishu"')));
}
// V has a paired card renderer (the V app), so its threads get the progress-card line and tool.
{
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
const keep = new Set(["feishu", "deepseek", "codex", "moonshot", "vlab-agent-worker-isolation", "anthropic", "memory-core"]);
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
  if (workerConfig.models?.providers?.deepseek) workerConfig.models.providers.deepseek.baseUrl = `${PROXY}/v1`;
  evidence.workerDeepseekProxied = Boolean(workerConfig.models?.providers?.deepseek);
  if (workerConfig.tools?.web?.search) delete workerConfig.tools.web.search;
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, JSON.stringify(workerConfig, null, 2), { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
config.bindings = [{ agentId: "makaron", match: { channel: "feishu" } }];
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
evidence.config = { channels: Object.keys(config.channels), plugins: Object.keys(config.plugins.entries), owner: config.commands.ownerAllowFrom };

// ---------------------------------------------------------------- private workspace: V's prompt files + V's skills
{
  fs.mkdirSync(workspace, { recursive: true });
  assert.equal(spawnSync("tar", ["-xf", input("v-skills.tar"), "-C", workspace]).status, 0, "extract V skills");
  for (const n of V_FILES) fs.copyFileSync(input(n), path.join(workspace, n));
  fs.mkdirSync(path.join(workspace, "assets"), { recursive: true });
  evidence.workspace = { skills: fs.readdirSync(path.join(workspace, "skills")).length, agentSkills: fs.existsSync(path.join(workspace, ".agents", "skills")) ? fs.readdirSync(path.join(workspace, ".agents", "skills")).length : 0 };
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
base_url = "${PROXY}/v1"
wire_api = "responses"
env_key = "DEEPSEEK_API_KEY"
`, { mode: 0o600 });
  for (const entry of ["plugins", "cache", "skills", "models_cache.json"]) {
    if (fs.existsSync(path.join(src, entry))) fs.cpSync(path.join(src, entry), path.join(codexHome, entry), { recursive: true });
  }
}

// ---------------------------------------------------------------- Gateway
const shortTmp = `/tmp/.vcap-${process.pid}`;
fs.mkdirSync(shortTmp, { recursive: true, mode: 0o700 });
const cacheDir = path.join(scratch, "cache");
fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
const env = {
  ...process.env,
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1", OPENCLAW_DATABASE_VERIFY_RESOURCE_GROUP: "1",
  OPENCLAW_DB91_PROVENANCE_ENABLE: "1", OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE: "1", OPENCLAW_DB91_MAINTENANCE_ENABLE: "1",
  OPENCLAW_WORKER_SESSION_AFFINITY_ENABLE: "1", OPENCLAW_DB91_INTEGRITY_ENABLE: "0", OPENCLAW_DB91_READ_AHEAD_ENABLE: "1",
  OPENCLAW_DB91_STATE_READ_AHEAD_ENABLE: "1", OPENCLAW_DB91_TRAJECTORY_SWEEP_ENABLE: "1",
  PATH: `${binDir}:${path.dirname(process.execPath)}:${process.env.PATH}`, OPENCLAW_PATH_BOOTSTRAPPED: "1", DISABLE_AUTOUPDATER: "1",
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

// ---------------------------------------------------------------- scenarios
const e2e = (id) => {
  for (const l of lines) {
    if (!l.includes("[firsttext-e2e.1]") || !l.includes(`"inboundMessageId":"${id}"`)) continue;
    try { return JSON.parse(l.slice(l.indexOf("{", l.indexOf("[firsttext-e2e.1]")))); } catch {}
  }
  return null;
};
const TURNS = [
  { key: "who", chatType: "p2p", text: "你是谁？用两三句话介绍一下你自己，以及你是跑在什么系统上的。" },
  { key: "tool", chatType: "p2p", text: "看下工作区 TOOLS.md 一共多少行，给我数字就行" },
  { key: "group", chatType: "group", text: "大家好，新来的同事想认识一下你：你是谁？平时能帮我们做什么？" },
];
let seq = 0;
async function turn(arm, t) {
  const id = `om_vcap_${++seq}`;
  const chat = t.chatType === "group" ? `oc_vcap_group_${arm}` : `oc_vcap_dm_${arm}_${t.key}`;
  currentTurn = t.key;
  const msg = addMessage({ id, chat, chatType: t.chatType, text: t.text, mentionBot: t.chatType === "group" });
  const writesBefore = fake.cardWrites.length;
  const capsBefore = fs.readdirSync(capDir).length;
  push(msg);
  const done = await waitFor(`reply ${id}`, () => e2e(id)?.endAtMs || (arm === "vcc" && fs.readdirSync(capDir).some((f) => f.startsWith("vcc-")) && fs.readdirSync(capDir).length > capsBefore && Date.now() - msg.at > 15_000), TURN_TIMEOUT_MS);
  await sleep(2500);
  const writes = fake.cardWrites.slice(writesBefore).filter((w) => w.at >= msg.at);
  const r = { arm, turn: t.key, id, chat, done: Boolean(done), cardWrites: writes.length, lastCardText: writes.at(-1)?.text?.slice(0, 1500) ?? null, e2e: e2e(id) };
  capWrite(`turn-${arm}-${t.key}.json`, { ...r, writes: writes.map((w) => ({ at: w.at - msg.at, method: w.method, text: w.text })) });
  step("turn", { arm, turn: t.key, done: r.done, cardWrites: r.cardWrites, last: r.lastCardText?.slice(0, 200) });
  return r;
}

let failure;
const results = [];
try {
  for (const arm of ARMS) {
    currentArm = arm;
    currentTurn = "boot";
    const c = JSON.parse(fs.readFileSync(configPath, "utf8"));
    for (const target of [c.agents.defaults, c.agents.entries.makaron]) target.model = { primary: REFS[arm], fallbacks: [] };
    fs.writeFileSync(configPath, `${JSON.stringify(c, null, 2)}\n`, { mode: 0o600 });
    await bootGateway();
    for (const t of TURNS) results.push(await turn(arm, t));
    await stopGateway();
  }
  evidence.turns = results.map(({ e2e: _e, ...r }) => r);
  check("every turn finished", results.every((r) => r.done), { failed: results.filter((r) => !r.done).map((r) => `${r.arm}/${r.turn}`) });
  for (const arm of ARMS) {
    const names = fs.readdirSync(capDir);
    check(`${arm}: captured`, arm === "vcc" ? names.some((f) => f.startsWith("vcc-")) : names.some((f) => f.startsWith("ds-") && f.includes(`-${arm}-`) && f.endsWith(".req.json")));
  }
} catch (err) {
  failure = redact(err?.stack ?? err);
} finally {
  await stopGateway().catch(() => {});
  server.close();
  proxy.close();
  fs.rmSync(shortTmp, { recursive: true, force: true });
}
// Codex rollouts of the vds arm (developer/user instruction items, dynamic tools) for cross-checking
{
  const sessionsDir = path.join(codexHome, "sessions");
  const files = [];
  const walk = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith(".jsonl")) files.push(f); } };
  walk(sessionsDir);
  for (const f of files) fs.copyFileSync(f, path.join(capDir, `rollout-${path.basename(f)}`));
}
fs.writeFileSync(path.join(capDir, "gateway-log-tail.txt"), redact(lines.slice(-3000).join("\n")));
evidence.turnErrorLog = logMatches(/outcome=error|FailoverError|No API key|401|403|rate limit|harness failed|capture stand-in|cli backend|claude/iu).slice(0, 25).map((l) => redact(l.slice(14)).slice(0, 600));
evidence.failure = failure ?? null;
evidence.ok = !failure && evidence.checks.length > 0 && evidence.checks.every((c) => c.ok);
const bundle = zlib.gzipSync(execFileSync("tar", ["-cf", "-", "-C", capDir, "."], { maxBuffer: 1 << 30 })).toString("base64");
console.log(JSON.stringify(evidence, null, 1));
console.log(`CAPTURE-BUNDLE-BEGIN ${bundle.length}`);
console.log(bundle);
console.log("CAPTURE-BUNDLE-END");
process.exitCode = evidence.ok ? 0 : 1;
