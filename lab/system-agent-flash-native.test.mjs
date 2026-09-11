import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { BEFORE, AFTER, patchSystemAgentFlashNative } from './system-agent-flash-native.mjs';

const route = new Function('modelOwnerAgentId', 'runConfig', 'selection', 'policy', 'resolveAmbientOwnerAgentId', `return { runner: 'embedded',\n${AFTER}\n};`);
function resolve(overrides = {}) {
  return route(overrides.owner ?? 'makaron', {}, {
    provider: overrides.provider ?? 'deepseek', modelId: overrides.model ?? 'deepseek-flash',
  }, { runtime: overrides.runtime ?? 'vlab-worker', runtimeSource: overrides.source ?? 'model' }, () => overrides.ambientOwner ?? 'makaron');
}
test('System Agent Flash uses native control-plane runtime', () => {
  assert.equal(resolve().agentHarnessRuntimeOverride, 'openclaw');
});
for (const [name, overrides, expected] of [
  ['other owner', { owner: 'v-codex' }, 'vlab-worker'],
  ['other ambient owner', { ambientOwner: 'v-codex' }, 'vlab-worker'],
  ['other model', { model: 'deepseek-v4-pro' }, 'vlab-worker'],
  ['other provider', { provider: 'openai' }, 'vlab-worker'],
  ['other explicit runtime', { runtime: 'codex' }, 'codex'],
  ['native runtime', { runtime: 'openclaw' }, 'openclaw'],
  ['implicit native runtime', { runtime: 'openclaw', source: 'implicit' }, undefined],
]) test(`preserves ${name}`, () => assert.equal(resolve(overrides).agentHarnessRuntimeOverride, expected));
test('patch is exact, idempotent and refuses drift', () => {
  const source = `before\n${BEFORE}\nafter`;
  const patched = patchSystemAgentFlashNative(source);
  assert.equal(patched, `before\n${AFTER}\nafter`);
  assert.equal(patchSystemAgentFlashNative(patched), patched);
  assert.throws(() => patchSystemAgentFlashNative('unrelated'), /refuse/);
  assert.throws(() => patchSystemAgentFlashNative(source + source), /refuse/);
});
test('release artifact changes only the scoped runtime selection in verified production source', () => {
  const before = readFileSync(new URL('./fixtures/system-agent-flash/inference-route-Bv_D48Z8.js', import.meta.url), 'utf8');
  const after = readFileSync(new URL('./release-files/system-agent-flash/inference-route-Bv_D48Z8.js', import.meta.url), 'utf8');
  assert.equal(createHash('sha256').update(before).digest('hex'), '9d64dbf86259ecc8af74a7d55d34281b2c9253c7e91cd45fee9de1372f6b70f1');
  assert.equal(after, patchSystemAgentFlashNative(before));
  assert.equal(before.split('\n').filter((line, i) => line !== after.split('\n')[i]).length, 1);
  assert.equal(after.split(AFTER).length, 2);
  assert.equal(after.includes(BEFORE), false);
  assert.equal(createHash('sha256').update(after).digest('hex'), '11a127d159f836d09941eaf0abd760535d336d91c7a51ebee7a53fd8da5443d0');
});
