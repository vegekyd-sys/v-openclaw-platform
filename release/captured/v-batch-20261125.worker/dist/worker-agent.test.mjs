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

function makeMultiWorkerPool() {
  return new WorkerPool({
    minWorkers: 1,
    maxWorkers: 2,
    sessionsPerWorker: 1,
    idleTimeoutMs: 1_000,
    requestTimeoutMs: 5_000,
    requestCancelGraceMs: 100,
    warmSpareWorkers: 0,
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
      suppressPromptPersistence: false,
      skipInitialSessionTouch: true,
      mainRestartRecoveryAdmitted: true,
      allowGatewaySubagentBinding: true,
      allowModelOverride: true,
    });
    assert.equal(result.attempt.itemLifecycle.activeCount, 0);
    assert.equal(pool.status().workers[0].activeCount, 0);
    assert.deepEqual(pool.status().workers[0].sessionKeys, []);
    assert.equal(pool.status().workers[0].sessionHotset.enabled, false);
  } finally {
    await pool.close();
  }
});

test("non-Harness requests cannot claim prior Gateway recovery admission", async () => {
  const pool = makePool();
  try {
    const result = await pool.dispatch("agent:fixture:unadmitted", {
      kind: "agent", message: "inspect-flags", sessionId: "unadmitted", runId: "unadmitted",
      agentCommandOptions: { mainRestartRecoveryAdmitted: true },
    });
    assert.equal(JSON.parse(result.payloads[0].text).mainRestartRecoveryAdmitted, false);
  } finally { await pool.close(); }
});

test("worker admits OpenClaw through a compaction-provider generation", async () => {
  const pool = makePool();
  try {
    const result = await pool.dispatch("agent:fixture:compaction-runtime", {
      kind: "agent",
      harnessAttempt: true,
      message: "inspect-compaction-runtime",
      sessionId: "compaction-runtime",
      runId: "run-compaction-runtime",
    });
    const runtime = JSON.parse(result.payloads[0].text);

    assert.equal(runtime.hasRuntimeContext, true);
    assert.deepEqual(runtime.providerIds, ["versa-fast-quality-v1"]);
  } finally {
    await pool.close();
  }
});

test("worker forwards the extended native run lease to OpenClaw", async () => {
  const pool = makePool();
  try {
    const result = await pool.dispatch("agent:fixture:long-timeout", {
      kind: "agent",
      harnessAttempt: true,
      message: "inspect-timeout",
      sessionId: "long-timeout",
      runId: "run-long-timeout",
      timeoutSeconds: 21_600,
      requestTimeoutMs: 21_600_000,
    });
    assert.deepEqual(
      result.payloads.map((payload) => payload.text),
      ["21600"],
    );
  } finally {
    await pool.close();
  }
});

test("active Worker Agent turn accepts an in-turn Steer message", async () => {
  const pool = makePool();
  try {
    let markSteerReady;
    const steerReady = new Promise((resolve) => {
      markSteerReady = resolve;
    });
    const submitted = await pool.submit(
      "agent:fixture:steer",
      {
        kind: "agent",
        harnessAttempt: true,
        message: "steer-hold",
        sessionId: "steer-session",
        runId: "steer-run",
        eventCallbackNames: ["onExecutionPhase"],
      },
      {
        onEvent(event) {
          if (
            event.name === "onExecutionPhase" &&
            event.args[0]?.phase === "fixture_steer_ready"
          ) {
            markSteerReady();
          }
        },
      },
    );
    await steerReady;
    const outcome = await pool.steer(
      submitted.requestId,
      "new objective",
      { steeringMode: "all" },
    );
    assert.equal(outcome.steered, true);
    const result = await submitted.promise;
    assert.deepEqual(
      result.payloads.map((payload) => payload.text),
      ["steered:new objective"],
    );
  } finally {
    await pool.close();
  }
});

test("worker suppresses its copy when Gateway already persisted the user turn", async () => {
  const pool = makePool();
  try {
    const result = await pool.dispatch("agent:fixture:session-owned", {
      kind: "agent",
      harnessAttempt: true,
      message: "inspect-flags",
      sessionId: "session-owned",
      runId: "run-owned",
      suppressPromptPersistence: true,
    });
    const flags = JSON.parse(result.payloads[0].text);

    assert.equal(flags.suppressPromptPersistence, true);
  } finally {
    await pool.close();
  }
});

test("worker forwards prompt cache identity but keeps one-shot cleanup disabled", async () => {
  const pool = makePool();
  try {
    const result = await pool.dispatch("agent:fixture:cache", {
      kind: "agent",
      harnessAttempt: true,
      message: "inspect-flags",
      sessionId: "cache",
      runId: "run-cache",
      agentCommandOptions: {
        promptCacheKey: "agent:makaron:feishu:group:fixture",
        cleanupBundleMcpOnRunEnd: true,
      },
    });
    const flags = JSON.parse(result.payloads[0].text);

    assert.equal(
      flags.promptCacheKey,
      "agent:makaron:feishu:group:fixture",
    );
    assert.equal(flags.cleanupBundleMcpOnRunEnd, false);
  } finally {
    await pool.close();
  }
});

test("worker preserves sessions_yield as a completed paused harness attempt", async () => {
  const pool = makePool();
  try {
    const result = await pool.dispatch("agent:fixture:session-yield", {
      kind: "agent",
      harnessAttempt: true,
      message: "yield-turn",
      sessionId: "session-yield",
      runId: "run-yield",
    });

    assert.equal(result.attempt.yieldDetected, true);
    assert.deepEqual(result.attempt.assistantTexts, []);
    assert.equal(pool.status().workers[0].activeCount, 0);
    assert.deepEqual(pool.status().workers[0].sessionKeys, []);
  } finally {
    await pool.close();
  }
});

test("different dispatch keys sharing one transcript owner are serialized", async () => {
  const pool = makeMultiWorkerPool();
  try {
    const first = await pool.submit(
      "agent:fixture:group",
      { kind: "hold", durationMs: 120 },
      { sessionOwnerKey: "agent:fixture:session-id:shared" },
    );
    const announce = await pool.submit(
      "announce:v1:child:parent",
      { kind: "hold", durationMs: 20 },
      { sessionOwnerKey: "agent:fixture:session-id:shared" },
    );

    const [firstResult, announceResult] = await Promise.all([
      first.promise,
      announce.promise,
    ]);

    assert.equal(firstResult.slot, announceResult.slot);
    assert.equal(pool.status().workers.length, 1);
  } finally {
    await pool.close();
  }
});

test("worker IPC preserves native non-text terminal result semantics", async () => {
  const pool = makePool();
  try {
    const result = await pool.dispatch("agent:fixture:special-terminal", {
      kind: "agent",
      harnessAttempt: true,
      message: "special-terminal-results",
      sessionId: "special-terminal",
      runId: "run-special-terminal",
    });

    assert.deepEqual(result.attempt.clientToolCalls, [
      {
        name: "search_catalog",
        params: { query: "worker parity" },
      },
    ]);
    assert.deepEqual(result.attempt.toolMediaUrls, [
      "https://example.test/worker-result.png",
    ]);
    assert.equal(result.attempt.toolTrustedLocalMedia, true);
    assert.equal(result.attempt.successfulCronAdds, 1);
    assert.equal(result.attempt.acceptedSessionSpawns.length, 1);
    assert.equal(result.attempt.messagingToolSentTargets.length, 1);
    assert.equal(result.attempt.replayMetadata.replaySafe, false);
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
