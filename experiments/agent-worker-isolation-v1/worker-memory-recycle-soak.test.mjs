import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WorkerPool } from "./worker-pool.mjs";

const allocatingWorkerPath = fileURLToPath(
  new URL("./fake-allocating-worker.mjs", import.meta.url),
);

async function waitFor(predicate, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`condition was not met within ${timeoutMs}ms`);
}

// The production shape: a single-Worker floor that reapIdleWorkers can never
// touch, serving turns that each leave real resident memory behind.
test("a resident Worker that really grows is recycled and replaced warm", async () => {
  const pool = new WorkerPool({
    minWorkers: 1,
    maxWorkers: 2,
    sessionsPerWorker: 1,
    idleTimeoutMs: 200,
    idleSweepIntervalMs: 50,
    startupTimeoutMs: 5_000,
    requestTimeoutMs: 20_000,
    recycleRssBytes: 220 * 1024 * 1024,
    recycleMinAgeMs: 0,
    recycleCooldownMs: 0,
    recycleMaxLifetimeMs: 0,
    workerPath: allocatingWorkerPath,
    configEnv: {},
    workerEnv: {
      ...process.env,
      VLAB_FAKE_WORKER_GROW_BYTES: String(32 * 1024 * 1024),
    },
  });
  try {
    await pool.start();
    const originalPid = pool.status().workers[0].pid;

    for (let turn = 0; turn < 8; turn += 1) {
      const admitted = await pool.submit(`session-${turn}`, {
        kind: "hold",
        durationMs: 5,
      });
      await admitted.promise;
    }

    const grown = await waitFor(() => {
      const worker = pool
        .status()
        .workers.find((candidate) => candidate.pid === originalPid);
      return (worker?.memory?.rss ?? 0) >= 220 * 1024 * 1024 ? worker : undefined;
    });
    assert.ok(grown.memory.rss >= 220 * 1024 * 1024);

    await waitFor(() => pool.status().recycledWorkerCount >= 1);
    const after = await waitFor(() => {
      const ready = pool
        .status()
        .workers.filter((worker) => worker.ready && !worker.retiring);
      return ready.length >= 1 &&
        ready.every((worker) => worker.pid !== originalPid)
        ? ready
        : undefined;
    });

    // The replacement is a fresh process, so the accumulated footprint is
    // actually gone rather than swapped out.
    assert.ok(after[0].memory.rss < grown.memory.rss / 2);
    assert.equal(after[0].servedSessionCount, 0);
  } finally {
    await pool.close();
  }
});
