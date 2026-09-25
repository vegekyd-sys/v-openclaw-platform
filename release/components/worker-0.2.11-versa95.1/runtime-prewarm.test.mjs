import assert from "node:assert/strict";
import test from "node:test";

import { prewarmWorkerRuntime } from "./runtime-prewarm.mjs";

function fakeRuntimes({ commandPrewarm, acquireError } = {}) {
  const calls = { acquire: [], disposed: 0, commandPrewarm: 0 };
  const agentRuntime = {
    resolveAgentWorkspaceDir: (_config, agentId) => `/workspaces/${agentId}`,
    resolveAgentDir: (_config, agentId) => `/agents/${agentId}`,
  };
  const commandRuntime = commandPrewarm
    ? {
        prewarmAgentCommandRuntimes: async () => {
          calls.commandPrewarm += 1;
          return { skillSnapshotPrepared: true };
        },
      }
    : {};
  const preparedRuntime = {
    acquireAgentRunPreparedModelRuntime: async (params, options) => {
      if (acquireError) throw acquireError;
      calls.acquire.push({ params, options });
      return {
        pluginGeneration: {},
        [Symbol.asyncDispose]: async () => {
          calls.disposed += 1;
        },
      };
    },
  };
  return {
    calls,
    loadAgentRuntime: async () => agentRuntime,
    loadCompactionRuntime: async () => ({
      commandRuntime,
      configRuntime: { loadConfig: () => ({}) },
      preparedRuntime,
    }),
  };
}

test("prepares the agent's model runtime without a command runtime prewarm", async () => {
  const runtimes = fakeRuntimes();
  const result = await prewarmWorkerRuntime({ enabled: true, agentId: "main", ...runtimes });
  assert.equal(result.status, "ready");
  assert.equal(result.skillSnapshotPrepared, false);
  assert.equal(runtimes.calls.acquire.length, 1);
  assert.equal(runtimes.calls.acquire[0].params.agentId, "main");
  assert.equal(runtimes.calls.acquire[0].params.workspaceDir, "/workspaces/main");
  assert.equal(runtimes.calls.acquire[0].options.retainIdleRunOwner, true);
  assert.equal(runtimes.calls.disposed, 1);
});

test("uses the command runtime prewarm when the release provides it", async () => {
  const runtimes = fakeRuntimes({ commandPrewarm: true });
  const result = await prewarmWorkerRuntime({ enabled: true, ...runtimes });
  assert.equal(result.status, "ready");
  assert.equal(result.skillSnapshotPrepared, true);
  assert.equal(runtimes.calls.commandPrewarm, 1);
});

test("defers to the normal turn when preparation fails", async () => {
  const runtimes = fakeRuntimes({ acquireError: new Error("catalog unavailable") });
  const result = await prewarmWorkerRuntime({ enabled: true, ...runtimes });
  assert.equal(result.status, "deferred-to-normal-turn");
  assert.equal(result.errorCategory, "other");
});

test("does nothing when disabled", async () => {
  const runtimes = fakeRuntimes();
  assert.deepEqual(await prewarmWorkerRuntime({ enabled: false, ...runtimes }), {
    status: "disabled",
  });
  assert.equal(runtimes.calls.acquire.length, 0);
});
