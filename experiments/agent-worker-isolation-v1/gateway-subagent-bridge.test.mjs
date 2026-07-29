import assert from "node:assert/strict";
import test from "node:test";
import { createGatewaySubagentBridge } from "./gateway-subagent-bridge.mjs";

test("subagent run is routed through the Gateway agent method", async () => {
  const calls = [];
  const bridge = createGatewaySubagentBridge(async (method, params) => {
    calls.push({ method, params });
    return { runId: "child-run-1" };
  });

  assert.deepEqual(
    await bridge.run({
      sessionKey: "agent:makaron:subagent:child-1",
      message: "child task",
      deliver: false,
      idempotencyKey: "spawn-1",
    }),
    { runId: "child-run-1" },
  );
  assert.deepEqual(calls, [
    {
      method: "agent",
      params: {
        sessionKey: "agent:makaron:subagent:child-1",
        message: "child task",
        deliver: false,
        idempotencyKey: "spawn-1",
      },
    },
  ]);
});

test("subagent lifecycle reads and deletes the Gateway-owned session", async () => {
  const calls = [];
  const bridge = createGatewaySubagentBridge(async (method, params) => {
    calls.push({ method, params });
    if (method === "agent.wait") {
      return { status: "completed" };
    }
    if (method === "sessions.get") {
      return { messages: [{ role: "assistant" }] };
    }
    return {};
  });

  assert.deepEqual(
    await bridge.waitForRun({ runId: "child-run-1", timeoutMs: 30_000 }),
    { status: "ok" },
  );
  assert.deepEqual(
    await bridge.getSessionMessages({
      sessionKey: "agent:makaron:subagent:child-1",
      limit: 5_000,
    }),
    { messages: [{ role: "assistant" }] },
  );
  await bridge.deleteSession({
    sessionKey: "agent:makaron:subagent:child-1",
  });

  assert.deepEqual(calls, [
    {
      method: "agent.wait",
      params: { runId: "child-run-1", timeoutMs: 30_000 },
    },
    {
      method: "sessions.get",
      params: {
        key: "agent:makaron:subagent:child-1",
        limit: 1_000,
      },
    },
    {
      method: "sessions.delete",
      params: {
        key: "agent:makaron:subagent:child-1",
        deleteTranscript: true,
      },
    },
  ]);
});

test("invalid Gateway subagent responses fail closed", async () => {
  const bridge = createGatewaySubagentBridge(async (method) => {
    if (method === "agent") {
      return {};
    }
    return { status: "unexpected" };
  });

  await assert.rejects(
    bridge.run({
      sessionKey: "agent:makaron:subagent:child-1",
      message: "child task",
    }),
    /invalid runId/,
  );
  await assert.rejects(
    bridge.waitForRun({ runId: "child-run-1" }),
    /unexpected status/,
  );
});
