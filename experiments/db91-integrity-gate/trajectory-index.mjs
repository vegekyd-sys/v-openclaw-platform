// Optional additive index: no event content, retention policy or rows changed.
export const trajectoryIndexName = 'idx_agent_trajectory_runtime_budget_v1';
export const trajectoryIndexSql = `CREATE INDEX ${trajectoryIndexName} ON trajectory_runtime_events(session_id, run_id, created_at, octet_length(event_json) + 1)`;
export const trajectoryBudgetSql = 'SELECT session_id, run_id, MAX(created_at) AS newest_created_at, SUM(octet_length(event_json) + 1) AS runtime_bytes FROM trajectory_runtime_events GROUP BY session_id, run_id';
