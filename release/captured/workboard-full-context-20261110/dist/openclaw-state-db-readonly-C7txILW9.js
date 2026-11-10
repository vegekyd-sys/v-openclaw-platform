import { h as clearNodeSqliteKyselyCacheForDatabase, t as openNodeSqliteDatabase } from "./node-sqlite-CL-d6drd.js";
import { a as prepareSqliteReadOnlyLocationSyncInProcess, i as prepareSqliteReadOnlyLocationSync } from "./sqlite-readonly-location-BvtpsFvn.js";
import { o as OPENCLAW_SQLITE_BUSY_TIMEOUT_MS } from "./openclaw-state-db-contract-CsSSYjX0.js";
import { a as readSqliteUserVersion, n as createNewerSqliteSchemaVersionError } from "./sqlite-user-version-DkmzAA6V.js";
import { o as openClawStateDatabaseCache } from "./openclaw-state-db-cache-AunrvrzG.js";
import { o as resolveOpenClawStateSqlitePath } from "./openclaw-state-db.paths-Dwj4ZWNN.js";
import { closeSync, lstatSync, openSync, readSync, statSync } from "node:fs";
import path from "node:path";
//#region src/state/openclaw-state-db-readonly.ts
function resolveReadOnlyPath(options) {
	return path.resolve(options.path ?? resolveOpenClawStateSqlitePath(options.env ?? process.env));
}
function existingPathOrUndefined(pathname) {
	try {
		statSync(pathname);
		return pathname;
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}
}
function assertSupportedSchemaVersion(db, pathname) {
	const userVersion = readSqliteUserVersion(db);
	if (userVersion > 15) throw createNewerSqliteSchemaVersionError("OpenClaw state database", pathname, userVersion, 15);
}
function withOpenClawStateDatabaseReadOnlyIfOpen(operation, options, pathname) {
	const opened = openClawStateDatabaseCache.getOpenClawStateDatabaseIfOpenAtPath(resolveReadOnlyPath(options));
	if (!opened || opened.db.isTransaction) return { reused: false };
	try {
		assertSupportedSchemaVersion(opened.db, pathname);
		return {
			reused: true,
			value: operation(opened)
		};
	} catch (error) {
		openClawStateDatabaseCache.evictOpenClawStateDatabaseAfterCorruption(opened, error);
		throw error;
	}
}
function withFreshOpenClawStateDatabaseReadOnly(operation, options, pathname, location = pathname) {
	const env = options.env ?? process.env;
	openClawStateDatabaseCache.assertOpenClawStateDatabaseFreshOpenAllowedAtPath(resolveReadOnlyPath(options), env);
	const db = openNodeSqliteDatabase(location, { readOnly: true });
	try {
		db.exec(`PRAGMA busy_timeout = ${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS};`);
		assertSupportedSchemaVersion(db, pathname);
		return operation({
			db,
			path: pathname
		});
	} finally {
		clearNodeSqliteKyselyCacheForDatabase(db);
		db.close();
	}
}
/**
* Read shared state without joining the writable lifecycle.
*
* CLI metadata reads can overlap a live Gateway. Keep them off schema repair,
* journal-mode setup, checkpoints, and permission mutation owned by writers.
*/
function withOpenClawStateDatabaseReadOnly(operation, options = {}) {
	const pathname = resolveReadOnlyPath(options);
	const reused = withOpenClawStateDatabaseReadOnlyIfOpen(operation, options, pathname);
	if (reused.reused) return reused.value;
	return withFreshOpenClawStateDatabaseReadOnly(operation, options, pathname);
}
/** Read existing shared state while preserving non-missing filesystem failures. */
function withExistingOpenClawStateDatabaseReadOnly(operation, options = {}) {
	const pathname = resolveReadOnlyPath(options);
	const reused = withOpenClawStateDatabaseReadOnlyIfOpen(operation, options, pathname);
	if (reused.reused) return reused.value;
	const existingPath = existingPathOrUndefined(pathname);
	return existingPath === void 0 ? void 0 : withFreshOpenClawStateDatabaseReadOnly(operation, {
		...options,
		path: existingPath
	}, existingPath);
}
// cli-readonly-live: read a live WAL in place when its sidecars already exist and belong to this user.
function isWalHeader(pathname) {
	const descriptor = openSync(pathname, "r");
	try {
		const header = Buffer.alloc(20);
		return readSync(descriptor, header, 0, header.length, 0) === header.length && header.subarray(0, 16).toString("utf8") === "SQLite format 3\0" && header[18] === 2 && header[19] === 2;
	} finally {
		closeSync(descriptor);
	}
}
/**
* A live WAL database whose -wal and -shm already exist and belong to this user
* is read through SQLite's own reader protocol. A read-only connection uses the
* existing sidecars, never checkpoints, and leaves them in place on close, so
* nothing new appears beside the source. Copying instead costs the whole
* database per read and starts over whenever a writer appends to the WAL
* mid-copy (a live Gateway does), which made each CLI Gateway call copy the
* shared state several times. Missing sidecars, another owner, or rollback
* journals keep the private snapshot. OPENCLAW_V_LIVE_WAL_READS=0 restores it.
*/
function canReadLiveWalWithoutNewSidecars(pathname) {
	if (process.env.OPENCLAW_V_LIVE_WAL_READS === "0") return false;
	const uid = process.geteuid?.();
	if (uid === void 0) return false;
	try {
		for (const file of [
			pathname,
			`${pathname}-wal`,
			`${pathname}-shm`
		]) {
			const stat = lstatSync(file);
			if (!stat.isFile() || stat.uid !== uid) return false;
		}
		if (existingPathOrUndefined(`${pathname}-journal`) !== void 0) return false;
		return isWalHeader(pathname);
	} catch {
		return false;
	}
}
/** Read existing shared state without creating or updating its SQLite sidecars. */
function withExistingOpenClawStateDatabaseArtifactPreservingReadOnly(operation, options = {}) {
	const pathname = resolveReadOnlyPath(options);
	const reused = withOpenClawStateDatabaseReadOnlyIfOpen(operation, options, pathname);
	if (reused.reused) return reused.value;
	const existingPath = existingPathOrUndefined(pathname);
	if (existingPath === void 0) return;
	const writerOpen = openClawStateDatabaseCache.getOpenClawStateDatabaseIfOpenAtPath(resolveReadOnlyPath(options));
	if (!writerOpen && canReadLiveWalWithoutNewSidecars(existingPath)) return withFreshOpenClawStateDatabaseReadOnly(operation, {
		...options,
		path: existingPath
	}, existingPath);
	const prepared = (writerOpen ? prepareSqliteReadOnlyLocationSync : prepareSqliteReadOnlyLocationSyncInProcess)(existingPath);
	try {
		return withFreshOpenClawStateDatabaseReadOnly(operation, {
			...options,
			path: existingPath
		}, existingPath, prepared.location);
	} finally {
		prepared.cleanup();
	}
}
//#endregion
export { withExistingOpenClawStateDatabaseReadOnly as n, withOpenClawStateDatabaseReadOnly as r, withExistingOpenClawStateDatabaseArtifactPreservingReadOnly as t };
