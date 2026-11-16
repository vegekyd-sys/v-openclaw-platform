import {readAheadDatabase} from "../db91-read-ahead.mjs";
import { captureNativeVerificationFile as db91CaptureNative, beginNativeVerification as db91BeginNative, finishNativeVerification as db91FinishNative } from "../db91-integrity-gate.mjs";
import { o as OPENCLAW_SQLITE_BUSY_TIMEOUT_MS } from "../openclaw-state-db-contract-CsSSYjX0.js";
//#region src/state/openclaw-database-verify.worker.ts
const DATABASE_VERIFY_CHILD_ARG = "--openclaw-database-verify-child";
function isVerifyTarget(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const target = value;
	return typeof target.path === "string" && (target.kind === "agent" || target.kind === "state") && typeof target.label === "string";
}
function formatVerifyError(error) {
	return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
async function verifyOpenClawDatabase(target) {
	const [sqlite, integrity, location] = await Promise.all([
		import("../node-sqlite-9i-RkbXB.js"),
		import("../sqlite-integrity-B5B63SCI.js"),
		import("../sqlite-readonly-location-CnydfPBK.js")
	]);
	let cleanup;
	let database;
	let result = await (async () => {
		try {
			const db91Direct = target.kind === "agent" && Boolean(process.env.OPENCLAW_DB91_INTEGRITY_EPOCH);
			const prepared = db91Direct ? {location: target.path} : await location.prepareSqliteReadOnlyLocationInProcess(target.path);
			cleanup = prepared.cleanup;
			const db91ReadAhead = db91Direct ? await readAheadDatabase(target.path) : {enabled:false};
			const db91FileIdentity = db91Direct ? db91CaptureNative(target.path) : null;
			database = sqlite.openNodeSqliteDatabase(prepared.location, { readOnly: true });
			database.exec(`PRAGMA busy_timeout = ${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS};`);
			if (db91Direct) database.exec("BEGIN;");
			const db91Ticket = target.kind === "agent" && prepared.location === target.path ? db91BeginNative(database, target.path, {expectedFileIdentity: db91FileIdentity}) : null;
			const db91ScanStarted = performance.now();
			integrity.assertSqliteIntegrity(database, target.label);
			const db91ScanMs = Math.round(performance.now()-db91ScanStarted);
			if(process.env.OPENCLAW_DB91_PHASE_TRACE==='1')console.error('[parity-native-verify] '+JSON.stringify({agent:target.path.split('/').at(-3),scanMs:db91ScanMs,readAhead:db91ReadAhead}));
			const db91Verification = db91FinishNative(database, target.path, db91Ticket);
			if (db91Direct) database.exec("ROLLBACK;");
			return {
				path: target.path,
				db91Verification,
				ok: true
			};
		} catch (error) {
			const terminal = error instanceof Error && integrity.isTerminalSqliteIntegrityError(error);
			return {
				path: target.path,
				ok: false,
				error: formatVerifyError(error),
				terminal
			};
		}
	})();
	try {
		database?.close();
	} catch (error) {
		if (result.ok) result = {
			path: target.path,
			ok: false,
			error: formatVerifyError(error),
			terminal: false
		};
	} finally {
		cleanup?.();
	}
	return result;
}
/** Verify database files serially so large agent scans never compete for I/O. */
async function verifyOpenClawDatabases(targets) {
	const results = [];
	for (const target of targets) results.push(await verifyOpenClawDatabase(target));
	return results;
}
const sendToParent = process.argv[2] === DATABASE_VERIFY_CHILD_ARG ? process.send?.bind(process) : void 0;
if (sendToParent) process.once("message", (message) => {
	(async () => {
		try {
			const results = await verifyOpenClawDatabases(Array.isArray(message) ? message.filter(isVerifyTarget) : []);
			await new Promise((resolve, reject) => {
				sendToParent(results, (error) => {
					if (error) reject(error);
					else resolve();
				});
			});
		} catch {
			process.exitCode = 1;
		} finally {
			process.disconnect?.();
		}
	})();
});
//#endregion
export { verifyOpenClawDatabases };
