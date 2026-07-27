import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
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

const durationMs = Number(process.env.VLAB_WORKER_TEST_DURATION_MS ?? 300);
const pool = new WorkerPool({
  minWorkers: 1,
  maxWorkers: 4,
  idleTimeoutMs: 250,
  idleSweepIntervalMs: 25,
  requestTimeoutMs: 30_000,
});

try {
  await pool.start();
  const initialStatus = pool.status();
  assert.equal(initialStatus.minWorkers, 1);
  assert.equal(initialStatus.maxWorkers, 4);
  assert.equal(initialStatus.workers.length, 1);
  assert.equal(initialStatus.pending, 0);

  const sessions = Array.from(
    { length: 4 },
    (_, index) => `agent:makaron:explicit:vlab-worker-selftest-${index}`,
  );
  const parallelStartedAt = performance.now();
  const parallel = await Promise.all(
    sessions.map((sessionKey) =>
      pool.dispatch(sessionKey, { kind: "cpu", durationMs }),
    ),
  );
  const parallelWallMs = performance.now() - parallelStartedAt;
  const parallelWorkerPids = new Set(parallel.map((result) => result.workerPid));

  assert.equal(parallelWorkerPids.size, 4);
  assert.ok(
    parallelWallMs < durationMs * 2.75,
    `elastic parallel wall ${parallelWallMs.toFixed(1)}ms was too high`,
  );
  assert.equal(pool.status().workers.length, 4);

  const stickySession =
    "agent:makaron:explicit:vlab-worker-selftest-sticky-session";
  const stickyStartedAt = performance.now();
  const [stickyBusy, stickyPing] = await Promise.all([
    pool.dispatch(stickySession, {
      kind: "cpu",
      durationMs: Math.max(durationMs, 250),
    }),
    pool.dispatch(stickySession, { kind: "ping" }),
  ]);
  const stickyWallMs = performance.now() - stickyStartedAt;

  assert.equal(stickyBusy.workerPid, stickyPing.workerPid);
  assert.ok(
    stickyWallMs >= Math.max(durationMs, 250) * 0.9,
    `same-session work was not serialized: ${stickyWallMs.toFixed(1)}ms`,
  );

  const cappedSessions = Array.from(
    { length: 5 },
    (_, index) => `agent:makaron:explicit:vlab-worker-selftest-capped-${index}`,
  );
  const capped = await Promise.all(
    cappedSessions.map((sessionKey) =>
      pool.dispatch(sessionKey, { kind: "cpu", durationMs: 150 }),
    ),
  );
  assert.equal(pool.status().workers.length, 4);
  assert.equal(new Set(capped.map((result) => result.workerPid)).size, 4);

  const scaledDownStatus = await waitFor(
    () => {
      const status = pool.status();
      return status.workers.length === 1 ? status : undefined;
    },
    {
      timeoutMs: 3_000,
      message: "elastic pool did not return to minWorkers",
    },
  );
  assert.equal(scaledDownStatus.pending, 0);
  assert.equal(scaledDownStatus.workers[0].active, null);
  assert.equal(scaledDownStatus.workers[0].queued, 0);

  const resumed = await pool.dispatch(stickySession, { kind: "ping" });
  assert.equal(resumed.kind, "ping");
  assert.equal(pool.status().workers.length, 1);
  const held = await pool.dispatch(stickySession, {
    kind: "hold",
    durationMs: 25,
  });
  assert.equal(held.kind, "hold");
  assert.ok(held.wallMs >= 20);

  console.log(
    JSON.stringify(
      {
        ok: true,
        minWorkers: initialStatus.workers.length,
        peakWorkers: parallelWorkerPids.size,
        maxWorkers: initialStatus.maxWorkers,
        parallelWorkerPids: [...parallelWorkerPids],
        parallelWallMs,
        stickyWorkerPid: stickyBusy.workerPid,
        stickyWallMs,
        cappedRequests: capped.length,
        scaledDownWorkers: scaledDownStatus.workers.length,
        resumedWorkerPid: resumed.workerPid,
        holdWallMs: held.wallMs,
      },
      null,
      2,
    ),
  );
} finally {
  await pool.close();
}
