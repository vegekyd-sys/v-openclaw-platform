import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');

test('native switch, verification, and offline recovery share an isolated evidence id', () => {
  for (const name of [
    './native-execution-rollout.mjs',
    './native-execution-verify.mjs',
    './native-execution-recover-offline.mjs',
  ]) {
    const source = read(name);
    assert(source.includes('process.env.VLAB_NATIVE_ROLLOUT_ID'));
    assert(source.includes("^[a-z0-9][a-z0-9-]{0,80}$"));
    assert(source.includes("'native-execution-rollout-20260911'"));
  }
});

test('combined candidate is pinned to the live release and only three reviewed files', () => {
  const plan = JSON.parse(read('./native-final-vlab-candidate-plan.json'));
  assert.equal(plan.baseRelease, 'dm-delivery-notice-race-20260911-v1');
  assert.deepEqual(plan.files.map(file => file.target), [
    'openclaw/dist/lifecycle-YRwzpo9_.js',
    'openclaw/dist/tools-Byg09TOP.js',
    'openclaw/dist/extensions/memory-core/manager-runtime.js',
  ]);
  assert(plan.files.every(file => /^[a-f0-9]{64}$/.test(file.before)));
});
