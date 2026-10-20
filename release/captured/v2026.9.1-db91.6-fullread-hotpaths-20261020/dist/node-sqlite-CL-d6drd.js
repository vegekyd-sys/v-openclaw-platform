import { t as installProcessWarningFilter } from "./warning-filter-z3hZGeVP.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { n as isSqliteWalResetSafeVersion } from "./sqlite-runtime-version-2bxyFHKW.js";
import { t as isPromiseLike } from "./promise-like-D7-l5Fsp.js";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
//#region V codex-turn-tail-v1: Codex turn tail timing (logging only)
function __vCodexTurnTail() {
	const key = Symbol.for("openclaw.v.codexTurnTail.v1");
	if (globalThis[key]) return globalThis[key];
	const runs = new Map();
	let sampler;
	let lastTick = 0;
	const tick = () => {
		const now = Date.now();
		const lag = Math.max(0, now - lastTick - 100);
		lastTick = now;
		for (const run of runs.values()) {
			if (lag > run.lagMaxMs) run.lagMaxMs = lag;
			if (lag >= 50) run.lagOver50Ms += lag;
		}
	};
	const api = {
		start(runId, meta) {
			try {
				if (typeof runId !== "string" || !runId || runs.has(runId)) return;
				const now = Date.now();
				for (const [id, run] of runs) if (now - run.startedAt > 6e5) runs.delete(id);
				if (runs.size >= 64) runs.delete(runs.keys().next().value);
				runs.set(runId, { runId, ...meta, startedAt: now, last: now, steps: [], tx: [], rpc: [], lagMaxMs: 0, lagOver50Ms: 0 });
				if (!sampler) {
					lastTick = now;
					sampler = setInterval(tick, 100);
					sampler.unref?.();
				}
			} catch {}
		},
		mark(runId, step) {
			try {
				const run = runs.get(runId);
				if (!run) return;
				const now = Date.now();
				run.steps.push([step, now - run.last]);
				run.last = now;
			} catch {}
		},
		note(kind, item) {
			try {
				if (runs.size === 0) return;
				const now = Date.now();
				for (const run of runs.values()) if (run[kind].length < 40) run[kind].push({ ...item, atMs: now - run.startedAt });
			} catch {}
		},
		active() {
			return runs.size > 0;
		},
		end(runId) {
			try {
				const run = runs.get(runId);
				if (!run) return;
				runs.delete(runId);
				if (runs.size === 0 && sampler) {
					clearInterval(sampler);
					sampler = void 0;
				}
				const { last, startedAt, ...rest } = run;
				return { ...rest, totalMs: Date.now() - startedAt };
			} catch {}
		}
	};
	globalThis[key] = api;
	return api;
}
//#endregion
//#region src/infra/kysely-sync-cache-state.ts
const kyselyByDatabase = /* @__PURE__ */ new WeakMap();
const queryErrorHandlerByDatabase = /* @__PURE__ */ new WeakMap();
const statementCacheSymbol = Symbol("openclaw.kyselySyncStatementCache");
/** Register the lifecycle owner's handler for synchronous Kysely query failures. */
function registerNodeSqliteKyselyQueryErrorHandler(db, handler) {
	queryErrorHandlerByDatabase.set(db, handler);
}
/** Drop cached Kysely state for a DatabaseSync. */
function clearNodeSqliteKyselyCacheForDatabase(db) {
	delete db[statementCacheSymbol];
	kyselyByDatabase.delete(db);
	queryErrorHandlerByDatabase.delete(db);
}
//#endregion
//#region src/infra/sqlite-busy-timeout.ts
const lockFailureReportingByDatabase = /* @__PURE__ */ new WeakMap();
function normalizeSqliteNonNegativeInteger(value, label) {
	if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
	return value;
}
function readSqliteBusyTimeout(database) {
	const row = database.prepare("PRAGMA busy_timeout").get();
	const value = row?.busy_timeout ?? row?.timeout;
	return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}
function setSqliteBusyTimeout(database, busyTimeoutMs) {
	const normalizedTimeoutMs = normalizeSqliteNonNegativeInteger(busyTimeoutMs, "busyTimeoutMs");
	database.exec(`PRAGMA busy_timeout = ${normalizedTimeoutMs}`);
}
function shouldReportSqliteLockFailure(database) {
	return lockFailureReportingByDatabase.get(database) !== "suppress";
}
/** Run one synchronous operation with a temporary connection-local busy timeout. */
function runWithSqliteBusyTimeout(database, busyTimeoutMs, operation, options = {}) {
	const normalizedTimeoutMs = normalizeSqliteNonNegativeInteger(busyTimeoutMs, "busyTimeoutMs");
	const previousBusyTimeoutMs = readSqliteBusyTimeout(database);
	const previousLockFailureReporting = lockFailureReportingByDatabase.get(database);
	if (options.lockFailureReporting) lockFailureReportingByDatabase.set(database, options.lockFailureReporting);
	if (previousBusyTimeoutMs !== normalizedTimeoutMs) setSqliteBusyTimeout(database, normalizedTimeoutMs);
	try {
		return operation();
	} finally {
		if (database.isOpen && previousBusyTimeoutMs !== normalizedTimeoutMs) setSqliteBusyTimeout(database, previousBusyTimeoutMs);
		if (previousLockFailureReporting) lockFailureReportingByDatabase.set(database, previousLockFailureReporting);
		else lockFailureReportingByDatabase.delete(database);
	}
}
//#endregion
//#region V sqlite-hold-callsite-v1: who entered a slow SQLite transaction (logging only)
function __vSqliteHoldCallers() {
	try {
		const limit = Error.stackTraceLimit;
		let stack;
		Error.stackTraceLimit = 40;
		try {
			stack = new Error().stack;
		} finally {
			Error.stackTraceLimit = limit;
		}
		if (typeof stack !== "string") return void 0;
		const frames = [];
		for (const line of stack.split("\n")) {
			const text = line.trim();
			if (!text.startsWith("at ")) continue;
			frames.push(text.slice(3).replace(/(?:file:\/\/)?\/(?:[^\s()/]+\/)*([^\s()/]+\/[^\s()/]+:\d+:\d+)/gu, "$1"));
		}
		let start = frames.findIndex((frame) => /^(?:[\w$]+\.)?runOpenClawAgentWriteTransaction\b/u.test(frame));
		if (start >= 0) start += 1;
		else {
			start = frames.findIndex((frame) => !/\bnode-sqlite-[^\s/()]*\.js:/u.test(frame));
			if (start < 0) return void 0;
		}
		const callers = frames.slice(start, start + 8);
		return callers.length > 0 ? callers : void 0;
	} catch {
		return void 0;
	}
}
//#endregion
//#region src/infra/sqlite-transaction.ts
const transactionDepthByDatabase = /* @__PURE__ */ new WeakMap();
const SQLITE_LOCK_ERROR_CODES = /* @__PURE__ */ new Set(["SQLITE_BUSY", "SQLITE_LOCKED"]);
const SQLITE_BUSY_RESULT_CODE = 5;
const SQLITE_LOCKED_RESULT_CODE = 6;
const SQLITE_CORRUPT_RESULT_CODE = 11;
const SQLITE_NOTADB_RESULT_CODE = 26;
const SQLITE_PRIMARY_RESULT_CODE_MASK = 255;
const DEFAULT_SLOW_BUSY_WAIT_MS = 1e3;
const DEFAULT_SLOW_TRANSACTION_HOLD_MS = 1e3;
let nextSavepointId = 0;
const transactionLog = createSubsystemLogger("sqlite/transaction");
function nextSavepointName() {
	nextSavepointId += 1;
	return `openclaw_tx_${nextSavepointId}`;
}
function assertSyncTransactionResult(value) {
	if (isPromiseLike(value)) throw new Error("SQLite write transactions must be synchronous; Promise returns are not supported.");
}
function sqliteErrorCode(error) {
	const code = error && typeof error === "object" ? error.code : void 0;
	return typeof code === "string" ? code : void 0;
}
function sqliteExtendedResultCode(error) {
	const errcode = error && typeof error === "object" ? error.errcode : void 0;
	return typeof errcode === "number" && Number.isInteger(errcode) ? errcode : void 0;
}
function sqlitePrimaryResultCode(error) {
	const errcode = sqliteExtendedResultCode(error);
	return errcode === void 0 ? void 0 : errcode & SQLITE_PRIMARY_RESULT_CODE_MASK;
}
function isSqliteLockError(error) {
	const code = sqliteErrorCode(error);
	if (code !== void 0 && SQLITE_LOCK_ERROR_CODES.has(code)) return true;
	const primaryCode = sqlitePrimaryResultCode(error);
	return primaryCode === SQLITE_BUSY_RESULT_CODE || primaryCode === SQLITE_LOCKED_RESULT_CODE;
}
/** Report proven file damage (corrupt page or non-database header), not transient failure. */
function isSqliteCorruptionError(error) {
	const primaryCode = sqlitePrimaryResultCode(error);
	return primaryCode === SQLITE_CORRUPT_RESULT_CODE || primaryCode === SQLITE_NOTADB_RESULT_CODE;
}
function slowBusyWaitThresholdMs(options) {
	if (options?.busyTimeoutMs === void 0 || options.busyTimeoutMs <= 0) return DEFAULT_SLOW_BUSY_WAIT_MS;
	return Math.min(DEFAULT_SLOW_BUSY_WAIT_MS, options.busyTimeoutMs);
}
function slowTransactionHoldThresholdMs(options) {
	return options?.slowTransactionHoldMs ?? DEFAULT_SLOW_TRANSACTION_HOLD_MS;
}
function transactionLogger(options) {
	return options?.logger ?? transactionLog;
}
function logSlowTransactionHold(params) {
	if (params.elapsedMs < slowTransactionHoldThresholdMs(params.options)) return;
	const callers = __vSqliteHoldCallers(); // V sqlite-hold-callsite-v1
	transactionLogger(params.options).warn("slow SQLite transaction hold", {
		async: false,
		...params.options?.databaseLabel ? { database: params.options.databaseLabel } : {},
		elapsedMs: params.elapsedMs,
		...params.options?.operationLabel ? { operation: params.options.operationLabel } : {},
		pid: process.pid,
		thresholdMs: slowTransactionHoldThresholdMs(params.options),
		...callers ? { callers } : {}
	});
}
function logSlowTransactionStep(params) {
	if (params.elapsedMs < slowBusyWaitThresholdMs(params.options)) return;
	transactionLogger(params.options).warn("slow SQLite transaction lock wait", {
		async: false,
		...params.options?.busyTimeoutMs !== void 0 ? { busyTimeoutMs: params.options.busyTimeoutMs } : {},
		...params.options?.databaseLabel ? { database: params.options.databaseLabel } : {},
		elapsedMs: params.elapsedMs,
		...params.options?.operationLabel ? { operation: params.options.operationLabel } : {},
		pid: process.pid,
		step: params.step
	});
}
function execTimedTransactionStep(params) {
	const startedAt = Date.now();
	try {
		params.db.exec(params.sql);
		const elapsedMs = Date.now() - startedAt;
		logSlowTransactionStep({
			elapsedMs,
			options: params.options,
			step: params.step
		});
		return elapsedMs;
	} catch (error) {
		const elapsedMs = Date.now() - startedAt;
		if (isSqliteLockError(error) && shouldReportSqliteLockFailure(params.db)) {
			const sqliteErrcode = sqliteExtendedResultCode(error);
			const sqlitePrimaryCode = sqlitePrimaryResultCode(error);
			transactionLogger(params.options).warn("SQLite transaction lock wait failed", {
				async: false,
				...params.options?.busyTimeoutMs !== void 0 ? { busyTimeoutMs: params.options.busyTimeoutMs } : {},
				...params.options?.databaseLabel ? { database: params.options.databaseLabel } : {},
				code: sqliteErrorCode(error),
				elapsedMs,
				failureKind: "lock-contention",
				...params.options?.operationLabel ? { operation: params.options.operationLabel } : {},
				pid: process.pid,
				...sqliteErrcode !== void 0 ? { sqliteErrcode } : {},
				...sqlitePrimaryCode !== void 0 ? { sqlitePrimaryCode } : {},
				step: params.step
			});
		}
		throw error;
	}
}
function beginTransaction(db, options, mode) {
	execTimedTransactionStep({
		db,
		options,
		sql: mode === "immediate" ? "BEGIN IMMEDIATE" : "BEGIN",
		step: "begin"
	});
}
function commitImmediateTransaction(db, options) {
	execTimedTransactionStep({
		db,
		options,
		sql: "COMMIT",
		step: "commit"
	});
}
function abortImmediateTransaction(db) {
	try {
		db.exec("ROLLBACK");
	} catch {
		try {
			clearNodeSqliteKyselyCacheForDatabase(db);
			db.close();
		} catch {}
	}
}
function getTransactionDepth(db) {
	return transactionDepthByDatabase.get(db) ?? 0;
}
function setTransactionDepth(db, depth) {
	if (depth <= 0) {
		transactionDepthByDatabase.delete(db);
		return;
	}
	transactionDepthByDatabase.set(db, depth);
}
function runSqliteTransactionSync(db, operation, mode, options) {
	const depth = getTransactionDepth(db);
	if (depth > 0) {
		const savepointName = nextSavepointName();
		db.exec(`SAVEPOINT ${savepointName}`);
		setTransactionDepth(db, depth + 1);
		try {
			const result = operation();
			assertSyncTransactionResult(result);
			db.exec(`RELEASE SAVEPOINT ${savepointName}`);
			return result;
		} catch (error) {
			try {
				db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
			} finally {
				db.exec(`RELEASE SAVEPOINT ${savepointName}`);
			}
			throw error;
		} finally {
			setTransactionDepth(db, depth);
		}
	}
	const vTailBeginAt = Date.now(); // V codex-turn-tail-v1
	beginTransaction(db, options, mode);
	const vTailWaitMs = Date.now() - vTailBeginAt;
	setTransactionDepth(db, 1);
	let transactionStillActive = true;
	let result;
	const transactionStartedAt = Date.now();
	try {
		result = operation();
		assertSyncTransactionResult(result);
	} catch (error) {
		try {
			abortImmediateTransaction(db);
			transactionStillActive = false;
		} catch {}
		throw error;
	} finally {
		if (!transactionStillActive) setTransactionDepth(db, 0);
	}
	try {
		logSlowTransactionHold({
			elapsedMs: Date.now() - transactionStartedAt,
			options
		});
		{
			// V codex-turn-tail-v1: transactions during a Codex turn's tail
			const vTail = __vCodexTurnTail();
			const vTailHoldMs = Date.now() - transactionStartedAt;
			if (vTail.active() && (vTailWaitMs >= 20 || vTailHoldMs >= 50)) vTail.note("tx", { op: options?.operationLabel ?? null, waitMs: vTailWaitMs, holdMs: vTailHoldMs });
		}
		commitImmediateTransaction(db, options);
		transactionStillActive = false;
		return result;
	} catch (error) {
		try {
			abortImmediateTransaction(db);
			transactionStillActive = false;
		} catch {}
		throw error;
	} finally {
		if (!transactionStillActive) setTransactionDepth(db, 0);
	}
}
/** Run synchronous reads against one deferred SQLite snapshot. */
function runSqliteDeferredTransactionSync(db, operation, options) {
	return runSqliteTransactionSync(db, operation, "deferred", options);
}
function runSqliteImmediateTransactionSync(db, operation, options) {
	return runSqliteTransactionSync(db, operation, "immediate", options);
}
//#endregion
//#region src/infra/node-sqlite.ts
const require = createRequire(import.meta.url);
let validatedSqliteModule;
function resolveSqliteFilesystemPath(pathname) {
	if (process.platform !== "win32") return pathname;
	return path.toNamespacedPath(path.resolve(pathname));
}
function resolveNodeSqliteLocation(location) {
	if (location === "" || location === ":memory:" || location.startsWith("file:")) return location;
	return resolveSqliteFilesystemPath(location);
}
/** Build an immutable SQLite URI without losing the Windows long-path namespace. */
function resolveImmutableSqliteFileUri(pathname, platform = process.platform) {
	if (platform === "win32") {
		const namespacedPath = path.win32.toNamespacedPath(path.win32.resolve(pathname));
		return `file:${encodeURIComponent(namespacedPath)}?mode=ro&immutable=1`;
	}
	return `${pathToFileURL(path.resolve(pathname)).href}?mode=ro&immutable=1`;
}
function assertSqliteWalResetSafeVersion(version, nodeVersion) {
	if (isSqliteWalResetSafeVersion(version)) return;
	const variables = process.config?.variables;
	const isShared = variables?.node_shared_sqlite === true || variables?.node_shared_sqlite === "true";
	throw new Error(`OpenClaw requires SQLite 3.51.3+, 3.50.7+ within 3.50.x, or 3.44.6+ within 3.44.x for WAL safety; Node ${nodeVersion} ${isShared ? "uses shared system" : "embeds"} SQLite ${version}, which is affected by the upstream WAL-reset database corruption bug. ${isShared ? "Upgrade the system SQLite library to one of those safe versions, or use a Node build embedding a safe version." : "Upgrade to Node 22.22.3+, 24.15.0+, or 25.9.0+ before retrying."}`);
}
function assertSafeSqliteRuntime(sqlite) {
	if (validatedSqliteModule === sqlite) return;
	const database = new sqlite.DatabaseSync(":memory:");
	try {
		const row = database.prepare("SELECT sqlite_version() AS version").get();
		assertSqliteWalResetSafeVersion(typeof row?.version === "string" ? row.version : "unknown", process.versions.node);
		validatedSqliteModule = sqlite;
	} finally {
		database.close();
	}
}
/** Load node:sqlite after installing the process warning filter. */
function requireNodeSqlite() {
	installProcessWarningFilter();
	try {
		const sqlite = require("node:sqlite");
		assertSafeSqliteRuntime(sqlite);
		return sqlite;
	} catch (err) {
		const message = formatErrorMessage(err);
		throw new Error(`SQLite support is unavailable or unsafe in this Node runtime. ${message}`, { cause: err });
	}
}
/** Open node:sqlite through OpenClaw's runtime and filesystem-location boundary. */
function openNodeSqliteDatabase(location, options) {
	const sqlite = requireNodeSqlite();
	const resolvedLocation = resolveNodeSqliteLocation(location);
	return options === void 0 ? new sqlite.DatabaseSync(resolvedLocation) : new sqlite.DatabaseSync(resolvedLocation, options);
}
/** Hold a raw exclusive transaction until release for cross-process coordination. */
function tryAcquireExclusiveSqliteCoordinator(location, options = {}) {
	const busyTimeoutMs = Math.max(0, Math.trunc(options.busyTimeoutMs ?? 0));
	const database = openNodeSqliteDatabase(location);
	try {
		database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}; BEGIN EXCLUSIVE;`);
	} catch (error) {
		database.close();
		if (isSqliteLockError(error)) return null;
		throw error;
	}
	return { release: () => {
		const errors = [];
		try {
			database.exec("ROLLBACK");
		} catch (error) {
			errors.push(error);
		}
		try {
			database.close();
		} catch (error) {
			errors.push(error);
		}
		if (errors.length === 1) throw errors[0];
		if (errors.length > 1) throw new AggregateError(errors, "SQLite coordinator rollback and close both failed");
	} };
}
//#endregion
export { queryErrorHandlerByDatabase as _, resolveSqliteFilesystemPath as a, isSqliteLockError as c, normalizeSqliteNonNegativeInteger as d, readSqliteBusyTimeout as f, kyselyByDatabase as g, clearNodeSqliteKyselyCacheForDatabase as h, resolveNodeSqliteLocation as i, runSqliteDeferredTransactionSync as l, setSqliteBusyTimeout as m, requireNodeSqlite as n, tryAcquireExclusiveSqliteCoordinator as o, runWithSqliteBusyTimeout as p, resolveImmutableSqliteFileUri as r, isSqliteCorruptionError as s, openNodeSqliteDatabase as t, runSqliteImmediateTransactionSync as u, registerNodeSqliteKyselyQueryErrorHandler as v, statementCacheSymbol as y };
