import assert from "node:assert/strict";
import test from "node:test";

import { OpenShellProvider } from "../src/openshell-provider.mjs";

test("persistent Workspaces keep a canonical process alive until Broker cleanup", async () => {
  const provider = new OpenShellProvider({
    OPENSHELL_GATEWAY: "test-gateway",
    VLAB_SANDBOX_POLICY_DIR: "/policies",
  });
  let command;
  provider.openshell = async (args) => {
    command = args;
    return { code: 0, stdout: Buffer.from("{}"), stderr: Buffer.alloc(0) };
  };

  await provider.createSandbox("vsw-test", {
    cpu: "1",
    memory: "2Gi",
    networkProfile: "offline",
  }, "workspace-id", "vws-test");

  assert.deepEqual(command.slice(-3), ["--", "sleep", "infinity"]);
  assert.ok(command.includes("--detach"));
  assert.ok(!command.includes("--no-keep"));
  assert.ok(!command.includes("--output"));
  assert.ok(!command.includes("-o"));
});
