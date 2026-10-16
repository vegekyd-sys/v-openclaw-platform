import assert from 'node:assert/strict';

// Exact in-place transcript rewrites keep a current projection current; the synchronous-rebuild
// size check stops reading once the answer is known.
//
// V 2026-10-16/17: large sessions (7da00997 25,951 rows / 160 MB, 3c3fab41 12,811 rows / 84 MB)
// rebuilt their whole projection after almost every turn although none of their recent rows
// branches, rewinds or side-appends. Every native turn rewrites the admitted user message in place
// (user-turn-transcript: rewriteTranscriptMessageAtAnchor adds the __openclaw mirror annotation),
// and media delivery rewrites the assistant message in place (chat-transcript-persistence:
// rewriteTranscriptEventRowsExact). rewriteSqliteTranscriptEventRowsInTransaction then
//   1. sized the whole session inside the writer transaction (SUM(octet_length) over every row,
//      5.3 s on the Gateway main thread at 00:46:08 while holding the cross-process writer lease),
//   2. marked the projection dirty, which makes every projection reader throw
//      SessionTranscriptProjectionUnavailableError ("Session transcript projection is rebuilding")
//      or wait up to 15 s, and Codex context reads fall back to a whole-session scan, until
//   3. a full rebuild re-read and re-parsed every row and rewrote every active/FTS row.
//
// The projection is a pure function of the transcript rows: the branch tree is built only from
// each row's navigation fields (type, id, parentId, targetId, appendParentId, appendMode), and
// each row contributes three facts (projects an active row / carries a message / FTS entry) plus
// its context eligibility. A rewrite that leaves all navigation fields and the first three facts
// unchanged therefore leaves the tree, the active path, every position, the leaf, the counts and
// every FTS row exactly as a full rebuild would produce them; only context_eligible may need the
// rewritten value. For such rewrites the projection is updated in place inside the same writer
// transaction and stays current. Anything else (a changed navigation field, a changed projected
// fact, FTS text of a projected message, a projection that was not current before) takes the
// original path unchanged: size check, mark dirty or rebuild synchronously, schedule reconcile.
//
// The size check keeps its exact result (stored rows + incoming rows <= 4000 and stored bytes
// <= 4 MiB, then incoming bytes) but reads stored rows in seq order and stops at the first limit,
// so it reads at most 4001 rows / ~4 MiB instead of the whole session.

export const TRANSCRIPT_PROJECTION_CHECKPOINT_MARKER = '// transcript-projection-checkpoint-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

// ---- session-transcript-index chunk ----

const INDEX_IMPORT_BEFORE = `import { c as isRecord } from "./record-coerce-DItp3I4t.js";
`;
const INDEX_IMPORT_AFTER = `import { c as isRecord } from "./record-coerce-DItp3I4t.js";
import { isDeepStrictEqual } from "node:util";
`;

const SIZE_CHECK_BEFORE = `function shouldRebuildSessionTranscriptIndexSynchronously(db, sessionId, events = []) {
	if (events.length > 4e3) return false;
	const stored = executeSqliteQueryTakeFirstSync(db, getIndexKysely(db).selectFrom("transcript_events").select((eb) => [eb.fn.countAll().as("event_count"), eb.fn.sum(eb.fn("octet_length", ["event_json"])).as("event_bytes")]).where("session_id", "=", sessionId));
	if ((stored?.event_count ?? 0) + events.length > 4e3) return false;
	let bytes = stored?.event_bytes ?? 0;
	if (bytes > 4194304) return false;
	for (const event of events) {`;
const SIZE_CHECK_AFTER = `function shouldRebuildSessionTranscriptIndexSynchronously(db, sessionId, events = []) {
	if (events.length > 4e3) return false;
	${TRANSCRIPT_PROJECTION_CHECKPOINT_MARKER}: same answer, but stop reading stored rows at the first exceeded limit
	let storedCount = 0;
	let bytes = 0;
	for (const row of iterateSqliteQuerySync(db, getIndexKysely(db).selectFrom("transcript_events").select((eb) => eb.fn("octet_length", ["event_json"]).as("event_bytes")).where("session_id", "=", sessionId).orderBy("seq", "asc").limit(4e3 - events.length + 1))) {
		storedCount += 1;
		if (storedCount + events.length > 4e3) return false;
		bytes += row.event_bytes ?? 0;
		if (bytes > 4194304) return false;
	}
	for (const event of events) {`;

const REWRITE_PLAN_ANCHOR = `/** Marks one session for lazy rebuild without touching its FTS rows. */
function markSessionTranscriptIndexDirtyInTransaction(db, sessionId) {`;
const REWRITE_PLAN = `${TRANSCRIPT_PROJECTION_CHECKPOINT_MARKER}: exact rewrites that leave the tree and every projected fact unchanged
const PROJECTION_NAVIGATION_KEYS = [
	"type",
	"id",
	"parentId",
	"targetId",
	"appendParentId",
	"appendMode"
];
function sameProjectionNavigation(before, after) {
	if (!isRecord(before) || !isRecord(after)) return !isRecord(before) && !isRecord(after);
	for (const key of PROJECTION_NAVIGATION_KEYS) {
		const present = Object.hasOwn(before, key);
		if (present !== Object.hasOwn(after, key)) return false;
		if (present && !isDeepStrictEqual(before[key], after[key])) return false;
	}
	return true;
}
/**
* Plans the projection update for exact in-place row rewrites, before the rows change. Returns the
* context_eligible updates when the current projection stays exactly what a full rebuild of the
* rewritten rows would produce, or undefined when the caller must rebuild.
*/
function planCurrentProjectionAcrossExactRewriteInTransaction(db, sessionId, rows) {
	const state = readSessionTranscriptProjectionState(db, sessionId);
	if (!state || state.needsRebuild) return;
	const kysely = getIndexKysely(db);
	const latest = executeSqliteQueryTakeFirstSync(db, kysely.selectFrom("transcript_events").select("seq").where("session_id", "=", sessionId).orderBy("seq", "desc").limit(1));
	if (!latest || latest.seq !== state.indexedSeq || hasUnclassifiedSessionTranscriptEvents(db, sessionId)) return;
	const updates = [];
	for (const row of rows) {
		if (!sameProjectionNavigation(row.before, row.after)) return;
		const projectsActiveEvent = shouldProjectActiveEvent(row.before);
		if (projectsActiveEvent !== shouldProjectActiveEvent(row.after)) return;
		if (!projectsActiveEvent) continue;
		if (hasTranscriptMessage(row.before) !== hasTranscriptMessage(row.after)) return;
		const active = executeSqliteQueryTakeFirstSync(db, kysely.selectFrom("session_transcript_active_events").select("context_eligible").where("session_id", "=", sessionId).where("event_seq", "=", row.seq));
		// Off the active path: a rebuild projects neither an active row nor an FTS row for it.
		if (!active) continue;
		const stored = executeSqliteQueryTakeFirstSync(db, kysely.selectFrom("transcript_events").select("created_at").where("session_id", "=", sessionId).where("seq", "=", row.seq));
		if (!stored) return;
		if (!isDeepStrictEqual(extractTranscriptIndexEntry(row.before, stored.created_at), extractTranscriptIndexEntry(row.after, stored.created_at))) return;
		const contextEligible = transcriptEventContextEligibility(row.after);
		if (active.context_eligible !== contextEligible) updates.push({
			contextEligible,
			seq: row.seq
		});
	}
	return updates;
}
/** Applies a plan from planCurrentProjectionAcrossExactRewriteInTransaction after the rows changed. */
function applyCurrentProjectionAcrossExactRewriteInTransaction(db, sessionId, updates) {
	for (const update of updates) executeSqliteQuerySync(db, getIndexKysely(db).updateTable("session_transcript_active_events").set({ context_eligible: update.contextEligible }).where("session_id", "=", sessionId).where("event_seq", "=", update.seq));
}
${REWRITE_PLAN_ANCHOR}`;

const INDEX_EXPORT_BEFORE = `shouldRebuildSessionTranscriptIndexSynchronously as u };`;
const INDEX_EXPORT_AFTER = `shouldRebuildSessionTranscriptIndexSynchronously as u, planCurrentProjectionAcrossExactRewriteInTransaction as v, applyCurrentProjectionAcrossExactRewriteInTransaction as w };`;

export function patchTranscriptIndexCheckpoint(source) {
  assert(!source.includes(TRANSCRIPT_PROJECTION_CHECKPOINT_MARKER), 'session-transcript-index is already patched');
  let next = replaceExactlyOnce(source, INDEX_IMPORT_BEFORE, INDEX_IMPORT_AFTER, 'record-coerce import');
  next = replaceExactlyOnce(next, SIZE_CHECK_BEFORE, SIZE_CHECK_AFTER, 'synchronous rebuild size check');
  next = replaceExactlyOnce(next, REWRITE_PLAN_ANCHOR, REWRITE_PLAN, 'dirty marker anchor');
  next = replaceExactlyOnce(next, INDEX_EXPORT_BEFORE, INDEX_EXPORT_AFTER, 'index export list');
  return next;
}

// ---- session-accessor.sqlite-transcript-store chunk ----

const STORE_IMPORT_BEFORE = `s as markSessionTranscriptIndexDirtyInTransaction, u as shouldRebuildSessionTranscriptIndexSynchronously } from "./session-transcript-index-9itOio9h.js";`;
const STORE_IMPORT_AFTER = `s as markSessionTranscriptIndexDirtyInTransaction, u as shouldRebuildSessionTranscriptIndexSynchronously, v as planCurrentProjectionAcrossExactRewriteInTransaction, w as applyCurrentProjectionAcrossExactRewriteInTransaction } from "./session-transcript-index-9itOio9h.js";`;

const REWRITE_BEFORE = `function rewriteSqliteTranscriptEventRowsInTransaction(database, resolved, rows) {
	if (rows.length === 0) return;
	const rebuildSynchronously = shouldRebuildSessionTranscriptIndexSynchronously(database.db, resolved.sessionId);
	const db = getSessionKysely(database.db);
	for (const row of rows) {
		const persistedEvent = canonicalizeTranscriptEventMedia(row.event);
		if (executeSqliteQuerySync(`;
const REWRITE_AFTER = `function rewriteSqliteTranscriptEventRowsInTransaction(database, resolved, rows) {
	if (rows.length === 0) return;
	${TRANSCRIPT_PROJECTION_CHECKPOINT_MARKER}: a rewrite that keeps the tree and every projected fact keeps the projection current
	const persistedEvents = rows.map((row) => canonicalizeTranscriptEventMedia(row.event));
	const projectionPlan = planCurrentProjectionAcrossExactRewriteInTransaction(database.db, resolved.sessionId, rows.map((row, index) => ({
		after: persistedEvents[index],
		before: JSON.parse(row.expectedEventJson),
		seq: row.seq
	})));
	const rebuildSynchronously = projectionPlan === void 0 && shouldRebuildSessionTranscriptIndexSynchronously(database.db, resolved.sessionId);
	const db = getSessionKysely(database.db);
	for (const [rowIndex, row] of rows.entries()) {
		const persistedEvent = persistedEvents[rowIndex];
		if (executeSqliteQuerySync(`;

const REWRITE_TAIL_BEFORE = `	rotateTranscriptGenerationInTransaction(database, resolved.sessionId);
	touchTranscriptMutationInTransaction(database, resolved.sessionId);
	if (rebuildSynchronously) {
		deleteSessionTranscriptIndexInTransaction(database.db, resolved.sessionId);
		reconcileSessionTranscriptIndexInTransaction(database.db, resolved.sessionId);
	} else {
		markSessionTranscriptIndexDirtyInTransaction(database.db, resolved.sessionId);
		scheduleTranscriptProjectionReconcile(database, resolved.sessionId, true, {});
	}
}`;
const REWRITE_TAIL_AFTER = `	rotateTranscriptGenerationInTransaction(database, resolved.sessionId);
	touchTranscriptMutationInTransaction(database, resolved.sessionId);
	if (projectionPlan !== void 0) {
		applyCurrentProjectionAcrossExactRewriteInTransaction(database.db, resolved.sessionId, projectionPlan);
		return;
	}
	if (rebuildSynchronously) {
		deleteSessionTranscriptIndexInTransaction(database.db, resolved.sessionId);
		reconcileSessionTranscriptIndexInTransaction(database.db, resolved.sessionId);
	} else {
		markSessionTranscriptIndexDirtyInTransaction(database.db, resolved.sessionId);
		scheduleTranscriptProjectionReconcile(database, resolved.sessionId, true, {});
	}
}`;

export function patchTranscriptStoreCheckpoint(source) {
  assert(!source.includes(TRANSCRIPT_PROJECTION_CHECKPOINT_MARKER), 'transcript store is already patched');
  let next = replaceExactlyOnce(source, STORE_IMPORT_BEFORE, STORE_IMPORT_AFTER, 'transcript index import');
  next = replaceExactlyOnce(next, REWRITE_BEFORE, REWRITE_AFTER, 'exact rewrite head');
  next = replaceExactlyOnce(next, REWRITE_TAIL_BEFORE, REWRITE_TAIL_AFTER, 'exact rewrite tail');
  return next;
}

// ---- builtin-openclaw chunk: the embedded turn's bounded session open ----
//
// prepareEmbeddedAttemptSessionManager opens the session with context limits, which reads through
// the projection snapshot and throws SessionTranscriptProjectionUnavailableError while a rebuild
// (a branch, rewind or leaf control still needs one) is running. On V 00:39:09-18 three media
// continuation turns in 7da00997 failed this way 0.2-3 s after they started, before any model call.
// The turn now waits for the projection (waitForSessionTranscriptProjection, the native wait the
// other turn-start paths already use, 15 s per wait) and opens again; it gives up only after four
// waits or when the run is aborted, with the same structured error as before.

const ATTEMPT_OPEN_BEFORE = `	const sessionManager = guardSessionManager(attempt.sessionManager ?? (attempt.sessionTarget ? SessionManager.open(attempt.sessionTarget, input.effectiveCwd, {
		maxBytes: Math.min(67108864, Math.max(1024, (attempt.contextTokenBudget ?? 128e3) * 8)),
		maxEvents: 1e4
	}) : SessionManager.inMemory(input.effectiveCwd)), {`;
const ATTEMPT_OPEN_AFTER = `	const sessionManager = guardSessionManager(attempt.sessionManager ?? (attempt.sessionTarget ? await openAttemptSessionManagerWhenProjected(attempt.sessionTarget, input.effectiveCwd, {
		maxBytes: Math.min(67108864, Math.max(1024, (attempt.contextTokenBudget ?? 128e3) * 8)),
		maxEvents: 1e4
	}, input.abortSignal) : SessionManager.inMemory(input.effectiveCwd)), {`;
const ATTEMPT_PREPARE_ANCHOR = `async function prepareEmbeddedAttemptSessionManager(input) {`;
const ATTEMPT_HELPER = `${TRANSCRIPT_PROJECTION_CHECKPOINT_MARKER}: a turn that starts while its projection rebuilds waits for it instead of failing
async function openAttemptSessionManagerWhenProjected(target, cwd, limits, abortSignal) {
	for (let waits = 0;; waits += 1) {
		try {
			return SessionManager.open(target, cwd, limits);
		} catch (error) {
			if (error?.name !== "SessionTranscriptProjectionUnavailableError" || error.sessionId !== target.sessionId || waits >= 4) throw error;
		}
		abortSignal?.throwIfAborted();
		const { waitForSessionTranscriptProjection } = await import("./session-transcript-reconcile-DFsDtc9l.js");
		try {
			await waitForSessionTranscriptProjection(target, abortSignal);
		} catch (error) {
			if (error?.name !== "SessionTranscriptProjectionUnavailableError") throw error;
		}
		abortSignal?.throwIfAborted();
	}
}
${ATTEMPT_PREPARE_ANCHOR}`;

export function patchBuiltinAttemptOpenCheckpoint(source) {
  assert(!source.includes(TRANSCRIPT_PROJECTION_CHECKPOINT_MARKER), 'builtin-openclaw is already patched');
  let next = replaceExactlyOnce(source, ATTEMPT_OPEN_BEFORE, ATTEMPT_OPEN_AFTER, 'embedded attempt bounded open');
  next = replaceExactlyOnce(next, ATTEMPT_PREPARE_ANCHOR, ATTEMPT_HELPER, 'embedded attempt session manager');
  return next;
}
