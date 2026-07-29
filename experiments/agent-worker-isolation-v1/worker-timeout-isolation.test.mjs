import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { WorkerPool } from "./worker-pool.mjs";

async function waitFor(predicate, timeoutMs = 3_000) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const value = predicate();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`condition was not met within ${timeoutMs}ms`);
}

const progress = [];
const pool = new WorkerPool({
  minWorkers: 1,
  maxWorkers: 1,
  sessionsPerWorker: 3,
  requestTimeoutMs: 2_000,
  requestCancelGraceMs: 500,
  workerEnv: {
    ...process.env,
    VLAB_WORKER_HEARTBEAT_MS: "40",
  },
  onProgress(event) {
    progress.push(event);
  },
});

try {
  await pool.start();
  const initialPid = pool.status().workers[0].pid;
  const timedOut = await pool.submit("agent:makaron:test:timeout", {
    kind: "hold",
    durationMs: 3_000,
    requestTimeoutMs: 1_000,
    runId: "run-timeout",
    sessionId: "session-timeout",
  });
  const siblingOne = await pool.submit("agent:makaron:test:sibling-1", {
    kind: "hold",
    durationMs: 1_500,
    requestTimeoutMs: 2_000,
    runId: "run-sibling-1",
    sessionId: "session-sibling-1",
  });
  const siblingTwo = await pool.submit("agent:makaron:test:sibling-2", {
    kind: "hold",
    durationMs: 1_700,
    requestTimeoutMs: 2_000,
    runId: "run-sibling-2",
    sessionId: "session-sibling-2",
  });

  await waitFor(
    () =>
      pool
        .status()
        .workers.some((worker) => worker.activeCount === 3),
  );

  await assert.rejects(timedOut.promise, {
    code: "VLAB_WORKER_REQUEST_TIMEOUT",
  });
  const [firstResult, secondResult] = await Promise.all([
    siblingOne.promise,
    siblingTwo.promise,
  ]);
  assert.equal(firstResult.kind, "hold");
  assert.equal(secondResult.kind, "hold");

  const finalStatus = await waitFor(() => {
    const status = pool.status();
    return status.workers[0]?.activeCount === 0 ? status : undefined;
  });
  assert.equal(finalStatus.workers.length, 1);
  assert.equal(finalStatus.workers[0].pid, initialPid);
  assert.ok(
    progress.some(
      (event) =>
        event.runId === "run-sibling-1" &&
        event.reason === "worker:active",
    ),
  );
  assert.ok(
    progress.some(
      (event) =>
        event.runId === "run-sibling-2" &&
        event.reason === "worker:active",
    ),
  );

  console.log(
    JSON.stringify({
      ok: true,
      timedOutRequestIsolated: true,
      siblingRequestsCompleted: 2,
      workerPidPreserved: initialPid,
      progressEvents: progress.length,
    }),
  );
} finally {
  await pool.close();
}
