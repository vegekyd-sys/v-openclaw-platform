export const HARNESS_EVENT_CONTRACT_VERSION = "openclaw-2026.9.1-v8";

// These are the canonical OpenClaw tool names that the official Codex Harness
// certifies in 2026.8.1. The isolated Worker adds no native tool surface and
// executes the same OpenClaw build/config overlay, so the same denies remain
// exact after the IPC handoff.
export const WORKER_CONVERSATION_TOOL_POLICY_SAFE_DENY_TOOLS = Object.freeze([
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

// These callbacks are asynchronous notifications. Their arguments and
// completion semantics can cross the Worker IPC boundary without changing the
// Agent's decision-making.
export const BRIDGED_HARNESS_EVENT_CALLBACKS = Object.freeze([
  "onActiveModelSelected",
  "onAgentEvent",
  "onAgentToolResult",
  "onAssistantErrorMessagePersisted",
  "onAssistantMessageStart",
  "onAttemptDeadlineChanged",
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
  "onUserMessagePersistenceInvalidated",
]);

// OpenClaw retains ownership of these lifecycle controls in the Gateway. They
// must not be recreated inside an isolated Worker.
export const GATEWAY_OWNED_HARNESS_CALLBACKS = Object.freeze([
  "onAttemptAbort",
  "onAttemptTimeout",
  "onAttemptTimeoutArmed",
  "onDeferredLifecycleAbort",
  "onDeferredLifecycleOwner",
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
  bootstrapWorkspaceDir: "bootstrapWorkspaceDir",
  bootstrapPromptWarningSignature:
    "bootstrapPromptWarningSignature",
  bootstrapPromptWarningSignaturesSeen:
    "bootstrapPromptWarningSignaturesSeen",
  chatType: "chatType",
  channelContext: "channelContext",
  chatId: "chatId",
  // OpenClaw 2.0 uses client capabilities to decide whether inline widgets
  // and other client-owned tools are part of the active tool surface.
  clientCaps: "clientCaps",
  clientTools: "clientTools",
  conversationToolPolicy: "conversationToolPolicy",
  conversationRoutePeerId: "conversationRoutePeerId",
  permissionMode: "permissionMode",
  contextEngineAgentId: "contextEngineAgentId",
  currentChannelId: "currentChannelId",
  currentInboundAudio: "currentInboundAudio",
  currentInboundContext: "currentInboundContext",
  currentInboundEventKind: "currentInboundEventKind",
  currentMessageId: "currentMessageId",
  currentMessagingTarget: "currentMessagingTarget",
  currentThreadTs: "currentThreadTs",
  cwd: "cwd",
  delegationCapability: "delegationCapability",
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
  // Availability is resolved once in the Gateway. Forward the boolean so the
  // Worker constructs the same GitHub identity/publish tools.
  githubPublicationAvailable: "githubPublicationAvailable",
  images: "images",
  imageOrder: "imageOrder",
  inputProvenance: "inputProvenance",
  internalEvents: "internalEvents",
  isCanonicalWorkspace: "isCanonicalWorkspace",
  isFinalFallbackAttempt: "isFinalFallbackAttempt",
  jobId: "jobId",
  memberRoleIds: "memberRoleIds",
  memoryFlushWritePath: "memoryFlushWritePath",
  modelSelectionLocked: "modelSelectionLocked",
  modelId: "model",
  modelRun: "modelRun",
  operation: "operation",
  ownerNumbers: "ownerNumbers",
  preserveUserFacingSessionModelState:
    "preserveUserFacingSessionModelState",
  pluginHarnessToolPolicyRestricted:
    "pluginHarnessToolPolicyRestricted",
  pluginHarnessToolPolicySafeDeniedTools:
    "pluginHarnessToolPolicySafeDeniedTools",
  promptCacheKey: "promptCacheKey",
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
  // OpenClaw 2026.9.1 gives scheduled runs a store-private runtime authority
  // envelope. The Gateway is still the authority owner; the isolated Worker is
  // only the continuation of that admitted run, so both fields must cross the
  // Harness handoff unchanged.
  scheduledRuntimeAuthority: "scheduledRuntimeAuthority",
  scheduledRuntimeAuthorityRecoveryRequired:
    "scheduledRuntimeAuthorityRecoveryRequired",
  scheduledToolPolicy: "scheduledToolPolicy",
  spawnedBy: "spawnedBy",
  startedAtMs: "startedAtMs",
  streamParams: "streamParams",
  streamReasoningInNonStreamModes: "streamReasoningInNonStreamModes",
  suppressAssistantErrorPersistence: "suppressAssistantErrorPersistence",
  suppressLiveStreamOutput: "suppressLiveStreamOutput",
  suppressNextUserMessagePersistence: "suppressNextUserMessagePersistence",
  skipPreparedUserTurnMessage: "skipPreparedUserTurnMessage",
  suppressTranscriptOnlyAssistantPersistence:
    "suppressTranscriptOnlyAssistantPersistence",
  swarmCollector: "swarmCollector",
  thinkLevel: "thinking",
  toolProgressDetail: "toolProgressDetail",
  toolResultFormat: "toolResultFormat",
  // This fingerprint gates tool-authority-aware prompt hooks. It is opaque,
  // JSON-safe and must remain identical across the Harness handoff.
  toolAuthorityFingerprint: "toolAuthorityFingerprint",
  toolsAllow: "toolsAllow",
  trigger: "trigger",
  trustedInternalHandoff: "trustedInternalHandoff",
  verboseLevel: "verbose",
  workspaceDir: "workspaceDir",
  runtimePluginToolGrant: "runtimePluginToolGrant",
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
  // Retained by the Gateway's native host-tool relay; never serialized.
  "messageActionTurnCapability",
  // Authorized native owner -> exact active Worker request -> native refresh.
  "permissionChange",
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
  "cleanupBundleMcpOnRunEnd",
  "config",
  "contextEngine",
  "contextTokenBudget",
  "contextWindowInfo",
  "cronCreatorAuthorityCapability",
  "crestodianTool",
  "deferTerminalLifecycle",
  "deferTerminalLifecycleEnd",
  "fallbackActive",
  "fallbackReason",
  // 2026.9.5 live plugin refresh: the Gateway's pending reload does not apply to
  // the Worker's own plugin runtime generation.
  "pluginRuntimeRefreshPending",
  "registerPluginRuntimeRefreshConsumer",
  "fastModeAuto",
  "fastModeAutoProgressState",
  "hasRepliedRef",
  "hostCapabilities",
  "initialReplayState",
  "isTurnTainted",
  "lifecycleGeneration",
  "maxBeforeAgentFinalizeRevisions",
  "model",
  "modelFallbacksOverride",
  "modelRegistry",
  "observeToolTerminal",
  "preparedModelRuntime",
  // Gateway chat.send supplies a closure that enriches webchat assistant media
  // transcript metadata. It captures Gateway-local reply state and cannot be
  // serialized into the Worker; Gateway delivery/finalization retains it.
  "prepareAssistantTranscriptMessage",
  "replyOperation",
  "requestedModelId",
  "resolvedApiKey",
  "runTimeoutOverrideMs",
  "runtimePlan",
  "sandbox",
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
