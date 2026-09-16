import { D as resolveExpiresAtMsFromDurationMs } from "./number-coercion-CLj0HTDM.js";
import { n as requireNodeSqlite, s as isSqliteCorruptionError, u as runSqliteImmediateTransactionSync } from "./node-sqlite-CL-d6drd.js";
import { i as getNodeSqliteKysely, n as executeSqliteQuerySync, r as executeSqliteQueryTakeFirstSync } from "./kysely-sync-DKYGT267.js";
import { i as isSqliteSchemaVersionError } from "./sqlite-user-version-DkmzAA6V.js";
import { a as isOpenClawStateDatabaseOpen, n as closeOpenClawStateDatabase } from "./openclaw-state-db-cache-AunrvrzG.js";
import { o as resolveOpenClawStateSqlitePath } from "./openclaw-state-db.paths-Dwj4ZWNN.js";
import { n as withExistingOpenClawStateDatabaseReadOnly } from "./openclaw-state-db-readonly-C7txILW9.js";
import { i as isTerminalSqliteIntegrityError } from "./sqlite-integrity-BBPyeEpy.js";
import { i as openOpenClawStateDatabase, s as runOpenClawStateWriteTransaction, wt as normalizeSqliteNumber } from "./openclaw-state-db-Bh3Bq87y.js";
import { n as ok, t as err } from "./result-BQGgYouL.js";
//#region src/plugin-state/plugin-state-store.types.ts
/** Typed error thrown for plugin-state validation and sqlite failures. */
var PluginStateStoreError = class extends Error {
	constructor(message, options) {
		super(message, { cause: options.cause });
		this.name = "PluginStateStoreError";
		this.code = options.code;
		this.operation = options.operation;
		if (options.path) this.path = options.path;
	}
};
//#endregion
//#region src/plugin-state/plugin-state-store.sqlite.ts
const MAX_PLUGIN_STATE_VALUE_BYTES = 1048576;
const MAX_PLUGIN_STATE_ENTRIES_PER_PLUGIN = 5e4;
const PLUGIN_STATE_EXPIRY_BATCH_ROWS = 1024;
let maxPluginStateEntriesPerPluginForTests;
let cachedDatabase = null;
function createPluginStateError(params) {
	return new PluginStateStoreError(params.message, {
		code: params.code,
		operation: params.operation,
		...params.path ? { path: params.path } : {},
		cause: params.cause
	});
}
function resolvePluginStateExpiresAtMs(params) {
	if (params.ttlMs == null) return null;
	const expiresAt = resolveExpiresAtMsFromDurationMs(params.ttlMs, { nowMs: params.now });
	if (expiresAt === void 0) throw createPluginStateError({
		code: "PLUGIN_STATE_INVALID_INPUT",
		operation: params.operation,
		message: "Plugin state ttlMs cannot produce a valid expiry timestamp.",
		...params.path ? { path: params.path } : {}
	});
	return expiresAt;
}
function wrapPluginStateError(error, operation, fallbackCode, message, pathname = resolveOpenClawStateSqlitePath(process.env)) {
	if (error instanceof PluginStateStoreError) return error;
	let publicMessage = message;
	if (fallbackCode === "PLUGIN_STATE_OPEN_FAILED") {
		if (isSqliteSchemaVersionError(error)) publicMessage += "\nThe state database uses a newer schema. Run an OpenClaw build that supports it.";
		else if (error instanceof Error && isTerminalSqliteIntegrityError(error)) publicMessage += "\nDatabase integrity verification failed. Restore or repair the state database, then run openclaw doctor --fix.";
	}
	return createPluginStateError({
		code: fallbackCode,
		operation,
		message: publicMessage,
		path: pathname,
		cause: error
	});
}
function parseStoredJson(raw, operation) {
	try {
		return JSON.parse(raw);
	} catch (error) {
		throw createPluginStateError({
			code: "PLUGIN_STATE_CORRUPT",
			operation,
			message: "Plugin state entry contains corrupt JSON.",
			path: resolveOpenClawStateSqlitePath(process.env),
			cause: error
		});
	}
}
function rowToEntry(row, operation) {
	const expiresAt = normalizeSqliteNumber(row.expires_at);
	return {
		key: row.entry_key,
		value: parseStoredJson(row.value_json, operation),
		createdAt: normalizeSqliteNumber(row.created_at) ?? 0,
		...expiresAt != null ? { expiresAt } : {}
	};
}
function getPluginStateKysely(db) {
	return getNodeSqliteKysely(db);
}
function bindPluginStateEntry(params) {
	return {
		plugin_id: params.pluginId,
		namespace: params.namespace,
		entry_key: params.key,
		value_json: params.valueJson,
		created_at: params.createdAt,
		expires_at: params.expiresAt
	};
}
function upsertPluginStateEntry(db, row) {
	executeSqliteQuerySync(db, getPluginStateKysely(db).insertInto("plugin_state_entries").values(row).onConflict((conflict) => conflict.columns([
		"plugin_id",
		"namespace",
		"entry_key"
	]).doUpdateSet({
		value_json: (eb) => eb.ref("excluded.value_json"),
		created_at: (eb) => eb.ref("excluded.created_at"),
		expires_at: (eb) => eb.ref("excluded.expires_at")
	})));
}
function insertPluginStateEntryIfAbsent(db, row) {
	const result = executeSqliteQuerySync(db, getPluginStateKysely(db).insertInto("plugin_state_entries").orIgnore().values(row));
	return Number(result.numAffectedRows ?? 0) > 0;
}
function selectPluginStateEntry(db, params) {
	return executeSqliteQueryTakeFirstSync(db, getPluginStateKysely(db).selectFrom("plugin_state_entries").select([
		"plugin_id",
		"namespace",
		"entry_key",
		"value_json",
		"created_at",
		"expires_at"
	]).where("plugin_id", "=", params.pluginId).where("namespace", "=", params.namespace).where("entry_key", "=", params.key).where((eb) => eb.or([eb("expires_at", "is", null), eb("expires_at", ">", params.now)])));
}
function selectPluginStateEntries(db, params) {
	return executeSqliteQuerySync(db, getPluginStateKysely(db).selectFrom("plugin_state_entries").select([
		"plugin_id",
		"namespace",
		"entry_key",
		"value_json",
		"created_at",
		"expires_at"
	]).where("plugin_id", "=", params.pluginId).where("namespace", "=", params.namespace).where((eb) => eb.or([eb("expires_at", "is", null), eb("expires_at", ">", params.now)])).orderBy("created_at", "asc").orderBy("entry_key", "asc")).rows;
}
function selectPluginStateEntriesInKeyRange(db, params) {
	return executeSqliteQuerySync(db, getPluginStateKysely(db).selectFrom("plugin_state_entries").select([
		"plugin_id",
		"namespace",
		"entry_key",
		"value_json",
		"created_at",
		"expires_at"
	]).where("plugin_id", "=", params.pluginId).where("namespace", "=", params.namespace).where("entry_key", ">=", params.keyStartInclusive).where("entry_key", "<", params.keyEndExclusive).where((eb) => eb.or([eb("expires_at", "is", null), eb("expires_at", ">", params.now)])).orderBy("entry_key", params.order).limit(params.limit)).rows;
}
function deletePluginStateEntry(db, params) {
	const result = executeSqliteQuerySync(db, getPluginStateKysely(db).deleteFrom("plugin_state_entries").where("plugin_id", "=", params.pluginId).where("namespace", "=", params.namespace).where("entry_key", "=", params.key));
	return Number(result.numAffectedRows ?? 0);
}
function deleteExpiredPluginStateEntries(db, now, scope) {
	const kysely = getPluginStateKysely(db);
	let expiredEntries = kysely.selectFrom("plugin_state_entries").select([
		"plugin_id",
		"namespace",
		"entry_key"
	]).where("expires_at", "is not", null).where("expires_at", "<=", now);
	expiredEntries = scope ? expiredEntries.where("plugin_id", "=", scope.pluginId).where("namespace", "=", scope.namespace) : expiredEntries.orderBy("expires_at", "asc");
	const result = executeSqliteQuerySync(db, kysely.deleteFrom("plugin_state_entries").where((expression) => expression(expression.refTuple("plugin_id", "namespace", "entry_key"), "in", expiredEntries.limit(PLUGIN_STATE_EXPIRY_BATCH_ROWS).$asTuple("plugin_id", "namespace", "entry_key"))));
	return Number(result.numAffectedRows ?? 0);
}
function countLivePluginStateNamespaceEntries(db, params) {
	return countRow(executeSqliteQueryTakeFirstSync(db, getPluginStateKysely(db).selectFrom("plugin_state_entries").select((eb) => eb.fn.countAll().as("count")).where("plugin_id", "=", params.pluginId).where("namespace", "=", params.namespace).where((eb) => eb.or([eb("expires_at", "is", null), eb("expires_at", ">", params.now)]))));
}
function allocatePluginStateNamespaceCreatedAt(db, params) {
	const row = executeSqliteQueryTakeFirstSync(db, getPluginStateKysely(db).selectFrom("plugin_state_entries").select((eb) => eb.fn.max("created_at").as("max_created_at")).where("plugin_id", "=", params.pluginId).where("namespace", "=", params.namespace));
	const previous = normalizeSqliteNumber(row?.max_created_at ?? null);
	const next = previous === void 0 ? params.now : Math.max(params.now, previous + 1);
	if (!Number.isSafeInteger(next)) throw new RangeError("Plugin state namespace append order exhausted safe integer range");
	return next;
}
function countLivePluginStateEntries(db, params) {
	return countRow(executeSqliteQueryTakeFirstSync(db, getPluginStateKysely(db).selectFrom("plugin_state_entries").select((eb) => eb.fn.countAll().as("count")).where("plugin_id", "=", params.pluginId).where((eb) => eb.or([eb("expires_at", "is", null), eb("expires_at", ">", params.now)]))));
}
function deleteOldestPluginStateNamespaceEntries(db, params) {
	const keys = executeSqliteQuerySync(db, getPluginStateKysely(db).selectFrom("plugin_state_entries").select(["entry_key"]).where("plugin_id", "=", params.pluginId).where("namespace", "=", params.namespace).where("entry_key", "!=", params.protectedKey).where((eb) => eb.or([eb("expires_at", "is", null), eb("expires_at", ">", params.now)])).orderBy("created_at", "asc").orderBy("entry_key", "asc").limit(params.limit)).rows;
	for (const row of keys) deletePluginStateEntry(db, {
		pluginId: params.pluginId,
		namespace: params.namespace,
		key: row.entry_key
	});
	return keys.length;
}
function openPluginStateDatabase(operation = "open", options = {}) {
	const env = options.env ?? process.env;
	const pathname = resolveOpenClawStateSqlitePath(env);
	if (cachedDatabase && cachedDatabase.path === pathname && cachedDatabase.db.isOpen) return cachedDatabase;
	if (cachedDatabase && !cachedDatabase.db.isOpen) cachedDatabase = null;
	try {
		const database = openOpenClawStateDatabase(options);
		cachedDatabase = {
			db: database.db,
			path: database.path
		};
		return cachedDatabase;
	} catch (error) {
		throw wrapPluginStateError(error, operation, "PLUGIN_STATE_OPEN_FAILED", "Failed to open the plugin state database.", pathname);
	}
}
function isMissingPluginStateTableError(error) {
	return error instanceof Error && error.code === "ERR_SQLITE_ERROR" && error.message === "no such table: plugin_state_entries";
}
function hasStateTablesBeyondStartupCheckpoint(db) {
	return db.prepare("SELECT 1 FROM main.sqlite_schema WHERE type = 'table' AND name NOT IN ('schema_meta', 'state_leases') LIMIT 1").get() !== void 0;
}
/** Read plugin state without joining the shared writable database lifecycle. */
function withPluginStateDatabaseReadOnly(operationName, operation, options = {}) {
	const pathname = resolveOpenClawStateSqlitePath(options.env ?? process.env);
	let operationStarted = false;
	try {
		return withExistingOpenClawStateDatabaseReadOnly(({ db, path }) => {
			operationStarted = true;
			try {
				return operation({
					db,
					path
				});
			} catch (error) {
				if (isMissingPluginStateTableError(error)) {
					if (!hasStateTablesBeyondStartupCheckpoint(db)) return;
				}
				throw error;
			}
		}, options);
	} catch (error) {
		if (!operationStarted) throw wrapPluginStateError(error, operationName, "PLUGIN_STATE_OPEN_FAILED", "Failed to open the plugin state database.", pathname);
		throw error;
	}
}
function countRow(row) {
	const raw = row?.count ?? 0;
	return typeof raw === "bigint" ? Number(raw) : raw;
}
function envOptions(env) {
	return env ? { env } : {};
}
function runWriteTransaction(operation, write, options = {}) {
	const store = openPluginStateDatabase(operation, options);
	return runOpenClawStateWriteTransaction(() => {
		return write(store);
	}, options);
}
function readPluginStateRetention(db, params) {
	const row = executeSqliteQueryTakeFirstSync(db, getPluginStateKysely(db).selectFrom("plugin_state_entries").select((eb) => [
		eb.fn.countAll().as("plugin_count"),
		eb.fn.countAll().filterWhere("namespace", "=", params.namespace).as("namespace_count"),
		eb.fn.min("expires_at").as("next_expiry")
	]).where("plugin_id", "=", params.pluginId).where((eb) => eb.or([eb("expires_at", "is", null), eb("expires_at", ">", params.now)])));
	return {
		namespaceCount: Number(row?.namespace_count ?? 0),
		pluginCount: Number(row?.plugin_count ?? 0),
		nextExpiry: normalizeSqliteNumber(row?.next_expiry ?? null) ?? Infinity,
		now: params.now,
		sweepPending: true
	};
}
function enforcePostRegisterLimits(params) {
	if (params.overflowPolicy === "reject-new") return;
	const namespaceCount = params.retention?.namespaceCount ?? countLivePluginStateNamespaceEntries(params.store.db, {
		pluginId: params.pluginId,
		namespace: params.namespace,
		now: params.now
	});
	if (namespaceCount > params.maxEntries) {
		const deleted = deleteOldestPluginStateNamespaceEntries(params.store.db, {
			pluginId: params.pluginId,
			namespace: params.namespace,
			protectedKey: params.protectedKey,
			now: params.now,
			limit: namespaceCount - params.maxEntries
		});
		if (params.retention) {
			params.retention.namespaceCount -= deleted;
			params.retention.pluginCount -= deleted;
		}
	}
	if (params.enforcePluginLimit === false) return;
	const pluginCount = params.retention?.pluginCount ?? countLivePluginStateEntries(params.store.db, {
		pluginId: params.pluginId,
		now: params.now
	});
	const maxPluginEntries = resolveMaxPluginStateEntriesPerPlugin();
	if (pluginCount <= maxPluginEntries) return;
	const deleted = deleteOldestPluginStateNamespaceEntries(params.store.db, {
		pluginId: params.pluginId,
		namespace: params.namespace,
		protectedKey: params.protectedKey,
		now: params.now,
		limit: pluginCount - maxPluginEntries
	});
	if (params.retention) {
		params.retention.namespaceCount -= deleted;
		params.retention.pluginCount -= deleted;
	}
	if ((params.retention?.pluginCount ?? countLivePluginStateEntries(params.store.db, {
		pluginId: params.pluginId,
		now: params.now
	})) > maxPluginEntries) throw createPluginStateError({
		code: "PLUGIN_STATE_LIMIT_EXCEEDED",
		operation: "register",
		message: `Plugin state for ${params.pluginId} exceeds the ${maxPluginEntries} live row limit.`,
		path: params.store.path
	});
}
function assertCanInsertPluginStateEntry(params) {
	if (params.overflowPolicy !== "reject-new") return;
	if ((params.retention?.namespaceCount ?? countLivePluginStateNamespaceEntries(params.store.db, {
		pluginId: params.pluginId,
		namespace: params.namespace,
		now: params.now
	})) >= params.maxEntries) throw createPluginStateError({
		code: "PLUGIN_STATE_LIMIT_EXCEEDED",
		operation: "register",
		message: `Plugin state namespace ${params.namespace} for ${params.pluginId} reached its ${params.maxEntries}-row limit.`,
		path: params.store.path
	});
	const maxPluginEntries = resolveMaxPluginStateEntriesPerPlugin();
	if ((params.retention?.pluginCount ?? countLivePluginStateEntries(params.store.db, {
		pluginId: params.pluginId,
		now: params.now
	})) >= maxPluginEntries) throw createPluginStateError({
		code: "PLUGIN_STATE_LIMIT_EXCEEDED",
		operation: "register",
		message: `Plugin state for ${params.pluginId} reached the ${maxPluginEntries} live row limit.`,
		path: params.store.path
	});
}
function resolveMaxPluginStateEntriesPerPlugin() {
	return maxPluginStateEntriesPerPluginForTests ?? 5e4;
}
function registerPluginStateEntry(store, params, retention) {
	const now = Date.now();
	const expiresAt = resolvePluginStateExpiresAtMs({
		ttlMs: params.ttlMs,
		now,
		operation: "register",
		path: store.path
	});
	if (retention && (now < retention.now || now >= retention.nextExpiry)) Object.assign(retention, readPluginStateRetention(store.db, {
		...params,
		now
	}));
	if (!retention || retention.sweepPending) {
		const deleted = deleteExpiredPluginStateEntries(store.db, now, params);
		if (retention) retention.sweepPending = deleted === PLUGIN_STATE_EXPIRY_BATCH_ROWS;
	}
	const existing = selectPluginStateEntry(store.db, {
		pluginId: params.pluginId,
		namespace: params.namespace,
		key: params.key,
		now
	});
	if (!existing) assertCanInsertPluginStateEntry({
		store,
		pluginId: params.pluginId,
		namespace: params.namespace,
		maxEntries: params.maxEntries,
		overflowPolicy: params.overflowPolicy,
		now,
		retention
	});
	upsertPluginStateEntry(store.db, bindPluginStateEntry({
		pluginId: params.pluginId,
		namespace: params.namespace,
		key: params.key,
		valueJson: params.valueJson,
		createdAt: params.createdAtMs ?? now,
		expiresAt
	}));
	if (retention) {
		if (!existing) {
			retention.namespaceCount += 1;
			retention.pluginCount += 1;
		}
		retention.nextExpiry = Math.min(retention.nextExpiry, expiresAt ?? Infinity);
		retention.now = now;
	}
	enforcePostRegisterLimits({
		store,
		pluginId: params.pluginId,
		namespace: params.namespace,
		maxEntries: params.maxEntries,
		overflowPolicy: params.overflowPolicy,
		now,
		protectedKey: params.key,
		retention
	});
}
// Bounded native batches share retention only while the SQLite writer is held.
function pluginStateRegisterBatch(params, entries) {
	if (entries.length === 0) return;
	if (entries.length > 32) throw new RangeError("Plugin state batch exceeds 32 rows");
	try {
		runWriteTransaction("register", (store) => {
			const retention = readPluginStateRetention(store.db, { ...params, now: Date.now() });
			for (const entry of entries) registerPluginStateEntry(store, { ...params, ...entry }, retention);
		}, envOptions(params.env));
	} catch (error) {
		throw wrapPluginStateError(error, "register", "PLUGIN_STATE_WRITE_FAILED", "Failed to register plugin state batch.");
	}
}
// One batch per event-loop turn, even when many callers await batches at once.
// A failed batch must not poison the queue. No writer lock spans this wait.
let pluginStateBatchTail = Promise.resolve();
function schedulePluginStateBatch(run) {
	const pending = pluginStateBatchTail.then(() => new Promise((resolve, reject) => {
		setImmediate(() => { try { resolve(run()); } catch (error) { reject(error); } });
	}));
	pluginStateBatchTail = pending.catch(() => {});
	return pending;
}
function pluginStateRegister(params) {
	try {
		runWriteTransaction("register", (store) => registerPluginStateEntry(store, params), envOptions(params.env));
	} catch (error) {
		throw wrapPluginStateError(error, "register", "PLUGIN_STATE_WRITE_FAILED", "Failed to register plugin state entry.");
	}
}
/** Prepared doctor rows only: validation and plugin-owned accessors run before BEGIN. */
function pluginStateImportBatch(params, entries) {
	if (entries.length === 0) return;
	if (entries.length > 500) throw new RangeError("Plugin state doctor import batch exceeds its row limit");
	try {
		const result = runWriteTransaction("register", (store) => {
			const retention = readPluginStateRetention(store.db, {
				...params,
				now: Date.now()
			});
			for (const entry of entries) try {
				runSqliteImmediateTransactionSync(store.db, () => registerPluginStateEntry(store, {
					...params,
					...entry
				}, retention));
			} catch (error) {
				if (isSqliteCorruptionError(error)) throw error;
				return err(error);
			}
			return ok(void 0);
		}, envOptions(params.env));
		if (!result.ok) throw result.error;
	} catch (error) {
		throw wrapPluginStateError(error, "register", "PLUGIN_STATE_WRITE_FAILED", "Failed to register plugin state entry.");
	}
}
function pluginStateRegisterSequencedJournalEntry(params) {
	try {
		return runWriteTransaction("register", (store) => {
			const now = Date.now();
			deleteExpiredPluginStateEntries(store.db, now, {
				pluginId: params.pluginId,
				namespace: params.cursorNamespace
			});
			deleteExpiredPluginStateEntries(store.db, now, {
				pluginId: params.pluginId,
				namespace: params.journalNamespace
			});
			const cursor = selectPluginStateEntry(store.db, {
				pluginId: params.pluginId,
				namespace: params.cursorNamespace,
				key: params.cursorKey,
				now
			});
			const cursorSequence = cursor ? params.readCursorSequence(cursor.value_json) : void 0;
			const sequence = Math.max(params.initialSequence, cursorSequence ?? 0) + 1;
			if (!Number.isSafeInteger(sequence)) throw new RangeError("Plugin state journal sequence exhausted safe integer range");
			const prepared = params.prepareEntry(sequence);
			if (selectPluginStateEntry(store.db, {
				pluginId: params.pluginId,
				namespace: params.journalNamespace,
				key: prepared.journalKey,
				now
			})) throw createPluginStateError({
				code: "PLUGIN_STATE_WRITE_FAILED",
				operation: "register",
				message: "Plugin state journal sequence already exists.",
				path: store.path
			});
			if (!cursor) assertCanInsertPluginStateEntry({
				store,
				pluginId: params.pluginId,
				namespace: params.cursorNamespace,
				maxEntries: params.cursorMaxEntries,
				overflowPolicy: "evict-oldest",
				now
			});
			assertCanInsertPluginStateEntry({
				store,
				pluginId: params.pluginId,
				namespace: params.journalNamespace,
				maxEntries: params.journalMaxEntries,
				overflowPolicy: "evict-oldest",
				now
			});
			upsertPluginStateEntry(store.db, bindPluginStateEntry({
				pluginId: params.pluginId,
				namespace: params.cursorNamespace,
				key: params.cursorKey,
				valueJson: prepared.cursorValueJson,
				createdAt: now,
				expiresAt: null
			}));
			enforcePostRegisterLimits({
				store,
				pluginId: params.pluginId,
				namespace: params.cursorNamespace,
				maxEntries: params.cursorMaxEntries,
				overflowPolicy: "evict-oldest",
				now,
				protectedKey: params.cursorKey,
				enforcePluginLimit: false
			});
			upsertPluginStateEntry(store.db, bindPluginStateEntry({
				pluginId: params.pluginId,
				namespace: params.journalNamespace,
				key: prepared.journalKey,
				valueJson: prepared.journalValueJson,
				createdAt: allocatePluginStateNamespaceCreatedAt(store.db, {
					pluginId: params.pluginId,
					namespace: params.journalNamespace,
					now
				}),
				expiresAt: null
			}));
			enforcePostRegisterLimits({
				store,
				pluginId: params.pluginId,
				namespace: params.journalNamespace,
				maxEntries: params.journalMaxEntries,
				overflowPolicy: "evict-oldest",
				now,
				protectedKey: prepared.journalKey
			});
			return sequence;
		}, envOptions(params.env));
	} catch (error) {
		throw wrapPluginStateError(error, "register", "PLUGIN_STATE_WRITE_FAILED", "Failed to register sequenced plugin state journal entry.");
	}
}
function pluginStateRegisterIfAbsent(params) {
	try {
		return runWriteTransaction("register", (store) => {
			const now = Date.now();
			const expiresAt = resolvePluginStateExpiresAtMs({
				ttlMs: params.ttlMs,
				now,
				operation: "register",
				path: store.path
			});
			deleteExpiredPluginStateEntries(store.db, now, {
				pluginId: params.pluginId,
				namespace: params.namespace
			});
			if (selectPluginStateEntry(store.db, {
				pluginId: params.pluginId,
				namespace: params.namespace,
				key: params.key,
				now
			})) return false;
			deletePluginStateEntry(store.db, params);
			assertCanInsertPluginStateEntry({
				store,
				pluginId: params.pluginId,
				namespace: params.namespace,
				maxEntries: params.maxEntries,
				overflowPolicy: params.overflowPolicy,
				now
			});
			if (!insertPluginStateEntryIfAbsent(store.db, bindPluginStateEntry({
				pluginId: params.pluginId,
				namespace: params.namespace,
				key: params.key,
				valueJson: params.valueJson,
				createdAt: now,
				expiresAt
			}))) return false;
			enforcePostRegisterLimits({
				store,
				pluginId: params.pluginId,
				namespace: params.namespace,
				maxEntries: params.maxEntries,
				overflowPolicy: params.overflowPolicy,
				now,
				protectedKey: params.key
			});
			return true;
		}, envOptions(params.env));
	} catch (error) {
		throw wrapPluginStateError(error, "register", "PLUGIN_STATE_WRITE_FAILED", "Failed to register plugin state entry.");
	}
}
function pluginStateUpdate(params) {
	try {
		return runWriteTransaction("register", (store) => {
			const now = Date.now();
			deleteExpiredPluginStateEntries(store.db, now, {
				pluginId: params.pluginId,
				namespace: params.namespace
			});
			const existing = selectPluginStateEntry(store.db, {
				pluginId: params.pluginId,
				namespace: params.namespace,
				key: params.key,
				now
			});
			const next = params.updateValueJson(existing ? parseStoredJson(existing.value_json, "lookup") : void 0);
			if (!next) return false;
			if (!existing) assertCanInsertPluginStateEntry({
				store,
				pluginId: params.pluginId,
				namespace: params.namespace,
				maxEntries: params.maxEntries,
				overflowPolicy: params.overflowPolicy,
				now
			});
			const expiresAt = resolvePluginStateExpiresAtMs({
				ttlMs: next.ttlMs,
				now,
				operation: "register",
				path: store.path
			});
			upsertPluginStateEntry(store.db, bindPluginStateEntry({
				pluginId: params.pluginId,
				namespace: params.namespace,
				key: params.key,
				valueJson: next.valueJson,
				createdAt: now,
				expiresAt
			}));
			enforcePostRegisterLimits({
				store,
				pluginId: params.pluginId,
				namespace: params.namespace,
				maxEntries: params.maxEntries,
				overflowPolicy: params.overflowPolicy,
				now,
				protectedKey: params.key
			});
			return true;
		}, envOptions(params.env));
	} catch (error) {
		throw wrapPluginStateError(error, "register", "PLUGIN_STATE_WRITE_FAILED", "Failed to update plugin state entry.");
	}
}
function pluginStateLookup(params) {
	const pathname = resolveOpenClawStateSqlitePath(params.env ?? process.env);
	try {
		return withPluginStateDatabaseReadOnly("lookup", ({ db }) => {
			const row = selectPluginStateEntry(db, {
				pluginId: params.pluginId,
				namespace: params.namespace,
				key: params.key,
				now: Date.now()
			});
			return row ? parseStoredJson(row.value_json, "lookup") : void 0;
		}, envOptions(params.env));
	} catch (error) {
		throw wrapPluginStateError(error, "lookup", "PLUGIN_STATE_READ_FAILED", "Failed to read plugin state entry.", pathname);
	}
}
function pluginStateConsume(params) {
	try {
		return runWriteTransaction("consume", (store) => {
			const row = selectPluginStateEntry(store.db, {
				pluginId: params.pluginId,
				namespace: params.namespace,
				key: params.key,
				now: Date.now()
			});
			if (!row) return;
			deletePluginStateEntry(store.db, params);
			return parseStoredJson(row.value_json, "consume");
		}, envOptions(params.env));
	} catch (error) {
		throw wrapPluginStateError(error, "consume", "PLUGIN_STATE_READ_FAILED", "Failed to consume plugin state entry.");
	}
}
function pluginStateDelete(params) {
	try {
		return runWriteTransaction("delete", ({ db }) => {
			return deletePluginStateEntry(db, params) > 0;
		}, envOptions(params.env));
	} catch (error) {
		throw wrapPluginStateError(error, "delete", "PLUGIN_STATE_WRITE_FAILED", "Failed to delete plugin state entry.");
	}
}
function pluginStateDeleteIf(params) {
	try {
		return runWriteTransaction("delete", ({ db }) => {
			const row = selectPluginStateEntry(db, {
				pluginId: params.pluginId,
				namespace: params.namespace,
				key: params.key,
				now: Date.now()
			});
			if (!row || !params.predicate(parseStoredJson(row.value_json, "delete"))) return false;
			return deletePluginStateEntry(db, params) > 0;
		}, envOptions(params.env));
	} catch (error) {
		throw wrapPluginStateError(error, "delete", "PLUGIN_STATE_WRITE_FAILED", "Failed to conditionally delete plugin state entry.");
	}
}
/** Deletes one bounded set of exact observed rows in a single synchronous transaction. */
function pluginStateDeleteEntriesIfUnchanged(params) {
	if (params.entries.length > 512) throw new RangeError(`Plugin state bulk deletion cannot exceed 512 entries.`);
	if (params.entries.length === 0) return {
		deleted: 0,
		changed: 0
	};
	const observed = params.entries.map(({ value: _value, ...entry }) => entry);
	return runWriteTransaction("delete", ({ db }) => {
		params.assertOwnedInTransaction(db);
		let deleted = 0;
		for (const entry of observed) {
			let query = getPluginStateKysely(db).deleteFrom("plugin_state_entries").where("plugin_id", "=", params.pluginId).where("namespace", "=", params.namespace).where("entry_key", "=", entry.key).where("value_json", "=", entry.valueJson).where("created_at", "=", entry.createdAt);
			query = entry.expiresAt === null ? query.where("expires_at", "is", null) : query.where("expires_at", "=", entry.expiresAt);
			deleted += Number(executeSqliteQuerySync(db, query).numAffectedRows ?? 0);
		}
		return {
			deleted,
			changed: observed.length - deleted
		};
	}, envOptions(params.env));
}
/** Doctor-only bounded raw read keeps malformed rows visible and preserves exact CAS bytes. */
function pluginStateDoctorEntriesInKeyRange(params) {
	if (!params.prefix || !Number.isSafeInteger(params.limit) || params.limit < 1 || params.limit > 512 || params.after !== void 0 && !params.after.startsWith(params.prefix)) throw new RangeError(`Plugin doctor state reads require a valid prefix and a limit of 1-512.`);
	return readPluginStateRowsInKeyRange({
		...params,
		keyStartInclusive: params.after === void 0 ? params.prefix : `${params.after}\0`,
		keyEndExclusive: `${params.prefix}\uffff`
	}, (row) => {
		const createdAt = normalizeSqliteNumber(row.created_at);
		const expiresAt = normalizeSqliteNumber(row.expires_at);
		const entry = {
			key: row.entry_key,
			valueJson: row.value_json,
			createdAt: createdAt ?? 0,
			expiresAt: expiresAt ?? null
		};
		if (!Number.isSafeInteger(createdAt) || (createdAt ?? -1) < 0 || row.expires_at !== null && !Number.isSafeInteger(expiresAt)) return entry;
		try {
			entry.value = JSON.parse(row.value_json);
		} catch {}
		return entry;
	});
}
function pluginStateEntries(params) {
	const pathname = resolveOpenClawStateSqlitePath(params.env ?? process.env);
	try {
		return withPluginStateDatabaseReadOnly("entries", ({ db }) => {
			return selectPluginStateEntries(db, {
				pluginId: params.pluginId,
				namespace: params.namespace,
				now: Date.now()
			}).map((row) => rowToEntry(row, "entries"));
		}, envOptions(params.env)) ?? [];
	} catch (error) {
		throw wrapPluginStateError(error, "entries", "PLUGIN_STATE_READ_FAILED", "Failed to list plugin state entries.", pathname);
	}
}
function pluginStateEntriesInKeyRange(params) {
	return readPluginStateRowsInKeyRange(params, (row) => rowToEntry(row, "entries"));
}
function readPluginStateRowsInKeyRange(params, mapRow) {
	if (!Number.isSafeInteger(params.limit) || params.limit < 1) throw createPluginStateError({
		code: "PLUGIN_STATE_INVALID_INPUT",
		operation: "entries",
		message: "Plugin state key-range limit must be a positive safe integer."
	});
	if (params.keyStartInclusive >= params.keyEndExclusive) throw createPluginStateError({
		code: "PLUGIN_STATE_INVALID_INPUT",
		operation: "entries",
		message: "Plugin state key range must have an increasing exclusive upper bound."
	});
	const pathname = resolveOpenClawStateSqlitePath(params.env ?? process.env);
	try {
		return withPluginStateDatabaseReadOnly("entries", ({ db }) => selectPluginStateEntriesInKeyRange(db, {
			pluginId: params.pluginId,
			namespace: params.namespace,
			keyStartInclusive: params.keyStartInclusive,
			keyEndExclusive: params.keyEndExclusive,
			limit: params.limit,
			order: params.order ?? "asc",
			now: Date.now()
		}).map(mapRow), envOptions(params.env)) ?? [];
	} catch (error) {
		throw wrapPluginStateError(error, "entries", "PLUGIN_STATE_READ_FAILED", "Failed to list plugin state entries by key range.", pathname);
	}
}
function pluginStateClear(params) {
	try {
		runWriteTransaction("clear", ({ db }) => {
			executeSqliteQuerySync(db, getPluginStateKysely(db).deleteFrom("plugin_state_entries").where("plugin_id", "=", params.pluginId).where("namespace", "=", params.namespace));
		}, envOptions(params.env));
	} catch (error) {
		throw wrapPluginStateError(error, "clear", "PLUGIN_STATE_WRITE_FAILED", "Failed to clear plugin state namespace.");
	}
}
function sweepExpiredPluginStateEntries() {
	try {
		return runWriteTransaction("sweep", ({ db }) => deleteExpiredPluginStateEntries(db, Date.now()));
	} catch (error) {
		throw wrapPluginStateError(error, "sweep", "PLUGIN_STATE_WRITE_FAILED", "Failed to sweep expired plugin state entries.");
	}
}
function clearPluginStateDatabaseForTests() {
	const store = openPluginStateDatabase("clear");
	executeSqliteQuerySync(store.db, getPluginStateKysely(store.db).deleteFrom("plugin_state_entries"));
}
function setMaxPluginStateEntriesPerPluginForTests(value) {
	maxPluginStateEntriesPerPluginForTests = value;
}
function countPluginStateLiveEntries(pluginId, env) {
	const pathname = resolveOpenClawStateSqlitePath(env ?? process.env);
	try {
		return withPluginStateDatabaseReadOnly("entries", ({ db }) => countLivePluginStateEntries(db, {
			pluginId,
			now: Date.now()
		}), envOptions(env)) ?? 0;
	} catch (error) {
		throw wrapPluginStateError(error, "entries", "PLUGIN_STATE_READ_FAILED", "Failed to count plugin state entries.", pathname);
	}
}
function getPluginStateCapacity(pluginId, env) {
	return {
		liveEntries: countPluginStateLiveEntries(pluginId, env),
		maxEntries: resolveMaxPluginStateEntriesPerPlugin()
	};
}
function seedPluginStateDatabaseEntriesForTests(entries) {
	if (entries.length === 0) return;
	const now = Date.now();
	runWriteTransaction("register", (store) => {
		for (const [index, entry] of entries.entries()) upsertPluginStateEntry(store.db, bindPluginStateEntry({
			pluginId: entry.pluginId,
			namespace: entry.namespace,
			key: entry.key,
			valueJson: entry.valueJson,
			createdAt: entry.createdAt ?? now + index,
			expiresAt: entry.expiresAt ?? null
		}));
	});
}
function probePluginStateStore() {
	const databasePath = resolveOpenClawStateSqlitePath(process.env);
	const steps = [];
	const wasOpen = cachedDatabase !== null;
	const stateWasOpen = isOpenClawStateDatabaseOpen();
	const pushOk = (name) => steps.push({
		name,
		ok: true
	});
	const pushFailure = (name, error) => {
		const wrapped = error instanceof PluginStateStoreError ? error : createPluginStateError({
			code: "PLUGIN_STATE_OPEN_FAILED",
			operation: "probe",
			message: error instanceof Error ? error.message : String(error),
			path: databasePath,
			cause: error
		});
		steps.push({
			name,
			ok: false,
			code: wrapped.code,
			message: wrapped.message
		});
	};
	try {
		requireNodeSqlite();
		pushOk("load-sqlite");
	} catch (error) {
		pushFailure("load-sqlite", createPluginStateError({
			code: "PLUGIN_STATE_SQLITE_UNAVAILABLE",
			operation: "load-sqlite",
			message: "SQLite support is unavailable for plugin state storage.",
			path: databasePath,
			cause: error
		}));
		return {
			ok: false,
			databasePath,
			steps
		};
	}
	try {
		openPluginStateDatabase("probe");
		pushOk("open");
		pushOk("schema");
		runWriteTransaction("probe", ({ db }) => {
			const now = Date.now();
			const expiresAt = resolvePluginStateExpiresAtMs({
				ttlMs: 6e4,
				now,
				operation: "probe",
				path: databasePath
			});
			upsertPluginStateEntry(db, bindPluginStateEntry({
				pluginId: "core:plugin-state-probe",
				namespace: "diagnostics",
				key: "probe",
				valueJson: JSON.stringify({ ok: true }),
				createdAt: now,
				expiresAt
			}));
			selectPluginStateEntry(db, {
				pluginId: "core:plugin-state-probe",
				namespace: "diagnostics",
				key: "probe",
				now
			});
			deletePluginStateEntry(db, {
				pluginId: "core:plugin-state-probe",
				namespace: "diagnostics",
				key: "probe"
			});
		});
		pushOk("write-read-delete");
		openOpenClawStateDatabase().walMaintenance.checkpoint();
		pushOk("checkpoint");
	} catch (error) {
		pushFailure("probe", error);
	} finally {
		if (!wasOpen && !stateWasOpen) closePluginStateDatabase();
	}
	return {
		ok: steps.every((step) => step.ok),
		databasePath,
		steps
	};
}
function closePluginStateDatabase() {
	cachedDatabase = null;
	closeOpenClawStateDatabase();
}
if (process.env.VITEST || false) globalThis[Symbol.for("openclaw.pluginStateSqliteTestApi")] = {
	probePluginStateStore,
	seedPluginStateDatabaseEntriesForTests,
	setMaxPluginStateEntriesPerPluginForTests
};
//#endregion
//#region src/plugin-state/plugin-store-validation.ts
const MAX_PLUGIN_STORE_NAMESPACE_BYTES = 128;
const MAX_PLUGIN_STORE_KEY_BYTES = 512;
const MAX_PLUGIN_STORE_JSON_BYTES = 65536;
const MAX_PLUGIN_STORE_JSON_DEPTH = 64;
const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9._-]*$/iu;
const textEncoder = new TextEncoder();
function createPluginStoreOptionPolicy(params) {
	const signatures = /* @__PURE__ */ new Map();
	return {
		resolveOverflowPolicy(value) {
			if (value === void 0 || value === "evict-oldest") return "evict-oldest";
			if (value === "reject-new") return value;
			throw params.invalid(`${params.label} overflowPolicy must be evict-oldest or reject-new`);
		},
		assertConsistent(pluginId, namespace, signature) {
			const key = `${pluginId}\0${namespace}`;
			const existing = signatures.get(key);
			if (!existing) {
				signatures.set(key, signature);
				return;
			}
			if (!(Object.entries(existing).every(([name, value]) => signature[name] === value) && Object.entries(signature).every(([name, value]) => existing[name] === value))) throw params.invalid(`${params.label} namespace ${namespace} for ${pluginId} was reopened with incompatible options`);
		},
		clear() {
			signatures.clear();
		}
	};
}
function assertMaxUtf8Bytes(params) {
	if (textEncoder.encode(params.value).byteLength > params.maxBytes) throw params.errors.invalid(`${params.label} must be <= ${params.maxBytes} bytes`);
}
function validatePluginStoreNamespace(params) {
	const trimmed = params.value.trim();
	if (!NAMESPACE_PATTERN.test(trimmed)) throw params.errors.invalid(`${params.label} namespace must be a safe path segment: ${params.value}`);
	assertMaxUtf8Bytes({
		label: `${params.label} namespace`,
		value: trimmed,
		maxBytes: MAX_PLUGIN_STORE_NAMESPACE_BYTES,
		errors: params.errors
	});
	return trimmed;
}
function validatePluginStoreKey(params) {
	const trimmed = params.value.trim();
	if (!trimmed) throw params.errors.invalid(`${params.label} entry key must not be empty`);
	assertMaxUtf8Bytes({
		label: `${params.label} entry key`,
		value: trimmed,
		maxBytes: MAX_PLUGIN_STORE_KEY_BYTES,
		errors: params.errors
	});
	return trimmed;
}
function validatePluginStorePositiveInteger(params) {
	if (!Number.isSafeInteger(params.value) || params.value < 1) throw params.errors.invalid(`${params.label} must be a positive safe integer`);
	return params.value;
}
function validateOptionalPluginStoreTtlMs(params) {
	const value = params.value;
	if (value == null) return;
	return validatePluginStorePositiveInteger({
		...params,
		value
	});
}
function assertPlainJsonValue(value, params) {
	if (params.depth > MAX_PLUGIN_STORE_JSON_DEPTH) throw params.errors.limit(`${params.label} nesting exceeds maximum depth of ${MAX_PLUGIN_STORE_JSON_DEPTH}`);
	if (value === null) return;
	const valueType = typeof value;
	if (valueType === "string" || valueType === "boolean") return;
	if (valueType === "number") {
		if (!Number.isFinite(value)) throw params.errors.invalid(`${params.label} at ${params.path} must be a finite number`);
		return;
	}
	if (valueType !== "object") throw params.errors.invalid(`${params.label} at ${params.path} must be JSON-serializable`);
	const objectValue = value;
	if (params.seen.has(objectValue)) throw params.errors.invalid(`${params.label} at ${params.path} must not contain circular references`);
	params.seen.add(objectValue);
	try {
		if (Array.isArray(value)) {
			for (let index = 0; index < value.length; index += 1) {
				if (!(index in value)) throw params.errors.invalid(`${params.label} array at ${params.path} must not be sparse`);
				assertPlainJsonValue(value[index], {
					...params,
					path: `${params.path}[${index}]`,
					depth: params.depth + 1
				});
			}
			return;
		}
		if (Object.getPrototypeOf(objectValue) !== Object.prototype) throw params.errors.invalid(`${params.label} object at ${params.path} must be a plain object`);
		const descriptorEntries = Object.entries(Object.getOwnPropertyDescriptors(objectValue));
		if (Object.getOwnPropertySymbols(objectValue).length > 0) throw params.errors.invalid(`${params.label} object at ${params.path} must not use symbol keys`);
		if (descriptorEntries.length !== Object.keys(objectValue).length) throw params.errors.invalid(`${params.label} object at ${params.path} must not use non-enumerable properties`);
		for (const [key, descriptor] of descriptorEntries) {
			if (descriptor.get || descriptor.set || !("value" in descriptor)) throw params.errors.invalid(`${params.label} object at ${params.path}.${key} must use data properties`);
			assertPlainJsonValue(descriptor.value, {
				...params,
				path: `${params.path}.${key}`,
				depth: params.depth + 1
			});
		}
	} finally {
		params.seen.delete(objectValue);
	}
}
function serializePluginStoreJson(params) {
	assertPlainJsonValue(params.value, {
		label: params.label,
		errors: params.errors,
		seen: /* @__PURE__ */ new WeakSet(),
		path: "value",
		depth: 0
	});
	const json = JSON.stringify(params.value);
	if (json === void 0) throw params.errors.invalid(`${params.label} must be JSON-serializable`);
	const maxBytes = params.maxBytes ?? MAX_PLUGIN_STORE_JSON_BYTES;
	if (textEncoder.encode(json).byteLength > maxBytes) throw params.errors.limit(`${params.label} exceeds ${maxBytes} byte limit`);
	return json;
}
//#endregion
//#region src/plugin-state/plugin-state-store.ts
function invalidInput(message, operation = "register") {
	return new PluginStateStoreError(message, {
		code: "PLUGIN_STATE_INVALID_INPUT",
		operation
	});
}
function validateNamespace(value, operation = "open") {
	return validatePluginStoreNamespace({
		value,
		label: "plugin state",
		errors: {
			invalid: (message) => invalidInput(message, operation),
			limit: (message) => invalidInput(message, operation)
		}
	});
}
function validateKey(value, operation = "register") {
	return validatePluginStoreKey({
		value,
		label: "plugin state",
		errors: {
			invalid: (message) => invalidInput(message, operation),
			limit: (message) => invalidInput(message, operation)
		}
	});
}
function validateMaxEntries(value) {
	if (!Number.isInteger(value) || value < 1) throw invalidInput("plugin state maxEntries must be an integer >= 1", "open");
	return value;
}
const optionPolicy = createPluginStoreOptionPolicy({
	label: "plugin state",
	invalid: (message) => invalidInput(message, "open")
});
function validateOptionalTtlMs(value, operation = "register") {
	return validateOptionalPluginStoreTtlMs({
		value,
		label: "plugin state ttlMs",
		errors: {
			invalid: (message) => invalidInput(message, operation),
			limit: (message) => invalidInput(message, operation)
		}
	});
}
function prepareRegisterParams(key, value, defaultTtlMs, opts) {
	const normalizedKey = validateKey(key, "register");
	const json = serializePluginStoreJson({
		value,
		label: "plugin state value",
		maxBytes: MAX_PLUGIN_STATE_VALUE_BYTES,
		errors: {
			invalid: (message) => invalidInput(message, "register"),
			limit: (message) => new PluginStateStoreError(message, {
				code: "PLUGIN_STATE_LIMIT_EXCEEDED",
				operation: "register"
			})
		}
	});
	const ttlMs = validateOptionalTtlMs(opts?.ttlMs, "register") ?? defaultTtlMs;
	return {
		key: normalizedKey,
		valueJson: json,
		...ttlMs != null ? { ttlMs } : {}
	};
}
function createKeyedStoreForPluginId(pluginId, options) {
	const store = createSyncKeyedStoreForPluginId(pluginId, options);
	return {
		register: async (...args) => store.register(...args),
		// Each chunk is atomic; earlier committed chunks remain if a later one fails.
		async registerMany(entries) {
			if (!Array.isArray(entries)) throw invalidInput("plugin state batch must be an array");
			for (let offset = 0; offset < entries.length; offset += 32) {
				const batch = entries.slice(offset, offset + 32);
				await schedulePluginStateBatch(() => store.registerMany(batch));
			}
		},
		registerIfAbsent: async (...args) => store.registerIfAbsent(...args),
		update: async (...args) => store.update(...args),
		deleteIf: async (...args) => store.deleteIf(...args),
		lookup: async (...args) => store.lookup(...args),
		consume: async (...args) => store.consume(...args),
		delete: async (...args) => store.delete(...args),
		entries: async () => store.entries(),
		entriesInKeyRange: async range => store.entriesInKeyRange(range),
		clear: async () => store.clear()
	};
}
function createSyncKeyedStoreForPluginId(pluginId, options) {
	const namespace = validateNamespace(options.namespace);
	const maxEntries = validateMaxEntries(options.maxEntries);
	const overflowPolicy = optionPolicy.resolveOverflowPolicy(options.overflowPolicy);
	const defaultTtlMs = validateOptionalTtlMs(options.defaultTtlMs);
	const env = options.env;
	optionPolicy.assertConsistent(pluginId, namespace, {
		maxEntries,
		overflowPolicy,
		defaultTtlMs
	});
	return {
		registerMany(entries) {
			if (!Array.isArray(entries) || entries.length > 32) throw invalidInput("plugin state sync batch requires at most 32 rows");
			// Validate and serialize before BEGIN; do not run caller accessors in a transaction.
			const prepared = entries.map(entry => prepareRegisterParams(entry.key, entry.value, defaultTtlMs, entry.options));
			pluginStateRegisterBatch({pluginId, namespace, maxEntries, overflowPolicy, ...env ? {env} : {}}, prepared);
		},
		register(key, value, opts) {
			const params = prepareRegisterParams(key, value, defaultTtlMs, opts);
			pluginStateRegister({
				pluginId,
				namespace,
				key: params.key,
				valueJson: params.valueJson,
				maxEntries,
				overflowPolicy,
				...env ? { env } : {},
				...params.ttlMs != null ? { ttlMs: params.ttlMs } : {}
			});
		},
		registerIfAbsent(key, value, opts) {
			const params = prepareRegisterParams(key, value, defaultTtlMs, opts);
			return pluginStateRegisterIfAbsent({
				pluginId,
				namespace,
				key: params.key,
				valueJson: params.valueJson,
				maxEntries,
				overflowPolicy,
				...env ? { env } : {},
				...params.ttlMs != null ? { ttlMs: params.ttlMs } : {}
			});
		},
		update(key, updateValue, opts) {
			const normalizedKey = validateKey(key, "register");
			return pluginStateUpdate({
				pluginId,
				namespace,
				key: normalizedKey,
				maxEntries,
				overflowPolicy,
				updateValueJson: (current) => {
					const next = updateValue(current);
					if (next === void 0) return;
					const params = prepareRegisterParams(normalizedKey, next, defaultTtlMs, opts);
					return {
						valueJson: params.valueJson,
						...params.ttlMs != null ? { ttlMs: params.ttlMs } : {}
					};
				},
				...env ? { env } : {}
			});
		},
		deleteIf(key, predicate) {
			const normalizedKey = validateKey(key, "delete");
			return pluginStateDeleteIf({
				pluginId,
				namespace,
				key: normalizedKey,
				predicate: (current) => predicate(current),
				...env ? { env } : {}
			});
		},
		lookup(key) {
			const normalizedKey = validateKey(key, "lookup");
			return pluginStateLookup({
				pluginId,
				namespace,
				key: normalizedKey,
				...env ? { env } : {}
			});
		},
		consume(key) {
			const normalizedKey = validateKey(key, "consume");
			return pluginStateConsume({
				pluginId,
				namespace,
				key: normalizedKey,
				...env ? { env } : {}
			});
		},
		delete(key) {
			const normalizedKey = validateKey(key, "delete");
			return pluginStateDelete({
				pluginId,
				namespace,
				key: normalizedKey,
				...env ? { env } : {}
			});
		},
		entriesInKeyRange(range) {
			const keyStartInclusive = validateKey(range.keyStartInclusive, "entries");
			const keyEndExclusive = validateKey(range.keyEndExclusive, "entries");
			if (!Number.isSafeInteger(range.limit) || range.limit < 1 || range.limit > maxEntries) throw invalidInput("plugin state range limit exceeds namespace capacity", "entries");
			return pluginStateEntriesInKeyRange({pluginId, namespace, keyStartInclusive, keyEndExclusive, limit: range.limit, ...env ? {env} : {}});
		},
		entries() {
			return pluginStateEntries({
				pluginId,
				namespace,
				...env ? { env } : {}
			});
		},
		clear() {
			pluginStateClear({
				pluginId,
				namespace,
				...env ? { env } : {}
			});
		}
	};
}
/**
* Migration-only write path that preserves a legacy entry's original creation
* timestamp. Cap eviction removes the oldest `created_at` first, so imported
* rows must keep their real age instead of being stamped with the import time
* (which would let later live writes evict fresher pre-existing rows first).
* Not part of the plugin-facing store API.
*/
function registerMigratedPluginStateEntry(params) {
	if (!Number.isFinite(params.createdAtMs) || params.createdAtMs < 0) throw invalidInput("plugin state migration createdAtMs must be a non-negative finite number");
	const namespace = validateNamespace(params.namespace, "register");
	const maxEntries = validateMaxEntries(params.maxEntries);
	const overflowPolicy = optionPolicy.resolveOverflowPolicy(params.overflowPolicy);
	const defaultTtlMs = validateOptionalTtlMs(params.defaultTtlMs);
	const prepared = prepareRegisterParams(params.key, params.value, defaultTtlMs, params.ttlMs != null ? { ttlMs: params.ttlMs } : void 0);
	pluginStateRegister({
		pluginId: params.pluginId,
		namespace,
		key: prepared.key,
		valueJson: prepared.valueJson,
		maxEntries,
		overflowPolicy,
		createdAtMs: Math.floor(params.createdAtMs),
		...params.env ? { env: params.env } : {},
		...prepared.ttlMs != null ? { ttlMs: prepared.ttlMs } : {}
	});
}
/** Opens an async plugin-state namespace for a non-core plugin id. */
function createPluginStateKeyedStore(pluginId, options) {
	if (pluginId.startsWith("core:")) throw invalidInput("Plugin ids starting with 'core:' are reserved for core consumers.", "open");
	return createKeyedStoreForPluginId(pluginId, options);
}
/** Opens a sync plugin-state namespace for a non-core plugin id. */
function createPluginStateSyncKeyedStore(pluginId, options) {
	if (pluginId.startsWith("core:")) throw invalidInput("Plugin ids starting with 'core:' are reserved for core consumers.", "open");
	return createSyncKeyedStoreForPluginId(pluginId, options);
}
/** Atomically allocates a workspace sequence and appends one journal entry. */
function registerPluginStateSyncSequencedJournalEntry(params) {
	if (params.pluginId.startsWith("core:")) throw invalidInput("Plugin ids starting with 'core:' are reserved for core consumers.", "open");
	if (!Number.isSafeInteger(params.initialSequence) || params.initialSequence < 0) throw invalidInput("plugin state initial journal sequence must be a safe non-negative integer");
	const cursorNamespace = validateNamespace(params.cursorOptions.namespace);
	const cursorMaxEntries = validateMaxEntries(params.cursorOptions.maxEntries);
	const cursorOverflowPolicy = optionPolicy.resolveOverflowPolicy(params.cursorOptions.overflowPolicy);
	const cursorDefaultTtlMs = validateOptionalTtlMs(params.cursorOptions.defaultTtlMs);
	const journalNamespace = validateNamespace(params.journalOptions.namespace);
	const journalMaxEntries = validateMaxEntries(params.journalOptions.maxEntries);
	const journalOverflowPolicy = optionPolicy.resolveOverflowPolicy(params.journalOptions.overflowPolicy);
	const journalDefaultTtlMs = validateOptionalTtlMs(params.journalOptions.defaultTtlMs);
	if (cursorOverflowPolicy !== "evict-oldest" || journalOverflowPolicy !== "evict-oldest" || cursorDefaultTtlMs !== void 0 || journalDefaultTtlMs !== void 0) throw invalidInput("sequenced plugin state journals require non-expiring evict-oldest stores");
	if (params.cursorOptions.env !== params.journalOptions.env) throw invalidInput("sequenced plugin state journal stores must share one environment");
	const cursorKey = validateKey(params.cursorKey);
	optionPolicy.assertConsistent(params.pluginId, cursorNamespace, {
		maxEntries: cursorMaxEntries,
		overflowPolicy: cursorOverflowPolicy,
		defaultTtlMs: cursorDefaultTtlMs
	});
	optionPolicy.assertConsistent(params.pluginId, journalNamespace, {
		maxEntries: journalMaxEntries,
		overflowPolicy: journalOverflowPolicy,
		defaultTtlMs: journalDefaultTtlMs
	});
	return pluginStateRegisterSequencedJournalEntry({
		pluginId: params.pluginId,
		cursorNamespace,
		cursorKey,
		cursorMaxEntries,
		journalNamespace,
		journalMaxEntries,
		initialSequence: params.initialSequence,
		readCursorSequence(valueJson) {
			try {
				const value = JSON.parse(valueJson);
				return value.kind === "cursor" && Number.isSafeInteger(value.lastSequence) ? value.lastSequence : void 0;
			} catch {
				return;
			}
		},
		prepareEntry(sequence) {
			const cursor = prepareRegisterParams(cursorKey, {
				kind: "cursor",
				lastSequence: sequence
			});
			const journal = prepareRegisterParams(params.journalKey(sequence), params.journalValue(sequence));
			return {
				cursorValueJson: cursor.valueJson,
				journalKey: journal.key,
				journalValueJson: journal.valueJson
			};
		},
		...params.cursorOptions.env ? { env: params.cursorOptions.env } : {}
	});
}
/** Doctor-only import that preserves source age and remaining retention. */
function importPluginStateEntriesForDoctor(pluginId, options, entries) {
	if (pluginId.startsWith("core:")) throw invalidInput("Plugin ids starting with 'core:' are reserved for core consumers.", "open");
	const namespace = validateNamespace(options.namespace);
	const maxEntries = validateMaxEntries(options.maxEntries);
	const overflowPolicy = optionPolicy.resolveOverflowPolicy(options.overflowPolicy);
	const defaultTtlMs = validateOptionalTtlMs(options.defaultTtlMs);
	const env = options.env;
	optionPolicy.assertConsistent(pluginId, namespace, {
		maxEntries,
		overflowPolicy,
		defaultTtlMs
	});
	let batch = [];
	const flush = () => {
		pluginStateImportBatch({
			pluginId,
			namespace,
			maxEntries,
			overflowPolicy,
			env
		}, batch);
		batch = [];
	};
	for (const entry of entries) {
		try {
			if (!Number.isSafeInteger(entry.createdAt)) throw invalidInput("plugin state import createdAt must be a safe integer", "register");
			const prepared = prepareRegisterParams(entry.key, entry.value, defaultTtlMs, entry.ttlMs != null ? { ttlMs: entry.ttlMs } : void 0);
			batch.push({
				...prepared,
				createdAtMs: entry.createdAt
			});
		} catch (error) {
			flush();
			throw error;
		}
		if (batch.length === 500) flush();
	}
	flush();
}
/** Opens a sync plugin-state namespace for a trusted core owner id. */
function createCorePluginStateSyncKeyedStore(options) {
	return createSyncKeyedStoreForPluginId(options.ownerId, options);
}
/** Clears plugin-state rows and option signatures for tests. */
function clearPluginStateStoreForTests() {
	clearPluginStateDatabaseForTests();
	optionPolicy.clear();
}
if (process.env.VITEST || false) globalThis[Symbol.for("openclaw.pluginStateStoreTestApi")] = { clearPluginStateStoreForTests };
//#endregion
export { pluginStateDeleteEntriesIfUnchanged as _, registerMigratedPluginStateEntry as a, resolveMaxPluginStateEntriesPerPlugin as b, serializePluginStoreJson as c, validatePluginStoreNamespace as d, validatePluginStorePositiveInteger as f, getPluginStateCapacity as g, countPluginStateLiveEntries as h, importPluginStateEntriesForDoctor as i, validateOptionalPluginStoreTtlMs as l, closePluginStateDatabase as m, createPluginStateKeyedStore as n, registerPluginStateSyncSequencedJournalEntry as o, MAX_PLUGIN_STATE_ENTRIES_PER_PLUGIN as p, createPluginStateSyncKeyedStore as r, createPluginStoreOptionPolicy as s, createCorePluginStateSyncKeyedStore as t, validatePluginStoreKey as u, pluginStateDoctorEntriesInKeyRange as v, sweepExpiredPluginStateEntries as x, pluginStateEntriesInKeyRange as y };
