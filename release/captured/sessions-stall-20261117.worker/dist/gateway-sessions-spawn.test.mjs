import assert from "node:assert/strict";
import test from "node:test";
import { createGatewaySessionsSpawnExecutor } from "./gateway-sessions-spawn.mjs";

test("executes sessions_spawn in the Gateway with requester ownership context", async () => {
  let createdWith;
  let executedWith;
  const execute = createGatewaySessionsSpawnExecutor({
    getConfig: () => ({ marker: "gateway-config" }),
    createTools: (options) => {
      createdWith = options;
      return [
        {
          name: "sessions_spawn",
          async execute(toolCallId, args) {
            executedWith = { toolCallId, args };
            return {
              content: [{ type: "text", text: "accepted" }],
              details: { status: "accepted", runId: "run-1" },
            };
          },
        },
      ];
    },
  });
  const result = await execute({
    toolName: "sessions_spawn",
    toolCallId: "call-1",
    args: { task: "child" },
    context: {
      agentSessionKey: "agent:makaron:parent",
      completionOwnerKey: "agent:makaron:parent",
      agentChannel: "feishu",
      agentTo: "oc_test",
      requesterAgentIdOverride: "makaron",
    },
  });
  assert.equal(createdWith.config.marker, "gateway-config");
  assert.equal(createdWith.agentSessionKey, "agent:makaron:parent");
  assert.equal(createdWith.completionOwnerKey, "agent:makaron:parent");
  assert.equal(createdWith.agentChannel, "feishu");
  assert.equal(createdWith.agentTo, "oc_test");
  assert.deepEqual(executedWith, {
    toolCallId: "call-1",
    args: { task: "child" },
  });
  assert.equal(result.details.vlabGatewayOwned, true);
});

test("rejects non-session Gateway tool requests", async () => {
  const execute = createGatewaySessionsSpawnExecutor({
    getConfig: () => ({}),
    createTools: () => [],
  });
  await assert.rejects(
    execute({ toolName: "exec" }),
    /unsupported Gateway-owned tool/,
  );
});
