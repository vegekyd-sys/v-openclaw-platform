import assert from "node:assert/strict";
import test from "node:test";
import { createGatewayNativeCompactionPassthrough } from "./gateway-native-compaction.mjs";

test("lets OpenClaw continue with Gateway-owned Context Engine compaction", async () => {
  const compact = createGatewayNativeCompactionPassthrough();

  const result = await compact({
    agentHarnessId: "vlab-worker",
    sessionKey: "agent:makaron:feishu:group:oc_compaction1234",
    sessionId: "session-1",
    sessionFile: "/tmp/session-1.jsonl",
    trigger: "manual",
  });

  assert.equal(result, undefined);
});
