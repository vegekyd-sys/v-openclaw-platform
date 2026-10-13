import assert from 'node:assert/strict';

// Transcript mirror facts come from the identity rows, not a full transcript read, while the
// session's projection catches up.
//
// Every Codex transcript mirror (checkpoint flush, async message, steering prefix, turn end) first
// reads readTranscriptMirrorFacts: which of its idempotency keys the session already holds. When
// the session's projection (session_transcript_index_state) was dirty or behind the newest event,
// loadTranscriptEventsForMirrorFallback loaded and parsed the session's whole transcript to find
// them, however few keys were asked. The projection goes dirty on every side-appended event (the
// channel reply audit record written after each delivered reply), a parent that is not the
// current leaf, or a leaf control, and stays dirty until a background rebuild finishes. On V
// (2026-10-10 14:00-15:00) one busy /vds session (13,787 events) did this 380 times in an hour,
// about 1.1 s each, 454 s of Gateway main thread inside a SQLite transaction.
//
// transcript_event_identities is not part of that projection: appendTranscriptEvent writes the
// identity row in the same transaction as the event (and the transcript replace and canonical
// repair paths do too), and core append dedupe (readIdempotencyKeyOwner) already trusts it alone.
// Its message_idempotency_key is read from event.message exactly as the fallback read it. So a
// lagging projection now runs the same indexed identity lookup as a current one, without anchors
// (the active-event positions are what lag; the fallback never returned anchors either). A session
// with events but no identity rows at all still takes the full read.
// Unchanged: a current projection (same query, same anchors), an empty transcript, the batch size,
// the deferred snapshot transaction and its operation label.

export const MARKER = 'v-mirror-facts-identity-v1';

export function patchSessionAccessor(source) {
  assert(!source.includes(MARKER), 'session accessor already carries the mirror facts identity patch');
  const fallback = '\tconst fallbackEvents = loadTranscriptEventsForMirrorFallback(database, resolved.sessionId);\n'
    + '\tif (fallbackEvents !== void 0) return readMirrorFactsFromEvents(fallbackEvents, new Set(idempotencyKeys));\n';
  assert.equal(source.split(fallback).length, 2, 'Expected exactly one mirror facts fallback');
  const anchor = '\t\t\tconst anchor = readActiveTranscriptEntryAnchorInTransaction({\n\t\t\t\tdatabase,\n\t\t\t\tresolved,\n\t\t\t\tentryId: row.event_id\n\t\t\t});\n';
  assert.equal(source.split(anchor).length, 2, 'Expected exactly one mirror facts anchor read');
  const helperAt = '/** Reads the bounded identity facts needed by transcript mirrors. */\nfunction readTranscriptMirrorFacts(';
  assert.equal(source.split(helperAt).length, 2, 'Expected readTranscriptMirrorFacts once');
  return source
    .replace(helperAt, `// ${MARKER}: identity rows are written with their events, so a lagging projection only loses anchors.
function readTranscriptMirrorProjectionState(database, sessionId) {
	const db = getSessionKysely(database.db);
	const latest = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_events").select("seq").where("session_id", "=", sessionId).orderBy("seq", "desc").limit(1));
	if (!latest) return "empty";
	const state = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_transcript_index_state").select(["indexed_seq", "needs_rebuild"]).where("session_id", "=", sessionId));
	if (state && state.needs_rebuild === 0 && state.indexed_seq === latest.seq) return "current";
	return executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_event_identities").select("seq").where("session_id", "=", sessionId).limit(1)) ? "lagging" : "unindexed";
}
${helperAt}`)
    .replace(fallback, `\tconst projectionState = readTranscriptMirrorProjectionState(database, resolved.sessionId); // ${MARKER}
\tif (projectionState === "empty") return readMirrorFactsFromEvents([], new Set(idempotencyKeys));
\tif (projectionState === "unindexed") return readMirrorFactsFromEvents(loadTranscriptEventsFromDatabase(database, resolved.sessionId), new Set(idempotencyKeys));
`)
    .replace(anchor, `\t\t\tconst anchor = projectionState === "current" ? readActiveTranscriptEntryAnchorInTransaction({\n\t\t\t\tdatabase,\n\t\t\t\tresolved,\n\t\t\t\tentryId: row.event_id\n\t\t\t}) : void 0; // ${MARKER}: active positions lag with the projection\n`);
}
