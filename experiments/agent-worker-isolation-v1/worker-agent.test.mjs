import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WorkerPool } from "./worker-pool.mjs";

const runtimePath = fileURLToPath(
  new URL("./fake-agent-runtime.mjs", import.meta.url),
);

function makePool() {
  return new WorkerPool({
    minWorkers: 1,
    maxWorkers: 1,
    sessionsPerWorker: 1,
    idleTimeoutMs: 1_000,
    requestTimeoutMs: 5_000,
    requestCancelGraceMs: 100,
    workerEnv: {
      ...process.env,
      VLAB_OPENCLAW_AGENT_RUNTIME: runtimePath,
      VLAB_REQUIRE_OPENCLAW_AGENT_RUNTIME: "1",
    },
  });
}

test("persistent worker does not run one-shot CLI teardown per turn", async () => {
  const pool = makePool();
  try {
    const result = await pool.dispatch("agent:fixture:session-1", {
      kind: "agent",
      harnessAttempt: true,
      message: "inspect-flags",
      sessionId: "session-1",
      runId: "run-1",
    });
    const flags = JSON.parse(result.payloads[0].text);

    assert.deepEqual(flags, {
      cleanupBundleMcpOnRunEnd: false,
      cleanupCliLiveSessionOnRunEnd: false,
      oneShotCliRun: false,
      suppressPromptPersistence: true,
      skipInitialSessionTouch: true,
    });
    assert.equal(result.attempt.itemLifecycle.activeCount, 0);
    assert.equal(pool.status().workers[0].activeCount, 0);
    assert.deepEqual(pool.status().workers[0].sessionKeys, []);
  } finally {
    await pool.close();
  }
});

test("worker rejection releases the same-session owner immediately", async () => {
  const pool = makePool();
  try {
    await assert.rejects(
      pool.dispatch("agent:fixture:session-2", {
        kind: "agent",
        message: "throw-timeout",
        sessionId: "session-2",
        runId: "run-2",
      }),
      /LLM request timed out/,
    );

    const statusAfterFailure = pool.status();
    assert.equal(statusAfterFailure.workers[0].activeCount, 0);
    assert.deepEqual(statusAfterFailure.workers[0].sessionKeys, []);

    const next = await pool.dispatch("agent:fixture:session-2", {
      kind: "agent",
      message: "inspect-flags",
      sessionId: "session-2",
      runId: "run-3",
    });
    assert.equal(next.kind, "agent");
  } finally {
    await pool.close();
  }
});

test("an unresponsive request still replaces the worker after cancel grace", async () => {
  const pool = makePool();
  try {
    await assert.rejects(
      pool.dispatch("agent:fixture:session-3", {
        kind: "agent",
        message: "hang",
        sessionId: "session-3",
        runId: "run-4",
        requestTimeoutMs: 100,
      }),
      (error) => error?.code === "VLAB_WORKER_REQUEST_TIMEOUT",
    );

    const next = await pool.dispatch("agent:fixture:session-3", {
      kind: "agent",
      message: "inspect-flags",
      sessionId: "session-3",
      runId: "run-5",
    });
    assert.equal(next.kind, "agent");
    assert.equal(pool.status().workers[0].activeCount, 0);
    assert.deepEqual(pool.status().workers[0].sessionKeys, []);
  } finally {
    await pool.close();
  }
});
