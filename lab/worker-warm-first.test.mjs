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

const reap = (pool, workers, floor = workers.length - 1) => {
  const retired = [];
  WorkerPool.prototype.reapIdleWorkers.call({
    closing: false, minWorkers: 1, idleTimeoutMs: 180_000, ...pool,
    workers: new Map(workers.map((w) => [w.slot, w])),
    isFullyIdle: () => true, capacityFloor: () => floor, retiringWorkerCount: () => 0,
    retire: (w) => retired.push(w.slot),
  });
  return retired;
};
const idleFor = (ms) => Date.now() - ms;

test('idle reaper retires a never-used Worker before a warm one, slot order otherwise', () => {
  const longIdle = idleFor(3_600_000);
  const workers = [{ slot: 0, turnsAdmitted: 0, lastIdleAt: longIdle }, { slot: 1, turnsAdmitted: 4, lastIdleAt: longIdle },
    { slot: 2, turnsAdmitted: 2, lastIdleAt: longIdle }];
  assert.deepEqual(reap({ warmFirstMode: 'idle', warmIdleTimeoutMs: 1_800_000 }, workers), [0]);
  assert.deepEqual(reap({ warmFirstMode: 'off', warmIdleTimeoutMs: 1_800_000 }, workers), [2]);
});

test('a warm Worker idle past idleTimeoutMs stays until the warm idle timeout', () => {
  const workers = [{ slot: 0, turnsAdmitted: 0, lastIdleAt: idleFor(300_000) }, { slot: 1, turnsAdmitted: 3, lastIdleAt: idleFor(300_000) },
    { slot: 2, turnsAdmitted: 1, lastIdleAt: idleFor(2_000_000) }];
  assert.deepEqual(reap({ warmFirstMode: 'idle', warmIdleTimeoutMs: 1_800_000 }, workers, 0), [0, 2]);
  assert.deepEqual(reap({ warmFirstMode: 'idle', warmIdleTimeoutMs: 180_000 }, workers, 0), [0, 2, 1]);
});

test('environment sets the warm idle timeout; 0 or values not above idleTimeoutMs keep it', () => {
  const warmIdle = (value, idleTimeoutMs = 180_000) => new WorkerPool({ minWorkers: 1, maxWorkers: 1, workerPath, idleTimeoutMs,
    configEnv: value === undefined ? {} : { OPENCLAW_WORKER_WARM_IDLE_TIMEOUT_MS: value } }).warmIdleTimeoutMs;
  assert.equal(warmIdle(undefined), 1_800_000);
  assert.equal(warmIdle('600000'), 600_000);
  assert.equal(warmIdle('0'), 180_000);
  assert.equal(warmIdle('nonsense'), 180_000);
  assert.equal(warmIdle(undefined, 3_600_000), 3_600_000);
});
