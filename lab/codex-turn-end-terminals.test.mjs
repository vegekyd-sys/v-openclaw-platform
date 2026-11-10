import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER } from './patch-codex-turn-end-terminals.mjs';
import { OUTPUT_DIR, PLAN } from './build-codex-turn-end-terminals.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const read = (name) => fs.readFileSync(path.join(repo, OUTPUT_DIR, name), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const RUN_ATTEMPT = 'run-attempt-D1hJO4fX.js';

test('plan lists the patched Codex file with V before-bytes', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map((f) => `${f.target}/${f.name}`));
  assert.deepEqual(plan.files.map((f) => f.before), FILES.map((f) => f.before));
});

test('release file carries the marker, parses, and refuses a second patch', () => {
  const out = read(RUN_ATTEMPT);
  assert(out.includes(MARKER));
  assert.throws(() => FILES[0].patch(out), /already patched/u);
  const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, RUN_ATTEMPT)], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(sha(out), FILES[0].before);
});

test('normal endings of a turn that ran a command stop the terminals; others do not', async () => {
  const src = read(RUN_ATTEMPT);
  const line = src.split('\n').find((l) => l.includes('codex-turn-end-background-terminals'));
  assert(line.trimStart().startsWith('if (state.ranNativeCommand && !runAbortController.signal.aborted && state.timeout === void 0'));
  assert(src.includes('if (nativeItem?.type === "commandExecution") state.ranNativeCommand = true;'));
  assert(src.includes('ranNativeCommand: false'));
  // The statement runs inside cleanupCodexAttempt after the trajectory flush and before the thread
  // is unsubscribed, so the client can still reach the thread.
  const fn = src.slice(src.indexOf('async function cleanupCodexAttempt('));
  assert(fn.indexOf('codex-trajectory-flush') < fn.indexOf('codex-turn-end-background-terminals'));
  assert(fn.indexOf('codex-turn-end-background-terminals') < fn.indexOf('unsubscribeCodexThreadBestEffort(resourceState.client'));
  const run = async ({ aborted = false, timeout, env = {}, ranNativeCommand = true }) => {
    const calls = [];
    await new Function('runAbortController', 'state', 'process', 'runCleanupStep', 'terminateCodexBackgroundTerminals', 'resourceState',
      `return (async () => { ${line.trim()} })();`)(
      { signal: { aborted } }, { timeout, ranNativeCommand }, { env },
      async (step, op) => { calls.push(step); await op(); },
      async (client, threadId) => { calls.push(`terminate:${threadId}`); },
      { client: {}, thread: { threadId: 't1' } });
    return calls;
  };
  assert.deepEqual(await run({}), ['codex-turn-end-background-terminals', 'terminate:t1']);
  assert.deepEqual(await run({ aborted: true }), []);
  assert.deepEqual(await run({ timeout: 'turn' }), []);
  assert.deepEqual(await run({ env: { OPENCLAW_CODEX_TURN_END_TERMINALS: 'keep' } }), []);
  assert.deepEqual(await run({ ranNativeCommand: false }), []);
});
