// Candidate e2e: how big is a fresh /vds (Codex harness + DeepSeek flash) prompt, which source puts
// what into it, and what changes when Codex's own skills listing is switched off
// (codex-home config.toml `[skills] include_instructions = false`) so that only OpenClaw's skills
// list remains. Arms: "base" = V's codex-home config.toml; "dedup" = the same plus that one key.
//
// Built on vds-preamble-e2e.mjs (claude/firsttext-two-segments-20261119): one private Gateway on the
// candidate config copy with V's Feishu plugin and V's Codex plugin bytes (whole-dist sha
// V_CODEX_DIST_SHA), Codex 0.169.1, real DeepSeek (vds-deepseek-flash) and a fake Feishu. Additions:
// - Codex talks to DeepSeek through a local capture proxy (config.toml base_url), which stores every
//   /responses request body and the usage from response.completed, so the request can be split by
//   source and every turn has exact input/cached tokens.
// - The skills of V (every SKILL.md and other .md under V's skill roots, a read-only tarball passed as
//   the support file v-skills-md.tgz; never committed) are placed at the same roots as on V: workspace
//   skills and .agents/skills, $HOME/.agents/skills (private HOME), state skills and plugin-skills,
//   codex-home skills and plugins/cache. So both skills lists have V's size and format.
// - Scenarios for the rules (preamble before tools, group NO_REPLY), skill discovery (5 tasks whose
//   answer is only in a SKILL.md) and the request breakdown (3-turn DM).
// The arm is switched by rewriting config.toml before the arm's chat starts; every chat is a new
// Codex thread (thread/start reads config.toml). The rollout of each thread is checked for the arm.
import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import path from "node:path";
import { createRequire } from "node:module";

const ARMS = (process.env.PRE_ARMS ?? "base,dedup").split(",").filter(Boolean);
// arms that change codex-home config.toml; "agents" also swaps AGENTS.md for AGENTS.<agents>.md
const CONFIG_ARMS = { dedup: { nativeSkillsOff: true }, dedupv2: { nativeSkillsOff: true, agents: "v2" } };
const REPS = Number(process.env.PRE_REPS ?? 1);
const ONLY = (process.env.PRE_SCENARIOS ?? "").split(",").filter(Boolean);
const TURN_TIMEOUT_MS = Number(process.env.PRE_TURN_TIMEOUT_MS ?? 300_000);
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
const dmChat = (arm, scenarioId, rep) => `oc_vpre_dm_${arm}_${scenarioId}_${rep}`;
const senderFor = (chat) => (chat.startsWith("oc_vpre_dm_") ? `ou_vpre${createHash("sha256").update(chat).digest("hex").slice(0, 24)}` : ALICE);
const DM_SCENARIOS = ["dm-breakdown", "dm-switch", "dm-shell-a", "dm-shell-b", "dm-image", "dm-chat", "dm-mixed", "dm-long", "skill-cdn", "skill-calendar", "skill-material", "skill-report", "skill-makaron"];
const T_START = Date.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const since = () => `${((Date.now() - T_START) / 1000).toFixed(1)}s`;
const redact = (s) => {
  let out = String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
  for (const v of Object.values(secrets)) if (v && v.length >= 12) out = out.replaceAll(v, "[redacted]");
  return out;
};
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const evidence = { arms: ARMS, reps: REPS, steps: [], checks: [] };
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
const agentArm = (arm) => CONFIG_ARMS[arm]?.agents ?? (arm === "base" || CONFIG_ARMS[arm] ? null : arm);
for (const arm of ARMS) if (agentArm(arm)) input(`AGENTS.${agentArm(arm)}.md`);
const agentsFor = (arm) => fs.readFileSync(agentArm(arm) ? input(`AGENTS.${agentArm(arm)}.md`) : input("AGENTS.md"));
evidence.inputs = Object.fromEntries([...V_FILES, "v-skills-md.tgz", ...new Set(ARMS.filter(agentArm).map((a) => `AGENTS.${agentArm(a)}.md`))].map((n) => [n, sha256(fs.readFileSync(input(n))).slice(0, 16)]));

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
  // V runs on the default state dir, where the plugin's native-skill isolation is off and Codex lists
  // its own skills; a candidate (OPENCLAW_STATE_DIR set) would get isolation and hide that listing.
  // Candidate-only: VDD_V_DEFAULT_STATE_DIR=1 makes isolation return early, as on V.
  const anchor = "async function resolveCodexNativeSkillIsolation(params) {";
  let patched = 0;
  for (const d of all) for (const n of fs.readdirSync(d)) {
    const f = path.join(d, n);
    if (!n.endsWith(".js")) continue;
    const src = fs.readFileSync(f, "utf8");
    if (!src.includes(anchor)) continue;
    assert.equal(src.split(anchor).length, 2, "isolation anchor");
    fs.writeFileSync(f, src.replace(anchor, `${anchor}\n\tif (process.env.VDD_V_DEFAULT_STATE_DIR === "1") return; // candidate: as V (default state dir)`));
    patched += 1;
  }
  assert(patched >= 1, "native skill isolation not found");
  evidence.codexPlugin.nativeSkillIsolation = `off as on V (${patched} copies)`;
}

// ---------------------------------------------------------------- configuration
const config = JSON.parse(fs.readFileSync(configPath, "utf8").replaceAll(V_OWNER, ALICE));
const port = Number(config.gateway?.port);
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
const VDS_REF = "deepseek/vds-deepseek-flash";
const makaron = config.agents.entries.makaron;
// V's layout: the workspace sits at ~/makaron-openclaw/.openclaw-local/workspace, so OpenClaw writes skill
// locations as ~/... (short) exactly as on V; HOME is the private home below.
const privateHome = path.join(scratch, "home");
const workspace = path.join(privateHome, "makaron-openclaw", ".openclaw-local", "workspace");
makaron.workspace = workspace;
// V's skills settings (2026-11-20); shared VLab has none, so its catalog is cut at the 18k default
// VDD_SKILLS_PROMPT_CHARS overrides the 70000 budget (the "descriptions back" variant of the fix)
const SKILLS_PROMPT_CHARS = Number(process.env.VDD_SKILLS_PROMPT_CHARS ?? 70000);
const V_SKILLS = (home) => ({ limits: { maxSkillsInPrompt: 500, maxSkillsPromptChars: SKILLS_PROMPT_CHARS, maxSkillsLoadedPerSource: 400 }, load: { allowSymlinkTargets: [path.join(home, ".agents", "skills"), path.join(home, ".agents", "skills", "makaron")] } });
config.skills = { ...(config.skills ?? {}), ...V_SKILLS(privateHome) };
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
  if (workerConfig.agents?.entries?.makaron) workerConfig.agents.entries.makaron.workspace = workspace;
  workerConfig.skills = { ...(workerConfig.skills ?? {}), ...V_SKILLS(privateHome) };
  if (workerConfig.tools?.web?.search) delete workerConfig.tools.web.search;
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, JSON.stringify(workerConfig, null, 2), { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
config.bindings = [{ agentId: "makaron", match: { channel: "feishu" } }];
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
evidence.config = { channels: Object.keys(config.channels), plugins: Object.keys(config.plugins.entries), model: VDS_REF, vdsEntry, owner: config.commands.ownerAllowFrom };

// ---------------------------------------------------------------- private workspace and skills at V's roots
// V paths (relative to /home/openclaw in the tarball) -> candidate paths.
const stubBin = path.join(scratch, "stub-bin");
const stubEnv = {};
const codexHome = path.join(makaron.agentDir, "codex-home");
const SKILL_ROOTS = [
  ["makaron-openclaw/.openclaw-local/workspace/skills", path.join(workspace, "skills")],
  ["makaron-openclaw/.openclaw-local/workspace/.agents/skills", path.join(workspace, ".agents", "skills")],
  [".agents/skills", path.join(privateHome, ".agents", "skills")],
  [".openclaw/skills", path.join(stateDir, "skills")],
  [".openclaw/plugin-skills", path.join(stateDir, "plugin-skills")],
  [".openclaw/agents/makaron/agent/codex-home/skills", path.join(codexHome, "skills")],
  [".openclaw/agents/makaron/agent/codex-home/plugins/cache", path.join(codexHome, "plugins", "cache")],
];
{
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(privateHome, { recursive: true, mode: 0o700 });
  fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  const unpack = path.join(scratch, "v-skills");
  fs.mkdirSync(unpack, { recursive: true });
  assert.equal(spawnSync("tar", ["-xzf", input("v-skills-md.tgz"), "-C", unpack]).status, 0, "unpack V skills");
  // Codex plugin manifests (plugin.json etc.) are not in the .md tarball: start from shared VLab's
  // codex-home plugins and skills, then lay V's markdown over them.
  const sharedCodexHome = path.join(sharedState, "agents", "makaron", "agent", "codex-home");
  for (const entry of ["plugins", "skills"]) {
    if (fs.existsSync(path.join(sharedCodexHome, entry))) fs.cpSync(path.join(sharedCodexHome, entry), path.join(codexHome, entry), { recursive: true });
  }
  evidence.skillRoots = {};
  for (const [rel, dest] of SKILL_ROOTS) {
    const src = path.join(unpack, rel);
    if (!dest.startsWith(codexHome)) fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(src)) fs.cpSync(src, dest, { recursive: true });
    else fs.mkdirSync(dest, { recursive: true });
    const n = spawnSync("find", ["-L", dest, "-name", "SKILL.md"], { encoding: "utf8" }).stdout.split("\n").filter(Boolean).length;
    evidence.skillRoots[rel] = n;
  }
  fs.rmSync(unpack, { recursive: true, force: true });
  // OpenClaw lists a skill only when its declared bins/env exist; V has them (lark-cli, wecom-cli, ...).
  // Missing bins get a stub that refuses to run; missing env names get a placeholder value.
  const need = { bins: new Set(), env: new Set() };
  for (const [, dest] of SKILL_ROOTS) {
    for (const f of spawnSync("find", ["-L", dest, "-name", "SKILL.md"], { encoding: "utf8" }).stdout.split("\n").filter(Boolean)) {
      const t = fs.readFileSync(f, "utf8");
      if (!t.startsWith("---")) continue;
      const fm = t.slice(3, Math.max(3, t.indexOf("\n---", 3)));
      for (const m of fm.matchAll(/["']?(anyBins|bins|env)["']?\s*:\s*\[([^\]]*)\]/gu)) for (const w of m[2].match(/[A-Za-z0-9_.+-]+/gu) ?? []) need[m[1] === "env" ? "env" : "bins"].add(w);
      for (const m of fm.matchAll(/(anyBins|bins|env)\s*:\s*\n((?:[ \t]+-[ \t]*\S+\n?)+)/gu)) for (const w of m[2].matchAll(/-\s*["']?([A-Za-z0-9_.+-]+)/gu)) need[m[1] === "env" ? "env" : "bins"].add(w[1]);
    }
  }
  fs.mkdirSync(stubBin, { recursive: true });
  evidence.stubs = { bins: [], env: [] };
  for (const b of need.bins) {
    if (spawnSync("sh", ["-c", `command -v '${b.replaceAll("'", "")}'`], { env: { PATH: `${path.dirname(process.execPath)}:${process.env.PATH}` } }).status === 0) continue;
    fs.writeFileSync(path.join(stubBin, b), `#!/bin/sh\necho "${b}: not available in this test environment" >&2\nexit 127\n`, { mode: 0o755 });
    evidence.stubs.bins.push(b);
  }
  for (const e of need.env) if (!process.env[e]) { stubEnv[e] = "candidate-placeholder"; evidence.stubs.env.push(e); }
  step("skill requirement stubs", evidence.stubs);
  for (const n of V_FILES) fs.copyFileSync(input(n), path.join(workspace, n));
  fs.mkdirSync(path.join(workspace, "assets"), { recursive: true });
  fs.copyFileSync(input("v-avatar.jpg"), path.join(workspace, "assets", "v-avatar.jpg"));
  step("skills at V roots", evidence.skillRoots);
}
const countDirs = (d, pred = () => true) => fs.readdirSync(d, { withFileTypes: true }).filter((e) => (e.isDirectory() || e.isSymbolicLink()) && pred(e.name)).length;
const EXPECT = {
  skills: countDirs(path.join(workspace, "skills")),
  skillsLark: countDirs(path.join(workspace, "skills"), (n) => n.includes("lark")),
  agentSkills: fs.existsSync(path.join(workspace, ".agents", "skills")) ? countDirs(path.join(workspace, ".agents", "skills")) : 0,
  skillsVideo: countDirs(path.join(workspace, "skills"), (n) => n.includes("video")),
  projectsLines: fs.readFileSync(path.join(workspace, "PROJECTS.md"), "utf8").replace(/\n$/u, "").split("\n").length,
  toolsLines: fs.readFileSync(path.join(workspace, "TOOLS.md"), "utf8").split("\n").length - (fs.readFileSync(path.join(workspace, "TOOLS.md"), "utf8").endsWith("\n") ? 1 : 0),
};
evidence.expect = EXPECT;

// ---------------------------------------------------------------- Codex home as V's makaron one (config.toml shape of V, 2026-11-20)
// base_url points at the local capture proxy (below), which forwards to DeepSeek.
const codexConfig = (arm, proxyUrl) => `approval_policy = "never"
sandbox_mode = "danger-full-access"

[projects."${workspace}"]
trust_level = "trusted"

[plugins."openai-developers@openai-curated"]
enabled = true

[model_providers.deepseek]
request_max_retries = 1
stream_max_retries = 1
name = "DeepSeek"
base_url = "${proxyUrl}/v1"
wire_api = "responses"
env_key = "DEEPSEEK_API_KEY"
${CONFIG_ARMS[arm]?.nativeSkillsOff ? "\n[skills]\ninclude_instructions = false\n" : ""}`;
{
  const src = path.join(sharedState, "agents", "makaron", "agent", "codex-home");
  for (const entry of ["cache", "models_cache.json"]) {
    if (fs.existsSync(path.join(src, entry))) fs.cpSync(path.join(src, entry), path.join(codexHome, entry), { recursive: true });
  }
}

// ---------------------------------------------------------------- DeepSeek capture proxy
// Codex -> http://127.0.0.1:<port>/v1 -> https://api.deepseek.com/v1. Stores each /responses request
// body (decoded) and the usage of response.completed; the response bytes are passed through unchanged.
const captureDir = path.join(scratch, "capture");
fs.mkdirSync(captureDir, { recursive: true, mode: 0o700 });
const captures = [];
const decode = (buf, enc) => {
  enc = String(enc ?? "").toLowerCase();
  if (enc === "zstd") return zlib.zstdDecompressSync(buf);
  if (enc === "gzip") return zlib.gunzipSync(buf);
  if (enc === "br") return zlib.brotliDecompressSync(buf);
  if (enc === "deflate") return zlib.inflateSync(buf);
  return buf;
};
const proxy = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  const rec = { n: captures.length + 1, at: Date.now(), method: req.method, path: req.url, requestEncoding: req.headers["content-encoding"] ?? null, bytes: raw.length };
  captures.push(rec);
  if (req.method === "POST" && /\/responses$/u.test(req.url)) {
    try { const f = path.join(captureDir, `req-${String(rec.n).padStart(5, "0")}.json`); fs.writeFileSync(f, decode(raw, req.headers["content-encoding"]), { mode: 0o600 }); rec.file = f; } catch (err) { rec.decodeError = String(err); }
  }
  const headers = { ...req.headers, host: "api.deepseek.com" };
  delete headers["content-length"];
  if (raw.length) headers["content-length"] = String(raw.length);
  const up = https.request({ host: "api.deepseek.com", port: 443, method: req.method, path: req.url, headers }, (ur) => {
    rec.status = ur.statusCode;
    rec.firstByteAt = Date.now();
    res.writeHead(ur.statusCode, ur.headers);
    const out = [];
    ur.on("data", (d) => { res.write(d); out.push(d); });
    ur.on("end", () => {
      rec.endAt = Date.now();
      res.end();
      try {
        const text = decode(Buffer.concat(out), ur.headers["content-encoding"]).toString("utf8");
        for (const line of text.split("\n")) {
          if (!line.startsWith("data:")) continue;
          let ev; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
          if (ev?.type === "response.completed" && ev.response?.usage) {
            const u = ev.response.usage;
            rec.usage = { input: u.input_tokens, cached: u.input_tokens_details?.cached_tokens ?? 0, output: u.output_tokens, reasoning: u.output_tokens_details?.reasoning_tokens ?? 0 };
          }
          if (ev?.type === "response.output_text.delta" && !rec.firstTextAt) rec.firstTextAt = Date.now();
        }
        if (!rec.usage && /^\s*\{/u.test(text)) { const j = JSON.parse(text); if (j.usage) rec.usage = { input: j.usage.input_tokens, cached: j.usage.input_tokens_details?.cached_tokens ?? 0, output: j.usage.output_tokens }; if (j.error) rec.error = JSON.stringify(j.error).slice(0, 300); }
      } catch (err) { rec.parseError = String(err).slice(0, 200); }
    });
  });
  up.on("error", (err) => { rec.error = String(err); if (!res.headersSent) res.writeHead(502); res.end(); });
  up.end(raw);
});
await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
const PROXY_URL = `http://127.0.0.1:${proxy.address().port}`;

// One /responses request split by source. Texts are kept for the token count of the breakdown turn.
let dynamicToolNames = [];
function segmentRequest(body, currentMessageId) {
  const seg = {};
  const add = (k, t) => { seg[k] = (seg[k] ?? "") + t; };
  add("codex_base_instructions", body.instructions ?? "");
  const tools = body.tools ?? [];
  const dyn = new Set(dynamicToolNames);
  add("tools_openclaw_dynamic_json", JSON.stringify(tools.filter((x) => dyn.has(x.name))));
  add("tools_codex_builtin_json", JSON.stringify(tools.filter((x) => !dyn.has(x.name))));
  let nativeSkills = 0;
  for (const item of body.input ?? []) {
    if (item.type !== "message") { add("history_items", JSON.stringify(item)); continue; }
    const parts = Array.isArray(item.content) ? item.content : [{ text: String(item.content ?? "") }];
    for (const c of parts) {
      const t = c.text ?? "";
      if (item.role === "assistant") { add("history_items", t); continue; }
      if (item.role === "developer" && /^You are (a coding agent|Codex)/u.test(t)) add("codex_base_instructions", t);
      else if (t.startsWith("You are a personal agent")) add("openclaw_developer_instructions", t);
      else if (t.startsWith("<skills_instructions>")) { nativeSkills += 1; add(`codex_native_skills_${nativeSkills}`, t); }
      else if (/^<(permissions instructions|recommended_plugins|environment_context|apps_instructions|plugins_instructions)/u.test(t)) add("codex_env_permissions_plugins", t);
      else if (t.startsWith("<collaboration_mode>")) add("collaboration_mode", t);
      else if (t.startsWith("<openclaw_temporal_context>")) add("openclaw_temporal", t);
      else if (t.startsWith("# AGENTS.md instructions")) add("codex_native_AGENTS.md", t);
      else if (t.startsWith("<openclaw_workspace_context>")) {
        const mem = t.search(/### [^\n]*MEMORY\.md\n/u);
        const recall = t.indexOf("## Memory Recall");
        const skills = t.indexOf("## OpenClaw Skills");
        const cut = [mem, recall, skills].map((x) => (x < 0 ? t.length : x));
        add("openclaw_ws_SOUL_IDENTITY_USER", t.slice(0, Math.min(...cut)));
        if (mem >= 0) add("openclaw_ws_MEMORY.md", t.slice(mem, Math.min(...cut.filter((x) => x > mem), t.length)));
        if (recall >= 0) add("openclaw_ws_memory_recall_rules", t.slice(recall, skills >= 0 && skills > recall ? skills : t.length));
        if (skills >= 0) add("openclaw_ws_skills_list", t.slice(skills));
      } else if (item.role === "user" && currentMessageId && t.includes(currentMessageId)) add("current_user_message", t);
      else if (item.role === "user" && /Conversation info|message_id/u.test(t)) add("history_items", t);
      else add(`other_${item.role}`, t);
    }
  }
  return { seg, nativeSkills, tools: tools.length, toolNames: tools.map((x) => x.name ?? x.type).filter(Boolean) };
}
async function deepseekTokens(text) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch("https://api.deepseek.com/v1/responses", { method: "POST", headers: { authorization: `Bearer ${secrets.DEEPSEEK_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ model: "deepseek-flash", input: [{ role: "user", content: [{ type: "input_text", text }] }], max_output_tokens: 16, reasoning: { effort: "none" } }) });
      const j = await r.json();
      if (j?.usage) return j.usage.input_tokens;
    } catch {}
    await sleep(2000);
  }
  return null;
}
const capturesBetween = (t0, t1) => captures.filter((c) => c.file && c.at >= t0 && c.at <= t1);
const readCapture = (c) => JSON.parse(fs.readFileSync(c.file, "utf8"));
let currentArm = null;
function setArm(arm) {
  fs.writeFileSync(path.join(workspace, "AGENTS.md"), agentsFor(arm));
  fs.writeFileSync(path.join(codexHome, "config.toml"), codexConfig(arm, PROXY_URL), { mode: 0o600 });
  currentArm = arm;
}
setArm(ARMS[0]);

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
  PATH: `${path.dirname(process.execPath)}:${process.env.PATH}:${stubBin}`, ...stubEnv, VDD_V_DEFAULT_STATE_DIR: "1", OPENCLAW_PATH_BOOTSTRAPPED: "1", DISABLE_AUTOUPDATER: "1",
  OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: shortTmp, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm"),
  NODE_EXTRA_CA_CERTS: certFile, DEEPSEEK_API_KEY: secrets.DEEPSEEK_API_KEY, HOME: privateHome,
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
    const meta = rows.find((r) => r.type === "session_meta")?.payload;
    if (Array.isArray(meta?.dynamic_tools)) dynamicToolNames = meta.dynamic_tools.map((x) => x.name).filter(Boolean);
    // turns: task_started .. task_complete; ours is the one whose user message carries the Feishu message id
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
    let reasoningTokens = 0;
    for (const r of turn.items) {
      const p = r.payload ?? {};
      const at = tsMs(r.timestamp);
      if (r.type === "token_usage_record") { reasoningTokens += p.usage?.reasoning_output_tokens ?? 0; seq.push({ k: "req", at }); }
      else if (r.type === "response_item" && p.type === "message" && p.role === "assistant") seq.push({ k: "msg", at, phase: p.phase ?? null, text: (p.content ?? []).map((c) => c.text ?? "").join("") });
      else if (r.type === "response_item" && ["function_call", "custom_tool_call", "local_shell_call", "web_search_call"].includes(p.type)) seq.push({ k: "tool", at, name: p.name ?? p.type, args: String(p.arguments ?? p.input ?? JSON.stringify(p.action ?? "")).slice(0, 2000) });
    }
    const firstTool = seq.findIndex((s) => s.k === "tool");
    const msgs = seq.filter((s) => s.k === "msg");
    const before = firstTool >= 0 ? seq.slice(0, firstTool).filter((s) => s.k === "msg" && s.text.trim()) : [];
    // developer/user instruction messages of this thread (fidelity), only once per file
    const instr = rows.filter((r) => r.type === "response_item" && r.payload?.type === "message" && ["developer", "user"].includes(r.payload.role)).map((r) => (r.payload.content ?? []).map((c) => c.text ?? "").join(""));
    const parts = rows.filter((r) => r.type === "response_item" && r.payload?.type === "message").flatMap((r) => (r.payload.content ?? []).map((c) => c.text ?? ""));
    return {
      file: path.basename(f), started: turn.started, ended: turn.ended ?? null, end: turn.end ?? null,
      tools: seq.filter((s) => s.k === "tool").map((s) => s.name), toolArgs: seq.filter((s) => s.k === "tool").map((s) => s.args).join("\n"), requests: seq.filter((s) => s.k === "req").length, reasoningTokens,
      preambleBeforeTool: firstTool >= 0 ? before.length > 0 : null, preamble: before[0]?.text?.slice(0, 200) ?? null, preambleAt: before[0]?.at ?? null, preamblePhase: before[0]?.phase ?? null,
      firstToolAt: firstTool >= 0 ? seq[firstTool].at : null,
      assistantTexts: msgs.map((m) => m.text).filter((x) => x.trim()), assistantMessages: msgs.length, assistantChars: msgs.reduce((n, m) => n + m.text.length, 0), finalText: msgs.at(-1)?.text?.slice(0, 1500) ?? null,
      fidelity: {
        basePreamble: /Preamble messages/u.test(meta?.base_instructions?.text ?? ""),
        agentsRule4: instr.some((t) => t.includes("Tool-call process note")),
        agentsVariant: instr.some((t) => t.includes("调工具前先说一句")),
        progressCardLine: instr.some((t) => t.includes("keep your progress card current")),
        groupPrompt: instr.some((t) => t.includes("You are in a Feishu group chat")),
        nativeSkillsBlocks: parts.filter((t) => t.startsWith("<skills_instructions>")).length,
        openclawSkillsList: parts.some((t) => t.includes("## OpenClaw Skills")),
        agentsMdBlocks: parts.filter((t) => t.startsWith("# AGENTS.md instructions")).length,
      },
    };
  }
  return null;
}

// ---------------------------------------------------------------- scenarios
const e2e = (id) => {
  for (const l of lines) {
    if (!l.includes("[firsttext-e2e.1]") || !l.includes(`"inboundMessageId":"${id}"`)) continue;
    try { return JSON.parse(l.slice(l.indexOf("{", l.indexOf("[firsttext-e2e.1]")))); } catch {}
  }
  return null;
};
const hasNumber = (n) => (t) => new RegExp(`(^|[^0-9])${n}([^0-9]|$)`, "u").test(t ?? "");
const isNoReply = (t) => !String(t ?? "").trim() || /^\s*NO_REPLY\s*$/u.test(String(t));
const has = (...res) => (t) => res.every((re) => re.test(t ?? ""));
// skill tasks: the answer is only in that SKILL.md; the turn must read it (skillRead) and answer (ok)
const skillTask = (id, skill, text, ok) => ({ id, kind: "skill", chatType: "p2p", skill, turns: [{ text, ok }] });
const SCENARIOS = [
  // the request breakdown: chat, then two tool turns, in one new DM
  { id: "dm-breakdown", kind: "mixed", chatType: "p2p", turns: [
    { text: "你好，用一句话介绍一下你自己", ok: (t) => (t ?? "").length > 4, kind: "chat" },
    { text: "工作区 skills 目录下一共有多少个子目录？给我数字就行", ok: hasNumber(EXPECT.skills), kind: "tool" },
    { text: "那 TOOLS.md 一共多少行？", ok: hasNumber(EXPECT.toolsLines), kind: "tool" },
  ] },
  // AGENTS.md group rule: human-to-human talk without @V is NO_REPLY
  { id: "group-noreply", kind: "noreply", chatType: "group", mention: false, turns: [
    { text: "小王，明天下午的评审改到四点了，你那边可以吗？", ok: isNoReply },
    { text: "可以的，没问题，我把材料提前发群里", ok: isNoReply },
  ] },
  // an existing thread when the config changes under it (as on V after the edit, without a restart):
  // turn 1 under base, then config.toml switches to dedup and turn 2 goes to the same thread
  { id: "dm-switch", kind: "tool", chatType: "p2p", onlyArm: "base", turns: [
    { text: "工作区 skills 目录下一共有多少个子目录？给我数字就行", ok: hasNumber(EXPECT.skills) },
    { text: "那 TOOLS.md 一共多少行？", ok: hasNumber(EXPECT.toolsLines), switchTo: "dedup" },
    { text: "其中名字里带 lark 的技能目录有几个？", ok: hasNumber(EXPECT.skillsLark) },
  ] },
  skillTask("skill-cdn", "cdn-upload", "我要把本地一个视频文件传到 CDN 拿个公开链接，按我们现有的技能应该用哪个脚本、怎么调用？先别执行，只告诉我命令", has(/upload\.mjs/u)),
  skillTask("skill-calendar", "lark-calendar", "我想看一下我自己今天的飞书日程，按技能应该用什么命令？只告诉我命令，不用执行", has(/\+agenda/u)),
  skillTask("skill-material", "material-verification", "夜班 D 的素材验真里，source_url 可访问性这一项的通过标准是什么？", has(/206/u, /200/u)),
  skillTask("skill-report", "report-web", "做报告网页的话，按我们的设计规范，桌面端内容最大宽度是多少？", has(/1200/u)),
  skillTask("skill-makaron", "makaron", "飞书里有人让 V 用 makaron 生成一张图，按技能要求开工前必须先读哪两个部分？只说是哪两部分，不用执行", has(/official|官方/iu, /feishu|飞书/iu)),
  { id: "dm-shell-a", kind: "tool", chatType: "p2p", turns: [
    { text: "工作区 skills 目录下一共有多少个子目录？给我数字就行", ok: hasNumber(EXPECT.skills) },
    { text: "那其中名字里带 lark 的有几个？", ok: hasNumber(EXPECT.skillsLark) },
  ] },
  { id: "dm-shell-b", kind: "tool", chatType: "p2p", turns: [
    { text: "看下工作区 TOOLS.md 一共多少行", ok: hasNumber(EXPECT.toolsLines) },
    { text: "AGENTS.md 的 High-Priority Rules 一共几条？", ok: hasNumber(5) },
  ] },
  { id: "dm-image", kind: "tool", chatType: "p2p", turns: [
    { text: "看一下工作区 assets/v-avatar.jpg 这张图，简单说说画面里是什么", ok: (t) => (t ?? "").length > 10 },
    { text: "背景主要是什么颜色？", ok: (t) => (t ?? "").length > 2 },
  ] },
  { id: "dm-chat", kind: "chat", chatType: "p2p", turns: [
    { text: "周会放周五下午还是周一上午比较好？给个建议，一两句话", ok: (t) => (t ?? "").length > 4 },
    { text: "如果大家都是远程呢？", ok: (t) => (t ?? "").length > 4 },
  ] },
  { id: "group-shell", kind: "tool", chatType: "group", turns: [
    { text: "@V 帮忙看下工作区 .agents/skills 目录下有几个技能", ok: hasNumber(EXPECT.agentSkills) },
    { text: "@V 那 skills 目录下一共多少个子目录？", ok: hasNumber(EXPECT.skills) },
  ] },
  { id: "group-chat", kind: "chat", chatType: "group", turns: [
    { text: "@V 展会物料主色用蓝色还是橙色好？给个意见", ok: (t) => (t ?? "").length > 4 },
    { text: "@V 理由再简短说一下", ok: (t) => (t ?? "").length > 2 },
  ] },
  { id: "dm-mixed", kind: "mixed", chatType: "p2p", turns: [
    { text: "最近有点累，周末想放松一下，有什么建议？一两句话就行", ok: (t) => (t ?? "").length > 4, kind: "chat" },
    { text: "帮我看下工作区 PROJECTS.md 一共多少行", ok: hasNumber(EXPECT.projectsLines), kind: "tool" },
    { text: "好的，谢谢", ok: () => true, kind: "chat" },
    { text: "skills 目录里名字带 video 的有几个？", ok: hasNumber(EXPECT.skillsVideo), kind: "tool" },
  ] },
  // dm-long: a big pasted text first (V's long chats: preamble rate falls from 79% under 150k tokens to
  // 50-59% above 450k), then tool turns. Only when named in PRE_SCENARIOS.
  { id: "dm-long", kind: "mixed", chatType: "p2p", optIn: true, turns: [
    { text: () => `下面是我整理的一批技能文档，先存在这儿，不用看也不用回复，回个"收到"就行：\n\n${longPaste()}`, ok: () => true, kind: "paste" },
    { text: "工作区 skills 目录下一共有多少个子目录？", ok: hasNumber(EXPECT.skills), kind: "tool" },
    { text: "TOOLS.md 一共多少行？", ok: hasNumber(EXPECT.toolsLines), kind: "tool" },
    { text: "名字里带 lark 的技能目录有几个？", ok: hasNumber(EXPECT.skillsLark), kind: "tool" },
    { text: "AGENTS.md 的 High-Priority Rules 有几条？", ok: hasNumber(5), kind: "tool" },
  ] },
].filter((s) => (!ONLY.length && !s.optIn) || ONLY.includes(s.id));
function longPaste() {
  const want = Number(process.env.PRE_LONG_CHARS ?? 900_000);
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

let seq = 0;
async function turn(arm, scenario, rep, chat, t, index) {
  const id = `om_vpre_${++seq}`;
  const mention = scenario.chatType === "group" && scenario.mention !== false;
  const text = typeof t.text === "function" ? t.text() : t.text;
  const msg = addMessage({ id, chat, chatType: scenario.chatType, text: text.replace(/^@V\s*/u, ""), mentionBot: mention });
  const writesBefore = fake.cardWrites.length;
  push(msg);
  // a NO_REPLY turn may never produce a reply record: the rollout's task_complete also ends the turn
  let lastRolloutCheck = 0;
  const rolloutDone = () => { if (Date.now() - lastRolloutCheck < 2000) return false; lastRolloutCheck = Date.now(); return Boolean(rolloutTurn(id)?.ended); };
  const ok = await waitFor(`reply ${id}`, () => e2e(id)?.endAtMs || rolloutDone(), TURN_TIMEOUT_MS);
  await sleep(1500);
  const rec = e2e(id) ?? {};
  const roll = rolloutTurn(id);
  const writes = fake.cardWrites.slice(writesBefore).filter((w) => w.at >= msg.at);
  const norm = (s) => String(s ?? "").replace(/\s+/gu, "");
  const pre = roll?.preamble ? norm(roll.preamble).slice(0, 10) : null;
  const preWrite = pre ? writes.find((w) => norm(w.text).includes(pre)) : null;
  const keys = (roll?.assistantTexts ?? []).map((x) => norm(x).slice(0, 10)).filter((k) => k.length >= 2);
  const firstTextWrite = writes.find((w) => keys.some((k) => norm(w.text).includes(k)));
  const reqs = capturesBetween(msg.at, Date.now()).filter((c) => { try { return JSON.stringify(readCapture(c).input ?? []).includes(id); } catch { return false; } });
  const firstReq = reqs[0] ? segmentRequest(readCapture(reqs[0]), id) : null;
  const u = reqs.map((c) => c.usage).filter(Boolean);
  const r = {
    arm, scenario: scenario.id, threadNativeSkills: roll?.fidelity?.nativeSkillsBlocks ?? null,
    requestsCaptured: reqs.length, firstReqInput: u[0]?.input ?? null, firstReqCached: u[0]?.cached ?? null,
    inputTokensAll: u.reduce((n, x) => n + x.input, 0), cachedTokensAll: u.reduce((n, x) => n + x.cached, 0), outputTokensAll: u.reduce((n, x) => n + (x.output ?? 0), 0),
    firstReqChars: firstReq ? Object.fromEntries(Object.entries(firstReq.seg).map(([k, v]) => [k, v.length])) : null, firstReqTools: firstReq?.tools ?? null, firstReqNativeSkills: firstReq?.nativeSkills ?? null,
    firstReqFile: reqs[0]?.file ?? null, firstReqTtfbMs: reqs[0]?.firstByteAt ? reqs[0].firstByteAt - reqs[0].at : null,
    skill: scenario.skill ?? null, skillRead: scenario.skill ? new RegExp(`${scenario.skill}/SKILL\\.md`, "u").test(roll?.toolArgs ?? "") : null,
    sentToTurnEndMs: roll?.ended ? roll.ended - msg.at : null, kind: t.kind ?? scenario.kind, sessionKey: rec.sessionKey ?? null, rolloutFile: roll?.file ?? null, chatType: scenario.chatType, rep, index, id, ok: Boolean(ok),
    sentToFirstPushMs: rec.firstPushAtMs ? rec.firstPushAtMs - rec.sentAtMs : null,
    sentToAnswerTokenMs: rec.firstAnswerTokenAtMs ? rec.firstAnswerTokenAtMs - rec.sentAtMs : null,
    sentToAnswerPushMs: rec.firstAnswerPushAtMs ? rec.firstAnswerPushAtMs - rec.sentAtMs : null,
    sentToVisibleMs: rec.visibleAtMs ? rec.visibleAtMs - rec.sentAtMs : null,
    sentToRunStartMs: rec.runStartAtMs ? rec.runStartAtMs - rec.sentAtMs : null,
    sentToPreambleInRolloutMs: roll?.preambleAt ? roll.preambleAt - msg.at : null,
    sentToFirstToolMs: roll?.firstToolAt ? roll.firstToolAt - msg.at : null,
    preambleInCard: pre ? Boolean(preWrite) : null, sentToPreambleCardMs: preWrite ? preWrite.at - msg.at : null,
    sentToFirstCardTextMs: firstTextWrite ? firstTextWrite.at - msg.at : null, firstCardText: firstTextWrite?.text?.slice(0, 120) ?? null,
    cardWrites: writes.length,
    tools: roll?.tools ?? null, requests: roll?.requests ?? null, reasoningTokens: roll?.reasoningTokens ?? null,
    preambleBeforeTool: roll?.preambleBeforeTool ?? null, preamble: roll?.preamble ?? null, preamblePhase: roll?.preamblePhase ?? null,
    assistantMessages: roll?.assistantMessages ?? null, assistantChars: roll?.assistantChars ?? null,
    answerOk: roll ? Boolean(t.ok(roll.finalText)) : false, finalText: roll?.finalText?.slice(0, 300) ?? null,
    fidelity: roll?.fidelity ?? null, rolloutEnd: roll?.end ?? null,
  };
  step("turn", r);
  return r;
}
const stat = (v) => { const s = v.filter((x) => typeof x === "number").sort((a, b) => a - b); const q = (p) => s.length ? s[Math.min(s.length - 1, Math.floor((s.length - 1) * p + 0.5))] : null; return { n: s.length, p50: q(0.5), p90: q(0.9), all: s }; };

let failure;
try {
  await bootGateway();
  const results = [];
  for (let rep = 1; rep <= REPS; rep++) {
    for (const [si, scenario] of SCENARIOS.entries()) {
      // alternate which arm goes first, so neither arm always runs on a warmer DeepSeek cache
      const order = (rep + si) % 2 === 0 ? ARMS : [...ARMS].reverse();
      for (const arm of order) {
        if (scenario.onlyArm && scenario.onlyArm !== arm) continue;
        setArm(arm);
        const chat = scenario.chatType === "group" ? `oc_vpre_${arm}_${scenario.id}_${rep}` : dmChat(arm, scenario.id, rep);
        for (const [i, t] of scenario.turns.entries()) {
          if (t.switchTo) setArm(t.switchTo);
          const r = await turn(arm, scenario, rep, chat, t, i);
          r.configArm = currentArm;
          results.push(r);
          // the arm must reach the thread: dedup threads carry no native skills block, base threads do
          if (r.threadNativeSkills !== null && !scenario.turns.some((x) => x.switchTo)) {
            const want = CONFIG_ARMS[arm]?.nativeSkillsOff ? 0 : 1;
            if ((want === 0) !== (r.threadNativeSkills === 0)) throw new Error(`arm ${arm} not applied: thread has ${r.threadNativeSkills} native skills blocks (${r.rolloutFile})`);
          }
        }
      }
    }
  }
  evidence.turns = results;
  const summary = {};
  for (const arm of ARMS) {
    const mine = results.filter((r) => r.arm === arm);
    const toolTurns = mine.filter((r) => r.tools?.length);
    const chat = mine.filter((r) => r.kind === "chat");
    const byChatType = Object.fromEntries(["p2p", "group"].map((ct) => { const tt = toolTurns.filter((r) => r.chatType === ct); return [ct, `${tt.filter((r) => r.preambleBeforeTool).length}/${tt.length}`]; }));
    summary[arm] = {
      turns: mine.length, replied: mine.filter((r) => r.ok).length, answerOk: mine.filter((r) => r.answerOk).length,
      toolTurns: toolTurns.length, preambleByChatType: byChatType, preambleBeforeTool: toolTurns.filter((r) => r.preambleBeforeTool).length,
      preambleInCard: toolTurns.filter((r) => r.preambleInCard).length,
      chatTurnsUsedTools: chat.filter((r) => r.tools?.length).length, chatTurnsWithExtraMessage: chat.filter((r) => (r.assistantMessages ?? 0) > 1).length,
      toolSentToFirstCardText: stat(toolTurns.map((r) => r.sentToFirstCardTextMs)), toolSentToAnswerPush: stat(toolTurns.map((r) => r.sentToAnswerPushMs)),
      toolSentToFirstPush: stat(toolTurns.map((r) => r.sentToFirstPushMs)), toolSentToFirstTool: stat(toolTurns.map((r) => r.sentToFirstToolMs)),
      chatSentToAnswerPush: stat(chat.map((r) => r.sentToAnswerPushMs)),
      assistantChars: stat(mine.map((r) => r.assistantChars)), chatAssistantChars: stat(chat.map((r) => r.assistantChars)),
      reasoningTokens: stat(mine.map((r) => r.reasoningTokens)),
      newChatFirstRequestInput: stat(mine.filter((r) => r.index === 0).map((r) => r.firstReqInput)),
      newChatFirstRequestCached: stat(mine.filter((r) => r.index === 0).map((r) => r.firstReqCached)),
      perTurnInputTokens: stat(mine.map((r) => r.inputTokensAll)), perTurnCachedTokens: stat(mine.map((r) => r.cachedTokensAll)),
      requestsPerTurn: stat(mine.map((r) => r.requestsCaptured)), firstRequestTtfb: stat(mine.map((r) => r.firstReqTtfbMs)),
      turnTotalMs: stat(mine.map((r) => r.sentToTurnEndMs)), firstPushMs: stat(mine.map((r) => r.sentToFirstPushMs)), answerPushMs: stat(mine.map((r) => r.sentToAnswerPushMs)),
      noReply: `${mine.filter((r) => r.kind === "noreply" && r.answerOk).length}/${mine.filter((r) => r.kind === "noreply").length}`,
      skillRead: `${mine.filter((r) => r.kind === "skill" && r.skillRead).length}/${mine.filter((r) => r.kind === "skill").length}`,
      skillAnswer: `${mine.filter((r) => r.kind === "skill" && r.answerOk).length}/${mine.filter((r) => r.kind === "skill").length}`,
      skillTurnMs: stat(mine.filter((r) => r.kind === "skill").map((r) => r.sentToTurnEndMs)),
    };
  }
  evidence.summary = summary;
  // request breakdown: the first request of the breakdown DM (rep 1) of each arm, every source counted by DeepSeek
  evidence.breakdown = {};
  for (const arm of ARMS) {
    const rs = results.filter((r) => r.arm === arm && r.scenario === "dm-breakdown" && r.rep === 1);
    if (!rs.length || !rs[0].firstReqFile) continue;
    const { seg, tools, toolNames, nativeSkills } = segmentRequest(JSON.parse(fs.readFileSync(rs[0].firstReqFile, "utf8")), rs[0].id);
    const base = await deepseekTokens("x");
    const tokens = {};
    for (const [k, v] of Object.entries(seg)) tokens[k] = v ? { chars: v.length, tokens: (await deepseekTokens(v)) - base + 1 } : { chars: 0, tokens: 0 };
    const oc = seg.openclaw_ws_skills_list ?? "";
    const ocNames = [...oc.matchAll(/<name>([^<]+)<\/name>/gu)].map((m) => m[1]);
    const ocLocs = [...oc.matchAll(/<location>([^<]+)<\/location>/gu)].map((m) => m[1].replace(/\/[^/]+\/SKILL\.md$/u, "").replace(/\/skills\/[^/]+.*$/u, "/skills"));
    const nativeNames = Object.entries(seg).filter(([k]) => k.startsWith("codex_native_skills_")).map(([k, v]) => [k, [...v.matchAll(/^- ([^:\n]+): /gmu)].length]);
    evidence.breakdown[arm] = { tokens, tools, toolNames, nativeSkills, openclawSkills: { count: ocNames.length, names: ocNames, head: oc.slice(0, 700), byRoot: Object.fromEntries([...new Set(ocLocs)].map((r) => [r.replace(scratch, "<scratch>"), ocLocs.filter((x) => x === r).length])) }, nativeSkillCounts: Object.fromEntries(nativeNames), reportedInput: rs[0].firstReqInput, reportedCached: rs[0].firstReqCached,
      turns: rs.map((r) => ({ index: r.index, kind: r.kind, requests: r.requestsCaptured, firstReqInput: r.firstReqInput, firstReqCached: r.firstReqCached, inputAll: r.inputTokensAll, cachedAll: r.cachedTokensAll, firstReqChars: r.firstReqChars })) };
    step("breakdown", { arm, ...evidence.breakdown[arm], toolNames: undefined });
  }
  evidence.fidelity = {};
  for (const r of results) if (r.fidelity) evidence.fidelity[`${r.arm}/${r.chatType}`] ??= r.fidelity;
  check("every turn replied", results.every((r) => r.ok), { failed: results.filter((r) => !r.ok).map((r) => r.id) });
  const keyArms = new Map();
  for (const r of results) { if (!r.sessionKey) continue; (keyArms.get(r.sessionKey) ?? keyArms.set(r.sessionKey, new Set()).get(r.sessionKey)).add(`${r.arm}/${r.scenario}/${r.rep}`); }
  check("every scenario instance has its own session", [...keyArms.values()].every((v) => v.size === 1), { shared: [...keyArms.entries()].filter(([, v]) => v.size > 1).map(([k, v]) => [k, [...v]]) });
  check("rollout found for every turn", results.every((r) => r.tools !== null), { missing: results.filter((r) => r.tools === null).map((r) => r.id) });
} catch (err) {
  failure = redact(err?.stack ?? err);
} finally {
  await stopGateway().catch(() => {});
  server.close();
  proxy.close();
  fs.rmSync(shortTmp, { recursive: true, force: true });
}
evidence.unknownFeishuCalls = Object.fromEntries(fake.unknown);
evidence.turnErrorLog = logMatches(/outcome=error|FailoverError|No API key|401|403|rate limit|harness failed|codex app-server.*(error|failed)/iu).filter((l) => !/card-phase/u.test(l)).slice(0, 15).map((l) => redact(l.slice(14)).slice(0, 600));
evidence.commentaryLog = logMatches(/commentary|preamble|progress-stream/iu).slice(0, 20).map((l) => redact(l.slice(14)).slice(0, 400));
evidence.failure = failure ?? null;
evidence.ok = !failure && evidence.checks.length > 0 && evidence.checks.every((c) => c.ok);
console.log(JSON.stringify(evidence, null, 1));
for (const [arm, s] of Object.entries(evidence.summary ?? {})) console.log(`RESULT ${arm}: tool turns ${s.toolTurns}, preamble ${s.preambleBeforeTool}, in card ${s.preambleInCard}; first card text p50 ${s.toolSentToFirstCardText.p50} ms, answer push p50 ${s.toolSentToAnswerPush.p50} ms; chat turns with tools ${s.chatTurnsUsedTools}, extra msgs ${s.chatTurnsWithExtraMessage}; answers ok ${s.answerOk}/${s.turns}`);
for (const [arm, s] of Object.entries(evidence.summary ?? {})) console.log(`RESULT ${arm}: new-chat first request input p50 ${s.newChatFirstRequestInput.p50} (cached p50 ${s.newChatFirstRequestCached.p50}); per-turn input p50 ${s.perTurnInputTokens.p50}; turn total p50 ${s.turnTotalMs.p50} ms; first push p50 ${s.firstPushMs.p50} ms; noReply ${s.noReply}; skills read ${s.skillRead}, answered ${s.skillAnswer}`);
for (const [arm, b] of Object.entries(evidence.breakdown ?? {})) console.log(`BREAKDOWN ${arm}: reported ${b.reportedInput} (cached ${b.reportedCached}), tools ${b.tools}; ${Object.entries(b.tokens).map(([k, v]) => `${k}=${v.tokens}t/${v.chars}c`).join(" ")}`);
process.exitCode = evidence.ok ? 0 : 1;
