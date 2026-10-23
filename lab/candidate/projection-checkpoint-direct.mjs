// One session, one runtime (A = V bytes, B = transcript-projection-checkpoint), real OpenClaw
// modules against a private copy of V's rows. Runs the two in-place rewrites every native turn
// performs on V plus a forced full rebuild, and for each one measures:
//   blockMaxMs     longest main-thread stall from the rewrite until the projection is current
//                  (5 ms interval sampler; a synchronous SQLite call stalls the whole thread)
//   rewriteMs      the rewrite call itself (its writer transaction holds the cross-process lease)
//   dirty          whether the projection was left needing a rebuild
//   reader         what a projection reader sees right after the rewrite, i.e. what the next
//                  message's turn would see (V: "Session transcript projection is rebuilding")
//   windowMs       until waitForSessionTranscriptProjection succeeds (V waits up to 15 s, then fails)
//   rebuildMs      until the background reconcile of this session settled
//   sameAsRebuild  stored projection (active rows, FTS rows, state) == a full rebuild's projection
// Finally it writes what the model would see (model-context messages/model/thinking level,
// the bounded transcript tail, stats) so the orchestrator can diff A against B field by field.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const [dist, sessionId, sessionKey, outPath, scenarioList] = process.argv.slice(2);
const scenarios = (scenarioList ?? "annotation,display,forced").split(",");
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
const rewriteTranscriptEventRowsExact = accessor.xt;
const readRecentSessionTranscriptActiveEvents = accessor.i;
const readRecentSessionTranscriptMessageEvents = accessor.a;
const readSessionTranscriptActiveStats = accessor.s;
const isUnavailable = accessor.T;
const prepareSessionTranscriptProjection = index.g;
const markSessionTranscriptIndexDirtyInTransaction = index.s;
const { g: openOpenClawAgentDatabase, y: runOpenClawAgentWriteTransaction } = agentDb;
for (const [name, fn] of Object.entries({ rewriteTranscriptMessageAtAnchor, rewriteTranscriptEventRowsExact, readRecentSessionTranscriptActiveEvents, readRecentSessionTranscriptMessageEvents, readSessionTranscriptActiveStats, isUnavailable, prepareSessionTranscriptProjection, markSessionTranscriptIndexDirtyInTransaction, openOpenClawAgentDatabase, runOpenClawAgentWriteTransaction })) assert.equal(typeof fn, "function", `${name} alias moved`);

const scope = { agentId: "makaron", sessionId, sessionKey };
const dbOptions = { agentId: "makaron", path: dbPath };
const patched = fs.readFileSync(path.join(dist, "session-transcript-index-9itOio9h.js"), "utf8").includes("transcript-projection-checkpoint-v1");
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
async function observe(t0, writeMs) {
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
  const stored = storedProjection();
  const rebuilt = rebuiltProjection();
  return {
    writeMs, dirty: s?.needs_rebuild === 1, reader, wait, windowMs, rebuildMs,
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
const results = { patched, sessionId, rows: raw.prepare("SELECT count(*) AS n, sum(octet_length(event_json)) AS b FROM transcript_events WHERE session_id = ?").get(sessionId), scenarios: {} };
results.initial = { state: state(), sameAsRebuild: JSON.stringify(storedProjection()) === JSON.stringify(rebuiltProjection()) };
await sleep(200);

for (const scenario of scenarios) {
  await tick();
  resetStalls();
  const t0 = performance.now();
  if (scenario === "annotation") {
    // user-turn-transcript.ts: the native prompt annotation every native turn writes onto the admitted user message
    const target = latestMessage("user");
    if (!target) { results.scenarios[scenario] = { skipped: "no user message" }; continue; }
    const anchor = { ...scope, rawSeq: target.seq, entryId: target.event.id };
    const rewritten = await rewriteTranscriptMessageAtAnchor(anchor, (message) => ({ ...message, __openclaw: { ...(message.__openclaw ?? {}), mirrorIdentity: `candidate-${target.event.id}`, upstreamUserText: "", mirrorOrigin: "codex-app-server", mirrorSourceFingerprint: "0".repeat(32), runId: "candidate-run" } }));
    const writeMs = Math.round(performance.now() - t0);
    results.scenarios[scenario] = { seq: target.seq, rewritten: Boolean(rewritten), ...(await observe(t0, writeMs)) };
  } else if (scenario === "display") {
    // chat-transcript-persistence.ts: delivered media becomes the assistant message's display content
    const target = latestMessage("assistant");
    if (!target) { results.scenarios[scenario] = { skipped: "no assistant message" }; continue; }
    const content = Array.isArray(target.event.message.content) ? target.event.message.content : [{ type: "text", text: String(target.event.message.content ?? "") }];
    const message = { ...target.event.message, openclawDisplayContent: [...content.filter((b) => b?.type === "text"), { type: "image", url: "https://example.invalid/candidate.png", mimeType: "image/png" }] };
    const expectedEventJson = raw.prepare("SELECT event_json FROM transcript_events WHERE session_id = ? AND seq = ?").get(sessionId, target.seq).event_json;
    const rewritten = await rewriteTranscriptEventRowsExact(scope, { expectedGeneration: generation(), rows: [{ event: { ...target.event, message }, expectedEventJson, seq: target.seq }] });
    const writeMs = Math.round(performance.now() - t0);
    results.scenarios[scenario] = { seq: target.seq, rewritten: Boolean(rewritten), ...(await observe(t0, writeMs)) };
  } else if (scenario === "forced") {
    // a branch, rewind or leaf control: the projection must be rebuilt in both variants
    runOpenClawAgentWriteTransaction((database) => { markSessionTranscriptIndexDirtyInTransaction(database.db, sessionId); }, dbOptions, { operationLabel: "candidate.mark-dirty" });
    reconcile.r({ ...dbOptions, preferredSessionId: sessionId });
    const writeMs = Math.round(performance.now() - t0);
    results.scenarios[scenario] = await observe(t0, writeMs);
  }
}

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
