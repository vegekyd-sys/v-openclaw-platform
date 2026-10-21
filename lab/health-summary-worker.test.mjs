import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FILES, MARKER, RELEASE_DIR, WORKER_FILE, WORKER_SOURCE, patchFile, sha256, unpatchFile } from './patch-health-summary-worker.mjs';

// health-summary-worker: the health collector's session summary runs in a worker thread.
// See lab/health-summary-worker.md.
const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
const plan = JSON.parse(read('lab/health-summary-worker.plan.json'));

test('plan pins V bytes before and the release files after', () => {
  assert.deepEqual(plan.files.map((f) => f.target.replace('openclaw/dist/', '')), [...Object.keys(FILES), WORKER_FILE]);
  for (const file of plan.files) {
    const name = file.target.replace('openclaw/dist/', '');
    const release = read(file.source);
    assert.equal(sha256(release), file.after, `${name}: release bytes`);
    if (name === WORKER_FILE) {
      assert.equal(file.before, null, 'the worker module is new');
      assert.equal(release, WORKER_SOURCE);
      continue;
    }
    const base = unpatchFile(name, release);
    assert.equal(sha256(base), file.before, `${name}: V bytes`);
    assert.equal(patchFile(name, base), release);
    assert.throws(() => patchFile(name, release), /already patched/u);
    assert(release.includes(MARKER));
  }
});

test('only the reader construction changes; the main-thread read stays as the fallback', () => {
  const name = 'collector-DyqVHdcZ.js';
  const release = read(`${RELEASE_DIR}/${name}`);
  const lines = new Set(release.split('\n'));
  const removed = unpatchFile(name, release).split('\n').filter((line) => !lines.has(line)).map((line) => line.trim().slice(0, 70));
  assert.deepEqual(removed, [
    'async function createHealthSessionStoreReader(agentIds) {',
    'const store = (await createHealthSessionStoreReader(agentId ? [agentId',
    'const reader = await createHealthSessionStoreReader(ordered.map((entry',
  ]);
  assert.match(release, /process\.env\.OPENCLAW_V_HEALTH_SUMMARY_WORKER === "0"/u);
  assert.match(release, /\t\ttry \{\n\t\t\treturn readSessionStoreSummaryReadOnly\(scope, options\);/u);
  assert.match(WORKER_SOURCE, /readSessionStoreSummaryReadOnly\(scope, options\)/u);
});
