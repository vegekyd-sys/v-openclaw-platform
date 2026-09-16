import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WorkerPool } from "./worker-pool.mjs";

const memoryWorkerPath = fileURLToPath(
  new URL("./fake-memory-report-worker.mjs", import.meta.url),
);

async function waitFor(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`condition was not met within ${timeoutMs}ms`);
}

function readyCount(pool) {
  return pool
    .status()
    .workers.filter((worker) => worker.ready && !worker.retiring).length;
}

// Production runs twenty to thirty sessions at once, so the pool is normally
// well above minWorkers with a mix of busy and idle Workers. reapIdleWorkers
// keeps nonIdle + warmSpare in that state; recycling has to respect the same
// floor or it removes warm capacity the pool was deliberately holding.
test("recycling holds the same warm floor reapIdleWorkers does", async () => {
  const pool = new WorkerPool({
    minWorkers: 1,
    maxWorkers: 6,
    sessionsPerWorker: 1,
    warmSpareWorkers: 1,
    idleTimeoutMs: 120,
    idleSweepIntervalMs: 25,
    startupTimeoutMs: 3_000,
    requestTimeoutMs: 20_000,
    recycleRssBytes: 2 * 1024 * 1024,
    recycleMinAgeMs: 0,
    recycleCooldownMs: 0,
    recycleMaxLifetimeMs: 0,
    workerPath: memoryWorkerPath,
    configEnv: {},
    workerEnv: {
      ...process.env,
      VLAB_FAKE_WORKER_RSS: String(8 * 1024 * 1024),
    },
  });
  try {
    await pool.start();

    // Three concurrent sessions, one of them long enough to stay busy while
    // the sweep runs against the two that finish immediately.
    const held = await pool.submit("session-held", {
      kind: "hold",
      durationMs: 4_000,
    });
    const quick = await Promise.all([
      pool.submit("session-a", { kind: "hold", durationMs: 10 }),
      pool.submit("session-b", { kind: "hold", durationMs: 10 }),
    ]);
    await Promise.all(quick.map((job) => job.promise));
    await waitFor(() => pool.status().workers.length >= 3);

    // One Worker is busy, so the pool must keep it plus a warm spare.
    let lowestReady = Number.POSITIVE_INFINITY;
    const sampler = setInterval(() => {
      const status = pool.status();
      const busy = status.workers.filter(
        (worker) =>
          !worker.retiring &&
          (worker.activeCount > 0 || worker.assignedSessions > 0),
      ).length;
      if (busy > 0) lowestReady = Math.min(lowestReady, readyCount(pool));
    }, 10);

    await held.promise;
    clearInterval(sampler);

    assert.ok(
      lowestReady >= 2,
      `while a Worker was busy the pool fell to ${lowestReady} ready Workers, below the nonIdle + warmSpare floor of 2`,
    );
  } finally {
    await pool.close();
  }
});

// Production sustains twenty to thirty sessions against a 15-Worker ceiling.
// Every Worker reports a footprint over the bound here, which is the worst
// case: recycling wants to retire all of them while the load wants them all.
test("sustained concurrency keeps serving while every Worker is over the bound", async () => {
  const pool = new WorkerPool({
    minWorkers: 5,
    maxWorkers: 15,
    sessionsPerWorker: 3,
    warmSpareWorkers: 1,
    idleTimeoutMs: 150,
    idleSweepIntervalMs: 25,
    startupTimeoutMs: 5_000,
    requestTimeoutMs: 30_000,
    recycleRssBytes: 2 * 1024 * 1024,
    recycleMinAgeMs: 0,
    recycleCooldownMs: 0,
    recycleMaxLifetimeMs: 0,
    workerPath: memoryWorkerPath,
    configEnv: {},
    workerEnv: {
      ...process.env,
      VLAB_FAKE_WORKER_RSS: String(8 * 1024 * 1024),
    },
  });
  try {
    await pool.start();
    let lowestReady = Number.POSITIVE_INFINITY;
    let sawRetireStorm = 0;
    const sampler = setInterval(() => {
      const status = pool.status();
      lowestReady = Math.min(lowestReady, readyCount(pool));
      sawRetireStorm = Math.max(
        sawRetireStorm,
        status.workers.filter((worker) => worker.retiring).length,
      );
    }, 10);

    // Four waves of twenty-five concurrent sessions.
    const failures = [];
    for (let wave = 0; wave < 4; wave += 1) {
      const jobs = await Promise.all(
        Array.from({ length: 25 }, (_, index) =>
          pool.submit(`w${wave}-s${index}`, { kind: "hold", durationMs: 60 }),
        ),
      );
      const results = await Promise.allSettled(jobs.map((job) => job.promise));
      for (const result of results) {
        if (result.status === "rejected") failures.push(result.reason?.message);
      }
    }
    clearInterval(sampler);

    assert.deepEqual(failures, [], "every session must complete under load");
    // The pool is allowed to recycle, but never below its own floor.
    assert.ok(
      lowestReady >= 1,
      `pool fell to ${lowestReady} ready Workers under sustained load`,
    );
    // A retire storm would mean recycling and reaping fighting each other.
    assert.ok(
      sawRetireStorm <= 2,
      `${sawRetireStorm} Workers were retiring at once, which is a storm not a rolling recycle`,
    );
    assert.ok(
      pool.status().recycledWorkerCount <= 8,
      `recycled ${pool.status().recycledWorkerCount} times during four waves, which is churn`,
    );
  } finally {
    await pool.close();
  }
});
