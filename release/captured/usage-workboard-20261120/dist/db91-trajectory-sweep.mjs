import assert from 'node:assert/strict';

// data_version is comparable only on the SAME open SQLite connection.
// No read transaction is held across acquisition of the native write transaction.
const version = database => database.db.prepare('PRAGMA main.data_version').get().data_version;
export function prepareTrajectorySweep(database, readRuns) {
  if (database.db.isTransaction) return null;
  const before = version(database);
  const runs = readRuns(database);
  if (before !== version(database)) return null;
  return {database, version: before, runs};
}
export function isTrajectorySweepCurrent(database, plan) {
  return Boolean(plan && plan.database === database && database.db.isTransaction && version(database) === plan.version);
}

export function patchTrajectorySweep(source) {
  const once = (from,to) => {assert.equal(source.split(from).length,2,'native trajectory anchor changed');source=source.replace(from,to);};
  assert(!source.includes('prepareTrajectorySweep'));
  once('import { y as runOpenClawAgentWriteTransaction }', 'import { g as openOpenClawAgentDatabase, y as runOpenClawAgentWriteTransaction }');
  once('\tlet sweptDatabase;\n', `\tlet sweptDatabase;
 const detachedSweep = (scope.env ?? process.env).OPENCLAW_DB91_TRAJECTORY_SWEEP_ENABLE === "1";
 let sweepPlan;
 if (detachedSweep) {
  const database = openOpenClawAgentDatabase(options);
  const last = lastGlobalSweepAtByDatabase.get(database);
  if (last === undefined || sweepAt < last || sweepAt - last >= TRAJECTORY_RUNTIME_GLOBAL_SWEEP_INTERVAL_MS) sweepPlan = prepareTrajectorySweep(database, readSqliteTrajectoryRuntimeRuns);
 }
`);
  once('\t\t\tsweepSqliteTrajectoryRuntimeRetention(database, scope.sessionId, sweepAt, maxGlobalRuntimeBytes);\n\t\t\tsweptDatabase = database;', `   if (!detachedSweep) {
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
`);
  once('function sweepSqliteTrajectoryRuntimeRetention(database, currentSessionId, now, maxGlobalRuntimeBytes) {\n\tconst runs = readSqliteTrajectoryRuntimeRuns(database);', 'function sweepSqliteTrajectoryRuntimeRetention(database, currentSessionId, now, maxGlobalRuntimeBytes, preparedRuns) {\n\tconst runs = preparedRuns ?? readSqliteTrajectoryRuntimeRuns(database);');
  return 'import {prepareTrajectorySweep,isTrajectorySweepCurrent} from "./db91-trajectory-sweep.mjs";\n'+source;
}
