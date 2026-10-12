// gpt-live-projection-readiness-v1: admitted-voice-prompt
// gpt-live-voice-tool-order-v1: native-builtin
import {bundlePrepObserver} from "./bundle-prep-observer.mjs";
import { n as authorizeVlabNativePermission } from "./permission-change-D8FixpUS.js";
import { D as resolveExpiresAtMsFromDurationMs, F as resolveTimerTimeoutMs, g as isFutureDateTimestampMs, h as finiteSecondsToTimerSafeMilliseconds, m as clampTimerTimeoutMs, o as asDateTimestampMs, s as asFiniteNumber, v as parseDateFirstTimestampMs, w as parseStrictPositiveInteger, y as parseDateStringTimestampMs } from "./number-coercion-CLj0HTDM.js";
import { n as consumeRootOptionToken } from "./cli-root-options-BgX5QR_Z.js";
import { t as sanitizeForLog } from "./ansi-DrXAcdMD.js";
import { i as resolveGlobalSingleton } from "./global-singleton-Dc_stLtU.js";
import { c as getPluginMetadataSnapshotCache, f as withPluginCache } from "./plugin-cache-DGWspMEc.js";
import { r as extractBalancedJsonPrefix } from "./src-vebZIeLe.js";
import { l as toErrorObject } from "./error-coercion-CwcmpTBO.js";
import { t as expectDefined } from "./expect-CyE8FADM.js";
import { a as asOptionalRecord, c as isRecord, i as asOptionalObjectRecord } from "./record-coerce-DItp3I4t.js";
import { n as safeParseJsonRecord } from "./json-coercion-ighRFv8Y.js";
import { t as stableStringify } from "./stable-stringify-C8X7niaI.js";
import { c as normalizeOptionalLowercaseString, g as readStringValue, l as normalizeOptionalString, n as localeLowercasePreservingWhitespace, o as normalizeLowercaseStringOrEmpty, t as hasNonEmptyString } from "./string-coerce-CIXf7egm.js";
import { d as normalizeStringEntries, y as uniqueStrings } from "./string-normalization-DiSb4JeN.js";
import { n as sliceUtf16Safe, r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { c as resolveUserPath } from "./home-dir-BPhrG-aM.js";
import { t as createLazyImportLoader } from "./lazy-promise-DGqyc4Y4.js";
import { n as parseBooleanValue } from "./boolean-DmBL0YJK.js";
import { t as isFastTestRuntimeEnv } from "./test-runtime-env-DQDRzsLt.js";
import { n as isTruthyEnvValue } from "./env-UY9MQ9LW.js";
import { n as getRuntimeConfig } from "./io.runtime-CKu7Rw0j.js";
import { a as openRootFile } from "./boundary-file-read-uaJcf6X6.js";
import { n as appendRegularFile } from "./fs-safe-Cdu9fYG_.js";
import "./utils-D3A1hGii.js";
import { t as createAbortError$1 } from "./abort-signal-D2k14JsD.js";
import { t as sleep } from "./sleep-D7nua6TP.js";
import { t as pruneMapToMaxSize } from "./map-size-CNcWiFKu.js";
import { w as resolveStateDir } from "./paths-Dx1CjxA5.js";
import { n as isSecretValueRegisteredForRedaction } from "./secret-redaction-registry-BOLC6DkF.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { C as createChildDiagnosticTraceContext, D as freezeDiagnosticTraceContext, O as getActiveDiagnosticTraceContext, o as emitTrustedDiagnosticEvent, s as emitTrustedDiagnosticEventWithPrivateData, t as areDiagnosticsEnabledForProcess, w as createDiagnosticTraceContext } from "./diagnostic-events-D_BPObBj.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { r as isCloudModelRef } from "./model-catalog-refs-BdjEHOKQ.js";
import { o as measureDiagnosticsTimelineSpan } from "./diagnostics-timeline-H3aAUCYk.js";
import { t as isPromiseLike } from "./promise-like-D7-l5Fsp.js";
import { n as resolveCommitHash } from "./git-commit-CqBcu-JY.js";
import { t as VERSION } from "./version-CAQhhGAu.js";
import { lt as stripInboundMetadata } from "./openclaw-state-db-Bh3Bq87y.js";
import { d as stripHistoricalRuntimeContextCustomMessages, p as stripRuntimeContextCustomMessages, u as relocateCurrentRuntimeContextCarrierToTail } from "./internal-runtime-context-DWUZUDW2.js";
import { i as isSilentReplyPayloadText, n as SILENT_REPLY_TOKEN, o as isSilentReplyText } from "./tokens-DbeAFqg7.js";
import { i as resolvePolicyPluginActivationState, r as normalizePluginsConfigWithResolver } from "./manifest-registry-_ck0cJ4q.js";
import { i as cancelUnreadResponseBody } from "./http-body-C8wtGPZr.js";
import { a as loadPluginMetadataSnapshot } from "./plugin-metadata-snapshot-BuNx7zRZ.js";
import { l as resolveAgentContextLimits, u as resolveAgentDir } from "./agent-scope-config-CUiGBd59.js";
import { C as isCronRunSessionKey, T as isSubagentSessionKey } from "./session-key-CRjxKW0X.js";
import { n as isAutomationsToolName } from "./automations-tool-name-DBMZPbPL.js";
import { c as normalizeToolPolicyName, i as couldNormalizeToolNamePrefixToAllowedTool, o as isToolExecutionAllowed, s as normalizeToolList, t as TOOL_EXECUTION_GATED_MESSAGE } from "./tool-policy-shared-D_3SrG-g.js";
import { n as createToolPolicyMatcher, t as createRuntimeToolMatcher } from "./tool-policy-match-DS7InkLt.js";
import { t as assignSafeServerNames } from "./agent-bundle-mcp-names-CP3ugHLh.js";
import { d as toolPolicyRestrictsTools, u as replaceWithEffectiveToolAllowlist } from "./tool-policy-De2653Mj.js";
import { c as normalizeProviderId } from "./model-ref-shared-Dz7QU0Lx.js";
import { t as applyMergePatch } from "./merge-patch-BBmdu8Vh.js";
import "./defaults-CdX9UGcX.js";
import { s as resolveAgentExecutionContract, y as resolveSessionAgentIds } from "./agent-scope-CSlN0kZb.js";
import { F as splitShellArgs, P as hasTopLevelShellControlOperator } from "./shell-wrapper-resolution-CEP_cYxd.js";
import { Sm as projectChatErrorDetail } from "./src-B9mb84px.js";
import "./config-Cv60gBux.js";
import { c as resolveSecretSentinel, o as looksLikeSecretSentinel, s as mintSecretSentinel } from "./sentinel-ZgmfESkJ.js";
import { n as ensureGlobalUndiciDispatcherStreamTimeouts, r as ensureGlobalUndiciEnvProxyDispatcher, t as DEFAULT_UNDICI_STREAM_TIMEOUT_MS } from "./undici-global-dispatcher-Brb-sgtZ.js";
import { t as notifyListeners } from "./listeners-BogSNJ-R.js";
import { i as emitAgentEvent, n as captureAgentRunLifecycleGeneration, s as emitAgentRunOutputTokens } from "./agent-events-Con5xUCM.js";
import { d as getActivePluginRegistry, w as requireActivePluginRegistry, y as listImportedRuntimePluginIds } from "./runtime-MupoouIC.js";
import { p as readProviderJsonObjectResponse } from "./provider-http-errors-Bx1_sbMM.js";
import { a as getOrCreateSessionMcpRuntime } from "./agent-bundle-mcp-manager-api-Bk_6h3Rj.js";
import { r as readBundleJsonObject } from "./bundle-config-shared-DJtmbhVK.js";
import { i as loadEmbeddedAgentMcpConfig, t as loadSessionMcpConfig } from "./agent-bundle-mcp-runtime-config-BFss3qLd.js";
import { _ as resolveBlockMessage, t as getGlobalHookRunner } from "./hook-runner-global-DLqoAE5f.js";
import { u as resolveContextEngineOwnerPluginId } from "./registry-BdPa2vko.js";
import { a as getReplyPayloadMetadata, g as markReplyPayloadForSourceSuppressionDelivery, y as setReplyPayloadMetadata } from "./reply-payload-DahKk-7n.js";
import { r as stripToolResultDetails } from "./model-context-message-Dmngk3hL.js";
import { $ as consumeTrackedToolExecutionStarted, J as finalizeToolTerminalPresentation, K as isEmbeddedMode, Q as consumeStructuredReplaySafeToolCall, S as admitToolCallBatch, X as consumeAdjustedParamsForToolCall, Y as clearBatchAdmittedToolCallsForRun, Z as consumePreExecutionBlockedToolCall, c as recordStructuredReplayTrustForToolCall, et as peekAdjustedParamsForToolCall, l as rewrapToolWithBeforeToolCallHook, tt as peekPreExecutionBlockedToolCall, u as wrapToolWithBeforeToolCallHook } from "./agent-tools.before-tool-call-g2OT63u5.js";
import { n as normalizeMessageChannel } from "./message-channel-core-D0_xUNNr.js";
import { a as getOwnedSessionTranscriptInitialWriter, r as bindOwnedSessionTranscriptWrites, s as runWithOwnedSessionTranscriptWrite, t as SessionTranscriptWriterClaimReboundError, u as withOwnedSessionTranscriptWrites } from "./transcript-write-context-mhuh2Sos.js";
import { s as listRegisteredPluginAgentPromptGuidance } from "./command-registration-BTRvP9xA.js";
import { p as resolveProviderRuntimePluginHandle, r as getModelProviderRuntimePluginHandle } from "./provider-hook-runtime-CsaSWxqC.js";
import { t as describeProviderRequestRoutingSummary } from "./provider-attribution-CGOGO3H1.js";
import { d as resolveProviderRequestHeaders } from "./provider-request-config-BsyiChYr.js";
import { t as sanitizeForConsole } from "./console-sanitize-NjY4pEOW.js";
import { i as extractFailoverHttpStatus, n as isTerminalAssistantError, o as isProviderRefusalAssistantError } from "./retry-D8sSkt2R.js";
import { m as PROVIDER_CONTEXT_HANDOFF } from "./llm-Bnf7lhlE.js";
import { a as resolveToolCallArgumentsEncoding, n as extractModelCompat } from "./provider-model-compat-C3R5Y-Pj.js";
import { a as createStreamIteratorWrapper, i as wrapStreamFnTextTransforms } from "./text-transforms.runtime-DyFXfKZV.js";
import { D as resolveProviderTextTransforms, E as resolveProviderSystemPromptContribution, F as transformProviderSystemPrompt, v as resolveProviderCacheTtlEligibility } from "./provider-runtime-BqO0YRlw.js";
import { At as resolveCompactionInstructions, Ft as stripStaleAssistantUsageBeforeLatestCompaction, Q as wrapToolDefinition, Z as createToolDefinitionFromAgentTool, a as recordSessionModelUsage, h as retireQueuedUserMessage, i as agentSessionSetContextReplacementHook, jt as sanitizeCompactionReplayMessages, l as agentSessionSetPromptPreparation, m as subscribeSteeringMessagePersistenceFailure, o as setSessionModelUsageSink, p as getSteeringMessageIdentity, s as createSessionManagerRuntimeRegistry, tt as SettingsManager } from "./sessions-CHgQo4vL.js";
import { a as hasNonzeroUsage, c as normalizeUsage, o as hasObservedModelUsage, r as deriveSessionTotalTokens, s as makeZeroUsageSnapshot } from "./usage-CtmV8Xxq.js";
import { a as attachInternalToolExecutionPreparer, f as getInternalToolExecutionPreparer, i as attachInternalToolBatchLifecycle, l as copyInternalToolResultState } from "./internal-hooks-CiSltLvS.js";
import { C as formatFileOperations, F as COMPACTION_SUMMARY_PREFIX, I as COMPACTION_SUMMARY_SUFFIX, L as bashExecutionToText, N as BRANCH_SUMMARY_PREFIX, P as BRANCH_SUMMARY_SUFFIX, a as SUMMARY_TRUNCATED_MARKER, c as capCompactionSummary, k as buildSessionContext, o as TURN_PREFIX_SUMMARIZATION_PROMPT, r as MAX_COMPACTION_SUMMARY_CHARS, v as MAX_FILE_OPS_SECTION_CHARS, y as computeFileLists } from "./compaction-DlElLXrZ.js";
import { t as buildGuardedModelFetch } from "./provider-transport-fetch-NIYC8sLd.js";
import { r as MAX_IMAGE_BYTES } from "./constants-DUxuqQz8.js";
import { t as event_stream_exports } from "./event-stream-CPdae0II.js";
import { r as classifyToolUseResultPairing } from "./tool-result-pairing-B40RoFjc.js";
import { a as isSessionContextMetadataEntry } from "./session-manager-codec-CaIkXyYs.js";
import { r as isCloudCodeAssistFormatError } from "./classify-Dm9sTbZz.js";
import { n as isTransientNetworkError } from "./retryable-network-errors-D2gJmBqw.js";
import { i as wrapUntrustedPromptDataBlock } from "./sanitize-for-prompt-C5q9LjmF.js";
import { f as readPersistedMediaFacts, n as attachRuntimePromptMediaFacts } from "./media-facts-CN7USs9i.js";
import { t as findCodeRegions } from "./code-regions-BkSwgSvI.js";
import { t as parseInlineDirectives } from "./directive-tags-BAfDHbTb.js";
import { c as isCodeModeExecTool, n as CODE_MODE_WAIT_TOOL_NAME, t as CODE_MODE_EXEC_TOOL_NAME, u as normalizeCodeModeExecBeforeHookParams } from "./code-mode-control-tools-E097WPds.js";
import { H as readNestedToolActivity, R as redactTranscriptMessage, V as projectNestedToolActivityForHooks, Y as wrapStreamFnCodeModeSource, z as createNestedToolActivity } from "./session-accessor.sqlite-transcript-store-DV0WFe1a.js";
import { r as hasOnlyAssistantReasoningContent } from "./ai-transport-runtime-host-BCAHK6CH.js";
import { c as hasCopilotVisionInput, o as buildCopilotDynamicHeaders } from "./copilot-dynamic-headers-C42FH9jo.js";
import { r as buildStreamErrorAssistantMessage } from "./stream-message-shared-Cyrn1UHN.js";
import { a as sanitizeToolCallIdsForCloudCodeAssist, n as extractToolResultId, o as isThinkingLikeBlock, r as extractToolResultIds, t as extractToolCallsFromAssistant } from "./tool-call-id-bBWjBMFi.js";
import { a as sanitizeToolUseResultPairingForModel, i as sanitizeToolUseResultPairing, n as repairToolUseResultPairing } from "./session-transcript-repair-B7Xnkp41.js";
import { t as isDeliverableMessageChannel } from "./message-channel-normalize-DzpgR6ro.js";
import "./message-channel-BGKf9KPa.js";
import { n as emitSessionTranscriptUpdate } from "./transcript-events-BMaG3A_w.js";
import { Et as readActiveTranscriptEntryAnchor } from "./session-accessor-K0XuW6ln.js";
import { a as parseAssistantTextSignature, s as resolveAssistantMessagePhase } from "./chat-message-content-Dws_XUEQ.js";
import { c as isTranscriptOnlyOpenClawAssistantMessage } from "./transcript-only-openclaw-assistant-DPLRJnG4.js";
import { t as SessionManager } from "./session-manager-CNTG_BAJ.js";
import { t as decodeHtmlEntities } from "./html-entities-CvDVeY8C.js";
import { n as ToolInputError } from "./tool-input-error-mjW74R8m.js";
import { n as textResult } from "./tool-results-BCM3fdVS.js";
import "./common-BhOX6DcU.js";
import { c as estimateToolResultTextChars, i as resolveLiveToolResultMaxChars, o as resolveToolResultContextMaxChars } from "./tool-result-limits-DdMvF_Ec.js";
import { n as normalizeGoogleApiBaseUrl } from "./google-api-base-url-UBNiBOzj.js";
import { n as readWorkspaceBootstrapFile, t as MAX_WORKSPACE_BOOTSTRAP_FILE_BYTES } from "./workspace-bootstrap-read-CUL2d6SJ.js";
import { g as isWorkspaceBootstrapPending, n as DEFAULT_BOOTSTRAP_FILENAME, t as DEFAULT_AGENTS_FILENAME } from "./workspace-BFk42BX6.js";
import { f as prepareMemoryPromptSection } from "./memory-state-D4Yq0L6U.js";
import { r as resolveImageSanitizationLimits } from "./image-sanitization-DhkMOJXD.js";
import { a as buildHistoryPrunePlan, i as SUMMARIZATION_OVERHEAD_TOKENS, l as computeAdaptiveChunkRatio, n as MIN_CHUNK_RATIO, r as SAFETY_MARGIN, t as BASE_CHUNK_RATIO } from "./compaction-planning-Bs5xHiby.js";
import { o as resolveModelAuthMode } from "./model-auth-BBgoS_xI.js";
import "./model-selection-DG2dN6VK.js";
import { l as recordSessionCompacted } from "./session-state-events-BIoqMlY_.js";
import { f as projectAgentRunAttemptTerminal, o as classifyAgentRunTerminalOutcome, p as setAgentRunAttemptTerminalFailure, r as buildAgentRunTerminalOutcomeFromAttempt, u as mergeAgentRunAttemptTerminal } from "./agent-run-terminal-outcome-CyRezSup.js";
import { o as isSignalTimeoutReason } from "./error-Crg6nsju.js";
import { c as createAgentRunRestartAbortError, f as isAgentRunRestartAbortReason, i as AGENT_RUN_RESTART_ABORT_STOP_REASON, l as createAgentRunSupersededAbortError } from "./run-termination-Ts9RsbeN.js";
import { c as isTerminalTaskStatus } from "./task-registry-activity-DSlVVJwD.js";
import { n as extractTextFromChatContent, t as coerceChatContentText } from "./chat-content-DNdfeXZh.js";
import { a as projectScrubbedPlainTextToolCallMessage, i as normalizePlainTextToolCallStreamEvents, n as createPromotedPlainTextToolCallEvents, r as projectStandalonePlainTextToolCallMessage } from "./src-BJOM18av.js";
import { _ as trimTextFilter, b as findFinalTagMatches, l as stripDowngradedToolCallText, m as createTextProjection, v as hasOrphanReasoningCloseBoundary } from "./assistant-visible-text-DBzvFcBX.js";
import { k as parseExecApprovalResultText, m as renderAuthProfileFailoverCopy } from "./user-copy-BLzGKYoR.js";
import { n as countStreamingFileMutationLines, t as resolveFileMutationToolName } from "./tool-mutation-names-BalpObx-.js";
import { c as listTasksForOwnerOrRequesterSessionKeyForStatus, n as findTaskByRunIdForStatus } from "./task-status-access-BL-VaEOd.js";
import { n as resolveAgentTimeoutMs } from "./timeout-Dm7mxETK.js";
import { t as hasPromptImageInput } from "./prompt-image-input-D9m64odM.js";
import { a as ACTIVE_EMBEDDED_RUNS_BY_RUN_ID, h as setActiveEmbeddedRunLifecycleGeneration, i as ACTIVE_EMBEDDED_RUNS } from "./run-state-DklzSa7D.js";
import { d as markDiagnosticRunProgress, n as closeDiagnosticEmbeddedRunOwner, r as createDiagnosticEmbeddedRunOwner } from "./diagnostic-run-activity-DLw8ESkx.js";
import { x as resolveCompactionTimeoutMs } from "./diagnostic-CN79G-MT.js";
import { D as setActiveEmbeddedRun, h as markActiveEmbeddedRunAbandoned, k as updateActiveEmbeddedRunSnapshot, r as clearActiveEmbeddedRun } from "./runs-5WnDPZ0V.js";
import { s as resolveAdmittedRunActiveAssertion } from "./admitted-run-context-DO5gB_Jz.js";
import { i as getPluginToolSideEffectOwnerKey, r as getPluginToolMeta } from "./tool-metadata-B4LwDu-h.js";
import { c as getChannelAgentToolMeta, r as copyAgentToolMetadata, v as isToolWrappedWithBeforeToolCallHook } from "./agent-tool-metadata-CkrU8K-F.js";
import { o as hasReplyPayloadContent } from "./payload-DYE7bQ2k.js";
import { u as stripHeartbeatToken } from "./heartbeat-ofet59jF.js";
import "./reply-payload-y5EgUJuZ.js";
import { a as resolveSendableOutboundReplyParts } from "./reply-payload-parts-ntRzlUkv.js";
import { r as resolveSessionPermissionExecMode } from "./session-permission-exec-mode-CJHB47SR.js";
import "./tool-fs-policy-BVa4xTTT.js";
import { n as getAgentScopedMediaLocalRoots } from "./local-roots-BUVPtC1p.js";
import { i as scanFenceSpans } from "./fences-DtD_oijY.js";
import { n as splitMediaFromOutput } from "./parse-BBcvTVAd.js";
import { t as parseReplyDirectives } from "./reply-directives-CgnjbVSt.js";
import { a as normalizeOpenAIResponsesToolCallIds, g as classifyAssistantFailoverReason, i as downgradeOpenAIReasoningBlocks, r as downgradeOpenAIFunctionCallReasoningPairs, u as formatUserFacingAssistantErrorText } from "./embedded-agent-helpers-CzpaLpCq.js";
import { n as resolveSandboxRuntimeStatus } from "./runtime-status-hcw0I7bE.js";
import { i as normalizeTextForComparison, r as isMessagingToolDuplicateNormalized } from "./media-reference-comparison-DpA8NCy-.js";
import { C as isZeroUsageEmptyStopAssistantTurn, F as shouldRunLlmOutputHooksForAttempt, I as MidTurnPrecheckSignal, L as isMidTurnPrecheckSignal, N as resolveAttemptStreamAuthProfileId, P as resolveAttemptToolPolicyMessageProvider, R as validateAnthropicTurns, T as hasPersistedMedia, _ as selectCompactionTimeoutSnapshot, a as prepareEmbeddedAttemptHistory, b as normalizeAssistantReplayContent, c as resolveAttemptTranscriptPolicy, d as flushSessionManagerTranscript, f as normalizeCompactionRecoveryTranscriptTail, g as resolveRunTimeoutDuringCompaction, h as resolveExistingAttemptTranscriptState, i as hasNonBlankUserText, l as resolveUserTranscriptMessages, m as resolveAttemptTrajectorySessionFile, n as pruneProcessedHistoryImages, o as projectPersistedSenderContext, p as removeTrailingMidTurnPrecheckAssistantError, r as findActiveUserMessageIndex, s as readFirstUserText, t as installHistoryImagePruneContextTransform, u as splitLeadingTimestampEnvelope, v as shouldFlagCompactionTimeout, y as isRunnerToolCallBlockType, z as validateGeminiTurns } from "./history-image-prune-Dg0CDQ4a.js";
import "./failover-error-B46Ke6VT.js";
import { t as buildProviderAuthRecoveryHint } from "./provider-auth-recovery-hint-BanRJq49.js";
import { l as isMainSessionRestartRecoveryInputProvenance, r as annotateInterSessionPromptText } from "./input-provenance-CCQsDhUy.js";
import { r as diagnosticErrorMessage, t as diagnosticErrorCategory } from "./diagnostic-error-metadata-qnHBNuqn.js";
import { n as resolveDiagnosticModelContentCapturePolicy } from "./diagnostic-llm-content-CAc71KJ1.js";
import { i as REQUIRED_PARAM_GROUPS } from "./agent-tools.before-tool-call.decision-is7VdQQC.js";
import { o as readToolResultDetails, r as isToolResultError, t as consumeTrustedToolNoStartError } from "./tool-result-error-d_ya2-bv.js";
import { t as buildToolMutationState } from "./tool-mutation-7Z6dWuA8.js";
import { d as isMessagingToolSendAction, f as isMessagingToolTargetEvidenceAction, l as isMessagingTool, n as hashToolCall, p as isPluginNativeMessagingTool } from "./tool-loop-detection-DDziM3KH.js";
import { a as buildAgentHarnessQuestionPromptPayload, n as claimPendingAgentQuestionAnswer, t as cancelPendingAgentQuestionForSession } from "./gateway-question-zNwI_gOV.js";
import { C as cancelAskUserPromptDelivery, D as waitForAskUserPromptReady, E as settleAskUserPromptDelivery, O as normalizeAskUserParams, S as resolveWorkspaceBootstrapRouting, T as reserveAskUserPromptDelivery, b as normalizeSecretsRequestParams, g as isDeliveredCoreCurrentChannelWidgetResult, x as isPrimaryBootstrapRun, y as readEmbeddedMessageDeliveryFact } from "./openclaw-tools-BODVdJQD.js";
import { i as isCommandBearingToolCall, r as inferToolMetaFromArgsCore } from "./tool-display-DcyA1OkC.js";
import { t as formatToolAggregate } from "./tool-meta-DppcqMvL.js";
import { D as TOOL_SEARCH_CODE_MODE_TOOL_NAME, E as TOOL_DESCRIBE_RAW_TOOL_NAME, O as TOOL_SEARCH_CONTROL_TOOL_NAMES, T as TOOL_CALL_RAW_TOOL_NAME, d as buildToolSchemaDirectoryPrompt, f as resolveToolSearchCatalogTool, i as resolveLocalModelLeanPreserveToolNames, k as TOOL_SEARCH_RAW_TOOL_NAME, n as filterLocalModelLeanTools, o as messageToolOwnsVisibleReply, r as isLocalModelLeanEnabled, s as addClientToolsToToolSearchCatalog, v as clearToolSearchCatalog, x as createToolSearchCatalogRef, y as collectUniqueCatalogToolNames } from "./local-model-lean-DItPoOX_.js";
import { t as isHeartbeatLifecycleRunKind } from "./bootstrap-mode-HvSedbJl.js";
import { t as resolveConversationCapabilityProfile } from "./conversation-capability-profile-C6DysC6l.js";
import { a as markCoreTtsAttemptResult, i as getCoreTtsToolResultMediaUrls } from "./tool-runtime-config-C1d_lekC.js";
import { n as OPENCLAW_EMBEDDED_CONTEXT_ENGINE_HOST, r as assertContextEngineHostSupport } from "./host-compat-xESS3bi6.js";
import { t as createBundleLspToolRuntime } from "./agent-bundle-lsp-runtime-C3Wh5JbW.js";
import { o as readMcpAppChannelView } from "./mcp-ui-resource-C9t16eWh.js";
import { r as materializeBundleMcpToolsForRun } from "./agent-bundle-mcp-materialize-DlD9AJQW.js";
import "./agent-bundle-mcp-tools-B8DYsLEh.js";
import { t as AgentRunTerminalOutcomeError } from "./agent-run-terminal-error-BLySVFXs.js";
import { i as isAgentToolRestartSafe, n as collectSideEffectToolOwners, r as isAgentToolReplaySafe, t as collectReplaySafeToolNames } from "./tool-replay-safety-C5V4FS5g.js";
import { i as toolEffectStateProvesNoEffect, r as registerToolEffectReceipt, t as buildToolEffectReceipt } from "./tool-effect-receipt-CfDqSrlt.js";
import { t as log$5 } from "./logger-DEXeM7Jh.js";
import { a as mapSandboxSkillUsagePaths, i as mapSandboxSkillEntriesForPrompt, n as resolveEmbeddedRunSkillEntries, o as remapSkillReferencePaths, r as createSandboxPromptEntryLoader, s as resolveSandboxSkillRuntimeInputs } from "./runtime-capabilities-CA_W9E4G.js";
import { a as buildBootstrapTruncationReportMeta, i as buildBootstrapPromptWarningNotice, n as buildBootstrapBudgetState, r as buildBootstrapInjectionStats } from "./bootstrap-budget-dkgCaiAi.js";
import { c as resolveContextInjectionMode, i as makeBootstrapWarn, n as buildBootstrapContextForFiles, r as hasCompletedBootstrapTurn, s as resolveBootstrapFilesForRun, t as FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE } from "./bootstrap-files-CHsP1LeZ.js";
import { a as finalizeHarnessContextEngineTurn, c as runContextEngineMaintenance, n as bootstrapHarnessContextEngine, u as buildContextEngineRuntimeSettings } from "./context-engine-lifecycle-ByaDgAjJ.js";
import { n as redactConfigObject } from "./redact-snapshot-CGYV5Rse.js";
import { t as isAcpRuntimeSpawnAvailable } from "./availability-Te9b3KLs.js";
import { n as resolveSkillsPrompt } from "./workspace-skill-prompt-DbEIZHQJ.js";
import { n as applySkillEnvOverridesFromSnapshot, t as applySkillEnvOverrides } from "./env-overrides-Dx_c_mal.js";
import { T as resolveCodeModeSkills } from "./code-mode-state-C0KMR0dP.js";
import { n as resolveSandboxContext } from "./context-CTkU5pfN.js";
import "./sandbox-ejCqp821.js";
import { n as invalidateComputerFrameIfMissing } from "./computer-tool-oapSsIgu.js";
import { C as isAnthropicFamilyCacheTtlEligible, b as isCodeModeDiagnosticEnabled, s as createCodexNativeWebSearchWrapper, w as isAnthropicModelRef, x as logCodeModeDiagnostic } from "./proxy-DdZecu4V.js";
import { a as resolvePreparedExtraParams, n as resolveAgentTransportOverride, o as isGooglePromptCacheEligible, r as resolveExplicitSettingsTransport, s as resolveCacheRetention, t as applyExtraParamsToAgent } from "./extra-params-CAyBBhON.js";
import { _ as stripThinkingBlocksFromMessage, a as resolveLiveToolResultAggregateMaxChars, c as truncateOversizedToolResultsInMessages, d as truncateToolResultText, f as assessLastAssistantMessage, i as resolveCacheTtlPruningSettings, l as truncateOversizedToolResultsInSessionManager, m as dropThinkingBlocks, n as pruneExpiredCacheTtlToolResults, p as dropReasoningFromHistory, r as reconcileToolResultPromptProjectionState, s as toolResultWarningDedupe, u as truncateToolResultMessage, v as wrapAnthropicStreamWithRecovery, y as formatContextLimitTruncationNotice } from "./tool-result-truncation-DChflbwq.js";
import { A as shouldPreemptivelyCompactBeforePrompt, E as buildPrePromptContextBudgetStatus, M as summarizeInStages, N as computeAdaptiveChunkRatioWithWorker, T as PREEMPTIVE_OVERFLOW_ERROR_TEXT, b as mergeUsageIntoAccumulator, d as resolveFinalAssistantVisibleText, g as resolveReportedModelRef, j as resolveContextWindowTokens, k as formatPrePromptPrecheckLog, u as resolveFinalAssistantRawText, v as createUsageAccumulator, w as shouldAllowProviderOwnedThinkingReplay, x as toNormalizedUsage } from "./helpers-BTOsl-oB.js";
import { t as rewriteTranscriptEntriesInSessionManager } from "./transcript-rewrite-OzncwtgK.js";
import { n as mapThinkingLevelForProvider, t as mapThinkingLevel } from "./utils-CefVZRZM.js";
import { a as prependSystemPromptAddition, c as resolvePromptBuildHookResult, i as mergeOrphanedTrailingUserPrompt, l as resolvePromptModeForSession, n as buildAfterTurnRuntimeContextFromUsage, o as resolveAttemptFsWorkspaceOnly, s as resolveAttemptMediaTaskSystemPromptAddition, t as buildAfterTurnRuntimeContext, u as shouldWarnOnOrphanedUserRepair, v as listActiveProcessSessionReferences } from "./attempt-prompt-helpers-D26p8wCr.js";
import { t as resolveProcessToolScopeKey } from "./bash-process-scope-Bmw8_ghL.js";
import { a as resolveContextWindowInfo } from "./context-window-guard-DH1sCTPA.js";
import { r as buildLateMediaAttachedProjection } from "./user-turn-transcript-sTfkLnbR.js";
import { o as normalizeHeartbeatToolResponse } from "./heartbeat-tool-response-B4VYc0rg.js";
import { t as filterHeartbeatTranscriptArtifacts } from "./heartbeat-filter-D8ksZ4Uk.js";
import { n as resolveHeartbeatSummaryForAgent } from "./heartbeat-summary-_n0hwz8v.js";
import { O as prependAgentSteeringPrompt, T as settleRequesterAfterSessionSpawns, h as markRequesterTurnYielded, p as leasePendingAgentSteeringItems, t as ackPendingAgentSteeringItems, y as releasePendingAgentSteeringItems } from "./subagent-registry-C24yr_PF.js";
import { t as guardSessionManager } from "./session-tool-result-guard-wrapper-cNIJYD6J.js";
import { a as materializeProviderContext, n as detectAndLoadPromptImages, t as buildPromptImageFailureNotice } from "./images-DP3ShcTV.js";
import { n as wrapToolWithAbortSignal, t as raceWithAbortSignal } from "./agent-tools.abort-D_hMKwN4.js";
import { n as normalizeAgentRuntimeTools, t as logAgentRuntimeToolDiagnostics } from "./tools-CJTkJCkD.js";
import { n as filterRuntimeCompatibleTools } from "./tool-schema-projection-ZrMdwk4s.js";
import { r as recordPersistedRuntimeToolSchemaQuarantine, t as clearRecoveredPersistedRuntimeToolSchemaQuarantines } from "./tool-schema-quarantine-health-CZirUBy9.js";
import { n as captureFinalEffectiveCronCreatorToolAllowlist } from "./cron-tool-CPu6etIM.js";
import { t as applyFinalEffectiveToolPolicy } from "./effective-tool-policy-DzzdB1dL.js";
import { a as shouldCreateBundleMcpRuntimeForAttempt, i as shouldCreateBundleLspRuntimeForAttempt, r as resolveEmbeddedAttemptToolConstructionPlan, t as applyEmbeddedAttemptToolsAllow } from "./attempt-tool-construction-plan-DimMQ5FS.js";
import { i as joinWithRunLivenessDeadline, n as abortable, r as isOpenClawAbortableWrapper, t as RUN_LIVENESS_JOIN_TIMEOUT_MS } from "./abortable-Qj1NGocu.js";
import { r as resolveOsSummary } from "./os-summary-B440lihS.js";
import { a as sanitizeSupportSnapshotValue, t as redactPathForSupport } from "./diagnostic-support-redaction-BJV7UdpW.js";
import { n as resolveControlUiSessionLinkBase } from "./control-ui-link-base-CUjuJWdQ.js";
import { d as parseInteractiveParam, f as parseJsonMessageParam } from "./message-action-normalization-DvaAS7eQ.js";
import { a as extractMessagingToolSend, c as isDeliveredMessagingToolSendToCurrentSource, i as filterToolResultMediaUrls, n as collectMessagingMediaUrlsFromToolResult, o as extractMessagingToolSendResult, r as extractToolResultMediaArtifact, s as extractMessagingToolSourceReplyPayload, t as collectMessagingMediaUrlsFromRecord } from "./embedded-agent-tool-media-DM4yAhSa.js";
import { n as runBestEffortCallback, t as createAgentToolResultMiddlewareRunner } from "./tool-result-middleware-BRQpW6IK.js";
import { n as normalizeProgressCardInput, t as ProgressCardInputError } from "./progress-card-input-Q8Laz9Z6.js";
import { a as extractToolResultText, c as sanitizeToolResult, i as extractToolErrorMessage, l as truncateLiveExecOutput, n as capLiveExecResult, o as isToolResultTimedOut, r as extractToolErrorCode, s as sanitizeToolArgs, t as buildToolLifecycleErrorResult, u as collectTextContentBlocks } from "./embedded-agent-tool-results-CVPRsDJK.js";
import { n as hasCompletionMessageSessionSpawn, r as normalizeAcceptedSessionSpawnResult, t as hasAcceptedSessionSpawn } from "./accepted-session-spawn-CUc_zZp_.js";
import { a as resolveMessageToolSourceReplyFinal, i as readMessageToolSourceReplyText, n as isDeliveredMessageToolOnlySourceReplyResult, r as isDeliveredMessagingToolResult } from "./embedded-agent-message-tool-source-reply-y2DKGp6z.js";
import { i as summarizeToolValidationError, t as createToolValidationErrorSummary } from "./tool-error-summary-Bw_A4yhp.js";
import { n as buildAgentHookContextIdentityFields, t as buildAgentHookContextChannelFields } from "./hook-agent-context-AZc1TY6C.js";
import { i as runAgentHarnessBeforeAgentFinalizeHook } from "./lifecycle-hook-helpers-BOml2WGl.js";
import { n as runAgentEndSideEffects } from "./agent-end-side-effects-CdQsfPRo.js";
import { a as buildEmbeddedAttemptToolRunContext, n as projectSettledTurnFinalizationAttemptResult, o as runAgentCleanupStep, s as buildEmbeddedAgentEndContext } from "./settled-turn-finalization-result-CMozbVaG.js";
import { i as shouldPersistCompletedBootstrapTurn, n as composeSystemPromptWithHookContext, r as resolveAttemptSpawnWorkspaceDir, t as appendAttemptCacheTtlIfNeeded } from "./attempt-thread-helpers-0IFbjVTa.js";
import { a as extractAssistantThinking, c as extractThinkingFromTaggedStream, d as isAssistantMessage, f as promoteThinkingTagsToBlocks, i as extractAssistantCommentaryText, l as extractThinkingFromTaggedText, n as createAssistantVisibleStreamText, o as extractAssistantVisibleText, r as createThinkingTagStreamState, s as extractEmbeddedAssistantText, t as THINKING_TAG_SCAN_RE } from "./embedded-agent-utils-CfXfPN8t.js";
import { n as claimHeartbeatOutcomeForRun, t as buildHeartbeatOutcomeContext } from "./heartbeat-outcome-store-BoT9c8Af.js";
import { I as streamWithPayloadPatch } from "./provider-stream-shared-BmB0vX9b.js";
import { i as resolveEmbeddedAgentStream, n as resolveEmbeddedAgentApiKey, r as resolveEmbeddedAgentBaseStreamFn, t as wrapStreamFnWithDiagnosticModelCallEvents } from "./attempt.model-diagnostic-events-B4dGIs0S.js";
import { a as appendModelIdentitySystemPrompt, c as buildProjectMemoryWriteInstruction, i as buildConfiguredAgentSystemPrompt, l as prepareProjectMemoryBootstrap, o as buildModelIdentityPromptLine, s as resolveAgentPromptSurfaceForSessionKey } from "./system-prompt-params-B645JcX8.js";
import { o as resolveUserTimezone, r as formatDateStamp } from "./date-time-C7YbYLih.js";
import { n as prepareWatchedSessionsPrompt } from "./watched-sessions-prompt-C9QfwkEy.js";
import { a as hasSessionUserTurnBeenSent, i as getEmbeddedSessionPromptState, n as cloneToolResultPromptProjectionState, o as markSessionUserTurnsSent } from "./session-prompt-state-D-1ZVLzo.js";
import { r as formatZonedTimestamp } from "./format-datetime-xsAchuLA.js";
import { t as safeJsonStringify } from "./safe-json-CY5cd4H1.js";
import { n as toTrajectoryToolDefinitions, t as createTrajectoryRuntimeRecorder } from "./runtime-gmrQ9kJS.js";
import { c as consumeCodeModePermissionChangeResult, d as observeAgentRunApprovalWait, f as createAgentHarnessPromptToolPolicy, i as createCodeModeTools, l as consumeRepairableCodeModeFailure, n as resolveAgentToolSurfacePlan, r as addClientToolsToCodeModeCatalog, t as applyAgentToolSurfaceCatalog, u as createCodeModePermissionChangeReason } from "./tool-surface-plan-AIoygKeT.js";
import { n as buildRuntimeContextCustomMessage, r as resolveRuntimeContextPromptParts, t as buildCurrentInboundPrompt } from "./runtime-context-prompt-C4g4HpuA.js";
import { c as hasCommittedMessagingToolDeliveryEvidence, f as hasCompletedMessagingToolDeliveryEvidence, h as hasMessagingToolDeliveryEvidence } from "./delivery-evidence-BDLYyuib.js";
import { t as TOOL_FAILURE_INSTRUCTION } from "./tool-outcome-instructions-D1-OxlK6.js";
import { t as registerProviderStreamForModel } from "./provider-stream-mYQ5hZ36.js";
import { t as EmbeddedBlockChunker } from "./embedded-agent-block-chunker-C_UhVcqR.js";
import { b as shouldSuppressRawErrorConsoleSuffix, v as buildApiErrorObservationFields, y as buildTextObservationFields } from "./model-fallback-attempt-C1x1isxV.js";
import { n as splitTrailingDirective, t as createStreamingDirectiveAccumulator } from "./streaming-directives-DZhFOUoU.js";
import { i as markdownToIR } from "./construct-fallbacks-Dm1zYKXg.js";
import { l as collectAgentInternalEventMedia } from "./subagent-announce-delivery-Dosep7Zr.js";
import { t as redactAgentDiagnosticPayload } from "./diagnostic-redaction-BIjxlEzw.js";
import { a as resolveEffectiveCompactionMode, i as isSilentOverflowProneModel, n as applyAgentAutoCompactionGuard, r as applyAgentCompactionSettingsFromConfig } from "./agent-settings-ByZET7b8.js";
import { a as toToolDefinitions, i as toClientToolDefinitions, n as findClientToolNameConflicts, t as createClientToolNameConflictError } from "./agent-tool-definition-adapter-DTKE-8cz.js";
import { r as createAgentSessionForEmbeddedRunner, t as createEmbeddedAgentResourceLoader } from "./resource-loader-DffsEf4_.js";
import { n as resolveCronStyleNow } from "./current-time-Cwxy-JQb.js";
import { n as isQueryStopWordToken, t as extractKeywords } from "./query-expansion-_C4ftD-k.js";
import { t as createOpenClawCodingTools } from "./agent-tools-djVuP1H1.js";
import { c as createSkillInstructionDeliveryCache, t as resolveToolLoopDetectionConfig } from "./tool-loop-detection-config-Dftl-DTD.js";
import { n as supportsModelTools, t as buildModelToolsUnavailablePrompt } from "./model-tool-support-DIQSEumC.js";
import { t as splitSdkTools } from "./tool-split-5yAD9NUS.js";
import { a as isReasoningTagProvider, i as resolveAgentRuntimePrompt, r as resolveEmbeddedSandboxInfoExecPolicy, t as buildEmbeddedSandboxInfo } from "./sandbox-info-CKYFT0dt.js";
import { r as resolveOpenClawReferencePaths } from "./docs-path-CPTK1h9K.js";
import { t as buildSystemPromptReport } from "./system-prompt-report-CrMih5l7.js";
import { o as resolveStagedInputMediaPaths } from "./staged-inputs-DiEy2FTv.js";
import { n as resolveAgentRunSessionTarget } from "./run-session-target-D4dx7X-Q.js";
import { t as runHostPreparedIsolatedCompletion } from "./host-prepared-isolated-completion-C4RxylJz.js";
import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import fs$1 from "node:fs/promises";
import crypto$1, { randomUUID } from "node:crypto";
import { Type } from "typebox";
import { Buffer as Buffer$1 } from "node:buffer";
import { responsesPromptObserver } from "@openclaw/ai/internal/openai";
import { CompactionReplayRefreshRequiredError, mergeTransportHeaders, replaceCompactionReplayOwnerContent, resolveCompactionReplayEligibility, sanitizeTransportPayloadText, stripCompactionReplayCheckpoint, stripCompactionReplayCheckpointInPlace } from "@openclaw/ai/transports";
import { onLlmRequestActivity, parseStreamingJson } from "@openclaw/ai/internal/runtime";
import { SYSTEM_PROMPT_CACHE_BOUNDARY, ensureSystemPromptCacheBoundary, sanitizeSurrogates, sortPromptCacheToolsByName, splitSystemPromptCacheBoundary, stripSystemPromptCacheBoundary } from "@openclaw/ai/internal/shared";
import { OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH } from "@openclaw/ai/providers";
import { setImmediate as setImmediate$1 } from "node:timers/promises";
//#region src/agents/embedded-agent-runner/compact-reasons.ts
/**
* Normalizes and classifies compaction failure reasons for diagnostics.
*/
const MAX_COMPACTION_REASON_DETAIL_CHARS = 100;
const COMPACTION_PROVIDER_4XX = /* @__PURE__ */ new Set([
	400,
	401,
	403,
	429
]);
const COMPACTION_PROVIDER_5XX = /* @__PURE__ */ new Set([
	500,
	502,
	503,
	504
]);
const DEFERRED_CONTEXT_ENGINE_COMPACTION_REASON = "deferred to background context-engine maintenance";
function isGenericCompactionCancelledReason(reason) {
	const normalized = normalizeLowercaseStringOrEmpty(reason);
	return normalized === "compaction cancelled" || normalized === "error: compaction cancelled";
}
/** Project display text and failure provenance together, without classifying intentional declines. */
function resolveCompactionFailure(params) {
	const reason = formatErrorMessage(params.error);
	const cancellation = !params.abortSignal?.aborted && params.error instanceof Error && params.error.name === "Error" && isGenericCompactionCancelledReason(reason) ? params.safeguardCancellation : void 0;
	return {
		reason: cancellation?.reason ?? reason,
		error: cancellation?.error ?? params.error
	};
}
/** Bucket a raw compaction reason into stable telemetry/status classes. */
function classifyCompactionReason(reason) {
	const text = normalizeLowercaseStringOrEmpty(reason);
	if (!text) return "unknown";
	if (text.startsWith("no api key found") || text.startsWith("authentication failed for ") && text.includes("credentials may have expired")) return "auth_failed";
	if (text.includes("nothing to compact") || text.includes("no real conversation messages")) return "no_compactable_entries";
	if (text.includes("below threshold") || text.includes("already under target")) return "below_threshold";
	if (text.includes("already compacted") || text.includes("already_compacted")) return "already_compacted";
	if (text.includes("deferred to background")) return "deferred_background";
	if (text.includes("still exceeds target")) return "live_context_still_exceeds_target";
	if (text.includes("session transcript") && text.includes("not persisted")) return "transcript_persistence_failed";
	if (text.includes("guard")) return "guard_blocked";
	if (text.includes("summary")) return "summary_failed";
	if (text.includes("timed out") || text.includes("timeout")) return "timeout";
	const status = extractFailoverHttpStatus(reason, { includeLabeledStatus: true });
	if (status !== void 0 && COMPACTION_PROVIDER_4XX.has(status)) return "provider_error_4xx";
	if (status !== void 0 && COMPACTION_PROVIDER_5XX.has(status)) return "provider_error_5xx";
	return "unknown";
}
/** Return whether a classified reason represents an intentional compaction no-op. */
function isBenignCompactionSkipReason(reason) {
	const classification = classifyCompactionReason(reason);
	return classification === "below_threshold" || classification === "already_compacted";
}
/** Return whether a compaction result is an intentional no-op rather than a failure. */
function isBenignCompactionSkipResult(result) {
	if (result.compacted) return false;
	return isBenignCompactionSkipReason(result.reason) || result.ok && classifyCompactionReason(result.reason) === "no_compactable_entries";
}
/** Sanitize an unknown reason into a short log/metric-safe detail suffix. */
function formatUnknownCompactionReasonDetail(reason) {
	const sanitized = sanitizeForLog((reason ?? "").replace(/\s+/g, " ")).trim().replace(/[^A-Za-z0-9._:@/+~-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
	if (!sanitized) return;
	return sanitized.slice(0, MAX_COMPACTION_REASON_DETAIL_CHARS);
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-context-engine-helpers.ts
/**
* Resolves bootstrap/context files for this attempt and reports whether the
* caller should persist a completed bootstrap marker. Continuation-skip mode
* intentionally suppresses reinjection after a full bootstrap turn has already
* been recorded for the session.
*/
async function resolveAttemptBootstrapContext(params) {
	const isHeartbeatLifecycleRun = isHeartbeatLifecycleRunKind(params.bootstrapContextRunKind);
	const isContinuationTurn = params.bootstrapMode !== "full" && params.contextInjectionMode === "continuation-skip" && !isHeartbeatLifecycleRun && await params.hasCompletedBootstrapTurn();
	const shouldSkipBootstrapInjection = params.contextInjectionMode === "never" || isContinuationTurn;
	const shouldRecordCompletedBootstrapTurn = !shouldSkipBootstrapInjection && params.bootstrapContextMode !== "lightweight" && !isHeartbeatLifecycleRun && params.bootstrapMode === "full";
	return {
		...shouldSkipBootstrapInjection ? {
			bootstrapFiles: [],
			contextFiles: []
		} : await params.resolveBootstrapContextForRun(),
		isContinuationTurn,
		shouldRecordCompletedBootstrapTurn
	};
}
/**
* Builds the compact prompt-cache metadata stored on an attempt result. Empty
* inputs return undefined so callers do not serialize meaningless cache fields.
*/
function buildContextEnginePromptCacheInfo(params) {
	const promptCache = {};
	if (params.retention) promptCache.retention = params.retention;
	if (params.lastCallUsage) promptCache.lastCallUsage = { ...params.lastCallUsage };
	if (params.observation) promptCache.observation = {
		broke: params.observation.broke,
		...typeof params.observation.previousCacheRead === "number" ? { previousCacheRead: params.observation.previousCacheRead } : {},
		...typeof params.observation.cacheRead === "number" ? { cacheRead: params.observation.cacheRead } : {},
		...params.observation.changes && params.observation.changes.length > 0 ? { changes: params.observation.changes.map((change) => ({
			code: change.code,
			detail: change.detail
		})) } : {}
	};
	if (typeof params.lastCacheTouchAt === "number" && Number.isFinite(params.lastCacheTouchAt)) promptCache.lastCacheTouchAt = params.lastCacheTouchAt;
	return Object.keys(promptCache).length > 0 ? promptCache : void 0;
}
/**
* Finds the assistant message produced by the current attempt, ignoring
* historical messages that were present before prompt submission.
*/
function findCurrentAttemptAssistantMessage(params) {
	return params.messagesSnapshot.slice(Math.max(0, params.prePromptMessageCount)).toReversed().find((message) => message.role === "assistant");
}
/** Finds the newest usable per-call usage without letting a zero-usage abort erase it. */
function findLatestCurrentAttemptUsageSnapshot(params) {
	for (const message of params.messagesSnapshot.slice(Math.max(0, params.prePromptMessageCount)).toReversed()) {
		if (message.role !== "assistant") continue;
		const usage = normalizeUsage(message.usage);
		if (hasNonzeroUsage(usage)) return {
			assistant: message,
			usage
		};
	}
}
/** Prevents transcript fallback from crossing a compaction-owned context boundary. */
function findLatestUncompactedAttemptUsageSnapshot(params) {
	if (params.compactionOccurred) return;
	return findLatestCurrentAttemptUsageSnapshot(params);
}
function parsePromptCacheTouchTimestamp(value) {
	return parseDateFirstTimestampMs(value) ?? null;
}
/**
* Resolves the effective prompt-cache touch timestamp for the current assistant
* turn. Cache-read/write usage is required before an assistant timestamp can
* advance the touch time; otherwise the previous touch is carried forward.
*/
function resolvePromptCacheTouchTimestamp(params) {
	if (!(typeof params.lastCallUsage?.cacheRead === "number" || typeof params.lastCallUsage?.cacheWrite === "number")) return params.fallbackLastCacheTouchAt ?? null;
	return parsePromptCacheTouchTimestamp(params.assistantTimestamp) ?? params.fallbackLastCacheTouchAt ?? null;
}
/**
* Derives prompt-cache metadata from the loop transcript snapshot after a model
* attempt finishes. It combines the current attempt assistant usage with the
* carried-forward touch timestamp from earlier attempts.
*/
function buildLoopPromptCacheInfo(params) {
	const latestUsageSnapshot = findLatestCurrentAttemptUsageSnapshot({
		messagesSnapshot: params.messagesSnapshot,
		prePromptMessageCount: params.prePromptMessageCount
	});
	const lastCallUsage = latestUsageSnapshot?.usage;
	return buildContextEnginePromptCacheInfo({
		retention: params.retention,
		lastCallUsage,
		lastCacheTouchAt: resolvePromptCacheTouchTimestamp({
			lastCallUsage,
			assistantTimestamp: latestUsageSnapshot?.assistant.timestamp,
			fallbackLastCacheTouchAt: params.fallbackLastCacheTouchAt
		})
	});
}
//#endregion
//#region src/agents/embedded-agent-runner/cache-ttl.ts
/**
* Resolves cache-TTL eligibility and session markers for prompt-cache retention.
*/
const CACHE_TTL_CUSTOM_TYPE = "openclaw.cache-ttl";
/** Returns whether this provider/model pair supports cache-TTL session markers. */
function isCacheTtlEligibleProvider(provider, modelId, modelApi) {
	const normalizedProvider = normalizeLowercaseStringOrEmpty(provider);
	const normalizedModelId = normalizeLowercaseStringOrEmpty(modelId);
	const pluginEligibility = resolveProviderCacheTtlEligibility({
		provider: normalizedProvider,
		context: {
			provider: normalizedProvider,
			modelId: normalizedModelId,
			modelApi
		}
	});
	if (pluginEligibility !== void 0) return pluginEligibility;
	return isAnthropicFamilyCacheTtlEligible({
		provider: normalizedProvider,
		modelId: normalizedModelId,
		modelApi
	}) || normalizedProvider === "kilocode" && isAnthropicModelRef(normalizedModelId) || isGooglePromptCacheEligible({
		modelApi,
		modelId: normalizedModelId
	});
}
function normalizeCacheTtlKey(value) {
	return normalizeOptionalLowercaseString(value);
}
function matchesCacheTtlContext(data, context) {
	if (!context) return true;
	const expectedProvider = normalizeCacheTtlKey(context.provider);
	if (expectedProvider && normalizeCacheTtlKey(data?.provider) !== expectedProvider) return false;
	const expectedModelId = normalizeCacheTtlKey(context.modelId);
	if (expectedModelId && normalizeCacheTtlKey(data?.modelId) !== expectedModelId) return false;
	return true;
}
/** Reads the most recent cache-TTL marker that matches the optional provider/model context. */
function readLastCacheTtlTimestamp(sessionManager, context) {
	const sm = sessionManager;
	if (!sm?.getEntries) return null;
	try {
		const entries = sm.getEntries();
		let last = null;
		for (let i = entries.length - 1; i >= 0; i--) {
			const entry = entries[i];
			if (entry?.type !== "custom" || entry?.customType !== CACHE_TTL_CUSTOM_TYPE) continue;
			const data = entry?.data;
			if (!matchesCacheTtlContext(data, context)) continue;
			const ts = typeof data?.timestamp === "number" ? data.timestamp : null;
			if (ts && Number.isFinite(ts)) {
				last = ts;
				break;
			}
		}
		return last;
	} catch {
		return null;
	}
}
const IMAGE_CHAR_ESTIMATE = 8e3;
function isTextBlock(block) {
	return Boolean(block) && typeof block === "object" && block.type === "text" && typeof block.text === "string";
}
function isImageBlock(block) {
	return Boolean(block) && typeof block === "object" && block.type === "image";
}
function estimateUnknownChars(value) {
	if (typeof value === "string") return value.length;
	if (value === void 0) return 0;
	try {
		const serialized = JSON.stringify(value);
		return typeof serialized === "string" ? serialized.length : 0;
	} catch {
		return 256;
	}
}
function isToolResultMessage(msg) {
	const role = msg.role;
	const type = msg.type;
	return role === "toolResult" || role === "tool" || type === "toolResult";
}
function getToolResultContent(msg) {
	if (!isToolResultMessage(msg)) return [];
	const content = msg.content;
	if (typeof content === "string") return [{
		type: "text",
		text: content
	}];
	return Array.isArray(content) ? content : [];
}
function estimateContentBlockChars(content) {
	let chars = 0;
	for (const block of content) if (isTextBlock(block)) chars += block.text.length;
	else if (isImageBlock(block)) chars += IMAGE_CHAR_ESTIMATE;
	else chars += estimateUnknownChars(block);
	return chars;
}
function estimateToolResultContentChars(content) {
	let chars = 0;
	for (const block of content) if (isTextBlock(block)) chars += estimateToolResultTextChars(block.text, { minimumRawWeight: 2 });
	else if (isImageBlock(block)) chars += IMAGE_CHAR_ESTIMATE * 2;
	else chars += estimateUnknownChars(block) * 2;
	return chars;
}
function getToolResultText(msg) {
	const content = getToolResultContent(msg);
	const chunks = [];
	for (const block of content) if (isTextBlock(block)) chunks.push(block.text);
	return chunks.join("\n");
}
function estimateMessageChars(msg) {
	if (!msg || typeof msg !== "object" || "excludeFromContext" in msg && msg.excludeFromContext === true) return 0;
	if (msg.role === "user") {
		const content = msg.content;
		if (typeof content === "string") return content.length;
		if (Array.isArray(content)) return estimateContentBlockChars(content);
		return 0;
	}
	if (msg.role === "assistant") {
		let chars = 0;
		const content = msg.content;
		if (Array.isArray(content)) for (const block of content) {
			if (!block || typeof block !== "object") continue;
			const typed = block;
			if (typed.type === "text" && typeof typed.text === "string") chars += typed.text.length;
			else if (typed.type === "thinking" && typeof typed.thinking === "string") chars += typed.thinking.length;
			else if (typed.type === "toolCall") try {
				chars += JSON.stringify(typed.arguments ?? {}).length;
			} catch {
				chars += 128;
			}
			else chars += estimateUnknownChars(block);
		}
		return chars;
	}
	if (isToolResultMessage(msg)) return estimateToolResultContentChars(getToolResultContent(msg));
	const role = Reflect.get(msg, "role");
	if (role === "bashExecution") return bashExecutionToText(msg).length;
	if (role === "branchSummary") {
		const rawSummary = Reflect.get(msg, "summary");
		return (BRANCH_SUMMARY_PREFIX + (typeof rawSummary === "string" ? rawSummary : "") + BRANCH_SUMMARY_SUFFIX).length;
	}
	if (role === "compactionSummary") {
		const rawSummary = Reflect.get(msg, "summary");
		return (COMPACTION_SUMMARY_PREFIX + (typeof rawSummary === "string" ? rawSummary : "") + COMPACTION_SUMMARY_SUFFIX).length;
	}
	if (role === "custom") {
		const content = Reflect.get(msg, "content");
		if (typeof content === "string") return content.length;
		if (Array.isArray(content)) return estimateContentBlockChars(content);
		return 0;
	}
	return 256;
}
function createMessageCharEstimateCache() {
	return /* @__PURE__ */ new WeakMap();
}
function estimateMessageCharsCached(msg, cache) {
	const hit = cache.get(msg);
	if (hit !== void 0) return hit;
	const estimated = estimateMessageChars(msg);
	cache.set(msg, estimated);
	return estimated;
}
//#endregion
//#region src/agents/embedded-agent-runner/tool-result-context-guard.ts
const TRANSCRIPT_PROMPT_TEXT_KEY = "__openclawTranscriptPromptText";
function markTranscriptPromptText(message, text) {
	Object.defineProperty(message, TRANSCRIPT_PROMPT_TEXT_KEY, {
		configurable: true,
		enumerable: true,
		value: text
	});
}
function getTranscriptPromptText(message) {
	const value = Reflect.get(message, TRANSCRIPT_PROMPT_TEXT_KEY);
	return typeof value === "string" ? value : void 0;
}
function restoreTranscriptPromptText(message, cache) {
	const transcriptText = getTranscriptPromptText(message);
	if (transcriptText === void 0 || message.role !== "user") return message;
	const cached = cache.get(message);
	if (cached) return cached;
	const content = message.content;
	const messageRest = { ...message };
	Reflect.deleteProperty(messageRest, TRANSCRIPT_PROMPT_TEXT_KEY);
	let restoredMessage = message;
	if (typeof content === "string") restoredMessage = Object.assign(messageRest, { content: transcriptText });
	else if (Array.isArray(content)) {
		let restored = false;
		const nextContent = content.map((block) => {
			if (restored || !block || typeof block !== "object") return block;
			const textBlock = block;
			if (textBlock.type !== "text" || typeof textBlock.text !== "string") return block;
			restored = true;
			return Object.assign({}, block, { text: transcriptText });
		});
		if (restored) restoredMessage = Object.assign(messageRest, { content: nextContent });
	}
	cache.set(message, restoredMessage);
	return restoredMessage;
}
function stripTranscriptPromptMarker(message) {
	if (getTranscriptPromptText(message) === void 0) return message;
	const messageRest = { ...message };
	Reflect.deleteProperty(messageRest, TRANSCRIPT_PROMPT_TEXT_KEY);
	return messageRest;
}
function projectTranscriptPromptMessages(messages, cache) {
	let changed = false;
	const projected = messages.map((message) => {
		const next = restoreTranscriptPromptText(message, cache);
		changed ||= next !== message;
		return next;
	});
	return changed ? projected : messages;
}
function stripTranscriptPromptMarkers(messages) {
	let changed = false;
	const stripped = messages.map((message) => {
		const next = stripTranscriptPromptMarker(message);
		changed ||= next !== message;
		return next;
	});
	return changed ? stripped : messages;
}
function replaceToolResultContent(msg, replacement) {
	const content = msg.content;
	const rest = { ...msg };
	Reflect.deleteProperty(rest, "details");
	return {
		...rest,
		content: typeof replacement === "string" && !(typeof content === "string" || content === void 0) ? [{
			type: "text",
			text: replacement
		}] : replacement
	};
}
function estimateBudgetToRawChars(maxChars) {
	return Math.max(0, Math.floor(maxChars / 2));
}
function truncateToolResultToChars(msg, maxChars, cache) {
	if (!isToolResultMessage(msg)) return msg;
	if (estimateMessageCharsCached(msg, cache) <= maxChars) return msg;
	const content = msg.content;
	if (Array.isArray(content)) {
		const isImage = (block) => Boolean(block) && typeof block === "object" && block.type === "image";
		const isText = (block) => Boolean(block) && typeof block === "object" && block.type === "text" && typeof block.text === "string";
		const imageCount = content.filter(isImage).length;
		const omissionNotice = (retainedImages) => {
			const omittedImages = imageCount - retainedImages;
			return `[${omittedImages} image${omittedImages === 1 ? "" : "s"} omitted from context${retainedImages === 0 ? "; no images fit the context limit" : ""}; rerun with fewer images]`;
		};
		const projectContent = (retainedContent, noticeText) => {
			const notice = noticeText ? [{
				type: "text",
				text: noticeText
			}] : [];
			const reservedChars = estimateMessageCharsCached(replaceToolResultContent(msg, [...retainedContent.filter((block) => !isText(block)), ...notice]), cache);
			return replaceToolResultContent(msg, [...truncateToolResultMessage(replaceToolResultContent(msg, retainedContent), Math.max(0, maxChars - reservedChars), { minimumRawWeight: 2 }).content, ...notice]);
		};
		for (let retainedImages = imageCount; retainedImages >= 0; retainedImages -= 1) {
			let seenImages = 0;
			const retainedContent = content.filter((block) => !isImage(block) || ++seenImages <= retainedImages);
			const projected = projectContent(retainedContent, retainedImages < imageCount ? omissionNotice(retainedImages) : void 0);
			const projectedContent = projected.content;
			if (retainedContent.some((block, index) => {
				const projectedBlock = projectedContent[index];
				return isText(block) && block.text && (!isText(projectedBlock) || !projectedBlock.text);
			})) continue;
			if (estimateMessageCharsCached(projected, cache) <= maxChars) return projected;
		}
		const omittedChars = estimateMessageCharsCached(replaceToolResultContent(msg, content.filter((block) => !isText(block))), cache);
		return projectContent(content.filter(isText), imageCount > 0 ? omissionNotice(0) : formatContextLimitTruncationNotice(Math.max(1, estimateBudgetToRawChars(omittedChars))));
	}
	return replaceToolResultContent(msg, truncateToolResultText(getToolResultText(msg), maxChars, {
		minKeepChars: 0,
		minimumRawWeight: 2
	}));
}
function enforceToolResultLimit(params) {
	const { messages, maxSingleToolResultChars } = params;
	const estimateCache = createMessageCharEstimateCache();
	let changed = false;
	const guarded = messages.map((message) => {
		const next = truncateToolResultToChars(message, maxSingleToolResultChars, estimateCache);
		changed ||= next !== message;
		return next;
	});
	return changed ? guarded : messages;
}
function hasNewToolResultAfterFence(params) {
	for (const message of params.messages.slice(params.prePromptMessageCount)) if (isToolResultMessage(message)) return true;
	return false;
}
function toMidTurnPrecheckRequest(result) {
	if (result.route === "fits") return null;
	return {
		route: result.route,
		estimatedPromptTokens: result.estimatedPromptTokens,
		promptBudgetBeforeReserve: result.promptBudgetBeforeReserve,
		overflowTokens: result.overflowTokens,
		toolResultReducibleChars: result.toolResultReducibleChars,
		effectiveReserveTokens: result.effectiveReserveTokens
	};
}
/**
* Per-iteration `afterTurn` + `assemble` wrapper for sessions where
* the context engine owns compaction. Lets the engine compact inside
* a long tool loop instead of only at end of attempt.
*/
function installContextEngineLoopHook(params) {
	const { contextEngine, sessionId, sessionKey, sessionFile, tokenBudget, modelId } = params;
	const mutableAgent = params.agent;
	const originalTransformContext = mutableAgent.transformContext;
	let lastSeenLength = null;
	let lastAssembledView = null;
	let lastSourceMessages = null;
	const transcriptProjectionCache = /* @__PURE__ */ new WeakMap();
	mutableAgent.transformContext = (async (messages, signal) => {
		signal?.throwIfAborted();
		const transformed = originalTransformContext ? await originalTransformContext.call(mutableAgent, messages, signal) : messages;
		signal?.throwIfAborted();
		const sourceMessages = Array.isArray(transformed) ? transformed : messages;
		const transcriptMessages = projectTranscriptPromptMessages(sourceMessages, transcriptProjectionCache);
		const providerMessages = stripTranscriptPromptMarkers(sourceMessages);
		const checkedPrefixLength = lastSeenLength == null ? 0 : Math.min(lastSeenLength, transcriptMessages.length);
		if (lastSeenLength != null && lastSourceMessages != null && (transcriptMessages.length < lastSeenLength || transcriptMessages.length === lastSeenLength && transcriptMessages.slice(0, checkedPrefixLength).some((message, index) => message !== lastSourceMessages?.[index]))) {
			lastSeenLength = null;
			lastAssembledView = null;
		}
		const prePromptMessageCount = Math.max(0, Math.min(transcriptMessages.length, lastSeenLength ?? params.getPrePromptMessageCount?.() ?? transcriptMessages.length));
		if (!(transcriptMessages.length > prePromptMessageCount)) {
			lastSeenLength = prePromptMessageCount;
			lastSourceMessages = transcriptMessages;
			return lastAssembledView ?? providerMessages;
		}
		try {
			if (typeof contextEngine.afterTurn === "function") await contextEngine.afterTurn({
				sessionId,
				sessionKey,
				sessionTarget: params.sessionTarget,
				sessionFile,
				messages: transcriptMessages,
				prePromptMessageCount,
				tokenBudget,
				runtimeContext: params.getRuntimeContext?.({
					messages: transcriptMessages,
					prePromptMessageCount
				}),
				runtimeSettings: params.runtimeSettings,
				isHeartbeat: params.isHeartbeat
			});
			else {
				const newMessages = transcriptMessages.slice(prePromptMessageCount);
				if (newMessages.length > 0) {
					if (typeof contextEngine.ingestBatch === "function") await contextEngine.ingestBatch({
						sessionId,
						sessionKey,
						messages: newMessages,
						isHeartbeat: params.isHeartbeat
					});
					else for (const message of newMessages) {
						await contextEngine.ingest({
							sessionId,
							sessionKey,
							message,
							isHeartbeat: params.isHeartbeat
						});
						signal?.throwIfAborted();
					}
				}
			}
			signal?.throwIfAborted();
			lastSeenLength = transcriptMessages.length;
			params.onAfterTurnCheckpoint?.(lastSeenLength);
			lastSourceMessages = transcriptMessages;
			const assembled = await contextEngine.assemble({
				sessionId,
				sessionKey,
				messages: providerMessages.slice(),
				tokenBudget,
				model: modelId,
				runtimeSettings: params.runtimeSettings
			});
			signal?.throwIfAborted();
			if (assembled && Array.isArray(assembled.messages)) {
				const repairedMessages = params.repairAssembledMessages?.(assembled.messages) ?? assembled.messages;
				if (repairedMessages !== providerMessages || assembled.messages !== providerMessages) {
					lastAssembledView = repairedMessages;
					return repairedMessages;
				}
			}
			lastAssembledView = null;
		} catch {
			signal?.throwIfAborted();
			lastSeenLength = prePromptMessageCount;
			lastAssembledView = null;
			lastSourceMessages = transcriptMessages;
		}
		return providerMessages;
	});
	return () => {
		mutableAgent.transformContext = originalTransformContext;
	};
}
function installToolResultContextGuard(params) {
	const maxSingleToolResultChars = resolveToolResultContextMaxChars(params.contextWindowTokens);
	const mutableAgent = params.agent;
	const originalTransformContext = mutableAgent.transformContext;
	let lastSeenLength = null;
	mutableAgent.transformContext = (async (messages, signal) => {
		const transformed = originalTransformContext ? await originalTransformContext.call(mutableAgent, messages, signal) : messages;
		const contextMessages = enforceToolResultLimit({
			messages: Array.isArray(transformed) ? transformed : messages,
			maxSingleToolResultChars
		});
		if (params.midTurnPrecheck?.enabled) {
			const prePromptMessageCount = Math.max(0, Math.min(contextMessages.length, lastSeenLength ?? params.midTurnPrecheck.getPrePromptMessageCount?.() ?? contextMessages.length));
			lastSeenLength = prePromptMessageCount;
			if (hasNewToolResultAfterFence({
				messages: contextMessages,
				prePromptMessageCount
			})) {
				const precheck = shouldPreemptivelyCompactBeforePrompt({
					replay: params.midTurnPrecheck.getReplay?.(),
					messages: contextMessages,
					systemPrompt: params.midTurnPrecheck.getSystemPrompt?.(),
					prompt: "",
					contextTokenBudget: params.midTurnPrecheck.contextTokenBudget,
					reserveTokens: params.midTurnPrecheck.reserveTokens(),
					toolResultMaxChars: params.midTurnPrecheck.toolResultMaxChars
				});
				const request = toMidTurnPrecheckRequest(precheck);
				log$5.debug(`[context-overflow-midturn-precheck] tool-result-guard check route=${precheck.route} messages=${contextMessages.length} prePromptMessageCount=${prePromptMessageCount} estimatedPromptTokens=${precheck.estimatedPromptTokens} promptBudgetBeforeReserve=${precheck.promptBudgetBeforeReserve} overflowTokens=${precheck.overflowTokens}`);
				if (request) {
					params.midTurnPrecheck.onMidTurnPrecheck?.(request);
					throw new MidTurnPrecheckSignal(request);
				}
			}
			lastSeenLength = contextMessages.length;
		}
		return contextMessages;
	});
	return () => {
		mutableAgent.transformContext = originalTransformContext;
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-http-runtime.ts
/**
* Configures HTTP timeout defaults for embedded-agent attempt runtime calls.
*/
/** Configures process-wide Undici proxy and stream timeout behavior for one embedded attempt. */
function configureEmbeddedAttemptHttpRuntime(params) {
	ensureGlobalUndiciEnvProxyDispatcher();
	ensureGlobalUndiciDispatcherStreamTimeouts({ timeoutMs: Math.max(params.timeoutMs, DEFAULT_UNDICI_STREAM_TIMEOUT_MS) });
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-stage-timing.ts
/** Canonical stage names for dispatch-time embedded attempt diagnostics. */
const EMBEDDED_RUN_ATTEMPT_DISPATCH_STAGE = {
	workspace: "attempt-workspace",
	prompt: "attempt-prompt",
	runtimePlan: "attempt-runtime-plan",
	dispatch: "attempt-dispatch"
};
const EMBEDDED_RUN_STAGE_WARN_TOTAL_MS = 1e4;
const EMBEDDED_RUN_STAGE_WARN_STAGE_MS = 5e3;
/**
* Creates an append-only stage tracker. `mark` records time since the previous
* mark while `snapshot` reports current total elapsed time without mutating the
* recorded stage list.
*/
function createEmbeddedRunStageTracker(options) {
	const now = options?.now ?? Date.now;
	const startedAt = now();
	let previousAt = startedAt;
	const stages = [];
	const toMs = (value) => Math.max(0, Math.round(value));
	return {
		mark(name) {
			const currentAt = now();
			stages.push({
				name,
				durationMs: toMs(currentAt - previousAt),
				elapsedMs: toMs(currentAt - startedAt)
			});
			previousAt = currentAt;
		},
		snapshot() {
			return {
				totalMs: toMs(now() - startedAt),
				stages: stages.slice()
			};
		}
	};
}
/** Returns true when either total runtime or any single stage exceeds warning thresholds. */
function shouldWarnEmbeddedRunStageSummary(summary, options) {
	const totalThresholdMs = options?.totalThresholdMs ?? EMBEDDED_RUN_STAGE_WARN_TOTAL_MS;
	const stageThresholdMs = options?.stageThresholdMs ?? EMBEDDED_RUN_STAGE_WARN_STAGE_MS;
	// firsttext-prompt-marks-v1: diagnostic switch, prints every stage summary
	if (process.env.OPENCLAW_EMBEDDED_STAGE_SUMMARY_ALWAYS === "1") return true;
	return summary.totalMs >= totalThresholdMs || summary.stages.some((stage) => stage.durationMs >= stageThresholdMs);
}
/**
* Builds the shared "emit stage summary" closure used by run startup and
* attempt prep: warn when thresholds trip, trace otherwise, stay silent when
* neither applies.
*/
function createEmbeddedRunStageSummaryEmitter(options) {
	return (phase) => {
		const summary = options.tracker.snapshot();
		const shouldWarn = shouldWarnEmbeddedRunStageSummary(summary);
		if (!shouldWarn && !options.log.isEnabled("trace")) return;
		const message = formatEmbeddedRunStageSummary(`[trace:embedded-run] ${options.label}: runId=${options.runId} sessionId=${options.sessionId} phase=${phase}`, summary);
		if (shouldWarn) options.log.warn(message);
		else options.log.trace(message);
	};
}
/** Formats stage timing into compact log text for startup/attempt diagnostics. */
function formatEmbeddedRunStageSummary(prefix, summary) {
	const stages = summary.stages.length > 0 ? summary.stages.map((stage) => `${stage.name}:${stage.durationMs}ms@${stage.elapsedMs}ms`).join(",") : "none";
	return `${prefix} totalMs=${summary.totalMs} stages=${stages}`;
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-setup.ts
/**
* Resolves workspace, runtime setup, context guards, and startup for an embedded attempt.
* It may assume dispatch inputs and provider metadata are ready.
*/
/** Resolves the shared workspace and sandbox policy used by native and plugin harnesses. */
async function resolveAttemptWorkspaceSandbox(params) {
	const { sessionAgentId } = resolveSessionAgentIds({
		sessionKey: params.sessionKey,
		config: params.config,
		agentId: params.agentId
	});
	const resolvedWorkspace = resolveUserPath(params.workspaceDir);
	await fs$1.mkdir(resolvedWorkspace, { recursive: true });
	const sessionKey = params.sessionKey?.trim() || params.sessionId;
	const sandboxSessionKey = params.sandboxSessionKey?.trim() || sessionKey;
	const sandbox = params.skillWorkshopCollectionReconcile ? null : await resolveSandboxContext({
		config: params.config,
		agentId: params.sandboxAgentId ?? (sandboxSessionKey === sessionKey ? sessionAgentId : void 0),
		execOverrides: params.execOverrides,
		sessionKey: sandboxSessionKey,
		skillsSnapshot: params.skillsSnapshot,
		workspaceDir: resolvedWorkspace
	});
	const effectiveWorkspace = sandbox?.enabled && sandbox.workspaceAccess !== "rw" ? sandbox.workspaceDir : resolvedWorkspace;
	const requestedCwd = params.cwd ? resolveUserPath(params.cwd) : void 0;
	const sessionPermissionRoot = params.sessionRoot ?? await fs$1.realpath(resolvedWorkspace);
	const sessionPermissionPolicy = params.permissionMode ? {
		root: sessionPermissionRoot,
		mode: params.permissionMode
	} : void 0;
	if (sandbox?.enabled && requestedCwd && requestedCwd !== resolvedWorkspace) throw new Error("cwd override is not supported for sandboxed embedded agent runs; omit cwd or use the agent workspace as cwd");
	await fs$1.mkdir(effectiveWorkspace, { recursive: true });
	return {
		effectiveCwd: sandbox?.enabled ? effectiveWorkspace : requestedCwd ?? effectiveWorkspace,
		effectiveFsWorkspaceOnly: resolveAttemptFsWorkspaceOnly({
			config: params.config,
			sessionAgentId
		}),
		effectiveWorkspace,
		resolvedWorkspace,
		sessionPermissionRoot,
		sessionPermissionPolicy,
		sandbox,
		sandboxSessionKey,
		sessionAgentId
	};
}
async function prepareEmbeddedAttemptSetup(params) {
	const agentCoreThinkingLevel = mapThinkingLevel(params.thinkLevel);
	const providerThinkingLevel = mapThinkingLevelForProvider(params.thinkLevel);
	const proactiveSubagentOrchestration = params.thinkLevel === "ultra";
	configureEmbeddedAttemptHttpRuntime({ timeoutMs: params.timeoutMs });
	log$5.debug(`embedded run start: runId=${params.runId} sessionId=${params.sessionId} provider=${params.provider} model=${params.modelId} thinking=${params.thinkLevel} messageChannel=${params.messageChannel ?? params.messageProvider ?? "unknown"}`);
	const prepStages = createEmbeddedRunStageTracker();
	const emitPrepStageSummary = createEmbeddedRunStageSummaryEmitter({
		label: "prep stages",
		log: log$5,
		runId: params.runId,
		sessionId: params.sessionId,
		tracker: prepStages
	});
	const emitCorePluginToolStageSummary = (phase, summary) => {
		if (summary.stages.length === 0) return;
		const shouldWarn = shouldWarnEmbeddedRunStageSummary(summary, {
			totalThresholdMs: 5e3,
			stageThresholdMs: 2e3
		});
		if (!shouldWarn && !log$5.isEnabled("trace")) return;
		const message = formatEmbeddedRunStageSummary(`[trace:embedded-run] core-plugin-tool stages: runId=${params.runId} sessionId=${params.sessionId} phase=${phase}`, summary);
		if (shouldWarn) log$5.warn(message);
		else log$5.trace(message);
	};
	const workspace = await resolveAttemptWorkspaceSandbox(params);
	const { effectiveWorkspace } = workspace;
	const getCurrentAttemptPluginMetadataSnapshot = () => params.preparedModelRuntime?.metadataSnapshot;
	let providerRuntimeHandle = params.runtimePlan?.providerRuntimeHandle;
	const getProviderRuntimeHandle = () => {
		if (providerRuntimeHandle && providerRuntimeHandle.prepared && providerRuntimeHandle.provider === params.provider && providerRuntimeHandle.modelId === params.modelId && providerRuntimeHandle.workspaceDir === effectiveWorkspace) return providerRuntimeHandle;
		const pluginMetadataSnapshot = getCurrentAttemptPluginMetadataSnapshot();
		providerRuntimeHandle = {
			...resolveProviderRuntimePluginHandle({
				provider: params.provider,
				modelId: params.modelId,
				config: params.config,
				workspaceDir: effectiveWorkspace,
				env: process.env,
				...pluginMetadataSnapshot ? { pluginMetadataSnapshot } : {}
			}),
			provider: params.provider,
			modelId: params.modelId,
			prepared: true,
			workspaceDir: effectiveWorkspace
		};
		return providerRuntimeHandle;
	};
	prepStages.mark("workspace-sandbox");
	return {
		agentCoreThinkingLevel,
		...workspace,
		emitCorePluginToolStageSummary,
		emitPrepStageSummary,
		getCurrentAttemptPluginMetadataSnapshot,
		getProviderRuntimeHandle,
		prepStages,
		proactiveSubagentOrchestration,
		providerThinkingLevel
	};
}
function installEmbeddedAttemptContextGuards(input) {
	const { activeContextEngine, activeSession, attempt, settingsManager } = input;
	const contextTokenBudget = Math.max(1, Math.floor(attempt.contextTokenBudget ?? attempt.model.contextWindow ?? attempt.model.maxTokens ?? 2e5));
	const toolResultMaxChars = resolveLiveToolResultMaxChars({ contextWindowTokens: contextTokenBudget });
	let pendingMidTurnPrecheckRequest = null;
	let afterTurnCheckpoint = null;
	const midTurnPrecheckOptions = attempt.config?.agents?.defaults?.compaction?.midTurnPrecheck?.enabled === true ? { midTurnPrecheck: {
		enabled: true,
		getReplay: () => ({
			model: attempt.model,
			sessionId: attempt.sessionId,
			authProfileId: resolveAttemptStreamAuthProfileId(attempt),
			enabled: input.getCompactionReplayEnabled()
		}),
		contextTokenBudget,
		reserveTokens: () => settingsManager.getCompactionReserveTokens(),
		toolResultMaxChars,
		getSystemPrompt: input.getSystemPrompt,
		getPrePromptMessageCount: input.getPrePromptMessageCount,
		onMidTurnPrecheck: (request) => {
			pendingMidTurnPrecheckRequest = request;
		}
	} } : {};
	const contextPruning = attempt.config?.agents?.defaults?.contextPruning;
	const cacheTtlSettings = contextPruning?.mode === "cache-ttl" && isCacheTtlEligibleProvider(attempt.provider, attempt.modelId, attempt.model.api) ? resolveCacheTtlPruningSettings(contextPruning) : void 0;
	const previousCacheTtlTransform = activeSession.agent.transformContext;
	let lastCacheTouchAt = cacheTtlSettings ? readLastCacheTtlTimestamp(input.sessionManager, {
		provider: attempt.provider,
		modelId: attempt.modelId
	}) : null;
	if (cacheTtlSettings) activeSession.agent.transformContext = async (messages, signal) => {
		const transformed = previousCacheTtlTransform ? await previousCacheTtlTransform.call(activeSession.agent, messages, signal) : messages;
		const sourceMessages = Array.isArray(transformed) ? transformed : messages;
		const projected = pruneExpiredCacheTtlToolResults({
			messages: sourceMessages,
			settings: cacheTtlSettings,
			contextWindowTokens: contextTokenBudget,
			lastCacheTouchAt,
			dropThinkingBlocksForEstimate: input.dropThinkingBlocksForEstimate,
			now: Date.now()
		});
		if (projected !== sourceMessages) lastCacheTouchAt = Date.now();
		return projected;
	};
	let removeLoopGuard;
	if (activeContextEngine?.info.ownsCompaction === true) {
		const selectedContextEngineId = activeContextEngine.info.id;
		const runtimeSettings = buildContextEngineRuntimeSettings({
			contextEngineHost: OPENCLAW_EMBEDDED_CONTEXT_ENGINE_HOST,
			provider: attempt.provider,
			requestedModel: attempt.requestedModelId,
			resolvedModel: attempt.modelId,
			selectedContextEngineId,
			contextEngineSelectionSource: selectedContextEngineId === "legacy" ? "default" : "configured",
			promptTokenBudget: attempt.contextTokenBudget,
			fallbackReason: attempt.fallbackReason,
			degradedReason: attempt.degradedReason
		});
		const removeContextEngineLoopHook = installContextEngineLoopHook({
			agent: activeSession.agent,
			contextEngine: activeContextEngine,
			sessionId: attempt.sessionId,
			sessionKey: attempt.sessionKey,
			sessionTarget: attempt.sessionTarget,
			sessionFile: attempt.sessionFile,
			tokenBudget: attempt.contextTokenBudget,
			modelId: attempt.modelId,
			...input.repairToolUseResultPairing ? { repairAssembledMessages: (messages) => sanitizeToolUseResultPairingForModel(messages, input.isOpenAIResponsesApi) } : {},
			getPrePromptMessageCount: input.getPrePromptMessageCount,
			onAfterTurnCheckpoint: (messageCount) => {
				afterTurnCheckpoint = messageCount;
			},
			getRuntimeContext: ({ messages, prePromptMessageCount }) => buildAfterTurnRuntimeContext({
				attempt,
				workspaceDir: input.effectiveWorkspace,
				cwd: input.effectiveCwd,
				agentDir: input.agentDir,
				tokenBudget: attempt.contextTokenBudget,
				promptCache: input.getPromptCache() ?? buildLoopPromptCacheInfo({
					messagesSnapshot: messages,
					prePromptMessageCount,
					retention: input.getPromptCacheRetention(),
					fallbackLastCacheTouchAt: readLastCacheTtlTimestamp(input.sessionManager, {
						provider: attempt.provider,
						modelId: attempt.modelId
					})
				})
			}),
			runtimeSettings,
			isHeartbeat: isHeartbeatLifecycleRunKind(attempt.bootstrapContextRunKind)
		});
		const removeToolResultGuard = installToolResultContextGuard({
			agent: activeSession.agent,
			contextWindowTokens: contextTokenBudget,
			...midTurnPrecheckOptions
		});
		removeLoopGuard = () => {
			removeToolResultGuard();
			removeContextEngineLoopHook();
		};
	} else removeLoopGuard = installToolResultContextGuard({
		agent: activeSession.agent,
		contextWindowTokens: contextTokenBudget,
		...midTurnPrecheckOptions
	});
	const removeHistoryImagePruneContextTransform = installHistoryImagePruneContextTransform(activeSession.agent, {
		workspaceDir: input.effectiveWorkspace,
		model: attempt.model,
		maxBytes: MAX_IMAGE_BYTES,
		maxDimensionPx: resolveImageSanitizationLimits(attempt.config).maxDimensionPx,
		workspaceOnly: input.effectiveFsWorkspaceOnly,
		localRoots: input.effectiveFsWorkspaceOnly ? void 0 : getAgentScopedMediaLocalRoots(attempt.config ?? {}, input.sessionAgentId),
		sandbox: input.sandbox?.enabled && input.sandbox.fsBridge ? {
			root: input.sandbox.workspaceDir,
			bridge: input.sandbox.fsBridge
		} : void 0,
		onCurrentTurnImageFailure: input.onCurrentTurnImageFailure
	});
	const previousComputerFrameTransform = activeSession.agent.transformContext;
	activeSession.agent.transformContext = async (messages, signal) => {
		const transformed = previousComputerFrameTransform ? await previousComputerFrameTransform.call(activeSession.agent, messages, signal) : messages;
		const modelContext = Array.isArray(transformed) ? transformed : messages;
		invalidateComputerFrameIfMissing({
			contextEpoch: input.computerContextEpoch,
			messages: modelContext,
			imagesBlocked: settingsManager.getBlockImages()
		});
		return modelContext;
	};
	return {
		getAfterTurnCheckpoint: () => afterTurnCheckpoint,
		remove: () => {
			activeSession.agent.transformContext = previousComputerFrameTransform;
			removeHistoryImagePruneContextTransform();
			removeLoopGuard();
			activeSession.agent.transformContext = previousCacheTtlTransform;
		},
		takePendingMidTurnPrecheckRequest: () => {
			const request = pendingMidTurnPrecheckRequest;
			pendingMidTurnPrecheckRequest = null;
			return request;
		}
	};
}
function prepareEmbeddedAttemptSkills(params) {
	if (params.attempt.operation === "settled-tool-finalization") return {
		restoreSkillEnv: () => {},
		skillUsagePaths: void 0,
		skillsPrompt: "",
		skillsSnapshotForRun: void 0,
		codeModeSkills: []
	};
	const { skillsEligibility, skillsPromptWorkspaceDir, skillsSnapshot, skillsWorkspaceDir, workspaceOnly } = resolveSandboxSkillRuntimeInputs({
		sandbox: params.sandbox,
		skillsAnchorWorkspace: params.attempt.bootstrapWorkspaceDir ?? params.effectiveWorkspace,
		skillsSnapshot: params.attempt.skillsSnapshot
	});
	const { shouldLoadSkillEntries, skillEntries, loadSkillEntries, preserveEntryOrder } = resolveEmbeddedRunSkillEntries({
		workspaceDir: skillsWorkspaceDir,
		config: params.attempt.config,
		agentId: params.sessionAgentId,
		eligibility: skillsEligibility,
		skillsSnapshot,
		...params.sandbox?.enabled === true ? {} : { executionSkillsDir: path.join(params.effectiveWorkspace, "skills") },
		workspaceOnly
	});
	const restoreSkillEnv = skillsSnapshot ? applySkillEnvOverridesFromSnapshot({
		snapshot: skillsSnapshot,
		config: params.attempt.config
	}) : applySkillEnvOverrides({
		skills: skillEntries ?? [],
		config: params.attempt.config
	});
	try {
		const promptSkillEntries = mapSandboxSkillEntriesForPrompt({
			entries: shouldLoadSkillEntries ? skillEntries : void 0,
			skillsWorkspaceDir,
			skillsPromptWorkspaceDir
		});
		const skillUsagePaths = mapSandboxSkillUsagePaths({
			paths: params.sandbox?.skillUsagePaths,
			skillsWorkspaceDir,
			skillsPromptWorkspaceDir
		});
		const skillsPrompt = resolveSkillsPrompt({
			skillsSnapshot,
			entries: promptSkillEntries,
			loadEntries: createSandboxPromptEntryLoader({
				loadEntries: loadSkillEntries,
				skillsWorkspaceDir,
				skillsPromptWorkspaceDir
			}),
			config: params.attempt.config,
			workspaceDir: skillsPromptWorkspaceDir,
			agentId: params.sessionAgentId,
			eligibility: skillsEligibility,
			preserveEntryOrder
		});
		const sandbox = params.sandbox;
		const sandboxSkillReader = sandbox?.enabled ? async ({ location, signal }) => {
			const bridge = sandbox.fsBridge;
			if (!bridge) throw new Error("Sandbox filesystem bridge is unavailable for skill reads.");
			return (await bridge.readFile({
				filePath: location,
				cwd: sandbox.containerWorkdir,
				signal
			})).toString("utf8");
		} : void 0;
		return {
			restoreSkillEnv,
			skillUsagePaths,
			skillsPrompt,
			skillsSnapshotForRun: skillsSnapshot,
			codeModeSkills: resolveCodeModeSkills({
				skillsPrompt,
				candidates: skillsSnapshot?.resolvedSkills ?? skillEntries.map((entry) => entry.skill),
				reader: sandboxSkillReader
			})
		};
	} catch (error) {
		restoreSkillEnv();
		throw error;
	}
}
function startEmbeddedAttemptDiagnostics(params) {
	const diagnosticTrace = freezeDiagnosticTraceContext(getActiveDiagnosticTraceContext() ?? createDiagnosticTraceContext());
	const runTrace = freezeDiagnosticTraceContext(createChildDiagnosticTraceContext(diagnosticTrace));
	const diagnosticRunBase = {
		runId: params.runId,
		...params.sessionKey && { sessionKey: params.sessionKey },
		...params.sessionId && { sessionId: params.sessionId },
		provider: params.provider,
		model: params.modelId,
		trigger: params.trigger,
		...params.messageChannel ?? params.messageProvider ? { channel: params.messageChannel ?? params.messageProvider } : {},
		trace: runTrace
	};
	emitTrustedDiagnosticEvent({
		type: "run.started",
		...diagnosticRunBase
	});
	const startedAt = Date.now();
	let completed = false;
	const emitCompleted = (outcome, err, extra) => {
		if (completed) return;
		completed = true;
		const failed = err != null && outcome !== "blocked";
		const errorMessage = failed ? diagnosticErrorMessage(err) : void 0;
		emitTrustedDiagnosticEventWithPrivateData({
			type: "run.completed",
			...diagnosticRunBase,
			durationMs: Date.now() - startedAt,
			outcome,
			...extra?.blockedBy ? { blockedBy: extra.blockedBy } : {},
			...failed ? { errorCategory: diagnosticErrorCategory(err) } : {}
		}, errorMessage ? { errorMessage } : void 0);
	};
	return {
		diagnosticTrace,
		runTrace,
		emitCompleted
	};
}
/**
* Maps bootstrap context files into the attempt workspace.
*/
function isRelativePathInsideOrEqual(relativePath) {
	return relativePath === "" || relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
}
/**
* Rewrites injected context file paths when a bootstrap assembled in one
* workspace is replayed in another. Files outside the source workspace keep
* their original absolute path to avoid manufacturing unsafe relative paths.
*/
function remapInjectedContextFilesToWorkspace(params) {
	if (params.sourceWorkspaceDir === params.targetWorkspaceDir) return params.files;
	return params.files.map((file) => {
		const relative = path.relative(params.sourceWorkspaceDir, file.path);
		return isRelativePathInsideOrEqual(relative) ? {
			...file,
			path: relative === "" ? params.targetWorkspaceDir : path.join(params.targetWorkspaceDir, relative)
		} : file;
	});
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-bootstrap-prepare.ts
async function prepareEmbeddedAttemptBootstrap(params) {
	const { attempt } = params;
	const bootstrapWorkspaceDir = params.bootstrapWorkspaceDir ?? params.resolvedWorkspace;
	const bootstrapPromptWorkspaceDir = bootstrapWorkspaceDir === params.resolvedWorkspace ? params.effectiveWorkspace : bootstrapWorkspaceDir;
	const suppressAmbientContext = params.isRawModelRun || attempt.operation === "settled-tool-finalization";
	const contextInjectionMode = resolveContextInjectionMode(attempt.config, params.sessionAgentId);
	const bootstrapWarn = makeBootstrapWarn({
		sessionLabel: params.sessionLabel,
		workspaceDir: bootstrapWorkspaceDir,
		warn: (message) => log$5.warn(message)
	});
	const resolveWorkspaceBootstrapFiles = (workspaceDir) => resolveBootstrapFilesForRun({
		workspaceDir,
		config: attempt.config,
		sessionKey: attempt.sessionKey,
		sessionId: attempt.sessionId,
		chatType: attempt.chatType,
		agentId: params.sessionAgentId,
		warn: bootstrapWarn,
		contextMode: attempt.bootstrapContextMode,
		runKind: attempt.bootstrapContextRunKind
	});
	let completedBootstrapTurn;
	const hasCompletedBootstrapTurnForAttempt = async () => {
		completedBootstrapTurn ??= await hasCompletedBootstrapTurn(attempt.sessionTarget);
		return completedBootstrapTurn;
	};
	const resolveBootstrapRouting = (bootstrapFiles) => resolveWorkspaceBootstrapRouting({
		isWorkspaceBootstrapPending,
		bootstrapFiles,
		bootstrapContextRunKind: attempt.bootstrapContextRunKind,
		trigger: attempt.trigger,
		sessionKey: attempt.sessionKey,
		isPrimaryRun: isPrimaryBootstrapRun(attempt.sessionKey),
		isCanonicalWorkspace: attempt.isCanonicalWorkspace,
		effectiveWorkspace: params.effectiveWorkspace,
		resolvedWorkspace: bootstrapWorkspaceDir,
		hasBootstrapFileAccess: params.hasReadTool
	});
	const shouldProbeContinuationSkip = !suppressAmbientContext && contextInjectionMode === "continuation-skip" && !isHeartbeatLifecycleRunKind(attempt.bootstrapContextRunKind) && await hasCompletedBootstrapTurnForAttempt();
	let preloadedBootstrapFiles;
	let bootstrapRouting = shouldProbeContinuationSkip || suppressAmbientContext || contextInjectionMode === "never" ? await resolveBootstrapRouting() : void 0;
	if (!suppressAmbientContext && contextInjectionMode !== "never" && (bootstrapRouting === void 0 || bootstrapRouting.bootstrapMode === "full")) {
		preloadedBootstrapFiles = await resolveWorkspaceBootstrapFiles(bootstrapWorkspaceDir);
		bootstrapRouting = await resolveBootstrapRouting(preloadedBootstrapFiles);
	}
	bootstrapRouting ??= await resolveBootstrapRouting(preloadedBootstrapFiles);
	const bootstrapMode = bootstrapRouting.bootstrapMode;
	const { bootstrapFiles: hookAdjustedBootstrapFiles, contextFiles: resolvedContextFiles, shouldRecordCompletedBootstrapTurn } = await resolveAttemptBootstrapContext({
		contextInjectionMode: suppressAmbientContext ? "never" : contextInjectionMode,
		bootstrapContextMode: attempt.bootstrapContextMode,
		bootstrapContextRunKind: attempt.bootstrapContextRunKind ?? "default",
		bootstrapMode,
		hasCompletedBootstrapTurn: hasCompletedBootstrapTurnForAttempt,
		resolveBootstrapContextForRun: async () => {
			const bootstrapFiles = preloadedBootstrapFiles ?? await resolveWorkspaceBootstrapFiles(bootstrapWorkspaceDir);
			const executionAgentsPath = path.join(path.resolve(params.resolvedWorkspace), DEFAULT_AGENTS_FILENAME);
			const executionProjectFiles = bootstrapWorkspaceDir === params.resolvedWorkspace ? [] : (await resolveWorkspaceBootstrapFiles(params.resolvedWorkspace)).filter((file) => file.name === "AGENTS.md" && !file.missing && path.resolve(file.path) === executionAgentsPath);
			const layeredBootstrapFiles = [...bootstrapFiles, ...executionProjectFiles];
			return {
				bootstrapFiles: layeredBootstrapFiles,
				contextFiles: buildBootstrapContextForFiles(layeredBootstrapFiles, {
					config: attempt.config,
					agentId: params.sessionAgentId,
					warn: bootstrapWarn
				})
			};
		}
	});
	params.markStage("bootstrap-context");
	const remappedContextFiles = remapInjectedContextFilesToWorkspace({
		files: resolvedContextFiles,
		sourceWorkspaceDir: bootstrapWorkspaceDir,
		targetWorkspaceDir: bootstrapPromptWorkspaceDir
	});
	const contextFiles = bootstrapRouting.includeBootstrapInSystemContext ? remappedContextFiles : remappedContextFiles.filter((file) => !/(^|[\\/])BOOTSTRAP\.md$/iu.test(file.path.trim()));
	const bootstrapInjectionStats = buildBootstrapInjectionStats({
		bootstrapFiles: hookAdjustedBootstrapFiles,
		injectedFiles: contextFiles
	});
	const bootstrapBudgetFiles = bootstrapRouting.includeBootstrapInSystemContext ? bootstrapInjectionStats : bootstrapInjectionStats.filter((_, index) => hookAdjustedBootstrapFiles[index].name !== DEFAULT_BOOTSTRAP_FILENAME);
	const bootstrapBudget = buildBootstrapBudgetState({
		config: attempt.config,
		agentId: params.sessionAgentId,
		files: bootstrapBudgetFiles,
		seenSignatures: attempt.bootstrapPromptWarningSignaturesSeen,
		previousSignature: attempt.bootstrapPromptWarningSignature
	});
	const workspaceNotes = [];
	if (hookAdjustedBootstrapFiles.some((file) => file.name === "BOOTSTRAP.md" && !file.missing)) workspaceNotes.push("Reminder: commit your changes in this workspace after edits.");
	if (isEmbeddedMode()) workspaceNotes.push("Running in local embedded mode (no gateway). Most tools work locally. Gateway-dependent tools (canvas, nodes, cron, message, sessions_send, sessions_spawn, gateway) are unavailable. Subagent kill/steer require a gateway. Do not attempt to read gateway-specific files such as sessions.json, gateway.log, or gateway.pid.");
	return {
		...bootstrapBudget,
		bootstrapMode,
		contextFiles,
		bootstrapInjectionStats,
		shouldRecordCompletedBootstrapTurn,
		workspaceNotes
	};
}
//#endregion
//#region src/agents/tool-schema-quarantine.ts
/**
* Runtime tool-schema quarantine logging.
*
* Model providers can reject unsupported schema shapes, so runtime projection
* reports quarantined tools with trusted diagnostics before the model call.
*/
const log$4 = createSubsystemLogger("agents/tools");
function readDiagnosticPluginId(params) {
	try {
		const tool = params.tools[params.diagnostic.toolIndex];
		return tool ? getPluginToolMeta(tool)?.pluginId : void 0;
	} catch {
		return;
	}
}
function pluginOwner(pluginId) {
	return pluginId ? `plugin:${pluginId}` : void 0;
}
function toolQuarantineKey(params) {
	return JSON.stringify([params.owner ?? "", params.toolName]);
}
function readToolIdentity(tool) {
	try {
		if (typeof tool.name !== "string" || tool.name.length === 0) return;
		const owner = pluginOwner(getPluginToolMeta(tool)?.pluginId);
		return owner ? {
			owner,
			toolName: tool.name
		} : { toolName: tool.name };
	} catch {
		return;
	}
}
function listHealthyToolIdentities(params) {
	const failingKeys = new Set(params.diagnostics.map((diagnostic) => toolQuarantineKey({
		owner: pluginOwner(readDiagnosticPluginId({
			tools: params.tools,
			diagnostic
		})),
		toolName: diagnostic.toolName
	})));
	const healthy = [];
	for (const tool of params.tools) {
		const identity = readToolIdentity(tool);
		if (identity && !failingKeys.has(toolQuarantineKey(identity))) healthy.push(identity);
	}
	return healthy;
}
/** Emits diagnostics and logs for tools removed from runtime schema projection. */
function logRuntimeToolSchemaQuarantine(params) {
	clearRecoveredPersistedRuntimeToolSchemaQuarantines(() => listHealthyToolIdentities({
		diagnostics: params.diagnostics,
		tools: params.tools
	}));
	if (params.diagnostics.length === 0) return;
	const summary = params.diagnostics.map((diagnostic) => {
		const pluginId = readDiagnosticPluginId({
			tools: params.tools,
			diagnostic
		});
		const owner = pluginId ? ` plugin=${pluginId}` : "";
		emitTrustedDiagnosticEvent({
			type: "tool.execution.blocked",
			runId: params.runId,
			agentId: params.agentId,
			...params.sessionKey ? { sessionKey: params.sessionKey } : {},
			...params.sessionId ? { sessionId: params.sessionId } : {},
			toolName: diagnostic.toolName,
			toolSource: pluginId ? "plugin" : "core",
			...pluginId ? { toolOwner: pluginId } : {},
			deniedReason: "unsupported_tool_schema",
			reason: diagnostic.violations.join(", ")
		});
		try {
			const persistedOwner = pluginOwner(pluginId);
			recordPersistedRuntimeToolSchemaQuarantine({
				toolName: diagnostic.toolName,
				...persistedOwner ? { owner: persistedOwner } : {},
				reason: diagnostic.violations.join(", "),
				failedAt: /* @__PURE__ */ new Date()
			});
		} catch {}
		return `${diagnostic.toolName}${owner}: ${diagnostic.violations.join(", ")}`;
	}).join("; ");
	log$4.warn(`[tools] quarantined ${params.diagnostics.length} unsupported tool schema${params.diagnostics.length === 1 ? "" : "s"} before model runtime projection: ${summary}. Run openclaw doctor for details.`);
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-bundle-tools.ts
async function prepareEmbeddedAttemptBundleTools(params) {
 return bundlePrepObserver.run(params.attempt, () => prepareEmbeddedAttemptBundleToolsObserved(params));
}
async function prepareEmbeddedAttemptBundleToolsObserved(params) {
 bundlePrepObserver.mark("bundle-start");
	const { cronCreatorToolAllowlist, cronCreatorToolAllowlistCaptureRef, effectiveToolsAllow, inheritedToolAllowlist, localModelLeanPreserveToolNames, runtimeCapabilityProfile, toolsEnabled, toolsRaw } = params.preparedToolBase;
	const normalizeTools = (tools) => normalizeAgentRuntimeTools({
		runtimePlan: params.attempt.runtimePlan,
		tools,
		provider: params.attempt.provider,
		config: params.attempt.config,
		workspaceDir: params.effectiveWorkspace,
		env: process.env,
		modelId: params.attempt.modelId,
		modelApi: params.attempt.model.api,
		model: params.attempt.model,
		runtimeHandle: params.getProviderRuntimeHandle(),
		onPreNormalizationSchemaDiagnostics: (diagnostics, sourceTools) => logRuntimeToolSchemaQuarantine({
			diagnostics,
			tools: sourceTools,
			runId: params.attempt.runId,
			agentId: params.sessionAgentId,
			sessionKey: params.attempt.sessionKey,
			sessionId: params.attempt.sessionId
		})
	});
	const tools = normalizeTools(toolsEnabled ? toolsRaw : []);
	bundlePrepObserver.mark("normalize-core-end");
	const providedClientTools = toolsEnabled && !params.attempt.disableTools && !params.isRawModelRun && !params.attempt.forceRestartSafeTools && params.attempt.codeModeRecovery?.kind !== "inspect" ? params.attempt.clientTools : void 0;
	let clientTools = providedClientTools;
	if (providedClientTools && effectiveToolsAllow) {
		clientTools = [];
		if (providedClientTools.length > 0) {
			const matchesRuntime = createRuntimeToolMatcher(effectiveToolsAllow);
			clientTools = providedClientTools.filter((definition) => matchesRuntime(definition.function.name));
		}
	}
	bundlePrepObserver.mark("metadata-start");
	const bundleMetadataSnapshot = params.getCurrentAttemptPluginMetadataSnapshot();
	const bundleManifestRegistry = bundleMetadataSnapshot?.pluginIds === void 0 ? bundleMetadataSnapshot?.manifestRegistry : void 0;
	bundlePrepObserver.mark("metadata-end");
	const mcpConfig = {
		workspaceDir: params.effectiveWorkspace,
		cfg: params.attempt.config,
		manifestRegistry: bundleManifestRegistry,
		toolOverrides: params.attempt.toolOverrides
	};
	bundlePrepObserver.mark("mcp-runtime-start");
	const bundleMcpSessionRuntime = !params.attempt.forceRestartSafeTools && params.attempt.codeModeRecovery?.kind !== "inspect" && shouldCreateBundleMcpRuntimeForAttempt({
		toolsEnabled,
		disableTools: params.attempt.disableTools || params.isRawModelRun,
		toolsAllow: params.attempt.toolsAllow,
		resolveConfiguredMcpNamespaces: () => {
			const configuredNames = Object.keys(params.attempt.config?.mcp?.servers ?? {});
			if (configuredNames.length === 0) return [];
			const { loaded } = loadSessionMcpConfig({
				...mcpConfig,
				logDiagnostics: false
			});
			const safeNames = assignSafeServerNames(Object.keys(loaded.mcpServers));
			return configuredNames.flatMap((name) => {
				const safeName = safeNames.get(name);
				return safeName ? [`${safeName}__`] : [];
			});
		}
	}) ? await getOrCreateSessionMcpRuntime({
		...mcpConfig,
		sessionId: params.attempt.sessionId,
		sessionKey: params.attempt.sessionKey,
		agentDir: params.agentDir,
		requesterSenderId: params.attempt.senderId,
		agentAccountId: params.attempt.agentAccountId,
		messageChannel: params.attempt.messageChannel ?? params.attempt.messageProvider
	}) : void 0;
	bundlePrepObserver.mark("mcp-runtime-end");
	const bundleMcpRuntime = bundleMcpSessionRuntime ? await materializeBundleMcpToolsForRun({
		runtime: bundleMcpSessionRuntime,
		agentId: params.sessionAgentId,
		reservedToolNames: [...tools.map((tool) => tool.name), ...clientTools?.map((tool) => tool.function.name) ?? []]
	}) : void 0;
	bundlePrepObserver.mark("mcp-materialize-end");
	let bundleLspRuntime;
	try {
		bundleLspRuntime = !params.attempt.forceRestartSafeTools && params.attempt.codeModeRecovery?.kind !== "inspect" && shouldCreateBundleLspRuntimeForAttempt({
			toolsEnabled,
			disableTools: params.attempt.disableTools || params.isRawModelRun,
			toolsAllow: params.attempt.toolsAllow
		}) ? await createBundleLspToolRuntime({
			workspaceDir: params.effectiveWorkspace,
			cfg: params.attempt.config,
			manifestRegistry: bundleManifestRegistry,
			reservedToolNames: [
				...tools.map((tool) => tool.name),
				...clientTools?.map((tool) => tool.function.name) ?? [],
				...bundleMcpRuntime?.tools.map((tool) => tool.name) ?? []
			]
		}) : void 0;
	bundlePrepObserver.mark("lsp-end");
		const allowedBundleMcpTools = applyEmbeddedAttemptToolsAllow(bundleMcpRuntime?.tools ?? [], effectiveToolsAllow, { toolMeta: (tool) => getPluginToolMeta(tool) });
		const allowedBundleLspTools = applyEmbeddedAttemptToolsAllow(bundleLspRuntime?.tools ?? [], effectiveToolsAllow, { toolMeta: (tool) => getPluginToolMeta(tool) });
		const filteredBundledTools = applyFinalEffectiveToolPolicy({
			bundledTools: [...allowedBundleMcpTools, ...allowedBundleLspTools],
			config: params.attempt.config,
			workspaceDir: params.effectiveWorkspace,
			metadataSnapshot: bundleMetadataSnapshot,
			conversationCapabilityProfile: runtimeCapabilityProfile,
			warn: (message) => log$5.warn(message)
		});
		if (bundleMcpRuntime?.restrictAppTools) {
			const runtimeAllowedAppTools = applyEmbeddedAttemptToolsAllow(bundleMcpRuntime.appTools ?? bundleMcpRuntime.tools, effectiveToolsAllow, { toolMeta: (tool) => getPluginToolMeta(tool) });
			const allowedAppTools = applyFinalEffectiveToolPolicy({
				bundledTools: runtimeAllowedAppTools,
				config: params.attempt.config,
				workspaceDir: params.effectiveWorkspace,
				metadataSnapshot: bundleMetadataSnapshot,
				conversationCapabilityProfile: runtimeCapabilityProfile,
				warn: (message) => log$5.warn(message)
			});
			bundleMcpRuntime.restrictAppTools(allowedAppTools);
		}
		const normalizedBundledTools = filteredBundledTools.length > 0 ? normalizeTools(filteredBundledTools) : filteredBundledTools;
	bundlePrepObserver.mark("policy-normalize-end");
		const projectTools = (coreTools) => {
			const projectedTools = filterLocalModelLeanTools({
				tools: [...coreTools, ...normalizedBundledTools].map((tool) => wrapToolWithAbortSignal(tool, params.preparedToolBase.toolAbortSignal)),
				config: params.attempt.config,
				agentId: params.sessionAgentId,
				preserveToolNames: localModelLeanPreserveToolNames
			});
			const schemaProjection = filterRuntimeCompatibleTools(projectedTools);
			if (cronCreatorToolAllowlistCaptureRef) captureFinalEffectiveCronCreatorToolAllowlist(cronCreatorToolAllowlist, cronCreatorToolAllowlistCaptureRef, schemaProjection.tools, (tool) => getPluginToolMeta(tool));
			if (inheritedToolAllowlist?.length) replaceWithEffectiveToolAllowlist(inheritedToolAllowlist, schemaProjection.tools);
			logRuntimeToolSchemaQuarantine({
				diagnostics: schemaProjection.diagnostics,
				tools: projectedTools,
				runId: params.attempt.runId,
				agentId: params.sessionAgentId,
				sessionKey: params.attempt.sessionKey,
				sessionId: params.attempt.sessionId
			});
			return schemaProjection.tools;
		};
		const uncompactedEffectiveTools = [...projectTools(tools)];
 bundlePrepObserver.mark("projection-end");
		return {
			bundleLspRuntime,
			bundleMcpRuntime,
			clientTools,
			tools,
			uncompactedEffectiveTools,
			refreshTools: () => {
				const nextTools = normalizeTools(toolsEnabled ? toolsRaw : []);
				tools.splice(0, tools.length, ...nextTools);
				const nextEffectiveTools = projectTools(tools);
				uncompactedEffectiveTools.splice(0, uncompactedEffectiveTools.length, ...nextEffectiveTools);
			}
		};
	} catch (error) {
		try {
			await bundleMcpRuntime?.dispose();
		} catch {}
		try {
			await bundleLspRuntime?.dispose();
		} catch {}
		throw error;
	}
}
//#endregion
//#region src/agents/embedded-agent-runner/wait-for-idle-before-flush.ts
/**
* Waits for tool-result streams to become idle before flushing output.
*/
const DEFAULT_WAIT_FOR_IDLE_TIMEOUT_MS = 3e4;
async function waitForAgentIdleBestEffort(agent, timeoutMs) {
	const waitForIdle = agent?.waitForIdle;
	if (typeof waitForIdle !== "function") return false;
	const resolvedTimeoutMs = resolveTimerTimeoutMs(timeoutMs, DEFAULT_WAIT_FOR_IDLE_TIMEOUT_MS);
	const idleResolved = Symbol("idle");
	const idleTimedOut = Symbol("timeout");
	let timeoutHandle;
	try {
		return await Promise.race([waitForIdle.call(agent).then(() => idleResolved), new Promise((resolve) => {
			timeoutHandle = setTimeout(() => resolve(idleTimedOut), resolvedTimeoutMs);
			timeoutHandle.unref?.();
		})]) === idleTimedOut;
	} catch {
		return false;
	} finally {
		if (timeoutHandle) clearTimeout(timeoutHandle);
	}
}
async function flushPendingToolResultsAfterIdle(opts) {
	if (!(opts.timeoutMs !== void 0 && opts.timeoutMs <= 0)) await waitForAgentIdleBestEffort(opts.agent, opts.timeoutMs ?? DEFAULT_WAIT_FOR_IDLE_TIMEOUT_MS);
	opts.sessionManager?.flushPendingToolResults?.();
}
//#endregion
//#region src/trajectory/metadata.ts
function toSortedUniqueStrings(values) {
	if (!values || values.length === 0) return;
	return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))].map((value) => value.trim()).toSorted((left, right) => left.localeCompare(right));
}
function buildPluginsFromActiveRegistry() {
	const registry = getActivePluginRegistry();
	if (!registry || registry.plugins.length === 0) return null;
	return {
		source: "active-registry",
		importedRuntimePluginIds: listImportedRuntimePluginIds(),
		entries: registry.plugins.map((plugin) => ({
			id: plugin.id,
			name: plugin.name,
			version: plugin.version,
			description: plugin.description,
			origin: plugin.origin,
			enabled: plugin.enabled,
			explicitlyEnabled: plugin.explicitlyEnabled,
			activated: plugin.activated,
			imported: plugin.imported,
			activationSource: plugin.activationSource,
			activationReason: plugin.activationReason,
			status: plugin.status,
			error: plugin.error,
			format: plugin.format,
			bundleFormat: plugin.bundleFormat,
			bundleCapabilities: plugin.bundleCapabilities,
			kind: plugin.kind,
			source: plugin.source,
			rootDir: plugin.rootDir,
			workspaceDir: plugin.workspaceDir,
			toolNames: toSortedUniqueStrings(plugin.toolNames),
			hookNames: toSortedUniqueStrings(plugin.hookNames),
			channelIds: toSortedUniqueStrings(plugin.channelIds),
			cliBackendIds: toSortedUniqueStrings(plugin.cliBackendIds),
			providerIds: toSortedUniqueStrings(plugin.providerIds),
			speechProviderIds: toSortedUniqueStrings(plugin.speechProviderIds),
			realtimeTranscriptionProviderIds: toSortedUniqueStrings(plugin.realtimeTranscriptionProviderIds),
			realtimeVoiceProviderIds: toSortedUniqueStrings(plugin.realtimeVoiceProviderIds),
			mediaUnderstandingProviderIds: toSortedUniqueStrings(plugin.mediaUnderstandingProviderIds),
			imageGenerationProviderIds: toSortedUniqueStrings(plugin.imageGenerationProviderIds),
			videoGenerationProviderIds: toSortedUniqueStrings(plugin.videoGenerationProviderIds),
			musicGenerationProviderIds: toSortedUniqueStrings(plugin.musicGenerationProviderIds),
			webFetchProviderIds: toSortedUniqueStrings(plugin.webFetchProviderIds),
			webSearchProviderIds: toSortedUniqueStrings(plugin.webSearchProviderIds),
			agentHarnessIds: toSortedUniqueStrings(plugin.agentHarnessIds)
		})).toSorted((left, right) => left.id.localeCompare(right.id))
	};
}
function buildPluginsFromManifest(params) {
	return {
		source: "manifest-registry",
		entries: (params.pluginMetadataSnapshot ?? loadPluginMetadataSnapshot({
			config: params.config ?? {},
			workspaceDir: params.workspaceDir,
			env: params.env ?? process.env
		})).plugins.map((plugin) => ({
			id: plugin.id,
			name: plugin.name,
			version: plugin.version,
			description: plugin.description,
			origin: plugin.origin,
			enabledByDefault: plugin.enabledByDefault,
			format: plugin.format,
			bundleFormat: plugin.bundleFormat,
			bundleCapabilities: toSortedUniqueStrings(plugin.bundleCapabilities),
			kind: plugin.kind,
			source: plugin.source,
			rootDir: plugin.rootDir,
			workspaceDir: plugin.workspaceDir,
			channels: toSortedUniqueStrings(plugin.channels),
			providers: toSortedUniqueStrings(plugin.providers),
			cliBackends: toSortedUniqueStrings(plugin.cliBackends),
			hooks: toSortedUniqueStrings(plugin.hooks),
			skills: toSortedUniqueStrings(plugin.skills)
		})).toSorted((left, right) => left.id.localeCompare(right.id))
	};
}
function buildSkillsCapture(skillsSnapshot, redaction) {
	if (!skillsSnapshot) return;
	const filteredResolvedSkills = skillsSnapshot.resolvedSkills?.filter((skill) => typeof skill.name === "string" && skill.name.length > 0) ?? [];
	const entries = filteredResolvedSkills.length > 0 ? filteredResolvedSkills.map((skill) => ({
		id: skill.name,
		name: skill.name,
		description: skill.description,
		filePath: redactPathForSupport(skill.filePath, redaction),
		baseDir: redactPathForSupport(skill.baseDir, redaction),
		source: skill.source,
		sourceInfo: sanitizeSupportSnapshotValue(skill.sourceInfo, redaction),
		disableModelInvocation: skill.disableModelInvocation,
		available: true
	})) : skillsSnapshot.skills.filter((skill) => typeof skill.name === "string" && skill.name.length > 0).map((skill) => ({
		id: skill.name,
		name: skill.name,
		primaryEnv: skill.primaryEnv,
		requiredEnv: skill.requiredEnv,
		available: true
	}));
	return {
		snapshotVersion: skillsSnapshot.version,
		skillFilter: toSortedUniqueStrings(skillsSnapshot.skillFilter),
		entries: entries.toSorted((left, right) => (left.name ?? "").localeCompare(right.name ?? ""))
	};
}
function buildTrajectorySupportRedaction(env) {
	return {
		env,
		stateDir: resolveStateDir(env)
	};
}
function buildTrajectoryRunMetadata(params) {
	const env = params.env ?? process.env;
	const redaction = buildTrajectorySupportRedaction(env);
	const os = resolveOsSummary();
	const plugins = buildPluginsFromActiveRegistry() ?? buildPluginsFromManifest({
		config: params.config,
		...params.pluginMetadataSnapshot ? { pluginMetadataSnapshot: params.pluginMetadataSnapshot } : {},
		workspaceDir: params.workspaceDir,
		env
	});
	return {
		capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
		harness: {
			type: "openclaw",
			name: "OpenClaw",
			version: VERSION,
			gitSha: resolveCommitHash({
				cwd: params.workspaceDir,
				env,
				moduleUrl: import.meta.url
			}) ?? void 0,
			os,
			runtime: { node: process.version },
			invocation: sanitizeSupportSnapshotValue([...process.argv], redaction, "programArguments"),
			entrypoint: process.argv[1] ? redactPathForSupport(process.argv[1], redaction) : void 0,
			workspaceDir: redactPathForSupport(params.workspaceDir, redaction),
			sessionFile: params.sessionFile ? redactPathForSupport(params.sessionFile, redaction) : void 0
		},
		model: {
			provider: params.provider,
			name: params.modelId,
			api: params.modelApi,
			fastMode: params.fastMode ?? false,
			thinkLevel: params.thinkLevel,
			reasoningLevel: params.reasoningLevel ?? "off"
		},
		config: {
			redacted: params.config ? redactConfigObject(params.config) : void 0,
			runtime: {
				timeoutMs: params.timeoutMs,
				trigger: params.trigger,
				disableTools: params.disableTools ?? false,
				toolResultFormat: params.toolResultFormat,
				toolsAllow: toSortedUniqueStrings(params.toolsAllow)
			}
		},
		plugins,
		skills: buildSkillsCapture(params.skillsSnapshot, redaction),
		prompting: {
			skillsPrompt: params.skillsSnapshot?.prompt,
			userPromptPrefixText: params.userPromptPrefixText,
			systemPromptReport: params.systemPromptReport
		},
		redaction: {
			config: {
				mode: "redactConfigObject",
				secretsMasked: true
			},
			payloads: {
				mode: "sanitizeDiagnosticPayload",
				credentialsRemoved: true,
				imageDataRedacted: true
			},
			harness: {
				mode: "diagnostic-support-redaction",
				programArgumentsRedacted: true,
				localPathsRedacted: true
			}
		},
		metadata: {
			sessionKey: params.sessionKey,
			agentId: params.agentId,
			messageProvider: params.messageProvider,
			messageChannel: params.messageChannel
		}
	};
}
function buildTrajectoryArtifacts(params) {
	return {
		capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
		finalStatus: params.status,
		aborted: params.aborted,
		externalAbort: params.externalAbort,
		timedOut: params.timedOut,
		idleTimedOut: params.idleTimedOut,
		timedOutDuringCompaction: params.timedOutDuringCompaction,
		timedOutDuringToolExecution: params.timedOutDuringToolExecution,
		timedOutByRunBudget: params.timedOutByRunBudget,
		promptError: params.promptError,
		promptErrorSource: params.promptErrorSource,
		terminalError: params.terminalError,
		usage: params.usage,
		promptCache: params.promptCache,
		compactionCount: params.compactionCount,
		assistantTexts: params.assistantTexts,
		stopReason: params.stopReason,
		finalPromptText: params.finalPromptText,
		itemLifecycle: params.itemLifecycle,
		toolMetas: params.toolMetas,
		didSendViaMessagingTool: params.didSendViaMessagingTool,
		successfulCronAdds: params.successfulCronAdds,
		messagingToolSentTexts: params.messagingToolSentTexts,
		messagingToolSentMediaUrls: params.messagingToolSentMediaUrls,
		messagingToolSentTargets: params.messagingToolSentTargets,
		lastToolError: params.lastToolError
	};
}
//#endregion
//#region src/infra/agent-activity-events.ts
/** Emits a typed activity event on the shared agent event bus. */
function emitAgentActivityEvent(params) {
	emitAgentEvent({
		runId: params.runId,
		stream: params.stream,
		data: params.data,
		...params.sessionKey ? { sessionKey: params.sessionKey } : {}
	});
}
//#endregion
//#region src/agents/tool-error-state.ts
/** Track the run's last tool failure until the same tool succeeds. */
function createToolErrorState() {
	let lastToolError;
	const terminalState = () => lastToolError ? { lastToolError } : {};
	return {
		recordFailure(failure) {
			lastToolError = failure;
			return terminalState();
		},
		recordSuccess(toolName) {
			if (lastToolError && normalizeLowercaseStringOrEmpty(lastToolError.toolName) === normalizeLowercaseStringOrEmpty(toolName)) lastToolError = void 0;
			return terminalState();
		}
	};
}
//#endregion
//#region src/agents/tool-terminal-outcome.ts
/** Build one attempt-scoped facts-in/state-out terminal observer for every harness. */
function createToolTerminalObserver(runId) {
	const errors = createToolErrorState();
	return (observation) => {
		const trackedExecutionStarted = observation.toolCallId ? consumeTrackedToolExecutionStarted(observation.toolCallId, runId) : void 0;
		const trackedArguments = observation.toolCallId ? peekAdjustedParamsForToolCall(observation.toolCallId, runId) : void 0;
		const executionPrevented = observation.toolCallId ? peekPreExecutionBlockedToolCall(observation.toolCallId, runId) : false;
		const executionStarted = (trackedExecutionStarted ?? observation.executionStarted ?? true) && !executionPrevented;
		const executedArguments = asOptionalRecord(trackedArguments) ?? asOptionalRecord(observation.arguments);
		const mutation = observation.ownerMutation ? buildToolMutationState(observation.toolName, executedArguments, { ownerKey: observation.ownerMutation.ownerKey }) : observation.nativeMutation ?? buildToolMutationState(observation.toolName, executedArguments);
		const replaySafe = observation.replaySafe ?? mutation.replaySafe;
		let lastToolError;
		if (observation.outcome === "failure") {
			const mutatingAction = executionStarted && mutation.mutatingAction;
			const failure = {
				toolName: observation.toolName,
				...observation.meta ? { meta: observation.meta } : {},
				...observation.failure,
				executionStarted,
				mutatingAction
			};
			lastToolError = errors.recordFailure(failure).lastToolError;
		} else lastToolError = errors.recordSuccess(observation.toolName).lastToolError;
		return {
			...lastToolError ? { lastToolError } : {},
			executionStarted,
			...executedArguments ? { executedArguments } : {},
			sideEffectEvidence: executionStarted && !replaySafe,
			effectReceipt: buildToolEffectReceipt({
				executionStarted,
				mutatingAction: mutation.mutatingAction,
				replaySafe,
				outcome: observation.outcome
			})
		};
	};
}
//#endregion
//#region src/agents/embedded-agent-subscribe.handlers.tools.results.ts
const execApprovalReplyModuleLoader = createLazyImportLoader(() => import("./exec-approval-reply-AZlpL_NT.js"));
const hookRunnerGlobalModuleLoader = createLazyImportLoader(() => import("./plugins/hook-runner-global.js"));
const fallbackToolTerminalObservers = /* @__PURE__ */ new WeakMap();
function resolveFallbackToolTerminalObserver(ctx) {
	const existing = fallbackToolTerminalObservers.get(ctx.state);
	if (existing) return existing;
	const created = createToolTerminalObserver(ctx.params.runId);
	fallbackToolTerminalObservers.set(ctx.state, created);
	return created;
}
function readProgressCardPlanInput(args) {
	const params = asOptionalRecord(args);
	if (!params) return;
	try {
		return { steps: normalizeProgressCardInput({
			markdown: params.markdown,
			plan: params.plan
		}).steps ?? [] };
	} catch (error) {
		if (error instanceof ProgressCardInputError) return;
		throw error;
	}
}
function isMiddlewareToolResultError(result) {
	if (!result || typeof result !== "object") return false;
	const details = result.details;
	return Boolean(details && typeof details === "object" && !Array.isArray(details) && details.middlewareError === true);
}
function hasTerminalControlCharacter(value) {
	for (const char of value) {
		const code = char.charCodeAt(0);
		if (code <= 31 || code >= 127 && code <= 159) return true;
	}
	return false;
}
const PROCESS_TERMINATION_REASONS = /* @__PURE__ */ new Set([
	"manual-cancel",
	"overall-timeout",
	"no-output-timeout",
	"spawn-error",
	"signal",
	"exit"
]);
function readSafeProcessSessionId(value) {
	const sessionId = readStringValue(value)?.trim();
	if (!sessionId || sessionId.length > 160 || hasTerminalControlCharacter(sessionId)) return;
	return sessionId;
}
function buildProcessTerminalDiagnostic(toolName, args, sanitizedResult) {
	if (toolName !== "process") return;
	const action = normalizeOptionalLowercaseString(args.action);
	if (action !== "poll" && action !== "log") return;
	const details = readToolResultDetails(sanitizedResult);
	const sessionId = readSafeProcessSessionId(details?.sessionId);
	if (!sessionId) return;
	const exitReason = normalizeOptionalLowercaseString(details?.exitReason);
	const hasCanonicalExitReason = PROCESS_TERMINATION_REASONS.has(exitReason ?? "");
	if (action === "log" && !hasCanonicalExitReason) return;
	const timeoutKind = exitReason === "overall-timeout" || exitReason === "no-output-timeout" ? exitReason : void 0;
	let reason;
	if (details?.timedOut === true || timeoutKind) reason = {
		kind: "timeout",
		...timeoutKind ? { timeoutKind } : {}
	};
	else if (typeof details?.exitSignal === "string" && details.exitSignal.trim().length > 0 && details.exitSignal.trim().length <= 32 || typeof details?.exitSignal === "number" && Number.isFinite(details.exitSignal)) {
		const signal = typeof details.exitSignal === "string" ? details.exitSignal.trim() : details.exitSignal;
		if (!hasTerminalControlCharacter(String(signal))) reason = {
			kind: "signal",
			signal
		};
	} else if (typeof details?.exitCode === "number" && Number.isSafeInteger(details.exitCode) && details.exitCode !== 0) reason = {
		kind: "exit",
		exitCode: details.exitCode
	};
	if (!reason) return;
	return {
		kind: "process",
		sessionId,
		reason
	};
}
function loadExecApprovalReply() {
	return execApprovalReplyModuleLoader.load();
}
function loadHookRunnerGlobal() {
	return hookRunnerGlobalModuleLoader.load();
}
function isCronAddAction(args) {
	if (!args || typeof args !== "object") return false;
	const action = args.action;
	return normalizeOptionalLowercaseString(action) === "add";
}
function applyCurrentMessageProvider(toolName, args, currentProvider) {
	if (toolName !== "message" || readStringValue(args.provider) || readStringValue(args.channel) || !currentProvider) return args;
	return {
		...args,
		provider: currentProvider
	};
}
function applyToolSendReceiptForExtraction(result, receiptResult) {
	const toolSend = readToolResultDetails(receiptResult)?.toolSend;
	if (toolSend === void 0) return result;
	return {
		...asOptionalRecord(result),
		details: {
			...readToolResultDetails(result),
			toolSend
		}
	};
}
function isAsyncStartedToolResult(result) {
	const details = readToolResultDetails(result);
	return details?.async === true && details.status === "started";
}
function readAsyncStartedTaskIds(result) {
	const details = readToolResultDetails(result);
	if (!details) return {};
	const nestedTask = asOptionalRecord(details.task);
	const asyncTaskRunId = readStringValue(details.runId) ?? readStringValue(nestedTask?.runId);
	const asyncTaskId = readStringValue(details.taskId) ?? readStringValue(nestedTask?.taskId);
	return {
		...asyncTaskRunId ? { asyncTaskRunId } : {},
		...asyncTaskId ? { asyncTaskId } : {}
	};
}
function readExecToolDetails(result) {
	const details = readToolResultDetails(result);
	if (!details || typeof details.status !== "string") return null;
	return details;
}
function extractExecOutput(result) {
	const execDetails = readExecToolDetails(result);
	const output = execDetails && "aggregated" in execDetails ? execDetails.aggregated : extractToolResultText(result);
	return typeof output === "string" ? output : void 0;
}
function extractLiveExecOutput(result) {
	const output = extractExecOutput(result);
	return typeof output === "string" ? truncateLiveExecOutput(output) : void 0;
}
function isOpenClawExecutable(token) {
	return normalizeOptionalLowercaseString(token)?.split(/[\\/]/).at(-1) === "openclaw";
}
function isOpenClawPackageSpec(token) {
	const packageSpec = normalizeOptionalLowercaseString(token);
	return packageSpec?.startsWith("openclaw@") === true && packageSpec.length > 9;
}
function skipOpenClawPackageRunner(tokens, startIndex) {
	let commandIndex = startIndex;
	let acceptsPackageSpec = false;
	let runner = normalizeOptionalLowercaseString(tokens[commandIndex]);
	if (runner === "corepack" && normalizeOptionalLowercaseString(tokens[commandIndex + 1]) === "pnpm") {
		commandIndex += 1;
		runner = "pnpm";
	}
	if (runner === "pnpm") {
		const subcommand = normalizeOptionalLowercaseString(tokens[commandIndex + 1]);
		if (subcommand === "exec" || subcommand === "dlx") {
			commandIndex += 2;
			acceptsPackageSpec = subcommand === "dlx";
		} else commandIndex = startIndex;
	} else if (runner === "npx" || runner === "bunx") {
		commandIndex += 1;
		acceptsPackageSpec = true;
		while (true) {
			const option = normalizeOptionalLowercaseString(tokens[commandIndex]);
			if (option === "-y" || option === "--yes" || option === "--no-install" || option === "--bun") {
				commandIndex += 1;
				continue;
			}
			if (option === "-p" || option === "--package") {
				commandIndex += 2;
				continue;
			}
			if (option?.startsWith("--package=") || option?.startsWith("--yes=")) {
				commandIndex += 1;
				continue;
			}
			break;
		}
	}
	if (tokens[commandIndex] === "--") commandIndex += 1;
	return {
		commandIndex,
		acceptsPackageSpec
	};
}
function isOpenClawCronAddShellCommand(args) {
	const record = asOptionalObjectRecord(args);
	const command = readStringValue(record?.command) ?? readStringValue(record?.cmd);
	if (!command || hasTopLevelShellControlOperator(command)) return false;
	const tokens = splitShellArgs(command);
	if (!tokens || tokens.length < 3) return false;
	let commandIndex = 0;
	if (normalizeOptionalLowercaseString(tokens[commandIndex]) === "env") commandIndex += 1;
	while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(tokens[commandIndex] ?? "")) commandIndex += 1;
	const packageRunner = skipOpenClawPackageRunner(tokens, commandIndex);
	commandIndex = packageRunner.commandIndex;
	let cliArgIndex = commandIndex + 1;
	for (let consumed = consumeRootOptionToken(tokens, cliArgIndex); consumed > 0; consumed = consumeRootOptionToken(tokens, cliArgIndex)) cliArgIndex += consumed;
	const action = normalizeOptionalLowercaseString(tokens[cliArgIndex + 1]);
	const actionArgs = tokens.slice(cliArgIndex + 2);
	return (isOpenClawExecutable(tokens[commandIndex]) || packageRunner.acceptsPackageSpec && isOpenClawPackageSpec(tokens[commandIndex])) && (normalizeOptionalLowercaseString(tokens[cliArgIndex]) === "cron" || normalizeOptionalLowercaseString(tokens[cliArgIndex]) === "automations") && (action === "add" || action === "create") && !actionArgs.some((token) => token === "-h" || token === "--help");
}
function didShellCronAddSucceed(args, result) {
	if (!isOpenClawCronAddShellCommand(args)) return false;
	const details = readExecToolDetails(result);
	return details?.status === "completed" && details.exitCode === 0;
}
function readApplyPatchSummary(result) {
	const details = readToolResultDetails(result);
	const summary = details?.summary && typeof details.summary === "object" && !Array.isArray(details.summary) ? details.summary : null;
	if (!summary) return null;
	return {
		added: Array.isArray(summary.added) ? summary.added.filter((entry) => typeof entry === "string") : [],
		modified: Array.isArray(summary.modified) ? summary.modified.filter((entry) => typeof entry === "string") : [],
		deleted: Array.isArray(summary.deleted) ? summary.deleted.filter((entry) => typeof entry === "string") : []
	};
}
function shouldSuppressStructuredMediaToolOutput(params) {
	return params.toolName === "tts" && params.rawToolName.trim() === "tts" && params.builtinToolNames?.has("tts") === true && !params.isToolError && params.hasDeliverableStructuredMedia;
}
function buildPatchSummaryText(summary) {
	const parts = [];
	if (summary.added.length > 0) parts.push(`${summary.added.length} added`);
	if (summary.modified.length > 0) parts.push(`${summary.modified.length} modified`);
	if (summary.deleted.length > 0) parts.push(`${summary.deleted.length} deleted`);
	return parts.length > 0 ? parts.join(", ") : "no file changes recorded";
}
function readMessagingText(record) {
	for (const key of [
		"content",
		"message",
		"text",
		"body"
	]) {
		const value = readStringValue(record[key]);
		if (value) return value;
	}
}
function hasMessagingRichContent(record) {
	const payload = {
		presentation: record.presentation,
		interactive: record.interactive,
		channelData: record.channelData
	};
	try {
		parseJsonMessageParam(payload, "presentation");
		parseInteractiveParam(payload);
	} catch {
		return false;
	}
	return hasReplyPayloadContent(payload);
}
function queuePendingToolMedia(ctx, mediaReply, allowedMediaUrls, autoDeliveryMediaUrls) {
	const indexByUrl = new Map(ctx.state.pendingToolMediaUrls.map((url, index) => [url.trim(), index]));
	const attachments = ctx.state.pendingToolMediaAttachments ??= ctx.state.pendingToolMediaUrls.map(() => ({}));
	const attachmentsByUrl = new Map(mediaReply.mediaUrls.map((url, index) => [url.trim(), mediaReply.attachments?.[index]]));
	for (const mediaUrl of allowedMediaUrls) {
		const normalized = mediaUrl.trim();
		if (!normalized) continue;
		if (mediaReply.trustedLocalMedia) ctx.state.pendingToolMediaTrustByUrl.set(normalized, true);
		else if (!ctx.state.pendingToolMediaTrustByUrl.has(normalized)) ctx.state.pendingToolMediaTrustByUrl.set(normalized, false);
		if (autoDeliveryMediaUrls.has(normalized)) ctx.state.toolAutoDeliveryMediaUrls.add(normalized);
		else ctx.state.toolAutoDeliveryMediaUrls.delete(normalized);
		const attachment = attachmentsByUrl.get(normalized);
		const existingIndex = indexByUrl.get(normalized);
		if (existingIndex !== void 0) {
			if (attachment && Object.keys(attachments[existingIndex] ?? {}).length === 0) attachments[existingIndex] = attachment;
			continue;
		}
		indexByUrl.set(normalized, ctx.state.pendingToolMediaUrls.length);
		ctx.state.pendingToolMediaUrls.push(normalized);
		attachments.push(attachment ?? {});
	}
	if (mediaReply.audioAsVoice) ctx.state.pendingToolAudioAsVoice = true;
}
function readExecApprovalPendingDetails(result) {
	if (!result || typeof result !== "object") return null;
	const outer = result;
	const details = outer.details && typeof outer.details === "object" && !Array.isArray(outer.details) ? outer.details : outer;
	if (details.status !== "approval-pending") return null;
	const approvalId = readStringValue(details.approvalId) ?? "";
	const approvalSlug = readStringValue(details.approvalSlug) ?? "";
	const command = typeof details.command === "string" ? details.command : "";
	const host = details.host === "node" ? "node" : details.host === "gateway" ? "gateway" : null;
	if (!approvalId || !approvalSlug || !command || !host) return null;
	return {
		approvalId,
		approvalSlug,
		expiresAtMs: typeof details.expiresAtMs === "number" ? details.expiresAtMs : void 0,
		allowedDecisions: Array.isArray(details.allowedDecisions) ? details.allowedDecisions.filter((decision) => decision === "allow-once" || decision === "allow-always" || decision === "deny") : void 0,
		host,
		command,
		cwd: readStringValue(details.cwd),
		nodeId: readStringValue(details.nodeId),
		warningText: readStringValue(details.warningText)
	};
}
function readExecApprovalUnavailableDetails(result) {
	if (!result || typeof result !== "object") return null;
	const outer = result;
	const details = outer.details && typeof outer.details === "object" && !Array.isArray(outer.details) ? outer.details : outer;
	if (details.status !== "approval-unavailable") return null;
	const reason = details.reason === "initiating-platform-disabled" || details.reason === "initiating-platform-unsupported" || details.reason === "no-approval-route" ? details.reason : null;
	if (!reason) return null;
	return {
		reason,
		warningText: readStringValue(details.warningText),
		channel: readStringValue(details.channel),
		channelLabel: readStringValue(details.channelLabel),
		accountId: readStringValue(details.accountId),
		sentApproverDms: details.sentApproverDms === true,
		host: details.host === "gateway" || details.host === "node" ? details.host : void 0,
		nodeId: readStringValue(details.nodeId)
	};
}
async function emitToolResultOutput(params) {
	const { ctx, toolName, rawToolName, meta, isToolError, result, sanitizedResult } = params;
	const recordApprovalPromptDeliveryFailure = (error) => {
		const message = error instanceof Error ? error.message : String(error);
		ctx.log.warn(`failed to deliver exec approval prompt: ${message}`);
		const approvalMeta = meta ? `${meta} · approval prompt delivery` : "approval prompt delivery";
		const terminal = (ctx.params.observeToolTerminal ?? resolveFallbackToolTerminalObserver(ctx))({
			toolName,
			meta: approvalMeta,
			executionStarted: false,
			outcome: "failure",
			failure: { error: `Approval prompt delivery failed: ${message}` }
		});
		ctx.state.lastToolError = terminal.lastToolError;
	};
	const hasStructuredMedia = Boolean(result && typeof result === "object" && result.details && typeof result.details === "object" && !Array.isArray(result.details) && typeof (result.details?.media ?? void 0) === "object" && !Array.isArray(result.details?.media));
	const approvalPending = readExecApprovalPendingDetails(result);
	if (!isToolError && approvalPending) {
		if (!ctx.params.onToolResult) return;
		ctx.state.deterministicApprovalPromptPending = true;
		try {
			const { buildTypedExecApprovalPendingReplyPayload } = await loadExecApprovalReply();
			await ctx.params.onToolResult(buildTypedExecApprovalPendingReplyPayload({
				approvalId: approvalPending.approvalId,
				approvalSlug: approvalPending.approvalSlug,
				allowedDecisions: approvalPending.allowedDecisions,
				command: approvalPending.command,
				cwd: approvalPending.cwd,
				host: approvalPending.host,
				nodeId: approvalPending.nodeId,
				expiresAtMs: approvalPending.expiresAtMs,
				warningText: approvalPending.warningText
			}));
			ctx.state.deterministicApprovalPromptSent = true;
		} catch (error) {
			recordApprovalPromptDeliveryFailure(error);
		} finally {
			ctx.state.deterministicApprovalPromptPending = false;
		}
		return;
	}
	const approvalUnavailable = readExecApprovalUnavailableDetails(result);
	if (!isToolError && approvalUnavailable) {
		if (!ctx.params.onToolResult) return;
		try {
			const { buildExecApprovalUnavailableReplyPayload } = await loadExecApprovalReply();
			await ctx.params.onToolResult?.(buildExecApprovalUnavailableReplyPayload({
				reason: approvalUnavailable.reason,
				warningText: approvalUnavailable.warningText,
				channel: approvalUnavailable.channel,
				channelLabel: approvalUnavailable.channelLabel,
				accountId: approvalUnavailable.accountId,
				sentApproverDms: approvalUnavailable.sentApproverDms,
				host: approvalUnavailable.host,
				nodeId: approvalUnavailable.nodeId
			}));
		} catch (error) {
			recordApprovalPromptDeliveryFailure(error);
		}
		return;
	}
	const mediaReply = isToolError ? void 0 : extractToolResultMediaArtifact(result);
	const mediaUrls = mediaReply ? filterToolResultMediaUrls(rawToolName, mediaReply.mediaUrls, result, ctx.trustedLocalMediaToolNames) : [];
	if (!shouldSuppressStructuredMediaToolOutput({
		toolName,
		rawToolName,
		isToolError,
		hasDeliverableStructuredMedia: hasStructuredMedia && mediaUrls.length > 0,
		builtinToolNames: ctx.builtinToolNames
	}) && ctx.shouldEmitToolOutput()) {
		const outputText = extractToolResultText(sanitizedResult);
		if (outputText) ctx.emitToolOutput(rawToolName, meta, outputText, hasStructuredMedia ? void 0 : result);
		if (!hasStructuredMedia) return;
	}
	if (isToolError) return;
	if (!mediaReply) return;
	if (mediaUrls.length === 0) return;
	queuePendingToolMedia(ctx, mediaReply, mediaUrls, new Set(mediaReply.trustedLocalMedia === true ? getCoreTtsToolResultMediaUrls(result) : []));
}
//#endregion
//#region src/agents/embedded-agent-subscribe.handlers.tools.start.ts
const TRACE_REQUIRED_PARAM_GROUPS = {
	read: [{
		keys: ["path", "file_path"],
		label: "path"
	}],
	write: REQUIRED_PARAM_GROUPS.write,
	edit: REQUIRED_PARAM_GROUPS.edit
};
function reserveQuestionPromptDelivery(toolName, toolCallId, sessionKey, runId, agentId, args) {
	try {
		const { questions, timeoutSeconds } = toolName === "secrets" ? normalizeSecretsRequestParams(args) : normalizeAskUserParams(args);
		const reservation = reserveAskUserPromptDelivery({
			toolCallId,
			sessionKey,
			runId,
			agentId,
			questions,
			timeoutSeconds
		});
		if (!reservation) return;
		return reservation;
	} catch {
		return;
	}
}
function getRequiredParamGroupsForTool(toolName) {
	return TRACE_REQUIRED_PARAM_GROUPS[toolName];
}
function collectMissingRequiredParamLabels(toolName, args) {
	const groups = getRequiredParamGroupsForTool(toolName);
	if (!groups?.length) return [];
	const record = args && typeof args === "object" ? args : void 0;
	if (!record) return groups.map((group) => group.label ?? group.keys.join(" or "));
	return groups.filter((group) => {
		return !(group.validator?.(record) ?? group.keys.some((key) => {
			const value = record[key];
			return typeof value === "string" && (group.allowEmpty || value.trim().length > 0);
		}));
	}).map((group) => group.label ?? group.keys.join(" or "));
}
function buildToolExecutionStartTraceMeta(params) {
	const args = params.args;
	const argsType = Array.isArray(args) ? "array" : typeof args;
	const argsKeys = args && typeof args === "object" && !Array.isArray(args) ? Object.keys(args).toSorted() : void 0;
	const requiredParamsMissing = collectMissingRequiredParamLabels(params.toolName, args);
	return {
		event: "embedded_tool_execution_start",
		tags: [
			"tool_start",
			"embedded",
			"trace"
		],
		runId: params.ctx.params.runId,
		toolName: params.toolName,
		toolCallId: params.toolCallId,
		argsType,
		...argsKeys?.length ? { argsKeys } : {},
		...params.ctx.params.sessionKey ? { sessionKey: params.ctx.params.sessionKey } : {},
		...params.ctx.params.sessionId ? { sessionId: params.ctx.params.sessionId } : {},
		...params.ctx.params.agentId ? { agentId: params.ctx.params.agentId } : {},
		...requiredParamsMissing.length ? { requiredParamsMissing } : {}
	};
}
function traceToolExecutionStart(params) {
	if (!params.ctx.log.trace || params.ctx.log.isEnabled?.("trace") !== true) return;
	params.ctx.log.trace("embedded run tool start", buildToolExecutionStartTraceMeta({
		ctx: params.ctx,
		toolName: params.toolName,
		toolCallId: params.toolCallId,
		args: params.args
	}));
}
const TOOL_START_WARNING_PREVIEW_MAX_CHARS = 200;
function buildToolStartWarningArgsPreview(rawArgsPreview) {
	if (rawArgsPreview == null) return;
	const wasTruncated = rawArgsPreview.length > TOOL_START_WARNING_PREVIEW_MAX_CHARS;
	const bounded = truncateUtf16Safe(rawArgsPreview, TOOL_START_WARNING_PREVIEW_MAX_CHARS);
	const preview = sanitizeForConsole(bounded, TOOL_START_WARNING_PREVIEW_MAX_CHARS);
	return wasTruncated && preview ? `${preview}…` : preview;
}
/** Track tool execution start data for after_tool_call hook. */
const toolStartData = /* @__PURE__ */ new Map();
function buildToolStartKey(runId, toolCallId) {
	return `${runId}:${toolCallId}`;
}
/** Returns the number of active tool executions tracked for one embedded run. */
function countActiveToolExecutions(runId) {
	const prefix = `${runId}:`;
	let count = 0;
	for (const key of toolStartData.keys()) if (key.startsWith(prefix)) count += 1;
	return count;
}
/** Cleans up tool start data for a run that has been unsubscribed or aborted. */
function cleanupRunToolStartData(runId) {
	const prefix = `${runId}:`;
	for (const key of toolStartData.keys()) if (key.startsWith(prefix)) toolStartData.delete(key);
}
function buildToolCallSummary(toolName, args, meta, instanceReplaySafe, ownerKey, structuredReplaySafe) {
	const mutation = buildToolMutationState(toolName, args, ownerKey ? { ownerKey } : void 0);
	return {
		meta,
		commandBearing: isCommandBearingToolCall(toolName, args),
		instanceReplaySafe,
		mutatingAction: mutation.mutatingAction,
		...ownerKey ? { ownerKey } : {},
		replaySafe: instanceReplaySafe && !mutation.mutatingAction || structuredReplaySafe && mutation.replaySafe
	};
}
function buildToolItemId(toolCallId) {
	return `tool:${toolCallId}`;
}
function buildToolItemTitle(toolName, meta) {
	return meta ? `${toolName} ${meta}` : toolName;
}
function isExecToolName(toolName) {
	return toolName === "exec" || toolName === "bash";
}
function buildCommandItemId(toolCallId) {
	return `command:${toolCallId}`;
}
function buildPatchItemId(toolCallId) {
	return `patch:${toolCallId}`;
}
function buildCommandItemTitle(toolName, meta) {
	return meta ? `command ${meta}` : `${toolName} command`;
}
function buildPatchItemTitle(meta) {
	return meta ? `patch ${meta}` : "apply patch";
}
function emitTrackedItemEvent(ctx, itemData) {
	if (itemData.phase === "start") {
		ctx.state.itemActiveIds.add(itemData.itemId);
		ctx.state.itemStartedCount += 1;
	} else if (itemData.phase === "end") {
		ctx.state.itemActiveIds.delete(itemData.itemId);
		ctx.state.itemCompletedCount += 1;
	}
	emitAgentActivityEvent({
		runId: ctx.params.runId,
		...ctx.params.sessionKey ? { sessionKey: ctx.params.sessionKey } : {},
		stream: "item",
		data: itemData
	});
	emitAgentEventCallbackBestEffort(ctx, {
		stream: "item",
		data: itemData
	});
}
function emitExecutionPhaseBestEffort(ctx, info) {
	runBestEffortCallback({
		label: "tool execution phase",
		log: ctx.log,
		callback: () => ctx.params.onExecutionPhase?.(info)
	});
}
function emitAgentEventCallbackBestEffort(ctx, event) {
	runBestEffortCallback({
		label: "tool agent event",
		log: ctx.log,
		callback: () => ctx.params.onAgentEvent?.(event)
	});
}
function extendExecMeta(toolName, args, meta) {
	const normalized = normalizeOptionalLowercaseString(toolName);
	if (normalized !== "exec" && normalized !== "bash") return meta;
	if (!args || typeof args !== "object") return meta;
	const record = args;
	const flags = [];
	if (record.pty === true) flags.push("pty");
	if (record.elevated === true) flags.push("elevated");
	if (flags.length === 0) return meta;
	const suffix = flags.join(" · ");
	return meta ? `${meta} · ${suffix}` : suffix;
}
/** Handles a tool-execution start event and emits UI/telemetry start state. */
function handleToolExecutionStart(ctx, evt) {
	const startToolName = normalizeToolPolicyName(evt.toolName);
	ctx.state.liveEditDiffStateById.delete(evt.toolCallId);
	const questionPromptReservation = (startToolName === "ask_user" || startToolName === "secrets" && evt.args !== null && typeof evt.args === "object" && "action" in evt.args && evt.args.action === "request") && ctx.params.onToolResult && (startToolName === "ask_user" || isDeliverableMessageChannel(ctx.params.messageChannel ?? "")) ? reserveQuestionPromptDelivery(startToolName === "ask_user" ? "ask_user" : "secrets", evt.toolCallId, ctx.params.sessionKey, ctx.params.runId, ctx.params.agentId, evt.args) : void 0;
	const cancelQuestionPromptReservation = () => {
		if (questionPromptReservation) cancelAskUserPromptDelivery(evt.toolCallId, ctx.params.sessionKey, ctx.params.runId, ctx.params.agentId);
	};
	const continueAfterBlockReplyFlush = () => {
		let onBlockReplyFlushResult;
		try {
			onBlockReplyFlushResult = ctx.params.onBlockReplyFlush?.({
				reason: "tool_start",
				assistantMessageIndex: ctx.state.assistantMessageIndex
			});
		} catch (error) {
			cancelQuestionPromptReservation();
			throw error;
		}
		if (isPromiseLike(onBlockReplyFlushResult)) return onBlockReplyFlushResult.then(() => continueToolExecutionStart(), (error) => {
			cancelQuestionPromptReservation();
			throw error;
		});
		return continueToolExecutionStart();
	};
	const continueToolExecutionStart = () => {
		const rawToolName = evt.toolName;
		const toolName = normalizeToolPolicyName(rawToolName);
		const hideFromChannelProgress = evt.hideFromChannelProgress === true;
		const toolCallId = evt.toolCallId;
		const args = evt.args;
		const runId = ctx.params.runId;
		ctx.state.toolExecutionSinceLastBlockReply = true;
		emitExecutionPhaseBestEffort(ctx, {
			phase: "tool_execution_started",
			tool: toolName,
			toolCallId,
			source: "embedded-agent"
		});
		const startedAt = Date.now();
		toolStartData.set(buildToolStartKey(runId, toolCallId), {
			startTime: startedAt,
			args,
			...ctx.params.hasRepliedRef ? { hasRepliedRef: { value: ctx.params.hasRepliedRef.value } } : {}
		});
		traceToolExecutionStart({
			ctx,
			toolName,
			toolCallId,
			args
		});
		if (toolName === "read") {
			const record = args && typeof args === "object" ? args : {};
			if (!(typeof record.path === "string" ? record.path : typeof record.file_path === "string" ? record.file_path : "").trim()) {
				const argsType = typeof args;
				const argsPreview = buildToolStartWarningArgsPreview(readStringValue(args));
				const safeRunId = sanitizeForConsole(runId) ?? "-";
				const safeSessionKey = sanitizeForConsole(ctx.params.sessionKey);
				const safeSessionId = sanitizeForConsole(ctx.params.sessionId);
				const safeAgentId = sanitizeForConsole(ctx.params.agentId);
				const consoleMessageParts = [
					"read tool called without path:",
					`runId=${safeRunId}`,
					`toolCallId=${sanitizeForConsole(toolCallId) ?? "tool-call"}`,
					`argsType=${argsType}`
				];
				if (safeSessionKey) consoleMessageParts.push(`sessionKey=${safeSessionKey}`);
				if (safeSessionId) consoleMessageParts.push(`sessionId=${safeSessionId}`);
				if (safeAgentId) consoleMessageParts.push(`agentId=${safeAgentId}`);
				if (argsPreview) consoleMessageParts.push(`argsPreview=${argsPreview}`);
				const consoleMessage = consoleMessageParts.join(" ");
				const message = `read tool called without path: toolCallId=${toolCallId} argsType=${argsType}${argsPreview ? ` argsPreview=${argsPreview}` : ""}`;
				ctx.log.warn(message, {
					event: "embedded_read_tool_start_warning",
					tags: [
						"tool_start",
						"read",
						"embedded",
						"validation"
					],
					runId: ctx.params.runId,
					toolCallId,
					argsType,
					...safeSessionKey ? { sessionKey: ctx.params.sessionKey } : {},
					...safeSessionId ? { sessionId: ctx.params.sessionId } : {},
					...safeAgentId ? { agentId: ctx.params.agentId } : {},
					...argsPreview ? { argsPreview } : {},
					consoleMessage
				});
			}
		}
		const meta = extendExecMeta(toolName, args, inferToolMetaFromArgsCore(toolName, args, { detailMode: ctx.params.toolProgressDetail ?? "explain" }));
		const callSummary = buildToolCallSummary(toolName, args, meta, evt.replaySafe === true || ctx.params.replaySafeToolNames?.has(rawToolName) === true || ctx.params.replaySafeToolNames?.has(toolName) === true, ctx.params.sideEffectToolOwners?.get(toolName), false);
		ctx.state.toolMetaById.set(toolCallId, callSummary);
		ctx.log.debug(`embedded run tool start: runId=${ctx.params.runId} tool=${toolName} toolCallId=${toolCallId}`);
		const shouldEmitToolEvents = ctx.shouldEmitToolResult();
		emitAgentEvent({
			runId: ctx.params.runId,
			stream: "tool",
			data: {
				phase: "start",
				name: toolName,
				toolCallId,
				args: sanitizeToolArgs(args),
				...hideFromChannelProgress ? { hideFromChannelProgress: true } : {}
			}
		});
		emitTrackedItemEvent(ctx, {
			itemId: buildToolItemId(toolCallId),
			phase: "start",
			kind: "tool",
			title: buildToolItemTitle(toolName, meta),
			status: "running",
			name: toolName,
			meta,
			commandBearing: callSummary.commandBearing,
			toolCallId,
			startedAt,
			...hideFromChannelProgress ? { hideFromChannelProgress: true } : {},
			...callSummary.commandBearing && !isExecToolName(toolName) ? { suppressChannelProgress: true } : {}
		});
		emitAgentEventCallbackBestEffort(ctx, {
			stream: "tool",
			data: {
				phase: "start",
				name: toolName,
				toolCallId,
				args: sanitizeToolArgs(args),
				...hideFromChannelProgress ? { hideFromChannelProgress: true } : {}
			}
		});
		if (isExecToolName(toolName)) emitTrackedItemEvent(ctx, {
			itemId: buildCommandItemId(toolCallId),
			phase: "start",
			kind: "command",
			title: buildCommandItemTitle(toolName, meta),
			status: "running",
			name: toolName,
			meta,
			toolCallId,
			startedAt
		});
		else if (resolveFileMutationToolName(toolName) === "apply_patch") emitTrackedItemEvent(ctx, {
			itemId: buildPatchItemId(toolCallId),
			phase: "start",
			kind: "patch",
			title: buildPatchItemTitle(meta),
			status: "running",
			name: toolName,
			meta,
			toolCallId,
			startedAt
		});
		if (ctx.params.onToolResult && shouldEmitToolEvents && !ctx.state.toolSummaryById.has(toolCallId)) {
			ctx.state.toolSummaryById.add(toolCallId);
			ctx.emitToolSummary(toolName, meta, callSummary.commandBearing);
		}
		if (isMessagingTool(toolName)) {
			const argsRecord = args && typeof args === "object" ? args : {};
			const isMessagingSend = isMessagingToolSendAction(toolName, argsRecord);
			if (isMessagingToolTargetEvidenceAction(toolName, argsRecord)) {
				const telemetryArgs = applyCurrentMessageProvider(toolName, argsRecord, ctx.params.messageChannel);
				const sendTarget = extractMessagingToolSend(toolName, telemetryArgs, {
					config: ctx.params.config,
					currentChannelId: ctx.params.currentChannelId,
					currentMessagingTarget: ctx.params.currentMessagingTarget,
					currentThreadId: ctx.params.currentThreadId,
					currentMessageId: ctx.params.currentMessageId,
					replyToMode: ctx.params.replyToMode,
					hasRepliedRef: ctx.params.hasRepliedRef
				});
				if (sendTarget) ctx.state.pendingMessagingTargets.set(toolCallId, sendTarget);
			}
			if (isMessagingSend) {
				const text = readMessagingText(argsRecord);
				if (text) {
					ctx.state.pendingMessagingTexts.set(toolCallId, text);
					ctx.log.debug(`Tracking pending messaging text: tool=${toolName} len=${text.length}`);
				}
				const mediaUrls = collectMessagingMediaUrlsFromRecord(argsRecord);
				if (mediaUrls.length > 0) ctx.state.pendingMessagingMediaUrls.set(toolCallId, mediaUrls);
			}
		}
		if (questionPromptReservation) {
			const questionId = questionPromptReservation.questionId;
			waitForAskUserPromptReady(questionId).then(async (questions) => {
				if (!questions) return;
				if (toolName === "secrets") {
					const binding = questions[0]?.secretStore;
					if (!binding) return;
					const controlUiBase = resolveControlUiSessionLinkBase(ctx.params.config);
					const controlUiAskUrl = controlUiBase ? `${controlUiBase}/ask/${encodeURIComponent(questionId)}` : void 0;
					const vSecretEntryChannel = String(ctx.params.messageChannel ?? "").trim().toLowerCase(); // v-openclaw91-secret-entry-channels-v1
					const vSecretEntryInChat = vSecretEntryChannel === "feishu"; // v-openclaw91-secret-entry-v1
					const vSecretEntryByLink = ["telegram","dingtalk-connector","wecom"].includes(vSecretEntryChannel);
					const text = vSecretEntryInChat ? `🔑 V 需要凭据 ${binding.name}，请在卡片里安全录入。` : vSecretEntryByLink ? `🔑 V 需要凭据 ${binding.name}，请用 V 私信发来的一次性链接安全录入。` : controlUiBase ? `🔑 Agent requests credential ${binding.name} (${binding.kind}). Reply is disabled for secrets — open to provide it: ${controlUiAskUrl}` : "Credential request unavailable here: no reachable Control UI link. Open a trusted Control UI or native app and retry, or ask the operator to enable Control UI and configure gateway.publicOrigin. Never send credentials in chat.";
					await ctx.params.onToolResult?.({
						text,
						channelData: {
							askUser: { questionId },
							...vSecretEntryInChat ? { vSecretEntry: {
								questionId,
								name: binding.name,
								...typeof binding.reason === "string" && binding.reason ? { reason: binding.reason } : {},
								allowedHosts: Array.isArray(binding.allowedHosts) ? binding.allowedHosts : [],
								...controlUiAskUrl ? { controlUiUrl: controlUiAskUrl } : {}
							} } : {}
						}
					});
					if (!controlUiBase && !vSecretEntryInChat && !vSecretEntryByLink) throw new Error(text);
					return;
				}
				return ctx.params.onToolResult?.(buildAgentHarnessQuestionPromptPayload({
					questionId,
					questions: questions.map(({ questionId: id, ...question }) => ({
						...question,
						id
					})),
					options: { intro: "Question for you:" }
				}));
			}).then(() => settleAskUserPromptDelivery(questionId), (error) => {
				settleAskUserPromptDelivery(questionId, error);
				ctx.log.warn(`failed to deliver ${toolName} prompt: ${String(error)}`);
			});
		}
	};
	if (evt.lifecycleProvenance === "nested") return continueToolExecutionStart();
	let flushBlockReplyBufferResult;
	try {
		flushBlockReplyBufferResult = ctx.flushBlockReplyBuffer();
	} catch (error) {
		cancelQuestionPromptReservation();
		throw error;
	}
	if (isPromiseLike(flushBlockReplyBufferResult)) return flushBlockReplyBufferResult.then(() => continueAfterBlockReplyFlush(), (error) => {
		cancelQuestionPromptReservation();
		throw error;
	});
	return continueAfterBlockReplyFlush();
}
//#endregion
//#region src/agents/embedded-agent-subscribe.handlers.tools.progress.ts
const LIVE_EXEC_UPDATE_MIN_INTERVAL_MS = 250;
function readChannelToolProgress(result) {
	const progress = asOptionalRecord(asOptionalObjectRecord(result)?.progress);
	if (progress?.visibility !== "channel" || progress.privacy !== "public") return;
	const text = readStringValue(progress.text)?.trim();
	if (!text) return;
	return { text: truncateLiveExecOutput(text) };
}
function shouldEmitLiveExecUpdate(ctx, toolCallId) {
	const now = Date.now();
	const state = ctx.state.execLiveUpdateStateById ?? /* @__PURE__ */ new Map();
	ctx.state.execLiveUpdateStateById = state;
	const previous = state.get(toolCallId);
	if (previous && now - previous.lastEmittedAtMs < LIVE_EXEC_UPDATE_MIN_INTERVAL_MS) return false;
	state.set(toolCallId, { lastEmittedAtMs: now });
	return true;
}
/** Handles partial tool output and emits throttled live UI updates. */
function handleToolExecutionUpdate(ctx, evt) {
	const toolName = normalizeToolPolicyName(evt.toolName);
	const toolCallId = evt.toolCallId;
	const hideFromChannelProgress = evt.hideFromChannelProgress === true;
	const partial = evt.partialResult;
	const sanitized = sanitizeToolResult(partial);
	const isExecTool = isExecToolName(toolName);
	const liveResult = isExecTool ? capLiveExecResult(sanitized) : sanitized;
	const toolProgress = isExecTool ? void 0 : readChannelToolProgress(liveResult);
	const emitDetailedLiveUpdate = !toolProgress && (!isExecTool || shouldEmitLiveExecUpdate(ctx, toolCallId));
	if (emitDetailedLiveUpdate) emitAgentEvent({
		runId: ctx.params.runId,
		stream: "tool",
		data: {
			phase: "update",
			name: toolName,
			toolCallId,
			partialResult: liveResult,
			...hideFromChannelProgress ? { hideFromChannelProgress: true } : {}
		}
	});
	emitTrackedItemEvent(ctx, {
		itemId: buildToolItemId(toolCallId),
		phase: "update",
		kind: "tool",
		title: buildToolItemTitle(toolName, ctx.state.toolMetaById.get(toolCallId)?.meta),
		status: "running",
		name: toolName,
		toolCallId,
		commandBearing: ctx.state.toolMetaById.get(toolCallId)?.commandBearing,
		...hideFromChannelProgress ? { hideFromChannelProgress: true } : {},
		...ctx.state.toolMetaById.get(toolCallId)?.commandBearing && !isExecTool ? { suppressChannelProgress: true } : {},
		...toolProgress ? { progressText: toolProgress.text } : { meta: ctx.state.toolMetaById.get(toolCallId)?.meta }
	});
	if (!toolProgress) emitAgentEventCallbackBestEffort(ctx, {
		stream: "tool",
		data: {
			phase: "update",
			name: toolName,
			toolCallId,
			...hideFromChannelProgress ? { hideFromChannelProgress: true } : {}
		}
	});
	if (isExecTool) {
		const output = extractLiveExecOutput(liveResult);
		const commandData = {
			itemId: buildCommandItemId(toolCallId),
			phase: "update",
			kind: "command",
			title: buildCommandItemTitle(toolName, ctx.state.toolMetaById.get(toolCallId)?.meta),
			status: "running",
			name: toolName,
			meta: ctx.state.toolMetaById.get(toolCallId)?.meta,
			toolCallId,
			...emitDetailedLiveUpdate && output ? { progressText: output } : {}
		};
		emitTrackedItemEvent(ctx, commandData);
		if (emitDetailedLiveUpdate && output) {
			const outputData = {
				itemId: commandData.itemId,
				phase: "delta",
				title: commandData.title,
				toolCallId,
				name: toolName,
				output,
				status: "running"
			};
			emitAgentActivityEvent({
				runId: ctx.params.runId,
				...ctx.params.sessionKey ? { sessionKey: ctx.params.sessionKey } : {},
				stream: "command_output",
				data: outputData
			});
			emitAgentEventCallbackBestEffort(ctx, {
				stream: "command_output",
				data: outputData
			});
		}
	}
}
//#endregion
//#region src/agents/embedded-agent-runner/replay-state.ts
/** Creates a normalized replay state from partial caller metadata. */
function createEmbeddedRunReplayState(state) {
	return {
		replayInvalid: state?.replayInvalid === true,
		hadPotentialSideEffects: state?.hadPotentialSideEffects === true
	};
}
/** Merges replay state monotonically so unsafe observations cannot be cleared accidentally. */
function mergeEmbeddedRunReplayState(current, next) {
	if (!next) return current;
	return {
		replayInvalid: current.replayInvalid || next.replayInvalid === true,
		hadPotentialSideEffects: current.hadPotentialSideEffects || next.hadPotentialSideEffects === true
	};
}
/** Applies result metadata to the current replay state. */
function observeReplayMetadata(current, metadata) {
	if (!metadata) return mergeEmbeddedRunReplayState(current, {
		replayInvalid: true,
		hadPotentialSideEffects: true
	});
	return mergeEmbeddedRunReplayState(current, {
		replayInvalid: !metadata.replaySafe,
		hadPotentialSideEffects: metadata.hadPotentialSideEffects
	});
}
/** Converts internal replay state into the compact metadata persisted with run results. */
function replayMetadataFromState(state) {
	return {
		hadPotentialSideEffects: state.hadPotentialSideEffects,
		replaySafe: !state.replayInvalid && !state.hadPotentialSideEffects
	};
}
//#endregion
//#region src/agents/mcp-connect-action.ts
function readMcpConnectAction(result) {
	const connect = asOptionalRecord(asOptionalRecord(asOptionalRecord(result)?.details)?.mcpConnect);
	const serverName = typeof connect?.serverName === "string" ? connect.serverName.trim() : "";
	const authorizationUrl = typeof connect?.authorizationUrl === "string" ? connect.authorizationUrl.trim() : "";
	if (!serverName || !URL.canParse(authorizationUrl)) return;
	const protocol = new URL(authorizationUrl).protocol;
	if (protocol !== "http:" && protocol !== "https:") return;
	return {
		serverName,
		authorizationUrl
	};
}
//#endregion
//#region src/agents/embedded-agent-subscribe.handlers.tools.completion.ts
/** Handles a tool-execution result and commits replay, media, hook, and error state. */
async function handleToolExecutionEnd(ctx, evt) {
	const rawToolName = evt.toolName;
	const toolName = normalizeToolPolicyName(rawToolName);
	const hideFromChannelProgress = evt.hideFromChannelProgress === true;
	const toolCallId = evt.toolCallId;
	ctx.state.liveEditDiffStateById.delete(toolCallId);
	if (toolName === "ask_user") cancelAskUserPromptDelivery(toolCallId, ctx.params.sessionKey, ctx.params.runId);
	const runId = ctx.params.runId;
	const isError = evt.isError;
	const result = evt.result;
	const toolSendReceiptResult = ctx.consumeToolSendReceipt?.(toolCallId);
	const observerIsError = isError || isToolResultError(result);
	const sanitizedResult = sanitizeToolResult(result);
	const approvalUnavailable = isExecToolName(toolName) && readExecToolDetails(sanitizedResult)?.status === "approval-unavailable";
	const isToolError = observerIsError && !approvalUnavailable;
	if (!isToolError) {
		const channelView = readMcpAppChannelView(result);
		if (channelView) ctx.state.latestMcpAppChannelView = channelView;
		const connectAction = readMcpConnectAction(result);
		if (connectAction) ctx.state.latestMcpConnectAction = connectAction;
	}
	try {
		ctx.params.onAgentToolResult?.({
			toolName,
			result: sanitizedResult,
			isError: observerIsError
		});
	} catch (error) {
		ctx.log.warn(`onAgentToolResult handler failed: tool=${toolName} error=${String(error)}`);
	}
	const eventResult = isExecToolName(toolName) ? capLiveExecResult(sanitizedResult) : sanitizedResult;
	const toolStartKey = buildToolStartKey(runId, toolCallId);
	const startData = toolStartData.get(toolStartKey);
	toolStartData.delete(toolStartKey);
	ctx.state.execLiveUpdateStateById?.delete(toolCallId);
	const initialCallSummary = ctx.state.toolMetaById.get(toolCallId);
	const initialArgs = startData?.args && typeof startData.args === "object" ? startData.args : {};
	const adjustedArgs = consumeAdjustedParamsForToolCall(toolCallId, runId);
	const trackedExecutionStarted = consumeTrackedToolExecutionStarted(toolCallId, runId);
	const executionPrevented = consumePreExecutionBlockedToolCall(toolCallId, runId);
	const structuredReplaySafe = consumeStructuredReplaySafeToolCall(toolCallId, runId);
	const startArgs = adjustedArgs && typeof adjustedArgs === "object" ? adjustedArgs : initialArgs;
	const callSummary = buildToolCallSummary(toolName, startArgs, initialCallSummary?.meta, initialCallSummary?.instanceReplaySafe === true, initialCallSummary?.ownerKey, structuredReplaySafe);
	const executionStarted = (trackedExecutionStarted ?? evt.executionStarted ?? true) && !executionPrevented;
	const attemptedPotentialSideEffect = !callSummary.replaySafe && executionStarted;
	const meta = callSummary.meta;
	const asyncStarted = !isToolError && isAsyncStartedToolResult(sanitizedResult);
	const asyncTaskIds = asyncStarted ? readAsyncStartedTaskIds(sanitizedResult) : {};
	const codeModeSuspended = !isToolError && ctx.params.codeModeExecToolNames?.has(toolName) === true && readToolResultDetails(sanitizedResult)?.status === "waiting";
	const terminate = result !== null && typeof result === "object" && "terminate" in result && result.terminate === true;
	ctx.state.toolMetas.push({
		toolName,
		toolCallId,
		meta,
		replaySafe: callSummary.replaySafe,
		isError: observerIsError,
		...terminate ? { terminate: true } : {},
		...asyncStarted ? {
			asyncStarted: true,
			...asyncTaskIds
		} : {},
		...codeModeSuspended ? { codeModeSuspended: true } : {}
	});
	const acceptedSessionSpawn = toolName === "sessions_spawn" && !isToolError ? normalizeAcceptedSessionSpawnResult(sanitizedResult) : null;
	if (acceptedSessionSpawn) ctx.state.acceptedSessionSpawns.push(acceptedSessionSpawn);
	ctx.state.toolMetaById.delete(toolCallId);
	ctx.state.toolSummaryById.delete(toolCallId);
	const errorMessage = isToolError ? extractToolErrorMessage(sanitizedResult) : void 0;
	const errorCode = isToolError ? extractToolErrorCode(sanitizedResult) : void 0;
	const terminalDiagnostic = isToolError ? buildProcessTerminalDiagnostic(toolName, startArgs, sanitizedResult) : void 0;
	const terminalErrorMessage = terminalDiagnostic && errorMessage && hasTerminalControlCharacter(errorMessage) ? void 0 : errorMessage;
	const validationErrorSummary = isToolError && evt.executionStarted === false && evt.errorKind === "argument-validation" ? createToolValidationErrorSummary(toolName) : void 0;
	const terminal = (ctx.params.observeToolTerminal ?? resolveFallbackToolTerminalObserver(ctx))({
		toolCallId,
		toolName,
		arguments: startArgs,
		...meta ? { meta } : {},
		executionStarted,
		replaySafe: callSummary.replaySafe,
		outcome: isToolError ? "failure" : "success",
		...callSummary.ownerKey ? { ownerMutation: { ownerKey: callSummary.ownerKey } } : {},
		...isToolError ? { failure: {
			...errorCode ? { errorCode } : {},
			...terminalErrorMessage ? { error: terminalErrorMessage } : {},
			...terminalDiagnostic ? { terminalDiagnostic } : {},
			...validationErrorSummary ? { validationErrorSummary } : {},
			timedOut: isToolResultTimedOut(sanitizedResult) || void 0,
			middlewareError: isMiddlewareToolResultError(sanitizedResult) || void 0
		} } : {}
	});
	ctx.state.lastToolError = terminal.lastToolError;
	const terminalErrorStatus = terminal.executionStarted ? "failed" : "blocked";
	const toolErrorSummary = ctx.state.lastToolError ? summarizeToolValidationError(ctx.state.lastToolError) : void 0;
	if (asyncStarted) ctx.state.hadDeterministicSideEffect = true;
	if (attemptedPotentialSideEffect || acceptedSessionSpawn || asyncStarted) ctx.state.replayState = mergeEmbeddedRunReplayState(ctx.state.replayState, {
		replayInvalid: true,
		hadPotentialSideEffects: true
	});
	const messagingArgs = applyCurrentMessageProvider(toolName, startArgs, ctx.params.messageChannel);
	const isMessagingInvocation = isMessagingTool(toolName);
	const isMessagingSend = isMessagingInvocation && isMessagingToolSendAction(toolName, startArgs);
	const hasMessagingTargetEvidence = isMessagingInvocation && isMessagingToolTargetEvidenceAction(toolName, startArgs);
	const messageDelivery = readEmbeddedMessageDeliveryFact(readToolResultDetails(toolSendReceiptResult)?.messageDelivery);
	const didDeliverMessagingResult = isMessagingInvocation && (messageDelivery ? messageDelivery.status === "settled" && (!isToolError || messageDelivery.partialDelivery) : isPluginNativeMessagingTool(toolName) && isDeliveredMessagingToolResult({
		toolName,
		args: startArgs,
		result,
		hookResult: toolSendReceiptResult,
		isError: isToolError
	}));
	const messageText = isMessagingSend ? readMessagingText(startArgs) : void 0;
	const argumentMediaUrls = isMessagingSend ? collectMessagingMediaUrlsFromRecord(startArgs) : [];
	const hasRichContent = isMessagingSend && hasMessagingRichContent(startArgs);
	const messageTarget = hasMessagingTargetEvidence ? extractMessagingToolSend(toolName, messagingArgs, {
		config: ctx.params.config,
		currentChannelId: ctx.params.currentChannelId,
		currentMessagingTarget: ctx.params.currentMessagingTarget,
		currentThreadId: ctx.params.currentThreadId,
		currentMessageId: ctx.params.currentMessageId,
		replyToMode: ctx.params.replyToMode,
		hasRepliedRef: startData?.hasRepliedRef
	}) : void 0;
	const committedMediaUrls = didDeliverMessagingResult && isMessagingSend ? [...argumentMediaUrls, ...collectMessagingMediaUrlsFromToolResult(result)] : [];
	const extractionResult = applyToolSendReceiptForExtraction(result, toolSendReceiptResult);
	const confirmedMessageTarget = messageTarget && extractMessagingToolSendResult(messageTarget, extractionResult);
	const deliveredMessageToolSourceReply = didDeliverMessagingResult && isDeliveredMessageToolOnlySourceReplyResult({
		sourceReplyDeliveryMode: ctx.params.sourceReplyDeliveryMode,
		toolName,
		args: startArgs,
		result,
		isError: isToolError,
		allowExplicitSourceRoute: isDeliveredMessagingToolSendToCurrentSource({
			send: confirmedMessageTarget,
			config: ctx.params.config,
			currentProvider: ctx.params.messageChannel,
			currentAccountId: ctx.params.currentAccountId,
			currentChannelId: ctx.params.currentChannelId,
			currentMessagingTarget: ctx.params.currentMessagingTarget,
			currentThreadId: ctx.params.currentThreadId,
			sessionKey: ctx.params.sessionKey,
			deliveredPayload: extractionResult
		}),
		deliveryConfirmed: didDeliverMessagingResult
	});
	const deliveredCurrentSourceReply = deliveredMessageToolSourceReply || isDeliveredCoreCurrentChannelWidgetResult({
		coreBuiltinToolNames: ctx.params.coreBuiltinToolNames,
		sourceReplyDeliveryMode: ctx.params.sourceReplyDeliveryMode,
		toolName,
		result,
		isToolError
	});
	const sourceReplyFinal = deliveredMessageToolSourceReply ? resolveMessageToolSourceReplyFinal(startArgs) : void 0;
	ctx.state.pendingMessagingTexts.delete(toolCallId);
	ctx.state.pendingMessagingTargets.delete(toolCallId);
	ctx.state.pendingMessagingMediaUrls.delete(toolCallId);
	if (didDeliverMessagingResult && messageText) {
		ctx.state.messagingToolSentTexts.push(messageText);
		ctx.state.messagingToolSentTextsNormalized.push(normalizeTextForComparison(messageText));
		ctx.log.debug(`Committed messaging text: tool=${toolName} len=${messageText.length}`);
		ctx.trimMessagingToolSent();
	}
	if (didDeliverMessagingResult && confirmedMessageTarget) {
		ctx.state.messagingToolSentTargets.push({
			...confirmedMessageTarget,
			...messageText ? { text: messageText } : {},
			...committedMediaUrls.length > 0 ? { mediaUrls: committedMediaUrls.slice() } : {},
			...hasRichContent ? { hasRichContent: true } : {},
			...sourceReplyFinal !== void 0 ? { sourceReplyFinal } : {}
		});
		ctx.trimMessagingToolSent();
	}
	if (deliveredCurrentSourceReply) {
		ctx.state.messageToolOnlySourceReplyDelivered = true;
		if (deliveredMessageToolSourceReply) {
			const sourceReplyText = readMessageToolSourceReplyText(startArgs);
			const normalizedSourceReplyText = sourceReplyText ? normalizeTextForComparison(sourceReplyText) : "";
			if (normalizedSourceReplyText) {
				ctx.state.currentSourceMessagingToolSentTextsNormalized.push(normalizedSourceReplyText);
				ctx.trimMessagingToolSent();
			}
		}
		ctx.params.onDeliveredMessageToolOnlySourceReply?.();
	}
	if (didDeliverMessagingResult && isMessagingSend) {
		if (committedMediaUrls.length > 0) {
			ctx.state.messagingToolSentMediaUrls.push(...committedMediaUrls);
			ctx.trimMessagingToolSent();
		}
		const sourceReplyPayload = extractMessagingToolSourceReplyPayload(result);
		if (sourceReplyPayload) {
			ctx.state.messagingToolSourceReplyPayloads.push({
				...sourceReplyPayload,
				...sourceReplyFinal !== void 0 ? { sourceReplyFinal } : {}
			});
			ctx.trimMessagingToolSent();
		}
	}
	if (!isToolError && (isAutomationsToolName(toolName) && isCronAddAction(startArgs) || isExecToolName(toolName) && didShellCronAddSucceed(startArgs, result))) ctx.state.successfulCronAdds += 1;
	if (!isToolError && toolName === "heartbeat_respond") {
		const details = result && typeof result === "object" ? result.details : void 0;
		const response = normalizeHeartbeatToolResponse(details);
		if (response) {
			const isFirstHeartbeatResponse = ctx.state.heartbeatToolResponse === void 0;
			ctx.state.heartbeatToolResponse = response;
			if (isFirstHeartbeatResponse) runBestEffortCallback({
				label: "heartbeat tool response",
				log: ctx.log,
				callback: () => ctx.params.onHeartbeatToolResponse?.(response)
			});
		}
	}
	const planUpdate = !isToolError && toolName === "progress_card" ? readProgressCardPlanInput(startArgs) : void 0;
	if (planUpdate) {
		const planEvent = {
			stream: "plan",
			data: {
				phase: "update",
				title: "Plan updated",
				source: "openclaw",
				...planUpdate
			}
		};
		emitAgentEvent({
			runId: ctx.params.runId,
			...planEvent
		});
		emitAgentEventCallbackBestEffort(ctx, planEvent);
	}
	emitAgentEvent({
		runId: ctx.params.runId,
		stream: "tool",
		data: {
			phase: "result",
			name: toolName,
			toolCallId,
			meta,
			isError: isToolError,
			commandBearing: callSummary.commandBearing,
			result: eventResult,
			...toolErrorSummary ? { toolErrorSummary } : {},
			...hideFromChannelProgress ? { hideFromChannelProgress: true } : {}
		}
	});
	const endedAt = Date.now();
	emitTrackedItemEvent(ctx, {
		itemId: buildToolItemId(toolCallId),
		phase: "end",
		kind: "tool",
		title: buildToolItemTitle(toolName, meta),
		status: isToolError ? terminalErrorStatus : "completed",
		name: toolName,
		meta,
		commandBearing: callSummary.commandBearing,
		toolCallId,
		startedAt: startData?.startTime,
		endedAt,
		...hideFromChannelProgress ? { hideFromChannelProgress: true } : {},
		...callSummary.commandBearing && !isExecToolName(toolName) ? { suppressChannelProgress: true } : {},
		...isToolError && extractToolErrorMessage(sanitizedResult) ? { error: extractToolErrorMessage(sanitizedResult) } : {}
	});
	emitAgentEventCallbackBestEffort(ctx, {
		stream: "tool",
		data: {
			phase: "result",
			name: toolName,
			toolCallId,
			meta,
			isError: isToolError,
			commandBearing: callSummary.commandBearing,
			...toolErrorSummary ? { toolErrorSummary } : {},
			...hideFromChannelProgress ? { hideFromChannelProgress: true } : {}
		}
	});
	if (isExecToolName(toolName)) {
		const execDetails = readExecToolDetails(sanitizedResult);
		const commandItemId = buildCommandItemId(toolCallId);
		if (execDetails?.status === "approval-pending" || execDetails?.status === "approval-unavailable") {
			const approvalStatus = execDetails.status === "approval-pending" ? "pending" : "unavailable";
			const approvalData = {
				phase: "requested",
				kind: "exec",
				status: approvalStatus,
				title: approvalStatus === "pending" ? "Command approval requested" : "Command approval unavailable",
				itemId: commandItemId,
				toolCallId,
				...execDetails.status === "approval-pending" ? {
					approvalId: execDetails.approvalId,
					approvalSlug: execDetails.approvalSlug
				} : {},
				command: execDetails.command,
				host: execDetails.host,
				...execDetails.status === "approval-unavailable" ? { reason: execDetails.reason } : {},
				message: execDetails.warningText
			};
			emitAgentActivityEvent({
				runId: ctx.params.runId,
				...ctx.params.sessionKey ? { sessionKey: ctx.params.sessionKey } : {},
				stream: "approval",
				data: approvalData
			});
			emitAgentEventCallbackBestEffort(ctx, {
				stream: "approval",
				data: approvalData
			});
			emitTrackedItemEvent(ctx, {
				itemId: commandItemId,
				phase: "end",
				kind: "command",
				title: buildCommandItemTitle(toolName, meta),
				status: "blocked",
				name: toolName,
				meta,
				toolCallId,
				startedAt: startData?.startTime,
				endedAt,
				...execDetails.status === "approval-pending" ? {
					approvalId: execDetails.approvalId,
					approvalSlug: execDetails.approvalSlug,
					summary: "Awaiting approval before command can run."
				} : { summary: "Command is blocked because no interactive approval route is available." }
			});
		} else {
			const output = extractLiveExecOutput(eventResult);
			const rawOutput = extractExecOutput(sanitizedResult);
			const commandStatus = execDetails?.status === "failed" || isToolError ? terminalErrorStatus : "completed";
			emitTrackedItemEvent(ctx, {
				itemId: commandItemId,
				phase: "end",
				kind: "command",
				title: buildCommandItemTitle(toolName, meta),
				status: commandStatus,
				name: toolName,
				meta,
				toolCallId,
				startedAt: startData?.startTime,
				endedAt,
				...output ? { summary: output } : {},
				...isToolError && extractToolErrorMessage(sanitizedResult) ? { error: extractToolErrorMessage(sanitizedResult) } : {}
			});
			const outputData = {
				itemId: commandItemId,
				phase: "end",
				title: buildCommandItemTitle(toolName, meta),
				toolCallId,
				name: toolName,
				...output ? { output } : {},
				status: commandStatus,
				...execDetails && "exitCode" in execDetails ? { exitCode: execDetails.exitCode } : {},
				...execDetails && "durationMs" in execDetails && typeof execDetails.durationMs === "number" && Number.isFinite(execDetails.durationMs) && execDetails.durationMs >= 0 ? { durationMs: execDetails.durationMs } : {},
				...execDetails && "cwd" in execDetails && typeof execDetails.cwd === "string" ? { cwd: execDetails.cwd } : {}
			};
			emitAgentActivityEvent({
				runId: ctx.params.runId,
				...ctx.params.sessionKey ? { sessionKey: ctx.params.sessionKey } : {},
				stream: "command_output",
				data: outputData
			});
			emitAgentEventCallbackBestEffort(ctx, {
				stream: "command_output",
				data: outputData
			});
			if (typeof rawOutput === "string") {
				const parsedApprovalResult = parseExecApprovalResultText(rawOutput);
				if (parsedApprovalResult.kind === "denied") {
					const approvalData = {
						phase: "resolved",
						kind: "exec",
						status: normalizeOptionalLowercaseString(parsedApprovalResult.metadata)?.includes("approval-request-failed") ? "failed" : "denied",
						title: "Command approval resolved",
						itemId: commandItemId,
						toolCallId,
						message: parsedApprovalResult.body || parsedApprovalResult.raw
					};
					emitAgentActivityEvent({
						runId: ctx.params.runId,
						...ctx.params.sessionKey ? { sessionKey: ctx.params.sessionKey } : {},
						stream: "approval",
						data: approvalData
					});
					emitAgentEventCallbackBestEffort(ctx, {
						stream: "approval",
						data: approvalData
					});
				}
			}
		}
	}
	if (resolveFileMutationToolName(toolName) === "apply_patch") {
		const patchSummary = readApplyPatchSummary(sanitizedResult);
		const patchItemId = buildPatchItemId(toolCallId);
		const summaryText = patchSummary ? buildPatchSummaryText(patchSummary) : void 0;
		emitTrackedItemEvent(ctx, {
			itemId: patchItemId,
			phase: "end",
			kind: "patch",
			title: buildPatchItemTitle(meta),
			status: isToolError ? "failed" : "completed",
			name: toolName,
			meta,
			toolCallId,
			startedAt: startData?.startTime,
			endedAt,
			...summaryText ? { summary: summaryText } : {},
			...isToolError && extractToolErrorMessage(sanitizedResult) ? { error: extractToolErrorMessage(sanitizedResult) } : {}
		});
		if (patchSummary) {
			const patchData = {
				itemId: patchItemId,
				phase: "end",
				title: buildPatchItemTitle(meta),
				toolCallId,
				name: toolName,
				added: patchSummary.added,
				modified: patchSummary.modified,
				deleted: patchSummary.deleted,
				summary: summaryText ?? buildPatchSummaryText(patchSummary)
			};
			emitAgentActivityEvent({
				runId: ctx.params.runId,
				...ctx.params.sessionKey ? { sessionKey: ctx.params.sessionKey } : {},
				stream: "patch",
				data: patchData
			});
			emitAgentEventCallbackBestEffort(ctx, {
				stream: "patch",
				data: patchData
			});
		}
	}
	ctx.log.debug(`embedded run tool end: runId=${ctx.params.runId} tool=${toolName} toolCallId=${toolCallId}`);
	await emitToolResultOutput({
		ctx,
		toolName,
		rawToolName,
		meta,
		isToolError,
		result,
		sanitizedResult
	});
	await Promise.resolve(ctx.params.onToolStreamBoundary?.()).catch((error) => {
		ctx.log.debug(`embedded run tool stream boundary callback failed: ${String(error)}`);
	});
	const hookRunnerAfter = ctx.hookRunner ?? (await loadHookRunnerGlobal()).getGlobalHookRunner();
	if (hookRunnerAfter?.hasHooks("after_tool_call")) {
		const durationMs = startData?.startTime != null ? Date.now() - startData.startTime : void 0;
		const hookEvent = {
			toolName,
			params: startArgs,
			runId,
			toolCallId,
			result: sanitizedResult,
			error: isToolError ? extractToolErrorMessage(sanitizedResult) : void 0,
			durationMs
		};
		hookRunnerAfter.runAfterToolCall(hookEvent, {
			toolName,
			agentId: ctx.params.agentId,
			sessionKey: ctx.params.sessionKey,
			sessionId: ctx.params.sessionId,
			runId,
			toolCallId
		}).catch((err) => {
			ctx.log.warn(`after_tool_call hook failed: tool=${toolName} error=${String(err)}`);
		});
	}
	terminal.executedArguments ??= startArgs;
	return Object.assign(terminal, { isError: observerIsError });
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-trajectory-status.ts
/**
* Resolves terminal attempt trajectory status and assistant-visible text.
*/
/** Terminal error marker for runs that produced no user-visible delivery or durable progress. */
const NON_DELIVERABLE_TERMINAL_TURN_REASON = "non_deliverable_terminal_turn";
/**
* Chooses assistant text that can safely count as terminal output. Provider error
* and abort stop reasons cannot fall back to the raw last visible text because
* that text may describe an interrupted generation rather than a completed reply.
*/
function resolveTerminalAssistantTexts(params) {
	if (hasNonEmptyAssistantText(params.assistantTexts)) return params.assistantTexts;
	if (params.lastAssistantStopReason === "error" || params.lastAssistantStopReason === "aborted") return params.assistantTexts;
	const fallbackText = params.lastAssistantVisibleText?.trim();
	return fallbackText ? [fallbackText] : params.assistantTexts;
}
function hasNonEmptyAssistantText(texts) {
	return texts.some((text) => text.trim().length > 0);
}
function hasAnyNonBlankString(values) {
	return values.some((value) => value.trim().length > 0);
}
function hasCommittedMessagingDeliveryEvidence(params) {
	return hasAnyNonBlankString(params.messagingToolSentTexts) || hasAnyNonBlankString(params.messagingToolSentMediaUrls) || params.messagingToolSentTargets.length > 0;
}
function hasAsyncStartedToolActivity(toolMetas) {
	return (toolMetas ?? []).some((entry) => entry.asyncStarted === true);
}
/**
* Classifies the final attempt trajectory from visible output, durable side
* effects, and interruption state. Empty terminal turns are errors unless a
* caller proves a silent success, message delivery, spawned session, async task,
* or other durable progress.
*/
function resolveAttemptTrajectoryTerminal(params) {
	if (params.interrupted) return { status: "interrupted" };
	if (params.failed) return { status: "error" };
	const hasExplicitTerminalDelivery = params.silentExpected === true || params.emptyAssistantReplyIsSilent === true || params.didSendDeterministicApprovalPrompt || hasCommittedMessagingDeliveryEvidence(params) || hasAcceptedSessionSpawn(params.acceptedSessionSpawns) || params.heartbeatToolResponse !== void 0 || (params.clientToolCalls?.length ?? 0) > 0 || params.yieldDetected === true || params.lastToolError !== void 0 || hasAsyncStartedToolActivity(params.toolMetas);
	if (params.lastAssistantStopReason === "toolUse" && !hasExplicitTerminalDelivery) return {
		status: "error",
		terminalError: NON_DELIVERABLE_TERMINAL_TURN_REASON
	};
	const hasVisibleAssistantOutput = hasNonEmptyAssistantText(params.assistantTexts) || params.synthesizedPayloadCount > 0;
	if (params.lastAssistantStopReason === "length" && !params.hasTerminalOutput && !hasExplicitTerminalDelivery && !hasVisibleAssistantOutput) return {
		status: "error",
		terminalError: NON_DELIVERABLE_TERMINAL_TURN_REASON
	};
	if (hasExplicitTerminalDelivery || params.hasTerminalOutput || hasVisibleAssistantOutput || params.successfulCronAdds > 0) return { status: "success" };
	return {
		status: "error",
		terminalError: NON_DELIVERABLE_TERMINAL_TURN_REASON
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/terminal-outcome.ts
/** Projects private attempt metadata into the canonical agent terminal outcome. */
function resolveEmbeddedRunAttemptTerminalOutcome(params) {
	return buildAgentRunTerminalOutcomeFromAttempt({
		terminal: params.attempt.terminal,
		promptTimeoutOutcome: params.attempt.promptTimeoutOutcome,
		assistant: params.assistant && isProviderRefusalAssistantError(params.assistant) ? {
			...params.assistant,
			errorMessage: formatUserFacingAssistantErrorText(params.assistant)
		} : params.assistant,
		abortSignal: params.abortSignal
	});
}
/** Owner-recorded timeout failure cannot be inferred away from partial or completed-looking output. */
function isEmbeddedRunTimeoutFinal(attempt) {
	return projectAgentRunAttemptTerminal(attempt.terminal).timedOut && (attempt.promptTimeoutOutcome?.replayInvalid === true || attempt.codexAppServerFailure?.kind === "turn_completion_idle_timeout");
}
function isEmbeddedRunTerminalTimeout(outcome) {
	return classifyAgentRunTerminalOutcome(outcome) === "timeout";
}
function isEmbeddedRunTerminalAbort(outcome) {
	return classifyAgentRunTerminalOutcome(outcome) === "cancellation";
}
function isEmbeddedRunTerminalInterrupted(outcome) {
	return isEmbeddedRunTerminalTimeout(outcome) || isEmbeddedRunTerminalAbort(outcome);
}
/** Captures signal ownership with the outcome before async recovery can change the signal. */
function resolveEmbeddedRunAttemptTerminalState(params) {
	const outcome = resolveEmbeddedRunAttemptTerminalOutcome(params);
	return {
		outcome,
		signalOwnedInterruption: isEmbeddedRunTerminalInterrupted(outcome) && params.abortSignal?.aborted === true
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-finalize.ts
/**
* Finalizes post-turn state, abort resources, and terminal trajectory artifacts.
* It may assume stream execution and transcript writes are settled.
*/
/** Classifies the completed attempt and records its terminal trajectory artifacts. */
function finalizeEmbeddedAttempt(params) {
	const { result, trajectoryRecorder } = params;
	if (!trajectoryRecorder) return result;
	const terminalState = projectAgentRunAttemptTerminal(result.terminal);
	const assistant = terminalState.cleanupYieldAborted ? result.lastAssistant : result.currentAttemptCompletedAssistant ?? result.currentAttemptAssistant;
	const completionOutcome = resolveEmbeddedRunAttemptTerminalOutcome({
		attempt: result,
		assistant: terminalState.cleanupYieldAborted ? void 0 : assistant
	});
	const stopReason = terminalState.cleanupYieldAborted && completionOutcome.status === "ok" ? "end_turn" : completionOutcome.stopReason;
	const terminal = resolveAttemptTrajectoryTerminal({
		failed: completionOutcome.status === "error",
		interrupted: isEmbeddedRunTerminalInterrupted(completionOutcome),
		assistantTexts: resolveTerminalAssistantTexts({
			assistantTexts: result.assistantTexts,
			lastAssistantStopReason: stopReason,
			lastAssistantVisibleText: resolveFinalAssistantVisibleText(assistant)
		}),
		toolMetas: result.toolMetas,
		didSendViaMessagingTool: result.didSendViaMessagingTool,
		didSendDeterministicApprovalPrompt: result.didSendDeterministicApprovalPrompt === true,
		messagingToolSentTexts: result.messagingToolSentTexts,
		messagingToolSentMediaUrls: result.messagingToolSentMediaUrls,
		messagingToolSentTargets: result.messagingToolSentTargets,
		successfulCronAdds: result.successfulCronAdds ?? 0,
		synthesizedPayloadCount: params.synthesizedPayloadCount,
		acceptedSessionSpawns: result.acceptedSessionSpawns,
		heartbeatToolResponse: result.heartbeatToolResponse,
		clientToolCalls: result.clientToolCalls,
		yieldDetected: result.yieldDetected,
		lastToolError: result.lastToolError,
		silentExpected: params.silentExpected,
		emptyAssistantReplyIsSilent: params.emptyAssistantReplyIsSilent,
		lastAssistantStopReason: stopReason,
		hasTerminalOutput: params.hasTerminalOutput
	});
	const promptError = terminalState.promptError ? formatErrorMessage(terminalState.promptError) : void 0;
	trajectoryRecorder.recordEvent("model.completed", {
		aborted: terminalState.aborted,
		externalAbort: terminalState.externalAbort,
		timedOut: terminalState.timedOut,
		idleTimedOut: terminalState.idleTimedOut,
		timedOutDuringCompaction: terminalState.timedOutDuringCompaction,
		timedOutDuringToolExecution: terminalState.timedOutDuringToolExecution,
		timedOutByRunBudget: terminalState.timedOutByRunBudget,
		promptError,
		promptErrorSource: terminalState.promptErrorSource,
		terminalError: terminal.terminalError,
		usage: result.attemptUsage,
		promptCache: result.promptCache,
		compactionCount: result.compactionCount,
		assistantTexts: result.assistantTexts,
		stopReason,
		finalPromptText: result.finalPromptText,
		messagesSnapshot: result.messagesSnapshot
	});
	trajectoryRecorder.recordEvent("trace.artifacts", buildTrajectoryArtifacts({
		status: terminal.status,
		aborted: terminalState.aborted,
		externalAbort: terminalState.externalAbort,
		timedOut: terminalState.timedOut,
		idleTimedOut: terminalState.idleTimedOut,
		timedOutDuringCompaction: terminalState.timedOutDuringCompaction,
		timedOutDuringToolExecution: terminalState.timedOutDuringToolExecution,
		timedOutByRunBudget: terminalState.timedOutByRunBudget,
		promptError,
		promptErrorSource: terminalState.promptErrorSource,
		terminalError: terminal.terminalError,
		usage: result.attemptUsage,
		promptCache: result.promptCache,
		compactionCount: result.compactionCount ?? 0,
		assistantTexts: result.assistantTexts,
		stopReason,
		finalPromptText: result.finalPromptText,
		itemLifecycle: result.itemLifecycle,
		toolMetas: result.toolMetas,
		didSendViaMessagingTool: result.didSendViaMessagingTool,
		successfulCronAdds: result.successfulCronAdds ?? 0,
		messagingToolSentTexts: result.messagingToolSentTexts,
		messagingToolSentMediaUrls: result.messagingToolSentMediaUrls,
		messagingToolSentTargets: result.messagingToolSentTargets,
		lastToolError: result.lastToolError
	}));
	const sessionEndData = {
		status: terminal.status,
		aborted: terminalState.aborted,
		externalAbort: terminalState.externalAbort,
		timedOut: terminalState.timedOut,
		idleTimedOut: terminalState.idleTimedOut,
		timedOutDuringCompaction: terminalState.timedOutDuringCompaction,
		timedOutDuringToolExecution: terminalState.timedOutDuringToolExecution,
		timedOutByRunBudget: terminalState.timedOutByRunBudget,
		promptError,
		terminalError: terminal.terminalError,
		stopReason
	};
	if (params.deferredLifecycleOwner) params.deferredLifecycleOwner.recordSessionEnd(sessionEndData);
	else trajectoryRecorder.recordEvent("session.ended", sessionEndData);
	return result;
}
async function completeEmbeddedAttemptAfterTurn(input) {
	const { attempt, activeContextEngine, sessionManager, state, runtime } = input;
	const { sessionIdUsed, sessionFileUsed } = state;
	if (activeContextEngine && !state.beforeAgentFinalizeRevisionReason) {
		const lifecycleState = input.readLifecycleState();
		if (attempt.onContextEngineTurnCandidate) {
			const admission = attempt.userTurnTranscriptRecorder?.getAdmissionReceipt();
			const terminalEntryId = sessionManager.getLeafId() ?? void 0;
			const terminal = admission && terminalEntryId ? readActiveTranscriptEntryAnchor({
				agentId: admission.agentId,
				sessionId: admission.sessionId,
				sessionKey: admission.sessionKey,
				storePath: admission.storePath,
				entryId: terminalEntryId
			}) : void 0;
			if (admission && terminal) attempt.onContextEngineTurnCandidate({
				boundary: {
					admission,
					terminal
				},
				sessionIdUsed,
				sessionKey: attempt.sessionKey,
				sessionTarget: attempt.sessionTarget,
				promptError: Boolean(state.promptError),
				aborted: lifecycleState.aborted,
				yieldAborted: state.yieldAborted,
				isHeartbeat: isHeartbeatLifecycleRunKind(attempt.bootstrapContextRunKind)
			});
		} else {
			const afterTurnRuntimeContext = buildAfterTurnRuntimeContextFromUsage({
				attempt,
				workspaceDir: runtime.effectiveWorkspace,
				agentDir: runtime.agentDir,
				tokenBudget: attempt.contextTokenBudget,
				lastCallUsage: state.lastCallUsage,
				promptCache: state.promptCache,
				activeAgentId: runtime.sessionAgentId,
				contextEnginePluginId: runtime.resolveActiveContextEnginePluginId()
			});
			await finalizeHarnessContextEngineTurn({
				contextEngine: activeContextEngine,
				promptError: Boolean(state.promptError),
				aborted: lifecycleState.aborted,
				yieldAborted: state.yieldAborted,
				sessionIdUsed,
				sessionKey: attempt.sessionKey,
				sessionTarget: attempt.sessionTarget,
				sessionFile: attempt.sessionFile,
				messagesSnapshot: state.messagesSnapshot,
				prePromptMessageCount: state.contextEngineAfterTurnCheckpoint ?? state.prePromptMessageCount,
				tokenBudget: attempt.contextTokenBudget,
				runtimeContext: afterTurnRuntimeContext,
				contextEngineHostSupport: OPENCLAW_EMBEDDED_CONTEXT_ENGINE_HOST,
				providerId: attempt.provider,
				requestedModelId: attempt.requestedModelId,
				modelId: attempt.modelId,
				fallbackReason: attempt.fallbackReason,
				degradedReason: attempt.degradedReason,
				runMaintenance: async (contextParams) => await runContextEngineMaintenance({
					...contextParams,
					contextEngine: contextParams.contextEngine,
					sessionManager: contextParams.sessionManager,
					withSessionManagerRewriteLock: input.withOwnedTranscriptWrite,
					config: attempt.config,
					agentId: runtime.sessionAgentId,
					contextEngineAgentId: attempt.contextEngineAgentId
				}),
				sessionManager,
				config: attempt.config,
				warn: (message) => log$5.warn(message),
				isHeartbeat: isHeartbeatLifecycleRunKind(attempt.bootstrapContextRunKind)
			});
		}
	}
	if (!state.beforeAgentFinalizeRevisionReason) await input.withOwnedTranscriptWrite(async () => {
		const lifecycleState = input.readLifecycleState();
		if (shouldPersistCompletedBootstrapTurn({
			shouldRecordCompletedBootstrapTurn: runtime.shouldRecordCompletedBootstrapTurn,
			promptError: state.promptError,
			aborted: lifecycleState.aborted,
			timedOutDuringCompaction: lifecycleState.timedOutDuringCompaction,
			compactionOccurredThisAttempt: state.compactionOccurredThisAttempt
		})) try {
			sessionManager.appendCustomEntry(FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE, {
				timestamp: Date.now(),
				runId: attempt.runId,
				sessionId: attempt.sessionId
			});
		} catch (entryErr) {
			log$5.warn(`failed to persist bootstrap completion entry: ${String(entryErr)}`);
		}
	});
	const lifecycleAfterTurn = input.readLifecycleState();
	runtime.cacheTrace?.recordStage("session:after", {
		messages: state.messagesSnapshot,
		note: lifecycleAfterTurn.timedOutDuringCompaction ? "compaction timeout" : state.promptError ? "prompt error" : void 0
	});
	runtime.anthropicPayloadLogger?.recordUsage(state.messagesSnapshot, state.promptError);
	if (attempt.operation !== "settled-tool-finalization" && attempt.sessionPersistence !== "detached" && !state.beforeAgentFinalizeRevisionReason) {
		const lifecycleForAgentEnd = input.readLifecycleState();
		const agentEndError = state.promptError && !lifecycleForAgentEnd.aborted ? formatErrorMessage(state.promptError) : void 0;
		runAgentEndSideEffects({
			event: {
				messages: projectNestedToolActivityForHooks(state.messagesSnapshot, state.nestedToolActivities ?? []),
				success: !lifecycleForAgentEnd.aborted && !state.promptError,
				error: agentEndError,
				durationMs: Date.now() - runtime.promptStartedAt
			},
			ctx: buildEmbeddedAgentEndContext({
				run: attempt,
				agentId: runtime.hookAgentId,
				agentDir: runtime.agentDir,
				trace: freezeDiagnosticTraceContext(runtime.diagnosticTrace),
				skillWorkshopAvailable: runtime.skillWorkshopAvailable,
				compacted: state.compactionOccurredThisAttempt
			}),
			hookRunner: runtime.hookRunner
		});
	}
	return {
		sessionIdUsed,
		sessionFileUsed
	};
}
function createAttemptAbortError(signal) {
	if (signal.reason instanceof Error) return signal.reason;
	const error = new Error("request aborted", { cause: signal.reason });
	error.name = "AbortError";
	return error;
}
function getAbortReason(signal) {
	return "reason" in signal ? signal.reason : void 0;
}
function createTimeoutAbortReason() {
	const error = /* @__PURE__ */ new Error("request timed out");
	error.name = "TimeoutError";
	return error;
}
/** Owns the external AbortSignal listener and its handoff to the live session. */
function createEmbeddedAttemptExternalAbortController(input) {
	let abortActiveSession;
	let abortRun;
	let isCompactionPendingOrRetrying;
	let isCompactionInFlight;
	let removeListener;
	let abortHandled = false;
	const onAbort = () => {
		const signal = input.abortSignal;
		if (!signal || abortHandled) return;
		abortHandled = true;
		input.state.markExternalAbort();
		const reason = getAbortReason(signal);
		const isTimeout = reason ? isSignalTimeoutReason(reason) : false;
		if (shouldFlagCompactionTimeout({
			isTimeout,
			isCompactionPendingOrRetrying: isCompactionPendingOrRetrying?.() ?? false,
			isCompactionInFlight: isCompactionInFlight?.() ?? false
		})) input.state.markTimedOutDuringCompaction();
		if (abortRun) {
			abortRun(isTimeout, reason);
			return;
		}
		input.state.markAborted();
		if (isTimeout) {
			input.state.markTimedOut();
			if (!input.state.readTimedOutDuringCompaction() && countActiveToolExecutions(input.runId) > 0) input.state.markTimedOutDuringToolExecution();
		}
		input.state.setPromptError(createAttemptAbortError(signal));
		if (!input.runAbortController.signal.aborted) input.runAbortController.abort(isTimeout ? reason ?? createTimeoutAbortReason() : reason);
		abortActiveSession?.(input.runAbortController.signal.reason);
	};
	const readFiredAbortError = () => {
		const signal = input.abortSignal;
		if (!signal?.aborted) return;
		onAbort();
		return createAttemptAbortError(signal);
	};
	return {
		arm: () => {
			const signal = input.abortSignal;
			if (!signal || removeListener) return;
			if (signal.aborted) {
				onAbort();
				return;
			}
			signal.addEventListener("abort", onAbort, { once: true });
			removeListener = () => {
				signal.removeEventListener("abort", onAbort);
				removeListener = void 0;
			};
		},
		dispose: () => {
			removeListener?.();
		},
		setActiveSessionAbort: (abort) => {
			abortActiveSession = abort;
		},
		setCompactionState: (state) => {
			isCompactionPendingOrRetrying = state.isPendingOrRetrying;
			isCompactionInFlight = state.isInFlight;
		},
		setRunAbort: (abort) => {
			abortRun = abort;
		},
		throwIfFired: () => {
			const abortError = readFiredAbortError();
			if (abortError) throw abortError;
		},
		throwIfFiredAfterPrepCleanup: async () => {
			const abortError = readFiredAbortError();
			if (!abortError) return;
			await input.cleanupAfterEarlyAbort();
			throw abortError;
		}
	};
}
/** Builds the live-session abort handler shared by timeouts and explicit cancellation. */
function createEmbeddedAttemptRunAbort(input) {
	let abortAccepted = false;
	const abortCompaction = () => {
		if (!input.activeSession.isCompacting) return;
		try {
			input.activeSession.abortCompaction();
		} catch (error) {
			if (!input.isProbeSession) input.log.warn(`embedded run abortCompaction failed: runId=${input.attempt.runId} sessionId=${input.attempt.sessionId} err=${String(error)}`);
		}
	};
	return (isTimeout = false, reason) => {
		if (abortAccepted) return;
		abortAccepted = true;
		input.state.markAborted();
		if (isTimeout) {
			input.state.markTimedOut();
			if (!input.state.readTimedOutDuringCompaction() && countActiveToolExecutions(input.attempt.runId) > 0) input.state.markTimedOutDuringToolExecution();
			const timeoutReason = reason instanceof Error ? reason : createTimeoutAbortReason();
			input.attempt.onAttemptTimeout?.(timeoutReason);
			input.runAbortController.abort(timeoutReason);
		} else input.runAbortController.abort(reason);
		abortCompaction();
		input.abortActiveSession(input.runAbortController.signal.reason);
		const queueHandle = input.getQueueHandle();
		if (isTimeout && queueHandle) markActiveEmbeddedRunAbandoned({
			sessionId: input.attempt.sessionId,
			handle: queueHandle,
			sessionKey: input.attempt.sessionKey,
			sessionFile: input.attempt.sessionFile,
			reason: "timeout"
		});
	};
}
/**
* Resolves how long embedded-run cleanup waits for abort side effects to settle.
* The explicit env override is strict decimal milliseconds; invalid values fall
* back to the normal/test defaults instead of silently widening cleanup waits.
*/
function resolveEmbeddedAbortSettleTimeoutMs(env = process.env) {
	const override = parseStrictPositiveInteger(env.OPENCLAW_EMBEDDED_ABORT_SETTLE_TIMEOUT_MS);
	if (override !== void 0) return override;
	return isFastTestRuntimeEnv(env) ? 250 : 2e3;
}
//#endregion
//#region src/infra/gemini-auth.ts
/**
* Shared Gemini authentication utilities.
*
* Supports both traditional API keys and OAuth JSON format.
*/
/**
* Parse Gemini API key and return appropriate auth headers.
*
* OAuth format: `{"token": "...", "projectId": "..."}`
*
* @param apiKey - Either a traditional API key string or OAuth JSON
* @returns Headers object with appropriate authentication
*/
function parseGeminiAuth(apiKey) {
	if (apiKey.startsWith("{")) try {
		const parsed = JSON.parse(apiKey);
		if (typeof parsed.token === "string" && parsed.token) return { headers: {
			Authorization: `Bearer ${parsed.token}`,
			"Content-Type": "application/json"
		} };
	} catch {}
	return { headers: {
		"x-goog-api-key": apiKey,
		"Content-Type": "application/json"
	} };
}
//#endregion
//#region src/agents/embedded-agent-runner/google-prompt-cache.ts
/**
* Prepares Google prompt-cache payloads for embedded-agent stream calls.
*/
const GOOGLE_PROMPT_CACHE_CUSTOM_TYPE = "openclaw.google-prompt-cache";
const GOOGLE_PROMPT_CACHE_RESPONSE_MAX_BYTES = 1048576;
const GOOGLE_PROMPT_CACHE_RETRY_BACKOFF_MS = 6e5;
const GOOGLE_PROMPT_CACHE_SHORT_REFRESH_WINDOW_MS = 3e4;
const GOOGLE_PROMPT_CACHE_LONG_REFRESH_WINDOW_MS = 3e5;
function resolveGooglePromptCacheTtl(cacheRetention) {
	return cacheRetention === "long" ? "3600s" : "300s";
}
function resolveGooglePromptCacheRefreshWindowMs(cacheRetention) {
	return cacheRetention === "long" ? GOOGLE_PROMPT_CACHE_LONG_REFRESH_WINDOW_MS : GOOGLE_PROMPT_CACHE_SHORT_REFRESH_WINDOW_MS;
}
function digestSystemPrompt(systemPrompt) {
	return crypto$1.createHash("sha256").update(systemPrompt).digest("hex");
}
function resolveManagedSystemPrompt(systemPrompt) {
	const stripped = typeof systemPrompt === "string" ? stripSystemPromptCacheBoundary(systemPrompt) : "";
	const sanitized = sanitizeTransportPayloadText(stripped);
	return sanitized.trim() ? sanitized : void 0;
}
function resolveExplicitCachedContent(extraParams) {
	const trimmed = (typeof extraParams?.cachedContent === "string" ? extraParams.cachedContent : typeof extraParams?.cached_content === "string" ? extraParams.cached_content : void 0)?.trim();
	return trimmed ? trimmed : void 0;
}
function buildGooglePromptCacheMatchKey(params) {
	return stableStringify(params);
}
function stringifyGooglePromptCacheKeyPart(value) {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
	return "";
}
function readLatestGooglePromptCacheEntry(sessionManager, matchKey) {
	try {
		const entries = sessionManager.getEntries();
		for (let i = entries.length - 1; i >= 0; i -= 1) {
			const entry = entries[i];
			if (entry?.type !== "custom" || entry?.customType !== GOOGLE_PROMPT_CACHE_CUSTOM_TYPE) continue;
			const data = entry.data;
			if (!data || typeof data !== "object") continue;
			const cacheData = data;
			if (buildGooglePromptCacheMatchKey({
				provider: stringifyGooglePromptCacheKeyPart(cacheData.provider),
				modelId: stringifyGooglePromptCacheKeyPart(cacheData.modelId),
				modelApi: typeof cacheData.modelApi === "string" || cacheData.modelApi == null ? cacheData.modelApi : null,
				baseUrl: stringifyGooglePromptCacheKeyPart(cacheData.baseUrl),
				systemPromptDigest: stringifyGooglePromptCacheKeyPart(cacheData.systemPromptDigest),
				cacheConfigDigest: typeof cacheData.cacheConfigDigest === "string" ? cacheData.cacheConfigDigest : void 0
			}) === matchKey) return data;
		}
	} catch {
		return null;
	}
	return null;
}
async function appendGooglePromptCacheEntry(sessionManager, entry) {
	try {
		await sessionManager.appendCustomEntry(GOOGLE_PROMPT_CACHE_CUSTOM_TYPE, entry);
	} catch (err) {
		if (err instanceof SessionTranscriptWriterClaimReboundError) throw err;
	}
}
function readFutureExpireTime(value, now) {
	const timestamp = parseDateStringTimestampMs(value);
	return typeof value === "string" && isFutureDateTimestampMs(timestamp, { nowMs: now }) ? {
		value,
		timestamp
	} : null;
}
function readGooglePromptCacheName(value) {
	if (typeof value !== "string" || !value.startsWith("cachedContents/")) return null;
	const id = value.slice(15);
	if (!id || id === "." || id === "..") return null;
	try {
		return encodeURIComponent(id) === id ? value : null;
	} catch {
		return null;
	}
}
function convertManagedGoogleTools(tools) {
	if (tools.length === 0) return;
	return [{ functionDeclarations: sortPromptCacheToolsByName(tools).map((tool) => ({
		name: tool.name,
		description: tool.description,
		parametersJsonSchema: tool.parameters
	})) }];
}
function mapManagedGoogleToolChoice(choice) {
	if (!choice) return;
	if (typeof choice === "object" && choice !== null && choice.type === "function") {
		const functionName = choice.function?.name;
		return typeof functionName === "string" ? {
			mode: "ANY",
			allowedFunctionNames: [functionName]
		} : { mode: "ANY" };
	}
	switch (choice) {
		case "none": return { mode: "NONE" };
		case "any":
		case "required": return { mode: "ANY" };
		default: return { mode: "AUTO" };
	}
}
function buildManagedGooglePromptCacheConfig(context, options) {
	const tools = context.tools?.length ? convertManagedGoogleTools(context.tools) : void 0;
	const toolChoice = tools ? mapManagedGoogleToolChoice(options?.toolChoice) : void 0;
	const toolConfig = toolChoice ? { functionCallingConfig: toolChoice } : void 0;
	return {
		cacheConfigDigest: tools || toolConfig ? stableStringify({
			tools,
			toolConfig
		}) : void 0,
		tools,
		toolConfig
	};
}
function buildManagedContextForCachedContent(context) {
	if (!context.systemPrompt && !context.tools?.length) return context;
	return {
		...context,
		systemPrompt: void 0,
		tools: void 0
	};
}
function resolveGooglePromptCacheAuthHeaders(params) {
	if (!looksLikeSecretSentinel(params.apiKey)) {
		const headers = parseGeminiAuth(params.apiKey).headers;
		if (!isSecretValueRegisteredForRedaction(params.apiKey)) return headers;
		return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, name.toLowerCase() === "authorization" || name.toLowerCase() === "x-goog-api-key" ? mintSecretSentinel(value, { label: `model-auth:${params.provider}` }) : value]));
	}
	const resolved = resolveSecretSentinel(params.apiKey);
	if (resolved === void 0) throw new Error(`Secret sentinel ${params.apiKey} is not registered in this process; refusing Google prompt-cache auth`);
	return Object.fromEntries(Object.entries(parseGeminiAuth(resolved).headers).map(([name, value]) => {
		return [name, name.toLowerCase() === "authorization" || name.toLowerCase() === "x-goog-api-key" ? mintSecretSentinel(value, { label: `model-auth:${params.provider}` }) : value];
	}));
}
function buildGooglePromptCacheHeaders(params) {
	const authHeaders = resolveGooglePromptCacheAuthHeaders({
		apiKey: params.apiKey,
		provider: params.model.provider
	});
	return resolveProviderRequestHeaders({
		provider: params.model.provider,
		api: params.model.api,
		baseUrl: params.baseUrl,
		capability: "llm",
		transport: "http",
		defaultHeaders: authHeaders,
		callerHeaders: params.headers,
		precedence: "caller-wins"
	}) ?? mergeTransportHeaders(authHeaders, params.headers);
}
async function requestGooglePromptCache(params) {
	const refreshing = "cachedContent" in params;
	const url = refreshing ? `${params.baseUrl}/${params.cachedContent}?updateMask=ttl` : `${params.baseUrl}/cachedContents`;
	const headers = buildGooglePromptCacheHeaders(params);
	const body = JSON.stringify(refreshing ? { ttl: resolveGooglePromptCacheTtl(params.cacheRetention) } : {
		model: params.modelId.startsWith("models/") ? params.modelId : `models/${params.modelId}`,
		ttl: resolveGooglePromptCacheTtl(params.cacheRetention),
		systemInstruction: { parts: [{ text: params.systemPrompt }] },
		...params.tools ? { tools: params.tools } : {},
		...params.toolConfig ? { toolConfig: params.toolConfig } : {}
	});
	let response;
	try {
		response = await params.fetchImpl(url, {
			method: refreshing ? "PATCH" : "POST",
			headers,
			body,
			signal: params.signal
		});
		if (!response.ok) throw new Error(`Google prompt cache request failed (${response.status})`);
		const payload = await readProviderJsonObjectResponse(response, "Google prompt cache", {
			maxBytes: GOOGLE_PROMPT_CACHE_RESPONSE_MAX_BYTES,
			onOverflow: ({ size, maxBytes }) => /* @__PURE__ */ new Error(`Google prompt cache response too large: ${size} bytes (limit: ${maxBytes} bytes)`),
			requestHeaders: headers
		});
		const expiry = readFutureExpireTime(payload.expireTime, params.now);
		const cachedContent = refreshing ? params.cachedContent : readGooglePromptCacheName(payload.name);
		if (!cachedContent || !expiry) throw new Error("Google prompt cache response is invalid");
		return {
			cachedContent,
			expireTime: expiry.value
		};
	} catch {
		params.signal?.throwIfAborted();
		return null;
	} finally {
		await cancelUnreadResponseBody(response);
	}
}
async function ensureGooglePromptCache(params, deps) {
	const baseUrl = normalizeGoogleApiBaseUrl(params.model.baseUrl);
	const now = asDateTimestampMs(deps.now?.() ?? Date.now());
	if (now === void 0) return null;
	const systemPromptDigest = digestSystemPrompt(params.systemPrompt);
	const matchKey = buildGooglePromptCacheMatchKey({
		provider: params.provider,
		modelId: params.model.id,
		modelApi: params.model.api,
		baseUrl,
		systemPromptDigest,
		cacheConfigDigest: params.cacheConfigDigest
	});
	const latestEntry = readLatestGooglePromptCacheEntry(params.sessionManager, matchKey);
	if (latestEntry?.status === "failed" && isFutureDateTimestampMs(latestEntry.retryAfter, { nowMs: now })) return null;
	const fetchImpl = (deps.buildGuardedFetch ?? buildGuardedModelFetch)(params.model);
	const refreshWindowMs = resolveGooglePromptCacheRefreshWindowMs(params.cacheRetention);
	const cachedContent = latestEntry?.status === "ready" ? readGooglePromptCacheName(latestEntry.cachedContent) : null;
	if (latestEntry?.status === "ready" && cachedContent) {
		const expiry = readFutureExpireTime(latestEntry.expireTime, now);
		if (expiry) {
			if (!(expiry.timestamp - now <= refreshWindowMs)) return cachedContent;
			const refreshed = await requestGooglePromptCache({
				apiKey: params.apiKey,
				baseUrl,
				cacheRetention: params.cacheRetention,
				cachedContent,
				fetchImpl,
				headers: params.model.headers,
				model: params.model,
				now,
				signal: params.signal
			});
			if (refreshed) {
				await appendGooglePromptCacheEntry(params.sessionManager, {
					status: "ready",
					timestamp: now,
					provider: params.provider,
					modelId: params.model.id,
					modelApi: params.model.api,
					baseUrl,
					systemPromptDigest,
					cacheConfigDigest: params.cacheConfigDigest,
					cacheRetention: params.cacheRetention,
					cachedContent,
					expireTime: refreshed.expireTime
				});
				return cachedContent;
			}
			return cachedContent;
		}
	}
	const created = await requestGooglePromptCache({
		apiKey: params.apiKey,
		baseUrl,
		cacheRetention: params.cacheRetention,
		fetchImpl,
		headers: params.model.headers,
		model: params.model,
		modelId: params.model.id,
		now,
		signal: params.signal,
		systemPrompt: params.systemPrompt,
		tools: params.tools,
		toolConfig: params.toolConfig
	});
	if (!created) {
		await appendGooglePromptCacheEntry(params.sessionManager, {
			status: "failed",
			timestamp: now,
			provider: params.provider,
			modelId: params.model.id,
			modelApi: params.model.api,
			baseUrl,
			systemPromptDigest,
			cacheConfigDigest: params.cacheConfigDigest,
			cacheRetention: params.cacheRetention,
			retryAfter: resolveExpiresAtMsFromDurationMs(GOOGLE_PROMPT_CACHE_RETRY_BACKOFF_MS, { nowMs: now }) ?? 0
		});
		return null;
	}
	await appendGooglePromptCacheEntry(params.sessionManager, {
		status: "ready",
		timestamp: now,
		provider: params.provider,
		modelId: params.model.id,
		modelApi: params.model.api,
		baseUrl,
		systemPromptDigest,
		cacheConfigDigest: params.cacheConfigDigest,
		cacheRetention: params.cacheRetention,
		cachedContent: created.cachedContent,
		expireTime: created.expireTime
	});
	return created.cachedContent;
}
async function prepareGooglePromptCacheStreamFn(params, deps = {}) {
	if (!params.streamFn) return;
	if (resolveExplicitCachedContent(params.extraParams)) return;
	if (!isGooglePromptCacheEligible({
		modelApi: params.model.api,
		modelId: params.modelId
	})) return;
	const resolvedRetention = resolveCacheRetention(params.extraParams, params.provider, params.model.api, params.modelId);
	if (resolvedRetention !== "short" && resolvedRetention !== "long") return;
	const systemPrompt = resolveManagedSystemPrompt(params.systemPrompt);
	const apiKey = params.apiKey?.trim();
	if (!systemPrompt || !apiKey) return;
	const inner = params.streamFn;
	return async (model, context, options) => {
		const cacheConfig = buildManagedGooglePromptCacheConfig(context, options);
		const cachedContent = await ensureGooglePromptCache({
			apiKey,
			cacheConfigDigest: cacheConfig.cacheConfigDigest,
			cacheRetention: resolvedRetention,
			model: params.model,
			provider: params.provider,
			sessionManager: params.sessionManager,
			signal: params.signal,
			systemPrompt,
			tools: cacheConfig.tools,
			toolConfig: cacheConfig.toolConfig
		}, deps);
		if (!cachedContent) {
			log$5.debug(`google prompt cache unavailable for ${params.provider}/${params.modelId}; continuing without cachedContent`);
			return inner(model, context, options);
		}
		return streamWithPayloadPatch(inner, model, buildManagedContextForCachedContent(context), options, (payload) => {
			payload.cachedContent = cachedContent;
		});
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/pre-persisted-user-turn.ts
function sessionMessagesContainIdempotencyKey(messages, idempotencyKey) {
	return messages.some((message) => message.idempotencyKey === idempotencyKey);
}
function reconcilePrePersistedCurrentUserTurn(params) {
	const idempotencyKey = params.currentUserTurnMessage?.idempotencyKey;
	if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) return false;
	const durableTurnMatches = params.durableUserTurnMessage?.idempotencyKey === idempotencyKey;
	if (!params.userTurnAlreadyPersisted && !durableTurnMatches) return false;
	const messages = params.activeSession.agent.state.messages;
	const tail = messages.at(-1);
	const activeTailMatches = tail?.role === "user" && tail.idempotencyKey === idempotencyKey;
	if (!activeTailMatches && !durableTurnMatches) return params.currentUserTurnMessage.excludeFromContext === true;
	if (activeTailMatches) params.activeSession.agent.state.messages = messages.slice(0, -1);
	return true;
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-before-agent-run.ts
/**
* Runs the fail-closed before_agent_run gate and persists blocked turns.
*/
async function runEmbeddedAttemptBeforeAgentRun(input) {
	if (!input.hookRunner?.hasHooks("before_agent_run")) return;
	const persistBlockedBeforeAgentRun = async (block) => {
		const idempotencyKey = `hook-block:before_agent_run:user:${input.attempt.runId}`;
		if (sessionMessagesContainIdempotencyKey(input.activeSession.messages, idempotencyKey)) return true;
		const nowMs = Date.now();
		const redactedUserMessage = {
			role: "user",
			content: [{
				type: "text",
				text: block.message
			}],
			timestamp: nowMs,
			idempotencyKey,
			__openclaw: { beforeAgentRunBlocked: {
				blockedBy: block.pluginId,
				blockedAt: nowMs
			} }
		};
		try {
			await input.withOwnedTranscriptWrite(() => {
				input.sessionManager.appendMessage(redactedUserMessage);
				flushSessionManagerTranscript(input.sessionManager);
			});
			input.activeSession.agent.state.messages = sanitizeCompactionReplayMessages(input.sessionManager.buildSessionContext().messages);
			return true;
		} catch (err) {
			log$5.warn(`before_agent_run block: failed to persist redacted user message: ${err?.message ?? String(err)}`);
			return false;
		}
	};
	let beforeRunResult;
	try {
		beforeRunResult = await input.hookRunner.runBeforeAgentRun({
			prompt: input.modelPrompt,
			systemPrompt: input.systemPrompt,
			/** Gives hooks an isolated message snapshot they cannot mutate in-session. */
			messages: input.hookMessages.map((message) => structuredClone(message)),
			channelId: input.hookContext.channelId,
			accountId: input.attempt.agentAccountId ?? void 0,
			senderId: input.attempt.senderId ?? void 0,
			senderIsOwner: input.attempt.senderIsOwner ?? void 0
		}, input.hookContext);
	} catch {
		log$5.warn("before_agent_run hook failed; blocking request");
		const blockedBy = "before_agent_run";
		const message = resolveBlockMessage({
			outcome: "block",
			reason: "before_agent_run hook failed"
		}, { blockedBy });
		await persistBlockedBeforeAgentRun({
			message,
			pluginId: blockedBy
		});
		return {
			blockedBy,
			promptError: new Error(message)
		};
	}
	const beforeRunDecision = beforeRunResult?.decision;
	if (beforeRunDecision?.outcome !== "block") return;
	const blockedBy = beforeRunResult?.pluginId ?? "unknown";
	const message = resolveBlockMessage(beforeRunDecision, { blockedBy });
	log$5.warn(`before_agent_run hook blocked by ${blockedBy}`);
	await persistBlockedBeforeAgentRun({
		message,
		pluginId: blockedBy
	});
	return {
		blockedBy,
		promptError: new Error(message)
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/prompt-cache-observability.ts
/**
* Tracks prompt-cache snapshot changes for observability diagnostics.
*/
const trackers = /* @__PURE__ */ new Map();
const MAX_TRACKERS = 512;
const MAX_TOOL_SCHEMA_FINGERPRINT_DEPTH = 24;
const MAX_TOOL_SCHEMA_FINGERPRINT_NODES = 2048;
const MAX_TOOL_SCHEMA_FINGERPRINT_ENTRIES = 128;
const MAX_TOOL_SCHEMA_FINGERPRINT_STRING_CHARS = 4096;
const MIN_CACHE_BREAK_TOKEN_DROP = 1e3;
const MAX_STABLE_CACHE_READ_RATIO = .95;
function digestText(value) {
	return crypto$1.createHash("sha256").update(value).digest("hex");
}
function buildTrackerKey(params) {
	const promptCacheKey = params.promptCacheKey?.trim();
	if (promptCacheKey) return promptCacheKey;
	return params.sessionKey?.trim() || params.sessionId;
}
function normalizeToolSchemaFingerprint(value, state, depth = 0) {
	if (depth >= MAX_TOOL_SCHEMA_FINGERPRINT_DEPTH || state.remainingNodes <= 0) return "[schema fingerprint limit]";
	state.remainingNodes -= 1;
	if (value === null || typeof value === "boolean") return value;
	if (typeof value === "number") return Number.isFinite(value) ? value : "[non-finite number]";
	if (typeof value === "string") return truncateUtf16Safe(value, MAX_TOOL_SCHEMA_FINGERPRINT_STRING_CHARS);
	if (typeof value !== "object") return `[${typeof value}]`;
	if (state.stack.has(value)) return "[circular schema]";
	state.stack.add(value);
	try {
		if (Array.isArray(value)) {
			const entries = value.slice(0, MAX_TOOL_SCHEMA_FINGERPRINT_ENTRIES).map((entry) => normalizeToolSchemaFingerprint(entry, state, depth + 1));
			if (value.length > MAX_TOOL_SCHEMA_FINGERPRINT_ENTRIES) entries.push({ omitted: value.length - MAX_TOOL_SCHEMA_FINGERPRINT_ENTRIES });
			return entries;
		}
		const record = value;
		const keys = [];
		for (const key in record) {
			if (!Object.hasOwn(record, key)) continue;
			if (keys.length >= MAX_TOOL_SCHEMA_FINGERPRINT_ENTRIES) return "[schema key limit]";
			keys.push(key);
		}
		keys.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
		const entries = Object.create(null);
		for (const key of keys) try {
			entries[key] = normalizeToolSchemaFingerprint(record[key], state, depth + 1);
		} catch {
			entries[key] = "[unreadable schema value]";
		}
		return entries;
	} catch {
		return "[unreadable schema]";
	} finally {
		state.stack.delete(value);
	}
}
function buildToolDigest(tools) {
	return digestText(stableStringify(sortPromptCacheToolsByName(tools)));
}
function setTracker(key, tracker) {
	if (trackers.has(key)) trackers.delete(key);
	else if (trackers.size >= MAX_TRACKERS) pruneMapToMaxSize(trackers, 511);
	trackers.set(key, tracker);
}
function diffSnapshots(previous, next) {
	const changes = [];
	if (previous.provider !== next.provider || previous.modelId !== next.modelId) changes.push({
		code: "model",
		detail: `${previous.provider}/${previous.modelId} -> ${next.provider}/${next.modelId}`
	});
	else if ((previous.modelApi ?? null) !== (next.modelApi ?? null)) changes.push({
		code: "model",
		detail: `${previous.modelApi ?? "unknown"} -> ${next.modelApi ?? "unknown"}`
	});
	if (previous.cacheRetention !== next.cacheRetention) changes.push({
		code: "cacheRetention",
		detail: `${previous.cacheRetention ?? "default"} -> ${next.cacheRetention ?? "default"}`
	});
	if (previous.transport !== next.transport) changes.push({
		code: "transport",
		detail: `${previous.transport ?? "default"} -> ${next.transport ?? "default"}`
	});
	if (previous.streamStrategy !== next.streamStrategy) changes.push({
		code: "streamStrategy",
		detail: `${previous.streamStrategy} -> ${next.streamStrategy}`
	});
	if (previous.systemPromptDigest !== next.systemPromptDigest) changes.push({
		code: "systemPrompt",
		detail: "system prompt digest changed"
	});
	if (previous.toolDigest !== next.toolDigest) changes.push({
		code: "tools",
		detail: previous.toolCount === next.toolCount ? "tool set changed with same count" : `${previous.toolCount} -> ${next.toolCount} tools`
	});
	return changes.length > 0 ? changes : null;
}
function collectPromptCacheTools(tools) {
	const snapshots = [];
	for (const tool of tools) try {
		const name = tool.name?.trim();
		if (!name) continue;
		const snapshot = { name };
		try {
			if (typeof tool.description === "string") snapshot.descriptionDigest = digestText(tool.description);
		} catch {
			snapshot.descriptionDigest = digestText("[unreadable tool description]");
		}
		try {
			if (tool.parameters !== void 0) snapshot.schemaDigest = digestText(stableStringify(normalizeToolSchemaFingerprint(tool.parameters, {
				remainingNodes: MAX_TOOL_SCHEMA_FINGERPRINT_NODES,
				stack: /* @__PURE__ */ new WeakSet()
			})));
		} catch {
			snapshot.schemaDigest = digestText("[unreadable tool schema]");
		}
		snapshots.push(snapshot);
	} catch {
		continue;
	}
	return sortPromptCacheToolsByName(snapshots);
}
function beginPromptCacheObservation(params) {
	const key = buildTrackerKey(params);
	const tools = sortPromptCacheToolsByName(params.tools);
	const snapshot = {
		provider: params.provider,
		modelId: params.modelId,
		modelApi: params.modelApi,
		cacheRetention: params.cacheRetention,
		streamStrategy: params.streamStrategy,
		transport: params.transport,
		systemPromptDigest: digestText(splitSystemPromptCacheBoundary(params.systemPrompt)?.stablePrefix ?? params.systemPrompt),
		toolDigest: buildToolDigest(tools),
		toolCount: tools.length,
		toolNames: tools.map((tool) => tool.name)
	};
	const previous = trackers.get(key);
	const changes = previous ? diffSnapshots(previous.snapshot, snapshot) : null;
	setTracker(key, {
		snapshot,
		lastCacheRead: previous?.lastCacheRead ?? null,
		pendingChanges: changes
	});
	return {
		snapshot,
		changes,
		previousCacheRead: previous?.lastCacheRead ?? null
	};
}
function recordAggregateTruncation(params) {
	const tracker = trackers.get(buildTrackerKey(params));
	const changes = tracker?.pendingChanges ?? [];
	if (!tracker || changes.some((change) => change.code === "aggregateToolResultTruncation")) return;
	tracker.pendingChanges = [...changes, {
		code: "aggregateToolResultTruncation",
		detail: "aggregate tool-result truncation changed provider prompt"
	}];
}
function completePromptCacheObservation(params) {
	const key = buildTrackerKey(params);
	const tracker = trackers.get(key);
	if (!tracker) return null;
	const cacheRead = params.usage?.cacheRead;
	if (typeof cacheRead !== "number" || !Number.isFinite(cacheRead)) {
		tracker.pendingChanges = null;
		return null;
	}
	const previousCacheRead = tracker.lastCacheRead;
	tracker.lastCacheRead = cacheRead;
	if (previousCacheRead == null || previousCacheRead <= 0) {
		tracker.pendingChanges = null;
		return null;
	}
	const tokenDrop = previousCacheRead - cacheRead;
	const result = cacheRead < previousCacheRead * MAX_STABLE_CACHE_READ_RATIO && tokenDrop >= MIN_CACHE_BREAK_TOKEN_DROP ? {
		previousCacheRead,
		cacheRead,
		changes: tracker.pendingChanges
	} : null;
	tracker.pendingChanges = null;
	return result;
}
//#endregion
//#region src/gateway/server-methods/agent-timestamp.ts
/**
* Cron jobs inject "Current time: ..." into their messages.
* Skip injection for those.
*/
const CRON_TIME_MARKER = "Current time: ";
/**
* Matches a leading `[... YYYY-MM-DD HH:MM ...]` envelope — either from
* channel plugins or from a previous injection. Uses the same YYYY-MM-DD
* HH:MM format as {@link formatZonedTimestamp}, so detection stays in sync
* with the formatting.
*/
const TIMESTAMP_ENVELOPE_PATTERN = /^\[.*\d{4}-\d{2}-\d{2} \d{2}:\d{2}/;
/**
* Build a `[DOW YYYY-MM-DD HH:MM TZ] ` prefix string from an explicit date.
*
* Returns undefined if formatting fails (malformed timezone etc.).
* Does NOT guard against TIMESTAMP_ENVELOPE_PATTERN or CRON_TIME_MARKER —
* callers that need those guards should use {@link injectTimestamp} instead.
*
* This is the primitive used by the persistence path to stamp each stored
* message with ITS OWN arrival timestamp (not the current wall-clock time),
* so historical messages carry a stable, immutable prefix.
*/
function buildTimestampPrefix(date, opts) {
	const formatted = formatZonedTimestamp(date, {
		timeZone: opts?.timezone ?? "UTC",
		displayWeekday: true
	});
	return formatted ? `[${formatted}] ` : void 0;
}
/**
* Injects a compact timestamp prefix into a message if one isn't already
* present. Uses the same `YYYY-MM-DD HH:MM TZ` format as channel envelope
* timestamps ({@link formatZonedTimestamp}), keeping token cost low (~7
* tokens) and format consistent across all agent contexts.
*
* NOTE: The standard user-turn path no longer calls this. Per-message stamps
* are now applied once at the LLM boundary (normalizeMessagesForLlmBoundary)
* from each message's own timestamp, so storage stays bare and the current and
* historical sends are byte-identical — eliminating the prompt-cache bust
* described in issue #3658. This helper is retained only for any remaining
* non-user-turn callers and as the shared prefix primitive's wrapper.
*
* Channel messages (Discord, Telegram, etc.) already have timestamps via
* envelope formatting and take a separate code path — they never reach
* these handlers, so there is no double-stamping risk. The detection
* pattern is a safety net for edge cases.
*
* @see https://github.com/openclaw/openclaw/issues/3658
*/
function injectTimestamp(message, opts) {
	if (opts?.includeTimestamp === false) return message;
	if (!message.trim()) return message;
	if (TIMESTAMP_ENVELOPE_PATTERN.test(message)) return message;
	if (message.includes(CRON_TIME_MARKER)) return message;
	const prefix = buildTimestampPrefix(opts?.now ?? /* @__PURE__ */ new Date(), opts);
	if (!prefix) return message;
	return `${prefix}${message}`;
}
/**
* Build TimestampInjectionOptions from an OpenClawConfig.
*/
function timestampOptsFromConfig(cfg) {
	return {
		timezone: resolveUserTimezone(cfg.agents?.defaults?.userTimezone),
		includeTimestamp: true
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-llm-boundary.ts
/**
* Installs runtime-context and prompt-transform boundaries before LLM calls.
*/
/**
* Matches a leading `[... YYYY-MM-DD HH:MM ...]` timestamp envelope — either
* from a channel plugin envelope or from a previous boundary stamp. Mirrors
* TIMESTAMP_ENVELOPE_PATTERN in agent-timestamp.ts. Used to avoid
* double-stamping a user message that already carries a timestamp.
*/
const BOUNDARY_TIMESTAMP_ENVELOPE_RE = /^\[.*\d{4}-\d{2}-\d{2} \d{2}:\d{2}/;
const BOUNDARY_CRON_TIME_MARKER = "Current time: ";
function normalizeMessagesForLlmBoundary(messages, options) {
	const normalized = stripUnsafeBlockedRunMetadata(stripToolResultDetails(normalizeAssistantReplayContent(messages)));
	const userTranscriptMessages = resolveUserTranscriptMessages(normalized, options?.userTranscriptContexts, options?.currentUserTimestampOverride);
	const withoutHistoricalInboundMetadata = stripHistoricalInboundMetadataFromUserMessages(normalized, options);
	const withPersistedSenderContext = options?.projectPersistedSenderContext === false ? withoutHistoricalInboundMetadata : projectPersistedSenderContext(withoutHistoricalInboundMetadata, userTranscriptMessages);
	return stripHistoricalRuntimeContextCustomMessages(withPersistedSenderContext);
}
/** Normalizes existing transcript messages as if the current prompt were appended last. */
function normalizeMessagesForCurrentPromptBoundary(params) {
	const { message, options } = buildCurrentPromptBoundaryInput(params);
	return normalizeMessagesForLlmBoundary([...params.messages, message], options).slice(0, -1);
}
function normalizeCurrentPromptTextForLlmBoundary(params) {
	const { message, options } = buildCurrentPromptBoundaryInput(params);
	const [normalized] = normalizeMessagesForLlmBoundary([message], options);
	const content = normalized?.content;
	return typeof content === "string" ? content : params.prompt;
}
function buildCurrentPromptBoundaryInput(params) {
	const message = {
		role: "user",
		content: [{
			type: "text",
			text: params.prompt
		}],
		timestamp: params.currentUserTimestamp ?? Date.now()
	};
	return {
		message,
		options: {
			...params.timezone ? { timezone: params.timezone } : {},
			...params.includeTimestamp === false ? { includeTimestamp: false } : {},
			...params.currentUserTranscriptMessage ? { userTranscriptContexts: [{
				runtimeMessage: message,
				transcriptMessage: params.currentUserTranscriptMessage
			}] } : {}
		}
	};
}
/**
* Temporarily injects a runtime-context message for prompt conversion and retry.
* Cleanup restores the original continuation hook and removes only the injected
* message object.
*/
function installRuntimeContextMessageForPrompt(params) {
	const { message, session } = params;
	if (!message) return () => void 0;
	const installBeforePrompt = () => {
		if (!session.messages.includes(message)) session.agent.state.messages = appendRuntimeContextMessageForPrompt({
			message,
			messages: session.messages
		});
	};
	const installBeforeRetry = () => {
		if (!session.messages.includes(message)) session.agent.state.messages = insertRuntimeContextMessageForPrompt({
			message,
			messages: session.messages
		});
	};
	installBeforePrompt();
	const agent = session.agent;
	const originalContinue = Reflect.get(agent, "continue", agent);
	if (typeof originalContinue === "function") {
		const continueWithAgent = originalContinue.bind(agent);
		agent.continue = function continueWithRuntimeContext() {
			installBeforeRetry();
			return continueWithAgent();
		};
	}
	return () => {
		if (typeof originalContinue === "function") agent.continue = originalContinue;
		session.agent.state.messages = session.messages.filter((candidate) => candidate !== message);
	};
}
function appendRuntimeContextMessageForPrompt(params) {
	if (params.messages.includes(params.message)) return params.messages;
	return [...params.messages, params.message];
}
/**
* Inserts runtime context before the active user turn on retry. Overflow rebuilds
* can rehydrate a transcript ending in tool-call messages, so the active prompt
* is found by walking backward through tool-call assistants.
*/
function insertRuntimeContextMessageForPrompt(params) {
	if (params.messages.includes(params.message)) return params.messages;
	const activeUserMessageIndex = findActiveUserMessageIndex(params.messages);
	if (activeUserMessageIndex === -1) return [...params.messages, params.message];
	return [
		...params.messages.slice(0, activeUserMessageIndex),
		params.message,
		...params.messages.slice(activeUserMessageIndex)
	];
}
function replaceLastUserTextPrompt(params) {
	const userIndex = params.messages.findLastIndex((message) => message.role === "user");
	if (userIndex === -1) return params.messages;
	const message = params.messages[userIndex];
	if (!message || message.role !== "user") return params.messages;
	if (params.shouldCapture && !params.shouldCapture(message)) return params.messages;
	const content = message.content;
	if (typeof content === "string") {
		const replacement = params.replace(content);
		if (replacement === void 0) return params.messages;
		const next = params.messages.slice();
		next[userIndex] = {
			...message,
			content: replacement
		};
		if (params.transcriptText !== void 0) markTranscriptPromptText(next[userIndex], params.transcriptText);
		return next;
	}
	if (!Array.isArray(content)) return params.messages;
	let replaced = false;
	const nextContent = content.map((block) => {
		if (replaced || !block || typeof block !== "object") return block;
		const textBlock = block;
		if (textBlock.type !== "text" || typeof textBlock.text !== "string") return block;
		const replacement = params.replace(textBlock.text);
		if (replacement === void 0) return block;
		replaced = true;
		return Object.assign({}, block, { text: replacement });
	});
	if (!replaced) return params.messages;
	const next = params.messages.slice();
	next[userIndex] = {
		...message,
		content: nextContent
	};
	if (params.transcriptText !== void 0) markTranscriptPromptText(next[userIndex], params.transcriptText);
	return next;
}
function composeModelPromptContext(params) {
	return [
		params.prependContext,
		params.prompt,
		params.appendContext
	].filter((value) => Boolean(value?.trim())).join("\n\n");
}
/**
* Temporarily rewrites only the active user prompt for model submission while
* preserving the transcript prompt text for repair/guard metadata.
*/
function installModelPromptTransform(params) {
	const modelPrompt = params.modelPrompt;
	const hasPromptContext = Boolean(params.prependContext?.trim()) || Boolean(params.appendContext?.trim());
	if ((!modelPrompt?.trim() || modelPrompt === params.transcriptPrompt) && !hasPromptContext) return () => void 0;
	const agent = params.session.agent;
	const originalTransformContext = agent.transformContext;
	let targetPromptTimestamp;
	agent.transformContext = async (messages, signal) => {
		const promptMessages = replaceLastUserTextPrompt({
			messages,
			transcriptText: params.transcriptPrompt,
			shouldCapture: (message) => {
				const timestamp = message.timestamp;
				if (targetPromptTimestamp !== void 0) return timestamp === targetPromptTimestamp;
				if (!params.shouldCapturePrompt()) return false;
				if (typeof timestamp === "number") targetPromptTimestamp = timestamp;
				return true;
			},
			replace: (text) => {
				if (modelPrompt?.trim() && text === params.transcriptPrompt) return modelPrompt;
				if (!hasPromptContext) return;
				const replacement = composeModelPromptContext({
					prompt: text,
					prependContext: params.prependContext,
					appendContext: params.appendContext
				});
				return replacement === text ? void 0 : replacement;
			}
		});
		return originalTransformContext ? await originalTransformContext.call(agent, promptMessages, signal) : promptMessages;
	};
	return () => {
		agent.transformContext = originalTransformContext;
	};
}
/**
* Collapse a single-text-block content array to a plain string.
*
* Full-resend transports (anthropic-messages, openai-completions) re-send the
* entire message history every turn.  The CURRENT user turn arrives as an
* array `[{type:"text", text:"…"}]` (the SDK's native format), while
* historical turns are loaded from the JSONL transcript as a plain string.
* This form flip alone busts the prompt cache even when the text is identical.
*
* Collapsing single-text-block arrays to strings makes the serialized bytes
* identical whether a message is current or historical.
*
* Turns with attachments (image / document blocks) must remain as arrays and
* are NOT collapsed.
*
* @see https://github.com/openclaw/openclaw/issues/3658
*/
function canonicalizeTextOnlyUserContent(content) {
	if (!Array.isArray(content)) return content;
	if (content.length !== 1) return content;
	const block = content[0];
	if (!block || typeof block !== "object") return content;
	const textBlock = block;
	if (textBlock.type !== "text" || typeof textBlock.text !== "string") return content;
	return textBlock.text;
}
/**
* Stamp a bare text string with this message's own timestamp prefix.
*
* SINGLE SOURCE OF TRUTH for the per-message `[DOW YYYY-MM-DD HH:MM TZ]`
* prefix (issue #3658). The gateway no longer stamps the live turn, and
* storage is bare — so every user message (current AND historical) is stamped
* HERE from its OWN `timestamp` field. Because the stamp derives from the
* message's fixed timestamp (NOT wall-clock `now`), the SAME message produces
* byte-identical bytes whether it is sent as the current turn or replayed as
* history. That stability is what lets full-resend transports cache the prefix.
*
* Guards (return text unchanged):
*  - empty / whitespace-only text;
*  - text already carrying a `[... YYYY-MM-DD HH:MM ...]` envelope (channel
*    plugin envelope or an already-applied stamp);
*  - cron messages carrying the "Current time: " marker.
*/
function stampUserTextWithMessageTimestamp(text, timestamp, timezone, includeTimestamp) {
	if (includeTimestamp === false) return text;
	if (!timezone) return text;
	if (!text.trim()) return text;
	if (BOUNDARY_TIMESTAMP_ENVELOPE_RE.test(text) || text.includes(BOUNDARY_CRON_TIME_MARKER)) return text;
	if (text.startsWith("[Inter-session message]")) return text;
	if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return text;
	const prefix = buildTimestampPrefix(new Date(timestamp), { timezone });
	if (!prefix) return text;
	return `${prefix}${text}`;
}
function messageContentMatchesCurrentUserText(content, override) {
	const matchesText = (text) => text === override.text || text === override.alternateText;
	const text = readFirstUserText(content);
	return text !== void 0 && matchesText(text);
}
function messageRuntimeTimestampMatchesCurrentUserOverride(runtimeTimestamp, override) {
	if (typeof override.runtimeTimestamp === "number") return runtimeTimestamp === override.runtimeTimestamp;
	if (typeof runtimeTimestamp === "number" && Number.isFinite(runtimeTimestamp)) override.runtimeTimestamp = runtimeTimestamp;
	return true;
}
function stripHistoricalInboundMetadataFromUserMessages(messages, options) {
	const activeUserMessageIndex = findActiveUserMessageIndex(messages);
	let changed = false;
	const nextMessages = messages.map((message, index) => {
		if (message.role !== "user") return message;
		const content = message.content;
		const injectMediaText = !hasNonBlankUserText(content) && hasPersistedMedia(message);
		const isActive = index === activeUserMessageIndex;
		const override = options?.currentUserTimestampOverride;
		const runtimeTimestamp = message.timestamp;
		const messageTimestamp = isActive && override !== void 0 && messageContentMatchesCurrentUserText(content, override) && messageRuntimeTimestampMatchesCurrentUserOverride(runtimeTimestamp, override) ? override.timestamp : runtimeTimestamp;
		const transformText = (raw) => {
			const sourceText = injectMediaText && !raw.trim() ? buildLateMediaAttachedProjection(message).text ?? "[User sent media without caption]" : raw;
			const { body, envelope } = splitLeadingTimestampEnvelope(sourceText);
			if (envelope || sourceText.includes(BOUNDARY_CRON_TIME_MARKER)) {
				if (isActive) return sourceText;
				return `${envelope}${stripInboundMetadata(body)}`;
			}
			return stampUserTextWithMessageTimestamp(isActive ? sourceText : stripInboundMetadata(sourceText), messageTimestamp, options?.timezone, options?.includeTimestamp);
		};
		if (typeof content === "string") {
			const next = transformText(content);
			if (next === content) return message;
			changed = true;
			return {
				...message,
				content: next
			};
		}
		if (!Array.isArray(content)) return message;
		const canonical = canonicalizeTextOnlyUserContent(content);
		if (typeof canonical === "string") {
			changed = true;
			return {
				...message,
				content: transformText(canonical)
			};
		}
		let contentChanged = false;
		let processedFirstText = false;
		const nextContent = content.map((block) => {
			if (!block || typeof block !== "object") return block;
			const textBlock = block;
			if (textBlock.type !== "text" || typeof textBlock.text !== "string") return block;
			let nextText;
			if (!processedFirstText) {
				nextText = transformText(textBlock.text);
				processedFirstText = true;
			} else nextText = isActive ? textBlock.text : stripInboundMetadata(textBlock.text);
			if (nextText === textBlock.text) return block;
			contentChanged = true;
			return Object.assign({}, block, { text: nextText });
		});
		if (!processedFirstText && injectMediaText) {
			nextContent.unshift({
				type: "text",
				text: transformText("")
			});
			contentChanged = true;
		}
		if (!contentChanged) return message;
		changed = true;
		return {
			...message,
			content: nextContent
		};
	});
	return changed ? nextMessages : messages;
}
function stripUnsafeBlockedRunMetadata(messages) {
	let changed = false;
	const nextMessages = messages.map((message) => {
		const openclaw = Reflect.get(message, "__openclaw");
		if (!openclaw || typeof openclaw !== "object") return message;
		const beforeAgentRunBlocked = openclaw.beforeAgentRunBlocked;
		if (!beforeAgentRunBlocked || typeof beforeAgentRunBlocked !== "object") return message;
		const blocked = beforeAgentRunBlocked;
		const safeBlocked = {};
		if (typeof blocked.blockedBy === "string") safeBlocked.blockedBy = blocked.blockedBy;
		if (typeof blocked.blockedAt === "number") safeBlocked.blockedAt = blocked.blockedAt;
		const nextOpenClaw = {
			...openclaw,
			beforeAgentRunBlocked: safeBlocked
		};
		changed = true;
		return Object.assign({}, message, { __openclaw: nextOpenClaw });
	});
	return changed ? nextMessages : messages;
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-context-summary.ts
function summarizeMessagePayload(msg) {
	const content = msg.content;
	if (typeof content === "string") return {
		textChars: content.length,
		imageBlocks: 0
	};
	if (!Array.isArray(content)) return {
		textChars: 0,
		imageBlocks: 0
	};
	let textChars = 0;
	let imageBlocks = 0;
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		const typedBlock = block;
		if (typedBlock.type === "image") {
			imageBlocks++;
			continue;
		}
		if (typeof typedBlock.text === "string") textChars += typedBlock.text.length;
	}
	return {
		textChars,
		imageBlocks
	};
}
function summarizeSessionContext(messages) {
	const roleCounts = /* @__PURE__ */ new Map();
	let totalTextChars = 0;
	let totalImageBlocks = 0;
	let maxMessageTextChars = 0;
	for (const msg of messages) {
		const role = typeof msg.role === "string" ? msg.role : "unknown";
		roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
		const payload = summarizeMessagePayload(msg);
		totalTextChars += payload.textChars;
		totalImageBlocks += payload.imageBlocks;
		if (payload.textChars > maxMessageTextChars) maxMessageTextChars = payload.textChars;
	}
	return {
		roleCounts: [...roleCounts.entries()].toSorted((a, b) => a[0].localeCompare(b[0])).map(([role, count]) => `${role}:${count}`).join(",") || "none",
		totalTextChars,
		totalImageBlocks,
		maxMessageTextChars
	};
}
function snapshotRecentMessages(messages) {
	return messages.slice(-100);
}
//#endregion
//#region src/agents/embedded-agent-runner/abort.ts
/**
* Detects abort-shaped errors from embedded-agent runner dependencies.
*/
/** Return true for AbortError objects or lower-level aborted messages. */
function isRunnerAbortError(err) {
	if (!err || typeof err !== "object") return false;
	if (("name" in err ? String(err.name) : "") === "AbortError") return true;
	return ("message" in err && typeof err.message === "string" ? normalizeLowercaseStringOrEmpty(err.message) : "").includes("aborted");
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-subscription-cleanup.ts
/** Cleans up embedded attempt subscription resources. */
/** Shared timeout for waiting on aborted model/prompt cleanup before releasing resources. */
const EMBEDDED_ABORT_SETTLE_TIMEOUT_MS = resolveEmbeddedAbortSettleTimeoutMs();
async function waitForEmbeddedAbortSettle(params) {
	if (!params.promise) return;
	const reason = params.reason ?? "embedded";
	let timeout;
	const outcome = await Promise.race([params.promise.then(() => "settled").catch((err) => {
		log$5.warn(`${reason} abort settle failed: runId=${params.runId} sessionId=${params.sessionId} err=${String(err)}`);
		return "errored";
	}), new Promise((resolve) => {
		timeout = setTimeout(() => resolve("timed_out"), EMBEDDED_ABORT_SETTLE_TIMEOUT_MS);
	})]);
	if (timeout) clearTimeout(timeout);
	if (outcome === "timed_out") log$5.warn(`${reason} abort settle timed out: runId=${params.runId} sessionId=${params.sessionId} timeoutMs=${EMBEDDED_ABORT_SETTLE_TIMEOUT_MS}`);
}
/**
* Tears down per-attempt resources after the transcript lifecycle has drained:
* remove guards, settle aborted prompts, flush tool results, then dispose runtimes.
*/
async function cleanupEmbeddedAttemptResources(params) {
	try {
		params.removeToolResultContextGuard?.();
	} catch {}
	if (params.aborted && params.abortSettlePromise) await waitForEmbeddedAbortSettle({
		promise: params.abortSettlePromise,
		runId: params.runId ?? "unknown",
		sessionId: params.sessionId ?? "unknown"
	});
	try {
		await params.flushPendingToolResultsAfterIdle({
			agent: params.session?.agent,
			sessionManager: params.sessionManager,
			...params.aborted ? { timeoutMs: 0 } : {}
		});
	} catch {}
	try {
		params.session?.dispose();
	} catch {}
	try {
		await params.bundleMcpRuntime?.dispose();
	} catch {}
	try {
		await params.bundleLspRuntime?.dispose();
	} catch {}
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-sessions-yield.ts
/**
* Handles sessions-yield interruption, persistence, and artifact cleanup.
*/
const SESSIONS_YIELD_INTERRUPT_CUSTOM_TYPE = "openclaw.sessions_yield_interrupt";
const SESSIONS_YIELD_CONTEXT_CUSTOM_TYPE = "openclaw.sessions_yield";
function buildSessionsYieldContextMessage(message) {
	return `${message}\n\n[Context: The previous turn ended intentionally via sessions_yield while waiting for a follow-up event.]`;
}
async function waitForSessionsYieldAbortSettle(params) {
	await waitForEmbeddedAbortSettle({
		promise: params.settlePromise,
		runId: params.runId,
		sessionId: params.sessionId,
		reason: "sessions_yield"
	});
}
function createYieldAbortedResponse(model) {
	const message = {
		role: "assistant",
		content: [{
			type: "text",
			text: ""
		}],
		stopReason: "aborted",
		api: model.api ?? "",
		provider: model.provider ?? "",
		model: model.id ?? "",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				total: 0
			}
		},
		timestamp: Date.now()
	};
	return {
		async *[Symbol.asyncIterator]() {},
		result: async () => message
	};
}
const SESSIONS_YIELD_ABORT_REASON = {
	code: "sessions_yield",
	turnHandoff: true
};
/** True when a runner abort error was raised by the sessions_yield handoff. */
function isSessionsYieldAbortError(err) {
	return isRunnerAbortError(err) && err instanceof Error && isSessionsYieldAbortReason(err.cause);
}
function isSessionsYieldAbortReason(reason) {
	return typeof reason === "object" && reason !== null && reason.code === "sessions_yield";
}
function queueSessionsYieldInterruptMessage(activeSession) {
	activeSession.agent.steer({
		role: "custom",
		customType: SESSIONS_YIELD_INTERRUPT_CUSTOM_TYPE,
		content: "[sessions_yield interrupt]",
		display: false,
		details: { source: "sessions_yield" },
		timestamp: Date.now()
	});
}
async function persistSessionsYieldContextMessage(activeSession, message) {
	await activeSession.sendCustomMessage({
		customType: SESSIONS_YIELD_CONTEXT_CUSTOM_TYPE,
		content: buildSessionsYieldContextMessage(message),
		display: false,
		details: {
			source: "sessions_yield",
			message
		}
	}, { triggerTurn: false });
}
function stripSessionsYieldArtifacts(activeSession) {
	const strippedMessages = activeSession.messages.slice();
	while (strippedMessages.length > 0) {
		const last = strippedMessages.at(-1);
		if (!(last?.role === "assistant" || last?.role === "custom" && last.customType === SESSIONS_YIELD_INTERRUPT_CUSTOM_TYPE)) break;
		strippedMessages.pop();
	}
	const removedMessages = activeSession.messages.slice(strippedMessages.length);
	if (removedMessages.length === 0) return;
	activeSession.agent.state.messages = strippedMessages;
	let remainingAssistantCount = removedMessages.filter((message) => message.role === "assistant").length;
	activeSession.sessionManager.removeTrailingEntries((entry) => {
		if (entry.type === "custom_message" && entry.customType === SESSIONS_YIELD_INTERRUPT_CUSTOM_TYPE) return true;
		if (entry.type !== "message" || entry.message.role !== "assistant" || remainingAssistantCount === 0) return false;
		remainingAssistantCount -= 1;
		return true;
	}, { preserveTrailing: (entry) => entry.type === "custom" || entry.type === "label" || entry.type === "session_info" || entry.type === "message" && isTranscriptOnlyOpenClawAssistantMessage(entry.message) });
}
//#endregion
//#region src/agents/embedded-agent-runner/run/message-transform-stream-wrapper.ts
/**
* Wraps stream functions with pre-call message transforms.
*/
/** Wraps a stream function with a conditional message-list transform. */
function wrapStreamFnWithMessageTransform(streamFn, transform, materializeProviderContext) {
	return (model, context, options) => {
		const messages = context?.messages;
		const nextMessages = Array.isArray(messages) ? transform(messages, model) : messages;
		const nextContext = Array.isArray(messages) && nextMessages !== messages ? {
			...context,
			messages: nextMessages
		} : context;
		if (!materializeProviderContext) return streamFn(model, nextContext, options);
		let availableContext = nextContext;
		const handoff = async () => {
			const captured = availableContext;
			availableContext = void 0;
			if (!captured) throw new Error("provider context handoff already consumed");
			options?.signal?.throwIfAborted();
			return await materializeProviderContext({
				context: captured,
				signal: options?.signal
			});
		};
		return streamFn(model, nextContext, {
			...options,
			[PROVIDER_CONTEXT_HANDOFF]: handoff
		});
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-prompt-submit.ts
async function submitEmbeddedAttemptPrompt(input) {
	const { activeSession, attempt } = input;
	const userTurnRecorder = attempt.userTurnTranscriptRecorder;
	const persistedUserIdempotencyKey = attempt.skipPreparedUserTurnMessage !== true && userTurnRecorder?.hasPersisted() === true ? (userTurnRecorder.getPersistedMessage?.() ?? userTurnRecorder.message)?.idempotencyKey : void 0;
	const normalizedReplayMessages = normalizeAssistantReplayContent(activeSession.messages);
	if (normalizedReplayMessages !== activeSession.messages) activeSession.agent.state.messages = normalizedReplayMessages;
	const installProviderPromptHistoryTransform = () => {
		const baseStreamFn = activeSession.agent.streamFn;
		const providerPromptStreamFn = wrapStreamFnWithMessageTransform(baseStreamFn, (messages) => {
			ocPromptMark(attempt, "pp:provider-transform");
			const providerPromptHistoryTruncation = truncateOversizedToolResultsInMessages(messages, input.contextTokenBudget, input.toolResultMaxChars, input.toolResultAggregateMaxChars, input.toolResultPromptProjectionState);
			const providerMessages = providerPromptHistoryTruncation.messages !== messages ? providerPromptHistoryTruncation.messages : messages;
			if (providerPromptHistoryTruncation.aggregateTruncatedCount > 0) recordAggregateTruncation(attempt);
			markSessionUserTurnsSent(input.sessionPromptState, providerMessages);
			const recorder = attempt.userTurnTranscriptRecorder;
			if (recorder && hasSessionUserTurnBeenSent(input.sessionPromptState, recorder.message) !== false) recorder.markSentToProvider?.();
			return providerMessages;
		});
		activeSession.agent.streamFn = providerPromptStreamFn;
		return () => {
			if (activeSession.agent.streamFn === providerPromptStreamFn) activeSession.agent.streamFn = baseStreamFn;
		};
	};
	input.onFinalPromptText(input.transcriptPrompt);
	input.trajectoryRecorder?.recordEvent("prompt.submitted", {
		prompt: input.modelPrompt,
		systemPrompt: input.systemPrompt,
		messages: activeSession.messages,
		imagesCount: input.images.length
	});
	updateActiveEmbeddedRunSnapshot(attempt.sessionId, {
		transcriptLeafId: input.transcriptLeafId,
		messages: snapshotRecentMessages(normalizedReplayMessages),
		inFlightPrompt: input.transcriptPrompt
	});
	let captureCurrentPromptForModel = false;
	const cleanupModelPromptTransform = installModelPromptTransform({
		session: activeSession,
		transcriptPrompt: input.transcriptPrompt,
		modelPrompt: input.modelPrompt,
		prependContext: input.prependContext,
		appendContext: input.appendContext,
		shouldCapturePrompt: () => captureCurrentPromptForModel
	});
	const armModelPromptTransform = (submitted) => {
		if (submitted) captureCurrentPromptForModel = true;
	};
	ocPromptMark(attempt, "pp:submit-ready");
	const cleanupProviderPromptHistoryTransform = installProviderPromptHistoryTransform();
	try {
		if (input.runtimeOnly) await input.promptActiveSession(input.transcriptPrompt, {
			...persistedUserIdempotencyKey ? { persistedUserIdempotencyKey } : {},
			preflightResult: armModelPromptTransform
		});
		else {
			const cleanupRuntimeContextMessage = installRuntimeContextMessageForPrompt({
				session: activeSession,
				message: input.runtimeContextMessage
			});
			try {
				await input.promptActiveSession(input.transcriptPrompt, {
					...input.images.length > 0 ? { images: input.images } : {},
					...persistedUserIdempotencyKey ? { persistedUserIdempotencyKey } : {},
					preflightResult: armModelPromptTransform
				});
			} finally {
				cleanupRuntimeContextMessage();
			}
		}
		if (input.leasedSteering) {
			ackPendingAgentSteeringItems(input.leasedSteering);
			input.onSteeringAcknowledged();
		}
	} finally {
		cleanupProviderPromptHistoryTransform();
		cleanupModelPromptTransform();
	}
}
/** Classifies prompt submissions that have no visible current-turn content. */
function resolvePromptSubmissionSkipReason(params) {
	if (params.prompt.trim().length > 0 || params.imageCount > 0) return null;
	return params.messages.some(hasVisiblePromptHistory) ? "blank_user_prompt" : "empty_prompt_history_images";
}
function hasVisiblePromptHistory(message) {
	if (!message || typeof message !== "object") return false;
	const record = message;
	if (record.role !== "user" && record.role !== "assistant") return false;
	return hasNonEmptyContent(record.content);
}
function hasNonEmptyContent(content) {
	if (typeof content === "string") return content.trim().length > 0;
	if (Array.isArray(content)) return content.some(hasNonEmptyContent);
	if (!content || typeof content !== "object") return false;
	const record = content;
	return hasNonEmptyContent(record.text) || hasNonEmptyContent(record.content);
}
async function handleEmbeddedAttemptPromptError(input) {
	input.releaseLeasedSteering(input.error);
	if (input.yieldDetected && isSessionsYieldAbortError(input.error)) {
		input.markYieldAborted();
		await waitForSessionsYieldAbortSettle({
			settlePromise: input.yieldAbortSettled,
			runId: input.attempt.runId,
			sessionId: input.attempt.sessionId
		});
		await input.withOwnedTranscriptWrite(async () => {
			stripSessionsYieldArtifacts(input.activeSession);
			if (input.yieldMessage) await persistSessionsYieldContextMessage(input.activeSession, input.yieldMessage);
		});
		return {};
	}
	if (isMidTurnPrecheckSignal(input.error)) {
		const request = input.error.request;
		await input.withOwnedTranscriptWrite(() => {
			input.handleMidTurnPrecheckRequest(request);
		});
		return {};
	}
	return { promptFailure: {
		error: input.error,
		source: "prompt"
	} };
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-prompt-support.ts
/**
* Supports prompt construction and observation between session setup and submission.
* It may assume resolved tools, hook context, and diagnostic inputs are ready.
*/
/** Retains the prompt hook's cap while replacing the host-owned tool generation. */
function createPromptBuildToolPolicy(params) {
	const captureBaseline = () => ({
		activeToolNames: params.session.getActiveToolNames(),
		catalogEntries: [...params.catalogRef?.current?.entries ?? []]
	});
	let baseline = captureBaseline();
	let toolsAllow;
	const current = {
		activeToolNames: [...baseline.activeToolNames],
		coreReadAuthorized: params.coreReadAuthorized,
		effectiveTools: params.effectiveTools,
		uncompactedEffectiveTools: params.uncompactedEffectiveTools,
		tools: params.tools
	};
	const apply = (nextToolsAllow) => {
		toolsAllow = nextToolsAllow;
		Object.assign(current, applyPromptBuildToolsAllow({
			...params,
			baseline,
			toolsAllow
		}));
		params.onApplied?.(current);
		return current;
	};
	return {
		current,
		apply,
		refresh: () => {
			baseline = captureBaseline();
			return apply(toolsAllow);
		}
	};
}
function applyResolvedToolPromptFinalizer(params) {
	if (!params.finalize) return params.prompt;
	return params.finalize({
		prompt: params.prompt,
		messageToolAvailable: params.activeToolNames.some((toolName) => normalizeToolPolicyName(toolName) === "message")
	});
}
function sameToolNames(left, right) {
	return left.length === right.length && left.every((name, index) => name === right[index]);
}
/**
* Applies a prompt-hook tool cap to the already-built turn surface. Filtering
* the concrete host baseline makes the hook an intersection with every host
* policy while allowing a later prompt build to apply a different cap.
*/
function applyPromptBuildToolsAllow(params) {
	const policyInput = {
		toolsAllow: params.toolsAllow,
		forceToolNames: params.forceToolNames
	};
	const promptPolicy = createAgentHarnessPromptToolPolicy({
		tools: params.effectiveTools,
		catalogRef: params.catalogRef,
		catalogEntries: params.baseline.catalogEntries,
		codeModeControlsEnabled: params.codeModeControlsEnabled
	}).apply(policyInput);
	const allowedUncompactedTools = createAgentHarnessPromptToolPolicy({
		tools: params.uncompactedEffectiveTools,
		codeModeControlsEnabled: false
	}).apply(policyInput).tools;
	const allowedTools = createAgentHarnessPromptToolPolicy({
		tools: params.tools,
		codeModeControlsEnabled: false
	}).apply(policyInput).tools;
	const allowedActiveNames = new Set(createAgentHarnessPromptToolPolicy({
		tools: params.baseline.activeToolNames.map((name) => ({ name })),
		codeModeControlsEnabled: false
	}).apply(policyInput).tools.map((tool) => normalizeToolPolicyName(tool.name)));
	for (const tool of [
		...promptPolicy.tools,
		...allowedUncompactedTools,
		...allowedTools
	]) allowedActiveNames.add(normalizeToolPolicyName(tool.name));
	const activeToolNames = params.baseline.activeToolNames.filter((name) => allowedActiveNames.has(normalizeToolPolicyName(name)));
	if (!sameToolNames(params.session.getActiveToolNames(), activeToolNames)) params.session.setActiveToolsByName(activeToolNames);
	return {
		activeToolNames,
		coreReadAuthorized: params.coreReadAuthorized && allowedUncompactedTools.some((tool) => normalizeToolPolicyName(tool.name) === "read"),
		effectiveTools: promptPolicy.tools,
		uncompactedEffectiveTools: allowedUncompactedTools,
		tools: allowedTools
	};
}
function observeEmbeddedAttemptPrompt(input) {
	const { attempt } = input;
	let skipPromptSubmission = input.skipPromptSubmission;
	if (!skipPromptSubmission) {
		input.cacheTrace?.recordStage("prompt:before", {
			prompt: input.promptForModel,
			messages: input.sessionMessages
		});
		input.cacheTrace?.recordStage("prompt:images", {
			prompt: input.promptForModel,
			messages: input.sessionMessages,
			note: `images: prompt=${input.imageCount}`
		});
		const providerVisibleTools = toTrajectoryToolDefinitions(input.effectiveTools);
		const trajectoryTools = input.toolSearchCompacted ? toTrajectoryToolDefinitions(input.uncompactedEffectiveTools) : providerVisibleTools;
		input.trajectoryRecorder?.recordEvent("context.compiled", {
			systemPrompt: input.systemPromptForHook,
			prompt: input.promptForModel,
			messages: input.sessionMessages,
			tools: trajectoryTools,
			...input.toolSearchCompacted ? { providerVisibleTools } : {},
			imagesCount: input.imageCount,
			streamStrategy: input.streamStrategy,
			transport: input.transport,
			transcriptLeafId: input.transcriptLeafId
		});
	}
	const promptSkipReason = skipPromptSubmission ? null : resolvePromptSubmissionSkipReason({
		prompt: input.promptForModel,
		messages: input.sessionMessages,
		runtimeOnly: input.promptSubmissionRuntimeOnly,
		imageCount: input.imageCount
	});
	if (promptSkipReason) {
		skipPromptSubmission = true;
		const skipContext = `runId=${attempt.runId} sessionId=${attempt.sessionId} trigger=${attempt.trigger} provider=${attempt.provider}/${attempt.modelId}`;
		if (promptSkipReason === "blank_user_prompt") log$5.warn(`embedded run prompt skipped: blank user prompt ${skipContext}`);
		else log$5.info(`embedded run prompt skipped: empty prompt/history/images ${skipContext}`);
		input.trajectoryRecorder?.recordEvent("prompt.skipped", {
			reason: promptSkipReason,
			prompt: input.promptForModel,
			messages: input.sessionMessages,
			imagesCount: input.imageCount
		});
	}
	const sessionSummary = summarizeSessionContext(input.sessionMessages);
	emitTrustedDiagnosticEvent({
		type: "context.assembled",
		runId: attempt.runId,
		...attempt.sessionKey && { sessionKey: attempt.sessionKey },
		...attempt.sessionId && { sessionId: attempt.sessionId },
		provider: attempt.provider,
		model: attempt.modelId,
		...attempt.messageChannel ?? attempt.messageProvider ? { channel: attempt.messageChannel ?? attempt.messageProvider } : {},
		trigger: attempt.trigger,
		messageCount: input.sessionMessages.length,
		historyTextChars: sessionSummary.totalTextChars,
		historyImageBlocks: sessionSummary.totalImageBlocks,
		maxMessageTextChars: sessionSummary.maxMessageTextChars,
		systemPromptChars: input.systemPromptText?.length ?? 0,
		promptChars: input.effectivePrompt.length,
		promptImages: input.imageCount,
		contextTokenBudget: input.contextTokenBudget,
		reserveTokens: input.reserveTokens,
		trace: freezeDiagnosticTraceContext(createChildDiagnosticTraceContext(input.runTrace))
	});
	attempt.onExecutionPhase?.({
		phase: "context_assembled",
		provider: attempt.provider,
		model: attempt.modelId
	});
	if (log$5.isEnabled("debug")) log$5.debug(`[context-diag] pre-prompt: sessionKey=${attempt.sessionKey ?? attempt.sessionId} messages=${input.sessionMessages.length} roleCounts=${sessionSummary.roleCounts} historyTextChars=${sessionSummary.totalTextChars} maxMessageTextChars=${sessionSummary.maxMessageTextChars} historyImageBlocks=${sessionSummary.totalImageBlocks} systemPromptChars=${input.systemPromptText?.length ?? 0} promptChars=${input.effectivePrompt.length} promptImages=${input.imageCount} provider=${attempt.provider}/${attempt.modelId} sessionFile=${attempt.sessionFile}`);
	if (attempt.operation !== "settled-tool-finalization" && !skipPromptSubmission && !input.isRawModelRun && input.hookRunner?.hasHooks("llm_input")) input.hookRunner.runLlmInput({
		runId: attempt.runId,
		sessionId: attempt.sessionId,
		provider: attempt.provider,
		model: attempt.modelId,
		systemPrompt: input.systemPromptForHook,
		prompt: input.llmBoundaryPromptForPrecheck,
		/** Gives hooks an isolated message snapshot they cannot mutate in-session. */
		historyMessages: input.hookMessagesForCurrentPrompt.map((message) => structuredClone(message)),
		imagesCount: input.imageCount,
		tools: input.tools
	}, {
		runId: attempt.runId,
		trace: freezeDiagnosticTraceContext(input.diagnosticTrace),
		agentId: input.hookAgentId,
		sessionKey: attempt.sessionKey,
		sessionId: attempt.sessionId,
		workspaceDir: attempt.workspaceDir,
		trigger: attempt.trigger,
		...buildAgentHookContextChannelFields(attempt),
		...buildAgentHookContextIdentityFields({
			trigger: attempt.trigger,
			senderId: attempt.senderId,
			chatId: attempt.chatId,
			channelContext: attempt.channelContext
		})
	}).catch((err) => {
		log$5.warn(`llm_input hook failed: ${String(err)}`);
	});
	return { skipPromptSubmission };
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-prompt-build.ts
/**
* Builds the prompt after session preparation and before provider submission.
* It may assume session, hook, cache, and context-engine inputs are ready.
*/
async function prepareEmbeddedAttemptPromptAssembly(input) {
	const { attempt } = input;
	const isSettledTurnFinalization = attempt.operation === "settled-tool-finalization";
	const preserveExactPrompt = input.isRawModelRun || isSettledTurnFinalization;
	let systemPromptText = input.systemPromptText;
	const setSystemPrompt = (next) => {
		systemPromptText = next;
		input.setActiveSessionSystemPrompt(next);
	};
	let effectivePrompt = attempt.prompt;
	const hookCtx = {
		runId: attempt.runId,
		trace: freezeDiagnosticTraceContext(input.diagnosticTrace),
		agentId: input.hookAgentId,
		sessionKey: attempt.sessionKey,
		sessionId: attempt.sessionId,
		workspaceDir: attempt.workspaceDir,
		activeProjectKeys: [...attempt.preparedModelRuntime?.activeProjectKeys ?? []],
		modelProviderId: attempt.model.provider,
		modelId: attempt.model.id,
		trigger: attempt.trigger,
		...buildAgentHookContextChannelFields(attempt),
		...buildAgentHookContextIdentityFields({
			trigger: attempt.trigger,
			senderId: attempt.senderId,
			chatId: attempt.chatId,
			channelContext: attempt.channelContext
		})
	};
	const promptBuildMessages = pruneProcessedHistoryImages(input.activeSession.messages) ?? input.activeSession.messages;
	const promptEvent = {
		prompt: attempt.prompt,
		messages: promptBuildMessages
	};
	const hookResult = preserveExactPrompt ? void 0 : await resolvePromptBuildHookResult({
		config: attempt.config ?? getRuntimeConfig(),
		prompt: attempt.prompt,
		messages: promptBuildMessages,
		hookCtx,
		hookRunner: input.hookRunner,
		bootstrapContextRunKind: attempt.bootstrapContextRunKind
	});
	const promptCacheToolNames = input.applyPromptBuildToolsAllow(hookResult?.toolsAllow);
	const hookRunner = input.hookRunner;
	const assertHostActive = resolveAdmittedRunActiveAssertion(attempt.admittedRunContext, attempt.abortSignal);
	const authorizedHookResult = preserveExactPrompt || !hookRunner || !attempt.toolAuthorityFingerprint || !assertHostActive ? void 0 : await hookRunner.runAuthorizedPromptBuild(promptEvent, hookCtx, {
		toolAuthorityFingerprint: attempt.toolAuthorityFingerprint,
		activeToolNames: promptCacheToolNames,
		assertHostActive
	});
	const promptCacheToolNameSet = new Set(promptCacheToolNames.map(normalizeToolPolicyName));
	const promptBeforeResolvedToolFinalization = effectivePrompt;
	effectivePrompt = applyResolvedToolPromptFinalizer({
		prompt: effectivePrompt,
		activeToolNames: promptCacheToolNames,
		finalize: attempt.finalizePromptForResolvedTools
	});
	const effectiveTranscriptPrompt = attempt.finalizePromptForResolvedTools && attempt.transcriptPrompt === void 0 ? promptBeforeResolvedToolFinalization : attempt.transcriptPrompt;
	const promptCacheTools = input.cache.tools.filter((tool) => promptCacheToolNameSet.has(normalizeToolPolicyName(tool.name)));
	const promptBeforePromptBuildHooks = effectivePrompt;
	const joinHookContext = (...values) => values.filter((value) => Boolean(value?.trim())).join("\n\n") || void 0;
	const promptBuildPrependContext = joinHookContext(hookResult?.prependContext, authorizedHookResult?.prependContext);
	const promptBuildAppendContext = joinHookContext(hookResult?.appendContext, authorizedHookResult?.appendContext);
	const hasPromptBuildContext = Boolean(promptBuildPrependContext?.trim()) || Boolean(promptBuildAppendContext?.trim());
	if (promptBuildPrependContext) {
		effectivePrompt = `${promptBuildPrependContext}\n\n${effectivePrompt}`;
		log$5.debug(`hooks: prepended context to prompt (${promptBuildPrependContext.length} chars)`);
	}
	if (promptBuildAppendContext) {
		effectivePrompt = `${effectivePrompt}\n\n${promptBuildAppendContext}`;
		log$5.debug(`hooks: appended context to prompt (${promptBuildAppendContext.length} chars)`);
	}
	const legacySystemPrompt = normalizeOptionalString(hookResult?.systemPrompt) ?? "";
	if (legacySystemPrompt) {
		setSystemPrompt(legacySystemPrompt);
		log$5.debug(`hooks: applied systemPrompt (${legacySystemPrompt.length} chars)`);
	}
	const composedSystemPrompt = composeSystemPromptWithHookContext({
		baseSystemPrompt: systemPromptText,
		prependSystemContext: hookResult?.prependSystemContext,
		appendSystemContext: hookResult?.appendSystemContext
	});
	if (composedSystemPrompt) {
		setSystemPrompt(composedSystemPrompt);
		log$5.debug(`hooks: applied prependSystemContext/appendSystemContext (${hookResult?.prependSystemContext?.trim().length ?? 0}+${hookResult?.appendSystemContext?.trim().length ?? 0} chars)`);
	}
	const mediaTaskSystemPromptAddition = isSettledTurnFinalization ? void 0 : resolveAttemptMediaTaskSystemPromptAddition({
		sessionKey: attempt.sessionKey,
		agentId: input.sessionAgentId,
		trigger: attempt.trigger
	});
	if (mediaTaskSystemPromptAddition) setSystemPrompt(prependSystemPromptAddition({
		systemPrompt: ensureSystemPromptCacheBoundary(systemPromptText),
		systemPromptAddition: mediaTaskSystemPromptAddition
	}));
	const modelAwareSystemPrompt = isSettledTurnFinalization ? systemPromptText : appendModelIdentitySystemPrompt({
		systemPrompt: buildModelIdentityPromptLine(input.runtimeModel) && systemPromptText.trim().length > 0 ? ensureSystemPromptCacheBoundary(systemPromptText) : systemPromptText,
		model: input.runtimeModel
	});
	if (modelAwareSystemPrompt !== systemPromptText) setSystemPrompt(modelAwareSystemPrompt);
	let promptCacheChangesForTurn = null;
	if (input.cache.observabilityEnabled) {
		const cacheObservation = beginPromptCacheObservation({
			sessionId: attempt.sessionId,
			promptCacheKey: attempt.promptCacheKey,
			sessionKey: attempt.sessionKey,
			provider: attempt.provider,
			modelId: attempt.modelId,
			modelApi: attempt.model.api,
			cacheRetention: input.cache.retention,
			streamStrategy: input.cache.streamStrategy,
			transport: input.cache.transport,
			systemPrompt: systemPromptText,
			tools: promptCacheTools
		});
		promptCacheChangesForTurn = cacheObservation.changes;
		input.cache.trace?.recordStage("cache:state", { options: {
			snapshot: cacheObservation.snapshot,
			previousCacheRead: cacheObservation.previousCacheRead ?? void 0,
			changes: cacheObservation.changes?.map((change) => ({
				code: change.code,
				detail: change.detail
			}))
		} });
	}
	const routingSummary = describeProviderRequestRoutingSummary({
		provider: attempt.provider,
		api: attempt.model.api,
		baseUrl: attempt.model.baseUrl,
		capability: "llm",
		transport: "stream"
	});
	log$5.debug(`embedded run prompt start: runId=${attempt.runId} sessionId=${attempt.sessionId} ${routingSummary}`);
	let transcriptPromptForRuntimeSplit = effectiveTranscriptPrompt;
	let promptForRuntimeContextSplit = promptBeforePromptBuildHooks;
	const leafEntry = input.orphanRepair?.messageEntry;
	if (leafEntry && input.orphanRepair) {
		const messageMergeStrategy = input.orphanRepair.strategy;
		const orphanPromptMerge = messageMergeStrategy.mergeOrphanedTrailingUserPrompt({
			prompt: effectivePrompt,
			trigger: attempt.trigger,
			leafMessage: leafEntry.message
		});
		const runtimePromptMerge = messageMergeStrategy.mergeOrphanedTrailingUserPrompt({
			prompt: promptForRuntimeContextSplit,
			trigger: attempt.trigger,
			leafMessage: leafEntry.message
		});
		const transcriptPromptMerge = effectiveTranscriptPrompt === void 0 ? void 0 : messageMergeStrategy.mergeOrphanedTrailingUserPrompt({
			prompt: effectiveTranscriptPrompt,
			trigger: attempt.trigger,
			leafMessage: leafEntry.message
		});
		effectivePrompt = orphanPromptMerge.prompt;
		promptForRuntimeContextSplit = runtimePromptMerge.prompt;
		transcriptPromptForRuntimeSplit = transcriptPromptMerge?.prompt ?? transcriptPromptForRuntimeSplit;
		const message = `${input.orphanRepair.removeLeaf ? orphanPromptMerge.merged ? "Merged and removed" : "Removed already-queued" : "Preserved"} orphaned user message` + (input.orphanRepair.removeLeaf ? " to prevent consecutive user turns. " : " without removing the active session leaf. ") + `runId=${attempt.runId} sessionId=${attempt.sessionId} trigger=${attempt.trigger}`;
		if (shouldWarnOnOrphanedUserRepair(attempt.trigger)) log$5.warn(message);
		else log$5.debug(message);
	}
	let leasedSteering;
	if (attempt.sessionKey && !preserveExactPrompt) {
		const leaseId = `${attempt.runId}:agent-steering`;
		const leased = leasePendingAgentSteeringItems({
			requesterSessionKey: attempt.sessionKey,
			leaseId
		});
		if (leased) {
			leasedSteering = {
				leaseId,
				runIds: leased.runIds
			};
			input.setLeasedSteering(leasedSteering);
			effectivePrompt = prependAgentSteeringPrompt({
				steeringPrompt: leased.prompt,
				prompt: effectivePrompt
			});
			promptForRuntimeContextSplit = prependAgentSteeringPrompt({
				steeringPrompt: leased.prompt,
				prompt: promptForRuntimeContextSplit
			});
			if (transcriptPromptForRuntimeSplit !== void 0) transcriptPromptForRuntimeSplit = prependAgentSteeringPrompt({
				steeringPrompt: leased.prompt,
				prompt: transcriptPromptForRuntimeSplit
			});
			log$5.debug(`agent steering: injected ${leased.runIds.length} queued item(s) into parent turn runId=${attempt.runId} sessionKey=${attempt.sessionKey}`);
		}
	}
	const promptForModelBeforeRuntimeContextSplit = effectivePrompt;
	const promptForRuntimeContextBeforeAnnotation = promptForRuntimeContextSplit;
	if (!preserveExactPrompt) promptForRuntimeContextSplit = annotateInterSessionPromptText(promptForRuntimeContextSplit, attempt.inputProvenance);
	const currentUserAdmission = !preserveExactPrompt && !attempt.skipPreparedUserTurnMessage ? attempt.userTurnTranscriptRecorder?.getAdmissionReceipt() : void 0;
	const transcriptLeafId = currentUserAdmission ? currentUserAdmission.effectiveParentId : input.sessionManager.getLeafId();
	const heartbeatSummary = !isSettledTurnFinalization && attempt.config && input.sessionAgentId ? resolveHeartbeatSummaryForAgent(attempt.config, input.sessionAgentId) : void 0;
	return {
		hookCtx,
		effectivePrompt,
		promptBeforePromptBuildHooks,
		promptBuildPrependContext,
		promptBuildAppendContext,
		hasPromptBuildContext,
		effectiveTranscriptPrompt,
		transcriptPromptForRuntimeSplit,
		promptForRuntimeContextSplit,
		promptForModelBeforeRuntimeContextSplit,
		promptForRuntimeContextBeforeAnnotation,
		transcriptLeafId,
		heartbeatSummary,
		promptCacheChangesForTurn,
		leasedSteering
	};
}
function prepareEmbeddedAttemptPromptContext(input) {
	const { attempt } = input;
	const preparedUserTurnTimestamp = input.preparedUserTurnMessage?.timestamp;
	let sessionMessages = filterHeartbeatTranscriptArtifacts(input.messages, input.prompt.heartbeatSummary?.ackMaxChars, input.prompt.heartbeatSummary?.prompt);
	if (sessionMessages.length < input.messages.length) input.replaceSessionMessages(sessionMessages);
	if (!input.isRawModelRun) reconcileToolResultPromptProjectionState(sessionMessages, input.toolResultPromptProjectionState);
	const prePromptMessageCount = sessionMessages.length;
	const contextTokenBudget = attempt.contextTokenBudget ?? 2e5;
	const promptToolResultMaxChars = resolveLiveToolResultMaxChars({ contextWindowTokens: contextTokenBudget });
	const promptToolResultAggregateMaxChars = resolveLiveToolResultAggregateMaxChars({
		contextWindowTokens: contextTokenBudget,
		perResultMaxChars: promptToolResultMaxChars
	});
	const promptToolResultTruncation = truncateOversizedToolResultsInMessages(sessionMessages, contextTokenBudget, promptToolResultMaxChars, promptToolResultAggregateMaxChars, cloneToolResultPromptProjectionState(input.toolResultPromptProjectionState));
	const promptHistoryChanged = promptToolResultTruncation.messages !== sessionMessages;
	const { aggregatePressureEngaged } = promptToolResultTruncation;
	if (promptHistoryChanged) sessionMessages = promptToolResultTruncation.messages;
	if (promptHistoryChanged || aggregatePressureEngaged) {
		const sessionLogKey = attempt.sessionKey ?? attempt.sessionId ?? "unknown";
		const truncationLog = `[tool-result-truncation] Truncated ${promptToolResultTruncation.truncatedCount} tool result(s) for prompt history (maxChars=${promptToolResultMaxChars} aggregateBudgetChars=${promptToolResultAggregateMaxChars} aggregate=${promptToolResultTruncation.aggregateTruncatedCount}) sessionKey=${sessionLogKey}`;
		if (aggregatePressureEngaged) {
			if (!toolResultWarningDedupe.promptPressure.check(sessionLogKey)) log$5.warn(`${truncationLog}; aggregate tool-result pressure detected; final provider-bound projection will determine whether recovery is needed`);
		} else log$5.info(truncationLog);
	}
	const hasNonEmptyTranscriptPrompt = Boolean(input.prompt.effectiveTranscriptPrompt?.trim());
	const shouldUseExplicitModelPrompt = input.prompt.hasPromptBuildContext || hasNonEmptyTranscriptPrompt;
	const promptSubmission = resolveRuntimeContextPromptParts({
		effectivePrompt: input.prompt.promptForRuntimeContextSplit,
		transcriptPrompt: input.prompt.transcriptPromptForRuntimeSplit,
		modelPrompt: shouldUseExplicitModelPrompt ? input.prompt.promptForModelBeforeRuntimeContextSplit : void 0,
		modelPromptBuildContext: shouldUseExplicitModelPrompt && input.prompt.effectiveTranscriptPrompt !== void 0 ? {
			promptBeforeHooks: input.prompt.promptBeforePromptBuildHooks,
			transcriptPromptBeforeTransforms: input.prompt.effectiveTranscriptPrompt,
			promptBeforeAnnotation: input.prompt.promptForRuntimeContextBeforeAnnotation,
			prependContext: input.prompt.promptBuildPrependContext ?? "",
			appendContext: input.prompt.promptBuildAppendContext ?? ""
		} : void 0,
		emptyTranscriptMode: attempt.suppressNextUserMessagePersistence ? "model-prompt" : "runtime-event"
	});
	const isRuntimeOnlyTurn = promptSubmission.runtimeOnly === true;
	const currentInboundContextText = isRuntimeOnlyTurn ? void 0 : attempt.currentInboundContext?.text?.trim() || void 0;
	const promptForSession = isRuntimeOnlyTurn ? buildCurrentInboundPrompt({
		context: attempt.currentInboundContext,
		prompt: promptSubmission.prompt
	}) : promptSubmission.prompt;
	const promptForModel = isRuntimeOnlyTurn ? buildCurrentInboundPrompt({
		context: attempt.currentInboundContext,
		prompt: promptSubmission.modelPrompt ?? promptSubmission.prompt
	}) : promptSubmission.modelPrompt ?? promptSubmission.prompt;
	const currentUserTimestampOverride = !input.isRawModelRun && typeof preparedUserTurnTimestamp === "number" ? {
		timestamp: preparedUserTurnTimestamp,
		text: promptForSession,
		...promptForModel !== promptForSession ? { alternateText: promptForModel } : {}
	} : void 0;
	const runtimeSystemContext = promptSubmission.runtimeSystemContext?.trim();
	let systemPromptForHook = input.systemPromptText;
	if (promptSubmission.runtimeOnly && runtimeSystemContext) {
		const runtimeSystemPrompt = composeSystemPromptWithHookContext({
			baseSystemPrompt: input.systemPromptText,
			appendSystemContext: runtimeSystemContext
		});
		if (runtimeSystemPrompt) {
			systemPromptForHook = runtimeSystemPrompt;
			input.setActiveSessionSystemPrompt(runtimeSystemPrompt);
		}
	}
	const runtimeContextForHook = isRuntimeOnlyTurn ? void 0 : [
		currentInboundContextText,
		promptSubmission.runtimeContext?.trim(),
		input.heartbeatOutcomeContext?.trim()
	].filter((value) => Boolean(value)).join("\n\n") || void 0;
	const runtimeContextMessageForCurrentTurn = buildRuntimeContextCustomMessage(runtimeContextForHook);
	const hookMessagesForCurrentPrompt = normalizeMessagesForCurrentPromptBoundary({
		messages: runtimeContextMessageForCurrentTurn ? [...sessionMessages, runtimeContextMessageForCurrentTurn] : sessionMessages,
		prompt: promptForModel,
		...input.boundaryTimezone ? { timezone: input.boundaryTimezone } : {},
		...input.includeBoundaryTimestamp ? {} : { includeTimestamp: false },
		...typeof preparedUserTurnTimestamp === "number" ? { currentUserTimestamp: preparedUserTurnTimestamp } : {}
	});
	if (input.systemPromptReport) input.systemPromptReport.currentTurn = {
		...attempt.currentInboundEventKind ? { kind: attempt.currentInboundEventKind } : {},
		promptChars: promptForModel.length,
		runtimeContextChars: promptSubmission.runtimeOnly ? runtimeSystemContext?.length ?? 0 : runtimeContextForHook?.length ?? 0,
		modelOnlyPromptChars: Math.max(0, promptForModel.length - promptForSession.length)
	};
	const llmBoundaryPromptForPrecheck = normalizeCurrentPromptTextForLlmBoundary({
		prompt: promptForModel,
		...input.boundaryTimezone ? { timezone: input.boundaryTimezone } : {},
		...input.includeBoundaryTimestamp ? {} : { includeTimestamp: false },
		...typeof preparedUserTurnTimestamp === "number" ? { currentUserTimestamp: preparedUserTurnTimestamp } : {},
		...!input.isRawModelRun && input.preparedUserTurnMessage ? { currentUserTranscriptMessage: input.preparedUserTurnMessage } : {}
	});
	return {
		aggregatePressureEngaged,
		contextTokenBudget,
		...currentUserTimestampOverride ? { currentUserTimestampOverride } : {},
		effectivePrompt: input.prompt.effectivePrompt,
		hookMessagesForCurrentPrompt,
		llmBoundaryPromptForPrecheck,
		prePromptMessageCount,
		promptForModel,
		promptForSession,
		promptSubmission,
		promptToolResultAggregateMaxChars,
		promptToolResultMaxChars,
		...runtimeContextMessageForCurrentTurn ? { runtimeContextMessageForCurrentTurn } : {},
		systemPromptForHook
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-prompt-preflight.ts
/**
* Reports prompt pressure and owns explicit mid-turn recovery routing.
*/
function buildPreflightRecoveryBudgetSnapshot(snapshot) {
	return {
		estimatedPromptTokens: snapshot.estimatedPromptTokens,
		promptBudgetBeforeReserve: snapshot.promptBudgetBeforeReserve,
		overflowTokens: snapshot.overflowTokens
	};
}
function handleEmbeddedAttemptMidTurnPrecheck(input) {
	const { attempt, request } = input;
	const logMidTurnPrecheck = (route, extra) => {
		log$5.warn(`[context-overflow-midturn-precheck] sessionKey=${attempt.sessionKey ?? attempt.sessionId} provider=${attempt.provider}/${attempt.modelId} route=${route} estimatedPromptTokens=${request.estimatedPromptTokens} promptBudgetBeforeReserve=${request.promptBudgetBeforeReserve} overflowTokens=${request.overflowTokens} toolResultReducibleChars=${request.toolResultReducibleChars} effectiveReserveTokens=${request.effectiveReserveTokens} prePromptMessageCount=${input.prePromptMessageCount} ` + (extra ? `${extra} ` : "") + `sessionFile=${attempt.sessionFile}`);
	};
	if (request.route === "truncate_tool_results_only") {
		const contextTokenBudget = attempt.contextTokenBudget ?? 2e5;
		const toolResultMaxChars = resolveLiveToolResultMaxChars({ contextWindowTokens: contextTokenBudget });
		const truncationResult = truncateOversizedToolResultsInSessionManager({
			sessionManager: input.sessionManager,
			contextWindowTokens: contextTokenBudget,
			maxCharsOverride: toolResultMaxChars,
			sessionFile: attempt.sessionFile,
			sessionId: attempt.sessionId,
			sessionKey: attempt.sessionKey,
			agentId: input.sessionAgentId
		});
		if (truncationResult.truncated) {
			const preflightRecovery = {
				route: "truncate_tool_results_only",
				source: "mid-turn",
				...buildPreflightRecoveryBudgetSnapshot(request),
				handled: true,
				truncatedCount: truncationResult.truncatedCount
			};
			input.replaceSessionMessages(sanitizeCompactionReplayMessages(input.sessionManager.buildSessionContext().messages));
			logMidTurnPrecheck(request.route, `handled=true truncatedCount=${truncationResult.truncatedCount}`);
			return { preflightRecovery };
		}
		if (truncationResult.reason === "no oversized or aggregate tool results") {
			const preflightRecovery = {
				route: "truncate_tool_results_only",
				source: "mid-turn",
				...buildPreflightRecoveryBudgetSnapshot(request),
				handled: true,
				truncatedCount: 0
			};
			logMidTurnPrecheck(request.route, `handled=true truncatedCount=0 truncateSkippedReason=${truncationResult.reason}`);
			return { preflightRecovery };
		}
		const preflightRecovery = {
			route: "compact_only",
			source: "mid-turn",
			...buildPreflightRecoveryBudgetSnapshot(request)
		};
		logMidTurnPrecheck("compact_only", `truncateFallbackReason=${truncationResult.reason ?? "unknown"}`);
		return {
			preflightRecovery,
			promptError: new Error(PREEMPTIVE_OVERFLOW_ERROR_TEXT)
		};
	}
	const preflightRecovery = {
		route: request.route,
		source: "mid-turn",
		...buildPreflightRecoveryBudgetSnapshot(request)
	};
	logMidTurnPrecheck(request.route);
	return {
		preflightRecovery,
		promptError: new Error(PREEMPTIVE_OVERFLOW_ERROR_TEXT)
	};
}
async function prepareEmbeddedAttemptPromptPreflight(input) {
	const { attempt } = input;
	let contextBudgetStatus = input.state.contextBudgetStatus;
	const { skipPromptSubmission } = input.state;
	const boundaryOptions = input.timezone || !input.includeBoundaryTimestamp ? {
		...input.timezone ? { timezone: input.timezone } : {},
		...input.includeBoundaryTimestamp ? {} : { includeTimestamp: false }
	} : void 0;
	const unwindowedLlmBoundaryMessagesForPrecheck = input.contextEnginePromptAuthority === "preassembly_may_overflow" && input.unwindowedContextEngineMessagesForPrecheck ? normalizeMessagesForLlmBoundary(input.unwindowedContextEngineMessagesForPrecheck, boundaryOptions) : void 0;
	let preemptiveCompaction = null;
	if (!skipPromptSubmission) try {
		preemptiveCompaction = shouldPreemptivelyCompactBeforePrompt({
			messages: input.hookMessagesForCurrentPrompt,
			unwindowedMessages: unwindowedLlmBoundaryMessagesForPrecheck,
			systemPrompt: input.systemPrompt,
			prompt: input.promptForPrecheck,
			contextTokenBudget: input.contextTokenBudget,
			reserveTokens: input.reserveTokens,
			toolResultMaxChars: input.toolResultMaxChars,
			replay: {
				model: attempt.model,
				sessionId: attempt.sessionId,
				authProfileId: resolveAttemptStreamAuthProfileId(attempt),
				enabled: input.compactionReplayEnabled
			}
		});
	} catch (error) {
		if (!(error instanceof CompactionReplayRefreshRequiredError)) throw error;
		return {
			...input.state,
			promptError: error,
			promptErrorSource: "precheck",
			skipPromptSubmission: true
		};
	}
	const shouldSkipPrecheck = skipPromptSubmission || input.contextEngineAssemblySucceeded && input.activeContextEngine?.info.ownsCompaction && input.contextEnginePromptAuthority !== "preassembly_may_overflow" && !preemptiveCompaction?.compactionReplay;
	if (shouldSkipPrecheck && !skipPromptSubmission) log$5.info(`[context-overflow-precheck] skipped: context engine "${input.activeContextEngine.info.id}" owns compaction`);
	if (shouldSkipPrecheck) preemptiveCompaction = null;
	if (preemptiveCompaction) {
		contextBudgetStatus = buildPrePromptContextBudgetStatus({
			result: preemptiveCompaction,
			provider: attempt.provider,
			modelId: attempt.modelId,
			messageCount: input.sessionMessageCount,
			contextTokenBudget: input.contextTokenBudget,
			reserveTokens: input.reserveTokens,
			...attempt.sessionId ? { sessionId: attempt.sessionId } : {},
			...input.contextEnginePromptAuthority === "preassembly_may_overflow" && input.unwindowedContextEngineMessagesForPrecheck ? { unwindowedMessageCount: input.unwindowedContextEngineMessagesForPrecheck.length } : {}
		});
		log$5.debug(formatPrePromptPrecheckLog({
			result: preemptiveCompaction,
			provider: attempt.provider,
			modelId: attempt.modelId,
			messageCount: input.sessionMessageCount,
			contextTokenBudget: input.contextTokenBudget,
			reserveTokens: input.reserveTokens,
			...attempt.sessionKey ? { sessionKey: attempt.sessionKey } : {},
			...attempt.sessionId ? { sessionId: attempt.sessionId } : {},
			...input.contextEnginePromptAuthority === "preassembly_may_overflow" && input.unwindowedContextEngineMessagesForPrecheck ? { unwindowedMessageCount: input.unwindowedContextEngineMessagesForPrecheck.length } : {},
			...attempt.sessionFile ? { sessionFile: attempt.sessionFile } : {}
		}));
		const checkpointPressure = preemptiveCompaction.compactionReplay;
		if (checkpointPressure && checkpointPressure.route !== "fits") return {
			...input.state,
			contextBudgetStatus,
			preflightRecovery: {
				route: checkpointPressure.route,
				...buildPreflightRecoveryBudgetSnapshot(checkpointPressure)
			},
			promptError: new Error(PREEMPTIVE_OVERFLOW_ERROR_TEXT),
			promptErrorSource: "precheck",
			skipPromptSubmission: true
		};
		if (preemptiveCompaction.route !== "fits") log$5.info(`[context-pressure-diagnostic] admitted provider attempt for ${attempt.provider}/${attempt.modelId} route=${preemptiveCompaction.route} estimatedPromptTokens=${preemptiveCompaction.estimatedPromptTokens} promptBudgetBeforeReserve=${preemptiveCompaction.promptBudgetBeforeReserve}`);
	}
	return {
		...input.state,
		contextBudgetStatus
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/prompt-image-preparation.ts
function emptyPromptImages() {
	return {
		images: [],
		imageFactIndexes: [],
		detectedRefs: [],
		failedMediaCount: 0,
		loadedCount: 0,
		skippedCount: 0
	};
}
/** Prepares ordered prompt images using the admitted media and filesystem policy. */
async function prepareEmbeddedAttemptPromptExecution(input) {
	if (input.skipPromptSubmission) return emptyPromptImages();
	const { attempt } = input;
	const result = await detectAndLoadPromptImages({
		prompt: input.prompt,
		workspaceDir: input.effectiveWorkspace,
		model: attempt.model,
		existingImages: attempt.images,
		imageOrder: attempt.imageOrder,
		media: attempt.media,
		userTurnTranscriptRecorder: attempt.userTurnTranscriptRecorder,
		maxBytes: MAX_IMAGE_BYTES,
		maxDimensionPx: resolveImageSanitizationLimits(attempt.config).maxDimensionPx,
		workspaceOnly: input.effectiveFsWorkspaceOnly,
		localRoots: input.effectiveFsWorkspaceOnly ? void 0 : getAgentScopedMediaLocalRoots(attempt.config ?? {}, input.mediaOwnerAgentId),
		sandbox: input.sandbox?.enabled && input.sandbox.fsBridge ? {
			root: input.sandbox.workspaceDir,
			bridge: input.sandbox.fsBridge
		} : void 0
	});
	if (!input.pluginHarness) return result;
	if (result.failedMediaCount) throw new Error(`failed to hydrate ${result.failedMediaCount} structured image attachment(s) for plugin harness input`);
	return {
		...result,
		imageOrder: result.images.length ? result.images.map(() => "inline") : void 0,
		media: void 0
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-prompt-phase.ts
/** Runs prompt assembly, admission, submission, and prompt-local recovery. */
// firsttext-prompt-marks-v1: timing and identity only; observation never alters control flow.
const ocPromptMarkSeen = new Map();
function ocPromptMark(attempt, stage) {
	try {
		if (process.env.OPENCLAW_FIRSTTEXT_PROMPT_MARKS === "0") return;
		const runId = attempt?.runId;
		if (typeof runId !== "string" || runId.length === 0) return;
		let seen = ocPromptMarkSeen.get(runId);
		if (!seen) {
			if (ocPromptMarkSeen.size >= 256) ocPromptMarkSeen.delete(ocPromptMarkSeen.keys().next().value);
			seen = new Set();
			ocPromptMarkSeen.set(runId, seen);
		}
		if (seen.has(stage)) return;
		seen.add(stage);
		console.error("[firsttext-metrics] " + JSON.stringify({ runId, provider: attempt.provider, model: attempt.modelId, at: Date.now(), pid: process.pid, stage }));
	} catch {}
}
async function runEmbeddedAttemptPromptPhase(input) {
	const { activeSession, attempt, sessionManager } = input;
	let skipPromptSubmission = false;
	let leasedSteering;
	const patchState = (patch) => {
		input.lifecycle.writeState({
			...input.lifecycle.readState(),
			...patch
		});
	};
	const publishDispatchState = (state) => {
		const { skipPromptSubmission: nextSkipPromptSubmission, ...phaseState } = state;
		skipPromptSubmission = nextSkipPromptSubmission;
		input.lifecycle.writeState(phaseState);
	};
	const releaseLeasedSteering = (error) => {
		if (!leasedSteering) return;
		releasePendingAgentSteeringItems({
			runIds: leasedSteering.runIds,
			leaseId: leasedSteering.leaseId,
			error: error ? formatErrorMessage(error) : void 0
		});
		leasedSteering = void 0;
	};
	const handleMidTurnPrecheckRequest = (request) => {
		const outcome = handleEmbeddedAttemptMidTurnPrecheck({
			attempt,
			request,
			sessionAgentId: input.context.sessionAgentId,
			sessionManager,
			prePromptMessageCount: input.lifecycle.getPrePromptMessageCount(),
			replaceSessionMessages: (messages) => {
				activeSession.agent.state.messages = messages;
			}
		});
		patchState({
			preflightRecovery: outcome.preflightRecovery,
			...outcome.promptError ? {
				promptError: outcome.promptError,
				promptErrorSource: "precheck"
			} : {}
		});
	};
	ocPromptMark(attempt, "pp:enter");
	const promptStartedAt = Date.now();
	const promptAssembly = await prepareEmbeddedAttemptPromptAssembly({
		attempt,
		activeSession,
		sessionManager,
		...input.assembly,
		applyPromptBuildToolsAllow: (toolsAllow) => {
			const promptToolSurface = input.toolPolicy.apply(toolsAllow);
			input.lifecycle.setCodeModeReconciliationReadAuthorized(promptToolSurface.coreReadAuthorized);
			return promptToolSurface.activeToolNames;
		},
		setLeasedSteering: (lease) => {
			leasedSteering = lease;
		}
	});
	ocPromptMark(attempt, "pp:assembly");
	if (input.emptyExplicitToolAllowlistError) {
		patchState({
			promptError: input.emptyExplicitToolAllowlistError,
			promptErrorSource: "precheck"
		});
		skipPromptSubmission = true;
		log$5.warn(`[tools] ${input.emptyExplicitToolAllowlistError.message}`);
	}
	const { hookCtx, promptBuildPrependContext, promptBuildAppendContext, transcriptLeafId } = promptAssembly;
	leasedSteering = promptAssembly.leasedSteering ?? leasedSteering;
	input.lifecycle.setPromptCacheChangesForTurn(promptAssembly.promptCacheChangesForTurn);
	try {
		const heartbeatOutcomeContext = attempt.trigger === "user" && attempt.sessionPersistence !== "detached" && attempt.sessionKey ? buildHeartbeatOutcomeContext(claimHeartbeatOutcomeForRun({
			agentId: input.context.sessionAgentId,
			sessionKey: attempt.sessionKey,
			storePath: attempt.sessionTarget?.storePath,
			runId: attempt.runId
		})) : void 0;
		const promptContext = prepareEmbeddedAttemptPromptContext({
			attempt,
			...heartbeatOutcomeContext ? { heartbeatOutcomeContext } : {},
			messages: activeSession.messages,
			prompt: promptAssembly,
			replaceSessionMessages: (messages) => {
				activeSession.agent.state.messages = messages;
			},
			...input.context
		});
		ocPromptMark(attempt, "pp:context");
		const { hookMessagesForCurrentPrompt, promptForModel, systemPromptForHook } = promptContext;
		input.lifecycle.setPrePromptMessageCount(promptContext.prePromptMessageCount);
		input.lifecycle.setCurrentUserTimestampOverride(promptContext.currentUserTimestampOverride);
		const beforeAgentRunOutcome = attempt.operation === "settled-tool-finalization" ? void 0 : await runEmbeddedAttemptBeforeAgentRun({
			attempt,
			activeSession,
			hookContext: hookCtx,
			hookMessages: hookMessagesForCurrentPrompt,
			hookRunner: input.assembly.hookRunner,
			modelPrompt: promptForModel,
			sessionManager,
			systemPrompt: systemPromptForHook,
			withOwnedTranscriptWrite: input.withOwnedTranscriptWrite
		});
		ocPromptMark(attempt, "pp:before-agent-run");
		if (beforeAgentRunOutcome) {
			input.lifecycle.markBeforeAgentRunBlocked(beforeAgentRunOutcome);
			patchState({
				promptError: beforeAgentRunOutcome.promptError,
				promptErrorSource: "hook:before_agent_run"
			});
			skipPromptSubmission = true;
		}
		if (!skipPromptSubmission) {
			const { resolvedApiKey } = attempt;
			const googlePromptCacheStreamFn = await prepareGooglePromptCacheStreamFn({
				apiKey: await resolveEmbeddedAgentApiKey({
					provider: attempt.provider,
					resolvedApiKey,
					authStorage: attempt.authStorage
				}),
				extraParams: input.googlePromptCache.extraParams,
				model: attempt.model,
				modelId: attempt.modelId,
				provider: attempt.provider,
				sessionManager: {
					appendCustomEntry: async (customType, data) => {
						await input.withOwnedTranscriptWrite(() => {
							sessionManager.appendCustomEntry(customType, data);
						});
					},
					getEntries: () => sessionManager.getEntries()
				},
				signal: input.googlePromptCache.signal,
				streamFn: activeSession.agent.streamFn,
				systemPrompt: input.assembly.systemPromptText
			});
			if (googlePromptCacheStreamFn) activeSession.agent.streamFn = googlePromptCacheStreamFn;
		}
		ocPromptMark(attempt, "pp:api-key");
		const imageResult = await prepareEmbeddedAttemptPromptExecution({
			...input.execution,
			attempt,
			prompt: promptContext.promptSubmission.prompt,
			skipPromptSubmission
		});
		ocPromptMark(attempt, "pp:execution");
		const reserveTokens = input.getCompactionReserveTokens();
		let state = {
			...input.lifecycle.readState(),
			skipPromptSubmission: observeEmbeddedAttemptPrompt({
				...input.observation,
				effectiveTools: input.toolPolicy.current.effectiveTools,
				tools: input.toolPolicy.current.tools,
				uncompactedEffectiveTools: input.toolPolicy.current.uncompactedEffectiveTools,
				attempt,
				contextTokenBudget: promptContext.contextTokenBudget,
				effectivePrompt: promptContext.effectivePrompt,
				hookMessagesForCurrentPrompt: promptContext.hookMessagesForCurrentPrompt,
				imageCount: imageResult.images.length,
				llmBoundaryPromptForPrecheck: promptContext.llmBoundaryPromptForPrecheck,
				promptForModel: promptContext.promptForModel,
				promptSubmissionRuntimeOnly: promptContext.promptSubmission.runtimeOnly,
				reserveTokens,
				sessionMessages: activeSession.messages,
				skipPromptSubmission,
				systemPromptForHook: promptContext.systemPromptForHook,
				transcriptLeafId
			}).skipPromptSubmission
		};
		publishDispatchState(state);
		ocPromptMark(attempt, "pp:observe");
		const { activeContextEngine, ...preflight } = input.preflight;
		state = await prepareEmbeddedAttemptPromptPreflight({
			...preflight,
			attempt,
			...activeContextEngine ? { activeContextEngine } : {},
			contextTokenBudget: promptContext.contextTokenBudget,
			hookMessagesForCurrentPrompt: promptContext.hookMessagesForCurrentPrompt,
			promptForPrecheck: promptContext.llmBoundaryPromptForPrecheck,
			reserveTokens,
			sessionMessageCount: activeSession.messages.length,
			state,
			systemPrompt: promptContext.systemPromptForHook,
			toolResultMaxChars: promptContext.promptToolResultMaxChars
		});
		publishDispatchState(state);
		ocPromptMark(attempt, "pp:preflight");
		if (!state.skipPromptSubmission) await submitEmbeddedAttemptPrompt({
			...promptBuildAppendContext ? { appendContext: promptBuildAppendContext } : {},
			attempt,
			activeSession,
			contextTokenBudget: promptContext.contextTokenBudget,
			images: imageResult.images,
			...leasedSteering ? { leasedSteering } : {},
			modelPrompt: promptContext.promptForModel,
			onFinalPromptText: input.lifecycle.setFinalPromptText,
			onSteeringAcknowledged: () => {
				leasedSteering = void 0;
			},
			...promptBuildPrependContext ? { prependContext: promptBuildPrependContext } : {},
			...promptContext.runtimeContextMessageForCurrentTurn ? { runtimeContextMessage: promptContext.runtimeContextMessageForCurrentTurn } : {},
			runtimeOnly: promptContext.promptSubmission.runtimeOnly === true,
			systemPrompt: promptContext.systemPromptForHook,
			toolResultAggregateMaxChars: promptContext.promptToolResultAggregateMaxChars,
			toolResultMaxChars: promptContext.promptToolResultMaxChars,
			transcriptLeafId,
			transcriptPrompt: promptContext.promptForSession,
			...input.submission
		});
		else releaseLeasedSteering(state.promptError ?? "prompt submission skipped");
		publishDispatchState(state);
	} catch (error) {
		const promptErrorOutcome = await handleEmbeddedAttemptPromptError({
			activeSession,
			attempt,
			error,
			handleMidTurnPrecheckRequest,
			markYieldAborted: input.lifecycle.markYieldAborted,
			releaseLeasedSteering,
			withOwnedTranscriptWrite: input.withOwnedTranscriptWrite,
			...input.lifecycle.readYieldState()
		});
		if (promptErrorOutcome.promptFailure && !input.lifecycle.isRunBudgetTimeoutAbort(promptErrorOutcome.promptFailure.error)) patchState({
			promptError: promptErrorOutcome.promptFailure.error,
			promptErrorSource: promptErrorOutcome.promptFailure.source
		});
	} finally {
		input.lifecycle.stopAcceptingSteerMessages();
		log$5.debug(`embedded run prompt end: runId=${attempt.runId} sessionId=${attempt.sessionId} durationMs=${Date.now() - promptStartedAt}`);
	}
	const pendingMidTurnPrecheckRequest = input.lifecycle.takePendingMidTurnPrecheckRequest();
	if (pendingMidTurnPrecheckRequest) await input.withOwnedTranscriptWrite(() => {
		removeTrailingMidTurnPrecheckAssistantError({
			activeSession,
			sessionManager
		});
		const state = input.lifecycle.readState();
		if (!state.preflightRecovery && state.promptErrorSource !== "precheck") {
			patchState({
				promptError: null,
				promptErrorSource: null
			});
			handleMidTurnPrecheckRequest(pendingMidTurnPrecheckRequest);
		}
	});
	return { promptStartedAt };
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-terminal-evidence.ts
/** Records attempt replay safety and terminal side-effect evidence. */
/** Reads this attempt's response without reviving an older transcript turn. */
function resolveCurrentAttemptAssistant(attempt) {
	return attempt.currentAttemptAssistant ?? attempt.currentAttemptCompletedAssistant;
}
/** Uses current-attempt evidence when available and otherwise preserves fail-closed legacy state. */
function isCurrentAttemptReplaySafe(attempt) {
	const replayMetadata = attempt.currentAttemptReplayMetadata ?? attempt.replayMetadata;
	return replayMetadata.replaySafe && !replayMetadata.hadPotentialSideEffects;
}
/**
* Marks whether retrying the attempt can safely replay the prompt. Concrete
* tool-instance policy, async work, committed delivery, spawned sessions, and
* cron writes all contribute side-effect evidence.
*/
function buildAttemptReplayMetadata(params) {
	const hadUnsafeTools = params.toolMetas.some((entry) => entry.replaySafe !== true);
	const hadAsyncStartedTool = params.toolMetas.some((t) => t.asyncStarted === true);
	const hadPotentialSideEffects = hadUnsafeTools || hadAsyncStartedTool || hasMessagingToolDeliveryEvidence(params) || hasAcceptedSessionSpawn(params.acceptedSessionSpawns) || (params.successfulCronAdds ?? 0) > 0;
	return {
		hadPotentialSideEffects,
		replaySafe: !hadPotentialSideEffects
	};
}
function hasAttemptTerminalState(attempt) {
	return Boolean(attempt.lastToolError || hasNonToolTerminalState(attempt));
}
/** Projects terminal evidence whose ownership does not depend on a tool failure. */
function hasNonToolTerminalState(attempt) {
	return Boolean(attempt.clientToolCalls || attempt.yieldDetected || attempt.didSendDeterministicApprovalPrompt || attempt.heartbeatToolResponse || attempt.toolMediaUrls?.some((url) => url.trim().length > 0) || attempt.toolAudioAsVoice || attempt.toolTrustedLocalMedia || attempt.hasToolMediaBlockReply || attempt.didDeliverSourceReplyViaMessageTool || attempt.messagingToolSourceReplyPayloads?.length || hasMessagingToolDeliveryEvidence({
		didSendViaMessagingTool: attempt.didSendViaMessagingTool,
		messagingToolSentTexts: attempt.messagingToolSentTexts ?? [],
		messagingToolSentMediaUrls: attempt.messagingToolSentMediaUrls ?? [],
		messagingToolSentTargets: attempt.messagingToolSentTargets ?? []
	}) || hasAcceptedSessionSpawn(attempt.acceptedSessionSpawns) || hasAsyncActivity(attempt.toolMetas) || (attempt.successfulCronAdds ?? 0) > 0);
}
function hasAsyncActivity(toolMetas) {
	return (toolMetas ?? []).some((entry) => entry.asyncStarted === true);
}
/**
* A visible parent that delegates its entire response must remain alive for
* completion delivery. Existing output, explicit silence, and non-user turns
* keep their established terminal ownership instead.
*/
function shouldContinueInteractiveAcceptedSessionSpawns(params) {
	const { attempt, run } = params;
	if (!hasCompletionMessageSessionSpawn(attempt.acceptedSessionSpawns) || attempt.terminal.kind !== "ok" || attempt.yieldDetected === true || run.replyOperation?.turnKind !== "visible" || run.currentInboundEventKind === "room_event" || run.silentExpected === true || run.inputProvenance?.kind !== void 0 && run.inputProvenance.kind !== "external_user") return false;
	if (attempt.assistantTexts.some((text) => text.trim().length > 0 && !isSilentReplyText(text, "NO_REPLY"))) return false;
	return !hasAttemptTerminalState({
		...attempt,
		acceptedSessionSpawns: []
	});
}
//#endregion
//#region src/agents/execution-contract.ts
/**
* Resolves strict agentic execution contracts for provider/model pairs.
*/
/**
* Strip any leading `provider/` or `provider:` prefix from a model id so the
* bare-name regex matching below works against `openai/gpt-5.4` and
* `openai:gpt-5.4` the same way it does against `gpt-5.4`. Returns the bare
* model id lowercased for comparison.
*
* Without this, auto-activation silently failed on prefixed model ids — a
* user who configured `model: "openai/gpt-5.4"` in their agent config would
* get the pre-PR-H looser default behavior because the regex only matched
* bare names. The adversarial review in #64227 flagged this as a quality
* gap on completion-gate criterion 1.
*/
function stripProviderPrefix(modelId) {
	const normalizedModelId = modelId.trim();
	return (/^([^/:]+)[/:](.+)$/.exec(normalizedModelId)?.[2] ?? normalizedModelId).toLowerCase();
}
/**
* Regex that matches the full set of GPT-5 variants the strict-agentic
* contract should auto-activate for. Intentionally permissive: every
* model id in the gpt-5 family should opt in by default, not just the
* canonical `gpt-5.4`.
*
* Covers:
* - `gpt-5`, `gpt-5o`, `gpt-5o-mini` (no separator after `5`)
* - `gpt-5.4`, `gpt-5.4-alt`, `gpt-5.0` (dot separator)
* - `gpt-5-preview`, `gpt-5-turbo`, `gpt-5-2025-03` (dash separator)
*
* Does NOT cover `gpt-4.5`, `gpt-6`, or any non-gpt-5 family member.
*/
const STRICT_AGENTIC_MODEL_ID_PATTERN = /^gpt-5(?:[.o-]|$)/i;
/**
* Supported provider + model combinations where strict-agentic is the intended
* runtime contract. Kept as a narrow helper so both the execution-contract
* resolver uses for the GPT-5-family OpenAI strict-agentic default. The embedded
* `mock-openai` QA lane intentionally piggybacks on that contract so repo QA
* can exercise the same incomplete-turn recovery rules end to end.
*/
function isStrictAgenticSupportedProviderModel(params) {
	const provider = normalizeLowercaseStringOrEmpty(params.provider ?? "");
	if (provider !== "openai" && provider !== "mock-openai") return false;
	const bareModelId = stripProviderPrefix(typeof params.modelId === "string" ? params.modelId : "");
	return STRICT_AGENTIC_MODEL_ID_PATTERN.test(bareModelId);
}
/**
* Returns the effective execution contract for an embedded OpenClaw run.
*
* strict-agentic is a GPT-5-family OpenAI-only runtime contract,
* so an unsupported provider/model pair always collapses to `"default"`
* regardless of what the caller passed or what config says — the contract
* is inert off-provider. Within the supported lane, the behavior matrix is:
*
* - Supported provider/model + explicit `"strict-agentic"` in config
*   (defaults or per-agent override) ⇒ `"strict-agentic"`.
* - Supported provider/model + explicit `"default"` in config ⇒ `"default"`
*   (opt-out honored).
* - Supported provider/model + unspecified ⇒ `"strict-agentic"` so the
*   structured plan tool and non-visible turn recovery apply to out-of-the-box
*   GPT-5 runs without requiring every user to set the flag.
* - Unsupported provider/model (anything that is not openai
*   with a gpt-5-family model id) ⇒ `"default"`, even when the config
*   explicitly sets `"strict-agentic"`. The structured guards check this lane
*   again, so an explicit `"strict-agentic"` on an unsupported lane is a no-op
*   rather than a hard failure.
*
* Explicit opt-out still works. Assistant prose is never classified to decide
* whether a turn represents planning, progress, or completion.
*/
function resolveEffectiveExecutionContract(params) {
	const { sessionAgentId } = resolveSessionAgentIds({
		sessionKey: params.sessionKey,
		config: params.config,
		agentId: params.agentId ?? void 0
	});
	const explicit = resolveAgentExecutionContract(params.config, sessionAgentId);
	if (!isStrictAgenticSupportedProviderModel({
		provider: params.provider,
		modelId: params.modelId
	})) return "default";
	if (explicit === "default") return "default";
	return "strict-agentic";
}
function isStrictAgenticExecutionContractActive(params) {
	return resolveEffectiveExecutionContract(params) === "strict-agentic";
}
//#endregion
//#region src/agents/embedded-agent-runner/run/incomplete-turn-classification.ts
/** Classifies terminal assistant visibility and provider retry eligibility. */
function hasPositiveOutputTokenUsage(message) {
	if (!message || typeof message !== "object") return false;
	const usage = message.usage;
	if (!usage || typeof usage !== "object") return false;
	const output = asFiniteNumber(usage.output);
	return output !== void 0 && output > 0;
}
function isIncompleteTerminalAssistantTurn(params) {
	const stopReason = params.lastAssistant?.stopReason;
	return stopReason === "toolUse" || stopReason === "length" && !params.hasTerminalOutput && !params.hasAssistantVisibleText;
}
const GEMINI_INCOMPLETE_TURN_PROVIDER_IDS = /* @__PURE__ */ new Set([
	"google",
	"google-vertex",
	"google-antigravity",
	"google-gemini-cli"
]);
const GEMINI_INCOMPLETE_TURN_MODEL_ID_PATTERN = /^gemini(?:[.-]|$)/;
const OLLAMA_INCOMPLETE_TURN_PROVIDER_ID_PATTERN = /^ollama(?:-|$)/;
function isOllamaIncompleteTurnProvider(provider) {
	return OLLAMA_INCOMPLETE_TURN_PROVIDER_ID_PATTERN.test(normalizeLowercaseStringOrEmpty(provider ?? ""));
}
const RETRY_GUARD_MODEL_APIS = /* @__PURE__ */ new Set([
	"openai-completions",
	"anthropic-messages",
	"bedrock-converse-stream",
	"openai-responses",
	"openai-chatgpt-responses",
	"azure-openai-responses",
	"openclaw-openai-responses-transport",
	"openclaw-openai-chatgpt-responses-transport",
	"openclaw-azure-openai-responses-transport"
]);
function joinAssistantTexts(assistantTexts) {
	return (assistantTexts ?? []).join("\n\n").trim();
}
function hasOnlySilentAssistantReply(assistantTexts) {
	const nonEmptyTexts = (assistantTexts ?? []).filter((text) => text.trim().length > 0);
	return nonEmptyTexts.length > 0 && nonEmptyTexts.every((text) => isSilentReplyPayloadText(text, "NO_REPLY"));
}
function isReasoningOnlyAssistantTurn(message) {
	if (!message || typeof message !== "object") return false;
	return assessLastAssistantMessage(message) === "incomplete-text";
}
function isUnsignedThinkingOnlyAssistantTurn(message) {
	if (message == null || typeof message !== "object") return false;
	const content = message.content;
	if (!Array.isArray(content) || content.length === 0) return false;
	return assessLastAssistantMessage(message) === "incomplete-thinking";
}
function shouldApplyNonVisibleTurnRetryGuard(params) {
	if (params.executionContract === "strict-agentic" || isIncompleteTurnRecoverySupportedProviderModel({
		provider: params.provider,
		modelId: params.modelId
	})) return true;
	if (RETRY_GUARD_MODEL_APIS.has(normalizeLowercaseStringOrEmpty(params.modelApi ?? ""))) return true;
	return isOllamaIncompleteTurnProvider(params.provider);
}
function isIncompleteTurnRecoverySupportedProviderModel(params) {
	if (isStrictAgenticSupportedProviderModel({
		provider: params.provider,
		modelId: params.modelId
	})) return true;
	const provider = normalizeLowercaseStringOrEmpty(params.provider ?? "");
	if (!GEMINI_INCOMPLETE_TURN_PROVIDER_IDS.has(provider)) return false;
	const modelId = typeof params.modelId === "string" ? params.modelId : "";
	return GEMINI_INCOMPLETE_TURN_MODEL_ID_PATTERN.test(stripProviderPrefix(modelId));
}
function classifyAssistantTurn(params) {
	const assistant = resolveCurrentAttemptAssistant(params.attempt);
	const visibleText = joinAssistantTexts(params.attempt.assistantTexts);
	const reasoningOnly = isReasoningOnlyAssistantTurn(assistant);
	const nonVisibleEligibleForSilentReply = params.payloadCount === 0 && visibleText.length === 0 && assistant?.stopReason !== "error" && !isIncompleteTerminalAssistantTurn({
		hasAssistantVisibleText: false,
		lastAssistant: assistant
	});
	return {
		assistant,
		visibleText,
		reasoningOnly,
		emptyResponse: nonVisibleEligibleForSilentReply && !reasoningOnly,
		nonVisibleEligibleForSilentReply
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/incomplete-turn-recovery.ts
/** Owns side-effect-sensitive retry and silent-reply recovery policy. */
const REASONING_ONLY_RETRY_INSTRUCTION = "The previous assistant turn recorded reasoning but did not produce a user-visible answer. Continue from that partial turn and produce the visible answer now. Do not restate the reasoning or restart from scratch.";
const EMPTY_RESPONSE_RETRY_INSTRUCTION = "The previous attempt did not produce a user-visible answer. Continue from the current state and produce the visible answer now. Do not restart from scratch.";
const SETTLED_TOOL_TERMINAL_CONTINUATION_INSTRUCTION = "The previous assistant turn completed its tool calls but did not produce a user-visible answer. Continue from the current transcript and produce the final user-visible answer now. Do not repeat completed tool calls or restart from scratch.";
function shouldRetrySilentErrorAssistantTurn(params) {
	if (joinAssistantTexts(params.attempt.assistantTexts).length > 0) return false;
	if (hasAttemptTerminalState(params.attempt)) return false;
	if (!isCurrentAttemptReplaySafe(params.attempt)) return false;
	const assistant = params.assistant;
	if (!assistant || assistant.stopReason !== "error" || isTerminalAssistantError(assistant)) return false;
	const content = assistant.content;
	if (!Array.isArray(content)) return false;
	if (content.length === 0) return !hasPositiveOutputTokenUsage(assistant);
	return hasOnlyAssistantReasoningContent(assistant);
}
function shouldSkipNonVisibleTurnRetry(params) {
	return Boolean(params.aborted || params.timedOut || params.attempt.terminal.kind === "failed" || params.attempt.clientToolCalls || params.attempt.yieldDetected || params.attempt.didSendDeterministicApprovalPrompt || params.attempt.lastToolError || hasAcceptedSessionSpawn(params.attempt.acceptedSessionSpawns) || hasAsyncActivity(params.attempt.toolMetas) || params.tolerateSideEffects !== true && params.attempt.replayMetadata.hadPotentialSideEffects);
}
/** Allows configured silent handling for replay-safe empty, reasoning-only, or explicit silent turns. */
function shouldTreatEmptyAssistantReplyAsSilent(params) {
	const terminalReplyOptional = params.terminalReplyExpectation === "optional";
	const assistant = resolveCurrentAttemptAssistant(params.attempt);
	// v-no-reply-after-tool-v2: block streaming keeps NO_REPLY out of assistantTexts; the final message still says it
	const vAssistantSaysNoReply = Array.isArray(assistant?.content) && (() => {
		const text = assistant.content.filter((block) => block?.type === "text" && typeof block.text === "string").map((block) => block.text).join("").trim();
		return text.length > 0 && isSilentReplyPayloadText(text, "NO_REPLY");
	})() && (params.attempt.assistantTexts ?? []).every((text) => text.trim().length === 0 || isSilentReplyPayloadText(text, "NO_REPLY"));
	const explicitSilentReply = params.payloadCount === 0 && assistant?.stopReason !== "error" && (hasOnlySilentAssistantReply(params.attempt.assistantTexts) || vAssistantSaysNoReply);
	const tolerateSideEffects = terminalReplyOptional || explicitSilentReply;
	// v-no-reply-after-tool-v2: an authored NO_REPLY is silence even where empty replies are not allowed
	if (!params.allowEmptyAssistantReplyAsSilent && !explicitSilentReply || shouldSkipNonVisibleTurnRetry({
		...params,
		tolerateSideEffects
	})) return false;
	if (hasCommittedMessagingToolDeliveryEvidence(params.attempt)) return false;
	if (explicitSilentReply) return true;
	if (params.onlyExplicitSilentReply || !terminalReplyOptional) return false;
	return classifyAssistantTurn(params).nonVisibleEligibleForSilentReply;
}
/**
* Builds the retry instruction for reasoning-only turns that consumed provider
* output budget but produced no visible assistant text.
*/
function resolveReasoningOnlyRetryInstruction(params) {
	if (shouldSkipNonVisibleTurnRetry(params)) return null;
	if (!shouldApplyNonVisibleTurnRetryGuard({
		provider: params.provider,
		modelId: params.modelId,
		modelApi: params.modelApi,
		executionContract: params.executionContract
	})) return null;
	const assistant = resolveCurrentAttemptAssistant(params.attempt);
	if (joinAssistantTexts(params.attempt.assistantTexts).length > 0) return null;
	// deepseek-empty-budget-v1
	if (assistant?.stopReason === "error" || assistant?.stopReason === "length") return null;
	if (!isReasoningOnlyAssistantTurn(assistant) && !isUnsignedThinkingOnlyAssistantTurn(assistant)) return null;
	return REASONING_ONLY_RETRY_INSTRUCTION;
}
function readSettledToolCalls(message) {
	if (!Array.isArray(message?.content)) return [];
	return message.content.flatMap((item) => {
		const block = item;
		return block?.type === "toolCall" ? [{
			id: typeof block.id === "string" ? block.id : null,
			name: typeof block.name === "string" ? block.name : null
		}] : [];
	});
}
/** Proves settlement and intentional termination for the exact current-turn tool-call batch. */
function resolveSettledToolBatchEvidence(attempt) {
	const snapshot = attempt.messagesSnapshot ?? [];
	const latestUserIndex = snapshot.findLastIndex((message) => message.role === "user");
	let assistant = attempt.currentAttemptAssistant;
	let assistantIndex = assistant ? snapshot.indexOf(assistant) : -1;
	if (assistantIndex <= latestUserIndex || readSettledToolCalls(assistant).length === 0) {
		assistantIndex = snapshot.findLastIndex((message, index) => index > latestUserIndex && message.role === "assistant" && readSettledToolCalls(message).length > 0);
		const candidate = assistantIndex >= 0 ? snapshot[assistantIndex] : void 0;
		assistant = candidate?.role === "assistant" ? candidate : void 0;
	}
	const requestedToolCalls = readSettledToolCalls(assistant);
	const settledToolResults = new Map((assistantIndex >= 0 ? snapshot.slice(assistantIndex + 1) : []).flatMap((message) => {
		const { toolCallId, toolName, isError } = message;
		return message.role === "toolResult" && typeof toolCallId === "string" && typeof toolName === "string" ? [[toolCallId, {
			toolName,
			isError: isError === true
		}]] : [];
	}));
	const allToolCallsRecorded = requestedToolCalls.length > 0 && requestedToolCalls.every(({ id, name }) => id !== null && name !== null && settledToolResults.get(id)?.toolName === name);
	const allToolsProvenSettled = allToolCallsRecorded && attempt.itemLifecycle.startedCount > 0 && attempt.itemLifecycle.completedCount === attempt.itemLifecycle.startedCount && attempt.itemLifecycle.activeCount === 0;
	const parkedCodeModeRun = allToolCallsRecorded && requestedToolCalls.some(({ id }) => attempt.toolMetas.some((entry) => entry.toolCallId === id && entry.codeModeSuspended === true));
	const failedToolNames = new Set(requestedToolCalls.flatMap(({ id, name }) => id !== null && name !== null && settledToolResults.get(id)?.isError === true ? [name] : []));
	const hasUnsettledToolError = Boolean(attempt.lastToolError && (assistant?.stopReason !== "toolUse" || !allToolsProvenSettled || !failedToolNames.has(attempt.lastToolError.toolName)));
	const intentionalTermination = allToolsProvenSettled && assistant?.stopReason === "toolUse" && failedToolNames.size === 0 && !attempt.lastToolError && !hasAsyncActivity(attempt.toolMetas) && requestedToolCalls.every(({ id, name }) => {
		const metadata = attempt.toolMetas.findLast((entry) => entry.toolCallId === id && entry.toolName === name);
		return metadata?.terminate === true && metadata.isError !== true;
	});
	return {
		assistant,
		allToolCallsRecorded,
		allToolsProvenSettled,
		parkedCodeModeRun,
		failedToolNames,
		hasUnsettledToolError,
		intentionalTermination
	};
}
/** Builds one fresh continuation after settled tools ended without a visible final answer. */
function resolveSettledToolTerminalContinuationInstruction(params) {
	const { attempt } = params;
	const { assistant, allToolsProvenSettled, failedToolNames, hasUnsettledToolError, intentionalTermination } = resolveSettledToolBatchEvidence(attempt);
	const terminal = attempt.terminal;
	const idlePromptTimeout = terminal.kind === "timeout" && terminal.phase === "prompt" && terminal.source === "idle" && attempt.currentAttemptReplayMetadata?.hadPotentialSideEffects === true;
	const emptyStopAfterSettledTools = Boolean(params.allowEmptyStopContinuation && attempt.currentAttemptAssistant?.stopReason === "stop" && attempt.toolMetas.length > 0 && attempt.toolMetas.every((tool) => tool.isError !== true && tool.asyncStarted !== true) && attempt.itemLifecycle.startedCount > 0 && attempt.itemLifecycle.completedCount === attempt.itemLifecycle.startedCount && attempt.itemLifecycle.activeCount === 0 && !hasAcceptedSessionSpawn(attempt.acceptedSessionSpawns) && classifyAssistantTurn(params).emptyResponse);
	if (params.payloadCount !== 0 || !params.allowEmptyStopContinuation && hasOnlySilentAssistantReply(attempt.assistantTexts) || params.hasTerminalToolPresentation || params.aborted || (params.timedOut || terminal.kind === "timeout") && !idlePromptTimeout || terminal.kind === "failed" && !attempt.settledTurnFinalizationContext || (assistant?.stopReason === "toolUse" ? !allToolsProvenSettled : !emptyStopAfterSettledTools) || intentionalTermination || hasUnsettledToolError || hasAsyncActivity(attempt.toolMetas) || hasAcceptedSessionSpawn(attempt.acceptedSessionSpawns) || attempt.clientToolCalls || attempt.yieldDetected || attempt.didSendDeterministicApprovalPrompt) return null;
	if (attempt.hasToolMediaBlockReply || hasCompletedMessagingToolDeliveryEvidence(attempt)) return null;
	if (!shouldApplyNonVisibleTurnRetryGuard({
		provider: params.provider,
		modelId: params.modelId,
		modelApi: params.modelApi,
		executionContract: params.executionContract
	})) return null;
	return allToolsProvenSettled && failedToolNames.size > 0 ? `${SETTLED_TOOL_TERMINAL_CONTINUATION_INSTRUCTION} ${TOOL_FAILURE_INSTRUCTION}` : SETTLED_TOOL_TERMINAL_CONTINUATION_INSTRUCTION;
}
/**
* Builds the retry instruction for empty assistant turns when the provider/model
* is eligible for non-visible turn recovery.
*/
function resolveEmptyResponseRetryInstruction(params) {
	if (shouldSkipNonVisibleTurnRetry(params)) return null;
	const assistantState = classifyAssistantTurn(params);
	if (!assistantState.emptyResponse) return null;
	const assistant = assistantState.assistant ?? null;
	if (assistant?.stopReason === "stop" && isOllamaIncompleteTurnProvider(params.provider) && !hasPositiveOutputTokenUsage(assistant)) return null;
	if (shouldApplyNonVisibleTurnRetryGuard({
		provider: params.provider,
		modelId: params.modelId,
		modelApi: params.modelApi,
		executionContract: params.executionContract
	}) || isZeroUsageEmptyStopAssistantTurn(assistant)) return EMPTY_RESPONSE_RETRY_INSTRUCTION;
	return null;
}
//#endregion
//#region src/agents/embedded-agent-runner/run/incomplete-turn-resolution.ts
/** Resolves incomplete-turn payloads, continuation evidence, and run liveness. */
/**
* Builds the user-visible incomplete-turn warning when a terminal attempt did
* not produce a safe final assistant response and no committed delivery/progress
* already completed the task.
*/
function resolveIncompleteTurnPayloadText(params) {
	const assistantState = classifyAssistantTurn(params);
	const assistant = assistantState.assistant;
	const hasTerminalOutput = hasAttemptTerminalState(params.attempt);
	const incompleteTerminalAssistant = isIncompleteTerminalAssistantTurn({
		hasAssistantVisibleText: params.payloadCount > 0,
		hasTerminalOutput,
		lastAssistant: assistant
	});
	const thinkingOnlyTerminal = params.payloadCount !== 0 && !assistantState.visibleText.length && !hasTerminalOutput && Boolean(assistant && hasOnlyAssistantReasoningContent(assistant));
	if (params.payloadCount !== 0 && !incompleteTerminalAssistant && !thinkingOnlyTerminal || params.aborted && params.externalAbort || params.timedOut || params.attempt.clientToolCalls || params.attempt.yieldDetected || params.attempt.didSendDeterministicApprovalPrompt || params.attempt.lastToolError || params.hasIntentionalTerminalCompletion) return null;
	if (hasOnlySilentAssistantReply(params.attempt.assistantTexts) || params.attempt.hasToolMediaBlockReply || hasCommittedMessagingToolDeliveryEvidence(params.attempt)) return null;
	if (hasCompletionMessageSessionSpawn(params.attempt.acceptedSessionSpawns)) return null;
	if (hasAsyncActivity(params.attempt.toolMetas)) return null;
	const stopReason = assistant?.stopReason;
	if (!incompleteTerminalAssistant && !assistantState.reasoningOnly && !thinkingOnlyTerminal && !assistantState.emptyResponse && stopReason !== "error") return null;
	if (stopReason === "length" && assistantState.visibleText.length === 0) return "⚠️ 模型提前结束，未生成正文。已停止自动续写；请先检查输出预算并压缩上下文。历史和任务状态保留，恢复前请核对已执行操作，避免重复执行。";
	if (params.hadPotentialSideEffects || params.attempt.replayMetadata.hadPotentialSideEffects) return "⚠️ Agent couldn't generate a response. Note: some tool actions may have already been executed — please verify before retrying.";
	if (assistant && isProviderRefusalAssistantError(assistant)) return formatUserFacingAssistantErrorText(assistant);
	const authFailure = params.terminalAuthFailure;
	const reason = authFailure?.assistantProfileFailureReason;
	if (authFailure && (reason === "auth" || reason === "auth_permanent")) return renderAuthProfileFailoverCopy({
		reason,
		provider: authFailure.provider,
		allInCooldown: false,
		recoveryHint: buildProviderAuthRecoveryHint({
			provider: authFailure.provider,
			config: authFailure.runParams.config,
			workspaceDir: authFailure.runParams.workspaceDir,
			env: process.env
		})
	});
	return "⚠️ Agent couldn't generate a response. Please try again.";
}
/**
* Allows one retry when the provider returned no assistant turn at all and the
* attempt has no side effects, active lifecycle items, delivery, or terminal
* assistant/tool state.
*/
function shouldRetryMissingAssistantTurn(params) {
	if (params.payloadCount !== 0 || params.aborted || Boolean(params.promptError) || params.timedOut || params.attempt.clientToolCalls || resolveCurrentAttemptAssistant(params.attempt) || params.attempt.yieldDetected || params.attempt.didSendDeterministicApprovalPrompt || params.attempt.lastToolError) return false;
	if (hasOnlySilentAssistantReply(params.attempt.assistantTexts)) return false;
	if (joinAssistantTexts(params.attempt.assistantTexts).length > 0) return false;
	if (hasCommittedMessagingToolDeliveryEvidence(params.attempt)) return false;
	if (hasAcceptedSessionSpawn(params.attempt.acceptedSessionSpawns)) return false;
	if (hasAsyncActivity(params.attempt.toolMetas)) return false;
	if ((params.attempt.itemLifecycle?.startedCount ?? 0) > 0 || (params.attempt.itemLifecycle?.activeCount ?? 0) > 0) return false;
	return !params.attempt.replayMetadata.hadPotentialSideEffects;
}
/** Continuation evidence for a yielded turn — sources that will produce future output. */
function hasYieldContinuationEvidence(attempt) {
	return (attempt.clientToolCalls?.length ?? 0) > 0 || attempt.didSendDeterministicApprovalPrompt === true || hasCommittedMessagingToolDeliveryEvidence({
		messagingToolSentTexts: attempt.messagingToolSentTexts ?? [],
		messagingToolSentMediaUrls: attempt.messagingToolSentMediaUrls ?? [],
		messagingToolSentTargets: attempt.messagingToolSentTargets ?? []
	}) || hasAcceptedSessionSpawn(attempt.acceptedSessionSpawns) || attempt.runtimeContinuationStarted === true || hasAsyncActivity(attempt.toolMetas) || (attempt.successfulCronAdds ?? 0) > 0;
}
const YIELD_DIAGNOSTIC_TEXT = "⚠️ Turn yielded without a continuation source. Send a message to resume.";
const TRUNCATED_REPLY_NOTICE_TEXT = "⚠️ 回答达到输出限制，以上正文尚未完成，可以要求继续。";
function isToolResultRole(role) {
	return role === "toolresult" || role === "tool_result" || role === "tool";
}
function readMessageTextContent(message) {
	const content = message.content;
	if (typeof content === "string") return content.trim() || void 0;
	return collectTextContentBlocks(content).map((item) => item.trim()).filter((item) => item.length > 0).join("\n") || void 0;
}
function readToolResultAggregatedText(message) {
	const aggregated = message.details?.aggregated;
	if (typeof aggregated !== "string") return;
	return aggregated.trim() || void 0;
}
function hasTrailingSilentToolResult(messages) {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const message = messages[i];
		if (!message) continue;
		const role = normalizeLowercaseStringOrEmpty(message?.role);
		if (isToolResultRole(role)) {
			if (message.isError === true) return false;
			const text = readMessageTextContent(message) ?? readToolResultAggregatedText(message);
			return isSilentReplyText(text, SILENT_REPLY_TOKEN);
		}
		if (role === "assistant" && !readMessageTextContent(message)) continue;
		return false;
	}
	return false;
}
/** Emits the silent-reply token for cron turns whose last successful tool result is silent. */
function resolveSilentToolResultReplyPayload(params) {
	if (!params.isCronTrigger || params.payloadCount !== 0 || params.aborted || params.timedOut || (params.attempt.toolMetas?.length ?? 0) === 0 || params.attempt.clientToolCalls || params.attempt.yieldDetected || params.attempt.didSendDeterministicApprovalPrompt || params.attempt.lastToolError || (params.attempt.messagesSnapshot?.length ?? 0) === 0) return null;
	return hasTrailingSilentToolResult(params.attempt.messagesSnapshot) ? { text: SILENT_REPLY_TOKEN } : null;
}
/**
* Marks replay invalid whenever the recorded attempt might not be safe to
* replay or the current run ended in a compaction/incomplete-turn state that
* needs a fresh prompt boundary.
*/
function resolveReplayInvalidFlag(params) {
	const terminal = projectAgentRunAttemptTerminal(params.attempt.terminal);
	return !params.attempt.replayMetadata.replaySafe || terminal.promptErrorSource === "compaction" || terminal.timedOutDuringCompaction || Boolean(params.incompleteTurnText);
}
/** Classifies the persisted run state used by session recovery and resume logic. */
function resolveRunLivenessState(params) {
	if (params.incompleteTurnText) return "abandoned";
	const terminal = projectAgentRunAttemptTerminal(params.attempt.terminal);
	if (terminal.promptErrorSource === "compaction" || terminal.timedOutDuringCompaction) return "paused";
	if ((params.aborted || params.timedOut) && params.payloadCount === 0) return "blocked";
	if (resolveCurrentAttemptAssistant(params.attempt)?.stopReason === "error") return "blocked";
	return "working";
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-result.ts
/**
* Projects stream state into the stable embedded-attempt result contract.
*/
/** Keeps attempt-owned state available while retry attempts replace their result object. */
function createAttemptCarryover() {
	let latestMcpAppChannelView;
	let latestMcpConnectAction;
	let modelAttempt;
	return {
		apply(attempt) {
			modelAttempt = attempt.modelAttempt;
			latestMcpAppChannelView = attempt.latestMcpAppChannelView ?? latestMcpAppChannelView;
			attempt.latestMcpAppChannelView = latestMcpAppChannelView;
			latestMcpConnectAction = attempt.latestMcpConnectAction ?? latestMcpConnectAction;
			attempt.latestMcpConnectAction = latestMcpConnectAction;
		},
		get modelAttempt() {
			return modelAttempt;
		}
	};
}
/**
* Captures the settled transcript the tool-free finalizer needs when a settled
* post-tool turn dies on its final provider call. The consumer fails closed
* without this context, so the attempt-result owner has to supply it; the codex
* app-server harness already does the same for its own attempts.
*/
function resolveSettledTurnFinalizationContext(params) {
	if (params.terminal.kind !== "failed" || params.terminal.source !== "prompt" || params.terminal.timeoutObservation || !isTransientNetworkError(params.terminal.error)) return;
	if (!params.assistantTexts.every((text) => !text.trim())) return;
	if (!params.messagesSnapshot.some((message) => message.role === "toolResult")) return;
	return {
		source: "openclaw-transcript",
		messages: Object.freeze([...params.messagesSnapshot])
	};
}
function normalizeEmbeddedAttemptToolMetas(entries) {
	return entries.filter((entry) => typeof entry.toolName === "string" && entry.toolName.trim().length > 0).map((entry) => {
		const normalized = {
			toolName: entry.toolName,
			meta: entry.meta,
			replaySafe: entry.replaySafe === true
		};
		if (entry.toolCallId) normalized.toolCallId = entry.toolCallId;
		if (typeof entry.isError === "boolean") normalized.isError = entry.isError;
		if (entry.terminate === true) normalized.terminate = true;
		if (entry.asyncStarted === true) normalized.asyncStarted = true;
		if (entry.asyncTaskRunId) normalized.asyncTaskRunId = entry.asyncTaskRunId;
		if (entry.asyncTaskId) normalized.asyncTaskId = entry.asyncTaskId;
		if (entry.codeModeSuspended === true) normalized.codeModeSuspended = true;
		return normalized;
	});
}
function collectCompletedClientToolCalls(slots) {
	return slots.flatMap((slot) => slot.completed && slot.params ? [{
		name: slot.name,
		params: slot.params
	}] : []);
}
function hasVisiblePendingToolMediaReply(reply) {
	return Boolean(reply && ((reply.mediaUrls ?? []).some((url) => url.trim().length > 0) || reply.audioAsVoice === true));
}
/** Runs output hooks, classifies terminal effects, and returns the finalized attempt result. */
function completeEmbeddedAttemptResult(input) {
	const { attempt, state, subscription } = input;
	const terminal = projectAgentRunAttemptTerminal(state.terminal);
	const { assistantTexts, didSendDeterministicApprovalPrompt, didSendViaMessagingTool, getAcceptedSessionSpawns, getAssistantTurnCount, getCompactionCount, getHeartbeatToolResponse, getItemLifecycle, getLastAssistantTextMessageIndex, getLastCompactionTokensAfter, getLastToolError, getLatestMcpAppChannelView, getLatestMcpConnectAction, getMessagingToolSentMediaUrls, getMessagingToolSentTargets, getMessagingToolSentTexts, getMessagingToolSourceReplyPayloads, getPendingToolMediaReply, getToolAutoDeliveryMediaUrls, getReplayState, getSuccessfulCronAdds, getVisibleBlockReplyCount, hasToolMediaBlockReply, setTerminalLifecycleMeta, toolMetas } = subscription;
	const toolMetasNormalized = normalizeEmbeddedAttemptToolMetas(toolMetas);
	if (input.cache.observabilityEnabled) {
		const cacheBreak = input.cache.break;
		if (cacheBreak) {
			const changeSummary = cacheBreak.changes?.map((change) => `${change.code}(${change.detail})`).join(", ") ?? "no tracked cache input change";
			log$5.warn(`[prompt-cache] cache read dropped ${cacheBreak.previousCacheRead} -> ${cacheBreak.cacheRead} for ${attempt.provider}/${attempt.modelId} via ${input.cache.streamStrategy}; ${changeSummary}`);
			input.cache.trace?.recordStage("cache:result", { options: {
				previousCacheRead: cacheBreak.previousCacheRead,
				cacheRead: cacheBreak.cacheRead,
				changes: cacheBreak.changes?.map((change) => ({
					code: change.code,
					detail: change.detail
				}))
			} });
		} else if (input.cache.trace && input.cache.changesForTurn) input.cache.trace.recordStage("cache:result", {
			note: "state changed without a cache-read break",
			options: {
				cacheRead: state.attemptUsage?.cacheRead ?? 0,
				changes: input.cache.changesForTurn.map((change) => ({
					code: change.code,
					detail: change.detail
				}))
			}
		});
		else if (input.cache.trace) input.cache.trace.recordStage("cache:result", {
			note: "stable cache inputs",
			options: { cacheRead: state.attemptUsage?.cacheRead ?? 0 }
		});
	}
	if (attempt.operation !== "settled-tool-finalization" && input.hookRunner?.hasHooks("llm_output") && shouldRunLlmOutputHooksForAttempt({ promptErrorSource: terminal.promptErrorSource })) input.hookRunner.runLlmOutput({
		runId: attempt.runId,
		sessionId: attempt.sessionId,
		provider: attempt.provider,
		model: attempt.modelId,
		...attempt.contextWindowInfo?.tokens ? { contextTokenBudget: attempt.contextWindowInfo.tokens } : {},
		...attempt.contextWindowInfo?.source ? { contextWindowSource: attempt.contextWindowInfo.source } : {},
		...attempt.contextWindowInfo?.referenceTokens ? { contextWindowReferenceTokens: attempt.contextWindowInfo.referenceTokens } : {},
		resolvedRef: attempt.runtimePlan?.observability.resolvedRef ?? `${attempt.provider}/${attempt.modelId}`,
		...attempt.runtimePlan?.observability.harnessId ? { harnessId: attempt.runtimePlan.observability.harnessId } : {},
		assistantTexts,
		lastAssistant: state.lastAssistant,
		usage: state.attemptUsage
	}, {
		runId: attempt.runId,
		trace: freezeDiagnosticTraceContext(state.diagnosticTrace),
		agentId: input.hookAgentId,
		sessionKey: attempt.sessionKey,
		sessionId: attempt.sessionId,
		workspaceDir: attempt.workspaceDir,
		trigger: attempt.trigger,
		...attempt.contextWindowInfo?.tokens ? { contextTokenBudget: attempt.contextWindowInfo.tokens } : {},
		...attempt.contextWindowInfo?.source ? { contextWindowSource: attempt.contextWindowInfo.source } : {},
		...attempt.contextWindowInfo?.referenceTokens ? { contextWindowReferenceTokens: attempt.contextWindowInfo.referenceTokens } : {},
		...buildAgentHookContextChannelFields(attempt),
		...buildAgentHookContextIdentityFields({
			trigger: attempt.trigger,
			senderId: attempt.senderId,
			chatId: attempt.chatId,
			channelContext: attempt.channelContext
		})
	}).catch((err) => {
		log$5.warn(`llm_output hook failed: ${String(err)}`);
	});
	const acceptedSessionSpawns = getAcceptedSessionSpawns();
	const messagingToolSentMediaUrls = getMessagingToolSentMediaUrls();
	const sentMediaUrls = new Set(messagingToolSentMediaUrls.map((url) => url.trim()));
	const toolAutoDeliveryMediaUrls = getToolAutoDeliveryMediaUrls().filter((url) => !sentMediaUrls.has(url.trim()));
	const observedReplayMetadata = buildAttemptReplayMetadata({
		toolMetas: [],
		didSendViaMessagingTool: didSendViaMessagingTool(),
		messagingToolSentTexts: getMessagingToolSentTexts(),
		messagingToolSentMediaUrls,
		acceptedSessionSpawns,
		successfulCronAdds: getSuccessfulCronAdds()
	});
	const pendingToolMediaReply = getPendingToolMediaReply();
	const replayMetadata = replayMetadataFromState(observeReplayMetadata(getReplayState(), observedReplayMetadata));
	const currentAttemptReplayMetadata = buildAttemptReplayMetadata({
		toolMetas: toolMetasNormalized,
		didSendViaMessagingTool: didSendViaMessagingTool(),
		messagingToolSentTexts: getMessagingToolSentTexts(),
		messagingToolSentMediaUrls,
		acceptedSessionSpawns,
		successfulCronAdds: getSuccessfulCronAdds()
	});
	const completedClientToolCalls = collectCompletedClientToolCalls(input.clientToolCallSlots);
	const clientToolCalls = completedClientToolCalls.length > 0 ? completedClientToolCalls : void 0;
	const didSendDeterministicApprovalPromptNow = didSendDeterministicApprovalPrompt();
	const lastToolError = getLastToolError();
	const heartbeatToolResponse = getHeartbeatToolResponse();
	const messagingToolSourceReplyPayloads = getMessagingToolSourceReplyPayloads();
	const hasToolMediaBlockReplyNow = hasToolMediaBlockReply();
	const hasTerminalOutput = hasAttemptTerminalState({
		clientToolCalls,
		yieldDetected: state.yieldDetected,
		didSendDeterministicApprovalPrompt: didSendDeterministicApprovalPromptNow,
		heartbeatToolResponse,
		lastToolError,
		toolMediaUrls: pendingToolMediaReply?.mediaUrls,
		toolAudioAsVoice: pendingToolMediaReply?.audioAsVoice,
		toolTrustedLocalMedia: pendingToolMediaReply?.trustedLocalMedia,
		hasToolMediaBlockReply: hasToolMediaBlockReplyNow,
		didDeliverSourceReplyViaMessageTool: state.didDeliverSourceReplyViaMessageTool,
		messagingToolSourceReplyPayloads,
		messagingToolSentTexts: getMessagingToolSentTexts(),
		messagingToolSentMediaUrls,
		messagingToolSentTargets: getMessagingToolSentTargets(),
		acceptedSessionSpawns,
		successfulCronAdds: getSuccessfulCronAdds(),
		toolMetas: toolMetasNormalized
	});
	const pendingToolMediaPayloadCount = hasVisiblePendingToolMediaReply(pendingToolMediaReply) ? 1 : 0;
	const visibleBlockReplyCount = getVisibleBlockReplyCount();
	const silentToolResultReplyPayload = resolveSilentToolResultReplyPayload({
		isCronTrigger: attempt.trigger === "cron",
		payloadCount: pendingToolMediaPayloadCount,
		aborted: terminal.aborted,
		timedOut: terminal.timedOut,
		attempt: {
			clientToolCalls,
			yieldDetected: state.yieldDetected,
			didSendDeterministicApprovalPrompt: didSendDeterministicApprovalPromptNow,
			lastToolError,
			messagesSnapshot: state.messagesSnapshot,
			toolMetas: toolMetasNormalized
		}
	});
	const synthesizedPayloadCount = visibleBlockReplyCount + pendingToolMediaPayloadCount + messagingToolSourceReplyPayloads.length + (silentToolResultReplyPayload ? 1 : 0);
	const emptyAssistantReplyIsSilent = shouldTreatEmptyAssistantReplyAsSilent({
		allowEmptyAssistantReplyAsSilent: attempt.allowEmptyAssistantReplyAsSilent,
		terminalReplyExpectation: attempt.terminalReplyExpectation,
		payloadCount: 0,
		aborted: terminal.aborted,
		timedOut: terminal.timedOut,
		attempt: {
			assistantTexts,
			clientToolCalls,
			currentAttemptAssistant: state.currentAttemptAssistant,
			yieldDetected: state.yieldDetected,
			didSendDeterministicApprovalPrompt: didSendDeterministicApprovalPromptNow,
			didSendViaMessagingTool: didSendViaMessagingTool(),
			messagingToolSentTexts: getMessagingToolSentTexts(),
			messagingToolSentMediaUrls,
			messagingToolSentTargets: getMessagingToolSentTargets(),
			acceptedSessionSpawns,
			lastToolError,
			currentAttemptCompletedAssistant: state.currentAttemptCompletedAssistant,
			itemLifecycle: getItemLifecycle(),
			messagesSnapshot: state.messagesSnapshot,
			toolMetas: toolMetasNormalized,
			replayMetadata,
			terminal: state.terminal
		}
	});
	const settledTurnFinalizationContext = resolveSettledTurnFinalizationContext({
		assistantTexts,
		messagesSnapshot: state.messagesSnapshot,
		terminal: state.terminal
	});
	const result = {
		...state,
		...settledTurnFinalizationContext ? { settledTurnFinalizationContext } : {},
		replayMetadata,
		currentAttemptReplayMetadata,
		codeModeRecoveryCandidate: state.codeModeRecoveryCandidate,
		itemLifecycle: getItemLifecycle(),
		assistantTurns: getAssistantTurnCount(),
		setTerminalLifecycleMeta,
		bootstrapPromptWarningSignaturesSeen: input.bootstrapPromptWarning.warningSignaturesSeen,
		bootstrapPromptWarningSignature: input.bootstrapPromptWarning.signature,
		assistantTexts,
		latestMcpAppChannelView: getLatestMcpAppChannelView(),
		latestMcpConnectAction: getLatestMcpConnectAction(),
		lastAssistantTextMessageIndex: getLastAssistantTextMessageIndex(),
		toolMetas: toolMetasNormalized,
		successfulNestedToolNames: state.successfulNestedToolNames,
		acceptedSessionSpawns,
		lastToolError,
		didSendViaMessagingTool: didSendViaMessagingTool(),
		didSendDeterministicApprovalPrompt: didSendDeterministicApprovalPromptNow,
		messagingToolSentTexts: getMessagingToolSentTexts(),
		messagingToolSentMediaUrls,
		messagingToolSentTargets: getMessagingToolSentTargets(),
		messagingToolSourceReplyPayloads,
		heartbeatToolResponse,
		toolMediaUrls: pendingToolMediaReply?.mediaUrls,
		toolAudioAsVoice: pendingToolMediaReply?.audioAsVoice,
		toolTrustedLocalMedia: pendingToolMediaReply?.trustedLocalMedia,
		hasToolMediaBlockReply: hasToolMediaBlockReplyNow,
		successfulCronAdds: getSuccessfulCronAdds(),
		cloudCodeAssistFormatError: Boolean(state.lastAssistant?.errorMessage && isCloudCodeAssistFormatError(state.lastAssistant.errorMessage)),
		compactionCount: getCompactionCount(),
		compactionTokensAfter: getLastCompactionTokensAfter(),
		clientToolCalls,
		yieldDetected: state.yieldDetected || void 0,
		yieldAcknowledgment: state.yieldAcknowledgment
	};
	return finalizeEmbeddedAttempt({
		result: toolAutoDeliveryMediaUrls.length > 0 ? markCoreTtsAttemptResult(result, toolAutoDeliveryMediaUrls, attempt.admittedRunContext.operationalRunInstance) : result,
		trajectoryRecorder: input.trajectoryRecorder,
		deferredLifecycleOwner: input.deferredLifecycleOwner,
		synthesizedPayloadCount,
		emptyAssistantReplyIsSilent,
		hasTerminalOutput,
		silentExpected: attempt.silentExpected
	});
}
//#endregion
//#region src/agents/embedded-agent-runner/provider-prompt-state.ts
const providerPromptStates = resolveGlobalSingleton(Symbol.for("openclaw.providerPromptStates"), () => /* @__PURE__ */ new Map());
const digest$2 = (serialized) => crypto$1.createHash("sha256").update(serialized).digest("hex");
/** Returns run-local retry state; restarts and new run ids intentionally have no baseline. */
function getProviderPromptState(runId) {
	const state = providerPromptStates.get(runId) ?? {};
	providerPromptStates.set(runId, state);
	return state;
}
function clearProviderPromptState(runId) {
	providerPromptStates.delete(runId);
}
/** Captures the final provider request identity without retaining payload content. */
function snapshotProviderPrompt(params) {
	const scope = stableStringify({
		provider: params.model.provider,
		api: params.model.api,
		model: params.model.id,
		baseUrl: params.model.baseUrl,
		effectiveContextTokenBudget: params.effectiveContextTokenBudget
	});
	const serialized = stableStringify(params.payload);
	return {
		scopeDigest: digest$2(scope),
		digest: digest$2(serialized),
		byteWeight: Buffer$1.byteLength(serialized)
	};
}
/** Rejects only an exact replay of the last provider-rejected request body. */
function assertProviderPromptRetryProgress(state, candidate) {
	const rejected = state.lastRejected;
	if (rejected?.scopeDigest === candidate.scopeDigest && rejected.digest === candidate.digest) throw new Error(`Context overflow: refusing to resend the byte-identical provider payload after a context rejection (payloadBytes=${candidate.byteWeight}).`);
}
function markLastProviderPromptContextRejected(state) {
	const attempted = state.lastAttempt;
	if (attempted) state.lastRejected = attempted;
	return attempted;
}
/** Hashes the post-onPayload body for context-retry admission. */
function wrapStreamFnWithProviderPromptState(params) {
	return async (model, context, options) => {
		params.state.lastAttempt = void 0;
		const originalOnPayload = options?.onPayload;
		const observedOptions = {
			...options,
			onPayload: async (payload, payloadModel) => {
				const replacement = await originalOnPayload?.(payload, payloadModel);
				const finalPayload = replacement === void 0 ? payload : replacement;
				const snapshot = snapshotProviderPrompt({
					model: payloadModel,
					payload: finalPayload,
					effectiveContextTokenBudget: params.effectiveContextTokenBudget
				});
				assertProviderPromptRetryProgress(params.state, snapshot);
				params.state.lastAttempt = snapshot;
				return finalPayload;
			}
		};
		if (params.recordEvent) responsesPromptObserver.set(observedOptions, (observation) => params.recordEvent?.("provider.prompt.observed", { ...observation }));
		return params.streamFn(model, context, observedOptions);
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-async-tasks.ts
/**
* Waits for completion-required async tasks before finalizing an attempt.
*/
const DEFAULT_ASYNC_TASK_POLL_INTERVAL_MS = 500;
const COMPLETION_REQUIRED_TASK_KINDS = /* @__PURE__ */ new Set([
	"image_generation",
	"music_generation",
	"video_generation"
]);
function resolveAsyncTaskPollIntervalMs() {
	return isFastTestRuntimeEnv() ? 10 : DEFAULT_ASYNC_TASK_POLL_INTERVAL_MS;
}
function createAbortError(signal) {
	return createAbortError$1("aborted", { cause: "reason" in signal ? signal.reason : void 0 });
}
function throwIfAborted(signal) {
	if (signal?.aborted) throw createAbortError(signal);
}
async function sleepWithAbort(ms, signal, sleepFn) {
	if (!signal) {
		await sleepFn(ms);
		return;
	}
	throwIfAborted(signal);
	await new Promise((resolve, reject) => {
		const onAbort = () => {
			signal.removeEventListener("abort", onAbort);
			reject(createAbortError(signal));
		};
		signal.addEventListener("abort", onAbort, { once: true });
		sleepFn(ms).then(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, (err) => {
			signal.removeEventListener("abort", onAbort);
			reject(toErrorObject(err, "Non-Error rejection"));
		});
	});
}
function collectAsyncTaskRunIds(toolMetas, sessionKey, alreadyWaited) {
	const runIds = [];
	const seen = /* @__PURE__ */ new Set();
	const addRunId = (runIdRaw) => {
		const runId = runIdRaw?.trim();
		if (!runId || alreadyWaited.has(runId) || seen.has(runId)) return;
		seen.add(runId);
		runIds.push(runId);
	};
	for (const meta of toolMetas) addRunId(meta.asyncStarted === true ? meta.asyncTaskRunId : void 0);
	const normalizedSessionKey = sessionKey?.trim();
	if (!normalizedSessionKey) return runIds;
	for (const task of listTasksForOwnerOrRequesterSessionKeyForStatus(normalizedSessionKey)) {
		if (!COMPLETION_REQUIRED_TASK_KINDS.has(task.taskKind ?? "")) continue;
		if (isTerminalTaskStatus(task.status)) continue;
		addRunId(task.runId);
	}
	return runIds;
}
function findTerminalTasks(runIds) {
	const pendingRunIds = [];
	const terminalTasks = [];
	for (const runId of runIds) {
		const task = findTaskByRunIdForStatus(runId);
		if (task && isTerminalTaskStatus(task.status)) {
			terminalTasks.push(task);
			continue;
		}
		pendingRunIds.push(runId);
	}
	return {
		pendingRunIds,
		terminalTasks
	};
}
/** Returns whether a cron run has non-terminal generated-media tasks that must settle first. */
function requiresCompletionRequiredAsyncTaskWait(params) {
	const sessionKey = params.sessionKey?.trim();
	if (!sessionKey || !isCronRunSessionKey(sessionKey)) return false;
	if (params.toolMetas.some((meta) => meta.asyncStarted === true && Boolean(meta.asyncTaskRunId?.trim()))) return true;
	return listTasksForOwnerOrRequesterSessionKeyForStatus(sessionKey).some((task) => COMPLETION_REQUIRED_TASK_KINDS.has(task.taskKind ?? "") && !isTerminalTaskStatus(task.status) && Boolean(task.runId?.trim()));
}
/** Returns whether the current attempt should synchronously wait for media tasks. */
function shouldWaitForCompletionRequiredAsyncTasks(params) {
	if (params.yieldDetected === true) return false;
	return requiresCompletionRequiredAsyncTaskWait({
		sessionKey: params.sessionKey,
		toolMetas: params.toolMetas
	});
}
/**
* Polls completion-required async tasks until they reach terminal state, time
* out at the run deadline, or abort. Newly discovered task run ids are folded
* into later poll rounds so task metadata and registry state can arrive in any
* order.
*/
async function waitForCompletionRequiredAsyncTasks(params) {
	const now = params.now ?? Date.now;
	const sleepFn = params.sleep ?? sleep;
	const pollIntervalMs = params.pollIntervalMs ?? resolveAsyncTaskPollIntervalMs();
	const waitedRunIds = /* @__PURE__ */ new Set();
	const timedOutRunIds = /* @__PURE__ */ new Set();
	const terminalTasksByRunId = /* @__PURE__ */ new Map();
	while (true) {
		throwIfAborted(params.abortSignal);
		const runIds = collectAsyncTaskRunIds(params.getToolMetas(), params.sessionKey, waitedRunIds);
		if (runIds.length === 0) return {
			waitedRunIds: [...waitedRunIds],
			timedOutRunIds: [...timedOutRunIds],
			terminalTasks: [...terminalTasksByRunId.values()]
		};
		for (const runId of runIds) waitedRunIds.add(runId);
		let pendingRunIds = runIds;
		while (pendingRunIds.length > 0) {
			throwIfAborted(params.abortSignal);
			const terminalState = findTerminalTasks(pendingRunIds);
			for (const task of terminalState.terminalTasks) {
				const runId = task.runId?.trim();
				if (runId) terminalTasksByRunId.set(runId, task);
			}
			pendingRunIds = terminalState.pendingRunIds;
			if (pendingRunIds.length === 0) break;
			const deadlineAtMs = params.getDeadlineAtMs();
			const remainingMs = deadlineAtMs === void 0 ? pollIntervalMs : deadlineAtMs - now();
			if (remainingMs <= 0) {
				for (const runId of pendingRunIds) timedOutRunIds.add(runId);
				return {
					waitedRunIds: [...waitedRunIds],
					timedOutRunIds: [...timedOutRunIds],
					terminalTasks: [...terminalTasksByRunId.values()]
				};
			}
			await sleepWithAbort(Math.min(pollIntervalMs, remainingMs), params.abortSignal, sleepFn);
		}
	}
}
//#endregion
//#region src/agents/embedded-agent-runner/run/compaction-retry-aggregate-timeout.ts
/**
* Caps compaction retry waits against the aggregate run timeout.
*/
function hasActiveCompactionRetryWork(params) {
	return params.isCompactionInFlight || params.isSessionStreaming;
}
/**
* Waits for compaction retry completion with an aggregate timeout so a lost
* retry resolution cannot hold the session lane indefinitely.
*/
async function waitForCompactionRetryWithAggregateTimeout(params) {
	const timeoutMs = resolveTimerTimeoutMs(params.aggregateTimeoutMs, 1);
	let timedOut = false;
	const waitPromise = params.waitForCompactionRetry().then(() => ({ kind: "done" }), (error) => ({
		kind: "rejected",
		error
	}));
	while (true) {
		let timer;
		try {
			const result = await params.abortable(Promise.race([waitPromise, new Promise((resolve) => {
				timer = setTimeout(() => resolve("timeout"), timeoutMs);
			})]));
			if (result !== "timeout") {
				if (result.kind === "done") break;
				throw result.error;
			}
			if (params.isCompactionRetryStillActive?.()) continue;
			timedOut = true;
			params.onTimeout?.();
			break;
		} finally {
			if (timer !== void 0) clearTimeout(timer);
		}
	}
	return { timedOut };
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-stream-settle.ts
/**
* Prepares transport before streaming and settles the completed stream afterward.
* It may assume session runtime ownership and provider inputs are established.
*/
async function settleEmbeddedAttemptStream(input) {
	const { attempt, activeSession, sessionManager, subscription, state } = input;
	let { promptError, promptErrorSource, sessionIdUsed } = state;
	if (shouldWaitForCompletionRequiredAsyncTasks({
		sessionKey: attempt.sessionKey,
		toolMetas: subscription.toolMetas,
		yieldDetected: state.yieldAborted
	})) {
		const getAsyncStartedToolMetas = () => subscription.toolMetas.filter((entry) => typeof entry.toolName === "string" && entry.toolName.trim().length > 0).map((entry) => ({
			toolName: entry.toolName,
			asyncStarted: entry.asyncStarted,
			asyncTaskRunId: entry.asyncTaskRunId,
			asyncTaskId: entry.asyncTaskId
		}));
		const getAsyncTaskDeadlineAtMs = () => {
			const deadlineAtMs = input.getRunAbortDeadlineAtMs();
			return deadlineAtMs === void 0 ? void 0 : Math.max(Date.now(), deadlineAtMs - 500);
		};
		let asyncTaskWait;
		try {
			asyncTaskWait = await waitForCompletionRequiredAsyncTasks({
				getToolMetas: getAsyncStartedToolMetas,
				sessionKey: attempt.sessionKey,
				getDeadlineAtMs: getAsyncTaskDeadlineAtMs,
				abortSignal: input.runAbortSignal
			});
		} catch (err) {
			const lifecycle = input.readLifecycleState();
			if (!lifecycle.timedOut && !lifecycle.aborted || !isRunnerAbortError(err)) throw err;
			asyncTaskWait = await waitForCompletionRequiredAsyncTasks({
				getToolMetas: getAsyncStartedToolMetas,
				sessionKey: attempt.sessionKey,
				getDeadlineAtMs: Date.now
			});
		}
		if (asyncTaskWait.timedOutRunIds.length > 0 && !input.readLifecycleState().aborted) {
			promptError = /* @__PURE__ */ new Error(`Timed out waiting for async task completion: ${asyncTaskWait.timedOutRunIds.join(", ")}`);
			promptErrorSource = "prompt";
			state.promptError = promptError;
			state.promptErrorSource = promptErrorSource;
		}
	}
	const wasCompactingBefore = activeSession.isCompacting;
	const snapshot = activeSession.messages.slice();
	const wasCompactingAfter = activeSession.isCompacting;
	const preCompactionSnapshot = wasCompactingBefore || wasCompactingAfter ? null : snapshot;
	const preCompactionSessionId = activeSession.sessionId;
	const aggregateTimeoutMs = 6e4;
	try {
		if (input.onBlockReplyFlush) {
			const currentAssistant = findCurrentAttemptAssistantMessage({
				messagesSnapshot: snapshot,
				prePromptMessageCount: input.prePromptMessageCount
			});
			const attemptAccepted = !promptError && !input.readLifecycleState().aborted && !input.readLifecycleState().timedOut && !state.yieldAborted && currentAssistant?.stopReason === "stop";
			await joinWithRunLivenessDeadline({
				joinWork: () => input.onBlockReplyFlush?.({
					reason: "pre_compaction",
					attemptAccepted
				}),
				runAbortSignal: input.runAbortSignal,
				onTimeout: () => {
					log$5.warn(`block-reply flush did not settle within ${RUN_LIVENESS_JOIN_TIMEOUT_MS}ms; proceeding with settlement: runId=${attempt.runId}`);
				}
			});
		}
		if ((state.yieldAborted ? { timedOut: false } : await waitForCompactionRetryWithAggregateTimeout({
			waitForCompactionRetry: subscription.waitForCompactionRetry,
			abortable: input.abortable,
			aggregateTimeoutMs,
			isCompactionRetryStillActive: () => hasActiveCompactionRetryWork({
				isCompactionInFlight: subscription.isCompactionInFlight(),
				isSessionStreaming: activeSession.isStreaming
			})
		})).timedOut) {
			input.markTimedOutDuringCompaction();
			if (!input.isProbeSession) log$5.warn(`compaction retry aggregate timeout (${aggregateTimeoutMs}ms): proceeding with pre-compaction state runId=${attempt.runId} sessionId=${attempt.sessionId}`);
		}
	} catch (err) {
		if (!isRunnerAbortError(err)) throw err;
		if (!promptError) {
			promptError = err;
			promptErrorSource = "compaction";
			state.promptError = promptError;
			state.promptErrorSource = promptErrorSource;
		}
		if (!input.isProbeSession) log$5.debug(`compaction wait aborted: runId=${attempt.runId} sessionId=${attempt.sessionId}`);
	}
	let compactionOccurredThisAttempt = false;
	let messagesSnapshot = [];
	let lastAssistant;
	let currentAttemptAssistant;
	let currentAttemptCompletedAssistant;
	let attemptUsage;
	let cacheBreak = null;
	let lastCallUsage;
	let promptCache;
	await input.withOwnedTranscriptWrite(async () => {
		const { timedOutDuringCompaction } = input.readLifecycleState();
		compactionOccurredThisAttempt = subscription.getCompactionCount() > 0;
		appendAttemptCacheTtlIfNeeded({
			sessionManager,
			timedOutDuringCompaction,
			compactionOccurredThisAttempt,
			config: attempt.config,
			provider: attempt.provider,
			modelId: attempt.modelId,
			modelApi: attempt.model.api,
			isCacheTtlEligibleProvider
		});
		if (timedOutDuringCompaction) {
			const removedEntries = normalizeCompactionRecoveryTranscriptTail({
				activeSession,
				sessionManager
			});
			if (removedEntries > 0 && !input.isProbeSession) log$5.warn(`normalized compaction timeout transcript tail: removedEntries=${removedEntries} runId=${attempt.runId} sessionId=${attempt.sessionId}`);
		}
		const snapshotSelection = selectCompactionTimeoutSnapshot({
			timedOutDuringCompaction,
			preCompactionSnapshot,
			preCompactionSessionId,
			currentSnapshot: activeSession.messages.slice(),
			currentSessionId: activeSession.sessionId
		});
		if (timedOutDuringCompaction && !input.isProbeSession) log$5.warn(`using ${snapshotSelection.source} snapshot: timed out during compaction runId=${attempt.runId} sessionId=${attempt.sessionId}`);
		messagesSnapshot = snapshotSelection.messagesSnapshot;
		sessionIdUsed = snapshotSelection.sessionIdUsed;
		lastAssistant = messagesSnapshot.toReversed().find((message) => message.role === "assistant");
		currentAttemptAssistant = findCurrentAttemptAssistantMessage({
			messagesSnapshot,
			prePromptMessageCount: input.prePromptMessageCount
		});
		currentAttemptCompletedAssistant = subscription.getCurrentAttemptAssistant();
		attemptUsage = subscription.getUsageTotals();
		cacheBreak = input.cache.observabilityEnabled ? completePromptCacheObservation({
			sessionId: attempt.sessionId,
			promptCacheKey: attempt.promptCacheKey,
			sessionKey: attempt.sessionKey,
			usage: attemptUsage
		}) : null;
		const transcriptUsageSnapshot = findLatestUncompactedAttemptUsageSnapshot({
			messagesSnapshot,
			prePromptMessageCount: input.prePromptMessageCount,
			compactionOccurred: compactionOccurredThisAttempt
		});
		const completedAssistantUsage = normalizeUsage(currentAttemptCompletedAssistant?.usage);
		lastCallUsage = subscription.getLastAssistantUsage() ?? (hasNonzeroUsage(completedAssistantUsage) ? completedAssistantUsage : transcriptUsageSnapshot?.usage);
		const usageAssistant = hasNonzeroUsage(completedAssistantUsage) ? currentAttemptCompletedAssistant : transcriptUsageSnapshot?.assistant;
		const promptCacheObservation = input.cache.observabilityEnabled && (cacheBreak || input.cache.changesForTurn || typeof attemptUsage?.cacheRead === "number") ? {
			broke: Boolean(cacheBreak),
			...typeof cacheBreak?.previousCacheRead === "number" ? { previousCacheRead: cacheBreak.previousCacheRead } : {},
			...typeof cacheBreak?.cacheRead === "number" ? { cacheRead: cacheBreak.cacheRead } : typeof attemptUsage?.cacheRead === "number" ? { cacheRead: attemptUsage.cacheRead } : {},
			changes: cacheBreak?.changes ?? input.cache.changesForTurn
		} : void 0;
		const fallbackLastCacheTouchAt = readLastCacheTtlTimestamp(sessionManager, {
			provider: attempt.provider,
			modelId: attempt.modelId
		});
		promptCache = buildContextEnginePromptCacheInfo({
			retention: input.cache.retention,
			lastCallUsage,
			observation: promptCacheObservation,
			lastCacheTouchAt: resolvePromptCacheTouchTimestamp({
				lastCallUsage,
				assistantTimestamp: usageAssistant?.timestamp,
				fallbackLastCacheTouchAt
			})
		});
		if (promptError && promptErrorSource === "prompt" && !compactionOccurredThisAttempt) try {
			sessionManager.appendCustomEntry("openclaw:prompt-error", {
				timestamp: Date.now(),
				runId: attempt.runId,
				sessionId: attempt.sessionId,
				provider: attempt.provider,
				model: attempt.modelId,
				api: attempt.model.api,
				error: formatErrorMessage(promptError)
			});
		} catch (entryErr) {
			log$5.warn(`failed to persist prompt error entry: ${String(entryErr)}`);
		}
		if (input.shouldFlushForContextEngine) flushSessionManagerTranscript(sessionManager);
	});
	return {
		promptError,
		promptErrorSource,
		timedOutDuringCompaction: input.readLifecycleState().timedOutDuringCompaction,
		compactionOccurredThisAttempt,
		messagesSnapshot,
		sessionIdUsed,
		lastAssistant,
		currentAttemptAssistant,
		currentAttemptCompletedAssistant,
		successfulNestedToolNames: [...new Set(input.nestedToolActivities.flatMap(({ details }) => details.isError ? [] : [details.toolName]))],
		attemptUsage,
		cacheBreak,
		lastCallUsage,
		promptCache
	};
}
/**
* Selects and configures the provider transport for one embedded attempt.
*/
async function prepareEmbeddedAttemptTransport(input) {
	const attempt = input.attempt;
	const session = input.session;
	const defaultSessionStreamFn = resolveEmbeddedAgentBaseStreamFn({ session });
	const resolvedTransport = resolveExplicitSettingsTransport({
		settingsManager: input.settingsManager,
		sessionTransport: session.agent.transport
	});
	const streamExtraParamsOverride = {
		...attempt.streamParams,
		fastMode: attempt.fastMode
	};
	const effectiveExtraParams = attempt.runtimePlan?.transport.resolveExtraParams({
		extraParamsOverride: streamExtraParamsOverride,
		thinkingLevel: input.providerThinkingLevel,
		agentId: input.sessionAgentId,
		workspaceDir: input.workspaceDir,
		model: attempt.model,
		resolvedTransport
	}) ?? resolvePreparedExtraParams({
		cfg: attempt.config,
		provider: attempt.provider,
		modelId: attempt.modelId,
		extraParamsOverride: streamExtraParamsOverride,
		thinkingLevel: input.providerThinkingLevel,
		agentId: input.sessionAgentId,
		agentDir: input.agentDir,
		workspaceDir: input.workspaceDir,
		model: attempt.model,
		resolvedTransport
	});
	const providerStreamFn = registerProviderStreamForModel({
		model: attempt.model,
		cfg: attempt.config,
		agentDir: input.agentDir,
		workspaceDir: input.workspaceDir
	});
	const directProviderStreamFn = providerStreamFn ? wrapStreamFnWithMessageTransform(providerStreamFn, (messages) => messages, ({ context, ...provider }) => materializeProviderContext({
		...provider,
		context,
		workspaceDir: input.workspaceDir,
		workspaceOnly: input.workspaceOnly,
		localRoots: input.workspaceOnly ? void 0 : getAgentScopedMediaLocalRoots(attempt.config ?? {}, input.sessionAgentId),
		onCurrentTurnImageFailure: input.onCurrentTurnImageFailure,
		sandbox: input.sandbox?.enabled && input.sandbox.fsBridge ? {
			root: input.sandbox.workspaceDir,
			bridge: input.sandbox.fsBridge
		} : void 0
	})) : void 0;
	const transportApiKey = await resolveEmbeddedAgentApiKey({
		provider: attempt.model.provider,
		resolvedApiKey: attempt.resolvedApiKey,
		authStorage: attempt.authStorage
	});
	const { streamFn, strategy: streamStrategy } = resolveEmbeddedAgentStream({
		currentStreamFn: defaultSessionStreamFn,
		providerStreamFn: directProviderStreamFn,
		sessionId: attempt.sessionId,
		promptCacheKey: attempt.promptCacheKey,
		signal: input.abortSignal,
		model: attempt.model,
		resolvedApiKey: attempt.resolvedApiKey,
		transportAuthAvailable: Boolean(transportApiKey?.trim()),
		authProfileId: resolveAttemptStreamAuthProfileId(attempt),
		authStorage: attempt.authStorage
	});
	session.agent.streamFn = streamFn;
	session.agent.streamFn = wrapStreamFnWithProviderPromptState({
		streamFn: session.agent.streamFn,
		...input.providerPromptState
	});
	const providerTextTransforms = resolveProviderTextTransforms({
		provider: attempt.provider,
		config: attempt.config,
		workspaceDir: input.workspaceDir,
		runtimeHandle: input.getProviderRuntimeHandle()
	});
	if (providerTextTransforms?.input?.length) session.agent.streamFn = wrapStreamFnTextTransforms({
		streamFn: session.agent.streamFn,
		input: providerTextTransforms.input,
		transformSystemPrompt: false
	});
	const nativeWebSearchPolicyContext = {
		webSearchEnabled: attempt.disableTools !== true && attempt.toolOverrides?.webSearch !== false,
		runtimeToolAllowlist: attempt.toolsAllow,
		sessionKey: input.sandboxSessionKey,
		sandboxToolPolicy: input.sandbox?.tools,
		messageProvider: resolveAttemptToolPolicyMessageProvider(attempt),
		agentAccountId: attempt.agentAccountId,
		groupId: attempt.groupId,
		groupChannel: attempt.groupChannel,
		groupSpace: attempt.groupSpace,
		spawnedBy: attempt.spawnedBy,
		senderId: attempt.senderId,
		senderName: attempt.senderName,
		senderUsername: attempt.senderUsername,
		senderE164: attempt.senderE164
	};
	applyExtraParamsToAgent(session.agent, attempt.config, attempt.provider, attempt.modelId, streamExtraParamsOverride, input.providerThinkingLevel, input.sessionAgentId, input.workspaceDir, attempt.model, input.agentDir, resolvedTransport, {
		preparedExtraParams: effectiveExtraParams,
		nativeWebSearchPolicyContext
	});
	if (input.codeModeControlsEnabled) session.agent.streamFn = createCodexNativeWebSearchWrapper(session.agent.streamFn, {
		config: attempt.config,
		agentDir: input.agentDir,
		agentId: input.sessionAgentId,
		...nativeWebSearchPolicyContext,
		codeModeToolSurfaceEnabled: true
	});
	const effectivePromptCacheRetention = resolveCacheRetention(effectiveExtraParams, attempt.provider, attempt.model.api, attempt.modelId);
	const agentTransportOverride = resolveAgentTransportOverride({
		settingsManager: input.settingsManager,
		effectiveExtraParams
	});
	const effectiveAgentTransport = agentTransportOverride ?? session.agent.transport;
	if (agentTransportOverride && session.agent.transport !== agentTransportOverride) {
		const previousTransport = session.agent.transport;
		log$5.debug(`embedded agent transport override: ${previousTransport} -> ${agentTransportOverride} (${attempt.provider}/${attempt.modelId})`);
	}
	session.agent.transport = effectiveAgentTransport;
	return {
		compactionReplayEnabled: resolveCompactionReplayEligibility(attempt.model, {
			extraParams: effectiveExtraParams,
			apiKey: transportApiKey
		}),
		effectiveAgentTransport,
		effectiveExtraParams,
		effectivePromptCacheRetention,
		providerTextTransforms,
		streamStrategy
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-settle.ts
/**
* Settles prompt dispatch, stream cleanup, and result projection.
* It may assume stream runtime preparation and session state are ready.
*/
const FAILED_PROMPT_MEDIA_NOTE_TYPE = "openclaw.system-note";
const FAILED_PROMPT_MEDIA_NOTE_SOURCE = "prompt-image-hydration";
function cleanupEmbeddedAttemptStreamExecution(input) {
	const { attempt, state } = input;
	const terminal = projectAgentRunAttemptTerminal(state.terminal);
	input.clearAttemptTimeoutTimers();
	if (!input.isProbeSession && (terminal.aborted || terminal.timedOut) && !terminal.timedOutDuringCompaction) log$5.debug(`run cleanup: runId=${attempt.runId} sessionId=${attempt.sessionId} aborted=${terminal.aborted} timedOut=${terminal.timedOut}`);
	let firstCleanupError;
	const cleanups = [["unsubscribe", input.unsubscribe], ["backend detach", () => attempt.replyOperation?.detachBackend(input.queueHandle)]];
	if (!input.deferredLifecycleOwner) cleanups.push(["active run cleanup", () => clearActiveEmbeddedRun(attempt.sessionId, input.queueHandle, attempt.sessionKey, attempt.sessionFile)]);
	for (const [name, cleanup] of cleanups) try {
		cleanup();
	} catch (error) {
		firstCleanupError ??= error instanceof Error ? error : new Error(String(error));
		log$5.error(`CRITICAL: ${name} failed, possible resource leak: runId=${attempt.runId} ${String(error)}`);
	}
	return firstCleanupError;
}
async function runEmbeddedAttemptSettledPhase(input) {
	const { attempt, state } = input;
	const { bootstrap, bundleTools, sessionRuntime, systemPrompt, toolBase, toolCatalog } = input.prepared;
	const { agentSession: { activeSession, clientToolCallSlots, getCodeModeRecoveryCandidate, hasDeliveredSourceReply, hookRunner, setCodeModeReconciliationReadAuthorized, setActiveSessionSystemPrompt, settingsManager }, anthropicPayloadLogger, boundary: sessionBoundary, cacheTrace, contextGuards, preparedUserTurnMessage, sessionManager, sessionPromptState, state: sessionRuntimeState, toolResultPromptProjectionState, trajectoryRecorder, transport: { effectiveAgentTransport, effectiveExtraParams, effectivePromptCacheRetention, streamStrategy } } = sessionRuntime;
	const { boundaryTimezone, includeBoundaryTimestamp, orphanRepair } = sessionBoundary;
	const { runtimeInfo, systemPromptReport } = systemPrompt;
	const { bootstrapPromptWarning, shouldRecordCompletedBootstrapTurn } = bootstrap;
	const { effectiveTools, toolSearch } = toolCatalog;
	const { tools, uncompactedEffectiveTools } = bundleTools;
	const { nestedToolActivities } = toolBase;
	const hookAgentId = input.setup.sessionAgentId;
	let yieldAborted = false;
	const preparedStreamRuntime = input.preparedStreamRuntime;
	const { abortable, cache: { observabilityEnabled: cacheObservabilityEnabled, promptTools: promptCacheTools }, history: { contextEnginePromptAuthority, contextEngineAssemblySucceeded, unwindowedContextEngineMessagesForPrecheck }, isProbeSession, onBlockReplyFlush, promptActiveSession, stream: preparedStream, timeout: attemptTimeout } = preparedStreamRuntime;
	const { subscription, queueHandle, stopAcceptingSteerMessages, getBeforeAgentFinalizeRevisionReason, getBeforeAgentFinalizeRevisionEntryId } = preparedStream;
	const { unsubscribe, waitForPendingEvents } = subscription;
	const { getRunAbortDeadlineAtMs, clearTimers: clearAttemptTimeoutTimers } = attemptTimeout;
	let promptCacheChangesForTurn = null;
	let lastAssistant;
	let currentAttemptAssistant;
	let currentAttemptCompletedAssistant;
	let successfulNestedToolNames;
	let attemptUsage;
	let cacheBreak = null;
	let contextBudgetStatus;
	let finalPromptText;
	let messagesSnapshot = [];
	let sessionIdUsed = activeSession.sessionId;
	let sessionFileUsed = attempt.sessionFile;
	let preflightRecovery;
	let cleanupError;
	const readTerminal = () => projectAgentRunAttemptTerminal(state.terminal);
	const setFailure = (error, source) => {
		state.terminal = setAgentRunAttemptTerminalFailure(state.terminal, error !== null && error !== void 0 ? {
			error,
			source: source ?? "prompt"
		} : null);
	};
	try {
		const { promptStartedAt } = await runEmbeddedAttemptPromptPhase({
			attempt,
			activeSession,
			sessionManager,
			withOwnedTranscriptWrite: input.sessionLock.withOwnedTranscriptWrite,
			getCompactionReserveTokens: () => settingsManager.getCompactionReserveTokens(),
			get emptyExplicitToolAllowlistError() {
				return toolCatalog.emptyExplicitToolAllowlistError ?? void 0;
			},
			assembly: {
				hookRunner,
				hookAgentId,
				diagnosticTrace: input.diagnostics.diagnosticTrace,
				isRawModelRun: input.isRawModelRun,
				...orphanRepair ? { orphanRepair } : {},
				sessionAgentId: input.setup.sessionAgentId,
				runtimeModel: runtimeInfo.model,
				systemPromptText: sessionRuntimeState.systemPromptText,
				setActiveSessionSystemPrompt,
				cache: {
					observabilityEnabled: cacheObservabilityEnabled,
					retention: effectivePromptCacheRetention,
					streamStrategy,
					transport: effectiveAgentTransport,
					tools: promptCacheTools,
					trace: cacheTrace
				}
			},
			context: {
				...boundaryTimezone ? { boundaryTimezone } : {},
				includeBoundaryTimestamp,
				isRawModelRun: input.isRawModelRun,
				...preparedUserTurnMessage ? { preparedUserTurnMessage } : {},
				sessionAgentId: input.setup.sessionAgentId,
				setActiveSessionSystemPrompt,
				...systemPromptReport ? { systemPromptReport } : {},
				systemPromptText: sessionRuntimeState.systemPromptText,
				toolResultPromptProjectionState
			},
			execution: {
				mediaOwnerAgentId: input.setup.sessionAgentId,
				effectiveFsWorkspaceOnly: input.setup.effectiveFsWorkspaceOnly,
				effectiveWorkspace: input.setup.effectiveWorkspace,
				sandbox: input.setup.sandbox
			},
			googlePromptCache: {
				extraParams: effectiveExtraParams,
				signal: input.runAbortController.signal
			},
			observation: {
				cacheTrace,
				diagnosticTrace: input.diagnostics.diagnosticTrace,
				effectiveTools,
				hookAgentId,
				hookRunner,
				isRawModelRun: input.isRawModelRun,
				runTrace: input.diagnostics.runTrace,
				streamStrategy,
				systemPromptText: sessionRuntimeState.systemPromptText,
				toolSearchCompacted: toolSearch.compacted,
				tools,
				trajectoryRecorder,
				transport: effectiveAgentTransport,
				uncompactedEffectiveTools
			},
			toolPolicy: input.prepared.promptToolPolicy,
			preflight: {
				...input.activeContextEngine ? { activeContextEngine: input.activeContextEngine } : {},
				compactionReplayEnabled: sessionRuntime.transport.compactionReplayEnabled,
				contextEngineAssemblySucceeded,
				contextEnginePromptAuthority,
				includeBoundaryTimestamp,
				...boundaryTimezone ? { timezone: boundaryTimezone } : {},
				...unwindowedContextEngineMessagesForPrecheck ? { unwindowedContextEngineMessagesForPrecheck } : {}
			},
			submission: {
				promptActiveSession,
				sessionPromptState,
				toolResultPromptProjectionState,
				trajectoryRecorder
			},
			lifecycle: {
				readState: () => {
					const terminal = readTerminal();
					return {
						contextBudgetStatus,
						preflightRecovery,
						promptError: terminal.promptError,
						promptErrorSource: terminal.promptErrorSource
					};
				},
				writeState: (nextState) => {
					contextBudgetStatus = nextState.contextBudgetStatus;
					preflightRecovery = nextState.preflightRecovery;
					setFailure(nextState.promptError, nextState.promptErrorSource);
				},
				getPrePromptMessageCount: () => sessionRuntimeState.prePromptMessageCount,
				setPrePromptMessageCount: (count) => {
					sessionRuntimeState.prePromptMessageCount = count;
				},
				setCurrentUserTimestampOverride: (override) => {
					sessionBoundary.setCurrentUserTimestampOverride(override);
				},
				setPromptCacheChangesForTurn: (changes) => {
					promptCacheChangesForTurn = changes;
				},
				setCodeModeReconciliationReadAuthorized,
				setFinalPromptText: (prompt) => {
					finalPromptText = prompt;
				},
				markBeforeAgentRunBlocked: (outcome) => {
					state.beforeAgentRunBlockedBy = outcome.blockedBy;
				},
				markYieldAborted: () => {
					yieldAborted = true;
					state.terminal = mergeAgentRunAttemptTerminal(state.terminal, {
						kind: "aborted",
						source: "yield_cleanup"
					});
				},
				isRunBudgetTimeoutAbort: (error) => readTerminal().timedOutByRunBudget && isOpenClawAbortableWrapper(error) && error instanceof Error && error.cause === input.runAbortController.signal.reason,
				readYieldState: input.lifecycle.readYieldState,
				stopAcceptingSteerMessages,
				takePendingMidTurnPrecheckRequest: contextGuards.takePendingMidTurnPrecheckRequest
			}
		});
		const isFailureFreeRunBudgetTimeout = () => {
			const terminal = readTerminal();
			return terminal.timedOutByRunBudget && !terminal.failed;
		};
		const runBudgetTimeoutTerminal = isFailureFreeRunBudgetTimeout();
		const drainPendingEventsBounded = () => joinWithRunLivenessDeadline({
			joinWork: () => waitForPendingEvents({ includePartialReplies: false }),
			onTimeout: () => {
				log$5.warn(`pending subscription events did not settle within ${RUN_LIVENESS_JOIN_TIMEOUT_MS}ms; proceeding to stream settlement: runId=${attempt.runId}`);
			}
		});
		if (runBudgetTimeoutTerminal) await drainPendingEventsBounded();
		else {
			await joinWithRunLivenessDeadline({
				joinWork: waitForPendingEvents,
				runAbortSignal: input.runAbortController.signal,
				onTimeout: () => {
					log$5.warn(`pending subscription events did not settle within ${RUN_LIVENESS_JOIN_TIMEOUT_MS}ms; proceeding to stream settlement: runId=${attempt.runId}`);
				}
			});
			if (isFailureFreeRunBudgetTimeout()) await drainPendingEventsBounded();
		}
		const salvageTerminal = readTerminal();
		if (salvageTerminal.timedOutByRunBudget && !salvageTerminal.failed) subscription.flushPartialAssistantText();
		const beforeAgentFinalizeRevisionReason = getBeforeAgentFinalizeRevisionReason();
		const beforeAgentFinalizeRevisionEntryId = getBeforeAgentFinalizeRevisionEntryId();
		let rewoundBeforeAgentFinalizeRevision = false;
		if (beforeAgentFinalizeRevisionReason && beforeAgentFinalizeRevisionEntryId) await input.sessionLock.withOwnedTranscriptWrite(() => {
			const rejectedEntry = sessionManager.getEntry(beforeAgentFinalizeRevisionEntryId);
			if (rejectedEntry?.type !== "message" || rejectedEntry.message.role !== "assistant") throw new Error(`before_agent_finalize persisted assistant entry is missing or invalid (entry=${beforeAgentFinalizeRevisionEntryId})`);
			sessionManager.appendLeafControl({
				targetId: rejectedEntry.parentId,
				appendParentId: rejectedEntry.parentId
			});
			rewoundBeforeAgentFinalizeRevision = true;
		});
		let settledStream;
		try {
			if (input.getRepairedRejectedProviderReplay() && !rewoundBeforeAgentFinalizeRevision) activeSession.agent.state.messages = sanitizeCompactionReplayMessages(sessionManager.buildSessionContext().messages);
			const settleTerminal = readTerminal();
			const streamSettleState = {
				promptError: settleTerminal.promptError,
				promptErrorSource: settleTerminal.promptErrorSource,
				yieldAborted,
				sessionIdUsed
			};
			try {
				settledStream = await settleEmbeddedAttemptStream({
					attempt,
					activeSession,
					sessionManager,
					withOwnedTranscriptWrite: input.sessionLock.withOwnedTranscriptWrite,
					state: streamSettleState,
					getRunAbortDeadlineAtMs,
					shouldFlushForContextEngine: Boolean(input.activeContextEngine && !getBeforeAgentFinalizeRevisionReason()),
					subscription,
					readLifecycleState: () => {
						const terminal = readTerminal();
						return {
							aborted: terminal.aborted,
							timedOut: terminal.timedOut,
							timedOutDuringCompaction: terminal.timedOutDuringCompaction
						};
					},
					markTimedOutDuringCompaction: () => {
						state.terminal = mergeAgentRunAttemptTerminal(state.terminal, {
							kind: "timeout",
							phase: "compaction",
							source: "observation"
						});
					},
					runAbortSignal: input.runAbortController.signal,
					isProbeSession,
					onBlockReplyFlush,
					abortable,
					prePromptMessageCount: sessionRuntimeState.prePromptMessageCount,
					nestedToolActivities,
					cache: {
						observabilityEnabled: cacheObservabilityEnabled,
						changesForTurn: promptCacheChangesForTurn,
						retention: effectivePromptCacheRetention
					}
				});
			} catch (error) {
				setFailure(streamSettleState.promptError, streamSettleState.promptErrorSource);
				throw error;
			}
		} finally {
			if (rewoundBeforeAgentFinalizeRevision) await input.sessionLock.withOwnedTranscriptWrite(() => {
				activeSession.agent.state.messages = sanitizeCompactionReplayMessages(sessionManager.buildSessionContext().messages);
			});
		}
		setFailure(settledStream.promptError, settledStream.promptErrorSource);
		if (settledStream.timedOutDuringCompaction) state.terminal = mergeAgentRunAttemptTerminal(state.terminal, {
			kind: "timeout",
			phase: "compaction",
			source: "observation"
		});
		messagesSnapshot = settledStream.messagesSnapshot;
		sessionIdUsed = settledStream.sessionIdUsed;
		lastAssistant = settledStream.lastAssistant;
		currentAttemptAssistant = settledStream.currentAttemptAssistant;
		currentAttemptCompletedAssistant = settledStream.currentAttemptCompletedAssistant;
		successfulNestedToolNames = settledStream.successfulNestedToolNames;
		attemptUsage = settledStream.attemptUsage;
		cacheBreak = settledStream.cacheBreak;
		sessionRuntimeState.promptCache = settledStream.promptCache;
		const afterTurn = await completeEmbeddedAttemptAfterTurn({
			attempt,
			activeSession,
			sessionManager,
			withOwnedTranscriptWrite: input.sessionLock.withOwnedTranscriptWrite,
			activeContextEngine: input.activeContextEngine,
			readLifecycleState: () => {
				const terminal = readTerminal();
				return {
					aborted: terminal.aborted,
					timedOut: terminal.timedOut,
					idleTimedOut: terminal.idleTimedOut,
					timedOutDuringCompaction: terminal.timedOutDuringCompaction
				};
			},
			runtime: {
				effectiveWorkspace: input.setup.effectiveWorkspace,
				agentDir: input.agentDir,
				sessionAgentId: input.setup.sessionAgentId,
				resolveActiveContextEnginePluginId: input.resolveActiveContextEnginePluginId,
				shouldRecordCompletedBootstrapTurn,
				cacheTrace,
				anthropicPayloadLogger,
				hookAgentId,
				diagnosticTrace: input.diagnostics.diagnosticTrace,
				skillWorkshopAvailable: uncompactedEffectiveTools.some((tool) => tool.name === "skill_workshop"),
				hookRunner,
				promptStartedAt
			},
			state: {
				promptError: settledStream.promptError,
				yieldAborted,
				sessionIdUsed: settledStream.sessionIdUsed,
				sessionFileUsed,
				messagesSnapshot: settledStream.messagesSnapshot,
				nestedToolActivities,
				prePromptMessageCount: sessionRuntimeState.prePromptMessageCount,
				contextEngineAfterTurnCheckpoint: contextGuards.getAfterTurnCheckpoint(),
				lastCallUsage: settledStream.lastCallUsage,
				promptCache: settledStream.promptCache,
				...beforeAgentFinalizeRevisionReason ? { beforeAgentFinalizeRevisionReason } : {},
				compactionOccurredThisAttempt: settledStream.compactionOccurredThisAttempt
			}
		});
		if (sessionRuntimeState.currentTurnImageFailureCount > 0 && !activeSession.messages.some((message) => message.role === "custom" && message.customType === FAILED_PROMPT_MEDIA_NOTE_TYPE && asOptionalRecord(message.details)?.source === FAILED_PROMPT_MEDIA_NOTE_SOURCE && asOptionalRecord(message.details)?.runId === attempt.runId)) {
			const note = {
				role: "custom",
				customType: FAILED_PROMPT_MEDIA_NOTE_TYPE,
				content: buildPromptImageFailureNotice(sessionRuntimeState.currentTurnImageFailureCount),
				display: true,
				details: {
					source: FAILED_PROMPT_MEDIA_NOTE_SOURCE,
					runId: attempt.runId,
					failedMediaCount: sessionRuntimeState.currentTurnImageFailureCount
				},
				timestamp: Date.now()
			};
			await input.sessionLock.withOwnedTranscriptWrite(() => {
				const target = sessionManager.getSessionTarget();
				if (target) SessionManager.appendMessageToTranscript(target, note, attempt.config ? { config: attempt.config } : void 0);
				else sessionManager.appendMessage(note);
				activeSession.agent.state.messages = [...activeSession.messages, note];
			});
			messagesSnapshot = [...messagesSnapshot, note];
		}
		sessionIdUsed = afterTurn.sessionIdUsed;
		sessionFileUsed = afterTurn.sessionFileUsed;
	} finally {
		cleanupError = cleanupEmbeddedAttemptStreamExecution({
			attempt,
			clearAttemptTimeoutTimers,
			isProbeSession,
			queueHandle,
			state,
			unsubscribe,
			deferredLifecycleOwner: preparedStreamRuntime.stream.deferredLifecycleOwner
		});
	}
	if (cleanupError !== void 0) throw cleanupError;
	const beforeAgentFinalizeRevisionReason = getBeforeAgentFinalizeRevisionReason();
	const result = completeEmbeddedAttemptResult({
		attempt,
		subscription,
		state: {
			terminal: state.terminal,
			preflightRecovery,
			sessionIdUsed,
			sessionFileUsed,
			diagnosticTrace: input.diagnostics.diagnosticTrace,
			systemPromptReport,
			finalPromptText,
			messagesSnapshot,
			...beforeAgentFinalizeRevisionReason ? { beforeAgentFinalizeRevisionReason } : {},
			lastAssistant,
			currentAttemptAssistant,
			currentAttemptCompletedAssistant,
			codeModeRecoveryCandidate: getCodeModeRecoveryCandidate(),
			successfulNestedToolNames,
			attemptUsage,
			promptCache: sessionRuntimeState.promptCache,
			contextBudgetStatus,
			yieldDetected: input.lifecycle.readYieldState().yieldDetected,
			yieldAcknowledgment: input.lifecycle.readYieldState().yieldAcknowledgment,
			didDeliverSourceReplyViaMessageTool: hasDeliveredSourceReply()
		},
		clientToolCallSlots,
		hookRunner,
		hookAgentId,
		bootstrapPromptWarning,
		cache: {
			observabilityEnabled: cacheObservabilityEnabled,
			trace: cacheTrace,
			break: cacheBreak,
			changesForTurn: promptCacheChangesForTurn,
			streamStrategy
		},
		trajectoryRecorder,
		deferredLifecycleOwner: preparedStreamRuntime.stream.deferredLifecycleOwner
	});
	state.trajectoryEndRecorded = true;
	if (attempt.sessionKey && result.acceptedSessionSpawns?.length) {
		if (shouldContinueInteractiveAcceptedSessionSpawns({
			attempt: result,
			run: attempt
		})) {
			if (markRequesterTurnYielded({
				requesterSessionKey: attempt.sessionKey,
				requesterAgentId: input.setup.sessionAgentId,
				requesterTurnRunId: attempt.runId
			}) === 0) throw new Error("accepted continuation children were not durably registered");
		} else settleRequesterAfterSessionSpawns({
			requesterSessionKey: attempt.sessionKey,
			requesterAgentId: input.setup.sessionAgentId,
			requesterTurnRunId: attempt.runId,
			requesterYielded: result.yieldDetected === true,
			acceptedSessionSpawns: result.acceptedSessionSpawns
		});
	}
	return result;
}
//#endregion
//#region packages/markdown-core/src/code-spans.ts
/** Creates the carry-forward state used when scanning inline code across chunks. */
function createInlineCodeState() {
	return {
		open: false,
		ticks: 0
	};
}
/** Builds a lookup for fenced and inline code spans while preserving scanner state. */
function buildCodeSpanIndex(text, inlineState, fenceState) {
	const { spans: fenceSpans, state: nextFenceState } = scanFenceSpans(text, fenceState);
	const { spans: inlineSpans, state: nextInlineState } = parseInlineCodeSpans(text, fenceSpans, inlineState ? {
		open: inlineState.open,
		ticks: inlineState.ticks
	} : createInlineCodeState());
	return {
		inlineState: nextInlineState,
		fenceState: nextFenceState,
		isInside: (index) => isInsideFenceSpan(index, fenceSpans) || isInsideInlineSpan(index, inlineSpans)
	};
}
function parseInlineCodeSpans(text, fenceSpans, initialState) {
	const spans = [];
	let open = initialState.open;
	let ticks = initialState.ticks;
	let openStart = open ? 0 : -1;
	let i = 0;
	let fenceIndex = 0;
	while (i < text.length) {
		const fence = fenceSpans[fenceIndex];
		if (fence && i >= fence.start) {
			i = fence.end;
			fenceIndex += 1;
			continue;
		}
		if (text[i] !== "`") {
			i += 1;
			continue;
		}
		const runStart = i;
		let runLength = 0;
		while (i < text.length && text[i] === "`") {
			runLength += 1;
			i += 1;
		}
		if (!open) {
			open = true;
			ticks = runLength;
			openStart = runStart;
			continue;
		}
		if (runLength === ticks) {
			spans.push([openStart, i]);
			open = false;
			ticks = 0;
			openStart = -1;
		}
	}
	if (open) spans.push([openStart, text.length]);
	return {
		spans,
		state: {
			open,
			ticks
		}
	};
}
function isInsideFenceSpan(index, spans) {
	return spans.some((span) => index >= span.start && index < span.end);
}
function isInsideInlineSpan(index, spans) {
	return spans.some(([start, end]) => index >= start && index < end);
}
//#endregion
//#region src/agents/embedded-agent-runner/tool-send-receipts.ts
const registry$1 = createSessionManagerRuntimeRegistry();
function recordEmbeddedToolReceipt(sessionManager, toolCallId, details) {
	const receipts = registry$1.get(sessionManager) ?? /* @__PURE__ */ new Map();
	receipts.set(toolCallId, { details });
	registry$1.set(sessionManager, receipts);
}
function consumeEmbeddedToolReceipt(sessionManager, toolCallId) {
	const receipts = registry$1.get(sessionManager);
	const receipt = receipts?.get(toolCallId);
	if (!receipts || !receipt) return;
	receipts.delete(toolCallId);
	if (receipts.size === 0) registry$1.set(sessionManager, null);
	return receipt;
}
//#endregion
//#region src/agents/embedded-agent-subscribe.handlers.messages.replies.ts
/**
* Owns pending assistant reply directives and tool-media handoff.
*/
function hasReplyDirectiveMetadata(parsed) {
	return Boolean(parsed && (parsed.audioAsVoice || parsed.replyToId || parsed.replyToTag || parsed.replyToCurrent));
}
function mergeReplyDirectiveResults(first, second) {
	if (!first) return second ?? null;
	if (!second) return first;
	return {
		text: `${first.text ?? ""}${second.text ?? ""}`,
		replyToId: second.replyToId ?? first.replyToId,
		replyToCurrent: first.replyToCurrent || second.replyToCurrent,
		replyToTag: first.replyToTag || second.replyToTag,
		audioAsVoice: first.audioAsVoice || second.audioAsVoice || void 0,
		isSilent: first.isSilent || second.isSilent
	};
}
function clearPendingToolMedia(state) {
	state.pendingToolMediaUrls = [];
	state.pendingToolMediaAttachments = [];
	state.pendingToolMediaTrustByUrl.clear();
	state.pendingToolAudioAsVoice = false;
}
function hasReplyMedia(payload) {
	return (payload.mediaUrls ?? []).some((url) => url.trim().length > 0);
}
function readAlignedPendingToolMedia(state) {
	const seen = /* @__PURE__ */ new Set();
	const mediaUrls = [];
	const attachments = [];
	for (const [index, url] of state.pendingToolMediaUrls.entries()) {
		if (seen.has(url)) continue;
		seen.add(url);
		mediaUrls.push(url);
		const { trustedLocalMedia: _untrustedInput, ...attachment } = state.pendingToolMediaAttachments?.[index] ?? {};
		attachments.push({
			...attachment,
			...state.pendingToolMediaTrustByUrl.get(url) === true ? { trustedLocalMedia: true } : {}
		});
	}
	return {
		mediaUrls,
		attachments: attachments.some((entry) => Object.keys(entry).length > 0) ? attachments : void 0
	};
}
/** Moves queued tool media into a non-reasoning assistant reply payload. */
function consumePendingToolMediaIntoReply(state, payload) {
	if (payload.isReasoning) return payload;
	if (state.pendingToolMediaUrls.length === 0 && !state.pendingToolAudioAsVoice) return payload;
	if (hasReplyMedia(payload)) {
		const alignedPendingMedia = readAlignedPendingToolMedia(state);
		const metadataByUrl = new Map(alignedPendingMedia.mediaUrls.map((url, index) => [url, alignedPendingMedia.attachments?.[index] ?? {}]));
		const selectedAttachments = (payload.mediaUrls ?? []).map((url) => metadataByUrl.get(url.trim()) ?? {});
		const allSelectedMediaIsPending = (payload.mediaUrls?.length ?? 0) > 0 && (payload.mediaUrls ?? []).every((url) => metadataByUrl.has(url.trim()));
		const payloadWithMetadata = payload.attachments?.length || selectedAttachments.every((entry) => Object.keys(entry).length === 0) ? payload : {
			...payload,
			attachments: selectedAttachments
		};
		const selectedPayload = allSelectedMediaIsPending && (payload.mediaUrls ?? []).every((url) => state.pendingToolMediaTrustByUrl.get(url.trim()) === true) ? {
			...payloadWithMetadata,
			trustedLocalMedia: true
		} : payloadWithMetadata;
		clearPendingToolMedia(state);
		return selectedPayload;
	}
	const pendingMedia = readAlignedPendingToolMedia(state);
	const allPendingMediaTrusted = pendingMedia.mediaUrls.length > 0 && pendingMedia.mediaUrls.every((url) => state.pendingToolMediaTrustByUrl.get(url) === true);
	const mergedPayload = {
		...payload,
		mediaUrls: pendingMedia.mediaUrls.length ? pendingMedia.mediaUrls : void 0,
		attachments: pendingMedia.attachments,
		audioAsVoice: payload.audioAsVoice || state.pendingToolAudioAsVoice || void 0,
		...payload.trustedLocalMedia || allPendingMediaTrusted ? { trustedLocalMedia: true } : {}
	};
	clearPendingToolMedia(state);
	return mergedPayload;
}
/** Restores reserved tool media after its outbound delivery was rejected. */
function restorePendingToolMediaReply(state, payload) {
	const pendingUrls = state.pendingToolMediaUrls;
	const pendingAttachments = state.pendingToolMediaAttachments ?? [];
	const restoredUrls = payload.mediaUrls ?? [];
	const restoredAttachments = payload.attachments ?? [];
	const seen = new Set(restoredUrls);
	state.pendingToolMediaUrls = [...restoredUrls, ...pendingUrls.filter((url) => !seen.has(url))];
	state.pendingToolMediaAttachments = [...restoredUrls.map((_, index) => restoredAttachments[index] ?? {}), ...pendingUrls.flatMap((url, index) => seen.has(url) ? [] : [pendingAttachments[index] ?? {}])];
	for (const [index, url] of restoredUrls.entries()) if (payload.trustedLocalMedia || restoredAttachments[index]?.trustedLocalMedia) state.pendingToolMediaTrustByUrl.set(url, true);
	else if (!state.pendingToolMediaTrustByUrl.has(url)) state.pendingToolMediaTrustByUrl.set(url, false);
	state.pendingToolAudioAsVoice ||= payload.audioAsVoice === true;
	state.pendingToolMediaDeliveryFailed = true;
}
/** Reads queued tool media without clearing it. */
function readPendingToolMediaReply(state) {
	if (state.pendingToolMediaUrls.length === 0 && !state.pendingToolAudioAsVoice) return null;
	const pendingMedia = readAlignedPendingToolMedia(state);
	const allPendingMediaTrusted = pendingMedia.mediaUrls.length > 0 && pendingMedia.mediaUrls.every((url) => state.pendingToolMediaTrustByUrl.get(url) === true);
	return {
		mediaUrls: pendingMedia.mediaUrls.length ? pendingMedia.mediaUrls : void 0,
		attachments: pendingMedia.attachments,
		audioAsVoice: state.pendingToolAudioAsVoice || void 0,
		...allPendingMediaTrusted ? { trustedLocalMedia: true } : {}
	};
}
function recordPendingAssistantReplyDirectives(state, parsed) {
	if (!parsed || !hasReplyDirectiveMetadata(parsed)) return;
	const current = state.pendingAssistantReplyDirectives;
	state.pendingAssistantReplyDirectives = {
		audioAsVoice: current?.audioAsVoice || parsed.audioAsVoice || void 0,
		replyToId: parsed.replyToId ?? current?.replyToId,
		replyToTag: current?.replyToTag || parsed.replyToTag || void 0,
		replyToCurrent: current?.replyToCurrent || parsed.replyToCurrent || void 0
	};
}
/** Merges pending reply directives into one reply payload and clears them. */
function consumePendingAssistantReplyDirectivesIntoReply(state, payload) {
	if (payload.isReasoning || !state.pendingAssistantReplyDirectives) return payload;
	const pending = state.pendingAssistantReplyDirectives;
	state.pendingAssistantReplyDirectives = void 0;
	return {
		...payload,
		audioAsVoice: payload.audioAsVoice || pending.audioAsVoice || void 0,
		replyToId: payload.replyToId ?? pending.replyToId,
		replyToTag: Boolean(payload.replyToTag || pending.replyToTag) || void 0,
		replyToCurrent: Boolean(payload.replyToCurrent || pending.replyToCurrent) || void 0
	};
}
/** True when a reply payload has text, media, or voice content worth sending. */
function hasAssistantVisibleReply(params) {
	return resolveSendableOutboundReplyParts(params).hasContent || Boolean(params.audioAsVoice);
}
/** Exact tool-owned media that the managed WebChat pipeline may hide from display text. */
function resolveManagedStreamMediaUrls(state, mediaUrls) {
	return uniqueStrings(mediaUrls.filter((url) => state.pendingToolMediaTrustByUrl.get(url.trim()) === true));
}
//#endregion
//#region src/agents/embedded-agent-subscribe.handlers.compaction.ts
/**
* Handles embedded-agent compaction lifecycle events. The handlers pause
* liveness, emit agent events, run hooks, reconcile persisted counts, and
* clear stale usage after compaction rewrites history.
*/
function normalizeCompactionReason(reason) {
	return reason === "manual" || reason === "threshold" || reason === "overflow" ? reason : "threshold";
}
function emitCompactionAgentEvent(ctx, data) {
	const event = {
		stream: "compaction",
		data
	};
	emitAgentEvent({
		runId: ctx.params.runId,
		...event
	});
	runBestEffortCallback({
		label: "compaction agent event",
		log: ctx.log,
		callback: () => ctx.params.onAgentEvent?.(event)
	});
}
function runBestEffortCompactionHook(ctx, phase) {
	if (ctx.state.unsubscribed || ctx.params.isTerminalAborted?.()) return;
	const hookRunner = getGlobalHookRunner();
	const hookName = phase === "before" ? "before_compaction" : "after_compaction";
	if (!hookRunner?.hasHooks(hookName)) return;
	const metrics = {
		messageCount: ctx.params.session.messages?.length ?? 0,
		sessionFile: ctx.params.session.sessionFile
	};
	const context = { sessionKey: ctx.params.sessionKey };
	(phase === "before" ? hookRunner.runBeforeCompaction({
		...metrics,
		messages: ctx.params.session.messages
	}, context) : hookRunner.runAfterCompaction({
		...metrics,
		compactedCount: ctx.getCompactionCount()
	}, context)).catch((err) => {
		ctx.log.warn(`${hookName} hook failed: ${String(err)}`);
	});
}
/** Handles compaction start events from an embedded agent session. */
function handleCompactionStart(ctx, evt) {
	const reason = normalizeCompactionReason(evt.reason);
	const kind = reason === "manual" ? "manual compaction" : "auto-compaction";
	ctx.state.compactionInFlight = true;
	ctx.state.livenessState = "paused";
	ctx.ensureCompactionPromise();
	ctx.log.info(`embedded run ${kind} start`, {
		event: "embedded_run_compaction_start",
		runId: ctx.params.runId,
		reason,
		consoleMessage: `embedded run ${kind} start: runId=${ctx.params.runId} reason=${reason}`
	});
	emitCompactionAgentEvent(ctx, {
		phase: "start",
		...evt.itemId ? { itemId: evt.itemId } : {}
	});
	runBestEffortCompactionHook(ctx, "before");
}
/** Handles compaction completion, retry, and incomplete events. */
function handleCompactionEnd(ctx, evt) {
	const reason = evt.reason;
	const kind = reason === "manual" ? "manual compaction" : "auto-compaction";
	const outcome = evt.outcome;
	ctx.state.compactionInFlight = false;
	const completed = outcome.status === "completed";
	const willRetry = completed && outcome.willRetry;
	if (completed) {
		ctx.incrementCompactionCount();
		ctx.noteCompactionTokensAfter(outcome.tokensAfter);
		const observedCompactionCount = ctx.getCompactionCount();
		if (ctx.params.sessionPersistence !== "detached") recordSessionCompacted({
			sessionKey: ctx.params.sessionKey,
			operationId: `${ctx.params.runId}:${observedCompactionCount}`,
			agentId: ctx.params.agentId,
			runId: ctx.params.runId
		});
		ctx.log.info(`embedded run ${kind} complete`, {
			event: "embedded_run_compaction_end",
			runId: ctx.params.runId,
			reason,
			completed: true,
			willRetry,
			compactionCount: observedCompactionCount,
			consoleMessage: `embedded run ${kind} complete: runId=${ctx.params.runId} reason=${reason} compactionCount=${observedCompactionCount} willRetry=${willRetry}`
		});
		if (ctx.params.compactionCountOwner !== "caller" && ctx.params.sessionPersistence !== "detached") import("./embedded-agent-subscribe.handlers.compaction.runtime.js").then(({ default: reconcile }) => reconcile({
			sessionKey: ctx.params.sessionKey,
			agentId: ctx.params.agentId,
			configStore: ctx.params.config?.session?.store,
			observedCompactionCount
		})).catch((err) => {
			ctx.log.warn(`late compaction count reconcile failed: ${String(err)}`);
		});
	}
	if (willRetry) {
		ctx.noteCompactionRetry();
		ctx.resetForCompactionRetry();
		ctx.log.debug(`embedded run compaction retry: runId=${ctx.params.runId}`);
	} else {
		if (outcome.status !== "aborted") ctx.state.livenessState = "working";
		ctx.maybeResolveCompactionWait();
		const messages = ctx.params.session.messages;
		if (completed && Array.isArray(messages)) stripStaleAssistantUsageBeforeLatestCompaction(messages, {
			mutate: true,
			whenMissingCompactionSummary: "zeroAssistantUsage"
		});
	}
	const outcomeReason = outcome.status === "skipped" || outcome.status === "failed" ? outcome.reason : void 0;
	if (!completed) {
		const reasonClass = outcomeReason ? classifyCompactionReason(outcomeReason) : "aborted";
		const reasonDetail = reasonClass === "unknown" ? formatUnknownCompactionReasonDetail(outcomeReason) : void 0;
		const metadata = {
			event: "embedded_run_compaction_end",
			runId: ctx.params.runId,
			reason,
			outcome: outcome.status,
			completed: false,
			willRetry: false,
			reasonClass,
			...outcomeReason ? { outcomeReason } : {},
			...reasonDetail ? { reasonDetail } : {},
			consoleMessage: `embedded run ${kind} ${outcome.status}: runId=${ctx.params.runId} reason=${reasonClass}${reasonDetail ? ` detail=${reasonDetail}` : ""}`
		};
		if (outcome.status === "aborted" || outcome.status === "skipped" && (reasonClass === "no_compactable_entries" || reasonClass === "below_threshold" || reasonClass === "already_compacted")) ctx.log.info(`embedded run ${kind} ${outcome.status}`, metadata);
		else ctx.log.warn(`embedded run ${kind} ${outcome.status}`, metadata);
	}
	emitCompactionAgentEvent(ctx, {
		phase: "end",
		...evt.itemId ? { itemId: evt.itemId } : {},
		completed,
		willRetry,
		outcome: outcome.status,
		...outcomeReason ? { reason: outcomeReason } : {}
	});
	if (completed && !willRetry) runBestEffortCompactionHook(ctx, "after");
}
//#endregion
//#region src/agents/embedded-agent-subscribe.handlers.lifecycle.ts
/**
* Handles lifecycle and compaction events from subscribed embedded-agent sessions.
*/
function handleAgentStart(ctx) {
	ctx.log.debug(`embedded run agent start: runId=${ctx.params.runId}`);
	const data = {
		phase: "start",
		startedAt: Date.now()
	};
	emitAgentEvent({
		runId: ctx.params.runId,
		...ctx.params.sessionKey ? { sessionKey: ctx.params.sessionKey } : {},
		...ctx.params.sessionId ? { sessionId: ctx.params.sessionId } : {},
		...ctx.params.agentId ? { agentId: ctx.params.agentId } : {},
		...ctx.params.lifecycleGeneration ? { lifecycleGeneration: ctx.params.lifecycleGeneration } : {},
		stream: "lifecycle",
		data
	});
	runBestEffortCallback({
		label: "lifecycle agent event",
		log: ctx.log,
		callback: () => ctx.params.onAgentEvent?.({
			stream: "lifecycle",
			data
		})
	});
}
function handleAgentEnd(ctx, evt) {
	ctx.state.liveEditDiffStateById.clear();
	const lastAssistant = ctx.state.lastAssistant;
	const isError = isAssistantMessage(lastAssistant) && lastAssistant.stopReason === "error";
	let lifecycleErrorText;
	let errorObservation;
	const hasStreamedAssistantVisibleText = Array.isArray(ctx.state.assistantTexts) && ctx.state.assistantTexts.some((text) => hasAssistantVisibleReply({ text }));
	const completedAssistantFallbackText = isAssistantMessage(lastAssistant) && lastAssistant.stopReason !== "error" && lastAssistant.stopReason !== "aborted" ? resolveFinalAssistantVisibleText(lastAssistant) : void 0;
	const hasAssistantVisibleText = hasStreamedAssistantVisibleText || hasAssistantVisibleReply({ text: completedAssistantFallbackText ?? "" });
	const hadLivenessPreservingSideEffect = ctx.state.hadDeterministicSideEffect === true || hasCommittedMessagingToolDeliveryEvidence(ctx.state) || hasAcceptedSessionSpawn(ctx.state.acceptedSessionSpawns) || (ctx.state.successfulCronAdds ?? 0) > 0;
	const deferredMediaUrls = ctx.state.deferredBlockReplies.flatMap((payload) => payload.mediaUrls ?? []);
	const hasTerminalOutput = hasAttemptTerminalState({
		yieldDetected: ctx.state.yielded,
		didSendDeterministicApprovalPrompt: ctx.state.deterministicApprovalPromptSent,
		heartbeatToolResponse: ctx.state.heartbeatToolResponse,
		lastToolError: ctx.state.lastToolError,
		toolMediaUrls: [...ctx.state.pendingToolMediaUrls, ...deferredMediaUrls],
		toolAudioAsVoice: ctx.state.pendingToolAudioAsVoice || ctx.state.deferredBlockReplies.some((payload) => payload.audioAsVoice),
		toolTrustedLocalMedia: resolveTerminalToolMediaTrust({
			pendingMediaUrls: ctx.state.pendingToolMediaUrls,
			pendingTrustByUrl: ctx.state.pendingToolMediaTrustByUrl,
			deferredReplies: ctx.state.deferredBlockReplies
		}),
		hasToolMediaBlockReply: ctx.state.hasToolMediaBlockReply,
		didDeliverSourceReplyViaMessageTool: ctx.state.messageToolOnlySourceReplyDelivered || ctx.params.hasDeliveredMessageToolOnlySourceReply?.() === true,
		messagingToolSourceReplyPayloads: ctx.state.messagingToolSourceReplyPayloads,
		messagingToolSentTexts: ctx.state.messagingToolSentTexts,
		messagingToolSentMediaUrls: ctx.state.messagingToolSentMediaUrls,
		messagingToolSentTargets: ctx.state.messagingToolSentTargets,
		successfulCronAdds: ctx.state.successfulCronAdds,
		acceptedSessionSpawns: ctx.state.acceptedSessionSpawns,
		toolMetas: ctx.state.toolMetas
	});
	const hadBeforeFinalizeSideEffect = hadLivenessPreservingSideEffect || ctx.state.replayState.hadPotentialSideEffects;
	const incompleteTerminalAssistant = isIncompleteTerminalAssistantTurn({
		hasAssistantVisibleText,
		hasTerminalOutput,
		lastAssistant: isAssistantMessage(lastAssistant) ? lastAssistant : null
	});
	const replayInvalid = ctx.state.replayState.replayInvalid || incompleteTerminalAssistant ? true : void 0;
	const derivedWorkingTerminalState = isError ? "blocked" : replayInvalid && !hadLivenessPreservingSideEffect && (!hasAssistantVisibleText || incompleteTerminalAssistant) ? "abandoned" : ctx.state.livenessState;
	const livenessState = ctx.state.livenessState === "working" ? derivedWorkingTerminalState : ctx.state.livenessState;
	if (isError && lastAssistant) {
		const rawError = lastAssistant.errorMessage?.trim();
		const failoverReason = classifyAssistantFailoverReason(lastAssistant, { providerOwner: ctx.params.providerOwner ?? null });
		const errorText = formatUserFacingAssistantErrorText(lastAssistant, {
			cfg: ctx.params.config,
			sessionKey: ctx.params.sessionKey,
			agentId: ctx.params.agentId,
			provider: lastAssistant.provider,
			model: lastAssistant.model,
			providerOwner: ctx.params.providerOwner
		});
		const observedError = buildApiErrorObservationFields(rawError, {
			provider: lastAssistant.provider,
			providerOwner: ctx.params.providerOwner
		});
		const safeErrorText = buildTextObservationFields(errorText, { provider: lastAssistant.provider }).textPreview ?? "LLM request failed.";
		lifecycleErrorText = safeErrorText;
		errorObservation = projectChatErrorDetail({
			provider: lastAssistant.provider,
			model: lastAssistant.model,
			failoverReason,
			...observedError,
			httpStatus: observedError.httpCode ? Number(observedError.httpCode) : void 0
		});
		const safeRunId = sanitizeForConsole(ctx.params.runId) ?? "-";
		const safeModel = sanitizeForConsole(lastAssistant.model) ?? "unknown";
		const safeProvider = sanitizeForConsole(lastAssistant.provider) ?? "unknown";
		const safeRawErrorPreview = sanitizeForConsole(observedError.rawErrorPreview);
		const rawErrorConsoleSuffix = safeRawErrorPreview && !shouldSuppressRawErrorConsoleSuffix(observedError.providerRuntimeFailureKind) ? ` rawError=${safeRawErrorPreview}` : "";
		ctx.log.warn("embedded run agent end", {
			event: "embedded_run_agent_end",
			tags: [
				"error_handling",
				"lifecycle",
				"agent_end",
				"assistant_error"
			],
			runId: ctx.params.runId,
			isError: true,
			error: safeErrorText,
			failoverReason,
			model: lastAssistant.model,
			provider: lastAssistant.provider,
			...observedError,
			consoleMessage: `embedded run agent end: runId=${safeRunId} isError=true model=${safeModel} provider=${safeProvider} error=${safeErrorText}${rawErrorConsoleSuffix}`
		});
	} else ctx.log.debug(`embedded run agent end: runId=${ctx.params.runId} isError=${isError}`);
	const emitLifecycleTerminal = () => {
		const terminalStopReason = ctx.params.resolveTerminalStopReason?.() ?? ctx.state.terminalStopReason ?? (!isError && isAssistantMessage(lastAssistant) ? lastAssistant.stopReason : void 0);
		const terminalAborted = typeof ctx.state.terminalAborted === "boolean" ? ctx.state.terminalAborted : ctx.params.isTerminalAborted?.();
		const toolErrorSummary = terminalAborted === true && ctx.state.lastToolError ? summarizeToolValidationError(ctx.state.lastToolError) : void 0;
		const terminalMeta = {
			...errorObservation ? { errorObservation } : {},
			...terminalStopReason ? { stopReason: terminalStopReason } : {},
			...ctx.state.yielded === true ? { yielded: true } : {},
			...ctx.state.timeoutPhase ? { timeoutPhase: ctx.state.timeoutPhase } : {},
			...typeof ctx.state.providerStarted === "boolean" ? { providerStarted: ctx.state.providerStarted } : {},
			...typeof terminalAborted === "boolean" ? { aborted: terminalAborted } : {},
			...toolErrorSummary ? { toolErrorSummary } : {}
		};
		const phase = ctx.params.terminalLifecyclePhase === "finishing" ? "finishing" : isError ? "error" : "end";
		const errorData = isError ? { error: lifecycleErrorText ?? "LLM request failed." } : {};
		emitAgentEvent({
			runId: ctx.params.runId,
			...ctx.params.sessionKey ? { sessionKey: ctx.params.sessionKey } : {},
			...ctx.params.sessionId ? { sessionId: ctx.params.sessionId } : {},
			...ctx.params.agentId ? { agentId: ctx.params.agentId } : {},
			...ctx.params.lifecycleGeneration ? { lifecycleGeneration: ctx.params.lifecycleGeneration } : {},
			stream: "lifecycle",
			data: {
				phase,
				...errorData,
				...terminalMeta,
				...livenessState ? { livenessState } : {},
				...replayInvalid ? { replayInvalid } : {},
				endedAt: Date.now()
			}
		});
		runBestEffortCallback({
			label: "lifecycle agent event",
			log: ctx.log,
			callback: () => ctx.params.onAgentEvent?.({
				stream: "lifecycle",
				data: {
					phase,
					...errorData,
					...terminalMeta,
					...livenessState ? { livenessState } : {},
					...replayInvalid ? { replayInvalid } : {}
				}
			})
		});
	};
	const finalizeAgentEnd = () => {
		ctx.state.blockState.thinking = false;
		ctx.state.blockState.final = false;
		ctx.state.blockState.inlineCode = createInlineCodeState();
		ctx.state.blockState.fence = void 0;
		ctx.state.blockState.reasoningPendingFenceFragment = void 0;
		ctx.state.blockState.pendingFenceFragment = void 0;
		if (ctx.state.pendingCompactionRetry > 0) ctx.resolveCompactionRetry();
		else ctx.maybeResolveCompactionWait();
	};
	const flushPendingMediaAndChannel = () => {
		if (ctx.params.onBlockReply && !ctx.state.pendingToolMediaDeliveryFailed) {
			const pendingToolMediaReply = readPendingToolMediaReply(ctx.state);
			if (pendingToolMediaReply && hasAssistantVisibleReply(pendingToolMediaReply)) ctx.emitBlockReply(pendingToolMediaReply);
		}
		const postMediaFlushResult = ctx.flushBlockReplyBuffer();
		if (isPromiseLike(postMediaFlushResult)) return postMediaFlushResult.then(() => {
			const onBlockReplyFlushResult = ctx.params.onBlockReplyFlush?.({ reason: "terminal" });
			if (isPromiseLike(onBlockReplyFlushResult)) return onBlockReplyFlushResult;
		});
		const onBlockReplyFlushResult = ctx.params.onBlockReplyFlush?.({ reason: "terminal" });
		if (isPromiseLike(onBlockReplyFlushResult)) return onBlockReplyFlushResult;
	};
	const runBeforeTerminalDelivery = () => {
		const result = ctx.params.onBeforeTerminalDelivery?.({
			messages: evt?.messages ?? [],
			willRetry: evt?.willRetry === true,
			...evt?.assistantEntryId ? { assistantEntryId: evt.assistantEntryId } : {},
			...lastAssistant ? { lastAssistant } : {},
			assistantTexts: ctx.state.assistantTexts,
			hasAssistantVisibleText,
			isError,
			incompleteTerminalAssistant,
			hadDeterministicSideEffect: hadBeforeFinalizeSideEffect
		});
		if (isPromiseLike(result)) return result;
		return result;
	};
	const deliverTerminal = () => {
		ctx.state.deferBlockReplyDelivery = false;
		ctx.flushAssistantStream();
		ctx.flushDeferredBlockReplies();
		const flushBlockReplyBufferResult = ctx.flushBlockReplyBuffer({ final: true });
		finalizeAgentEnd();
		const flushPendingMediaAndChannelResult = isPromiseLike(flushBlockReplyBufferResult) ? Promise.resolve(flushBlockReplyBufferResult).then(() => flushPendingMediaAndChannel()) : flushPendingMediaAndChannel();
		if (isPromiseLike(flushPendingMediaAndChannelResult)) return Promise.resolve(flushPendingMediaAndChannelResult).then(() => emitLifecycleTerminalOnce(), (error) => {
			const emitted = emitLifecycleTerminalOnce();
			if (isPromiseLike(emitted)) return Promise.resolve(emitted).then(() => {
				throw error;
			});
			throw error;
		});
		return emitLifecycleTerminalOnce();
	};
	const deliverTerminalWithLifecycleErrorFallback = () => {
		try {
			return deliverTerminal();
		} catch (error) {
			const emitted = emitLifecycleTerminalOnce();
			if (isPromiseLike(emitted)) return Promise.resolve(emitted).then(() => {
				throw error;
			});
			throw error;
		}
	};
	const suppressTerminalDelivery = () => {
		ctx.clearAssistantStream();
		ctx.clearDeferredBlockReplies();
		finalizeAgentEnd();
	};
	let lifecycleTerminalEmitted = false;
	const emitLifecycleTerminalOnce = () => {
		if (lifecycleTerminalEmitted) return;
		lifecycleTerminalEmitted = true;
		let beforeLifecycleTerminal = void 0;
		try {
			beforeLifecycleTerminal = ctx.params.onBeforeLifecycleTerminal?.();
		} catch (err) {
			ctx.log.debug(`before lifecycle terminal failed: ${String(err)}`);
		}
		if (isPromiseLike(beforeLifecycleTerminal)) return Promise.resolve(beforeLifecycleTerminal).catch((err) => {
			ctx.log.debug(`before lifecycle terminal failed: ${String(err)}`);
		}).then(() => {
			emitLifecycleTerminal();
		});
		emitLifecycleTerminal();
	};
	let beforeTerminalDelivery;
	try {
		beforeTerminalDelivery = runBeforeTerminalDelivery();
	} catch (error) {
		ctx.log.warn(`before terminal delivery failed: ${String(error)}`);
		return deliverTerminalWithLifecycleErrorFallback();
	}
	if (isPromiseLike(beforeTerminalDelivery)) return Promise.resolve(beforeTerminalDelivery).catch((error) => {
		ctx.log.warn(`before terminal delivery failed: ${String(error)}`);
	}).then((decision) => {
		if (decision?.suppressTerminalDelivery === true) {
			suppressTerminalDelivery();
			return;
		}
		return deliverTerminalWithLifecycleErrorFallback();
	});
	if (beforeTerminalDelivery?.suppressTerminalDelivery === true) {
		suppressTerminalDelivery();
		return;
	}
	return deliverTerminalWithLifecycleErrorFallback();
}
function resolveTerminalToolMediaTrust(params) {
	const trust = [...params.pendingMediaUrls.map((url) => params.pendingTrustByUrl.get(url.trim()) === true), ...params.deferredReplies.flatMap((payload) => (payload.mediaUrls ?? []).map(() => payload.trustedLocalMedia === true))];
	return trust.length > 0 && trust.every(Boolean);
}
//#endregion
//#region src/agents/embedded-agent-subscribe.handlers.messages.stream.ts
/**
* Projects provider assistant messages into ordered visible stream state.
*/
function extractAssistantStreamSnapshot(ctx, message) {
	const state = {
		thinking: false,
		final: false,
		inlineCode: createInlineCodeState()
	};
	let rawText = "";
	const parts = [];
	return {
		text: extractAssistantVisibleText(message, (part, final, phase, index) => {
			const separator = rawText && !state.pendingTagFragment && !state.pendingFenceFragment ? "\n" : "";
			parts.push({
				text: part,
				separator,
				offset: rawText.length + separator.length,
				index
			});
			rawText += `${separator}${part}`;
			return phase === "final_answer" && !ctx.params.enforceFinalTag ? part : ctx.stripBlockTags(`${separator}${part}`, state, { final });
		}),
		rawText,
		state,
		parts
	};
}
function isSubscribeTranscriptOnlyOpenClawAssistantMessage(message) {
	if (!message || message.role !== "assistant") return false;
	const provider = normalizeOptionalString(message.provider) ?? "";
	const model = normalizeOptionalString(message.model) ?? "";
	return provider === "openclaw" && (model === "delivery-mirror" || model === "gateway-injected");
}
const RESPONSES_API_IDS = /* @__PURE__ */ new Set([
	"openai-responses",
	"openai-chatgpt-responses",
	"azure-openai-responses",
	"openclaw-openai-responses-transport",
	"openclaw-openai-chatgpt-responses-transport",
	"openclaw-azure-openai-responses-transport"
]);
function isResponsesApiAssistantMessage(message) {
	if (!message || message.role !== "assistant") return false;
	const api = normalizeOptionalString(message.api) ?? "";
	return RESPONSES_API_IDS.has(api);
}
function isAnthropicAssistantMessage(message) {
	if (!message || message.role !== "assistant") return false;
	return (normalizeOptionalString(message.api) ?? "") === "anthropic-messages";
}
function isOpenAiCompletionsAssistantMessage(message) {
	if (!message || message.role !== "assistant") return false;
	const api = normalizeOptionalString(message.api) ?? "";
	return api === "openai-completions" || api === "openclaw-openai-completions-transport";
}
function extractStandaloneMessageToolText(text, params = {}) {
	try {
		if (!params.allowCurrentSourceReply && !params.allowRoutedReply) return;
		const trimmed = text.trim();
		if (!trimmed.startsWith("{")) return;
		const record = asOptionalRecord(JSON.parse(trimmed));
		const args = asOptionalRecord(record?.arguments);
		const hasRoute = Boolean(normalizeOptionalString(args?.target) || normalizeOptionalString(args?.to) || normalizeOptionalString(args?.channel) || normalizeOptionalString(args?.accountId) || Array.isArray(args?.targets));
		if (normalizeOptionalString(record?.name) !== "message" || normalizeOptionalString(args?.action) !== "send" || (hasRoute ? !params.allowRoutedReply : !params.allowCurrentSourceReply)) return;
		return normalizeOptionalString(args?.message);
	} catch {
		return;
	}
}
function resolveAssistantStreamItemId(params) {
	const content = params.message?.content;
	if (!Array.isArray(content)) return;
	const contentIndex = typeof params.contentIndex === "number" && Number.isInteger(params.contentIndex) && params.contentIndex >= 0 ? params.contentIndex : void 0;
	const indexedBlock = contentIndex !== void 0 ? content[contentIndex] : void 0;
	const hasIndexedTextBlock = (indexedBlock && typeof indexedBlock === "object" ? indexedBlock : void 0)?.type === "text";
	const candidateStart = hasIndexedTextBlock && contentIndex !== void 0 ? contentIndex : content.length - 1;
	const candidateEnd = hasIndexedTextBlock ? candidateStart : 0;
	for (let index = candidateStart; index >= candidateEnd; index -= 1) {
		const block = content[index];
		if (!block || typeof block !== "object") continue;
		const record = block;
		if (record.type !== "text") continue;
		const signature = parseAssistantTextSignature(record);
		if (signature?.id) return signature.id;
	}
}
function resolveAssistantStreamContentIndex(value) {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : void 0;
}
function scopeAssistantMessageToStreamBlock(message, contentIndex, itemId) {
	if (!Array.isArray(message.content)) return message;
	const indexedBlock = contentIndex === void 0 ? void 0 : message.content[contentIndex];
	let block = indexedBlock && typeof indexedBlock === "object" && indexedBlock.type === "text" ? indexedBlock : void 0;
	if (!block && itemId) for (let index = message.content.length - 1; index >= 0; index -= 1) {
		const candidate = message.content[index];
		if (candidate && typeof candidate === "object" && candidate.type === "text" && parseAssistantTextSignature(candidate)?.id === itemId) {
			block = candidate;
			break;
		}
	}
	if (!block) return message;
	return {
		...message,
		content: [block]
	};
}
function emitAssistantCommentaryStreamData(ctx, message, finalMessage = false) {
	const isResponsesCommentary = isResponsesApiAssistantMessage(message);
	const { lastAssistantStreamContentIndex: index, lastAssistantStreamItemId: itemId } = ctx.state;
	const commentaryMessage = isResponsesCommentary ? scopeAssistantMessageToStreamBlock(message, index, itemId) : message;
	const text = extractAssistantCommentaryText(commentaryMessage);
	if (text && (finalMessage || !isResponsesCommentary || ctx.state.deltaBuffer !== text)) {
		const commentaryItemId = isResponsesCommentary ? itemId : resolveAssistantStreamItemId({ message });
		ctx.emitAssistantStreamData({
			text,
			delta: "",
			replace: true,
			phase: "commentary",
			itemId: commentaryItemId
		}, { finalMessage });
	}
}
function emitReasoningEnd(ctx) {
	if (!ctx.state.reasoningStreamOpen) return;
	ctx.flushAssistantStream();
	ctx.state.reasoningStreamOpen = false;
	runBestEffortCallback({
		label: "reasoning end",
		log: ctx.log,
		callback: () => ctx.params.onReasoningEnd?.()
	});
}
function emitAssistantMessageStart(ctx) {
	ctx.flushAssistantStream();
	runBestEffortCallback({
		label: "assistant message start",
		log: ctx.log,
		callback: () => ctx.params.onAssistantMessageStart?.()
	});
}
function openReasoningStream(ctx) {
	if (!ctx.state.reasoningStreamOpen) ctx.flushAssistantStream();
	ctx.state.reasoningStreamOpen = true;
}
function shouldSuppressDeterministicApprovalOutput(state) {
	return state.deterministicApprovalPromptPending || state.deterministicApprovalPromptSent;
}
function hasMessageToolOnlySourceDelivery(ctx) {
	return ctx.params.sourceReplyDeliveryMode === "message_tool_only" && (ctx.state.messageToolOnlySourceReplyDelivered || ctx.params.hasDeliveredMessageToolOnlySourceReply?.() === true || (ctx.state.messagingToolSourceReplyPayloads?.length ?? 0) > 0);
}
function resolveCurrentSourceMessagingToolPartial(state, params) {
	const held = state.currentSourceMessagingToolHeldPartial;
	const text = held && params.evtType === "text_delta" && !params.text.startsWith(held) ? `${held}${params.visibleDelta || params.text}` : params.text;
	const normalized = state.currentSourceMessagingToolSentTextsNormalized.length ? normalizeTextForComparison(text) : "";
	if (!normalized) {
		state.currentSourceMessagingToolHeldPartial = void 0;
		return {
			hold: false,
			text
		};
	}
	const hold = state.currentSourceMessagingToolSentTextsNormalized.some((sentText) => sentText === normalized || sentText.startsWith(normalized));
	state.currentSourceMessagingToolHeldPartial = hold ? text : void 0;
	return {
		hold,
		text
	};
}
function replaceBlockReplyBuffer(ctx, text, sourceOffset = 0) {
	if (ctx.blockChunker.consumedLength === 0) ctx.resetBlockReplyDirectives();
	ctx.blockChunker.replace(text, sourceOffset);
}
function resolveAssistantTextChunk(params) {
	const { evtType, delta, content, accumulatedText } = params;
	if (evtType === "text_delta" || delta) return delta;
	if (!content) return "";
	if (content.startsWith(accumulatedText)) return content.slice(accumulatedText.length);
	if (accumulatedText.startsWith(content)) return "";
	if (!accumulatedText.includes(content)) return content;
	return "";
}
function resolveStreamingReply(params) {
	if (!params.parsedStreamDirectives && params.evtType === "text_delta") {
		const text = params.previousCleaned;
		return {
			text,
			delta: "",
			replace: false,
			hasText: Boolean(text.trim())
		};
	}
	let text;
	let delta;
	let isAppend = false;
	if (params.evtType !== "text_end" && params.parsedStreamDirectives && !params.parsedStreamDirectives.isSilent && !hasReplyDirectiveMetadata(params.parsedStreamDirectives) && !/(?:^|\n)\s*MEDIA:\s*\S[^\n]*(?:\n|$)/i.test(params.visibleDelta) && params.parsedStreamDirectives.text === params.visibleDelta && params.appendDelta !== null && params.previousText === params.previousCleaned) {
		text = params.next;
		delta = params.appendDelta;
		isAppend = true;
	}
	text ??= parseReplyDirectives(params.evtType === "text_end" ? params.next : splitTrailingDirective(params.next).text).text;
	const replace = Boolean(!isAppend && params.previousCleaned && !text.startsWith(params.previousCleaned));
	return {
		text,
		delta: replace ? "" : delta ?? text.slice(params.previousCleaned.length),
		replace,
		hasText: Boolean(isAppend ? text : text.trim())
	};
}
//#endregion
//#region src/agents/embedded-agent-subscribe.raw-stream.ts
/**
* Appends raw embedded-agent stream payloads for diagnostics when enabled.
*/
let rawStreamReady = false;
function isRawStreamEnabled() {
	return isTruthyEnvValue(process.env.OPENCLAW_RAW_STREAM);
}
function resolveRawStreamPath() {
	return process.env.OPENCLAW_RAW_STREAM_PATH?.trim() || path.join(resolveStateDir(), "logs", "raw-stream.jsonl");
}
function appendRawStream(createPayload) {
	if (!isRawStreamEnabled()) return;
	const rawStreamPath = resolveRawStreamPath();
	if (!rawStreamReady) {
		rawStreamReady = true;
		try {
			fs.mkdirSync(path.dirname(rawStreamPath), { recursive: true });
		} catch {}
	}
	try {
		appendRegularFile({
			filePath: rawStreamPath,
			content: `${JSON.stringify(createPayload())}\n`,
			rejectSymlinkParents: true
		}).catch(() => {});
	} catch {}
}
//#endregion
//#region src/shared/text/assistant-transcript-role-headers.ts
/** Detect transcript-role headers in assistant Markdown through the canonical parser. */
function detectAssistantTranscriptRoleHeaderText(text) {
	if (!text.includes("[") && !text.includes("<") && !text.includes("&")) return null;
	const annotation = markdownToIR(text, {
		assistantTranscriptRoleHeaders: true,
		enableSpoilers: true,
		linkify: false,
		tableMode: "off"
	}).annotations?.[0];
	if (!annotation || annotation.type !== "assistant_transcript_role") return null;
	return {
		kind: annotation.kind,
		role: annotation.role
	};
}
//#endregion
//#region src/shared/text/tool-call-shaped-text.ts
const TOOL_TEXT_PREFILTER_RE = /(?:tool[_\s-]?calls?|function[_\s-]?call|["'](?:name|tool_name|function|arguments|args|input|parameters|tool_calls)["']|<\s*tool_call\b|Action\s*:|\[END_TOOL_REQUEST\])/i;
const MAX_SCAN_CHARS = 2e4;
const MAX_JSON_CANDIDATES = 20;
const MAX_JSON_CANDIDATE_CHARS = 8e3;
function readToolName(record) {
	return normalizeOptionalString(record.name) ?? normalizeOptionalString(record.tool_name) ?? normalizeOptionalString(record.tool) ?? normalizeOptionalString(record.function_name);
}
function hasToolArgs(record) {
	return "arguments" in record || "args" in record || "input" in record || "parameters" in record;
}
function classifyJsonValue(value) {
	if (Array.isArray(value)) {
		for (const item of value) {
			const detection = classifyJsonValue(item);
			if (detection) return detection;
		}
		return null;
	}
	const record = asOptionalRecord(value);
	if (!record) return null;
	const toolCalls = record.tool_calls ?? record.toolCalls;
	if (Array.isArray(toolCalls)) {
		for (const toolCall of toolCalls) {
			const detection = classifyJsonValue(toolCall);
			if (detection) return detection;
		}
		return { kind: "json_tool_call" };
	}
	const functionRecord = asOptionalRecord(record.function);
	if (functionRecord) {
		const toolName = readToolName(functionRecord);
		if (toolName && hasToolArgs(functionRecord)) return {
			kind: "json_tool_call",
			toolName
		};
	}
	const toolName = readToolName(record);
	if (toolName && hasToolArgs(record)) return {
		kind: "json_tool_call",
		toolName
	};
	const type = normalizeOptionalString(record.type)?.toLowerCase();
	if (toolName && (type === "tool_call" || type === "toolcall" || type === "tooluse" || type === "tool_use" || type === "function_call" || type === "functioncall")) return {
		kind: "json_tool_call",
		toolName
	};
	return null;
}
function collectFencedJsonCandidates(text) {
	const candidates = [];
	for (const match of text.matchAll(/```(?:json|tool|tool_call|function_call)?[^\n\r]*[\r\n]([\s\S]*?)```/gi)) {
		const candidate = match[1]?.trim();
		if (candidate && candidate.length <= MAX_JSON_CANDIDATE_CHARS) candidates.push(candidate);
	}
	return candidates;
}
function findBalancedJsonEnd(text, start) {
	const opening = text[start];
	const closing = opening === "{" ? "}" : opening === "[" ? "]" : "";
	if (!closing) return null;
	const stack = [closing];
	let inString = false;
	let escaped = false;
	for (let index = start + 1; index < text.length; index += 1) {
		if (index - start > MAX_JSON_CANDIDATE_CHARS) return null;
		const ch = text[index];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === "\"") inString = false;
			continue;
		}
		if (ch === "\"") {
			inString = true;
			continue;
		}
		if (ch === "{" || ch === "[") {
			stack.push(ch === "{" ? "}" : "]");
			continue;
		}
		if (ch === "}" || ch === "]") {
			if (stack.at(-1) !== ch) return null;
			stack.pop();
			if (stack.length === 0) return index + 1;
		}
	}
	return null;
}
function collectBalancedJsonCandidates(text) {
	const candidates = [];
	for (let index = 0; index < text.length && candidates.length < MAX_JSON_CANDIDATES; index += 1) {
		const ch = text[index];
		if (ch !== "{" && ch !== "[") continue;
		const end = findBalancedJsonEnd(text, index);
		if (end === null) continue;
		const candidate = text.slice(index, end).trim();
		if (candidate.length > 1) candidates.push(candidate);
		index = end - 1;
	}
	return candidates;
}
function detectJsonToolCall(text) {
	const candidates = [...collectFencedJsonCandidates(text), ...collectBalancedJsonCandidates(text)];
	for (const candidate of candidates) try {
		const detection = classifyJsonValue(JSON.parse(candidate));
		if (detection) return detection;
	} catch {}
	return null;
}
function detectXmlToolCall(text) {
	if (!/<\s*tool_call\b/i.test(text)) return null;
	if (!/<\s*function=/i.test(text) && !/["']name["']\s*:\s*["'][^"']{1,120}["']/i.test(text)) return null;
	const toolName = /<\s*function=([A-Za-z0-9_.:-]{1,120})\b/i.exec(text)?.[1] ?? /["']name["']\s*:\s*["']([^"']{1,120})["']/i.exec(text)?.[1]?.trim();
	return {
		kind: "xml_tool_call",
		...toolName ? { toolName } : {}
	};
}
function detectBracketedToolCall(text) {
	const legacyMatch = /\[\s*TOOL_CALL\s*\]\s*{[\s\S]{0,8000}?\btool\s*=>\s*["']([A-Za-z_][A-Za-z0-9_.:-]{0,119})["'][\s\S]{0,8000}?\bargs\s*=>[\s\S]*?(?:\[\s*\/\s*TOOL_CALL\s*\]|$)/i.exec(text);
	if (legacyMatch?.[1]) return {
		kind: "bracketed_tool_call",
		toolName: legacyMatch[1]
	};
	const match = /^\s*\[([A-Za-z_][A-Za-z0-9_.:-]{0,119})\]\s+[\s\S]*?\[END_TOOL_REQUEST\]\s*$/i.exec(text);
	if (!match?.[1]) return null;
	return {
		kind: "bracketed_tool_call",
		toolName: match[1]
	};
}
function detectReactAction(text) {
	const match = /(?:^|\n)\s*Action\s*:\s*([A-Za-z_][A-Za-z0-9_.:-]{0,119})\s*(?:\r?\n)+\s*Action Input\s*:/i.exec(text);
	if (!match?.[1]) return null;
	return {
		kind: "react_action",
		toolName: match[1]
	};
}
/** Detects assistant-visible text that looks like an unexecuted tool call instead of prose. */
function detectToolCallShapedText(text) {
	const trimmed = text.slice(0, MAX_SCAN_CHARS).trim();
	if (!trimmed || !TOOL_TEXT_PREFILTER_RE.test(trimmed)) return null;
	return detectBracketedToolCall(trimmed) ?? detectXmlToolCall(trimmed) ?? detectJsonToolCall(trimmed) ?? detectReactAction(trimmed);
}
//#endregion
//#region src/agents/embedded-agent-subscribe.tool-text-diagnostics.ts
/**
* Warns when assistant text appears to expose raw tool-call syntax.
*/
function hasStructuredToolInvocation(message) {
	if (!Array.isArray(message.content)) return false;
	return message.content.some((block) => {
		if (!block || typeof block !== "object") return false;
		const rawType = Reflect.get(block, "type");
		const type = typeof rawType === "string" ? rawType.trim() : "";
		if (type === "toolCall" || type === "toolUse" || type === "tool_call" || type === "tool_use" || type === "functionCall" || type === "function_call") return true;
		return Array.isArray(Reflect.get(block, "tool_calls")) || Array.isArray(Reflect.get(block, "toolCalls"));
	});
}
function isRegisteredToolName(toolName, registeredToolNames) {
	if (!toolName || !registeredToolNames) return;
	const normalized = normalizeToolPolicyName(toolName);
	for (const registeredToolName of registeredToolNames) if (normalizeToolPolicyName(registeredToolName) === normalized) return true;
	return false;
}
/** Log safe metadata for suspicious assistant-authored text shapes. */
function warnIfAssistantEmittedSuspiciousText(ctx, assistantMessage) {
	const structuredToolInvocation = hasStructuredToolInvocation(assistantMessage);
	const text = extractTextFromChatContent(assistantMessage.content, {
		joinWith: "\n",
		normalizeText: (chunk) => chunk.trim()
	}) ?? "";
	const toolDetection = structuredToolInvocation ? null : detectToolCallShapedText(text);
	if (toolDetection) {
		const provider = normalizeOptionalString(assistantMessage.provider);
		const model = normalizeOptionalString(assistantMessage.model);
		const registeredTool = isRegisteredToolName(toolDetection.toolName, ctx.builtinToolNames);
		const sessionId = normalizeOptionalString(ctx.params.session.id);
		ctx.log.warn("Assistant reply looks like a tool call, but no structured tool invocation was emitted; treating it as text.", {
			runId: ctx.params.runId,
			...sessionId ? { sessionId } : {},
			...provider ? { provider } : {},
			...model ? { model } : {},
			pattern: toolDetection.kind,
			...toolDetection.toolName ? { toolName: toolDetection.toolName } : {},
			...registeredTool !== void 0 ? { registeredTool } : {}
		});
	}
	const roleDetection = detectAssistantTranscriptRoleHeaderText(text);
	if (!roleDetection) return;
	const provider = normalizeOptionalString(assistantMessage.provider);
	const model = normalizeOptionalString(assistantMessage.model);
	const sessionId = normalizeOptionalString(ctx.params.session.id);
	ctx.log.warn("Assistant reply contains transcript-role-looking text; treating it as inert assistant text.", {
		runId: ctx.params.runId,
		...sessionId ? { sessionId } : {},
		...provider ? { provider } : {},
		...model ? { model } : {},
		pattern: roleDetection.kind,
		role: roleDetection.role
	});
}
//#endregion
//#region src/agents/embedded-agent-subscribe.handlers.messages.lifecycle.ts
/**
* Handles assistant message lifecycle boundaries, and final reconciliation.
*/
function handleMessageStart(ctx, evt) {
	const msg = evt.message;
	if (msg?.role !== "assistant" || isSubscribeTranscriptOnlyOpenClawAssistantMessage(msg)) return;
	ctx.resetAssistantMessageState(ctx.state.assistantTexts.length);
	ctx.state.assistantMessageStartIndex = ctx.state.assistantMessageIndex;
	emitAssistantMessageStart(ctx);
}
function handleMessageEnd(ctx, evt) {
	const msg = evt.message;
	if (msg?.role !== "assistant" || isSubscribeTranscriptOnlyOpenClawAssistantMessage(msg)) return;
	ctx.state.assistantTurnCount += 1;
	const assistantMessage = msg;
	const assistantPhase = resolveAssistantMessagePhase(assistantMessage);
	const suppressVisibleAssistantOutput = assistantPhase === "commentary";
	const suppressDeterministicApprovalOutput = shouldSuppressDeterministicApprovalOutput(ctx.state);
	const suppressMessageToolOnlySourceReplyOutput = hasMessageToolOnlySourceDelivery(ctx);
	if (!suppressMessageToolOnlySourceReplyOutput) emitReasoningEnd(ctx);
	ctx.noteLastAssistant(assistantMessage);
	if (suppressVisibleAssistantOutput) {
		appendRawStream(() => ({
			ts: Date.now(),
			event: "assistant_message_end",
			runId: ctx.params.runId,
			sessionId: ctx.params.session.id,
			rawText: coerceChatContentText(extractEmbeddedAssistantText(assistantMessage)),
			rawThinking: extractAssistantThinking(assistantMessage)
		}));
		emitAssistantCommentaryStreamData(ctx, assistantMessage, true);
		const suppressedTrimmedReasoning = ctx.state.includeReasoning ? extractAssistantThinking(assistantMessage).trim() : "";
		if (!ctx.params.silentExpected && !suppressDeterministicApprovalOutput && !suppressMessageToolOnlySourceReplyOutput && ctx.state.includeReasoning && suppressedTrimmedReasoning && ctx.params.onBlockReply && suppressedTrimmedReasoning !== ctx.state.lastReasoningSent) {
			ctx.state.lastReasoningSent = suppressedTrimmedReasoning;
			ctx.emitBlockReply({
				text: suppressedTrimmedReasoning,
				isReasoning: true
			});
		}
		return;
	}
	const sourceContent = assistantMessage.content;
	promoteThinkingTagsToBlocks(assistantMessage);
	let rawText;
	const getRawText = () => rawText ??= coerceChatContentText(extractEmbeddedAssistantText(assistantMessage));
	const snapshot = extractAssistantStreamSnapshot(ctx, assistantMessage);
	const rawVisibleText = snapshot.text;
	appendRawStream(() => ({
		ts: Date.now(),
		event: "assistant_message_end",
		runId: ctx.params.runId,
		sessionId: ctx.params.session.id,
		rawText: getRawText(),
		rawThinking: extractAssistantThinking(assistantMessage)
	}));
	warnIfAssistantEmittedSuspiciousText(ctx, assistantMessage);
	const text = extractStandaloneMessageToolText(rawVisibleText, {
		allowRoutedReply: isOpenAiCompletionsAssistantMessage(assistantMessage),
		allowCurrentSourceReply: ctx.params.sourceReplyDeliveryMode === "message_tool_only" && ctx.builtinToolNames?.has("message") === true
	}) ?? rawVisibleText;
	const rawThinking = ctx.state.includeReasoning || ctx.state.streamReasoning ? extractAssistantThinking(assistantMessage) || extractThinkingFromTaggedText(getRawText()) : "";
	const trimmedReasoning = rawThinking ? rawThinking.trim() : "";
	const trimmedText = text.trim();
	ctx.resetPartialReplyDirectives();
	const parsedText = parseReplyDirectives(trimmedText);
	recordPendingAssistantReplyDirectives(ctx.state, parsedText);
	const cleanedText = parsedText.text;
	const { mediaUrls } = resolveSendableOutboundReplyParts(parsedText, { text: "" });
	const managedMediaUrls = resolveManagedStreamMediaUrls(ctx.state, mediaUrls);
	const sourceMessage = {
		...assistantMessage,
		content: sourceContent
	};
	const sourceSnapshot = sourceContent === assistantMessage.content ? snapshot : extractAssistantStreamSnapshot(ctx, sourceMessage);
	const resolveSourceIndex = (contentIndex, itemId) => contentIndex ?? (Array.isArray(sourceContent) && itemId ? sourceContent.findIndex((block) => block.type === "text" && parseAssistantTextSignature(block)?.id === itemId) : -1);
	const lastIndex = resolveSourceIndex(ctx.state.lastAssistantStreamContentIndex, ctx.state.lastAssistantStreamItemId);
	const preparedSourceText = (index) => parseReplyDirectives(extractAssistantStreamSnapshot(ctx, scopeAssistantMessageToStreamBlock(sourceMessage, index, void 0)).text.trim()).text;
	if (ctx.state.lastBlockReplyText == null) ctx.blockChunker.reset();
	if (text !== rawVisibleText) {
		ctx.state.blockState.textIsVisible = true;
		replaceBlockReplyBuffer(ctx, text);
	} else if (ctx.blockChunker.consumedLength === 0) {
		const preparedIndex = ctx.state.lastAssistantTextMessageIndex >= ctx.state.assistantMessageStartIndex ? resolveSourceIndex(ctx.state.lastAssistantTextContentIndex, ctx.state.lastAssistantTextItemId) : -1;
		const pendingText = preparedIndex >= 0 && Array.isArray(sourceContent) ? extractAssistantStreamSnapshot(ctx, {
			...sourceMessage,
			content: sourceContent.slice(preparedIndex + 1)
		}).text : sourceSnapshot.text;
		ctx.state.blockState = {
			thinking: false,
			final: false,
			inlineCode: createInlineCodeState(),
			textIsVisible: true
		};
		replaceBlockReplyBuffer(ctx, pendingText);
	} else if (lastIndex >= 0) {
		const currentPart = sourceSnapshot.parts.find((part) => part.index === lastIndex);
		replaceBlockReplyBuffer(ctx, ctx.state.blockState.textIsVisible ? preparedSourceText(lastIndex) : currentPart?.text ?? "", ctx.state.streamBlockOffset);
		for (const part of sourceSnapshot.parts) if ((part.index ?? 0) > lastIndex) {
			const partText = ctx.state.blockState.textIsVisible ? preparedSourceText(part.index ?? 0) : part.text;
			ctx.blockChunker.append(`${ctx.blockChunker.hasBuffered() ? part.separator : ""}${partText}`);
			ctx.state.lastAssistantStreamContentIndex = part.index;
		}
	} else replaceBlockReplyBuffer(ctx, ctx.state.blockState.textIsVisible ? cleanedText : sourceSnapshot.rawText);
	const finalizeMessageEnd = () => {
		ctx.state.deltaBuffer = "";
		ctx.state.streamBlockText = "";
		ctx.state.streamBlockOffset = 0;
		ctx.state.thinkingTagStream = createThinkingTagStreamState();
		ctx.state.deltaBufferIsCommentary = false;
		ctx.state.hasFlushedPartialText = false;
		ctx.blockChunker.reset();
		ctx.state.blockState = {
			thinking: false,
			final: false,
			inlineCode: createInlineCodeState()
		};
		const { thinking, final, inlineCode } = ctx.state.partialBlockState;
		ctx.state.partialBlockState = {
			thinking,
			final,
			inlineCode
		};
		ctx.state.assistantStream = void 0;
		ctx.state.reasoningStreamOpen = false;
	};
	if (!ctx.params.silentExpected && !suppressDeterministicApprovalOutput && !suppressMessageToolOnlySourceReplyOutput) ctx.emitAssistantStreamData({
		text: cleanedText,
		delta: "",
		mediaUrls: mediaUrls.length ? mediaUrls : void 0,
		managedMediaUrls: managedMediaUrls.length ? managedMediaUrls : void 0,
		phase: assistantPhase
	}, { finalMessage: true });
	const finalAssistantText = ctx.params.silentExpected && !isSilentReplyText(trimmedText, "NO_REPLY") ? "" : text;
	const addedDuringMessage = ctx.state.assistantTexts.length > ctx.state.assistantTextBaseline;
	const chunkerHasBuffered = Boolean(ctx.params.onBlockReply) && ctx.blockChunker.hasBuffered();
	ctx.finalizeAssistantTexts({
		text: finalAssistantText,
		addedDuringMessage,
		chunkerHasBuffered
	});
	const onBlockReply = ctx.params.onBlockReply;
	const shouldEmitReasoning = Boolean(!ctx.params.silentExpected && !suppressDeterministicApprovalOutput && !suppressMessageToolOnlySourceReplyOutput && ctx.state.includeReasoning && trimmedReasoning && onBlockReply && trimmedReasoning !== ctx.state.lastReasoningSent);
	const shouldEmitReasoningBeforeAnswer = shouldEmitReasoning && ctx.state.blockReplyBreak === "message_end" && !addedDuringMessage;
	const maybeEmitReasoning = () => {
		if (!shouldEmitReasoning || !trimmedReasoning) return;
		ctx.state.lastReasoningSent = trimmedReasoning;
		ctx.emitBlockReply({
			text: trimmedReasoning,
			isReasoning: true
		});
	};
	if (shouldEmitReasoningBeforeAnswer) maybeEmitReasoning();
	if (!ctx.params.silentExpected && !suppressDeterministicApprovalOutput && !suppressMessageToolOnlySourceReplyOutput && onBlockReply) {
		const pending = ctx.flushBlockReplyBuffer({
			assistantMessageIndex: ctx.state.assistantMessageIndex,
			final: true,
			finalReply: parsedText
		});
		if (pending) pending.catch((err) => {
			ctx.log.debug(`message_end block reply flush failed: ${String(err)}`);
		});
	}
	if (!shouldEmitReasoningBeforeAnswer) maybeEmitReasoning();
	if (!ctx.params.silentExpected && rawThinking) ctx.emitReasoningStream(rawThinking);
	if (!ctx.params.silentExpected && ctx.state.blockReplyBreak === "message_end" && ctx.params.onBlockReplyFlush) {
		const flushBlockReplyBufferResult = ctx.flushBlockReplyBuffer();
		if (isPromiseLike(flushBlockReplyBufferResult)) return flushBlockReplyBufferResult.then(() => {
			const onBlockReplyFlushResult = ctx.params.onBlockReplyFlush?.({ reason: "message_end" });
			if (isPromiseLike(onBlockReplyFlushResult)) return onBlockReplyFlushResult;
		}).finally(() => {
			finalizeMessageEnd();
		});
		const onBlockReplyFlushResult = ctx.params.onBlockReplyFlush({ reason: "message_end" });
		if (isPromiseLike(onBlockReplyFlushResult)) return onBlockReplyFlushResult.finally(() => {
			finalizeMessageEnd();
		});
	}
	finalizeMessageEnd();
}
//#endregion
//#region src/agents/embedded-agent-live-edit-diff.ts
const LIVE_EDIT_DIFF_MIN_INTERVAL_MS = 250;
const LIVE_EDIT_DIFF_MAX_PARTIAL_JSON_CHARS = 1048576;
const LIVE_EDIT_DIFF_MAX_TRACKED_CALLS = 64;
function readToolCallBlock(event) {
	const contentIndex = event.contentIndex;
	const partial = event.partial;
	if (typeof contentIndex !== "number" || !Number.isInteger(contentIndex) || contentIndex < 0 || !partial || typeof partial !== "object") return;
	const content = partial.content;
	const block = Array.isArray(content) ? content[contentIndex] : void 0;
	return block && typeof block === "object" && !Array.isArray(block) ? block : void 0;
}
function readToolCallId(event) {
	const toolCall = event.toolCall;
	if (toolCall && typeof toolCall === "object" && !Array.isArray(toolCall)) {
		const id = toolCall.id;
		if (typeof id === "string" && id) return id;
	}
	const block = readToolCallBlock(event);
	return typeof block?.id === "string" && block.id ? block.id : void 0;
}
/** Update one run's bounded best-effort diff counters from a model stream event. */
function updateLiveEditDiffProgress(stateByToolCallId, event) {
	if (!event) return;
	const eventType = event.type;
	if (eventType === "toolcall_end") {
		const toolCallId = readToolCallId(event);
		if (toolCallId) stateByToolCallId.delete(toolCallId);
		return;
	}
	if (eventType !== "toolcall_delta") return;
	const block = readToolCallBlock(event);
	const toolCallId = typeof block?.id === "string" ? block.id : "";
	const name = typeof block?.name === "string" ? block.name : "";
	const kind = resolveFileMutationToolName(name);
	const partialJson = typeof block?.partialJson === "string" ? block.partialJson : "";
	if (!toolCallId || !kind || !partialJson) return;
	if (partialJson.length > LIVE_EDIT_DIFF_MAX_PARTIAL_JSON_CHARS) {
		stateByToolCallId.delete(toolCallId);
		return;
	}
	let progress = stateByToolCallId.get(toolCallId);
	if (!progress) {
		if (stateByToolCallId.size >= LIVE_EDIT_DIFF_MAX_TRACKED_CALLS) return;
		progress = {
			added: 0,
			removed: 0,
			emittedAdded: 0,
			emittedRemoved: 0,
			lastCheckedAtMs: 0
		};
		stateByToolCallId.set(toolCallId, progress);
	}
	const now = Date.now();
	if (progress.lastCheckedAtMs > 0 && now - progress.lastCheckedAtMs < LIVE_EDIT_DIFF_MIN_INTERVAL_MS) return;
	progress.lastCheckedAtMs = now;
	const counted = countStreamingFileMutationLines(kind, parseStreamingJson(partialJson));
	progress.added = Math.max(progress.added, counted.added);
	progress.removed = Math.max(progress.removed, counted.removed);
	if (progress.added === progress.emittedAdded && progress.removed === progress.emittedRemoved) return;
	progress.emittedAdded = progress.added;
	progress.emittedRemoved = progress.removed;
	return {
		toolCallId,
		name: normalizeLowercaseStringOrEmpty(name),
		diff: {
			added: progress.added,
			removed: progress.removed
		}
	};
}
//#endregion
//#region src/agents/embedded-agent-subscribe.handlers.messages.update.ts
/**
* Handles assistant message deltas, reasoning, directives, and block replies.
*/
const REASONING_TAG_RE = /<\s*\/?\s*(?:(?:antml:|mm:)?(?:think(?:ing)?|thought)|antthinking)\b/i;
function handleMessageUpdate(ctx, evt) {
	const msg = evt.message;
	if (msg?.role !== "assistant" || isSubscribeTranscriptOnlyOpenClawAssistantMessage(msg)) return;
	ctx.noteLastAssistant(msg);
	const assistantEvent = evt.assistantMessageEvent;
	const assistantRecord = assistantEvent && typeof assistantEvent === "object" ? assistantEvent : void 0;
	const evtType = typeof assistantRecord?.type === "string" ? assistantRecord.type : "";
	if (evtType !== "text_delta") ctx.flushAssistantStream();
	const liveEditDiff = updateLiveEditDiffProgress(ctx.state.liveEditDiffStateById, assistantRecord);
	if (liveEditDiff) {
		const data = {
			phase: "input_delta",
			...liveEditDiff
		};
		emitAgentEvent({
			runId: ctx.params.runId,
			stream: "tool",
			data
		});
		runBestEffortCallback({
			label: "live edit diff agent event",
			log: ctx.log,
			callback: () => ctx.params.onAgentEvent?.({
				stream: "tool",
				data
			})
		});
	}
	const eventAssistantMessage = assistantRecord?.partial && typeof assistantRecord.partial === "object" ? assistantRecord.partial : msg;
	const isResponsesTextEvent = isResponsesApiAssistantMessage(eventAssistantMessage) && (evtType === "text_start" || evtType === "text_delta" || evtType === "text_end");
	const assistantPhase = resolveAssistantMessagePhase(msg);
	if (assistantPhase === "commentary" && !isResponsesTextEvent) {
		ctx.flushAssistantStream();
		const commentaryText = extractAssistantCommentaryText(msg);
		if (commentaryText) {
			appendRawStream(() => ({
				ts: Date.now(),
				event: "assistant_text_stream",
				runId: ctx.params.runId,
				sessionId: ctx.params.session.id,
				evtType: "commentary_update",
				delta: "",
				content: commentaryText
			}));
			emitAssistantCommentaryStreamData(ctx, msg);
		}
		return;
	}
	const suppressDeterministicApprovalOutput = shouldSuppressDeterministicApprovalOutput(ctx.state);
	const suppressMessageToolOnlySourceReplyOutput = hasMessageToolOnlySourceDelivery(ctx);
	if (evtType === "thinking_start" || evtType === "thinking_delta" || evtType === "thinking_end") {
		if (!suppressMessageToolOnlySourceReplyOutput && (evtType === "thinking_start" || evtType === "thinking_delta")) openReasoningStream(ctx);
		const thinkingDelta = typeof assistantRecord?.delta === "string" ? assistantRecord.delta : "";
		const thinkingContent = typeof assistantRecord?.content === "string" ? assistantRecord.content : "";
		appendRawStream(() => ({
			ts: Date.now(),
			event: "assistant_thinking_stream",
			runId: ctx.params.runId,
			sessionId: ctx.params.session.id,
			evtType,
			delta: thinkingDelta,
			content: thinkingContent
		}));
		const partialThinking = extractAssistantThinking(msg);
		ctx.emitReasoningStream(partialThinking || thinkingContent || thinkingDelta);
		if (evtType === "thinking_end" && !suppressMessageToolOnlySourceReplyOutput) {
			if (!ctx.state.reasoningStreamOpen) openReasoningStream(ctx);
			emitReasoningEnd(ctx);
		}
		return;
	}
	if (evtType !== "text_delta" && evtType !== "text_start" && evtType !== "text_end") return;
	const delta = typeof assistantRecord?.delta === "string" ? assistantRecord.delta : "";
	const content = typeof assistantRecord?.content === "string" ? assistantRecord.content : "";
	appendRawStream(() => ({
		ts: Date.now(),
		event: "assistant_text_stream",
		runId: ctx.params.runId,
		sessionId: ctx.params.session.id,
		evtType,
		delta,
		content
	}));
	const partialAssistant = eventAssistantMessage;
	const streamContentIndex = resolveAssistantStreamContentIndex(assistantRecord?.contentIndex);
	const streamItemId = resolveAssistantStreamItemId({
		contentIndex: streamContentIndex,
		message: partialAssistant
	});
	const streamAssistant = scopeAssistantMessageToStreamBlock(partialAssistant, streamContentIndex, streamItemId);
	const deliveryPhase = resolveAssistantMessagePhase(streamAssistant);
	const isPhasePendingResponsesTextItem = evtType !== "text_end" && !deliveryPhase && Boolean(streamItemId) && isResponsesApiAssistantMessage(partialAssistant);
	const isPhasePendingAnthropicText = evtType !== "text_end" && !deliveryPhase && isAnthropicAssistantMessage(partialAssistant);
	const isCompletionsAssistant = isOpenAiCompletionsAssistantMessage(partialAssistant);
	const isPhasePendingCompletionsText = !deliveryPhase && isCompletionsAssistant;
	const isReasoningCompletionsText = isCompletionsAssistant && partialAssistant.openclawDelivery?.textPhaseRequiresTerminal === true;
	const hasResponsesContentIndex = streamContentIndex !== void 0 && isResponsesApiAssistantMessage(partialAssistant);
	let streamItemChanged = false;
	let deliveryItemId = streamItemId;
	if ((deliveryPhase || isPhasePendingResponsesTextItem || hasResponsesContentIndex) && (streamContentIndex !== void 0 || streamItemId)) {
		const previousStreamContentIndex = ctx.state.lastAssistantStreamContentIndex;
		const previousStreamItemId = ctx.state.lastAssistantStreamItemId;
		if (previousStreamContentIndex !== void 0 && streamContentIndex !== void 0 && previousStreamContentIndex !== streamContentIndex || (previousStreamContentIndex === void 0 || streamContentIndex === void 0) && Boolean(previousStreamItemId && streamItemId && previousStreamItemId !== streamItemId)) {
			streamItemChanged = true;
			ctx.flushBlockReplyBuffer({ assistantMessageIndex: ctx.state.assistantMessageIndex });
			ctx.resetAssistantMessageState(ctx.state.assistantTexts.length);
			emitAssistantMessageStart(ctx);
		} else if (previousStreamContentIndex !== void 0 && streamContentIndex === previousStreamContentIndex && previousStreamItemId) deliveryItemId = previousStreamItemId;
		ctx.state.lastAssistantStreamItemId = deliveryItemId;
	}
	if (streamContentIndex !== void 0) {
		if (streamContentIndex !== ctx.state.lastAssistantStreamContentIndex) {
			ctx.flushAssistantStream();
			ctx.state.streamBlockText = "";
			ctx.state.streamBlockOffset = ctx.blockChunker.sourceLength;
		}
		ctx.state.lastAssistantStreamContentIndex = streamContentIndex;
	}
	const chunk = resolveAssistantTextChunk({
		evtType,
		delta,
		content,
		accumulatedText: ctx.state.streamBlockText
	});
	ctx.state.streamBlockText += chunk;
	if (evtType === "text_start" && isResponsesApiAssistantMessage(partialAssistant)) return;
	if (deliveryPhase === "commentary") {
		const isResponsesCommentary = isResponsesApiAssistantMessage(partialAssistant);
		const hadResponsesCommentaryText = isResponsesCommentary && Boolean(ctx.state.deltaBuffer);
		if (isResponsesCommentary && chunk) {
			ctx.state.deltaBuffer += chunk;
			ctx.state.deltaBufferIsCommentary = true;
		}
		const commentaryText = isResponsesCommentary ? ctx.state.deltaBuffer : extractAssistantCommentaryText(streamAssistant);
		if (commentaryText && (chunk || !hadResponsesCommentaryText || evtType === "text_end")) ctx.emitAssistantStreamData({
			text: commentaryText,
			delta: "",
			replace: true,
			phase: "commentary",
			itemId: deliveryItemId
		}, { finalMessage: evtType === "text_end" });
		return;
	}
	if (isPhasePendingResponsesTextItem) return;
	const skipLiveStream = ctx.params.suppressLiveStreamOutput === true;
	const shouldUsePhaseAwareBlockReply = Boolean(deliveryPhase);
	const reprojectBlockReply = shouldUsePhaseAwareBlockReply && !ctx.params.enforceFinalTag && !ctx.state.blockState.textIsVisible && ctx.blockChunker.consumedLength === 0;
	const finalText = evtType === "text_end";
	if (isReasoningCompletionsText) return;
	if (chunk) {
		ctx.state.deltaBuffer += chunk;
		ctx.state.deltaBufferIsCommentary = false;
		if (!skipLiveStream && !shouldUsePhaseAwareBlockReply) {
			if (!isPhasePendingAnthropicText && !isPhasePendingCompletionsText) ctx.blockChunker.append(chunk);
		}
	}
	if (skipLiveStream) return;
	ctx.emitReasoningStream(extractThinkingFromTaggedStream(ctx.state.deltaBuffer, ctx.state.thinkingTagStream, chunk));
	const wasThinking = ctx.state.partialBlockState.thinking;
	let visibleDelta = "";
	let textIsAppend = false;
	let appendDelta = null;
	let previousText = ctx.state.assistantStream?.raw ?? "";
	const shouldReadPartialText = streamItemChanged || evtType === "text_end" && assistantRecord?.partial !== void 0 || shouldUsePhaseAwareBlockReply && (evtType === "text_end" || !chunk);
	const isTerminalSnapshot = evtType === "text_end" && shouldReadPartialText;
	let selectedAssistant = shouldUsePhaseAwareBlockReply || isResponsesTextEvent ? streamAssistant : partialAssistant;
	if (isTerminalSnapshot && selectedAssistant === partialAssistant && streamContentIndex !== void 0 && Array.isArray(partialAssistant.content) && streamContentIndex + 1 < partialAssistant.content.length) selectedAssistant = {
		...partialAssistant,
		content: partialAssistant.content.slice(0, streamContentIndex + 1)
	};
	const snapshot = isTerminalSnapshot ? extractAssistantStreamSnapshot(ctx, selectedAssistant) : void 0;
	let next = shouldReadPartialText ? (snapshot?.text ?? extractAssistantVisibleText(selectedAssistant)).trim() : void 0;
	if (snapshot) {
		ctx.state.deltaBuffer = snapshot.rawText;
		ctx.state.thinkingTagStream = createThinkingTagStreamState();
		ctx.state.partialBlockState = snapshot.state;
		ctx.resetPartialReplyDirectives();
	}
	if (!next && evtType !== "text_end") next = void 0;
	const hasSnapshotText = next !== void 0;
	let nextRawStreamText = next ?? "";
	let projection;
	if (next === void 0 && deliveryPhase === "final_answer" && (reprojectBlockReply || chunk)) {
		visibleDelta = reprojectBlockReply ? ctx.state.deltaBuffer : ctx.params.enforceFinalTag ? ctx.stripBlockTags(chunk, ctx.state.partialBlockState, { final: finalText }) : chunk;
		next = visibleDelta;
		textIsAppend = true;
		if (reprojectBlockReply) ctx.resetPartialReplyDirectives();
	} else if (next === void 0 && deliveryPhase !== "final_answer") {
		const pendingTagFragment = ctx.state.partialBlockState.pendingTagFragment;
		if (Boolean(pendingTagFragment) || REASONING_TAG_RE.test(chunk)) {
			const recomputeState = {
				thinking: false,
				final: false,
				inlineCode: createInlineCodeState()
			};
			const recomputedRawText = ctx.stripBlockTags(ctx.state.deltaBuffer, recomputeState, { final: finalText });
			const isFullStreamReplacement = !recomputedRawText.startsWith(previousText);
			textIsAppend = !isFullStreamReplacement;
			next = recomputedRawText;
			visibleDelta = isFullStreamReplacement ? recomputedRawText : recomputedRawText.slice(previousText.length);
			nextRawStreamText = recomputedRawText;
			ctx.state.partialBlockState = recomputeState;
		} else {
			visibleDelta = chunk || evtType === "text_end" ? ctx.stripBlockTags(chunk, ctx.state.partialBlockState, { final: finalText }) : "";
			if (ctx.state.partialBlockState.pendingTagFragment) {
				visibleDelta = "";
				next = ctx.state.assistantStream?.text ?? "";
				nextRawStreamText = ctx.state.assistantStream?.raw ?? "";
			} else {
				next = visibleDelta;
				textIsAppend = true;
			}
		}
	} else if (!isTerminalSnapshot && next !== void 0 && (chunk || evtType === "text_end")) visibleDelta = ctx.stripBlockTags(chunk, ctx.state.partialBlockState, { final: finalText });
	if (next !== void 0) {
		if (!hasSnapshotText) {
			const kind = deliveryPhase !== "final_answer" ? "raw" : ctx.params.enforceFinalTag ? "delivery" : "final";
			const previousStream = reprojectBlockReply ? void 0 : ctx.state.assistantStream;
			projection = previousStream?.projection;
			if (!projection || projection.kind !== kind) {
				projection = {
					kind,
					projector: kind === "raw" ? createTextProjection([trimTextFilter("both")]) : createAssistantVisibleStreamText(kind === "final" ? "final_answer" : void 0)
				};
				projection.projector.replace(previousStream?.raw ?? "");
			}
			previousText = projection.projector.text;
			const projected = textIsAppend ? projection.projector.append(visibleDelta) : projection.projector.replace(nextRawStreamText);
			nextRawStreamText = projection.projector.source;
			next = projected.text;
			appendDelta = projected.delta;
			if (kind !== "raw") visibleDelta = projected.delta ?? (previousText.startsWith(next) ? "" : next);
		}
		if (!suppressMessageToolOnlySourceReplyOutput && !wasThinking && ctx.state.partialBlockState.thinking) openReasoningStream(ctx);
		if (!suppressMessageToolOnlySourceReplyOutput && wasThinking && !ctx.state.partialBlockState.thinking) emitReasoningEnd(ctx);
		const parsedStreamDirectives = isTerminalSnapshot ? ctx.consumePartialReplyDirectives(next, { final: finalText }) : mergeReplyDirectiveResults(visibleDelta ? ctx.consumePartialReplyDirectives(visibleDelta) : null, evtType === "text_end" ? ctx.consumePartialReplyDirectives("", { final: finalText }) : null);
		if (shouldUsePhaseAwareBlockReply || isTerminalSnapshot) recordPendingAssistantReplyDirectives(ctx.state, parsedStreamDirectives);
		const previousCleaned = ctx.state.assistantStream?.text ?? "";
		const { text: cleanedText, delta: replyDelta, replace, hasText } = resolveStreamingReply({
			evtType,
			next,
			previousText,
			previousCleaned,
			visibleDelta,
			appendDelta,
			parsedStreamDirectives
		});
		const hasAudio = Boolean(parsedStreamDirectives?.audioAsVoice);
		const hasVisibleReply = hasText || hasAudio;
		const deltaText = hasVisibleReply ? replyDelta : "";
		let shouldEmit = (hasVisibleReply || replace) && (replace ? cleanedText !== previousCleaned || hasAudio : Boolean(deltaText || hasAudio));
		if (snapshot) {
			const undrained = ctx.state.lastBlockReplyText == null;
			const textWasVisible = ctx.state.blockState.textIsVisible;
			if (undrained) {
				ctx.blockChunker.reset();
				ctx.state.blockState = {
					thinking: false,
					final: false,
					inlineCode: createInlineCodeState()
				};
			}
			const textIsVisible = !ctx.params.enforceFinalTag && (textWasVisible || shouldUsePhaseAwareBlockReply && undrained);
			if (textIsVisible) ctx.state.blockState.textIsVisible = true;
			replaceBlockReplyBuffer(ctx, textIsVisible ? cleanedText : undrained || streamContentIndex === void 0 ? snapshot.rawText : content, undrained ? 0 : ctx.state.streamBlockOffset);
			if (undrained && !shouldUsePhaseAwareBlockReply && !isResponsesTextEvent) ctx.state.streamBlockOffset = snapshot.parts.find((part) => part.index === streamContentIndex)?.offset ?? 0;
		} else if (reprojectBlockReply || replace) {
			if (reprojectBlockReply) ctx.state.blockState.textIsVisible = true;
			replaceBlockReplyBuffer(ctx, ctx.state.blockState.textIsVisible ? cleanedText : ctx.state.deltaBuffer);
		} else if (shouldUsePhaseAwareBlockReply) ctx.blockChunker.append(ctx.params.enforceFinalTag || ctx.state.blockState.textIsVisible ? deltaText : chunk);
		else if (streamItemChanged && !chunk) {
			if (!ctx.params.enforceFinalTag) ctx.state.blockState.textIsVisible = true;
			ctx.blockChunker.append(cleanedText);
		}
		if (isTerminalSnapshot) ctx.state.streamBlockText = content;
		ctx.state.assistantStream = {
			raw: nextRawStreamText,
			text: cleanedText,
			projection
		};
		if (ctx.params.silentExpected || suppressDeterministicApprovalOutput || suppressMessageToolOnlySourceReplyOutput) shouldEmit = false;
		if (shouldEmit) {
			const currentSourcePartial = ctx.params.sourceReplyDeliveryMode !== "message_tool_only" ? resolveCurrentSourceMessagingToolPartial(ctx.state, {
				evtType,
				text: cleanedText,
				visibleDelta
			}) : {
				hold: false,
				text: cleanedText
			};
			const releaseHeldSnapshot = currentSourcePartial.text !== cleanedText;
			ctx.emitAssistantStreamData({
				text: currentSourcePartial.text,
				delta: releaseHeldSnapshot ? currentSourcePartial.text : deltaText,
				replace: releaseHeldSnapshot || replace || void 0,
				phase: deliveryPhase ?? assistantPhase
			}, { emitPartialReply: !currentSourcePartial.hold });
		}
	}
	if (ctx.params.silentExpected || suppressDeterministicApprovalOutput || suppressMessageToolOnlySourceReplyOutput || ctx.state.blockReplyBreak !== "text_end") return;
	if (ctx.params.onBlockReply && ctx.blockChunking) ctx.blockChunker.drain({
		force: false,
		emit: ctx.emitBlockChunk
	});
	if (evtType === "text_end") {
		const assistantMessageIndex = ctx.state.assistantMessageIndex;
		const onFlushError = (err) => {
			ctx.log.debug(`text_end block reply flush failed: ${String(err)}`);
		};
		try {
			const pending = ctx.flushBlockReplyBuffer({
				assistantMessageIndex,
				final: finalText
			});
			if (pending) return pending.catch(onFlushError);
		} catch (err) {
			onFlushError(err);
		}
	}
}
//#endregion
//#region src/agents/embedded-agent-subscribe.handlers.ts
/**
* Dispatches serialized embedded-agent subscription events to specific handlers.
*/
/** Create the serialized event dispatcher for subscribed embedded-agent sessions. */
function createEmbeddedAgentSessionEventHandler(ctx) {
	const scheduleEvent = (evt, handler) => {
		const run = () => {
			try {
				if (evt.type !== "message_update") ctx.flushAssistantStream();
				return handler();
			} catch (err) {
				ctx.log.debug(`${evt.type} handler failed: ${String(err)}`);
				return;
			}
		};
		const result = ctx.state.pendingEventChain ? ctx.state.pendingEventChain.then(run) : run();
		if (!isPromiseLike(result)) return;
		const task = Promise.resolve(result).then(() => {}, (err) => {
			ctx.log.debug(`${evt.type} handler failed: ${String(err)}`);
		}).finally(() => {
			if (ctx.state.pendingEventChain === task) ctx.state.pendingEventChain = null;
		});
		ctx.state.pendingEventChain = task;
		return task;
	};
	return (evt) => {
		ctx.captureModelEvent(evt);
		switch (evt.type) {
			case "message_start":
				scheduleEvent(evt, () => handleMessageStart(ctx, evt));
				return;
			case "message_update":
				scheduleEvent(evt, () => handleMessageUpdate(ctx, evt));
				return;
			case "message_end":
				scheduleEvent(evt, () => handleMessageEnd(ctx, evt));
				return;
			case "tool_execution_start":
				scheduleEvent(evt, () => handleToolExecutionStart(ctx, evt));
				return;
			case "tool_execution_update":
				scheduleEvent(evt, () => handleToolExecutionUpdate(ctx, evt));
				return;
			case "tool_execution_end":
				scheduleEvent(evt, () => handleToolExecutionEnd(ctx, evt));
				return;
			case "agent_start":
				scheduleEvent(evt, () => handleAgentStart(ctx));
				return;
			case "compaction_start":
				scheduleEvent(evt, () => handleCompactionStart(ctx, evt));
				return;
			case "compaction_end":
				scheduleEvent(evt, () => handleCompactionEnd(ctx, evt));
				return;
			case "agent_end": return scheduleEvent(evt, () => handleAgentEnd(ctx, evt));
		}
	};
}
//#endregion
//#region src/agents/embedded-agent-subscribe.model-state.ts
function preserveAssistantUsage(message, pending) {
	if (!pending) return;
	const final = normalizeUsage(message.usage);
	if (hasNonzeroUsage(final)) {
		if (pending.cost?.totalOrigin === "provider-billed" && final.cost?.totalOrigin !== "provider-billed") message.usage.cost = {
			...makeZeroUsageSnapshot().cost,
			...message.usage.cost,
			...pending.cost
		};
		return;
	}
	const input = pending.input ?? 0;
	const output = pending.output ?? 0;
	const cacheRead = pending.cacheRead ?? 0;
	const cacheWrite = pending.cacheWrite ?? 0;
	message.usage = {
		...makeZeroUsageSnapshot(),
		input,
		output,
		cacheRead,
		cacheWrite,
		...pending.cacheWrite1h !== void 0 ? { cacheWrite1h: pending.cacheWrite1h } : {},
		...pending.contextUsage ? { contextUsage: { ...pending.contextUsage } } : {},
		totalTokens: pending.total ?? input + output + cacheRead + cacheWrite,
		...pending.reasoningTokens !== void 0 ? { reasoningTokens: pending.reasoningTokens } : {}
	};
	Object.assign(message.usage.cost, pending.cost);
}
/** Owns model facts at event ingress, independently of queued reply delivery. */
function createEmbeddedModelState(params, log) {
	const totals = createUsageAccumulator();
	let pending;
	let lastUsage;
	let retryUsage;
	let completed;
	const recordPendingUsage = (raw) => {
		const usage = normalizeUsage(raw);
		if (!hasObservedModelUsage(usage)) return;
		const cost = usage.cost;
		const next = pending && !hasNonzeroUsage(usage) ? {
			...pending,
			cost
		} : usage;
		if (pending?.cost?.totalOrigin === "provider-billed" && cost?.totalOrigin !== "provider-billed") next.cost = pending.cost;
		pending = next;
	};
	const recordModelUsage = (usage) => {
		if (!hasObservedModelUsage(usage)) return;
		mergeUsageIntoAccumulator(totals, usage);
		if (!hasNonzeroUsage(usage) || !params.lifecycleGeneration) return;
		const data = emitAgentRunOutputTokens({
			runId: params.runId,
			lifecycleGeneration: params.lifecycleGeneration,
			outputTokens: usage.output ?? 0
		});
		if (data && params.onAgentEvent) runBestEffortCallback({
			label: "usage agent event",
			log,
			callback: () => params.onAgentEvent?.({
				stream: "usage",
				data
			})
		});
	};
	return {
		captureModelEvent: (evt) => {
			if (evt.type === "compaction_end") {
				if (evt.outcome.status === "completed" && evt.outcome.willRetry) {
					completed = void 0;
					retryUsage = lastUsage ?? retryUsage;
					lastUsage = void 0;
				}
				return;
			}
			if (evt.type !== "message_start" && evt.type !== "message_update" && evt.type !== "message_end") return;
			const message = evt.message;
			if (message.role !== "assistant" || isSubscribeTranscriptOnlyOpenClawAssistantMessage(message)) return;
			switch (evt.type) {
				case "message_start":
					pending = void 0;
					return;
				case "message_update":
					if (evt.assistantMessageEvent.type === "text_end") recordPendingUsage(message.usage);
					return;
				case "message_end":
					recordPendingUsage(message.usage);
					preserveAssistantUsage(message, pending);
					if (hasNonzeroUsage(pending)) lastUsage = { ...pending };
					recordModelUsage(pending);
					pending = void 0;
					completed = structuredClone(message);
					lastUsage ??= message.stopReason === "error" ? retryUsage : void 0;
					retryUsage = void 0;
					params.onContextAccountingEvent?.({
						kind: "model",
						contextTokens: deriveSessionTotalTokens({ lastCallUsage: normalizeUsage(message.usage) })
					});
			}
		},
		recordAuxiliaryUsage: (usage) => recordModelUsage(normalizeUsage(usage)),
		getUsageTotals: () => toNormalizedUsage(totals),
		getLastAssistantUsage: () => normalizeUsage(lastUsage),
		getCurrentAttemptAssistant: () => completed ? structuredClone(completed) : void 0
	};
}
//#endregion
//#region src/agents/embedded-agent-subscribe.reply-delivery.ts
const isStreamAppend = ({ data, finalMessage }) => !finalMessage && !data.replace && !data.mediaUrls?.length && !data.managedMediaUrls?.length;
const mergeStreamAppend = (previous, next) => ({
	...next,
	delta: previous.delta + next.delta
});
function createReplyDelivery({ params, state, log }) {
	const assistantTexts = state.assistantTexts;
	const deferredAssistantScopes = [];
	const lastEmittedCommentaryByItem = /* @__PURE__ */ new Map();
	const pendingBlockReplyTasks = /* @__PURE__ */ new Set();
	const pendingPartialReplyTasks = /* @__PURE__ */ new Set();
	let streamScope = {};
	const drainPartialReply = (scope) => {
		if (!scope.delivery || !scope.pending || state.unsubscribed || scope === streamScope && scope.active) return;
		const data = scope.delivery.data;
		scope.pending = false;
		scope.active = true;
		const settled = () => {
			if (scope === streamScope) {
				scope.active = false;
				drainPartialReply(scope);
			}
		};
		runBestEffortCallback({
			callback: () => params.onPartialReply?.(data),
			label: "assistant partial reply",
			log,
			pending: pendingPartialReplyTasks,
			onSuccess: settled,
			onError: settled
		});
	};
	const streamId = randomUUID();
	let messageIndex = -1;
	let blockIndex = -1;
	let assistantItemId = "";
	let prefix = "";
	let streamedText = "";
	let finalized = false;
	const emitAssistantStreamDataSafely = (scope) => {
		if (!scope.delivery || scope.emitted || state.unsubscribed) return;
		const delivery = scope.delivery;
		const { eventData } = delivery;
		scope.emitted = true;
		scope.pending ||= delivery.emitPartialReply && Boolean(params.onPartialReply) && state.shouldEmitPartialReplies;
		const itemId = eventData?.itemId ?? "";
		const progressText = eventData?.phase === "commentary" ? eventData.text.replace(/\s+/g, " ").trim() : "";
		const preamblePhase = delivery.finalMessage ? "end" : "update";
		const commentarySignature = `${preamblePhase}\0${progressText}`;
		const event = progressText ? {
			stream: "item",
			data: {
				kind: "preamble",
				title: "Preamble",
				phase: preamblePhase,
				progressText,
				...itemId ? { itemId } : {}
			}
		} : !eventData || eventData.phase === "commentary" ? void 0 : {
			stream: "assistant",
			data: eventData
		};
		if (event && (event.stream !== "item" || lastEmittedCommentaryByItem.get(itemId) !== commentarySignature)) {
			if (event.stream === "item") lastEmittedCommentaryByItem.set(itemId, commentarySignature);
			emitAgentEvent({
				runId: params.runId,
				...event
			});
			if (params.onAgentEvent) runBestEffortCallback({
				label: "assistant agent event",
				log,
				callback: () => params.onAgentEvent?.(event)
			});
		}
		drainPartialReply(scope);
	};
	const emitAssistantStreamData = (data, options) => {
		if (state.unsubscribed) return;
		let eventData;
		if (data.phase === "commentary") eventData = data;
		else {
			if (messageIndex !== state.assistantMessageStartIndex) {
				messageIndex = state.assistantMessageStartIndex;
				blockIndex = state.assistantMessageIndex;
				assistantItemId = `${streamId}:${messageIndex}`;
				prefix = streamedText = "";
				finalized = false;
			}
			if (!finalized || options?.finalMessage) {
				if (blockIndex !== state.assistantMessageIndex) {
					prefix = streamedText;
					blockIndex = state.assistantMessageIndex;
				}
				const text = options?.finalMessage ? data.text : prefix && data.text ? `${prefix}\n${data.text}` : prefix || data.text;
				const replace = options?.finalMessage ? !text.startsWith(streamedText) : data.replace === true;
				const delta = options?.finalMessage ? replace ? "" : text.slice(streamedText.length) : prefix && streamedText.length === prefix.length && data.delta ? `\n${data.delta}` : data.delta;
				if (text !== streamedText || data.mediaUrls?.length || data.managedMediaUrls?.length) eventData = {
					...data,
					text,
					delta,
					replace: replace || void 0,
					itemId: assistantItemId
				};
				streamedText = text;
				finalized = options?.finalMessage === true;
			}
		}
		const delivery = {
			data,
			eventData,
			emitPartialReply: options?.emitPartialReply === true,
			finalMessage: options?.finalMessage === true,
			blockIndex: state.assistantMessageIndex
		};
		if (!eventData && !delivery.emitPartialReply) return;
		const previous = streamScope.delivery;
		const deferred = state.deferBlockReplyDelivery && data.phase !== "commentary";
		const coalesce = previous && isStreamAppend(previous) && isStreamAppend(delivery) && previous.blockIndex === delivery.blockIndex && previous.data.phase === data.phase && previous.data.itemId === data.itemId && previous.emitPartialReply === delivery.emitPartialReply && Boolean(previous.eventData) === Boolean(eventData);
		const scope = coalesce ? streamScope : flushAssistantStream(delivery);
		if (coalesce) {
			if (!scope.emitted || scope.pending) delivery.data = mergeStreamAppend(previous.data, data);
			if (!scope.emitted && previous.eventData && eventData) delivery.eventData = mergeStreamAppend(previous.eventData, eventData);
			scope.delivery = delivery;
			scope.emitted = false;
		}
		if (!deferred) emitAssistantStreamDataSafely(scope);
	};
	const flushAssistantStream = (delivery) => {
		const previous = streamScope;
		const scope = { delivery };
		streamScope = scope;
		if (delivery && state.deferBlockReplyDelivery && delivery.data.phase !== "commentary") deferredAssistantScopes.push(scope);
		if (!state.deferBlockReplyDelivery) for (const deferred of deferredAssistantScopes.splice(0)) {
			emitAssistantStreamDataSafely(deferred);
			deferred.delivery = void 0;
		}
		if (!state.deferBlockReplyDelivery || previous.delivery?.data.phase === "commentary") {
			emitAssistantStreamDataSafely(previous);
			drainPartialReply(previous);
			previous.delivery = void 0;
		}
		return scope;
	};
	const clearAssistantStream = () => {
		streamScope.delivery = void 0;
		streamScope = {};
		deferredAssistantScopes.length = 0;
	};
	const deferredToolMediaReplies = /* @__PURE__ */ new WeakMap();
	const emitBlockReplySafely = (payload, options) => {
		if (!params.onBlockReply) return;
		const recordDeliveredReply = () => {
			if (!payload.isReasoning && hasAssistantVisibleReply(payload)) {
				state.visibleBlockReplyCount += 1;
				if (options?.pendingToolMedia) {
					state.pendingToolMediaDeliveryFailed = false;
					state.hasToolMediaBlockReply = true;
				}
				for (const url of options?.autoDeliveryMediaUrls ?? []) state.toolAutoDeliveryMediaUrls.delete(url);
			}
		};
		const recordDeliveryFailure = () => {
			if (options?.pendingToolMedia) restorePendingToolMediaReply(state, options.pendingToolMedia);
		};
		const assistantMessageIndex = getReplyPayloadMetadata(payload)?.assistantMessageIndex;
		runBestEffortCallback({
			callback: () => assistantMessageIndex === void 0 ? params.onBlockReply?.(payload) : params.onBlockReply?.(payload, { assistantMessageIndex }),
			label: "block reply",
			log,
			pending: pendingBlockReplyTasks,
			onSuccess: recordDeliveredReply,
			onError: recordDeliveryFailure
		});
	};
	const emitBlockReply = (payload, options) => {
		flushAssistantStream();
		const withAssistantDirectives = consumePendingAssistantReplyDirectivesIntoReply(state, payload);
		const pendingToolMedia = payload.isReasoning || options?.consumePendingToolMedia === false ? null : readPendingToolMediaReply(state);
		const withToolMedia = options?.consumePendingToolMedia === false ? withAssistantDirectives : consumePendingToolMediaIntoReply(state, withAssistantDirectives);
		const sentMediaUrls = new Set(state.messagingToolSentMediaUrls.map((url) => url.trim()));
		const autoDeliveryMediaUrls = params.sourceReplyDeliveryMode === "message_tool_only" ? (pendingToolMedia?.mediaUrls ?? []).filter((url) => state.toolAutoDeliveryMediaUrls.has(url.trim()) && !sentMediaUrls.has(url.trim())) : [];
		const pendingAttachments = new Map((pendingToolMedia?.mediaUrls ?? []).map((url, index) => [url.trim(), pendingToolMedia?.attachments?.[index] ?? {}]));
		const blockPayload = autoDeliveryMediaUrls.length === 0 ? withToolMedia : markReplyPayloadForSourceSuppressionDelivery({
			mediaUrls: autoDeliveryMediaUrls,
			mediaUrl: autoDeliveryMediaUrls[0],
			attachments: autoDeliveryMediaUrls.map((url) => pendingAttachments.get(url.trim()) ?? {}),
			audioAsVoice: pendingToolMedia?.audioAsVoice || void 0,
			trustedLocalMedia: true
		});
		const assistantTranscriptMediaUrls = Array.from(new Set(payload.mediaUrls ?? []));
		const taggedPayload = options?.assistantMessageIndex !== void 0 ? setReplyPayloadMetadata(blockPayload, {
			assistantMessageIndex: options.assistantMessageIndex,
			...assistantTranscriptMediaUrls.length > 0 ? { assistantTranscriptMediaUrls } : {}
		}) : blockPayload;
		if (state.deferBlockReplyDelivery) {
			if (pendingToolMedia) deferredToolMediaReplies.set(taggedPayload, {
				pendingToolMedia,
				autoDeliveryMediaUrls
			});
			state.deferredBlockReplies.push(taggedPayload);
			return;
		}
		emitBlockReplySafely(taggedPayload, {
			pendingToolMedia,
			autoDeliveryMediaUrls
		});
	};
	const flushDeferredBlockReplies = () => {
		for (const payload of state.deferredBlockReplies.splice(0)) {
			const deferredToolMedia = deferredToolMediaReplies.get(payload);
			emitBlockReplySafely(payload, deferredToolMedia);
		}
	};
	const clearDeferredBlockReplies = () => {
		state.deferredBlockReplies.length = 0;
	};
	const rememberAssistantText = (text, normalizedText) => {
		state.lastAssistantTextMessageIndex = state.assistantMessageIndex;
		state.lastAssistantTextContentIndex = state.lastAssistantStreamContentIndex;
		state.lastAssistantTextItemId = state.lastAssistantStreamItemId;
		state.lastAssistantTextTrimmed = text.trimEnd();
		const normalized = normalizedText ?? normalizeTextForComparison(text);
		state.lastAssistantTextNormalized = normalized.length > 0 ? normalized : void 0;
	};
	const shouldSkipAssistantText = (text, normalizedText) => {
		if (state.lastAssistantTextMessageIndex !== state.assistantMessageIndex || state.lastAssistantTextContentIndex !== state.lastAssistantStreamContentIndex) return false;
		const trimmed = text.trimEnd();
		if (trimmed && trimmed === state.lastAssistantTextTrimmed) return true;
		const normalized = normalizedText ?? normalizeTextForComparison(text);
		return normalized.length > 0 && normalized === state.lastAssistantTextNormalized;
	};
	const pushAssistantText = (text, normalizedText) => {
		if (!text) return;
		if (params.silentExpected && !isSilentReplyText(text, "NO_REPLY")) return;
		if (shouldSkipAssistantText(text, normalizedText)) return;
		assistantTexts.push(text);
		rememberAssistantText(text, normalizedText);
	};
	const replaceCurrentAssistantText = (text) => {
		const count = assistantTexts.length - state.assistantTextBaseline;
		if (!text) assistantTexts.splice(state.assistantTextBaseline, count);
		else if (count > 0) {
			assistantTexts.splice(state.assistantTextBaseline, count, text);
			rememberAssistantText(text);
		} else pushAssistantText(text);
	};
	const finalizeAssistantTexts = (args) => {
		const { text, addedDuringMessage, chunkerHasBuffered } = args;
		if (state.hasFlushedPartialText) {
			replaceCurrentAssistantText(text);
			state.hasFlushedPartialText = false;
			state.assistantTextBaseline = assistantTexts.length;
			return;
		}
		if (state.includeReasoning && text && !params.onBlockReply) {
			replaceCurrentAssistantText(text);
			state.suppressBlockChunks = true;
		} else if (!addedDuringMessage && !chunkerHasBuffered && text) pushAssistantText(text);
		state.assistantTextBaseline = assistantTexts.length;
	};
	const waitForPendingEvents = async (options) => {
		const includePartialReplies = options?.includePartialReplies !== false;
		while (true) {
			const eventChain = state.pendingEventChain;
			const partialReplyTasks = includePartialReplies ? [...pendingPartialReplyTasks] : [];
			if (!eventChain && partialReplyTasks.length === 0) return;
			await Promise.allSettled([...eventChain ? [eventChain] : [], ...partialReplyTasks]);
		}
	};
	return {
		assistantTexts,
		clearAssistantStream,
		clearDeferredBlockReplies,
		emitAssistantStreamData,
		emitBlockReply,
		finalizeAssistantTexts,
		flushAssistantStream,
		flushDeferredBlockReplies,
		pendingBlockReplyTasks,
		pushAssistantText,
		replaceCurrentAssistantText,
		shouldSkipAssistantText,
		waitForPendingEvents
	};
}
//#endregion
//#region src/agents/embedded-agent-subscribe.run-state.ts
function createEmbeddedAgentSubscribeState(params) {
	const reasoningMode = params.reasoningMode ?? "off";
	const canShowReasoning = params.thinkingLevel !== "off";
	const initialPendingToolMedia = collectAgentInternalEventMedia(params.internalEvents);
	return {
		assistantTexts: [],
		toolMetas: [],
		acceptedSessionSpawns: [],
		toolMetaById: /* @__PURE__ */ new Map(),
		toolSummaryById: /* @__PURE__ */ new Set(),
		liveEditDiffStateById: /* @__PURE__ */ new Map(),
		itemActiveIds: /* @__PURE__ */ new Set(),
		itemStartedCount: 0,
		itemCompletedCount: 0,
		assistantTurnCount: 0,
		lastToolError: void 0,
		blockReplyBreak: params.blockReplyBreak ?? "text_end",
		reasoningMode,
		includeReasoning: reasoningMode === "on" && canShowReasoning,
		shouldEmitPartialReplies: !(reasoningMode === "on" && !params.onBlockReply),
		streamReasoning: (params.streamReasoningInNonStreamModes === true ? reasoningMode !== "on" : reasoningMode === "stream") && canShowReasoning && typeof params.onReasoningStream === "function",
		deltaBuffer: "",
		streamBlockText: "",
		streamBlockOffset: 0,
		thinkingTagStream: createThinkingTagStreamState(),
		deltaBufferIsCommentary: false,
		hasFlushedPartialText: false,
		blockState: {
			thinking: false,
			final: false,
			inlineCode: createInlineCodeState()
		},
		partialBlockState: {
			thinking: false,
			final: false,
			inlineCode: createInlineCodeState()
		},
		assistantStream: void 0,
		lastStreamedReasoning: void 0,
		lastBlockReplyText: void 0,
		lastDeliveredBlockReplyText: void 0,
		deferBlockReplyDelivery: typeof params.onBeforeTerminalDelivery === "function",
		deferredBlockReplies: [],
		toolExecutionSinceLastBlockReply: false,
		reasoningStreamOpen: false,
		assistantMessageIndex: 0,
		assistantMessageStartIndex: 0,
		lastAssistantStreamContentIndex: void 0,
		lastAssistantStreamItemId: void 0,
		lastAssistantTextMessageIndex: -1,
		lastAssistantTextContentIndex: void 0,
		lastAssistantTextItemId: void 0,
		lastAssistantTextNormalized: void 0,
		lastAssistantTextTrimmed: void 0,
		assistantTextBaseline: 0,
		suppressBlockChunks: false,
		lastReasoningSent: void 0,
		compactionInFlight: false,
		lastCompactionTokensAfter: void 0,
		pendingCompactionRetry: 0,
		compactionRetryResolve: void 0,
		compactionRetryReject: void 0,
		compactionRetryPromise: null,
		unsubscribed: false,
		replayState: createEmbeddedRunReplayState(params.initialReplayState),
		livenessState: "working",
		hadDeterministicSideEffect: false,
		pendingEventChain: null,
		messagingToolSentTexts: [],
		messagingToolSentTextsNormalized: [],
		currentSourceMessagingToolSentTextsNormalized: [],
		currentSourceMessagingToolHeldPartial: void 0,
		messagingToolSentTargets: [],
		heartbeatToolResponse: void 0,
		messagingToolSentMediaUrls: [],
		messagingToolSourceReplyPayloads: [],
		messageToolOnlySourceReplyDelivered: false,
		pendingMessagingTexts: /* @__PURE__ */ new Map(),
		pendingMessagingTargets: /* @__PURE__ */ new Map(),
		successfulCronAdds: 0,
		pendingMessagingMediaUrls: /* @__PURE__ */ new Map(),
		pendingToolMediaUrls: initialPendingToolMedia.mediaUrls,
		pendingToolMediaAttachments: initialPendingToolMedia.attachments,
		pendingToolMediaTrustByUrl: initialPendingToolMedia.trustByUrl,
		toolAutoDeliveryMediaUrls: /* @__PURE__ */ new Set(),
		pendingToolAudioAsVoice: false,
		pendingToolMediaDeliveryFailed: false,
		hasToolMediaBlockReply: false,
		visibleBlockReplyCount: 0,
		pendingAssistantReplyDirectives: void 0,
		deterministicApprovalPromptPending: false,
		deterministicApprovalPromptSent: false
	};
}
//#endregion
//#region src/agents/embedded-agent-subscribe.stream-rendering.ts
const STREAM_STRIPPED_BLOCK_TAG_NAMES = [
	"final",
	"think",
	"thinking",
	"thought",
	"antthinking",
	"antml:think",
	"antml:thinking",
	"antml:thought",
	"mm:think",
	"mm:thinking",
	"mm:thought"
];
function isPotentialTrailingBlockTagFragment(fragment) {
	if (!fragment.startsWith("<") || fragment.includes(">")) return false;
	const body = fragment.toLowerCase().slice(1).trimStart().replace(/^\//, "").trimStart();
	if (!body) return true;
	const namePart = body.split(/[\s/>]/, 1)[0] ?? "";
	if (!namePart) return true;
	return STREAM_STRIPPED_BLOCK_TAG_NAMES.some((name) => {
		return name.startsWith(namePart) || namePart === name;
	});
}
function splitTrailingBlockTagFragment(text, isInsideCodeSpan) {
	const fragmentStart = text.lastIndexOf("<");
	if (fragmentStart === -1 || isInsideCodeSpan(fragmentStart)) return { text };
	const fragment = text.slice(fragmentStart);
	if (!isPotentialTrailingBlockTagFragment(fragment)) return { text };
	return {
		text: text.slice(0, fragmentStart),
		pendingTagFragment: fragment
	};
}
function splitTrailingFenceFragment(text, startsAtLineStart) {
	const lineStart = text.lastIndexOf("\n") + 1;
	const line = text.slice(lineStart);
	if (!startsAtLineStart && lineStart === 0 || !/^(?: {0,3})(?:`+|~+)$/.test(line)) return { text };
	return {
		text: text.slice(0, lineStart),
		pendingFenceFragment: line
	};
}
function createStreamRendering({ params, state, log, blockChunker, emitBlockReply, flushAssistantStream, pendingBlockReplyTasks, pushAssistantText, shouldSkipAssistantText }) {
	const messagingToolSentTextsNormalized = state.messagingToolSentTextsNormalized;
	const messagingToolSourceReplyPayloads = state.messagingToolSourceReplyPayloads;
	const replyDirectiveAccumulator = createStreamingDirectiveAccumulator();
	const partialReplyDirectiveAccumulator = createStreamingDirectiveAccumulator();
	const stripBlockTags = (text, stateLocal, options) => {
		const input = `${stateLocal.pendingFenceFragment ?? ""}${stateLocal.pendingTagFragment ?? ""}${text}`;
		stateLocal.pendingFenceFragment = void 0;
		stateLocal.pendingTagFragment = void 0;
		if (!input) return text;
		const { text: fenceInput, pendingFenceFragment } = options?.final ? {
			text: input,
			pendingFenceFragment: void 0
		} : options?.completeMarkdownChunk ? {
			text: input,
			pendingFenceFragment: void 0
		} : splitTrailingFenceFragment(input, stateLocal.fence?.atLineStart ?? true);
		stateLocal.pendingFenceFragment = pendingFenceFragment;
		if (!fenceInput) return "";
		const inlineStateStart = stateLocal.inlineCode ?? createInlineCodeState();
		const fenceStateStart = stateLocal.fence;
		const initialCodeSpans = buildCodeSpanIndex(fenceInput, inlineStateStart, fenceStateStart);
		const { text: scanText, pendingTagFragment } = options?.final ? {
			text: fenceInput,
			pendingTagFragment: void 0
		} : splitTrailingBlockTagFragment(fenceInput, initialCodeSpans.isInside);
		stateLocal.pendingTagFragment = pendingTagFragment;
		if (!scanText) return "";
		const codeSpans = scanText === fenceInput ? initialCodeSpans : buildCodeSpanIndex(scanText, inlineStateStart, fenceStateStart);
		let processed = "";
		THINKING_TAG_SCAN_RE.lastIndex = 0;
		let lastIndex = 0;
		let lastCodeIndex = 0;
		let inThinking = stateLocal.thinking;
		let hiddenInlineState = stateLocal.reasoningInlineCode ? { ...stateLocal.reasoningInlineCode } : createInlineCodeState();
		let hiddenFenceState = stateLocal.reasoningFence?.open ? {
			atLineStart: stateLocal.reasoningFence.atLineStart,
			open: { ...stateLocal.reasoningFence.open }
		} : stateLocal.reasoningFence ? { atLineStart: stateLocal.reasoningFence.atLineStart } : void 0;
		let hiddenPendingFenceFragment = stateLocal.reasoningPendingFenceFragment;
		stateLocal.reasoningPendingFenceFragment = void 0;
		const advanceHiddenCodeState = (segment) => {
			const hiddenInput = `${hiddenPendingFenceFragment ?? ""}${segment}`;
			hiddenPendingFenceFragment = void 0;
			if (!hiddenInput) return;
			const { text: hiddenFenceInput, pendingFenceFragment: pendingFenceFragmentLocal } = options?.final ? {
				text: hiddenInput,
				pendingFenceFragment: void 0
			} : options?.completeMarkdownChunk ? {
				text: hiddenInput,
				pendingFenceFragment: void 0
			} : splitTrailingFenceFragment(hiddenInput, hiddenFenceState?.atLineStart ?? true);
			hiddenPendingFenceFragment = pendingFenceFragmentLocal;
			if (!hiddenFenceInput) return;
			const next = buildCodeSpanIndex(hiddenFenceInput, hiddenInlineState, hiddenFenceState);
			hiddenInlineState = next.inlineState;
			hiddenFenceState = next.fenceState;
		};
		for (const match of scanText.matchAll(THINKING_TAG_SCAN_RE)) {
			const idx = match.index ?? 0;
			const isClose = match[1] === "/";
			if (inThinking) advanceHiddenCodeState(scanText.slice(lastCodeIndex, idx));
			const isInsideHiddenCode = inThinking && (hiddenInlineState.open || Boolean(hiddenFenceState?.open));
			lastCodeIndex = idx + match[0].length;
			if (!inThinking && codeSpans.isInside(idx) || isInsideHiddenCode) {
				if (inThinking) advanceHiddenCodeState(match[0]);
				continue;
			}
			if (!inThinking) {
				if (isClose) {
					const afterIndex = idx + match[0].length;
					const before = scanText.slice(lastIndex, idx);
					const after = scanText.slice(afterIndex);
					if (hasOrphanReasoningCloseBoundary({
						before,
						after
					})) processed = "";
					else processed += before;
					lastIndex = afterIndex;
					continue;
				}
				processed += scanText.slice(lastIndex, idx);
				hiddenInlineState = createInlineCodeState();
				hiddenFenceState = void 0;
				hiddenPendingFenceFragment = void 0;
			}
			inThinking = !isClose;
			if (!inThinking) {
				hiddenInlineState = createInlineCodeState();
				hiddenFenceState = void 0;
				hiddenPendingFenceFragment = void 0;
			}
			lastIndex = idx + match[0].length;
		}
		if (inThinking) advanceHiddenCodeState(scanText.slice(lastCodeIndex));
		if (!inThinking) processed += scanText.slice(lastIndex);
		stateLocal.thinking = inThinking;
		stateLocal.reasoningInlineCode = inThinking ? hiddenInlineState : void 0;
		stateLocal.reasoningFence = inThinking ? hiddenFenceState : void 0;
		stateLocal.reasoningPendingFenceFragment = inThinking ? hiddenPendingFenceFragment : void 0;
		const finalCodeSpans = processed === scanText ? codeSpans : buildCodeSpanIndex(processed, inlineStateStart, fenceStateStart);
		if (!params.enforceFinalTag) {
			stateLocal.inlineCode = finalCodeSpans.inlineState;
			stateLocal.fence = finalCodeSpans.fenceState;
			return stripFinalTagsOutsideCodeSpans(processed, finalCodeSpans.isInside);
		}
		let result = "";
		let lastFinalIndex = 0;
		let inFinal = stateLocal.final;
		let everInFinal = stateLocal.final;
		for (const match of findFinalTagMatches(processed)) {
			const idx = match.index;
			if (finalCodeSpans.isInside(idx)) continue;
			const isClose = match.isClose;
			if (match.isSelfClosing) {
				if (inFinal) {
					result += processed.slice(lastFinalIndex, idx);
					inFinal = false;
				} else {
					inFinal = true;
					everInFinal = true;
				}
				lastFinalIndex = idx + match.text.length;
			} else if (!inFinal && !isClose) {
				inFinal = true;
				everInFinal = true;
				lastFinalIndex = idx + match.text.length;
			} else if (inFinal && isClose) {
				result += processed.slice(lastFinalIndex, idx);
				inFinal = false;
				lastFinalIndex = idx + match.text.length;
			}
		}
		if (inFinal) result += processed.slice(lastFinalIndex);
		stateLocal.final = inFinal;
		if (!everInFinal) {
			stateLocal.inlineCode = createInlineCodeState();
			stateLocal.fence = finalCodeSpans.fenceState;
			stateLocal.finalInlineCode = void 0;
			stateLocal.finalFence = void 0;
			return "";
		}
		const finalResultInlineStateStart = stateLocal.finalInlineCode ?? createInlineCodeState();
		const finalResultFenceStateStart = stateLocal.finalFence;
		const resultCodeSpans = buildCodeSpanIndex(result, finalResultInlineStateStart, finalResultFenceStateStart);
		stateLocal.inlineCode = finalCodeSpans.inlineState;
		stateLocal.fence = finalCodeSpans.fenceState;
		stateLocal.finalInlineCode = inFinal ? resultCodeSpans.inlineState : void 0;
		stateLocal.finalFence = inFinal ? resultCodeSpans.fenceState : void 0;
		return stripFinalTagsOutsideCodeSpans(result, resultCodeSpans.isInside);
	};
	const stripFinalTagsOutsideCodeSpans = (text, isInside) => {
		let output = "";
		let lastIndex = 0;
		for (const match of findFinalTagMatches(text)) {
			const idx = match.index;
			if (isInside(idx)) continue;
			output += text.slice(lastIndex, idx);
			lastIndex = idx + match.text.length;
		}
		output += text.slice(lastIndex);
		return output;
	};
	const hasMessageToolOnlySourceDelivery = () => params.sourceReplyDeliveryMode === "message_tool_only" && (state.messageToolOnlySourceReplyDelivered || params.hasDeliveredMessageToolOnlySourceReply?.() === true || messagingToolSourceReplyPayloads.length > 0);
	const emitBlockChunk = (text, options) => {
		if (state.suppressBlockChunks || params.silentExpected || shouldSuppressDeterministicApprovalOutput(state)) return;
		const blockReplyText = (state.blockState.textIsVisible ? text : stripDowngradedToolCallText(stripBlockTags(text, state.blockState, {
			final: options?.final === true,
			completeMarkdownChunk: options?.completeMarkdownChunk === true
		}))).trimEnd();
		if (!blockReplyText && !options?.finalReply) return;
		const markBlockReplyTextHandled = () => {
			if (blockReplyText) {
				state.lastBlockReplyText = blockReplyText;
				state.lastDeliveredBlockReplyText = blockReplyText;
			}
			state.toolExecutionSinceLastBlockReply = false;
		};
		if (hasMessageToolOnlySourceDelivery()) {
			markBlockReplyTextHandled();
			return;
		}
		let chunk = blockReplyText;
		let slicedPrefixReplay = false;
		const lastDeliveredBlockReplyText = state.lastDeliveredBlockReplyText;
		const blockReplySuffix = lastDeliveredBlockReplyText ? blockReplyText.slice(lastDeliveredBlockReplyText.length) : "";
		const prefixReplayCandidate = Boolean(state.blockReplyBreak === "text_end" && state.toolExecutionSinceLastBlockReply && lastDeliveredBlockReplyText && lastDeliveredBlockReplyText.trimEnd().endsWith(":") && blockReplyText.length > lastDeliveredBlockReplyText.length && blockReplyText.startsWith(lastDeliveredBlockReplyText));
		if (prefixReplayCandidate && !/^\s/.test(blockReplySuffix)) {
			chunk = blockReplySuffix;
			slicedPrefixReplay = true;
		}
		if (!chunk && !options?.finalReply) return;
		const normalizedChunk = normalizeTextForComparison(chunk);
		const normalizedReplaySuffix = prefixReplayCandidate ? normalizeTextForComparison(blockReplySuffix.trimStart()) : "";
		if (isMessagingToolDuplicateNormalized(normalizedChunk, messagingToolSentTextsNormalized) || prefixReplayCandidate && isMessagingToolDuplicateNormalized(normalizedReplaySuffix, messagingToolSentTextsNormalized)) {
			log.debug(`Skipping block reply - already sent via messaging tool: ${truncateUtf16Safe(chunk, 50)}...`);
			if (prefixReplayCandidate) markBlockReplyTextHandled();
			return;
		}
		if (chunk && shouldSkipAssistantText(chunk, normalizedChunk)) {
			if (slicedPrefixReplay) markBlockReplyTextHandled();
			if (!options?.finalReply) return;
			chunk = "";
		}
		if (!params.onBlockReply) {
			pushAssistantText(chunk, normalizedChunk);
			markBlockReplyTextHandled();
			return;
		}
		let splitResult = replyDirectiveAccumulator.consume(chunk, { final: options?.finalReply !== void 0 });
		if (options?.finalReply) {
			let pendingText = splitResult?.text ?? "";
			if (pendingText && !options.finalReply.text.endsWith(pendingText)) {
				const whitespace = pendingText.match(/^\s+/u)?.[0] ?? "";
				pendingText = splitMediaFromOutput(pendingText).text;
				if (pendingText && whitespace && !pendingText.startsWith(whitespace)) pendingText = `${whitespace}${pendingText}`;
			}
			if (pendingText.trim() === options.finalReply.text) {
				pendingText = options.finalReply.text;
				chunk = chunk.trimStart();
			}
			splitResult = {
				...splitResult,
				...options.finalReply,
				text: pendingText
			};
		}
		if (!splitResult) {
			if (slicedPrefixReplay) markBlockReplyTextHandled();
			return;
		}
		const { text: cleanedText, mediaUrls, audioAsVoice, replyToId, replyToTag, replyToCurrent } = splitResult;
		const hasPendingFinalMedia = Boolean(options?.finalReply?.text && state.pendingToolMediaUrls.length);
		if (!cleanedText && (!mediaUrls || mediaUrls.length === 0) && !audioAsVoice && !hasPendingFinalMedia) {
			if (slicedPrefixReplay) markBlockReplyTextHandled();
			return;
		}
		pushAssistantText(chunk, normalizedChunk);
		emitBlockReply({
			text: cleanedText,
			mediaUrls: mediaUrls?.length ? mediaUrls : void 0,
			audioAsVoice,
			replyToId,
			replyToTag,
			replyToCurrent
		}, {
			assistantMessageIndex: options?.assistantMessageIndex ?? state.assistantMessageIndex,
			consumePendingToolMedia: options?.finalReply !== void 0 || Boolean(mediaUrls?.length || audioAsVoice)
		});
		markBlockReplyTextHandled();
	};
	const consumePartialReplyDirectives = (text, options) => partialReplyDirectiveAccumulator.consume(text, options);
	const resetPartialReplyDirectives = () => {
		partialReplyDirectiveAccumulator.reset();
		state.pendingAssistantReplyDirectives = void 0;
	};
	const flushBlockReplyBuffer = (options) => {
		flushAssistantStream();
		if (!params.onBlockReply) return;
		let pendingChunk;
		if (blockChunker.hasBuffered()) blockChunker.drain({
			force: true,
			emit: (text) => {
				if (pendingChunk !== void 0) emitBlockChunk(pendingChunk, {
					assistantMessageIndex: options?.assistantMessageIndex,
					completeMarkdownChunk: true
				});
				pendingChunk = text;
			}
		});
		if (pendingChunk !== void 0 || options?.final) emitBlockChunk(pendingChunk ?? "", {
			...options,
			completeMarkdownChunk: options?.final === true
		});
		if (pendingBlockReplyTasks.size === 0) return;
		return (async () => {
			while (pendingBlockReplyTasks.size > 0) await Promise.allSettled(pendingBlockReplyTasks);
		})();
	};
	const emitReasoningStream = (text) => {
		if (params.silentExpected) return;
		const trimmed = text.trim();
		if (!trimmed) return;
		if (trimmed === state.lastStreamedReasoning) return;
		flushAssistantStream();
		const prior = state.lastStreamedReasoning ?? "";
		const delta = trimmed.startsWith(prior) ? trimmed.slice(prior.length) : trimmed;
		state.lastStreamedReasoning = trimmed;
		emitAgentEvent({
			runId: params.runId,
			stream: "thinking",
			data: {
				text: trimmed,
				delta
			}
		});
		if (state.streamReasoning && !hasMessageToolOnlySourceDelivery() && params.onReasoningStream) runBestEffortCallback({
			label: "reasoning stream",
			log,
			callback: () => params.onReasoningStream?.({
				text: trimmed,
				...state.reasoningMode === "stream" ? {} : { requiresReasoningProgressOptIn: true }
			})
		});
	};
	const resetAssistantMessageState = (nextAssistantTextBaseline) => {
		flushAssistantStream();
		state.deltaBuffer = "";
		state.streamBlockText = "";
		state.streamBlockOffset = 0;
		state.thinkingTagStream = createThinkingTagStreamState();
		state.deltaBufferIsCommentary = false;
		state.hasFlushedPartialText = false;
		blockChunker.reset();
		replyDirectiveAccumulator.reset();
		resetPartialReplyDirectives();
		state.blockState = {
			thinking: false,
			final: false,
			inlineCode: createInlineCodeState()
		};
		state.partialBlockState = {
			thinking: false,
			final: false,
			inlineCode: createInlineCodeState()
		};
		state.assistantStream = void 0;
		state.currentSourceMessagingToolHeldPartial = void 0;
		state.lastBlockReplyText = void 0;
		state.lastStreamedReasoning = void 0;
		state.lastReasoningSent = void 0;
		state.reasoningStreamOpen = false;
		state.suppressBlockChunks = false;
		state.assistantMessageIndex += 1;
		state.lastAssistantStreamContentIndex = void 0;
		state.lastAssistantStreamItemId = void 0;
		state.assistantTextBaseline = nextAssistantTextBaseline;
	};
	return {
		consumePartialReplyDirectives,
		resetBlockReplyDirectives: replyDirectiveAccumulator.reset,
		resetPartialReplyDirectives,
		emitBlockChunk,
		emitReasoningStream,
		flushBlockReplyBuffer,
		resetAssistantMessageState,
		stripBlockTags
	};
}
//#endregion
//#region src/agents/embedded-agent-subscribe.tool-lifecycle.ts
function createEmbeddedToolLifecycleRunner(ctx) {
	return async (toolParams) => {
		ctx.flushAssistantStream();
		await handleToolExecutionStart(ctx, {
			type: "tool_execution_start",
			toolName: toolParams.toolName,
			toolCallId: toolParams.toolCallId,
			args: toolParams.args,
			replaySafe: toolParams.replaySafe,
			hideFromChannelProgress: toolParams.hideFromChannelProgress,
			lifecycleProvenance: "nested"
		});
		let executionStarted = false;
		const onImplementationStart = () => {
			executionStarted = true;
		};
		let completedResult;
		try {
			completedResult = await toolParams.execute(onImplementationStart);
		} catch (error) {
			const trustedNoStart = consumeTrustedToolNoStartError(error);
			const result = buildToolLifecycleErrorResult(error);
			const terminal = await finishToolLifecycle(ctx, toolParams, {
				executionStarted,
				isError: true,
				result
			});
			const effectReceipt = trustedNoStart ? { state: "not_started" } : terminal.effectReceipt;
			await notifyTerminal(toolParams.onTerminal, {
				...terminal,
				effectReceipt
			});
			throw registerToolEffectReceipt(error, effectReceipt);
		}
		const terminal = await finishToolLifecycle(ctx, toolParams, {
			executionStarted,
			isError: false,
			result: completedResult
		});
		await notifyTerminal(toolParams.onTerminal, terminal);
		return registerToolEffectReceipt(completedResult, terminal.effectReceipt);
	};
}
async function finishToolLifecycle(ctx, toolParams, outcome) {
	ctx.flushAssistantStream();
	const terminal = await handleToolExecutionEnd(ctx, {
		type: "tool_execution_end",
		toolName: toolParams.toolName,
		toolCallId: toolParams.toolCallId,
		isError: outcome.isError,
		executionStarted: outcome.executionStarted,
		result: outcome.result,
		hideFromChannelProgress: toolParams.hideFromChannelProgress
	});
	return {
		result: outcome.result,
		isError: terminal.isError,
		executedArguments: terminal.executedArguments ?? toolParams.args,
		effectReceipt: terminal.effectReceipt
	};
}
async function notifyTerminal(callback, terminal) {
	try {
		await callback?.(terminal);
	} catch (error) {
		throw registerToolEffectReceipt(error, terminal.effectReceipt);
	}
}
//#endregion
//#region src/agents/embedded-agent-subscribe.ts
/**
* Subscribes to embedded-agent sessions and streams formatted replies/events.
*/
const embeddedLog = createSubsystemLogger("agent/embedded");
function resolveEmbeddedAgentSessionLogger(messageChannel) {
	const normalizedChannel = normalizeMessageChannel(messageChannel);
	if (normalizedChannel && isDeliverableMessageChannel(normalizedChannel)) return createSubsystemLogger(`gateway/channels/${normalizedChannel}`);
	return embeddedLog;
}
function subscribeEmbeddedAgentSession(params) {
	const log = resolveEmbeddedAgentSessionLogger(params.messageChannel);
	const useMarkdown = (params.toolResultFormat ?? "markdown") === "markdown";
	const state = createEmbeddedAgentSubscribeState(params);
	const { captureModelEvent, recordAuxiliaryUsage, getUsageTotals, getLastAssistantUsage, getCurrentAttemptAssistant } = createEmbeddedModelState(params, log);
	let compactionCount = 0;
	const assistantTexts = state.assistantTexts;
	const toolMetas = state.toolMetas;
	const toolMetaById = state.toolMetaById;
	const toolSummaryById = state.toolSummaryById;
	const messagingToolSentTexts = state.messagingToolSentTexts;
	const messagingToolSentTextsNormalized = state.messagingToolSentTextsNormalized;
	const messagingToolSentTargets = state.messagingToolSentTargets;
	const messagingToolSentMediaUrls = state.messagingToolSentMediaUrls;
	const messagingToolSourceReplyPayloads = state.messagingToolSourceReplyPayloads;
	const pendingMessagingTexts = state.pendingMessagingTexts;
	const pendingMessagingTargets = state.pendingMessagingTargets;
	const replyDelivery = createReplyDelivery({
		params,
		state,
		log
	});
	const { clearAssistantStream, clearDeferredBlockReplies, emitAssistantStreamData, emitBlockReply, finalizeAssistantTexts, flushAssistantStream, flushDeferredBlockReplies } = replyDelivery;
	const MAX_MESSAGING_SENT_TEXTS = 200;
	const MAX_CURRENT_SOURCE_MESSAGING_SENT_TEXTS = 200;
	const MAX_MESSAGING_SENT_TARGETS = 200;
	const MAX_MESSAGING_SENT_MEDIA_URLS = 200;
	const MAX_MESSAGING_SOURCE_REPLY_PAYLOADS = 200;
	const trimMessagingToolSent = () => {
		if (messagingToolSentTexts.length > MAX_MESSAGING_SENT_TEXTS) {
			const overflow = messagingToolSentTexts.length - MAX_MESSAGING_SENT_TEXTS;
			messagingToolSentTexts.splice(0, overflow);
			messagingToolSentTextsNormalized.splice(0, overflow);
		}
		if (state.currentSourceMessagingToolSentTextsNormalized.length > MAX_CURRENT_SOURCE_MESSAGING_SENT_TEXTS) {
			const overflow = state.currentSourceMessagingToolSentTextsNormalized.length - MAX_CURRENT_SOURCE_MESSAGING_SENT_TEXTS;
			state.currentSourceMessagingToolSentTextsNormalized.splice(0, overflow);
		}
		if (messagingToolSentTargets.length > MAX_MESSAGING_SENT_TARGETS) {
			const overflow = messagingToolSentTargets.length - MAX_MESSAGING_SENT_TARGETS;
			messagingToolSentTargets.splice(0, overflow);
		}
		if (messagingToolSentMediaUrls.length > MAX_MESSAGING_SENT_MEDIA_URLS) {
			const overflow = messagingToolSentMediaUrls.length - MAX_MESSAGING_SENT_MEDIA_URLS;
			messagingToolSentMediaUrls.splice(0, overflow);
		}
		if (messagingToolSourceReplyPayloads.length > MAX_MESSAGING_SOURCE_REPLY_PAYLOADS) {
			const overflow = messagingToolSourceReplyPayloads.length - MAX_MESSAGING_SOURCE_REPLY_PAYLOADS;
			messagingToolSourceReplyPayloads.splice(0, overflow);
		}
	};
	const ensureCompactionPromise = () => {
		if (!state.compactionRetryPromise) {
			state.compactionRetryPromise = new Promise((resolve, reject) => {
				state.compactionRetryResolve = resolve;
				state.compactionRetryReject = reject;
			});
			state.compactionRetryPromise.catch((err) => {
				log.debug(`compaction promise rejected (no waiter): ${String(err)}`);
			});
		}
	};
	const noteCompactionRetry = () => {
		state.pendingCompactionRetry += 1;
		ensureCompactionPromise();
	};
	const resolveCompactionPromiseIfIdle = () => {
		if (state.pendingCompactionRetry !== 0 || state.compactionInFlight) return;
		state.compactionRetryResolve?.();
		state.compactionRetryResolve = void 0;
		state.compactionRetryReject = void 0;
		state.compactionRetryPromise = null;
	};
	const resolveCompactionRetry = () => {
		if (state.pendingCompactionRetry <= 0) return;
		state.pendingCompactionRetry -= 1;
		resolveCompactionPromiseIfIdle();
	};
	const maybeResolveCompactionWait = () => {
		resolveCompactionPromiseIfIdle();
	};
	const incrementCompactionCount = () => {
		compactionCount += 1;
	};
	const noteCompactionTokensAfter = (value) => {
		if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return;
		state.lastCompactionTokensAfter = Math.floor(value);
	};
	const blockChunking = params.blockReplyChunking;
	const blockChunker = new EmbeddedBlockChunker(blockChunking);
	const shouldEmitToolResult = () => typeof params.shouldEmitToolResult === "function" ? params.shouldEmitToolResult() : params.verboseLevel === "on" || params.verboseLevel === "full";
	const shouldEmitToolOutput = () => typeof params.shouldEmitToolOutput === "function" ? params.shouldEmitToolOutput() : params.verboseLevel === "full";
	const formatToolOutputBlock = (text) => {
		const trimmed = text.trim();
		if (!trimmed) return "(no output)";
		if (!useMarkdown) return trimmed;
		return `\`\`\`txt\n${trimmed}\n\`\`\``;
	};
	const emitToolResultMessage = (toolName, message, result) => {
		if (!params.onToolResult) return;
		const parsed = parseInlineDirectives(message, {
			stripAudioTag: true,
			stripReplyTags: true
		});
		const mediaArtifact = result ? extractToolResultMediaArtifact(result) : void 0;
		const filteredMediaUrls = filterToolResultMediaUrls(toolName, mediaArtifact?.mediaUrls ?? [], result, params.trustedLocalMediaToolNames);
		if (params.sourceReplyDeliveryMode === "message_tool_only" && parsed.text && filteredMediaUrls.length === 0 && hasCommittedMessagingToolDeliveryEvidence({
			messagingToolSentTexts,
			messagingToolSentMediaUrls,
			messagingToolSentTargets
		})) return;
		if (!parsed.text && filteredMediaUrls.length === 0) return;
		runBestEffortCallback({
			label: "tool result",
			log,
			callback: () => params.onToolResult?.({
				text: parsed.text,
				mediaUrls: filteredMediaUrls.length ? filteredMediaUrls : void 0,
				...mediaArtifact?.audioAsVoice ? { audioAsVoice: true } : {}
			})
		});
	};
	const emitToolSummary = (toolName, meta, commandBearing) => {
		const visibleMeta = params.verboseLevel === "full" || !commandBearing ? meta : void 0;
		const agg = formatToolAggregate(toolName, visibleMeta ? [visibleMeta] : void 0, { markdown: useMarkdown });
		emitToolResultMessage(toolName, agg);
	};
	const emitToolOutput = (toolName, meta, output, result) => {
		if (!output) return;
		const message = `${formatToolAggregate(toolName, meta ? [meta] : void 0, { markdown: useMarkdown })}\n${formatToolOutputBlock(output)}`;
		emitToolResultMessage(toolName, message, result);
	};
	const { consumePartialReplyDirectives, emitBlockChunk, emitReasoningStream, flushBlockReplyBuffer, resetAssistantMessageState, resetBlockReplyDirectives, resetPartialReplyDirectives, stripBlockTags } = createStreamRendering({
		params,
		state,
		log,
		blockChunker,
		emitBlockReply: replyDelivery.emitBlockReply,
		flushAssistantStream,
		pendingBlockReplyTasks: replyDelivery.pendingBlockReplyTasks,
		pushAssistantText: replyDelivery.pushAssistantText,
		shouldSkipAssistantText: replyDelivery.shouldSkipAssistantText
	});
	const resetForCompactionRetry = () => {
		state.hadDeterministicSideEffect = state.hadDeterministicSideEffect === true || hasCommittedMessagingToolDeliveryEvidence({
			messagingToolSentTexts,
			messagingToolSentMediaUrls,
			messagingToolSentTargets
		}) || state.successfulCronAdds > 0 || state.acceptedSessionSpawns.length > 0 || state.visibleBlockReplyCount > 0;
		assistantTexts.length = 0;
		state.lastAssistantTextMessageIndex = -1;
		state.lastAssistantTextContentIndex = void 0;
		state.lastAssistantTextItemId = void 0;
		state.lastAssistantTextNormalized = void 0;
		state.lastAssistantTextTrimmed = void 0;
		toolMetas.length = 0;
		toolMetaById.clear();
		toolSummaryById.clear();
		state.liveEditDiffStateById.clear();
		state.itemActiveIds.clear();
		state.itemStartedCount = 0;
		state.itemCompletedCount = 0;
		if (state.lastToolError?.mutatingAction !== true) state.lastToolError = void 0;
		messagingToolSentTexts.length = 0;
		messagingToolSentTextsNormalized.length = 0;
		state.currentSourceMessagingToolSentTextsNormalized.length = 0;
		messagingToolSentTargets.length = 0;
		messagingToolSentMediaUrls.length = 0;
		pendingMessagingTexts.clear();
		pendingMessagingTargets.clear();
		state.heartbeatToolResponse = void 0;
		state.pendingMessagingMediaUrls.clear();
		state.pendingToolMediaUrls = [];
		state.pendingToolMediaAttachments = [];
		state.pendingToolMediaTrustByUrl.clear();
		state.toolAutoDeliveryMediaUrls.clear();
		state.pendingToolAudioAsVoice = false;
		state.pendingToolMediaDeliveryFailed = false;
		state.visibleBlockReplyCount = 0;
		state.deferBlockReplyDelivery = typeof params.onBeforeTerminalDelivery === "function";
		clearAssistantStream();
		clearDeferredBlockReplies();
		state.deterministicApprovalPromptPending = false;
		state.deterministicApprovalPromptSent = false;
		state.lastDeliveredBlockReplyText = void 0;
		state.toolExecutionSinceLastBlockReply = false;
		state.replayState = mergeEmbeddedRunReplayState(state.replayState, params.initialReplayState);
		state.livenessState = "working";
		resetAssistantMessageState(0);
	};
	const noteLastAssistant = (msg) => {
		if (msg?.role === "assistant") state.lastAssistant = msg;
	};
	const finalizeFlushedAssistantText = (text) => stripDowngradedToolCallText(stripBlockTags(text, {
		thinking: false,
		final: false,
		inlineCode: createInlineCodeState()
	}, { final: true })).trimEnd();
	const flushPartialAssistantText = () => {
		const text = state.deltaBuffer;
		if (!text) return;
		if (state.deltaBufferIsCommentary) {
			state.hasFlushedPartialText = false;
			return;
		}
		const visibleText = finalizeFlushedAssistantText(text);
		if (assistantTexts.length > state.assistantTextBaseline || state.hasFlushedPartialText) replyDelivery.replaceCurrentAssistantText(visibleText);
		else if (visibleText) replyDelivery.pushAssistantText(visibleText);
		state.hasFlushedPartialText = Boolean(visibleText);
	};
	const ctx = {
		params,
		state,
		log,
		blockChunking,
		blockChunker,
		hookRunner: params.hookRunner,
		builtinToolNames: params.builtinToolNames,
		trustedLocalMediaToolNames: params.trustedLocalMediaToolNames,
		noteLastAssistant,
		shouldEmitToolResult,
		shouldEmitToolOutput,
		emitToolSummary,
		emitToolOutput,
		stripBlockTags,
		emitBlockChunk,
		flushBlockReplyBuffer,
		emitAssistantStreamData,
		emitBlockReply,
		flushAssistantStream,
		flushDeferredBlockReplies,
		clearAssistantStream,
		clearDeferredBlockReplies,
		emitReasoningStream,
		consumePartialReplyDirectives,
		resetBlockReplyDirectives,
		resetPartialReplyDirectives,
		resetAssistantMessageState,
		resetForCompactionRetry,
		finalizeAssistantTexts,
		trimMessagingToolSent,
		consumeToolSendReceipt: (toolCallId) => consumeEmbeddedToolReceipt(params.session.sessionManager, toolCallId),
		ensureCompactionPromise,
		noteCompactionRetry,
		resolveCompactionRetry,
		maybeResolveCompactionWait,
		captureModelEvent,
		incrementCompactionCount,
		noteCompactionTokensAfter,
		getUsageTotals,
		getLastAssistantUsage,
		getCompactionCount: () => compactionCount,
		getLastCompactionTokensAfter: () => state.lastCompactionTokensAfter
	};
	const sessionUnsubscribe = params.session.subscribe(createEmbeddedAgentSessionEventHandler(ctx));
	setSessionModelUsageSink(params.session.sessionManager, recordAuxiliaryUsage);
	const unsubscribe = () => {
		if (state.unsubscribed) return;
		state.unsubscribed = true;
		clearAssistantStream();
		cleanupRunToolStartData(params.runId);
		state.liveEditDiffStateById.clear();
		if (state.compactionRetryPromise) {
			log.debug(`unsubscribe: rejecting compaction wait runId=${params.runId}`);
			const reject = state.compactionRetryReject;
			state.compactionRetryResolve = void 0;
			state.compactionRetryReject = void 0;
			state.compactionRetryPromise = null;
			const abortErr = /* @__PURE__ */ new Error("Unsubscribed during compaction");
			abortErr.name = "AbortError";
			reject?.(abortErr);
		}
		if (params.session.isCompacting) {
			log.debug(`unsubscribe: aborting in-flight compaction runId=${params.runId}`);
			try {
				params.session.abortCompaction();
			} catch (err) {
				log.warn(`unsubscribe: compaction abort failed runId=${params.runId} err=${String(err)}`);
			}
		}
		setSessionModelUsageSink(params.session.sessionManager, null);
		sessionUnsubscribe();
	};
	return {
		assistantTexts,
		getCurrentAttemptAssistant,
		getLastAssistantTextMessageIndex: () => state.lastAssistantTextMessageIndex >= 0 ? state.lastAssistantTextMessageIndex : void 0,
		toolMetas,
		getAcceptedSessionSpawns: () => state.acceptedSessionSpawns.slice(),
		getLatestMcpAppChannelView: () => state.latestMcpAppChannelView ? { ...state.latestMcpAppChannelView } : void 0,
		getLatestMcpConnectAction: () => state.latestMcpConnectAction ? { ...state.latestMcpConnectAction } : void 0,
		runToolLifecycle: createEmbeddedToolLifecycleRunner(ctx),
		unsubscribe,
		setTerminalLifecycleMeta: (meta) => {
			if (typeof meta.replayInvalid === "boolean") state.replayState = {
				...state.replayState,
				replayInvalid: meta.replayInvalid
			};
			if (meta.livenessState) state.livenessState = meta.livenessState;
			if (typeof meta.stopReason === "string") state.terminalStopReason = meta.stopReason;
			if (typeof meta.yielded === "boolean") state.yielded = meta.yielded;
			if (meta.timeoutPhase) state.timeoutPhase = meta.timeoutPhase;
			if (typeof meta.providerStarted === "boolean") state.providerStarted = meta.providerStarted;
			if (typeof meta.aborted === "boolean") state.terminalAborted = meta.aborted;
		},
		isCompacting: () => state.compactionInFlight || state.pendingCompactionRetry > 0,
		isCompactionInFlight: () => state.compactionInFlight,
		getMessagingToolSentTexts: () => messagingToolSentTexts.slice(),
		getMessagingToolSentMediaUrls: () => messagingToolSentMediaUrls.slice(),
		getMessagingToolSentTargets: () => messagingToolSentTargets.slice(),
		getMessagingToolSourceReplyPayloads: () => messagingToolSourceReplyPayloads.slice(),
		getHeartbeatToolResponse: () => state.heartbeatToolResponse ? { ...state.heartbeatToolResponse } : void 0,
		getPendingToolMediaReply: () => readPendingToolMediaReply(state),
		getToolAutoDeliveryMediaUrls: () => [...state.toolAutoDeliveryMediaUrls],
		hasToolMediaBlockReply: () => state.hasToolMediaBlockReply,
		getVisibleBlockReplyCount: () => state.visibleBlockReplyCount,
		getSuccessfulCronAdds: () => state.successfulCronAdds,
		getReplayState: () => ({ ...state.replayState }),
		didSendViaMessagingTool: () => hasCommittedMessagingToolDeliveryEvidence({
			messagingToolSentTexts,
			messagingToolSentMediaUrls,
			messagingToolSentTargets
		}),
		didSendDeterministicApprovalPrompt: () => state.deterministicApprovalPromptSent,
		getLastToolError: () => state.lastToolError ? { ...state.lastToolError } : void 0,
		getUsageTotals,
		getLastAssistantUsage,
		getCompactionCount: () => compactionCount,
		getLastCompactionTokensAfter: () => state.lastCompactionTokensAfter,
		getAssistantTurnCount: () => state.assistantTurnCount,
		waitForPendingEvents: replyDelivery.waitForPendingEvents,
		flushPartialAssistantText,
		getItemLifecycle: () => ({
			startedCount: state.itemStartedCount,
			completedCount: state.itemCompletedCount,
			activeCount: state.itemActiveIds.size
		}),
		waitForCompactionRetry: () => {
			if (state.unsubscribed) {
				const err = /* @__PURE__ */ new Error("Unsubscribed during compaction wait");
				err.name = "AbortError";
				return Promise.reject(err);
			}
			if (state.compactionInFlight || state.pendingCompactionRetry > 0) {
				ensureCompactionPromise();
				return state.compactionRetryPromise ?? Promise.resolve();
			}
			return new Promise((resolve, reject) => {
				queueMicrotask(() => {
					if (state.unsubscribed) {
						const err = /* @__PURE__ */ new Error("Unsubscribed during compaction wait");
						err.name = "AbortError";
						reject(err);
						return;
					}
					if (state.compactionInFlight || state.pendingCompactionRetry > 0) {
						ensureCompactionPromise();
						(state.compactionRetryPromise ?? Promise.resolve()).then(resolve, reject);
					} else resolve();
				});
			});
		}
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-queue-message.ts
/**
* Steers active embedded sessions and waits for transcript commits when needed.
*/
/** Default wait for a steered user message to appear in the active transcript. */
const DEFAULT_QUEUE_TRANSCRIPT_COMMIT_TIMEOUT_MS = 12e4;
var EmbeddedSteeringAcceptedUnconfirmedError = class extends Error {
	constructor(message, options) {
		super(message, options);
		this.name = "EmbeddedSteeringAcceptedUnconfirmedError";
	}
};
function steerActiveSession(activeSession, text, images, userTurnTranscriptRecorder, media, imageOrder, queueIdentity, canInject) {
	if (canInject) return activeSession.steer(text, images, userTurnTranscriptRecorder, media, imageOrder, queueIdentity, canInject);
	if (media?.length || queueIdentity) return activeSession.steer(text, images, userTurnTranscriptRecorder, media, imageOrder, queueIdentity);
	return userTurnTranscriptRecorder ? activeSession.steer(text, images, userTurnTranscriptRecorder) : activeSession.steer(text, images);
}
function isQueuedUserMessageEnd(event, queueIdentity) {
	if (!event || typeof event !== "object") return false;
	const record = event;
	return record.type === "message_end" && getSteeringMessageIdentity(record.message) === queueIdentity;
}
function getTerminalActiveSessionEvent(event) {
	if (!event || typeof event !== "object") return;
	const type = event.type;
	if (type === "agent_settled") return "settled";
	return type === "agent_handoff" ? "handoff" : void 0;
}
/**
* Removes one pending steered user message from both the runtime queue and its
* exact identity-owned display entry.
*/
async function cancelQueuedSteeringMessage(activeSession, queueIdentity) {
	const cancelSteeringMessage = activeSession.agent?.cancelSteeringMessage;
	if (!cancelSteeringMessage) return false;
	const message = cancelSteeringMessage.call(activeSession.agent, (queuedMessage) => getSteeringMessageIdentity(queuedMessage) === queueIdentity);
	if (!message) return false;
	try {
		if (!retireQueuedUserMessage(message)) log$5.warn("failed to retire queued steering display entry during cancellation");
	} catch (error) {
		log$5.warn(`failed to retire queued steering display entry: ${String(error)}`);
	}
	return true;
}
/**
* Sends a steering message and resolves only after the matching user
* `message_end` event appears. If the run ends or times out first, the pending
* queue entry is removed so an abandoned steer does not leak into a later turn.
*/
async function steerAndWaitForTranscriptCommit(activeSession, text, timeoutMs, userTurnTranscriptRecorder, images, media, imageOrder, queueIdentity = crypto.randomUUID(), abortSignal, onQueueAccepted, canInject) {
	await new Promise((resolve, reject) => {
		let settled = false;
		let accepted = false;
		let abortRequested = abortSignal?.aborted === true;
		let acceptanceReported = false;
		let cancellation;
		let acceptanceOpen = true;
		const reportAcceptance = (value) => {
			if (acceptanceReported) return;
			acceptanceReported = true;
			onQueueAccepted?.(value);
		};
		const finish = (err) => {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			unsubscribe?.();
			unsubscribePersistenceFailure?.();
			abortSignal?.removeEventListener("abort", onAbort);
			if (err) {
				reject(toErrorObject(err, "Non-Error rejection"));
				return;
			}
			resolve();
		};
		const rejectAfterCancellation = (message, allowReplay = false) => {
			acceptanceOpen = false;
			const wasAccepted = accepted;
			if (!wasAccepted) reportAcceptance(false);
			cancellation ??= cancelQueuedSteeringMessage(activeSession, queueIdentity).then((removed) => {
				if (!removed && wasAccepted && !allowReplay) {
					log$5.warn("failed to find queued steering message for cancellation");
					throw new EmbeddedSteeringAcceptedUnconfirmedError(message);
				}
			});
			cancellation.then(() => finish(new Error(message)), (error) => {
				if (!(error instanceof EmbeddedSteeringAcceptedUnconfirmedError)) log$5.warn(`failed to cancel queued steering message: ${String(error)}`);
				finish(error instanceof EmbeddedSteeringAcceptedUnconfirmedError ? error : wasAccepted && !allowReplay ? new EmbeddedSteeringAcceptedUnconfirmedError(message, { cause: error }) : new Error(message, { cause: error }));
			});
		};
		const rejectBeforeAcceptance = (message) => {
			acceptanceOpen = false;
			reportAcceptance(false);
			finish(new Error(message));
		};
		const timer = setTimeout(() => {
			rejectAfterCancellation("queued steering message was not committed to the transcript before timeout");
		}, Math.max(1, timeoutMs));
		timer.unref?.();
		const unsubscribe = activeSession.subscribe((event) => {
			if (isQueuedUserMessageEnd(event, queueIdentity)) {
				finish();
				return;
			}
			const terminalEvent = getTerminalActiveSessionEvent(event);
			if (terminalEvent) {
				const handedOff = terminalEvent === "handoff";
				rejectAfterCancellation(`active session ${handedOff ? "handed off" : "ended"} before queued steering message was committed to the transcript`, handedOff);
			}
		});
		const unsubscribePersistenceFailure = subscribeSteeringMessagePersistenceFailure(queueIdentity, (error) => finish(error));
		if (abortRequested) {
			rejectBeforeAcceptance("queued steering message was cancelled before acceptance");
			return;
		}
		steerActiveSession(activeSession, text, images, userTurnTranscriptRecorder, media, imageOrder, queueIdentity, () => acceptanceOpen && (canInject?.() ?? true)).then(() => {
			if (!acceptanceOpen) return;
			accepted = true;
			reportAcceptance(true);
			if (abortRequested) rejectAfterCancellation("queued steering message was cancelled before delivery");
		}, (err) => {
			reportAcceptance(false);
			finish(err);
		});
		function onAbort() {
			abortRequested = true;
			rejectAfterCancellation(accepted ? "queued steering message was cancelled before delivery" : "queued steering message was cancelled before acceptance");
		}
		abortSignal?.addEventListener("abort", onAbort, { once: true });
	});
}
/**
* Steers the active session directly or waits for transcript commitment when a
* caller needs delivery proof before returning.
*/
async function steerActiveSessionWithOptionalDeliveryWait(activeSession, text, options, sessionKey, canInject) {
	const isInboundUserMessage = options?.isInboundUserMessage === true;
	const isPlainTextAnswer = !hasPromptImageInput(options);
	if (isInboundUserMessage && !isPlainTextAnswer) try {
		await cancelPendingAgentQuestionForSession({
			sessionKey,
			resolvedBy: "image-reply"
		});
	} catch (error) {
		log$5.warn(`failed to cancel ask_user before image steering: ${String(error)}`);
	}
	if (isInboundUserMessage && isPlainTextAnswer && await claimEmbeddedPendingUserInputAnswer(text, options, sessionKey)) {
		options?.onQueueAccepted?.(true);
		return;
	}
	if (options?.waitForTranscriptCommit !== true) {
		try {
			await steerActiveSession(activeSession, text, options?.images, options?.userTurnTranscriptRecorder, options?.media, options?.imageOrder, options?.queueIdentity, canInject);
			options?.onQueueAccepted?.(true);
		} catch (error) {
			options?.onQueueAccepted?.(false);
			throw error;
		}
		return;
	}
	try {
		await steerAndWaitForTranscriptCommit(activeSession, text, options.deliveryTimeoutMs ?? DEFAULT_QUEUE_TRANSCRIPT_COMMIT_TIMEOUT_MS, options.userTurnTranscriptRecorder, options.images, options.media, options.imageOrder, options.queueIdentity, options.abortSignal, options.onQueueAccepted, canInject);
	} catch (error) {
		if (error instanceof EmbeddedSteeringAcceptedUnconfirmedError) return {
			transcriptCommit: "unconfirmed",
			errorMessage: error.message
		};
		throw error;
	}
}
async function claimEmbeddedPendingUserInputAnswer(text, options, sessionKey) {
	if (options?.isInboundUserMessage !== true || hasPromptImageInput(options)) return false;
	return await claimPendingAgentQuestionAnswer({
		sessionKey,
		text,
		persist: options.userTurnTranscriptRecorder ? async () => {
			await options.userTurnTranscriptRecorder?.persistApproved();
		} : void 0
	});
}
//#endregion
//#region src/agents/embedded-agent-runner/run/code-mode-recovery-journal.ts
const recoveryFacts = /* @__PURE__ */ new WeakMap();
/** Bind host-only execution facts to the nested activity recorded for that exact call. */
function registerCodeModeRecoveryJournalEntry(activity, entry) {
	recoveryFacts.set(activity, entry);
}
function readCodeModeRecoveryJournalEntry(activity) {
	return recoveryFacts.get(activity);
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-trajectory-flush.ts
async function flushEmbeddedAttemptTrajectoryRecorder(params) {
	await runAgentCleanupStep({
		runId: params.runId,
		sessionId: params.sessionId,
		step: "openclaw-trajectory-flush",
		log: params.log,
		env: params.env,
		timeoutMs: params.timeoutMs,
		getTimeoutDetails: () => params.trajectoryRecorder?.describeFlushState(),
		cleanup: async () => {
			await params.trajectoryRecorder?.flush();
		}
	});
}
//#endregion
//#region src/agents/embedded-agent-runner/run/deferred-lifecycle-owner.ts
function createEmbeddedAttemptDeferredLifecycleOwner(params) {
	let state = "pending";
	let sessionEndData;
	const releaseActiveRun = () => {
		try {
			params.clearActiveRun();
		} catch (error) {
			log$5.error(`CRITICAL: deferred active run cleanup failed, possible resource leak: runId=${params.runId} ${formatErrorMessage(error)}`);
		}
	};
	return {
		recordSessionEnd: (data) => {
			if (state === "pending") sessionEndData = data;
		},
		discard: () => {
			if (state !== "pending") return;
			state = "discarded";
			releaseActiveRun();
		},
		complete: async () => {
			if (state !== "pending") return;
			state = "completed";
			try {
				if (params.trajectoryRecorder && sessionEndData) {
					params.trajectoryRecorder.recordEvent("session.ended", sessionEndData);
					await flushEmbeddedAttemptTrajectoryRecorder({
						runId: params.runId,
						sessionId: params.sessionId,
						trajectoryRecorder: params.trajectoryRecorder,
						log: log$5
					});
				}
			} finally {
				releaseActiveRun();
			}
		}
	};
}
function createDeferredEmbeddedRunLifecycleManager(params) {
	const controller = new AbortController();
	const signal = params.abortSignal ? AbortSignal.any([params.abortSignal, controller.signal]) : controller.signal;
	let current;
	const abort = (reason) => {
		if (controller.signal.aborted) return;
		controller.abort(reason === "restart" ? createAgentRunRestartAbortError() : reason === "superseded" ? createAgentRunSupersededAbortError() : void 0);
	};
	const cliOwner = {
		kind: "embedded",
		runId: params.runId,
		queueMessage: async () => {
			throw new Error("active run is switching runtimes");
		},
		isStreaming: () => false,
		isStopped: () => signal.aborted,
		isAborted: () => signal.aborted,
		isAbortable: () => !signal.aborted,
		isCompacting: () => false,
		cancel: abort,
		abort
	};
	const clearCliOwner = () => {
		clearActiveEmbeddedRun(params.sessionId, cliOwner, params.sessionKey, params.sessionFile);
	};
	return {
		signal,
		abort,
		adopt: (owner) => {
			const previous = current;
			current = owner;
			previous?.discard();
		},
		handoffToCli: () => {
			setActiveEmbeddedRun(params.sessionId, cliOwner, params.sessionKey, params.sessionFile, params.agentId);
			const previous = current;
			current = void 0;
			previous?.discard();
		},
		complete: async () => {
			const owner = current;
			current = void 0;
			try {
				await owner?.complete();
			} finally {
				clearCliOwner();
			}
		}
	};
}
//#endregion
//#region src/shared/tool-activity-heartbeat.ts
const { runListeners, runLastActivityMs } = resolveGlobalSingleton(Symbol.for("openclaw.toolActivityHeartbeat"), () => ({
	runListeners: /* @__PURE__ */ new Map(),
	runLastActivityMs: /* @__PURE__ */ new Map()
}), (state) => {
	for (const listeners of state.runListeners.values()) notifyListeners(listeners, void 0);
	state.runListeners.clear();
	state.runLastActivityMs.clear();
});
function notifyToolActivity(runId) {
	runLastActivityMs.set(runId, Date.now());
	const listeners = runListeners.get(runId);
	if (!listeners) return;
	for (const listener of listeners) listener();
}
function onToolActivity(runId, listener) {
	let listeners = runListeners.get(runId);
	if (!listeners) {
		listeners = /* @__PURE__ */ new Set();
		runListeners.set(runId, listeners);
	}
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
		if (listeners.size === 0) runListeners.delete(runId);
	};
}
function getLastToolActivityMs(runId) {
	return runLastActivityMs.get(runId) ?? 0;
}
function clearToolActivityRun(runId) {
	runListeners.delete(runId);
	runLastActivityMs.delete(runId);
}
//#endregion
//#region src/agents/embedded-agent-runner/run/tool-activity-heartbeat.ts
function wrapEmbeddedAttemptToolWithActivity(tool, runId) {
	const withActivity = async (operation) => {
		const interval = setInterval(() => notifyToolActivity(runId), 6e4);
		interval.unref?.();
		try {
			notifyToolActivity(runId);
			return await operation();
		} finally {
			clearInterval(interval);
			notifyToolActivity(runId);
		}
	};
	const originalExecute = tool.execute;
	const wrappedTool = {
		...tool,
		execute: ((...args) => withActivity(() => originalExecute(...args)))
	};
	copyAgentToolMetadata(tool, wrappedTool);
	const sourcePreparer = getInternalToolExecutionPreparer(tool);
	if (sourcePreparer) attachInternalToolExecutionPreparer(wrappedTool, async (params) => {
		const prepared = await withActivity(() => sourcePreparer(params));
		return prepared.kind === "ready" ? {
			...prepared,
			execute: (start) => withActivity(() => prepared.execute(start))
		} : prepared;
	});
	return wrappedTool;
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-stream-prepare.ts
/**
* Prepares stream subscription, tool execution, and the active run queue.
*/
//#region memory-flush-defer-v1
/**
* A deferred memory flush (memory-flush-defer) runs behind the reply with no reply
* operation, and agent-runner-memory registers its run id. Injection by sessionId must
* not land in it: its handle reads as available and compacting, so prepare refuses with
* reason "compacting" (the refusal every caller already handles: retry, followup or direct
* delivery), and the flush is asked to yield. Any other run is untouched.
*/
function resolveDeferredMemoryFlushRun(attempt) {
	if (attempt.trigger !== "memory" || !attempt.runId) return;
	return globalThis[Symbol.for("openclaw.memoryFlushDefer.deferredRuns.v1")]?.get(attempt.runId);
}
function refuseDeferredMemoryFlushInjection(attempt) {
	const run = resolveDeferredMemoryFlushRun(attempt);
	if (!run) return false;
	try {
		run.onInjection?.();
	} catch {}
	return true;
}
//#endregion memory-flush-defer-v1
function prepareEmbeddedAttemptStream(input) {
	const attempt = input.attempt;
	const activityScope = randomUUID();
	let nestedStartOrder = 0;
	const hookRunner = input.hookRunner;
	let beforeAgentFinalizeRevisionReason;
	let beforeAgentFinalizeRevisionEntryId;
	let acceptingSteerMessages = true;
	let activeQueueAdmissions = 0;
	const onBeforeTerminalDelivery = attempt.operation !== "settled-tool-finalization" && hookRunner?.hasHooks("before_agent_finalize") ? async (event) => {
		if (beforeAgentFinalizeRevisionReason || event.willRetry || event.isError || event.incompleteTerminalAssistant || !event.hasAssistantVisibleText) return;
		const lastAssistant = event.lastAssistant;
		const lastAssistantMessage = normalizeOptionalString(resolveFinalAssistantVisibleText(lastAssistant)) ?? normalizeOptionalString(resolveFinalAssistantRawText(lastAssistant)) ?? normalizeOptionalString(event.assistantTexts.join("\n\n"));
		if (!lastAssistantMessage) return;
		const state = input.getRunState();
		const hasCompletedClientToolCall = input.clientToolCallSlots.some((slot) => slot.completed);
		const silentFinalReply = attempt.silentExpected && isSilentReplyText(lastAssistantMessage, "NO_REPLY");
		if (state.aborted || state.promptError || state.timedOut || hasCompletedClientToolCall || state.yieldDetected || silentFinalReply) return;
		const hookMessages = projectNestedToolActivityForHooks(input.activeSession.messages, input.nestedToolActivities);
		const reportedModelRef = resolveReportedModelRef({
			provider: attempt.provider,
			model: attempt.modelId,
			assistant: lastAssistant
		});
		const maxRevisionAttempts = attempt.maxBeforeAgentFinalizeRevisions ?? 0;
		if (maxRevisionAttempts > 0 && (attempt.beforeAgentFinalizeRevisionAttempts ?? 0) >= maxRevisionAttempts) {
			log$5.warn(`before_agent_finalize revision limit reached; finalizing runId=${attempt.runId} sessionId=${attempt.sessionId} attempts=${attempt.beforeAgentFinalizeRevisionAttempts ?? 0}/${maxRevisionAttempts}`);
			return;
		}
		acceptingSteerMessages = false;
		if (activeQueueAdmissions > 0 || input.activeSession.pendingMessageCount > 0 || input.activeSession.agent.hasQueuedMessages()) {
			acceptingSteerMessages = true;
			return;
		}
		let keepAdmissionClosed = false;
		try {
			const outcome = await runAgentHarnessBeforeAgentFinalizeHook({
				event: {
					runId: attempt.runId,
					sessionId: attempt.sessionId,
					...attempt.sessionKey ? { sessionKey: attempt.sessionKey } : {},
					provider: reportedModelRef.provider,
					model: reportedModelRef.model,
					...attempt.cwd ?? attempt.workspaceDir ? { cwd: attempt.cwd ?? attempt.workspaceDir } : {},
					...attempt.sessionFile ? { transcriptPath: attempt.sessionFile } : {},
					stopHookActive: false,
					lastAssistantMessage,
					messages: hookMessages
				},
				ctx: {
					runId: attempt.runId,
					trace: freezeDiagnosticTraceContext(input.diagnosticTrace),
					agentId: input.hookAgentId,
					sessionKey: attempt.sessionKey,
					sessionId: attempt.sessionId,
					workspaceDir: attempt.workspaceDir,
					modelProviderId: reportedModelRef.provider,
					modelId: reportedModelRef.model,
					trigger: attempt.trigger,
					...buildAgentHookContextChannelFields(attempt),
					...buildAgentHookContextIdentityFields({
						trigger: attempt.trigger,
						senderId: attempt.senderId,
						chatId: attempt.chatId,
						channelContext: attempt.channelContext
					})
				},
				hookRunner
			});
			if (outcome.action !== "revise") return;
			if (event.hadDeterministicSideEffect) {
				log$5.warn(`before_agent_finalize requested revision after potential side effects; finalizing runId=${attempt.runId} sessionId=${attempt.sessionId}`);
				return;
			}
			if (!event.assistantEntryId) {
				log$5.warn(`before_agent_finalize revision lacks a persisted assistant entry; finalizing runId=${attempt.runId} sessionId=${attempt.sessionId}`);
				return;
			}
			keepAdmissionClosed = true;
			beforeAgentFinalizeRevisionEntryId = event.assistantEntryId;
			beforeAgentFinalizeRevisionReason = outcome.reason;
			return { suppressTerminalDelivery: true };
		} finally {
			if (!keepAdmissionClosed) acceptingSteerMessages = true;
		}
	} : void 0;
	let toolMetasForTerminal = [];
	const getQueueHandle = () => queueHandle;
	let deferredLifecycleOwner;
	const subscription = subscribeEmbeddedAgentSession({
		session: input.activeSession,
		runId: attempt.runId,
		lifecycleGeneration: attempt.lifecycleGeneration,
		messageChannel: input.runtimeChannel,
		initialReplayState: attempt.initialReplayState,
		hookRunner: getGlobalHookRunner() ?? void 0,
		verboseLevel: attempt.verboseLevel,
		reasoningMode: attempt.reasoningLevel ?? "off",
		thinkingLevel: attempt.thinkLevel,
		toolResultFormat: attempt.toolResultFormat,
		toolProgressDetail: attempt.toolProgressDetail,
		shouldEmitToolResult: attempt.shouldEmitToolResult,
		shouldEmitToolOutput: attempt.shouldEmitToolOutput,
		sourceReplyDeliveryMode: attempt.sourceReplyDeliveryMode,
		hasDeliveredMessageToolOnlySourceReply: input.hasDeliveredSourceReply,
		onDeliveredMessageToolOnlySourceReply: input.markSourceReplyDelivered,
		onAgentToolResult: attempt.onAgentToolResult,
		observeToolTerminal: attempt.observeToolTerminal,
		onToolResult: attempt.onToolResult,
		onReasoningStream: attempt.onReasoningStream,
		streamReasoningInNonStreamModes: attempt.streamReasoningInNonStreamModes,
		onReasoningEnd: attempt.onReasoningEnd,
		onBlockReply: input.onBlockReply,
		onBlockReplyFlush: input.onBlockReplyFlush,
		onBeforeTerminalDelivery,
		blockReplyBreak: attempt.blockReplyBreak,
		blockReplyChunking: attempt.blockReplyChunking,
		onPartialReply: attempt.onPartialReply,
		onAssistantMessageStart: attempt.onAssistantMessageStart,
		onExecutionPhase: attempt.onExecutionPhase,
		onAgentEvent: attempt.onAgentEvent,
		terminalLifecyclePhase: attempt.deferTerminalLifecycle ? "finishing" : "end",
		onToolStreamBoundary: attempt.onToolStreamBoundary,
		isTerminalAborted: () => input.getRunState().aborted,
		resolveTerminalStopReason: () => isAgentRunRestartAbortReason(input.runAbortController.signal.reason) ? AGENT_RUN_RESTART_ABORT_STOP_REASON : void 0,
		onBeforeLifecycleTerminal: () => {
			if (deferredLifecycleOwner) return;
			if (requiresCompletionRequiredAsyncTaskWait({
				sessionKey: attempt.sessionKey,
				toolMetas: toolMetasForTerminal
			})) return;
			clearActiveEmbeddedRun(attempt.sessionId, getQueueHandle(), attempt.sessionKey, attempt.sessionFile);
		},
		enforceFinalTag: attempt.enforceFinalTag,
		silentExpected: attempt.silentExpected,
		suppressLiveStreamOutput: attempt.suppressLiveStreamOutput,
		config: attempt.config,
		providerOwner: getModelProviderRuntimePluginHandle(attempt.model)?.plugin,
		compactionCountOwner: attempt.compactionCountOwner,
		onContextAccountingEvent: attempt.onContextAccountingEvent,
		sessionPersistence: attempt.sessionPersistence,
		sessionKey: attempt.sessionKey,
		currentChannelId: attempt.currentChannelId,
		currentMessagingTarget: attempt.currentMessagingTarget,
		currentAccountId: attempt.agentAccountId,
		currentThreadId: attempt.currentThreadTs,
		currentMessageId: attempt.currentMessageId,
		replyToMode: attempt.replyToMode,
		hasRepliedRef: attempt.hasRepliedRef,
		sessionId: attempt.sessionId,
		agentId: input.hookAgentId,
		builtinToolNames: input.builtinToolNames,
		coreBuiltinToolNames: input.coreBuiltinToolNames,
		replaySafeToolNames: input.replaySafeToolNames,
		...input.codeModeExecToolNames ? { codeModeExecToolNames: input.codeModeExecToolNames } : {},
		...input.sideEffectToolOwners ? { sideEffectToolOwners: input.sideEffectToolOwners } : {},
		internalEvents: attempt.internalEvents
	});
	toolMetasForTerminal = subscription.toolMetas;
	const toolSearchCatalogExecutor = async (toolParams) => {
		const runSignal = input.runAbortController.signal;
		const signal = AbortSignal.any([toolParams.signal ?? runSignal, runSignal]);
		const yieldRunSignal = toolParams.toolName === "sessions_yield" ? runSignal : void 0;
		const startedAt = Date.now();
		const startOrder = nestedStartOrder++;
		const manager = input.activeSession.sessionManager;
		const afterEntryId = manager.getAppendParentId();
		if (toolParams.source === "openclaw" && toolParams.sourceName === "core") recordStructuredReplayTrustForToolCall(toolParams.toolCallId, toolParams.tool, attempt.runId);
		return await raceWithAbortSignal(subscription.runToolLifecycle({
			toolName: toolParams.toolName,
			toolCallId: toolParams.toolCallId,
			args: toolParams.input,
			replaySafe: toolParams.replaySafe ?? input.isReplaySafeTool(toolParams.tool),
			hideFromChannelProgress: "hideFromChannelProgress" in toolParams.tool && toolParams.tool.hideFromChannelProgress === true,
			onTerminal: async (terminal) => {
				const message = {
					...createNestedToolActivity({
						runId: attempt.runId,
						scopeId: activityScope,
						afterEntryId,
						startOrder,
						parentToolCallId: toolParams.parentToolCallId,
						toolCallId: toolParams.toolCallId,
						toolName: toolParams.toolName,
						input: terminal.executedArguments,
						result: sanitizeToolResult(terminal.result),
						isError: terminal.isError,
						startedAt,
						timestamp: Date.now()
					}),
					idempotencyKey: `${activityScope}:${toolParams.toolCallId}`
				};
				await runWithOwnedSessionTranscriptWrite({
					sessionTarget: manager.getSessionTarget(),
					sessionKey: attempt.sessionKey
				}, () => {
					if (ACTIVE_EMBEDDED_RUNS.get(attempt.sessionId) !== queueHandle || input.getRunState().aborted) return;
					if (isRecord(terminal.result)) copyInternalToolResultState(terminal.result, message);
					manager.appendMessage(message);
					const recorded = readNestedToolActivity(redactTranscriptMessage(message, attempt.config));
					if (!recorded) throw new Error("Nested activity became invalid during transcript redaction");
					registerCodeModeRecoveryJournalEntry(recorded, {
						actionKey: hashToolCall(normalizeToolPolicyName(toolParams.toolName), terminal.executedArguments),
						effectState: terminal.effectReceipt.state
					});
					input.nestedToolActivities.push(recorded);
				});
				notifyToolActivity(attempt.runId);
			},
			execute: async (onImplementationStart) => {
				return await raceWithAbortSignal((async () => {
					signal.throwIfAborted();
					const preparer = getInternalToolExecutionPreparer(toolParams.tool);
					if (!preparer) {
						onImplementationStart();
						return await toolParams.tool.execute(toolParams.toolCallId, toolParams.input, signal, toolParams.onUpdate, void 0);
					}
					const prepared = await preparer({
						toolCallId: toolParams.toolCallId,
						args: toolParams.input,
						signal,
						onUpdate: toolParams.onUpdate
					});
					try {
						if (prepared.kind === "immediate") {
							if (prepared.outcome.kind === "error") throw prepared.outcome.error;
							return prepared.outcome.result;
						}
						return await prepared.execute(onImplementationStart);
					} finally {
						prepared.dispose();
					}
				})().then(toolParams.acceptResultBeforeProjection), signal, yieldRunSignal);
			}
		}), signal, yieldRunSignal);
	};
	let externalAbortAccepted = false;
	const abortActiveRunExternally = (reason) => {
		if (externalAbortAccepted) return;
		externalAbortAccepted = true;
		input.markExternalAbort();
		attempt.onDeferredLifecycleAbort?.(reason);
		attempt.onAttemptAbort?.();
		const abortReason = reason === "restart" ? createAgentRunRestartAbortError() : reason === "superseded" ? createAgentRunSupersededAbortError() : void 0;
		input.abortRun(false, abortReason);
	};
	const queueMessage = async (text, options) => {
		if (resolveDeferredMemoryFlushRun(attempt)) throw new Error("active run is a deferred memory flush");
		const canInject = () => acceptingSteerMessages && !input.getRunState().aborted && !input.runAbortController.signal.aborted;
		if (!canInject()) throw new Error("active session is finalizing");
		activeQueueAdmissions++;
		try {
			if (options?.steeringMode) input.activeSession.agent.steeringMode = options.steeringMode;
			return await steerActiveSessionWithOptionalDeliveryWait(input.activeSession, text, options, attempt.sessionKey, canInject);
		} finally {
			activeQueueAdmissions--;
		}
	};
	const heartbeatReplyOperation = attempt.replyOperation?.turnKind === "heartbeat" ? attempt.replyOperation : void 0;
	const applyPermissionMode = input.applyPermissionMode;
	const queueHandle = {
		kind: "embedded",
		runId: attempt.runId,
		permissionChangeOwner: attempt.permissionChange?.owner,
		diagnosticOwner: input.diagnosticOwner,
		closeDiagnostics: () => closeDiagnosticEmbeddedRunOwner(input.diagnosticOwner),
		startedAtMs: attempt.startedAtMs,
		get toolAuthorityFingerprint() {
			return attempt.toolAuthorityFingerprint;
		},
		applyPermissionMode: applyPermissionMode ? async (mode, revokeApprovals) => {
			if (!acceptingSteerMessages || input.runAbortController.signal.aborted || ACTIVE_EMBEDDED_RUNS_BY_RUN_ID.get(attempt.runId) !== queueHandle) return false;
			if ((attempt.permissionMode ?? null) === mode) return true;
			try {
				applyPermissionMode(mode, revokeApprovals);
				return true;
			} catch (error) {
				input.abortRun(false, error);
				throw error;
			}
		} : void 0,
		claimPendingUserInputAnswer: (text, options) => claimEmbeddedPendingUserInputAnswer(text, options, attempt.sessionKey),
		cancelPendingUserInput: (resolvedBy) => cancelPendingAgentQuestionForSession({
			sessionKey: attempt.sessionKey,
			resolvedBy
		}),
		preemptByVisibleTurn: heartbeatReplyOperation ? () => heartbeatReplyOperation.supersede() : void 0,
		queueMessage,
		messageInjection: {
			isAvailable: () => resolveDeferredMemoryFlushRun(attempt) !== void 0 || acceptingSteerMessages && !input.getRunState().aborted && !input.runAbortController.signal.aborted,
			queueMessage
		},
		isStreaming: () => input.activeSession.isStreaming,
		isAborted: () => input.getRunState().aborted,
		isStopped: () => !acceptingSteerMessages || input.getRunState().aborted || input.runAbortController.signal.aborted,
		isCompacting: () => refuseDeferredMemoryFlushInjection(attempt) || subscription.isCompacting(),
		supportsTranscriptCommitWait: true,
		supportsQueueMessageImages: true,
		sourceReplyDeliveryMode: attempt.sourceReplyDeliveryMode,
		taskSuggestionDeliveryMode: attempt.taskSuggestionDeliveryMode,
		cancel: abortActiveRunExternally,
		abort: (reason) => abortActiveRunExternally(reason)
	};
	attempt.replyOperation?.attachBackend(queueHandle);
	setActiveEmbeddedRunLifecycleGeneration(queueHandle, attempt.lifecycleGeneration ?? captureAgentRunLifecycleGeneration(attempt.runId));
	setActiveEmbeddedRun(attempt.sessionId, queueHandle, attempt.sessionKey, attempt.sessionFile, input.hookAgentId);
	globalThis[Symbol.for("versa.vlab.native-attempt-91-v1")]?.bind(attempt, queueHandle,
		() => ACTIVE_EMBEDDED_RUNS_BY_RUN_ID.get(attempt.runId) === queueHandle,
		(mode, revoke) => authorizeVlabNativePermission(queueHandle.permissionChangeOwner, mode,
			() => queueHandle.applyPermissionMode(mode, revoke)),
		() => {
			if (ACTIVE_EMBEDDED_RUNS_BY_RUN_ID.get(attempt.runId) !== queueHandle || queueHandle.isStopped() ||
				input.activeSession.agent.state.isStreaming || input.activeSession.agent.signal) throw new Error("Native voice tool-order closure is stale or already active");
			// Agent.createLoopConfig snapshots this public SDK field at prompt start.
			// Every attempt creates a fresh AgentSession; the SDK default is unchanged.
			input.activeSession.agent.toolExecution = "sequential";
			// This closure is called only by the registered, current native voice admission.
			input.activeSession[Symbol.for("openclaw.gptLive.projectionReadiness")] = true;
			return input.activeSession.agent.toolExecution === "sequential";
		});
	if (attempt.deferTerminalLifecycle && attempt.onDeferredLifecycleOwner) {
		deferredLifecycleOwner = createEmbeddedAttemptDeferredLifecycleOwner({
			runId: attempt.runId,
			sessionId: attempt.sessionId,
			trajectoryRecorder: input.trajectoryRecorder ?? null,
			clearActiveRun: () => clearActiveEmbeddedRun(attempt.sessionId, queueHandle, attempt.sessionKey, attempt.sessionFile)
		});
		try {
			attempt.onDeferredLifecycleOwner(deferredLifecycleOwner);
		} catch (error) {
			deferredLifecycleOwner.discard();
			throw error;
		}
	}
	return {
		subscription,
		queueHandle,
		deferredLifecycleOwner,
		toolSearchCatalogExecutor,
		getBeforeAgentFinalizeRevisionReason: () => beforeAgentFinalizeRevisionReason,
		getBeforeAgentFinalizeRevisionEntryId: () => beforeAgentFinalizeRevisionEntryId,
		stopAcceptingSteerMessages: () => {
			acceptingSteerMessages = false;
		}
	};
}
//#endregion
//#region src/agents/queued-file-writer.ts
/**
* Per-path queued append writer for logs and transcripts.
*
* Serializes writes, bounds queue/file growth, and exposes diagnostics for stuck-write probes.
*/
async function safeAppendFile(filePath, line, options) {
	await appendRegularFile({
		filePath,
		content: line,
		maxFileBytes: options.maxFileBytes,
		rejectSymlinkParents: true
	});
}
function waitForImmediate() {
	return new Promise((resolve) => {
		setImmediate(resolve);
	});
}
/** Returns the cached writer for a path or creates a new ordered append queue. */
function getQueuedFileWriter(writers, filePath, options = {}) {
	const existing = writers.get(filePath);
	if (existing) return existing;
	const dir = path.dirname(filePath);
	const ready = fs$1.mkdir(dir, {
		recursive: true,
		mode: 448
	}).catch(() => void 0);
	let queue = Promise.resolve();
	let pendingWrites = 0;
	let queuedBytes = 0;
	let activeOperation = "idle";
	let activeWriteBytes;
	const writer = {
		filePath,
		write: (line) => {
			const lineBytes = Buffer.byteLength(line, "utf8");
			if (options.maxQueuedBytes !== void 0 && queuedBytes + lineBytes > options.maxQueuedBytes) return "dropped";
			pendingWrites += 1;
			queuedBytes += lineBytes;
			queue = queue.then(async () => {
				activeOperation = "mkdir";
				await ready;
			}).then(async () => {
				if (options.yieldBeforeWrite) {
					activeOperation = "yield";
					await waitForImmediate();
				}
			}).then(async () => {
				activeOperation = "file-append";
				activeWriteBytes = lineBytes;
				await safeAppendFile(filePath, line, options);
			}).catch(() => void 0).finally(() => {
				pendingWrites = Math.max(0, pendingWrites - 1);
				queuedBytes = Math.max(0, queuedBytes - lineBytes);
				activeWriteBytes = void 0;
				activeOperation = pendingWrites > 0 ? activeOperation : "idle";
			});
			return "queued";
		},
		flush: async () => {
			await queue;
		},
		describeQueue: () => ({
			pendingWrites,
			queuedBytes,
			activeOperation,
			activeWriteBytes,
			maxFileBytes: options.maxFileBytes,
			maxQueuedBytes: options.maxQueuedBytes,
			yieldBeforeWrite: options.yieldBeforeWrite === true
		})
	};
	writers.set(filePath, writer);
	return writer;
}
//#endregion
//#region src/agents/anthropic-payload-log.ts
/**
* Optional Anthropic request/usage JSONL diagnostics.
* Redacts payload content before writing and stores digests for correlation
* without persisting raw secret-bearing request bodies.
*/
const writers$1 = /* @__PURE__ */ new Map();
const log$3 = createSubsystemLogger("agent/anthropic-payload");
function resolvePayloadLogConfig(env) {
	const enabled = parseBooleanValue(env.OPENCLAW_ANTHROPIC_PAYLOAD_LOG) ?? false;
	const fileOverride = env.OPENCLAW_ANTHROPIC_PAYLOAD_LOG_FILE?.trim();
	return {
		enabled,
		filePath: fileOverride ? resolveUserPath(fileOverride) : path.join(resolveStateDir(env), "logs", "anthropic-payload.jsonl")
	};
}
function getWriter$1(filePath) {
	return getQueuedFileWriter(writers$1, filePath);
}
function formatError(error) {
	if (error instanceof Error) {
		const redacted = redactAgentDiagnosticPayload(error.message);
		return typeof redacted === "string" ? redacted : error.message;
	}
	if (typeof error === "string") {
		const redacted = redactAgentDiagnosticPayload(error);
		return typeof redacted === "string" ? redacted : error;
	}
	if (typeof error === "number" || typeof error === "boolean" || typeof error === "bigint") return String(error);
	if (error && typeof error === "object") return safeJsonStringify(redactAgentDiagnosticPayload(error)) ?? "unknown error";
}
function digest$1(value) {
	const serialized = safeJsonStringify(value);
	if (!serialized) return;
	return crypto$1.createHash("sha256").update(serialized).digest("hex");
}
function isAnthropicModel(model) {
	return model?.api === "anthropic-messages";
}
function findLastAssistantUsage(messages) {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const msg = messages[i];
		if (msg?.role === "assistant" && msg.usage && typeof msg.usage === "object") return msg.usage;
	}
	return null;
}
/** Create an Anthropic payload/usage logger when the env flag is enabled. */
function createAnthropicPayloadLogger(params) {
	const cfg = resolvePayloadLogConfig(params.env ?? process.env);
	if (!cfg.enabled) return null;
	const writer = params.writer ?? getWriter$1(cfg.filePath);
	const base = {
		runId: params.runId,
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		provider: params.provider,
		modelId: params.modelId,
		modelApi: params.modelApi,
		workspaceDir: params.workspaceDir
	};
	const record = (event) => {
		const line = safeJsonStringify(event);
		if (!line) return;
		writer.write(`${line}\n`);
	};
	const wrapStreamFn = (streamFn) => {
		const wrapped = (model, context, options) => {
			if (!isAnthropicModel(model)) return streamFn(model, context, options);
			const nextOnPayload = (payload) => {
				const redactedPayload = redactAgentDiagnosticPayload(payload);
				record({
					...base,
					ts: (/* @__PURE__ */ new Date()).toISOString(),
					stage: "request",
					payload: redactedPayload,
					payloadDigest: digest$1(redactedPayload)
				});
				return options?.onPayload?.(payload, model);
			};
			return streamFn(model, context, {
				...options,
				onPayload: nextOnPayload
			});
		};
		return wrapped;
	};
	const recordUsage = (messages, error) => {
		const usage = findLastAssistantUsage(messages);
		const errorMessage = formatError(error);
		if (!usage) {
			if (errorMessage) record({
				...base,
				ts: (/* @__PURE__ */ new Date()).toISOString(),
				stage: "usage",
				error: errorMessage
			});
			return;
		}
		record({
			...base,
			ts: (/* @__PURE__ */ new Date()).toISOString(),
			stage: "usage",
			usage: redactAgentDiagnosticPayload(usage),
			error: errorMessage
		});
		log$3.info("anthropic usage", {
			runId: params.runId,
			sessionId: params.sessionId,
			usage
		});
	};
	log$3.info("anthropic payload logger enabled", { filePath: writer.filePath });
	return {
		enabled: true,
		wrapStreamFn,
		recordUsage
	};
}
//#endregion
//#region src/agents/trace-base.ts
/** Build a trace base object while preserving undefined optional fields. */
function buildAgentTraceBase(params) {
	return {
		runId: params.runId,
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		provider: params.provider,
		modelId: params.modelId,
		modelApi: params.modelApi,
		workspaceDir: params.workspaceDir
	};
}
//#endregion
//#region src/agents/cache-trace.ts
/**
* Optional JSONL diagnostics for agent cache/session/prompt tracing.
*/
const writers = /* @__PURE__ */ new Map();
function resolveCacheTraceConfig(params) {
	const env = params.env ?? process.env;
	const config = params.cfg?.diagnostics?.cacheTrace;
	const enabled = parseBooleanValue(env.OPENCLAW_CACHE_TRACE) ?? config?.enabled ?? false;
	const fileOverride = env.OPENCLAW_CACHE_TRACE_FILE?.trim();
	const filePath = fileOverride ? resolveUserPath(fileOverride) : path.join(resolveStateDir(env), "logs", "cache-trace.jsonl");
	const includeMessages = parseBooleanValue(env.OPENCLAW_CACHE_TRACE_MESSAGES);
	const includePrompt = parseBooleanValue(env.OPENCLAW_CACHE_TRACE_PROMPT);
	const includeSystem = parseBooleanValue(env.OPENCLAW_CACHE_TRACE_SYSTEM);
	return {
		enabled,
		filePath,
		includeMessages: includeMessages ?? true,
		includePrompt: includePrompt ?? true,
		includeSystem: includeSystem ?? true
	};
}
function getWriter(filePath) {
	return getQueuedFileWriter(writers, filePath);
}
function digest(value) {
	const serialized = stableStringify(value, sanitizeSurrogates);
	return crypto$1.createHash("sha256").update(serialized).digest("hex");
}
function summarizeMessages(messages) {
	const messageFingerprints = messages.map((msg) => digest(msg));
	return {
		messageCount: messages.length,
		messageRoles: messages.map((msg) => msg.role),
		messageFingerprints,
		messagesDigest: digest(messageFingerprints.join("|"))
	};
}
/** Create a cache trace recorder when diagnostics config/env enables it. */
function createCacheTrace(params) {
	const cfg = resolveCacheTraceConfig(params);
	if (!cfg.enabled) return null;
	const writer = params.writer ?? getWriter(cfg.filePath);
	let seq = 0;
	const base = buildAgentTraceBase(params);
	const recordStage = (stage, payload = {}) => {
		const event = {
			...base,
			ts: (/* @__PURE__ */ new Date()).toISOString(),
			seq: seq += 1,
			stage
		};
		if (payload.prompt !== void 0 && cfg.includePrompt) event.prompt = redactAgentDiagnosticPayload(payload.prompt);
		if (payload.system !== void 0 && cfg.includeSystem) {
			event.system = redactAgentDiagnosticPayload(payload.system);
			event.systemDigest = digest(payload.system);
		}
		if (payload.options) event.options = redactAgentDiagnosticPayload(payload.options);
		if (payload.model) event.model = redactAgentDiagnosticPayload(payload.model);
		const messages = payload.messages;
		if (Array.isArray(messages)) {
			const summary = summarizeMessages(messages);
			event.messageCount = summary.messageCount;
			event.messageRoles = summary.messageRoles;
			event.messageFingerprints = summary.messageFingerprints;
			event.messagesDigest = summary.messagesDigest;
			if (cfg.includeMessages) event.messages = redactAgentDiagnosticPayload(messages);
		}
		if (payload.note) event.note = redactAgentDiagnosticPayload(payload.note);
		if (payload.error) event.error = redactAgentDiagnosticPayload(payload.error);
		const line = safeJsonStringify(event);
		if (!line) return;
		writer.write(`${line}\n`);
	};
	const wrapStreamFn = (streamFn) => {
		const wrapped = (model, context, options) => {
			const traceContext = context;
			recordStage("stream:context", {
				model: {
					id: model?.id,
					provider: model?.provider,
					api: model?.api
				},
				system: traceContext.systemPrompt ?? traceContext.system,
				messages: traceContext.messages ?? [],
				options: options ?? {}
			});
			return streamFn(model, context, options);
		};
		return wrapped;
	};
	return {
		enabled: true,
		filePath: cfg.filePath,
		recordStage,
		wrapStreamFn
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/thinking-replay-repair.ts
/** Repairs persisted provider replay state after provider-confirmed rejection. */
function rewriteRejectedReplayInSessionManager(params, repair) {
	if (repair.replacements.length === 0) return {
		repaired: false,
		repairedCount: 0,
		reason: repair.emptyReason
	};
	const rewriteResult = rewriteTranscriptEntriesInSessionManager({
		sessionManager: params.sessionManager,
		replacements: repair.replacements
	});
	if (!rewriteResult.changed) return {
		repaired: false,
		repairedCount: 0,
		reason: rewriteResult.reason
	};
	if (params.sessionFile) emitSessionTranscriptUpdate({
		sessionFile: params.sessionFile,
		sessionKey: params.sessionKey,
		...params.agentId ? { agentId: params.agentId } : {}
	});
	log$5.warn(`[session-recovery] ${repair.logMessage}: repaired=${rewriteResult.rewrittenEntries} sessionKey=${params.sessionKey ?? params.sessionId ?? "unknown"}`);
	return {
		repaired: true,
		repairedCount: rewriteResult.rewrittenEntries,
		reason: rewriteResult.reason
	};
}
function repairRejectedThinkingReplayInSessionManager(params) {
	const replacements = [];
	for (const entry of params.sessionManager.getBranch()) {
		if (entry.type !== "message") continue;
		const replacement = stripThinkingBlocksFromMessage(entry.message);
		if (replacement === entry.message) continue;
		replacements.push({
			entryId: entry.id,
			message: replacement
		});
	}
	return rewriteRejectedReplayInSessionManager(params, {
		replacements,
		emptyReason: "no thinking blocks on active branch",
		logMessage: "stripped thinking blocks after provider rejected replay"
	});
}
function repairRejectedCompactionReplayInSessionManager(params) {
	const owner = params.sessionManager.getBranch().findLast((entry) => entry.type === "message" && entry.message.role === "assistant" && (entry.message.providerReplay?.type === "openai-responses-compaction" || entry.message.providerReplay?.type === "openai-responses-retained-compaction") && entry.message.providerReplay.data === params.checkpoint.data && (params.checkpoint.id === void 0 || entry.message.providerReplay.id === params.checkpoint.id));
	return rewriteRejectedReplayInSessionManager(params, {
		replacements: owner?.type === "message" && owner.message.role === "assistant" ? [{
			entryId: owner.id,
			message: stripCompactionReplayCheckpoint(owner.message)
		}] : [],
		emptyReason: "no OpenAI Responses compaction checkpoint on active branch",
		logMessage: "stripped compaction checkpoint after provider rejected replay"
	});
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-stop-reason-recovery.ts
/**
* Recovers sensitive stop reasons by wrapping provider stream functions.
*/
const UNHANDLED_STOP_REASON_RE = /^Unhandled stop reason:\s*(.+)$/i;
function formatUnhandledStopReasonErrorMessage(stopReason) {
	return `The model stopped because the provider returned an unhandled stop reason: ${stopReason}. Please rephrase and try again.`;
}
function normalizeUnhandledStopReasonMessage(message) {
	if (typeof message !== "string") return;
	const stopReason = message.trim().match(UNHANDLED_STOP_REASON_RE)?.[1]?.trim();
	if (!stopReason) return;
	return formatUnhandledStopReasonErrorMessage(stopReason);
}
function patchUnhandledStopReasonInAssistantMessage(message) {
	if (!message || typeof message !== "object") return;
	const assistant = message;
	const normalizedMessage = normalizeUnhandledStopReasonMessage(assistant.errorMessage);
	if (!normalizedMessage) return;
	assistant.stopReason = "error";
	assistant.errorMessage = normalizedMessage;
}
function buildUnhandledStopReasonErrorStream(model, errorMessage) {
	const stream = (0, event_stream_exports.createAssistantMessageEventStream)();
	queueMicrotask(() => {
		stream.push({
			type: "error",
			reason: "error",
			error: buildStreamErrorAssistantMessage({
				model: {
					api: model.api,
					provider: model.provider,
					id: model.id
				},
				errorMessage
			})
		});
		stream.end();
	});
	return stream;
}
function wrapStreamHandleUnhandledStopReason(model, stream) {
	const originalResult = stream.result.bind(stream);
	stream.result = async () => {
		try {
			const message = await originalResult();
			patchUnhandledStopReasonInAssistantMessage(message);
			return message;
		} catch (err) {
			const normalizedMessage = normalizeUnhandledStopReasonMessage(formatErrorMessage(err));
			if (!normalizedMessage) throw err;
			return buildStreamErrorAssistantMessage({
				model: {
					api: model.api,
					provider: model.provider,
					id: model.id
				},
				errorMessage: normalizedMessage
			});
		}
	};
	const originalAsyncIterator = stream[Symbol.asyncIterator].bind(stream);
	stream[Symbol.asyncIterator] = function() {
		const iterator = originalAsyncIterator();
		let emittedSyntheticTerminal = false;
		return createStreamIteratorWrapper({
			iterator,
			next: async (streamIterator) => {
				if (emittedSyntheticTerminal) return {
					done: true,
					value: void 0
				};
				try {
					const result = await streamIterator.next();
					if (!result.done && result.value && typeof result.value === "object") {
						const event = result.value;
						patchUnhandledStopReasonInAssistantMessage(event.error);
					}
					return result;
				} catch (err) {
					const normalizedMessage = normalizeUnhandledStopReasonMessage(formatErrorMessage(err));
					if (!normalizedMessage) throw err;
					emittedSyntheticTerminal = true;
					return {
						done: false,
						value: {
							type: "error",
							reason: "error",
							error: buildStreamErrorAssistantMessage({
								model: {
									api: model.api,
									provider: model.provider,
									id: model.id
								},
								errorMessage: normalizedMessage
							})
						}
					};
				}
			}
		});
	};
	return stream;
}
/**
* Wraps provider streams so raw "Unhandled stop reason" failures are rewritten
* into stable error messages. Recovery covers synchronous creation failures,
* async stream creation failures, iterator errors, and `result()` errors.
*/
function wrapStreamFnHandleSensitiveStopReason(baseFn) {
	return (model, context, options) => {
		try {
			const maybeStream = baseFn(model, context, options);
			if (maybeStream && typeof maybeStream === "object" && "then" in maybeStream) return Promise.resolve(maybeStream).then((stream) => wrapStreamHandleUnhandledStopReason(model, stream), (err) => {
				const normalizedMessage = normalizeUnhandledStopReasonMessage(formatErrorMessage(err));
				if (!normalizedMessage) throw err;
				return buildUnhandledStopReasonErrorStream(model, normalizedMessage);
			});
			return wrapStreamHandleUnhandledStopReason(model, maybeStream);
		} catch (err) {
			const normalizedMessage = normalizeUnhandledStopReasonMessage(formatErrorMessage(err));
			if (!normalizedMessage) throw err;
			return buildUnhandledStopReasonErrorStream(model, normalizedMessage);
		}
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-tool-call-name-resolution.ts
/** Resolves provider-emitted tool names against the live callable set. */
function resolveCaseInsensitiveAllowedToolName(rawName, allowedToolNames) {
	if (!allowedToolNames || allowedToolNames.size === 0) return null;
	const folded = normalizeLowercaseStringOrEmpty(rawName);
	let caseInsensitiveMatch = null;
	for (const name of allowedToolNames) {
		if (normalizeLowercaseStringOrEmpty(name) !== folded) continue;
		if (caseInsensitiveMatch && caseInsensitiveMatch !== name) return null;
		caseInsensitiveMatch = name;
	}
	return caseInsensitiveMatch;
}
function resolveExactAllowedToolName(rawName, allowedToolNames) {
	if (!allowedToolNames || allowedToolNames.size === 0) return null;
	if (allowedToolNames.has(rawName)) return rawName;
	const normalized = normalizeToolPolicyName(rawName);
	if (allowedToolNames.has(normalized)) return normalized;
	return resolveCaseInsensitiveAllowedToolName(rawName, allowedToolNames) ?? resolveCaseInsensitiveAllowedToolName(normalized, allowedToolNames);
}
function buildStructuredToolNameCandidates(rawName) {
	const trimmed = rawName.trim();
	if (!trimmed) return [];
	const candidates = [];
	const seen = /* @__PURE__ */ new Set();
	const addCandidate = (value) => {
		const candidate = value.trim();
		if (!candidate || seen.has(candidate)) return;
		seen.add(candidate);
		candidates.push(candidate);
	};
	addCandidate(trimmed);
	addCandidate(normalizeToolPolicyName(trimmed));
	const structuredSeeds = [trimmed];
	const xmlFragmentOffset = [
		"\"",
		"'",
		"<"
	].map((separator) => trimmed.indexOf(separator)).filter((offset) => offset > 0).reduce((earliest, offset) => earliest === void 0 || offset < earliest ? offset : earliest, void 0);
	if (xmlFragmentOffset !== void 0) {
		const prefix = trimmed.slice(0, xmlFragmentOffset);
		addCandidate(prefix);
		addCandidate(normalizeToolPolicyName(prefix));
		structuredSeeds.push(prefix);
	}
	for (const seed of structuredSeeds) {
		const normalizedDelimiter = seed.replace(/\//g, ".");
		addCandidate(normalizedDelimiter);
		addCandidate(normalizeToolPolicyName(normalizedDelimiter));
		const segments = normalizeStringEntries(normalizedDelimiter.split("."));
		if (segments.length > 1) for (let index = 1; index < segments.length; index += 1) {
			const suffix = segments.slice(index).join(".");
			addCandidate(suffix);
			addCandidate(normalizeToolPolicyName(suffix));
		}
	}
	return candidates;
}
function resolveStructuredAllowedToolName(rawName, allowedToolNames) {
	if (!allowedToolNames || allowedToolNames.size === 0) return null;
	const candidateNames = buildStructuredToolNameCandidates(rawName);
	for (const candidate of candidateNames) if (allowedToolNames.has(candidate)) return candidate;
	for (const candidate of candidateNames) {
		const caseInsensitiveMatch = resolveCaseInsensitiveAllowedToolName(candidate, allowedToolNames);
		if (caseInsensitiveMatch) return caseInsensitiveMatch;
	}
	return null;
}
function inferToolNameFromToolCallId(rawId, allowedToolNames) {
	if (!rawId || !allowedToolNames || allowedToolNames.size === 0) return null;
	const id = rawId.trim();
	if (!id) return null;
	const candidateTokens = /* @__PURE__ */ new Set();
	const addToken = (value) => {
		const trimmed = value.trim();
		if (!trimmed) return;
		candidateTokens.add(trimmed);
		candidateTokens.add(trimmed.replace(/[:._/-]\d+$/, ""));
		candidateTokens.add(trimmed.replace(/\d+$/, ""));
		const normalizedDelimiter = trimmed.replace(/\//g, ".");
		candidateTokens.add(normalizedDelimiter);
		candidateTokens.add(normalizedDelimiter.replace(/[:._-]\d+$/, ""));
		candidateTokens.add(normalizedDelimiter.replace(/\d+$/, ""));
		for (const prefixPattern of [/^functions?[._-]?/i, /^tools?[._-]?/i]) {
			const stripped = normalizedDelimiter.replace(prefixPattern, "");
			if (stripped !== normalizedDelimiter) {
				candidateTokens.add(stripped);
				candidateTokens.add(stripped.replace(/[:._-]\d+$/, ""));
				candidateTokens.add(stripped.replace(/\d+$/, ""));
			}
		}
	};
	const preColon = id.split(":")[0] ?? id;
	for (const seed of [id, preColon]) addToken(seed);
	let singleMatch = null;
	for (const candidate of candidateTokens) {
		const matched = resolveStructuredAllowedToolName(candidate, allowedToolNames);
		if (!matched) continue;
		if (singleMatch && singleMatch !== matched) return null;
		singleMatch = matched;
	}
	return singleMatch;
}
function looksLikeMalformedToolNameCounter(rawName) {
	const normalizedDelimiter = rawName.trim().replace(/\//g, ".");
	return /^(?:functions?|tools?)[._-]?/i.test(normalizedDelimiter) && /(?:[:._-]\d+|\d+)$/.test(normalizedDelimiter);
}
function resolveToolCallName(rawName, allowedToolNames, rawToolCallId, requireAllowed = false) {
	const trimmed = rawName.trim();
	if (!trimmed) return inferToolNameFromToolCallId(rawToolCallId, allowedToolNames) ?? (requireAllowed ? null : rawName);
	if (!allowedToolNames || allowedToolNames.size === 0) return trimmed;
	const exact = resolveExactAllowedToolName(trimmed, allowedToolNames);
	if (exact) return exact;
	const inferredFromName = inferToolNameFromToolCallId(trimmed, allowedToolNames);
	if (inferredFromName) return inferredFromName;
	if (looksLikeMalformedToolNameCounter(trimmed)) return requireAllowed ? null : trimmed;
	return resolveStructuredAllowedToolName(trimmed, allowedToolNames) ?? (requireAllowed ? null : trimmed);
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-tool-call-replay-sanitization.ts
/** Sanitizes replayed tool calls and provider-specific transcript structure. */
const REPLAY_TOOL_CALL_NAME_MAX_CHARS = 64;
function isReplaySafeThinkingTurn(content, allowedToolNames) {
	const seenToolCallIds = /* @__PURE__ */ new Set();
	for (const block of content) {
		if (!isReplayToolCallBlock(block)) continue;
		const replayBlock = block;
		const toolCallId = typeof replayBlock.id === "string" ? replayBlock.id.trim() : "";
		if (!replayToolCallHasInput(replayBlock) || !toolCallId || seenToolCallIds.has(toolCallId)) return false;
		seenToolCallIds.add(toolCallId);
		const resolvedName = resolveReplayToolCallName(typeof replayBlock.name === "string" ? replayBlock.name : "", toolCallId, allowedToolNames);
		if (!resolvedName || replayBlock.name !== resolvedName) return false;
	}
	return true;
}
function isReplayToolCallBlock(block) {
	if (!block || typeof block !== "object") return false;
	return isRunnerToolCallBlockType(block.type);
}
function replayToolCallHasInput(block) {
	const hasInput = "input" in block ? block.input !== void 0 && block.input !== null : false;
	const hasArguments = "arguments" in block ? block.arguments !== void 0 && block.arguments !== null : false;
	return hasInput || hasArguments;
}
function collectFollowingToolResults(messages, index) {
	const ids = /* @__PURE__ */ new Set();
	let sawNonToolResult = false;
	let displaced = false;
	for (let nextIndex = index + 1; nextIndex < messages.length; nextIndex += 1) {
		const message = messages[nextIndex];
		if (!message || typeof message !== "object") {
			sawNonToolResult = true;
			continue;
		}
		if (message.role === "assistant" && assistantTurnHasReplayToolCall(message)) break;
		if (message.role === "toolResult") {
			const resultIds = extractToolResultIds(message);
			for (const id of resultIds) ids.add(id);
			displaced ||= resultIds.length > 0 && sawNonToolResult;
			continue;
		}
		sawNonToolResult = true;
	}
	return {
		ids,
		displaced
	};
}
function resolveReplayToolCallName(rawName, rawId, allowedToolNames) {
	if (rawName.length > 128) return null;
	const normalized = resolveToolCallName(rawName, allowedToolNames, rawId, true);
	if (!normalized) return null;
	const trimmed = normalized.trim();
	if (!trimmed || trimmed.length > REPLAY_TOOL_CALL_NAME_MAX_CHARS || /\s/.test(trimmed)) return null;
	return trimmed;
}
function sanitizeReplayToolCallInputs(messages, allowedToolNames, allowProviderOwnedThinkingReplay) {
	let changed = false;
	let droppedAssistantMessages = 0;
	const out = [];
	const preservedThinkingToolCallIds = /* @__PURE__ */ new Set();
	const priorToolCallIds = /* @__PURE__ */ new Set();
	for (const [index, message] of messages.entries()) {
		if (!message) {
			changed = true;
			continue;
		}
		if (typeof message !== "object" || message.role !== "assistant") {
			out.push(message);
			continue;
		}
		if (!Array.isArray(message.content)) {
			out.push(message);
			continue;
		}
		if (allowProviderOwnedThinkingReplay && message.content.some((block) => isThinkingLikeBlock(block)) && message.content.some((block) => isReplayToolCallBlock(block))) {
			const replaySafeToolCalls = extractToolCallsFromAssistant(message);
			const followingToolResults = collectFollowingToolResults(messages, index);
			if (isReplaySafeThinkingTurn(message.content, allowedToolNames) && replaySafeToolCalls.every((toolCall) => !preservedThinkingToolCallIds.has(toolCall.id) && (!followingToolResults.displaced || !priorToolCallIds.has(toolCall.id)) && followingToolResults.ids.has(toolCall.id))) {
				for (const toolCall of replaySafeToolCalls) {
					preservedThinkingToolCallIds.add(toolCall.id);
					priorToolCallIds.add(toolCall.id);
				}
				changed ||= followingToolResults.displaced;
				out.push(message);
			} else {
				changed = true;
				droppedAssistantMessages += 1;
			}
			continue;
		}
		const nextContent = [];
		let messageChanged = false;
		for (const block of message.content) {
			if (!isReplayToolCallBlock(block)) {
				nextContent.push(block);
				continue;
			}
			const replayBlock = block;
			if (!replayToolCallHasInput(replayBlock) || !hasNonEmptyString(replayBlock.id)) {
				changed = true;
				messageChanged = true;
				continue;
			}
			const resolvedName = resolveReplayToolCallName(typeof replayBlock.name === "string" ? replayBlock.name : "", replayBlock.id, allowedToolNames);
			if (!resolvedName) {
				changed = true;
				messageChanged = true;
				continue;
			}
			if (replayBlock.name !== resolvedName) {
				nextContent.push({
					...block,
					name: resolvedName
				});
				changed = true;
				messageChanged = true;
				continue;
			}
			nextContent.push(block);
		}
		if (messageChanged) {
			changed = true;
			if (nextContent.length > 0) {
				const nextMessage = replaceCompactionReplayOwnerContent(message, nextContent);
				for (const toolCall of extractToolCallsFromAssistant(nextMessage)) priorToolCallIds.add(toolCall.id);
				out.push(nextMessage);
			} else droppedAssistantMessages += 1;
			continue;
		}
		for (const toolCall of extractToolCallsFromAssistant(message)) priorToolCallIds.add(toolCall.id);
		out.push(message);
	}
	return {
		messages: changed ? out : messages,
		droppedAssistantMessages
	};
}
function extractAnthropicReplayToolResultIds(block) {
	const ids = [];
	for (const value of [
		block.toolUseId,
		block.toolCallId,
		block.tool_use_id,
		block.tool_call_id
	]) {
		if (typeof value !== "string") continue;
		const trimmed = value.trim();
		if (!trimmed || ids.includes(trimmed)) continue;
		ids.push(trimmed);
	}
	return ids;
}
function isSignedThinkingReplayAssistantSpan(message) {
	if (!message || typeof message !== "object" || message.role !== "assistant") return false;
	const content = message.content;
	if (!Array.isArray(content)) return false;
	return content.some((block) => isThinkingLikeBlock(block)) && content.some((block) => isReplayToolCallBlock(block));
}
function sanitizeAnthropicReplayToolResults(messages, options) {
	let changed = false;
	const out = [];
	const disallowEmbeddedUserToolResultsForSignedThinkingReplay = options?.disallowEmbeddedUserToolResultsForSignedThinkingReplay === true;
	for (const [index, message] of messages.entries()) {
		if (!message) {
			changed = true;
			continue;
		}
		if (typeof message !== "object" || message.role !== "user") {
			out.push(message);
			continue;
		}
		if (!Array.isArray(message.content)) {
			out.push(message);
			continue;
		}
		const previous = messages[index - 1];
		const shouldStripEmbeddedToolResults = disallowEmbeddedUserToolResultsForSignedThinkingReplay && isSignedThinkingReplayAssistantSpan(previous);
		const validToolUseIds = /* @__PURE__ */ new Set();
		if (previous && typeof previous === "object" && previous.role === "assistant") {
			const previousContent = previous.content;
			if (Array.isArray(previousContent)) for (const block of previousContent) {
				if (!block || typeof block !== "object") continue;
				const typedBlock = block;
				if (!isRunnerToolCallBlockType(typedBlock.type) || typeof typedBlock.id !== "string") continue;
				const trimmedId = typedBlock.id.trim();
				if (trimmedId) validToolUseIds.add(trimmedId);
			}
		}
		const nextContent = message.content.filter((block) => {
			if (!block || typeof block !== "object") return true;
			const typedBlock = block;
			if (typedBlock.type !== "toolResult" && typedBlock.type !== "tool") return true;
			if (shouldStripEmbeddedToolResults) {
				changed = true;
				return false;
			}
			const resultIds = extractAnthropicReplayToolResultIds(typedBlock);
			if (resultIds.length === 0) {
				changed = true;
				return false;
			}
			return validToolUseIds.size > 0 && resultIds.some((id) => validToolUseIds.has(id));
		});
		if (nextContent.length === message.content.length) {
			out.push(message);
			continue;
		}
		changed = true;
		if (nextContent.length > 0) {
			out.push({
				...message,
				content: nextContent
			});
			continue;
		}
		out.push({
			...message,
			content: [{
				type: "text",
				text: "[tool results omitted]"
			}]
		});
	}
	return changed ? out : messages;
}
function assistantTurnHasReplayToolCall(message) {
	if (!message || typeof message !== "object" || message.role !== "assistant") return false;
	const content = message.content;
	if (!Array.isArray(content)) return false;
	return content.some((block) => isReplayToolCallBlock(block));
}
function stripTrailingAssistantPrefillTurns(messages) {
	let end = messages.length;
	while (end > 0) {
		const message = messages[end - 1];
		if (!message || typeof message !== "object" || message.role !== "assistant") break;
		if (assistantTurnHasReplayToolCall(message)) break;
		end -= 1;
	}
	return end === messages.length ? messages : messages.slice(0, end);
}
/** Returns whether replayed tool-call ids should be sanitized for non-Responses providers. */
function shouldApplyReplayToolCallIdSanitizer(params) {
	return params.sanitizeToolCallIds && Boolean(params.toolCallIdMode) && !params.isOpenAIResponsesApi;
}
/** Rewrites replayed tool-call ids into provider-safe ids and optionally repairs result pairing. */
function sanitizeReplayToolCallIdsForStream(params) {
	const paired = params.repairToolUseResultPairing ? sanitizeToolUseResultPairing(params.messages) : params.messages;
	return sanitizeToolCallIdsForCloudCodeAssist(paired, params.mode, {
		preserveNativeAnthropicToolUseIds: params.preserveNativeAnthropicToolUseIds,
		duplicateToolCallIdStyle: params.duplicateToolCallIdStyle,
		preserveReplaySafeThinkingToolCallIds: params.preserveReplaySafeThinkingToolCallIds,
		allowedToolNames: params.allowedToolNames
	});
}
/** Downgrades OpenAI Responses replay turns into the stream format expected by runtime callers. */
function sanitizeOpenAIResponsesReplayForStream(messages) {
	const repaired = sanitizeToolUseResultPairingForModel(messages, true);
	return downgradeOpenAIFunctionCallReasoningPairs(normalizeOpenAIResponsesToolCallIds(downgradeOpenAIReasoningBlocks(repaired)));
}
/**
* Sanitizes malformed replay tool calls before provider submission. The wrapper
* drops invalid assistant tool calls, repairs adjacent tool results when needed,
* strips trailing assistant prefill turns for strict providers, and revalidates
* Anthropic/Gemini transcripts after mutations.
*/
function wrapStreamFnSanitizeMalformedToolCalls(baseFn, allowedToolNames, transcriptPolicy, provider) {
	return (model, context, options) => {
		const messages = context?.messages;
		if (!Array.isArray(messages)) return baseFn(model, context, options);
		const allowProviderOwnedThinkingReplay = shouldAllowProviderOwnedThinkingReplay({
			modelApi: model?.api,
			provider,
			policy: {
				validateAnthropicTurns: transcriptPolicy?.validateAnthropicTurns === true,
				preserveSignatures: transcriptPolicy?.preserveSignatures === true,
				dropThinkingBlocks: transcriptPolicy?.dropThinkingBlocks === true
			}
		});
		const sanitized = sanitizeReplayToolCallInputs(messages, allowedToolNames, allowProviderOwnedThinkingReplay);
		const isOpenAIResponsesApi = model.api === "openai-responses" || model.api === "openai-chatgpt-responses" || model.api === "azure-openai-responses";
		const replayInputsChanged = sanitized.messages !== messages;
		let nextMessages = isOpenAIResponsesApi ? sanitizeToolUseResultPairingForModel(sanitized.messages, true) : replayInputsChanged ? sanitizeToolUseResultPairing(sanitized.messages) : sanitized.messages;
		let strippedTrailingAssistantPrefill = false;
		if (transcriptPolicy?.validateAnthropicTurns) nextMessages = sanitizeAnthropicReplayToolResults(nextMessages, { disallowEmbeddedUserToolResultsForSignedThinkingReplay: allowProviderOwnedThinkingReplay });
		if (transcriptPolicy?.validateAnthropicTurns || transcriptPolicy?.validateGeminiTurns) {
			const beforeStrip = nextMessages;
			nextMessages = stripTrailingAssistantPrefillTurns(nextMessages);
			strippedTrailingAssistantPrefill ||= nextMessages !== beforeStrip;
		}
		if (nextMessages === messages) return baseFn(model, context, options);
		if (sanitized.droppedAssistantMessages > 0 || transcriptPolicy?.validateAnthropicTurns || strippedTrailingAssistantPrefill) {
			if (transcriptPolicy?.validateGeminiTurns) nextMessages = validateGeminiTurns(nextMessages);
			if (transcriptPolicy?.validateAnthropicTurns) nextMessages = validateAnthropicTurns(nextMessages);
		}
		return baseFn(model, {
			...context,
			messages: nextMessages
		}, options);
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/stream-wrapper.ts
const eventTransforms = /* @__PURE__ */ new WeakMap();
/**
* Mutates a stream so every object event passes through `onEvent` before the
* consumer receives it. Used by stream adapters that need to normalize partial
* and final message snapshots without replacing the stream object.
*/
function wrapStreamObjectEvents(stream, onEvent) {
	const previous = eventTransforms.get(stream);
	if (previous?.iterator === stream[Symbol.asyncIterator]) {
		previous.transforms.push(onEvent);
		return stream;
	}
	const transforms = [onEvent];
	const originalAsyncIterator = stream[Symbol.asyncIterator].bind(stream);
	const iterator = function() {
		const activeTransforms = transforms.slice();
		return createStreamIteratorWrapper({
			iterator: originalAsyncIterator(),
			next: async (streamIterator) => {
				const result = await streamIterator.next();
				if (!result.done && result.value && typeof result.value === "object") for (const transform of activeTransforms) {
					const pending = transform(result.value);
					if (pending) await pending;
				}
				return result;
			}
		});
	};
	stream[Symbol.asyncIterator] = iterator;
	eventTransforms.set(stream, {
		iterator,
		transforms
	});
	return stream;
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-tool-call-stream-normalization.ts
/** Normalizes live streamed tool-call names, ids, and unknown-tool loops. */
const BLANK_TOOL_CALL_NAME_DESCRIPTION = "blank tool name";
function createStandaloneTextToolCallId$1() {
	return `call_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}
function normalizeToolCallsInMessage(message, allowedToolNames, fallbackIdByContentIndex) {
	if (!message || typeof message !== "object") return;
	const content = message.content;
	if (!Array.isArray(content)) return;
	let usedIds;
	let unknownToolName;
	let sawAllowedToolCall = false;
	let sawIncompleteToolCall = false;
	let sawBlankStringToolCall = false;
	const hasAllowedToolNames = Boolean(allowedToolNames && allowedToolNames.size > 0);
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		const typedBlock = block;
		if (!isRunnerToolCallBlockType(typedBlock.type)) continue;
		usedIds ??= /* @__PURE__ */ new Set();
		const rawId = typeof typedBlock.id === "string" ? typedBlock.id : void 0;
		if (typeof typedBlock.name === "string") {
			const normalized = resolveToolCallName(typedBlock.name, allowedToolNames, rawId);
			if (normalized !== null && normalized !== typedBlock.name) typedBlock.name = normalized;
		} else {
			const inferred = resolveToolCallName("", allowedToolNames, rawId);
			if (inferred) typedBlock.name = inferred;
		}
		const trimmedId = rawId?.trim();
		if (trimmedId) usedIds.add(trimmedId);
		const rawBlockName = typedBlock.name;
		const hasStringName = typeof rawBlockName === "string";
		const rawName = hasStringName ? rawBlockName.trim() : "";
		if (!rawName) {
			if (hasStringName) sawBlankStringToolCall = true;
			else sawIncompleteToolCall = true;
			continue;
		}
		if (!hasAllowedToolNames) continue;
		if (hasStringName && allowedToolNames?.has(rawBlockName)) {
			sawAllowedToolCall = true;
			continue;
		}
		const normalizedUnknownToolName = normalizeToolPolicyName(rawName);
		if (!unknownToolName) {
			unknownToolName = normalizedUnknownToolName;
			continue;
		}
		if (unknownToolName !== normalizedUnknownToolName) sawIncompleteToolCall = true;
	}
	if (!usedIds) return;
	const assignedIds = /* @__PURE__ */ new Set();
	for (const [contentIndex, block] of content.entries()) {
		if (!block || typeof block !== "object") continue;
		const typedBlock = block;
		if (!isRunnerToolCallBlockType(typedBlock.type)) continue;
		if (typeof typedBlock.id === "string") {
			const trimmedId = typedBlock.id.trim();
			if (trimmedId) {
				if (!assignedIds.has(trimmedId)) {
					if (typedBlock.id !== trimmedId) typedBlock.id = trimmedId;
					assignedIds.add(trimmedId);
					continue;
				}
			}
		}
		let fallbackId = fallbackIdByContentIndex[contentIndex];
		while (!fallbackId || usedIds.has(fallbackId) || assignedIds.has(fallbackId)) fallbackId = createStandaloneTextToolCallId$1();
		fallbackIdByContentIndex[contentIndex] = fallbackId;
		typedBlock.id = fallbackId;
		usedIds.add(fallbackId);
		assignedIds.add(fallbackId);
	}
	if (!hasAllowedToolNames) return sawBlankStringToolCall ? {
		kind: "malformed",
		toolName: BLANK_TOOL_CALL_NAME_DESCRIPTION
	} : void 0;
	if (sawAllowedToolCall) return { kind: "allowed" };
	if (sawBlankStringToolCall && !sawIncompleteToolCall && unknownToolName === void 0) return {
		kind: "malformed",
		toolName: BLANK_TOOL_CALL_NAME_DESCRIPTION
	};
	if (sawIncompleteToolCall) return { kind: "incomplete" };
	return unknownToolName ? {
		kind: "unknown",
		toolName: unknownToolName
	} : { kind: "incomplete" };
}
function rewriteUnknownToolLoopMessage(message, toolName) {
	if (!message || typeof message !== "object") return;
	message.content = [{
		type: "text",
		text: `I can't use the tool "${toolName}" here because it isn't available. I need to stop retrying it and answer without that tool.`
	}];
	stripCompactionReplayCheckpointInPlace(message);
}
function guardUnknownToolLoopInMessage(message, toolCallState, state, params) {
	if (toolCallState?.kind === "allowed") {
		if (params.resetOnAllowedTool === true) {
			state.lastUnknownToolName = void 0;
			state.count = 0;
		}
		return false;
	}
	if (toolCallState?.kind === "malformed") {
		if (params.rewriteMalformedBlankToolName === true) {
			rewriteUnknownToolLoopMessage(message, toolCallState.toolName);
			return true;
		}
		if (params.countAttempt && params.resetOnMissingUnknownTool !== false) {
			state.lastUnknownToolName = void 0;
			state.count = 0;
		}
		return false;
	}
	const threshold = params.threshold;
	if (threshold === void 0 || threshold <= 0) return false;
	if (toolCallState?.kind !== "unknown") {
		if (params.countAttempt && params.resetOnMissingUnknownTool !== false) {
			state.lastUnknownToolName = void 0;
			state.count = 0;
		}
		return false;
	}
	const unknownToolName = toolCallState.toolName;
	if (!params.countAttempt) {
		if (state.lastUnknownToolName === unknownToolName && state.count > threshold) rewriteUnknownToolLoopMessage(message, unknownToolName);
		return false;
	}
	if (message && typeof message === "object") {
		if (state.countedMessages.has(message)) {
			if (state.lastUnknownToolName === unknownToolName && state.count > threshold) rewriteUnknownToolLoopMessage(message, unknownToolName);
			return true;
		}
		state.countedMessages.add(message);
	}
	if (state.lastUnknownToolName === unknownToolName) state.count += 1;
	else {
		state.lastUnknownToolName = unknownToolName;
		state.count = 1;
	}
	if (state.count > threshold) rewriteUnknownToolLoopMessage(message, unknownToolName);
	return true;
}
function wrapStreamTrimToolCallNames(stream, allowedToolNames, options) {
	const unknownToolGuardState = options?.state ?? {
		count: 0,
		countedMessages: /* @__PURE__ */ new WeakSet()
	};
	const fallbackIdByContentIndex = [];
	let streamAttemptAlreadyCounted = false;
	const originalResult = stream.result.bind(stream);
	stream.result = async () => {
		const message = await originalResult();
		guardUnknownToolLoopInMessage(message, normalizeToolCallsInMessage(message, allowedToolNames, fallbackIdByContentIndex), unknownToolGuardState, {
			threshold: options?.unknownToolThreshold,
			countAttempt: !streamAttemptAlreadyCounted,
			resetOnAllowedTool: true,
			rewriteMalformedBlankToolName: true
		});
		return message;
	};
	wrapStreamObjectEvents(stream, (event) => {
		const partialState = normalizeToolCallsInMessage(event.partial, allowedToolNames, fallbackIdByContentIndex);
		const messageState = normalizeToolCallsInMessage(event.message, allowedToolNames, fallbackIdByContentIndex);
		if (event.message && typeof event.message === "object") {
			const countedStreamAttempt = guardUnknownToolLoopInMessage(event.message, messageState, unknownToolGuardState, {
				threshold: options?.unknownToolThreshold,
				countAttempt: !streamAttemptAlreadyCounted,
				resetOnAllowedTool: true,
				resetOnMissingUnknownTool: false
			});
			streamAttemptAlreadyCounted ||= countedStreamAttempt;
		}
		if (event.partial !== event.message) guardUnknownToolLoopInMessage(event.partial, partialState, unknownToolGuardState, {
			threshold: options?.unknownToolThreshold,
			countAttempt: false
		});
	});
	return stream;
}
/** Normalizes streamed tool-call names and guards repeated unknown-tool loops. */
function wrapStreamFnTrimToolCallNames(baseFn, allowedToolNames, guardOptions) {
	const unknownToolGuardState = {
		count: 0,
		countedMessages: /* @__PURE__ */ new WeakSet()
	};
	return (model, context, streamOptions) => {
		const maybeStream = baseFn(model, context, streamOptions);
		if (maybeStream && typeof maybeStream === "object" && "then" in maybeStream) return Promise.resolve(maybeStream).then((stream) => wrapStreamTrimToolCallNames(stream, allowedToolNames, {
			unknownToolThreshold: guardOptions?.unknownToolThreshold,
			state: unknownToolGuardState
		}));
		return wrapStreamTrimToolCallNames(maybeStream, allowedToolNames, {
			unknownToolThreshold: guardOptions?.unknownToolThreshold,
			state: unknownToolGuardState
		});
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-tool-call-text-promotion.ts
/** Promotes safe standalone text tool calls into structured stream events. */
function createStandaloneTextToolCallId() {
	return `call_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}
function isRetainableNonVisibleBlock(block) {
	return block.type === "thinking" || block.type === "redacted_thinking";
}
const STANDALONE_TEXT_TOOL_CALL_PROMOTION_STOP_REASONS = /* @__PURE__ */ new Set(["stop", "toolUse"]);
function createStandaloneToolCallNameMatcher(allowedToolNames) {
	return {
		hasExactName: (name) => Boolean(resolveToolCallName(name, allowedToolNames, void 0, true)),
		hasNamePrefix: (prefix) => couldNormalizeToolNamePrefixToAllowedTool(prefix, allowedToolNames)
	};
}
function wrapStreamPromoteStandaloneTextToolCalls(stream, allowedToolNames) {
	const matcher = createStandaloneToolCallNameMatcher(allowedToolNames);
	const promotedIdBySource = /* @__PURE__ */ new Map();
	const normalizeTerminalMessage = (params) => {
		const scrubbed = projectScrubbedPlainTextToolCallMessage({
			forceIncompleteCandidates: true,
			matcher,
			message: params.message,
			preserveEmptyTextBlocks: params.preserveEmptyTextBlocks,
			resolveProtectedRanges: findCodeRegions,
			requireAssistantRole: true
		});
		if (scrubbed) {
			stripCompactionReplayCheckpointInPlace(scrubbed.message);
			return {
				kind: "scrubbed",
				...scrubbed
			};
		}
		if (!params.allowPromotion) return;
		let ordinal = 0;
		const createStableToolCallBlock = (block, name) => {
			const sourceKey = `${ordinal}:${block.start}:${block.end}`;
			ordinal += 1;
			let id = promotedIdBySource.get(sourceKey);
			if (!id) {
				id = createStandaloneTextToolCallId();
				promotedIdBySource.set(sourceKey, id);
			}
			return {
				type: "toolCall",
				id,
				name,
				arguments: block.arguments,
				partialArgs: JSON.stringify(block.arguments)
			};
		};
		const promoted = projectStandalonePlainTextToolCallMessage({
			allowedStopReasons: STANDALONE_TEXT_TOOL_CALL_PROMOTION_STOP_REASONS,
			allowedToolNames,
			createToolCallBlock: createStableToolCallBlock,
			isRetainableNonTextBlock: isRetainableNonVisibleBlock,
			message: params.message,
			requireAssistantRole: true,
			resolveProtectedRanges: findCodeRegions,
			resolveToolName: (name) => resolveToolCallName(name, allowedToolNames, void 0, true)
		});
		if (promoted) stripCompactionReplayCheckpointInPlace(promoted.message);
		return promoted ? {
			kind: "promoted",
			...promoted
		} : void 0;
	};
	const originalResult = stream.result.bind(stream);
	stream.result = async () => {
		const message = await originalResult();
		const reason = message && typeof message === "object" ? message.stopReason : void 0;
		return normalizeTerminalMessage({
			allowPromotion: STANDALONE_TEXT_TOOL_CALL_PROMOTION_STOP_REASONS.has(reason),
			message
		})?.message ?? message;
	};
	const originalAsyncIterator = stream[Symbol.asyncIterator].bind(stream);
	const wrappedAsyncIterator = async function* () {
		yield* normalizePlainTextToolCallStreamEvents({ [Symbol.asyncIterator]: originalAsyncIterator }, {
			createPromotedToolCallEvents: createPromotedPlainTextToolCallEvents,
			matcher,
			normalizeTerminalMessage,
			protectedRangesFenceCompatible: true,
			resolveProtectedRanges: findCodeRegions
		});
	};
	if (!Reflect.set(stream, Symbol.asyncIterator, wrappedAsyncIterator)) throw new TypeError("Cannot replace stream async iterator");
	return stream;
}
/** Promotes standalone plain-text tool-call replies into structured toolCall blocks when safe. */
function wrapStreamFnPromoteStandaloneTextToolCalls(baseFn, allowedToolNames) {
	if (!allowedToolNames || allowedToolNames.size === 0) return baseFn;
	return (model, context, streamOptions) => {
		const maybeStream = baseFn(model, context, streamOptions);
		if (maybeStream && typeof maybeStream === "object" && "then" in maybeStream) return Promise.resolve(maybeStream).then((stream) => wrapStreamPromoteStandaloneTextToolCalls(stream, allowedToolNames));
		return wrapStreamPromoteStandaloneTextToolCalls(maybeStream, allowedToolNames);
	};
}
//#endregion
//#region src/shared/message-content-blocks.ts
/** Visit object-shaped content blocks in an assistant/user message payload. */
function visitObjectContentBlocks(message, visitor) {
	if (!message || typeof message !== "object") return;
	const content = message.content;
	if (!Array.isArray(content)) return;
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		visitor(block);
	}
}
//#endregion
//#region src/agents/embedded-agent-runner/tool-call-argument-decoding.ts
/**
* Decodes HTML-entity escaped tool-call arguments in stream wrappers.
*/
/**
* Decodes HTML entities inside streamed tool-call arguments before downstream execution.
*
* Some providers HTML-escape JSON-ish argument strings in tool-call content blocks; this wrapper
* repairs only arguments, preserving user-facing assistant text exactly as emitted.
*/
/** Recursively decodes HTML entities in string leaves of an object graph. */
function decodeHtmlEntitiesInObject(value) {
	if (typeof value === "string") return decodeHtmlEntities(value);
	if (Array.isArray(value)) return value.map(decodeHtmlEntitiesInObject);
	if (value && typeof value === "object") {
		const result = {};
		for (const [key, entry] of Object.entries(value)) result[key] = decodeHtmlEntitiesInObject(entry);
		return result;
	}
	return value;
}
const decodedToolCallArguments = /* @__PURE__ */ new WeakSet();
function decodeToolCallArgumentsHtmlEntitiesInMessage(message) {
	visitObjectContentBlocks(message, (block) => {
		const typedBlock = block;
		if (typedBlock.type !== "toolCall" || typeof typedBlock.arguments !== "object" || !typedBlock.arguments) return;
		if (decodedToolCallArguments.has(typedBlock.arguments)) return;
		const decoded = decodeHtmlEntitiesInObject(typedBlock.arguments);
		decodedToolCallArguments.add(decoded);
		typedBlock.arguments = decoded;
	});
}
function wrapStreamMessageObjects(stream, transformMessage) {
	const originalResult = stream.result.bind(stream);
	stream.result = async () => {
		const message = await originalResult();
		transformMessage(message);
		return message;
	};
	const originalAsyncIterator = stream[Symbol.asyncIterator].bind(stream);
	stream[Symbol.asyncIterator] = function() {
		const iterator = originalAsyncIterator();
		return {
			async next() {
				const result = await iterator.next();
				if (!result.done && result.value && typeof result.value === "object") {
					const event = result.value;
					transformMessage(event.partial);
					transformMessage(event.message);
				}
				return result;
			},
			async return(value) {
				return iterator.return?.(value) ?? {
					done: true,
					value: void 0
				};
			},
			async throw(error) {
				return iterator.throw?.(error) ?? {
					done: true,
					value: void 0
				};
			}
		};
	};
	return stream;
}
/** Wraps a stream function so tool-call arguments are decoded before consumers inspect them. */
function createHtmlEntityToolCallArgumentDecodingWrapper(baseStreamFn) {
	return (model, context, options) => {
		const maybeStream = baseStreamFn(model, context, options);
		if (maybeStream && typeof maybeStream === "object" && "then" in maybeStream) return Promise.resolve(maybeStream).then((stream) => wrapStreamMessageObjects(stream, decodeToolCallArgumentsHtmlEntitiesInMessage));
		return wrapStreamMessageObjects(maybeStream, decodeToolCallArgumentsHtmlEntitiesInMessage);
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt.tool-call-argument-repair.ts
/**
* Repairs malformed tool-call arguments in embedded-agent stream results.
*/
const MAX_TOOLCALL_REPAIR_BUFFER_CHARS = 64e3;
const MAX_TOOLCALL_REPAIR_LEADING_CHARS = 96;
const MAX_TOOLCALL_REPAIR_TRAILING_CHARS = 3;
const TOOLCALL_REPAIR_ALLOWED_LEADING_RE = /^[a-z0-9\s"'`.:/_\\-]+$/i;
const TOOLCALL_REPAIR_ALLOWED_TRAILING_RE = /^[^\s{}[\]":,\\]{1,3}$/;
const TOOLCALL_REPAIR_RESPONSES_APIS = /* @__PURE__ */ new Set(["azure-openai-responses", "openai-chatgpt-responses"]);
const TOOLCALL_REPAIR_SMART_QUOTES = /* @__PURE__ */ new Set([
	"“",
	"”",
	"„",
	"‟"
]);
const MAX_TOOLCALL_REPAIR_MEMBER_KEY_CHARS = 96;
const TOOLCALL_REPAIR_KNOWN_ARG_KEYS = /* @__PURE__ */ new Set([
	"args",
	"backupDir",
	"cmd",
	"command",
	"content",
	"cwd",
	"edits",
	"file",
	"file_path",
	"filePath",
	"filepath",
	"from",
	"line_end",
	"line_start",
	"lines",
	"message",
	"new_str",
	"new_string",
	"newText",
	"old_str",
	"old_string",
	"oldText",
	"path",
	"paths",
	"pattern",
	"query",
	"replacement",
	"text",
	"timeoutMs",
	"title",
	"to",
	"url",
	"urls",
	"workdir"
]);
const TOOLCALL_REPAIR_FREEFORM_VALUE_KEYS = /* @__PURE__ */ new Set([
	"content",
	"message",
	"new_str",
	"new_string",
	"newText",
	"old_str",
	"old_string",
	"oldText",
	"text"
]);
const TOOLCALL_REPAIR_FREEFORM_SUCCESSOR_KEYS = {
	old_str: "new_str",
	old_string: "new_string",
	oldText: "newText"
};
const TOOLCALL_REPAIR_TOOL_VALUE_SUCCESSOR_KEYS = /* @__PURE__ */ new Map([["read", /* @__PURE__ */ new Map([["path", ["offset", "limit"]]])]]);
const TOOLCALL_REPAIR_JSON_STRING_ESCAPES = {
	"\"": "\"",
	"\\": "\\",
	"/": "/",
	b: "\b",
	f: "\f",
	n: "\n",
	r: "\r",
	t: "	"
};
function shouldAttemptMalformedToolCallRepair(partialJson, delta) {
	if (/[}\]]/.test(delta)) return true;
	const trimmedDelta = delta.trim();
	return trimmedDelta.length > 0 && trimmedDelta.length <= MAX_TOOLCALL_REPAIR_TRAILING_CHARS && /[}\]]/.test(partialJson);
}
function isAllowedToolCallRepairLeadingPrefix(prefix) {
	if (!prefix) return true;
	if (prefix.length > MAX_TOOLCALL_REPAIR_LEADING_CHARS) return false;
	if (!TOOLCALL_REPAIR_ALLOWED_LEADING_RE.test(prefix)) return false;
	return /^[.:'"`-]/.test(prefix) || /^(?:functions?|tools?)[._:/-]?/i.test(prefix);
}
function isWhitespace(char) {
	return char !== void 0 && char.trim() === "";
}
function skipWhitespace(raw, index) {
	for (let i = index; i < raw.length; i += 1) if (!isWhitespace(raw[i])) return i;
	return raw.length;
}
function isToolCallRepairSmartQuote(char) {
	return char !== void 0 && TOOLCALL_REPAIR_SMART_QUOTES.has(char);
}
function findAsciiStringEnd(raw, startIndex) {
	let escaped = false;
	for (let i = startIndex + 1; i < raw.length; i += 1) {
		const char = raw[i];
		if (escaped) escaped = false;
		else if (char === "\\") escaped = true;
		else if (char === "\"") return i;
	}
	return -1;
}
function readAsciiQuotedString(raw, startIndex) {
	const endIndex = findAsciiStringEnd(raw, startIndex);
	if (endIndex < 0) return;
	try {
		const parsed = JSON.parse(raw.slice(startIndex, endIndex + 1));
		return typeof parsed === "string" ? {
			value: parsed,
			endIndex: endIndex + 1
		} : void 0;
	} catch {
		return;
	}
}
function readSmartQuotedObjectKey(raw, startIndex) {
	let value = "";
	for (let i = startIndex + 1; i < raw.length; i += 1) {
		const char = raw[i];
		if (isToolCallRepairSmartQuote(char) && raw[skipWhitespace(raw, i + 1)] === ":") return {
			value,
			endIndex: i + 1
		};
		value += char;
		if (value.length > MAX_TOOLCALL_REPAIR_MEMBER_KEY_CHARS) return;
	}
}
function readObjectKey(raw, startIndex) {
	const char = raw[startIndex];
	return char === "\"" ? readAsciiQuotedString(raw, startIndex) : isToolCallRepairSmartQuote(char) ? readSmartQuotedObjectKey(raw, startIndex) : void 0;
}
function readObjectMemberKeyAfterComma(raw, commaIndex) {
	const key = readObjectKey(raw, skipWhitespace(raw, commaIndex + 1));
	if (!key || raw[skipWhitespace(raw, key.endIndex)] !== ":") return;
	return key.value;
}
function normalizeToolCallRepairToolName(value) {
	const trimmed = value.trim();
	if (!/^[a-z0-9_-]{1,128}$/i.test(trimmed)) return;
	return trimmed.toLowerCase();
}
function extractToolNameFromLeadingPrefix(prefix) {
	const match = /(?:^|[.\s])(?:functions?|tools?)[._:/-]?([a-z0-9_-]+)/i.exec(prefix);
	return match?.[1] ? normalizeToolCallRepairToolName(match[1]) : void 0;
}
function isToolSpecificValueSuccessor(params) {
	const toolName = params.toolName;
	if (!toolName) return false;
	return TOOLCALL_REPAIR_TOOL_VALUE_SUCCESSOR_KEYS.get(toolName)?.get(params.valueKey)?.includes(params.nextKey) ?? false;
}
function shouldCloseSmartQuotedValueAt(raw, quoteIndex, valueKey, toolName) {
	const nextIndex = skipWhitespace(raw, quoteIndex + 1);
	const nextChar = raw[nextIndex];
	if (nextIndex >= raw.length || nextChar === "}") return true;
	if (nextChar !== ",") return false;
	const nextKey = readObjectMemberKeyAfterComma(raw, nextIndex);
	if (!nextKey) return false;
	if (!TOOLCALL_REPAIR_FREEFORM_VALUE_KEYS.has(valueKey)) return TOOLCALL_REPAIR_KNOWN_ARG_KEYS.has(nextKey) || isToolSpecificValueSuccessor({
		toolName,
		valueKey,
		nextKey
	});
	return TOOLCALL_REPAIR_FREEFORM_SUCCESSOR_KEYS[valueKey] === nextKey;
}
function decodeSmartQuotedJsonStringEscapes(value) {
	return value.replace(/\\(?:(["\\/bfnrt])|u([0-9a-fA-F]{4}))/g, (match, escaped, hex) => {
		if (typeof hex === "string") return String.fromCharCode(Number.parseInt(hex, 16));
		return typeof escaped === "string" ? TOOLCALL_REPAIR_JSON_STRING_ESCAPES[escaped] ?? match : match;
	});
}
function readSmartQuotedValue(raw, startIndex, key, toolName) {
	let value = "";
	for (let i = startIndex + 1; i < raw.length; i += 1) {
		const char = raw[i];
		if (isToolCallRepairSmartQuote(char) && shouldCloseSmartQuotedValueAt(raw, i, key, toolName)) return {
			value: decodeSmartQuotedJsonStringEscapes(value),
			endIndex: i + 1
		};
		value += char;
	}
}
function readJsonValue(raw, startIndex) {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = startIndex; i < raw.length; i += 1) {
		const char = raw[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === "\"") inString = false;
			continue;
		}
		if (char === "\"") {
			inString = true;
			continue;
		}
		if (char === "{" || char === "[") {
			depth += 1;
			continue;
		}
		if (char === "}" || char === "]") {
			if (depth === 0) return parseJsonValuePrefix(raw, startIndex, i);
			depth -= 1;
			continue;
		}
		if (char === "," && depth === 0) return parseJsonValuePrefix(raw, startIndex, i);
	}
	return parseJsonValuePrefix(raw, startIndex, raw.length);
}
function parseJsonValuePrefix(raw, startIndex, endIndex) {
	const json = raw.slice(startIndex, endIndex).trim();
	if (!json) return;
	try {
		return {
			value: JSON.parse(json),
			endIndex
		};
	} catch {
		return;
	}
}
function readSmartQuotedEditArray(raw, startIndex) {
	if (raw[startIndex] !== "[") return;
	const edits = [];
	let index = skipWhitespace(raw, startIndex + 1);
	if (raw[index] === "]") return {
		value: edits,
		endIndex: index + 1
	};
	while (index < raw.length) {
		const edit = parseSmartQuotedToolCallObject(raw, index);
		if (!edit) return;
		edits.push(edit.args);
		index = skipWhitespace(raw, edit.endIndex);
		if (raw[index] === ",") {
			index = skipWhitespace(raw, index + 1);
			continue;
		}
		if (raw[index] === "]") return {
			value: edits,
			endIndex: index + 1
		};
		return;
	}
}
function readObjectValue(raw, startIndex, key, toolName) {
	const char = raw[startIndex];
	if (char === "\"") return readAsciiQuotedString(raw, startIndex);
	if (isToolCallRepairSmartQuote(char)) return readSmartQuotedValue(raw, startIndex, key, toolName);
	if (key === "edits" && char === "[") return readSmartQuotedEditArray(raw, startIndex);
	return readJsonValue(raw, startIndex);
}
function parseSmartQuotedToolCallObject(raw, startIndex, toolName) {
	if (raw[startIndex] !== "{") return;
	const args = {};
	const seenKeys = /* @__PURE__ */ new Set();
	let index = skipWhitespace(raw, startIndex + 1);
	if (raw[index] === "}") return {
		args,
		endIndex: index + 1
	};
	while (index < raw.length) {
		const key = readObjectKey(raw, index);
		if (!key || seenKeys.has(key.value)) return;
		seenKeys.add(key.value);
		index = skipWhitespace(raw, key.endIndex);
		if (raw[index] !== ":") return;
		const value = readObjectValue(raw, skipWhitespace(raw, index + 1), key.value, toolName);
		if (!value) return;
		args[key.value] = value.value;
		index = skipWhitespace(raw, value.endIndex);
		if (raw[index] === ",") {
			index = skipWhitespace(raw, index + 1);
			continue;
		}
		if (raw[index] === "}") return {
			args,
			endIndex: index + 1
		};
		return;
	}
}
function tryExtractUsableToolCallArgumentsFromJson(raw) {
	const extracted = extractBalancedJsonPrefix(raw);
	if (!extracted) return;
	const leadingPrefix = raw.slice(0, extracted.startIndex).trim();
	if (!isAllowedToolCallRepairLeadingPrefix(leadingPrefix)) return;
	const suffix = raw.slice(extracted.startIndex + extracted.json.length).trim();
	if (leadingPrefix.length === 0 && suffix.length === 0) return;
	if (suffix.length > MAX_TOOLCALL_REPAIR_TRAILING_CHARS || suffix.length > 0 && !TOOLCALL_REPAIR_ALLOWED_TRAILING_RE.test(suffix)) return;
	const parsedExtracted = safeParseJsonRecord(extracted.json);
	if (!parsedExtracted) return;
	return {
		args: parsedExtracted,
		kind: "repaired",
		leadingPrefix,
		trailingSuffix: suffix
	};
}
function tryExtractSmartQuotedToolCallArguments(raw, toolNameFromContext) {
	if (!/[\u201c\u201d\u201e\u201f]/.test(raw)) return;
	const startIndex = raw.indexOf("{");
	if (startIndex < 0) return;
	const leadingPrefix = raw.slice(0, startIndex).trim();
	if (!isAllowedToolCallRepairLeadingPrefix(leadingPrefix)) return;
	const parsed = parseSmartQuotedToolCallObject(raw, startIndex, toolNameFromContext ?? extractToolNameFromLeadingPrefix(leadingPrefix));
	if (!parsed) return;
	const suffix = raw.slice(parsed.endIndex).trim();
	if (suffix.length > MAX_TOOLCALL_REPAIR_TRAILING_CHARS || suffix.length > 0 && !TOOLCALL_REPAIR_ALLOWED_TRAILING_RE.test(suffix)) return;
	return {
		args: parsed.args,
		kind: "repaired",
		leadingPrefix,
		trailingSuffix: suffix
	};
}
function tryExtractUsableToolCallArguments(raw, toolNameFromContext) {
	if (!raw.trim()) return;
	const parsedRaw = safeParseJsonRecord(raw);
	if (parsedRaw) return {
		args: parsedRaw,
		kind: "preserved",
		leadingPrefix: "",
		trailingSuffix: ""
	};
	return tryExtractUsableToolCallArgumentsFromJson(raw) ?? tryExtractSmartQuotedToolCallArguments(raw, toolNameFromContext);
}
function readToolCallNameInMessage(message, contentIndex) {
	if (!message || typeof message !== "object") return;
	const content = message.content;
	if (!Array.isArray(content)) return;
	const block = content[contentIndex];
	if (!block || typeof block !== "object") return;
	const typedBlock = block;
	if (!isRunnerToolCallBlockType(typedBlock.type) || typeof typedBlock.name !== "string") return;
	return normalizeToolCallRepairToolName(typedBlock.name);
}
function repairToolCallArgumentsInMessage(message, contentIndex, repairedArgs) {
	if (!message || typeof message !== "object") return;
	const content = message.content;
	if (!Array.isArray(content)) return;
	const block = content[contentIndex];
	if (!block || typeof block !== "object") return;
	const typedBlock = block;
	if (!isRunnerToolCallBlockType(typedBlock.type)) return;
	typedBlock.arguments = repairedArgs;
}
function hasMeaningfulToolCallArgumentsInMessage(message, contentIndex) {
	if (!message || typeof message !== "object") return false;
	const content = message.content;
	if (!Array.isArray(content)) return false;
	const block = content[contentIndex];
	if (!block || typeof block !== "object") return false;
	const typedBlock = block;
	if (!isRunnerToolCallBlockType(typedBlock.type)) return false;
	return typedBlock.arguments !== null && typeof typedBlock.arguments === "object" && !Array.isArray(typedBlock.arguments) && Object.keys(typedBlock.arguments).length > 0;
}
function clearToolCallArgumentsInMessage(message, contentIndex) {
	if (!message || typeof message !== "object") return;
	const content = message.content;
	if (!Array.isArray(content)) return;
	const block = content[contentIndex];
	if (!block || typeof block !== "object") return;
	const typedBlock = block;
	if (!isRunnerToolCallBlockType(typedBlock.type)) return;
	typedBlock.arguments = {};
}
function repairMalformedToolCallArgumentsInMessage(message, repairedArgsByIndex) {
	if (!message || typeof message !== "object") return;
	const content = message.content;
	if (!Array.isArray(content)) return;
	for (const [index, repairedArgs] of repairedArgsByIndex.entries()) repairToolCallArgumentsInMessage(message, index, repairedArgs);
}
function wrapStreamRepairMalformedToolCallArguments(stream) {
	const partialJsonByIndex = /* @__PURE__ */ new Map();
	const repairedArgsByIndex = /* @__PURE__ */ new Map();
	const hadPreexistingArgsByIndex = /* @__PURE__ */ new Set();
	const disabledIndices = /* @__PURE__ */ new Set();
	const loggedRepairIndices = /* @__PURE__ */ new Set();
	const originalResult = stream.result.bind(stream);
	stream.result = async () => {
		const message = await originalResult();
		repairMalformedToolCallArgumentsInMessage(message, repairedArgsByIndex);
		partialJsonByIndex.clear();
		repairedArgsByIndex.clear();
		hadPreexistingArgsByIndex.clear();
		disabledIndices.clear();
		loggedRepairIndices.clear();
		return message;
	};
	wrapStreamObjectEvents(stream, (event) => {
		if (typeof event.contentIndex === "number" && Number.isInteger(event.contentIndex) && event.type === "toolcall_delta" && typeof event.delta === "string") {
			if (disabledIndices.has(event.contentIndex)) return;
			const nextPartialJson = (partialJsonByIndex.get(event.contentIndex) ?? "") + event.delta;
			if (nextPartialJson.length > MAX_TOOLCALL_REPAIR_BUFFER_CHARS) {
				partialJsonByIndex.delete(event.contentIndex);
				repairedArgsByIndex.delete(event.contentIndex);
				disabledIndices.add(event.contentIndex);
				return;
			}
			partialJsonByIndex.set(event.contentIndex, nextPartialJson);
			if (shouldAttemptMalformedToolCallRepair(nextPartialJson, event.delta) || repairedArgsByIndex.has(event.contentIndex)) {
				const hadRepairState = repairedArgsByIndex.has(event.contentIndex);
				const repair = tryExtractUsableToolCallArguments(nextPartialJson, readToolCallNameInMessage(event.partial, event.contentIndex) ?? readToolCallNameInMessage(event.message, event.contentIndex));
				if (repair) {
					if (!hadRepairState && (hasMeaningfulToolCallArgumentsInMessage(event.partial, event.contentIndex) || hasMeaningfulToolCallArgumentsInMessage(event.message, event.contentIndex))) hadPreexistingArgsByIndex.add(event.contentIndex);
					repairedArgsByIndex.set(event.contentIndex, repair.args);
					repairToolCallArgumentsInMessage(event.partial, event.contentIndex, repair.args);
					repairToolCallArgumentsInMessage(event.message, event.contentIndex, repair.args);
					if (!loggedRepairIndices.has(event.contentIndex) && repair.kind === "repaired") {
						loggedRepairIndices.add(event.contentIndex);
						log$5.warn(`repairing malformed tool call arguments with ${repair.leadingPrefix.length} leading chars and ${repair.trailingSuffix.length} trailing chars`);
					}
				} else {
					repairedArgsByIndex.delete(event.contentIndex);
					if (!(hadPreexistingArgsByIndex.has(event.contentIndex) || !hadRepairState && (hasMeaningfulToolCallArgumentsInMessage(event.partial, event.contentIndex) || hasMeaningfulToolCallArgumentsInMessage(event.message, event.contentIndex)))) {
						clearToolCallArgumentsInMessage(event.partial, event.contentIndex);
						clearToolCallArgumentsInMessage(event.message, event.contentIndex);
					}
				}
			}
		}
		if (typeof event.contentIndex === "number" && Number.isInteger(event.contentIndex) && event.type === "toolcall_end") {
			const repairedArgs = repairedArgsByIndex.get(event.contentIndex);
			if (repairedArgs) {
				if (event.toolCall && typeof event.toolCall === "object") event.toolCall.arguments = repairedArgs;
				repairToolCallArgumentsInMessage(event.partial, event.contentIndex, repairedArgs);
				repairToolCallArgumentsInMessage(event.message, event.contentIndex, repairedArgs);
			}
			partialJsonByIndex.delete(event.contentIndex);
			hadPreexistingArgsByIndex.delete(event.contentIndex);
			disabledIndices.delete(event.contentIndex);
			loggedRepairIndices.delete(event.contentIndex);
		}
	});
	return stream;
}
function wrapStreamFnRepairMalformedToolCallArguments(baseFn) {
	return (model, context, options) => {
		const maybeStream = baseFn(model, context, options);
		if (maybeStream && typeof maybeStream === "object" && "then" in maybeStream) return Promise.resolve(maybeStream).then((stream) => wrapStreamRepairMalformedToolCallArguments(stream));
		return wrapStreamRepairMalformedToolCallArguments(maybeStream);
	};
}
function shouldRepairMalformedToolCallArguments(params) {
	const modelApi = params.modelApi ?? "";
	return normalizeProviderId(params.provider ?? "") === "kimi" && modelApi === "anthropic-messages" || modelApi === "openai-completions" || TOOLCALL_REPAIR_RESPONSES_APIS.has(modelApi);
}
function wrapStreamFnDecodeXaiToolCallArguments(baseFn) {
	return createHtmlEntityToolCallArgumentDecodingWrapper(baseFn);
}
//#endregion
//#region src/agents/embedded-agent-runner/run/llm-idle-timeout.ts
/**
* Wraps LLM streams with idle-timeout detection and diagnostics.
*/
/**
* Default idle timeout for LLM streaming responses in milliseconds.
*/
const DEFAULT_LLM_IDLE_TIMEOUT_MS = 12e4;
const SELF_HOSTED_LLM_IDLE_TIMEOUT_MS = 3e5;
const CLOUD_LLM_FIRST_EVENT_TIMEOUT_MS = DEFAULT_LLM_IDLE_TIMEOUT_MS;
const LOCAL_LLM_FIRST_EVENT_TIMEOUT_MS = 3e5;
const CRON_LLM_IDLE_TIMEOUT_MS = 6e4;
const LOCAL_PROVIDER_AUTH_MARKERS = /* @__PURE__ */ new Set(["custom-local", "ollama-local"]);
const SELF_HOSTED_PROVIDER_ID_PREFIXES = [
	"ollama",
	"lmstudio",
	"vllm",
	"sglang",
	"llama-cpp"
];
/**
* Detects loopback / private-network / `.local` base URLs. Local providers
* (Ollama, LM Studio, llama.cpp) legitimately stay silent for many minutes
* during prompt evaluation and thinking, so the network-silence-as-hang
* heuristic that motivates the default idle watchdog does not apply.
*
* Coverage scope:
*  - IPv4 loopback (RFC 5735, full 127/8), RFC 1918 private, RFC 6598 shared
*    CGNAT (100.64/10 — Tailscale/Headscale IPv4 mesh), `0.0.0.0`, `localhost`,
*    and `*.local` mDNS (RFC 6762).
*  - IPv6 loopback `::1`, IPv6 unique local `fc00::/7` (RFC 4193 — Tailscale's
*    IPv6 mesh `fd7a:115c:a1e0::/48` falls in this range), and IPv6 link-local
*    `fe80::/10` (RFC 4291).
*  - IPv4-mapped IPv6 covers loopback only (`::ffff:127.0.0.1`,
*    `::ffff:7f00:1`); private IPv4 in mapped form is intentionally not
*    matched, mirroring the SSRF-policy helper in
*    `src/cron/isolated-agent/model-preflight.runtime.ts`.
*  - DNS-resolved local aliases (e.g. an `/etc/hosts` entry mapping a custom
*    hostname to a private IP) are not detected for the implicit watchdog opt-out:
*    classification keys on `URL.hostname` so resolution would have to happen
*    here, and adding sync/async DNS to the watchdog hot path is disproportionate.
*/
function isLocalProviderHostname(hostname) {
	let host = hostname;
	if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
	if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host === "::ffff:7f00:1" || host === "::ffff:127.0.0.1" || host.endsWith(".local")) return true;
	if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) return true;
	if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
	const octets = host.split(".").map((part) => Number.parseInt(part, 10));
	if (octets.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
	const [a, b] = octets;
	return a === 127 || a === 10 || a === 172 && b !== void 0 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b !== void 0 && b >= 64 && b <= 127;
}
function isExplicitLocalHostname(hostname) {
	return hostname === "docker.orb.internal" || hostname === "host.docker.internal" || hostname === "host.orb.internal";
}
function isBareProviderHostname(hostname) {
	if (hostname.includes(".") || hostname.includes(":")) return false;
	return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(hostname);
}
function isSelfHostedProviderId(provider) {
	const normalized = provider?.trim().toLowerCase();
	if (!normalized || normalized === "ollama-cloud") return false;
	return SELF_HOSTED_PROVIDER_ID_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}-`));
}
function findConfiguredProviderConfig(cfg, provider) {
	const normalizedProvider = provider?.trim().toLowerCase();
	if (!normalizedProvider) return;
	const providers = cfg?.models?.providers;
	const exact = providers?.[normalizedProvider];
	if (exact) return exact;
	return Object.entries(providers ?? {}).find(([key]) => key.trim().toLowerCase() === normalizedProvider)?.[1];
}
function hasLocalProviderAuthMarker(apiKey) {
	return typeof apiKey === "string" && LOCAL_PROVIDER_AUTH_MARKERS.has(apiKey.trim().toLowerCase());
}
function hasConfiguredLocalProviderSignal(params) {
	const providerConfig = findConfiguredProviderConfig(params.cfg, params.provider);
	return Boolean(providerConfig?.localService || hasLocalProviderAuthMarker(providerConfig?.apiKey));
}
/**
* Classifies the model endpoint locality shared by the idle and first-event
* watchdogs. Ollama `*:cloud` models stay "cloud" even behind a local proxy.
*/
function resolveRuntimeModelLocality(params) {
	const baseUrl = params?.model?.baseUrl;
	let hostname;
	if (typeof baseUrl === "string" && baseUrl.length > 0) try {
		hostname = new URL(baseUrl).hostname.toLowerCase();
	} catch {
		hostname = void 0;
	}
	if (!hostname) return {
		isLocalRuntimeModel: false,
		isExplicitLocalHostnameRuntimeModel: false,
		isSelfHostedHostnameRuntimeModel: false
	};
	const notCloudModel = !isCloudModelRef(params?.model?.id);
	return {
		isLocalRuntimeModel: isLocalProviderHostname(hostname) && notCloudModel,
		isExplicitLocalHostnameRuntimeModel: isExplicitLocalHostname(hostname) && notCloudModel,
		isSelfHostedHostnameRuntimeModel: isBareProviderHostname(hostname) && (isSelfHostedProviderId(params?.model?.provider) || hasConfiguredLocalProviderSignal({
			cfg: params?.cfg,
			provider: params?.model?.provider
		})) && notCloudModel
	};
}
/**
* Resolves the stream-idle watchdog timeout for one embedded run. Explicit
* provider request timeouts and bounded run/agent timeouts cap the watchdog;
* local provider base URLs disable the implicit cloud-provider default.
*/
function resolveLlmIdleTimeoutMs(params) {
	const clampTimeoutMs = (valueMs) => clampTimerTimeoutMs(valueMs) ?? 1;
	const runTimeoutMs = params?.runTimeoutMs;
	const agentTimeoutSeconds = params?.cfg?.agents?.defaults?.timeoutSeconds;
	const agentTimeoutMs = finiteSecondsToTimerSafeMilliseconds(agentTimeoutSeconds);
	const hasExplicitRunTimeout = typeof runTimeoutMs === "number" && Number.isFinite(runTimeoutMs) && runTimeoutMs > 0;
	const runTimeoutIsNoTimeout = hasExplicitRunTimeout && runTimeoutMs >= 2147e6;
	const { isLocalRuntimeModel, isExplicitLocalHostnameRuntimeModel, isSelfHostedHostnameRuntimeModel } = resolveRuntimeModelLocality(params);
	const isSelfHostedRuntimeModel = isSelfHostedProviderId(params?.model?.provider) && !isCloudModelRef(params?.model?.id);
	const timeoutBounds = [runTimeoutIsNoTimeout ? void 0 : runTimeoutMs, hasExplicitRunTimeout ? void 0 : agentTimeoutMs].filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0 && value < 2147e6);
	const clampToClassIdleCeiling = (budgetMs) => {
		if (isLocalRuntimeModel) return clampTimeoutMs(budgetMs);
		return clampTimeoutMs(Math.min(budgetMs, isSelfHostedRuntimeModel || isExplicitLocalHostnameRuntimeModel || isSelfHostedHostnameRuntimeModel ? SELF_HOSTED_LLM_IDLE_TIMEOUT_MS : DEFAULT_LLM_IDLE_TIMEOUT_MS));
	};
	const modelRequestTimeoutMs = params?.modelRequestTimeoutMs;
	if (typeof modelRequestTimeoutMs === "number" && Number.isFinite(modelRequestTimeoutMs) && modelRequestTimeoutMs > 0) return clampTimeoutMs(Math.min(modelRequestTimeoutMs, ...timeoutBounds));
	if (hasExplicitRunTimeout && runTimeoutMs < 2147e6) {
		if (params?.trigger === "cron") {
			if (isLocalRuntimeModel || isExplicitLocalHostnameRuntimeModel || isSelfHostedHostnameRuntimeModel || isSelfHostedRuntimeModel) return clampTimeoutMs(runTimeoutMs);
			return clampTimeoutMs(Math.min(runTimeoutMs, CRON_LLM_IDLE_TIMEOUT_MS));
		}
		return clampToClassIdleCeiling(runTimeoutMs);
	}
	if (agentTimeoutMs !== void 0) return clampToClassIdleCeiling(agentTimeoutMs);
	if (isLocalRuntimeModel) return 0;
	if (isSelfHostedRuntimeModel || isExplicitLocalHostnameRuntimeModel || isSelfHostedHostnameRuntimeModel) return SELF_HOSTED_LLM_IDLE_TIMEOUT_MS;
	return DEFAULT_LLM_IDLE_TIMEOUT_MS;
}
function resolveLlmFirstEventTimeoutMs(params) {
	const clampTimeoutMs = (valueMs) => clampTimerTimeoutMs(valueMs) ?? 1;
	const runTimeoutMs = params?.runTimeoutMs;
	const agentTimeoutMs = finiteSecondsToTimerSafeMilliseconds(params?.cfg?.agents?.defaults?.timeoutSeconds);
	const hasExplicitRunTimeout = typeof runTimeoutMs === "number" && Number.isFinite(runTimeoutMs) && runTimeoutMs > 0;
	const runTimeoutIsBounded = hasExplicitRunTimeout && runTimeoutMs < 2147e6;
	const { isLocalRuntimeModel, isExplicitLocalHostnameRuntimeModel, isSelfHostedHostnameRuntimeModel } = resolveRuntimeModelLocality(params);
	const isSelfHostedRuntimeModel = isSelfHostedProviderId(params?.model?.provider) && !isCloudModelRef(params?.model?.id);
	const timeoutBounds = [runTimeoutIsBounded ? runTimeoutMs : void 0, hasExplicitRunTimeout ? void 0 : agentTimeoutMs].filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0 && value < 2147e6);
	const modelRequestTimeoutMs = params?.modelRequestTimeoutMs;
	if (typeof modelRequestTimeoutMs === "number" && Number.isFinite(modelRequestTimeoutMs) && modelRequestTimeoutMs > 0) return clampTimeoutMs(Math.min(modelRequestTimeoutMs, ...timeoutBounds));
	return clampTimeoutMs(Math.min(isLocalRuntimeModel || isExplicitLocalHostnameRuntimeModel || isSelfHostedHostnameRuntimeModel || isSelfHostedRuntimeModel ? LOCAL_LLM_FIRST_EVENT_TIMEOUT_MS : CLOUD_LLM_FIRST_EVENT_TIMEOUT_MS, ...timeoutBounds));
}
/**
* Wraps a stream function with idle timeout detection for both stream creation
* and iterator progress. Each successful `next()` resets the timer; a timeout
* aborts the provider request and surfaces the same Error to the caller.
* `scope: "creation-only"` bounds only the creation phase: local providers opt
* out of gap policing, but a request whose headers never arrive must still fail
* instead of wedging the turn until the run budget.
*
* When `runId` is provided, run-scoped tool activity can reset the active wait
* and recent activity before stream creation bridges into the first wait.
*/
function streamWithIdleTimeout(baseFn, timeoutMs, onIdleTimeout, opts) {
	const guardIterationGaps = opts?.scope !== "creation-only";
	const runId = opts?.runId;
	return (model, context, options) => {
		const createIdleTimeoutError = () => /* @__PURE__ */ new Error(`LLM idle timeout (${Math.floor(timeoutMs / 1e3)}s): no response from model`);
		const streamAbortController = new AbortController();
		const sourceSignal = options?.signal;
		const abortStream = (reason) => {
			if (!streamAbortController.signal.aborted) streamAbortController.abort(reason);
		};
		const abortFromSourceSignal = () => abortStream(sourceSignal?.reason);
		if (sourceSignal?.aborted) abortFromSourceSignal();
		else sourceSignal?.addEventListener("abort", abortFromSourceSignal, { once: true });
		const cleanupSourceSignal = () => {
			sourceSignal?.removeEventListener("abort", abortFromSourceSignal);
		};
		const withSourceAbort = (promise) => sourceSignal ? abortable(sourceSignal, promise) : promise;
		const wrappedOptions = {
			...options,
			signal: streamAbortController.signal
		};
		const createTimeoutPromise = (setTimer) => {
			return new Promise((_, reject) => {
				const timer = setTimeout(() => {
					const error = createIdleTimeoutError();
					abortStream(error);
					onIdleTimeout?.(error);
					reject(error);
				}, timeoutMs);
				timer.unref?.();
				setTimer(timer);
			});
		};
		let maybeStream;
		try {
			maybeStream = baseFn(model, context, wrappedOptions);
		} catch (error) {
			cleanupSourceSignal();
			throw error;
		}
		const wrapStream = (stream) => {
			const originalAsyncIterator = stream[Symbol.asyncIterator].bind(stream);
			stream[Symbol.asyncIterator] = function() {
				const iterator = originalAsyncIterator();
				let idleTimer = null;
				let waitingForProvider = false;
				let rejectIdleTimeout;
				let firstArmPending = true;
				let streamFirstArmDone = false;
				const clearTimer = () => {
					if (idleTimer) {
						clearTimeout(idleTimer);
						idleTimer = null;
					}
				};
				const armTimer = () => {
					clearTimer();
					if (!guardIterationGaps || !waitingForProvider) return;
					const activeToolMs = runId ? getLastToolActivityMs(runId) : 0;
					const recentActivity = activeToolMs > 0 && Date.now() - activeToolMs < timeoutMs;
					const isFirstStreamArm = firstArmPending && !streamFirstArmDone;
					const effectiveTimeout = isFirstStreamArm && recentActivity ? Math.max(1, timeoutMs - Math.max(0, Date.now() - activeToolMs)) : timeoutMs;
					firstArmPending = false;
					if (isFirstStreamArm) streamFirstArmDone = true;
					idleTimer = setTimeout(() => {
						idleTimer = null;
						const error = createIdleTimeoutError();
						abortStream(error);
						onIdleTimeout?.(error);
						rejectIdleTimeout?.(error);
					}, effectiveTimeout);
					idleTimer.unref?.();
				};
				const stopWaiting = () => {
					waitingForProvider = false;
					rejectIdleTimeout = void 0;
					clearTimer();
				};
				const unsubscribeLlmActivity = onLlmRequestActivity(streamAbortController.signal, () => {
					armTimer();
					if (runId && areDiagnosticsEnabledForProcess()) markDiagnosticRunProgress({
						runId,
						reason: "model_call:stream_progress"
					});
				});
				const unsubscribeStreamToolActivity = runId ? onToolActivity(runId, armTimer) : void 0;
				const cleanupIterator = () => {
					stopWaiting();
					unsubscribeLlmActivity();
					unsubscribeStreamToolActivity?.();
					cleanupSourceSignal();
				};
				return createStreamIteratorWrapper({
					iterator,
					next: async (streamIterator) => {
						waitingForProvider = true;
						try {
							const timeoutPromise = new Promise((_, reject) => {
								rejectIdleTimeout = reject;
								firstArmPending = true;
								armTimer();
							});
							const result = await withSourceAbort(Promise.race([streamIterator.next(), timeoutPromise]));
							if (result.done) {
								cleanupIterator();
								return result;
							}
							stopWaiting();
							return result;
						} catch (error) {
							cleanupIterator();
							throw error;
						}
					},
					onReturn(streamIterator) {
						cleanupIterator();
						return streamIterator.return?.() ?? Promise.resolve({
							done: true,
							value: void 0
						});
					},
					onThrow(streamIterator, error) {
						cleanupIterator();
						return streamIterator.throw?.(error) ?? Promise.reject(toErrorObject(error, "Non-Error rejection"));
					}
				});
			};
			return stream;
		};
		if (maybeStream && typeof maybeStream === "object" && "then" in maybeStream) {
			let streamPromiseTimer = null;
			const clearStreamPromiseTimer = () => {
				if (streamPromiseTimer) {
					clearTimeout(streamPromiseTimer);
					streamPromiseTimer = null;
				}
			};
			const timeoutPromise = createTimeoutPromise((timer) => {
				streamPromiseTimer = timer;
			});
			return withSourceAbort(Promise.race([Promise.resolve(maybeStream), timeoutPromise])).then((stream) => {
				clearStreamPromiseTimer();
				return wrapStream(stream);
			}, (error) => {
				clearStreamPromiseTimer();
				cleanupSourceSignal();
				throw error;
			});
		}
		return wrapStream(maybeStream);
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-stream.ts
function wrapStreamFnWithCompactionReplayRepair(streamFn, onRejected) {
	return (model, context, options) => {
		const replayOptions = options;
		return streamFn(model, context, {
			...options,
			onCompactionRejected: (checkpoint) => {
				onRejected(checkpoint);
				if (replayOptions?.onCompactionRejected) replayOptions.onCompactionRejected(checkpoint);
			}
		});
	};
}
function installEmbeddedAttemptStreamGuards(input) {
	const attempt = input.attempt;
	const session = input.session;
	const repairRejectedReplay = (kind, checkpoint) => {
		try {
			if (!input.sessionManager) {
				log$5.warn(`[session-recovery] unable to repair rejected ${kind} replay: session manager unavailable sessionId=${session.sessionId}`);
				return;
			}
			const repairParams = {
				sessionManager: input.sessionManager,
				sessionFile: attempt.sessionFile,
				sessionId: attempt.sessionId,
				sessionKey: attempt.sessionKey,
				agentId: input.sessionAgentId
			};
			let repair;
			if (kind === "compaction") {
				if (!checkpoint) {
					log$5.warn(`[session-recovery] unable to repair rejected compaction replay: checkpoint identity unavailable sessionId=${session.sessionId}`);
					return;
				}
				repair = repairRejectedCompactionReplayInSessionManager({
					...repairParams,
					checkpoint
				});
			} else repair = repairRejectedThinkingReplayInSessionManager(repairParams);
			if (repair.repaired) {
				input.onRejectedProviderReplayRepaired();
				return;
			}
			log$5.warn(`[session-recovery] provider rejected ${kind} replay but transcript repair made no changes: sessionId=${session.sessionId} reason=${repair.reason ?? "unknown"}`);
		} catch (error) {
			log$5.warn(`[session-recovery] unable to repair rejected ${kind} replay: sessionId=${session.sessionId} error=${String(error)}`);
		}
	};
	const cacheObservabilityEnabled = Boolean(input.cacheTrace) || log$5.isEnabled("debug");
	const promptCacheTools = cacheObservabilityEnabled ? collectPromptCacheTools(input.allCustomTools) : [];
	if (input.cacheTrace) {
		input.cacheTrace.recordStage("session:loaded", {
			messages: session.messages,
			system: input.systemPromptText,
			note: "after session create"
		});
		session.agent.streamFn = input.cacheTrace.wrapStreamFn(session.agent.streamFn);
	}
	if (input.transcriptPolicy.dropThinkingBlocks || input.transcriptPolicy.dropReasoningFromHistory) session.agent.streamFn = wrapStreamFnWithMessageTransform(session.agent.streamFn, (messages) => {
		const reasoningSanitized = input.transcriptPolicy.dropReasoningFromHistory ? dropReasoningFromHistory(messages) : messages;
		return input.transcriptPolicy.dropThinkingBlocks ? dropThinkingBlocks(reasoningSanitized) : reasoningSanitized;
	});
	if (input.transcriptPolicy.preserveSignatures || input.transcriptPolicy.dropThinkingBlocks || input.transcriptPolicy.dropReasoningFromHistory) session.agent.streamFn = wrapAnthropicStreamWithRecovery(session.agent.streamFn, {
		id: session.sessionId,
		onRecoveredAnthropicThinking: () => repairRejectedReplay("thinking")
	});
	const replayToolCallIdSanitizerDecision = {
		sanitizeToolCallIds: input.transcriptPolicy.sanitizeToolCallIds,
		toolCallIdMode: input.transcriptPolicy.toolCallIdMode,
		isOpenAIResponsesApi: input.isOpenAIResponsesApi
	};
	if (shouldApplyReplayToolCallIdSanitizer(replayToolCallIdSanitizerDecision)) {
		const mode = replayToolCallIdSanitizerDecision.toolCallIdMode;
		session.agent.streamFn = wrapStreamFnWithMessageTransform(session.agent.streamFn, (messages, model) => sanitizeReplayToolCallIdsForStream({
			messages,
			mode,
			allowedToolNames: input.replayAllowedToolNames,
			preserveNativeAnthropicToolUseIds: input.transcriptPolicy.preserveNativeAnthropicToolUseIds,
			duplicateToolCallIdStyle: input.transcriptPolicy.duplicateToolCallIdStyle,
			preserveReplaySafeThinkingToolCallIds: shouldAllowProviderOwnedThinkingReplay({
				modelApi: model?.api,
				provider: attempt.provider,
				policy: input.transcriptPolicy
			}),
			repairToolUseResultPairing: input.transcriptPolicy.repairToolUseResultPairing
		}));
	}
	if (input.isOpenAIResponsesApi) {
		session.agent.streamFn = wrapStreamFnWithCompactionReplayRepair(session.agent.streamFn, (checkpoint) => repairRejectedReplay("compaction", checkpoint));
		session.agent.streamFn = wrapStreamFnWithMessageTransform(session.agent.streamFn, (messages) => sanitizeOpenAIResponsesReplayForStream(messages));
	}
	const innerStreamFn = session.agent.streamFn;
	session.agent.streamFn = (model, context, options) => {
		const signal = input.abortSignal;
		if (input.isYieldDetected() && signal.aborted && isSessionsYieldAbortReason(signal.reason)) return createYieldAbortedResponse(model);
		return innerStreamFn(model, context, options);
	};
	session.agent.streamFn = wrapStreamFnSanitizeMalformedToolCalls(session.agent.streamFn, input.replayAllowedToolNames, input.transcriptPolicy, attempt.provider);
	session.agent.streamFn = wrapStreamFnPromoteStandaloneTextToolCalls(session.agent.streamFn, input.liveAllowedToolNames);
	session.agent.streamFn = wrapStreamFnTrimToolCallNames(session.agent.streamFn, input.liveAllowedToolNames, { unknownToolThreshold: 10 });
	if (shouldRepairMalformedToolCallArguments({
		provider: attempt.provider,
		modelApi: attempt.model.api
	})) session.agent.streamFn = wrapStreamFnRepairMalformedToolCallArguments(session.agent.streamFn);
	if (resolveToolCallArgumentsEncoding(attempt.model) === "html-entities") session.agent.streamFn = wrapStreamFnDecodeXaiToolCallArguments(session.agent.streamFn);
	if (input.providerTextTransforms?.output?.length) session.agent.streamFn = wrapStreamFnTextTransforms({
		streamFn: session.agent.streamFn,
		output: input.providerTextTransforms.output
	});
	if (input.anthropicPayloadLogger) session.agent.streamFn = input.anthropicPayloadLogger.wrapStreamFn(session.agent.streamFn);
	session.agent.streamFn = wrapStreamFnHandleSensitiveStopReason(session.agent.streamFn);
	const configuredRunTimeoutMs = resolveAgentTimeoutMs({ cfg: attempt.config });
	const resolvedRunTimeoutMs = attempt.runTimeoutOverrideMs ?? (attempt.timeoutMs !== configuredRunTimeoutMs ? attempt.timeoutMs : void 0);
	const idleTimeoutMs = resolveLlmIdleTimeoutMs({
		cfg: attempt.config,
		trigger: attempt.trigger,
		runTimeoutMs: resolvedRunTimeoutMs,
		modelRequestTimeoutMs: attempt.model.requestTimeoutMs,
		model: {
			baseUrl: attempt.model.baseUrl,
			id: attempt.modelId,
			provider: attempt.provider
		}
	});
	const firstEventTimeoutMs = resolveLlmFirstEventTimeoutMs({
		cfg: attempt.config,
		runTimeoutMs: resolvedRunTimeoutMs,
		modelRequestTimeoutMs: attempt.model.requestTimeoutMs,
		model: {
			baseUrl: attempt.model.baseUrl,
			id: attempt.modelId,
			provider: attempt.provider
		}
	});
	if (idleTimeoutMs > 0) session.agent.streamFn = streamWithIdleTimeout(session.agent.streamFn, idleTimeoutMs, (error) => input.onIdleTimeout(error), { runId: attempt.runId });
	else if (firstEventTimeoutMs > 0) session.agent.streamFn = streamWithIdleTimeout(session.agent.streamFn, firstEventTimeoutMs, (error) => input.onIdleTimeout(error), {
		runId: attempt.runId,
		scope: "creation-only"
	});
	if (firstEventTimeoutMs > 0) {
		const baseStreamFn = session.agent.streamFn;
		session.agent.streamFn = (model, context, options) => {
			const optionsWithFirstEvent = options;
			return baseStreamFn(model, context, {
				...options,
				firstEventTimeoutMs: optionsWithFirstEvent?.firstEventTimeoutMs ?? firstEventTimeoutMs,
				onFirstEventTimeout: optionsWithFirstEvent?.onFirstEventTimeout ?? input.onIdleTimeout
			});
		};
	}
	let diagnosticModelCallSeq = 0;
	session.agent.streamFn = wrapStreamFnWithDiagnosticModelCallEvents(session.agent.streamFn, {
		runId: attempt.runId,
		...attempt.sessionKey && { sessionKey: attempt.sessionKey },
		...attempt.sessionId && { sessionId: attempt.sessionId },
		provider: attempt.provider,
		model: attempt.modelId,
		api: attempt.model.api,
		transport: input.effectiveAgentTransport,
		requestTimeoutMs: idleTimeoutMs || Math.min(attempt.timeoutMs, 18e5),
		...attempt.contextWindowInfo?.tokens ? { contextTokenBudget: attempt.contextWindowInfo.tokens } : {},
		...attempt.contextWindowInfo?.source ? { contextWindowSource: attempt.contextWindowInfo.source } : {},
		...attempt.contextWindowInfo?.referenceTokens ? { contextWindowReferenceTokens: attempt.contextWindowInfo.referenceTokens } : {},
		trace: input.runTrace,
		contentCapture: resolveDiagnosticModelContentCapturePolicy(attempt.config),
		nextCallId: () => `${attempt.runId}:model:${diagnosticModelCallSeq += 1}`,
		ownerGeneration: input.diagnosticOwner.generation,
		onStarted: () => {
			attempt.onExecutionPhase?.({
				phase: "model_call_started",
				provider: attempt.provider,
				model: attempt.modelId,
				firstModelCallStarted: true
			});
		},
		suppressPluginHooks: attempt.operation === "settled-tool-finalization"
	});
	if (input.codeModeExecToolNames?.size) session.agent.streamFn = wrapStreamFnCodeModeSource(session.agent.streamFn, input.codeModeExecToolNames);
	return {
		cacheObservabilityEnabled,
		promptCacheTools
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-timeout-prepare.ts
/** Owns the execution deadline, approval pauses, and one compaction grace. */
function prepareEmbeddedAttemptTimeout(input) {
	const { activeSession, attempt, runAbortSignal } = input;
	let deadline = { kind: "unlimited" };
	let abortTimer;
	let abortWarnTimer;
	const approvalWait = observeAgentRunApprovalWait(attempt);
	const clearTimers = () => {
		deadline = { kind: "closed" };
		approvalWait.dispose();
		runAbortSignal.removeEventListener("abort", clearTimers);
		clearTimeout(abortTimer);
		clearTimeout(abortWarnTimer);
	};
	const timeout = {
		getRunAbortDeadlineAtMs: () => deadline.kind === "bounded" ? deadline.deadlineAtMs : void 0,
		clearTimers
	};
	if (runAbortSignal.aborted) {
		clearTimers();
		return timeout;
	}
	runAbortSignal.addEventListener("abort", clearTimers, { once: true });
	const scheduleAbortTimer = (delayMs, compactionGraceUsed) => {
		const armed = {
			kind: "bounded",
			deadlineAtMs: Date.now() + Math.max(1, delayMs),
			compactionGraceUsed
		};
		deadline = armed;
		abortTimer = setTimeout(() => {
			if (deadline !== armed) return;
			const compaction = {
				isCompactionPendingOrRetrying: input.compactionState.isCompacting(),
				isCompactionInFlight: activeSession.isCompacting
			};
			if (resolveRunTimeoutDuringCompaction({
				...compaction,
				graceAlreadyUsed: armed.compactionGraceUsed
			}) === "extend") {
				if (!input.isProbeSession) log$5.warn(`embedded run timeout reached during compaction; extending deadline: runId=${attempt.runId} sessionId=${attempt.sessionId} extraMs=${input.compactionTimeoutMs}`);
				scheduleAbortTimer(input.compactionTimeoutMs, true);
				return;
			}
			clearTimers();
			abortWarnTimer = setTimeout(() => {
				if (activeSession.isStreaming && !input.isProbeSession) log$5.warn(`embedded run abort still streaming: runId=${attempt.runId} sessionId=${attempt.sessionId}`);
			}, 1e4);
			if (!input.isProbeSession) log$5.warn(armed.compactionGraceUsed ? `embedded run timeout after compaction grace: runId=${attempt.runId} sessionId=${attempt.sessionId} timeoutMs=${attempt.timeoutMs} compactionGraceMs=${input.compactionTimeoutMs}` : `embedded run timeout: runId=${attempt.runId} sessionId=${attempt.sessionId} timeoutMs=${attempt.timeoutMs}`);
			if (shouldFlagCompactionTimeout({
				isTimeout: true,
				...compaction
			})) input.markTimedOutDuringCompaction();
			input.markTimedOutByRunBudget();
			input.abortRun(true);
		}, Math.max(1, delayMs));
		attempt.onAttemptDeadlineChanged?.({
			kind: "bounded",
			deadlineAtMs: armed.deadlineAtMs
		});
	};
	approvalWait.onChange = (pending) => {
		if (pending && deadline.kind === "bounded") {
			deadline = {
				kind: "paused",
				remainingMs: Math.max(1, deadline.deadlineAtMs - Date.now()),
				compactionGraceUsed: deadline.compactionGraceUsed
			};
			clearTimeout(abortTimer);
			attempt.onAttemptDeadlineChanged?.({ kind: "unlimited" });
		} else if (!pending && deadline.kind === "paused") scheduleAbortTimer(deadline.remainingMs, deadline.compactionGraceUsed);
	};
	if (attempt.timeoutMs >= 2147e6) attempt.onAttemptDeadlineChanged?.({ kind: "unlimited" });
	else scheduleAbortTimer(attempt.timeoutMs, false);
	if (!runAbortSignal.aborted) attempt.onAttemptTimeoutArmed?.();
	return timeout;
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-execution-phase.ts
/** Prepares the guarded stream runtime before prompt execution and settlement. */
async function runEmbeddedAttemptExecutionPhase(input) {
	const { attempt, state } = input;
	const { sessionRuntime, systemPrompt, toolBase, toolCatalog } = input.prepared;
	const { agentSession: { activeSession, allCustomTools, builtinToolNames, coreBuiltinToolNames, clientToolCallSlots, hasDeliveredSourceReply, hookRunner, markSourceReplyDelivered, replaySafeToolNames, replaySafeTools, codeModeExecToolNames, sideEffectToolOwners, setActiveSessionSystemPrompt, settingsManager }, anthropicPayloadLogger, cacheTrace, isOpenAIResponsesApi, sessionManager, settleTracker: { abortActiveSession, trackPromptSettlePromise }, state: sessionRuntimeState, transcriptPolicy, transport: { effectiveAgentTransport, providerTextTransforms } } = sessionRuntime;
	const { orphanRepair } = sessionRuntime.boundary;
	const { capabilityToolNames, liveAllowedToolNames, replayAllowedToolNames } = toolCatalog.toolSearchRunPlan;
	const { runtimeChannel } = systemPrompt;
	const { nestedToolActivities } = toolBase;
	const assertActive = resolveAdmittedRunActiveAssertion(attempt.admittedRunContext, input.runAbortController.signal);
	if (!assertActive) {
		input.runAbortController.signal.throwIfAborted();
		throw new Error("embedded attempt requires an active admitted run");
	}
	activeSession[agentSessionSetContextReplacementHook]((tokensAfter) => {
		toolBase.skillInstructionDeliveryCache.clear();
		attempt.onContextAccountingEvent?.({
			kind: "compaction",
			tokensAfter
		});
	}, assertActive);
	const hookAgentId = input.setup.sessionAgentId;
	let repairedRejectedProviderReplay = false;
	const diagnosticOwner = createDiagnosticEmbeddedRunOwner({
		sessionId: attempt.sessionId,
		sessionKey: attempt.sessionKey,
		runId: attempt.runId
	});
	const mergeTerminal = (incoming) => {
		state.terminal = mergeAgentRunAttemptTerminal(state.terminal, incoming);
	};
	const idleTimeoutTriggerRef = {};
	const { cacheObservabilityEnabled, promptCacheTools } = installEmbeddedAttemptStreamGuards({
		attempt,
		session: activeSession,
		sessionManager,
		sessionAgentId: input.setup.sessionAgentId,
		cacheTrace,
		allCustomTools,
		systemPromptText: sessionRuntimeState.systemPromptText,
		transcriptPolicy,
		isOpenAIResponsesApi,
		replayAllowedToolNames,
		liveAllowedToolNames,
		anthropicPayloadLogger,
		codeModeExecToolNames,
		effectiveAgentTransport,
		providerTextTransforms,
		runTrace: input.diagnostics.runTrace,
		isYieldDetected: () => input.lifecycle.readYieldState().yieldDetected,
		onRejectedProviderReplayRepaired: () => {
			repairedRejectedProviderReplay = true;
		},
		onIdleTimeout: (error) => idleTimeoutTriggerRef.current?.(error),
		abortSignal: input.runAbortController.signal,
		diagnosticOwner
	});
	input.setup.prepStages.mark("stream-setup");
	input.setup.emitPrepStageSummary("stream-ready");
	let preparedHistory;
	try {
		preparedHistory = await prepareEmbeddedAttemptHistory({
			attempt,
			activeSession,
			sessionManager,
			...input.activeContextEngine ? { activeContextEngine: input.activeContextEngine } : {},
			cacheTrace,
			capabilityToolNames,
			compactionReplayEnabled: sessionRuntime.transport.compactionReplayEnabled,
			effectiveWorkspace: input.setup.effectiveWorkspace,
			isOpenAIResponsesApi,
			isRawModelRun: input.isRawModelRun,
			...orphanRepair ? { orphanRepair } : {},
			replayAllowedToolNames,
			sandboxed: input.setup.sandbox?.enabled === true,
			sessionAgentId: input.setup.sessionAgentId,
			settingsManager,
			systemPromptText: sessionRuntimeState.systemPromptText,
			transcriptPolicy,
			setActiveSessionSystemPrompt
		});
	} catch (error) {
		await flushPendingToolResultsAfterIdle({
			agent: activeSession.agent,
			sessionManager,
			...attempt.abortSignal?.aborted ? { timeoutMs: 0 } : {}
		});
		activeSession.dispose();
		throw error;
	}
	const isProbeSession = attempt.sessionId?.startsWith("probe-") ?? false;
	const queueHandleRef = {};
	const abortRun = createEmbeddedAttemptRunAbort({
		abortActiveSession,
		activeSession,
		attempt,
		getQueueHandle: () => queueHandleRef.current,
		isProbeSession,
		log: log$5,
		runAbortController: input.runAbortController,
		state: input.abortState
	});
	input.externalAbortController.setRunAbort(abortRun);
	idleTimeoutTriggerRef.current = (error) => {
		if (input.runAbortController.signal.aborted) return;
		mergeTerminal({
			kind: "timeout",
			phase: activeSession.isCompacting ? "compaction" : "prompt",
			source: "idle"
		});
		abortRun(true, error);
	};
	const abortable$1 = (promise) => abortable(input.runAbortController.signal, promise);
	const promptActiveSession = async (prompt, options) => {
		if (activeSession[Symbol.for("openclaw.gptLive.projectionReadiness")] === true) {
			const assertProjectionOwner = () => {
				input.runAbortController.signal.throwIfAborted();
				assertActive();
				const queueHandle = queueHandleRef.current;
				if (!queueHandle || ACTIVE_EMBEDDED_RUNS_BY_RUN_ID.get(attempt.runId) !== queueHandle || queueHandle.isStopped()) throw new Error("Native voice projection wait owner is no longer active");
			};
			assertProjectionOwner();
			const target = sessionManager.getSessionTarget();
			if (!target || target.sessionId !== attempt.sessionId) throw new Error("Native voice projection wait requires the admitted session target");
			const { waitForSessionTranscriptProjection } = await import("./session-transcript-reconcile-DFsDtc9l.js");
			assertProjectionOwner();
			// Do not hold a transcript write context while the native writer rebuilds.
			await waitForSessionTranscriptProjection(target, input.runAbortController.signal, { assertActive: assertProjectionOwner });
			assertProjectionOwner();
		}
		return withOwnedSessionTranscriptWrites(input.sessionLock.ownedTranscriptWriteContext, async () => {
			if (input.runAbortController.signal.aborted) return abortable$1(Promise.resolve());
			ocPromptMark(attempt, "pp:session-prompt");
			return abortable$1(trackPromptSettlePromise(activeSession.prompt(prompt, options)));
		});
	};
	const onBlockReply = attempt.onBlockReply ? bindOwnedSessionTranscriptWrites(input.sessionLock.ownedTranscriptWriteContext, attempt.onBlockReply) : void 0;
	const onBlockReplyFlush = attempt.onBlockReplyFlush ? bindOwnedSessionTranscriptWrites(input.sessionLock.ownedTranscriptWriteContext, attempt.onBlockReplyFlush) : void 0;
	const preparedStream = prepareEmbeddedAttemptStream({
		attempt,
		applyPermissionMode: input.lifecycle.applyPermissionMode,
		activeSession,
		runAbortController: input.runAbortController,
		abortRun,
		markExternalAbort: () => mergeTerminal({
			kind: "aborted",
			source: "external"
		}),
		getRunState: () => {
			const terminal = projectAgentRunAttemptTerminal(state.terminal);
			return {
				aborted: terminal.aborted,
				promptError: terminal.promptError,
				timedOut: terminal.timedOut,
				yieldDetected: input.lifecycle.readYieldState().yieldDetected
			};
		},
		onBlockReply,
		onBlockReplyFlush,
		runtimeChannel,
		hookRunner,
		hookAgentId,
		diagnosticTrace: input.diagnostics.diagnosticTrace,
		clientToolCallSlots,
		nestedToolActivities,
		isReplaySafeTool: (tool) => replaySafeTools.has(tool),
		hasDeliveredSourceReply,
		markSourceReplyDelivered,
		sandboxSessionKey: input.setup.sandboxSessionKey,
		builtinToolNames,
		coreBuiltinToolNames,
		replaySafeToolNames,
		codeModeExecToolNames,
		sideEffectToolOwners,
		diagnosticOwner,
		trajectoryRecorder: sessionRuntime.trajectoryRecorder
	});
	state.deferredLifecycleOwner = preparedStream.deferredLifecycleOwner;
	input.lifecycle.setToolSearchCatalogExecutor(preparedStream.toolSearchCatalogExecutor);
	input.externalAbortController.setCompactionState({
		isPendingOrRetrying: preparedStream.subscription.isCompacting,
		isInFlight: () => activeSession.isCompacting
	});
	queueHandleRef.current = preparedStream.queueHandle;
	const attemptTimeout = prepareEmbeddedAttemptTimeout({
		attempt,
		activeSession,
		runAbortSignal: input.runAbortController.signal,
		compactionState: preparedStream.subscription,
		compactionTimeoutMs: input.sessionLock.compactionTimeoutMs,
		isProbeSession,
		abortRun,
		markTimedOutDuringCompaction: () => mergeTerminal({
			kind: "timeout",
			phase: "compaction",
			source: "observation"
		}),
		markTimedOutByRunBudget: () => mergeTerminal({
			kind: "timeout",
			phase: "prompt",
			source: "run_budget"
		})
	});
	ocPromptMark(attempt, "pp:timeout-armed");
	const preparedStreamRuntime = {
		abortable: abortable$1,
		cache: {
			observabilityEnabled: cacheObservabilityEnabled,
			promptTools: promptCacheTools
		},
		history: preparedHistory,
		isProbeSession,
		onBlockReplyFlush,
		promptActiveSession,
		stream: preparedStream,
		timeout: attemptTimeout
	};
	return await runEmbeddedAttemptSettledPhase({
		...input,
		preparedStreamRuntime,
		getRepairedRejectedProviderReplay: () => repairedRejectedProviderReplay
	});
}
//#endregion
//#region src/agents/embedded-agent-runner/run/preparation-timing.ts
function timingOptions(stage, options) {
	return {
		config: options.config,
		env: options.env,
		phase: "agent.prepare",
		attributes: { stage }
	};
}
/** Measures async pre-provider work under the canonical agent preparation span. */
function measureEmbeddedAgentPreparation(stage, run, options = {}) {
	return measureDiagnosticsTimelineSpan("agent.prepare", run, timingOptions(stage, options));
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-preparation.ts
let nextPreparationStart = Promise.resolve();
/** Dispatches attempt stages without letting concurrent starts monopolize the event loop. */
function createEmbeddedAttemptPreparation(options) {
	return async (stage, run) => {
		const start = nextPreparationStart.then(() => setImmediate$1());
		nextPreparationStart = start;
		await start;
		options.assertCurrent();
		return measureEmbeddedAgentPreparation(stage, run, { config: options.config });
	};
}
//#endregion
//#region src/agents/agent-project-settings-snapshot.ts
/** Builds embedded-agent settings snapshots from global, bundle, and project settings. */
const log$2 = createSubsystemLogger("embedded-agent-settings");
const DEFAULT_EMBEDDED_AGENT_PROJECT_SETTINGS_POLICY = "sanitize";
const SANITIZED_PROJECT_AGENT_KEYS = ["shellPath", "shellCommandPrefix"];
function sanitizeAgentSettingsSnapshot(settings) {
	const sanitized = { ...settings };
	for (const key of SANITIZED_PROJECT_AGENT_KEYS) delete sanitized[key];
	return sanitized;
}
function loadBundleSettingsFile(params) {
	const absolutePath = path.join(params.rootDir, params.relativePath);
	const result = readBundleJsonObject({
		rootDir: params.rootDir,
		relativePath: params.relativePath,
		onOpenFailure: () => ({
			ok: false,
			error: "skipping unsafe bundle settings file"
		})
	});
	if (!result.ok) {
		log$2.warn(`${result.error}: ${absolutePath}`);
		return null;
	}
	return sanitizeAgentSettingsSnapshot(result.raw);
}
/**
* Load and merge settings contributed by enabled bundle plugins for one
* embedded-agent workspace.
*/
function loadEnabledBundleAgentSettingsSnapshot(params) {
	const workspaceDir = params.cwd.trim();
	if (!workspaceDir) return {};
	const config = params.cfg ?? {};
	const env = params.env ?? process.env;
	const metadataSnapshot = params.pluginMetadataSnapshot ?? loadPluginMetadataSnapshot({
		workspaceDir,
		config,
		env
	});
	return withPluginCache(getPluginMetadataSnapshotCache(metadataSnapshot), () => {
		const registry = metadataSnapshot.manifestRegistry;
		if (registry.plugins.length === 0) return {};
		const normalizedPlugins = normalizePluginsConfigWithResolver(config.plugins, metadataSnapshot.normalizePluginId);
		let snapshot = {};
		for (const record of registry.plugins) {
			const settingsFiles = record.settingsFiles ?? [];
			if (record.format !== "bundle" || settingsFiles.length === 0) continue;
			if (!resolvePolicyPluginActivationState({
				id: record.id,
				origin: record.origin,
				channelIds: record.channels,
				config: normalizedPlugins,
				rootConfig: config
			}).activated) continue;
			for (const relativePath of settingsFiles) {
				const bundleSettings = loadBundleSettingsFile({
					rootDir: record.rootDir,
					relativePath
				});
				if (!bundleSettings) continue;
				snapshot = applyMergePatch(snapshot, bundleSettings);
			}
		}
		const embeddedAgentMcp = loadEmbeddedAgentMcpConfig({
			workspaceDir,
			cfg: config,
			manifestRegistry: metadataSnapshot.manifestRegistry
		});
		for (const diagnostic of embeddedAgentMcp.diagnostics) log$2.warn(`bundle MCP skipped for ${diagnostic.pluginId}: ${diagnostic.message}`);
		if (Object.keys(embeddedAgentMcp.mcpServers).length > 0) snapshot = applyMergePatch(snapshot, { mcpServers: embeddedAgentMcp.mcpServers });
		return snapshot;
	});
}
/** Resolves the configured project-settings trust policy for embedded agents. */
function resolveEmbeddedAgentProjectSettingsPolicy(cfg) {
	const raw = cfg?.agents?.defaults?.embeddedAgent?.projectSettingsPolicy;
	if (raw === "trusted" || raw === "sanitize" || raw === "ignore") return raw;
	return DEFAULT_EMBEDDED_AGENT_PROJECT_SETTINGS_POLICY;
}
/** Merges global, plugin, and project settings according to the selected trust policy. */
function buildEmbeddedAgentSettingsSnapshot(params) {
	const effectiveProjectSettings = params.policy === "ignore" ? {} : params.policy === "sanitize" ? sanitizeAgentSettingsSnapshot(params.projectSettings) : params.projectSettings;
	const withPluginSettings = applyMergePatch(params.globalSettings, sanitizeAgentSettingsSnapshot(params.pluginSettings ?? {}));
	return applyMergePatch(withPluginSettings, effectiveProjectSettings);
}
//#endregion
//#region src/agents/agent-project-settings.ts
/** Creates the runtime SettingsManager with project/plugin settings and compaction overrides. */
function createPreparedEmbeddedAgentSettingsManager(params) {
	const fileSettingsManager = SettingsManager.create(params.cwd, params.agentDir);
	const settingsManager = SettingsManager.inMemory(buildEmbeddedAgentSettingsSnapshot({
		globalSettings: fileSettingsManager.getGlobalSettings(),
		pluginSettings: loadEnabledBundleAgentSettingsSnapshot(params),
		projectSettings: fileSettingsManager.getProjectSettings(),
		policy: resolveEmbeddedAgentProjectSettingsPolicy(params.cfg)
	}));
	applyAgentCompactionSettingsFromConfig({
		settingsManager,
		cfg: params.cfg,
		contextTokenBudget: params.contextTokenBudget
	});
	settingsManager.setRetryEnabled(false);
	return settingsManager;
}
//#endregion
//#region src/agents/agent-hooks/compaction-safeguard-runtime.ts
const registry = createSessionManagerRuntimeRegistry();
const setCompactionSafeguardRuntime = registry.set;
const getCompactionSafeguardRuntime = registry.get;
/** Records cancellation atomically; intentional declines carry no provider error. */
function setCompactionSafeguardCancellation(sessionManager, reason, error) {
	const current = getCompactionSafeguardRuntime(sessionManager);
	const trimmed = reason?.trim();
	if (!current && !trimmed) return;
	const next = { ...current };
	if (trimmed) next.cancellation = {
		reason: trimmed,
		...error !== void 0 ? { error } : {}
	};
	else delete next.cancellation;
	setCompactionSafeguardRuntime(sessionManager, Object.keys(next).length > 0 ? next : null);
}
/** Consumes this attempt's cancellation without clearing session configuration. */
function consumeCompactionSafeguardCancellation(sessionManager) {
	const cancellation = getCompactionSafeguardRuntime(sessionManager)?.cancellation;
	if (cancellation) setCompactionSafeguardCancellation(sessionManager, void 0);
	return cancellation ?? null;
}
//#endregion
//#region src/auto-reply/reply/post-compaction-context.ts
const log$1 = createSubsystemLogger("post-compaction-context");
const MAX_CONTEXT_CHARS = 1800;
const DEFAULT_POST_COMPACTION_SECTIONS = ["Session Startup", "Red Lines"];
const LEGACY_POST_COMPACTION_SECTIONS = ["Every Session", "Safety"];
function matchesSectionSet(sectionNames, expectedSections) {
	if (sectionNames.length !== expectedSections.length) return false;
	const counts = /* @__PURE__ */ new Map();
	for (const name of expectedSections) {
		const normalized = normalizeLowercaseStringOrEmpty(name);
		counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
	}
	for (const name of sectionNames) {
		const normalized = normalizeLowercaseStringOrEmpty(name);
		const count = counts.get(normalized);
		if (!count) return false;
		if (count === 1) counts.delete(normalized);
		else counts.set(normalized, count - 1);
	}
	return counts.size === 0;
}
async function readPostCompactionContext(workspaceDir, options) {
	const cfg = options?.cfg;
	const agentId = options?.agentId;
	const effectiveNowMs = options?.nowMs;
	const configuredSections = cfg?.agents?.defaults?.compaction?.postCompactionSections;
	if (!Array.isArray(configuredSections) || configuredSections.length === 0) return null;
	const agentsPath = path.join(workspaceDir, "AGENTS.md");
	try {
		const opened = await openRootFile({
			absolutePath: agentsPath,
			rootPath: workspaceDir,
			boundaryLabel: "workspace root"
		});
		if (!opened.ok) return null;
		let content;
		try {
			content = await readWorkspaceBootstrapFile(opened.fd);
		} catch (err) {
			if (err instanceof RangeError) {
				log$1.warn(`Ignoring oversized AGENTS.md ${agentsPath}: file exceeds the ${MAX_WORKSPACE_BOOTSTRAP_FILE_BYTES}-byte limit`);
				return null;
			}
			throw err;
		} finally {
			fs.closeSync(opened.fd);
		}
		const sectionNames = configuredSections;
		const foundSectionNames = [];
		let sections = extractSections(content, sectionNames, foundSectionNames);
		const isDefaultSections = matchesSectionSet(configuredSections, DEFAULT_POST_COMPACTION_SECTIONS);
		if (sections.length === 0 && isDefaultSections) sections = extractSections(content, LEGACY_POST_COMPACTION_SECTIONS, foundSectionNames);
		if (sections.length === 0) return null;
		const displayNames = foundSectionNames.length > 0 ? foundSectionNames : sectionNames;
		const resolvedNowMs = effectiveNowMs ?? Date.now();
		const timezone = resolveUserTimezone(cfg?.agents?.defaults?.userTimezone);
		const dateStamp = formatDateStamp(resolvedNowMs, timezone);
		const maxContextChars = resolveAgentContextLimits(cfg, agentId)?.postCompactionMaxChars ?? MAX_CONTEXT_CHARS;
		const { timeLine } = resolveCronStyleNow(cfg ?? {}, resolvedNowMs);
		const combined = sections.join("\n\n").replaceAll("YYYY-MM-DD", dateStamp);
		const safeContent = combined.length > maxContextChars ? truncateUtf16Safe(combined, maxContextChars) + "\n...[truncated]..." : combined;
		return `[Post-compaction context refresh]

${isDefaultSections ? "Session was just compacted. The conversation summary above is a hint, NOT a substitute for your startup sequence. Run your Session Startup sequence - read the required files before responding to the user." : `Session was just compacted. The conversation summary above is a hint, NOT a substitute for your full startup sequence. Re-read the sections injected below (${displayNames.join(", ")}) and follow your configured startup procedure before responding to the user.`}\n\n${isDefaultSections ? "Critical rules from AGENTS.md:" : `Injected sections from AGENTS.md (${displayNames.join(", ")}):`}\n\n${safeContent}\n\n${timeLine}`;
	} catch {
		return null;
	}
}
/**
* Extract named sections from markdown content.
* Matches H2 (##) or H3 (###) headings case-insensitively.
* Skips content inside fenced code blocks.
* Captures until the next heading of same or higher level, or end of string.
*/
function extractSections(content, sectionNames, foundNames) {
	const results = [];
	const lines = content.split("\n");
	for (const name of sectionNames) {
		let sectionLines = [];
		let inSection = false;
		let sectionLevel = 0;
		let inCodeBlock = false;
		for (const line of lines) {
			if (line.trimStart().startsWith("```")) {
				inCodeBlock = !inCodeBlock;
				if (inSection) sectionLines.push(line);
				continue;
			}
			if (inCodeBlock) {
				if (inSection) sectionLines.push(line);
				continue;
			}
			const headingMatch = line.match(/^(#{2,3})\s+(.+?)\s*$/);
			if (headingMatch) {
				const level = expectDefined(headingMatch[1], "heading match capture group 1").length;
				const headingText = headingMatch[2];
				if (!inSection) {
					if (normalizeLowercaseStringOrEmpty(headingText) === normalizeLowercaseStringOrEmpty(name)) {
						inSection = true;
						sectionLevel = level;
						sectionLines = [line];
						continue;
					}
				} else {
					if (level <= sectionLevel) break;
					sectionLines.push(line);
					continue;
				}
			}
			if (inSection) sectionLines.push(line);
		}
		if (sectionLines.length > 0) {
			results.push(sectionLines.join("\n").trim());
			foundNames?.push(name);
		}
	}
	return results;
}
//#endregion
//#region src/plugins/compaction-provider.ts
function getCompactionProvider(id) {
	return requireActivePluginRegistry().compactionProviders.find((entry) => entry.provider.id === id)?.provider;
}
//#endregion
//#region src/agents/compaction-real-conversation.ts
/**
* Classifies transcript messages that contain real user-visible conversation
* for compaction and history pruning.
*/
const TOOL_RESULT_REAL_CONVERSATION_LOOKBACK = 20;
const NON_CONVERSATION_BLOCK_TYPES = /* @__PURE__ */ new Set([
	"toolCall",
	"toolUse",
	"functionCall",
	"thinking",
	"reasoning"
]);
function hasMeaningfulText(text) {
	const trimmed = text.trim();
	if (!trimmed || isSilentReplyText(trimmed)) return false;
	const heartbeat = stripHeartbeatToken(trimmed, { mode: "message" });
	return !heartbeat.didStrip || heartbeat.text.trim().length > 0;
}
function isSummaryRole(role) {
	return role === "branchSummary" || role === "compactionSummary";
}
/** Returns whether a message has content worth preserving as conversation. */
function hasMeaningfulConversationContent(message) {
	if ("excludeFromContext" in message && message.excludeFromContext === true) return false;
	if (message.role === "custom") {
		const custom = message;
		return custom.display !== false && hasMeaningfulMessageContent(custom.content);
	}
	if (message.role === "bashExecution") {
		const bash = message;
		return hasMeaningfulText(`${typeof bash.command === "string" ? bash.command : ""}\n${typeof bash.output === "string" ? bash.output : ""}`);
	}
	if (isSummaryRole(message.role)) {
		const summary = message.summary;
		return typeof summary === "string" && hasMeaningfulText(summary);
	}
	const content = message.content;
	return hasMeaningfulMessageContent(content);
}
function hasMeaningfulMessageContent(content) {
	if (typeof content === "string") return hasMeaningfulText(content);
	if (!Array.isArray(content)) return false;
	let sawMeaningfulNonTextBlock = false;
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		const { type, text } = block;
		if (type === "text") {
			if (typeof text === "string" && hasMeaningfulText(text)) return true;
		} else if (typeof type !== "string" || !NON_CONVERSATION_BLOCK_TYPES.has(type)) sawMeaningfulNonTextBlock = true;
	}
	return sawMeaningfulNonTextBlock;
}
function isToolResultConversationAnchor(message) {
	const role = message.role;
	return (role === "user" || role === "custom" || role === "bashExecution" || isSummaryRole(role)) && hasMeaningfulConversationContent(message);
}
/** Returns whether a transcript message should count as real conversation. */
function isRealConversationMessage(message, messages, index) {
	if (message.role === "user" || message.role === "assistant" || message.role === "custom" || message.role === "bashExecution" || isSummaryRole(message.role)) return hasMeaningfulConversationContent(message);
	if (message.role !== "toolResult") return false;
	const start = Math.max(0, index - TOOL_RESULT_REAL_CONVERSATION_LOOKBACK);
	for (let i = index - 1; i >= start; i -= 1) {
		const candidate = messages[i];
		if (candidate && isToolResultConversationAnchor(candidate)) return true;
	}
	return false;
}
//#endregion
//#region src/agents/agent-hooks/compaction-safeguard-quality.ts
/** Quality contract, fallback, and audit helpers for compaction safeguard summaries. */
const MAX_EXTRACTED_IDENTIFIERS = 12;
const MAX_UNTRUSTED_INSTRUCTION_CHARS = 4e3;
const MAX_ASK_OVERLAP_TOKENS = 12;
const MIN_ASK_OVERLAP_TOKENS_FOR_DOUBLE_MATCH = 3;
const REQUIRED_SUMMARY_SECTIONS = [
	"## Decisions",
	"## Open TODOs",
	"## Constraints/Rules",
	"## Pending user asks",
	"## Exact identifiers"
];
const QUALITY_PROTECTED_SECTION_START = 3;
const PENDING_ASK_SECTION_INDEX = 3;
const EXACT_IDENTIFIERS_SECTION_INDEX = 4;
const MAX_PROTECTED_SECTION_CONTENT_SHARE = .25;
const LATEST_USER_REQUEST_CONTEXT_LABEL = "Latest user request context:";
const STRICT_EXACT_IDENTIFIERS_INSTRUCTION = "For ## Exact identifiers, preserve literal values exactly as seen (IDs, URLs, file paths, ports, hashes, dates, times).";
const POLICY_OFF_EXACT_IDENTIFIERS_INSTRUCTION = "For ## Exact identifiers, include identifiers only when needed for continuity; do not enforce literal-preservation rules.";
/** Demotes canonical headings when a summary is embedded as supporting context. */
function nestRequiredSummaryHeadings(text) {
	return text.replace(/^##[ \t]+\S.*$/gmu, (heading) => REQUIRED_SUMMARY_SECTIONS.some((required) => required === heading.trim()) ? heading.replace("##", "###") : heading);
}
/** Wraps operator-provided compaction instruction text as untrusted prompt data. */
function wrapUntrustedInstructionBlock(label, text) {
	return wrapUntrustedPromptDataBlock({
		label,
		text,
		maxChars: MAX_UNTRUSTED_INSTRUCTION_CHARS
	});
}
function resolveExactIdentifierSectionInstruction(summarizationInstructions) {
	const policy = summarizationInstructions?.identifierPolicy ?? "strict";
	if (policy === "off") return POLICY_OFF_EXACT_IDENTIFIERS_INSTRUCTION;
	const custom = policy === "custom" ? summarizationInstructions?.identifierInstructions?.trim() : void 0;
	if (custom) return wrapUntrustedInstructionBlock("For ## Exact identifiers, apply this operator-defined policy text", custom) || STRICT_EXACT_IDENTIFIERS_INSTRUCTION;
	return STRICT_EXACT_IDENTIFIERS_INSTRUCTION;
}
/** Build the required structured summary instructions for compaction. */
function buildCompactionStructureInstructions(customInstructions, summarizationInstructions, latestUnresolvedUserRequest) {
	const identifierSectionInstruction = resolveExactIdentifierSectionInstruction(summarizationInstructions);
	const sectionsTemplate = [
		"Produce a compact, factual summary with these exact section headings:",
		...REQUIRED_SUMMARY_SECTIONS,
		identifierSectionInstruction,
		"Do not omit unresolved asks from the user.",
		"Record completed requests outside ## Pending user asks; list only unresolved user requests there.",
		"When prior compaction summaries are present, re-distill them with new messages and remove stale duplicate detail."
	].join("\n");
	const latestRequestBlock = latestUnresolvedUserRequest ? wrapUntrustedInstructionBlock("Latest unresolved user request", latestUnresolvedUserRequest) : "";
	const latestRequestInstruction = latestRequestBlock ? [
		"Make the exact request below the first item in ## Pending user asks.",
		"Its run owner will resume it after compaction, so summary prose cannot mark it complete.",
		latestRequestBlock
	].join("\n") : "";
	const custom = customInstructions?.trim();
	return [
		sectionsTemplate,
		latestRequestInstruction,
		custom && wrapUntrustedInstructionBlock("Additional context from /compact", custom)
	].filter(Boolean).join("\n\n");
}
function normalizedSummaryLines(summary) {
	return summary.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
}
function hasRequiredSummarySections(summary) {
	const lines = normalizedSummaryLines(summary);
	let cursor = 0;
	for (const heading of REQUIRED_SUMMARY_SECTIONS) {
		const index = lines.findIndex((line, lineIndex) => lineIndex >= cursor && line === heading);
		if (index < 0) return false;
		cursor = index + 1;
	}
	return true;
}
function parseRequiredSummarySectionContents(summary) {
	const contents = REQUIRED_SUMMARY_SECTIONS.map(() => new Array());
	const preamble = [];
	let sectionIndex = -1;
	for (const line of summary.split(/\r?\n/u)) {
		const nextHeading = REQUIRED_SUMMARY_SECTIONS[sectionIndex + 1];
		if (nextHeading && line.trim() === nextHeading) {
			sectionIndex += 1;
			continue;
		}
		(sectionIndex < 0 ? preamble : contents[sectionIndex])?.push(line);
	}
	if (sectionIndex !== REQUIRED_SUMMARY_SECTIONS.length - 1) return null;
	contents[0]?.unshift(...preamble);
	return contents.map((lines) => lines.join("\n").trim());
}
function extractPendingAskSection(summary) {
	return summary.split(/^## Pending user asks[ \t]*$/mu, 2)[1]?.split(/^##[ \t]+\S.*$/mu, 1)[0]?.trim() ?? "";
}
function formatLatestUserRequestContext(request) {
	return `${LATEST_USER_REQUEST_CONTEXT_LABEL} ${JSON.stringify(request)}`;
}
function extractLeadingPendingAsk(summary) {
	return normalizedSummaryLines(extractPendingAskSection(summary))[0] ?? "";
}
function isEmptyPendingAsk(value) {
	return /^(?:none|none captured|no pending asks)[.!]?$/iu.test(value);
}
/**
* Plan truncation that keeps the audit facts and lets everything else shrink.
* Only the headings, the bounded latest-ask context, and the audited source
* identifiers are untrimmable. Model-written section text — including the
* "## Exact identifiers" list — is optional content; protecting it verbatim let
* a re-distilled identifier dump grow past the whole artifact budget while the
* real sections were starved to empty headings.
*/
function createSummaryQualityRetentionPlan(summary, truncatedMarker, params) {
	const requiredAskContext = params.requiredAskContext?.trim() ?? "";
	const latestUnresolvedUserRequest = params.latestUnresolvedUserRequest?.trim() ?? "";
	const bodyHasLatestAsk = hasAskOverlap(params.auditSummary ?? summary, params.latestAsk);
	const requiredContextBlock = !latestUnresolvedUserRequest && (bodyHasLatestAsk || params.latestAskInRetainedTurn) && requiredAskContext ? `## Latest user request context\n${JSON.stringify(requiredAskContext)}` : "";
	const parsedSummary = requiredContextBlock && summary.startsWith(`${requiredContextBlock}\n\n`) ? summary.slice(requiredContextBlock.length + 2) : summary;
	const contents = parseRequiredSummarySectionContents(parsedSummary);
	if (!contents) return null;
	const auditedIdentifiers = (params.identifierPolicy ?? "strict") === "strict" ? params.identifiers : [];
	const marker = truncatedMarker.trim();
	const pendingAsk = contents[PENDING_ASK_SECTION_INDEX] ?? "";
	const protectedAskContext = latestUnresolvedUserRequest ? formatLatestUserRequestContext(latestUnresolvedUserRequest) : !params.latestAskInRetainedTurn && requiredAskContext && (!bodyHasLatestAsk || hasAskOverlap(pendingAsk, params.latestAsk) && !pendingAsk.includes(requiredAskContext)) ? `${LATEST_USER_REQUEST_CONTEXT_LABEL}\n${JSON.stringify(requiredAskContext)}` : "";
	const protectedTails = REQUIRED_SUMMARY_SECTIONS.map((_, index) => index === PENDING_ASK_SECTION_INDEX ? protectedAskContext : index === EXACT_IDENTIFIERS_SECTION_INDEX ? auditedIdentifiers.join("\n") : "");
	const bodyHasIdentifiers = auditedIdentifiers.every((identifier) => summaryIncludesIdentifier(summary, identifier));
	const bodyHasRequiredAskContext = latestUnresolvedUserRequest ? extractLeadingPendingAsk(parsedSummary) === protectedAskContext : !requiredAskContext ? true : requiredContextBlock ? summary.startsWith(requiredContextBlock) : contents[PENDING_ASK_SECTION_INDEX]?.includes(protectedAskContext);
	const renderSections = (sectionContents) => REQUIRED_SUMMARY_SECTIONS.map((heading, index) => {
		const content = sectionContents[index];
		return content ? `${heading}\n${content}` : heading;
	});
	const joinSectionContent = (index, optional) => {
		const tail = protectedTails[index] ?? "";
		if (!tail) return optional;
		if (index === PENDING_ASK_SECTION_INDEX) {
			const leading = normalizedSummaryLines(optional)[0] ?? "";
			if (leading === tail) return optional;
			if (latestUnresolvedUserRequest) return [tail, isEmptyPendingAsk(leading) ? "" : optional].filter(Boolean).join("\n");
		}
		if (index === EXACT_IDENTIFIERS_SECTION_INDEX) return [optional, ...auditedIdentifiers.filter((identifier) => !summaryIncludesIdentifier(optional, identifier))].filter(Boolean).join("\n");
		return [index === PENDING_ASK_SECTION_INDEX && protectedAskContext && isEmptyPendingAsk(optional) ? "" : optional, tail].filter(Boolean).join("\n");
	};
	const minimumBlocks = REQUIRED_SUMMARY_SECTIONS.map((heading, index) => `${heading}\n\n${protectedTails[index] ?? ""}`);
	const minimumSummary = [
		...requiredContextBlock ? [requiredContextBlock] : [],
		...minimumBlocks.slice(0, QUALITY_PROTECTED_SECTION_START),
		marker,
		...minimumBlocks.slice(QUALITY_PROTECTED_SECTION_START)
	].join("\n\n");
	const protectedCapFor = (maxChars) => Math.floor(Math.max(0, maxChars - minimumSummary.length) * MAX_PROTECTED_SECTION_CONTENT_SHARE);
	const protectedWithinCap = (maxChars) => contents.slice(QUALITY_PROTECTED_SECTION_START).every((content) => content.length <= protectedCapFor(maxChars));
	return {
		minimumChars: minimumSummary.length,
		needsRebuild: (maxChars) => !latestUnresolvedUserRequest && !bodyHasLatestAsk || !bodyHasRequiredAskContext || !bodyHasIdentifiers || !protectedWithinCap(maxChars),
		render(maxChars) {
			if (summary.length <= maxChars && bodyHasRequiredAskContext && bodyHasIdentifiers && protectedWithinCap(maxChars)) return {
				text: summary,
				trimmed: false
			};
			if (maxChars < minimumSummary.length) return null;
			const contentBudget = maxChars - minimumSummary.length;
			const protectedCap = protectedCapFor(maxChars);
			const allocations = contents.map((content, index) => index >= QUALITY_PROTECTED_SECTION_START ? Math.min(content.length, protectedCap) : 0);
			const optionalBudget = Math.max(0, contentBudget - allocations.reduce((total, chars) => total + chars, 0));
			const optionalContents = contents.slice(0, QUALITY_PROTECTED_SECTION_START);
			const optionalTotal = optionalContents.reduce((total, content) => total + content.length, 0);
			for (const [index, content] of optionalContents.entries()) allocations[index] = optionalTotal > 0 ? Math.floor(optionalBudget * content.length / optionalTotal) : 0;
			let remainder = optionalBudget - allocations.slice(0, QUALITY_PROTECTED_SECTION_START).reduce((total, chars) => total + chars, 0);
			for (const [index, content] of optionalContents.entries()) {
				const allocation = allocations[index] ?? 0;
				const extra = Math.min(remainder, Math.max(0, content.length - allocation));
				allocations[index] = allocation + extra;
				remainder -= extra;
			}
			const trimmed = contents.some((content, index) => content.length > (allocations[index] ?? 0));
			const sectionContents = contents.map((content, index) => joinSectionContent(index, truncateUtf16Safe(content, allocations[index] ?? 0)));
			const blocks = renderSections(sectionContents);
			return {
				text: [
					...requiredContextBlock ? [requiredContextBlock] : [],
					...blocks.slice(0, QUALITY_PROTECTED_SECTION_START),
					...trimmed ? [marker] : [],
					...blocks.slice(QUALITY_PROTECTED_SECTION_START)
				].join("\n\n"),
				trimmed
			};
		}
	};
}
/** Return a structured fallback summary when model output is missing/invalid. */
function buildStructuredFallbackSummary(previousSummary) {
	const trimmedPreviousSummary = previousSummary?.trim() ?? "";
	if (trimmedPreviousSummary && hasRequiredSummarySections(trimmedPreviousSummary)) return trimmedPreviousSummary;
	const values = [
		trimmedPreviousSummary || "No prior history.",
		"None.",
		"None.",
		"None.",
		"None captured."
	];
	return REQUIRED_SUMMARY_SECTIONS.map((heading, index) => `${heading}\n${values[index]}`).join("\n\n");
}
/** Appends a bounded post-compaction section to an existing summary. */
function appendSummarySection(summary, section) {
	if (!section) return summary;
	if (!summary.trim()) return section.trimStart();
	return `${summary}${section}`;
}
function sanitizeExtractedIdentifier(value) {
	return value.trim().replace(/^[("'`[{<]+/, "").replace(/[)\]"'`,;:.!?<>]+$/, "");
}
function isPureHexIdentifier(value) {
	return /^[A-Fa-f0-9]{8,}$/.test(value);
}
function normalizeOpaqueIdentifier(value) {
	return isPureHexIdentifier(value) ? value.toUpperCase() : value;
}
function summaryIncludesIdentifier(summary, identifier) {
	if (isPureHexIdentifier(identifier)) return summary.toUpperCase().includes(identifier.toUpperCase());
	return summary.includes(identifier);
}
/** Extracts likely exact identifiers that summaries should preserve literally. */
function extractOpaqueIdentifiers(text) {
	return uniqueStrings(Array.from(text.matchAll(/(https?:\/\/\S+|(?<![A-Za-z0-9._-])\/[\w.-]{2,}(?:\/[\w.-]+)+|[A-Za-z]:\\[\w\\.-]+|(?<![A-Za-z0-9._-])[A-Za-z0-9._-]+\.[A-Za-z0-9._/-]+:\d{1,5})|(?:(?:(?:\d+\.\d+|\.\d+)(?:[eE][+-]?\d+)?|\d+\.[eE][+-]?\d+|\d+\.?[eE][+-]\d+|(?![A-Fa-f0-9]{8,}(?![A-Fa-f0-9]))\d+\.?[eE]\d+)(?:(?=[A-Za-z]+(?![A-Za-z0-9]))(?=[A-Za-z]*[G-Zg-z])[A-Za-z]+)?(?![A-Za-z0-9])|(?<![A-Za-z0-9_-])(?=[A-Za-z0-9_-]*(?:[A-Fa-f0-9]{8,}|\d{6,}))([A-Za-z0-9_-]+))/g), (match) => match[1] ?? match[2] ?? "").map((value) => normalizeOpaqueIdentifier(sanitizeExtractedIdentifier(value))).filter((value) => value.length >= 4)).slice(0, MAX_EXTRACTED_IDENTIFIERS);
}
function tokenizeAskOverlapText(text) {
	const normalized = localeLowercasePreservingWhitespace(text.normalize("NFKC")).trim();
	if (!normalized) return [];
	const keywords = extractKeywords(normalized);
	if (keywords.length > 0) return keywords;
	return normalized.split(/[^\p{L}\p{N}]+/u).map((token) => token.trim()).filter((token) => token.length > 0);
}
function resolveAskOverlapRequirement(latestAsk) {
	if (!latestAsk) return null;
	const askTokens = uniqueStrings(tokenizeAskOverlapText(latestAsk)).slice(0, MAX_ASK_OVERLAP_TOKENS);
	if (askTokens.length === 0) return null;
	const meaningfulAskTokens = askTokens.filter((token) => token.length > 1 && !isQueryStopWordToken(token));
	const tokensToCheck = meaningfulAskTokens.length > 0 ? meaningfulAskTokens : askTokens;
	return {
		tokens: tokensToCheck,
		requiredMatches: tokensToCheck.length >= MIN_ASK_OVERLAP_TOKENS_FOR_DOUBLE_MATCH ? 2 : 1
	};
}
function hasAskOverlap(summary, latestAsk) {
	const requirement = resolveAskOverlapRequirement(latestAsk);
	if (!requirement) return true;
	const summaryTokens = new Set(tokenizeAskOverlapText(summary));
	return requirement.tokens.filter((token) => summaryTokens.has(token)).length >= requirement.requiredMatches;
}
/** Audits a candidate summary for required sections, pending asks, and identifier preservation. */
function auditSummaryQuality(params) {
	const reasons = [];
	const lines = new Set(normalizedSummaryLines(params.structuralSummary));
	for (const section of REQUIRED_SUMMARY_SECTIONS) {
		if (!lines.has(section)) reasons.push(`missing_section:${section}`);
		if (params.sourceSummaries?.some((source) => normalizedSummaryLines(source).filter((line) => line === section).length > 1)) reasons.push(`duplicate_section:${section}`);
	}
	if ((params.identifierPolicy ?? "strict") === "strict") {
		const missingIdentifiers = params.identifiers.filter((identifier) => !summaryIncludesIdentifier(params.summary, identifier));
		if (missingIdentifiers.length > 0) reasons.push(`missing_identifiers:${missingIdentifiers.slice(0, 3).join(",")}`);
	}
	const leadingPendingAsk = extractLeadingPendingAsk(params.structuralSummary);
	if (params.latestUnresolvedUserRequest && leadingPendingAsk !== formatLatestUserRequestContext(params.latestUnresolvedUserRequest)) reasons.push("latest_user_ask_not_foregrounded");
	else if (!params.latestUnresolvedUserRequest && !hasAskOverlap(params.summary, params.latestAsk)) reasons.push("latest_user_ask_not_reflected");
	const retainedPendingAsk = extractLeadingPendingAsk(params.retainedTurnSummary ?? "");
	if (params.latestUnresolvedUserRequest ? retainedPendingAsk && !isEmptyPendingAsk(retainedPendingAsk) : params.retainedTurnSummary !== void 0 && resolveAskOverlapRequirement(params.latestAsk) && hasAskOverlap(extractPendingAskSection(params.retainedTurnSummary), params.latestAsk)) reasons.push("retained_turn_ask_marked_pending");
	return {
		ok: reasons.length === 0,
		reasons
	};
}
//#endregion
//#region src/agents/agent-hooks/compaction-safeguard.ts
/** Extension that safeguards compaction with structured summaries and quality repair. */
const log = createSubsystemLogger("compaction-safeguard");
const missedModelWarningSessions = /* @__PURE__ */ new WeakSet();
const SPLIT_TURN_SECTION_HEADING = "**Turn Context (split turn):**";
const MAX_TOOL_FAILURES = 8;
const MAX_TOOL_FAILURE_CHARS = 240;
const CONTEXT_TRUNCATED_MARKER = "\n\n[Earlier compaction context truncated to fit budget]\n\n";
const MAX_SPLIT_TURN_CONTEXT_CHARS = Math.floor(MAX_COMPACTION_SUMMARY_CHARS / 2);
const SPLIT_TURN_TRUNCATED_MARKER = "[Earlier split-turn messages truncated]\n";
const PRESERVED_TURNS_TRUNCATED_MARKER = "[Earlier preserved messages truncated]\n";
const DEFAULT_RECENT_TURNS_PRESERVE = 3;
const DEFAULT_QUALITY_GUARD_MAX_RETRIES = 1;
const MAX_RECENT_TURNS_PRESERVE = 12;
const MAX_QUALITY_GUARD_MAX_RETRIES = 3;
const MAX_RECENT_TURN_TEXT_CHARS = 600;
const MAX_REQUIRED_ASK_CONTEXT_CHARS = 2e3;
const REQUIRED_ASK_CONTEXT_TRUNCATED_MARKER = "\n[... split-turn ask context truncated ...]\n";
const PREVIOUS_SUMMARY_REDISTILL_PREFIX = "Previous compaction summary to re-distill with the current conversation. Prune stale, duplicate, or superseded details instead of preserving it verbatim.";
const compactionSafeguardDeps = { summarizeInStages };
function prependPreviousSummaryForRedistill(params) {
	const previousSummary = params.previousSummary?.trim();
	if (!previousSummary) return params.messages;
	return [{
		role: "user",
		content: [{
			type: "text",
			text: `<previous-compaction-summary>\n${PREVIOUS_SUMMARY_REDISTILL_PREFIX}\n\n${previousSummary}\n</previous-compaction-summary>`
		}],
		timestamp: 0
	}, ...params.messages];
}
function nestMarkdownHeadings(text) {
	return text.replace(/^##(?=[ \t]+\S)/gmu, "###");
}
function normalizeLegacySplitTurnSummary(summary) {
	const splitTurnStart = summary?.indexOf(SPLIT_TURN_SECTION_HEADING) ?? -1;
	if (!summary || splitTurnStart < 0) return summary;
	const splitTurnContentStart = splitTurnStart + 30;
	return `${summary.slice(0, splitTurnContentStart)}${nestRequiredSummaryHeadings(summary.slice(splitTurnContentStart))}`;
}
/**
* Messages the model currently sees: the last reset/compaction boundary's kept
* tail plus everything after it. Never the raw branch — that re-reads history
* behind every boundary and turns one compaction into dozens of model calls.
*/
function collectSessionContextMessages(sessionManager) {
	return projectBranchEntries(readSessionBranch(sessionManager));
}
/**
* The boundary-scoped range a preparation was meant to cover: everything the
* current context holds before its kept tail, minus the prior summary message
* (that is re-distilled separately). Bounded by construction — it can never
* reach behind the last reset/compaction boundary.
*/
function collectPreparationRangeMessages(sessionManager, firstKeptEntryId) {
	const entries = readSessionBranch(sessionManager);
	const firstKeptIndex = entries.findIndex((entry) => entry.id === firstKeptEntryId);
	if (firstKeptIndex < 0) return [];
	return projectBranchEntries(entries.slice(0, firstKeptIndex)).filter((message) => message.role !== "compactionSummary");
}
function readSessionBranch(sessionManager) {
	try {
		const entries = sessionManager?.getBranch?.();
		return Array.isArray(entries) ? entries : [];
	} catch {
		return [];
	}
}
function projectBranchEntries(entries) {
	try {
		return buildSessionContext(entries).messages;
	} catch {
		return [];
	}
}
function containsRealConversation(messages) {
	return messages.some((message, index, allMessages) => isRealConversationMessage(message, allMessages, index));
}
/**
* Summarize via the built-in LLM pipeline (summarizeInStages).
* Only called when no compaction provider is available or the provider failed.
*/
async function summarizeViaLLM(params) {
	return await compactionSafeguardDeps.summarizeInStages({
		...params,
		messages: prependPreviousSummaryForRedistill(params),
		previousSummary: void 0
	});
}
function assembleSuffix(parts) {
	let text = "";
	const contextRanges = [];
	for (const part of Object.values(parts)) {
		const section = typeof part === "string" ? part : part?.text;
		if (!section) continue;
		const leadingTrim = text ? 0 : section.length - section.trimStart().length;
		const appended = leadingTrim > 0 ? section.slice(leadingTrim) : section;
		const start = text.length;
		text = appendSummarySection(text, section);
		if (typeof part !== "string") contextRanges.push({
			start,
			end: start + appended.length,
			segmentStarts: part.segmentStarts.filter((segmentStart) => segmentStart >= leadingTrim).map((segmentStart) => start + segmentStart - leadingTrim)
		});
	}
	if (text && !/^\s/.test(text)) {
		text = `\n\n${text}`;
		for (const range of contextRanges) {
			range.start += 2;
			range.end += 2;
			range.segmentStarts = range.segmentStarts.map((segmentStart) => segmentStart + 2);
		}
	}
	return {
		text,
		contextRanges
	};
}
/**
* Resolve model credentials. Returns auth details on success or a cancel reason on failure.
* Extracted to keep the main handler readable when model/auth is conditional.
*/
async function resolveModelAuth(ctx, model) {
	let requestAuth;
	try {
		const modelRegistry = ctx.modelRegistry;
		if (typeof modelRegistry.getApiKeyAndHeaders !== "function") throw new Error("model registry auth lookup unavailable");
		requestAuth = await modelRegistry.getApiKeyAndHeaders(model);
	} catch (err) {
		const error = formatErrorMessage(err);
		log.warn(`Compaction safeguard: request credentials unavailable; cancelling compaction. ${error}`);
		return {
			ok: false,
			reason: `Compaction safeguard could not resolve request credentials for ${model.provider}/${model.id}: ${error}`
		};
	}
	if (!requestAuth.ok) {
		log.warn(`Compaction safeguard: request credential resolution failed for ${model.provider}/${model.id}: ${requestAuth.error}`);
		return {
			ok: false,
			reason: `Compaction safeguard could not resolve request credentials for ${model.provider}/${model.id}: ${requestAuth.error}`
		};
	}
	return {
		ok: true,
		apiKey: requestAuth.apiKey,
		headers: requestAuth.headers
	};
}
function buildCompactionSummaryHeaders(params) {
	if (params.model.provider !== "github-copilot") return params.headers;
	const messages = params.messages;
	return {
		...buildCopilotDynamicHeaders({
			messages,
			hasImages: hasCopilotVisionInput(messages)
		}),
		...params.headers
	};
}
function clampNonNegativeInt(value, fallback, max = Number.POSITIVE_INFINITY) {
	return Math.min(max, Math.max(0, Math.floor(typeof value === "number" && Number.isFinite(value) ? value : fallback)));
}
function resolveRecentTurnsPreserve(value) {
	return clampNonNegativeInt(value, DEFAULT_RECENT_TURNS_PRESERVE, MAX_RECENT_TURNS_PRESERVE);
}
function resolveQualityGuardMaxRetries(value) {
	return clampNonNegativeInt(value, DEFAULT_QUALITY_GUARD_MAX_RETRIES, MAX_QUALITY_GUARD_MAX_RETRIES);
}
function formatToolFailureMeta(details) {
	if (!details || typeof details !== "object") return;
	const record = details;
	return [typeof record.status === "string" && record.status ? `status=${record.status}` : "", typeof record.exitCode === "number" && Number.isFinite(record.exitCode) ? `exitCode=${record.exitCode}` : ""].filter(Boolean).join(" ") || void 0;
}
function collectToolFailures(messages) {
	const failures = [];
	const seen = /* @__PURE__ */ new Set();
	for (const message of messages) {
		if (message.role !== "toolResult" || !message.isError) continue;
		const toolResult = message;
		if (typeof toolResult.toolName === "string" && toolResult.toolName.trim() === "sessions_spawn" && normalizeAcceptedSessionSpawnResult(toolResult)) continue;
		const toolCallId = typeof toolResult.toolCallId === "string" ? toolResult.toolCallId : "";
		if (!toolCallId || seen.has(toolCallId)) continue;
		seen.add(toolCallId);
		const toolName = typeof toolResult.toolName === "string" && toolResult.toolName.trim() ? toolResult.toolName : "tool";
		const meta = formatToolFailureMeta(toolResult.details);
		const failureText = collectTextContentBlocks(toolResult.content).join("\n").replace(/\s+/g, " ").trim() || (meta ? "failed" : "failed (no output)");
		const summary = failureText.length > MAX_TOOL_FAILURE_CHARS ? `${truncateUtf16Safe(failureText, 237)}...` : failureText;
		failures.push({
			toolCallId,
			toolName,
			summary,
			meta
		});
	}
	return failures;
}
function formatToolFailuresSection(failures) {
	if (failures.length === 0) return "";
	const lines = failures.slice(0, MAX_TOOL_FAILURES).map((failure) => {
		const meta = failure.meta ? ` (${failure.meta})` : "";
		return `- ${failure.toolName}${meta}: ${failure.summary}`;
	});
	if (failures.length > MAX_TOOL_FAILURES) lines.push(`- ...and ${failures.length - MAX_TOOL_FAILURES} more`);
	return `\n\n## Tool Failures\n${lines.join("\n")}`;
}
function normalizeCompactionSuffix(suffix) {
	return typeof suffix === "string" ? {
		text: suffix,
		contextRanges: []
	} : suffix;
}
function resolveSuffixTailStart(suffix, tailBudget) {
	const desiredStart = Math.max(0, suffix.text.length - tailBudget);
	const containingRange = suffix.contextRanges.find((range) => desiredStart > range.start && desiredStart < range.end);
	if (!containingRange) return desiredStart;
	return containingRange.segmentStarts.find((segmentStart) => segmentStart >= desiredStart) ?? containingRange.end;
}
function capCompactionSuffix(suffixInput, maxChars) {
	const suffix = normalizeCompactionSuffix(suffixInput);
	if (suffix.text.length <= maxChars) return suffix.text;
	if (maxChars <= 0) return "";
	if (maxChars < 56) {
		const start = resolveSuffixTailStart(suffix, maxChars);
		return sliceUtf16Safe(suffix.text, start);
	}
	const tailBudget = maxChars - 56;
	const start = resolveSuffixTailStart(suffix, tailBudget);
	return tailBudget > 0 ? `${CONTEXT_TRUNCATED_MARKER}${sliceUtf16Safe(suffix.text, start)}` : CONTEXT_TRUNCATED_MARKER;
}
function budgetCompactionSummary(summaryBody, suffixInput, maxChars, qualityRetention) {
	const suffix = normalizeCompactionSuffix(suffixInput);
	const joined = `${summaryBody}${suffix.text}`;
	const retentionPlan = qualityRetention ? createSummaryQualityRetentionPlan(summaryBody, SUMMARY_TRUNCATED_MARKER, qualityRetention) : null;
	if (maxChars <= 0 || joined.length <= maxChars && !retentionPlan?.needsRebuild(maxChars)) return {
		summary: joined,
		structuralSummary: summaryBody,
		bodyBudget: maxChars,
		bodyTrimmed: false,
		suffixTrimmed: false,
		qualityRetentionInfeasible: false
	};
	const bodyCapacity = retentionPlan ? maxChars : summaryBody.length;
	const bodyFloor = Math.min(bodyCapacity, maxChars, Math.max(1, Math.ceil(maxChars / 2), retentionPlan?.minimumChars ?? 0));
	const suffixReservation = Math.min(suffix.text.length, maxChars);
	const bodySlot = Math.min(bodyCapacity, Math.max(bodyFloor, maxChars - suffixReservation));
	const rendered = retentionPlan?.render(bodySlot);
	const cappedBody = rendered?.text ?? capCompactionSummary(summaryBody, bodySlot);
	const cappedSuffix = capCompactionSuffix(suffix, Math.max(0, maxChars - cappedBody.length));
	return {
		summary: `${cappedBody}${cappedSuffix}`,
		structuralSummary: cappedBody,
		bodyBudget: bodySlot,
		bodyTrimmed: rendered ? rendered.trimmed : cappedBody.length < summaryBody.length,
		suffixTrimmed: cappedSuffix.length < suffix.text.length,
		qualityRetentionInfeasible: retentionPlan !== null && retentionPlan.minimumChars > maxChars
	};
}
function resolveSummaryReserveTokens(requestedReserveTokens, model) {
	const requested = Math.max(1, Math.floor(requestedReserveTokens));
	const modelMaxTokens = model.maxTokens;
	if (typeof modelMaxTokens !== "number" || !Number.isFinite(modelMaxTokens) || modelMaxTokens <= 0) return requested;
	return Math.max(1, Math.min(requested, Math.floor(modelMaxTokens)));
}
function extractMessageText(message) {
	const content = message.content;
	if (typeof content === "string") return content.trim();
	return Array.isArray(content) ? content.flatMap((block) => {
		const text = block && typeof block === "object" ? block.text : void 0;
		return typeof text === "string" && text.trim() ? [text.trim()] : [];
	}).join("\n") : "";
}
function formatNonTextPlaceholder(content) {
	if (content == null || typeof content === "string") return null;
	if (!Array.isArray(content)) return "[non-text content]";
	const typeCounts = /* @__PURE__ */ new Map();
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		const typeRaw = block.type;
		const type = typeof typeRaw === "string" && typeRaw.trim().length > 0 ? typeRaw : "unknown";
		if (type === "text") continue;
		typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
	}
	return typeCounts.size > 0 ? `[non-text content: ${Array.from(typeCounts, ([type, count]) => count > 1 ? `${type} x${count}` : type).join(", ")}]` : null;
}
function splitPreservedRecentTurns(params) {
	const preserveTurns = clampNonNegativeInt(params.recentTurnsPreserve, 0, MAX_RECENT_TURNS_PRESERVE);
	if (preserveTurns <= 0) return {
		summarizableMessages: params.messages,
		preservedMessages: []
	};
	const conversationIndexes = params.messages.flatMap((message, index) => message.role === "user" || message.role === "assistant" ? [index] : []);
	if (conversationIndexes.length === 0) return {
		summarizableMessages: params.messages,
		preservedMessages: []
	};
	const userIndexes = conversationIndexes.filter((index) => params.messages[index]?.role === "user");
	const boundaryStartIndex = userIndexes.at(-preserveTurns);
	const preservedIndexSet = new Set(boundaryStartIndex === void 0 ? userIndexes : conversationIndexes.filter((index) => index >= boundaryStartIndex));
	if (boundaryStartIndex === void 0) for (const index of conversationIndexes.toReversed()) {
		preservedIndexSet.add(index);
		if (preservedIndexSet.size >= preserveTurns * 2) break;
	}
	const preservedToolCallIds = /* @__PURE__ */ new Set();
	for (const index of preservedIndexSet) {
		const message = params.messages[index];
		if (message?.role === "assistant") for (const toolCall of extractToolCallsFromAssistant(message)) preservedToolCallIds.add(toolCall.id);
	}
	if (preservedToolCallIds.size > 0) {
		const preservedStartIndex = conversationIndexes.find((index) => preservedIndexSet.has(index));
		for (let index = preservedStartIndex; index < params.messages.length; index += 1) {
			const message = params.messages[index];
			if (message?.role !== "toolResult") continue;
			const toolResultId = extractToolResultId(message);
			if (toolResultId && preservedToolCallIds.has(toolResultId)) preservedIndexSet.add(index);
		}
	}
	const summarizableMessages = [];
	const preservedMessages = [];
	for (const [index, message] of params.messages.entries()) (preservedIndexSet.has(index) ? preservedMessages : summarizableMessages).push(message);
	return {
		summarizableMessages: repairToolUseResultPairing(summarizableMessages).messages,
		preservedMessages
	};
}
function formatContextMessage(message) {
	let roleLabel;
	if (message.role === "assistant") roleLabel = "Assistant";
	else if (message.role === "user") roleLabel = "User";
	else if (message.role === "toolResult") {
		const toolName = message.toolName;
		roleLabel = `Tool result (${typeof toolName === "string" && toolName.trim() ? toolName : "tool"})`;
	} else return null;
	const rendered = [extractMessageText(message), formatNonTextPlaceholder(message.content)].filter(Boolean).join("\n");
	if (!rendered) return null;
	const trimmed = rendered.length > MAX_RECENT_TURN_TEXT_CHARS ? `${truncateUtf16Safe(rendered, MAX_RECENT_TURN_TEXT_CHARS)}...` : rendered;
	return `- ${roleLabel}: ${trimmed}`;
}
function formatContextSegments(messages) {
	const pairing = classifyToolUseResultPairing(messages);
	const toolSegments = new Map(pairing.frames.map((frame) => [frame.assistant, [frame.assistant, ...frame.occurrences.flatMap((occurrence) => occurrence.sourceResult ? [occurrence.sourceResult] : [])]]));
	return messages.flatMap((message) => {
		if (message.role === "toolResult") return [];
		const lines = (toolSegments.get(message) ?? [message]).map(formatContextMessage).filter((line) => Boolean(line));
		return lines.length > 0 ? [lines.join("\n")] : [];
	});
}
function formatBoundedContextSection(params) {
	const segments = formatContextSegments(params.messages);
	if (segments.length === 0) return {
		text: "",
		segmentStarts: []
	};
	const completePrefix = `${params.heading}\n`;
	const complete = `${completePrefix}${segments.join("\n")}`;
	if (complete.length <= params.maxChars) {
		let offset = completePrefix.length;
		return {
			text: complete,
			segmentStarts: segments.map((segment) => {
				const start = offset;
				offset += segment.length + 1;
				return start;
			})
		};
	}
	const prefix = `${completePrefix}${params.truncatedMarker}`;
	const retained = [];
	let usedChars = prefix.length;
	for (const segment of segments.toReversed()) {
		const segmentChars = segment.length + (retained.length > 0 ? 1 : 0);
		if (usedChars + segmentChars > params.maxChars) break;
		retained.unshift(segment);
		usedChars += segmentChars;
	}
	params.onTruncated?.();
	let offset = prefix.length;
	return {
		text: `${prefix}${retained.join("\n")}`,
		segmentStarts: retained.map((segment) => {
			const start = offset;
			offset += segment.length + 1;
			return start;
		}),
		truncatedLoss: params.truncatedLoss
	};
}
function buildPreservedTurnsSection(messages) {
	return formatBoundedContextSection({
		messages,
		heading: "\n\n## Recent turns preserved verbatim",
		maxChars: MAX_SPLIT_TURN_CONTEXT_CHARS,
		truncatedMarker: PRESERVED_TURNS_TRUNCATED_MARKER,
		truncatedLoss: "preserved-turn-head"
	});
}
function buildSplitTurnContextSection(messages, onTruncated) {
	return formatBoundedContextSection({
		messages,
		heading: "**Turn Context (split turn):**\n",
		maxChars: MAX_SPLIT_TURN_CONTEXT_CHARS,
		truncatedMarker: SPLIT_TURN_TRUNCATED_MARKER,
		truncatedLoss: "split-turn-head",
		onTruncated
	});
}
function formatGeneratedSplitTurnSection(summary, onTruncated) {
	const heading = `${SPLIT_TURN_SECTION_HEADING}\n\n`;
	const summaryBudget = MAX_SPLIT_TURN_CONTEXT_CHARS - heading.length;
	const nestedSummary = nestMarkdownHeadings(summary);
	const cappedSummary = capCompactionSummary(nestedSummary, summaryBudget);
	if (cappedSummary.length < nestedSummary.length) onTruncated?.();
	return `${heading}${cappedSummary}`;
}
function formatRequiredAskContext(rawAsk) {
	const source = rawAsk.trim();
	if (source.length <= MAX_REQUIRED_ASK_CONTEXT_CHARS) return source;
	return `${truncateUtf16Safe(source, Math.floor(978))}${REQUIRED_ASK_CONTEXT_TRUNCATED_MARKER}${sliceUtf16Safe(source, -978)}`;
}
function extractLatestUserAsk(messages) {
	for (const message of messages.toReversed()) if (message.role === "user") {
		const ask = extractMessageText(message);
		if (ask) return ask;
	}
	return null;
}
/**
* Read and format critical workspace context for compaction summary.
* Uses explicitly configured AGENTS.md section names only.
* The default "Session Startup" / "Red Lines" pair preserves the legacy
* "Every Session" / "Safety" fallback.
* Limited to 2000 chars to avoid bloating the summary.
*/
async function readWorkspaceContextForSummary(sectionNames, workspaceDir = process.cwd()) {
	const MAX_SUMMARY_CONTEXT_CHARS = 2e3;
	if (!Array.isArray(sectionNames) || sectionNames.length === 0) return "";
	const agentsPath = path.join(workspaceDir, "AGENTS.md");
	try {
		const opened = await openRootFile({
			absolutePath: agentsPath,
			rootPath: workspaceDir,
			boundaryLabel: "workspace root"
		});
		if (!opened.ok) return "";
		let content;
		try {
			content = await readWorkspaceBootstrapFile(opened.fd);
		} catch (err) {
			if (err instanceof RangeError) {
				log.warn(`Ignoring oversized AGENTS.md ${agentsPath}: file exceeds the ${MAX_WORKSPACE_BOOTSTRAP_FILE_BYTES}-byte limit`);
				return "";
			}
			throw err;
		} finally {
			fs.closeSync(opened.fd);
		}
		let sections = extractSections(content, sectionNames);
		if (sections.length === 0 && sectionNames.length === 2 && sectionNames.some((name) => name.trim().toLowerCase() === "session startup") && sectionNames.some((name) => name.trim().toLowerCase() === "red lines")) sections = extractSections(content, ["Every Session", "Safety"]);
		if (sections.length === 0) return "";
		const combined = sections.join("\n\n");
		return `\n\n<workspace-critical-rules>\n${combined.length > MAX_SUMMARY_CONTEXT_CHARS ? `${truncateUtf16Safe(combined, MAX_SUMMARY_CONTEXT_CHARS)}\n...[truncated]...` : combined}\n</workspace-critical-rules>`;
	} catch {
		return "";
	}
}
/** Registers compaction hooks that summarize, preserve recent turns, and audit output quality. */
function compactionSafeguardExtension(api) {
	api.on("session_before_compact", async (event, ctx) => {
		const { preparation, customInstructions: eventInstructions, signal, thinkingLevel, streamFn } = event;
		const previousSummary = normalizeLegacySplitTurnSummary(preparation.previousSummary?.trim());
		let baseMessagesToSummarize = stripRuntimeContextCustomMessages(preparation.messagesToSummarize);
		let baseTurnPrefixMessages = stripRuntimeContextCustomMessages(preparation.turnPrefixMessages ?? []);
		const latestUnresolvedUserRequest = preparation.latestUnresolvedUserRequest ?? null;
		if (!containsRealConversation([...baseMessagesToSummarize, ...baseTurnPrefixMessages])) {
			const rangeMessages = stripRuntimeContextCustomMessages(collectPreparationRangeMessages(ctx.sessionManager, preparation.firstKeptEntryId));
			if (containsRealConversation(rangeMessages)) {
				log.info("Compaction safeguard: summarizing the boundary-scoped preparation range after compaction preparation omitted real conversation content.");
				baseMessagesToSummarize = rangeMessages;
				baseTurnPrefixMessages = [];
			}
		}
		const hasRealConversation = containsRealConversation([...baseMessagesToSummarize, ...baseTurnPrefixMessages]) || containsRealConversation(stripRuntimeContextCustomMessages(collectSessionContextMessages(ctx.sessionManager)));
		setCompactionSafeguardCancellation(ctx.sessionManager, void 0);
		if (!hasRealConversation) {
			log.info("Compaction safeguard: no real conversation messages to summarize; writing compaction boundary to suppress re-trigger loop.");
			return { compaction: {
				summary: buildStructuredFallbackSummary(previousSummary),
				firstKeptEntryId: preparation.firstKeptEntryId,
				tokensBefore: preparation.tokensBefore
			} };
		}
		const { readFiles, modifiedFiles } = computeFileLists(preparation.fileOps);
		const fileOpsSummary = formatFileOperations(readFiles, modifiedFiles);
		const toolFailureSection = formatToolFailuresSection(collectToolFailures([...baseMessagesToSummarize, ...baseTurnPrefixMessages]));
		const runtime = getCompactionSafeguardRuntime(ctx.sessionManager);
		const customInstructions = resolveCompactionInstructions(eventInstructions, runtime?.customInstructions);
		const summarizationInstructions = {
			identifierPolicy: runtime?.identifierPolicy,
			identifierInstructions: runtime?.identifierInstructions
		};
		const identifierPolicy = runtime?.identifierPolicy ?? "strict";
		const qualityGuardEnabled = runtime?.qualityGuardEnabled ?? false;
		const providerId = runtime?.provider;
		const turnPrefixMessages = baseTurnPrefixMessages;
		const recentTurnsPreserve = resolveRecentTurnsPreserve(runtime?.recentTurnsPreserve);
		const structuredInstructions = buildCompactionStructureInstructions(customInstructions, summarizationInstructions, latestUnresolvedUserRequest ?? void 0);
		let workspaceContextPromise;
		const finalizeSummaryText = async (body, sections, producerLosses = /* @__PURE__ */ new Set(), qualityRetention) => {
			workspaceContextPromise ??= readWorkspaceContextForSummary(runtime?.postCompactionSections, runtime?.workspaceDir);
			const finalized = budgetCompactionSummary(body, assembleSuffix({
				splitTurnSection: sections.splitTurnSection,
				generatedSplitTurnSection: sections.generatedSplitTurnSection,
				preservedTurnsSection: sections.preservedTurnsSection,
				toolFailureSection,
				fileOpsSummary,
				workspaceContext: await workspaceContextPromise
			}), MAX_COMPACTION_SUMMARY_CHARS, qualityRetention);
			const losses = new Set(producerLosses);
			for (const section of Object.values(sections)) if (typeof section !== "string" && section?.truncatedLoss) losses.add(section.truncatedLoss);
			if (finalized.bodyTrimmed) losses.add("summary-tail");
			if (finalized.suffixTrimmed) losses.add("suffix-head");
			if (losses.size > 0) log.warn(`Compaction safeguard: finalized artifact truncated; loss=${[...losses].join(",")}`);
			return finalized;
		};
		const compactionResult = (summary) => ({ compaction: {
			summary,
			firstKeptEntryId: preparation.firstKeptEntryId,
			tokensBefore: preparation.tokensBefore,
			details: {
				readFiles,
				modifiedFiles,
				...latestUnresolvedUserRequest ? { latestUnresolvedUserRequest } : {}
			}
		} });
		if (providerId) {
			const compactionProvider = getCompactionProvider(providerId);
			if (compactionProvider) try {
				const providerResult = await compactionProvider.summarize({
					messages: [...baseMessagesToSummarize, ...turnPrefixMessages],
					signal,
					customInstructions: structuredInstructions,
					summarizationInstructions,
					previousSummary
				});
				if (typeof providerResult === "string" && providerResult.trim()) {
					const { preservedMessages } = splitPreservedRecentTurns({
						messages: baseMessagesToSummarize,
						recentTurnsPreserve
					});
					const producerLosses = /* @__PURE__ */ new Set();
					return compactionResult((await finalizeSummaryText(providerResult, {
						splitTurnSection: preparation.isSplitTurn ? buildSplitTurnContextSection(turnPrefixMessages, () => {
							producerLosses.add("split-turn-head");
						}) : void 0,
						preservedTurnsSection: buildPreservedTurnsSection(preservedMessages)
					}, producerLosses)).summary);
				}
				log.warn(`Compaction provider "${compactionProvider.id}" returned empty result, falling back to LLM.`);
			} catch (err) {
				if (signal?.aborted) throw err;
				log.warn(`Compaction provider "${compactionProvider.id}" failed, falling back to LLM: ${formatErrorMessage(err)}`);
			}
			else log.warn(`Compaction provider "${providerId}" is configured but not registered. Falling back to LLM.`);
		}
		const model = ctx.model ?? runtime?.model;
		if (!model) {
			if (!ctx.model && !runtime?.model && !missedModelWarningSessions.has(ctx.sessionManager)) {
				missedModelWarningSessions.add(ctx.sessionManager);
				log.warn("[compaction-safeguard] Both ctx.model and runtime.model are undefined. Compaction summarization will not run. This indicates extensionRunner.initialize() was not called and model was not passed through runtime registry.");
			}
			setCompactionSafeguardCancellation(ctx.sessionManager, "Compaction safeguard could not resolve a summarization model.");
			return { cancel: true };
		}
		const authResult = await resolveModelAuth(ctx, model);
		if (!authResult.ok) {
			setCompactionSafeguardCancellation(ctx.sessionManager, authResult.reason);
			return { cancel: true };
		}
		try {
			const modelContextWindow = resolveContextWindowTokens(model);
			const contextWindowTokens = runtime?.contextWindowTokens ?? modelContextWindow;
			let messagesToSummarize = baseMessagesToSummarize;
			const headers = buildCompactionSummaryHeaders({
				model,
				messages: messagesToSummarize,
				headers: authResult.headers
			});
			const usageSink = (usage) => recordSessionModelUsage(ctx.sessionManager, usage);
			const llmSummaryParams = {
				model,
				apiKey: authResult.apiKey ?? "",
				headers,
				signal,
				reserveTokens: resolveSummaryReserveTokens(preparation.settings.reserveTokens, model),
				contextWindow: contextWindowTokens,
				summarizationInstructions,
				thinkingLevel,
				streamFn,
				usageSink
			};
			const qualityGuardMaxRetries = resolveQualityGuardMaxRetries(runtime?.qualityGuardMaxRetries);
			const maxHistoryShare = runtime?.maxHistoryShare ?? .5;
			const tokensBefore = typeof preparation.tokensBefore === "number" && Number.isFinite(preparation.tokensBefore) ? preparation.tokensBefore : void 0;
			let droppedSummary;
			if (tokensBefore !== void 0) {
				const { newContentTokens, maxHistoryTokens, pruned } = buildHistoryPrunePlan({
					messagesToSummarize,
					turnPrefixMessages,
					tokensBefore,
					contextWindowTokens,
					maxHistoryShare,
					parts: 2
				});
				if (newContentTokens > maxHistoryTokens && pruned) {
					if (pruned.droppedChunks > 0) {
						const newContentRatio = newContentTokens / contextWindowTokens * 100;
						log.warn(`Compaction safeguard: new content uses ${newContentRatio.toFixed(1)}% of context; dropped ${pruned.droppedChunks} older chunk(s) (${pruned.droppedMessages} messages) to fit history budget.`);
						messagesToSummarize = pruned.messages;
						if (pruned.droppedMessagesList.length > 0) try {
							const droppedChunkRatio = await computeAdaptiveChunkRatioWithWorker({
								messages: pruned.droppedMessagesList,
								contextWindow: contextWindowTokens,
								signal
							});
							const droppedMaxChunkTokens = Math.max(1, Math.floor(contextWindowTokens * droppedChunkRatio) - SUMMARIZATION_OVERHEAD_TOKENS);
							droppedSummary = await summarizeViaLLM({
								...llmSummaryParams,
								messages: pruned.droppedMessagesList,
								maxChunkTokens: droppedMaxChunkTokens,
								customInstructions: structuredInstructions,
								previousSummary
							});
						} catch (droppedError) {
							if (signal?.aborted) signal.throwIfAborted();
							throw new Error("Failed to summarize dropped messages.", { cause: droppedError });
						}
					}
				}
			}
			const oracleMessages = [...messagesToSummarize, ...turnPrefixMessages];
			const splitUserAsk = preparation.isSplitTurn ? extractLatestUserAsk(turnPrefixMessages) : null;
			const latestUserAsk = splitUserAsk ?? extractLatestUserAsk(messagesToSummarize);
			const identifiers = extractOpaqueIdentifiers(oracleMessages.slice(-10).map(extractMessageText).filter(Boolean).join("\n"));
			const { summarizableMessages: summaryTargetMessages, preservedMessages: preservedRecentMessages } = splitPreservedRecentTurns({
				messages: messagesToSummarize,
				recentTurnsPreserve
			});
			const preservedTurnsSectionLocal = buildPreservedTurnsSection(preservedRecentMessages);
			const latestPreparedAsk = extractLatestUserAsk(messagesToSummarize);
			const requiredAskContext = formatRequiredAskContext(latestUserAsk ?? "");
			messagesToSummarize = !latestUnresolvedUserRequest && qualityGuardEnabled && latestPreparedAsk === latestUserAsk && Boolean(latestPreparedAsk) && (summaryTargetMessages.length > 0 || !preservedTurnsSectionLocal.text.includes(requiredAskContext)) ? messagesToSummarize : summaryTargetMessages;
			const allMessages = [...messagesToSummarize, ...turnPrefixMessages];
			const adaptiveRatio = await computeAdaptiveChunkRatioWithWorker({
				messages: allMessages,
				contextWindow: contextWindowTokens,
				signal
			});
			const maxChunkTokens = Math.max(1, Math.floor(contextWindowTokens * adaptiveRatio) - SUMMARIZATION_OVERHEAD_TOKENS);
			const effectivePreviousSummary = droppedSummary ?? previousSummary;
			let correctiveInstructions = "";
			const totalAttempts = qualityGuardEnabled ? qualityGuardMaxRetries + 1 : 1;
			for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
				let splitTurnSectionLocal = "";
				let splitTurnSummaryLocal = "";
				let historySummary = "";
				const producerLosses = /* @__PURE__ */ new Set();
				try {
					historySummary = messagesToSummarize.length > 0 ? await summarizeViaLLM({
						...llmSummaryParams,
						messages: messagesToSummarize,
						maxChunkTokens,
						customInstructions: [structuredInstructions, correctiveInstructions].filter(Boolean).join("\n\n"),
						previousSummary: effectivePreviousSummary
					}) : buildStructuredFallbackSummary(effectivePreviousSummary);
					if (preparation.isSplitTurn && turnPrefixMessages.length > 0) {
						const splitTurnFocus = wrapUntrustedInstructionBlock("Additional context from /compact", customInstructions);
						const prefixSummary = await summarizeViaLLM({
							...llmSummaryParams,
							messages: turnPrefixMessages,
							maxChunkTokens,
							customInstructions: [
								TURN_PREFIX_SUMMARIZATION_PROMPT,
								splitTurnFocus,
								correctiveInstructions
							].filter(Boolean).join("\n\n"),
							previousSummary: void 0
						});
						splitTurnSummaryLocal = prefixSummary;
						splitTurnSectionLocal = formatGeneratedSplitTurnSection(prefixSummary, () => {
							producerLosses.add("split-turn-tail");
						});
					}
				} catch (attemptError) {
					if (signal?.aborted) signal.throwIfAborted();
					if (attempt > 0) {
						log.warn(`Compaction safeguard: corrective generation failed; reasonCode=corrective_generation_failed attempt=${attempt + 1}`);
						setCompactionSafeguardCancellation(ctx.sessionManager, "Compaction safeguard finalized summary failed quality checks and corrective generation failed.");
						return { cancel: true };
					}
					throw attemptError;
				}
				const unbudgetedSummary = appendSummarySection(historySummary, splitTurnSectionLocal ? `\n\n${splitTurnSectionLocal}` : "");
				const finalized = await finalizeSummaryText(qualityGuardEnabled ? historySummary : unbudgetedSummary, {
					generatedSplitTurnSection: qualityGuardEnabled && splitTurnSectionLocal ? `\n\n${splitTurnSectionLocal}` : void 0,
					preservedTurnsSection: preservedTurnsSectionLocal
				}, producerLosses, qualityGuardEnabled ? {
					auditSummary: unbudgetedSummary,
					identifiers,
					latestAsk: latestUserAsk,
					latestAskInRetainedTurn: splitUserAsk !== null,
					latestUnresolvedUserRequest: latestUnresolvedUserRequest ?? void 0,
					requiredAskContext,
					identifierPolicy
				} : void 0);
				const canRegenerate = messagesToSummarize.length > 0 || preparation.isSplitTurn && turnPrefixMessages.length > 0;
				if (!qualityGuardEnabled) return compactionResult(finalized.summary);
				if (finalized.qualityRetentionInfeasible) {
					log.warn(`Compaction safeguard: required quality facts exceed finalized artifact budget; requiredChars>${MAX_COMPACTION_SUMMARY_CHARS} identifierCount=${identifiers.length}`);
					setCompactionSafeguardCancellation(ctx.sessionManager, "Compaction safeguard required facts exceed the finalized summary budget.");
					return { cancel: true };
				}
				const quality = auditSummaryQuality({
					summary: finalized.summary,
					structuralSummary: finalized.structuralSummary,
					sourceSummaries: [historySummary, splitTurnSummaryLocal].filter(Boolean),
					identifiers,
					latestAsk: latestUserAsk,
					latestUnresolvedUserRequest: latestUnresolvedUserRequest ?? void 0,
					retainedTurnSummary: splitUserAsk !== null ? splitTurnSummaryLocal : void 0,
					identifierPolicy
				});
				if (quality.ok) return compactionResult(finalized.summary);
				if (!canRegenerate || attempt >= totalAttempts - 1) {
					const reasonCodes = [...new Set(quality.reasons.map((reason) => reason.split(":", 1)[0]))];
					log.warn(`Compaction safeguard: finalized summary failed quality checks; reasonCodes=${reasonCodes.join(",")} reasonCount=${quality.reasons.length}`);
					setCompactionSafeguardCancellation(ctx.sessionManager, "Compaction safeguard finalized summary failed quality checks.");
					return { cancel: true };
				}
				const reasons = quality.reasons.join(", ");
				const qualityFeedbackInstruction = identifierPolicy === "strict" ? "Fix all issues and include every required section with exact identifiers preserved." : "Fix all issues and include every required section while following the configured identifier policy.";
				const budgetInstruction = `Keep the complete summary body within ${finalized.bodyBudget} UTF-16 code units so the finalized artifact remains valid after required suffixes.`;
				const qualityFeedbackReasons = wrapUntrustedInstructionBlock("Quality check feedback", `Previous summary failed quality checks (${reasons}).`);
				correctiveInstructions = qualityFeedbackReasons ? `${qualityFeedbackInstruction}\n${budgetInstruction}\n\n${qualityFeedbackReasons}` : `${qualityFeedbackInstruction}\n${budgetInstruction}`;
			}
			throw new Error("Compaction safeguard exhausted summary attempts without a decision.");
		} catch (error) {
			if (signal?.aborted) signal.throwIfAborted();
			const message = formatErrorMessage(error);
			log.warn(`Compaction summarization failed; cancelling compaction to preserve history: ${message}`);
			setCompactionSafeguardCancellation(ctx.sessionManager, `Compaction safeguard could not summarize the session: ${message}`, error);
			return { cancel: true };
		}
	});
}
const testing = {
	setSummarizeInStagesForTest(next) {
		compactionSafeguardDeps.summarizeInStages = next ?? summarizeInStages;
	},
	collectToolFailures,
	formatToolFailuresSection,
	splitPreservedRecentTurns,
	buildPreservedTurnsSection,
	buildCompactionStructureInstructions,
	buildStructuredFallbackSummary,
	prependPreviousSummaryForRedistill,
	appendSummarySection,
	resolveRecentTurnsPreserve,
	resolveQualityGuardMaxRetries,
	extractOpaqueIdentifiers,
	auditSummaryQuality,
	capCompactionSummary,
	budgetCompactionSummary,
	formatFileOperations,
	computeAdaptiveChunkRatio,
	readWorkspaceContextForSummary,
	hasMeaningfulConversationContent,
	isRealConversationMessage,
	BASE_CHUNK_RATIO,
	MIN_CHUNK_RATIO,
	SAFETY_MARGIN,
	MAX_COMPACTION_SUMMARY_CHARS,
	MAX_FILE_OPS_SECTION_CHARS,
	MAX_FILE_OPS_LIST_CHARS: 900,
	SUMMARY_TRUNCATED_MARKER,
	CONTEXT_TRUNCATED_MARKER,
	MAX_SPLIT_TURN_CONTEXT_CHARS
};
if (process.env.VITEST || false) globalThis[Symbol.for("openclaw.compactionSafeguardTestApi")] = testing;
//#endregion
//#region src/agents/embedded-agent-runner/extensions.ts
/**
* Builds extension factories available to embedded-agent runtime sessions.
*/
function snapshotToolReceipt(details, includeMessageDelivery) {
	const record = asOptionalRecord(details);
	const snapshot = (value) => {
		const valueRecord = asOptionalRecord(value);
		return valueRecord ? { ...valueRecord } : value;
	};
	const toolSend = record?.toolSend;
	const messageDelivery = includeMessageDelivery ? record?.messageDelivery : void 0;
	if (toolSend === void 0 && messageDelivery === void 0) return;
	return {
		...toolSend !== void 0 ? { toolSend: snapshot(toolSend) } : {},
		...messageDelivery !== void 0 ? { messageDelivery: snapshot(messageDelivery) } : {}
	};
}
function buildAgentToolResultMiddlewareFactory(sessionManager, context) {
	const { agentId, sessionKey, runId } = context;
	const sessionId = context.sessionId ?? sessionManager.getSessionId?.();
	const runner = createAgentToolResultMiddlewareRunner({
		runtime: "openclaw",
		...agentId ? { agentId } : {},
		...sessionId ? { sessionId } : {},
		...sessionKey ? { sessionKey } : {},
		...runId ? { runId } : {}
	});
	return (agent) => {
		agent.on("tool_result", async (rawEvent, ctx) => {
			const event = asOptionalRecord(rawEvent) ?? {};
			if (!event.toolName) return;
			const eventToolCallId = typeof event.toolCallId === "string" && event.toolCallId.trim() ? event.toolCallId : void 0;
			const toolCallId = eventToolCallId ?? `openclaw-${randomUUID()}`;
			const current = {
				content: Array.isArray(event.content) ? event.content : [],
				details: event.details
			};
			const receipt = snapshotToolReceipt(current.details, event.toolName === "message");
			if (eventToolCallId && receipt) recordEmbeddedToolReceipt(sessionManager, eventToolCallId, receipt);
			const inputHadErrorStatus = isToolResultError(current);
			const adjustedInput = eventToolCallId ? peekAdjustedParamsForToolCall(eventToolCallId, runId) : void 0;
			const result = await runner.applyToolResultMiddleware({
				threadId: event.threadId,
				turnId: event.turnId,
				toolCallId,
				toolName: event.toolName,
				args: asOptionalRecord(adjustedInput ?? event.input) ?? {},
				cwd: ctx.cwd,
				isError: event.isError,
				result: current
			});
			const isAcceptedSessionSpawn = event.toolName === "sessions_spawn" && normalizeAcceptedSessionSpawnResult(result) !== null;
			const isError = !isAcceptedSessionSpawn && (event.isError === true || inputHadErrorStatus || isToolResultError(result));
			const clearsAcceptedSessionSpawnError = isAcceptedSessionSpawn && (event.isError === true || inputHadErrorStatus || isToolResultError(result));
			if (eventToolCallId) finalizeToolTerminalPresentation({
				toolCallId: eventToolCallId,
				runId,
				result,
				isError
			});
			return {
				content: result.content,
				details: result.details,
				...result.terminate !== void 0 ? { terminate: result.terminate } : {},
				...isError ? { isError: true } : {},
				...clearsAcceptedSessionSpawnError ? { isError: false } : {}
			};
		});
	};
}
function buildEmbeddedExtensionFactories(params) {
	const factories = [];
	if (resolveEffectiveCompactionMode(params.cfg) === "safeguard") {
		const compactionCfg = params.cfg?.agents?.defaults?.compaction;
		const qualityGuardCfg = compactionCfg?.qualityGuard;
		const contextWindowTokens = params.contextTokenBudget ?? resolveContextWindowInfo({
			cfg: params.cfg,
			provider: params.provider,
			modelId: params.modelId,
			modelContextTokens: params.model?.contextTokens,
			modelContextWindow: params.model?.contextWindow,
			defaultTokens: 2e5
		}).tokens;
		setCompactionSafeguardRuntime(params.sessionManager, {
			contextWindowTokens,
			identifierPolicy: compactionCfg?.identifierPolicy,
			qualityGuardEnabled: qualityGuardCfg?.enabled ?? true,
			qualityGuardMaxRetries: qualityGuardCfg?.maxRetries,
			model: params.model,
			recentTurnsPreserve: compactionCfg?.recentTurnsPreserve,
			workspaceDir: params.workspaceDir,
			postCompactionSections: compactionCfg?.postCompactionSections,
			provider: compactionCfg?.provider
		});
		factories.push(compactionSafeguardExtension);
	}
	factories.push(buildAgentToolResultMiddlewareFactory(params.sessionManager, {
		agentId: params.agentId,
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		runId: params.runId
	}));
	return factories;
}
//#endregion
//#region src/agents/embedded-agent-runner/system-prompt.ts
function buildEmbeddedSystemPrompt(params) {
	return buildConfiguredAgentSystemPrompt({
		config: params.config,
		agentId: params.agentId ?? params.runtimeInfo.agentId,
		workspaceDir: params.workspaceDir,
		runtimeCwd: params.runtimeCwd,
		defaultThinkLevel: params.defaultThinkLevel,
		reasoningLevel: params.reasoningLevel,
		extraSystemPrompt: params.extraSystemPrompt,
		ownerNumbers: params.ownerNumbers,
		ownerDisplay: params.ownerDisplay,
		ownerDisplaySecret: params.ownerDisplaySecret,
		reasoningTagHint: params.reasoningTagHint,
		skillsPrompt: params.skillsPrompt,
		codeModeActive: params.codeModeActive,
		docsPath: params.docsPath,
		sourcePath: params.sourcePath,
		ttsHint: params.ttsHint,
		workspaceNotes: params.workspaceNotes,
		reactionGuidance: params.reactionGuidance,
		promptMode: params.promptMode,
		silentReplyPromptMode: params.silentReplyPromptMode,
		sourceReplyDeliveryMode: params.sourceReplyDeliveryMode,
		subagentDelegationMode: params.subagentDelegationMode,
		proactiveSubagentOrchestration: params.proactiveSubagentOrchestration,
		acpEnabled: params.acpEnabled,
		promptSurface: params.promptSurface,
		nativeCommandNames: params.nativeCommandNames,
		nativeCommandGuidanceLines: params.nativeCommandGuidanceLines,
		runtimeInfo: params.runtimeInfo,
		messageToolHints: params.messageToolHints,
		toolSchemaDirectoryPrompt: params.toolSchemaDirectoryPrompt,
		sandboxInfo: params.sandboxInfo,
		toolNames: params.tools.map((tool) => tool.name),
		capabilityToolNames: params.capabilityToolNames,
		modelAliasLines: params.modelAliasLines,
		userTimezone: params.userTimezone,
		userDate: params.userDate,
		contextFiles: params.contextFiles,
		bootstrapMode: params.bootstrapMode,
		bootstrapTruncationNotice: params.bootstrapTruncationNotice,
		includeMemorySection: params.includeMemorySection,
		memoryCitationsMode: params.memoryCitationsMode,
		preparedMemoryPrompt: params.preparedMemoryPrompt,
		preparedWatchedSessions: params.preparedWatchedSessions,
		projectMemoryBootstrap: params.projectMemoryBootstrap,
		activeProjectKeys: params.activeProjectKeys,
		promptContribution: params.promptContribution
	});
}
function applySystemPromptToSession(session, systemPrompt) {
	session.setBaseSystemPrompt(systemPrompt.trim());
}
//#endregion
//#region src/agents/embedded-agent-runner/tool-name-allowlist.ts
/**
* OpenClaw built-in tools that remain present in the embedded runtime even when
* OpenClaw routes execution through custom tool definitions.
*/
const AGENT_RESERVED_TOOL_NAMES = [
	"bash",
	"edit",
	"find",
	"grep",
	"ls",
	"read",
	"write"
];
function addName(names, value) {
	if (typeof value !== "string") return;
	const trimmed = value.trim();
	if (trimmed) names.add(trimmed);
}
function collectAllowedToolNames(params) {
	const names = /* @__PURE__ */ new Set();
	for (const tool of params.tools) addName(names, tool.name);
	for (const tool of params.clientTools ?? []) addName(names, tool.function?.name);
	return names;
}
/**
* Collect the exact tool names registered with the embedded agent for this session.
*/
function collectRegisteredToolNames(tools) {
	const names = /* @__PURE__ */ new Set();
	for (const tool of tools) addName(names, tool.name);
	return names;
}
function collectCoreBuiltinToolNames(tools, options) {
	const names = /* @__PURE__ */ new Set();
	for (const tool of tools) {
		if (options?.isPluginTool?.(tool)) continue;
		addName(names, tool.name);
	}
	return names;
}
function toSessionToolAllowlist(allowedToolNames) {
	return [...new Set(allowedToolNames)].toSorted((a, b) => a.localeCompare(b));
}
//#endregion
//#region src/agents/embedded-agent-runner/run/code-mode-reconciliation.ts
const CODE_MODE_RECOVERY_RESUME_TOOL_NAME = "recovery_resume";
function isCodeModeRecoveryResumeTool(tool) {
	return normalizeToolPolicyName(tool.name ?? "") === CODE_MODE_RECOVERY_RESUME_TOOL_NAME;
}
const CODE_MODE_POST_RECONCILIATION_INSTRUCTION = "The previous uncertain Code Mode mutation was inspected. Code Mode is disabled for this bounded recovery. Use the available normal tools and their real schemas. OpenClaw permits at most one mutation attempt, blocks exact repeats whose earlier effect was committed or uncertain, and keeps reads and schema discovery available so you can verify and report the result.";
function reconciliationPrompt(canResume) {
	return "OpenClaw activated this temporary read-only recovery because the previous Code Mode mutation may have partially applied. First use read by itself to determine the authoritative current state." + (canResume ? " If work remains, call recovery_resume by itself after the read result. It performs no mutation and starts one bounded recovery with the normal tool surface." : "") + " If no work remains, report the authoritative state. Do not repeat or finish a mutation during inspection.";
}
function recoveryBlocked(message) {
	return {
		kind: "immediate",
		outcome: {
			kind: "result",
			result: textResult(message, {
				status: "blocked",
				deniedReason: "code-mode-recovery"
			}),
			isError: true
		},
		dispose() {}
	};
}
function createReadyToolExecution(tool, params) {
	return {
		kind: "ready",
		args: params.args,
		execute: async (onImplementationStart) => {
			onImplementationStart?.();
			return await tool.execute(params.toolCallId, params.args, params.signal, params.onUpdate);
		},
		dispose() {}
	};
}
function gatePreparedRecoveryTool(tool, state, originalPreparer, ownerKey) {
	attachInternalToolExecutionPreparer(tool, async (params) => {
		const prepared = await originalPreparer(params);
		if (prepared.kind === "immediate") return prepared;
		if (buildToolMutationState(tool.name, prepared.args, ownerKey ? { ownerKey } : void 0).replaySafe) return prepared;
		const actionKey = hashToolCall(normalizeToolPolicyName(tool.name), prepared.args);
		if (state.blockedActionKeys.has(actionKey)) {
			prepared.dispose();
			return recoveryBlocked("Blocked an exact repeat of a Code Mode call whose earlier effect was committed or uncertain. Inspect the current state and choose a different operation.");
		}
		if (state.mutationAttempt !== "available") {
			prepared.dispose();
			return recoveryBlocked("This recovery already attempted one mutation. Use read-only tools to inspect the result and report any remaining work.");
		}
		state.mutationAttempt = "reserved";
		let started = false;
		return {
			...prepared,
			execute: async (onImplementationStart) => {
				return await prepared.execute(() => {
					state.mutationAttempt = "consumed";
					started = true;
					onImplementationStart?.();
				});
			},
			dispose: () => {
				prepared.dispose();
				if (!started && state.mutationAttempt === "reserved") state.mutationAttempt = "available";
			}
		};
	});
	return tool;
}
function gateRecoveryTool(tool, state) {
	if (TOOL_SEARCH_CONTROL_TOOL_NAMES.has(normalizeToolPolicyName(tool.name))) return tool;
	return gatePreparedRecoveryTool(tool, state, getInternalToolExecutionPreparer(tool) ?? (async (params) => createReadyToolExecution(tool, params)), getPluginToolSideEffectOwnerKey(tool));
}
function applyCodeModeRecoveryPreparedToolSurface(params) {
	return params.tools.map((tool) => {
		const preparer = getInternalToolExecutionPreparer(tool);
		if (!preparer) throw new Error(`Code Mode recovery tool ${tool.name} has no execution preparer`);
		return gatePreparedRecoveryTool(tool, params.state, preparer);
	});
}
function createRecoveryResumeTool(state) {
	return {
		name: CODE_MODE_RECOVERY_RESUME_TOOL_NAME,
		label: "Resume recovery",
		description: "After a completed read, end inspection and start one bounded recovery with the normal tool surface.",
		parameters: Type.Object({}, { additionalProperties: false }),
		executionMode: "sequential",
		execute: async () => {
			if (state.phase !== "ready") throw new ToolInputError("Use read by itself and wait for its result before resuming.");
			return {
				...textResult("Read-only inspection completed; bounded recovery requested.", { status: "ok" }),
				terminate: true
			};
		}
	};
}
function gateInspectionRead(tool, state) {
	const originalPreparer = getInternalToolExecutionPreparer(tool);
	attachInternalToolExecutionPreparer(tool, async (params) => {
		const prepared = originalPreparer ? await originalPreparer(params) : createReadyToolExecution(tool, params);
		if (prepared.kind === "immediate") return prepared;
		return {
			...prepared,
			execute: async (onImplementationStart) => {
				const result = await prepared.execute(onImplementationStart);
				if (!isToolResultError(result)) state.phase = "ready";
				return result;
			}
		};
	});
	tool.executionMode = "sequential";
	return tool;
}
function applyCodeModeRecoveryToolSurface(params) {
	const state = params.state;
	if (state.kind === "inspect") {
		const read = params.tools.find((tool) => normalizeToolPolicyName(tool.name) === "read");
		return [...read ? [gateInspectionRead(read, state)] : [], ...state.blockedActionKeys ? [createRecoveryResumeTool(state)] : []];
	}
	return params.tools.map((tool) => gateRecoveryTool(tool, state));
}
function buildCodeModeRecoveryCandidate(params) {
	const calls = params.nestedToolActivities.filter((activity) => activity.details.parentToolCallId === params.parentToolCallId);
	const journal = calls.map(readCodeModeRecoveryJournalEntry);
	if (calls.length === 0 || journal.some((entry) => entry === void 0)) return {};
	return { blockedActionKeys: [...new Set(journal.flatMap((entry) => entry && !toolEffectStateProvesNoEffect(entry.effectState) ? [entry.actionKey] : []))] };
}
function isQuiescentRecoveryAttempt(params) {
	const { attempt } = params;
	return attempt.terminal.kind === "ok" && params.hostOwnsToolSurface && attempt.itemLifecycle.activeCount === 0 && attempt.itemLifecycle.startedCount === attempt.itemLifecycle.completedCount && !attempt.clientToolCalls && !attempt.yieldDetected && !attempt.didSendDeterministicApprovalPrompt && !attempt.runtimeContinuationStarted && !attempt.toolMetas.some((entry) => entry.asyncStarted === true) && (attempt.acceptedSessionSpawns?.length ?? 0) === 0 && !attempt.didSendViaMessagingTool && (attempt.successfulCronAdds ?? 0) === 0;
}
function hasSuccessfulInspectionRead(attempt) {
	return attempt.toolMetas.some((entry) => normalizeToolPolicyName(entry.toolName) === "read" && entry.isError !== true && entry.terminate !== true && entry.asyncStarted !== true);
}
function hasSuccessfulResumeRequest(attempt) {
	return attempt.toolMetas.some((entry) => normalizeToolPolicyName(entry.toolName) === CODE_MODE_RECOVERY_RESUME_TOOL_NAME && entry.isError !== true && entry.terminate === true);
}
function advanceCodeModeRecovery(params) {
	const state = params.retryState.codeModeRecovery;
	if (state.kind === "idle") {
		const candidate = params.attempt.codeModeRecoveryCandidate;
		if (!candidate || !isQuiescentRecoveryAttempt(params)) return false;
		params.retryState.codeModeRecovery = {
			kind: "inspect",
			phase: "read-required",
			...candidate.blockedActionKeys ? { blockedActionKeys: candidate.blockedActionKeys } : {}
		};
		params.activateInternalPrompt(reconciliationPrompt(Boolean(candidate.blockedActionKeys)));
		return true;
	}
	if (state.kind === "inspect") {
		const resume = state.blockedActionKeys && isQuiescentRecoveryAttempt(params) && hasSuccessfulInspectionRead(params.attempt) && hasSuccessfulResumeRequest(params.attempt);
		params.retryState.codeModeRecovery = resume ? {
			kind: "resume",
			blockedActionKeys: new Set(state.blockedActionKeys),
			mutationAttempt: "available"
		} : { kind: "idle" };
		if (!resume) return false;
		params.activateInternalPrompt(CODE_MODE_POST_RECONCILIATION_INSTRUCTION);
		return true;
	}
	params.retryState.codeModeRecovery = { kind: "idle" };
	return false;
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-client-tools.ts
function prepareEmbeddedAttemptClientTools(params) {
	const clientToolCallSlots = [];
	const clientToolCallSlotIndexes = /* @__PURE__ */ new Map();
	const reserveClientToolCallSlot = (toolCallId, toolName) => {
		if (clientToolCallSlotIndexes.has(toolCallId)) return;
		clientToolCallSlotIndexes.set(toolCallId, clientToolCallSlots.length);
		clientToolCallSlots.push({
			toolCallId,
			name: toolName,
			completed: false
		});
	};
	const clientToolLoopDetection = resolveToolLoopDetectionConfig({
		cfg: params.attempt.config,
		agentId: params.sessionAgentId
	});
	const sourceClientToolDefs = params.clientTools ? toClientToolDefinitions(params.clientTools, {
		reserve: reserveClientToolCallSlot,
		complete: (toolCallId, toolName, toolParams) => {
			reserveClientToolCallSlot(toolCallId, toolName);
			const slotIndex = clientToolCallSlotIndexes.get(toolCallId);
			if (slotIndex === void 0) return;
			const slot = clientToolCallSlots[slotIndex];
			if (!slot) return;
			slot.name = toolName;
			slot.params = toolParams;
			slot.completed = true;
		},
		discard: (toolCallId) => {
			const slotIndex = clientToolCallSlotIndexes.get(toolCallId);
			if (slotIndex === void 0) return;
			const slot = clientToolCallSlots[slotIndex];
			if (slot) {
				slot.completed = false;
				slot.params = void 0;
			}
		}
	}, {
		agentId: params.sessionAgentId,
		sessionKey: params.sandboxSessionKey,
		config: params.toolSearchRuntimeConfig,
		sessionId: params.attempt.sessionId,
		runId: params.attempt.runId,
		loopDetection: clientToolLoopDetection,
		onToolOutcome: params.attempt.onToolOutcome,
		allocateToolOutcomeOrdinal: params.attempt.allocateToolOutcomeOrdinal
	}) : [];
	const buildSurface = () => {
		const builtinToolNames = new Set(params.uncompactedEffectiveTools.flatMap((tool) => {
			const name = (tool.name ?? "").trim();
			return name ? [name] : [];
		}));
		const coreBuiltinToolNames = collectCoreBuiltinToolNames(params.uncompactedEffectiveTools, { isPluginTool: (tool) => Boolean(getPluginToolMeta(tool)) });
		const coreReadAuthorized = params.uncompactedEffectiveTools.some((tool) => normalizeToolPolicyName(tool.name ?? "") === "read" && !getPluginToolMeta(tool) && !getChannelAgentToolMeta(tool));
		const isReplaySafeTool = (tool) => isAgentToolReplaySafe(tool, params.replaySafetyOptions);
		const replaySafeTools = new Set(params.uncompactedEffectiveTools.filter(isReplaySafeTool));
		const replaySafeToolNames = collectReplaySafeToolNames(params.uncompactedEffectiveTools, params.replaySafetyOptions);
		const codeModeExecToolNames = new Set(params.effectiveTools.filter((tool) => isCodeModeExecTool(tool)).map((tool) => tool.name));
		const clientConflictToolNames = params.deferredDirectoryToolsCallable ? builtinToolNames : coreBuiltinToolNames;
		const clientToolNameConflicts = findClientToolNameConflicts({
			tools: params.clientTools ?? [],
			existingToolNames: [...clientConflictToolNames, ...AGENT_RESERVED_TOOL_NAMES]
		});
		if (clientToolNameConflicts.length > 0) throw createClientToolNameConflictError(clientToolNameConflicts);
		let clientToolDefs = sourceClientToolDefs.map((definition) => createToolDefinitionFromAgentTool(wrapToolWithAbortSignal(wrapToolDefinition(definition), params.getToolAbortSignal?.())));
		if (params.attempt.codeModeRecovery?.kind === "resume") clientToolDefs = applyCodeModeRecoveryPreparedToolSurface({
			tools: clientToolDefs,
			state: params.attempt.codeModeRecovery
		});
		const sideEffectToolOwners = collectSideEffectToolOwners([...params.uncompactedEffectiveTools, ...clientToolDefs], { declaredOwner: (tool) => getPluginToolSideEffectOwnerKey(tool) });
		const clientToolSearch = (params.codeModeControlsEnabledForRun ? addClientToolsToCodeModeCatalog : addClientToolsToToolSearchCatalog)({
			tools: clientToolDefs,
			config: params.codeModeControlsEnabledForRun ? params.attempt.config : params.toolSearchRuntimeConfig,
			sessionId: params.attempt.sessionId,
			sessionKey: params.sandboxSessionKey,
			agentId: params.sessionAgentId,
			runId: params.attempt.runId,
			catalogRef: params.toolSearchCatalogRef
		});
		clientToolDefs = clientToolSearch.tools;
		if (clientToolSearch.compacted) log$5.info(params.codeModeControlsEnabledForRun ? `code-mode: cataloged ${clientToolSearch.catalogToolCount} client tools behind exec/wait` : `tool-search: cataloged ${clientToolSearch.catalogToolCount} client tools behind compact prompt surface`);
		const { customTools } = splitSdkTools({
			tools: params.effectiveTools,
			sandboxEnabled: params.sandboxEnabled,
			toolHookContext: params.catalogToolHookContext,
			abortSignal: params.getToolAbortSignal?.()
		});
		const allCustomTools = [...customTools, ...clientToolDefs];
		const sessionToolAllowlist = toSessionToolAllowlist(collectRegisteredToolNames(allCustomTools));
		return {
			allCustomTools,
			builtinToolNames,
			coreBuiltinToolNames,
			coreReadAuthorized,
			clientToolCallSlots,
			clientToolDefs,
			replaySafeToolNames,
			replaySafeTools,
			codeModeExecToolNames,
			sideEffectToolOwners,
			sessionToolAllowlist
		};
	};
	const current = buildSurface();
	return {
		...current,
		refreshTools: () => {
			const next = buildSurface();
			current.allCustomTools.splice(0, current.allCustomTools.length, ...next.allCustomTools);
			current.clientToolDefs.splice(0, current.clientToolDefs.length, ...next.clientToolDefs);
			current.sessionToolAllowlist.splice(0, current.sessionToolAllowlist.length, ...next.sessionToolAllowlist);
			for (const key of [
				"builtinToolNames",
				"coreBuiltinToolNames",
				"replaySafeToolNames",
				"codeModeExecToolNames"
			]) {
				current[key].clear();
				for (const name of next[key]) current[key].add(name);
			}
			current.replaySafeTools.clear();
			for (const tool of next.replaySafeTools) current.replaySafeTools.add(tool);
			current.sideEffectToolOwners.clear();
			for (const [name, owner] of next.sideEffectToolOwners) current.sideEffectToolOwners.set(name, owner);
		}
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/message-merge-strategy.ts
/**
* Reconciles orphaned trailing user prompts before provider submission.
*/
const defaultMessageMergeStrategy = {
	id: "orphan-trailing-user-prompt",
	mergeOrphanedTrailingUserPrompt
};
/** Returns the transcript merge strategy used by embedded attempts. */
function resolveMessageMergeStrategy() {
	return defaultMessageMergeStrategy;
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-orphan-repair.ts
function findTrailingMessageEntryForOrphanRepair(sessionManager) {
	const visited = /* @__PURE__ */ new Set();
	const trailingEntries = [];
	let entry = sessionManager.getLeafEntry();
	while (entry && isSessionContextMetadataEntry(entry)) {
		if (visited.has(entry.id)) return;
		visited.add(entry.id);
		trailingEntries.push(entry);
		entry = entry.parentId ? sessionManager.getEntry(entry.parentId) : void 0;
	}
	return entry?.type === "message" ? {
		messageEntry: entry,
		trailingEntries: trailingEntries.toReversed()
	} : void 0;
}
function appendTrailingEntryForOrphanRepair(sessionManager, entry, replayedEntryIds) {
	if (entry.type === "thinking_level_change") {
		replayedEntryIds.set(entry.id, sessionManager.appendThinkingLevelChange(entry.thinkingLevel));
		return;
	}
	if (entry.type === "model_change") {
		replayedEntryIds.set(entry.id, sessionManager.appendModelChange(entry.provider, entry.modelId));
		return;
	}
	if (entry.type === "custom") {
		replayedEntryIds.set(entry.id, sessionManager.appendCustomEntry(entry.customType, entry.data));
		return;
	}
	if (entry.type === "session_info") {
		replayedEntryIds.set(entry.id, sessionManager.appendSessionInfo(entry.name ?? ""));
		return;
	}
	if (entry.type === "label") {
		const replayedTargetId = replayedEntryIds.get(entry.targetId);
		if (!replayedTargetId && !sessionManager.getEntry(entry.targetId)) return;
		const targetId = replayedTargetId ?? entry.targetId;
		replayedEntryIds.set(entry.id, sessionManager.appendLabelChange(targetId, entry.label));
	}
}
function replayTrailingEntriesForOrphanRepair(sessionManager, trailingEntries) {
	const replayedEntryIds = /* @__PURE__ */ new Map();
	for (const entry of trailingEntries) appendTrailingEntryForOrphanRepair(sessionManager, entry, replayedEntryIds);
}
function isUserSessionMessageEntry(entry) {
	return entry.message.role === "user";
}
function resolveOrphanRepairPlan(params) {
	const candidate = findTrailingMessageEntryForOrphanRepair(params.sessionManager);
	if (!candidate || !isUserSessionMessageEntry(candidate.messageEntry)) return;
	const strategy = resolveMessageMergeStrategy();
	const merge = strategy.mergeOrphanedTrailingUserPrompt({
		prompt: params.prompt,
		trigger: params.trigger,
		leafMessage: candidate.messageEntry.message
	});
	return {
		contextEnginePrompt: merge.prompt,
		messageEntry: candidate.messageEntry,
		trailingEntries: candidate.trailingEntries,
		strategy,
		removeLeaf: merge.removeLeaf || !params.preserveLeaf
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-user-transcript-context-registry.ts
/** Retains attempt-local runtime-to-transcript pairs across queued user turns. */
function createUserTranscriptContextRegistry() {
	const contexts = [];
	const upsert = (runtimeMessage, transcriptMessage) => {
		const context = {
			runtimeMessage,
			transcriptMessage
		};
		const existingIndex = contexts.findIndex((candidate) => candidate.runtimeMessage === runtimeMessage);
		if (existingIndex === -1) contexts.push(context);
		else contexts[existingIndex] = context;
	};
	return {
		clear: () => {
			contexts.length = 0;
		},
		list: (latestRuntimeMessage, latestTranscriptMessage) => {
			if (latestRuntimeMessage && latestTranscriptMessage) upsert(latestRuntimeMessage, latestTranscriptMessage);
			return contexts;
		},
		record: upsert
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/code-mode-outcome.ts
/** Preserve the model's ordinary error recovery without replaying uncertain mutations. */
function installCodeModeOutcomeHook(params) {
	const previousAfterToolOutcome = params.agent.afterToolOutcome?.bind(params.agent);
	params.agent.afterToolOutcome = async (context, signal) => {
		const isCodeModeExec = context.toolCall.name === CODE_MODE_EXEC_TOOL_NAME;
		const isCodeModeWait = context.toolCall.name === CODE_MODE_WAIT_TOOL_NAME;
		if (!isCodeModeExec && !isCodeModeWait) return await previousAfterToolOutcome?.(context, signal);
		const details = readToolResultDetails(context.result);
		const repairableFailure = consumeRepairableCodeModeFailure(details);
		const permissionChanged = consumeCodeModePermissionChangeResult(details);
		let prior;
		try {
			prior = await previousAfterToolOutcome?.(context, signal);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				content: [{
					type: "text",
					text: `Code Mode outcome hook failed: ${message}`
				}],
				details: {
					...details,
					status: "failed",
					error: message
				},
				isError: true,
				terminate: true
			};
		}
		if (context.result.terminate === true || prior?.terminate === true) return {
			...prior,
			terminate: true
		};
		if (signal?.aborted && !context.executionStarted) return prior;
		if (details?.status === "blocked" && details.deniedReason === "tool-loop" || details?.status === "skipped" && details.deniedReason === "steering") return prior;
		if (!(context.isError || details?.status === "failed" || prior?.isError === true)) return prior;
		const bridgeStarted = details?.bridgeDispatchStarted === true;
		const dispatchUnknown = context.executionStarted && typeof details?.bridgeDispatchStarted !== "boolean";
		const unsafeToContinue = (!permissionChanged || signal?.aborted === true) && (isCodeModeWait || bridgeStarted || dispatchUnknown) && !repairableFailure;
		if (unsafeToContinue && isCodeModeExec && context.assistantMessage.content.filter((entry) => entry.type === "toolCall").length === 1) params.onReconciliationCandidate?.(context.toolCall.id);
		return {
			...prior,
			content: context.result.content,
			details: context.result.details,
			isError: true,
			...unsafeToContinue ? { terminate: true } : {}
		};
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/message-tool-terminal.ts
function argsRecordForToolCall(context) {
	if (context.args && typeof context.args === "object" && !Array.isArray(context.args)) return context.args;
	const fallbackArgs = context.toolCall.arguments;
	return fallbackArgs && typeof fallbackArgs === "object" && !Array.isArray(fallbackArgs) ? fallbackArgs : {};
}
/** Detects message-tool-only sends that delivered a visible current-source reply. */
function isDeliveredMessageToolOnlySourceReply(params) {
	const toolName = params.context.toolCall.name;
	const toolArgs = argsRecordForToolCall(params.context);
	const extractionArgs = toolName === "message" && params.currentProvider && typeof toolArgs.provider !== "string" && typeof toolArgs.channel !== "string" ? {
		...toolArgs,
		provider: params.currentProvider
	} : toolArgs;
	const pendingSend = extractMessagingToolSend(toolName, extractionArgs, {
		config: params.config,
		currentChannelId: params.currentChannelId,
		currentMessagingTarget: params.currentMessagingTarget,
		currentThreadId: params.currentThreadId,
		currentMessageId: params.currentMessageId,
		replyToMode: params.replyToMode,
		hasRepliedRef: params.hasRepliedRef
	});
	const confirmedSend = pendingSend && extractMessagingToolSendResult(pendingSend, params.context.result);
	const deliveryFact = readEmbeddedMessageDeliveryFact(readToolResultDetails(params.context.result)?.messageDelivery);
	const isError = params.hookResult?.isError ?? params.context.isError;
	return isDeliveredMessageToolOnlySourceReplyResult({
		sourceReplyDeliveryMode: params.sourceReplyDeliveryMode,
		toolName,
		args: toolArgs,
		result: params.context.result,
		hookResult: params.hookResult,
		isError,
		allowExplicitSourceRoute: isDeliveredMessagingToolSendToCurrentSource({
			send: confirmedSend,
			config: params.config,
			currentProvider: params.currentProvider,
			currentAccountId: params.currentAccountId,
			currentChannelId: params.currentChannelId,
			currentMessagingTarget: params.currentMessagingTarget,
			currentThreadId: params.currentThreadId,
			sessionKey: params.sessionKey,
			deliveredPayload: params.context.result
		}),
		...deliveryFact ? { deliveryConfirmed: deliveryFact.status === "settled" && (!isError || deliveryFact.partialDelivery) } : {}
	});
}
function installMessageToolOnlyTerminalHook(params) {
	if (params.sourceReplyDeliveryMode !== "message_tool_only") return;
	const previousAfterToolCall = params.agent.afterToolCall?.bind(params.agent);
	params.agent.afterToolCall = async (context, signal) => {
		const hookResult = await previousAfterToolCall?.(context, signal);
		if (isDeliveredMessageToolOnlySourceReply({
			...params,
			context,
			hookResult
		})) {
			params.onDeliveredSourceReply?.();
			if (resolveMessageToolSourceReplyFinal(argsRecordForToolCall(context))) return {
				...hookResult,
				terminate: true
			};
		}
		return hookResult;
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/session-boundary-prompt-cache-key.ts
function resolveSessionBoundaryPromptCacheKey(params) {
	const explicit = params.promptCacheKey?.trim();
	if (explicit) return explicit;
	if (!(params.api === "openai-completions" || params.api === "openai-responses" || params.api.includes("openai"))) return;
	const suffix = `:${params.boundaryCount}`;
	const maxSessionIdLength = OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH - suffix.length;
	return `${Array.from(params.sessionId).slice(0, maxSessionIdLength).join("")}${suffix}`;
}
//#endregion
//#region src/agents/embedded-agent-runner/run/tool-loop-recovery.ts
/** Build the embedded-runner's private bridge into agent-core loop recovery. */
function createToolLoopBatchAdmission(ctx, codeModeRecovery) {
	const loopDetectionEnabled = ctx.loopDetection?.enabled === true;
	if (!loopDetectionEnabled && codeModeRecovery?.kind !== "inspect") return;
	return async ({ calls }) => {
		const canonicalCalls = calls.map((call) => ({
			...call,
			args: call.tool ? normalizeCodeModeExecBeforeHookParams({
				tool: call.tool,
				params: call.args
			}) : call.args
		}));
		try {
			if (codeModeRecovery?.kind === "inspect" && codeModeRecovery.phase === "read-required") {
				const resumeCall = canonicalCalls.find((call) => isCodeModeRecoveryResumeTool(call.toolCall));
				if (resumeCall) return { intervention: {
					kind: "critical-tool-loop",
					toolCallId: resumeCall.toolCall.id,
					toolName: resumeCall.toolCall.name,
					actionKey: hashToolCall(resumeCall.toolCall.name, resumeCall.args),
					detector: "loop_admission_failure",
					count: 1,
					reason: "Use read by itself and wait for its result before resuming."
				} };
			}
			const { commitReadyCalls, releaseSkippedCalls, ...result } = loopDetectionEnabled ? await admitToolCallBatch(canonicalCalls, ctx) : {};
			return commitReadyCalls && releaseSkippedCalls ? attachInternalToolBatchLifecycle(result, {
				commitReadyCalls,
				releaseSkippedCalls
			}) : result;
		} catch (error) {
			const first = canonicalCalls[0];
			log$5.error(`tool-loop batch admission failed: ${String(error)}`);
			return first ? { intervention: {
				kind: "critical-tool-loop",
				toolCallId: first.toolCall.id,
				toolName: first.toolCall.name,
				actionKey: hashToolCall(first.toolCall.name, first.args),
				detector: "loop_admission_failure",
				count: 1,
				reason: "Tool execution was blocked because loop safety checks failed."
			} } : void 0;
		}
	};
}
/** Ensure calls blocked by later policies cannot leave run-scoped admission markers behind. */
function installToolLoopRecoveryCleanup(params) {
	params.agent.subscribe((event) => {
		if (event.type === "agent_end") clearBatchAdmittedToolCallsForRun(params.runId);
	});
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-session-prepare.ts
/** Prepares resource loading, client tools, and the active agent session. */
async function prepareEmbeddedAttemptAgentSession(input) {
	const { attempt } = input;
	const settingsManager = createPreparedEmbeddedAgentSettingsManager({
		cwd: input.effectiveCwd,
		agentDir: input.agentDir,
		cfg: attempt.config,
		pluginMetadataSnapshot: input.getCurrentAttemptPluginMetadataSnapshot(),
		contextTokenBudget: attempt.contextTokenBudget
	});
	const autoCompactionGuardArgs = {
		settingsManager,
		contextEngineInfo: input.activeContextEngineInfo,
		compactionMode: resolveEffectiveCompactionMode(attempt.config),
		silentOverflowProneProvider: isSilentOverflowProneModel({
			provider: attempt.provider,
			modelId: attempt.modelId,
			baseUrl: attempt.model.baseUrl ?? void 0
		})
	};
	applyAgentAutoCompactionGuard(autoCompactionGuardArgs);
	const extensionFactories = buildEmbeddedExtensionFactories({
		cfg: attempt.config,
		sessionManager: input.sessionManager,
		provider: attempt.provider,
		modelId: attempt.modelId,
		model: attempt.model,
		contextTokenBudget: attempt.contextTokenBudget,
		agentId: input.sessionAgentId,
		sessionId: attempt.sessionId,
		sessionKey: attempt.sessionKey ?? attempt.sandboxSessionKey,
		runId: attempt.runId
	});
	const resourceLoader = createEmbeddedAgentResourceLoader({
		cwd: input.effectiveCwd,
		agentDir: input.agentDir,
		settingsManager,
		extensionFactories
	});
	await resourceLoader.reload();
	applyAgentCompactionSettingsFromConfig({
		settingsManager,
		cfg: attempt.config,
		contextTokenBudget: attempt.contextTokenBudget
	});
	applyAgentAutoCompactionGuard(autoCompactionGuardArgs);
	input.markStage("session-resource-loader");
	const hookRunner = getGlobalHookRunner();
	const preparedClientTools = prepareEmbeddedAttemptClientTools({
		attempt,
		...input.clientToolPreparation
	});
	const { allCustomTools, sessionToolAllowlist, ...clientToolRuntime } = preparedClientTools;
	const sessionOptions = {
		cwd: input.effectiveCwd,
		agentDir: input.agentDir,
		authStorage: attempt.authStorage,
		modelRegistry: attempt.modelRegistry,
		model: attempt.model,
		thinkingLevel: input.agentCoreThinkingLevel,
		tools: sessionToolAllowlist,
		customTools: allCustomTools,
		sessionManager: input.sessionManager,
		settingsManager,
		resourceLoader,
		resolveDeferredTool: input.clientToolPreparation.deferredDirectoryToolsCallable ? ({ toolCall }) => {
			const toolAbortSignal = input.clientToolPreparation.getToolAbortSignal?.() ?? input.runAbortSignal;
			const tool = resolveToolSearchCatalogTool({
				config: attempt.config,
				runtimeConfig: attempt.config,
				agentId: input.sessionAgentId,
				sessionKey: input.clientToolPreparation.sandboxSessionKey,
				sessionId: attempt.sessionId,
				runId: attempt.runId,
				catalogRef: input.clientToolPreparation.toolSearchCatalogRef,
				abortSignal: toolAbortSignal
			}, toolCall.name);
			const definition = tool ? toToolDefinitions([tool], input.clientToolPreparation.catalogToolHookContext, toolAbortSignal)[0] : void 0;
			const hydratedTool = definition ? wrapToolDefinition(definition) : void 0;
			if (hydratedTool) {
				log$5.info(`tool-search: hydrated deferred directory tool ${toolCall.name}`);
				const originalExecute = hydratedTool.execute;
				hydratedTool.execute = (async (...args) => {
					const interval = setInterval(() => notifyToolActivity(attempt.runId), 6e4);
					interval.unref?.();
					try {
						notifyToolActivity(attempt.runId);
						return await originalExecute(...args);
					} finally {
						clearInterval(interval);
						notifyToolActivity(attempt.runId);
					}
				});
			}
			return hydratedTool;
		} : void 0,
		withSessionWriteSettlement: (operation) => input.transcriptLifecycle.withTranscriptWrite(operation)
	};
	const activeSession = (await createAgentSessionForEmbeddedRunner(sessionOptions, {
		contextOverflowRecoveryOwner: attempt.contextTokenBudget === void 0 ? "session" : "caller",
		beforeToolBatch: input.clientToolPreparation.catalogToolHookContext ? createToolLoopBatchAdmission(input.clientToolPreparation.catalogToolHookContext, attempt.codeModeRecovery) : void 0
	})).session;
	if (!activeSession) throw new Error("Embedded agent session missing");
	input.onSessionCreated(activeSession);
	installToolLoopRecoveryCleanup({
		agent: activeSession.agent,
		runId: attempt.runId
	});
	activeSession.setActiveToolsByName(sessionToolAllowlist);
	let permissionPreparation;
	const setActiveSessionSystemPrompt = (nextSystemPrompt) => {
		input.onSystemPromptChanged(nextSystemPrompt);
		applySystemPromptToSession(activeSession, nextSystemPrompt);
		return nextSystemPrompt;
	};
	const refreshPermissionPrompt = async (prompt, signal) => {
		const runSignal = signal ? AbortSignal.any([signal, input.runAbortSignal]) : input.runAbortSignal;
		while (true) {
			runSignal.throwIfAborted();
			const preparation = permissionPreparation;
			if (!preparation) return;
			let refresh;
			try {
				refresh = await raceWithAbortSignal(preparation.prepare(), AbortSignal.any([runSignal, preparation.controller.signal]));
			} catch (error) {
				runSignal.throwIfAborted();
				if (preparation !== permissionPreparation) continue;
				throw error;
			}
			runSignal.throwIfAborted();
			if (preparation !== permissionPreparation) continue;
			return setActiveSessionSystemPrompt(refresh(prompt ?? activeSession.agent.state.systemPrompt));
		}
	};
	activeSession[agentSessionSetPromptPreparation](async () => {
		await refreshPermissionPrompt();
	});
	const previousPrepareNextTurn = activeSession.agent.prepareNextTurn;
	activeSession.agent.prepareNextTurn = async (signal) => {
		const snapshot = await previousPrepareNextTurn?.call(activeSession.agent, signal);
		const refreshedPrompt = await refreshPermissionPrompt(snapshot?.context?.systemPrompt, signal);
		return snapshot?.context && refreshedPrompt !== void 0 ? {
			...snapshot,
			context: {
				...snapshot.context,
				systemPrompt: refreshedPrompt,
				tools: activeSession.agent.state.tools.slice()
			}
		} : snapshot;
	};
	setActiveSessionSystemPrompt(input.initialSystemPrompt);
	let didDeliverSourceReplyViaMessageTool = false;
	let codeModeRecoveryCandidate;
	let codeModeReconciliationReadAuthorized = false;
	const markSourceReplyDelivered = () => {
		didDeliverSourceReplyViaMessageTool = true;
	};
	installMessageToolOnlyTerminalHook({
		agent: activeSession.agent,
		sourceReplyDeliveryMode: attempt.sourceReplyDeliveryMode,
		onDeliveredSourceReply: markSourceReplyDelivered,
		config: attempt.config,
		currentProvider: attempt.messageChannel ?? attempt.messageProvider,
		currentAccountId: attempt.agentAccountId,
		currentChannelId: attempt.currentChannelId,
		currentMessagingTarget: attempt.currentMessagingTarget,
		currentThreadId: attempt.currentThreadTs,
		currentMessageId: attempt.currentMessageId,
		replyToMode: attempt.replyToMode,
		hasRepliedRef: attempt.hasRepliedRef,
		sessionKey: attempt.sessionKey
	});
	if (input.clientToolPreparation.codeModeControlsEnabledForRun) installCodeModeOutcomeHook({
		agent: activeSession.agent,
		onReconciliationCandidate: (parentToolCallId) => {
			if (codeModeReconciliationReadAuthorized) codeModeRecoveryCandidate = buildCodeModeRecoveryCandidate({
				parentToolCallId,
				nestedToolActivities: input.nestedToolActivities
			});
		}
	});
	input.markStage("agent-session");
	return {
		activeSession,
		allCustomTools,
		...clientToolRuntime,
		getCodeModeRecoveryCandidate: () => codeModeRecoveryCandidate,
		hasDeliveredSourceReply: () => didDeliverSourceReplyViaMessageTool,
		hookRunner,
		markSourceReplyDelivered,
		setCodeModeReconciliationReadAuthorized: (value) => {
			codeModeReconciliationReadAuthorized = clientToolRuntime.coreReadAuthorized && value;
		},
		setActiveSessionSystemPrompt,
		settingsManager,
		refreshTools: () => {
			const currentPrompt = activeSession.agent.state.systemPrompt;
			preparedClientTools.refreshTools();
			activeSession.replaceCustomTools(allCustomTools, sessionToolAllowlist);
			setActiveSessionSystemPrompt(currentPrompt);
		},
		setPermissionPromptPreparation: (prepare) => {
			const previous = permissionPreparation;
			permissionPreparation = prepare ? {
				prepare,
				controller: new AbortController()
			} : void 0;
			previous?.controller.abort();
		}
	};
}
async function prepareEmbeddedAttemptSessionBoundary(input) {
	const { activeSession, attempt, isRawModelRun, sessionManager } = input;
	const preserveExactPrompt = isRawModelRun || attempt.operation === "settled-tool-finalization";
	if (isRawModelRun) {
		activeSession.agent.reset();
		input.setActiveSessionSystemPrompt("");
	}
	const orphanRepairCandidate = preserveExactPrompt ? void 0 : resolveOrphanRepairPlan({
		sessionManager,
		prompt: attempt.prompt,
		preserveLeaf: isMainSessionRestartRecoveryInputProvenance(attempt.inputProvenance),
		trigger: attempt.trigger
	});
	const currentUserTurnMessage = attempt.userTurnTranscriptRecorder?.getPersistedMessage?.() ?? input.preparedUserTurnMessage;
	const orphanRepair = !preserveExactPrompt && reconcilePrePersistedCurrentUserTurn({
		activeSession,
		currentUserTurnMessage,
		durableUserTurnMessage: orphanRepairCandidate?.messageEntry.message,
		userTurnAlreadyPersisted: attempt.userTurnTranscriptRecorder?.hasPersisted() === true
	}) ? void 0 : orphanRepairCandidate;
	if (orphanRepair?.removeLeaf) {
		input.abortSignal?.throwIfAborted();
		if (orphanRepair.messageEntry.parentId) sessionManager.branch(orphanRepair.messageEntry.parentId);
		else sessionManager.resetLeaf();
		const target = sessionManager.getSessionTarget();
		if (target) sessionManager.appendLeafControl({
			targetId: sessionManager.getLeafId(),
			appendParentId: sessionManager.getAppendParentId()
		});
		replayTrailingEntriesForOrphanRepair(sessionManager, orphanRepair.trailingEntries);
		if (target) {
			const { waitForSessionTranscriptProjection } = await import("./session-transcript-reconcile-DFsDtc9l.js");
			await waitForSessionTranscriptProjection(target, input.abortSignal);
			input.abortSignal?.throwIfAborted();
		}
		sessionManager.clearNextUserMessagePersistenceSuppression?.();
		attempt.onUserMessagePersistenceInvalidated?.();
	}
	if (orphanRepair) {
		const repairedMessages = sanitizeCompactionReplayMessages(sessionManager.buildSessionContext().messages);
		activeSession.agent.state.messages = orphanRepair.removeLeaf ? repairedMessages : repairedMessages.slice(0, -1);
	}
	const boundaryTimezone = preserveExactPrompt ? void 0 : resolveUserTimezone(attempt.config?.agents?.defaults?.userTimezone);
	const includeBoundaryTimestamp = !preserveExactPrompt;
	let currentUserTimestampOverride;
	const buildBoundaryOptions = () => {
		if (preserveExactPrompt) return { projectPersistedSenderContext: false };
		const userTranscriptContexts = input.getUserTranscriptContexts();
		return {
			...boundaryTimezone ? { timezone: boundaryTimezone } : {},
			...includeBoundaryTimestamp ? {} : { includeTimestamp: false },
			...userTranscriptContexts?.length ? { userTranscriptContexts } : {},
			...currentUserTimestampOverride ? { currentUserTimestampOverride } : {}
		};
	};
	if (typeof activeSession.agent.convertToLlm === "function") {
		const baseConvertToLlm = activeSession.agent.convertToLlm.bind(activeSession.agent);
		activeSession.agent.convertToLlm = async (messages) => await baseConvertToLlm(relocateCurrentRuntimeContextCarrierToTail(normalizeMessagesForLlmBoundary(messages, buildBoundaryOptions())));
	}
	return {
		boundaryTimezone,
		includeBoundaryTimestamp,
		orphanRepair,
		setCurrentUserTimestampOverride: (override) => {
			currentUserTimestampOverride = override;
		}
	};
}
async function prepareEmbeddedAttemptSessionManager(input) {
	const { attempt } = input;
	const transcriptState = await resolveExistingAttemptTranscriptState({
		sessionManager: attempt.sessionManager,
		agentId: input.sessionAgentId,
		config: attempt.config,
		sessionFile: attempt.sessionFile,
		sessionId: attempt.sessionId,
		sessionKey: attempt.sessionKey,
		sessionTarget: attempt.sessionTarget
	});
	const transcriptPolicy = resolveAttemptTranscriptPolicy({
		runtimePlan: attempt.runtimePlan,
		runtimePlanModelContext: {
			workspaceDir: input.effectiveWorkspace,
			modelApi: attempt.model.api,
			model: attempt.model
		},
		provider: attempt.provider,
		modelId: attempt.modelId,
		config: attempt.config,
		env: process.env
	});
	const isOpenAIResponsesApi = attempt.model.api === "openai-responses" || attempt.model.api === "azure-openai-responses" || attempt.model.api === "openai-chatgpt-responses";
	const preparedUserTurnMessage = attempt.skipPreparedUserTurnMessage ? void 0 : await attempt.userTurnTranscriptRecorder?.resolveMessage();
	let latestPersistedUserMessage;
	let latestRuntimeUserMessage;
	let latestUserTurnTranscriptRecorder = attempt.userTurnTranscriptRecorder;
	const userTranscriptContextRegistry = createUserTranscriptContextRegistry();
	const sessionManager = guardSessionManager(attempt.sessionManager ?? (attempt.sessionTarget ? SessionManager.open(attempt.sessionTarget, input.effectiveCwd, {
		maxBytes: Math.min(67108864, Math.max(1024, (attempt.contextTokenBudget ?? 128e3) * 8)),
		maxEvents: 1e4
	}) : SessionManager.inMemory(input.effectiveCwd)), {
		agentId: input.sessionAgentId,
		runId: attempt.runId,
		sessionKey: attempt.sessionKey,
		config: attempt.config,
		contextWindowTokens: attempt.contextTokenBudget,
		inputProvenance: attempt.inputProvenance,
		preparedUserTurnMessage,
		preparedUserTurnTranscriptRecorder: preparedUserTurnMessage ? attempt.userTurnTranscriptRecorder : void 0,
		allowSyntheticToolResults: transcriptPolicy.allowSyntheticToolResults,
		missingToolResultText: isOpenAIResponsesApi ? "aborted" : void 0,
		allowedToolNames: input.replayAllowedToolNames,
		trigger: attempt.trigger,
		suppressNextUserMessagePersistence: attempt.suppressNextUserMessagePersistence,
		suppressTranscriptOnlyAssistantPersistence: attempt.suppressTranscriptOnlyAssistantPersistence,
		suppressAssistantErrorPersistence: attempt.suppressAssistantErrorPersistence,
		skipBeforeMessageWriteHooks: attempt.operation === "settled-tool-finalization",
		prepareAssistantTranscriptMessage: attempt.prepareAssistantTranscriptMessage,
		onUserMessagePreparingForPersistence: (_message, recorder) => {
			latestPersistedUserMessage = void 0;
			latestUserTurnTranscriptRecorder = recorder;
		},
		onUserMessagePersisted: (message, runtimeMessage) => {
			latestPersistedUserMessage = message;
			latestRuntimeUserMessage = runtimeMessage;
			if (runtimeMessage) {
				const media = readPersistedMediaFacts(message);
				if (media?.length) attachRuntimePromptMediaFacts(runtimeMessage, media);
				userTranscriptContextRegistry.record(runtimeMessage, message);
			}
			attempt.onUserMessagePersisted?.(message);
		},
		onUserMessagePersistenceSuppressed: (message, runtimeMessage) => {
			latestRuntimeUserMessage = runtimeMessage;
			const media = runtimeMessage ? readPersistedMediaFacts(message) : void 0;
			if (runtimeMessage && media?.length) attachRuntimePromptMediaFacts(runtimeMessage, media);
		},
		onUserMessageBlocked: () => {
			attempt.userTurnTranscriptRecorder?.markBlocked();
		},
		onAssistantErrorMessagePersisted: (message) => {
			attempt.onAssistantErrorMessagePersisted?.(message);
		}
	});
	attempt.promptCacheKey = resolveSessionBoundaryPromptCacheKey({
		api: attempt.model.api,
		boundaryCount: sessionManager.getBoundaryCount(),
		promptCacheKey: attempt.promptCacheKey,
		sessionId: attempt.sessionId
	});
	input.onSessionManagerCreated(sessionManager);
	await input.withOwnedTranscriptWrite(async () => {
		await bootstrapHarnessContextEngine({
			hadSessionFile: transcriptState.hasBootstrapTranscriptState,
			contextEngine: input.activeContextEngine,
			sessionId: attempt.sessionId,
			sessionKey: attempt.sessionKey,
			sessionTarget: attempt.sessionTarget,
			sessionFile: attempt.sessionFile,
			sessionManager,
			runtimeContext: buildAfterTurnRuntimeContext({
				attempt,
				workspaceDir: input.effectiveWorkspace,
				cwd: input.effectiveCwd,
				agentDir: input.agentDir,
				tokenBudget: attempt.contextTokenBudget,
				activeAgentId: input.sessionAgentId,
				contextEnginePluginId: input.resolveActiveContextEnginePluginId()
			}),
			contextEngineHostSupport: OPENCLAW_EMBEDDED_CONTEXT_ENGINE_HOST,
			providerId: attempt.provider,
			requestedModelId: attempt.requestedModelId,
			modelId: attempt.modelId,
			fallbackReason: attempt.fallbackReason,
			degradedReason: attempt.degradedReason,
			runMaintenance: async (contextParams) => await runContextEngineMaintenance({
				contextEngine: contextParams.contextEngine,
				sessionId: contextParams.sessionId,
				sessionKey: contextParams.sessionKey,
				sessionTarget: contextParams.sessionTarget,
				sessionFile: contextParams.sessionFile,
				reason: contextParams.reason,
				sessionManager: contextParams.sessionManager,
				runtimeContext: contextParams.runtimeContext,
				runtimeSettings: contextParams.runtimeSettings,
				config: attempt.config,
				agentId: input.sessionAgentId,
				contextEngineAgentId: attempt.contextEngineAgentId
			}),
			warn: (message) => log$5.warn(message)
		});
	});
	latestPersistedUserMessage = void 0;
	latestRuntimeUserMessage = void 0;
	userTranscriptContextRegistry.clear();
	return {
		userMessageBoundary: {
			getUserTranscriptContexts: () => {
				const transcriptMessage = latestPersistedUserMessage ?? latestUserTurnTranscriptRecorder?.getPersistedMessage?.();
				const runtimeMessage = latestRuntimeUserMessage ?? (attempt.suppressNextUserMessagePersistence ? transcriptMessage : void 0);
				return userTranscriptContextRegistry.list(runtimeMessage, transcriptMessage);
			},
			preparedUserTurnMessage
		},
		isOpenAIResponsesApi,
		preparedUserTurnMessage,
		sessionManager,
		transcriptPolicy
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-session-settle.ts
/**
* Tracks prompt and abort settlement, then finalizes session-owned resources.
* It may assume the active session and transcript lifecycle are established.
*/
/** Tracks native prompt and abort settlement through attempt cleanup. */
function createEmbeddedAttemptSessionSettleTracker(activeSession) {
	const inFlightPromptSettlePromises = /* @__PURE__ */ new Set();
	const inFlightAbortSettlePromises = /* @__PURE__ */ new Set();
	const trackSettlePromise = (promises, promise) => {
		promises.add(promise);
		promise.then(() => {
			promises.delete(promise);
		}, () => {
			promises.delete(promise);
		});
		return promise;
	};
	const trackPromptSettlePromise = (promise) => trackSettlePromise(inFlightPromptSettlePromises, promise);
	const abortActiveSession = (reason) => trackSettlePromise(inFlightAbortSettlePromises, Promise.resolve(activeSession.abort(reason)));
	const buildAbortSettlePromise = () => {
		const promises = [...inFlightPromptSettlePromises, ...inFlightAbortSettlePromises];
		return promises.length === 0 ? null : Promise.allSettled(promises).then(() => void 0);
	};
	return {
		abortActiveSession,
		buildAbortSettlePromise,
		trackPromptSettlePromise
	};
}
async function cleanupEmbeddedAttemptSessionPhase(input) {
	const { attempt } = input;
	const initialState = input.readState();
	if (input.trajectoryRecorder && !input.trajectoryEndRecorded) {
		const sessionEndData = {
			status: initialState.promptError ? "error" : initialState.aborted || initialState.timedOut ? "interrupted" : "cleanup",
			aborted: initialState.aborted,
			externalAbort: initialState.externalAbort,
			timedOut: initialState.timedOut,
			idleTimedOut: initialState.idleTimedOut,
			timedOutDuringCompaction: initialState.timedOutDuringCompaction,
			timedOutDuringToolExecution: initialState.timedOutDuringToolExecution,
			timedOutByRunBudget: initialState.timedOutByRunBudget,
			promptError: initialState.promptError ? formatErrorMessage(initialState.promptError) : void 0
		};
		if (input.deferredLifecycleOwner) input.deferredLifecycleOwner.recordSessionEnd(sessionEndData);
		else input.trajectoryRecorder.recordEvent("session.ended", sessionEndData);
	}
	await flushEmbeddedAttemptTrajectoryRecorder({
		runId: attempt.runId,
		sessionId: attempt.sessionId,
		log: log$5,
		trajectoryRecorder: input.trajectoryRecorder
	});
	let cleanupError;
	try {
		clearToolSearchCatalog({
			sessionId: attempt.sessionId,
			sessionKey: input.sandboxSessionKey,
			agentId: input.sessionAgentId,
			runId: attempt.runId,
			catalogRef: input.toolSearchCatalogRef
		});
		const cleanupState = input.readState();
		const cleanupAborted = Boolean(attempt.abortSignal?.aborted) || cleanupState.aborted || cleanupState.timedOut || cleanupState.idleTimedOut || cleanupState.timedOutDuringCompaction;
		const cleanupAbortLike = cleanupAborted || input.cleanupYieldAborted;
		await input.transcriptLifecycle.beginCleanup();
		await cleanupEmbeddedAttemptResources({
			removeToolResultContextGuard: input.removeToolResultContextGuard,
			flushPendingToolResultsAfterIdle,
			session: input.session,
			sessionManager: input.sessionManager,
			bundleMcpRuntime: input.bundleMcpRuntime,
			bundleLspRuntime: input.bundleLspRuntime,
			aborted: cleanupAbortLike,
			abortSettlePromise: cleanupAborted ? input.buildAbortSettlePromise() : null,
			runId: attempt.runId,
			sessionId: attempt.sessionId
		});
	} catch (err) {
		cleanupError = err;
	} finally {
		try {
			await input.transcriptLifecycle.dispose();
		} catch (err) {
			cleanupError ??= err;
		}
	}
	const finalState = input.readState();
	const cleanupFailure = cleanupError;
	const beforeAgentRunBlocked = finalState.beforeAgentRunBlockedBy !== void 0;
	const diagnosticTerminalAborted = finalState.aborted || finalState.timedOut || finalState.idleTimedOut;
	input.emitDiagnosticRunCompleted?.(cleanupFailure ? "error" : beforeAgentRunBlocked ? "blocked" : finalState.promptError ? "error" : diagnosticTerminalAborted ? "aborted" : "completed", cleanupFailure ?? finalState.promptError, beforeAgentRunBlocked ? { blockedBy: finalState.beforeAgentRunBlockedBy } : void 0);
	if (!cleanupFailure) return;
	await Promise.reject(toErrorObject(cleanupFailure, "Non-Error rejection"));
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-trajectory.ts
async function prepareEmbeddedAttemptTrajectory(input) {
	const { activeSession, attempt } = input;
	const trajectorySessionFile = await resolveAttemptTrajectorySessionFile({
		agentId: input.sessionAgentId,
		config: attempt.config,
		sessionFile: attempt.sessionFile,
		sessionId: activeSession.sessionId,
		sessionKey: attempt.sessionKey,
		sessionTarget: attempt.sessionTarget
	});
	if (attempt.disableTrajectory || attempt.sessionPersistence === "detached") return null;
	const sessionTarget = attempt.sessionTarget?.agentId && attempt.sessionTarget.sessionId && attempt.sessionTarget.sessionKey && attempt.sessionTarget.storePath ? {
		agentId: attempt.sessionTarget.agentId,
		sessionId: attempt.sessionTarget.sessionId,
		sessionKey: attempt.sessionTarget.sessionKey,
		storePath: attempt.sessionTarget.storePath
	} : void 0;
	const recorder = createTrajectoryRuntimeRecorder({
		cfg: attempt.config,
		env: process.env,
		runId: attempt.runId,
		sessionId: activeSession.sessionId,
		sessionKey: attempt.sessionKey,
		sessionFile: trajectorySessionFile,
		sessionTarget,
		provider: attempt.provider,
		modelId: attempt.modelId,
		modelApi: attempt.model.api,
		workspaceDir: attempt.workspaceDir
	});
	recorder?.recordEvent("session.started", {
		trigger: attempt.trigger,
		sessionFile: attempt.sessionFile,
		workspaceDir: input.effectiveWorkspace,
		agentId: input.sessionAgentId,
		messageProvider: attempt.messageProvider,
		messageChannel: attempt.messageChannel,
		localModelLean: input.localModelLeanEnabled,
		toolCount: input.effectiveToolCount,
		clientToolCount: input.clientToolCount
	});
	const fastMode = typeof attempt.fastMode === "boolean" ? attempt.fastMode : void 0;
	recorder?.recordEvent("trace.metadata", buildTrajectoryRunMetadata({
		env: process.env,
		config: attempt.config,
		...attempt.preparedModelRuntime?.metadataSnapshot ? { pluginMetadataSnapshot: attempt.preparedModelRuntime.metadataSnapshot } : {},
		workspaceDir: input.effectiveWorkspace,
		sessionFile: attempt.sessionFile,
		sessionKey: attempt.sessionKey,
		agentId: input.sessionAgentId,
		trigger: attempt.trigger,
		messageProvider: attempt.messageProvider,
		messageChannel: attempt.messageChannel,
		provider: attempt.provider,
		modelId: attempt.modelId,
		modelApi: attempt.model.api,
		timeoutMs: attempt.timeoutMs,
		fastMode,
		thinkLevel: attempt.thinkLevel,
		reasoningLevel: attempt.reasoningLevel,
		toolResultFormat: attempt.toolResultFormat,
		disableTools: attempt.disableTools,
		toolsAllow: attempt.toolsAllow,
		skillsSnapshot: attempt.skillsSnapshot,
		systemPromptReport: input.systemPromptReport
	}));
	return recorder;
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-session-runtime-prepare.ts
/** Prepares the session-owned runtime used by one embedded attempt. */
async function prepareEmbeddedAttemptSessionRuntime(input) {
	const { attempt } = input;
	const preparedSessionManager = await prepareEmbeddedAttemptSessionManager({
		attempt,
		...input.activeContextEngine ? { activeContextEngine: input.activeContextEngine } : {},
		agentDir: input.agentDir,
		effectiveCwd: input.effectiveCwd,
		effectiveWorkspace: input.effectiveWorkspace,
		onSessionManagerCreated: input.lifecycle.onSessionManagerCreated,
		replayAllowedToolNames: input.sessionManager.replayAllowedToolNames,
		resolveActiveContextEnginePluginId: input.sessionManager.resolveActiveContextEnginePluginId,
		sessionAgentId: input.sessionManager.sessionAgentId,
		transcriptLifecycle: input.sessionManager.transcriptLifecycle,
		withOwnedTranscriptWrite: input.sessionManager.withOwnedTranscriptWrite
	});
	const { isOpenAIResponsesApi, preparedUserTurnMessage, sessionManager, transcriptPolicy } = preparedSessionManager;
	const state = {
		currentTurnImageFailureCount: 0,
		prePromptMessageCount: 0,
		promptCache: void 0,
		systemPromptText: input.initialSystemPrompt
	};
	const preparedAgentSession = await prepareEmbeddedAttemptAgentSession({
		attempt,
		...input.activeContextEngine ? { activeContextEngineInfo: input.activeContextEngine.info } : {},
		agentCoreThinkingLevel: input.agentSession.agentCoreThinkingLevel,
		agentDir: input.agentDir,
		clientToolPreparation: input.agentSession.clientToolPreparation,
		effectiveCwd: input.effectiveCwd,
		getCurrentAttemptPluginMetadataSnapshot: input.agentSession.getCurrentAttemptPluginMetadataSnapshot,
		initialSystemPrompt: state.systemPromptText,
		markStage: input.agentSession.markStage,
		onSessionCreated: input.lifecycle.onSessionCreated,
		onSystemPromptChanged: (systemPromptText) => {
			state.systemPromptText = systemPromptText;
		},
		runAbortSignal: input.agentSession.runAbortSignal,
		sessionAgentId: input.sessionManager.sessionAgentId,
		transcriptLifecycle: input.sessionManager.transcriptLifecycle,
		sessionManager,
		nestedToolActivities: input.nestedToolActivities
	});
	const { activeSession, setActiveSessionSystemPrompt, settingsManager } = preparedAgentSession;
	const recordCurrentTurnImageFailure = (count) => {
		state.currentTurnImageFailureCount = Math.max(state.currentTurnImageFailureCount, count);
	};
	await attempt.userTurnTranscriptRecorder?.waitForRuntimePersistence();
	const boundary = await input.sessionManager.withOwnedTranscriptWrite(() => prepareEmbeddedAttemptSessionBoundary({
		abortSignal: input.agentSession.runAbortSignal,
		activeSession,
		attempt,
		...preparedSessionManager.userMessageBoundary,
		isRawModelRun: input.isRawModelRun,
		sessionManager,
		setActiveSessionSystemPrompt
	}));
	state.prePromptMessageCount = activeSession.messages.length;
	const sessionPromptState = getEmbeddedSessionPromptState(attempt.sessionId);
	const toolResultPromptProjectionState = sessionPromptState.toolResults;
	const settleTracker = createEmbeddedAttemptSessionSettleTracker(activeSession);
	input.externalAbortController.setActiveSessionAbort(settleTracker.abortActiveSession);
	input.lifecycle.onSessionSettleTrackerReady(settleTracker.buildAbortSettlePromise);
	input.lifecycle.onSessionYieldReady({
		abortActiveSession: settleTracker.abortActiveSession,
		activeSession
	});
	const contextGuards = installEmbeddedAttemptContextGuards({
		...input.activeContextEngine ? { activeContextEngine: input.activeContextEngine } : {},
		activeSession,
		agentDir: input.agentDir,
		attempt,
		computerContextEpoch: input.contextGuards.computerContextEpoch,
		dropThinkingBlocksForEstimate: transcriptPolicy.dropThinkingBlocks,
		effectiveCwd: input.effectiveCwd,
		effectiveFsWorkspaceOnly: input.effectiveFsWorkspaceOnly,
		effectiveWorkspace: input.effectiveWorkspace,
		getPrePromptMessageCount: () => state.prePromptMessageCount,
		getPromptCache: () => state.promptCache,
		onCurrentTurnImageFailure: recordCurrentTurnImageFailure,
		getPromptCacheRetention: () => transport.effectivePromptCacheRetention,
		getCompactionReplayEnabled: () => transport.compactionReplayEnabled,
		getSystemPrompt: () => state.systemPromptText,
		isOpenAIResponsesApi,
		repairToolUseResultPairing: transcriptPolicy.repairToolUseResultPairing,
		sessionAgentId: input.sessionManager.sessionAgentId,
		sessionManager,
		settingsManager,
		sandbox: input.transport.sandbox
	});
	input.lifecycle.onContextGuardsInstalled(contextGuards.remove);
	const cacheTrace = createCacheTrace({
		cfg: attempt.config,
		env: process.env,
		runId: attempt.runId,
		sessionId: activeSession.sessionId,
		sessionKey: attempt.sessionKey,
		provider: attempt.provider,
		modelId: attempt.modelId,
		modelApi: attempt.model.api,
		workspaceDir: attempt.workspaceDir
	});
	const anthropicPayloadLogger = createAnthropicPayloadLogger({
		env: process.env,
		runId: attempt.runId,
		sessionId: activeSession.sessionId,
		sessionKey: attempt.sessionKey,
		provider: attempt.provider,
		modelId: attempt.modelId,
		modelApi: attempt.model.api,
		workspaceDir: attempt.workspaceDir
	});
	const trajectoryRecorder = await prepareEmbeddedAttemptTrajectory({
		activeSession,
		attempt,
		clientToolCount: preparedAgentSession.clientToolDefs.length,
		effectiveToolCount: input.trajectory.effectiveToolCount,
		effectiveWorkspace: input.effectiveWorkspace,
		localModelLeanEnabled: input.trajectory.localModelLeanEnabled,
		sessionAgentId: input.sessionManager.sessionAgentId,
		...input.trajectory.systemPromptReport ? { systemPromptReport: input.trajectory.systemPromptReport } : {}
	});
	input.lifecycle.onTrajectoryRecorderCreated(trajectoryRecorder);
	const transport = await prepareEmbeddedAttemptTransport({
		attempt,
		session: activeSession,
		settingsManager,
		providerThinkingLevel: input.transport.providerThinkingLevel,
		sessionAgentId: input.sessionManager.sessionAgentId,
		workspaceDir: input.effectiveWorkspace,
		workspaceOnly: input.effectiveFsWorkspaceOnly,
		agentDir: input.agentDir,
		abortSignal: input.transport.abortSignal,
		getProviderRuntimeHandle: input.transport.getProviderRuntimeHandle,
		onCurrentTurnImageFailure: recordCurrentTurnImageFailure,
		sandboxSessionKey: input.transport.sandboxSessionKey,
		...input.transport.sandbox !== void 0 ? { sandbox: input.transport.sandbox } : {},
		codeModeControlsEnabled: input.transport.codeModeControlsEnabled,
		providerPromptState: {
			state: getProviderPromptState(attempt.runId),
			effectiveContextTokenBudget: Math.max(1, Math.floor(attempt.contextTokenBudget ?? attempt.model.contextWindow ?? 2e5)),
			...trajectoryRecorder ? { recordEvent: trajectoryRecorder.recordEvent } : {}
		}
	});
	return {
		agentSession: preparedAgentSession,
		anthropicPayloadLogger,
		boundary,
		cacheTrace,
		contextGuards,
		isOpenAIResponsesApi,
		preparedUserTurnMessage,
		sessionManager,
		sessionPromptState,
		settleTracker,
		state,
		toolResultPromptProjectionState,
		trajectoryRecorder,
		transcriptPolicy,
		transport
	};
}
//#endregion
//#region src/agents/memory-prompt-prepare.ts
/** Prepare memory prompt state with the same normalized tool context used by assembly. */
async function prepareAgentMemoryPrompt(params) {
	if (!params.enabled) return;
	const availableTools = new Set([...params.toolNames, ...params.capabilityToolNames ?? []].map((tool) => tool.trim().toLowerCase()).filter(Boolean));
	return prepareMemoryPromptSection({
		availableTools,
		citationsMode: params.citationsMode,
		agentId: params.agentId,
		agentSessionKey: params.agentSessionKey,
		sandboxed: params.sandboxed
	});
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-system-prompt.ts
/**
* Builds the system prompt inputs for a single embedded-agent attempt.
*/
const ATTEMPT_PROMPT_SECTION = /<!-- openclaw:attempt:(STABLE|DYNAMIC|PERMISSION) -->[\s\S]*?<!-- \/openclaw:attempt:\1 -->/g;
function renderAttemptPromptSection(section, text) {
	return `<!-- openclaw:attempt:${section} -->\n${text}\n<!-- /openclaw:attempt:${section} -->`;
}
/**
* Builds the embedded system prompt and applies provider-specific transforms
* unless this is a raw model run. Raw runs still keep `baseSystemPrompt` for
* diagnostics/cache boundaries, but submit an empty provider prompt.
*/
function buildAttemptSystemPrompt(params) {
	const baseSystemPrompt = buildEmbeddedSystemPrompt(params.embeddedSystemPrompt);
	const transformedSystemPrompt = params.isRawModelRun ? "" : params.transformProviderSystemPrompt({
		provider: params.providerTransform.provider,
		config: params.providerTransform.config,
		workspaceDir: params.providerTransform.workspaceDir,
		context: {
			...params.providerTransform.context,
			systemPrompt: baseSystemPrompt
		}
	});
	const splitPrompt = splitSystemPromptCacheBoundary(transformedSystemPrompt);
	const stablePrompt = renderAttemptPromptSection("STABLE", splitPrompt?.stablePrefix ?? transformedSystemPrompt);
	const dynamicPrompt = splitPrompt ? renderAttemptPromptSection("DYNAMIC", splitPrompt.dynamicSuffix) : "";
	return {
		baseSystemPrompt,
		systemPrompt: params.isRawModelRun ? "" : splitPrompt ? `${stablePrompt}${SYSTEM_PROMPT_CACHE_BOUNDARY}${dynamicPrompt}` : stablePrompt,
		refreshSystemPrompt: (currentSystemPrompt, permissionNotice) => {
			if (params.isRawModelRun) return currentSystemPrompt;
			const nextNotice = renderAttemptPromptSection("PERMISSION", permissionNotice);
			let replacedNotice = false;
			const refreshed = currentSystemPrompt.replace(ATTEMPT_PROMPT_SECTION, (_match, section) => {
				if (section === "PERMISSION") {
					replacedNotice = true;
					return nextNotice;
				}
				return section === "STABLE" ? stablePrompt : dynamicPrompt;
			});
			return replacedNotice ? refreshed : `${refreshed}\n\n${nextNotice}`;
		}
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-system-prompt-prepare.ts
async function prepareEmbeddedAttemptSystemPrompt(params) {
 const jitterEnabled = true; let jitterClosed = false, jitterCount = 0;
 const jitterLog = (stage, started, outcome) => {
  if (!jitterEnabled || jitterClosed || jitterCount++ >= 32) return;
  try { if (process.stderr.writableLength > 262144) return;
   console.error('[prompt-prep-observer.1] '+JSON.stringify({runId:params.attempt.runId,pid:process.pid,stage,atMs:Date.now(),elapsedMs:performance.now()-started,outcome}));
  } catch {}
 };
 const jitterSync = (stage, fn) => {const started=performance.now();let outcome='error';try {const value=fn();outcome='ok';return value;} finally {jitterLog(stage,started,outcome);}};
 const jitterAsync = async (stage, fn) => {const started=performance.now();let outcome='error';try {const value=await fn();outcome='ok';return value;} finally {jitterLog(stage,started,outcome);}};

 const jitterStarted = performance.now(); let jitterFailed = false;
 jitterLog('start', jitterStarted, 'start');
 try {
	const { attempt } = params;
	if (attempt.operation === "settled-tool-finalization") {
		params.markStage("system-prompt");
		return {
			runtimeChannel: void 0,
			runtimeInfo: { model: `${attempt.provider}/${attempt.modelId}` },
			systemPromptReport: void 0,
			systemPromptText: ""
		};
	}
	const resolveSandboxInfo = () => {
		const sandboxInfoExecPolicy = resolveEmbeddedSandboxInfoExecPolicy({
			config: attempt.config,
			agentId: params.sessionAgentId,
			sessionKey: attempt.sessionKey,
			permissionMode: attempt.permissionMode,
			sandboxAvailable: params.sandbox?.enabled === true,
			execOverrides: attempt.execOverrides
		});
		return buildEmbeddedSandboxInfo(params.sandbox, attempt.bashElevated, sandboxInfoExecPolicy);
	};
	const sandboxInfo = resolveSandboxInfo();
	const reasoningTagHint = isReasoningTagProvider(attempt.provider, {
		config: attempt.config,
		workspaceDir: params.effectiveWorkspace,
		env: process.env,
		modelId: attempt.modelId,
		modelApi: attempt.model.api,
		model: attempt.model,
		runtimeHandle: params.getProviderRuntimeHandle()
	});
	const resolveToolSchemaDirectoryPrompt = () => params.toolSearchDirectoryEnabled ? buildToolSchemaDirectoryPrompt({
		config: attempt.config,
		runtimeConfig: params.toolSearchRuntimeConfig,
		agentId: params.sessionAgentId,
		sessionKey: params.sandboxSessionKey,
		sessionId: attempt.sessionId,
		runId: attempt.runId,
		catalogRef: params.toolSearchCatalogRef
	}) : void 0;
	jitterLog("prelude", jitterStarted, "ok");
	const toolSchemaDirectoryPrompt = jitterSync("tool-schema-directory", () => resolveToolSchemaDirectoryPrompt());
	const activeProcessSessions = listActiveProcessSessionReferences({ scopeKey: resolveProcessToolScopeKey({
		sessionKey: params.sandboxSessionKey,
		agentId: params.sessionAgentId
	}) });
	const { runtimeChannel, runtimeCapabilities, reactionGuidance, messageToolHints, runtimeInfo, userTimezone, userDate } = await jitterAsync("runtime-prompt", () => resolveAgentRuntimePrompt({
		config: attempt.config,
		agentId: params.sessionAgentId,
		workspaceDir: params.effectiveWorkspace,
		cwd: params.effectiveCwd,
		...attempt.preparedModelRuntime && Object.hasOwn(attempt.preparedModelRuntime, "repoRoot") ? { preparedRepoRoot: attempt.preparedModelRuntime.repoRoot } : {},
		sessionKey: attempt.sessionKey,
		sessionId: attempt.sessionId,
		model: `${attempt.provider}/${attempt.modelId}`,
		channel: attempt.messageChannel ?? attempt.messageProvider,
		accountId: attempt.agentAccountId,
		chatType: attempt.chatType,
		currentChannelId: attempt.currentChannelId,
		currentThreadTs: attempt.currentThreadTs,
		currentMessageId: attempt.currentMessageId,
		senderId: attempt.senderId,
		senderIsOwner: attempt.senderIsOwner,
		activeProcessSessions
	}));
	const promptMode = attempt.promptMode ?? (params.isRawModelRun ? "none" : resolvePromptModeForSession(attempt.sessionKey));
	const promptSurface = resolveAgentPromptSurfaceForSessionKey(attempt.sessionKey);
	const toolPolicyRestricted = toolPolicyRestrictsTools({ allow: attempt.toolsAllow });
	const effectivePromptMode = toolPolicyRestricted ? "minimal" : promptMode;
	const effectiveSkillsPrompt = toolPolicyRestricted ? void 0 : params.skillsPrompt;
	const openClawReferences = await jitterAsync("reference-paths", () => resolveOpenClawReferencePaths({
		workspaceDir: params.effectiveWorkspace,
		argv1: process.argv[1],
		cwd: params.effectiveCwd,
		moduleUrl: import.meta.url
	}));
	const promptContributionContext = {
		config: attempt.config,
		agentDir: attempt.agentDir,
		workspaceDir: params.effectiveWorkspace,
		provider: attempt.provider,
		modelId: attempt.modelId,
		promptMode: effectivePromptMode,
		runtimeChannel,
		runtimeCapabilities,
		agentId: params.sessionAgentId,
		trigger: attempt.trigger
	};
	const promptContribution = jitterSync("provider-contribution", () => attempt.runtimePlan?.prompt.resolveSystemPromptContribution(promptContributionContext) ?? resolveProviderSystemPromptContribution({
		provider: attempt.provider,
		config: attempt.config,
		workspaceDir: params.effectiveWorkspace,
		runtimeHandle: params.getProviderRuntimeHandle(),
		context: promptContributionContext
	}));
	const includeMemorySection = !params.activeContextEngine || params.activeContextEngine.info.id === "legacy";
	const prepareToolContextSections = async (tools, capabilityToolNames, sandboxed) => {
		const toolContext = {
			toolNames: tools.map((tool) => tool.name),
			capabilityToolNames,
			sandboxed
		};
		return {
			preparedMemoryPrompt: await jitterAsync("agent-memory", () => prepareAgentMemoryPrompt({
				...toolContext,
				enabled: effectivePromptMode === "full" && includeMemorySection,
				citationsMode: attempt.config?.memory?.citations,
				agentId: runtimeInfo.agentId,
				agentSessionKey: runtimeInfo.sessionKey
			})),
			preparedWatchedSessions: jitterSync("watched-sessions", () => prepareWatchedSessionsPrompt({
				...toolContext,
				enabled: effectivePromptMode === "full",
				config: attempt.config,
				sessionKey: attempt.sessionKey
			}))
		};
	};
	const { preparedMemoryPrompt, preparedWatchedSessions } = await prepareToolContextSections(params.effectiveTools, params.capabilityToolNames, sandboxInfo?.enabled === true);
	const activeProjectKeys = attempt.preparedModelRuntime?.activeProjectKeys ?? [];
	const projectMemoryBootstrap = effectivePromptMode === "full" && activeProjectKeys.length > 0 ? await jitterAsync("project-memory", () => prepareProjectMemoryBootstrap({
		// v-project-memory-readonly-20260909
		runId: attempt.runId,
		abortSignal: attempt.abortSignal,
		cfg: attempt.config ?? {},
		agentId: params.sessionAgentId,
		activeProjectKeys
	})) : [];
	const projectMemoryWriteInstruction = buildProjectMemoryWriteInstruction(attempt.preparedModelRuntime?.projectKey);
	const extraSystemPrompt = [
		attempt.extraSystemPrompt,
		projectMemoryWriteInstruction,
		buildModelToolsUnavailablePrompt(params.modelToolsEnabled)
	].filter((value) => Boolean(value)).join("\n\n") || void 0;
	const promptInputs = {
		isRawModelRun: params.isRawModelRun,
		transformProviderSystemPrompt: (transformParams) => transformProviderSystemPrompt({
			...transformParams,
			runtimeHandle: params.getProviderRuntimeHandle()
		}),
		embeddedSystemPrompt: {
			config: attempt.config,
			agentId: params.sessionAgentId,
			workspaceDir: params.effectiveWorkspace,
			defaultThinkLevel: attempt.thinkLevel,
			runtimeCwd: params.effectiveCwd,
			reasoningLevel: attempt.reasoningLevel ?? "off",
			extraSystemPrompt,
			ownerNumbers: attempt.ownerNumbers,
			reasoningTagHint,
			skillsPrompt: effectiveSkillsPrompt,
			codeModeActive: params.codeModeActive,
			docsPath: openClawReferences.docsPath ?? void 0,
			sourcePath: openClawReferences.sourcePath ?? void 0,
			workspaceNotes: params.bootstrap.workspaceNotes.length ? params.bootstrap.workspaceNotes : void 0,
			reactionGuidance,
			promptMode: effectivePromptMode,
			sourceReplyDeliveryMode: attempt.sourceReplyDeliveryMode,
			silentReplyPromptMode: attempt.silentReplyPromptMode,
			proactiveSubagentOrchestration: params.proactiveSubagentOrchestration,
			acpEnabled: isAcpRuntimeSpawnAvailable({
				config: attempt.config,
				sandboxed: sandboxInfo?.enabled === true
			}),
			promptSurface,
			nativeCommandGuidanceLines: listRegisteredPluginAgentPromptGuidance({ surface: promptSurface }),
			runtimeInfo,
			messageToolHints,
			toolSchemaDirectoryPrompt,
			sandboxInfo,
			capabilityToolNames: [...params.capabilityToolNames].toSorted(),
			tools: params.effectiveTools,
			userTimezone,
			userDate,
			contextFiles: params.bootstrap.contextFiles,
			bootstrapMode: params.bootstrap.bootstrapMode,
			bootstrapTruncationNotice: buildBootstrapPromptWarningNotice(params.bootstrap.bootstrapPromptWarning.lines),
			includeMemorySection,
			preparedMemoryPrompt,
			preparedWatchedSessions,
			projectMemoryBootstrap,
			activeProjectKeys,
			promptContribution
		},
		providerTransform: {
			provider: attempt.provider,
			config: attempt.config,
			workspaceDir: params.effectiveWorkspace,
			context: {
				config: attempt.config,
				agentDir: attempt.agentDir,
				workspaceDir: params.effectiveWorkspace,
				provider: attempt.provider,
				modelId: attempt.modelId,
				promptMode: effectivePromptMode,
				runtimeChannel,
				runtimeCapabilities,
				agentId: params.sessionAgentId
			}
		}
	};
	const attemptSystemPrompt = jitterSync("prompt-assembly", () => buildAttemptSystemPrompt(promptInputs));
	const reportInputs = {
		source: "run",
		generatedAt: Date.now(),
		sessionId: attempt.sessionId,
		sessionKey: attempt.sessionKey,
		provider: attempt.provider,
		model: attempt.modelId,
		workspaceDir: params.effectiveWorkspace,
		bootstrapMaxChars: params.bootstrap.bootstrapMaxChars,
		bootstrapTotalMaxChars: params.bootstrap.bootstrapTotalMaxChars,
		bootstrapTruncation: buildBootstrapTruncationReportMeta({
			analysis: params.bootstrap.bootstrapAnalysis,
			warningMode: params.bootstrap.bootstrapPromptWarningMode,
			warning: params.bootstrap.bootstrapPromptWarning
		}),
		sandbox: (() => {
			const runtime = resolveSandboxRuntimeStatus({
				cfg: attempt.config,
				agentId: attempt.sandboxAgentId ?? (params.sandboxSessionKey === (attempt.sessionKey?.trim() || attempt.sessionId) ? params.sessionAgentId : void 0),
				sessionKey: params.sandboxSessionKey
			});
			return {
				mode: runtime.mode,
				sandboxed: runtime.sandboxed
			};
		})(),
		systemPrompt: attemptSystemPrompt.systemPrompt,
		injectedWorkspaceFiles: params.bootstrap.bootstrapInjectionStats,
		skillsPrompt: params.skillsPrompt,
		tools: params.effectiveTools
	};
	const systemPromptReport = jitterSync("prompt-report", () => buildSystemPromptReport(reportInputs));
	params.markStage("system-prompt");
	let permissionPromptPreparation;
	return {
		runtimeChannel,
		runtimeInfo,
		systemPromptReport,
		systemPromptText: attemptSystemPrompt.systemPrompt,
		preparePermissionPrompt: (effectiveTools = params.effectiveTools) => {
			const mode = attempt.permissionMode;
			const capabilities = [...params.capabilityToolNames].toSorted();
			if (permissionPromptPreparation && permissionPromptPreparation.mode === mode && permissionPromptPreparation.tools === effectiveTools && permissionPromptPreparation.capabilities.length === capabilities.length && permissionPromptPreparation.capabilities.every((name, index) => name === capabilities[index])) return permissionPromptPreparation.promise;
			const tools = [...effectiveTools];
			const refreshedSandboxInfo = resolveSandboxInfo();
			const embeddedSystemPrompt = {
				...promptInputs.embeddedSystemPrompt,
				tools,
				capabilityToolNames: capabilities,
				toolSchemaDirectoryPrompt: resolveToolSchemaDirectoryPrompt(),
				sandboxInfo: refreshedSandboxInfo
			};
			const promise = (async () => {
				Object.assign(embeddedSystemPrompt, await prepareToolContextSections(tools, capabilities, refreshedSandboxInfo?.enabled === true));
				const nextSystemPrompt = buildAttemptSystemPrompt({
					...promptInputs,
					embeddedSystemPrompt
				});
				const permissionNotice = `## Permission change\nThe operator changed workspace permissions to ${mode ?? "configured defaults"}. Continue the current task with the updated tools and permissions. Inspect interrupted actions before retrying; do not repeat completed actions.`;
				return (currentSystemPrompt) => {
					if (params.isRawModelRun) return currentSystemPrompt;
					const systemPrompt = nextSystemPrompt.refreshSystemPrompt(currentSystemPrompt, permissionNotice);
					Object.assign(systemPromptReport, buildSystemPromptReport({
						...reportInputs,
						generatedAt: Date.now(),
						systemPrompt,
						tools
					}));
					return systemPrompt;
				};
			})();
			permissionPromptPreparation = {
				mode,
				tools: effectiveTools,
				capabilities,
				promise
			};
			return promise;
		}
	};
 } catch (error) { jitterFailed = true; throw error; }
 finally { jitterLog('total', jitterStarted, jitterFailed ? 'error' : 'ok'); jitterClosed = true; }
}
//#endregion
//#region src/agents/tool-allowlist-guard.ts
/**
* Explicit tool allowlist guard.
*
* Collects operator/user allowlist sources and explains when no callable tools remain.
*/
/** Normalize explicit allowlist sources, dropping empty source entries. */
function collectExplicitToolAllowlistSources(sources) {
	return sources.flatMap((source) => {
		const entries = normalizeStringEntries(source.allow);
		if (entries.length === 0) return [];
		return [{
			label: source.label,
			entries,
			...source.enforceWhenToolsDisabled === true ? { enforceWhenToolsDisabled: true } : {}
		}];
	});
}
/** Build an actionable error when explicit allowlists remove every callable tool. */
function buildEmptyExplicitToolAllowlistError(params) {
	const sources = params.disableTools === true || params.toolsAllowExplicitlyEmpty === true ? params.sources.filter((source) => source.enforceWhenToolsDisabled === true) : params.sources;
	const callableToolNames = normalizeToolList(params.callableToolNames);
	if (sources.length === 0 || callableToolNames.length > 0) return null;
	const requested = sources.map((source) => `${source.label}: ${source.entries.map(normalizeToolPolicyName).join(", ")}`).join("; ");
	const reason = params.disableTools === true ? "tools are disabled for this run" : params.toolsEnabled ? "no registered tools matched" : "the selected model does not support tools";
	return /* @__PURE__ */ new Error(`No callable tools remain after resolving explicit tool allowlist (${requested}); ${reason}. Fix the allowlist or enable the plugin that registers the requested tool.`);
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-tool-allowlist.ts
function collectAttemptExplicitToolAllowlistSources(params) {
	const { agentId, globalPolicy, globalProviderPolicy, agentPolicy, agentProviderPolicy, groupPolicy, sandboxPolicy, subagentPolicy, inheritedToolPolicy } = params.capabilityProfile.policy;
	return collectExplicitToolAllowlistSources([
		{
			label: "tools.allow",
			allow: globalPolicy?.allow
		},
		{
			label: "tools.byProvider.allow",
			allow: globalProviderPolicy?.allow
		},
		{
			label: agentId ? `agents.${agentId}.tools.allow` : "agent tools.allow",
			allow: agentPolicy?.allow
		},
		{
			label: agentId ? `agents.${agentId}.tools.byProvider.allow` : "agent tools.byProvider.allow",
			allow: agentProviderPolicy?.allow
		},
		{
			label: "group tools.allow",
			allow: groupPolicy?.allow
		},
		{
			label: "sandbox tools.allow",
			allow: sandboxPolicy?.allow
		},
		{
			label: "subagent tools.allow",
			allow: subagentPolicy?.allow
		},
		{
			label: "inherited tools.allow",
			allow: inheritedToolPolicy?.allow
		},
		{
			label: "runtime toolsAllow",
			allow: params.toolsAllow,
			enforceWhenToolsDisabled: true
		}
	]);
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-tool-search-run-plan.ts
/**
* Builds tool-search execution plans from allowlists and available controls.
*/
/** Tool-search control tools that may be auto-added when tool search is enabled. */
const TOOL_SEARCH_CONTROL_ALLOWLIST_NAMES = [
	TOOL_SEARCH_CODE_MODE_TOOL_NAME,
	TOOL_SEARCH_RAW_TOOL_NAME,
	TOOL_DESCRIBE_RAW_TOOL_NAME,
	TOOL_CALL_RAW_TOOL_NAME
];
function collectExplicitlyAllowedClientToolNames(params) {
	const names = (params.clientTools ?? []).map((tool) => tool.function?.name).filter((name) => Boolean(name?.trim()));
	if (names.length === 0) return [];
	const matchers = params.explicitAllowlistSources.map((source) => createToolPolicyMatcher({ allow: source.entries }));
	return names.filter((name) => matchers.some((matches) => matches(name)));
}
function collectOpenClawCapabilityToolNames(tools) {
	return collectAllowedToolNames({ tools: tools.filter((tool) => getPluginToolMeta(tool)?.pluginId !== "bundle-mcp") });
}
/**
* Builds the complete tool-search allowlist plan for one run. Visible tools use
* compacted prompt state, replay tools use uncompacted state, and catalog-backed
* client tools are represented through synthetic tool-search callable names.
*/
function buildToolSearchRunPlan(params) {
	const visibleAllowedToolNames = collectAllowedToolNames({
		tools: params.visibleTools,
		clientTools: params.clientToolsCataloged ? void 0 : params.clientTools
	});
	const replayAllowedToolNames = collectAllowedToolNames({
		tools: params.uncompactedTools,
		clientTools: params.clientTools
	});
	const capabilityToolNames = collectOpenClawCapabilityToolNames(params.deferredToolsCallable ? params.uncompactedTools : params.visibleTools);
	if (params.controlsEnabled) {
		for (const controlName of params.controlNames ?? TOOL_SEARCH_CONTROL_ALLOWLIST_NAMES) if (visibleAllowedToolNames.has(controlName)) replayAllowedToolNames.add(controlName);
	}
	const liveAllowedToolNames = params.deferredToolsCallable ? collectUniqueCatalogToolNames(params.uncompactedTools) : visibleAllowedToolNames;
	if (params.deferredToolsCallable) {
		for (const controlName of TOOL_SEARCH_CONTROL_ALLOWLIST_NAMES) if (!visibleAllowedToolNames.has(controlName)) {
			liveAllowedToolNames.delete(controlName);
			capabilityToolNames.delete(controlName);
		}
		for (const visibleName of visibleAllowedToolNames) liveAllowedToolNames.add(visibleName);
	}
	const explicitControlAllowlistNames = new Set(params.explicitAllowlistSources.flatMap((source) => source.entries.map((entry) => normalizeToolPolicyName(entry))));
	const autoAddedControlNames = new Set((params.controlsEnabled ? params.controlNames ?? TOOL_SEARCH_CONTROL_ALLOWLIST_NAMES : []).filter((controlName) => !explicitControlAllowlistNames.has(normalizeToolPolicyName(controlName))));
	const explicitlyAllowedClientToolNames = collectExplicitlyAllowedClientToolNames({
		clientTools: params.clientTools,
		explicitAllowlistSources: params.explicitAllowlistSources
	});
	const emptyAllowlistVisibleToolNames = params.deferredToolsCallable ? collectAllowedToolNames({ tools: params.visibleTools }) : visibleAllowedToolNames;
	const explicitClientCallableNames = params.clientToolsCataloged ? explicitlyAllowedClientToolNames.map((name) => `tool-search-client:${name}`) : params.deferredToolsCallable ? explicitlyAllowedClientToolNames : [];
	return {
		visibleAllowedToolNames,
		replayAllowedToolNames,
		liveAllowedToolNames,
		capabilityToolNames,
		emptyAllowlistCallableNames: [
			...[...emptyAllowlistVisibleToolNames].filter((toolName) => !autoAddedControlNames.has(toolName)),
			...Array.from({ length: params.catalogToolCount }, (_, index) => `tool-search:${index}`),
			...explicitClientCallableNames
		]
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-tool-catalog.ts
function prepareEmbeddedAttemptToolCatalog(input) {
	const buildCatalog = () => {
		const { attempt, preparedToolBase } = input;
		const { codeModeControlsEnabledForRun, codeModeSkills, localModelLeanPreserveToolNames, runtimeCapabilityProfile, toolSearchConfig, toolSearchControlsEnabledForRun, toolSearchRuntimeConfig, toolsEnabled } = preparedToolBase;
		const { clientTools, uncompactedEffectiveTools } = input.bundleTools;
		const abortSignal = preparedToolBase.toolAbortSignal ?? input.abortSignal;
		let effectiveTools = attempt.toolExecutionAllow ? gateToolExecution(uncompactedEffectiveTools, attempt.toolExecutionAllow) : uncompactedEffectiveTools;
		const catalogToolHookContext = {
			agentId: input.sessionAgentId,
			config: attempt.config,
			cwd: input.effectiveCwd,
			sessionKey: input.sandboxSessionKey,
			sessionId: attempt.sessionId,
			runId: attempt.runId,
			approvalReviewerDeviceId: attempt.approvalReviewerDeviceId,
			channelId: attempt.currentChannelId,
			trace: input.runTrace,
			loopDetection: resolveToolLoopDetectionConfig({
				cfg: attempt.config,
				agentId: input.sessionAgentId
			}),
			onToolOutcome: attempt.onToolOutcome,
			allocateToolOutcomeOrdinal: attempt.allocateToolOutcomeOrdinal
		};
		if (attempt.codeModeRecovery?.kind === "resume") {
			if (toolSearchControlsEnabledForRun) effectiveTools = effectiveTools.map((tool) => {
				const prepareInput = typeof tool.prepareBeforeToolCallParams === "function";
				if (!isToolWrappedWithBeforeToolCallHook(tool)) return wrapToolWithBeforeToolCallHook(tool, catalogToolHookContext, prepareInput ? { protectNetworkErrors: false } : void 0);
				return prepareInput ? rewrapToolWithBeforeToolCallHook(tool, catalogToolHookContext, { protectNetworkErrors: false }) : tool;
			});
			effectiveTools = applyCodeModeRecoveryToolSurface({
				tools: effectiveTools,
				state: attempt.codeModeRecovery
			});
		}
		const codeModeTools = codeModeControlsEnabledForRun ? createCodeModeTools({
			config: attempt.config,
			runtimeConfig: attempt.config,
			modelContextWindowTokens: attempt.contextTokenBudget ?? attempt.model.contextWindow,
			agentId: input.sessionAgentId,
			sessionKey: input.sandboxSessionKey,
			sessionId: attempt.sessionId,
			runId: attempt.runId,
			catalogRef: preparedToolBase.toolSearchCatalogRef,
			abortSignal,
			forceRestartSafeTools: attempt.forceRestartSafeTools,
			toolExecutionAllow: attempt.toolExecutionAllow,
			executeTool: input.executeCodeModeTool,
			codeModeSkills
		}) : [];
		const toolSearch = applyAgentToolSurfaceCatalog({
			tools: [...codeModeTools, ...effectiveTools],
			config: attempt.config,
			toolSearchRuntimeConfig,
			codeModeControlsEnabled: codeModeControlsEnabledForRun,
			toolSearchConfig,
			forceDirectMessageTool: preparedToolBase.forceDirectMessageTool,
			sessionId: attempt.sessionId,
			sessionKey: input.sandboxSessionKey,
			agentId: input.sessionAgentId,
			runId: attempt.runId,
			catalogRef: preparedToolBase.toolSearchCatalogRef,
			toolHookContext: catalogToolHookContext,
			codeModeSkills
		});
		const projectedToolSearchTools = filterLocalModelLeanTools({
			tools: toolSearch.tools,
			config: attempt.config,
			agentId: input.sessionAgentId,
			preserveToolNames: localModelLeanPreserveToolNames
		});
		const toolSearchSchemaProjection = filterRuntimeCompatibleTools(projectedToolSearchTools);
		logRuntimeToolSchemaQuarantine({
			diagnostics: toolSearchSchemaProjection.diagnostics,
			tools: projectedToolSearchTools,
			runId: attempt.runId,
			agentId: input.sessionAgentId,
			sessionKey: attempt.sessionKey,
			sessionId: attempt.sessionId
		});
		effectiveTools = toolSearchSchemaProjection.tools.map((tool) => wrapEmbeddedAttemptToolWithActivity(wrapToolWithAbortSignal(tool, abortSignal), attempt.runId));
		if (attempt.codeModeRecovery?.kind === "inspect") effectiveTools = applyCodeModeRecoveryToolSurface({
			tools: effectiveTools,
			state: attempt.codeModeRecovery
		});
		if (codeModeControlsEnabledForRun && isCodeModeDiagnosticEnabled()) logCodeModeDiagnostic(log$5, "final-surface", {
			runId: attempt.runId,
			fallbackActive: attempt.fallbackActive === true,
			catalogToolCount: toolSearch.catalogToolCount,
			visibleToolNames: effectiveTools.map((tool) => tool.name)
		});
		if (toolSearch.compacted && !toolSearch.catalogReused) {
			input.markStage(codeModeControlsEnabledForRun ? "code-mode" : "tool-search");
			log$5.info(codeModeControlsEnabledForRun ? `code-mode: cataloged ${toolSearch.catalogToolCount} tools behind exec/wait` : toolSearchConfig.mode === "directory" ? `tool-search: cataloged ${toolSearch.catalogToolCount} tools behind compact directory surface` : `tool-search: cataloged ${toolSearch.catalogToolCount} tools behind compact prompt surface`);
		}
		const deferredDirectoryToolsCallable = toolSearchControlsEnabledForRun && toolSearchConfig.mode === "directory" && toolSearch.catalogRegistered;
		input.markStage("bundle-tools");
		const explicitToolAllowlistSources = collectAttemptExplicitToolAllowlistSources({
			capabilityProfile: runtimeCapabilityProfile,
			toolsAllow: attempt.toolsAllow
		});
		const toolSearchRunPlan = buildToolSearchRunPlan({
			visibleTools: effectiveTools,
			uncompactedTools: uncompactedEffectiveTools,
			clientTools,
			clientToolsCataloged: toolSearch.catalogRegistered && (codeModeControlsEnabledForRun || toolSearchConfig.mode !== "directory"),
			catalogToolCount: toolSearch.catalogToolCount,
			controlsEnabled: toolSearchControlsEnabledForRun || codeModeControlsEnabledForRun,
			deferredToolsCallable: deferredDirectoryToolsCallable,
			controlNames: codeModeControlsEnabledForRun ? [CODE_MODE_EXEC_TOOL_NAME, CODE_MODE_WAIT_TOOL_NAME] : toolSearchConfig.mode === "directory" ? [
				TOOL_SEARCH_RAW_TOOL_NAME,
				TOOL_DESCRIBE_RAW_TOOL_NAME,
				TOOL_CALL_RAW_TOOL_NAME
			] : void 0,
			explicitAllowlistSources: explicitToolAllowlistSources
		});
		const emptyExplicitToolAllowlistError = attempt.forceRestartSafeTools ? null : buildEmptyExplicitToolAllowlistError({
			sources: explicitToolAllowlistSources,
			callableToolNames: toolSearchRunPlan.emptyAllowlistCallableNames,
			toolsEnabled,
			disableTools: attempt.disableTools,
			toolsAllowExplicitlyEmpty: preparedToolBase.effectiveToolsAllow?.length === 0
		});
		logAgentRuntimeToolDiagnostics({
			runtimePlan: attempt.runtimePlan,
			tools: effectiveTools,
			provider: attempt.provider,
			config: attempt.config,
			workspaceDir: input.effectiveWorkspace,
			env: process.env,
			modelId: attempt.modelId,
			modelApi: attempt.model.api,
			model: attempt.model,
			runtimeHandle: input.getProviderRuntimeHandle()
		});
		return {
			catalogToolHookContext,
			deferredDirectoryToolsCallable,
			effectiveTools,
			emptyExplicitToolAllowlistError,
			toolSearch,
			toolSearchRunPlan
		};
	};
	const current = buildCatalog();
	const promptPlanKeys = [
		"visibleAllowedToolNames",
		"liveAllowedToolNames",
		"capabilityToolNames"
	];
	const hostPromptPlan = {
		visibleAllowedToolNames: new Set(current.toolSearchRunPlan.visibleAllowedToolNames),
		liveAllowedToolNames: new Set(current.toolSearchRunPlan.liveAllowedToolNames),
		capabilityToolNames: new Set(current.toolSearchRunPlan.capabilityToolNames)
	};
	return Object.assign(current, {
		applyPromptToolPolicy: (allowedNames) => {
			for (const key of promptPlanKeys) {
				const names = current.toolSearchRunPlan[key];
				names.clear();
				for (const name of hostPromptPlan[key]) if (allowedNames.has(name)) names.add(name);
			}
		},
		refreshTools: () => {
			const next = buildCatalog();
			current.effectiveTools.splice(0, current.effectiveTools.length, ...next.effectiveTools);
			for (const key of [
				"visibleAllowedToolNames",
				"liveAllowedToolNames",
				"capabilityToolNames",
				"replayAllowedToolNames"
			]) {
				const target = current.toolSearchRunPlan[key];
				if (key !== "replayAllowedToolNames") target.clear();
				for (const name of next.toolSearchRunPlan[key]) target.add(name);
			}
			Object.assign(current.toolSearch, next.toolSearch);
			for (const key of promptPlanKeys) hostPromptPlan[key] = new Set(next.toolSearchRunPlan[key]);
			current.emptyExplicitToolAllowlistError = next.emptyExplicitToolAllowlistError;
			current.toolSearchRunPlan.emptyAllowlistCallableNames.splice(0, current.toolSearchRunPlan.emptyAllowlistCallableNames.length, ...next.toolSearchRunPlan.emptyAllowlistCallableNames);
		}
	});
}
function gateToolExecution(tools, allowNames) {
	return tools.map((tool) => isToolExecutionAllowed(allowNames, tool.name) || TOOL_SEARCH_CONTROL_TOOL_NAMES.has(tool.name) ? tool : {
		...tool,
		execute: async () => {
			throw new Error(TOOL_EXECUTION_GATED_MESSAGE);
		}
	});
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-tool-prepare.ts
/**
* Prepares the core tool surface for one embedded attempt.
* It may assume workspace, model, and runtime policy inputs are resolved.
*/
function prepareEmbeddedAttemptToolBase(params) {
	const { attempt } = params;
	const inspectingCodeModeRecovery = attempt.codeModeRecovery?.kind === "inspect";
	const forceDirectMessageTool = inspectingCodeModeRecovery ? false : messageToolOwnsVisibleReply(attempt);
	const toolRunContext = buildEmbeddedAttemptToolRunContext({
		...attempt,
		forceMessageTool: forceDirectMessageTool,
		trace: params.runTrace
	});
	params.markCoreToolStage?.("tool-base:run-context");
	const toolsAllowWithForcedRuntimeTools = inspectingCodeModeRecovery ? ["read"] : toolRunContext.runtimeToolAllowlist;
	const toolsEnabled = supportsModelTools(attempt.model);
	const isRawModelRun = attempt.modelRun === true || attempt.promptMode === "none";
	const toolConstructionPlan = resolveEmbeddedAttemptToolConstructionPlan({
		disableTools: attempt.disableTools,
		isRawModelRun,
		toolsEnabled,
		toolsAllow: toolsAllowWithForcedRuntimeTools
	});
	const { codeModeControlsEnabled: codeModeControlsEnabledForRun, toolSearchConfig, toolSearchControlsEnabled: toolSearchControlsEnabledForRun, toolSearchRuntimeConfig } = resolveAgentToolSurfacePlan({
		config: attempt.config,
		agentId: params.sessionAgentId,
		sessionKey: params.sandboxSessionKey,
		forceDirectMessageTool,
		model: attempt.model,
		modelProvider: attempt.provider,
		modelId: attempt.modelId,
		codeModeOverride: attempt.codeModeOverride,
		toolsEnabled,
		disableTools: attempt.disableTools,
		isRawModelRun,
		toolsAllow: attempt.toolsAllow,
		forceCodeModeControls: attempt.forceCodeModeTools,
		forceDirectTools: inspectingCodeModeRecovery
	});
	params.markCoreToolStage?.("tool-base:surface-plan");
	if (isCodeModeDiagnosticEnabled()) logCodeModeDiagnostic(log$5, "activation", {
		runId: attempt.runId,
		active: codeModeControlsEnabledForRun,
		toolsEnabled,
		rawRun: isRawModelRun,
		toolsDisabled: attempt.disableTools === true,
		fallbackActive: attempt.fallbackActive === true,
		allowlist: attempt.toolsAllow === void 0 ? "unset" : attempt.toolsAllow.length === 0 ? "empty" : "nonempty"
	});
	const effectiveToolsAllow = toolSearchControlsEnabledForRun && toolsAllowWithForcedRuntimeTools ? [.../* @__PURE__ */ new Set([...toolsAllowWithForcedRuntimeTools, ...TOOL_SEARCH_CONTROL_ALLOWLIST_NAMES])] : toolsAllowWithForcedRuntimeTools;
	const shouldConstructTools = toolConstructionPlan.constructTools || toolSearchControlsEnabledForRun || codeModeControlsEnabledForRun;
	const computerContextEpoch = { value: 0 };
	const skillInstructionDeliveryCache = createSkillInstructionDeliveryCache();
	const toolSearchCatalogRef = toolSearchControlsEnabledForRun || codeModeControlsEnabledForRun ? createToolSearchCatalogRef() : void 0;
	const nestedToolActivities = [];
	const codeModeSkills = toolPolicyRestrictsTools({ allow: attempt.toolsAllow }) ? [] : params.codeModeSkills;
	const cronCreatorToolAllowlist = [];
	const cronCreatorToolAllowlistCaptureRef = {};
	const inheritedToolAllowlist = [];
	const runCleanups = [];
	const generationCleanups = [];
	const retiringGenerations = /* @__PURE__ */ new Set();
	const retireToolGeneration = (reason) => {
		const cleanups = generationCleanups.splice(0);
		const settled = Promise.allSettled(cleanups.map(async (cleanup) => await cleanup(reason))).then(() => {});
		retiringGenerations.add(settled);
		settled.then(() => retiringGenerations.delete(settled));
	};
	const spawnWorkspaceDir = params.effectiveCwd !== params.effectiveWorkspace ? params.resolvedWorkspace : resolveAttemptSpawnWorkspaceDir({
		sandbox: params.sandbox,
		resolvedWorkspace: params.resolvedWorkspace
	});
	params.markCoreToolStage?.("tool-base:pre-profile");
	const runtimeCapabilityProfile = resolveConversationCapabilityProfile({
		config: toolSearchRuntimeConfig,
		sessionKey: params.sandboxSessionKey,
		runSessionKey: attempt.sessionKey && attempt.sessionKey !== params.sandboxSessionKey ? attempt.sessionKey : void 0,
		sessionId: attempt.sessionId,
		runId: attempt.runId,
		agentId: attempt.sandboxAgentId ?? params.sessionAgentId,
		agentDir: params.agentDir,
		agentAccountId: attempt.agentAccountId,
		messageProvider: resolveAttemptToolPolicyMessageProvider(attempt),
		messageChannel: attempt.messageChannel,
		chatType: attempt.chatType,
		messageTo: attempt.messageTo,
		messageThreadId: attempt.messageThreadId,
		conversationToolPolicy: attempt.conversationToolPolicy,
		currentChannelId: attempt.currentChannelId,
		currentMessagingTarget: attempt.currentMessagingTarget,
		currentThreadTs: attempt.currentThreadTs,
		currentMessageId: attempt.currentMessageId,
		groupId: attempt.groupId,
		groupChannel: attempt.groupChannel,
		groupSpace: attempt.groupSpace,
		memberRoleIds: attempt.memberRoleIds,
		spawnedBy: attempt.spawnedBy,
		senderId: attempt.senderId,
		senderName: attempt.senderName,
		senderUsername: attempt.senderUsername,
		senderE164: attempt.senderE164,
		senderIsOwner: attempt.senderIsOwner,
		modelProvider: attempt.provider,
		modelId: attempt.modelId,
		modelApi: attempt.model.api,
		modelContextWindowTokens: attempt.contextTokenBudget ?? attempt.model.contextWindow,
		modelHasVision: attempt.model.input?.includes("image") ?? false,
		workspaceDir: params.effectiveWorkspace,
		cwd: params.effectiveCwd,
		spawnWorkspaceDir,
		isCanonicalWorkspace: attempt.isCanonicalWorkspace,
		promptMode: attempt.promptMode,
		skillsSnapshot: params.skillsSnapshot,
		sandboxToolPolicy: params.sandbox?.tools,
		runtimeToolAllowlist: effectiveToolsAllow,
		inheritRuntimeToolAllowlist: true,
		runtimePluginToolGrant: attempt.runtimePluginToolGrant,
		inputProvenance: attempt.inputProvenance,
		trustedInternalHandoff: attempt.trustedInternalHandoff,
		scheduledToolPolicy: attempt.scheduledToolPolicy,
		pluginMetadataSnapshot: attempt.preparedModelRuntime?.metadataSnapshot
	});
	params.markCoreToolStage?.("tool-base:capability-profile");
	const localModelLeanEnabled = isLocalModelLeanEnabled({
		config: attempt.config,
		agentId: params.sessionAgentId,
		sessionKey: attempt.sessionKey
	});
	const localModelLeanPreserveToolNames = resolveLocalModelLeanPreserveToolNames({
		toolNames: runtimeCapabilityProfile.policy.explicitToolOverrideAllowlist,
		forceMessageTool: attempt.forceMessageTool,
		sourceReplyDeliveryMode: attempt.sourceReplyDeliveryMode
	});
	const replaySafetyOptions = { declaredReplaySafe: (candidate) => {
		const pluginMeta = getPluginToolMeta(candidate);
		if (pluginMeta) return pluginMeta.replaySafe === true;
		return getChannelAgentToolMeta(candidate) ? false : void 0;
	} };
	const restartSafetyOptions = { declaredReplaySafe: (candidate) => {
		if (getPluginToolMeta(candidate)?.mcp) return false;
		return replaySafetyOptions.declaredReplaySafe(candidate);
	} };
	const constructTools = (sessionPermissionPolicy, abortSignal) => {
		const constructedToolsRaw = !shouldConstructTools ? [] : (() => {
			const allTools = createOpenClawCodingTools({
				agentId: params.sessionAgentId,
				...toolRunContext,
				messageChannel: attempt.messageChannel,
				clientCaps: attempt.clientCaps,
				toolBindings: attempt.toolBindings,
				chatType: attempt.chatType,
				exec: {
					...attempt.execOverrides,
					...sessionPermissionPolicy ? { mode: resolveSessionPermissionExecMode(sessionPermissionPolicy) } : {},
					config: attempt.config,
					elevated: attempt.bashElevated
				},
				sandbox: params.sandbox,
				stagedMediaPaths: resolveStagedInputMediaPaths(attempt.media),
				sessionPermissionPolicy,
				messageProvider: resolveAttemptToolPolicyMessageProvider(attempt),
				agentAccountId: attempt.agentAccountId,
				messageTo: attempt.messageTo,
				messageThreadId: attempt.messageThreadId,
				nativeChannelId: attempt.chatId,
				messageActionTurnCapability: attempt.messageActionTurnCapability,
				groupId: attempt.groupId,
				groupChannel: attempt.groupChannel,
				groupSpace: attempt.groupSpace,
				memberRoleIds: attempt.memberRoleIds,
				spawnedBy: attempt.spawnedBy,
				senderId: attempt.senderId,
				channelContext: attempt.channelContext,
				senderName: attempt.senderName,
				senderUsername: attempt.senderUsername,
				senderE164: attempt.senderE164,
				senderIsOwner: attempt.senderIsOwner,
				allowGatewaySubagentBinding: attempt.allowGatewaySubagentBinding,
				sessionKey: params.sandboxSessionKey,
				runSessionKey: attempt.sessionKey && attempt.sessionKey !== params.sandboxSessionKey ? attempt.sessionKey : void 0,
				sessionId: attempt.sessionId,
				runId: attempt.runId,
				operationalRunInstance: attempt.admittedRunContext.operationalRunInstance,
				conversationRecall: attempt.conversationRecall,
				approvalReviewerDeviceId: attempt.approvalReviewerDeviceId,
				oneShotCliRun: attempt.oneShotCliRun,
				toolSearchCatalogRef,
				agentDir: params.agentDir,
				preparedModelRuntime: attempt.preparedModelRuntime,
				cwd: params.effectiveCwd,
				workspaceDir: params.effectiveWorkspace,
				spawnWorkspaceDir,
				config: toolSearchRuntimeConfig,
				sessionConfigSource: attempt.oneShotCliRun ? "pinned" : "runtime",
				webSearchEnabled: attempt.toolOverrides?.webSearch !== false,
				githubPublicationAvailable: attempt.githubPublicationAvailable,
				abortSignal,
				modelProvider: attempt.provider,
				modelId: attempt.modelId,
				skillWorkshop: {
					env: attempt.skillWorkshopProposalEnv,
					proposalOnly: attempt.skillWorkshopProposalOnly,
					...attempt.skillWorkshopUpdateProposals ? { updateProposals: true } : {},
					...attempt.skillWorkshopAutonomousCapture ? { autonomousCapture: true } : {},
					origin: attempt.skillWorkshopOrigin,
					proposalMutationBudget: attempt.skillWorkshopProposalMutationBudget,
					proposalReviewCompletion: attempt.skillWorkshopProposalReviewCompletion,
					collectionReconcile: attempt.skillWorkshopCollectionReconcile,
					proposalRevision: attempt.skillWorkshopProposalRevision,
					libraryAuthoring: attempt.skillLibraryAuthoring
				},
				modelCompat: extractModelCompat(attempt.model),
				modelApi: attempt.model.api,
				modelContextWindowTokens: attempt.contextTokenBudget ?? attempt.model.contextWindow,
				delegationCapability: attempt.delegationCapability,
				modelAuthMode: resolveModelAuthMode(attempt.model.provider, attempt.config, void 0, { workspaceDir: params.effectiveWorkspace }),
				currentChannelId: attempt.currentChannelId,
				currentMessagingTarget: attempt.currentMessagingTarget,
				currentThreadTs: attempt.currentThreadTs,
				currentMessageId: attempt.currentMessageId,
				includeCoreTools: toolConstructionPlan.includeCoreTools,
				includeToolSearchControls: toolSearchControlsEnabledForRun,
				toolSearchCatalogExecutor: params.toolSearchCatalogExecutor,
				toolConstructionPlan: toolConstructionPlan.codingToolConstructionPlan,
				replyToMode: attempt.replyToMode,
				hasRepliedRef: attempt.hasRepliedRef,
				modelHasVision: attempt.model.input?.includes("image") ?? false,
				computerContextEpoch,
				skillInstructionDeliveryCache,
				registerRunCleanup: (cleanup) => generationCleanups.push(cleanup),
				requireExplicitMessageTarget: attempt.requireExplicitMessageTarget ?? isSubagentSessionKey(attempt.sessionKey),
				sourceReplyDeliveryMode: attempt.sourceReplyDeliveryMode,
				taskSuggestionDeliveryMode: attempt.taskSuggestionDeliveryMode,
				inboundEventKind: attempt.currentInboundEventKind,
				disableMessageTool: attempt.disableMessageTool,
				forceMessageTool: attempt.forceMessageTool,
				enableHeartbeatTool: attempt.enableHeartbeatTool,
				forceHeartbeatTool: attempt.forceHeartbeatTool,
				runtimeToolAllowlist: effectiveToolsAllow,
				inheritedToolAllowlistRef: inheritedToolAllowlist,
				cronCreatorToolAllowlistRef: cronCreatorToolAllowlist,
				cronCreatorToolAllowlistCaptureRef,
				authProfileStore: attempt.authProfileStore,
				recordToolPrepStage: params.markCoreToolStage,
				onToolOutcome: attempt.onToolOutcome,
				isTurnTainted: attempt.isTurnTainted,
				allocateToolOutcomeOrdinal: attempt.allocateToolOutcomeOrdinal,
				skillsSnapshot: params.skillsSnapshot,
				skillUsagePaths: params.skillUsagePaths,
				conversationCapabilityProfile: runtimeCapabilityProfile,
				scheduledToolPolicy: attempt.scheduledToolPolicy,
				onYield: params.onYield
			});
			const boundTools = attempt.hostCapabilities ? attempt.hostCapabilities.bindToolSurface(allTools) : allTools;
			params.markCoreToolStage("attempt:create-openclaw-coding-tools");
			const filteredTools = applyEmbeddedAttemptToolsAllow(boundTools, effectiveToolsAllow, { toolMeta: (tool) => getPluginToolMeta(tool) });
			params.markCoreToolStage("attempt:tools-allow");
			return filteredTools;
		})();
		const toolsRaw = inspectingCodeModeRecovery ? constructedToolsRaw.filter((tool) => normalizeToolPolicyName(tool.name) === "read") : attempt.forceRestartSafeTools ? constructedToolsRaw.filter((tool) => isAgentToolRestartSafe(tool, restartSafetyOptions)) : constructedToolsRaw;
		if (attempt.forceRestartSafeTools) log$5.info(`restart-safe recovery tool policy retained ${toolsRaw.length}/${constructedToolsRaw.length} concrete tools`);
		return toolsRaw;
	};
	let toolAbortController = new AbortController();
	let toolAbortSignal = AbortSignal.any([params.runAbortController.signal, toolAbortController.signal]);
	const baseExecOverrides = { ...attempt.permissionChange?.baseExecOverrides ?? attempt.execOverrides };
	const toolsRaw = constructTools(params.sessionPermissionPolicy, toolAbortSignal);
	runCleanups.push(async (reason) => {
		toolAbortController.abort();
		retireToolGeneration(reason);
		await Promise.all(retiringGenerations);
	});
	return {
		get toolAbortSignal() {
			return toolAbortSignal;
		},
		refreshPermissionMode: (mode, revokeApprovals) => {
			toolAbortController.abort(createCodeModePermissionChangeReason());
			revokeApprovals();
			retireToolGeneration("cancel");
			params.runAbortController.signal.throwIfAborted();
			toolAbortController = new AbortController();
			toolAbortSignal = AbortSignal.any([params.runAbortController.signal, toolAbortController.signal]);
			attempt.permissionMode = mode ?? void 0;
			attempt.execOverrides = { ...baseExecOverrides };
			const policy = mode ? {
				root: params.sessionPermissionRoot,
				mode
			} : void 0;
			const nextTools = constructTools(policy, toolAbortSignal);
			toolsRaw.splice(0, toolsRaw.length, ...nextTools);
		},
		codeModeControlsEnabledForRun,
		codeModeSkills,
		computerContextEpoch,
		skillInstructionDeliveryCache,
		cronCreatorToolAllowlist,
		cronCreatorToolAllowlistCaptureRef,
		effectiveToolsAllow,
		forceDirectMessageTool,
		inheritedToolAllowlist,
		localModelLeanEnabled,
		localModelLeanPreserveToolNames,
		replaySafetyOptions,
		runtimeCapabilityProfile,
		runCleanups,
		toolSearchCatalogRef,
		toolSearchConfig,
		toolSearchControlsEnabledForRun,
		toolSearchRuntimeConfig,
		nestedToolActivities,
		toolsEnabled,
		toolsRaw
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-transcript-lifecycle.ts
/** Serializes run-owned transcript callbacks and bounds teardown settlement. */
const TRANSCRIPT_TEARDOWN_BUDGET_MS = 3e4;
function createEmbeddedAttemptTranscriptLifecycle(params) {
	let cleanupRequested = false;
	let disposed = false;
	let lifecycle = Promise.resolve();
	let cleanupDrain;
	let disposePromise;
	let pendingWrites = 0;
	let teardownBudgetLogged = false;
	const lifecycleOwner = new AsyncLocalStorage();
	const createLifecycleOwner = () => ({
		active: true,
		nestedPending: 0,
		nestedTail: Promise.resolve(),
		pendingOperations: /* @__PURE__ */ new Set()
	});
	const drainLifecycleOwner = async (owner) => {
		let firstError;
		while (owner.pendingOperations.size > 0) {
			const pending = [...owner.pendingOperations];
			owner.pendingOperations.clear();
			const rejected = (await Promise.allSettled(pending)).find((result) => result.status === "rejected");
			if (firstError === void 0 && rejected?.status === "rejected") firstError = toErrorObject(rejected.reason, "nested transcript write failed");
		}
		if (firstError !== void 0) throw firstError;
	};
	const runLifecycleOwner = async (owner, run) => {
		let value;
		let primaryError;
		try {
			value = await lifecycleOwner.run(owner, async () => await run());
		} catch (error) {
			primaryError = toErrorObject(error, "transcript write failed");
		}
		let drainError;
		try {
			await drainLifecycleOwner(owner);
		} catch (error) {
			drainError = toErrorObject(error, "nested transcript drain failed");
		} finally {
			owner.active = false;
		}
		if (primaryError !== void 0) {
			if (drainError !== void 0 && drainError !== primaryError && primaryError.cause === void 0) try {
				primaryError.cause = drainError;
			} catch {}
			throw primaryError;
		}
		if (drainError !== void 0) throw drainError;
		return value;
	};
	const serializeLifecycle = async (run) => {
		const inheritedOwner = lifecycleOwner.getStore();
		if (inheritedOwner?.active) {
			const waitForPrevious = inheritedOwner.nestedPending > 0 ? inheritedOwner.nestedTail : Promise.resolve();
			inheritedOwner.nestedPending += 1;
			const operation = waitForPrevious.then(async () => {
				const childOwner = createLifecycleOwner();
				return await runLifecycleOwner(childOwner, run);
			});
			const queueTail = operation.then(() => void 0, () => void 0);
			const propagated = operation.then(() => void 0);
			propagated.catch(() => {});
			inheritedOwner.nestedTail = queueTail;
			inheritedOwner.pendingOperations.add(propagated);
			queueTail.finally(() => {
				inheritedOwner.nestedPending -= 1;
			});
			return await operation;
		}
		const previous = lifecycle;
		let release;
		lifecycle = new Promise((resolve) => {
			release = resolve;
		});
		await previous;
		const owner = createLifecycleOwner();
		try {
			return await runLifecycleOwner(owner, run);
		} finally {
			release();
		}
	};
	const logTeardownBudgetExpiry = () => {
		if (teardownBudgetLogged) return;
		teardownBudgetLogged = true;
		log$5.error(`transcript teardown budget expired: runId=${params.runId ?? "unknown"} sessionId=${params.sessionId ?? "unknown"} pendingWrites=${pendingWrites} timeoutMs=${TRANSCRIPT_TEARDOWN_BUDGET_MS}`);
	};
	const settleWithinTeardownBudget = async (operation) => {
		let timeout;
		const settled = await Promise.race([operation.then(() => true), new Promise((resolve) => {
			timeout = setTimeout(() => resolve(false), TRANSCRIPT_TEARDOWN_BUDGET_MS);
			timeout.unref?.();
		})]);
		if (timeout) clearTimeout(timeout);
		if (!settled) {
			operation.catch(() => {});
			logTeardownBudgetExpiry();
		}
	};
	const beginCleanup = async () => {
		if (lifecycleOwner.getStore()?.active) throw new Error("cannot start attempt cleanup inside a transcript write callback");
		if (cleanupRequested) {
			if (cleanupDrain) await cleanupDrain;
			return;
		}
		cleanupRequested = true;
		cleanupDrain = settleWithinTeardownBudget(serializeLifecycle(() => {}));
		await cleanupDrain;
	};
	return {
		withTranscriptWrite: (run) => {
			const activeDescendant = lifecycleOwner.getStore()?.active === true;
			if ((cleanupRequested || disposed) && !activeDescendant) {
				const rejected = Promise.reject(/* @__PURE__ */ new Error(disposed ? "attempt disposed before transcript write" : "attempt cleanup started before transcript write"));
				rejected.catch(() => {});
				return rejected;
			}
			pendingWrites += 1;
			const operation = serializeLifecycle(run);
			operation.finally(() => {
				pendingWrites -= 1;
			}).catch(() => {});
			return operation;
		},
		beginCleanup,
		dispose: async () => {
			if (lifecycleOwner.getStore()?.active) throw new Error("cannot dispose an attempt from inside a transcript write callback");
			disposePromise ??= (async () => {
				await beginCleanup();
				disposed = true;
			})();
			await disposePromise;
		}
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-transcript-lifecycle-prepare.ts
/** Prepares the admitted writer context and teardown tracker for one attempt. */
async function prepareEmbeddedAttemptTranscriptLifecycle(input) {
	const { attempt, externalAbortController } = input;
	const initialWriter = getOwnedSessionTranscriptInitialWriter({
		sessionFile: attempt.sessionFile,
		sessionKey: attempt.sessionKey,
		sessionTarget: attempt.sessionManager?.getSessionTarget() ?? attempt.sessionTarget
	});
	const sessionTarget = await resolveAgentRunSessionTarget({
		agentId: attempt.sessionTarget?.agentId,
		config: attempt.config,
		missingSessionKey: "resolve-existing",
		sessionFile: attempt.sessionFile,
		sessionId: attempt.sessionId,
		sessionKey: attempt.sessionKey,
		sessionTarget: attempt.sessionTarget
	});
	await externalAbortController.throwIfFiredAfterPrepCleanup();
	initialWriter?.assertActive();
	const transcriptLifecycle = createEmbeddedAttemptTranscriptLifecycle({
		runId: attempt.runId,
		sessionId: attempt.sessionId
	});
	const fencedSessionTarget = {
		...sessionTarget,
		...attempt.sessionTarget?.expectedLifecycleRevision !== void 0 ? { expectedLifecycleRevision: attempt.sessionTarget.expectedLifecycleRevision } : {},
		...attempt.sessionTarget?.expectedWriterRunId !== void 0 ? { expectedWriterRunId: attempt.sessionTarget.expectedWriterRunId } : {}
	};
	const ownedTranscriptWriteContext = {
		sessionFile: attempt.sessionFile,
		sessionKey: attempt.sessionKey,
		sessionTarget: fencedSessionTarget,
		...initialWriter ? {
			initialWriter,
			assertCommitAllowed: () => attempt.abortSignal?.throwIfAborted()
		} : {},
		withTranscriptWrite: (operation) => transcriptLifecycle.withTranscriptWrite(operation)
	};
	const withOwnedTranscriptWrite = (operation) => withOwnedSessionTranscriptWrites(ownedTranscriptWriteContext, async () => transcriptLifecycle.withTranscriptWrite(operation));
	externalAbortController.arm();
	try {
		await externalAbortController.throwIfFiredAfterPrepCleanup();
	} catch (error) {
		await transcriptLifecycle.dispose();
		throw error;
	}
	return {
		compactionTimeoutMs: resolveCompactionTimeoutMs(attempt.config),
		ownedTranscriptWriteContext,
		transcriptLifecycle,
		withOwnedTranscriptWrite
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt.ts
/** Orchestrates one embedded-agent attempt from prompt setup through stream result. */
async function runEmbeddedAttempt(input) {
	// vlab91-native-attempt-bridge-v1: preserve native permission/lifecycle implementation.
	let params = globalThis[Symbol.for("versa.vlab.native-attempt-91-v1")]?.prepare(input) ?? input;
	const runAbortController = new AbortController();
	const { agentCoreThinkingLevel, effectiveCwd, effectiveFsWorkspaceOnly, effectiveWorkspace, emitCorePluginToolStageSummary, emitPrepStageSummary, getCurrentAttemptPluginMetadataSnapshot, getProviderRuntimeHandle, prepStages, proactiveSubagentOrchestration, providerThinkingLevel, resolvedWorkspace, sandbox, sandboxSessionKey, sessionPermissionRoot, sessionPermissionPolicy, sessionAgentId } = await measureEmbeddedAgentPreparation("attempt.setup", () => prepareEmbeddedAttemptSetup(params), { config: params.config });
	let restoreSkillEnv;
	const executionState = {
		beforeAgentRunBlockedBy: void 0,
		terminal: params.abortSignal?.aborted ? {
			kind: "aborted",
			source: "external"
		} : { kind: "ok" },
		trajectoryEndRecorded: false
	};
	const mergeTerminal = (incoming) => {
		executionState.terminal = mergeAgentRunAttemptTerminal(executionState.terminal, incoming);
	};
	let emitDiagnosticRunCompleted;
	let bundleMcpRuntime;
	let bundleLspRuntime;
	let toolSearchCatalogRef;
	let toolSearchCatalogApplied = false;
	let runCleanups = [];
	const cleanupEmbeddedPrepResourcesAfterEarlyExit = async () => {
		if (toolSearchCatalogApplied) {
			clearToolSearchCatalog({
				sessionId: params.sessionId,
				sessionKey: sandboxSessionKey,
				agentId: sessionAgentId,
				runId: params.runId,
				catalogRef: toolSearchCatalogRef
			});
			toolSearchCatalogApplied = false;
		}
		try {
			await bundleMcpRuntime?.dispose();
		} catch {} finally {
			bundleMcpRuntime = void 0;
		}
		try {
			await bundleLspRuntime?.dispose();
		} catch {} finally {
			bundleLspRuntime = void 0;
		}
	};
	const abortState = {
		markAborted: () => mergeTerminal({
			kind: "aborted",
			source: runAbortController.signal.reason === SESSIONS_YIELD_ABORT_REASON ? "yield_cleanup" : "runtime"
		}),
		markExternalAbort: () => mergeTerminal({
			kind: "aborted",
			source: "external"
		}),
		markTimedOut: () => mergeTerminal({
			kind: "timeout",
			phase: "prompt",
			source: "runtime"
		}),
		markTimedOutDuringCompaction: () => mergeTerminal({
			kind: "timeout",
			phase: "compaction",
			source: "observation"
		}),
		markTimedOutDuringToolExecution: () => mergeTerminal({
			kind: "timeout",
			phase: "tool_execution",
			source: "observation"
		}),
		readTimedOutDuringCompaction: () => projectAgentRunAttemptTerminal(executionState.terminal).timedOutDuringCompaction,
		setPromptError: (error) => mergeTerminal({
			kind: "failed",
			source: "prompt",
			error
		})
	};
	const externalAbortController = createEmbeddedAttemptExternalAbortController({
		abortSignal: params.abortSignal,
		cleanupAfterEarlyAbort: cleanupEmbeddedPrepResourcesAfterEarlyExit,
		runAbortController,
		runId: params.runId,
		state: abortState
	});
	const prepare = createEmbeddedAttemptPreparation({
		config: params.config,
		assertCurrent: externalAbortController.throwIfFired
	});
	try {
		const preparedSkills = await prepare("attempt.skills", () => prepareEmbeddedAttemptSkills({
			attempt: params,
			effectiveWorkspace,
			sandbox,
			sessionAgentId
		}));
		restoreSkillEnv = preparedSkills.restoreSkillEnv;
		const { codeModeSkills, skillUsagePaths, skillsPrompt, skillsSnapshotForRun } = preparedSkills;
		if (params.skillsSnapshot?.librarySelections?.length && sandbox?.enabled) {
			const remapped = remapSkillReferencePaths(params.prompt, skillUsagePaths);
			if (remapped !== params.prompt) params = {
				...params,
				prompt: remapped,
				transcriptPrompt: params.transcriptPrompt ?? params.prompt
			};
		}
		prepStages.mark("skills");
		const isRawModelRun = params.modelRun === true || params.promptMode === "none";
		if (isRawModelRun && log$5.isEnabled("debug")) log$5.debug(`raw model run enabled: modelRun=${params.modelRun === true} promptMode=${params.promptMode ?? "unset"}`);
		const activeContextEngine = isRawModelRun ? void 0 : params.contextEngine;
		if (activeContextEngine && activeContextEngine.info.id !== "legacy") assertContextEngineHostSupport({
			contextEngine: activeContextEngine,
			operation: "agent-run",
			host: OPENCLAW_EMBEDDED_CONTEXT_ENGINE_HOST
		});
		const resolveActiveContextEnginePluginId = () => resolveContextEngineOwnerPluginId(activeContextEngine);
		const agentDir = params.agentDir ?? resolveAgentDir(params.config ?? {}, sessionAgentId);
		const { diagnosticTrace, runTrace, emitCompleted } = startEmbeddedAttemptDiagnostics(params);
		emitDiagnosticRunCompleted = emitCompleted;
		const corePluginToolStages = createEmbeddedRunStageTracker();
		let toolSearchCatalogExecutor;
		const preparedToolBase = await prepare("attempt.tool-base", () => prepareEmbeddedAttemptToolBase({
			agentDir,
			attempt: params,
			effectiveCwd,
			effectiveWorkspace,
			markCoreToolStage: (name) => corePluginToolStages.mark(name),
			onYield: (message, acknowledgment) => {
				yieldDetected = true;
				yieldMessage = message;
				yieldAcknowledgment = acknowledgment;
				queueYieldInterruptForSession?.();
				runAbortController.abort(SESSIONS_YIELD_ABORT_REASON);
				abortSessionForYield?.();
			},
			resolvedWorkspace,
			runAbortController,
			runTrace,
			sandbox,
			sandboxSessionKey,
			sessionPermissionPolicy,
			sessionPermissionRoot,
			sessionAgentId,
			skillUsagePaths,
			skillsSnapshot: skillsSnapshotForRun,
			codeModeSkills,
			toolSearchCatalogExecutor: (toolParams) => {
				if (!toolSearchCatalogExecutor) throw new Error("Tool Search catalog executor is unavailable for this run.");
				return toolSearchCatalogExecutor(toolParams);
			}
		}));
		toolSearchCatalogRef = preparedToolBase.toolSearchCatalogRef;
		const { codeModeControlsEnabledForRun, computerContextEpoch, localModelLeanEnabled, replaySafetyOptions, runCleanups: preparedRunCleanups, toolSearchControlsEnabledForRun, toolSearchRuntimeConfig, toolsEnabled, toolsRaw } = preparedToolBase;
		runCleanups = preparedRunCleanups;
		prepStages.mark("core-plugin-tools");
		emitCorePluginToolStageSummary("core-plugin-tools", corePluginToolStages.snapshot());
		const preparedBootstrap = await prepare("attempt.bootstrap", () => prepareEmbeddedAttemptBootstrap({
			attempt: params,
			bootstrapWorkspaceDir: params.bootstrapWorkspaceDir,
			effectiveWorkspace,
			hasReadTool: toolsEnabled && toolsRaw.some((tool) => tool.name === "read"),
			isRawModelRun,
			markStage: (name) => prepStages.mark(name),
			resolvedWorkspace,
			sessionAgentId,
			sessionLabel: params.sessionKey ?? params.sessionId
		}));
		let yieldDetected = false;
		let yieldMessage = null;
		let yieldAcknowledgment;
		let abortSessionForYield = null;
		let queueYieldInterruptForSession = null;
		let yieldAbortSettled = null;
		const preparedBundleTools = await prepare("attempt.bundle-tools", () => prepareEmbeddedAttemptBundleTools({
			agentDir,
			attempt: params,
			effectiveWorkspace,
			getCurrentAttemptPluginMetadataSnapshot,
			getProviderRuntimeHandle,
			isRawModelRun,
			preparedToolBase,
			sessionAgentId
		}));
		bundleMcpRuntime = preparedBundleTools.bundleMcpRuntime;
		bundleLspRuntime = preparedBundleTools.bundleLspRuntime;
		const { clientTools, uncompactedEffectiveTools } = preparedBundleTools;
		toolSearchCatalogApplied = toolSearchCatalogRef !== void 0;
		const preparedToolCatalog = await prepare("attempt.tool-catalog", () => prepareEmbeddedAttemptToolCatalog({
			attempt: params,
			preparedToolBase,
			bundleTools: {
				clientTools,
				uncompactedEffectiveTools
			},
			effectiveCwd,
			effectiveWorkspace,
			sessionAgentId,
			sandboxSessionKey,
			runTrace,
			abortSignal: runAbortController.signal,
			executeCodeModeTool: (toolParams) => {
				if (!toolSearchCatalogExecutor) throw new Error("Code Mode catalog executor is unavailable for this run.");
				return toolSearchCatalogExecutor(toolParams);
			},
			getProviderRuntimeHandle,
			markStage: (name) => prepStages.mark(name)
		}));
		const { catalogToolHookContext, deferredDirectoryToolsCallable, effectiveTools, toolSearch, toolSearchRunPlan } = preparedToolCatalog;
		toolSearchCatalogApplied = toolSearch.catalogRegistered;
		const preparedSystemPrompt = await prepare("attempt.system-prompt", () => prepareEmbeddedAttemptSystemPrompt({
			activeContextEngine,
			attempt: params,
			bootstrap: preparedBootstrap,
			capabilityToolNames: toolSearchRunPlan.capabilityToolNames,
			effectiveCwd,
			effectiveTools,
			effectiveWorkspace,
			getProviderRuntimeHandle,
			isRawModelRun,
			markStage: (name) => prepStages.mark(name),
			modelToolsEnabled: toolsEnabled,
			proactiveSubagentOrchestration,
			sandbox: sandbox ?? void 0,
			sandboxSessionKey,
			sessionAgentId,
			skillsPrompt,
			codeModeActive: codeModeControlsEnabledForRun,
			toolSearchCatalogRef,
			toolSearchDirectoryEnabled: toolSearchControlsEnabledForRun && toolSearch.catalogRegistered,
			toolSearchRuntimeConfig
		}));
		let sessionManager;
		const { compactionTimeoutMs, ownedTranscriptWriteContext, transcriptLifecycle, withOwnedTranscriptWrite } = await prepare("attempt.transcript-lifecycle", () => prepareEmbeddedAttemptTranscriptLifecycle({
			attempt: params,
			externalAbortController
		}));
		let session;
		let removeToolResultContextGuard;
		let trajectoryRecorder = null;
		let buildAbortSettlePromise = () => null;
		try {
			const preparedSessionRuntime = await prepare("attempt.session-runtime", () => prepareEmbeddedAttemptSessionRuntime({
				attempt: params,
				...activeContextEngine ? { activeContextEngine } : {},
				agentDir,
				effectiveCwd,
				effectiveFsWorkspaceOnly,
				effectiveWorkspace,
				initialSystemPrompt: preparedSystemPrompt.systemPromptText,
				isRawModelRun,
				nestedToolActivities: preparedToolBase.nestedToolActivities,
				sessionManager: {
					replayAllowedToolNames: toolSearchRunPlan.replayAllowedToolNames,
					resolveActiveContextEnginePluginId,
					sessionAgentId,
					transcriptLifecycle,
					withOwnedTranscriptWrite
				},
				agentSession: {
					agentCoreThinkingLevel,
					clientToolPreparation: {
						catalogToolHookContext,
						clientTools,
						codeModeControlsEnabledForRun,
						deferredDirectoryToolsCallable,
						effectiveTools,
						replaySafetyOptions,
						sandboxEnabled: Boolean(sandbox?.enabled),
						sandboxSessionKey,
						sessionAgentId,
						toolSearchCatalogRef,
						toolSearchRuntimeConfig,
						uncompactedEffectiveTools,
						getToolAbortSignal: () => preparedToolBase.toolAbortSignal
					},
					getCurrentAttemptPluginMetadataSnapshot,
					markStage: (stage) => prepStages.mark(stage),
					runAbortSignal: runAbortController.signal
				},
				contextGuards: { computerContextEpoch },
				trajectory: {
					effectiveToolCount: effectiveTools.length,
					localModelLeanEnabled,
					...preparedSystemPrompt.systemPromptReport ? { systemPromptReport: preparedSystemPrompt.systemPromptReport } : {}
				},
				transport: {
					abortSignal: runAbortController.signal,
					codeModeControlsEnabled: codeModeControlsEnabledForRun,
					getProviderRuntimeHandle,
					providerThinkingLevel,
					...sandbox !== void 0 ? { sandbox } : {},
					sandboxSessionKey
				},
				externalAbortController,
				lifecycle: {
					onContextGuardsInstalled: (remove) => {
						removeToolResultContextGuard = remove;
					},
					onSessionCreated: (createdSession) => {
						session = createdSession;
					},
					onSessionManagerCreated: (createdSessionManager) => {
						sessionManager = createdSessionManager;
					},
					onSessionSettleTrackerReady: (build) => {
						buildAbortSettlePromise = build;
					},
					onSessionYieldReady: ({ abortActiveSession, activeSession }) => {
						abortSessionForYield = () => {
							yieldAbortSettled = abortActiveSession(SESSIONS_YIELD_ABORT_REASON);
						};
						queueYieldInterruptForSession = () => {
							queueSessionsYieldInterruptMessage(activeSession);
						};
					},
					onTrajectoryRecorderCreated: (recorder) => {
						trajectoryRecorder = recorder;
					}
				}
			}));
			const promptToolPolicy = createPromptBuildToolPolicy({
				session: preparedSessionRuntime.agentSession.activeSession,
				effectiveTools,
				uncompactedEffectiveTools,
				tools: preparedBundleTools.tools,
				catalogRef: preparedToolBase.toolSearchCatalogRef,
				codeModeControlsEnabled: preparedToolBase.codeModeControlsEnabledForRun,
				coreReadAuthorized: preparedSessionRuntime.agentSession.coreReadAuthorized,
				onApplied: (surface) => {
					const allowedNames = /* @__PURE__ */ new Set([...surface.activeToolNames, ...surface.uncompactedEffectiveTools.map((tool) => tool.name)]);
					preparedToolCatalog.applyPromptToolPolicy(allowedNames);
					preparedSessionRuntime.agentSession.setCodeModeReconciliationReadAuthorized(surface.coreReadAuthorized);
				},
				forceToolNames: [...preparedToolBase.forceDirectMessageTool ? ["message"] : [], ...params.swarmCollector && params.swarmOutputSchema ? ["structured_output"] : []]
			});
			const executionResult = await runEmbeddedAttemptExecutionPhase({
				attempt: params,
				...activeContextEngine ? { activeContextEngine } : {},
				agentDir,
				isRawModelRun,
				resolveActiveContextEnginePluginId,
				runAbortController,
				externalAbortController,
				abortState,
				prepared: {
					bootstrap: preparedBootstrap,
					bundleTools: preparedBundleTools,
					sessionRuntime: preparedSessionRuntime,
					systemPrompt: preparedSystemPrompt,
					toolBase: preparedToolBase,
					toolCatalog: preparedToolCatalog,
					promptToolPolicy
				},
				sessionLock: {
					compactionTimeoutMs,
					ownedTranscriptWriteContext,
					withOwnedTranscriptWrite
				},
				setup: {
					effectiveFsWorkspaceOnly,
					effectiveWorkspace,
					emitPrepStageSummary,
					prepStages,
					sandbox,
					sandboxSessionKey,
					sessionAgentId
				},
				diagnostics: {
					diagnosticTrace,
					runTrace
				},
				state: executionState,
				lifecycle: {
					applyPermissionMode: (mode, revokeApprovals) => {
						preparedToolBase.refreshPermissionMode(mode, revokeApprovals);
						preparedBundleTools.refreshTools();
						preparedToolCatalog.refreshTools();
						preparedSessionRuntime.agentSession.refreshTools();
						promptToolPolicy.refresh();
						const preparePermissionPrompt = preparedSystemPrompt.preparePermissionPrompt;
						preparedSessionRuntime.agentSession.setPermissionPromptPreparation(preparePermissionPrompt ? () => preparePermissionPrompt(promptToolPolicy.current.effectiveTools) : void 0);
						params.permissionChange?.recordApplied(mode);
					},
					readYieldState: () => ({
						yieldAbortSettled,
						yieldDetected,
						yieldMessage,
						yieldAcknowledgment
					}),
					setToolSearchCatalogExecutor: (executor) => {
						toolSearchCatalogExecutor = executor;
					}
				}
			});
			const catalogSession = toolSearchCatalogRef?.current;
			return {
				...executionResult,
				codeModeEngaged: codeModeControlsEnabledForRun,
				providerRetryMaxRetries: preparedSessionRuntime.agentSession.settingsManager.getProviderRetrySettings().maxRetries,
				...catalogSession ? { bridgeCalls: {
					search: catalogSession.searchCount,
					describe: catalogSession.describeCount,
					call: catalogSession.callCount
				} } : {}
			};
		} finally {
			const terminal = projectAgentRunAttemptTerminal(executionState.terminal);
			await cleanupEmbeddedAttemptSessionPhase({
				attempt: params,
				session,
				sessionManager,
				transcriptLifecycle,
				bundleMcpRuntime,
				bundleLspRuntime,
				removeToolResultContextGuard,
				toolSearchCatalogRef,
				sandboxSessionKey,
				sessionAgentId,
				buildAbortSettlePromise,
				trajectoryRecorder,
				trajectoryEndRecorded: executionState.trajectoryEndRecorded,
				deferredLifecycleOwner: executionState.deferredLifecycleOwner,
				cleanupYieldAborted: terminal.cleanupYieldAborted,
				emitDiagnosticRunCompleted,
				readState: () => ({
					...projectAgentRunAttemptTerminal(executionState.terminal),
					beforeAgentRunBlockedBy: executionState.beforeAgentRunBlockedBy
				})
			});
		}
	} catch (error) {
		const terminalOutcome = buildAgentRunTerminalOutcomeFromAttempt({
			terminal: executionState.terminal,
			abortSignal: params.abortSignal
		});
		if (terminalOutcome.status === "timeout") throw new AgentRunTerminalOutcomeError(error, terminalOutcome);
		throw error;
	} finally {
		const cleanupTerminal = projectAgentRunAttemptTerminal(executionState.terminal);
		const cleanupReason = cleanupTerminal.timedOut || cleanupTerminal.timedOutDuringCompaction || cleanupTerminal.timedOutDuringToolExecution ? "timeout" : cleanupTerminal.aborted ? "cancel" : cleanupTerminal.failed ? "error" : "completion";
		const cleanups = runCleanups.splice(0);
		await Promise.allSettled(cleanups.map(async (cleanup) => await cleanup(cleanupReason)));
		externalAbortController.dispose();
		clearToolActivityRun(params.runId);
		try {
			await cleanupEmbeddedPrepResourcesAfterEarlyExit();
		} catch (cleanupErr) {
			log$5.warn(`failed to clean up embedded prep resources after early attempt exit: runId=${params.runId} ${String(cleanupErr)}`);
		}
		const terminal = projectAgentRunAttemptTerminal(executionState.terminal);
		emitDiagnosticRunCompleted?.(terminal.aborted ? "aborted" : "error", terminal.promptError ?? /* @__PURE__ */ new Error("run exited before diagnostic completion"));
		restoreSkillEnv?.();
	}
}
//#endregion
//#region src/agents/harness/builtin-openclaw.ts
/**
* Built-in OpenClaw harness registration.
*
* Harness selection uses this factory to expose the embedded OpenClaw runtime
* through the same AgentHarness contract as external harness plugins.
*/
const builtInOpenClawHarnesses = /* @__PURE__ */ new WeakSet();
function buildRestrictedFinalizationAttempt(attempt) {
	return {
		admittedRunContext: attempt.admittedRunContext,
		sessionId: attempt.sessionId,
		sessionKey: attempt.sessionKey,
		sessionTarget: attempt.sessionTarget,
		lifecycleGeneration: attempt.lifecycleGeneration,
		promptCacheKey: attempt.promptCacheKey,
		sandboxSessionKey: attempt.sandboxSessionKey,
		agentId: attempt.agentId,
		workspaceDir: attempt.workspaceDir,
		cwd: attempt.cwd,
		agentDir: attempt.agentDir,
		config: attempt.config,
		prompt: attempt.prompt,
		timeoutMs: attempt.timeoutMs,
		runTimeoutOverrideMs: attempt.runTimeoutOverrideMs,
		runId: attempt.runId,
		abortSignal: attempt.abortSignal,
		onExecutionStarted: attempt.onExecutionStarted,
		onExecutionPhase: attempt.onExecutionPhase,
		onLaneWait: attempt.onLaneWait,
		onRunProgress: attempt.onRunProgress,
		onAttemptTimeoutArmed: attempt.onAttemptTimeoutArmed,
		onAttemptDeadlineChanged: attempt.onAttemptDeadlineChanged,
		onAttemptTimeout: attempt.onAttemptTimeout,
		onAttemptAbort: attempt.onAttemptAbort,
		preparedModelRuntime: attempt.preparedModelRuntime,
		sessionFile: attempt.sessionFile,
		prepareAssistantTranscriptMessage: attempt.prepareAssistantTranscriptMessage,
		contextTokenBudget: attempt.contextTokenBudget,
		contextWindowInfo: attempt.contextWindowInfo,
		resolvedApiKey: attempt.resolvedApiKey,
		authProfileId: attempt.authProfileId,
		authProfileIdSource: attempt.authProfileIdSource,
		provider: attempt.provider,
		modelId: attempt.modelId,
		requestedModelId: attempt.requestedModelId,
		agentHarnessId: attempt.agentHarnessId,
		runtimePlan: attempt.runtimePlan,
		model: attempt.model,
		authStorage: attempt.authStorage,
		authProfileStore: attempt.authProfileStore,
		toolAuthProfileStore: attempt.toolAuthProfileStore,
		modelRegistry: attempt.modelRegistry,
		thinkLevel: attempt.thinkLevel,
		fastMode: attempt.fastMode,
		fastModeAuto: attempt.fastModeAuto,
		operation: "settled-tool-finalization",
		disableTools: true,
		disableTrajectory: true,
		skipPreparedUserTurnMessage: true,
		suppressNextUserMessagePersistence: true,
		initialReplayState: {
			replayInvalid: false,
			hadPotentialSideEffects: false
		}
	};
}
/** Creates the built-in harness backed by the embedded OpenClaw agent runner. */
function createOpenClawAgentHarness() {
	const harness = {
		id: "openclaw",
		label: "OpenClaw embedded agent",
		contextEngineHostCapabilities: OPENCLAW_EMBEDDED_CONTEXT_ENGINE_HOST.capabilities,
		supports: () => ({
			supported: true,
			priority: 0
		}),
		runAttempt: (params) => runEmbeddedAttempt(params),
		runIsolatedCompletionV2: runHostPreparedIsolatedCompletion,
		finalizeSettledTurn: async ({ attempt }) => {
			const result = await runEmbeddedAttempt(buildRestrictedFinalizationAttempt(attempt));
			return projectSettledTurnFinalizationAttemptResult(result);
		}
	};
	builtInOpenClawHarnesses.add(harness);
	return harness;
}
/** Distinguishes the internal runtime from an untrusted harness that copies its public id. */
function isBuiltInOpenClawAgentHarness(harness) {
	return builtInOpenClawHarnesses.has(harness);
}
//#endregion
export { resolveEmbeddedRunAttemptTerminalOutcome as $, resolveSilentToolResultReplyPayload as A, hasAttemptTerminalState as B, createAttemptCarryover as C, resolveIncompleteTurnPayloadText as D, hasYieldContinuationEvidence as E, resolveSettledToolTerminalContinuationInstruction as F, prepareEmbeddedAttemptPromptExecution as G, isCurrentAttemptReplaySafe as H, shouldRetrySilentErrorAssistantTurn as I, timestampOptsFromConfig as J, applyResolvedToolPromptFinalizer as K, shouldTreatEmptyAssistantReplyAsSilent as L, resolveEmptyResponseRetryInstruction as M, resolveReasoningOnlyRetryInstruction as N, resolveReplayInvalidFlag as O, resolveSettledToolBatchEvidence as P, isEmbeddedRunTimeoutFinal as Q, isStrictAgenticExecutionContractActive as R, markLastProviderPromptContextRejected as S, YIELD_DIAGNOSTIC_TEXT as T, resolveCurrentAttemptAssistant as U, hasNonToolTerminalState as V, shouldContinueInteractiveAcceptedSessionSpawns as W, isEmbeddedRunTerminalInterrupted as X, isEmbeddedRunTerminalAbort as Y, isEmbeddedRunTerminalTimeout as Z, createPreparedEmbeddedAgentSettingsManager as _, isBenignCompactionSkipReason as _t, collectAllowedToolNames as a, flushPendingToolResultsAfterIdle as at, clearProviderPromptState as b, applySystemPromptToSession as c, EMBEDDED_RUN_ATTEMPT_DISPATCH_STAGE as ct, hasMeaningfulConversationContent as d, formatEmbeddedRunStageSummary as dt, resolveEmbeddedRunAttemptTerminalState as et, isRealConversationMessage as f, createMessageCharEstimateCache as ft, setCompactionSafeguardCancellation as g, formatUnknownCompactionReasonDetail as gt, getCompactionSafeguardRuntime as h, classifyCompactionReason as ht, advanceCodeModeRecovery as i, emitAgentActivityEvent as it, shouldRetryMissingAssistantTurn as j, resolveRunLivenessState as k, buildEmbeddedSystemPrompt as l, createEmbeddedRunStageSummaryEmitter as lt, consumeCompactionSafeguardCancellation as m, DEFERRED_CONTEXT_ENGINE_COMPACTION_REASON as mt, isBuiltInOpenClawAgentHarness as n, observeReplayMetadata as nt, collectRegisteredToolNames as o, logRuntimeToolSchemaQuarantine as ot, readPostCompactionContext as p, estimateMessageCharsCached as pt, injectTimestamp as q, prepareAgentMemoryPrompt as r, createToolTerminalObserver as rt, toSessionToolAllowlist as s, resolveAttemptWorkspaceSandbox as st, createOpenClawAgentHarness as t, createEmbeddedRunReplayState as tt, buildEmbeddedExtensionFactories as u, createEmbeddedRunStageTracker as ut, measureEmbeddedAgentPreparation as v, isBenignCompactionSkipResult as vt, TRUNCATED_REPLY_NOTICE_TEXT as w, getProviderPromptState as x, createDeferredEmbeddedRunLifecycleManager as y, resolveCompactionFailure as yt, hasAsyncActivity as z };
