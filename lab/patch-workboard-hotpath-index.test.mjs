import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { INDEX_SQL, MARKER, patchSqliteStore } from './patch-workboard-hotpath-index.mjs';

const STORE = `function ensureWorkboardSchema(db) {
\tdb.exec(WORKBOARD_SCHEMA_SQL);
\tensureColumn(db, "workboard_boards", "automation_job_id", "automation_job_id TEXT");
\tensureColumn(db, "workboard_cards", "lifecycle_status_source_updated_at", "lifecycle_status_source_updated_at INTEGER");
\tconst migrationId = \`schema-\${SCHEMA_VERSION}\`;
}`;

// the two queries exactly as V's sqlite-store-CH-caj1l.js runs them
const AGG = `SELECT board_id, status, COUNT(*) AS total, SUM(CASE WHEN archived_at IS NOT NULL AND archived_at <> 0 THEN 1 ELSE 0 END) AS archived, MAX(updated_at) AS updated_at FROM workboard_cards GROUP BY board_id, status ORDER BY board_id ASC, status ASC`;
const MATCH = `SELECT id, agent_id, session_key, run_id, execution_id, execution_session_key, execution_run_id, archived_at,
  CASE WHEN linked THEN NULL WHEN json_valid(automation_json) THEN json_type(automation_json, '$.boardId') END AS automation_board_type,
  CASE WHEN linked THEN NULL WHEN json_valid(automation_json) THEN json_extract(automation_json, '$.boardId') END AS automation_board_id,
  CASE WHEN linked OR automation_json IS NULL OR automation_json = '' THEN NULL
    WHEN json_valid(automation_json) AND (json_type(automation_json, '$.boardId') IS NULL OR json_type(automation_json, '$.boardId') IN ('null', 'text')) THEN NULL
    ELSE automation_json END AS automation_json
  FROM (SELECT *, (coalesce(session_key, '') <> '' OR (coalesce(execution_id, '') <> '' AND coalesce(execution_session_key, '') <> '')) AS linked
    FROM workboard_cards WHERE NOT (typeof(archived_at) = 'integer' AND archived_at <> 0))
  ORDER BY created_at ASC, id ASC`;

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE workboard_cards (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, title TEXT NOT NULL, notes TEXT, status TEXT NOT NULL, priority TEXT NOT NULL, agent_id TEXT, session_key TEXT, run_id TEXT, position REAL NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, execution_id TEXT, execution_session_key TEXT, execution_run_id TEXT, automation_json TEXT, archived_at INTEGER) STRICT;
    CREATE INDEX workboard_cards_board_status_idx ON workboard_cards(board_id, status, position);
    CREATE INDEX workboard_cards_session_idx ON workboard_cards(session_key, run_id);`);
  const ins = db.prepare('INSERT INTO workboard_cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for (let i = 0; i < 600; i++) {
    const linked = i % 7 !== 0;
    const automation = [null, '', 'not json', JSON.stringify({ boardId: 'b1' }), JSON.stringify({ boardId: null }), JSON.stringify({ boardId: 7, x: 1 })][i % 6];
    ins.run(`c${i}`, `b${i % 3}`, 't', 'n'.repeat(200), ['todo', 'running', 'done'][i % 3], 'normal', i % 5 ? 'makaron' : null,
      linked && i % 2 ? `agent:makaron:subagent:workboard-b-c${i}` : (i % 11 === 0 ? '' : null), linked ? `workboard:c${i}:1` : null, i,
      1000 + ((i * 37) % 600) - (i % 4 === 0 ? 0 : 1) * (i % 9), 2000 + i, linked && i % 2 === 0 ? `e${i}` : null, linked && i % 2 === 0 ? `k${i}` : null, null,
      automation, [null, 0, 5, null][i % 4]);
  }
  return db;
}

test('the store patch adds the indexes once, after the column migrations', () => {
  const out = patchSqliteStore(STORE);
  assert.ok(out.indexOf(MARKER) > out.indexOf('lifecycle_status_source_updated_at INTEGER"'));
  assert.ok(out.indexOf(MARKER) < out.indexOf('const migrationId'));
  assert.ok(out.includes('workboard_cards_board_agg_idx') && out.includes('workboard_cards_lifecycle_link_idx'));
  assert.throws(() => patchSqliteStore(out), /already/);
  assert.throws(() => patchSqliteStore(STORE.replace('lifecycle_status_source_updated_at INTEGER', 'x')), /anchor/);
});

test('with the indexes both queries return the same rows and the aggregate never reads the table', () => {
  const db = fixture();
  const before = [db.prepare(AGG).all(), db.prepare(MATCH).all()].map((rows) => JSON.stringify(rows.map((r) => ({ ...r }))));
  db.exec(INDEX_SQL);
  db.exec(INDEX_SQL); // idempotent
  const after = [db.prepare(AGG).all(), db.prepare(MATCH).all()].map((rows) => JSON.stringify(rows.map((r) => ({ ...r }))));
  assert.deepEqual(after, before);
  const plan = (sql) => db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all().map((r) => r.detail).join(' | ');
  assert.match(plan(AGG), /COVERING INDEX workboard_cards_board_agg_idx/);
  assert.match(plan(MATCH), /workboard_cards_lifecycle_link_idx/);
  assert.doesNotMatch(plan(MATCH), /TEMP B-TREE/);
});
