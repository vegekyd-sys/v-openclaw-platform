import assert from "node:assert/strict";
import test from "node:test";

import { createWorkerActiveRunProxy } from "./worker-active-run-proxy.mjs";

test("Gateway active-run proxy relays Steer to its Worker request", async () => {
  const calls = [];
  const pool = {
    async steer(requestId, text, options) {
      calls.push({ requestId, text, options });
      return { steered: true };
    },
    cancel() {
      return { cancelled: true };
    },
  };
  const proxy = createWorkerActiveRunProxy({
    pool,
    requestId: "request-7",
    runId: "run-7",
    sourceReplyDeliveryMode: "channel",
  });

  await proxy.handle.queueMessage("change direction", {
    steeringMode: "all",
  });
  assert.deepEqual(calls, [
    {
      requestId: "request-7",
      text: "change direction",
      options: { steeringMode: "all" },
    },
  ]);
  assert.equal(proxy.handle.isStreaming(), true);

  proxy.deactivate();
  assert.equal(proxy.handle.isStopped(), true);
  await assert.rejects(
    proxy.handle.queueMessage("too late"),
    /no longer active/,
  );
});

test("Gateway active-run proxy rejects unsupported commit-wait semantics", async () => {
  const proxy = createWorkerActiveRunProxy({
    pool: { steer: async () => ({ steered: true }) },
    requestId: "request-8",
    runId: "run-8",
  });
  await assert.rejects(
    proxy.handle.queueMessage("commit", { waitForTranscriptCommit: true }),
    /does not support transcript-commit waiting/,
  );
});
