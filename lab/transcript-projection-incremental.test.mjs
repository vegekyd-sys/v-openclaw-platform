import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import {
  patchTranscriptIndexIncremental,
  patchTranscriptReconcileIncremental,
  patchTranscriptReconcileWorkerIncremental,
  TRANSCRIPT_PROJECTION_INCREMENTAL_MARKER,
} from './patch-transcript-projection-incremental.mjs';

// V's bytes are the oracle. A projection is published by V's own full rebuild for the first k rows;
// rows k.. are then appended and the projection is marked append-dirty (needs_rebuild = 2) as the
// patched appender does. The delta the patched chunk plans and applies must equal V's full
// rebuild of all rows, row for row, or there must be no delta at all (then the session gets the
// full rebuild). The index chunks run with the real transcript-tree / record-coerce /
// string-coerce chunks and V's real table DDL; only the Kysely-to-SQLite glue is a stand-in.

const fixtures = new URL('./fixtures/transcript-projection-incremental/', import.meta.url);
const prepareFixtures = new URL('./fixtures/transcript-index-prepare/', import.meta.url);
const checkpointFixtures = new URL('./fixtures/transcript-projection-checkpoint/', import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, fixtures), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const INDEX = 'session-transcript-index-9itOio9h.js';
const RECONCILE = 'session-transcript-reconcile-j5qhAafV.js';
const WORKER = 'session-transcript-reconcile.worker.js';
const plan = JSON.parse(fs.readFileSync(new URL('./transcript-projection-incremental-plan.json', import.meta.url), 'utf8'));

test('release files are the patchers applied to V bytes, anchors exactly once', () => {
  const sources = { [INDEX]: patchTranscriptIndexIncremental(read(INDEX)), [RECONCILE]: patchTranscriptReconcileIncremental(read(RECONCILE)), [WORKER]: patchTranscriptReconcileWorkerIncremental(read(WORKER)) };
  assert.equal(plan.files.length, 3);
  for (const file of plan.files) {
    const name = path.basename(file.source);
    assert.equal(sha(read(name)), file.before);
    const built = fs.readFileSync(new URL(`../${file.source}`, import.meta.url), 'utf8');
    assert.equal(sha(built), file.after);
    assert.equal(built, sources[name]);
  }
  assert.throws(() => patchTranscriptIndexIncremental(sources[INDEX]), /already patched/);
  assert.throws(() => patchTranscriptReconcileIncremental(sources[RECONCILE]), /already patched/);
  assert.throws(() => patchTranscriptReconcileWorkerIncremental(sources[WORKER]), /already patched/);
  // the index fixture is the #405 release, i.e. V's bytes since 2026-10-17 03:39
  assert.equal(read(INDEX), fs.readFileSync(new URL('./release-files/transcript-projection-checkpoint/session-transcript-index-9itOio9h.js', import.meta.url), 'utf8'));
});

test('appender: every dirty mark keeps its place; prefix-intact ones record 2, unclassified rows 1', () => {
  const source = patchTranscriptIndexIncremental(read(INDEX));
  const appender = (text) => text.slice(text.indexOf('function createTranscriptIndexAppenderInTransaction'), text.indexOf('\tfunction applyForwardIndex(params) {'));
  const before = appender(read(INDEX));
  const after = appender(source);
  assert.equal(before.split('markSessionTranscriptIndexDirtyInTransaction(db, sessionId)').length - 1, 5);
  assert.equal(after.split('markSessionTranscriptIndexAppendDirtyInTransaction(db, sessionId)').length - 1, 5);
  assert.equal(after.split('markSessionTranscriptIndexDirtyInTransaction(db, sessionId)').length - 1, 2);
  // outside the appender, every other writer still marks a plain rebuild
  const outside = (text) => text.replace(appender(text), '');
  // ...plus the one inside markSessionTranscriptIndexAppendDirtyInTransaction itself
  assert.equal(outside(source).split('markSessionTranscriptIndexDirtyInTransaction(db, sessionId)').length, outside(read(INDEX)).split('markSessionTranscriptIndexDirtyInTransaction(db, sessionId)').length + 1);
  assert.match(source, /function markSessionTranscriptIndexAppendDirtyInTransaction\(db, sessionId\) \{\n\tconst dirty = markSessionTranscriptIndexDirtyInTransaction\(db, sessionId\);/u);
});

test('reconcile: the Worker offers a delta first and falls back to the full plan when it is refused', () => {
  const worker = patchTranscriptReconcileWorkerIncremental(read(WORKER));
  assert.match(worker, /const delta = prepareIncrementalSessionTranscriptProjection\(database\.db, sessionId\);\n\t\t\tif \(delta && await postAndWait\(\{\n\t\t\t\ttype: "delta-plan",\n\t\t\t\tplan: delta\n\t\t\t\}\)\) continue;\n\t\t\tconst plan = prepareSessionTranscriptProjection\(database\.db, sessionId\);/u);
  const owner = patchTranscriptReconcileIncremental(read(RECONCILE));
  assert.match(owner, /if \(message\.type === "delta-plan"\) \{[\s\S]*?runProjectionWrite\(databaseOptions, "sessions\.transcript-index\.delta"[\s\S]*?continueProjectionWorker\(worker, applied\);\n\t\t\t\t\treturn;\n\t\t\t\t\}\n\t\t\t\tif \(message\.type === "plan-start"\)/u);
});

// ---- Kysely stand-in: the query shapes the index chunk uses, executed by node:sqlite ----

const KYSELY_SYNC = `
const q = (name) => '"' + name + '"';
const expr = (sql) => ({ sql, as: (alias) => ({ sql, alias }) });
const fn = Object.assign((name, args) => expr(name + '(' + args.map(q).join(', ') + ')'), {
  countAll: () => expr('count(*)'),
  sum: (inner) => expr('sum(' + inner.sql + ')'),
});
function builder(state) {
  return {
    __state: state,
    select: (cols) => builder({ ...state, cols: typeof cols === 'function' ? [].concat(cols({ fn })) : [].concat(cols) }),
    set: (values) => builder({ ...state, set: values }),
    where: (col, op, value) => builder({ ...state, wheres: [...state.wheres, [col, op, value]] }),
    orderBy: (col, dir) => builder({ ...state, order: [col, dir] }),
    limit: (n) => builder({ ...state, limit: n }),
  };
}
export const i = () => ({
  selectFrom: (table) => builder({ kind: 'select', table, cols: [], wheres: [] }),
  updateTable: (table) => builder({ kind: 'update', table, cols: [], wheres: [] }),
});
function compile(query) {
  const s = query.__state;
  const args = [];
  const where = s.wheres.map(([col, op, value]) => {
    if (op === 'is' && value === null) return q(col) + ' IS NULL';
    args.push(value);
    return q(col) + ' ' + op + ' ?';
  });
  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  if (s.kind === 'update') {
    const keys = Object.keys(s.set);
    return { sql: 'UPDATE ' + q(s.table) + ' SET ' + keys.map((k) => q(k) + ' = ?').join(', ') + whereSql, args: [...keys.map((k) => s.set[k]), ...args] };
  }
  const cols = s.cols.map((c) => typeof c === 'string' ? q(c) : c.sql + ' AS ' + q(c.alias)).join(', ');
  return { sql: 'SELECT ' + cols + ' FROM ' + q(s.table) + whereSql + (s.order ? ' ORDER BY ' + q(s.order[0]) + ' ' + s.order[1] : '') + (s.limit !== undefined ? ' LIMIT ' + s.limit : ''), args };
}
export const n = (db, query) => {
  const { sql, args } = compile(query);
  if (query.__state.kind === 'update') { const r = db.prepare(sql).run(...args); return { rows: [], numAffectedRows: BigInt(r.changes) }; }
  return { rows: db.prepare(sql).all(...args) };
};
export const r = (db, query) => n(db, query).rows[0];
export const a = function* (db, query) { const { sql, args } = compile(query); yield* db.prepare(sql).iterate(...args); };
export const o = () => { throw new Error('prepareSqliteQuerySync is not used by these paths'); };
export const t = () => {};
`;
const NODE_SQLITE = `export const l = (db, operation) => { db.exec("BEGIN"); try { const result = operation(); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; } };`;

function loadIndexChunk(dir, source) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ['transcript-tree-BH69pMSi.js', 'record-coerce-DItp3I4t.js', 'string-coerce-CIXf7egm.js']) fs.writeFileSync(path.join(dir, name), fs.readFileSync(new URL(name, prepareFixtures)));
  fs.writeFileSync(path.join(dir, 'kysely-sync-DKYGT267.js'), KYSELY_SYNC);
  fs.writeFileSync(path.join(dir, 'node-sqlite-CL-d6drd.js'), NODE_SQLITE);
  fs.writeFileSync(path.join(dir, INDEX), source);
  return import(pathToFileURL(path.join(dir, INDEX)).href);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'projection-incremental-'));
const original = await loadIndexChunk(path.join(tmp, 'a'), read(INDEX));
const patched = await loadIndexChunk(path.join(tmp, 'b'), patchTranscriptIndexIncremental(read(INDEX)));
// original exports: g prepare, u size check; patched adds v plan, w apply
const prepare = original.g;

const SCHEMA = fs.readFileSync(new URL('agent-transcript-schema.sql', checkpointFixtures), 'utf8');
function freshDb() {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  db.exec(SCHEMA);
  return db;
}
function seed(db, sessionId, events, from = 0) {
  if (from === 0) db.prepare('INSERT INTO session_windows (session_id, session_key, created_at, updated_at, transcript_updated_at) VALUES (?, ?, 1, 1, 1791820900000)').run(sessionId, `agent:t:${sessionId}`);
  const ins = db.prepare('INSERT INTO transcript_events (session_id, seq, event_json, created_at) VALUES (?, ?, ?, ?)');
  const identity = db.prepare('INSERT OR IGNORE INTO transcript_event_identities (session_id, event_id, seq, event_type, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (let seq = from; seq < events.length; seq++) {
    const event = events[seq];
    ins.run(sessionId, seq, JSON.stringify(event), 1791820900000 + seq);
    // readTranscriptEventIdentity: a trimmed non-blank string id
    if (event && typeof event === 'object' && typeof event.id === 'string' && event.id.trim()) identity.run(sessionId, event.id.trim(), seq, typeof event.type === 'string' ? event.type : null, typeof event.parentId === 'string' ? event.parentId : null, 1791820900000 + seq);
  }
}
/** Writes the original full rebuild into the projection tables, as the reconcile publishes it. */
function publishFullRebuild(db, sessionId) {
  const projection = prepare(db, sessionId);
  db.prepare('DELETE FROM session_transcript_active_events WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM session_transcript_fts WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM session_transcript_index_state WHERE session_id = ?').run(sessionId);
  const active = db.prepare('INSERT INTO session_transcript_active_events (session_id, active_position, event_seq, message_position, context_eligible) VALUES (?, ?, ?, ?, ?)');
  for (const row of projection.activeRows) active.run(sessionId, row.activePosition, row.eventSeq, row.messagePosition, row.contextEligible);
  const fts = db.prepare('INSERT INTO session_transcript_fts (text, session_id, message_id, role, timestamp) VALUES (?, ?, ?, ?, ?)');
  for (const row of projection.ftsRows) fts.run(row.text, sessionId, row.messageId, row.role, row.timestamp);
  db.prepare('INSERT INTO session_transcript_index_state (session_id, indexed_seq, leaf_event_id, needs_rebuild, active_event_count, active_message_count, updated_at) VALUES (?, ?, ?, 0, ?, ?, 1)')
    .run(sessionId, projection.sourceIndexedSeq, projection.leafEventId, projection.activeEventCount, projection.activeMessageCount);
  return projection;
}
/** The stored projection in the shape a full rebuild produces it (FTS rowids and updated_at are not part of it). */
function storedProjection(db, sessionId) {
  const state = db.prepare('SELECT indexed_seq, leaf_event_id, needs_rebuild, active_event_count, active_message_count FROM session_transcript_index_state WHERE session_id = ?').get(sessionId);
  return {
    activeRows: db.prepare('SELECT active_position AS activePosition, event_seq AS eventSeq, message_position AS messagePosition, context_eligible AS contextEligible FROM session_transcript_active_events WHERE session_id = ? ORDER BY active_position').all(sessionId).map((r) => ({ ...r })),
    ftsRows: db.prepare('SELECT message_id AS messageId, role, text, timestamp FROM session_transcript_fts WHERE session_id = ? ORDER BY rowid').all(sessionId).map((r) => ({ ...r })),
    activeEventCount: state.active_event_count,
    activeMessageCount: state.active_message_count,
    leafEventId: state.leaf_event_id,
    needsRebuild: state.needs_rebuild,
    sourceIndexedSeq: state.indexed_seq,
  };
}
function rebuiltProjection(db, sessionId) {
  const p = prepare(db, sessionId);
  return { activeRows: p.activeRows.map((r) => ({ ...r })), ftsRows: p.ftsRows.map((r) => ({ ...r })), activeEventCount: p.activeEventCount, activeMessageCount: p.activeMessageCount, leafEventId: p.leafEventId, needsRebuild: 0, sourceIndexedSeq: p.sourceIndexedSeq };
}

const text = (t) => ({ type: 'text', text: t });
const msg = (id, parentId, role, content, extra = {}) => ({ type: 'message', id, parentId, timestamp: '2026-10-13T08:00:00.000Z', message: { role, content, ...extra.message }, ...extra.event });
const SCENARIOS = {
  linear: [
    { type: 'session', id: 's', version: 3 },
    msg('u1', null, 'user', 'hello  '),
    msg('a1', 'u1', 'assistant', [text('hi'), { type: 'thinking', thinking: 'x' }, text('  '), text('there')]),
    { type: 'message', id: 't1', parentId: 'a1', timestamp: 1791820918268, message: { role: 'toolResult', toolCallId: 'c', content: [text('ok'), { type: 'image', data: 'QUJD'.repeat(200), mimeType: 'image/png' }] } },
    msg('a2', 't1', 'assistant', [{ type: 'output_text', text: 'done' }]),
    msg('u2', 'a2', 'user', [{ type: 'input_text', text: 'q' }, { type: 'image', data: 'QUJD' }], { message: { excludeFromContext: true } }),
    { type: 'custom', id: 'k1', parentId: 'u2', customType: 'note', data: {} },
    { type: 'compaction', id: 'c1', parentId: 'k1', summary: 'sum', firstKeptEntryId: 'a2', tokensBefore: 1 },
    msg('a3', 'c1', 'assistant', { not: 'array' }, { message: { text: '  plain text  ' } }),
    msg('u3', 'a3', 'user', 'no timestamp', { event: { timestamp: undefined } }),
    msg('a4', 'u3', 'assistant', 'string content'),
  ],
  sideAppend: [
    { type: 'session', id: 's', version: 3 },
    msg('u1', null, 'user', 'one'),
    msg('a1', 'u1', 'assistant', 'two'),
    { type: 'custom', id: 'conversation-turn-reply-1', customType: 'openclaw.conversation-turn-reply', appendMode: 'side', timestamp: 1791820918268, data: { message: { role: 'assistant', content: 'side' } } },
    { type: 'message', id: 'side-msg', parentId: 'a1', appendMode: 'side', message: { role: 'assistant', content: 'side message' } },
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
  resets: [
    { type: 'session', id: 's', version: 3 },
    msg('u1', null, 'user', 'before reset'),
    msg('a1', 'u1', 'assistant', 'answer'),
    { type: 'reset', id: 'r1', parentId: 'a1', firstKeptEntryId: 'a1' },
    msg('u2', 'a1', 'user', 'stale parent after reset'),
    msg('a2', 'u2', 'assistant', 'after reset'),
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
// A 1,500-row session with branches off the active path, tool results with images, compactions
// and context exclusions, deterministic.
function mixedSession(rows) {
  const events = [{ type: 'session', id: 's', version: 3 }];
  let leaf = null;
  let x = 7;
  const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  for (let i = 0; i < rows; i++) {
    const id = `e${i}`;
    const r = rnd();
    if (r < 0.05 && leaf) { events.push(msg(id, `e${Math.max(0, i - 7)}`, 'user', `off path ${i}`)); continue; }
    if (r < 0.10) { events.push({ type: 'message', id, parentId: leaf, timestamp: 1791820900000 + i, message: { role: 'toolResult', toolCallId: `c${i}`, content: [text(`tool ${i}`), { type: 'image', data: 'QUJD'.repeat(10), mimeType: 'image/png' }] } }); leaf = id; continue; }
    if (r < 0.12) { events.push({ type: 'compaction', id, parentId: leaf, summary: `s${i}`, firstKeptEntryId: leaf }); leaf = id; continue; }
    if (r < 0.15) { events.push({ type: 'custom', id, parentId: leaf, customType: 'c', data: {} }); leaf = id; continue; }
    events.push(msg(id, leaf, i % 2 ? 'assistant' : 'user', i % 3 ? `text ${i}` : [text(`part ${i}`)], r < 0.2 ? { message: { excludeFromContext: true } } : {}));
    leaf = id;
  }
  return events;
}


const ids = (n) => Array.from({ length: n }, (_, i) => `x${i}`);
// Rows that can follow a valid projection: every shape the appender marks dirty, and the ones that must fall back.
function suffixShapes(events, rnd, tag = 'n') {
  const nodeIds = events.filter((e) => e && typeof e === 'object' && typeof e.id === 'string' && e.id.trim() && e.type !== 'session').map((e) => e.id);
  const pick = () => nodeIds[Math.floor(rnd() * nodeIds.length)] ?? null;
  const last = () => nodeIds.at(-1) ?? null;
  let n = 0;
  const id = () => `${tag}${n++}`;
  return {
    branch: () => { const a = id(); const b = id(); return [msg(a, pick(), 'user', `branch ${a}`), msg(b, a, 'assistant', `answer ${b}`)]; },
    rewind: () => { const l = id(); const t = pick(); const u = id(); return [{ type: 'leaf', id: l, parentId: last(), targetId: t }, msg(u, t, 'user', `after rewind ${u}`)]; },
    rewindAppendParent: () => { const l = id(); const t = pick(); const u = id(); return [{ type: 'leaf', id: l, parentId: last(), targetId: t, appendParentId: t }, msg(u, l, 'user', `on control ${u}`)]; },
    side: () => { const s = id(); const u = id(); return [{ type: 'custom', id: s, customType: 'openclaw.conversation-turn-reply', appendMode: 'side', data: {} }, msg(u, s, 'user', `after side ${u}`)]; },
    sideMessage: () => { const s = id(); return [{ type: 'message', id: s, parentId: last(), appendMode: 'side', message: { role: 'assistant', content: `side ${s}` } }]; },
    leafToNull: () => [{ type: 'leaf', id: id(), parentId: last(), targetId: null }],
    reset: () => { const r = id(); const u = id(); return [{ type: 'reset', id: r, parentId: last(), firstKeptEntryId: last() }, msg(u, pick(), 'user', `after reset ${u}`)]; },
    staleParent: () => { const u = id(); return [msg(u, 'missing-parent', 'user', `stale ${u}`)]; },
    parentless: () => { const u = id(); return [{ type: 'message', id: u, message: { role: 'user', content: `parentless ${u}` } }]; },
    nonCanonical: () => { const u = id(); return [{ type: 'tool_progress', id: u, parentId: last(), message: { role: 'assistant', content: `progress ${u}` } }]; },
    invalidLeaf: () => [{ type: 'leaf', id: id(), parentId: last(), targetId: 'nowhere' }],
    compactionThenBranch: () => { const c = id(); const a = id(); return [{ type: 'compaction', id: c, parentId: last(), summary: 's', firstKeptEntryId: last() }, msg(a, pick(), 'user', `crosses checkpoint ${a}`)]; },
    linear: () => { const a = id(); const b = id(); return [msg(a, last(), 'user', `linear ${a}`), msg(b, a, 'assistant', `linear ${b}`)]; },
  };
}

function check(name, events, base) {
  const db = freshDb();
  const sid = name;
  seed(db, sid, events.slice(0, base));
  publishFullRebuild(db, sid);
  seed(db, sid, events, base);
  db.prepare('UPDATE session_transcript_index_state SET needs_rebuild = 2, updated_at = 7 WHERE session_id = ?').run(sid);
  const delta = patched.x(db, sid);
  if (!delta) return 'full';
  assert.equal(patched.y(db, delta), true, `${name}: delta refused`);
  const stored = storedProjection(db, sid);
  const rebuilt = rebuiltProjection(db, sid);
  stored.ftsRows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  rebuilt.ftsRows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  assert.deepEqual(stored, rebuilt, `${name}: delta projection differs from a full rebuild`);
  return delta.keepActiveEventCount < delta.baseActiveEventCount ? 'delta-trim' : 'delta';
}

test('a delta equals the full rebuild of every row, or there is none', () => {
  let x = 11;
  const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const outcomes = {};
  const count = (shape, outcome) => { (outcomes[shape] ??= {})[outcome] = (outcomes[shape]?.[outcome] ?? 0) + 1; };
  const bases = { mixed: mixedSession(300), ...SCENARIOS };
  for (const [baseName, baseEvents] of Object.entries(bases)) {
    for (let k = Math.max(2, baseEvents.length - 40); k <= baseEvents.length; k += baseName === 'mixed' ? 7 : 1) {
      const prefix = baseEvents.slice(0, k);
      const shapes = suffixShapes(prefix, rnd);
      for (const [shape, make] of Object.entries(shapes)) {
        const one = [...prefix, ...make()];
        count(shape, check(`${baseName}-${k}-${shape}`, one, k));
        // two dirty appends in a row, the second on top of the first
        const more = suffixShapes(one, rnd, 'm');
        const second = Object.values(more)[Math.floor(rnd() * Object.keys(more).length)];
        count(`${shape}+`, check(`${baseName}-${k}-${shape}-twice`, [...one, ...second()], k));
      }
    }
  }
  const sum = (shape, outcome) => outcomes[shape]?.[outcome] ?? 0;
  console.log(JSON.stringify(outcomes));
  // the common shapes take the delta, including a trimmed suffix and a branch across a compaction
  for (const shape of ['branch', 'rewind', 'side', 'linear', 'compactionThenBranch']) assert(sum(shape, 'delta') + sum(shape, 'delta-trim') > 0, `${shape} never took a delta`);
  assert(sum('branch', 'delta-trim') > 0 && sum('rewind', 'delta-trim') > 0);
  // the shapes this replay cannot vouch for always fall back
  for (const shape of ['reset', 'staleParent', 'invalidLeaf']) assert.equal(sum(shape, 'delta') + sum(shape, 'delta-trim'), 0, `${shape} took a delta`);
});

test('no delta without the append-dirty mark, a matching old projection and a changed tail', () => {
  const events = [...SCENARIOS.linear, msg('z1', 'a4', 'user', 'branch'), msg('z2', 'z1', 'assistant', 'x')];
  const base = SCENARIOS.linear.length;
  const setup = () => { const db = freshDb(); seed(db, 's', events.slice(0, base)); publishFullRebuild(db, 's'); seed(db, 's', events, base); return db; };
  {
    const db = setup();
    db.prepare('UPDATE session_transcript_index_state SET needs_rebuild = 2 WHERE session_id = ?').run('s');
    assert.ok(patched.x(db, 's'), 'control');
  }
  for (const [label, damage] of [
    ['plain dirty (rewrite, replace, migration, old data)', (db) => db.prepare('UPDATE session_transcript_index_state SET needs_rebuild = 1 WHERE session_id = ?').run('s')],
    ['old projection missing a row', (db) => { db.prepare('UPDATE session_transcript_index_state SET needs_rebuild = 2 WHERE session_id = ?').run('s'); db.prepare('DELETE FROM session_transcript_active_events WHERE session_id = ? AND active_position = 3').run('s'); }],
    ['watermark unknown', (db) => db.prepare('UPDATE session_transcript_index_state SET needs_rebuild = 2, indexed_seq = -1 WHERE session_id = ?').run('s')],
    ['unclassified rows', (db) => { db.prepare('UPDATE session_transcript_index_state SET needs_rebuild = 2 WHERE session_id = ?').run('s'); db.prepare('UPDATE session_transcript_active_events SET context_eligible = NULL WHERE session_id = ? AND active_position = 0').run('s'); }],
    ['nothing appended', (db) => { db.prepare('UPDATE session_transcript_index_state SET needs_rebuild = 2 WHERE session_id = ?').run('s'); db.prepare('DELETE FROM transcript_events WHERE session_id = ? AND seq >= ?').run('s', base); }],
  ]) {
    const db = setup();
    damage(db);
    assert.equal(patched.x(db, 's'), undefined, label);
  }
  // a delta planned before another write is refused when applied
  const db = setup();
  db.prepare('UPDATE session_transcript_index_state SET needs_rebuild = 2 WHERE session_id = ?').run('s');
  const delta = patched.x(db, 's');
  db.prepare('UPDATE session_transcript_index_state SET needs_rebuild = 1 WHERE session_id = ?').run('s');
  assert.equal(patched.y(db, delta), false);
  db.prepare('UPDATE session_transcript_index_state SET needs_rebuild = 2 WHERE session_id = ?').run('s');
  db.prepare("UPDATE session_windows SET transcript_updated_at = 5 WHERE session_id = ?").run('s');
  assert.equal(patched.y(db, delta), false);
});
