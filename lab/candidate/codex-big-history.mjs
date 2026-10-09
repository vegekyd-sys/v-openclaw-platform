// Candidate: a V-shaped /vds session (no OpenClaw compaction, ~170 MB) on V's bytes and on this
// branch's, in one isolated Gateway setup.
//
// V 2026-10-09, the /vds direct session ou_0674 (12,421 events, 178 MB after its last reset):
//   - every Codex turn read the whole model context on the Gateway main thread (2-9.8 s,
//     "session context window read") and kept it for the turn; the Gateway heap jumped with its
//     overlapping turns and deferred memory flushes (+1.4 GiB in 30 s, 9.3 GiB RSS at 17:06);
//   - after every reply a deferred memory flush ran again (15 a day, 90-190 s each): the flush's
//     transient Codex thread compacts at once, its durable compaction fact raises compactionCount
//     after the flush took it, and the success marker named the previous cycle.
//
// The session: shared VLab's biggest Codex session without compaction or reset (339059a5, 3,120
// events, 15 MB) copied into a private database and repeated INFLATE times as one chain (derived
// identity/active-path/index-state rows written to match), plus MEDIA_ROWS tool results carrying
// view_image-shaped inline base64, the shape of V's > 1 MB rows. Nothing touches shared state.
//
//   PHASES=direct   no Gateway: the model-context read, full (V) and bounded (this branch), with
//                   time, heap, message equality (the bounded read is the newest tail of the full
//                   one) and the Codex fresh-thread projection both produce (must be identical).
//   PHASES=turns    for each of VARIANTS (v = V's bytes, fixed = this branch's): a fresh copy of
//                   the database, the Gateway on those bytes, /vds, turn 1 (fresh thread: the
//                   projection is built from the history), the deferred memory flush, the
//                   session entry after it, turn 2 (does it defer another flush?). Reports reads
//                   and transaction holds >= HOLD_PROBE_MS on the Gateway, Gateway RSS, DeepSeek
//                   request sizes, and whether turn 1's projected context is the same in both.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import zlib from "node:zlib";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && configPath && stateDir && sharedState, "candidate runtime environment is required");
const here = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(here, "../..");
const SOURCE_SESSION = process.env.SOURCE_SESSION ?? "339059a5-8f51-41e2-acb9-efc305a3d406";
const INFLATE = Number(process.env.INFLATE ?? 8);
const MEDIA_ROWS = Number(process.env.MEDIA_ROWS ?? 45);
const MEDIA_IMAGES_PER_ROW = Number(process.env.MEDIA_IMAGES_PER_ROW ?? 5);
const MEDIA_IMAGE_CHARS = Number(process.env.MEDIA_IMAGE_CHARS ?? 240_000);
const PHASES = (process.env.PHASES ?? "direct,turns").split(",");
const VARIANTS = (process.env.VARIANTS ?? "v,fixed").split(",");
const HOLD_PROBE_MS = Number(process.env.HOLD_PROBE_MS ?? 200);
const FLUSH_IDLE_MS = process.env.FLUSH_IDLE_MS ?? "15000";
const FLUSH_WAIT_MS = Number(process.env.FLUSH_WAIT_MS ?? 10 * 60_000);
const CONTEXT_TOKEN_BUDGET = 1_000_000; // V's deepseek-flash / vds-deepseek-flash contextWindow
const VDS_REF = "deepseek/vds-deepseek-flash";
const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const secrets = Object.fromEntries(fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u).map((l) => l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/gu, "")]));
assert(secrets.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY missing");
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer|password)([=: ]+)[^\s"]+/giu, "$1$2[redacted]").replaceAll(secrets.DEEPSEEK_API_KEY, "[redacted]");
const dist = path.join(runtime, "openclaw", "dist");

// ---- the two sets of bytes ----
const V_SHA = {
  "session-manager-CNTG_BAJ.js": "ce091fdae9a97c3a880440d82f7b15a38d7d7a2a07ba6db407f9f894f7fd8155",
  "agent-runner-memory-7VF-zwNt.js": "27f38ffbe1fb9a74fff875340c6bbf245d4fce45d228057163b597a93f37587f",
  "agent-runner.runtime-CAdsMsQt.js": "947ba056be229a38f987cbdd5376b6779aa62b636cac406ee5d636bfd05d82d7",
  "run-attempt-D1hJO4fX.js": "1264f88b80815b3240ae29502a2dc94b9fd22f1faff53836fae0530485c97e45",
  "attempt-context-DmQUNWwT.js": "ca1712cd4224a6408052380b668f060e09e841286b572595c3aa0e23be8145b0",
  "session-history-C5J1AKzG.js": "29bce1932e70ffe7d3781e9329b7591e4bfac56bc6b742b10b2aae59d02828a8",
};
const CAPTURED = "release/captured/release-batch-20261009/dist";
const VARIANT_FILES = {
  v: {
    core: { "session-manager-CNTG_BAJ.js": `${CAPTURED}/session-manager-CNTG_BAJ.js`, "agent-runner-memory-7VF-zwNt.js": `${CAPTURED}/agent-runner-memory-7VF-zwNt.js`, "agent-runner.runtime-CAdsMsQt.js": `${CAPTURED}/agent-runner.runtime-CAdsMsQt.js` },
    codex: { "run-attempt-D1hJO4fX.js": "tmp/codex-v/run-attempt-D1hJO4fX.js", "attempt-context-DmQUNWwT.js": "tmp/codex-v/attempt-context-DmQUNWwT.js", "session-history-C5J1AKzG.js": "tmp/codex-v/session-history-C5J1AKzG.js" },
  },
  fixed: {
    core: { "session-manager-CNTG_BAJ.js": "lab/release-files/context-window-read/session-manager-CNTG_BAJ.js", "agent-runner-memory-7VF-zwNt.js": "lab/release-files/memory-flush-defer/agent-runner-memory-7VF-zwNt.js", "agent-runner.runtime-CAdsMsQt.js": "lab/release-files/memory-flush-defer/agent-runner.runtime-CAdsMsQt.js" },
    codex: { "run-attempt-D1hJO4fX.js": "lab/release-files/codex-firsttext/dist/run-attempt-D1hJO4fX.js", "attempt-context-DmQUNWwT.js": "lab/release-files/codex-firsttext/dist/attempt-context-DmQUNWwT.js", "session-history-C5J1AKzG.js": "lab/release-files/codex-firsttext/dist/session-history-C5J1AKzG.js" },
  },
};
for (const [name, rel] of Object.entries({ ...VARIANT_FILES.v.core, ...VARIANT_FILES.v.codex })) {
  assert.equal(sha(fs.readFileSync(path.join(repoRoot, rel))), V_SHA[name], `${rel} is not V's ${name}`);
}

// ---- managed npm plugins (the Codex plugin) in this candidate's own state ----
if (!fs.existsSync(path.join(stateDir, "npm"))) {
  assert.equal(spawnSync("cp", ["-a", "--reflink=auto", path.join(sharedState, "npm"), path.join(stateDir, "npm")]).status, 0, "copy managed npm plugins");
}
const npmProjects = path.join(stateDir, "npm", "projects");
const codexProject = fs.readdirSync(npmProjects).find((d) => d.startsWith("openclaw-codex-"));
assert(codexProject, "codex plugin not found");
const codexRoot = path.join(npmProjects, codexProject, "node_modules", "@openclaw", "codex");
const codexDist = path.join(codexRoot, "dist");
fs.copyFileSync(path.join(repoRoot, "lab/release-files/background-work-20261002/vlab-codex-parity/harness-DXVZ5II5.js"), path.join(codexDist, "harness-DXVZ5II5.js"));
fs.copyFileSync(path.join(repoRoot, "lab/release-files/codex-firsttext/dist/thread-lifecycle-DAcEJ_Om.js"), path.join(codexDist, "thread-lifecycle-DAcEJ_Om.js"));
// Codex inspects its app-server processes with a 2 s deadline (transport-stdio MAX_PROCESS_CONTAINMENT_MS); a
// main-thread freeze across it fails the turn ("Cannot inspect Codex processes"). On VLab V's full read takes
// 4.6 s and failed turn 1 that way; V (faster) logged no such failure on 10/08-09. Both variants get the same
// wider deadline so the comparison goes past turn 1; INSPECT_DEADLINE_MS=2000 keeps V's.
const INSPECT_DEADLINE_MS = Number(process.env.INSPECT_DEADLINE_MS ?? 15_000);
{
  const file = path.join(codexDist, fs.readdirSync(codexDist).find((f) => /^transport-stdio-.*\.js$/u.test(f)));
  let src = fs.readFileSync(file, "utf8");
  for (const anchor of ["const MAX_PROCESS_CONTAINMENT_MS$1 = 2e3;", "const MAX_PROCESS_CONTAINMENT_MS = 2e3;", "readCodexAppServerProcessCommand(spawned, Date.now() + 2e3)"]) {
    assert.equal(src.split(anchor).length, 2, `process inspection deadline anchor ${anchor}`);
    src = src.replace(anchor, anchor.replace("2e3", String(INSPECT_DEADLINE_MS)));
  }
  fs.writeFileSync(file, src);
}
function applyVariant(variant) {
  const out = {};
  for (const [name, rel] of Object.entries(VARIANT_FILES[variant].core)) { fs.copyFileSync(path.join(repoRoot, rel), path.join(dist, name)); out[name] = sha(fs.readFileSync(path.join(dist, name))).slice(0, 8); }
  for (const [name, rel] of Object.entries(VARIANT_FILES[variant].codex)) { fs.copyFileSync(path.join(repoRoot, rel), path.join(codexDist, name)); out[name] = sha(fs.readFileSync(path.join(codexDist, name))).slice(0, 8); }
  return out;
}

// ---- probe: every SQLite transaction held >= HOLD_PROBE_MS, with its label and process ----
{
  const marker = "function logSlowTransactionHold(params) {";
  const file = fs.readdirSync(dist).map((f) => path.join(dist, f)).find((f) => /node-sqlite-.*\.js$/u.test(f) && fs.readFileSync(f, "utf8").includes(marker));
  assert(file, "logSlowTransactionHold not found");
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes("[hold-probe]")) fs.writeFileSync(file, src.replace(marker, `${marker}
	if (params.elapsedMs >= ${HOLD_PROBE_MS}) console.error("[hold-probe] " + JSON.stringify({ ms: params.elapsedMs, op: params.options?.operationLabel ?? null, pid: process.pid, heapMB: Math.round(process.memoryUsage().heapUsed / 1048576) }));`));
}

// ---- configuration: V's /vds ----
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(config.gateway?.port);
config.channels = {};
config.cron = { ...(config.cron ?? {}), enabled: false };
const keep = new Set(["vlab-agent-worker-isolation", "deepseek", "openai", "codex", "memory-core"]);
config.plugins.entries = Object.fromEntries(Object.entries(config.plugins.entries ?? {}).filter(([id]) => keep.has(id)));
if (Array.isArray(config.plugins.allow)) config.plugins.allow = config.plugins.allow.filter((id) => keep.has(id));
const shape = { reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: CONTEXT_TOKEN_BUDGET, maxTokens: 384000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
for (const [id, name] of [["deepseek-flash", "DeepSeek V4.1 Flash"], ["vds-deepseek-flash", "DeepSeek V4.1 Flash (Codex vds alias)"]]) {
  config.models.providers.deepseek.models = config.models.providers.deepseek.models.filter((m) => m.id !== id).concat([{ id, name, ...shape }]);
}
const vdsEntry = { alias: "vds", agentRuntime: { id: "codex" }, params: { thinking: "high", codexAppServerRuntimeModel: "deepseek-flash" } };
config.agents.defaults.models[VDS_REF] = vdsEntry;
config.agents.entries.makaron.models = { ...(config.agents.entries.makaron.models ?? {}), [VDS_REF]: vdsEntry };
const allow = config.agents.defaults.modelPolicy?.allow;
if (Array.isArray(allow) && !allow.includes(VDS_REF)) allow.push(VDS_REF);
config.plugins.entries.codex = { ...(config.plugins.entries.codex ?? {}), enabled: true, config: { ...(config.plugins.entries.codex?.config ?? {}), appServer: { mode: "yolo", serviceTier: "priority", approvalPolicy: "never", sandbox: "danger-full-access" } } };
const workerPlugin = config.plugins.entries["vlab-agent-worker-isolation"]?.config;
if (workerPlugin) {
  const rel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!rel.startsWith(".."), "candidate Worker config escaped state");
  const text = fs.readFileSync(path.join(sharedState, rel), "utf8").replaceAll(sharedState, stateDir).replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, text, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
}
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

// ---- private makaron database: the source session, inflated (as lab/candidate/big-session-reads.mjs) ----
const dbRel = path.join("agents", "makaron", "agent", "openclaw-agent.sqlite");
const dstPath = path.join(stateDir, dbRel);
const snapshotPath = `${dstPath}.inflated`;
assert(!fs.existsSync(dstPath), `private database already exists at ${dstPath}`);
fs.mkdirSync(path.dirname(dstPath), { recursive: true });
let sessionKey;
function buildPrivateDatabase() {
  const vec = path.join(runtime, "openclaw", "node_modules", "sqlite-vec-linux-x64", "vec0.so");
  const src = new DatabaseSync(path.join(sharedState, dbRel), { readOnly: true, allowExtension: true });
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
  const convs = new Set(src.prepare("SELECT conversation_id FROM session_conversations WHERE session_id = ?").all(SOURCE_SESSION).map((r) => r.conversation_id));
  const primary = src.prepare("SELECT primary_conversation_id FROM session_windows WHERE session_id = ?").get(SOURCE_SESSION)?.primary_conversation_id;
  if (primary) convs.add(primary);
  for (const t of tables) {
    const cols = src.prepare(`PRAGMA table_info("${t.name}")`).all().map((c) => c.name);
    if (t.name.startsWith("memory_") || t.name.startsWith("standing_intents_fts")) continue;
    let where, args;
    if (cols.includes("session_id")) { where = `"session_id" = ?`; args = [SOURCE_SESSION]; }
    else if (cols.includes("session_key")) { where = `"session_key" = ?`; args = [key]; }
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
  return key;
}
function inflateSession() {
  const db = new DatabaseSync(dstPath);
  db.exec("PRAGMA foreign_keys = OFF");
  const sid = SOURCE_SESSION;
  const events = db.prepare("SELECT seq, event_json, created_at FROM transcript_events WHERE session_id = ? ORDER BY seq").all(sid).map((e) => ({ ...e, obj: JSON.parse(e.event_json) }));
  const identities = db.prepare("SELECT event_id, seq, event_type, parent_id, message_idempotency_key, created_at FROM transcript_event_identities WHERE session_id = ?").all(sid);
  assert(!identities.some((r) => r.event_type === "compaction" || r.event_type === "reset"), "the source session must have no compaction or reset");
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
  const toolResults = db.prepare(`SELECT seq FROM transcript_events WHERE session_id = ? AND json_extract(event_json, '$.message.role') = 'toolResult' ORDER BY seq`).all(sid).map((r) => r.seq);
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
  db.exec("COMMIT");
  const size = db.prepare("SELECT count(*) AS rows, sum(octet_length(event_json)) AS bytes, sum(octet_length(event_json) > 1048576) AS big FROM transcript_events WHERE session_id = ?").get(sid);
  const check = db.prepare("PRAGMA foreign_key_check(session_transcript_active_events)").all().length + db.prepare("PRAGMA foreign_key_check(transcript_event_identities)").all().length;
  assert.equal(check, 0, "inflated derived rows reference missing events");
  // the session is already on /vds, as V's ou_0674 entry (a sessions.patch model switch would reset it)
  const node = db.prepare("SELECT session_key, entry_json FROM session_nodes WHERE current_session_id = ?").get(sid);
  const entry = JSON.parse(node.entry_json);
  // and in use: an entry idle past session.reset.idleMinutes (30 days on V) is reset by its next message
  const now = Date.now();
  for (const k of ["updatedAt", "lastInteractionAt", "lastActivityAt"]) if (k in entry || k === "updatedAt") entry[k] = now;
  // and due for a memory flush: the copied entry was already marked for its cycle
  delete entry.memoryFlush;
  Object.assign(entry, { model: "vds-deepseek-flash", modelProvider: "deepseek", modelOverride: "vds-deepseek-flash", providerOverride: "deepseek", modelOverrideSource: "user", modelOverrideRouteResolution: "resolved", agentHarnessId: "codex", thinkingLevel: "high" });
  db.prepare("UPDATE session_nodes SET entry_json = ? WHERE session_key = ?").run(JSON.stringify(entry), node.session_key);
  db.prepare("UPDATE session_windows SET model_provider = 'deepseek', model = 'vds-deepseek-flash', agent_harness_id = 'codex', updated_at = ? WHERE session_id = ?").run(now, sid);
  db.prepare("UPDATE session_nodes SET updated_at = ? WHERE session_key = ?").run(now, node.session_key);
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  return { rows: size.rows, mb: Math.round(size.bytes / 1e5) / 10, bigRows: size.big, activeEvents: active.length + (INFLATE - 1) * activeBody.length, leaf };
}
function restoreDatabase() {
  for (const f of [dstPath, `${dstPath}-wal`, `${dstPath}-shm`]) fs.rmSync(f, { force: true });
  fs.copyFileSync(snapshotPath, dstPath);
}
function readSessionId() {
  const db = new DatabaseSync(dstPath, { readOnly: true });
  try { return db.prepare("SELECT current_session_id FROM session_nodes WHERE session_key = ?").get(sessionKey)?.current_session_id; } finally { db.close(); }
}
function readEntry() {
  const db = new DatabaseSync(dstPath, { readOnly: true });
  try {
    const e = JSON.parse(db.prepare("SELECT entry_json FROM session_nodes WHERE session_key = ?").get(sessionKey).entry_json);
    return { compactionCount: e.compactionCount ?? 0, memoryFlush: e.memoryFlush ?? null, totalTokens: e.totalTokens, model: e.model, harness: e.agentHarnessId };
  } finally { db.close(); }
}

// ---- direct: full vs bounded model-context read, on this branch's session-manager ----
const DIRECT_SRC = `
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
(async () => {
  const [dist, codexDist, dbPath, sessionId, sessionKey, budget] = process.argv.slice(1);
  // As the Gateway's sdk-alias does, the plugin's openclaw/* resolves to the running package (this runtime).
  const { register } = require("node:module");
  const { pathToFileURL } = require("node:url");
  const packageJson = pathToFileURL(path.join(dist, "..", "package.json")).href;
  register("data:text/javascript," + encodeURIComponent("export async function resolve(specifier, context, next) { if (specifier === 'openclaw' || specifier.startsWith('openclaw/')) return next(specifier, { ...context, parentURL: " + JSON.stringify(packageJson) + " }); return next(specifier, context); }"));
  const { t: SessionManager } = await import(path.join(dist, "session-manager-CNTG_BAJ.js"));
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const row = db.prepare(\`SELECT i.event_id, i.seq, i.parent_id, a.message_position, w.generation FROM transcript_event_identities i
    JOIN session_transcript_active_events a ON a.session_id = i.session_id AND a.event_seq = i.seq
    JOIN transcript_events e ON e.session_id = i.session_id AND e.seq = i.seq
    JOIN transcript_rewrite_watermarks w ON w.session_id = i.session_id
    WHERE i.session_id = ? AND i.event_type = 'message' AND json_extract(e.event_json, '$.message.role') = 'user'
    ORDER BY a.active_position DESC LIMIT 1\`).get(sessionId);
  db.close();
  const admission = row ? { agentId: "makaron", sessionId, sessionKey, entryId: row.event_id, role: "user", storePath: dbPath, generation: row.generation,
    rawSeq: row.seq, effectiveParentId: row.parent_id, activeMessagePosition: row.message_position } : undefined;
  const target = { agentId: "makaron", sessionId, sessionKey };
  const limits = { maxBytes: Math.min(64 * 1024 * 1024, Math.max(1024, Math.floor(Number(budget) * 8))), maxEvents: 1e4 };
  const mb = (b) => Math.round(b / 1048576);
  const measure = (fn) => {
    global.gc(); global.gc();
    const h0 = process.memoryUsage().heapUsed;
    const t = Date.now();
    const value = fn();
    const ms = Date.now() - t;
    const h1 = process.memoryUsage().heapUsed;
    global.gc(); global.gc();
    const h2 = process.memoryUsage().heapUsed;
    return { value, ms, heapAfterMB: mb(h1 - h0), retainedMB: mb(h2 - h0) };
  };
  const out = { admission: Boolean(admission), limits, runs: [] };
  // the plugin's own read (session-history), as a Codex turn calls it
  const sh = await import(path.join(codexDist, fs.readdirSync(codexDist).find((f) => /^session-history-.*\\.js$/u.test(f))));
  const pluginRead = sh.n;
  const measureAsync = async (fn) => {
    global.gc(); global.gc();
    const h0 = process.memoryUsage().heapUsed;
    const t = Date.now();
    const value = await fn();
    const ms = Date.now() - t;
    const h1 = process.memoryUsage().heapUsed;
    global.gc(); global.gc();
    return { value, ms, heapAfterMB: mb(h1 - h0), retainedMB: mb(process.memoryUsage().heapUsed - h0) };
  };
  const plain = { ...target, sessionFile: "sqlite:unused" };
  // the plugin logs through the SDK's embeddedAgentLog: keep its lines
  const pluginLog = [];
  try {
    const ah = await import(path.join(dist, "plugin-sdk", "agent-harness-runtime.js"));
    for (const level of ["info", "warn"]) { const orig = ah.embeddedAgentLog[level].bind(ah.embeddedAgentLog); ah.embeddedAgentLog[level] = (msg, meta) => { if (String(msg).includes("codex-bounded-history") || String(msg).includes("mirrored")) pluginLog.push(level + " " + String(msg).slice(0, 300) + (meta ? " " + JSON.stringify(meta).slice(0, 300) : "")); return orig(msg, meta); }; }
  } catch (error) { pluginLog.push("log hook failed: " + String(error?.message ?? error)); }
  out.pluginLog = pluginLog;
  // which SessionManager the plugin resolves, and what it is called with
  try {
    const { createRequire } = require("node:module");
    const resolved = createRequire(path.join(codexDist, "x.js")).resolve("openclaw/plugin-sdk/agent-sessions");
    const sdk = await import(resolved);
    const SM = sdk.SessionManager;
    const calls = [];
    const orig = SM.openModelContext;
    SM.openModelContext = function (t, o = {}) { calls.push({ limits: o.limits ?? null, hasCallback: typeof o.onBoundedRead === "function" }); return orig.call(this, t, o); };
    out.pluginSdk = { resolved: fs.realpathSync(resolved), sameClass: SM === SessionManager, bounded: String(orig).includes("codex-bounded-history"), calls };
  } catch (error) { out.pluginSdk = { error: String(error?.message ?? error).slice(0, 300) }; }
  // phases of one bounded read, cold, before anything else touched the session
  {
    const t0 = Date.now();
    let manager;
    try { manager = SessionManager.openModelContext({ ...target, storePath: dbPath }, { ...(admission ? { admission } : {}), limits }); } catch (error) { out.boundedWithStorePathError = String(error?.message ?? error).slice(0, 300); }
    const t1 = Date.now();
    const n = manager?.buildSessionContext().messages.length;
    out.boundedColdPhases = { openMs: t1 - t0, buildMs: Date.now() - t1, messages: n };
  }
  let full, bounded, facts, plugin;
  for (let i = 0; i < 3; i++) {
    const f = measure(() => SessionManager.openModelContext(target, admission ? { admission } : {}).buildSessionContext().messages);
    const b = measure(() => SessionManager.openModelContext(target, { ...(admission ? { admission } : {}), limits, onBoundedRead: (x) => { facts = x; } }).buildSessionContext().messages);
    const p = await measureAsync(() => pluginRead({ ...plain, sessionTarget: { ...target, storePath: dbPath } }, admission, "model-context", Number(budget)));
    out.runs.push({ fullMs: f.ms, fullHeapMB: f.heapAfterMB, fullRetainedMB: f.retainedMB, boundedMs: b.ms, boundedRetainedMB: b.retainedMB, pluginMs: p.ms, pluginHeapMB: p.heapAfterMB, pluginRetainedMB: p.retainedMB });
    full = f.value; bounded = b.value; plugin = p.value;
  }
  out.facts = facts;
  out.fullMessages = full.length;
  out.boundedMessages = bounded.length;
  out.pluginMessages = plugin?.length ?? null;
  out.pluginTruncatedFlag = plugin?.codexHistoryTruncated === true;
  const sameFromEnd = (part) => { let n = 0; while (n < part.length && JSON.stringify(part[part.length - 1 - n]) === JSON.stringify(full[full.length - 1 - n])) n += 1; return n; };
  out.boundedTailMatches = sameFromEnd(bounded);
  out.pluginTailMatches = plugin ? sameFromEnd(plugin) : null;
  if (out.pluginTailMatches !== null && out.pluginTailMatches < plugin.length) out.pluginHeadDiff = { index: plugin.length - 1 - out.pluginTailMatches, role: plugin[plugin.length - 1 - out.pluginTailMatches]?.role };
  // the Codex fresh-thread projection both produce
  try {
    const tl = fs.readdirSync(codexDist).find((f) => /^thread-lifecycle-.*\\.js$/u.test(f));
    const mod = await import(path.join(codexDist, tl));
    const project = mod.vt, maxChars = mod.xt;
    assert(typeof project === "function" && typeof maxChars === "function");
    const max = maxChars({ contextTokenBudget: Number(budget) });
    const prompt = "（自动化测试）不要调用任何工具，只回复：OK";
    const strip = (text) => text.replace(/^(OpenClaw assembled context for this turn:[\\s\\S]*?<conversation_context>\\n)\\[truncated \\d+ chars from older context\\]\\n/u, "$1");
    const a = project({ assembledMessages: full, originalHistoryMessages: full, prompt, maxRenderedContextChars: max });
    const b = project({ assembledMessages: bounded, originalHistoryMessages: bounded, prompt, maxRenderedContextChars: max });
    const c = plugin ? project({ assembledMessages: plugin, originalHistoryMessages: plugin, prompt, maxRenderedContextChars: max }) : null;
    const render = (messages) => project({ assembledMessages: messages, originalHistoryMessages: messages, prompt, maxRenderedContextChars: 1e9 }).promptText;
    const fullRendered = render(full), boundedRendered = render(bounded);
    const body = (t) => t.slice(t.indexOf("<conversation_context>") + 22, t.lastIndexOf("</conversation_context>"));
    out.renderedTail = { fullChars: body(fullRendered).length, boundedChars: body(boundedRendered).length, boundedIsSuffixOfFull: body(fullRendered).endsWith(body(boundedRendered).slice(2000)) };
    out.projection = { maxChars: max, fullChars: a.promptText.length, boundedChars: b.promptText.length, pluginChars: c?.promptText.length ?? null,
      boundedIdentical: strip(a.promptText) === strip(b.promptText), pluginIdentical: c ? strip(a.promptText) === strip(c.promptText) : null,
      markers: [a, b, c].map((x) => x?.promptText.match(/\\[truncated \\d+ chars from older context\\]/u)?.[0] ?? null) };
  } catch (error) { out.projection = { skipped: String(error?.message ?? error).slice(0, 300) }; }
  console.log(JSON.stringify(out));
})().catch((e) => { console.error(e?.stack ?? e); process.exit(1); });
function assert(v) { if (!v) throw new Error("thread-lifecycle exports changed"); }
`;
function direct() {
  applyVariant("fixed");
  {
    const r = spawnSync(process.execPath, ["--expose-gc", "--max-old-space-size=8192", "-e", DIRECT_SRC, dist, codexDist, dstPath, SOURCE_SESSION, sessionKey, String(CONTEXT_TOKEN_BUDGET)], {
      env: { ...process.env, OPENCLAW_STATE_DIR: stateDir, OPENCLAW_CONFIG_PATH: configPath }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const json = r.stdout.split(/\r?\n/u).filter((l) => l.startsWith("{")).pop();
    return { status: r.status, result: json ? JSON.parse(json) : null, holds: r.stderr.split(/\r?\n/u).filter((l) => l.includes("[hold-probe]")).map((l) => JSON.parse(l.slice(l.indexOf("{")))), error: r.status === 0 ? undefined : redact(r.stderr).slice(-2000) };
  }
}

// ---- turns: a capture proxy in front of DeepSeek, the Gateway, RSS sampling ----
const captures = [];
const proxy = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const enc = String(req.headers["content-encoding"] ?? "");
    let body = raw;
    try { if (enc.includes("zstd")) body = zlib.zstdDecompressSync(raw); else if (enc.includes("gzip")) body = zlib.gunzipSync(raw); } catch {}
    let json;
    try { json = JSON.parse(body.toString("utf8")); } catch {}
    if (json && req.url.includes("responses")) {
      const texts = [];
      for (const item of json.input ?? []) for (const c of (Array.isArray(item.content) ? item.content : [])) if (typeof c.text === "string" && item.role === "user") texts.push(c.text);
      captures.push({ at: Date.now(), inputItems: (json.input ?? []).length, userText: texts.join("\n"), bytes: raw.length });
    }
    const up = https.request({ host: "api.deepseek.com", path: req.url, method: req.method, headers: { ...req.headers, host: "api.deepseek.com" } }, (upRes) => {
      res.writeHead(upRes.statusCode ?? 502, upRes.headers);
      upRes.pipe(res);
    });
    up.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
    up.end(raw);
  });
});
const CODEX_HOME = path.join(config.agents.entries.makaron.agentDir, "codex-home");
const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
const tmpDir = `/tmp/.cbh-${process.pid}`;
const cacheDir = path.join(scratch, "cache");
for (const d of [tmpDir, cacheDir]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
const env = { ...process.env, DEEPSEEK_API_KEY: secrets.DEEPSEEK_API_KEY, OPENCLAW_GATEWAY_PORT: String(port), OPENCLAW_DEFER_PRE_REPLY_MEMORY_FLUSH_IDLE_MS: FLUSH_IDLE_MS,
  TMPDIR: tmpDir, XDG_CACHE_HOME: cacheDir, npm_config_cache: path.join(cacheDir, "npm") };
const lines = [];
let gateway;
function startGateway() {
  lines.length = 0;
  gateway = spawn(process.execPath, ["--max-old-space-size=12288", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [gateway.stdout, gateway.stderr]) {
    s.setEncoding("utf8");
    let rest = "";
    s.on("data", (chunk) => {
      const parts = (rest + chunk).split(/\r?\n/u);
      rest = parts.pop();
      for (const line of parts.filter(Boolean)) lines.push({ at: Date.now(), line });
      if (lines.length > 80_000) lines.splice(0, lines.length - 80_000);
    });
  }
}
async function stopGateway() {
  if (!gateway || gateway.exitCode !== null) return;
  gateway.kill("SIGTERM");
  await Promise.race([new Promise((r) => gateway.once("exit", r)), sleep(20_000)]);
  if (gateway.exitCode === null) gateway.kill("SIGKILL");
}
async function waitPort() {
  const deadline = Date.now() + 900_000;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
    if (await new Promise((resolve) => { const s = net.connect({ host: "127.0.0.1", port }); s.once("connect", () => { s.destroy(); resolve(true); }); s.once("error", () => resolve(false)); })) return;
    await sleep(500);
  }
  throw new Error("Gateway did not listen");
}
const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
const token = String(config.gateway?.auth?.token ?? "").replace(/\$\{([^}]+)\}/gu, (_, k) => env[k] ?? secrets[k] ?? "");
const runs = new Map();
let client;
async function connect() {
  for (let attempt = 1; ; attempt += 1) {
    try {
      client = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("connect deadline")), 30_000);
        const c = new GatewayClient({ url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli", caps: ["tool-events"], scopes: ["operator.read", "operator.write", "operator.admin"],
          onEvent(e) { const p = e.payload; const r = runs.get(p?.runId); if (r && e.event === "chat" && ["final", "error", "aborted"].includes(p.state)) { r.terminal = p.state; r.endAt = Date.now(); if (p.state !== "final") r.error = redact(String(p.errorMessage ?? "").slice(0, 300)); } },
          onHelloOk() { clearTimeout(timer); resolve(c); }, onConnectError(e) { clearTimeout(timer); reject(e); } });
        c.start();
      });
      return;
    } catch (error) {
      if (attempt >= 36) throw error;
      await sleep(5000);
    }
  }
}
async function send(key, message) {
  const id = randomUUID();
  const r = { id, sentAt: Date.now() };
  runs.set(id, r);
  await Promise.race([
    client.request("chat.send", { agentId: "makaron", sessionKey: key, message, deliver: false, idempotencyKey: id, timeoutMs: 900_000 }, { timeoutMs: 60_000 }),
    sleep(90_000).then(() => { throw new Error(`chat.send got no answer in 90 s (Gateway exit ${gateway.exitCode})\n${redact(lines.slice(-80).map((l) => l.line).join("\n"))}`); }),
  ]);
  const deadline = Date.now() + 920_000;
  while (!r.terminal && Date.now() < deadline) {
    if (gateway.exitCode !== null) throw new Error(`Gateway exited ${gateway.exitCode} during a turn\n${redact(lines.slice(-80).map((l) => l.line).join("\n"))}`);
    await sleep(500);
  }
  return { terminal: r.terminal ?? "timeout", error: r.error, secs: Math.round(((r.endAt ?? Date.now()) - r.sentAt) / 1000), sentAt: r.sentAt, endAt: r.endAt ?? Date.now() };
}
const rss = [];
let rssTimer;
function sampleRss() {
  rssTimer = setInterval(() => {
    try {
      const m = fs.readFileSync(`/proc/${gateway.pid}/status`, "utf8").match(/VmRSS:\s+(\d+)/u);
      if (m) rss.push({ at: Date.now(), mb: Math.round(Number(m[1]) / 1024) });
    } catch {}
  }, 250);
}
const within = (from, to) => (x) => x.at >= from && x.at <= to;
const peakRss = (from, to) => Math.max(0, ...rss.filter(within(from, to)).map((s) => s.mb));
const holdsIn = (from, to) => lines.filter(within(from, to)).filter((l) => l.line.includes("[hold-probe]") && !l.line.startsWith("[vlab-worker")).map((l) => { try { return JSON.parse(l.line.slice(l.line.indexOf("{", l.line.indexOf("[hold-probe]")))); } catch { return null; } }).filter((h) => h && h.pid === gateway.pid).map((h) => ({ op: h.op, ms: h.ms, heapMB: h.heapMB }));
const plainLine = (line) => line.replace(/\u001b\[[0-9;]*m/gu, "");
const flushLines = (from) => lines.filter((l) => l.at >= from && l.line.includes("[memory-flush-deferred.1]")).map((l) => { const t = plainLine(l.line); return JSON.parse(t.slice(t.indexOf("{", t.indexOf("[memory-flush-deferred.1]")), t.lastIndexOf("}") + 1)); });
const boundedLines = (from, to) => lines.filter(within(from, to)).filter((l) => l.line.includes("[codex-bounded-history.1]")).map((l) => redact(plainLine(l.line).slice(plainLine(l.line).indexOf("[codex-bounded-history.1]"))).slice(0, 240));
const contextOf = (text) => { const a = text.indexOf("<conversation_context>"), b = text.lastIndexOf("</conversation_context>"); return a >= 0 && b > a ? text.slice(a, b) : null; };

async function variantRun(variant) {
  restoreDatabase();
  fs.rmSync(path.join(CODEX_HOME, "sessions"), { recursive: true, force: true });
  const bytes = applyVariant(variant);
  startGateway();
  await waitPort();
  await sleep(3000);
  await connect();
  sampleRss();
  const c0 = captures.length;
  const out = { variant, bytes, entryBefore: readEntry() };
  await sleep(2000);
  const base = Date.now();
  out.rssBeforeMB = peakRss(base - 2000, base);
  const t1 = await send(sessionKey, "（自动化测试 turn-1）不要调用任何工具，只回复：OK-1");
  out.turn1 = { terminal: t1.terminal, error: t1.error, secs: t1.secs, rssPeakMB: peakRss(t1.sentAt, t1.endAt + 2000), holds: holdsIn(t1.sentAt, t1.endAt), bounded: boundedLines(t1.sentAt, t1.endAt) };
  const turn1Requests = captures.slice(c0).filter((c) => c.at >= t1.sentAt && c.at <= t1.endAt);
  out.turn1.requests = turn1Requests.length;
  out.turn1.firstRequestKB = turn1Requests[0] ? Math.round(turn1Requests[0].bytes / 1024) : null;
  const ctx = turn1Requests[0] ? contextOf(turn1Requests[0].userText) : null;
  out.turn1.projectedContext = ctx ? { chars: ctx.length, sha: sha(ctx).slice(0, 16) } : null;
  out.turn1.sessionKept = readSessionId() === SOURCE_SESSION;
  if (!out.turn1.sessionKept || !(out.turn1.firstRequestKB > 1024)) throw new Error(`turn 1 did not project the big history: ${JSON.stringify(out)}`);
  // the deferred flush after turn 1
  const fromFlush = t1.endAt;
  const deadline = Date.now() + FLUSH_WAIT_MS;
  let ran;
  while (Date.now() < deadline && gateway.exitCode === null && !(ran = flushLines(fromFlush).find((l) => l.phase === "ran"))) await sleep(2000);
  if (gateway.exitCode !== null) throw new Error(`Gateway exited ${gateway.exitCode} while waiting for the flush\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
  const ranAt = lines.find((l) => l.at >= fromFlush && l.line.includes("[memory-flush-deferred.1]") && l.line.includes('"phase":"ran"'))?.at ?? Date.now();
  out.flush = { lines: flushLines(base), ran: ran ?? "no flush ran", secs: Math.round((ranAt - fromFlush) / 1000), rssPeakMB: peakRss(fromFlush, ranAt + 2000), holds: holdsIn(fromFlush, ranAt), requestsKB: captures.slice(c0).filter((c) => c.at >= fromFlush && c.at <= ranAt).map((c) => Math.round(c.bytes / 1024)) };
  out.entryAfterFlush = readEntry();
  out.sessionKept = readSessionId() === SOURCE_SESSION;
  // turn 2: does the reply find the flush due again?
  const t2 = await send(sessionKey, "（自动化测试 turn-2）不要调用任何工具，只回复：OK-2");
  await sleep(1500);
  const after2 = flushLines(t2.sentAt);
  out.turn2 = { terminal: t2.terminal, error: t2.error, secs: t2.secs, rssPeakMB: peakRss(t2.sentAt, t2.endAt + 2000), holds: holdsIn(t2.sentAt, t2.endAt), bounded: boundedLines(t2.sentAt, t2.endAt),
    deferredAnotherFlush: after2.some((l) => l.phase === "deferred"), flushLines: after2 };
  out.entryAfterTurn2 = readEntry();
  clearInterval(rssTimer);
  client?.stop?.();
  await stopGateway();
  return out;
}

const results = {};
try {
  sessionKey = buildPrivateDatabase();
  results.inflated = { sessionKey, ...inflateSession() };
  fs.copyFileSync(dstPath, snapshotPath);
  console.log(JSON.stringify({ phase: "inflated", ...results.inflated }));
  if (PHASES.includes("direct")) {
    results.direct = direct();
    console.log(JSON.stringify({ phase: "direct", ...results.direct }));
  }
  if (PHASES.includes("turns")) {
    await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
    fs.mkdirSync(CODEX_HOME, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(CODEX_HOME, "config.toml"), `[model_providers.deepseek]\nname = "DeepSeek"\nbase_url = "http://127.0.0.1:${proxy.address().port}/v1"\nwire_api = "responses"\nenv_key = "DEEPSEEK_API_KEY"\n`, { mode: 0o600 });
    results.turns = [];
    for (const variant of VARIANTS) {
      const r = await variantRun(variant);
      results.turns.push(r);
      console.log(JSON.stringify({ phase: "turns", ...r }));
    }
    const [a, b] = results.turns;
    if (a?.turn1?.projectedContext && b?.turn1?.projectedContext) console.log(JSON.stringify({ compare: "turn-1 projected context", same: a.turn1.projectedContext.sha === b.turn1.projectedContext.sha, a: a.turn1.projectedContext, b: b.turn1.projectedContext }));
  }
} catch (error) {
  console.error(redact(error instanceof Error ? error.stack : String(error)));
  console.error(redact(lines.slice(-80).map((l) => l.line).join("\n")));
  process.exitCode = 1;
} finally {
  clearInterval(rssTimer);
  client?.stop?.();
  await stopGateway();
  proxy.closeAllConnections?.();
  proxy.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
// keep-alive sockets and client timers must not keep a finished run alive
process.exit(process.exitCode ?? 0);
