import { c as isRecord } from "./record-coerce-DItp3I4t.js";
import { isDeepStrictEqual } from "node:util";
import { l as runSqliteDeferredTransactionSync } from "./node-sqlite-CL-d6drd.js";
import { a as iterateSqliteQuerySync, i as getNodeSqliteKysely, n as executeSqliteQuerySync, o as prepareSqliteQuerySync, r as executeSqliteQueryTakeFirstSync } from "./kysely-sync-DKYGT267.js";
import { c as scanSessionTranscriptTree, d as selectSessionTranscriptTreePathNodes, n as isSessionTranscriptLeafControl, o as parseSessionTranscriptTreeEntry, r as isSessionTranscriptSideAppendEntry, t as isCanonicalSessionTranscriptEntry } from "./transcript-tree-BH69pMSi.js";
//#region src/config/sessions/session-transcript-projection-rebuild.ts
function getProjectionKysely(db) {
	return getNodeSqliteKysely(db);
}
function readMessageText(message) {
	if (!message || typeof message !== "object" || Array.isArray(message)) return;
	const record = message;
	if (record.role !== "user" && record.role !== "assistant") return;
	if (typeof record.content === "string") return record.content.trim() || void 0;
	if (typeof record.text === "string") return record.text.trim() || void 0;
	if (!Array.isArray(record.content)) return;
	const parts = record.content.flatMap((block) => {
		if (!block || typeof block !== "object" || Array.isArray(block)) return [];
		const part = block;
		if (part.type !== "text" && part.type !== "input_text" && part.type !== "output_text") return [];
		return typeof part.text === "string" && part.text.trim() ? [part.text] : [];
	});
	return parts.length > 0 ? parts.join("\n") : void 0;
}
/** Extracts the searchable user/assistant text from one transcript event. */
function extractTranscriptIndexEntry(event, fallbackTimestamp) {
	if (!event || typeof event !== "object" || Array.isArray(event)) return;
	const record = event;
	if (record.type !== "message" || typeof record.id !== "string" || !record.id.trim()) return;
	const message = record.message;
	const role = message?.role;
	if (role !== "user" && role !== "assistant") return;
	const text = readMessageText(message);
	if (!text) return;
	const timestamp = typeof record.timestamp === "number" ? record.timestamp : typeof record.timestamp === "string" ? Date.parse(record.timestamp) : NaN;
	return {
		messageId: record.id.trim(),
		role,
		text,
		timestamp: Number.isFinite(timestamp) ? timestamp : fallbackTimestamp
	};
}
function hasTranscriptMessage(event) {
	return typeof event === "object" && event !== null && !Array.isArray(event) && Object.hasOwn(event, "message") && event.message !== void 0;
}
/** Control facts still belong in bounded context acquisition, even without a replay message. */
function transcriptEventContextEligibility(event) {
	return isRecord(event) && isRecord(event.message) && event.message.excludeFromContext === true ? 0 : 1;
}
/** Older same-version writers can leave a current watermark over unclassified rows. */
function hasUnclassifiedSessionTranscriptEvents(db, sessionId) {
	return executeSqliteQueryTakeFirstSync(db, getProjectionKysely(db).selectFrom("session_transcript_active_events").select("session_id").where("session_id", "=", sessionId).where("context_eligible", "is", null).limit(1)) !== void 0;
}
function shouldProjectActiveEvent(event) {
	if (!event || typeof event !== "object" || Array.isArray(event)) return false;
	if (event.type === "session") return false;
	return isCanonicalSessionTranscriptEntry(event) || parseSessionTranscriptTreeEntry(event) !== void 0 || hasTranscriptMessage(event);
}
/** Streams projection payloads; only navigation metadata is retained for branch resolution. */
function visitSessionTranscriptProjection(db, sessionId, visitor) {
	const kysely = getProjectionKysely(db);
	const session = executeSqliteQueryTakeFirstSync(db, kysely.selectFrom("session_windows").select("transcript_updated_at").where("session_id", "=", sessionId));
	if (!session) return;
	const query = kysely.selectFrom("transcript_events").select([
		"event_json",
		"seq",
		"created_at"
	]).where("session_id", "=", sessionId);
	let sourceIndexedSeq = -1;
	// transcript-projection-single-pass-v1: keep each row's projection facts from the tree pass instead of reading the path again
	const projectedRows = /* @__PURE__ */ new Map();
	const tree = scanSessionTranscriptTree((function* () {
		for (const row of iterateSqliteQuerySync(db, query.orderBy("seq", "asc"))) {
			sourceIndexedSeq = row.seq;
			const event = JSON.parse(row.event_json);
			const projectsActiveEvent = shouldProjectActiveEvent(event);
			projectedRows.set(row.seq, {
				seq: row.seq,
				indexed: extractTranscriptIndexEntry(event, row.created_at),
				projectsActiveEvent,
				projectsMessage: projectsActiveEvent && hasTranscriptMessage(event),
				contextEligible: projectsActiveEvent ? transcriptEventContextEligibility(event) : void 0
			});
			const navigation = { seq: row.seq };
			if (isRecord(event)) {
				for (const key of [
					"type",
					"id",
					"parentId",
					"targetId",
					"appendParentId",
					"appendMode"
				]) if (Object.hasOwn(event, key)) navigation[key] = event[key];
			}
			yield navigation;
		}
	})());
	if (sourceIndexedSeq < 0) return;
	const visiblePath = selectSessionTranscriptTreePathNodes(tree, tree.leafId);
	const rows = visiblePath.length > 0 ? (function* () {
		for (const node of visiblePath) {
			const projected = projectedRows.get(node.entry.seq);
			if (projected) yield projected;
		}
	})() : tree.hasLeafControl ? [] : projectedRows.values();
	let activeEventCount = 0;
	let activeMessageCount = 0;
	for (const row of rows) {
		if (row.indexed) visitor.ftsRow({ ...row.indexed });
		if (!row.projectsActiveEvent) continue;
		visitor.activeRow({
			activePosition: activeEventCount++,
			contextEligible: row.contextEligible,
			eventSeq: row.seq,
			messagePosition: row.projectsMessage ? activeMessageCount++ : null
		});
	}
	return {
		activeEventCount,
		activeMessageCount,
		leafEventId: tree.appendParentId,
		sessionId,
		sourceIndexedSeq,
		sourceTranscriptUpdatedAt: session.transcript_updated_at
	};
}
/** Reads and resolves one projection on a worker-owned SQLite snapshot. */
function prepareSessionTranscriptProjection(db, sessionId) {
	return runSqliteDeferredTransactionSync(db, () => {
		const activeRows = [];
		const ftsRows = [];
		const metadata = visitSessionTranscriptProjection(db, sessionId, {
			activeRow: (row) => activeRows.push(row),
			ftsRow: (row) => ftsRows.push(row)
		});
		return metadata ? {
			...metadata,
			activeRows,
			ftsRows
		} : void 0;
	}, {
		databaseLabel: "agent transcript projection",
		operationLabel: "sessions.transcript-index.prepare"
	});
}
function sourceSnapshotMatches(db, plan) {
	const kysely = getProjectionKysely(db);
	const session = executeSqliteQueryTakeFirstSync(db, kysely.selectFrom("session_windows").select("transcript_updated_at").where("session_id", "=", plan.sessionId));
	const latest = executeSqliteQueryTakeFirstSync(db, kysely.selectFrom("transcript_events").select("seq").where("session_id", "=", plan.sessionId).orderBy("seq", "desc").limit(1));
	return session?.transcript_updated_at === plan.sourceTranscriptUpdatedAt && latest?.seq === plan.sourceIndexedSeq;
}
function projectionClaimIsOwned(db, sessionId, claimId) {
	const row = executeSqliteQueryTakeFirstSync(db, getProjectionKysely(db).selectFrom("session_transcript_index_state").select(["needs_rebuild", "updated_at"]).where("session_id", "=", sessionId));
	return row?.needs_rebuild !== 0 && row?.updated_at === claimId;
}
/** Claims a prepared snapshot. Later chunks publish only while this claim remains current. */
function claimPreparedSessionTranscriptProjectionInTransaction(db, plan, claimId) {
	if (!sourceSnapshotMatches(db, plan)) return false;
	const kysely = getProjectionKysely(db);
	const current = executeSqliteQueryTakeFirstSync(db, kysely.selectFrom("session_transcript_index_state").select(["indexed_seq", "needs_rebuild"]).where("session_id", "=", plan.sessionId));
	if (current?.needs_rebuild === 0 && current.indexed_seq === plan.sourceIndexedSeq && !hasUnclassifiedSessionTranscriptEvents(db, plan.sessionId)) return false;
	executeSqliteQuerySync(db, kysely.insertInto("session_transcript_index_state").values({
		active_event_count: 0,
		active_message_count: 0,
		indexed_seq: -1,
		leaf_event_id: null,
		needs_rebuild: 1,
		session_id: plan.sessionId,
		updated_at: claimId
	}).onConflict((conflict) => conflict.column("session_id").doUpdateSet({
		active_event_count: 0,
		active_message_count: 0,
		indexed_seq: -1,
		leaf_event_id: null,
		needs_rebuild: 1,
		updated_at: claimId
	})));
	return true;
}
/** Deletes old rows in bounded rowid batches while the prepared claim is current. */
function deletePreparedSessionTranscriptProjectionChunkInTransaction(db, params) {
	if (!projectionClaimIsOwned(db, params.sessionId, params.claimId)) return {
		hasMore: false,
		owned: false
	};
	const kysely = getProjectionKysely(db);
	const active = Number(executeSqliteQuerySync(db, kysely.deleteFrom("session_transcript_active_events").where("rowid", "in", kysely.selectFrom("session_transcript_active_events").select("rowid").where("session_id", "=", params.sessionId).limit(params.maxRowsPerTable))).numAffectedRows ?? 0n);
	const fts = Number(executeSqliteQuerySync(db, kysely.deleteFrom("session_transcript_fts").where("rowid", "in", kysely.selectFrom("session_transcript_fts").select("rowid").where("session_id", "=", params.sessionId).limit(params.maxRowsPerTable))).numAffectedRows ?? 0n);
	return {
		hasMore: active === params.maxRowsPerTable || fts === params.maxRowsPerTable,
		owned: true
	};
}
/** Appends one bounded projection chunk while its claim remains current. */
function appendPreparedSessionTranscriptProjectionChunkInTransaction(db, params) {
	if (!projectionClaimIsOwned(db, params.sessionId, params.claimId)) return false;
	const kysely = getProjectionKysely(db);
	if (params.activeRows && params.activeRows.length > 0) executeSqliteQuerySync(db, kysely.insertInto("session_transcript_active_events").values(params.activeRows.map((row) => ({
		active_position: row.activePosition,
		context_eligible: row.contextEligible,
		event_seq: row.eventSeq,
		message_position: row.messagePosition,
		session_id: params.sessionId
	}))));
	if (params.ftsRows && params.ftsRows.length > 0) executeSqliteQuerySync(db, kysely.insertInto("session_transcript_fts").values(params.ftsRows.map((row) => ({
		message_id: row.messageId,
		role: row.role,
		session_id: params.sessionId,
		text: row.text,
		timestamp: row.timestamp
	}))));
	return true;
}
/** Publishes counts and the append cursor only if the transcript snapshot stayed current. */
function finalizePreparedSessionTranscriptProjectionInTransaction(db, plan, claimId) {
	if (!projectionClaimIsOwned(db, plan.sessionId, claimId) || !sourceSnapshotMatches(db, plan) || hasUnclassifiedSessionTranscriptEvents(db, plan.sessionId)) return false;
	executeSqliteQuerySync(db, getProjectionKysely(db).updateTable("session_transcript_index_state").set({
		active_event_count: plan.activeEventCount,
		active_message_count: plan.activeMessageCount,
		indexed_seq: plan.sourceIndexedSeq,
		leaf_event_id: plan.leafEventId,
		needs_rebuild: 0,
		updated_at: Date.now()
	}).where("session_id", "=", plan.sessionId).where("needs_rebuild", "!=", 0).where("updated_at", "=", claimId));
	return true;
}
//#endregion
//#region src/config/sessions/session-transcript-index.ts
const SYNC_REBUILD_MAX_ROWS = 4e3;
const SYNC_REBUILD_MAX_BYTES = 4194304;
function getIndexKysely(db) {
	return getNodeSqliteKysely(db);
}
/** Size the old projection and incoming rows before their owning transaction mutates either. */
function shouldRebuildSessionTranscriptIndexSynchronously(db, sessionId, events = []) {
	if (events.length > 4e3) return false;
	// transcript-projection-checkpoint-v1: same answer, but stop reading stored rows at the first exceeded limit
	let storedCount = 0;
	let bytes = 0;
	for (const row of iterateSqliteQuerySync(db, getIndexKysely(db).selectFrom("transcript_events").select((eb) => eb.fn("octet_length", ["event_json"]).as("event_bytes")).where("session_id", "=", sessionId).orderBy("seq", "asc").limit(4e3 - events.length + 1))) {
		storedCount += 1;
		if (storedCount + events.length > 4e3) return false;
		bytes += row.event_bytes ?? 0;
		if (bytes > 4194304) return false;
	}
	for (const event of events) {
		bytes += Buffer.byteLength(JSON.stringify(event), "utf8");
		if (bytes > 4194304) return false;
	}
	return true;
}
function readSessionTranscriptProjectionState(db, sessionId) {
	const row = executeSqliteQueryTakeFirstSync(db, getIndexKysely(db).selectFrom("session_transcript_index_state").select([
		"active_event_count",
		"active_message_count",
		"indexed_seq",
		"leaf_event_id",
		"needs_rebuild"
	]).where("session_id", "=", sessionId));
	if (!row) return;
	return {
		activeEventCount: row.active_event_count,
		activeMessageCount: row.active_message_count,
		indexedSeq: row.indexed_seq,
		leafEventId: row.leaf_event_id,
		needsRebuild: row.needs_rebuild !== 0
	};
}
function sessionTranscriptIndexNeedsReconcile(db, sessionId) {
	const latest = executeSqliteQueryTakeFirstSync(db, getIndexKysely(db).selectFrom("transcript_events").select("seq").where("session_id", "=", sessionId).orderBy("seq", "desc").limit(1));
	if (!latest) return false;
	const state = readSessionTranscriptProjectionState(db, sessionId);
	return !state || state.needsRebuild || state.indexedSeq !== latest.seq || hasUnclassifiedSessionTranscriptEvents(db, sessionId);
}
function createWatermarkWriter(db, sessionId, updateExisting = false) {
	return prepareSqliteQuerySync(db, (parameter) => {
		const kysely = getIndexKysely(db);
		const values = {
			active_event_count: parameter((row) => row.activeEventCount),
			active_message_count: parameter((row) => row.activeMessageCount),
			indexed_seq: parameter((row) => row.indexedSeq),
			leaf_event_id: parameter((row) => row.leafEventId),
			needs_rebuild: parameter((row) => row.needsRebuild ? 1 : 0),
			updated_at: parameter((row) => row.updatedAt)
		};
		return updateExisting ? kysely.updateTable("session_transcript_index_state").set(values).where("session_id", "=", sessionId) : kysely.insertInto("session_transcript_index_state").values({
			session_id: sessionId,
			...values
		}).onConflict((conflict) => conflict.column("session_id").doUpdateSet(values));
	});
}
function createActiveEventInserter(db, sessionId) {
	return prepareSqliteQuerySync(db, (parameter) => getIndexKysely(db).insertInto("session_transcript_active_events").values({
		session_id: sessionId,
		active_position: parameter((row) => row.activePosition),
		context_eligible: parameter((row) => row.contextEligible),
		event_seq: parameter((row) => row.eventSeq),
		message_position: parameter((row) => row.messagePosition)
	}));
}
function deleteActiveEventRows(db, sessionId) {
	executeSqliteQuerySync(db, getIndexKysely(db).deleteFrom("session_transcript_active_events").where("session_id", "=", sessionId));
}
function createFtsInserter(db, sessionId) {
	return prepareSqliteQuerySync(db, (parameter) => getIndexKysely(db).insertInto("session_transcript_fts").values({
		text: parameter((entry) => entry.text),
		session_id: sessionId,
		message_id: parameter((entry) => entry.messageId),
		role: parameter((entry) => entry.role),
		timestamp: parameter((entry) => entry.timestamp)
	}));
}
function deleteFtsRows(db, sessionId) {
	executeSqliteQuerySync(db, getIndexKysely(db).deleteFrom("session_transcript_fts").where("session_id", "=", sessionId));
}
/**
* In-transaction batch appender. Forward-indexes the event when it
* unambiguously extends the active branch and marks the session for rebuild
* otherwise. Runs inside the same write transaction as the event insert, so
* the index can never lag or tear relative to committed transcript rows.
* Retain only within a synchronous batch whose source cannot mutate this session.
*/
function createTranscriptIndexAppenderInTransaction(db, sessionId) {
	let watermark = readSessionTranscriptProjectionState(db, sessionId);
	let hasUnclassifiedEvents;
	let insertActiveEvent;
	let insertFts;
	let updateWatermark;
	return (params) => {
		if (!watermark) {
			if (params.seq !== 0) return true;
			applyForwardIndex(params);
			return false;
		}
		if (watermark.needsRebuild) return true;
		// transcript-projection-incremental-v1: appends keep the projected prefix; only unclassified rows need the full rebuild
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
		}
		if (isSessionTranscriptLeafControl(params.event) || isSessionTranscriptSideAppendEntry(params.event)) {
			watermark = markSessionTranscriptIndexAppendDirtyInTransaction(db, sessionId);
			return true;
		}
		const isCanonicalEvent = isCanonicalSessionTranscriptEntry(params.event);
		if (isCanonicalEvent && watermark.leafEventId === null && watermark.activeEventCount > 0) {
			watermark = markSessionTranscriptIndexAppendDirtyInTransaction(db, sessionId);
			return true;
		}
		const treeEntry = parseSessionTranscriptTreeEntry(params.event);
		if (!isCanonicalEvent && watermark.leafEventId !== null && shouldProjectActiveEvent(params.event)) {
			watermark = markSessionTranscriptIndexAppendDirtyInTransaction(db, sessionId);
			return true;
		}
		if (treeEntry && treeEntry.parentId !== watermark.leafEventId) {
			watermark = markSessionTranscriptIndexAppendDirtyInTransaction(db, sessionId);
			return true;
		}
		applyForwardIndex(params);
		return false;
	};
	function applyForwardIndex(params) {
		const entry = extractTranscriptIndexEntry(params.event, params.createdAt);
		if (entry) {
			insertFts ??= createFtsInserter(db, sessionId);
			insertFts(entry);
		}
		const projectsActiveEvent = shouldProjectActiveEvent(params.event);
		const projectsMessage = projectsActiveEvent && hasTranscriptMessage(params.event);
		if (projectsActiveEvent) {
			insertActiveEvent ??= createActiveEventInserter(db, sessionId);
			insertActiveEvent({
				activePosition: watermark?.activeEventCount ?? 0,
				contextEligible: transcriptEventContextEligibility(params.event),
				eventSeq: params.seq,
				messagePosition: projectsMessage ? watermark?.activeMessageCount ?? 0 : null
			});
		}
		const advancesLeaf = params.eventId !== null && isCanonicalSessionTranscriptEntry(params.event);
		const nextWatermark = {
			activeEventCount: (watermark?.activeEventCount ?? 0) + (projectsActiveEvent ? 1 : 0),
			activeMessageCount: (watermark?.activeMessageCount ?? 0) + (projectsMessage ? 1 : 0),
			indexedSeq: params.seq,
			leafEventId: advancesLeaf ? params.eventId : watermark?.leafEventId ?? null,
			needsRebuild: false,
			updatedAt: params.createdAt
		};
		(watermark ? updateWatermark ??= createWatermarkWriter(db, sessionId, true) : createWatermarkWriter(db, sessionId))(nextWatermark);
		watermark = nextWatermark;
	}
}
// transcript-projection-checkpoint-v1: exact rewrites that leave the tree and every projected fact unchanged
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
/** Marks one session for lazy rebuild without touching its FTS rows. */
function markSessionTranscriptIndexDirtyInTransaction(db, sessionId) {
	const now = Date.now();
	const watermark = readSessionTranscriptProjectionState(db, sessionId);
	const dirty = {
		activeEventCount: watermark?.activeEventCount ?? 0,
		activeMessageCount: watermark?.activeMessageCount ?? 0,
		indexedSeq: watermark?.indexedSeq ?? -1,
		leafEventId: watermark?.leafEventId ?? null,
		needsRebuild: true
	};
	createWatermarkWriter(db, sessionId)({
		...dirty,
		updatedAt: now
	});
	return dirty;
}
// transcript-projection-incremental-v1: rebuild from the last valid projection
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
/** In-transaction delete hook: drops index rows alongside transcript rows. */
function deleteSessionTranscriptIndexInTransaction(db, sessionId) {
	deleteFtsRows(db, sessionId);
	deleteActiveEventRows(db, sessionId);
	executeSqliteQuerySync(db, getIndexKysely(db).deleteFrom("session_transcript_index_state").where("session_id", "=", sessionId));
}
/**
* Rebuilds one session's index from its full event set: drops existing FTS
* rows, indexes the resolved active branch, and resets the watermark to the
* same append parent the accessor's next append will resolve.
*/
function rebuildSessionTranscriptIndexInTransaction(db, sessionId) {
	deleteFtsRows(db, sessionId);
	deleteActiveEventRows(db, sessionId);
	const projection = visitSessionTranscriptProjection(db, sessionId, {
		activeRow: createActiveEventInserter(db, sessionId),
		ftsRow: createFtsInserter(db, sessionId)
	});
	if (!projection) return;
	createWatermarkWriter(db, sessionId)({
		activeEventCount: projection.activeEventCount,
		activeMessageCount: projection.activeMessageCount,
		indexedSeq: projection.sourceIndexedSeq,
		leafEventId: projection.leafEventId,
		needsRebuild: false,
		updatedAt: Date.now()
	});
}
/** Rebuilds one lagging projection under its current write transaction. */
function reconcileSessionTranscriptIndexInTransaction(db, sessionId) {
	if (!executeSqliteQueryTakeFirstSync(db, getIndexKysely(db).selectFrom("transcript_events").select("seq").where("session_id", "=", sessionId).orderBy("seq", "desc").limit(1))) {
		deleteSessionTranscriptIndexInTransaction(db, sessionId);
		return false;
	}
	if (!sessionTranscriptIndexNeedsReconcile(db, sessionId)) return false;
	rebuildSessionTranscriptIndexInTransaction(db, sessionId);
	return true;
}
/**
* Sessions whose index needs reconcile work: flagged rebuilds, transcripts
* that gained rows without index state (doctor imports), and watermarks
* behind the newest row. Ordered for deterministic reconcile passes.
*/
function listSessionsNeedingTranscriptIndexReconcile(db) {
	const kysely = getIndexKysely(db);
	return executeSqliteQuerySync(db, kysely.selectFrom("session_windows").innerJoin("transcript_events as latest", (join) => join.onRef("latest.session_id", "=", "session_windows.session_id").on((eb) => eb("latest.seq", "=", eb.selectFrom("transcript_events as candidate").select("candidate.seq").whereRef("candidate.session_id", "=", "session_windows.session_id").orderBy("candidate.seq", "desc").limit(1)))).leftJoin("session_transcript_index_state as st", "st.session_id", "session_windows.session_id").select("session_windows.session_id").where((eb) => eb.or([
		eb(eb.fn.coalesce("st.needs_rebuild", eb.val(1)), "!=", 0),
		eb("latest.seq", ">", eb.fn.coalesce("st.indexed_seq", eb.val(-1))),
		eb.exists(eb.selectFrom("session_transcript_active_events as pending").select("pending.session_id").whereRef("pending.session_id", "=", "session_windows.session_id").where("pending.context_eligible", "is", null))
	])).orderBy("session_windows.session_id")).rows.flatMap((row) => typeof row.session_id === "string" ? [row.session_id] : []);
}
/** Drops index rows for sessions whose transcript rows are gone. */
function deleteOrphanedTranscriptIndexRowsInTransaction(db) {
	const kysely = getIndexKysely(db);
	executeSqliteQuerySync(db, kysely.deleteFrom("session_transcript_active_events").where("session_id", "not in", kysely.selectFrom("transcript_events").select("session_id").distinct()));
	executeSqliteQuerySync(db, kysely.deleteFrom("session_transcript_fts").where("session_id", "not in", kysely.selectFrom("transcript_events").select("session_id").distinct()));
	executeSqliteQuerySync(db, kysely.deleteFrom("session_transcript_index_state").where("session_id", "not in", kysely.selectFrom("transcript_events").select("session_id").distinct()));
}
//#endregion
export { deleteSessionTranscriptIndexInTransaction as a, reconcileSessionTranscriptIndexInTransaction as c, appendPreparedSessionTranscriptProjectionChunkInTransaction as d, claimPreparedSessionTranscriptProjectionInTransaction as f, prepareSessionTranscriptProjection as g, hasUnclassifiedSessionTranscriptEvents as h, deleteOrphanedTranscriptIndexRowsInTransaction as i, sessionTranscriptIndexNeedsReconcile as l, finalizePreparedSessionTranscriptProjectionInTransaction as m, SYNC_REBUILD_MAX_ROWS as n, listSessionsNeedingTranscriptIndexReconcile as o, deletePreparedSessionTranscriptProjectionChunkInTransaction as p, createTranscriptIndexAppenderInTransaction as r, markSessionTranscriptIndexDirtyInTransaction as s, SYNC_REBUILD_MAX_BYTES as t, shouldRebuildSessionTranscriptIndexSynchronously as u, planCurrentProjectionAcrossExactRewriteInTransaction as v, applyCurrentProjectionAcrossExactRewriteInTransaction as w, prepareIncrementalSessionTranscriptProjection as x, applyIncrementalSessionTranscriptProjectionInTransaction as y };
