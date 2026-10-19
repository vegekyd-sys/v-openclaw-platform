// gpt-live-call-terminal-v1: exact embedded terminal state
import "./number-coercion-CLj0HTDM.js";
import { t as sanitizeForLog } from "./ansi-DrXAcdMD.js";
import { l as toErrorObject } from "./error-coercion-CwcmpTBO.js";
import { c as isRecord } from "./record-coerce-DItp3I4t.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { c as resolveUserPath } from "./home-dir-BPhrG-aM.js";
import "./utils-D3A1hGii.js";
import { s as sleepWithAbort } from "./src-BQ327IOM.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { D as freezeDiagnosticTraceContext, n as emitDiagnosticEvent, t as areDiagnosticsEnabledForProcess } from "./diagnostic-events-D_BPObBj.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { r as normalizeProviderId } from "./provider-id-DMd-TDFp.js";
import { t as MODEL_APIS } from "./types.models-Z6EPRVI_.js";
import { n as SILENT_REPLY_TOKEN } from "./tokens-DbeAFqg7.js";
import { a as loadPluginMetadataSnapshot } from "./plugin-metadata-snapshot-BuNx7zRZ.js";
import { m as resolveAgentWorkspaceDir, u as resolveAgentDir } from "./agent-scope-config-CUiGBd59.js";
import { O as parseAgentSessionKey, f as resolveAgentIdFromSessionKey } from "./session-key-CRjxKW0X.js";
import { t as isIncognitoSessionKey } from "./incognito-session-key-BwpD1Lwd.js";
import { c as normalizeToolPolicyName } from "./tool-policy-shared-D_3SrG-g.js";
import "./tool-policy-De2653Mj.js";
import { o as resolveSessionStorePathCore } from "./paths-DDTeIhCT.js";
import { a as getRuntimeConfigSnapshot } from "./runtime-snapshot-BVoUH4MI.js";
import { r as resolveProviderModelRoutes } from "./provider-model-routes-Cn00-XJH.js";
import { a as normalizeOptionalAgentRuntimeId } from "./agent-runtime-id-CYhl-5UQ.js";
import { T as resolvePreparedModelThinkingCompat, i as buildModelAliasIndex, y as resolveModelRefFromString } from "./model-selection-shared-BUMiYTyL.js";
import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-CdX9UGcX.js";
import { _ as resolveSessionAgentId, g as resolveRunModelFallbacksOverride, h as resolveModelFallbackAvailability, y as resolveSessionAgentIds } from "./agent-scope-CSlN0kZb.js";
import { r as resolvePersistedSessionStoreOwnerForTarget } from "./session-store-owner-Df_uY3tv.js";
import { r as modelMatchesProviderModelRoute } from "./provider-model-route-BCOOXxji.js";
import { t as resolveDefaultModelForAgent } from "./model-selection-config-bdtzr00S.js";
import { c as resolveContextConfigProviderForRuntime, d as resolveSelectedOpenAIRuntimeProvider, n as OPENAI_PROVIDER_ID } from "./openai-routing-ChWi-Lfh.js";
import { s as providerModelRouteAcceptsAuthMode } from "./openai-model-routes-Cz6pbfIt.js";
import "./config-Cv60gBux.js";
import { c as resolveSecretSentinel, o as looksLikeSecretSentinel } from "./sentinel-ZgmfESkJ.js";
import { c as resolveSafeTimeoutDelayMs } from "./timeouts-D2XMKe-X.js";
import { c as getAgentEventLifecycleGeneration, f as onAgentEventForRun, l as isAgentEventLifecycleGenerationCurrent, n as captureAgentRunLifecycleGeneration, o as emitAgentEventIfCurrent, t as assertAgentRunLifecycleGenerationCurrent, v as withAgentRunLifecycleGeneration } from "./agent-events-Con5xUCM.js";
import { S as retainQueuedAgentRunContext, c as getAgentRunContext, h as registerAgentRunContext, r as claimAgentRunContext } from "./agent-run-registry-D84MDeZl.js";
import { w as requireActivePluginRegistry } from "./runtime-MupoouIC.js";
import { r as getGatewayContextResolver } from "./gateway-request-scope-CmMd3nUp.js";
import { l as retireSessionMcpRuntime, u as retireSessionMcpRuntimeForSessionKey } from "./agent-bundle-mcp-manager-api-Bk_6h3Rj.js";
import "./backoff-BkMI1WEL.js";
import { t as isIncognitoOpenClawAgentSqlitePath } from "./openclaw-agent-db.paths-DYna80bS.js";
import "./openclaw-agent-db-CUTe8BX6.js";
import { n as SecretSurfaceUnavailableError } from "./runtime-degraded-state-D5EZZ925.js";
import { t as OAuthRefreshFailureError } from "./oauth-refresh-failure-FDM8bCmh.js";
import { t as getGlobalHookRunner } from "./hook-runner-global-DLqoAE5f.js";
import { n as inheritRuntimeCompactionDelegate, t as bindContextEngineCompaction } from "./compaction-watchdog-D-CcgAHX.js";
import { l as resolveContextEngine, u as resolveContextEngineOwnerPluginId } from "./registry-BdPa2vko.js";
import { n as withPluginRuntimeGenerationScope } from "./generation-scope-CcvBHxkU.js";
import { g as markReplyPayloadForSourceSuppressionDelivery, i as copyReplyPayloadMetadata, t as FAST_MODE_AUTO_PROGRESS_KIND, y as setReplyPayloadMetadata } from "./reply-payload-DahKk-7n.js";
import { n as normalizeMessageChannel } from "./message-channel-core-D0_xUNNr.js";
import { c as runWithoutOwnedSessionTranscriptWrites, t as SessionTranscriptWriterClaimReboundError, u as withOwnedSessionTranscriptWrites } from "./transcript-write-context-mhuh2Sos.js";
import { p as resolveProviderRuntimePluginHandle, s as resolveProviderAuthProfileId, t as attachModelProviderRuntimePluginHandle } from "./provider-hook-runtime-CsaSWxqC.js";
import { E as recordRuntimeAuthMaterialization, O as revokeRuntimeAuthMaterializations } from "./runtime-snapshots-C1iF8uaR.js";
import { a as ensureAuthProfileStoreWithoutExternalProfiles, r as ensureAuthProfileStore } from "./store-CZzbMlii.js";
import { n as markAuthProfileSuccess } from "./profiles-B5t6mBHL.js";
import { r as resolveSubscriptionAuthModeForProfiles } from "./profile-list-sI6O2eVg.js";
import { o as isProfileInCooldown } from "./usage-state-C0QBjJnZ.js";
import { n as resolveProviderEndpoint } from "./provider-attribution-CGOGO3H1.js";
import { a as getModelProviderRequestRouteFacts, t as applyPreparedRuntimeAuthToModel } from "./provider-request-config-BsyiChYr.js";
import { t as redactIdentifier } from "./redact-identifier-BRudYwZN.js";
import { t as sanitizeForConsole } from "./console-sanitize-NjY4pEOW.js";
import { a as markAuthProfileFailure, d as resolveProfilesUnavailableReason, o as markInlineProviderApiKeyFailure } from "./usage-CWqpxTil.js";
import { a as resolveRetryAfterMs, n as isTerminalAssistantError, o as isProviderRefusalAssistantError, r as classifyRateLimitWindow, t as isRetryableAssistantError } from "./retry-D8sSkt2R.js";
import { a as resolveLegacyInheritedAuthDir } from "./legacy-inherited-auth-dir-DFUw26T1.js";
import { a as unwrapSecretSentinelsForProviderEgress, t as protectPreparedProviderRuntimeAuth } from "./provider-secret-egress-Be7E79mv.js";
import { g as prepareProviderRuntimeAuth } from "./provider-runtime-BqO0YRlw.js";
import "./sessions-CHgQo4vL.js";
import { c as normalizeUsage, t as deriveContextPromptTokens } from "./usage-CtmV8Xxq.js";
import { i as isFailoverErrorMessage, m as parseImageSizeError, p as parseImageDimensionError, s as isLikelyContextOverflowError, t as classifyFailoverReason } from "./classify-Dm9sTbZz.js";
import { f as isTimeoutErrorMessage, l as isProviderRequestSizeCeilingError } from "./message-patterns-DUJIJ5zt.js";
import { r as hasOnlyAssistantReasoningContent } from "./ai-transport-runtime-host-BCAHK6CH.js";
import { i as buildUsageWithNoCost, n as buildAssistantMessage } from "./stream-message-shared-Cyrn1UHN.js";
import { a as listSessionEntriesReadOnly, d as loadSessionEntry, f as loadSessionEntryReadOnly, p as patchSessionEntryCore } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import "./message-channel-normalize-DzpgR6ro.js";
import { o as isMarkdownCapableMessageChannel } from "./message-channel-BGKf9KPa.js";
import { n as parseSqliteSessionFileMarker, t as formatSqliteSessionFileMarker } from "./legacy-sqlite-marker-COPKCuIN.js";
import { N as resolveSessionTranscriptRuntimeTarget, _t as appendTranscriptMessage, mt as updateSessionEntry } from "./session-accessor-K0XuW6ln.js";
import { n as canonicalizeMainSessionAlias, r as resolveAgentMainSessionKey } from "./main-session-TZQkcBLs.js";
import { t as SessionManager } from "./session-manager-CNTG_BAJ.js";
import { i as resolveLiveToolResultMaxChars } from "./tool-result-limits-DdMvF_Ec.js";
import { a as resolveAgentHarnessPreparedAuthSupport, o as resolveAgentHarnessPreparedRouteSupport } from "./availability-CAyTTQQq.js";
import { a as resolveCandidateThinkingLevel } from "./thinking-runtime-CMnVn0Uq.js";
import { r as resolveModelCandidateChain } from "./model-fallback-candidates-B-mHEN3S.js";
import { t as MissingProviderAuthError } from "./model-auth-runtime-shared-C48YoQY0.js";
import { n as acquireReadOnlyPreparedModelRuntime, t as acquireAgentRunPreparedModelRuntime } from "./prepared-model-runtime-C1N_aVhw.js";
import { i as withPreparedModelRuntimePluginGenerationScope, n as getPreparedModelRuntimePluginGeneration } from "./prepared-model-runtime-generation-scope-o4umnoSw.js";
import "./auth-profiles-DvLkLvBr.js";
import { s as isConfigBackedInlineProviderApiKey } from "./model-auth-provider-config-6b_JxQon.js";
import { i as getApiKeyForModelCore, n as applyLocalNoAuthHeaderOverride, t as applyAuthHeaderOverride } from "./model-auth-BBgoS_xI.js";
import "./model-selection-DG2dN6VK.js";
import { n as resolveThinkingDefault } from "./model-thinking-default-DOCrUkf0.js";
import { f as projectAgentRunAttemptTerminal, o as classifyAgentRunTerminalOutcome } from "./agent-run-terminal-outcome-CyRezSup.js";
import { i as getFailoverErrorCode, t as FailoverError } from "./error-Crg6nsju.js";
import { s as createAgentRunDirectAbortError } from "./run-termination-Ts9RsbeN.js";
import { m as renderAuthProfileFailoverCopy, o as formatBillingErrorMessage } from "./user-copy-BLzGKYoR.js";
import { c as resolveFastModeForElapsed, l as resolveFastModeModelAutoOnSeconds, n as formatFastModeAutoProgressText } from "./fast-mode-CCX0YiYh.js";
import { n as resolveAgentTimeoutMs } from "./timeout-Dm7mxETK.js";
import { x as resolveCompactionTimeoutMs, y as compactContextEngineWithSafetyTimeout } from "./diagnostic-CN79G-MT.js";
import { D as setActiveEmbeddedRun, O as supersedeEmbeddedAgentRunByRunId, b as resolveActiveEmbeddedRunHandleSessionIdBySessionFile, d as isEmbeddedAgentRunHandleActive, r as clearActiveEmbeddedRun, y as resolveActiveEmbeddedRunHandleSessionId } from "./runs-5WnDPZ0V.js";
import { c as resolvePreparedRunAdmission, i as getAdmittedRunDelegatedAuthority, s as resolveAdmittedRunActiveAssertion } from "./admitted-run-context-DO5gB_Jz.js";
import { a as withGatewayToolCallerIdentity, t as createAdmittedGatewayToolCallerIdentity } from "./gateway-caller-context-CRUBJj3M.js";
import "./active-run-projections-rkNbMELs.js";
import { a as getCommandLaneSnapshot, l as isCommandLaneTaskTimeoutError, r as enqueueCommandInLane } from "./command-queue-oRD7ZANz.js";
import "./sessions-eI69vxPt.js";
import { a as resolveModelCostConfig, t as estimateAggregateUsageCost } from "./usage-format-G8w2sGOz.js";
import { r as resolveSessionPermissionExecMode } from "./session-permission-exec-mode-CJHB47SR.js";
import { _ as isAuthAssistantError, b as isRateLimitAssistantError, g as classifyAssistantFailoverReason, h as buildAssistantFailoverSignal, l as formatAssistantErrorText, m as isCompactionFailureError, p as extractObservedOverflowTokenCount, t as pickFallbackThinkingLevel, u as formatUserFacingAssistantErrorText, v as isBillingAssistantError, y as isFailoverAssistantError } from "./embedded-agent-helpers-CzpaLpCq.js";
import { $ as resolveEmbeddedRunAttemptTerminalOutcome, A as resolveSilentToolResultReplyPayload, B as hasAttemptTerminalState, C as createAttemptCarryover, D as resolveIncompleteTurnPayloadText, E as hasYieldContinuationEvidence, F as resolveSettledToolTerminalContinuationInstruction, G as prepareEmbeddedAttemptPromptExecution, H as isCurrentAttemptReplaySafe, I as shouldRetrySilentErrorAssistantTurn, K as applyResolvedToolPromptFinalizer, L as shouldTreatEmptyAssistantReplyAsSilent, M as resolveEmptyResponseRetryInstruction, N as resolveReasoningOnlyRetryInstruction, O as resolveReplayInvalidFlag, P as resolveSettledToolBatchEvidence, Q as isEmbeddedRunTimeoutFinal, R as isStrictAgenticExecutionContractActive, S as markLastProviderPromptContextRejected, T as YIELD_DIAGNOSTIC_TEXT, U as resolveCurrentAttemptAssistant, V as hasNonToolTerminalState, W as shouldContinueInteractiveAcceptedSessionSpawns, X as isEmbeddedRunTerminalInterrupted, Y as isEmbeddedRunTerminalAbort, Z as isEmbeddedRunTerminalTimeout, b as clearProviderPromptState, ct as EMBEDDED_RUN_ATTEMPT_DISPATCH_STAGE, dt as formatEmbeddedRunStageSummary, et as resolveEmbeddedRunAttemptTerminalState, i as advanceCodeModeRecovery, it as emitAgentActivityEvent, j as shouldRetryMissingAssistantTurn, k as resolveRunLivenessState, lt as createEmbeddedRunStageSummaryEmitter, mt as DEFERRED_CONTEXT_ENGINE_COMPACTION_REASON, nt as observeReplayMetadata, rt as createToolTerminalObserver, st as resolveAttemptWorkspaceSandbox, tt as createEmbeddedRunReplayState, ut as createEmbeddedRunStageTracker, v as measureEmbeddedAgentPreparation, w as TRUNCATED_REPLY_NOTICE_TEXT, x as getProviderPromptState, z as hasAsyncActivity } from "./builtin-openclaw-zQV8Wwjr.js";
import { i as describeFailoverError, l as resolveFailoverReasonFromError, r as coerceToFailoverError, u as resolveFailoverStatus } from "./failover-error-B46Ke6VT.js";
import { t as buildProviderAuthRecoveryHint } from "./provider-auth-recovery-hint-BanRJq49.js";
import { r as isToolResultError } from "./tool-result-error-d_ya2-bv.js";
import { a as revokeMessageActionTurnCapability, i as resolveMessageActionTurnCapabilityLifetime, n as mintMessageActionTurnCapability, t as isTrustedMessageActionTurnIngress } from "./message-action-turn-capability-BUs957dG.js";
import { c as shouldIncludeProgressCardToolForOpenClawTools } from "./openclaw-tools-BODVdJQD.js";
import { t as isHeartbeatLifecycleRunKind } from "./bootstrap-mode-HvSedbJl.js";
import { n as copyCoreTtsAttemptResultProvenance, r as getCoreTtsAttemptResultMediaUrls } from "./tool-runtime-config-C1d_lekC.js";
import { n as OPENCLAW_EMBEDDED_CONTEXT_ENGINE_HOST } from "./host-compat-xESS3bi6.js";
import "./agent-bundle-mcp-tools-B8DYsLEh.js";
import { t as log$3 } from "./logger-DEXeM7Jh.js";
import { a as mapSandboxSkillUsagePaths, o as remapSkillReferencePaths, s as resolveSandboxSkillRuntimeInputs } from "./runtime-capabilities-CA_W9E4G.js";
import { c as runContextEngineMaintenance, l as waitForDeferredTurnMaintenanceForSession, u as buildContextEngineRuntimeSettings } from "./context-engine-lifecycle-ByaDgAjJ.js";
import { l as truncateOversizedToolResultsInSessionManager, o as sessionLikelyHasOversizedToolResults } from "./tool-result-truncation-DChflbwq.js";
import { _ as resolveTransientRetryDelayMs, a as buildUsageAgentMetaFields, b as mergeUsageIntoAccumulator, c as resolveActiveErrorContext, d as resolveFinalAssistantVisibleText, f as resolveLatestCallUsage, g as resolveReportedModelRef, h as resolveRateLimitProfileRotationLimit, i as buildErrorAgentMeta, l as resolveEmbeddedAttemptBasePrompt, m as resolveOverloadProfileRotationLimit, n as RUNTIME_AUTH_REFRESH_MIN_DELAY_MS, o as createRunRecoveryDiagId, p as resolveMaxRunRetryIterations, r as RUNTIME_AUTH_REFRESH_RETRY_MS, s as normalizeAssistantUsageForContext, t as RUNTIME_AUTH_REFRESH_MARGIN_MS, u as resolveFinalAssistantRawText, v as createUsageAccumulator, y as mergeAttemptRunStatsIntoAccumulator } from "./helpers-BTOsl-oB.js";
import { n as mapThinkingLevelForProvider } from "./utils-CefVZRZM.js";
import { d as resolveContextEngineCapabilities, f as buildEmbeddedCompactionRuntimeContext, p as resolveCompactionContextTokenBudget, r as forgetPromptBuildDrainCacheForRun, v as listActiveProcessSessionReferences } from "./attempt-prompt-helpers-D26p8wCr.js";
import { t as resolveProcessToolScopeKey } from "./bash-process-scope-Bmw8_ghL.js";
import { n as canRunPreparedAgentRuntimeAuthAttempt, r as prepareAgentRuntimeAuth } from "./prepare-auth-Bq06j3_k.js";
import { T as settleRequesterAfterSessionSpawns, h as markRequesterTurnYielded } from "./subagent-registry-C24yr_PF.js";
import { t as ensureContextEnginesInitialized } from "./init-B4UqecTu.js";
import { c as resolveAuthoredModelContextTokens } from "./context-resolution-D7NN8z52.js";
import { n as projectPublicSessionEntry } from "./session-entry-projection-1R43v9cM.js";
import "./fast-mode-CGDySgLE.js";
import { t as AGENT_LANE_SUBAGENT } from "./lanes-CI0_P-yC.js";
import { n as isExecLikeToolName } from "./tool-error-summary-Bw_A4yhp.js";
import { n as buildAgentHookContextIdentityFields, t as buildAgentHookContextChannelFields } from "./hook-agent-context-AZc1TY6C.js";
import { o as runAgentCleanupStep, r as resolveSettledTurnFinalizationText } from "./settled-turn-finalization-result-CMozbVaG.js";
import { r as resolveSystemPromptRepoRoot } from "./system-prompt-params-B645JcX8.js";
import { i as getEmbeddedSessionPromptState, s as prepareEmbeddedSessionActiveProjectKeys } from "./session-prompt-state-D-1ZVLzo.js";
import { t as createTrajectoryRuntimeRecorder } from "./runtime-gmrQ9kJS.js";
import { g as hasOutboundDeliveryEvidence, h as hasMessagingToolDeliveryEvidence } from "./delivery-evidence-BDLYyuib.js";
import { t as TOOL_FAILURE_INSTRUCTION } from "./tool-outcome-instructions-D1-OxlK6.js";
import { b as shouldSuppressRawErrorConsoleSuffix, v as buildApiErrorObservationFields } from "./model-fallback-attempt-C1x1isxV.js";
import { r as resolveDelegationCapability } from "./agent-tools-djVuP1H1.js";
import { t as resolveToolLoopDetectionConfig } from "./tool-loop-detection-config-Dftl-DTD.js";
import { n as shouldUseTransientCooldownProbeSlot, r as LiveSessionModelSwitchError } from "./model-fallback-runner-DOsPfj4O.js";
import { t as resolvePreferredSessionKeyForSessionIdMatches } from "./session-id-resolution-tHy0h84G.js";
import { a as resolveSessionKeyForRequestCore, o as resolveStoredSessionKeyForSessionId } from "./session-CEfQoC2g.js";
import { i as resolveSessionSuspensionTarget, o as suspendSession, r as resolveSessionSuspensionReason } from "./session-suspension-CB3NOJMt.js";
import { n as resolveGlobalLane, r as resolveSessionLane } from "./lanes-CVttd5qX.js";
import { n as resolveModelAsync, t as createEmptyAgentDiscoveryStores } from "./model-BtcPfJ_-.js";
import { n as resolveAgentRunSessionTarget, t as applyAgentRunSessionTargetIdentity } from "./run-session-target-D4dx7X-Q.js";
import { a as fingerprintResolvedAuthProfileCredential, i as fingerprintOpaqueRuntimeOwner, n as fingerprintAuthProfileOwnerShape, o as fingerprintResolvedProviderAuth, r as fingerprintAwsSdkRuntimeOwner } from "./execution-auth-binding-CmucNoqo.js";
import { t as materializePreparedRuntimeModel } from "./materialize-model-CVFDy__1.js";
import { n as resolveUtilityModelRefForAgent } from "./utility-model-DITM0_NG.js";
import { a as selectContextEngineForTranscriptHost, i as createContextEngineLogicalTurnLease, n as drainPendingContextEngineTurnsBeforeRun } from "./context-engine-turn-attempt-BPzr5IBp.js";
import { c as selectAgentHarness, l as selectAgentHarnessForPreparedModelProviders, o as runAgentHarnessAttempt, s as runAgentHarnessSettledTurnFinalization, t as agentHarnessBuildsOpenClawTools } from "./selection-BC0YSSFq.js";
import { n as readChannelSourceTurnId, r as readChannelSourceTurnSameThreadRequired } from "./source-turn-id-DZMvfM8b.js";
import { t as resolveEmbeddedCliBackendDispatchEligibility } from "./cli-backend-dispatch-eligibility-CbGs5Tki.js";
import { i as isRecoverableNativeHarnessBindingFailure, n as resolveContextEngineCompactionSuccessor, r as maybeCompactAgentHarnessSession, t as acceptCompactionSuccessor } from "./compaction-successor-CSq1SdIy.js";
import { i as resolveCredentialScopedAuthAttemptModelDecision, n as hasPreparedAuthAttemptModelMetadata, r as providerUsesCredentialScopedModelMetadata, t as createPreparedRuntimeModelMaterializer } from "./credential-scoped-model-289_CgUb.js";
import { t as ensureSelectedAgentHarnessPlugin } from "./runtime-plugin-tBIKSPI8.js";
import { n as registerAgentRunCapacityWait } from "./agent-run-capacity-wait-DphXy8ye.js";
import { c as resolveEmbeddedRunLaneTimeoutMs, d as withEmbeddedRunLaneTimeout, i as resolveSessionPlacementSandbox, l as resolveEmbeddedRunSessionLanePolicy, o as withSessionPlacementTurnAdmission, s as EMBEDDED_RUN_LANE_TIMEOUT_GRACE_MS, u as shouldNoteLaneWait } from "./session-placement-admission-Dd1JTyZz.js";
import { a as attachCompactionAccountingRecorder, c as prepareCompactionHarnessAuth, d as runPostCompactionSideEffects, f as resolveProjectKey, i as resolveTieredModel, l as resolveCompactionRuntimeSelection, n as compactNativeCliSession, o as compactionCheckpointStore, s as persistCompactionCheckpoint, u as asCompactionHookRunner } from "./compact-gStBcHDe.js";
import { n as buildAgentRuntimePlan } from "./build-CMj_DHYr.js";
import { i as runBeforeAgentReplyForTurn, n as resolveAuthProfileFailureReason, r as buildHandledBeforeAgentReplyPayloads, t as buildEmbeddedRunPayloads } from "./payloads-B7_zRmw4.js";
import { n as redactRunIdentifier, r as resolveRunWorkspaceDir, t as recordAdmittedModelRoutingDecision } from "./model-routing-decision-Ivz9OfIF.js";
import { n as stripOpenClawMcpToolPrefix } from "./tool-policy-CK2rYBB0.js";
import { n as createAgentHarnessTaskRuntimeScope } from "./agent-harness-task-runtime-scope-BNJRhh_H.js";
import { a as hasPairedCardRenderer } from "./device-pairing-WbMm3LtM.js";
import { n as resolveSessionSkillResourceSnapshot } from "./session-placement-skill-resources-zI0dOwwq.js";
import { a as resizeExecApprovalContinuationPrompt } from "./bash-tools.exec-approval-output-D58qRHYQ.js";
import { r as shouldSwitchToLiveModel, t as clearLiveModelSwitchPending } from "./live-model-switch-D25jd7WQ.js";
import { a as resolveHookModelSelection, i as resolveEmbeddedRuntimeModelPolicy, n as createNativeModelOwnedRuntimeModel, o as resolveNativeModelOwnedHarnessId, r as resolveAgentHarnessRunAdmissionError, t as buildBeforeModelResolveAttachments } from "./setup-1lxp_-pZ.js";
import { t as createEmbeddedRunPermissionChanges } from "./permission-change-D8FixpUS.js";
import { n as incrementCompactionCount } from "./session-updates-DQXogl1j.js";
import { r as readSourceReplyDeliveryRuntime } from "./source-reply-delivery-runtime-D3ljIhoI.js";
import { t as resolveExternalCliAuthOverlayScopeFromSelection } from "./external-cli-auth-selection-r-FCDpVK.js";
import { t as appendAssistantMirrorMessageByIdentity } from "./session-transcript-runtime-QimJzN8r.js";
import { r as resolveEmbeddedRunTerminalToolFailure } from "./terminal-tool-failure-BkE784wQ.js";
import { t as mergeAttemptToolMediaPayloads } from "./tool-media-payloads-cmOaamUz.js";
import path from "node:path";
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { CompactionReplayRefreshRequiredError, isCompactionReplayCheckpoint } from "@openclaw/ai/transports";
import { isContextOverflow } from "@openclaw/ai/internal/runtime";
//#region V codex-turn-tail-v1: Codex turn tail timing (logging only)
function __vCodexTurnTail() {
	const key = Symbol.for("openclaw.v.codexTurnTail.v1");
	if (globalThis[key]) return globalThis[key];
	const runs = new Map();
	let sampler;
	let lastTick = 0;
	const tick = () => {
		const now = Date.now();
		const lag = Math.max(0, now - lastTick - 100);
		lastTick = now;
		for (const run of runs.values()) {
			if (lag > run.lagMaxMs) run.lagMaxMs = lag;
			if (lag >= 50) run.lagOver50Ms += lag;
		}
	};
	const api = {
		start(runId, meta) {
			try {
				if (typeof runId !== "string" || !runId || runs.has(runId)) return;
				const now = Date.now();
				for (const [id, run] of runs) if (now - run.startedAt > 6e5) runs.delete(id);
				if (runs.size >= 64) runs.delete(runs.keys().next().value);
				runs.set(runId, { runId, ...meta, startedAt: now, last: now, steps: [], tx: [], rpc: [], lagMaxMs: 0, lagOver50Ms: 0 });
				if (!sampler) {
					lastTick = now;
					sampler = setInterval(tick, 100);
					sampler.unref?.();
				}
			} catch {}
		},
		mark(runId, step) {
			try {
				const run = runs.get(runId);
				if (!run) return;
				const now = Date.now();
				run.steps.push([step, now - run.last]);
				run.last = now;
			} catch {}
		},
		note(kind, item) {
			try {
				if (runs.size === 0) return;
				const now = Date.now();
				for (const run of runs.values()) if (run[kind].length < 40) run[kind].push({ ...item, atMs: now - run.startedAt });
			} catch {}
		},
		active() {
			return runs.size > 0;
		},
		end(runId) {
			try {
				const run = runs.get(runId);
				if (!run) return;
				runs.delete(runId);
				if (runs.size === 0 && sampler) {
					clearInterval(sampler);
					sampler = void 0;
				}
				const { last, startedAt, ...rest } = run;
				return { ...rest, totalMs: Date.now() - startedAt };
			} catch {}
		}
	};
	globalThis[key] = api;
	return api;
}
//#endregion
//#region src/context-engine/types.ts
/**
* Resolve the post-compaction live transcript identity from a compact result.
*
* Prefers the typed `sessionTarget`. Reading the raw fields is the named
* compat path for shipped third-party engines that predate `sessionTarget`;
* it is removed together with the deprecated `sessionFile` result field.
*/
function resolveCompactionSuccessorTranscript(result) {
	return {
		sessionId: (result.result?.sessionTarget)?.sessionId ?? result.result?.sessionId,
		sessionFile: result.result?.sessionFile
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/compact.queued-execution.ts
function projectQueuedCompactionSessionTarget(params) {
	const agentId = params.sessionTarget?.agentId ?? params.agentId;
	const sessionKey = params.sessionTarget?.sessionKey ?? params.sessionKey;
	const storePath = params.sessionTarget?.storePath;
	return {
		...agentId ? { agentId } : {},
		sessionId: params.sessionTarget?.sessionId ?? params.sessionId,
		...sessionKey ? { sessionKey } : {},
		...storePath ? { storePath } : {},
		...params.sessionTarget?.threadId !== void 0 ? { threadId: params.sessionTarget.threadId } : {}
	};
}
function mergeSecondaryNativeHarnessCompactionDetails(params) {
	if (!params.nativeResult) return params.details;
	return {
		...isRecord(params.details) ? params.details : params.details === void 0 ? {} : { contextEngine: params.details },
		[params.detailsKey]: params.nativeResult
	};
}
async function executeQueuedContextEngineCompaction(input) {
	const { params, preparedParams, runtimeTarget, expectedEntry, host, contextEngine, contextEngineSessionKey, contextEngineRuntimeContext, contextEngineRuntimeSettings, resolvedWorkspaceDir, preparedModelRuntime, effectiveRuntimeModel, preparedHarnessRuntime, contextTokenBudget, attemptNativeHarnessCompaction } = input;
	let expected = { ...expectedEntry };
	const sessionLane = resolveSessionLane(params.sessionKey?.trim() || params.sessionId);
	const globalLane = resolveGlobalLane(params.lane);
	const enqueueGlobal = params.enqueue ?? ((task, opts) => enqueueCommandInLane(globalLane, task, opts));
	return await enqueueCommandInLane(sessionLane, () => enqueueGlobal(async () => {
		let closed = false;
		const assertCallerActive = () => {
			params.abortSignal?.throwIfAborted();
			if (closed) throw new Error("queued compaction is no longer active");
			host.assertActive?.();
		};
		const assertActive = (target = runtimeTarget, owner = expected) => {
			assertCallerActive();
			const current = loadSessionEntry({
				...target,
				readConsistency: "latest"
			});
			if (!current || current.sessionId !== owner.sessionId || current.lifecycleRevision !== owner.lifecycleRevision || current.activeWriterRunId !== owner.activeWriterRunId) throw new SessionTranscriptWriterClaimReboundError();
		};
		const createTranscriptWriteContext = (target, owner, signal) => {
			const capturedOwner = { ...owner };
			const sessionTarget = {
				...target,
				expectedLifecycleRevision: capturedOwner.lifecycleRevision,
				expectedWriterRunId: capturedOwner.activeWriterRunId
			};
			const assertCommitAllowed = () => {
				signal?.throwIfAborted();
				assertActive(sessionTarget, capturedOwner);
			};
			assertCommitAllowed();
			return {
				sessionTarget,
				assertCommitAllowed,
				withTranscriptWrite: async (run) => await run()
			};
		};
		const canContinue = () => {
			try {
				assertActive();
				return true;
			} catch (error) {
				if (params.abortSignal?.aborted || closed) return false;
				throw error;
			}
		};
		let checkpointSnapshot;
		let checkpointSnapshotRetained = false;
		try {
			if (params.abortSignal?.aborted) return {
				ok: false,
				compacted: false,
				reason: "compaction aborted"
			};
			assertActive();
			const engineOwnsCompaction = contextEngine.info.ownsCompaction === true;
			checkpointSnapshot = engineOwnsCompaction ? await compactionCheckpointStore.captureSnapshot({
				sessionFile: params.sessionFile,
				sessionManager: SessionManager.open(runtimeTarget),
				sessionTarget: runtimeTarget
			}) : null;
			assertActive();
			const hookRunner = engineOwnsCompaction ? asCompactionHookRunner(getGlobalHookRunner()) : null;
			const hookSessionKey = runtimeTarget.sessionKey;
			const { sessionAgentId } = resolveSessionAgentIds({
				sessionKey: params.sessionKey,
				config: params.config,
				agentId: params.agentId
			});
			const resolvedMessageProvider = params.messageChannel ?? params.messageProvider;
			const hookCtx = {
				sessionId: params.sessionId,
				agentId: sessionAgentId,
				sessionKey: hookSessionKey,
				workspaceDir: resolvedWorkspaceDir,
				messageProvider: resolvedMessageProvider
			};
			const runtimeContext = contextEngineRuntimeContext;
			if (hookRunner?.hasHooks?.("before_compaction") && hookRunner.runBeforeCompaction) try {
				await hookRunner.runBeforeCompaction({
					messageCount: -1,
					sessionFile: params.sessionFile
				}, hookCtx);
			} catch (err) {
				log$3.warn("before_compaction hook failed", { errorMessage: formatErrorMessage(err) });
			}
			if (params.abortSignal?.aborted) return {
				ok: false,
				compacted: false,
				reason: "compaction aborted"
			};
			assertActive();
			let result;
			try {
				const compactionSessionTarget = projectQueuedCompactionSessionTarget(params);
				const compact = bindContextEngineCompaction(contextEngine);
				const ownedCompactor = {
					info: contextEngine.info,
					compact: inheritRuntimeCompactionDelegate(compact, (backendParams) => {
						const writeContext = createTranscriptWriteContext(runtimeTarget, expectedEntry, backendParams.abortSignal);
						return withOwnedSessionTranscriptWrites(writeContext, () => compact(backendParams));
					})
				};
				result = await compactContextEngineWithSafetyTimeout(ownedCompactor, {
					sessionId: params.sessionId,
					sessionKey: hookSessionKey,
					...compactionSessionTarget.agentId ? { agentId: compactionSessionTarget.agentId } : {},
					sessionTarget: compactionSessionTarget,
					tokenBudget: contextTokenBudget,
					currentTokenCount: params.currentTokenCount,
					compactionTarget: params.trigger === "manual" ? "threshold" : "budget",
					customInstructions: params.customInstructions,
					force: params.force === true || params.forcePreflight === true || params.preflightRequired === true || params.trigger === "manual",
					runtimeContext: {
						...runtimeContext,
						forceReason: params.forcePreflight === true || params.preflightRequired === true ? "preflight_required" : params.trigger === "manual" ? "manual" : void 0,
						preflightCompactionTrigger: params.preflightCompactionTrigger
					},
					runtimeSettings: contextEngineRuntimeSettings
				}, resolveCompactionTimeoutMs(params.config), params.abortSignal);
			} catch (compactErr) {
				log$3.warn("context-engine compaction failed", { errorMessage: formatErrorMessage(compactErr) });
				result = {
					ok: false,
					compacted: false,
					reason: formatErrorMessage(compactErr)
				};
			}
			let successor = {
				sessionId: params.sessionId,
				sessionFile: params.sessionFile,
				sessionTarget: runtimeTarget
			};
			let tokensAfter = result.result?.tokensAfter;
			if (result.ok && result.compacted) {
				const proposed = resolveCompactionSuccessorTranscript(result);
				const target = result.result?.sessionTarget;
				tokensAfter = (!proposed.sessionId || proposed.sessionId === runtimeTarget.sessionId) && (!proposed.sessionFile || proposed.sessionFile === params.sessionFile) && (!target?.agentId || target.agentId === runtimeTarget.agentId) && (!target?.sessionKey || target.sessionKey === runtimeTarget.sessionKey) && (!target?.storePath || target.storePath === runtimeTarget.storePath) ? result.result?.tokensAfter : void 0;
				try {
					successor = await acceptCompactionSuccessor({
						config: params.config,
						currentSessionFile: params.sessionFile,
						currentTarget: runtimeTarget,
						expectedEntry,
						assertActive: assertCallerActive,
						result,
						onCommitted: (accepted) => {
							expected = {
								sessionId: accepted.entry.sessionId,
								lifecycleRevision: accepted.entry.lifecycleRevision,
								activeWriterRunId: accepted.entry.activeWriterRunId
							};
							host.onCommitted?.(accepted);
						}
					});
					tokensAfter = result.result?.tokensAfter;
				} catch (error) {
					if (!params.abortSignal?.aborted) throw error;
				}
			}
			const postCompactionSessionId = successor.sessionId;
			const postCompactionSessionFile = successor.sessionFile;
			const postCompactionSessionTarget = successor.sessionTarget;
			let secondaryNativeHarnessCompaction;
			try {
				if (result.ok && result.compacted && canContinue()) {
					const checkpointContext = createTranscriptWriteContext(postCompactionSessionTarget, expected, params.abortSignal);
					checkpointSnapshotRetained = await withOwnedSessionTranscriptWrites(checkpointContext, () => persistCompactionCheckpoint({
						config: params.config,
						sessionKey: params.sessionKey,
						sessionId: postCompactionSessionId,
						trigger: params.trigger,
						snapshot: checkpointSnapshot,
						summary: result.result?.summary,
						firstKeptEntryId: result.result?.firstKeptEntryId,
						tokensBefore: result.result?.tokensBefore,
						tokensAfter: result.result?.tokensAfter,
						sessionFile: postCompactionSessionFile,
						sessionTarget: postCompactionSessionTarget
					}));
				}
				if (result.ok && result.compacted && canContinue() && contextEngine.maintain) {
					const rewriteContext = createTranscriptWriteContext(postCompactionSessionTarget, expected, params.abortSignal);
					const sessionManager = SessionManager.open(postCompactionSessionTarget, resolvedWorkspaceDir);
					await runContextEngineMaintenance({
						contextEngine,
						sessionId: postCompactionSessionId,
						sessionKey: contextEngineSessionKey ?? params.sessionKey,
						sessionTarget: projectQueuedCompactionSessionTarget({
							...params,
							sessionFile: postCompactionSessionFile,
							sessionId: postCompactionSessionId,
							sessionTarget: postCompactionSessionTarget
						}),
						sessionFile: postCompactionSessionFile,
						reason: "compaction",
						sessionManager,
						withSessionManagerRewriteLock: async (operation) => await withOwnedSessionTranscriptWrites(rewriteContext, async () => {
							rewriteContext.assertCommitAllowed();
							sessionManager.reloadPersistedTranscript();
							rewriteContext.assertCommitAllowed();
							return await operation();
						}),
						runtimeContext,
						runtimeSettings: contextEngineRuntimeSettings,
						config: params.config,
						contextEngineAgentId: params.contextEngineAgentId,
						assertActive: rewriteContext.assertCommitAllowed,
						abortSignal: params.abortSignal
					});
				}
				if (engineOwnsCompaction && result.ok && result.compacted && canContinue()) await runPostCompactionSideEffects({
					config: params.config,
					sessionKey: params.sessionKey,
					sessionId: postCompactionSessionId,
					agentId: sessionAgentId,
					sessionFile: postCompactionSessionFile,
					assertActive
				});
				if (result.ok && result.compacted && canContinue() && hookRunner?.hasHooks?.("after_compaction") && hookRunner.runAfterCompaction) try {
					const afterHookCtx = {
						...hookCtx,
						sessionId: postCompactionSessionId
					};
					await hookRunner.runAfterCompaction({
						messageCount: -1,
						compactedCount: -1,
						tokenCount: result.result?.tokensAfter,
						sessionFile: postCompactionSessionFile,
						...postCompactionSessionId !== params.sessionId ? { previousSessionId: params.sessionId } : {}
					}, afterHookCtx);
				} catch (err) {
					log$3.warn("after_compaction hook failed", { errorMessage: formatErrorMessage(err) });
				}
				if (engineOwnsCompaction && result.ok && result.compacted && canContinue() && attemptNativeHarnessCompaction) try {
					secondaryNativeHarnessCompaction = await maybeCompactAgentHarnessSession({
						...preparedParams,
						sessionId: postCompactionSessionId,
						sessionFile: postCompactionSessionFile,
						sessionTarget: postCompactionSessionTarget,
						...successor.entry ? { sessionEntry: projectPublicSessionEntry(successor.entry) } : {},
						runtimeModel: effectiveRuntimeModel,
						contextEngine,
						contextTokenBudget,
						contextEngineRuntimeContext
					}, {
						nativeCompactionRequest: "after_context_engine",
						preparedModelRuntime
					});
					if (secondaryNativeHarnessCompaction && !secondaryNativeHarnessCompaction.ok) log$3.warn("secondary native harness compaction failed after context-engine compaction", { reason: secondaryNativeHarnessCompaction.reason });
				} catch (err) {
					secondaryNativeHarnessCompaction = {
						ok: false,
						compacted: false,
						reason: formatErrorMessage(err)
					};
					log$3.warn("secondary native harness compaction threw after context-engine compaction", { errorMessage: formatErrorMessage(err) });
				}
			} catch (error) {
				if (canContinue()) throw error;
			}
			const secondaryNativeDetailsKey = normalizeOptionalAgentRuntimeId(preparedHarnessRuntime) === "codex" ? "codexNativeCompaction" : "nativeHarnessCompaction";
			const serverEndpointCompaction = isRecord(result.result?.details) && result.result.details.compactionKind === "server-endpoint" && typeof tokensAfter === "number";
			return {
				ok: result.ok,
				compacted: result.compacted,
				compactionKind: serverEndpointCompaction ? "server-endpoint" : "context-engine",
				reason: result.reason,
				result: result.result ? {
					...serverEndpointCompaction ? { kind: "server-endpoint" } : {
						summary: result.result.summary ?? "",
						firstKeptEntryId: result.result.firstKeptEntryId ?? ""
					},
					tokensBefore: result.result.tokensBefore,
					tokensAfter,
					details: mergeSecondaryNativeHarnessCompactionDetails({
						details: result.result.details,
						nativeResult: secondaryNativeHarnessCompaction,
						detailsKey: secondaryNativeDetailsKey
					}),
					...postCompactionSessionId !== params.sessionId ? { sessionId: postCompactionSessionId } : {},
					...postCompactionSessionFile !== params.sessionFile ? { sessionFile: postCompactionSessionFile } : {}
				} : void 0
			};
		} finally {
			closed = true;
			if (!checkpointSnapshotRetained) await compactionCheckpointStore.cleanupSnapshot(checkpointSnapshot);
		}
	}));
}
//#endregion
//#region src/agents/embedded-agent-runner/compact.queued.ts
/**
* Queues embedded-agent session compaction onto the correct command lane.
*/
function lockedCompactionRuntimeFailure(runtime) {
	return {
		ok: false,
		compacted: false,
		reason: runtime ? `Model selection is locked to native agent harness "${runtime}", but native compaction is unavailable.` : "Model selection is locked but the persisted agent harness is unavailable.",
		failure: { reason: "model_selection_locked" }
	};
}
const DEFERRED_CONTEXT_ENGINE_COMPACTION_SCHEDULE_FAILURE_REASON = "failed to schedule background context-engine maintenance";
const MANUAL_COMPACTION_ACTIVE_RUN_REASON = "manual compaction unavailable while another embedded run is active";
const COMPACTION_ABORTED_REASON = "compaction aborted";
function createCompactionAbortedResult() {
	return {
		ok: false,
		compacted: false,
		reason: COMPACTION_ABORTED_REASON
	};
}
function resolveManualCompactionActiveRunSessionId(params) {
	return (isEmbeddedAgentRunHandleActive(params.sessionId) ? params.sessionId : void 0) ?? (params.sessionKey ? resolveActiveEmbeddedRunHandleSessionId(params.sessionKey) : void 0) ?? resolveActiveEmbeddedRunHandleSessionIdBySessionFile(params.sessionFile);
}
function shouldDeferOwningContextEngineBudgetCompaction(params) {
	return params.compactParams.deferOwningContextEngineCompaction === true && params.compactParams.trigger === "budget" && params.contextEngine.info.ownsCompaction === true && params.contextEngine.info.turnMaintenanceMode === "background" && typeof params.contextEngine.maintain === "function";
}
async function disposeContextEngine(contextEngine) {
	try {
		await contextEngine.dispose?.();
	} catch (err) {
		log$3.warn("context engine dispose failed", { errorMessage: formatErrorMessage(err) });
	}
}
async function deferOwningContextEngineBudgetCompaction(params) {
	let deferredScheduled = false;
	let deferredScheduleFailure;
	try {
		await runContextEngineMaintenance({
			contextEngine: params.contextEngine,
			sessionId: params.compactParams.sessionId,
			sessionKey: params.contextEngineSessionKey ?? params.compactParams.sessionKey,
			sessionTarget: projectQueuedCompactionSessionTarget(params.compactParams),
			sessionFile: params.compactParams.sessionFile,
			reason: "turn",
			runtimeContext: params.contextEngineRuntimeContext,
			runtimeSettings: params.contextEngineRuntimeSettings,
			config: params.compactParams.config,
			contextEngineAgentId: params.compactParams.contextEngineAgentId,
			disposeDeferredContextEngineAfterMaintenance: true,
			onDeferredMaintenance: () => {
				deferredScheduled = true;
			},
			onDeferredMaintenanceFailure: (error) => {
				deferredScheduleFailure = error;
			}
		});
	} catch (err) {
		log$3.warn("failed to defer context-engine budget compaction", { errorMessage: formatErrorMessage(err) });
	}
	if (!deferredScheduled || deferredScheduleFailure) {
		log$3.warn(`[compaction] failed to schedule context-engine-owned budget compaction background maintenance (sessionKey=${params.compactParams.sessionKey ?? params.compactParams.sessionId}${deferredScheduleFailure ? ` error=${formatErrorMessage(deferredScheduleFailure)}` : ""})`);
		return {
			ok: false,
			compacted: false,
			reason: DEFERRED_CONTEXT_ENGINE_COMPACTION_SCHEDULE_FAILURE_REASON,
			failure: { reason: "deferred_compaction_not_scheduled" }
		};
	}
	log$3.info(`[compaction] deferred context-engine-owned budget compaction to background maintenance (sessionKey=${params.compactParams.sessionKey ?? params.compactParams.sessionId} scheduled=${String(deferredScheduled)})`);
	return {
		ok: true,
		compacted: false,
		reason: DEFERRED_CONTEXT_ENGINE_COMPACTION_REASON
	};
}
/**
* Compacts a session with lane queueing (session lane + global lane).
* Use this from outside a lane context. If already inside a lane, use
* `compactEmbeddedAgentSessionDirect` to avoid deadlocks.
*/
async function compactEmbeddedAgentSession(params, host = {}) {
	const contextEngineAgentId = normalizeOptionalString(params.contextEngineAgentId) ?? normalizeOptionalString(params.agentId);
	const contextEngineSessionKey = normalizeOptionalString(params.sessionKey) ?? normalizeOptionalString(params.sessionTarget?.sessionKey);
	const runtimeTarget = await resolveAgentRunSessionTarget({
		...params,
		missingSessionKey: "resolve-existing"
	});
	const entry = loadSessionEntryReadOnly({
		...runtimeTarget,
		readConsistency: "latest"
	});
	const expectedEntry = {
		sessionId: runtimeTarget.sessionId,
		lifecycleRevision: entry?.lifecycleRevision,
		activeWriterRunId: entry?.activeWriterRunId
	};
	const resolvedParams = {
		...params,
		...params.sessionEntry ? { sessionEntry: projectPublicSessionEntry(params.sessionEntry) } : {},
		agentId: runtimeTarget.agentId,
		sessionId: runtimeTarget.sessionId,
		sessionKey: runtimeTarget.sessionKey,
		sessionTarget: runtimeTarget,
		sessionFile: runtimeTarget.sessionKey,
		contextEngineAgentId
	};
	if (resolvedParams.trigger !== "manual") return await compactEmbeddedAgentSessionImpl(resolvedParams, expectedEntry, host, contextEngineSessionKey);
	if (resolveManualCompactionActiveRunSessionId(resolvedParams)) return {
		ok: false,
		compacted: false,
		reason: MANUAL_COMPACTION_ACTIVE_RUN_REASON,
		failure: { reason: "active_run" }
	};
	const controller = new AbortController();
	const abortSignal = resolvedParams.abortSignal ? AbortSignal.any([resolvedParams.abortSignal, controller.signal]) : controller.signal;
	const handle = {
		kind: "embedded",
		queueMessage: async () => {},
		isStreaming: () => true,
		isAborted: () => abortSignal.aborted,
		isCompacting: () => true,
		abort: (reason) => controller.abort(reason ?? "user_abort"),
		cancel: (reason) => controller.abort(reason ?? "user_abort")
	};
	setActiveEmbeddedRun(resolvedParams.sessionId, handle, resolvedParams.sessionKey, resolvedParams.sessionFile, resolvedParams.agentId);
	try {
		return await compactEmbeddedAgentSessionImpl({
			...resolvedParams,
			abortSignal
		}, expectedEntry, host, contextEngineSessionKey);
	} finally {
		clearActiveEmbeddedRun(resolvedParams.sessionId, handle, resolvedParams.sessionKey, resolvedParams.sessionFile);
	}
}
async function runPrimaryNativeCompactionInLanes(params, expectedEntry, host, run) {
	const sessionLane = resolveSessionLane(params.sessionKey?.trim() || params.sessionId);
	const globalLane = resolveGlobalLane(params.lane);
	const enqueueGlobal = params.enqueue ?? ((task, opts) => enqueueCommandInLane(globalLane, task, opts));
	return await enqueueCommandInLane(sessionLane, () => enqueueGlobal(() => {
		host.assertActive?.();
		const currentEntry = loadSessionEntryReadOnly({
			...params.sessionTarget,
			readConsistency: "latest"
		});
		if (!currentEntry || currentEntry.sessionId !== expectedEntry.sessionId || currentEntry.lifecycleRevision !== expectedEntry.lifecycleRevision || currentEntry.activeWriterRunId !== expectedEntry.activeWriterRunId) throw new SessionTranscriptWriterClaimReboundError();
		return run();
	}));
}
async function compactEmbeddedAgentSessionImpl(params, expectedEntry, host, contextEngineSessionKey) {
	if (params.abortSignal?.aborted) return createCompactionAbortedResult();
	host.assertActive?.();
	const runtimeTarget = params.sessionTarget;
	const agentIds = resolveSessionAgentIds({
		sessionKey: runtimeTarget.sessionKey,
		config: params.config,
		agentId: runtimeTarget.agentId
	});
	const agentDir = params.agentDir ?? resolveAgentDir(params.config ?? {}, agentIds.sessionAgentId);
	const resolvedWorkspaceDir = resolveUserPath(params.workspaceDir);
	const placementSandbox = params.sandbox === void 0 ? await resolveSessionPlacementSandbox({
		agentId: runtimeTarget.agentId,
		config: params.config,
		sessionId: runtimeTarget.sessionId,
		sessionKey: runtimeTarget.sessionKey,
		workspaceDir: resolvedWorkspaceDir
	}) : null;
	const preparedParams = placementSandbox ? {
		...params,
		sandbox: placementSandbox
	} : params;
	const runtimeSelection = resolveCompactionRuntimeSelection({
		...preparedParams,
		modelId: preparedParams.model,
		boundHarnessRuntime: preparedParams.agentHarnessId,
		preparedRuntimePlan: preparedParams.runtimePlan,
		selectedHarnessRuntime: preparedParams.modelSelectionLocked === true ? normalizeOptionalAgentRuntimeId(preparedParams.agentHarnessId) : void 0
	});
	if (params.abortSignal?.aborted) return createCompactionAbortedResult();
	host.assertActive?.();
	const nativeCliResult = await compactNativeCliSession({
		runtime: runtimeSelection.selectedHarnessRuntime,
		compactParams: {
			...params,
			agentDir,
			workspaceDir: resolvedWorkspaceDir
		},
		runControlOperation: (run) => runPrimaryNativeCompactionInLanes(params, expectedEntry, host, run)
	});
	if (nativeCliResult) return nativeCliResult;
	const lease = await acquireAgentRunPreparedModelRuntime({
		config: params.config ?? {},
		agentId: agentIds.sessionAgentId,
		agentDir,
		workspaceDir: resolvedWorkspaceDir,
		...params.allowGatewaySubagentBinding ? { allowGatewaySubagentBinding: true } : {},
		runtimePluginSelections: [{
			provider: runtimeSelection.provider,
			modelId: runtimeSelection.modelId,
			...runtimeSelection.selectedHarnessRuntime ? { runtime: runtimeSelection.selectedHarnessRuntime } : {},
			agentId: agentIds.sessionAgentId
		}]
	});
	const run = async () => {
		ensureContextEnginesInitialized();
		const contextEngine = await resolveContextEngine(params.config, {
			agentDir,
			workspaceDir: resolvedWorkspaceDir
		});
		let disposeContextEngineOnExit = true;
		try {
			return await compactResolvedContextEngine(preparedParams, expectedEntry, host, contextEngine, agentDir, resolvedWorkspaceDir, lease.snapshot, contextEngineSessionKey, () => {
				disposeContextEngineOnExit = false;
			});
		} finally {
			if (disposeContextEngineOnExit) await disposeContextEngine(contextEngine);
		}
	};
	try {
		return await withPluginRuntimeGenerationScope(lease.snapshot, run);
	} finally {
		lease.release();
	}
}
async function compactResolvedContextEngine(params, expectedEntry, host, contextEngine, agentDir, resolvedWorkspaceDir, preparedModelRuntime, contextEngineSessionKey, releaseContextEngineOwnership) {
	const runtimeTarget = params.sessionTarget;
	const lockedHarnessRuntime = params.modelSelectionLocked === true ? normalizeOptionalAgentRuntimeId(params.agentHarnessId) : void 0;
	if (params.modelSelectionLocked === true && (!lockedHarnessRuntime || lockedHarnessRuntime === "auto")) return lockedCompactionRuntimeFailure();
	const { runtimePolicySessionKey, runtimePolicyAgentId, selectedHarnessRuntime, target: resolvedCompactionTarget, runtimeModelAuth: { plan: reusableRuntimeAuthPlan, modelAuth: initialModelAuth }, provider: ceProvider, runtimeProvider: ceRuntimeProvider, contextConfigProvider: ceContextConfigProvider, modelId: ceModelId, attemptNativeHarnessCompaction } = resolveCompactionRuntimeSelection({
		...params,
		modelId: params.model,
		boundHarnessRuntime: params.agentHarnessId,
		preparedRuntimePlan: params.runtimePlan,
		selectedHarnessRuntime: params.modelSelectionLocked === true ? lockedHarnessRuntime : void 0
	});
	const lockedNativeHarness = params.modelSelectionLocked === true && selectedHarnessRuntime !== "openclaw";
	await ensureSelectedAgentHarnessPlugin({
		config: params.config,
		provider: ceProvider,
		modelId: ceModelId,
		agentId: runtimePolicyAgentId,
		sessionKey: runtimePolicySessionKey,
		agentHarnessId: params.agentHarnessId,
		agentHarnessRuntimeOverride: selectedHarnessRuntime,
		workspaceDir: resolvedWorkspaceDir,
		pluginRegistry: requireActivePluginRegistry()
	});
	const { resolution: modelResolution } = await resolveTieredModel({
		provider: ceRuntimeProvider,
		modelId: ceModelId,
		agentDir,
		config: params.config,
		workspaceDir: resolvedWorkspaceDir,
		...initialModelAuth,
		preparedModelRuntime
	});
	const { model: ceModel, authStorage, modelRegistry } = modelResolution;
	const ceRuntimeModel = ceModel;
	const { runtimeAuthPreparation, selectedPreparedHarness, providerUsesProfileScopedModelMetadata } = await prepareCompactionHarnessAuth({
		...params,
		provider: ceProvider,
		metadataProvider: ceRuntimeProvider,
		modelId: ceModelId,
		model: ceRuntimeModel,
		reusableRuntimeAuthPlan,
		agentDir,
		workspaceDir: resolvedWorkspaceDir,
		authProfileId: resolvedCompactionTarget.authProfileId,
		runtimePolicyAgentId,
		runtimePolicySessionKey,
		agentHarnessRuntimeOverride: selectedHarnessRuntime,
		convergenceErrorPrefix: "Prepared queued compaction"
	});
	const preparedHarnessRuntime = selectedPreparedHarness.id;
	const runtimeAuthPlan = runtimeAuthPreparation.plan;
	const effectiveRuntimeModel = await materializePreparedRuntimeModel({
		plan: runtimeAuthPlan,
		provider: ceProvider,
		modelId: ceModelId,
		config: params.config,
		model: ceRuntimeModel,
		forceResolve: providerUsesProfileScopedModelMetadata && Boolean(runtimeAuthPlan.selectedAuthMode),
		resolveModel: async ({ config, authProfileId, authProfileMode }) => {
			const resolved = await resolveModelAsync(ceRuntimeProvider, ceModelId, agentDir, config, {
				authStorage,
				modelRegistry,
				preparedModelRuntime,
				skipAgentDiscovery: true,
				allowBundledStaticCatalogFallback: true,
				preferBundledStaticCatalogTransport: true,
				workspaceDir: resolvedWorkspaceDir,
				authProfileId,
				authProfileMode
			});
			return {
				...resolved,
				model: resolved.model
			};
		}
	});
	const preparedParams = {
		...params,
		provider: ceProvider,
		model: ceModelId,
		agentHarnessId: preparedHarnessRuntime,
		...reusableRuntimeAuthPlan ? {
			authProfileId: runtimeAuthPlan.forwardedAuthProfileId,
			authProfileIdSource: runtimeAuthPlan.forwardedAuthProfileSource,
			runtimeAuthPlan
		} : {
			authProfileId: resolvedCompactionTarget.authProfileId,
			authProfileIdSource: resolvedCompactionTarget.authProfileId ? params.authProfileIdSource : void 0,
			runtimeAuthPlan: void 0,
			runtimePlan: void 0
		}
	};
	const contextTokenBudget = resolveCompactionContextTokenBudget({
		config: params.config,
		provider: ceContextConfigProvider,
		modelId: ceModelId,
		model: effectiveRuntimeModel,
		agentId: runtimeTarget.agentId,
		requestedTokenBudget: params.contextTokenBudget
	});
	const contextEngineRuntimeContext = buildCompactionContextEngineRuntimeContext({
		params: preparedParams,
		agentDir,
		harnessRuntime: preparedHarnessRuntime,
		contextEngineSessionKey,
		contextTokenBudget,
		contextEnginePluginId: resolveContextEngineOwnerPluginId(contextEngine)
	});
	const contextEngineRuntimeSettings = buildContextEngineRuntimeSettings({
		contextEngineHost: OPENCLAW_EMBEDDED_CONTEXT_ENGINE_HOST,
		provider: ceProvider,
		requestedModel: params.model,
		resolvedModel: ceModelId,
		selectedContextEngineId: contextEngine.info.id,
		contextEngineSelectionSource: contextEngine.info.id === "legacy" ? "default" : "configured",
		promptTokenBudget: contextTokenBudget
	});
	if (params.abortSignal?.aborted) return createCompactionAbortedResult();
	host.assertActive?.();
	const contextEngineOwnsCompaction = contextEngine.info.ownsCompaction === true;
	let requiredPreflightNativeCapabilityUsed = false;
	const harnessResult = attemptNativeHarnessCompaction && (!contextEngineOwnsCompaction || lockedNativeHarness) ? await runPrimaryNativeCompactionInLanes(preparedParams, expectedEntry, host, async () => {
		if (params.abortSignal?.aborted) return createCompactionAbortedResult();
		return await maybeCompactAgentHarnessSession({
			...preparedParams,
			runtimeModel: effectiveRuntimeModel,
			contextEngine,
			contextTokenBudget,
			contextEngineRuntimeContext
		}, {
			preparedModelRuntime,
			...preparedParams.preflightRequired === true ? {
				nativeCompactionRequest: "required_preflight",
				onNativeCompactionCapabilityUsed: () => {
					requiredPreflightNativeCapabilityUsed = true;
				}
			} : {}
		});
	}) : void 0;
	if (lockedNativeHarness && !(preparedParams.preflightRequired === true && requiredPreflightNativeCapabilityUsed && isRecoverableNativeHarnessBindingFailure(harnessResult))) return harnessResult ?? lockedCompactionRuntimeFailure(selectedHarnessRuntime);
	if (harnessResult) {
		if (!isRecoverableNativeHarnessBindingFailure(harnessResult)) return {
			...harnessResult,
			compactionKind: "native-harness"
		};
		log$3.warn(`native harness compaction could not use its session binding; falling back to context engine: ${harnessResult.reason ?? "unknown"}`);
	}
	if (params.abortSignal?.aborted) return createCompactionAbortedResult();
	host.assertActive?.();
	if (shouldDeferOwningContextEngineBudgetCompaction({
		compactParams: preparedParams,
		contextEngine
	})) {
		const deferredResult = await deferOwningContextEngineBudgetCompaction({
			compactParams: preparedParams,
			contextEngineSessionKey,
			contextEngine,
			contextEngineRuntimeContext,
			contextEngineRuntimeSettings
		});
		if (deferredResult.ok) releaseContextEngineOwnership();
		return deferredResult;
	}
	return await executeQueuedContextEngineCompaction({
		params,
		preparedParams,
		runtimeTarget,
		expectedEntry,
		host,
		contextEngine,
		contextEngineSessionKey,
		contextEngineRuntimeContext,
		contextEngineRuntimeSettings,
		resolvedWorkspaceDir,
		preparedModelRuntime,
		effectiveRuntimeModel,
		preparedHarnessRuntime,
		contextTokenBudget,
		attemptNativeHarnessCompaction
	});
}
function buildCompactionContextEngineRuntimeContext(params) {
	const { sessionFile: _sessionFile, contextEngineAgentId, ...runtimeParams } = params.params;
	return {
		...runtimeParams,
		sessionTarget: projectQueuedCompactionSessionTarget(params.params),
		...buildEmbeddedCompactionRuntimeContext({
			...params.params,
			agentDir: params.agentDir,
			modelId: params.params.model,
			harnessRuntime: params.harnessRuntime
		}),
		...resolveContextEngineCapabilities({
			config: params.params.config,
			sessionKey: params.contextEngineSessionKey ?? params.params.sessionKey,
			explicitAgentId: contextEngineAgentId,
			authProfileId: params.params.authProfileId,
			contextEnginePluginId: params.contextEnginePluginId,
			purpose: "context-engine.compaction"
		}),
		tokenBudget: params.contextTokenBudget,
		currentTokenCount: params.params.currentTokenCount
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/cli-backend-dispatch-transcript.ts
/**
* Transcript recorder for CLI-dispatched embedded runs.
*
* The CLI backend runs its tool loop inside the external process and writes
* no OpenClaw transcript records, but one-shot callers (e.g. active-memory
* recall) read the run's transcript for timeout partial-text salvage,
* tool-result evidence, and a live terminal-search watcher that polls
* mid-run. Mirror the run into canonical transcript records through the
* session accessor: the user turn at start, tool calls/results as they
* stream, and the final assistant snapshot at run end.
*/
const log$2 = createSubsystemLogger("agents/embedded-cli-dispatch");
/**
* Records a CLI-dispatched run into the run's session transcript by session
* identity. Tool records append as events arrive (the terminal-search
* watcher polls the transcript live); the assistant snapshot is held in
* memory and flushed once at finalize (or immediately on abort) so streamed
* text does not append a record per delta while timeout salvage still finds
* the last text the model produced.
*/
function createCliDispatchTranscriptRecorder(params) {
	let tail = Promise.resolve();
	let lastAssistantText = "";
	let lastWrittenAssistantText = "";
	let finalized = false;
	let turnTainted = false;
	let toolRecordSequence = 0;
	const scope = {
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		agentId: params.agentId,
		storePath: params.storePath,
		sessionFile: params.sessionFile,
		expectedLifecycleRevision: params.expectedLifecycleRevision,
		expectedWriterRunId: params.expectedWriterRunId
	};
	const enqueue = (build) => {
		tail = tail.then(async () => {
			await appendTranscriptMessage(scope, {
				message: build(),
				config: params.config,
				cwd: params.cwd
			});
		});
		tail = tail.catch((error) => {
			log$2.warn(`cli dispatch transcript append failed: runId=${params.runId} error=${String(error)}`);
		});
	};
	const model = {
		api: "cli",
		provider: params.provider,
		id: params.model ?? ""
	};
	const buildZeroUsageAssistantMessage = (content, stopReason, tainted = turnTainted) => {
		const message = buildAssistantMessage({
			model,
			content,
			stopReason,
			usage: buildUsageWithNoCost({})
		});
		return tainted ? {
			...message,
			__openclaw: { turnTainted: true }
		} : message;
	};
	enqueue(() => ({
		role: "user",
		content: [{
			type: "text",
			text: params.prompt
		}],
		timestamp: Date.now(),
		...params.senderIsOwner !== void 0 ? { __openclaw: { senderIsOwner: params.senderIsOwner } } : {}
	}));
	return {
		noteToolEvent: (event) => {
			if (finalized) return;
			toolRecordSequence += 1;
			const toolCallId = event.toolCallId?.trim() || `${params.runId}-tool-${String(toolRecordSequence)}`;
			if (event.phase === "start") {
				const taintedAtStart = turnTainted;
				enqueue(() => buildZeroUsageAssistantMessage([{
					type: "toolCall",
					id: toolCallId,
					name: event.toolName,
					arguments: event.args ?? {}
				}], "toolUse", taintedAtStart));
				return;
			}
			turnTainted ||= event.resultContentSource === "network";
			enqueue(() => ({
				role: "toolResult",
				toolCallId,
				toolName: event.toolName,
				content: normalizeToolResultContent(event.result),
				details: readToolResultDetails(event.result),
				isError: event.isError === true,
				timestamp: Date.now(),
				...event.resultContentSource ? { __openclaw: { resultContentSource: event.resultContentSource } } : {}
			}));
		},
		noteAssistantText: (text) => {
			if (!finalized && text.trim()) lastAssistantText = text;
		},
		flushAssistantSnapshot: () => {
			if (finalized) return;
			const text = lastAssistantText.trim();
			if (!text || text === lastWrittenAssistantText) return;
			lastWrittenAssistantText = text;
			enqueue(() => buildZeroUsageAssistantMessage([{
				type: "text",
				text
			}], "aborted"));
		},
		finalize: async (finalText) => {
			if (finalized) {
				await tail;
				return;
			}
			finalized = true;
			const text = finalText?.trim() || lastAssistantText.trim();
			if (text && text !== lastWrittenAssistantText) {
				lastWrittenAssistantText = text;
				enqueue(() => buildZeroUsageAssistantMessage([{
					type: "text",
					text
				}], "stop"));
			}
			await tail;
		}
	};
}
/** Maps a sanitized CLI tool result onto transcript content blocks. */
function normalizeToolResultContent(result) {
	if (typeof result === "string") return result ? [{
		type: "text",
		text: result
	}] : [];
	if (!result || typeof result !== "object") return [];
	const content = Array.isArray(result) ? result : result.content;
	if (!Array.isArray(content)) return [];
	const blocks = [];
	for (const block of content) {
		if (typeof block === "string") {
			blocks.push({
				type: "text",
				text: block
			});
			continue;
		}
		if (!block || typeof block !== "object") continue;
		const type = block.type;
		const text = block.text;
		if (type === "text" && typeof text === "string") {
			blocks.push({
				type: "text",
				text
			});
			continue;
		}
		const data = block.data;
		const mimeType = block.mimeType;
		if (type === "image" && typeof data === "string" && typeof mimeType === "string") blocks.push({
			type: "image",
			data,
			mimeType
		});
	}
	return blocks;
}
function readToolResultDetails(result) {
	if (!result || typeof result !== "object") return;
	const details = result.details;
	return details && typeof details === "object" ? details : void 0;
}
//#endregion
//#region src/agents/embedded-agent-runner/cli-backend-dispatch.ts
/**
* Opt-in CLI-backend dispatch for one-shot embedded runs.
*
* Embedded runs targeting a CLI runtime provider normally fall through to the
* openclaw harness and call the provider API directly with that runtime's
* credentials (`cli_runtime_passthrough_openclaw`). Anthropic routes direct
* anthropic-messages calls on subscription OAuth tokens to metered "extra
* usage" billing: without extra-usage balance the passthrough fails closed
* with a billing error, and with it the run silently draws paid usage instead
* of the plan limits the CLI runtime was configured for. Callers that
* tolerate CLI latency opt in via `cliBackendDispatch: "subscription-auth"`
* to run through the CLI backend on plan limits instead.
*/
const log$1 = createSubsystemLogger("agents/embedded-cli-dispatch");
/**
* Runs the embedded turn through the CLI backend when the opt-in dispatch
* gate matches; returns undefined so the caller continues on the native path.
*/
async function runEmbeddedAgentViaCliBackendIfEligible(params) {
	const dispatch = resolveEmbeddedCliBackendDispatch(params);
	return dispatch ? await runEmbeddedAgentViaCliBackend(params, dispatch) : void 0;
}
/** Applies the opt-in and transcript-path gates on top of shared eligibility. */
function resolveEmbeddedCliBackendDispatch(params) {
	if (params.cliBackendDispatch !== "subscription-auth") return;
	if (params.sourceReplyDeliveryMode === "message_tool_only") return;
	const sessionFile = params.sessionFile?.trim();
	if (!sessionFile) return;
	const toolsAllow = resolveDispatchableToolsAllow(params);
	if (!toolsAllow) return;
	const eligibility = resolveEmbeddedCliBackendDispatchEligibility(params);
	return eligibility ? {
		provider: eligibility.provider,
		sessionFile,
		toolsAllow
	} : void 0;
}
/**
* Fail closed on tool policy: dispatch only runs whose embedded tool state the
* CLI bridge can express faithfully — a non-empty named allowlist bounded by
* the loopback grant. Deny-all (`[]`), wildcards, absent allowlists, and
* flag-based restrictions (`disableTools`, `modelRun`) keep the embedded
* passthrough so no closed state silently widens on the CLI surface; full
* translation can arrive with the first caller that needs it (#57326).
*/
function resolveDispatchableToolsAllow(params) {
	if (params.disableTools || params.modelRun) return;
	if (!params.toolsAllow || params.toolsAllow.length === 0) return;
	const names = params.toolsAllow.map((name) => normalizeToolPolicyName(name));
	if (names.some((name) => !name || name === "*" || name.includes("*"))) return;
	return [...new Set(names)];
}
/** Runs an opted-in embedded run through the CLI backend as a one-shot turn. */
async function runEmbeddedAgentViaCliBackend(params, dispatch) {
	const { runCliAgent } = await import("./cli-runner.runtime.js");
	const admittedRunContext = await resolvePreparedRunAdmission({
		runId: params.runId,
		runtimeKind: "embedded",
		admittedRunContext: params.admittedRunContext,
		preparedRunAdmission: params.preparedRunAdmission
	});
	const cliToolAvailability = {
		native: [],
		openClaw: dispatch.toolsAllow
	};
	const onAgentToolResult = params.onAgentToolResult;
	const { storePath, expectedLifecycleRevision, expectedWriterRunId } = params.sessionTarget;
	const transcript = params.sessionManager || params.sessionPersistence === "detached" ? void 0 : createCliDispatchTranscriptRecorder({
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		agentId: params.agentId,
		storePath,
		sessionFile: dispatch.sessionFile,
		runId: params.runId,
		prompt: params.prompt,
		provider: dispatch.provider,
		model: params.model,
		cwd: params.cwd ?? params.workspaceDir,
		config: params.config,
		expectedLifecycleRevision,
		expectedWriterRunId,
		...params.senderIsOwner !== void 0 ? { senderIsOwner: params.senderIsOwner } : {}
	});
	const unsubscribe = onAgentEventForRun(params.runId, (evt) => {
		if (evt.runId !== params.runId) return;
		if (evt.stream === "assistant" && typeof evt.data.text === "string") {
			transcript?.noteAssistantText(evt.data.text);
			return;
		}
		if (evt.stream !== "tool") return;
		const phase = evt.data.phase;
		if (phase !== "start" && phase !== "result") return;
		const rawName = typeof evt.data.name === "string" ? evt.data.name : "";
		if (!rawName) return;
		const toolName = normalizeToolPolicyName(stripOpenClawMcpToolPrefix(rawName));
		const toolCallId = typeof evt.data.toolCallId === "string" ? evt.data.toolCallId : void 0;
		if (phase === "start") {
			transcript?.noteToolEvent({
				phase,
				toolName,
				toolCallId,
				args: isRecord(evt.data.args) ? evt.data.args : void 0
			});
			return;
		}
		const isError = evt.data.isError === true || isToolResultError(evt.data.result);
		const resultContentSource = evt.data.resultContentSource === "network" ? "network" : void 0;
		transcript?.noteToolEvent({
			phase,
			toolName,
			toolCallId,
			result: evt.data.result,
			isError,
			...resultContentSource ? { resultContentSource } : {}
		});
		onAgentToolResult?.({
			toolName,
			result: evt.data.result,
			isError
		});
	});
	const flushOnAbort = () => transcript?.flushAssistantSnapshot();
	params.abortSignal?.addEventListener("abort", flushOnAbort, { once: true });
	params.onExecutionStarted?.(params.lifecycleGeneration !== void 0 ? { lifecycleGeneration: params.lifecycleGeneration } : void 0);
	log$1.info(`dispatching embedded run through CLI backend: runId=${params.runId} provider=${dispatch.provider} model=${params.model ?? ""}`);
	let finalAssistantText;
	try {
		const result = await runCliAgent({
			admittedRunContext,
			sessionManager: params.sessionManager,
			sessionId: params.sessionId,
			sessionKey: params.sessionKey,
			sessionTarget: params.sessionTarget,
			expectedLifecycleRevision,
			expectedWriterRunId,
			chatType: params.chatType,
			agentId: params.agentId,
			storePath,
			trigger: params.trigger,
			sessionFile: dispatch.sessionFile,
			workspaceDir: params.workspaceDir,
			agentDir: params.agentDir,
			config: params.config,
			prompt: params.prompt,
			imagePrompt: params.prompt,
			images: params.images,
			imageOrder: params.imageOrder,
			media: params.media,
			provider: dispatch.provider,
			model: params.model,
			modelHasVision: params.modelHasVision,
			contextWindow: params.contextWindow,
			thinkLevel: params.thinkLevel,
			timeoutMs: params.timeoutMs,
			runTimeoutOverrideMs: params.runTimeoutOverrideMs ?? params.timeoutMs,
			runId: params.runId,
			lifecycleGeneration: params.lifecycleGeneration,
			lane: params.lane,
			extraSystemPrompt: params.extraSystemPrompt,
			messageChannel: params.messageChannel,
			messageProvider: params.messageProvider,
			bootstrapContextMode: params.bootstrapContextMode,
			bootstrapContextRunKind: params.bootstrapContextRunKind,
			abortSignal: params.abortSignal,
			onBlockReply: params.onBlockReply,
			onPartialReply: params.onPartialReply,
			onExecutionPhase: params.onExecutionPhase,
			cliToolAvailability,
			disableCliLiveSession: true,
			cleanupCliLiveSessionOnRunEnd: true,
			requireExplicitMessageTarget: true
		});
		finalAssistantText = result.payloads?.find((payload) => payload.isReasoning !== true && typeof payload.text === "string")?.text;
		return withoutCliSessionBinding(result);
	} finally {
		params.abortSignal?.removeEventListener("abort", flushOnAbort);
		unsubscribe();
		await transcript?.finalize(finalAssistantText);
		if (params.cleanupBundleMcpOnRunEnd === true) await retireDispatchSessionMcpRuntime(params);
	}
}
/**
* Mirrors the embedded runner's cleanupBundleMcpOnRunEnd semantics for the
* CLI dispatch path: retire only this run's session-scoped MCP runtimes so
* stdio children do not idle until the TTL reaper, without touching the
* process-wide loopback server shared with concurrent CLI turns.
*/
async function retireDispatchSessionMcpRuntime(params) {
	try {
		const { retireSessionMcpRuntime, retireSessionMcpRuntimeForSessionKey } = await import("./agent-bundle-mcp-tools-_jr6s37f.js");
		const onError = (error, sessionId) => {
			log$1.warn(`bundle-mcp cleanup failed after CLI dispatch run: runId=${params.runId} sessionId=${sessionId} error=${String(error)}`);
		};
		if (!await retireSessionMcpRuntimeForSessionKey({
			sessionKey: params.sessionKey,
			reason: "embedded-cli-dispatch-run-end",
			onError
		})) await retireSessionMcpRuntime({
			sessionId: params.sessionId,
			reason: "embedded-cli-dispatch-run-end",
			onError
		});
	} catch (error) {
		log$1.warn(`bundle-mcp cleanup unavailable after CLI dispatch run: runId=${params.runId} error=${String(error)}`);
	}
}
/** Dispatch runs own no session entry, so a returned CLI binding has no owner to persist it. */
function withoutCliSessionBinding(result) {
	const agentMeta = result.meta.agentMeta;
	if (!agentMeta?.cliSessionBinding && agentMeta?.clearCliSessionBinding !== true) return result;
	return {
		...result,
		meta: {
			...result.meta,
			agentMeta: {
				...agentMeta,
				cliSessionBinding: void 0,
				clearCliSessionBinding: void 0
			}
		}
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/post-compaction-loop-guard.ts
/**
* Guards against repeated tool-loop compactions that never make progress.
*/
/**
* Detects identical tool-call loops immediately after automatic compaction.
*
* The guard only observes a small post-compaction window; if compaction failed to break an
* identical args/result loop, the runner aborts before spending unbounded tokens.
*/
const log = createSubsystemLogger("agents/post-compaction-guard");
const DEFAULT_WINDOW_SIZE = 3;
const BASELINE_WINDOW_SIZE = 16;
const observationSignature = (call) => `${call.toolName}\0${call.argsHash}`;
/** Creates a stateful post-compaction loop detector for one embedded run. */
function createPostCompactionLoopGuard(options) {
	const state = {
		enabled: options?.enabled ?? true,
		windowSize: DEFAULT_WINDOW_SIZE,
		remainingAttempts: 0,
		history: [],
		recentCalls: [],
		baselineSignatures: void 0,
		windowObserved: 0,
		windowRepeats: 0,
		repeatTools: /* @__PURE__ */ new Set()
	};
	const armPostCompaction = () => {
		state.baselineSignatures = state.enabled && state.recentCalls.length > 0 ? new Set(state.recentCalls.map(observationSignature)) : void 0;
		state.remainingAttempts = state.windowSize;
		state.history = [];
		state.windowObserved = 0;
		state.windowRepeats = 0;
		state.repeatTools = /* @__PURE__ */ new Set();
		if (state.enabled) log.info(`post-compaction guard armed for ${state.windowSize} attempts`);
	};
	const logWindowSummary = () => {
		const tools = [...state.repeatTools].toSorted().join(",");
		log.info(`post-compaction window closed: toolCalls=${state.windowObserved} preCompactionRepeats=${state.windowRepeats}${tools ? ` tools=${tools}` : ""}`);
	};
	const observe = (call) => {
		if (!state.enabled) return {
			shouldAbort: false,
			armed: false,
			remainingAttempts: 0
		};
		state.recentCalls.push(call);
		if (state.recentCalls.length > BASELINE_WINDOW_SIZE) state.recentCalls.shift();
		if (state.remainingAttempts <= 0) return {
			shouldAbort: false,
			armed: false,
			remainingAttempts: 0
		};
		state.remainingAttempts -= 1;
		state.windowObserved += 1;
		if (state.baselineSignatures?.has(observationSignature(call))) {
			state.windowRepeats += 1;
			state.repeatTools.add(call.toolName);
		}
		state.history.push(call);
		const armedAfter = state.remainingAttempts > 0;
		const matches = state.history.filter((entry) => entry.toolName === call.toolName && entry.argsHash === call.argsHash && entry.resultHash === call.resultHash);
		if (matches.length >= state.windowSize) {
			log.error(`post-compaction loop persisted: tool=${call.toolName} repeated ${matches.length} times with identical args+result post-compaction`);
			return {
				shouldAbort: true,
				armed: armedAfter,
				remainingAttempts: state.remainingAttempts,
				detector: "compaction_loop_persisted",
				count: matches.length,
				toolName: call.toolName,
				message: `CRITICAL: tool ${call.toolName} repeated ${matches.length} times with identical arguments and identical results within ${state.windowSize} attempts after auto-compaction. The compaction did not break the loop. Aborting to prevent runaway resource use.`
			};
		}
		if (!armedAfter) {
			logWindowSummary();
			state.baselineSignatures = void 0;
			state.windowObserved = 0;
			state.windowRepeats = 0;
			state.repeatTools = /* @__PURE__ */ new Set();
		}
		return {
			shouldAbort: false,
			armed: armedAfter,
			remainingAttempts: state.remainingAttempts
		};
	};
	const snapshot = () => ({
		armed: state.remainingAttempts > 0,
		remainingAttempts: state.remainingAttempts
	});
	return {
		armPostCompaction,
		observe,
		snapshot
	};
}
/** Error raised when the post-compaction loop guard aborts a run. */
var PostCompactionLoopPersistedError = class PostCompactionLoopPersistedError extends Error {
	constructor(message, details) {
		super(message);
		this.name = "PostCompactionLoopPersistedError";
		this.detector = details.detector;
		this.count = details.count;
		this.toolName = details.toolName;
	}
	static fromVerdict(verdict) {
		return new PostCompactionLoopPersistedError(verdict.message, {
			detector: verdict.detector,
			count: verdict.count,
			toolName: verdict.toolName
		});
	}
};
//#endregion
//#region src/agents/embedded-agent-runner/run/failover-policy.ts
function shouldEscalateRetryLimit(reason) {
	return Boolean(reason && reason !== "timeout" && reason !== "format" && reason !== "session_expired");
}
function isTerminalFormatFailure(params) {
	return params.failoverFailure && params.failoverReason === "format" && params.allowFormatRetry !== true;
}
function shouldRotatePrompt(params) {
	if (params.timedOutByRunBudget) return false;
	return params.failoverFailure && params.failoverReason !== "timeout" && params.failoverReason !== "tls_certificate" && !isTerminalFormatFailure(params);
}
function isAssistantTimeoutFailure(params) {
	return params.terminal.kind === "timeout" && params.terminal.source !== "observation" && (params.terminal.source === "idle" || params.terminal.phase === "prompt");
}
function isConcreteNonTimeoutAssistantFailure(params) {
	return params.failoverFailure && Boolean(params.failoverReason) && params.failoverReason !== "timeout";
}
function shouldRotateAssistant(params) {
	if (isTerminalFormatFailure(params)) return false;
	if (params.terminal.kind === "timeout" && params.terminal.source === "run_budget") return false;
	const timeoutFailure = isAssistantTimeoutFailure(params);
	if (params.harnessOwnsTransport && (timeoutFailure || params.failoverReason === "timeout") && !isConcreteNonTimeoutAssistantFailure(params)) return false;
	return !(params.terminal.kind === "aborted" && params.terminal.source !== "yield_cleanup" || params.terminal.kind === "timeout" && params.terminal.source !== "observation" && params.terminal.aborted === true) && params.failoverFailure || timeoutFailure;
}
function assistantFallbackReason(params) {
	const failoverReason = params.failoverReason;
	if (params.failoverFailure && failoverReason && failoverReason !== "timeout") return failoverReason;
	return isAssistantTimeoutFailure(params) ? "timeout" : failoverReason ?? "unknown";
}
/** Preserves an existing retry reason unless the current attempt produced a stronger signal. */
function mergeRetryFailoverReason(params) {
	return params.failoverReason ?? params.previous ?? (params.timedOut ? "timeout" : null);
}
/**
* Chooses whether a run should rotate auth profile, switch model fallback,
* surface the error, continue normally, or return an error payload. Prompt,
* assistant, and retry-limit stages intentionally use different action sets.
*/
function resolveRunFailoverDecision(params) {
	if (params.stage === "retry_limit") {
		if (params.fallbackConfigured && shouldEscalateRetryLimit(params.failoverReason)) return {
			action: "fallback_model",
			reason: params.failoverReason ?? "unknown"
		};
		return { action: "return_error_payload" };
	}
	if (params.stage === "prompt") {
		if (params.failoverCode === "cli_max_turns") return {
			action: "surface_error",
			reason: params.failoverReason
		};
		if (params.externalAbort) return {
			action: "surface_error",
			reason: params.failoverReason
		};
		if (params.timedOutByRunBudget) return {
			action: "surface_error",
			reason: params.failoverReason
		};
		if (params.harnessOwnsTransport && params.failoverReason === "timeout") {
			if (params.promptTimeoutFallbackSafe === true && params.fallbackConfigured) return {
				action: "fallback_model",
				reason: "timeout"
			};
			return {
				action: "surface_error",
				reason: params.failoverReason
			};
		}
		if (!params.profileRotated && shouldRotatePrompt(params)) return {
			action: "rotate_profile",
			reason: params.failoverReason
		};
		if (params.fallbackConfigured && params.failoverFailure && !isTerminalFormatFailure(params)) return {
			action: "fallback_model",
			reason: params.failoverReason ?? "unknown"
		};
		return {
			action: "surface_error",
			reason: params.failoverReason
		};
	}
	if (params.signalOwnedInterruption || (params.terminal.kind === "aborted" || params.terminal.kind === "timeout") && params.terminal.source === "external") return {
		action: "surface_error",
		reason: params.failoverReason
	};
	if (isTerminalFormatFailure(params)) return {
		action: "surface_error",
		reason: params.failoverReason
	};
	if (params.failoverFailure && params.failoverReason === "tls_certificate") return params.fallbackConfigured ? {
		action: "fallback_model",
		reason: "tls_certificate"
	} : {
		action: "surface_error",
		reason: "tls_certificate"
	};
	const assistantShouldRotate = shouldRotateAssistant(params);
	if (!params.profileRotated && assistantShouldRotate) return {
		action: "rotate_profile",
		reason: params.failoverReason
	};
	if (assistantShouldRotate && params.fallbackConfigured) return {
		action: "fallback_model",
		reason: assistantFallbackReason(params)
	};
	if (!assistantShouldRotate) return { action: "continue_normal" };
	return {
		action: "surface_error",
		reason: params.failoverReason
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/assistant-failover.ts
/**
* Handles assistant-stage failover decisions during embedded-agent attempts.
*/
function resolveShortWindowRateLimitRetry(message) {
	return classifyRateLimitWindow(message).kind === "short";
}
function isShortWindowRateLimitMessage(message) {
	return resolveShortWindowRateLimitRetry(message);
}
/**
* Applies an assistant-stage failover decision and returns the next run action.
* It owns auth-profile rotation, overload/rate-limit escalation, same-model
* idle-timeout retry, and FailoverError construction for outer model fallback.
*/
async function handleAssistantFailover(params) {
	const terminal = projectAgentRunAttemptTerminal(params.terminal);
	const assistantStatus = params.lastAssistant ? buildAssistantFailoverSignal(params.lastAssistant).status : void 0;
	const externalAbort = terminal.externalAbort || params.signalOwnedInterruption;
	let overloadProfileRotations = params.overloadProfileRotations;
	let decision = params.initialDecision;
	const sameModelTransientRetry = () => ({
		action: "retry",
		overloadProfileRotations,
		retryKind: "same_model_transient",
		lastRetryFailoverReason: mergeRetryFailoverReason({
			previous: params.previousRetryFailoverReason,
			failoverReason: params.failoverReason,
			timedOut: terminal.timedOut
		})
	});
	const canRetryRateLimit = params.failoverReason !== "rate_limit" || resolveShortWindowRateLimitRetry(params.lastAssistant?.errorMessage);
	const transientConsultReason = params.failoverReason ?? (terminal.idleTimedOut ? "timeout" : null);
	if (!externalAbort && canRetryRateLimit && transientConsultReason && (decision.action === "rotate_profile" || decision.action === "fallback_model" || decision.action === "surface_error") && await params.maybeRetryTransient({
		reason: transientConsultReason,
		retryAfterMs: resolveRetryAfterMs(params.lastAssistant?.errorMessage)
	})) {
		params.logAssistantFailoverDecision("retry_same_model", {
			retryCount: params.getTransientRetryCount(),
			profileRotationCount: overloadProfileRotations
		});
		return sameModelTransientRetry();
	}
	if (decision.action === "rotate_profile") {
		const failedProfileId = params.lastProfileId;
		const timeoutFailure = terminal.timedOut;
		const failureReason = params.assistantProfileFailureReason;
		const markFailedProfile = async () => {
			if (!failureReason) return;
			try {
				await params.maybeMarkAuthProfileFailure({
					profileId: failedProfileId,
					reason: failureReason,
					modelId: params.modelId
				});
			} catch (err) {
				params.warn(`profile failure mark failed: ${String(err)}`);
			}
		};
		if (params.failoverReason === "overloaded") {
			overloadProfileRotations += 1;
			if (overloadProfileRotations > params.overloadProfileRotationLimit && params.fallbackConfigured) {
				const status = assistantStatus ?? resolveFailoverStatus("overloaded");
				params.warn(`overload profile rotation cap reached for ${sanitizeForLog(params.provider)}/${sanitizeForLog(params.modelId)} after ${overloadProfileRotations} rotations; escalating to model fallback`);
				await markFailedProfile();
				params.logAssistantFailoverDecision("fallback_model", {
					status,
					retryCount: params.getTransientRetryCount(),
					profileRotationCount: overloadProfileRotations
				});
				return {
					action: "throw",
					overloadProfileRotations,
					error: new FailoverError("The AI service is temporarily overloaded. Please try again in a moment.", {
						reason: "overloaded",
						provider: params.activeErrorContext.provider,
						model: params.activeErrorContext.model,
						profileId: params.lastProfileId,
						status,
						rawError: params.lastAssistant?.errorMessage?.trim()
					})
				};
			}
		}
		let rotated;
		if (params.failoverReason === "rate_limit") rotated = await params.advanceRateLimitAuthProfile({
			failoverProvider: params.activeErrorContext.provider,
			failoverModel: params.activeErrorContext.model,
			logFallbackDecision: params.logAssistantFailoverDecision
		});
		else rotated = await params.advanceAuthProfile();
		const markFailedProfilePromise = markFailedProfile();
		if (timeoutFailure && !params.isProbeSession && failedProfileId) {
			const timeoutLabel = terminal.idleTimedOut ? "idle timeout (model silent)" : "timed out";
			params.warn(rotated ? `Profile ${failedProfileId} ${timeoutLabel}. Trying next account...` : `Profile ${failedProfileId} ${timeoutLabel}. No further authorized account for this provider; create a backup auth profile and add its id to auth.order to enable failover.`);
		}
		if (params.cloudCodeAssistFormatError && failedProfileId) params.warn(`Profile ${failedProfileId} hit Cloud Code Assist format error. Tool calls will be sanitized on retry.`);
		if (rotated) {
			params.logAssistantFailoverDecision("rotate_profile", {
				retryCount: params.getTransientRetryCount(),
				profileRotationCount: overloadProfileRotations
			});
			return {
				action: "retry",
				overloadProfileRotations,
				retryKind: "profile_rotation",
				lastRetryFailoverReason: mergeRetryFailoverReason({
					previous: params.previousRetryFailoverReason,
					failoverReason: params.failoverReason,
					timedOut: terminal.timedOut
				})
			};
		}
		await markFailedProfilePromise;
		decision = resolveRunFailoverDecision({
			stage: "assistant",
			allowFormatRetry: params.cloudCodeAssistFormatError,
			terminal: params.terminal,
			signalOwnedInterruption: params.signalOwnedInterruption,
			fallbackConfigured: params.fallbackConfigured,
			failoverFailure: params.failoverFailure,
			failoverReason: params.failoverReason,
			harnessOwnsTransport: params.harnessOwnsTransport,
			profileRotated: true
		});
	}
	if (decision.action === "fallback_model") {
		const message = resolveAssistantFailoverErrorMessage(params);
		const status = assistantStatus ?? resolveFailoverStatus(decision.reason) ?? (isTimeoutErrorMessage(message) ? 408 : void 0);
		params.logAssistantFailoverDecision("fallback_model", {
			status,
			retryCount: params.getTransientRetryCount(),
			profileRotationCount: overloadProfileRotations
		});
		const shouldSuspend = Boolean(params.sessionKey) && (decision.reason === "rate_limit" || decision.reason === "billing");
		return {
			action: "throw",
			overloadProfileRotations,
			error: new FailoverError(message, {
				reason: decision.reason,
				provider: params.activeErrorContext.provider,
				model: params.activeErrorContext.model,
				profileId: params.lastProfileId,
				authMode: params.authMode,
				status,
				rawError: params.lastAssistant?.errorMessage?.trim(),
				suspend: shouldSuspend
			})
		};
	}
	if (decision.action === "surface_error") {
		params.logAssistantFailoverDecision("surface_error", {
			retryCount: params.getTransientRetryCount(),
			profileRotationCount: overloadProfileRotations
		});
		if (!externalAbort && !terminal.timedOut && params.failoverFailure) {
			const message = resolveAssistantFailoverErrorMessage(params);
			const reason = resolveSurfaceErrorReason(decision.reason, params);
			const status = assistantStatus ?? resolveFailoverStatus(reason) ?? (isTimeoutErrorMessage(message) ? 408 : void 0);
			const shouldSuspend = Boolean(params.sessionKey) && (reason === "rate_limit" || reason === "billing");
			return {
				action: "throw",
				overloadProfileRotations,
				error: new FailoverError(message, {
					reason,
					provider: params.activeErrorContext.provider,
					model: params.activeErrorContext.model,
					profileId: params.lastProfileId,
					authMode: params.authMode,
					status,
					rawError: params.lastAssistant?.errorMessage?.trim(),
					suspend: shouldSuspend
				})
			};
		}
	}
	params.logAssistantFailoverDecision("continue_normal", {
		retryCount: params.getTransientRetryCount(),
		profileRotationCount: overloadProfileRotations
	});
	return {
		action: "continue_normal",
		overloadProfileRotations
	};
}
function resolveAssistantFailoverErrorMessage(params) {
	const timeoutFailure = params.terminal.kind === "timeout" && params.terminal.source !== "observation";
	return (params.lastAssistant ? formatUserFacingAssistantErrorText(params.lastAssistant, {
		cfg: params.config,
		sessionKey: params.sessionKey,
		agentId: params.agentId,
		provider: params.activeErrorContext.provider,
		providerOwner: params.providerOwner,
		model: params.activeErrorContext.model,
		authMode: params.authMode
	}) : void 0) || params.lastAssistant?.errorMessage?.trim() || (timeoutFailure ? "LLM request timed out." : params.rateLimitFailure ? "LLM request rate limited." : params.billingFailure ? formatBillingErrorMessage(params.activeErrorContext.provider, params.activeErrorContext.model, params.authMode) : params.authFailure ? "LLM request unauthorized." : "LLM request failed.");
}
function resolveSurfaceErrorReason(declared, params) {
	if (declared) return declared;
	if (params.billingFailure) return "billing";
	if (params.authFailure) return "auth";
	if (params.rateLimitFailure) return "rate_limit";
	return "unknown";
}
//#endregion
//#region src/agents/embedded-agent-runner/run/failover-observation.ts
/**
* Logs redacted failover decisions for embedded-agent attempts.
*/
/**
* Derives timeout failure reasons for logs that were built from timeout state
* before the normal provider error classifier had a raw error to inspect.
*/
function normalizeFailoverDecisionObservationBase(base) {
	return {
		...base,
		failoverReason: base.failoverReason ?? (base.timedOut ? "timeout" : null),
		profileFailureReason: base.profileFailureReason ?? (base.timedOut ? "timeout" : null)
	};
}
/**
* Captures sanitized failover context and returns a decision logger. The closure
* keeps prompt/assistant failover branches consistent while still allowing the
* final decision and HTTP status to be supplied at the action point.
*/
function createFailoverDecisionLogger(base) {
	const normalizedBase = normalizeFailoverDecisionObservationBase(base);
	const safeProfileId = normalizedBase.profileId ? redactIdentifier(normalizedBase.profileId, { len: 12 }) : void 0;
	const safeRunId = sanitizeForConsole(normalizedBase.runId) ?? "-";
	const safeProvider = sanitizeForConsole(normalizedBase.provider) ?? "-";
	const safeModel = sanitizeForConsole(normalizedBase.model) ?? "-";
	const safeSourceProvider = sanitizeForConsole(normalizedBase.sourceProvider) ?? safeProvider;
	const safeSourceModel = sanitizeForConsole(normalizedBase.sourceModel) ?? safeModel;
	const profileText = safeProfileId ?? "-";
	const reasonText = normalizedBase.failoverReason ?? "none";
	const sourceChanged = safeSourceProvider !== safeProvider || safeSourceModel !== safeModel;
	return (decision, extra) => {
		const observedError = buildApiErrorObservationFields(normalizedBase.rawError);
		const safeRawErrorPreview = sanitizeForConsole(observedError.rawErrorPreview);
		const rawErrorConsoleSuffix = safeRawErrorPreview && !shouldSuppressRawErrorConsoleSuffix(observedError.providerRuntimeFailureKind) ? ` rawError=${safeRawErrorPreview}` : "";
		const retryCount = extra?.retryCount ?? normalizedBase.retryCount;
		const profileRotationCount = extra?.profileRotationCount ?? normalizedBase.profileRotationCount;
		__vCodexTurnTail().mark(normalizedBase.runId, "failover-decision"); // V codex-turn-tail-v1
		log$3.warn("embedded run failover decision", {
			event: "embedded_run_failover_decision",
			tags: [
				"error_handling",
				"failover",
				normalizedBase.stage,
				decision
			],
			runId: normalizedBase.runId,
			stage: normalizedBase.stage,
			decision,
			failoverReason: normalizedBase.failoverReason,
			profileFailureReason: normalizedBase.profileFailureReason,
			provider: normalizedBase.provider,
			model: normalizedBase.model,
			sourceProvider: normalizedBase.sourceProvider ?? normalizedBase.provider,
			sourceModel: normalizedBase.sourceModel ?? normalizedBase.model,
			profileId: safeProfileId,
			fallbackConfigured: normalizedBase.fallbackConfigured,
			timedOut: normalizedBase.timedOut,
			aborted: normalizedBase.aborted,
			status: extra?.status,
			retryCount,
			profileRotationCount,
			attemptCount: normalizedBase.attemptCount,
			...observedError,
			consoleMessage: `embedded run failover decision: runId=${safeRunId} stage=${normalizedBase.stage} decision=${decision} reason=${reasonText} attempt=${normalizedBase.attemptCount ?? "-"} retry=${retryCount ?? "-"} rotations=${profileRotationCount ?? "-"} from=${safeSourceProvider}/${safeSourceModel}${sourceChanged ? ` to=${safeProvider}/${safeModel}` : ""} profile=${profileText}${rawErrorConsoleSuffix}`
		});
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/assistant-failure.ts
const MAX_EMPTY_ERROR_RETRIES = 3;
async function handleEmbeddedAssistantFailure(input) {
	const failedAssistant = input.attemptAssistant?.stopReason === "error" ? input.attemptAssistant : void 0;
	const { aborted, idleTimedOut, promptError, timedOut } = projectAgentRunAttemptTerminal(input.attempt.terminal);
	const terminalInterrupted = isEmbeddedRunTerminalInterrupted(input.terminalState.outcome);
	const { signalOwnedInterruption } = input.terminalState;
	const fallbackThinking = pickFallbackThinkingLevel({
		message: failedAssistant?.errorMessage,
		attempted: input.attemptedThinking
	});
	const authFailure = isAuthAssistantError(failedAssistant);
	const rateLimitFailure = isRateLimitAssistantError(failedAssistant);
	const billingFailure = isBillingAssistantError(failedAssistant);
	const failoverFailure = isFailoverAssistantError(failedAssistant);
	const assistantFailoverReason = classifyAssistantFailoverReason(failedAssistant, { providerOwner: input.providerOwner });
	const assistantProviderStarted = Boolean(input.currentAttemptAssistant?.provider) || input.terminalState.outcome.providerStarted === true;
	const assistantProfileFailoverReason = assistantFailoverReason ?? (assistantProviderStarted && (timedOut || idleTimedOut) ? "timeout" : null);
	const assistantProfileFailureReason = input.resolveAuthProfileFailureReason(assistantProfileFailoverReason, {
		providerStarted: assistantProviderStarted,
		transientRateLimit: assistantProfileFailoverReason === "rate_limit" && isShortWindowRateLimitMessage(failedAssistant?.errorMessage)
	});
	const terminalAssistantError = isTerminalAssistantError(input.attemptAssistant);
	if (terminalAssistantError || !isCurrentAttemptReplaySafe(input.attempt)) return buildOutcome(input, {
		action: "proceed",
		assistantProfileFailureReason: terminalAssistantError ? null : assistantProfileFailureReason
	});
	if (fallbackThinking && !terminalInterrupted) {
		log$3.warn(`unsupported thinking level for ${input.provider}/${input.modelId}; retrying with ${fallbackThinking}`);
		return buildOutcome(input, {
			action: "retry",
			thinkLevel: fallbackThinking,
			assistantProfileFailureReason
		});
	}
	const cloudCodeAssistFormatError = input.attempt.cloudCodeAssistFormatError;
	const imageDimensionError = parseImageDimensionError(failedAssistant?.errorMessage ?? "");
	const silentControllerConsultReason = assistantFailoverReason === "no_error_details" || assistantFailoverReason === "unclassified" || assistantFailoverReason === "unknown" ? null : assistantFailoverReason;
	const replaySafeSilentErrorFailure = !authFailure && !rateLimitFailure && !billingFailure && !cloudCodeAssistFormatError && !imageDimensionError && !terminalInterrupted && !promptError && shouldRetrySilentErrorAssistantTurn({
		attempt: input.attempt,
		assistant: failedAssistant
	});
	if (replaySafeSilentErrorFailure) {
		if (silentControllerConsultReason === null) {
			if (input.emptyErrorRetries < MAX_EMPTY_ERROR_RETRIES) {
				const emptyErrorRetries = input.emptyErrorRetries + 1;
				log$3.warn(`[empty-error-retry] stopReason=error non-visible-output; resubmitting attempt=${emptyErrorRetries}/${MAX_EMPTY_ERROR_RETRIES} provider=${failedAssistant?.provider ?? input.provider} model=${failedAssistant?.model ?? input.model} sessionKey=${input.runParams.sessionKey ?? input.runParams.sessionId}`);
				return buildOutcome(input, {
					action: "retry",
					emptyErrorRetries,
					assistantProfileFailureReason
				});
			}
		} else if (await input.maybeRetryTransient({
			reason: silentControllerConsultReason,
			retryAfterMs: resolveRetryAfterMs(failedAssistant?.errorMessage)
		})) {
			log$3.warn(`[empty-error-retry] stopReason=error non-visible-output; transient reason=${silentControllerConsultReason} retrying same model provider=${failedAssistant?.provider ?? input.provider} model=${failedAssistant?.model ?? input.model} sessionKey=${input.runParams.sessionKey ?? input.runParams.sessionId}`);
			return buildOutcome(input, {
				action: "retry",
				assistantProfileFailureReason
			});
		}
	}
	const exhaustedUnclassifiedSilentError = input.fallbackConfigured && assistantFailoverReason === null && replaySafeSilentErrorFailure && input.emptyErrorRetries >= MAX_EMPTY_ERROR_RETRIES;
	const effectiveFailoverReason = exhaustedUnclassifiedSilentError ? "unknown" : assistantFailoverReason;
	const failedProfileId = input.authProfileId;
	const logFailoverDecision = createFailoverDecisionLogger({
		stage: "assistant",
		runId: input.runParams.runId,
		rawError: failedAssistant?.errorMessage?.trim(),
		failoverReason: effectiveFailoverReason,
		profileFailureReason: assistantProfileFailureReason,
		provider: input.activeErrorContext.provider,
		model: input.activeErrorContext.model,
		sourceProvider: failedAssistant?.provider ?? input.provider,
		sourceModel: failedAssistant?.model ?? input.modelId,
		profileId: failedProfileId,
		fallbackConfigured: input.fallbackConfigured,
		timedOut,
		aborted,
		retryCount: input.getTransientRetryCount(),
		profileRotationCount: input.overloadProfileRotations,
		attemptCount: input.traceAttempts.length + 1
	});
	if (!signalOwnedInterruption && authFailure && await input.maybeRefreshRuntimeAuthForAuthError(failedAssistant?.errorMessage ?? "", input.runtimeAuthRetry)) return buildOutcome(input, {
		action: "retry",
		authRetryPending: true,
		assistantProfileFailureReason
	});
	if (imageDimensionError && input.authProfileId) {
		const details = [
			imageDimensionError.messageIndex !== void 0 ? `message=${imageDimensionError.messageIndex}` : null,
			imageDimensionError.contentIndex !== void 0 ? `content=${imageDimensionError.contentIndex}` : null,
			imageDimensionError.maxDimensionPx !== void 0 ? `limit=${imageDimensionError.maxDimensionPx}px` : null
		].filter(Boolean).join(" ");
		log$3.warn(`Profile ${input.authProfileId} rejected image payload${details ? ` (${details})` : ""}.`);
	}
	const initialDecision = exhaustedUnclassifiedSilentError ? {
		action: "fallback_model",
		reason: "unknown"
	} : resolveRunFailoverDecision({
		stage: "assistant",
		allowFormatRetry: cloudCodeAssistFormatError,
		terminal: input.attempt.terminal,
		signalOwnedInterruption,
		fallbackConfigured: input.fallbackConfigured,
		failoverFailure,
		failoverReason: assistantFailoverReason,
		harnessOwnsTransport: input.pluginHarnessOwnsTransport,
		profileRotated: false
	});
	const outcome = await handleAssistantFailover({
		initialDecision,
		terminal: input.attempt.terminal,
		signalOwnedInterruption,
		fallbackConfigured: input.fallbackConfigured,
		failoverFailure,
		failoverReason: assistantFailoverReason,
		harnessOwnsTransport: input.pluginHarnessOwnsTransport,
		assistantProfileFailureReason,
		lastProfileId: input.authProfileId,
		modelId: input.modelId,
		provider: input.provider,
		providerOwner: input.providerOwner,
		activeErrorContext: input.activeErrorContext,
		lastAssistant: failedAssistant,
		config: input.runParams.config,
		sessionKey: input.runParams.sessionKey ?? input.runParams.sessionId,
		agentId: input.runParams.agentId,
		authFailure,
		rateLimitFailure,
		billingFailure,
		authMode: input.authProfileId ? input.authProfileStore.profiles?.[input.authProfileId]?.type : void 0,
		cloudCodeAssistFormatError,
		isProbeSession: input.isProbeSession,
		overloadProfileRotations: input.overloadProfileRotations,
		overloadProfileRotationLimit: input.overloadProfileRotationLimit,
		getTransientRetryCount: input.getTransientRetryCount,
		previousRetryFailoverReason: input.previousRetryFailoverReason,
		logAssistantFailoverDecision: logFailoverDecision,
		warn: (message) => log$3.warn(message),
		maybeMarkAuthProfileFailure: input.maybeMarkAuthProfileFailure,
		maybeRetryTransient: input.maybeRetryTransient,
		advanceAuthProfile: input.advanceAuthProfile,
		advanceRateLimitAuthProfile: input.advanceRateLimitAuthProfile
	});
	if (outcome.action === "retry") {
		const retryTraceResult = outcome.retryKind === "same_model_transient" ? effectiveFailoverReason === "timeout" ? "timeout" : "same_model_transient" : effectiveFailoverReason === "timeout" ? "timeout" : "rotate_profile";
		input.traceAttempts.push({
			provider: input.activeErrorContext.provider,
			model: input.activeErrorContext.model,
			result: retryTraceResult,
			...effectiveFailoverReason ? { reason: effectiveFailoverReason } : {},
			stage: "assistant"
		});
		return buildOutcome(input, {
			action: "retry",
			thinkLevel: outcome.retryKind === "profile_rotation" ? input.getThinkLevel() : input.thinkLevel,
			overloadProfileRotations: outcome.overloadProfileRotations,
			lastRetryFailoverReason: outcome.lastRetryFailoverReason,
			assistantProfileFailureReason
		});
	}
	if (outcome.action === "throw") {
		input.traceAttempts.push({
			provider: input.activeErrorContext.provider,
			model: input.activeErrorContext.model,
			result: effectiveFailoverReason === "timeout" ? "timeout" : initialDecision.action === "fallback_model" ? "fallback_model" : "error",
			...effectiveFailoverReason ? { reason: effectiveFailoverReason } : {},
			stage: "assistant",
			...typeof outcome.error.status === "number" ? { status: outcome.error.status } : {}
		});
		if (outcome.error.suspend) input.suspendForFailure({
			cfg: input.runParams.config,
			agentDir: input.agentDir,
			sessionId: input.suspensionSessionId,
			reason: resolveSessionSuspensionReason(outcome.error.reason),
			failedProvider: outcome.error.provider ?? input.provider,
			failedModel: outcome.error.model ?? input.modelId
		});
		throw outcome.error;
	}
	return buildOutcome(input, {
		action: "proceed",
		overloadProfileRotations: outcome.overloadProfileRotations,
		assistantProfileFailureReason
	});
}
function buildOutcome(input, override) {
	return {
		action: override.action,
		thinkLevel: override.thinkLevel ?? input.thinkLevel,
		authRetryPending: override.authRetryPending ?? false,
		emptyErrorRetries: override.emptyErrorRetries ?? input.emptyErrorRetries,
		overloadProfileRotations: override.overloadProfileRotations ?? input.overloadProfileRotations,
		lastRetryFailoverReason: override.lastRetryFailoverReason ?? input.previousRetryFailoverReason,
		assistantProfileFailureReason: override.assistantProfileFailureReason
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/auth-store.ts
function resolveAttemptDispatchApiKey(params) {
	if (params.runtimeAuthState) return params.pluginHarnessOwnsTransport ? params.runtimeAuthState.sourceApiKey : void 0;
	return params.apiKeyInfo?.apiKey;
}
function createEmptyAuthProfileStore() {
	return {
		version: 1,
		profiles: {}
	};
}
function createScopedAuthProfileStore(store, profileIds) {
	const profiles = store.profiles ?? {};
	const normalizedProfileIds = (Array.isArray(profileIds) ? profileIds : [profileIds]).map((profileId) => profileId?.trim()).filter((profileId) => Boolean(profileId));
	const scopedProfiles = Object.fromEntries(normalizedProfileIds.flatMap((profileId) => {
		const credential = profiles[profileId];
		return credential ? [[profileId, credential]] : [];
	}));
	const scopedRuntimeExternalProfileIds = (store.runtimeExternalProfileIds ?? []).filter((profileId) => scopedProfiles[profileId]);
	const scopedRuntimePersistedProfileIds = (store.runtimePersistedProfileIds ?? []).filter((profileId) => scopedProfiles[profileId]);
	return Object.keys(scopedProfiles).length > 0 ? {
		version: store.version,
		profiles: scopedProfiles,
		...scopedRuntimePersistedProfileIds.length > 0 ? { runtimePersistedProfileIds: scopedRuntimePersistedProfileIds } : {},
		...scopedRuntimeExternalProfileIds.length > 0 || store.runtimeExternalProfileIdsAuthoritative === true ? { runtimeExternalProfileIds: scopedRuntimeExternalProfileIds } : {},
		...store.runtimeExternalProfileIdsAuthoritative === true ? { runtimeExternalProfileIdsAuthoritative: true } : {}
	} : createEmptyAuthProfileStore();
}
//#endregion
//#region src/agents/incognito-system-prompt.ts
const INCOGNITO_SYSTEM_PROMPT = "This chat is incognito; do not store its conversation content in memory files or long-term notes.";
function appendIncognitoSystemPrompt(params) {
	if (!(isIncognitoSessionKey(params.sessionKey) || params.storePath && isIncognitoOpenClawAgentSqlitePath(params.storePath, { agentId: params.agentId }))) return params.extraSystemPrompt;
	const existing = params.extraSystemPrompt?.trim();
	return existing ? `${existing}\n\n${INCOGNITO_SYSTEM_PROMPT}` : INCOGNITO_SYSTEM_PROMPT;
}
//#endregion
//#region src/agents/progress-card-system-prompt.ts
const PROGRESS_CARD_SYSTEM_PROMPT = "During multi-step work, keep your progress card current with the progress_card tool; the user follows it instead of reading the transcript.";
function isAgentMainSession(params) {
	if (!params.sessionKey) return true;
	return canonicalizeMainSessionAlias({
		cfg: params.config,
		agentId: params.agentId,
		sessionKey: params.sessionKey
	}) === canonicalizeMainSessionAlias({
		cfg: params.config,
		agentId: params.agentId,
		sessionKey: resolveAgentMainSessionKey({
			cfg: params.config,
			agentId: params.agentId
		})
	});
}
/**
* Pairing may change between sessions and embedded attempts because this fragment
* sits below the prompt-cache boundary. Codex pins developer instructions at
* thread creation, so a mid-session pairing change reaches its next thread.
*/
async function appendProgressCardSystemPrompt(params) {
	if (!shouldIncludeProgressCardToolForOpenClawTools({
		agentId: params.agentId,
		agentSessionKey: params.sessionKey,
		config: params.config,
		modelId: params.modelId,
		modelProvider: params.provider,
		runtimeToolAllowlist: params.toolsAllow
	}) || isAgentMainSession(params) || !await hasPairedCardRenderer()) return params.extraSystemPrompt;
	const provider = params.provider.trim().toLowerCase();
	const modelId = params.modelId.trim();
	const authProfileId = params.authProfileId?.trim();
	const modelRef = `${provider}/${modelId}${authProfileId ? `@${authProfileId}` : ""}`;
	if (resolveUtilityModelRefForAgent({
		cfg: params.config ?? {},
		agentId: params.agentId,
		primaryProvider: provider,
		primaryModelRef: modelRef
	}) === modelRef) return params.extraSystemPrompt;
	const existing = params.extraSystemPrompt?.trim();
	return existing ? `${existing}\n\n${PROGRESS_CARD_SYSTEM_PROMPT}` : PROGRESS_CARD_SYSTEM_PROMPT;
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-exec-approval-continuation.ts
function prepareExecApprovalContinuationForAttempt(params) {
	if (!params.promptRange) return {
		prompt: params.prompt,
		transcriptPrompt: params.transcriptPrompt
	};
	const contextWindowTokens = Math.max(1, Math.floor(params.contextTokenBudget ?? params.modelContextWindow ?? params.modelMaxTokens ?? 2e5));
	const maxOutputUtf16Units = resolveLiveToolResultMaxChars({ contextWindowTokens });
	const prompt = resizeExecApprovalContinuationPrompt({
		prompt: params.prompt,
		range: params.promptRange,
		maxOutputUtf16Units
	});
	const transcriptPrompt = params.transcriptPrompt === void 0 ? void 0 : resizeExecApprovalContinuationPrompt({
		prompt: params.transcriptPrompt,
		range: params.transcriptPromptRange ?? params.promptRange,
		maxOutputUtf16Units
	});
	params.userTurnTranscriptRecorder?.replaceTextBeforePersistence?.(transcriptPrompt ?? prompt);
	return {
		prompt,
		transcriptPrompt
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/backend.ts
/**
* Dispatches embedded attempts to native harness or OpenClaw backend execution.
*/
/** Replaces backend-retained provenance with the exact prepared request fact. */
function resolveRuntimeModelAttempt(runtimePlan) {
	const credentialSource = runtimePlan?.auth.credentialSource;
	return credentialSource ? {
		provider: runtimePlan.resolvedRef.provider,
		model: runtimePlan.resolvedRef.modelId,
		credentialSource
	} : void 0;
}
/**
* Backend bridge for executing one embedded-agent attempt through the selected harness.
*/
async function runEmbeddedAttemptWithBackend(params) {
	const result = await runAgentHarnessAttempt(params);
	if (result.agentHarnessId !== "openclaw" && params.sessionKey && result.acceptedSessionSpawns?.length) {
		if (shouldContinueInteractiveAcceptedSessionSpawns({
			attempt: result,
			run: params
		})) {
			if (markRequesterTurnYielded({
				requesterSessionKey: params.sessionKey,
				requesterAgentId: params.agentId,
				requesterTurnRunId: params.runId
			}) === 0) throw new Error("accepted continuation children were not durably registered");
		} else settleRequesterAfterSessionSpawns({
			requesterSessionKey: params.sessionKey,
			requesterAgentId: params.agentId,
			requesterTurnRunId: params.runId,
			requesterYielded: result.yieldDetected === true,
			acceptedSessionSpawns: result.acceptedSessionSpawns
		});
	}
	const { modelAttempt: _backendModelAttempt, ...attempt } = result;
	const modelAttempt = resolveRuntimeModelAttempt(params.runtimePlan);
	return copyCoreTtsAttemptResultProvenance(result, {
		...attempt,
		...modelAttempt ? { modelAttempt } : {}
	});
}
/** Runs one operation-specific settled-turn finalization through the selected harness. */
async function runEmbeddedSettledTurnFinalizationWithBackend(params, settledAttempt, harness) {
	return runAgentHarnessSettledTurnFinalization(params, settledAttempt, harness);
}
//#endregion
//#region src/agents/embedded-agent-runner/run/skill-workshop-attempt-params.ts
function resolveSkillWorkshopAttemptParams(params) {
	return {
		skillWorkshopAutonomousCapture: params.skillWorkshopAutonomousCapture,
		skillWorkshopUpdateProposals: params.skillWorkshopUpdateProposals,
		skillWorkshopProposalOnly: params.skillWorkshopProposalOnly,
		skillWorkshopProposalEnv: params.skillWorkshopProposalEnv,
		skillWorkshopOrigin: params.skillWorkshopOrigin,
		skillWorkshopProposalMutationBudget: params.skillWorkshopProposalMutationBudget,
		skillWorkshopProposalReviewCompletion: params.skillWorkshopProposalReviewCompletion,
		skillWorkshopCollectionReconcile: params.skillWorkshopCollectionReconcile,
		skillWorkshopProposalRevision: params.skillWorkshopProposalRevision,
		skillLibraryAuthoring: params.skillLibraryAuthoring
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/run-attempt-dispatch.ts
async function dispatchEmbeddedRunAttempt(input) {
	const { params, runtime, control } = input;
	const observeToolTerminal = createToolTerminalObserver(params.runId);
	const attemptAbortController = new AbortController();
	control.setPostCompactionAbortController(attemptAbortController);
	const preparedExecApprovalContinuation = prepareExecApprovalContinuationForAttempt({
		prompt: runtime.prompt,
		transcriptPrompt: params.transcriptPrompt,
		promptRange: params.execApprovalContinuationPromptRange,
		transcriptPromptRange: params.execApprovalContinuationTranscriptPromptRange,
		contextTokenBudget: runtime.contextTokenBudget,
		modelContextWindow: runtime.model.contextWindow,
		modelMaxTokens: runtime.model.maxTokens,
		userTurnTranscriptRecorder: params.userTurnTranscriptRecorder
	});
	const pluginWorkspace = control.pluginHarnessOwnsTransport ? await resolveAttemptWorkspaceSandbox({
		...params,
		agentId: runtime.agentId,
		cwd: void 0,
		sessionId: runtime.sessionId,
		sessionKey: runtime.sessionKey,
		workspaceDir: runtime.workspaceDir
	}) : void 0;
	const promptMedia = pluginWorkspace ? await prepareEmbeddedAttemptPromptExecution({
		attempt: {
			...params,
			model: runtime.model
		},
		mediaOwnerAgentId: pluginWorkspace.sessionAgentId,
		effectiveFsWorkspaceOnly: pluginWorkspace.effectiveFsWorkspaceOnly,
		effectiveWorkspace: pluginWorkspace.effectiveWorkspace,
		prompt: "",
		sandbox: pluginWorkspace.sandbox,
		skipPromptSubmission: false,
		pluginHarness: true
	}) : {
		images: params.images,
		imageOrder: params.imageOrder,
		media: params.media
	};
	const pluginHarnessPrompt = control.pluginHarnessOwnsTransport && params.finalizePromptForResolvedTools ? applyResolvedToolPromptFinalizer({
		prompt: preparedExecApprovalContinuation.prompt,
		activeToolNames: [],
		finalize: params.finalizePromptForResolvedTools
	}) : void 0;
	const pluginSandbox = control.pluginHarnessOwnsTransport ? await resolveSessionPlacementSandbox({
		agentId: runtime.agentId,
		config: params.config,
		sessionId: runtime.sessionId,
		sessionKey: runtime.sessionKey,
		workspaceDir: runtime.workspaceDir
	}) ?? pluginWorkspace?.sandbox : void 0;
	if (!params.admittedRunContext) throw new Error("embedded attempt reached dispatch without an admitted run context");
	const admittedRunContext = params.admittedRunContext;
	if (params.permissionMode) {
		params.execOverrides ??= {};
		params.execOverrides.mode = resolveSessionPermissionExecMode({ mode: params.permissionMode });
	}
	const incognitoSystemPrompt = appendIncognitoSystemPrompt({
		agentId: runtime.agentId,
		extraSystemPrompt: params.extraSystemPrompt,
		sessionKey: params.sessionKey,
		storePath: params.sessionTarget?.storePath
	});
	const extraSystemPrompt = await appendProgressCardSystemPrompt({
		agentId: runtime.agentId,
		authProfileId: runtime.authProfileId,
		config: params.config,
		extraSystemPrompt: incognitoSystemPrompt,
		modelId: runtime.modelId,
		provider: runtime.provider,
		sessionKey: params.sessionKey,
		toolsAllow: params.toolsAllow
	});
	let skillsSnapshot = resolveSessionSkillResourceSnapshot(params.skillsSnapshot);
	let skillReferencePaths;
	if (pluginSandbox?.enabled && !pluginSandbox.readOnlyResourceMounts?.length && skillsSnapshot?.librarySelections?.length) {
		const prepared = resolveSandboxSkillRuntimeInputs({
			sandbox: pluginSandbox,
			skillsAnchorWorkspace: runtime.bootstrapWorkspaceDir ?? runtime.workspaceDir,
			skillsSnapshot
		});
		skillsSnapshot = prepared.skillsSnapshot;
		skillReferencePaths = mapSandboxSkillUsagePaths({
			paths: pluginSandbox.skillUsagePaths,
			skillsWorkspaceDir: prepared.skillsWorkspaceDir,
			skillsPromptWorkspaceDir: prepared.skillsPromptWorkspaceDir
		});
	}
	const attemptControls = control.createAttemptControls({
		admittedRunContext,
		abortSignal: attemptAbortController.signal,
		onAbort: () => {
			if (!params.abortSignal?.aborted) params.replyOperation?.abortByUser();
		}
	});
	const attemptParams = {
		permissionChange: input.permissionChange,
		admittedRunContext: params.admittedRunContext,
		startedAtMs: input.runStartedAtMs,
		contextEngineAgentId: runtime.contextEngineAgentId,
		...control.pluginHarnessOwnsTransport ? { sandbox: pluginSandbox } : {},
		operation: "attempt",
		sessionId: runtime.sessionId,
		sessionKey: runtime.sessionKey,
		conversationRecall: params.conversationRecall,
		promptCacheKey: params.promptCacheKey,
		sandboxSessionKey: params.sandboxSessionKey,
		sandboxAgentId: params.sandboxAgentId,
		trigger: params.trigger,
		memoryFlushWritePath: params.memoryFlushWritePath,
		messageChannel: params.messageChannel,
		messageProvider: params.messageProvider,
		clientCaps: params.clientCaps,
		toolBindings: params.toolBindings,
		githubPublicationAvailable: params.githubPublicationAvailable,
		chatType: params.chatType,
		agentAccountId: params.agentAccountId,
		conversationRoutePeerId: params.conversationRoutePeerId,
		messageTo: params.messageTo,
		messageThreadId: params.messageThreadId,
		conversationToolPolicy: params.conversationToolPolicy,
		messageActionTurnCapability: params.messageActionTurnCapability,
		groupId: params.groupId,
		groupChannel: params.groupChannel,
		groupSpace: params.groupSpace,
		memberRoleIds: params.memberRoleIds,
		spawnedBy: params.spawnedBy,
		isCanonicalWorkspace: runtime.isCanonicalWorkspace,
		senderId: params.senderId,
		senderName: params.senderName,
		senderUsername: params.senderUsername,
		senderE164: params.senderE164,
		senderIsOwner: params.senderIsOwner,
		approvalReviewerDeviceId: params.approvalReviewerDeviceId,
		currentChannelId: params.currentChannelId,
		chatId: params.chatId,
		channelContext: params.channelContext,
		currentMessagingTarget: params.currentMessagingTarget,
		currentThreadTs: params.currentThreadTs,
		currentMessageId: params.currentMessageId,
		currentInboundAudio: params.currentInboundAudio,
		replyToMode: params.replyToMode,
		hasRepliedRef: params.hasRepliedRef,
		sessionFile: runtime.sessionFile,
		...input.transcriptOwnership.kind === "caller-owned" ? { sessionManager: input.transcriptOwnership.sessionManager } : { sessionTarget: input.transcriptOwnership.sessionTarget },
		trajectoryRecorder: runtime.trajectoryRecorder,
		workspaceDir: runtime.workspaceDir,
		bootstrapWorkspaceDir: runtime.bootstrapWorkspaceDir,
		cwd: params.cwd,
		permissionMode: params.permissionMode,
		sessionRoot: params.sessionRoot,
		agentDir: runtime.agentDir,
		preparedModelRuntime: runtime.preparedModelRuntime,
		config: params.config,
		toolOverrides: params.toolOverrides,
		allowGatewaySubagentBinding: params.allowGatewaySubagentBinding,
		...runtime.contextEngine ? {
			contextEngine: runtime.contextEngine,
			contextWindowInfo: runtime.contextWindowInfo
		} : {},
		...runtime.contextTokenBudget === void 0 ? {} : { contextTokenBudget: runtime.contextTokenBudget },
		...runtime.authoredContextTokenCap === void 0 ? {} : { authoredContextTokenCap: runtime.authoredContextTokenCap },
		skillsSnapshot,
		prompt: remapSkillReferencePaths(pluginHarnessPrompt ?? preparedExecApprovalContinuation.prompt, skillReferencePaths),
		transcriptPrompt: pluginHarnessPrompt !== void 0 && params.transcriptPrompt === void 0 ? preparedExecApprovalContinuation.prompt : preparedExecApprovalContinuation.transcriptPrompt,
		finalizePromptForResolvedTools: pluginHarnessPrompt === void 0 ? params.finalizePromptForResolvedTools : void 0,
		userTurnTranscriptRecorder: params.userTurnTranscriptRecorder,
		onContextEngineTurnCandidate: params.onContextEngineTurnCandidate,
		skipPreparedUserTurnMessage: runtime.skipPreparedUserTurnMessage,
		currentInboundEventKind: params.currentInboundEventKind,
		currentInboundContext: params.currentInboundContext,
		explicitSkillSelections: params.explicitSkillSelections,
		images: promptMedia.images,
		imageOrder: promptMedia.imageOrder,
		media: promptMedia.media,
		clientTools: params.clientTools,
		disableTools: params.disableTools,
		provider: runtime.provider,
		modelId: runtime.modelId,
		requestedModelId: runtime.requestedModelId,
		fallbackActive: runtime.fallbackActive,
		fallbackReason: runtime.fallbackReason,
		delegationCapability: resolveDelegationCapability({
			fallbackActive: runtime.fallbackActive,
			inputProvenance: params.inputProvenance,
			disableTools: params.disableTools,
			toolsAllow: params.toolsAllow
		}),
		isFinalFallbackAttempt: params.isFinalFallbackAttempt,
		agentHarnessId: runtime.agentHarnessId,
		agentHarnessRuntimeOverride: runtime.agentHarnessId,
		modelSelectionLocked: params.modelSelectionLocked,
		...runtime.captureRuntimeArtifact ? { captureRuntimeArtifact: true } : {},
		...runtime.expectedRuntimeArtifact ? { expectedRuntimeArtifact: runtime.expectedRuntimeArtifact } : {},
		...params.sessionKey ? { agentHarnessTaskRuntimeScope: createAgentHarnessTaskRuntimeScope({
			requesterSessionKey: params.sessionKey,
			gatewayContextResolver: getGatewayContextResolver(params.admittedRunContext)
		}) } : {},
		runtimePlan: runtime.runtimePlan,
		observeToolTerminal,
		model: applyAuthHeaderOverride(applyLocalNoAuthHeaderOverride(runtime.model, runtime.apiKeyInfo), runtime.runtimeAuthActive ? null : runtime.apiKeyInfo, params.config),
		resolvedApiKey: runtime.resolvedApiKey,
		authProfileId: runtime.authProfileId,
		authProfileIdSource: runtime.authProfileIdSource,
		initialReplayState: runtime.initialReplayState,
		authStorage: runtime.authStorage,
		authProfileStore: runtime.authProfileStore,
		toolAuthProfileStore: runtime.toolAuthProfileStore,
		modelRegistry: runtime.modelRegistry,
		agentId: runtime.agentId,
		thinkLevel: runtime.thinkLevel,
		onToolOutcome: control.onToolOutcome,
		isTurnTainted: control.isTurnTainted,
		allocateToolOutcomeOrdinal: control.allocateToolOutcomeOrdinal,
		onToolStreamBoundary: control.onToolStreamBoundary,
		onRunProgress: control.onRunProgress,
		fastMode: runtime.fastMode,
		fastModeAuto: params.fastMode === "auto",
		...params.fastMode === "auto" ? {
			fastModeStartedAtMs: runtime.fastModeStartedAtMs,
			fastModeAutoOnSeconds: runtime.fastModeAutoOnSeconds,
			fastModeAutoProgressState: runtime.fastModeAutoProgressState
		} : {},
		verboseLevel: params.verboseLevel,
		reasoningLevel: params.reasoningLevel,
		toolResultFormat: runtime.toolResultFormat,
		toolProgressDetail: params.toolProgressDetail,
		execOverrides: params.execOverrides,
		bashElevated: params.bashElevated,
		timeoutMs: params.timeoutMs,
		runTimeoutOverrideMs: params.runTimeoutOverrideMs,
		runId: params.runId,
		lifecycleGeneration: control.lifecycleGeneration,
		abortSignal: attemptControls.abortSignal,
		onAttemptDeadlineChanged: attemptControls.onAttemptDeadlineChanged,
		onAttemptTimeout: attemptControls.onAttemptTimeout,
		onAttemptAbort: attemptControls.onAttemptAbort,
		replyOperation: params.replyOperation,
		shouldEmitToolResult: params.shouldEmitToolResult,
		shouldEmitToolOutput: params.shouldEmitToolOutput,
		onPartialReply: params.onPartialReply,
		onAssistantMessageStart: params.onAssistantMessageStart,
		onBlockReply: params.onBlockReply,
		onBlockReplyFlush: params.onBlockReplyFlush,
		blockReplyBreak: params.blockReplyBreak,
		blockReplyChunking: params.blockReplyChunking,
		onReasoningStream: params.onReasoningStream,
		streamReasoningInNonStreamModes: params.streamReasoningInNonStreamModes,
		onReasoningEnd: params.onReasoningEnd,
		onToolResult: control.onToolResult,
		onAgentToolResult: params.onAgentToolResult,
		onAgentEvent: control.onAgentEvent,
		deferTerminalLifecycle: params.deferTerminalLifecycle ?? params.deferTerminalLifecycleEnd,
		onDeferredLifecycleOwner: params.onDeferredLifecycleOwner,
		onDeferredLifecycleAbort: params.onDeferredLifecycleAbort,
		onExecutionPhase: params.onExecutionPhase,
		extraSystemPrompt,
		sourceReplyDeliveryMode: params.sourceReplyDeliveryMode,
		taskSuggestionDeliveryMode: params.taskSuggestionDeliveryMode,
		inputProvenance: params.inputProvenance,
		trustedInternalHandoff: params.trustedInternalHandoff,
		scheduledToolPolicy: params.scheduledToolPolicy,
		cronCreatorAuthorityCapability: params.cronCreatorAuthorityCapability,
		cronCreatorAuthorityUnavailableReason: params.cronCreatorAuthorityUnavailableReason,
		streamParams: params.streamParams,
		modelRun: params.modelRun,
		disableTrajectory: params.disableTrajectory,
		...resolveSkillWorkshopAttemptParams(params),
		promptMode: params.promptMode,
		ownerNumbers: params.ownerNumbers,
		enforceFinalTag: params.enforceFinalTag,
		silentExpected: params.silentExpected,
		suppressLiveStreamOutput: params.suppressLiveStreamOutput,
		bootstrapContextMode: params.bootstrapContextMode,
		bootstrapContextRunKind: params.bootstrapContextRunKind,
		jobId: params.jobId,
		scheduledRuntimeAuthority: params.scheduledRuntimeAuthority,
		scheduledRuntimeAuthorityRecoveryRequired: params.scheduledRuntimeAuthorityRecoveryRequired,
		toolsAllow: params.toolsAllow,
		toolExecutionAllow: params.toolExecutionAllow,
		toolAuthorityFingerprint: params.toolAuthorityFingerprint,
		sessionPersistence: params.sessionPersistence,
		compactionCountOwner: "caller",
		onContextAccountingEvent: params.onContextAccountingEvent,
		...params.systemAgentTool ? { systemAgentTool: params.systemAgentTool } : {},
		cleanupBundleMcpOnRunEnd: params.cleanupBundleMcpOnRunEnd,
		disableMessageTool: params.disableMessageTool,
		swarmCollector: params.swarmCollector,
		swarmOutputSchema: params.swarmOutputSchema,
		codeModeRecovery: input.codeModeRecovery,
		forceRestartSafeTools: params.forceRestartSafeTools,
		forceCodeModeTools: params.forceCodeModeTools,
		codeModeOverride: params.codeModeOverride,
		forceMessageTool: params.forceMessageTool,
		enableHeartbeatTool: params.enableHeartbeatTool,
		forceHeartbeatTool: params.forceHeartbeatTool,
		requireExplicitMessageTarget: params.requireExplicitMessageTarget,
		internalEvents: params.internalEvents,
		bootstrapPromptWarningSignaturesSeen: input.bootstrapPromptWarningSignaturesSeen,
		bootstrapPromptWarningSignature: input.bootstrapPromptWarningSignaturesSeen[input.bootstrapPromptWarningSignaturesSeen.length - 1],
		suppressNextUserMessagePersistence: input.suppressNextUserMessagePersistence,
		beforeAgentFinalizeRevisionAttempts: input.beforeAgentFinalizeRevisionAttempts,
		maxBeforeAgentFinalizeRevisions: input.maxBeforeAgentFinalizeRevisions,
		suppressTranscriptOnlyAssistantPersistence: params.suppressTranscriptOnlyAssistantPersistence,
		suppressAssistantErrorPersistence: params.suppressAssistantErrorPersistence,
		onUserMessagePersisted: control.onUserMessagePersisted,
		onUserMessagePersistenceInvalidated: control.onUserMessagePersistenceInvalidated,
		onAssistantErrorMessagePersisted: params.onAssistantErrorMessagePersisted,
		prepareAssistantTranscriptMessage: params.prepareAssistantTranscriptMessage
	};
	const callerIdentity = createAdmittedGatewayToolCallerIdentity({
		admittedRunContext: attemptParams.admittedRunContext,
		agentId: runtime.agentId,
		sessionKey: runtime.sessionKey,
		turnSourceChannel: params.messageChannel ?? params.messageProvider,
		turnSourceLocal: !params.messageChannel && !params.messageProvider && params.cronCreatorAuthorityCapability?.callerOrigin.kind === "local" ? true : void 0,
		turnSourceTo: params.currentMessagingTarget ?? params.currentChannelId,
		turnSourceAccountId: params.agentAccountId,
		turnSourceThreadId: params.currentThreadTs
	});
	const rawAttempt = await withGatewayToolCallerIdentity(callerIdentity, () => runEmbeddedAttemptWithBackend(attemptParams)).catch((err) => {
		throw control.getPostCompactionAbortError() ?? err;
	}).finally(() => {
		attemptControls.close();
		control.clearPostCompactionAbortController(attemptAbortController);
	});
	const postCompactionAbortError = control.getPostCompactionAbortError();
	if (postCompactionAbortError) throw postCompactionAbortError;
	return {
		rawAttempt,
		preparedAttempt: attemptParams
	};
}
const OPENAI_RESPONSES_API = "openai-responses";
const OPENAI_CODEX_RESPONSES_API = "openai-chatgpt-responses";
function normalizeRuntimeId(value) {
	return value?.trim().toLowerCase() ?? "";
}
function resolveAttemptTrajectoryAttribution(params) {
	const authProfileProvider = normalizeRuntimeId(params.runtimePlan.auth?.authProfileProviderForAuth);
	if (normalizeRuntimeId(params.runtimePlan.observability?.harnessId) === "codex" && authProfileProvider !== "openai" && normalizeRuntimeId(params.model.provider) === "openai" && normalizeRuntimeId(params.model.api) === OPENAI_RESPONSES_API) return {
		modelApi: OPENAI_CODEX_RESPONSES_API,
		modelId: params.modelId,
		provider: OPENAI_PROVIDER_ID
	};
	return {
		...params.model.api ? { modelApi: params.model.api } : {},
		modelId: params.modelId,
		provider: params.provider
	};
}
function resolveInitialThinkLevel(params) {
	if (params.requested) return params.requested;
	return resolveThinkingDefault({
		cfg: params.config ?? {},
		provider: params.provider,
		model: params.modelId,
		catalog: [{
			provider: params.provider,
			id: params.modelId,
			name: params.modelId,
			reasoning: params.model.reasoning
		}]
	});
}
/** Marks only request parameters that OpenClaw applies to provider egress. */
function resolveRequestStreamTransportOverrides(streamParams) {
	return streamParams && Object.keys(streamParams).length > 0 ? "present" : void 0;
}
function resolveInitialEmbeddedRunModel(params) {
	const cfg = params.config ?? {};
	const staticPreliminaryNormalization = {
		allowManifestNormalization: false,
		allowPluginNormalization: false
	};
	const configuredDefault = resolveDefaultModelForAgent({
		cfg,
		agentId: params.agentId,
		...staticPreliminaryNormalization
	});
	const explicitProvider = normalizeOptionalString(params.provider);
	const explicitModel = normalizeOptionalString(params.model);
	const defaultProvider = configuredDefault.provider || "openai";
	if (explicitProvider && explicitModel) return {
		provider: explicitProvider,
		modelId: explicitModel
	};
	if (explicitModel) {
		const provider = explicitProvider ?? defaultProvider;
		const aliasIndex = buildModelAliasIndex({
			cfg,
			agentId: params.agentId,
			defaultProvider: provider,
			...staticPreliminaryNormalization
		});
		const resolved = resolveModelRefFromString({
			cfg,
			agentId: params.agentId,
			raw: explicitModel,
			defaultProvider: provider,
			aliasIndex,
			...staticPreliminaryNormalization
		});
		return {
			provider: explicitProvider ?? resolved?.ref.provider ?? provider,
			modelId: resolved?.ref.model ?? explicitModel
		};
	}
	return {
		provider: explicitProvider ?? defaultProvider,
		modelId: configuredDefault.model || "gpt-5.6-sol"
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/terminal-retry-state.ts
function createEmbeddedRunTerminalRetryState() {
	return {
		reasoningOnlyAttempts: 0,
		emptyResponseAttempts: 0,
		missingAssistantAttempts: 0,
		compactionContinuationAttempts: 0,
		compactionContinuationInstruction: null,
		beforeFinalizeRevisionAttempts: 0,
		codeModeRecovery: { kind: "idle" }
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-dispatch-preparation.ts
async function prepareAndDispatchEmbeddedRunAttempt(input) {
	const { runInput, preparedRuntime, contextEngine, sessionPromptState, terminalRetryState, provider, modelId } = input;
	const codeModeRecovery = terminalRetryState.codeModeRecovery;
	const params = codeModeRecovery.kind === "resume" ? {
		...runInput.runParams,
		codeModeOverride: false,
		forceCodeModeTools: false
	} : runInput.runParams;
	const { workspaceResolution, workspaceDir, bootstrapWorkspaceDir, isCanonicalWorkspace, agentDir, resolvedSessionKey, resolvedToolResultFormat, startupStages, emitStartupStageSummary, lifecycleGeneration } = runInput;
	const { fastModeAutoOnSeconds, fastModeAutoProgressState, fastModeStartedAtMs, maybeAnnounceFastModeAutoOff, notifyAgentEvent, notifyExecutionPhase, notifyRunProgress, notifyToolResult, resolveAttemptFastModeParam } = runInput.progressController;
	const { createAttemptControls } = runInput.laneController;
	const { requestedModelId, expectedHarnessArtifact, nativeModelOwned, authStorage, modelRegistry, attemptAuthProfileStore, lockedProfileId, resolveRunAttemptAuthProfileStore } = preparedRuntime;
	const runtime = preparedRuntime.snapshot();
	const effectiveModel = attachModelProviderRuntimePluginHandle(runtime.effectiveModel, runtime.providerRuntimeHandle);
	await fs.mkdir(workspaceDir, { recursive: true });
	if (!input.startupStagesEmitted) startupStages.mark(EMBEDDED_RUN_ATTEMPT_DISPATCH_STAGE.workspace);
	const basePrompt = sessionPromptState.activePrompt.override ?? resolveEmbeddedAttemptBasePrompt({
		provider,
		prompt: params.prompt
	});
	const prompt = terminalRetryState.compactionContinuationInstruction ? `${basePrompt}\n\n${terminalRetryState.compactionContinuationInstruction}` : basePrompt;
	const resolvedAttemptApiKey = resolveAttemptDispatchApiKey({
		apiKeyInfo: runtime.apiKeyInfo,
		runtimeAuthState: runtime.runtimeAuthState,
		pluginHarnessOwnsTransport: runtime.pluginHarnessOwnsTransport
	});
	const attemptFastMode = resolveAttemptFastModeParam();
	const existingSessionTarget = sessionPromptState.sessionTarget;
	const resolvedTranscriptTarget = (existingSessionTarget?.sessionKey === resolvedSessionKey || sessionPromptState.sessionTargetAdopted ? existingSessionTarget : void 0) ?? (resolvedSessionKey ? await resolveSessionTranscriptRuntimeTarget({
		agentId: workspaceResolution.agentId,
		sessionId: sessionPromptState.sessionId,
		sessionKey: resolvedSessionKey,
		storePath: resolveSessionStorePathCore(params.config?.session?.store, { agentId: workspaceResolution.agentId })
	}) : void 0);
	const resolvedSessionTarget = resolvedTranscriptTarget || sessionPromptState.sessionTarget ? {
		...sessionPromptState.sessionTarget,
		...resolvedTranscriptTarget,
		...sessionPromptState.sessionWriterFence
	} : void 0;
	await sessionPromptState.settleOwnedTranscriptProjection(resolvedSessionTarget, params.abortSignal);
	const trajectorySessionFile = resolvedSessionTarget?.sessionKey ?? sessionPromptState.sessionFile;
	if (!input.startupStagesEmitted) startupStages.mark(EMBEDDED_RUN_ATTEMPT_DISPATCH_STAGE.prompt);
	const runtimePlan = buildAgentRuntimePlan({
		provider,
		modelId,
		model: effectiveModel,
		modelApi: effectiveModel.api,
		harnessId: runtime.agentHarness.id,
		harnessRuntime: runtime.agentHarness.id,
		preparedAuthPlan: runtime.activePreparedAuthPlan,
		metadataSnapshot: runtime.pluginMetadataSnapshot,
		providerRuntimeHandle: runtime.providerRuntimeHandle,
		config: params.config,
		workspaceDir,
		agentDir,
		agentId: workspaceResolution.agentId,
		thinkingLevel: mapThinkingLevelForProvider(runtime.thinkLevel),
		extraParamsOverride: {
			...params.streamParams,
			fastMode: attemptFastMode
		}
	});
	const trajectoryAttribution = resolveAttemptTrajectoryAttribution({
		model: effectiveModel,
		modelId,
		provider,
		runtimePlan
	});
	const trajectoryRecorder = runtime.agentHarness.id === "codex" && !params.disableTrajectory && params.sessionPersistence !== "detached" ? createTrajectoryRuntimeRecorder({
		cfg: params.config,
		env: process.env,
		runId: params.runId,
		sessionId: sessionPromptState.sessionId,
		sessionKey: resolvedSessionKey,
		sessionFile: trajectorySessionFile,
		...resolvedSessionTarget?.agentId && resolvedSessionTarget.sessionId && resolvedSessionTarget.sessionKey && resolvedSessionTarget.storePath ? { sessionTarget: {
			agentId: resolvedSessionTarget.agentId,
			sessionId: resolvedSessionTarget.sessionId,
			sessionKey: resolvedSessionTarget.sessionKey,
			storePath: resolvedSessionTarget.storePath
		} } : {},
		provider: trajectoryAttribution.provider,
		modelId: trajectoryAttribution.modelId,
		modelApi: trajectoryAttribution.modelApi,
		workspaceDir
	}) : void 0;
	let startupStagesEmitted = input.startupStagesEmitted;
	if (!startupStagesEmitted) {
		startupStages.mark(EMBEDDED_RUN_ATTEMPT_DISPATCH_STAGE.runtimePlan);
		startupStages.mark(EMBEDDED_RUN_ATTEMPT_DISPATCH_STAGE.dispatch);
		notifyExecutionPhase("attempt_dispatch", {
			provider,
			model: modelId
		});
		emitStartupStageSummary(EMBEDDED_RUN_ATTEMPT_DISPATCH_STAGE.dispatch);
		startupStagesEmitted = true;
	}
	const fallbackReason = input.resolveRuntimeFallbackReason();
	recordAdmittedModelRoutingDecision({
		admittedRunContext: params.admittedRunContext,
		abortSignal: params.abortSignal,
		requestedProvider: params.modelRoutingProvenance?.requestedProvider ?? runInput.provider,
		requestedModel: params.modelRoutingProvenance?.requestedModel ?? requestedModelId ?? runInput.modelId,
		selectedProvider: provider,
		selectedModel: modelId,
		selectionMode: runtime.lastProfileId && runtime.lastProfileId === lockedProfileId ? "explicit" : "automatic",
		credentialProfileId: runtime.lastProfileId,
		fallbackSelected: params.modelRoutingProvenance?.stage === "fallback" || Boolean(fallbackReason),
		fallbackReason: params.modelRoutingProvenance?.fallbackReason
	});
	return {
		dispatchedAttempt: await dispatchEmbeddedRunAttempt({
			params,
			codeModeRecovery: codeModeRecovery.kind === "idle" ? void 0 : codeModeRecovery,
			permissionChange: input.permissionChange,
			runStartedAtMs: runInput.startedAtMs,
			transcriptOwnership: params.sessionManager ? {
				kind: "caller-owned",
				sessionManager: params.sessionManager
			} : {
				kind: "runtime-target",
				sessionTarget: resolvedSessionTarget
			},
			runtime: {
				contextEngineAgentId: runInput.contextEngineAgentId,
				sessionId: sessionPromptState.sessionId,
				sessionFile: sessionPromptState.sessionFile,
				sessionKey: resolvedSessionKey,
				trajectoryRecorder: trajectoryRecorder ?? void 0,
				workspaceDir,
				bootstrapWorkspaceDir,
				isCanonicalWorkspace,
				agentDir,
				preparedModelRuntime: runInput.preparedModelRuntime,
				contextEngine: nativeModelOwned ? void 0 : contextEngine,
				contextTokenBudget: runtime.contextTokenBudget,
				authoredContextTokenCap: runtime.authoredContextTokenCap,
				contextWindowInfo: runtime.contextWindowInfo,
				prompt,
				provider,
				modelId,
				requestedModelId,
				fallbackActive: modelId !== requestedModelId || Boolean(fallbackReason),
				fallbackReason,
				agentHarnessId: runtime.agentHarness.id,
				expectedRuntimeArtifact: expectedHarnessArtifact?.artifact,
				runtimePlan,
				model: effectiveModel,
				resolvedApiKey: resolvedAttemptApiKey,
				authProfileId: runtime.lastProfileId,
				authProfileIdSource: runtime.lastProfileId && runtime.lastProfileId === lockedProfileId ? "user" : "auto",
				initialReplayState: input.replayState,
				authStorage,
				authProfileStore: resolveRunAttemptAuthProfileStore(),
				toolAuthProfileStore: agentHarnessBuildsOpenClawTools(runtime.agentHarness.id) ? attemptAuthProfileStore : void 0,
				modelRegistry,
				agentId: workspaceResolution.agentId,
				thinkLevel: runtime.thinkLevel,
				fastMode: attemptFastMode,
				fastModeStartedAtMs,
				fastModeAutoOnSeconds,
				fastModeAutoProgressState,
				toolResultFormat: resolvedToolResultFormat,
				skipPreparedUserTurnMessage: sessionPromptState.activePrompt.internal,
				apiKeyInfo: runtime.apiKeyInfo,
				runtimeAuthActive: runtime.runtimeAuthState !== null,
				captureRuntimeArtifact: Boolean(params.onSuccessfulAuthBinding || expectedHarnessArtifact)
			},
			control: {
				lifecycleGeneration,
				pluginHarnessOwnsTransport: runtime.pluginHarnessOwnsTransport,
				createAttemptControls,
				onToolOutcome: input.observeToolOutcome,
				isTurnTainted: input.isTurnTainted,
				allocateToolOutcomeOrdinal: input.allocateToolOutcomeOrdinal,
				onToolStreamBoundary: maybeAnnounceFastModeAutoOff,
				onRunProgress: notifyRunProgress,
				onToolResult: notifyToolResult,
				onAgentEvent: notifyAgentEvent,
				onUserMessagePersisted: sessionPromptState.onUserMessagePersisted,
				onUserMessagePersistenceInvalidated: () => {
					sessionPromptState.activePrompt.persisted = false;
				},
				getPostCompactionAbortError: input.getPostCompactionAbortError,
				setPostCompactionAbortController: input.setPostCompactionAbortController,
				clearPostCompactionAbortController: input.clearPostCompactionAbortController
			},
			bootstrapPromptWarningSignaturesSeen: input.bootstrapPromptWarningSignaturesSeen,
			suppressNextUserMessagePersistence: sessionPromptState.suppressNextUserMessagePersistence,
			beforeAgentFinalizeRevisionAttempts: terminalRetryState.beforeFinalizeRevisionAttempts,
			maxBeforeAgentFinalizeRevisions: 3
		}),
		runtimePlan,
		startupStagesEmitted
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-session-identity.ts
function applyEmbeddedAttemptSessionIdentity(params) {
	const { sessionPromptState, sessionFileUsed, sessionIdUsed } = params;
	const previousSessionId = sessionPromptState.sessionId;
	let adoptedSessionId = sessionIdUsed;
	const sessionFileChanged = Boolean(sessionFileUsed && sessionFileUsed !== sessionPromptState.sessionFile);
	let nextSessionTarget = sessionPromptState.sessionTarget;
	if (sessionFileUsed && sessionFileChanged) {
		const marker = parseSqliteSessionFileMarker(sessionFileUsed);
		if (marker) {
			const retainedSessionKey = sessionPromptState.sessionTarget?.sessionKey;
			const retainedEntry = retainedSessionKey ? loadSessionEntryReadOnly({
				agentId: marker.agentId,
				sessionKey: retainedSessionKey,
				storePath: marker.storePath
			}) : void 0;
			const markerMatches = listSessionEntriesReadOnly({
				agentId: marker.agentId,
				storePath: marker.storePath
			}).filter(({ entry }) => entry.sessionId === marker.sessionId);
			const preferredMarkerSessionKey = resolvePreferredSessionKeyForSessionIdMatches(markerMatches.map(({ sessionKey, entry }) => [sessionKey, entry]), marker.sessionId);
			const markerMappedToRetainedKey = markerMatches.some(({ sessionKey }) => sessionKey === retainedSessionKey);
			const successorSessionKey = retainedEntry?.sessionId === marker.sessionId || retainedEntry?.sessionId === previousSessionId && (markerMatches.length === 0 || markerMappedToRetainedKey) ? retainedSessionKey : preferredMarkerSessionKey ?? (markerMatches.length === 0 && !retainedEntry ? retainedSessionKey : void 0);
			if (marker.sessionId !== sessionIdUsed && sessionIdUsed !== previousSessionId || !successorSessionKey || marker.agentId !== sessionPromptState.sessionTarget?.agentId) throw new Error("Legacy context-engine successor identity is inconsistent");
			adoptedSessionId = marker.sessionId;
			nextSessionTarget = {
				...marker,
				sessionKey: successorSessionKey
			};
		} else if (sessionFileUsed.startsWith("agent:") && sessionPromptState.sessionTarget && resolveAgentIdFromSessionKey(sessionFileUsed) === sessionPromptState.sessionTarget.agentId) {
			const keyedEntry = loadSessionEntryReadOnly({
				agentId: sessionPromptState.sessionTarget.agentId,
				sessionKey: sessionFileUsed,
				storePath: sessionPromptState.sessionTarget.storePath
			});
			if (!keyedEntry?.sessionId || keyedEntry.sessionId !== sessionIdUsed) throw new Error("Legacy context-engine successor identity is inconsistent");
			nextSessionTarget = {
				...sessionPromptState.sessionTarget,
				sessionId: sessionIdUsed,
				sessionKey: sessionFileUsed
			};
		} else throw new Error("Legacy context-engine successor files are unsupported; return a structured sessionTarget");
	} else if (sessionIdUsed && sessionIdUsed !== previousSessionId) nextSessionTarget = sessionPromptState.sessionTarget ? {
		...sessionPromptState.sessionTarget,
		sessionId: sessionIdUsed
	} : void 0;
	if (sessionFileChanged && nextSessionTarget && sessionPromptState.sessionTarget && (!nextSessionTarget.agentId || !nextSessionTarget.sessionKey || !nextSessionTarget.storePath || !sessionPromptState.sessionTarget.agentId || !sessionPromptState.sessionTarget.sessionKey || !sessionPromptState.sessionTarget.storePath || nextSessionTarget.agentId !== sessionPromptState.sessionTarget.agentId || nextSessionTarget.sessionKey !== sessionPromptState.sessionTarget.sessionKey || path.resolve(nextSessionTarget.storePath) !== path.resolve(sessionPromptState.sessionTarget.storePath))) throw new Error("Legacy context-engine successor target changed the active session binding");
	sessionPromptState.adoptSessionId(adoptedSessionId);
	if (sessionFileUsed && sessionFileChanged) sessionPromptState.sessionFile = sessionFileUsed;
	else if (adoptedSessionId !== previousSessionId && nextSessionTarget) {
		const marker = parseSqliteSessionFileMarker(sessionPromptState.sessionFile);
		if (marker) sessionPromptState.sessionFile = formatSqliteSessionFileMarker({
			agentId: nextSessionTarget.agentId ?? marker.agentId,
			sessionId: nextSessionTarget.sessionId ?? marker.sessionId,
			storePath: nextSessionTarget.storePath ?? marker.storePath
		});
	}
	sessionPromptState.sessionTarget = nextSessionTarget;
}
/** Creates a fresh breaker counter for one embedded run loop. */
function createIdleTimeoutBreakerState() {
	return { consecutiveIdleTimeoutsBeforeOutput: 0 };
}
/**
* Update the breaker counter from the latest attempt's outcome and report
* whether the cap is now tripped. Designed to be called from the outer run
* loop right after an embedded attempt completes.
*
* Pure function modulo the mutable `state.consecutiveIdleTimeoutsBeforeOutput`
* field, so the caller decides where the state lives (typically a `let` in
* the outer loop).
*
* Decision table:
*   idleTimedOut  completedModelProgress   action
*   ------------  ----------------------   ------
*   true          false                    count += 1   (wedged provider candidate)
*   true          true                     count = 0    (model is alive but slow tail)
*   false         true                     count = 0    (clean progress, all good)
*   false         false                    count unchanged (e.g. non-timeout error;
*                                                          don't poison or reset)
*
* The "false / false" branch matters: a non-timeout error attempt with no
* completed progress should not reset the breaker (it isn't a sign the
* provider is healthy), but it also shouldn't increment it (the issue at hand
* is idle timeouts, not arbitrary errors).
*
* `outputTokens` is intentionally not part of the reset condition. Some
* transports can accumulate billed output tokens from partial tool-call
* argument deltas before the model stalls; those tokens are cost, not completed
* progress, so they must not keep the breaker disarmed.
*/
function stepIdleTimeoutBreaker(state, input, options) {
	const cap = options?.cap ?? 5;
	if (input.idleTimedOut && !input.completedModelProgress) state.consecutiveIdleTimeoutsBeforeOutput += 1;
	else if (input.completedModelProgress) state.consecutiveIdleTimeoutsBeforeOutput = 0;
	return {
		consecutive: state.consecutiveIdleTimeoutsBeforeOutput,
		tripped: cap > 0 && state.consecutiveIdleTimeoutsBeforeOutput >= cap
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/retry-budget.ts
function createRunRetryBudget(maxAttempts) {
	return {
		attemptsDispatched: 0,
		attemptsCounted: 0,
		maxAttempts
	};
}
function isRunRetryBudgetExhausted(budget) {
	return budget.attemptsCounted >= budget.maxAttempts;
}
function beginRunAttempt(budget) {
	budget.attemptsDispatched += 1;
	budget.attemptsCounted += 1;
}
function resolveRunRetryKind(params) {
	return params.retryingFromTranscript && params.preflightRecovery.route === "truncate_tool_results_only" && params.preflightRecovery.truncatedCount === 0 && params.toolMetas.some((tool) => tool.isError !== true) ? "progress_continuation" : "recovery";
}
function recordRunRetry(budget, kind) {
	if (kind === "progress_continuation") budget.attemptsCounted = Math.max(0, budget.attemptsCounted - 1);
}
//#endregion
//#region src/agents/embedded-agent-runner/run/retry-limit.ts
/**
* Converts retry-limit exhaustion into failover errors or terminal replies.
*/
/**
* Converts retry-limit exhaustion into either a failover escalation or a local
* user-visible error payload. Replay-safe provider failures throw FailoverError
* so the outer run loop can switch models; non-escalating reasons preserve
* retry metadata on the returned run result.
*/
function handleRetryLimitExhaustion(params) {
	if (params.decision.action === "fallback_model") throw new FailoverError(params.message, {
		reason: params.decision.reason,
		provider: params.provider,
		model: params.model,
		profileId: params.profileId,
		status: resolveFailoverStatus(params.decision.reason)
	});
	return {
		payloads: [{
			text: "Request failed after repeated internal retries. Please try again, or use /new to start a fresh session.",
			isError: true
		}],
		meta: {
			durationMs: params.durationMs,
			agentMeta: params.agentMeta,
			...params.replayInvalid ? { replayInvalid: true } : {},
			...params.livenessState ? { livenessState: params.livenessState } : {},
			error: {
				kind: "retry_limit",
				message: params.message
			}
		}
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/run-attempt-result.ts
function normalizeEmbeddedRunAttemptResult(attempt) {
	const raw = attempt;
	const runtimeContinuationReplayMetadata = raw.runtimeContinuationStarted === true ? {
		hadPotentialSideEffects: true,
		replaySafe: false
	} : void 0;
	return copyCoreTtsAttemptResultProvenance(attempt, {
		...attempt,
		assistantTexts: raw.assistantTexts ?? [],
		toolMetas: raw.toolMetas ?? [],
		acceptedSessionSpawns: raw.acceptedSessionSpawns ?? [],
		messagesSnapshot: raw.messagesSnapshot ?? [],
		messagingToolSentTexts: raw.messagingToolSentTexts ?? [],
		messagingToolSentMediaUrls: raw.messagingToolSentMediaUrls ?? [],
		messagingToolSentTargets: raw.messagingToolSentTargets ?? [],
		messagingToolSourceReplyPayloads: raw.messagingToolSourceReplyPayloads ?? [],
		didDeliverSourceReplyViaMessageTool: raw.didDeliverSourceReplyViaMessageTool === true,
		itemLifecycle: raw.itemLifecycle ?? {
			startedCount: 0,
			completedCount: 0,
			activeCount: 0
		},
		replayMetadata: runtimeContinuationReplayMetadata ?? raw.replayMetadata ?? {
			hadPotentialSideEffects: true,
			replaySafe: false
		},
		currentAttemptReplayMetadata: runtimeContinuationReplayMetadata ?? raw.currentAttemptReplayMetadata ?? void 0
	});
}
function hasCompletedModelProgressForIdleBreaker(attempt) {
	return attempt.assistantTexts.some((text) => text.trim().length > 0) || attempt.toolMetas.length > 0 || (attempt.clientToolCalls?.length ?? 0) > 0 || hasOutboundDeliveryEvidence(attempt) || attempt.itemLifecycle.completedCount > 0;
}
function buildTraceToolSummary(params) {
	if (!params.toolMetas?.length) return;
	const tools = [];
	const seen = /* @__PURE__ */ new Set();
	for (const entry of params.toolMetas) {
		const toolName = normalizeOptionalString(entry.toolName);
		if (!toolName || seen.has(toolName)) continue;
		seen.add(toolName);
		tools.push(toolName);
	}
	const failedToolCalls = params.toolMetas.filter((entry) => entry.isError === true).length;
	return {
		calls: params.toolMetas.length,
		tools,
		failures: failedToolCalls || Number(params.fallbackHadFailure)
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-normalization.ts
async function normalizeEmbeddedRunAttempt(input) {
	const { runInput, preparedRuntime, dispatchedAttempt, sessionPromptState, provider, modelId } = input;
	const params = runInput.runParams;
	__vCodexTurnTail().mark(params.runId, "attempt-return"); // V codex-turn-tail-v1
	const runtime = preparedRuntime.snapshot();
	const attempt = normalizeEmbeddedRunAttemptResult(dispatchedAttempt.rawAttempt);
	const attemptCompactionCount = Math.max(0, attempt.compactionCount ?? 0);
	const recordedCompactionCount = input.recordedCompactionCount ?? 0;
	input.contextRecoveryState.autoCompactionCount += Math.max(0, attemptCompactionCount - recordedCompactionCount);
	if (attemptCompactionCount > recordedCompactionCount) input.contextRecoveryState.currentContextSnapshot = { tokens: void 0 };
	if ((recordedCompactionCount === 0 || attemptCompactionCount > recordedCompactionCount) && typeof attempt.compactionTokensAfter === "number" && Number.isFinite(attempt.compactionTokensAfter) && attempt.compactionTokensAfter >= 0) input.contextRecoveryState.lastCompactionTokensAfter = Math.floor(attempt.compactionTokensAfter);
	await sessionPromptState.waitForCurrentUserMessagePersistence();
	sessionPromptState.suppressNextUserMessagePersistence = sessionPromptState.activePrompt.persisted;
	__vCodexTurnTail().mark(params.runId, "user-message-persistence"); // V codex-turn-tail-v1
	runInput.laneController.throwIfAborted();
	const { terminal, preflightRecovery, sessionIdUsed, sessionFileUsed, lastAssistant: sessionLastAssistant, currentAttemptAssistant, currentAttemptCompletedAssistant } = attempt;
	const { idleTimedOut } = projectAgentRunAttemptTerminal(terminal);
	const attemptAssistant = resolveCurrentAttemptAssistant(attempt);
	const terminalState = resolveEmbeddedRunAttemptTerminalState({
		attempt,
		assistant: attemptAssistant,
		abortSignal: params.abortSignal
	});
	const { outcome: terminalOutcome, signalOwnedInterruption } = terminalState;
	const terminalAborted = isEmbeddedRunTerminalAbort(terminalOutcome);
	const terminalTimedOut = isEmbeddedRunTerminalTimeout(terminalOutcome);
	const terminalInterrupted = isEmbeddedRunTerminalInterrupted(terminalOutcome);
	const setTerminalLifecycleMeta = (meta) => {
		const { stopReason, ...remainingMeta } = meta;
		const terminalStopReason = terminalInterrupted ? terminalOutcome.stopReason : stopReason;
		attempt.setTerminalLifecycleMeta?.({
			...remainingMeta,
			...terminalStopReason ? { stopReason: terminalStopReason } : {},
			aborted: terminalAborted
		});
	};
	applyEmbeddedAttemptSessionIdentity({
		sessionPromptState,
		sessionFileUsed,
		sessionIdUsed
	});
	const bootstrapPromptWarningSignaturesSeen = attempt.bootstrapPromptWarningSignaturesSeen ?? (attempt.bootstrapPromptWarningSignature ? Array.from(/* @__PURE__ */ new Set([...input.bootstrapPromptWarningSignaturesSeen, attempt.bootstrapPromptWarningSignature])) : input.bootstrapPromptWarningSignaturesSeen);
	const lastAssistantUsage = normalizeAssistantUsageForContext(sessionLastAssistant);
	const currentAttemptAssistantUsage = normalizeAssistantUsageForContext(currentAttemptAssistant);
	const promptCacheLastCallUsage = normalizeUsage(attempt.promptCache?.lastCallUsage);
	const callUsage = resolveLatestCallUsage({
		currentAttemptCandidates: [
			attempt.attemptUsage?.contextUsage ? attempt.attemptUsage : void 0,
			currentAttemptAssistantUsage,
			promptCacheLastCallUsage
		],
		carriedUsage: input.lastRunPromptUsage,
		transcriptFallback: lastAssistantUsage
	});
	const attemptUsage = attempt.attemptUsage ?? callUsage.currentAttempt;
	mergeUsageIntoAccumulator(input.usageAccumulator, attemptUsage);
	mergeAttemptRunStatsIntoAccumulator(input.usageAccumulator, attempt);
	const lastRunPromptUsage = callUsage.latest;
	const breakerStep = stepIdleTimeoutBreaker(input.idleTimeoutBreakerState, {
		idleTimedOut: terminalTimedOut && idleTimedOut,
		completedModelProgress: hasCompletedModelProgressForIdleBreaker(attempt),
		outputTokens: attemptUsage?.output
	});
	if (breakerStep.tripped) {
		const message = `Idle-timeout cost-runaway breaker tripped: ${breakerStep.consecutive} consecutive idle timeouts without completed model progress (cap=5). Halting further attempts to bound paid model calls. See issue #76293.`;
		log$3.error(`[idle-timeout-circuit-breaker-tripped] sessionKey=${params.sessionKey ?? params.sessionId} provider=${provider}/${modelId} consecutive=${breakerStep.consecutive} cap=5`);
		return {
			action: "complete",
			result: handleRetryLimitExhaustion({
				message,
				decision: resolveRunFailoverDecision({
					stage: "retry_limit",
					fallbackConfigured: runInput.fallbackConfigured,
					failoverReason: input.lastRetryFailoverReason
				}),
				provider,
				model: modelId,
				profileId: runtime.lastProfileId,
				durationMs: Date.now() - runInput.startedAtMs,
				agentMeta: buildErrorAgentMeta({
					sessionId: sessionPromptState.sessionId,
					sessionFile: sessionPromptState.sessionFile,
					provider,
					model: preparedRuntime.model.id,
					credentialSource: attempt.modelAttempt?.credentialSource,
					...runtime.outerContextTokenMeta,
					usageAccumulator: input.usageAccumulator,
					lastRunPromptUsage
				}),
				replayInvalid: input.replayState.replayInvalid ? true : void 0,
				livenessState: "blocked"
			})
		};
	}
	if (attempt.contextBudgetStatus) input.contextRecoveryState.lastContextBudgetStatus = attempt.contextBudgetStatus;
	const activeErrorContext = resolveActiveErrorContext({
		provider,
		model: modelId,
		assistant: attemptAssistant
	});
	let replayState = input.replayState;
	const resolveReplayInvalidForAttempt = (incompleteTurnText) => replayState.replayInvalid || resolveReplayInvalidFlag({
		attempt,
		incompleteTurnText
	});
	if (resolveReplayInvalidForAttempt(null)) replayState.replayInvalid = true;
	replayState = observeReplayMetadata(replayState, attempt.replayMetadata);
	const formattedAssistantErrorText = attemptAssistant ? formatAssistantErrorText(attemptAssistant, {
		cfg: params.config,
		sessionKey: runInput.resolvedSessionKey ?? params.sessionId,
		agentId: params.agentId,
		provider: activeErrorContext.provider,
		providerOwner: runtime.providerRuntimeHandle?.plugin,
		model: activeErrorContext.model,
		authMode: runtime.lastProfileId ? preparedRuntime.attemptAuthProfileStore.profiles?.[runtime.lastProfileId]?.type : void 0
	}) : void 0;
	const assistantErrorText = attemptAssistant?.stopReason === "error" ? attemptAssistant.errorMessage?.trim() || formattedAssistantErrorText : void 0;
	if (!signalOwnedInterruption && !preparedRuntime.nativeModelOwned && preflightRecovery?.handled) {
		const retryingFromTranscript = preflightRecovery.source === "mid-turn";
		log$3.info(`[context-overflow-precheck] early recovery route=${preflightRecovery.route} completed for ${provider}/${modelId}; ` + (retryingFromTranscript ? "retrying from current transcript" : "retrying prompt"));
		if (retryingFromTranscript) {
			if ((preflightRecovery.truncatedCount ?? 0) > 0) sessionPromptState.markOwnedTranscriptRetry();
			sessionPromptState.continueFromCurrentTranscript();
		}
		return {
			action: "retry",
			retryKind: resolveRunRetryKind({
				preflightRecovery,
				retryingFromTranscript,
				toolMetas: attempt.toolMetas
			}),
			bootstrapPromptWarningSignaturesSeen,
			lastRunPromptUsage,
			replayState
		};
	}
	return {
		action: "proceed",
		bootstrapPromptWarningSignaturesSeen,
		lastRunPromptUsage,
		replayState,
		attempt,
		sessionIdUsed,
		sessionFileUsed,
		currentAttemptAssistant,
		currentAttemptCompletedAssistant,
		attemptAssistant,
		terminalState,
		setTerminalLifecycleMeta,
		attemptCompactionCount,
		activeErrorContext,
		resolveReplayInvalidForAttempt,
		assistantErrorText,
		canRestartForLiveSwitch: !hasOutboundDeliveryEvidence(attempt) && !attempt.didSendDeterministicApprovalPrompt && !attempt.lastToolError && (attempt.toolMetas?.length ?? 0) === 0 && (attempt.assistantTexts?.length ?? 0) === 0
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/blocked-run-result.ts
function buildEmbeddedRunBlockedResult(input) {
	return {
		payloads: [{
			text: input.text,
			isError: true
		}],
		meta: {
			durationMs: input.durationMs,
			agentMeta: input.agentMeta,
			systemPromptReport: input.attempt.systemPromptReport,
			finalAssistantVisibleText: input.text,
			finalAssistantRawText: input.text,
			finalPromptText: input.finalPromptText,
			replayInvalid: input.replayInvalid,
			livenessState: "blocked",
			error: {
				kind: input.errorKind,
				message: input.errorMessage
			}
		}
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/codex-app-server-recovery.ts
function hasCodexAppServerRecoveryRetryBudget(params) {
	return !params.alreadyRetried && params.runLoopIterations < params.maxRunLoopIterations;
}
/**
* Decides whether a Codex app-server failure can be retried by replaying the
* same turn. The retry is intentionally narrow: stdio-only, replay-safe, once
* per run, and only before any assistant/tool/item side effects escape.
*/
function resolveCodexAppServerRecoveryRetry(params) {
	const failure = params.attempt.codexAppServerFailure;
	if (!failure) return {
		retry: false,
		reason: "not_codex_app_server_failure"
	};
	if (failure.kind !== "client_closed_before_turn_completed" && failure.kind !== "turn_completion_idle_timeout") return {
		retry: false,
		reason: failure.kind
	};
	if (failure.kind === "turn_completion_idle_timeout" && failure.turnWatchTimeoutKind !== "completion") return {
		retry: false,
		reason: failure.turnWatchTimeoutKind ?? "unknown_turn_watch_timeout"
	};
	if (failure.transport !== "stdio") return {
		retry: false,
		reason: "non_stdio_transport"
	};
	if (!params.retryAvailable) return {
		retry: false,
		reason: "retry_exhausted"
	};
	if (!failure.replaySafe || !params.attempt.replayMetadata.replaySafe) return {
		retry: false,
		reason: failure.replayBlockedReason ?? "replay_unsafe"
	};
	if (params.attempt.assistantTexts.some((text) => text.trim().length > 0)) return {
		retry: false,
		reason: "assistant_output"
	};
	if (params.attempt.toolMetas.length > 0 || params.attempt.clientToolCalls || params.attempt.lastToolError || params.attempt.didSendDeterministicApprovalPrompt) return {
		retry: false,
		reason: "tool_activity"
	};
	if (params.attempt.itemLifecycle.startedCount > 0 || params.attempt.itemLifecycle.activeCount > 0) return {
		retry: false,
		reason: "active_item"
	};
	return { retry: true };
}
//#endregion
//#region src/agents/embedded-agent-runner/run/compaction-live-model-selection.ts
function resolveCompactionLiveModelSelection(params) {
	const { current, requested } = params;
	if (!requested) return current;
	if (requested.authProfileId) return {
		provider: requested.provider,
		model: requested.model,
		authProfileId: requested.authProfileId,
		authProfileIdSource: requested.authProfileIdSource ?? "auto"
	};
	if (normalizeProviderId(requested.provider) === normalizeProviderId(current.provider)) return {
		...current,
		provider: requested.provider,
		model: requested.model
	};
	return {
		provider: requested.provider,
		model: requested.model,
		authProfileIdSource: "auto"
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/session-bootstrap.ts
const NO_REAL_CONVERSATION_MESSAGES_REASON = "no real conversation messages";
function buildContextEngineCompactionSessionTarget(params) {
	const targetAgentId = normalizeOptionalString(params.sessionTarget?.agentId);
	const targetSessionId = normalizeOptionalString(params.sessionTarget?.sessionId);
	const targetSessionKey = normalizeOptionalString(params.sessionTarget?.sessionKey);
	const targetStorePath = normalizeOptionalString(params.sessionTarget?.storePath);
	const completeTarget = Boolean(targetAgentId && targetSessionId && targetSessionKey && targetStorePath);
	const marker = completeTarget ? void 0 : parseSqliteSessionFileMarker(params.sessionFile);
	const suppliedSessionKey = normalizeOptionalString(params.sessionKey);
	const candidateSessionKey = targetSessionKey ?? suppliedSessionKey;
	const candidateKeyAgentId = parseAgentSessionKey(candidateSessionKey)?.agentId;
	const suppliedEntry = marker && candidateSessionKey ? loadSessionEntryReadOnly({
		agentId: marker.agentId,
		sessionKey: candidateSessionKey,
		storePath: marker.storePath
	}) : void 0;
	const markerMatches = marker ? listSessionEntriesReadOnly({
		agentId: marker.agentId,
		storePath: marker.storePath
	}).filter(({ entry }) => entry.sessionId === marker.sessionId) : [];
	const preferredMarkerSessionKey = marker ? resolvePreferredSessionKeyForSessionIdMatches(markerMatches.map(({ sessionKey, entry }) => [sessionKey, entry]), marker.sessionId) : void 0;
	const markerSessionKey = marker ? suppliedEntry?.sessionId === marker.sessionId ? candidateSessionKey : candidateSessionKey && !suppliedEntry ? candidateSessionKey : preferredMarkerSessionKey : void 0;
	if (marker && markerMatches.length > 0 && !markerSessionKey) throw new Error("Legacy compaction transcript identity is ambiguous");
	if (marker && (targetAgentId && targetAgentId !== marker.agentId || targetSessionId && targetSessionId !== marker.sessionId || candidateKeyAgentId && candidateKeyAgentId !== marker.agentId || targetStorePath && path.resolve(targetStorePath) !== path.resolve(marker.storePath) || candidateSessionKey && suppliedEntry && suppliedEntry.sessionId !== marker.sessionId)) throw new Error("Legacy compaction transcript identity is inconsistent");
	const sessionKey = completeTarget ? targetSessionKey : marker ? markerSessionKey : targetSessionKey ?? suppliedSessionKey;
	const targetStoreOwner = resolvePersistedSessionStoreOwnerForTarget({
		config: params.config ?? {},
		sessionKey,
		storePath: targetStorePath
	});
	const agentId = (Boolean(targetAgentId && targetStorePath && !parseAgentSessionKey(sessionKey)?.agentId && targetStoreOwner.kind === "none") ? targetAgentId : void 0) ?? marker?.agentId ?? resolveSessionAgentId({
		agentId: targetAgentId ?? params.agentId,
		config: params.config,
		sessionKey
	});
	const storePath = targetStorePath ?? marker?.storePath ?? resolveSessionStorePathCore(params.config?.session?.store, { agentId });
	return {
		agentId,
		sessionId: targetSessionId ?? marker?.sessionId ?? params.sessionId,
		...sessionKey ? { sessionKey } : {},
		...storePath ? { storePath } : {},
		...params.sessionTarget?.threadId !== void 0 ? { threadId: params.sessionTarget.threadId } : {}
	};
}
function isNoRealConversationCompactionNoop(params) {
	return params.ok === true && params.compacted === false && params.reason === NO_REAL_CONVERSATION_MESSAGES_REASON;
}
async function resetNoRealConversationTokenSnapshot(params) {
	if (!params.sessionTarget || params.sessionPersistence === "detached") return;
	params.assertActive();
	try {
		await patchSessionEntryCore(params.sessionTarget, () => ({
			totalTokens: 0,
			totalTokensFresh: true,
			totalTokensVersion: 1,
			inputTokens: void 0,
			outputTokens: void 0,
			cacheRead: void 0,
			cacheWrite: void 0,
			contextBudgetStatus: void 0,
			updatedAt: Date.now()
		}), {
			skipMaintenance: true,
			takeCacheOwnership: true,
			assertCommitAllowed: params.assertActive
		});
		params.assertActive();
	} catch (err) {
		params.assertActive();
		log$3.warn(`[context-overflow-precheck] failed to reset stale context snapshot for ${params.sessionTarget.sessionKey}: ${String(err)}`);
	}
}
/** Best-effort read-only session-key lookup for callers that only provide sessionId. */
function backfillSessionKey(params) {
	const trimmed = normalizeOptionalString(params.sessionKey);
	if (trimmed) return trimmed;
	if (!params.config || !params.sessionId) return;
	try {
		const resolved = normalizeOptionalString(params.agentId) ? resolveStoredSessionKeyForSessionId({
			cfg: params.config,
			sessionId: params.sessionId,
			agentId: params.agentId
		}) : resolveSessionKeyForRequestCore({
			cfg: params.config,
			sessionId: params.sessionId
		});
		return normalizeOptionalString(resolved.sessionKey);
	} catch (err) {
		log$3.warn(`[backfillSessionKey] Failed to resolve sessionKey for sessionId=${redactRunIdentifier(sanitizeForLog(params.sessionId))}: ${formatErrorMessage(err)}`);
		return;
	}
}
/** Reserves only a missing row's first writer; no row or claim exists until lazy persistence. */
function prepareInitialSessionWriter(params) {
	const { runParams, target } = params;
	if (runParams.sessionPersistence === "detached" || runParams.sessionManager && !runParams.sessionManager.getSessionTarget() || runParams.sessionTarget?.expectedWriterRunId || !target?.agentId || !target.sessionId || !target.sessionKey || !target.storePath) return;
	const signal = runParams.abortSignal;
	const assertion = runParams.admittedRunContext && resolveAdmittedRunActiveAssertion(runParams.admittedRunContext, signal);
	if (!assertion) return;
	if (loadSessionEntryReadOnly({
		agentId: target.agentId,
		sessionKey: target.sessionKey,
		storePath: target.storePath
	})) throw new SessionTranscriptWriterClaimReboundError();
	const writerRunId = runParams.runId;
	let committedFence;
	return Object.freeze({
		writerRunId,
		get committedFence() {
			return committedFence;
		},
		assertActive: () => {
			signal?.throwIfAborted();
			assertion();
		},
		recordCommitted: (fence) => {
			committedFence = Object.freeze({ ...fence });
		}
	});
}
function assertAgentHarnessRunAdmission(params) {
	if (params.sessionPersistence === "detached") return;
	const sessionKey = normalizeOptionalString(params.sessionKey);
	if (!sessionKey) return;
	const targetAgentId = normalizeOptionalString(params.sessionTarget?.agentId);
	const targetStorePath = normalizeOptionalString(params.sessionTarget?.storePath);
	const targetStoreOwner = resolvePersistedSessionStoreOwnerForTarget({
		config: params.config ?? {},
		sessionKey,
		storePath: targetStorePath
	});
	const admissionAgentId = Boolean(targetAgentId && targetStorePath && !parseAgentSessionKey(sessionKey)?.agentId && targetStoreOwner.kind === "none") ? targetAgentId : resolveSessionAgentId({
		agentId: targetAgentId ?? params.agentId,
		config: params.config,
		sessionKey
	});
	const storePath = targetStorePath ?? resolveSessionStorePathCore(params.config?.session?.store, { agentId: admissionAgentId });
	const durableEntry = loadSessionEntry({
		...admissionAgentId ? { agentId: admissionAgentId } : {},
		readConsistency: "latest",
		sessionKey,
		storePath
	});
	const admissionError = resolveAgentHarnessRunAdmissionError({
		agentHarnessId: params.agentHarnessId,
		entry: durableEntry,
		modelSelectionLocked: params.modelSelectionLocked,
		sessionId: params.sessionId,
		sessionKey
	});
	if (admissionError) throw new Error(admissionError);
	return durableEntry ? {
		...admissionAgentId ? { agentId: admissionAgentId } : {},
		entry: durableEntry,
		sessionKey,
		storePath
	} : void 0;
}
async function claimAgentSessionWriter(params) {
	const snapshot = assertAgentHarnessRunAdmission(params);
	if (!snapshot) return;
	const expectedSessionId = params.sessionId;
	const expectedLifecycleRevision = snapshot.entry.lifecycleRevision;
	if (snapshot.entry.sessionId !== expectedSessionId) throw new Error(`Session changed before writer admission: ${snapshot.sessionKey}`);
	const previousWriterRunId = normalizeOptionalString(snapshot.entry.activeWriterRunId);
	const claimed = await updateSessionEntry({
		...snapshot.agentId ? { agentId: snapshot.agentId } : {},
		sessionKey: snapshot.sessionKey,
		storePath: snapshot.storePath
	}, (entry) => {
		if (entry.sessionId !== expectedSessionId || entry.lifecycleRevision !== expectedLifecycleRevision) throw new Error(`Session changed before writer claim commit: ${snapshot.sessionKey}`);
		return Object.assign({}, entry, { activeWriterRunId: params.runId });
	}, { skipMaintenance: true });
	if (!claimed || claimed.activeWriterRunId !== params.runId) throw new Error(`Session writer claim was not persisted: ${snapshot.sessionKey}`);
	if (previousWriterRunId && previousWriterRunId !== params.runId) {
		if (supersedeEmbeddedAgentRunByRunId(previousWriterRunId, () => {
			const previousLifecycleGeneration = getAgentRunContext(previousWriterRunId)?.lifecycleGeneration;
			if (!emitAgentEventIfCurrent({
				runId: previousWriterRunId,
				...previousLifecycleGeneration ? { lifecycleGeneration: previousLifecycleGeneration } : {},
				stream: "lifecycle",
				sessionKey: snapshot.sessionKey,
				sessionId: expectedSessionId,
				...snapshot.agentId ? { agentId: snapshot.agentId } : {},
				data: {
					phase: "end",
					aborted: true,
					status: "superseded",
					stopReason: "superseded",
					error: "agent run superseded by a newer session writer",
					endedAt: Date.now()
				}
			})) throw new Error(`Could not record superseded writer outcome: ${previousWriterRunId}`);
		})) log$3.warn(`[session-writer] replacing claim session=${sanitizeForLog(snapshot.sessionKey)} previousRunId=${redactRunIdentifier(sanitizeForLog(previousWriterRunId))} nextRunId=${redactRunIdentifier(sanitizeForLog(params.runId))} live=true`);
	}
	return {
		expectedLifecycleRevision,
		expectedWriterRunId: params.runId
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/compaction-runtime.ts
/** Preserve one prepared owner snapshot for both timeout and overflow recovery. */
async function compactEmbeddedRunForRecovery(input, recovery) {
	const { runParams } = input;
	const owner = input.prepareRecoveryOwner();
	const activeSession = owner.session;
	const reason = recovery.trigger === "overflow" ? "overflow recovery" : "timeout recovery";
	await input.runOwnsCompactionBeforeHook(reason);
	owner.assertActive();
	const runtimeContext = {
		...buildEmbeddedCompactionRuntimeContext({
			sessionKey: runParams.sessionKey,
			sandboxSessionKey: runParams.sandboxSessionKey,
			sandboxAgentId: runParams.sandboxAgentId,
			messageChannel: runParams.messageChannel,
			messageProvider: runParams.messageProvider,
			clientCaps: runParams.clientCaps,
			chatType: runParams.chatType,
			agentAccountId: runParams.agentAccountId,
			conversationRoutePeerId: runParams.conversationRoutePeerId,
			currentChannelId: runParams.currentChannelId,
			currentThreadTs: runParams.currentThreadTs,
			currentMessageId: runParams.currentMessageId,
			authProfileId: input.authProfileId,
			authProfileIdSource: input.authProfileIdSource,
			runtimeAuthPlan: input.runtimeAuthPlan,
			workspaceDir: input.workspaceDir,
			bootstrapWorkspaceDir: runParams.bootstrapWorkspaceDir,
			permissionMode: runParams.permissionMode,
			sessionRoot: runParams.sessionRoot,
			agentDir: input.agentDir,
			config: runParams.config,
			toolOverrides: runParams.toolOverrides,
			toolsAllow: runParams.toolsAllow,
			skillsSnapshot: runParams.skillsSnapshot,
			senderId: runParams.senderId,
			provider: input.provider,
			modelId: input.modelId,
			harnessRuntime: input.harnessRuntime,
			modelSelectionLocked: runParams.modelSelectionLocked,
			modelFallbacksOverride: runParams.modelFallbacksOverride,
			thinkLevel: input.thinkLevel,
			reasoningLevel: runParams.reasoningLevel,
			execOverrides: runParams.execOverrides,
			bashElevated: runParams.bashElevated,
			extraSystemPrompt: runParams.extraSystemPrompt,
			sourceReplyDeliveryMode: runParams.sourceReplyDeliveryMode,
			ownerNumbers: runParams.ownerNumbers,
			activeProcessSessions: listActiveProcessSessionReferences({ scopeKey: resolveProcessToolScopeKey({
				sessionKey: runParams.sandboxSessionKey?.trim() || runParams.sessionKey,
				sessionId: activeSession.id,
				agentId: input.sessionAgentId
			}) })
		}),
		...resolveContextEngineCapabilities({
			config: runParams.config,
			sessionKey: runParams.sessionKey,
			explicitAgentId: input.contextEngineAgentId,
			contextEnginePluginId: input.resolveContextEnginePluginId(),
			purpose: recovery.trigger === "overflow" ? "context-engine.overflow-compaction" : "context-engine.timeout-compaction"
		}),
		onCompactionHookMessages: input.onCompactionHookMessages,
		...input.attempt.promptCache ? { promptCache: input.attempt.promptCache } : {},
		runId: runParams.runId,
		trigger: recovery.trigger,
		...recovery.currentTokenCount !== void 0 ? { currentTokenCount: recovery.currentTokenCount } : {},
		diagId: recovery.diagId,
		attempt: recovery.attempt,
		maxAttempts: recovery.maxAttempts
	};
	let observedCompactions = 0;
	const runtimeSettings = input.buildRuntimeSettings({
		tokenBudget: recovery.tokenBudget,
		...recovery.trigger === "overflow" ? { degradedReason: "context_overflow" } : {}
	});
	const compactParams = {
		sessionId: activeSession.id,
		sessionKey: input.resolvedSessionKey,
		agentId: input.sessionAgentId,
		sessionTarget: buildContextEngineCompactionSessionTarget({
			agentId: input.sessionAgentId,
			config: runParams.config,
			sessionFile: activeSession.file,
			sessionId: activeSession.id,
			sessionKey: input.resolvedSessionKey,
			sessionTarget: activeSession.target
		}),
		tokenBudget: recovery.tokenBudget,
		...recovery.currentTokenCount !== void 0 ? { currentTokenCount: recovery.currentTokenCount } : {},
		force: true,
		compactionTarget: "budget",
		runtimeContext,
		runtimeSettings
	};
	let result;
	try {
		const compact = bindContextEngineCompaction(input.contextEngine);
		result = await compactContextEngineWithSafetyTimeout({
			info: input.contextEngine.info,
			compact: inheritRuntimeCompactionDelegate(compact, (backendParams) => owner.withTranscriptWrites(backendParams.abortSignal, () => {
				if (backendParams.runtimeContext) attachCompactionAccountingRecorder(backendParams.runtimeContext, {
					memoryTranscript: owner.sessionManager ? {
						sessionManager: owner.sessionManager,
						sessionTarget: activeSession.target,
						assertActive: () => {
							backendParams.abortSignal?.throwIfAborted();
							owner.assertActive();
						}
					} : void 0,
					recordUsage: (usage) => mergeUsageIntoAccumulator(input.usageAccumulator, usage),
					recordCompaction: (tokensAfter) => {
						observedCompactions += 1;
						input.state.observeContextAccounting({
							kind: "compaction",
							tokensAfter
						});
					}
				});
				return compact(backendParams);
			}))
		}, compactParams, resolveCompactionTimeoutMs(runParams.config), runParams.abortSignal);
	} catch (error) {
		owner.assertActive();
		log$3.warn(`contextEngine.compact() threw during ${reason} for ${input.provider}/${input.modelId}: ${String(error)}`);
		result = {
			ok: false,
			compacted: false,
			reason: String(error)
		};
	}
	if (observedCompactions > 0 && !result.compacted) result = {
		ok: result.ok,
		compacted: true,
		reason: result.reason
	};
	const successor = resolveCompactionSuccessorTranscript(result);
	const target = result.result?.sessionTarget;
	const sameTarget = (!successor.sessionId || successor.sessionId === activeSession.id) && (!successor.sessionFile || successor.sessionFile === activeSession.file) && (!target?.agentId || target.agentId === activeSession.target?.agentId) && (!target?.sessionKey || target.sessionKey === activeSession.target?.sessionKey) && (!target?.storePath || target.storePath === activeSession.target?.storePath);
	const reportedTokens = result.result?.tokensAfter;
	const tokensAfter = typeof reportedTokens === "number" && Number.isFinite(reportedTokens) && reportedTokens >= 0 ? Math.floor(reportedTokens) : void 0;
	const recordTokensAfter = () => {
		input.state.lastCompactionTokensAfter = tokensAfter;
		input.state.currentContextSnapshot = { tokens: tokensAfter };
	};
	if (result.compacted && observedCompactions === 0) input.state.observeContextAccounting({
		kind: "compaction",
		tokensAfter: sameTarget ? tokensAfter : void 0
	});
	owner.assertActive();
	const retainMemoryTranscript = owner.sessionManager && sameTarget && (target?.threadId === void 0 || target.threadId === activeSession.target.threadId);
	const previousSessionId = result.compacted && !retainMemoryTranscript ? await input.adoptCompactionTranscript(result, sameTarget ? void 0 : recordTokensAfter) : void 0;
	input.assertRecoveryActive();
	return {
		result,
		runtimeContext,
		runtimeSettings,
		previousSessionId
	};
}
function createEmbeddedRunCompactionRuntime(input) {
	const { runParams: params, contextEngine, hookRunner, hookContext, sessionPromptState } = input;
	const abortSignal = params.abortSignal;
	const admittedAssertion = params.admittedRunContext ? resolveAdmittedRunActiveAssertion(params.admittedRunContext) : void 0;
	const runId = params.runId;
	const memoryManager = params.sessionManager && !params.sessionManager.getSessionTarget() ? params.sessionManager : void 0;
	const detached = params.sessionPersistence === "detached";
	const assertAdmittedActive = () => {
		abortSignal?.throwIfAborted();
		if (!admittedAssertion) throw new Error("compaction recovery requires an active admitted run");
		admittedAssertion();
	};
	const assertRecoveryTarget = (target, sessionId = sessionPromptState.sessionId, writerFence = sessionPromptState.sessionWriterFence) => {
		assertAdmittedActive();
		if (memoryManager || detached) return;
		const entry = target?.sessionKey && target.storePath ? loadSessionEntry({
			agentId: target.agentId,
			sessionKey: target.sessionKey,
			storePath: target.storePath,
			readConsistency: "latest"
		}) : void 0;
		if (!writerFence || writerFence.expectedWriterRunId !== runId || entry?.sessionId !== sessionId || entry.lifecycleRevision !== writerFence.expectedLifecycleRevision || entry.activeWriterRunId !== writerFence.expectedWriterRunId) throw new SessionTranscriptWriterClaimReboundError();
	};
	const assertRecoveryActive = () => assertRecoveryTarget(sessionPromptState.sessionTarget);
	const getPreparedTarget = () => {
		const target = sessionPromptState.sessionTarget;
		if (!target?.agentId || !target.sessionKey || !target.storePath) throw new Error("compaction recovery requires a complete transcript target");
		return {
			...target,
			agentId: target.agentId,
			sessionId: sessionPromptState.sessionId,
			sessionKey: target.sessionKey,
			storePath: target.storePath
		};
	};
	const prepareRecoveryOwner = () => {
		assertRecoveryActive();
		const sessionId = sessionPromptState.sessionId;
		const sessionFile = sessionPromptState.sessionFile;
		const writerFence = sessionPromptState.sessionWriterFence;
		const target = {
			...getPreparedTarget(),
			...writerFence
		};
		const assertActive = () => {
			assertRecoveryTarget(target, sessionId, writerFence);
			const current = sessionPromptState.sessionTarget;
			if (sessionPromptState.sessionId !== sessionId || sessionPromptState.sessionFile !== sessionFile || current?.agentId !== target.agentId || current?.sessionKey !== target.sessionKey || current?.storePath !== target.storePath) throw new Error("active session changed after recovery transcript preparation");
		};
		return {
			session: {
				id: sessionId,
				file: sessionFile,
				target
			},
			...memoryManager ? { sessionManager: memoryManager } : {},
			assertActive,
			withTranscriptWrites: (signal, run) => {
				const assertInvocationActive = () => {
					signal?.throwIfAborted();
					assertActive();
				};
				const assertCommitAllowed = () => {
					assertInvocationActive();
					if (detached || memoryManager) throw new Error("detached recovery cannot persist a session transcript");
				};
				return withOwnedSessionTranscriptWrites({
					sessionTarget: target,
					assertCommitAllowed,
					withTranscriptWrite: async (write) => await write()
				}, async () => {
					assertInvocationActive();
					return await run();
				});
			}
		};
	};
	const prepareRecoverySession = () => {
		const owner = prepareRecoveryOwner();
		const sessionManager = memoryManager ?? (detached ? void 0 : SessionManager.open(owner.session.target, params.workspaceDir));
		return {
			sessionManager,
			assertActive: owner.assertActive,
			withSessionManagerRewriteLock: (operation) => owner.withTranscriptWrites(void 0, async () => {
				if (!sessionManager) throw new Error("detached recovery has no caller-owned transcript to rewrite");
				sessionManager.reloadPersistedTranscript();
				return await operation();
			})
		};
	};
	const resolveActiveHookContext = () => ({
		...hookContext,
		sessionId: sessionPromptState.sessionId
	});
	const adoptCompactionTranscript = async (compactResult, onAccepted) => {
		assertRecoveryActive();
		const currentTarget = getPreparedTarget();
		if (memoryManager || detached) {
			const successor = await resolveContextEngineCompactionSuccessor({
				config: params.config,
				currentSessionFile: sessionPromptState.sessionFile,
				currentTarget,
				result: compactResult
			});
			assertAdmittedActive();
			sessionPromptState.capturePreparedCompactionTarget(successor);
			onAccepted?.();
			sessionPromptState.notifyCompactionSessionAdopted(currentTarget.sessionId);
			assertAdmittedActive();
			return successor.sessionId !== currentTarget.sessionId ? currentTarget.sessionId : void 0;
		}
		const writerFence = sessionPromptState.sessionWriterFence;
		const recordAccepted = (accepted) => {
			sessionPromptState.recordCommittedCompactionSuccessor(accepted);
			onAccepted?.();
		};
		const accepted = await acceptCompactionSuccessor({
			config: params.config,
			currentSessionFile: sessionPromptState.sessionFile,
			currentTarget,
			result: compactResult,
			expectedEntry: {
				sessionId: currentTarget.sessionId,
				lifecycleRevision: writerFence?.expectedLifecycleRevision,
				activeWriterRunId: writerFence?.expectedWriterRunId
			},
			assertActive: assertAdmittedActive,
			onCommitted: recordAccepted
		});
		if (!accepted.previousSessionId) recordAccepted(accepted);
		assertRecoveryActive();
		sessionPromptState.notifyCompactionSessionAdopted(accepted.previousSessionId);
		assertRecoveryActive();
		return accepted.previousSessionId;
	};
	const onCompactionHookMessages = async (payload) => {
		const messages = payload.messages.filter((message) => message.trim().length > 0);
		if (messages.length === 0) return;
		assertRecoveryActive();
		await params.onAgentEvent?.({
			stream: "compaction",
			data: {
				phase: payload.phase === "before" ? "start" : "end",
				...payload.phase === "after" ? { completed: true } : {},
				messages
			},
			...params.sessionKey ? { sessionKey: params.sessionKey } : {}
		});
		assertRecoveryActive();
	};
	const runOwnsCompactionBeforeHook = async (reason) => {
		assertRecoveryActive();
		if (contextEngine.info.ownsCompaction !== true || !hookRunner?.hasHooks("before_compaction")) return;
		try {
			await hookRunner.runBeforeCompaction({
				messageCount: -1,
				sessionFile: sessionPromptState.sessionFile
			}, resolveActiveHookContext());
		} catch (error) {
			assertRecoveryActive();
			log$3.warn(`before_compaction hook failed during ${reason}: ${String(error)}`);
		}
		assertRecoveryActive();
	};
	const runOwnsCompactionAfterHook = async (reason, compactResult, previousSessionId) => {
		assertRecoveryActive();
		if (contextEngine.info.ownsCompaction !== true || !compactResult.ok || !compactResult.compacted || !hookRunner?.hasHooks("after_compaction")) return;
		try {
			await hookRunner.runAfterCompaction({
				messageCount: -1,
				compactedCount: -1,
				tokenCount: compactResult.result?.tokensAfter,
				sessionFile: resolveCompactionSuccessorTranscript(compactResult).sessionFile ?? sessionPromptState.sessionFile,
				...previousSessionId ? { previousSessionId } : {}
			}, resolveActiveHookContext());
		} catch (error) {
			assertRecoveryActive();
			log$3.warn(`after_compaction hook failed during ${reason}: ${String(error)}`);
		}
		assertRecoveryActive();
	};
	return {
		assertRecoveryActive,
		prepareRecoveryOwner,
		prepareRecoverySession,
		adoptCompactionTranscript,
		onCompactionHookMessages,
		runOwnsCompactionBeforeHook,
		runOwnsCompactionAfterHook
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/overflow-context-recovery.ts
function renderOverflowResetGuidance(attempt) {
	return "Context overflow: prompt too large for the model. Try /reset (or /new) to start a fresh session, or use a larger-context model." + ((attempt.currentAttemptReplayMetadata ?? attempt.replayMetadata).hadPotentialSideEffects ? " Completed tool actions were not replayed; verify their effects before retrying." : "");
}
async function recoverEmbeddedRunOverflow(input) {
	const contextOverflowError = !input.aborted && !input.signalOwnedInterruption ? (() => {
		if (input.promptError) {
			const errorText = formatErrorMessage(input.promptError);
			if (isLikelyContextOverflowError(errorText)) return {
				text: errorText,
				source: "promptError"
			};
			return null;
		}
		if (isProviderRefusalAssistantError(input.assistantOverflowCandidate)) return null;
		if (input.assistantOverflowCandidate && input.contextTokenBudget !== void 0 && isContextOverflow(input.assistantOverflowCandidate, input.contextTokenBudget)) return {
			text: input.assistantOverflowCandidate.errorMessage?.trim() || "Context window exceeded",
			source: "assistantError"
		};
		if (input.assistantErrorText && isLikelyContextOverflowError(input.assistantErrorText)) return {
			text: input.assistantErrorText,
			source: "assistantError"
		};
		return null;
	})() : null;
	if (!contextOverflowError || !input.genericCompactionRecoveryAllowed || input.contextTokenBudget === void 0) return { action: "none" };
	input.assertRecoveryActive();
	const contextTokenBudget = input.contextTokenBudget;
	const terminal = projectAgentRunAttemptTerminal(input.attempt.terminal);
	const providerPromptRejection = contextOverflowError.source === "assistantError" || terminal.promptErrorSource === "prompt" ? markLastProviderPromptContextRejected(getProviderPromptState(input.runParams.runId)) : void 0;
	const runParams = input.runParams;
	const overflowDiagId = createRunRecoveryDiagId();
	const errorText = contextOverflowError.text;
	const observedOverflowTokens = extractObservedOverflowTokenCount(errorText);
	const preflightRecovery = input.attempt.preflightRecovery;
	const truncateToolResults = () => {
		const { sessionManager, assertActive } = input.prepareRecoverySession();
		if (!sessionManager) return {
			truncated: false,
			truncatedCount: 0,
			reason: "detached recovery has no caller-owned transcript"
		};
		const target = sessionManager.getSessionTarget();
		assertActive();
		const result = truncateOversizedToolResultsInSessionManager({
			sessionManager,
			contextWindowTokens: contextTokenBudget,
			maxCharsOverride: resolveLiveToolResultMaxChars({ contextWindowTokens: contextTokenBudget }),
			protectTrailingToolResults: preflightRecovery?.route === "compact_then_truncate",
			projectionState: input.toolResultPromptProjectionState,
			...target
		});
		assertActive();
		return result;
	};
	const preflightPromptBudget = terminal.promptErrorSource === "precheck" && preflightRecovery?.source === "mid-turn" && typeof preflightRecovery.promptBudgetBeforeReserve === "number" && Number.isFinite(preflightRecovery.promptBudgetBeforeReserve) && preflightRecovery.promptBudgetBeforeReserve > 0 ? Math.floor(preflightRecovery.promptBudgetBeforeReserve) : void 0;
	const preflightEstimatedPromptTokens = typeof preflightRecovery?.estimatedPromptTokens === "number" && Number.isFinite(preflightRecovery.estimatedPromptTokens) && preflightRecovery.estimatedPromptTokens > 0 ? Math.ceil(preflightRecovery.estimatedPromptTokens) : void 0;
	const overflowTokenCountForCompaction = observedOverflowTokens ?? preflightEstimatedPromptTokens ?? (input.contextTokenBudget > 0 ? input.contextTokenBudget + 1 : void 0);
	const activeSession = input.getActiveSession();
	log$3.warn(`[context-overflow-diag] sessionKey=${runParams.sessionKey ?? runParams.sessionId} provider=${input.provider}/${input.modelId} source=${contextOverflowError.source} messages=${input.attempt.messagesSnapshot?.length ?? 0} sessionFile=${activeSession.file} diagId=${overflowDiagId} compactionAttempts=${input.state.overflowCompactionAttempts} observedTokens=${observedOverflowTokens ?? "unknown"} preflightEstimatedTokens=${preflightEstimatedPromptTokens ?? "unknown"} compactionTokens=${overflowTokenCountForCompaction ?? "unknown"} providerPayloadBytes=${providerPromptRejection?.byteWeight ?? "unknown"} error=${truncateUtf16Safe(errorText, 200)}`);
	const isCompactionFailure = isCompactionFailureError(errorText);
	if (isProviderRequestSizeCeilingError(errorText)) {
		log$3.warn(`[context-overflow-recovery] provider request-size ceiling for ${input.provider}/${input.modelId}; livenessState=blocked suggestedAction=reset_or_new kind=${isCompactionFailure ? "compaction_failure" : "context_overflow"} compaction=skipped retry=skipped`);
		return {
			action: "surface",
			kind: isCompactionFailure ? "compaction_failure" : "context_overflow",
			errorText,
			userText: renderOverflowResetGuidance(input.attempt)
		};
	}
	let parkedWorkBlocksContinuation = false;
	if (!isCompactionFailure && input.attemptCompactionCount > 0 && input.state.overflowCompactionAttempts < 3) {
		input.markOwnedTranscriptRetry();
		input.state.overflowCompactionAttempts += 1;
		log$3.warn(`context overflow persisted after in-attempt compaction (attempt ${input.state.overflowCompactionAttempts}/3); retrying prompt without additional compaction for ${input.provider}/${input.modelId}`);
		if (preflightRecovery?.source === "mid-turn") input.prepareCurrentTranscriptRetry();
		return { action: "retry" };
	}
	if (!isCompactionFailure && input.attemptCompactionCount === 0 && input.state.overflowCompactionAttempts < 3) {
		if (log$3.isEnabled("debug")) log$3.debug(`[compaction-diag] decision diagId=${overflowDiagId} branch=compact isCompactionFailure=${isCompactionFailure} hasOversizedToolResults=unknown attempt=${input.state.overflowCompactionAttempts + 1} maxAttempts=3`);
		input.state.overflowCompactionAttempts += 1;
		log$3.warn(`context overflow detected (attempt ${input.state.overflowCompactionAttempts}/3); attempting auto-compaction for ${input.provider}/${input.modelId}`);
		const compaction = await compactEmbeddedRunForRecovery(input, {
			tokenBudget: preflightPromptBudget ?? input.contextTokenBudget,
			trigger: "overflow",
			diagId: overflowDiagId,
			attempt: input.state.overflowCompactionAttempts,
			maxAttempts: 3,
			currentTokenCount: overflowTokenCountForCompaction
		});
		const { result: compactResult, previousSessionId } = compaction;
		input.assertRecoveryActive();
		if (compactResult.ok && compactResult.compacted) {
			const adoptedSession = input.getActiveSession();
			parkedWorkBlocksContinuation = previousSessionId !== void 0 && preflightRecovery?.source === "mid-turn" && input.attempt.toolMetas.some((entry) => entry.codeModeSuspended === true);
			if (parkedWorkBlocksContinuation) log$3.warn(`[context-overflow-recovery] compaction rotated ${previousSessionId} -> ${adoptedSession.id} while nested tool work was parked; not continuing mid-turn for ${input.provider}/${input.modelId}`);
			if (input.contextEngine.maintain) {
				const transcript = input.prepareRecoverySession();
				await runContextEngineMaintenance({
					...transcript,
					contextEngine: input.contextEngine,
					sessionId: adoptedSession.id,
					sessionKey: runParams.sessionKey,
					sessionTarget: adoptedSession.target,
					sessionFile: adoptedSession.file,
					reason: "compaction",
					runtimeContext: compaction.runtimeContext,
					runtimeSettings: compaction.runtimeSettings,
					config: runParams.config,
					agentId: input.sessionAgentId,
					contextEngineAgentId: input.contextEngineAgentId,
					abortSignal: runParams.abortSignal
				});
				input.assertRecoveryActive();
			}
		}
		await input.runOwnsCompactionAfterHook("overflow recovery", compactResult, previousSessionId);
		input.assertRecoveryActive();
		if (preflightRecovery && isNoRealConversationCompactionNoop(compactResult)) {
			input.state.lastCompactionTokensAfter = void 0;
			input.state.lastContextBudgetStatus = void 0;
			const transcript = input.prepareRecoverySession();
			await resetNoRealConversationTokenSnapshot({
				sessionTarget: transcript.sessionManager?.getSessionTarget(),
				sessionPersistence: runParams.sessionPersistence,
				assertActive: transcript.assertActive
			});
			input.assertRecoveryActive();
			log$3.info(`[context-overflow-precheck] stale token state had no real conversation messages for ${input.provider}/${input.modelId}; resetting the context snapshot and retrying prompt`);
			if (preflightRecovery.source === "mid-turn") input.prepareCurrentTranscriptRetry();
			return { action: "retry" };
		}
		if (compactResult.compacted) {
			if (preflightRecovery?.route === "compact_then_truncate") {
				const truncResult = truncateToolResults();
				if (truncResult.truncated) log$3.info(`[context-overflow-precheck] post-compaction tool-result truncation succeeded for ${input.provider}/${input.modelId}; truncated ${truncResult.truncatedCount} tool result(s)`);
				else log$3.warn(`[context-overflow-precheck] post-compaction tool-result truncation did not help for ${input.provider}/${input.modelId}: ${truncResult.reason ?? "unknown"}`);
			}
			input.assertRecoveryActive();
			input.runParams.onAutoCompactionSucceeded?.(input.state.autoCompactionCount);
			input.assertRecoveryActive();
			input.armPostCompactionGuard();
			if (parkedWorkBlocksContinuation) log$3.warn(`auto-compaction succeeded for ${input.provider}/${input.modelId}, but parked nested tool work cannot follow the rotated session; surfacing overflow guidance`);
			else {
				log$3.info(`auto-compaction succeeded for ${input.provider}/${input.modelId}; retrying prompt`);
				input.markOwnedTranscriptRetry();
				if (preflightRecovery?.source === "mid-turn") input.prepareCurrentTranscriptRetry();
				else {
					await input.prepareCompactedTranscriptRetry(input.assertRecoveryActive);
					input.assertRecoveryActive();
				}
				return { action: "retry" };
			}
		} else log$3.warn(`auto-compaction failed for ${input.provider}/${input.modelId}: ${compactResult.reason ?? "nothing to compact"}`);
	}
	if (!parkedWorkBlocksContinuation && !input.state.toolResultTruncationAttempted) {
		const toolResultMaxChars = resolveLiveToolResultMaxChars({ contextWindowTokens: input.contextTokenBudget });
		if (input.attempt.messagesSnapshot ? sessionLikelyHasOversizedToolResults({
			messages: input.attempt.messagesSnapshot,
			contextWindowTokens: input.contextTokenBudget,
			maxCharsOverride: toolResultMaxChars
		}) : false) {
			input.state.toolResultTruncationAttempted = true;
			log$3.warn(`[context-overflow-recovery] Attempting tool result truncation for ${input.provider}/${input.modelId} (contextWindow=${input.contextTokenBudget} tokens)`);
			const truncResult = truncateToolResults();
			if (truncResult.truncated) {
				input.markOwnedTranscriptRetry();
				log$3.info(`[context-overflow-recovery] Truncated ${truncResult.truncatedCount} tool result(s); retrying prompt`);
				if (preflightRecovery?.source === "mid-turn") input.prepareCurrentTranscriptRetry();
				return { action: "retry" };
			}
			log$3.warn(`[context-overflow-recovery] Tool result truncation did not help: ${truncResult.reason ?? "unknown"}`);
		}
	}
	if ((isCompactionFailure || input.state.overflowCompactionAttempts >= 3) && log$3.isEnabled("debug")) log$3.debug(`[compaction-diag] decision diagId=${overflowDiagId} branch=give_up isCompactionFailure=${isCompactionFailure} hasOversizedToolResults=unknown attempt=${input.state.overflowCompactionAttempts} maxAttempts=3`);
	const kind = isCompactionFailure ? "compaction_failure" : "context_overflow";
	const userText = renderOverflowResetGuidance(input.attempt);
	log$3.warn(`[context-overflow-recovery] exhausted provider overflow recovery for ${input.provider}/${input.modelId}; livenessState=blocked suggestedAction=reset_or_new kind=${kind}`);
	return {
		action: "surface",
		kind,
		errorText,
		userText
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/prompt-failure.ts
async function handleEmbeddedPromptFailure(input) {
	if (input.promptErrorSource === "precheck" && input.promptError instanceof CompactionReplayRefreshRequiredError) {
		const text = new CompactionReplayRefreshRequiredError().message;
		return completeBlockedPromptFailure(input, {
			text,
			errorKind: "compaction_replay_refresh_required",
			errorMessage: text
		});
	}
	const promptAuthMode = input.authProfileId ? input.authProfileStore.profiles?.[input.authProfileId]?.type : void 0;
	const normalizedPromptFailover = coerceToFailoverError(input.promptError, {
		provider: input.activeErrorContext.provider,
		model: input.activeErrorContext.model,
		profileId: input.authProfileId,
		authMode: promptAuthMode,
		sessionId: input.sessionIdUsed,
		lane: input.lane
	});
	const promptErrorDetails = normalizedPromptFailover ? describeFailoverError(normalizedPromptFailover) : describeFailoverError(input.promptError);
	if (normalizedPromptFailover?.suspend) input.suspendForFailure({
		cfg: input.runParams.config,
		agentDir: input.agentDir,
		sessionId: input.suspensionSessionId,
		reason: resolveSessionSuspensionReason(normalizedPromptFailover.reason),
		failedProvider: normalizedPromptFailover.provider ?? input.provider,
		failedModel: normalizedPromptFailover.model ?? input.modelId
	});
	const errorText = promptErrorDetails.message || formatErrorMessage(input.promptError);
	if (await input.maybeRefreshRuntimeAuthForAuthError(errorText, input.runtimeAuthRetry)) return {
		action: "retry",
		thinkLevel: input.thinkLevel,
		authRetryPending: true,
		lastRetryFailoverReason: input.previousRetryFailoverReason
	};
	const blockedResult = resolveBlockedPromptResult(input, errorText);
	if (blockedResult) return blockedResult;
	const promptFailoverReason = promptErrorDetails.reason ?? classifyFailoverReason(errorText, { provider: input.provider });
	const promptProfileFailureReason = input.resolveAuthProfileFailureReason(promptFailoverReason, {
		providerStarted: input.promptErrorSource === "prompt",
		transientRateLimit: promptFailoverReason === "rate_limit" && isShortWindowRateLimitMessage(errorText)
	});
	const promptFailoverFailure = promptFailoverReason !== null || isFailoverErrorMessage(errorText, { provider: input.provider });
	const promptTimeoutFallbackSafe = input.promptErrorSource === "prompt" && promptFailoverReason === "timeout" && !input.attempt.codexAppServerFailure && input.attempt.promptTimeoutOutcome?.replayInvalid !== true && input.attempt.replayMetadata.replaySafe;
	const failedProfileId = input.authProfileId;
	const logFailoverDecision = createFailoverDecisionLogger({
		stage: "prompt",
		runId: input.runParams.runId,
		rawError: errorText,
		failoverReason: promptFailoverReason,
		profileFailureReason: promptProfileFailureReason,
		provider: input.provider,
		model: input.modelId,
		sourceProvider: input.provider,
		sourceModel: input.modelId,
		profileId: failedProfileId,
		fallbackConfigured: input.fallbackConfigured,
		aborted: input.aborted,
		retryCount: input.getTransientRetryCount(),
		attemptCount: input.traceAttempts.length + 1
	});
	let failoverDecision = resolveRunFailoverDecision({
		stage: "prompt",
		aborted: input.aborted,
		externalAbort: input.externalAbort,
		fallbackConfigured: input.fallbackConfigured,
		failoverCode: promptErrorDetails.code,
		failoverFailure: promptFailoverFailure,
		failoverReason: promptFailoverReason,
		harnessOwnsTransport: input.pluginHarnessOwnsTransport,
		promptTimeoutFallbackSafe,
		timedOutByRunBudget: input.timedOutByRunBudget,
		profileRotated: false
	});
	const canRetryRateLimit = promptFailoverReason !== "rate_limit" || isShortWindowRateLimitMessage(errorText);
	if (!input.externalAbort && canRetryRateLimit && promptFailoverReason && (failoverDecision.action === "rotate_profile" || failoverDecision.action === "fallback_model" || failoverDecision.action === "surface_error") && await input.maybeRetryTransient({
		reason: promptFailoverReason,
		retryAfterMs: resolveRetryAfterMs(errorText)
	})) {
		logFailoverDecision("retry_same_model", { retryCount: input.getTransientRetryCount() });
		return {
			action: "retry",
			thinkLevel: input.thinkLevel,
			authRetryPending: false,
			lastRetryFailoverReason: mergeRetryFailoverReason({
				previous: input.previousRetryFailoverReason,
				failoverReason: promptFailoverReason
			})
		};
	}
	let rotated = false;
	if (failoverDecision.action === "rotate_profile") {
		if (promptFailoverReason === "rate_limit") rotated = await input.advanceRateLimitAuthProfile({
			failoverProvider: input.provider,
			failoverModel: input.modelId,
			logFallbackDecision: logFailoverDecision
		});
		else rotated = await input.advanceAuthProfile();
	}
	if (rotated) {
		if (promptProfileFailureReason) input.maybeMarkAuthProfileFailure({
			profileId: failedProfileId,
			reason: promptProfileFailureReason,
			modelId: input.modelId
		}).catch((error) => {
			log$3.warn(`prompt profile failure mark failed: ${String(error)}`);
		});
		input.traceAttempts.push({
			provider: input.provider,
			model: input.modelId,
			result: promptFailoverReason === "timeout" ? "timeout" : "rotate_profile",
			...promptFailoverReason ? { reason: promptFailoverReason } : {},
			stage: "prompt"
		});
		const lastRetryFailoverReason = mergeRetryFailoverReason({
			previous: input.previousRetryFailoverReason,
			failoverReason: promptFailoverReason
		});
		logFailoverDecision("rotate_profile", {
			retryCount: input.getTransientRetryCount(),
			profileRotationCount: rotated ? 1 : 0
		});
		return {
			action: "retry",
			thinkLevel: input.getThinkLevel(),
			authRetryPending: false,
			lastRetryFailoverReason
		};
	}
	if (failoverDecision.action === "rotate_profile") failoverDecision = resolveRunFailoverDecision({
		stage: "prompt",
		aborted: input.aborted,
		externalAbort: input.externalAbort,
		fallbackConfigured: input.fallbackConfigured,
		failoverCode: promptErrorDetails.code,
		failoverFailure: promptFailoverFailure,
		failoverReason: promptFailoverReason,
		harnessOwnsTransport: input.pluginHarnessOwnsTransport,
		promptTimeoutFallbackSafe,
		timedOutByRunBudget: input.timedOutByRunBudget,
		profileRotated: true
	});
	if (promptProfileFailureReason) try {
		await input.maybeMarkAuthProfileFailure({
			profileId: failedProfileId,
			reason: promptProfileFailureReason,
			modelId: input.modelId
		});
	} catch (error) {
		log$3.warn(`prompt profile failure mark failed: ${String(error)}`);
	}
	const fallbackThinking = pickFallbackThinkingLevel({
		message: errorText,
		attempted: input.attemptedThinking
	});
	if (fallbackThinking) {
		log$3.warn(`unsupported thinking level for ${input.provider}/${input.modelId}; retrying with ${fallbackThinking}`);
		logFailoverDecision("retry_thinking_level", { retryCount: input.getTransientRetryCount() });
		return {
			action: "retry",
			thinkLevel: fallbackThinking,
			authRetryPending: false,
			lastRetryFailoverReason: input.previousRetryFailoverReason
		};
	}
	if (failoverDecision.action === "fallback_model") {
		const fallbackReason = failoverDecision.reason ?? "unknown";
		const status = resolveFailoverStatus(fallbackReason);
		input.traceAttempts.push({
			provider: input.provider,
			model: input.modelId,
			result: promptFailoverReason === "timeout" ? "timeout" : "fallback_model",
			reason: fallbackReason,
			stage: "prompt",
			...typeof status === "number" ? { status } : {}
		});
		logFailoverDecision("fallback_model", {
			status,
			retryCount: input.getTransientRetryCount(),
			profileRotationCount: 0
		});
		throw (normalizedPromptFailover?.reason === fallbackReason ? normalizedPromptFailover : null) ?? new FailoverError(errorText, {
			reason: fallbackReason,
			provider: input.provider,
			model: input.modelId,
			profileId: input.authProfileId,
			authMode: promptAuthMode,
			sessionId: input.sessionIdUsed,
			lane: input.lane,
			status
		});
	}
	if (failoverDecision.action === "surface_error") {
		input.traceAttempts.push({
			provider: input.provider,
			model: input.modelId,
			result: promptFailoverReason === "timeout" ? "timeout" : "surface_error",
			...promptFailoverReason ? { reason: promptFailoverReason } : {},
			stage: "prompt"
		});
		logFailoverDecision("surface_error", {
			retryCount: input.getTransientRetryCount(),
			profileRotationCount: 0
		});
	}
	throw toErrorObject(input.promptError, "Prompt failed");
}
function resolveBlockedPromptResult(input, errorText) {
	let text;
	let errorKind;
	if (/incorrect role information|roles must alternate/i.test(errorText)) {
		text = "Message ordering conflict - please try again. If this persists, use /new to start a fresh session.";
		errorKind = "role_ordering";
	} else {
		const imageSizeError = parseImageSizeError(errorText);
		if (!imageSizeError) return;
		const maxMb = imageSizeError.maxMb;
		const maxMbLabel = typeof maxMb === "number" && Number.isFinite(maxMb) ? `${maxMb}` : null;
		text = `Image too large for the model${maxMbLabel ? ` (max ${maxMbLabel}MB)` : ""}. Please compress or resize the image and try again.`;
		errorKind = "image_size";
	}
	return completeBlockedPromptFailure(input, {
		text,
		errorKind,
		errorMessage: errorText
	});
}
function completeBlockedPromptFailure(input, copy) {
	const replayInvalid = input.resolveReplayInvalid();
	input.setTerminalLifecycleMeta({
		replayInvalid,
		livenessState: "blocked"
	});
	return {
		action: "complete",
		result: buildEmbeddedRunBlockedResult({
			...copy,
			durationMs: Date.now() - input.startedAtMs,
			agentMeta: input.buildErrorAgentMeta(),
			attempt: input.attempt,
			replayInvalid,
			finalPromptText: input.attempt.finalPromptText
		})
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/timeout-context-recovery.ts
const MAX_TIMEOUT_COMPACTION_ATTEMPTS = 2;
async function recoverEmbeddedRunTimeout(input) {
	if (!input.genericCompactionRecoveryAllowed || input.contextTokenBudget === void 0 || !input.timedOut || input.signalOwnedInterruption || input.timedOutDuringCompaction || input.timedOutDuringToolExecution || input.timedOutByRunBudget) return false;
	const lastTurnPromptTokens = deriveContextPromptTokens({ lastCallUsage: input.lastRunPromptUsage });
	const tokenUsedRatio = lastTurnPromptTokens != null && input.contextTokenBudget > 0 ? lastTurnPromptTokens / input.contextTokenBudget : 0;
	if (input.state.timeoutCompactionAttempts >= MAX_TIMEOUT_COMPACTION_ATTEMPTS) {
		log$3.warn(`[timeout-compaction] already attempted timeout compaction ${input.state.timeoutCompactionAttempts} time(s); falling through to failover rotation`);
		return false;
	}
	if (tokenUsedRatio <= .65) return false;
	input.assertRecoveryActive();
	const timeoutDiagId = createRunRecoveryDiagId();
	input.state.timeoutCompactionAttempts += 1;
	log$3.warn(`[timeout-compaction] LLM timed out with high prompt token usage (${Math.round(tokenUsedRatio * 100)}%); attempting compaction before retry (attempt ${input.state.timeoutCompactionAttempts}/${MAX_TIMEOUT_COMPACTION_ATTEMPTS}) diagId=${timeoutDiagId}`);
	const { result: timeoutCompactResult, previousSessionId } = await compactEmbeddedRunForRecovery(input, {
		tokenBudget: input.contextTokenBudget,
		trigger: "timeout_recovery",
		diagId: timeoutDiagId,
		attempt: input.state.timeoutCompactionAttempts,
		maxAttempts: MAX_TIMEOUT_COMPACTION_ATTEMPTS
	});
	input.assertRecoveryActive();
	await input.runOwnsCompactionAfterHook("timeout recovery", timeoutCompactResult, previousSessionId);
	input.assertRecoveryActive();
	if (!timeoutCompactResult.compacted) {
		log$3.warn(`[timeout-compaction] compaction did not reduce context for ${input.provider}/${input.modelId}; falling through to normal handling`);
		return false;
	}
	input.runParams.onAutoCompactionSucceeded?.(input.state.autoCompactionCount);
	input.assertRecoveryActive();
	if (timeoutCompactResult.ok && input.contextEngine.info.ownsCompaction === true && input.runParams.sessionPersistence !== "detached") {
		const activeSession = input.getActiveSession();
		await runPostCompactionSideEffects({
			config: input.runParams.config,
			sessionKey: input.runParams.sessionKey,
			sessionId: activeSession.id,
			agentId: input.sessionAgentId,
			sessionFile: activeSession.file,
			assertActive: input.assertRecoveryActive
		});
		input.assertRecoveryActive();
	}
	log$3.info(`[timeout-compaction] compaction succeeded for ${input.provider}/${input.modelId}; retrying prompt`);
	input.armPostCompactionGuard();
	await input.prepareCompactedTranscriptRetry(input.assertRecoveryActive);
	input.assertRecoveryActive();
	return true;
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-recovery.ts
const MAX_TRANSPORT_DROP_CONTINUATIONS = 2;
/** Errored assistant turn with transient transport evidence and no visible output. */
function isSilentTransportDropAssistant(assistant) {
	if (!assistant || assistant.stopReason !== "error" || !isRetryableAssistantError(assistant) || !assistant.diagnostics?.some((diagnostic) => diagnostic.type === "provider_transport_failure")) return false;
	return (Array.isArray(assistant.content) ? assistant.content : []).length === 0 || hasOnlyAssistantReasoningContent(assistant);
}
async function recoverEmbeddedRunAttempt(input) {
	const { runInput, preparedRuntime, normalizedAttempt, runtimePlan, sessionPromptState, failoverRetryController, compactionRuntime } = input;
	const params = runInput.runParams;
	const runtime = preparedRuntime.snapshot();
	const { attempt, sessionIdUsed, attemptAssistant, currentAttemptAssistant, currentAttemptCompletedAssistant, terminalState, setTerminalLifecycleMeta, attemptCompactionCount, activeErrorContext, resolveReplayInvalidForAttempt, assistantErrorText, canRestartForLiveSwitch } = normalizedAttempt;
	const { aborted, externalAbort, promptError, promptErrorSource, timedOut, timedOutDuringCompaction, timedOutDuringToolExecution, timedOutByRunBudget } = projectAgentRunAttemptTerminal(attempt.terminal);
	const terminalInterrupted = isEmbeddedRunTerminalInterrupted(terminalState.outcome);
	const currentAttemptReplaySafe = isCurrentAttemptReplaySafe(attempt);
	const settledEvidence = resolveSettledToolBatchEvidence(attempt);
	const midTurnBatchSettled = settledEvidence.allToolsProvenSettled || settledEvidence.parkedCodeModeRun;
	const transportBatchSettled = settledEvidence.allToolsProvenSettled || settledEvidence.failedToolNames.size === 0 && settledEvidence.parkedCodeModeRun;
	const canContinueSettledMidTurnOverflow = promptErrorSource === "precheck" && attempt.preflightRecovery?.source === "mid-turn" && midTurnBatchSettled && !hasAsyncActivity(attempt.toolMetas);
	const settledTransportDropAssistant = !currentAttemptReplaySafe && !promptError && !aborted && !timedOut && !terminalInterrupted && !hasNonToolTerminalState(attempt) && !settledEvidence.hasUnsettledToolError && transportBatchSettled && isSilentTransportDropAssistant(currentAttemptAssistant) ? currentAttemptAssistant : void 0;
	const { signalOwnedInterruption } = terminalState;
	const assistantOverflowCandidate = currentAttemptCompletedAssistant !== void 0 ? currentAttemptCompletedAssistant.stopReason === "error" || currentAttemptCompletedAssistant.stopReason === "length" ? currentAttemptCompletedAssistant : void 0 : attemptAssistant?.stopReason === "error" || attemptAssistant?.stopReason === "length" ? attemptAssistant : void 0;
	const retry = (updates) => ({
		action: "retry",
		authRetryPending: updates?.authRetryPending ?? false,
		codexAppServerRecoveryRetries: updates?.codexAppServerRecoveryRetries ?? input.codexAppServerRecoveryRetries,
		lastRetryFailoverReason: updates?.lastRetryFailoverReason === void 0 ? input.lastRetryFailoverReason : updates.lastRetryFailoverReason,
		thinkLevel: updates?.thinkLevel ?? runtime.thinkLevel
	});
	const buildAttemptErrorMeta = () => buildErrorAgentMeta({
		sessionId: sessionIdUsed,
		sessionFile: sessionPromptState.sessionFile,
		provider: preparedRuntime.provider,
		model: preparedRuntime.model.id,
		credentialSource: attempt.modelAttempt?.credentialSource,
		...runtime.outerContextTokenMeta,
		usageAccumulator: input.usageAccumulator,
		lastRunPromptUsage: input.lastRunPromptUsage,
		currentAttemptAssistant
	});
	if (promptErrorSource === "hook:before_agent_run" && !terminalInterrupted) {
		const errorText = formatErrorMessage(promptError);
		const replayInvalid = resolveReplayInvalidForAttempt();
		setTerminalLifecycleMeta({
			replayInvalid,
			livenessState: "blocked"
		});
		return {
			action: "complete",
			result: buildEmbeddedRunBlockedResult({
				text: errorText,
				errorKind: "hook_block",
				errorMessage: errorText,
				durationMs: Date.now() - runInput.startedAtMs,
				agentMeta: buildAttemptErrorMeta(),
				attempt,
				replayInvalid
			})
		};
	}
	if (!currentAttemptReplaySafe && !canContinueSettledMidTurnOverflow && !settledTransportDropAssistant) return { action: "proceed" };
	const requestedSelection = shouldSwitchToLiveModel({
		cfg: params.config,
		sessionPersistence: params.sessionPersistence,
		sessionKey: runInput.resolvedSessionKey,
		agentId: params.agentId,
		defaultProvider: DEFAULT_PROVIDER,
		defaultModel: DEFAULT_MODEL,
		currentProvider: preparedRuntime.provider,
		currentModel: preparedRuntime.modelId,
		currentAgentRuntimeOverride: params.agentHarnessRuntimeOverride,
		currentAuthProfileId: preparedRuntime.preferredProfileId,
		currentAuthProfileIdSource: params.authProfileIdSource
	});
	if (currentAttemptReplaySafe && !signalOwnedInterruption && requestedSelection && canRestartForLiveSwitch) {
		await clearLiveModelSwitchPending({
			cfg: params.config,
			sessionKey: runInput.resolvedSessionKey,
			agentId: params.agentId
		});
		log$3.info(`live session model switch requested during active attempt for ${params.sessionId}: ${preparedRuntime.provider}/${preparedRuntime.modelId} -> ${requestedSelection.provider}/${requestedSelection.model}`);
		throw new LiveSessionModelSwitchError(requestedSelection);
	}
	const compactionSelection = resolveCompactionLiveModelSelection({
		current: {
			provider: preparedRuntime.provider,
			model: preparedRuntime.modelId,
			authProfileId: runtime.lastProfileId,
			authProfileIdSource: runtime.lastProfileId && runtime.lastProfileId === preparedRuntime.lockedProfileId ? "user" : "auto"
		},
		requested: currentAttemptReplaySafe ? requestedSelection : void 0
	});
	const commonRecoveryInput = {
		runParams: params,
		state: input.contextRecoveryState,
		contextEngine: input.contextEngine,
		contextTokenBudget: runtime.contextTokenBudget,
		genericCompactionRecoveryAllowed: preparedRuntime.genericCompactionRecoveryAllowed,
		attempt,
		toolResultPromptProjectionState: getEmbeddedSessionPromptState(params.sessionId).toolResults,
		runtimeAuthPlan: runtimePlan.auth,
		resolvedSessionKey: runInput.resolvedSessionKey,
		sessionAgentId: input.sessionAgentId,
		contextEngineAgentId: runInput.contextEngineAgentId,
		agentDir: runInput.agentDir,
		workspaceDir: runInput.workspaceDir,
		provider: compactionSelection.provider,
		modelId: compactionSelection.model,
		harnessRuntime: runtime.agentHarness.id,
		thinkLevel: runtime.thinkLevel,
		authProfileId: compactionSelection.authProfileId,
		authProfileIdSource: compactionSelection.authProfileIdSource,
		resolveContextEnginePluginId: input.resolveContextEnginePluginId,
		buildRuntimeSettings: input.buildRuntimeSettings,
		...compactionRuntime,
		getActiveSession: () => ({
			id: sessionPromptState.sessionId,
			file: sessionPromptState.sessionFile,
			target: sessionPromptState.sessionTarget
		}),
		prepareCompactedTranscriptRetry: sessionPromptState.prepareCompactedTranscriptRetry,
		armPostCompactionGuard: input.armPostCompactionGuard,
		usageAccumulator: input.usageAccumulator
	};
	if (await recoverEmbeddedRunTimeout({
		...commonRecoveryInput,
		timedOut,
		signalOwnedInterruption,
		timedOutDuringCompaction,
		timedOutDuringToolExecution,
		timedOutByRunBudget,
		lastRunPromptUsage: input.lastRunPromptUsage
	})) return retry();
	const overflowRecovery = await recoverEmbeddedRunOverflow({
		...commonRecoveryInput,
		aborted,
		signalOwnedInterruption,
		promptError,
		assistantErrorText,
		assistantOverflowCandidate,
		attemptCompactionCount,
		prepareCurrentTranscriptRetry: sessionPromptState.continueFromCurrentTranscript,
		markOwnedTranscriptRetry: sessionPromptState.markOwnedTranscriptRetry
	});
	if (overflowRecovery.action === "retry") return retry();
	if (overflowRecovery.action === "surface") {
		const replayInvalid = resolveReplayInvalidForAttempt();
		setTerminalLifecycleMeta({
			replayInvalid,
			livenessState: "blocked"
		});
		return {
			action: "complete",
			result: buildEmbeddedRunBlockedResult({
				text: overflowRecovery.userText,
				errorKind: overflowRecovery.kind,
				errorMessage: overflowRecovery.errorText,
				durationMs: Date.now() - runInput.startedAtMs,
				agentMeta: buildAttemptErrorMeta(),
				attempt,
				replayInvalid,
				finalPromptText: attempt.finalPromptText
			})
		};
	}
	const recoveryState = input.contextRecoveryState;
	if (settledTransportDropAssistant && recoveryState.transportDropContinuations < MAX_TRANSPORT_DROP_CONTINUATIONS) {
		runInput.laneController.throwIfAborted();
		recoveryState.transportDropContinuations += 1;
		sessionPromptState.markOwnedTranscriptRetry();
		sessionPromptState.continueFromCurrentTranscript({ includeToolFailureInstruction: settledEvidence.failedToolNames.size > 0 });
		log$3.warn(`provider transport dropped after a settled tool batch; continuing from the transcript attempt=${recoveryState.transportDropContinuations}/${MAX_TRANSPORT_DROP_CONTINUATIONS} provider=${preparedRuntime.provider} model=${preparedRuntime.modelId} error=${settledTransportDropAssistant.errorMessage?.trim() ?? "unknown"} runId=${params.runId} sessionId=${params.sessionId}`);
		return retry();
	}
	if (!currentAttemptReplaySafe) return { action: "proceed" };
	const hasCodexAppServerTimeoutOutcome = Boolean(attempt.codexAppServerFailure && (attempt.promptTimeoutOutcome || isEmbeddedRunTimeoutFinal(attempt)));
	if (promptError && promptErrorSource !== "compaction" && attempt.codexAppServerFailure) {
		if (resolveCodexAppServerRecoveryRetry({
			attempt,
			retryAvailable: input.codexAppServerRecoveryRetryAvailable
		}).retry) {
			runInput.laneController.throwIfAborted();
			sessionPromptState.suppressNextUserMessagePersistence = true;
			log$3.warn(`codex app-server replay-safe failure; retrying once failureKind=${attempt.codexAppServerFailure?.kind} runId=${params.runId} sessionId=${params.sessionId}`);
			return retry({ codexAppServerRecoveryRetries: input.codexAppServerRecoveryRetries + 1 });
		}
		if (!hasCodexAppServerTimeoutOutcome) throw toErrorObject(promptError, "Prompt failed");
	}
	if (promptError && !terminalInterrupted && promptErrorSource !== "compaction" && !hasCodexAppServerTimeoutOutcome) {
		const promptFailureOutcome = await handleEmbeddedPromptFailure({
			runParams: params,
			attempt,
			promptError,
			promptErrorSource,
			activeErrorContext,
			provider: preparedRuntime.provider,
			modelId: preparedRuntime.modelId,
			authProfileId: runtime.lastProfileId,
			authProfileStore: preparedRuntime.attemptAuthProfileStore,
			sessionIdUsed,
			lane: runInput.globalLane,
			agentDir: runInput.agentDir,
			suspensionSessionId: sessionPromptState.sessionId ?? params.sessionId,
			runtimeAuthRetry: input.runtimeAuthRetry,
			maybeRefreshRuntimeAuthForAuthError: preparedRuntime.maybeRefreshRuntimeAuthForAuthError,
			suspendForFailure: runInput.suspendForFailure,
			resolveReplayInvalid: resolveReplayInvalidForAttempt,
			setTerminalLifecycleMeta,
			buildErrorAgentMeta: buildAttemptErrorMeta,
			startedAtMs: runInput.startedAtMs,
			fallbackConfigured: runInput.fallbackConfigured,
			aborted,
			externalAbort,
			pluginHarnessOwnsTransport: runtime.pluginHarnessOwnsTransport,
			timedOutByRunBudget,
			resolveAuthProfileFailureReason: failoverRetryController.resolveAuthProfileFailureReason,
			advanceAuthProfile: failoverRetryController.advanceAuthProfile,
			advanceRateLimitAuthProfile: failoverRetryController.advanceRateLimitAuthProfile,
			maybeMarkAuthProfileFailure: failoverRetryController.maybeMarkAuthProfileFailure,
			maybeRetryTransient: failoverRetryController.maybeRetryTransient,
			getTransientRetryCount: () => failoverRetryController.transientRetryCount,
			attemptedThinking: preparedRuntime.attemptedThinking,
			thinkLevel: runtime.thinkLevel,
			getThinkLevel: () => preparedRuntime.snapshot().thinkLevel,
			traceAttempts: input.traceAttempts,
			previousRetryFailoverReason: input.lastRetryFailoverReason
		});
		if (promptFailureOutcome.action === "complete") return {
			action: "complete",
			result: promptFailureOutcome.result
		};
		preparedRuntime.setThinkLevel(promptFailureOutcome.thinkLevel);
		return retry({
			authRetryPending: promptFailureOutcome.authRetryPending,
			lastRetryFailoverReason: promptFailureOutcome.lastRetryFailoverReason,
			thinkLevel: promptFailureOutcome.thinkLevel
		});
	}
	return { action: "proceed" };
}
//#endregion
//#region src/agents/embedded-agent-runner/run/context-recovery-state.ts
function createEmbeddedRunContextRecoveryState() {
	const state = {
		autoCompactionCount: 0,
		lastCompactionTokensAfter: void 0,
		currentContextSnapshot: void 0,
		lastContextBudgetStatus: void 0,
		overflowCompactionAttempts: 0,
		timeoutCompactionAttempts: 0,
		toolResultTruncationAttempted: false,
		transportDropContinuations: 0,
		observeContextAccounting(event) {
			const tokens = event.kind === "compaction" ? event.tokensAfter : event.contextTokens;
			state.currentContextSnapshot = { tokens };
			if (event.kind === "compaction") {
				state.autoCompactionCount += 1;
				state.lastCompactionTokensAfter = tokens;
			}
		}
	};
	return state;
}
//#endregion
//#region src/agents/embedded-agent-runner/run/failover-retry-controller.ts
function createEmbeddedRunFailoverRetryController(input) {
	const { runParams: params, provider, modelId, globalLane, agentDir, fallbackConfigured, profileFailureStore } = input;
	const overloadProfileRotationLimit = resolveOverloadProfileRotationLimit();
	const rateLimitProfileRotationLimit = resolveRateLimitProfileRotationLimit();
	let rateLimitProfileRotations = 0;
	let transientRetryCount = 0;
	let transientRetryBudget = 3;
	let transientRetryWindowStartMs = null;
	const sleepForRetry = async (delayMs) => {
		try {
			await sleepWithAbort(delayMs, params.abortSignal);
		} catch (error) {
			if (!params.abortSignal?.aborted) throw error;
			const abortError = new Error("Operation aborted", { cause: error });
			abortError.name = "AbortError";
			throw abortError;
		}
	};
	const resolveProfileFailureReason = (failoverReason, opts) => resolveAuthProfileFailureReason({
		failoverReason,
		providerStarted: opts?.providerStarted,
		transientRateLimit: opts?.transientRateLimit,
		policy: params.authProfileFailurePolicy
	});
	const maybeMarkAuthProfileFailure = async (failure) => {
		const { profileId, reason } = failure;
		if (input.harnessOwnsTransport() && (reason === "auth" || reason === "auth_permanent")) revokeRuntimeAuthMaterializations({
			agentDir,
			provider,
			runtimeOwnerId: input.getRuntimeAuthOwnerId()
		});
		if (params.authProfileStateMode === "read-only" || !reason) return;
		if (input.harnessOwnsTransport() && reason === "timeout") return;
		if (profileId) {
			await markAuthProfileFailure({
				store: profileFailureStore,
				profileId,
				reason,
				cfg: params.config,
				agentDir,
				runId: params.runId,
				modelId: failure.modelId
			});
			return;
		}
		const apiKeyInfo = input.getApiKeyInfo();
		if (apiKeyInfo?.mode !== "api-key" || !isConfigBackedInlineProviderApiKey({
			cfg: params.config,
			provider,
			source: apiKeyInfo.source,
			store: profileFailureStore
		})) return;
		await markInlineProviderApiKeyFailure({
			store: profileFailureStore,
			provider,
			reason,
			cfg: params.config,
			agentDir,
			runId: params.runId,
			modelId: failure.modelId
		});
	};
	return {
		overloadProfileRotationLimit,
		get transientRetryCount() {
			return transientRetryCount;
		},
		setTransientRetryBudget: (maxRetries) => {
			transientRetryBudget = maxRetries ?? 3;
		},
		advanceAuthProfile: input.advanceAuthProfile,
		advanceRateLimitAuthProfile: async (context) => {
			if (rateLimitProfileRotations >= rateLimitProfileRotationLimit && fallbackConfigured) {
				const status = resolveFailoverStatus("rate_limit");
				log$3.warn(`rate-limit profile rotation cap reached for ${sanitizeForLog(provider)}/${sanitizeForLog(modelId)} after ${rateLimitProfileRotations} rotations; escalating to model fallback`);
				context.logFallbackDecision("fallback_model", { status });
				throw new FailoverError("The AI service is temporarily rate-limited. Please try again in a moment.", {
					reason: "rate_limit",
					provider: context.failoverProvider,
					model: context.failoverModel,
					profileId: input.getLastProfileId(),
					sessionId: input.getSessionId(),
					lane: globalLane,
					status
				});
			}
			const rotated = await input.advanceAuthProfile();
			if (rotated) rateLimitProfileRotations += 1;
			return rotated;
		},
		maybeMarkAuthProfileFailure,
		resolveAuthProfileFailureReason: resolveProfileFailureReason,
		recoverThrownHarnessAuthFailure: async (error) => {
			if (!input.harnessOwnsTransport()) return null;
			const failoverReason = resolveFailoverReasonFromError(error, provider);
			if (failoverReason !== "auth" && failoverReason !== "auth_permanent") return null;
			const failedProfileId = input.getLastProfileId();
			const profileFailureReason = resolveProfileFailureReason(failoverReason);
			const rotated = params.authProfileIdSource === "user" && failedProfileId === params.authProfileId ? false : await input.advanceAuthProfile();
			try {
				await maybeMarkAuthProfileFailure({
					profileId: failedProfileId,
					reason: profileFailureReason,
					modelId
				});
			} catch (markError) {
				log$3.warn(`profile failure mark failed: ${String(markError)}`);
			}
			return rotated ? {
				provider,
				model: modelId,
				result: "rotate_profile",
				reason: failoverReason,
				stage: "prompt"
			} : null;
		},
		maybeRetryTransient: async (retry) => {
			if (retry.reason !== "rate_limit" && retry.reason !== "overloaded" && retry.reason !== "server_error" && retry.reason !== "timeout") return false;
			if (transientRetryCount >= transientRetryBudget) return false;
			const nowMs = Date.now();
			transientRetryWindowStartMs ??= nowMs;
			const delayMs = resolveTransientRetryDelayMs({
				retryNumber: transientRetryCount + 1,
				retryAfterMs: retry.retryAfterMs,
				elapsedMs: nowMs - transientRetryWindowStartMs
			});
			if (delayMs === void 0) {
				log$3.warn(`transient retry window elapsed for ${sanitizeForLog(provider)}/${sanitizeForLog(modelId)} after ${transientRetryCount}/${transientRetryBudget} retries; failing over`);
				return false;
			}
			log$3.warn(`transient same-model retry ${transientRetryCount + 1}/${transientRetryBudget} for ${sanitizeForLog(provider)}/${sanitizeForLog(modelId)} reason=${retry.reason}: delayMs=${delayMs}`);
			await sleepForRetry(delayMs);
			transientRetryCount += 1;
			return true;
		}
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/run-settlement.ts
/** Publishes committed run accounting before retiring its runtime resources. */
async function settleEmbeddedRun(input) {
	const { runInput, runtime, compaction, ownedContextEngineLease } = input;
	const params = runInput.runParams;
	const committed = compaction.session.committedCompactionSuccessor;
	const originalWriter = compaction.session.sessionWriterFence;
	const target = committed?.sessionTarget ?? compaction.originalTarget;
	const counts = {
		count: compaction.state.autoCompactionCount,
		currentContextSnapshot: compaction.state.currentContextSnapshot ?? (compaction.state.autoCompactionCount > 0 ? { tokens: void 0 } : void 0)
	};
	const fact = compaction.durable && (committed || originalWriter) && target.agentId && target.sessionId && target.sessionKey && target.storePath ? {
		kind: "durable",
		...counts,
		...committed?.previousSessionId !== void 0 ? { previousSessionId: committed.previousSessionId } : {},
		target: {
			agentId: target.agentId,
			sessionId: committed?.entry.sessionId ?? target.sessionId,
			sessionKey: target.sessionKey,
			storePath: target.storePath,
			lifecycleRevision: committed ? committed.entry.lifecycleRevision : originalWriter?.expectedLifecycleRevision,
			activeWriterRunId: committed ? committed.entry.activeWriterRunId : originalWriter?.expectedWriterRunId
		}
	} : counts.count > 0 || counts.currentContextSnapshot ? {
		kind: "presentation-only",
		...counts
	} : void 0;
	if (params.onCompactionAccounting) params.onCompactionAccounting(fact);
	else if (fact?.kind === "durable" && fact.count > 0) try {
		await incrementCompactionCount({
			...fact.target,
			expectedSession: fact.target,
			amount: fact.count,
			tokensAfter: fact.currentContextSnapshot?.tokens,
			authorize: () => compaction.authority !== void 0 && getAdmittedRunDelegatedAuthority(runtime.admittedRunContext) === compaction.authority
		});
	} catch (error) {
		log$3.warn(`compaction accounting failed: ${formatErrorMessage(error)}`);
	}
	if (params.isFinalFallbackAttempt !== false) await runInput.progressController.maybeEmitFastModeAutoResetBestEffort();
	forgetPromptBuildDrainCacheForRun(params.runId);
	clearProviderPromptState(params.runId);
	runtime.stopRuntimeAuthRefreshTimer();
	if (ownedContextEngineLease) await runAgentCleanupStep({
		runId: params.runId,
		sessionId: params.sessionId,
		step: "context-engine-dispose",
		log: log$3,
		cleanup: async () => {
			await ownedContextEngineLease.dispose();
		}
	});
	if (params.cleanupBundleMcpOnRunEnd === true) await runAgentCleanupStep({
		runId: params.runId,
		sessionId: params.sessionId,
		step: "bundle-mcp-retire",
		log: log$3,
		cleanup: async () => {
			const onError = (errorLocal, sessionId) => {
				log$3.warn(`bundle-mcp cleanup failed after run for ${sessionId}: ${formatErrorMessage(errorLocal)}`);
			};
			if (!await retireSessionMcpRuntimeForSessionKey({
				sessionKey: params.sessionKey,
				reason: "embedded-run-end",
				preserveActiveLeases: true,
				onError
			})) await retireSessionMcpRuntime({
				sessionId: params.sessionId,
				reason: "embedded-run-end",
				preserveActiveLeases: true,
				onError
			});
		}
	});
}
//#endregion
//#region src/agents/runtime-auth-refresh.ts
/**
* Runtime auth refresh timer helper.
*
* Clamps refresh deadlines before they are passed to setTimeout.
*/
/** Clamp an auth refresh deadline to a safe setTimeout delay. */
function clampRuntimeAuthRefreshDelayMs(params) {
	return resolveSafeTimeoutDelayMs(params.refreshAt - params.now, { minMs: params.minDelayMs });
}
//#endregion
//#region src/agents/embedded-agent-runner/run/auth-controller.ts
/** Decides whether one automatic profile may bypass its current cooldown. */
function resolveEmbeddedAuthCooldownProbePolicy(params) {
	const autoProfileCandidates = params.profileCandidates.filter((candidate) => typeof candidate === "string" && candidate.length > 0 && candidate !== params.lockedProfileId);
	const allAutoProfilesInCooldown = autoProfileCandidates.length > 0 && autoProfileCandidates.every((candidate) => isProfileInCooldown(params.authStore, candidate, void 0, params.modelId));
	const unavailableReason = allAutoProfilesInCooldown ? resolveProfilesUnavailableReason({
		store: params.authStore,
		profileIds: autoProfileCandidates
	}) ?? "unknown" : null;
	const probeProfileIds = /* @__PURE__ */ new Set();
	if (params.allowTransientCooldownProbe && allAutoProfilesInCooldown && shouldUseTransientCooldownProbeSlot(unavailableReason)) for (const candidate of autoProfileCandidates) {
		const candidateReason = resolveProfilesUnavailableReason({
			store: params.authStore,
			profileIds: [candidate]
		}) ?? "unknown";
		if (shouldUseTransientCooldownProbeSlot(candidateReason)) probeProfileIds.add(candidate);
	}
	return {
		probeProfileIds,
		unavailableReason
	};
}
/**
* Coordinates auth profile selection, runtime auth preparation/refresh, and
* profile failover for one embedded run. State is injected through accessors so
* the runner can keep provider/model/auth snapshots in sync across retries.
*/
function createEmbeddedRunAuthController(params) {
	const baseRuntimeModel = params.getRuntimeModel();
	const baseEffectiveModel = params.getEffectiveModel();
	const commitPreparedModel = (preparedModel) => {
		preparedModel?.commit();
		if (preparedModel?.authRequirement) return;
		params.setRuntimeModel(baseRuntimeModel);
		params.setEffectiveModel(baseEffectiveModel);
	};
	const applyPreparedRuntimeRequestOverrides = (paramsForApply) => {
		const runtimeModel = applyPreparedRuntimeAuthToModel(paramsForApply.runtimeModel, paramsForApply.preparedAuth);
		if (runtimeModel === paramsForApply.runtimeModel) return;
		params.setRuntimeModel(runtimeModel);
		params.setEffectiveModel(applyPreparedRuntimeAuthToModel(params.getEffectiveModel(), paramsForApply.preparedAuth));
	};
	const hasRefreshableRuntimeAuth = () => Boolean(params.getRuntimeAuthState()?.sourceApiKey.trim());
	const nextRuntimeAuthGeneration = () => (params.getRuntimeAuthState()?.generation ?? 0) + 1;
	const prepareRuntimeAuthForModel = async (prepareParams) => {
		const preparedAuth = await prepareProviderRuntimeAuth({
			provider: prepareParams.runtimeModel.provider,
			config: params.config,
			workspaceDir: params.workspaceDir,
			env: process.env,
			context: {
				config: params.config,
				agentDir: params.agentDir,
				workspaceDir: params.workspaceDir,
				env: process.env,
				provider: prepareParams.runtimeModel.provider,
				modelId: params.getModelId(),
				model: prepareParams.runtimeModel,
				apiKey: unwrapSecretSentinelsForProviderEgress(prepareParams.apiKey, "provider runtime auth exchange"),
				authMode: prepareParams.authMode,
				profileId: prepareParams.profileId
			}
		});
		return protectPreparedProviderRuntimeAuth({
			provider: prepareParams.runtimeModel.provider,
			preparedAuth
		});
	};
	const clearRuntimeAuthRefreshTimer = () => {
		const runtimeAuthState = params.getRuntimeAuthState();
		if (!runtimeAuthState?.refreshTimer) return;
		clearTimeout(runtimeAuthState.refreshTimer);
		runtimeAuthState.refreshTimer = void 0;
	};
	const stopRuntimeAuthRefreshTimer = () => {
		if (!params.getRuntimeAuthState()) return;
		params.setRuntimeAuthRefreshCancelled(true);
		clearRuntimeAuthRefreshTimer();
	};
	const refreshRuntimeAuth = async (reason) => {
		const runtimeAuthState = params.getRuntimeAuthState();
		if (!runtimeAuthState) return;
		if (runtimeAuthState.refreshInFlight) {
			await runtimeAuthState.refreshInFlight;
			return;
		}
		const refreshGeneration = runtimeAuthState.generation;
		const refreshProfileId = runtimeAuthState.profileId;
		const refreshPromise = (async () => {
			const currentRuntimeAuthState = params.getRuntimeAuthState();
			const sourceApiKey = currentRuntimeAuthState?.sourceApiKey.trim() ?? "";
			if (!sourceApiKey) throw new Error(`Runtime auth refresh requires a source credential.`);
			const runtimeModel = params.getRuntimeModel();
			params.log.debug(`Refreshing runtime auth for ${runtimeModel.provider} (${reason})...`);
			const preparedAuth = await prepareRuntimeAuthForModel({
				runtimeModel,
				apiKey: sourceApiKey,
				authMode: currentRuntimeAuthState?.authMode ?? "unknown",
				profileId: currentRuntimeAuthState?.profileId
			});
			if (!preparedAuth?.apiKey) throw new Error(`Provider "${runtimeModel.provider}" does not support runtime auth refresh.`);
			const activeRuntimeAuthState = params.getRuntimeAuthState();
			if (!activeRuntimeAuthState || activeRuntimeAuthState.generation !== refreshGeneration || activeRuntimeAuthState.profileId !== refreshProfileId || activeRuntimeAuthState.sourceApiKey.trim() !== sourceApiKey) {
				params.log.debug(`Ignoring stale runtime auth refresh for ${runtimeModel.provider}; auth state advanced before ${reason} refresh completed.`);
				return;
			}
			params.authStorage.setRuntimeApiKey(runtimeModel.provider, preparedAuth.apiKey);
			applyPreparedRuntimeRequestOverrides({
				runtimeModel,
				preparedAuth
			});
			params.setRuntimeAuthState({
				...activeRuntimeAuthState,
				expiresAt: preparedAuth.expiresAt
			});
			if (preparedAuth.expiresAt) {
				const remaining = preparedAuth.expiresAt - Date.now();
				params.log.debug(`Runtime auth refreshed for ${runtimeModel.provider}; expires in ${Math.max(0, Math.floor(remaining / 1e3))}s.`);
			}
		})().catch((err) => {
			const runtimeModel = params.getRuntimeModel();
			params.log.warn(`Runtime auth refresh failed for ${runtimeModel.provider}: ${formatErrorMessage(err)}`);
			throw err;
		}).finally(() => {
			const activeState = params.getRuntimeAuthState();
			if (activeState && activeState.generation === refreshGeneration && activeState.refreshInFlight === refreshPromise) activeState.refreshInFlight = void 0;
		});
		runtimeAuthState.refreshInFlight = refreshPromise;
		await refreshPromise;
	};
	const scheduleRuntimeAuthRefresh = () => {
		const runtimeAuthState = params.getRuntimeAuthState();
		if (!runtimeAuthState || params.getRuntimeAuthRefreshCancelled()) return;
		const runtimeModel = params.getRuntimeModel();
		if (!hasRefreshableRuntimeAuth()) {
			params.log.warn(`Skipping runtime auth refresh scheduling for ${runtimeModel.provider}; source credential missing.`);
			return;
		}
		if (!runtimeAuthState.expiresAt) return;
		clearRuntimeAuthRefreshTimer();
		const now = Date.now();
		const delayMs = clampRuntimeAuthRefreshDelayMs({
			refreshAt: runtimeAuthState.expiresAt - RUNTIME_AUTH_REFRESH_MARGIN_MS,
			now,
			minDelayMs: RUNTIME_AUTH_REFRESH_MIN_DELAY_MS
		});
		const timer = setTimeout(() => {
			if (params.getRuntimeAuthRefreshCancelled()) return;
			refreshRuntimeAuth("scheduled").then(() => scheduleRuntimeAuthRefresh()).catch(() => {
				if (params.getRuntimeAuthRefreshCancelled()) return;
				const retryTimer = setTimeout(() => {
					if (params.getRuntimeAuthRefreshCancelled()) return;
					refreshRuntimeAuth("scheduled-retry").then(() => scheduleRuntimeAuthRefresh()).catch(() => void 0);
				}, RUNTIME_AUTH_REFRESH_RETRY_MS);
				const activeRuntimeAuthState = params.getRuntimeAuthState();
				if (activeRuntimeAuthState) activeRuntimeAuthState.refreshTimer = retryTimer;
				if (params.getRuntimeAuthRefreshCancelled() && activeRuntimeAuthState) {
					clearTimeout(retryTimer);
					activeRuntimeAuthState.refreshTimer = void 0;
				}
			});
		}, delayMs);
		runtimeAuthState.refreshTimer = timer;
		if (params.getRuntimeAuthRefreshCancelled()) {
			clearTimeout(timer);
			runtimeAuthState.refreshTimer = void 0;
		}
	};
	const resolveAuthProfileFailoverReason = (failoverParams) => {
		if (failoverParams.allInCooldown) {
			const profileIds = (failoverParams.profileIds ?? params.profileCandidates).filter((id) => typeof id === "string" && id.length > 0);
			return resolveProfilesUnavailableReason({
				store: params.authStore,
				profileIds
			}) ?? "unknown";
		}
		return classifyFailoverReason(failoverParams.message, { provider: params.getProvider() }) ?? "auth";
	};
	const recordOAuthRefreshFailure = async (candidate, error) => {
		if (!(error instanceof OAuthRefreshFailureError)) return;
		const profileId = error.profileId ?? candidate;
		const provider = error.provider || params.getProvider();
		const errorText = formatErrorMessage(error);
		params.log.warn(`auth profile "${profileId ?? "(unknown)"}" failed for provider "${provider}": ${errorText}`);
		if (!profileId || params.authProfileStateMode === "read-only") return;
		const reason = resolveAuthProfileFailureReason({
			failoverReason: resolveAuthProfileFailoverReason({
				allInCooldown: false,
				message: errorText
			}),
			policy: params.authProfileFailurePolicy
		});
		if (!reason) return;
		try {
			await markAuthProfileFailure({
				store: params.authStore,
				profileId,
				reason,
				cfg: params.config,
				agentDir: params.agentDir,
				runId: params.runId,
				modelId: params.getModelId()
			});
		} catch (markError) {
			params.log.warn(`auth profile "${profileId}" failure bookkeeping failed for provider "${provider}": ${formatErrorMessage(markError)}`);
		}
	};
	const throwAuthProfileFailover = (failoverParams) => {
		const provider = params.getProvider();
		const modelId = params.getModelId();
		const messageForReason = failoverParams.message?.trim() || (failoverParams.error ? formatErrorMessage(failoverParams.error).trim() : "");
		const reason = resolveAuthProfileFailoverReason({
			allInCooldown: failoverParams.allInCooldown,
			message: messageForReason,
			profileIds: params.profileCandidates
		});
		const message = failoverParams.message?.trim() || renderAuthProfileFailoverCopy({
			reason,
			provider,
			allInCooldown: failoverParams.allInCooldown,
			causeText: failoverParams.error ? formatErrorMessage(failoverParams.error).trim() : void 0,
			recoveryHint: buildProviderAuthRecoveryHint({
				provider,
				config: params.config,
				workspaceDir: params.workspaceDir,
				env: process.env
			})
		});
		if (params.fallbackConfigured) {
			const authMode = reason === "billing" || reason === "auth" || reason === "auth_permanent" || reason === "session_expired" ? resolveSubscriptionAuthModeForProfiles({
				store: params.authStore,
				profileIds: failoverParams.allInCooldown ? params.profileCandidates : [params.profileCandidates[params.getProfileIndex()]]
			}) : void 0;
			throw new FailoverError(message, {
				reason,
				provider,
				model: modelId,
				authMode,
				status: resolveFailoverStatus(reason),
				code: failoverParams.error ? getFailoverErrorCode(failoverParams.error) : void 0,
				authProfileFailure: { allInCooldown: failoverParams.allInCooldown },
				cause: failoverParams.error
			});
		}
		if (failoverParams.error instanceof Error) throw failoverParams.error;
		throw new Error(message);
	};
	const resolveApiKeyForCandidate = async (candidate, model = params.getRuntimeModel(), allowAuthProfileFallback) => {
		return getApiKeyForModelCore({
			model,
			cfg: params.config,
			profileId: candidate,
			store: params.authStore,
			agentDir: params.agentDir,
			workspaceDir: params.workspaceDir,
			lockedProfile: candidate != null && candidate === params.lockedProfileId,
			allowAuthProfileFallback,
			secretSentinels: true
		});
	};
	const applyApiKeyInfo = async (candidate, attemptIndex) => {
		const preparedModel = await params.prepareModelForAuthProfile?.(candidate, attemptIndex);
		const apiKeyInfo = await resolveApiKeyForCandidate(candidate, preparedModel?.runtimeModel, preparedModel?.allowAuthProfileFallback);
		if (preparedModel?.authRequirement && !providerModelRouteAcceptsAuthMode({
			requirement: preparedModel.authRequirement,
			mode: apiKeyInfo.mode ?? (apiKeyInfo.apiKey ? "api-key" : void 0)
		})) throw new Error(`Resolved ${apiKeyInfo.mode ?? "unknown"} credentials are incompatible with the selected ${preparedModel.authRequirement} route for ${preparedModel.runtimeModel.provider}.`);
		params.setApiKeyInfo(apiKeyInfo);
		const resolvedProfileId = apiKeyInfo.profileId ?? candidate;
		if (!apiKeyInfo.apiKey) {
			if (apiKeyInfo.mode !== "aws-sdk") {
				const runtimeModel = preparedModel?.runtimeModel ?? params.getRuntimeModel();
				throw new MissingProviderAuthError(runtimeModel.provider, apiKeyInfo);
			}
			commitPreparedModel(preparedModel);
			const runtimeModel = params.getRuntimeModel();
			const AWS_SDK_AUTH_SENTINEL = "__aws_sdk_auth__";
			try {
				const preparedAuth = await prepareRuntimeAuthForModel({
					runtimeModel,
					apiKey: AWS_SDK_AUTH_SENTINEL,
					authMode: apiKeyInfo.mode,
					profileId: apiKeyInfo.profileId
				});
				applyPreparedRuntimeRequestOverrides({
					runtimeModel,
					preparedAuth: preparedAuth ?? {}
				});
				if (preparedAuth?.apiKey) {
					clearRuntimeAuthRefreshTimer();
					params.authStorage.setRuntimeApiKey(runtimeModel.provider, preparedAuth.apiKey);
					params.setRuntimeAuthState({
						generation: nextRuntimeAuthGeneration(),
						sourceApiKey: AWS_SDK_AUTH_SENTINEL,
						authMode: apiKeyInfo.mode,
						profileId: resolvedProfileId,
						expiresAt: preparedAuth.expiresAt
					});
					if (preparedAuth.expiresAt) scheduleRuntimeAuthRefresh();
					params.setLastProfileId(resolvedProfileId);
					return;
				}
			} catch (error) {
				params.log.warn(`prepareProviderRuntimeAuth failed for ${runtimeModel.provider}, falling back to sentinel: ${formatErrorMessage(error)}`);
			}
			clearRuntimeAuthRefreshTimer();
			params.authStorage.setRuntimeApiKey(runtimeModel.provider, AWS_SDK_AUTH_SENTINEL);
			params.setRuntimeAuthState(null);
			params.setLastProfileId(resolvedProfileId);
			return;
		}
		commitPreparedModel(preparedModel);
		let runtimeAuthHandled = false;
		const runtimeModel = params.getRuntimeModel();
		const preparedAuth = await prepareRuntimeAuthForModel({
			runtimeModel,
			apiKey: apiKeyInfo.apiKey,
			authMode: apiKeyInfo.mode,
			profileId: apiKeyInfo.profileId
		});
		applyPreparedRuntimeRequestOverrides({
			runtimeModel,
			preparedAuth: preparedAuth ?? {}
		});
		if (preparedAuth?.apiKey) {
			clearRuntimeAuthRefreshTimer();
			params.authStorage.setRuntimeApiKey(runtimeModel.provider, preparedAuth.apiKey);
			params.setRuntimeAuthState({
				generation: nextRuntimeAuthGeneration(),
				sourceApiKey: apiKeyInfo.apiKey,
				authMode: apiKeyInfo.mode,
				profileId: apiKeyInfo.profileId,
				expiresAt: preparedAuth.expiresAt
			});
			if (preparedAuth.expiresAt) scheduleRuntimeAuthRefresh();
			runtimeAuthHandled = true;
		}
		if (!runtimeAuthHandled) {
			clearRuntimeAuthRefreshTimer();
			params.authStorage.setRuntimeApiKey(runtimeModel.provider, apiKeyInfo.apiKey);
			params.setRuntimeAuthState(null);
		}
		params.setLastProfileId(apiKeyInfo.profileId);
	};
	const advanceAuthProfile = async () => {
		let nextIndex = params.getProfileIndex() + 1;
		while (nextIndex < params.profileCandidates.length) {
			const candidateIndex = nextIndex++;
			const candidate = params.profileCandidates[candidateIndex];
			params.setProfileIndex(candidateIndex);
			if (candidate && isProfileInCooldown(params.authStore, candidate, void 0, params.getModelId())) continue;
			try {
				await applyApiKeyInfo(candidate, candidateIndex);
				params.setThinkLevel(params.initialThinkLevel);
				params.attemptedThinking.clear();
				return true;
			} catch (err) {
				if (err instanceof SecretSurfaceUnavailableError) throw err;
				await recordOAuthRefreshFailure(candidate, err);
			}
		}
		params.setProfileIndex(params.profileCandidates.length);
		return false;
	};
	const initializeAuthProfile = async () => {
		try {
			const modelId = params.getModelId();
			const cooldownProbePolicy = resolveEmbeddedAuthCooldownProbePolicy({
				authStore: params.authStore,
				profileCandidates: params.profileCandidates,
				lockedProfileId: params.lockedProfileId,
				modelId,
				allowTransientCooldownProbe: params.allowTransientCooldownProbe
			});
			let didTransientCooldownProbe = false;
			while (params.getProfileIndex() < params.profileCandidates.length) {
				const candidate = params.profileCandidates[params.getProfileIndex()];
				if (candidate && isProfileInCooldown(params.authStore, candidate, void 0, modelId)) {
					if (!didTransientCooldownProbe && cooldownProbePolicy.probeProfileIds.has(candidate)) {
						didTransientCooldownProbe = true;
						params.log.warn(`probing cooldowned auth profile for ${params.getProvider()}/${modelId} due to ${cooldownProbePolicy.unavailableReason ?? "transient"} unavailability`);
					} else {
						params.setProfileIndex(params.getProfileIndex() + 1);
						continue;
					}
				}
				await applyApiKeyInfo(params.profileCandidates[params.getProfileIndex()], params.getProfileIndex());
				break;
			}
			if (params.getProfileIndex() >= params.profileCandidates.length) throwAuthProfileFailover({ allInCooldown: true });
		} catch (err) {
			if (err instanceof FailoverError || err instanceof SecretSurfaceUnavailableError) throw err;
			await recordOAuthRefreshFailure(params.profileCandidates[params.getProfileIndex()], err);
			if (!await advanceAuthProfile()) throwAuthProfileFailover({
				allInCooldown: false,
				error: err
			});
		}
	};
	const maybeRefreshRuntimeAuthForAuthError = async (errorText, retried) => {
		if (!params.getRuntimeAuthState() || retried) return false;
		if (!isFailoverErrorMessage(errorText, { provider: params.getProvider() })) return false;
		if (classifyFailoverReason(errorText, { provider: params.getProvider() }) !== "auth") return false;
		try {
			await refreshRuntimeAuth("auth-error");
			scheduleRuntimeAuthRefresh();
			return true;
		} catch {
			return false;
		}
	};
	return {
		applyAuthProfileCandidate: applyApiKeyInfo,
		advanceAuthProfile,
		initializeAuthProfile,
		maybeRefreshRuntimeAuthForAuthError,
		stopRuntimeAuthRefreshTimer
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/auth-plan.ts
function loadEmbeddedRunAuthProfileStore(params) {
	return ensureAuthProfileStore(params.agentDir, {
		config: params.config,
		externalCliProviderIds: params.externalCliProviderIds,
		allowKeychainPrompt: false
	});
}
async function prepareEmbeddedRunAuthPlan(params) {
	const runParams = params.runParams;
	const usesOpenAIAuthRouting = params.provider === OPENAI_PROVIDER_ID;
	const initialPluginHarnessOwnsTransport = params.getAgentHarness().id !== "openclaw";
	const openClawNativeCodexResponsesNeedsAuthBootstrap = !initialPluginHarnessOwnsTransport && usesOpenAIAuthRouting && params.getEffectiveModel().api === "openai-chatgpt-responses";
	let externalCliAuthScope = initialPluginHarnessOwnsTransport ? { ignoreAutoPreferredProfile: false } : openClawNativeCodexResponsesNeedsAuthBootstrap ? {
		providerIds: [OPENAI_PROVIDER_ID],
		ignoreAutoPreferredProfile: false
	} : resolveExternalCliAuthOverlayScopeFromSelection({
		provider: params.provider,
		cfg: runParams.config,
		agentId: runParams.agentId,
		modelId: params.modelId,
		workspaceDir: params.workspaceDir,
		userPinnedAuthProfileId: runParams.authProfileIdSource === "user" ? runParams.authProfileId : void 0
	});
	let noExternalAuthStore;
	if (!initialPluginHarnessOwnsTransport && !externalCliAuthScope.providerIds) {
		noExternalAuthStore = ensureAuthProfileStoreWithoutExternalProfiles(params.agentDir, { allowKeychainPrompt: false });
		externalCliAuthScope = resolveExternalCliAuthOverlayScopeFromSelection({
			provider: params.provider,
			cfg: runParams.config,
			agentId: runParams.agentId,
			modelId: params.modelId,
			workspaceDir: params.workspaceDir,
			store: noExternalAuthStore,
			userPinnedAuthProfileId: runParams.authProfileIdSource === "user" ? runParams.authProfileId : void 0
		});
	}
	params.markStage?.("scope");
	const attemptAuthProfileStore = usesOpenAIAuthRouting ? loadEmbeddedRunAuthProfileStore({
		agentDir: params.agentDir,
		config: runParams.config,
		externalCliProviderIds: [OPENAI_PROVIDER_ID]
	}) : initialPluginHarnessOwnsTransport ? ensureAuthProfileStoreWithoutExternalProfiles(params.agentDir, { allowKeychainPrompt: false }) : externalCliAuthScope.providerIds ? loadEmbeddedRunAuthProfileStore({
		agentDir: params.agentDir,
		config: runParams.config,
		externalCliProviderIds: externalCliAuthScope.providerIds
	}) : noExternalAuthStore ?? ensureAuthProfileStoreWithoutExternalProfiles(params.agentDir, { allowKeychainPrompt: false });
	params.markStage?.("store");
	const requestedProfileId = runParams.authProfileId?.trim() || void 0;
	const lockedProfileId = runParams.authProfileIdSource === "user" ? requestedProfileId : void 0;
	const preferredProfileId = externalCliAuthScope.ignoreAutoPreferredProfile && !lockedProfileId ? void 0 : requestedProfileId;
	const createAuthPreparation = () => {
		const harness = params.getAgentHarness();
		return prepareAgentRuntimeAuth({
			provider: params.provider,
			modelId: params.modelId,
			modelApi: params.model.api,
			modelBaseUrl: params.model.baseUrl,
			requestTransportOverrides: params.requestStreamTransportOverrides,
			config: runParams.config,
			env: process.env,
			agentDir: params.agentDir,
			workspaceDir: params.workspaceDir,
			metadataSnapshot: params.preparedModelRuntime?.metadataSnapshot,
			authProfileStore: attemptAuthProfileStore,
			sessionAuthProfileId: preferredProfileId,
			sessionAuthProfileSource: runParams.authProfileIdSource,
			harnessId: harness.id,
			harnessRuntime: harness.id,
			harnessAuthBootstrap: harness.authBootstrap,
			allowHarnessAuthProfileForwarding: true,
			allowTransientCooldownProbe: runParams.allowTransientCooldownProbe === true,
			resolveProviderPreferredProfileId: (context) => resolveProviderAuthProfileId({
				provider: params.provider,
				config: runParams.config,
				workspaceDir: params.workspaceDir,
				env: process.env,
				context
			})
		});
	};
	const providerUsesProfileScopedModelMetadata = providerUsesCredentialScopedModelMetadata({
		provider: params.provider,
		modelId: params.modelId,
		config: runParams.config,
		agentDir: params.agentDir,
		workspaceDir: params.workspaceDir
	});
	const { materialize: materializeAuthPlan, materializeUncached: materializeAuthPlanUncached } = createPreparedRuntimeModelMaterializer({
		provider: params.provider,
		modelId: params.modelId,
		config: runParams.config,
		getModel: params.getRuntimeModel,
		nativeModelOwned: params.nativeModelOwned,
		requestedProfileId: runParams.authProfileId,
		providerUsesProfileScopedModelMetadata,
		resolveModel: ({ config, authProfileId, authProfileMode }) => resolveModelAsync(params.provider, params.modelId, params.agentDir, config, {
			authStorage: params.authStorage,
			modelRegistry: params.modelRegistry,
			skipAgentDiscovery: true,
			allowBundledStaticCatalogFallback: true,
			preferBundledStaticCatalogTransport: true,
			preparedModelRuntime: params.preparedModelRuntime,
			workspaceDir: params.workspaceDir,
			authProfileId,
			authProfileMode
		})
	});
	let resolvedAuthPreparation = createAuthPreparation();
	let preparedAuthAttempts = resolvedAuthPreparation.attempts;
	let activePreparedAuthPlan = resolvedAuthPreparation.plan;
	params.applyResolvedRuntimeModel(await materializeAuthPlan(activePreparedAuthPlan));
	params.markStage?.("prepare-plan");
	const finalizedHarness = params.selectHarnessForPreparedAttempts(params.getEffectiveModel(), preparedAuthAttempts);
	if (finalizedHarness.id !== params.getAgentHarness().id) {
		params.setAgentHarness(finalizedHarness);
		resolvedAuthPreparation = createAuthPreparation();
		preparedAuthAttempts = resolvedAuthPreparation.attempts;
		activePreparedAuthPlan = resolvedAuthPreparation.plan;
		params.applyResolvedRuntimeModel(await materializeAuthPlan(activePreparedAuthPlan));
		if (params.selectHarnessForPreparedAttempts(params.getEffectiveModel(), preparedAuthAttempts).id !== params.getAgentHarness().id) throw new Error(`Prepared auth route did not converge on one agent harness for ${params.provider}/${params.modelId}.`);
	}
	params.markStage?.("harness");
	return {
		usesOpenAIAuthRouting,
		attemptAuthProfileStore,
		lockedProfileId,
		preferredProfileId,
		providerUsesProfileScopedModelMetadata,
		materializeAuthPlan,
		materializeAuthPlanUncached,
		preparedAuthAttempts,
		activePreparedAuthPlan
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/model-harness.ts
function resolveEmbeddedRunEffectiveModel(params) {
	const contextConfigProvider = resolveContextConfigProviderForRuntime({
		provider: params.modelConfigProvider,
		runtimeId: params.agentHarnessId,
		config: params.runParams.config
	});
	const resolved = resolveEmbeddedRuntimeModelPolicy({
		cfg: params.runParams.config,
		provider: params.provider,
		contextConfigProvider,
		modelId: params.modelId,
		runtimeModel: params.runtimeModel,
		nativeModelOwned: params.nativeModelOwned,
		...params.runParams.contextWindow ? { contextWindow: params.runParams.contextWindow } : {}
	});
	const authoredContextTokenCap = params.agentHarnessId === "openclaw" ? void 0 : resolveAuthoredModelContextTokens({
		cfg: params.runParams.config,
		provider: contextConfigProvider,
		model: params.modelId
	});
	return {
		...resolved,
		...authoredContextTokenCap === void 0 ? {} : { authoredContextTokenCap }
	};
}
function buildHarnessModelProvider(params) {
	const route = params.plan?.modelRoute;
	const routeSupport = resolveAgentHarnessPreparedRouteSupport(params.plan);
	const requestTransportOverrides = params.requestStreamTransportOverrides ?? routeSupport.requestTransportOverrides;
	return {
		api: route?.api ?? params.model.api,
		baseUrl: route?.baseUrl ?? params.model.baseUrl,
		...requestTransportOverrides ? { requestTransportOverrides } : {},
		...routeSupport.runtimePolicy ? { runtimePolicy: routeSupport.runtimePolicy } : {},
		...params.plan ? { preparedAuth: resolveAgentHarnessPreparedAuthSupport({
			plan: params.plan,
			...params.preparedAuthAttempt?.kind === "profile" || params.preparedAuthAttempt?.kind === "direct" ? { source: params.preparedAuthAttempt.kind } : {}
		}) } : {}
	};
}
function assertPinnedHarness(nativeModelOwnedHarnessId, selected, subject) {
	if (nativeModelOwnedHarnessId && selected.id !== nativeModelOwnedHarnessId) throw new Error(`${subject} changed the session-pinned agent harness from "${nativeModelOwnedHarnessId}" to "${selected.id}".`);
}
function selectEmbeddedRunHarness(params) {
	const selected = selectAgentHarness({
		provider: params.provider,
		modelId: params.modelId,
		modelProvider: buildHarnessModelProvider(params),
		config: params.runParams.config,
		agentId: params.runParams.agentId,
		sessionKey: params.runParams.sessionKey,
		agentHarnessId: params.runParams.agentHarnessId,
		agentHarnessRuntimeOverride: params.runParams.agentHarnessRuntimeOverride
	});
	assertPinnedHarness(params.nativeModelOwnedHarnessId, selected, "Prepared model route");
	return selected;
}
function selectEmbeddedRunHarnessForPreparedAttempts(params) {
	const selected = selectAgentHarnessForPreparedModelProviders({
		provider: params.provider,
		modelId: params.modelId,
		modelProviders: params.attempts.map((attempt) => {
			const route = attempt.plan.modelRoute;
			const model = route ? {
				...params.model,
				api: route.api,
				baseUrl: route.baseUrl
			} : params.model;
			return buildHarnessModelProvider({
				...params,
				model,
				plan: attempt.plan,
				preparedAuthAttempt: attempt
			});
		}),
		config: params.runParams.config,
		agentId: params.runParams.agentId,
		sessionKey: params.runParams.sessionKey,
		agentHarnessId: params.runParams.agentHarnessId,
		agentHarnessRuntimeOverride: params.runParams.agentHarnessRuntimeOverride
	});
	assertPinnedHarness(params.nativeModelOwnedHarnessId, selected, "Prepared auth routes");
	return selected;
}
//#endregion
//#region src/agents/embedded-agent-runner/run/model-setup.ts
async function resolveEmbeddedRunModelSetup(params) {
	const runParams = params.runParams;
	const hookSelection = await resolveHookModelSelection({
		prompt: runParams.prompt,
		attachments: buildBeforeModelResolveAttachments(runParams.images),
		provider: params.provider,
		modelId: params.modelId,
		modelSelectionLocked: runParams.modelSelectionLocked,
		hookRunner: params.hookRunner,
		hookContext: params.hookContext
	});
	const modelSelectionChangedByHook = hookSelection.provider !== params.provider || hookSelection.modelId !== params.modelId;
	let provider = hookSelection.provider;
	const modelId = hookSelection.modelId;
	const requestedModelId = modelId;
	const requestStreamTransportOverrides = resolveRequestStreamTransportOverrides(runParams.streamParams);
	params.onHooksResolved();
	await ensureSelectedAgentHarnessPlugin({
		provider,
		modelId,
		config: runParams.config,
		agentId: runParams.agentId,
		sessionKey: runParams.sessionKey,
		agentHarnessId: runParams.agentHarnessId,
		agentHarnessRuntimeOverride: runParams.agentHarnessRuntimeOverride,
		requestTransportOverrides: requestStreamTransportOverrides,
		workspaceDir: params.workspaceDir,
		pluginRegistry: params.preparedModelRuntime?.pluginRegistry ?? requireActivePluginRegistry()
	});
	const agentHarness = selectAgentHarness({
		provider,
		modelId,
		...requestStreamTransportOverrides ? { modelProvider: { requestTransportOverrides: requestStreamTransportOverrides } } : {},
		config: runParams.config,
		agentId: runParams.agentId,
		sessionKey: runParams.sessionKey,
		agentHarnessId: runParams.agentHarnessId,
		agentHarnessRuntimeOverride: runParams.agentHarnessRuntimeOverride
	});
	const pluginHarnessOwnsTransport = agentHarness.id !== "openclaw";
	const expectedHarnessArtifact = runParams.expectedAgentHarnessRuntimeArtifact;
	if (expectedHarnessArtifact && expectedHarnessArtifact.harnessId !== agentHarness.id) throw new Error(`Verified inference requires agent harness ${expectedHarnessArtifact.harnessId}, but ${agentHarness.id} was selected.`);
	if (expectedHarnessArtifact && !agentHarness.runtimeArtifact) throw new Error(`Agent harness ${agentHarness.id} cannot attest the verified inference runtime artifact.`);
	const nativeModelOwnedHarnessId = resolveNativeModelOwnedHarnessId({
		agentHarnessId: runParams.agentHarnessId,
		modelSelectionLocked: runParams.modelSelectionLocked,
		selectedHarnessId: agentHarness.id
	});
	const nativeModelOwned = nativeModelOwnedHarnessId !== void 0;
	const modelConfigProvider = provider;
	let resolvedModelProvider = provider;
	let modelResolution;
	if (nativeModelOwned) modelResolution = {
		model: createNativeModelOwnedRuntimeModel({
			provider,
			modelId
		}),
		...createEmptyAgentDiscoveryStores()
	};
	else {
		const selectedRuntimeProvider = resolveSelectedOpenAIRuntimeProvider({
			provider,
			harnessRuntime: agentHarness.id,
			agentHarnessId: agentHarness.id,
			authProfileProvider: runParams.authProfileId?.split(":", 1)[0],
			authProfileId: runParams.authProfileId,
			config: runParams.config,
			workspaceDir: params.workspaceDir
		});
		const tieredResolution = await resolveTieredModel({
			provider: selectedRuntimeProvider,
			...selectedRuntimeProvider !== provider ? { fallbackProvider: provider } : {},
			modelId,
			agentDir: params.agentDir,
			config: runParams.config,
			workspaceDir: params.workspaceDir,
			authProfileId: runParams.authProfileId,
			preparedModelRuntime: params.preparedModelRuntime,
			staticCatalogOwnsTransport: pluginHarnessOwnsTransport
		});
		resolvedModelProvider = tieredResolution.provider;
		modelResolution = tieredResolution.resolution;
	}
	if (!modelResolution) throw new FailoverError(`Unknown model: ${provider}/${modelId}`, {
		reason: "model_not_found",
		provider,
		model: modelId,
		sessionId: runParams.sessionId,
		lane: params.globalLane
	});
	provider = resolvedModelProvider;
	const { model, error, authStorage, modelRegistry } = modelResolution;
	if (!model) throw new FailoverError(error ?? `Unknown model: ${provider}/${modelId}`, {
		reason: "model_not_found",
		provider,
		model: modelId,
		sessionId: runParams.sessionId,
		lane: params.globalLane
	});
	return {
		provider,
		modelId,
		requestedModelId,
		modelSelectionChangedByHook,
		requestStreamTransportOverrides,
		expectedHarnessArtifact,
		agentHarness,
		pluginHarnessOwnsTransport,
		nativeModelOwnedHarnessId,
		nativeModelOwned,
		modelConfigProvider,
		model,
		authStorage,
		modelRegistry
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/runtime-preparation.ts
async function prepareEmbeddedRunRuntime(input) {
	const params = input.runParams;
	let provider = input.provider;
	let modelId = input.modelId;
	const modelSetup = await resolveEmbeddedRunModelSetup({
		runParams: params,
		provider,
		modelId,
		agentDir: input.agentDir,
		workspaceDir: input.workspaceDir,
		globalLane: input.globalLane,
		hookRunner: input.hookRunner,
		hookContext: input.hookContext,
		onHooksResolved: () => input.markStartupStage("hooks"),
		preparedModelRuntime: input.preparedModelRuntime
	});
	provider = modelSetup.provider;
	modelId = modelSetup.modelId;
	const pluginMetadataSnapshot = input.preparedModelRuntime?.metadataSnapshot;
	const { requestedModelId, modelSelectionChangedByHook, requestStreamTransportOverrides, expectedHarnessArtifact, nativeModelOwnedHarnessId, nativeModelOwned, modelConfigProvider, model, authStorage, modelRegistry } = modelSetup;
	let agentHarness = modelSetup.agentHarness;
	let pluginHarnessOwnsTransport = modelSetup.pluginHarnessOwnsTransport;
	let runtimeModel = model;
	let preparedThinkingCapabilityReady = false;
	const resolveEffectiveModel = (candidate) => resolveEmbeddedRunEffectiveModel({
		runParams: params,
		provider,
		modelConfigProvider,
		modelId,
		agentHarnessId: agentHarness.id,
		runtimeModel: candidate,
		nativeModelOwned,
		requestStreamTransportOverrides,
		nativeModelOwnedHarnessId
	});
	const initialResolvedRuntimeModel = resolveEffectiveModel(runtimeModel);
	let contextTokenBudget = initialResolvedRuntimeModel.contextTokenBudget;
	let authoredContextTokenCap = initialResolvedRuntimeModel.authoredContextTokenCap;
	let contextWindowInfo = initialResolvedRuntimeModel.contextWindowInfo;
	let outerContextTokenMeta = contextTokenBudget === void 0 ? {} : { contextTokens: contextTokenBudget };
	let effectiveModel = initialResolvedRuntimeModel.effectiveModel;
	const applyResolvedRuntimeModel = (candidate, resolvedCandidate) => {
		const preparedThinkingCompat = preparedThinkingCapabilityReady ? resolvePreparedModelThinkingCompat({
			capability: params.modelThinkingCapability,
			model: candidate,
			agentRuntime: agentHarness.id
		}) : void 0;
		const resolvedModel = preparedThinkingCompat ? {
			...candidate,
			compat: {
				...candidate.compat,
				...preparedThinkingCompat
			}
		} : candidate;
		const resolved = resolvedModel === candidate && resolvedCandidate ? resolvedCandidate : resolveEffectiveModel(resolvedModel);
		runtimeModel = resolvedModel;
		effectiveModel = resolved.effectiveModel;
		contextTokenBudget = resolved.contextTokenBudget;
		authoredContextTokenCap = resolved.authoredContextTokenCap;
		contextWindowInfo = resolved.contextWindowInfo;
		outerContextTokenMeta = contextTokenBudget === void 0 ? {} : { contextTokens: contextTokenBudget };
	};
	const selectHarnessForModel = (candidate, plan, preparedAuthAttempt) => selectEmbeddedRunHarness({
		runParams: params,
		provider,
		modelId,
		model: candidate,
		plan,
		preparedAuthAttempt,
		requestStreamTransportOverrides,
		nativeModelOwnedHarnessId
	});
	const selectHarnessForPreparedAttempts = (candidate, attempts) => selectEmbeddedRunHarnessForPreparedAttempts({
		runParams: params,
		provider,
		modelId,
		model: candidate,
		attempts,
		requestStreamTransportOverrides,
		nativeModelOwnedHarnessId
	});
	input.markStartupStage("model-resolution");
	input.notifyExecutionPhase("model_resolution", {
		provider,
		model: modelId
	});
	agentHarness = selectHarnessForModel(effectiveModel);
	pluginHarnessOwnsTransport = agentHarness.id !== "openclaw";
	const authStages = log$3.isEnabled("trace") ? createEmbeddedRunStageTracker() : void 0;
	const preparedAuthPlan = await prepareEmbeddedRunAuthPlan({
		runParams: params,
		provider,
		modelId,
		model,
		agentDir: input.agentDir,
		workspaceDir: input.workspaceDir,
		requestStreamTransportOverrides,
		nativeModelOwned,
		authStorage,
		modelRegistry,
		preparedModelRuntime: input.preparedModelRuntime,
		getAgentHarness: () => agentHarness,
		setAgentHarness: (nextHarness) => {
			agentHarness = nextHarness;
			pluginHarnessOwnsTransport = agentHarness.id !== "openclaw";
		},
		getRuntimeModel: () => runtimeModel,
		getEffectiveModel: () => effectiveModel,
		applyResolvedRuntimeModel,
		selectHarnessForPreparedAttempts,
		markStage: (stage) => authStages?.mark(stage)
	});
	const { attemptAuthProfileStore, lockedProfileId, preferredProfileId, providerUsesProfileScopedModelMetadata, materializeAuthPlan, materializeAuthPlanUncached, preparedAuthAttempts } = preparedAuthPlan;
	let { activePreparedAuthPlan } = preparedAuthPlan;
	preparedThinkingCapabilityReady = true;
	applyResolvedRuntimeModel(runtimeModel);
	const genericCompactionRecoveryAllowed = !pluginHarnessOwnsTransport;
	const profileCandidates = preparedAuthAttempts.map((attempt) => attempt.profileId);
	const forwardedPluginHarnessProfileId = pluginHarnessOwnsTransport ? activePreparedAuthPlan.forwardedAuthProfileId : void 0;
	let profileIndex = 0;
	const requestedThinkLevel = resolveInitialThinkLevel({
		requested: params.thinkLevel,
		config: params.config,
		provider,
		modelId,
		model: effectiveModel
	});
	const initialThinkLevel = modelSelectionChangedByHook ? resolveCandidateThinkingLevel({
		cfg: params.config,
		provider,
		modelId,
		level: requestedThinkLevel,
		catalog: [{
			provider,
			id: modelId,
			api: effectiveModel.api,
			reasoning: effectiveModel.reasoning,
			params: effectiveModel.params,
			compat: effectiveModel.compat
		}],
		agentId: params.agentId,
		sessionKey: params.sessionKey,
		agentRuntime: agentHarness.id
	}) ?? requestedThinkLevel : requestedThinkLevel;
	let thinkLevel = initialThinkLevel;
	const attemptedThinking = /* @__PURE__ */ new Set();
	let apiKeyInfo = null;
	let lastProfileId;
	let runtimeAuthState = null;
	let runtimeAuthRefreshCancelled = false;
	const pluginHarnessOwnsAuthBootstrap = pluginHarnessOwnsTransport && agentHarness.authBootstrap === "harness";
	const preparedApiKeyRoute = activePreparedAuthPlan.modelRoute?.authRequirement === "api-key";
	const pluginHarnessHasPreparedApiKeyAttempt = preparedAuthAttempts.some((attempt) => attempt.plan.modelRoute?.authRequirement === "api-key");
	const pluginHarnessNeedsOpenClawAuthBootstrap = pluginHarnessOwnsTransport && (preparedApiKeyRoute || !pluginHarnessOwnsAuthBootstrap && preparedAuthAttempts.some((attempt) => attempt.kind !== "implicit"));
	const findPreparedAuthAttempt = (profileId, attemptIndex) => {
		const attempt = attemptIndex === void 0 ? preparedAuthAttempts.find((candidate) => candidate.profileId === profileId) : preparedAuthAttempts[attemptIndex];
		return attempt?.profileId === profileId ? attempt : void 0;
	};
	let preparedProfileAttempted = false;
	const prepareAuthAttempt = async (attempt) => {
		if (!canRunPreparedAgentRuntimeAuthAttempt({
			attempt,
			priorProfileAttempted: preparedProfileAttempted
		})) throw new Error(`Prepared direct auth fallback cannot bypass unavailable profiles for ${provider}/${modelId}.`);
		const modelDecision = resolveCredentialScopedAuthAttemptModelDecision({
			attempt,
			priorProfileAttempted: preparedProfileAttempted,
			requestedProfileId: params.authProfileId,
			providerUsesProfileScopedModelMetadata
		});
		const nextRuntimeModel = modelDecision.shouldMaterialize ? modelDecision.forceResolve ? await materializeAuthPlanUncached(attempt.plan, true) : await materializeAuthPlan(attempt.plan) : runtimeModel;
		const nextResolvedModel = resolveEffectiveModel(nextRuntimeModel);
		if (selectHarnessForPreparedAttempts(nextResolvedModel.effectiveModel, preparedAuthAttempts).id !== agentHarness.id) throw new Error(`Prepared auth retry changed the selected agent harness for ${provider}/${modelId}.`);
		preparedProfileAttempted ||= attempt.kind === "profile";
		return {
			runtimeModel: nextRuntimeModel,
			authRequirement: modelDecision.authRequirement,
			allowAuthProfileFallback: attempt.allowAuthProfileFallback,
			commit() {
				applyResolvedRuntimeModel(nextRuntimeModel, nextResolvedModel);
				activePreparedAuthPlan = attempt.plan;
			}
		};
	};
	const prepareModelForAuthProfile = hasPreparedAuthAttemptModelMetadata({
		attempts: preparedAuthAttempts,
		providerUsesProfileScopedModelMetadata
	}) && (!pluginHarnessOwnsAuthBootstrap || pluginHarnessHasPreparedApiKeyAttempt) ? async (profileId, attemptIndex) => {
		const attempt = findPreparedAuthAttempt(profileId, attemptIndex);
		if (!attempt) throw new Error(`Auth profile "${profileId ?? "(none)"}" is outside the prepared attempts for ${provider}/${modelId}.`);
		const prepared = await prepareAuthAttempt(attempt);
		if (attempt.plan.modelRoute && !prepared.authRequirement) throw new Error(`Prepared route metadata is missing for ${provider}/${modelId}.`);
		return {
			runtimeModel: prepared.runtimeModel,
			authRequirement: prepared.authRequirement,
			allowAuthProfileFallback: prepared.allowAuthProfileFallback,
			commit: () => prepared.commit()
		};
	} : void 0;
	const authController = createEmbeddedRunAuthController({
		config: params.config,
		agentDir: input.agentDir,
		workspaceDir: input.workspaceDir,
		authStore: attemptAuthProfileStore,
		authStorage,
		profileCandidates,
		lockedProfileId,
		initialThinkLevel,
		attemptedThinking,
		fallbackConfigured: input.fallbackConfigured,
		allowTransientCooldownProbe: params.allowTransientCooldownProbe === true,
		authProfileFailurePolicy: params.authProfileFailurePolicy,
		authProfileStateMode: params.authProfileStateMode,
		runId: params.runId,
		getProvider: () => provider,
		getModelId: () => modelId,
		getRuntimeModel: () => runtimeModel,
		setRuntimeModel: (next) => {
			runtimeModel = next;
		},
		getEffectiveModel: () => effectiveModel,
		setEffectiveModel: (next) => {
			effectiveModel = next;
		},
		getApiKeyInfo: () => apiKeyInfo,
		setApiKeyInfo: (next) => {
			apiKeyInfo = next;
		},
		getLastProfileId: () => lastProfileId,
		setLastProfileId: (next) => {
			lastProfileId = next;
		},
		getRuntimeAuthState: () => runtimeAuthState,
		setRuntimeAuthState: (next) => {
			runtimeAuthState = next;
		},
		getRuntimeAuthRefreshCancelled: () => runtimeAuthRefreshCancelled,
		setRuntimeAuthRefreshCancelled: (next) => {
			runtimeAuthRefreshCancelled = next;
		},
		getProfileIndex: () => profileIndex,
		setProfileIndex: (next) => {
			profileIndex = next;
		},
		...prepareModelForAuthProfile ? { prepareModelForAuthProfile } : {},
		setThinkLevel: (next) => {
			thinkLevel = next;
		},
		log: log$3
	});
	authStages?.mark("controller");
	const cooldownProbePolicy = resolveEmbeddedAuthCooldownProbePolicy({
		authStore: attemptAuthProfileStore,
		profileCandidates,
		lockedProfileId,
		modelId,
		allowTransientCooldownProbe: params.allowTransientCooldownProbe === true
	});
	let didTransientCooldownProbe = false;
	const advancePluginHarnessAuthAttempt = async () => {
		if (!pluginHarnessOwnsTransport) return false;
		let nextIndex = profileIndex + 1;
		while (nextIndex < preparedAuthAttempts.length) {
			const candidateIndex = nextIndex++;
			const candidateAttempt = preparedAuthAttempts[candidateIndex];
			profileIndex = candidateIndex;
			if (!candidateAttempt) continue;
			const candidate = candidateAttempt.profileId;
			if (candidate && isProfileInCooldown(attemptAuthProfileStore, candidate, void 0, modelId)) {
				if (didTransientCooldownProbe || !cooldownProbePolicy.probeProfileIds.has(candidate)) continue;
				didTransientCooldownProbe = true;
				log$3.warn(`probing cooldowned auth profile for ${provider}/${modelId} due to ${cooldownProbePolicy.unavailableReason ?? "transient"} unavailability`);
			}
			if (!canRunPreparedAgentRuntimeAuthAttempt({
				attempt: candidateAttempt,
				priorProfileAttempted: preparedProfileAttempted
			})) {
				profileIndex = preparedAuthAttempts.length;
				return false;
			}
			if (candidateAttempt.plan.modelRoute?.authRequirement === "api-key") try {
				await authController.applyAuthProfileCandidate(candidate, candidateIndex);
				thinkLevel = initialThinkLevel;
				attemptedThinking.clear();
				return true;
			} catch {
				continue;
			}
			if (!candidate || candidateAttempt.plan.forwardedAuthProfileId !== candidate) continue;
			const prepared = await prepareAuthAttempt(candidateAttempt);
			authController.stopRuntimeAuthRefreshTimer();
			apiKeyInfo = null;
			runtimeAuthState = null;
			prepared.commit();
			lastProfileId = candidate;
			thinkLevel = initialThinkLevel;
			attemptedThinking.clear();
			return true;
		}
		profileIndex = preparedAuthAttempts.length;
		return false;
	};
	const advanceAttemptAuthProfile = pluginHarnessOwnsAuthBootstrap ? advancePluginHarnessAuthAttempt : authController.advanceAuthProfile;
	if (!pluginHarnessOwnsTransport || pluginHarnessNeedsOpenClawAuthBootstrap) await authController.initializeAuthProfile();
	else if (forwardedPluginHarnessProfileId) {
		const initialAttempt = preparedAuthAttempts[profileIndex];
		const initialProfileInCooldown = initialAttempt?.kind === "profile" && isProfileInCooldown(attemptAuthProfileStore, initialAttempt.profileId, void 0, modelId);
		const initialProfileId = initialAttempt?.profileId;
		const canProbeInitialProfile = initialProfileInCooldown && initialProfileId !== void 0 && cooldownProbePolicy.probeProfileIds.has(initialProfileId);
		if (initialProfileInCooldown && !canProbeInitialProfile) {
			if (!await advancePluginHarnessAuthAttempt()) throw new Error(`Prepared auth profiles are temporarily unavailable for ${provider}/${modelId}.`);
		} else {
			if (initialProfileInCooldown) {
				didTransientCooldownProbe = true;
				log$3.warn(`probing cooldowned auth profile for ${provider}/${modelId} due to ${cooldownProbePolicy.unavailableReason ?? "transient"} unavailability`);
			}
			preparedProfileAttempted = initialAttempt?.kind === "profile";
			lastProfileId = forwardedPluginHarnessProfileId;
		}
	}
	authStages?.mark("initialize");
	if (authStages) log$3.trace(formatEmbeddedRunStageSummary(`[trace:embedded-run] auth stages: runId=${params.runId} sessionId=${params.sessionId} phase=auth`, authStages.snapshot()));
	input.markStartupStage("auth");
	input.notifyExecutionPhase("auth", {
		provider,
		model: modelId
	});
	const routeFacts = getModelProviderRequestRouteFacts(effectiveModel);
	const fallbackEndpointClass = routeFacts ? void 0 : resolveProviderEndpoint(effectiveModel.baseUrl, pluginMetadataSnapshot?.owners).endpointClass;
	const providerOwner = routeFacts?.providerOwner ?? (fallbackEndpointClass && ![
		"default",
		"invalid",
		"local",
		"custom"
	].includes(fallbackEndpointClass) ? fallbackEndpointClass : void 0);
	const providerRuntimeHandle = {
		...resolveProviderRuntimePluginHandle({
			provider,
			providerOwner,
			modelId,
			config: params.config,
			workspaceDir: input.workspaceDir,
			env: process.env,
			...pluginMetadataSnapshot ? { pluginMetadataSnapshot } : {}
		}),
		modelId,
		prepared: true
	};
	const admittedRunContext = await resolvePreparedRunAdmission({
		runId: params.runId,
		runtimeKind: pluginHarnessOwnsTransport ? "plugin-harness" : "embedded",
		admittedRunContext: params.admittedRunContext,
		preparedRunAdmission: params.preparedRunAdmission
	});
	const sourceReplyDeliveryRuntime = readSourceReplyDeliveryRuntime(params);
	if (sourceReplyDeliveryRuntime?.origin === "runtime_default") {
		const mode = (agentHarness.deliveryDefaults?.visibleReplies ?? agentHarness.deliveryDefaults?.sourceVisibleReplies) === "message_tool" ? "message_tool_only" : "automatic";
		sourceReplyDeliveryRuntime.applyPreparedMode(params, mode);
		params.forceMessageTool = mode === "message_tool_only";
	}
	return {
		admittedRunContext,
		provider,
		modelId,
		requestedModelId,
		expectedHarnessArtifact,
		nativeModelOwned,
		model,
		authStorage,
		modelRegistry,
		attemptAuthProfileStore,
		lockedProfileId,
		preferredProfileId,
		profileCandidates,
		profileFailureStore: attemptAuthProfileStore,
		genericCompactionRecoveryAllowed,
		pluginHarnessOwnsAuthBootstrap,
		attemptedThinking,
		advanceAttemptAuthProfile,
		maybeRefreshRuntimeAuthForAuthError: authController.maybeRefreshRuntimeAuthForAuthError,
		stopRuntimeAuthRefreshTimer: authController.stopRuntimeAuthRefreshTimer,
		getApiKeyInfo: () => apiKeyInfo,
		setThinkLevel: (next) => {
			thinkLevel = next;
		},
		resolveRunAttemptAuthProfileStore: () => {
			if (!pluginHarnessOwnsTransport) return attemptAuthProfileStore;
			const activeProfileIds = activePreparedAuthPlan.modelRoute ? [activePreparedAuthPlan.forwardedAuthProfileId, ...activePreparedAuthPlan.forwardedAuthProfileCandidateIds ?? []] : [lastProfileId];
			return createScopedAuthProfileStore(attemptAuthProfileStore, activeProfileIds.filter((profileId) => Boolean(profileId)));
		},
		snapshot: () => ({
			agentHarness,
			pluginHarnessOwnsTransport,
			effectiveModel,
			contextTokenBudget,
			authoredContextTokenCap,
			contextWindowInfo,
			outerContextTokenMeta,
			activePreparedAuthPlan,
			thinkLevel,
			apiKeyInfo,
			lastProfileId,
			runtimeAuthState,
			pluginMetadataSnapshot,
			providerRuntimeHandle
		})
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/session-prompt-state.ts
const MID_TURN_PRECHECK_CONTINUATION_PROMPT = "Continue from the current transcript after the latest tool result. Do not repeat the original user request, and do not rerun completed tools unless the transcript shows they are still needed.";
function createEmbeddedRunSessionPromptState(input) {
	const { runParams: params, sessionAgentId, resolvedSessionKey, lifecycleGeneration } = input;
	let activeSessionId = params.sessionId;
	let activeSessionFile = params.sessionFile;
	let activeSessionTarget = buildContextEngineCompactionSessionTarget({
		agentId: params.agentId ?? sessionAgentId,
		config: params.config,
		sessionFile: activeSessionFile,
		sessionId: activeSessionId,
		sessionKey: resolvedSessionKey,
		sessionTarget: params.sessionTarget
	});
	const expectedWriterRunId = params.sessionTarget?.expectedWriterRunId?.trim();
	const existingWriterFence = expectedWriterRunId ? {
		expectedLifecycleRevision: params.sessionTarget?.expectedLifecycleRevision,
		expectedWriterRunId
	} : void 0;
	const initialWriter = prepareInitialSessionWriter({
		runParams: params,
		target: activeSessionTarget
	});
	const initialTarget = initialWriter ? { ...activeSessionTarget } : void 0;
	let sessionTargetAdopted = false;
	let committedCompactionSuccessor;
	let settleOwnedTranscriptProjection = false;
	let suppressNextUserMessagePersistence = params.suppressNextUserMessagePersistence ?? false;
	let activePrompt = {
		persisted: suppressNextUserMessagePersistence,
		internal: false
	};
	const notifySessionIdChanged = () => {
		registerAgentRunContext(params.runId, {
			sessionId: activeSessionId,
			lifecycleGeneration
		});
		params.replyOperation?.updateSessionId(activeSessionId);
		params.onSessionIdChanged?.(activeSessionId);
	};
	const adoptSessionId = (nextSessionId) => {
		if (!nextSessionId || nextSessionId === activeSessionId) return;
		activeSessionId = nextSessionId;
		notifySessionIdChanged();
	};
	const capturePreparedCompactionTarget = (target) => {
		activeSessionId = target.sessionId;
		activeSessionFile = target.sessionFile;
		activeSessionTarget = target.sessionTarget;
		sessionTargetAdopted = true;
	};
	const recordCommittedCompactionSuccessor = (accepted) => {
		committedCompactionSuccessor = accepted;
		capturePreparedCompactionTarget(accepted);
	};
	const notifyCompactionSessionAdopted = (previousSessionId) => {
		if (previousSessionId && previousSessionId !== activeSessionId) notifySessionIdChanged();
	};
	const activateInternalPrompt = (prompt) => {
		activePrompt = {
			override: prompt,
			persisted: true,
			internal: true
		};
		suppressNextUserMessagePersistence = true;
	};
	const onUserMessagePersisted = (message) => {
		const blockedBeforeAgentRun = message["__openclaw"]?.beforeAgentRunBlocked;
		const markCurrentUserMessagePersisted = () => {
			activePrompt.persisted = true;
			params.onUserMessagePersisted?.(message);
		};
		const recorder = params.userTurnTranscriptRecorder;
		if (!recorder) {
			markCurrentUserMessagePersisted();
			return;
		}
		const markWhenPersisted = (persisted) => {
			if (persisted?.message || recorder.hasPersisted()) markCurrentUserMessagePersisted();
		};
		const observedPersistence = (blockedBeforeAgentRun !== void 0 ? recorder.persistBlocked(message) : recorder.persistApproved()).then(markWhenPersisted).catch((persistError) => {
			log$3.warn(`failed to persist canonical ${blockedBeforeAgentRun !== void 0 ? "blocked " : ""}embedded user turn transcript: ${formatErrorMessage(persistError)}`);
		});
		recorder.markRuntimePersistencePending(observedPersistence);
	};
	const waitForCurrentUserMessagePersistence = async () => {
		if (params.userTurnTranscriptRecorder?.hasRuntimePersistencePending() === true) await params.userTurnTranscriptRecorder.waitForRuntimePersistence();
	};
	return {
		get sessionId() {
			return activeSessionId;
		},
		get sessionFile() {
			return activeSessionFile;
		},
		set sessionFile(value) {
			activeSessionFile = value;
		},
		get sessionTarget() {
			return activeSessionTarget;
		},
		set sessionTarget(value) {
			activeSessionTarget = value;
			sessionTargetAdopted = true;
		},
		get sessionTargetAdopted() {
			return sessionTargetAdopted;
		},
		get committedCompactionSuccessor() {
			return committedCompactionSuccessor;
		},
		get sessionWriterFence() {
			return existingWriterFence ?? initialWriter?.committedFence;
		},
		withSessionWriterContext: (run) => initialWriter && !initialWriter.committedFence ? withOwnedSessionTranscriptWrites({
			sessionTarget: initialTarget,
			initialWriter,
			withTranscriptWrite: async (write) => await write()
		}, run) : runWithoutOwnedSessionTranscriptWrites(run),
		get activePrompt() {
			return activePrompt;
		},
		get suppressNextUserMessagePersistence() {
			return suppressNextUserMessagePersistence;
		},
		set suppressNextUserMessagePersistence(value) {
			suppressNextUserMessagePersistence = value;
		},
		adoptSessionId,
		capturePreparedCompactionTarget,
		recordCommittedCompactionSuccessor,
		notifyCompactionSessionAdopted,
		activateInternalPrompt,
		markOwnedTranscriptRetry: () => {
			settleOwnedTranscriptProjection = true;
		},
		settleOwnedTranscriptProjection: async (target, abortSignal) => {
			const sessionId = target?.sessionId ?? activeSessionId;
			if (settleOwnedTranscriptProjection && !params.sessionManager && target && sessionId) {
				settleOwnedTranscriptProjection = false;
				const { waitForSessionTranscriptProjection } = await import("./session-transcript-reconcile-DFsDtc9l.js");
				await waitForSessionTranscriptProjection({
					...target,
					sessionId
				}, abortSignal);
			}
		},
		continueFromCurrentTranscript: (options) => {
			const prompt = options?.includeToolFailureInstruction ? `${MID_TURN_PRECHECK_CONTINUATION_PROMPT} ${TOOL_FAILURE_INSTRUCTION}` : MID_TURN_PRECHECK_CONTINUATION_PROMPT;
			activateInternalPrompt(prompt);
		},
		onUserMessagePersisted,
		waitForCurrentUserMessagePersistence,
		prepareCompactedTranscriptRetry: async (assertActive) => {
			await waitForCurrentUserMessagePersistence();
			assertActive();
			settleOwnedTranscriptProjection = true;
			if (activePrompt.internal) suppressNextUserMessagePersistence = activePrompt.persisted;
			else if (activePrompt.persisted) activateInternalPrompt(MID_TURN_PRECHECK_CONTINUATION_PROMPT);
		}
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt-delivery-state.ts
function copyAttemptDeliveryState(attempt) {
	return {
		latestMcpAppChannelView: attempt.latestMcpAppChannelView,
		latestMcpConnectAction: attempt.latestMcpConnectAction,
		didSendViaMessagingTool: attempt.didSendViaMessagingTool,
		didDeliverSourceReplyViaMessageTool: attempt.didDeliverSourceReplyViaMessageTool === true,
		didSendDeterministicApprovalPrompt: attempt.didSendDeterministicApprovalPrompt,
		messagingToolSentTexts: attempt.messagingToolSentTexts,
		messagingToolSentMediaUrls: attempt.messagingToolSentMediaUrls,
		messagingToolSentTargets: attempt.messagingToolSentTargets,
		messagingToolSourceReplyPayloads: attempt.messagingToolSourceReplyPayloads,
		heartbeatToolResponse: attempt.heartbeatToolResponse,
		successfulCronAdds: attempt.successfulCronAdds,
		acceptedSessionSpawns: attempt.acceptedSessionSpawns
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/failure-signal.ts
/**
* Converts embedded run failures into provider failover signals.
*/
/**
* Converts terminal tool errors from unattended embedded runs into failure signals.
*
* Cron runs need fatal execution-denied signals so schedulers do not treat blocked shell access as
* a normal silent completion.
*/
const FAILURE_SIGNAL_CODES = ["SYSTEM_RUN_DENIED", "INVALID_REQUEST"];
function resolveFailureSignalCode(value) {
	for (const code of FAILURE_SIGNAL_CODES) if (value === code) return code;
}
/** Resolves fatal cron failure metadata from the last exec-like tool error, if applicable. */
function resolveEmbeddedRunFailureSignal(params) {
	if (params.trigger !== "cron") return;
	const lastToolError = params.lastToolError;
	if (!lastToolError || !isExecLikeToolName(lastToolError.toolName)) return;
	const code = resolveFailureSignalCode(normalizeOptionalString(lastToolError.errorCode));
	if (!code) return;
	const message = normalizeOptionalString(lastToolError.error) ?? code;
	return {
		kind: "execution_denied",
		source: "tool",
		...lastToolError.toolName ? { toolName: lastToolError.toolName } : {},
		code,
		message,
		fatalForCron: true
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/terminal-preparation.ts
function prepareEmbeddedRunTerminal(input) {
	const { runParams, attempt } = input;
	const { timedOutDuringCompaction, timedOutDuringToolExecution } = projectAgentRunAttemptTerminal(attempt.terminal);
	const timedOutDuringPrompt = isEmbeddedRunTerminalTimeout(input.terminalState.outcome) && !timedOutDuringCompaction && !timedOutDuringToolExecution;
	const timeoutFinal = isEmbeddedRunTimeoutFinal(attempt);
	const terminalAssistant = input.currentAttemptCompletedAssistant;
	const usageMeta = buildUsageAgentMetaFields({
		usageAccumulator: input.usageAccumulator,
		latestUsage: terminalAssistant?.usage,
		lastRunPromptUsage: input.lastRunPromptUsage
	});
	const reportedModelRef = resolveReportedModelRef({
		provider: input.provider,
		model: input.model,
		assistant: terminalAssistant
	});
	const responseModel = terminalAssistant?.responseModel?.trim() || reportedModelRef.model;
	const finalAssistantStopReason = (terminalAssistant?.stopReason ?? "").trim().toLowerCase();
	const terminalAssistantCanOwnFinalText = finalAssistantStopReason !== "error" && finalAssistantStopReason !== "aborted";
	const costUsd = estimateAggregateUsageCost({
		usage: usageMeta.usage,
		cost: resolveModelCostConfig({
			provider: reportedModelRef.provider,
			model: reportedModelRef.model,
			config: runParams.config,
			agentDir: runParams.agentDir
		})
	});
	const runAssistantTurns = input.usageAccumulator.assistantTurns;
	const contextTokens = attempt.contextTokens ?? input.outerContextTokenMeta.contextTokens;
	const agentMeta = {
		sessionId: input.sessionIdUsed,
		sessionFile: input.sessionFileUsed,
		provider: reportedModelRef.provider,
		model: reportedModelRef.model,
		contextTokens,
		...contextTokens !== void 0 ? { contextTokensSource: attempt.contextTokens !== void 0 ? attempt.contextTokensSource ?? "resolved" : "resolved" } : {},
		agentHarnessId: attempt.agentHarnessId,
		credentialSource: attempt.modelAttempt?.credentialSource,
		usage: usageMeta.usage,
		lastCallUsage: usageMeta.lastCallUsage,
		promptTokens: usageMeta.promptTokens,
		...input.contextRecoveryState.lastContextBudgetStatus ? { contextBudgetStatus: input.contextRecoveryState.lastContextBudgetStatus } : {},
		compactionCount: input.contextRecoveryState.autoCompactionCount > 0 ? input.contextRecoveryState.autoCompactionCount : void 0,
		compactionTokensAfter: input.contextRecoveryState.lastCompactionTokensAfter,
		codeModeEngaged: attempt.codeModeEngaged === true,
		...runAssistantTurns > 0 ? { assistantTurns: runAssistantTurns } : {},
		...input.usageAccumulator.bridgeCalls ? { bridgeCalls: { ...input.usageAccumulator.bridgeCalls } } : {},
		...costUsd !== void 0 ? { costUsd } : {}
	};
	const attemptFinalText = attempt.assistantTexts.toReversed().map((text) => text.trim()).find((text) => text.length > 0);
	const finalAssistantVisibleText = terminalAssistantCanOwnFinalText ? resolveFinalAssistantVisibleText(terminalAssistant) ?? attemptFinalText : void 0;
	const finalAssistantRawText = terminalAssistantCanOwnFinalText ? resolveFinalAssistantRawText(terminalAssistant) ?? attemptFinalText : void 0;
	const terminalTurnId = attempt.terminalTurnId;
	const successfulToolNames = [...new Set(attempt.toolMetas.filter((entry) => entry.isError === false).map((entry) => entry.toolName.trim()).filter(Boolean))];
	const missingNestedToolNames = [...new Set((attempt.successfulNestedToolNames ?? []).map((name) => name.trim()).filter(Boolean))].filter((name) => !successfulToolNames.includes(name)).toSorted();
	successfulToolNames.push(...missingNestedToolNames);
	Object.assign(agentMeta, { terminalReceipt: {
		runId: runParams.runId,
		sessionId: input.sessionIdUsed,
		turnId: terminalTurnId?.trim() || runParams.runId,
		requested: {
			provider: input.provider,
			model: input.model
		},
		effective: {
			provider: reportedModelRef.provider,
			model: reportedModelRef.model,
			responseModel
		},
		successfulToolNames,
		rerouted: reportedModelRef.provider !== input.provider || reportedModelRef.model !== input.model || responseModel !== input.model
	} });
	const payloadAssistant = attempt.yieldDetected ? attempt.lastAssistant : input.currentAttemptCompletedAssistant;
	const payloads = buildEmbeddedRunPayloads({
		assistantTexts: attempt.assistantTexts,
		assistantMessageIndex: attempt.lastAssistantTextMessageIndex,
		assistantTranscriptOwned: attempt.assistantTranscriptOwned,
		assistantTranscriptIdempotencyKey: attempt.assistantTranscriptIdempotencyKey,
		lastAssistant: payloadAssistant,
		currentAssistant: attempt.yieldDetected ? null : payloadAssistant ?? null,
		lastToolError: attempt.lastToolError,
		config: runParams.config,
		isCronTrigger: runParams.trigger === "cron",
		isHeartbeatTrigger: runParams.trigger === "heartbeat",
		sessionKey: runParams.sessionKey ?? runParams.sessionId,
		provider: input.activeErrorContext.provider,
		providerOwner: input.providerOwner,
		model: input.activeErrorContext.model,
		authMode: input.authProfileId ? input.authProfileStore.profiles?.[input.authProfileId]?.type : void 0,
		verboseLevel: runParams.verboseLevel,
		reasoningLevel: runParams.reasoningLevel,
		thinkingLevel: runParams.thinkLevel,
		toolResultFormat: input.resolvedToolResultFormat,
		suppressToolErrorWarnings: runParams.suppressToolErrorWarnings,
		didSendViaMessagingTool: attempt.didSendViaMessagingTool,
		didDeliverSourceReplyViaMessageTool: attempt.didDeliverSourceReplyViaMessageTool === true,
		messagingToolSentTargets: attempt.messagingToolSentTargets,
		messagingToolSourceReplyPayloads: attempt.messagingToolSourceReplyPayloads,
		sourceReplyDeliveryMode: runParams.sourceReplyDeliveryMode,
		agentId: runParams.agentId,
		runId: runParams.runId,
		runAborted: isEmbeddedRunTerminalInterrupted(input.terminalState.outcome) && !(timedOutDuringPrompt && timeoutFinal),
		runStopReason: input.terminalState.outcome.stopReason,
		deferAssistantTimeoutError: timedOutDuringPrompt && (!hasMessagingToolDeliveryEvidence(attempt) || timeoutFinal),
		didSendDeterministicApprovalPrompt: attempt.didSendDeterministicApprovalPrompt,
		heartbeatToolResponse: attempt.heartbeatToolResponse
	});
	const payloadsWithToolMedia = mergeAttemptToolMediaPayloads({
		payloads,
		toolMediaUrls: attempt.toolMediaUrls,
		hostOwnedToolMediaUrls: attempt.hostOwnedToolMediaUrls,
		toolAutoDeliveryMediaUrls: getCoreTtsAttemptResultMediaUrls(attempt, attempt.toolMediaUrls, runParams.admittedRunContext?.operationalRunInstance),
		toolAudioAsVoice: attempt.toolAudioAsVoice,
		toolTrustedLocalMedia: attempt.toolTrustedLocalMedia,
		sourceReplyDeliveryMode: runParams.sourceReplyDeliveryMode
	});
	const recoveredFinalAssistantTextAfterPromptTimeout = timedOutDuringPrompt && !timeoutFinal && [
		"completed",
		"end_turn",
		"stop"
	].includes(finalAssistantStopReason) ? (finalAssistantVisibleText ?? finalAssistantRawText)?.trim() : void 0;
	const payloadAlreadyContainsRecoveredFinalAssistant = recoveredFinalAssistantTextAfterPromptTimeout ? (payloadsWithToolMedia ?? []).some((payload) => payload?.isError !== true && payload?.isReasoning !== true && typeof payload.text === "string" && payload.text.trim() === recoveredFinalAssistantTextAfterPromptTimeout) : false;
	const recoveredFinalAssistantPayloadsAfterPromptTimeout = recoveredFinalAssistantTextAfterPromptTimeout && !payloadAlreadyContainsRecoveredFinalAssistant ? replacePartialAssistantPayload({
		payloads: payloadsWithToolMedia,
		assistantTexts: attempt.assistantTexts,
		recoveredText: recoveredFinalAssistantTextAfterPromptTimeout
	}) : void 0;
	return {
		agentMeta,
		reportedModelRef,
		finalAssistantVisibleText,
		finalAssistantRawText,
		payloads,
		payloadsWithToolMedia,
		timedOutDuringPrompt,
		recoveredFinalAssistantPayloadsAfterPromptTimeout,
		hasSuccessfulFinalAssistantAfterPromptTimeout: timedOutDuringPrompt && Boolean(payloadAlreadyContainsRecoveredFinalAssistant || recoveredFinalAssistantPayloadsAfterPromptTimeout?.length),
		hasPartialAssistantTextAfterPromptTimeout: timedOutDuringPrompt && (attempt.assistantTexts ?? []).some((text) => text.trim().length > 0) && !attempt.clientToolCalls && !attempt.yieldDetected && !attempt.didSendViaMessagingTool && !attempt.didSendDeterministicApprovalPrompt && !attempt.lastToolError && (attempt.toolMetas?.length ?? 0) === 0,
		attemptToolSummary: buildTraceToolSummary({
			toolMetas: attempt.toolMetas,
			fallbackHadFailure: Boolean(attempt.lastToolError)
		}),
		failureSignal: resolveEmbeddedRunFailureSignal({
			trigger: runParams.trigger,
			lastToolError: attempt.lastToolError
		}),
		terminalToolFailure: resolveEmbeddedRunTerminalToolFailure({
			trigger: runParams.trigger,
			codeModeEngaged: attempt.codeModeEngaged,
			lastToolError: attempt.lastToolError
		})
	};
}
function replacePartialAssistantPayload(input) {
	const payloads = input.payloads ? [...input.payloads] : [];
	const assistantTextSignatures = new Set((input.assistantTexts ?? []).map((text) => text.trim()).filter((text) => text.length > 0));
	const partialPayloadIndex = payloads.findLastIndex((payload) => payload.isError !== true && payload.isReasoning !== true && typeof payload.text === "string" && assistantTextSignatures.has(payload.text.trim()));
	if (partialPayloadIndex < 0) return [...payloads, { text: input.recoveredText }];
	const partialPayload = payloads[partialPayloadIndex];
	if (!partialPayload) return [...payloads, { text: input.recoveredText }];
	payloads[partialPayloadIndex] = copyReplyPayloadMetadata(partialPayload, {
		...partialPayload,
		text: input.recoveredText
	});
	return payloads;
}
//#endregion
//#region src/agents/embedded-agent-runner/run/auth-profile-success.ts
const POST_RUN_AUTH_PROFILE_SUCCESS_SLOW_MS = 1e3;
function markEmbeddedRunAuthProfileSuccess(input) {
	if (input.authProfileStateMode === "read-only" || !input.profileId) return;
	const successProfileId = input.profileId;
	const safeSuccessProfileId = redactIdentifier(successProfileId, { len: 12 });
	const successProvider = resolveAuthProfileStateProvider(input.profileStore, successProfileId, input.provider);
	const successStarted = Date.now();
	markAuthProfileSuccess({
		store: input.profileStore,
		provider: successProvider,
		profileId: successProfileId,
		agentDir: input.agentDir
	}).then(() => {
		const durationMs = Date.now() - successStarted;
		if (durationMs >= POST_RUN_AUTH_PROFILE_SUCCESS_SLOW_MS) log$3.warn(`post-run auth-profile success bookkeeping completed after ${durationMs}ms: runId=${input.runId} sessionId=${input.sessionId} provider=${sanitizeForLog(successProvider)} profileId=${safeSuccessProfileId}`);
		else if (log$3.isEnabled("trace")) log$3.trace(`post-run auth-profile success bookkeeping completed: runId=${input.runId} sessionId=${input.sessionId} durationMs=${durationMs}`);
	}).catch((error) => {
		log$3.warn(`post-run auth-profile success bookkeeping failed: runId=${input.runId} sessionId=${input.sessionId} provider=${sanitizeForLog(successProvider)} profileId=${safeSuccessProfileId} error=${formatErrorMessage(error)}`);
	});
}
function reportEmbeddedRunSuccessfulAuthBinding(input) {
	const credential = input.profileId ? input.profileStore.profiles[input.profileId] : void 0;
	const pluginHarnessApiKeyInfo = resolvePluginHarnessApiKeyInfo({
		apiKeyInfo: input.apiKeyInfo,
		pluginHarnessOwnsTransport: input.pluginHarnessOwnsTransport
	});
	const authFingerprint = credential?.type === "oauth" && input.profileId ? fingerprintResolvedAuthProfileCredential({
		profileId: input.profileId,
		credential,
		resolvedAuth: input.apiKeyInfo
	}) : credential && input.profileId && input.pluginHarnessOwnsAuthBootstrap ? input.attempt.authBindingFingerprint : credential && input.profileId && input.pluginHarnessOwnsTransport ? fingerprintResolvedAuthProfileCredential({
		profileId: input.profileId,
		credential,
		resolvedAuth: pluginHarnessApiKeyInfo
	}) : input.apiKeyInfo ? fingerprintResolvedProviderAuth(input.apiKeyInfo) : void 0;
	const authProfileOwnerFingerprint = input.profileId && credential !== void 0 ? fingerprintAuthProfileOwnerShape({
		profileId: input.profileId,
		credential
	}) : void 0;
	const runtimeArtifact = input.pluginHarnessOwnsTransport ? input.attempt.runtimeArtifact : void 0;
	const runtimeOwnerFingerprint = authFingerprint ? void 0 : input.apiKeyInfo?.mode === "aws-sdk" ? fingerprintAwsSdkRuntimeOwner({
		provider: input.provider,
		backendId: input.agentHarnessId,
		auth: input.apiKeyInfo
	}) : input.pluginHarnessOwnsTransport ? fingerprintOpaqueRuntimeOwner({
		kind: "plugin-harness",
		runner: "embedded",
		provider: input.provider,
		backendId: input.agentHarnessId,
		...runtimeArtifact ? { runtimeArtifactFingerprint: runtimeArtifact.fingerprint } : {},
		...input.profileId ? { authProfileId: input.profileId } : {},
		...authProfileOwnerFingerprint ? { authProfileOwnerFingerprint } : {}
	}) : void 0;
	const runtimeOwnerKind = runtimeOwnerFingerprint ? input.apiKeyInfo?.mode === "aws-sdk" ? "aws-sdk" : input.pluginHarnessOwnsTransport ? "plugin-harness" : void 0 : input.pluginHarnessOwnsTransport ? "plugin-harness" : void 0;
	const materializedRoute = resolveHarnessAuthMaterialization(input, credential);
	if (materializedRoute) recordRuntimeAuthMaterialization({
		agentDir: input.agentDir,
		provider: input.provider,
		modelId: input.modelId,
		modelApi: materializedRoute.api,
		modelBaseUrl: materializedRoute.baseUrl,
		requestTransportOverrides: materializedRoute.requestTransportOverrides,
		authMode: materializedRoute.authRequirement === "subscription" ? "oauth" : "api-key",
		runtimeOwnerId: input.agentHarnessId,
		...input.profileId ? { authProfileId: input.profileId } : {}
	});
	input.onSuccessfulAuthBinding?.({
		...input.profileId ? { authProfileId: input.profileId } : {},
		agentHarnessId: input.agentHarnessId,
		modelId: input.modelId,
		modelApi: input.modelApi,
		...authFingerprint ? { authFingerprint } : {},
		...runtimeOwnerFingerprint ? { runtimeOwnerFingerprint } : {},
		...runtimeOwnerKind ? { runtimeOwnerKind } : {},
		...runtimeOwnerKind ? { runtimeOwnerId: input.agentHarnessId } : {},
		...runtimeArtifact ? {
			runtimeArtifactId: runtimeArtifact.id,
			runtimeArtifactFingerprint: runtimeArtifact.fingerprint
		} : {}
	});
}
function resolveHarnessAuthMaterialization(input, credential) {
	const preparedApiKeyProfileId = input.apiKeyInfo?.profileId;
	const resolvedReferencedApiKey = credential?.type === "api_key" && credential.keyRef !== void 0 && input.apiKeyInfo?.mode === "api-key" && preparedApiKeyProfileId !== void 0 && preparedApiKeyProfileId === input.profileId && input.apiKeyInfo.source === `profile:${preparedApiKeyProfileId}`;
	if (!input.pluginHarnessOwnsAuthBootstrap || input.apiKeyInfo && !resolvedReferencedApiKey || hasInlineCredentialMaterial(credential) || !isModelApi(input.modelApi)) return;
	const resolution = resolveProviderModelRoutes({
		provider: input.provider,
		modelId: input.modelId,
		api: input.modelApi,
		baseUrl: input.modelBaseUrl,
		config: input.config,
		requestTransportOverrides: input.requestTransportOverrides ?? "none"
	});
	if (resolution?.kind !== "routes") return;
	const routes = resolution.routes.filter((route) => route.api === input.modelApi && route.requestTransportOverrides === (input.requestTransportOverrides ?? "none") && (!input.modelBaseUrl || modelMatchesProviderModelRoute({
		provider: input.provider,
		api: input.modelApi,
		baseUrl: input.modelBaseUrl,
		route
	})));
	return routes.length === 1 ? routes[0] : void 0;
}
function isModelApi(value) {
	return MODEL_APIS.includes(value);
}
function hasInlineCredentialMaterial(credential) {
	if (!credential) return false;
	if (credential.type === "api_key") return Boolean(credential.key?.trim());
	if (credential.type === "token") return Boolean(credential.token?.trim());
	return Boolean(credential.access?.trim() && credential.refresh?.trim());
}
function resolvePluginHarnessApiKeyInfo(input) {
	const apiKeyInfo = input.apiKeyInfo;
	const apiKey = apiKeyInfo?.apiKey;
	if (!input.pluginHarnessOwnsTransport || !apiKeyInfo || !apiKey || !looksLikeSecretSentinel(apiKey)) return apiKeyInfo;
	const resolvedApiKey = resolveSecretSentinel(apiKey);
	return resolvedApiKey ? {
		...apiKeyInfo,
		apiKey: resolvedApiKey
	} : null;
}
function resolveAuthProfileStateProvider(store, profileId, fallbackProvider) {
	const profileProvider = store.profiles?.[profileId]?.provider?.trim();
	if (profileProvider) return profileProvider;
	return profileId.split(":", 1)[0]?.trim() || fallbackProvider;
}
//#endregion
//#region src/agents/embedded-agent-runner/run/terminal-resolution.ts
const MAX_MISSING_ASSISTANT_RETRIES = 1;
const COMPACTION_CONTINUATION_RETRY_INSTRUCTION = "The previous attempt compacted the conversation context before producing a final user-visible answer. Continue from the compacted transcript and produce the final answer now. Do not restart from scratch, do not repeat completed work, and do not rerun tools unless the transcript clearly lacks required evidence.";
const BEFORE_AGENT_FINALIZE_RETRY_PROMPT_PREFIX = "Before accepting the previous final answer, apply this revision request and produce the revised final answer. Do not repeat completed work or rerun tools unless the request explicitly requires it.";
const ACCEPTED_SESSION_SPAWN_CONTINUATION_TEXT = "I’m continuing this work and will send the result when it is ready.";
function createTerminalToolPresentationTracker() {
	let latestOrdinal = -1;
	let nextOrdinal = 0;
	let value;
	return {
		allocateOrdinal: () => nextOrdinal++,
		observe: (observation) => {
			const ordinal = observation.toolCallOrdinal ?? latestOrdinal + 1;
			if (ordinal >= latestOrdinal) {
				latestOrdinal = ordinal;
				value = observation.terminalPresentation;
			}
		},
		read: () => value
	};
}
function requiresVisibleTerminalReply(runParams) {
	return runParams.terminalReplyExpectation === "required" || runParams.terminalReplyExpectation == null && (runParams.trigger == null || runParams.trigger === "user" || runParams.trigger === "manual");
}
function resolveSettledTurnFinalizationRequest(input) {
	if (!input.settledTurnFinalizationAvailable) return null;
	const terminalAborted = isEmbeddedRunTerminalAbort(input.terminalState.outcome);
	const terminalTimedOut = isEmbeddedRunTerminalTimeout(input.terminalState.outcome);
	const silentToolResultReplyPayload = resolveSilentToolResultReplyPayload({
		isCronTrigger: input.runParams.trigger === "cron",
		payloadCount: input.payloadsWithToolMedia?.length ?? 0,
		aborted: terminalAborted,
		timedOut: terminalTimedOut,
		attempt: input.attempt
	});
	const terminalAssistant = resolveCurrentAttemptAssistant(input.attempt);
	const hasOnlySyntheticToolErrorPayload = Boolean(terminalAssistant?.stopReason === "toolUse" && input.attempt.lastToolError && input.attempt.assistantTexts.every((text) => text.trim().length === 0) && (input.payloadsWithToolMedia?.length ?? 0) > 0 && input.payloadsWithToolMedia?.every((payload) => payload.isError === true && Object.keys(payload).every((key) => key === "text" || key === "isError")));
	const payloadCount = input.recoveredFinalAssistantPayloadsAfterPromptTimeout ? input.recoveredFinalAssistantPayloadsAfterPromptTimeout.length : hasOnlySyntheticToolErrorPayload ? 0 : input.payloadsWithToolMedia?.length ? input.payloadsWithToolMedia.length : silentToolResultReplyPayload ? 1 : 0;
	if (shouldTreatEmptyAssistantReplyAsSilent({
		allowEmptyAssistantReplyAsSilent: input.runParams.allowEmptyAssistantReplyAsSilent,
		terminalReplyExpectation: input.runParams.terminalReplyExpectation,
		onlyExplicitSilentReply: false,
		payloadCount,
		aborted: terminalAborted,
		timedOut: terminalTimedOut,
		attempt: input.attempt
	})) return null;
	return resolveSettledToolTerminalContinuationInstruction({
		provider: input.activeErrorContext.provider,
		modelId: input.activeErrorContext.model,
		modelApi: input.modelApi,
		executionContract: input.executionContract,
		allowEmptyStopContinuation: requiresVisibleTerminalReply(input.runParams),
		payloadCount,
		hasTerminalToolPresentation: input.hasTerminalToolPresentation,
		aborted: terminalAborted,
		timedOut: terminalTimedOut,
		attempt: input.attempt
	});
}
async function resolveEmbeddedRunTerminal(input) {
	const { runParams, attempt, retryState } = input;
	const { externalAbort, promptError } = projectAgentRunAttemptTerminal(attempt.terminal);
	const terminalAborted = isEmbeddedRunTerminalAbort(input.terminalState.outcome);
	const terminalTimedOut = isEmbeddedRunTerminalTimeout(input.terminalState.outcome);
	const terminalInterrupted = isEmbeddedRunTerminalInterrupted(input.terminalState.outcome);
	const { signalOwnedInterruption } = input.terminalState;
	const silentToolResultReplyPayload = resolveSilentToolResultReplyPayload({
		isCronTrigger: runParams.trigger === "cron",
		payloadCount: input.payloadsWithToolMedia?.length ?? 0,
		aborted: terminalAborted,
		timedOut: terminalTimedOut,
		attempt
	});
	const payloadsForTerminalPath = input.recoveredFinalAssistantPayloadsAfterPromptTimeout ? input.recoveredFinalAssistantPayloadsAfterPromptTimeout : input.payloadsWithToolMedia?.length ? input.payloadsWithToolMedia : silentToolResultReplyPayload ? [silentToolResultReplyPayload] : input.payloadsWithToolMedia;
	const payloadCount = payloadsForTerminalPath?.length ?? 0;
	const intentionalTerminalCompletion = !terminalAborted && !terminalTimedOut && payloadCount === 0 && resolveSettledToolBatchEvidence(attempt).intentionalTermination;
	const settledTurnFinalizationAttempted = input.settledTurnFinalizationOutcome !== "not-attempted";
	const emptyAssistantReplyIsSilent = shouldTreatEmptyAssistantReplyAsSilent({
		allowEmptyAssistantReplyAsSilent: runParams.allowEmptyAssistantReplyAsSilent,
		terminalReplyExpectation: runParams.terminalReplyExpectation,
		onlyExplicitSilentReply: settledTurnFinalizationAttempted,
		payloadCount,
		aborted: terminalAborted,
		timedOut: terminalTimedOut,
		attempt
	});
	const nextReasoningOnlyRetryInstruction = emptyAssistantReplyIsSilent || settledTurnFinalizationAttempted ? null : resolveReasoningOnlyRetryInstruction({
		provider: input.activeErrorContext.provider,
		modelId: input.activeErrorContext.model,
		modelApi: input.modelApi,
		executionContract: input.executionContract,
		aborted: terminalAborted,
		timedOut: terminalTimedOut,
		attempt
	});
	const nextEmptyResponseRetryInstruction = emptyAssistantReplyIsSilent || settledTurnFinalizationAttempted ? null : resolveEmptyResponseRetryInstruction({
		provider: input.activeErrorContext.provider,
		modelId: input.activeErrorContext.model,
		modelApi: input.modelApi,
		executionContract: input.executionContract,
		payloadCount,
		aborted: terminalAborted,
		timedOut: terminalTimedOut,
		attempt
	});
	if (nextReasoningOnlyRetryInstruction && retryState.reasoningOnlyAttempts < input.maxReasoningOnlyRetryAttempts) {
		retryState.reasoningOnlyAttempts += 1;
		input.activateInternalPrompt(nextReasoningOnlyRetryInstruction);
		log$3.warn(`reasoning-only assistant turn detected: runId=${runParams.runId} sessionId=${runParams.sessionId} provider=${input.activeErrorContext.provider}/${input.activeErrorContext.model} — retrying ${retryState.reasoningOnlyAttempts}/${input.maxReasoningOnlyRetryAttempts} with visible-answer continuation`);
		return { action: "retry" };
	}
	const reasoningOnlyRetriesExhausted = nextReasoningOnlyRetryInstruction && retryState.reasoningOnlyAttempts >= input.maxReasoningOnlyRetryAttempts;
	if (!emptyAssistantReplyIsSilent && !settledTurnFinalizationAttempted && shouldRetryMissingAssistantTurn({
		payloadCount,
		aborted: terminalAborted,
		promptError,
		timedOut: terminalTimedOut,
		attempt
	}) && retryState.missingAssistantAttempts < MAX_MISSING_ASSISTANT_RETRIES) {
		retryState.missingAssistantAttempts += 1;
		input.setSuppressNextUserMessagePersistence(input.activePromptPersisted);
		log$3.warn(`missing assistant terminal message detected: runId=${runParams.runId} sessionId=${runParams.sessionId} provider=${input.activeErrorContext.provider}/${input.activeErrorContext.model} — retrying ${retryState.missingAssistantAttempts}/${MAX_MISSING_ASSISTANT_RETRIES} with same prompt`);
		return { action: "retry" };
	}
	const availableTerminalToolPresentation = input.readTerminalToolPresentation();
	if (!nextReasoningOnlyRetryInstruction && nextEmptyResponseRetryInstruction && retryState.emptyResponseAttempts < input.maxEmptyResponseRetryAttempts) {
		retryState.emptyResponseAttempts += 1;
		input.activateInternalPrompt(nextEmptyResponseRetryInstruction);
		log$3.warn(`empty response detected: runId=${runParams.runId} sessionId=${runParams.sessionId} provider=${input.activeErrorContext.provider}/${input.activeErrorContext.model} — retrying ${retryState.emptyResponseAttempts}/${input.maxEmptyResponseRetryAttempts} with visible-answer continuation`);
		return { action: "retry" };
	}
	const completedEmptyFinalization = input.settledTurnFinalizationOutcome === "completed-empty";
	const terminalAssistantError = isTerminalAssistantError(input.attemptAssistant);
	const incompleteTurnText = emptyAssistantReplyIsSilent || completedEmptyFinalization && !requiresVisibleTerminalReply(runParams) ? null : resolveIncompleteTurnPayloadText({
		payloadCount,
		aborted: terminalAborted,
		externalAbort: externalAbort || signalOwnedInterruption,
		timedOut: terminalTimedOut,
		hadPotentialSideEffects: input.replayState.hadPotentialSideEffects,
		hasIntentionalTerminalCompletion: intentionalTerminalCompletion,
		terminalAuthFailure: input,
		attempt
	});
	const incompleteTurnFallbackSafe = Boolean(incompleteTurnText && !terminalInterrupted && !promptError && !attempt.lastToolError && !hasAttemptTerminalState(attempt) && !terminalAssistantError && !input.replayState.hadPotentialSideEffects);
	const terminalToolPresentation = incompleteTurnFallbackSafe ? availableTerminalToolPresentation : void 0;
	if (!emptyAssistantReplyIsSilent && !settledTurnFinalizationAttempted && (input.attemptCompactionCount > 0 || isCompactionReplayCheckpoint(input.attemptAssistant?.providerReplay)) && payloadCount === 0 && !terminalInterrupted && !promptError && !attempt.clientToolCalls && !attempt.yieldDetected && !attempt.didSendDeterministicApprovalPrompt && !attempt.lastToolError && !terminalAssistantError && !input.replayState.hadPotentialSideEffects && retryState.compactionContinuationAttempts < 1) {
		retryState.compactionContinuationAttempts += 1;
		retryState.compactionContinuationInstruction = COMPACTION_CONTINUATION_RETRY_INSTRUCTION;
		log$3.warn(`compaction interrupted visible final answer: runId=${runParams.runId} sessionId=${runParams.sessionId} compactions=${input.attemptCompactionCount} — retrying ${retryState.compactionContinuationAttempts}/1 with compacted-transcript continuation`);
		input.armPostCompactionGuard();
		return { action: "retry" };
	}
	retryState.compactionContinuationInstruction = null;
	if (reasoningOnlyRetriesExhausted && !input.finalAssistantVisibleText) {
		const incompletePayloadText = "⚠️ Agent couldn't generate a response. Please try again.";
		log$3.warn(`reasoning-only retries exhausted: runId=${runParams.runId} sessionId=${runParams.sessionId} provider=${input.activeErrorContext.provider}/${input.activeErrorContext.model} attempts=${retryState.reasoningOnlyAttempts}/${input.maxReasoningOnlyRetryAttempts} — surfacing incomplete-turn error`);
		return completeEmbeddedRun({
			...input,
			incompleteTurnText: incompletePayloadText,
			payloadCount: 0,
			incompleteTurnFallbackSafe,
			terminalToolPresentation
		});
	}
	if (!nextReasoningOnlyRetryInstruction && nextEmptyResponseRetryInstruction && retryState.emptyResponseAttempts >= input.maxEmptyResponseRetryAttempts) log$3.warn(`empty response retries exhausted: runId=${runParams.runId} sessionId=${runParams.sessionId} provider=${input.activeErrorContext.provider}/${input.activeErrorContext.model} attempts=${retryState.emptyResponseAttempts}/${input.maxEmptyResponseRetryAttempts} — surfacing incomplete-turn error`);
	if (incompleteTurnText) {
		const incompleteStopReason = input.attemptAssistant?.stopReason;
		log$3.warn(`incomplete turn detected: runId=${runParams.runId} sessionId=${runParams.sessionId} provider=${input.activeErrorContext.provider}/${input.activeErrorContext.model} stopReason=${incompleteStopReason ?? "missing"} hasLastAssistant=${attempt.lastAssistant ? "yes" : "no"} hasCurrentAttemptAssistant=${attempt.currentAttemptAssistant ? "yes" : "no"} payloads=${payloadCount} tools=${attempt.toolMetas?.length ?? 0} replaySafe=${attempt.replayMetadata.replaySafe ? "yes" : "no"} compactions=${input.attemptCompactionCount} reasoningRetries=${retryState.reasoningOnlyAttempts}/${input.maxReasoningOnlyRetryAttempts} emptyRetries=${retryState.emptyResponseAttempts}/${input.maxEmptyResponseRetryAttempts} missingAssistantRetries=${retryState.missingAssistantAttempts}/${MAX_MISSING_ASSISTANT_RETRIES} — ` + (terminalToolPresentation ? "surfacing tool-authored terminal presentation" : "surfacing error to user"));
		return completeEmbeddedRun({
			...input,
			incompleteTurnText,
			payloadCount,
			incompleteTurnFallbackSafe,
			terminalToolPresentation
		});
	}
	const beforeFinalizeRevisionReason = attempt.beforeAgentFinalizeRevisionReason;
	if (beforeFinalizeRevisionReason && !settledTurnFinalizationAttempted && !terminalInterrupted && !promptError && !attempt.clientToolCalls && !attempt.yieldDetected && !emptyAssistantReplyIsSilent) {
		retryState.beforeFinalizeRevisionAttempts += 1;
		input.activateInternalPrompt(`${BEFORE_AGENT_FINALIZE_RETRY_PROMPT_PREFIX}\n\n${beforeFinalizeRevisionReason}`);
		retryState.compactionContinuationInstruction = null;
		log$3.warn(`before_agent_finalize requested one more pass: runId=${runParams.runId} sessionId=${runParams.sessionId} attempt=${retryState.beforeFinalizeRevisionAttempts}/3`);
		return { action: "retry" };
	}
	return completeEmbeddedRun({
		...input,
		payloadCount,
		payloadsForTerminalPath,
		emptyAssistantReplyIsSilent,
		intentionalTerminalCompletion
	});
}
async function completeEmbeddedRun(input) {
	const terminalAborted = isEmbeddedRunTerminalAbort(input.terminalState.outcome);
	const terminalTimedOut = isEmbeddedRunTerminalTimeout(input.terminalState.outcome);
	const error = input.incompleteTurnText !== void 0 || classifyAgentRunTerminalOutcome(input.terminalState.outcome) === "failure" ? {
		kind: "incomplete_turn",
		message: formatErrorMessage(projectAgentRunAttemptTerminal(input.attempt.terminal).promptError ?? input.terminalState.outcome.error ?? "Agent couldn't generate a response."),
		fallbackSafe: input.incompleteTurnFallbackSafe ?? false,
		terminalPresentation: input.terminalToolPresentation !== void 0
	} : void 0;
	const incompleteTurnText = input.incompleteTurnText ?? error?.message ?? null;
	const replayInvalid = input.resolveReplayInvalid(incompleteTurnText);
	const yieldHasContinuation = input.attempt.yieldDetected && hasYieldContinuationEvidence(input.attempt);
	const livenessState = !error && input.attempt.yieldDetected ? "paused" : resolveRunLivenessState({
		payloadCount: input.payloadCount,
		aborted: terminalAborted,
		timedOut: terminalTimedOut,
		attempt: input.attempt,
		incompleteTurnText
	});
	const stopReason = error ? void 0 : input.attempt.clientToolCalls ? "tool_calls" : input.attempt.yieldDetected ? "end_turn" : input.attemptAssistant?.stopReason;
	if (error) {
		input.setTerminalLifecycleMeta({
			replayInvalid,
			livenessState
		});
		if (input.authProfileId) try {
			await input.maybeMarkAuthProfileFailure({
				profileId: input.authProfileId,
				reason: input.assistantProfileFailureReason,
				modelId: input.modelId
			});
		} catch (bookkeepingError) {
			log$3.warn(`terminal auth bookkeeping failed; preserving result: ${String(bookkeepingError)}`);
		}
	} else {
		log$3.debug(`embedded run done: runId=${input.runParams.runId} sessionId=${input.runParams.sessionId} durationMs=${Date.now() - input.startedAtMs} aborted=${terminalAborted}`);
		markEmbeddedRunAuthProfileSuccess({
			authProfileStateMode: input.runParams.authProfileStateMode,
			profileId: input.authProfileId,
			profileStore: input.profileFailureStore,
			provider: input.provider,
			agentDir: input.runParams.agentDir,
			runId: input.runParams.runId,
			sessionId: input.runParams.sessionId
		});
		reportEmbeddedRunSuccessfulAuthBinding({
			profileId: input.authProfileId,
			profileStore: input.attemptAuthProfileStore,
			apiKeyInfo: input.apiKeyInfo,
			attempt: input.attempt,
			provider: input.provider,
			agentDir: input.runParams.agentDir,
			modelId: input.modelTransportId,
			modelApi: input.modelTransportApi,
			...input.modelTransportBaseUrl ? { modelBaseUrl: input.modelTransportBaseUrl } : {},
			requestTransportOverrides: input.requestTransportOverrides ?? "none",
			config: input.runParams.config,
			agentHarnessId: input.agentHarnessId,
			pluginHarnessOwnsTransport: input.pluginHarnessOwnsTransport,
			pluginHarnessOwnsAuthBootstrap: input.pluginHarnessOwnsAuthBootstrap,
			onSuccessfulAuthBinding: input.runParams.onSuccessfulAuthBinding
		});
		input.runParams.onSuccessfulAuthProfile?.(input.authProfileId);
	}
	const acceptedSessionSpawnContinuation = shouldContinueInteractiveAcceptedSessionSpawns({
		attempt: input.attempt,
		run: input.runParams
	});
	const keepEmptyReplySilent = input.runParams.lane !== AGENT_LANE_SUBAGENT || Boolean(input.finalAssistantRawText?.trim());
	const hasPartialAssistantText = input.attempt.assistantTexts.some((text) => text.trim().length > 0) || resolveFinalAssistantVisibleText(input.attemptAssistant) !== void 0;
	const isTruncatedPartialReply = stopReason === "length" && !hasAttemptTerminalState(input.attempt) && hasPartialAssistantText;
	const terminalPayloads = input.incompleteTurnText !== void 0 ? [{
		text: input.terminalToolPresentation ? input.terminalToolPresentation.concat("\n\n", input.incompleteTurnText) : input.incompleteTurnText,
		isError: true
	}] : error ? input.payloadsForTerminalPath : input.emptyAssistantReplyIsSilent ? [{ text: SILENT_REPLY_TOKEN }] : input.payloadsForTerminalPath?.length ? isTruncatedPartialReply ? [...input.payloadsForTerminalPath, { text: TRUNCATED_REPLY_NOTICE_TEXT }] : input.payloadsForTerminalPath : acceptedSessionSpawnContinuation ? [{ text: ACCEPTED_SESSION_SPAWN_CONTINUATION_TEXT }] : input.attempt.yieldDetected && !yieldHasContinuation ? [{ text: YIELD_DIAGNOSTIC_TEXT }] : input.payloadsForTerminalPath;
	if (!error) input.setTerminalLifecycleMeta({
		replayInvalid,
		livenessState,
		stopReason,
		yielded: input.attempt.yieldDetected === true
	});
	return {
		action: "complete",
		result: {
			payloads: terminalPayloads?.length ? terminalPayloads : void 0,
			...!error && input.attempt.diagnosticTrace ? { diagnosticTrace: freezeDiagnosticTraceContext(input.attempt.diagnosticTrace) } : {},
			meta: {
				durationMs: Date.now() - input.startedAtMs,
				agentMeta: input.agentMeta,
				aborted: terminalAborted,
				// This private host projection is made only from the final core owner.
				// Model tool args and pending-tool IDs cannot supply its identity.
				...(input.attempt.clientToolCalls?.some((call) => call.name === "openclaw_end_call") ? {
					gptLiveTerminalOutcome: Object.freeze({
						version: 1, source: "embedded_terminal_state",
						classification: classifyAgentRunTerminalOutcome(input.terminalState.outcome),
						reason: input.terminalState.outcome.reason,
						runId: input.runParams.runId, sessionId: input.runParams.sessionId
					})
				} : {}),
				systemPromptReport: input.attempt.systemPromptReport,
				finalPromptText: input.attempt.finalPromptText,
				finalAssistantVisibleText: input.finalAssistantVisibleText,
				finalAssistantRawText: input.finalAssistantRawText,
				replayInvalid,
				livenessState,
				agentHarnessResultClassification: input.attempt.agentHarnessResultClassification,
				...error ? { error } : {
					...input.attempt.yieldDetected ? { yielded: true } : {},
					...input.attempt.yieldAcknowledgment ? { yieldAcknowledgment: input.attempt.yieldAcknowledgment } : {},
					...acceptedSessionSpawnContinuation ? { continuationPending: true } : {},
					...input.emptyAssistantReplyIsSilent && keepEmptyReplySilent ? { terminalReplyKind: "silent-empty" } : {},
					...input.intentionalTerminalCompletion ? { intentionalTerminalCompletion: "tool-batch" } : {},
					stopReason,
					pendingToolCalls: input.attempt.clientToolCalls?.map((call) => ({
						id: randomBytes(5).toString("hex").slice(0, 9),
						name: call.name,
						arguments: JSON.stringify(call.params)
					})),
					executionTrace: {
						winnerProvider: input.reportedModelRef.provider,
						winnerModel: input.reportedModelRef.model,
						attempts: input.traceAttempts.length > 0 || input.attemptAssistant?.provider || input.attemptAssistant?.model ? [...input.traceAttempts, {
							provider: input.reportedModelRef.provider,
							model: input.reportedModelRef.model,
							result: "success",
							stage: "assistant"
						}] : void 0,
						fallbackUsed: input.traceAttempts.some(input.traceAttemptUsesFallback),
						runner: "embedded"
					},
					requestShaping: {
						...input.authProfileId ? { authMode: "auth-profile" } : {},
						...input.thinkLevel ? { thinking: input.thinkLevel } : {},
						...input.runParams.reasoningLevel ? { reasoning: input.runParams.reasoningLevel } : {},
						...input.runParams.verboseLevel ? { verbose: input.runParams.verboseLevel } : {},
						...input.runParams.blockReplyBreak ? { blockStreaming: input.runParams.blockReplyBreak } : {}
					},
					completion: {
						...stopReason ? { stopReason } : {},
						...stopReason ? { finishReason: stopReason } : {},
						...stopReason?.toLowerCase().includes("refusal") ? { refusal: true } : {}
					},
					contextManagement: input.contextRecoveryState.autoCompactionCount > 0 ? { lastTurnCompactions: input.contextRecoveryState.autoCompactionCount } : void 0
				},
				toolSummary: input.attemptToolSummary,
				...input.failureSignal ? { failureSignal: input.failureSignal } : {},
				...input.terminalToolFailure ? { terminalToolFailure: input.terminalToolFailure } : {}
			},
			...copyAttemptDeliveryState(input.attempt)
		}
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/settled-turn-finalization.ts
const MAX_EMPTY_SETTLED_FINALIZATION_ATTEMPTS = 2;
const SETTLED_TOOL_FINALIZATION_FALLBACK_TEXT = "The tool run finished, but no final summary was produced. I did not repeat any completed actions.";
async function prepareTerminalWithSettledTurnFinalization(input) {
	const initial = input.initial;
	let attempt = initial.attempt;
	let lastRunPromptUsage = input.lastRunPromptUsage;
	let prepared = prepareEmbeddedRunTerminal({
		...input.terminalBase,
		attempt,
		currentAttemptCompletedAssistant: initial.currentAttemptCompletedAssistant,
		sessionIdUsed: initial.sessionIdUsed,
		sessionFileUsed: initial.sessionFileUsed,
		lastRunPromptUsage,
		terminalState: initial.terminalState
	});
	const prompt = resolveSettledTurnFinalizationRequest({
		runParams: input.terminalBase.runParams,
		attempt,
		activeErrorContext: input.terminalBase.activeErrorContext,
		modelApi: input.finalization.modelApi,
		executionContract: input.finalization.executionContract,
		payloadsWithToolMedia: prepared.payloadsWithToolMedia,
		recoveredFinalAssistantPayloadsAfterPromptTimeout: prepared.recoveredFinalAssistantPayloadsAfterPromptTimeout,
		hasTerminalToolPresentation: input.finalization.hasTerminalToolPresentation,
		terminalState: initial.terminalState,
		settledTurnFinalizationAvailable: typeof input.finalization.harness.finalizeSettledTurn === "function"
	});
	if (!prompt) return {
		...initial,
		prepared,
		lastRunPromptUsage,
		finalizationOutcome: "not-attempted"
	};
	const settledFailureSignal = prepared.failureSignal;
	const settledTerminalToolFailure = prepared.terminalToolFailure;
	const committedSessionTarget = resolveCommittedSessionTarget({
		preparedAttempt: input.finalization.preparedAttempt,
		sessionTarget: input.finalization.sessionTarget,
		sessionWriterFence: input.finalization.sessionWriterFence
	});
	const sessionWriterDeliveryAuthority = resolveSessionWriterDeliveryAuthority({
		attempt: input.finalization.preparedAttempt,
		sessionId: committedSessionTarget?.sessionId ?? initial.sessionIdUsed,
		sessionTarget: committedSessionTarget
	});
	const runParams = input.terminalBase.runParams;
	const errorContext = input.terminalBase.activeErrorContext;
	const terminalFallbackAllowed = input.finalization.preparedAttempt.silentExpected !== true;
	log$3.warn(`settled post-tool turn lacked a final answer: runId=${runParams.runId} sessionId=${runParams.sessionId} provider=${errorContext.provider}/${errorContext.model} — running isolated finalization`);
	let finalizationOutcome = "failed";
	try {
		let finalization;
		let finalizationAttempt = 0;
		do {
			finalizationAttempt += 1;
			finalization = await runPreparedSettledTurnFinalization({
				attempt: input.finalization.preparedAttempt,
				settledAttempt: initial.attempt,
				harness: input.finalization.harness,
				prompt,
				createAttemptControls: input.finalization.createAttemptControls,
				abortSignal: input.finalization.abortSignal
			});
			attempt = finalization.attempt;
			mergeUsageIntoAccumulator(input.terminalBase.usageAccumulator, attempt.attemptUsage);
			mergeAttemptRunStatsIntoAccumulator(input.terminalBase.usageAccumulator, attempt);
			lastRunPromptUsage = attempt.attemptUsage ?? lastRunPromptUsage;
			if (finalization.outcome === "empty" && finalizationAttempt < MAX_EMPTY_SETTLED_FINALIZATION_ATTEMPTS) log$3.warn(`settled-turn finalization completed without a visible answer: runId=${runParams.runId} sessionId=${runParams.sessionId} provider=${errorContext.provider}/${errorContext.model} — retrying ${finalizationAttempt}/1 with tools disabled`);
		} while (finalization.outcome === "empty" && finalizationAttempt < MAX_EMPTY_SETTLED_FINALIZATION_ATTEMPTS);
		finalizationOutcome = finalization.outcome;
		if (finalization.outcome === "empty") log$3.warn(`settled-turn finalization completed without a visible answer: runId=${runParams.runId} sessionId=${runParams.sessionId} provider=${errorContext.provider}/${errorContext.model} attempts=${finalizationAttempt}/${MAX_EMPTY_SETTLED_FINALIZATION_ATTEMPTS} — ${terminalFallbackAllowed ? "using terminal fallback reply" : "preserving silent helper failure"}`);
	} catch (error) {
		if (input.finalization.abortSignal.aborted) {
			log$3.warn(`settled-turn finalization was cancelled: runId=${runParams.runId} sessionId=${runParams.sessionId} provider=${errorContext.provider}/${errorContext.model} error=${formatErrorMessage(error)} — preserving cancellation`);
			return {
				...initial,
				prepared,
				lastRunPromptUsage,
				finalizationOutcome: "failed"
			};
		}
		log$3.warn(`settled-turn finalization failed: runId=${runParams.runId} sessionId=${runParams.sessionId} provider=${errorContext.provider}/${errorContext.model} error=${formatErrorMessage(error)} — ${terminalFallbackAllowed ? "using terminal fallback reply" : "preserving silent helper failure"}`);
	}
	if (finalizationOutcome !== "answered" && terminalFallbackAllowed) {
		if (input.finalization.abortSignal.aborted) {
			log$3.warn(`settled-turn fallback was cancelled before transcript persistence: runId=${runParams.runId} sessionId=${runParams.sessionId} provider=${errorContext.provider}/${errorContext.model} — preserving cancellation`);
			return {
				...initial,
				prepared,
				lastRunPromptUsage,
				finalizationOutcome: "failed"
			};
		}
		const transcriptIdempotencyKey = await persistSettledToolFallbackTranscript({
			attempt: input.finalization.preparedAttempt,
			abortSignal: input.finalization.abortSignal,
			sessionId: committedSessionTarget?.sessionId ?? initial.sessionIdUsed,
			sessionTarget: committedSessionTarget
		});
		if (input.finalization.abortSignal.aborted) {
			log$3.warn(`settled-turn fallback was cancelled during transcript persistence: runId=${runParams.runId} sessionId=${runParams.sessionId} provider=${errorContext.provider}/${errorContext.model} — preserving cancellation`);
			return {
				...initial,
				prepared,
				lastRunPromptUsage,
				finalizationOutcome: "failed"
			};
		}
		attempt = buildSettledToolFallbackAttemptResult({
			settledAttempt: initial.attempt,
			sourceAttempt: attempt,
			prompt,
			agentHarnessId: input.finalization.preparedAttempt.agentHarnessId,
			runtimePlan: input.finalization.preparedAttempt.runtimePlan,
			transcriptIdempotencyKey
		});
	}
	const terminalState = {
		outcome: resolveEmbeddedRunAttemptTerminalOutcome({
			attempt,
			assistant: attempt.currentAttemptAssistant
		}),
		signalOwnedInterruption: false
	};
	const finalizedPrepared = prepareEmbeddedRunTerminal({
		...input.terminalBase,
		attempt,
		currentAttemptCompletedAssistant: attempt.currentAttemptCompletedAssistant,
		sessionIdUsed: attempt.sessionIdUsed,
		sessionFileUsed: attempt.sessionFileUsed,
		lastRunPromptUsage,
		terminalState
	});
	finalizedPrepared.payloadsWithToolMedia?.forEach((payload) => {
		markReplyPayloadForSourceSuppressionDelivery(payload);
		if (sessionWriterDeliveryAuthority) setReplyPayloadMetadata(payload, { sessionWriterDeliveryAuthority });
	});
	prepared = {
		...finalizedPrepared,
		failureSignal: settledFailureSignal,
		terminalToolFailure: settledTerminalToolFailure
	};
	return {
		attempt,
		attemptAssistant: attempt.currentAttemptAssistant,
		currentAttemptCompletedAssistant: attempt.currentAttemptCompletedAssistant,
		terminalState,
		attemptCompactionCount: 0,
		sessionIdUsed: attempt.sessionIdUsed,
		sessionFileUsed: attempt.sessionFileUsed,
		prepared,
		lastRunPromptUsage,
		finalizationOutcome: finalizationOutcome === "empty" ? "completed-empty" : finalizationOutcome
	};
}
function resolveSessionWriterDeliveryAuthority(input) {
	const target = input.sessionTarget ?? input.attempt.sessionTarget;
	const sessionKey = target?.sessionKey ?? input.attempt.sessionKey;
	const expectedLifecycleRevision = target?.expectedLifecycleRevision;
	const expectedWriterRunId = target?.expectedWriterRunId;
	if (!sessionKey || expectedLifecycleRevision === void 0 && expectedWriterRunId === void 0) return;
	return {
		...target?.agentId || input.attempt.agentId ? { agentId: target?.agentId ?? input.attempt.agentId } : {},
		expectedSessionId: input.sessionId,
		...expectedLifecycleRevision !== void 0 ? { expectedLifecycleRevision } : {},
		...expectedWriterRunId !== void 0 ? { expectedWriterRunId } : {},
		sessionKey,
		...target?.storePath ? { storePath: target.storePath } : {}
	};
}
function resolveCommittedSessionTarget(input) {
	const preparedTarget = input.preparedAttempt.sessionTarget;
	if (!preparedTarget && !input.sessionTarget && !input.sessionWriterFence) return;
	return {
		...preparedTarget,
		...input.sessionTarget,
		...input.sessionWriterFence
	};
}
async function runPreparedSettledTurnFinalization(input) {
	const controls = input.createAttemptControls({
		admittedRunContext: input.attempt.admittedRunContext,
		abortSignal: input.abortSignal,
		initialTimeoutMs: resolveAgentTimeoutMs({
			cfg: input.attempt.config,
			overrideMs: input.attempt.timeoutMs
		})
	});
	try {
		const finalization = await runEmbeddedSettledTurnFinalizationWithBackend({
			...input.attempt,
			abortSignal: controls.abortSignal,
			onAttemptDeadlineChanged: controls.onAttemptDeadlineChanged,
			onAttemptTimeout: controls.onAttemptTimeout,
			onAttemptAbort: controls.onAttemptAbort,
			onAttemptTimeoutArmed: void 0,
			operation: "settled-tool-finalization",
			prompt: input.prompt,
			disableTools: true,
			skipPreparedUserTurnMessage: true,
			suppressNextUserMessagePersistence: true,
			initialReplayState: {
				replayInvalid: false,
				hadPotentialSideEffects: false
			}
		}, input.settledAttempt, input.harness);
		return {
			outcome: finalization.outcome,
			attempt: buildSettledTurnFinalizationAttemptResult({
				outcome: finalization.outcome,
				result: finalization.result,
				settledAttempt: input.settledAttempt,
				prompt: input.prompt,
				agentHarnessId: input.attempt.agentHarnessId,
				runtimePlan: input.attempt.runtimePlan
			})
		};
	} finally {
		controls.close();
	}
}
function buildSettledTurnFinalizationAttemptResult(input) {
	const { result, settledAttempt } = input;
	const text = input.outcome === "empty" ? "" : resolveSettledTurnFinalizationText(result);
	return {
		terminal: { kind: "ok" },
		sessionIdUsed: settledAttempt.sessionIdUsed,
		sessionFileUsed: settledAttempt.sessionFileUsed,
		...input.agentHarnessId ? { agentHarnessId: input.agentHarnessId } : {},
		modelAttempt: resolveRuntimeModelAttempt(input.runtimePlan),
		contextTokens: settledAttempt.contextTokens,
		contextTokensSource: settledAttempt.contextTokensSource,
		authBindingFingerprint: settledAttempt.authBindingFingerprint,
		runtimeArtifact: settledAttempt.runtimeArtifact,
		systemPromptReport: settledAttempt.systemPromptReport,
		finalPromptText: input.prompt,
		...copyAttemptDeliveryState(settledAttempt),
		messagesSnapshot: [...settledAttempt.messagesSnapshot, result.assistant],
		assistantTexts: [text],
		assistantTranscriptOwned: result.assistantTranscriptOwned,
		assistantTranscriptIdempotencyKey: result.assistantTranscriptIdempotencyKey,
		lastAssistantTextMessageIndex: result.assistantMessageIndex,
		lastAssistant: result.assistant,
		currentAttemptAssistant: result.assistant,
		currentAttemptCompletedAssistant: result.assistant,
		toolMetas: settledAttempt.toolMetas,
		successfulNestedToolNames: settledAttempt.successfulNestedToolNames,
		hasToolMediaBlockReply: false,
		cloudCodeAssistFormatError: false,
		attemptUsage: result.usage,
		codeModeEngaged: settledAttempt.codeModeEngaged,
		assistantTurns: 1,
		replayMetadata: {
			hadPotentialSideEffects: false,
			replaySafe: true
		},
		currentAttemptReplayMetadata: {
			hadPotentialSideEffects: false,
			replaySafe: true
		},
		itemLifecycle: {
			startedCount: 0,
			completedCount: 0,
			activeCount: 0
		},
		diagnosticTrace: result.diagnosticTrace
	};
}
function buildSettledToolFallbackAttemptResult(input) {
	const sourceAssistant = input.sourceAttempt.currentAttemptAssistant ?? input.sourceAttempt.lastAssistant ?? input.settledAttempt.currentAttemptAssistant ?? input.settledAttempt.lastAssistant ?? resolveSettledToolBatchEvidence(input.settledAttempt).assistant;
	if (!sourceAssistant) throw new Error("Settled-turn fallback has no assistant identity");
	return buildSettledTurnFinalizationAttemptResult({
		outcome: "answered",
		result: {
			assistant: {
				...sourceAssistant,
				content: [{
					type: "text",
					text: SETTLED_TOOL_FINALIZATION_FALLBACK_TEXT
				}],
				openclawDelivery: void 0,
				stopReason: "stop",
				errorMessage: void 0,
				errorCode: void 0,
				errorType: void 0,
				errorBody: void 0,
				timestamp: Date.now()
			},
			usage: input.sourceAttempt.attemptUsage,
			diagnosticTrace: input.sourceAttempt.diagnosticTrace,
			...input.transcriptIdempotencyKey ? {
				assistantTranscriptOwned: true,
				assistantTranscriptIdempotencyKey: input.transcriptIdempotencyKey
			} : {}
		},
		settledAttempt: input.settledAttempt,
		prompt: input.prompt,
		agentHarnessId: input.agentHarnessId,
		runtimePlan: input.runtimePlan
	});
}
async function persistSettledToolFallbackTranscript(input) {
	const target = input.sessionTarget ?? input.attempt.sessionTarget;
	const sessionKey = target?.sessionKey ?? input.attempt.sessionKey;
	const hasWriterFence = target?.expectedLifecycleRevision !== void 0 || target?.expectedWriterRunId !== void 0;
	if (!sessionKey) {
		if (hasWriterFence) throw new SessionTranscriptWriterClaimReboundError();
		return;
	}
	const idempotencyKey = `${input.attempt.runId}:settled-finalization-fallback`;
	try {
		const result = await appendAssistantMirrorMessageByIdentity({
			...target?.agentId || input.attempt.agentId ? { agentId: target?.agentId ?? input.attempt.agentId } : {},
			sessionId: input.sessionId,
			sessionKey,
			...target?.storePath ? { storePath: target.storePath } : {},
			...target?.expectedLifecycleRevision !== void 0 ? { expectedLifecycleRevision: target.expectedLifecycleRevision } : {},
			...target?.expectedWriterRunId !== void 0 ? { expectedWriterRunId: target.expectedWriterRunId } : {},
			config: input.attempt.config,
			idempotencyKey,
			signal: input.abortSignal,
			text: SETTLED_TOOL_FINALIZATION_FALLBACK_TEXT
		});
		if (!result.ok) {
			if (hasWriterFence || result.code === "session-rebound") throw new SessionTranscriptWriterClaimReboundError();
			log$3.warn(`settled-turn fallback transcript append skipped: runId=${input.attempt.runId} sessionId=${input.sessionId} reason=${result.reason}`);
			return;
		}
		return idempotencyKey;
	} catch (error) {
		if (error instanceof SessionTranscriptWriterClaimReboundError) throw error;
		log$3.warn(`settled-turn fallback transcript append failed: runId=${input.attempt.runId} sessionId=${input.sessionId} error=${formatErrorMessage(error)}`);
		return;
	}
}
//#endregion
//#region src/agents/embedded-agent-runner/run/terminal-timeout.ts
function resolveEmbeddedRunTerminalTimeout(input) {
	const timeoutFinal = isEmbeddedRunTimeoutFinal(input.attempt);
	if (!input.terminalPrepared.timedOutDuringPrompt || !timeoutFinal && (input.terminalPrepared.hasSuccessfulFinalAssistantAfterPromptTimeout || hasMessagingToolDeliveryEvidence(input.attempt))) return;
	const { idleTimedOut } = projectAgentRunAttemptTerminal(input.attempt.terminal);
	const terminalAborted = isEmbeddedRunTerminalAbort(input.terminalState.outcome);
	const terminalTimedOut = isEmbeddedRunTerminalTimeout(input.terminalState.outcome);
	const defaultTimeoutText = idleTimedOut ? "The model did not produce a response before the model idle timeout. Please try again, or increase `models.providers.<id>.timeoutSeconds` for slow local or self-hosted providers. If `agents.defaults.timeoutSeconds` or a run-specific timeout is lower, raise that ceiling too; provider timeouts cannot extend the whole agent run." : "Request timed out before a response was generated. Please try again, or increase `agents.defaults.timeoutSeconds` in your config.";
	const timeoutText = input.attempt.promptTimeoutOutcome?.message?.trim() || defaultTimeoutText;
	const replayInvalid = input.attempt.promptTimeoutOutcome?.replayInvalid ?? input.resolveReplayInvalid(null);
	const livenessState = input.attempt.promptTimeoutOutcome?.livenessState ?? resolveRunLivenessState({
		payloadCount: input.terminalPrepared.hasPartialAssistantTextAfterPromptTimeout ? 0 : input.terminalPrepared.payloads?.length ?? 0,
		aborted: terminalAborted,
		timedOut: terminalTimedOut,
		attempt: input.attempt,
		incompleteTurnText: null
	});
	const timeoutPhase = input.attempt.promptTimeoutOutcome?.timeoutPhase ?? input.terminalState.outcome.timeoutPhase;
	const providerStarted = input.attempt.promptTimeoutOutcome?.providerStarted ?? input.terminalState.outcome.providerStarted;
	const timeoutAttribution = {
		...timeoutPhase ? { timeoutPhase } : {},
		...typeof providerStarted === "boolean" ? { providerStarted } : {}
	};
	input.setTerminalLifecycleMeta({
		replayInvalid,
		livenessState,
		...timeoutAttribution
	});
	return {
		payloads: [...input.terminalPrepared.hasPartialAssistantTextAfterPromptTimeout && !timeoutFinal ? [] : input.terminalPrepared.payloadsWithToolMedia || [], {
			text: timeoutText,
			isError: true
		}],
		meta: {
			durationMs: Date.now() - input.startedAtMs,
			agentMeta: input.terminalPrepared.agentMeta,
			aborted: terminalAborted,
			systemPromptReport: input.attempt.systemPromptReport,
			finalPromptText: input.attempt.finalPromptText,
			finalAssistantVisibleText: input.terminalPrepared.finalAssistantVisibleText,
			finalAssistantRawText: input.terminalPrepared.finalAssistantRawText,
			replayInvalid,
			livenessState,
			...timeoutAttribution,
			error: {
				kind: "incomplete_turn",
				message: timeoutText,
				fallbackSafe: false
			},
			toolSummary: input.terminalPrepared.attemptToolSummary,
			...input.terminalPrepared.failureSignal ? { failureSignal: input.terminalPrepared.failureSignal } : {},
			...input.terminalPrepared.terminalToolFailure ? { terminalToolFailure: input.terminalPrepared.terminalToolFailure } : {},
			agentHarnessResultClassification: input.attempt.agentHarnessResultClassification
		},
		...copyAttemptDeliveryState(input.attempt)
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/turn-taint-state.ts
/** Sticky current-turn taint shared by retries and runtime-specific tool owners. */
function createAgentTurnTaintState(initiallyTainted = false) {
	let tainted = initiallyTainted;
	return {
		observe(observation) {
			if (!observation.presentationOnly && observation.resultContentSource === "network") tainted = true;
		},
		isTainted: () => tainted
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run-loop.ts
/** Prepared embedded-agent loop. */
async function runPreparedEmbeddedLoop(input) {
	let { runParams: params, provider, modelId } = input;
	const { agentDir, workspaceDir: resolvedWorkspace, globalLane, hookRunner, hookContext: hookCtx, fallbackConfigured, isProbeSession, resolvedSessionKey, resolvedToolResultFormat, startedAtMs: started, startupStages, lifecycleGeneration, suspendForFailure } = input;
	const { notifyExecutionPhase } = input.progressController;
	let startupStagesEmitted = false;
	const preparedRuntime = await measureEmbeddedAgentPreparation("runtime", () => prepareEmbeddedRunRuntime({
		runParams: params,
		provider,
		modelId,
		agentDir,
		workspaceDir: resolvedWorkspace,
		globalLane,
		hookRunner,
		hookContext: hookCtx,
		markStartupStage: (stage) => startupStages.mark(stage),
		notifyExecutionPhase,
		fallbackConfigured,
		preparedModelRuntime: input.preparedModelRuntime
	}), { config: params.config });
	params = {
		...params,
		admittedRunContext: preparedRuntime.admittedRunContext
	};
	const abortSignal = params.abortSignal;
	const accountingAuthority = getAdmittedRunDelegatedAuthority(preparedRuntime.admittedRunContext);
	const assertAdmittedActive = resolveAdmittedRunActiveAssertion(preparedRuntime.admittedRunContext, abortSignal);
	const admittedRunInput = {
		...input,
		runParams: params
	};
	({provider, modelId} = preparedRuntime);
	const { model, attemptAuthProfileStore, profileCandidates, profileFailureStore, pluginHarnessOwnsAuthBootstrap, attemptedThinking, maybeRefreshRuntimeAuthForAuthError, getApiKeyInfo } = preparedRuntime;
	let { agentHarness, pluginHarnessOwnsTransport, effectiveModel, outerContextTokenMeta, thinkLevel, lastProfileId } = preparedRuntime.snapshot();
	const refreshPreparedRuntimeSnapshot = () => {
		({agentHarness, pluginHarnessOwnsTransport, effectiveModel, outerContextTokenMeta, thinkLevel, lastProfileId} = preparedRuntime.snapshot());
	};
	const traceAttempts = [];
	const traceAttemptUsesFallback = (attempt) => attempt.result === "rotate_profile" || attempt.result === "fallback_model";
	const resolveRuntimeFallbackReason = () => {
		return traceAttempts.findLast((attempt) => attempt.result === "fallback_model" && typeof attempt.reason === "string")?.reason ?? lastRetryFailoverReason ?? null;
	};
	const buildEmbeddedContextEngineRuntimeSettings = (settingsParams) => {
		return buildContextEngineRuntimeSettings({
			contextEngineHost: OPENCLAW_EMBEDDED_CONTEXT_ENGINE_HOST,
			provider,
			requestedModel: preparedRuntime.requestedModelId,
			resolvedModel: modelId,
			selectedContextEngineId: contextEngine.info.id,
			contextEngineSelectionSource: contextEngine.info.id === "legacy" ? "default" : "configured",
			promptTokenBudget: settingsParams.tokenBudget,
			maxOutputTokens: settingsParams.maxOutputTokens,
			fallbackReason: resolveRuntimeFallbackReason(),
			degradedReason: settingsParams.degradedReason
		});
	};
	const { sessionAgentId } = resolveSessionAgentIds({
		sessionKey: params.sessionKey,
		config: params.config,
		agentId: params.agentId
	});
	const executionContract = isStrictAgenticExecutionContractActive({
		config: params.config,
		sessionKey: params.sessionKey,
		agentId: params.agentId,
		provider,
		modelId
	}) ? "strict-agentic" : "default";
	const runRetryBudget = createRunRetryBudget(resolveMaxRunRetryIterations(profileCandidates.length));
	const contextRecoveryState = createEmbeddedRunContextRecoveryState();
	let bootstrapPromptWarningSignaturesSeen = params.bootstrapPromptWarningSignaturesSeen ?? (params.bootstrapPromptWarningSignature ? [params.bootstrapPromptWarningSignature] : []);
	const usageAccumulator = createUsageAccumulator();
	let lastRunPromptUsage;
	let overloadProfileRotations = 0;
	const terminalRetryState = createEmbeddedRunTerminalRetryState();
	const idleTimeoutBreakerState = createIdleTimeoutBreakerState();
	const postCompactionGuard = createPostCompactionLoopGuard({ enabled: resolveToolLoopDetectionConfig({
		cfg: params.config,
		agentId: sessionAgentId
	})?.enabled !== false });
	let postCompactionAbortController;
	let postCompactionAbortError;
	const terminalToolPresentation = createTerminalToolPresentationTracker();
	const turnTaintState = createAgentTurnTaintState(params.initialTurnTainted === true);
	const observeToolOutcome = (observation) => {
		terminalToolPresentation.observe(observation);
		turnTaintState.observe(observation);
		if (observation.presentationOnly) return;
		const verdict = postCompactionGuard.observe(observation);
		if (verdict.shouldAbort) {
			postCompactionAbortError ??= PostCompactionLoopPersistedError.fromVerdict(verdict);
			input.laneController.laneTaskAbortController.abort(postCompactionAbortError);
			postCompactionAbortController?.abort(postCompactionAbortError);
		}
	};
	let lastRetryFailoverReason = null;
	let codexAppServerRecoveryRetries = 0;
	let emptyErrorRetries = 0;
	const sessionPromptState = createEmbeddedRunSessionPromptState({
		runParams: params,
		sessionAgentId,
		resolvedSessionKey,
		lifecycleGeneration
	});
	const originalCompactionTarget = { ...sessionPromptState.sessionTarget };
	const durableCompactionAccounting = params.sessionPersistence !== "detached" && !(params.sessionManager && !params.sessionManager.getSessionTarget());
	const permissionChanges = createEmbeddedRunPermissionChanges(params);
	const failoverRetryController = createEmbeddedRunFailoverRetryController({
		runParams: params,
		provider,
		modelId,
		globalLane,
		agentDir,
		fallbackConfigured,
		profileFailureStore,
		getLastProfileId: () => preparedRuntime.snapshot().lastProfileId,
		getSessionId: () => sessionPromptState.sessionId,
		harnessOwnsTransport: () => preparedRuntime.snapshot().pluginHarnessOwnsTransport,
		getRuntimeAuthOwnerId: () => preparedRuntime.snapshot().agentHarness.id,
		getApiKeyInfo,
		advanceAuthProfile: preparedRuntime.advanceAttemptAuthProfile
	});
	const ownsContextEngineLogicalTurnLease = params.contextEngineLogicalTurnLease === void 0;
	const contextEngineLogicalTurnLease = params.contextEngineLogicalTurnLease ?? await measureEmbeddedAgentPreparation("context-engine", () => createContextEngineLogicalTurnLease({
		config: params.config,
		agentDir,
		workspaceDir: resolvedWorkspace
	}), { config: params.config });
	const ownedContextEngineLease = ownsContextEngineLogicalTurnLease ? contextEngineLogicalTurnLease : void 0;
	selectContextEngineForTranscriptHost({
		lease: contextEngineLogicalTurnLease,
		host: {
			id: `agent-harness:${agentHarness.id}`,
			label: `agent harness "${agentHarness.id}"`,
			capabilities: agentHarness.contextEngineHostCapabilities ?? []
		},
		operation: "agent-run",
		recorder: params.userTurnTranscriptRecorder
	});
	await drainPendingContextEngineTurnsBeforeRun({
		admission: params.userTurnTranscriptRecorder?.getAdmissionReceipt(),
		isHeartbeat: isHeartbeatLifecycleRunKind(params.bootstrapContextRunKind),
		lease: contextEngineLogicalTurnLease,
		recorder: params.userTurnTranscriptRecorder,
		sessionTarget: params.sessionTarget
	});
	const contextEngine = contextEngineLogicalTurnLease.begin().engine;
	const resolveContextEnginePluginId = () => contextEngineLogicalTurnLease.effectiveEnginePluginId ?? resolveContextEngineOwnerPluginId(contextEngine);
	startupStages.mark("context-engine");
	notifyExecutionPhase("context_engine", {
		provider,
		model: modelId
	});
	try {
		const compactionRuntime = createEmbeddedRunCompactionRuntime({
			runParams: params,
			contextEngine,
			hookRunner,
			hookContext: hookCtx,
			sessionPromptState
		});
		let authRetryPending = false;
		let accumulatedReplayState = createEmbeddedRunReplayState();
		const attemptCarryover = createAttemptCarryover();
		while (true) {
			abortSignal?.throwIfAborted();
			if (!assertAdmittedActive) throw new Error("embedded run requires an active admitted run");
			assertAdmittedActive();
			refreshPreparedRuntimeSnapshot();
			if (isRunRetryBudgetExhausted(runRetryBudget)) {
				const message = `Exceeded retry limit after ${runRetryBudget.attemptsDispatched} attempts (counted attempts=${runRetryBudget.attemptsCounted}, max=${runRetryBudget.maxAttempts}).`;
				log$3.error(`[run-retry-limit] sessionKey=${params.sessionKey ?? params.sessionId} provider=${provider}/${modelId} attempts=${runRetryBudget.attemptsDispatched} countedAttempts=${runRetryBudget.attemptsCounted} maxAttempts=${runRetryBudget.maxAttempts}`);
				return handleRetryLimitExhaustion({
					message,
					decision: resolveRunFailoverDecision({
						stage: "retry_limit",
						fallbackConfigured,
						failoverReason: lastRetryFailoverReason
					}),
					provider,
					model: modelId,
					profileId: lastProfileId,
					durationMs: Date.now() - started,
					agentMeta: buildErrorAgentMeta({
						sessionId: sessionPromptState.sessionId,
						sessionFile: sessionPromptState.sessionFile,
						...attemptCarryover.modelAttempt ?? {
							provider,
							model: model.id
						},
						...outerContextTokenMeta,
						usageAccumulator,
						lastRunPromptUsage
					}),
					replayInvalid: accumulatedReplayState.replayInvalid ? true : void 0,
					livenessState: "blocked"
				});
			}
			beginRunAttempt(runRetryBudget);
			const runtimeAuthRetry = authRetryPending;
			authRetryPending = false;
			attemptedThinking.add(thinkLevel);
			const codexAppServerRecoveryRetryAvailable = hasCodexAppServerRecoveryRetryBudget({
				alreadyRetried: codexAppServerRecoveryRetries > 0,
				runLoopIterations: runRetryBudget.attemptsCounted,
				maxRunLoopIterations: runRetryBudget.maxAttempts
			});
			let recordedCompactionCount = 0;
			const attemptRunInput = {
				...admittedRunInput,
				runParams: {
					...params,
					onContextAccountingEvent: (event) => {
						if (event.kind === "compaction") recordedCompactionCount += 1;
						contextRecoveryState.observeContextAccounting(event);
					}
				}
			};
			let dispatch;
			try {
				dispatch = await sessionPromptState.withSessionWriterContext(() => prepareAndDispatchEmbeddedRunAttempt({
					permissionChange: permissionChanges.forAttempt(),
					runInput: attemptRunInput,
					preparedRuntime,
					contextEngine,
					sessionPromptState,
					terminalRetryState,
					replayState: accumulatedReplayState,
					provider,
					modelId,
					startupStagesEmitted,
					bootstrapPromptWarningSignaturesSeen,
					resolveRuntimeFallbackReason,
					observeToolOutcome,
					isTurnTainted: turnTaintState.isTainted,
					allocateToolOutcomeOrdinal: terminalToolPresentation.allocateOrdinal,
					getPostCompactionAbortError: () => postCompactionAbortError,
					setPostCompactionAbortController: (controller) => {
						postCompactionAbortController = controller;
					},
					clearPostCompactionAbortController: (controller) => {
						if (postCompactionAbortController === controller) postCompactionAbortController = void 0;
					}
				}));
			} catch (error) {
				const retryTrace = await failoverRetryController.recoverThrownHarnessAuthFailure(error);
				if (!retryTrace) throw error;
				traceAttempts.push(retryTrace);
				lastRetryFailoverReason = retryTrace.reason;
				continue;
			}
			startupStagesEmitted = dispatch.startupStagesEmitted;
			const { dispatchedAttempt, runtimePlan } = dispatch;
			failoverRetryController.setTransientRetryBudget(dispatchedAttempt.rawAttempt.providerRetryMaxRetries);
			attemptCarryover.apply(dispatchedAttempt.rawAttempt);
			const normalizedAttempt = await normalizeEmbeddedRunAttempt({
				runInput: admittedRunInput,
				preparedRuntime,
				dispatchedAttempt,
				recordedCompactionCount,
				sessionPromptState,
				provider,
				modelId,
				bootstrapPromptWarningSignaturesSeen,
				usageAccumulator,
				lastRunPromptUsage,
				idleTimeoutBreakerState,
				contextRecoveryState,
				replayState: accumulatedReplayState,
				lastRetryFailoverReason
			});
			if (normalizedAttempt.action === "complete") return normalizedAttempt.result;
			if (normalizedAttempt.action === "retry") {
				bootstrapPromptWarningSignaturesSeen = normalizedAttempt.bootstrapPromptWarningSignaturesSeen;
				lastRunPromptUsage = normalizedAttempt.lastRunPromptUsage;
				accumulatedReplayState = normalizedAttempt.replayState;
				recordRunRetry(runRetryBudget, normalizedAttempt.retryKind);
				continue;
			}
			bootstrapPromptWarningSignaturesSeen = normalizedAttempt.bootstrapPromptWarningSignaturesSeen;
			lastRunPromptUsage = normalizedAttempt.lastRunPromptUsage;
			accumulatedReplayState = normalizedAttempt.replayState;
			if (permissionChanges.prepareRestart()) {
				input.laneController.throwIfAborted();
				sessionPromptState.continueFromCurrentTranscript();
				recordRunRetry(runRetryBudget, "progress_continuation");
				continue;
			}
			const { attempt, sessionIdUsed, sessionFileUsed, currentAttemptAssistant, currentAttemptCompletedAssistant, attemptAssistant, terminalState, setTerminalLifecycleMeta, attemptCompactionCount, activeErrorContext, resolveReplayInvalidForAttempt } = normalizedAttempt;
			const recovery = await recoverEmbeddedRunAttempt({
				runInput: admittedRunInput,
				preparedRuntime,
				normalizedAttempt,
				runtimePlan,
				sessionPromptState,
				failoverRetryController,
				compactionRuntime,
				contextEngine,
				contextRecoveryState,
				resolveContextEnginePluginId,
				buildRuntimeSettings: buildEmbeddedContextEngineRuntimeSettings,
				armPostCompactionGuard: () => postCompactionGuard.armPostCompaction(),
				usageAccumulator,
				lastRunPromptUsage,
				runtimeAuthRetry,
				codexAppServerRecoveryRetryAvailable,
				codexAppServerRecoveryRetries,
				lastRetryFailoverReason,
				traceAttempts,
				sessionAgentId
			});
			if (recovery.action === "complete") return recovery.result;
			if (recovery.action === "retry") {
				thinkLevel = recovery.thinkLevel;
				authRetryPending = recovery.authRetryPending;
				codexAppServerRecoveryRetries = recovery.codexAppServerRecoveryRetries;
				lastRetryFailoverReason = recovery.lastRetryFailoverReason;
				continue;
			}
			const assistantFailureOutcome = await handleEmbeddedAssistantFailure({
				runParams: params,
				attempt,
				attemptAssistant,
				currentAttemptAssistant,
				terminalState,
				activeErrorContext,
				provider,
				providerOwner: preparedRuntime.snapshot().providerRuntimeHandle.plugin,
				modelId,
				model: model.id,
				thinkLevel,
				getThinkLevel: () => preparedRuntime.snapshot().thinkLevel,
				attemptedThinking,
				fallbackConfigured,
				pluginHarnessOwnsTransport,
				authProfileId: lastProfileId,
				authProfileStore: attemptAuthProfileStore,
				runtimeAuthRetry,
				maybeRefreshRuntimeAuthForAuthError,
				resolveAuthProfileFailureReason: failoverRetryController.resolveAuthProfileFailureReason,
				emptyErrorRetries,
				overloadProfileRotations,
				overloadProfileRotationLimit: failoverRetryController.overloadProfileRotationLimit,
				previousRetryFailoverReason: lastRetryFailoverReason,
				maybeMarkAuthProfileFailure: failoverRetryController.maybeMarkAuthProfileFailure,
				maybeRetryTransient: failoverRetryController.maybeRetryTransient,
				getTransientRetryCount: () => failoverRetryController.transientRetryCount,
				advanceAuthProfile: failoverRetryController.advanceAuthProfile,
				advanceRateLimitAuthProfile: failoverRetryController.advanceRateLimitAuthProfile,
				traceAttempts,
				suspendForFailure,
				suspensionSessionId: sessionPromptState.sessionId ?? params.sessionId,
				agentDir,
				isProbeSession
			});
			thinkLevel = assistantFailureOutcome.thinkLevel;
			preparedRuntime.setThinkLevel(thinkLevel);
			authRetryPending = assistantFailureOutcome.authRetryPending;
			emptyErrorRetries = assistantFailureOutcome.emptyErrorRetries;
			overloadProfileRotations = assistantFailureOutcome.overloadProfileRotations;
			lastRetryFailoverReason = assistantFailureOutcome.lastRetryFailoverReason;
			if (assistantFailureOutcome.action === "retry") continue;
			if (advanceCodeModeRecovery({
				attempt,
				hostOwnsToolSurface: !pluginHarnessOwnsTransport,
				retryState: terminalRetryState,
				activateInternalPrompt: sessionPromptState.activateInternalPrompt
			})) continue;
			let assistantProfileFailureReason = assistantFailureOutcome.assistantProfileFailureReason;
			const terminalToolPresentationText = terminalToolPresentation.read();
			const finalizedTerminal = await prepareTerminalWithSettledTurnFinalization({
				initial: {
					attempt,
					attemptAssistant,
					currentAttemptCompletedAssistant,
					sessionIdUsed,
					sessionFileUsed,
					terminalState,
					attemptCompactionCount
				},
				terminalBase: {
					runParams: params,
					provider,
					providerOwner: preparedRuntime.snapshot().providerRuntimeHandle.plugin,
					model: model.id,
					activeErrorContext,
					authProfileStore: attemptAuthProfileStore,
					authProfileId: lastProfileId,
					outerContextTokenMeta,
					usageAccumulator,
					contextRecoveryState,
					resolvedToolResultFormat
				},
				lastRunPromptUsage,
				finalization: {
					preparedAttempt: dispatchedAttempt.preparedAttempt,
					sessionTarget: sessionPromptState.sessionTarget,
					sessionWriterFence: sessionPromptState.sessionWriterFence,
					harness: agentHarness,
					modelApi: effectiveModel.api,
					executionContract,
					hasTerminalToolPresentation: Boolean(terminalToolPresentationText),
					createAttemptControls: input.laneController.createAttemptControls,
					abortSignal: input.laneController.abortSignal
				}
			});
			const { attempt: terminalAttempt, attemptAssistant: terminalAttemptAssistant, terminalState: resolvedTerminalState, attemptCompactionCount: terminalAttemptCompactionCount, prepared: terminalPrepared, finalizationOutcome: settledTurnFinalizationOutcome } = finalizedTerminal;
			lastRunPromptUsage = finalizedTerminal.lastRunPromptUsage;
			if (settledTurnFinalizationOutcome === "answered" || settledTurnFinalizationOutcome === "completed-empty") assistantProfileFailureReason = null;
			const { agentMeta, reportedModelRef, finalAssistantVisibleText, finalAssistantRawText, payloadsWithToolMedia, recoveredFinalAssistantPayloadsAfterPromptTimeout, attemptToolSummary, failureSignal, terminalToolFailure } = terminalPrepared;
			const terminalTimeoutResult = resolveEmbeddedRunTerminalTimeout({
				terminalPrepared,
				attempt: terminalAttempt,
				terminalState: resolvedTerminalState,
				resolveReplayInvalid: resolveReplayInvalidForAttempt,
				setTerminalLifecycleMeta,
				startedAtMs: started
			});
			if (terminalTimeoutResult) return terminalTimeoutResult;
			const terminalAuthPlan = preparedRuntime.snapshot().activePreparedAuthPlan;
			const requestTransportOverrides = terminalAuthPlan.modelRoute?.requestTransportOverrides ?? terminalAuthPlan.deferredRouteSupport?.requestTransportOverrides ?? "none";
			const terminalResolution = await resolveEmbeddedRunTerminal({
				runParams: params,
				retryState: terminalRetryState,
				attempt: terminalAttempt,
				attemptAssistant: terminalAttemptAssistant,
				activeErrorContext,
				modelApi: effectiveModel.api,
				executionContract,
				terminalState: resolvedTerminalState,
				payloadsWithToolMedia,
				recoveredFinalAssistantPayloadsAfterPromptTimeout,
				finalAssistantVisibleText,
				finalAssistantRawText,
				agentMeta,
				attemptToolSummary,
				failureSignal,
				terminalToolFailure,
				maxReasoningOnlyRetryAttempts: 2,
				maxEmptyResponseRetryAttempts: 1,
				attemptCompactionCount: terminalAttemptCompactionCount,
				replayState: accumulatedReplayState,
				activePromptPersisted: sessionPromptState.activePrompt.persisted,
				activateInternalPrompt: sessionPromptState.activateInternalPrompt,
				setSuppressNextUserMessagePersistence: (value) => {
					sessionPromptState.suppressNextUserMessagePersistence = value;
				},
				armPostCompactionGuard: () => postCompactionGuard.armPostCompaction(),
				readTerminalToolPresentation: () => terminalToolPresentationText,
				resolveReplayInvalid: resolveReplayInvalidForAttempt,
				setTerminalLifecycleMeta,
				maybeMarkAuthProfileFailure: failoverRetryController.maybeMarkAuthProfileFailure,
				assistantProfileFailureReason,
				startedAtMs: started,
				provider,
				modelId,
				modelTransportId: effectiveModel.id ?? modelId,
				modelTransportApi: effectiveModel.api ?? model.api,
				...effectiveModel.baseUrl ? { modelTransportBaseUrl: effectiveModel.baseUrl } : {},
				requestTransportOverrides,
				authProfileId: lastProfileId,
				profileFailureStore,
				attemptAuthProfileStore,
				apiKeyInfo: getApiKeyInfo(),
				agentHarnessId: agentHarness.id,
				settledTurnFinalizationOutcome,
				pluginHarnessOwnsTransport,
				pluginHarnessOwnsAuthBootstrap,
				reportedModelRef,
				traceAttempts,
				traceAttemptUsesFallback,
				thinkLevel,
				contextRecoveryState
			});
			__vCodexTurnTail().mark(admittedRunInput.runParams.runId, "normalize"); // V codex-turn-tail-v1
			if (terminalResolution.action === "retry") continue;
			return terminalResolution.result;
		}
	} finally {
		permissionChanges.close();
		await settleEmbeddedRun({
			runInput: admittedRunInput,
			runtime: preparedRuntime,
			compaction: {
				state: contextRecoveryState,
				session: sessionPromptState,
				originalTarget: originalCompactionTarget,
				durable: durableCompactionAccounting,
				authority: accountingAuthority
			},
			ownedContextEngineLease
		});
		{
			// V codex-turn-tail-v1: one line per Codex run tail
			const vTailRunId = admittedRunInput.runParams.runId;
			__vCodexTurnTail().mark(vTailRunId, "settle");
			const vTail = __vCodexTurnTail().end(vTailRunId);
			if (vTail) log$3.info(`[codex-turn-tail.1] ${JSON.stringify(vTail)}`);
		}
	}
}
//#endregion
//#region src/agents/embedded-agent-runner/run-execution.ts
/** Runs one fully prepared embedded-agent request. */
function executePreparedEmbeddedRun(input) {
	return runPreparedEmbeddedLoop(input);
}
//#endregion
//#region src/agents/embedded-agent-runner/run/execution-phase-diagnostics.ts
/**
* Wraps params.onExecutionPhase so every phase transition also emits a
* run.execution_phase diagnostic event. Applied once at the runner entry;
* downstream call sites all read the forwarded callback. Session compaction
* can rotate the session id mid-run, so the wrapper tracks the current id via
* onSessionIdChanged instead of capturing the initial value. The returned
* params always carry both callbacks (the wrapper installs them), so callers
* can invoke them unconditionally.
*/
function withExecutionPhaseDiagnostics(params) {
	const forwardPhase = params.onExecutionPhase;
	const forwardSessionIdChanged = params.onSessionIdChanged;
	let currentSessionId = params.sessionId;
	const onSessionIdChanged = (sessionId) => {
		currentSessionId = sessionId;
		forwardSessionIdChanged?.(sessionId);
	};
	const onExecutionPhase = (info) => {
		if (areDiagnosticsEnabledForProcess()) emitDiagnosticEvent({
			type: "run.execution_phase",
			runId: params.runId,
			sessionId: currentSessionId,
			sessionKey: params.sessionKey,
			...info
		});
		forwardPhase?.(info);
	};
	return {
		...params,
		onExecutionPhase,
		onSessionIdChanged
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/failure-suspension.ts
function buildEmbeddedFailureSuspension(params) {
	return {
		...params.suspension,
		agentId: params.suspension.agentId ?? params.runAgentId
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/lane-controller.ts
function createEmbeddedRunLaneController(options) {
	const initialParams = options.getParams();
	const sessionLanePolicy = resolveEmbeddedRunSessionLanePolicy(initialParams.trigger, initialParams.inputProvenance);
	const laneTaskTimeoutMs = resolveEmbeddedRunLaneTimeoutMs(initialParams.timeoutMs);
	const laneTaskAbortController = new AbortController();
	const laneTaskReleaseController = new AbortController();
	const abortSignal = AbortSignal.any([
		...initialParams.abortSignal ? [initialParams.abortSignal] : [],
		laneTaskAbortController.signal,
		laneTaskReleaseController.signal
	]);
	let laneTaskProgressAtMs = Date.now();
	let laneTaskDeadline;
	let notifyLaneTaskDeadline;
	const setLaneTaskDeadline = (deadline) => {
		laneTaskDeadline = deadline?.kind === "bounded" ? {
			kind: "bounded",
			deadlineAtMs: deadline.deadlineAtMs + EMBEDDED_RUN_LANE_TIMEOUT_GRACE_MS
		} : deadline;
		notifyLaneTaskDeadline?.(laneTaskDeadline);
	};
	let releaseQueuedRunContext;
	let queuedRunAbortSignal;
	let releaseCapacityWait;
	const endCapacityWait = () => {
		releaseCapacityWait?.();
		releaseCapacityWait = void 0;
	};
	const noteCapacityWait = () => {
		const params = options.getParams();
		if (!params.abortSignal?.aborted) releaseCapacityWait = registerAgentRunCapacityWait(params.runId, options.getLifecycleGeneration());
	};
	const releaseQueuedContext = (outcome) => {
		endCapacityWait();
		queuedRunAbortSignal?.removeEventListener("abort", abandonQueuedContext);
		queuedRunAbortSignal = void 0;
		releaseQueuedRunContext?.(outcome);
	};
	const abandonQueuedContext = () => {
		releaseQueuedContext("abandoned");
	};
	const noteLaneTaskProgress = () => {
		laneTaskProgressAtMs = Date.now();
	};
	let activeAttemptOwner;
	const createAttemptControls = (input) => {
		const owner = {};
		activeAttemptOwner = owner;
		const lifecycleGeneration = options.getLifecycleGeneration();
		const authority = getAdmittedRunDelegatedAuthority(input.admittedRunContext);
		const signal = input.abortSignal ? AbortSignal.any([abortSignal, input.abortSignal]) : abortSignal;
		let state = "active";
		let deadlineOwned = false;
		let timeoutReleaseTimer;
		const isCurrent = () => state === "active" && activeAttemptOwner === owner && !signal.aborted && isAgentEventLifecycleGenerationCurrent(lifecycleGeneration) && authority !== void 0 && getAdmittedRunDelegatedAuthority(input.admittedRunContext) === authority;
		const onAttemptDeadlineChanged = (deadline) => {
			if (isCurrent()) {
				deadlineOwned = true;
				setLaneTaskDeadline(deadline);
			}
		};
		if (input.initialTimeoutMs !== void 0) onAttemptDeadlineChanged(input.initialTimeoutMs >= 2147e6 ? { kind: "unlimited" } : {
			kind: "bounded",
			deadlineAtMs: Date.now() + input.initialTimeoutMs
		});
		return {
			abortSignal: signal,
			onAttemptDeadlineChanged,
			onAttemptTimeout: (reason) => {
				if (isCurrent() && !timeoutReleaseTimer) {
					timeoutReleaseTimer = setTimeout(() => {
						if (isCurrent()) laneTaskReleaseController.abort(reason);
					}, EMBEDDED_RUN_LANE_TIMEOUT_GRACE_MS);
					timeoutReleaseTimer.unref?.();
				}
			},
			onAttemptAbort: () => {
				if (!isCurrent()) return;
				state = "aborted";
				laneTaskAbortController.abort(createAgentRunDirectAbortError());
				input.onAbort?.();
			},
			close: () => {
				if (state === "closed") return;
				state = "closed";
				clearTimeout(timeoutReleaseTimer);
				if (activeAttemptOwner === owner) {
					activeAttemptOwner = void 0;
					noteLaneTaskProgress();
					if (deadlineOwned) setLaneTaskDeadline(void 0);
				}
			}
		};
	};
	const throwIfAborted = () => {
		if (!abortSignal.aborted) return;
		const reason = abortSignal.reason;
		if (reason instanceof Error) throw reason;
		const abortError = reason !== void 0 ? new Error("Operation aborted", { cause: reason }) : /* @__PURE__ */ new Error("Operation aborted");
		abortError.name = "AbortError";
		throw abortError;
	};
	const withLaneTimeout = (opts) => withEmbeddedRunLaneTimeout({
		...opts,
		taskTimeoutProgressAtMs: () => laneTaskProgressAtMs,
		taskTimeoutSubscribe: (onDeadline) => {
			notifyLaneTaskDeadline = onDeadline;
			onDeadline(laneTaskDeadline);
			return () => {
				if (notifyLaneTaskDeadline === onDeadline) notifyLaneTaskDeadline = void 0;
			};
		},
		taskTimeoutAbortSignal: abortSignal,
		taskTimeoutAbortGraceMs: EMBEDDED_RUN_LANE_TIMEOUT_GRACE_MS,
		taskTimeoutReleaseSignal: laneTaskReleaseController.signal
	}, laneTaskTimeoutMs);
	const withRunLaneWait = (opts) => {
		const params = options.getParams();
		if (!opts?.onWait && !params.onLaneWait) return opts;
		return {
			...opts,
			onWait: (waitMs, queuedAhead) => {
				opts?.onWait?.(waitMs, queuedAhead);
				options.getParams().onLaneWait?.({
					waitMs,
					queuedAhead,
					waiting: true
				});
			}
		};
	};
	const noteLaneWaitIfBusy = (lane) => {
		const params = options.getParams();
		if (!params.onLaneWait) return;
		const snapshot = getCommandLaneSnapshot(lane);
		if (shouldNoteLaneWait(snapshot)) params.onLaneWait({
			waitMs: 0,
			queuedAhead: snapshot.queuedCount + snapshot.activeCount,
			waiting: true
		});
	};
	const enqueueGlobal = (task, opts) => {
		options.getParams().replyOperation?.markWaitingForGlobalLane();
		const globalOpts = {
			...opts,
			priority: sessionLanePolicy.priority,
			onQueued: noteCapacityWait
		};
		const taskWithCurrentLifecycle = async () => {
			endCapacityWait();
			let params = options.getParams();
			params.replyOperation?.markGlobalLaneWaitEnded();
			throwIfAborted();
			let lifecycleGeneration = options.getLifecycleGeneration();
			const currentLifecycleGeneration = getAgentEventLifecycleGeneration();
			const existingContext = getAgentRunContext(params.runId);
			if (lifecycleGeneration !== currentLifecycleGeneration) {
				const wasQueuedBeforeRotation = options.initialQueuedLifecycleGeneration === lifecycleGeneration;
				const canResumeAcrossRotation = sessionLanePolicy.canResumeAcrossRotation;
				const newerSameIdExecutionOwnsContext = existingContext?.lifecycleGeneration === currentLifecycleGeneration;
				if (!wasQueuedBeforeRotation || !canResumeAcrossRotation || newerSameIdExecutionOwnsContext) assertAgentRunLifecycleGenerationCurrent(lifecycleGeneration);
				lifecycleGeneration = currentLifecycleGeneration;
				options.setLifecycleGeneration(lifecycleGeneration);
				params = {
					...params,
					lifecycleGeneration
				};
				options.setParams(params);
			}
			const writerClaim = await claimAgentSessionWriter(params);
			if (writerClaim) {
				params = {
					...params,
					sessionTarget: {
						...params.sessionTarget,
						expectedLifecycleRevision: writerClaim.expectedLifecycleRevision,
						expectedWriterRunId: writerClaim.expectedWriterRunId
					}
				};
				options.setParams(params);
			}
			return await withAgentRunLifecycleGeneration(lifecycleGeneration, () => withSessionPlacementTurnAdmission({
				sessionId: params.sessionId,
				...params.agentId ? { agentId: params.agentId } : {},
				...params.sessionKey ? { sessionKey: params.sessionKey } : {},
				runId: params.runId
			}, params, task, () => {
				throwIfAborted();
				assertAgentRunLifecycleGenerationCurrent(lifecycleGeneration);
				releaseQueuedContext("admitted");
				claimAgentRunContext(params.runId, {
					...existingContext,
					agentId: params.agentId ?? existingContext?.agentId,
					sessionKey: params.sessionKey ?? existingContext?.sessionKey,
					sessionId: params.sessionId ?? existingContext?.sessionId,
					lifecycleGeneration,
					lastActiveAt: Date.now()
				});
				params.onLaneWait?.({
					waitMs: 0,
					queuedAhead: 0,
					waiting: false
				});
			}));
		};
		const params = options.getParams();
		let queuedRun;
		if (params.enqueue) queuedRun = params.enqueue(taskWithCurrentLifecycle, withLaneTimeout(withRunLaneWait(globalOpts)));
		else {
			noteLaneWaitIfBusy(options.globalLane);
			queuedRun = enqueueCommandInLane(options.globalLane, taskWithCurrentLifecycle, withLaneTimeout(withRunLaneWait(globalOpts)));
		}
		return queuedRun.catch((error) => {
			if (isCommandLaneTaskTimeoutError(error)) laneTaskAbortController.abort(error);
			throw error;
		});
	};
	const enqueueSession = (task, opts) => {
		const sessionOpts = {
			...opts,
			priority: sessionLanePolicy.priority,
			onQueued: noteCapacityWait
		};
		const admittedTask = () => {
			endCapacityWait();
			return task();
		};
		const params = options.getParams();
		releaseQueuedRunContext = retainQueuedAgentRunContext(params.runId, options.getLifecycleGeneration());
		if (releaseQueuedRunContext && params.abortSignal) {
			if (params.abortSignal.aborted) releaseQueuedContext("abandoned");
			else {
				queuedRunAbortSignal = params.abortSignal;
				queuedRunAbortSignal.addEventListener("abort", abandonQueuedContext, { once: true });
			}
		}
		let queuedRun;
		try {
			if (params.enqueue) queuedRun = params.enqueue(admittedTask, withRunLaneWait(sessionOpts));
			else {
				noteLaneWaitIfBusy(options.sessionLane);
				queuedRun = enqueueCommandInLane(options.sessionLane, admittedTask, withRunLaneWait(sessionOpts));
			}
		} catch (error) {
			releaseQueuedContext("abandoned");
			throw error;
		}
		return queuedRun.finally(() => {
			releaseQueuedContext("abandoned");
		});
	};
	return {
		enqueueGlobal,
		enqueueSession,
		abortSignal,
		laneTaskAbortController,
		laneTaskReleaseController,
		noteLaneTaskProgress,
		setLaneTaskDeadline,
		createAttemptControls,
		throwIfAborted
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/prepared-runtime-context.ts
/** Rebinds every config-derived run projection to one committed prepared generation. */
function bindRunToPreparedModelRuntime(params) {
	const preparedAgentId = params.preparedModelRuntime.agentId ?? params.requestedWorkspaceResolution.agentId;
	const workspaceResolution = {
		...params.requestedWorkspaceResolution,
		agentId: preparedAgentId,
		workspaceDir: params.preparedModelRuntime.workspaceDir ?? params.requestedWorkspaceResolution.workspaceDir
	};
	return {
		runParams: {
			...params.runParams,
			agentId: preparedAgentId,
			agentDir: params.preparedModelRuntime.agentDir,
			config: params.preparedModelRuntime.config,
			workspaceDir: workspaceResolution.workspaceDir
		},
		workspaceResolution
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/progress-controller.ts
function createEmbeddedRunProgressController(params) {
	const fastModeStartedAtMs = params.attempt.fastModeStartedAtMs ?? params.startedAtMs;
	const fastModeAutoOnSeconds = params.attempt.fastModeAutoOnSeconds ?? resolveFastModeModelAutoOnSeconds({
		cfg: params.attempt.config,
		provider: params.attempt.provider,
		model: params.attempt.model
	});
	const fastModeAutoProgressState = params.attempt.fastModeAutoProgressState ?? {
		offAnnounced: false,
		resetAnnounced: false
	};
	const notifyExecutionPhase = (phase, extra) => {
		params.noteLaneTaskProgress();
		params.attempt.onExecutionPhase?.({
			phase,
			...extra
		});
	};
	const notifyRunProgress = (info) => {
		params.noteLaneTaskProgress();
		params.attempt.onRunProgress?.(info);
	};
	const emitFastModeAutoProgress = async (payload) => {
		const summary = formatFastModeAutoProgressText(payload);
		try {
			emitAgentActivityEvent({
				runId: params.attempt.runId,
				...params.attempt.sessionKey ? { sessionKey: params.attempt.sessionKey } : {},
				stream: "item",
				data: {
					itemId: `fast-mode-auto:${payload.enabled ? "on" : "off"}`,
					kind: "status",
					title: "Fast",
					phase: "update",
					status: "running",
					summary
				}
			});
		} catch (error) {
			log$3.debug(`embedded run fast mode auto global event failed: ${formatErrorMessage(error)}`);
		}
		try {
			await params.attempt.onAgentEvent?.({
				stream: "item",
				data: {
					kind: "status",
					title: "Fast",
					phase: "update",
					summary
				},
				...params.attempt.sessionKey ? { sessionKey: params.attempt.sessionKey } : {}
			});
		} catch (error) {
			log$3.debug(`embedded run fast mode auto event failed: ${formatErrorMessage(error)}`);
		}
		try {
			await params.attempt.onToolResult?.({
				text: summary,
				channelData: { openclawProgressKind: FAST_MODE_AUTO_PROGRESS_KIND }
			});
		} catch (error) {
			log$3.debug(`embedded run fast mode auto progress failed: ${formatErrorMessage(error)}`);
		}
	};
	const maybeAnnounceFastModeAutoOff = async () => {
		if (params.attempt.fastMode !== "auto" || fastModeAutoProgressState.offAnnounced) return;
		const next = resolveFastModeForElapsed({
			mode: "auto",
			startedAtMs: fastModeStartedAtMs,
			fastAutoOnSeconds: fastModeAutoOnSeconds
		});
		if (next.enabled) return;
		fastModeAutoProgressState.offAnnounced = true;
		await emitFastModeAutoProgress(next);
	};
	const notifyToolResult = async (payload) => {
		await params.attempt.onToolResult?.(payload);
	};
	const notifyAgentEvent = async (event) => {
		await params.attempt.onAgentEvent?.(event);
	};
	const resolveAttemptFastMode = () => {
		const resolved = resolveFastModeForElapsed({
			mode: params.attempt.fastMode,
			startedAtMs: fastModeStartedAtMs,
			fastAutoOnSeconds: fastModeAutoOnSeconds
		});
		return resolved.mode === void 0 ? void 0 : resolved.enabled;
	};
	const resolveAttemptFastModeParam = () => {
		if (params.attempt.fastMode === "auto") return resolveAttemptFastMode;
		return resolveAttemptFastMode();
	};
	const maybeEmitFastModeAutoReset = async () => {
		if (params.attempt.fastMode !== "auto" || !fastModeAutoProgressState.offAnnounced || fastModeAutoProgressState.resetAnnounced) return;
		fastModeAutoProgressState.resetAnnounced = true;
		await emitFastModeAutoProgress({
			enabled: true,
			elapsedSeconds: 0,
			fastAutoOnSeconds: fastModeAutoOnSeconds
		});
	};
	const maybeEmitFastModeAutoResetBestEffort = async () => {
		try {
			await maybeEmitFastModeAutoReset();
		} catch (error) {
			log$3.warn(`embedded run fast mode auto reset progress failed: ${formatErrorMessage(error)}`);
		}
	};
	return {
		fastModeAutoOnSeconds,
		fastModeAutoProgressState,
		fastModeStartedAtMs,
		maybeAnnounceFastModeAutoOff,
		maybeEmitFastModeAutoResetBestEffort,
		notifyAgentEvent,
		notifyExecutionPhase,
		notifyRunProgress,
		notifyToolResult,
		resolveAttemptFastModeParam
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/recovery-message-action-capability.ts
/** Reconstructs a one-run action capability from host-only restart correlation. */
function createRecoveryMessageActionTurnCapability(params) {
	const sourceTurnId = readChannelSourceTurnId(params);
	const sourceChannel = normalizeMessageChannel(params.messageProvider ?? params.messageChannel);
	if (params.messageActionTurnCapability || !sourceTurnId || !sourceChannel || !isTrustedMessageActionTurnIngress(sourceChannel) || !params.agentId || !params.sessionKey || !params.currentChannelId) return;
	return mintMessageActionTurnCapability({
		agentId: params.agentId,
		runId: params.runId,
		sessionKey: params.sessionKey,
		sourceReplySessionKey: params.sessionKey,
		sessionId: params.sessionId,
		requesterAccountId: params.agentAccountId,
		requesterSenderId: params.senderId ?? void 0,
		requesterSenderName: params.senderName ?? void 0,
		requesterSenderUsername: params.senderUsername ?? void 0,
		requesterSenderE164: params.senderE164 ?? void 0,
		toolContext: {
			currentChannelId: params.currentChannelId,
			currentChatType: params.chatType,
			currentMessagingTarget: params.messageTo,
			currentChannelProvider: sourceChannel,
			currentThreadTs: params.currentThreadTs,
			currentSourceTurnId: sourceTurnId,
			replyToMode: params.replyToMode,
			hasRepliedRef: params.hasRepliedRef,
			sameChannelThreadRequired: readChannelSourceTurnSameThreadRequired(params)
		},
		...resolveMessageActionTurnCapabilityLifetime(params.timeoutMs)
	});
}
//#endregion
//#region src/agents/embedded-agent-runner/run-orchestrator.ts
/**
* Embedded-agent run orchestration implementation.
*/
const EMPTY_EMBEDDED_AGENT_CONFIG = Object.freeze({});
function runEmbeddedAgent(paramsInput) {
	const internalParamsInput = paramsInput;
	const requestedProvider = normalizeOptionalString(internalParamsInput.provider);
	const requestedModel = normalizeOptionalString(internalParamsInput.model);
	const needsConfiguredDefault = !internalParamsInput.config && !requestedProvider && !requestedModel;
	const config = internalParamsInput.config ?? (needsConfiguredDefault ? getRuntimeConfigSnapshot() ?? void 0 : void 0);
	const lifecycleGeneration = internalParamsInput.lifecycleGeneration ?? captureAgentRunLifecycleGeneration(internalParamsInput.runId);
	const pluginGeneration = internalParamsInput.pluginGeneration ?? (internalParamsInput.preparedModelRuntimeMode === "isolated-read-only" ? void 0 : getPreparedModelRuntimePluginGeneration());
	return withAgentRunLifecycleGeneration(lifecycleGeneration, () => runEmbeddedAgentInternal({
		...internalParamsInput,
		config,
		lifecycleGeneration,
		...pluginGeneration ? { pluginGeneration } : {}
	}));
}
async function runEmbeddedAgentInternal(paramsInput) {
	const contextEngineAgentId = normalizeOptionalString(paramsInput.sessionTarget?.agentId) ?? normalizeOptionalString(paramsInput.agentId);
	const paramsBase = applyAgentRunSessionTargetIdentity(paramsInput);
	const skillWorkshopProposalMutationBudget = paramsBase.skillWorkshopProposalOnly ? paramsBase.skillWorkshopProposalMutationBudget ?? { remaining: 1 } : void 0;
	let lifecycleGeneration = paramsBase.lifecycleGeneration;
	const queuedLifecycleGeneration = getAgentEventLifecycleGeneration();
	const effectiveSessionKey = backfillSessionKey({
		config: paramsBase.config,
		sessionId: paramsBase.sessionId,
		sessionKey: paramsBase.sessionKey,
		agentId: paramsBase.agentId
	});
	assertAgentHarnessRunAdmission({
		...paramsBase,
		sessionKey: effectiveSessionKey
	});
	const runSessionTarget = await resolveAgentRunSessionTarget({
		...paramsBase,
		missingSessionKey: "create",
		sessionKey: effectiveSessionKey
	});
	let params = withExecutionPhaseDiagnostics({
		...paramsBase,
		sessionManager: paramsBase.sessionManager ?? (paramsBase.sessionPersistence === "detached" ? SessionManager.inMemory(paramsBase.cwd ?? paramsBase.workspaceDir) : void 0),
		agentId: runSessionTarget.agentId,
		sessionId: runSessionTarget.sessionId,
		sessionKey: runSessionTarget.sessionKey,
		sessionTarget: runSessionTarget,
		sessionFile: runSessionTarget.sessionKey,
		skillWorkshopProposalMutationBudget
	});
	const sessionLane = resolveSessionLane(params.sessionKey?.trim() || params.sessionId);
	const globalLane = resolveGlobalLane(params.lane);
	const failureSuspension = params.sessionPersistence === "detached" ? void 0 : resolveSessionSuspensionTarget();
	const suspendForFailure = (suspensionParams) => {
		if (!failureSuspension) return;
		const suspension = buildEmbeddedFailureSuspension({
			suspension: suspensionParams,
			runAgentId: params.agentId
		});
		if (failureSuspension.mode === "defer") {
			failureSuspension.defer(suspension);
			return;
		}
		suspendSession(suspension);
	};
	const laneController = createEmbeddedRunLaneController({
		getLifecycleGeneration: () => lifecycleGeneration,
		getParams: () => params,
		globalLane,
		initialQueuedLifecycleGeneration: queuedLifecycleGeneration,
		sessionLane,
		setLifecycleGeneration: (generation) => {
			lifecycleGeneration = generation;
		},
		setParams: (nextParams) => {
			params = nextParams;
		}
	});
	const { enqueueGlobal, enqueueSession, noteLaneTaskProgress, throwIfAborted } = laneController;
	const channelHint = params.messageChannel ?? params.messageProvider;
	const resolvedToolResultFormat = params.toolResultFormat ?? (channelHint ? isMarkdownCapableMessageChannel(channelHint) ? "markdown" : "plain" : "markdown");
	const isProbeSession = params.sessionId?.startsWith("probe-") ?? false;
	throwIfAborted();
	const recoveryMessageActionTurnCapability = createRecoveryMessageActionTurnCapability(params);
	if (recoveryMessageActionTurnCapability) params = {
		...params,
		messageActionTurnCapability: recoveryMessageActionTurnCapability
	};
	return enqueueSession(async () => {
		throwIfAborted();
		if (!params.sessionManager || params.sessionManager.getSessionTarget()) {
			params.replyOperation?.markWaitingForDeferredMaintenance();
			try {
				await waitForDeferredTurnMaintenanceForSession(params.sessionKey);
			} finally {
				params.replyOperation?.markDeferredMaintenanceWaitEnded();
			}
		}
		throwIfAborted();
		return enqueueGlobal(async () => {
			throwIfAborted();
			const cliDispatched = await runEmbeddedAgentViaCliBackendIfEligible({
				...params,
				sessionTarget: {
					...params.sessionTarget,
					...runSessionTarget
				}
			});
			if (cliDispatched) return cliDispatched;
			const started = Date.now();
			const startupStages = createEmbeddedRunStageTracker();
			const requestedWorkspaceResolution = resolveRunWorkspaceDir({
				workspaceDir: params.workspaceDir,
				sessionKey: params.sessionKey,
				agentId: params.agentId,
				config: params.config
			});
			startupStages.mark("workspace");
			const config = params.config ?? EMPTY_EMBEDDED_AGENT_CONFIG;
			const requestedAgentDir = params.agentDir ?? resolveAgentDir(config, requestedWorkspaceResolution.agentId);
			const retainIdleRunOwner = params.config === void 0;
			const requestedRuntimeSelection = resolveInitialEmbeddedRunModel({
				config,
				agentId: requestedWorkspaceResolution.agentId,
				provider: params.provider,
				model: params.model
			});
			const explicitHarnessRuntime = params.agentHarnessId ?? params.agentHarnessRuntimeOverride;
			const requestedHarnessRuntime = explicitHarnessRuntime ?? params.agentHarnessRuntimePreparationHint;
			const runtimePluginFallbacksOverride = params.modelFallbacksOverride ?? resolveRunModelFallbacksOverride({
				cfg: config,
				agentId: requestedWorkspaceResolution.agentId,
				sessionKey: params.sessionKey
			});
			const pluginMetadataSnapshot = params.pluginGeneration?.pluginMetadataSnapshot ?? loadPluginMetadataSnapshot({
				config,
				workspaceDir: requestedWorkspaceResolution.workspaceDir,
				env: process.env
			});
			const runtimePluginSelections = resolveModelCandidateChain({
				cfg: config,
				agentId: requestedWorkspaceResolution.agentId,
				manifestPlugins: pluginMetadataSnapshot,
				provider: requestedRuntimeSelection.provider,
				model: requestedRuntimeSelection.modelId,
				requestedRouteResolution: "resolved",
				fallbacksOverride: runtimePluginFallbacksOverride
			}).map((candidate, index) => requestedHarnessRuntime && (index === 0 || explicitHarnessRuntime) ? {
				provider: candidate.provider,
				modelId: candidate.model,
				runtime: requestedHarnessRuntime,
				agentId: requestedWorkspaceResolution.agentId
			} : {
				provider: candidate.provider,
				modelId: candidate.model,
				agentId: requestedWorkspaceResolution.agentId
			});
			const preparedInput = {
				config,
				agentId: requestedWorkspaceResolution.agentId,
				agentDir: requestedAgentDir,
				inheritedAuthDir: resolveLegacyInheritedAuthDir(config),
				workspaceDir: requestedWorkspaceResolution.workspaceDir,
				preserveWorkspaceDirOnRefresh: !requestedWorkspaceResolution.isCanonicalWorkspace,
				...params.allowGatewaySubagentBinding ? { allowGatewaySubagentBinding: true } : {},
				...params.preparedModelRuntimeMode === "isolated-read-only" ? { loadRuntimePlugins: true } : {},
				runtimePluginSelections
			};
			startupStages.mark("harness-selection");
			laneController.setLaneTaskDeadline({ kind: "unlimited" });
			const preparedModelRuntimeLease = await (params.preparedModelRuntimeMode === "isolated-read-only" ? acquireReadOnlyPreparedModelRuntime(preparedInput, laneController.abortSignal, "static") : acquireAgentRunPreparedModelRuntime(preparedInput, {
				retainIdleRunOwner,
				catalogMode: "static",
				...params.pluginGeneration ? { pluginGeneration: params.pluginGeneration } : {},
				abortSignal: laneController.abortSignal
			})).finally(() => {
				noteLaneTaskProgress();
				laneController.setLaneTaskDeadline(void 0);
			});
			startupStages.mark("prepared-runtime");
			const preparedModelRuntimeOwnerSnapshot = preparedModelRuntimeLease.snapshot;
			let preparedLeaseActive = true;
			try {
				throwIfAborted();
				if (params.pluginGeneration && preparedModelRuntimeOwnerSnapshot.metadataSnapshot !== params.pluginGeneration.pluginMetadataSnapshot) throw new Error("prepared model runtime replaced the admitted plugin generation");
				const rebound = bindRunToPreparedModelRuntime({
					runParams: params,
					requestedWorkspaceResolution,
					preparedModelRuntime: preparedModelRuntimeOwnerSnapshot
				});
				params = rebound.runParams;
				const workspaceResolution = rebound.workspaceResolution;
				const repoRoot = resolveSystemPromptRepoRoot({
					config: rebound.runParams.config,
					workspaceDir: workspaceResolution.workspaceDir,
					cwd: rebound.runParams.cwd
				}) ?? null;
				const projectKey = repoRoot ? await resolveProjectKey(repoRoot) : null;
				const activeProjectKeys = prepareEmbeddedSessionActiveProjectKeys(params.sessionId, projectKey);
				const preparedModelRuntime = Object.freeze({
					...preparedModelRuntimeOwnerSnapshot,
					repoRoot,
					projectKey,
					activeProjectKeys
				});
				const runPrepared = async () => {
					const preparedAgentId = workspaceResolution.agentId;
					const resolvedWorkspace = workspaceResolution.workspaceDir;
					const agentDir = preparedModelRuntime.agentDir;
					const progressController = createEmbeddedRunProgressController({
						attempt: params,
						noteLaneTaskProgress,
						startedAtMs: started
					});
					const { notifyExecutionPhase } = progressController;
					const emitStartupStageSummary = createEmbeddedRunStageSummaryEmitter({
						label: "startup stages",
						log: log$3,
						runId: params.runId,
						sessionId: params.sessionId,
						tracker: startupStages
					});
					params.onExecutionStarted?.({ lifecycleGeneration });
					notifyExecutionPhase("runner_entered");
					const canonicalWorkspace = resolveUserPath(resolveAgentWorkspaceDir(preparedModelRuntime.config, preparedAgentId));
					const isCanonicalWorkspace = canonicalWorkspace === resolvedWorkspace;
					const redactedSessionId = redactRunIdentifier(params.sessionId);
					const redactedSessionKey = redactRunIdentifier(params.sessionKey);
					const redactedWorkspace = redactRunIdentifier(resolvedWorkspace);
					if (requestedWorkspaceResolution.usedFallback) log$3.warn(`[workspace-fallback] caller=runEmbeddedAgent reason=${requestedWorkspaceResolution.fallbackReason} run=${params.runId} session=${redactedSessionId} sessionKey=${redactedSessionKey} agent=${preparedAgentId} workspace=${redactedWorkspace}`);
					startupStages.mark("runtime-context");
					notifyExecutionPhase("workspace");
					startupStages.mark("runtime-plugins");
					notifyExecutionPhase("runtime_plugins");
					const { provider, modelId } = resolveInitialEmbeddedRunModel({
						config: params.config,
						agentId: workspaceResolution.agentId,
						provider: params.provider,
						model: params.model
					});
					const normalizedSessionKey = params.sessionKey?.trim();
					const modelFallbackAvailability = params.modelFallbackAvailability ?? resolveModelFallbackAvailability({
						cfg: params.config ?? EMPTY_EMBEDDED_AGENT_CONFIG,
						agentId: workspaceResolution.agentId,
						sessionKey: normalizedSessionKey,
						hasSessionModelOverride: false,
						modelFallbacksOverride: params.modelFallbacksOverride
					});
					const fallbackConfigured = modelFallbackAvailability.kind === "active";
					if (modelFallbackAvailability.kind === "disabled_by_model_override") log$3.warn(`[model-fallback] configured fallbacks disabled by user model override run=${params.runId} session=${redactedSessionId}`);
					const resolvedSessionKey = normalizedSessionKey ?? runSessionTarget.sessionKey;
					const hookRunner = getGlobalHookRunner();
					const hookCtx = {
						runId: params.runId,
						jobId: params.jobId,
						agentId: workspaceResolution.agentId,
						sessionKey: resolvedSessionKey,
						sessionId: params.sessionId,
						workspaceDir: resolvedWorkspace,
						activeProjectKeys: [...activeProjectKeys],
						modelProviderId: provider,
						modelId,
						trigger: params.trigger,
						...buildAgentHookContextChannelFields(params),
						...buildAgentHookContextIdentityFields({
							trigger: params.trigger,
							senderId: params.senderId,
							chatId: params.chatId,
							channelContext: params.channelContext
						})
					};
					const hookResult = await runBeforeAgentReplyForTurn({
						runId: params.runId,
						trigger: params.trigger,
						event: { cleanedBody: params.prompt },
						context: hookCtx,
						onDispatch: () => notifyExecutionPhase("before_agent_reply", {
							provider,
							model: modelId
						}),
						onDeclined: () => notifyExecutionPhase("runtime_plugins", {
							provider,
							model: modelId
						})
					});
					if (hookResult?.handled) return {
						payloads: buildHandledBeforeAgentReplyPayloads(hookResult.reply),
						meta: {
							durationMs: Date.now() - started,
							agentMeta: {
								sessionId: params.sessionId,
								provider,
								model: modelId
							},
							finalAssistantVisibleText: hookResult.reply?.text ?? "NO_REPLY",
							finalAssistantRawText: hookResult.reply?.text ?? "NO_REPLY"
						}
					};
					return await executePreparedEmbeddedRun({
						runParams: params,
						contextEngineAgentId,
						provider,
						modelId,
						agentDir,
						workspaceResolution,
						workspaceDir: resolvedWorkspace,
						bootstrapWorkspaceDir: canonicalWorkspace,
						isCanonicalWorkspace,
						globalLane,
						hookRunner,
						hookContext: hookCtx,
						fallbackConfigured,
						isProbeSession,
						resolvedSessionKey,
						resolvedToolResultFormat,
						startedAtMs: started,
						startupStages,
						emitStartupStageSummary,
						progressController,
						laneController,
						lifecycleGeneration,
						suspendForFailure,
						preparedModelRuntime
					});
				};
				const runWithPreparedRuntime = () => withPluginRuntimeGenerationScope(preparedModelRuntime, runPrepared);
				return params.pluginGeneration ? await withPreparedModelRuntimePluginGenerationScope(preparedModelRuntimeLease.pluginGeneration, runWithPreparedRuntime, () => preparedLeaseActive ? preparedModelRuntimeOwnerSnapshot : void 0) : await runWithPreparedRuntime();
			} finally {
				preparedLeaseActive = false;
				preparedModelRuntimeLease.release();
			}
		});
	}).finally(() => {
		revokeMessageActionTurnCapability(recoveryMessageActionTurnCapability);
	});
}
//#endregion
export { compactEmbeddedAgentSession as n, runEmbeddedAgent as t };
