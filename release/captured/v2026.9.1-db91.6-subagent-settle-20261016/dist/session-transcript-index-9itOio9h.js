import { c as isRecord } from "./record-coerce-DItp3I4t.js";
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
	const stored = executeSqliteQueryTakeFirstSync(db, getIndexKysely(db).selectFrom("transcript_events").select((eb) => [eb.fn.countAll().as("event_count"), eb.fn.sum(eb.fn("octet_length", ["event_json"])).as("event_bytes")]).where("session_id", "=", sessionId));
	if ((stored?.event_count ?? 0) + events.length > 4e3) return false;
	let bytes = stored?.event_bytes ?? 0;
	if (bytes > 4194304) return false;
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
		if (params.seq !== watermark.indexedSeq + 1 || (hasUnclassifiedEvents ??= hasUnclassifiedSessionTranscriptEvents(db, sessionId))) {
			watermark = markSessionTranscriptIndexDirtyInTransaction(db, sessionId);
			return true;
		}
		if (isSessionTranscriptLeafControl(params.event) || isSessionTranscriptSideAppendEntry(params.event)) {
			watermark = markSessionTranscriptIndexDirtyInTransaction(db, sessionId);
			return true;
		}
		const isCanonicalEvent = isCanonicalSessionTranscriptEntry(params.event);
		if (isCanonicalEvent && watermark.leafEventId === null && watermark.activeEventCount > 0) {
			watermark = markSessionTranscriptIndexDirtyInTransaction(db, sessionId);
			return true;
		}
		const treeEntry = parseSessionTranscriptTreeEntry(params.event);
		if (!isCanonicalEvent && watermark.leafEventId !== null && shouldProjectActiveEvent(params.event)) {
			watermark = markSessionTranscriptIndexDirtyInTransaction(db, sessionId);
			return true;
		}
		if (treeEntry && treeEntry.parentId !== watermark.leafEventId) {
			watermark = markSessionTranscriptIndexDirtyInTransaction(db, sessionId);
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
export { deleteSessionTranscriptIndexInTransaction as a, reconcileSessionTranscriptIndexInTransaction as c, appendPreparedSessionTranscriptProjectionChunkInTransaction as d, claimPreparedSessionTranscriptProjectionInTransaction as f, prepareSessionTranscriptProjection as g, hasUnclassifiedSessionTranscriptEvents as h, deleteOrphanedTranscriptIndexRowsInTransaction as i, sessionTranscriptIndexNeedsReconcile as l, finalizePreparedSessionTranscriptProjectionInTransaction as m, SYNC_REBUILD_MAX_ROWS as n, listSessionsNeedingTranscriptIndexReconcile as o, deletePreparedSessionTranscriptProjectionChunkInTransaction as p, createTranscriptIndexAppenderInTransaction as r, markSessionTranscriptIndexDirtyInTransaction as s, SYNC_REBUILD_MAX_BYTES as t, shouldRebuildSessionTranscriptIndexSynchronously as u };
