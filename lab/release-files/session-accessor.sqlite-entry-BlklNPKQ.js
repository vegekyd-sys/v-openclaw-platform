import {withSqliteBeginContentionRetry} from "./sqlite-begin-contention-retry.mjs";
import { waitAutomaticMaintenanceWindow as db91WaitAutomaticMaintenance } from "./db91-maintenance-throttle.mjs";
import { y as uniqueStrings } from "./string-normalization-DiSb4JeN.js";
import { n as getRuntimeConfig } from "./io.runtime-CKu7Rw0j.js";
import { a as getChildLogger } from "./logger-Dj_CBJHF.js";
import { n as executeSqliteQuerySync, r as executeSqliteQueryTakeFirstSync } from "./kysely-sync-DKYGT267.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { f as resolveAgentIdFromSessionKey } from "./session-key-CRjxKW0X.js";
import { t as isIncognitoSessionKey } from "./incognito-session-key-BwpD1Lwd.js";
import { o as resolveSessionStorePathCore } from "./paths-DDTeIhCT.js";
import "./io-Des9Xfzj.js";
import { n as resolveIncognitoOpenClawAgentSqlitePath, r as resolveOpenClawAgentSqlitePath, t as isIncognitoOpenClawAgentSqlitePath } from "./openclaw-agent-db.paths-DYna80bS.js";
import { c as deferOpenClawAgentPostCommitPublication, g as openOpenClawAgentDatabase, u as getOpenClawAgentDatabaseIfOpen, y as runOpenClawAgentWriteTransaction } from "./openclaw-agent-db-CUTe8BX6.js";
import { a as getOwnedSessionTranscriptInitialWriter, l as withOwnedSessionTranscriptWriterFence, n as assertOwnedTranscriptWriteCommit, t as SessionTranscriptWriterClaimReboundError } from "./transcript-write-context-mhuh2Sos.js";
import { n as withOpenClawAgentDatabaseReadOnly } from "./openclaw-agent-db-readonly-wb-jdztx.js";
import { t as normalizeInternalTurnContext } from "./internal-turn-source-CPy6lbaz.js";
import { X as deriveLastRoutePatch, Z as deriveSessionMetaPatch, d as readLifecycleTargetSnapshot, g as readSessionIdentitySnapshot, m as readSessionEntrySelectionSnapshot, p as readSessionEntryRow, q as assertLifecycleTargetSnapshotUnchanged, s as parseReadableSqliteSessionEntryRow, u as readExactSessionEntryRowValidated, y as writeSessionEntry } from "./session-accessor.sqlite-entry-store-VfW3gyuj.js";
import { o as resolveDeliveryProvenCanonicalSessionKey, t as collectSessionEntryLookupKeys } from "./store-entry-CMuTqREZ.js";
import { c as resolveSqliteScope, d as resolveSqliteTranscriptReadScope, i as getSessionKysely, l as resolveSqliteStoreScope, m as toDatabaseOptions, p as runExclusiveSqliteSessionWrite, s as resolveSqliteReadScope, t as cloneSessionEntry, u as resolveSqliteTranscriptArchiveDirectory } from "./session-accessor.sqlite-scope-BwPKGcgm.js";
import { C as readSessionEntryCache, D as readSessionEntriesByStatus, O as selectSessionEntryRows, d as assertCanonicalSessionKeyWrite, m as canonicalSessionKeyMigrationRequiredError, p as assertCanonicalSqliteSessionKeysCurrent, v as coerceSqliteNumber, y as createFallbackSessionEntry } from "./session-accessor.sqlite-transcript-state-Cz9g7S9v.js";
import { n as buildSessionCreationStamp } from "./session-entry-provenance-Ch9ZRplR.js";
import { a as applySessionEntryMaintenance, i as kickSessionHistoryDiskBudgetMaintenance, o as finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort, u as emitCommittedSessionIdentityDiff } from "./session-history-eviction-d5aiCsHS.js";
import { i as mergeSessionEntryPreserveActivity, r as mergeSessionEntry } from "./types-BHV0IaPK.js";
import crypto from "node:crypto";
//#region src/config/sessions/internal-session-key.ts
const INTERNAL_SESSION_EFFECTS_SEGMENT = "internal-session-effects";
function normalizeInternalRunId(runId) {
	return `${runId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 48) || "run"}-${crypto.createHash("sha256").update(runId).digest("hex").slice(0, 16)}`;
}
/** Resolves the hidden SQLite session identity owned by one internal-effects run. */
function resolveInternalSessionEffectsIdentity(params) {
	const suffix = normalizeInternalRunId(params.runId);
	const keySuffix = params.incognito ? `incognito-${suffix}` : suffix.startsWith("incognito-") ? `legacy-${suffix}` : suffix;
	return {
		sessionId: `${INTERNAL_SESSION_EFFECTS_SEGMENT}-${suffix}`,
		sessionKey: `agent:${normalizeAgentId(params.agentId)}:${INTERNAL_SESSION_EFFECTS_SEGMENT}:${keySuffix}`
	};
}
/** Returns true for SQLite entries that exist only to contain suppressed run effects. */
function isInternalSessionEffectsKey(sessionKey) {
	const parts = sessionKey.split(":");
	return parts.length >= 4 && parts[0] === "agent" && parts[2] === INTERNAL_SESSION_EFFECTS_SEGMENT;
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-history.ts
function listTranscriptInstancesFromDatabase(params) {
	let query = getSessionKysely(params.database.db).selectFrom("session_windows").select([
		"session_id",
		"session_key",
		"created_at",
		"updated_at",
		"channel",
		"account_id",
		"transcript_updated_at",
		"session_entry_provenance",
		"acp_owned",
		"plugin_owner_id",
		"hook_external_content_source",
		"parent_session_key",
		"spawned_by",
		"chat_type"
	]);
	if (!params.options.includeAllWindows) query = query.where("transcript_updated_at", "is not", null);
	if (params.options.sessionId !== void 0) query = query.where("session_id", "=", params.options.sessionId);
	return executeSqliteQuerySync(params.database.db, query.orderBy("transcript_updated_at", "desc").orderBy("session_id", "asc")).rows.map((row) => {
		if (!params.options.includeAllWindows && isInternalSessionEffectsKey(row.session_key)) return;
		const updatedAtMs = row.transcript_updated_at ?? row.updated_at;
		const current = params.currentEntries.get(row.session_key);
		const currentIsExact = current?.sessionId === row.session_id;
		const provenanceKnown = row.session_entry_provenance === 1;
		const hookExternalContentSource = row.hook_external_content_source === "gmail" || row.hook_external_content_source === "webhook" ? row.hook_external_content_source : void 0;
		const chatType = row.chat_type === "direct" || row.chat_type === "group" || row.chat_type === "channel" ? row.chat_type : void 0;
		const exactHookSource = (currentIsExact ? current?.hookExternalContentSource : void 0) ?? (provenanceKnown && hookExternalContentSource === "gmail" ? "gmail" : null);
		const entry = {
			...currentIsExact && current ? structuredClone(current) : {},
			sessionId: row.session_id,
			updatedAt: updatedAtMs,
			...row.parent_session_key ? { parentSessionKey: row.parent_session_key } : {},
			...row.spawned_by ? {
				spawnedBy: row.spawned_by,
				spawnDepth: 1
			} : {},
			...chatType ? { chatType } : {},
			...provenanceKnown && row.plugin_owner_id ? { pluginOwnerId: row.plugin_owner_id } : {},
			...provenanceKnown && hookExternalContentSource ? { hookExternalContentSource } : {}
		};
		return {
			agentId: resolveAgentIdFromSessionKey(row.session_key, params.database.agentId),
			acpOwned: row.acp_owned === 1 || Boolean(currentIsExact && current?.acp),
			entry,
			provenanceKnown,
			sessionId: row.session_id,
			sessionKey: row.session_key,
			updatedAtMs,
			sourceMetadata: {
				createdAt: row.created_at,
				channel: row.channel,
				accountId: row.account_id,
				chatType: chatType ?? null,
				hookExternalContentSource: exactHookSource
			}
		};
	}).filter((entry) => entry !== void 0);
}
/** Read retained archive identities through the same physical and logical session owner. */
function listSessionTranscriptArchivesReadOnly(scope) {
	const selectors = [...new Set(scope.sessionIds ?? [])];
	const archiveNames = [...new Set(scope.archiveNames ?? [])];
	if (selectors.length === 0 && archiveNames.length === 0) return [];
	const resolved = resolveSqliteReadScope(scope);
	const result = withOpenClawAgentDatabaseReadOnly(({ db, agentId }) => {
		let query = getSessionKysely(db).selectFrom("session_transcript_archives").select([
			"archive_name as archiveName",
			"session_id as sessionId",
			"session_key as sessionKey",
			"created_at as createdAt"
		]).orderBy("created_at").orderBy("session_id");
		query = query.where((expression) => expression.or([...selectors.length > 0 ? [expression("session_id", "in", selectors), expression("session_key", "in", selectors)] : [], ...archiveNames.length > 0 ? [expression("archive_name", "in", archiveNames)] : []]));
		return executeSqliteQuerySync(db, query).rows.filter((row) => resolveAgentIdFromSessionKey(row.sessionKey, agentId) === resolved.agentId);
	}, toDatabaseOptions(resolved));
	return result.found ? result.value : [];
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-maintenance-kick.ts
const maintenanceByStore = /* @__PURE__ */ new Map();
/** Coalesce automatic logical maintenance outside ordinary entry-write latency. */
function kickSessionEntryMaintenanceAfterWrite(params) {
	if (params.skipMaintenance) return;
	const databasePath = resolveOpenClawAgentSqlitePath(toDatabaseOptions(params.scope));
	const database = getOpenClawAgentDatabaseIfOpen(toDatabaseOptions(params.scope));
	if (!database) return;
	const owner = maintenanceByStore.get(databasePath);
	if (owner?.database === database) {
		owner.activeSessionKeys.add(params.activeSessionKey);
		Object.assign(owner, params, { generation: owner.generation + 1 });
		return;
	}
	const created = {
		...params,
		activeSessionKeys: /* @__PURE__ */ new Set([params.activeSessionKey]),
		database,
		generation: 1
	};
	maintenanceByStore.set(databasePath, created);
	setImmediate(() => void runPendingMaintenance(databasePath, created));
}
async function runPendingMaintenance(databasePath, owner) {
	const isCurrent = () => maintenanceByStore.get(databasePath) === owner && owner.database.db.isOpen;
	while (isCurrent()) {
		if (process.env.OPENCLAW_DB91_MAINTENANCE_ENABLE === "1") {
			await db91WaitAutomaticMaintenance(owner.database);
			if (!isCurrent()) break;
		}
		const generation = owner.generation;
		const activeSessionKeys = [...owner.activeSessionKeys];
		owner.activeSessionKeys.clear();
		try {
			const plan = await runExclusiveSqliteSessionWrite(owner.scope, async () => {
				if (!isCurrent()) return;
				return runOpenClawAgentWriteTransaction((database) => applySessionEntryMaintenance(database, {
					activeSessionKeys,
					archiveDirectory: owner.archiveDirectory,
					maintenanceConfig: owner.maintenanceConfig,
					storePath: owner.storePath
				}), toDatabaseOptions(owner.scope));
			});
			if (!plan) {
				if (maintenanceByStore.get(databasePath) === owner) maintenanceByStore.delete(databasePath);
				return;
			}
			await finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort(owner.scope, [plan], { isCurrent });
		} catch (error) {
			getChildLogger({ subsystem: "session-sqlite" }).warn("SQLite automatic session maintenance failed", {
				error,
				path: databasePath
			});
		}
		if (maintenanceByStore.get(databasePath) !== owner) return;
		if (!owner.database.db.isOpen || owner.generation === generation) {
			maintenanceByStore.delete(databasePath);
			return;
		}
	}
	if (maintenanceByStore.get(databasePath) === owner) maintenanceByStore.delete(databasePath);
}
//#endregion
//#region src/config/sessions/session-entry-lineage.ts
/** True when this entry's transcript began as a copy of a parent (actual forkSource ancestry or the legacy/thread-settled marker). */
function sessionEntryForkedFromParent(entry) {
	return entry?.forkSource !== void 0 || entry?.forkedFromParent === true;
}
function preserveSqliteSameKeySessionRolloverLineage(params) {
	const previousSessionId = params.previous.sessionId.trim();
	const nextSessionId = params.next.sessionId.trim();
	if (!previousSessionId || !nextSessionId || previousSessionId === nextSessionId) return params.next;
	return {
		...params.next,
		previousSessionId,
		usageFamilyKey: params.next.usageFamilyKey ?? params.previous.usageFamilyKey ?? params.sessionKey,
		usageFamilySessionIds: uniqueStrings([
			...params.previous.usageFamilySessionIds ?? [],
			previousSessionId,
			...params.next.usageFamilySessionIds ?? [],
			nextSessionId
		])
	};
}
//#endregion
//#region src/config/sessions/session-store-path.ts
function resolveSessionStorePathForScope(scope, config) {
	if (isIncognitoSessionKey(scope.sessionKey)) return resolveIncognitoOpenClawAgentSqlitePath({
		agentId: resolveAgentIdFromSessionKey(scope.sessionKey),
		env: scope.env
	});
	if (scope.storePath) return scope.storePath;
	const agentId = scope.agentId ?? resolveAgentIdFromSessionKey(scope.sessionKey);
	return resolveSessionStorePathCore((config ?? getRuntimeConfig()).session?.store, {
		agentId,
		env: scope.env
	});
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-initial-entry.ts
/** Lazy session identity creation, including the original admission's first writer claim. */
/** Creates a missing session identity without replacing a concurrently owned row. */
function ensureSessionEntrySync(scope, entry) {
	const initialWriter = getOwnedSessionTranscriptInitialWriter({ sessionTarget: {
		...scope,
		sessionId: entry.sessionId
	} });
	const initializing = initialWriter && !initialWriter.committedFence;
	const fencedScope = withOwnedSessionTranscriptWriterFence(scope);
	const resolved = resolveSqliteScope(fencedScope);
	assertCanonicalSessionKeyWrite(resolved.sessionKey, resolved.agentId);
	let owned = false;
	let previous = /* @__PURE__ */ new Map();
	let current = /* @__PURE__ */ new Map();
	runOpenClawAgentWriteTransaction((database) => {
		assertOwnedTranscriptWriteCommit({
			...fencedScope,
			sessionId: entry.sessionId
		});
		const identityKeys = collectSessionEntryLookupKeys(database, resolved.sessionKey);
		previous = readSessionIdentitySnapshot(database, identityKeys);
		const existing = readSessionEntryRow(database, resolved.sessionKey)?.entry;
		if (existing) {
			if (initializing) throw new SessionTranscriptWriterClaimReboundError();
			owned = existing.sessionId === entry.sessionId;
			current = previous;
			return;
		}
		if (fencedScope.expectedWriterRunId !== void 0 && !initializing) {
			current = previous;
			return;
		}
		const persisted = writeSessionEntry(database, resolved.sessionKey, initializing ? {
			...entry,
			activeWriterRunId: initialWriter.writerRunId
		} : entry);
		current = readSessionIdentitySnapshot(database, identityKeys);
		owned = current.get(resolved.sessionKey)?.sessionId === entry.sessionId;
		if (initializing) {
			if (!owned || persisted.activeWriterRunId !== initialWriter.writerRunId) throw new SessionTranscriptWriterClaimReboundError();
			const fence = {
				expectedLifecycleRevision: persisted.lifecycleRevision,
				expectedWriterRunId: persisted.activeWriterRunId
			};
			if (!deferOpenClawAgentPostCommitPublication(database, () => {
				try {
					initialWriter.recordCommitted(fence);
				} finally {
					emitCommittedSessionIdentityDiff(previous, current);
				}
			})) throw new Error("initial session writer requires a managed commit boundary");
		}
	}, toDatabaseOptions(resolved));
	if (!initializing && (current.size !== previous.size || owned)) emitCommittedSessionIdentityDiff(previous, current);
	if (fencedScope.expectedWriterRunId !== void 0 && !owned) throw new SessionTranscriptWriterClaimReboundError();
	return owned;
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-entry.ts
function assertCanonicalSessionWriteScope(scope) {
	assertCanonicalSessionKeyWrite(scope.sessionKey, scope.agentId);
}
/** Resolves one exact canonical entry without materializing the store. */
function resolveSessionEntry(scope, options = {}) {
	const resolved = resolveSqliteScope(scope);
	const read = (database) => {
		return {
			existing: readSessionEntryRow(database, resolved.sessionKey)?.entry,
			legacyKeys: [],
			normalizedKey: resolved.sessionKey
		};
	};
	if (options.readOnly) {
		const result = withOpenClawAgentDatabaseReadOnly(read, toDatabaseOptions(resolved));
		return result.found ? result.value : {
			existing: void 0,
			legacyKeys: [],
			normalizedKey: resolved.sessionKey
		};
	}
	return read(openOpenClawAgentDatabase(toDatabaseOptions(resolved)));
}
/** Loads one session entry from the additive SQLite session store. */
function loadSessionEntry(scope) {
	return resolveSessionEntry(scope).existing;
}
/** Loads one session entry without opening its agent database writable. */
function loadSessionEntryReadOnly(scope) {
	return resolveSessionEntry(scope, { readOnly: true }).existing;
}
/** Loads one exact persisted-key entry from the additive SQLite session store. */
function loadExactSessionEntry(scope) {
	return loadExactSessionEntryWithMode(scope, false);
}
function loadExactSessionEntryWithMode(scope, readOnly) {
	const sessionKey = scope.sessionKey.trim();
	if (!sessionKey) return;
	const resolved = resolveSqliteScope(scope);
	const read = (database) => {
		const entry = readExactSessionEntryRowValidated(database, sessionKey, scope.projection)?.entry;
		return entry ? {
			sessionKey,
			entry
		} : void 0;
	};
	if (!readOnly) return read(openOpenClawAgentDatabase(toDatabaseOptions(resolved)));
	const result = withOpenClawAgentDatabaseReadOnly(read, toDatabaseOptions(resolved));
	return result.found ? result.value : void 0;
}
/** Lists persisted session keys without materializing their entry JSON. */
function listSessionEntryKeysReadOnly(scope = {}) {
	const resolved = resolveSqliteScope({
		...scope,
		sessionKey: ""
	});
	const result = withOpenClawAgentDatabaseReadOnly((database) => {
		const db = getSessionKysely(database.db);
		return executeSqliteQuerySync(database.db, db.selectFrom("session_nodes").select("session_key").orderBy("session_key")).rows.map((row) => row.session_key);
	}, toDatabaseOptions(resolved));
	return result.found ? result.value : [];
}
/** Exact persisted-key probe on the read-only handle, for per-row hot paths. */
function loadExactSessionEntryReadOnly(scope) {
	return loadExactSessionEntryWithMode(scope, true);
}
/** Lists direct child rows without cloning or rebuilding the complete session store. */
function listSessionChildEntriesReadOnly(scope) {
	const resolved = resolveSqliteScope(scope);
	const result = withOpenClawAgentDatabaseReadOnly((database) => {
		assertCanonicalSqliteSessionKeysCurrent(database);
		const db = getSessionKysely(database.db);
		const query = scope.projection === "list" ? selectSessionEntryRows(database, scope.projection).select(["current_session_id", "updated_at"]) : db.selectFrom("session_nodes").selectAll();
		return executeSqliteQuerySync(database.db, query.where((expression) => expression.or([expression("parent_session_key", "=", resolved.sessionKey), expression("spawned_by", "=", resolved.sessionKey)])).where("session_key", "!=", resolved.sessionKey).orderBy("session_key", "asc")).rows.flatMap((row) => {
			if (isInternalSessionEffectsKey(row.session_key)) return [];
			const entry = parseReadableSqliteSessionEntryRow(database, row, scope.projection);
			return entry ? [{
				sessionKey: row.session_key,
				entry
			}] : [];
		});
	}, toDatabaseOptions(resolved));
	return result.found ? result.value : [];
}
/** Resolves the persisted session key for a SQLite transcript session id. */
function resolveSessionKeyBySessionId(scope) {
	const resolved = resolveSqliteTranscriptReadScope(scope);
	const result = withOpenClawAgentDatabaseReadOnly((database) => {
		const db = getSessionKysely(database.db);
		return executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_windows").select("session_key").where("session_id", "=", resolved.sessionId).limit(1));
	}, toDatabaseOptions(resolved));
	return result.found ? result.value?.session_key : void 0;
}
/** Lists session entries from the additive SQLite session store. */
function listSessionEntryRows(scope = {}) {
	const resolved = resolveSqliteScope({
		...scope,
		sessionKey: ""
	});
	return listSqliteSessionEntriesFromDatabase(openOpenClawAgentDatabase(toDatabaseOptions(resolved)), resolved, scope);
}
/**
* Lists session entries without opening the agent database writable.
* Transient lock errors propagate: only the caller knows whether "empty" is an
* acceptable degradation (health snapshots) or hides real state (migration detection).
*/
function listSessionEntriesReadOnly(scope = {}) {
	const resolved = resolveSqliteScope({
		...scope,
		sessionKey: ""
	});
	const result = withOpenClawAgentDatabaseReadOnly((database) => listSqliteSessionEntriesFromDatabase(database, resolved, scope), toDatabaseOptions(resolved));
	return result.found ? result.value : [];
}
/** Counts durable session rows without materializing entry JSON or warming the entry cache. */
function countSessionEntryRowsReadOnly(scope = {}) {
	const resolved = resolveSqliteScope({
		...scope,
		sessionKey: ""
	});
	const result = withOpenClawAgentDatabaseReadOnly((database) => {
		const db = getSessionKysely(database.db);
		const row = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_nodes").select((expression) => expression.fn.countAll().as("count")));
		return row ? coerceSqliteNumber(row.count) : 0;
	}, toDatabaseOptions(resolved));
	return result.found ? result.value : 0;
}
/**
* Proves whether a durable store has a row in one of the requested lifecycle states.
* Unknown existing schemas stay eligible so the writable owner can surface or repair them.
*/
function hasSessionEntriesByStatusReadOnly(scope, statuses) {
	const selectedStatuses = [...new Set(statuses)];
	if (selectedStatuses.length === 0) return false;
	const resolved = resolveSqliteScope({
		...scope,
		sessionKey: ""
	});
	const result = withOpenClawAgentDatabaseReadOnly((database) => {
		const db = getSessionKysely(database.db);
		return Boolean(executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_nodes").select("session_key").where("status", "in", selectedStatuses).limit(1)));
	}, toDatabaseOptions(resolved));
	return result.found ? result.value : result.reason !== "database-missing";
}
function listSqliteSessionEntriesFromDatabase(database, resolved, scope) {
	assertCanonicalSqliteSessionKeysCurrent(database);
	const projection = scope.projection ?? "full";
	const cache = !isIncognitoOpenClawAgentSqlitePath(database.path, {
		agentId: database.agentId,
		env: resolved.env
	});
	const snapshot = readSessionEntryCache(database, {
		cache,
		latest: scope.readConsistency === "latest",
		projection
	});
	return snapshot.keys.flatMap((sessionKey) => {
		if (isInternalSessionEffectsKey(sessionKey)) return [];
		const entry = snapshot.entries.get(sessionKey);
		if (!entry) return [];
		const deliveryCanonicalKey = resolveDeliveryProvenCanonicalSessionKey(sessionKey, entry);
		if (deliveryCanonicalKey !== sessionKey) throw canonicalSessionKeyMigrationRequiredError(`non-canonical persisted row resolves to session key ${deliveryCanonicalKey}`);
		return [{
			sessionKey,
			entry: projection === "list" && scope.clone !== false ? cloneSessionEntry(entry) : entry
		}];
	});
}
/** Lists only entries whose normalized session row has one of the requested statuses. */
function listSessionEntriesByStatus(scope, statuses) {
	const resolved = resolveSqliteScope({
		...scope,
		sessionKey: ""
	});
	const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
	return readSessionEntriesByStatus(database, statuses).filter(({ sessionKey }) => !isInternalSessionEffectsKey(sessionKey));
}
/** Lists transcript-bearing SQLite sessions, including retained rows from session-id rotation. */
function listSessionTranscriptInstances(scope = {}, options = {}) {
	const resolved = resolveSqliteScope({
		...scope,
		sessionKey: ""
	});
	const result = withOpenClawAgentDatabaseReadOnly((database) => {
		return listTranscriptInstancesFromDatabase({
			currentEntries: options.sessionId !== void 0 ? { get: (sessionKey) => readExactSessionEntryRowValidated(database, sessionKey)?.entry } : new Map(listSqliteSessionEntriesFromDatabase(database, resolved, {
				...scope,
				clone: false
			}).map(({ sessionKey, entry }) => [sessionKey, entry])),
			database,
			options
		});
	}, toDatabaseOptions(resolved));
	return result.found ? result.value : [];
}
/** Reads a session activity timestamp from the additive SQLite session store. */
function readSessionUpdatedAtCore(scope) {
	const resolved = resolveSqliteScope(scope);
	const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
	const row = readSessionEntryRow(database, resolved.sessionKey)?.row;
	return row ? coerceSqliteNumber(row.updated_at) : void 0;
}
/** Applies a partial entry update to the additive SQLite session store. */
async function upsertSessionEntryCore(scope, patch, options = {}) {
	return await patchSessionEntryCore(scope, () => patch, {
		...options,
		fallbackEntry: createFallbackSessionEntry(patch)
	});
}
/** Replaces one entry in the additive SQLite session store. */
async function replaceSessionEntry(scope, entry) {
	return await patchSessionEntryCore(scope, () => entry, {
		fallbackEntry: entry,
		replaceEntry: true
	});
}
/** Replaces one entry synchronously for sync session runtimes. */
function replaceSessionEntrySync(scope, entry) {
	const resolved = resolveSqliteScope(scope);
	assertCanonicalSessionWriteScope(resolved);
	let previous = /* @__PURE__ */ new Map();
	let current = /* @__PURE__ */ new Map();
	runOpenClawAgentWriteTransaction((database) => {
		const identityKeys = collectSessionEntryLookupKeys(database, resolved.sessionKey);
		previous = readSessionIdentitySnapshot(database, identityKeys);
		writeSessionEntry(database, resolved.sessionKey, entry);
		current = readSessionIdentitySnapshot(database, identityKeys);
	}, toDatabaseOptions(resolved));
	emitCommittedSessionIdentityDiff(previous, current);
}
/** Patches one entry in the additive SQLite session store. */
async function patchSessionEntryCore(scope, update, options = {}) {
	const resolved = resolveSqliteScope(scope);
	assertCanonicalSessionWriteScope(resolved);
	return await patchSqliteSessionEntrySnapshot({
		operationLabel: "session-entry.patch",
		options,
		readSnapshot: (database) => readSessionEntrySelectionSnapshot(database, resolved.sessionKey, options.replaceEntry === true),
		resolved,
		sessionKey: resolved.sessionKey,
		storePath: resolveSessionStorePathForScope(scope),
		update
	});
}
/** Patches one logical entry after validating its canonical lifecycle target. */
async function patchSessionEntryTarget(scope, update, options = {}) {
	return await patchSqliteSessionEntrySnapshot({
		operationLabel: "session-entry-target.patch",
		options,
		readSnapshot: (database) => readLifecycleTargetSnapshot(database, scope.target),
		resolved: resolveSqliteStoreScope(scope.storePath, { agentId: scope.agentId }),
		sessionKey: scope.target.canonicalKey,
		storePath: resolveSessionStorePathForScope({
			agentId: scope.agentId,
			sessionKey: scope.target.canonicalKey,
			storePath: scope.storePath
		}),
		update
	});
}
/** All entry patches prepare asynchronously, then revalidate and publish on one commit edge. */
const SQLITE_SESSION_SNAPSHOT_RETRY_LIMIT = 5;
const sqliteSessionPreCommitConflicts = new WeakSet();
function isRetryableSqliteSessionSnapshotConflict(error) {
	return error instanceof Error && sqliteSessionPreCommitConflicts.has(error);
}
async function patchSqliteSessionEntrySnapshot(params) {
	for (let attempt = 1;; attempt += 1) {
		try {
			return await patchSqliteSessionEntrySnapshotOnce(params);
		} catch (error) {
			// oc64-session-races-v2: bounded cross-process retry. Opt-in keeps callbacks with external side
			// effects single-shot; reply-session persistence is a pure merge and
			// explicitly enables this retry below.
			if (params.options.retrySnapshotConflicts !== true || !isRetryableSqliteSessionSnapshotConflict(error) || attempt >= SQLITE_SESSION_SNAPSHOT_RETRY_LIMIT) throw error;
			await new Promise((resolve) => setTimeout(resolve, 2 ** attempt));
		}
	}
}
async function patchSqliteSessionEntrySnapshotOnce(params) {
	const { options, resolved, sessionKey } = params;
	let wrote = false;
	const committed = await runExclusiveSqliteSessionWrite(resolved, async () => {
		const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
		const prepared = params.readSnapshot(database);
		const existing = prepared[0]?.entry;
		const writeBase = existing ?? options.fallbackEntry;
		if (!writeBase) return null;
		const patch = await params.update(cloneSessionEntry(writeBase), { existingEntry: existing ? cloneSessionEntry(existing) : void 0 });
		const mergeBase = existing ? writeBase : void 0;
		const creationPatch = !existing && patch ? {
			...writeBase,
			...patch
		} : patch;
		const merged = !creationPatch ? void 0 : options.replaceEntry ? cloneSessionEntry(patch) : options.preserveActivity ? mergeSessionEntryPreserveActivity(mergeBase, creationPatch) : mergeSessionEntry(mergeBase, creationPatch);
		const next = !merged ? void 0 : options.replaceEntry ? merged : preserveSqliteSameKeySessionRolloverLineage({
			next: merged,
			previous: writeBase,
			sessionKey
		});
		let result = null;
		let previousIdentity = /* @__PURE__ */ new Map();
		let currentIdentity = /* @__PURE__ */ new Map();
		await withSqliteBeginContentionRetry({
			database: database.db,
			run: operation => runOpenClawAgentWriteTransaction(operation, toDatabaseOptions(resolved)),
			operation: (writeDatabase) => {
			const fresh = params.readSnapshot(writeDatabase);
			try { assertLifecycleTargetSnapshotUnchanged(prepared, fresh, params.operationLabel); }
			catch (error) {
				// Only a conflict thrown before the commit edge can be retried.
				// Never retry a callback/publication failure after a successful write.
				if (error instanceof Error && error.name === "SqliteSessionMutationConflictError") sqliteSessionPreCommitConflicts.add(error);
				throw error;
			}
			options.assertCommitAllowed?.();
			if (!next) {
				result = cloneSessionEntry(writeBase);
				return;
			}
			previousIdentity = new Map(fresh.map((row) => [row.sessionKey, row.entry]));
			const selectedPreviousEntry = fresh[0]?.entry ?? writeBase;
			const persisted = writeSessionEntry(writeDatabase, sessionKey, next, { previousEntry: selectedPreviousEntry });
			wrote = true;
			currentIdentity = readSessionIdentitySnapshot(writeDatabase, [sessionKey]);
			result = cloneSessionEntry(persisted);
			}
		});
		try {
			if (next && result) options.onCommitted?.(cloneSessionEntry(result));
		} finally {
			emitCommittedSessionIdentityDiff(previousIdentity, currentIdentity);
		}
		return result;
	});
	if (wrote) kickSessionEntryMaintenanceAfterWrite({
		activeSessionKey: sessionKey,
		archiveDirectory: resolveSqliteTranscriptArchiveDirectory(resolved),
		maintenanceConfig: options.maintenanceConfig,
		scope: resolved,
		skipMaintenance: options.skipMaintenance,
		storePath: params.storePath
	});
	kickSessionHistoryDiskBudgetMaintenance({
		...resolved.agentId ? { agentId: resolved.agentId } : {},
		storePath: params.storePath,
		...options.maintenanceConfig ? { maintenanceConfig: options.maintenanceConfig } : {}
	});
	return committed;
}
async function recordInboundSessionMeta(params) {
	normalizeInternalTurnContext(params.ctx);
	const createIfMissing = params.createIfMissing ?? true;
	return await patchSessionEntryCore({
		sessionKey: params.sessionKey,
		storePath: params.storePath
	}, (_entry, context) => {
		const metadataPatch = deriveSessionMetaPatch({
			ctx: params.ctx,
			sessionKey: params.sessionKey,
			existing: context.existingEntry,
			groupResolution: params.groupResolution
		});
		if (context.existingEntry) return metadataPatch;
		const senderId = params.ctx.SenderId?.trim();
		return {
			...buildSessionCreationStamp(params.ctx.SessionCreation ?? {
				via: "channel",
				...senderId ? { actor: {
					type: "human",
					source: "channel",
					id: senderId
				} } : {}
			}),
			...metadataPatch
		};
	}, {
		preserveActivity: true,
		...createIfMissing ? { fallbackEntry: mergeSessionEntry(void 0, {}) } : {}
	});
}
/** Updates last-route/delivery metadata without refreshing activity timestamps. */
async function updateSessionLastRoute(params) {
	if (params.ctx) normalizeInternalTurnContext(params.ctx);
	const createIfMissing = params.createIfMissing ?? true;
	return await patchSessionEntryCore({
		sessionKey: params.sessionKey,
		storePath: params.storePath
	}, (_entry, context) => {
		const routePatch = deriveLastRoutePatch({
			channel: params.channel,
			to: params.to,
			accountId: params.accountId,
			threadId: params.threadId,
			route: params.route,
			deliveryContext: params.deliveryContext,
			ctx: params.ctx,
			groupResolution: params.groupResolution,
			existing: context.existingEntry,
			sessionKey: params.sessionKey
		});
		if (context.existingEntry) return routePatch;
		const senderId = params.ctx?.SenderId?.trim();
		return {
			...buildSessionCreationStamp(params.ctx?.SessionCreation ?? {
				via: "channel",
				...senderId ? { actor: {
					type: "human",
					source: "channel",
					id: senderId
				} } : {}
			}),
			...routePatch
		};
	}, {
		preserveActivity: true,
		...params.assertCommitAllowed ? { assertCommitAllowed: params.assertCommitAllowed } : {},
		...createIfMissing ? { fallbackEntry: mergeSessionEntry(void 0, {}) } : {}
	});
}
//#endregion
export { kickSessionEntryMaintenanceAfterWrite, ensureSessionEntrySync as C, listSessionTranscriptArchivesReadOnly as D, sessionEntryForkedFromParent as E, isInternalSessionEffectsKey as O, upsertSessionEntryCore as S, preserveSqliteSameKeySessionRolloverLineage as T, replaceSessionEntry as _, listSessionEntriesReadOnly as a, resolveSessionKeyBySessionId as b, listSessionTranscriptInstances as c, loadSessionEntry as d, loadSessionEntryReadOnly as f, recordInboundSessionMeta as g, readSessionUpdatedAtCore as h, listSessionEntriesByStatus as i, resolveInternalSessionEffectsIdentity as k, loadExactSessionEntry as l, patchSessionEntryTarget as m, hasSessionEntriesByStatusReadOnly as n, listSessionEntryKeysReadOnly as o, patchSessionEntryCore as p, listSessionChildEntriesReadOnly as r, listSessionEntryRows as s, countSessionEntryRowsReadOnly as t, loadExactSessionEntryReadOnly as u, replaceSessionEntrySync as v, resolveSessionStorePathForScope as w, updateSessionLastRoute as x, resolveSessionEntry as y };
