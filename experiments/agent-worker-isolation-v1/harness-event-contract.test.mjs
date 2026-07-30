import assert from "node:assert/strict";
import test from "node:test";
import {
  buildForwardedHarnessOptions,
  HARNESS_EVENT_CONTRACT_VERSION,
  inspectHarnessEventContract,
  inspectHarnessOptionContract,
} from "./harness-event-contract.mjs";

test("classifies bridged, Gateway-owned, and unknown Harness callbacks", () => {
  const contract = inspectHarnessEventContract({
    onPartialReply() {},
    onAgentEvent() {},
    onAttemptTimeout() {},
    onFutureVisibleEvent() {},
    notACallback() {},
  });

  assert.equal(HARNESS_EVENT_CONTRACT_VERSION, "openclaw-2026.7.1-v3");
  assert.deepEqual(contract.bridged, [
    "onAgentEvent",
    "onPartialReply",
  ]);
  assert.deepEqual(contract.gatewayOwned, ["onAttemptTimeout"]);
  assert.deepEqual(contract.unclassified, ["onFutureVisibleEvent"]);
  assert.equal(contract.observed.includes("notACallback"), false);
});

test("classifies and translates native Harness execution options", () => {
  const contract = inspectHarnessOptionContract({
    provider: "azure-openai",
    modelId: "gpt-5.6-sol",
    promptCacheKey: "agent:makaron:feishu:group:fixture",
    thinkLevel: "high",
    blockReplyChunking: { minChars: 40, maxChars: 120 },
    sessionKey: "agent:fixture:one",
    cleanupBundleMcpOnRunEnd: true,
    contextEngine: { id: "native" },
    onPartialReply() {},
    futureHarnessMode: "new",
    futureHarnessResolver() {},
  });

  assert.deepEqual(contract.forwarded, [
    "blockReplyChunking",
    "modelId",
    "promptCacheKey",
    "provider",
    "thinkLevel",
  ]);
  assert.deepEqual(contract.translated, ["sessionKey"]);
  assert.deepEqual(contract.processLocal, [
    "cleanupBundleMcpOnRunEnd",
    "contextEngine",
  ]);
  assert.deepEqual(contract.unclassified, [
    "futureHarnessMode",
    "futureHarnessResolver",
  ]);
  assert.deepEqual(
    buildForwardedHarnessOptions({
      provider: "azure-openai",
      modelId: "gpt-5.6-sol",
      promptCacheKey: "agent:makaron:feishu:group:fixture",
      thinkLevel: "high",
      blockReplyBreak: "message_end",
      cleanupBundleMcpOnRunEnd: true,
    }),
    {
      provider: "azure-openai",
      model: "gpt-5.6-sol",
      promptCacheKey: "agent:makaron:feishu:group:fixture",
      thinking: "high",
      blockReplyBreak: "message_end",
    },
  );
});
