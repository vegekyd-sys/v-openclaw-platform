import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WorkerPool } from "./worker-pool.mjs";

const delayedWorkerPath = fileURLToPath(
  new URL("./fake-delayed-ready-worker.mjs", import.meta.url),
);

async function waitFor(predicate, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`condition was not met within ${timeoutMs}ms`);
}

test("Worker startup has a separate lease longer than the old 15s ceiling", async () => {
  const pool = new WorkerPool({
    minWorkers: 1,
    maxWorkers: 1,
    sessionsPerWorker: 1,
    startupTimeoutMs: 250,
    requestTimeoutMs: 2_000,
    workerPath: delayedWorkerPath,
    workerEnv: {
      ...process.env,
      VLAB_FAKE_WORKER_READY_DELAY_MS: "100",
    },
  });
  try {
    const startedAt = Date.now();
    await pool.start();
    assert.ok(Date.now() - startedAt >= 80);
    assert.equal(pool.status().startupTimeoutMs, 250);
    assert.equal(pool.status().workers[0].ready, true);
  } finally {
    await pool.close();
  }
});

test("active load prewarms one idle Worker without delaying the admitted turn", async () => {
  const pool = new WorkerPool({
    minWorkers: 1,
    maxWorkers: 2,
    sessionsPerWorker: 3,
    startupTimeoutMs: 500,
    warmSpareWorkers: 1,
    idleTimeoutMs: 150,
    idleSweepIntervalMs: 25,
    requestTimeoutMs: 2_000,
    workerPath: delayedWorkerPath,
    workerEnv: {
      ...process.env,
      VLAB_FAKE_WORKER_READY_DELAY_MS: "80",
    },
  });
  try {
    const submitted = await pool.submit("agent:fixture:warm-spare", {
      kind: "hold",
      durationMs: 250,
    });
    const warm = await waitFor(() => {
      const status = pool.status();
      if (status.workers.length !== 2) return undefined;
      const active = status.workers.filter(
        (worker) => worker.activeCount === 1,
      );
      const idle = status.workers.filter(
        (worker) => worker.ready && worker.activeCount === 0,
      );
      return active.length === 1 && idle.length === 1 ? status : undefined;
    });
    assert.equal(warm.warmSpareWorkers, 1);
    await submitted.promise;
    const scaledDown = await waitFor(
      () => (pool.status().workers.length === 1 ? pool.status() : undefined),
      2_000,
    );
    assert.equal(scaledDown.workers[0].activeCount, 0);
  } finally {
    await pool.close();
  }
});

test("new-worker boot does not block dispatch to a ready Worker that becomes idle", async () => {
  const pool = new WorkerPool({
    minWorkers: 1, maxWorkers: 2, sessionsPerWorker: 1,
    warmSpareWorkers: 0, startupTimeoutMs: 2_000, requestTimeoutMs: 2_000,
    workerPath: delayedWorkerPath,
    workerEnv: {...process.env, VLAB_FAKE_WORKER_READY_DELAY_MS: "400"},
  });
  let second;
  try {
    await pool.start();
    const first = await pool.submit("agent:fixture:first", {kind: "hold", durationMs: 50});
    second = await pool.submit("agent:fixture:second", {kind: "hold", durationMs: 1});
    second.promise.catch(() => {});
    await first.promise;
    const result = await Promise.race([
      second.promise,
      new Promise(resolve => setTimeout(() => resolve(null), 150)),
    ]);
    assert.ok(result, "pending job waited for cold boot while a ready Worker was free");
    assert.equal(result.workerPid, pool.status().workers.find(w => w.ready).pid);
  } finally { await pool.close(); }
});
