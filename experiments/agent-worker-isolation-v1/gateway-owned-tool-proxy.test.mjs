import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createGatewayOwnedToolProxy } from "./gateway-owned-tool-proxy.mjs";

const runnerPath = fileURLToPath(
  new URL("./fake-gateway-owned-tool-runner.mjs", import.meta.url),
);

test("isolates a timed-out stateful tool and keeps later calls healthy", async () => {
  const proxy = createGatewayOwnedToolProxy({ runnerPath, timeoutMs: 1_000 });
  await assert.rejects(
    proxy.execute({ toolName: "skill_workshop", args: { mode: "hang" } }),
    (error) => error?.code === "VLAB_GATEWAY_OWNED_TOOL_TIMEOUT",
  );
  const result = await proxy.execute({
    toolName: "skill_workshop",
    args: { mode: "success", marker: "AFTER_TIMEOUT_OK" },
  });
  assert.deepEqual(result, {
    echoed: { mode: "success", marker: "AFTER_TIMEOUT_OK" },
  });
  assert.deepEqual(proxy.status(), {
    calls: 2,
    succeeded: 1,
    failed: 1,
    timedOut: 1,
    lastTool: "skill_workshop",
    lastElapsedMs: proxy.status().lastElapsedMs,
    lastErrorCode: undefined,
    timeoutMs: 1_000,
  });
});

test("preserves a subprocess tool error code", async () => {
  const proxy = createGatewayOwnedToolProxy({ runnerPath, timeoutMs: 2_000 });
  await assert.rejects(
    proxy.execute({ toolName: "skill_workshop", args: { mode: "error" } }),
    (error) =>
      error?.code === "FAKE_TOOL_ERROR" && error.message === "fake tool failed",
  );
});
