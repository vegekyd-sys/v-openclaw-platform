export const HARNESS_EVENT_CONTRACT_VERSION = "openclaw-2026.7.1-v2";

// These callbacks are asynchronous notifications. Their arguments and
// completion semantics can cross the Worker IPC boundary without changing the
// Agent's decision-making.
export const BRIDGED_HARNESS_EVENT_CALLBACKS = Object.freeze([
  "onActiveModelSelected",
  "onAgentEvent",
  "onAgentToolResult",
  "onAssistantErrorMessagePersisted",
  "onAssistantMessageStart",
  "onBlockReply",
  "onBlockReplyFlush",
  "onCommandOutput",
  "onCompactionEnd",
  "onCompactionStart",
  "onExecutionPhase",
  "onItemEvent",
  "onPartialReply",
  "onPatchSummary",
  "onPlanUpdate",
  "onReasoningEnd",
  "onReasoningProgress",
  "onReasoningStream",
  "onRunProgress",
  "onToolOutcome",
  "onToolResult",
  "onToolStart",
  "onToolStreamBoundary",
]);

// OpenClaw retains ownership of these lifecycle controls in the Gateway. They
// must not be recreated inside an isolated Worker.
export const GATEWAY_OWNED_HARNESS_CALLBACKS = Object.freeze([
  "onAttemptAbort",
  "onAttemptTimeout",
  "onAttemptTimeoutArmed",
  "onUserMessagePersisted",
]);

const bridgedCallbacks = new Set(BRIDGED_HARNESS_EVENT_CALLBACKS);
const gatewayOwnedCallbacks = new Set(GATEWAY_OWNED_HARNESS_CALLBACKS);

// The native Harness is a lower-level API than agentCommandFromIngress. These
// options must be carried into the nested OpenClaw run so channel, model,
// streaming, tool, and prompt behavior does not silently fall back to Worker
// defaults.
export const FORWARDED_HARNESS_OPTIONS = Object.freeze({
  approvalReviewerDeviceId: "approvalReviewerDeviceId",
  bashElevated: "bashElevated",
  blockReplyBreak: "blockReplyBreak",
  blockReplyChunking: "blockReplyChunking",
  bootstrapContextMode: "bootstrapContextMode",
  bootstrapContextRunKind: "bootstrapContextRunKind",
  bootstrapPromptWarningSignature:
    "bootstrapPromptWarningSignature",
  bootstrapPromptWarningSignaturesSeen:
    "bootstrapPromptWarningSignaturesSeen",
  chatType: "chatType",
  channelContext: "channelContext",
  chatId: "chatId",
  clientTools: "clientTools",
  currentChannelId: "currentChannelId",
  currentInboundAudio: "currentInboundAudio",
  currentInboundContext: "currentInboundContext",
  currentInboundEventKind: "currentInboundEventKind",
  currentMessageId: "currentMessageId",
  currentMessagingTarget: "currentMessagingTarget",
  currentThreadTs: "currentThreadTs",
  cwd: "cwd",
  disableMessageTool: "disableMessageTool",
  disableTools: "disableTools",
  enforceFinalTag: "enforceFinalTag",
  execOverrides: "execOverrides",
  extraSystemPrompt: "extraSystemPrompt",
  fastMode: "fastMode",
  fastModeAutoOnSeconds: "fastModeAutoOnSeconds",
  fastModeStartedAtMs: "fastModeStartedAtMs",
  forceHeartbeatTool: "forceHeartbeatTool",
  forceMessageTool: "forceMessageTool",
  groupChannel: "groupChannel",
  groupId: "groupId",
  groupSpace: "groupSpace",
  images: "images",
  imageOrder: "imageOrder",
  inputProvenance: "inputProvenance",
  internalEvents: "internalEvents",
  isCanonicalWorkspace: "isCanonicalWorkspace",
  isFinalFallbackAttempt: "isFinalFallbackAttempt",
  jobId: "jobId",
  memberRoleIds: "memberRoleIds",
  memoryFlushWritePath: "memoryFlushWritePath",
  modelId: "model",
  modelRun: "modelRun",
  ownerNumbers: "ownerNumbers",
  preserveUserFacingSessionModelState:
    "preserveUserFacingSessionModelState",
  promptMode: "promptMode",
  provider: "provider",
  reasoningLevel: "reasoningLevel",
  replyToMode: "replyToMode",
  requireExplicitMessageTarget: "requireExplicitMessageTarget",
  senderE164: "senderE164",
  senderId: "senderId",
  senderIsOwner: "senderIsOwner",
  senderName: "senderName",
  senderUsername: "senderUsername",
  sandboxSessionKey: "sandboxSessionKey",
  sessionEffects: "sessionEffects",
  silentExpected: "silentExpected",
  silentReplyPromptMode: "silentReplyPromptMode",
  sourceReplyDeliveryMode: "sourceReplyDeliveryMode",
  spawnedBy: "spawnedBy",
  streamParams: "streamParams",
  streamReasoningInNonStreamModes: "streamReasoningInNonStreamModes",
  suppressAssistantErrorPersistence: "suppressAssistantErrorPersistence",
  suppressLiveStreamOutput: "suppressLiveStreamOutput",
  suppressNextUserMessagePersistence: "suppressNextUserMessagePersistence",
  suppressTranscriptOnlyAssistantPersistence:
    "suppressTranscriptOnlyAssistantPersistence",
  thinkLevel: "thinking",
  toolProgressDetail: "toolProgressDetail",
  toolResultFormat: "toolResultFormat",
  toolsAllow: "toolsAllow",
  trigger: "trigger",
  verboseLevel: "verbose",
  workspaceDir: "workspaceDir",
});

// These values are already translated by index.mjs into the ingress command
// identity/routing fields or the Worker timeout contract.
export const TRANSLATED_HARNESS_OPTIONS = Object.freeze([
  "agentAccountId",
  "agentId",
  "messageChannel",
  "messageProvider",
  "messageThreadId",
  "messageTo",
  "prompt",
  "runContext",
  "runId",
  "sessionId",
  "sessionKey",
  "timeoutMs",
  "transcriptPrompt",
]);

// These are process-local runtime objects or lifecycle controls. The Worker
// rebuilds them from the same versioned config, or the Gateway retains them.
export const PROCESS_LOCAL_HARNESS_OPTIONS = Object.freeze([
  "abortSignal",
  "agentDir",
  "agentHarnessId",
  "agentHarnessRuntimeOverride",
  "agentHarnessTaskRuntimeScope",
  "allocateToolOutcomeOrdinal",
  "allowGatewaySubagentBinding",
  "allowTransientCooldownProbe",
  "authProfileId",
  "authProfileIdSource",
  "authProfileStore",
  "authStorage",
  "beforeAgentFinalizeRevisionAttempts",
  "beforeAgentStartResult",
  "config",
  "contextEngine",
  "contextTokenBudget",
  "contextWindowInfo",
  "crestodianTool",
  "deferTerminalLifecycle",
  "deferTerminalLifecycleEnd",
  "fallbackActive",
  "fallbackReason",
  "fastModeAuto",
  "fastModeAutoProgressState",
  "hasRepliedRef",
  "initialReplayState",
  "lifecycleGeneration",
  "maxBeforeAgentFinalizeRevisions",
  "model",
  "modelFallbacksOverride",
  "modelRegistry",
  "replyOperation",
  "requestedModelId",
  "resolvedApiKey",
  "runTimeoutOverrideMs",
  "runtimePlan",
  "sessionFile",
  "sessionTarget",
  "shouldEmitToolOutput",
  "shouldEmitToolResult",
  "skillsSnapshot",
  "suppressPromptPersistence",
  "toolAuthProfileStore",
  "userTurnTranscriptRecorder",
]);

const forwardedOptions = new Set(Object.keys(FORWARDED_HARNESS_OPTIONS));
const translatedOptions = new Set(TRANSLATED_HARNESS_OPTIONS);
const processLocalOptions = new Set(PROCESS_LOCAL_HARNESS_OPTIONS);

export function inspectHarnessEventContract(params) {
  const observed = Object.keys(params ?? {})
    .filter(
      (name) =>
        /^on[A-Z]/.test(name) && typeof params?.[name] === "function",
    )
    .sort();
  return {
    observed,
    bridged: observed.filter((name) => bridgedCallbacks.has(name)),
    gatewayOwned: observed.filter((name) => gatewayOwnedCallbacks.has(name)),
    unclassified: observed.filter(
      (name) =>
        !bridgedCallbacks.has(name) && !gatewayOwnedCallbacks.has(name),
    ),
  };
}

export function isBridgedHarnessEventCallback(name) {
  return bridgedCallbacks.has(name);
}

export function inspectHarnessOptionContract(params) {
  const observed = Object.keys(params ?? {})
    .filter(
      (name) =>
        !/^on[A-Z]/.test(name) &&
        params?.[name] !== undefined,
    )
    .sort();
  return {
    observed,
    forwarded: observed.filter(
      (name) =>
        forwardedOptions.has(name) &&
        typeof params?.[name] !== "function",
    ),
    translated: observed.filter((name) => translatedOptions.has(name)),
    processLocal: observed.filter((name) => processLocalOptions.has(name)),
    unclassified: observed.filter(
      (name) =>
        (forwardedOptions.has(name) &&
          typeof params?.[name] === "function") ||
        (!forwardedOptions.has(name) &&
          !translatedOptions.has(name) &&
          !processLocalOptions.has(name)),
    ),
  };
}

export function buildForwardedHarnessOptions(params) {
  return Object.fromEntries(
    Object.entries(FORWARDED_HARNESS_OPTIONS).flatMap(
      ([sourceName, targetName]) => {
        const value = params?.[sourceName];
        if (value === undefined || typeof value === "function") {
          return [];
        }
        return [[targetName, value]];
      },
    ),
  );
}
