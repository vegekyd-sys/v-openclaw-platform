// workboard-full-sweep: one-shot worker for readCombinedLifecycleSnapshotInWorker (combined-store-gateway): reads and merges the
// durable session stores of a Workboard full lifecycle listing off the Gateway main thread and posts back the
// lifecycle fields of every merged entry. It starts from the main thread's canonical-key proofs.
import { parentPort, workerData } from "node:worker_threads";
import { adoptCanonicalSessionKeyValidatedPaths } from "./session-accessor.sqlite-transcript-state-Cz9g7S9v.js";
import { readDurableLifecycleSnapshot } from "./combined-store-gateway-BwDhjbIt.js";
import { a as loadSubagentSessionListRunsFromSqlite } from "./subagent-registry.store.sqlite-hzGu4QSk.js";
import { h as clearNodeSqliteKyselyCacheForDatabase, t as openNodeSqliteDatabase } from "./node-sqlite-CL-d6drd.js";
import { o as OPENCLAW_SQLITE_BUSY_TIMEOUT_MS } from "./openclaw-state-db-contract-CsSSYjX0.js";
// The session-list projection of the persisted subagent runs (the main thread's getSubagentRunsSnapshot reads the
// same query on its state database handle and ignores a failed read; here a failure leaves that read to it).
function readPersistedSubagentRuns(pathname) {
	if (typeof pathname !== "string" || !pathname) return;
	try {
		const db = openNodeSqliteDatabase(pathname, { readOnly: true });
		try {
			db.exec(`PRAGMA busy_timeout = ${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS};`);
			return loadSubagentSessionListRunsFromSqlite({ db });
		} finally {
			clearNodeSqliteKyselyCacheForDatabase(db);
			db.close();
		}
	} catch {
		return;
	}
}
try {
	adoptCanonicalSessionKeyValidatedPaths(workerData.canonicalValidatedPaths);
	const value = readDurableLifecycleSnapshot(workerData);
	const subagentRuns = readPersistedSubagentRuns(workerData.stateDatabasePath);
	parentPort.postMessage({
		ok: true,
		value: subagentRuns ? {
			...value,
			subagentRuns
		} : value
	});
} catch (error) {
	parentPort.postMessage({
		ok: false,
		error: {
			name: error?.name,
			message: error instanceof Error ? error.message : String(error),
			code: error?.code
		}
	});
}
