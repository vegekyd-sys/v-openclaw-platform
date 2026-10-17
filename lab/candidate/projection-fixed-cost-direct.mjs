// One session, one runtime, real OpenClaw modules against a private copy of V's rows (see
// projection-fixed-cost.mjs). Same writes as projection-incremental-direct.mjs (side append,
// rewind, branch, branch before the latest compaction), plus sideBurst: a side append, wait until
// readable, then at once a second side append (the second write lands while the first reconcile
// may still be finishing its trailing work). For each write it measures, from the write until the
// projection is current:
//   blockMaxMs     longest main-thread stall (5 ms interval sampler)
//   dirty          needs_rebuild right after the write
//   windowMs       until waitForSessionTranscriptProjection succeeds
//   rebuildMs      until the background reconcile chain settled
//   sameAsRebuild  stored projection == a full rebuild of all rows
//   marks          (instrumented runtimes) segment marks in ms after the write, see
//                  projection-fixed-cost-instrument.mjs
// and finally writes what the model would see, for the A/B field-by-field diff.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const [dist, sessionId, sessionKey, outPath, scenarioList] = process.argv.slice(2);
const scenarios = (scenarioList ?? "side,rewind,branch,crossCheckpoint,sideBurst").split(",");
const stateDir = process.env.OPENCLAW_STATE_DIR;
const dbPath = path.join(stateDir, "agents", "makaron", "agent", "openclaw-agent.sqlite");
const imp = (name) => import(path.join(dist, name));
const accessor = await imp("session-accessor-K0XuW6ln.js");
const reconcile = await imp("session-transcript-reconcile-j5qhAafV.js");
const index = await imp("session-transcript-index-9itOio9h.js");
const agentDb = await imp("openclaw-agent-db-CUTe8BX6.js");
const smFile = fs.readdirSync(dist).find((f) => /^session-manager-.*\.js$/u.test(f) && fs.readFileSync(path.join(dist, f), "utf8").includes("static openModelContext("));
const { t: SessionManager } = await imp(smFile);
const rewriteTranscriptMessageAtAnchor = accessor.W;
const appendTranscriptMessage = accessor._t;
const appendTranscriptEvent = accessor.ht;
const rewriteTranscriptEventRowsExact = accessor.xt;
const readRecentSessionTranscriptActiveEvents = accessor.i;
const readRecentSessionTranscriptMessageEvents = accessor.a;
const readSessionTranscriptActiveStats = accessor.s;
const isUnavailable = accessor.T;
const prepareSessionTranscriptProjection = index.g;
const markSessionTranscriptIndexDirtyInTransaction = index.s;
const { g: openOpenClawAgentDatabase, y: runOpenClawAgentWriteTransaction } = agentDb;
for (const [name, fn] of Object.entries({ appendTranscriptMessage, appendTranscriptEvent, rewriteTranscriptMessageAtAnchor, rewriteTranscriptEventRowsExact, readRecentSessionTranscriptActiveEvents, readRecentSessionTranscriptMessageEvents, readSessionTranscriptActiveStats, isUnavailable, prepareSessionTranscriptProjection, markSessionTranscriptIndexDirtyInTransaction, openOpenClawAgentDatabase, runOpenClawAgentWriteTransaction })) assert.equal(typeof fn, "function", `${name} alias moved`);

const scope = { agentId: "makaron", sessionId, sessionKey };
const dbOptions = { agentId: "makaron", path: dbPath };
const reconcileSource = fs.readFileSync(path.join(dist, "session-transcript-reconcile-j5qhAafV.js"), "utf8");
const patched = reconcileSource.includes("transcript-projection-fixed-cost-v1");
const instrumented = reconcileSource.includes("__vprojMark");
const timingFile = `${outPath}.marks`;
const nowAbs = () => performance.timeOrigin + performance.now();
function readMarks(origin) {
  if (!instrumented || !fs.existsSync(timingFile)) return undefined;
  const marks = fs.readFileSync(timingFile, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)).sort((a, b) => a.t - b.t);
  fs.rmSync(timingFile, { force: true });
  return marks.map(({ k, t, ...extra }) => ({ k, ms: Math.round((t - origin) * 10) / 10, ...(Object.keys(extra).length ? extra : {}) }));
}
function startMarks() { fs.rmSync(timingFile, { force: true }); if (instrumented) process.env.VPROJ_TIMING_FILE = timingFile; }
const raw = new DatabaseSync(dbPath, { readOnly: true });

// ---- main-thread stall sampler ----
let last = performance.now();
let stalls = [];
const sampler = setInterval(() => {
  const now = performance.now();
  const gap = now - last - 5;
  if (gap >= 20) stalls.push(Math.round(gap));
  last = now;
}, 5);
const resetStalls = () => { stalls = []; last = performance.now(); };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function state() {
  const row = raw.prepare("SELECT indexed_seq, leaf_event_id, needs_rebuild, active_event_count, active_message_count FROM session_transcript_index_state WHERE session_id = ?").get(sessionId);
  return row ? { ...row } : null;
}
function storedProjection() {
  const s = state();
  return {
    activeRows: raw.prepare("SELECT active_position, event_seq, message_position, context_eligible FROM session_transcript_active_events WHERE session_id = ? ORDER BY active_position").all(sessionId).map((r) => [r.active_position, r.event_seq, r.message_position, r.context_eligible]),
    ftsRows: raw.prepare("SELECT message_id, role, text, timestamp FROM session_transcript_fts WHERE session_id = ?").all(sessionId).map((r) => JSON.stringify([r.message_id, r.role, r.text, r.timestamp])).sort(),
    state: s && { indexedSeq: s.indexed_seq, leaf: s.leaf_event_id, needsRebuild: s.needs_rebuild, events: s.active_event_count, messages: s.active_message_count },
  };
}
function rebuiltProjection() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const p = prepareSessionTranscriptProjection(db, sessionId);
    return {
      activeRows: p.activeRows.map((r) => [r.activePosition, r.eventSeq, r.messagePosition, r.contextEligible]),
      ftsRows: p.ftsRows.map((r) => JSON.stringify([r.messageId, r.role, r.text, r.timestamp])).sort(),
      state: { indexedSeq: p.sourceIndexedSeq, leaf: p.leafEventId, needsRebuild: 0, events: p.activeEventCount, messages: p.activeMessageCount },
    };
  } finally { db.close(); }
}
function latestMessage(role) {
  const row = raw.prepare(`SELECT a.event_seq AS seq, e.event_json FROM session_transcript_active_events a
    JOIN transcript_events e ON e.session_id = a.session_id AND e.seq = a.event_seq
    WHERE a.session_id = ? AND a.message_position IS NOT NULL AND json_extract(e.event_json, '$.message.role') = ?
    ORDER BY a.active_position DESC LIMIT 1`).get(sessionId, role);
  return row ? { seq: row.seq, event: JSON.parse(row.event_json) } : undefined;
}
function generation() {
  return raw.prepare("SELECT generation FROM transcript_rewrite_watermarks WHERE session_id = ?").get(sessionId)?.generation ?? null;
}

/** What the next message's turn would see right after a write, then until the projection is current. */
async function observe(t0, writeMs, origin) {
  const s = state();
  let reader;
  const r0 = performance.now();
  try { readRecentSessionTranscriptActiveEvents(scope, 40); reader = { ok: true, ms: Math.round(performance.now() - r0) }; }
  catch (error) { reader = { ok: false, error: isUnavailable(error) ? "projection-rebuilding" : String(error?.message ?? error).slice(0, 120) }; }
  const w0 = performance.now();
  let wait;
  try { const proof = await reconcile.a(scope, undefined); wait = { ok: true, polls: proof.polls }; }
  catch (error) { wait = { ok: false, error: isUnavailable(error) ? "projection-rebuilding-timeout" : String(error?.message ?? error).slice(0, 120) }; }
  const windowMs = Math.round(performance.now() - w0);
  await reconcile.i(dbOptions);
  await sleep(100);
  const rebuildMs = Math.round(performance.now() - t0);
  const marks = readMarks(origin);
  const stored = storedProjection();
  const rebuilt = rebuiltProjection();
  return {
    writeMs, dirty: s?.needs_rebuild ?? null, reader, wait, windowMs, rebuildMs, ...(marks ? { marks } : {}),
    blockMaxMs: Math.max(0, ...stalls), stallsOver100: stalls.filter((x) => x >= 100).length,
    sameAsRebuild: JSON.stringify(stored) === JSON.stringify(rebuilt),
    ...(JSON.stringify(stored.state) === JSON.stringify(rebuilt.state) ? {} : { stored: stored.state, rebuilt: rebuilt.state }),
  };
}

// Warm-up: the first write of a process runs the db91 integrity gate over the whole file (about
// 1.3 s here, in both variants). V's Gateway and Workers are long-lived and past it, so it is
// taken here, outside every measurement.
runOpenClawAgentWriteTransaction(() => {}, dbOptions, { operationLabel: "candidate.warm-up" });
if (scenarios.includes("baseline")) {
  // Publish a complete projection (the export carries no FTS rows) through the native rebuild.
  runOpenClawAgentWriteTransaction((database) => { markSessionTranscriptIndexDirtyInTransaction(database.db, sessionId); }, dbOptions, { operationLabel: "candidate.baseline" });
  reconcile.r({ ...dbOptions, preferredSessionId: sessionId });
  await reconcile.a(scope, undefined);
  await reconcile.i(dbOptions);
  assert.equal(JSON.stringify(storedProjection()), JSON.stringify(rebuiltProjection()), "baseline projection is not a full rebuild");
  fs.writeFileSync(outPath, JSON.stringify({ baseline: true, state: state() }));
  clearInterval(sampler);
  raw.close();
  process.exit(0);
}
const results = { patched, instrumented, sessionId, rows: raw.prepare("SELECT count(*) AS n, sum(octet_length(event_json)) AS b FROM transcript_events WHERE session_id = ?").get(sessionId), scenarios: {} };
results.initial = { state: state(), sameAsRebuild: JSON.stringify(storedProjection()) === JSON.stringify(rebuiltProjection()) };
await sleep(200);

// active message nodes, newest first, and the latest compaction on the active path
function activeMessages(limit) {
  return raw.prepare(`SELECT a.active_position AS position, i.event_id AS id FROM session_transcript_active_events a
    JOIN transcript_event_identities i ON i.session_id = a.session_id AND i.seq = a.event_seq
    WHERE a.session_id = ? AND a.message_position IS NOT NULL ORDER BY a.active_position DESC LIMIT ?`).all(sessionId, limit);
}
function leafId() {
  return raw.prepare(`SELECT i.event_id AS id FROM session_transcript_active_events a JOIN transcript_event_identities i ON i.session_id = a.session_id AND i.seq = a.event_seq
    WHERE a.session_id = ? ORDER BY a.active_position DESC LIMIT 1`).get(sessionId)?.id ?? null;
}
const T0 = Date.parse("2026-10-17T05:00:00.000Z");
let step = 0;
const at = () => T0 + 1000 * step++;
const message = (role, text, time) => ({ role, content: [{ type: "text", text }], timestamp: time });
async function appendMessage(id, parentId, role, text) {
  const time = at();
  await appendTranscriptMessage(scope, { message: message(role, text, time), parentId, eventId: id, now: time });
}
// a stuck scenario reports where it stopped instead of waiting for the driver's timeout
let watchdog;
const armWatchdog = (scenario) => {
  clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    const marks = fs.existsSync(timingFile) ? fs.readFileSync(timingFile, "utf8") : "(no marks)";
    console.error(`scenario ${scenario} stuck after ${SCENARIO_LIMIT_MS} ms; state=${JSON.stringify(state())}\nmarks:\n${marks}`);
    process.exit(3);
  }, SCENARIO_LIMIT_MS);
};
const SCENARIO_LIMIT_MS = Number(process.env.SCENARIO_LIMIT_MS ?? 120000);
for (const scenario of scenarios) {
  armWatchdog(scenario);
  await tick();
  resetStalls();
  startMarks();
  const t0 = performance.now();
  const origin = nowAbs();
  const before = state();
  if (scenario === "side" || scenario === "sideBurst") {
    // channel reply audit: a side append the forward index cannot place
    await appendTranscriptEvent(scope, { type: "custom", id: scenario === "side" ? "cand-side-1" : "cand-burst-1", parentId: leafId(), appendMode: "side", customType: "openclaw.conversation-turn-reply", timestamp: new Date(at()).toISOString(), data: { reply: "candidate side append" } });
  } else if (scenario === "rewind") {
    // rewind to six messages back, then continue from there
    const target = activeMessages(7).at(-1);
    if (!target) { results.scenarios[scenario] = { skipped: "too few messages" }; continue; }
    await appendTranscriptEvent(scope, { type: "leaf", id: "cand-rewind-leaf", parentId: leafId(), targetId: target.id, timestamp: new Date(at()).toISOString() });
    await appendMessage("cand-rewind-user", target.id, "user", "（candidate）回退后的新问题");
    await appendMessage("cand-rewind-assistant", "cand-rewind-user", "assistant", "（candidate）回退后的回答");
  } else if (scenario === "branch") {
    const target = activeMessages(21).at(-1);
    if (!target) { results.scenarios[scenario] = { skipped: "too few messages" }; continue; }
    await appendMessage("cand-branch-user", target.id, "user", "（candidate）从 20 条前分叉");
    await appendMessage("cand-branch-assistant", "cand-branch-user", "assistant", "（candidate）分叉后的回答");
  } else if (scenario === "crossCheckpoint") {
    const compaction = raw.prepare(`SELECT a.active_position AS position FROM session_transcript_active_events a JOIN transcript_event_identities i ON i.session_id = a.session_id AND i.seq = a.event_seq
      WHERE a.session_id = ? AND i.event_type = 'compaction' ORDER BY a.active_position DESC LIMIT 1`).get(sessionId);
    if (!compaction) { results.scenarios[scenario] = { skipped: "no compaction checkpoint" }; continue; }
    const target = raw.prepare(`SELECT i.event_id AS id, a.active_position AS position FROM session_transcript_active_events a JOIN transcript_event_identities i ON i.session_id = a.session_id AND i.seq = a.event_seq
      WHERE a.session_id = ? AND a.message_position IS NOT NULL AND a.active_position < ? ORDER BY a.active_position DESC LIMIT 1 OFFSET 2`).get(sessionId, compaction.position);
    if (!target) { results.scenarios[scenario] = { skipped: "nothing before the checkpoint" }; continue; }
    await appendMessage("cand-cross-user", target.id, "user", "（candidate）从压缩检查点之前分叉");
    results.crossCheckpoint = { compactionPosition: compaction.position, targetPosition: target.position, activeBefore: before?.active_event_count };
  }
  const writeMs = Math.round(performance.now() - t0);
  if (scenario === "sideBurst") {
    // first side append is above; wait until readable only, then the second write at once
    const w0 = performance.now();
    await reconcile.a(scope, undefined);
    const firstWindowMs = Math.round(performance.now() - w0);
    readMarks(origin);
    startMarks();
    resetStalls();
    const t1 = performance.now();
    const origin1 = nowAbs();
    await appendTranscriptEvent(scope, { type: "custom", id: "cand-burst-2", parentId: leafId(), appendMode: "side", customType: "openclaw.conversation-turn-reply", timestamp: new Date(at()).toISOString(), data: { reply: "candidate burst 2" } });
    results.scenarios[scenario] = { firstWindowMs, activeBefore: before?.active_event_count, ...(await observe(t1, Math.round(performance.now() - t1), origin1)), activeAfter: state()?.active_event_count };
    continue;
  }
  results.scenarios[scenario] = { activeBefore: before?.active_event_count, ...(await observe(t0, writeMs, origin)), activeAfter: state()?.active_event_count };
}

clearTimeout(watchdog);
// ---- what the model sees after the same writes ----
const model = SessionManager.openModelContext(scope);
const context = model.buildSessionContext();
const tail = readRecentSessionTranscriptMessageEvents(scope, { maxMessages: 200, maxLines: 400, maxBytes: 16 * 1024 * 1024 });
results.view = {
  modelContext: { messages: context.messages, model: context.model, thinkingLevel: context.thinkingLevel, leaf: model.getLeafId(), entries: model.getEntries().length },
  tail: { leaf: tail.activeLeafEntryId, total: tail.totalMessages, events: tail.events },
  stats: readSessionTranscriptActiveStats(scope),
};
clearInterval(sampler);
fs.writeFileSync(outPath, JSON.stringify(results));
raw.close();
process.exit(0);
