import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { patchTranscriptIndexPreflight } from './patch-transcript-index-preflight.mjs';

// The original and patched reconcile chunks run unchanged against stub sibling chunks.
// The stub transcript index chunk carries the native orphan sweep and dirty-session SQL
// (kysely output of session-transcript-index-9itOio9h.js), so the original module is the
// oracle: both must leave byte-identical index tables and report the same reconcile need.

const original = fs.readFileSync(new URL('../release/captured/v2026.9.1-db91.6-voice-reliability-20261008/dist/session-transcript-reconcile-j5qhAafV.js', import.meta.url), 'utf8');
const patched = fs.readFileSync(new URL('./release-files/transcript-index-preflight/session-transcript-reconcile-j5qhAafV.js', import.meta.url), 'utf8');

const NATIVE_ORPHAN_SWEEP = [
  'DELETE FROM session_transcript_active_events WHERE session_id NOT IN (SELECT DISTINCT session_id FROM transcript_events)',
  'DELETE FROM session_transcript_fts WHERE session_id NOT IN (SELECT DISTINCT session_id FROM transcript_events)',
  'DELETE FROM session_transcript_index_state WHERE session_id NOT IN (SELECT DISTINCT session_id FROM transcript_events)',
];
const NATIVE_NEEDING = `SELECT session_windows.session_id FROM session_windows
  INNER JOIN transcript_events AS latest ON latest.session_id = session_windows.session_id
    AND latest.seq = (SELECT candidate.seq FROM transcript_events AS candidate WHERE candidate.session_id = session_windows.session_id ORDER BY candidate.seq DESC LIMIT 1)
  LEFT JOIN session_transcript_index_state AS st ON st.session_id = session_windows.session_id
  WHERE (coalesce(st.needs_rebuild, 1) != 0 OR latest.seq > coalesce(st.indexed_seq, -1)
    OR EXISTS (SELECT pending.session_id FROM session_transcript_active_events AS pending WHERE pending.session_id = session_windows.session_id AND pending.context_eligible IS NULL))
  ORDER BY session_windows.session_id`;

const STUBS = {
  'error-coercion-CwcmpTBO.js': 'export const u = (error) => error instanceof Error ? error : new Error(String(error));',
  'path-guards-Cp-mGr3-.js': '',
  'subsystem-bfHYmnCE.js': 'export const t = () => ({ warn: (m) => globalThis.__stub.log.push(["warn", m]), info: (m) => globalThis.__stub.log.push(["info", m]), debug: (m) => globalThis.__stub.log.push(["debug", m]) });',
  'runtime-process-entrypoints-DEjFGor2.js': 'export const t = { sessionTranscriptReconcile: "reconcile-worker" };',
  'runtime-worker-url-DJUUt97T.js': 'export const n = () => new URL("file:///reconcile-worker.js");',
  'openclaw-agent-db.paths-DYna80bS.js': 'export const r = (params) => params.path;',
  'openclaw-agent-db-CUTe8BX6.js': `import { DatabaseSync } from "node:sqlite";
const cache = new Map();
export const g = (options) => {
  let entry = cache.get(options.path);
  if (!entry) { const db = new DatabaseSync(options.path); db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000"); cache.set(options.path, entry = { db }); }
  return entry;
};
export const y = (operation, options, transactionOptions) => {
  const database = g(options);
  globalThis.__stub.beforeWrite?.(database.db, transactionOptions.operationLabel);
  const count = () => database.db.prepare("SELECT (SELECT count(*) FROM session_transcript_active_events) AS active, (SELECT count(*) FROM session_transcript_fts) AS fts, (SELECT count(*) FROM session_transcript_index_state) AS state").get();
  const before = count();
  database.db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation(database);
    database.db.exec("COMMIT");
    globalThis.__stub.writes.push({ label: transactionOptions.operationLabel, deleted: ((after) => ({ active: before.active - after.active, fts: before.fts - after.fts, state: before.state - after.state }))(count()) });
    return result;
  } catch (error) { database.db.exec("ROLLBACK"); throw error; }
};
export const close = () => { for (const { db } of cache.values()) db.close(); cache.clear(); };`,
  'session-accessor.sqlite-scope-BwPKGcgm.js': 'export const d = (s) => s; export const m = (s) => s; export const p = async (options, fn) => fn();',
  'node-sqlite-CL-d6drd.js': 'export const o = () => ({});',
  'agent-db-process-coordinator.mjs': 'export const withAgentDatabaseProcessLease = async ({ fn }) => fn();',
  'session-transcript-index-9itOio9h.js': `import { isMainThread } from "node:worker_threads";
const SWEEP = ${JSON.stringify(NATIVE_ORPHAN_SWEEP)};
const NEEDING = ${JSON.stringify(NATIVE_NEEDING)};
export const i = (db) => { for (const sql of SWEEP) db.prepare(sql).run(); };
export const o = (db) => {
  if (!isMainThread && process.env.STUB_FAIL_SCAN === "1") throw new Error("stub scan failure");
  return db.prepare(NEEDING).all().map((row) => row.session_id);
};
export const d = () => true, f = () => true, l = () => false, m = () => true, p = () => ({ hasMore: false, owned: true });`,
};

async function importReconcile(t, source, label) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `transcript-preflight-${label}-`)));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, stub] of Object.entries(STUBS)) fs.writeFileSync(path.join(dir, name), stub);
  fs.writeFileSync(path.join(dir, 'session-transcript-reconcile-j5qhAafV.js'), source);
  const reconcile = await import(pathToFileURL(path.join(dir, 'session-transcript-reconcile-j5qhAafV.js')).href);
  const agentDb = await import(pathToFileURL(path.join(dir, 'openclaw-agent-db-CUTe8BX6.js')).href);
  t.after(() => agentDb.close());
  return { reconcile: reconcile.n, close: agentDb.close };
}

const SCHEMA = `
CREATE TABLE session_windows (session_id TEXT NOT NULL PRIMARY KEY, session_key TEXT NOT NULL, transcript_updated_at INTEGER) STRICT;
CREATE TABLE transcript_events (session_id TEXT NOT NULL, seq INTEGER NOT NULL, event_json TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, seq), FOREIGN KEY (session_id) REFERENCES session_windows(session_id) ON DELETE CASCADE) STRICT;
CREATE TABLE session_transcript_active_events (session_id TEXT NOT NULL, active_position INTEGER NOT NULL CHECK (active_position >= 0), event_seq INTEGER NOT NULL,
  message_position INTEGER CHECK (message_position IS NULL OR message_position >= 0), context_eligible INTEGER,
  PRIMARY KEY (session_id, active_position), FOREIGN KEY (session_id, event_seq) REFERENCES transcript_events(session_id, seq) ON DELETE CASCADE) STRICT;
CREATE UNIQUE INDEX idx_agent_transcript_active_event_seq ON session_transcript_active_events(session_id, event_seq);
CREATE INDEX idx_agent_transcript_context_pending ON session_transcript_active_events(session_id) WHERE context_eligible IS NULL;
CREATE TABLE session_transcript_index_state (session_id TEXT NOT NULL PRIMARY KEY, indexed_seq INTEGER NOT NULL, leaf_event_id TEXT, needs_rebuild INTEGER NOT NULL DEFAULT 0,
  active_event_count INTEGER NOT NULL DEFAULT 0, active_message_count INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES session_windows(session_id) ON DELETE CASCADE) STRICT;
CREATE VIRTUAL TABLE session_transcript_fts USING fts5(text, session_id UNINDEXED, message_id UNINDEXED, role UNINDEXED, timestamp UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');
`;

function addSession(db, id, events, { ftsRows = events, activeRows = events, needsRebuild = 0, indexedSeq = events - 1, pending = false } = {}) {
  db.prepare('INSERT INTO session_windows VALUES (?, ?, 1)').run(id, `agent:makaron:${id}`);
  const ev = db.prepare('INSERT INTO transcript_events VALUES (?, ?, ?, 1)');
  for (let seq = 0; seq < events; seq++) ev.run(id, seq, '{}');
  const ac = db.prepare('INSERT INTO session_transcript_active_events VALUES (?, ?, ?, ?, ?)');
  for (let pos = 0; pos < activeRows; pos++) ac.run(id, pos, pos, pos, pending && pos === activeRows - 1 ? null : 1);
  if (events > 0) db.prepare('INSERT INTO session_transcript_index_state VALUES (?, ?, NULL, ?, ?, ?, 1)').run(id, indexedSeq, needsRebuild, activeRows, activeRows);
  addFts(db, id, ftsRows);
}
function addFts(db, id, rows) {
  const fts = db.prepare('INSERT INTO session_transcript_fts (text, session_id, message_id, role, timestamp) VALUES (?, ?, ?, ?, ?)');
  for (let n = 0; n < rows; n++) fts.run(`message ${n} of ${id} ${'x'.repeat(n % 7)}`, id, `${id}-m${n}`, 'user', 1);
}

// Every orphan shape the native sweep removes, plus rows it must keep.
function buildDatabase(t, { orphans = true, dirty = 'none' } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-preflight-db-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'openclaw-agent.sqlite');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  addSession(db, 'live-a', 5);
  addSession(db, 'live-b', 3, { needsRebuild: dirty === 'flag' ? 1 : 0 });
  addSession(db, 'live-c', 4, { indexedSeq: dirty === 'watermark' ? 1 : 3, pending: dirty === 'pending' });
  addSession(db, 'live-big', 700, { ftsRows: 600 });
  if (orphans) {
    // Session deleted: window cascade removes events, active rows and state; FTS rows stay.
    addSession(db, 'deleted-window', 6);
    db.prepare('DELETE FROM session_windows WHERE session_id = ?').run('deleted-window');
    // Transcript cleared, window kept: active rows cascade away; state and FTS stay.
    addSession(db, 'cleared-transcript', 4);
    db.prepare('DELETE FROM transcript_events WHERE session_id = ?').run('cleared-transcript');
    // A large orphan crosses several bounded delete chunks on every table.
    addSession(db, 'big-orphan', 1300, { ftsRows: 1300 });
    db.exec('PRAGMA foreign_keys = OFF');
    db.prepare('DELETE FROM transcript_events WHERE session_id = ?').run('big-orphan');
    // Rows written while foreign keys were off.
    db.prepare('INSERT INTO session_transcript_active_events VALUES (?, 0, 0, 0, 1)').run('ghost-active');
    db.prepare('INSERT INTO session_transcript_index_state VALUES (?, 0, NULL, 0, 0, 0, 1)').run('ghost-state');
    addFts(db, 'ghost-fts', 3);
    db.exec('PRAGMA foreign_keys = ON');
  }
  // NULL owner: NOT IN yields NULL, so the native sweep keeps it.
  db.prepare('INSERT INTO session_transcript_fts (text, session_id, message_id, role, timestamp) VALUES (?, NULL, NULL, NULL, NULL)').run('ownerless row');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  return file;
}

function copyDatabase(t, file) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-preflight-copy-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const copy = path.join(dir, 'openclaw-agent.sqlite');
  fs.copyFileSync(file, copy);
  return copy;
}

function dump(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return {
      active: db.prepare('SELECT * FROM session_transcript_active_events ORDER BY session_id, active_position').all(),
      fts: db.prepare('SELECT rowid AS id, * FROM session_transcript_fts ORDER BY rowid').all(),
      state: db.prepare('SELECT * FROM session_transcript_index_state ORDER BY session_id').all(),
      events: db.prepare('SELECT count(*) AS n FROM transcript_events').get().n,
    };
  } finally { db.close(); }
}

async function run(t, source, label, file, stub = {}) {
  globalThis.__stub = { log: [], writes: [], ...stub };
  const { reconcile } = await import_(t, source, label);
  let workerStarted = false;
  const result = await reconcile({
    agentId: 'makaron',
    path: file,
    createWorker() {
      workerStarted = true;
      const listeners = new Map();
      const worker = {
        on(event, fn) { listeners.set(event, fn); return worker; }, once(event, fn) { listeners.set(event, fn); return worker; },
        postMessage() {}, removeAllListeners() { listeners.clear(); }, terminate: async () => 0,
      };
      setImmediate(() => { listeners.get('message')?.({ type: 'done' }); setImmediate(() => listeners.get('exit')?.(0)); });
      return worker;
    },
  });
  const observed = { result, workerStarted, writes: globalThis.__stub.writes, log: globalThis.__stub.log };
  delete globalThis.__stub;
  return observed;
}
let importCounter = 0;
const import_ = (t, source, label) => importReconcile(t, source, `${label}-${importCounter++}`);

test('release file is the V reconcile chunk with only the preflight change', () => {
  assert.equal(patchTranscriptIndexPreflight(original), patched);
  assert.throws(() => patchTranscriptIndexPreflight(patched), /already applied/);
});

test('orphaned index rows: same rows removed as the native sweep, by short keyed write transactions', async (t) => {
  const file = buildDatabase(t);
  const before = dump(file);
  const nativeFile = copyDatabase(t, file);
  const patchedFile = copyDatabase(t, file);
  const native = await run(t, original, 'original', nativeFile);
  const next = await run(t, patched, 'patched', patchedFile);

  const after = dump(patchedFile);
  assert.deepEqual(after, dump(nativeFile));
  assert.ok(before.fts.length - after.fts.length >= 1300 + 6 + 4 + 3, 'orphaned FTS rows were present and removed');
  assert.ok(after.fts.some((row) => row.session_id === null), 'ownerless FTS row kept like NOT IN keeps it');
  assert.deepEqual([...new Set(after.state.map((row) => row.session_id))], ['live-a', 'live-b', 'live-big', 'live-c']);
  assert.equal(native.workerStarted, false);
  assert.equal(next.workerStarted, false);
  assert.deepEqual(native.result, next.result);

  // Native: one preflight transaction did everything. Patched: chunks of at most 512 rows per table.
  assert.deepEqual(native.writes.map((w) => w.label), ['sessions.transcript-index.preflight']);
  assert.ok(next.writes.length > 1);
  for (const write of next.writes) {
    assert.equal(write.label, 'sessions.transcript-index.preflight');
    for (const table of ['active', 'fts', 'state']) assert.ok(write.deleted[table] <= 512, `chunk deleted ${JSON.stringify(write.deleted)}`);
  }
  assert.ok(next.log.some(([level, message]) => level === 'info' && /orphans removed .*sessions=6 /.test(message)), JSON.stringify(next.log));
});

test('no orphans: no write transaction at all, same result', async (t) => {
  const file = buildDatabase(t, { orphans: false });
  const nativeFile = copyDatabase(t, file);
  const patchedFile = copyDatabase(t, file);
  const native = await run(t, original, 'original', nativeFile);
  const next = await run(t, patched, 'patched', patchedFile);
  assert.deepEqual(dump(patchedFile), dump(nativeFile));
  assert.equal(native.writes.length, 1);
  assert.deepEqual(next.writes, []);
  assert.deepEqual(native.result, next.result);
  assert.equal(next.workerStarted, false);
});

for (const dirty of ['flag', 'watermark', 'pending']) {
  test(`a session needing reconcile (${dirty}) still starts the reconcile worker, with and without orphans`, async (t) => {
    for (const orphans of [false, true]) {
      const file = buildDatabase(t, { orphans, dirty });
      const nativeFile = copyDatabase(t, file);
      const patchedFile = copyDatabase(t, file);
      const native = await run(t, original, 'original', nativeFile);
      const next = await run(t, patched, 'patched', patchedFile);
      assert.equal(native.workerStarted, true);
      assert.equal(next.workerStarted, true);
      assert.deepEqual(next.result, native.result);
      // The final orphan sweep after the worker also runs keyed (nothing left to delete here).
      assert.deepEqual(dump(patchedFile), dump(nativeFile));
      assert.equal(native.writes.at(-1).label, 'sessions.transcript-index.orphan-sweep');
      assert.ok(!next.writes.some((w) => w.label === 'sessions.transcript-index.orphan-sweep'));
    }
  });
}

test('an owner whose transcript reappears before the delete keeps its index rows', async (t) => {
  const file = buildDatabase(t);
  const patchedFile = copyDatabase(t, file);
  let revived = false;
  await run(t, patched, 'patched', patchedFile, {
    beforeWrite(db, label) {
      if (revived || label !== 'sessions.transcript-index.preflight') return;
      revived = true;
      db.prepare('INSERT INTO transcript_events VALUES (?, 0, ?, 1)').run('cleared-transcript', '{}');
    },
  });
  const after = dump(patchedFile);
  assert.ok(after.state.some((row) => row.session_id === 'cleared-transcript'));
  assert.equal(after.fts.filter((row) => row.session_id === 'cleared-transcript').length, 4);
  assert.equal(after.fts.filter((row) => row.session_id === 'deleted-window').length, 0);
});

test('a failed read-only scan falls back to the native in-transaction sweep', async (t) => {
  const file = buildDatabase(t, { dirty: 'flag' });
  const nativeFile = copyDatabase(t, file);
  const patchedFile = copyDatabase(t, file);
  const native = await run(t, original, 'original', nativeFile);
  process.env.STUB_FAIL_SCAN = '1';
  t.after(() => { delete process.env.STUB_FAIL_SCAN; });
  const next = await run(t, patched, 'patched', patchedFile);
  delete process.env.STUB_FAIL_SCAN;
  assert.deepEqual(dump(patchedFile), dump(nativeFile));
  assert.equal(next.workerStarted, true);
  assert.equal(next.writes[0].label, 'sessions.transcript-index.preflight');
  assert.ok(next.log.some(([level, message]) => level === 'warn' && /preflight scan failed; sweeping inside the write transaction .*stub scan failure/.test(message)), JSON.stringify(next.log));
});
