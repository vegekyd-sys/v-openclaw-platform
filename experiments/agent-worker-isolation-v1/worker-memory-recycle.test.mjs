import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WorkerPool, resolveWorkerExecArgv } from "./worker-pool.mjs";

const memoryWorkerPath = fileURLToPath(
  new URL("./fake-memory-report-worker.mjs", import.meta.url),
);

async function waitFor(predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`condition was not met within ${timeoutMs}ms`);
}

function makePool(overrides = {}) {
  return new WorkerPool({
    minWorkers: 1,
    maxWorkers: 2,
    sessionsPerWorker: 1,
    idleTimeoutMs: 100,
    idleSweepIntervalMs: 20,
    startupTimeoutMs: 2_000,
    requestTimeoutMs: 5_000,
    recycleCooldownMs: 0,
    recycleMinAgeMs: 0,
    recycleMaxLifetimeMs: 0,
    recycleMaxSessions: 0,
    workerPath: memoryWorkerPath,
    configEnv: {},
    ...overrides,
    workerEnv: {
      ...process.env,
      VLAB_FAKE_WORKER_RSS: String(overrides.fakeRssBytes ?? 4 * 1024 * 1024),
      ...overrides.workerEnv,
    },
  });
}

test("a resident Worker over the RSS bound is recycled even at minWorkers", async () => {
  const pool = makePool({
    recycleRssBytes: 2 * 1024 * 1024,
    fakeRssBytes: 8 * 1024 * 1024,
  });
  try {
    await pool.start();
    const originalPid = pool.status().workers[0].pid;
    await waitFor(() => pool.status().recycledWorkerCount >= 1);
    const after = await waitFor(() => {
      const status = pool.status();
      const ready = status.workers.filter((worker) => worker.ready && !worker.retiring);
      return ready.length >= 1 && ready.every((worker) => worker.pid !== originalPid)
        ? status
        : undefined;
    });
    assert.ok(after.recycledWorkerCount >= 1);
    assert.ok(after.workers.some((worker) => worker.ready));
  } finally {
    await pool.close();
  }
});

test("recycling never drops the pool below its warm floor", async () => {
  const pool = makePool({
    recycleRssBytes: 2 * 1024 * 1024,
    fakeRssBytes: 8 * 1024 * 1024,
    recycleCooldownMs: 40,
  });
  let lowestReady = Number.POSITIVE_INFINITY;
  let sampler;
  try {
    await pool.start();
    sampler = setInterval(() => {
      const ready = pool
        .status()
        .workers.filter((worker) => worker.ready && !worker.retiring).length;
      lowestReady = Math.min(lowestReady, ready);
    }, 5);
    await waitFor(() => pool.status().recycledWorkerCount >= 2, 8_000);
    // A replacement is started and ready before the over-grown Worker is
    // retired, so a caller arriving mid-recycle never pays a cold start.
    assert.equal(lowestReady, 1);
  } finally {
    clearInterval(sampler);
    await pool.close();
  }
});

test("a freshly started Worker is not a recycle candidate", async () => {
  const pool = makePool({
    recycleRssBytes: 2 * 1024 * 1024,
    fakeRssBytes: 8 * 1024 * 1024,
    recycleMinAgeMs: 60_000,
  });
  try {
    await pool.start();
    const pid = pool.status().workers[0].pid;
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(pool.status().recycledWorkerCount, 0);
    assert.equal(pool.status().workers[0].pid, pid);
  } finally {
    await pool.close();
  }
});

test("a Worker under the bounds is left alone", async () => {
  const pool = makePool({
    recycleRssBytes: 64 * 1024 * 1024,
    fakeRssBytes: 4 * 1024 * 1024,
  });
  try {
    await pool.start();
    const pid = pool.status().workers[0].pid;
    await new Promise((resolve) => setTimeout(resolve, 400));
    const status = pool.status();
    assert.equal(status.recycledWorkerCount, 0);
    assert.equal(status.workers[0].pid, pid);
    assert.equal(status.workers[0].recycleReason, undefined);
  } finally {
    await pool.close();
  }
});

test("an over-grown Worker running a turn is not interrupted", async () => {
  const pool = makePool({
    recycleRssBytes: 2 * 1024 * 1024,
    fakeRssBytes: 8 * 1024 * 1024,
  });
  try {
    await pool.start();
    const pid = pool.status().workers[0].pid;
    const admitted = await pool.submit("session-a", {
      kind: "hold",
      durationMs: 500,
    });
    const response = await admitted.promise;
    // The turn was served start to finish by the over-grown Worker: a
    // Worker is only ever a recycle candidate while it is fully idle.
    assert.equal(response.workerPid, pid);
    assert.ok(
      pool.status().workers.some((worker) => worker.pid === pid && worker.ready),
    );
  } finally {
    await pool.close();
  }
});

test("the lifetime bound catches growth that never crosses the RSS bound", async () => {
  const pool = makePool({
    recycleRssBytes: 0,
    recycleMaxLifetimeMs: 150,
    fakeRssBytes: 1024,
  });
  try {
    await pool.start();
    await waitFor(() => pool.status().recycledWorkerCount >= 1);
  } finally {
    await pool.close();
  }
});

test("a Worker does not inherit the Gateway old-space ceiling", () => {
  const gatewayArgv = [
    "--inspect=127.0.0.1:9229",
    "--max-old-space-size=12288",
    "--enable-source-maps",
  ];
  assert.deepEqual(resolveWorkerExecArgv(gatewayArgv, 3072), [
    "--enable-source-maps",
    "--max-old-space-size=3072",
  ]);
  assert.deepEqual(resolveWorkerExecArgv(gatewayArgv, 0), [
    "--max-old-space-size=12288",
    "--enable-source-maps",
  ]);
  assert.deepEqual(resolveWorkerExecArgv(["--max_old_space_size=12288"], 2048), [
    "--max-old-space-size=2048",
  ]);
});

test("recycle bounds reject negative configuration", () => {
  assert.throws(
    () => new WorkerPool({ recycleRssBytes: -1, workerPath: memoryWorkerPath }),
    /recycleRssBytes must be >= 0/,
  );
  assert.throws(
    () =>
      new WorkerPool({ workerMaxOldSpaceMb: 1.5, workerPath: memoryWorkerPath }),
    /workerMaxOldSpaceMb must be an integer >= 0/,
  );
});
