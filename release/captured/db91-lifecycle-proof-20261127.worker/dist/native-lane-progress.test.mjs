import assert from "node:assert/strict";
import test from "node:test";
import { NativeLaneProgressBridge } from "./native-lane-progress.mjs";

test("Worker heartbeats refresh the owning native command lane", async () => {
  const bridge = new NativeLaneProgressBridge();
  const observed = [];
  const unregister = bridge.register("request-1", async (progress) => {
    observed.push(progress);
  });

  assert.equal(
    await bridge.relay({
      requestId: "request-1",
      sessionKey: "agent:makaron:subagent:child-1",
      reason: "worker:heartbeat",
      workerPid: 123,
      slot: 0,
    }),
    true,
  );
  assert.equal(observed.length, 1);
  assert.deepEqual(bridge.status(), {
    activeRequests: 1,
    relayed: 1,
    missing: 0,
    failed: 0,
  });

  unregister();
  assert.equal(
    await bridge.relay({ requestId: "request-1" }),
    false,
  );
  assert.deepEqual(bridge.status(), {
    activeRequests: 0,
    relayed: 1,
    missing: 1,
    failed: 0,
  });
});

test("a stale cleanup cannot unregister a newer request handler", async () => {
  const bridge = new NativeLaneProgressBridge();
  const firstCleanup = bridge.register("request-1", () => undefined);
  let newerCalled = false;
  bridge.register("request-1", () => {
    newerCalled = true;
  });

  firstCleanup();
  assert.equal(await bridge.relay({ requestId: "request-1" }), true);
  assert.equal(newerCalled, true);
});
