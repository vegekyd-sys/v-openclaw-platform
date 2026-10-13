import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { patchTranscriptProjectionSinglePass, TRANSCRIPT_PROJECTION_SINGLE_PASS_MARKER } from './patch-transcript-projection-single-pass.mjs';
import { patchTranscriptReconcileReadOnly, TRANSCRIPT_RECONCILE_READONLY_MARKER } from './patch-transcript-reconcile-readonly.mjs';

// V's bytes (upstream 2026.9.1) are the oracle. The original and patched index chunks run with
// the real transcript-tree / record-coerce / string-coerce chunks; only the Kysely-to-SQLite
// glue is a small stand-in that executes the same queries. The reconcile Worker runs in a real
// worker thread against stub siblings that record how it opened and closed the database.

const fixtures = new URL('./fixtures/transcript-index-prepare/', import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, fixtures), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const INDEX = 'session-transcript-index-9itOio9h.js';
const WORKER = 'config/sessions/session-transcript-reconcile.worker.js';
const plan = JSON.parse(fs.readFileSync(new URL('./transcript-index-prepare-plan.json', import.meta.url), 'utf8'));

test('release files are the patchers applied to V bytes, anchors exactly once', () => {
  const sources = { [INDEX]: patchTranscriptProjectionSinglePass(read(INDEX)), [WORKER]: patchTranscriptReconcileReadOnly(read(WORKER)) };
  for (const file of plan.files) {
    const name = file.target.replace('openclaw/dist/', '');
    assert.equal(sha(read(name)), file.before);
    const built = fs.readFileSync(new URL(`../${file.source}`, import.meta.url), 'utf8');
    assert.equal(sha(built), file.after);
    assert.equal(built, sources[name]);
  }
  assert.throws(() => patchTranscriptProjectionSinglePass(sources[INDEX]), /Already patched/);
  assert.throws(() => patchTranscriptReconcileReadOnly(sources[WORKER]), /Already patched/);
  assert.equal(sources[INDEX].split(TRANSCRIPT_PROJECTION_SINGLE_PASS_MARKER).length, 2);
  assert.equal(sources[WORKER].split(TRANSCRIPT_RECONCILE_READONLY_MARKER).length, 2);
});

// ---- index chunk: original vs patched prepare over the same transcripts ----

const KYSELY_SYNC = `
const param = Symbol("param");
function builder(state) {
  return {
    __state: state,
    select: (cols) => builder({ ...state, cols: Array.isArray(cols) ? cols : [cols] }),
    where: (col, op, value) => builder({ ...state, wheres: [...state.wheres, [col, op, value]] }),
    orderBy: (col, dir) => builder({ ...state, order: [col, dir] }),
    limit: (n) => builder({ ...state, limit: n }),
  };
}
export const i = () => ({ selectFrom: (table) => builder({ table, cols: [], wheres: [] }) });
function compile(q, arg) {
  const s = q.__state;
  const args = [];
  const where = s.wheres.map(([col, op, value]) => { args.push(value?.[param] ? value.fn(arg) : value); return '"' + col + '" ' + op + ' ?'; });
  const sql = 'SELECT ' + s.cols.map((c) => '"' + c + '"').join(', ') + ' FROM "' + s.table + '"' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + (s.order ? ' ORDER BY "' + s.order[0] + '" ' + s.order[1] : '') + (s.limit ? ' LIMIT ' + s.limit : '');
  return { sql, args };
}
export const r = (db, q) => { const { sql, args } = compile(q); return db.prepare(sql).get(...args); };
export const n = (db, q) => { const { sql, args } = compile(q); return { rows: db.prepare(sql).all(...args) }; };
export const a = function* (db, q) { const { sql, args } = compile(q); yield* db.prepare(sql).iterate(...args); };
export const o = (db, build) => { const q = build((fn) => ({ [param]: true, fn })); return (arg) => { const { sql, args } = compile(q, arg); return { rows: db.prepare(sql).all(...args) }; }; };
export const t = () => {};
`;
const NODE_SQLITE = `export const l = (db, operation) => { db.exec("BEGIN"); try { const result = operation(); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; } };`;

function loadIndexChunk(dir, source, kyselySync = KYSELY_SYNC) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ['transcript-tree-BH69pMSi.js', 'record-coerce-DItp3I4t.js', 'string-coerce-CIXf7egm.js']) fs.writeFileSync(path.join(dir, name), read(name));
  fs.writeFileSync(path.join(dir, 'kysely-sync-DKYGT267.js'), kyselySync);
  fs.writeFileSync(path.join(dir, 'node-sqlite-CL-d6drd.js'), NODE_SQLITE);
  fs.writeFileSync(path.join(dir, INDEX), source);
  return import(pathToFileURL(path.join(dir, INDEX)).href);
}

const text = (t) => ({ type: 'text', text: t });
const msg = (id, parentId, role, content, extra = {}) => ({ type: 'message', id, parentId, timestamp: '2026-10-13T08:00:00.000Z', message: { role, content, ...extra.message }, ...extra.event });
const SCENARIOS = {
  linear: [
    { type: 'session', id: 's', version: 3 },
    msg('u1', null, 'user', 'hello  '),
    msg('a1', 'u1', 'assistant', [text('hi'), { type: 'thinking', thinking: 'x' }, text('  '), text('there')]),
    { type: 'message', id: 't1', parentId: 'a1', timestamp: 1791820918268, message: { role: 'toolResult', toolCallId: 'c', content: [text('ok'), { type: 'image', data: 'QUJD'.repeat(2000), mimeType: 'image/png' }] } },
    msg('a2', 't1', 'assistant', [{ type: 'output_text', text: 'done' }]),
    msg('u2', 'a2', 'user', [{ type: 'input_text', text: 'q' }, { type: 'image', data: 'QUJD' }], { message: { excludeFromContext: true } }),
    { type: 'custom', id: 'k1', parentId: 'u2', customType: 'note', data: {} },
    { type: 'compaction', id: 'c1', parentId: 'k1', summary: 'sum', firstKeptEntryId: 'a2', tokensBefore: 1 },
    msg('a3', 'c1', 'assistant', { not: 'array' }, { message: { text: '  plain text  ' } }),
    msg('a4', 'a3', 'assistant', 'string content'),
  ],
  sideAppend: [
    { type: 'session', id: 's', version: 3 },
    msg('u1', null, 'user', 'one'),
    msg('a1', 'u1', 'assistant', 'two'),
    { type: 'custom', id: 'conversation-turn-reply-1', customType: 'openclaw.conversation-turn-reply', appendMode: 'side', timestamp: 1791820918268, data: { message: { role: 'assistant', content: 'side' } } },
    msg('u2', 'a1', 'user', 'three'),
    msg('a2', 'u2', 'assistant', 'four'),
  ],
  rewindBranch: [
    { type: 'session', id: 's', version: 3 },
    msg('u1', null, 'user', 'root'),
    msg('a1', 'u1', 'assistant', 'first answer'),
    msg('u2', 'a1', 'user', 'follow up'),
    msg('a2', 'u2', 'assistant', 'old branch'),
    { type: 'leaf', id: 'l1', parentId: 'a2', targetId: 'a1' },
    msg('u3', 'a1', 'user', 'new branch question'),
    msg('a3', 'u3', 'assistant', 'new branch answer'),
  ],
  leafToNull: [
    { type: 'session', id: 's', version: 3 },
    msg('u1', null, 'user', 'gone'),
    { type: 'leaf', id: 'l1', parentId: 'u1', targetId: null },
  ],
  legacyNoParents: [
    { type: 'session', id: 's', version: 3 },
    { type: 'message', id: 'm1', timestamp: 'not a date', message: { role: 'user', content: 'legacy one' } },
    { type: 'message', id: 'm2', message: { role: 'assistant', content: [text('legacy two')] } },
    { type: 'message', id: '  ', message: { role: 'assistant', content: 'blank id' } },
    { type: 'custom', customType: 'x' },
    { message: { role: 'user', content: 'no type' } },
  ],
  invalidLeafControl: [
    { type: 'session', id: 's', version: 3 },
    msg('u1', null, 'user', 'a'),
    { type: 'leaf', id: 'l1', parentId: 'u1', targetId: 'missing' },
    msg('a1', 'u1', 'assistant', 'b'),
  ],
};

function seed(dbPath, sessions) {
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE session_windows (session_id TEXT PRIMARY KEY, transcript_updated_at INTEGER); CREATE TABLE transcript_events (session_id TEXT NOT NULL, seq INTEGER NOT NULL, event_json TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (session_id, seq));');
  const ins = db.prepare('INSERT INTO transcript_events VALUES (?, ?, ?, ?)');
  for (const [sid, events] of Object.entries(sessions)) {
    db.prepare('INSERT INTO session_windows VALUES (?, ?)').run(sid, 1791820900000);
    events.forEach((event, seq) => ins.run(sid, seq * 3 + 1, JSON.stringify(event), 1791820900000 + seq));
  }
  db.close();
}

function bigSession(n) {
  const events = [{ type: 'session', id: 's', version: 3 }];
  let parent = null;
  for (let i = 0; i < n; i += 1) {
    const id = `e${i}`;
    if (i % 7 === 3) events.push({ type: 'message', id, parentId: parent, message: { role: 'toolResult', toolCallId: `c${i}`, content: [text(`r${i}`), { type: 'image', data: 'QUJD'.repeat(500), mimeType: 'image/png' }] } });
    else if (i % 11 === 5) events.push({ type: 'custom', id: `side${i}`, appendMode: 'side', customType: 'openclaw.conversation-turn-reply', data: {} });
    else if (i % 97 === 50) { events.push({ type: 'leaf', id, parentId: parent, targetId: `e${i - 10}` }); }
    else events.push(msg(id, parent, i % 2 ? 'assistant' : 'user', i % 5 ? `text ${i}` : [text(`part ${i}`), text('')], i % 13 === 0 ? { message: { excludeFromContext: true } } : {}));
    if (!(i % 11 === 5)) parent = events.at(-1).type === 'leaf' ? `e${i - 10}` : id;
  }
  return events;
}

test('single-pass prepare returns exactly what the two-pass original returns', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tip-index-'));
  try {
    const original = await loadIndexChunk(path.join(dir, 'original'), read(INDEX));
    const patched = await loadIndexChunk(path.join(dir, 'patched'), patchTranscriptProjectionSinglePass(read(INDEX)));
    const sessions = { ...SCENARIOS, big: bigSession(3000), empty: [] };
    const dbPath = path.join(dir, 'agent.sqlite');
    seed(dbPath, sessions);
    const db = new DatabaseSync(dbPath, { readOnly: true });
    let nonTrivial = 0;
    for (const sid of [...Object.keys(sessions), 'missing-session']) {
      const a = original.g(db, sid);
      const b = patched.g(db, sid);
      assert.deepStrictEqual(b, a, `prepare differs for ${sid}`);
      if (a && a.activeRows.length && a.ftsRows.length) nonTrivial += 1;
    }
    assert(nonTrivial >= 5, 'scenarios exercise active and FTS rows');
    const big = original.g(db, 'big');
    assert(big.activeRows.length < sessions.big.length - 1, 'big session has an off-path branch');
    assert.equal(original.g(db, 'leafToNull').activeRows.length, 0);
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('patched prepare reads each transcript row once', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tip-index-'));
  try {
    const countingSync = KYSELY_SYNC.replace('export const a = function* (db, q) { const { sql, args } = compile(q);', 'export const a = function* (db, q) { const { sql, args } = compile(q); globalThis.__iterations = (globalThis.__iterations ?? 0) + 1;')
      .replace('export const o = (db, build) => {', 'export const o = (db, build) => { globalThis.__prepared = (globalThis.__prepared ?? 0) + 1;');
    const load = (name, source) => loadIndexChunk(path.join(dir, name), source, countingSync);
    const original = await load('original', read(INDEX));
    const patched = await load('patched', patchTranscriptProjectionSinglePass(read(INDEX)));
    const dbPath = path.join(dir, 'agent.sqlite');
    seed(dbPath, { s: SCENARIOS.linear });
    const db = new DatabaseSync(dbPath, { readOnly: true });
    globalThis.__iterations = 0; globalThis.__prepared = 0;
    original.g(db, 's');
    assert.deepEqual([globalThis.__iterations, globalThis.__prepared], [1, 1], 'original: tree scan + per-row path reads');
    globalThis.__iterations = 0; globalThis.__prepared = 0;
    patched.g(db, 's');
    assert.deepEqual([globalThis.__iterations, globalThis.__prepared], [1, 0], 'patched: tree scan only');
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- reconcile Worker: read-only connection, same lease, fallback to the original open ----

function workerSiblings(dir, scenario) {
  const record = (entry) => `globalThis.__record(${entry})`;
  const files = {
    'openclaw-agent-db-CUTe8BX6.js': `import { DatabaseSync } from "node:sqlite";
let db;
export const g = (options) => { ${record('["writer-open", options.agentId]')}; db = new DatabaseSync(options.path); return { db }; };
export const i = (p) => { ${record('["writer-close"]')}; db?.close(); };`,
    'session-transcript-index-9itOio9h.js': `export const o = (db) => { let writable = true; try { db.exec("CREATE TABLE __probe (x)"); db.exec("DROP TABLE __probe"); } catch { writable = false; } ${record('["list", writable]')}; return db.prepare("SELECT session_id FROM session_windows ORDER BY session_id").all().map((r) => r.session_id); };
export const g = (db, sessionId) => ({ sessionId, sourceIndexedSeq: 1, sourceTranscriptUpdatedAt: 1, activeEventCount: 1, activeMessageCount: 0, leafEventId: null, activeRows: [{ activePosition: 0, contextEligible: 1, eventSeq: 1, messagePosition: null }], ftsRows: [] });`,
    'kysely-sync-DKYGT267.js': `export const t = () => { ${record('["kysely-cache"]')}; };`,
    'agent-id-CeT3w4ap.js': 'export const n = (id) => String(id).trim().toLowerCase();',
    'openclaw-agent-db-maintenance-DYSkzMMg.js': `
export const Y = (params) => { ${record('["lease-claim", params.agentId]')}; if (${JSON.stringify(scenario)} === "claim-throws") throw new Error("Agent database maintenance is in progress"); return "lease-1"; };
export const X = (id) => { ${record('["lease-release", id]')}; };
export const d = (db) => db.prepare("PRAGMA user_version").get().user_version;
export const f = (db) => { const row = db.prepare("SELECT role, agent_id FROM schema_meta WHERE meta_key = 'primary'").get(); return row ? { role: row.role, agentId: row.agent_id, schemaVersion: 19 } : null; };
export const l = (existing, agentId) => { if (existing.agentId !== agentId) throw new Error("belongs to another agent"); };`,
  };
  for (const [name, source] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), source);
}

async function runWorker(source, scenario) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tip-worker-'));
  try {
    fs.mkdirSync(path.join(dir, 'config/sessions'), { recursive: true });
    workerSiblings(dir, scenario);
    const dbPath = path.join(dir, 'agent.sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec(`PRAGMA journal_mode = WAL; PRAGMA user_version = ${scenario === 'old-schema' ? 18 : 19};
      CREATE TABLE schema_meta (meta_key TEXT PRIMARY KEY, role TEXT, agent_id TEXT);
      CREATE TABLE session_windows (session_id TEXT PRIMARY KEY);
      INSERT INTO session_windows VALUES ('s1'), ('s2');`);
    db.prepare("INSERT INTO schema_meta VALUES ('primary', 'agent', ?)").run(scenario === 'other-owner' ? 'someone-else' : 'makaron');
    db.close();
    const file = path.join(dir, WORKER);
    fs.writeFileSync(file, source);
    const events = [];
    const worker = new Worker(pathToFileURL(file), { workerData: { agentId: 'Makaron', path: dbPath } });
    await new Promise((resolve, reject) => {
      worker.on('message', (message) => {
        events.push(message.type);
        if (message.type === 'done' || message.type === 'failed') { if (message.type === 'failed') events.push(message.error); return; }
        worker.postMessage({ type: 'continue', accepted: true });
      });
      worker.once('error', reject);
      worker.once('exit', resolve);
    });
    return { events, dir };
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

test('reconcile Worker reads through a read-only connection under the agent lease, falls back on doubt', async () => {
  const original = read(WORKER);
  const patched = patchTranscriptReconcileReadOnly(original);
  const recorded = async (source, scenario) => {
    // the stub siblings record each call into a file next to the database
    const logged = source.replace('const input = parseWorkerInput(workerData);', 'const input = parseWorkerInput(workerData);\nconst __fs = await import("node:fs"); const __log = workerData.path + ".log"; globalThis.__record = (entry) => __fs.appendFileSync(__log, JSON.stringify(entry) + "\\n");');
    const { events, dir } = await runWorker(logged, scenario);
    try {
      const log = path.join(dir, 'agent.sqlite.log');
      const records = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
      return { events, records };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  const expectedEvents = ['plan-start', 'active-chunk', 'plan-finish', 'plan-start', 'active-chunk', 'plan-finish', 'done'];

  const before = await recorded(original, 'ok');
  assert.deepEqual(before.events, expectedEvents);
  assert.deepEqual(before.records, [['writer-open', 'Makaron'], ['list', true], ['writer-close']]);

  const after = await recorded(patched, 'ok');
  assert.deepEqual(after.events, expectedEvents, 'same plans streamed to the parent');
  assert.deepEqual(after.records, [['lease-claim', 'Makaron'], ['kysely-cache'], ['list', false], ['lease-release', 'lease-1']], 'read-only connection, lease claimed and released, writer open never used');

  for (const scenario of ['old-schema', 'other-owner', 'claim-throws']) {
    const fallback = await recorded(patched, scenario);
    assert.deepEqual(fallback.events, expectedEvents, `${scenario}: same plans`);
    const claims = fallback.records.filter((r) => r[0] === 'lease-claim').length;
    const releases = fallback.records.filter((r) => r[0] === 'lease-release').length;
    assert.equal(claims, 1, `${scenario}: one lease claim attempt`);
    assert.equal(releases, scenario === 'claim-throws' ? 0 : 1, `${scenario}: claimed lease released`);
    assert.deepEqual(fallback.records.filter((r) => r[0] !== 'lease-claim' && r[0] !== 'lease-release'), [['writer-open', 'Makaron'], ['list', true], ['writer-close']], `${scenario}: original writer open path`);
  }
});
