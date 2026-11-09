import { c as isRecord } from "./record-coerce-DItp3I4t.js";
import { c as resolveUserPath } from "./home-dir-BPhrG-aM.js";
import "./utils-D3A1hGii.js";
import { t as pruneMapToMaxSize } from "./map-size-CNcWiFKu.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { D as freezeDiagnosticTraceContext, O as getActiveDiagnosticTraceContext, w as createDiagnosticTraceContext } from "./diagnostic-events-D_BPObBj.js";
import { i as generateSecureToken } from "./secure-random-Ds4AFLgz.js";
import { n as getCurrentPluginMetadataSnapshot } from "./current-plugin-metadata-snapshot-BqMIdsHK.js";
import { m as resolveAgentWorkspaceDir, u as resolveAgentDir } from "./agent-scope-config-CUiGBd59.js";
import { O as parseAgentSessionKey } from "./session-key-CRjxKW0X.js";
import { d as toolPolicyRestrictsTools } from "./tool-policy-De2653Mj.js";
import { a as normalizeOptionalAgentRuntimeId, r as isDefaultAgentRuntimeId } from "./agent-runtime-id-CYhl-5UQ.js";
import { w as projectModelThinkingCompat } from "./model-selection-shared-BUMiYTyL.js";
import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-CdX9UGcX.js";
import { i as resolveAgentModelFallbackValues } from "./model-input-BuGMCNOz.js";
import { _ as resolveSessionAgentId, g as resolveRunModelFallbacksOverride, y as resolveSessionAgentIds } from "./agent-scope-CSlN0kZb.js";
import { i as isOpenAIProvider } from "./openai-routing-ChWi-Lfh.js";
import { n as resolveProviderIdForAuth } from "./provider-auth-aliases-CdY3FZM-.js";
import { o as parseGitUrl } from "./zod-schema.cloud-workers-D_7bv0Z7.js";
import { r as runCommandWithTimeout } from "./exec-D7bZ8DC6.js";
import { t as resolveAgentHarnessPolicy } from "./policy-DLijLMMe.js";
import { t as getGlobalHookRunner } from "./hook-runner-global-DLqoAE5f.js";
import { n as withPluginRuntimeGenerationScope } from "./generation-scope-CcvBHxkU.js";
import { n as normalizeMessageChannel } from "./message-channel-core-D0_xUNNr.js";
import { i as captureOwnedTranscriptWriteAssertion } from "./transcript-write-context-mhuh2Sos.js";
import { s as listRegisteredPluginAgentPromptGuidance } from "./command-registration-BTRvP9xA.js";
import { a as ensureAuthProfileStoreWithoutExternalProfiles, r as ensureAuthProfileStore } from "./store-CZzbMlii.js";
import { t as applyPreparedRuntimeAuthToModel } from "./provider-request-config-BsyiChYr.js";
import { n as extractModelCompat } from "./provider-model-compat-C3R5Y-Pj.js";
import { i as wrapStreamFnTextTransforms } from "./text-transforms.runtime-DyFXfKZV.js";
import { a as unwrapSecretSentinelsForProviderEgress, t as protectPreparedProviderRuntimeAuth } from "./provider-secret-egress-Be7E79mv.js";
import { D as resolveProviderTextTransforms, F as transformProviderSystemPrompt, g as prepareProviderRuntimeAuth } from "./provider-runtime-BqO0YRlw.js";
import { dt as getModelRegistryRuntime, i as agentSessionSetContextReplacementHook, o as setSessionModelUsageSink, r as agentSessionAutomaticCompaction } from "./sessions-CHgQo4vL.js";
import { c as normalizeUsage } from "./usage-CtmV8Xxq.js";
import { d as estimateTokens } from "./compaction-DlElLXrZ.js";
import { R as redactTranscriptMessage } from "./session-accessor.sqlite-transcript-store-DV0WFe1a.js";
import { r as detectRuntimeShell } from "./shell-utils-We_VISCR.js";
import { a as sanitizeToolUseResultPairingForModel } from "./session-transcript-repair-B7Xnkp41.js";
import "./message-channel-BGKf9KPa.js";
import { t as formatSqliteSessionFileMarker } from "./legacy-sqlite-marker-COPKCuIN.js";
import { n as emitSessionTranscriptUpdate } from "./transcript-events-BMaG3A_w.js";
import { t as SessionManager } from "./session-manager-CNTG_BAJ.js";
import { a as resolveAgentHarnessPreparedAuthSupport, o as resolveAgentHarnessPreparedRouteSupport } from "./availability-CAyTTQQq.js";
import { i as resolveCliBackendConfig } from "./cli-backends-CDMMgqXt.js";
import { r as resolveModelCandidateChain } from "./model-fallback-candidates-B-mHEN3S.js";
import { t as MissingProviderAuthError } from "./model-auth-runtime-shared-C48YoQY0.js";
import { l as prepareModelRuntimeSnapshot, t as acquireAgentRunPreparedModelRuntime } from "./prepared-model-runtime-C1N_aVhw.js";
import { n as applyLocalNoAuthHeaderOverride, o as resolveModelAuthMode, t as applyAuthHeaderOverride } from "./model-auth-BBgoS_xI.js";
import { n as resolveMemorySearchIndexConfig } from "./memory-search-BRniBajP.js";
import { l as markDiagnosticEmbeddedRunStarted, n as closeDiagnosticEmbeddedRunOwner, r as createDiagnosticEmbeddedRunOwner } from "./diagnostic-run-activity-DLw8ESkx.js";
import { b as compactWithSafetyTimeout, x as resolveCompactionTimeoutMs } from "./diagnostic-CN79G-MT.js";
import { o as prepareSystemAgentRunAdmission } from "./admitted-run-context-DO5gB_Jz.js";
import { r as getPluginToolMeta } from "./tool-metadata-B4LwDu-h.js";
import { r as resolveSessionPermissionExecMode, t as SESSION_PERMISSION_BY_EXEC_MODE } from "./session-permission-exec-mode-CJHB47SR.js";
import { t as pickFallbackThinkingLevel } from "./embedded-agent-helpers-CzpaLpCq.js";
import { D as limitHistoryTurns, E as getHistoryLimitFromSessionKey, S as validateReplayTurns, T as hasPersistedMedia, x as sanitizeSessionHistory } from "./history-image-prune-Dg0CDQ4a.js";
import { _ as createPreparedEmbeddedAgentSettingsManager, a as collectAllowedToolNames, at as flushPendingToolResultsAfterIdle, c as applySystemPromptToSession, d as hasMeaningfulConversationContent, f as isRealConversationMessage, g as setCompactionSafeguardCancellation, gt as formatUnknownCompactionReasonDetail, h as getCompactionSafeguardRuntime, ht as classifyCompactionReason, l as buildEmbeddedSystemPrompt, m as consumeCompactionSafeguardCancellation, o as collectRegisteredToolNames, ot as logRuntimeToolSchemaQuarantine, r as prepareAgentMemoryPrompt, s as toSessionToolAllowlist, u as buildEmbeddedExtensionFactories, yt as resolveCompactionFailure } from "./builtin-openclaw-zQV8Wwjr.js";
import { i as describeFailoverError, r as coerceToFailoverError } from "./failover-error-B46Ke6VT.js";
import { n as resolveDiagnosticModelContentCapturePolicy } from "./diagnostic-llm-content-CAc71KJ1.js";
import { f as listChannelSupportedActions, h as resolveChannelReactionGuidance, p as resolveChannelMessageToolHints } from "./openclaw-tools-BODVdJQD.js";
import { n as createInternalHookEvent, u as triggerInternalHook } from "./internal-hooks-Cd2JkXx0.js";
import { t as resolveConversationCapabilityProfile } from "./conversation-capability-profile-C6DysC6l.js";
import { t as createBundleLspToolRuntime } from "./agent-bundle-lsp-runtime-C3Wh5JbW.js";
import { n as createBundleMcpToolRuntime } from "./agent-bundle-mcp-materialize-DlD9AJQW.js";
import "./agent-bundle-mcp-tools-B8DYsLEh.js";
import { t as log } from "./logger-DEXeM7Jh.js";
import { a as mapSandboxSkillUsagePaths, i as mapSandboxSkillEntriesForPrompt, n as resolveEmbeddedRunSkillEntries, r as createSandboxPromptEntryLoader, s as resolveSandboxSkillRuntimeInputs, t as collectRuntimeChannelCapabilities } from "./runtime-capabilities-CA_W9E4G.js";
import { a as getActiveMemorySearchManagerCore } from "./memory-runtime-hok5egei.js";
import { a as resolveBootstrapContextForRun, c as resolveContextInjectionMode, i as makeBootstrapWarn } from "./bootstrap-files-CHsP1LeZ.js";
import { t as isAcpRuntimeSpawnAvailable } from "./availability-Te9b3KLs.js";
import { n as resolveSkillsPrompt } from "./workspace-skill-prompt-DbEIZHQJ.js";
import { n as applySkillEnvOverridesFromSnapshot, t as applySkillEnvOverrides } from "./env-overrides-Dx_c_mal.js";
import { n as resolveSandboxContext } from "./context-CTkU5pfN.js";
import "./sandbox-ejCqp821.js";
import { t as applyExtraParamsToAgent } from "./extra-params-CAyBBhON.js";
import { D as estimateLlmBoundaryTokenPressure } from "./helpers-BTOsl-oB.js";
import { t as rewriteTranscriptEntriesInSessionManager } from "./transcript-rewrite-OzncwtgK.js";
import { n as mapThinkingLevelForProvider, t as mapThinkingLevel } from "./utils-CefVZRZM.js";
import { g as resolveEmbeddedCompactionThinkingLevel, h as resolveEmbeddedCompactionTarget, l as resolvePromptModeForSession, m as resolveCompactionHarnessRuntime, p as resolveCompactionContextTokenBudget, v as listActiveProcessSessionReferences } from "./attempt-prompt-helpers-D26p8wCr.js";
import { t as resolveProcessToolScopeKey } from "./bash-process-scope-Bmw8_ghL.js";
import { r as prepareAgentRuntimeAuth } from "./prepare-auth-Bq06j3_k.js";
import { t as guardSessionManager } from "./session-tool-result-guard-wrapper-cNIJYD6J.js";
import { n as filterRuntimeCompatibleTools, t as filterProviderNormalizableTools } from "./tool-schema-projection-ZrMdwk4s.js";
import { t as applyFinalEffectiveToolPolicy } from "./effective-tool-policy-DzzdB1dL.js";
import { t as applyEmbeddedAttemptToolsAllow } from "./attempt-tool-construction-plan-DimMQ5FS.js";
import { i as resolveRuntimeOsLabel } from "./os-summary-B440lihS.js";
import { r as resolveAttemptSpawnWorkspaceDir } from "./attempt-thread-helpers-0IFbjVTa.js";
import { i as resolveEmbeddedAgentStream, n as resolveEmbeddedAgentApiKey, r as resolveEmbeddedAgentBaseStreamFn, t as wrapStreamFnWithDiagnosticModelCallEvents } from "./attempt.model-diagnostic-events-B4dGIs0S.js";
import { n as resolveRuntimeAgentName, r as resolveSystemPromptRepoRoot, s as resolveAgentPromptSurfaceForSessionKey } from "./system-prompt-params-B645JcX8.js";
import { o as resolveUserTimezone, r as formatDateStamp } from "./date-time-C7YbYLih.js";
import { n as prepareWatchedSessionsPrompt } from "./watched-sessions-prompt-C9QfwkEy.js";
import { s as prepareEmbeddedSessionActiveProjectKeys } from "./session-prompt-state-D-1ZVLzo.js";
import { t as registerProviderStreamForModel } from "./provider-stream-mYQ5hZ36.js";
import { r as isFallbackSummaryError } from "./model-fallback-attempt-C1x1isxV.js";
import { a as resolveEffectiveCompactionMode, i as isSilentOverflowProneModel, n as applyAgentAutoCompactionGuard, r as applyAgentCompactionSettingsFromConfig } from "./agent-settings-ByZET7b8.js";
import { r as createAgentSessionForEmbeddedRunner, t as createEmbeddedAgentResourceLoader } from "./resource-loader-DffsEf4_.js";
import { t as createOpenClawCodingTools } from "./agent-tools-djVuP1H1.js";
import { c as createSkillInstructionDeliveryCache } from "./tool-loop-detection-config-Dftl-DTD.js";
import { t as runWithModelFallback } from "./model-fallback-runner-DOsPfj4O.js";
import { n as resolveModelAsync } from "./model-BtcPfJ_-.js";
import { n as supportsModelTools } from "./model-tool-support-DIQSEumC.js";
import { t as splitSdkTools } from "./tool-split-5yAD9NUS.js";
import { a as isReasoningTagProvider, r as resolveEmbeddedSandboxInfoExecPolicy, t as buildEmbeddedSandboxInfo } from "./sandbox-info-CKYFT0dt.js";
import { r as resolveOpenClawReferencePaths } from "./docs-path-CPTK1h9K.js";
import { t as getMachineDisplayName } from "./machine-name-4OkcfN3h.js";
import { n as getCurrentActiveNodeContext, t as formatActiveNodeContextLabel } from "./active-node-context-_qYwwG99.js";
import { n as resolveAgentRunSessionTarget, t as applyAgentRunSessionTargetIdentity } from "./run-session-target-D4dx7X-Q.js";
import { t as materializePreparedRuntimeModel } from "./materialize-model-CVFDy__1.js";
import { c as selectAgentHarness, l as selectAgentHarnessForPreparedModelProviders } from "./selection-BC0YSSFq.js";
import { a as resolveReusableRuntimeModelAuth, r as providerUsesCredentialScopedModelMetadata } from "./credential-scoped-model-289_CgUb.js";
import { n as resolvePreparedRuntimeModelAuth, t as resolvePreparedRuntimeAuthAttempts } from "./resolve-auth-C8FbcFOl.js";
import { t as ensureSelectedAgentHarnessPlugin } from "./runtime-plugin-tBIKSPI8.js";
import { a as resolveCompactionCheckpointTranscriptPosition, i as readSessionLeafStateFromTranscriptAsync, o as resolveSessionCompactionCheckpointReason, t as createFileBackedCompactionCheckpointStore } from "./session-compaction-checkpoints-CY8fQYcG.js";
import { n as buildAgentRuntimePlan } from "./build-CMj_DHYr.js";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { captureOpenAIResponsesCompaction, preserveCompactionReplayWindow, requestPreparedOpenAIResponsesCompaction, requiresCompactionReplayRefresh, resolveCompactionReplayEligibility, resolveOpenAIResponsesCompactEndpointPlan } from "@openclaw/ai/transports";
//#region src/agents/project-memory-scope.ts
const MAX_PROJECT_KEY_CACHE_ENTRIES = 128;
const GIT_CONFIG_TIMEOUT_MS = 4e3;
const projectKeyByRepoRoot = /* @__PURE__ */ new Map();
function escapeProjectKeyForAnnotation(value) {
	return value.replaceAll("%", "%25").replaceAll(";", "%3b").replaceAll("<", "%3c").replaceAll(">", "%3e").replaceAll("\r", "%0d").replaceAll("\n", "%0a");
}
async function resolveUncachedProjectKey(repoRoot) {
	try {
		const result = await runCommandWithTimeout([
			"git",
			"-C",
			repoRoot,
			"config",
			"--get",
			"remote.origin.url"
		], { timeoutMs: GIT_CONFIG_TIMEOUT_MS });
		if (result.code === 0) {
			const source = parseGitUrl(`git:${result.stdout.trim()}`);
			if (source) return escapeProjectKeyForAnnotation(`${source.host.toLowerCase()}/${source.path}`);
		}
	} catch {}
	return `path:${escapeProjectKeyForAnnotation(repoRoot)}`;
}
/** Resolve one stable repository identity without spawning Git again for the same root. */
function resolveProjectKey(repoRoot) {
	const canonicalRoot = path.resolve(repoRoot);
	const cached = projectKeyByRepoRoot.get(canonicalRoot);
	if (cached) {
		projectKeyByRepoRoot.delete(canonicalRoot);
		projectKeyByRepoRoot.set(canonicalRoot, cached);
		return cached;
	}
	const pending = resolveUncachedProjectKey(canonicalRoot);
	projectKeyByRepoRoot.set(canonicalRoot, pending);
	pruneMapToMaxSize(projectKeyByRepoRoot, MAX_PROJECT_KEY_CACHE_ENTRIES);
	return pending;
}
//#endregion
//#region src/agents/embedded-agent-runner/compaction-diagnostics.ts
const hasRealConversationContent = isRealConversationMessage;
function createDirectCompactionDiagId() {
	return `cmp-${Date.now().toString(36)}-${generateSecureToken(4)}`;
}
function resolveCompactionProviderStream(params) {
	return registerProviderStreamForModel({
		model: params.effectiveModel,
		cfg: params.config,
		agentDir: params.agentDir,
		workspaceDir: params.effectiveWorkspace,
		apiRegistry: params.apiRegistry
	});
}
function normalizeObservedTokenCount(value) {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : void 0;
}
function getMessageTextChars(msg) {
	const content = msg.content;
	if (typeof content === "string") return content.length;
	return Array.isArray(content) ? content.reduce((total, block) => {
		const text = block && typeof block === "object" ? block.text : void 0;
		return total + (typeof text === "string" ? text.length : 0);
	}, 0) : 0;
}
function resolveMessageToolLabel(msg) {
	const candidate = msg.toolName ?? msg.name ?? msg.tool;
	return typeof candidate === "string" && candidate.trim().length > 0 ? candidate : void 0;
}
function summarizeCompactionMessages(messages) {
	let historyTextChars = 0;
	let toolResultChars = 0;
	const contributors = [];
	let estTokens = 0;
	let tokenEstimationFailed = false;
	for (const msg of messages) {
		const role = typeof msg.role === "string" ? msg.role : "unknown";
		const chars = getMessageTextChars(msg);
		historyTextChars += chars;
		if (role === "toolResult") toolResultChars += chars;
		contributors.push({
			role,
			chars,
			tool: resolveMessageToolLabel(msg)
		});
		if (!tokenEstimationFailed) try {
			estTokens += estimateTokens(msg);
		} catch {
			tokenEstimationFailed = true;
		}
	}
	return {
		messages: messages.length,
		historyTextChars,
		toolResultChars,
		estTokens: tokenEstimationFailed ? void 0 : estTokens,
		contributors: contributors.toSorted((left, right) => right.chars - left.chars).slice(0, 3)
	};
}
function containsRealConversationMessages(messages) {
	return messages.some((message, index, allMessages) => hasRealConversationContent(message, allMessages, index));
}
//#endregion
//#region src/agents/embedded-agent-runner/compaction-hooks.ts
function resolvePostCompactionIndexSyncMode(config) {
	const mode = config?.agents?.defaults?.compaction?.postIndexSync;
	if (mode === "off" || mode === "async" || mode === "await") return mode;
	return "async";
}
async function runPostCompactionSessionMemorySync(params) {
	if (!params.config) return;
	try {
		const sessionFile = params.sessionFile.trim();
		if (!sessionFile) return;
		const agentId = resolveSessionAgentId({
			sessionKey: params.sessionKey,
			config: params.config,
			agentId: params.agentId
		});
		const resolvedMemory = resolveMemorySearchIndexConfig(params.config, agentId);
		if (!resolvedMemory || !resolvedMemory.sources.includes("sessions")) return;
		if (!resolvedMemory.sync.sessions.postCompactionForce) return;
		params.assertActive?.();
		const { manager } = await getActiveMemorySearchManagerCore({
			cfg: params.config,
			agentId
		});
		params.assertActive?.();
		if (!manager?.sync) return;
		const sessionId = params.sessionId?.trim();
		await manager.sync({
			reason: "post-compaction",
			...sessionId ? { sessions: [{
				agentId,
				sessionId,
				...params.sessionKey ? { sessionKey: params.sessionKey } : {}
			}] } : { archiveFiles: [sessionFile] }
		});
	} catch (err) {
		params.assertActive?.();
		log.warn(`memory sync skipped (post-compaction): ${formatErrorMessage(err)}`);
	}
}
function syncPostCompactionSessionMemory(params) {
	if (params.mode === "off" || !params.config) return Promise.resolve();
	const syncTask = runPostCompactionSessionMemorySync(params);
	if (params.mode === "await") return syncTask;
	syncTask.catch((error) => {
		log.debug(`memory sync cancelled (post-compaction): ${formatErrorMessage(error)}`);
	});
	return Promise.resolve();
}
/** Emits post-compaction transcript and memory-index side effects for a compacted session file. */
async function runPostCompactionSideEffects(params) {
	params.assertActive?.();
	const sessionFile = params.sessionFile.trim();
	if (!sessionFile) return;
	emitSessionTranscriptUpdate({
		sessionFile,
		sessionKey: params.sessionKey,
		...params.sessionId ? { sessionId: params.sessionId } : {},
		...params.agentId ? { agentId: params.agentId } : {}
	});
	params.assertActive?.();
	await syncPostCompactionSessionMemory({
		...params,
		sessionFile,
		mode: resolvePostCompactionIndexSyncMode(params.config)
	});
	params.assertActive?.();
}
/** Converts the global hook runner into the compaction-specific hook shape. */
function asCompactionHookRunner(hookRunner) {
	if (!hookRunner) return null;
	return {
		hasHooks: (hookName) => hookRunner.hasHooks?.(hookName) ?? false,
		runBeforeCompaction: hookRunner.runBeforeCompaction?.bind(hookRunner),
		runAfterCompaction: hookRunner.runAfterCompaction?.bind(hookRunner)
	};
}
function estimateTokenCountSafe(messages, estimateTokensFn) {
	try {
		let total = 0;
		for (const message of messages) total += estimateTokensFn(message);
		return total;
	} catch {
		return;
	}
}
/** Builds before-hook metrics while tolerating providers that cannot estimate all messages. */
function buildBeforeCompactionHookMetrics(params) {
	return {
		messageCountOriginal: params.originalMessages.length,
		tokenCountOriginal: estimateTokenCountSafe(params.originalMessages, params.estimateTokensFn),
		messageCountBefore: params.currentMessages.length,
		tokenCountBefore: params.observedTokenCount ?? estimateTokenCountSafe(params.currentMessages, params.estimateTokensFn)
	};
}
/** Runs internal and plugin before-compaction hooks, forwarding hook-produced messages. */
async function runBeforeCompactionHooks(params) {
	const missingSessionKey = false;
	const hookSessionKey = params.sessionKey;
	params.assertActive?.();
	try {
		const hookEvent = createInternalHookEvent("session", "compact:before", hookSessionKey, {
			sessionId: params.sessionId,
			missingSessionKey,
			messageCount: params.metrics.messageCountBefore,
			tokenCount: params.metrics.tokenCountBefore,
			messageCountOriginal: params.metrics.messageCountOriginal,
			tokenCountOriginal: params.metrics.tokenCountOriginal
		});
		await triggerInternalHook(hookEvent);
		params.assertActive?.();
		if (hookEvent.messages.length > 0) await params.onHookMessages?.({
			phase: "before",
			messages: hookEvent.messages.slice(),
			sessionId: params.sessionId,
			sessionKey: hookSessionKey
		});
	} catch (err) {
		params.assertActive?.();
		log.warn("session:compact:before hook failed", {
			errorMessage: formatErrorMessage(err),
			errorStack: err instanceof Error ? err.stack : void 0
		});
	}
	params.assertActive?.();
	if (params.hookRunner?.hasHooks?.("before_compaction")) try {
		await params.hookRunner.runBeforeCompaction?.({
			messageCount: params.metrics.messageCountBefore,
			tokenCount: params.metrics.tokenCountBefore
		}, {
			sessionId: params.sessionId,
			agentId: params.sessionAgentId,
			sessionKey: hookSessionKey,
			workspaceDir: params.workspaceDir,
			messageProvider: params.messageProvider
		});
	} catch (err) {
		params.assertActive?.();
		log.warn("before_compaction hook failed", {
			errorMessage: formatErrorMessage(err),
			errorStack: err instanceof Error ? err.stack : void 0
		});
	}
	params.assertActive?.();
	return {
		hookSessionKey,
		missingSessionKey
	};
}
/** Estimates compacted-session token count and rejects impossible growth from stale estimates. */
function estimateTokensAfterCompaction(params) {
	const tokensAfter = estimateTokenCountSafe(params.messagesAfter, params.estimateTokensFn);
	if (tokensAfter === void 0) return;
	const sanityCheckBaseline = params.observedTokenCount ?? params.fullSessionTokensBefore;
	if (sanityCheckBaseline > 0 && tokensAfter > (params.observedTokenCount !== void 0 ? sanityCheckBaseline : sanityCheckBaseline * 1.1)) return;
	return tokensAfter;
}
/** Runs internal and plugin after-compaction hooks with the final compacted metrics. */
async function runAfterCompactionHooks(params) {
	params.assertActive?.();
	try {
		const hookEvent = createInternalHookEvent("session", "compact:after", params.hookSessionKey, {
			sessionId: params.sessionId,
			missingSessionKey: params.missingSessionKey,
			messageCount: params.messageCountAfter,
			tokenCount: params.tokensAfter,
			compactedCount: params.compactedCount,
			summaryLength: params.summaryLength,
			tokensBefore: params.tokensBefore,
			tokensAfter: params.tokensAfter,
			firstKeptEntryId: params.firstKeptEntryId
		});
		await triggerInternalHook(hookEvent);
		params.assertActive?.();
		if (hookEvent.messages.length > 0) await params.onHookMessages?.({
			phase: "after",
			messages: hookEvent.messages.slice(),
			sessionId: params.sessionId,
			sessionKey: params.hookSessionKey
		});
	} catch (err) {
		params.assertActive?.();
		log.warn("session:compact:after hook failed", {
			errorMessage: formatErrorMessage(err),
			errorStack: err instanceof Error ? err.stack : void 0
		});
	}
	params.assertActive?.();
	if (params.hookRunner?.hasHooks?.("after_compaction")) try {
		await params.hookRunner.runAfterCompaction?.({
			messageCount: params.messageCountAfter,
			tokenCount: params.tokensAfter,
			compactedCount: params.compactedCount,
			sessionFile: params.sessionFile,
			...params.previousSessionId ? { previousSessionId: params.previousSessionId } : {}
		}, {
			sessionId: params.sessionId,
			agentId: params.sessionAgentId,
			sessionKey: params.hookSessionKey,
			workspaceDir: params.workspaceDir,
			messageProvider: params.messageProvider
		});
	} catch (err) {
		params.assertActive?.();
		log.warn("after_compaction hook failed", {
			errorMessage: formatErrorMessage(err),
			errorStack: err instanceof Error ? err.stack : void 0
		});
	}
	params.assertActive?.();
}
//#endregion
//#region src/agents/embedded-agent-runner/compaction-runtime-preparation.ts
/** Resolves the shared policy, target, and harness ownership for either compaction entry point. */
function resolveCompactionRuntimeSelection(params) {
	const runtimePolicySessionKey = params.sandboxSessionKey ?? params.sessionKey ?? void 0;
	const runtimePolicyAgentId = params.sandboxAgentId ?? (params.sandboxSessionKey && parseAgentSessionKey(params.sandboxSessionKey) ? void 0 : params.agentId);
	const policyTarget = resolveEmbeddedCompactionTarget({
		config: params.config,
		provider: params.provider,
		modelId: params.modelId,
		authProfileId: params.authProfileId,
		modelSelectionLocked: params.modelSelectionLocked,
		defaultProvider: DEFAULT_PROVIDER,
		defaultModel: DEFAULT_MODEL
	});
	const policyProvider = policyTarget.provider ?? "openai";
	const policyModelId = policyTarget.model ?? "gpt-5.6-sol";
	const policy = resolveAgentHarnessPolicy({
		provider: policyProvider,
		modelId: policyModelId,
		config: params.config,
		agentId: runtimePolicyAgentId,
		sessionKey: runtimePolicySessionKey
	});
	const configuredHarnessRuntime = policy.runtimeSource && policy.runtimeSource !== "implicit" && !isDefaultAgentRuntimeId(policy.runtime) ? policy.runtime : void 0;
	const boundHarnessRuntime = normalizeOptionalAgentRuntimeId(params.boundHarnessRuntime);
	const selectedHarnessRuntime = params.selectedHarnessRuntime ?? resolveCompactionHarnessRuntime({
		boundHarnessRuntime,
		preparedRuntimePlan: params.preparedRuntimePlan,
		configuredHarnessRuntime,
		provider: policyProvider,
		modelId: policyModelId
	});
	const target = resolveEmbeddedCompactionTarget({
		config: params.config,
		provider: params.provider,
		modelId: params.modelId,
		authProfileId: params.authProfileId,
		harnessRuntime: selectedHarnessRuntime,
		modelSelectionLocked: params.modelSelectionLocked,
		defaultProvider: DEFAULT_PROVIDER,
		defaultModel: DEFAULT_MODEL
	});
	const provider = target.provider ?? "openai";
	const modelId = target.model ?? "gpt-5.6-sol";
	const selectedRuntime = normalizeOptionalAgentRuntimeId(selectedHarnessRuntime);
	return {
		attemptNativeHarnessCompaction: Boolean(selectedRuntime && selectedRuntime !== "auto" && selectedRuntime !== "openclaw" && (!isOpenAIProvider(provider) || target.nativeHarnessCompaction === true)),
		runtimePolicySessionKey,
		runtimePolicyAgentId,
		boundHarnessRuntime,
		selectedHarnessRuntime,
		selectedHarnessRuntimeOverride: boundHarnessRuntime ? void 0 : selectedHarnessRuntime,
		target,
		runtimeModelAuth: resolveReusableRuntimeModelAuth({
			plan: params.runtimeAuthPlan ?? params.preparedRuntimePlan?.auth,
			provider,
			modelId,
			authProfileId: target.authProfileId
		}),
		provider,
		runtimeProvider: target.runtimeProvider ?? provider,
		contextConfigProvider: target.contextProvider ?? provider,
		modelId
	};
}
function buildCompactionHarnessModelProvider(params) {
	const route = params.plan?.modelRoute;
	return {
		api: route?.api ?? params.model?.api,
		baseUrl: route?.baseUrl ?? params.model?.baseUrl,
		...resolveAgentHarnessPreparedRouteSupport(params.plan),
		...params.plan ? { preparedAuth: resolveAgentHarnessPreparedAuthSupport({
			plan: params.plan,
			source: params.attempt?.kind === "implicit" ? void 0 : params.attempt?.kind
		}) } : {}
	};
}
/** Prepares one ordered auth-attempt set and converges it on a single compaction harness. */
async function prepareCompactionHarnessAuth(params) {
	const runtimeAuthProfileStore = isOpenAIProvider(params.provider) ? ensureAuthProfileStore(params.agentDir, {
		externalCliProviderIds: ["openai"],
		allowKeychainPrompt: false
	}) : ensureAuthProfileStoreWithoutExternalProfiles(params.agentDir, { allowKeychainPrompt: false });
	const selectPreparedHarness = (attempts) => selectAgentHarnessForPreparedModelProviders({
		provider: params.provider,
		modelId: params.modelId,
		modelProviders: attempts.map((attempt) => buildCompactionHarnessModelProvider({
			model: params.model,
			plan: attempt.plan,
			attempt
		})),
		config: params.config,
		agentId: params.runtimePolicyAgentId,
		sessionKey: params.runtimePolicySessionKey ?? void 0,
		agentHarnessId: params.agentHarnessId,
		agentHarnessRuntimeOverride: params.agentHarnessRuntimeOverride
	});
	const initialHarness = params.reusableRuntimeAuthPlan ? void 0 : selectAgentHarness({
		provider: params.provider,
		modelId: params.modelId,
		modelProvider: buildCompactionHarnessModelProvider({ model: params.model }),
		config: params.config,
		agentId: params.runtimePolicyAgentId,
		sessionKey: params.runtimePolicySessionKey ?? void 0,
		agentHarnessId: params.agentHarnessId,
		agentHarnessRuntimeOverride: params.agentHarnessRuntimeOverride
	});
	const prepare = (harness) => prepareAgentRuntimeAuth({
		provider: params.provider,
		modelId: params.modelId,
		modelApi: params.model?.api,
		modelBaseUrl: params.model?.baseUrl,
		config: params.config,
		env: process.env,
		agentDir: params.agentDir,
		workspaceDir: params.workspaceDir,
		authProfileStore: runtimeAuthProfileStore,
		sessionAuthProfileId: params.authProfileId,
		sessionAuthProfileSource: params.authProfileIdSource,
		harnessId: harness.id,
		harnessRuntime: harness.id,
		harnessAuthBootstrap: harness.authBootstrap
	});
	let runtimeAuthPreparation = params.reusableRuntimeAuthPlan ? {
		plan: params.reusableRuntimeAuthPlan,
		attempts: [{
			kind: "implicit",
			plan: params.reusableRuntimeAuthPlan
		}]
	} : prepare(initialHarness);
	let selectedPreparedHarness = selectPreparedHarness(runtimeAuthPreparation.attempts);
	if (!params.reusableRuntimeAuthPlan && selectedPreparedHarness.id !== initialHarness?.id) {
		runtimeAuthPreparation = prepare(selectedPreparedHarness);
		const confirmedHarness = selectPreparedHarness(runtimeAuthPreparation.attempts);
		if (confirmedHarness.id !== selectedPreparedHarness.id) throw new Error(`${params.convergenceErrorPrefix ?? "Prepared compaction"} auth routes did not converge on one agent harness for ${params.provider}/${params.modelId}.`);
		selectedPreparedHarness = confirmedHarness;
	}
	return {
		runtimeAuthProfileStore,
		runtimeAuthPreparation,
		selectedPreparedHarness,
		providerUsesProfileScopedModelMetadata: providerUsesCredentialScopedModelMetadata({
			provider: params.metadataProvider ?? params.provider,
			modelId: params.modelId,
			config: params.config,
			agentDir: params.agentDir,
			workspaceDir: params.workspaceDir
		})
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/compaction-session-agent.ts
async function prepareCompactionSessionAgent(params) {
	const authStorage = params.authStorage && typeof params.authStorage === "object" && "getApiKey" in params.authStorage && typeof params.authStorage.getApiKey === "function" ? params.authStorage : void 0;
	const transportApiKey = authStorage ? await resolveEmbeddedAgentApiKey({
		provider: params.effectiveModel.provider,
		resolvedApiKey: params.resolvedApiKey,
		authStorage
	}) : params.resolvedApiKey;
	params.session.agent.streamFn = resolveEmbeddedAgentStream({
		llmRuntime: params.llmRuntime,
		currentStreamFn: resolveEmbeddedAgentBaseStreamFn({ session: params.session }),
		providerStreamFn: params.providerStreamFn,
		sessionId: params.sessionId,
		signal: params.signal,
		model: params.effectiveModel,
		resolvedApiKey: params.resolvedApiKey,
		transportAuthAvailable: Boolean(transportApiKey?.trim()),
		authProfileId: params.runtimePlan?.auth.forwardedAuthProfileId,
		authStorage: params.authStorage
	}).streamFn;
	const providerTextTransforms = resolveProviderTextTransforms({
		provider: params.provider,
		config: params.config,
		workspaceDir: params.effectiveWorkspace
	});
	if (providerTextTransforms) params.session.agent.streamFn = wrapStreamFnTextTransforms({
		streamFn: params.session.agent.streamFn,
		input: providerTextTransforms.input,
		output: providerTextTransforms.output,
		transformSystemPrompt: false
	});
	const providerThinkingLevel = mapThinkingLevelForProvider(params.thinkLevel);
	const preparedRuntimeExtraParams = params.runtimePlan?.transport.resolveExtraParams({
		thinkingLevel: providerThinkingLevel,
		agentId: params.sessionAgentId,
		workspaceDir: params.effectiveWorkspace,
		model: params.effectiveModel
	});
	return {
		...applyExtraParamsToAgent(params.session.agent, params.config, params.provider, params.modelId, void 0, providerThinkingLevel, params.sessionAgentId, params.effectiveWorkspace, params.effectiveModel, params.agentDir, void 0, {
			...preparedRuntimeExtraParams ? { preparedExtraParams: preparedRuntimeExtraParams } : {},
			nativeWebSearchPolicyContext: {
				sessionKey: params.sessionKey,
				webSearchEnabled: false,
				runtimeToolAllowlist: [],
				sandboxToolPolicy: params.sandboxToolPolicy,
				messageProvider: params.messageProvider,
				agentAccountId: params.agentAccountId,
				groupId: params.groupId,
				groupChannel: params.groupChannel,
				groupSpace: params.groupSpace,
				spawnedBy: params.spawnedBy,
				senderId: params.senderId,
				senderName: params.senderName,
				senderUsername: params.senderUsername,
				senderE164: params.senderE164
			}
		}),
		transportApiKey
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/compaction-checkpoint.ts
const compactionCheckpointStore = createFileBackedCompactionCheckpointStore();
async function persistCompactionCheckpoint(params) {
	if (!params.config || !params.sessionKey || !params.snapshot) return false;
	try {
		const transcriptState = await readSessionLeafStateFromTranscriptAsync(params.sessionTarget ?? params.sessionFile);
		const checkpointPosition = resolveCompactionCheckpointTranscriptPosition({
			preferredLeafId: params.leafId,
			transcriptState
		});
		return await compactionCheckpointStore.persistCheckpoint({
			cfg: params.config,
			...params.sessionTarget?.agentId ? { agentId: params.sessionTarget.agentId } : {},
			sessionKey: params.sessionKey,
			sessionId: params.sessionId,
			reason: resolveSessionCompactionCheckpointReason({ trigger: params.trigger }),
			snapshot: params.snapshot,
			summary: params.summary,
			firstKeptEntryId: params.firstKeptEntryId,
			tokensBefore: params.tokensBefore,
			tokensAfter: params.tokensAfter,
			postSessionFile: params.sessionTarget ? formatSqliteSessionFileMarker(params.sessionTarget) : params.sessionFile,
			postLeafId: checkpointPosition.leafId,
			postEntryId: checkpointPosition.entryId,
			createdAt: params.createdAt
		}) !== null;
	} catch (err) {
		log.warn("failed to persist compaction checkpoint", { errorMessage: formatErrorMessage(err) });
		return false;
	}
}
//#endregion
//#region src/agents/embedded-agent-runner/compaction-duplicate-user-messages.ts
/**
* Removes short-window duplicate user turns from compaction summaries.
*/
const DEFAULT_DUPLICATE_USER_MESSAGE_WINDOW_MS = 6e4;
const MIN_DUPLICATE_USER_MESSAGE_CHARS = 24;
function normalizeUserMessageContent(content) {
	if (typeof content === "string") return content.replace(/\s+/g, " ").trim();
	if (!Array.isArray(content)) return;
	const textParts = [];
	for (const block of content) {
		if (!isRecord(block)) return;
		if (block.type === "image") return;
		if (block.type === "text" && typeof block.text === "string") textParts.push(block.text);
	}
	return textParts.join("\n").replace(/\s+/g, " ").trim();
}
function duplicateSignature(message) {
	if (!isRecord(message) || message.role !== "user" || typeof message.timestamp !== "number") return;
	const text = normalizeUserMessageContent(message.content);
	if (!text || text.length < MIN_DUPLICATE_USER_MESSAGE_CHARS || hasPersistedMedia(message)) return;
	const metadata = message["__openclaw"];
	const senderId = isRecord(metadata) && typeof metadata.senderId === "string" ? metadata.senderId : "";
	return {
		key: JSON.stringify([senderId, text.normalize("NFC")]),
		timestamp: message.timestamp
	};
}
/** Drop later duplicate user messages while preserving the first prompt. */
function dedupeDuplicateUserMessagesForCompaction(messages, options = {}) {
	const windowMs = options.windowMs ?? DEFAULT_DUPLICATE_USER_MESSAGE_WINDOW_MS;
	const lastSeenAtByKey = /* @__PURE__ */ new Map();
	let removed = 0;
	const result = [];
	for (const message of messages) {
		const signature = duplicateSignature(message);
		if (!signature) {
			if (message.role === "assistant") lastSeenAtByKey.clear();
			result.push(message);
			continue;
		}
		const lastSeenAt = lastSeenAtByKey.get(signature.key);
		const newestTimestamp = Math.max(lastSeenAt ?? signature.timestamp, signature.timestamp);
		lastSeenAtByKey.set(signature.key, newestTimestamp);
		if (typeof lastSeenAt === "number" && signature.timestamp >= lastSeenAt && signature.timestamp - lastSeenAt <= windowMs) {
			removed += 1;
			continue;
		}
		result.push(message);
	}
	return removed > 0 ? result : [...messages];
}
//#endregion
//#region src/agents/embedded-agent-runner/run/compaction-accounting-bridge.ts
const recorderByRuntimeContext = /* @__PURE__ */ new WeakMap();
function attachCompactionAccountingRecorder(runtimeContext, recorder) {
	recorderByRuntimeContext.set(runtimeContext, recorder);
}
function readCompactionAccountingRecorder(runtimeContext) {
	return runtimeContext ? recorderByRuntimeContext.get(runtimeContext) : void 0;
}
//#endregion
//#region src/agents/embedded-agent-runner/server-endpoint-compaction.ts
/** Try provider-owned compaction and persist its replay checkpoint on the session owner. */
// compaction-image-resize-skip-v1: when provider-owned compaction cannot run, the client summarizer handles the request.
function serverEndpointCompactionMayRun(params) {
	return !(params.trigger === "overflow" || params.customInstructions?.trim() || !resolveOpenAIResponsesCompactEndpointPlan(params.model, params.extraParams).enabled);
}
async function attemptServerEndpointCompaction(params) {
	if (!serverEndpointCompactionMayRun(params)) return;
	params.assertActive?.();
	let compacted;
	try {
		const messages = params.context.messages.filter((message) => message.role === "user" || message.role === "assistant" || message.role === "toolResult");
		if (messages.at(-1)?.role !== "assistant") return;
		if (requiresCompactionReplayRefresh(messages, params.model, params.requestOptions)) return;
		const owner = params.sessionManager.getBranch().findLast((entry) => entry.type === "message" && entry.message.role === "assistant");
		if (!owner || owner.type !== "message" || owner.message.role !== "assistant") throw new Error("Responses compact endpoint requires a persisted assistant owner");
		compacted = await compactWithSafetyTimeout((signal) => requestPreparedOpenAIResponsesCompaction(params.streamFn, params.model, {
			systemPrompt: params.context.systemPrompt,
			messages
		}, {
			...params.requestOptions,
			signal
		}), params.requestOptions.timeoutMs, params.requestOptions.signal ? { abortSignal: params.requestOptions.signal } : void 0);
		params.onUsage?.(compacted.usage);
		params.assertActive?.();
		const replacement = structuredClone(owner.message);
		captureOpenAIResponsesCompaction(replacement, compacted.item, compacted.historyMode === "retained-users" ? "retained-users" : replacement.content.length, compacted.model, compacted.replayMetadata, compacted.output);
		const redacted = redactTranscriptMessage(replacement, params.config);
		if (redacted.role !== "assistant" || !isDeepStrictEqual(redacted.providerReplay, replacement.providerReplay)) throw new Error("Responses compact endpoint window requires transcript redaction");
		const rewritten = rewriteTranscriptEntriesInSessionManager({
			sessionManager: params.sessionManager,
			replacements: [{
				entryId: owner.id,
				message: redacted
			}],
			preserveReplacementCompactionReplay: true
		});
		if (replacement.providerReplay?.data !== compacted.item.encrypted_content || !rewritten.changed) throw new Error(`Responses compact endpoint checkpoint was not persisted: ${rewritten.reason}`);
	} catch (err) {
		params.assertActive?.();
		log.debug(`Responses compact endpoint failed; falling back to client compaction: ${formatErrorMessage(err)}`);
		return;
	}
	params.onCompactionCommitted?.();
	return compacted;
}
//#endregion
//#region src/agents/embedded-agent-runner/compaction-session-execution.ts
/**
* Executes compaction while owning the transcript lock, session lifecycle,
* hooks, checkpoint, and optional successor transcript rotation.
*/
async function executePreparedCompactionSession(runtime) {
	const { params, diagId, trigger, attempt, maxAttempts, runId, compactionModelCallTrace, diagnosticCompactionRunId, nextDiagnosticModelCallId, agentDir, provider, modelId, attemptedThinking, fail, authStorage, modelRegistry, apiKeyInfo, hasRuntimeAuthExchange, sandboxSessionKey, sandbox, effectiveWorkspace, effectiveCwd, contextTokenBudget, effectiveModel, runtimePlan, runtimePlanModelContext, runAbortController, effectiveTools, allowedToolNames, buildSystemPromptText, resolvedMessageProvider, sessionAgentId } = runtime;
	let thinkLevel = runtime.thinkLevel;
	let compactionSessionManager = null;
	let checkpointSnapshot = null;
	let checkpointSnapshotRetained = false;
	try {
		const compactionTimeoutMs = resolveCompactionTimeoutMs(params.config);
		const accountingRecorder = readCompactionAccountingRecorder(params.contextEngineRuntimeContext);
		const memoryTranscript = accountingRecorder?.memoryTranscript;
		const sessionTarget = memoryTranscript?.sessionTarget ?? await resolveAgentRunSessionTarget({
			agentId: sessionAgentId,
			config: params.config,
			missingSessionKey: "resolve-existing",
			sessionFile: params.sessionFile,
			sessionId: params.sessionId,
			sessionKey: params.sessionKey,
			sessionTarget: params.sessionTarget
		});
		const assertActive = memoryTranscript?.assertActive ?? captureOwnedTranscriptWriteAssertion(sessionTarget);
		try {
			assertActive();
			const transcriptPolicy = runtimePlan.transcript.resolvePolicy(runtimePlanModelContext);
			const sessionManager = guardSessionManager(memoryTranscript?.sessionManager ?? SessionManager.open(sessionTarget), {
				agentId: sessionAgentId,
				runId: params.runId,
				sessionKey: params.sessionKey,
				config: params.config,
				contextWindowTokens: contextTokenBudget,
				allowSyntheticToolResults: transcriptPolicy.allowSyntheticToolResults,
				missingToolResultText: effectiveModel.api === "openai-responses" || effectiveModel.api === "azure-openai-responses" || effectiveModel.api === "openai-chatgpt-responses" ? "aborted" : void 0,
				allowedToolNames
			});
			checkpointSnapshot = memoryTranscript ? null : await compactionCheckpointStore.captureSnapshot({
				sessionManager,
				sessionFile: params.sessionFile,
				sessionTarget
			});
			compactionSessionManager = sessionManager;
			const recordUsage = accountingRecorder ? (usage) => {
				const normalized = normalizeUsage(usage);
				if (normalized) accountingRecorder.recordUsage(normalized);
			} : void 0;
			if (recordUsage) setSessionModelUsageSink(sessionManager, recordUsage);
			const settingsManager = createPreparedEmbeddedAgentSettingsManager({
				cwd: effectiveCwd,
				agentDir,
				cfg: params.config,
				pluginMetadataSnapshot: getCurrentPluginMetadataSnapshot({
					config: params.config,
					env: process.env,
					workspaceDir: effectiveWorkspace
				}),
				contextTokenBudget
			});
			const extensionFactories = buildEmbeddedExtensionFactories({
				cfg: params.config,
				sessionManager,
				provider,
				modelId,
				model: effectiveModel,
				contextTokenBudget,
				agentId: sessionAgentId,
				sessionId: params.sessionId,
				sessionKey: params.sessionKey ?? sandboxSessionKey,
				runId
			});
			const resourceLoader = createEmbeddedAgentResourceLoader({
				cwd: effectiveCwd,
				agentDir,
				settingsManager,
				extensionFactories
			});
			await resourceLoader.reload();
			applyAgentCompactionSettingsFromConfig({
				settingsManager,
				cfg: params.config,
				contextTokenBudget
			});
			applyAgentAutoCompactionGuard({
				settingsManager,
				silentOverflowProneProvider: isSilentOverflowProneModel({
					provider,
					modelId,
					baseUrl: effectiveModel.baseUrl ?? void 0
				})
			});
			const { customTools } = splitSdkTools({
				tools: effectiveTools,
				sandboxEnabled: Boolean(sandbox?.enabled),
				toolHookContext: {
					agentId: sessionAgentId,
					config: params.config,
					cwd: effectiveCwd,
					sessionKey: sandboxSessionKey,
					sessionId: params.sessionId,
					runId: params.runId,
					channelId: params.currentChannelId
				}
			});
			const sessionToolAllowlist = toSessionToolAllowlist(collectRegisteredToolNames(customTools));
			const providerStreamFn = resolveCompactionProviderStream({
				effectiveModel,
				config: params.config,
				agentDir,
				effectiveWorkspace,
				apiRegistry: getModelRegistryRuntime(modelRegistry).apiRegistry
			});
			while (true) {
				setCompactionSafeguardCancellation(sessionManager, void 0);
				attemptedThinking.add(thinkLevel);
				const systemPromptText = buildSystemPromptText(thinkLevel);
				let session;
				let diagnosticOwner;
				let resetCompactionTimeout;
				try {
					session = (await createAgentSessionForEmbeddedRunner({
						cwd: effectiveCwd,
						agentDir,
						authStorage,
						modelRegistry,
						model: effectiveModel,
						thinkingLevel: mapThinkingLevel(thinkLevel),
						tools: sessionToolAllowlist,
						customTools,
						sessionManager,
						settingsManager,
						resourceLoader
					}, {})).session;
					session[agentSessionSetContextReplacementHook](accountingRecorder?.recordCompaction, assertActive);
					session.setActiveToolsByName(sessionToolAllowlist);
					applySystemPromptToSession(session, systemPromptText);
					const { effectiveExtraParams, transportApiKey } = await prepareCompactionSessionAgent({
						session,
						llmRuntime: getModelRegistryRuntime(modelRegistry).llmRuntime,
						providerStreamFn,
						sessionId: params.sessionId,
						signal: runAbortController.signal,
						effectiveModel,
						resolvedApiKey: hasRuntimeAuthExchange ? void 0 : apiKeyInfo?.apiKey,
						authStorage,
						config: params.config,
						provider,
						modelId,
						thinkLevel,
						sessionAgentId,
						effectiveWorkspace,
						agentDir,
						runtimePlan,
						sessionKey: sandboxSessionKey,
						sandboxToolPolicy: sandbox?.tools,
						messageProvider: resolvedMessageProvider,
						agentAccountId: params.agentAccountId,
						groupId: params.groupId,
						groupChannel: params.groupChannel,
						groupSpace: params.groupSpace,
						spawnedBy: params.spawnedBy,
						senderId: params.senderId,
						senderName: params.senderName,
						senderUsername: params.senderUsername,
						senderE164: params.senderE164
					});
					const compactionReplayEnabled = resolveCompactionReplayEligibility(effectiveModel, {
						extraParams: effectiveExtraParams,
						apiKey: transportApiKey
					});
					diagnosticOwner = createDiagnosticEmbeddedRunOwner({
						sessionId: params.sessionId,
						...params.sessionKey ? { sessionKey: params.sessionKey } : {},
						runId: diagnosticCompactionRunId,
						workKey: diagnosticCompactionRunId
					});
					markDiagnosticEmbeddedRunStarted({
						sessionId: params.sessionId,
						...params.sessionKey ? { sessionKey: params.sessionKey } : {},
						runId: diagnosticCompactionRunId,
						workKey: diagnosticCompactionRunId,
						owner: diagnosticOwner
					});
					session.agent.streamFn = wrapStreamFnWithDiagnosticModelCallEvents(session.agent.streamFn, {
						runId: diagnosticCompactionRunId,
						...params.sessionKey && { sessionKey: params.sessionKey },
						sessionId: params.sessionId,
						provider,
						model: modelId,
						api: effectiveModel.api,
						transport: session.agent.transport,
						requestTimeoutMs: compactionTimeoutMs,
						contextTokenBudget,
						trace: compactionModelCallTrace,
						contentCapture: resolveDiagnosticModelContentCapturePolicy(params.config),
						nextCallId: nextDiagnosticModelCallId,
						ownerGeneration: diagnosticOwner.generation,
						onStarted: () => {
							resetCompactionTimeout?.();
							params.compactionTimeoutReset?.();
						}
					});
					const prior = await sanitizeSessionHistory({
						messages: session.messages,
						modelApi: effectiveModel.api,
						modelId,
						provider,
						allowedToolNames,
						config: params.config,
						workspaceDir: effectiveWorkspace,
						env: process.env,
						model: effectiveModel,
						sessionManager,
						sessionId: params.sessionId,
						policy: transcriptPolicy,
						preserveLatestAssistantThinking: false,
						// compaction-image-resize-skip-v1: the client summarizer reads persisted entries and drops image bytes.
						skipImageResize: !serverEndpointCompactionMayRun({
							trigger,
							model: effectiveModel,
							extraParams: effectiveExtraParams,
							customInstructions: params.customInstructions
						})
					});
					const dedupedValidated = dedupeDuplicateUserMessagesForCompaction(await validateReplayTurns({
						messages: prior,
						modelApi: effectiveModel.api,
						modelId,
						provider,
						config: params.config,
						workspaceDir: effectiveWorkspace,
						env: process.env,
						model: effectiveModel,
						sessionId: params.sessionId,
						policy: transcriptPolicy
					}));
					session.agent.state.messages = dedupedValidated;
					const originalMessages = session.messages.slice();
					const truncated = preserveCompactionReplayWindow(originalMessages, limitHistoryTurns(session.messages, getHistoryLimitFromSessionKey(params.sessionKey, params.config, {
						accountId: params.agentAccountId,
						peerId: params.conversationRoutePeerId,
						chatType: params.chatType
					})), effectiveModel, {
						sessionId: params.sessionId,
						authProfileId: runtimePlan.auth.forwardedAuthProfileId,
						enabled: compactionReplayEnabled
					});
					const limited = transcriptPolicy.repairToolUseResultPairing ? sanitizeToolUseResultPairingForModel(truncated, effectiveModel.api === "openai-responses" || effectiveModel.api === "azure-openai-responses" || effectiveModel.api === "openai-chatgpt-responses") : truncated;
					if (limited.length > 0) session.agent.state.messages = limited;
					const hookRunner = asCompactionHookRunner(getGlobalHookRunner());
					const observedTokenCount = normalizeObservedTokenCount(params.currentTokenCount);
					const beforeHookMetrics = buildBeforeCompactionHookMetrics({
						originalMessages,
						currentMessages: session.messages,
						observedTokenCount,
						estimateTokensFn: estimateTokens
					});
					const { hookSessionKey, missingSessionKey } = await runBeforeCompactionHooks({
						hookRunner,
						sessionId: params.sessionId,
						sessionKey: sessionTarget.sessionKey,
						sessionAgentId,
						workspaceDir: effectiveWorkspace,
						messageProvider: resolvedMessageProvider,
						metrics: beforeHookMetrics,
						assertActive,
						onHookMessages: params.onCompactionHookMessages
					});
					const { messageCountOriginal, tokenCountBefore: limitedTranscriptTokensBefore } = beforeHookMetrics;
					const diagEnabled = log.isEnabled("debug");
					const preMetrics = diagEnabled ? summarizeCompactionMessages(session.messages) : void 0;
					if (diagEnabled && preMetrics) {
						log.debug(`[compaction-diag] start runId=${runId} sessionKey=${params.sessionKey ?? params.sessionId} diagId=${diagId} trigger=${trigger} provider=${provider}/${modelId} attempt=${attempt} maxAttempts=${maxAttempts} pre.messages=${preMetrics.messages} pre.historyTextChars=${preMetrics.historyTextChars} pre.toolResultChars=${preMetrics.toolResultChars} pre.estTokens=${preMetrics.estTokens ?? "unknown"}`);
						log.debug(`[compaction-diag] contributors diagId=${diagId} top=${JSON.stringify(preMetrics.contributors)}`);
					}
					if (!containsRealConversationMessages(session.messages)) {
						log.info(`[compaction] skipping — no real conversation messages (sessionKey=${params.sessionKey ?? params.sessionId})`);
						return {
							ok: true,
							compacted: false,
							reason: "no real conversation messages"
						};
					}
					const compactStartedAt = Date.now();
					params.compactionTimeoutReset?.();
					let serverTokensAfter;
					const recordServerCompaction = () => {
						serverTokensAfter = estimateLlmBoundaryTokenPressure({
							messages: sessionManager.buildSessionContext().messages,
							systemPrompt: systemPromptText,
							prompt: "",
							replay: {
								model: effectiveModel,
								sessionId: params.sessionId,
								authProfileId: runtimePlan.auth.forwardedAuthProfileId,
								enabled: compactionReplayEnabled
							}
						});
						accountingRecorder?.recordCompaction(serverTokensAfter);
					};
					const serverResult = await attemptServerEndpointCompaction({
						trigger,
						streamFn: session.agent.streamFn,
						model: effectiveModel,
						context: {
							systemPrompt: systemPromptText,
							messages: session.messages
						},
						sessionManager,
						extraParams: effectiveExtraParams,
						customInstructions: params.customInstructions,
						config: params.config,
						onUsage: recordUsage,
						onCompactionCommitted: recordServerCompaction,
						assertActive,
						requestOptions: {
							apiKey: transportApiKey,
							sessionId: params.sessionId,
							authProfileId: runtimePlan.auth.forwardedAuthProfileId,
							timeoutMs: compactionTimeoutMs,
							signal: params.abortSignal
						}
					});
					const activeSession = session;
					let clientResult;
					if (!serverResult) try {
						params.compactionTimeoutReset?.();
						clientResult = await compactWithSafetyTimeout((_signal, resetTimeout) => {
							resetCompactionTimeout = resetTimeout;
							setCompactionSafeguardCancellation(compactionSessionManager, void 0);
							const requestState = trigger === "overflow" ? "unresolved" : void 0;
							if (trigger === "manual") return activeSession.compact(params.customInstructions);
							return resolveEffectiveCompactionMode(params.config) === "default" ? activeSession[agentSessionAutomaticCompaction](params.customInstructions, requestState) : activeSession[agentSessionAutomaticCompaction](params.customInstructions, requestState, "none");
						}, compactionTimeoutMs, {
							abortSignal: params.abortSignal,
							onCancel: () => {
								activeSession.abortCompaction();
							}
						});
					} finally {
						resetCompactionTimeout = void 0;
					}
					params.compactionTimeoutReset?.();
					const effectiveFirstKeptEntryId = clientResult?.firstKeptEntryId;
					const tokensBefore = serverResult?.usage.input_tokens ?? clientResult.tokensBefore;
					const tokensAfter = serverResult ? serverTokensAfter : estimateTokensAfterCompaction({
						messagesAfter: session.messages,
						observedTokenCount,
						fullSessionTokensBefore: limitedTranscriptTokensBefore ?? 0,
						estimateTokensFn: estimateTokens
					});
					const messageCountAfter = session.messages.length;
					const compactedCount = Math.max(0, messageCountOriginal - messageCountAfter);
					const activeSessionFile = memoryTranscript ? params.sessionFile : formatSqliteSessionFileMarker({
						...sessionTarget,
						sessionId: params.sessionId
					});
					if (!memoryTranscript) await runPostCompactionSideEffects({
						config: params.config,
						sessionKey: params.sessionKey,
						sessionId: params.sessionId,
						agentId: sessionAgentId,
						sessionFile: activeSessionFile,
						assertActive
					});
					if (clientResult) checkpointSnapshotRetained = await persistCompactionCheckpoint({
						config: params.config,
						sessionKey: params.sessionKey,
						sessionId: params.sessionId,
						trigger: params.trigger,
						snapshot: checkpointSnapshot,
						summary: clientResult.summary,
						firstKeptEntryId: effectiveFirstKeptEntryId,
						tokensBefore: observedTokenCount ?? clientResult.tokensBefore,
						tokensAfter,
						sessionFile: activeSessionFile,
						leafId: sessionManager.getLeafId?.() ?? void 0,
						createdAt: compactStartedAt
					});
					const postMetrics = diagEnabled ? summarizeCompactionMessages(session.messages) : void 0;
					if (diagEnabled && preMetrics && postMetrics) log.debug(`[compaction-diag] end runId=${runId} sessionKey=${params.sessionKey ?? params.sessionId} diagId=${diagId} trigger=${trigger} provider=${provider}/${modelId} attempt=${attempt} maxAttempts=${maxAttempts} outcome=compacted reason=none durationMs=${Date.now() - compactStartedAt} retrying=false post.messages=${postMetrics.messages} post.historyTextChars=${postMetrics.historyTextChars} post.toolResultChars=${postMetrics.toolResultChars} post.estTokens=${postMetrics.estTokens ?? "unknown"} delta.messages=${postMetrics.messages - preMetrics.messages} delta.historyTextChars=${postMetrics.historyTextChars - preMetrics.historyTextChars} delta.toolResultChars=${postMetrics.toolResultChars - preMetrics.toolResultChars} delta.estTokens=${typeof preMetrics.estTokens === "number" && typeof postMetrics.estTokens === "number" ? postMetrics.estTokens - preMetrics.estTokens : "unknown"}`);
					await runAfterCompactionHooks({
						hookRunner,
						sessionId: params.sessionId,
						sessionAgentId,
						hookSessionKey,
						missingSessionKey,
						workspaceDir: effectiveWorkspace,
						messageProvider: resolvedMessageProvider,
						messageCountAfter,
						tokensAfter,
						compactedCount,
						sessionFile: activeSessionFile,
						summaryLength: clientResult?.summary.length,
						tokensBefore,
						firstKeptEntryId: effectiveFirstKeptEntryId,
						assertActive,
						onHookMessages: params.onCompactionHookMessages
					});
					const resultSessionTarget = {
						agentId: sessionTarget.agentId,
						sessionId: sessionTarget.sessionId,
						sessionKey: sessionTarget.sessionKey,
						storePath: sessionTarget.storePath
					};
					if (params.sessionTarget?.threadId !== void 0) resultSessionTarget.threadId = params.sessionTarget.threadId;
					return {
						ok: true,
						compacted: true,
						...serverResult ? { compactionKind: "server-endpoint" } : {},
						result: {
							sessionTarget: resultSessionTarget,
							...clientResult ? {
								summary: clientResult.summary,
								firstKeptEntryId: clientResult.firstKeptEntryId
							} : { kind: "server-endpoint" },
							tokensBefore: serverResult ? tokensBefore : observedTokenCount ?? clientResult.tokensBefore,
							tokensAfter,
							details: serverResult ? {
								compactionKind: "server-endpoint",
								droppedMessageCount: serverResult.usage.dropped_message_count
							} : clientResult.details
						}
					};
				} catch (err) {
					assertActive();
					const failure = resolveCompactionFailure({
						error: err,
						safeguardCancellation: getCompactionSafeguardRuntime(sessionManager)?.cancellation,
						abortSignal: params.abortSignal
					});
					const fallbackThinking = pickFallbackThinkingLevel({
						message: formatErrorMessage(failure.error),
						attempted: attemptedThinking
					});
					if (fallbackThinking) {
						log.warn(`[compaction] request rejected for ${provider}/${modelId}; retrying with ${fallbackThinking}`);
						thinkLevel = fallbackThinking;
						params.compactionTimeoutReset?.();
						continue;
					}
					throw err;
				} finally {
					if (diagnosticOwner) closeDiagnosticEmbeddedRunOwner(diagnosticOwner);
					try {
						await flushPendingToolResultsAfterIdle({
							agent: session?.agent,
							sessionManager
						});
					} catch {}
					try {
						session?.dispose();
					} catch {}
				}
			}
		} finally {
			await runtime.disposeToolRuntimes();
		}
	} catch (err) {
		const failure = resolveCompactionFailure({
			error: err,
			safeguardCancellation: consumeCompactionSafeguardCancellation(compactionSessionManager),
			abortSignal: params.abortSignal
		});
		return fail(failure.reason, failure.error);
	} finally {
		setSessionModelUsageSink(compactionSessionManager, null);
		if (!checkpointSnapshotRetained) await compactionCheckpointStore.cleanupSnapshot(checkpointSnapshot);
	}
}
//#endregion
//#region src/agents/embedded-agent-runner/model-resolution.ts
/** Resolves embedded-run models through discovery first, then the prepared static catalog. */
async function resolveTieredModel(params) {
	const providers = params.fallbackProvider && params.fallbackProvider !== params.provider ? [params.provider, params.fallbackProvider] : [params.provider];
	let firstResolution;
	const resolveCandidates = async (options) => {
		for (const provider of providers) {
			const resolution = await resolveModelAsync(provider, params.modelId, params.agentDir, params.config, options);
			firstResolution ??= resolution;
			if (resolution.model) return {
				provider,
				resolution
			};
		}
	};
	const firstTier = await resolveCandidates({
		skipAgentDiscovery: true,
		allowBundledStaticCatalogFallback: params.staticCatalogOwnsTransport,
		preferBundledStaticCatalogTransport: params.staticCatalogOwnsTransport,
		preparedModelRuntime: params.preparedModelRuntime,
		workspaceDir: params.workspaceDir,
		authProfileId: params.authProfileId,
		authProfileMode: params.authProfileMode
	});
	if (firstTier) return firstTier;
	if (params.staticCatalogOwnsTransport) return {
		provider: params.fallbackProvider ?? params.provider,
		resolution: firstResolution
	};
	const config = params.config ?? {};
	const preparedModelRuntime = params.preparedModelRuntime ?? await prepareModelRuntimeSnapshot({
		config,
		agentDir: params.agentDir,
		workspaceDir: params.workspaceDir
	});
	return await resolveCandidates({
		...preparedModelRuntime.createStores(),
		workspaceDir: params.workspaceDir,
		authProfileId: params.authProfileId,
		authProfileMode: params.authProfileMode,
		allowBundledStaticCatalogFallback: true,
		preparedModelRuntime
	}) ?? {
		provider: params.fallbackProvider ?? params.provider,
		resolution: firstResolution
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/direct-compaction-preparation.ts
/**
* Prepares one direct embedded-agent compaction attempt through model, auth,
* workspace, and sandbox resolution.
*/
async function prepareDirectCompactionAttempt(params) {
	const startedAt = Date.now();
	const diagId = params.diagId?.trim() || createDirectCompactionDiagId();
	const trigger = params.trigger ?? "manual";
	const attempt = params.attempt ?? 1;
	const maxAttempts = params.maxAttempts ?? 1;
	const runId = params.runId ?? params.sessionId;
	const compactionModelCallTrace = freezeDiagnosticTraceContext(getActiveDiagnosticTraceContext() ?? createDiagnosticTraceContext());
	const diagnosticCompactionRunId = `${runId}:compaction:${diagId}`;
	let diagnosticModelCallSeq = 0;
	const resolvedWorkspace = resolveUserPath(params.workspaceDir);
	const earlyAgentIds = resolveSessionAgentIds({
		sessionKey: params.sessionKey,
		config: params.config,
		agentId: params.agentId
	});
	const agentDir = params.agentDir ?? resolveAgentDir(params.config ?? {}, earlyAgentIds.sessionAgentId);
	const { runtimePolicySessionKey, runtimePolicyAgentId, boundHarnessRuntime, selectedHarnessRuntimeOverride, runtimeModelAuth: { plan: reusableRuntimeAuthPlan, authProfileId, modelAuth: initialModelAuth }, provider, runtimeProvider, contextConfigProvider, modelId } = resolveCompactionRuntimeSelection({
		...params,
		modelId: params.model,
		boundHarnessRuntime: params.agentHarnessId,
		preparedRuntimePlan: params.runtimePlan
	});
	await ensureSelectedAgentHarnessPlugin({
		config: params.config,
		provider,
		modelId,
		agentId: runtimePolicyAgentId,
		sessionKey: runtimePolicySessionKey,
		agentHarnessId: boundHarnessRuntime,
		agentHarnessRuntimeOverride: selectedHarnessRuntimeOverride,
		workspaceDir: resolvedWorkspace,
		pluginRegistry: params.preparedModelRuntime.pluginRegistry
	});
	const attemptedThinking = /* @__PURE__ */ new Set();
	const fail = (reason, err) => {
		const failureReason = classifyCompactionReason(reason);
		const failure = err ? describeFailoverError(err) : void 0;
		const detail = failureReason === "unknown" ? formatUnknownCompactionReasonDetail(reason) : void 0;
		const detailSuffix = detail ? ` detail=${detail}` : "";
		log.warn(`[compaction-diag] end runId=${runId} sessionKey=${params.sessionKey ?? params.sessionId} diagId=${diagId} trigger=${trigger} provider=${provider}/${modelId} attempt=${attempt} maxAttempts=${maxAttempts} outcome=failed reason=${failureReason}${detailSuffix} durationMs=${Date.now() - startedAt}`);
		return {
			ok: false,
			compacted: false,
			reason,
			failure: failure ? {
				reason: failure.reason,
				status: failure.status,
				code: failure.code,
				rawError: failure.rawError ?? failure.message
			} : void 0
		};
	};
	const preparedModelRuntime = params.preparedModelRuntime;
	const { resolution: modelResolution } = await resolveTieredModel({
		provider: runtimeProvider,
		modelId,
		agentDir,
		config: params.config,
		workspaceDir: resolvedWorkspace,
		...initialModelAuth,
		preparedModelRuntime
	});
	const { model, error, authStorage, modelRegistry } = modelResolution;
	if (!model) return {
		ok: false,
		result: fail(error ?? `Unknown model: ${runtimeProvider}/${modelId}`)
	};
	const modelResolutionOptions = {
		authStorage,
		modelRegistry,
		preparedModelRuntime,
		workspaceDir: resolvedWorkspace
	};
	const { runtimeAuthProfileStore, runtimeAuthPreparation, selectedPreparedHarness, providerUsesProfileScopedModelMetadata } = await prepareCompactionHarnessAuth({
		...params,
		provider,
		metadataProvider: runtimeProvider,
		modelId,
		model,
		reusableRuntimeAuthPlan,
		agentDir,
		workspaceDir: resolvedWorkspace,
		authProfileId,
		runtimePolicyAgentId,
		runtimePolicySessionKey,
		agentHarnessId: boundHarnessRuntime,
		agentHarnessRuntimeOverride: selectedHarnessRuntimeOverride
	});
	const preparedHarnessRuntime = selectedPreparedHarness.id;
	const resolvePreparedModel = ({ config, authProfileId: profileId, authProfileMode: resolvedAuthProfileMode }) => resolveModelAsync(runtimeProvider, modelId, agentDir, config, {
		...modelResolutionOptions,
		skipAgentDiscovery: true,
		allowBundledStaticCatalogFallback: true,
		preferBundledStaticCatalogTransport: true,
		authProfileId: profileId,
		authProfileMode: resolvedAuthProfileMode
	});
	const materializeAuthAttemptModel = async (materializeParams) => await materializePreparedRuntimeModel({
		plan: materializeParams.plan,
		provider,
		modelId,
		config: params.config,
		model: materializeParams.model,
		forceResolve: materializeParams.forceResolve,
		resolveModel: resolvePreparedModel
	}) ?? materializeParams.model;
	const resolveRuntimeAuthAttempt = () => resolvePreparedRuntimeAuthAttempts({
		attempts: runtimeAuthPreparation.attempts,
		store: runtimeAuthProfileStore,
		modelId,
		model,
		materializeModel: materializeAuthAttemptModel,
		forceCredentialScopedDirectModelResolve: providerUsesProfileScopedModelMetadata,
		resolveAuth: async ({ attempt: preparedAttempt, model: attemptModel }) => await resolvePreparedRuntimeModelAuth({
			plan: preparedAttempt.plan,
			model: attemptModel,
			cfg: params.config,
			store: runtimeAuthProfileStore,
			agentDir,
			workspaceDir: resolvedWorkspace,
			...preparedAttempt.allowAuthProfileFallback !== void 0 ? { allowAuthProfileFallback: preparedAttempt.allowAuthProfileFallback } : {},
			secretSentinels: true
		}),
		errorMessage: `Prepared compaction auth attempts could not be resolved for ${provider}/${modelId}.`
	});
	let resolvedAuthAttempt;
	try {
		resolvedAuthAttempt = await resolveRuntimeAuthAttempt();
	} catch (err) {
		return {
			ok: false,
			result: fail(formatErrorMessage(err), err)
		};
	}
	let runtimeModel = resolvedAuthAttempt.model;
	const apiKeyInfo = resolvedAuthAttempt.auth;
	const resolvedRuntimeAuthPlan = resolvedAuthAttempt.plan;
	let hasRuntimeAuthExchange = false;
	try {
		if (!apiKeyInfo.apiKey) {
			if (apiKeyInfo.mode !== "aws-sdk") throw new MissingProviderAuthError(runtimeModel.provider, apiKeyInfo);
		} else {
			const preparedAuth = protectPreparedProviderRuntimeAuth({
				provider: runtimeModel.provider,
				preparedAuth: await prepareProviderRuntimeAuth({
					provider: runtimeModel.provider,
					config: params.config,
					workspaceDir: resolvedWorkspace,
					env: process.env,
					context: {
						config: params.config,
						agentDir,
						workspaceDir: resolvedWorkspace,
						env: process.env,
						provider: runtimeModel.provider,
						modelId,
						model: runtimeModel,
						apiKey: unwrapSecretSentinelsForProviderEgress(apiKeyInfo.apiKey, "provider runtime auth exchange"),
						authMode: apiKeyInfo.mode,
						profileId: apiKeyInfo.profileId
					}
				})
			});
			runtimeModel = applyPreparedRuntimeAuthToModel(runtimeModel, preparedAuth);
			const runtimeApiKey = preparedAuth?.apiKey ?? apiKeyInfo.apiKey;
			hasRuntimeAuthExchange = Boolean(preparedAuth?.apiKey);
			if (!runtimeApiKey) throw new Error(`Provider "${runtimeModel.provider}" runtime auth returned no apiKey.`);
			authStorage.setRuntimeApiKey(runtimeModel.provider, runtimeApiKey);
		}
	} catch (err) {
		return {
			ok: false,
			result: fail(formatErrorMessage(err), err)
		};
	}
	const thinkingCompat = projectModelThinkingCompat(runtimeModel.compat);
	const thinkingCatalogEntry = {
		provider: runtimeModel.provider,
		id: runtimeModel.id,
		api: runtimeModel.api,
		reasoning: runtimeModel.reasoning,
		...runtimeModel.thinkingLevelMap ? { thinkingLevelMap: runtimeModel.thinkingLevelMap } : {},
		params: runtimeModel.params,
		...thinkingCompat ? { compat: thinkingCompat } : {}
	};
	const thinkLevel = resolveEmbeddedCompactionThinkingLevel({
		config: params.config,
		provider: runtimeModel.provider,
		modelId: runtimeModel.id,
		inheritedLevel: params.thinkLevel,
		catalog: [thinkingCatalogEntry],
		agentId: runtimePolicyAgentId,
		sessionKey: runtimePolicySessionKey,
		agentRuntime: preparedHarnessRuntime
	});
	await fs.mkdir(resolvedWorkspace, { recursive: true });
	const sessionKey = params.sessionKey?.trim() || params.sessionId;
	const sandboxSessionKey = params.sandboxSessionKey?.trim() || sessionKey;
	const sandboxAgentId = params.sandboxAgentId ?? (sandboxSessionKey === sessionKey ? earlyAgentIds.sessionAgentId : void 0);
	const placementParams = params;
	const sandbox = placementParams.sandbox === void 0 ? await resolveSandboxContext({
		config: params.config,
		agentId: sandboxAgentId,
		execOverrides: params.execOverrides,
		sessionKey: sandboxSessionKey,
		workspaceDir: resolvedWorkspace
	}) : placementParams.sandbox;
	const effectiveWorkspace = sandbox?.enabled ? sandbox.workspaceAccess === "rw" ? resolvedWorkspace : sandbox.workspaceDir : resolvedWorkspace;
	const requestedCwd = params.cwd ? resolveUserPath(params.cwd) : void 0;
	if (sandbox?.enabled && requestedCwd && requestedCwd !== resolvedWorkspace) throw new Error("cwd override is not supported for sandboxed embedded compaction runs; omit cwd or use the agent workspace as cwd");
	const effectiveCwd = sandbox?.enabled ? effectiveWorkspace : requestedCwd ?? effectiveWorkspace;
	await fs.mkdir(effectiveWorkspace, { recursive: true });
	const isSqliteSessionTranscript = true;
	const { sessionAgentId: effectiveSkillAgentId } = earlyAgentIds;
	return {
		ok: true,
		value: {
			params,
			startedAt,
			diagId,
			trigger,
			attempt,
			maxAttempts,
			runId,
			compactionModelCallTrace,
			diagnosticCompactionRunId,
			nextDiagnosticModelCallId: () => `${diagnosticCompactionRunId}:model:${diagnosticModelCallSeq += 1}`,
			earlyAgentIds,
			agentDir,
			provider,
			contextConfigProvider,
			modelId,
			preparedHarnessRuntime,
			thinkLevel,
			attemptedThinking,
			fail,
			authStorage,
			modelRegistry,
			runtimeModel,
			apiKeyInfo,
			resolvedRuntimeAuthPlan,
			hasRuntimeAuthExchange,
			resolvedWorkspace,
			sandboxSessionKey,
			sandboxAgentId,
			sandbox,
			effectiveWorkspace,
			effectiveCwd,
			isSqliteSessionTranscript,
			effectiveSkillAgentId
		}
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/message-action-discovery-input.ts
/**
* Normalizes channel/session/message context before message-action discovery.
*
* Discovery expects absent optional fields as `undefined`; preserving nulls would create
* different cache/input shapes for the same missing runtime fact.
*/
/** Collect the current sender/channel hints used to discover message actions. */
function buildEmbeddedMessageActionDiscoveryInput(params) {
	return {
		cfg: params.cfg,
		channel: params.channel,
		...params.chatType ? { chatType: params.chatType } : {},
		currentChannelId: params.currentChannelId ?? void 0,
		currentThreadTs: params.currentThreadTs ?? void 0,
		currentMessageId: params.currentMessageId ?? void 0,
		accountId: params.accountId ?? void 0,
		sessionKey: params.sessionKey ?? void 0,
		sessionId: params.sessionId ?? void 0,
		agentId: params.agentId ?? void 0,
		requesterSenderId: params.senderId ?? void 0,
		senderIsOwner: params.senderIsOwner ?? void 0
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/prepared-compaction-runtime.ts
/**
* Builds the skills, tools, capability profile, and system prompt used by one
* prepared direct compaction attempt.
*/
async function buildPreparedCompactionRuntime(prepared) {
	const { params, runId, agentDir, provider, contextConfigProvider, modelId, preparedHarnessRuntime, thinkLevel, runtimeModel, apiKeyInfo, resolvedRuntimeAuthPlan, hasRuntimeAuthExchange, resolvedWorkspace, sandboxSessionKey, sandboxAgentId, sandbox, effectiveWorkspace, effectiveCwd, effectiveSkillAgentId: sessionAgentId } = prepared;
	const mode = params.execOverrides?.mode ? SESSION_PERMISSION_BY_EXEC_MODE[params.execOverrides.mode] : params.permissionMode ?? params.sessionEntry?.permissionMode;
	const root = params.sessionRoot ?? params.sessionEntry?.sessionRoot;
	const sessionPermissionPolicy = mode ? {
		mode,
		root: root ?? await fs.realpath(resolvedWorkspace)
	} : void 0;
	const execOverrides = sessionPermissionPolicy ? {
		...params.execOverrides,
		mode: resolveSessionPermissionExecMode(sessionPermissionPolicy)
	} : params.execOverrides;
	let restoreSkillEnv;
	let bundleMcpRuntime;
	let bundleLspRuntime;
	let toolRuntimesDisposed = false;
	let skillEnvironmentRestored = false;
	const disposeToolRuntimes = async () => {
		if (toolRuntimesDisposed) return;
		toolRuntimesDisposed = true;
		try {
			await bundleMcpRuntime?.dispose();
		} catch {}
		try {
			await bundleLspRuntime?.dispose();
		} catch {}
	};
	const restoreSkillEnvironment = () => {
		if (skillEnvironmentRestored) return;
		skillEnvironmentRestored = true;
		restoreSkillEnv?.();
	};
	const dispose = async () => {
		await disposeToolRuntimes();
		restoreSkillEnvironment();
	};
	try {
		const { skillsEligibility, skillsPromptWorkspaceDir: effectiveSkillsPromptWorkspace, skillsSnapshot: skillsSnapshotForRun, skillsWorkspaceDir: effectiveSkillsWorkspace, workspaceOnly: loadSkillsWorkspaceOnly } = resolveSandboxSkillRuntimeInputs({
			sandbox,
			skillsAnchorWorkspace: params.bootstrapWorkspaceDir ?? effectiveWorkspace,
			skillsSnapshot: params.skillsSnapshot
		});
		const { shouldLoadSkillEntries, skillEntries, loadSkillEntries, preserveEntryOrder } = resolveEmbeddedRunSkillEntries({
			workspaceDir: effectiveSkillsWorkspace,
			config: params.config,
			agentId: sessionAgentId,
			eligibility: skillsEligibility,
			skillsSnapshot: skillsSnapshotForRun,
			...sandbox?.enabled === true ? {} : { executionSkillsDir: path.join(effectiveWorkspace, "skills") },
			workspaceOnly: loadSkillsWorkspaceOnly
		});
		restoreSkillEnv = skillsSnapshotForRun ? applySkillEnvOverridesFromSnapshot({
			snapshot: skillsSnapshotForRun,
			config: params.config
		}) : applySkillEnvOverrides({
			skills: skillEntries ?? [],
			config: params.config
		});
		const promptSkillEntries = mapSandboxSkillEntriesForPrompt({
			entries: shouldLoadSkillEntries ? skillEntries : void 0,
			skillsWorkspaceDir: effectiveSkillsWorkspace,
			skillsPromptWorkspaceDir: effectiveSkillsPromptWorkspace
		});
		const skillUsagePaths = mapSandboxSkillUsagePaths({
			paths: sandbox?.skillUsagePaths,
			skillsWorkspaceDir: effectiveSkillsWorkspace,
			skillsPromptWorkspaceDir: effectiveSkillsPromptWorkspace
		});
		const skillsPrompt = resolveSkillsPrompt({
			skillsSnapshot: skillsSnapshotForRun,
			entries: promptSkillEntries,
			loadEntries: createSandboxPromptEntryLoader({
				loadEntries: loadSkillEntries,
				skillsWorkspaceDir: effectiveSkillsWorkspace,
				skillsPromptWorkspaceDir: effectiveSkillsPromptWorkspace
			}),
			config: params.config,
			workspaceDir: effectiveSkillsPromptWorkspace,
			agentId: sessionAgentId,
			eligibility: skillsEligibility,
			preserveEntryOrder
		});
		const sessionLabel = params.sessionKey ?? params.sessionId;
		const resolvedMessageProvider = params.messageChannel ?? params.messageProvider;
		const { contextFiles } = resolveContextInjectionMode(params.config, sessionAgentId) === "never" ? { contextFiles: [] } : await resolveBootstrapContextForRun({
			workspaceDir: effectiveWorkspace,
			config: params.config,
			sessionKey: params.sessionKey,
			sessionId: params.sessionId,
			chatType: params.chatType,
			agentId: sessionAgentId,
			warn: makeBootstrapWarn({
				sessionLabel,
				warn: (message) => log.warn(message)
			})
		});
		const runtimeModelWithContext = runtimeModel;
		const contextTokenBudget = resolveCompactionContextTokenBudget({
			config: params.config,
			provider: contextConfigProvider,
			modelId,
			model: runtimeModelWithContext,
			agentId: sessionAgentId,
			requestedTokenBudget: params.contextTokenBudget,
			fallbackTokenBudget: params.tokenBudget
		});
		const effectiveModel = applyAuthHeaderOverride(applyLocalNoAuthHeaderOverride(contextTokenBudget < (runtimeModelWithContext.contextWindow ?? Infinity) ? {
			...runtimeModelWithContext,
			contextWindow: contextTokenBudget
		} : runtimeModelWithContext, apiKeyInfo), hasRuntimeAuthExchange ? null : apiKeyInfo, params.config);
		const reuseFullRuntimePlan = params.runtimePlan?.auth === resolvedRuntimeAuthPlan;
		const preparedRuntimePlan = (reuseFullRuntimePlan ? params.runtimePlan : void 0) ?? buildAgentRuntimePlan({
			provider,
			modelId,
			model: effectiveModel,
			modelApi: effectiveModel.api,
			harnessId: preparedHarnessRuntime,
			harnessRuntime: preparedHarnessRuntime,
			authProfileMode: resolvedRuntimeAuthPlan.selectedAuthMode,
			sessionAuthProfileId: resolvedRuntimeAuthPlan.forwardedAuthProfileId,
			sessionAuthProfileSource: resolvedRuntimeAuthPlan.forwardedAuthProfileSource,
			sessionAuthProfileCandidateIds: resolvedRuntimeAuthPlan.forwardedAuthProfileCandidateIds,
			modelRoute: resolvedRuntimeAuthPlan.modelRoute,
			config: params.config,
			workspaceDir: effectiveWorkspace,
			agentDir,
			agentId: sessionAgentId,
			thinkingLevel: mapThinkingLevelForProvider(thinkLevel)
		});
		const runtimePlan = reuseFullRuntimePlan ? preparedRuntimePlan : {
			...preparedRuntimePlan,
			auth: resolvedRuntimeAuthPlan
		};
		const runAbortController = new AbortController();
		const spawnWorkspaceDir = effectiveCwd !== effectiveWorkspace ? resolvedWorkspace : resolveAttemptSpawnWorkspaceDir({
			sandbox,
			resolvedWorkspace
		});
		const runtimeCapabilityProfile = resolveConversationCapabilityProfile({
			config: params.config,
			sessionKey: sandboxSessionKey,
			agentId: sandboxAgentId,
			runSessionKey: params.sessionKey && params.sessionKey !== sandboxSessionKey ? params.sessionKey : void 0,
			sessionId: params.sessionId,
			runId: params.runId,
			agentDir,
			agentAccountId: params.agentAccountId,
			messageProvider: resolvedMessageProvider,
			chatType: params.chatType,
			conversationToolPolicy: params.conversationToolPolicy,
			groupId: params.groupId,
			groupChannel: params.groupChannel,
			groupSpace: params.groupSpace,
			spawnedBy: params.spawnedBy,
			senderId: params.senderId,
			senderName: params.senderName,
			senderUsername: params.senderUsername,
			senderE164: params.senderE164,
			senderIsOwner: params.senderIsOwner,
			modelProvider: effectiveModel.provider,
			modelId,
			modelApi: effectiveModel.api,
			modelContextWindowTokens: contextTokenBudget,
			workspaceDir: effectiveWorkspace,
			cwd: effectiveCwd,
			spawnWorkspaceDir,
			skillsSnapshot: skillsSnapshotForRun,
			sandboxToolPolicy: sandbox?.tools,
			inputProvenance: params.inputProvenance,
			trustedInternalHandoff: params.trustedInternalHandoff,
			pluginMetadataSnapshot: params.preparedModelRuntime.metadataSnapshot
		});
		const toolsEnabled = supportsModelTools(effectiveModel);
		const skillInstructionDeliveryCache = createSkillInstructionDeliveryCache();
		const toolsRaw = toolsEnabled ? createOpenClawCodingTools({
			agentId: sessionAgentId,
			exec: {
				...execOverrides,
				config: params.config,
				elevated: params.bashElevated
			},
			sandbox,
			sessionPermissionPolicy,
			messageProvider: resolvedMessageProvider,
			clientCaps: params.clientCaps,
			chatType: params.chatType,
			agentAccountId: params.agentAccountId,
			sessionKey: sandboxSessionKey,
			runSessionKey: params.sessionKey && params.sessionKey !== sandboxSessionKey ? params.sessionKey : void 0,
			sessionId: params.sessionId,
			runId: params.runId,
			oneShotCliRun: params.oneShotCliRun,
			groupId: params.groupId,
			groupChannel: params.groupChannel,
			groupSpace: params.groupSpace,
			spawnedBy: params.spawnedBy,
			senderId: params.senderId,
			senderName: params.senderName,
			senderUsername: params.senderUsername,
			senderE164: params.senderE164,
			allowGatewaySubagentBinding: params.allowGatewaySubagentBinding,
			agentDir,
			cwd: effectiveCwd,
			workspaceDir: effectiveWorkspace,
			spawnWorkspaceDir,
			config: params.config,
			webSearchEnabled: params.toolOverrides?.webSearch !== false,
			abortSignal: runAbortController.signal,
			sourceReplyDeliveryMode: params.sourceReplyDeliveryMode,
			modelProvider: effectiveModel.provider,
			modelId,
			modelHasVision: effectiveModel.input?.includes("image") ?? false,
			modelCompat: extractModelCompat(effectiveModel),
			modelApi: effectiveModel.api,
			modelContextWindowTokens: contextTokenBudget,
			skillsSnapshot: skillsSnapshotForRun,
			skillUsagePaths,
			skillInstructionDeliveryCache,
			conversationCapabilityProfile: runtimeCapabilityProfile,
			preparedModelRuntime: params.preparedModelRuntime,
			modelAuthMode: resolveModelAuthMode(effectiveModel.provider, params.config, void 0, { workspaceDir: effectiveWorkspace })
		}) : [];
		const runtimePlanModelContext = {
			workspaceDir: effectiveWorkspace,
			modelApi: effectiveModel.api,
			model: effectiveModel
		};
		const normalizableToolProjection = filterProviderNormalizableTools(toolsEnabled ? toolsRaw : []);
		logRuntimeToolSchemaQuarantine({
			diagnostics: normalizableToolProjection.diagnostics,
			tools: toolsEnabled ? toolsRaw : [],
			runId,
			agentId: sessionAgentId,
			sessionKey: params.sessionKey,
			sessionId: params.sessionId
		});
		const tools = runtimePlan.tools.normalize([...normalizableToolProjection.tools], runtimePlanModelContext);
		bundleMcpRuntime = toolsEnabled ? await createBundleMcpToolRuntime({
			workspaceDir: effectiveWorkspace,
			cfg: params.config,
			reservedToolNames: tools.map((tool) => tool.name)
		}) : void 0;
		bundleLspRuntime = toolsEnabled ? await createBundleLspToolRuntime({
			workspaceDir: effectiveWorkspace,
			cfg: params.config,
			reservedToolNames: [...tools.map((tool) => tool.name), ...bundleMcpRuntime?.tools.map((tool) => tool.name) ?? []]
		}) : void 0;
		const filteredBundledTools = applyFinalEffectiveToolPolicy({
			bundledTools: [...bundleMcpRuntime?.tools ?? [], ...bundleLspRuntime?.tools ?? []],
			config: params.config,
			conversationCapabilityProfile: runtimeCapabilityProfile,
			warn: (message) => log.warn(message)
		});
		const normalizableBundledToolProjection = filterProviderNormalizableTools(filteredBundledTools);
		if (normalizableBundledToolProjection.diagnostics.length > 0) logRuntimeToolSchemaQuarantine({
			diagnostics: normalizableBundledToolProjection.diagnostics,
			tools: filteredBundledTools,
			runId,
			agentId: sessionAgentId,
			sessionKey: params.sessionKey,
			sessionId: params.sessionId
		});
		const normalizedBundledTools = filteredBundledTools.length > 0 ? runtimePlan.tools.normalize([...normalizableBundledToolProjection.tools], runtimePlanModelContext) : filteredBundledTools;
		const projectedEffectiveTools = [...tools, ...normalizedBundledTools];
		const toolSchemaProjection = filterRuntimeCompatibleTools(projectedEffectiveTools);
		logRuntimeToolSchemaQuarantine({
			diagnostics: toolSchemaProjection.diagnostics,
			tools: projectedEffectiveTools,
			runId,
			agentId: sessionAgentId,
			sessionKey: params.sessionKey,
			sessionId: params.sessionId
		});
		const effectiveTools = [...toolSchemaProjection.tools];
		const allowedToolNames = collectAllowedToolNames({ tools: effectiveTools });
		const promptPolicyRestricted = toolPolicyRestrictsTools({ allow: params.toolsAllow });
		const promptTools = applyEmbeddedAttemptToolsAllow(effectiveTools, params.toolsAllow, { toolMeta: (tool) => getPluginToolMeta(tool) });
		const promptAllowedToolNames = collectAllowedToolNames({ tools: promptTools });
		runtimePlan.tools.logDiagnostics(effectiveTools, runtimePlanModelContext);
		const machineName = await getMachineDisplayName();
		const runtimeChannel = normalizeMessageChannel(params.messageChannel ?? params.messageProvider);
		const runtimeCapabilities = collectRuntimeChannelCapabilities({
			cfg: params.config,
			channel: runtimeChannel,
			accountId: params.agentAccountId
		});
		const reactionGuidance = runtimeChannel && params.config ? resolveChannelReactionGuidance({
			cfg: params.config,
			channel: runtimeChannel,
			accountId: params.agentAccountId
		}) : void 0;
		const channelActions = runtimeChannel ? listChannelSupportedActions(buildEmbeddedMessageActionDiscoveryInput({
			cfg: params.config,
			channel: runtimeChannel,
			chatType: params.chatType,
			currentChannelId: params.currentChannelId,
			currentThreadTs: params.currentThreadTs,
			currentMessageId: params.currentMessageId,
			accountId: params.agentAccountId,
			sessionKey: params.sessionKey,
			sessionId: params.sessionId,
			agentId: sessionAgentId,
			senderId: params.senderId
		})) : void 0;
		const messageToolHints = runtimeChannel ? resolveChannelMessageToolHints({
			cfg: params.config,
			channel: runtimeChannel,
			accountId: params.agentAccountId
		}) : void 0;
		const runtimeInfo = {
			agentId: sessionAgentId,
			agentName: params.config ? resolveRuntimeAgentName(params.config, sessionAgentId) : void 0,
			sessionKey: params.sessionKey,
			host: machineName,
			os: resolveRuntimeOsLabel(),
			arch: os.arch(),
			node: process.version,
			model: `${provider}/${modelId}`,
			shell: detectRuntimeShell(),
			channel: runtimeChannel,
			chatType: params.chatType,
			capabilities: runtimeCapabilities,
			channelActions,
			activeProcessSessions: listActiveProcessSessionReferences({ scopeKey: resolveProcessToolScopeKey({
				sessionKey: sandboxSessionKey,
				agentId: sessionAgentId
			}) }),
			activeNode: formatActiveNodeContextLabel(getCurrentActiveNodeContext())
		};
		const sandboxInfoExecPolicy = resolveEmbeddedSandboxInfoExecPolicy({
			config: params.config,
			agentId: sessionAgentId,
			sessionKey: params.sessionKey,
			permissionMode: sessionPermissionPolicy?.mode,
			sandboxAvailable: sandbox?.enabled === true,
			execOverrides
		});
		const sandboxInfo = buildEmbeddedSandboxInfo(sandbox, params.bashElevated, sandboxInfoExecPolicy);
		const reasoningTagHint = isReasoningTagProvider(provider, {
			config: params.config,
			workspaceDir: effectiveWorkspace,
			env: process.env,
			modelId,
			modelApi: effectiveModel.api,
			model: effectiveModel
		});
		const userTimezone = resolveUserTimezone(params.config?.agents?.defaults?.userTimezone);
		const userDate = formatDateStamp(Date.now(), userTimezone);
		const promptSurface = resolveAgentPromptSurfaceForSessionKey(params.sessionKey);
		const promptMode = promptPolicyRestricted ? "minimal" : resolvePromptModeForSession(params.sessionKey);
		const nativeCommandGuidanceLines = listRegisteredPluginAgentPromptGuidance({ surface: promptSurface });
		const openClawReferences = await resolveOpenClawReferencePaths({
			workspaceDir: effectiveWorkspace,
			argv1: process.argv[1],
			cwd: effectiveCwd,
			moduleUrl: import.meta.url
		});
		const promptContributionContext = {
			config: params.config,
			agentDir,
			workspaceDir: effectiveWorkspace,
			provider,
			modelId,
			promptMode,
			runtimeChannel,
			runtimeCapabilities,
			agentId: sessionAgentId
		};
		const promptContribution = runtimePlan.prompt.resolveSystemPromptContribution(promptContributionContext);
		const preparedMemoryPrompt = await prepareAgentMemoryPrompt({
			enabled: promptMode === "full",
			toolNames: promptTools.map((tool) => tool.name),
			citationsMode: params.config?.memory?.citations,
			agentId: runtimeInfo.agentId,
			agentSessionKey: runtimeInfo.sessionKey,
			sandboxed: sandboxInfo?.enabled === true
		});
		const preparedWatchedSessions = prepareWatchedSessionsPrompt({
			enabled: promptMode === "full",
			config: params.config,
			sessionKey: params.sessionKey,
			sandboxed: sandboxInfo?.enabled === true,
			toolNames: promptTools.map((tool) => tool.name),
			capabilityToolNames: promptAllowedToolNames
		});
		const activeProjectKeys = params.preparedModelRuntime?.activeProjectKeys ?? [];
		const buildSystemPromptText = (defaultThinkLevel) => {
			const builtSystemPrompt = buildEmbeddedSystemPrompt({
				config: params.config,
				agentId: sessionAgentId,
				workspaceDir: effectiveWorkspace,
				defaultThinkLevel,
				runtimeCwd: effectiveCwd,
				reasoningLevel: params.reasoningLevel ?? "off",
				extraSystemPrompt: params.extraSystemPrompt,
				ownerNumbers: params.ownerNumbers,
				reasoningTagHint,
				skillsPrompt: promptPolicyRestricted ? void 0 : skillsPrompt,
				docsPath: openClawReferences.docsPath ?? void 0,
				sourcePath: openClawReferences.sourcePath ?? void 0,
				promptMode,
				promptSurface,
				sourceReplyDeliveryMode: params.sourceReplyDeliveryMode,
				acpEnabled: isAcpRuntimeSpawnAvailable({
					config: params.config,
					sandboxed: sandboxInfo?.enabled === true
				}),
				runtimeInfo,
				reactionGuidance,
				messageToolHints,
				sandboxInfo,
				tools: promptTools,
				userTimezone,
				userDate,
				contextFiles,
				activeProjectKeys,
				preparedMemoryPrompt,
				preparedWatchedSessions,
				promptContribution,
				nativeCommandGuidanceLines
			});
			return transformProviderSystemPrompt({
				provider,
				config: params.config,
				workspaceDir: effectiveWorkspace,
				context: {
					config: params.config,
					agentDir,
					workspaceDir: effectiveWorkspace,
					provider,
					modelId,
					promptMode,
					runtimeChannel,
					runtimeCapabilities,
					agentId: sessionAgentId,
					systemPrompt: builtSystemPrompt
				}
			});
		};
		return {
			...prepared,
			contextTokenBudget,
			effectiveModel,
			runtimePlan,
			runtimePlanModelContext,
			runAbortController,
			effectiveTools,
			allowedToolNames,
			buildSystemPromptText,
			resolvedMessageProvider,
			sessionAgentId,
			disposeToolRuntimes,
			restoreSkillEnvironment,
			dispose
		};
	} catch (err) {
		await dispose();
		throw err;
	}
}
//#endregion
//#region src/agents/embedded-agent-runner/direct-compaction.ts
/** Coordinates one direct compaction attempt through explicit lifecycle phases. */
async function compactEmbeddedAgentSessionDirectOnce(params) {
	const preparation = await prepareDirectCompactionAttempt(params);
	if (!preparation.ok) return preparation.result;
	let runtime;
	try {
		runtime = await buildPreparedCompactionRuntime(preparation.value);
		return await executePreparedCompactionSession(runtime);
	} catch (err) {
		return preparation.value.fail(formatErrorMessage(err), err);
	} finally {
		await runtime?.dispose();
	}
}
//#endregion
//#region src/agents/embedded-agent-runner/compact.ts
/**
* Public facade and fallback coordinator for embedded-agent compaction.
*/
function lockedHarnessCompactionFailure(runtime) {
	return {
		ok: false,
		compacted: false,
		reason: runtime ? `Model selection is locked to native agent harness "${runtime}"; generic compaction is unavailable.` : "Model selection is locked but the persisted agent harness is unavailable.",
		failure: { reason: "model_selection_locked" }
	};
}
async function compactNativeCliSession(params) {
	const runtime = normalizeOptionalAgentRuntimeId(params.runtime);
	if (!runtime || params.compactParams.trigger !== "manual") return;
	const backend = resolveCliBackendConfig(runtime, params.compactParams.config, { agentId: params.compactParams.agentId });
	if (!backend?.ownsNativeCompaction) return;
	const manualCompaction = backend.manualCompaction;
	if (!manualCompaction) return {
		ok: false,
		compacted: false,
		reason: `CLI backend "${runtime}" owns compaction but does not support manual compaction.`
	};
	const cliSessionBinding = params.compactParams.cliSessionBinding;
	const cliSessionId = (cliSessionBinding?.sessionId ?? params.compactParams.cliSessionId)?.trim();
	if (!cliSessionId) return {
		ok: false,
		compacted: false,
		reason: `CLI backend "${runtime}" cannot manually compact without a resumable native session.`
	};
	const { runCliAgent } = await import("./cli-runner-aNrZxRaJ.js");
	const runId = `${params.compactParams.runId ?? params.compactParams.sessionId}:native-compact`;
	const sessionAgentId = resolveSessionAgentIds({
		sessionKey: params.compactParams.sessionKey,
		config: params.compactParams.config,
		agentId: params.compactParams.agentId
	}).sessionAgentId;
	const preparedRunAdmission = prepareSystemAgentRunAdmission(params.compactParams.config ?? {}, runId, sessionAgentId, "agents.native-compaction");
	try {
		const runControlOperation = async () => {
			await runCliAgent({
				preparedRunAdmission,
				sessionId: params.compactParams.sessionId,
				sessionKey: params.compactParams.sessionKey,
				sessionFile: params.compactParams.sessionFile,
				agentId: params.compactParams.agentId,
				workspaceDir: params.compactParams.workspaceDir,
				cwd: params.compactParams.cwd,
				agentDir: params.compactParams.agentDir,
				config: params.compactParams.config,
				prompt: manualCompaction.buildPrompt(params.compactParams.customInstructions),
				provider: runtime,
				modelProvider: params.compactParams.provider,
				model: params.compactParams.model,
				thinkLevel: params.compactParams.thinkLevel,
				timeoutMs: resolveCompactionTimeoutMs(params.compactParams.config),
				runId,
				cliSessionId,
				...cliSessionBinding ? { cliSessionBinding } : {},
				...cliSessionBinding?.authProfileId ? { authProfileId: cliSessionBinding.authProfileId } : params.compactParams.authProfileId ? { authProfileId: params.compactParams.authProfileId } : {},
				...params.compactParams.sessionEntry ? { sessionEntry: params.compactParams.sessionEntry } : {},
				contextWindow: params.compactParams.sessionEntry?.contextWindow,
				trigger: "manual",
				controlOperation: "compact",
				disableCliLiveSession: true,
				cleanupCliLiveSessionOnRunEnd: true,
				allowEmptyAssistantReplyAsSilent: true,
				abortSignal: params.compactParams.abortSignal
			});
		};
		if (params.runControlOperation) await params.runControlOperation(runControlOperation);
		else await runControlOperation();
	} catch (err) {
		return {
			ok: false,
			compacted: false,
			reason: `CLI backend "${runtime}" failed to compact its native session: ${formatErrorMessage(err)}`
		};
	} finally {
		preparedRunAdmission.close();
	}
	return {
		ok: true,
		compacted: true,
		reason: `CLI backend "${runtime}" compacted its native session.`
	};
}
function hasExplicitCompactionModel(params) {
	return Boolean(params.config?.agents?.defaults?.compaction?.model?.trim());
}
function resolveCompactionFallbacksOverride(params) {
	if (params.modelSelectionLocked) return [];
	return params.modelFallbacksOverride ?? resolveRunModelFallbacksOverride({
		cfg: params.config,
		sessionKey: params.sessionKey
	});
}
function hasCompactionModelFallbackCandidates(params) {
	const fallbacksOverride = resolveCompactionFallbacksOverride(params);
	const defaultFallbacks = resolveAgentModelFallbackValues(params.config?.agents?.defaults?.model);
	return (fallbacksOverride ?? defaultFallbacks).length > 0;
}
function classifyCompactionFallbackResult(result, provider, model) {
	if (result.ok) return null;
	const reason = result.reason?.trim();
	if (!reason) return null;
	const failureError = Object.assign(new Error(result.failure?.rawError ?? reason), {
		status: result.failure?.status,
		code: result.failure?.code
	});
	const failoverError = coerceToFailoverError(failureError, {
		provider,
		model
	});
	return failoverError ? { error: failoverError } : null;
}
function fallbackFailureToCompactionResult(err) {
	return {
		ok: false,
		compacted: false,
		reason: isFallbackSummaryError(err) ? err.message : formatErrorMessage(err)
	};
}
/**
* Core compaction logic without lane queueing.
* Use this when already inside a session/global lane to avoid deadlocks.
*/
async function compactEmbeddedAgentSessionDirect(paramsInput) {
	const paramsBase = applyAgentRunSessionTargetIdentity(paramsInput);
	const lockedHarnessRuntime = normalizeOptionalAgentRuntimeId(paramsBase.agentHarnessId);
	const deferLockedHarnessFailure = (paramsBase.trigger === "manual" && lockedHarnessRuntime ? resolveCliBackendConfig(lockedHarnessRuntime, paramsBase.config, { agentId: paramsBase.agentId }) : void 0)?.ownsNativeCompaction === true;
	if (paramsBase.modelSelectionLocked === true && lockedHarnessRuntime !== "openclaw" && !deferLockedHarnessFailure) return lockedHarnessCompactionFailure(lockedHarnessRuntime);
	const memoryTranscript = readCompactionAccountingRecorder(paramsBase.contextEngineRuntimeContext)?.memoryTranscript;
	memoryTranscript?.assertActive();
	const runSessionTarget = memoryTranscript?.sessionTarget ?? await resolveAgentRunSessionTarget({
		...paramsBase,
		missingSessionKey: "resolve-existing"
	});
	const requestedParams = {
		...paramsBase,
		agentId: runSessionTarget.agentId,
		sessionId: runSessionTarget.sessionId,
		sessionKey: runSessionTarget.sessionKey,
		sessionTarget: {
			agentId: runSessionTarget.agentId,
			sessionId: runSessionTarget.sessionId,
			sessionKey: runSessionTarget.sessionKey,
			storePath: runSessionTarget.storePath,
			...paramsBase.sessionTarget?.threadId !== void 0 ? { threadId: paramsBase.sessionTarget.threadId } : {}
		},
		sessionFile: runSessionTarget.sessionKey
	};
	const requestedAgentIds = resolveSessionAgentIds({
		sessionKey: requestedParams.sessionKey,
		config: requestedParams.config,
		agentId: requestedParams.agentId
	});
	const requestedAgentDir = requestedParams.agentDir ?? resolveAgentDir(requestedParams.config ?? {}, requestedAgentIds.sessionAgentId);
	const requestedWorkspaceDir = resolveUserPath(requestedParams.workspaceDir);
	const canonicalWorkspaceDir = resolveUserPath(resolveAgentWorkspaceDir(requestedParams.config ?? {}, requestedAgentIds.sessionAgentId));
	const runtimeSelection = resolveCompactionRuntimeSelection({
		...requestedParams,
		modelId: requestedParams.model,
		boundHarnessRuntime: requestedParams.agentHarnessId,
		preparedRuntimePlan: requestedParams.runtimePlan
	});
	const nativeCliResult = await compactNativeCliSession({
		runtime: runtimeSelection.selectedHarnessRuntime,
		compactParams: {
			...requestedParams,
			agentDir: requestedAgentDir,
			workspaceDir: requestedWorkspaceDir
		}
	});
	if (nativeCliResult) return nativeCliResult;
	if (requestedParams.modelSelectionLocked === true && lockedHarnessRuntime !== "openclaw") return lockedHarnessCompactionFailure(lockedHarnessRuntime);
	const pluginPlanCompactionTarget = resolveEmbeddedCompactionTarget({
		config: requestedParams.config,
		provider: requestedParams.provider,
		modelId: requestedParams.model,
		authProfileId: requestedParams.authProfileId,
		modelSelectionLocked: requestedParams.modelSelectionLocked,
		defaultProvider: DEFAULT_PROVIDER,
		defaultModel: DEFAULT_MODEL
	});
	const currentPluginMetadataSnapshot = getCurrentPluginMetadataSnapshot({
		config: requestedParams.config ?? {},
		workspaceDir: requestedWorkspaceDir,
		env: process.env,
		allowWorkspaceScopedSnapshot: true
	});
	const pluginPlanCandidates = resolveModelCandidateChain({
		cfg: requestedParams.config,
		agentId: requestedAgentIds.sessionAgentId,
		manifestPlugins: currentPluginMetadataSnapshot ?? [],
		provider: pluginPlanCompactionTarget.provider ?? "openai",
		model: pluginPlanCompactionTarget.model ?? "gpt-5.6-sol",
		requestedRouteResolution: "resolved",
		fallbacksOverride: resolveCompactionFallbacksOverride(requestedParams)
	});
	const runtimePluginSelections = [{
		provider: runtimeSelection.provider,
		modelId: runtimeSelection.modelId,
		...runtimeSelection.selectedHarnessRuntime ? { runtime: runtimeSelection.selectedHarnessRuntime } : {},
		agentId: requestedAgentIds.sessionAgentId
	}, ...pluginPlanCandidates.filter((candidate) => candidate.provider !== runtimeSelection.provider || candidate.model !== runtimeSelection.modelId).map((candidate) => runtimeSelection.boundHarnessRuntime ? {
		provider: candidate.provider,
		modelId: candidate.model,
		runtime: runtimeSelection.boundHarnessRuntime,
		agentId: requestedAgentIds.sessionAgentId
	} : {
		provider: candidate.provider,
		modelId: candidate.model,
		agentId: requestedAgentIds.sessionAgentId
	})];
	const preparedModelRuntimeLease = await acquireAgentRunPreparedModelRuntime({
		config: requestedParams.config ?? {},
		agentId: requestedAgentIds.sessionAgentId,
		agentDir: requestedAgentDir,
		workspaceDir: requestedWorkspaceDir,
		preserveWorkspaceDirOnRefresh: requestedWorkspaceDir !== canonicalWorkspaceDir,
		...requestedParams.allowGatewaySubagentBinding ? { allowGatewaySubagentBinding: true } : {},
		runtimePluginSelections
	});
	try {
		const preparedModelRuntimeOwnerSnapshot = preparedModelRuntimeLease.snapshot;
		const preparedWorkspaceDir = preparedModelRuntimeOwnerSnapshot.workspaceDir ?? requestedWorkspaceDir;
		const repoRoot = resolveSystemPromptRepoRoot({
			config: preparedModelRuntimeOwnerSnapshot.config,
			workspaceDir: preparedWorkspaceDir,
			cwd: requestedParams.cwd
		}) ?? null;
		const projectKey = repoRoot ? await resolveProjectKey(repoRoot) : null;
		const activeProjectKeys = prepareEmbeddedSessionActiveProjectKeys(requestedParams.sessionId, projectKey);
		const preparedModelRuntime = Object.freeze({
			...preparedModelRuntimeOwnerSnapshot,
			repoRoot,
			projectKey,
			activeProjectKeys
		});
		const params = {
			...requestedParams,
			config: preparedModelRuntime.config,
			agentId: preparedModelRuntime.agentId ?? requestedAgentIds.sessionAgentId,
			agentDir: preparedModelRuntime.agentDir,
			workspaceDir: preparedWorkspaceDir,
			preparedModelRuntime
		};
		const compactPrepared = async () => {
			if (hasExplicitCompactionModel(params) || !hasCompactionModelFallbackCandidates(params)) return await compactEmbeddedAgentSessionDirectOnce(params);
			const resolvedCompactionTarget = resolveEmbeddedCompactionTarget({
				config: params.config,
				provider: params.provider,
				modelId: params.model,
				authProfileId: params.authProfileId,
				modelSelectionLocked: params.modelSelectionLocked,
				defaultProvider: DEFAULT_PROVIDER,
				defaultModel: DEFAULT_MODEL
			});
			const primaryProvider = resolvedCompactionTarget.provider ?? "openai";
			const primaryModel = resolvedCompactionTarget.model ?? "gpt-5.6-sol";
			const requestedPrimaryProvider = params.provider?.trim() || "openai";
			const resolveAuthProvider = (provider) => resolveProviderIdForAuth(provider, {
				config: params.config,
				metadataSnapshot: preparedModelRuntime.metadataSnapshot
			});
			const primaryAuthProviders = new Set([primaryProvider, requestedPrimaryProvider].map(resolveAuthProvider));
			const fallbacksOverride = resolveCompactionFallbacksOverride(params);
			const fallbackAgentId = resolveSessionAgentIds({
				sessionKey: params.sandboxSessionKey ?? params.sessionKey,
				config: params.config,
				agentId: params.sandboxAgentId ?? params.agentId
			}).sessionAgentId;
			const resolvedPrimaryCandidate = resolveModelCandidateChain({
				cfg: params.config,
				agentId: fallbackAgentId,
				manifestPlugins: preparedModelRuntime.metadataSnapshot,
				provider: primaryProvider,
				model: primaryModel,
				requestedRouteResolution: "resolved",
				fallbacksOverride
			})[0];
			const fallbackSessionKey = params.sandboxSessionKey ?? params.sessionKey ?? params.sessionId;
			return (await runWithModelFallback({
				cfg: params.config,
				manifestPlugins: preparedModelRuntime.metadataSnapshot,
				provider: primaryProvider,
				model: primaryModel,
				requestedRouteResolution: "resolved",
				runId: params.runId ?? params.sessionId,
				agentDir: params.agentDir,
				agentId: fallbackAgentId,
				sessionId: params.sessionId,
				sessionKey: fallbackSessionKey,
				userLockedAuthProfileId: params.authProfileIdSource === "user" ? params.authProfileId : void 0,
				abortSignal: params.abortSignal,
				prepareAgentHarnessRuntime: async ({ provider, model, agentHarnessRuntimeOverride }) => {
					await ensureSelectedAgentHarnessPlugin({
						config: params.config,
						provider,
						modelId: model,
						agentId: fallbackAgentId,
						sessionKey: fallbackSessionKey,
						agentHarnessRuntimeOverride,
						workspaceDir: params.workspaceDir,
						pluginRegistry: preparedModelRuntime.pluginRegistry
					});
				},
				fallbacksOverride,
				classifyResult: ({ result, provider, model }) => classifyCompactionFallbackResult(result, provider, model),
				run: async (provider, model) => {
					const isPrimaryCandidate = provider === resolvedPrimaryCandidate?.provider && model === resolvedPrimaryCandidate.model;
					const preservesPrimaryAuth = isPrimaryCandidate || primaryAuthProviders.has(resolveAuthProvider(provider));
					const authProfileId = preservesPrimaryAuth ? params.authProfileId : void 0;
					return await compactEmbeddedAgentSessionDirectOnce({
						...params,
						provider,
						model,
						authProfileId,
						authProfileIdSource: preservesPrimaryAuth ? params.authProfileIdSource : void 0,
						runtimeAuthPlan: isPrimaryCandidate ? params.runtimeAuthPlan : void 0,
						runtimePlan: isPrimaryCandidate ? params.runtimePlan : void 0
					});
				}
			})).result;
		};
		return await withPluginRuntimeGenerationScope(preparedModelRuntime, compactPrepared);
	} catch (err) {
		return fallbackFailureToCompactionResult(err);
	} finally {
		preparedModelRuntimeLease.release();
	}
}
const testing = {
	compactNativeCliSession,
	hasRealConversationContent,
	hasMeaningfulConversationContent,
	containsRealConversationMessages,
	estimateTokensAfterCompaction,
	buildBeforeCompactionHookMetrics,
	resolveCompactionProviderStream,
	prepareCompactionSessionAgent,
	runBeforeCompactionHooks,
	runAfterCompactionHooks,
	runPostCompactionSideEffects
};
//#endregion
export { attachCompactionAccountingRecorder as a, prepareCompactionHarnessAuth as c, runPostCompactionSideEffects as d, resolveProjectKey as f, resolveTieredModel as i, resolveCompactionRuntimeSelection as l, compactNativeCliSession as n, compactionCheckpointStore as o, testing as r, persistCompactionCheckpoint as s, compactEmbeddedAgentSessionDirect as t, asCompactionHookRunner as u };
