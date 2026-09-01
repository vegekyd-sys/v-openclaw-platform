import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptedSubagentRuns,
  startSubagentCompletionRelays,
} from "./subagent-completion-relay.mjs";

test("only accepted isolated runs are relayed once", () => {
  assert.deepEqual(
    acceptedSubagentRuns([
      {
        status: "accepted",
        runId: "run-1",
        childSessionKey: "agent:makaron:subagent:child-1",
        mode: "run",
      },
      {
        status: "error",
        runId: "run-2",
        childSessionKey: "agent:makaron:subagent:child-2",
      },
      {
        status: "accepted",
        runId: "run-1",
        childSessionKey: "agent:makaron:subagent:child-1",
      },
    ]),
    [
      {
        status: "accepted",
        runId: "run-1",
        childSessionKey: "agent:makaron:subagent:child-1",
        mode: "run",
      },
    ],
  );
});

test("completed child uses OpenClaw native announce flow", async () => {
  const active = new Map();
  const announcements = [];
  const stats = {};
  const promises = startSubagentCompletionRelays({
    spawns: [
      {
        status: "accepted",
        runId: "child-run",
        childSessionKey: "agent:makaron:subagent:child",
        mode: "run",
      },
    ],
    requesterSessionKey: "agent:makaron:feishu:group:parent",
    requesterOrigin: {
      channel: "feishu",
      accountId: "default",
      to: "oc_parent",
    },
    active,
    stats,
    waitForRun: async ({ runId, timeoutMs }) => {
      assert.equal(runId, "child-run");
      assert.equal(timeoutMs, 86_400_000);
      return { status: "ok" };
    },
    runNativeAnnounce: async (params) => {
      announcements.push(params);
      params.onDeliveryResult({ delivered: true, path: "direct" });
      return true;
    },
  });

  assert.equal(promises.length, 1);
  assert.equal(active.size, 1);
  await Promise.all(promises);

  assert.equal(active.size, 1);
  assert.equal(stats.started, 1);
  assert.equal(stats.completed, 1);
  assert.equal(stats.failed, 0);
  assert.equal(stats.delivered, 1);
  assert.deepEqual(
    {
      childSessionKey: announcements[0].childSessionKey,
      childRunId: announcements[0].childRunId,
      requesterSessionKey: announcements[0].requesterSessionKey,
      requesterOrigin: announcements[0].requesterOrigin,
      outcome: announcements[0].outcome,
      spawnMode: announcements[0].spawnMode,
      expectsCompletionMessage: announcements[0].expectsCompletionMessage,
      waitForCompletion: announcements[0].waitForCompletion,
    },
    {
      childSessionKey: "agent:makaron:subagent:child",
      childRunId: "child-run",
      requesterSessionKey: "agent:makaron:feishu:group:parent",
      requesterOrigin: {
        channel: "feishu",
        accountId: "default",
        to: "oc_parent",
      },
      outcome: { status: "ok" },
      spawnMode: "run",
      expectsCompletionMessage: true,
      waitForCompletion: false,
    },
  );
});

test("relay is idempotent and preserves child failure", async () => {
  const active = new Map();
  const stats = {};
  let waitCalls = 0;
  const announcements = [];
  const options = {
    spawns: [
      {
        status: "accepted",
        runId: "failed-child",
        childSessionKey: "agent:makaron:subagent:failed-child",
      },
    ],
    requesterSessionKey: "agent:makaron:explicit:parent",
    active,
    stats,
    waitForRun: async () => {
      waitCalls += 1;
      return { status: "error", error: "child failed" };
    },
    runNativeAnnounce: async (params) => {
      announcements.push(params);
      return true;
    },
  };

  const first = startSubagentCompletionRelays(options);
  const duplicate = startSubagentCompletionRelays(options);
  assert.equal(first.length, 1);
  assert.equal(duplicate.length, 0);
  await Promise.all(first);

  assert.equal(waitCalls, 1);
  assert.deepEqual(announcements[0].outcome, {
    status: "error",
    error: "child failed",
  });
  assert.equal(stats.completed, 1);
});

test("wait timeout is announced as timeout without throwing", async () => {
  const stats = {};
  const announcements = [];
  await Promise.all(
    startSubagentCompletionRelays({
      spawns: [
        {
          status: "accepted",
          runId: "slow-child",
          childSessionKey: "agent:makaron:subagent:slow-child",
        },
      ],
      requesterSessionKey: "agent:makaron:explicit:parent",
      stats,
      waitForRun: async () => ({ status: "timeout" }),
      runNativeAnnounce: async (params) => {
        announcements.push(params);
        return false;
      },
    }),
  );

  assert.deepEqual(announcements[0].outcome, { status: "timeout" });
  assert.equal(stats.completed, 1);
  assert.equal(stats.delivered, 0);
});

test("OpenClaw AgentHarnessTaskRuntime can own external Worker completion", async () => {
  const stats = {};
  const deliveries = [];
  await Promise.all(
    startSubagentCompletionRelays({
      spawns: [
        {
          status: "accepted",
          runId: "external-child",
          childSessionKey: "agent:makaron:subagent:external-child",
          task: "long task",
        },
      ],
      requesterSessionKey: "agent:makaron:explicit:parent",
      stats,
      waitForRun: async () => ({ status: "ok" }),
      deliverHarnessTaskCompletion: async (params) => {
        deliveries.push(params);
        return { delivered: true, path: "steered" };
      },
    }),
  );
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].spawn.runId, "external-child");
  assert.deepEqual(deliveries[0].outcome, { status: "ok" });
  assert.equal(stats.delivered, 1);
  assert.equal(stats.failed, 0);
});
