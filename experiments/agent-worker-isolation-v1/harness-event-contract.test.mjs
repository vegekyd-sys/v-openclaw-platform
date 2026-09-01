import assert from "node:assert/strict";
import test from "node:test";
import {
  buildForwardedHarnessOptions,
  HARNESS_EVENT_CONTRACT_VERSION,
  inspectHarnessEventContract,
  inspectHarnessOptionContract,
  WORKER_CONVERSATION_TOOL_POLICY_SAFE_DENY_TOOLS,
} from "./harness-event-contract.mjs";

test("classifies bridged, Gateway-owned, and unknown Harness callbacks", () => {
  const contract = inspectHarnessEventContract({
    onPartialReply() {},
    onAgentEvent() {},
    onAttemptTimeout() {},
    onDeferredLifecycleOwner() {},
    onUserMessagePersistenceInvalidated() {},
    onFutureVisibleEvent() {},
    notACallback() {},
  });

  assert.equal(HARNESS_EVENT_CONTRACT_VERSION, "openclaw-2026.8.1-v6");
  assert.deepEqual(contract.bridged, [
    "onAgentEvent",
    "onPartialReply",
    "onUserMessagePersistenceInvalidated",
  ]);
  assert.deepEqual(contract.gatewayOwned, [
    "onAttemptTimeout",
    "onDeferredLifecycleOwner",
  ]);
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
    conversationToolPolicy: { deny: ["message"] },
    pluginHarnessToolPolicyRestricted: true,
    pluginHarnessToolPolicySafeDeniedTools: ["message"],
    trustedInternalHandoff: true,
    bootstrapWorkspaceDir: "/srv/vlab/workspace",
    contextEngineAgentId: "makaron",
    delegationCapability: "full",
    clientCaps: ["inline-widgets"],
    githubPublicationAvailable: true,
    toolAuthorityFingerprint: "authority-v1",
    modelSelectionLocked: true,
    operation: "attempt",
    skipPreparedUserTurnMessage: true,
    startedAtMs: 1234,
    sessionKey: "agent:fixture:one",
    cleanupBundleMcpOnRunEnd: true,
    contextEngine: { id: "native" },
    cronCreatorAuthorityCapability: { opaque: true },
    hostCapabilities: { kind: "host" },
    isTurnTainted() { return true; },
    observeToolTerminal() {},
    preparedModelRuntime: { catalogOwner: "fixture" },
    prepareAssistantTranscriptMessage() {},
    sandbox: { mode: "off" },
    onPartialReply() {},
    futureHarnessMode: "new",
    futureHarnessResolver() {},
  });

  assert.deepEqual(contract.forwarded, [
    "blockReplyChunking",
    "bootstrapWorkspaceDir",
    "clientCaps",
    "contextEngineAgentId",
    "conversationToolPolicy",
    "delegationCapability",
    "githubPublicationAvailable",
    "modelId",
    "modelSelectionLocked",
    "operation",
    "pluginHarnessToolPolicyRestricted",
    "pluginHarnessToolPolicySafeDeniedTools",
    "promptCacheKey",
    "provider",
    "skipPreparedUserTurnMessage",
    "startedAtMs",
    "thinkLevel",
    "toolAuthorityFingerprint",
    "trustedInternalHandoff",
  ]);
  assert.deepEqual(contract.translated, ["sessionKey"]);
  assert.deepEqual(contract.processLocal, [
    "cleanupBundleMcpOnRunEnd",
    "contextEngine",
    "cronCreatorAuthorityCapability",
    "hostCapabilities",
    "isTurnTainted",
    "observeToolTerminal",
    "prepareAssistantTranscriptMessage",
    "preparedModelRuntime",
    "sandbox",
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
      conversationToolPolicy: { deny: ["message"] },
      pluginHarnessToolPolicyRestricted: true,
      pluginHarnessToolPolicySafeDeniedTools: ["message"],
      bootstrapWorkspaceDir: "/srv/vlab/workspace",
      contextEngineAgentId: "makaron",
      delegationCapability: "full",
      clientCaps: ["inline-widgets"],
      githubPublicationAvailable: true,
      toolAuthorityFingerprint: "authority-v1",
      modelSelectionLocked: true,
      operation: "attempt",
      skipPreparedUserTurnMessage: true,
      startedAtMs: 1234,
      cleanupBundleMcpOnRunEnd: true,
    }),
    {
      provider: "azure-openai",
      model: "gpt-5.6-sol",
      promptCacheKey: "agent:makaron:feishu:group:fixture",
      thinking: "high",
      blockReplyBreak: "message_end",
      conversationToolPolicy: { deny: ["message"] },
      pluginHarnessToolPolicyRestricted: true,
      pluginHarnessToolPolicySafeDeniedTools: ["message"],
      bootstrapWorkspaceDir: "/srv/vlab/workspace",
      contextEngineAgentId: "makaron",
      delegationCapability: "full",
      clientCaps: ["inline-widgets"],
      githubPublicationAvailable: true,
      toolAuthorityFingerprint: "authority-v1",
      modelSelectionLocked: true,
      operation: "attempt",
      skipPreparedUserTurnMessage: true,
      startedAtMs: 1234,
    },
  );
});

test("certifies only the audited 2026.8.1 native deny equivalents", () => {
  assert.deepEqual(WORKER_CONVERSATION_TOOL_POLICY_SAFE_DENY_TOOLS, [
    "web_fetch",
    "x_search",
    "memory_search",
    "memory_get",
    "dashboard",
    "canvas",
    "show_widget",
    "message",
    "heartbeat_respond",
    "automations",
    "gateway",
    "skill_workshop",
    "image_generate",
    "music_generate",
    "video_generate",
    "tts",
  ]);
});
