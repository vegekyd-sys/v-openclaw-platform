import assert from "node:assert/strict";
import { relayWorkerProgress } from "./worker-progress.mjs";

const emitted = [];
assert.equal(
  relayWorkerProgress(
    (event) => emitted.push(event),
    {
      runId: "run-long-1",
      sessionId: "session-long-1",
      sessionKey: "agent:makaron:feishu:group:long-1",
      reason: "worker:active",
    },
  ),
  true,
);
assert.deepEqual(emitted, [
  {
    type: "run.progress",
    runId: "run-long-1",
    sessionId: "session-long-1",
    sessionKey: "agent:makaron:feishu:group:long-1",
    reason: "worker:active",
  },
]);

assert.equal(
  relayWorkerProgress(
    (event) => emitted.push(event),
    {
      sessionKey: "agent:makaron:feishu:group:missing-run",
      reason: "worker:active",
    },
  ),
  false,
);
assert.equal(emitted.length, 1);

console.log(JSON.stringify({ ok: true, emitted: emitted.length }));
