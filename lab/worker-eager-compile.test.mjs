import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MARKER, patchWorkerPool } from './patch-worker-eager-compile.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const base = fs.readFileSync(path.join(dir, 'release-files/voice-reliability-20261007/production-worker/worker-pool.mjs'), 'utf8');
const built = fs.readFileSync(path.join(dir, 'release-files/worker-eager-compile/worker-pool.mjs'), 'utf8');
const experiments = path.join(repo, 'experiments/agent-worker-isolation-v1');
const workerPath = path.join(experiments, 'fake-delayed-ready-worker.mjs');

test('release file is the patch applied to the V pool, once', () => {
  assert.equal(patchWorkerPool(base), built);
  assert.equal(built.split(MARKER).length, 2);
  assert.throws(() => patchWorkerPool(built), /already patched/);
});

// The release file imports its production siblings; link the repository copies next to it.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-eager-compile-'));
fs.writeFileSync(path.join(tmp, 'worker-pool.mjs'), built);
for (const name of ['late-worker-reply.mjs', 'native-harness-data.mjs'])
  fs.symlinkSync(path.join(experiments, name), path.join(tmp, name));
const { WorkerPool, withWorkerEagerCompile } = await import(pathToFileURL(path.join(tmp, 'worker-pool.mjs')).href);
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('eager compile adds --no-lazy once and leaves the arguments alone when off', () => {
  assert.deepEqual(withWorkerEagerCompile(['--max-old-space-size=4096'], true), ['--max-old-space-size=4096', '--no-lazy']);
  assert.deepEqual(withWorkerEagerCompile(['--lazy', '--no-lazy', '--x'], true), ['--x', '--no-lazy']);
  assert.deepEqual(withWorkerEagerCompile(['--x'], false), ['--x']);
});

test('environment switches eager compile off; anything else keeps it on', () => {
  const eager = (value) => new WorkerPool({ minWorkers: 1, maxWorkers: 1, workerPath,
    configEnv: value === undefined ? {} : { OPENCLAW_WORKER_EAGER_COMPILE: value } }).workerEagerCompile;
  assert.equal(eager(undefined), true);
  assert.equal(eager('1'), true);
  assert.equal(eager('0'), false);
  assert.equal(eager('off'), false);
  assert.equal(eager(' FALSE '), false);
});

const cmdline = (pid) => fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
for (const [label, configEnv, expected] of [['default', {}, true], ['off', { OPENCLAW_WORKER_EAGER_COMPILE: '0' }, false]]) {
  test(`${label}: a spawned Worker ${expected ? 'runs' : 'does not run'} with --no-lazy`,
    { skip: !fs.existsSync('/proc/self/cmdline') && 'needs /proc' }, async () => {
      const pool = new WorkerPool({ minWorkers: 1, maxWorkers: 1, sessionsPerWorker: 1, warmSpareWorkers: 0,
        workerPath, idleTimeoutMs: 60_000, configEnv });
      try {
        await pool.start();
        const [worker] = pool.workers.values();
        assert.equal(cmdline(worker.pid).includes('--no-lazy'), expected);
        assert.equal(pool.status().workerEagerCompile, expected);
      } finally { await pool.close(); }
    });
}
