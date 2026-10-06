import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { patchAgentCommandChunk } from './patch-worker-prewarm-secrets.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
const chunk = read('./release-files/worker-prewarm2-v/agent-command-DPfawBbr.js');
const released = read('./release-files/worker-prewarm-secrets/agent-command-DPfawBbr.js');

test('release file is the worker-prewarm2-v chunk with only the secrets prewarm change', () => {
  assert.equal(patchAgentCommandChunk(chunk), released);
  assert.throws(() => patchAgentCommandChunk(released), /prewarm skills step/);
});

test('the prewarm calls the function a turn calls, through names the chunk already has', () => {
  assert.match(chunk, /^async function resolveAgentRuntimeConfig\(runtime, params\) \{$/m);
  assert.match(chunk, /^import \{ a as getActiveSecretsRuntimeConfigSnapshot \} from "\.\/runtime-state-BoJn6Ddu\.js";$/m);
  assert.match(chunk, /^import \{ r as defaultRuntime \} from "\.\/runtime-V1VdbWVS\.js";$/m);
  assert.match(chunk, /const cfg = await resolveAgentRuntimeConfig\(runtime, \{/);
  const body = released.slice(released.indexOf('async function prewarmSecretsRuntimeSnapshot('), released.indexOf('function prewarmWorkspaceSkillSnapshot('));
  assert.match(body, /await resolveAgentRuntimeConfig\(defaultRuntime\);/);
  const code = body.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*\*)/.test(line)).join('\n');
  assert.doesNotMatch(code, /persist|write|append|insert|delete|sessionStore/i);
});

test('the step runs after the session store step, before the skill step, and turns off on its own', () => {
  const fn = released.slice(released.indexOf('async function prewarmAgentCommandRuntimes(params)'), released.indexOf('async function prewarmSecretsRuntimeSnapshot('));
  assert.ok(fn.indexOf('resolveSession({') < fn.indexOf('prewarmSecretsRuntimeSnapshot()'));
  assert.ok(fn.indexOf('prewarmSecretsRuntimeSnapshot()') < fn.indexOf('OPENCLAW_WORKER_EAGER_PREPARE_SKILLS'));
  assert.match(fn, /process\.env\.OPENCLAW_WORKER_EAGER_PREPARE_SECRETS === "0" \? \{\} : await prewarmSecretsRuntimeSnapshot\(\)/);
  assert.match(fn, /return \{ sessionStorePrepared: true, \.\.\.secrets \};/);
});

function secretsPrewarm({ active = null, resolve }) {
  const body = released.slice(released.indexOf('async function prewarmSecretsRuntimeSnapshot('), released.indexOf('/** Build the workspace skill snapshot'));
  const state = { active, calls: [] };
  const fn = new Function('getActiveSecretsRuntimeConfigSnapshot', 'resolveAgentRuntimeConfig', 'defaultRuntime', `${body}\nreturn prewarmSecretsRuntimeSnapshot;`)(
    () => state.active,
    async (runtime, params) => { state.calls.push({ runtime, params }); await resolve(state); },
    'default-runtime',
  );
  return { run: fn, state };
}

test('the prewarm activates the snapshot once, leaves an active one alone and fails open', async () => {
  const fresh = secretsPrewarm({ resolve: async (s) => { s.active = { config: {} }; } });
  assert.deepEqual(await fresh.run(), { secretsPrepared: true });
  assert.deepEqual(fresh.state.calls, [{ runtime: 'default-runtime', params: undefined }]);

  const already = secretsPrewarm({ active: { config: {} }, resolve: async () => assert.fail('resolved again') });
  assert.deepEqual(await already.run(), { secretsPrepared: true });

  const failing = secretsPrewarm({ resolve: async () => { throw new Error('x'.repeat(300)); } });
  const result = await failing.run();
  assert.equal(result.secretsPrepared, false);
  assert.equal(result.secretsError.length, 200);
});
