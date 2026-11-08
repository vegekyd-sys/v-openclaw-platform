import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FILES, MARKER, RELEASE_DIR, patchFile, sha256, unpatchFile } from './patch-subagent-row-index.mjs';

// subagent-row-index: see lab/subagent-row-index.md. The source change and its equivalence test against
// buildSingleRowSubagentRunIndex are in openclaw-versa (session-utils.subagent-row-index.test.ts).
const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
const plan = JSON.parse(read('lab/subagent-row-index.plan.json'));
const STORE = 'subagent-registry.store.sqlite-hzGu4QSk.js';
const LIST = 'session-utils-list-BUP03AzS.js';

for (const [name, spec] of Object.entries(FILES)) {
  test(`${name}: plan pins V bytes before and the release file after`, () => {
    const released = read(`${RELEASE_DIR}/${name}`);
    const original = unpatchFile(name, released);
    const entry = plan.files.find((file) => file.target === spec.target);
    assert.equal(entry.source, `${RELEASE_DIR}/${name}`);
    assert.equal(sha256(original), spec.before, 'V bytes');
    assert.equal(sha256(released), entry.after, 'release bytes');
    assert.equal(patchFile(name, original), released);
    assert.throws(() => patchFile(name, released), /already patched/);
  });
}

test('the list chunk imports exactly what the store chunk now exports', () => {
  const store = read(`${RELEASE_DIR}/${STORE}`);
  const list = read(`${RELEASE_DIR}/${LIST}`);
  for (const name of ['getSubagentRunsForOwnerSession', 'getSubagentRunsForRequesterSession', 'selectSubagentRunsForRowLookup']) {
    assert.ok(store.includes(`function ${name}(`), name);
    assert.ok(list.includes(name), name);
  }
  assert.ok(list.includes('process.env.OPENCLAW_V_SUBAGENT_ROW_INDEX !== "0"'));
});

// The shipped registry Map and lookup functions, run on their own.
function loadRegistry() {
  const store = read(`${RELEASE_DIR}/${STORE}`);
  const start = store.indexOf('const collectorRunIdByChildSessionKey');
  const end = store.indexOf('\n}\n', store.indexOf('function selectSubagentRunsForRowLookup(')) + 3;
  assert.ok(start > 0 && end > start);
  return new Function(`${store.slice(start, end)}\nreturn { subagentRuns, getSubagentRunsForRequesterSession, getSubagentRunsForOwnerSession, selectSubagentRunsForRowLookup };`)();
}

// The predicate buildSingleRowSubagentRunIndex applies when it scans the registry.
function scan(registry, { runIds, childKeys, requesterKeys, ownerKey }) {
  const ids = new Set(runIds);
  const out = [];
  for (const [runId, entry] of registry) {
    if (ids.has(runId) || childKeys.has(entry.childSessionKey.trim()) || requesterKeys.has(entry.requesterSessionKey) || (entry.controllerSessionKey?.trim() || entry.requesterSessionKey) === ownerKey) out.push(runId);
  }
  return out;
}

test('lookups select the same runs, in the same order, as the scan through set, replace, delete and re-add', () => {
  const { subagentRuns, selectSubagentRunsForRowLookup } = loadRegistry();
  let seed = 7;
  const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) % n);
  const keys = Array.from({ length: 12 }, (_, i) => `agent:main:k${i}`);
  const make = (i) => ({
    runId: `r${i}`,
    childSessionKey: rand(9) === 0 ? ` ${keys[rand(12)]} ` : keys[rand(12)],
    requesterSessionKey: keys[rand(12)],
    ...(rand(3) === 0 ? { controllerSessionKey: rand(4) === 0 ? '' : keys[rand(12)] } : {}),
  });
  for (let step = 0; step < 4000; step += 1) {
    const i = rand(300);
    const op = rand(10);
    if (op < 6) subagentRuns.set(`r${i}`, make(i));
    else if (op < 9) subagentRuns.delete(`r${i}`);
    else if (subagentRuns.has(`r${i}`)) subagentRuns.set(`r${i}`, subagentRuns.get(`r${i}`)); // same object again
    if (step % 50 === 0) {
      const query = {
        runIds: Array.from({ length: rand(4) }, () => `r${rand(300)}`),
        childKeys: new Set(Array.from({ length: rand(4) }, () => keys[rand(12)])),
        requesterKeys: new Set(Array.from({ length: rand(4) }, () => keys[rand(12)])),
        ownerKey: keys[rand(12)],
      };
      const looked = selectSubagentRunsForRowLookup({ ...query, runIds: [...query.runIds] }).map(([runId]) => runId);
      assert.deepEqual(looked, scan(subagentRuns, query), `step ${step}`);
    }
  }
  subagentRuns.clear();
  assert.deepEqual(selectSubagentRunsForRowLookup({ runIds: [], childKeys: new Set(keys), requesterKeys: new Set(keys), ownerKey: keys[0] }), []);
});

test('release names its marker in both files', () => {
  for (const name of Object.keys(FILES)) assert.ok(read(`${RELEASE_DIR}/${name}`).includes(MARKER), name);
});
