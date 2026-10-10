import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MARKER, patchWorkerPool } from './patch-worker-warm-first.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(dir);
const base = fs.readFileSync(path.join(dir, 'release-files/voice-reliability-20261007/production-worker/worker-pool.mjs'), 'utf8');
const built = fs.readFileSync(path.join(dir, 'release-files/worker-warm-first/worker-pool.mjs'), 'utf8');
const experiments = path.join(repo, 'experiments/agent-worker-isolation-v1');
const workerPath = path.join(experiments, 'fake-delayed-ready-worker.mjs');

test('release file is the patch applied to the V pool, once', () => {
  assert.equal(patchWorkerPool(base), built);
  assert.equal(built.split(MARKER).length, 2);
  assert.throws(() => patchWorkerPool(built), /already patched/);
});

// The release file imports its production siblings; link the repository copies next to it.
async function loadPool() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-warm-first-'));
  fs.writeFileSync(path.join(tmp, 'worker-pool.mjs'), built);
  for (const name of ['late-worker-reply.mjs', 'native-harness-data.mjs'])
    fs.symlinkSync(path.join(experiments, name), path.join(tmp, name));
  const { WorkerPool } = await import(pathToFileURL(path.join(tmp, 'worker-pool.mjs')).href);
  return { WorkerPool, cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

const { WorkerPool, cleanup } = await loadPool();
test.after(cleanup);
const make = (extra) => new WorkerPool({ minWorkers: 2, maxWorkers: 2, sessionsPerWorker: 3, warmSpareWorkers: 0,
  workerPath, idleTimeoutMs: 60_000, sessionAffinityEnabled: true, ...extra });
const hold = (p, key, durationMs = 1) => p.submit(key, { kind: 'hold', durationMs });
const bySlot = (p) => [...p.workers.values()].sort((a, b) => a.slot - b.slot);

for (const [mode, expectWarm] of [['idle', true], ['all', true], ['off', false]]) {
  test(`mode ${mode}: detached work on a warm Worker ${expectWarm ? 'does not' : 'does'} send a new Session to a cold one`, async () => {
    const p = make({ warmFirstMode: mode });
    try {
      await p.start();
      const [warm, cold] = bySlot(p);
      const first = await (await hold(p, 'first')).promise;
      assert.equal(first.workerPid, warm.pid);
      assert.equal(warm.turnsAdmitted, 1);
      assert.equal(cold.turnsAdmitted, 0);
      warm.detachedTaskKeys.add('background-subagent');
      const next = await (await hold(p, 'new-session')).promise;
      assert.equal(next.workerPid, expectWarm ? warm.pid : cold.pid);
      warm.detachedTaskKeys.clear();
    } finally { await p.close(); }
  });
}

for (const [mode, expectWarm] of [['idle', false], ['all', true]]) {
  test(`mode ${mode}: a running foreground turn ${expectWarm ? 'is packed beside' : 'still spreads to the cold Worker'}`, async () => {
    const p = make({ warmFirstMode: mode });
    try {
      await p.start();
      const [warm, cold] = bySlot(p);
      await (await hold(p, 'first')).promise;
      const running = await hold(p, 'running', 150);
      const next = await (await hold(p, 'new-session')).promise;
      assert.equal(next.workerPid, expectWarm ? warm.pid : cold.pid);
      await running.promise;
    } finally { await p.close(); }
  });
}

test('environment selects the mode; unknown values keep the default', () => {
  const mode = (value) => new WorkerPool({ minWorkers: 1, maxWorkers: 1, workerPath,
    configEnv: value === undefined ? {} : { OPENCLAW_WORKER_WARM_FIRST: value } }).warmFirstMode;
  assert.equal(mode(undefined), 'idle');
  assert.equal(mode('0'), 'off');
  assert.equal(mode('off'), 'off');
  assert.equal(mode('all'), 'all');
  assert.equal(mode('surprise'), 'idle');
});

test('idle reaper retires a never-used Worker before a warm one, slot order otherwise', () => {
  const run = (warmFirstMode, workers) => {
    const retired = [];
    WorkerPool.prototype.reapIdleWorkers.call({
      closing: false, minWorkers: 1, warmFirstMode,
      workers: new Map(workers.map((w) => [w.slot, w])),
      isFullyIdle: () => true, capacityFloor: () => workers.length - 1, retiringWorkerCount: () => 0,
      retire: (w) => retired.push(w.slot),
    });
    return retired;
  };
  const workers = [{ slot: 0, turnsAdmitted: 0 }, { slot: 1, turnsAdmitted: 4 }, { slot: 2, turnsAdmitted: 2 }];
  assert.deepEqual(run('idle', workers), [0]);
  assert.deepEqual(run('off', workers), [2]);
});
