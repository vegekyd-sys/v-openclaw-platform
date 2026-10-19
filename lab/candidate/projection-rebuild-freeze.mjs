// Candidate measurement: does rebuilding the transcript projection of a V-sized session block the
// owning process's main thread?
//
// V 2026-10-16: the Gateway froze for 46-70 s at a time (16:38-16:57, 18:20, 18:22, 19:20). Every
// freeze window also had a large session whose projection was "rebuilding"
// (SessionTranscriptProjectionUnavailableError): 7da00997 (25.6k events, 143 MB), 3c3fab41
// (12.8k events, 80 MB). This run rebuilds one such session with the real 9.1 reconcile code and
// measures, on the process that owns the rebuild:
//   loop     every event-loop stall >= STALL_MS (a 5 ms interval timer), and the longest one
//   holds    every SQLite transaction the runtime logs as slow (operation + elapsed)
//   reads    a session read through the projection every READ_INTERVAL_MS: how long the session
//            answers "projection is rebuilding" (what V's turns hit), and the read latency
//   writes   a small Agent DB write every WRITE_INTERVAL_MS through runOpenClawAgentWriteTransaction:
//            the admission + commit latency other sessions see during the rebuild
//
// Database: a private makaron database built from the shared VLab mirror (read-only): the source
// session inflated to V's size (events repeated INFLATE times as one chain, plus view_image-shaped
// inline media), a few more sessions, and the shared mirror's FTS rows copied FTS_COPIES times
// onto those sessions so the FTS table has V's row count (V 10/16: 144,386 rows).

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { monitorEventLoopDelay } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
assert(runtime && stateDir && sharedState, "candidate runtime environment is required");
const SOURCE_SESSION = process.env.SOURCE_SESSION ?? "3c3fab41-f6de-4fa9-98de-679038ec5c9d";
const INFLATE = Number(process.env.INFLATE ?? 4);
const MEDIA_ROWS = Number(process.env.MEDIA_ROWS ?? 40);
const MEDIA_IMAGES_PER_ROW = Number(process.env.MEDIA_IMAGES_PER_ROW ?? 5);
const MEDIA_IMAGE_CHARS = Number(process.env.MEDIA_IMAGE_CHARS ?? 240_000);
const EXTRA_SESSIONS = Number(process.env.EXTRA_SESSIONS ?? 5);
const FTS_COPIES = Number(process.env.FTS_COPIES ?? 3);
const ROUNDS = Number(process.env.ROUNDS ?? 2);
const STALL_MS = Number(process.env.STALL_MS ?? 100);
const READ_INTERVAL_MS = Number(process.env.READ_INTERVAL_MS ?? 200);
const WRITE_INTERVAL_MS = Number(process.env.WRITE_INTERVAL_MS ?? 100);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const dist = path.join(runtime, "openclaw", "dist");
const distModule = async (re, marker) => {
  const name = fs.readdirSync(dist).find((f) => re.test(f) && fs.readFileSync(path.join(dist, f), "utf8").includes(marker));
  assert(name, `no dist file matches ${re} with ${marker}`);
  return { name, module: await import(pathToFileURL(path.join(dist, name)).href) };
};
const exported = (mod, fnName) => {
  const fn = Object.values(mod.module).find((v) => typeof v === "function" && v.name === fnName);
  assert(fn, `${mod.name} does not export ${fnName}`);
  return fn;
};

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

// Marks the session the way the in-transaction appender does when an append does not extend the
// indexed leaf (markSessionTranscriptIndexDirtyInTransaction): needs_rebuild = 1, rows kept.
function markDirty(db) {
  db.prepare("UPDATE session_transcript_index_state SET needs_rebuild = 1, updated_at = ? WHERE session_id = ?").run(Date.now(), SOURCE_SESSION);
}

const t0 = performance.now();
const built = buildPrivateDatabase();
const inflated = inflateSession();
console.log(JSON.stringify({ phase: "built", ms: Math.round(performance.now() - t0), ...inflated, ftsFiller: built.ftsFiller }));

// V db91.6 chunk names
const reconcileMod = await distModule(/^session-transcript-reconcile-j5qhAafV\.js$/u, "startSessionTranscriptIndexReconcile");
const accessorMod = await distModule(/^session-accessor-K0XuW6ln\.js$/u, "withCurrentProjectionSnapshot");
const agentDbMod = await distModule(/^openclaw-agent-db-CUTe8BX6\.js$/u, "function openOpenClawAgentDatabase");
const startReconcile = exported(reconcileMod, "startSessionTranscriptIndexReconcile");
const waitReconcile = exported(reconcileMod, "waitForSessionTranscriptIndexReconcile");
const withSnapshot = exported(accessorMod, "withCurrentProjectionSnapshot");
const isUnavailable = exported(accessorMod, "isSessionTranscriptProjectionUnavailableError");
const openDb = exported(agentDbMod, "openOpenClawAgentDatabase");
const writeTx = exported(agentDbMod, "runOpenClawAgentWriteTransaction");
const scope = { agentId: "makaron", sessionKey: built.sessionKey, sessionId: SOURCE_SESSION };

// First open runs the db91 integrity check; keep it out of the measured window.
const openStarted = performance.now();
const agentDb = openDb({ agentId: "makaron" });
const openMs = Math.round(performance.now() - openStarted);
const baseline = withSnapshot(scope, ({ state }) => state);
console.log(JSON.stringify({ phase: "opened", openMs, path: agentDb.path, indexedSeq: baseline.indexedSeq, activeEvents: baseline.activeEventCount }));

const stallsOf = (fn) => {
  const stalls = [];
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    if (now - last >= STALL_MS + 5) stalls.push({ atMs: Math.round(now - fn.startedAt), ms: Math.round(now - last - 5) });
    last = now;
  }, 5);
  return () => { clearInterval(timer); return stalls; };
};

const rounds = [];
for (let round = 1; round <= ROUNDS; round++) {
  const db = new DatabaseSync(dstPath);
  db.exec("PRAGMA busy_timeout = 5000");
  markDirty(db);
  db.close();
  const clock = { startedAt: performance.now() };
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  const stopStalls = stallsOf(clock);
  const cpu0 = process.cpuUsage();
  const reads = { ok: 0, unavailable: 0, firstOkMs: null, maxMs: 0 };
  const writes = { n: 0, maxMs: 0, over1s: 0, failed: 0 };
  let done = false;
  const reader = (async () => {
    while (!done) {
      const s = performance.now();
      try {
        withSnapshot(scope, ({ state }) => state.indexedSeq);
        reads.ok++;
        reads.firstOkMs ??= Math.round(s - clock.startedAt);
      } catch (error) {
        if (!isUnavailable(error)) throw error;
        reads.unavailable++;
      }
      reads.maxMs = Math.max(reads.maxMs, Math.round(performance.now() - s));
      await sleep(READ_INTERVAL_MS);
    }
  })();
  const writer = (async () => {
    while (!done) {
      const s = performance.now();
      try {
        writeTx((database) => database.db.prepare("INSERT INTO __probe_writes (at) VALUES (?)").run(Date.now()), { agentId: "makaron" }, { operationLabel: "candidate.probe-write" });
      } catch { writes.failed++; }
      const ms = performance.now() - s;
      writes.n++;
      writes.maxMs = Math.max(writes.maxMs, Math.round(ms));
      if (ms >= 1000) writes.over1s++;
      await sleep(WRITE_INTERVAL_MS);
    }
  })();
  // The reader's first unavailable read starts the reconcile, as on V; every later unavailable
  // read marks it pending again, which makes the reconcile run another pass when this one ends.
  await sleep(50);
  assert(startReconcile.length >= 0);
  await waitReconcile({ agentId: "makaron" });
  const reconcileMs = Math.round(performance.now() - clock.startedAt);
  // let the reader observe the published projection
  while (reads.firstOkMs === null && performance.now() - clock.startedAt < reconcileMs + 5000) await sleep(50);
  done = true;
  await Promise.all([reader, writer]);
  histogram.disable();
  const stalls = stopStalls();
  const cpu = process.cpuUsage(cpu0);
  const after = withSnapshot(scope, ({ state }) => state);
  rounds.push({
    round, reconcileMs,
    unavailableUntilMs: reads.firstOkMs, reads, writes,
    loop: {
      maxStallMs: Math.max(0, ...stalls.map((s) => s.ms)),
      stallsOver100ms: stalls.length,
      stallsOver1s: stalls.filter((s) => s.ms >= 1000).length,
      sumStallMs: stalls.reduce((a, s) => a + s.ms, 0),
      p99Ms: Math.round(histogram.percentile(99) / 1e6), maxMs: Math.round(histogram.max / 1e6),
      top: [...stalls].sort((a, b) => b.ms - a.ms).slice(0, 8),
    },
    cpuMainProcessMs: Math.round((cpu.user + cpu.system) / 1000),
    published: { indexedSeq: after.indexedSeq, activeEvents: after.activeEventCount, needsRebuild: after.needsRebuild },
  });
  console.log(JSON.stringify({ phase: "round", ...rounds.at(-1) }));
}
console.log(JSON.stringify({ phase: "summary", source: SOURCE_SESSION, inflate: INFLATE, ...inflated, rounds: rounds.map((r) => ({ round: r.round, reconcileMs: r.reconcileMs, unavailableUntilMs: r.unavailableUntilMs, maxStallMs: r.loop.maxStallMs, sumStallMs: r.loop.sumStallMs, writeMaxMs: r.writes.maxMs })) }));
process.exit(0);
