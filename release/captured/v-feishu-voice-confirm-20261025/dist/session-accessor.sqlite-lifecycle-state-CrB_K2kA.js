import { y as uniqueStrings } from "./string-normalization-DiSb4JeN.js";
import { a as iterateSqliteQuerySync, n as executeSqliteQuerySync, r as executeSqliteQueryTakeFirstSync } from "./kysely-sync-DKYGT267.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { O as parseAgentSessionKey } from "./session-key-CRjxKW0X.js";
import { h as ensureSessionTranscriptArchiveSchema } from "./openclaw-agent-db-maintenance-DYSkzMMg.js";
import { f as isIncognitoOpenClawAgentDatabase, g as openOpenClawAgentDatabase, y as runOpenClawAgentWriteTransaction } from "./openclaw-agent-db-CUTe8BX6.js";
import { Y as sqliteSessionEntriesEqual, c as readExactSessionEntryJson, h as readSessionEntryStore, i as deleteSessionEntryRows, l as readExactSessionEntryRow, x as collectSessionStateIdsForEntry } from "./session-accessor.sqlite-entry-store-VfW3gyuj.js";
import { f as resolveSqliteTranscriptScope, i as getSessionKysely, m as toDatabaseOptions, p as runExclusiveSqliteSessionWrite, t as cloneSessionEntry, u as resolveSqliteTranscriptArchiveDirectory } from "./session-accessor.sqlite-scope-BwPKGcgm.js";
import { A as sessionEntryMetadataJson, E as parseSessionEntryJson, v as coerceSqliteNumber } from "./session-accessor.sqlite-transcript-state-Cz9g7S9v.js";
import { n as sqliteSessionStateDeleteSnapshotsEqual, t as readSessionStateDeleteSnapshot } from "./session-accessor.sqlite-delete-snapshot-D_8sMB0n.js";
import { a as resolveRegisteredSqliteTranscriptArchiveName, s as runSqliteTranscriptArchivePublishWorker } from "./session-accessor.sqlite-archive-CuBPV-IT.js";
import { n as emitSessionTranscriptUpdate } from "./transcript-events-BMaG3A_w.js";
import { a as deleteSessionTranscriptIndexInTransaction } from "./session-transcript-index-9itOio9h.js";
import fs from "node:fs";
import path from "node:path";
//#region src/config/sessions/session-accessor.sqlite-events.ts
function emitArchivedTranscriptUpdates(archivedTranscripts) {
	for (const archived of archivedTranscripts) emitSessionTranscriptUpdate({ sessionFile: archived.archivedPath });
}
async function publishTranscriptUpdate(scope, update = {}) {
	const resolved = resolveSqliteTranscriptScope(scope);
	emitSessionTranscriptUpdate({
		...update,
		agentId: resolved.agentId,
		sessionKey: resolved.sessionKey,
		sessionId: resolved.sessionId,
		target: {
			agentId: resolved.agentId,
			sessionId: resolved.sessionId,
			sessionKey: resolved.sessionKey,
			storePath: resolved.path
		}
	});
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-archive-store.ts
/** Inserts the canonical archive row inside the lifecycle deletion transaction. */
function persistSessionTranscriptArchive(database, plan) {
	const archive = plan.archive;
	const generation = plan.snapshot.generation;
	const sessionKey = plan.snapshot.sessionKey;
	if (!archive || !generation || !sessionKey) throw new Error(`Cannot persist SQLite transcript archive without an owner generation for ${plan.sessionId}`);
	ensureSessionTranscriptArchiveSchema(database.db);
	const db = getSessionKysely(database.db);
	executeSqliteQuerySync(database.db, db.insertInto("session_transcript_archives").values({
		archive_blob: archive.bytes,
		archive_name: archive.archiveName,
		archive_sha256: archive.sha256,
		created_at: archive.createdAt,
		encoding: archive.encoding,
		generation,
		last_publish_attempt_at: null,
		last_publish_error: null,
		published_at: null,
		reason: plan.reason,
		session_id: plan.sessionId,
		session_key: sessionKey
	}).onConflict((conflict) => conflict.columns(["session_id", "generation"]).doNothing()));
	const persisted = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_transcript_archives").select([
		"archive_blob",
		"archive_name",
		"archive_sha256",
		"created_at",
		"encoding",
		"reason",
		"session_key"
	]).where("session_id", "=", plan.sessionId).where("generation", "=", generation));
	if (!persisted || persisted.archive_name !== archive.archiveName || persisted.archive_sha256 !== archive.sha256 || persisted.created_at !== archive.createdAt || persisted.encoding !== archive.encoding || persisted.reason !== plan.reason || persisted.session_key !== sessionKey || !Buffer.from(persisted.archive_blob).equals(Buffer.from(archive.bytes))) throw new Error(`Conflicting SQLite transcript archive for ${plan.sessionId}`);
}
const PENDING_ARCHIVE_PUBLISH_BATCH_SIZE = 4;
function transcriptArchiveIdentityKey(sessionId, generation) {
	return `${sessionId}\u0000${generation}`;
}
function uniqueTranscriptArchives(archives) {
	return [...new Map(archives.map((archive) => [transcriptArchiveIdentityKey(archive.sessionId, archive.generation), archive])).values()];
}
/** Publishes derived archive files after their canonical rows and deletions commit. */
async function publishSessionStateArchives(scope, requested) {
	const requestedArchives = uniqueTranscriptArchives(requested);
	const requestedIdentitySet = new Set(requestedArchives.map((archive) => transcriptArchiveIdentityKey(archive.sessionId, archive.generation)));
	let includeRequested = true;
	while (true) {
		const plans = await runExclusiveSqliteSessionWrite(scope, async () => {
			const database = openOpenClawAgentDatabase(toDatabaseOptions(scope));
			const db = getSessionKysely(database.db);
			if (includeRequested && requestedArchives.length > 0) ensureSessionTranscriptArchiveSchema(database.db);
			else if (!executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("sqlite_schema").select("name").where("type", "=", "table").where("name", "=", "session_transcript_archives"))) return [];
			const pendingArchives = executeSqliteQuerySync(database.db, db.selectFrom("session_transcript_archives").select([
				"archive_name",
				"created_at",
				"encoding",
				"generation",
				"reason",
				"session_id"
			]).where("published_at", "is", null).orderBy("created_at", "asc").orderBy("session_id", "asc").orderBy("generation", "asc").limit(PENDING_ARCHIVE_PUBLISH_BATCH_SIZE)).rows;
			for (const archive of pendingArchives) {
				if (archive.encoding !== "identity" && archive.encoding !== "zstd" || archive.reason !== "deleted" && archive.reason !== "reset") throw new Error(`Invalid pending SQLite transcript archive for ${archive.session_id}`);
				const archiveName = resolveRegisteredSqliteTranscriptArchiveName({
					createdAt: archive.created_at,
					encoding: archive.encoding,
					generation: archive.generation,
					reason: archive.reason,
					sessionId: archive.session_id
				});
				if (archiveName === archive.archive_name) continue;
				executeSqliteQuerySync(database.db, db.updateTable("session_transcript_archives").set({ archive_name: archiveName }).where("session_id", "=", archive.session_id).where("generation", "=", archive.generation).where("published_at", "is", null));
			}
			const archives = uniqueTranscriptArchives([...includeRequested ? requestedArchives : [], ...pendingArchives.map((archive) => ({
				generation: archive.generation,
				sessionId: archive.session_id
			}))]);
			const archiveDirectory = resolveSqliteTranscriptArchiveDirectory(scope);
			return archives.map((archive) => ({
				agentId: database.agentId,
				archiveDirectory,
				databasePath: database.path,
				generation: archive.generation,
				sessionId: archive.sessionId
			}));
		});
		includeRequested = false;
		if (plans.length === 0) break;
		const results = await runSqliteTranscriptArchivePublishWorker(plans);
		await runExclusiveSqliteSessionWrite(scope, async () => {
			const now = Date.now();
			runOpenClawAgentWriteTransaction((transactionDb) => {
				ensureSessionTranscriptArchiveSchema(transactionDb.db);
				const db = getSessionKysely(transactionDb.db);
				for (const result of results) executeSqliteQuerySync(transactionDb.db, db.updateTable("session_transcript_archives").set((eb) => ({
					last_publish_attempt_at: now,
					last_publish_error: result.error?.slice(0, 1024) ?? null,
					publish_attempts: eb("publish_attempts", "+", 1),
					...result.archivedPath ? { published_at: now } : {}
				})).where("session_id", "=", result.sessionId).where("generation", "=", result.generation));
			}, toDatabaseOptions(scope));
		});
		const planByIdentity = new Map(plans.map((plan) => [transcriptArchiveIdentityKey(plan.sessionId, plan.generation), plan]));
		emitArchivedTranscriptUpdates(results.flatMap((result) => {
			const identity = transcriptArchiveIdentityKey(result.sessionId, result.generation);
			if (!result.archivedPath || requestedIdentitySet.has(identity)) return [];
			const plan = planByIdentity.get(identity);
			return plan ? [{
				archivedPath: result.archivedPath,
				generation: result.generation,
				sessionId: result.sessionId,
				sourcePath: path.join(plan.archiveDirectory, `${result.sessionId}.jsonl`)
			}] : [];
		}));
		const failedIds = results.flatMap((result) => result.archivedPath ? [] : [result.sessionId]);
		if (failedIds.length > 0) throw new Error(`Session deletion committed, but ${failedIds.length} transcript archive file export(s) remain pending in SQLite; retry the operation to publish them.`);
	}
	return [...requested];
}
const ARCHIVE_RETENTION_BATCH_SIZE = 256;
const ARCHIVE_RETENTION_IDLE_RECHECK_MS = 36e5;
const archiveRetentionIdleUntil = /* @__PURE__ */ new Map();
/** Removes canonical rows only after retention has removed their derived files. */
async function prunePublishedSessionArchivesByRetention(params) {
	const rules = new Map(params.rules.filter((rule) => Number.isFinite(rule.olderThanMs) && rule.olderThanMs >= 0).map((rule) => [rule.reason, rule.olderThanMs]));
	if (rules.size === 0) return 0;
	// v-archive-retention-cutoff-v1: a row younger than the shortest retention can never be removable, so bound
	// the scan by created_at. Reading published_at/archive_name walks each row's archive_blob
	// overflow chain; unbounded, every lifecycle mutation re-read the oldest 256 archives.
	const now = params.nowMs ?? Date.now();
	const retentionCutoff = now - Math.min(...rules.values());
	if (now < (archiveRetentionIdleUntil.get(resolveSqliteTranscriptArchiveDirectory(params.scope)) ?? 0)) return 0;
	const candidates = await runExclusiveSqliteSessionWrite(params.scope, async () => {
		const database = openOpenClawAgentDatabase(toDatabaseOptions(params.scope));
		const db = getSessionKysely(database.db);
		if (!executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("sqlite_schema").select("name").where("type", "=", "table").where("name", "=", "session_transcript_archives"))) return [];
		return executeSqliteQuerySync(database.db, db.selectFrom("session_transcript_archives").select([
			"archive_name",
			"created_at",
			"generation",
			"published_at",
			"reason",
			"session_id"
		]).where("published_at", "is not", null).where("created_at", "<", retentionCutoff).orderBy("created_at", "asc").orderBy("session_id", "asc").orderBy("generation", "asc").limit(ARCHIVE_RETENTION_BATCH_SIZE)).rows;
	});
	const archiveDirectory = resolveSqliteTranscriptArchiveDirectory(params.scope);
	const removable = candidates.filter((row) => {
		const olderThanMs = rules.get(row.reason);
		if (olderThanMs === void 0 || now - row.created_at <= olderThanMs) return false;
		const archivePath = path.resolve(archiveDirectory, row.archive_name);
		return path.dirname(archivePath) === path.resolve(archiveDirectory) && path.basename(archivePath) === row.archive_name && !fs.existsSync(archivePath);
	});
	// v-archive-retention-cutoff-v1: aged rows whose files still exist stay unremovable until file retention
	// runs (never, while session maintenance is in warn mode). Re-reading them on every lifecycle
	// mutation costs the same blob walk, so an empty pass waits an hour before scanning again.
	if (removable.length === 0) {
		if (candidates.length > 0) archiveRetentionIdleUntil.set(archiveDirectory, now + ARCHIVE_RETENTION_IDLE_RECHECK_MS);
		return 0;
	}
	archiveRetentionIdleUntil.delete(archiveDirectory);
	return await runExclusiveSqliteSessionWrite(params.scope, async () => {
		let removed = 0;
		runOpenClawAgentWriteTransaction((transactionDb) => {
			const db = getSessionKysely(transactionDb.db);
			for (const row of removable) {
				const result = executeSqliteQuerySync(transactionDb.db, db.deleteFrom("session_transcript_archives").where("session_id", "=", row.session_id).where("generation", "=", row.generation).where("archive_name", "=", row.archive_name).where("created_at", "=", row.created_at).where("published_at", "=", row.published_at));
				removed += Number(result.numAffectedRows ?? 0n);
			}
		}, toDatabaseOptions(params.scope));
		return removed;
	});
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-lifecycle-state.ts
function shouldRemoveSessionEntry(entry, removal) {
	if (!entry) return false;
	if (removal.expectedEntry !== void 0 && !sqliteSessionEntriesEqual(entry, removal.expectedEntry)) return false;
	if (removal.expectedSessionId !== void 0 && (removal.expectedSessionId === null ? entry.sessionId !== void 0 : entry.sessionId !== removal.expectedSessionId)) return false;
	if (removal.expectedLifecycleRevision !== void 0 && entry.lifecycleRevision !== removal.expectedLifecycleRevision) return false;
	if (removal.expectedUpdatedAt !== void 0 && entry.updatedAt !== removal.expectedUpdatedAt) return false;
	return true;
}
function sessionKeySegmentStartsWith(sessionKey, prefix) {
	const firstSeparator = sessionKey.indexOf(":");
	if (firstSeparator < 0) return sessionKey.startsWith(prefix);
	const secondSeparator = sessionKey.indexOf(":", firstSeparator + 1);
	return (secondSeparator < 0 ? sessionKey : sessionKey.slice(secondSeparator + 1)).startsWith(prefix);
}
function sessionKeyBelongsToAgent(sessionKey, agentId) {
	if (agentId === void 0) return true;
	const parsed = parseAgentSessionKey(sessionKey);
	return parsed !== null && normalizeAgentId(parsed.agentId) === normalizeAgentId(agentId);
}
function readSessionTranscriptUpdatedAt(database, sessionId) {
	const db = getSessionKysely(database.db);
	const row = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_events").select((eb) => eb.fn.max("created_at").as("updated_at")).where("session_id", "=", sessionId));
	if (row?.updated_at === null || row?.updated_at === void 0) return;
	return coerceSqliteNumber(row.updated_at);
}
function sqliteTranscriptStateIsReclaimable(params) {
	const transcriptUpdatedAt = readSessionTranscriptUpdatedAt(params.database, params.sessionId);
	const updatedAt = params.sessionUpdatedAt === void 0 ? transcriptUpdatedAt : Math.max(params.sessionUpdatedAt, transcriptUpdatedAt ?? params.sessionUpdatedAt);
	return updatedAt === void 0 || params.nowMs - updatedAt >= params.orphanTranscriptMinAgeMs;
}
function sqliteTranscriptStateHasMarker(params) {
	const db = getSessionKysely(params.database.db);
	return executeSqliteQuerySync(params.database.db, db.selectFrom("transcript_events").select("event_json").where("session_id", "=", params.sessionId).orderBy("seq", "asc")).rows.some((row) => row.event_json.includes(params.transcriptContentMarker));
}
/** Session ids protected by live node state. */
function readReferencedSessionIds(database, excludedSessionKeys = /* @__PURE__ */ new Set()) {
	const db = getSessionKysely(database.db);
	const rows = iterateSqliteQuerySync(database.db, db.selectFrom("session_nodes").select([
		sessionEntryMetadataJson,
		"current_session_id",
		"session_key"
	]));
	const sessionIds = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (excludedSessionKeys.has(row.session_key)) continue;
		sessionIds.add(row.current_session_id);
		const entry = parseSessionEntryJson(row);
		if (!entry) continue;
		for (const sessionId of collectSessionStateIdsForEntry(entry)) sessionIds.add(sessionId);
	}
	return sessionIds;
}
function readReferencedSessionIdsAfterTargetMutation(database, target, nextEntry) {
	const sessionIds = readReferencedSessionIds(database, new Set(uniqueStrings([target.canonicalKey, ...target.storeKeys].map((key) => key.trim()))));
	if (nextEntry) for (const sessionId of collectSessionStateIdsForEntry(nextEntry)) sessionIds.add(sessionId);
	return sessionIds;
}
function planSessionStateDeleteIfUnreferenced(params) {
	if (params.referencedSessionIds.has(params.sessionId)) return null;
	return {
		agentId: params.database.agentId,
		archiveDirectory: params.archiveDirectory,
		archiveTranscript: params.archiveTranscript !== false && !isIncognitoOpenClawAgentDatabase(params.database),
		databasePath: params.database.path,
		reason: params.reason ?? "deleted",
		sessionId: params.sessionId,
		snapshot: readSessionStateDeleteSnapshot(params.database.db, params.sessionId)
	};
}
function deleteMaterializedSessionStatePlans(database, plans, protectedSessionIds, excludedSessionKeys, onDeleted) {
	if (plans.length === 0) return [];
	const archivedTranscripts = [];
	const referencedSessionIds = readReferencedSessionIds(database, excludedSessionKeys);
	for (const sessionId of protectedSessionIds ?? []) referencedSessionIds.add(sessionId);
	for (const plan of plans) {
		if (referencedSessionIds.has(plan.sessionId)) continue;
		const currentSnapshot = readSessionStateDeleteSnapshot(database.db, plan.sessionId);
		if (!sqliteSessionStateDeleteSnapshotsEqual(currentSnapshot, plan.snapshot)) throw new Error(`SQLite session state changed before deletion for ${plan.sessionId}`);
		if (plan.archive) persistSessionTranscriptArchive(database, plan);
		if (deleteSqliteSessionStateRows(database, plan.sessionId)) onDeleted?.();
		if (plan.snapshot.lastSeq !== null && plan.archivedTranscript) archivedTranscripts.push(plan.archivedTranscript);
	}
	return archivedTranscripts;
}
function planSessionStateAfterEntryRemoval(params) {
	const referencedSessionIds = params.referencedSessionIds ?? readReferencedSessionIds(params.database);
	const plans = [];
	for (const sessionId of collectSessionStateIdsForEntry(params.entry)) {
		const plan = planSessionStateDeleteIfUnreferenced({
			archiveTranscript: params.archiveTranscript,
			archiveDirectory: params.archiveDirectory,
			database: params.database,
			reason: params.reason,
			referencedSessionIds,
			sessionId
		});
		if (plan) plans.push(plan);
	}
	return plans;
}
/** Ids of every persisted generation owned by the given logical session keys. */
function readSessionGenerationIdsForKeys(database, keys, options = {}) {
	const sessionKeys = uniqueStrings([...keys].map((key) => options.exactStoredKeys ? key : key.trim()));
	if (sessionKeys.length === 0) return [];
	const db = getSessionKysely(database.db);
	return executeSqliteQuerySync(database.db, db.selectFrom("session_windows").select("session_id").where("session_key", "in", sessionKeys)).rows.map((row) => row.session_id);
}
async function projectSessionEntryLifecycleMutation(databaseOptions, params) {
	const removalDatabase = openOpenClawAgentDatabase(databaseOptions);
	const store = readSessionEntryStore(removalDatabase, {
		allowCanonicalRepair: params.allowCanonicalRepair === true,
		sessionKeys: [...params.removals.map((removal) => removal.exactStoredKey ? removal.sessionKey : removal.sessionKey.trim()), ...params.upserts.map((upsert) => upsert.sessionKey.trim())]
	});
	const removedKeysToArchive = /* @__PURE__ */ new Set();
	const changedSessionKeys = /* @__PURE__ */ new Set();
	const projectedRemovals = [];
	for (const removal of params.removals) {
		const sessionKey = removal.exactStoredKey ? removal.sessionKey : removal.sessionKey.trim();
		let entry = removal.exactStoredKey || sessionKey ? store[sessionKey] : void 0;
		if (removal.expectedRawEntryJson !== void 0) {
			if (readExactSessionEntryJson(removalDatabase, sessionKey) !== removal.expectedRawEntryJson) throw new Error(`SQLite session entry changed before raw lifecycle removal for ${sessionKey}`);
			entry = removal.expectedEntry ? cloneSessionEntry(removal.expectedEntry) : void 0;
		}
		if (!shouldRemoveSessionEntry(entry, removal)) continue;
		if (removal.expectedTranscriptSnapshot) {
			const sessionId = entry.sessionId;
			if (!sessionId || !sqliteSessionStateDeleteSnapshotsEqual(readSessionStateDeleteSnapshot(removalDatabase.db, sessionId), removal.expectedTranscriptSnapshot)) continue;
		}
		projectedRemovals.push({
			archiveTranscript: removal.archiveRemovedTranscript === true,
			expectedEntry: cloneSessionEntry(entry),
			removal,
			sessionKey
		});
		if (removal.archiveRemovedTranscript === true) removedKeysToArchive.add(sessionKey);
		changedSessionKeys.add(sessionKey);
		delete store[sessionKey];
	}
	const upsertedEntries = [];
	for (const upsert of params.upserts) {
		const sessionKey = upsert.sessionKey.trim();
		if (!sessionKey) continue;
		if (upsert.requiresRemovalSessionKey && !projectedRemovals.some((removal) => removal.sessionKey === upsert.requiresRemovalSessionKey?.trim())) continue;
		const expectedEntry = store[sessionKey] ? cloneSessionEntry(store[sessionKey]) : void 0;
		if (upsert.resetBoundary && !expectedEntry) throw new Error(`Cannot append reset boundary without an existing session row: ${sessionKey}`);
		const entry = upsert.buildEntry === void 0 ? upsert.entry : await upsert.buildEntry({
			currentEntry: expectedEntry ? cloneSessionEntry(expectedEntry) : void 0,
			sessionKey
		});
		if (!entry) continue;
		const cloned = cloneSessionEntry(entry);
		store[sessionKey] = cloned;
		changedSessionKeys.add(sessionKey);
		upsertedEntries.push({
			expectedEntry,
			sessionKey,
			entry: cloned,
			...upsert.routeContext !== void 0 ? { routeContext: upsert.routeContext } : {},
			...upsert.resetBoundary ? { resetBoundary: upsert.resetBoundary } : {}
		});
	}
	if (projectedRemovals.length === 0) return {
		deletePlans: [],
		removals: projectedRemovals,
		upsertedEntries
	};
	const database = openOpenClawAgentDatabase(databaseOptions);
	const referencedSessionIds = collectProjectedReferencedSessionIds({
		database,
		excludedSessionKeys: changedSessionKeys,
		projectedStore: store
	});
	const deletePlans = projectedRemovals.flatMap(({ archiveTranscript, expectedEntry: entry }) => planSessionStateAfterEntryRemoval({
		archiveDirectory: params.archiveDirectory,
		archiveTranscript,
		database,
		entry,
		reason: "deleted",
		referencedSessionIds
	}));
	const observedSnapshotsBySessionId = new Map(projectedRemovals.flatMap(({ expectedEntry, removal }) => expectedEntry.sessionId && removal.expectedTranscriptSnapshot ? [[expectedEntry.sessionId, removal.expectedTranscriptSnapshot]] : []));
	for (const plan of deletePlans) {
		const observedSnapshot = observedSnapshotsBySessionId.get(plan.sessionId);
		if (observedSnapshot) plan.snapshot = observedSnapshot;
	}
	const plannedIds = new Set(deletePlans.map((plan) => plan.sessionId));
	for (const sessionId of readSessionGenerationIdsForKeys(database, removedKeysToArchive)) {
		if (plannedIds.has(sessionId)) continue;
		const plan = planSessionStateDeleteIfUnreferenced({
			archiveDirectory: params.archiveDirectory,
			archiveTranscript: true,
			database,
			reason: "deleted",
			referencedSessionIds,
			sessionId
		});
		if (plan) {
			deletePlans.push(plan);
			plannedIds.add(sessionId);
		}
	}
	return {
		deletePlans,
		removals: projectedRemovals,
		upsertedEntries
	};
}
function collectProjectedReferencedSessionIds(params) {
	const excludedSessionKeys = new Set(params.excludedSessionKeys);
	const sessionIds = readReferencedSessionIds(params.database, excludedSessionKeys);
	for (const entry of Object.values(params.projectedStore)) for (const sessionId of collectSessionStateIdsForEntry(entry)) sessionIds.add(sessionId);
	return sessionIds;
}
function deleteSqliteSessionStateRows(database, sessionId) {
	const db = getSessionKysely(database.db);
	deleteSessionTranscriptIndexInTransaction(database.db, sessionId);
	const deleted = executeSqliteQuerySync(database.db, db.deleteFrom("session_windows").where("session_id", "=", sessionId));
	return Number(deleted.numAffectedRows ?? 0n) > 0;
}
function planSqliteOrphanLifecycleTranscriptStateDeletes(params) {
	const db = getSessionKysely(params.database.db);
	const rows = executeSqliteQuerySync(params.database.db, db.selectFrom("session_windows").select([
		"session_id",
		"session_key",
		"plugin_owner_id"
	]).orderBy("session_id", "asc")).rows;
	const deletePlans = [];
	for (const row of rows) {
		if (!sessionKeyBelongsToAgent(row.session_key, params.agentId) || params.referencedSessionIds.has(row.session_id) || params.excludedSessionIds?.has(row.session_id) || params.pluginOwnerId && row.plugin_owner_id && row.plugin_owner_id !== params.pluginOwnerId) continue;
		if (!sqliteTranscriptStateIsReclaimable({
			database: params.database,
			sessionId: row.session_id,
			nowMs: params.nowMs,
			orphanTranscriptMinAgeMs: params.orphanTranscriptMinAgeMs
		}) || !sqliteTranscriptStateHasMarker({
			database: params.database,
			sessionId: row.session_id,
			transcriptContentMarker: params.transcriptContentMarker
		})) continue;
		const plan = planSessionStateDeleteIfUnreferenced({
			archiveTranscript: params.archiveRemovedEntryTranscripts,
			archiveDirectory: params.archiveDirectory,
			database: params.database,
			reason: "deleted",
			referencedSessionIds: params.referencedSessionIds,
			sessionId: row.session_id
		});
		if (plan) deletePlans.push(plan);
	}
	return deletePlans;
}
function planSessionLifecycleArtifactCleanup(database, params) {
	const db = getSessionKysely(database.db);
	const rows = executeSqliteQuerySync(database.db, db.selectFrom("session_nodes").select([
		"entry_json",
		"session_key",
		"current_session_id",
		"updated_at"
	]).orderBy("session_key", "asc")).rows;
	const removedSessionIds = /* @__PURE__ */ new Set();
	const entries = [];
	const projectedStore = readSessionEntryStore(database);
	const foreignOwnedSessionIds = params.pluginOwnerId ? new Set(executeSqliteQuerySync(database.db, db.selectFrom("session_windows").select("session_id").where("plugin_owner_id", "is not", null).where("plugin_owner_id", "!=", params.pluginOwnerId)).rows.map((row) => row.session_id)) : void 0;
	for (const row of rows) {
		if (!sessionKeyBelongsToAgent(row.session_key, params.agentId) || !sessionKeySegmentStartsWith(row.session_key, params.sessionKeySegmentPrefix)) continue;
		const entry = projectedStore[row.session_key];
		const sessionIds = uniqueStrings([row.current_session_id, ...entry ? collectSessionStateIdsForEntry(entry) : []]);
		if (params.pluginOwnerId && entry?.pluginOwnerId && entry.pluginOwnerId !== params.pluginOwnerId || sessionIds.some((sessionId) => foreignOwnedSessionIds?.has(sessionId))) continue;
		if (!sqliteTranscriptStateIsReclaimable({
			database,
			sessionUpdatedAt: coerceSqliteNumber(row.updated_at),
			sessionId: row.current_session_id,
			nowMs: params.nowMs,
			orphanTranscriptMinAgeMs: params.orphanTranscriptMinAgeMs
		})) continue;
		for (const sessionId of sessionIds) removedSessionIds.add(sessionId);
		entries.push({
			expectedEntry: entry ? cloneSessionEntry(entry) : void 0,
			sessionKey: row.session_key
		});
		delete projectedStore[row.session_key];
	}
	const referencedSessionIds = collectProjectedReferencedSessionIds({
		database,
		excludedSessionKeys: entries.map((entry) => entry.sessionKey),
		projectedStore
	});
	const deletePlans = [];
	for (const sessionId of removedSessionIds) {
		const plan = planSessionStateDeleteIfUnreferenced({
			archiveTranscript: params.archiveRemovedEntryTranscripts,
			archiveDirectory: params.archiveDirectory,
			database,
			referencedSessionIds,
			sessionId
		});
		if (plan) deletePlans.push(plan);
	}
	deletePlans.push(...planSqliteOrphanLifecycleTranscriptStateDeletes({
		...params.agentId ? { agentId: params.agentId } : {},
		archiveRemovedEntryTranscripts: params.archiveRemovedEntryTranscripts,
		archiveDirectory: params.archiveDirectory,
		database,
		excludedSessionIds: removedSessionIds,
		...params.pluginOwnerId ? { pluginOwnerId: params.pluginOwnerId } : {},
		referencedSessionIds,
		transcriptContentMarker: params.transcriptContentMarker,
		orphanTranscriptMinAgeMs: params.orphanTranscriptMinAgeMs,
		nowMs: params.nowMs
	}));
	return {
		deletePlans,
		entries
	};
}
function deletePlannedLifecycleArtifactEntries(database, entries) {
	assertPlannedLifecycleArtifactEntriesUnchanged(database, entries);
	let removedEntries = 0;
	for (const planned of entries) {
		deleteSessionEntryRows(database, planned.sessionKey);
		removedEntries += 1;
	}
	return removedEntries;
}
function assertPlannedLifecycleArtifactEntriesUnchanged(database, entries) {
	for (const planned of entries) {
		const current = readExactSessionEntryRow(database, planned.sessionKey)?.entry;
		if (!sqliteSessionEntriesEqual(current, planned.expectedEntry)) throw new Error(`SQLite lifecycle cleanup entry changed for ${planned.sessionKey}`);
	}
}
/** Partition only optimistic entry conflicts; database and parse failures stay fatal. */
function partitionUnchangedPlannedLifecycleArtifactEntries(database, entries) {
	const changed = [];
	const unchanged = [];
	for (const planned of entries) {
		const current = readExactSessionEntryRow(database, planned.sessionKey)?.entry;
		(sqliteSessionEntriesEqual(current, planned.expectedEntry) ? unchanged : changed).push(planned);
	}
	return {
		changed,
		unchanged
	};
}
//#endregion
export { publishTranscriptUpdate as _, partitionUnchangedPlannedLifecycleArtifactEntries as a, planSessionStateDeleteIfUnreferenced as c, readReferencedSessionIdsAfterTargetMutation as d, readSessionGenerationIdsForKeys as f, emitArchivedTranscriptUpdates as g, publishSessionStateArchives as h, deletePlannedLifecycleArtifactEntries as i, projectSessionEntryLifecycleMutation as l, prunePublishedSessionArchivesByRetention as m, collectProjectedReferencedSessionIds as n, planSessionLifecycleArtifactCleanup as o, shouldRemoveSessionEntry as p, deleteMaterializedSessionStatePlans as r, planSessionStateAfterEntryRemoval as s, assertPlannedLifecycleArtifactEntriesUnchanged as t, readReferencedSessionIds as u };
