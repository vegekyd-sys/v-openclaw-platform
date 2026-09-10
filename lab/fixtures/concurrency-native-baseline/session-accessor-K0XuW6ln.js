import { I as resolveTimestampMsToIsoString } from "./number-coercion-CLj0HTDM.js";
import "./src-vebZIeLe.js";
import { a as asOptionalRecord, c as isRecord } from "./record-coerce-DItp3I4t.js";
import { n as safeParseJsonRecord, t as safeParseJson } from "./json-coercion-ighRFv8Y.js";
import { t as stableStringify } from "./stable-stringify-C8X7niaI.js";
import { y as uniqueStrings } from "./string-normalization-DiSb4JeN.js";
import { r as createLazyRuntimeModule } from "./lazy-runtime-CgCh8H_K.js";
import { n as getRuntimeConfig } from "./io.runtime-CKu7Rw0j.js";
import { t as pruneMapToMaxSize } from "./map-size-CNcWiFKu.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { l as runSqliteDeferredTransactionSync } from "./node-sqlite-CL-d6drd.js";
import { a as iterateSqliteQuerySync, i as getNodeSqliteKysely, n as executeSqliteQuerySync, r as executeSqliteQueryTakeFirstSync } from "./kysely-sync-DKYGT267.js";
import { D as tryResolveLegacyCompatibilityAgentId, o as listAgentIds, t as AgentSelectionRequiredError } from "./agent-scope-config-CUiGBd59.js";
import { n as ok, t as err } from "./result-BQGgYouL.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { O as parseAgentSessionKey, c as classifySessionKeyShape, f as resolveAgentIdFromSessionKey } from "./session-key-CRjxKW0X.js";
import { t as isIncognitoSessionKey } from "./incognito-session-key-BwpD1Lwd.js";
import { o as resolveSessionStorePathCore } from "./paths-DDTeIhCT.js";
import "./legacy.default-agent-owner-BMzvJbjU.js";
import { A as resolveSessionAuthProfileOverrideSource, T as hasSessionActiveAutoModelFallback } from "./agent-scope-CSlN0kZb.js";
import { r as resolvePersistedSessionStoreOwnerForTarget } from "./session-store-owner-Df_uY3tv.js";
import "./io-Des9Xfzj.js";
import { c as getAgentEventLifecycleGeneration } from "./agent-events-Con5xUCM.js";
import { t as lazyCompile } from "./protocol-validator-DRYaCHvd.js";
import { r as SessionsGoalMutationResultSchema } from "./sessions-goal-BMLWNsjS.js";
import { C as ensureSessionGoalOperationsSchema, E as hasSessionPendingInputsSchema, S as SESSION_GOAL_OPERATIONS_TABLE, T as hasPendingInputConsumptionColumn, b as ensureSessionParticipantsSchema, j as parseSqliteSessionEntryRecord, w as ensureSessionPendingInputsSchema, y as confirmSessionParticipantsSchemaEnsured } from "./openclaw-agent-db-maintenance-DYSkzMMg.js";
import { r as resolveOpenClawAgentSqlitePath } from "./openclaw-agent-db.paths-DYna80bS.js";
import { c as deferOpenClawAgentPostCommitPublication, g as openOpenClawAgentDatabase, y as runOpenClawAgentWriteTransaction } from "./openclaw-agent-db-CUTe8BX6.js";
import { d as sessionDeliveryChannel, f as sessionDeliveryOrigin, l as normalizeSessionDeliveryState, n as deliveryContextFromSession } from "./delivery-context.shared-DlcU69m_.js";
import { l as withOwnedSessionTranscriptWriterFence, n as assertOwnedTranscriptWriteCommit, o as getOwnedSessionTranscriptWriterFence, s as runWithOwnedSessionTranscriptWrite, t as SessionTranscriptWriterClaimReboundError } from "./transcript-write-context-mhuh2Sos.js";
import { t as redactIdentifier } from "./redact-identifier-BRudYwZN.js";
import { c as normalizeUsage, n as derivePromptTokens } from "./usage-CtmV8Xxq.js";
import { u as selectResetKeptEntries } from "./tool-result-pairing-B40RoFjc.js";
import { A as readTranscriptStatsSync, D as readTranscriptIdentityByEventId, E as readTranscriptEventRows, I as projectModelContextNavigationSql, L as projectTranscriptNavigationSql, M as SessionTranscriptReadFenceError, N as resolveSqliteSessionTranscriptReadFence, O as readTranscriptSnapshot, T as readTranscriptEventMessage, a as readMessageIdempotencyKey, c as redactTranscriptMessageForStorage, f as createSessionTranscriptHeader, i as ensureTranscriptHeader, l as replaceSqliteTranscriptEventsInTransaction, m as findTranscriptEventInDatabase, n as appendTranscriptEventsInTransaction, o as readTranscriptMessageByEventId, s as readTranscriptMessageByScopedIdempotencyKey, t as appendTranscriptEventInTransaction, u as rewriteSqliteTranscriptEventRowsInTransaction, y as loadTranscriptEventsFromDatabase } from "./session-accessor.sqlite-transcript-store-DV0WFe1a.js";
import { n as withOpenClawAgentDatabaseReadOnly } from "./openclaw-agent-db-readonly-wb-jdztx.js";
import { O as isInternalSessionEffectsKey, T as preserveSqliteSameKeySessionRolloverLineage, _ as replaceSessionEntry, b as resolveSessionKeyBySessionId, d as loadSessionEntry, f as loadSessionEntryReadOnly, p as patchSessionEntryCore, w as resolveSessionStorePathForScope } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { A as registerSessionPendingInputOwner, D as projectSessionPendingInput, E as parseSessionPendingInputMessage, F as runPreparedSqliteSessionWrite, I as runSqliteSessionDeletionTransaction, L as withSqliteSessionDeletions, M as resolveSessionPendingInputAppend, N as runWithSessionPendingInput, O as readSessionPendingInputByKey, P as runWithSessionPendingInputPersistence, T as consumeSessionPendingInput, Y as sqliteSessionEntriesEqual, _ as rehomeSessionWindows, c as readExactSessionEntryJson, f as readSessionEntryCount, g as readSessionIdentitySnapshot, h as readSessionEntryStore, i as deleteSessionEntryRows, j as releaseSessionPendingInputOwner, k as readSessionPendingInputOwnerIds, l as readExactSessionEntryRow, m as readSessionEntrySelectionSnapshot, n as deleteLegacySessionEntryRows, o as normalizeLifecycleTarget, p as readSessionEntryRow, q as assertLifecycleTargetSnapshotUnchanged, s as parseReadableSqliteSessionEntryRow, u as readExactSessionEntryRowValidated, v as resolveLifecyclePrimaryEntry, y as writeSessionEntry } from "./session-accessor.sqlite-entry-store-VfW3gyuj.js";
import { c as projectCanonicalSessionEntryShape, l as stripRuntimeOnlySessionSkillsFields } from "./store-writer-state-_Y6b9Vjm.js";
import { a as normalizeStoreSessionKey, s as resolveSessionStoreEntryCore, t as collectSessionEntryLookupKeys } from "./store-entry-CMuTqREZ.js";
import { a as normalizeSqliteSessionKey, c as resolveSqliteScope, d as resolveSqliteTranscriptReadScope, f as resolveSqliteTranscriptScope, i as getSessionKysely, l as resolveSqliteStoreScope, m as toDatabaseOptions, n as formatLegacySqliteSessionMarkerForScope, o as readSqliteTranscriptStoreBatches, p as runExclusiveSqliteSessionWrite, r as formatSqliteSessionReferenceForScope, s as resolveSqliteReadScope, t as cloneSessionEntry, u as resolveSqliteTranscriptArchiveDirectory } from "./session-accessor.sqlite-scope-BwPKGcgm.js";
import { D as readSessionEntriesByStatus, E as parseSessionEntryJson, I as projectSqliteSessionOwner, N as mergeParticipantAggregate, P as participantIdentityNamespace, S as publishSessionEntryCacheInvalidation, g as scanCanonicalSqliteSessionEntries, i as ensureTranscriptSessionRoot, o as readTranscriptGenerationInTransaction, p as assertCanonicalSqliteSessionKeysCurrent, v as coerceSqliteNumber, w as trackSessionEntryCacheWrite } from "./session-accessor.sqlite-transcript-state-Cz9g7S9v.js";
import { n as buildSessionCreationStamp } from "./session-entry-provenance-Ch9ZRplR.js";
import { a as applySessionEntryMaintenance, c as emitCommittedLifecycleIdentityMutations, f as emitSessionLifecycleEvent, l as emitCommittedSessionEntryRemovals, o as finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort, u as emitCommittedSessionIdentityDiff } from "./session-history-eviction-d5aiCsHS.js";
import { r as materializeSessionStateDeletePlans } from "./session-accessor.sqlite-archive-CuBPV-IT.js";
import { n as emitSessionTranscriptUpdate, s as resolveTerminalAssistantTranscriptRunId, t as attachSessionTranscriptRunId } from "./transcript-events-BMaG3A_w.js";
import { g as emitArchivedTranscriptUpdates, h as publishSessionStateArchives, i as deletePlannedLifecycleArtifactEntries, l as projectSessionEntryLifecycleMutation, m as prunePublishedSessionArchivesByRetention, n as collectProjectedReferencedSessionIds, p as shouldRemoveSessionEntry, r as deleteMaterializedSessionStatePlans, s as planSessionStateAfterEntryRemoval, t as assertPlannedLifecycleArtifactEntriesUnchanged } from "./session-accessor.sqlite-lifecycle-state-CrB_K2kA.js";
import { a as mergeSessionTranscriptVisiblePathWithOpaqueAppendPath, c as scanSessionTranscriptTree, d as selectSessionTranscriptTreePathNodes, n as isSessionTranscriptLeafControl, o as parseSessionTranscriptTreeEntry } from "./transcript-tree-BH69pMSi.js";
import { c as reconcileSessionTranscriptIndexInTransaction, h as hasUnclassifiedSessionTranscriptEvents, l as sessionTranscriptIndexNeedsReconcile, s as markSessionTranscriptIndexDirtyInTransaction } from "./session-transcript-index-9itOio9h.js";
import { s as resolveMaintenanceConfig } from "./disk-budget-BzLS0kmH.js";
import { o as resolveFreshSessionTotalTokens, r as mergeSessionEntry } from "./types-BHV0IaPK.js";
import "./server-constants-BW5URgqP.js";
import { t as extractAssistantPhaseText } from "./chat-message-content-Dws_XUEQ.js";
import { r as startSessionTranscriptIndexReconcile } from "./session-transcript-reconcile-j5qhAafV.js";
import { a as resolveStoredSessionOwnerAgentId } from "./session-store-key-DVtVp9hU.js";
import { f as hasPluginHostCleanupTarget, h as shouldSkipPluginHostCleanupStore, i as resolveAccessStorePath, m as matchesPluginHostCleanupSession, p as isLockedHarnessSessionOwnedByPlugin, s as resolveSessionEntrySelection, t as listSessionEntriesCore, u as clearPluginHostCleanupTarget } from "./session-accessor.entry-B8arwR7t.js";
import { i as readExactSessionEntryRowForCanonicalRepair } from "./session-accessor.sqlite-canonical-repair-COu8B2os.js";
import { f as resolveAgentHarnessSessionStoreError, p as resolveAgentHarnessSessionStoreTransitionError } from "./agent-harness-session-key-CLRQddqz.js";
import { o as buildSessionResetBoundaryEvent } from "./session-accessor.sqlite-lifecycle-dtL0ZEAl.js";
import { n as MODEL_SELECTION_LOCKED_PARENT_FORK_MESSAGE, o as assertModelSelectionUnlocked } from "./model-overrides-Bm7jo7Di.js";
import { t as clearAllCliSessions } from "./cli-session-binding-Aa6nlDa8.js";
import "./session-accessor.sqlite-owner-YLlCtkcm.js";
import { h as readUserProfileAliases } from "./user-profiles-ftXkbNlK.js";
import { t as chunkItems } from "./chunk-items-2QWieLm-.js";
import { l as sameRestartRecoveryTerminalRunIds, o as mergeRestartRecoveryTerminalRunIds } from "./restart-recovery-state-xVcgAuHK.js";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import crypto, { createHash, randomUUID } from "node:crypto";
import { sql } from "kysely";
import { Buffer as Buffer$1 } from "node:buffer";
//#region src/config/sessions/session-accessor.pending-inputs.ts
const receiptOwners = /* @__PURE__ */ new WeakMap();
function ownerReceipt(owner) {
	const receipt = {
		state: "queued",
		inputId: owner.inputId,
		message: parseSessionPendingInputMessage(owner.messageJson),
		run: (operation) => runWithSessionPendingInput(owner, operation),
		finish: owner.finish
	};
	receiptOwners.set(receipt, owner);
	return receipt;
}
/** Install only a private receipt's persistence context; this does not reopen execution authority. */
function withSessionPendingInputPersistence(receipt, persist) {
	const owner = receiptOwners.get(receipt);
	return owner ? runWithSessionPendingInputPersistence(owner, persist) : receipt.run(persist);
}
/** Bind one collected message to its private admitted sources without creating another durable queue. */
function bindSessionPendingInputSources(receipts, message) {
	const sources = [...new Set(receipts.flatMap((receipt) => {
		if (receipt.state === "consumed") throw new Error("Collected input has already been consumed");
		const owner = receiptOwners.get(receipt);
		return owner ? owner.sources ?? [owner] : [];
	}))];
	const first = sources[0];
	if (!first) return;
	const idempotencyKey = readMessageIdempotencyKey(message);
	if (!idempotencyKey || sources.some((source) => source.databasePath !== first.databasePath || source.sessionId !== first.sessionId || source.sessionKey !== first.sessionKey || source.idempotencyKey === idempotencyKey)) throw new Error("Collected input requires one exact session and a distinct aggregate identity");
	const messageJson = JSON.stringify(redactTranscriptMessageForStorage(message, { config: sources.at(-1)?.config }));
	if (Buffer.byteLength(messageJson, "utf8") > 26214400) throw new Error("Collected input exceeds the Gateway payload limit");
	return ownerReceipt({
		...first,
		inputId: randomUUID(),
		idempotencyKey,
		messageJson,
		sources,
		finish: (disposition) => {
			const failures = [];
			for (const source of sources) try {
				source.finish(disposition);
			} catch (error) {
				failures.push(error);
			}
			if (failures.length) throw new AggregateError(failures, "Failed to finish collected input custody");
		}
	});
}
/** Accept durable input without changing the active transcript or scheduling execution. */
async function stageSessionPendingInput(scope, options) {
	const resolved = resolveSqliteTranscriptScope(scope);
	const databaseOptions = toDatabaseOptions(resolved);
	const idempotencyKey = readMessageIdempotencyKey(options.message);
	if (!idempotencyKey || !options.runId) throw new Error("Pending input requires an exact run and message idempotency key");
	const { timestamp: _timestamp, ...stableMessage } = options.message;
	if (Buffer.byteLength(JSON.stringify(stableMessage), "utf8") > 26214400) throw new Error("Pending input exceeds the Gateway payload limit");
	const requestHash = createHash("sha256").update(stableStringify(stableMessage)).digest("hex");
	return runExclusiveSqliteSessionWrite(resolved, async () => {
		options.assertCurrent();
		const database = openOpenClawAgentDatabase(databaseOptions);
		if (readSessionEntryRow(database, resolved.sessionKey)?.entry.sessionId !== scope.sessionId) return;
		const existing = readSessionPendingInputByKey(database, resolved, idempotencyKey);
		if (existing) {
			if (existing.request_hash !== requestHash || existing.run_id !== options.runId) throw new Error("Pending input idempotency key conflicts with the accepted input");
			if (existing.consumed_event_id != null) return {
				state: "consumed",
				inputId: existing.input_id,
				message: parseSessionPendingInputMessage(existing.message_json),
				run: () => {
					throw new Error("Pending input has already been consumed");
				},
				finish: () => {}
			};
			if (existing.state !== "queued" || !readSessionPendingInputOwnerIds(database, [existing]).has(existing.input_id)) throw new Error("Pending input ownership ended; submit a new turn to continue");
			throw new Error("Pending input is already admitted; wait for its current turn");
		}
		const committed = readTranscriptMessageByScopedIdempotencyKey(database, resolved, idempotencyKey, "scan");
		if (committed) return {
			state: "queued",
			inputId: committed.messageId,
			message: parseSessionPendingInputMessage(JSON.stringify(committed.message)),
			run: (operation) => operation(),
			finish: () => {}
		};
		const prepared = options.prepareMessageAfterIdempotencyCheck ? options.prepareMessageAfterIdempotencyCheck(options.message) : options.message;
		if (!prepared) return;
		const message = redactTranscriptMessageForStorage(prepared, { config: options.config });
		const messageJson = JSON.stringify(message);
		if (Buffer.byteLength(messageJson, "utf8") > 26214400) throw new Error("Approved pending input exceeds the Gateway payload limit");
		const inputId = randomUUID();
		const lifecycleGeneration = getAgentEventLifecycleGeneration();
		ensureSessionPendingInputsSchema(database.db);
		if (!runOpenClawAgentWriteTransaction((current) => {
			options.assertCurrent();
			if (readSessionEntryRow(current, resolved.sessionKey)?.entry.sessionId !== scope.sessionId) return false;
			executeSqliteQuerySync(current.db, getSessionKysely(current.db).insertInto("session_pending_inputs").values({
				input_id: inputId,
				session_key: resolved.sessionKey,
				session_id: scope.sessionId,
				idempotency_key: idempotencyKey,
				run_id: options.runId,
				request_hash: requestHash,
				message_json: messageJson,
				lifecycle_generation: lifecycleGeneration,
				state: "queued",
				accepted_at: Date.now()
			}));
			return true;
		}, databaseOptions)) return;
		let finished = false;
		const owner = {
			inputId,
			sessionId: scope.sessionId,
			sessionKey: resolved.sessionKey,
			databasePath: database.path,
			idempotencyKey,
			lifecycleGeneration,
			messageJson,
			config: options.config,
			assertCurrent: options.assertCurrent,
			finish: (disposition) => {
				if (finished) return;
				finished = true;
				releaseSessionPendingInputOwner(owner);
				runOpenClawAgentWriteTransaction((current) => {
					executeSqliteQuerySync(current.db, getSessionKysely(current.db).updateTable("session_pending_inputs").set({ state: disposition }).where("input_id", "=", inputId).where("state", "=", "queued").where("consumed_event_id", "is", null));
				}, databaseOptions);
			}
		};
		registerSessionPendingInputOwner(owner);
		return ownerReceipt(owner);
	});
}
/** Record lost custody at its read boundary without resuming a pre-restart execution. */
function readPendingInputRows(scope, options) {
	const resolved = resolveSqliteTranscriptScope(scope);
	const databaseOptions = toDatabaseOptions(resolved);
	const limit = Math.max(1, Math.min(20, Math.trunc(options.limit ?? 20)));
	const result = withOpenClawAgentDatabaseReadOnly((database) => {
		if (!hasSessionPendingInputsSchema(database.db)) return {
			rows: [],
			total: 0,
			staleIds: [],
			nextBefore: void 0
		};
		const db = getSessionKysely(database.db);
		let base = db.selectFrom("session_pending_inputs").where("session_key", "=", resolved.sessionKey).where("session_id", "=", scope.sessionId);
		if (hasPendingInputConsumptionColumn(database.db)) base = base.where("consumed_event_id", "is", null);
		const total = executeSqliteQueryTakeFirstSync(database.db, base.select(db.fn.count("input_id").as("total")))?.total ?? 0;
		let query = base.orderBy("seq", "desc").limit(limit + 1);
		if (options.before !== void 0) query = query.where("seq", "<", options.before);
		if (options.id !== void 0) query = query.where("input_id", "=", options.id);
		const metadata = executeSqliteQuerySync(database.db, query.select(["seq", sql`OCTET_LENGTH(message_json)`.as("serialized_bytes")])).rows;
		const selected = [];
		let bytes = 0;
		for (const row of metadata) {
			if (selected.length === limit || bytes + row.serialized_bytes > 26214400) break;
			selected.push(row.seq);
			bytes += row.serialized_bytes;
		}
		if (metadata.length && !selected.length) throw new Error("Stored pending input exceeds the Gateway payload limit");
		const rows = selected.length ? executeSqliteQuerySync(database.db, base.selectAll().where("seq", "in", selected).orderBy("seq", "desc")).rows : [];
		const ownedIds = readSessionPendingInputOwnerIds(database, rows);
		return {
			rows,
			total,
			staleIds: rows.filter((row) => row.state === "queued" && !ownedIds.has(row.input_id)).map((row) => row.input_id),
			nextBefore: selected.length < metadata.length ? selected.at(-1) : void 0
		};
	}, databaseOptions);
	if (!result.found) return {
		rows: [],
		total: 0
	};
	const snapshot = result.value;
	if (snapshot.staleIds.length) {
		const interrupted = runOpenClawAgentWriteTransaction((database) => {
			const db = getSessionKysely(database.db);
			const candidates = executeSqliteQuerySync(database.db, db.selectFrom("session_pending_inputs").selectAll().where("input_id", "in", snapshot.staleIds).where("state", "=", "queued").where("consumed_event_id", "is", null)).rows;
			const ownedIds = readSessionPendingInputOwnerIds(database, candidates);
			const ids = candidates.flatMap((row) => ownedIds.has(row.input_id) ? [] : [row.input_id]);
			if (ids.length) executeSqliteQuerySync(database.db, db.updateTable("session_pending_inputs").set({ state: "interrupted" }).where("input_id", "in", ids).where("consumed_event_id", "is", null));
			return new Set(ids);
		}, databaseOptions);
		for (const row of snapshot.rows) if (interrupted.has(row.input_id)) row.state = "interrupted";
	}
	return {
		rows: snapshot.rows,
		total: snapshot.total,
		nextBefore: snapshot.nextBefore
	};
}
function listSessionPendingInputs(scope, options = {}) {
	const { rows, total, nextBefore } = readPendingInputRows(scope, options);
	return {
		items: rows.toReversed().map(projectSessionPendingInput),
		total,
		...nextBefore !== void 0 ? { nextBefore } : {}
	};
}
function readSessionPendingInput(scope, id) {
	const row = readPendingInputRows(scope, {
		id,
		limit: 1
	}).rows[0];
	return row ? projectSessionPendingInput(row) : void 0;
}
/** Bounded display reconciliation; these durable correlations never authorize replay. */
function listSessionPendingInputReceipts(scope, options) {
	if (options.runIds.length > 50) throw new Error("Pending input receipt lookup accepts at most 50 run IDs");
	const runIds = [...new Set(options.runIds)];
	if (!runIds.length) return [];
	const resolved = resolveSqliteTranscriptScope(scope);
	const result = withOpenClawAgentDatabaseReadOnly((database) => {
		if (!hasSessionPendingInputsSchema(database.db) || !hasPendingInputConsumptionColumn(database.db)) return [];
		const rows = executeSqliteQuerySync(database.db, getSessionKysely(database.db).selectFrom("session_pending_inputs").select(["run_id", "consumed_event_id"]).where("session_key", "=", resolved.sessionKey).where("session_id", "=", scope.sessionId).where("run_id", "in", runIds).orderBy("seq", "asc").limit(51)).rows;
		if (rows.length > 50 || new Set(rows.map((row) => row.run_id)).size !== rows.length) throw new Error("Pending input receipt lookup has ambiguous source run IDs");
		return rows.map((row) => row.consumed_event_id == null ? {
			runId: row.run_id,
			state: "pending"
		} : {
			runId: row.run_id,
			state: "consumed",
			consumedByEventId: row.consumed_event_id
		});
	}, toDatabaseOptions(resolved));
	return result.found ? result.value : [];
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-entry-availability.ts
/** Exact persisted-key probe that preserves database and row availability. */
function loadExactSessionEntryReadOnlyResult(scope) {
	const sessionKey = scope.sessionKey.trim();
	if (!sessionKey) return {
		found: true,
		value: void 0
	};
	const resolved = resolveSqliteScope(scope);
	let result;
	try {
		result = withOpenClawAgentDatabaseReadOnly((database) => {
			const entry = readExactSessionEntryRowValidated(database, sessionKey)?.entry;
			return {
				entry,
				rowExists: entry ? true : Boolean(executeSqliteQueryTakeFirstSync(database.db, getSessionKysely(database.db).selectFrom("session_nodes").select("session_key").where("session_key", "=", sessionKey)))
			};
		}, toDatabaseOptions(resolved));
	} catch (error) {
		if (error instanceof Error && error.code === "SESSION_CANONICAL_KEY_MIGRATION_REQUIRED") return {
			found: false,
			reason: "row-invalid"
		};
		throw error;
	}
	if (!result.found) return result;
	if (!result.value.entry) return result.value.rowExists ? {
		found: false,
		reason: "row-invalid"
	} : {
		found: true,
		value: void 0
	};
	return {
		found: true,
		value: {
			sessionKey,
			entry: result.value.entry
		}
	};
}
const SESSION_IDENTITY_EVIDENCE_QUERY_CHUNK_SIZE = 400;
function readSessionIdentityEvidenceRows(database, items) {
	assertCanonicalSqliteSessionKeysCurrent(database);
	const db = getSessionKysely(database.db);
	const rowsByKey = /* @__PURE__ */ new Map();
	const readChunks = (values, column) => {
		for (let offset = 0; offset < values.length; offset += SESSION_IDENTITY_EVIDENCE_QUERY_CHUNK_SIZE) {
			const chunk = values.slice(offset, offset + SESSION_IDENTITY_EVIDENCE_QUERY_CHUNK_SIZE);
			const rows = executeSqliteQuerySync(database.db, db.selectFrom("session_nodes").select([
				"current_session_id",
				"entry_json",
				"entry_valid",
				"session_key",
				"updated_at"
			]).where(column, "in", chunk)).rows;
			for (const row of rows) rowsByKey.set(row.session_key, row);
		}
	};
	readChunks([...new Set(items.flatMap((item) => item.sessionKey ? [item.sessionKey] : []))], "session_key");
	readChunks([...new Set(items.map((item) => item.sessionId))], "current_session_id");
	const rowsBySessionId = /* @__PURE__ */ new Map();
	const readableKeys = /* @__PURE__ */ new Set();
	for (const row of rowsByKey.values()) {
		const rows = rowsBySessionId.get(row.current_session_id) ?? [];
		rows.push(row);
		rowsBySessionId.set(row.current_session_id, rows);
		if (row.entry_valid === 1) try {
			if (parseReadableSqliteSessionEntryRow(database, row)) readableKeys.add(row.session_key);
		} catch {}
	}
	return items.map((item) => {
		const exactRow = item.sessionKey ? rowsByKey.get(item.sessionKey) : void 0;
		if (exactRow && exactRow.entry_valid !== -1 && !readableKeys.has(exactRow.session_key)) return {
			status: "unknown",
			reason: "row-invalid"
		};
		if (exactRow && readableKeys.has(exactRow.session_key) && exactRow.current_session_id === item.sessionId) return {
			status: "current",
			sessionKey: exactRow.session_key
		};
		const fallbackRows = rowsBySessionId.get(item.sessionId) ?? [];
		if (fallbackRows.length !== 1) return fallbackRows.length === 0 ? { status: "absent" } : {
			status: "unknown",
			reason: "ambiguous"
		};
		const fallbackRow = fallbackRows[0];
		if (fallbackRow?.entry_valid === 1 && readableKeys.has(fallbackRow.session_key)) return {
			status: "current",
			sessionKey: fallbackRow.session_key
		};
		return fallbackRow?.entry_valid === -1 ? { status: "absent" } : {
			status: "unknown",
			reason: "row-invalid"
		};
	});
}
/** Reads indexed identity evidence once per physical store and in SQLite-sized chunks. */
function readSessionIdentityEvidenceBatch(probes) {
	const results = probes.map(() => ({
		status: "unknown",
		reason: "read-failed"
	}));
	const groups = /* @__PURE__ */ new Map();
	const targetCache = /* @__PURE__ */ new Map();
	for (const [index, probe] of probes.entries()) try {
		const resolved = resolveSqliteReadScope(probe, targetCache);
		const options = toDatabaseOptions(resolved);
		const databasePath = resolveOpenClawAgentSqlitePath(options);
		const group = groups.get(databasePath) ?? {
			items: [],
			options
		};
		group.items.push({
			index,
			sessionId: probe.sessionId,
			sessionKey: resolved.sessionKey
		});
		groups.set(databasePath, group);
	} catch {}
	for (const group of groups.values()) {
		let read;
		try {
			read = withOpenClawAgentDatabaseReadOnly((database) => readSessionIdentityEvidenceRows(database, group.items), group.options);
		} catch {
			continue;
		}
		if (read.found) {
			for (const [itemIndex, item] of group.items.entries()) results[item.index] = read.value[itemIndex] ?? {
				status: "unknown",
				reason: "read-failed"
			};
			continue;
		}
		const unavailable = read.reason === "database-missing" ? { status: "absent" } : {
			status: "unknown",
			reason: read.reason
		};
		for (const item of group.items) results[item.index] = unavailable;
	}
	return results;
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-replacement-projection.ts
async function applySqliteSessionEntryReplacementProjection(params, normalize) {
	const resolved = resolveSqliteScope({
		...params.agentId ? { agentId: params.agentId } : {},
		sessionKey: params.activeSessionKey ?? params.sessionKeys?.[0] ?? "",
		storePath: params.storePath
	});
	const preparedWrite = await runPreparedSqliteSessionWrite(resolved, async () => {
		const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
		const selectedKeys = params.sessionKeys ? new Set(params.sessionKeys) : void 0;
		const selectedStatuses = params.statuses ? new Set(params.statuses) : void 0;
		const readLabelOwnerKeys = (db = database.db) => params.includeLabelOwners === void 0 ? [] : executeSqliteQuerySync(db, getSessionKysely(db).selectFrom("session_nodes").select("session_key").where("label", "=", params.includeLabelOwners).orderBy("session_key")).rows.map((row) => row.session_key);
		const labelOwnerKeys = readLabelOwnerKeys();
		const selected = selectedStatuses ? readSessionEntriesByStatus(database, [...selectedStatuses], params.sessionKeys) : selectedKeys ? uniqueStrings([...selectedKeys, ...labelOwnerKeys]).map((sessionKey) => ({ sessionKey })) : Object.keys(readSessionEntryStore(database)).map((sessionKey) => ({ sessionKey }));
		const expectedRows = /* @__PURE__ */ new Map();
		const entries = selected.flatMap(({ sessionKey }) => {
			const row = readExactSessionEntryRow(database, sessionKey);
			if (!row) {
				if (!selectedKeys || selectedStatuses) throw new Error(`SQLite session entry changed before replacement for ${sessionKey}`);
				return [];
			}
			if (selectedStatuses && (!row.entry.status || !selectedStatuses.has(row.entry.status))) return [];
			expectedRows.set(sessionKey, row);
			return [{
				entry: cloneSessionEntry(row.entry),
				sessionKey
			}];
		});
		const replacementAuthorityKeys = selectedStatuses ? new Set(entries.map(({ sessionKey }) => sessionKey)) : selectedKeys;
		const operation = await params.update(entries);
		const replacements = normalize(operation.replacements);
		const claimedCanonicalKeys = /* @__PURE__ */ new Set();
		for (const replacement of replacements) {
			const previousSessionKeys = replacement.previousSessionKeys;
			const canonical = previousSessionKeys !== void 0;
			if (canonical && !replacement.sessionKey) throw new Error("Session entry replacement requires a key");
			if (canonical && [replacement.sessionKey, ...previousSessionKeys ?? []].some(isInternalSessionEffectsKey)) throw new Error("Session entry canonical replacement cannot target internal effects rows");
			for (const sessionKey of [replacement.sessionKey, ...previousSessionKeys ?? []]) {
				if (replacementAuthorityKeys && !replacementAuthorityKeys.has(sessionKey)) throw new Error(`Session entry replacement is outside the selected ${selectedStatuses ? "row" : "key"} set: ${sessionKey}`);
				if (canonical) {
					if (claimedCanonicalKeys.has(sessionKey)) throw new Error(`Session entry replacements overlap at ${sessionKey}`);
					claimedCanonicalKeys.add(sessionKey);
				}
			}
			if (canonical) {
				for (const previousSessionKey of previousSessionKeys) if (!expectedRows.has(previousSessionKey)) throw new Error(`Session entry canonical projection cannot replace missing alias ${previousSessionKey}`);
			}
		}
		const applicable = replacements.filter((replacement) => replacement.previousSessionKeys || expectedRows.has(replacement.sessionKey));
		if (params.requireWriteSuccess && replacements.length > 0 && applicable.length === 0) throw new Error("session entry replacements did not persist any rows");
		if (applicable.length === 0) return {
			deletedEntries: [],
			commit: () => ({
				maintenancePlans: [],
				result: operation.result
			})
		};
		const mutationKeys = new Set(applicable.flatMap((replacement) => [replacement.sessionKey, ...replacement.previousSessionKeys ?? []]));
		const validationKeys = /* @__PURE__ */ new Set([...mutationKeys, ...labelOwnerKeys]);
		const maintenancePlans = [];
		const previous = /* @__PURE__ */ new Map();
		const current = /* @__PURE__ */ new Map();
		return {
			deletedEntries: [...mutationKeys].flatMap((sessionKey) => {
				const entry = expectedRows.get(sessionKey)?.entry;
				return entry && !applicable.some((replacement) => replacement.sessionKey === sessionKey) ? [{
					entry,
					sessionKey
				}] : [];
			}),
			commit: () => {
				runSqliteSessionDeletionTransaction((transactionDb) => {
					if (params.includeLabelOwners !== void 0 && JSON.stringify(readLabelOwnerKeys(transactionDb.db)) !== JSON.stringify(labelOwnerKeys)) throw new Error("SQLite session label owners changed before replacement");
					const transactionEntries = /* @__PURE__ */ new Map();
					for (const sessionKey of validationKeys) {
						const transactionRow = readExactSessionEntryRow(transactionDb, sessionKey);
						const expectedRow = expectedRows.get(sessionKey);
						if (transactionRow?.row.entry_json !== expectedRow?.row.entry_json || !sqliteSessionEntriesEqual(transactionRow?.entry, expectedRow?.entry)) throw new Error(`SQLite session entry changed before replacement for ${sessionKey}`);
						if (transactionRow) transactionEntries.set(sessionKey, transactionRow.entry);
					}
					params.assertCommitAllowed?.();
					for (const replacement of applicable) {
						const sourceEntries = [replacement.sessionKey, ...replacement.previousSessionKeys ?? []].flatMap((sessionKey) => {
							const entry = transactionEntries.get(sessionKey);
							return entry ? [{
								entry,
								sessionKey
							}] : [];
						});
						const selectedBefore = sourceEntries.toSorted((left, right) => (right.entry.updatedAt ?? 0) - (left.entry.updatedAt ?? 0))[0]?.entry;
						for (const { entry, sessionKey } of sourceEntries) previous.set(sessionKey, entry);
						writeSessionEntry(transactionDb, replacement.sessionKey, cloneSessionEntry(replacement.entry), { previousEntry: selectedBefore ?? null });
						deleteLegacySessionEntryRows(transactionDb, [...replacement.previousSessionKeys ?? []], replacement.sessionKey, { rehomeMembers: selectedBefore?.sessionId === replacement.entry.sessionId });
						current.set(replacement.sessionKey, replacement.entry);
					}
					maintenancePlans.push(applySessionEntryMaintenance(transactionDb, {
						activeSessionKey: params.activeSessionKey ?? "",
						archiveDirectory: resolveSqliteTranscriptArchiveDirectory(resolved),
						skipMaintenance: params.skipMaintenance ?? true,
						storePath: params.storePath
					}));
				}, toDatabaseOptions(resolved), { operationLabel: "session.entry-replacements" });
				emitCommittedSessionIdentityDiff(previous, current);
				return {
					maintenancePlans,
					result: operation.result
				};
			}
		};
	});
	const committed = preparedWrite.result;
	await finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort(resolved, committed.maintenancePlans, { deletedEntriesBeforeMaintenance: preparedWrite.deletedEntries });
	return committed.result;
}
async function applySessionEntryExactReplacements(params) {
	return await applySqliteSessionEntryReplacementProjection(params, (replacements) => [...replacements ?? []].map(({ entry, sessionKey }) => ({
		entry,
		sessionKey
	})));
}
/** Internal alias-aware owner; public SDK replacements remain exact-key only. */
async function applySessionEntryCanonicalReplacements(params) {
	return await applySqliteSessionEntryReplacementProjection({
		...params,
		...params.sessionKeys ? { sessionKeys: uniqueStrings(params.sessionKeys.map((key) => key.trim()).filter(Boolean)) } : {}
	}, (replacements) => [...replacements ?? []].map((replacement) => ({
		entry: replacement.entry,
		previousSessionKeys: uniqueStrings(replacement.previousSessionKeys.map((key) => key.trim()).filter(Boolean)),
		sessionKey: replacement.sessionKey.trim()
	})));
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-batch-projection.ts
/** Compatibility adapter for the shipped detached-store projection. */
async function applySessionEntryBatchProjection(params) {
	return await applySessionEntryCanonicalReplacements({
		...params,
		update: async (entries) => {
			const store = Object.fromEntries(entries.flatMap(({ entry, sessionKey }) => isInternalSessionEffectsKey(sessionKey) ? [] : [[sessionKey, entry]]));
			const operation = await params.update(store);
			return {
				result: operation.result,
				replacements: [...operation.mutations ?? []].map((mutation) => ({
					entry: mutation.entry,
					previousSessionKeys: mutation.previousSessionKeys ?? [],
					sessionKey: mutation.sessionKey
				}))
			};
		}
	});
}
//#endregion
//#region src/config/sessions/session-accessor.lifecycle-types.ts
var SessionEntryLifecycleUpsertConflictError = class extends Error {
	constructor(sessionKey) {
		super(`SQLite session entry changed before lifecycle upsert for ${sessionKey}`);
		this.sessionKey = sessionKey;
		this.name = "SessionEntryLifecycleUpsertConflictError";
	}
};
//#endregion
//#region src/config/sessions/session-accessor.sqlite-projection.ts
let sessionArchiveRuntimePromise;
function loadSessionArchiveRuntime$1() {
	sessionArchiveRuntimePromise ??= import("./session-archive.runtime.js");
	return sessionArchiveRuntimePromise;
}
async function applySessionEntryReplacements(params) {
	return await applySessionEntryExactReplacements(params);
}
/**
* Applies a detached whole-store projection under the SQLite writer lane.
* This exists only for bounded compatibility adapters that must preserve a
* legacy serialized callback without exposing mutable storage internals.
*/
async function applySessionStoreProjection(params) {
	const resolved = resolveSqliteScope({
		...params.agentId ? { agentId: params.agentId } : {},
		sessionKey: params.activeSessionKey ?? "",
		storePath: params.storePath
	});
	const preparedWrite = await runPreparedSqliteSessionWrite(resolved, async () => {
		const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
		const before = readSessionEntryStore(database);
		const projected = structuredClone(before);
		const operation = await params.update(projected);
		if (!operation.persist) return {
			deletedEntries: [],
			commit: () => ({
				maintenancePlans: [],
				result: operation.result
			})
		};
		const lockedEntriesBefore = new Map(Object.entries(before).filter(([, entry]) => entry.modelSelectionLocked === true));
		const transitionError = resolveAgentHarnessSessionStoreTransitionError({
			before: lockedEntriesBefore,
			store: projected
		});
		const storeError = resolveAgentHarnessSessionStoreError(projected);
		if (transitionError || storeError) throw new Error(transitionError ?? storeError);
		const changedKeys = uniqueStrings([...Object.keys(before), ...Object.keys(projected)]).filter((sessionKey) => !sqliteSessionEntriesEqual(before[sessionKey], projected[sessionKey]));
		if (changedKeys.length === 0) return {
			deletedEntries: [],
			commit: () => ({
				maintenancePlans: [],
				result: operation.result
			})
		};
		const maintenancePlans = [];
		return {
			deletedEntries: changedKeys.flatMap((sessionKey) => {
				const entry = before[sessionKey];
				return entry && !projected[sessionKey] ? [{
					entry,
					sessionKey
				}] : [];
			}),
			commit: () => {
				runSqliteSessionDeletionTransaction((transactionDb) => {
					for (const sessionKey of changedKeys) {
						const current = readExactSessionEntryRow(transactionDb, sessionKey)?.entry;
						if (!sqliteSessionEntriesEqual(current, before[sessionKey])) throw new Error(`SQLite session entry changed before store projection for ${sessionKey}`);
					}
					for (const sessionKey of changedKeys) {
						const entry = projected[sessionKey];
						if (entry) writeSessionEntry(transactionDb, sessionKey, cloneSessionEntry(entry), { previousEntry: before[sessionKey] ?? null });
						else deleteSessionEntryRows(transactionDb, sessionKey);
					}
					maintenancePlans.push(applySessionEntryMaintenance(transactionDb, {
						activeSessionKey: params.activeSessionKey ?? "",
						archiveDirectory: resolveSqliteTranscriptArchiveDirectory(resolved),
						skipMaintenance: params.skipMaintenance,
						storePath: params.storePath
					}));
				}, toDatabaseOptions(resolved), { operationLabel: "session.store-projection" });
				return {
					maintenancePlans,
					result: operation.result
				};
			}
		};
	});
	const committed = preparedWrite.result;
	await finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort(resolved, committed.maintenancePlans, { deletedEntriesBeforeMaintenance: preparedWrite.deletedEntries });
	return committed.result;
}
function readProjectedRemovalEntry(database, projected, allowCanonicalRepair = false) {
	const expectedRawEntryJson = projected.removal.expectedRawEntryJson;
	if (expectedRawEntryJson === void 0) return (allowCanonicalRepair ? readExactSessionEntryRowForCanonicalRepair(database, projected.sessionKey, { allowMalformedRowRepair: true }) : readExactSessionEntryRow(database, projected.sessionKey))?.entry;
	if (readExactSessionEntryJson(database, projected.sessionKey) !== expectedRawEntryJson) throw new Error(`SQLite session entry changed before raw lifecycle removal for ${projected.sessionKey}`);
	return projected.expectedEntry;
}
/** Applies exact lifecycle removals/upserts using SQLite session rows. */
async function applySessionEntryLifecycleMutation(params) {
	const resolved = resolveSqliteScope({
		...params.agentId ? { agentId: params.agentId } : {},
		env: params.env,
		sessionKey: "",
		storePath: params.storePath
	});
	const removals = [...params.removals ?? []];
	const upserts = [...params.upserts ?? []];
	let artifactCleanupError;
	const captureArtifactCleanupError = (error) => {
		if (params.captureArtifactCleanupError === true) {
			artifactCleanupError ??= error;
			return;
		}
		throw error;
	};
	let projected;
	let materializedRemovalPlans = [];
	let removalArchiveMaterializationFailed = false;
	const preparedWrite = await runPreparedSqliteSessionWrite(resolved, async () => {
		projected = await projectSessionEntryLifecycleMutation(toDatabaseOptions(resolved), {
			...params.allowCanonicalRepair ? { allowCanonicalRepair: true } : {},
			archiveDirectory: resolveSqliteTranscriptArchiveDirectory(resolved),
			removals,
			upserts
		});
		return {
			deletedEntries: projected.removals.flatMap(({ sessionKey, expectedEntry: entry }) => {
				return entry && !projected.upsertedEntries.some((upsert) => upsert.sessionKey === sessionKey) ? [{
					entry,
					sessionKey
				}] : [];
			}),
			...projected.deletePlans.length > 0 ? { beforeCommit: async () => {
				try {
					materializedRemovalPlans = await materializeSessionStateDeletePlans(projected.deletePlans);
				} catch (error) {
					removalArchiveMaterializationFailed = true;
					captureArtifactCleanupError(error);
				}
			} } : {},
			commit: () => commitProjectedLifecycleMutation(materializedRemovalPlans, removalArchiveMaterializationFailed)
		};
	});
	const committed = preparedWrite.result;
	params.onLifecycleCommitted?.();
	function commitProjectedLifecycleMutation(removalPlans, materializationFailed) {
		let beforeCount = 0;
		const removedSessionKeys = [];
		let archivedTranscripts = [];
		const maintenancePlans = [];
		runSqliteSessionDeletionTransaction((transactionDb) => {
			params.beforeCommitInTransaction?.();
			beforeCount = readSessionEntryCount(transactionDb);
			const validatedRemovals = projected.removals.filter((removal) => {
				if (materializationFailed && removal.removal.archiveRemovedTranscript === true) return false;
				const entry = readProjectedRemovalEntry(transactionDb, removal, params.allowCanonicalRepair);
				if (!sqliteSessionEntriesEqual(entry, removal.expectedEntry)) {
					const replacedInSameMutation = projected.upsertedEntries.some((upsert) => upsert.sessionKey === removal.sessionKey);
					throw new Error(replacedInSameMutation ? `SQLite session entry has stale lifecycle state for ${removal.sessionKey}` : `SQLite session entry changed before lifecycle removal for ${removal.sessionKey}`);
				}
				const shouldRemove = shouldRemoveSessionEntry(entry, removal.removal);
				if (!shouldRemove && projected.upsertedEntries.some((upsert) => upsert.sessionKey === removal.sessionKey)) throw new Error(`SQLite session entry has stale lifecycle state for ${removal.sessionKey}`);
				return shouldRemove;
			});
			archivedTranscripts = deleteMaterializedSessionStatePlans(transactionDb, removalPlans, void 0, new Set(validatedRemovals.map((removal) => removal.sessionKey)));
			const legacyReplacementTargets = /* @__PURE__ */ new Map();
			for (const { sessionKey, entry, expectedEntry, routeContext, resetBoundary } of projected.upsertedEntries) {
				const sameKeyRemoval = validatedRemovals.find((removal) => removal.sessionKey === sessionKey);
				const currentEntry = sameKeyRemoval ? readProjectedRemovalEntry(transactionDb, sameKeyRemoval, params.allowCanonicalRepair) : (params.allowCanonicalRepair ? readExactSessionEntryRowForCanonicalRepair(transactionDb, sessionKey, { allowMalformedRowRepair: true }) : readExactSessionEntryRow(transactionDb, sessionKey))?.entry;
				const expectedCurrentEntry = expectedEntry ?? sameKeyRemoval?.expectedEntry;
				if (!sqliteSessionEntriesEqual(currentEntry, expectedCurrentEntry)) {
					if (sameKeyRemoval) throw new Error(`SQLite session entry has stale lifecycle state for ${sessionKey}`);
					throw new SessionEntryLifecycleUpsertConflictError(sessionKey);
				}
				if (sameKeyRemoval && !shouldRemoveSessionEntry(currentEntry, sameKeyRemoval.removal)) throw new Error(`SQLite session entry has stale lifecycle state for ${sessionKey}`);
				if (resetBoundary && expectedEntry?.sessionId) {
					const event = buildSessionResetBoundaryEvent({
						events: loadTranscriptEventsFromDatabase(transactionDb, expectedEntry.sessionId, { projection: "reset-boundary" }),
						...resetBoundary
					});
					if (appendTranscriptEventsInTransaction(transactionDb, {
						...resolved,
						sessionId: expectedEntry.sessionId,
						sessionKey
					}, [event]) !== 1) throw new Error(`Failed to append reset boundary for ${sessionKey}`);
				}
				writeSessionEntry(transactionDb, sessionKey, entry, {
					allowStoredAliases: params.allowCanonicalRepair === true,
					preserveNodeSuggestions: params.allowCanonicalRepair === true,
					previousEntry: expectedCurrentEntry ?? null,
					...routeContext !== void 0 ? { routeContext } : {}
				});
				const relatedRemovalKeys = validatedRemovals.flatMap((removal) => {
					const removedSessionId = removal.expectedEntry.sessionId;
					return removal.sessionKey !== sessionKey && (removedSessionId === entry.sessionId || removedSessionId === entry.previousSessionId) ? [removal.sessionKey] : [];
				});
				rehomeSessionWindows(transactionDb, sessionKey, relatedRemovalKeys);
				for (const legacyKey of relatedRemovalKeys) {
					const removedEntry = validatedRemovals.find((removal) => removal.sessionKey === legacyKey)?.expectedEntry;
					legacyReplacementTargets.set(legacyKey, {
						canonicalKey: sessionKey,
						rehomeMembers: removedEntry?.sessionId === entry.sessionId
					});
				}
			}
			params.afterUpsertsInTransaction?.(transactionDb);
			const upsertedKeys = new Set(projected.upsertedEntries.map((upsert) => upsert.sessionKey));
			for (const removal of validatedRemovals) {
				if (upsertedKeys.has(removal.sessionKey)) continue;
				const entry = readProjectedRemovalEntry(transactionDb, removal, params.allowCanonicalRepair);
				if (!sqliteSessionEntriesEqual(entry, removal.expectedEntry)) throw new Error(`SQLite session entry changed before lifecycle removal for ${removal.sessionKey}`);
				if (!shouldRemoveSessionEntry(entry, removal.removal)) continue;
				const replacement = legacyReplacementTargets.get(removal.sessionKey);
				if (replacement) deleteLegacySessionEntryRows(transactionDb, [removal.sessionKey], replacement.canonicalKey, {
					rehomeMembers: replacement.rehomeMembers,
					validatedEntries: /* @__PURE__ */ new Map([[removal.sessionKey, entry]])
				});
				else deleteSessionEntryRows(transactionDb, removal.sessionKey, {
					deleteOwnedWindows: removal.removal.deleteOwnedWindows === true,
					deliveryCleanupKeys: removal.removal.deliveryCleanupKeys,
					validatedEntry: entry
				});
				removedSessionKeys.push(removal.sessionKey);
			}
			maintenancePlans.push(applySessionEntryMaintenance(transactionDb, {
				activeSessionKey: params.activeSessionKey ?? "",
				archiveDirectory: resolveSqliteTranscriptArchiveDirectory(resolved),
				forceMaintenance: params.maintenanceOverride !== void 0,
				maintenanceConfig: params.maintenanceOverride ? {
					...resolveMaintenanceConfig(),
					...params.maintenanceOverride
				} : void 0,
				skipMaintenance: params.skipMaintenance,
				storePath: params.storePath
			}));
		}, toDatabaseOptions(resolved));
		emitCommittedLifecycleIdentityMutations({
			projected,
			removedSessionKeys
		});
		return {
			archivedTranscripts,
			beforeCount,
			maintenancePlans,
			removedSessionKeys
		};
	}
	const { archivedTranscripts: maintenanceArchivedTranscripts, ...maintenance } = await finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort(resolved, committed.maintenancePlans, { deletedEntriesBeforeMaintenance: preparedWrite.deletedEntries });
	let publishedRemovalTranscripts = [];
	try {
		publishedRemovalTranscripts = await publishSessionStateArchives(resolved, committed.archivedTranscripts);
	} catch (error) {
		captureArtifactCleanupError(error);
	}
	const archivedTranscripts = [...publishedRemovalTranscripts, ...maintenanceArchivedTranscripts];
	const afterCount = readSessionEntryCount(openOpenClawAgentDatabase(toDatabaseOptions(resolved)));
	emitArchivedTranscriptUpdates(archivedTranscripts);
	const archivedTranscriptDirectories = uniqueStrings(archivedTranscripts.map((transcript) => path.dirname(transcript.archivedPath))).toSorted();
	if (archivedTranscriptDirectories.length > 0 && params.cleanupArchivedTranscripts) try {
		const { cleanupArchivedSessionTranscripts } = await loadSessionArchiveRuntime$1();
		await cleanupArchivedSessionTranscripts({
			directories: archivedTranscriptDirectories,
			rules: params.cleanupArchivedTranscripts.rules,
			nowMs: params.cleanupArchivedTranscripts.nowMs
		});
		await prunePublishedSessionArchivesByRetention({
			scope: resolved,
			rules: params.cleanupArchivedTranscripts.rules,
			nowMs: params.cleanupArchivedTranscripts.nowMs
		});
	} catch (error) {
		captureArtifactCleanupError(error);
	}
	return {
		beforeCount: committed.beforeCount,
		removedEntries: committed.removedSessionKeys.length,
		removedSessionKeys: committed.removedSessionKeys,
		...maintenance,
		archivedTranscriptDirectories,
		afterCount,
		artifactCleanupError
	};
}
/** Purges entries owned by a deleted agent from SQLite session rows. */
async function purgeDeletedAgentSessionEntries(params) {
	const resolved = resolveSqliteStoreScope(params.storePath, { agentId: params.storeAgentId });
	const prepared = await runExclusiveSqliteSessionWrite(resolved, async () => {
		const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
		const store = readSessionEntryStore(database);
		const remainingStore = { ...store };
		const entryRemovals = [];
		const removedEntriesToArchive = [];
		for (const sessionKey of Object.keys(store)) {
			if (resolveStoredSessionOwnerAgentId({
				cfg: params.cfg,
				agentId: params.storeAgentId,
				sessionKey
			}) !== params.agentId) continue;
			const entry = store[sessionKey];
			if (!entry) continue;
			entryRemovals.push({
				expectedEntry: cloneSessionEntry(entry),
				sessionKey
			});
			removedEntriesToArchive.push(entry);
			delete remainingStore[sessionKey];
		}
		const referencedSessionIds = collectProjectedReferencedSessionIds({
			database,
			excludedSessionKeys: entryRemovals.map((removal) => removal.sessionKey),
			projectedStore: remainingStore
		});
		return {
			deletePlans: removedEntriesToArchive.flatMap((entry) => planSessionStateAfterEntryRemoval({
				archiveDirectory: resolveSqliteTranscriptArchiveDirectory(resolved),
				database,
				entry,
				reason: "deleted",
				referencedSessionIds
			})),
			entryRemovals
		};
	});
	const materializedPlans = await materializeSessionStateDeletePlans(prepared.deletePlans);
	const committed = await withSqliteSessionDeletions(resolved, prepared.entryRemovals.flatMap(({ expectedEntry: entry, sessionKey }) => entry ? [{
		entry,
		sessionKey
	}] : []), async () => await runExclusiveSqliteSessionWrite(resolved, async () => {
		let archivedTranscripts = [];
		const maintenancePlans = [];
		runSqliteSessionDeletionTransaction((transactionDb) => {
			const currentOwnedSessionKeys = Object.keys(readSessionEntryStore(transactionDb)).filter((sessionKey) => resolveStoredSessionOwnerAgentId({
				cfg: params.cfg,
				agentId: params.storeAgentId,
				sessionKey
			}) === params.agentId).toSorted();
			const plannedSessionKeys = prepared.entryRemovals.map((removal) => removal.sessionKey).toSorted();
			if (JSON.stringify(currentOwnedSessionKeys) !== JSON.stringify(plannedSessionKeys)) throw new Error("SQLite deleted-agent session entries changed before purge");
			assertPlannedLifecycleArtifactEntriesUnchanged(transactionDb, prepared.entryRemovals);
			archivedTranscripts = deleteMaterializedSessionStatePlans(transactionDb, materializedPlans, void 0, new Set(prepared.entryRemovals.map((removal) => removal.sessionKey)));
			deletePlannedLifecycleArtifactEntries(transactionDb, prepared.entryRemovals);
			maintenancePlans.push(applySessionEntryMaintenance(transactionDb, {
				activeSessionKey: "",
				archiveDirectory: resolveSqliteTranscriptArchiveDirectory(resolved),
				storePath: params.storePath
			}));
		}, toDatabaseOptions(resolved));
		emitCommittedSessionEntryRemovals(prepared.entryRemovals);
		return {
			archivedTranscripts,
			maintenancePlans
		};
	}));
	const { archivedTranscripts: maintenanceArchivedTranscripts } = await finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort(resolved, committed.maintenancePlans, { deletedEntriesBeforeMaintenance: prepared.entryRemovals.length });
	const archivedTranscripts = [...await publishSessionStateArchives(resolved, committed.archivedTranscripts), ...maintenanceArchivedTranscripts];
	emitArchivedTranscriptUpdates(archivedTranscripts);
}
/** Fully replaces rows for one transcript in the additive SQLite transcript store. */
//#endregion
//#region src/config/sessions/session-entry-selection.ts
var SessionLabelOwnerIndex = class {
	#owners = /* @__PURE__ */ new Map();
	constructor(store) {
		this.store = store;
		for (const [sessionKey, entry] of Object.entries(this.store)) this.#update(sessionKey, entry.label, true);
	}
	isLabelInUse(label, excludedKeys) {
		for (const sessionKey of this.#owners.get(label) ?? []) if (!excludedKeys.includes(sessionKey)) return true;
		return false;
	}
	replaceEntry(candidateKeys, primaryKey, entry) {
		for (const sessionKey of /* @__PURE__ */ new Set([...candidateKeys, primaryKey])) {
			this.#update(sessionKey, this.store[sessionKey]?.label, false);
			delete this.store[sessionKey];
		}
		const cloned = structuredClone(entry);
		this.store[primaryKey] = cloned;
		this.#update(primaryKey, cloned.label, true);
		return cloned;
	}
	#update(sessionKey, label, add) {
		if (label === void 0) return;
		const owners = this.#owners.get(label) ?? /* @__PURE__ */ new Set();
		if (add) {
			owners.add(sessionKey);
			this.#owners.set(label, owners);
			return;
		}
		owners.delete(sessionKey);
	}
};
/** Carries only user/runtime selection into a new dashboard fork. */
function inheritSessionSelection(parentEntry) {
	if (!parentEntry) return {};
	const authProfileOverrideSource = resolveSessionAuthProfileOverrideSource(parentEntry);
	const inheritModelSelection = !hasSessionActiveAutoModelFallback(parentEntry);
	const inheritAuthProfile = inheritModelSelection || authProfileOverrideSource === "user";
	return {
		...inheritModelSelection && parentEntry.providerOverride ? { providerOverride: parentEntry.providerOverride } : {},
		...inheritModelSelection && parentEntry.modelOverride ? { modelOverride: parentEntry.modelOverride } : {},
		...inheritModelSelection && parentEntry.modelOverrideSource ? { modelOverrideSource: parentEntry.modelOverrideSource } : {},
		...inheritModelSelection && parentEntry.modelOverrideRouteResolution ? { modelOverrideRouteResolution: parentEntry.modelOverrideRouteResolution } : {},
		...inheritModelSelection && parentEntry.agentRuntimeOverride ? { agentRuntimeOverride: parentEntry.agentRuntimeOverride } : {},
		...parentEntry.contextWindow ? { contextWindow: parentEntry.contextWindow } : {},
		...parentEntry.thinkingLevel ? { thinkingLevel: parentEntry.thinkingLevel } : {},
		...parentEntry.fastMode !== void 0 ? { fastMode: parentEntry.fastMode } : {},
		...parentEntry.toolOverrides ? { toolOverrides: parentEntry.toolOverrides } : {},
		...parentEntry.verboseLevel ? { verboseLevel: parentEntry.verboseLevel } : {},
		...parentEntry.traceLevel ? { traceLevel: parentEntry.traceLevel } : {},
		...parentEntry.reasoningLevel ? { reasoningLevel: parentEntry.reasoningLevel } : {},
		...parentEntry.elevatedLevel ? { elevatedLevel: parentEntry.elevatedLevel } : {},
		...inheritAuthProfile && authProfileOverrideSource && parentEntry.authProfileOverride ? { authProfileOverride: parentEntry.authProfileOverride } : {},
		...inheritAuthProfile && authProfileOverrideSource ? { authProfileOverrideSource } : {}
	};
}
function cloneOptionalSessionEntry(entry) {
	return entry ? structuredClone(entry) : void 0;
}
function resolveProjectionExistingEntry(snapshot, target) {
	const candidateKeys = target.candidateKeys ?? [target.primaryKey];
	let freshest;
	for (const candidateKey of candidateKeys) {
		const entry = snapshot.store[candidateKey];
		if (entry && (!freshest || (entry.updatedAt ?? 0) > (freshest.updatedAt ?? 0))) freshest = entry;
	}
	return cloneOptionalSessionEntry(freshest);
}
//#endregion
//#region src/config/sessions/session-accessor.lifecycle.ts
function findSessionCompactionCheckpoint(params) {
	const checkpointId = params.checkpointId.trim();
	if (!checkpointId || !Array.isArray(params.entry.compactionCheckpoints)) return;
	let newest;
	for (const checkpoint of params.entry.compactionCheckpoints) {
		if (checkpoint.checkpointId !== checkpointId) continue;
		if (!newest || checkpoint.createdAt > newest.createdAt) newest = checkpoint;
	}
	return newest;
}
async function applySessionCompactionCheckpointMutation(params) {
	const currentEntry = loadSessionEntry({
		sessionKey: params.readKey,
		storePath: params.storePath
	});
	if (!currentEntry?.sessionId) return { status: "missing-session" };
	if (currentEntry.modelSelectionLocked === true) return { status: "model-selection-locked" };
	const checkpoint = findSessionCompactionCheckpoint({
		entry: currentEntry,
		checkpointId: params.checkpointId
	});
	if (!checkpoint) return { status: "missing-checkpoint" };
	const forkedSession = await params.forkTranscriptFromCheckpoint(checkpoint);
	if (forkedSession.status !== "created") return forkedSession;
	const nextEntry = await params.buildEntry({
		checkpoint,
		currentEntry,
		forkedTranscript: forkedSession.transcript
	});
	await replaceSessionEntry({
		sessionKey: params.writeKey,
		storePath: params.storePath
	}, nextEntry);
	return {
		status: "created",
		key: params.writeKey,
		checkpoint,
		entry: nextEntry
	};
}
/**
* Forks checkpoint transcript content and persists a new branch entry in one
* storage-sized mutation. SQLite adapters implement the transcript row copy
* and `session_nodes.entry_json` insert inside the same write transaction.
*/
async function branchSessionFromCompactionCheckpoint(params) {
	return await applySessionCompactionCheckpointMutation({
		buildEntry: params.buildEntry,
		checkpointId: params.checkpointId,
		forkTranscriptFromCheckpoint: params.forkTranscriptFromCheckpoint,
		readKey: params.sourceStoreKey ?? params.sourceKey,
		storePath: params.storePath,
		writeKey: params.nextKey
	});
}
/**
* Forks checkpoint transcript content and replaces the current entry in one
* storage-sized mutation. SQLite adapters implement the transcript row copy
* and `session_nodes.entry_json` update inside the same write transaction.
*/
async function restoreSessionFromCompactionCheckpoint(params) {
	return await applySessionCompactionCheckpointMutation({
		buildEntry: params.buildEntry,
		checkpointId: params.checkpointId,
		forkTranscriptFromCheckpoint: params.forkTranscriptFromCheckpoint,
		readKey: params.sessionStoreKey ?? params.sessionKey,
		storePath: params.storePath,
		writeKey: params.sessionKey
	});
}
/** Projects ordered session patches against one store snapshot and commits once. */
async function applySessionPatchProjections(params) {
	return await applySessionEntryBatchProjection({
		agentId: params.agentId,
		sessionKeys: params.sessionKeys,
		storePath: params.storePath,
		skipMaintenance: true,
		update: async (workingStore) => {
			const snapshot = { store: workingStore };
			const labelOwners = new SessionLabelOwnerIndex(workingStore);
			const mutations = [];
			const results = [];
			for (const operation of params.operations) try {
				const target = operation.resolveTarget(snapshot);
				const existingEntry = resolveProjectionExistingEntry(snapshot, target);
				const candidateKeys = uniqueStrings((target.candidateKeys ?? [target.primaryKey]).map((key) => key.trim()).filter(Boolean));
				const projected = await operation.project({
					...target,
					...snapshot,
					...existingEntry ? { existingEntry } : {},
					isLabelInUse: (label) => labelOwners.isLabelInUse(label, candidateKeys)
				});
				if (!projected.ok) {
					results.push(projected);
					continue;
				}
				const authorizationFailure = operation.authorize?.();
				if (authorizationFailure) {
					results.push(authorizationFailure);
					continue;
				}
				const previousSessionKeys = candidateKeys.filter((sessionKey) => sessionKey !== target.primaryKey && workingStore[sessionKey]);
				mutations.push({
					entry: projected.entry,
					...previousSessionKeys.length > 0 ? { previousSessionKeys } : {},
					sessionKey: target.primaryKey
				});
				const cloned = labelOwners.replaceEntry(candidateKeys, target.primaryKey, projected.entry);
				results.push({
					ok: true,
					entry: structuredClone(cloned)
				});
			} catch (error) {
				if (!operation.onError) throw error;
				results.push(operation.onError(error));
			}
			return {
				mutations,
				result: results
			};
		}
	});
}
/** Applies one patch through the canonical ordered batch projection owner. */
async function applySessionPatchProjection(params) {
	const [result] = await applySessionPatchProjections({
		agentId: params.agentId,
		sessionKeys: params.sessionKeys,
		storePath: params.storePath,
		operations: [{
			resolveTarget: params.resolveTarget,
			project: params.project,
			...params.assertCurrent ? { authorize: () => {
				params.assertCurrent?.();
			} } : {}
		}]
	});
	if (!result) throw new Error("Session patch projection produced no result");
	return result;
}
/**
* Clears plugin host-owned state inside one resolved session store.
* This is an internal transaction-sized boundary for the storage backend, not
* a Plugin SDK API.
*/
async function cleanupPluginHostSessionStore(params) {
	if (shouldSkipPluginHostCleanupStore(params) || params.shouldCleanup && !params.shouldCleanup()) return 0;
	const now = Date.now();
	let cleared = 0;
	for (const { entry, sessionKey } of listSessionEntriesCore({
		agentId: params.agentId,
		storePath: params.storePath
	})) {
		if (isLockedHarnessSessionOwnedByPlugin(entry, params.preserveLockedHarnessIds)) continue;
		if (!matchesPluginHostCleanupSession(sessionKey, entry, params.sessionKey) || !hasPluginHostCleanupTarget(entry, params)) continue;
		if (await patchSessionEntryCore({
			agentId: params.agentId,
			sessionKey,
			storePath: params.storePath
		}, (currentEntry) => {
			if (isLockedHarnessSessionOwnedByPlugin(currentEntry, params.preserveLockedHarnessIds)) return null;
			if (!hasPluginHostCleanupTarget(currentEntry, params)) return null;
			clearPluginHostCleanupTarget(currentEntry, params);
			currentEntry.updatedAt = now;
			return currentEntry;
		}, {
			replaceEntry: true,
			skipMaintenance: true
		})) cleared += 1;
	}
	return cleared;
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-parent-fork.ts
const DEFAULT_PARENT_FORK_MAX_TOKENS = 1e5;
function formatParentForkTooLargeMessage(params) {
	return `Parent context is too large to fork (${params.parentTokens}/${params.maxTokens} tokens); starting with isolated context instead.`;
}
function planParentForkDecision(parentEntry, transcriptEstimate, options = {}) {
	const maxTokens = normalizePositiveTokenCount(options.maxTokens) ?? DEFAULT_PARENT_FORK_MAX_TOKENS;
	const parentTokens = options.preferTranscriptEstimate ? transcriptEstimate?.tokens : resolveFreshSessionTotalTokens(parentEntry) ?? transcriptEstimate?.tokens;
	if (typeof parentTokens === "number" && parentTokens > maxTokens) return {
		status: "skip",
		reason: "parent-too-large",
		maxTokens,
		parentTokens,
		message: formatParentForkTooLargeMessage({
			parentTokens,
			maxTokens
		})
	};
	return {
		status: "fork",
		maxTokens,
		...typeof parentTokens === "number" ? { parentTokens } : {}
	};
}
function estimateTranscriptPromptTokens(events) {
	let byteEstimate = 0;
	let latestUsageEstimate;
	let latestUsageEstimateIsExactContext = false;
	let trailingBytes = 0;
	for (const event of selectParentForkTokenEstimateEvents(events)) {
		if (isRecord(event) && isRecord(event.message) && event.message.excludeFromContext === true) continue;
		const serializedBytes = Buffer.byteLength(JSON.stringify(event)) + 1;
		byteEstimate += serializedBytes;
		if (!isRecord(event)) {
			if (latestUsageEstimate !== void 0) trailingBytes += serializedBytes;
			continue;
		}
		const message = isRecord(event.message) ? event.message : void 0;
		const usageRaw = isRecord(message?.usage) ? message.usage : isRecord(event.usage) ? event.usage : void 0;
		if (!usageRaw) {
			if (latestUsageEstimate !== void 0) trailingBytes += serializedBytes;
			continue;
		}
		const contextUsage = readTranscriptContextUsage(usageRaw);
		if (message?.api === "cli" && contextUsage === void 0) {
			latestUsageEstimate = void 0;
			latestUsageEstimateIsExactContext = false;
			trailingBytes = 0;
			continue;
		}
		if (contextUsage?.state === "unavailable") {
			latestUsageEstimate = void 0;
			latestUsageEstimateIsExactContext = false;
			trailingBytes = 0;
			continue;
		}
		if (contextUsage?.state === "available") {
			latestUsageEstimate = normalizePositiveTokenCount(contextUsage.totalTokens);
			latestUsageEstimateIsExactContext = true;
			trailingBytes = 0;
			continue;
		}
		const usage = normalizeUsage(usageRaw);
		const promptTokens = normalizePositiveTokenCount(derivePromptTokens({
			input: usage?.input,
			cacheRead: usage?.cacheRead,
			cacheWrite: usage?.cacheWrite
		}));
		const outputTokens = normalizePositiveTokenCount(usage?.output) ?? 0;
		const totalTokens = promptTokens === void 0 ? void 0 : normalizePositiveTokenCount(promptTokens + outputTokens);
		if (typeof totalTokens === "number") {
			latestUsageEstimate = totalTokens;
			latestUsageEstimateIsExactContext = false;
			trailingBytes = 0;
		}
	}
	if (latestUsageEstimate !== void 0) {
		const tokens = normalizePositiveTokenCount(latestUsageEstimate + Math.ceil(trailingBytes / 4));
		return tokens === void 0 ? void 0 : {
			kind: latestUsageEstimateIsExactContext ? "exact-context" : "legacy-or-bytes",
			tokens
		};
	}
	const tokens = normalizePositiveTokenCount(Math.ceil(byteEstimate / 4));
	return tokens === void 0 ? void 0 : {
		kind: "legacy-or-bytes",
		tokens
	};
}
function selectParentForkTokenEstimateEvents(events) {
	const entries = events.filter((entry) => !(isRecord(entry) && entry.type === "session"));
	const tree = scanSessionTranscriptTree(entries);
	const visiblePath = selectSessionTranscriptTreePathNodes(tree, tree.leafId);
	const appendPath = selectSessionTranscriptTreePathNodes(tree, tree.appendParentId);
	return mergeSessionTranscriptVisiblePathWithOpaqueAppendPath({
		visiblePath,
		appendPath,
		appendParentId: tree.appendParentId
	}).nodes.flatMap((node) => node.entry);
}
function normalizePositiveTokenCount(value) {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : void 0;
}
function readTranscriptContextUsage(usageRaw) {
	const contextUsage = usageRaw.contextUsage;
	if (!isRecord(contextUsage)) return;
	if (contextUsage.state === "unavailable") return { state: "unavailable" };
	if (contextUsage.state !== "available") return;
	const totalTokens = normalizePositiveTokenCount(contextUsage.totalTokens);
	return totalTokens === void 0 ? void 0 : {
		state: "available",
		totalTokens
	};
}
function resolveParentForkSourceTranscript(fileEntries, forkFrom) {
	if (fileEntries.length === 0) return null;
	const header = fileEntries.find((entry) => isRecord(entry) && entry.type === "session");
	const entries = fileEntries.filter((entry) => !(isRecord(entry) && entry.type === "session"));
	const tree = scanSessionTranscriptTree(entries);
	const visiblePath = selectSessionTranscriptTreePathNodes(tree, tree.leafId);
	const appendPath = selectSessionTranscriptTreePathNodes(tree, tree.appendParentId);
	const mergedPath = mergeSessionTranscriptVisiblePathWithOpaqueAppendPath({
		visiblePath,
		appendPath,
		appendParentId: tree.appendParentId
	});
	const visibleBranchEntries = mergedPath.nodes.flatMap((node) => {
		if (!isRecord(node.entry)) return [];
		const parentId = node.selectedParentId;
		return [node.entry.parentId === parentId ? node.entry : {
			...node.entry,
			parentId
		}];
	});
	const branchEntries = forkFrom === "last-completed" ? visibleBranchEntries.slice(0, findLastCompletedAssistantIndex(visibleBranchEntries) + 1) : visibleBranchEntries;
	const pathEntryIds = new Set(branchEntries.flatMap((entry) => isRecord(entry) && typeof entry.id === "string" ? [entry.id] : []));
	const lastLeafUpdateNode = tree.nodes.findLast((node) => node.leafId !== void 0);
	const lastBranchEntry = branchEntries.at(-1);
	const lastBranchEntryId = isRecord(lastBranchEntry) && typeof lastBranchEntry.id === "string" ? lastBranchEntry.id : null;
	return {
		appendParentId: forkFrom === "last-completed" ? lastBranchEntryId : mergedPath.appendParentId,
		...forkFrom !== "last-completed" && lastLeafUpdateNode?.appendMode ? { appendMode: lastLeafUpdateNode.appendMode } : {},
		branchEntries,
		cwd: typeof header?.cwd === "string" ? header.cwd : void 0,
		labelsToWrite: collectBranchLabels({
			allEntries: entries,
			pathEntryIds
		}),
		leafId: forkFrom === "last-completed" ? lastBranchEntryId : tree.leafId,
		preserveLeafControl: forkFrom !== "last-completed" && isSessionTranscriptLeafControl(lastLeafUpdateNode?.entry)
	};
}
function findLastCompletedAssistantIndex(entries) {
	return entries.findLastIndex((entry) => {
		const message = isRecord(entry) && isRecord(entry.message) ? entry.message : void 0;
		return message?.role === "assistant" && message.stopReason !== "toolUse";
	});
}
function collectBranchLabels(params) {
	return params.allEntries.flatMap((entry) => isRecord(entry) && entry.type === "label" && typeof entry.label === "string" && typeof entry.targetId === "string" && typeof entry.id === "string" && !params.pathEntryIds.has(entry.id) && params.pathEntryIds.has(entry.targetId) && typeof entry.timestamp === "string" ? [{
		targetId: entry.targetId,
		label: entry.label,
		timestamp: entry.timestamp
	}] : []);
}
function generateEntryId(existingIds) {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		const id = randomUUID().slice(0, 8);
		if (!existingIds.has(id)) {
			existingIds.add(id);
			return id;
		}
	}
	const id = randomUUID();
	existingIds.add(id);
	return id;
}
function buildLabelEntries(params) {
	let parentId = params.lastEntryId;
	return params.labelsToWrite.map(({ targetId, label, timestamp }) => {
		const entry = {
			type: "label",
			id: generateEntryId(params.pathEntryIds),
			parentId,
			timestamp,
			targetId,
			label
		};
		parentId = entry.id;
		return entry;
	});
}
function hasAssistantEntry(entries) {
	return entries.some((entry) => isRecord(entry) && entry.type === "message" && isRecord(entry.message) && entry.message.role === "assistant");
}
function buildForkedChildTranscriptEvents(params) {
	const header = {
		...createSessionTranscriptHeader({
			cwd: params.source.cwd,
			sessionId: params.targetSessionId
		}),
		parentSession: params.parentSessionFile
	};
	if (!params.source.preserveLeafControl && !hasAssistantEntry(params.source.branchEntries)) return [header];
	const pathEntryIds = new Set(params.source.branchEntries.flatMap((entry) => isRecord(entry) && typeof entry.id === "string" ? [entry.id] : []));
	const lastPathEntry = params.source.branchEntries.at(-1);
	const lastPathEntryId = isRecord(lastPathEntry) && typeof lastPathEntry.id === "string" ? lastPathEntry.id : null;
	const labelEntries = buildLabelEntries({
		labelsToWrite: params.source.labelsToWrite,
		pathEntryIds,
		lastEntryId: lastPathEntryId
	});
	const leafEntry = params.source.preserveLeafControl ? {
		type: "leaf",
		id: generateEntryId(pathEntryIds),
		parentId: labelEntries.at(-1)?.id ?? lastPathEntryId,
		timestamp: (/* @__PURE__ */ new Date()).toISOString(),
		targetId: params.source.leafId,
		appendParentId: params.source.appendParentId,
		...params.source.appendMode ? { appendMode: params.source.appendMode } : {}
	} : null;
	return [
		header,
		...params.source.branchEntries,
		...labelEntries,
		...leafEntry ? [leafEntry] : []
	];
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-parent-session.ts
async function forkSessionTranscriptFromParent(params) {
	const resolved = resolveSqliteScope({
		...params.agentId ? { agentId: params.agentId } : {},
		sessionKey: params.sessionKey,
		storePath: params.storePath
	});
	const target = params.targetStorePath ? resolveSqliteScope({
		sessionKey: params.sessionKey,
		storePath: params.targetStorePath
	}) : resolved;
	if (!(target.agentId !== resolved.agentId || (target.path ?? "") !== (resolved.path ?? ""))) return await runExclusiveSqliteSessionWrite(resolved, async () => {
		let result = { status: "failed" };
		runOpenClawAgentWriteTransaction((database) => {
			params.commitGuard?.();
			result = forkSqliteParentTranscriptInTransaction(database, resolved, {
				enforceTokenLimit: params.enforceTokenLimit,
				maxTokens: params.maxTokens,
				parentEntry: params.parentEntry,
				parentSessionKey: params.parentSessionKey,
				forkFrom: params.forkFrom,
				targetSessionId: params.targetSessionId,
				targetSessionKey: params.sessionKey
			});
		}, toDatabaseOptions(resolved));
		return result;
	});
	if (!params.parentEntry.sessionId) return { status: "missing-parent" };
	const sourceDatabase = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
	const source = resolveParentForkSourceTranscript(loadTranscriptEventsFromDatabase(sourceDatabase, params.parentEntry.sessionId), params.forkFrom);
	if (!source) return { status: "failed" };
	const limitDecision = resolveParentForkLimitDecision(params, source);
	if (limitDecision) return {
		status: "too-large",
		decision: limitDecision
	};
	const parentSessionFile = formatLegacySqliteSessionMarkerForScope({
		...resolved,
		sessionId: params.parentEntry.sessionId,
		sessionKey: normalizeSqliteSessionKey(params.parentSessionKey)
	});
	return await runExclusiveSqliteSessionWrite(target, async () => {
		const sessionId = params.targetSessionId ?? randomUUID();
		const targetScope = {
			...target,
			sessionId,
			sessionKey: normalizeSqliteSessionKey(params.sessionKey)
		};
		const sessionFile = formatSqliteSessionReferenceForScope(targetScope);
		runOpenClawAgentWriteTransaction((database) => {
			params.commitGuard?.();
			writeSqliteForkedChildTranscriptInTransaction(database, targetScope, {
				parentSessionFile,
				source
			});
		}, toDatabaseOptions(target));
		return {
			status: "created",
			transcript: {
				sessionFile,
				sessionId
			}
		};
	});
}
/** Forks parent context into a child session entry using SQLite rows only. */
async function forkSessionEntryFromParentTarget(params) {
	const resolved = resolveSqliteStoreScope(params.storePath, { agentId: params.agentId });
	const parentTarget = normalizeLifecycleTarget(params.parentTarget);
	const sessionTarget = normalizeLifecycleTarget(params.sessionTarget);
	return await runExclusiveSqliteSessionWrite(resolved, async () => {
		const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
		const parent = resolveLifecyclePrimaryEntry(database, parentTarget);
		if (!parent?.entry.sessionId) return { status: "missing-parent" };
		const base = resolveLifecyclePrimaryEntry(database, sessionTarget)?.entry ?? params.fallbackEntry;
		if (!base) return { status: "missing-entry" };
		if (params.skipForkWhen?.(cloneSessionEntry(base))) {
			const sessionEntry = persistSqliteParentForkSkipPatch({
				entry: base,
				sessionKey: sessionTarget.canonicalKey,
				patch: params.skipPatch?.(cloneSessionEntry(base)),
				resolved
			});
			return {
				status: "skipped",
				reason: "existing-entry",
				parentEntry: cloneSessionEntry(parent.entry),
				sessionEntry
			};
		}
		assertModelSelectionUnlocked(parent.entry, MODEL_SELECTION_LOCKED_PARENT_FORK_MESSAGE);
		const transcriptParentTokens = typeof resolveFreshSessionTotalTokens(parent.entry) !== "number" && typeof parent.entry.sessionId === "string" && parent.entry.sessionId.length > 0 ? estimateTranscriptPromptTokens(loadTranscriptEventsFromDatabase(database, parent.entry.sessionId)) : void 0;
		const decision = planParentForkDecision(parent.entry, transcriptParentTokens);
		if (decision.status === "skip") {
			const patch = params.decisionSkipPatch?.({
				decision,
				entry: cloneSessionEntry(base),
				parentEntry: cloneSessionEntry(parent.entry)
			});
			const sessionEntry = persistSqliteParentForkSkipPatch({
				entry: base,
				sessionKey: sessionTarget.canonicalKey,
				patch,
				resolved
			});
			return {
				status: "skipped",
				reason: "decision-skip",
				parentEntry: cloneSessionEntry(parent.entry),
				sessionEntry,
				decision
			};
		}
		let result = { status: "failed" };
		let previousIdentity = /* @__PURE__ */ new Map();
		let currentIdentity = /* @__PURE__ */ new Map();
		runOpenClawAgentWriteTransaction((writeDatabase) => {
			const freshParent = resolveLifecyclePrimaryEntry(writeDatabase, parentTarget)?.entry;
			if (!freshParent?.sessionId) {
				result = { status: "missing-parent" };
				return;
			}
			assertModelSelectionUnlocked(freshParent, MODEL_SELECTION_LOCKED_PARENT_FORK_MESSAGE);
			const freshBase = resolveLifecyclePrimaryEntry(writeDatabase, sessionTarget)?.entry ?? params.fallbackEntry;
			if (!freshBase) {
				result = { status: "missing-entry" };
				return;
			}
			const fork = forkSqliteParentTranscriptInTransaction(writeDatabase, resolved, {
				parentEntry: freshParent,
				parentSessionKey: parentTarget.canonicalKey,
				targetSessionKey: sessionTarget.canonicalKey
			});
			if (fork.status !== "created") {
				result = fork.status === "missing-parent" ? { status: "missing-parent" } : { status: "failed" };
				return;
			}
			const forkIdentityPatch = {
				...params.patch?.({
					decision,
					entry: cloneSessionEntry(freshBase),
					fork: fork.transcript,
					parentEntry: cloneSessionEntry(freshParent)
				}),
				forkSource: {
					sessionKey: parentTarget.canonicalKey,
					sessionId: freshParent.sessionId
				},
				forkedFromParent: true,
				lifecycleRunId: void 0,
				lastRunId: void 0,
				sessionId: fork.transcript.sessionId,
				totalTokens: void 0,
				totalTokensFresh: false,
				totalTokensVersion: void 0
			};
			previousIdentity = readSessionIdentitySnapshot(writeDatabase, [sessionTarget.canonicalKey]);
			const next = writeSessionEntry(writeDatabase, sessionTarget.canonicalKey, mergeSessionEntry(freshBase, forkIdentityPatch), { previousEntry: freshBase });
			currentIdentity = readSessionIdentitySnapshot(writeDatabase, [sessionTarget.canonicalKey]);
			result = {
				status: "forked",
				decision,
				fork: fork.transcript,
				parentEntry: cloneSessionEntry(freshParent),
				sessionEntry: cloneSessionEntry(next)
			};
		}, toDatabaseOptions(resolved));
		emitCommittedSessionIdentityDiff(previousIdentity, currentIdentity);
		return result;
	});
}
function persistSqliteParentForkSkipPatch(params) {
	if (!params.patch) return cloneSessionEntry(params.entry);
	const merged = mergeSessionEntry(params.entry, params.patch);
	const next = preserveSqliteSameKeySessionRolloverLineage({
		next: merged,
		previous: params.entry,
		sessionKey: params.sessionKey
	});
	let previousIdentity = /* @__PURE__ */ new Map();
	let currentIdentity = /* @__PURE__ */ new Map();
	runOpenClawAgentWriteTransaction((database) => {
		previousIdentity = readSessionIdentitySnapshot(database, [params.sessionKey]);
		writeSessionEntry(database, params.sessionKey, next, { previousEntry: params.entry });
		currentIdentity = readSessionIdentitySnapshot(database, [params.sessionKey]);
	}, toDatabaseOptions(params.resolved));
	emitCommittedSessionIdentityDiff(previousIdentity, currentIdentity);
	return cloneSessionEntry(next);
}
async function resolveSessionParentForkDecision(params) {
	const parentSessionId = typeof params.parentEntry.sessionId === "string" ? params.parentEntry.sessionId : "";
	if (!(typeof resolveFreshSessionTotalTokens(params.parentEntry) !== "number" && parentSessionId.length > 0)) return planParentForkDecision(params.parentEntry);
	const resolved = resolveSqliteStoreScope(params.storePath);
	const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
	return planParentForkDecision(params.parentEntry, estimateTranscriptPromptTokens(loadTranscriptEventsFromDatabase(database, parentSessionId)));
}
function forkSqliteParentTranscriptInTransaction(database, resolved, params) {
	if (!params.parentEntry.sessionId) return { status: "missing-parent" };
	const source = resolveParentForkSourceTranscript(loadTranscriptEventsFromDatabase(database, params.parentEntry.sessionId), params.forkFrom);
	if (!source) return { status: "failed" };
	const limitDecision = resolveParentForkLimitDecision(params, source);
	if (limitDecision) return {
		status: "too-large",
		decision: limitDecision
	};
	const sessionId = params.targetSessionId ?? randomUUID();
	const targetScope = {
		...resolved,
		sessionId,
		sessionKey: normalizeSqliteSessionKey(params.targetSessionKey)
	};
	const parentSessionFile = formatLegacySqliteSessionMarkerForScope({
		...resolved,
		sessionId: params.parentEntry.sessionId,
		sessionKey: normalizeSqliteSessionKey(params.parentSessionKey)
	});
	const sessionFile = formatSqliteSessionReferenceForScope(targetScope);
	writeSqliteForkedChildTranscriptInTransaction(database, targetScope, {
		parentSessionFile,
		source
	});
	return {
		status: "created",
		transcript: {
			sessionFile,
			sessionId
		}
	};
}
function resolveParentForkLimitDecision(params, source) {
	if (!params.enforceTokenLimit) return;
	const decision = planParentForkDecision(params.parentEntry, estimateTranscriptPromptTokens(source.branchEntries), {
		maxTokens: params.maxTokens,
		preferTranscriptEstimate: params.forkFrom === "last-completed"
	});
	return decision.status === "skip" ? decision : void 0;
}
function writeSqliteForkedChildTranscriptInTransaction(database, targetScope, params) {
	appendTranscriptEventsInTransaction(database, targetScope, buildForkedChildTranscriptEvents({
		parentSessionFile: params.parentSessionFile,
		source: params.source,
		targetSessionId: targetScope.sessionId
	}));
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-transcript-anchor.ts
/** Reads one active message identity from the caller's current SQLite transaction. */
function readActiveTranscriptEntryAnchorInTransaction(params) {
	if (sessionTranscriptIndexNeedsReconcile(params.database.db, params.resolved.sessionId)) return;
	const db = getSessionKysely(params.database.db);
	const row = executeSqliteQueryTakeFirstSync(params.database.db, db.selectFrom("transcript_event_identities as identity").innerJoin("session_transcript_active_events as active", (join) => join.onRef("active.session_id", "=", "identity.session_id").onRef("active.event_seq", "=", "identity.seq")).innerJoin("transcript_rewrite_watermarks as rewrite", (join) => join.onRef("rewrite.session_id", "=", "identity.session_id")).select([
		"identity.seq",
		"identity.parent_id",
		"identity.message_idempotency_key",
		"active.message_position",
		"rewrite.generation"
	]).where("identity.session_id", "=", params.resolved.sessionId).where("identity.event_id", "=", params.entryId).limit(1));
	if (row?.message_position === null || row?.message_position === void 0) return;
	const idempotencyKey = row.message_idempotency_key ?? readMessageIdempotencyKey(params.message);
	return Object.freeze({
		agentId: params.resolved.agentId,
		sessionId: params.resolved.sessionId,
		sessionKey: params.resolved.sessionKey,
		storePath: params.database.path,
		generation: row.generation,
		entryId: params.entryId,
		rawSeq: row.seq,
		effectiveParentId: row.parent_id,
		activeMessagePosition: row.message_position,
		...idempotencyKey ? { idempotencyKey } : {}
	});
}
/** Reads one active message identity from the authoritative SQLite projection. */
function readActiveTranscriptEntryAnchor(params) {
	const resolved = resolveSqliteTranscriptScope(params);
	return readActiveTranscriptEntryAnchorInTransaction({
		database: openOpenClawAgentDatabase(toDatabaseOptions(resolved)),
		resolved,
		entryId: params.entryId
	});
}
//#endregion
//#region src/config/sessions/transcript-visible-events.ts
/** Selects the active visible branch while preserving original transcript sequence numbers. */
function selectVisibleTranscriptEventEntries(events) {
	const tree = scanSessionTranscriptTree(events);
	const visiblePath = selectSessionTranscriptTreePathNodes(tree, tree.leafId);
	if (visiblePath.length > 0) return visiblePath.map((node) => ({
		event: node.entry,
		parentId: node.parentId,
		seq: node.index + 1
	}));
	return tree.hasLeafControl ? [] : events.map((event, index) => ({
		event,
		parentId: null,
		seq: index + 1
	}));
}
/** Selects only events on the active visible transcript branch. */
function selectVisibleTranscriptEvents(events) {
	return selectVisibleTranscriptEventEntries(events).map((entry) => entry.event);
}
/** Resolves the parent id that the next active transcript append should use. */
function resolveVisibleTranscriptAppendParentId(events) {
	return scanSessionTranscriptTree(events).appendParentId;
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-transcript-parent.ts
/** Resolves the effective parent for a transcript message append inside the write transaction. */
function resolveTranscriptMessageAppendParent(database, sessionId, options) {
	const tailId = readActiveTranscriptAppendParentId(database, sessionId);
	if (options.parentId === void 0) return tailId;
	if (options.appendIntent !== "active-branch" || tailId === options.parentId) return options.parentId;
	const db = getSessionKysely(database.db);
	const countRow = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_event_identities").select((expression) => expression.fn.countAll().as("count")).where("session_id", "=", sessionId));
	const maxAncestors = Number(countRow?.count ?? 0);
	let ancestorId = tailId;
	for (let depth = 0; depth <= maxAncestors; depth += 1) {
		if (ancestorId === options.parentId) return tailId;
		if (ancestorId === null) break;
		const row = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_event_identities").select("parent_id").where("session_id", "=", sessionId).where("event_id", "=", ancestorId));
		if (!row) break;
		ancestorId = row.parent_id;
	}
	return options.parentId;
}
function readActiveTranscriptAppendParentId(database, sessionId) {
	const db = getSessionKysely(database.db);
	const latest = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_event_identities as ti").innerJoin("transcript_events as te", (join) => join.onRef("te.session_id", "=", "ti.session_id").onRef("te.seq", "=", "ti.seq")).select((eb) => ["ti.event_type", projectTranscriptNavigationSql(eb.ref("te.event_json")).as("event_json")]).where("ti.session_id", "=", sessionId).orderBy("ti.seq", "desc").limit(1));
	if (!latest) return null;
	const resolveFromNavigation = () => resolveVisibleTranscriptAppendParentId(Array.from(iterateSqliteQuerySync(database.db, db.selectFrom("transcript_events").select((eb) => projectTranscriptNavigationSql(eb.ref("event_json")).as("event_json")).where("session_id", "=", sessionId).orderBy("seq", "asc")), (row) => JSON.parse(row.event_json)));
	try {
		const event = JSON.parse(latest.event_json);
		const treeEntry = parseSessionTranscriptTreeEntry(event);
		if (!treeEntry) return resolveFromNavigation();
		if (latest.event_type !== "leaf") return treeEntry.appendParentId;
		const leafReferencesKnown = treeEntry.leafId !== void 0 && transcriptTreeReferenceExists(database, sessionId, treeEntry.leafId) && transcriptTreeReferenceExists(database, sessionId, treeEntry.appendParentId);
		if (isSessionTranscriptLeafControl(event) && leafReferencesKnown) return treeEntry.appendParentId;
	} catch {}
	return resolveFromNavigation();
}
function transcriptTreeReferenceExists(database, sessionId, eventId) {
	return eventId === null || readTranscriptIdentityByEventId(database, sessionId, eventId) !== void 0;
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-transcript-message-append.ts
var TranscriptTurnAdmissionConflictError = class extends Error {
	constructor(idempotencyKey) {
		super(`Transcript idempotency key "${idempotencyKey}" conflicts with the admitted message.`);
		this.name = "TranscriptTurnAdmissionConflictError";
	}
};
function messagesMatchForIdempotentReplay(stored, candidate) {
	const serializedShape = (message) => {
		if (!isRecord(message)) return message;
		const { timestamp: _timestamp, ...stable } = message;
		const serialized = JSON.stringify(stable);
		return serialized === void 0 ? void 0 : JSON.parse(serialized);
	};
	return isDeepStrictEqual(serializedShape(stored), serializedShape(candidate));
}
function appendTranscriptMessageInTransaction(database, resolved, options) {
	const pending = resolveSessionPendingInputAppend(database, resolved, options.message);
	if (pending && readSessionEntryRow(database, resolved.sessionKey)?.entry.sessionId !== resolved.sessionId) throw new Error("Pending input session changed before transcript promotion");
	const serializeForStorage = (message) => options.messageAlreadyRedacted ? message : redactTranscriptMessageForStorage(message, options);
	const readAnchor = (params) => readActiveTranscriptEntryAnchorInTransaction({
		database,
		resolved,
		entryId: params.messageId,
		message: params.message
	});
	const existingAppendResult = (found) => {
		const anchor = readAnchor(found);
		if (pending) {
			if (found.messageId !== pending.inputId || !messagesMatchForIdempotentReplay(found.message, pending.message)) throw new TranscriptTurnAdmissionConflictError(pending.inputId);
			if (!anchor) throw new Error("Pending input is no longer active in its admitted transcript");
			consumeSessionPendingInput(database, pending);
		}
		return {
			appended: false,
			...anchor ? { anchor } : {},
			effectiveParentId: readTranscriptIdentityByEventId(database, resolved.sessionId, found.messageId)?.parentId ?? null,
			message: found.message,
			messageId: found.messageId
		};
	};
	const idempotencyKey = readMessageIdempotencyKey(options.message);
	if (idempotencyKey && options.idempotencyLookup !== "caller-checked") {
		const existing = readTranscriptMessageByScopedIdempotencyKey(database, resolved, idempotencyKey, options.idempotencyLookup);
		if (existing) {
			if (!options.prepareMessageAfterIdempotencyCheck && !messagesMatchForIdempotentReplay(existing.message, serializeForStorage(options.message))) throw new TranscriptTurnAdmissionConflictError(idempotencyKey);
			return existingAppendResult(existing);
		}
	}
	if (pending?.alreadyPromoted) {
		const committed = readTranscriptMessageByEventId(database, resolved, pending.inputId);
		if (!committed) throw new Error("Pending input custody ended before transcript promotion");
		return existingAppendResult(committed);
	}
	const prepared = pending ? pending.message : options.prepareMessageAfterIdempotencyCheck ? options.prepareMessageAfterIdempotencyCheck(options.message) : options.message;
	if (prepared === void 0) return;
	const messageId = pending?.inputId ?? options.eventId ?? randomUUID();
	const now = options.now ?? Date.now();
	const finalMessage = pending ? prepared : serializeForStorage(prepared);
	ensureTranscriptHeader(database, resolved, options.cwd);
	const parentId = resolveTranscriptMessageAppendParent(database, resolved.sessionId, options);
	const event = {
		type: "message",
		id: messageId,
		parentId: parentId ?? null,
		timestamp: resolveTimestampMsToIsoString(now),
		message: finalMessage
	};
	const appended = appendTranscriptEventInTransaction(database, resolved, event, { idempotencyKeyMode: options.idempotencyLookup === "caller-checked" ? "relocate-owner" : options.idempotencyLookup === "scan-assistant" ? "preserve-owner" : "dedupe" });
	if (!appended && idempotencyKey && options.idempotencyLookup !== "caller-checked") {
		const existing = readTranscriptMessageByScopedIdempotencyKey(database, resolved, idempotencyKey, options.idempotencyLookup);
		if (existing) {
			if (!options.prepareMessageAfterIdempotencyCheck && !messagesMatchForIdempotentReplay(existing.message, finalMessage)) throw new TranscriptTurnAdmissionConflictError(idempotencyKey);
			return existingAppendResult(existing);
		}
	}
	if (!appended) {
		const existing = readTranscriptMessageByEventId(database, resolved, messageId);
		if (existing) {
			if (!options.prepareMessageAfterIdempotencyCheck && !messagesMatchForIdempotentReplay(existing.message, finalMessage)) throw new TranscriptTurnAdmissionConflictError(idempotencyKey ?? `event:${messageId}`);
			return existingAppendResult(existing);
		}
	}
	if (!appended) throw new Error(`SQLite transcript append did not insert message ${messageId}.`);
	const anchor = readAnchor({
		message: finalMessage,
		messageId
	});
	if (pending) consumeSessionPendingInput(database, pending);
	return {
		appended: true,
		...anchor ? { anchor } : {},
		effectiveParentId: parentId ?? null,
		message: finalMessage,
		messageId
	};
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-transcript-mirror.ts
const TRANSCRIPT_MIRROR_KEY_QUERY_BATCH_SIZE = 900;
/** Returns raw events only when the transcript identity projection is not current. */
function loadTranscriptEventsForMirrorFallback(database, sessionId) {
	const db = getSessionKysely(database.db);
	const latest = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_events").select("seq").where("session_id", "=", sessionId).orderBy("seq", "desc").limit(1));
	if (!latest) return [];
	const state = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_transcript_index_state").select(["indexed_seq", "needs_rebuild"]).where("session_id", "=", sessionId));
	if (state && state.needs_rebuild === 0 && state.indexed_seq === latest.seq) return;
	return loadTranscriptEventsFromDatabase(database, sessionId);
}
/** Reads the bounded identity facts needed by transcript mirrors. */
function readTranscriptMirrorFacts(database, resolved, params) {
	return runSqliteDeferredTransactionSync(database.db, () => readTranscriptMirrorFactsInSnapshot(database, resolved, params), {
		databaseLabel: database.path,
		operationLabel: "session.transcript.mirror-facts"
	});
}
/** Reads mirror facts after the caller has established one SQLite snapshot. */
function readTranscriptMirrorFactsInSnapshot(database, resolved, params) {
	const idempotencyKeys = [...new Set(params.idempotencyKeys)];
	const fallbackEvents = loadTranscriptEventsForMirrorFallback(database, resolved.sessionId);
	if (fallbackEvents !== void 0) return readMirrorFactsFromEvents(fallbackEvents, new Set(idempotencyKeys));
	const db = getSessionKysely(database.db);
	const facts = {
		anchorsByIdempotencyKey: /* @__PURE__ */ new Map(),
		existingIdempotencyKeys: /* @__PURE__ */ new Set(),
		messagesByIdempotencyKey: /* @__PURE__ */ new Map()
	};
	for (let offset = 0; offset < idempotencyKeys.length; offset += TRANSCRIPT_MIRROR_KEY_QUERY_BATCH_SIZE) {
		const batch = idempotencyKeys.slice(offset, offset + TRANSCRIPT_MIRROR_KEY_QUERY_BATCH_SIZE);
		const rows = executeSqliteQuerySync(database.db, db.selectFrom("transcript_event_identities as identity").innerJoin("transcript_events as event", (join) => join.onRef("event.session_id", "=", "identity.session_id").onRef("event.seq", "=", "identity.seq")).select([
			"identity.event_id",
			"identity.message_idempotency_key",
			"event.event_json"
		]).where("identity.session_id", "=", resolved.sessionId).where("identity.message_idempotency_key", "in", batch).orderBy("identity.seq", "asc")).rows;
		for (const row of rows) {
			const idempotencyKey = row.message_idempotency_key;
			if (!idempotencyKey) continue;
			facts.existingIdempotencyKeys.add(idempotencyKey);
			const anchor = readActiveTranscriptEntryAnchorInTransaction({
				database,
				resolved,
				entryId: row.event_id
			});
			if (anchor) facts.anchorsByIdempotencyKey.set(idempotencyKey, anchor);
			const message = readTranscriptEventMessage(JSON.parse(row.event_json));
			if (message !== void 0) facts.messagesByIdempotencyKey.set(idempotencyKey, message);
		}
	}
	return facts;
}
/** Extracts supplied mirror identities from authoritative transcript events. */
function readMirrorFactsFromEvents(events, candidateKeys) {
	const facts = {
		anchorsByIdempotencyKey: /* @__PURE__ */ new Map(),
		existingIdempotencyKeys: /* @__PURE__ */ new Set(),
		messagesByIdempotencyKey: /* @__PURE__ */ new Map()
	};
	for (const event of events) {
		const message = readTranscriptEventMessage(event);
		const idempotencyKey = readMessageIdempotencyKey(message);
		if (!idempotencyKey || !candidateKeys.has(idempotencyKey)) continue;
		facts.existingIdempotencyKeys.add(idempotencyKey);
		if (message !== void 0) facts.messagesByIdempotencyKey.set(idempotencyKey, message);
	}
	return facts;
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-transcript-sequences.ts
const committedTranscriptMessageSequences = /* @__PURE__ */ new WeakMap();
/** Reads the visible-message sequence captured from the final active branch. */
function readCommittedTranscriptMessageSequence(message) {
	return committedTranscriptMessageSequences.get(message);
}
/** Captures atomic turn cursors from the final projection before SQLite commits. */
function rememberCommittedTranscriptMessageSequencesInTransaction(database, sessionId, messages) {
	const appendedMessages = messages.filter((message) => message.appended);
	for (const message of appendedMessages) committedTranscriptMessageSequences.delete(message);
	if (appendedMessages.length === 0) return;
	const db = getNodeSqliteKysely(database.db);
	if (executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_transcript_index_state").select("needs_rebuild").where("session_id", "=", sessionId))?.needs_rebuild !== 0) return;
	for (const message of appendedMessages) {
		const identity = readTranscriptIdentityByEventId(database, sessionId, message.messageId);
		if (!identity) continue;
		const active = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_transcript_active_events").select("message_position").where("session_id", "=", sessionId).where("event_seq", "=", identity.seq));
		if (active?.message_position !== null && active?.message_position !== void 0) committedTranscriptMessageSequences.set(message, active.message_position + 1);
	}
}
/** Resolves final cursors while an ordinary turn still owns its writer transaction. */
function rememberCommittedTranscriptMessageSequences(scope, messages) {
	if (messages.length === 0 || !scope.agentId || !scope.sessionId || !scope.sessionKey) return;
	const resolved = resolveSqliteTranscriptScope({
		agentId: scope.agentId,
		sessionId: scope.sessionId,
		sessionKey: scope.sessionKey,
		...scope.storePath ? { storePath: scope.storePath } : {}
	});
	rememberCommittedTranscriptMessageSequencesInTransaction(openOpenClawAgentDatabase(toDatabaseOptions(resolved)), resolved.sessionId, messages);
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-transcript-write.ts
var SqliteTranscriptMutationConflictError = class extends Error {
	constructor(sessionId) {
		super(`SQLite transcript changed while preparing rewrite for ${sessionId}`);
		this.name = "SqliteTranscriptMutationConflictError";
	}
};
async function replaceTranscriptEvents(scope, events) {
	const resolved = resolveSqliteTranscriptScope(scope);
	await runExclusiveSqliteSessionWrite(resolved, async () => {
		runOpenClawAgentWriteTransaction((database) => {
			replaceSqliteTranscriptEventsInTransaction(database, resolved, events);
		}, toDatabaseOptions(resolved));
	});
}
/** Rewrites exact transcript rows after atomically validating their generation and bytes. */
async function rewriteTranscriptEventRowsExact(scope, params) {
	if (params.rows.length === 0) return null;
	const resolved = resolveSqliteTranscriptScope(scope);
	return await runExclusiveSqliteSessionWrite(resolved, async () => {
		let result = null;
		runOpenClawAgentWriteTransaction((database) => {
			const currentGeneration = readTranscriptGenerationInTransaction(database, resolved.sessionId) ?? null;
			const initialGenerationMaterialized = params.allowInitialGenerationMaterialization === true && params.expectedGeneration === null;
			if (currentGeneration !== params.expectedGeneration && !initialGenerationMaterialized) return;
			rewriteSqliteTranscriptEventRowsInTransaction(database, resolved, params.rows);
			const generation = readTranscriptGenerationInTransaction(database, resolved.sessionId);
			if (generation) result = { generation };
		}, toDatabaseOptions(resolved));
		return result;
	});
}
/** Fully replaces rows for one transcript synchronously for sync session runtimes. */
function replaceTranscriptEventsSync(scope, events) {
	const fencedScope = withOwnedSessionTranscriptWriterFence(scope);
	const resolved = resolveSqliteTranscriptScope(fencedScope);
	let replaced = false;
	runOpenClawAgentWriteTransaction((database) => {
		assertOwnedTranscriptWriteCommit(fencedScope);
		const fresh = readSessionEntryRow(database, resolved.sessionKey);
		if (!fresh || fresh.entry.sessionId !== resolved.sessionId || fencedScope.expectedLifecycleRevision !== void 0 && fresh.entry.lifecycleRevision !== fencedScope.expectedLifecycleRevision || fencedScope.expectedWriterRunId !== void 0 && fresh.entry.activeWriterRunId !== fencedScope.expectedWriterRunId) return;
		replaceSqliteTranscriptEventsInTransaction(database, resolved, events);
		replaced = true;
	}, toDatabaseOptions(resolved));
	if (fencedScope.expectedWriterRunId !== void 0 && !replaced) throw new SessionTranscriptWriterClaimReboundError();
	return replaced;
}
async function trimTranscriptForManualCompact(scope, selectRetainedLines, options = {}) {
	const resolved = resolveSqliteTranscriptScope(scope);
	return await runExclusiveSqliteSessionWrite(resolved, async () => {
		const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
		const snapshotRows = readTranscriptEventRows(database, resolved.sessionId);
		const sessionSnapshot = readSessionEntrySelectionSnapshot(database, resolved.sessionKey, true);
		const retainedLines = selectRetainedLines(snapshotRows.map((row) => row.eventJson));
		if (!retainedLines) return { trimmed: false };
		if (sessionSnapshot[0]?.entry.sessionId !== resolved.sessionId) throw new Error(`Cannot compact SQLite transcript ${resolved.sessionId} without its current session entry`);
		const retainedEvents = retainedLines.map((line) => JSON.parse(line));
		let previousIdentity = /* @__PURE__ */ new Map();
		let currentIdentity = /* @__PURE__ */ new Map();
		runOpenClawAgentWriteTransaction((writeDatabase) => {
			assertSqliteTranscriptSnapshotUnchanged(writeDatabase, resolved.sessionId, snapshotRows);
			const freshSessionSnapshot = readSessionEntrySelectionSnapshot(writeDatabase, resolved.sessionKey, true);
			assertLifecycleTargetSnapshotUnchanged(sessionSnapshot, freshSessionSnapshot, "session.transcript.manual-compact");
			const freshEntry = freshSessionSnapshot[0]?.entry;
			if (!freshEntry || freshEntry.sessionId !== resolved.sessionId) throw new Error(`SQLite session changed before compacting ${resolved.sessionId}`);
			const identityKeys = collectSessionEntryLookupKeys(writeDatabase, resolved.sessionKey);
			previousIdentity = readSessionIdentitySnapshot(writeDatabase, identityKeys);
			replaceSqliteTranscriptEventsInTransaction(writeDatabase, resolved, retainedEvents);
			const nextEntry = cloneSessionEntry(freshEntry);
			delete nextEntry.contextBudgetStatus;
			delete nextEntry.inputTokens;
			delete nextEntry.outputTokens;
			delete nextEntry.totalTokens;
			delete nextEntry.totalTokensFresh;
			delete nextEntry.totalTokensVersion;
			clearAllCliSessions(nextEntry);
			nextEntry.updatedAt = options.nowMs ?? Date.now();
			writeSessionEntry(writeDatabase, resolved.sessionKey, nextEntry, { previousEntry: freshEntry });
			currentIdentity = readSessionIdentitySnapshot(writeDatabase, identityKeys);
		}, toDatabaseOptions(resolved));
		emitCommittedSessionIdentityDiff(previousIdentity, currentIdentity);
		return {
			kept: retainedLines.length,
			trimmed: true
		};
	});
}
/** Appends one raw transcript event to the additive SQLite transcript store. */
async function appendTranscriptEvent(scope, event, options = {}) {
	assertNonMessageTranscriptEvent(event);
	const resolved = resolveSqliteTranscriptScope(scope);
	await runExclusiveSqliteSessionWrite(resolved, async () => {
		runOpenClawAgentWriteTransaction((database) => {
			options.beforeCommitInTransaction?.();
			appendTranscriptEventInTransaction(database, resolved, resolveTranscriptEventAppendParent(database, resolved.sessionId, event, options));
		}, toDatabaseOptions(resolved));
	});
}
/** Appends one raw non-message transcript event synchronously for sync session runtimes. */
function appendTranscriptEventSync(scope, event, options = {}) {
	assertNonMessageTranscriptEvent(event);
	const fencedScope = withOwnedSessionTranscriptWriterFence(scope);
	const resolved = resolveSqliteTranscriptScope(fencedScope);
	let result = ok(false);
	runOpenClawAgentWriteTransaction((database) => {
		options.beforeCommitInTransaction?.();
		assertOwnedTranscriptWriteCommit(fencedScope);
		const refusal = resolveTranscriptAppendRefusal(readSessionEntryRow(database, resolved.sessionKey)?.entry, resolved, fencedScope);
		if (refusal) {
			result = err(refusal);
			return;
		}
		result = ok(appendTranscriptEventInTransaction(database, resolved, resolveTranscriptEventAppendParent(database, resolved.sessionId, event, options)));
	}, toDatabaseOptions(resolved));
	if (fencedScope.expectedWriterRunId !== void 0 && !result.ok) throw new SessionTranscriptWriterClaimReboundError(result.error);
	return result;
}
function resolveTranscriptEventAppendParent(database, sessionId, event, options) {
	if (options.appendIntent !== "active-branch" || !event || typeof event !== "object" || Array.isArray(event) || !("parentId" in event)) return event;
	const parentId = event.parentId;
	if (parentId !== null && typeof parentId !== "string") return event;
	const effectiveParentId = resolveTranscriptMessageAppendParent(database, sessionId, {
		appendIntent: "active-branch",
		parentId
	});
	return effectiveParentId === parentId ? event : {
		...event,
		parentId: effectiveParentId
	};
}
async function appendTranscriptMessage(scope, options) {
	const resolved = resolveSqliteTranscriptScope(scope);
	return await runExclusiveSqliteSessionWrite(resolved, async () => {
		let result;
		runOpenClawAgentWriteTransaction((database) => {
			result = appendTranscriptMessageInTransaction(database, resolved, options);
		}, toDatabaseOptions(resolved));
		return result;
	});
}
/** Appends one transcript message synchronously for sync session runtimes. */
function appendTranscriptMessageSync(scope, options) {
	const fencedScope = withOwnedSessionTranscriptWriterFence(scope);
	const resolved = resolveSqliteTranscriptScope(fencedScope);
	let result = ok(void 0);
	runOpenClawAgentWriteTransaction((database) => {
		assertOwnedTranscriptWriteCommit(fencedScope);
		const refusal = resolveTranscriptAppendRefusal(readSessionEntryRow(database, resolved.sessionKey)?.entry, resolved, fencedScope);
		if (refusal) {
			result = err(refusal);
			return;
		}
		result = ok(appendTranscriptMessageInTransaction(database, resolved, options));
		assertOwnedTranscriptWriteCommit(fencedScope);
	}, toDatabaseOptions(resolved));
	if (fencedScope.expectedWriterRunId !== void 0 && !result.ok) throw new SessionTranscriptWriterClaimReboundError(result.error);
	return result;
}
function resolveTranscriptAppendRefusal(entry, resolved, scope) {
	if (entry && entry.sessionId === resolved.sessionId && (scope.expectedLifecycleRevision === void 0 || entry.lifecycleRevision === scope.expectedLifecycleRevision) && (scope.expectedWriterRunId === void 0 || entry.activeWriterRunId === scope.expectedWriterRunId)) return;
	const identity = {
		agentIdHash: redactIdentifier(resolved.agentId),
		expectedSessionIdHash: redactIdentifier(resolved.sessionId),
		sessionKeyHash: redactIdentifier(resolved.sessionKey)
	};
	if (!entry) return {
		...identity,
		code: "session-entry-missing"
	};
	return {
		...identity,
		actualSessionIdHash: redactIdentifier(entry.sessionId),
		code: "session-rebound"
	};
}
function assertLockedTranscriptWriteAllowed(database, resolved, scope) {
	const fencedScope = {
		...scope,
		sessionId: resolved.sessionId,
		sessionKey: resolved.sessionKey
	};
	assertOwnedTranscriptWriteCommit(fencedScope);
	if (fencedScope.expectedLifecycleRevision === void 0 && fencedScope.expectedWriterRunId === void 0) return;
	const refusal = resolveTranscriptAppendRefusal(readSessionEntryRow(database, resolved.sessionKey)?.entry, resolved, fencedScope);
	if (refusal) throw new SessionTranscriptWriterClaimReboundError(refusal);
}
/** Runs read/append transcript work under one SQLite writer-queue critical section. */
async function withTranscriptWriteLock(scope, run) {
	const fencedScope = withOwnedSessionTranscriptWriterFence(scope);
	const resolved = resolveSqliteTranscriptScope(fencedScope);
	const databaseOptions = toDatabaseOptions(resolved);
	return await runExclusiveSqliteSessionWrite(resolved, async () => {
		let transcriptSnapshot;
		return await run({
			readEvents: async () => {
				const database = openOpenClawAgentDatabase(databaseOptions);
				const snapshot = readTranscriptSnapshot(database, resolved.sessionId);
				transcriptSnapshot = {
					kind: "current",
					rows: snapshot.rows
				};
				return snapshot.events;
			},
			readMessageFacts: async (params) => readTranscriptMirrorFacts(openOpenClawAgentDatabase(databaseOptions), resolved, params),
			replaceEvents: async (events) => {
				if (transcriptSnapshot?.kind === "stale") throw new SqliteTranscriptMutationConflictError(resolved.sessionId);
				const expectedSnapshot = transcriptSnapshot?.rows;
				transcriptSnapshot = {
					kind: "current",
					rows: runOpenClawAgentWriteTransaction((writeDatabase) => {
						assertLockedTranscriptWriteAllowed(writeDatabase, resolved, fencedScope);
						if (expectedSnapshot !== void 0) assertSqliteTranscriptSnapshotUnchanged(writeDatabase, resolved.sessionId, expectedSnapshot);
						replaceSqliteTranscriptEventsInTransaction(writeDatabase, resolved, events);
						const nextRows = readTranscriptEventRows(writeDatabase, resolved.sessionId);
						assertLockedTranscriptWriteAllowed(writeDatabase, resolved, fencedScope);
						return nextRows;
					}, databaseOptions)
				};
			},
			appendMessage: async (options) => {
				let result;
				const snapshotState = transcriptSnapshot;
				let nextSnapshotState = snapshotState;
				runOpenClawAgentWriteTransaction((writeDatabase) => {
					assertLockedTranscriptWriteAllowed(writeDatabase, resolved, fencedScope);
					const snapshotStillCurrent = snapshotState?.kind === "current" ? isSqliteTranscriptSnapshotUnchanged(writeDatabase, resolved.sessionId, snapshotState.rows) : false;
					result = appendTranscriptMessageInTransaction(writeDatabase, resolved, options);
					if (snapshotState?.kind === "current") nextSnapshotState = snapshotStillCurrent ? {
						kind: "current",
						rows: readTranscriptEventRows(writeDatabase, resolved.sessionId)
					} : { kind: "stale" };
					assertLockedTranscriptWriteAllowed(writeDatabase, resolved, fencedScope);
				}, databaseOptions);
				transcriptSnapshot = nextSnapshotState;
				return result;
			},
			appendMessageWithMessageSequence: async (options) => {
				let result;
				let messageSeq;
				runOpenClawAgentWriteTransaction((writeDatabase) => {
					assertLockedTranscriptWriteAllowed(writeDatabase, resolved, fencedScope);
					result = appendTranscriptMessageInTransaction(writeDatabase, resolved, options);
					if (result) {
						rememberCommittedTranscriptMessageSequencesInTransaction(writeDatabase, resolved.sessionId, [result]);
						messageSeq = readCommittedTranscriptMessageSequence(result);
					}
					assertLockedTranscriptWriteAllowed(writeDatabase, resolved, fencedScope);
				}, databaseOptions);
				return {
					...messageSeq !== void 0 ? { messageSeq } : {},
					result
				};
			}
		});
	});
}
/** Runs synchronous transcript work under one writer queue and SQLite transaction. */
async function withTranscriptWriteTransaction(scope, run) {
	const resolved = resolveSqliteTranscriptScope(scope);
	return await runExclusiveSqliteSessionWrite(resolved, async () => runOpenClawAgentWriteTransaction(() => run({
		agentId: resolved.agentId,
		sessionId: resolved.sessionId,
		sessionKey: resolved.sessionKey,
		storePath: resolved.path ?? scope.storePath ?? resolveOpenClawAgentSqlitePath({
			agentId: resolved.agentId,
			env: resolved.env
		})
	}), toDatabaseOptions(resolved), { operationLabel: "session.transcript.batch" }));
}
function isSqliteTranscriptSnapshotUnchanged(database, sessionId, expected) {
	const current = readTranscriptEventRows(database, sessionId);
	return current.length === expected.length && current.every((row, index) => row.seq === expected[index]?.seq && row.eventJson === expected[index]?.eventJson);
}
function assertSqliteTranscriptSnapshotUnchanged(database, sessionId, expected) {
	if (!isSqliteTranscriptSnapshotUnchanged(database, sessionId, expected)) throw new SqliteTranscriptMutationConflictError(sessionId);
}
function assertNonMessageTranscriptEvent(event) {
	if (!event || typeof event !== "object" || Array.isArray(event)) return;
	if (event.type === "message") throw new Error("appendTranscriptEvent cannot write message transcript records; use appendTranscriptMessage instead.");
}
//#endregion
//#region src/config/sessions/session-accessor.entry-mutation.ts
async function forkSessionFromParentTranscript(params) {
	return await forkSessionTranscriptFromParent(params);
}
/**
* Creates or updates one session entry and initializes its transcript header as
* one SQLite-backed lifecycle operation. Callers do not compose row creation,
* transcript initialization, rollback, and normalized session identity.
*/
async function createSessionEntryWithTranscript(scope, createEntry, options = {}) {
	const storePath = resolveAccessStorePath(scope);
	const storeScope = {
		agentId: scope.agentId ?? resolveAgentIdFromSessionKey(scope.sessionKey),
		env: scope.env,
		storePath
	};
	const store = Object.fromEntries(listSessionEntriesCore(storeScope).map(({ sessionKey, entry }) => [sessionKey, entry]));
	const resolved = resolveSessionStoreEntryCore({
		store,
		sessionKey: scope.sessionKey
	});
	const created = await createEntry({
		existingEntry: resolved.existing ? { ...resolved.existing } : void 0,
		sessionEntries: cloneSessionEntries(store)
	});
	if (!created.ok) return {
		ok: false,
		error: created.error,
		phase: "entry"
	};
	try {
		await appendTranscriptEvent({
			...storeScope,
			sessionId: created.entry.sessionId,
			sessionKey: resolved.normalizedKey
		}, createSessionTranscriptHeader({
			cwd: options.cwd,
			sessionId: created.entry.sessionId
		}), options.commitGuard ? { beforeCommitInTransaction: options.commitGuard } : void 0);
	} catch (err) {
		options.commitGuard?.();
		return {
			ok: false,
			error: formatErrorMessage(err),
			phase: "transcript"
		};
	}
	const entry = created.entry;
	await applySessionEntryLifecycleMutation({
		...storeScope,
		removals: resolved.legacyKeys.map((sessionKey) => ({ sessionKey })),
		upserts: [{
			sessionKey: resolved.normalizedKey,
			entry
		}],
		skipMaintenance: true,
		...options.commitGuard ? { beforeCommitInTransaction: options.commitGuard } : {}
	});
	return {
		ok: true,
		entry,
		sessionFile: resolved.normalizedKey
	};
}
function cloneSessionEntries(store) {
	return Object.fromEntries(Object.entries(store).map(([sessionKey, entry]) => [sessionKey, { ...entry }]));
}
function collectSessionEntryKeys(...entries) {
	const keys = /* @__PURE__ */ new Set();
	for (const entry of entries) for (const key of Object.keys(entry)) keys.add(key);
	return [...keys];
}
function sessionEntryFieldEqual(left, right) {
	return Object.is(left, right) || isDeepStrictEqual(left, right);
}
function sessionEntryFieldUnset(hasValue, value) {
	return !hasValue || value === void 0;
}
function sessionEntryFieldUnchanged(params) {
	const { leftHasValue, leftValue, rightHasValue, rightValue } = params;
	if (sessionEntryFieldUnset(leftHasValue, leftValue) && sessionEntryFieldUnset(rightHasValue, rightValue)) return true;
	return leftHasValue === rightHasValue && sessionEntryFieldEqual(leftValue, rightValue);
}
function mergeConcurrentReplySessionMetadata(params) {
	const { currentEntry, preparedEntry, snapshotEntry } = params;
	if (!snapshotEntry || preparedEntry.sessionId !== snapshotEntry.sessionId) return preparedEntry;
	const merged = { ...preparedEntry };
	const mergedFields = merged;
	for (const key of collectSessionEntryKeys(currentEntry, preparedEntry, snapshotEntry)) {
		const currentHasValue = Object.hasOwn(currentEntry, key);
		const snapshotHasValue = Object.hasOwn(snapshotEntry, key);
		const preparedHasValue = Object.hasOwn(preparedEntry, key);
		const currentValue = currentEntry[key];
		const snapshotValue = snapshotEntry[key];
		const preparedValue = preparedEntry[key];
		const currentChanged = !sessionEntryFieldUnchanged({
			leftHasValue: currentHasValue,
			leftValue: currentValue,
			rightHasValue: snapshotHasValue,
			rightValue: snapshotValue
		});
		const preparedKeptSnapshot = sessionEntryFieldUnchanged({
			leftHasValue: preparedHasValue,
			leftValue: preparedValue,
			rightHasValue: snapshotHasValue,
			rightValue: snapshotValue
		});
		if (currentChanged && preparedKeptSnapshot) {
			if (currentHasValue) mergedFields[key] = currentValue;
			else delete mergedFields[key];
		}
	}
	return merged;
}
function createReplySessionInitializationRevision(entry) {
	if (!entry) return JSON.stringify(null);
	return JSON.stringify({ sessionId: entry.sessionId });
}
/** Updates an existing entry only; returns null when the session is absent. */
async function updateSessionEntry(scope, update, options = {}) {
	return await patchSessionEntryCore(scope, update, options);
}
/** Resolves one abort target identity without exposing the mutable store. */
function resolveSessionAbortTarget(scope) {
	const entry = loadSessionEntry(scope);
	if (!entry) return null;
	return {
		entry: { ...entry },
		sessionId: entry.sessionId,
		sessionKey: normalizeStoreSessionKey(scope.sessionKey)
	};
}
/**
* Resolves, marks, touches, and canonicalizes one abort target entry as a
* storage-sized operation. Runtime abort side effects remain with callers.
*/
async function markSessionAbortTarget(params) {
	const resolution = { target: null };
	try {
		const sessionKey = normalizeStoreSessionKey(params.scope.sessionKey);
		const updated = await patchSessionEntryCore(params.scope, (currentEntry) => {
			resolution.target = {
				entry: { ...currentEntry },
				persisted: false,
				sessionId: currentEntry.sessionId,
				sessionKey
			};
			const entry = {
				...currentEntry,
				abortedLastRun: true,
				updatedAt: params.now?.() ?? Date.now()
			};
			applySessionAbortCutoff(entry, params.resolveAbortCutoff?.({
				entry: { ...currentEntry },
				sessionKey
			}));
			return entry;
		}, {
			replaceEntry: true,
			skipMaintenance: true
		});
		return updated ? {
			entry: { ...updated },
			persisted: true,
			sessionId: updated.sessionId,
			sessionKey
		} : null;
	} catch (error) {
		const fallbackTarget = resolution.target;
		if (fallbackTarget) return {
			entry: fallbackTarget.entry,
			persisted: fallbackTarget.persisted,
			sessionId: fallbackTarget.sessionId,
			sessionKey: fallbackTarget.sessionKey,
			persistenceError: formatErrorMessage(error)
		};
		throw error;
	}
}
function applySessionAbortCutoff(entry, cutoff) {
	entry.abortCutoffMessageSid = cutoff?.messageSid;
	entry.abortCutoffTimestamp = cutoff?.timestamp;
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-recovery.ts
/**
* Atomically clones a tombstoned transcript, creates its successor, and records
* the revisioned source archive/link transition in the same agent database.
*/
async function recoverSessionEntryFromRestartTombstone(params) {
	const resolved = resolveSqliteStoreScope(params.storePath, { agentId: params.agentId });
	const sourceTarget = normalizeLifecycleTarget({
		...params.sourceTarget,
		storeKeys: [...params.sourceTarget.storeKeys]
	});
	const successorTarget = normalizeLifecycleTarget({
		...params.successorTarget,
		storeKeys: [...params.successorTarget.storeKeys]
	});
	let previousIdentity = /* @__PURE__ */ new Map();
	let currentIdentity = /* @__PURE__ */ new Map();
	let result = {
		status: "conflict",
		reason: "source-changed"
	};
	await runExclusiveSqliteSessionWrite(resolved, async () => {
		runOpenClawAgentWriteTransaction((database) => {
			const source = resolveLifecyclePrimaryEntry(database, sourceTarget)?.entry;
			const recovery = source?.mainRestartRecovery;
			const tombstone = recovery?.tombstone;
			if (!source?.sessionId || !recovery || !tombstone) {
				result = {
					status: "conflict",
					reason: "not-tombstoned"
				};
				return;
			}
			const recoveredSessionKey = tombstone.recoveredSessionKey;
			const recoveredSessionId = tombstone.recoveredSessionId;
			if (recoveredSessionKey || recoveredSessionId) {
				if (!recoveredSessionKey || !recoveredSessionId) {
					result = {
						status: "conflict",
						reason: "successor-missing"
					};
					return;
				}
				const linked = resolveLifecyclePrimaryEntry(database, normalizeLifecycleTarget({
					canonicalKey: recoveredSessionKey,
					storeKeys: [recoveredSessionKey]
				}))?.entry;
				if (!linked || linked.sessionId !== recoveredSessionId) {
					result = {
						status: "conflict",
						reason: "successor-missing"
					};
					return;
				}
				result = {
					status: "existing",
					sourceEntry: cloneSessionEntry(source),
					successorEntry: cloneSessionEntry(linked),
					successorKey: recoveredSessionKey
				};
				return;
			}
			if (source.sessionId !== params.expected.sessionId || source.lifecycleRevision !== params.expected.lifecycleRevision || recovery.cycleId !== params.expected.cycleId || recovery.revision !== params.expected.revision || source.pluginOwnerId !== params.expected.pluginOwnerId) {
				result = {
					status: "conflict",
					reason: "source-changed"
				};
				return;
			}
			if (resolveLifecyclePrimaryEntry(database, successorTarget)?.entry) {
				result = {
					status: "conflict",
					reason: "target-exists"
				};
				return;
			}
			const sourceEvents = loadTranscriptEventsFromDatabase(database, source.sessionId);
			const header = sourceEvents.find((event) => isRecord(event) && event.type === "session");
			if (!header) {
				result = {
					status: "conflict",
					reason: "transcript-missing"
				};
				return;
			}
			const successorSessionId = params.successorEntry.sessionId;
			const parentSession = formatLegacySqliteSessionMarkerForScope({
				...resolved,
				sessionId: source.sessionId,
				sessionKey: normalizeSqliteSessionKey(sourceTarget.canonicalKey)
			});
			appendTranscriptEventsInTransaction(database, {
				...resolved,
				sessionId: successorSessionId,
				sessionKey: normalizeSqliteSessionKey(successorTarget.canonicalKey)
			}, [{
				...createSessionTranscriptHeader({
					cwd: typeof header.cwd === "string" ? header.cwd : void 0,
					sessionId: successorSessionId
				}),
				parentSession
			}, ...sourceEvents.filter((event) => !(isRecord(event) && event.type === "session"))]);
			const now = Date.now();
			const nextSource = {
				...source,
				mainRestartRecovery: {
					...recovery,
					revision: recovery.revision + 1,
					tombstone: {
						...tombstone,
						recoveredSessionId: successorSessionId,
						recoveredSessionKey: successorTarget.canonicalKey
					}
				},
				archivedAt: source.archivedAt ?? now,
				...source.archivedBy === void 0 && params.archivedBy ? { archivedBy: params.archivedBy } : {},
				updatedAt: Math.max(now, (source.updatedAt ?? 0) + 1)
			};
			delete nextSource.pinnedAt;
			params.commitGuard?.();
			const identityKeys = [sourceTarget.canonicalKey, successorTarget.canonicalKey];
			previousIdentity = readSessionIdentitySnapshot(database, identityKeys);
			writeSessionEntry(database, successorTarget.canonicalKey, params.successorEntry);
			writeSessionEntry(database, sourceTarget.canonicalKey, nextSource, { previousEntry: source });
			currentIdentity = readSessionIdentitySnapshot(database, identityKeys);
			result = {
				status: "created",
				sourceEntry: cloneSessionEntry(nextSource),
				successorEntry: cloneSessionEntry(params.successorEntry),
				successorKey: successorTarget.canonicalKey
			};
		}, toDatabaseOptions(resolved));
	});
	emitCommittedSessionIdentityDiff(previousIdentity, currentIdentity);
	return result;
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-participants.ts
function recordSessionParticipant(scope, params) {
	const actorId = params.identity.id;
	if (!actorId || params.identity.type === "agent" && actorId === params.sessionAgentId) return null;
	const resolved = resolveSqliteScope(scope);
	const options = toDatabaseOptions(resolved);
	const promptedAt = params.promptedAt ?? Date.now();
	const namespace = participantIdentityNamespace(params.identity);
	const aliases = params.identity.type === "profile" ? readUserProfileAliases(actorId, { env: scope.env }) : void 0;
	return runOpenClawAgentWriteTransaction((database) => {
		if (ensureSessionParticipantsSchema(database.db)) deferOpenClawAgentPostCommitPublication(database, () => confirmSessionParticipantsSchemaEnsured(database.db));
		const kysely = getSessionKysely(database.db);
		const records = executeSqliteQuerySync(database.db, kysely.selectFrom("session_participants").selectAll().where("session_key", "=", resolved.sessionKey).orderBy("actor_id")).rows;
		const existing = records.find((row) => row.identity_namespace === namespace && row.actor_id === actorId) ?? records.find((row) => row.identity_namespace === namespace && aliases?.has(row.actor_id));
		if (!existing && records.length >= 32) return "capped";
		const aggregate = mergeParticipantAggregate(existing, {
			contribution_count: 1,
			first_prompted_at: promptedAt,
			last_prompted_at: promptedAt
		}, "sum");
		executeSqliteQuerySync(database.db, kysely.insertInto("session_participants").values({
			session_key: resolved.sessionKey,
			identity_namespace: namespace,
			actor_id: existing?.actor_id ?? actorId,
			...aggregate
		}).onConflict((conflict) => conflict.columns([
			"session_key",
			"identity_namespace",
			"actor_id"
		]).doUpdateSet(aggregate)));
		publishSessionEntryCacheInvalidation(database);
		deferOpenClawAgentPostCommitPublication(database, () => emitSessionLifecycleEvent({
			agentId: resolved.agentId,
			sessionKey: resolved.sessionKey,
			reason: "participants"
		}));
		return existing ? "updated" : "inserted";
	}, options, { operationLabel: "sessions.record-participant" });
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-canonical-inventory.ts
/** Doctor inventory hydrates rejected legacy blobs from promoted node/window columns. */
function hydrateCanonicalRepairEntry(row) {
	let record = {};
	try {
		const parsed = JSON.parse(row.entry_json);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) record = parsed;
	} catch {}
	const createdActor = row.created_actor_type ? {
		type: row.created_actor_type,
		...row.created_actor_type === "human" ? { source: "unknown" } : {},
		...row.created_actor_id ? { id: row.created_actor_id } : {}
	} : void 0;
	const forkSource = row.fork_source_session_key && row.fork_source_session_id ? {
		sessionKey: row.fork_source_session_key,
		sessionId: row.fork_source_session_id,
		...row.fork_source_entry_id ? { entryId: row.fork_source_entry_id } : {}
	} : void 0;
	const delivery = row.delivery_channel && row.delivery_target ? normalizeSessionDeliveryState({ context: {
		channel: row.delivery_channel,
		to: row.delivery_target,
		...row.delivery_account_id ? { accountId: row.delivery_account_id } : {},
		...row.delivery_thread_id ? { threadId: row.delivery_thread_id } : {}
	} }) : void 0;
	const entry = projectCanonicalSessionEntryShape({
		...record,
		...row.status ? { status: row.status } : {},
		...row.current_started_at !== null ? { startedAt: row.current_started_at } : {},
		...row.current_ended_at !== null ? { endedAt: row.current_ended_at } : {},
		...row.current_chat_type ? { chatType: row.current_chat_type } : {},
		...row.current_model_provider ? { modelProvider: row.current_model_provider } : {},
		...row.current_model ? { model: row.current_model } : {},
		...row.current_previous_session_id ? { previousSessionId: row.current_previous_session_id } : {},
		...row.current_agent_harness_id ? { agentHarnessId: row.current_agent_harness_id } : {},
		...delivery ? { delivery } : {},
		...row.created_at !== null ? { createdAt: row.created_at } : {},
		...row.created_via ? { createdVia: row.created_via } : {},
		...createdActor ? { createdActor } : {},
		...row.spawned_by ? { spawnedBy: row.spawned_by } : {},
		...row.parent_session_key && row.parent_session_key !== row.spawned_by ? { parentSessionKey: row.parent_session_key } : {},
		...forkSource ? { forkSource } : {},
		...row.label ? { label: row.label } : {},
		...row.display_name ? { displayName: row.display_name } : {},
		...row.category ? { category: row.category } : {},
		...row.icon ? { icon: row.icon } : {},
		...row.pinned_at !== null ? { pinnedAt: row.pinned_at } : {},
		...row.archived_at !== null ? { archivedAt: row.archived_at } : {},
		...row.last_read_at !== null ? { lastReadAt: row.last_read_at } : {},
		...row.last_interaction_at !== null ? { lastInteractionAt: row.last_interaction_at } : {},
		...row.last_activity_at !== null ? { lastActivityAt: row.last_activity_at } : {},
		sessionId: row.current_session_id,
		updatedAt: row.updated_at
	});
	return projectSqliteSessionOwner(entry, row);
}
function canonicalRepairQuery(database) {
	return getSessionKysely(database.db).selectFrom("session_nodes").leftJoin("session_windows as current_window", (join) => join.onRef("current_window.session_id", "=", "session_nodes.current_session_id").onRef("current_window.session_key", "=", "session_nodes.session_key")).leftJoin("session_windows as current_window_owner", "current_window_owner.session_id", "session_nodes.current_session_id").leftJoin("conversations as current_conversation", "current_conversation.conversation_id", "current_window.primary_conversation_id").selectAll("session_nodes").select([
		"current_window_owner.session_key as current_window_owner_session_key",
		"current_window.started_at as current_started_at",
		"current_window.ended_at as current_ended_at",
		"current_window.chat_type as current_chat_type",
		"current_window.model_provider as current_model_provider",
		"current_window.model as current_model",
		"current_window.previous_session_id as current_previous_session_id",
		"current_window.agent_harness_id as current_agent_harness_id",
		"current_conversation.channel as delivery_channel",
		"current_conversation.account_id as delivery_account_id",
		"current_conversation.delivery_target",
		"current_conversation.thread_id as delivery_thread_id"
	]).orderBy("session_nodes.session_key");
}
function scanCanonicalSessionFactsFromDatabase(database, selectedKeys) {
	const scanned = [];
	const loaded = /* @__PURE__ */ new Map();
	const validSessionKeysById = /* @__PURE__ */ new Map();
	const inventoriedSessionKeys = /* @__PURE__ */ new Set();
	for (const row of iterateSqliteQuerySync(database.db, canonicalRepairQuery(database))) {
		inventoriedSessionKeys.add(row.session_key);
		const persistedEntry = parseSessionEntryJson(row);
		if (row.entry_valid === 1 && persistedEntry) {
			const keys = validSessionKeysById.get(row.current_session_id) ?? [];
			keys.push(row.session_key);
			validSessionKeysById.set(row.current_session_id, keys);
		}
		const entry = persistedEntry ?? hydrateCanonicalRepairEntry(row);
		if (selectedKeys?.has(row.session_key)) loaded.set(row.session_key, {
			entry,
			rawEntryJson: row.entry_json
		});
		const lineageProjectionMismatch = Boolean(persistedEntry && ((row.parent_session_key ?? void 0) !== (persistedEntry.parentSessionKey ?? persistedEntry.spawnedBy ?? void 0) || (row.spawned_by ?? void 0) !== (persistedEntry.spawnedBy ?? void 0) || (row.fork_source_session_key ?? void 0) !== (persistedEntry.forkSource?.sessionKey ?? void 0)));
		const decision = {
			delivery: entry.delivery,
			forkSourceSessionKey: entry.forkSource?.sessionKey,
			groupId: entry.groupId,
			parentSessionKey: entry.parentSessionKey,
			rawCompareRequired: row.entry_valid !== 1 || !persistedEntry || lineageProjectionMismatch,
			sessionKey: row.session_key,
			spawnedBy: entry.spawnedBy
		};
		const context = deliveryContextFromSession(decision);
		const origin = sessionDeliveryOrigin(decision);
		scanned.push({
			currentSessionId: row.current_session_id,
			currentWindowOwnerSessionKey: row.current_window_owner_session_key,
			decision,
			entryJsonIsEmpty: row.entry_json === "{}",
			rowToken: JSON.stringify([
				row.session_key,
				row.current_session_id,
				row.entry_valid,
				persistedEntry !== null,
				row.entry_json === "{}",
				row.current_window_owner_session_key,
				context?.channel ?? null,
				context?.to ?? null,
				context?.threadId == null ? null : String(context.threadId),
				origin?.nativeChannelId ?? null,
				origin?.to ?? null,
				decision.groupId ?? null,
				decision.parentSessionKey ?? null,
				decision.spawnedBy ?? null,
				decision.forkSourceSessionKey ?? null,
				row.parent_session_key,
				row.spawned_by,
				row.fork_source_session_key,
				decision.rawCompareRequired
			])
		});
	}
	const inventoryHash = createHash("sha256");
	const facts = [];
	for (const fact of scanned) {
		const isEmptyWindowOwner = fact.entryJsonIsEmpty && fact.currentWindowOwnerSessionKey === fact.decision.sessionKey;
		const competingValidKeys = (validSessionKeysById.get(fact.currentSessionId) ?? []).filter((sessionKey) => sessionKey !== fact.decision.sessionKey).toSorted();
		const canonicalOwnerSessionKey = isEmptyWindowOwner ? competingValidKeys.length === 1 ? competingValidKeys[0] : void 0 : fact.entryJsonIsEmpty && fact.currentWindowOwnerSessionKey && inventoriedSessionKeys.has(fact.currentWindowOwnerSessionKey) ? fact.currentWindowOwnerSessionKey : void 0;
		const decisionToken = JSON.stringify([fact.rowToken, canonicalOwnerSessionKey ?? null]);
		inventoryHash.update(decisionToken).update("\0");
		if (!isEmptyWindowOwner || canonicalOwnerSessionKey) facts.push({
			...fact.decision,
			...canonicalOwnerSessionKey ? { canonicalOwnerSessionKey } : {},
			decisionToken
		});
	}
	const inventoryToken = inventoryHash.digest("base64url");
	return {
		facts: facts.map((fact) => Object.assign(fact, { inventoryToken })),
		inventoryToken,
		loaded
	};
}
function loadCanonicalRepairEntriesFromDatabase(database, facts) {
	const current = scanCanonicalSessionFactsFromDatabase(database, new Set(facts.map((fact) => fact.sessionKey)));
	const currentByKey = new Map(current.facts.map((fact) => [fact.sessionKey, fact]));
	const expectedInventoryTokens = new Set(facts.map((fact) => fact.inventoryToken));
	if (expectedInventoryTokens.size !== 1 || !expectedInventoryTokens.has(current.inventoryToken)) throw new Error("Canonical session repair inputs changed during scan; retry Doctor");
	return facts.map((fact) => {
		if (currentByKey.get(fact.sessionKey)?.decisionToken !== fact.decisionToken) throw new Error(`Canonical session repair inputs changed during scan for ${fact.sessionKey}; retry Doctor`);
		const loaded = current.loaded.get(fact.sessionKey);
		if (!loaded) throw new Error(`Canonical session repair row disappeared during scan: ${fact.sessionKey}`);
		return {
			entry: loaded.entry,
			sessionKey: fact.sessionKey,
			...fact.rawCompareRequired ? { rawEntryJson: loaded.rawEntryJson } : {}
		};
	});
}
function listCanonicalSessionRepairFacts(scope) {
	const resolved = resolveSqliteScope({
		...scope,
		sessionKey: ""
	});
	const result = withOpenClawAgentDatabaseReadOnly((database) => scanCanonicalSessionFactsFromDatabase(database).facts, toDatabaseOptions(resolved));
	return result.found ? result.value : [];
}
function loadCanonicalSessionRepairEntries(scope, facts) {
	if (facts.length === 0) return [];
	const resolved = resolveSqliteScope({
		...scope,
		sessionKey: ""
	});
	const result = withOpenClawAgentDatabaseReadOnly((database) => loadCanonicalRepairEntriesFromDatabase(database, facts), toDatabaseOptions(resolved));
	if (!result.found) throw new Error("Canonical session repair database disappeared during scan; retry Doctor");
	return result.value;
}
/** Strict Doctor scan of canonical rows, ordered by durable session key. */
function scanDoctorSessionEntriesStrict(scope, visit) {
	const resolved = resolveSqliteScope({
		...scope,
		sessionKey: ""
	});
	const result = withOpenClawAgentDatabaseReadOnly((database) => {
		let count = 0;
		scanCanonicalSqliteSessionEntries(database, ({ entry, sessionKey }) => {
			if (isInternalSessionEffectsKey(sessionKey)) return;
			visit({
				entry,
				recoveredFromProjections: false,
				sessionKey
			});
			count += 1;
		});
		return count;
	}, toDatabaseOptions(resolved));
	return result.found ? result.value : 0;
}
/** Tolerant Doctor preview scan with canonical-repair tombstone eligibility. */
function scanDoctorSessionEntriesTolerant(scope, visit) {
	const resolved = resolveSqliteScope({
		...scope,
		sessionKey: ""
	});
	const result = withOpenClawAgentDatabaseReadOnly((database) => {
		const eligible = new Set(scanCanonicalSessionFactsFromDatabase(database).facts.map((fact) => fact.sessionKey));
		let count = 0;
		for (const row of iterateSqliteQuerySync(database.db, canonicalRepairQuery(database))) {
			if (!eligible.has(row.session_key) || isInternalSessionEffectsKey(row.session_key)) continue;
			const entry = parseSessionEntryJson(row);
			visit({
				entry: entry ?? hydrateCanonicalRepairEntry(row),
				recoveredFromProjections: entry === null,
				sessionKey: row.session_key
			});
			count += 1;
		}
		return count;
	}, toDatabaseOptions(resolved));
	return result.found ? result.value : 0;
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-doctor-rewrite.ts
const DOCTOR_SESSION_REWRITE_BATCH_SIZE = 64;
function iterateDoctorSessionKeyBatches(sessionKeys) {
	return chunkItems(uniqueStrings(sessionKeys).toSorted(), DOCTOR_SESSION_REWRITE_BATCH_SIZE);
}
/** Rewrites bounded entry batches after rereading each authoritative row inside its commit. */
function rewriteDoctorSessionEntries(params) {
	const resolved = resolveSqliteScope({
		...params.scope,
		sessionKey: ""
	});
	let rewritten = 0;
	for (const batch of iterateDoctorSessionKeyBatches(params.sessionKeys)) rewritten += runOpenClawAgentWriteTransaction((database) => {
		const db = getSessionKysely(database.db);
		let batchRewritten = 0;
		for (const sessionKey of batch) {
			const row = executeSqliteQuerySync(database.db, db.selectFrom("session_nodes").select([
				"session_key",
				"current_session_id",
				"entry_json",
				"updated_at"
			]).where("session_key", "=", sessionKey)).rows[0];
			if (!row) continue;
			const entry = parseSqliteSessionEntryRecord(row);
			if (!entry) continue;
			const transformedEntry = params.transform(entry, sessionKey);
			const transformedJson = JSON.stringify(transformedEntry);
			if (transformedJson === row.entry_json) continue;
			const nextEntry = stripRuntimeOnlySessionSkillsFields(transformedEntry);
			const entryJson = nextEntry === transformedEntry ? transformedJson : JSON.stringify(nextEntry);
			if (!parseSqliteSessionEntryRecord({
				...row,
				entry_json: entryJson
			})) continue;
			const writeGeneration = trackSessionEntryCacheWrite(database, () => {
				executeSqliteQuerySync(database.db, db.updateTable("session_nodes").set({ entry_json: entryJson }).where("session_key", "=", sessionKey));
				executeSqliteQuerySync(database.db, db.updateTable("session_nodes").set({ entry_valid: 1 }).where("session_key", "=", sessionKey));
				if (params.updateDeliveryProjection) executeSqliteQuerySync(database.db, db.updateTable("session_windows").set({
					account_id: deliveryContextFromSession(nextEntry)?.accountId ?? null,
					channel: sessionDeliveryChannel(nextEntry) ?? null
				}).where("session_id", "=", row.current_session_id));
			});
			publishSessionEntryCacheInvalidation(database, {
				sessionKey,
				entry: nextEntry
			}, writeGeneration);
			batchRewritten += 1;
		}
		return batchRewritten;
	}, toDatabaseOptions(resolved), { operationLabel: "doctor.rewrite-session-entries" });
	return rewritten;
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-message-cut.ts
const BRANCH_HEADLINE_MAX_CHARS = 120;
const SESSION_BRANCH_CACHE_MAX_ENTRIES = 32;
const sessionBranchCache = /* @__PURE__ */ new Map();
function sessionBranchCacheKey(databasePath, sessionId) {
	return `${databasePath}\0${sessionId}`;
}
function cloneSessionBranchSummaries(branches) {
	return branches.map((branch) => ({ ...branch }));
}
function readSessionBranchWatermark(database, sessionId) {
	const db = getSessionKysely(database.db);
	const maxSeq = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_events").select((eb) => eb.fn.max("seq").as("max_seq")).where("session_id", "=", sessionId))?.max_seq;
	return {
		generation: executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_rewrite_watermarks").select("generation").where("session_id", "=", sessionId))?.generation ?? null,
		maxSeq: maxSeq ?? null
	};
}
function loadSessionBranchSummaries(database, sessionId) {
	const cacheKey = sessionBranchCacheKey(database.path, sessionId);
	const watermark = readSessionBranchWatermark(database, sessionId);
	const cached = sessionBranchCache.get(cacheKey);
	if (cached?.generation === watermark.generation && cached.maxSeq === watermark.maxSeq) {
		sessionBranchCache.delete(cacheKey);
		sessionBranchCache.set(cacheKey, cached);
		return cloneSessionBranchSummaries(cached.branches);
	}
	const branches = summarizeSessionBranches(loadTranscriptEventsFromDatabase(database, sessionId));
	sessionBranchCache.delete(cacheKey);
	sessionBranchCache.set(cacheKey, {
		...watermark,
		branches
	});
	pruneMapToMaxSize(sessionBranchCache, SESSION_BRANCH_CACHE_MAX_ENTRIES);
	return cloneSessionBranchSummaries(branches);
}
function invalidateSessionBranchCache(databasePath, sessionIds) {
	for (const sessionId of uniqueStrings(sessionIds)) sessionBranchCache.delete(sessionBranchCacheKey(databasePath, sessionId));
}
async function listSessionBranches(params) {
	const sourceKey = normalizeSqliteSessionKey(params.sessionStoreKey ?? params.sessionKey);
	const resolved = resolveSqliteScope({
		...params.agentId ? { agentId: params.agentId } : {},
		...params.env ? { env: params.env } : {},
		sessionKey: sourceKey,
		...params.storePath ? { storePath: params.storePath } : {}
	});
	try {
		const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
		const currentEntry = readSessionEntryRow(database, sourceKey)?.entry;
		if (!currentEntry?.sessionId) return { status: "missing-session" };
		return {
			status: "ok",
			branches: loadSessionBranchSummaries(database, currentEntry.sessionId)
		};
	} catch {
		return { status: "failed" };
	}
}
/** Resolves the active branch leaf from the same transcript tree used by branch listing. */
function resolveSessionTranscriptActiveLeafEntryId(events) {
	return scanSessionTranscriptTree(events).leafId ?? void 0;
}
async function rewindSessionToMessage(params, expectedState) {
	return await mutateSqliteSessionAtMessage(params, "rewind", expectedState);
}
async function forkSessionAtMessage(params, expectedState) {
	return await mutateSqliteSessionAtMessage(params, "fork", expectedState);
}
async function switchSessionBranch(params, expectedState) {
	return await mutateSqliteSessionAtMessage({
		...params,
		entryId: params.leafEntryId
	}, "switch", expectedState);
}
async function mutateSqliteSessionAtMessage(params, mode, expectedState) {
	const canonicalSourceKey = normalizeSqliteSessionKey(params.sessionKey);
	const sourceKey = normalizeSqliteSessionKey(params.sessionStoreKey ?? params.sessionKey);
	const targetKey = mode === "fork" ? normalizeSqliteSessionKey(params.targetKey ?? params.sessionKey) : sourceKey;
	const resolved = resolveSqliteScope({
		...params.agentId ? { agentId: params.agentId } : {},
		...params.env ? { env: params.env } : {},
		sessionKey: sourceKey,
		...params.storePath ? { storePath: params.storePath } : {}
	});
	const preparedEntry = readSessionEntryRow(openOpenClawAgentDatabase(toDatabaseOptions(resolved)), sourceKey)?.entry;
	const preparedExpectedState = expectedState ?? (preparedEntry?.sessionId ? {
		sessionId: preparedEntry.sessionId,
		lifecycleRevision: preparedEntry.lifecycleRevision
	} : void 0);
	return await runExclusiveSqliteSessionWrite(resolved, async () => {
		let previousIdentity = /* @__PURE__ */ new Map();
		let currentIdentity = /* @__PURE__ */ new Map();
		let databasePath;
		const result = runOpenClawAgentWriteTransaction((database) => {
			params.commitGuard?.();
			databasePath = database.path;
			const identityKeys = uniqueStrings([...collectSessionEntryLookupKeys(database, sourceKey), ...collectSessionEntryLookupKeys(database, targetKey)]);
			previousIdentity = readSessionIdentitySnapshot(database, identityKeys);
			const mutationResult = mutateSqliteSessionAtMessageInTransaction(database, resolved, {
				entryId: params.entryId,
				canonicalSourceKey,
				creation: params.creation,
				mode,
				expectedState: preparedExpectedState,
				sourceKey,
				targetKey
			});
			currentIdentity = readSessionIdentitySnapshot(database, identityKeys);
			return mutationResult;
		}, toDatabaseOptions(resolved));
		if (result.status === "created" && databasePath) invalidateSessionBranchCache(databasePath, [...[...previousIdentity.values()].flatMap((entry) => entry.sessionId ? [entry.sessionId] : []), ...result.entry.sessionId ? [result.entry.sessionId] : []]);
		emitCommittedSessionIdentityDiff(previousIdentity, currentIdentity);
		return result;
	});
}
function mutateSqliteSessionAtMessageInTransaction(database, resolved, params) {
	const currentEntry = readSessionEntryRow(database, params.sourceKey)?.entry;
	if (!currentEntry?.sessionId) return { status: "missing-session" };
	if (!params.expectedState || currentEntry.sessionId !== params.expectedState.sessionId || currentEntry.lifecycleRevision !== params.expectedState.lifecycleRevision) return { status: "conflict" };
	assertModelSelectionUnlocked(currentEntry, "Session history changes are unavailable while model selection is locked.");
	const events = loadTranscriptEventsFromDatabase(database, currentEntry.sessionId);
	const cut = params.mode === "switch" ? void 0 : resolveMessageCut(events, params.entryId);
	if (cut && cut.status !== "cut") return cut;
	if (params.mode === "switch") {
		const tipStatus = validateBranchTip(events, params.entryId);
		if (tipStatus) return { status: tipStatus };
	}
	const nextSessionId = randomUUID();
	const targetScope = {
		...resolved,
		sessionId: nextSessionId,
		sessionKey: params.targetKey
	};
	const header = createSessionTranscriptHeader({
		cwd: readTranscriptHeaderCwd(events),
		sessionId: nextSessionId
	});
	const nextEvents = params.mode === "fork" && cut?.status === "cut" ? [header, ...cut.prefix] : [
		header,
		...events.filter((event) => !isSessionHeader(event)),
		{
			type: "leaf",
			id: uniqueEntryId(events),
			parentId: readLastEventId(events),
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			targetId: params.mode === "switch" ? params.entryId : cut?.parentId ?? null
		}
	];
	let copiedBytes = 0;
	const rebuildSynchronously = params.mode !== "fork" && nextEvents.length <= 4e3 && nextEvents.every((event) => {
		copiedBytes += JSON.stringify(event).length;
		return copiedBytes <= 4194304;
	});
	if (params.mode !== "fork" && !rebuildSynchronously) {
		ensureTranscriptSessionRoot(database, targetScope, Date.parse(header.timestamp));
		markSessionTranscriptIndexDirtyInTransaction(database.db, nextSessionId);
	}
	appendTranscriptEventsInTransaction(database, targetScope, nextEvents);
	if (rebuildSynchronously) reconcileSessionTranscriptIndexInTransaction(database.db, nextSessionId);
	const nextEntry = {
		...cloneMessageCutSessionEntry({
			currentEntry,
			forked: params.mode === "fork",
			forkSource: params.mode === "fork" ? {
				sessionKey: params.canonicalSourceKey,
				sessionId: currentEntry.sessionId,
				entryId: params.entryId
			} : void 0,
			nextSessionId
		}),
		...params.mode === "fork" && params.creation ? buildSessionCreationStamp(params.creation) : {},
		...currentEntry.incognito === true || isIncognitoSessionKey(params.canonicalSourceKey) ? { incognito: true } : {}
	};
	writeSessionEntry(database, params.targetKey, nextEntry);
	return {
		status: "created",
		key: params.targetKey,
		entry: nextEntry,
		...cut?.status === "cut" && cut.editorText ? { editorText: cut.editorText } : {},
		...cut?.status === "cut" && cut.editorAttachments ? { editorAttachments: cut.editorAttachments } : {},
		...cut?.status === "cut" && cut.editorMediaRefs ? { editorMediaRefs: cut.editorMediaRefs } : {}
	};
}
function validateBranchTip(events, entryId) {
	const tree = scanSessionTranscriptTree(events);
	const target = tree.byId.get(entryId);
	if (!target) return "missing-entry";
	if (isSessionTranscriptLeafControl(target.entry)) return "not-branch-tip";
	if (!sessionBranchTipNodes(tree).some((node) => node.id === entryId)) return "not-branch-tip";
	return tree.leafId === entryId ? "already-active" : void 0;
}
function summarizeSessionBranches(events) {
	const tree = scanSessionTranscriptTree(events);
	const pathSummaries = /* @__PURE__ */ new Map();
	return sessionBranchTipNodes(tree).toSorted((left, right) => Number(right.id === tree.leafId) - Number(left.id === tree.leafId) || right.index - left.index).map((node) => summarizeSessionBranch(tree, tree.byId.get(node.id), pathSummaries));
}
function sessionBranchTipNodes(tree) {
	const referencedParents = new Set(tree.nodes.flatMap((node) => isSessionTranscriptLeafControl(node.entry) || node.parentId === null ? [] : [node.parentId]));
	return tree.nodes.filter((node) => !isSessionTranscriptLeafControl(node.entry) && (node.id === tree.leafId || !referencedParents.has(node.id)));
}
function summarizeSessionBranch(tree, leaf, summaries) {
	const uncachedPath = [];
	const seen = /* @__PURE__ */ new Set();
	let current = leaf;
	while (!summaries.has(current.id)) {
		if (seen.has(current.id)) {
			uncachedPath.length = 0;
			break;
		}
		seen.add(current.id);
		uncachedPath.push(current);
		const parent = current.parentId === null ? void 0 : tree.byId.get(current.parentId);
		if (!parent) break;
		current = parent;
	}
	let summary = summaries.get(current.id);
	for (const node of uncachedPath.toReversed()) {
		const record = asOptionalRecord(node.entry);
		summary = {
			headline: (record?.type === "message" ? extractHeadlineText(record.message) : void 0) ?? summary?.headline ?? "",
			messageCount: (summary?.messageCount ?? 0) + (record?.type === "message" ? 1 : 0)
		};
		summaries.set(node.id, summary);
	}
	const timestamp = asOptionalRecord(leaf.entry)?.timestamp;
	return {
		leafEntryId: leaf.id,
		headline: truncateBranchHeadline(summary?.headline ?? ""),
		messageCount: summary?.messageCount ?? 0,
		...typeof timestamp === "string" && timestamp.trim() ? { updatedAt: timestamp } : {},
		active: tree.leafId === leaf.id
	};
}
function extractHeadlineText(messageValue) {
	const message = asOptionalRecord(messageValue);
	if (message?.role !== "user" && message?.role !== "assistant") return;
	return (message.role === "assistant" ? extractAssistantPhaseText(message) : extractEditorText(message.content ?? message.text))?.replace(/\s+/g, " ").trim() || void 0;
}
function truncateBranchHeadline(value) {
	const characters = Array.from(value);
	return characters.length <= BRANCH_HEADLINE_MAX_CHARS ? value : `${characters.slice(0, 119).join("")}…`;
}
function resolveMessageCut(events, entryId) {
	const tree = scanSessionTranscriptTree(events);
	const target = tree.byId.get(entryId);
	if (!target) return { status: "missing-entry" };
	const record = asOptionalRecord(target.entry);
	const message = asOptionalRecord(record?.message);
	if (record?.type !== "message" || message?.role !== "user") return { status: "not-user-message" };
	const activePath = selectSessionTranscriptTreePathNodes(tree, tree.leafId);
	const targetIndex = activePath.findIndex((node) => node.id === entryId);
	if (targetIndex < 0) return { status: "off-active-path" };
	const prefix = [];
	for (const node of activePath.slice(0, targetIndex)) {
		const entry = asOptionalRecord(node.entry);
		prefix.push(entry && entry.parentId !== node.parentId ? {
			...entry,
			parentId: node.parentId
		} : node.entry);
	}
	const editorAttachments = extractEditorAttachments(message.content);
	const editorMediaRefs = extractEditorMediaRefs(message);
	return {
		status: "cut",
		editorText: extractEditorText(message.content),
		...editorAttachments ? { editorAttachments } : {},
		...editorMediaRefs ? { editorMediaRefs } : {},
		parentId: target.parentId,
		prefix
	};
}
function cloneMessageCutSessionEntry(params) {
	return {
		...params.forked ? inheritSessionSelection(params.currentEntry) : params.currentEntry,
		sessionId: params.nextSessionId,
		lifecycleRevision: params.forked ? randomUUID() : params.currentEntry.lifecycleRevision,
		updatedAt: Date.now(),
		systemSent: false,
		abortedLastRun: false,
		lifecycleRunId: void 0,
		lastRunId: void 0,
		startedAt: void 0,
		endedAt: void 0,
		runtimeMs: void 0,
		status: void 0,
		inputTokens: void 0,
		outputTokens: void 0,
		cacheRead: void 0,
		cacheWrite: void 0,
		estimatedCostUsd: void 0,
		totalTokens: void 0,
		totalTokensFresh: void 0,
		totalTokensVersion: void 0,
		contextTokens: void 0,
		contextTokensSource: void 0,
		contextBudgetStatus: void 0,
		compactionCount: void 0,
		transcriptByteCompactionLatch: void 0,
		compactionCheckpoints: void 0,
		memoryFlush: void 0,
		cliSessionBindings: void 0,
		cliSessionIds: void 0,
		claudeCliSessionId: void 0,
		agentHarnessId: void 0,
		modelSelectionLocked: void 0,
		skillsSnapshot: void 0,
		systemPromptReport: void 0,
		restartRecoveryRuns: void 0,
		restartRecoveryForceSafeTools: void 0,
		abortCutoffMessageSid: void 0,
		abortCutoffTimestamp: void 0,
		usageFamilyKey: params.forked ? void 0 : params.currentEntry.usageFamilyKey,
		usageFamilySessionIds: params.forked ? void 0 : params.currentEntry.usageFamilySessionIds,
		previousSessionId: params.forked ? void 0 : params.currentEntry.sessionId,
		...params.forkSource ? {
			forkSource: params.forkSource,
			parentSessionKey: params.forkSource.sessionKey
		} : {}
	};
}
function extractEditorText(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return;
	return content.flatMap((block) => {
		const record = asOptionalRecord(block);
		return record?.type === "text" && typeof record.text === "string" ? [record.text] : [];
	}).join("") || void 0;
}
const EDITOR_ATTACHMENT_LIMIT = 10;
const EDITOR_ATTACHMENT_MAX_BASE64_CHARS = Math.ceil(5242880 / 3) * 4;
function extractEditorAttachments(content) {
	if (!Array.isArray(content)) return;
	const attachments = content.flatMap((block) => {
		const record = asOptionalRecord(block);
		return record?.type === "image" && typeof record.data === "string" && record.data.trim() && record.data.length <= EDITOR_ATTACHMENT_MAX_BASE64_CHARS && typeof record.mimeType === "string" && record.mimeType.startsWith("image/") ? [{
			mimeType: record.mimeType,
			data: record.data
		}] : [];
	});
	return attachments.length > 0 ? attachments.slice(0, EDITOR_ATTACHMENT_LIMIT) : void 0;
}
function extractEditorMediaRefs(message) {
	const media = asOptionalRecord(message["__openclaw"])?.media;
	if (!Array.isArray(media)) return;
	const refs = media.flatMap((entry) => {
		const record = asOptionalRecord(entry);
		const mediaPath = typeof record?.path === "string" ? record.path.trim() : "";
		const contentType = record?.contentType;
		return mediaPath && typeof contentType === "string" && contentType.startsWith("image/") ? [{
			path: mediaPath,
			contentType
		}] : [];
	});
	return refs.length > 0 ? refs : void 0;
}
function isSessionHeader(event) {
	return asOptionalRecord(event)?.type === "session";
}
function readTranscriptHeaderCwd(events) {
	const cwd = asOptionalRecord(events.find(isSessionHeader))?.cwd;
	return typeof cwd === "string" && cwd.trim() ? cwd : void 0;
}
function readLastEventId(events) {
	const id = asOptionalRecord(events.findLast((event) => !isSessionHeader(event)))?.id;
	return typeof id === "string" && id.trim() ? id : null;
}
function uniqueEntryId(events) {
	const ids = new Set(events.flatMap((event) => {
		const id = asOptionalRecord(event)?.id;
		return typeof id === "string" ? [id] : [];
	}));
	for (;;) {
		const id = randomUUID().slice(0, 8);
		if (!ids.has(id)) return id;
	}
}
//#endregion
//#region src/config/sessions/session-accessor.reset.ts
var SessionInitializationAgentScopeMismatchError = class extends Error {
	constructor(agentId, sessionKeyAgentId) {
		super(`Session initialization agent scope mismatch: explicit agent "${agentId}" does not match session key agent "${sessionKeyAgentId}".`);
		this.agentId = agentId;
		this.sessionKeyAgentId = sessionKeyAgentId;
		this.code = "SESSION_INITIALIZATION_AGENT_SCOPE_MISMATCH";
		this.name = "SessionInitializationAgentScopeMismatchError";
	}
};
function assertSessionInitializationAgentScope(agentId, sessionKey) {
	const normalizedAgentId = normalizeAgentId(agentId);
	const sessionKeyAgentId = parseAgentSessionKey(sessionKey)?.agentId;
	if (sessionKeyAgentId && normalizeAgentId(sessionKeyAgentId) !== normalizedAgentId) throw new SessionInitializationAgentScopeMismatchError(normalizedAgentId, sessionKeyAgentId);
}
const loadSessionArchiveRuntime = createLazyRuntimeModule(() => import("./session-archive.runtime.js"));
/**
* Persists runner reset metadata after the caller appends the in-log boundary.
*/
async function persistSessionResetLifecycle(params) {
	await applySessionEntryLifecycleMutation({
		agentId: params.agentId,
		activeSessionKey: params.sessionKey,
		storePath: params.storePath,
		upserts: [{
			sessionKey: params.sessionKey,
			entry: params.nextEntry,
			resetBoundary: {
				context: "preserve-tail",
				reason: "reset"
			}
		}],
		skipMaintenance: true
	});
	return { replayedMessages: 0 };
}
function loadReplySessionInitializationEntries(params) {
	assertSessionInitializationAgentScope(params.agentId, params.sessionKey);
	const result = withOpenClawAgentDatabaseReadOnly((database) => runSqliteDeferredTransactionSync(database.db, () => {
		assertCanonicalSqliteSessionKeysCurrent(database);
		const entries = {};
		const currentKey = normalizeStoreSessionKey(params.sessionKey);
		const keys = /* @__PURE__ */ new Set([currentKey, ...params.relatedSessionKeys ?? []]);
		for (const key of keys) {
			const sessionKey = normalizeStoreSessionKey(key);
			if (!sessionKey || entries[sessionKey]) continue;
			const entry = readExactSessionEntryRow(database, sessionKey)?.entry;
			if (entry) {
				entries[sessionKey] = entry;
				if (sessionKey === currentKey && entry.parentSessionKey) keys.add(entry.parentSessionKey);
			}
		}
		return entries;
	}), toDatabaseOptions(resolveSqliteScope(params)));
	return result.found ? result.value : {};
}
/** Loads the declared reply-session rows without exposing a mutable store. */
function loadReplySessionInitializationSnapshot(params) {
	const storePath = resolveSessionStorePathForScope(params);
	const store = loadReplySessionInitializationEntries({
		...params,
		storePath
	});
	const resolved = resolveSessionStoreEntryCore({
		store,
		sessionKey: params.sessionKey
	});
	const currentEntry = resolved.existing ? { ...resolved.existing } : void 0;
	return {
		...currentEntry ? { currentEntry } : {},
		readEntry: (sessionKey) => {
			const entry = resolveSessionStoreEntryCore({
				store,
				sessionKey
			}).existing;
			return entry ? { ...entry } : void 0;
		},
		revision: createReplySessionInitializationRevision(currentEntry)
	};
}
function createStaleReplySessionInitializationResult(currentEntry) {
	return {
		ok: false,
		...currentEntry ? { currentEntry } : {},
		reason: "stale-snapshot",
		revision: createReplySessionInitializationRevision(currentEntry)
	};
}
/**
* Persists one reply-session initialization result and archives the previous
* transcript after metadata commits, keeping archive failure warning-only.
*/
async function commitReplySessionInitialization(params) {
	assertSessionInitializationAgentScope(params.agentId, params.sessionKey);
	const storePath = resolveSessionStorePathForScope({
		sessionKey: params.sessionKey,
		storePath: params.storePath
	});
	const store = loadReplySessionInitializationEntries({
		...params,
		storePath
	});
	const resolved = resolveSessionStoreEntryCore({
		store,
		sessionKey: params.sessionKey
	});
	const currentEntry = resolved.existing ? { ...resolved.existing } : void 0;
	if (createReplySessionInitializationRevision(currentEntry) !== params.expectedRevision) return createStaleReplySessionInitializationResult(currentEntry);
	const readEntry = (sessionKey) => {
		const entry = resolveSessionStoreEntryCore({
			store,
			sessionKey
		}).existing;
		return entry ? { ...entry } : void 0;
	};
	const sessionEntry = params.prepareSessionEntry ? await params.prepareSessionEntry({
		...currentEntry ? { currentEntry } : {},
		readEntry,
		sessionEntry: params.sessionEntry
	}) : params.sessionEntry;
	let staleCommit;
	let committedSessionEntry = sessionEntry;
	let beforeEntryMutationDone = false;
	const upserts = [{
		sessionKey: resolved.normalizedKey,
		...params.routeContext !== void 0 ? { routeContext: params.routeContext } : {},
		...params.resetBoundary ? { resetBoundary: params.resetBoundary } : {},
		buildEntry: async ({ currentEntry: commitEntry }) => {
			if (createReplySessionInitializationRevision(commitEntry) !== params.expectedRevision) {
				staleCommit = commitEntry ? { ...commitEntry } : null;
				return null;
			}
			committedSessionEntry = commitEntry ? mergeConcurrentReplySessionMetadata({
				currentEntry: commitEntry,
				preparedEntry: sessionEntry,
				snapshotEntry: params.snapshotEntry ?? params.previousEntry
			}) : sessionEntry;
			if (!beforeEntryMutationDone) {
				await params.beforeEntryMutation?.({
					...commitEntry ? { currentEntry: { ...commitEntry } } : {},
					sessionEntry: committedSessionEntry
				});
				beforeEntryMutationDone = true;
			}
			return committedSessionEntry;
		}
	}];
	if (params.retiredEntry) {
		const retiredEntry = params.retiredEntry;
		upserts.push({
			sessionKey: retiredEntry.key,
			buildEntry: () => staleCommit === void 0 ? retiredEntry.entry : null
		});
	}
	try {
		await applySessionEntryLifecycleMutation({
			activeSessionKey: params.activeSessionKey,
			agentId: params.agentId,
			maintenanceOverride: params.maintenanceConfig,
			storePath,
			upserts,
			beforeCommitInTransaction: params.commitGuard
		});
	} catch (error) {
		if (!(error instanceof SessionEntryLifecycleUpsertConflictError) || error.sessionKey !== resolved.normalizedKey) throw error;
		return createStaleReplySessionInitializationResult(loadSessionEntry({
			agentId: params.agentId,
			readConsistency: "latest",
			sessionKey: error.sessionKey,
			storePath
		}));
	}
	if (staleCommit !== void 0) return createStaleReplySessionInitializationResult(staleCommit ?? void 0);
	store[resolved.normalizedKey] = committedSessionEntry;
	if (params.retiredEntry) store[params.retiredEntry.key] = params.retiredEntry.entry;
	const committed = {
		ok: true,
		previousSessionTranscript: {},
		sessionEntry: { ...committedSessionEntry },
		sessionStoreView: cloneSessionEntries(store)
	};
	const previousSessionTranscript = isIncognitoSessionKey(params.sessionKey) || params.previousEntry?.incognito === true ? {} : params.archivePreviousTranscript === false ? {} : await archivePreviousSessionTranscript({
		agentId: params.agentId,
		onArchiveError: params.onArchiveError,
		previousEntry: params.previousEntry,
		storePath: params.storePath
	});
	return {
		...committed,
		previousSessionTranscript
	};
}
async function archivePreviousSessionTranscript(params) {
	if (!params.previousEntry?.sessionId) return {};
	const { archiveSessionTranscriptsDetailed, resolveStableSessionEndTranscript } = await loadSessionArchiveRuntime();
	const archivedTranscripts = archiveSessionTranscriptsDetailed({
		sessionId: params.previousEntry.sessionId,
		storePath: params.storePath,
		agentId: params.agentId,
		reason: "reset",
		onArchiveError: params.onArchiveError
	});
	return resolveStableSessionEndTranscript({
		sessionId: params.previousEntry.sessionId,
		storePath: params.storePath,
		agentId: params.agentId,
		archivedTranscripts
	});
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-delta.ts
const RAW_TRANSCRIPT_CURSOR_VERSION = 1;
const DEFAULT_RAW_TRANSCRIPT_MAX_EVENTS = 1e3;
const DEFAULT_RAW_TRANSCRIPT_MAX_BYTES = 1e6;
const MAX_RAW_TRANSCRIPT_EVENTS = 1e4;
const MAX_RAW_TRANSCRIPT_BYTES = 67108864;
function normalizeRawDeltaLimit(value, fallback, maximum, name) {
	const resolved = value ?? fallback;
	if (!Number.isInteger(resolved) || resolved < 1 || resolved > maximum) throw new RangeError(`${name} must be an integer between 1 and ${String(maximum)}`);
	return resolved;
}
function encodeRawTranscriptCursor(cursor) {
	return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}
/** Mint the raw-delta cursor for a generation-consistent transcript snapshot. */
function createTranscriptRawDeltaCursor(params) {
	return encodeRawTranscriptCursor({
		...params,
		version: RAW_TRANSCRIPT_CURSOR_VERSION
	});
}
function parseRawTranscriptCursor(value) {
	if (value.length > 4096) return;
	try {
		const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
		if (parsed.version !== RAW_TRANSCRIPT_CURSOR_VERSION || typeof parsed.agentId !== "string" || typeof parsed.sessionId !== "string" || typeof parsed.generation !== "string" || !Number.isSafeInteger(parsed.lastSeq) || (parsed.lastSeq ?? -2) < -1) return;
		return parsed;
	} catch {
		return;
	}
}
function bootstrapCursor(scope, generation) {
	return {
		agentId: scope.agentId,
		generation,
		lastSeq: -1,
		sessionId: scope.sessionId,
		version: RAW_TRANSCRIPT_CURSOR_VERSION
	};
}
/** Read one generation-consistent raw transcript page without parsing excluded payload rows. */
function readTranscriptRawDelta(scope, limits = {}) {
	const resolved = resolveSqliteTranscriptReadScope(scope);
	const maxEvents = normalizeRawDeltaLimit(limits.maxEvents, DEFAULT_RAW_TRANSCRIPT_MAX_EVENTS, MAX_RAW_TRANSCRIPT_EVENTS, "maxEvents");
	const maxBytes = normalizeRawDeltaLimit(limits.maxBytes, DEFAULT_RAW_TRANSCRIPT_MAX_BYTES, MAX_RAW_TRANSCRIPT_BYTES, "maxBytes");
	const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
	return runSqliteDeferredTransactionSync(database.db, () => {
		const beforeEventSeq = resolveSqliteSessionTranscriptReadFence({
			database,
			...resolved
		})?.beforeRawSeq;
		return readRawDeltaInTransaction(database.db, resolved, limits.cursor, maxEvents, maxBytes, beforeEventSeq);
	}, {
		databaseLabel: database.path,
		operationLabel: "session transcript raw delta"
	});
}
function readRawDeltaInTransaction(database, scope, encodedCursor, maxEvents, maxBytes, beforeEventSeq) {
	const db = getSessionKysely(database);
	const state = executeSqliteQueryTakeFirstSync(database, db.selectFrom("transcript_rewrite_watermarks").select("generation").where("session_id", "=", scope.sessionId));
	if (!state) return { kind: "missing" };
	const initialCursor = bootstrapCursor(scope, state.generation);
	const reset = (reason) => ({
		kind: "reset",
		cursor: encodeRawTranscriptCursor(initialCursor),
		reason
	});
	const cursor = encodedCursor !== void 0 ? parseRawTranscriptCursor(encodedCursor) : initialCursor;
	if (!cursor) return reset("invalid_cursor");
	if (cursor.agentId !== scope.agentId || cursor.sessionId !== scope.sessionId) return reset("scope_mismatch");
	if (cursor.generation !== state.generation) return reset("generation_mismatch");
	const frontier = executeSqliteQueryTakeFirstSync(database, db.selectFrom("transcript_events").select("seq").where("session_id", "=", scope.sessionId).orderBy("seq", "desc").limit(1));
	const maxSeq = Math.min(frontier ? coerceSqliteNumber(frontier.seq) : -1, beforeEventSeq === void 0 ? Number.POSITIVE_INFINITY : beforeEventSeq - 1);
	if (cursor.lastSeq > maxSeq) {
		if (beforeEventSeq !== void 0) throw new SessionTranscriptReadFenceError("Transcript read cursor has crossed the current-turn admission fence");
		return reset("invalid_cursor");
	}
	const metadata = executeSqliteQuerySync(database, db.selectFrom("transcript_events").select(["seq", sql`OCTET_LENGTH(event_json) + 1`.as("serialized_bytes")]).where("session_id", "=", scope.sessionId).where("seq", ">", cursor.lastSeq).$if(beforeEventSeq !== void 0, (query) => query.where("seq", "<", beforeEventSeq)).orderBy("seq", "asc").limit(maxEvents + 1)).rows.map((row) => ({
		seq: coerceSqliteNumber(row.seq),
		serializedBytes: coerceSqliteNumber(row.serialized_bytes)
	}));
	let serializedBytes = 0;
	let selectedCount = 0;
	for (const row of metadata) {
		if (selectedCount >= maxEvents || serializedBytes + row.serializedBytes > maxBytes) break;
		serializedBytes += row.serializedBytes;
		selectedCount += 1;
	}
	const lastSeq = metadata.slice(0, selectedCount).at(-1)?.seq ?? cursor.lastSeq;
	const rows = selectedCount === 0 ? [] : executeSqliteQuerySync(database, db.selectFrom("transcript_events").select(["event_json", "seq"]).where("session_id", "=", scope.sessionId).where("seq", ">", cursor.lastSeq).where("seq", "<=", lastSeq).orderBy("seq", "asc")).rows.map((row) => ({
		event: JSON.parse(row.event_json),
		seq: coerceSqliteNumber(row.seq)
	}));
	const nextCursor = encodeRawTranscriptCursor({
		...cursor,
		lastSeq
	});
	const requiredBytes = selectedCount === 0 && metadata[0] ? metadata[0].serializedBytes : void 0;
	return {
		kind: "page",
		cursor: nextCursor,
		events: rows,
		hasMore: selectedCount < metadata.length,
		...requiredBytes !== void 0 ? { requiredBytes } : {},
		serializedBytes
	};
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-transcript-message-rewrite.ts
/** Rewrites one exact anchored message without rejecting unrelated later appends. */
async function rewriteTranscriptMessageAtAnchor(anchor, rewriteMessage) {
	const resolved = resolveSqliteTranscriptScope(anchor);
	return await runExclusiveSqliteSessionWrite(resolved, async () => {
		let result = null;
		runOpenClawAgentWriteTransaction((database) => {
			const row = executeSqliteQueryTakeFirstSync(database.db, getSessionKysely(database.db).selectFrom("transcript_events").select("event_json").where("session_id", "=", resolved.sessionId).where("seq", "=", anchor.rawSeq));
			if (!row) return;
			const event = JSON.parse(row.event_json);
			if (!isRecord(event) || event.type !== "message" || event.id !== anchor.entryId) return;
			const message = rewriteMessage(event.message);
			if (message === void 0) return;
			rewriteSqliteTranscriptEventRowsInTransaction(database, resolved, [{
				event: {
					...event,
					message
				},
				expectedEventJson: row.event_json,
				seq: anchor.rawSeq
			}]);
			const generation = readTranscriptGenerationInTransaction(database, resolved.sessionId);
			if (generation) result = {
				generation,
				message
			};
		}, toDatabaseOptions(resolved), { operationLabel: "session.transcript.message-rewrite" });
		return result;
	});
}
//#endregion
//#region src/config/sessions/session-accessor.transcript.ts
/**
* Trims a transcript for manual sessions.compact and clears stale token metadata.
* This is one storage-sized mutation: future stores can trim transcript rows and
* update entry metadata inside the same backend transaction.
*/
async function preflightSessionTranscriptForManualCompact(scope, params) {
	const eventCount = readTranscriptStatsSync(scope).eventCount;
	if (eventCount === 0) return {
		compacted: false,
		reason: "no transcript"
	};
	return eventCount > Math.max(1, Math.floor(params.maxLines)) ? { compacted: true } : {
		compacted: false,
		kept: eventCount
	};
}
async function trimSessionTranscriptForManualCompact(scope, params) {
	const maxLines = Math.max(1, Math.floor(params.maxLines));
	const maxTailLines = Math.max(0, maxLines - 1);
	let declined = {
		compacted: false,
		reason: "no transcript"
	};
	const trimmed = await trimTranscriptForManualCompact(scope, (lines) => {
		if (lines.length === 0) {
			declined = {
				compacted: false,
				reason: "no transcript"
			};
			return null;
		}
		if (lines.length <= maxLines) {
			declined = {
				compacted: false,
				kept: lines.length
			};
			return null;
		}
		const tailLines = lines.slice(1);
		const retainedLines = normalizeManualCompactTranscriptLines(lines[0], maxTailLines > 0 ? tailLines.slice(-maxTailLines) : []);
		if (!retainedLines) {
			declined = {
				compacted: false,
				kept: 0
			};
			return null;
		}
		return retainedLines;
	}, params.nowMs === void 0 ? {} : { nowMs: params.nowMs });
	if (!trimmed.trimmed) return declined;
	return {
		compacted: true,
		kept: trimmed.kept
	};
}
function parseManualCompactTranscriptRecord(line) {
	return safeParseJsonRecord(line) ?? null;
}
function normalizeManualCompactTranscriptLines(headerLine, tailLines) {
	if (!headerLine) return null;
	const header = parseManualCompactTranscriptRecord(headerLine);
	if (header?.type !== "session" || typeof header.id !== "string") return null;
	const records = tailLines.map(parseManualCompactTranscriptRecord).filter((record) => record !== null);
	const retainedIds = /* @__PURE__ */ new Set();
	const transparentParents = /* @__PURE__ */ new Map();
	const normalizedRecords = [];
	for (const record of records) {
		let parentId = record.parentId;
		const seenTransparentParents = /* @__PURE__ */ new Set();
		while (typeof parentId === "string" && transparentParents.has(parentId) && !seenTransparentParents.has(parentId)) {
			seenTransparentParents.add(parentId);
			parentId = transparentParents.get(parentId) ?? null;
		}
		let next = typeof parentId === "string" && !retainedIds.has(parentId) ? {
			...record,
			parentId: null
		} : parentId !== record.parentId ? {
			...record,
			parentId
		} : record;
		if (next.type === "leaf") {
			const targetId = next.targetId;
			const validTargetId = targetId === null || typeof targetId === "string" && targetId.trim().length > 0;
			if (!validTargetId && typeof next.id === "string") transparentParents.set(next.id, next.parentId === null || typeof next.parentId === "string" ? next.parentId : null);
			if (typeof targetId === "string" && targetId.trim() && !retainedIds.has(targetId)) next = {
				...next,
				targetId: null,
				appendParentId: null
			};
			else if (validTargetId && typeof next.appendParentId === "string" && !retainedIds.has(next.appendParentId)) next = {
				...next,
				appendParentId: targetId
			};
		}
		if ((next.type === "compaction" || next.type === "reset") && typeof next.id === "string") {
			const firstKeptEntryId = next.firstKeptEntryId;
			if (typeof firstKeptEntryId === "string" && firstKeptEntryId !== next.id) {
				const tree = scanSessionTranscriptTree([...normalizedRecords, next]);
				const branchPath = selectSessionTranscriptTreePathNodes(tree, next.id);
				if (!branchPath.some((node) => node.id === firstKeptEntryId)) next = {
					...next,
					firstKeptEntryId: branchPath[0]?.id ?? next.id
				};
			}
		}
		normalizedRecords.push(next);
		if (typeof next.id === "string" && next.id.trim()) retainedIds.add(next.id);
	}
	return [JSON.stringify(header), ...normalizedRecords.map((record) => JSON.stringify(record))];
}
//#endregion
//#region src/config/sessions/goals-transitions.ts
var SessionGoalTransitionError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "SessionGoalTransitionError";
	}
};
const TERMINAL_GOAL_STATUSES = /* @__PURE__ */ new Set(["complete"]);
function normalizeTokenCount(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : void 0;
}
function resolveEntryFreshTotalTokens(entry) {
	return normalizeTokenCount(resolveFreshSessionTotalTokens(entry));
}
function resolveEntryGoalStartTokens(entry) {
	return resolveEntryFreshTotalTokens(entry) ?? 0;
}
function normalizeTokenBudget(value) {
	const normalized = normalizeTokenCount(value);
	return normalized && normalized > 0 ? normalized : void 0;
}
function accountSessionGoalUsage(entry, now, options) {
	const goal = entry.goal;
	if (!goal) return;
	const totalTokens = resolveEntryFreshTotalTokens(entry);
	const hasFreshStart = goal.tokenStartFresh !== false;
	const shouldHoldStaleStart = !hasFreshStart && options?.adoptFreshBaseline === false;
	const shouldAdoptFreshStart = !shouldHoldStaleStart && totalTokens !== void 0 && !hasFreshStart;
	const tokenStart = shouldAdoptFreshStart ? totalTokens : normalizeTokenCount(goal.tokenStart) ?? totalTokens ?? 0;
	const tokensUsed = totalTokens === void 0 || shouldAdoptFreshStart || shouldHoldStaleStart ? goal.tokensUsed : Math.max(goal.tokensUsed, Math.max(0, totalTokens - tokenStart));
	const next = {
		...goal,
		tokenStart,
		tokenStartFresh: hasFreshStart || shouldAdoptFreshStart,
		tokensUsed
	};
	if (next.status === "active" && next.tokenBudget !== void 0 && tokensUsed >= next.tokenBudget) {
		next.status = "budget_limited";
		next.budgetLimitedAt = now;
		next.updatedAt = now;
	}
	return next;
}
function buildCreatedSessionGoal(entry, options, now) {
	const objective = options.objective;
	if (!objective.trim()) throw new SessionGoalTransitionError("objective required");
	if (entry.goal) throw new SessionGoalTransitionError("goal already exists");
	const tokenBudget = normalizeTokenBudget(options.tokenBudget);
	const tokenStartFresh = resolveEntryFreshTotalTokens(entry) !== void 0;
	return {
		schemaVersion: 1,
		id: crypto.randomUUID(),
		objective,
		status: "active",
		createdAt: now,
		updatedAt: now,
		tokenStart: resolveEntryGoalStartTokens(entry),
		tokenStartFresh,
		tokensUsed: 0,
		...tokenBudget ? { tokenBudget } : {},
		continuationTurns: 0
	};
}
function buildUpdatedSessionGoalStatus(entry, options, now) {
	const accounted = accountSessionGoalUsage(entry, now);
	if (!accounted) throw new SessionGoalTransitionError("goal not found");
	if (TERMINAL_GOAL_STATUSES.has(accounted.status) && accounted.status !== options.status) throw new SessionGoalTransitionError(`goal is already ${accounted.status}`);
	const resetsBudgetWindow = options.status === "active" && (accounted.status === "budget_limited" || accounted.status === "usage_limited" || accounted.tokenBudget !== void 0 && accounted.tokensUsed >= accounted.tokenBudget);
	const freshTokenStart = resetsBudgetWindow ? resolveEntryFreshTotalTokens(entry) : void 0;
	const next = {
		...accounted,
		status: options.status,
		updatedAt: now,
		...options.note ? { lastStatusNote: options.note } : {},
		...options.status === "paused" ? { pausedAt: now } : {},
		...options.status === "blocked" ? { blockedAt: now } : {},
		...options.status === "complete" ? { completedAt: now } : {}
	};
	if (resetsBudgetWindow) {
		next.tokenStart = freshTokenStart ?? 0;
		next.tokenStartFresh = freshTokenStart !== void 0;
		next.tokensUsed = 0;
		delete next.budgetLimitedAt;
		delete next.usageLimitedAt;
	}
	if (next.status === "active" && next.tokenBudget !== void 0 && next.tokensUsed >= next.tokenBudget) {
		next.status = "budget_limited";
		next.budgetLimitedAt = now;
	}
	return next;
}
function buildUpdatedSessionGoalObjective(entry, objective, now) {
	if (!objective.trim()) throw new SessionGoalTransitionError("objective required");
	const accounted = accountSessionGoalUsage(entry, now);
	if (!accounted) throw new SessionGoalTransitionError("goal not found");
	if (TERMINAL_GOAL_STATUSES.has(accounted.status)) throw new SessionGoalTransitionError(`goal is already ${accounted.status}`);
	return {
		...accounted,
		objective,
		updatedAt: now
	};
}
//#endregion
//#region src/config/sessions/goals-operations.ts
const validateReceipt = /* @__PURE__ */ lazyCompile(SessionsGoalMutationResultSchema);
const OPERATION_VALIDITY_MS = 864e5;
const OPERATION_FUTURE_SKEW_MS = 3e5;
const MAX_SESSION_RECEIPTS = 4096;
var SessionGoalOperationError = class extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = "SessionGoalOperationError";
	}
};
function assertOperationTime(operation, now) {
	if (!Number.isSafeInteger(operation.issuedAtMs) || operation.issuedAtMs > now + OPERATION_FUTURE_SKEW_MS) throw new SessionGoalOperationError("invalid", "Goal operation time is invalid; refresh and try again.");
	if (operation.issuedAtMs + OPERATION_VALIDITY_MS <= now) throw new SessionGoalOperationError("expired", "Goal operation expired; review the current Goal before trying again.");
}
function operationFingerprint(operation) {
	return createHash("sha256").update(JSON.stringify([
		operation.issuedAtMs,
		operation.requestFingerprint,
		operation.action,
		"goalId" in operation ? operation.goalId : null,
		"objective" in operation ? operation.objective : null,
		"tokenBudget" in operation ? operation.tokenBudget : null,
		"note" in operation ? operation.note : null
	])).digest("hex");
}
/** Read a durable receipt before transient chat dedupe or busy checks, without creating tables. */
function lookupSessionGoalOperation(options) {
	assertOperationTime(options.operation, Date.now());
	const resolved = resolveSqliteScope(options);
	const result = withOpenClawAgentDatabaseReadOnly((database) => {
		const { db } = database;
		if (!executeSqliteQueryTakeFirstSync(db, getSessionKysely(db).selectFrom("sqlite_schema").select("name").where("type", "=", "table").where("name", "=", "session_goal_operations"))) return;
		const receipt = readSessionGoalOperationReceipt(db, resolved.sessionKey, options.expectedSessionId, options.operation);
		if (receipt && readSessionEntryRow(database, resolved.sessionKey)?.entry.sessionId !== options.expectedSessionId) throw new SessionGoalOperationError("session-rebound", "Session changed after this Goal operation; refresh before trying again.");
		return receipt;
	}, toDatabaseOptions(resolved));
	return result.found ? result.value : void 0;
}
/** The caller has installed the schema before BEGIN; this read participates in its transaction. */
function readSessionGoalOperationReceipt(db, sessionKey, sessionId, operation) {
	assertOperationTime(operation, Date.now());
	const row = executeSqliteQueryTakeFirstSync(db, getSessionKysely(db).selectFrom(SESSION_GOAL_OPERATIONS_TABLE).selectAll().where("session_key", "=", sessionKey).where("operation_id", "=", operation.operationId));
	if (!row) return;
	if (row.request_fingerprint !== operationFingerprint(operation)) throw new SessionGoalOperationError("operation-conflict", "Goal operation ID was already used for a different request.");
	if (row.session_id !== sessionId) throw new SessionGoalOperationError("session-rebound", "Session changed after this Goal operation; refresh before trying again.");
	const result = safeParseJson(row.result_json);
	if (!validateReceipt(result) || result.operationId !== operation.operationId || result.action !== operation.action || result.sessionId !== sessionId || "goalId" in operation && result.goalId !== operation.goalId || result.goal !== void 0 && result.goal.id !== result.goalId) throw new SessionGoalOperationError("invalid", "Stored Goal operation receipt is invalid; inspect the session before retrying.");
	return result;
}
/** Apply the same policy used by text commands to the fresh row inside the commit section. */
function applySessionGoalOperation(entry, operation, now) {
	try {
		if (operation.action === "start") return buildCreatedSessionGoal(entry, operation, now);
		if (!entry.goal || entry.goal.id !== operation.goalId) throw new SessionGoalOperationError("goal-rebound", "Goal changed or was cleared; refresh before trying again.");
		if (operation.action === "clear") return;
		if (operation.action === "edit") return buildUpdatedSessionGoalObjective(entry, operation.objective, now);
		return buildUpdatedSessionGoalStatus(entry, {
			status: operation.action === "resume" ? "active" : operation.action === "pause" ? "paused" : operation.action === "block" ? "blocked" : "complete",
			note: operation.note
		}, now);
	} catch (error) {
		if (error instanceof SessionGoalTransitionError) throw new SessionGoalOperationError("invalid", error.message);
		throw error;
	}
}
/** Called only after every Goal/turn/lifecycle write succeeds, in that same transaction. */
function writeSessionGoalOperationReceipt(db, sessionKey, sessionId, operation, goal, runId) {
	const now = Date.now();
	assertOperationTime(operation, now);
	const kysely = getSessionKysely(db);
	executeSqliteQuerySync(db, kysely.deleteFrom(SESSION_GOAL_OPERATIONS_TABLE).where("expires_at", "<=", now));
	if ((executeSqliteQueryTakeFirstSync(db, kysely.selectFrom("session_goal_operations").select(({ fn }) => fn.countAll().as("count")).where("session_key", "=", sessionKey))?.count ?? 0) >= MAX_SESSION_RECEIPTS) throw new SessionGoalOperationError("capacity", "Too many recent Goal operations; wait for older requests to expire before trying again.");
	const goalId = goal?.id ?? ("goalId" in operation ? operation.goalId : void 0);
	if (!goalId) throw new Error("Goal creation did not produce a Goal identity.");
	const result = {
		operationId: operation.operationId,
		action: operation.action,
		sessionId,
		goalId,
		status: runId ? "started" : operation.action === "clear" ? "cleared" : "updated",
		...goal ? { goal } : {},
		...runId ? { runId } : {}
	};
	executeSqliteQuerySync(db, kysely.insertInto(SESSION_GOAL_OPERATIONS_TABLE).values({
		session_key: sessionKey,
		operation_id: operation.operationId,
		session_id: sessionId,
		request_fingerprint: operationFingerprint(operation),
		result_json: JSON.stringify(result),
		expires_at: operation.issuedAtMs + OPERATION_VALIDITY_MS
	}));
	return result;
}
/** Management-only Goal actions do not enter chat or fabricate user turns. */
async function mutateSessionGoal(options) {
	const resolved = resolveSqliteScope(options);
	const databaseOptions = toDatabaseOptions(resolved);
	return await runExclusiveSqliteSessionWrite(resolved, async () => {
		ensureSessionGoalOperationsSchema(openOpenClawAgentDatabase(databaseOptions).db);
		const committed = runOpenClawAgentWriteTransaction((database) => {
			options.assertCurrent?.();
			const fresh = readSessionEntryRow(database, resolved.sessionKey);
			const replay = readSessionGoalOperationReceipt(database.db, resolved.sessionKey, options.expectedSessionId, options.operation);
			if (replay && fresh?.entry.sessionId === options.expectedSessionId) return {
				result: replay,
				replayed: true
			};
			if (!fresh || fresh.entry.sessionId !== options.expectedSessionId) throw new SessionGoalOperationError("session-rebound", "Session changed; refresh before changing its Goal.");
			const goal = applySessionGoalOperation(fresh.entry, options.operation, Date.now());
			const next = mergeSessionEntry(fresh.entry, { goal });
			const identityKeys = collectSessionEntryLookupKeys(database, resolved.sessionKey);
			const previousIdentity = readSessionIdentitySnapshot(database, identityKeys);
			writeSessionEntry(database, resolved.sessionKey, next);
			const currentIdentity = readSessionIdentitySnapshot(database, identityKeys);
			return {
				result: writeSessionGoalOperationReceipt(database.db, resolved.sessionKey, options.expectedSessionId, options.operation, goal),
				replayed: false,
				previousIdentity,
				currentIdentity,
				next
			};
		}, databaseOptions);
		if (committed.next) emitCommittedSessionIdentityDiff(committed.previousIdentity, committed.currentIdentity);
		return {
			result: committed.result,
			replayed: committed.replayed,
			sessionEntry: committed.next
		};
	});
}
//#endregion
//#region src/config/sessions/session-transcript-turn-state.ts
function sessionMatchesExpectedTranscriptTurn(selected, expected) {
	const expectedState = expected.expectedSessionState;
	return Boolean(selected && selected.entry.sessionId === expected.expectedSessionId && (expected.expectedLifecycleRevision === void 0 || selected.entry.lifecycleRevision === (expected.expectedLifecycleRevision ?? void 0)) && (expected.expectedWriterRunId === void 0 || selected.entry.activeWriterRunId === expected.expectedWriterRunId) && (expectedState === void 0 || selected.entry.abortedLastRun === expectedState.abortedLastRun && selected.entry.mainRestartRecovery?.cycleId === expectedState.mainRestartRecoveryCycleId && selected.entry.mainRestartRecovery?.revision === expectedState.mainRestartRecoveryRevision && selected.entry.restartRecoveryBeforeAgentReplyState === expectedState.restartRecoveryBeforeAgentReplyState && selected.entry.restartRecoveryDeliveryReceiptState === expectedState.restartRecoveryDeliveryReceiptState && selected.entry.restartRecoveryDeliveryToolCallId === expectedState.restartRecoveryDeliveryToolCallId && selected.entry.restartRecoveryDeliveryRequestFingerprint === expectedState.restartRecoveryDeliveryRequestFingerprint && selected.entry.restartRecoveryDeliveryRunId === expectedState.restartRecoveryDeliveryRunId && selected.entry.restartRecoveryDeliverySourceRunId === expectedState.restartRecoveryDeliverySourceRunId && selected.entry.restartRecoveryRequesterAccountId === expectedState.restartRecoveryRequesterAccountId && selected.entry.restartRecoveryRequesterSenderId === expectedState.restartRecoveryRequesterSenderId && selected.entry.restartRecoverySameChannelThreadRequired === expectedState.restartRecoverySameChannelThreadRequired && selected.entry.restartRecoverySourceIngress === expectedState.restartRecoverySourceIngress && selected.entry.restartRecoverySourceReplyDeliveryMode === expectedState.restartRecoverySourceReplyDeliveryMode && sameRestartRecoveryTerminalRunIds(selected.entry.restartRecoveryTerminalRunIds, expectedState.restartRecoveryTerminalRunIds) && selected.entry.status === expectedState.status));
}
function buildExpectedTranscriptTurnSessionPatch(params) {
	const appendedCount = params.appendedMessages.filter((message) => message.appended).length;
	const acceptedMessage = appendedCount > 0 || params.expectedSessionState !== void 0 && params.appendedMessages.some((message) => !message.appended);
	const touchUpdatedAt = params.touchSessionEntry === true && appendedCount > 0 ? Date.now() : 0;
	const restartRecoveryTerminalRunIds = params.sessionLifecyclePatch?.restartRecoveryTerminalRunIds ? mergeRestartRecoveryTerminalRunIds(params.currentEntry.restartRecoveryTerminalRunIds, params.sessionLifecyclePatch.restartRecoveryTerminalRunIds) : void 0;
	return {
		...acceptedMessage ? params.sessionLifecyclePatch : void 0,
		...acceptedMessage && restartRecoveryTerminalRunIds ? { restartRecoveryTerminalRunIds } : {},
		...touchUpdatedAt > 0 ? { updatedAt: Math.max(params.currentEntry.updatedAt ?? 0, params.sessionLifecyclePatch?.updatedAt ?? 0, touchUpdatedAt) } : {}
	};
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-transcript-turn.ts
/** Appends a guarded transcript turn and touches its session row in one queued write. */
async function appendExpectedSessionTranscriptTurn(scope, options) {
	const initialEntry = options.initialSessionEntry ? cloneSessionEntry(options.initialSessionEntry) : void 0;
	if (initialEntry && (initialEntry.sessionId !== options.expectedSessionId || options.expectedLifecycleRevision !== void 0 || options.expectedWriterRunId !== void 0 || options.expectedSessionState !== void 0)) throw new Error("Session initialization requires its new identity and no existing writer state.");
	const resolveExpectedEntry = (selected) => {
		if (initialEntry) return selected ? void 0 : initialEntry;
		return sessionMatchesExpectedTranscriptTurn(selected, options) ? selected.entry : void 0;
	};
	const resolved = resolveSqliteTranscriptScope({
		...scope,
		sessionId: options.expectedSessionId
	});
	return await runExclusiveSqliteSessionWrite(resolved, async () => {
		const mutation = options.sessionTurnMutation;
		mutation?.assertCurrent?.();
		const preparedDatabase = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
		if (mutation) ensureSessionGoalOperationsSchema(preparedDatabase.db);
		const preparedEntry = readSessionEntryRow(preparedDatabase, resolved.sessionKey);
		const preparedReplay = mutation ? readSessionGoalOperationReceipt(preparedDatabase.db, resolved.sessionKey, options.expectedSessionId, mutation.operation) : void 0;
		if (preparedReplay) {
			if (preparedEntry?.entry.sessionId !== options.expectedSessionId) return sqliteSessionTranscriptTurnRebound(preparedEntry, options.sessionFile);
			return {
				appendedMessages: [],
				sessionEntry: preparedEntry.entry,
				sessionFile: options.sessionFile,
				sessionTurnMutationResult: {
					result: preparedReplay,
					replayed: true
				}
			};
		}
		if (!resolveExpectedEntry(preparedEntry)) return sqliteSessionTranscriptTurnRebound(preparedEntry, options.sessionFile);
		const messages = await selectAppendableSqliteTranscriptTurnMessages({
			agentId: resolved.agentId,
			sessionId: options.expectedSessionId,
			sessionKey: resolved.sessionKey,
			...scope.storePath ? { storePath: scope.storePath } : {}
		}, options.messages);
		let result = sqliteSessionTranscriptTurnRebound(preparedEntry, options.sessionFile);
		let previousIdentity = /* @__PURE__ */ new Map();
		let currentIdentity = /* @__PURE__ */ new Map();
		runSqliteSessionDeletionTransaction((transactionDb) => {
			mutation?.assertCurrent?.();
			const fresh = readSessionEntryRow(transactionDb, resolved.sessionKey);
			const replay = mutation ? readSessionGoalOperationReceipt(transactionDb.db, resolved.sessionKey, options.expectedSessionId, mutation.operation) : void 0;
			if (replay) {
				if (fresh?.entry.sessionId !== options.expectedSessionId) {
					result = sqliteSessionTranscriptTurnRebound(fresh, options.sessionFile);
					return;
				}
				result = {
					appendedMessages: [],
					sessionEntry: fresh.entry,
					sessionFile: options.sessionFile,
					sessionTurnMutationResult: {
						result: replay,
						replayed: true
					}
				};
				return;
			}
			const currentEntry = resolveExpectedEntry(fresh);
			if (!currentEntry) {
				result = sqliteSessionTranscriptTurnRebound(fresh, options.sessionFile);
				return;
			}
			const goal = mutation ? applySessionGoalOperation(currentEntry, mutation.operation, Date.now()) : void 0;
			const appendedMessages = [];
			for (const append of messages) {
				const { shouldAppend: _shouldAppend, shouldAppendInTransaction, ...appendOptions } = append;
				if (shouldAppendInTransaction) {
					const latestAssistant = findTranscriptEventInDatabase(transactionDb, resolved.sessionId, (event) => readTranscriptEventMessage(event)?.role === "assistant");
					if (!shouldAppendInTransaction(latestAssistant ? readTranscriptEventMessage(latestAssistant.event) : void 0)) continue;
				}
				let message = appendOptions.message;
				if (mutation && goal && isRecord(message) && message.role === "user") message = {
					...message,
					__openclaw: {
						...isRecord(message["__openclaw"]) ? message["__openclaw"] : {},
						intent: {
							kind: mutation.operation.action === "start" ? "session-goal-start" : "session-goal-resume",
							version: 1,
							goalId: goal.id,
							operationId: mutation.operation.operationId
						}
					}
				};
				const appended = appendTranscriptMessageInTransaction(transactionDb, resolved, {
					...appendOptions,
					message,
					messageAlreadyRedacted: options.atomicGroup === true,
					...append.cwd ?? options.cwd ? { cwd: append.cwd ?? options.cwd } : {},
					...append.config ?? options.config ? { config: append.config ?? options.config } : {}
				});
				if (appended) appendedMessages.push(appended);
			}
			if (options.atomicGroup && (appendedMessages.length !== messages.length || appendedMessages.some((message) => message.appended) !== appendedMessages.every((message) => message.appended))) throw new Error("SQLite transcript batch was not wholly inserted or replayed");
			if ((mutation || initialEntry) && (appendedMessages.length === 0 || appendedMessages.length !== messages.length || appendedMessages.some((message) => !message.appended))) throw new Error(mutation ? "Goal admission requires a new transcript turn in the same transaction." : "Session initialization requires a new transcript turn in the same transaction.");
			rememberCommittedTranscriptMessageSequencesInTransaction(transactionDb, resolved.sessionId, appendedMessages);
			const sessionPatch = buildExpectedTranscriptTurnSessionPatch({
				appendedMessages,
				currentEntry,
				expectedSessionState: options.expectedSessionState,
				sessionFile: options.sessionFile,
				sessionLifecyclePatch: options.sessionLifecyclePatch,
				touchSessionEntry: options.touchSessionEntry
			});
			if (mutation) sessionPatch.goal = goal;
			const next = Object.keys(sessionPatch).length > 0 ? mergeSessionEntry(currentEntry, sessionPatch) : currentEntry;
			if (initialEntry || next !== currentEntry) {
				const identityKeys = collectSessionEntryLookupKeys(transactionDb, resolved.sessionKey);
				previousIdentity = readSessionIdentitySnapshot(transactionDb, identityKeys);
				writeSessionEntry(transactionDb, resolved.sessionKey, next);
				currentIdentity = readSessionIdentitySnapshot(transactionDb, identityKeys);
			}
			result = {
				sessionTurnMutationResult: mutation ? {
					result: writeSessionGoalOperationReceipt(transactionDb.db, resolved.sessionKey, options.expectedSessionId, mutation.operation, goal, mutation.runId),
					replayed: false
				} : void 0,
				appendedMessages,
				sessionEntry: cloneSessionEntry(next),
				sessionFile: options.sessionFile
			};
		}, toDatabaseOptions(resolved));
		emitCommittedSessionIdentityDiff(previousIdentity, currentIdentity);
		return result;
	});
}
function sqliteSessionTranscriptTurnRebound(selected, sessionFile) {
	return {
		appendedMessages: [],
		rejectedReason: "session-rebound",
		sessionEntry: selected?.entry,
		sessionFile
	};
}
async function selectAppendableSqliteTranscriptTurnMessages(context, messages) {
	const selected = [];
	for (const append of messages) if (append.shouldAppend ? await append.shouldAppend(context) : true) selected.push(append);
	return selected;
}
//#endregion
//#region src/config/sessions/session-accessor.transcript-target.ts
/** Binds runtime storage without changing keys that raw ownership checks and read fences validate. */
function bindSessionTranscriptStoreScope(scope, config) {
	return {
		...scope,
		storePath: resolveSessionStorePathForScope({
			...scope,
			storePath: resolveConcreteSessionStorePath(scope.storePath)
		}, config)
	};
}
/** Resolves the canonical SQLite identity for runtime transcript access. */
async function resolveSessionTranscriptRuntimeTarget(scope, config) {
	const agentId = scope.agentId ?? resolveAgentIdFromSessionKey(scope.sessionKey);
	if (!agentId) throw new Error(`Cannot resolve transcript scope without an agent id: ${scope.sessionKey}`);
	const { storePath } = bindSessionTranscriptStoreScope({
		...scope,
		agentId
	}, config);
	const sessionKey = resolveSessionKeyBySessionId({
		agentId,
		...scope.env ? { env: scope.env } : {},
		sessionId: scope.sessionId,
		storePath
	}) ?? resolveSessionEntrySelection({
		agentId,
		...scope.env ? { env: scope.env } : {},
		sessionKey: scope.sessionKey,
		storePath
	}, { readOnly: true })?.normalizedKey ?? scope.sessionKey;
	return {
		agentId,
		sessionId: scope.sessionId,
		sessionKey,
		storePath
	};
}
/** Resolves the physical agent database that owns one runtime transcript. */
function resolveSessionTranscriptDatabasePath(target) {
	const resolved = resolveSqliteTranscriptScope(target);
	return resolveOpenClawAgentSqlitePath(toDatabaseOptions(resolved));
}
function resolveSessionTranscriptReadTarget(scope) {
	const sessionKey = scope.sessionKey?.trim();
	const agentId = scope.agentId ?? resolveAgentIdFromSessionKey(sessionKey);
	if (!agentId) throw new Error(`Cannot resolve transcript scope without an agent id: ${sessionKey}`);
	const { storePath } = bindSessionTranscriptStoreScope({
		...scope,
		agentId,
		sessionKey
	});
	const hasMatchingSessionEntry = scope.sessionEntry?.sessionId === scope.sessionId;
	const resolved = sessionKey && !hasMatchingSessionEntry ? resolveSessionEntrySelection({
		agentId,
		...scope.env ? { env: scope.env } : {},
		sessionKey,
		storePath
	}, { readOnly: true }) : void 0;
	const resolvedSessionKey = hasMatchingSessionEntry ? sessionKey : resolved?.normalizedKey;
	return {
		agentId,
		sessionId: scope.sessionId,
		storePath,
		...resolvedSessionKey ? { sessionKey: resolvedSessionKey } : {}
	};
}
function resolveConcreteSessionStorePath(storePath) {
	const trimmed = storePath?.trim();
	if (!trimmed || trimmed === "(multiple)" || trimmed.includes("{agentId}")) return;
	return trimmed;
}
//#endregion
//#region src/config/sessions/session-accessor.transcript-turn.ts
function resolveTranscriptTurnAgentId(params) {
	if (classifySessionKeyShape(params.sessionKey) === "malformed_agent") throw new Error("Malformed agent session key; refusing transcript turn persistence.");
	const scopedAgentId = params.scopeAgentId?.trim() ? normalizeAgentId(params.scopeAgentId.trim()) : void 0;
	const parsedAgentId = parseAgentSessionKey(params.sessionKey)?.agentId;
	const keyAgentId = parsedAgentId ? normalizeAgentId(parsedAgentId) : void 0;
	if (scopedAgentId && keyAgentId && scopedAgentId !== keyAgentId) throw new Error(`Session key owner "${keyAgentId}" does not match requested agent "${scopedAgentId}".`);
	const persistedStoreOwner = params.sessionStore && !params.storePath ? { kind: "none" } : resolvePersistedSessionStoreOwnerForTarget({
		config: params.config,
		sessionKey: params.sessionKey,
		storePath: params.storePath,
		env: params.env
	});
	if (scopedAgentId && persistedStoreOwner.kind === "configured" && scopedAgentId !== persistedStoreOwner.agentId) throw new AgentSelectionRequiredError(listAgentIds(params.config), {
		surface: "transcript turn persistence",
		hint: `The shared fixed-store row belongs to agent "${persistedStoreOwner.agentId}", not agent "${scopedAgentId}".`
	});
	if (persistedStoreOwner.kind === "retired") throw new AgentSelectionRequiredError(listAgentIds(params.config), {
		surface: "transcript turn persistence",
		hint: `The shared fixed-store row belongs to retired agent "${persistedStoreOwner.agentId}".`
	});
	const agentId = keyAgentId ?? (persistedStoreOwner.kind === "configured" ? persistedStoreOwner.agentId : void 0) ?? scopedAgentId ?? tryResolveLegacyCompatibilityAgentId(params.config);
	if (agentId) return normalizeAgentId(agentId);
	throw new AgentSelectionRequiredError(listAgentIds(params.config), {
		surface: "transcript turn persistence",
		hint: "Pass an agentId or use an agent-qualified session key."
	});
}
/** Appends one prepared ordered group in the existing transcript turn transaction. */
async function appendTranscriptMessages(scope, options) {
	if (options.messages.length === 0) return [];
	const expectedSessionId = scope.sessionId?.trim();
	if (!expectedSessionId) throw new Error("Cannot append a transcript batch without an exact session id");
	const turn = await persistExpectedSessionTranscriptTurn(scope, {
		atomicGroup: true,
		config: options.config,
		cwd: options.cwd,
		expectedSessionId,
		messages: options.messages.map((append) => ({
			...append,
			eventId: append.eventId ?? randomUUID(),
			message: redactTranscriptMessageForStorage(append.message, options),
			now: append.now ?? Date.now()
		})),
		updateMode: "none"
	});
	if (turn.rejectedReason) throw new Error("Transcript session changed before batch append");
	return turn.messages;
}
/**
* Persists one logical transcript turn through the SQLite-backed session target.
* Transcript row append(s) and the requested
* updatedAt touch happen before transcript update delivery is published.
*/
async function persistSessionTranscriptTurn(scope, options) {
	const expectedSessionId = options.expectedSessionId;
	if (expectedSessionId) return await persistExpectedSessionTranscriptTurn(scope, {
		...options,
		expectedSessionId
	});
	if (options.sessionLifecyclePatch || options.sessionTurnMutation || options.initialSessionEntry) throw new Error("Cannot mutate a session turn without an expected session id");
	const target = await resolveTranscriptTurnTarget(scope, options.config);
	if (target.entryFromPersistedStore && target.storePath && target.sessionKey && target.sessionEntry && target.sessionId) return await persistExpectedSessionTranscriptTurn({
		...scope,
		agentId: target.agentId,
		sessionId: target.sessionId,
		sessionKey: target.sessionKey,
		storePath: target.storePath
	}, {
		...options,
		expectedSessionId: target.sessionId
	});
	const appendedMessages = await runWithOwnedSessionTranscriptWrite({
		sessionFile: target.sessionKey,
		sessionKey: target.sessionKey,
		sessionTarget: target
	}, () => appendTranscriptTurnMessages(target, options));
	const appendedCount = countAppendedTranscriptMessages(appendedMessages);
	const sessionEntry = await touchTranscriptTurnSessionEntry({
		scope,
		target,
		shouldTouch: options.touchSessionEntry === true && appendedCount > 0
	});
	await publishTranscriptTurnUpdate({
		target,
		sessionEntry,
		updateMode: options.updateMode ?? "inline",
		publishWhen: options.publishWhen ?? "when-appended",
		appendedMessages,
		runId: options.runId
	});
	return {
		appendedCount,
		messages: appendedMessages,
		sessionEntry
	};
}
async function appendTranscriptTurnMessages(target, options) {
	const selectedMessages = await selectAppendableTranscriptTurnMessages(target, options);
	const appendedMessages = [];
	for (const append of selectedMessages) {
		const { shouldAppend: _shouldAppend, ...appendOptions } = append;
		const result = await appendTranscriptMessage({
			...target.agentId ? { agentId: target.agentId } : {},
			...target.sessionId ? { sessionId: target.sessionId } : {},
			...target.sessionKey ? { sessionKey: target.sessionKey } : {},
			...target.storePath ? { storePath: target.storePath } : {}
		}, {
			...appendOptions,
			message: attachSessionTranscriptRunId(appendOptions.message, options.runId),
			...append.cwd ?? options.cwd ? { cwd: append.cwd ?? options.cwd } : {},
			...append.config ?? options.config ? { config: append.config ?? options.config } : {}
		});
		if (result) {
			options.onMessageCommitted?.(result);
			appendedMessages.push(result);
		}
	}
	rememberCommittedTranscriptMessageSequences(target, appendedMessages);
	return appendedMessages;
}
async function selectAppendableTranscriptTurnMessages(target, options) {
	const selectedMessages = [];
	for (const append of options.messages) {
		if (!(append.shouldAppend ? await append.shouldAppend({
			...target.agentId ? { agentId: target.agentId } : {},
			...target.sessionId ? { sessionId: target.sessionId } : {},
			...target.sessionKey ? { sessionKey: target.sessionKey } : {},
			...target.storePath ? { storePath: target.storePath } : {}
		}) : true)) continue;
		selectedMessages.push(append);
	}
	return selectedMessages;
}
function countAppendedTranscriptMessages(messages) {
	return messages.filter((message) => message.appended).length;
}
async function persistExpectedSessionTranscriptTurn(scope, options) {
	const requestedSessionKey = scope.sessionKey?.trim();
	const expectedSessionId = options.expectedSessionId;
	const { agentId, sessionKey, storePath } = await prepareTranscriptTurnTarget({
		...scope,
		sessionId: expectedSessionId
	}, options.config);
	const resolved = scope.sessionStore ? resolveSessionStoreEntryCore({
		store: scope.sessionStore,
		sessionKey
	}) : resolveSessionEntrySelection({
		agentId,
		...scope.env ? { env: scope.env } : {},
		sessionKey,
		storePath
	});
	const target = {
		agentId,
		sessionId: expectedSessionId,
		sessionKey: resolved.normalizedKey,
		storePath
	};
	const inheritedWriterFence = getOwnedSessionTranscriptWriterFence({
		sessionFile: target.sessionKey,
		sessionKey: target.sessionKey,
		sessionTarget: target
	});
	const turn = await runWithOwnedSessionTranscriptWrite({
		sessionFile: target.sessionKey,
		sessionKey: target.sessionKey,
		sessionTarget: target
	}, async () => {
		const committed = await appendExpectedSessionTranscriptTurn({
			agentId,
			...scope.env ? { env: scope.env } : {},
			sessionKey: resolved.normalizedKey,
			sessionId: expectedSessionId,
			storePath
		}, {
			config: options.config,
			cwd: options.cwd,
			expectedLifecycleRevision: options.expectedLifecycleRevision !== void 0 ? options.expectedLifecycleRevision : inheritedWriterFence?.expectedLifecycleRevision,
			expectedWriterRunId: options.expectedWriterRunId ?? inheritedWriterFence?.expectedWriterRunId,
			expectedSessionState: options.expectedSessionState,
			expectedSessionId,
			initialSessionEntry: options.initialSessionEntry,
			atomicGroup: options.atomicGroup,
			messages: options.messages.map((append) => ({
				...append,
				message: attachSessionTranscriptRunId(append.message, options.runId)
			})),
			sessionLifecyclePatch: options.sessionLifecyclePatch,
			sessionTurnMutation: options.sessionTurnMutation,
			sessionFile: target.sessionKey,
			touchSessionEntry: options.touchSessionEntry
		});
		for (const message of committed.appendedMessages) options.onMessageCommitted?.(message);
		return committed;
	});
	if (turn.rejectedReason === "session-rebound") return {
		appendedCount: 0,
		messages: [],
		rejectedReason: "session-rebound",
		sessionEntry: turn.sessionEntry
	};
	await publishTranscriptTurnUpdate({
		target: requestedSessionKey === target.sessionKey ? target : {
			...target,
			sessionKey: requestedSessionKey
		},
		sessionEntry: turn.sessionEntry,
		updateMode: options.updateMode ?? "inline",
		publishWhen: options.publishWhen ?? "when-appended",
		appendedMessages: turn.appendedMessages,
		runId: options.runId
	});
	if (turn.sessionEntry && scope.sessionStore) scope.sessionStore[resolved.normalizedKey] = turn.sessionEntry;
	return {
		sessionTurnMutationResult: turn.sessionTurnMutationResult,
		appendedCount: countAppendedTranscriptMessages(turn.appendedMessages),
		messages: turn.appendedMessages,
		sessionEntry: turn.sessionEntry ?? scope.sessionEntry
	};
}
async function prepareTranscriptTurnTarget(scope, config) {
	const sessionKey = scope.sessionKey?.trim();
	if (!sessionKey || !scope.sessionId) throw new Error("Cannot persist a transcript turn without a session key and session id");
	const effectiveConfig = config ?? getRuntimeConfig();
	const agentId = resolveTranscriptTurnAgentId({
		config: effectiveConfig,
		scopeAgentId: scope.agentId,
		sessionKey,
		storePath: scope.storePath,
		sessionStore: scope.sessionStore,
		env: scope.env
	});
	const storePath = scope.storePath ?? resolveSessionStorePathCore(effectiveConfig.session?.store, {
		agentId,
		env: scope.env
	});
	return {
		...await resolveSessionTranscriptRuntimeTarget({
			agentId,
			...scope.env ? { env: scope.env } : {},
			sessionId: scope.sessionId,
			sessionKey,
			storePath
		}),
		storePath
	};
}
async function resolveTranscriptTurnTarget(scope, config) {
	const target = await prepareTranscriptTurnTarget(scope, config);
	const resolved = scope.sessionStore ? resolveSessionStoreEntryCore({
		store: scope.sessionStore,
		sessionKey: target.sessionKey
	}) : void 0;
	const persistedEntry = loadSessionEntryReadOnly({
		...scope,
		...target
	});
	const sessionEntry = persistedEntry ?? resolved?.existing ?? scope.sessionEntry;
	return {
		...target,
		sessionEntry,
		entryFromPersistedStore: persistedEntry != null
	};
}
async function touchTranscriptTurnSessionEntry(params) {
	if (!params.shouldTouch || !params.target.storePath || !params.target.sessionKey || !params.target.sessionId) return params.target.sessionEntry;
	const updatedAt = Date.now();
	const updated = await updateSessionEntry({
		sessionKey: params.target.sessionKey,
		storePath: params.target.storePath,
		...params.target.agentId ? { agentId: params.target.agentId } : {}
	}, (current) => current.sessionId === params.target.sessionId ? { updatedAt: Math.max(current.updatedAt ?? 0, updatedAt) } : null, { skipMaintenance: true });
	if (updated && params.scope.sessionStore) params.scope.sessionStore[params.target.sessionKey] = updated;
	return updated ?? params.target.sessionEntry;
}
async function publishTranscriptTurnUpdate(params) {
	if (params.updateMode === "none") return;
	const appendedMessages = params.appendedMessages.filter((message) => message.appended);
	if (params.publishWhen === "when-appended" && appendedMessages.length === 0) return;
	const target = params.target.agentId && params.target.sessionId && params.target.sessionKey ? {
		agentId: params.target.agentId,
		sessionId: params.target.sessionId,
		sessionKey: params.target.sessionKey,
		...params.target.storePath ? { storePath: params.target.storePath } : {}
	} : void 0;
	const update = {
		...params.target.sessionKey ? { sessionKey: params.target.sessionKey } : {},
		...params.target.agentId ? { agentId: params.target.agentId } : {},
		...target ? { target } : {},
		...params.sessionEntry?.lifecycleRevision ? { lifecycleRevision: params.sessionEntry.lifecycleRevision } : {}
	};
	if (params.updateMode !== "inline" || appendedMessages.length === 0) {
		emitSessionTranscriptUpdate(update);
		return;
	}
	const sequencedMessages = appendedMessages.map((message) => ({
		message,
		messageSeq: readCommittedTranscriptMessageSequence(message)
	}));
	if (sequencedMessages.length > 1 && sequencedMessages.some(({ messageSeq }) => messageSeq === void 0)) {
		emitSessionTranscriptUpdate(update);
		return;
	}
	for (const { message, messageSeq } of sequencedMessages) {
		const runId = resolveTerminalAssistantTranscriptRunId(message.message, params.runId);
		emitSessionTranscriptUpdate({
			...update,
			message: message.message,
			messageId: message.messageId,
			...messageSeq !== void 0 ? { messageSeq } : {},
			...runId ? { runId } : {}
		});
	}
}
//#endregion
//#region src/config/sessions/session-accessor.transcript-range.ts
function anchorsShareTarget(boundary) {
	const { admission, terminal } = boundary;
	return admission.agentId === terminal.agentId && admission.sessionId === terminal.sessionId && admission.sessionKey === terminal.sessionKey && admission.storePath === terminal.storePath && admission.generation === terminal.generation;
}
function validateAnchorRow(anchor, row) {
	return Boolean(row && row.generation === anchor.generation && row.seq === anchor.rawSeq && row.parent_id === anchor.effectiveParentId && row.message_position === anchor.activeMessagePosition);
}
function validateTerminalAncestry(params) {
	if (params.terminalEntryId === params.admissionEntryId) return "descendant";
	const db = getSessionKysely(params.database);
	const seen = /* @__PURE__ */ new Set([params.terminalEntryId]);
	let parentId = params.terminalParentId;
	for (let depth = 0; depth < params.maxDepth; depth += 1) {
		if (parentId === params.admissionEntryId) return "descendant";
		if (parentId === null || seen.has(parentId)) return "non-descendant";
		seen.add(parentId);
		const row = executeSqliteQueryTakeFirstSync(params.database, db.selectFrom("transcript_event_identities").select("parent_id").where("session_id", "=", params.sessionId).where("event_id", "=", parentId).limit(1));
		if (!row) return "non-descendant";
		parentId = row.parent_id;
	}
	return "too-large";
}
/** Reads one bounded accepted transcript range from a single SQLite snapshot. */
function readClosedTranscriptTurn(params) {
	if (!anchorsShareTarget(params.boundary)) return { kind: "session-rebound" };
	const target = params.boundary.admission;
	const resolved = resolveSqliteTranscriptScope({
		agentId: target.agentId,
		sessionId: target.sessionId,
		sessionKey: target.sessionKey,
		storePath: target.storePath
	});
	const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
	return runSqliteDeferredTransactionSync(database.db, () => {
		const db = getSessionKysely(database.db);
		if (!executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_windows").select(["session_id"]).where("session_id", "=", target.sessionId).where("session_key", "=", target.sessionKey).limit(1))) return { kind: "session-rebound" };
		const frontier = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_events").select("seq").where("session_id", "=", target.sessionId).orderBy("seq", "desc").limit(1))?.seq;
		const projection = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_transcript_index_state").select(["indexed_seq", "needs_rebuild"]).where("session_id", "=", target.sessionId));
		if (frontier === void 0 || !projection || projection.needs_rebuild !== 0 || projection.indexed_seq !== frontier) return { kind: "projection-unavailable" };
		const readAnchor = (anchor) => executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_event_identities as identity").innerJoin("session_transcript_active_events as active", (join) => join.onRef("active.session_id", "=", "identity.session_id").onRef("active.event_seq", "=", "identity.seq")).innerJoin("transcript_rewrite_watermarks as rewrite", (join) => join.onRef("rewrite.session_id", "=", "identity.session_id")).innerJoin("transcript_events as event", (join) => join.onRef("event.session_id", "=", "identity.session_id").onRef("event.seq", "=", "identity.seq")).select([
			"identity.seq",
			"identity.parent_id",
			"active.message_position",
			"rewrite.generation",
			"event.event_json"
		]).where("identity.session_id", "=", target.sessionId).where("identity.event_id", "=", anchor.entryId).limit(1));
		const admissionRow = readAnchor(params.boundary.admission);
		const terminalRow = readAnchor(params.boundary.terminal);
		if (!validateAnchorRow(params.boundary.admission, admissionRow) || !validateAnchorRow(params.boundary.terminal, terminalRow)) return { kind: "stale" };
		const admissionEvent = JSON.parse(admissionRow.event_json);
		if (admissionEvent.type !== "message" || admissionEvent.message?.role !== "user") return { kind: "stale" };
		const ancestry = validateTerminalAncestry({
			database: database.db,
			sessionId: target.sessionId,
			admissionEntryId: params.boundary.admission.entryId,
			terminalEntryId: params.boundary.terminal.entryId,
			terminalParentId: terminalRow.parent_id,
			maxDepth: params.maxEvents
		});
		if (ancestry !== "descendant") return { kind: ancestry };
		const rows = executeSqliteQuerySync(database.db, db.selectFrom("session_transcript_active_events as active").innerJoin("transcript_events as event", (join) => join.onRef("event.session_id", "=", "active.session_id").onRef("event.seq", "=", "active.event_seq")).select("event.event_json").where("active.session_id", "=", target.sessionId).where("active.message_position", "is not", null).where("active.message_position", ">=", params.boundary.admission.activeMessagePosition).where("active.message_position", "<=", params.boundary.terminal.activeMessagePosition).orderBy("active.message_position", "asc").limit(params.maxEvents + 1)).rows;
		if (rows.length > params.maxEvents || rows.reduce((total, row) => total + Buffer$1.byteLength(row.event_json, "utf8"), 0) > params.maxBytes) return { kind: "too-large" };
		return {
			kind: "ok",
			messages: rows.flatMap((row) => {
				const event = JSON.parse(row.event_json);
				return event.type === "message" && event.message ? [event.message] : [];
			})
		};
	}, {
		databaseLabel: database.path,
		operationLabel: "session transcript accepted turn read"
	});
}
//#endregion
//#region src/config/sessions/session-transcript-projection-error.ts
var SessionTranscriptProjectionUnavailableError = class extends Error {
	constructor(sessionId) {
		super(`Session transcript projection is rebuilding: ${sessionId}`);
		this.sessionId = sessionId;
		this.name = "SessionTranscriptProjectionUnavailableError";
	}
};
function isSessionTranscriptProjectionUnavailableError(error) {
	return error instanceof SessionTranscriptProjectionUnavailableError;
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-active-projection.ts
const EMPTY_PROJECTION_STATE = {
	activeEventCount: 0,
	activeMessageCount: 0,
	indexedSeq: -1,
	leafEventId: null,
	needsRebuild: false
};
function getActiveTranscriptKysely(database) {
	return getNodeSqliteKysely(database.db);
}
function parseActiveTranscriptMessageRow(row) {
	if (row.message_position === null) throw new Error("Active transcript message row is missing its message position");
	return {
		event: JSON.parse(row.event_json),
		eventSeq: row.event_seq,
		seq: row.message_position + 1
	};
}
function readTranscriptProjectionGeneration(projection) {
	return executeSqliteQueryTakeFirstSync(projection.database.db, getActiveTranscriptKysely(projection.database).selectFrom("transcript_rewrite_watermarks").select("generation").where("session_id", "=", projection.resolved.sessionId))?.generation;
}
function readProjectionSnapshot(database, sessionId) {
	const row = executeSqliteQueryTakeFirstSync(database.db, getActiveTranscriptKysely(database).selectFrom("transcript_events as latest").leftJoin("session_transcript_index_state as state", "state.session_id", "latest.session_id").select([
		"latest.seq as latest_seq",
		"state.active_event_count",
		"state.active_message_count",
		"state.indexed_seq",
		"state.leaf_event_id",
		"state.needs_rebuild"
	]).where("latest.session_id", "=", sessionId).orderBy("latest.seq", "desc").limit(1));
	if (!row) return;
	return {
		latestSeq: row.latest_seq,
		...typeof row.indexed_seq === "number" ? { state: {
			activeEventCount: row.active_event_count ?? 0,
			activeMessageCount: row.active_message_count ?? 0,
			indexedSeq: row.indexed_seq,
			leafEventId: row.leaf_event_id,
			needsRebuild: row.needs_rebuild !== 0
		} } : {}
	};
}
function withCurrentProjectionSnapshot(scope, read) {
	const resolved = resolveSqliteTranscriptReadScope(scope);
	const databaseOptions = toDatabaseOptions(resolved);
	const database = openOpenClawAgentDatabase(databaseOptions);
	const result = runSqliteDeferredTransactionSync(database.db, () => {
		const snapshot = readProjectionSnapshot(database, resolved.sessionId);
		if (!snapshot) return {
			kind: "value",
			value: read({
				database,
				resolved,
				state: EMPTY_PROJECTION_STATE
			})
		};
		if (snapshot.state && !snapshot.state.needsRebuild && snapshot.state.indexedSeq === snapshot.latestSeq && !hasUnclassifiedSessionTranscriptEvents(database.db, resolved.sessionId)) return {
			kind: "value",
			value: read({
				database,
				resolved,
				state: snapshot.state
			})
		};
		return { kind: "unavailable" };
	}, {
		databaseLabel: database.path,
		operationLabel: "sessions.history.read"
	});
	if (result.kind === "value") return result.value;
	startSessionTranscriptIndexReconcile({
		...databaseOptions,
		preferredSessionId: resolved.sessionId
	});
	throw new SessionTranscriptProjectionUnavailableError(resolved.sessionId);
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-reset-window.ts
function isWindowBoundary(eventType, scope) {
	return eventType === "reset" || scope === "context" && eventType === "compaction";
}
const resetMessageWindowCache = /* @__PURE__ */ new Map();
const MAX_RESET_MESSAGE_WINDOW_CACHE = 64;
function selectMessageRows(projection) {
	return getActiveTranscriptKysely(projection.database).selectFrom("session_transcript_active_events as active").innerJoin("transcript_events as event", (join) => join.onRef("event.session_id", "=", "active.session_id").onRef("event.seq", "=", "active.event_seq")).where("active.session_id", "=", projection.resolved.sessionId).where("active.message_position", "is not", null).orderBy("active.message_position", "asc");
}
function cacheResetMessageWindow(key, entry) {
	resetMessageWindowCache.delete(key);
	resetMessageWindowCache.set(key, entry);
	pruneMapToMaxSize(resetMessageWindowCache, MAX_RESET_MESSAGE_WINDOW_CACHE);
}
function readLatestActiveBoundaryMetadataByType(projection, eventType) {
	const db = getActiveTranscriptKysely(projection.database);
	return executeSqliteQueryTakeFirstSync(projection.database.db, db.selectFrom("session_transcript_active_events as active").innerJoin("transcript_event_identities as identity", (join) => join.onRef("identity.session_id", "=", "active.session_id").onRef("identity.seq", "=", "active.event_seq")).select([
		"active.active_position",
		"identity.event_type",
		"identity.seq"
	]).where("active.session_id", "=", projection.resolved.sessionId).where("identity.event_type", "=", eventType).orderBy("identity.seq", "desc").limit(1));
}
function readLatestActiveBoundaryMetadata(projection, scope) {
	const reset = readLatestActiveBoundaryMetadataByType(projection, "reset");
	if (scope === "history") return reset;
	const compaction = readLatestActiveBoundaryMetadataByType(projection, "compaction");
	return reset && (!compaction || reset.seq > compaction.seq) ? reset : compaction;
}
function readBoundaryWindowFacts(projection, seq, scope) {
	const row = executeSqliteQueryTakeFirstSync(projection.database.db, getActiveTranscriptKysely(projection.database).selectFrom("transcript_events").select((eb) => [projectModelContextNavigationSql(eb.ref("event_json")).as("event_json"), sql`OCTET_LENGTH(event_json) + 1`.as("serialized_bytes")]).where("session_id", "=", projection.resolved.sessionId).where("seq", "=", seq).limit(1));
	if (!row) throw new Error("Active transcript boundary is missing");
	const parsed = JSON.parse(row.event_json);
	if (!isWindowBoundary(parsed.type, scope)) throw new Error("Active transcript boundary has invalid payload");
	return {
		firstKeptEntryId: parsed.firstKeptEntryId,
		sizeBytes: row.serialized_bytes
	};
}
function findLatestResetMessageWindow(projection, scope) {
	const db = getActiveTranscriptKysely(projection.database);
	const latestBoundary = readLatestActiveBoundaryMetadata(projection, scope);
	if (!latestBoundary) return null;
	const boundary = readBoundaryWindowFacts(projection, latestBoundary.seq, scope);
	const postBoundaryMessagePosition = executeSqliteQueryTakeFirstSync(projection.database.db, db.selectFrom("session_transcript_active_events").select("message_position").where("session_id", "=", projection.resolved.sessionId).where("active_position", ">", latestBoundary.active_position).where("message_position", "is not", null).orderBy("active_position", "asc").limit(1))?.message_position ?? projection.state.activeMessageCount;
	let keptMessagePositions = [];
	const includesBoundary = latestBoundary.event_type === "compaction";
	let contextPrefixEventCount = includesBoundary ? 1 : 0;
	let contextPrefixSizeBytes = includesBoundary ? boundary.sizeBytes : 0;
	if (typeof boundary.firstKeptEntryId === "string") {
		const firstKept = executeSqliteQueryTakeFirstSync(projection.database.db, db.selectFrom("transcript_event_identities as identity").innerJoin("session_transcript_active_events as active", (join) => join.onRef("active.session_id", "=", "identity.session_id").onRef("active.event_seq", "=", "identity.seq")).select("active.active_position").where("identity.session_id", "=", projection.resolved.sessionId).where("identity.event_id", "=", boundary.firstKeptEntryId));
		if (firstKept && firstKept.active_position < latestBoundary.active_position) {
			const candidateRows = iterateSqliteQuerySync(projection.database.db, db.selectFrom("session_transcript_active_events as active").innerJoin("transcript_events as event", (join) => join.onRef("event.session_id", "=", "active.session_id").onRef("event.seq", "=", "active.event_seq")).select((eb) => [
				"active.message_position",
				projectModelContextNavigationSql(eb.ref("event.event_json")).as("event_json"),
				sql`OCTET_LENGTH(event.event_json) + 1`.as("serialized_bytes")
			]).where("active.session_id", "=", projection.resolved.sessionId).where("active.active_position", ">=", firstKept.active_position).where("active.active_position", "<", latestBoundary.active_position).where("active.message_position", "is not", null).$if(scope === "context", (query) => query.where("active.context_eligible", "=", 1)).orderBy("active.active_position", "asc"));
			const candidates = Array.from(candidateRows, (row) => {
				try {
					return [{
						message_position: row.message_position,
						serialized_bytes: row.serialized_bytes,
						event: JSON.parse(row.event_json)
					}];
				} catch {
					return [];
				}
			}).flat();
			const candidateEntries = candidates.map((row) => row.event);
			const keptEntries = new Set(latestBoundary.event_type === "reset" ? selectResetKeptEntries(candidateEntries) : candidateEntries);
			const keptRows = candidates.filter((row) => keptEntries.has(row.event));
			contextPrefixEventCount += keptRows.length;
			contextPrefixSizeBytes += keptRows.reduce((total, row) => total + row.serialized_bytes, 0);
			keptMessagePositions = keptRows.flatMap((row) => {
				if (row.message_position === null || row.event.type !== "message") return [];
				const role = row.event.message.role;
				return role === "user" || role === "assistant" ? [row.message_position] : [];
			});
		}
	}
	return {
		boundarySeq: latestBoundary.seq,
		contextPrefixEventCount,
		keptMessagePositions,
		contextPrefixSizeBytes,
		postBoundaryMessagePosition,
		boundaryActivePosition: latestBoundary.active_position
	};
}
function resolveResetMessageWindow(projection, scope = "history") {
	const key = `${projection.database.path}\0${projection.resolved.sessionId}\0${scope}`;
	const cached = resetMessageWindowCache.get(key);
	const generation = readTranscriptProjectionGeneration(projection);
	if (cached) {
		if (cached.generation === generation && cached.indexedSeq === projection.state.indexedSeq) return cached.window;
		if (cached.generation === generation && cached.window) {
			if (readLatestActiveBoundaryMetadata(projection, scope)?.seq === cached.window.boundarySeq) {
				cacheResetMessageWindow(key, {
					...cached,
					indexedSeq: projection.state.indexedSeq
				});
				return cached.window;
			}
		}
	}
	const window = findLatestResetMessageWindow(projection, scope);
	cacheResetMessageWindow(key, {
		generation,
		indexedSeq: projection.state.indexedSeq,
		window
	});
	return window;
}
function resolveVisibleMessagePositions(projection) {
	const window = resolveResetMessageWindow(projection);
	if (!window) return {
		kept: [],
		postStart: 0,
		total: projection.state.activeMessageCount
	};
	return {
		kept: window.keptMessagePositions,
		postStart: window.postBoundaryMessagePosition,
		total: window.keptMessagePositions.length + Math.max(0, projection.state.activeMessageCount - window.postBoundaryMessagePosition)
	};
}
function selectVisibleMessageRanges(projection, start, endExclusive) {
	const ranges = [];
	if (endExclusive <= start) return ranges;
	const visible = resolveVisibleMessagePositions(projection);
	const boundedStart = Math.min(Math.max(0, start), visible.total);
	const boundedEnd = Math.min(Math.max(boundedStart, endExclusive), visible.total);
	const query = selectMessageRows(projection);
	const keptEnd = Math.min(boundedEnd, visible.kept.length);
	for (let offset = boundedStart; offset < keptEnd; offset += 500) {
		const positions = visible.kept.slice(offset, Math.min(offset + 500, keptEnd));
		const ordinals = new Map(positions.map((position, index) => [position, offset + index]));
		ranges.push({
			query: query.where("active.message_position", "in", positions),
			logicalPosition: (position) => ordinals.get(position)
		});
	}
	const logicalStart = Math.max(boundedStart, visible.kept.length);
	if (boundedEnd > logicalStart) {
		const rawStart = visible.postStart + logicalStart - visible.kept.length;
		ranges.push({
			query: query.where("active.message_position", ">=", rawStart).where("active.message_position", "<", rawStart + boundedEnd - logicalStart),
			logicalPosition: (position) => logicalStart + position - rawStart
		});
	}
	return ranges;
}
function readVisibleMessageRange(projection, start, endExclusive) {
	return Array.from(iterateVisibleMessageRange(projection, start, endExclusive));
}
function* iterateVisibleMessageRange(projection, start, endExclusive) {
	for (const range of selectVisibleMessageRanges(projection, start, endExclusive)) for (const row of iterateSqliteQuerySync(projection.database.db, range.query.select([
		"active.event_seq",
		"active.message_position",
		"event.event_json"
	]))) yield parseActiveTranscriptMessageRow(row);
}
/** Sizes the same logical ranges without fetching or parsing excluded payloads. */
function readVisibleMessageMetadata(projection, start, endExclusive) {
	return selectVisibleMessageRanges(projection, start, endExclusive).flatMap((range) => executeSqliteQuerySync(projection.database.db, range.query.select(["active.message_position", sql`OCTET_LENGTH(event.event_json) + 1`.as("serialized_bytes")]).$narrowType()).rows.map((row) => ({
		message_position: row.message_position,
		serialized_bytes: row.serialized_bytes,
		logicalPosition: range.logicalPosition(row.message_position)
	})));
}
/** Reads logical transcript bytes, reusing cached retained-tail facts after resets. */
function readVisibleTranscriptStats(projection) {
	const window = resolveResetMessageWindow(projection, "context");
	const base = getActiveTranscriptKysely(projection.database).selectFrom("session_transcript_active_events as active").innerJoin("transcript_events as event", (join) => join.onRef("event.session_id", "=", "active.session_id").onRef("event.seq", "=", "active.event_seq")).select((eb) => [eb.fn.count("active.event_seq").as("event_count"), sql`COALESCE(SUM(OCTET_LENGTH(event.event_json)), 0)
        + COUNT(*)`.as("size_bytes")]).where("active.session_id", "=", projection.resolved.sessionId).where("active.context_eligible", "=", 1);
	const row = executeSqliteQueryTakeFirstSync(projection.database.db, window ? base.where("active.active_position", ">", window.boundaryActivePosition) : base);
	return {
		eventCount: (row?.event_count ?? 0) + (window?.contextPrefixEventCount ?? 0),
		sizeBytes: (row?.size_bytes ?? 0) + (window?.contextPrefixSizeBytes ?? 0)
	};
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-visible-cursor.ts
const VISIBLE_MESSAGE_CURSOR_VERSION = 1;
const DEFAULT_VISIBLE_MESSAGE_MAX_MESSAGES = 1e3;
const DEFAULT_VISIBLE_MESSAGE_MAX_BYTES = 1e6;
const MAX_VISIBLE_MESSAGE_MAX_MESSAGES = 1e4;
const MAX_VISIBLE_MESSAGE_MAX_BYTES = 67108864;
function normalizeVisibleMessageLimit(value, fallback, maximum, name) {
	const resolved = value ?? fallback;
	if (!Number.isInteger(resolved) || resolved < 1 || resolved > maximum) throw new RangeError(`${name} must be an integer between 1 and ${String(maximum)}`);
	return resolved;
}
function encodeVisibleMessageCursor(cursor) {
	return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}
function createVisibleMessageCursor(params) {
	return {
		...params,
		lastEventSeq: -1,
		lastMessagePosition: -1,
		version: VISIBLE_MESSAGE_CURSOR_VERSION
	};
}
function parseVisibleMessageCursor(value) {
	if (value.length > 4096) return;
	try {
		const bytes = Buffer.from(value, "base64url");
		if (bytes.toString("base64url") !== value) return;
		const parsed = JSON.parse(bytes.toString("utf8"));
		if (parsed.version !== VISIBLE_MESSAGE_CURSOR_VERSION || typeof parsed.agentId !== "string" || typeof parsed.sessionId !== "string" || typeof parsed.generation !== "string" || typeof parsed.lastEventSeq !== "number" || !Number.isSafeInteger(parsed.lastEventSeq) || parsed.lastEventSeq < -1 || typeof parsed.lastMessagePosition !== "number" || !Number.isSafeInteger(parsed.lastMessagePosition) || parsed.lastMessagePosition < -1 || parsed.lastEventSeq === -1 !== (parsed.lastMessagePosition === -1)) return;
		const cursor = {
			agentId: parsed.agentId,
			generation: parsed.generation,
			sessionId: parsed.sessionId,
			lastEventSeq: parsed.lastEventSeq,
			lastMessagePosition: parsed.lastMessagePosition,
			version: parsed.version
		};
		return encodeVisibleMessageCursor(cursor) === value ? cursor : void 0;
	} catch {
		return;
	}
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-active-events.ts
/** Reads every message event on the active path. Full callers remain intentionally O(output). */
function readSessionTranscriptMessageEvents(scope) {
	return withCurrentProjectionSnapshot(scope, (projection) => {
		return readVisibleMessageRange(projection, 0, resolveVisibleMessagePositions(projection).total);
	});
}
/** Visits messages synchronously inside one active-path read snapshot. */
function visitSessionTranscriptMessageEvents(scope, visit) {
	withCurrentProjectionSnapshot(scope, (projection) => {
		const visible = resolveVisibleMessagePositions(projection);
		for (const entry of iterateVisibleMessageRange(projection, 0, visible.total)) visit(entry);
	});
}
/** Classifies one entry against the authoritative active path and leaf. */
function readSessionTranscriptActivePathEntryRelation(scope, entryId) {
	return withCurrentProjectionSnapshot(scope, (projection) => {
		if (projection.state.leafEventId === entryId || entryId === null) return projection.state.leafEventId === entryId ? "exact" : "off-path";
		const db = getActiveTranscriptKysely(projection.database);
		return executeSqliteQueryTakeFirstSync(projection.database.db, db.selectFrom("transcript_event_identities as identity").innerJoin("session_transcript_active_events as active", (join) => join.onRef("active.session_id", "=", "identity.session_id").onRef("active.event_seq", "=", "identity.seq")).select("identity.seq").where("identity.session_id", "=", projection.resolved.sessionId).where("identity.event_id", "=", entryId).limit(1)) ? "ancestor" : "off-path";
	});
}
/** Reads a bounded context tail, preserving control facts but excluding display-only messages. */
function readRecentSessionTranscriptActiveEvents(scope, maxEvents) {
	return withCurrentProjectionSnapshot(scope, (projection) => {
		const limit = Math.max(0, Math.floor(Number.isFinite(maxEvents) ? maxEvents : 0));
		if (limit === 0) return [];
		const db = getActiveTranscriptKysely(projection.database);
		return executeSqliteQuerySync(projection.database.db, db.selectFrom("session_transcript_active_events as active").innerJoin("transcript_events as event", (join) => join.onRef("event.session_id", "=", "active.session_id").onRef("event.seq", "=", "active.event_seq")).select("event.event_json").where("active.session_id", "=", projection.resolved.sessionId).where("active.context_eligible", "=", 1).orderBy("active.active_position", "desc").limit(limit)).rows.toReversed().map((row) => JSON.parse(row.event_json));
	});
}
/** Reads logical transcript event count and JSONL byte size. */
function readSessionTranscriptActiveStats(scope) {
	return withCurrentProjectionSnapshot(scope, readVisibleTranscriptStats);
}
/** Reads one append-stable forward page from the materialized active-message projection. */
function readSessionTranscriptVisibleMessageDeltaCore(scope, limits = {}) {
	const maxMessages = normalizeVisibleMessageLimit(limits.maxMessages, DEFAULT_VISIBLE_MESSAGE_MAX_MESSAGES, MAX_VISIBLE_MESSAGE_MAX_MESSAGES, "maxMessages");
	const maxBytes = normalizeVisibleMessageLimit(limits.maxBytes, DEFAULT_VISIBLE_MESSAGE_MAX_BYTES, MAX_VISIBLE_MESSAGE_MAX_BYTES, "maxBytes");
	return withCurrentProjectionSnapshot(scope, (projection) => {
		const db = getActiveTranscriptKysely(projection.database);
		const transcriptFence = resolveSqliteSessionTranscriptReadFence({
			database: projection.database,
			...projection.resolved
		});
		const generation = readTranscriptProjectionGeneration(projection);
		if (!generation) return { kind: "missing" };
		const initialCursor = createVisibleMessageCursor({
			agentId: projection.resolved.agentId,
			generation,
			sessionId: projection.resolved.sessionId
		});
		const reset = (reason) => ({
			kind: "reset",
			cursor: encodeVisibleMessageCursor(initialCursor),
			reason
		});
		const cursor = limits.cursor !== void 0 ? parseVisibleMessageCursor(limits.cursor) : initialCursor;
		if (!cursor) return reset("invalid_cursor");
		if (cursor.agentId !== projection.resolved.agentId || cursor.sessionId !== projection.resolved.sessionId) return reset("scope_mismatch");
		if (cursor.generation !== generation) return reset("generation_mismatch");
		if (transcriptFence !== void 0 && cursor.lastMessagePosition >= transcriptFence.beforeActiveMessagePosition) throw new SessionTranscriptReadFenceError("Transcript read cursor has crossed the current-turn admission fence");
		let startPosition = 0;
		if (cursor.lastEventSeq >= 0) {
			const anchor = executeSqliteQueryTakeFirstSync(projection.database.db, db.selectFrom("session_transcript_active_events").select("message_position").where("session_id", "=", projection.resolved.sessionId).where("event_seq", "=", cursor.lastEventSeq).where("message_position", "is not", null));
			if (anchor?.message_position === null || anchor?.message_position === void 0) return reset("anchor_missing");
			if (anchor.message_position !== cursor.lastMessagePosition) return reset("anchor_moved");
			startPosition = anchor.message_position + 1;
		}
		const metadata = executeSqliteQuerySync(projection.database.db, db.selectFrom("session_transcript_active_events as active").innerJoin("transcript_events as event", (join) => join.onRef("event.session_id", "=", "active.session_id").onRef("event.seq", "=", "active.event_seq")).select([
			"active.event_seq",
			"active.message_position",
			sql`OCTET_LENGTH(event.event_json) + 1`.as("serialized_bytes")
		]).where("active.session_id", "=", projection.resolved.sessionId).where("active.message_position", "is not", null).where("active.message_position", ">=", startPosition).$if(transcriptFence !== void 0, (query) => query.where("active.message_position", "<", transcriptFence.beforeActiveMessagePosition)).orderBy("active.message_position", "asc").limit(maxMessages + 1)).rows;
		let serializedBytes = 0;
		let selectedCount = 0;
		for (const row of metadata) {
			if (selectedCount >= maxMessages || serializedBytes + row.serialized_bytes > maxBytes) break;
			serializedBytes += row.serialized_bytes;
			selectedCount += 1;
		}
		const selected = metadata.slice(0, selectedCount);
		const lastEventSeq = selected.at(-1)?.event_seq ?? cursor.lastEventSeq;
		const lastMessagePosition = selected.at(-1)?.message_position ?? cursor.lastMessagePosition;
		const rows = selectedCount === 0 ? [] : executeSqliteQuerySync(projection.database.db, db.selectFrom("session_transcript_active_events as active").innerJoin("transcript_events as event", (join) => join.onRef("event.session_id", "=", "active.session_id").onRef("event.seq", "=", "active.event_seq")).leftJoin("session_transcript_active_events as parent_active", (join) => join.onRef("parent_active.session_id", "=", "active.session_id").on((eb) => eb("parent_active.active_position", "=", eb("active.active_position", "-", 1)))).leftJoin("transcript_event_identities as parent_identity", (join) => join.onRef("parent_identity.session_id", "=", "parent_active.session_id").onRef("parent_identity.seq", "=", "parent_active.event_seq")).select([
			"active.event_seq",
			"active.message_position",
			"event.event_json",
			"parent_identity.event_id as parent_id"
		]).where("active.session_id", "=", projection.resolved.sessionId).where("active.message_position", ">=", startPosition).where("active.message_position", "<=", lastMessagePosition).orderBy("active.message_position", "asc")).rows.map((row) => {
			if (row.message_position === null) throw new Error("Active transcript message row is missing its message position");
			return {
				event: JSON.parse(row.event_json),
				eventSeq: row.event_seq,
				parentId: row.parent_id,
				seq: row.message_position + 1
			};
		});
		const requiredBytes = selectedCount === 0 && metadata[0] ? metadata[0].serialized_bytes : void 0;
		return {
			kind: "page",
			cursor: encodeVisibleMessageCursor({
				...cursor,
				lastEventSeq,
				lastMessagePosition
			}),
			events: rows,
			hasMore: selectedCount < metadata.length,
			...requiredBytes !== void 0 ? { requiredBytes } : {},
			serializedBytes
		};
	});
}
/** Reads a bounded active-path tail while preserving transcript line and byte caps. */
function readRecentSessionTranscriptMessageEvents(scope, options) {
	return withCurrentProjectionSnapshot(scope, (projection) => {
		const visible = resolveVisibleMessagePositions(projection);
		const maxMessages = Math.min(MAX_VISIBLE_MESSAGE_MAX_MESSAGES, Math.max(0, Math.floor(Number.isFinite(options.maxMessages) ? options.maxMessages : 0)));
		const maxLines = Math.max(0, Math.floor(Number.isFinite(options.maxLines) ? options.maxLines : 0));
		if (maxMessages === 0 || maxLines === 0) return {
			activeLeafEntryId: projection.state.leafEventId,
			events: [],
			totalMessages: visible.total
		};
		const maxBytes = Math.max(1024, Math.floor(Number.isFinite(options.maxBytes) ? options.maxBytes : 8388608));
		const candidates = readVisibleMessageMetadata(projection, Math.max(0, visible.total - Math.min(maxLines, maxMessages)), visible.total);
		let selectedStart = visible.total;
		let bytes = 0;
		for (const row of candidates.toReversed()) {
			if (selectedStart < visible.total && bytes + row.serialized_bytes > maxBytes) break;
			selectedStart = row.logicalPosition;
			bytes += row.serialized_bytes;
		}
		return {
			activeLeafEntryId: projection.state.leafEventId,
			events: readVisibleMessageRange(projection, selectedStart, visible.total),
			totalMessages: visible.total
		};
	});
}
/** Reads one tail-relative message page with index range predicates, never OFFSET scanning. */
function readSessionTranscriptMessageEventPage(scope, options) {
	return withCurrentProjectionSnapshot(scope, (projection) => {
		const totalMessages = resolveVisibleMessagePositions(projection).total;
		const offset = Math.min(Math.max(0, Math.floor(Number.isFinite(options.offset) ? options.offset : 0)), totalMessages);
		const maxMessages = Math.max(0, Math.floor(Number.isFinite(options.maxMessages) ? options.maxMessages : 0));
		const endExclusive = Math.max(0, totalMessages - offset);
		const start = Math.max(0, endExclusive - maxMessages);
		return {
			activeLeafEntryId: projection.state.leafEventId,
			events: readVisibleMessageRange(projection, start, endExclusive),
			totalMessages
		};
	});
}
/** Reads a tail page whose materialized event payloads fit a hard byte budget. */
function readSessionTranscriptBoundedMessageTailPage(scope, options) {
	return withCurrentProjectionSnapshot(scope, (projection) => {
		const visible = resolveVisibleMessagePositions(projection);
		const snapshot = {
			generation: readTranscriptProjectionGeneration(projection),
			indexedSeq: projection.state.indexedSeq
		};
		const totalMessages = visible.total;
		const offset = Math.min(Math.max(0, Math.floor(Number.isFinite(options.offset) ? options.offset : 0)), totalMessages);
		const maxMessages = Math.min(MAX_VISIBLE_MESSAGE_MAX_MESSAGES, Math.max(0, Math.floor(Number.isFinite(options.maxMessages) ? options.maxMessages : 0)));
		const maxBytes = Math.max(0, Math.floor(Number.isFinite(options.maxBytes) ? options.maxBytes : 0));
		const endExclusive = Math.max(0, totalMessages - offset);
		const start = Math.max(0, endExclusive - maxMessages);
		const scannedMessages = endExclusive - start;
		if (scannedMessages === 0 || maxBytes === 0) return {
			activeLeafEntryId: projection.state.leafEventId,
			events: [],
			newestContiguousEventCount: 0,
			scannedMessages,
			serializedBytes: 0,
			snapshot,
			totalMessages
		};
		const db = getActiveTranscriptKysely(projection.database);
		const metadata = readVisibleMessageMetadata(projection, start, endExclusive).toReversed();
		if (metadata.length !== scannedMessages) throw new Error("Active transcript bounded message page is incomplete");
		const selectedPositions = [];
		let newestContiguousEventCount;
		let serializedBytes = 0;
		for (const row of metadata) {
			if (serializedBytes + row.serialized_bytes > maxBytes) {
				newestContiguousEventCount ??= selectedPositions.length;
				continue;
			}
			selectedPositions.push(row.message_position);
			serializedBytes += row.serialized_bytes;
		}
		const events = selectedPositions.length === 0 ? [] : executeSqliteQuerySync(projection.database.db, db.selectFrom("session_transcript_active_events as active").innerJoin("transcript_events as event", (join) => join.onRef("event.session_id", "=", "active.session_id").onRef("event.seq", "=", "active.event_seq")).select([
			"active.event_seq",
			"active.message_position",
			"event.event_json"
		]).where("active.session_id", "=", projection.resolved.sessionId).where("active.message_position", "in", selectedPositions).orderBy("active.message_position", "asc")).rows.map(parseActiveTranscriptMessageRow);
		return {
			activeLeafEntryId: projection.state.leafEventId,
			events,
			newestContiguousEventCount: newestContiguousEventCount ?? selectedPositions.length,
			scannedMessages,
			serializedBytes,
			snapshot,
			totalMessages
		};
	});
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-title-probes.ts
const SESSION_TITLE_PROBE_MESSAGES = 20;
function getTitleProbeKysely(database) {
	return getNodeSqliteKysely(database.db);
}
function parseEventType(eventJson) {
	if (!eventJson) return;
	try {
		const event = JSON.parse(eventJson);
		return typeof event.type === "string" ? event.type : void 0;
	} catch {
		return;
	}
}
function sqliteTranscriptBoundaryEventType() {
	return sql`json_extract(boundary_event.event_json, '$.type')`;
}
function readTitleProbeChunk(database, sessionIds) {
	const db = getTitleProbeKysely(database);
	const rows = runSqliteDeferredTransactionSync(database.db, () => executeSqliteQuerySync(database.db, db.selectFrom("session_windows as window").leftJoin("session_transcript_index_state as state", "state.session_id", "window.session_id").leftJoin("transcript_rewrite_watermarks as rewrite", "rewrite.session_id", "window.session_id").leftJoin("session_transcript_active_events as active", (join) => join.onRef("active.session_id", "=", "window.session_id").on("active.message_position", "is not", null).on((eb) => eb.or([eb("active.message_position", "<", SESSION_TITLE_PROBE_MESSAGES), eb("active.message_position", ">=", eb("state.active_message_count", "-", SESSION_TITLE_PROBE_MESSAGES))]))).leftJoin("transcript_events as event", (join) => join.onRef("event.session_id", "=", "active.session_id").onRef("event.seq", "=", "active.event_seq")).select((eb) => [
		"window.session_id",
		"state.active_message_count",
		"state.indexed_seq",
		"state.needs_rebuild",
		"rewrite.generation",
		"active.message_position",
		"event.event_json",
		eb.selectFrom("transcript_events as latest").select("latest.seq").whereRef("latest.session_id", "=", "window.session_id").orderBy("latest.seq", "desc").limit(1).as("latest_seq"),
		eb.selectFrom("session_transcript_active_events as boundary").innerJoin("transcript_events as boundary_event", (join) => join.onRef("boundary_event.session_id", "=", "boundary.session_id").onRef("boundary_event.seq", "=", "boundary.event_seq")).select("boundary_event.event_json").whereRef("boundary.session_id", "=", "window.session_id").where("boundary.message_position", "is", null).where(sqliteTranscriptBoundaryEventType(), "in", ["reset", "compaction"]).orderBy("boundary.active_position", "desc").limit(1).as("latest_boundary_json")
	]).where("window.session_id", "in", sessionIds).orderBy("window.session_id", "asc").orderBy("active.message_position", "asc")).rows, {
		databaseLabel: database.path,
		operationLabel: "sessions.list.title-probes"
	});
	const probes = /* @__PURE__ */ new Map();
	for (const row of rows) {
		const emptyTranscript = row.latest_seq === null;
		const projectionCurrent = row.needs_rebuild === 0 && row.indexed_seq === row.latest_seq;
		if (!emptyTranscript && !projectionCurrent || parseEventType(row.latest_boundary_json) === "reset") continue;
		const totalMessages = row.active_message_count ?? 0;
		const probe = probes.get(row.session_id) ?? {
			generation: row.generation ?? null,
			head: [],
			maxSeq: row.latest_seq ?? null,
			tail: [],
			totalMessages
		};
		if (row.event_json !== null && row.message_position !== null) {
			const event = {
				event: JSON.parse(row.event_json),
				seq: row.message_position + 1
			};
			if (row.message_position < SESSION_TITLE_PROBE_MESSAGES) probe.head.push(event);
			if (row.message_position >= totalMessages - SESSION_TITLE_PROBE_MESSAGES) probe.tail.push(event);
		}
		probes.set(row.session_id, probe);
	}
	return probes;
}
/** Reads bounded title probes in one statement per opened store (chunked for SQLite limits). */
function readSessionTranscriptTitleProbeBatch(scopes) {
	return readSqliteTranscriptStoreBatches(scopes, readTitleProbeChunk);
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-transcript-watermark.ts
/** Reads the append and rewrite tokens that validate transcript-derived caches. */
function readSessionTranscriptWatermark(scope) {
	const resolved = resolveSqliteTranscriptReadScope(scope);
	const result = withOpenClawAgentDatabaseReadOnly((database) => {
		const db = getNodeSqliteKysely(database.db);
		const maxSeq = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_events").select((eb) => eb.fn.max("seq").as("max_seq")).where("session_id", "=", resolved.sessionId))?.max_seq;
		return {
			generation: executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_rewrite_watermarks").select("generation").where("session_id", "=", resolved.sessionId))?.generation ?? null,
			maxSeq: maxSeq ?? null
		};
	}, toDatabaseOptions(resolved), { throwOnMissingTable: true });
	return result.found ? result.value : {
		generation: null,
		maxSeq: null
	};
}
function readSessionTranscriptWatermarkChunk(database, sessionIds) {
	const db = getNodeSqliteKysely(database.db);
	const rows = executeSqliteQuerySync(database.db, db.selectFrom("session_windows as window").leftJoin("transcript_rewrite_watermarks as rewrite", "rewrite.session_id", "window.session_id").select((eb) => [
		"window.session_id",
		"rewrite.generation",
		eb.selectFrom("transcript_events as event").select((inner) => inner.fn.max("event.seq").as("max_seq")).whereRef("event.session_id", "=", "window.session_id").as("max_seq")
	]).where("window.session_id", "in", sessionIds)).rows;
	return new Map(rows.map((row) => [row.session_id, {
		generation: row.generation ?? null,
		maxSeq: row.max_seq ?? null
	}]));
}
/** Reads cache-validation tokens in one statement per opened store and SQLite-sized chunk. */
function readSessionTranscriptWatermarkBatch(scopes) {
	return readSqliteTranscriptStoreBatches(scopes, readSessionTranscriptWatermarkChunk).map((result) => result ?? {
		generation: null,
		maxSeq: null
	});
}
//#endregion
export { resolveSessionTranscriptActiveLeafEntryId as $, resolveConcreteSessionStorePath as A, applySessionPatchProjections as At, buildUpdatedSessionGoalObjective as B, applySessionEntryCanonicalReplacements as Bt, withCurrentProjectionSnapshot as C, withTranscriptWriteTransaction as Ct, appendTranscriptMessages as D, forkSessionEntryFromParentTarget as Dt, readClosedTranscriptTurn as E, readActiveTranscriptEntryAnchor as Et, SessionGoalOperationError as F, inheritSessionSelection as Ft, createTranscriptRawDeltaCursor as G, listSessionPendingInputs as Gt, preflightSessionTranscriptForManualCompact as H, readSessionIdentityEvidenceBatch as Ht, lookupSessionGoalOperation as I, applySessionEntryLifecycleMutation as It, commitReplySessionInitialization as J, withSessionPendingInputPersistence as Jt, readTranscriptRawDelta as K, readSessionPendingInput as Kt, mutateSessionGoal as L, applySessionEntryReplacements as Lt, resolveSessionTranscriptReadTarget as M, cleanupPluginHostSessionStore as Mt, resolveSessionTranscriptRuntimeTarget as N, restoreSessionFromCompactionCheckpoint as Nt, persistSessionTranscriptTurn as O, resolveSessionParentForkDecision as Ot, sessionMatchesExpectedTranscriptTurn as P, SessionLabelOwnerIndex as Pt, listSessionBranches as Q, accountSessionGoalUsage as R, applySessionStoreProjection as Rt, readTranscriptProjectionGeneration as S, withTranscriptWriteLock as St, isSessionTranscriptProjectionUnavailableError as T, selectVisibleTranscriptEvents as Tt, trimSessionTranscriptForManualCompact as U, bindSessionPendingInputSources as Ut, buildUpdatedSessionGoalStatus as V, loadExactSessionEntryReadOnlyResult as Vt, rewriteTranscriptMessageAtAnchor as W, listSessionPendingInputReceipts as Wt, persistSessionResetLifecycle as X, loadReplySessionInitializationSnapshot as Y, forkSessionAtMessage as Z, normalizeVisibleMessageLimit as _, appendTranscriptMessage as _t, readRecentSessionTranscriptMessageEvents as a, loadCanonicalSessionRepairEntries as at, resolveVisibleMessagePositions as b, replaceTranscriptEventsSync as bt, readSessionTranscriptBoundedMessageTailPage as c, recordSessionParticipant as ct, readSessionTranscriptVisibleMessageDeltaCore as d, forkSessionFromParentTranscript as dt, rewindSessionToMessage as et, visitSessionTranscriptMessageEvents as f, markSessionAbortTarget as ft, MAX_VISIBLE_MESSAGE_MAX_MESSAGES as g, appendTranscriptEventSync as gt, MAX_VISIBLE_MESSAGE_MAX_BYTES as h, appendTranscriptEvent as ht, readRecentSessionTranscriptActiveEvents as i, listCanonicalSessionRepairFacts as it, resolveSessionTranscriptDatabasePath as j, branchSessionFromCompactionCheckpoint as jt, bindSessionTranscriptStoreScope as k, applySessionPatchProjection as kt, readSessionTranscriptMessageEventPage as l, recoverSessionEntryFromRestartTombstone as lt, DEFAULT_VISIBLE_MESSAGE_MAX_MESSAGES as m, updateSessionEntry as mt, readSessionTranscriptWatermarkBatch as n, iterateDoctorSessionKeyBatches as nt, readSessionTranscriptActivePathEntryRelation as o, scanDoctorSessionEntriesStrict as ot, DEFAULT_VISIBLE_MESSAGE_MAX_BYTES as p, resolveSessionAbortTarget as pt, SessionInitializationAgentScopeMismatchError as q, stageSessionPendingInput as qt, readSessionTranscriptTitleProbeBatch as r, rewriteDoctorSessionEntries as rt, readSessionTranscriptActiveStats as s, scanDoctorSessionEntriesTolerant as st, readSessionTranscriptWatermark as t, switchSessionBranch as tt, readSessionTranscriptMessageEvents as u, createSessionEntryWithTranscript as ut, readVisibleMessageMetadata as v, appendTranscriptMessageSync as vt, SessionTranscriptProjectionUnavailableError as w, selectVisibleTranscriptEventEntries as wt, getActiveTranscriptKysely as x, rewriteTranscriptEventRowsExact as xt, readVisibleMessageRange as y, replaceTranscriptEvents as yt, buildCreatedSessionGoal as z, purgeDeletedAgentSessionEntries as zt };
