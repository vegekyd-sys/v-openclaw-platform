import assert from "node:assert/strict";
import test from "node:test";

import {
  createActiveRunAwareQueue,
  patchFeishuActiveRunSteeringBundle,
} from "../scripts/patch-feishu-active-run-steering.mjs";

const officialFixture = `
function createSequentialQueue(options = {}) {
\tconst queues = /* @__PURE__ */ new Map();
\tconst taskTimeoutMs = options.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
\tconst onTaskTimeout = options.onTaskTimeout;
\treturn (key, task) => {
\t\tconst previous = queues.get(key) ?? Promise.resolve();
\t\tconst wrapped = () => boundedRun(key, task, taskTimeoutMs, onTaskTimeout);
\t\tconst next = previous.then(wrapped, wrapped);
\t\tqueues.set(key, next);
\t\tconst cleanup = () => {
\t\t\tif (queues.get(key) === next) queues.delete(key);
\t\t};
\t\tnext.then(cleanup, cleanup);
\t\treturn next;
\t};
}
async function dispatchFeishuMessage() {
\t\tawait enqueue(sequentialKey, task);
}
`;

test("patch exposes busy state and routes a later message to the active-run lane", () => {
  const result = patchFeishuActiveRunSteeringBundle(officialFixture);
  assert.equal(result.changed, true);
  assert.match(result.source, /enqueue\.isBusy = \(key\) => queues\.has\(key\)/);
  assert.match(result.source, /\? `\$\{sequentialKey\}:active-run`/);
  assert.equal(
    patchFeishuActiveRunSteeringBundle(result.source).changed,
    false,
  );
});

test("the second same-chat dispatch enters before the first completes", async () => {
  const queue = createActiveRunAwareQueue();
  const events = [];
  let releaseFirst;
  let releaseSecond;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const secondGate = new Promise((resolve) => {
    releaseSecond = resolve;
  });

  const first = queue.dispatch("chat", async () => {
    events.push("first:start");
    await firstGate;
    events.push("first:end");
  });
  await Promise.resolve();
  const second = queue.dispatch("chat", async () => {
    events.push("second:start");
    await secondGate;
    events.push("second:end");
  });
  const third = queue.dispatch("chat", async () => {
    events.push("third:start");
  });
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.deepEqual(events, ["first:start", "second:start"]);
  releaseSecond();
  await second;
  await third;
  assert.deepEqual(events, [
    "first:start",
    "second:start",
    "second:end",
    "third:start",
  ]);
  releaseFirst();
  await first;
});
