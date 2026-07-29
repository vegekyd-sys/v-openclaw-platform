import assert from "node:assert/strict";
import test from "node:test";
import { createCompactionAdmissionBarrier } from "./compaction-admission-barrier.mjs";

test("holds same-session Channel dispatch until compaction finishes", async () => {
  const barrier = createCompactionAdmissionBarrier({ timeoutMs: 1_000 });
  barrier.beforeCompaction({}, { sessionKey: "agent:makaron:feishu:group:test" });

  let released = false;
  const waiting = barrier
    .beforeDispatch({}, { sessionKey: "agent:makaron:feishu:group:test" })
    .then(() => {
      released = true;
    });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(released, false);

  barrier.afterCompaction({}, { sessionKey: "agent:makaron:feishu:group:test" });
  await waiting;
  assert.equal(released, true);
  assert.equal(barrier.status().waits, 1);
  assert.equal(barrier.status().activeSessions, 0);
});

test("does not serialize unrelated sessions", async () => {
  const barrier = createCompactionAdmissionBarrier({ timeoutMs: 1_000 });
  barrier.beforeCompaction({}, { sessionKey: "agent:makaron:feishu:group:a" });
  await barrier.beforeDispatch(
    {},
    { sessionKey: "agent:makaron:feishu:group:b" },
  );
  assert.equal(barrier.status().waits, 0);
  barrier.dispose();
});

test("fails open after the bounded wait instead of swallowing a message", async () => {
  const barrier = createCompactionAdmissionBarrier({ timeoutMs: 20 });
  barrier.beforeCompaction({}, { sessionKey: "agent:makaron:feishu:group:test" });
  await barrier.beforeDispatch(
    {},
    { sessionKey: "agent:makaron:feishu:group:test" },
  );
  assert.equal(barrier.status().timedOut, 1);
  assert.equal(barrier.status().activeSessions, 0);
});
