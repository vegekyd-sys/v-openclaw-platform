import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WorkerPool } from "./worker-pool.mjs";
import { agentCommandFromIngress } from "./fake-agent-runtime.mjs";

const runtimePath = fileURLToPath(
  new URL("./fake-agent-runtime.mjs", import.meta.url),
);
const callbackNames = [
  "onAssistantMessageStart",
  "onReasoningStream",
  "onToolStart",
  "onItemEvent",
  "onPartialReply",
  "onCompactionStart",
  "onCompactionEnd",
  "onReasoningEnd",
];

function eventCallbacks(trace) {
  return Object.fromEntries(
    callbackNames.map((name) => [
      name,
      async (...args) => {
        trace.push({ name, args });
      },
    ]),
  );
}

test("Worker emits the same ordered user-visible event trace as native ingress", async () => {
  const nativeTrace = [];
  const nativeResult = await agentCommandFromIngress({
    message: "stream-parity",
    sessionId: "native-stream-session",
    ...eventCallbacks(nativeTrace),
  });

  const workerTrace = [];
  const pool = new WorkerPool({
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
  try {
    const workerResult = await pool.dispatch(
      "agent:fixture:stream-parity",
      {
        kind: "agent",
        harnessAttempt: true,
        message: "stream-parity",
        sessionId: "worker-stream-session",
        runId: "worker-stream-run",
        eventCallbackNames: callbackNames,
      },
      {
        onEvent: async (event) => {
          workerTrace.push({
            name: event.name,
            args: event.args,
          });
        },
      },
    );

    assert.deepEqual(workerTrace, nativeTrace);
    assert.deepEqual(
      workerResult.payloads.map((payload) => payload.text),
      nativeResult.payloads.map((payload) => payload.text),
    );
  } finally {
    await pool.close();
  }
});

test("Worker stream callbacks apply backpressure before final completion", async () => {
  const sequence = [];
  const pool = new WorkerPool({
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
  try {
    await pool.dispatch(
      "agent:fixture:stream-backpressure",
      {
        kind: "agent",
        harnessAttempt: true,
        message: "stream-parity",
        sessionId: "worker-stream-backpressure",
        runId: "worker-stream-backpressure-run",
        eventCallbackNames: callbackNames,
      },
      {
        onEvent: async (event) => {
          if (event.name === "onPartialReply") {
            sequence.push(`partial:${event.args[0].text}`);
            await new Promise((resolve) => setTimeout(resolve, 25));
            sequence.push(`partial-acked:${event.args[0].text}`);
          }
        },
      },
    );
    sequence.push("completed");

    assert.deepEqual(sequence, [
      "partial:Streaming",
      "partial-acked:Streaming",
      "partial:Streaming reply restored.",
      "partial-acked:Streaming reply restored.",
      "completed",
    ]);
  } finally {
    await pool.close();
  }
});

test("Worker preserves native Harness execution options", async () => {
  const pool = new WorkerPool({
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
  try {
    const result = await pool.dispatch("agent:fixture:option-parity", {
      kind: "agent",
      harnessAttempt: true,
      message: "option-parity",
      sessionId: "worker-option-parity",
      runId: "worker-option-parity-run",
      agentCommandOptions: {
        provider: "azure-openai",
        model: "gpt-5.6-sol",
        thinking: "high",
        blockReplyBreak: "message_end",
        blockReplyChunking: { minChars: 40, maxChars: 120 },
        workspaceDir: "/tmp/parity-workspace",
      },
    });

    assert.deepEqual(JSON.parse(result.payloads[0].text), {
      provider: "azure-openai",
      model: "gpt-5.6-sol",
      thinking: "high",
      blockReplyBreak: "message_end",
      blockReplyChunking: { minChars: 40, maxChars: 120 },
      workspaceDir: "/tmp/parity-workspace",
    });
  } finally {
    await pool.close();
  }
});

test("Worker releases the Session Owner when a Gateway stream callback fails", async () => {
  const pool = new WorkerPool({
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
  try {
    await assert.rejects(
      pool.dispatch(
        "agent:fixture:stream-callback-failure",
        {
          kind: "agent",
          harnessAttempt: true,
          message: "stream-parity",
          sessionId: "worker-stream-callback-failure",
          runId: "worker-stream-callback-failure-run",
          eventCallbackNames: callbackNames,
        },
        {
          sessionOwnerKey: "fixture:stream-callback-failure",
          onEvent: async (event) => {
            if (event.name === "onPartialReply") {
              throw new Error("stream card update failed");
            }
          },
        },
      ),
      /stream card update failed/,
    );

    const status = pool.status();
    assert.equal(
      status.workers.reduce(
        (sum, worker) => sum + worker.activeCount,
        0,
      ),
      0,
    );
    assert.deepEqual(
      status.workers.flatMap((worker) => worker.sessionKeys),
      [],
    );
  } finally {
    await pool.close();
  }
});
