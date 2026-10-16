import assert from 'node:assert/strict';

// Projection rebuild continues from the last valid projection instead of re-reading the session.
//
// After #405 the projection still goes dirty on appends the forward index cannot place: a branch
// (parentId is not the leaf), a rewind or switch (leaf control), a side append. A dirty projection
// was always rebuilt from the session root: the reconcile Worker read and parsed every row
// (25,951 rows / 171 MB for 7da00997) and the main thread deleted and re-inserted every active and
// FTS row in 512-row transactions, while every projection reader saw "rebuilding" for 2-6 s.
//
// Every append that marks the projection dirty leaves the rows the projection was built from
// (seq <= indexed_seq) untouched, and the dirty mark keeps the old active rows and counts. Those
// appends now record needs_rebuild = 2 ("dirty, prefix intact"). Every other writer that marks
// dirty (a rewrite that changes the tree or a projected fact, an event-json update, a full replace,
// unclassified rows, schema migration, data written before this patch) leaves needs_rebuild = 1,
// and any write while the projection is 2 that goes through those writers turns it into 1.
//
// For needs_rebuild = 2 the reconcile Worker first plans a delta inside one read snapshot:
//   1. replay scanSessionTranscriptNavigation over the rows after indexed_seq only, with the scan
//      state at indexed_seq taken from the old projection: appendParentId is its leaf_event_id,
//      leafId is the id of the newest leaf-setting row at or before indexed_seq (a canonical
//      non-side row, found by reading back from indexed_seq; it must be the last active row),
//      and the latest reset, if any, must lie on the old active path (then a node on that path
//      descends from it exactly when its position is not before the reset's);
//   2. walk from the new leaf up through the new nodes until the first node of the old active path
//      (the junction, which may lie before or after the latest compaction checkpoint) or the root;
//   3. the new projection is the old active rows up to the junction plus the new path nodes, with
//      their FTS entries and facts computed exactly as visitSessionTranscriptProjection does; the
//      FTS rows of old path nodes after the junction are removed by rowid.
// Whenever the replay would need a fact it cannot prove from the new rows and the old active path
// (a reset or an invalid leaf control among the new rows, a reference to a node that is neither
// new nor on the old path, a missing identity, an old projection whose shape does not match its
// state, a delta above 4,000 rows), there is no delta and the session gets the full rebuild as
// before. The main thread applies a delta in one writer transaction after re-checking that the
// source snapshot and the dirty state are the ones the delta was planned from; otherwise the
// Worker falls back to the full rebuild of that session.

export const TRANSCRIPT_PROJECTION_INCREMENTAL_MARKER = '// transcript-projection-incremental-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

// ---- session-transcript-index chunk ----

const APPENDER_START = 'function createTranscriptIndexAppenderInTransaction(db, sessionId) {';
const APPENDER_END = '\tfunction applyForwardIndex(params) {';
const APPENDER_FIRST_BEFORE = `		if (params.seq !== watermark.indexedSeq + 1 || (hasUnclassifiedEvents ??= hasUnclassifiedSessionTranscriptEvents(db, sessionId))) {
			watermark = markSessionTranscriptIndexDirtyInTransaction(db, sessionId);
			return true;
		}`;
const APPENDER_FIRST_AFTER = `		${TRANSCRIPT_PROJECTION_INCREMENTAL_MARKER}: appends keep the projected prefix; only unclassified rows need the full rebuild
		if (params.seq !== watermark.indexedSeq + 1 && (hasUnclassifiedEvents ??= hasUnclassifiedSessionTranscriptEvents(db, sessionId))) {
			watermark = markSessionTranscriptIndexDirtyInTransaction(db, sessionId);
			return true;
		}
		if (params.seq !== watermark.indexedSeq + 1) {
			watermark = markSessionTranscriptIndexAppendDirtyInTransaction(db, sessionId);
			return true;
		}
		if (hasUnclassifiedEvents ??= hasUnclassifiedSessionTranscriptEvents(db, sessionId)) {
			watermark = markSessionTranscriptIndexDirtyInTransaction(db, sessionId);
			return true;
		}`;
const APPENDER_MARK = '			watermark = markSessionTranscriptIndexDirtyInTransaction(db, sessionId);';
const APPENDER_MARK_APPEND = '			watermark = markSessionTranscriptIndexAppendDirtyInTransaction(db, sessionId);';

const MARK_ANCHOR = `/** In-transaction delete hook: drops index rows alongside transcript rows. */`;
const INCREMENTAL = `${TRANSCRIPT_PROJECTION_INCREMENTAL_MARKER}: rebuild from the last valid projection
const PROJECTION_APPEND_DIRTY = 2;
const INCREMENTAL_MAX_DELTA_ROWS = 4e3;
const INCREMENTAL_MAX_LEAF_LOOKBACK_ROWS = 256;
/** Marks dirty after an append the forward index cannot place; rows up to indexed_seq are untouched. */
function markSessionTranscriptIndexAppendDirtyInTransaction(db, sessionId) {
	const dirty = markSessionTranscriptIndexDirtyInTransaction(db, sessionId);
	executeSqliteQuerySync(db, getIndexKysely(db).updateTable("session_transcript_index_state").set({ needs_rebuild: PROJECTION_APPEND_DIRTY }).where("session_id", "=", sessionId).where("needs_rebuild", "=", 1));
	return dirty;
}
class IncrementalProjectionUnavailable extends Error {}
function incrementalUnavailable() {
	throw new IncrementalProjectionUnavailable();
}
/** Plans the projection after the rows appended since a still-valid projection; undefined means rebuild in full. */
function prepareIncrementalSessionTranscriptProjection(db, sessionId) {
	return runSqliteDeferredTransactionSync(db, () => {
		try {
			return planIncrementalSessionTranscriptProjection(db, sessionId);
		} catch (error) {
			if (error instanceof IncrementalProjectionUnavailable) return;
			throw error;
		}
	}, {
		databaseLabel: "agent transcript projection",
		operationLabel: "sessions.transcript-index.prepare-delta"
	});
}
function planIncrementalSessionTranscriptProjection(db, sessionId) {
	const kysely = getIndexKysely(db);
	const stateRow = executeSqliteQueryTakeFirstSync(db, kysely.selectFrom("session_transcript_index_state").select([
		"indexed_seq",
		"leaf_event_id",
		"needs_rebuild",
		"active_event_count",
		"active_message_count"
	]).where("session_id", "=", sessionId));
	if (!stateRow || stateRow.needs_rebuild !== PROJECTION_APPEND_DIRTY || !(stateRow.indexed_seq >= 0) || !(stateRow.active_event_count > 0)) return;
	const session = executeSqliteQueryTakeFirstSync(db, kysely.selectFrom("session_windows").select("transcript_updated_at").where("session_id", "=", sessionId));
	if (!session) return;
	const baseSeq = stateRow.indexed_seq;
	const latest = executeSqliteQueryTakeFirstSync(db, kysely.selectFrom("transcript_events").select("seq").where("session_id", "=", sessionId).orderBy("seq", "desc").limit(1));
	if (!latest || latest.seq <= baseSeq) return;
	const oldCount = stateRow.active_event_count;
	const shape = db.prepare("SELECT count(*) AS n, max(active_position) AS max_position, max(event_seq) AS max_seq FROM session_transcript_active_events WHERE session_id = ?").get(sessionId);
	if (shape.n !== oldCount || shape.max_position !== oldCount - 1 || shape.max_seq > baseSeq) return;
	if (hasUnclassifiedSessionTranscriptEvents(db, sessionId)) return;
	const identityStatement = db.prepare("SELECT seq FROM transcript_event_identities WHERE session_id = ? AND event_id = ?");
	const positionStatement = db.prepare("SELECT active_position FROM session_transcript_active_events WHERE session_id = ? AND event_seq = ?");
	const oldPositions = /* @__PURE__ */ new Map();
	/** Position on the old active path, or undefined when the id is not an old node (new rows are not old nodes). */
	const oldPosition = (id) => {
		if (oldPositions.has(id)) return oldPositions.get(id);
		const identity = identityStatement.get(sessionId, id);
		let position;
		if (identity && identity.seq <= baseSeq) position = positionStatement.get(sessionId, identity.seq)?.active_position;
		// An old node off the active path, or an id without an identity row, cannot be proven from here.
		if (identity === void 0 || identity.seq <= baseSeq && position === void 0) incrementalUnavailable();
		oldPositions.set(id, position);
		return position;
	};
	const lastActive = db.prepare("SELECT i.event_id AS event_id FROM session_transcript_active_events a JOIN transcript_event_identities i ON i.session_id = a.session_id AND i.seq = a.event_seq WHERE a.session_id = ? AND a.active_position = ?").get(sessionId, oldCount - 1);
	if (!lastActive) return;
	let leafId;
	let lookback = 0;
	for (const row of db.prepare("SELECT event_json FROM transcript_events WHERE session_id = ? AND seq <= ? ORDER BY seq DESC").iterate(sessionId, baseSeq)) {
		if (++lookback > INCREMENTAL_MAX_LEAF_LOOKBACK_ROWS) return;
		const event = JSON.parse(row.event_json);
		if (isSessionTranscriptLeafControl(event)) return;
		const explicitEntry = parseSessionTranscriptTreeEntry(event);
		if (explicitEntry) {
			if (explicitEntry.leafId !== void 0) {
				leafId = explicitEntry.leafId;
				break;
			}
			continue;
		}
		if (isCanonicalSessionTranscriptEntry(event) && !Object.hasOwn(event, "parentId") && event.appendMode !== "side" && typeof event.id === "string" && event.id.trim()) return;
	}
	if (leafId === void 0 || leafId !== lastActive.event_id) return;
	const latestReset = db.prepare("SELECT event_id, seq FROM transcript_event_identities WHERE session_id = ? AND event_type = 'reset' AND seq <= ? ORDER BY seq DESC LIMIT 1").get(sessionId, baseSeq);
	const resetPosition = latestReset ? oldPosition(latestReset.event_id) : void 0;
	if (latestReset && resetPosition === void 0) return;
	let appendParentId = stateRow.leaf_event_id;
	const newNodes = /* @__PURE__ */ new Map();
	const newResetDescendants = /* @__PURE__ */ new Set();
	const known = (id) => {
		if (id === null) return true;
		if (newNodes.has(id)) return true;
		if (oldPosition(id) !== void 0) return true;
		// A new row that is not (yet) a node: the scan would not know it at this point.
		incrementalUnavailable();
	};
	const isResetDescendant = (id) => {
		if (newNodes.has(id)) return newResetDescendants.has(id);
		const position = oldPosition(id);
		if (position === void 0) incrementalUnavailable();
		return resetPosition !== void 0 && position >= resetPosition;
	};
	const resolveCanonicalParent = (parentId) => {
		const seen = /* @__PURE__ */ new Set();
		let currentId = parentId;
		while (currentId !== null) {
			if (seen.has(currentId)) return currentId;
			seen.add(currentId);
			const parent = newNodes.get(currentId);
			if (!parent || !isSessionTranscriptLeafControl(parent.entry)) return currentId;
			currentId = parent.parentId;
		}
		return null;
	};
	const newRows = /* @__PURE__ */ new Map();
	for (const row of db.prepare("SELECT seq, event_json, created_at FROM transcript_events WHERE session_id = ? AND seq > ? ORDER BY seq ASC").iterate(sessionId, baseSeq)) {
		const entry = JSON.parse(row.event_json);
		newRows.set(row.seq, {
			entry,
			createdAt: row.created_at
		});
		const navigation = { seq: row.seq };
		if (isRecord(entry)) {
			for (const key of [
				"type",
				"id",
				"parentId",
				"targetId",
				"appendParentId",
				"appendMode"
			]) if (Object.hasOwn(entry, key)) navigation[key] = entry[key];
		}
		if (isRecord(navigation) && navigation.type === "reset") return;
		let explicitTreeEntry = parseSessionTranscriptTreeEntry(navigation);
		if (resetPosition !== void 0 && leafId !== null && explicitTreeEntry?.leafId !== void 0 && isSessionTranscriptLeafControl(navigation) && (explicitTreeEntry.leafId === null || !isResetDescendant(explicitTreeEntry.leafId))) explicitTreeEntry = {
			...explicitTreeEntry,
			parentId: leafId,
			leafId,
			appendParentId: leafId
		};
		if (explicitTreeEntry?.leafId !== void 0 && isSessionTranscriptLeafControl(navigation) && (!known(explicitTreeEntry.leafId) || !known(explicitTreeEntry.appendParentId))) return;
		let treeEntry = explicitTreeEntry ?? (isCanonicalSessionTranscriptEntry(navigation) && !Object.hasOwn(navigation, "parentId") ? (() => {
			const id = typeof navigation.id === "string" && navigation.id.trim() ? navigation.id : void 0;
			return id ? {
				id,
				parentId: leafId,
				leafId: navigation.appendMode === "side" ? void 0 : id,
				appendParentId: id,
				...navigation.appendMode === "side" ? { appendMode: navigation.appendMode } : {}
			} : void 0;
		})() : void 0);
		if (treeEntry && isCanonicalSessionTranscriptEntry(navigation)) {
			// The parent is a node the scan knows (stale parents need ids this replay cannot vouch for).
			if (explicitTreeEntry && treeEntry.parentId !== null) known(treeEntry.parentId);
			const normalizedParentId = resolveCanonicalParent(resetPosition !== void 0 && treeEntry.appendMode !== "side" && (treeEntry.parentId === null || !isResetDescendant(treeEntry.parentId)) ? leafId : explicitTreeEntry && treeEntry.appendMode !== "side" && treeEntry.parentId === appendParentId && leafId !== appendParentId ? leafId : treeEntry.parentId);
			if (normalizedParentId !== treeEntry.parentId) treeEntry = {
				...treeEntry,
				parentId: normalizedParentId
			};
		}
		if (!treeEntry) continue;
		if (newNodes.has(treeEntry.id) || oldPositions.get(treeEntry.id) !== void 0) return;
		const node = {
			...treeEntry,
			entry: navigation,
			seq: row.seq
		};
		newNodes.set(node.id, node);
		if (resetPosition !== void 0 && node.parentId !== null && isResetDescendant(node.parentId)) newResetDescendants.add(node.id);
		appendParentId = node.appendParentId;
		if (node.leafId !== void 0) leafId = node.leafId;
	}
	if (leafId === null) return;
	const path = [];
	const seen = /* @__PURE__ */ new Set();
	let junction = -1;
	let currentId = leafId;
	while (currentId) {
		if (seen.has(currentId)) return;
		seen.add(currentId);
		const node = newNodes.get(currentId);
		if (node) {
			if (!isSessionTranscriptLeafControl(node.entry)) path.push(node);
			currentId = node.parentId;
			continue;
		}
		const position = oldPosition(currentId);
		if (position === void 0) return;
		junction = position;
		break;
	}
	path.reverse();
	if (junction < 0 && path.length === 0) return;
	const removed = oldCount - (junction + 1);
	if (removed + path.length > INCREMENTAL_MAX_DELTA_ROWS) return;
	const messageBase = db.prepare("SELECT count(message_position) AS n FROM session_transcript_active_events WHERE session_id = ? AND active_position <= ? AND message_position IS NOT NULL").get(sessionId, junction).n;
	const activeRows = [];
	const ftsRows = [];
	let activeEventCount = junction + 1;
	let activeMessageCount = messageBase;
	for (const node of path) {
		const source = newRows.get(node.seq);
		const event = source.entry;
		const indexed = extractTranscriptIndexEntry(event, source.createdAt);
		if (indexed) ftsRows.push({ ...indexed });
		if (!shouldProjectActiveEvent(event)) continue;
		const projectsMessage = hasTranscriptMessage(event);
		activeRows.push({
			activePosition: activeEventCount++,
			contextEligible: transcriptEventContextEligibility(event),
			eventSeq: node.seq,
			messagePosition: projectsMessage ? activeMessageCount++ : null
		});
	}
	let removedFtsRowids = [];
	if (removed > 0) {
		const removedIds = new Set(db.prepare("SELECT i.event_id AS event_id FROM session_transcript_active_events a JOIN transcript_event_identities i ON i.session_id = a.session_id AND i.seq = a.event_seq WHERE a.session_id = ? AND a.active_position > ?").all(sessionId, junction).map((row) => row.event_id));
		for (const row of db.prepare("SELECT rowid AS id, message_id FROM session_transcript_fts WHERE session_id = ?").iterate(sessionId)) if (removedIds.has(row.message_id)) removedFtsRowids.push(row.id);
	}
	return {
		kind: "delta",
		sessionId,
		baseIndexedSeq: baseSeq,
		baseActiveEventCount: oldCount,
		keepActiveEventCount: junction + 1,
		removedFtsRowids,
		activeRows,
		ftsRows,
		activeEventCount,
		activeMessageCount,
		leafEventId: appendParentId,
		sourceIndexedSeq: latest.seq,
		sourceTranscriptUpdatedAt: session.transcript_updated_at
	};
}
/** Publishes a delta in one writer transaction when the session and its dirty state are unchanged since the plan. */
function applyIncrementalSessionTranscriptProjectionInTransaction(db, plan) {
	if (plan?.kind !== "delta" || !sourceSnapshotMatches(db, plan)) return false;
	const current = db.prepare("SELECT indexed_seq, needs_rebuild, active_event_count FROM session_transcript_index_state WHERE session_id = ?").get(plan.sessionId);
	if (!current || current.needs_rebuild !== PROJECTION_APPEND_DIRTY || current.indexed_seq !== plan.baseIndexedSeq || current.active_event_count !== plan.baseActiveEventCount) return false;
	if (db.prepare("SELECT count(*) AS n FROM session_transcript_active_events WHERE session_id = ?").get(plan.sessionId).n !== plan.baseActiveEventCount) return false;
	db.prepare("DELETE FROM session_transcript_active_events WHERE session_id = ? AND active_position >= ?").run(plan.sessionId, plan.keepActiveEventCount);
	const deleteFts = db.prepare("DELETE FROM session_transcript_fts WHERE rowid = ? AND session_id = ?");
	for (const rowid of plan.removedFtsRowids) deleteFts.run(rowid, plan.sessionId);
	const insertActive = db.prepare("INSERT INTO session_transcript_active_events (session_id, active_position, event_seq, message_position, context_eligible) VALUES (?, ?, ?, ?, ?)");
	for (const row of plan.activeRows) insertActive.run(plan.sessionId, row.activePosition, row.eventSeq, row.messagePosition, row.contextEligible);
	const insertFts = db.prepare("INSERT INTO session_transcript_fts (text, session_id, message_id, role, timestamp) VALUES (?, ?, ?, ?, ?)");
	for (const row of plan.ftsRows) insertFts.run(row.text, plan.sessionId, row.messageId, row.role, row.timestamp);
	db.prepare("UPDATE session_transcript_index_state SET active_event_count = ?, active_message_count = ?, indexed_seq = ?, leaf_event_id = ?, needs_rebuild = 0, updated_at = ? WHERE session_id = ?").run(plan.activeEventCount, plan.activeMessageCount, plan.sourceIndexedSeq, plan.leafEventId, Date.now(), plan.sessionId);
	return true;
}
${MARK_ANCHOR}`;

const INDEX_EXPORT_BEFORE = `planCurrentProjectionAcrossExactRewriteInTransaction as v, applyCurrentProjectionAcrossExactRewriteInTransaction as w };`;
const INDEX_EXPORT_AFTER = `planCurrentProjectionAcrossExactRewriteInTransaction as v, applyCurrentProjectionAcrossExactRewriteInTransaction as w, prepareIncrementalSessionTranscriptProjection as x, applyIncrementalSessionTranscriptProjectionInTransaction as y };`;

export function patchTranscriptIndexIncremental(source) {
  assert(!source.includes(TRANSCRIPT_PROJECTION_INCREMENTAL_MARKER), 'session-transcript-index is already patched');
  const start = source.indexOf(APPENDER_START);
  const end = source.indexOf(APPENDER_END, start);
  assert(start >= 0 && end > start, 'Expected the transcript index appender');
  let appender = replaceExactlyOnce(source.slice(start, end), APPENDER_FIRST_BEFORE, APPENDER_FIRST_AFTER, 'appender watermark gap check');
  // the remaining dirty marks of the appender: leaf control, side append, leaf-less canonical row, non-canonical projected row, branch
  const head = appender.slice(0, appender.indexOf(`		if (hasUnclassifiedEvents ??= hasUnclassifiedSessionTranscriptEvents(db, sessionId)) {`));
  let tail = appender.slice(head.length);
  const firstMarkEnd = tail.indexOf(APPENDER_MARK) + APPENDER_MARK.length;
  const rest = tail.slice(firstMarkEnd);
  assert.equal(rest.split(APPENDER_MARK).length, 5, 'Expected four more appender dirty marks');
  tail = tail.slice(0, firstMarkEnd) + rest.split(APPENDER_MARK).join(APPENDER_MARK_APPEND);
  appender = head + tail;
  let next = source.slice(0, start) + appender + source.slice(end);
  next = replaceExactlyOnce(next, MARK_ANCHOR, INCREMENTAL, 'index delete hook anchor');
  next = replaceExactlyOnce(next, INDEX_EXPORT_BEFORE, INDEX_EXPORT_AFTER, 'index export list');
  return next;
}

// ---- reconcile Worker: plan a delta first ----

const WORKER_IMPORT_BEFORE = `import { g as prepareSessionTranscriptProjection, o as listSessionsNeedingTranscriptIndexReconcile } from "../../session-transcript-index-9itOio9h.js";`;
const WORKER_IMPORT_AFTER = `import { g as prepareSessionTranscriptProjection, o as listSessionsNeedingTranscriptIndexReconcile, x as prepareIncrementalSessionTranscriptProjection } from "../../session-transcript-index-9itOio9h.js";`;
const WORKER_LOOP_BEFORE = `		for (const sessionId of sessionIds) {
			const plan = prepareSessionTranscriptProjection(database.db, sessionId);`;
const WORKER_LOOP_AFTER = `		for (const sessionId of sessionIds) {
			${TRANSCRIPT_PROJECTION_INCREMENTAL_MARKER}: a projection whose prefix is intact continues from it; anything else rebuilds in full
			const delta = prepareIncrementalSessionTranscriptProjection(database.db, sessionId);
			if (delta && await postAndWait({
				type: "delta-plan",
				plan: delta
			})) continue;
			const plan = prepareSessionTranscriptProjection(database.db, sessionId);`;

export function patchTranscriptReconcileWorkerIncremental(source) {
  assert(!source.includes(TRANSCRIPT_PROJECTION_INCREMENTAL_MARKER), 'reconcile worker is already patched');
  let next = replaceExactlyOnce(source, WORKER_IMPORT_BEFORE, WORKER_IMPORT_AFTER, 'worker index import');
  next = replaceExactlyOnce(next, WORKER_LOOP_BEFORE, WORKER_LOOP_AFTER, 'worker session loop');
  return next;
}

// ---- reconcile owner (main thread): apply a delta in one writer transaction ----

const RECONCILE_IMPORT_BEFORE = `m as finalizePreparedSessionTranscriptProjectionInTransaction, o as listSessionsNeedingTranscriptIndexReconcile, p as deletePreparedSessionTranscriptProjectionChunkInTransaction } from "./session-transcript-index-9itOio9h.js";`;
const RECONCILE_IMPORT_AFTER = `m as finalizePreparedSessionTranscriptProjectionInTransaction, o as listSessionsNeedingTranscriptIndexReconcile, p as deletePreparedSessionTranscriptProjectionChunkInTransaction, y as applyIncrementalSessionTranscriptProjectionInTransaction } from "./session-transcript-index-9itOio9h.js";`;
const RECONCILE_HANDLER_BEFORE = `			try {
				if (message.type === "plan-start") {`;
const RECONCILE_HANDLER_AFTER = `			try {
				${TRANSCRIPT_PROJECTION_INCREMENTAL_MARKER}: a delta is small; it is published in one writer transaction or refused
				if (message.type === "delta-plan") {
					if (active) throw new Error("session transcript reconcile worker sent a delta during a plan");
					const applied = await runProjectionWrite(databaseOptions, "sessions.transcript-index.delta", (database) => applyIncrementalSessionTranscriptProjectionInTransaction(database.db, message.plan));
					if (applied) reconciledSessions += 1;
					continueProjectionWorker(worker, applied);
					return;
				}
				if (message.type === "plan-start") {`;

export function patchTranscriptReconcileIncremental(source) {
  assert(!source.includes(TRANSCRIPT_PROJECTION_INCREMENTAL_MARKER), 'reconcile is already patched');
  let next = replaceExactlyOnce(source, RECONCILE_IMPORT_BEFORE, RECONCILE_IMPORT_AFTER, 'reconcile index import');
  next = replaceExactlyOnce(next, RECONCILE_HANDLER_BEFORE, RECONCILE_HANDLER_AFTER, 'reconcile message handler');
  return next;
}
