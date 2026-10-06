import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { SESSION_LIST_READER_CAP, patchSessionAccessorEntry } from './patch-session-list-reader.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
const NAME = 'session-accessor.sqlite-entry-BlklNPKQ.js';
const captured = read(`../release/captured/v2026.9.1-db91.6-firsttext-r1-20261006/dist/${NAME}`);
const released = read(`./release-files/session-list-reader/${NAME}`);
const sha = (value) => createHash('sha256').update(value).digest('hex');

test('the release file is V\'s chunk with only the session-list-reader change', () => {
  assert.equal(sha(captured), '6b12190ca8e975ea6c8bce6703af805e01a1ef492e83f4829a6fe0f90669d96b');
  assert.equal(patchSessionAccessorEntry(captured), released);
  assert.throws(() => patchSessionAccessorEntry(released), /already applied/);
  // Outside the added region, only two import lines and one call site differ.
  const start = released.indexOf('//#region session-list-reader (V)');
  const end = released.indexOf('//#endregion\n', start) + '//#endregion\n'.length;
  const outside = (released.slice(0, start) + released.slice(end))
    .replace('import sessionListReaderFs from "node:fs";\n', '')
    .replace(', t as openOpenClawAgentDatabaseReadOnly } from "./openclaw-agent-db-readonly-wb-jdztx.js"', ' } from "./openclaw-agent-db-readonly-wb-jdztx.js"')
    .replace('\tconst retained = listSessionEntriesWithRetainedReader(resolved, scope);\n\tif (retained) return retained.value;\n', '');
  assert.equal(outside, captured);
  // The fallback is the original body, byte for byte.
  assert.match(released, /\tif \(retained\) return retained\.value;\n\tconst result = withOpenClawAgentDatabaseReadOnly\(\(database\) => listSqliteSessionEntriesFromDatabase\(database, resolved, scope\), toDatabaseOptions\(resolved\)\);\n\treturn result\.found \? result\.value : \[\];\n\}/);
});

test('the read-only opener alias and the per-connection caches it relies on exist in V\'s bytes', () => {
  // The read-only module is npm 2026.9.1 bytes on V (in the base manifest, not in V's capture).
  const readonly = read('./fixtures/session-list-reader/openclaw-agent-db-readonly-wb-jdztx.js');
  const base = JSON.parse(read('../release/captured/base/openclaw@2026.9.1.json'));
  assert.equal(sha(readonly), base.files['./openclaw-agent-db-readonly-wb-jdztx.js']);
  const capture = JSON.parse(read('../release/captured/v2026.9.1-db91.6-firsttext-r1-20261006/manifest.json'));
  assert(!capture.files.some((file) => file.path === './openclaw-agent-db-readonly-wb-jdztx.js'));
  assert.match(readonly, /^export \{ withOpenClawAgentDatabaseReadOnly as n, openOpenClawAgentDatabaseReadOnly as t \};$/m);
  // The original path opens this same function's connection whenever no writer is reusable, and closes it.
  assert.match(readonly, /const fresh = reusable \? void 0 : openOpenClawAgentDatabaseReadOnly\(\{\n\t\t\.\.\.options,\n\t\tagentId\n\t\}, behavior\);/);
  assert.match(readonly, /\} finally \{\n\t\tif \(fresh\?\.found\) fresh\.database\.close\(\);\n\t\}/);
  assert.match(captured, /^import \{ n as withOpenClawAgentDatabaseReadOnly \} from "\.\/openclaw-agent-db-readonly-wb-jdztx\.js";$/m);
  const state = read('./release-files/session-accessor.sqlite-transcript-state-Cz9g7S9v.js');
  // snapshot cache keyed by connection, validated by PRAGMA data_version + generation
  assert.match(state, /const sessionEntryCaches = \/\* @__PURE__ \*\/ new WeakMap\(\);/);
  assert.match(state, /const cached = sessionEntryCaches\.get\(database\.db\);\n\tif \(cached && cacheValidityTokensEqual\(cached\.validityToken, validityToken\)\) return cached;/);
  // canonical-key validation once per connection
  assert.match(state, /if \(!validatedDatabases\.has\(database\.db\)\) scanCanonicalSqliteSessionEntries\(database, void 0, mainKey\);/);
  // the only consumer the patch wraps
  assert.match(captured, /function listSqliteSessionEntriesFromDatabase\(database, resolved, scope\) \{\n\tassertCanonicalSqliteSessionKeysCurrent\(database\);/);
});

// ---------------------------------------------------------------------------
// Run the patched listSessionEntriesReadOnly against real SQLite files and fakes for the
// OpenClaw helpers around it. The fake list operation mirrors the real one's per-connection
// state: a one-time validation scan per connection and a full read of session rows.

let sqlite;
try {
  sqlite = await import('node:sqlite');
} catch {}

function loadPatched(env) {
  const start = released.indexOf('//#region session-list-reader (V)');
  const fnStart = released.indexOf('function listSessionEntriesReadOnly(scope = {}) {');
  const fnEnd = released.indexOf('\n}\n', fnStart) + 3;
  const src = released.slice(start, fnStart) + released.slice(fnStart, fnEnd);
  const names = ['sessionListReaderFs', 'process', 'resolveSqliteScope', 'toDatabaseOptions', 'normalizeAgentId', 'resolveOpenClawAgentSqlitePath', 'isIncognitoOpenClawAgentSqlitePath', 'getOpenClawAgentDatabaseIfOpen', 'openOpenClawAgentDatabaseReadOnly', 'withOpenClawAgentDatabaseReadOnly', 'listSqliteSessionEntriesFromDatabase'];
  const factory = new Function(...names, `${src}\nreturn { listSessionEntriesReadOnly, sessionListReaders };`);
  const { DatabaseSync } = sqlite;
  const stats = { opens: 0, freshOriginal: 0, scans: 0, lists: 0, writer: undefined, incognito: false, throwOn: undefined, onList: undefined };
  const validated = new WeakSet();
  const openReadOnly = (options) => {
    if (!fs.existsSync(options.path)) return { found: false, reason: 'database-missing' };
    const db = new DatabaseSync(options.path, { readOnly: true });
    stats.opens += 1;
    let closed = false;
    return { found: true, database: { agentId: options.agentId, db, path: options.path, close: () => { if (!closed) { closed = true; db.close(); } } } };
  };
  const list = (database, _resolved, scope) => {
    stats.lists += 1;
    if (stats.throwOn) throw stats.throwOn;
    if (!validated.has(database.db)) {
      stats.scans += 1;
      for (const row of database.db.prepare('SELECT session_key, entry_json FROM session_nodes').iterate()) JSON.parse(row.entry_json);
      validated.add(database.db);
    }
    const rows = database.db.prepare('SELECT session_key, entry_json FROM session_nodes ORDER BY session_key').all().map((row) => ({ sessionKey: row.session_key, entry: JSON.parse(row.entry_json) }));
    stats.onList?.(database, scope);
    return rows;
  };
  const api = factory(
    fs,
    { env },
    (scope) => ({ ...scope }),
    (resolved) => ({ agentId: resolved.agentId, path: resolved.storePath }),
    (id) => String(id ?? 'main').toLowerCase(),
    (options) => options.path,
    () => stats.incognito,
    () => {
      if (stats.writer instanceof Error) throw stats.writer;
      return stats.writer;
    },
    openReadOnly,
    (operation, options) => {
      stats.freshOriginal += 1;
      if (stats.writer && !(stats.writer instanceof Error)) return { found: true, value: operation(stats.writer) };
      const opened = openReadOnly(options);
      if (!opened.found) return opened;
      try {
        return { found: true, value: operation(opened.database) };
      } finally {
        opened.database.close();
      }
    },
    list,
  );
  return { ...api, stats };
}

function makeStore(dir, name = 'agent.sqlite', rows = 50) {
  const file = path.join(dir, name);
  const db = new sqlite.DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; CREATE TABLE session_nodes (session_key TEXT PRIMARY KEY, entry_json TEXT NOT NULL); CREATE TABLE other (v INTEGER);');
  const insert = db.prepare('INSERT INTO session_nodes VALUES (?, ?)');
  for (let i = 0; i < rows; i += 1) insert.run(`agent:a:s${i}`, JSON.stringify({ sessionId: `id${i}`, visibility: 'shared' }));
  return { file, db };
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'session-list-reader-'));
const scope = (storePath) => ({ agentId: 'a', storePath, clone: false, projection: 'list' });

test('repeated reads of unchanged data reuse one connection and return what a fresh one returns', { skip: !sqlite }, () => {
  const dir = tmp();
  const { file, db } = makeStore(dir);
  const reader = loadPatched({});
  const off = loadPatched({ OPENCLAW_SESSION_LIST_READER: '0' });
  const first = reader.listSessionEntriesReadOnly(scope(file));
  for (let i = 0; i < 5; i += 1) assert.deepEqual(reader.listSessionEntriesReadOnly(scope(file)), off.listSessionEntriesReadOnly(scope(file)));
  assert.equal(first.length, 50);
  assert.equal(reader.stats.opens, 1);
  assert.equal(reader.stats.scans, 1);
  assert.equal(reader.stats.freshOriginal, 0);
  assert.equal(off.stats.opens, 5);
  assert.equal(off.stats.scans, 5);
  db.close();
});

test('any commit by another connection (other table or session row) means a fresh connection; a write is visible at once', { skip: !sqlite }, () => {
  const dir = tmp();
  const { file, db } = makeStore(dir);
  const reader = loadPatched({});
  reader.listSessionEntriesReadOnly(scope(file));
  db.exec('INSERT INTO other VALUES (1)');
  reader.listSessionEntriesReadOnly(scope(file));
  assert.equal(reader.stats.opens, 2);
  assert.equal(reader.stats.scans, 2);
  db.prepare('UPDATE session_nodes SET entry_json = ? WHERE session_key = ?').run(JSON.stringify({ sessionId: 'id3', visibility: 'draft' }), 'agent:a:s3');
  const after = reader.listSessionEntriesReadOnly(scope(file));
  assert.equal(after.find((row) => row.sessionKey === 'agent:a:s3').entry.visibility, 'draft');
  assert.equal(reader.stats.opens, 3);
  db.prepare('DELETE FROM session_nodes WHERE session_key = ?').run('agent:a:s4');
  assert.equal(reader.listSessionEntriesReadOnly(scope(file)).some((row) => row.sessionKey === 'agent:a:s4'), false);
  db.close();
});

test('a replaced or removed file is never read through the retained connection', { skip: !sqlite }, () => {
  const dir = tmp();
  const { file, db } = makeStore(dir, 'agent.sqlite', 3);
  const reader = loadPatched({});
  assert.equal(reader.listSessionEntriesReadOnly(scope(file)).length, 3);
  db.close();
  const other = makeStore(dir, 'replacement.sqlite', 7);
  other.db.close();
  for (const suffix of ['-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
  fs.renameSync(other.file, file);
  for (const suffix of ['-wal', '-shm']) if (fs.existsSync(other.file + suffix)) fs.renameSync(other.file + suffix, file + suffix);
  assert.equal(reader.listSessionEntriesReadOnly(scope(file)).length, 7);
  fs.rmSync(file);
  for (const suffix of ['-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
  assert.deepEqual(reader.listSessionEntriesReadOnly(scope(file)), []);
  assert.equal(reader.sessionListReaders.size, 0);
});

test('a snapshot left open by a reader is caught by the file stamp', { skip: !sqlite }, () => {
  const dir = tmp();
  const { file, db } = makeStore(dir, 'agent.sqlite', 4);
  const reader = loadPatched({});
  let pinned;
  // A consumer that leaves an iterator open would pin the connection's read snapshot, and
  // PRAGMA data_version would not move; the -wal stamp still does.
  reader.stats.onList = (database) => {
    if (!pinned) {
      pinned = database.db.prepare('SELECT session_key FROM session_nodes').iterate();
      pinned.next();
    }
  };
  reader.listSessionEntriesReadOnly(scope(file));
  db.prepare('INSERT INTO session_nodes VALUES (?, ?)').run('agent:a:new', JSON.stringify({ sessionId: 'n' }));
  assert(reader.listSessionEntriesReadOnly(scope(file)).some((row) => row.sessionKey === 'agent:a:new'));
  db.close();
});

test('with a writable handle open, incognito, a latched writer error or the switch off, the original path runs', { skip: !sqlite }, () => {
  const dir = tmp();
  const { file, db } = makeStore(dir);
  const reader = loadPatched({});
  reader.listSessionEntriesReadOnly(scope(file));
  assert.equal(reader.sessionListReaders.size, 1);
  const writer = { agentId: 'a', db: new sqlite.DatabaseSync(file), path: file };
  reader.stats.writer = writer;
  reader.listSessionEntriesReadOnly(scope(file));
  assert.equal(reader.stats.freshOriginal, 1);
  assert.equal(reader.sessionListReaders.size, 0, 'retained reader closed once the process holds a writer');
  writer.db.close();
  reader.stats.writer = new Error('latched open failure');
  reader.listSessionEntriesReadOnly(scope(file));
  assert.equal(reader.stats.freshOriginal, 2);
  reader.stats.writer = undefined;
  reader.stats.incognito = true;
  reader.listSessionEntriesReadOnly(scope(file));
  assert.equal(reader.stats.freshOriginal, 3);
  reader.stats.incognito = false;
  reader.listSessionEntriesReadOnly(scope(file));
  assert.equal(reader.sessionListReaders.size, 1);
  const env = {};
  const switched = loadPatched(env);
  switched.listSessionEntriesReadOnly(scope(file));
  assert.equal(switched.sessionListReaders.size, 1);
  env.OPENCLAW_SESSION_LIST_READER = '0';
  switched.listSessionEntriesReadOnly(scope(file));
  assert.equal(switched.sessionListReaders.size, 0);
  assert.equal(switched.stats.freshOriginal, 1);
  db.close();
});

test('errors come from the original path, and a nested read does not reuse a busy connection', { skip: !sqlite }, () => {
  const dir = tmp();
  const { file, db } = makeStore(dir);
  const reader = loadPatched({});
  reader.listSessionEntriesReadOnly(scope(file));
  reader.stats.throwOn = Object.assign(new Error('non-canonical persisted row'), { code: 'SESSION_CANONICAL_KEY_MIGRATION_REQUIRED' });
  assert.throws(() => reader.listSessionEntriesReadOnly(scope(file)), /non-canonical/);
  assert.equal(reader.stats.freshOriginal, 1);
  assert.equal(reader.sessionListReaders.size, 0);
  reader.stats.throwOn = undefined;
  let nested;
  reader.stats.onList = () => {
    if (nested === undefined) {
      nested = null;
      nested = reader.listSessionEntriesReadOnly(scope(file));
    }
  };
  const outer = reader.listSessionEntriesReadOnly(scope(file));
  assert.deepEqual(nested, outer);
  assert.equal(reader.stats.freshOriginal, 2, 'nested read took the original path');
  db.close();
});

test('retained connections are bounded', { skip: !sqlite }, () => {
  const dir = tmp();
  const reader = loadPatched({});
  const stores = Array.from({ length: SESSION_LIST_READER_CAP + 3 }, (_, i) => makeStore(dir, `agent-${i}.sqlite`, 1));
  for (const { file } of stores) reader.listSessionEntriesReadOnly(scope(file));
  assert.equal(reader.sessionListReaders.size, SESSION_LIST_READER_CAP);
  assert.equal(reader.sessionListReaders.has(stores[0].file), false);
  assert.equal(reader.sessionListReaders.has(stores.at(-1).file), true);
  for (const { db } of stores) db.close();
});
