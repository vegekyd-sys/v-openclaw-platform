import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FILES, HELPER, MARKER, RELEASE_DIR, patchFile, sha256, unpatchFile } from './patch-subagent-control-scoped-read.mjs';
import { loadControlledSubagentRuns } from './release-files/subagent-control-scoped-read/v-subagent-control-scoped-runs.mjs';

// subagent-control-scoped-read: see lab/subagent-control-scoped-read.md. The same comparison against the
// real chunks and V's registry shape is lab/candidate/subagent-control-scoped-read-ab.mjs.
const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
const plan = JSON.parse(read('lab/subagent-control-scoped-read.plan.json'));

for (const [name, spec] of Object.entries(FILES)) {
  test(`${name}: plan pins V bytes before and the release file after`, () => {
    const released = read(`${RELEASE_DIR}/${name}`);
    const original = unpatchFile(name, released);
    const entry = plan.files.find((file) => file.target === spec.target);
    assert.ok(entry);
    assert.equal(entry.source, `${RELEASE_DIR}/${name}`);
    assert.equal(entry.before, spec.before);
    assert.equal(sha256(original), spec.before, 'V bytes');
    assert.equal(sha256(released), entry.after, 'release bytes');
    assert.equal(patchFile(name, original), released);
    assert.throws(() => patchFile(name, released), /already patched/);
  });

  test(`${name}: the patch keeps the original path behind its switch`, () => {
    const released = read(`${RELEASE_DIR}/${name}`);
    assert.ok(released.includes(MARKER));
    assert.ok(released.includes(name.startsWith('plugin-sdk') ? 'OPENCLAW_V_HARNESS_TASKS_BY_OWNER === "0" ? listTaskRecords()' : 'snapshot ??= getSubagentRunsSnapshotForRead(subagentRuns)'));
  });
}

test('the helper is pinned and new', () => {
  const entry = plan.files.find((file) => file.target === `openclaw/dist/${HELPER}`);
  assert.equal(entry.before, null);
  assert.equal(sha256(read(`${RELEASE_DIR}/${HELPER}`)), entry.after);
});

// The registry's rules, written out from buildControlledSubagentRunsReadContext and getSubagentRunsSnapshot,
// so the helper's merge can be compared with the whole snapshot on small trees without the chunks.
const run = (runId, child, requester, extra = {}) => ({ runId, childSessionKey: child, requesterSessionKey: requester, createdAt: 1, ...extra });
const fullSnapshot = (rows, memory) => {
  const merged = new Map(rows.map((row) => [row.runId, row]));
  for (const [runId, entry] of memory) merged.set(runId, entry);
  return merged;
};
// loadSubagentRunTreeFromSqlite's closure over plain rows
const loadTreeOver = (rows) => ({ controllerKey, rootKeys, inMemoryRuns }) => {
  const memory = [...inMemoryRuns];
  const childKeys = new Set(rootKeys);
  const requesterKeys = new Set(rootKeys);
  const owner = (entry) => entry.controllerSessionKey || entry.requesterSessionKey;
  for (;;) {
    const before = childKeys.size + requesterKeys.size;
    for (const entry of [...rows, ...memory]) {
      if (owner(entry) === controllerKey || requesterKeys.has(entry.requesterSessionKey)) {
        childKeys.add(entry.childSessionKey);
        requesterKeys.add(entry.childSessionKey);
      }
    }
    if (childKeys.size + requesterKeys.size === before) break;
  }
  const inTree = (entry) => owner(entry) === controllerKey || requesterKeys.has(entry.requesterSessionKey) || childKeys.has(entry.childSessionKey);
  return { runs: rows.filter(inTree), childKeys, requesterKeys };
};
const scoped = (rows, memory, key) => loadControlledSubagentRuns({ key, inMemoryRuns: memory, loadTree: loadTreeOver(rows), maxRuns: 256 });
// Every run outside the result must have no bearing on the key: not visible, not a generation of a visible
// child, not below one.
const assertCovers = (rows, memory, key) => {
  const full = fullSnapshot(rows, memory);
  const got = scoped(rows, memory, key);
  const below = new Set([key]);
  for (;;) {
    const size = below.size;
    for (const entry of full.values()) if (below.has(entry.requesterSessionKey) || (entry.controllerSessionKey || entry.requesterSessionKey) === key) below.add(entry.childSessionKey);
    if (below.size === size) break;
  }
  for (const [runId, entry] of full) {
    const relevant = below.has(entry.requesterSessionKey) || below.has(entry.childSessionKey) || (entry.controllerSessionKey || entry.requesterSessionKey) === key;
    if (relevant) assert.equal(got.get(runId), entry, `${runId} must be there and be the winning copy`);
  }
  // the kept runs keep the whole snapshot's relative order
  const order = [...full.keys()];
  const kept = [...got.keys()].map((runId) => order.indexOf(runId));
  assert.deepEqual(kept, [...kept].sort((a, b) => a - b));
  return got;
};

test('the tree: requester, controller, descendants, other generations', () => {
  const rows = [
    run('a', 'c1', 'k'),
    run('b', 'c2', 'x', { controllerSessionKey: 'k' }),
    run('c', 'c3', 'k', { controllerSessionKey: 'x' }),
    run('d', 'g1', 'c1'),
    run('e', 'c1', 'other'),
    run('f', 'unrelated', 'other'),
  ];
  const got = assertCovers(rows, new Map(), 'k');
  assert.deepEqual([...got.keys()], ['a', 'b', 'c', 'd', 'e']);
});

test('a persisted row is replaced by its in-memory copy, without moving', () => {
  const rows = [run('a', 'c1', 'k'), run('b', 'c2', 'k')];
  const live = run('a', 'c1', 'k', { execution: { status: 'running' } });
  const got = assertCovers(rows, new Map([['a', live]]), 'k');
  assert.equal(got.get('a'), live);
  assert.deepEqual([...got.keys()], ['a', 'b']);
});

test('in-memory only: a run, its descendant, another generation; unrelated ones stay out', () => {
  const rows = [run('a', 'c1', 'k')];
  const memory = new Map([
    ['m1', run('m1', 'c9', 'k')],
    ['m2', run('m2', 'g9', 'c9')],
    ['m3', run('m3', 'c1', 'someone-else')],
    ['m4', run('m4', 'elsewhere', 'someone-else')],
  ]);
  const got = assertCovers(rows, memory, 'k');
  assert.deepEqual([...got.keys()], ['a', 'm1', 'm2', 'm3']);
});

test('an in-memory run moved to the key by a later write is found though the row says otherwise', () => {
  const rows = [run('a', 'c1', 'elsewhere')];
  const live = run('a', 'c1', 'k');
  assert.equal(assertCovers(rows, new Map([['a', live]]), 'k').get('a'), live);
});

test('above the budget the caller reads the whole registry', () => {
  assert.equal(loadControlledSubagentRuns({ key: 'k', inMemoryRuns: new Map(), loadTree: () => null, maxRuns: 256 }), null);
});

test('the budget and the key reach the tree loader', () => {
  let params;
  loadControlledSubagentRuns({ key: 'k', inMemoryRuns: new Map(), maxRuns: 7, loadTree: (p) => { params = p; return { runs: [], childKeys: new Set(), requesterKeys: new Set() }; } });
  assert.equal(params.maxRuns, 7);
  assert.equal(params.controllerKey, 'k');
  assert.deepEqual(params.rootKeys, ['k']);
});
