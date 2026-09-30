import { invalidateVerification as db91Invalidate, invalidateAllVerifications as db91InvalidateAll, assertConnectionUsable as db91AssertConnection, rememberConnection as db91RememberConnection } from "./db91-integrity-gate.mjs";
import { r as isPathInside } from "./path-guards-Cp-mGr3-.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { o as tryAcquireExclusiveSqliteCoordinator, t as openNodeSqliteDatabase, u as runSqliteImmediateTransactionSync } from "./node-sqlite-CL-d6drd.js";
import {withSqliteBeginContentionRetrySync} from "./sqlite-begin-contention-retry.mjs";
import {isAgentDatabaseProcessLeaseHeld, withAgentDatabaseProcessLeaseSync} from "./agent-db-process-coordinator.mjs";
import { t as enableNodeSqliteKyselyStatementCache } from "./kysely-sync-DKYGT267.js";
import { o as OPENCLAW_SQLITE_BUSY_TIMEOUT_MS } from "./openclaw-state-db-contract-CsSSYjX0.js";
import { i as isSqliteSchemaVersionError } from "./sqlite-user-version-DkmzAA6V.js";
import { B as readOpenClawDatabaseQuarantine, H as createSqliteTerminalOpenLatch, f as createOpenClawDatabaseVerificationError, z as clearOpenClawDatabaseQuarantine } from "./openclaw-state-db-cache-AunrvrzG.js";
import { i as isTerminalSqliteIntegrityError, r as confirmSqliteFileIntegrity } from "./sqlite-integrity-BBPyeEpy.js";
import { Jt as deferSqlitePostCommitPublication, Yt as withSqlitePostCommitPublications, _t as quarantineOrphanedSqliteSidecars } from "./openclaw-state-db-Bh3Bq87y.js";
import { i as registerSqliteCacheExitClose, n as configureSqlitePreSchemaPragmas, t as configureSqliteConnectionPragmas } from "./sqlite-wal-B8YRh3_y.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import "./session-key-CRjxKW0X.js";
import { n as withOpenClawStateLease } from "./openclaw-state-lease-DVov9Y5y.js";
import { B as unregisterOpenClawAgentDatabase, G as AGENT_DATABASE_MAINTENANCE_LEASE, J as assertNoOpenClawAgentDatabaseLeases, R as isSameOpenClawAgentDatabasePath, W as ensureOpenClawAgentDatabasePermissions, X as releaseOpenClawAgentDatabaseLease, Y as claimOpenClawAgentDatabaseLease, Z as runWithAgentDatabaseMaintenanceAuthority, a as ensureAgentSchema, c as assertCanonicalAgentPersistenceVersion, d as assertSupportedAgentSchemaVersion, f as readExistingAgentSchemaMeta, i as assertAgentDatabaseIntegrityBeforeMutation, l as assertExistingAgentSchemaOwner, z as registerOpenClawAgentDatabase } from "./openclaw-agent-db-maintenance-DYSkzMMg.js";
import { r as resolveOpenClawAgentSqlitePath, t as isIncognitoOpenClawAgentSqlitePath } from "./openclaw-agent-db.paths-DYna80bS.js";
import { existsSync } from "node:fs";
import path from "node:path";
//#region src/state/openclaw-agent-db.ts
/**
* Per-agent SQLite database lifecycle and shared-state registration.
*
* Each opened agent database is schema-owned by one normalized agent id, cached
* per pathname, protected with private file modes, and registered in the shared
* OpenClaw state database for discovery and maintenance.
*/
const OPENCLAW_AGENT_DB_SLOW_OPEN_MS = 1e3;
var IncognitoAgentDatabasePathCollisionError = class extends Error {
	constructor(pathname) {
		super(`Incognito agent database sentinel path already exists: ${pathname}. This filename is reserved for in-memory incognito state; move or rename the file and retry.`);
		this.name = "IncognitoAgentDatabasePathCollisionError";
		this.path = pathname;
	}
};
const OPENCLAW_AGENT_DB_OPEN_HANDLE_CAP = 64;
const agentDbLog = createSubsystemLogger("state/agent-db");
const cachedDatabases = /* @__PURE__ */ new Map();
const incognitoDatabases = /* @__PURE__ */ new WeakSet();
let incognitoDatabaseGeneration = 0;
const cachedDatabaseOpenFailures = /* @__PURE__ */ new Map();
const cachedDatabaseLeases = /* @__PURE__ */ new Map();
const validatedAgentDatabasePaths = /* @__PURE__ */ new Map();
const terminalOpenLatch = createSqliteTerminalOpenLatch({ closeByPath: closeOpenClawAgentDatabaseByPath });
/** Reconfirm an advisory worker failure on the live owner connection. */
function confirmOpenClawAgentDatabaseIntegrity(pathname) {
	const resolvedPath = path.resolve(pathname);
	closeOpenClawAgentDatabaseByPath(resolvedPath);
	validatedAgentDatabasePaths.delete(resolvedPath);
	return confirmSqliteFileIntegrity(resolvedPath, resolvedPath);
}
/** Latch background verification damage so later opens fail without rescanning. */
function recordOpenClawAgentDatabaseOpenFailure(pathname, error, generation) {
	const recorded = terminalOpenLatch.record(pathname, error, generation);
	if (recorded) { db91Invalidate(pathname, {reason: "native-terminal-failure"}); validatedAgentDatabasePaths.delete(path.resolve(pathname)); }
	return recorded;
}
/**
* Clear a terminal open failure after doctor rewrites the database file.
* Returns false when the persisted quarantine row survived; callers must
* surface that, or the next open re-quarantines the repaired file.
*/
function clearOpenClawAgentDatabaseOpenFailure(pathname, options = {}) {
	db91Invalidate(pathname, {reason: "quarantine-cleared"});
	const resolvedPath = path.resolve(pathname);
	const cleared = clearOpenClawDatabaseQuarantine(resolvedPath, { env: options.env });
	terminalOpenLatch.clear(resolvedPath);
	return cleared;
}
function logSlowAgentDatabaseOpen(params) {
	if (params.elapsedMs < OPENCLAW_AGENT_DB_SLOW_OPEN_MS) return;
	agentDbLog.warn("slow OpenClaw agent database open", {
		agentId: params.agentId,
		elapsedMs: params.elapsedMs,
		path: params.path,
		thresholdMs: OPENCLAW_AGENT_DB_SLOW_OPEN_MS
	});
}
/** Read a database's durable role and agent owner without mutating it. */
function inspectOpenClawAgentDatabaseOwner(pathname) {
	let db;
	try {
		const opened = cachedDatabases.get(path.resolve(pathname));
		if (opened?.db.isOpen) {
			assertSupportedAgentSchemaVersion(opened.db, pathname);
			return {
				status: "owned",
				agentId: opened.agentId
			};
		}
		db = openNodeSqliteDatabase(pathname, { readOnly: true });
		db.exec(`PRAGMA busy_timeout = ${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS};`);
		assertSupportedAgentSchemaVersion(db, pathname);
		const existing = readExistingAgentSchemaMeta(db);
		if (!existing) return { status: "unowned" };
		if (existing.role !== "agent" || !existing.agentId) return { status: "unreadable" };
		return {
			status: "owned",
			agentId: normalizeAgentId(existing.agentId)
		};
	} catch {
		return { status: "unreadable" };
	} finally {
		db?.close();
	}
}
/** Open or return a cached per-agent database after schema and owner validation. */
function openOpenClawAgentDatabase(options) {
	const agentId = normalizeAgentId(options.agentId);
	const databaseOptions = {
		...options,
		agentId
	};
	const pathname = resolveOpenClawAgentSqlitePath(databaseOptions);
	const incognito = isIncognitoOpenClawAgentSqlitePath(pathname, databaseOptions);
	const cached = cachedDatabases.get(pathname);
	if (cached?.db.isOpen) {
		if (cachedDatabaseOpenFailures.has(pathname)) throw cachedDatabaseOpenFailures.get(pathname);
		if (!incognito) db91AssertConnection(cached.db, pathname);
		if (cached.agentId !== agentId) throw new Error(`OpenClaw agent database ${pathname} is already open for agent ${cached.agentId}; requested agent ${agentId}.`);
		cachedDatabases.delete(pathname);
		cachedDatabases.set(pathname, cached);
		return cached;
	}
	if (incognito) {
		if (existsSync(pathname)) throw new IncognitoAgentDatabasePathCollisionError(pathname);
		if (cached) {
			closeCachedOpenClawAgentDatabase(cached);
			cachedDatabases.delete(pathname);
			cachedDatabaseOpenFailures.delete(pathname);
		}
		const db = openNodeSqliteDatabase(":memory:");
		configureSqlitePreSchemaPragmas(db, { busyTimeoutMs: OPENCLAW_SQLITE_BUSY_TIMEOUT_MS });
		const walMaintenance = configureSqliteConnectionPragmas(db, {
			busyTimeoutMs: OPENCLAW_SQLITE_BUSY_TIMEOUT_MS,
			databaseLabel: `openclaw-agent-incognito:${agentId}`,
			foreignKeys: true,
			synchronous: "NORMAL"
		});
		ensureAgentSchema(db, agentId, pathname);
		const database = {
			agentId,
			db,
			path: pathname,
			walMaintenance
		};
		incognitoDatabases.add(database);
		unregisterExitClose ??= registerSqliteCacheExitClose(closeOpenClawAgentDatabases);
		cachedDatabases.set(pathname, database);
		incognitoDatabaseGeneration += 1;
		return database;
	}
	quarantineOrphanedSqliteSidecars(pathname);
	const terminalFailure = terminalOpenLatch.get(pathname);
	if (terminalFailure) throw terminalFailure;
	let persistedFailure;
	try {
		const quarantine = readOpenClawDatabaseQuarantine(pathname, { env: databaseOptions.env });
		if (quarantine) persistedFailure = createOpenClawDatabaseVerificationError("agent", pathname, quarantine.reason);
	} catch {}
	if (persistedFailure) {
		recordOpenClawAgentDatabaseOpenFailure(pathname, persistedFailure);
		throw persistedFailure;
	}
	if (cached) {
		closeCachedOpenClawAgentDatabase(cached);
		cachedDatabases.delete(pathname);
		cachedDatabaseOpenFailures.delete(pathname);
	}
	const leaseId = claimOpenClawAgentDatabaseLease({
		agentId,
		path: pathname,
		...options.env ? { env: options.env } : {}
	});
	const openStartedAt = Date.now();
	let openedDb;
	let openedDatabase;
	let openedWalMaintenance;
	try {
		ensureOpenClawAgentDatabasePermissions(pathname, databaseOptions);
		evictLruAgentDatabaseHandles();
		const db = openNodeSqliteDatabase(pathname);
		enableNodeSqliteKyselyStatementCache(db);
		openedDb = db;
		db91RememberConnection(db, pathname);
		let isValidatedReopen = validatedAgentDatabasePaths.get(pathname) === agentId;
		const walMaintenance = (() => {
			let maintenance;
			try {
				db.exec(`PRAGMA busy_timeout = ${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS};`);
				assertSupportedAgentSchemaVersion(db, pathname);
				assertExistingAgentSchemaOwner(readExistingAgentSchemaMeta(db), agentId, pathname);
				const requiresCurrentVersionConvergence = assertAgentDatabaseIntegrityBeforeMutation(db, agentId, pathname);
				if (isValidatedReopen && requiresCurrentVersionConvergence) {
					validatedAgentDatabasePaths.delete(pathname);
					isValidatedReopen = false;
				}
				assertCanonicalAgentPersistenceVersion(db, pathname);
				configureSqlitePreSchemaPragmas(db, { busyTimeoutMs: OPENCLAW_SQLITE_BUSY_TIMEOUT_MS });
				maintenance = configureSqliteConnectionPragmas(db, {
					busyTimeoutMs: OPENCLAW_SQLITE_BUSY_TIMEOUT_MS,
					databaseLabel: `openclaw-agent:${agentId}`,
					databasePath: pathname,
					foreignKeys: true,
					synchronous: "NORMAL"
				});
				openedWalMaintenance = maintenance;
				if (!isValidatedReopen) ensureAgentSchema(db, agentId, pathname);
				return maintenance;
			} catch (err) {
				maintenance?.close();
				db.close();
				validatedAgentDatabasePaths.delete(pathname);
				if (err instanceof Error && (isSqliteSchemaVersionError(err) || isTerminalSqliteIntegrityError(err))) recordOpenClawAgentDatabaseOpenFailure(pathname, err);
				throw err;
			}
		})();
		ensureOpenClawAgentDatabasePermissions(pathname, databaseOptions);
		const database = {
			agentId,
			db,
			path: pathname,
			walMaintenance
		};
		openedDatabase = database;
		db91AssertConnection(db, pathname);
		if (!isValidatedReopen) {
			registerOpenClawAgentDatabase({
				agentId,
				path: pathname,
				env: options.env
			});
			validatedAgentDatabasePaths.set(pathname, agentId);
		}
		terminalOpenLatch.clear(pathname);
		unregisterExitClose ??= registerSqliteCacheExitClose(closeOpenClawAgentDatabases);
		logSlowAgentDatabaseOpen({
			agentId,
			elapsedMs: Date.now() - openStartedAt,
			path: pathname
		});
		cachedDatabaseLeases.set(pathname, {
			leaseId,
			env: options.env
		});
		cachedDatabases.set(pathname, database);
		return database;
	} catch (error) {
		let closeError;
		if (openedDatabase) try {
			closeCachedOpenClawAgentDatabase(openedDatabase);
		} catch (caught) {
			closeError = caught;
		}
		if (openedDb?.isOpen) {
			validatedAgentDatabasePaths.delete(pathname);
			const retainedDatabase = openedDatabase ?? {
				agentId,
				db: openedDb,
				path: pathname,
				walMaintenance: openedWalMaintenance ?? {
					checkpoint: () => false,
					close: () => false
				}
			};
			cachedDatabases.set(pathname, retainedDatabase);
			cachedDatabaseLeases.set(pathname, {
				leaseId,
				env: options.env
			});
			cachedDatabaseOpenFailures.set(pathname, closeError ?? error);
			unregisterExitClose ??= registerSqliteCacheExitClose(closeOpenClawAgentDatabases);
		} else releaseOpenClawAgentDatabaseLease(leaseId, { env: options.env });
		throw closeError ?? error;
	}
}
/** Queue a non-throwing runtime publication on the outer database commit edge. */
function deferOpenClawAgentPostCommitPublication(database, publish) {
	return deferSqlitePostCommitPublication(database.db, publish);
}
function runOpenClawAgentWriteTransaction(operation, options, transactionOptions = {}) {
	const database = openOpenClawAgentDatabase(options);
	const enteredNestedTransaction = database.db.isTransaction;
	const processAdmissionTimeoutMs = transactionOptions.busyTimeoutMs ?? 5e3;
	const runTransaction = () => withSqlitePostCommitPublications(database.db, () => withSqliteBeginContentionRetrySync({
		database: database.db,
		run: transactionOperation => runSqliteImmediateTransactionSync(database.db, () => transactionOperation(database), {
			busyTimeoutMs: transactionOptions.busyTimeoutMs ?? 5e3,
			databaseLabel: database.path,
			...transactionOptions,
			operationLabel: transactionOptions.operationLabel ?? "agent.write"
		}),
		operation: (writeDatabase) => {
			const operationResult = operation(writeDatabase);
			if (!enteredNestedTransaction) {
				if (!incognitoDatabases.has(writeDatabase)) ensureOpenClawAgentDatabasePermissions(writeDatabase.path, options);
			}
			return operationResult;
		}
	}));
	if (incognitoDatabases.has(database) || isAgentDatabaseProcessLeaseHeld(database.path)) return runTransaction();
	return withAgentDatabaseProcessLeaseSync({
		acquire: tryAcquireExclusiveSqliteCoordinator,
		databasePath: database.path,
		fn: runTransaction,
		maxWaitMs: processAdmissionTimeoutMs,
		onAcquired: ({ attempts, waitMs }) => {
			if (waitMs >= 1e3) agentDbLog.warn("slow direct Agent DB process writer admission", {
				attempts,
				operationLabel: transactionOptions.operationLabel ?? "agent.write",
				path: database.path,
				waitMs
			});
		},
		onReleaseError: (error) => agentDbLog.warn("direct Agent DB process writer coordinator release failed", { error, path: database.path })
	});
}
let unregisterExitClose = null;
function closeCachedOpenClawAgentDatabase(database, options = {}) {
	database.walMaintenance.close(options.eviction ? { checkpointMode: "PASSIVE" } : void 0);
	if (database.db.isOpen) database.db.close();
	const lease = cachedDatabaseLeases.get(database.path);
	if (lease) {
		releaseOpenClawAgentDatabaseLease(lease.leaseId, { env: lease.env });
		cachedDatabaseLeases.delete(database.path);
	}
}
function evictLruAgentDatabaseHandles() {
	while (cachedDatabases.size >= 64) {
		let evicted = false;
		for (const [pathname, database] of cachedDatabases) {
			if (database.db.isTransaction) continue;
			if (incognitoDatabases.has(database)) continue;
			closeCachedOpenClawAgentDatabase(database, { eviction: true });
			cachedDatabases.delete(pathname);
			cachedDatabaseOpenFailures.delete(pathname);
			agentDbLog.debug("evicted OpenClaw agent database handle", {
				agentId: database.agentId,
				openHandles: cachedDatabases.size,
				path: pathname
			});
			evicted = true;
			break;
		}
		if (!evicted) {
			agentDbLog.warn("agent database handle cap exceeded; all cached handles are in transactions", {
				cap: 64,
				openHandles: cachedDatabases.size
			});
			return;
		}
	}
}
/** Return whether the exact cached agent database pathname is still open. */
function isOpenClawAgentDatabaseOpen(pathname) {
	return cachedDatabases.get(path.resolve(pathname))?.db.isOpen === true;
}
/** Return the matching live cache entry without materializing a database. */
function getOpenClawAgentDatabaseIfOpen(options) {
	const agentId = normalizeAgentId(options.agentId);
	const pathname = resolveOpenClawAgentSqlitePath({
		...options,
		agentId
	});
	const database = cachedDatabases.get(pathname);
	if (!database?.db.isOpen) return;
	if (cachedDatabaseOpenFailures.has(pathname)) throw cachedDatabaseOpenFailures.get(pathname);
	if (!incognitoDatabases.has(database)) db91AssertConnection(database.db, pathname);
	if (database.agentId !== agentId) throw new Error(`OpenClaw agent database ${pathname} is already open for agent ${database.agentId}; requested agent ${agentId}.`);
	return database;
}
/** Lists process-held incognito databases without opening new sentinel handles. */
function listOpenIncognitoAgentDatabases() {
	return [...cachedDatabases.values()].filter((database) => database.db.isOpen && incognitoDatabases.has(database)).map((database) => ({
		agentId: database.agentId,
		storePath: database.path
	})).toSorted((left, right) => left.agentId.localeCompare(right.agentId) || left.storePath.localeCompare(right.storePath));
}
/** Return the generation of process-held incognito database membership. */
function readOpenIncognitoAgentDatabaseGeneration() {
	return incognitoDatabaseGeneration;
}
/** Returns whether this exact process-held database is incognito/in-memory. */
function isIncognitoOpenClawAgentDatabase(database) {
	return incognitoDatabases.has(database);
}
/** List process-held agent databases without opening or inspecting fixture state. */
function listOpenClawAgentDatabasesForTest() {
	return [...cachedDatabases.values()].filter((database) => database.db.isOpen).map((database) => ({
		agentId: database.agentId,
		path: database.path
	})).toSorted((left, right) => left.agentId.localeCompare(right.agentId) || left.path.localeCompare(right.path));
}
/** Close one cached agent database identified by its exact resolved pathname. */
function closeOpenClawAgentDatabaseByPath(pathname) {
	const resolvedPath = path.resolve(pathname);
	const database = cachedDatabases.get(resolvedPath);
	if (!database) return false;
	const incognito = incognitoDatabases.has(database);
	closeCachedOpenClawAgentDatabase(database);
	cachedDatabases.delete(resolvedPath);
	cachedDatabaseOpenFailures.delete(resolvedPath);
	if (incognito) incognitoDatabaseGeneration += 1;
	if (cachedDatabases.size === 0) {
		unregisterExitClose?.();
		unregisterExitClose = null;
	}
	return true;
}
/** Close and unregister one unambiguous transient agent database by filesystem identity. */
function disposeOpenClawAgentDatabaseByPath(pathname, options = {}) {
	db91Invalidate(pathname, {reason: "database-dispose"});
	const resolvedPath = path.resolve(pathname);
	validatedAgentDatabasePaths.delete(resolvedPath);
	const matchingDatabases = [...cachedDatabases.values()].filter((candidate) => isSameOpenClawAgentDatabasePath(candidate.path, resolvedPath));
	if (matchingDatabases.length > 1) return false;
	const database = matchingDatabases[0];
	if (database && incognitoDatabases.has(database)) return closeOpenClawAgentDatabaseByPath(database.path);
	if (!database) return false;
	try {
		unregisterOpenClawAgentDatabase({
			agentId: database.agentId,
			path: database.path,
			...options.env ? { env: options.env } : {}
		});
	} finally {
		closeOpenClawAgentDatabaseByPath(database.path);
	}
	return true;
}
/** Close cached agent handles, optionally restricted to one runtime root. */
function closeOpenClawAgentDatabases(rootPath) {
	for (const pathname of cachedDatabases.keys()) if (rootPath === void 0 || isPathInside(rootPath, pathname)) closeOpenClawAgentDatabaseByPath(pathname);
}
/** Fence cross-process agent writers while Doctor reconciles shared plugin state. */
function withAgentDatabaseMaintenanceLease(options, run) {
	return withOpenClawStateLease({
		...AGENT_DATABASE_MAINTENANCE_LEASE,
		database: {
			scope: "shared",
			options
		},
		leaseMs: 6e4,
		waitMs: 5e3,
		heartbeat: "worker",
		leaseLabel: "agent database maintenance lease",
		operationLabel: "agent.database.maintenance.lease"
	}, (maintenance) => {
		closeOpenClawAgentDatabases();
		assertNoOpenClawAgentDatabaseLeases(maintenance, options);
		db91InvalidateAll({reason: "exclusive-maintenance"});
		return runWithAgentDatabaseMaintenanceAuthority(maintenance, () => run(maintenance));
	});
}
/** Close cached agent handles and clear terminal failure latches for test isolation. */
function closeOpenClawAgentDatabasesForTest() {
	closeOpenClawAgentDatabases();
	validatedAgentDatabasePaths.clear();
	terminalOpenLatch.clearAll();
}
//#endregion
export { readOpenIncognitoAgentDatabaseGeneration as _, closeOpenClawAgentDatabases as a, withAgentDatabaseMaintenanceLease as b, deferOpenClawAgentPostCommitPublication as c, inspectOpenClawAgentDatabaseOwner as d, isIncognitoOpenClawAgentDatabase as f, openOpenClawAgentDatabase as g, listOpenIncognitoAgentDatabases as h, closeOpenClawAgentDatabaseByPath as i, disposeOpenClawAgentDatabaseByPath as l, listOpenClawAgentDatabasesForTest as m, OPENCLAW_AGENT_DB_OPEN_HANDLE_CAP as n, closeOpenClawAgentDatabasesForTest as o, isOpenClawAgentDatabaseOpen as p, clearOpenClawAgentDatabaseOpenFailure as r, confirmOpenClawAgentDatabaseIntegrity as s, IncognitoAgentDatabasePathCollisionError as t, getOpenClawAgentDatabaseIfOpen as u, recordOpenClawAgentDatabaseOpenFailure as v, runOpenClawAgentWriteTransaction as y };
