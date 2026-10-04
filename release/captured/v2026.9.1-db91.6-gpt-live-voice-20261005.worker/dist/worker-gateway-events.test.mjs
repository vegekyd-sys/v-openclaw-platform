import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSkillUsageRecord,
  createWorkerGatewayEventRouter,
  WORKER_GATEWAY_EVENT_CONTRACT_VERSION,
} from "./worker-gateway-events.mjs";

function mediaEvent(overrides = {}) {
  return {
    contractVersion: WORKER_GATEWAY_EVENT_CONTRACT_VERSION,
    eventKind: "media_generation_completion",
    eventId: "image_generate:task-1:ok:gateway",
    taskKey: "media:task-1",
    delivery: {
      requesterSessionKey: "agent:makaron:feishu:group:oc_test",
      targetRequesterSessionKey: "agent:makaron:feishu:group:oc_test",
      announceId: "image_generate:task-1:ok",
      triggerMessage: "image complete",
      steerMessage: "image complete",
      internalEvents: [{ type: "task_completion", status: "ok" }],
      sourceSessionKey: "image_generate:task-1",
      sourceChannel: "internal",
      sourceTool: "image_generate",
      expectsCompletionMessage: true,
      bestEffortDeliver: true,
      directIdempotencyKey: "image_generate:task-1:ok",
    },
    ...overrides,
  };
}

function skillUsageEvent(overrides = {}) {
  return {
    contractVersion: WORKER_GATEWAY_EVENT_CONTRACT_VERSION,
    eventKind: "skill_usage",
    eventId: "skill.used:run-1:tool-1:makaron",
    taskKey: "skill:run-1",
    usage: {
      runId: "run-1",
      sessionKey: "agent:makaron:feishu:group:oc_test",
      sessionId: "session-1",
      agentId: "makaron",
      skillName: "makaron",
      skillSource: "workspace",
      skillFile: "/srv/skills/makaron/SKILL.md",
      activation: "read",
      toolName: "read",
      toolCallId: "tool-1",
    },
    ...overrides,
  };
}

test("routes a detached media completion through the Gateway once", async () => {
  const stats = {};
  const calls = [];
  const route = createWorkerGatewayEventRouter({
    stats,
    async deliverMediaCompletion(params) {
      calls.push(params);
      return { delivered: true, path: "agent" };
    },
  });
  const first = await route(mediaEvent());
  const duplicate = await route(mediaEvent());
  assert.deepEqual(first, {
    handled: true,
    delivered: true,
    terminal: false,
    path: "agent",
    reason: undefined,
  });
  assert.deepEqual(duplicate, first);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].directIdempotencyKey, "image_generate:task-1:ok");
  assert.deepEqual(stats, {
    received: 2,
    duplicates: 1,
    delivered: 1,
    terminal: 0,
    failed: 0,
  });
});

test("deduplicates concurrent retries while Gateway delivery is active", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const route = createWorkerGatewayEventRouter({
    async deliverMediaCompletion() {
      calls += 1;
      await gate;
      return { terminal: true, path: "direct" };
    },
  });
  const first = route(mediaEvent());
  const retry = route(mediaEvent());
  release();
  const [left, right] = await Promise.all([first, retry]);
  assert.equal(calls, 1);
  assert.deepEqual(left, right);
  assert.equal(left.terminal, true);
});

test("failed delivery is retryable and lifecycle events are acknowledged", async () => {
  let calls = 0;
  const route = createWorkerGatewayEventRouter({
    async deliverMediaCompletion() {
      calls += 1;
      if (calls === 1) throw new Error("temporary Gateway failure");
      return { delivered: true };
    },
  });
  await assert.rejects(route(mediaEvent()), /temporary Gateway failure/);
  assert.equal((await route(mediaEvent())).delivered, true);
  assert.equal(calls, 2);
  assert.deepEqual(
    await route({
      contractVersion: WORKER_GATEWAY_EVENT_CONTRACT_VERSION,
      eventKind: "detached_task_started",
      eventId: "media:task-1:started",
      taskKey: "media:task-1",
    }),
    { handled: true, lifecycle: "detached_task_started" },
  );
});

test("records a Worker skill activation centrally exactly once", async () => {
  const skillUsageStats = {};
  const records = [];
  const route = createWorkerGatewayEventRouter({
    skillUsageStats,
    async recordSkillUsage(record) {
      records.push(record);
    },
    async deliverMediaCompletion() {
      throw new Error("not expected");
    },
  });
  const first = await route(skillUsageEvent());
  const duplicate = await route(skillUsageEvent());
  assert.deepEqual(first, { handled: true, recorded: true });
  assert.deepEqual(duplicate, first);
  assert.equal(records.length, 1);
  assert.equal(records[0].skillFile, "/srv/skills/makaron/SKILL.md");
  assert.deepEqual(skillUsageStats, {
    received: 2,
    duplicates: 1,
    recorded: 1,
    failed: 0,
  });
});

test("validates skill usage identity before central recording", () => {
  assert.throws(
    () =>
      buildSkillUsageRecord(
        skillUsageEvent({
          usage: {
            ...skillUsageEvent().usage,
            skillFile: "relative/SKILL.md",
          },
        }),
      ),
    /must be absolute/,
  );
});
