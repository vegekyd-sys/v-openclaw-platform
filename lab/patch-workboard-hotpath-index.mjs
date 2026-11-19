import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Two covering indexes for the Workboard reads that run on the Gateway main thread all day.
//
// V CPU profile 2026-11-19 14:33 CST (60 s): Workboard SQL took ~4 s of main thread.
//   - listBoards -> listBoardAggregates: 16 calls, ~100 ms each. GROUP BY board_id, status used
//     workboard_cards_board_status_idx but still read every row for archived_at / updated_at.
//   - every agent / subagent end -> syncWorkboardLifecycleEvent -> listLifecycleMatchLinks: 64 calls,
//     P90 120 ms, reading all ~20k unarchived cards (rows carry ~5.5 KB notes, ~1.7 KB automation).
// V's workboard.sqlite: 25,992 cards, 5,975 archived, 650 MB.
//
// With (board_id, status, archived_at, updated_at) the aggregate becomes a covering-index scan; with
// (created_at, id, archived_at, agent_id, session_key, run_id, execution_*) the lifecycle query walks
// the index in its ORDER BY and, thanks to SQLite's deferred seek, reads a table row only for the few
// unlinked cards whose automation it inspects. The queries are unchanged, so results are identical.
// Synthetic V-sized DB: aggregate 42 -> 1.5 ms, lifecycle 55 -> 14 ms, building both indexes 78 ms
// once (at the first store open after the patch; IF NOT EXISTS afterwards).

export const MARKER = 'v-workboard-hotpath-index-v1';
export const INDEX_SQL = `CREATE INDEX IF NOT EXISTS workboard_cards_board_agg_idx ON workboard_cards(board_id, status, archived_at, updated_at);
CREATE INDEX IF NOT EXISTS workboard_cards_lifecycle_link_idx ON workboard_cards(created_at, id, archived_at, agent_id, session_key, run_id, execution_id, execution_session_key, execution_run_id);`;

const ANCHOR = '\tensureColumn(db, "workboard_cards", "lifecycle_status_source_updated_at", "lifecycle_status_source_updated_at INTEGER");\n';

export function patchSqliteStore(source) {
  assert(!source.includes(MARKER), 'workboard store already carries the hot-path indexes');
  assert.equal(source.split(ANCHOR).length, 2, 'ensureWorkboardSchema anchor not found exactly once');
  return source.replace(ANCHOR, `${ANCHOR}\t// ${MARKER}: covering indexes for listBoardAggregates and listLifecycleMatchLinks
\tdb.exec(${JSON.stringify(INDEX_SQL)});\n`);
}

export function applyToDist(dir) {
  const name = fs.readdirSync(dir).find((f) => /^sqlite-store-.*\.js$/.test(f) && fs.readFileSync(path.join(dir, f), 'utf8').includes('function ensureWorkboardSchema(db)'));
  assert(name, `no workboard sqlite-store chunk in ${dir}`);
  const file = path.join(dir, name);
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(MARKER)) return { file, patched: false };
  fs.writeFileSync(file, patchSqliteStore(source));
  return { file, patched: true };
}

// usage: node lab/patch-workboard-hotpath-index.mjs <dist dir>...
if (import.meta.url === `file://${process.argv[1]}`) {
  const dirs = process.argv.slice(2);
  assert(dirs.length, 'usage: patch-workboard-hotpath-index.mjs <dist dir>...');
  for (const dir of dirs) {
    const r = applyToDist(dir);
    console.log(`${r.patched ? 'patched' : 'already patched'} ${r.file}`);
  }
}
