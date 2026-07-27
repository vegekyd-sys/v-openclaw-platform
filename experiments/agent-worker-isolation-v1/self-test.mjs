import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { WorkerPool } from "./worker-pool.mjs";

async function waitFor(predicate, options = {}) {
  const timeoutMs = options.timeoutMs ?? 3_000;
  const intervalMs = options.intervalMs ?? 25;
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const value = predicate();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(options.message ?? `condition was not met within ${timeoutMs}ms`);
}

function sessionKey(suffix) {
  return `agent:makaron:explicit:vlab-worker-selftest-${suffix}`;
}

const holdDurationMs = Number(
  process.env.VLAB_WORKER_TEST_DURATION_MS ?? 300,
);
const pool = new WorkerPool({
  minWorkers: 1,
  maxWorkers: 3,
  sessionsPerWorker: 3,
  idleTimeoutMs: holdDurationMs + 300,
  idleSweepIntervalMs: 25,
  requestTimeoutMs: 30_000,
});

try {
  await pool.start();
  const initialStatus = pool.status();
  assert.equal(initialStatus.minWorkers, 1);
  assert.equal(initialStatus.maxWorkers, 3);
  assert.equal(initialStatus.sessionsPerWorker, 3);
  assert.equal(initialStatus.maxActiveSessions, 9);
  assert.equal(initialStatus.workers.length, 1);

  const nineSessions = Array.from({ length: 9 }, (_, index) =>
    sessionKey(`capacity-${index + 1}`),
  );
  const nineStartedAt = performance.now();
  const ninePromises = nineSessions.map((key) =>
    pool.dispatch(key, { kind: "hold", durationMs: holdDurationMs }),
  );
  const saturatedStatus = await waitFor(
    () => {
      const status = pool.status();
      const activeCount = status.workers.reduce(
        (sum, worker) => sum + worker.activeCount,
        0,
      );
      return status.workers.length === 3 && activeCount === 9
        ? status
        : undefined;
    },
    { message: "3 workers x 3 sessions did not saturate" },
  );
  assert.equal(saturatedStatus.pending, 0);
  assert.deepEqual(
    saturatedStatus.workers.map((worker) => worker.activeCount),
    [3, 3, 3],
  );
  const nineResults = await Promise.all(ninePromises);
  const nineWallMs = performance.now() - nineStartedAt;
  const pidCounts = new Map();
  for (const result of nineResults) {
    pidCounts.set(result.workerPid, (pidCounts.get(result.workerPid) ?? 0) + 1);
  }
  assert.equal(pidCounts.size, 3);
  assert.deepEqual([...pidCounts.values()].sort(), [3, 3, 3]);
  assert.ok(
    nineWallMs < holdDurationMs * 2.5,
    `nine-session wall ${nineWallMs.toFixed(1)}ms was too high`,
  );

  const sticky = sessionKey("sticky");
  const stickyStartedAt = performance.now();
  const [stickyFirst, stickySecond] = await Promise.all([
    pool.dispatch(sticky, { kind: "hold", durationMs: holdDurationMs }),
    pool.dispatch(sticky, { kind: "hold", durationMs: holdDurationMs }),
  ]);
  const stickyWallMs = performance.now() - stickyStartedAt;
  assert.equal(stickyFirst.workerPid, stickySecond.workerPid);
  assert.ok(
    stickyWallMs >= holdDurationMs * 1.8,
    `same-session work was not serialized: ${stickyWallMs.toFixed(1)}ms`,
  );

  const tenPromises = Array.from({ length: 10 }, (_, index) =>
    pool.dispatch(sessionKey(`queue-${index + 1}`), {
      kind: "hold",
      durationMs: holdDurationMs,
    }),
  );
  const queuedStatus = await waitFor(
    () => {
      const status = pool.status();
      const activeCount = status.workers.reduce(
        (sum, worker) => sum + worker.activeCount,
        0,
      );
      return activeCount === 9 && status.pending === 1 ? status : undefined;
    },
    { message: "the tenth session did not queue behind capacity nine" },
  );
  assert.equal(queuedStatus.workers.length, 3);
  await Promise.all(tenPromises);

  const cancellable = await pool.submit(sessionKey("cancel"), {
    kind: "hold",
    durationMs: 5_000,
  });
  await waitFor(() =>
    pool
      .status()
      .workers.some((worker) =>
        worker.active.some(
          (active) => active.requestId === cancellable.requestId,
        ),
      ),
  );
  const cancellation = pool.cancel(cancellable.requestId);
  assert.equal(cancellation.cancelled, true);
  assert.equal(cancellation.state, "active");
  await assert.rejects(cancellable.promise, {
    name: "AbortError",
  });

  const scaledDownStatus = await waitFor(
    () => {
      const status = pool.status();
      return status.workers.length === 1 ? status : undefined;
    },
    {
      timeoutMs: 4_000,
      message: "elastic pool did not return to one warm worker",
    },
  );
  assert.equal(scaledDownStatus.pending, 0);
  assert.equal(scaledDownStatus.workers[0].activeCount, 0);
  assert.equal(scaledDownStatus.workers[0].queued, 0);

  console.log(
    JSON.stringify(
      {
        ok: true,
        topology: {
          minWorkers: initialStatus.minWorkers,
          maxWorkers: initialStatus.maxWorkers,
          sessionsPerWorker: initialStatus.sessionsPerWorker,
          maxActiveSessions: initialStatus.maxActiveSessions,
        },
        saturation: {
          workerPidCounts: Object.fromEntries(pidCounts),
          wallMs: nineWallMs,
          pending: saturatedStatus.pending,
        },
        sameSessionSerialized: {
          workerPid: stickyFirst.workerPid,
          wallMs: stickyWallMs,
        },
        tenthSessionQueued: queuedStatus.pending === 1,
        activeCancellation: true,
        scaledDownWorkers: scaledDownStatus.workers.length,
      },
      null,
      2,
    ),
  );
} finally {
  await pool.close();
}

const crashPool = new WorkerPool({
  minWorkers: 1,
  maxWorkers: 1,
  sessionsPerWorker: 3,
  idleTimeoutMs: 5_000,
  idleSweepIntervalMs: 25,
});

try {
  await crashPool.start();
  const active = await Promise.all(
    Array.from({ length: 3 }, async (_, index) =>
      await crashPool.submit(sessionKey(`crash-${index + 1}`), {
        kind: "hold",
        durationMs: 5_000,
      }),
    ),
  );
  const activeStatus = await waitFor(() => {
    const status = crashPool.status();
    return status.workers[0]?.activeCount === 3 ? status : undefined;
  });
  const killed = crashPool.terminateWorker(activeStatus.workers[0].slot);
  assert.equal(killed.terminated, true);
  assert.equal(killed.activeRequestIds.length, 3);
  const failures = await Promise.allSettled(active.map((item) => item.promise));
  assert.ok(failures.every((result) => result.status === "rejected"));
  await waitFor(() => crashPool.status().workers[0]?.ready === true, {
    message: "minimum worker was not restored after active crash",
  });
  const recovered = await crashPool.dispatch(sessionKey("after-crash"), {
    kind: "ping",
  });
  assert.equal(recovered.kind, "ping");
} finally {
  await crashPool.close();
}

const stubbornWorkerPath = fileURLToPath(
  new URL("./stubborn-worker.mjs", import.meta.url),
);
const stubbornPool = new WorkerPool({
  minWorkers: 1,
  maxWorkers: 2,
  sessionsPerWorker: 1,
  idleTimeoutMs: 100,
  idleSweepIntervalMs: 25,
  retireGraceMs: 100,
  workerPath: stubbornWorkerPath,
});

try {
  await stubbornPool.start();
  const stubbornResults = await Promise.all([
    stubbornPool.dispatch(sessionKey("stubborn-1"), { kind: "ping" }),
    stubbornPool.dispatch(sessionKey("stubborn-2"), { kind: "ping" }),
  ]);
  assert.equal(new Set(stubbornResults.map((result) => result.workerPid)).size, 2);
  const forcedScaleDown = await waitFor(
    () => {
      const status = stubbornPool.status();
      return status.workers.length === 1 ? status : undefined;
    },
    {
      timeoutMs: 3_000,
      message: "SIGTERM-resistant worker blocked elastic scale-in",
    },
  );
  assert.equal(forcedScaleDown.workers[0].retiring, false);
} finally {
  await stubbornPool.close();
}
