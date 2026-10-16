// Candidate reproduction: a real turn on a large session whose transcript projection is being
// rebuilt. V 2026-10-17 00:39: four turns of 7da00997 (143 MB) failed in about 300 ms with
// "Session transcript projection is rebuilding" before reaching the model. Native OpenClaw waits
// for the projection only before subagent-announce / harness-task turns and GPT-Live voice turns.
//
// Builds a private makaron database (the shared VLab session inflated to V's size, as in
// projection-rebuild-freeze.mjs), starts a private Gateway with Workers and V's model routing,
// marks the session dirty right before a turn (needs_rebuild = 1, as the appender does when an
// append does not extend the indexed leaf), and runs TURNS chat turns. Reports each turn's status,
// time and error, and every [projection-unavailable-probe] line (the probe overlay logs the stack
// of each read that finds the projection unavailable). A control turn runs after the rebuild.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const SOURCE_SESSION = process.env.SOURCE_SESSION ?? "3c3fab41-f6de-4fa9-98de-679038ec5c9d";
const INFLATE = Number(process.env.INFLATE ?? 4);
const MEDIA_ROWS = Number(process.env.MEDIA_ROWS ?? 40);
const MEDIA_IMAGES_PER_ROW = Number(process.env.MEDIA_IMAGES_PER_ROW ?? 5);
const MEDIA_IMAGE_CHARS = Number(process.env.MEDIA_IMAGE_CHARS ?? 240_000);
const EXTRA_SESSIONS = Number(process.env.EXTRA_SESSIONS ?? 3);
const FTS_COPIES = Number(process.env.FTS_COPIES ?? 3);
const DIRTY_TURNS = Number(process.env.DIRTY_TURNS ?? 1);
const MEDIA_TURNS = Number(process.env.MEDIA_TURNS ?? 2);
const PROMPT = process.env.PROMPT ?? "（自动化测试）只回复一个字：好";
const MODEL = "deepseek/deepseek-flash";
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const secrets = new Set();
const redact = (s) => {
  let out = String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
  for (const v of secrets) if (v) out = out.replaceAll(v, "[redacted]");
  return out;
};
const secret = (name) => {
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  return undefined;
};
const dist = path.join(runtime, "openclaw", "dist");

// ---- private makaron database ----
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const srcPath = path.join(sharedState, dbRel);
const dstPath = path.join(stateDir, dbRel);
assert(!fs.existsSync(dstPath), `private database already exists at ${dstPath}`);
fs.mkdirSync(path.dirname(dstPath), { recursive: true });

function buildPrivateDatabase() {
  const src = new DatabaseSync(srcPath, { readOnly: true });
  const dst = new DatabaseSync(dstPath);
  dst.exec("PRAGMA foreign_keys = OFF");
  const master = src.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all();
  const virtual = master.filter((m) => m.type === "table" && /CREATE VIRTUAL TABLE/iu.test(m.sql)).map((m) => m.name);
  const shadow = (name) => virtual.some((v) => name.startsWith(`${v}_`));
  // memory_* vector tables need sqlite-vec; this run does not touch memory search
  const tables = master.filter((m) => m.type === "table" && !m.name.startsWith("sqlite_") && !shadow(m.name)
    && !(virtual.includes(m.name) && /vec0/iu.test(m.sql)));
  for (const t of tables) dst.exec(t.sql);
  for (const i of master.filter((m) => m.type === "index" && !shadow(m.tbl_name) && tables.some((t) => t.name === m.tbl_name))) dst.exec(i.sql);
  const key = src.prepare("SELECT session_key FROM session_windows WHERE session_id = ?").get(SOURCE_SESSION)?.session_key;
  assert(key, `session ${SOURCE_SESSION} is not in the shared VLab mirror`);
  const extra = src.prepare(`SELECT s.session_id FROM session_transcript_index_state s JOIN session_windows w ON w.session_id = s.session_id
    WHERE s.needs_rebuild = 0 AND s.session_id <> ? ORDER BY s.active_event_count DESC LIMIT ?`).all(SOURCE_SESSION, EXTRA_SESSIONS).map((r) => r.session_id);
  const ids = [SOURCE_SESSION, ...extra];
  const keys = ids.map((id) => src.prepare("SELECT session_key FROM session_windows WHERE session_id = ?").get(id).session_key);
  const convs = new Set();
  for (const id of ids) {
    for (const r of src.prepare("SELECT conversation_id FROM session_conversations WHERE session_id = ?").all(id)) convs.add(r.conversation_id);
    const primary = src.prepare("SELECT primary_conversation_id FROM session_windows WHERE session_id = ?").get(id)?.primary_conversation_id;
    if (primary) convs.add(primary);
  }
  const inList = (col, values) => `"${col}" IN (${values.map(() => "?").join(",")})`;
  for (const t of tables) {
    const cols = src.prepare(`PRAGMA table_info("${t.name}")`).all().map((c) => c.name);
    if (t.name.startsWith("memory_") || t.name.startsWith("standing_intents_fts")) continue;
    let where, args;
    if (cols.includes("session_id")) { where = inList("session_id", ids); args = ids; }
    else if (cols.includes("session_key")) { where = inList("session_key", keys); args = keys; }
    else if (cols.includes("conversation_id")) {
      if (!convs.size) continue;
      where = inList("conversation_id", [...convs]); args = [...convs];
    } else { where = ""; args = []; }
    const list = cols.map((c) => `"${c}"`).join(",");
    const ins = dst.prepare(`INSERT OR IGNORE INTO "${t.name}" (${list}) VALUES (${cols.map(() => "?").join(",")})`);
    dst.exec("BEGIN");
    for (const r of src.prepare(`SELECT ${list} FROM "${t.name}"${where ? ` WHERE ${where}` : ""}`).iterate(...args)) ins.run(...cols.map((c) => r[c]));
    dst.exec("COMMIT");
  }
  // V-sized FTS: the mirror's other sessions' rows, re-owned by the copied extra sessions so the
  // reconcile preflight does not treat them as orphans.
  const insFts = dst.prepare("INSERT INTO session_transcript_fts (text, session_id, message_id, role, timestamp) VALUES (?, ?, ?, ?, ?)");
  let filler = 0;
  for (let copy = 0; copy < FTS_COPIES; copy++) {
    dst.exec("BEGIN");
    for (const r of src.prepare("SELECT text, session_id, message_id, role, timestamp FROM session_transcript_fts WHERE session_id NOT IN (" + ids.map(() => "?").join(",") + ")").iterate(...ids)) {
      insFts.run(r.text, extra[filler % extra.length], `${r.message_id}:c${copy}`, r.role, r.timestamp);
      filler++;
    }
    dst.exec("COMMIT");
  }
  for (const tr of master.filter((m) => m.type === "trigger" && !shadow(m.tbl_name) && tables.some((t) => t.name === m.tbl_name))) dst.exec(tr.sql);
  dst.exec(`PRAGMA user_version = ${src.prepare("PRAGMA user_version").get().user_version}`);
  dst.exec("PRAGMA journal_mode = WAL");
  src.close();
  dst.close();
  return { sessionKey: key, extra, ftsFiller: filler };
}

// ---- inflate the copied session to V's size, keeping every derived table consistent ----
function inflateSession() {
  const db = new DatabaseSync(dstPath);
  db.exec("PRAGMA foreign_keys = OFF");
  const sid = SOURCE_SESSION;
  const events = db.prepare("SELECT seq, event_json, created_at FROM transcript_events WHERE session_id = ? ORDER BY seq").all(sid)
    .map((e) => ({ ...e, obj: JSON.parse(e.event_json) }));
  const identities = db.prepare("SELECT event_id, seq, event_type, parent_id, message_idempotency_key, created_at FROM transcript_event_identities WHERE session_id = ?").all(sid);
  const active = db.prepare("SELECT active_position, event_seq, message_position, context_eligible FROM session_transcript_active_events WHERE session_id = ? ORDER BY active_position").all(sid);
  const state = db.prepare("SELECT * FROM session_transcript_index_state WHERE session_id = ?").get(sid);
  assert(state && state.needs_rebuild === 0 && state.leaf_event_id, "source session index state is not usable");
  const header = events.find((e) => e.obj.type === "session");
  const idSet = new Set(identities.map((r) => r.event_id));
  const stride = Math.max(...events.map((e) => e.seq)) + 1;
  const body = events.filter((e) => e !== header);
  const activeBody = active.filter((a) => a.event_seq !== header?.seq);
  const suffix = (id, b) => `${id}r${b}`;
  const rewrite = (value, b) => {
    if (typeof value === "string") return idSet.has(value) ? suffix(value, b) : value;
    if (Array.isArray(value)) return value.map((v) => rewrite(v, b));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v, b)]));
    return value;
  };
  const insEvent = db.prepare("INSERT INTO transcript_events (session_id, seq, event_json, created_at) VALUES (?, ?, ?, ?)");
  const insIdentity = db.prepare("INSERT INTO transcript_event_identities (session_id, event_id, seq, event_type, parent_id, message_idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const insActive = db.prepare("INSERT INTO session_transcript_active_events (session_id, active_position, event_seq, message_position, context_eligible) VALUES (?, ?, ?, ?, ?)");
  const identityBySeq = new Map(identities.map((r) => [r.seq, r]));
  db.exec("BEGIN");
  let leaf = state.leaf_event_id;
  for (let b = 1; b < INFLATE; b++) {
    const previousLeaf = leaf;
    for (const e of body) {
      let obj = rewrite(e.obj, b);
      if ("parentId" in obj && obj.parentId === null) obj.parentId = previousLeaf;
      const metaToCustom = obj.type === "thinking_level_change" || obj.type === "model_change";
      if (metaToCustom) obj = { type: "custom", customType: "inflated-meta", id: obj.id, parentId: obj.parentId, timestamp: obj.timestamp, data: {} };
      const seq = b * stride + e.seq;
      insEvent.run(sid, seq, JSON.stringify(obj), e.created_at);
      const identity = identityBySeq.get(e.seq);
      if (identity) {
        insIdentity.run(sid, suffix(identity.event_id, b), seq, metaToCustom ? "custom" : identity.event_type,
          identity.parent_id === null ? previousLeaf : (idSet.has(identity.parent_id) ? suffix(identity.parent_id, b) : identity.parent_id),
          identity.message_idempotency_key === null ? null : `${identity.message_idempotency_key}:r${b}`, identity.created_at);
      }
    }
    activeBody.forEach((a, index) => {
      insActive.run(sid, active.length + (b - 1) * activeBody.length + index, b * stride + a.event_seq,
        a.message_position === null ? null : b * state.active_message_count + a.message_position, a.context_eligible);
    });
    leaf = suffix(state.leaf_event_id, b);
  }
  db.prepare("UPDATE session_transcript_index_state SET indexed_seq = ?, leaf_event_id = ?, active_event_count = ?, active_message_count = ? WHERE session_id = ?")
    .run((INFLATE - 1) * stride + stride - 1, leaf, active.length + (INFLATE - 1) * activeBody.length, INFLATE * state.active_message_count, sid);
  const toolResults = db.prepare(`SELECT seq FROM transcript_events WHERE session_id = ?
    AND json_extract(event_json, '$.message.role') = 'toolResult' ORDER BY seq`).all(sid).map((r) => r.seq);
  const n = Math.min(MEDIA_ROWS, toolResults.length);
  const picks = new Set(Array.from({ length: n }, (_, i) => toolResults[Math.floor((i + 0.5) * toolResults.length / n)]));
  const getEvent = db.prepare("SELECT event_json FROM transcript_events WHERE session_id = ? AND seq = ?");
  const setEvent = db.prepare("UPDATE transcript_events SET event_json = ? WHERE session_id = ? AND seq = ?");
  for (const seq of picks) {
    const obj = JSON.parse(getEvent.get(sid, seq).event_json);
    const images = Array.from({ length: MEDIA_IMAGES_PER_ROW }, () => ({ type: "image", data: randomBytes(Math.ceil(MEDIA_IMAGE_CHARS * 3 / 4)).toString("base64").slice(0, MEDIA_IMAGE_CHARS), mimeType: "image/jpeg" }));
    obj.message.content = [...(Array.isArray(obj.message.content) ? obj.message.content : [{ type: "text", text: String(obj.message.content ?? "") }]), ...images];
    setEvent.run(JSON.stringify(obj), sid, seq);
  }
  // the inflated copies' searchable text, as the forward indexer would have written it
  db.exec("COMMIT");
  db.exec("CREATE TABLE __probe_writes (id INTEGER PRIMARY KEY, at INTEGER NOT NULL)");
  const size = db.prepare("SELECT count(*) AS rows, sum(octet_length(event_json)) AS bytes FROM transcript_events WHERE session_id = ?").get(sid);
  const fts = db.prepare("SELECT count(*) AS n FROM session_transcript_fts_docsize").get().n;
  db.close();
  return { events: size.rows, mb: Math.round(size.bytes / 1e5) / 10, ftsRows: fts };
}

const flashEntry = {
  id: "deepseek-flash", name: "DeepSeek V4.1 Flash", reasoning: true, input: ["text", "image"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1000000, maxTokens: 384000, api: "openai-completions",
  compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" },
};
function asProduction(config, runtimeId) {
  const deepseek = config.models?.providers?.deepseek;
  assert(deepseek, "shared VLab config has no deepseek provider");
  deepseek.models = (deepseek.models ?? []).filter((m) => m.id !== flashEntry.id).concat([flashEntry]);
  const model = { primary: MODEL, fallbacks: [] };
  const perAgent = { alias: "deepseek", agentRuntime: { id: runtimeId }, params: { thinking: "high" } };
  config.agents.defaults.model = model;
  (config.agents.defaults.models ??= {})[MODEL] = perAgent;
  if (config.agents.entries?.makaron) {
    config.agents.entries.makaron.model = model;
    (config.agents.entries.makaron.models ??= {})[MODEL] = perAgent;
  }
  config.agents.defaults.compaction = { ...(config.agents.defaults.compaction ?? {}), model: MODEL };
  const allow = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allow) && !allow.includes(MODEL)) allow.push(MODEL);
  return config;
}

const built = buildPrivateDatabase();
const inflated = inflateSession();
console.log(JSON.stringify({ phase: "built", sessionKey: built.sessionKey, ...inflated }));
const config = asProduction(JSON.parse(fs.readFileSync(configPath, "utf8")), "vlab-worker");
// mirror sessions are weeks old; keep them out of the 30-day idle reset
config.session = { ...(config.session ?? {}), reset: { ...(config.session?.reset ?? {}), idleMinutes: 525600 } };
const port = Number(config.gateway?.port);
const token = config.gateway?.auth?.token;
assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "worker isolation plugin is not configured; production runs turns in Workers");
Object.assign(workerPlugin, { minWorkers: 2, maxWorkers: 2, warmSpareWorkers: 0 });
const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const workerConfig = asProduction(JSON.parse(fs
  .readFileSync(path.join(sharedState, workerRel), "utf8")
  .replaceAll(sharedState, stateDir)
  .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime)), "openclaw");
workerConfig.channels = {};
fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPlugin.workerConfigPath, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
workerPlugin.gatewayConfigPath = configPath;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
const cacheDir = path.join(scratch, "cache");
const shortTmp = `/tmp/.prt-${process.pid}`;
fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(shortTmp, { recursive: true, mode: 0o700 });
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), OPENCLAW_DEFER_PRE_REPLY_MEMORY_FLUSH_IDLE_MS: "15000", TMPDIR: shortTmp, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm") };
const deepseekKey = secret("DEEPSEEK_API_KEY");
assert(deepseekKey, "DEEPSEEK_API_KEY missing from shared secrets.env");
env.DEEPSEEK_API_KEY = deepseekKey;
secrets.add(deepseekKey);
const lines = [];
let gateway, gatewayStarts = 0;
function startGateway() {
  gatewayStarts += 1;
  gateway = spawn(process.execPath, ["--max-old-space-size=8192", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    let rest = "";
    s.on("data", (chunk) => {
      const parts = (rest + chunk).split(/\r?\n/u);
      rest = parts.pop();
      for (const line of parts.filter(Boolean)) lines.push({ at: Date.now(), line });
      if (lines.length > 60_000) lines.splice(0, lines.length - 60_000);
    });
  }
}
let client;
async function connectGateway() {
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) {
      if (gatewayStarts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { startGateway(); continue; }
      throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { client?.stop(); reject(new Error("hello timeout")); }, 5_000);
        client = new GatewayClient({
          url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli",
          scopes: ["operator.admin", "operator.read", "operator.write"],
          onHelloOk: () => { clearTimeout(timeout); resolve(); },
          onConnectError: (error) => { clearTimeout(timeout); reject(error); },
        });
        client.start();
      });
      return;
    } catch (error) { lastError = error; client?.stop(); await sleep(1_000); }
  }
  throw lastError ?? new Error("candidate Gateway did not become ready");
}

const markDirty = () => {
  const db = new DatabaseSync(dstPath);
  db.exec("PRAGMA busy_timeout = 5000");
  db.prepare("UPDATE session_transcript_index_state SET needs_rebuild = 1, updated_at = ? WHERE session_id = ?").run(Date.now(), SOURCE_SESSION);
  db.close();
};
const projectionState = () => {
  const db = new DatabaseSync(dstPath, { readOnly: true });
  const row = db.prepare("SELECT needs_rebuild, indexed_seq FROM session_transcript_index_state WHERE session_id = ?").get(SOURCE_SESSION);
  const latest = db.prepare("SELECT max(seq) AS seq FROM transcript_events WHERE session_id = ?").get(SOURCE_SESSION).seq;
  db.close();
  return { needsRebuild: row?.needs_rebuild, indexedSeq: row?.indexed_seq, latestSeq: latest };
};
// A generated-media completion turn as subagent-announce-delivery queues it on V
// (inputProvenance inter_session, sourceTool image_generate), sent through the agent RPC.
async function runMediaTurn(label) {
  const started = Date.now();
  try {
    const sent = await client.request("agent", { agentId: "makaron", sessionKey: built.sessionKey,
      message: `[image_generate 完成] （自动化测试 ${label}）图片已生成。只回复一个字：好`,
      inputProvenance: { kind: "inter_session", sourceChannel: "webchat", sourceTool: "image_generate" },
      deliver: false, idempotencyKey: `projection-media-${Date.now()}-${label}` });
    const runId = sent?.runId;
    assert(runId, `agent returned no runId: ${JSON.stringify(sent).slice(0, 200)}`);
    const waited = await client.request("agent.wait", { runId, timeoutMs: 300000 }, { timeoutMs: 320000 });
    return { label, kind: "media", status: waited?.status, ms: Date.now() - started, error: waited?.error ? redact(JSON.stringify(waited.error)).slice(0, 400) : undefined };
  } catch (error) {
    return { label, kind: "media", status: "threw", ms: Date.now() - started, error: redact(String(error?.message ?? error)).slice(0, 400) };
  }
}
async function runChatTurn(label) {
  const started = Date.now();
  try {
    const sent = await client.request("chat.send", { agentId: "makaron", sessionKey: built.sessionKey, message: PROMPT.replace("（自动化测试）", `（自动化测试 ${label}）`),
      deliver: false, thinking: "low", timeoutMs: 300000, idempotencyKey: `projection-turn-${Date.now()}-${label}` });
    const runId = sent?.runId;
    assert(runId, `chat.send returned no runId: ${JSON.stringify(sent).slice(0, 200)}`);
    const waited = await client.request("agent.wait", { runId, timeoutMs: 300000 }, { timeoutMs: 320000 });
    return { label, status: waited?.status, ms: Date.now() - started, error: waited?.error ? redact(JSON.stringify(waited.error)).slice(0, 400) : undefined };
  } catch (error) {
    return { label, status: "threw", ms: Date.now() - started, error: redact(String(error?.message ?? error)).slice(0, 400) };
  }
}
startGateway();
try {
  await connectGateway();
  await sleep(5_000);
  const t0 = Date.now();
  const turns = [];
  for (let i = 0; i < DIRTY_TURNS; i++) {
    markDirty();
    const before = projectionState();
    const turn = await runChatTurn(`dirty-${i}`);
    turns.push({ ...turn, projectionBefore: before, projectionAfter: projectionState() });
    // let the scheduled rebuild finish before the next dirty turn
    for (let w = 0; w < 120 && projectionState().needsRebuild !== 0; w++) await sleep(1_000);
  }
  for (let i = 0; i < MEDIA_TURNS; i++) {
    markDirty();
    const before = projectionState();
    const turn = await runMediaTurn(`media-dirty-${i}`);
    turns.push({ ...turn, projectionBefore: before, projectionAfter: projectionState() });
    for (let w = 0; w < 120 && projectionState().needsRebuild !== 0; w++) await sleep(1_000);
  }
  turns.push({ ...(await runMediaTurn("media-control")), projectionBefore: projectionState() });
  turns.push({ ...(await runChatTurn("control")), projectionBefore: projectionState() });
  await sleep(3_000);
  const probes = lines.filter((l) => l.at >= t0 && l.line.includes("[projection-unavailable-probe]")).map((l) => {
    const role = /^\[vlab-worker:\d+\]/u.test(l.line) ? "worker" : "gateway";
    try { return { at: l.at - t0, role, ...JSON.parse(l.line.slice(l.line.indexOf("{", l.line.indexOf("[projection-unavailable-probe]")))) }; } catch { return { at: l.at - t0, role, raw: l.line.slice(0, 600) }; }
  });
  const sites = new Map();
  for (const p of probes) { const k = `${p.role} ${String(p.stack ?? p.raw).split(" < ").slice(1, 9).join(" < ")}`; sites.set(k, (sites.get(k) ?? 0) + 1); }
  const failures = lines.filter((l) => l.at >= t0 && /projection is rebuilding|lane task error|Worker Agent request failed/u.test(l.line)).map((l) => redact(l.line).slice(0, 400));
  const fixed = fs.readFileSync(path.join(dist, "builtin-openclaw-zQV8Wwjr.js"), "utf8").includes("projection-wait-inter-session-v1");
  console.log(JSON.stringify({ fixed, inflated, turns, probeCount: probes.length, sites: [...sites].map(([site, n]) => ({ n, site })), failures: failures.slice(0, 20) }, null, 1));
} catch (error) {
  console.error(redact(lines.slice(-80).map((l) => l.line).join("\n")));
  throw error;
} finally {
  client?.stop();
  gateway.kill("SIGTERM");
  await sleep(3_000);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
  fs.rmSync(shortTmp, { recursive: true, force: true });
}
process.exit(0);
