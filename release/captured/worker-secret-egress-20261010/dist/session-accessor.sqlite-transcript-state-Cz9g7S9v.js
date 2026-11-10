import { c as isRecord } from "./record-coerce-DItp3I4t.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { y as uniqueStrings } from "./string-normalization-DiSb4JeN.js";
import { a as iterateSqliteQuerySync, i as getNodeSqliteKysely, n as executeSqliteQuerySync, r as executeSqliteQueryTakeFirstSync } from "./kysely-sync-DKYGT267.js";
import { D as tableExists } from "./openclaw-state-db-cache-AunrvrzG.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { O as parseAgentSessionKey, u as normalizeMainKey } from "./session-key-CRjxKW0X.js";
import { t as SessionParticipantIdentitySchema } from "./session-participant-qQX_wdn2.js";
import { M as FIRST_USE_ADDITIVE_AGENT_COLUMN_DEFINITIONS, j as parseSqliteSessionEntryRecord } from "./openclaw-agent-db-maintenance-DYSkzMMg.js";
import "./openclaw-agent-db-contract-CGTyjij4.js";
import { c as deferOpenClawAgentPostCommitPublication } from "./openclaw-agent-db-CUTe8BX6.js";
import { n as withOpenClawAgentDatabaseReadOnly } from "./openclaw-agent-db-readonly-wb-jdztx.js";
import { c as projectCanonicalSessionEntryShape } from "./store-writer-state-_Y6b9Vjm.js";
import { a as normalizeStoreSessionKey, n as foldedSessionKeyAliasCandidates, o as resolveDeliveryProvenCanonicalSessionKey } from "./store-entry-CMuTqREZ.js";
import { i as getSessionKysely, m as toDatabaseOptions, s as resolveSqliteReadScope } from "./session-accessor.sqlite-scope-BwPKGcgm.js";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { Value } from "typebox/value";
//#region src/config/sessions/session-accessor.sqlite-owner-projection.ts
const ownerColumnAvailability = /* @__PURE__ */ new WeakMap();
function actorFromColumns(type, id) {
	const normalizedType = type === "human" || type === "agent" || type === "system" ? type : null;
	const normalizedId = normalizeOptionalString(id);
	return normalizedType && normalizedId ? {
		type: normalizedType,
		id: normalizedId
	} : void 0;
}
function projectSqliteSessionOwner(entry, row) {
	const actor = actorFromColumns(row.owner_actor_type, row.owner_actor_id);
	if (!actor) return entry;
	const assignedBy = actorFromColumns(row.owner_assigned_by_type, row.owner_assigned_by_id);
	const assignedAt = typeof row.owner_assigned_at === "number" && Number.isFinite(row.owner_assigned_at) ? row.owner_assigned_at : void 0;
	return {
		...entry,
		owner: {
			actor,
			...assignedBy ? { assignedBy } : {},
			...assignedAt !== void 0 ? { assignedAt } : {}
		}
	};
}
function hasSqliteSessionOwnerColumns(database) {
	const db = getSessionKysely(database);
	const schema = executeSqliteQueryTakeFirstSync(database, db.selectFrom(sql`pragma_schema_version`.as("pragma_schema")).select(sql`schema_version`.as("schema_version")));
	const schemaVersion = typeof schema?.schema_version === "number" ? schema.schema_version : -1;
	const cached = ownerColumnAvailability.get(database);
	if (cached?.schemaVersion === schemaVersion) return cached.available;
	const tableInfoRows = executeSqliteQuerySync(database, db.selectFrom(sql`pragma_table_info('session_nodes')`.as("pragma_columns")).select(sql`name`.as("name"))).rows;
	const columns = new Set(tableInfoRows.flatMap((row) => typeof row.name === "string" ? [row.name] : []));
	const available = FIRST_USE_ADDITIVE_AGENT_COLUMN_DEFINITIONS.every(({ columnName }) => columns.has(columnName));
	ownerColumnAvailability.set(database, {
		available,
		schemaVersion
	});
	return available;
}
//#endregion
//#region src/config/sessions/session-participant-identity.ts
function participantIdentityNamespace(identity) {
	if (identity.type === "profile" || identity.type === "agent") return JSON.stringify({ type: identity.type });
	if (identity.type === "remote") return JSON.stringify({
		type: identity.type,
		pluginId: identity.pluginId,
		domain: identity.domain,
		idKind: identity.idKind
	});
	if (identity.type === "observation") return JSON.stringify({
		type: identity.type,
		pluginId: identity.pluginId,
		accountId: identity.accountId,
		senderKind: identity.senderKind
	});
	return JSON.stringify({
		type: identity.type,
		actorType: identity.actorType,
		source: identity.source
	});
}
function readParticipantIdentity(namespace, id) {
	const parsed = JSON.parse(namespace);
	if (isRecord(parsed)) {
		const identity = {
			...parsed,
			id
		};
		if (Value.Check(SessionParticipantIdentitySchema, identity)) return identity;
	}
	throw new Error("Session participant identity is invalid; run openclaw doctor --fix.");
}
/** Inputs/aliases sum; retried cross-store copies retain the largest recorded aggregate. */
function mergeParticipantAggregate(current, incoming, mode) {
	if (!current) return incoming;
	return {
		contribution_count: mode === "sum" ? current.contribution_count + incoming.contribution_count : Math.max(current.contribution_count, incoming.contribution_count),
		first_prompted_at: current.first_prompted_at === null || incoming.first_prompted_at === null ? null : Math.min(current.first_prompted_at, incoming.first_prompted_at),
		last_prompted_at: current.last_prompted_at === null ? incoming.last_prompted_at : incoming.last_prompted_at === null ? current.last_prompted_at : Math.max(current.last_prompted_at, incoming.last_prompted_at)
	};
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-participant-projection.ts
function participantRecordsBySessionKey(database, sessionKeys) {
	const records = /* @__PURE__ */ new Map();
	if (!tableExists(database, "session_participants") || sessionKeys?.length === 0) return records;
	let query = getSessionKysely(database).selectFrom("session_participants").selectAll();
	if (sessionKeys) query = query.where("session_key", "in", sessionKeys);
	for (const row of executeSqliteQuerySync(database, query.orderBy("session_key").orderBy("first_prompted_at").orderBy("actor_id").orderBy("identity_namespace")).rows) {
		const participants = records.get(row.session_key) ?? [];
		participants.push({
			identity: readParticipantIdentity(row.identity_namespace, row.actor_id),
			contributionCount: row.contribution_count,
			firstPromptedAt: row.first_prompted_at,
			lastPromptedAt: row.last_prompted_at
		});
		records.set(row.session_key, participants);
	}
	return records;
}
function withProjectedParticipants(entry, records) {
	if (records.length === 0) return entry;
	return {
		...entry,
		participants: records.map(({ identity }) => ({ identity })),
		participantCount: records.length
	};
}
function projectSqliteSessionParticipants(database, sessionKey, entry) {
	return withProjectedParticipants(entry, participantRecordsBySessionKey(database, [sessionKey]).get(sessionKey) ?? []);
}
function projectSqliteSessionParticipantsBatch(database, entries) {
	const records = participantRecordsBySessionKey(database, [...entries.keys()]);
	return new Map([...entries].map(([sessionKey, entry]) => [sessionKey, withProjectedParticipants(entry, records.get(sessionKey) ?? [])]));
}
function listSessionParticipantsReadOnly(scope) {
	const resolved = resolveSqliteReadScope(scope);
	const result = withOpenClawAgentDatabaseReadOnly((database) => participantRecordsBySessionKey(database.db, scope.sessionKey ? [scope.sessionKey] : void 0), toDatabaseOptions(resolved));
	return result.found ? result.value : /* @__PURE__ */ new Map();
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-status.ts
const sessionEntryMetadataJson = sql`CASE WHEN json_valid(entry_json)
  THEN CASE WHEN json_type(entry_json, '$.sessionId') = 'text'
    THEN json_remove(entry_json, '$.skillsSnapshot', '$.systemPromptReport')
    ELSE entry_json END
  ELSE entry_json END`.as("entry_json");
function selectSessionEntryRows(database, projection) {
	return getNodeSqliteKysely(database.db).selectFrom("session_nodes").select("session_key").select(projection === "full" ? "entry_json" : sessionEntryMetadataJson).$if(hasSqliteSessionOwnerColumns(database.db), (query) => query.select([
		"owner_actor_type",
		"owner_actor_id",
		"owner_assigned_by_type",
		"owner_assigned_by_id",
		"owner_assigned_at"
	]));
}
const sessionEntryInventoryJson = sql`CASE WHEN entry_valid = 1 THEN NULL ELSE ${sessionEntryMetadataJson.expression} END`.as("entry_json");
function normalizeStatus(value) {
	return value === "running" || value === "done" || value === "failed" || value === "killed" || value === "timeout" ? value : null;
}
function parseSessionEntryJson(row, projection = "full") {
	const record = parseSqliteSessionEntryRecord(row);
	if (!record) return null;
	if (projection === "list") {
		delete record.skillsSnapshot;
		delete record.systemPromptReport;
	}
	return projectSqliteSessionOwner(projectCanonicalSessionEntryShape(record), row);
}
function readSessionEntriesByStatus(database, statuses, sessionKeys) {
	const selectedStatuses = [...new Set(statuses)];
	const selectedSessionKeys = sessionKeys ? [...new Set(sessionKeys)] : void 0;
	if (selectedStatuses.length === 0 || selectedSessionKeys?.length === 0) return [];
	let query = getNodeSqliteKysely(database.db).selectFrom("session_nodes").selectAll().where("status", "in", selectedStatuses);
	if (selectedSessionKeys) query = query.where("session_key", "in", selectedSessionKeys);
	return executeSqliteQuerySync(database.db, query).rows.flatMap((row) => {
		const entry = parseSessionEntryJson(row);
		return entry ? [{
			entry,
			sessionKey: row.session_key
		}] : [];
	}).toSorted((a, b) => a.sessionKey.localeCompare(b.sessionKey));
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-entry-cache.ts
const sessionEntryCaches = /* @__PURE__ */ new WeakMap();
const sessionNodesGenerationTrackerSchemaVersions = /* @__PURE__ */ new WeakMap();
function readDataVersion(database) {
	const row = database.prepare("PRAGMA data_version").get();
	if (typeof row.data_version !== "number") throw new Error("SQLite did not return a numeric PRAGMA data_version");
	return row.data_version;
}
function ensureSessionNodesGenerationTracker(database) {
	const schemaRow = database.prepare("PRAGMA schema_version").get();
	if (typeof schemaRow.schema_version !== "number") throw new Error("SQLite did not return a numeric PRAGMA schema_version");
	const trackedSchemaVersion = sessionNodesGenerationTrackerSchemaVersions.get(database);
	if (trackedSchemaVersion === schemaRow.schema_version) return;
	database.exec(`
    CREATE TEMP TABLE IF NOT EXISTS openclaw_session_nodes_cache_generation (id INTEGER NOT NULL PRIMARY KEY CHECK (id = 1), generation INTEGER NOT NULL) STRICT;
    INSERT OR IGNORE INTO openclaw_session_nodes_cache_generation (id, generation) VALUES (1, 0);
    ${trackedSchemaVersion === void 0 ? "" : "UPDATE openclaw_session_nodes_cache_generation SET generation = generation + 1 WHERE id = 1;"}
    DROP TRIGGER IF EXISTS openclaw_session_nodes_cache_generation_insert;
    DROP TRIGGER IF EXISTS openclaw_session_nodes_cache_generation_update;
    DROP TRIGGER IF EXISTS openclaw_session_nodes_cache_generation_delete;
    CREATE TEMP TRIGGER openclaw_session_nodes_cache_generation_insert
      AFTER INSERT ON main.session_nodes BEGIN UPDATE openclaw_session_nodes_cache_generation SET generation = generation + 1 WHERE id = 1; END;
    CREATE TEMP TRIGGER openclaw_session_nodes_cache_generation_update
      AFTER UPDATE ON main.session_nodes BEGIN UPDATE openclaw_session_nodes_cache_generation SET generation = generation + 1 WHERE id = 1; END;
    CREATE TEMP TRIGGER openclaw_session_nodes_cache_generation_delete
      AFTER DELETE ON main.session_nodes BEGIN UPDATE openclaw_session_nodes_cache_generation SET generation = generation + 1 WHERE id = 1; END;
  `);
	sessionNodesGenerationTrackerSchemaVersions.set(database, schemaRow.schema_version);
}
function readSessionNodesGeneration(database) {
	ensureSessionNodesGenerationTracker(database);
	const row = database.prepare("SELECT generation FROM temp.openclaw_session_nodes_cache_generation WHERE id = 1").get();
	if (typeof row.generation !== "number") throw new Error("SQLite session_nodes cache generation is unavailable");
	return row.generation;
}
function readCacheValidityToken(database) {
	return {
		dataVersion: readDataVersion(database),
		sessionNodesGeneration: readSessionNodesGeneration(database)
	};
}
function cacheValidityTokensEqual(left, right) {
	return left.dataVersion === right.dataVersion && left.sessionNodesGeneration === right.sessionNodesGeneration;
}
/** Bracket one accessor-owned row write so its publication cannot hide earlier raw DML. */
function trackSessionEntryCacheWrite(database, write) {
	const before = sessionEntryCaches.has(database.db) ? readSessionNodesGeneration(database.db) : void 0;
	write();
	return before === void 0 ? void 0 : {
		before,
		after: readSessionNodesGeneration(database.db)
	};
}
function loadSessionEntrySnapshot(database, projection = "list") {
	const rows = iterateSqliteQuerySync(database.db, selectSessionEntryRows(database, projection).select("updated_at").orderBy("session_key"));
	const parsedEntries = /* @__PURE__ */ new Map();
	const keys = [];
	for (const row of rows) {
		keys.push(row.session_key);
		const entry = parseSessionEntryJson(row, projection);
		if (!entry) continue;
		parsedEntries.set(row.session_key, entry);
	}
	return {
		entries: projectSqliteSessionParticipantsBatch(database.db, parsedEntries),
		keys
	};
}
function readSessionEntryCache(database, options) {
	if (!options.cache || options.latest || options.projection === "full" || database.db.isTransaction) return loadSessionEntrySnapshot(database, options.projection);
	const validityToken = readCacheValidityToken(database.db);
	const cached = sessionEntryCaches.get(database.db);
	if (cached && cacheValidityTokensEqual(cached.validityToken, validityToken)) return cached;
	const next = {
		...loadSessionEntrySnapshot(database),
		validityToken
	};
	sessionEntryCaches.set(database.db, next);
	return next;
}
function publishTrackedCacheUpdate(database, publish) {
	if (deferOpenClawAgentPostCommitPublication(database, publish)) return;
	if (database.db.isTransaction) throw new Error("SQLite session entry writes must use runOpenClawAgentWriteTransaction for cache publication");
	publish();
}
function publishSqliteSessionEntryCacheUpsert(database, update, writeGeneration) {
	const { sessionKey } = update;
	const { skillsSnapshot: _skills, systemPromptReport: _report, ...metadata } = update.entry;
	const ownerRow = hasSqliteSessionOwnerColumns(database.db) ? executeSqliteQuerySync(database.db, getSessionKysely(database.db).selectFrom("session_nodes").select([
		"owner_actor_type",
		"owner_actor_id",
		"owner_assigned_by_type",
		"owner_assigned_by_id",
		"owner_assigned_at"
	]).where("session_key", "=", sessionKey).limit(1)).rows[0] : void 0;
	const parsedEntry = parseSessionEntryJson({
		entry_json: JSON.stringify(metadata),
		...ownerRow
	});
	if (!parsedEntry) {
		publishTrackedCacheUpdate(database, () => sessionEntryCaches.delete(database.db));
		return;
	}
	const entry = projectSqliteSessionParticipants(database.db, sessionKey, parsedEntry);
	publishTrackedCacheUpdate(database, () => {
		const cached = sessionEntryCaches.get(database.db);
		if (!cached) return;
		const generationIsContinuous = cached.validityToken.sessionNodesGeneration === writeGeneration.before;
		if (!cached.entries.has(sessionKey) && !cached.keys.includes(sessionKey)) cached.keys = [...cached.keys, sessionKey].toSorted();
		cached.entries.set(sessionKey, entry);
		if (generationIsContinuous) cached.validityToken = {
			...cached.validityToken,
			sessionNodesGeneration: writeGeneration.after
		};
	});
}
function publishSessionEntryCacheInvalidation(database, update, writeGeneration) {
	if (update && writeGeneration) {
		publishSqliteSessionEntryCacheUpsert(database, update, writeGeneration);
		return;
	}
	publishTrackedCacheUpdate(database, () => sessionEntryCaches.delete(database.db));
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-normalize.ts
function createFallbackSessionEntry(patch) {
	const now = Date.now();
	return {
		sessionId: patch.sessionId ?? randomUUID(),
		updatedAt: patch.updatedAt ?? now,
		...patch
	};
}
function normalizeText(value) {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}
function normalizeSessionRowChatType(value) {
	if (value === "direct" || value === "group" || value === "channel") return value;
	return null;
}
function coerceSqliteNumber(value) {
	return typeof value === "bigint" ? Number(value) : value;
}
//#endregion
//#region src/config/sessions/session-canonical-key.ts
const SESSION_CANONICAL_KEY_REPAIR_COMMAND = "openclaw doctor --fix";
const validatedDatabases = /* @__PURE__ */ new WeakSet();
/* OPENCLAW_CANONICAL_SCAN_PATH_CACHE_V1 */
const validatedDatabasePaths = /* @__PURE__ */ new Map();
function sharesCanonicalValidationByPath(database) {
	return typeof database.path === "string" && database.path !== "" && database.path !== ":memory:" && process.env.OPENCLAW_CANONICAL_SCAN_PATH_CACHE !== "0";
}
var SessionCanonicalKeyMigrationRequiredError = class extends Error {
	constructor(detail) {
		super(`${detail}; stop the Gateway and run ${SESSION_CANONICAL_KEY_REPAIR_COMMAND}`);
		this.code = "SESSION_CANONICAL_KEY_MIGRATION_REQUIRED";
		this.name = "SessionCanonicalKeyMigrationRequiredError";
	}
};
function isCanonicalSessionKey(sessionKey) {
	const trimmed = sessionKey.trim();
	if (!trimmed || sessionKey !== trimmed) return false;
	if (normalizeStoreSessionKey(sessionKey) !== sessionKey) return false;
	const parsed = parseAgentSessionKey(trimmed);
	return trimmed === "global" || trimmed === "unknown" || parsed !== null && trimmed.startsWith(`agent:${parsed.agentId}:`);
}
function assertCanonicalSessionKeyWrite(sessionKey, expectedAgentId) {
	const parsed = parseAgentSessionKey(sessionKey);
	if (!isCanonicalSessionKey(sessionKey) || expectedAgentId && parsed && parsed.agentId !== normalizeAgentId(expectedAgentId)) throw canonicalSessionKeyMigrationRequiredError(`refusing non-canonical session key write ${sessionKey}`);
}
function readCanonicalSessionMainKey(database) {
	const db = getNodeSqliteKysely(database.db);
	return normalizeMainKey(executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_key_contract").select("main_key").where("id", "=", 1))?.main_key);
}
function assertCanonicalSessionMainKeyWrite(sessionKey, mainKey) {
	if (parseAgentSessionKey(sessionKey)?.rest === "main" && mainKey !== "main") throw canonicalSessionKeyMigrationRequiredError(`refusing non-canonical session key write ${sessionKey}`);
}
function assertCanonicalSessionEntryLineageWrite(database, entry) {
	const sessionKeys = [
		entry.parentSessionKey,
		entry.spawnedBy,
		entry.forkSource?.sessionKey
	].filter((sessionKey) => sessionKey !== void 0);
	if (sessionKeys.length === 0) return;
	const mainKey = readCanonicalSessionMainKey(database);
	for (const sessionKey of sessionKeys) {
		assertCanonicalSessionKeyWrite(sessionKey);
		assertCanonicalSessionMainKeyWrite(sessionKey, mainKey);
	}
}
function assertCanonicalSessionKeyWriteMatchesDatabase(database, sessionKey) {
	assertCanonicalSessionKeyWrite(sessionKey);
	assertCanonicalSessionMainKeyWrite(sessionKey, readCanonicalSessionMainKey(database));
}
function canonicalSessionKeyMigrationRequiredError(detail) {
	return new SessionCanonicalKeyMigrationRequiredError(detail);
}
function scanCanonicalSqliteSessionEntries(database, visit, mainKey) {
	const db = getNodeSqliteKysely(database.db);
	const storedMainKey = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_key_contract").select("main_key").where("id", "=", 1))?.main_key;
	const canonicalMainKey = normalizeMainKey(mainKey ?? storedMainKey);
	// Validation needs identity, lineage and delivery proof, not the potentially
	// large skills catalog or prompt report (the same two fields omitted by the
	// native metadata projection). SQLite still validates the entire JSON document;
	// invalid/sentinel rows and visitor reads keep their original bytes. All
	// native row checks below remain unchanged and still visit every row.
	const entryJson = visit === void 0 && process.env.OPENCLAW_CANONICAL_SCAN_LEAN !== "0"
		? sql`CASE WHEN session_nodes.entry_valid = 1 AND typeof(session_nodes.entry_json) = 'text' AND json_valid(session_nodes.entry_json)
			THEN json_remove(session_nodes.entry_json, '$.skillsSnapshot', '$.systemPromptReport')
			ELSE session_nodes.entry_json END`.as("entry_json")
		: "session_nodes.entry_json";
	let count = 0;
	for (const row of iterateSqliteQuerySync(database.db, db.selectFrom("session_nodes").leftJoin("session_windows as retained_window", (join) => join.onRef("retained_window.session_id", "=", "session_nodes.current_session_id").onRef("retained_window.session_key", "=", "session_nodes.session_key")).select([
		"session_nodes.session_key",
		"session_nodes.current_session_id",
		entryJson,
		"session_nodes.entry_valid",
		"session_nodes.fork_source_session_key",
		"session_nodes.parent_session_key",
		"session_nodes.spawned_by",
		"retained_window.session_id as retained_window_id"
	]).orderBy("session_nodes.session_key"))) {
		if (row.entry_json === "{}" && row.entry_valid === -1 && row.retained_window_id === row.current_session_id) continue;
		if (row.entry_valid !== 1) throw canonicalSessionKeyMigrationRequiredError(`invalid persisted session row requires repair for ${row.session_key}`);
		const record = parseSqliteSessionEntryRecord(row);
		if (!record) throw canonicalSessionKeyMigrationRequiredError(`invalid persisted session row requires repair for ${row.session_key}`);
		const entry = projectCanonicalSessionEntryShape(record);
		if ((row.parent_session_key ?? void 0) !== (entry.parentSessionKey ?? entry.spawnedBy ?? void 0) || (row.spawned_by ?? void 0) !== (entry.spawnedBy ?? void 0) || (row.fork_source_session_key ?? void 0) !== (entry.forkSource?.sessionKey ?? void 0)) throw canonicalSessionKeyMigrationRequiredError(`invalid persisted session row requires repair for ${row.session_key}`);
		const deliveryCanonicalKey = resolveDeliveryProvenCanonicalSessionKey(row.session_key, entry);
		if (deliveryCanonicalKey !== row.session_key) throw canonicalSessionKeyMigrationRequiredError(`non-canonical persisted row resolves to session key ${deliveryCanonicalKey}`);
		const trimmed = row.session_key.trim();
		const parsed = parseAgentSessionKey(trimmed);
		if (row.session_key !== trimmed || normalizeStoreSessionKey(trimmed) !== trimmed || !parsed && trimmed !== "global" && trimmed !== "unknown" || parsed && parsed.rest === "main" && canonicalMainKey !== "main") throw canonicalSessionKeyMigrationRequiredError(`non-canonical persisted row resolves to session key ${trimmed || row.session_key}`);
		for (const lineageKey of [
			row.parent_session_key,
			row.spawned_by,
			row.fork_source_session_key
		]) {
			if (!lineageKey) continue;
			const normalized = normalizeStoreSessionKey(lineageKey);
			const lineageParsed = parseAgentSessionKey(normalized);
			if (normalized !== lineageKey || !lineageParsed && normalized !== "global" && normalized !== "unknown" || lineageParsed?.rest === "main" && canonicalMainKey !== "main") throw canonicalSessionKeyMigrationRequiredError(`non-canonical persisted row resolves to session key ${normalized || lineageKey}`);
		}
		visit?.({
			entry,
			sessionKey: row.session_key
		});
		count += 1;
	}
	validatedDatabases.add(database.db);
	if (sharesCanonicalValidationByPath(database)) validatedDatabasePaths.set(database.path, canonicalMainKey);
	return count;
}
function assertCanonicalSqliteSessionKeysCurrent(database, mainKey) {
	if (validatedDatabases.has(database.db)) return;
	if (sharesCanonicalValidationByPath(database) && validatedDatabasePaths.has(database.path)) {
		const storedMainKey = executeSqliteQueryTakeFirstSync(database.db, getNodeSqliteKysely(database.db).selectFrom("session_key_contract").select("main_key").where("id", "=", 1))?.main_key;
		if (validatedDatabasePaths.get(database.path) === normalizeMainKey(mainKey ?? storedMainKey)) {
			validatedDatabases.add(database.db);
			return;
		}
	}
	scanCanonicalSqliteSessionEntries(database, void 0, mainKey);
}
function setCanonicalSqliteSessionMainKey(database, mainKey) {
	const canonicalMainKey = normalizeMainKey(mainKey);
	const db = getNodeSqliteKysely(database.db);
	if (executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_key_contract").select("main_key").where("id", "=", 1))?.main_key === canonicalMainKey) return;
	executeSqliteQuerySync(database.db, db.insertInto("session_key_contract").values({
		id: 1,
		main_key: canonicalMainKey,
		updated_at: Date.now()
	}).onConflict((conflict) => conflict.column("id").doUpdateSet({
		main_key: canonicalMainKey,
		updated_at: Date.now()
	})));
	validatedDatabases.delete(database.db);
	if (typeof database.path === "string") validatedDatabasePaths.delete(database.path);
}
/** Checks the startup contract without joining the writable database lifecycle. */
function isCanonicalSqliteSessionMainKeyCurrent(options, mainKey) {
	const canonicalMainKey = normalizeMainKey(mainKey);
	const result = withOpenClawAgentDatabaseReadOnly((database) => {
		const db = getNodeSqliteKysely(database.db);
		if (executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("schema_meta").select("schema_version").where("meta_key", "=", "primary"))?.schema_version !== 19) return false;
		return executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_key_contract").select("main_key").where("id", "=", 1))?.main_key === canonicalMainKey;
	}, options);
	return result.found && result.value;
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-transcript-state.ts
function createTranscriptGeneration() {
	return randomUUID().replaceAll("-", "");
}
/** Read the current raw transcript generation inside the caller's transaction. */
function readTranscriptGenerationInTransaction(database, sessionId) {
	const db = getSessionKysely(database.db);
	return executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_rewrite_watermarks").select("generation").where("session_id", "=", sessionId))?.generation;
}
/** Materialize a generation once; pure appends must preserve an existing token. */
function ensureTranscriptGenerationInTransaction(database, sessionId) {
	const db = getSessionKysely(database.db);
	const generation = createTranscriptGeneration();
	executeSqliteQuerySync(database.db, db.insertInto("transcript_rewrite_watermarks").values({
		session_id: sessionId,
		generation,
		updated_at: Date.now()
	}).onConflict((conflict) => conflict.column("session_id").doNothing()));
	return readTranscriptGenerationInTransaction(database, sessionId) ?? generation;
}
/** Rotate the watermark in the same transaction as destructive transcript replacement. */
function rotateTranscriptGenerationInTransaction(database, sessionId) {
	const db = getSessionKysely(database.db);
	const generation = createTranscriptGeneration();
	executeSqliteQuerySync(database.db, db.insertInto("transcript_rewrite_watermarks").values({
		session_id: sessionId,
		generation,
		updated_at: Date.now()
	}).onConflict((conflict) => conflict.column("session_id").doUpdateSet({
		generation,
		updated_at: Date.now()
	})));
	return generation;
}
function ensureTranscriptSessionRoot(database, scope, updatedAt, options = {}) {
	const db = getSessionKysely(database.db);
	if (!options.allowStoredAlias) {
		assertCanonicalSqliteSessionKeysCurrent(database);
		assertCanonicalSessionKeyWriteMatchesDatabase(database, scope.sessionKey);
		const persistedSessionKey = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_windows").select("session_key").where("session_id", "=", scope.sessionId))?.session_key;
		if (persistedSessionKey && persistedSessionKey !== scope.sessionKey) throw new Error(`Transcript session ${scope.sessionId} is owned by ${persistedSessionKey}, not ${scope.sessionKey}; resolve the transcript target again before retrying.`);
		const lookupKeys = uniqueStrings([scope.sessionKey, ...foldedSessionKeyAliasCandidates(normalizeStoreSessionKey(scope.sessionKey))]);
		const candidates = executeSqliteQuerySync(database.db, db.selectFrom("session_nodes").select([
			"current_session_id",
			"entry_json",
			"entry_valid",
			"session_key",
			"updated_at"
		]).where("session_key", "in", lookupKeys)).rows;
		for (const candidate of candidates) {
			const entry = parseSessionEntryJson(candidate);
			if (!entry) {
				if (!(candidate.entry_json === "{}" ? executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_windows").select("session_id").where("session_id", "=", candidate.current_session_id).where("session_key", "=", candidate.session_key)) : void 0)) throw canonicalSessionKeyMigrationRequiredError(`invalid persisted session row requires repair for ${candidate.session_key}`);
				continue;
			}
			if (resolveDeliveryProvenCanonicalSessionKey(candidate.session_key, entry) !== candidate.session_key) throw canonicalSessionKeyMigrationRequiredError(`non-canonical persisted row resolves to session key ${candidate.session_key}`);
		}
		const existing = candidates.find((candidate) => candidate.session_key === scope.sessionKey);
		if (existing && existing.entry_valid !== 1) {
			if (!(existing.entry_json === "{}" ? executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_windows").select("session_id").where("session_id", "=", existing.current_session_id).where("session_key", "=", scope.sessionKey)) : void 0)) throw canonicalSessionKeyMigrationRequiredError(`invalid persisted session row requires repair for ${scope.sessionKey}`);
		}
	}
	if ((executeSqliteQuerySync(database.db, db.insertInto("session_nodes").values({
		session_key: scope.sessionKey,
		current_session_id: scope.sessionId,
		entry_json: "{}",
		entry_valid: -1,
		updated_at: updatedAt
	}).onConflict((conflict) => conflict.column("session_key").doNothing())).numAffectedRows ?? 0n) > 0n) {
		executeSqliteQuerySync(database.db, db.updateTable("session_nodes").set({ entry_valid: -1 }).where("session_key", "=", scope.sessionKey));
		publishSessionEntryCacheInvalidation(database);
	}
	executeSqliteQuerySync(database.db, db.insertInto("session_windows").values({
		session_id: scope.sessionId,
		session_key: scope.sessionKey,
		previous_session_id: null,
		reason: null,
		session_scope: "conversation",
		created_at: updatedAt,
		updated_at: updatedAt
	}).onConflict((conflict) => conflict.column("session_id").doUpdateSet({ updated_at: updatedAt })));
}
function readNextTranscriptSeq(database, sessionId) {
	const db = getSessionKysely(database.db);
	const row = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_events").select((eb) => eb.fn.max("seq").as("max_seq")).where("session_id", "=", sessionId));
	return (row?.max_seq === null || row?.max_seq === void 0 ? -1 : coerceSqliteNumber(row.max_seq)) + 1;
}
function normalizeTranscriptMutationAtMs(value) {
	const timestamp = Math.floor(value);
	return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : void 0;
}
function readTranscriptMutationStateInTransaction(database, sessionId) {
	const db = getSessionKysely(database.db);
	const row = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_windows").select(["transcript_observed_at", "transcript_updated_at"]).where("session_id", "=", sessionId));
	return {
		observedAt: row?.transcript_observed_at ?? null,
		updatedAt: row?.transcript_updated_at ?? null
	};
}
function advanceTranscriptMutationAtInTransaction(database, sessionId, value, options = {}) {
	const transcriptUpdatedAt = normalizeTranscriptMutationAtMs(value);
	if (transcriptUpdatedAt === void 0) return;
	const state = readTranscriptMutationStateInTransaction(database, sessionId);
	const next = options.strictly ? Math.max(transcriptUpdatedAt, (state.updatedAt ?? -1) + 1, (state.observedAt ?? -1) + 1) : Math.max(transcriptUpdatedAt, state.updatedAt ?? 0);
	if (state.updatedAt !== null && state.updatedAt >= next) return;
	const db = getSessionKysely(database.db);
	executeSqliteQuerySync(database.db, db.updateTable("session_windows").set({ transcript_updated_at: next }).where("session_id", "=", sessionId));
}
function touchTranscriptMutationInTransaction(database, sessionId) {
	const now = normalizeTranscriptMutationAtMs(Date.now());
	if (now !== void 0) advanceTranscriptMutationAtInTransaction(database, sessionId, now, { strictly: true });
}
function deleteTranscriptEventsInTransaction(database, sessionId) {
	const db = getSessionKysely(database.db);
	executeSqliteQuerySync(database.db, db.deleteFrom("transcript_event_identities").where("session_id", "=", sessionId));
	return (executeSqliteQuerySync(database.db, db.deleteFrom("transcript_events").where("session_id", "=", sessionId)).numAffectedRows ?? 0n) > 0n;
}
//#endregion
export { sessionEntryMetadataJson as A, readSessionEntryCache as C, readSessionEntriesByStatus as D, parseSessionEntryJson as E, hasSqliteSessionOwnerColumns as F, projectSqliteSessionOwner as I, projectSqliteSessionParticipants as M, mergeParticipantAggregate as N, selectSessionEntryRows as O, participantIdentityNamespace as P, publishSessionEntryCacheInvalidation as S, normalizeStatus as T, setCanonicalSqliteSessionMainKey as _, readNextTranscriptSeq as a, normalizeSessionRowChatType as b, rotateTranscriptGenerationInTransaction as c, assertCanonicalSessionKeyWrite as d, assertCanonicalSessionKeyWriteMatchesDatabase as f, scanCanonicalSqliteSessionEntries as g, isCanonicalSqliteSessionMainKeyCurrent as h, ensureTranscriptSessionRoot as i, listSessionParticipantsReadOnly as j, sessionEntryInventoryJson as k, touchTranscriptMutationInTransaction as l, canonicalSessionKeyMigrationRequiredError as m, deleteTranscriptEventsInTransaction as n, readTranscriptGenerationInTransaction as o, assertCanonicalSqliteSessionKeysCurrent as p, ensureTranscriptGenerationInTransaction as r, readTranscriptMutationStateInTransaction as s, advanceTranscriptMutationAtInTransaction as t, assertCanonicalSessionEntryLineageWrite as u, coerceSqliteNumber as v, trackSessionEntryCacheWrite as w, normalizeText as x, createFallbackSessionEntry as y };
