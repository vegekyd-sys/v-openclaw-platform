import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { patchAccessor, patchPlacementStartup } from './patch-placement-evidence-absence.mjs';

const captured = (name) => fs.readFileSync(new URL(`../release/captured/v2026.9.1-db91.6-gpt-live-voice-20261005/dist/${name}`, import.meta.url), 'utf8');
const released = (name) => fs.readFileSync(new URL(`./release-files/placement-evidence-absence/${name}`, import.meta.url), 'utf8');
const ACCESSOR = 'session-accessor-K0XuW6ln.js';
const PLACEMENT = 'server-worker-placement-startup-BvPREvpr.js';

test('release files are V\'s files with only the absence-only change', () => {
  assert.equal(patchAccessor(captured(ACCESSOR)), released(ACCESSOR));
  assert.equal(patchPlacementStartup(captured(PLACEMENT)), released(PLACEMENT));
  assert.throws(() => patchAccessor(released(ACCESSOR)), /evidence batch header/);
  assert.throws(() => patchPlacementStartup(released(PLACEMENT)), /placement evidence read/);
  // the sweep is the only caller that asks for absence only
  assert.equal(released(PLACEMENT).split('{ absenceOnly: true }').length - 1, 1);
});

// Both row readers, cut from the release file and run against a real SQLite table through
// a minimal stand-in for the Kysely helpers they use.
function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} not found`);
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end + 2);
}
function loadReaders(chunkSize) {
  const source = released(ACCESSOR);
  const body = [functionSource(source, 'readSessionIdentityEvidenceRows'), functionSource(source, 'readSessionIdentityAbsenceRows')].join('\n');
  const factory = new Function('SESSION_IDENTITY_EVIDENCE_QUERY_CHUNK_SIZE', 'assertCanonicalSqliteSessionKeysCurrent', 'getSessionKysely', 'executeSqliteQuerySync', 'executeSqliteQueryTakeFirstSync', 'parseReadableSqliteSessionEntryRow', `${body}\nreturn { full: readSessionIdentityEvidenceRows, absence: readSessionIdentityAbsenceRows };`);
  const selects = [];
  const builder = () => ({
    selectFrom: (table) => ({
      select: (columns) => ({
        where: (column, op, value) => ({ table, columns, column, op, value }),
      }),
    }),
  });
  const run = (db, q) => {
    selects.push(q);
    const values = Array.isArray(q.value) ? q.value : [q.value];
    const sql = `SELECT ${q.columns.join(', ')} FROM ${q.table} WHERE ${q.column} ${q.op === 'in' ? `IN (${values.map(() => '?').join(', ')})` : '= ?'}`;
    return db.prepare(sql).all(...values);
  };
  const parse = (_database, row) => {
    const entry = JSON.parse(row.entry_json);
    if (entry.unreadable) throw new Error('unreadable');
    return entry;
  };
  const readers = factory(chunkSize, () => {}, () => builder(), (db, q) => ({ rows: run(db, q) }), (db, q) => run(db, q)[0], parse);
  return { ...readers, selects };
}

function scenario(seed) {
  let s = seed;
  const rand = (n) => { s = (s * 1103515245 + 12345) % 2147483648; return s % n; };
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE session_nodes (session_key TEXT PRIMARY KEY, current_session_id TEXT, entry_json TEXT, entry_valid INTEGER, updated_at INTEGER)');
  const insert = db.prepare('INSERT INTO session_nodes VALUES (?, ?, ?, ?, ?)');
  const ids = Array.from({ length: 12 }, (_, i) => `sid-${i}`);
  for (let k = 0; k < 10; k += 1) {
    const valid = [1, 1, 1, -1, 0][rand(5)];
    const entry = rand(4) === 0 ? { unreadable: true } : { sessionId: ids[rand(12)] };
    insert.run(`key-${k}`, ids[rand(12)], JSON.stringify(entry), valid, k);
  }
  const items = Array.from({ length: 25 }, (_, i) => ({ index: i, sessionId: ids[rand(12)], sessionKey: rand(6) === 0 ? undefined : `key-${rand(13)}` }));
  return { database: { db }, items };
}

test('absence-only answers "absent" exactly where the full decode does', () => {
  let absent = 0, checked = 0;
  for (let seed = 1; seed <= 400; seed += 1) {
    for (const chunk of [2, 400]) {
      const { database, items } = scenario(seed);
      const { full, absence } = loadReaders(chunk);
      const a = full(database, items), b = absence(database, items);
      for (const [i, item] of items.entries()) {
        assert.equal(b[i].status === 'absent', a[i].status === 'absent', `seed ${seed} chunk ${chunk} item ${JSON.stringify(item)}: full ${JSON.stringify(a[i])} absence ${JSON.stringify(b[i])}`);
        if (a[i].status !== 'absent' && a[i].status !== 'current') assert.equal(b[i].status, 'unknown');
        checked += 1;
        if (a[i].status === 'absent') absent += 1;
      }
    }
  }
  assert(absent > 100 && checked - absent > 100, `scenarios cover both answers (absent ${absent} of ${checked})`);
});

test('absence-only reads entry_json only for keys that moved to another session', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE session_nodes (session_key TEXT PRIMARY KEY, current_session_id TEXT, entry_json TEXT, entry_valid INTEGER, updated_at INTEGER)');
  const insert = db.prepare('INSERT INTO session_nodes VALUES (?, ?, ?, ?, ?)');
  for (let k = 0; k < 500; k += 1) insert.run(`key-${k}`, `sid-${k}`, JSON.stringify({ big: 'x'.repeat(1000) }), 1, k);
  const items = Array.from({ length: 500 }, (_, k) => ({ index: k, sessionId: `sid-${k}`, sessionKey: `key-${k}` }));
  items.push({ index: 500, sessionId: 'sid-old', sessionKey: 'key-7' }); // reset: key-7 moved on
  items.push({ index: 501, sessionId: 'sid-ghost', sessionKey: 'key-ghost' });
  const { absence, selects } = loadReaders(400);
  const result = absence({ db }, items);
  assert.deepEqual(result.slice(0, 500).map((r) => r.status), Array(500).fill('unknown'));
  assert.equal(result[500].status, 'absent');
  assert.equal(result[501].status, 'absent');
  const decoded = selects.filter((q) => q.columns.includes('entry_json'));
  assert.deepEqual(decoded.map((q) => q.value), ['key-7']);
  // the session-id fallback is only asked for the two placements that need it
  const fallback = selects.filter((q) => q.column === 'current_session_id').flatMap((q) => q.value);
  assert.deepEqual(fallback.sort(), ['sid-ghost', 'sid-old']);
});
