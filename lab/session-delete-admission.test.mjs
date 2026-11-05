import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER } from './patch-session-delete-admission.mjs';
import { OUTPUT_DIR, PLAN } from './build-session-delete-admission.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const RELEASE = 'session-history-eviction-d5aiCsHS.js';
const patched = fs.readFileSync(path.join(repo, OUTPUT_DIR, RELEASE), 'utf8');

test('plan lists the patched files with V before-bytes', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map((f) => `${f.target}/${f.name}`));
  assert.deepEqual(plan.files.map((f) => f.before), FILES.map((f) => f.before));
});

for (const file of FILES) {
  test(`${file.name} carries the marker, parses, and refuses a second patch`, () => {
    const out = fs.readFileSync(path.join(repo, OUTPUT_DIR, file.name), 'utf8');
    assert(out.includes(MARKER));
    assert.throws(() => file.patch(out), /already patched/u);
    const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, file.name)], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  });
}

test('the deletion prepare phase reads the reference set and the fence only when it removes transcript state', () => {
  const out = fs.readFileSync(path.join(repo, OUTPUT_DIR, 'session-accessor.sqlite-lifecycle-dtL0ZEAl.js'), 'utf8');
  assert.equal(out.split('const referencedAfterDelete = deleteTranscriptState ? readReferencedSessionIdsAfterTargetMutation(database, params.target) : /* @__PURE__ */ new Set();').length, 2);
  assert.equal(out.split('const preflightFence = historicalGenerationIds.length > 0 ? collectAdmissionProtectedSessionIds({').length, 2);
  // Only the prepare phase changes: the per-generation and in-transaction fences stay unconditional.
  assert.equal(out.split('collectAdmissionProtectedSessionIds({').length, 4);
  assert.equal(out.split('readReferencedSessionIdsAfterTargetMutation(').length, 3);
  // deleteTranscriptState is declared before its first use.
  assert(out.indexOf('const deleteTranscriptState =') < out.indexOf('deleteTranscriptState ? readReferencedSessionIdsAfterTargetMutation'));
});

// V's bytes as captured by the last release (sha256 = plan before).
const CAPTURED = 'release/captured/v2026.9.1-db91.6-luna-fallback-takeover-20261104/dist/session-history-eviction-d5aiCsHS.js';
const captured = fs.readFileSync(path.join(repo, CAPTURED), 'utf8');

function extract(source) {
  const start = source.indexOf('function collectAdmissionProtectedSessionIds(params) {');
  const end = source.indexOf('\n}\n', start) + 2;
  assert(start > 0 && end > start);
  return source.slice(start, end);
}
const ORIGINAL = extract(captured);

test('the release file is the patch applied to the bytes V runs', () => {
  assert.equal(createHash('sha256').update(captured).digest('hex'), FILES[0].before);
  assert.equal(FILES[0].patch(captured), patched);
});

// Minimal Kysely-shaped builder over in-memory tables; records every query.
function harness({ nodes, windows, admissions }) {
  const queries = [];
  const tables = { session_nodes: nodes, session_windows: windows };
  const db = {
    selectFrom(table) {
      const q = { table, columns: [], where: null };
      const builder = {
        select(columns) { q.columns = Array.isArray(columns) ? columns : [columns]; return builder; },
        where(column, op, values) { assert.equal(op, 'in'); q.where = { column, values: new Set(values) }; return builder; },
        q,
      };
      return builder;
    },
  };
  const executeSqliteQuerySync = (_handle, builder) => {
    const { q } = builder;
    queries.push(q);
    const rows = tables[q.table]
      .filter((row) => !q.where || q.where.values.has(row[q.where.column]))
      .map((row) => Object.fromEntries(q.columns.map((c) => [c, row[c]])));
    return { rows };
  };
  // Lowercases except a "!opaque" peer id, like the real normalizer preserves opaque peer ids.
  const normalizeStoreSessionKey = (key) => key.replace(/^(.*?)(![^:]*)?(:.*)?$/u, (_m, a, b = '', c = '') => `${a.toLowerCase()}${b}${c.toLowerCase()}`);
  const deps = {
    collectActiveSessionWorkAdmissions: () => new Map([['store', new Set(admissions)]]),
    normalizeStoreSessionKey,
    getSessionKysely: () => db,
    executeSqliteQuerySync,
    parseSessionEntryJson: (row) => { try { return JSON.parse(row.entry_json); } catch { return null; } },
    collectSessionStateIdsForEntry: (entry) => [
      entry.sessionId, entry.previousSessionId, ...(entry.usageFamilySessionIds ?? []),
      ...(entry.compactionCheckpoints ?? []).flatMap((c) => [c.sessionId, c.preCompaction?.sessionId, c.postCompaction?.sessionId]),
    ].filter(Boolean),
    ADMITTED_KEY_QUERY_CHUNK: 2,
  };
  const load = (fn) => new Function(...Object.keys(deps), `${fn}\nreturn collectAdmissionProtectedSessionIds;`)(...Object.values(deps));
  return { queries, load };
}

const big = 'x'.repeat(1000);
const nodes = [
  { session_key: 'agent:main:cron:job-a:run:1', current_session_id: 'a-live', entry_json: JSON.stringify({ sessionId: 'a-live', previousSessionId: 'a-prev', usageFamilySessionIds: ['a-fam'], compactionCheckpoints: [{ sessionId: 'a-cp', preCompaction: { sessionId: 'a-pre' }, postCompaction: { sessionId: 'a-post' } }], skillsSnapshot: big }) },
  { session_key: 'agent:main:cron:job-b:run:1', current_session_id: 'b-live', entry_json: JSON.stringify({ sessionId: 'b-live', skillsSnapshot: big }) },
  { session_key: 'agent:main:matrix:channel:!RoomAbC:example.org', current_session_id: 'mixed', entry_json: JSON.stringify({ sessionId: 'mixed' }) },
  { session_key: 'agent:main:matrix:channel:!roomabc:example.org', current_session_id: 'lower', entry_json: JSON.stringify({ sessionId: 'lower', previousSessionId: 'lower-prev' }) },
  { session_key: 'agent:main:broken', current_session_id: 'broken-live', entry_json: '{not json' },
  ...Array.from({ length: 7 }, (_, i) => ({ session_key: `agent:main:filler:${i}`, current_session_id: `f${i}`, entry_json: JSON.stringify({ sessionId: `f${i}`, skillsSnapshot: big }) })),
];
const windows = [
  { session_key: 'agent:main:cron:job-a:run:1', session_id: 'a-old' },
  { session_key: 'agent:main:cron:job-a:run:1', session_id: 'a-live' },
  { session_key: 'agent:main:matrix:channel:!roomabc:example.org', session_id: 'lower-old' },
  { session_key: 'agent:main:filler:0', session_id: 'f0-old' },
];

for (const [name, admissions] of [
  ['key + id + case-distinct key', ['agent:main:cron:job-a:run:1', 'b-live', 'agent:main:matrix:channel:!roomabc:example.org']],
  ['non-normalized key', ['Agent:Main:Cron:Job-A:Run:1']],
  ['unparseable entry', ['agent:main:broken']],
  ['every filler key (several chunks)', nodes.slice(5).map((n) => n.session_key)],
  ['id only', ['f3']],
  ['unknown', ['agent:main:missing']],
  ['none', []],
]) {
  test(`protected set equals the full-read version: ${name}`, () => {
    const before = harness({ nodes, windows, admissions });
    const after = harness({ nodes, windows, admissions });
    const expected = before.load(ORIGINAL)({ database: { db: {} }, storePath: 'store' });
    const actual = after.load(extract(patched))({ database: { db: {} }, storePath: 'store' });
    assert.deepEqual([...actual].sort(), [...expected].sort());
    // The fixed version never reads entry_json without naming the rows.
    for (const q of after.queries) {
      if (q.table === 'session_nodes' && q.columns.includes('entry_json')) assert(q.where, 'entry_json read without a key filter');
    }
    if (admissions.length > 0) assert(before.queries.some((q) => q.columns.includes('entry_json') && !q.where), 'fixture must exercise the old full read');
  });
}

test('the admitted key protects every id it owns and nothing else', () => {
  const { load } = harness({ nodes, windows, admissions: ['agent:main:cron:job-a:run:1'] });
  const actual = load(extract(patched))({ database: { db: {} }, storePath: 'store' });
  assert.deepEqual([...actual].sort(), ['a-cp', 'a-fam', 'a-live', 'a-old', 'a-post', 'a-pre', 'a-prev', 'agent:main:cron:job-a:run:1'].sort());
});
