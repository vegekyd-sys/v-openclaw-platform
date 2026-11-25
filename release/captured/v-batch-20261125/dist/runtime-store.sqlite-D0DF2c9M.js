import {prepareTrajectorySweep,isTrajectorySweepCurrent} from "./db91-trajectory-sweep.mjs";
import { y as parseDateStringTimestampMs } from "./number-coercion-CLj0HTDM.js";
import { i as getNodeSqliteKysely, n as executeSqliteQuerySync, r as executeSqliteQueryTakeFirstSync } from "./kysely-sync-DKYGT267.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import "./session-key-CRjxKW0X.js";
import { g as openOpenClawAgentDatabase, y as runOpenClawAgentWriteTransaction } from "./openclaw-agent-db-CUTe8BX6.js";
import { n as withOpenClawAgentDatabaseReadOnly } from "./openclaw-agent-db-readonly-wb-jdztx.js";
import { u as resolveSqliteTargetFromSessionStorePath } from "./store-entry-CMuTqREZ.js";
import "./paths-DBZSw_GC.js";
//#region src/trajectory/runtime-store.sqlite.ts
const TRAJECTORY_RUNTIME_RETENTION_MAX_AGE_MS = 12096e5;
const TRAJECTORY_RUNTIME_GLOBAL_MAX_BYTES = 536870912;
const TRAJECTORY_RUNTIME_GLOBAL_SWEEP_INTERVAL_MS = 36e5;
const TRAJECTORY_RUNTIME_DELETE_RUN_BATCH_SIZE = 100;
const lastGlobalSweepAtByDatabase = /* @__PURE__ */ new WeakMap();
/** Appends runtime trajectory events to the per-agent SQLite session store. */
function appendSqliteTrajectoryRuntimeEvents(scope, events) {
	if (events.length === 0) return;
	const options = toDatabaseOptions(scope);
	const maxRuntimeBytes = Math.max(1, Math.floor(scope.maxRuntimeBytes ?? 10485760));
	const maxGlobalRuntimeBytes = Math.max(1, Math.floor(scope.maxGlobalRuntimeBytes ?? TRAJECTORY_RUNTIME_GLOBAL_MAX_BYTES));
	const sweepAt = Date.now();
	let sweptDatabase;
 const detachedSweep = (scope.env ?? process.env).OPENCLAW_DB91_TRAJECTORY_SWEEP_ENABLE === "1";
 let sweepPlan;
 if (detachedSweep) {
  const database = openOpenClawAgentDatabase(options);
  const last = lastGlobalSweepAtByDatabase.get(database);
  if (last === undefined || sweepAt < last || sweepAt - last >= TRAJECTORY_RUNTIME_GLOBAL_SWEEP_INTERVAL_MS) sweepPlan = prepareTrajectorySweep(database, readSqliteTrajectoryRuntimeRuns);
 }
	runOpenClawAgentWriteTransaction((database) => {
		const db = getTrajectoryKysely(database.db);
		let seq = readNextTrajectorySeq(database, scope.sessionId);
		for (const event of events) {
			const eventJson = JSON.stringify(event);
			executeSqliteQuerySync(database.db, db.insertInto("trajectory_runtime_events").values({
				session_id: scope.sessionId,
				seq,
				run_id: event.runId ?? null,
				event_json: eventJson,
				created_at: readTrajectoryEventTimestamp(event) ?? Date.now()
			}));
			seq += 1;
		}
		trimSqliteTrajectoryRuntimeWindow(database, scope.sessionId, maxRuntimeBytes);
		const lastSweptAt = lastGlobalSweepAtByDatabase.get(database);
		if (lastSweptAt === void 0 || sweepAt < lastSweptAt || sweepAt - lastSweptAt >= TRAJECTORY_RUNTIME_GLOBAL_SWEEP_INTERVAL_MS) {
   if (!detachedSweep) {
    sweepSqliteTrajectoryRuntimeRetention(database, scope.sessionId, sweepAt, maxGlobalRuntimeBytes);
    sweptDatabase = database;
   } else if (isTrajectorySweepCurrent(database, sweepPlan)) {
    // Only this session changed on this synchronous stack. Refresh its totals
    // after append/trim, preserving the native retention budget and policy.
    const current = database.db.prepare('SELECT session_id, run_id, MAX(created_at) AS newest_created_at, SUM(octet_length(event_json) + 1) AS runtime_bytes FROM trajectory_runtime_events WHERE session_id = ? GROUP BY session_id, run_id').all(scope.sessionId).map(row => ({sessionId:row.session_id,runId:row.run_id,newestCreatedAt:normalizeSqliteNumber(row.newest_created_at),runtimeBytes:normalizeSqliteNumber(row.runtime_bytes)}));
    const runs = [...sweepPlan.runs.filter(run => run.sessionId !== scope.sessionId), ...current];
    sweepSqliteTrajectoryRuntimeRetention(database, scope.sessionId, sweepAt, maxGlobalRuntimeBytes, runs);
    sweptDatabase = database;
   }
   // On concurrent mutation, keep the append and retry maintenance on a later
   // flush. Never mark an invalidated plan as successfully swept.

		}
	}, options);
	if (sweptDatabase) lastGlobalSweepAtByDatabase.set(sweptDatabase, sweepAt);
}
/** Loads runtime trajectory events from per-agent SQLite rows in storage order. */
async function loadSqliteTrajectoryRuntimeEvents(scope) {
	return loadSqliteTrajectoryRuntimeEventsSync(scope);
}
/** Loads runtime trajectory events synchronously for CLI and export paths. */
function loadSqliteTrajectoryRuntimeEventsSync(scope) {
	return loadSqliteTrajectoryRuntimeEventRowsSync(scope).map((row) => row.event);
}
/** Loads runtime trajectory event rows with storage seqs for follow/export cursors. */
function loadSqliteTrajectoryRuntimeEventRowsSync(scope) {
	const read = withOpenClawAgentDatabaseReadOnly((database) => {
		const db = getTrajectoryKysely(database.db);
		const tailEvents = scope.tailEvents !== void 0 && Number.isFinite(scope.tailEvents) ? Math.max(0, Math.floor(scope.tailEvents)) : void 0;
		let query = db.selectFrom("trajectory_runtime_events").select(["seq", "event_json"]).where("session_id", "=", scope.sessionId).orderBy("seq", tailEvents === void 0 ? "asc" : "desc");
		const afterSeq = scope.afterSeq;
		if (afterSeq !== void 0 && Number.isFinite(afterSeq)) query = query.where("seq", ">", Math.floor(afterSeq));
		const normalizedMaxEvents = scope.maxEvents !== void 0 && Number.isFinite(scope.maxEvents) ? Math.max(0, Math.floor(scope.maxEvents)) : void 0;
		const maxEvents = tailEvents === void 0 ? normalizedMaxEvents : normalizedMaxEvents === void 0 ? tailEvents : Math.min(tailEvents, normalizedMaxEvents);
		if (maxEvents !== void 0 && Number.isFinite(maxEvents)) query = query.limit(Math.max(0, Math.floor(maxEvents)));
		const rows = executeSqliteQuerySync(database.db, query).rows.map((row) => ({
			event: JSON.parse(row.event_json),
			seq: row.seq
		}));
		return tailEvents === void 0 ? rows : rows.toReversed();
	}, toDatabaseOptions(scope));
	return read.found ? read.value : [];
}
function sweepSqliteTrajectoryRuntimeRetention(database, currentSessionId, now, maxGlobalRuntimeBytes, preparedRuns) {
	const runs = preparedRuns ?? readSqliteTrajectoryRuntimeRuns(database);
	let retainedBytes = runs.reduce((total, run) => total + run.runtimeBytes, 0);
	const cutoff = now - TRAJECTORY_RUNTIME_RETENTION_MAX_AGE_MS;
	const deletedRuns = /* @__PURE__ */ new Set();
	for (const run of runs) if (run.sessionId !== currentSessionId && run.newestCreatedAt < cutoff) {
		deletedRuns.add(run);
		retainedBytes -= run.runtimeBytes;
	}
	for (const run of runs.toSorted(compareTrajectoryRuntimeRunsOldestFirst)) {
		if (retainedBytes <= maxGlobalRuntimeBytes) break;
		if (run.sessionId === currentSessionId || deletedRuns.has(run)) continue;
		deletedRuns.add(run);
		retainedBytes -= run.runtimeBytes;
	}
	deleteSqliteTrajectoryRuntimeRuns(database, [...deletedRuns]);
}
function readSqliteTrajectoryRuntimeRuns(database) {
	return database.db.prepare("SELECT session_id, run_id, MAX(created_at) AS newest_created_at, SUM(octet_length(event_json) + 1) AS runtime_bytes FROM trajectory_runtime_events GROUP BY session_id, run_id").all().map((row) => ({
		newestCreatedAt: normalizeSqliteNumber(row.newest_created_at),
		runId: row.run_id,
		runtimeBytes: normalizeSqliteNumber(row.runtime_bytes),
		sessionId: row.session_id
	}));
}
function deleteSqliteTrajectoryRuntimeRuns(database, runs) {
	const db = getTrajectoryKysely(database.db);
	for (let index = 0; index < runs.length; index += TRAJECTORY_RUNTIME_DELETE_RUN_BATCH_SIZE) {
		const batch = runs.slice(index, index + TRAJECTORY_RUNTIME_DELETE_RUN_BATCH_SIZE);
		executeSqliteQuerySync(database.db, db.deleteFrom("trajectory_runtime_events").where((eb) => eb.or(batch.map((run) => eb.and([eb("session_id", "=", run.sessionId), run.runId === null ? eb("run_id", "is", null) : eb("run_id", "=", run.runId)])))));
	}
}
function compareTrajectoryRuntimeRunsOldestFirst(left, right) {
	return left.newestCreatedAt - right.newestCreatedAt || left.sessionId.localeCompare(right.sessionId) || (left.runId ?? "").localeCompare(right.runId ?? "");
}
function getTrajectoryKysely(database) {
	return getNodeSqliteKysely(database);
}
function toDatabaseOptions(scope) {
	const requestedAgentId = scope.agentId ? normalizeAgentId(scope.agentId) : void 0;
	const target = resolveSqliteTargetFromSessionStorePath(scope.storePath, requestedAgentId ? { agentId: requestedAgentId } : {});
	if (requestedAgentId && target.agentId && requestedAgentId !== target.agentId) throw new Error(`SQLite trajectory store path belongs to agent ${target.agentId}; requested agent ${requestedAgentId}.`);
	const agentId = requestedAgentId ?? target.agentId;
	if (!agentId) throw new Error("Trajectory store scope requires an explicit agent id.");
	return {
		agentId,
		...scope.env ? { env: scope.env } : {},
		...target.path ? { path: target.path } : {}
	};
}
function readNextTrajectorySeq(database, sessionId) {
	const db = getTrajectoryKysely(database.db);
	const row = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("trajectory_runtime_events").select((eb) => eb.fn.max("seq").as("max_seq")).where("session_id", "=", sessionId));
	if (row?.max_seq === null || row?.max_seq === void 0) return 0;
	return normalizeSqliteNumber(row.max_seq) + 1;
}
function trimSqliteTrajectoryRuntimeWindow(database, sessionId, maxRuntimeBytes) {
	const db = getTrajectoryKysely(database.db);
	const rows = executeSqliteQuerySync(database.db, db.selectFrom("trajectory_runtime_events").select(["seq", "event_json"]).where("session_id", "=", sessionId).orderBy("seq", "asc")).rows;
	const removableSeqs = oldestTrajectorySeqsPastByteWindow(rows, maxRuntimeBytes);
	if (removableSeqs.length === 0) return;
	executeSqliteQuerySync(database.db, db.deleteFrom("trajectory_runtime_events").where("session_id", "=", sessionId).where("seq", "in", removableSeqs));
}
function oldestTrajectorySeqsPastByteWindow(rows, maxRuntimeBytes) {
	let totalBytes = rows.reduce((total, row) => total + trajectoryJsonlRowBytes(row.event_json), 0);
	const removableSeqs = [];
	for (const row of rows) {
		if (totalBytes <= maxRuntimeBytes) break;
		removableSeqs.push(row.seq);
		totalBytes -= trajectoryJsonlRowBytes(row.event_json);
	}
	return removableSeqs;
}
function trajectoryJsonlRowBytes(eventJson) {
	return Buffer.byteLength(eventJson, "utf8") + 1;
}
function readTrajectoryEventTimestamp(event) {
	return parseDateStringTimestampMs(event.ts);
}
function normalizeSqliteNumber(value) {
	return typeof value === "bigint" ? Number(value) : value;
}
//#endregion
export { loadSqliteTrajectoryRuntimeEventRowsSync as n, loadSqliteTrajectoryRuntimeEvents as r, appendSqliteTrajectoryRuntimeEvents as t };
