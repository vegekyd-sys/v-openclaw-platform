import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { patchWorker } from './patch-worker-prewarm-contention-retry.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const base = read('./release-files/voice-reliability-20261007/production-worker/worker.mjs');
const release = read('./release-files/worker-prewarm-contention-retry/worker.mjs');

test('release is V worker.mjs plus only the retry', () => {
  assert.equal(createHash('sha256').update(base).digest('hex'), '024306ae44dc6aa1c925af226d43738450fba534e54fcc1022bae15d4d970e38');
  assert.equal(patchWorker(base), release);
  assert.throws(() => patchWorker(release), /already patched/);
});

// Run the patched prewarm block against stub runtimes.
async function runPrewarm({ failures, env = {} }) {
  const from = release.indexOf('let runtimePrewarm = { status: "disabled" };');
  const to = release.indexOf('  process.stderr.write(`[worker-runtime-prewarm.3]');
  assert(from > 0 && to > from);
  const block = `${release.slice(from, to)}}\nreturn runtimePrewarm;`;
  const calls = { prepared: 0, released: 0 };
  const queue = [...failures];
  const loadAgentRuntime = async () => ({ resolveAgentWorkspaceDir: () => '/w', resolveAgentDir: () => '/a' });
  const loadCompactionRuntime = async () => ({
    configRuntime: { loadConfig: () => ({}) },
    preparedRuntime: {
      acquireAgentRunPreparedModelRuntime: async () => {
        calls.prepared += 1;
        const failure = queue.shift();
        if (failure) throw failure;
        return { release: () => { calls.released += 1; } };
      },
    },
    commandRuntime: { prewarmAgentCommandRuntimes: async () => ({ sessionStorePrepared: true, sessionKeysPrepared: true, sessionKeysMs: 7 }) },
  });
  const proc = { env: { ...env }, pid: 1, stderr: { write() {} } };
  const fn = new Function('process', 'loadAgentRuntime', 'loadCompactionRuntime', 'performance', `return (async () => { ${block} })();`);
  return { result: await fn(proc, loadAgentRuntime, loadCompactionRuntime, performance), calls };
}
const contention = () => Object.assign(new Error('another OpenClaw process owns state-lifecycle'), { name: 'StateDatabaseCoordinatorContentionError' });

test('a contention failure is retried and prewarm becomes ready', async () => {
  const { result, calls } = await runPrewarm({ failures: [contention()] });
  assert.equal(result.status, 'ready');
  assert.equal(result.attempts, 2);
  assert.equal(result.sessionKeysPrepared, true);
  assert.equal(result.sessionKeysMs, 7);
  assert.equal(calls.prepared, 2);
});

test('retries stop after three attempts, other errors are not retried, and the switch turns it off', async () => {
  const exhausted = await runPrewarm({ failures: [contention(), contention(), contention()] });
  assert.equal(exhausted.result.status, 'deferred-to-normal-turn');
  assert.equal(exhausted.result.errorCategory, 'contention');
  assert.equal(exhausted.result.attempts, 3);
  assert.equal(exhausted.calls.prepared, 3);

  const other = await runPrewarm({ failures: [new Error('boom')] });
  assert.equal(other.result.status, 'deferred-to-normal-turn');
  assert.equal(other.result.errorCategory, 'other');
  assert.equal(other.calls.prepared, 1);

  const off = await runPrewarm({ failures: [contention()], env: { OPENCLAW_WORKER_EAGER_PREPARE_RETRIES: '0' } });
  assert.equal(off.result.status, 'deferred-to-normal-turn');
  assert.equal(off.calls.prepared, 1);

  const clean = await runPrewarm({ failures: [] });
  assert.equal(clean.result.status, 'ready');
  assert.equal('attempts' in clean.result, false);
});
