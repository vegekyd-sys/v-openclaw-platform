import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { WorkerPool } from "./worker-pool.mjs";

function findSessionForSlot(pool, wantedSlot) {
  for (let index = 0; index < 10_000; index += 1) {
    const sessionKey = `agent:makaron:explicit:vlab-worker-selftest-${index}`;
    if (pool.slotFor(sessionKey) === wantedSlot) {
      return sessionKey;
    }
  }
  throw new Error(`unable to find session key for slot ${wantedSlot}`);
}

const durationMs = Number(process.env.VLAB_WORKER_TEST_DURATION_MS ?? 750);
const pool = new WorkerPool({
  maxWorkers: 2,
  requestTimeoutMs: 30_000,
});

try {
  await pool.start();
  const session0 = findSessionForSlot(pool, 0);
  const session1 = findSessionForSlot(pool, 1);

  const sequentialStartedAt = performance.now();
  const sequential0 = await pool.dispatch(session0, { kind: "cpu", durationMs });
  const sequential1 = await pool.dispatch(session1, { kind: "cpu", durationMs });
  const sequentialWallMs = performance.now() - sequentialStartedAt;

  const parallelStartedAt = performance.now();
  const [parallel0, parallel1] = await Promise.all([
    pool.dispatch(session0, { kind: "cpu", durationMs }),
    pool.dispatch(session1, { kind: "cpu", durationMs }),
  ]);
  const parallelWallMs = performance.now() - parallelStartedAt;

  const isolationStartedAt = performance.now();
  const busy = pool.dispatch(session0, {
    kind: "cpu",
    durationMs: Math.max(durationMs, 500),
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const pingStartedAt = performance.now();
  const ping = await pool.dispatch(session1, { kind: "ping" });
  const crossWorkerPingMs = performance.now() - pingStartedAt;
  await busy;

  const sameWorkerStartedAt = performance.now();
  const sameWorkerBusy = pool.dispatch(session0, {
    kind: "cpu",
    durationMs: 300,
  });
  const sameWorkerPing = pool.dispatch(session0, { kind: "ping" });
  await Promise.all([sameWorkerBusy, sameWorkerPing]);
  const sameWorkerQueueMs = performance.now() - sameWorkerStartedAt;

  assert.notEqual(sequential0.workerPid, sequential1.workerPid);
  assert.equal(parallel0.slot, 0);
  assert.equal(parallel1.slot, 1);
  assert.ok(
    parallelWallMs < sequentialWallMs * 0.75,
    `parallel wall ${parallelWallMs.toFixed(1)}ms was not sufficiently below sequential ${sequentialWallMs.toFixed(1)}ms`,
  );
  assert.ok(
    crossWorkerPingMs < 300,
    `cross-worker ping took ${crossWorkerPingMs.toFixed(1)}ms`,
  );
  assert.ok(
    sameWorkerQueueMs >= 275,
    `same-worker queue was not serialized: ${sameWorkerQueueMs.toFixed(1)}ms`,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        workerPids: [parallel0.workerPid, parallel1.workerPid],
        sessions: [session0, session1],
        sequentialWallMs,
        parallelWallMs,
        speedup: sequentialWallMs / parallelWallMs,
        crossWorkerPingMs,
        sameWorkerQueueMs,
        cpuUserMs: [parallel0.cpuUserMs, parallel1.cpuUserMs],
        ping,
        isolationWallMs: performance.now() - isolationStartedAt,
      },
      null,
      2,
    ),
  );
} finally {
  await pool.close();
}
