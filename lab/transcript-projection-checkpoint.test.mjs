import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import {
  patchBuiltinAttemptOpenCheckpoint,
  patchTranscriptIndexCheckpoint,
  patchTranscriptStoreCheckpoint,
  TRANSCRIPT_PROJECTION_CHECKPOINT_MARKER,
} from './patch-transcript-projection-checkpoint.mjs';

// V's bytes are the oracle: the original index chunk's full projection rebuild of the rewritten
// rows must equal the current projection after the patched in-place plan. Both chunks run with
// the real transcript-tree / record-coerce / string-coerce chunks and V's real table DDL; only the
// Kysely-to-SQLite glue is a stand-in that executes the same query shapes.

const fixtures = new URL('./fixtures/transcript-projection-checkpoint/', import.meta.url);
const prepareFixtures = new URL('./fixtures/transcript-index-prepare/', import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, fixtures), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const INDEX = 'session-transcript-index-9itOio9h.js';
const STORE = 'session-accessor.sqlite-transcript-store-DV0WFe1a.js';
const BUILTIN = 'builtin-openclaw-zQV8Wwjr.js';
const plan = JSON.parse(fs.readFileSync(new URL('./transcript-projection-checkpoint-plan.json', import.meta.url), 'utf8'));

test('release files are the patchers applied to V bytes, anchors exactly once', () => {
  const sources = { [INDEX]: patchTranscriptIndexCheckpoint(read(INDEX)), [STORE]: patchTranscriptStoreCheckpoint(read(STORE)), [BUILTIN]: patchBuiltinAttemptOpenCheckpoint(read(BUILTIN)) };
  assert.equal(plan.files.length, 3);
  for (const file of plan.files) {
    const name = path.basename(file.source);
    assert.equal(sha(read(name)), file.before);
    const built = fs.readFileSync(new URL(`../${file.source}`, import.meta.url), 'utf8');
    assert.equal(sha(built), file.after);
    assert.equal(built, sources[name]);
    assert.equal(built.split(TRANSCRIPT_PROJECTION_CHECKPOINT_MARKER).length, name === INDEX ? 3 : 2);
  }
  assert.throws(() => patchTranscriptIndexCheckpoint(sources[INDEX]), /already patched/);
  assert.throws(() => patchTranscriptStoreCheckpoint(sources[STORE]), /already patched/);
  assert.throws(() => patchBuiltinAttemptOpenCheckpoint(sources[BUILTIN]), /already patched/);
  // the dev-branch FTS rowid window (PR #398) changes the same chunk elsewhere; the anchors still apply
  const rowidWindow = new URL('./release-files/transcript-index-rowid-window/session-transcript-index-9itOio9h.js', import.meta.url);
  if (fs.existsSync(rowidWindow)) assert.doesNotThrow(() => patchTranscriptIndexCheckpoint(fs.readFileSync(rowidWindow, 'utf8')));
});

test('the store keeps the original fallback byte for byte', () => {
  const original = read(STORE);
  const patched = patchTranscriptStoreCheckpoint(original);
  const fallback = `	if (rebuildSynchronously) {
		deleteSessionTranscriptIndexInTransaction(database.db, resolved.sessionId);
		reconcileSessionTranscriptIndexInTransaction(database.db, resolved.sessionId);
	} else {
		markSessionTranscriptIndexDirtyInTransaction(database.db, resolved.sessionId);
		scheduleTranscriptProjectionReconcile(database, resolved.sessionId, true, {});
	}
}`;
  assert.equal(patched.split(fallback).length, 2);
  // only the exact-rewrite function changed; every other function is untouched
  const strip = (source) => source.replace(/function rewriteSqliteTranscriptEventRowsInTransaction[\s\S]*?\n\}\n/u, '').replace(/^import \{[^\n]*session-transcript-index-9itOio9h\.js";$/mu, '');
  assert.equal(strip(patched), strip(original));
  assert.match(patched, /projectionPlan === void 0 && shouldRebuildSessionTranscriptIndexSynchronously/u);
});

test('the embedded turn waits for a rebuilding projection, then opens again', async () => {
  const source = patchBuiltinAttemptOpenCheckpoint(read(BUILTIN));
  const helper = source.match(/async function openAttemptSessionManagerWhenProjected[\s\S]*?\n\}\n/u)[0];
  assert.match(source, /await openAttemptSessionManagerWhenProjected\(attempt\.sessionTarget, input\.effectiveCwd, \{[\s\S]*?\}, input\.abortSignal\)/u);
  const rebuilding = (sessionId) => Object.assign(new Error(`Session transcript projection is rebuilding: ${sessionId}`), { name: 'SessionTranscriptProjectionUnavailableError', sessionId });
  const make = (opens, waits) => new Function('SessionManager', 'importWait', `${helper.replace('await import("./session-transcript-reconcile-DFsDtc9l.js")', 'await importWait()')}; return openAttemptSessionManagerWhenProjected;`)(
    { open: () => { const next = opens.shift(); if (next instanceof Error) throw next; return next; } },
    async () => ({ waitForSessionTranscriptProjection: async () => { const next = waits.shift(); if (next instanceof Error) throw next; } }));
  const target = { sessionId: 's1' };
  // rebuilding once, then current: waits once and returns the second open
  assert.equal(await make([rebuilding('s1'), 'manager'], [undefined])(target, '/', {}, undefined), 'manager');
  // a wait that times out with the rebuilding error is retried; the fifth unavailable open gives up with it
  await assert.rejects(make([rebuilding('s1'), rebuilding('s1'), rebuilding('s1'), rebuilding('s1'), rebuilding('s1')], [rebuilding('s1'), rebuilding('s1'), rebuilding('s1'), rebuilding('s1')])(target, '/', {}, undefined), /rebuilding: s1/u);
  assert.equal(await make([rebuilding('s1'), rebuilding('s1'), 'late'], [rebuilding('s1'), undefined])(target, '/', {}, undefined), 'late');
  // other errors, other sessions and aborted runs are not retried
  await assert.rejects(make([new Error('boom')], [])(target, '/', {}, undefined), /boom/u);
  await assert.rejects(make([rebuilding('other')], [])(target, '/', {}, undefined), /rebuilding: other/u);
  const aborted = AbortSignal.abort(new Error('run aborted'));
  await assert.rejects(make([rebuilding('s1'), 'never'], [])(target, '/', {}, aborted), /run aborted/u);
  // the rest of the chunk is unchanged
  const strip = (text) => text.replace(`${TRANSCRIPT_PROJECTION_CHECKPOINT_MARKER}: a turn that starts while its projection rebuilds waits for it instead of failing\n`, '').replace(helper, '').replace(/await openAttemptSessionManagerWhenProjected\((attempt\.sessionTarget, input\.effectiveCwd, \{[\s\S]*?\}), input\.abortSignal\)/u, 'SessionManager.open($1)');
  assert.ok(strip(source) === read(BUILTIN), 'the builtin chunk changed outside the bounded open');
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'projection-checkpoint-'));
const original = await loadIndexChunk(path.join(tmp, 'a'), read(INDEX));
const patched = await loadIndexChunk(path.join(tmp, 'b'), patchTranscriptIndexCheckpoint(read(INDEX)));
// original exports: g prepare, u size check; patched adds v plan, w apply
const prepare = original.g;

const SCHEMA = read('agent-transcript-schema.sql');
function freshDb() {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  db.exec(SCHEMA);
  return db;
}
function seed(db, sessionId, events, createdAtBase = 1791820900000) {
  db.prepare('INSERT INTO session_windows (session_id, session_key, created_at, updated_at, transcript_updated_at) VALUES (?, ?, 1, 1, 1791820900000)').run(sessionId, `agent:t:${sessionId}`);
  const ins = db.prepare('INSERT INTO transcript_events (session_id, seq, event_json, created_at) VALUES (?, ?, ?, ?)');
  events.forEach((event, seq) => ins.run(sessionId, seq, JSON.stringify(event), createdAtBase + seq));
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

const MUTATIONS = {
  // the two production rewrites: native prompt annotation, assistant display/media metadata
  annotation: (e) => e.message && typeof e.message === 'object' ? { ...e, message: { ...e.message, __openclaw: { mirrorIdentity: 'm', mirrorOrigin: 'codex', runId: 'r' } } } : undefined,
  displayMetadata: (e) => e.message && typeof e.message === 'object' ? { ...e, message: { ...e.message, idempotencyKey: 'idem', displayContent: [text('shown')] } } : undefined,
  excludeToggle: (e) => e.message && typeof e.message === 'object' ? { ...e, message: { ...e.message, excludeFromContext: e.message.excludeFromContext !== true } } : undefined,
  imageData: (e) => e.message && Array.isArray(e.message.content) ? { ...e, message: { ...e.message, content: e.message.content.map((b) => b.type === 'image' ? { ...b, data: 'WFla' } : b) } } : undefined,
  textChange: (e) => e.message && typeof e.message === 'object' ? { ...e, message: { ...e.message, content: 'rewritten text' } } : undefined,
  timestampChange: (e) => e && typeof e === 'object' ? { ...e, timestamp: '2026-10-17T01:00:00.000Z' } : undefined,
  parentChange: (e) => e && typeof e === 'object' && Object.hasOwn(e, 'parentId') ? { ...e, parentId: e.parentId === null ? 'e0' : null } : undefined,
  typeChange: (e) => e && typeof e === 'object' && e.type === 'message' ? { ...e, type: 'custom_message' } : undefined,
  dropMessage: (e) => e && typeof e === 'object' && e.message ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'message')) : undefined,
  sideMode: (e) => e && typeof e === 'object' && e.type === 'message' && e.appendMode !== 'side' ? { ...e, appendMode: 'side' } : undefined,
};

function checkSession(name, events) {
  const stats = { fast: 0, fallback: 0, fastByMutation: {}, fallbackByMutation: {} };
  for (let seq = 0; seq < events.length; seq++) {
    for (const [mutationName, mutate] of Object.entries(MUTATIONS)) {
      const after = mutate(events[seq]);
      if (after === undefined) continue;
      const db = freshDb();
      const sid = `${name}-${seq}-${mutationName}`;
      seed(db, sid, events);
      publishFullRebuild(db, sid);
      const before = JSON.parse(db.prepare('SELECT event_json FROM transcript_events WHERE session_id = ? AND seq = ?').get(sid, seq).event_json);
      const planned = patched.v(db, sid, [{ seq, before, after }]);
      db.prepare('UPDATE transcript_events SET event_json = ? WHERE session_id = ? AND seq = ?').run(JSON.stringify(after), sid, seq);
      if (planned === undefined) {
        stats.fallback += 1;
        stats.fallbackByMutation[mutationName] = (stats.fallbackByMutation[mutationName] ?? 0) + 1;
        continue;
      }
      patched.w(db, sid, planned);
      assert.deepEqual(storedProjection(db, sid), rebuiltProjection(db, sid), `${name} seq=${seq} ${mutationName}: in-place projection differs from a full rebuild`);
      stats.fast += 1;
      stats.fastByMutation[mutationName] = (stats.fastByMutation[mutationName] ?? 0) + 1;
    }
  }
  return stats;
}

test('an exact rewrite kept in place equals the full rebuild of the rewritten rows', () => {
  const all = {};
  for (const [name, events] of Object.entries(SCENARIOS)) all[name] = checkSession(name, events);
  all.mixed = checkSession('mixed', mixedSession(400));
  const sum = (key, m) => Object.values(all).reduce((total, s) => total + (s[key][m] ?? 0), 0);
  // the production shapes (metadata on a message) never need a rebuild
  assert.equal(sum('fallbackByMutation', 'annotation'), 0);
  assert.equal(sum('fallbackByMutation', 'displayMetadata'), 0);
  assert.equal(sum('fallbackByMutation', 'excludeToggle'), 0);
  assert.equal(sum('fallbackByMutation', 'imageData'), 0);
  // anything that can change the tree or an indexed fact of a projected row falls back
  assert.equal(sum('fastByMutation', 'parentChange'), 0);
  assert.equal(sum('fastByMutation', 'typeChange'), 0);
  assert.equal(sum('fastByMutation', 'sideMode'), 0);
  assert(sum('fallbackByMutation', 'textChange') > 0 && sum('fallbackByMutation', 'timestampChange') > 0);
  // ...while the same change off the active path stays in place (no FTS or active row exists for it)
  assert(sum('fastByMutation', 'textChange') > 0);
  const fast = Object.values(all).reduce((t, s) => t + s.fast, 0);
  const fallback = Object.values(all).reduce((t, s) => t + s.fallback, 0);
  console.log(`in-place ${fast}, rebuild ${fallback}`);
  assert(fast > 1000 && fallback > 100);
});

test('no plan unless the projection is current before the rewrite', () => {
  const events = SCENARIOS.linear;
  const rewrite = (db, sid) => patched.v(db, sid, [{ seq: 2, before: events[2], after: MUTATIONS.annotation(events[2]) }]);
  for (const [label, damage] of [
    ['needs rebuild', (db, sid) => db.prepare('UPDATE session_transcript_index_state SET needs_rebuild = 1 WHERE session_id = ?').run(sid)],
    ['watermark behind', (db, sid) => db.prepare('UPDATE session_transcript_index_state SET indexed_seq = indexed_seq - 1 WHERE session_id = ?').run(sid)],
    ['no state', (db, sid) => db.prepare('DELETE FROM session_transcript_index_state WHERE session_id = ?').run(sid)],
    ['unclassified rows', (db, sid) => db.prepare('UPDATE session_transcript_active_events SET context_eligible = NULL WHERE session_id = ? AND active_position = 0').run(sid)],
  ]) {
    const db = freshDb();
    seed(db, 'x', events);
    publishFullRebuild(db, 'x');
    assert.ok(rewrite(db, 'x'), `${label}: control`);
    damage(db, 'x');
    assert.equal(rewrite(db, 'x'), undefined, label);
  }
});

test('the bounded size check gives the original answer', () => {
  const big = 'x'.repeat(1024 * 1024);
  const cases = [
    { rows: 0, bytes: 10, incoming: 0 },
    { rows: 3999, bytes: 10, incoming: 0 },
    { rows: 4000, bytes: 10, incoming: 0 },
    { rows: 4001, bytes: 10, incoming: 0 },
    { rows: 3990, bytes: 10, incoming: 10 },
    { rows: 3990, bytes: 10, incoming: 11 },
    { rows: 3, bigRows: 4, incoming: 0 },
    { rows: 3, bigRows: 3, incoming: 0 },
    { rows: 3, bigRows: 3, incoming: 1, incomingBig: true },
    { rows: 10, bytes: 10, incoming: 4001 },
  ];
  for (const c of cases) {
    const db = freshDb();
    const events = Array.from({ length: c.rows }, (_, i) => ({ type: 'custom', id: `r${i}`, data: 'y'.repeat(c.bytes ?? 1) }));
    for (let i = 0; i < (c.bigRows ?? 0); i++) events.push({ type: 'custom', id: `b${i}`, data: big });
    seed(db, 's', events);
    const incoming = Array.from({ length: c.incoming }, (_, i) => ({ type: 'custom', id: `n${i}`, data: c.incomingBig ? big : 'z' }));
    assert.equal(patched.u(db, 's', incoming), original.u(db, 's', incoming), JSON.stringify(c));
  }
});
