import assert from 'node:assert/strict';
// Optional additive index: no event content, retention policy or rows changed.
export const trajectoryIndexName = 'idx_agent_trajectory_runtime_budget_v1';
export const trajectoryIndexSql = `CREATE INDEX ${trajectoryIndexName} ON trajectory_runtime_events(session_id, run_id, created_at, octet_length(event_json) + 1)`;
export const trajectoryBudgetSql = 'SELECT session_id, run_id, MAX(created_at) AS newest_created_at, SUM(octet_length(event_json) + 1) AS runtime_bytes FROM trajectory_runtime_events GROUP BY session_id, run_id';

// SQLite expression indexes require the expression to match. Kysely binds the
// constant 1 as a parameter, which prevents this aggregate from being covering.
// No interpolated inputs or altered retention semantics are involved here.
export function patchTrajectoryBudgetQuery(source) {
  const from = '\tconst db = getTrajectoryKysely(database.db);\n\treturn executeSqliteQuerySync(database.db, db.selectFrom("trajectory_runtime_events").select(["session_id", "run_id"]).select((eb) => [eb.fn.max("created_at").as("newest_created_at"), eb.fn.sum(eb(eb.fn("octet_length", ["event_json"]), "+", 1)).as("runtime_bytes")]).groupBy(["session_id", "run_id"])).rows.map((row) => ({';
  assert.equal(source.split(from).length, 2, 'native trajectory aggregate anchor changed');
  return source.replace(from, '\treturn database.db.prepare(' + JSON.stringify(trajectoryBudgetSql) + ').all().map((row) => ({');
}
