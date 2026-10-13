import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WorkerPool } from "./worker-pool.mjs";

async function waitFor(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("condition timed out");
}

test("detached media ownership prevents idle Worker retirement", async () => {
  const events = [];
  const pool = new WorkerPool({
    minWorkers: 1,
    maxWorkers: 2,
    sessionsPerWorker: 1,
    idleTimeoutMs: 100,
    idleSweepIntervalMs: 20,
    workerPath: fileURLToPath(
      new URL("./fake-detached-event-worker.mjs", import.meta.url),
    ),
    async onWorkerEvent(event) {
      events.push(event.eventKind);
      return { handled: true, delivered: true };
    },
  });
  try {
    await pool.start();
    const hold = pool.dispatch("session:hold", {
      kind: "hold",
      durationMs: 500,
    });
    await waitFor(() => pool.status().workers[0]?.activeCount === 1);
    await pool.dispatch("session:detached", {
      kind: "detached",
      taskId: "task-1",
      detachedDurationMs: 320,
    });
    const detached = await waitFor(() => {
      const status = pool.status();
      return status.workers.find((worker) => worker.detachedTaskCount === 1);
    });
    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.equal(pool.status().workers.length, 2);
    assert.equal(detached.detachedTaskKeys[0], "media:task-1");
    await waitFor(() =>
      events.includes("media_generation_completion") &&
      events.includes("detached_task_settled"),
    );
    await hold;
    await waitFor(() => pool.status().workers.length === 1);
    assert.deepEqual(events, [
      "detached_task_started",
      "media_generation_completion",
      "detached_task_settled",
    ]);
  } finally {
    await pool.close();
  }
});
