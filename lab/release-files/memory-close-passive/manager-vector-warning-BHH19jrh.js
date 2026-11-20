import { i as extractErrorCode, l as toErrorObject } from "./error-coercion-CwcmpTBO.js";
import { c as resolveUserPath } from "./home-dir-BPhrG-aM.js";
import { s as sleepWithAbort } from "./src-BQ327IOM.js";
import { t as openNodeSqliteDatabase, u as runSqliteImmediateTransactionSync } from "./node-sqlite-CL-d6drd.js";
import { C as isCronRunSessionKey } from "./session-key-CRjxKW0X.js";
import { o as ensureOpenClawAgentDatabaseSchema } from "./openclaw-agent-db-maintenance-DYSkzMMg.js";
import { _ as ensureMemoryRecallMetadataSchema, b as ensureMemoryChunkProvenance, g as MEMORY_INDEX_CHUNK_RECALL_METADATA_TABLE, i as MEMORY_INDEX_DERIVED_TABLES, m as ensureMemoryPathFtsTriggers, o as MEMORY_INDEX_STATE_TABLE, p as dropMemoryPathFtsTriggers, t as ensureMemoryIndexSchema, u as MEMORY_INDEX_PATHS_FTS_TABLE } from "./memory-schema-BSs9MQgq.js";
import { t as openOpenClawAgentDatabaseReadOnly } from "./openclaw-agent-db-readonly-wb-jdztx.js";
import { t as loadSqliteVecExtension } from "./sqlite-vec-Dt5GyplB.js";
import "./sqlite-runtime-BYNq5dB7.js";
import "./memory-core-host-engine-foundation-CaZngFdy.js";
import { o as ensureMemoryHostDir } from "./internal-CKQ1RDPZ.js";
import { n as configureMemorySqliteWalMaintenance, t as closeMemorySqliteWalMaintenance } from "./engine-storage-C1hCjs4v.js";
import "./error-runtime-BmBsU1OI.js";
import "./runtime-env-BIoctfDh.js";
import { i as isDreamingNarrativeSessionStoreKey } from "./openclaw-runtime-session-DIUJdVKp.js";
import "./memory-core-host-engine-sessions-CAnvQ_5o.js";
import "./memory-core-host-engine-storage-BNZxTLNx.js";
import { l as withMemoryWorkspaceLock } from "./dreaming-dreams-file-DkDa0rC_.js";
import fs from "node:fs";
import path from "node:path";
//#region extensions/memory-core/src/memory/manager-sqlite-lease.ts
const MEMORY_SQLITE_LEASE_RETRY_DELAY_MS = 25;
function isSqliteBusyError(err) {
	const code = extractErrorCode(err);
	if (code === "SQLITE_BUSY" || code === "SQLITE_LOCKED") return true;
	const message = err instanceof Error ? err.message : String(err);
	return /SQLITE_(?:BUSY|LOCKED)|database is locked/iu.test(message);
}
function openMemoryLeaseDatabase(location) {
	const database = openNodeSqliteDatabase(location);
	try {
		database.exec("PRAGMA busy_timeout = 0");
		return database;
	} catch (err) {
		database.close();
		throw err;
	}
}
function createMemorySqliteLeaseHandle(database, transactionActive) {
	return { release: () => {
		let releaseError;
		if (transactionActive) try {
			database.exec("ROLLBACK");
		} catch (err) {
			releaseError = err;
		}
		try {
			database.close();
		} catch (err) {
			releaseError ??= err;
		}
		if (releaseError) throw toErrorObject(releaseError, "Failed to release memory SQLite lease");
	} };
}
function tryAcquireMemorySqliteLease(location, mode) {
	const database = openMemoryLeaseDatabase(location);
	try {
		if (mode === "exclusive") database.exec("BEGIN EXCLUSIVE");
		else {
			database.exec("BEGIN");
			database.prepare("SELECT name FROM sqlite_schema LIMIT 1").get();
		}
	} catch (err) {
		database.close();
		if (isSqliteBusyError(err)) return;
		throw err;
	}
	return createMemorySqliteLeaseHandle(database, true);
}
/** Acquire writer admission without dropping PENDING intent after the first reader collision. */
async function acquireMemorySqliteWriterLease(location, signal) {
	while (true) {
		signal?.throwIfAborted();
		const database = openMemoryLeaseDatabase(location);
		try {
			database.exec("PRAGMA locking_mode = EXCLUSIVE");
			database.exec("BEGIN IMMEDIATE");
			database.exec("PRAGMA user_version = 0");
		} catch (err) {
			database.close();
			if (!isSqliteBusyError(err)) throw err;
			await sleepWithAbort(MEMORY_SQLITE_LEASE_RETRY_DELAY_MS, signal);
			continue;
		}
		while (true) try {
			database.exec("COMMIT");
			return createMemorySqliteLeaseHandle(database, false);
		} catch (err) {
			if (!isSqliteBusyError(err)) {
				createMemorySqliteLeaseHandle(database, true).release();
				throw err;
			}
			try {
				await sleepWithAbort(MEMORY_SQLITE_LEASE_RETRY_DELAY_MS, signal);
			} catch (sleepError) {
				createMemorySqliteLeaseHandle(database, true).release();
				throw sleepError;
			}
		}
	}
}
//#endregion
//#region extensions/memory-core/src/memory/manager-index-generation-lease.ts
const states = /* @__PURE__ */ new Map();
const CROSS_PROCESS_RETRY_DELAY_MS = 25;
function createGenerationLeaseAbortError(signal) {
	return new Error("Memory index generation lease acquisition aborted", { cause: signal?.reason });
}
function throwIfGenerationLeaseAborted(signal) {
	if (signal?.aborted) throw createGenerationLeaseAbortError(signal);
}
async function acquireCrossProcessLease(databasePath, kind, signal) {
	const acquireSqliteLease = async (location, mode) => {
		while (true) {
			throwIfGenerationLeaseAborted(signal);
			const lease = tryAcquireMemorySqliteLease(location, mode);
			if (lease) {
				if (signal?.aborted) {
					lease.release();
					throw createGenerationLeaseAbortError(signal);
				}
				return lease;
			}
			try {
				await sleepWithAbort(CROSS_PROCESS_RETRY_DELAY_MS, signal);
			} catch (err) {
				throw signal?.aborted ? createGenerationLeaseAbortError(signal) : err;
			}
		}
	};
	const admissionLocation = `${databasePath}.generation-writer.sqlite`;
	let admission;
	try {
		admission = kind === "read" ? await acquireSqliteLease(admissionLocation, "shared") : await acquireMemorySqliteWriterLease(admissionLocation, signal);
	} catch (err) {
		throw signal?.aborted ? createGenerationLeaseAbortError(signal) : err;
	}
	let generation;
	try {
		generation = await acquireSqliteLease(`${databasePath}.generation-lock.sqlite`, kind === "read" ? "shared" : "exclusive");
	} catch (err) {
		admission.release();
		throw err;
	}
	if (kind === "read") {
		try {
			admission.release();
		} catch (err) {
			generation.release();
			throw err;
		}
		if (signal?.aborted) {
			generation.release();
			throw createGenerationLeaseAbortError(signal);
		}
		return generation;
	}
	return { release: () => {
		try {
			generation.release();
		} finally {
			admission.release();
		}
	} };
}
function stateFor(key) {
	const existing = states.get(key);
	if (existing) return existing;
	const created = {
		readers: 0,
		writer: false,
		queue: []
	};
	states.set(key, created);
	return created;
}
function drain(key, state) {
	if (state.writer) return;
	if (state.readers > 0) {
		while (state.queue[0]?.kind === "read") {
			const reader = state.queue.shift();
			state.readers += 1;
			reader.resolve(() => {
				state.readers -= 1;
				drain(key, state);
			});
		}
		return;
	}
	const first = state.queue.shift();
	if (!first) {
		states.delete(key);
		return;
	}
	if (first.kind === "write") {
		state.writer = true;
		first.resolve(() => {
			state.writer = false;
			drain(key, state);
		});
		return;
	}
	const readers = [first];
	while (state.queue[0]?.kind === "read") readers.push(state.queue.shift());
	state.readers = readers.length;
	for (const reader of readers) reader.resolve(() => {
		state.readers -= 1;
		drain(key, state);
	});
}
async function acquireLocal(key, kind, signal) {
	throwIfGenerationLeaseAborted(signal);
	const state = stateFor(key);
	return await new Promise((resolve, reject) => {
		let admitted = false;
		const waiter = {
			kind,
			resolve: (release) => {
				admitted = true;
				signal?.removeEventListener("abort", onAbort);
				if (signal?.aborted) {
					release();
					reject(createGenerationLeaseAbortError(signal));
					return;
				}
				resolve(release);
			}
		};
		const onAbort = () => {
			if (admitted) return;
			const index = state.queue.indexOf(waiter);
			if (index < 0) return;
			state.queue.splice(index, 1);
			signal?.removeEventListener("abort", onAbort);
			drain(key, state);
			reject(createGenerationLeaseAbortError(signal));
		};
		signal?.addEventListener("abort", onAbort, { once: true });
		state.queue.push(waiter);
		if (signal?.aborted) {
			onAbort();
			return;
		}
		drain(key, state);
	});
}
async function acquire(databasePath, kind, signal) {
	const key = resolveUserPath(databasePath);
	const releaseLocal = await acquireLocal(key, kind, signal);
	let crossProcess;
	try {
		throwIfGenerationLeaseAborted(signal);
		crossProcess = await acquireCrossProcessLease(key, kind, signal);
		if (signal?.aborted) {
			crossProcess.release();
			throw createGenerationLeaseAbortError(signal);
		}
	} catch (err) {
		releaseLocal();
		throw err;
	}
	return () => {
		try {
			crossProcess.release();
		} finally {
			releaseLocal();
		}
	};
}
async function withLease(key, kind, run) {
	const release = await acquire(key, kind);
	try {
		return await run();
	} finally {
		release();
	}
}
async function acquireMemoryIndexReadGeneration(databasePath, signal) {
	return await acquire(databasePath, "read", signal);
}
async function withMemoryIndexPublishGeneration(databasePath, run) {
	return await withLease(databasePath, "write", run);
}
//#endregion
//#region extensions/memory-core/src/memory/manager-reindex-lock.ts
const REINDEX_LOCK_WAIT_TIMEOUT_MS = 2e3;
const REINDEX_LOCK_RETRY_DELAY_MS = 25;
function resolveMemoryReindexLockPath(dbPath) {
	return `${dbPath}.reindex-lock.sqlite`;
}
async function sleepAsync(ms) {
	await new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
function createMemoryReindexBusyError(lockPath) {
	return Object.assign(/* @__PURE__ */ new Error(`Memory reindex lock is held at ${lockPath}; another reindex is active.`), { code: "SQLITE_BUSY" });
}
/** Try to acquire the build lock without locking readers of the live agent database. */
function tryAcquireMemoryReindexLock(dbPath) {
	return tryAcquireMemorySqliteLease(resolveMemoryReindexLockPath(dbPath), "exclusive");
}
/** Wait asynchronously for the exclusive build lock without blocking the Node event loop. */
async function waitForMemoryReindexLock(dbPath) {
	const lockPath = resolveMemoryReindexLockPath(dbPath);
	const deadline = Date.now() + REINDEX_LOCK_WAIT_TIMEOUT_MS;
	do {
		const lock = tryAcquireMemoryReindexLock(dbPath);
		if (lock) return lock;
		await sleepAsync(REINDEX_LOCK_RETRY_DELAY_MS);
	} while (Date.now() < deadline);
	const finalLock = tryAcquireMemoryReindexLock(dbPath);
	if (finalLock) return finalLock;
	throw createMemoryReindexBusyError(lockPath);
}
//#endregion
//#region extensions/memory-core/src/memory/manager-db.ts
const MEMORY_REINDEX_SCHEMA = "memory_reindex";
const MEMORY_INDEX_STATE_ID = 1;
const READ_ONLY_MEMORY_DATABASES = /* @__PURE__ */ new WeakMap();
const MEMORY_DATABASE_FILE_SUFFIXES = [
	"",
	"-wal",
	"-shm",
	"-journal"
];
const MEMORY_REINDEX_ENTRY_SUFFIXES = [
	"-wal",
	"-shm",
	"-journal",
	""
];
const MEMORY_REINDEX_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MEMORY_REINDEX_ORPHAN_MIN_AGE_MS = 864e5;
function resolveMemoryReindexBaseName(databaseBaseName, entryName) {
	for (const suffix of MEMORY_REINDEX_ENTRY_SUFFIXES) {
		if (!entryName.endsWith(suffix)) continue;
		const baseName = entryName.slice(0, entryName.length - suffix.length);
		const prefix = `${databaseBaseName}.memory-reindex-`;
		if (baseName.startsWith(prefix) && MEMORY_REINDEX_UUID_PATTERN.test(baseName.slice(prefix.length))) return baseName;
	}
}
function isRegularFile(filePath) {
	try {
		return fs.statSync(filePath).isFile();
	} catch {
		return false;
	}
}
function tableExists(db, schema, tableName) {
	return db.prepare(`SELECT 1 AS ok FROM ${schema}.sqlite_master WHERE type = 'table' AND name = ?`).get(tableName)?.ok === 1;
}
function readTableSql(db, schema, tableName) {
	const row = db.prepare(`SELECT sql FROM ${schema}.sqlite_master WHERE type = 'table' AND name = ?`).get(tableName);
	return typeof row?.sql === "string" && row.sql.trim() ? row.sql : null;
}
function hasSqliteVecExtension(db) {
	try {
		const row = db.prepare("SELECT vec_version() AS version").get();
		return typeof row?.version === "string" && row.version.trim().length > 0;
	} catch {
		return false;
	}
}
function readMemoryDatabaseRevision(db) {
	const row = db.prepare("SELECT revision FROM memory_index_state WHERE id = ?").get(MEMORY_INDEX_STATE_ID);
	if (typeof row?.revision !== "number" || !Number.isSafeInteger(row.revision)) throw new Error("Memory index revision is missing or invalid");
	return row.revision;
}
var MemoryIndexRevisionConflictError = class extends Error {};
/** Reset derived content without replacing the shared agent database or its schema. */
async function resetMemoryDatabase(params) {
	const db = params.targetDb;
	const lock = await waitForMemoryReindexLock(params.dbPath);
	try {
		return await withMemoryWorkspaceLock(params.workspaceDir, async () => withMemoryIndexPublishGeneration(params.dbPath, async () => {
			if (tableExists(db, "main", "memory_index_chunks_vec") && !hasSqliteVecExtension(db)) {
				const loaded = await loadSqliteVecExtension({
					db,
					extensionPath: params.vectorExtensionPath
				});
				if (!loaded.ok) throw new Error(`Memory reset requires sqlite-vec to clear the vector index: ${loaded.error}`);
			}
			return runSqliteImmediateTransactionSync(db, () => {
				const tables = MEMORY_INDEX_DERIVED_TABLES.filter((table) => tableExists(db, "main", table));
				if (!tables.some((table) => table !== "memory_index_state" && db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get())) return false;
				const revision = readMemoryDatabaseRevision(db);
				const schema = tables.flatMap((table) => db.prepare("SELECT type, name, sql FROM main.sqlite_schema WHERE tbl_name = ? AND sql IS NOT NULL ORDER BY name").all(table));
				for (const entry of schema.filter((candidate) => candidate.type === "trigger")) db.exec(`DROP TRIGGER "${entry.name.replaceAll("\"", "\"\"")}"`);
				for (const table of tables) db.exec(`DROP TABLE main.${table}`);
				for (const type of [
					"table",
					"index",
					"trigger"
				]) for (const entry of schema.filter((candidate) => candidate.type === type)) db.exec(entry.sql);
				db.prepare(`INSERT INTO ${MEMORY_INDEX_STATE_TABLE} (id, revision) VALUES (?, ?)`).run(MEMORY_INDEX_STATE_ID, revision + 1);
				return true;
			});
		}));
	} finally {
		lock.release();
	}
}
function replaceVirtualTable(params) {
	const { db, tableName, columns } = params;
	const createSql = readTableSql(db, MEMORY_REINDEX_SCHEMA, tableName);
	if (!createSql) {
		try {
			db.exec(`DROP TABLE IF EXISTS main.${tableName}`);
		} catch (err) {
			if (!params.ignoreDropErrorWhenSourceMissing) throw err;
		}
		return;
	}
	db.exec(`DROP TABLE IF EXISTS main.${tableName}`);
	db.exec(createSql);
	db.exec(`INSERT INTO main.${tableName} (${columns}) SELECT ${columns} FROM ${MEMORY_REINDEX_SCHEMA}.${tableName}`);
}
function replaceMemoryPathFtsTable(db) {
	const createSql = readTableSql(db, MEMORY_REINDEX_SCHEMA, MEMORY_INDEX_PATHS_FTS_TABLE);
	db.exec(`DROP TABLE IF EXISTS main.${MEMORY_INDEX_PATHS_FTS_TABLE}`);
	if (!createSql) return;
	db.exec(createSql);
	db.exec(`INSERT INTO main.${MEMORY_INDEX_PATHS_FTS_TABLE} (rowid, path, source) SELECT id, path, source FROM main.memory_index_sources`);
}
/** Publish a completed shadow memory index without replacing the shared agent database file. */
async function publishMemoryDatabaseTables(params) {
	ensureMemoryRecallMetadataSchema(params.targetDb);
	ensureMemoryChunkProvenance(params.targetDb);
	params.targetDb.prepare(`ATTACH DATABASE ? AS ${MEMORY_REINDEX_SCHEMA}`).run(params.sourcePath);
	try {
		if (tableExists(params.targetDb, MEMORY_REINDEX_SCHEMA, "memory_index_chunks_vec") && !hasSqliteVecExtension(params.targetDb)) {
			const loaded = await loadSqliteVecExtension({
				db: params.targetDb,
				extensionPath: params.vectorExtensionPath
			});
			if (!loaded.ok) throw new Error(`Failed to load sqlite-vec before publishing the full memory reindex: ` + (loaded.error ?? "unknown sqlite-vec load error"));
		}
		runSqliteImmediateTransactionSync(params.targetDb, () => {
			const liveRevision = readMemoryDatabaseRevision(params.targetDb);
			if (liveRevision !== params.expectedRevision) throw new MemoryIndexRevisionConflictError(`Memory index changed while full reindex was building (expected revision ${params.expectedRevision}, found ${liveRevision}); retry the full reindex.`);
			const publishesPathFts = tableExists(params.targetDb, MEMORY_REINDEX_SCHEMA, MEMORY_INDEX_PATHS_FTS_TABLE);
			dropMemoryPathFtsTriggers(params.targetDb);
			params.targetDb.prepare("DELETE FROM main.memory_index_meta WHERE key = ?").run(params.metaKey);
			params.targetDb.prepare(`INSERT INTO main.memory_index_meta (key, value)
           SELECT key, value FROM ${MEMORY_REINDEX_SCHEMA}.memory_index_meta WHERE key = ?`).run(params.metaKey);
			params.targetDb.exec(`
        DELETE FROM main.memory_index_sources;
        INSERT INTO main.memory_index_sources (id, path, source, hash, mtime, size)
        SELECT id, path, source, hash, mtime, size
        FROM ${MEMORY_REINDEX_SCHEMA}.memory_index_sources;

        DELETE FROM main.memory_index_chunks;
        INSERT INTO main.memory_index_chunks (
          id, path, source, start_line, end_line, hash, model, text, embedding, updated_at
        )
        SELECT
          id, path, source, start_line, end_line, hash, model, text, embedding, updated_at
        FROM ${MEMORY_REINDEX_SCHEMA}.memory_index_chunks;

        DELETE FROM main.${MEMORY_INDEX_CHUNK_RECALL_METADATA_TABLE};
        INSERT INTO main.${MEMORY_INDEX_CHUNK_RECALL_METADATA_TABLE} (
          chunk_id, importance, triggers, project_key
        )
        SELECT chunk_id, importance, triggers, project_key
        FROM ${MEMORY_REINDEX_SCHEMA}.${MEMORY_INDEX_CHUNK_RECALL_METADATA_TABLE};

        DELETE FROM main.memory_index_chunk_provenance;
        INSERT INTO main.memory_index_chunk_provenance (
          chunk_id, origin_class, session_kind, observed_at, supersedes_key
        )
        SELECT chunk_id, origin_class, session_kind, observed_at, supersedes_key
        FROM ${MEMORY_REINDEX_SCHEMA}.memory_index_chunk_provenance;
      `);
			if (tableExists(params.targetDb, MEMORY_REINDEX_SCHEMA, "memory_embedding_cache")) params.targetDb.exec(`
          DELETE FROM main.memory_embedding_cache;
          INSERT INTO main.memory_embedding_cache (
            provider, model, provider_key, hash, embedding, dims, updated_at
          )
          SELECT provider, model, provider_key, hash, embedding, dims, updated_at
          FROM ${MEMORY_REINDEX_SCHEMA}.memory_embedding_cache;
        `);
			replaceVirtualTable({
				db: params.targetDb,
				tableName: "memory_index_chunks_fts",
				columns: "text, id, path, source, model, start_line, end_line"
			});
			replaceMemoryPathFtsTable(params.targetDb);
			if (publishesPathFts) ensureMemoryPathFtsTriggers(params.targetDb);
			replaceVirtualTable({
				db: params.targetDb,
				tableName: "memory_index_chunks_vec",
				columns: "id, embedding",
				ignoreDropErrorWhenSourceMissing: true
			});
		});
	} finally {
		params.targetDb.exec(`DETACH DATABASE ${MEMORY_REINDEX_SCHEMA}`);
	}
}
/** Remove one closed shadow memory database and its journal-mode sidecars. */
function removeMemoryDatabaseFiles(dbPath) {
	for (const suffix of MEMORY_DATABASE_FILE_SUFFIXES) fs.rmSync(`${dbPath}${suffix}`, { force: true });
}
/** Remove crash-left shadows while the caller owns the reindex lease. */
function cleanupAgedMemoryReindexTempFiles(dbPath, nowMs = Date.now()) {
	if (!isRegularFile(dbPath)) return;
	const dir = path.dirname(dbPath);
	const databaseBaseName = path.basename(dbPath);
	const shadowBaseNames = /* @__PURE__ */ new Set();
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		const shadowBaseName = resolveMemoryReindexBaseName(databaseBaseName, entry.name);
		if (shadowBaseName) shadowBaseNames.add(shadowBaseName);
	}
	for (const shadowBaseName of shadowBaseNames) {
		const filePaths = MEMORY_DATABASE_FILE_SUFFIXES.map((suffix) => path.join(dir, `${shadowBaseName}${suffix}`));
		const stats = [];
		let hasUnknownFileState = false;
		for (const filePath of filePaths) try {
			stats.push(fs.statSync(filePath));
		} catch (err) {
			if (err.code !== "ENOENT") {
				hasUnknownFileState = true;
				break;
			}
		}
		if (hasUnknownFileState || stats.length === 0) continue;
		if (nowMs - Math.max(...stats.map((stat) => stat.mtimeMs)) < MEMORY_REINDEX_ORPHAN_MIN_AGE_MS) continue;
		for (const filePath of filePaths) try {
			fs.rmSync(filePath, { force: true });
		} catch {}
	}
}
function openMemoryDatabaseAtPath(dbPath, allowExtension, agentId) {
	ensureMemoryHostDir(path.dirname(dbPath));
	const db = openNodeSqliteDatabase(dbPath, { allowExtension });
	try {
		// memory-close-passive-v1: the memory index shares the agent database. A TRUNCATE checkpoint on close
		// holds the writer lock and busy-waits (5 s, on the Gateway thread) for every open reader;
		// PASSIVE never waits. The database's owner keeps its own WAL maintenance.
		configureMemorySqliteWalMaintenance(db, {
			busyTimeoutMs: 5e3,
			databasePath: dbPath,
			checkpointMode: "PASSIVE"
		});
		if (agentId) ensureOpenClawAgentDatabaseSchema(db, {
			agentId,
			path: dbPath,
			register: true
		});
		return db;
	} catch (err) {
		try {
			closeMemorySqliteWalMaintenance(db);
			db.close();
		} catch {}
		throw err;
	}
}
function openUninitializedMemoryDatabase(allowExtension) {
	const database = openNodeSqliteDatabase(":memory:", { allowExtension });
	try {
		ensureMemoryIndexSchema({
			cacheEnabled: true,
			db: database,
			ftsEnabled: true
		});
		database.exec("PRAGMA query_only = ON");
		READ_ONLY_MEMORY_DATABASES.set(database, () => database.close());
		return database;
	} catch (error) {
		database.close();
		throw error;
	}
}
/** Open an existing memory index through the agent database query-only owner. */
function openMemoryDatabaseReadOnlyAtPath(dbPath, allowExtension, agentId) {
	const opened = openOpenClawAgentDatabaseReadOnly({
		agentId,
		path: dbPath
	}, { allowExtension });
	if (!opened.found) {
		if (opened.reason === "database-missing") return openUninitializedMemoryDatabase(allowExtension);
		throw new Error(`Memory index database schema is missing: ${dbPath}`);
	}
	const { database } = opened;
	if (!tableExists(database.db, "main", "memory_index_state")) {
		database.close();
		return openUninitializedMemoryDatabase(allowExtension);
	}
	READ_ONLY_MEMORY_DATABASES.set(database.db, database.close);
	return database.db;
}
function closeMemoryDatabase(db) {
	const closeReadOnly = READ_ONLY_MEMORY_DATABASES.get(db);
	if (closeReadOnly) {
		READ_ONLY_MEMORY_DATABASES.delete(db);
		closeReadOnly();
		return;
	}
	closeMemorySqliteWalMaintenance(db);
	db.close();
}
function isMemoryDatabaseReadOnly(db) {
	return READ_ONLY_MEMORY_DATABASES.has(db);
}
//#endregion
//#region extensions/memory-core/src/memory/manager-session-sync-state.ts
function isMemorySessionIndexable(entry, archivedSessionKey) {
	return !(entry.generatedByDreamingNarrative || entry.generatedByCronRun || entry.sessionKind === "cron" || entry.sessionKind === "heartbeat" || archivedSessionKey !== void 0 && (isDreamingNarrativeSessionStoreKey(archivedSessionKey) || isCronRunSessionKey(archivedSessionKey) || archivedSessionKey.endsWith(":heartbeat")) || entry.lineProvenance !== void 0 && entry.lineProvenance.length > 0 && entry.lineProvenance.every((line) => line.originClass === "system"));
}
function resolveMemorySessionStartupState(params) {
	const existingRows = params.existingRows ?? [];
	const indexedRows = new Map(existingRows.map((row) => [row.path, row]));
	const activePaths = new Set(params.files.map((file) => file.path));
	const dirtyFiles = [];
	for (const file of params.files) {
		const existing = indexedRows.get(file.path);
		if (!existing || existing.hash === "") {
			dirtyFiles.push(file.absPath);
			continue;
		}
		const indexedMtimeMs = Number(existing.mtime);
		const indexedSize = Number(existing.size);
		if (!Number.isFinite(indexedMtimeMs) || !Number.isFinite(indexedSize)) {
			dirtyFiles.push(file.absPath);
			continue;
		}
		if (file.size !== indexedSize || file.mtimeMs !== indexedMtimeMs) dirtyFiles.push(file.absPath);
	}
	return {
		dirtyFiles,
		hasStaleIndexedPaths: existingRows.some((row) => !activePaths.has(row.path))
	};
}
function resolveMemorySessionSyncPlan(params) {
	const activePaths = params.targetSessionFiles ? null : new Set(params.files.map((file) => params.sessionPathForFile(file)));
	const existingRows = activePaths === null ? null : params.existingRows ?? [];
	return {
		activePaths,
		existingRows,
		existingHashes: existingRows ? new Map(existingRows.map((row) => [row.path, row.hash])) : null,
		indexAll: params.needsFullReindex || Boolean(params.targetSessionFiles)
	};
}
//#endregion
//#region extensions/memory-core/src/memory/manager-vector-warning.ts
function formatMemoryVectorDegradedWriteReason(loadError) {
	return loadError ? `sqlite-vec unavailable: ${loadError}` : "semantic vector embeddings unavailable — no vector dimensions resolved";
}
function logMemoryVectorDegradedWrite(params) {
	if (!params.vectorEnabled || params.vectorReady || params.chunkCount <= 0 || params.warningShown) return params.warningShown;
	params.warn(`memory_index_chunks_vec not updated — ${formatMemoryVectorDegradedWriteReason(params.loadError)}. Vector recall degraded. Further duplicate warnings suppressed.`);
	return true;
}
//#endregion
export { waitForMemoryReindexLock as _, resolveMemorySessionSyncPlan as a, closeMemoryDatabase as c, openMemoryDatabaseReadOnlyAtPath as d, publishMemoryDatabaseTables as f, tableExists as g, resetMemoryDatabase as h, resolveMemorySessionStartupState as i, isMemoryDatabaseReadOnly as l, removeMemoryDatabaseFiles as m, logMemoryVectorDegradedWrite as n, MemoryIndexRevisionConflictError as o, readMemoryDatabaseRevision as p, isMemorySessionIndexable as r, cleanupAgedMemoryReindexTempFiles as s, formatMemoryVectorDegradedWriteReason as t, openMemoryDatabaseAtPath as u, acquireMemoryIndexReadGeneration as v, withMemoryIndexPublishGeneration as y };
