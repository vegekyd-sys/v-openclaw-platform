import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import {
  LISTED_ONE_SQL,
  patchTranscriptReconcileFixedCost,
  patchTranscriptReconcileWorkerFixedCost,
  TRANSCRIPT_PROJECTION_FIXED_COST_MARKER,
} from './patch-transcript-projection-fixed-cost.mjs';

// The reconcile chunk and its Worker run unchanged against stub sibling chunks (as in
// transcript-index-preflight.test.mjs) and a real SQLite file. The stub index chunk carries the
// native dirty-session listing and orphan sweep SQL (Kysely output of
// session-transcript-index-9itOio9h.js); the real agent-db process coordinator decides leases.
// V's bytes (the #411 release) are the oracle for what a chain ends with.

const sha = (value) => createHash('sha256').update(value).digest('hex');
const RECONCILE = 'session-transcript-reconcile-j5qhAafV.js';
const WORKER = 'session-transcript-reconcile.worker.js';
const vFile = (name) => fs.readFileSync(new URL(`./release-files/transcript-projection-incremental/${name}`, import.meta.url), 'utf8');
const releaseFile = (name) => fs.readFileSync(new URL(`./release-files/transcript-projection-fixed-cost/${name}`, import.meta.url), 'utf8');
const plan = JSON.parse(fs.readFileSync(new URL('./transcript-projection-fixed-cost-plan.json', import.meta.url), 'utf8'));
const incrementalPlan = JSON.parse(fs.readFileSync(new URL('./transcript-projection-incremental-plan.json', import.meta.url), 'utf8'));

test('release files are the patchers applied to V bytes (#411), anchors exactly once', () => {
  const built = { [RECONCILE]: patchTranscriptReconcileFixedCost(vFile(RECONCILE)), [WORKER]: patchTranscriptReconcileWorkerFixedCost(vFile(WORKER)) };
  assert.equal(plan.files.length, 2);
  for (const file of plan.files) {
    const name = path.basename(file.source);
    assert.equal(sha(vFile(name)), file.before);
    assert.equal(file.before, incrementalPlan.files.find((f) => f.target === file.target).after, `${name}: before is the #411 after`);
    assert.equal(sha(releaseFile(name)), file.after);
    assert.equal(releaseFile(name), built[name]);
    assert.equal(releaseFile(name).split(TRANSCRIPT_PROJECTION_FIXED_COST_MARKER).length > 1, true);
  }
  assert.throws(() => patchTranscriptReconcileFixedCost(built[RECONCILE]), /already applied/);
  assert.throws(() => patchTranscriptReconcileWorkerFixedCost(built[WORKER]), /already applied/);
  // F3 and F1 are elsewhere: the index chunk is not part of this release
  assert.ok(!plan.files.some((f) => f.target.includes('session-transcript-index')));
});

// ---- stubs ----

const NATIVE_ORPHAN_SWEEP = [
  'DELETE FROM session_transcript_active_events WHERE session_id NOT IN (SELECT DISTINCT session_id FROM transcript_events)',
  'DELETE FROM session_transcript_fts WHERE session_id NOT IN (SELECT DISTINCT session_id FROM transcript_events)',
  'DELETE FROM session_transcript_index_state WHERE session_id NOT IN (SELECT DISTINCT session_id FROM transcript_events)',
];
// Kysely output of listSessionsNeedingTranscriptIndexReconcile (same text as transcript-index-preflight.test.mjs)
const NATIVE_NEEDING = `SELECT session_windows.session_id FROM session_windows
  INNER JOIN transcript_events AS latest ON latest.session_id = session_windows.session_id
    AND latest.seq = (SELECT candidate.seq FROM transcript_events AS candidate WHERE candidate.session_id = session_windows.session_id ORDER BY candidate.seq DESC LIMIT 1)
  LEFT JOIN session_transcript_index_state AS st ON st.session_id = session_windows.session_id
  WHERE (coalesce(st.needs_rebuild, 1) != 0 OR latest.seq > coalesce(st.indexed_seq, -1)
    OR EXISTS (SELECT pending.session_id FROM session_transcript_active_events AS pending WHERE pending.session_id = session_windows.session_id AND pending.context_eligible IS NULL))
  ORDER BY session_windows.session_id`;
// what a published projection leaves: the session current
const MAKE_CURRENT = "UPDATE session_transcript_index_state SET needs_rebuild = 0, indexed_seq = (SELECT max(seq) FROM transcript_events t WHERE t.session_id = session_transcript_index_state.session_id) WHERE session_id = ?";

const STUBS = {
  'error-coercion-CwcmpTBO.js': 'export const u = (error) => error instanceof Error ? error : new Error(String(error));',
  'path-guards-Cp-mGr3-.js': '',
  'subsystem-bfHYmnCE.js': 'export const t = () => ({ warn: (m) => globalThis.__stub.events.push(["warn", m]), info: (m) => globalThis.__stub.events.push(["info", m]), debug: (m) => globalThis.__stub.events.push(["debug", m]) });',
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
  database.db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation(database);
    database.db.exec("COMMIT");
    globalThis.__stub.events.push(["write", transactionOptions.operationLabel]);
    return result;
  } catch (error) { database.db.exec("ROLLBACK"); throw error; }
};
export const close = () => { for (const { db } of cache.values()) db.close(); cache.clear(); };`,
  'session-accessor.sqlite-scope-BwPKGcgm.js': 'export const d = (s) => s; export const m = (s) => s; export const p = async (options, fn) => fn();',
  // a sidecar lease another process holds is refused, as SQLite's exclusive lock would be
  'node-sqlite-CL-d6drd.js': `export const o = (coordinatorPath) => {
  const held = globalThis.__stub.held;
  if (held.has(coordinatorPath)) return undefined;
  held.add(coordinatorPath);
  globalThis.__stub.events.push(["lease", coordinatorPath.slice(coordinatorPath.lastIndexOf(".") + 1)]);
  return { release: () => { held.delete(coordinatorPath); } };
};`,
  'session-transcript-index-9itOio9h.js': `const SWEEP = ${JSON.stringify(NATIVE_ORPHAN_SWEEP)};
const NEEDING = ${JSON.stringify(NATIVE_NEEDING)};
export const i = (db) => { for (const sql of SWEEP) db.prepare(sql).run(); };
export const o = (db) => db.prepare(NEEDING).all().map((row) => row.session_id);
export const y = (db, plan) => { globalThis.__stub.events.push(["delta", plan.sessionId]); db.prepare(${JSON.stringify(MAKE_CURRENT)}).run(plan.sessionId); globalThis.__stub.onDelta?.(plan.sessionId, db); return true; };
export const d = () => true, f = () => true, l = () => false, m = () => true, p = () => ({ hasMore: false, owned: true });`,
};

const tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'projection-fixed-cost-')));
test.after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));
let dirCounter = 0;
async function importReconcile(source) {
  const dir = path.join(tmpRoot, `chunks-${dirCounter++}`);
  fs.mkdirSync(dir);
  for (const [name, stub] of Object.entries(STUBS)) fs.writeFileSync(path.join(dir, name), stub);
  fs.copyFileSync(new URL('./release-files/agent-db-process-coordinator.mjs', import.meta.url), path.join(dir, 'agent-db-process-coordinator.mjs'));
  fs.writeFileSync(path.join(dir, RECONCILE), source);
  const agentDb = await import(pathToFileURL(path.join(dir, 'openclaw-agent-db-CUTe8BX6.js')).href);
  const reconcile = await import(pathToFileURL(path.join(dir, RECONCILE)).href);
  return { start: reconcile.r, wait: reconcile.i, reconcile: reconcile.n, close: agentDb.close };
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

function addSession(db, id, events, { needsRebuild = 0, indexedSeq = events - 1, pending = false, state = true, window = true } = {}) {
  if (window) db.prepare('INSERT INTO session_windows VALUES (?, ?, 1)').run(id, `agent:makaron:${id}`);
  else db.exec('PRAGMA foreign_keys = OFF');
  const ev = db.prepare('INSERT INTO transcript_events VALUES (?, ?, ?, 1)');
  for (let seq = 0; seq < events; seq++) ev.run(id, seq, '{}');
  const ac = db.prepare('INSERT INTO session_transcript_active_events VALUES (?, ?, ?, ?, ?)');
  for (let pos = 0; pos < events; pos++) ac.run(id, pos, pos, pos, pending && pos === events - 1 ? null : 1);
  if (events > 0 && state) db.prepare('INSERT INTO session_transcript_index_state VALUES (?, ?, NULL, ?, ?, ?, 1)').run(id, indexedSeq, needsRebuild, events, events);
  const fts = db.prepare('INSERT INTO session_transcript_fts (text, session_id, message_id, role, timestamp) VALUES (?, ?, ?, ?, ?)');
  for (let n = 0; n < events; n++) fts.run(`message ${n} of ${id}`, id, `${id}-m${n}`, 'user', 1);
  if (!window) db.exec('PRAGMA foreign_keys = ON');
}

/** Sessions in every state the listing distinguishes, plus orphaned index rows. */
function buildDatabase({ dirty = {}, orphans = true } = {}) {
  const dir = path.join(tmpRoot, `db-${dirCounter++}`);
  fs.mkdirSync(dir);
  const file = path.join(dir, 'openclaw-agent.sqlite');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  addSession(db, 'clean', 5);
  for (const [id, shape] of Object.entries(dirty)) addSession(db, id, 4, shape);
  if (orphans) {
    addSession(db, 'cleared', 4);
    db.prepare('DELETE FROM transcript_events WHERE session_id = ?').run('cleared');
    db.exec('PRAGMA foreign_keys = OFF');
    db.prepare('INSERT INTO session_transcript_index_state VALUES (?, 0, NULL, 0, 0, 0, 1)').run('ghost-state');
    db.exec('PRAGMA foreign_keys = ON');
  }
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  return file;
}

function dump(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return {
      active: db.prepare('SELECT * FROM session_transcript_active_events ORDER BY session_id, active_position').all(),
      fts: db.prepare('SELECT rowid AS id, * FROM session_transcript_fts ORDER BY rowid').all(),
      state: db.prepare('SELECT * FROM session_transcript_index_state ORDER BY session_id').all(),
    };
  } finally { db.close(); }
}

/** A stand-in reconcile Worker that does what the real one does for these rows: list, delta each; reusable when asked. */
function createWorker(file) {
  return (url, options) => {
    const reusable = options.workerData.reusable === true;
    globalThis.__stub.events.push(['spawn', reusable]);
    const listeners = new Map();
    let deaf = false;
    const emit = (event, value) => { if (!deaf) listeners.get(event)?.(value); };
    let db;
    let queue;
    const next = () => {
      const sessionId = queue.shift();
      if (sessionId === undefined) {
        db.close();
        emit('message', { type: 'done' });
        if (!reusable) setImmediate(() => emit('exit', 0));
        return;
      }
      emit('message', { type: 'delta-plan', plan: { kind: 'delta', sessionId } });
    };
    const run = (preferredSessionId) => {
      globalThis.__stub.events.push(['worker', preferredSessionId ?? null]);
      db = new DatabaseSync(file, { readOnly: true });
      const listed = db.prepare(NATIVE_NEEDING).all().map((row) => row.session_id);
      queue = preferredSessionId && listed.includes(preferredSessionId) ? [preferredSessionId, ...listed.filter((id) => id !== preferredSessionId)] : listed;
      next();
    };
    const worker = {
      on(event, fn) { listeners.set(event, fn); return worker; }, once(event, fn) { listeners.set(event, fn); return worker; },
      postMessage(message) {
        if (message.type === 'run') { assert.ok(reusable); setImmediate(() => run(message.preferredSessionId)); return; }
        assert.equal(message.type, 'continue');
        setImmediate(next);
      },
      // as on a real Worker: without an event name it also drops the hooks that start the port, and later listeners hear nothing
      removeAllListeners(event) { if (event === undefined) { listeners.clear(); deaf = true; } else listeners.delete(event); return worker; },
      terminate: async () => { globalThis.__stub?.events.push(['terminate', null]); return 0; },
      ref() {}, unref() {},
    };
    setImmediate(() => run(options.workerData.preferredSessionId));
    return worker;
  };
}

async function chain(source, file, run, stub = {}) {
  globalThis.__stub = { events: [], held: new Set(), ...stub };
  const chunk = await importReconcile(source);
  try {
    const params = { agentId: 'makaron', path: file, createWorker: createWorker(file) };
    let timer;
    const stuck = new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error(`reconcile chain stuck: ${JSON.stringify(globalThis.__stub.events.slice(-6))}`)), 10_000); });
    try {
      await Promise.race([(async () => { await run(chunk, params); await chunk.wait(params); })(), stuck]);
    } finally { clearTimeout(timer); }
    // the stub logger records each preflight as a debug line with its operation label
    return globalThis.__stub.events.map(([kind, value]) => (kind === 'debug' || kind === 'info') && /index (preflight|orphans removed)/.test(value) ? ['preflight', value.match(/operation=(\S+)/)[1].replace('sessions.transcript-index.', '')] : [kind, value]).filter(([kind]) => kind !== 'debug' && kind !== 'info');
  } finally {
    chunk.close();
    delete globalThis.__stub;
  }
}
const kinds = (events, ...wanted) => events.filter(([kind]) => wanted.includes(kind));

test('the listing predicate for one session is the native listing, session by session', () => {
  const shapes = {
    flag: { needsRebuild: 1 }, append: { needsRebuild: 2 }, watermark: { indexedSeq: 1 }, pending: { pending: true },
    stateless: { state: false }, ahead: { indexedSeq: 9 }, windowless: { window: false, needsRebuild: 1 },
  };
  const file = buildDatabase({ dirty: shapes });
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const listed = db.prepare(NATIVE_NEEDING).all().map((row) => row.session_id);
    assert.deepEqual(listed, ['append', 'flag', 'pending', 'stateless', 'watermark']);
    const one = db.prepare(LISTED_ONE_SQL);
    for (const id of ['clean', 'cleared', 'ghost-state', 'missing', ...Object.keys(shapes)]) assert.equal(one.get(id) !== undefined, listed.includes(id), id);
  } finally { db.close(); }
});

test('an append-dirty session goes first: no scan before its delta, one orphan sweep after the chain', async () => {
  const file = buildDatabase({ dirty: { s: { needsRebuild: 2 }, other: { needsRebuild: 1 } } });
  const vFileCopy = path.join(path.dirname(file), 'v.sqlite');
  fs.copyFileSync(file, vFileCopy);
  const vEvents = await chain(vFile(RECONCILE), vFileCopy, async ({ start }, params) => start({ ...params, preferredSessionId: 's' }));
  const events = await chain(releaseFile(RECONCILE), file, async ({ start }, params) => start({ ...params, preferredSessionId: 's' }));
  // V: preflight, worker, deltas, sweep, all under the reconcile lease
  assert.deepEqual(kinds(vEvents, 'preflight', 'worker', 'delta', 'lease'), [['lease', 'transcript-reconcile-coordinator'], ['preflight', 'preflight'], ['worker', 's'], ['delta', 's'], ['delta', 'other'], ['preflight', 'orphan-sweep']]);
  // now: worker and the preferred delta first; the other dirty session in the same pass; then one sweep under its own lease
  assert.deepEqual(kinds(events, 'preflight', 'worker', 'delta', 'lease'), [['lease', 'transcript-reconcile-coordinator'], ['worker', 's'], ['delta', 's'], ['delta', 'other'], ['lease', 'transcript-orphan-sweep-coordinator'], ['preflight', 'orphan-sweep']]);
  // same rows in the end, orphans included
  assert.deepEqual(dump(file), dump(vFileCopy));
  assert.ok(!dump(file).state.some((row) => row.session_id === 'cleared' || row.session_id === 'ghost-state'));
});

test('readers asking during a pass for a session the pass made current add no pass', async () => {
  const file = buildDatabase({ dirty: { s: { needsRebuild: 2 } } });
  const vCopy = path.join(path.dirname(file), 'v.sqlite');
  fs.copyFileSync(file, vCopy);
  let startRef;
  let paramsRef;
  const onDelta = () => { for (let n = 0; n < 3; n++) startRef({ ...paramsRef, preferredSessionId: 's' }); };
  const run = async ({ start }, params) => { startRef = start; paramsRef = params; start({ ...params, preferredSessionId: 's' }); };
  const vEvents = await chain(vFile(RECONCILE), vCopy, run, { onDelta });
  const events = await chain(releaseFile(RECONCILE), file, run, { onDelta });
  // V: a second pass (preflight, nothing left, so no worker) behind the first one's sweep
  assert.deepEqual(kinds(vEvents, 'preflight', 'worker'), [['preflight', 'preflight'], ['worker', 's'], ['preflight', 'orphan-sweep'], ['preflight', 'preflight']]);
  assert.deepEqual(kinds(events, 'preflight', 'worker'), [['worker', 's'], ['preflight', 'orphan-sweep']]);
  assert.deepEqual(dump(file), dump(vCopy));
});

test('a request for a session still dirty after the pass gets another pass, again without a scan first', async () => {
  const file = buildDatabase({ dirty: { s: { needsRebuild: 2 }, t: {} } });
  let startRef;
  let paramsRef;
  let dirtied = false;
  const events = await chain(releaseFile(RECONCILE), file, async ({ start }, params) => { startRef = start; paramsRef = params; start({ ...params, preferredSessionId: 's' }); }, {
    onDelta(sessionId, db) {
      if (sessionId !== 's' || dirtied) return;
      dirtied = true;
      // another append dirties t while the pass runs (after the Worker listed)
      db.prepare('UPDATE session_transcript_index_state SET needs_rebuild = 2 WHERE session_id = ?').run('t');
      startRef({ ...paramsRef, preferredSessionId: 't' });
      startRef({ ...paramsRef, preferredSessionId: 's' });
    },
  });
  assert.deepEqual(kinds(events, 'preflight', 'worker', 'delta'), [['worker', 's'], ['delta', 's'], ['worker', 't'], ['delta', 't'], ['preflight', 'orphan-sweep']]);
  assert.equal(dump(file).state.find((row) => row.session_id === 't').needs_rebuild, 0);
});

test('a request without a session during a pass still gets a full pass (preflight first)', async () => {
  const file = buildDatabase({ dirty: { s: { needsRebuild: 2 } } });
  let startRef;
  let paramsRef;
  let asked = false;
  const events = await chain(releaseFile(RECONCILE), file, async ({ start }, params) => { startRef = start; paramsRef = params; start({ ...params, preferredSessionId: 's' }); }, {
    onDelta() { if (!asked) { asked = true; startRef({ ...paramsRef }); } },
  });
  assert.deepEqual(kinds(events, 'preflight', 'worker'), [['worker', 's'], ['preflight', 'preflight'], ['preflight', 'orphan-sweep']]);
});

test('a preferred session that needs nothing, and a pass without one, run as before', async () => {
  for (const preferredSessionId of ['clean', undefined]) {
    for (const dirty of [{}, { s: { needsRebuild: 1 } }]) {
      const file = buildDatabase({ dirty });
      const vCopy = path.join(path.dirname(file), 'v.sqlite');
      fs.copyFileSync(file, vCopy);
      const run = async ({ start }, params) => start({ ...params, ...preferredSessionId ? { preferredSessionId } : {} });
      const vEvents = await chain(vFile(RECONCILE), vCopy, run);
      const events = await chain(releaseFile(RECONCILE), file, run);
      // the leading preflight decides; with work the sweep follows (now after the chain, under its own lease)
      assert.deepEqual(kinds(events, 'preflight', 'worker', 'delta'), kinds(vEvents, 'preflight', 'worker', 'delta'), `${preferredSessionId} ${JSON.stringify(dirty)}`);
      assert.deepEqual(dump(file), dump(vCopy));
    }
  }
});

test('reconcileSessionTranscriptIndexes called directly sweeps inside its lease, as before', async () => {
  const file = buildDatabase({ dirty: { s: { needsRebuild: 1 } } });
  const events = await chain(releaseFile(RECONCILE), file, async ({ reconcile }, params) => {
    const result = await reconcile(params);
    assert.deepEqual(result, { reconciledSessions: 1 });
  });
  assert.deepEqual(kinds(events, 'preflight', 'worker', 'lease'), [['lease', 'transcript-reconcile-coordinator'], ['preflight', 'preflight'], ['worker', null], ['preflight', 'orphan-sweep']]);
});

test('the orphan sweep is skipped while another process sweeps; the chain is not held by it', async () => {
  const file = buildDatabase({ dirty: { s: { needsRebuild: 2 } } });
  const held = new Set([`${file}.transcript-orphan-sweep-coordinator`]);
  const events = await chain(releaseFile(RECONCILE), file, async ({ start }, params) => start({ ...params, preferredSessionId: 's' }), { held });
  assert.deepEqual(kinds(events, 'preflight', 'worker', 'warn'), [['worker', 's']]);
  // orphans stay for the sweep that holds the lease
  assert.ok(dump(file).state.some((row) => row.session_id === 'ghost-state'));
});

test('a new chain does not wait for the previous chain\'s orphan sweep', async () => {
  const file = buildDatabase({ dirty: { s: { needsRebuild: 2 } } });
  let second;
  const events = await chain(releaseFile(RECONCILE), file, async ({ start }, params) => {
    start({ ...params, preferredSessionId: 's' });
    await new Promise((resolve) => { globalThis.__stub.onDelta = resolve; });
    globalThis.__stub.onDelta = undefined;
    // wait for the first chain to hand over to its sweep, then dirty s again
    while (!globalThis.__stub.events.some(([kind, value]) => kind === 'lease' && value === 'transcript-orphan-sweep-coordinator')) await new Promise((resolve) => setImmediate(resolve));
    const db = new DatabaseSync(file);
    db.prepare('UPDATE session_transcript_index_state SET needs_rebuild = 2 WHERE session_id = ?').run('s');
    db.close();
    second = globalThis.__stub.events.length;
    start({ ...params, preferredSessionId: 's' });
  });
  const after = events.slice(second);
  // the second chain's delta is published while the first chain's sweep is still scanning
  const delta = after.findIndex(([kind, value]) => kind === 'delta' && value === 's');
  const firstSweep = after.findIndex(([kind, value]) => kind === 'preflight' && value === 'orphan-sweep');
  assert.ok(delta >= 0 && firstSweep > delta, JSON.stringify(after));
  assert.deepEqual(kinds(after, 'worker', 'delta').slice(0, 2), [['worker', 's'], ['delta', 's']]);
});

// ---- the Worker: real thread, stub chunks ----

const WORKER_STUBS = {
  'openclaw-agent-db-CUTe8BX6.js': 'export const g = () => { throw new Error("worker must open read-only"); }; export const i = () => {};',
  'agent-id-CeT3w4ap.js': 'export const n = (id) => id;',
  'kysely-sync-DKYGT267.js': 'export const t = () => {};',
  'openclaw-agent-db-maintenance-DYSkzMMg.js': 'export const X = () => {}, Y = () => "lease", d = () => 19, f = () => ({}), l = () => {};',
  'session-transcript-index-9itOio9h.js': `import { parentPort } from "node:worker_threads";
const NEEDING = ${JSON.stringify(NATIVE_NEEDING)};
export const o = (db) => { parentPort.postMessage({ type: "trace", what: "list" }); return db.prepare(NEEDING).all().map((row) => row.session_id); };
export const x = (db, sessionId) => { parentPort.postMessage({ type: "trace", what: "plan " + sessionId }); return { kind: "delta", sessionId }; };
export const g = () => undefined;`,
};

async function runWorker(source, file, preferredSessionId) {
  const dir = path.join(tmpRoot, `worker-${dirCounter++}`);
  fs.mkdirSync(path.join(dir, 'config', 'sessions'), { recursive: true });
  for (const [name, stub] of Object.entries(WORKER_STUBS)) fs.writeFileSync(path.join(dir, name), stub);
  const workerPath = path.join(dir, 'config', 'sessions', WORKER);
  fs.writeFileSync(workerPath, source);
  const trace = [];
  await new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: { agentId: 'makaron', path: file, ...preferredSessionId ? { preferredSessionId } : {} } });
    worker.on('message', (message) => {
      if (message.type === 'trace') trace.push(message.what);
      else if (message.type === 'delta-plan') { trace.push(`delta ${message.plan.sessionId}`); worker.postMessage({ type: 'continue', accepted: true }); }
      else if (message.type === 'done') resolve();
      else reject(new Error(JSON.stringify(message)));
    });
    worker.once('error', reject);
  });
  return trace;
}

test('one reconcile Worker serves every pass and chain of a database; V started one per pass', async () => {
  const file = buildDatabase({ dirty: { s: { needsRebuild: 2 }, t: { needsRebuild: 2 } } });
  const vCopy = path.join(path.dirname(file), 'v.sqlite');
  fs.copyFileSync(file, vCopy);
  const run = async ({ start, wait }, params) => {
    start({ ...params, preferredSessionId: 's' });
    await wait(params);
    const db = new DatabaseSync(params.path);
    db.prepare('UPDATE session_transcript_index_state SET needs_rebuild = 2 WHERE session_id = ?').run('s');
    db.close();
    start({ ...params, preferredSessionId: 's' });
  };
  const vEvents = await chain(vFile(RECONCILE), vCopy, run);
  const events = await chain(releaseFile(RECONCILE), file, run);
  assert.deepEqual(kinds(vEvents, 'spawn', 'worker', 'terminate'), [['spawn', false], ['worker', 's'], ['terminate', null], ['spawn', false], ['worker', 's'], ['terminate', null]]);
  assert.deepEqual(kinds(events, 'spawn', 'worker', 'terminate'), [['spawn', true], ['worker', 's'], ['worker', 's']]);
  assert.deepEqual(dump(file), dump(vCopy));
});

test('a Worker that failed is not kept', async () => {
  const file = buildDatabase({ dirty: { s: { needsRebuild: 2 } } });
  let fail = true;
  const events = await chain(releaseFile(RECONCILE), file, async ({ start, wait }, params) => {
    const failing = (url, options) => {
      const worker = createWorker(file)(url, options);
      if (!fail) return worker;
      fail = false;
      const on = worker.on;
      worker.on = (event, fn) => on.call(worker, event, event === 'message' ? (message) => fn(message.type === 'delta-plan' ? { type: 'failed', error: 'stub failure' } : message) : fn);
      return worker;
    };
    start({ ...params, createWorker: failing, preferredSessionId: 's' });
    await wait(params);
    start({ ...params, createWorker: failing, preferredSessionId: 's' });
  });
  assert.deepEqual(kinds(events, 'spawn', 'terminate', 'delta'), [['spawn', true], ['terminate', null], ['spawn', true], ['delta', 's']]);
});

test('Worker: a listed preferred session is planned before the listing; the rest follow once each', async () => {
  const file = buildDatabase({ dirty: { a: { needsRebuild: 1 }, s: { needsRebuild: 2 }, z: { indexedSeq: 1 } } });
  assert.deepEqual(await runWorker(vFile(WORKER), file, 's'), ['list', 'plan s', 'delta s', 'plan a', 'delta a', 'plan z', 'delta z']);
  assert.deepEqual(await runWorker(releaseFile(WORKER), file, 's'), ['plan s', 'delta s', 'list', 'plan a', 'delta a', 'plan z', 'delta z']);
  // not listed, or none: the listing first, as before
  for (const preferred of ['clean', 'missing', undefined]) assert.deepEqual(await runWorker(releaseFile(WORKER), file, preferred), await runWorker(vFile(WORKER), file, preferred), String(preferred));
});

test('Worker: a reusable Worker serves one pass per run command; a plain one exits after its pass', async () => {
  const file = buildDatabase({ dirty: { a: { needsRebuild: 1 }, s: { needsRebuild: 2 } } });
  const dir = path.join(tmpRoot, `worker-${dirCounter++}`);
  fs.mkdirSync(path.join(dir, 'config', 'sessions'), { recursive: true });
  for (const [name, stub] of Object.entries(WORKER_STUBS)) fs.writeFileSync(path.join(dir, name), stub);
  const workerPath = path.join(dir, 'config', 'sessions', WORKER);
  fs.writeFileSync(workerPath, releaseFile(WORKER));
  const serve = (workerData, runs) => new Promise((resolve, reject) => {
    const trace = [];
    const worker = new Worker(workerPath, { workerData: { agentId: 'makaron', path: file, ...workerData } });
    worker.on('message', (message) => {
      if (message.type === 'trace') trace.push(message.what);
      else if (message.type === 'delta-plan') { trace.push(`delta ${message.plan.sessionId}`); worker.postMessage({ type: 'continue', accepted: true }); }
      else if (message.type === 'done') {
        trace.push('done');
        const next = runs.shift();
        if (next) worker.postMessage({ type: 'run', ...next });
        else if (workerData.reusable) worker.terminate();
      } else reject(new Error(JSON.stringify(message)));
    });
    worker.once('error', reject);
    worker.once('exit', (code) => resolve({ trace, code }));
  });
  const reused = await serve({ reusable: true, preferredSessionId: 's' }, [{ preferredSessionId: 'a' }, {}]);
  assert.deepEqual(reused.trace, ['plan s', 'delta s', 'list', 'plan a', 'delta a', 'done', 'plan a', 'delta a', 'list', 'plan s', 'delta s', 'done', 'list', 'plan a', 'delta a', 'plan s', 'delta s', 'done']);
  const plain = await serve({ preferredSessionId: 's' }, []);
  assert.deepEqual(plain, { trace: ['plan s', 'delta s', 'list', 'plan a', 'delta a', 'done'], code: 0 });
});
