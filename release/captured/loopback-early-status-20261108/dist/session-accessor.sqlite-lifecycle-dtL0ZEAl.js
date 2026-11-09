import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { i as getNodeSqliteKysely, n as executeSqliteQuerySync } from "./kysely-sync-DKYGT267.js";
import { D as tableExists } from "./openclaw-state-db-cache-AunrvrzG.js";
import { i as openOpenClawStateDatabase, s as runOpenClawStateWriteTransaction } from "./openclaw-state-db-Bh3Bq87y.js";
import { O as parseAgentSessionKey } from "./session-key-CRjxKW0X.js";
import { c as deferOpenClawAgentPostCommitPublication, g as openOpenClawAgentDatabase } from "./openclaw-agent-db-CUTe8BX6.js";
import { n as appendTranscriptEventsInTransaction, y as loadTranscriptEventsFromDatabase } from "./session-accessor.sqlite-transcript-store-DV0WFe1a.js";
import { n as withOpenClawAgentDatabaseReadOnly } from "./openclaw-agent-db-readonly-wb-jdztx.js";
import { C as deleteSessionDeliveryArtifacts, I as runSqliteSessionDeletionTransaction, J as sqliteLifecycleTargetSnapshotsEqual, L as withSqliteSessionDeletions, Y as sqliteSessionEntriesEqual, d as readLifecycleTargetSnapshot, r as deleteLifecycleTargetRows, t as assertLifecycleTargetUnchanged, y as writeSessionEntry } from "./session-accessor.sqlite-entry-store-VfW3gyuj.js";
import { i as getSessionKysely, l as resolveSqliteStoreScope, m as toDatabaseOptions, p as runExclusiveSqliteSessionWrite, s as resolveSqliteReadScope, t as cloneSessionEntry, u as resolveSqliteTranscriptArchiveDirectory } from "./session-accessor.sqlite-scope-BwPKGcgm.js";
import { d as emitSessionIdentityMutation, i as kickSessionHistoryDiskBudgetMaintenance, l as emitCommittedSessionEntryRemovals, s as refreshSqliteSessionPlannerStatisticsBestEffort, t as collectAdmissionProtectedSessionIds } from "./session-history-eviction-d5aiCsHS.js";
import { r as materializeSessionStateDeletePlans } from "./session-accessor.sqlite-archive-CuBPV-IT.js";
import { c as planSessionStateDeleteIfUnreferenced, d as readReferencedSessionIdsAfterTargetMutation, f as readSessionGenerationIdsForKeys, g as emitArchivedTranscriptUpdates, h as publishSessionStateArchives, i as deletePlannedLifecycleArtifactEntries, o as planSessionLifecycleArtifactCleanup, p as shouldRemoveSessionEntry, r as deleteMaterializedSessionStatePlans, s as planSessionStateAfterEntryRemoval, t as assertPlannedLifecycleArtifactEntriesUnchanged } from "./session-accessor.sqlite-lifecycle-state-CrB_K2kA.js";
import { u as selectSessionTranscriptLeafControlledPath } from "./transcript-tree-BH69pMSi.js";
import { a as isAgentHarnessSessionKey, c as isValidAgentHarnessSessionStoreEntry, d as resolveAgentHarnessSessionStoreEntryError, i as MODEL_SELECTION_LOCK_REMOVAL_MESSAGE } from "./agent-harness-session-key-CLRQddqz.js";
import { randomUUID } from "node:crypto";
//#region src/state/github-personal-publication-lifecycle.ts
/** Permanent session deletion owns all retained receipts, including pre-reset incarnations. */
function deletePersonalGitHubSessionReceipts(params) {
	const database = openOpenClawStateDatabase({ env: params.env });
	if (!tableExists(database.db, "github_personal_publication_requests") || params.sessionKeys.length === 0) return;
	runOpenClawStateWriteTransaction(({ db }) => {
		executeSqliteQuerySync(db, getNodeSqliteKysely(db).deleteFrom("github_personal_publication_requests").where("agent_id", "=", params.agentId).where("session_key", "in", params.sessionKeys));
	}, { database }, { operationLabel: "github-personal-publication.session-delete" });
}
//#endregion
//#region src/config/sessions/transcript-replay.ts
/** Tail kept so DM continuity survives silent session rotations. */
const DEFAULT_REPLAY_MAX_MESSAGES = 6;
function isValidReplayTimestamp(value) {
	if (typeof value === "number") return Number.isFinite(value);
	return typeof value === "string" && value.trim().length > 0;
}
function replayableTranscriptRole(record) {
	if (!record || record.type !== "message" || typeof record.id !== "string" || record.id.trim().length === 0 || !isValidReplayTimestamp(record.timestamp) || !(record.parentId === null || record.parentId === void 0 || typeof record.parentId === "string")) return;
	const role = record.message?.role;
	return role === "user" || role === "assistant" ? role : void 0;
}
function selectRecentUserAssistantReplayRecords(records, maxMessages = DEFAULT_REPLAY_MAX_MESSAGES) {
	const max = Math.max(0, maxMessages);
	if (max === 0) return [];
	const kept = [];
	for (const record of records) {
		const role = replayableTranscriptRole(record);
		if (role) kept.push({
			role,
			record
		});
	}
	return selectAlternatingReplayTail(kept, max).map((entry) => entry.record);
}
function selectAlternatingReplayTail(kept, max) {
	if (kept.length === 0) return [];
	let startIdx = Math.max(0, kept.length - max);
	while (startIdx < kept.length && kept[startIdx]?.role === "assistant") startIdx += 1;
	if (startIdx === kept.length) return [];
	return coalesceAlternatingReplayTail(kept.slice(startIdx));
}
function coalesceAlternatingReplayTail(entries) {
	const tail = [];
	for (const entry of entries) {
		const lastIdx = tail.length - 1;
		if (lastIdx >= 0 && tail[lastIdx]?.role === entry.role) {
			tail[lastIdx] = entry;
			continue;
		}
		tail.push(entry);
	}
	return tail;
}
//#endregion
//#region src/config/sessions/session-reset-boundary-event.ts
function recordId(record) {
	if (!record || typeof record !== "object" || Array.isArray(record)) return;
	const id = record.id;
	return typeof id === "string" && id.trim() ? id : void 0;
}
function uniqueBoundaryId(records) {
	const ids = new Set(records.flatMap((record) => recordId(record) ? [recordId(record)] : []));
	for (;;) {
		const id = randomUUID().slice(0, 8);
		if (!ids.has(id)) return id;
	}
}
function projectLatestBoundaryWindow(entries) {
	const boundaryIndex = entries.findLastIndex((entry) => {
		const type = entry && typeof entry === "object" && !Array.isArray(entry) ? entry.type : void 0;
		return type === "compaction" || type === "reset";
	});
	if (boundaryIndex < 0) return [...entries];
	const boundary = entries[boundaryIndex];
	const firstKeptIndex = typeof boundary.firstKeptEntryId === "string" ? entries.findIndex((entry, index) => index < boundaryIndex && recordId(entry) === boundary.firstKeptEntryId) : -1;
	return [...firstKeptIndex < 0 ? [] : entries.slice(firstKeptIndex, boundaryIndex).filter((entry) => {
		const role = entry?.message?.role;
		return role === "user" || role === "assistant";
	}), ...entries.slice(boundaryIndex + 1)];
}
function buildSessionResetBoundaryEvent(params) {
	const entries = params.events.filter((event) => event !== null && typeof event === "object" && !Array.isArray(event) && event.type !== "session");
	const activeEntries = selectSessionTranscriptLeafControlledPath(entries) ?? entries;
	const firstKeptEntryId = recordId((params.context === "preserve-tail" ? selectRecentUserAssistantReplayRecords(projectLatestBoundaryWindow(activeEntries)) : [])[0]);
	return {
		type: "reset",
		id: uniqueBoundaryId(params.events),
		parentId: recordId(activeEntries.at(-1)) ?? null,
		timestamp: (/* @__PURE__ */ new Date()).toISOString(),
		reason: params.reason,
		...firstKeptEntryId ? { firstKeptEntryId } : {}
	};
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-lifecycle.ts
async function withCommittedHistoryMaintenance({ agentId, storePath }, run) {
	let committed = false;
	try {
		return await run((database) => {
			deferOpenClawAgentPostCommitPublication(database, () => {
				committed = true;
			});
		});
	} finally {
		if (committed) kickSessionHistoryDiskBudgetMaintenance({
			agentId,
			storePath,
			force: true
		});
	}
}
function deleteSessionBoardRows(database, sessionKeys) {
	const keys = [...new Set(sessionKeys)];
	if (keys.length === 0) return;
	const db = getNodeSqliteKysely(database.db);
	const tableRows = executeSqliteQuerySync(database.db, db.selectFrom("sqlite_schema").select("name").where("type", "=", "table").where("name", "in", ["board_tabs", "board_widgets"])).rows;
	const tables = new Set(tableRows.map((row) => row.name));
	if (!tables.has("board_tabs") || !tables.has("board_widgets")) return;
	executeSqliteQuerySync(database.db, db.deleteFrom("board_widgets").where("session_key", "in", keys));
	executeSqliteQuerySync(database.db, db.deleteFrom("board_tabs").where("session_key", "in", keys));
}
async function cleanupSessionLifecycleArtifactsCore(params) {
	const sessionKeySegmentPrefix = params.sessionKeySegmentPrefix.trim();
	const transcriptContentMarker = params.transcriptContentMarker;
	const pluginOwnerId = params.pluginOwnerId?.trim();
	if (!sessionKeySegmentPrefix || !transcriptContentMarker) return {
		removedEntries: 0,
		archivedTranscriptArtifacts: 0
	};
	const resolved = resolveSqliteReadScope({
		...params.agentId ? { agentId: params.agentId } : {},
		storePath: params.storePath
	});
	const databaseOptions = toDatabaseOptions(resolved);
	if (!withOpenClawAgentDatabaseReadOnly(() => true, databaseOptions).found) return {
		removedEntries: 0,
		archivedTranscriptArtifacts: 0
	};
	const cleanupPlan = await runExclusiveSqliteSessionWrite(resolved, async () => {
		const database = openOpenClawAgentDatabase(databaseOptions);
		return planSessionLifecycleArtifactCleanup(database, {
			...params.agentId !== void 0 ? { agentId: resolved.agentId } : {},
			archiveRemovedEntryTranscripts: params.archiveRemovedEntryTranscripts !== false,
			archiveDirectory: resolveSqliteTranscriptArchiveDirectory(resolved),
			...pluginOwnerId ? { pluginOwnerId } : {},
			sessionKeySegmentPrefix,
			transcriptContentMarker,
			orphanTranscriptMinAgeMs: params.orphanTranscriptMinAgeMs,
			nowMs: params.nowMs ?? Date.now()
		});
	});
	const committed = await withSqliteSessionDeletions(resolved, cleanupPlan.entries.flatMap(({ expectedEntry: entry, sessionKey }) => entry ? [{
		entry,
		sessionKey
	}] : []), async (assertCurrent) => {
		const materializedPlans = await materializeSessionStateDeletePlans(cleanupPlan.deletePlans);
		return await runExclusiveSqliteSessionWrite(resolved, async () => {
			let removedEntries = 0;
			let archivedTranscripts = [];
			runSqliteSessionDeletionTransaction((transactionDb) => {
				assertCurrent();
				assertPlannedLifecycleArtifactEntriesUnchanged(transactionDb, cleanupPlan.entries);
				archivedTranscripts = deleteMaterializedSessionStatePlans(transactionDb, materializedPlans, void 0, new Set(cleanupPlan.entries.map((entry) => entry.sessionKey)));
				removedEntries = deletePlannedLifecycleArtifactEntries(transactionDb, cleanupPlan.entries);
			}, databaseOptions);
			emitCommittedSessionEntryRemovals(cleanupPlan.entries);
			return {
				removedEntries,
				archivedTranscripts
			};
		});
	});
	const deletedEntries = Math.max(committed.removedEntries, new Set(cleanupPlan.deletePlans.map((plan) => plan.sessionId)).size);
	await refreshSqliteSessionPlannerStatisticsBestEffort(resolved, deletedEntries);
	const archivedTranscripts = await publishSessionStateArchives(resolved, committed.archivedTranscripts);
	return {
		removedEntries: committed.removedEntries,
		archivedTranscriptArtifacts: archivedTranscripts.length
	};
}
/** Resets one persisted session entry using SQLite session rows. */
async function resetSessionEntryLifecycle(params) {
	const agentId = params.agentId ?? parseAgentSessionKey(params.target.canonicalKey)?.agentId;
	const resolved = resolveSqliteStoreScope(params.storePath, { agentId });
	return await withCommittedHistoryMaintenance({
		agentId: resolved.agentId,
		storePath: params.storePath
	}, async (recordCommit) => runExclusiveSqliteSessionWrite(resolved, async () => {
		const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
		const targetSnapshot = readLifecycleTargetSnapshot(database, params.target);
		const current = targetSnapshot[0];
		const nextEntry = await params.buildNextEntry({
			currentEntry: current ? cloneSessionEntry(current.entry) : void 0,
			primaryKey: params.target.canonicalKey
		});
		const shouldAppendResetBoundary = params.resetBoundary && current?.entry.sessionId && !sqliteSessionEntriesEqual(current.entry, nextEntry);
		const mutation = {
			nextEntry: cloneSessionEntry(nextEntry),
			...current ? { previousEntry: cloneSessionEntry(current.entry) } : {},
			...current?.entry.sessionId ? { previousSessionId: current.entry.sessionId } : {}
		};
		runSqliteSessionDeletionTransaction((transactionDb) => {
			assertLifecycleTargetUnchanged(transactionDb, params.target, current?.entry, "reset");
			if (shouldAppendResetBoundary && current?.entry.sessionId && params.resetBoundary) {
				const event = buildSessionResetBoundaryEvent({
					events: loadTranscriptEventsFromDatabase(transactionDb, current.entry.sessionId, { projection: "reset-boundary" }),
					...params.resetBoundary
				});
				if (appendTranscriptEventsInTransaction(transactionDb, {
					...resolved,
					sessionId: current.entry.sessionId,
					sessionKey: current.sessionKey
				}, [event]) !== 1) throw new Error(`Failed to append reset boundary for ${current.sessionKey}`);
			}
			writeSessionEntry(transactionDb, params.target.canonicalKey, nextEntry, { previousEntry: current?.entry ?? null });
			recordCommit(transactionDb);
		}, toDatabaseOptions(resolved));
		if (current) emitSessionIdentityMutation({
			kind: "reset",
			previous: {
				...current.entry.sessionId ? { sessionId: current.entry.sessionId } : {},
				sessionKeys: targetSnapshot.map((row) => row.sessionKey)
			},
			current: {
				...nextEntry.sessionId ? { sessionId: nextEntry.sessionId } : {},
				sessionKeys: [params.target.canonicalKey]
			}
		});
		else emitSessionIdentityMutation({
			kind: "create",
			previous: { sessionKeys: [] },
			current: {
				...nextEntry.sessionId ? { sessionId: nextEntry.sessionId } : {},
				sessionKeys: [params.target.canonicalKey]
			}
		});
		await params.afterEntryMutation?.(mutation);
		return {
			...mutation,
			archivedTranscripts: []
		};
	}));
}
async function deleteSqliteSessionEntryLifecycleInternal(params, allowLockedEntryRemoval, expectedPluginOwnerId) {
	const agentId = params.agentId ?? parseAgentSessionKey(params.target.canonicalKey)?.agentId;
	const resolved = resolveSqliteStoreScope(params.storePath, { agentId });
	return await withCommittedHistoryMaintenance(params, async (recordCommit) => deleteSqliteSessionEntryLifecycleLocked(resolved, params, allowLockedEntryRemoval, expectedPluginOwnerId, recordCommit));
}
const DELETE_EXPECTED_ENTRY_MISMATCH = Symbol("delete-expected-entry-mismatch");
async function deleteSqliteSessionEntryLifecycleLocked(resolved, params, allowLockedEntryRemoval, expectedPluginOwnerId, recordCommit) {
	const prepared = await runExclusiveSqliteSessionWrite(resolved, async () => {
		params.commitGuard?.();
		const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
		const targetSnapshot = readLifecycleTargetSnapshot(database, params.target);
		const current = targetSnapshot[0];
		if (!current) return null;
		if (!shouldDeleteSqliteSessionEntryLifecycle(database, current.entry, params)) return DELETE_EXPECTED_ENTRY_MISMATCH;
		if (current.entry.modelSelectionLocked === true && !allowLockedEntryRemoval) throw new Error(MODEL_SELECTION_LOCK_REMOVAL_MESSAGE);
		if (expectedPluginOwnerId && targetSnapshot.some(({ entry, sessionKey }) => isAgentHarnessSessionKey(sessionKey) || entry.agentHarnessId !== void 0 || entry.modelSelectionLocked !== true || normalizeOptionalString(entry.pluginOwnerId) !== expectedPluginOwnerId)) throw new Error(MODEL_SELECTION_LOCK_REMOVAL_MESSAGE);
		const deleteTranscriptState = params.archiveTranscript || params.deleteTranscriptWithoutArchive === true;
		// session-delete-admission-exact-read-v1: both full reads below only guard transcript-state removal.
		const referencedAfterDelete = deleteTranscriptState ? readReferencedSessionIdsAfterTargetMutation(database, params.target) : /* @__PURE__ */ new Set();
		const archiveDirectory = resolveSqliteTranscriptArchiveDirectory(resolved);
		const entryPlans = deleteTranscriptState ? targetSnapshot.flatMap(({ entry }) => planSessionStateAfterEntryRemoval({
			archiveDirectory,
			archiveTranscript: params.archiveTranscript,
			database,
			entry,
			reason: "deleted",
			referencedSessionIds: referencedAfterDelete
		})) : [];
		const entryPlanIds = new Set(entryPlans.map((plan) => plan.sessionId));
		const historicalGenerationIds = deleteTranscriptState ? readSessionGenerationIdsForKeys(database, [
			params.target.canonicalKey,
			...params.target.storeKeys,
			...targetSnapshot.map((row) => row.sessionKey)
		]).filter((sessionId) => !entryPlanIds.has(sessionId)) : [];
		const preflightFence = historicalGenerationIds.length > 0 ? collectAdmissionProtectedSessionIds({
			database,
			storePath: params.storePath
		}) : /* @__PURE__ */ new Set();
		for (const sessionId of historicalGenerationIds) if (preflightFence.has(sessionId) && !referencedAfterDelete.has(sessionId)) throw new Error(`cannot delete session history while work is in flight for ${sessionId}; retry after the run completes`);
		return {
			archiveDirectory,
			current,
			entryPlans,
			historicalGenerationIds,
			targetSnapshot
		};
	});
	if (!prepared) {
		await publishSessionStateArchives(resolved, []);
		return {
			archivedTranscripts: [],
			deleted: false
		};
	}
	if (prepared === DELETE_EXPECTED_ENTRY_MISMATCH) {
		await publishSessionStateArchives(resolved, []);
		return expectedEntryMismatchResult([]);
	}
	return await withSqliteSessionDeletions(resolved, prepared.targetSnapshot, async (assertCurrent) => {
		const historicalArchivedTranscripts = [];
		for (const sessionId of prepared.historicalGenerationIds) {
			const plan = await runExclusiveSqliteSessionWrite(resolved, async () => {
				params.commitGuard?.();
				const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
				const targetSnapshot = readLifecycleTargetSnapshot(database, params.target);
				if (!sqliteLifecycleTargetSnapshotsEqual(prepared.targetSnapshot, targetSnapshot) || !shouldDeleteSqliteSessionEntryLifecycle(database, targetSnapshot[0]?.entry, params)) return DELETE_EXPECTED_ENTRY_MISMATCH;
				const referencedAfterDelete = readReferencedSessionIdsAfterTargetMutation(database, params.target);
				if (referencedAfterDelete.has(sessionId)) return null;
				if (collectAdmissionProtectedSessionIds({
					database,
					storePath: params.storePath
				}).has(sessionId)) throw new Error(`cannot delete session history while work is in flight for ${sessionId}; retry after the run completes`);
				return planSessionStateDeleteIfUnreferenced({
					archiveDirectory: prepared.archiveDirectory,
					archiveTranscript: params.archiveTranscript,
					database,
					reason: "deleted",
					referencedSessionIds: referencedAfterDelete,
					sessionId
				});
			});
			if (plan === DELETE_EXPECTED_ENTRY_MISMATCH) return expectedEntryMismatchResult(historicalArchivedTranscripts);
			if (!plan) continue;
			const materializedGeneration = await materializeSessionStateDeletePlans([plan]);
			const archivedGeneration = await runExclusiveSqliteSessionWrite(resolved, async () => {
				params.commitGuard?.();
				return runSqliteSessionDeletionTransaction((transactionDb) => {
					assertCurrent();
					const targetSnapshot = readLifecycleTargetSnapshot(transactionDb, params.target);
					if (!sqliteLifecycleTargetSnapshotsEqual(prepared.targetSnapshot, targetSnapshot) || !shouldDeleteSqliteSessionEntryLifecycle(transactionDb, targetSnapshot[0]?.entry, params)) return DELETE_EXPECTED_ENTRY_MISMATCH;
					if (collectAdmissionProtectedSessionIds({
						database: transactionDb,
						storePath: params.storePath
					}).has(sessionId)) throw new Error(`cannot delete session history while work is in flight for ${sessionId}; retry after the run completes`);
					return deleteMaterializedSessionStatePlans(transactionDb, materializedGeneration, void 0, void 0, () => recordCommit(transactionDb));
				}, toDatabaseOptions(resolved));
			});
			if (archivedGeneration === DELETE_EXPECTED_ENTRY_MISMATCH) return expectedEntryMismatchResult(historicalArchivedTranscripts);
			const publishedGeneration = await publishSessionStateArchives(resolved, archivedGeneration);
			emitArchivedTranscriptUpdates(publishedGeneration);
			historicalArchivedTranscripts.push(...publishedGeneration);
		}
		const materializedPlans = await materializeSessionStateDeletePlans(prepared.entryPlans);
		const result = await runExclusiveSqliteSessionWrite(resolved, async () => {
			params.commitGuard?.();
			return runSqliteSessionDeletionTransaction((transactionDb) => {
				assertCurrent();
				const transactionSnapshot = readLifecycleTargetSnapshot(transactionDb, params.target);
				const transactionEntry = transactionSnapshot[0]?.entry;
				if (!sqliteLifecycleTargetSnapshotsEqual(prepared.targetSnapshot, transactionSnapshot) || !shouldDeleteSqliteSessionEntryLifecycle(transactionDb, transactionEntry, params)) return expectedEntryMismatchResult([]);
				const archivedTranscripts = deleteMaterializedSessionStatePlans(transactionDb, materializedPlans, void 0, /* @__PURE__ */ new Set([
					params.target.canonicalKey,
					...params.target.storeKeys,
					...transactionSnapshot.map((row) => row.sessionKey)
				]));
				deleteLifecycleTargetRows(transactionDb, params.target);
				recordCommit(transactionDb);
				if (params.deleteDeliveryArtifacts === true) deleteSessionDeliveryArtifacts(transactionDb, params.target.canonicalKey, [...params.target.storeKeys, ...transactionSnapshot.map((row) => row.sessionKey)]);
				deleteSessionBoardRows(transactionDb, [
					params.target.canonicalKey,
					...params.target.storeKeys,
					...transactionSnapshot.map((row) => row.sessionKey)
				]);
				return {
					archivedTranscripts,
					deleted: true,
					deletedEntry: cloneSessionEntry(prepared.current.entry),
					...prepared.current.entry.sessionId ? { deletedSessionId: prepared.current.entry.sessionId } : {}
				};
			}, toDatabaseOptions(resolved));
		});
		if (result.deleted) {
			deletePersonalGitHubSessionReceipts({
				agentId: resolved.agentId,
				env: resolved.env,
				sessionKeys: [
					params.target.canonicalKey,
					...params.target.storeKeys,
					...prepared.targetSnapshot.map((row) => row.sessionKey)
				]
			});
			emitSessionIdentityMutation({
				kind: "delete",
				previous: {
					...prepared.current.entry.sessionId ? { sessionId: prepared.current.entry.sessionId } : {},
					sessionKeys: prepared.targetSnapshot.map((row) => row.sessionKey)
				}
			});
		}
		result.archivedTranscripts = await publishSessionStateArchives(resolved, result.archivedTranscripts);
		emitArchivedTranscriptUpdates(result.archivedTranscripts);
		result.archivedTranscripts.push(...historicalArchivedTranscripts);
		return result;
	});
}
function expectedEntryMismatchResult(archivedTranscripts) {
	return {
		archivedTranscripts,
		deleted: false,
		expectedEntryMismatch: true
	};
}
/** Deletes one persisted session entry using SQLite session rows. */
async function deleteSessionEntryLifecycle(params) {
	return await deleteSqliteSessionEntryLifecycleInternal(params, false);
}
/** Rolls back one exact locked row created by failed trusted harness initialization. */
async function rollbackAgentHarnessSessionEntryLifecycle(params) {
	const hasExactTarget = params.target.storeKeys.length === 1 && params.target.storeKeys[0] === params.target.canonicalKey;
	const expectedEntryError = resolveAgentHarnessSessionStoreEntryError(params.target.canonicalKey, params.expectedEntry);
	if (!hasExactTarget || expectedEntryError || !isValidAgentHarnessSessionStoreEntry(params.target.canonicalKey, params.expectedEntry)) throw new Error(expectedEntryError ?? "Model-selection-locked sessions cannot be removed, unlocked, or reassigned.");
	return await deleteSqliteSessionEntryLifecycleInternal(params, true);
}
/** Rolls back one exact locked CLI row created by a failed plugin initializer. */
async function rollbackPluginOwnedSessionEntryLifecycle(params) {
	const expectedEntry = params.expectedEntry;
	const validPluginOwner = normalizeOptionalString(expectedEntry.pluginOwnerId);
	const expectedPluginOwner = normalizeOptionalString(params.expectedPluginOwnerId);
	if (isAgentHarnessSessionKey(params.target.canonicalKey) || expectedEntry.agentHarnessId !== void 0 || expectedEntry.modelSelectionLocked !== true || !validPluginOwner || validPluginOwner !== expectedPluginOwner) throw new Error(MODEL_SELECTION_LOCK_REMOVAL_MESSAGE);
	return await deleteSqliteSessionEntryLifecycleInternal(params, true, expectedPluginOwner);
}
function shouldDeleteSqliteSessionEntryLifecycle(database, entry, params) {
	params.commitGuard?.();
	if (!shouldRemoveSessionEntry(entry, params)) return false;
	if (params.expectedTranscript) {
		const expectedTranscript = params.expectedTranscript;
		const rows = executeSqliteQuerySync(database.db, getSessionKysely(database.db).selectFrom("transcript_events").select("event_json").where("session_id", "=", expectedTranscript.sessionId).orderBy("seq", "asc")).rows;
		if (entry.sessionId !== expectedTranscript.sessionId || rows.length !== expectedTranscript.eventJson.length || rows.some((row, index) => row.event_json !== expectedTranscript.eventJson[index])) return false;
	}
	return true;
}
//#endregion
export { rollbackPluginOwnedSessionEntryLifecycle as a, rollbackAgentHarnessSessionEntryLifecycle as i, deleteSessionEntryLifecycle as n, buildSessionResetBoundaryEvent as o, resetSessionEntryLifecycle as r, cleanupSessionLifecycleArtifactsCore as t };
