// Candidate reproduction: which code reads a whole large session synchronously, how long the
// read blocks its process, and whether it delays Agent DB writers.
//
// On V (2026-10-08) "session context snapshot read" (Gateway main process, up to 10.9 s) and
// "session transcript fenced read" (Workers, up to 8.6 s) follow turns in 100-160 MB sessions.
// Both are DEFERRED read transactions in WAL mode; the logs show no writer waiting during any of
// them, but the process that runs them is frozen for the whole read.
//
// This run builds a private makaron database holding one shared-VLab session inflated to V's
// size: the session's events are repeated INFLATE times as one chain (ids suffixed, each block's
// roots attached to the previous block's leaf, derived identity/active-path/index-state rows
// written to match), and MEDIA_ROWS tool results get view_image-shaped inline base64 images, the
// shape of V's > 1 MB rows. It then runs TURNS real turns in that session through the private
// Gateway with V's model routing (deepseek-flash, Gateway -> vlab-worker -> openclaw).
//
// Reported per run:
//   reads    every whole-session read (both operations) >= READ_PROBE_MS: ms, rows, session,
//            process role and call stack -- the callers on the Gateway and in Workers
//   holds    every SQLite transaction held >= HOLD_PROBE_MS with operation and stack, so a
//            whole-session read nested inside a write transaction (logged as agent.write on V)
//            shows up with its stack
//   writer   a side process that takes the real cross-process coordinator and a BEGIN IMMEDIATE
//            write every WRITER_INTERVAL_MS during the turns: the longest admission wait tells
//            whether the reads delay writers
// A synchronous read blocks its whole process for its duration, so the read and hold times are
// also the main-thread stall times; no RPC probe is used (a probe is load of its own).
//
// Nothing is written to shared state: the shared VLab database is opened read-only.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const SOURCE_SESSION = process.env.SOURCE_SESSION ?? "83c2261f-fb4a-4644-92c4-e9054292327b";
const INFLATE = Number(process.env.INFLATE ?? 5);
const MEDIA_ROWS = Number(process.env.MEDIA_ROWS ?? 40);
const MEDIA_IMAGES_PER_ROW = Number(process.env.MEDIA_IMAGES_PER_ROW ?? 5);
const MEDIA_IMAGE_CHARS = Number(process.env.MEDIA_IMAGE_CHARS ?? 240_000);
const TURNS = Number(process.env.TURNS ?? 2);
const EXTRA_SESSIONS = Number(process.env.EXTRA_SESSIONS ?? 20); // more shared-VLab sessions for the equivalence check
const HOLD_PROBE_MS = Number(process.env.HOLD_PROBE_MS ?? 200);
const READ_PROBE_MS = Number(process.env.READ_PROBE_MS ?? 50);
const WRITER_INTERVAL_MS = Number(process.env.WRITER_INTERVAL_MS ?? 25);
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 45_000);
const PROMPT = process.env.PROMPT ?? "（自动化测试）请调用 exec 工具执行 `echo ok` 一次，然后只回复：完成。";
const TURN_PATH = process.env.TURN_PATH ?? "chat"; // chat: chat.send, the reply path channels use; cli: openclaw agent
const FLUSH_IDLE_MS = process.env.FLUSH_IDLE_MS ?? "15000"; // deferred memory flush idle wait (V: 120 s)
const TURN_MODEL = process.env.TURN_MODEL ?? "flash"; // flash: deepseek-flash via vlab-worker; vds: Codex harness + DeepSeek, as V's /vds
const MODEL = "deepseek/deepseek-flash";
const VDS_REF = "deepseek/vds-deepseek-flash";
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
const distFile = (re, marker) => {
  const name = fs.readdirSync(dist).find((f) => re.test(f) && fs.readFileSync(path.join(dist, f), "utf8").includes(marker));
  assert(name, `no dist file matches ${re} with ${marker}`);
  return path.join(dist, name);
};
const STACK = `((Error.stackTraceLimit = Math.max(Error.stackTraceLimit, 50)), String(new Error().stack)).split("\\n").slice(2, 40).map((s) => s.trim().replace(/^at /u, "").replace(/\\(file:[^)]*\\/dist\\//u, "(")).join(" < ")`;

// ---- probes in the private runtime copy ----
{
  const marker = "function logSlowTransactionHold(params) {";
  const file = distFile(/^node-sqlite-.*\.js$/u, marker);
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(marker, `${marker}
	if (params.elapsedMs >= ${HOLD_PROBE_MS}) console.error("[hold-probe] " + JSON.stringify({ ms: params.elapsedMs, op: params.options?.operationLabel ?? null, pid: process.pid, stack: ${STACK} }));`));
}
const readProbe = (kind) => `function __readProbe_${kind}(scope, startedAt, rows) {
	const ms = Date.now() - startedAt;
	if (ms < ${READ_PROBE_MS}) return;
	console.error("[read-probe] " + JSON.stringify({ kind: "${kind}", ms, rows, sessionId: scope?.sessionId ?? null, pid: process.pid, stack: ${STACK} }));
}
`;
{
  const marker = "function loadTranscriptEventsSync(scope) {";
  const file = distFile(/^session-accessor\.sqlite-transcript-store-.*\.js$/u, marker);
  const src = fs.readFileSync(file, "utf8");
  assert.equal(src.split(marker).length, 2, "loadTranscriptEventsSync marker is not unique");
  fs.writeFileSync(file, src.replace(marker, `${readProbe("fenced")}function loadTranscriptEventsSync(scope) {
	const startedAt = Date.now();
	const events = __loadTranscriptEventsSyncProbed(scope);
	__readProbe_fenced(scope, startedAt, events.length);
	return events;
}
function __loadTranscriptEventsSyncProbed(scope) {`));
}
{
  const marker = "function withTranscriptContextSnapshot(scope, view, read) {";
  const file = distFile(/^session-manager-.*\.js$/u, marker);
  const src = fs.readFileSync(file, "utf8");
  assert.equal(src.split(marker).length, 2, "withTranscriptContextSnapshot marker is not unique");
  fs.writeFileSync(file, src.replace(marker, `${readProbe("context")}function withTranscriptContextSnapshot(scope, view, read) {
	const startedAt = Date.now();
	let rows;
	const result = __withTranscriptContextSnapshotProbed(scope, view, (snapshot) => {
		rows = snapshot.entries.length;
		return read(snapshot);
	});
	__readProbe_context({ ...scope, view }, startedAt, rows);
	return result;
}
function __withTranscriptContextSnapshotProbed(scope, view, read) {`));
}

// ---- configuration as on V (same entries as agent-db-lock-holders.mjs) ----
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
const config = asProduction(JSON.parse(fs.readFileSync(configPath, "utf8")), "vlab-worker");
if (TURN_MODEL === "vds") {
  // V's /vds: the Codex harness with DeepSeek behind it (codex-ds-window.mjs, PR #262 shape)
  const vdsEntry = { alias: "vds", agentRuntime: { id: "codex" }, params: { thinking: "high", codexAppServerRuntimeModel: "deepseek-flash" } };
  if (!config.models.providers.deepseek.models.some((m) => m.id === "vds-deepseek-flash")) config.models.providers.deepseek.models.push({ ...flashEntry, id: "vds-deepseek-flash", name: "DeepSeek V4.1 Flash (Codex vds alias)" });
  config.agents.defaults.models[VDS_REF] = vdsEntry;
  config.agents.entries.makaron.models = { ...(config.agents.entries.makaron.models ?? {}), [VDS_REF]: vdsEntry };
  const vdsModel = { primary: VDS_REF, fallbacks: [] };
  config.agents.defaults.model = vdsModel;
  config.agents.entries.makaron.model = vdsModel;
  const allowed = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allowed) && !allowed.includes(VDS_REF)) allowed.push(VDS_REF);
  config.plugins.entries.codex = { ...(config.plugins.entries.codex ?? {}), enabled: true, config: { ...(config.plugins.entries.codex?.config ?? {}), appServer: { mode: "yolo", serviceTier: "priority", approvalPolicy: "never", sandbox: "danger-full-access" } } };
  const codexHome = path.join(config.agents.entries.makaron.agentDir, "codex-home");
  fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(codexHome, "config.toml"), `[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "https://api.deepseek.com/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });
}
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

// ---- private makaron database: the source session only ----
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const srcPath = path.join(sharedState, dbRel);
const dstPath = path.join(stateDir, dbRel);
assert(!fs.existsSync(dstPath), `private database already exists at ${dstPath}`);
fs.mkdirSync(path.dirname(dstPath), { recursive: true });
function buildPrivateDatabase() {
  const vec = path.join(runtime, "openclaw", "node_modules", "sqlite-vec-linux-x64", "vec0.so");
  const src = new DatabaseSync(srcPath, { readOnly: true, allowExtension: true });
  const dst = new DatabaseSync(dstPath, { allowExtension: true });
  src.loadExtension(vec);
  dst.loadExtension(vec);
  dst.exec("PRAGMA foreign_keys = OFF");
  const master = src.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all();
  const virtual = master.filter((m) => m.type === "table" && /CREATE VIRTUAL TABLE/iu.test(m.sql)).map((m) => m.name);
  const shadow = (name) => virtual.some((v) => name.startsWith(`${v}_`));
  const tables = master.filter((m) => m.type === "table" && !m.name.startsWith("sqlite_") && !shadow(m.name));
  for (const t of tables) dst.exec(t.sql);
  for (const i of master.filter((m) => m.type === "index" && !shadow(m.tbl_name))) dst.exec(i.sql);
  const key = src.prepare("SELECT session_key FROM session_windows WHERE session_id = ?").get(SOURCE_SESSION)?.session_key;
  assert(key, `session ${SOURCE_SESSION} is not in the shared VLab mirror`);
  const extra = src.prepare(`SELECT s.session_id FROM session_transcript_index_state s JOIN session_nodes n ON n.current_session_id = s.session_id
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
      where = `"conversation_id" IN (${[...convs].map(() => "?").join(",")})`; args = [...convs];
    } else { where = ""; args = []; }
    const list = cols.map((c) => `"${c}"`).join(",");
    const rows = src.prepare(`SELECT ${list} FROM "${t.name}"${where ? ` WHERE ${where}` : ""}`).all(...args);
    if (!rows.length) continue;
    const ins = dst.prepare(`INSERT OR IGNORE INTO "${t.name}" (${list}) VALUES (${cols.map(() => "?").join(",")})`);
    dst.exec("BEGIN");
    for (const r of rows) ins.run(...cols.map((c) => r[c]));
    dst.exec("COMMIT");
  }
  for (const tr of master.filter((m) => m.type === "trigger" && !shadow(m.tbl_name))) dst.exec(tr.sql);
  for (const v of master.filter((m) => m.type === "view")) dst.exec(v.sql);
  dst.exec(`PRAGMA user_version = ${src.prepare("PRAGMA user_version").get().user_version}`);
  dst.exec("PRAGMA journal_mode = WAL");
  src.close();
  dst.close();
  privateSessions = ids.map((id, i) => ({ sessionId: id, sessionKey: keys[i] }));
  return key;
}
let privateSessions = [];

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
  const messagePositions = active.map((a) => a.message_position).filter((p) => p !== null);
  assert.equal(messagePositions.length, state.active_message_count, "active message count mismatch");
  assert.equal(Math.max(...messagePositions) + 1, state.active_message_count, "message positions are not contiguous");
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
      // V-shaped history: thinking/model switches live only near the start of a long session
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
  // view_image-shaped inline media, spread evenly over the inflated history
  const toolResults = db.prepare(`SELECT seq FROM transcript_events WHERE session_id = ?
    AND json_extract(event_json, '$.message.role') = 'toolResult' ORDER BY seq`).all(sid).map((r) => r.seq);
  const picks = new Set(Array.from({ length: Math.min(MEDIA_ROWS, toolResults.length) }, (_, i) => toolResults[Math.floor((i + 0.5) * toolResults.length / Math.min(MEDIA_ROWS, toolResults.length))]));
  const getEvent = db.prepare("SELECT event_json FROM transcript_events WHERE session_id = ? AND seq = ?");
  const setEvent = db.prepare("UPDATE transcript_events SET event_json = ? WHERE session_id = ? AND seq = ?");
  for (const seq of picks) {
    const obj = JSON.parse(getEvent.get(sid, seq).event_json);
    const images = Array.from({ length: MEDIA_IMAGES_PER_ROW }, () => ({ type: "image", data: randomBytes(Math.ceil(MEDIA_IMAGE_CHARS * 3 / 4)).toString("base64").slice(0, MEDIA_IMAGE_CHARS), mimeType: "image/jpeg" }));
    obj.message.content = [...(Array.isArray(obj.message.content) ? obj.message.content : [{ type: "text", text: String(obj.message.content ?? "") }]), ...images];
    setEvent.run(JSON.stringify(obj), sid, seq);
  }
  db.exec("COMMIT");
  const size = db.prepare("SELECT count(*) AS rows, sum(octet_length(event_json)) AS bytes, sum(octet_length(event_json) > 1048576) AS big FROM transcript_events WHERE session_id = ?").get(sid);
  const check = db.prepare("PRAGMA foreign_key_check(session_transcript_active_events)").all().length + db.prepare("PRAGMA foreign_key_check(transcript_event_identities)").all().length;
  assert.equal(check, 0, "inflated derived rows reference missing events");
  db.exec("CREATE TABLE __probe_writes (id INTEGER PRIMARY KEY, at INTEGER NOT NULL)"); // side writer target, before the Gateway opens the file
  db.close();
  return { ...size, mb: Math.round(size.bytes / 1e5) / 10, activeEvents: active.length + (INFLATE - 1) * activeBody.length, leaf };
}

// ---- side writer: the real coordinator, then BEGIN IMMEDIATE, every WRITER_INTERVAL_MS ----
const WRITER_SRC = `
const { DatabaseSync } = require("node:sqlite");
const [dbPath, intervalMs, outPath] = process.argv.slice(1);
const coordinatorPath = dbPath + ".session-writer-coordinator";
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA busy_timeout = 5000");
const ins = db.prepare("INSERT INTO __probe_writes (at) VALUES (?)");
const samples = [];
let stop = false;
process.on("SIGTERM", () => { stop = true; });
const wait = new Int32Array(new SharedArrayBuffer(4));
(async function loop() {
  while (!stop) {
    const t0 = Date.now();
    let lease, attempts = 0;
    for (;;) {
      const c = new DatabaseSync(coordinatorPath);
      try { c.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE;"); lease = c; break; }
      catch { c.close(); }
      attempts++;
      if (Date.now() - t0 > 5000) break;
      Atomics.wait(wait, 0, 0, Math.min(50, 5 * 2 ** Math.min(attempts, 4)));
    }
    const admitted = Date.now();
    let beginMs = null, ok = false;
    if (lease) {
      const b0 = Date.now();
      try { db.exec("BEGIN IMMEDIATE"); beginMs = Date.now() - b0; ins.run(Date.now()); db.exec("COMMIT"); ok = true; } catch { try { db.exec("ROLLBACK"); } catch {} }
      lease.exec("ROLLBACK"); lease.close();
    }
    samples.push({ at: t0, admissionMs: admitted - t0, beginMs, ok, timeout: !lease });
    await new Promise((r) => setTimeout(r, Number(intervalMs)));
  }
  require("node:fs").writeFileSync(outPath, JSON.stringify(samples));
  process.exit(0);
})();
`;

// ---- managed npm plugins (codex etc.) as installed on shared VLab; the private state has none ----
if (!fs.existsSync(path.join(stateDir, "npm"))) {
  assert.equal(spawnSync("cp", ["-a", "--reflink=auto", path.join(sharedState, "npm"), path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
}

// ---- direct control: call both whole-session reads in a child process, time them, digest the result ----
const DIRECT_SRC = `
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  const [dist, sessionId, sessionKey] = process.argv.slice(1);
  const file = fs.readdirSync(dist).find((f) => /^session-manager-.*\\.js$/u.test(f) && fs.readFileSync(path.join(dist, f), "utf8").includes("static openModelContext("));
  const { t: SessionManager } = await import(path.join(dist, file));
  const target = { agentId: "makaron", sessionId, sessionKey };
  const out = {};
  const digest = (v) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
  for (let i = 0; i < 3; i++) {
    let t = Date.now();
    const m = SessionManager.openModelContext(target);
    const contextMs = Date.now() - t;
    const ctx = m.buildSessionContext();
    t = Date.now();
    const full = SessionManager.open(target);
    const fullMs = Date.now() - t;
    const fullCtx = full.buildSessionContext();
    (out.runs ??= []).push({ contextMs, fullMs });
    out.modelContext = { entries: m.getEntries().length, messages: ctx.messages.length, model: ctx.model, thinkingLevel: ctx.thinkingLevel, digest: digest(ctx.messages), leaf: m.getLeafId() };
    out.fullOpen = { entries: full.getEntries().length, messages: fullCtx.messages.length, digest: digest(fullCtx.messages), leaf: full.getLeafId() };
  }
  console.log(JSON.stringify(out));
})().catch((e) => { console.error(e?.stack ?? e); process.exit(1); });
`;
// ---- equivalence: the Worker plugin's tail read against OpenClaw's full visible read ----
const EQUIV_SRC = `
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
(async () => {
  const [runtime, sessionsJson] = process.argv.slice(1);
  const dist = path.join(runtime, "openclaw", "dist");
  const hr = await import(path.join(runtime, "production-worker", "harness-result.mjs"));
  if (typeof hr.readNativeTailEntries !== "function") { console.log(JSON.stringify({ skipped: "baseline plugin has no tail read" })); return; }
  const sdk = await import(path.join(dist, "plugin-sdk", "session-transcript-runtime.js"));
  const out = [];
  for (const s of JSON.parse(sessionsJson)) {
    const target = { agentId: "makaron", sessionId: s.sessionId, sessionKey: s.sessionKey };
    let t = Date.now();
    const full = await sdk.readVisibleSessionTranscriptMessageEntries(target);
    const fullMs = Date.now() - t;
    const users = full.filter((e) => e.message?.role === "user");
    // the attempt starts at the last user message; also a deeper start 600 messages back
    const starts = [users.at(-1), full[Math.max(0, full.length - 600)]].filter(Boolean).map((e) => {
      const v = e.message.timestamp ?? e.createdAt; return typeof v === "number" ? v : Date.parse(v);
    });
    for (const minTimestamp of [undefined, ...starts]) {
      t = Date.now();
      const tail = await hr.readNativeTailEntries(target, { minTimestamp });
      const tailMs = Date.now() - t;
      const shape = (e) => ({ entryId: e.entryId, createdAt: e.createdAt, message: e.message });
      const same = Array.isArray(tail) && isDeepStrictEqual(tail.map(shape), full.slice(full.length - tail.length).map(shape));
      let attemptSame;
      if (minTimestamp !== undefined && Array.isArray(tail)) {
        const agentResult = { payloads: [], meta: { agentMeta: { sessionId: s.sessionId } } };
        const a = await hr.buildHarnessAttemptResult(agentResult, { transcriptTarget: target, attemptStartedAt: minTimestamp, readVisibleEntries: async () => full });
        const b = await hr.buildHarnessAttemptResult(agentResult, { transcriptTarget: target, attemptStartedAt: minTimestamp });
        const strip = ({ messagesSnapshot, lastAssistantTextMessageIndex, ...rest }) => rest;
        attemptSame = isDeepStrictEqual(strip(a), strip(b)) && isDeepStrictEqual(a.messagesSnapshot[a.lastAssistantTextMessageIndex], b.messagesSnapshot[b.lastAssistantTextMessageIndex]);
        const differs = Object.keys(strip(a)).filter((k) => !isDeepStrictEqual(a[k], b[k]));
        // messages before the tail whose timestamp is at or after the attempt start (out-of-order history)
        const time = (e) => { const v = e.message?.timestamp ?? e.createdAt; return typeof v === "number" ? v : Date.parse(v); };
        const outOfOrder = full.slice(0, full.length - tail.length).filter((e) => time(e) >= minTimestamp).length;
        out.push({ session: s.sessionId.slice(0, 8), messages: full.length, fullMs, tailMs, tail: tail.length, minTimestamp: true, same, attemptSame, differs, outOfOrder,
          fullSnapshotBytes: Buffer.byteLength(JSON.stringify(a.messagesSnapshot)), tailSnapshotBytes: Buffer.byteLength(JSON.stringify(b.messagesSnapshot)) });
      } else out.push({ session: s.sessionId.slice(0, 8), messages: full.length, fullMs, tailMs, tail: tail?.length ?? null, minTimestamp: minTimestamp !== undefined, same });
    }
  }
  console.log(JSON.stringify({ checks: out }));
})().catch((e) => { console.error(e?.stack ?? e); process.exit(1); });
`;
function equivalence() {
  const r = spawnSync(process.execPath, ["--max-old-space-size=8192", "-e", EQUIV_SRC, runtime, JSON.stringify(privateSessions)], {
    env: { ...process.env, OPENCLAW_STATE_DIR: stateDir, OPENCLAW_CONFIG_PATH: configPath, VLAB_OPENCLAW_AGENT_RUNTIME: path.join(dist, "plugin-sdk", "agent-runtime.js") },
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const json = r.stdout.split(/\r?\n/u).filter((l) => l.startsWith("{")).pop();
  return { status: r.status, result: json ? JSON.parse(json) : null, error: r.status === 0 ? undefined : redact(r.stderr).slice(-2000) };
}

// ---- context window: the patched model-context read against the full scan (OPENCLAW_V_CONTEXT_WINDOW_READ=0) ----
const CTX_SRC = `
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
(async () => {
  const [dist, dbPath, sessionsJson] = process.argv.slice(1);
  const file = fs.readdirSync(dist).find((f) => /^session-manager-.*\\.js$/u.test(f) && fs.readFileSync(path.join(dist, f), "utf8").includes("static openModelContext("));
  const patched = fs.readFileSync(path.join(dist, file), "utf8").includes("context-window-read-v1");
  const { t: SessionManager } = await import(path.join(dist, file));
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const digest = (v) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
  const admissionAt = (sessionId, sessionKey, back) => {
    const row = db.prepare(\`SELECT i.event_id, i.seq, i.parent_id, a.message_position, w.generation FROM transcript_event_identities i
      JOIN session_transcript_active_events a ON a.session_id = i.session_id AND a.event_seq = i.seq
      JOIN transcript_events e ON e.session_id = i.session_id AND e.seq = i.seq
      JOIN transcript_rewrite_watermarks w ON w.session_id = i.session_id
      WHERE i.session_id = ? AND i.event_type = 'message' AND json_extract(e.event_json, '$.message.role') = 'user'
      ORDER BY a.active_position DESC LIMIT 1 OFFSET ?\`).get(sessionId, back);
    return row ? { agentId: "makaron", sessionId, sessionKey, entryId: row.event_id, role: "user", storePath: dbPath, generation: row.generation,
      rawSeq: row.seq, effectiveParentId: row.parent_id, activeMessagePosition: row.message_position } : undefined;
  };
  const read = (target, admission) => {
    let t = Date.now();
    const m = SessionManager.openModelContext(target, admission ? { admission } : {});
    const modelMs = Date.now() - t;
    const c = m.buildSessionContext();
    t = Date.now();
    const transcript = SessionManager.readSessionContext(target, (messages, header) => ({ messages: digest(Array.from(messages)), header: header?.id ?? null }), admission ? { admission } : {});
    const transcriptMs = Date.now() - t;
    return { modelMs, transcriptMs, entries: m.getEntries().length, out: { messages: digest(c.messages), count: c.messages.length, model: c.model, thinkingLevel: c.thinkingLevel, header: m.getHeader()?.id ?? null, leaf: m.getLeafId(), transcript } };
  };
  const out = [];
  for (const s of JSON.parse(sessionsJson)) {
    const target = { agentId: "makaron", sessionId: s.sessionId, sessionKey: s.sessionKey };
    for (const [fence, admission] of [["none"], ["last-user", admissionAt(s.sessionId, s.sessionKey, 0)], ["third-user", admissionAt(s.sessionId, s.sessionKey, 2)]]) {
      if (fence !== "none" && !admission) continue;
      process.env.OPENCLAW_V_CONTEXT_WINDOW_READ = "0";
      let full;
      try { full = read(target, admission); } catch (e) { full = { error: String(e.message).slice(0, 160) }; }
      delete process.env.OPENCLAW_V_CONTEXT_WINDOW_READ;
      let win;
      try { win = read(target, admission); } catch (e) { win = { error: String(e.message).slice(0, 160) }; }
      out.push({ session: s.sessionId.slice(0, 8), fence, same: JSON.stringify(full.out ?? full.error) === JSON.stringify(win.out ?? win.error),
        fullMs: full.modelMs, winMs: win.modelMs, fullTranscriptMs: full.transcriptMs, winTranscriptMs: win.transcriptMs,
        fullEntries: full.entries, winEntries: win.entries, messages: win.out?.count, error: full.error ?? win.error, ...(JSON.stringify(full.out) === JSON.stringify(win.out) ? {} : { full: full.out, win: win.out }) });
    }
  }
  console.log(JSON.stringify({ patched, checks: out }));
})().catch((e) => { console.error(e?.stack ?? e); process.exit(1); });
`;
function contextWindow() {
  const r = spawnSync(process.execPath, ["--max-old-space-size=8192", "-e", CTX_SRC, dist, dstPath, JSON.stringify(privateSessions)], {
    env: { ...process.env, OPENCLAW_STATE_DIR: stateDir, OPENCLAW_CONFIG_PATH: configPath, OPENCLAW_V_CONTEXT_WINDOW_DEBUG: "1" }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const json = r.stdout.split(/\r?\n/u).filter((l) => l.startsWith("{")).pop();
  const fallbacks = {};
  for (const l of r.stderr.split(/\r?\n/u)) { const m = l.match(/\[context-window-read\] fallback session=(\S+) reason=(.*)$/u); if (m) fallbacks[m[2]] = (fallbacks[m[2]] ?? 0) + 1; }
  return { status: r.status, result: json ? JSON.parse(json) : null, fallbacks, error: r.status === 0 ? undefined : redact(r.stderr).slice(-2000) };
}

function directControl() {
  const r = spawnSync(process.execPath, ["--max-old-space-size=8192", "-e", DIRECT_SRC, dist, SOURCE_SESSION, sessionKey], { env: { ...process.env, OPENCLAW_STATE_DIR: stateDir, OPENCLAW_CONFIG_PATH: configPath }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const reads = r.stderr.split(/\r?\n/u).filter((l) => l.includes("[read-probe]")).map((l) => { const j = JSON.parse(l.slice(l.indexOf("{"))); return { kind: j.kind, ms: j.ms, rows: j.rows }; });
  const json = r.stdout.split(/\r?\n/u).filter((l) => l.startsWith("{")).pop();
  return { status: r.status, result: json ? JSON.parse(json) : null, reads, error: r.status === 0 ? undefined : redact(r.stderr).slice(-1500) };
}

// ---- private Gateway ----
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
const cacheDir = path.join(scratch, "cache");
const shortTmp = `/tmp/.bsr-${process.pid}`;
fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(shortTmp, { recursive: true, mode: 0o700 });
const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), OPENCLAW_DEFER_PRE_REPLY_MEMORY_FLUSH_IDLE_MS: FLUSH_IDLE_MS, TMPDIR: shortTmp, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm") };
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
const probeLines = (tag, t0) => lines.filter((l) => l.at >= t0 && l.line.includes(tag)).map((l) => {
  const role = /^\[vlab-worker:\d+\]/u.test(l.line) ? "worker" : "gateway";
  try { return { at: l.at, role, ...JSON.parse(l.line.slice(l.line.indexOf("{", l.line.indexOf(tag)))) }; } catch { return null; }
}).filter(Boolean);
const site = (h) => h.stack.split(" < ").filter((f) => !/node-sqlite-|runSqlite[A-Za-z]*TransactionSync|__readProbe|Probed|withOpenClawAgentDatabaseReadOnly|withSessionContextAdmission|agent-db-process-coordinator|runWithSqliteBusyTimeout/u.test(f)).slice(0, 6).join(" < ");

async function runChatTurn(sessionKey, i) {
  const started = Date.now();
  try {
    if (TURN_MODEL === "vds" && i === 0) {
      try { await client.request("sessions.patch", { key: sessionKey, model: VDS_REF }); } catch (error) { console.error(`sessions.patch model failed: ${redact(error?.message ?? error)}`); }
    }
    const sent = await client.request("chat.send", { agentId: "makaron", sessionKey, message: PROMPT.replace("（自动化测试）", `（自动化测试 big-${i}）`),
      deliver: false, thinking: "low", timeoutMs: 600000, idempotencyKey: `big-session-reads-${Date.now()}-${i}` });
    const runId = sent?.runId;
    assert(runId, `chat.send returned no runId: ${JSON.stringify(sent).slice(0, 200)}`);
    const waited = await client.request("agent.wait", { runId, timeoutMs: 600000 }, { timeoutMs: 620000 });
    return { i, path: "chat", exit: waited?.status === "ok" ? 0 : 1, status: waited?.status, secs: Math.round((Date.now() - started) / 1000), error: waited?.error ? redact(JSON.stringify(waited.error)).slice(0, 300) : undefined };
  } catch (error) {
    return { i, path: "chat", exit: 1, secs: Math.round((Date.now() - started) / 1000), error: redact(String(error?.message ?? error)).slice(0, 300) };
  }
}
async function runTurn(sessionKey, i) {
  if (TURN_PATH === "chat") return runChatTurn(sessionKey, i);
  const started = Date.now();
  const child = spawn(process.execPath, [`${dist}/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey,
    "--model", MODEL, "--message", PROMPT.replace("（自动化测试）", `（自动化测试 big-${i}）`), "--json", "--timeout", "600"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (c) => { stdout += c; });
  child.stderr.on("data", (c) => { stderr += c; });
  const exit = await new Promise((resolve) => child.on("close", resolve));
  let text;
  try { const j = JSON.parse(stdout.slice(stdout.indexOf("{"))); text = JSON.stringify(j.result?.payloads ?? j.payloads ?? j.reply ?? j).slice(0, 300); } catch { text = stdout.slice(-300); }
  return { i, exit, secs: Math.round((Date.now() - started) / 1000), text: redact(text), stderr: exit === 0 ? undefined : redact(stderr).slice(-400) };
}

const sessionKey = buildPrivateDatabase();
const inflated = inflateSession();
console.log(JSON.stringify({ phase: "inflated", sessionKey, ...inflated }));
if (process.env.ONLY_CHECKS === "1") {
  const checks = { contextWindow: contextWindow(), equivalence: equivalence(), direct: directControl() };
  console.log(JSON.stringify(checks));
  process.exit(0);
}
startGateway();
let writer;
const writerOut = path.join(stateDir, "writer-samples.json");
try {
  await connectGateway();
  await sleep(5_000);
  writer = spawn(process.execPath, ["-e", WRITER_SRC, dstPath, String(WRITER_INTERVAL_MS), writerOut], { stdio: ["ignore", "inherit", "inherit"] });
  const t0 = Date.now();
  const turns = [];
  for (let i = 0; i < TURNS; i++) turns.push(await runTurn(sessionKey, i));
  await sleep(SETTLE_MS); // post-turn work (memory flush, reviews, maintenance) runs after the reply
  writer.kill("SIGTERM");
  await new Promise((resolve) => writer.on("close", resolve));
  const samples = JSON.parse(fs.readFileSync(writerOut, "utf8")).filter((s) => s.at >= t0);
  const reads = probeLines("[read-probe]", t0);
  const holds = probeLines("[hold-probe]", t0);
  const overlapping = (r) => samples.filter((s) => s.at + s.admissionMs >= r.at - r.ms && s.at <= r.at);
  const report = {
    inflated, turns,
    reads: reads.map((r) => ({ role: r.role, kind: r.kind, ms: r.ms, rows: r.rows, session: r.sessionId?.slice(0, 8), site: site(r),
      writerDuring: (() => { const o = overlapping(r); return o.length ? { n: o.length, maxAdmissionMs: Math.max(...o.map((s) => s.admissionMs)), maxBeginMs: Math.max(...o.map((s) => s.beginMs ?? 0)) } : null; })() })),
    holds: holds.map((h) => ({ role: h.role, op: h.op, ms: h.ms, site: site(h), ...(h.ms >= 500 && h.op === "agent.write" ? { stack: h.stack } : {}) })),
    writer: {
      samples: samples.length,
      maxAdmissionMs: Math.max(0, ...samples.map((s) => s.admissionMs)),
      maxBeginMs: Math.max(0, ...samples.map((s) => s.beginMs ?? 0)),
      over1s: samples.filter((s) => s.admissionMs >= 1000).length,
      timeouts: samples.filter((s) => s.timeout).length,
    },
  };
  report.direct = directControl();
  report.equivalence = equivalence();
  report.contextWindow = contextWindow();
  console.log(JSON.stringify(report, null, 1));
  assert.equal(report.direct.status, 0, "direct read control failed");
  assert.equal(report.equivalence.status, 0, `equivalence check failed: ${report.equivalence.error}`);
  assert.equal(report.contextWindow.status, 0, `context window check failed: ${report.contextWindow.error}`);
  if (report.contextWindow.result?.patched) {
    assert(report.contextWindow.result.checks.length > 0, "context window ran no checks");
    assert(report.contextWindow.result.checks.every((c) => c.same && !c.error), "the context window read differs from the full scan");
  }
  const checks = report.equivalence.result?.checks;
  if (checks) {
    assert(checks.length > 0, "equivalence ran no checks");
    assert(checks.every((c) => c.same === true), "a tail read differs from the full read");
    // an attempt result may differ only where history holds messages timestamped after the attempt start
    // before the tail (the inflated copies repeat their source timestamps); real sessions must match
    assert(checks.every((c) => c.attemptSame !== false || c.outOfOrder > 0), "an attempt result built from the tail differs");
    assert(checks.filter((c) => c.session !== SOURCE_SESSION.slice(0, 8)).every((c) => c.attemptSame !== false), "a real session's attempt result differs");
  }
  assert(report.direct.reads.some((r) => r.kind === "context") && report.direct.reads.some((r) => r.kind === "fenced"), "read probes did not fire on the direct control");
  assert(turns.some((t) => t.exit === 0), "no turn completed; the session was never read by a real turn");
  if (!reads.some((r) => r.sessionId === SOURCE_SESSION)) console.log("NOTE: the turns made no whole-session read of the inflated session");
  assert(samples.length > 0, "the side writer recorded nothing");
} catch (error) {
  console.error(redact(lines.slice(-80).map((l) => l.line).join("\n")));
  throw error;
} finally {
  writer?.kill("SIGKILL");
  client?.stop();
  gateway.kill("SIGTERM");
  await sleep(3_000);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
  fs.rmSync(shortTmp, { recursive: true, force: true });
}
