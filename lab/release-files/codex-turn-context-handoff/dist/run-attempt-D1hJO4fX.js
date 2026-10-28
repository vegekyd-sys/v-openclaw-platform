// v-codex-suppressed-prompt-attempt-v1
import { $t as isJsonObject, A as TURN_FINALIZE_DRAIN_ABORT_GRACE_MS, B as isCodexAppServerIndeterminateRequestCancellationError, Bt as resolveCodexAppServerAuthProfileIdForAgent, Ct as ensureCodexAppServerClientRuntime, Dt as protectCodexAppServerLiveThread, F as withCodexStartupTimeout, Ft as readRecentCodexRateLimits, H as isCodexAppServerOverloadError, Ht as resolveCodexAppServerFallbackApiKeyCacheKey, I as getCodexAppServerClientInstanceId, It as rememberCodexRateLimitsRead, K as resolveCodexAppServerClientInstanceId, L as isCodexAppServerApprovalRequest, M as isCodexAppServerStartupError, Mt as withAbortableTimeout, P as resolveCodexStartupTimeoutMs, Pt as readCodexRateLimitsRevision, Qt as flattenCodexDynamicToolFunctions, R as isCodexAppServerBrokenPipeError, Rt as resolveCodexAppServerAuthAccountCacheKey, Ut as resolveCodexAppServerPreparedApiKeyCacheKey, V as isCodexAppServerIndeterminateTransportError, W as isCodexAppServerRequestTimeoutError, Wt as resolveCodexAppServerPreparedAuthHandoff, _t as resolveCodexToolAbortTerminalReason, a as clearSharedCodexAppServerClientIfCurrentAndUnclaimed, at as readCodexTurnCompletedNotification, c as getLeasedSharedCodexAppServerClient, ct as hasPendingDynamicToolTerminalDiagnostic, dt as resolveDynamicToolCallTimeoutMs, f as readCodexAppServerClientDesktopGenerationFingerprint, ft as resolveTerminalDynamicToolBatchAction, gt as toCodexDynamicToolProtocolResponse, h as releaseLeasedSharedCodexAppServerClient, ht as toCodexDynamicToolProgressResponse, i as clearSharedCodexAppServerClientIfCurrent, it as readCodexTurn, j as TURN_TERMINAL_SETTLEMENT_TIMEOUT_MS, k as CodexAppServerStartupError, l as getSharedCodexAppServerClient, lt as isDynamicToolTerminalDiagnosticEvent, mt as shouldReleaseTurnAfterTerminalDynamicTool, nt as readCodexDynamicToolCallParams, ot as createCodexElicitationResponse, pt as shouldBlockTerminalReleaseForNonTerminalDynamicToolResult, q as CodexAppServerRpcError, s as createIsolatedCodexAppServerClient, st as handleDynamicToolCallWithTimeout, tt as assertCodexTurnStartResponse, u as isCodexAppServerStartSelectionChangedError, ut as isMatchingDynamicToolTerminalDiagnostic, v as retainSharedCodexAppServerClientIfCurrent, y as retireSharedCodexAppServerClientIfCurrent, z as isCodexAppServerConnectionClosedError, zt as resolveCodexAppServerAuthProfileId } from "./shared-client-DxcfF9KX.js";
import { C as isCodexPairedNodeRemoteExecPlacementSandbox, D as resolveCodexPluginsPolicy, E as readCodexPluginConfig, F as resolveCodexAppServerHomeDir, O as resolveOpenClawExecPolicyForCodexAppServer, T as isCodexSandboxExecServerEnabled, d as shouldAutoApproveCodexAppServerApprovals, f as withMcpElicitationsApprovalPolicy, h as resolveCodexModelBackedReviewerPolicyContext, l as hasCodexMcpToolApprovalOverrides, m as canUseCodexModelBackedApprovalsReviewerForModel, o as resolveCodexComputerUseConfig, r as resolveCodexAppServerHomeScope, w as isCodexRemoteExecPlacementSandbox, y as readCodexRequirementsToml } from "./config-BhmfC1s6.js";
import { c as reclaimCurrentCodexSessionGeneration, d as sessionBindingIdentity, i as createCodexSessionGenerationSupersededError, l as resolveCodexRunSessionBindingAuthority, u as scopeCodexRunBindingStore } from "./session-binding-BHuTCRZQ.js";
import { B as readNonNegativeInteger, E as itemStatus, H as splitPlanText, I as readItem, L as readItemString, M as extractRawAssistantText, O as matchesCodexSnapshotTurn, P as readCodexErrorNotificationMessage, T as itemName, V as readNullableString, a as closeCodexStartupClientBestEffort, d as unsubscribeCodexThreadBestEffort, f as CODEX_APP_SERVER_NATIVE_TURN_WAIT_TIMEOUT_MS, g as readCodexNotificationThreadId, h as isCodexNotificationForTurn, j as shouldSynthesizeToolProgressForItem, k as shouldClearTerminalPresentationForNativeItem, l as retireUnsafeCodexTurnClientBestEffort, m as CodexProjectionDiagnostics, o as interruptCodexTurnAndWaitBestEffort, p as getCodexAppServerTurnRouter, r as CodexAppServerUnsafeSubscriptionError, u as terminateCodexBackgroundTerminals } from "./attempt-client-cleanup-DYHcRQAa.js";
import { a as codexExecutionToolName, c as isPendingOpenClawDynamicToolCompletionNotification, d as isTerminalTurnStatus, f as readCodexNotificationItem, h as updateActiveTurnItemIds, l as isRawFunctionToolOutputCompletionNotification, m as readRawResponseToolCallId, p as readNotificationItemId, r as projectCodexThreadUsageUpdate, s as isCodexTurnAbortMarkerNotification, t as CodexResponseCompletionProjection } from "./event-projector-usage-C5mcrGjp.js";
import { i as buildCodexPluginAppCacheKey, r as buildCodexAppServerRuntimeFingerprint, s as defaultCodexAppInventoryCache } from "./thread-resume-C7pyVKeW.js";
import { A as readCodexMcpToolConnectorId, B as emitCodexNativePreToolUseFailureDiagnostic, C as buildDeveloperInstructions, Ct as buildCodexPluginThreadConfig, D as resolveCodexAppServerThreadModelSelection, Dt as mergeCodexThreadConfigs, H as resolveCodexNativeHookRelayTtlMs, I as buildCodexNativeHookRelayConfig, L as buildCodexNativeHookRelayDisabledConfig, M as isCodexAppServerProfilerEnabled, Ot as shouldBuildCodexPluginThreadConfig, P as CODEX_NATIVE_HOOK_RELAY_TTL_GRACE_MS, Pt as resolveRecoverableCodexPluginConfigKeys, S as resolveCodexWebSearchPlan, Tt as buildCodexPluginThreadConfigTimeoutFallback, U as scheduleCodexNativeHookRelayUnregister, V as resolveCodexNativeHookRelayEvents, X as loadCodexNativeToolCatalog, Y as hasCodexNativeToolCatalog, _t as neutralizeCodexExplicitMentionSigils, at as filterCodexDynamicTools, bt as resolveCodexContextEngineProjectionReserveTokens, c as assertScheduledCodexAppAuthorityRuntime, d as buildScheduledCodexAppServerConnectionIdentity, f as captureScheduledCodexAppAuthority, ft as resolveCodexDynamicToolsLoadingForRuntime, gt as fitCodexProjectedContextForTurnStart, h as resolveScheduledCodexAppCreatorCaptureDecision, ht as buildCodexContinuityCalibration, i as buildCodexUserInput, j as readCodexMcpToolUiVisibility, l as buildLegacyScheduledCodexAppRecoveryPrompt, lt as isSystemAgentOnlyCodexDynamicToolAllowlist, m as readCurrentCodexScheduledAppPolicy$1, n as buildTurnCollaborationMode, nt as codexLegacyDynamicToolsFingerprint, p as intersectCodexPluginThreadConfigWithScheduledAuthority, pt as buildContextEngineBinding, r as buildTurnStartParams, s as startOrResumeThread, tt as codexDynamicToolsFingerprint, u as buildScheduledCodexAppAuthorityInputFingerprint, vt as projectContextEngineAssemblyForCodex, wt as buildCodexPluginThreadConfigInputFingerprint, xt as resolveCodexContinuityProjectionMaxChars, yt as resolveCodexContextEngineProjectionMaxChars, z as createCodexNativeHookRelay, vDeliverTurnContextHandoff as deliverCodexTurnContextHandoff, vInvalidateTurnContextHandoff as invalidateCodexTurnContextHandoff } from "./thread-lifecycle-DAcEJ_Om.js"; // v-codex-turn-context-handoff-v1
import { l as isIncognitoSessionKey, r as retainCodexAppServerBindingSubscription } from "./thread-ownership-zGokd8i1.js";
import { a as buildCodexUserPromptMessage, i as mirrorPromptAtTurnStartBestEffort, l as hasCodexMirrorOrigin, n as createCodexAppServerUserMessagePersistenceNotifier, o as promptSnapshot, s as applyCodexTranscriptTaint, t as codexTranscriptMirrorRuntime } from "./transcript-mirror-DTUxFWa_.js";
import { n as CodexThreadPolicyHandoffError } from "./thread-policy-g4KbJPzp.js";
import { r as readMirrorIdentity, t as attachCodexMirrorIdentity } from "./upstream-prompt-provenance-LphB8slG.js";
import { t as CODEX_CONTROL_METHODS } from "./capabilities-dIjNVCYH.js";
import { a as shouldRefreshCodexRateLimitsForUsageLimitMessage, i as resolveCodexUsageLimitResetAtMs, n as formatCodexUsageLimitErrorMessage } from "./rate-limits-CawQJfUS.js";
import { a as formatCodexDisplayText } from "./command-formatters-CLHhEB1Q.js";
import { a as resolveCodexAppServerForModelProvider, i as resolveCodexSessionPermissionCwd, n as applyCodexSessionPermissionPolicy, r as resolveCodexEffectiveSessionPermissionPolicy } from "./session-permission-policy-DeWVTCMj.js";
import { n as resolveCodexBindingAppServerConnection } from "./binding-connection-E6uDsPlx.js";
import { n as prepareCodexAppServerAuthBinding } from "./auth-binding-Ds_QVm-X.js";
import { t as persistCodexContextCompactionActivity } from "./context-compaction-activity-CMla5FPJ.js";
import { i as createAssistantReasoningMessage, n as createAssistantCommentaryMessage, r as createAssistantMessage, t as createAssistantAsyncMessage } from "./event-projector-assistant-message-DHRFXKbS.js";
import { a as CodexToolProgressProjection, c as isCodexCommandBearingToolCall, d as sanitizeCodexToolResponse, i as CodexToolTranscriptProjection, l as resolveCodexToolProgressDetailMode, n as CodexEventProjection, o as shouldEmitTranscriptToolProgress, r as emitCodexAgentEvent, s as inferCodexDynamicToolMeta, t as codexNativeSubagentMonitorRuntime, u as sanitizeCodexToolArguments } from "./native-subagent-monitor-CnH147jH.js";
import { a as requestPluginApprovalOutcome } from "./plugin-approval-roundtrip-CNe-Xrjx.js";
import { S as shouldWarnCodexDynamicToolBuildStageSummary, T as CodexNativeToolLifecycleProjector, _ as resolveCodexMessageToolProvider, a as emitDynamicToolStartedDiagnostic, b as shouldEnableCodexAppServerNativeToolSurface, c as ensureCodexSandboxExecServerEnvironment, d as createCodexDynamicToolBuildStageTracker, f as disableCodexPluginThreadConfig, g as resolveCodexExternalSandboxPolicyForOpenClawSandbox, h as resolveCodexAppServerHookChannelId, i as emitDynamicToolErrorDiagnostic, l as releaseCodexSandboxExecServerEnvironment, m as resolveCodexAppServerExecutionCwd, n as projectCodexExecutableDynamicTools, o as emitDynamicToolTerminalDiagnostic, p as formatCodexDynamicToolBuildStageSummary, r as routeCodexAppServerElicitationRequest, s as handleCodexAppServerApprovalRequest, t as createCodexDynamicToolBridge, u as buildDynamicTools, w as readBoundedCodexRemoteWorkspaceFile, x as shouldRequireCodexSandboxExecServerEnvironment, y as resolveCodexSandboxEnvironmentSelection } from "./dynamic-tools-BU9tmlYm.js";
import { t as resolveCodexProviderWebSearchSupport } from "./provider-capabilities-DW5p4k9w.js";
import { a as getCodexWorkspaceMemoryToolNames, c as readContextEngineThreadBootstrapProjection, d as resolveCodexDeliveryHintPreservedInputRange, f as resolveContextEngineBootstrapProjectionDecision, i as buildCodexWorkspaceBootstrapContext, l as readMirroredSessionHistoryMessages, n as buildCodexSystemPromptReport, r as buildCodexWatchedSessionsContext, s as prependCodexOpenClawPromptContext, t as buildCodexOpenClawPromptContext, u as renderCodexSkillsCollaborationInstructions } from "./attempt-context-DmQUNWwT.js";
import { n as captureCodexSettledTurnFinalizationContext } from "./settled-turn-context-D3SNWtUn.js";
import { a as runCodexComputerUseLiveTest, n as ensureCodexComputerUse, t as defaultCodexPluginMetadataCache } from "./plugin-metadata-cache-BFrPhb2c.js";
import { asOptionalRecord, normalizeOptionalString, readStringField } from "openclaw/plugin-sdk/string-coerce-runtime";
import fs from "node:fs/promises";
import { existsSync as existsSyncDeepSeekWindow, readFileSync as readFileSyncDeepSeekWindow } from "node:fs"; // v-codex-ds-window-v2
import { fileURLToPath as fileURLToPathDeepSeekWindow } from "node:url"; // v-codex-ds-window-v2
import path from "node:path";
import { createDeferred } from "openclaw/plugin-sdk/extension-shared";
import { MAX_TIMER_TIMEOUT_MS, asDateTimestampMs, resolveTimerTimeoutMs } from "openclaw/plugin-sdk/number-runtime";
import { AgentHarnessPreflightError, CODEX_APP_SERVER_CONTEXT_ENGINE_HOST, FAST_MODE_AUTO_PROGRESS_KIND, agentHarnessAttemptTerminal, agentHarnessStructuredInput, assembleHarnessContextEngine, assertContextEngineHostSupport, awaitAgentEndSideEffects, bootstrapHarnessContextEngine, buildAgentHookContextChannelFields, buildEmbeddedForegroundPromptContext, buildHarnessContextEngineRuntimeContext, callGatewayTool, cancelPendingAgentQuestionForSession, claimPendingAgentQuestionAnswer, classifyAgentHarnessTerminalOutcome, clearActiveEmbeddedRun, detectAndLoadAgentHarnessPromptImages, embeddedAgentLog, emitAgentEvent, emptyAgentHarnessUserInputAnswers, formatErrorMessage, formatFastModeAutoProgressText, getAgentHarnessHookRunner, hasBeforeToolCallPolicy, isActiveHarnessContextEngine, isHostScopedAgentToolActive, loadCodexBundleMcpThreadConfig, materializeRequesterScopedMcpToolsForHarnessRun, prepareHarnessNativeMcpAppPreview, projectAgentHarnessTranscriptMessageForDisplay, resolveAgentDir, resolveAgentHarnessBeforePromptBuildResult, resolveAgentRunAbortLifecycleFields, resolveAttemptFsWorkspaceOnly, resolveContextEngineOwnerPluginId, resolveFastModeForElapsed, resolveSandboxContext, resolveUserPath, runAgentCleanupStep, runAgentEndSideEffects, runAgentHarnessAfterCompactionHook, runAgentHarnessBeforeCompactionHook, runAgentHarnessLlmInputHook, runAgentHarnessLlmOutputHook, runHarnessContextEngineMaintenance, setActiveEmbeddedRun, supportsModelTools } from "openclaw/plugin-sdk/agent-harness-runtime";
import { isPathStrictlyInside, root } from "openclaw/plugin-sdk/file-access-runtime";
import { createHash } from "node:crypto";
import { markAuthProfileBlockedUntil, resolveAgentDir as resolveAgentDir$1 } from "openclaw/plugin-sdk/agent-runtime";
import { resolveAgentConfig as resolveAgentConfig$1, resolveSessionAgentIdsStrict } from "openclaw/plugin-sdk/agent-scope-runtime";
import { loadExecApprovals } from "openclaw/plugin-sdk/exec-approvals-runtime";
import { parseSqliteSessionFileMarker } from "openclaw/plugin-sdk/session-store-runtime";
import { addAbortListener } from "node:events";
import { truncateUtf16Safe, truncateUtf8Prefix } from "openclaw/plugin-sdk/text-utility-runtime";
import { createDiagnosticTraceContextFromActiveScope, emitTrustedDiagnosticEvent, emitTrustedDiagnosticEventWithPrivateData, freezeDiagnosticTraceContext, onInternalDiagnosticEvent, resolveDiagnosticModelContentCapturePolicy } from "openclaw/plugin-sdk/diagnostic-runtime";
import { captureFinalCodexCronCreatorToolAllowlist, formatMcpCodexApprovalRemedy, materializeStaticMcpToolsForHarnessRun, resolveCodexMcpToolOverridesForAgent, resolveCodexTtsProvenanceTransfer } from "openclaw/plugin-sdk/codex-mcp-projection";
import { hasPromptImageInput } from "openclaw/plugin-sdk/session-transcript-runtime";
import { Buffer as Buffer$1 } from "node:buffer";
import { sleepWithAbort } from "openclaw/plugin-sdk/runtime-env";
import { getAgentScopedMediaLocalRoots } from "openclaw/plugin-sdk/media-local-roots";
import { isSilentReplyPayloadText } from "openclaw/plugin-sdk/reply-chunking";
import { generatedImageAssetFromBase64 } from "openclaw/plugin-sdk/image-generation";
import { resolveGeneratedMediaMaxBytes } from "openclaw/plugin-sdk/media-generation-runtime";
import { saveMediaBuffer } from "openclaw/plugin-sdk/media-store";
import { stripInvisibleUnicode } from "openclaw/plugin-sdk/web-content-extractor";
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
//#region extensions/codex/src/app-server/attempt-steering.ts
/**
* Debounced steering queue for forwarding user messages to an active Codex
* app-server turn.
*/
const CODEX_STEER_ALL_DEBOUNCE_MS = 500;
var CodexSteeringAcceptedUnconfirmedError = class extends Error {
	constructor(message, options) {
		super(message, options);
		this.name = "CodexSteeringAcceptedUnconfirmedError";
	}
};
/**
* Creates a queue that batches steer messages while still serializing
* app-server `turn/steer` requests.
*/
function createCodexSteeringQueue(params) {
	let batchedMessages = [];
	const dispatchedBatches = /* @__PURE__ */ new Map();
	const pendingMessages = /* @__PURE__ */ new Set();
	let batchTimer;
	let batchSequence = 0;
	let sendChain = Promise.resolve();
	let sealedError;
	let closedError;
	const assertActive = () => {
		const unavailableError = closedError ?? sealedError;
		if (unavailableError) throw unavailableError;
		params.signal.throwIfAborted();
		params.assertActive();
	};
	const clearBatchTimer = () => {
		if (batchTimer) {
			clearTimeout(batchTimer);
			batchTimer = void 0;
		}
	};
	const reportItemAcceptance = (item, accepted) => {
		if (item.acceptance !== "open") return;
		item.acceptance = accepted ? "accepted" : "rejected";
		item.onQueueAccepted?.(accepted);
	};
	const resolveItem = (item) => {
		if (item.settled) return;
		reportItemAcceptance(item, true);
		item.settled = true;
		pendingMessages.delete(item);
		item.resolve();
	};
	const rejectItem = (item, error) => {
		if (item.settled) return;
		item.settled = true;
		pendingMessages.delete(item);
		reportItemAcceptance(item, false);
		item.reject(item.acceptance === "accepted" ? new CodexSteeringAcceptedUnconfirmedError("Codex accepted steering but did not confirm transcript consumption", { cause: error }) : error);
	};
	const closeQueue = (error) => {
		if (closedError) return;
		closedError = error;
		params.signal.removeEventListener("abort", abortQueue);
		clearBatchTimer();
		batchedMessages = [];
		for (const batch of dispatchedBatches.values()) for (const item of batch.items) reportItemAcceptance(item, true);
		dispatchedBatches.clear();
		for (const item of pendingMessages) rejectItem(item, error);
	};
	const sealQueueAdmission = () => {
		if (sealedError || closedError) return;
		sealedError = /* @__PURE__ */ new Error("codex app-server steering queue admission sealed");
		clearBatchTimer();
		batchedMessages = [];
		const dispatchedItems = new Set([...dispatchedBatches.values()].flatMap((batch) => batch.items));
		for (const item of pendingMessages) if (!dispatchedItems.has(item)) rejectItem(item, sealedError);
	};
	const abortQueue = () => {
		closeQueue(/* @__PURE__ */ new Error("codex app-server steering queue aborted"));
	};
	const cancelQueue = () => {
		closeQueue(/* @__PURE__ */ new Error("codex app-server steering queue cancelled"));
	};
	const sendBatch = async (items) => {
		const liveItems = items.filter((item) => !item.settled);
		if (liveItems.length === 0) return;
		let clientUserMessageId;
		try {
			assertActive();
			const input = [];
			for (const item of liveItems) {
				input.push(...await params.prepareMessage(item.text, item));
				assertActive();
			}
			clientUserMessageId = `openclaw:${params.turnId}:steer:${++batchSequence}`;
			dispatchedBatches.set(clientUserMessageId, { items: liveItems });
			await params.client.request("turn/steer", {
				threadId: params.threadId,
				expectedTurnId: params.turnId,
				input,
				clientUserMessageId
			}, {
				timeoutMs: params.requestTimeoutMs,
				signal: params.signal
			});
			for (const item of liveItems) reportItemAcceptance(item, true);
		} catch (error) {
			if (clientUserMessageId) dispatchedBatches.delete(clientUserMessageId);
			const acceptedUnconfirmed = clientUserMessageId !== void 0 && (isCodexAppServerIndeterminateRequestCancellationError(error) || isCodexAppServerIndeterminateTransportError(error));
			for (const item of liveItems) {
				if (acceptedUnconfirmed) reportItemAcceptance(item, true);
				rejectItem(item, error);
			}
			throw error;
		}
	};
	const enqueueSend = (items) => {
		const send = sendChain.then(() => sendBatch(items));
		sendChain = send;
		send.catch((error) => {
			for (const item of items) rejectItem(item, error);
			embeddedAgentLog.debug("codex app-server queued steer failed", { error });
		});
		return send;
	};
	const flushBatch = () => {
		clearBatchTimer();
		const items = batchedMessages;
		batchedMessages = [];
		if (items.length === 0) return sendChain;
		const send = enqueueSend(items);
		send.catch(() => void 0);
		return send;
	};
	const createPendingMessage = (text, options) => {
		let resolveDelivery;
		let rejectDelivery;
		const delivery = new Promise((resolve, reject) => {
			resolveDelivery = resolve;
			rejectDelivery = reject;
		});
		const item = {
			...options,
			acceptance: "open",
			text,
			resolve: resolveDelivery,
			reject: rejectDelivery,
			settled: false
		};
		pendingMessages.add(item);
		return {
			item,
			delivery
		};
	};
	params.signal.addEventListener("abort", abortQueue, { once: true });
	if (params.signal.aborted) abortQueue();
	return {
		async queue(text, options) {
			try {
				assertActive();
			} catch (error) {
				options?.onQueueAccepted?.(false);
				throw error;
			}
			const { item, delivery } = createPendingMessage(text, options);
			batchedMessages.push(item);
			clearBatchTimer();
			const debounceMs = normalizeCodexSteerDebounceMs(options?.debounceMs);
			if (debounceMs === 0) flushBatch();
			else batchTimer = setTimeout(() => {
				batchTimer = void 0;
				flushBatch();
			}, debounceMs);
			return await delivery;
		},
		confirmConsumed(clientUserMessageId) {
			const batch = dispatchedBatches.get(clientUserMessageId);
			if (!batch) return false;
			dispatchedBatches.delete(clientUserMessageId);
			for (const item of batch.items) reportItemAcceptance(item, true);
			const resolveBatch = () => {
				for (const item of batch.items) resolveItem(item);
				return true;
			};
			const rejectBatch = (error) => {
				for (const item of batch.items) rejectItem(item, error);
				return true;
			};
			if (!params.beforeConfirmConsumed) return resolveBatch();
			try {
				return params.beforeConfirmConsumed(batch.items).then(resolveBatch, rejectBatch);
			} catch (error) {
				return rejectBatch(error);
			}
		},
		sealAdmission: sealQueueAdmission,
		cancel: cancelQueue
	};
}
/** Normalizes steer debounce milliseconds, preserving explicit zero. */
function normalizeCodexSteerDebounceMs(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : CODEX_STEER_ALL_DEBOUNCE_MS;
}
//#endregion
//#region extensions/codex/src/app-server/event-projector-assistant.ts
var CodexAssistantProjection = class {
	constructor(params, emitAgentEvent, matchesToolProgressEcho, nextTranscriptTimestamp, checkpointCommentary) {
		this.params = params;
		this.emitAgentEvent = emitAgentEvent;
		this.matchesToolProgressEcho = matchesToolProgressEcho;
		this.nextTranscriptTimestamp = nextTranscriptTimestamp;
		this.checkpointCommentary = checkpointCommentary;
		this.assistantTextByItem = /* @__PURE__ */ new Map();
		this.assistantItemOrder = [];
		this.assistantTimestampByItem = /* @__PURE__ */ new Map();
		this.assistantPhaseByItem = /* @__PURE__ */ new Map();
		this.assistantDeliveryByItem = /* @__PURE__ */ new Map();
		this.latestTerminalAssistantCandidateSuperseded = false;
		this.terminalAssistantCandidateEarlierActiveItemIds = /* @__PURE__ */ new Set();
		this.lastCommentaryProgressEventByItem = /* @__PURE__ */ new Map();
		this.lastAnswerCandidateEventByItem = /* @__PURE__ */ new Map();
		this.pendingRawCommentaryEchoes = 0;
		this.rawPromotedAssistantItemIds = /* @__PURE__ */ new Set();
		this.assistantStarted = false;
		this.streamedPartialAssistantItemReplaceable = false;
		this.persistableAssistantBarrier = 0;
		this.persistedAssistantBoundary = false;
		this.persistableAssistantBarrierItemIds = /* @__PURE__ */ new Set();
		this.completedAssistantItemIds = /* @__PURE__ */ new Set();
	}
	handleNotification(method, params) {
		if (method === "model/rerouted") this.responseModel = readStringField(params, "toModel") ?? this.responseModel;
	}
	async handleAssistantDelta(params) {
		const itemId = readStringField(params, "itemId") ?? "assistant";
		const delta = readStringField(params, "delta") ?? "";
		if (!delta) return;
		if (itemId !== this.pendingRawTerminalAssistantEchoItemId) this.pendingRawTerminalAssistantEchoItemId = void 0;
		const isCommentary = this.isCommentaryAssistantItem(itemId);
		const isAsync = this.isAsyncAssistantItem(itemId);
		if (!isCommentary && !isAsync && itemId !== this.latestTerminalAssistantCandidateItemId) this.markTerminalAssistantCandidateSupersededBy();
		if (!this.assistantStarted) {
			this.assistantStarted = true;
			await this.params.onAssistantMessageStart?.();
		}
		this.rememberAssistantItem(itemId);
		const text = `${this.assistantTextByItem.get(itemId) ?? ""}${delta}`;
		this.assistantTextByItem.set(itemId, text);
		if (isAsync) return;
		if (isCommentary) {
			this.emitCommentaryProgress({
				itemId,
				text,
				phase: "update"
			});
			return;
		}
		const knownFinalAnswer = this.isFinalAnswerAssistantItem(itemId);
		if (knownFinalAnswer) this.emitAnswerCandidate(itemId, "candidate");
		const replace = this.streamedPartialAssistantItemId !== void 0 && this.streamedPartialAssistantItemId !== itemId;
		if (replace && (!knownFinalAnswer || this.streamedPartialAssistantItemReplaceable)) this.streamedPartialAssistantItemReplaceable = true;
		else if (this.streamedPartialAssistantItemId === void 0) this.streamedPartialAssistantItemReplaceable = !knownFinalAnswer;
		this.streamedPartialAssistantItemId = itemId;
		const replaceable = this.streamedPartialAssistantItemReplaceable;
		const replacement = replace && replaceable;
		const streamPayload = {
			text,
			delta: replacement ? "" : delta,
			...replacement ? { replace: true } : {}
		};
		this.emitAgentEvent({
			stream: "assistant",
			data: {
				...streamPayload,
				...replaceable ? { replaceable: true } : {}
			}
		});
		if (knownFinalAnswer && !replaceable) await this.params.onPartialReply?.(streamPayload);
	}
	recordItemStarted(item, itemId) {
		this.noteNativeWorkBarrier(item);
		this.rememberAssistantPhase(item);
		if (item?.type === "agentMessage" && itemId && !this.isNonTerminalAssistantItem(itemId) && itemId !== this.pendingRawTerminalAssistantEchoItemId) this.pendingRawTerminalAssistantEchoItemId = void 0;
		if (item?.type === "agentMessage" && itemId) this.rememberAssistantItem(itemId);
		if (itemId && !this.isNonTerminalAssistantItem(itemId) && itemId !== this.latestTerminalAssistantCandidateItemId) {
			this.markTerminalAssistantCandidateSupersededBy(itemId, { preserveEarlierActiveItem: true });
			if (this.latestTerminalAssistantCandidateSuperseded) this.pendingRawTerminalAssistantEchoItemId = void 0;
		}
	}
	recordItemCompleted(item, itemId, activeItemIds) {
		if (itemId && item?.type === "agentMessage") this.completedAssistantItemIds.add(itemId);
		this.noteNativeWorkBarrier(item);
		this.rememberAssistantPhase(item);
		if (item?.type === "agentMessage" && itemId && !this.isNonTerminalAssistantItem(itemId) && itemId !== this.pendingRawTerminalAssistantEchoItemId) this.pendingRawTerminalAssistantEchoItemId = void 0;
		if (item?.type === "agentMessage" && !this.isNonTerminalAssistantItem(item.id)) {
			this.markLatestTerminalAssistantCandidate(item.id, activeItemIds);
			this.pendingRawTerminalAssistantEchoItemId = item.id;
		} else if (itemId && !this.isNonTerminalAssistantItem(itemId)) {
			this.markTerminalAssistantCandidateSupersededBy(itemId, { preserveEarlierActiveItem: true });
			if (this.latestTerminalAssistantCandidateSuperseded) this.pendingRawTerminalAssistantEchoItemId = void 0;
		}
		if (item?.type === "agentMessage" && typeof item.text === "string") {
			this.rememberAssistantItem(item.id);
			this.assistantTextByItem.set(item.id, item.text);
			if (item.text && this.isCommentaryAssistantItem(item.id)) {
				this.emitCommentaryProgress({
					itemId: item.id,
					text: item.text,
					phase: "end"
				});
				this.pendingRawCommentaryEchoes += 1;
			} else if (item.text && !this.isAsyncAssistantItem(item.id) && this.isFinalAnswerAssistantItem(item.id)) this.emitAnswerCandidate(item.id, "candidate");
			return this.createAsyncDelivery(item.id);
		}
	}
	recordSnapshotItem(item) {
		if (item.type === "agentMessage") this.completedAssistantItemIds.add(item.id);
		this.rememberAssistantPhase(item);
		if (item.type === "agentMessage" && typeof item.text === "string") {
			this.rememberAssistantItem(item.id);
			this.assistantTextByItem.set(item.id, item.text);
			return this.createAsyncDelivery(item.id);
		}
	}
	handleRawResponseItemCompleted(item, activeItemIds) {
		const role = readStringField(item, "role");
		const phase = readStringField(item, "phase");
		const rawItemId = readStringField(item, "id");
		const candidateWasSupersededBeforeRaw = this.latestTerminalAssistantCandidateSuperseded;
		const pendingTerminalAssistantEchoItemId = this.pendingRawTerminalAssistantEchoItemId;
		const isPendingTerminalAssistantEcho = role === "assistant" && phase !== "commentary" && pendingTerminalAssistantEchoItemId !== void 0 && (rawItemId === void 0 || rawItemId === pendingTerminalAssistantEchoItemId);
		if (pendingTerminalAssistantEchoItemId !== void 0 && !isPendingTerminalAssistantEcho) this.pendingRawTerminalAssistantEchoItemId = void 0;
		if (!isPendingTerminalAssistantEcho) this.markTerminalAssistantCandidateSupersededBy(rawItemId);
		if (role !== "assistant") return;
		if (phase === "commentary" && this.pendingRawCommentaryEchoes > 0) {
			this.pendingRawCommentaryEchoes -= 1;
			return;
		}
		const text = extractRawAssistantText(item);
		if (isPendingTerminalAssistantEcho) {
			const typedItemId = pendingTerminalAssistantEchoItemId;
			this.pendingRawTerminalAssistantEchoItemId = void 0;
			if (this.assistantTextByItem.get(typedItemId)?.trim() || !text) return;
			this.rememberAssistantItem(typedItemId);
			this.assistantTextByItem.set(typedItemId, text);
			return;
		}
		if (text === void 0 || !text && (phase === "commentary" || activeItemIds.size > 0 || readStringField(item, "type") !== "message")) return;
		const itemId = rawItemId ?? `raw-assistant-${this.assistantItemOrder.length + 1}`;
		const isIdlessTerminalAssistantAfterCompletedWork = candidateWasSupersededBeforeRaw && rawItemId === void 0 && pendingTerminalAssistantEchoItemId === void 0 && activeItemIds.size === 0;
		if (text && phase !== "commentary" && candidateWasSupersededBeforeRaw && itemId !== this.streamedPartialAssistantItemId && !isIdlessTerminalAssistantAfterCompletedWork) return;
		if (phase) this.assistantPhaseByItem.set(itemId, phase);
		this.completedAssistantItemIds.add(itemId);
		this.rememberAssistantItem(itemId);
		this.assistantTextByItem.set(itemId, text);
		if (!text) return;
		this.rawPromotedAssistantItemIds.add(itemId);
		if (phase === "commentary") this.emitCommentaryProgress({
			itemId,
			text,
			phase: "end"
		});
		else this.markLatestTerminalAssistantCandidate(itemId, activeItemIds);
	}
	collectAssistantTexts() {
		const afterHandoff = this.collectPersistableAssistantTexts(this.persistableAssistantBarrier);
		const audibleAfterHandoff = afterHandoff.filter((text) => !isSilentReplyPayloadText(text));
		if (audibleAfterHandoff.length > 0) return audibleAfterHandoff;
		if (afterHandoff.length > 0) return afterHandoff.slice(-1);
		if (this.persistedAssistantBoundary) return [];
		const recoveredAudible = this.collectPersistableAssistantTexts(0).filter((text) => !isSilentReplyPayloadText(text));
		if (recoveredAudible.length > 0) return recoveredAudible.slice(-1);
		const recovered = this.resolveFinalAssistantTextItem()?.text;
		return recovered ? [recovered] : [];
	}
	collectCommentaryMessages() {
		return this.assistantItemOrder.flatMap((itemId) => {
			const message = this.readCommentaryMessage(itemId);
			return message ? [{
				itemId,
				message
			}] : [];
		});
	}
	readCommentaryMessage(itemId) {
		const text = this.assistantTextByItem.get(itemId)?.trim();
		const timestamp = this.assistantTimestampByItem.get(itemId);
		return this.isCommentaryAssistantItem(itemId) && text && timestamp !== void 0 ? createAssistantCommentaryMessage(this.params, text, itemId, timestamp) : void 0;
	}
	collectAsyncMessages() {
		return this.assistantItemOrder.flatMap((itemId) => {
			if (!this.isAsyncAssistantItem(itemId)) return [];
			const text = this.assistantTextByItem.get(itemId)?.trim();
			const timestamp = this.assistantTimestampByItem.get(itemId);
			if (!text || timestamp === void 0) return [];
			return [{
				itemId,
				message: createAssistantAsyncMessage(this.params, text, itemId, timestamp)
			}];
		});
	}
	collectCompletedAssistantMessages(completedItemIds, options) {
		return this.assistantItemOrder.flatMap((itemId) => {
			const text = this.assistantTextByItem.get(itemId)?.trim();
			if (!completedItemIds.has(itemId) || this.isNonTerminalAssistantItem(itemId) || !text || isSilentReplyPayloadText(text) || this.isToolProgressEchoText(itemId, text)) return [];
			const message = this.createAssistantMessage(text, options);
			const timestamp = this.assistantTimestampByItem.get(itemId) ?? message.timestamp;
			return [{
				itemId,
				message: {
					...message,
					timestamp
				}
			}];
		});
	}
	markAssistantBoundaryPersisted(itemId) {
		const index = this.assistantItemOrder.indexOf(itemId);
		if (index >= 0) {
			this.persistableAssistantBarrier = Math.max(this.persistableAssistantBarrier, index + 1);
			this.persistedAssistantBoundary = true;
		}
	}
	finalizeAnswerCandidate(turn) {
		if (turn.status !== "completed") {
			this.supersedeVisibleAnswerCandidate();
			return;
		}
		const turnItems = turn.items ?? [];
		const authoritativeIndex = turnItems.findLastIndex((item) => {
			if (item.type !== "agentMessage" || typeof item.text !== "string" || item.text.trim().length === 0) return false;
			const phase = readItemString(item, "phase");
			return readItemString(item, "delivery") !== "async" && (phase === "final_answer" || phase === void 0);
		});
		const authoritative = authoritativeIndex >= 0 ? turnItems[authoritativeIndex] : void 0;
		if (turnItems.slice(authoritativeIndex + 1).some(shouldClearTerminalPresentationForNativeItem) || authoritative?.id === this.latestTerminalAssistantCandidateItemId && this.latestTerminalAssistantCandidateSuperseded) {
			this.supersedeVisibleAnswerCandidate();
			return;
		}
		const itemId = authoritative?.id ?? this.visibleAnswerCandidateItemId;
		if (!itemId) return;
		if (itemId !== this.visibleAnswerCandidateItemId) {
			this.supersedeVisibleAnswerCandidate();
			this.visibleAnswerCandidateItemId = itemId;
		}
		this.emitAnswerCandidate(itemId, "selected");
	}
	hasAssistantItemTextForSynthesis() {
		for (let i = this.assistantItemOrder.length - 1; i >= 0; i -= 1) {
			const itemId = this.assistantItemOrder[i];
			if (!itemId || this.isNonTerminalAssistantItem(itemId)) continue;
			const text = this.assistantTextByItem.get(itemId);
			if (text && text.length > 0) return true;
		}
		return false;
	}
	createCurrentAttemptAssistantMessage(options) {
		for (let i = this.assistantItemOrder.length - 1; i >= 0; i -= 1) {
			const itemId = this.assistantItemOrder[i];
			if (!itemId || this.isNonTerminalAssistantItem(itemId) || !this.assistantTextByItem.has(itemId)) continue;
			const text = this.assistantTextByItem.get(itemId) ?? "";
			const normalizedText = text.trim();
			if (normalizedText && this.isToolProgressEchoText(itemId, normalizedText)) continue;
			return this.createAssistantMessage(text, options);
		}
	}
	createAssistantMessage(text, options) {
		const message = createAssistantMessage(this.params, text, options);
		return this.responseModel ? {
			...message,
			responseModel: this.responseModel
		} : message;
	}
	rememberAssistantPhase(item) {
		if (item?.type !== "agentMessage") return;
		const phase = readItemString(item, "phase");
		if (phase) this.assistantPhaseByItem.set(item.id, phase);
		const delivery = readItemString(item, "delivery");
		if (delivery) this.assistantDeliveryByItem.set(item.id, delivery);
	}
	isCommentaryAssistantItem(itemId) {
		return this.assistantPhaseByItem.get(itemId) === "commentary";
	}
	isAsyncAssistantItem(itemId) {
		return this.assistantDeliveryByItem.get(itemId) === "async";
	}
	isNonTerminalAssistantItem(itemId) {
		return this.isCommentaryAssistantItem(itemId) || this.isAsyncAssistantItem(itemId);
	}
	isFinalAnswerAssistantItem(itemId) {
		return this.assistantPhaseByItem.get(itemId) === "final_answer";
	}
	emitCommentaryProgress(params) {
		const progressText = params.text.trim();
		const previous = this.lastCommentaryProgressEventByItem.get(params.itemId);
		if (!progressText || previous?.phase === params.phase && previous.text === progressText) return;
		this.lastCommentaryProgressEventByItem.set(params.itemId, {
			phase: params.phase,
			text: progressText
		});
		this.emitAgentEvent({
			stream: "item",
			data: {
				itemId: params.itemId,
				kind: "preamble",
				title: "Preamble",
				phase: params.phase,
				progressText,
				source: "codex-app-server"
			}
		});
	}
	emitAnswerCandidate(itemId, status) {
		const text = this.assistantTextByItem.get(itemId)?.trim();
		if (!text) return;
		if (status === "candidate" && this.visibleAnswerCandidateItemId !== itemId) {
			this.supersedeVisibleAnswerCandidate();
			this.visibleAnswerCandidateItemId = itemId;
		}
		const previous = this.lastAnswerCandidateEventByItem.get(itemId);
		if (previous?.status === status && previous.text === text) return;
		this.lastAnswerCandidateEventByItem.set(itemId, {
			status,
			text
		});
		this.emitAgentEvent({
			stream: "item",
			data: {
				itemId,
				kind: "answer_candidate",
				title: "Answer candidate",
				phase: "update",
				status,
				progressText: text,
				source: "codex-app-server",
				hideFromChannelProgress: true
			}
		});
	}
	supersedeVisibleAnswerCandidate() {
		const itemId = this.visibleAnswerCandidateItemId;
		if (!itemId) return;
		this.emitAnswerCandidate(itemId, "superseded");
		this.visibleAnswerCandidateItemId = void 0;
	}
	markLatestTerminalAssistantCandidate(itemId, activeItemIds) {
		this.latestTerminalAssistantCandidateItemId = itemId;
		this.latestTerminalAssistantCandidateSuperseded = false;
		this.terminalAssistantCandidateEarlierActiveItemIds = new Set(activeItemIds);
	}
	markTerminalAssistantCandidateSupersededBy(itemId, options) {
		if (!this.latestTerminalAssistantCandidateItemId) return;
		if (itemId && this.terminalAssistantCandidateEarlierActiveItemIds.has(itemId)) {
			if (!options?.preserveEarlierActiveItem) this.terminalAssistantCandidateEarlierActiveItemIds.delete(itemId);
			return;
		}
		this.latestTerminalAssistantCandidateSuperseded = true;
		this.terminalAssistantCandidateEarlierActiveItemIds.clear();
		this.supersedeVisibleAnswerCandidate();
	}
	resolveFinalAssistantTextItem() {
		for (let i = this.assistantItemOrder.length - 1; i >= 0; i -= 1) {
			const itemId = this.assistantItemOrder[i];
			if (!itemId) continue;
			const text = this.assistantTextByItem.get(itemId)?.trim();
			if (this.isNonTerminalAssistantItem(itemId)) continue;
			if (text && !this.isToolProgressEchoText(itemId, text)) return {
				itemId,
				text
			};
		}
	}
	collectPersistableAssistantTexts(minIndex) {
		let texts = [];
		let replaceable = false;
		for (let index = minIndex; index < this.assistantItemOrder.length; index += 1) {
			const itemId = this.assistantItemOrder[index];
			if (!itemId || this.isNonTerminalAssistantItem(itemId)) continue;
			const text = this.assistantTextByItem.get(itemId)?.trim();
			if (!text || this.isToolProgressEchoText(itemId, text)) continue;
			if (isSilentReplyPayloadText(text)) {
				texts.push(text);
				continue;
			}
			const isTerminalFinal = this.assistantPhaseByItem.get(itemId) === "final_answer";
			if (!isTerminalFinal || replaceable) {
				texts = [text];
				replaceable = !isTerminalFinal;
				continue;
			}
			texts.push(text);
		}
		return texts;
	}
	noteNativeWorkBarrier(item) {
		if (!item || !shouldAdvancePersistableAssistantBarrier(item)) return;
		if (item.id && this.persistableAssistantBarrierItemIds.has(item.id)) return;
		if (item.id) this.persistableAssistantBarrierItemIds.add(item.id);
		this.persistableAssistantBarrier = this.assistantItemOrder.length;
	}
	rememberAssistantItem(itemId) {
		if (!itemId) return;
		if (!this.assistantTimestampByItem.has(itemId)) {
			this.assistantItemOrder.push(itemId);
			this.assistantTimestampByItem.set(itemId, this.nextTranscriptTimestamp());
		}
		if (this.isCommentaryAssistantItem(itemId)) this.checkpointCommentary?.(itemId, {
			read: () => this.readCommentaryMessage(itemId),
			ready: () => this.completedAssistantItemIds.has(itemId)
		});
	}
	createAsyncDelivery(itemId) {
		if (!this.isAsyncAssistantItem(itemId)) return;
		const text = this.assistantTextByItem.get(itemId);
		const timestamp = this.assistantTimestampByItem.get(itemId);
		if (!text?.trim() || timestamp === void 0) return;
		return {
			itemId,
			message: createAssistantAsyncMessage(this.params, text, itemId, timestamp),
			text
		};
	}
	isToolProgressEchoText(itemId, text) {
		return this.rawPromotedAssistantItemIds.has(itemId) && this.matchesToolProgressEcho(text);
	}
};
function shouldAdvancePersistableAssistantBarrier(item) {
	return shouldClearTerminalPresentationForNativeItem(item) || item.type === "dynamicToolCall" || item.type === "sleep";
}
//#endregion
//#region extensions/codex/src/app-server/event-projector-async-delivery.ts
/** Owns authorization, exactly-once settlement, and terminal retry for async user messages. */
var CodexAsyncDeliveryProjection = class {
	constructor(params, threadId, turnId, options) {
		this.params = params;
		this.threadId = threadId;
		this.turnId = turnId;
		this.options = options;
		this.settledItemIds = /* @__PURE__ */ new Set();
		this.pendingDeliveries = /* @__PURE__ */ new Map();
	}
	allows(item, reportUnauthorized = false) {
		if (item?.type !== "agentMessage" || item.delivery !== "async") return true;
		const allowed = this.params.disableTools !== true && (this.options.asyncUserMessageAllowed ?? (this.params.toolsAllow === void 0 || this.params.toolsAllow.some((name) => name === "*" || name === "message")));
		if (!allowed && reportUnauthorized) embeddedAgentLog.warn("blocked unauthorized codex async user message", {
			itemId: item.id,
			threadId: this.threadId,
			turnId: this.turnId
		});
		return allowed;
	}
	pending() {
		return [...this.pendingDeliveries.values()];
	}
	async deliver(delivery) {
		if (this.settledItemIds.has(delivery.itemId)) return;
		await this.orderingGate; // v-codex-firsttext-v1
		const settlement = await this.options.onAsyncDelivery?.(delivery);
		if (settlement === "settled") {
			this.settledItemIds.add(delivery.itemId);
			this.pendingDeliveries.delete(delivery.itemId);
		} else if (settlement === "retry") this.pendingDeliveries.set(delivery.itemId, delivery);
	}
};
//#endregion
//#region extensions/codex/src/app-server/event-projector-media.ts
const GENERATED_IMAGE_MEDIA_SUBDIR = "tool-image-generation";
var CodexGeneratedMediaProjection = class {
	constructor(config, remote) {
		this.config = config;
		this.remote = remote;
		this.itemIds = /* @__PURE__ */ new Set();
		this.urlsByItemId = /* @__PURE__ */ new Map();
		this.gatewayMaterializedItemIds = /* @__PURE__ */ new Set();
		this.pendingMaterializationsByItemId = /* @__PURE__ */ new Map();
	}
	hasGeneratedMedia() {
		return this.itemIds.size > 0;
	}
	async recordNative(item) {
		if (item?.type !== "imageGeneration") return;
		this.itemIds.add(item.id);
		const result = readItemString(item, "result");
		if (result) {
			await this.recordImage({
				itemId: item.id,
				result,
				revisedPrompt: readItemString(item, "revisedPrompt"),
				source: "native"
			});
			return;
		}
		const savedPath = readItemString(item, "savedPath")?.trim();
		if (savedPath) {
			if (this.remote?.remoteWorkspaceRoot) {
				if (!this.remote.readFile) {
					embeddedAgentLog.warn("codex remote image has no app-server file transfer", { itemId: item.id });
					return;
				}
				try {
					const response = await this.remote.readFile({
						path: savedPath,
						maxBytes: resolveGeneratedMediaMaxBytes(this.config, "image"),
						signal: this.remote.signal,
						timeoutMs: this.remote.requestTimeoutMs
					});
					if (!response || typeof response.dataBase64 !== "string" || !response.dataBase64) {
						embeddedAgentLog.warn("codex remote image file returned no inline bytes", { itemId: item.id });
						return;
					}
					await this.recordImage({
						itemId: item.id,
						result: response.dataBase64,
						revisedPrompt: readItemString(item, "revisedPrompt"),
						source: "native"
					});
				} catch (error) {
					embeddedAgentLog.warn("codex app-server remote image file read failed", {
						itemId: item.id,
						error
					});
				}
				return;
			}
			this.recordUrl({
				itemId: item.id,
				mediaUrl: savedPath
			});
		}
	}
	async recordRaw(item) {
		if (readStringField(item, "type") !== "image_generation_call") return;
		const result = readStringField(item, "result");
		if (!result) return;
		const itemId = readStringField(item, "id") ?? `raw-image-${this.itemIds.size}`;
		await this.recordImage({
			itemId,
			result,
			revisedPrompt: readStringField(item, "revised_prompt") ?? readStringField(item, "revisedPrompt"),
			source: "raw"
		});
	}
	async recordImage(params) {
		this.itemIds.add(params.itemId);
		if (this.gatewayMaterializedItemIds.has(params.itemId)) return;
		let pending = this.pendingMaterializationsByItemId.get(params.itemId);
		while (pending) {
			await pending;
			if (this.gatewayMaterializedItemIds.has(params.itemId)) return;
			pending = this.pendingMaterializationsByItemId.get(params.itemId);
		}
		const materialization = this.materializeImage(params);
		this.pendingMaterializationsByItemId.set(params.itemId, materialization);
		try {
			await materialization;
		} finally {
			if (this.pendingMaterializationsByItemId.get(params.itemId) === materialization) this.pendingMaterializationsByItemId.delete(params.itemId);
		}
	}
	async materializeImage(params) {
		const maxBytes = resolveGeneratedMediaMaxBytes(this.config, "image");
		const estimatedDecodedBytes = estimateBase64DecodedBytes(params.result);
		if (estimatedDecodedBytes !== void 0 && estimatedDecodedBytes > maxBytes) {
			embeddedAgentLog.warn(`codex app-server ${params.source} image generation result exceeds media limit`, {
				itemId: params.itemId,
				estimatedDecodedBytes,
				maxBytes
			});
			return;
		}
		const asset = generatedImageAssetFromBase64({
			base64: params.result,
			index: this.itemIds.size,
			revisedPrompt: params.revisedPrompt,
			fileNamePrefix: "codex-image-generation",
			sniffMimeType: true
		});
		if (!asset) return;
		try {
			const saved = await saveMediaBuffer(asset.buffer, asset.mimeType, GENERATED_IMAGE_MEDIA_SUBDIR, maxBytes, asset.fileName);
			this.gatewayMaterializedItemIds.add(params.itemId);
			this.recordUrl({
				itemId: params.itemId,
				mediaUrl: saved.path,
				replaceExisting: true
			});
		} catch (error) {
			embeddedAgentLog.warn(`codex app-server ${params.source} image generation result save failed`, {
				itemId: params.itemId,
				error
			});
		}
	}
	buildToolMediaUrls(params) {
		const mediaUrls = new Set(params.toolMediaUrls?.map((url) => url.trim()).filter(Boolean) ?? []);
		if ((params.messagingToolSentMediaUrls?.length ?? 0) === 0) for (const mediaUrl of this.urlsByItemId.values()) mediaUrls.add(mediaUrl);
		return mediaUrls.size > 0 ? [...mediaUrls] : params.toolMediaUrls;
	}
	buildHostOwnedMediaUrls(params) {
		if ((params.messagingToolSentMediaUrls?.length ?? 0) > 0) return;
		const mediaUrls = [...this.urlsByItemId.values()];
		return mediaUrls.length > 0 ? mediaUrls : void 0;
	}
	recordUrl(params) {
		if (this.urlsByItemId.has(params.itemId) && params.replaceExisting !== true) {
			this.itemIds.add(params.itemId);
			return;
		}
		this.urlsByItemId.set(params.itemId, params.mediaUrl);
		this.itemIds.add(params.itemId);
	}
};
function estimateBase64DecodedBytes(base64) {
	let nonWhitespaceLength = 0;
	let previousCode = -1;
	let lastCode = -1;
	for (let i = 0; i < base64.length; i += 1) {
		const code = base64.charCodeAt(i);
		if (isBase64WhitespaceCode(code)) continue;
		nonWhitespaceLength += 1;
		previousCode = lastCode;
		lastCode = code;
	}
	if (nonWhitespaceLength === 0) return;
	const equalsCode = "=".charCodeAt(0);
	const padding = lastCode === equalsCode ? previousCode === equalsCode ? 2 : 1 : 0;
	return Math.max(0, Math.floor(nonWhitespaceLength * 3 / 4) - padding);
}
function isBase64WhitespaceCode(code) {
	return code === 32 || code === 9 || code === 10 || code === 13;
}
//#endregion
//#region extensions/codex/src/app-server/event-projector-reasoning.ts
var CodexReasoningProjection = class {
	constructor(params, emitAgentEvent, onNativePlanUpdate) {
		this.params = params;
		this.emitAgentEvent = emitAgentEvent;
		this.onNativePlanUpdate = onNativePlanUpdate;
		this.reasoningTextByGroup = /* @__PURE__ */ new Map();
		this.reasoningItemOrder = /* @__PURE__ */ new Map();
		this.planTextByItem = /* @__PURE__ */ new Map();
		this.reasoningStarted = false;
		this.reasoningEnded = false;
	}
	async handleReasoningDelta(method, params) {
		const itemId = readStringField(params, "itemId") ?? "reasoning";
		const delta = readStringField(params, "delta") ?? "";
		if (!delta) return;
		this.reasoningStarted = true;
		if (!this.reasoningItemOrder.has(itemId)) this.reasoningItemOrder.set(itemId, this.reasoningItemOrder.size);
		const groupIndex = method === "item/reasoning/textDelta" ? readNonNegativeInteger(params, "contentIndex") ?? 0 : readNonNegativeInteger(params, "summaryIndex") ?? 0;
		const groupKey = `${method}\0${itemId}\0${groupIndex}`;
		const current = this.reasoningTextByGroup.get(groupKey);
		this.reasoningTextByGroup.set(groupKey, {
			itemId,
			method,
			index: groupIndex,
			text: `${current?.text ?? ""}${delta}`
		});
		await this.params.onReasoningStream?.({
			text: this.reasoningText(),
			isReasoningSnapshot: true
		});
	}
	handlePlanDelta(params) {
		const itemId = readStringField(params, "itemId") ?? "plan";
		const delta = readStringField(params, "delta") ?? "";
		if (!delta) return;
		const text = `${this.planTextByItem.get(itemId) ?? ""}${delta}`;
		this.planTextByItem.set(itemId, text);
		this.emitPlanUpdate({
			explanation: void 0,
			steps: splitPlanText(text).map((step) => ({
				step,
				status: "pending"
			}))
		});
	}
	async handleTurnPlanUpdated(params, source = "codex-app-server") {
		const explanation = readNullableString(params, "explanation");
		const plan = Array.isArray(params.plan) ? params.plan.flatMap((entry) => {
			if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
			const record = entry;
			const step = readStringField(record, "step");
			if (!step) return [];
			return [{
				step,
				status: normalizePlanStepStatus(readStringField(record, "status"))
			}];
		}) : void 0;
		const planText = [explanation, ...(plan ?? []).map(({ step, status }) => `- [${status}] ${step}`)].filter((part) => Boolean(part)).join("\n");
		if (planText) this.turnPlanText = planText;
		if (source === "codex-app-server" && plan) await this.onNativePlanUpdate?.({
			...typeof explanation === "string" ? { markdown: explanation } : {},
			steps: plan
		});
		this.emitPlanUpdate({
			explanation,
			steps: plan
		}, source);
	}
	recordItem(item) {
		if (item?.type === "plan" && typeof item.text === "string" && item.text) {
			this.planTextByItem.set(item.id, item.text);
			this.emitPlanUpdate({
				explanation: void 0,
				steps: splitPlanText(item.text).map((step) => ({
					step,
					status: "pending"
				}))
			});
		}
	}
	async maybeEndReasoning() {
		if (!this.reasoningStarted || this.reasoningEnded) return;
		this.reasoningEnded = true;
		await this.params.onReasoningEnd?.();
	}
	reasoningText() {
		return collectReasoningTextValues(this.reasoningTextByGroup, this.reasoningItemOrder).join("\n\n");
	}
	planText() {
		return this.turnPlanText ?? [...this.planTextByItem.values()].filter((text) => text.trim().length > 0).join("\n\n");
	}
	emitPlanUpdate(params, source = "codex-app-server") {
		if (!params.explanation && params.steps === void 0) return;
		this.emitAgentEvent({
			stream: "plan",
			data: {
				phase: "update",
				title: "Plan updated",
				source,
				...params.explanation ? { explanation: params.explanation } : {},
				...params.steps ? { steps: params.steps } : {}
			}
		});
	}
};
function normalizePlanStepStatus(status) {
	if (status === "inProgress" || status === "in_progress") return "in_progress";
	return status === "completed" ? "completed" : "pending";
}
function collectReasoningTextValues(groups, itemOrder) {
	return [...groups.values()].toSorted((left, right) => {
		const itemDelta = (itemOrder.get(left.itemId) ?? Number.MAX_SAFE_INTEGER) - (itemOrder.get(right.itemId) ?? Number.MAX_SAFE_INTEGER);
		if (itemDelta !== 0) return itemDelta;
		const methodDelta = reasoningMethodOrder(left.method) - reasoningMethodOrder(right.method);
		return methodDelta !== 0 ? methodDelta : left.index - right.index;
	}).map((group) => group.text).filter((text) => text.trim().length > 0);
}
function reasoningMethodOrder(method) {
	return method === "item/reasoning/summaryTextDelta" ? 0 : 1;
}
//#endregion
//#region extensions/codex/src/app-server/attempt-terminal.ts
const attemptTerminal = agentHarnessAttemptTerminal;
//#endregion
//#region extensions/codex/src/app-server/event-projector-snapshot.ts
function buildCodexMessagesSnapshot(params) {
	const messages = promptSnapshot(params.runParams, params.turnId, params.upstreamUserText);
	if (params.reasoningText) messages.push(attachCodexMirrorIdentity(createAssistantReasoningMessage(params.runParams, params.reasoningText), `${params.turnId}:reasoning`));
	const commentaryMessages = params.runParams.config?.ui?.prefs?.chatPersistCommentary === false ? [] : params.commentaryMessages.map(({ itemId, message }) => attachCodexMirrorIdentity(message, `${params.turnId}:commentary:${itemId}`));
	const asyncMessages = params.asyncMessages.map(({ itemId, message }) => attachCodexMirrorIdentity(message, `${params.turnId}:async:${itemId}`));
	const visibleWorkMessages = [
		...commentaryMessages,
		...asyncMessages,
		...(params.assistantMessages ?? []).map(({ itemId, message }) => attachCodexMirrorIdentity(message, `${params.turnId}:assistant:${itemId}`)),
		...params.toolMessages
	].toSorted((left, right) => (asDateTimestampMs(left.timestamp) ?? 0) - (asDateTimestampMs(right.timestamp) ?? 0));
	messages.push(...visibleWorkMessages);
	if (params.lastAssistant) messages.push(attachCodexMirrorIdentity(params.lastAssistant, `${params.turnId}:assistant`));
	const taint = { tainted: false };
	return messages.map((message) => projectAgentHarnessTranscriptMessageForDisplay({
		hidden: params.runParams.trigger === "memory",
		message: applyCodexTranscriptTaint(message, taint)
	}));
}
function buildCodexSteeringMessagesSnapshot(params) {
	const asyncMessages = params.assistantProjection.collectAsyncMessages().filter(({ itemId }) => params.completedItemIds.has(itemId));
	const commentaryMessages = params.assistantProjection.collectCommentaryMessages().filter(({ itemId }) => params.completedItemIds.has(itemId));
	const assistantMessages = params.assistantProjection.collectCompletedAssistantMessages(params.completedItemIds, {
		tokenUsage: void 0,
		aborted: false,
		promptError: void 0
	});
	return {
		messages: buildCodexMessagesSnapshot({
			runParams: params.runParams,
			turnId: params.turnId,
			upstreamUserText: params.upstreamUserText,
			reasoningText: void 0,
			asyncMessages,
			commentaryMessages,
			assistantMessages,
			toolMessages: params.toolMessages,
			lastAssistant: void 0
		}).filter((message) => message.role !== "user"),
		assistantBoundaryItemId: assistantMessages.at(-1)?.itemId
	};
}
//#endregion
//#region extensions/codex/src/app-server/event-projector-result.ts
function buildCodexAttemptResult(input) {
	input.nativeToolLifecycleProjection.finalizeActive();
	const assistantTexts = input.assistantProjection.collectAssistantTexts();
	const asyncMessages = input.assistantProjection.collectAsyncMessages();
	const commentaryMessages = input.assistantProjection.collectCommentaryMessages();
	const reasoningText = input.reasoningProjection.reasoningText();
	const planText = input.reasoningProjection.planText();
	const unavailableThreadUsage = input.tokenUsage ? {
		...input.tokenUsage,
		contextUsage: { state: "unavailable" }
	} : void 0;
	const completedUsage = input.responseCompletions.usage ?? (input.responseCompletions.modelIterations > 0 ? unavailableThreadUsage : input.tokenUsage);
	const projectedUsage = input.aborted ? unavailableThreadUsage : completedUsage;
	const hasAssistantItemText = input.assistantProjection.hasAssistantItemTextForSynthesis();
	const legacyFailClosed = !input.completedTurn || input.completedTurn.status !== "completed" || hasAssistantItemText;
	const hasDeliverableAssistantOnCompletedTurn = input.completedTurn?.status === "completed" && assistantTexts.some((text) => text.trim().length > 0);
	const synthesizedMissingToolResultError = input.toolTranscriptProjection.synthesizeMissingToolResults({
		synthesize: legacyFailClosed,
		terminalDisposition: input.aborted ? "tool_error" : hasDeliverableAssistantOnCompletedTurn ? "diagnostic_only" : "prompt_error"
	});
	const storedMissingToolResultError = synthesizedMissingToolResultError ?? input.synthesizedMissingToolResultError;
	let promptErrorSource = input.promptErrorSource;
	if (synthesizedMissingToolResultError) {
		input.recordSynthesizedMissingToolResultError(synthesizedMissingToolResultError);
		promptErrorSource = promptErrorSource ?? "prompt";
	}
	const assistantMessageOptions = {
		tokenUsage: projectedUsage,
		aborted: input.aborted,
		promptError: input.promptError
	};
	const lastAssistant = assistantTexts.length ? input.assistantProjection.createAssistantMessage(assistantTexts.join("\n\n"), assistantMessageOptions) : void 0;
	const currentAttemptAssistant = input.assistantProjection.createCurrentAttemptAssistantMessage(assistantMessageOptions);
	const messagesSnapshot = buildCodexMessagesSnapshot({
		runParams: input.runParams,
		turnId: input.turnId,
		upstreamUserText: input.upstreamUserText,
		reasoningText,
		asyncMessages,
		commentaryMessages,
		toolMessages: input.toolTranscriptProjection.transcriptMessages,
		lastAssistant
	});
	const turnFailed = input.completedTurn?.status === "failed";
	const promptError = input.promptError ?? storedMissingToolResultError ?? (turnFailed ? input.completedTurn?.error?.message ?? "codex app-server turn failed" : null);
	const agentHarnessResultClassification = classifyAgentHarnessTerminalOutcome({
		assistantTexts,
		reasoningText,
		planText,
		promptError,
		turnCompleted: Boolean(input.completedTurn)
	});
	const toolMetas = input.toolProgressProjection.toolMetas;
	const hadPotentialSideEffects = input.toolTelemetry.didSendViaMessagingTool || Boolean(input.toolTelemetry.successfulCronAdds || input.toolTelemetry.acceptedSessionSpawns?.length) || input.generatedMediaProjection.hasGeneratedMedia() || input.toolProgressProjection.hasPotentialSideEffects;
	const sentMediaUrls = new Set(input.toolTelemetry.messagingToolSentMediaUrls.map((url) => url.trim()));
	const toolAutoDeliveryMediaUrls = input.toolTelemetry.toolAutoDeliveryMediaUrls?.filter((url) => !sentMediaUrls.has(url.trim()));
	const result = {
		terminal: attemptTerminal.normalize({
			aborted: input.aborted,
			promptError,
			promptErrorSource: promptError ? promptErrorSource || "prompt" : null
		}),
		sessionIdUsed: input.runParams.sessionId,
		terminalTurnId: input.turnId,
		...agentHarnessResultClassification ? { agentHarnessResultClassification } : {},
		bootstrapPromptWarningSignaturesSeen: input.runParams.bootstrapPromptWarningSignaturesSeen,
		bootstrapPromptWarningSignature: input.runParams.bootstrapPromptWarningSignature,
		...input.responseCompletions.modelIterations > 0 ? { modelIterations: input.responseCompletions.modelIterations } : {},
		messagesSnapshot,
		assistantTexts,
		toolMetas,
		lastAssistant,
		currentAttemptAssistant,
		...input.toolProgressProjection.lastToolError ? { lastToolError: input.toolProgressProjection.lastToolError } : {},
		didSendViaMessagingTool: input.toolTelemetry.didSendViaMessagingTool,
		didDeliverSourceReplyViaMessageTool: input.toolTelemetry.didDeliverSourceReplyViaMessageTool === true,
		messagingToolSentTexts: input.toolTelemetry.messagingToolSentTexts,
		messagingToolSentMediaUrls: input.toolTelemetry.messagingToolSentMediaUrls,
		messagingToolSentTargets: input.toolTelemetry.messagingToolSentTargets,
		messagingToolSourceReplyPayloads: input.toolTelemetry.messagingToolSourceReplyPayloads ?? [],
		heartbeatToolResponse: input.toolTelemetry.heartbeatToolResponse,
		toolMediaUrls: input.generatedMediaProjection.buildToolMediaUrls(input.toolTelemetry),
		hostOwnedToolMediaUrls: input.generatedMediaProjection.buildHostOwnedMediaUrls(input.toolTelemetry),
		toolAudioAsVoice: input.toolTelemetry.toolAudioAsVoice,
		successfulCronAdds: input.toolTelemetry.successfulCronAdds,
		acceptedSessionSpawns: input.toolTelemetry.acceptedSessionSpawns,
		cloudCodeAssistFormatError: false,
		contextTokens: input.contextTokens,
		contextTokensSource: input.contextTokensSource,
		attemptUsage: projectedUsage,
		...input.completedCompactionCount > 0 ? { compactionCount: input.completedCompactionCount } : {},
		replayMetadata: {
			hadPotentialSideEffects,
			replaySafe: !hadPotentialSideEffects
		},
		itemLifecycle: {
			startedCount: input.activeItemCount + input.completedItemCount,
			completedCount: input.completedItemCount,
			activeCount: input.activeItemCount
		},
		yieldDetected: input.yieldDetected || false,
		didSendDeterministicApprovalPrompt: input.guardianReviewCount > 0 ? false : void 0
	};
	const transferTtsProvenance = resolveCodexTtsProvenanceTransfer(input.runParams.hostCapabilities);
	for (const toolResult of input.toolTelemetry.coreTtsToolResults ?? []) transferTtsProvenance?.(toolResult, result, toolAutoDeliveryMediaUrls ?? []);
	return result;
}
//#endregion
//#region extensions/codex/src/app-server/transcript-checkpoint.ts
/** Commits completed work in receipt order without waiting for the enclosing turn. */
// v-codex-firsttext-v1: a thread binding's auth profile belongs to its provider family.
function codexBindingSharesProviderFamily(binding, provider) {
	const bindingDeepSeek = String(binding?.modelProvider ?? "").trim().toLowerCase() === "deepseek" || /deepseek/iu.test(String(binding?.model ?? ""));
	return bindingDeepSeek === (String(provider ?? "").trim().toLowerCase() === "deepseek");
}
var CodexTranscriptCheckpoint = class {
	constructor(params, threadId, turnId) {
		this.params = params;
		this.threadId = threadId;
		this.turnId = turnId;
		this.pending = [];
		this.commentaryItemIds = /* @__PURE__ */ new Set();
		this.lastTimestamp = 0;
		this.writing = Promise.resolve();
		this.tainted = false;
		this.closed = false;
		// v-codex-firsttext-v1: transcript writes wait for the user prompt's write; streaming does not.
		this.orderingGatePending = false;
		this.orderAfter = (gate) => {
			this.orderingGatePending = true;
			const settled = Promise.resolve(gate).then(() => void 0, () => void 0).then(() => {
				this.orderingGatePending = false;
			});
			this.writing = this.writing.then(() => settled);
		};
		this.flushInOrder = () => {
			const writing = this.flush();
			return this.orderingGatePending ? void 0 : writing;
		};
		this.nextTimestamp = () => {
			this.lastTimestamp = Math.max(Date.now(), this.lastTimestamp + 1);
			return this.lastTimestamp;
		};
		this.enqueueCommentary = (itemId, entry) => {
			if (this.params.config?.ui?.prefs?.chatPersistCommentary === false || this.commentaryItemIds.has(itemId)) return;
			this.commentaryItemIds.add(itemId);
			this.enqueue({
				...entry,
				read: () => {
					const message = entry.read();
					return message ? attachCodexMirrorIdentity(message, `${this.turnId}:commentary:${itemId}`) : void 0;
				}
			});
		};
		this.enqueue = (entry) => {
			if (this.params.sessionTarget && !this.closed) this.pending.push(entry);
		};
	}
	flush(close = false) {
		if (this.closed) return this.writing;
		this.closed = close;
		this.writing = this.writing.then(async () => {
			const blocked = close ? -1 : this.pending.findIndex((entry) => entry.ready?.() === false);
			const count = blocked < 0 ? this.pending.length : blocked;
			if (count === 0) return;
			const taint = { tainted: this.tainted };
			const messages = this.pending.slice(0, count).flatMap((entry) => {
				const message = entry.read();
				return message ? [projectAgentHarnessTranscriptMessageForDisplay({
					hidden: this.params.trigger === "memory",
					message: applyCodexTranscriptTaint(message, taint)
				})] : [];
			});
			try {
				await codexTranscriptMirrorRuntime.mirror({
					...this.params.sessionTarget,
					sessionId: this.params.sessionId,
					cwd: this.params.workspaceDir,
					messages,
					idempotencyScope: `codex-app-server:${this.threadId}`,
					runId: this.params.runId,
					runMirrorIdentityPrefix: `${this.turnId}:`,
					config: this.params.config
				});
				this.pending.splice(0, count);
				this.tainted = taint.tainted;
			} catch (error) {
				embeddedAgentLog.warn("failed to checkpoint codex app-server transcript", {
					runId: this.params.runId,
					sessionId: this.params.sessionId,
					error: formatErrorMessage(error)
				});
			}
		});
		return this.writing;
	}
};
//#endregion
//#region extensions/codex/src/app-server/usage-limit-error.ts
/**
* Enriches Codex usage-limit failures with current rate-limit information and
* marks blocked auth profiles when Codex exposes a reset time.
*/
const CODEX_USAGE_LIMIT_RATE_LIMIT_REFRESH_TIMEOUT_MS = 5e3;
function createCodexUsageLimitPromptError(message) {
	return Object.assign(new Error(message), { status: 429 });
}
function resolveCodexPromptError(source) {
	const usageLimitMessage = formatCodexUsageLimitErrorMessage(source);
	return usageLimitMessage ? createCodexUsageLimitPromptError(usageLimitMessage) : source.message ?? void 0;
}
function isCodexUsageLimitPromptError(error) {
	return error instanceof Error && "status" in error && error.status === 429;
}
/** Marks a Codex auth profile blocked until the reset time advertised by rate limits. */
async function markCodexAuthProfileBlockedFromRateLimits(params) {
	const authProfileId = params.authProfileId?.trim();
	if (!authProfileId || !params.params.authProfileStore) return;
	const blockedUntil = resolveCodexUsageLimitResetAtMs(params.rateLimits);
	if (!blockedUntil) return;
	try {
		await markAuthProfileBlockedUntil({
			store: params.params.authProfileStore,
			profileId: authProfileId,
			blockedUntil,
			source: "codex_rate_limits",
			agentDir: params.params.agentDir,
			runId: params.params.runId,
			modelId: params.params.modelId
		});
	} catch (error) {
		embeddedAgentLog.debug("failed to mark Codex auth profile blocked from app-server limits", {
			authProfileId,
			error: formatErrorMessage(error)
		});
	}
}
/** Formats a turn-start usage-limit error, refreshing rate limits when needed. */
async function formatCodexTurnStartUsageLimitError(params) {
	return refreshCodexUsageLimitError({
		client: params.client,
		source: readCodexTurnStartUsageLimitErrorSource(params.client, params.error, params.errorNotification, params.rateLimitsRevisionBeforeTurnStart),
		timeoutMs: params.timeoutMs,
		signal: params.signal
	});
}
/** Refreshes a generic prompt usage-limit message into a reset-aware message. */
async function refreshCodexUsageLimitPromptError(params) {
	if (!shouldRefreshCodexRateLimitsForUsageLimitMessage(params.message)) return;
	return refreshCodexUsageLimitError({
		client: params.client,
		source: {
			message: params.message,
			codexErrorInfo: "usageLimitExceeded",
			rateLimits: readRecentCodexRateLimits(params.client)
		},
		timeoutMs: params.timeoutMs,
		signal: params.signal
	});
}
async function refreshCodexUsageLimitError(params) {
	const initialMessage = formatCodexUsageLimitErrorMessage(params.source);
	if (!shouldRefreshCodexRateLimitsForUsageLimitMessage(initialMessage)) return initialMessage ? {
		message: initialMessage,
		...params.source.rateLimitsTrustedForProfile ? { rateLimitsForProfile: params.source.rateLimits } : {}
	} : void 0;
	const rateLimits = await readCodexRateLimitsFromAppServerForUsageLimitError({
		client: params.client,
		timeoutMs: params.timeoutMs,
		signal: params.signal
	});
	if (!rateLimits) return initialMessage ? {
		message: initialMessage,
		...params.source.rateLimitsTrustedForProfile ? { rateLimitsForProfile: params.source.rateLimits } : {}
	} : void 0;
	const message = formatCodexUsageLimitErrorMessage({
		message: params.source.message,
		codexErrorInfo: params.source.codexErrorInfo,
		rateLimits,
		rateLimitsAuthoritative: true
	}) ?? initialMessage;
	return message ? {
		message,
		rateLimitsForProfile: rateLimits
	} : void 0;
}
async function readCodexRateLimitsFromAppServerForUsageLimitError(params) {
	if (params.signal?.aborted) return;
	try {
		const rateLimits = await params.client.request(CODEX_CONTROL_METHODS.rateLimits, void 0, {
			timeoutMs: resolveCodexUsageLimitRateLimitRefreshTimeoutMs(params.timeoutMs),
			signal: params.signal
		});
		rememberCodexRateLimitsRead(params.client, rateLimits);
		return rateLimits;
	} catch (error) {
		embeddedAgentLog.debug("codex app-server rate-limit refresh failed after usage-limit error", { error: formatErrorMessage(error) });
		return;
	}
}
function resolveCodexUsageLimitRateLimitRefreshTimeoutMs(timeoutMs) {
	if (timeoutMs === void 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return CODEX_USAGE_LIMIT_RATE_LIMIT_REFRESH_TIMEOUT_MS;
	return Math.max(100, Math.min(timeoutMs, CODEX_USAGE_LIMIT_RATE_LIMIT_REFRESH_TIMEOUT_MS));
}
function readCodexTurnStartUsageLimitErrorSource(client, error, errorNotification, rateLimitsRevisionBeforeTurnStart) {
	const notificationError = readCodexErrorNotification(errorNotification);
	const errorPayload = readCodexErrorPayload(error);
	const rateLimits = errorPayload.rateLimits ?? readRecentCodexRateLimits(client);
	const cacheUpdatedDuringTurnStart = rateLimitsRevisionBeforeTurnStart !== void 0 && readCodexRateLimitsRevision(client) > rateLimitsRevisionBeforeTurnStart;
	return {
		message: notificationError?.message ?? errorPayload.message ?? formatErrorMessage(error),
		codexErrorInfo: notificationError?.codexErrorInfo ?? errorPayload.codexErrorInfo,
		rateLimits,
		rateLimitsTrustedForProfile: errorPayload.rateLimits !== void 0 || cacheUpdatedDuringTurnStart
	};
}
function readCodexErrorNotification(notification) {
	if (notification?.method !== "error" || !isJsonObject(notification.params)) return;
	const error = notification.params.error;
	return isJsonObject(error) ? {
		message: readStringField(error, "message"),
		codexErrorInfo: error.codexErrorInfo
	} : void 0;
}
function readCodexErrorPayload(error) {
	const message = error instanceof Error ? error.message : void 0;
	if (!error || typeof error !== "object" || !("data" in error)) return { message };
	const data = error.data;
	if (!isJsonObject(data)) return { message };
	const nestedError = isJsonObject(data.error) ? data.error : data;
	const rateLimits = nestedError.rateLimits ?? data.rateLimits;
	return {
		message: readStringField(nestedError, "message") ?? message,
		codexErrorInfo: nestedError.codexErrorInfo,
		rateLimits
	};
}
//#endregion
//#region extensions/codex/src/app-server/event-projector.ts
var CodexAppServerEventProjector = class {
	constructor(params, threadId, turnId, options = {}) {
		this.params = params;
		this.threadId = threadId;
		this.turnId = turnId;
		this.options = options;
		this.activeItemIds = /* @__PURE__ */ new Set();
		this.completedItemIds = /* @__PURE__ */ new Set();
		this.activeCompactionItemIds = /* @__PURE__ */ new Set();
		this.terminalPresentationClearedItemIds = /* @__PURE__ */ new Set();
		this.nativeToolOutcomeOrdinals = /* @__PURE__ */ new Map();
		this.projectionClosed = false;
		this.settledTurnFailureFinalizationAllowed = false;
		this.promptErrorSource = null;
		this.synthesizedMissingToolResultError = null;
		this.aborted = false;
		this.responseCompletions = new CodexResponseCompletionProjection();
		this.completedCompactionCount = 0;
		this.transcriptCheckpoint = new CodexTranscriptCheckpoint(params, threadId, turnId);
		this.asyncDeliveryProjection = new CodexAsyncDeliveryProjection(params, threadId, turnId, options);
		this.contextTokens = options.initialContextTokens;
		this.contextTokensSource = options.initialContextTokens === void 0 ? void 0 : "resolved";
		this.diagnostics = new CodexProjectionDiagnostics(threadId, turnId);
		this.nativeToolLifecycleProjector = new CodexNativeToolLifecycleProjector(params, threadId, turnId, { runAbortSignal: options.runAbortSignal });
		this.generatedMediaProjection = new CodexGeneratedMediaProjection(params.config, {
			remoteWorkspaceRoot: options.remoteWorkspaceRoot,
			readFile: options.readRemoteWorkspaceFile,
			requestTimeoutMs: options.remoteWorkspaceRequestTimeoutMs,
			signal: options.runAbortSignal
		});
		this.toolProgressProjection = new CodexToolProgressProjection(params);
		this.toolTranscriptProjection = new CodexToolTranscriptProjection(params, threadId, turnId, this.toolProgressProjection, this.transcriptCheckpoint.nextTimestamp, {
			nativePostToolUseRelayEnabled: options.nativePostToolUseRelayEnabled,
			prepareNativeMcpAppResultDetails: options.prepareNativeMcpAppResultDetails,
			trajectoryRecorder: options.trajectoryRecorder,
			checkpointMessage: this.transcriptCheckpoint.enqueue
		});
		this.eventProjection = new CodexEventProjection(threadId, turnId, (event) => this.emitAgentEvent(event), this.toolProgressProjection, this.toolTranscriptProjection, options.onNativeToolResultRecorded);
		this.assistantProjection = new CodexAssistantProjection(params, (event) => this.emitAgentEvent(event), (text) => this.toolProgressProjection.matchesEcho(text), this.transcriptCheckpoint.nextTimestamp, this.transcriptCheckpoint.enqueueCommentary);
		this.reasoningProjection = new CodexReasoningProjection(params, (event) => this.emitAgentEvent(event), options.onNativePlanUpdate);
	}
	getCompletedTurnStatus() {
		return this.completedTurn?.status;
	}
	getActiveMcpToolCall(serverName) {
		if (this.projectionClosed || this.aborted) return;
		return this.nativeToolLifecycleProjector.getActiveMcpToolCall(serverName);
	}
	recordMcpToolCallReceipt(notification) {
		if (!this.projectionClosed) this.nativeToolLifecycleProjector.recordMcpToolCallReceipt(notification);
	}
	buildSteeringTranscriptPrefix() {
		const snapshot = buildCodexSteeringMessagesSnapshot({
			runParams: this.params,
			turnId: this.turnId,
			upstreamUserText: this.options.upstreamUserText,
			completedItemIds: this.completedItemIds,
			assistantProjection: this.assistantProjection,
			toolMessages: this.toolTranscriptProjection.transcriptMessages
		});
		this.pendingSteeringAssistantBoundaryItemId = snapshot.assistantBoundaryItemId;
		return snapshot.messages;
	}
	markSteeringTranscriptPersisted() {
		const itemId = this.pendingSteeringAssistantBoundaryItemId;
		if (itemId) {
			this.assistantProjection.markAssistantBoundaryPersisted(itemId);
			this.pendingSteeringAssistantBoundaryItemId = void 0;
		}
	}
	/** Fence delayed projections before the turn's final snapshot leaves its owner. */
	closeProjection() {
		this.projectionClosed = true;
		return this.transcriptCheckpoint.flush(true);
	}
	/** Resolves the shared model-order position for a native tool item. */
	recordNativeToolOutcome(item) {
		if (!item || this.nativeToolOutcomeOrdinals.has(item.id) || !shouldClearTerminalPresentationForNativeItem(item)) return;
		const ordinal = this.params.allocateToolOutcomeOrdinal?.(item.id);
		if (ordinal !== void 0) this.nativeToolOutcomeOrdinals.set(item.id, ordinal);
	}
	recordNativeToolApprovalFailure(toolCallId, disposition, approvalKind) {
		this.nativeToolLifecycleProjector.recordApprovalFailureDisposition(toolCallId, disposition);
		if (disposition === "timed_out" && approvalKind) this.toolProgressProjection.approvalTimeoutKinds.set(toolCallId, approvalKind);
	}
	recordNativeToolPreToolUseFailure(failure) {
		this.nativeToolLifecycleProjector.recordPreToolUseFailure(failure);
	}
	async handleNotification(notification) {
		if (this.projectionClosed) return;
		const params = isJsonObject(notification.params) ? notification.params : void 0;
		if (!params) return;
		if (notification.method === "hook/started" || notification.method === "hook/completed") {
			if (!this.isHookNotificationForCurrentThread(params)) return;
		} else if (notification.method === "guardianWarning" || notification.method === "warning" || notification.method === "configWarning") {
			const warningThreadId = readCodexNotificationThreadId(params);
			if (notification.method === "guardianWarning" && warningThreadId !== this.threadId || warningThreadId && warningThreadId !== this.threadId) return;
		} else if (!isCodexNotificationForTurn(params, this.threadId, this.turnId)) return;
		if (notification.method !== "guardianWarning" && notification.method !== "item/autoApprovalReview/started" && notification.method !== "item/autoApprovalReview/completed") this.eventProjection.flushPendingGuardianWarning();
		this.nativeToolLifecycleProjector.handleNotification(notification);
		this.assistantProjection.handleNotification(notification.method, params);
		switch (notification.method) {
			case "item/agentMessage/delta":
				await this.assistantProjection.handleAssistantDelta(params);
				break;
			case "item/reasoning/summaryTextDelta":
			case "item/reasoning/textDelta":
				await this.reasoningProjection.handleReasoningDelta(notification.method, params);
				break;
			case "item/plan/delta":
				this.reasoningProjection.handlePlanDelta(params);
				break;
			case "turn/plan/updated":
				await this.reasoningProjection.handleTurnPlanUpdated(params);
				break;
			case "item/started":
				await this.handleItemStarted(params);
				await this.transcriptCheckpoint.flushInOrder();
				break;
			case "item/completed":
				await this.handleItemCompleted(params);
				await this.transcriptCheckpoint.flushInOrder();
				break;
			case "item/commandExecution/outputDelta":
				this.toolProgressProjection.handleOutputDelta(params, "bash");
				break;
			case "item/autoApprovalReview/started":
			case "item/autoApprovalReview/completed":
				this.eventProjection.handleGuardianReview(notification.method, params);
				break;
			case "autoApprovalReview/strictReviewRequired":
				this.eventProjection.handleStrictReviewRequired(params);
				break;
			case "guardianWarning":
				this.eventProjection.handleGuardianWarning(params);
				break;
			case "warning":
			case "configWarning":
				this.eventProjection.handleWarning(params);
				break;
			case "hook/started":
			case "hook/completed":
				this.eventProjection.handleHook(notification.method, params);
				break;
			case "thread/tokenUsage/updated":
				projectCodexThreadUsageUpdate(params, this.tokenUsage, (usage) => this.tokenUsage = usage, (data) => {
					if (data.modelContextWindow !== void 0) {
						this.contextTokens = data.modelContextWindow;
						this.contextTokensSource = this.params.authoredContextTokenCap === void 0 ? "runtime" : "runtime-configured";
					}
					this.emitAgentEvent({
						stream: "usage",
						data
					});
				});
				break;
			case "turn/completed":
				__vCodexTurnTail().start(this.params.runId, { harness: "codex", provider: this.params.provider ?? null, model: this.params.modelId ?? null }); // V codex-turn-tail-v1
				await this.handleTurnCompleted(params);
				break;
			case "rawResponse/completed":
				this.responseCompletions.record(params, this.params.hostCapabilities.reportOutputTokens);
				break;
			case "rawResponseItem/completed":
				await this.handleRawResponseItemCompleted(params);
				await this.transcriptCheckpoint.flushInOrder();
				break;
			case "model/rerouted":
				this.eventProjection.handleModelRerouted(params);
				break;
			case "error": {
				this.responseCompletions.clear();
				if (params.willRetry === true) break;
				const codexErrorInfo = isJsonObject(params.error) ? params.error.codexErrorInfo : void 0;
				const compactionFailure = codexErrorInfo === "other" && this.isCompacting();
				this.settledTurnFailureFinalizationAllowed = codexErrorInfo === "serverOverloaded" || compactionFailure;
				this.promptError = resolveCodexPromptError({
					message: readCodexErrorNotificationMessage(params),
					codexErrorInfo,
					rateLimits: this.options.readRecentRateLimits?.()
				}) ?? "codex app-server error";
				this.promptErrorSource = compactionFailure ? "compaction" : "prompt";
				break;
			}
			case "thread/compacted":
			case "turn/started":
			case "turn/diff/updated":
			case "item/reasoning/summaryPartAdded":
			case "item/commandExecution/terminalInteraction":
			case "item/fileChange/outputDelta":
			case "item/fileChange/patchUpdated":
			case "item/mcpToolCall/progress":
			case "model/verification":
			case "turn/moderationMetadata":
			case "model/safetyBuffering/updated": break;
			default: this.diagnostics.warnUnknownEvent(notification, params);
		}
	}
	buildResult(toolTelemetry, options) {
		this.eventProjection.flushPendingGuardianWarning();
		return buildCodexAttemptResult({
			runParams: this.params,
			turnId: this.turnId,
			upstreamUserText: this.options.upstreamUserText,
			completedTurn: this.completedTurn,
			promptError: this.promptError,
			promptErrorSource: this.promptErrorSource,
			synthesizedMissingToolResultError: this.synthesizedMissingToolResultError,
			recordSynthesizedMissingToolResultError: (error) => {
				this.synthesizedMissingToolResultError = error;
				this.promptErrorSource = this.promptErrorSource ?? "prompt";
			},
			aborted: this.aborted,
			tokenUsage: this.tokenUsage,
			contextTokens: this.contextTokens,
			contextTokensSource: this.contextTokensSource,
			completedCompactionCount: this.completedCompactionCount,
			activeItemCount: this.activeItemIds.size,
			completedItemCount: this.completedItemIds.size,
			guardianReviewCount: this.eventProjection.guardianReviewCount,
			toolTelemetry,
			yieldDetected: options?.yieldDetected,
			nativeToolLifecycleProjection: this.nativeToolLifecycleProjector,
			assistantProjection: this.assistantProjection,
			reasoningProjection: this.reasoningProjection,
			responseCompletions: this.responseCompletions,
			toolTranscriptProjection: this.toolTranscriptProjection,
			toolProgressProjection: this.toolProgressProjection,
			generatedMediaProjection: this.generatedMediaProjection
		});
	}
	recordDynamicToolCall(params) {
		this.toolTranscriptProjection.recordDynamicToolCall(params);
	}
	/** Projects a successful OpenClaw progress_card call through the native plan stream. */
	async recordDynamicProgressCardUpdate(params) {
		if (isJsonObject(params)) {
			const projected = { plan: Array.isArray(params.plan) ? params.plan : [] };
			await this.reasoningProjection.handleTurnPlanUpdated(projected, "openclaw");
		}
	}
	recordDynamicToolResult(params) {
		this.toolProgressProjection.recordDynamicToolResult(params);
		const source = this.options.resolveDynamicToolResultContentSource?.(params.tool);
		this.toolTranscriptProjection.recordDynamicToolResult(params, source);
	}
	markTimedOut() {
		this.aborted = true;
		this.promptError = "codex app-server attempt timed out";
		this.promptErrorSource = "prompt";
	}
	markAborted() {
		this.aborted = true;
		this.responseCompletions.clear();
	}
	isCompacting() {
		return this.activeCompactionItemIds.size > 0;
	}
	async handleItemStarted(params) {
		const item = readItem(params.item);
		const itemId = item?.id ?? readStringField(params, "itemId");
		this.assistantProjection.recordItemStarted(item, itemId);
		if (itemId) this.activeItemIds.add(itemId);
		this.recordNativeToolOutcome(item);
		if (item?.type === "contextCompaction" && itemId) {
			this.activeCompactionItemIds.add(itemId);
			await runAgentHarnessBeforeCompactionHook({
				sessionFile: this.params.sessionFile,
				messages: await this.toolTranscriptProjection.readMirroredSessionMessages(),
				ctx: this.options.agentHookContext ?? {}
			});
			this.emitAgentEvent({
				stream: "compaction",
				data: {
					phase: "start",
					backend: "codex-app-server",
					threadId: this.threadId,
					turnId: this.turnId,
					itemId
				}
			});
		}
		this.toolProgressProjection.recordToolMeta(item);
		this.eventProjection.emitStandardItemEvent({
			phase: "start",
			item
		});
		await this.eventProjection.emitNormalizedToolItemEvent({
			phase: "start",
			item
		});
		if (this.projectionClosed) return;
		this.toolTranscriptProjection.recordNativeToolCall(item);
		this.toolProgressProjection.emitToolResultSummary(item);
		this.emitAgentEvent({
			stream: "codex_app_server.item",
			data: {
				phase: "started",
				itemId,
				type: item?.type
			}
		});
	}
	async handleItemCompleted(params) {
		const item = readItem(params.item);
		this.diagnostics.warnUnknownItemStatus(item);
		this.recordNativeToolOutcome(item);
		this.clearTerminalPresentationForNativeItem(item);
		const itemId = item?.id ?? readStringField(params, "itemId");
		if (itemId) {
			this.activeItemIds.delete(itemId);
			this.completedItemIds.add(itemId);
		}
		if (!this.asyncDeliveryProjection.allows(item, true)) return;
		const asyncMessage = this.assistantProjection.recordItemCompleted(item, itemId, this.activeItemIds);
		if (asyncMessage) await this.asyncDeliveryProjection.deliver(asyncMessage);
		if (this.projectionClosed) return;
		this.reasoningProjection.recordItem(item);
		await this.generatedMediaProjection.recordNative(item);
		if (this.projectionClosed) return;
		if (item?.type === "contextCompaction" && itemId) {
			this.activeCompactionItemIds.delete(itemId);
			this.completedCompactionCount += 1;
			await this.options.onContextCompacted?.();
			if (this.projectionClosed) return;
			await runAgentHarnessAfterCompactionHook({
				sessionFile: this.params.sessionFile,
				messages: await this.toolTranscriptProjection.readMirroredSessionMessages(),
				compactedCount: -1,
				ctx: this.options.agentHookContext ?? {}
			});
			if (this.projectionClosed) return;
			await persistCodexContextCompactionActivity({
				sessionTarget: this.params.sessionTarget,
				config: this.params.config,
				cwd: this.params.workspaceDir,
				runId: this.params.runId,
				threadId: this.threadId,
				turnId: this.turnId,
				itemId,
				timestamp: this.transcriptCheckpoint.nextTimestamp()
			});
			this.eventProjection.emitCompactionEnd(itemId, true);
		}
		this.toolProgressProjection.recordToolMeta(item);
		this.toolProgressProjection.rememberCommandAggregateOutputEcho(item);
		this.eventProjection.emitStandardItemEvent({
			phase: "end",
			item
		});
		await this.eventProjection.emitNormalizedToolItemEvent({
			phase: "result",
			item
		});
		if (this.projectionClosed) return;
		this.toolTranscriptProjection.recordNativeToolCall(item);
		await this.toolTranscriptProjection.recordNativeToolResultWithDetails(item);
		if (this.projectionClosed) return;
		this.toolProgressProjection.emitToolResultSummary(item);
		this.toolProgressProjection.emitToolResultOutput(item);
		this.emitAgentEvent({
			stream: "codex_app_server.item",
			data: {
				phase: "completed",
				itemId,
				type: item?.type
			}
		});
	}
	async handleTurnCompleted(params) {
		const turn = readCodexTurn(params.turn);
		if (!turn || turn.id !== this.turnId) return;
		this.completedTurn = turn;
		const compactionFailure = turn.status === "failed" && (this.promptErrorSource === "compaction" || turn.error?.codexErrorInfo === "other" && this.isCompacting());
		this.settledTurnFailureFinalizationAllowed = turn.status === "failed" && (turn.error?.codexErrorInfo === "serverOverloaded" || compactionFailure);
		if (turn.status !== "completed") this.responseCompletions.clear();
		if (turn.status === "failed") {
			this.promptError = resolveCodexPromptError({
				message: turn.error?.message,
				codexErrorInfo: turn.error?.codexErrorInfo,
				rateLimits: this.options.readRecentRateLimits?.()
			}) ?? "codex app-server turn failed";
			this.promptErrorSource = compactionFailure ? "compaction" : "prompt";
		}
		if (compactionFailure) {
			const failedCompactionItemIds = [...this.activeCompactionItemIds];
			for (const itemId of failedCompactionItemIds) {
				this.activeItemIds.delete(itemId);
				this.activeCompactionItemIds.delete(itemId);
				this.eventProjection.emitCompactionEnd(itemId, false);
			}
		}
		const turnItems = turn.items ?? [];
		const unsettledAsyncDeliveries = this.asyncDeliveryProjection.pending();
		const lastToolItem = turnItems.findLast((item) => matchesCodexSnapshotTurn(item, this.turnId) && (item.type === "dynamicToolCall" || shouldClearTerminalPresentationForNativeItem(item)));
		if (lastToolItem?.type !== "dynamicToolCall") this.clearTerminalPresentationForNativeItem(lastToolItem);
		for (const item of turnItems) {
			if (!this.asyncDeliveryProjection.allows(item)) continue;
			this.diagnostics.warnUnknownItemStatus(item);
			const asyncMessage = this.assistantProjection.recordSnapshotItem(item);
			if (asyncMessage) await this.asyncDeliveryProjection.deliver(asyncMessage);
			if (this.projectionClosed) return;
			this.reasoningProjection.recordItem(item);
			await this.generatedMediaProjection.recordNative(item);
			if (this.projectionClosed) return;
			this.toolProgressProjection.recordToolMeta(item);
			this.toolProgressProjection.rememberCommandAggregateOutputEcho(item);
			await this.emitSnapshotOnlyNativeToolProgress(item);
			if (this.projectionClosed) return;
			this.toolTranscriptProjection.recordNativeToolCall(item);
			await this.toolTranscriptProjection.recordNativeToolResultWithDetails(item);
			if (this.projectionClosed) return;
			this.toolTranscriptProjection.emitAfterToolCallObservation(item);
			this.toolProgressProjection.emitToolResultSummary(item);
			this.toolProgressProjection.emitToolResultOutput(item);
		}
		this.toolProgressProjection.approvalTimeoutKinds.clear();
		for (const delivery of unsettledAsyncDeliveries) {
			if (this.projectionClosed) return;
			await this.asyncDeliveryProjection.deliver(delivery);
		}
		if (this.projectionClosed) return;
		this.assistantProjection.finalizeAnswerCandidate(turn);
		this.activeCompactionItemIds.clear();
		await this.reasoningProjection.maybeEndReasoning();
	}
	async emitSnapshotOnlyNativeToolProgress(item) {
		if (!shouldSynthesizeToolProgressForItem(item) || !matchesCodexSnapshotTurn(item, this.turnId) || this.completedItemIds.has(item.id) || itemStatus(item) === "running") return;
		if (!this.activeItemIds.has(item.id)) {
			this.eventProjection.emitStandardItemEvent({
				phase: "start",
				item
			});
			await this.eventProjection.emitNormalizedToolItemEvent({
				phase: "start",
				item
			});
		}
		if (this.projectionClosed) return;
		this.activeItemIds.delete(item.id);
		this.eventProjection.emitStandardItemEvent({
			phase: "end",
			item
		});
		await this.eventProjection.emitNormalizedToolItemEvent({
			phase: "result",
			item
		});
		this.completedItemIds.add(item.id);
	}
	async handleRawResponseItemCompleted(params) {
		const item = isJsonObject(params.item) ? params.item : void 0;
		if (!item) return;
		this.toolTranscriptProjection.recordRawNativeToolItem(item);
		if (!this.isCompacting()) this.assistantProjection.handleRawResponseItemCompleted(item, this.activeItemIds); // v-codex-firsttext-v5: a compaction handoff summary is not a reply
		await this.generatedMediaProjection.recordRaw(item);
	}
	clearTerminalPresentationForNativeItem(item) {
		if (!item || this.terminalPresentationClearedItemIds.has(item.id) || !shouldClearTerminalPresentationForNativeItem(item)) return;
		const toolCallOrdinal = this.nativeToolOutcomeOrdinals.get(item.id);
		this.terminalPresentationClearedItemIds.add(item.id);
		this.params.onToolOutcome?.({
			toolName: itemName(item) ?? item.type,
			argsHash: "",
			resultHash: "",
			...toolCallOrdinal !== void 0 ? { toolCallOrdinal } : {},
			terminalPresentation: void 0,
			presentationOnly: true
		});
	}
	emitAgentEvent(event) {
		if (!this.projectionClosed) emitCodexAgentEvent(this.params, event);
	}
	isHookNotificationForCurrentThread(params) {
		const threadId = readStringField(params, "threadId");
		const turnId = params.turnId;
		return threadId === this.threadId && (turnId === this.turnId || turnId === null);
	}
};
//#endregion
//#region extensions/codex/src/app-server/native-mcp-app.ts
const CODEX_APPS_MCP_SERVER = "codex_apps";
function readMcpAppResourceUri(item) {
	const appContext = asOptionalRecord(item.appContext);
	const uri = normalizeOptionalString(appContext?.resourceUri) ?? normalizeOptionalString(item.mcpAppResourceUri);
	return uri?.startsWith("ui://") ? uri : void 0;
}
function readMcpAppConnectorId(item) {
	return normalizeOptionalString(asOptionalRecord(item.appContext)?.connectorId);
}
function readMcpToolResult(item) {
	const result = asOptionalRecord(item.result);
	if (!result || !Array.isArray(result.content)) return;
	const resultMeta = asOptionalRecord(result["_meta"]);
	return {
		content: result.content,
		...result.structuredContent !== void 0 ? { structuredContent: result.structuredContent } : {},
		...result.isError === true ? { isError: true } : {},
		...resultMeta ? { _meta: resultMeta } : {}
	};
}
function statusTools(status) {
	return Object.entries(status.tools).map(([name, value]) => Object.assign({}, asOptionalRecord(value) ?? {}, { name }));
}
function createNativeMcpRuntime(params) {
	let catalog = null;
	let statuses;
	const createdAt = Date.now();
	const loadStatuses = async () => {
		if (statuses) return statuses;
		statuses = (await params.client.request("mcpServerStatus/list", {
			threadId: params.threadId,
			detail: "full"
		})).data;
		return statuses;
	};
	const getCatalog = async () => {
		if (catalog) return catalog;
		const loaded = await loadStatuses();
		catalog = {
			version: 1,
			generatedAt: Date.now(),
			servers: Object.fromEntries(loaded.map((status) => [status.name, {
				serverName: status.name,
				launchSummary: "Codex native MCP connection",
				toolCount: Object.keys(status.tools).length
			}])),
			tools: loaded.flatMap((status) => statusTools(status).map((tool) => {
				const uiVisibility = readCodexMcpToolUiVisibility(tool);
				return Object.assign({
					serverName: status.name,
					safeServerName: status.name,
					toolName: String(tool.name),
					inputSchema: asOptionalRecord(tool.inputSchema) ?? { type: "object" },
					fallbackDescription: normalizeOptionalString(tool.description) ?? String(tool.name)
				}, uiVisibility ? { uiVisibility } : {});
			}))
		};
		return catalog;
	};
	const runtime = {
		sessionId: params.attempt.sessionId,
		sessionKey: params.attempt.sessionKey,
		workspaceDir: params.attempt.workspaceDir,
		configFingerprint: `${getCodexAppServerClientInstanceId(params.client)}:${params.threadId}`,
		mcpAppsEnabled: true,
		createdAt,
		lastUsedAt: createdAt,
		acquireLease: () => retainSharedCodexAppServerClientIfCurrent(params.client) ?? (() => {}),
		getCatalog,
		peekCatalog: () => catalog,
		markUsed: () => {
			runtime.lastUsedAt = Date.now();
		},
		callTool: async (serverName, toolName, input) => await params.client.request("mcpServer/tool/call", {
			threadId: params.threadId,
			server: serverName,
			tool: toolName,
			arguments: asOptionalRecord(input) ?? {}
		}),
		listTools: async (serverName) => {
			const status = (await loadStatuses()).find((entry) => entry.name === serverName);
			return { tools: status ? statusTools(status) : [] };
		},
		readResource: async (serverName, uri) => {
			const isCodexAppsServer = serverName === CODEX_APPS_MCP_SERVER;
			const response = await params.client.request("mcpServer/resource/read", {
				threadId: params.threadId,
				...isCodexAppsServer ? { originCallId: params.originCallId } : {},
				server: serverName,
				uri,
				...params.connectorId ? { connectorId: params.connectorId } : {}
			});
			if (isCodexAppsServer && response.originCallId !== params.originCallId) throw new Error(`Codex MCP resource response originCallId mismatch: expected ${params.originCallId}, received ${response.originCallId}`);
			return response;
		},
		listResources: async (serverName) => {
			return { resources: (await loadStatuses()).find((entry) => entry.name === serverName)?.resources ?? [] };
		},
		listResourceTemplates: async (serverName) => {
			return { resourceTemplates: (await loadStatuses()).find((entry) => entry.name === serverName)?.resourceTemplates ?? [] };
		},
		dispose: async () => {}
	};
	return runtime;
}
function createCodexNativeMcpAppResultDetailsPreparer(params) {
	if (params.attempt.config?.mcp?.apps?.enabled !== true) return;
	return async (item) => {
		const serverName = normalizeOptionalString(item.server);
		const toolName = normalizeOptionalString(item.tool);
		const uiResourceUri = readMcpAppResourceUri(item);
		const connectorId = readMcpAppConnectorId(item);
		const toolResult = readMcpToolResult(item);
		if (!serverName || !toolName || !uiResourceUri || !toolResult) return;
		if (serverName === CODEX_APPS_MCP_SERVER && !connectorId) return;
		const runtime = createNativeMcpRuntime({
			...params,
			originCallId: item.id,
			...connectorId ? { connectorId } : {}
		});
		const tools = (await runtime.listTools?.(serverName))?.tools ?? [];
		const allowedAppToolNames = new Set(tools.filter((tool) => {
			const uiVisibility = readCodexMcpToolUiVisibility(tool);
			return (uiVisibility === void 0 || uiVisibility.includes("app")) && (serverName !== CODEX_APPS_MCP_SERVER || readCodexMcpToolConnectorId(tool) === connectorId);
		}).map((tool) => tool.name));
		if (!allowedAppToolNames.has(toolName)) return;
		return await prepareHarnessNativeMcpAppPreview({
			runtime,
			serverName,
			toolName,
			uiResourceUri,
			toolCallId: item.id,
			toolInput: item.arguments ?? {},
			toolResult,
			allowedAppToolNames,
			...toolResult["_meta"] !== void 0 ? { resultMetaState: "unavailable" } : {}
		});
	};
}
//#endregion
//#region extensions/codex/src/app-server/plan-compaction-state.ts
const RESTORED_PLAN_PREAMBLE = "OpenClaw restored the session progress card after context compaction. This is application state, not a new user request. Continue the current task and call progress_card whenever the status meaningfully changes.";
const PROGRESS_CARD_MAX_STEPS = 50;
const PROGRESS_CARD_MAX_STEP_UTF8_BYTES = 512;
const PROGRESS_CARD_MAX_UTF8_BYTES = 8192;
const RESTORED_PLAN_MAX_MARKDOWN_BYTES = 2048;
const RESTORED_PLAN_MAX_PAYLOAD_BYTES = 32768;
const RESTORED_PLAN_TRUNCATION_SUFFIX = "…";
function canonicalizeNativeProgressCardInput(input) {
	const markdown = input.markdown === void 0 ? void 0 : truncateUtf8(stripInvisibleUnicode(input.markdown), PROGRESS_CARD_MAX_UTF8_BYTES);
	const plan = [];
	let hasInProgressStep = false;
	for (const step of input.steps.slice(0, PROGRESS_CARD_MAX_STEPS)) {
		const text = truncateUtf8(stripInvisibleUnicode(step.step), PROGRESS_CARD_MAX_STEP_UTF8_BYTES);
		if (!text.trim()) continue;
		let status = step.status;
		if (status === "in_progress") {
			if (hasInProgressStep) status = "pending";
			else hasInProgressStep = true;
		}
		plan.push({
			step: text,
			status
		});
	}
	return {
		...markdown !== void 0 ? { markdown } : {},
		plan
	};
}
/** Retains the latest projected plan so Codex compaction cannot discard it. */
var CodexCompactionPlanState = class {
	record(event) {
		if (event.stream !== "plan") return;
		const plan = readBoundedPlan(event.data.explanation, event.data.steps);
		this.latestPlan = plan;
	}
	/** Retains markdown that migration-only plan events intentionally omit. */
	recordProgressCardInput(value) {
		if (!isJsonObject(value)) return;
		this.latestPlan = readBoundedPlan(value.markdown, value.plan);
	}
	async restore(params) {
		if (!this.latestPlan) return;
		await params.client.request("thread/inject_items", {
			threadId: params.threadId,
			items: [{
				type: "message",
				role: "user",
				content: [{
					type: "input_text",
					text: `${RESTORED_PLAN_PREAMBLE}\n${serializePlan(this.latestPlan)}`
				}]
			}]
		}, {
			timeoutMs: params.timeoutMs,
			signal: params.signal
		});
	}
};
function readBoundedPlan(markdownValue, stepsValue) {
	const canonical = canonicalizeNativeProgressCardInput({
		...typeof markdownValue === "string" ? { markdown: markdownValue } : {},
		steps: readPlanSteps(stepsValue)
	});
	const markdown = canonical.markdown === void 0 ? void 0 : truncateUtf8(canonical.markdown, RESTORED_PLAN_MAX_MARKDOWN_BYTES);
	const steps = [];
	for (const step of canonical.plan) {
		const candidate = {
			...markdown?.trim() ? { markdown } : {},
			steps: [...steps, step]
		};
		if (Buffer$1.byteLength(serializePlan(candidate), "utf8") > RESTORED_PLAN_MAX_PAYLOAD_BYTES) break;
		steps.push(step);
	}
	return markdown?.trim() || steps.length > 0 ? {
		...markdown?.trim() ? { markdown } : {},
		steps
	} : void 0;
}
function serializePlan(plan) {
	return JSON.stringify({
		markdown: plan.markdown,
		plan: plan.steps
	});
}
function truncateUtf8(value, maxBytes) {
	if (Buffer$1.byteLength(value, "utf8") <= maxBytes) return value;
	const suffixBytes = Buffer$1.byteLength(RESTORED_PLAN_TRUNCATION_SUFFIX, "utf8");
	return `${truncateUtf8Prefix(value, maxBytes - suffixBytes)}${RESTORED_PLAN_TRUNCATION_SUFFIX}`;
}
function readPlanSteps(value) {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
		const { step, status } = entry;
		if (typeof step !== "string" || !isPlanStatus(status)) return [];
		return [{
			step,
			status
		}];
	});
}
function isPlanStatus(value) {
	return value === "pending" || value === "in_progress" || value === "completed";
}
//#endregion
//#region extensions/codex/src/app-server/user-input-bridge.ts
/** Owns per-turn Codex request_user_input and ordinary MCP elicitation lifecycles. */
const DEFAULT_USER_INPUT_TIMEOUT_MS = 9e5;
const NONBLOCKING_USER_INPUT_TIMEOUT_MS = 12e4;
const MAX_USER_INPUT_QUESTIONS = 3;
const MAX_USER_INPUT_OPTIONS = 4;
const MAX_USER_INPUT_ID = 256;
const MAX_USER_INPUT_HEADER = 64;
const MAX_USER_INPUT_TEXT = 4096;
/** Creates the single per-turn owner for Codex operator input. */
function createCodexUserInputBridge(params) {
	const gatewayCall = params.gatewayCall ?? callGatewayTool;
	const jobs = [];
	let activeCompletion;
	const inputSessionKey = params.paramsForRun.sessionKey ?? params.paramsForRun.sessionId;
	const pump = () => {
		const job = jobs[0];
		if (activeCompletion || !job) return;
		activeCompletion = job.run(job.abort.signal).catch((error) => {
			embeddedAgentLog.warn("failed to bridge codex operator input", { error });
			return job.abort.signal.aborted ? job.cancelValue : job.failureValue;
		}).then((value) => {
			job.resolve(job.abort.signal.aborted ? job.cancelValue : value ?? job.failureValue);
		}).finally(() => {
			if (jobs[0] === job) jobs.shift();
			activeCompletion = void 0;
			pump();
		});
	};
	const enqueue = (definition) => {
		if (params.signal?.aborted) return Promise.resolve(definition.cancelValue);
		return new Promise((resolve) => {
			jobs.push({
				...definition,
				resolve
			});
			pump();
		});
	};
	const cancelJob = (job) => {
		const index = jobs.indexOf(job);
		if (index < 0) return;
		if (index === 0) {
			job.abort.abort(/* @__PURE__ */ new Error("Codex operator input request cancelled"));
			return;
		}
		jobs.splice(index, 1);
		job.resolve(job.cancelValue);
	};
	const cancelPending = async () => {
		const pendingCompletion = activeCompletion;
		const queuedJobs = jobs.splice(1);
		for (const job of queuedJobs) job.resolve(job.cancelValue);
		jobs[0]?.abort.abort(/* @__PURE__ */ new Error("Codex operator input request cancelled"));
		await pendingCompletion;
	};
	const execute = (input, timeoutMs, signal) => agentHarnessStructuredInput.run({
		input,
		sessionKey: inputSessionKey,
		agentId: params.paramsForRun.agentId,
		runId: params.paramsForRun.runId,
		timeoutMs,
		gatewayCall,
		delivery: params.paramsForRun,
		signal,
		promptOptions: {
			formatText: formatCodexDisplayText,
			unsupportedIntro: "Codex input request could not be shown:",
			urlIntro: "Codex needs confirmation:"
		}
	});
	params.signal?.addEventListener("abort", () => void cancelPending(), { once: true });
	return {
		async handleRequest(request) {
			const requestParams = readUserInputParams(request.params);
			if (!requestParams || requestParams.threadId !== params.threadId || requestParams.turnId !== params.turnId) return;
			if (requestParams.questions.length === 0) return emptyUserInputResponse();
			const timeoutMs = requestParams.isBlocking ? params.paramsForRun.timeoutMs ?? DEFAULT_USER_INPUT_TIMEOUT_MS : NONBLOCKING_USER_INPUT_TIMEOUT_MS;
			const input = compileUserInputQuestions(requestParams.questions);
			const cancelValue = emptyUserInputResponse();
			return await enqueue({
				requestId: request.id,
				abort: new AbortController(),
				cancelValue,
				failureValue: cancelValue,
				run: async (signal) => {
					const result = await execute(input, timeoutMs, signal);
					return result.status === "answered" ? gatewayAnswersToCodexResponse(result.answers) : cancelValue;
				}
			});
		},
		async handleElicitationRequest(request) {
			if (readRawOwnString(request.params, "threadId") !== params.threadId) return;
			const requestSnapshot = agentHarnessStructuredInput.snapshot(request.params);
			if (requestSnapshot === void 0) {
				const cancelValue = createCodexElicitationResponse("cancel");
				return await enqueue({
					requestId: request.id,
					abort: new AbortController(),
					cancelValue,
					failureValue: declineElicitation("OpenClaw could not handle this elicitation."),
					run: async (signal) => {
						const result = await execute({
							kind: "unsupported",
							message: "OpenClaw declined a malformed or over-limit MCP elicitation request."
						}, params.paramsForRun.timeoutMs ?? DEFAULT_USER_INPUT_TIMEOUT_MS, signal);
						return result.status === "unsupported" ? declineElicitation(result.message) : cancelValue;
					}
				});
			}
			const { compileCodexOrdinaryElicitation } = await import("./elicitation-input-DMkeki8d.js");
			const compiled = compileCodexOrdinaryElicitation({
				value: requestSnapshot,
				threadId: params.threadId,
				turnId: params.turnId
			});
			if (compiled.kind === "ignored") return;
			const cancelValue = createCodexElicitationResponse("cancel");
			const timeoutMs = params.paramsForRun.timeoutMs ?? DEFAULT_USER_INPUT_TIMEOUT_MS;
			return await enqueue({
				requestId: request.id,
				abort: new AbortController(),
				cancelValue,
				failureValue: declineElicitation("OpenClaw could not handle this elicitation."),
				run: async (signal) => {
					const result = await execute(compiled.input, timeoutMs, signal);
					if (result.status === "answered") {
						const content = compiled.input.kind === "ready" && compiled.input.plan.kind === "url" ? null : result.content;
						return createCodexElicitationResponse("accept", content);
					}
					if (result.status === "declined") return declineElicitation(result.message);
					if (result.status === "unsupported") return declineElicitation(result.message);
					return cancelValue;
				}
			});
		},
		handleNotification(notification) {
			if (notification.method !== "serverRequest/resolved" || !isJsonObject(notification.params)) return;
			const requestId = readRequestId(notification.params);
			if (requestId === void 0 || readOwnString(notification.params, "threadId") !== params.threadId) return;
			const job = jobs.find((candidate) => typeof candidate.requestId === typeof requestId && candidate.requestId === requestId);
			if (job) cancelJob(job);
		},
		cancelPending
	};
}
function compileUserInputQuestions(questions) {
	return agentHarnessStructuredInput.compileQuestions({
		questions,
		intro: "Codex needs input:"
	});
}
function readUserInputParams(value) {
	const snapshot = agentHarnessStructuredInput.snapshot(value);
	if (!agentHarnessStructuredInput.isRecord(snapshot)) return;
	const threadId = readBoundedUserInputText(snapshot, "threadId", MAX_USER_INPUT_ID);
	const turnId = readBoundedUserInputText(snapshot, "turnId", MAX_USER_INPUT_ID);
	const itemId = readBoundedUserInputText(snapshot, "itemId", MAX_USER_INPUT_ID);
	const questions = readArray(snapshot, "questions", MAX_USER_INPUT_QUESTIONS);
	if (!threadId || !turnId || !itemId || !questions) return;
	const parsed = [];
	for (const questionValue of questions) {
		const question = readQuestion(questionValue);
		if (!question) return;
		parsed.push(question);
	}
	return {
		threadId,
		turnId,
		questions: parsed,
		isBlocking: readValue(snapshot, "isBlocking") !== false
	};
}
function readQuestion(value) {
	if (!agentHarnessStructuredInput.isRecord(value)) return;
	const id = readBoundedUserInputText(value, "id", MAX_USER_INPUT_ID);
	const header = readBoundedUserInputText(value, "header", MAX_USER_INPUT_HEADER);
	const question = readBoundedUserInputText(value, "question", MAX_USER_INPUT_TEXT);
	if (!id || !header || !question) return;
	const options = readOptions(readValue(value, "options"));
	if (options === void 0) return;
	return {
		id,
		header,
		question,
		isOther: readValue(value, "isOther") === true,
		isSecret: readValue(value, "isSecret") === true,
		...readValue(value, "multiSelect") === true ? { multiSelect: true } : {},
		options
	};
}
function readOptions(value) {
	if (value === void 0 || value === null) return null;
	if (!Array.isArray(value) || value.length > MAX_USER_INPUT_OPTIONS) return;
	const options = [];
	for (const entry of value) {
		if (!agentHarnessStructuredInput.isRecord(entry)) return;
		const label = readBoundedUserInputText(entry, "label", MAX_USER_INPUT_ID);
		const description = readBoundedUserInputText(entry, "description", MAX_USER_INPUT_TEXT, true);
		if (!label) return;
		options.push({
			label,
			...description ? { description } : {}
		});
	}
	return options;
}
function readValue(record, key) {
	return Object.hasOwn(record, key) ? record[key] : void 0;
}
function readBoundedUserInputText(record, key, maximum, allowEmpty = false) {
	const value = readValue(record, key);
	return typeof value === "string" && value.length <= maximum && (allowEmpty || value.length > 0) ? value : void 0;
}
function readArray(record, key, maximum) {
	const value = readValue(record, key);
	return Array.isArray(value) && value.length <= maximum ? value : void 0;
}
function readOwnString(record, key) {
	const descriptor = Object.getOwnPropertyDescriptor(record, key);
	return descriptor && "value" in descriptor && typeof descriptor.value === "string" ? descriptor.value : void 0;
}
function readRawOwnString(value, key) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return;
	const descriptor = Object.getOwnPropertyDescriptor(value, key);
	return descriptor && "value" in descriptor && typeof descriptor.value === "string" ? descriptor.value : void 0;
}
function readRequestId(record) {
	const descriptor = Object.getOwnPropertyDescriptor(record, "requestId");
	const value = descriptor && "value" in descriptor ? descriptor.value : void 0;
	return typeof value === "string" || typeof value === "number" ? value : void 0;
}
function gatewayAnswersToCodexResponse(answers) {
	return { answers: Object.fromEntries(Object.entries(answers).map(([questionId, values]) => [questionId, { answers: values }])) };
}
function emptyUserInputResponse() {
	return { ...emptyAgentHarnessUserInputAnswers() };
}
function declineElicitation(message) {
	return createCodexElicitationResponse("decline", null, message ? { message } : null);
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-active-turn.ts
function activateCodexAttemptTurn(resources, turnRuntime, lifecycle, notifications, turn) {
	const { prompt, state: resourceState, projectorRef, trajectoryRecorder, pendingNativePreToolUseFailures } = resources;
	const { context, turnState } = prompt;
	const { runtime, attemptTools, hookContext } = context;
	const { connection } = runtime;
	const { params, runAbortController, terminalState, abortExplicitly, abortFromUpstream, sessionAgentId, contextSessionKey, effectiveCwd } = connection;
	const { dynamicToolParams, compactionPlanState, computerContextEpoch, toolBridge } = attemptTools;
	const { state, completion, userInputBridgeRef, steeringQueueRef, deadlines, noteProgress, completeTurn, interruptTurn } = turnRuntime;
	const { emitExecutionPhaseOnce, emitLifecycleStart, maybeAnnounceFastModeAutoOff } = lifecycle;
	const { enqueueNotification } = notifications;
	const activeTurnId = turn.turn.id;
	const progressCardTool = toolBridge.availableTools.find((tool) => tool.name === "progress_card");
	let nativePlanUpdateOrdinal = 0;
	const prepareNativeMcpAppResultDetails = createCodexNativeMcpAppResultDetailsPreparer({
		client: resourceState.client,
		threadId: resourceState.thread.threadId,
		attempt: dynamicToolParams
	});
	const streamState = {
		eventEmitted: false,
		needsTerminalSnapshot: false
	};
	emitExecutionPhaseOnce("turn_accepted", { phase: "turn_accepted" });
	userInputBridgeRef.current = createCodexUserInputBridge({
		paramsForRun: params,
		threadId: resourceState.thread.threadId,
		turnId: activeTurnId,
		signal: runAbortController.signal
	});
	trajectoryRecorder?.recordEvent("prompt.submitted", {
		threadId: resourceState.thread.threadId,
		turnId: activeTurnId,
		prompt: turnState.codexTurnPromptText,
		imagesCount: params.images?.length ?? 0
	});
	projectorRef.current = new CodexAppServerEventProjector({
		...dynamicToolParams,
		onAgentEvent: (event) => {
			if (event.stream === "assistant" && typeof event.data.delta === "string") {
				streamState.eventEmitted = true;
				streamState.needsTerminalSnapshot ||= event.data.replaceable === true;
			}
			return dynamicToolParams.onAgentEvent?.(event);
		}
	}, resourceState.thread.threadId, activeTurnId, {
		agentHookContext: hookContext,
		initialContextTokens: connection.mutable.startupContextTokens,
		nativePostToolUseRelayEnabled: resourceState.nativeHookRelay?.allowedEvents.includes("post_tool_use") === true && resourceState.nativeHookRelay.shouldRelayEvent("post_tool_use"),
		asyncUserMessageAllowed: params.disableTools !== true && (params.toolsAllow === void 0 || toolBridge.availableTools.some((tool) => tool.name === "message")),
		onAsyncDelivery: async (delivery) => {
			return await codexTranscriptMirrorRuntime.deliverAsyncMessageBestEffort({
				params: dynamicToolParams,
				cwd: effectiveCwd,
				threadId: resourceState.thread.threadId,
				turnId: activeTurnId,
				...delivery
			});
		},
		readRecentRateLimits: () => readRecentCodexRateLimits(resourceState.client),
		runAbortSignal: runAbortController.signal,
		remoteWorkspaceRoot: connection.appServer.remoteWorkspaceRoot,
		remoteWorkspaceRequestTimeoutMs: connection.appServer.requestTimeoutMs,
		readRemoteWorkspaceFile: ({ path, maxBytes, signal, timeoutMs }) => readBoundedCodexRemoteWorkspaceFile({
			client: resourceState.client,
			path,
			maxBytes,
			signal,
			timeoutMs
		}),
		trajectoryRecorder,
		resolveDynamicToolResultContentSource: toolBridge.resultContentSourceForTool,
		onNativeToolResultRecorded: maybeAnnounceFastModeAutoOff,
		...progressCardTool ? { onNativePlanUpdate: async (update) => {
			nativePlanUpdateOrdinal += 1;
			try {
				const input = canonicalizeNativeProgressCardInput(update);
				await progressCardTool.execute(`codex-native-plan:${activeTurnId}:${nativePlanUpdateOrdinal}`, input, runAbortController.signal);
			} catch (error) {
				embeddedAgentLog.warn("failed to persist native Codex plan to progress card", {
					runId: params.runId,
					threadId: resourceState.thread.threadId,
					error: formatErrorMessage(error)
				});
			}
		} } : {},
		...prepareNativeMcpAppResultDetails ? { prepareNativeMcpAppResultDetails } : {},
		upstreamUserText: turnState.codexTurnPromptText,
		onContextCompacted: async () => {
			computerContextEpoch.value += 1;
			delete computerContextEpoch.frameToolCallId;
			delete computerContextEpoch.frameImageIdentity;
			try {
				await compactionPlanState.restore({
					client: resourceState.client,
					threadId: resourceState.thread.threadId,
					timeoutMs: connection.appServer.requestTimeoutMs,
					signal: runAbortController.signal
				});
			} catch (error) {
				embeddedAgentLog.warn("failed to restore Codex plan state after compaction", {
					runId: params.runId,
					threadId: resourceState.thread.threadId,
					error: formatErrorMessage(error)
				});
			}
			// v-codex-turn-context-handoff-v1: compaction drops client developer messages, so the context goes back in
			if (resourceState.vTurnContextHandoff) {
				await invalidateCodexTurnContextHandoff({
					agentDir: resourceState.vTurnContextHandoff.agentDir,
					threadId: resourceState.thread.threadId
				});
				await deliverCodexTurnContextHandoff({
					client: resourceState.client,
					threadId: resourceState.thread.threadId,
					...resourceState.vTurnContextHandoff,
					timeoutMs: connection.appServer.requestTimeoutMs,
					signal: runAbortController.signal
				});
			}
		}
	});
	if (isTerminalTurnStatus(turn.turn.status)) {
		state.terminalTurnNotificationQueued = true;
		deadlines.beginSettlement(Date.now());
	}
	emitLifecycleStart();
	const activeProjector = projectorRef.current;
	noteProgress("turn:start");
	const abortListener = () => {
		state.abortCleanup = interruptTurn(activeTurnId).then(async (confirmed) => {
			if (!terminalState.explicitCancellationObserved && !state.permissionChangeRestart && !state.timeout) return;
			if (!confirmed) throw new Error(state.permissionChangeRestart ? "Permission change could not confirm the previous Codex turn stopped." : "Codex cancellation could not confirm the turn stopped; background terminals may still be running.");
			await terminateCodexBackgroundTerminals(resourceState.client, resourceState.thread.threadId);
			if (state.permissionChangeRestart) state.permissionChangeRestart = "confirmed";
		});
		state.abortCleanup.then(completeTurn, (error) => {
			embeddedAgentLog.warn("codex app-server cancellation cleanup failed", { error });
			completeTurn();
		});
	};
	runAbortController.signal.addEventListener("abort", abortListener, { once: true });
	if (runAbortController.signal.aborted) abortListener();
	for (const failure of pendingNativePreToolUseFailures.splice(0)) activeProjector.recordNativeToolPreToolUseFailure(failure);
	const notifyUserMessagePersisted = createCodexAppServerUserMessagePersistenceNotifier(params);
	const promptMirrorPromise = mirrorPromptAtTurnStartBestEffort({
		params,
		agentId: sessionAgentId,
		notifyUserMessagePersisted,
		sessionKey: contextSessionKey,
		cwd: effectiveCwd,
		threadId: resourceState.thread.threadId,
		turnId: activeTurnId,
		upstreamUserText: turnState.codexTurnPromptText
	});
	// v-codex-firsttext-v1: order durable writers behind the prompt write instead of holding the route.
	const promptMirrorSettled = Promise.resolve(promptMirrorPromise).then(() => void 0, () => void 0);
	activeProjector.transcriptCheckpoint.orderAfter(promptMirrorSettled);
	activeProjector.asyncDeliveryProjection.orderingGate = promptMirrorSettled;
	const bindProjection = async () => {
		state.activeLocalProjections += 1;
		try {
			if (state.completed) return; // v-codex-firsttext-v1: no longer waits for the prompt write
			if (resourceState.turnRoute) try {
				await Promise.race([resourceState.turnRoute.bindTurn(activeTurnId), completion]);
			} catch (error) {
				if (!state.terminalTurnNotificationQueued && !runAbortController.signal.aborted) throw error;
				await Promise.race([resourceState.turnRoute.drain(), completion]);
				if (!state.completed) throw error;
			}
			if (!state.completed && isTerminalTurnStatus(turn.turn.status)) {
				if (!isJsonObject(turn.turn)) throw new Error("Codex turn completion payload is not a JSON object");
				await enqueueNotification({
					method: "turn/completed",
					params: {
						threadId: resourceState.thread.threadId,
						turnId: activeTurnId,
						turn: turn.turn
					}
				}, {
					threadId: resourceState.thread.threadId,
					turnId: activeTurnId
				});
			}
		} finally {
			state.activeLocalProjections -= 1;
		}
	};
	const assertSteeringActive = () => {
		params.hostCapabilities.assertActive();
		runAbortController.signal.throwIfAborted();
		if (state.completed || state.terminalTurnNotificationQueued) throw new Error("codex app-server turn is no longer accepting steering");
	};
	const workspaceOnly = resolveAttemptFsWorkspaceOnly({
		config: params.config,
		sessionAgentId
	});
	const imageContext = {
		workspaceDir: connection.effectiveWorkspace,
		model: params.model,
		config: params.config,
		workspaceOnly,
		localRoots: workspaceOnly ? void 0 : getAgentScopedMediaLocalRoots(params.config ?? {}, sessionAgentId),
		sandbox: connection.sandbox?.enabled && connection.sandbox.fsBridge ? {
			root: connection.sandbox.workspaceDir,
			bridge: connection.sandbox.fsBridge
		} : void 0
	};
	const activeSteeringQueue = createCodexSteeringQueue({
		client: resourceState.client,
		threadId: resourceState.thread.threadId,
		turnId: activeTurnId,
		requestTimeoutMs: connection.appServer.requestTimeoutMs,
		signal: runAbortController.signal,
		assertActive: assertSteeringActive,
		prepareMessage: async (text, options) => {
			const result = await detectAndLoadAgentHarnessPromptImages({
				...imageContext,
				prompt: text,
				existingImages: options.images,
				imageOrder: options.imageOrder,
				media: options.media,
				userTurnTranscriptRecorder: options.userTurnTranscriptRecorder
			});
			if (result.failedMediaCount) throw new Error(`failed to hydrate ${result.failedMediaCount} structured image attachment(s) for Codex steering`);
			return buildCodexUserInput(text, result.images);
		},
		beforeConfirmConsumed: async (items) => {
			const transcriptItems = items.filter((item) => item.isInboundUserMessage === true || item.userTurnTranscriptRecorder !== void 0);
			if (transcriptItems.length === 0) return;
			await promptMirrorPromise;
			const messages = activeProjector.buildSteeringTranscriptPrefix();
			if (params.sessionTarget && messages.length > 0) {
				await codexTranscriptMirrorRuntime.mirror({
					agentId: sessionAgentId,
					sessionKey: contextSessionKey,
					sessionId: params.sessionId,
					storePath: params.sessionTarget.storePath,
					cwd: effectiveCwd,
					messages,
					idempotencyScope: `codex-app-server:${resourceState.thread.threadId}`,
					runId: params.runId,
					runMirrorIdentityPrefix: `${activeTurnId}:`,
					config: params.config
				});
				activeProjector.markSteeringTranscriptPersisted();
			}
			for (const item of transcriptItems) {
				const recorder = item.userTurnTranscriptRecorder;
				if (!recorder) continue;
				await recorder.persistApproved();
				if (!recorder.hasPersisted()) throw new Error("Codex consumed steering before its user turn was persisted");
			}
		}
	});
	steeringQueueRef.current = activeSteeringQueue;
	const claimPendingUserInputAnswer = async (text, optionsLocal) => {
		if (optionsLocal?.isInboundUserMessage !== true || hasPromptImageInput(optionsLocal)) return false;
		assertSteeringActive();
		return await claimPendingAgentQuestionAnswer({
			sessionKey: params.sessionKey ?? params.sessionId,
			text,
			persist: optionsLocal.userTurnTranscriptRecorder ? async () => {
				await optionsLocal.userTurnTranscriptRecorder?.persistApproved();
			} : void 0
		});
	};
	const cancelPendingUserInput = (resolvedBy) => cancelPendingAgentQuestionForSession({
		sessionKey: params.sessionKey ?? params.sessionId,
		resolvedBy
	});
	const queueMessage = async (text, optionsLocal) => {
		if (await claimPendingUserInputAnswer(text, optionsLocal)) {
			optionsLocal?.onQueueAccepted?.(true);
			return;
		}
		if (optionsLocal?.isInboundUserMessage === true && hasPromptImageInput(optionsLocal)) {
			assertSteeringActive();
			try {
				await cancelPendingUserInput("image-reply");
			} catch (error) {
				embeddedAgentLog.warn("failed to cancel codex gateway question before image steering", { error });
			}
		}
		try {
			await activeSteeringQueue.queue(text, optionsLocal);
		} catch (error) {
			if (error instanceof CodexSteeringAcceptedUnconfirmedError) return {
				transcriptCommit: "unconfirmed",
				errorMessage: formatErrorMessage(error)
			};
			throw error;
		}
	};
	const handle = {
		kind: "embedded",
		runId: params.runId,
		startedAtMs: params.startedAtMs,
		toolAuthorityFingerprint: params.toolAuthorityFingerprint,
		permissionChangeOwner: params.permissionChange?.owner,
		applyPermissionMode: async (mode, revokeApprovals) => {
			if (!params.permissionChange || terminalState.terminalOutcomeFrozen || params.abortSignal?.aborted || !state.permissionChangeRestart && (state.completed || runAbortController.signal.aborted)) return false;
			const applied = params.permissionChange.request(mode);
			state.permissionChangeRestart ??= "requested";
			runAbortController.abort("permission-change");
			revokeApprovals();
			return await applied;
		},
		claimPendingUserInputAnswer,
		cancelPendingUserInput,
		queueMessage,
		messageInjection: {
			isAvailable: () => !state.completed && !state.terminalTurnNotificationQueued && !runAbortController.signal.aborted,
			queueMessage
		},
		isStreaming: () => !state.completed && !runAbortController.signal.aborted,
		isAborted: () => runAbortController.signal.aborted,
		isStopped: () => state.completed || runAbortController.signal.aborted,
		ownsLiveness: () => deadlines.ownsExecutionWait() && resourceState.turnRoute?.signal.aborted === false && !state.completed && !state.terminalTurnNotificationQueued && state.activeAppServerTurnRequests === 0 && state.activeLocalProjections === 0,
		isAbortable: () => !terminalState.terminalOutcomeFrozen || terminalState.sharedAbortAllowedAfterTerminalOutcome,
		isCompacting: () => projectorRef.current?.isCompacting() ?? false,
		supportsTranscriptCommitWait: true,
		supportsQueueMessageImages: params.model.input.includes("image"),
		sourceReplyDeliveryMode: params.sourceReplyDeliveryMode,
		taskSuggestionDeliveryMode: params.taskSuggestionDeliveryMode,
		cancel: () => abortExplicitly("cancelled"),
		abort: () => abortExplicitly("aborted")
	};
	params.replyOperation?.attachBackend(handle);
	setActiveEmbeddedRun(params.sessionId, handle, params.sessionKey, params.sessionFile);
	const freezeRunTerminalOutcome = () => {
		if (terminalState.terminalOutcomeFrozen) return;
		terminalState.terminalOutcomeFrozen = true;
		params.abortSignal?.removeEventListener("abort", abortFromUpstream);
	};
	if (!runAbortController.signal.aborted && params.permissionChange && !params.permissionChange.applied()) {
		state.permissionChangeRestart = "requested";
		runAbortController.abort("permission-change");
	}
	return {
		activeTurnId,
		activeProjector,
		streamState,
		handle,
		freezeRunTerminalOutcome,
		notifyUserMessagePersisted,
		promptMirrorSettled,
		abortListener,
		ready: bindProjection()
	};
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-cleanup.ts
async function cleanupCodexAttempt(resources, turnRuntime, lifecycle, requestRuntime, activeTurn) {
	const { prompt, state: resourceState, trajectoryRecorder, releaseCurrentRoute, releaseSharedClientLeaseAndRetireOneShotClient, releaseSandboxExecEnvironment, runCleanupStep } = resources;
	const { connection } = prompt.context.runtime;
	const { params, options, runAbortController, terminalState, bindingStore, bindingIdentity } = connection;
	const { state, steeringQueueRef, userInputBridgeRef, deadlines } = turnRuntime;
	const { maybeEmitFastModeAutoResetBestEffort, emitLifecycleTerminal, buildLifecycleTerminalMeta } = lifecycle;
	const { codexModelCallDiagnostics } = requestRuntime;
	const { activeTurnId, abortListener, handle, freezeRunTerminalOutcome } = activeTurn;
	prompt.context.attemptTools.scheduledAppAuthoritySourceRef.current = void 0;
	freezeRunTerminalOutcome();
	const projectionClose = state.projectionClosed ? void 0 : activeTurn.activeProjector.closeProjection();
	state.projectionClosed = true;
	const checkpointCleanup = projectionClose ? runCleanupStep("codex-transcript-checkpoint", () => projectionClose) : void 0;
	await state.abortCleanup.catch(() => void 0);
	try {
		steeringQueueRef.current?.cancel();
		if (params.isFinalFallbackAttempt !== false) await maybeEmitFastModeAutoResetBestEffort();
		codexModelCallDiagnostics.emitError("codex app-server run completed without model-call terminal event");
		emitLifecycleTerminal({
			phase: "error",
			error: "codex app-server run completed without lifecycle terminal event",
			...buildLifecycleTerminalMeta({
				aborted: runAbortController.signal.aborted && !state.clientClosedAbort,
				timedOut: state.timeout !== void 0
			})
		});
		if (trajectoryRecorder && !resourceState.trajectoryEndRecorded) trajectoryRecorder.recordEvent("session.ended", {
			status: state.timeout || runAbortController.signal.aborted && !state.clientClosedAbort ? "interrupted" : "cleanup",
			threadId: resourceState.thread.threadId,
			turnId: activeTurnId,
			timedOut: state.timeout !== void 0,
			aborted: runAbortController.signal.aborted && !state.clientClosedAbort
		});
		await runCleanupStep("codex-trajectory-flush", () => trajectoryRecorder?.flush());
		const retainLiveIncognitoThread = (terminalState.turnSucceeded || state.permissionChangeRestart === "confirmed" && !params.abortSignal?.aborted) && isIncognitoSessionKey(params.sessionKey);
		const retainLiveThread = ((retainLiveIncognitoThread && resourceState.thread.liveThreadEphemeralPolicy !== void 0 || terminalState.turnSucceeded && !isIncognitoSessionKey(params.sessionKey) && params.cleanupBundleMcpOnRunEnd !== true && resourceState.thread.liveThreadConfigFingerprint !== void 0 && resourceState.thread.preserveNativeModel !== true && resourceState.thread.connectionScope !== "supervision" && !resourceState.thread.ringZeroConfigFingerprint) && resourceState.thread.clientId === resolveCodexAppServerClientInstanceId(resourceState.client) ? (await bindingStore.read(bindingIdentity))?.threadId === resourceState.thread.threadId && await bindingStore.withLease(bindingIdentity, async () => {
			if ((await bindingStore.read(bindingIdentity))?.threadId !== resourceState.thread.threadId) return false;
			return await retainCodexAppServerBindingSubscription(resourceState.client, resourceState.thread.threadId, {
				release: resourceState.thread.liveThreadOwnership?.release,
				configFingerprint: resourceState.thread.liveThreadConfigFingerprint,
				serviceTier: connection.mutable.pluginAppServer.serviceTier,
				ephemeralPolicy: resourceState.thread.liveThreadEphemeralPolicy
			});
		}) : false) || retainLiveIncognitoThread && resourceState.thread.liveThreadEphemeralPolicy === void 0;
		const bindingReleased = isIncognitoSessionKey(params.sessionKey) && !retainLiveThread ? await bindingStore.mutate(bindingIdentity, {
			kind: "clear",
			threadId: resourceState.thread.threadId
		}) : true;
		if (!retainLiveThread) {
			if (bindingReleased) {
				if (!await unsubscribeCodexThreadBestEffort(resourceState.client, {
					threadId: resourceState.thread.threadId,
					timeoutMs: 5e3
				})) await closeCodexStartupClientBestEffort(resourceState.client);
			}
		}
	} finally {
		await runCleanupStep("codex-user-input-cancel", () => userInputBridgeRef.current?.cancelPending());
		await runCleanupStep("codex-turn-deadline-clear", () => deadlines.dispose());
		await runCleanupStep("codex-dynamic-tool-cleanup", async () => {
			const cleanupReason = terminalState.turnSucceeded ? "completion" : state.timeout ? "timeout" : runAbortController.signal.aborted ? "cancel" : "error";
			const cleanups = prompt.context.attemptTools.runCleanups.splice(0);
			await Promise.allSettled(cleanups.map(async (cleanup) => await cleanup(cleanupReason)));
		});
		await runCleanupStep("codex-route-release", releaseCurrentRoute);
		await checkpointCleanup;
		await runCleanupStep("codex-shared-client-release", releaseSharedClientLeaseAndRetireOneShotClient);
		const nativeHookRelay = resourceState.nativeHookRelay;
		resourceState.nativeHookRelay = void 0;
		await runCleanupStep("codex-native-hook-relay-release", () => {
			if (!nativeHookRelay) return;
			if (state.shouldDelayNativeHookRelayUnregister) scheduleCodexNativeHookRelayUnregister({
				relay: nativeHookRelay,
				hookTimeoutSec: options.nativeHookRelay?.hookTimeoutSec
			});
			else nativeHookRelay.unregister();
		});
		await runCleanupStep("codex-sandbox-release", releaseSandboxExecEnvironment);
		await runCleanupStep("codex-scoped-mcp-dispose", () => prompt.context.attemptTools.scopedMcpTools?.dispose());
		await runCleanupStep("codex-configured-mcp-dispose", () => prompt.context.attemptTools.configuredMcp?.dispose());
		await runCleanupStep("codex-abort-listener-remove", () => {
			runAbortController.signal.removeEventListener("abort", abortListener);
		});
		await runCleanupStep("codex-steering-cancel", () => steeringQueueRef.current?.cancel());
		await runCleanupStep("codex-reply-backend-detach", () => params.replyOperation?.detachBackend(handle));
		await runCleanupStep("codex-active-run-clear", () => {
			clearActiveEmbeddedRun(params.sessionId, handle, params.sessionKey, params.sessionFile);
		});
	}
	await state.abortCleanup;
}
//#endregion
//#region extensions/codex/src/app-server/workspace-dir-cache.ts
/** Process-local cache of Codex workspaces already created by the run loop. */
const codexWorkspaceDirCache = /* @__PURE__ */ new Set();
//#endregion
//#region extensions/codex/src/app-server/run-attempt-lifecycle.ts
const CODEX_APP_SERVER_PROJECTED_CHARS_PER_TOKEN = 4;
function shouldKeepCodexSharedAbortOpen(params) {
	const terminal = attemptTerminal.project(params.result.terminal);
	if (params.explicitCancellationObserved || terminal.aborted || terminal.externalAbort) return false;
	return params.trigger === "memory" || !params.attemptSucceeded;
}
function withCodexAppServerFastModeServiceTier(appServer, params) {
	const fastMode = typeof params.fastMode === "function" ? params.fastMode() : params.fastMode;
	const serviceTier = fastMode === void 0 ? appServer.serviceTier : fastMode ? "priority" : void 0;
	if (serviceTier === appServer.serviceTier) return appServer;
	if (serviceTier) return {
		...appServer,
		serviceTier
	};
	return {
		...appServer,
		serviceTier: null
	};
}
function estimateCodexAppServerProjectedTurnTokens(params) {
	const inputChars = params.prompt.length + (params.developerInstructions?.length ?? 0);
	return Math.max(1, Math.ceil(inputChars / CODEX_APP_SERVER_PROJECTED_CHARS_PER_TOKEN));
}
async function ensureCodexWorkspaceDirOnce(workspaceDir) {
	const normalized = path.resolve(workspaceDir);
	if (codexWorkspaceDirCache.has(normalized)) return;
	await fs.mkdir(normalized, { recursive: true });
	codexWorkspaceDirCache.add(normalized);
}
async function emitCodexAppServerEvent(params, event) {
	try {
		emitAgentEvent({
			runId: params.runId,
			stream: event.stream,
			data: event.data,
			...params.sessionKey ? { sessionKey: params.sessionKey } : {}
		});
	} catch (error) {
		embeddedAgentLog.debug("codex app-server global agent event emit failed", { error });
	}
	try {
		await params.onAgentEvent?.(event);
	} catch (error) {
		embeddedAgentLog.debug("codex app-server agent event handler threw", { error });
	}
}
async function runCodexAgentEndHook(params, hookParams) {
	const sideEffectParams = {
		...hookParams,
		ctx: {
			...hookParams.ctx,
			config: params.config
		}
	};
	if (!params.messageChannel && !params.messageProvider) {
		await awaitAgentEndSideEffects(sideEffectParams);
		return;
	}
	runAgentEndSideEffects(sideEffectParams);
}
//#endregion
//#region extensions/codex/src/app-server/startup-binding.ts
const CODEX_APP_SERVER_NATIVE_THREAD_FALLBACK_MAX_TOKENS = 3e5;
const CODEX_APP_SERVER_NATIVE_THREAD_DEFAULT_RESERVE_TOKENS = 2e4;
const CODEX_APP_SERVER_NATIVE_THREAD_MIN_PROMPT_BUDGET_TOKENS = 8e3;
const CODEX_APP_SERVER_NATIVE_THREAD_MIN_PROMPT_BUDGET_RATIO = .5;
const CODEX_APP_SERVER_ROLLOUT_TAIL_READ_BYTES = 65536;
const CODEX_APP_SERVER_BYTE_UNITS = {
	b: 1,
	k: 1024,
	kb: 1024,
	kib: 1024,
	m: 1048576,
	mb: 1048576,
	mib: 1048576,
	g: 1073741824,
	gb: 1073741824,
	gib: 1073741824,
	t: 1099511627776,
	tb: 1099511627776,
	tib: 1099511627776
};
const codexSessionRecordCache = /* @__PURE__ */ new Map();
function parseCodexAppServerByteLimit(value) {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
	if (typeof value !== "string") return;
	const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/i);
	if (!match) return;
	const amount = Number(match[1]);
	if (!Number.isFinite(amount) || amount <= 0) return;
	const unit = (match[2] ?? "b").toLowerCase();
	const multiplier = CODEX_APP_SERVER_BYTE_UNITS[unit];
	if (multiplier === void 0) return;
	return Math.max(1, Math.round(amount * multiplier));
}
async function listCodexAppServerRolloutFilesForThread(agentDir, threadId, codexHome, rolloutPath) {
	const resolvedAgentDir = path.resolve(agentDir);
	const resolvedCodexHome = codexHome?.trim() ? path.resolve(codexHome) : resolveCodexAppServerHomeDir(resolvedAgentDir);
	const roots = [
		path.join(resolvedCodexHome, "sessions"),
		path.join(resolveCodexAppServerHomeDir(resolvedAgentDir), "sessions"),
		path.join(resolvedAgentDir, "agent", "codex-home", "sessions"),
		path.join(path.dirname(resolvedAgentDir), "codex-home", "sessions")
	];
	const rolloutRoot = rolloutPath ? roots.find((root) => isPathStrictlyInside(root, rolloutPath)) : void 0;
	if (rolloutPath && rolloutRoot && path.isAbsolute(rolloutPath) && path.extname(rolloutPath) === ".jsonl" && path.basename(rolloutPath).includes(threadId)) try {
		const opened = await (await root(rolloutRoot, {
			hardlinks: "reject",
			maxBytes: Number.MAX_SAFE_INTEGER,
			symlinks: "reject"
		})).open(path.relative(rolloutRoot, rolloutPath));
		return [{
			path: opened.realPath,
			bytes: opened.stat.size,
			handle: opened.handle
		}];
	} catch {}
	const files = [];
	const visited = /* @__PURE__ */ new Set();
	for (const root of roots) {
		if (visited.has(root)) continue;
		visited.add(root);
		const stack = [root];
		while (stack.length > 0) {
			const dir = stack.pop();
			if (!dir) continue;
			let entries;
			try {
				entries = await fs.readdir(dir, { withFileTypes: true });
			} catch {
				continue;
			}
			for (const entry of entries) {
				const file = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					stack.push(file);
					continue;
				}
				if (!entry.isFile() || !entry.name.endsWith(".jsonl") || !entry.name.includes(threadId)) continue;
				try {
					files.push({
						path: file,
						bytes: (await fs.stat(file)).size
					});
				} catch {}
			}
		}
	}
	return files;
}
async function readCodexSessionRecordForSessionFile(sessionFile) {
	if (isSqliteSessionFileMarker(sessionFile)) return;
	const sessionsFile = path.join(path.dirname(sessionFile), "sessions.json");
	const resolvedSessionFile = path.resolve(sessionFile);
	let stat;
	try {
		stat = await fs.stat(sessionsFile);
	} catch {
		codexSessionRecordCache.delete(resolvedSessionFile);
		return;
	}
	const cached = codexSessionRecordCache.get(resolvedSessionFile);
	if (cached?.sessionsFile === sessionsFile && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.record;
	let store;
	try {
		store = JSON.parse(await fs.readFile(sessionsFile, "utf8"));
	} catch {
		codexSessionRecordCache.delete(resolvedSessionFile);
		return;
	}
	if (!isJsonObject(store)) {
		codexSessionRecordCache.delete(resolvedSessionFile);
		return;
	}
	let found;
	for (const [sessionKey, record] of Object.entries(store)) {
		if (!isJsonObject(record) || typeof record.sessionFile !== "string") continue;
		if (path.resolve(record.sessionFile) !== resolvedSessionFile) continue;
		found = {
			sessionKey,
			...record
		};
		break;
	}
	codexSessionRecordCache.set(resolvedSessionFile, {
		sessionsFile,
		mtimeMs: stat.mtimeMs,
		size: stat.size,
		record: found
	});
	return found;
}
function isSqliteSessionFileMarker(sessionFile) {
	return parseSqliteSessionFileMarker(sessionFile) !== void 0;
}
async function readCodexAppServerRolloutTokenSnapshot(file, openedHandle) {
	let handle = openedHandle;
	if (!handle) try {
		handle = await fs.open(file, "r");
	} catch {
		return;
	}
	let snapshot;
	try {
		let position = (await handle.stat()).size;
		const partialLineFragments = [];
		const applySnapshotLine = (line) => {
			const lineSnapshot = readCodexAppServerRolloutTokenSnapshotLine(line);
			if (lineSnapshot === void 0) return false;
			snapshot ??= {};
			snapshot.totalTokens ??= lineSnapshot.totalTokens;
			snapshot.modelContextWindow ??= lineSnapshot.modelContextWindow;
			return snapshot.totalTokens !== void 0 && snapshot.modelContextWindow !== void 0;
		};
		while (position > 0) {
			const bytesToRead = Math.min(position, CODEX_APP_SERVER_ROLLOUT_TAIL_READ_BYTES);
			const nextPosition = position - bytesToRead;
			const chunk = Buffer.allocUnsafe(bytesToRead);
			let bytesRead = 0;
			while (bytesRead < bytesToRead) {
				const result = await handle.read(chunk, bytesRead, bytesToRead - bytesRead, nextPosition + bytesRead);
				if (result.bytesRead === 0) return snapshot;
				bytesRead += result.bytesRead;
			}
			let lineEnd = bytesRead;
			for (let index = bytesRead - 1; index >= 0; index -= 1) {
				if (chunk[index] !== 10) continue;
				const lineFragment = chunk.subarray(index + 1, lineEnd);
				const line = partialLineFragments.length === 0 ? lineFragment.toString("utf8") : Buffer.concat([lineFragment, ...partialLineFragments.toReversed()]).toString("utf8");
				partialLineFragments.length = 0;
				if (applySnapshotLine(line)) return snapshot;
				lineEnd = index;
			}
			if (lineEnd > 0) partialLineFragments.push(chunk.subarray(0, lineEnd));
			position = nextPosition;
		}
		if (partialLineFragments.length > 0) applySnapshotLine(Buffer.concat(partialLineFragments.toReversed()).toString("utf8"));
	} finally {
		await handle.close();
	}
	return snapshot;
}
function readCodexAppServerRolloutTokenSnapshotLine(line) {
	if (!line.trim()) return;
	try {
		const parsed = JSON.parse(line);
		const payload = isJsonObject(parsed) ? parsed.payload : void 0;
		const info = isJsonObject(payload) && payload.type === "token_count" && isJsonObject(payload.info) ? payload.info : void 0;
		if (!info) return;
		const usage = isJsonObject(info.last_token_usage) ? info.last_token_usage : isJsonObject(info.total_token_usage) ? info.total_token_usage : void 0;
		const value = usage?.total_tokens ?? usage?.totalTokens;
		const totalTokens = typeof value === "number" && Number.isFinite(value) ? value : void 0;
		const windowValue = info.model_context_window ?? info.modelContextWindow;
		const modelContextWindow = typeof windowValue === "number" && Number.isFinite(windowValue) && windowValue > 0 ? Math.floor(windowValue) : void 0;
		const snapshot = {};
		if (totalTokens !== void 0) snapshot.totalTokens = totalTokens;
		if (modelContextWindow !== void 0) snapshot.modelContextWindow = modelContextWindow;
		return snapshot.totalTokens !== void 0 || snapshot.modelContextWindow !== void 0 ? snapshot : void 0;
	} catch {
		return;
	}
}
function readCompactionConfig(config) {
	return isJsonObject(config?.agents?.defaults?.compaction) ? config.agents.defaults.compaction : void 0;
}
function resolveCodexAppServerNativeThreadReserveTokens(_config) {
	return CODEX_APP_SERVER_NATIVE_THREAD_DEFAULT_RESERVE_TOKENS;
}
function resolveCodexAppServerNativeThreadTokenFuse(params) {
	const projectedTurnTokens = typeof params.projectedTurnTokens === "number" && Number.isFinite(params.projectedTurnTokens) && params.projectedTurnTokens > 0 ? Math.floor(params.projectedTurnTokens) : 0;
	const contextWindow = params.modelContextWindow ?? CODEX_APP_SERVER_NATIVE_THREAD_FALLBACK_MAX_TOKENS;
	const minPromptBudget = Math.min(CODEX_APP_SERVER_NATIVE_THREAD_MIN_PROMPT_BUDGET_TOKENS, Math.max(1, Math.floor(contextWindow * CODEX_APP_SERVER_NATIVE_THREAD_MIN_PROMPT_BUDGET_RATIO)));
	const effectiveReserveTokens = Math.min(params.reserveTokens, Math.max(0, contextWindow - minPromptBudget));
	return Math.max(1, contextWindow - effectiveReserveTokens - projectedTurnTokens);
}
function maxFiniteNumber(values) {
	const nums = values.filter((value) => typeof value === "number" && Number.isFinite(value));
	if (nums.length === 0) return;
	return Math.max(...nums);
}
function minFiniteNumber(values) {
	const nums = values.filter((value) => typeof value === "number" && Number.isFinite(value));
	if (nums.length === 0) return;
	return Math.min(...nums);
}
function hasContextEngineThreadBootstrapProjection(binding) {
	return binding.contextEngine?.projection?.mode === "thread_bootstrap";
}
/** Clears and drops a binding when the native Codex thread is too large to resume safely. */
async function rotateOversizedCodexAppServerStartupBinding(params) {
	const binding = params.binding;
	if (!binding?.threadId) return { binding };
	if (binding.connectionScope === "supervision") return { binding };
	const sessionRecord = await readCodexSessionRecordForSessionFile(params.sessionFile);
	const rolloutFiles = await listCodexAppServerRolloutFilesForThread(params.agentDir, binding.threadId, params.codexHome, binding.rolloutPath);
	const maxBytes = parseCodexAppServerByteLimit(readCompactionConfig(params.config)?.maxActiveTranscriptBytes) ?? resolveCodexDeepSeekTranscriptByteLimit(binding); // v-codex-ds-window-v2
	if (maxBytes !== void 0 && params.contextEngineActive === true && hasContextEngineThreadBootstrapProjection(binding)) embeddedAgentLog.debug("codex app-server deferring native transcript byte guard for context-engine thread bootstrap", {
		threadId: binding.threadId,
		engineId: binding.contextEngine?.engineId,
		epoch: binding.contextEngine?.projection?.epoch,
		fingerprint: binding.contextEngine?.projection?.fingerprint
	});
	else if (maxBytes !== void 0) {
		const oversizedFiles = rolloutFiles.filter((file) => file.bytes >= maxBytes);
		if (oversizedFiles.length > 0) {
			await Promise.all(rolloutFiles.map(async (file) => {
				await file.handle?.close();
			}));
			embeddedAgentLog.warn("codex app-server native transcript exceeded active byte limit; starting a fresh thread", {
				threadId: binding.threadId,
				maxBytes,
				files: oversizedFiles.map((file) => ({
					path: file.path,
					bytes: file.bytes
				}))
			});
			await params.bindingStore.mutate(params.identity, {
				kind: "clear",
				threadId: binding.threadId
			});
			return { binding: void 0 };
		}
	}
	const nativeTokenSnapshots = await Promise.all(rolloutFiles.map(async (file) => readCodexAppServerRolloutTokenSnapshot(file.path, file.handle)));
	const nativeTokens = maxFiniteNumber(nativeTokenSnapshots.map((snapshot) => snapshot?.totalTokens));
	const nativeModelContextWindow = maxFiniteNumber(nativeTokenSnapshots.map((snapshot) => snapshot?.modelContextWindow));
	const sessionModelContextWindow = typeof sessionRecord?.contextTokens === "number" && Number.isFinite(sessionRecord.contextTokens) && sessionRecord.contextTokens > 0 ? Math.floor(sessionRecord.contextTokens) : void 0;
	const reserveTokens = resolveCodexAppServerNativeThreadReserveTokens(params.config);
	const maxTokens = resolveCodexAppServerNativeThreadTokenFuse({
		modelContextWindow: minFiniteNumber([nativeModelContextWindow, sessionModelContextWindow]),
		reserveTokens,
		projectedTurnTokens: params.projectedTurnTokens
	});
	const sessionTokens = sessionRecord?.totalTokensFresh === true && sessionRecord.totalTokensVersion === 1 && typeof sessionRecord?.totalTokens === "number" && Number.isFinite(sessionRecord.totalTokens) ? sessionRecord.totalTokens : void 0;
	const tokenCount = maxFiniteNumber([sessionTokens, nativeTokens]);
	// v-codex-firsttext-v2: Codex compacts an oversized DeepSeek thread itself; a fresh one would replay the whole transcript.
	const codexDeepSeekThread = String(binding.modelProvider ?? "").trim().toLowerCase() === "deepseek" || /deepseek/iu.test(String(binding.model ?? ""));
	if (tokenCount !== void 0 && tokenCount >= maxTokens && codexDeepSeekThread) embeddedAgentLog.info("codex app-server keeping oversized DeepSeek thread for native compaction", {
		threadId: binding.threadId,
		maxTokens,
		nativeTokens,
		sessionTokens
	});
	if (tokenCount !== void 0 && tokenCount >= maxTokens && !codexDeepSeekThread) {
		embeddedAgentLog.warn("codex app-server native transcript exceeded active token limit; starting a fresh thread", {
			threadId: binding.threadId,
			maxTokens,
			sessionKey: sessionRecord?.sessionKey,
			sessionTokens,
			nativeTokens,
			nativeModelContextWindow,
			sessionModelContextWindow,
			reserveTokens,
			projectedTurnTokens: params.projectedTurnTokens
		});
		await params.bindingStore.mutate(params.identity, {
			kind: "clear",
			threadId: binding.threadId
		});
		return { binding: void 0 };
	}
	const startupContextTokens = nativeModelContextWindow ?? sessionModelContextWindow;
	return {
		binding,
		...startupContextTokens ? { startupContextTokens } : {}
	};
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-connection.ts
async function prepareCodexAttemptConnection({ params, options }) {
	const attemptStartedAt = Date.now();
	const profilerEnabled = isCodexAppServerProfilerEnabled(params.config);
	const codexModelCallTrace = freezeDiagnosticTraceContext(createDiagnosticTraceContextFromActiveScope());
	const codexModelContentCapture = resolveDiagnosticModelContentCapturePolicy(params.config);
	const codexModelCallId = `${params.runId}:codex-model:1`;
	const fastModeAutoStartedAtMs = typeof params.fastModeStartedAtMs === "number" && Number.isFinite(params.fastModeStartedAtMs) ? params.fastModeStartedAtMs : void 0;
	const fastModeAutoProgressState = params.fastModeAutoProgressState ?? {
		offAnnounced: false,
		resetAnnounced: false
	};
	const preDynamicStartupStages = createCodexDynamicToolBuildStageTracker({ enabled: profilerEnabled });
	const runtimeArtifactRequest = params.captureRuntimeArtifact || params.expectedRuntimeArtifact ? params.expectedRuntimeArtifact ? { expected: params.expectedRuntimeArtifact } : {} : void 0;
	const pluginConfig = readCodexPluginConfig(options.pluginConfig);
	const requirementsToml = readCodexRequirementsToml({});
	const computerUseConfig = resolveCodexComputerUseConfig({ pluginConfig });
	const { sessionAgentId } = resolveSessionAgentIdsStrict({
		sessionKey: params.sessionKey,
		config: params.config,
		agentId: params.agentId
	});
	const policyAgentId = params.sandboxAgentId ?? sessionAgentId;
	preDynamicStartupStages.mark("config");
	const resolvedWorkspace = resolveUserPath(params.workspaceDir);
	await ensureCodexWorkspaceDirOnce(resolvedWorkspace);
	preDynamicStartupStages.mark("workspace");
	const sandboxSessionKey = params.sandboxSessionKey?.trim() || params.sessionKey?.trim() || params.sessionId;
	const contextSessionKey = params.sessionKey?.trim() || sandboxSessionKey;
	const sandbox = params.sandbox !== void 0 ? params.sandbox : await resolveSandboxContext({
		config: params.config,
		agentId: params.sandboxAgentId,
		sessionKey: sandboxSessionKey,
		workspaceDir: resolvedWorkspace
	});
	const attemptClientFactory = options.clientFactory ?? (isCodexPairedNodeRemoteExecPlacementSandbox(sandbox) ? createIsolatedCodexAppServerClient : getLeasedSharedCodexAppServerClient);
	preDynamicStartupStages.mark("sandbox");
	const execPolicy = resolveOpenClawExecPolicyForCodexAppServer({
		permissionMode: params.permissionMode,
		execOverrides: params.execOverrides,
		approvals: params.permissionMode === "full" ? void 0 : loadExecApprovals(),
		config: params.config,
		agentId: policyAgentId
	});
	const agentDir = params.agentDir ?? resolveAgentDir$1(params.config ?? {}, sessionAgentId);
	const preparedEnvironment = params.hostCapabilities.preparedEnvironment?.();
	const remoteExec = isCodexRemoteExecPlacementSandbox(sandbox);
	const assertLocalTargetSupported = (unsupported) => {
		if (preparedEnvironment?.localProcessEnv && unsupported) throw new Error("This runtime cannot target the diagnosed local installation. Use the saved prompt with a suggested external or manual handoff on this machine.");
	};
	assertLocalTargetSupported(sandbox?.enabled === true || remoteExec);
	const preparedShellEnvironment = preparedEnvironment ? {
		...preparedEnvironment.credentialScrubEnv,
		...sandbox?.enabled || remoteExec ? void 0 : preparedEnvironment.localIdentityEnv,
		...preparedEnvironment.localProcessEnv
	} : void 0;
	const shellEnvironment = preparedShellEnvironment && Object.keys(preparedShellEnvironment).length > 0 ? preparedShellEnvironment : void 0;
	const disableLoginShell = remoteExec || preparedEnvironment?.localProcessEnv !== void 0 || preparedEnvironment?.managedLocalIdentity === true || preparedEnvironment !== void 0 && Object.keys(preparedEnvironment.credentialScrubEnv).length > 0;
	const withPreparedProcessEnv = (appServer) => {
		assertLocalTargetSupported(appServer.start.transport === "websocket" || Boolean(appServer.remoteWorkspaceRoot));
		return shellEnvironment ? {
			...appServer,
			start: {
				...appServer.start,
				env: {
					...appServer.start.env,
					...shellEnvironment
				}
			}
		} : appServer;
	};
	let bindingIdentity = sessionBindingIdentity({
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		agentId: params.agentId,
		config: params.config
	});
	let bindingStore = options.bindingStore;
	preDynamicStartupStages.mark("session-agent");
	let activeContextEngine = isActiveHarnessContextEngine(params.contextEngine) ? params.contextEngine : void 0;
	const isInactiveThreadBootstrapBinding = (binding) => !activeContextEngine && binding?.contextEngine?.projection?.mode === "thread_bootstrap";
	if (bindingIdentity.kind === "session" && bindingIdentity.sessionKey) {
		const authority = resolveCodexRunSessionBindingAuthority({
			identity: bindingIdentity,
			config: params.config,
			storePath: params.sessionTarget?.storePath
		});
		if (authority === "superseded") throw createCodexSessionGenerationSupersededError(bindingIdentity.sessionId);
		if (authority === "ephemeral") {
			const logicalIdentity = bindingIdentity;
			const physicalIdentity = {
				kind: "session",
				agentId: bindingIdentity.agentId,
				sessionId: bindingIdentity.sessionId
			};
			bindingStore = scopeCodexRunBindingStore({
				bindingStore,
				logicalIdentity,
				physicalIdentity
			});
			bindingIdentity = physicalIdentity;
		}
	}
	let startupBinding = await bindingStore.read(bindingIdentity);
	if (!startupBinding && bindingIdentity.kind === "session" && bindingIdentity.sessionKey) {
		if (!await reclaimCurrentCodexSessionGeneration({
			bindingStore,
			identity: bindingIdentity,
			config: params.config,
			storePath: params.sessionTarget?.storePath
		})) throw createCodexSessionGenerationSupersededError(bindingIdentity.sessionId);
		startupBinding = await bindingStore.read(bindingIdentity);
	}
	preDynamicStartupStages.mark("read-binding");
	const usesSupervisionConnection = startupBinding?.connectionScope === "supervision";
	if (usesSupervisionConnection) activeContextEngine = void 0;
	if (usesSupervisionConnection && pluginConfig.supervision?.enabled !== true) throw new Error("Codex supervision is disabled; refusing to open a native user-home supervised session");
	const resolveRuntimeOptionsForBinding = (binding, selection) => resolveCodexBindingAppServerConnection({
		binding,
		pluginConfig,
		execPolicy,
		modelProvider: selection.modelProvider,
		model: selection.model,
		config: params.config,
		agentDir,
		requirementsToml,
		openClawSandboxActive: sandbox?.enabled === true,
		sessionPermissionMode: params.permissionMode
	}).appServer;
	const initialStartupBindingHadInactiveThreadBootstrap = isInactiveThreadBootstrapBinding(startupBinding);
	const appServerHomeScope = resolveCodexAppServerHomeScope({ appServer: pluginConfig.appServer });
	const preparedAuthRoute = usesSupervisionConnection ? void 0 : params.runtimePlan?.auth.modelRoute;
	const startupAuthProfileCandidate = usesSupervisionConnection ? void 0 : preparedAuthRoute ? params.runtimePlan?.auth.forwardedAuthProfileId : params.runtimePlan?.auth.forwardedAuthProfileId ?? params.authProfileId ?? (codexBindingSharesProviderFamily(startupBinding, params.provider) ? startupBinding?.authProfileId : void 0);
	const resolvedStartupAuthProfileId = usesSupervisionConnection ? void 0 : preparedAuthRoute ? startupAuthProfileCandidate : params.authProfileStore ? resolveCodexAppServerAuthProfileId({
		authProfileId: startupAuthProfileCandidate,
		store: params.authProfileStore,
		config: params.config
	}) : resolveCodexAppServerAuthProfileIdForAgent({
		authProfileId: startupAuthProfileCandidate,
		agentDir,
		config: params.config
	});
	const { authProfileId: startupAuthProfileId, nativeAuthProfile, preparedAuth: startupPreparedAuth } = usesSupervisionConnection ? {
		authProfileId: void 0,
		nativeAuthProfile: true,
		preparedAuth: void 0
	} : await resolveCodexAppServerPreparedAuthHandoff({
		authRequirement: preparedAuthRoute?.authRequirement,
		resolvedApiKey: params.resolvedApiKey,
		authProfileId: resolvedStartupAuthProfileId,
		authProfileStore: params.authProfileStore,
		agentDir,
		homeScope: appServerHomeScope,
		requirePreparedAuth: isCodexRemoteExecPlacementSandbox(sandbox),
		config: params.config,
		subscriptionProfileRequiredError: "Prepared Codex subscription route requires a forwarded OpenAI OAuth or token profile.",
		subscriptionProfileUnusableError: "Prepared Codex subscription auth profile is unusable."
	});
	const startupClientAuthProfileId = usesSupervisionConnection || appServerHomeScope === "user" || startupPreparedAuth?.kind === "api-key" ? null : startupAuthProfileId;
	const resolveReviewerPolicyContext = (binding) => {
		const nativeModelOwned = binding?.preserveNativeModel === true;
		return resolveCodexModelBackedReviewerPolicyContext({
			provider: nativeModelOwned ? "codex" : params.provider,
			model: nativeModelOwned ? binding.model : params.modelId,
			bindingModelProvider: binding?.modelProvider,
			bindingModel: binding?.model,
			nativeAuthProfile
		});
	};
	let reviewerPolicyContext = resolveReviewerPolicyContext(startupBinding);
	preDynamicStartupStages.mark("auth-profile");
	let configuredAppServer = resolveRuntimeOptionsForBinding(startupBinding, {
		modelProvider: reviewerPolicyContext.modelProvider,
		model: reviewerPolicyContext.model
	});
	const effectiveWorkspace = sandbox?.enabled ? sandbox.workspaceAccess === "rw" ? resolvedWorkspace : sandbox.workspaceDir : resolvedWorkspace;
	const requestedCwd = params.cwd ? resolveUserPath(params.cwd) : void 0;
	if (sandbox?.enabled && requestedCwd && requestedCwd !== resolvedWorkspace) throw new Error("cwd override is not supported for sandboxed Codex app-server runs; omit cwd or use the agent workspace as cwd");
	const sessionPermissionCwd = resolveCodexSessionPermissionCwd({
		permissionMode: params.permissionMode,
		sessionRoot: params.sessionRoot,
		defaultRoot: effectiveWorkspace,
		requestedCwd,
		fallbackCwd: effectiveWorkspace
	});
	const effectiveCwd = sandbox?.enabled ? effectiveWorkspace : sessionPermissionCwd;
	if (effectiveWorkspace !== resolvedWorkspace) await ensureCodexWorkspaceDirOnce(effectiveWorkspace);
	preDynamicStartupStages.mark("effective-workspace");
	const applySessionPermissionPolicy = (appServer, selection) => applyCodexSessionPermissionPolicy({
		appServer,
		permissionMode: params.permissionMode,
		sessionRoot: params.sessionRoot,
		defaultRoot: effectiveWorkspace,
		pluginConfig,
		canUseAutoReview: canUseCodexModelBackedApprovalsReviewerForModel({
			modelProvider: selection.modelProvider,
			model: selection.model,
			config: params.config,
			env: {
				...process.env,
				...appServer.start.env,
				...shellEnvironment
			},
			agentDir,
			homeScope: appServer.start.homeScope,
			codexArgs: appServer.start.args
		}),
		requirementsToml,
		policyLocked: startupBinding?.connectionScope === "supervision",
		execMode: execPolicy.mode
	});
	const resolveFinalAppServer = (configured, selection) => {
		const session = applySessionPermissionPolicy(configured, selection);
		const trusted = resolveCodexAppServerForModelProvider({
			appServer: session,
			provider: selection.modelProvider,
			model: selection.model,
			config: params.config,
			env: {
				...process.env,
				...session.start.env,
				...shellEnvironment
			},
			agentDir
		});
		return {
			session,
			appServer: withPreparedProcessEnv(withCodexDeepSeekModelWindow(trusted, selection))
		};
	};
	let resolvedAppServer = resolveFinalAppServer(configuredAppServer, reviewerPolicyContext);
	let appServer = resolvedAppServer.appServer;
	preDynamicStartupStages.mark("app-server-policy");
	preDynamicStartupStages.mark("native-hook-relay");
	const terminalState = {
		turnSucceeded: false,
		explicitCancellationObserved: false,
		explicitCancellationReason: void 0,
		terminalOutcomeFrozen: false,
		sharedAbortAllowedAfterTerminalOutcome: false
	};
	const runAbortController = new AbortController();
	let attemptAbortNotified = false;
	const notifyAttemptAbort = () => {
		if (attemptAbortNotified) return;
		attemptAbortNotified = true;
		params.onAttemptAbort?.();
	};
	const abortExplicitly = (reason) => {
		if (terminalState.terminalOutcomeFrozen) {
			if (terminalState.sharedAbortAllowedAfterTerminalOutcome) notifyAttemptAbort();
			return;
		}
		notifyAttemptAbort();
		terminalState.explicitCancellationObserved = true;
		terminalState.explicitCancellationReason ??= reason;
		runAbortController.abort(reason);
	};
	const abortFromUpstream = () => {
		abortExplicitly(params.abortSignal?.reason ?? "upstream_abort");
	};
	if (params.abortSignal?.aborted) abortFromUpstream();
	else params.abortSignal?.addEventListener("abort", abortFromUpstream, { once: true });
	const startupBindingBeforeRotation = startupBinding;
	const startupBindingResolution = await rotateOversizedCodexAppServerStartupBinding({
		binding: startupBinding,
		bindingStore,
		identity: bindingIdentity,
		sessionFile: params.sessionFile,
		agentDir,
		codexHome: appServer.start.env?.CODEX_HOME,
		config: params.config,
		contextEngineActive: Boolean(activeContextEngine)
	});
	startupBinding = startupBindingResolution.binding;
	const initialInactiveThreadBootstrapBindingForcedFreshStart = initialStartupBindingHadInactiveThreadBootstrap && !startupBinding?.threadId;
	preDynamicStartupStages.mark("rotate-binding");
	if (startupBinding !== startupBindingBeforeRotation) {
		reviewerPolicyContext = resolveReviewerPolicyContext(startupBinding);
		configuredAppServer = resolveRuntimeOptionsForBinding(startupBinding, {
			modelProvider: reviewerPolicyContext.modelProvider,
			model: reviewerPolicyContext.model
		});
		resolvedAppServer = resolveFinalAppServer(configuredAppServer, reviewerPolicyContext);
		appServer = resolvedAppServer.appServer;
	}
	const sessionPermissionPolicy = resolveCodexEffectiveSessionPermissionPolicy({
		appServer,
		permissionMode: params.permissionMode,
		sessionRoot: params.sessionRoot,
		defaultRoot: effectiveWorkspace
	});
	if (sessionPermissionPolicy) {
		params.permissionMode = sessionPermissionPolicy.mode;
		params.sessionRoot = sessionPermissionPolicy.root;
		(params.execOverrides ??= {}).mode = sessionPermissionPolicy.execMode;
	}
	const nativeHookRelayEvents = resolveCodexNativeHookRelayEvents({
		configuredEvents: options.nativeHookRelay?.events,
		appServer
	});
	const mutable = {
		startupBinding,
		startupContextTokens: startupBindingResolution.startupContextTokens,
		pluginAppServer: appServer,
		continuityCalibration: startupBindingBeforeRotation?.continuityCalibration
	};
	const resolveRuntimeOptionsForCurrentBinding = (selection) => resolveFinalAppServer(resolveRuntimeOptionsForBinding(mutable.startupBinding, selection), selection).appServer;
	return {
		params,
		options,
		attemptStartedAt,
		profilerEnabled,
		codexModelCallTrace,
		codexModelContentCapture,
		codexModelCallId,
		fastModeAutoStartedAtMs,
		fastModeAutoProgressState,
		preDynamicStartupStages,
		attemptClientFactory,
		runtimeArtifactRequest,
		pluginConfig,
		computerUseConfig,
		sessionAgentId,
		policyAgentId,
		resolvedWorkspace,
		sandboxSessionKey,
		contextSessionKey,
		sandbox,
		agentDir,
		shellEnvironment,
		disableLoginShell,
		bindingIdentity,
		bindingStore,
		activeContextEngine,
		isInactiveThreadBootstrapBinding,
		usesSupervisionConnection,
		startupAuthProfileId,
		startupAuthRequirement: preparedAuthRoute?.authRequirement,
		startupPreparedAuth,
		startupClientAuthProfileId,
		effectiveWorkspace,
		effectiveCwd,
		appServer,
		sessionPermissionPolicy,
		nativeHookRelayEvents,
		runAbortController,
		terminalState,
		abortExplicitly,
		abortFromUpstream,
		resolveReviewerPolicyContext,
		resolveRuntimeOptionsForCurrentBinding,
		mutable,
		initialStartupBindingHadInactiveThreadBootstrap,
		initialInactiveThreadBootstrapBindingForcedFreshStart
	};
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-state.ts
async function clearCodexBindingAfterInvalidImagePayload(bindingStore, identity, fields) {
	const currentBinding = await bindingStore.read(identity);
	const expectedThreadId = fields.threadId ?? currentBinding?.threadId;
	if (!expectedThreadId) return;
	if (currentBinding && currentBinding.threadId !== expectedThreadId) {
		embeddedAgentLog.warn("codex app-server image payload error detected for unbound thread; preserving thread binding", {
			...fields,
			boundThreadId: currentBinding.threadId
		});
		return;
	}
	if (currentBinding?.connectionScope === "supervision") {
		embeddedAgentLog.warn("codex app-server image payload error detected for supervised thread; preserving native binding", fields);
		return;
	}
	embeddedAgentLog.warn("codex app-server image payload error detected; clearing thread binding", fields);
	await bindingStore.mutate(identity, {
		kind: "clear",
		threadId: expectedThreadId
	});
}
async function markCodexAppServerBindingCoveredThroughTurn(params) {
	await params.bindingStore.mutate(params.identity, {
		kind: "patch",
		threadId: params.threadId,
		patch: {
			historyCoveredThrough: (/* @__PURE__ */ new Date()).toISOString(),
			...params.continuityCalibration ? { continuityCalibration: params.continuityCalibration } : {}
		}
	});
}
function isNonEmptyString(value) {
	return typeof value === "string" && value.length > 0;
}
function shouldUseFreshCodexThreadAfterContextEngineOverflow(params) {
	if (!params.contextEngineActive || params.thread.lifecycle.action !== "resumed") return false;
	const message = formatErrorMessage(params.error);
	return /ran out of room in the model'?s context window/iu.test(message) || /context window/iu.test(message) || /context length/iu.test(message) || /maximum context/iu.test(message) || /too many tokens/iu.test(message);
}
function isCodexActiveCompactTurnError(error) {
	if (!(error instanceof CodexAppServerRpcError)) return false;
	const data = isJsonObject(error.data) ? error.data : void 0;
	const codexErrorInfo = isJsonObject(data?.codexErrorInfo) ? data.codexErrorInfo : void 0;
	return (isJsonObject(codexErrorInfo?.activeTurnNotSteerable) ? codexErrorInfo.activeTurnNotSteerable : void 0)?.turnKind === "compact";
}
function joinPresentSections(...sections) {
	return sections.filter((section) => Boolean(section?.trim())).join("\n\n");
}
function prependCurrentInboundContext(prompt, context) {
	const text = context?.text.trim();
	return text ? [neutralizeCodexExplicitMentionSigils(text), prompt].filter(Boolean).join("\n\n") : prompt;
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-context.ts
async function prepareCodexAttemptContext(runtime, attemptTools) {
	const { connection, runtimeParams, activeSessionId, activeSessionFile, buildActiveRunAttemptParams, effectiveContextWindowInfo, effectiveContextTokenBudget, effectiveRuntimeProviderId, effectiveRuntimeModelId, hookChannelId } = runtime;
	const { params, sessionAgentId, contextSessionKey, activeContextEngine, initialStartupBindingHadInactiveThreadBootstrap, effectiveWorkspace, effectiveCwd, agentDir, usesSupervisionConnection, resolvedWorkspace, initialInactiveThreadBootstrapBindingForcedFreshStart, sandbox } = connection;
	const { toolBridge } = attemptTools;
	const activeTranscriptTarget = {
		agentId: sessionAgentId,
		sessionFile: activeSessionFile,
		sessionId: activeSessionId,
		sessionKey: contextSessionKey,
		sessionTarget: params.sessionTarget
	};
	const readFencedHistory = async (bounded = true) => {
		const transcriptReadFence = params.userTurnTranscriptRecorder?.getAdmissionReceipt();
		return await readMirroredSessionHistoryMessages({
			...activeTranscriptTarget,
			...transcriptReadFence ? { admission: transcriptReadFence } : {},
			...bounded && !activeContextEngine ? { contextTokenBudget: effectiveContextTokenBudget } : {} // v-codex-bounded-history-v1
		});
	};
	const historyState = { messages: !activeContextEngine && initialStartupBindingHadInactiveThreadBootstrap ? [] : await readFencedHistory() ?? [] };
	// v-codex-bounded-history-v1: the history may be the newest tail only; read the full context when the turn needs it.
	historyState.ensureHistoryFor = async (action, binding) => {
		if (historyState.messages?.codexHistoryTruncated !== true) return;
		if (action === "resumed") {
			const cutoff = Date.parse(binding?.historyCoveredThrough ?? "");
			const oldest = historyState.messages.find((message) => message.role === "user" || message.role === "assistant");
			const oldestAt = typeof oldest?.timestamp === "number" ? oldest.timestamp : Date.parse(oldest?.timestamp ?? "");
			if (Number.isFinite(cutoff) && Number.isFinite(oldestAt) && oldestAt < cutoff) return;
		}
		const startedAt = Date.now();
		const full = await readFencedHistory(false);
		if (!full) return;
		embeddedAgentLog.info("[codex-bounded-history.1] " + JSON.stringify({
			fullRead: action,
			boundedMessages: historyState.messages.length,
			fullMessages: full.length,
			ms: Date.now() - startedAt
		}));
		historyState.messages = full;
	};
	const hadSessionTranscriptState = historyState.messages.length > 0;
	const hookContextWindowFields = {
		...effectiveContextWindowInfo?.tokens ? { contextTokenBudget: effectiveContextWindowInfo.tokens } : effectiveContextTokenBudget ? { contextTokenBudget: effectiveContextTokenBudget } : {},
		...effectiveContextWindowInfo?.source ? { contextWindowSource: effectiveContextWindowInfo.source } : {},
		...effectiveContextWindowInfo?.referenceTokens ? { contextWindowReferenceTokens: effectiveContextWindowInfo.referenceTokens } : {}
	};
	const hookContext = {
		runId: params.runId,
		agentId: sessionAgentId,
		sessionKey: contextSessionKey,
		sessionId: params.sessionId,
		workspaceDir: params.workspaceDir,
		trigger: params.trigger,
		...buildAgentHookContextChannelFields({
			sessionKey: contextSessionKey,
			messageChannel: params.messageChannel,
			messageProvider: params.messageProvider,
			currentChannelId: hookChannelId,
			messageTo: params.messageTo,
			senderId: params.senderId,
			agentAccountId: params.agentAccountId
		}),
		channelContext: params.channelContext,
		...hookContextWindowFields
	};
	const hookRunner = getAgentHarnessHookRunner();
	const buildActiveContextEngineRuntimeContext = () => buildHarnessContextEngineRuntimeContext({
		attempt: buildActiveRunAttemptParams(),
		workspaceDir: effectiveWorkspace,
		cwd: effectiveCwd,
		agentDir,
		activeAgentId: sessionAgentId,
		contextEnginePluginId: resolveContextEngineOwnerPluginId(activeContextEngine),
		tokenBudget: effectiveContextTokenBudget
	});
	if (activeContextEngine) {
		await bootstrapHarnessContextEngine({
			hadSessionFile: hadSessionTranscriptState,
			contextEngine: activeContextEngine,
			sessionId: activeSessionId,
			sessionKey: contextSessionKey,
			sessionFile: activeSessionFile,
			sessionTarget: params.sessionTarget,
			runtimeContext: buildActiveContextEngineRuntimeContext(),
			transcriptReadFence: params.userTurnTranscriptRecorder?.getAdmissionReceipt(),
			contextEngineHostSupport: CODEX_APP_SERVER_CONTEXT_ENGINE_HOST,
			providerId: effectiveRuntimeProviderId,
			requestedModelId: usesSupervisionConnection ? void 0 : params.requestedModelId,
			modelId: effectiveRuntimeModelId,
			fallbackReason: usesSupervisionConnection ? void 0 : params.fallbackReason,
			degradedReason: usesSupervisionConnection ? void 0 : params.degradedReason,
			runMaintenance: runHarnessContextEngineMaintenance,
			config: params.config,
			warn: (message) => embeddedAgentLog.warn(message)
		});
		historyState.messages = await readFencedHistory() ?? historyState.messages;
	}
	const memoryToolNames = getCodexWorkspaceMemoryToolNames(toolBridge.availableSpecs);
	const workspaceBootstrapContext = await buildCodexWorkspaceBootstrapContext({
		params: runtimeParams,
		resolvedWorkspace: runtimeParams.bootstrapWorkspaceDir ?? resolvedWorkspace,
		executionWorkspace: resolvedWorkspace,
		effectiveWorkspace,
		sessionKey: contextSessionKey,
		sessionAgentId,
		memoryToolNames,
		ringZeroActive: isHostScopedAgentToolActive("openclaw") && isSystemAgentOnlyCodexDynamicToolAllowlist(runtimeParams.toolsAllow),
		sandboxed: sandbox?.enabled === true
	});
	const agentWorkspaceDeveloperInstructions = workspaceBootstrapContext.threadDeveloperInstructions ? connection.mutable.startupBinding?.agentWorkspaceDeveloperInstructions ?? workspaceBootstrapContext.threadDeveloperInstructions : void 0;
	const baseDeveloperInstructions = joinPresentSections(buildDeveloperInstructions(runtimeParams, { dynamicTools: toolBridge.availableSpecs }), agentWorkspaceDeveloperInstructions);
	return {
		runtime,
		attemptTools,
		activeTranscriptTarget,
		historyState,
		hookContext,
		hookContextWindowFields,
		hookRunner,
		buildActiveContextEngineRuntimeContext,
		workspaceBootstrapContext,
		agentWorkspaceDeveloperInstructions,
		baseDeveloperInstructions,
		openClawPromptContext: buildCodexOpenClawPromptContext({
			params: runtimeParams,
			workspacePromptContext: workspaceBootstrapContext.promptContext,
			watchedSessionsContext: buildCodexWatchedSessionsContext({
				attempt: runtimeParams,
				dynamicTools: toolBridge.availableSpecs,
				sessionKey: contextSessionKey,
				sandboxed: sandbox?.enabled === true
			})
		}),
		skillsCollaborationInstructions: renderCodexSkillsCollaborationInstructions({
			attempt: runtimeParams,
			skillsPrompt: params.skillsSnapshot?.prompt
		}),
		promptState: {
			promptText: params.prompt,
			promptContextRange: void 0,
			developerInstructions: baseDeveloperInstructions,
			prePromptMessageCount: historyState.messages.length,
			contextEngineProjection: void 0,
			precomputedStaleBindingContinuityProjectionApplied: false,
			staleBindingContinuityForcedFreshStart: false,
			noEngineContinuityProjectionApplied: false,
			inactiveThreadBootstrapBindingForcedFreshStart: initialInactiveThreadBootstrapBindingForcedFreshStart
		},
		codexContextProjectionMaxChars: resolveCodexContextEngineProjectionMaxChars({
			contextTokenBudget: effectiveContextTokenBudget,
			reserveTokens: resolveCodexContextEngineProjectionReserveTokens()
		}),
		codexContinuityProjectionMaxChars: resolveCodexContinuityProjectionMaxChars({
			contextTokenBudget: effectiveContextTokenBudget,
			calibration: connection.mutable.continuityCalibration
		})
	};
}
//#endregion
//#region extensions/codex/src/app-server/attempt-diagnostics.ts
/**
* Diagnostic helpers for Codex app-server model calls and plugin-thread config
* eligibility.
*/
/** Reads a tool schema field in either app-server or OpenClaw naming. */
function readCodexDiagnosticToolParameters(tool) {
	return tool.inputSchema ?? tool.parameters;
}
/** Builds compact diagnostic tool definitions for trusted private telemetry. */
function buildCodexDiagnosticToolDefinitions(tools) {
	return tools.map((tool) => ({
		name: tool.name,
		description: tool.description,
		parameters: readCodexDiagnosticToolParameters(tool)
	}));
}
/** Returns the serialized UTF-8 byte length for a JSON-compatible value. */
function utf8JsonByteLength(value) {
	try {
		return Buffer.byteLength(JSON.stringify(value), "utf8");
	} catch {
		return;
	}
}
/** Builds a short namespaced fingerprint for sensitive log values. */
function fingerprintCodexLogValue(namespace, value) {
	const hash = createHash("sha256");
	hash.update(namespace);
	hash.update("\0");
	hash.update(value);
	return `sha256:${hash.digest("hex").slice(0, 16)}`;
}
/**
* Builds redacted diagnostics explaining whether plugin thread config was
* eligible for a Codex app-server attempt.
*/
function buildCodexPluginThreadConfigEligibilityLogData(params) {
	return {
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		enabled: params.pluginThreadConfigRequired,
		policyConfigured: params.resolvedPluginPolicy?.configured === true,
		policyEnabled: params.resolvedPluginPolicy?.enabled === true,
		allowAllPlugins: params.resolvedPluginPolicy?.allowAllPlugins === true,
		pluginConfigKeys: params.resolvedPluginPolicy?.pluginPolicies.map((plugin) => plugin.configKey).toSorted(),
		enabledPluginConfigKeys: params.enabledPluginConfigKeys,
		appCacheKeyFingerprint: fingerprintCodexLogValue("openclaw:codex:plugin-app-cache-key:v1", params.pluginAppCacheKey),
		authProfileId: params.startupAuthProfileId,
		appServerTransport: params.appServer.start.transport,
		appServerCommandSource: params.appServer.start.commandSource
	};
}
/**
* Creates lifecycle emitters for trusted model-call diagnostics with optional
* private payload capture.
*/
function createCodexModelCallDiagnosticEmitter(params) {
	const now = params.now ?? (() => Date.now());
	const toolDefinitions = params.capture.toolDefinitions ? buildCodexDiagnosticToolDefinitions(params.tools) : void 0;
	let startedAt = now();
	let started = false;
	let terminalEmitted = false;
	let requestPayloadBytes;
	const privateData = (modelContent) => modelContent && Object.keys(modelContent).length > 0 ? { modelContent } : void 0;
	const buildContent = () => {
		const modelContent = {
			...params.capture.inputMessages ? { inputMessages: params.buildInputMessages() } : {},
			...params.capture.systemPrompt ? { systemPrompt: params.buildSystemPrompt() } : {},
			...toolDefinitions ? { toolDefinitions } : {}
		};
		return Object.keys(modelContent).length > 0 ? modelContent : void 0;
	};
	const requestPayloadBytesField = () => requestPayloadBytes !== void 0 ? { requestPayloadBytes } : {};
	return {
		setRequestPayloadBytes(bytes) {
			requestPayloadBytes = bytes;
		},
		emitStarted() {
			startedAt = now();
			started = true;
			emitTrustedDiagnosticEventWithPrivateData({
				type: "model.call.started",
				...params.baseFields
			}, privateData(buildContent()));
		},
		emitCompleted(result) {
			if (!started || terminalEmitted) return;
			terminalEmitted = true;
			emitTrustedDiagnosticEventWithPrivateData({
				type: "model.call.completed",
				...params.baseFields,
				durationMs: Math.max(0, now() - startedAt),
				...requestPayloadBytesField()
			}, privateData({
				...buildContent(),
				...params.capture.outputMessages ? { outputMessages: result.lastAssistant ? [result.lastAssistant] : result.assistantTexts } : {}
			}));
		},
		emitError(error, fields = {}) {
			if (!started || terminalEmitted) return;
			terminalEmitted = true;
			emitTrustedDiagnosticEventWithPrivateData({
				type: "model.call.error",
				...params.baseFields,
				durationMs: Math.max(0, now() - startedAt),
				errorCategory: fields.failureKind ?? "error",
				...fields.failureKind ? { failureKind: fields.failureKind } : {},
				...requestPayloadBytesField()
			}, privateData({
				...buildContent(),
				...params.capture.outputMessages ? { outputMessages: [] } : {}
			}));
			params.onErrorDiagnostic?.(error);
		}
	};
}
/** Classifies model-call failures into timeout/abort buckets for diagnostics. */
function classifyCodexModelCallFailureKind(params) {
	if (params.timedOut) return "timeout";
	const errorMessage = params.error ? params.formatError(params.error).toLowerCase() : "";
	if (errorMessage.includes("timed out") || errorMessage.includes("timeout")) return "timeout";
	if (params.runAborted && !params.clientClosedAbort) return (typeof params.abortReason === "string" ? params.abortReason.toLowerCase() : params.abortReason ? params.formatError(params.abortReason).toLowerCase() : "").includes("timeout") ? "timeout" : "aborted";
	return errorMessage.includes("aborted") ? "aborted" : void 0;
}
//#endregion
//#region extensions/codex/src/app-server/attempt-results.ts
/** Joins terminal assistant text blocks into the final attempt answer. */
function collectTerminalAssistantText(result) {
	return result.assistantTexts.join("\n\n").trim();
}
/** Reports the owner's deadline without guessing whether native work finished. */
function buildCodexAppServerPromptTimeoutOutcome(timeout) {
	if (!timeout) return;
	return {
		message: timeout.kind === "execution" ? "Codex reached the configured execution time limit. Some work may already have been performed; verify the current state before continuing." : "Codex finished its turn, but OpenClaw could not finish processing the result. Some work may already have been performed; verify the current state before continuing.",
		replayInvalid: true,
		livenessState: "abandoned"
	};
}
/** Explains why an incomplete app-server turn cannot be safely replayed. */
function resolveCodexAppServerReplayBlockedReason(result) {
	if (result.replayMetadata.hadPotentialSideEffects) return "potential_side_effect";
	if (result.assistantTexts.some((text) => text.trim().length > 0)) return "assistant_output";
	if (result.toolMetas.length > 0 || result.clientToolCalls || result.lastToolError || result.didSendDeterministicApprovalPrompt) return "tool_activity";
	if (result.itemLifecycle.startedCount > 0 || result.itemLifecycle.activeCount > 0) return "active_item";
}
/** Builds an attempt result for failures before the app-server turn starts. */
function buildCodexTurnStartFailureResult(params) {
	return {
		terminal: attemptTerminal.normalize({
			promptError: params.promptError ?? params.message,
			promptErrorSource: "prompt"
		}),
		sessionIdUsed: params.params.sessionId,
		messagesSnapshot: params.messagesSnapshot,
		assistantTexts: [],
		toolMetas: [],
		lastAssistant: void 0,
		currentAttemptAssistant: void 0,
		didSendViaMessagingTool: false,
		messagingToolSentTexts: [],
		messagingToolSentMediaUrls: [],
		messagingToolSentTargets: [],
		messagingToolSourceReplyPayloads: [],
		cloudCodeAssistFormatError: false,
		replayMetadata: {
			hadPotentialSideEffects: false,
			replaySafe: true
		},
		itemLifecycle: {
			startedCount: 0,
			completedCount: 0,
			activeCount: 0
		},
		systemPromptReport: params.systemPromptReport
	};
}
/** Detects app-server errors caused by invalid image payload data. */
function isInvalidCodexImagePayloadError(message) {
	if (typeof message !== "string" || !message.trim()) return false;
	const normalizedMessage = message.replace(/[_-]+/gu, " ");
	// v-vds-view-image-v1: a request body over the provider limit cannot recover on the same thread.
	if (/\b413\b[\s\S]{0,40}\b(?:payload|request entity) too large\b|failed to buffer the request body/iu.test(normalizedMessage)) return true;
	return /\b(?:invalid|malformed)\b[\s\S]{0,120}\b(?:image|image url|base64)\b/iu.test(normalizedMessage) || /\b(?:image|image url|base64)\b[\s\S]{0,120}\b(?:invalid|malformed)\b/iu.test(normalizedMessage);
}
//#endregion
//#region extensions/codex/src/app-server/trajectory.ts
/** Creates a trajectory recorder when the host exposes its capture capability. */
function createCodexTrajectoryRecorder(params) {
	if (!params.trajectory) return null;
	const trajectory = params.trajectory;
	return {
		recordEvent: (type, data) => {
			try {
				trajectory.recordEvent(type, data);
			} catch {}
		},
		flush: trajectory.flush
	};
}
/** Records compiled prompt/tool context at the start of a Codex runtime attempt. */
function recordCodexTrajectoryContext(recorder, params) {
	if (!recorder) return;
	recorder.recordEvent("context.compiled", {
		systemPrompt: params.developerInstructions,
		prompt: params.prompt ?? params.attempt.prompt,
		imagesCount: params.attempt.images?.length ?? 0,
		tools: toTrajectoryToolDefinitions(params.tools)
	});
}
/** Records final Codex model completion metadata and assistant snapshots. */
function recordCodexTrajectoryCompletion(recorder, params) {
	if (!recorder) return;
	const terminal = attemptTerminal.project(params.result.terminal);
	recorder.recordEvent("model.completed", {
		threadId: params.threadId,
		turnId: params.turnId,
		timedOut: params.timedOut,
		yieldDetected: params.yieldDetected ?? false,
		aborted: terminal.aborted,
		promptError: normalizeCodexTrajectoryError(terminal.promptError),
		usage: params.result.attemptUsage,
		assistantTexts: params.result.assistantTexts,
		messagesSnapshot: params.result.messagesSnapshot
	});
}
function toTrajectoryToolDefinitions(tools) {
	if (!tools || tools.length === 0) return;
	return flattenCodexDynamicToolFunctions(tools).flatMap((tool) => {
		const name = tool.name?.trim();
		if (!name) return [];
		return [{
			name,
			description: tool.description,
			parameters: tool.inputSchema
		}];
	}).toSorted((left, right) => left.name.localeCompare(right.name));
}
/** Converts arbitrary prompt errors into trajectory-safe text. */
function normalizeCodexTrajectoryError(value) {
	if (!value) return null;
	if (value instanceof Error) return value.message;
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value);
	} catch {
		return "Unknown error";
	}
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-finalize.ts
async function finalizeCodexAttempt(resources, turnRuntime, lifecycle, notifications, requestRuntime, activeTurn) {
	const { prompt, state: resourceState, trajectoryRecorder, markTrajectoryEndRecorded } = resources;
	const { context, systemPromptReport } = prompt;
	const { runtime, attemptTools, activeTranscriptTarget, hookContext } = context;
	const { hookContextWindowFields, hookRunner } = context;
	const { connection, preparedAuthBinding } = runtime;
	const { effectiveRuntimeProviderId, effectiveRuntimeModelId } = runtime;
	const { params, terminalState, runAbortController, activeContextEngine, bindingStore, bindingIdentity, appServer, usesSupervisionConnection, sessionAgentId, contextSessionKey, effectiveCwd, agentDir, attemptStartedAt, startupAuthProfileId } = connection;
	const { toolBridge, toolState } = attemptTools;
	const { state, completion, deadlines } = turnRuntime;
	const { emitLifecycleTerminal, buildLifecycleTerminalMeta } = lifecycle;
	const { drainNotificationQueue } = notifications;
	const { codexModelCallDiagnostics } = requestRuntime;
	const { activeTurnId, activeProjector, streamState, freezeRunTerminalOutcome, notifyUserMessagePersisted } = activeTurn;
	await completion;
	__vCodexTurnTail().mark(params.runId, "turn-completion"); // V codex-turn-tail-v1
	const abortGraceElapsed = createDeferred();
	let settlementClosed = false;
	let abortGraceTimer;
	const beginAbortGrace = () => {
		if (settlementClosed) return;
		abortGraceTimer = setTimeout(() => abortGraceElapsed.resolve(), TURN_FINALIZE_DRAIN_ABORT_GRACE_MS);
		abortGraceTimer.unref?.();
	};
	const abortListener = addAbortListener(runAbortController.signal, () => {
		state.abortCleanup.then(beginAbortGrace, beginAbortGrace);
	});
	const closeProjection = () => {
		state.projectionClosed = true;
		return activeProjector.closeProjection();
	};
	const settlement = drainNotificationQueue().then(closeProjection);
	try {
		await Promise.race([settlement, abortGraceElapsed.promise]);
		if (runAbortController.signal.aborted) await state.abortCleanup;
	} finally {
		settlementClosed = true;
		abortListener[Symbol.dispose]();
		clearTimeout(abortGraceTimer);
		deadlines.dispose();
		if (!state.projectionClosed) await resources.runCleanupStep("codex-transcript-checkpoint", closeProjection);
	}
	__vCodexTurnTail().mark(params.runId, "drain-close-projection"); // V codex-turn-tail-v1
	const result = activeProjector.buildResult(toolBridge.telemetry, { yieldDetected: toolState.yieldDetected });
	const projectedTerminal = attemptTerminal.project(result.terminal);
	const effectiveTimedOut = state.timeout !== void 0;
	const isFinalAborted = () => terminalState.explicitCancellationObserved || !resourceState.executionDisconnectError && (projectedTerminal.aborted || runAbortController.signal.aborted && !state.clientClosedAbort);
	const clientClosedPromptErrorForFinal = state.clientClosedPromptError;
	let finalPromptError = resourceState.executionDisconnectError ?? clientClosedPromptErrorForFinal ?? (state.timeout?.kind === "settlement" ? "codex app-server terminal settlement timed out" : state.timeout?.kind === "execution" ? "codex app-server execution budget timed out" : projectedTerminal.promptError);
	const finalPromptErrorMessage = typeof finalPromptError === "string" ? finalPromptError : finalPromptError instanceof Error ? finalPromptError.message : finalPromptError ? formatErrorMessage(finalPromptError) : void 0;
	if (isInvalidCodexImagePayloadError(finalPromptErrorMessage)) await clearCodexBindingAfterInvalidImagePayload(bindingStore, bindingIdentity, {
		phase: "turn_completed",
		threadId: resourceState.thread.threadId,
		turnId: activeTurnId,
		error: finalPromptErrorMessage
	});
	if (resourceState.thread.connectionScope !== "supervision" && shouldUseFreshCodexThreadAfterContextEngineOverflow({
		error: finalPromptError,
		contextEngineActive: Boolean(activeContextEngine),
		thread: resourceState.thread
	})) {
		embeddedAgentLog.warn("codex app-server context-engine turn overflowed after resume; clearing thread binding for recovery", {
			threadId: resourceState.thread.threadId,
			turnId: activeTurnId,
			error: finalPromptErrorMessage
		});
		await bindingStore.mutate(bindingIdentity, {
			kind: "clear",
			threadId: resourceState.thread.threadId
		});
	}
	__vCodexTurnTail().mark(params.runId, "turn-drain"); // V codex-turn-tail-v1
	const refreshedUsageLimitPromptError = await refreshCodexUsageLimitPromptError({
		client: resourceState.client,
		message: finalPromptErrorMessage,
		timeoutMs: appServer.requestTimeoutMs,
		signal: runAbortController.signal
	});
	if (refreshedUsageLimitPromptError) {
		await markCodexAuthProfileBlockedFromRateLimits({
			params,
			authProfileId: startupAuthProfileId,
			rateLimits: refreshedUsageLimitPromptError.rateLimitsForProfile
		});
		finalPromptError = createCodexUsageLimitPromptError(refreshedUsageLimitPromptError.message);
	} else if (isCodexUsageLimitPromptError(finalPromptError) && state.rateLimitsRevisionBeforeLastTurnStart !== void 0 && readCodexRateLimitsRevision(resourceState.client) > state.rateLimitsRevisionBeforeLastTurnStart) await markCodexAuthProfileBlockedFromRateLimits({
		params,
		authProfileId: startupAuthProfileId,
		rateLimits: readRecentCodexRateLimits(resourceState.client)
	});
	finalPromptError = resourceState.executionDisconnectError ?? finalPromptError;
	const finalPromptErrorSource = effectiveTimedOut || clientClosedPromptErrorForFinal ? "prompt" : projectedTerminal.promptErrorSource;
	const codexAppServerFailureKind = clientClosedPromptErrorForFinal ? "client_closed_before_turn_completed" : state.timeout?.kind === "settlement" ? "turn_settlement_timeout" : void 0;
	const replayBlockedReason = codexAppServerFailureKind ? resolveCodexAppServerReplayBlockedReason(result) : void 0;
	const promptTimeoutOutcome = buildCodexAppServerPromptTimeoutOutcome(state.timeout);
	const failureDiagnostics = codexAppServerFailureKind === "client_closed_before_turn_completed" && state.clientClosedDiagnostic ? { transportError: state.clientClosedDiagnostic } : state.timeout?.kind === "settlement" ? { timeoutMs: state.timeout.timeoutMs } : void 0;
	const codexAppServerFailure = codexAppServerFailureKind ? {
		kind: codexAppServerFailureKind,
		transport: appServer.start.transport,
		threadId: resourceState.thread.threadId,
		turnId: activeTurnId,
		replaySafe: codexAppServerFailureKind === "client_closed_before_turn_completed" && replayBlockedReason === void 0,
		...replayBlockedReason ? { replayBlockedReason } : {},
		...failureDiagnostics ? { diagnostics: failureDiagnostics } : {}
	} : void 0;
	const finalAborted = isFinalAborted();
	const completedTurnStatus = activeProjector.getCompletedTurnStatus();
	const locallyCompletedTurn = state.completed && state.localCompletionRequested && !state.timeout && clientClosedPromptErrorForFinal === void 0;
	const turnSucceeded = !finalAborted && !effectiveTimedOut && (finalPromptError === null || finalPromptError === void 0) && (completedTurnStatus === "completed" || locallyCompletedTurn);
	if (toolBridge.telemetry.messagingToolSentTargets.some((target) => target.sourceReplyFinal === true)) result.agentHarnessResultClassification = void 0;
	const attemptSucceeded = turnSucceeded && result.agentHarnessResultClassification === void 0;
	terminalState.turnSucceeded = turnSucceeded;
	terminalState.sharedAbortAllowedAfterTerminalOutcome = shouldKeepCodexSharedAbortOpen({
		trigger: params.trigger,
		result,
		attemptSucceeded,
		explicitCancellationObserved: terminalState.explicitCancellationObserved
	});
	freezeRunTerminalOutcome();
	const modelCallFailureKind = classifyCodexModelCallFailureKind({
		error: finalPromptError,
		timedOut: effectiveTimedOut,
		runAborted: finalAborted,
		abortReason: terminalState.explicitCancellationReason ?? runAbortController.signal.reason,
		clientClosedAbort: state.clientClosedAbort,
		formatError: formatErrorMessage
	}) ?? (finalAborted ? "aborted" : void 0);
	if (modelCallFailureKind) codexModelCallDiagnostics.emitError(finalPromptError ?? "codex app-server attempt interrupted", { failureKind: modelCallFailureKind });
	else if (finalPromptError) codexModelCallDiagnostics.emitError(finalPromptError);
	else codexModelCallDiagnostics.emitCompleted(result);
	__vCodexTurnTail().mark(params.runId, "usage-and-result"); // V codex-turn-tail-v1
	await activeTurn.promptMirrorSettled; // v-codex-firsttext-v1
	__vCodexTurnTail().mark(params.runId, "prompt-mirror-wait"); // V codex-turn-tail-v1
	const mirrorOutcome = await codexTranscriptMirrorRuntime.mirrorBestEffort({
		params,
		agentId: sessionAgentId,
		notifyUserMessagePersisted,
		result,
		sessionKey: contextSessionKey,
		cwd: effectiveCwd,
		threadId: resourceState.thread.threadId,
		turnId: activeTurnId
	});
	__vCodexTurnTail().mark(params.runId, "transcript-mirror"); // V codex-turn-tail-v1
	const { assistantTranscriptOwned, assistantTranscriptIdempotencyKey, terminalAnchor } = mirrorOutcome;
	const settledTurnFinalizationContext = !toolState.yieldDetected && result.assistantTexts.every((text) => !text.trim()) && result.messagesSnapshot.some((message) => message.role === "toolResult") && (!finalPromptError || activeProjector.settledTurnFailureFinalizationAllowed) ? await captureCodexSettledTurnFinalizationContext({
		...activeTranscriptTarget,
		mirroredMessages: mirrorOutcome.mirroredMessages,
		settledMessages: result.messagesSnapshot,
		persistedUserMessages: mirrorOutcome.persistedUserMessages,
		suppressNextUserMessagePersistence: params.suppressNextUserMessagePersistence === true,
		turnId: activeTurnId
	}) ?? Object.freeze({ source: "unavailable" }) : void 0;
	__vCodexTurnTail().mark(params.runId, "settled-finalization"); // V codex-turn-tail-v1
	if (settledTurnFinalizationContext?.source === "unavailable") embeddedAgentLog.warn("codex settled-turn finalization context is unavailable", {
		threadId: resourceState.thread.threadId,
		turnId: activeTurnId
	});
	runAgentHarnessLlmOutputHook({
		event: {
			runId: params.runId,
			sessionId: params.sessionId,
			provider: usesSupervisionConnection ? resourceState.thread.modelProvider ?? effectiveRuntimeProviderId : params.provider,
			model: usesSupervisionConnection ? resourceState.thread.model ?? effectiveRuntimeModelId : params.modelId,
			...hookContextWindowFields,
			resolvedRef: usesSupervisionConnection ? `${resourceState.thread.modelProvider ?? effectiveRuntimeProviderId}/${resourceState.thread.model ?? effectiveRuntimeModelId}` : params.runtimePlan?.observability.resolvedRef ?? `${params.provider}/${params.modelId}`,
			...!usesSupervisionConnection && params.runtimePlan?.observability.harnessId ? { harnessId: params.runtimePlan.observability.harnessId } : {},
			assistantTexts: result.assistantTexts,
			...result.lastAssistant ? { lastAssistant: result.lastAssistant } : {},
			...result.attemptUsage ? { usage: result.attemptUsage } : {}
		},
		ctx: hookContext,
		hookRunner
	});
	await runCodexAgentEndHook(params, {
		event: {
			messages: result.messagesSnapshot,
			success: !finalAborted && !finalPromptError,
			...finalPromptError ? { error: formatErrorMessage(finalPromptError) } : {},
			durationMs: Date.now() - attemptStartedAt
		},
		ctx: {
			...hookContext,
			modelProviderId: resourceState.thread.modelProvider ?? effectiveRuntimeProviderId,
			modelId: resourceState.thread.model ?? effectiveRuntimeModelId,
			authProfileId: resourceState.thread.authProfileId ?? startupAuthProfileId,
			modelIterations: result.modelIterations ?? 0,
			skillWorkshopAvailable: flattenCodexDynamicToolFunctions(attemptTools.toolBridge.availableSpecs).some((tool) => tool.name === "skill_workshop"),
			compacted: (result.compactionCount ?? 0) > 0,
			senderId: params.senderId ?? void 0,
			foregroundPromptContext: buildEmbeddedForegroundPromptContext({
				...params,
				agentId: sessionAgentId
			}, agentDir)
		},
		hookRunner
	});
	__vCodexTurnTail().mark(params.runId, "agent-end-hooks"); // V codex-turn-tail-v1
	state.shouldDelayNativeHookRelayUnregister = completedTurnStatus === "completed" && !effectiveTimedOut && !runAbortController.signal.aborted && !finalAborted && !finalPromptError;
	if (state.shouldDelayNativeHookRelayUnregister) try {
		await markCodexAppServerBindingCoveredThroughTurn({
			bindingStore,
			identity: bindingIdentity,
			threadId: resourceState.thread.threadId,
			continuityCalibration: context.promptState.noEngineContinuityProjectionApplied ? buildCodexContinuityCalibration({
				promptChars: prompt.turnState.codexTurnPromptText.length,
				inputTokens: (result.attemptUsage?.input ?? 0) + (result.attemptUsage?.cacheRead ?? 0) + (result.attemptUsage?.cacheWrite ?? 0)
			}) : void 0
		});
	} catch (error) {
		if (resourceState.thread.connectionScope === "supervision") throw error;
		if (!await bindingStore.mutate(bindingIdentity, {
			kind: "clear",
			threadId: resourceState.thread.threadId
		})) throw error;
		embeddedAgentLog.warn("codex app-server binding coverage update failed after completed turn; cleared stale binding", {
			threadId: resourceState.thread.threadId,
			turnId: activeTurnId,
			error
		});
	}
	__vCodexTurnTail().mark(params.runId, "binding-mark"); // V codex-turn-tail-v1
	recordCodexTrajectoryCompletion(trajectoryRecorder, {
		attempt: params,
		result,
		threadId: resourceState.thread.threadId,
		turnId: activeTurnId,
		timedOut: effectiveTimedOut,
		yieldDetected: toolState.yieldDetected
	});
	trajectoryRecorder?.recordEvent("session.ended", {
		status: finalPromptError ? "error" : finalAborted || effectiveTimedOut ? "interrupted" : "success",
		threadId: resourceState.thread.threadId,
		turnId: activeTurnId,
		timedOut: effectiveTimedOut,
		yieldDetected: toolState.yieldDetected,
		promptError: normalizeCodexTrajectoryError(finalPromptError)
	});
	markTrajectoryEndRecorded();
	const terminalAssistantText = collectTerminalAssistantText(result);
	if (terminalAssistantText && (!streamState.eventEmitted || streamState.needsTerminalSnapshot) && !finalAborted && !finalPromptError) emitCodexAppServerEvent(params, {
		stream: "assistant",
		data: { text: terminalAssistantText }
	});
	emitLifecycleTerminal(finalPromptError ? {
		phase: "error",
		error: formatErrorMessage(finalPromptError),
		...buildLifecycleTerminalMeta({
			aborted: finalAborted,
			timedOut: effectiveTimedOut
		})
	} : {
		phase: "end",
		...buildLifecycleTerminalMeta({
			aborted: finalAborted,
			timedOut: effectiveTimedOut,
			yielded: toolState.yieldDetected
		})
	});
	const finalizedResult = Object.assign(result, {
		...toolState.yieldAcknowledgment ? { yieldAcknowledgment: toolState.yieldAcknowledgment } : {},
		terminal: attemptTerminal.normalize({
			timedOut: effectiveTimedOut,
			aborted: finalAborted,
			promptError: finalPromptError,
			promptErrorSource: finalPromptErrorSource
		}),
		...codexAppServerFailure ? { codexAppServerFailure } : {},
		...promptTimeoutOutcome ? { promptTimeoutOutcome } : {},
		...assistantTranscriptOwned ? { assistantTranscriptOwned: true } : {},
		...assistantTranscriptIdempotencyKey ? { assistantTranscriptIdempotencyKey } : {},
		...terminalAnchor ? { contextEngineTerminalAnchor: terminalAnchor } : {},
		...settledTurnFinalizationContext ? { settledTurnFinalizationContext } : {},
		...resourceState.runtimeArtifact ? { runtimeArtifact: resourceState.runtimeArtifact } : {},
		...resourceState.runtimeContinuationStarted ? { runtimeContinuationStarted: true } : {},
		...!finalAborted && !effectiveTimedOut && !finalPromptError && preparedAuthBinding ? { authBindingFingerprint: preparedAuthBinding.fingerprint } : {},
		systemPromptReport
	});
	if (turnSucceeded && toolState.yieldDetected && !runAbortController.signal.aborted) resourceState.nativeHookRelay?.authorizeRetentionAfterSuccessfulYield();
	return finalizedResult;
}
//#endregion
//#region extensions/codex/src/app-server/attempt-notification-state.ts
/** Emits coarse execution phases exactly once from app-server notifications. */
function reportCodexExecutionNotification(params) {
	const { notification } = params;
	if (notification.method === "turn/started") {
		params.emitExecutionPhaseOnce("turn_accepted", { phase: "turn_accepted" });
		return;
	}
	if (notification.method === "item/agentMessage/delta") {
		params.emitExecutionPhaseOnce("assistant_output_started", { phase: "assistant_output_started" });
		return;
	}
	if (notification.method !== "item/started") return;
	const item = readCodexNotificationItem(notification.params);
	const tool = item ? codexExecutionToolName(item) : void 0;
	if (!item || !tool) return;
	params.emitExecutionPhaseOnce(`tool:${item.id}`, {
		phase: "tool_execution_started",
		tool,
		itemId: item.id
	});
}
/** Returns true when a notification ends the current app-server turn. */
function isTerminalCodexTurnNotificationForTurn(params) {
	return params.notification.method === "turn/completed" && isCodexNotificationForTurn(params.notification.params, params.threadId, params.turnId) && readCodexTurnCompletedNotification(params.notification.params) !== void 0;
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-lifecycle-terminal.ts
function buildCodexLifecycleTerminalMeta(input) {
	if (input.timedOut || input.abortStopReason === "timeout") return {
		aborted: true,
		status: "timed_out",
		stopReason: "timeout",
		timeoutPhase: "provider",
		providerStarted: true
	};
	if (input.yielded && !input.aborted) return {
		yielded: true,
		livenessState: "paused",
		stopReason: "end_turn"
	};
	return input.aborted ? {
		aborted: true,
		status: "cancelled",
		stopReason: "stop"
	} : void 0;
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-lifecycle-controller.ts
function createCodexAttemptLifecycleController(resources, turnRuntime) {
	const { prompt, trajectoryRecorder } = resources;
	const { connection } = prompt.context.runtime;
	const { params, attemptStartedAt, runAbortController, fastModeAutoStartedAtMs, fastModeAutoProgressState } = connection;
	const { state, activeTurnItemIds, pendingOpenClawDynamicToolCompletionIds } = turnRuntime;
	const releaseTurnAfterTerminalDynamicTool = (value) => {
		if (!shouldReleaseTurnAfterTerminalDynamicTool({
			completed: state.completed,
			aborted: runAbortController.signal.aborted,
			responseSuccess: value.response.success,
			currentTurnHadNonTerminalDynamicToolResult: state.currentTurnHadNonTerminalDynamicToolResult,
			activeAppServerTurnRequests: state.activeAppServerTurnRequests,
			activeTurnItemIdsCount: activeTurnItemIds.size,
			pendingOpenClawDynamicToolCompletionIdsCount: pendingOpenClawDynamicToolCompletionIds.size
		})) return;
		state.pendingTerminalDynamicToolRelease = void 0;
		trajectoryRecorder?.recordEvent("turn.dynamic_tool_terminal_release", {
			threadId: value.call.threadId,
			turnId: value.call.turnId,
			toolCallId: value.call.callId,
			name: value.call.tool,
			durationMs: value.durationMs
		});
		embeddedAgentLog.info("codex app-server turn released after terminal dynamic tool result", {
			threadId: value.call.threadId,
			turnId: value.call.turnId,
			toolCallId: value.call.callId,
			tool: value.call.tool,
			durationMs: value.durationMs
		});
		turnRuntime.steeringQueueRef.current?.cancel();
		turnRuntime.interruptTurn(value.call.turnId, { locallyCompleted: true });
		turnRuntime.completeTurn();
	};
	const scheduleTerminalDynamicToolReleaseCheck = () => {
		if (state.terminalDynamicToolReleaseCheckScheduled || !state.pendingTerminalDynamicToolRelease && !state.currentTurnHadNonTerminalDynamicToolResult) return;
		state.terminalDynamicToolReleaseCheckScheduled = true;
		setImmediate(() => {
			state.terminalDynamicToolReleaseCheckScheduled = false;
			if (state.pendingTerminalDynamicToolRelease?.response.success === true && !state.currentTurnHadNonTerminalDynamicToolResult && state.activeAppServerTurnRequests === 0 && pendingOpenClawDynamicToolCompletionIds.size === 0) turnRuntime.steeringQueueRef.current?.cancel();
			const action = resolveTerminalDynamicToolBatchAction({
				activeAppServerTurnRequests: state.activeAppServerTurnRequests,
				activeTurnItemIdsCount: activeTurnItemIds.size,
				pendingOpenClawDynamicToolCompletionIdsCount: pendingOpenClawDynamicToolCompletionIds.size,
				currentTurnHadNonTerminalDynamicToolResult: state.currentTurnHadNonTerminalDynamicToolResult,
				hasPendingTerminalDynamicToolRelease: state.pendingTerminalDynamicToolRelease !== void 0
			});
			if (action === "release-pending-terminal" && state.pendingTerminalDynamicToolRelease) releaseTurnAfterTerminalDynamicTool(state.pendingTerminalDynamicToolRelease);
			else if (action === "clear-nonterminal-batch") {
				state.pendingTerminalDynamicToolRelease = void 0;
				state.currentTurnHadNonTerminalDynamicToolResult = false;
			}
		}).unref?.();
	};
	const scheduleTurnReleaseAfterTerminalDynamicTool = (value) => {
		state.pendingTerminalDynamicToolRelease = value;
		scheduleTerminalDynamicToolReleaseCheck();
	};
	const emitLifecycleStart = () => {
		emitCodexAppServerEvent(params, {
			stream: "lifecycle",
			data: {
				phase: "start",
				startedAt: attemptStartedAt
			}
		});
		state.lifecycleStarted = true;
	};
	const emitLifecycleTerminal = (data) => {
		if (!state.lifecycleStarted || state.lifecycleTerminalEmitted || state.permissionChangeRestart) return;
		emitCodexAppServerEvent(params, {
			stream: "lifecycle",
			data: {
				startedAt: attemptStartedAt,
				endedAt: Date.now(),
				...data,
				...params.deferTerminalLifecycle ? { phase: "finishing" } : {}
			}
		});
		state.lifecycleTerminalEmitted = true;
	};
	const buildLifecycleTerminalMeta = (input) => {
		const abortFields = input.aborted ? resolveAgentRunAbortLifecycleFields(runAbortController.signal) : void 0;
		return buildCodexLifecycleTerminalMeta({
			...input,
			abortStopReason: abortFields?.stopReason
		});
	};
	const executionPhaseKeys = /* @__PURE__ */ new Set();
	const emitExecutionPhaseOnce = (key, info) => {
		if (executionPhaseKeys.has(key)) return;
		executionPhaseKeys.add(key);
		params.onExecutionPhase?.({
			provider: params.provider,
			model: params.modelId,
			backend: "codex-app-server",
			...info
		});
	};
	const reportExecutionNotification = (notification) => {
		reportCodexExecutionNotification({
			notification,
			emitExecutionPhaseOnce
		});
	};
	const emitFastModeAutoProgress = async (payload) => {
		const summary = formatFastModeAutoProgressText(payload);
		await emitCodexAppServerEvent(params, {
			stream: "item",
			data: {
				kind: "status",
				title: "Fast",
				phase: "update",
				summary
			}
		});
		try {
			await params.onToolResult?.({
				text: summary,
				channelData: { openclawProgressKind: FAST_MODE_AUTO_PROGRESS_KIND }
			});
		} catch (error) {
			embeddedAgentLog.debug("codex app-server fast mode auto progress delivery failed", { error });
		}
	};
	const maybeAnnounceFastModeAutoOff = async () => {
		if (params.fastModeAuto !== true || fastModeAutoStartedAtMs === void 0 || fastModeAutoProgressState.offAnnounced) return;
		const next = resolveFastModeForElapsed({
			mode: "auto",
			startedAtMs: fastModeAutoStartedAtMs,
			fastAutoOnSeconds: params.fastModeAutoOnSeconds
		});
		if (next.enabled) return;
		fastModeAutoProgressState.offAnnounced = true;
		await emitFastModeAutoProgress(next);
	};
	const maybeEmitFastModeAutoReset = async () => {
		if (params.fastModeAuto !== true || !fastModeAutoProgressState.offAnnounced || fastModeAutoProgressState.resetAnnounced) return;
		fastModeAutoProgressState.resetAnnounced = true;
		await emitFastModeAutoProgress({
			enabled: true,
			elapsedSeconds: 0,
			fastAutoOnSeconds: params.fastModeAutoOnSeconds
		});
	};
	const maybeEmitFastModeAutoResetBestEffort = async () => {
		try {
			await maybeEmitFastModeAutoReset();
		} catch (error) {
			embeddedAgentLog.warn(`codex app-server fast mode auto reset progress failed: ${formatErrorMessage(error)}`);
		}
	};
	return {
		scheduleTerminalDynamicToolReleaseCheck,
		scheduleTurnReleaseAfterTerminalDynamicTool,
		emitLifecycleStart,
		emitLifecycleTerminal,
		buildLifecycleTerminalMeta,
		emitExecutionPhaseOnce,
		reportExecutionNotification,
		maybeAnnounceFastModeAutoOff,
		maybeEmitFastModeAutoResetBestEffort
	};
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-notification-controller.ts
function createCodexAttemptNotificationController(resources, turnRuntime, lifecycle) {
	const { prompt, state: resourceState, projectorRef, registerNativeSubagentMonitor } = resources;
	const { context, turnState } = prompt;
	const { attemptTools, runtime } = context;
	const { appServer, runAbortController } = runtime.connection;
	const { allocateCodexToolOutcomeOrdinal } = attemptTools;
	const { state, turnIdRef, userInputBridgeRef, steeringQueueRef, activeTurnItemIds, pendingOpenClawDynamicToolCompletionIds, completeTurn, noteProgress, deadlines } = turnRuntime;
	const { scheduleTerminalDynamicToolReleaseCheck, reportExecutionNotification, maybeAnnounceFastModeAutoOff } = lifecycle;
	const isTerminalTurnNotificationForTurn = (notification, notificationTurnId) => isTerminalCodexTurnNotificationForTurn({
		notification,
		threadId: resourceState.thread.threadId,
		turnId: notificationTurnId
	});
	const handleNotification = async (notification) => {
		if (state.projectionClosed) return;
		const projector = projectorRef.current;
		const turnId = turnIdRef.current;
		userInputBridgeRef.current?.handleNotification(notification);
		if (!projector || !turnId) {
			if (notification.method === "error") state.latestStartupErrorNotification = notification;
			return;
		}
		const isCurrentTurn = isCodexNotificationForTurn(notification.params, resourceState.thread.threadId, turnId);
		const isTerminal = isTerminalTurnNotificationForTurn(notification, turnId);
		if ((state.timeout || state.localCompletionRequested) && isTerminal && readCodexTurnCompletedNotification(notification.params)?.turn.status === "interrupted") {
			completeTurn();
			return;
		}
		state.activeLocalProjections += 1;
		try {
			if (isCurrentTurn) {
				updateActiveTurnItemIds(notification, activeTurnItemIds);
				noteProgress(`notification:${notification.method}`);
				reportExecutionNotification(notification);
				if (isPendingOpenClawDynamicToolCompletionNotification(notification, pendingOpenClawDynamicToolCompletionIds)) {
					const itemId = readNotificationItemId(notification);
					if (itemId) pendingOpenClawDynamicToolCompletionIds.delete(itemId);
				}
				if (notification.method === "item/completed") {
					if (activeTurnItemIds.size === 0) scheduleTerminalDynamicToolReleaseCheck();
					const item = readCodexNotificationItem(notification.params);
					if (item?.type === "userMessage" && typeof item.clientId === "string") await steeringQueueRef.current?.confirmConsumed(item.clientId);
				}
				if (isCodexTurnAbortMarkerNotification(notification, { currentPromptTexts: [turnState.codexTurnPromptText] })) state.sawCodexInterruptMarker = true;
			}
			await projector.handleNotification(notification);
			if (isCurrentTurn && activeTurnItemIds.size === 0 && isRawFunctionToolOutputCompletionNotification(notification)) await maybeAnnounceFastModeAutoOff();
		} catch (error) {
			embeddedAgentLog.debug("codex app-server projector notification threw", {
				method: notification.method,
				error
			});
		} finally {
			state.activeLocalProjections -= 1;
			if (isTerminal) {
				if ((readCodexTurnCompletedNotification(notification.params)?.turn)?.status === "interrupted" && state.sawCodexInterruptMarker) projector.markAborted();
				completeTurn();
			}
		}
	};
	const waitForActiveNativeTurnCompletion = async () => {
		const route = resourceState.turnRoute;
		const activeNativeTurnId = resourceState.thread.lifecycle.activeTurnIds?.at(-1) ?? route?.observedNativeTurnId;
		if (!route || !activeNativeTurnId) return false;
		const watch = resourceState.turnRouter.watchNativeTurnCompletion({
			threadId: route.threadId,
			turnId: activeNativeTurnId,
			timeoutMs: Math.min(appServer.requestTimeoutMs, CODEX_APP_SERVER_NATIVE_TURN_WAIT_TIMEOUT_MS),
			signal: runAbortController.signal
		});
		try {
			return await watch.completion;
		} finally {
			watch.cancel();
		}
	};
	const noteNotificationReceived = (notification, scope, receivedAtMs) => {
		const projector = projectorRef.current;
		const turnId = turnIdRef.current;
		if (!projector || !turnId || state.projectionClosed) return;
		projector.recordMcpToolCallReceipt(notification);
		if (isTerminalTurnNotificationForTurn(notification, turnId)) {
			state.terminalTurnNotificationQueued = true;
			steeringQueueRef.current?.sealAdmission();
			deadlines.beginSettlement(receivedAtMs);
		}
		if (scope.turnId === turnId) {
			const modelToolCallId = readRawResponseToolCallId(notification);
			if (modelToolCallId) allocateCodexToolOutcomeOrdinal?.(modelToolCallId);
			const nativeItem = readCodexNotificationItem(notification.params);
			if (nativeItem?.type === "webSearch") projector.recordNativeToolOutcome(nativeItem);
		}
	};
	const enqueueNotification = async (notification, scope) => {
		embeddedAgentLog.trace("codex app-server raw notification received", {
			method: notification.method,
			...scope
		});
		await handleNotification(notification);
	};
	const drainNotificationQueue = async () => {
		await resourceState.turnRoute?.drain();
	};
	registerNativeSubagentMonitor(resourceState.thread.threadId);
	return {
		waitForActiveNativeTurnCompletion,
		noteNotificationReceived,
		enqueueNotification,
		drainNotificationQueue
	};
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-prompt.ts
function isRestrictivePromptToolsAllow(toolsAllow) {
	return toolsAllow !== void 0 && !toolsAllow.some((name) => name.trim() === "*");
}
async function prepareCodexAttemptPrompt(context) {
	const { runtime, attemptTools, historyState, hookContext, workspaceBootstrapContext, buildActiveContextEngineRuntimeContext, baseDeveloperInstructions, openClawPromptContext, skillsCollaborationInstructions, promptState, codexContextProjectionMaxChars, codexContinuityProjectionMaxChars } = context;
	const { connection, buildActiveRunAttemptParams, effectiveContextTokenBudget, effectiveRuntimeModelId, effectiveRuntimeProviderId } = runtime;
	const { params, activeContextEngine, usesSupervisionConnection, mutable, isInactiveThreadBootstrapBinding, bindingStore, bindingIdentity, agentDir, appServer, contextSessionKey, effectiveWorkspace, sandbox } = connection;
	const { toolBridge } = attemptTools;
	const applyFreshThreadContinuityProjection = () => {
		const projection = projectContextEngineAssemblyForCodex({
			assembledMessages: historyState.messages,
			originalHistoryMessages: historyState.messages,
			prompt: params.prompt,
			maxRenderedContextChars: codexContinuityProjectionMaxChars
		});
		promptState.promptText = projection.promptText;
		promptState.promptContextRange = projection.promptContextRange;
		promptState.prePromptMessageCount = projection.prePromptMessageCount;
		promptState.noEngineContinuityProjectionApplied = true;
	};
	const applyActiveContextEngineProjection = async (decisionStartupBinding) => {
		if (!activeContextEngine) return;
		const assembled = await assembleHarnessContextEngine({
			contextEngine: activeContextEngine,
			sessionId: runtime.activeSessionId,
			sessionKey: contextSessionKey,
			messages: historyState.messages,
			tokenBudget: effectiveContextTokenBudget,
			availableTools: new Set(flattenCodexDynamicToolFunctions(toolBridge.availableSpecs).map((tool) => tool.name).filter(isNonEmptyString)),
			citationsMode: params.config?.memory?.citations,
			sandboxed: sandbox?.enabled === true,
			modelId: effectiveRuntimeModelId,
			contextEngineHostSupport: CODEX_APP_SERVER_CONTEXT_ENGINE_HOST,
			providerId: effectiveRuntimeProviderId,
			requestedModelId: usesSupervisionConnection ? void 0 : params.requestedModelId,
			fallbackReason: usesSupervisionConnection ? void 0 : params.fallbackReason,
			degradedReason: usesSupervisionConnection ? void 0 : params.degradedReason,
			runtimeContext: buildActiveContextEngineRuntimeContext(),
			transcriptReadFence: params.userTurnTranscriptRecorder?.getAdmissionReceipt(),
			prompt: params.prompt
		});
		if (!assembled) throw new Error("context engine assemble returned no result");
		const contextEngineProjection = readContextEngineThreadBootstrapProjection(assembled.contextProjection);
		const projection = projectContextEngineAssemblyForCodex({
			assembledMessages: assembled.messages,
			originalHistoryMessages: historyState.messages,
			prompt: params.prompt,
			systemPromptAddition: assembled.systemPromptAddition,
			maxRenderedContextChars: codexContextProjectionMaxChars,
			toolPayloadMode: contextEngineProjection ? "preserve" : "elide"
		});
		const projectionDecision = contextEngineProjection ? resolveContextEngineBootstrapProjectionDecision({
			startupBinding: decisionStartupBinding,
			expectedBinding: buildContextEngineBinding(buildActiveRunAttemptParams(), contextEngineProjection),
			projection: contextEngineProjection,
			dynamicToolsFingerprint: codexDynamicToolsFingerprint(toolBridge.specs),
			legacyDynamicToolsFingerprint: codexLegacyDynamicToolsFingerprint(toolBridge.specs)
		}) : {
			project: true,
			reason: "per-turn-projection"
		};
		const decisionBinding = decisionStartupBinding;
		embeddedAgentLog.info("codex app-server context-engine projection decision", {
			sessionId: params.sessionId,
			sessionKey: contextSessionKey,
			engineId: activeContextEngine.info.id,
			mode: contextEngineProjection?.mode ?? assembled.contextProjection?.mode ?? "per_turn",
			epoch: contextEngineProjection?.epoch,
			fingerprint: contextEngineProjection?.fingerprint,
			previousThreadId: decisionBinding?.threadId,
			previousEpoch: decisionBinding?.contextEngine?.projection?.epoch,
			previousFingerprint: decisionBinding?.contextEngine?.projection?.fingerprint,
			projected: projectionDecision.project,
			reason: projectionDecision.reason,
			assembledMessages: assembled.messages.length,
			originalHistoryMessages: historyState.messages.length,
			projectedPromptChars: projection.promptText.length,
			developerInstructionAdditionChars: projection.developerInstructionAddition?.length ?? 0
		});
		promptState.contextEngineProjection = contextEngineProjection;
		promptState.promptText = projectionDecision.project ? projection.promptText : params.prompt;
		promptState.promptContextRange = projectionDecision.project ? projection.promptContextRange : void 0;
		promptState.developerInstructions = joinPresentSections(baseDeveloperInstructions, projection.developerInstructionAddition);
		promptState.prePromptMessageCount = projection.prePromptMessageCount;
	};
	if (activeContextEngine) try {
		await applyActiveContextEngineProjection(runtime.nativeToolSurfaceEnabled ? mutable.startupBinding : void 0);
	} catch (assembleErr) {
		embeddedAgentLog.warn("context engine assemble failed; using Codex baseline prompt", { error: formatErrorMessage(assembleErr) });
	}
	const codexModelInputHistoryMessages = [];
	const buildPromptFromCurrentInputs = async () => {
		return await resolveAgentHarnessBeforePromptBuildResult({
			prompt: prependCurrentInboundContext(promptState.promptText, params.currentInboundContext),
			developerInstructions: { build: ({ toolsAllow }) => {
				if (isRestrictivePromptToolsAllow(toolsAllow)) throw new Error("Codex app-server cannot enforce before_prompt_build toolsAllow; use the embedded or Copilot runtime for turn-scoped tool policy.");
				return promptState.developerInstructions;
			} },
			messages: historyState.messages,
			ctx: hookContext,
			bootstrapContextRunKind: params.bootstrapContextRunKind,
			toolAuthority: {
				fingerprint: params.toolAuthorityFingerprint,
				activeToolNames: () => flattenCodexDynamicToolFunctions(toolBridge.availableSpecs).map((tool) => tool.name).filter(isNonEmptyString),
				assertActive: params.hostCapabilities.assertActive
			}
		});
	};
	const resolveShiftedPromptInputRange = (prompt, promptInputRange, turnPromptText) => {
		if (!promptInputRange || promptInputRange.start < 0 || promptInputRange.end < promptInputRange.start || promptInputRange.end > prompt.length || !turnPromptText.endsWith(prompt)) return;
		const turnPromptOffset = turnPromptText.length - prompt.length;
		return {
			start: turnPromptOffset + promptInputRange.start,
			end: turnPromptOffset + promptInputRange.end
		};
	};
	const resolveShiftedPromptContextRange = (prompt, promptInputRange, turnPromptText) => {
		const promptTextInputOffset = promptInputRange ? promptInputRange.end - promptState.promptText.length : void 0;
		if (!promptState.promptContextRange || !promptInputRange || promptTextInputOffset === void 0 || promptInputRange.start < 0 || promptInputRange.end < promptInputRange.start || promptInputRange.end > prompt.length || promptTextInputOffset < promptInputRange.start || prompt.slice(promptTextInputOffset, promptInputRange.end) !== promptState.promptText || !turnPromptText.endsWith(prompt)) return;
		const promptTextOffset = prompt.endsWith(promptState.promptText) ? prompt.length - promptState.promptText.length : promptTextInputOffset;
		if (promptTextOffset < 0) return;
		const turnPromptOffset = turnPromptText.length - prompt.length + promptTextOffset;
		const contextRange = {
			start: turnPromptOffset + promptState.promptContextRange.start,
			end: turnPromptOffset + promptState.promptContextRange.end
		};
		return {
			contextRange,
			requestRange: {
				start: contextRange.end,
				end: turnPromptOffset + promptState.promptText.length
			}
		};
	};
	const decorateCodexTurnPromptText = (promptBuildResult) => {
		const turnPromptText = prependCodexOpenClawPromptContext(promptBuildResult.prompt, openClawPromptContext, { preservePromptWithoutContext: params.bootstrapContextMode === "lightweight" && params.bootstrapContextRunKind === "cron" });
		const projectedRanges = resolveShiftedPromptContextRange(promptBuildResult.prompt, promptBuildResult.promptInputRange, turnPromptText);
		const preservedRange = resolveShiftedPromptInputRange(promptBuildResult.prompt, promptBuildResult.promptInputRange, turnPromptText) ?? resolveCodexDeliveryHintPreservedInputRange({
			prompt: promptBuildResult.prompt,
			promptInputRange: promptBuildResult.promptInputRange,
			decoratedPrompt: turnPromptText
		});
		return fitCodexProjectedContextForTurnStart({
			promptText: turnPromptText,
			contextRange: projectedRanges?.contextRange,
			requestRange: projectedRanges?.requestRange,
			preservedRange
		});
	};
	const firstPromptBuild = await buildPromptFromCurrentInputs();
	const turnState = {
		promptBuild: firstPromptBuild,
		codexTurnPromptText: decorateCodexTurnPromptText(firstPromptBuild)
	};
	const buildRenderedCodexDeveloperInstructions = () => joinPresentSections(turnState.promptBuild.developerInstructions, buildTurnCollaborationMode(params, {
		turnScopedDeveloperInstructions: workspaceBootstrapContext.turnScopedDeveloperInstructions,
		skillsCollaborationInstructions,
		memoryCollaborationInstructions: workspaceBootstrapContext.memoryCollaborationInstructions
	}).settings.developer_instructions ?? void 0);
	const rebuildCodexPromptBuildFromCurrentProjection = async () => {
		turnState.promptBuild = await buildPromptFromCurrentInputs();
		turnState.codexTurnPromptText = decorateCodexTurnPromptText(turnState.promptBuild);
	};
	const rebuildCodexTurnPromptTextFromCurrentProjection = async () => {
		const nextPromptBuild = await buildPromptFromCurrentInputs();
		turnState.promptBuild = {
			...turnState.promptBuild,
			prompt: nextPromptBuild.prompt,
			promptInputRange: nextPromptBuild.promptInputRange
		};
		turnState.codexTurnPromptText = decorateCodexTurnPromptText(nextPromptBuild);
	};
	const selectNewerVisibleHistoryAfterBinding = (binding) => {
		const cutoff = Date.parse(binding.historyCoveredThrough ?? "");
		return historyState.messages.filter((message) => {
			if (message.role !== "user" && message.role !== "assistant") return false;
			const mirrorIdentity = readMirrorIdentity(message);
			const timestamp = typeof message.timestamp === "number" ? message.timestamp : typeof message.timestamp === "string" ? Date.parse(message.timestamp) : NaN;
			return !("idempotencyKey" in message && typeof message.idempotencyKey === "string" && message.idempotencyKey.startsWith("codex-app-server:")) && !hasCodexMirrorOrigin(message) && !mirrorIdentity?.startsWith("codex-app-server:") && Number.isFinite(timestamp) && timestamp > (Number.isFinite(cutoff) ? cutoff : 0);
		});
	};
	const applyResumeStaleBindingContinuityProjection = (binding) => {
		const newerVisibleMessages = selectNewerVisibleHistoryAfterBinding(binding);
		if (newerVisibleMessages.length === 0) return false;
		const projection = projectContextEngineAssemblyForCodex({
			assembledMessages: newerVisibleMessages,
			originalHistoryMessages: historyState.messages,
			prompt: params.prompt,
			maxRenderedContextChars: codexContinuityProjectionMaxChars
		});
		promptState.promptText = projection.promptText;
		promptState.promptContextRange = projection.promptContextRange;
		promptState.prePromptMessageCount = projection.prePromptMessageCount;
		promptState.noEngineContinuityProjectionApplied = true;
		return true;
	};
	const precomputeNoContextEngineStaleBindingProjection = () => {
		promptState.precomputedStaleBindingContinuityProjectionApplied = false;
		promptState.staleBindingContinuityForcedFreshStart = false;
		const binding = mutable.startupBinding;
		if (activeContextEngine || !binding?.threadId || binding.pendingSupervisionBranch) return false;
		if (isInactiveThreadBootstrapBinding(binding)) {
			promptState.inactiveThreadBootstrapBindingForcedFreshStart = true;
			return false;
		}
		const projected = applyResumeStaleBindingContinuityProjection(binding);
		promptState.precomputedStaleBindingContinuityProjectionApplied = projected;
		return projected;
	};
	const applyNoContextEngineContinuityProjection = (action, binding) => {
		const hasContinuity = historyState.messages.some((message) => message.role === "user" || action === "started" && (message.role === "compactionSummary" || message.role === "branchSummary"));
		if (activeContextEngine || !hasContinuity) return false;
		if (action === "resumed" && promptState.precomputedStaleBindingContinuityProjectionApplied) return true;
		if (action === "started" && promptState.staleBindingContinuityForcedFreshStart) return true;
		if (action === "started" && promptState.inactiveThreadBootstrapBindingForcedFreshStart) return false;
		if (action === "resumed" && binding) return applyResumeStaleBindingContinuityProjection(binding);
		if (action === "started") {
			applyFreshThreadContinuityProjection();
			return true;
		}
		return false;
	};
	if (!activeContextEngine && mutable.startupBinding?.threadId && !mutable.startupBinding.pendingSupervisionBranch) await historyState.ensureHistoryFor(isInactiveThreadBootstrapBinding(mutable.startupBinding) ? "started" : "resumed", mutable.startupBinding); // v-codex-bounded-history-v1
	if (precomputeNoContextEngineStaleBindingProjection()) await rebuildCodexPromptBuildFromCurrentProjection();
	const rotateStartupBindingForProjectedTurn = async () => {
		const binding = mutable.startupBinding;
		if (!binding?.threadId) return;
		const previousThreadId = binding.threadId;
		const hadInactiveThreadBootstrapBinding = isInactiveThreadBootstrapBinding(binding);
		const startupBindingResolution = await rotateOversizedCodexAppServerStartupBinding({
			binding,
			bindingStore,
			identity: bindingIdentity,
			sessionFile: params.sessionFile,
			agentDir,
			codexHome: appServer.start.env?.CODEX_HOME,
			config: params.config,
			contextEngineActive: Boolean(activeContextEngine),
			projectedTurnTokens: estimateCodexAppServerProjectedTurnTokens({
				prompt: turnState.codexTurnPromptText,
				developerInstructions: buildRenderedCodexDeveloperInstructions()
			})
		});
		mutable.startupBinding = startupBindingResolution.binding;
		mutable.startupContextTokens = startupBindingResolution.startupContextTokens;
		if (mutable.startupBinding?.threadId) return;
		promptState.inactiveThreadBootstrapBindingForcedFreshStart = hadInactiveThreadBootstrapBinding;
		promptState.staleBindingContinuityForcedFreshStart = promptState.precomputedStaleBindingContinuityProjectionApplied && !promptState.inactiveThreadBootstrapBindingForcedFreshStart;
		if (promptState.staleBindingContinuityForcedFreshStart) {
			await historyState.ensureHistoryFor("started"); // v-codex-bounded-history-v1
			applyFreshThreadContinuityProjection();
		}
		if (activeContextEngine) {
			promptState.contextEngineProjection = void 0;
			try {
				await applyActiveContextEngineProjection(void 0);
			} catch (assembleErr) {
				embeddedAgentLog.warn("context engine assemble failed; using Codex baseline prompt", { error: formatErrorMessage(assembleErr) });
			}
		}
		await rebuildCodexPromptBuildFromCurrentProjection();
		embeddedAgentLog.info("codex app-server rebuilt turn prompt after native thread rotation", {
			sessionId: params.sessionId,
			sessionKey: contextSessionKey,
			previousThreadId,
			promptChars: turnState.codexTurnPromptText.length,
			developerInstructionChars: buildRenderedCodexDeveloperInstructions()?.length ?? 0
		});
	};
	await rotateStartupBindingForProjectedTurn();
	return {
		context,
		codexModelInputHistoryMessages,
		turnState,
		buildRenderedCodexDeveloperInstructions,
		rebuildCodexTurnPromptTextFromCurrentProjection,
		applyNoContextEngineContinuityProjection,
		systemPromptReport: buildCodexSystemPromptReport({
			attempt: params,
			sessionKey: contextSessionKey,
			workspaceDir: effectiveWorkspace,
			developerInstructions: buildRenderedCodexDeveloperInstructions(),
			workspaceBootstrapContext,
			skillsPrompt: skillsCollaborationInstructions ? params.skillsSnapshot?.prompt ?? "" : "",
			tools: toolBridge.availableSpecs
		})
	};
}
//#endregion
//#region extensions/codex/src/app-server/hook-requester.ts
/** Rebuilds the host-proven requester identity shared by native and bridged tool hooks. */
function buildCodexHookRequester(params) {
	const channel = params.messageChannel ?? params.messageProvider;
	const requester = {
		...channel ? { channel } : {},
		...params.agentAccountId ? { accountId: params.agentAccountId } : {},
		...params.senderId ? { senderId: params.senderId } : {},
		...params.senderIsOwner !== void 0 ? { senderIsOwner: params.senderIsOwner } : {},
		...params.memberRoleIds?.length ? { roleIds: [...params.memberRoleIds] } : {}
	};
	return Object.keys(requester).length > 0 ? requester : void 0;
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-resources.ts
function prepareCodexAttemptResources(prompt) {
	const { context, turnState, buildRenderedCodexDeveloperInstructions } = prompt;
	const { runtime, attemptTools } = context;
	const { connection, hookChannelId } = runtime;
	const { appServer, params, effectiveCwd, sessionAgentId, contextSessionKey, runAbortController, sandbox, options, nativeHookRelayEvents } = connection;
	const { toolBridge } = attemptTools;
	const trajectoryRecorder = createCodexTrajectoryRecorder({
		attempt: params,
		cwd: effectiveCwd,
		developerInstructions: buildRenderedCodexDeveloperInstructions(),
		prompt: turnState.codexTurnPromptText,
		trajectory: params.hostCapabilities.trajectory,
		tools: toolBridge.availableSpecs
	});
	const state = {
		client: void 0,
		thread: void 0,
		runtimeArtifact: void 0,
		turnRouter: void 0,
		turnRoute: void 0,
		routeActivated: false,
		detachRouteAbort: (() => void 0),
		trajectoryEndRecorded: false,
		nativeHookRelay: void 0,
		nativeSubagentMonitor: void 0,
		runtimeContinuationStarted: false,
		nativePreToolUseFailureFallbackActive: false,
		nativePreToolUseFailureFallbackTerminalReason: void 0,
		releaseSharedClientLease: void 0,
		startupClientUnsafe: false,
		sharedCodexClientRetiredForOneShotCleanup: false,
		sandboxExecEnvironment: void 0,
		executionDisconnectError: void 0,
		codexEnvironmentSelection: void 0,
		codexExecutionCwd: effectiveCwd,
		codexSandboxPolicy: void 0,
		restartContextEngineCodexThread: void 0
	};
	const pendingNativePreToolUseFailures = [];
	const projectorRef = {};
	const emitNativePreToolUseFailure = (failure) => {
		emitCodexNativePreToolUseFailureDiagnostic({
			agentId: sessionAgentId,
			sessionId: params.sessionId,
			sessionKey: contextSessionKey,
			runId: params.runId,
			signal: runAbortController.signal,
			failure,
			...state.nativePreToolUseFailureFallbackActive ? { terminalReason: state.nativePreToolUseFailureFallbackTerminalReason ?? failure.disposition } : {}
		});
	};
	const flushPendingNativePreToolUseFailures = () => {
		for (const failure of pendingNativePreToolUseFailures.splice(0)) emitNativePreToolUseFailure(failure);
	};
	const activateNativePreToolUseFailureFallback = () => {
		if (!state.nativePreToolUseFailureFallbackActive) {
			state.nativePreToolUseFailureFallbackTerminalReason = runAbortController.signal.aborted ? resolveCodexToolAbortTerminalReason(runAbortController.signal) : void 0;
			state.nativePreToolUseFailureFallbackActive = true;
		}
		flushPendingNativePreToolUseFailures();
	};
	const releaseSharedClientLeaseOnce = () => {
		const release = state.releaseSharedClientLease;
		if (!release) return;
		state.releaseSharedClientLease = void 0;
		release();
	};
	const retireSharedCodexClientForOneShotCleanup = async () => {
		if (params.cleanupBundleMcpOnRunEnd !== true || state.sharedCodexClientRetiredForOneShotCleanup) return;
		state.sharedCodexClientRetiredForOneShotCleanup = true;
		const retired = clearSharedCodexAppServerClientIfCurrentAndUnclaimed(state.client);
		embeddedAgentLog.debug("codex app-server one-shot cleanup checked shared client retirement", {
			runId: params.runId,
			sessionId: params.sessionId,
			sessionKey: params.sessionKey,
			activeLeases: retired.activeLeases,
			pendingAcquires: retired.pendingAcquires,
			closed: retired.closed,
			matchedSharedClient: retired.found
		});
		if (retired.closed) await state.client.closeAndWait({
			exitTimeoutMs: 2e3,
			forceKillDelayMs: 250
		});
	};
	const releaseSandboxExecEnvironment = async () => {
		if (state.sandboxExecEnvironment) {
			const environment = state.sandboxExecEnvironment;
			state.sandboxExecEnvironment = void 0;
			await releaseCodexSandboxExecServerEnvironment(sandbox, environment);
		}
	};
	const releaseSharedClientLeaseAndRetireOneShotClient = async () => {
		if (connection.attemptClientFactory === createIsolatedCodexAppServerClient) {
			await releaseSandboxExecEnvironment();
			const ownedClient = state.releaseSharedClientLease ? state.client : void 0;
			releaseSharedClientLeaseOnce();
			await ownedClient?.closeAndWait({
				exitTimeoutMs: 2e3,
				forceKillDelayMs: 250
			});
			return;
		}
		releaseSharedClientLeaseOnce();
		await retireSharedCodexClientForOneShotCleanup();
	};
	const runCleanupStep = (step, operation) => runAgentCleanupStep({
		runId: params.runId,
		sessionId: params.sessionId,
		step,
		log: embeddedAgentLog,
		cleanup: async () => {
			await operation();
		}
	});
	const unregisterNativeSubagentMonitor = () => {
		state.nativeSubagentMonitor?.unregister();
		state.nativeSubagentMonitor = void 0;
	};
	const registerNativeSubagentMonitor = (parentThreadId) => {
		unregisterNativeSubagentMonitor();
		state.nativeSubagentMonitor = codexNativeSubagentMonitorRuntime.register({
			client: state.client,
			parentThreadId,
			requesterSessionKey: params.sessionKey,
			taskRuntimeScope: params.agentHarnessTaskRuntimeScope,
			agentId: sessionAgentId,
			retainClient: () => retainSharedCodexAppServerClientIfCurrent(state.client),
			retainParentThread: (protectedThreadId) => protectCodexAppServerLiveThread(state.client, protectedThreadId),
			claimDirectChild: (childThreadId) => state.nativeHookRelay?.claimDirectChild(childThreadId),
			rejectPendingDirectChild: (childThreadId, reason) => state.nativeHookRelay?.rejectPendingDirectChild(childThreadId, reason),
			...params.sessionKey && params.agentHarnessTaskRuntimeScope ? { onDirectChildAccepted: () => {
				state.runtimeContinuationStarted = true;
			} } : {}
		});
	};
	const releaseCurrentRoute = () => {
		state.detachRouteAbort();
		state.detachRouteAbort = () => void 0;
		state.turnRoute?.release();
		state.turnRoute = void 0;
		state.routeActivated = false;
		unregisterNativeSubagentMonitor();
	};
	const startupTimeoutMs = resolveCodexStartupTimeoutMs({
		timeoutMs: params.timeoutMs,
		timeoutFloorMs: options.startupTimeoutFloorMs
	});
	const requesterChannel = params.messageChannel ?? params.messageProvider;
	const requester = buildCodexHookRequester(params);
	const buildNativeHookRelayFinalConfigPatch = (decision) => {
		state.nativeHookRelay?.unregister();
		if (params.pluginHarnessToolPolicyRestricted === true) {
			state.nativeHookRelay = void 0;
			return {
				configPatch: buildCodexNativeHookRelayDisabledConfig(),
				nativeHookRelayGeneration: void 0
			};
		}
		state.nativeHookRelay = createCodexNativeHookRelay({
			options: options.nativeHookRelay,
			generation: decision.action === "resume" ? decision.binding.nativeHookRelayGeneration : void 0,
			generationMismatchGraceMs: decision.action === "resume" && !decision.binding.nativeHookRelayGeneration ? CODEX_NATIVE_HOOK_RELAY_TTL_GRACE_MS : void 0,
			events: nativeHookRelayEvents,
			agentId: sessionAgentId,
			sessionId: params.sessionId,
			sessionKey: contextSessionKey,
			config: params.config,
			autoApproveMcpTools: shouldAutoApproveCodexAppServerApprovals(appServer),
			projectedMcpServers: runtime.bundleMcpThreadConfig.configPatch?.mcp_servers,
			runId: params.runId,
			channelId: hookChannelId,
			...requester ? { requester } : {},
			approvalContext: {
				trigger: params.trigger,
				approvalReviewerDeviceId: params.approvalReviewerDeviceId,
				turnSourceChannel: requesterChannel,
				turnSourceTo: params.currentMessagingTarget ?? params.currentChannelId,
				turnSourceAccountId: params.agentAccountId,
				turnSourceThreadId: params.currentThreadTs
			},
			attemptTimeoutMs: params.timeoutMs,
			startupTimeoutMs,
			turnStartTimeoutMs: params.timeoutMs,
			loopDetectionPreToolUseRelay: appServer.loopDetectionPreToolUseRelay,
			signal: runAbortController.signal,
			hostCapabilities: params.hostCapabilities,
			onPreToolUseFailure: (failure) => {
				const projector = projectorRef.current;
				if (projector) projector.recordNativeToolPreToolUseFailure(failure);
				else if (state.nativePreToolUseFailureFallbackActive) emitNativePreToolUseFailure(failure);
				else pendingNativePreToolUseFailures.push(failure);
			}
		});
		return {
			configPatch: state.nativeHookRelay ? buildCodexNativeHookRelayConfig({
				relay: state.nativeHookRelay,
				events: nativeHookRelayEvents,
				hookTimeoutSec: options.nativeHookRelay?.hookTimeoutSec
			}) : options.nativeHookRelay?.enabled === false ? buildCodexNativeHookRelayDisabledConfig() : void 0,
			nativeHookRelayGeneration: state.nativeHookRelay?.generation
		};
	};
	return {
		prompt,
		trajectoryRecorder,
		state,
		projectorRef,
		pendingNativePreToolUseFailures,
		markTrajectoryEndRecorded: () => {
			state.trajectoryEndRecorded = true;
		},
		activateNativePreToolUseFailureFallback,
		releaseSharedClientLeaseOnce,
		releaseSharedClientLeaseAndRetireOneShotClient,
		releaseSandboxExecEnvironment,
		runCleanupStep,
		registerNativeSubagentMonitor,
		releaseCurrentRoute,
		startupTimeoutMs,
		buildNativeHookRelayFinalConfigPatch
	};
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-route.ts
async function prepareCodexAttemptRoute(resources, turnRuntime, notifications, handleServerRequest) {
	const { prompt, state: resourceState, trajectoryRecorder, releaseCurrentRoute, registerNativeSubagentMonitor, activateNativePreToolUseFailureFallback, releaseSandboxExecEnvironment, releaseSharedClientLeaseOnce } = resources;
	const { connection } = prompt.context.runtime;
	const { params, runAbortController, abortFromUpstream } = connection;
	const { state, turnIdRef, completeTurn } = turnRuntime;
	const { noteNotificationReceived, enqueueNotification } = notifications;
	const attachRouteAbort = (route) => {
		const onAbort = () => {
			if (state.completed || state.terminalTurnNotificationQueued || runAbortController.signal.aborted) return;
			const reasonText = formatErrorMessage(route.signal.reason);
			const closedClient = reasonText.includes("turn router closed");
			const closeCause = route.signal.reason instanceof Error && route.signal.reason.cause instanceof Error ? route.signal.reason.cause : void 0;
			state.clientClosedPromptError = closedClient ? "codex app-server client closed before turn completed" : `codex app-server turn route closed before turn completed: ${reasonText}`;
			state.clientClosedDiagnostic = closedClient && closeCause ? formatErrorMessage(closeCause) : void 0;
			state.clientClosedAbort = closedClient;
			const activeTurnId = turnIdRef.current;
			if (activeTurnId) trajectoryRecorder?.recordEvent("turn.client_closed", {
				threadId: resourceState.thread.threadId,
				turnId: activeTurnId
			});
			embeddedAgentLog.warn(state.clientClosedPromptError, {
				threadId: resourceState.thread.threadId,
				turnId: activeTurnId,
				...state.clientClosedDiagnostic ? { transportError: state.clientClosedDiagnostic } : {}
			});
			runAbortController.abort(closedClient ? "client_closed" : "turn_route_closed");
			completeTurn();
		};
		route.signal.addEventListener("abort", onAbort, { once: true });
		if (route.signal.aborted) onAbort();
		return () => route.signal.removeEventListener("abort", onAbort);
	};
	const ensureCurrentThreadRoute = async () => {
		if (resourceState.turnRoute?.threadId !== resourceState.thread.threadId) {
			releaseCurrentRoute();
			resourceState.turnRoute = resourceState.turnRouter.reserveThread({ threadId: resourceState.thread.threadId });
		}
		if (!resourceState.turnRoute) throw new Error("codex app-server turn route was not reserved");
		if (!resourceState.routeActivated) {
			if (!resourceState.nativeSubagentMonitor) registerNativeSubagentMonitor(resourceState.thread.threadId);
			resourceState.detachRouteAbort = attachRouteAbort(resourceState.turnRoute);
			await resourceState.turnRoute.activate({
				onNotificationReceived: noteNotificationReceived,
				onNotification: enqueueNotification,
				onRequest: handleServerRequest
			});
			resourceState.routeActivated = true;
		}
		return resourceState.turnRoute;
	};
	try {
		await ensureCurrentThreadRoute();
	} catch (error) {
		activateNativePreToolUseFailureFallback();
		releaseCurrentRoute();
		resourceState.nativeHookRelay?.unregister();
		await releaseSandboxExecEnvironment();
		releaseSharedClientLeaseOnce();
		params.abortSignal?.removeEventListener("abort", abortFromUpstream);
		throw error;
	}
	return { ensureCurrentThreadRoute };
}
//#endregion
// v-codex-ds-window-v2: DeepSeek app-servers start with DeepSeek's context window (patch-codex-ds-window.mjs).
const CODEX_DEEPSEEK_WINDOW_FILES = ["v-deepseek-model-catalog.json", "v-deepseek-base-instructions.md"].map((name) => fileURLToPathDeepSeekWindow(new URL(`./${name}`, import.meta.url)));
let codexDeepSeekWindowLogged = false;
let codexDeepSeekBaseInstructions;
function resolveCodexDeepSeekTranscriptByteLimit(binding) {
	if (process.env.OPENCLAW_V_CODEX_DS_WINDOW === "0") return;
	const deepSeek = String(binding?.modelProvider ?? "").trim().toLowerCase() === "deepseek" || /deepseek/iu.test(String(binding?.model ?? ""));
	return deepSeek ? parseCodexAppServerByteLimit(process.env.OPENCLAW_V_CODEX_DS_MAX_TRANSCRIPT_BYTES ?? "40mb") : void 0;
}
function withCodexDeepSeekModelWindow(appServer, selection) {
	const provider = String(selection?.modelProvider ?? "").trim().toLowerCase();
	const deepSeek = provider === "deepseek" || !provider && /^deepseek/iu.test(String(selection?.model ?? ""));
	if (!deepSeek || process.env.OPENCLAW_V_CODEX_DS_WINDOW === "0" || appServer.start.transport !== "stdio") return appServer;
	const [catalog, instructions] = CODEX_DEEPSEEK_WINDOW_FILES;
	if (!CODEX_DEEPSEEK_WINDOW_FILES.every((file) => existsSyncDeepSeekWindow(file))) {
		if (!codexDeepSeekWindowLogged) embeddedAgentLog.warn("codex app-server DeepSeek window files missing; using Codex fallback metadata", { catalog, instructions });
		codexDeepSeekWindowLogged = true;
		return appServer;
	}
	if (!codexDeepSeekWindowLogged) embeddedAgentLog.info("codex app-server DeepSeek threads use the DeepSeek model catalog", { catalog });
	codexDeepSeekWindowLogged = true;
	return {
		...appServer,
		start: {
			...appServer.start,
			args: [
				...appServer.start.args ?? [],
				"-c",
				`model_catalog_json=${JSON.stringify(catalog)}`,
				"-c",
				`instructions=${JSON.stringify(codexDeepSeekBaseInstructions ??= readFileSyncDeepSeekWindow(instructions, "utf8"))}`
			]
		}
	};
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-client-prewarm.ts
/** Starts the shared process while tools and prompt context are still being prepared. */
function prewarmCodexAttemptClient(params) {
	const { connection, authProfileStore, authBindingFingerprint } = params;
	const { appServer, attemptClientFactory, options, pluginConfig, runtimeArtifactRequest, startupAuthRequirement, startupClientAuthProfileId, startupPreparedAuth, agentDir, params: runParams, runAbortController } = connection;
	if (options.clientFactory || attemptClientFactory !== getLeasedSharedCodexAppServerClient || runtimeArtifactRequest) return;
	getSharedCodexAppServerClient({
		startOptions: appServer.start,
		pluginConfig,
		...startupPreparedAuth ? { preparedAuth: startupPreparedAuth } : { authProfileId: startupClientAuthProfileId },
		authRequirement: startupAuthRequirement,
		authProfileStore,
		authBindingFingerprint,
		agentDir,
		config: runParams.config,
		timeoutMs: appServer.requestTimeoutMs,
		abandonSignal: runAbortController.signal
	}).catch((error) => {
		embeddedAgentLog.debug("codex app-server client prewarm failed", { error });
	});
}
//#endregion
//#region extensions/codex/src/app-server/scheduled-configured-mcp-authority.ts
/** Limits fresh scheduled-authority capture to authenticated local durable operator turns. */
function canResolveScheduledConfiguredMcpCreatorAuthority(params) {
	return params.trigger === "user" && params.connectionClass === "local-loopback" && params.bindingKind === "session" && Boolean(params.bindingSessionKey) && !isIncognitoSessionKey(params.sessionKey) && !params.usesSupervisionConnection && !params.preservesNativeModel && (params.senderIsOwner === true || params.hasFreshCreatorAuthority === true) && !params.senderId && params.inputProvenance === void 0 && params.trustedInternalHandoff === void 0 && !params.spawnedBy && params.scheduledToolPolicy === void 0 && params.hasStaticConfiguredMcp;
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-runtime.ts
function resolveCodexAttemptBundleManifestRegistry(preparedModelRuntime) {
	const metadataSnapshot = preparedModelRuntime?.metadataSnapshot;
	return metadataSnapshot?.pluginIds === void 0 ? metadataSnapshot?.manifestRegistry : void 0;
}
async function prepareCodexAttemptRuntime(connection) {
	const { params, pluginConfig, usesSupervisionConnection, appServer, startupAuthProfileId, startupPreparedAuth, startupClientAuthProfileId, agentDir, preDynamicStartupStages, effectiveWorkspace, contextSessionKey, sandboxSessionKey, sessionAgentId, policyAgentId, sandbox, attemptClientFactory, runAbortController, activeContextEngine, mutable } = connection;
	const preparedAuthBinding = !usesSupervisionConnection && appServer.start.homeScope !== "user" && startupAuthProfileId ? await prepareCodexAppServerAuthBinding({
		authProfileId: startupAuthProfileId,
		authProfileStore: params.authProfileStore,
		agentDir,
		config: params.config
	}) : void 0;
	assertScheduledCodexAppAuthorityRuntime(connection, params);
	const attemptAuthProfileStore = preparedAuthBinding?.authProfileStore ?? params.authProfileStore;
	prewarmCodexAttemptClient({
		connection,
		authProfileStore: attemptAuthProfileStore,
		authBindingFingerprint: preparedAuthBinding?.fingerprint
	});
	const effectiveContextWindowInfo = usesSupervisionConnection ? void 0 : params.contextWindowInfo;
	const effectiveContextTokenBudget = usesSupervisionConnection ? void 0 : params.contextTokenBudget;
	const effectiveRuntimeProviderId = usesSupervisionConnection ? mutable.startupBinding?.modelProvider ?? "codex" : params.provider;
	const effectiveRuntimeModelId = usesSupervisionConnection ? mutable.startupBinding?.model ?? "codex-native" : connection.options.runtimeModelId ?? params.modelId;
	const { authProfileId: _outerAuthProfileId, authoredContextTokenCap: _outerAuthoredContextTokenCap, contextWindowInfo: _outerContextWindowInfo, contextTokenBudget: _outerContextTokenBudget, model: _outerModel, modelId: _outerModelId, provider: _outerProvider, runtimePlan: _outerRuntimePlan, requestedModelId: _outerRequestedModelId, fallbackReason: _outerFallbackReason, degradedReason: _outerDegradedReason, thinkLevel: _outerThinkLevel, fastMode: _outerFastMode, ...paramsWithoutOuterNativeOwnership } = params;
	const supervisedRuntimeModel = {
		id: effectiveRuntimeModelId,
		name: effectiveRuntimeModelId,
		provider: effectiveRuntimeProviderId,
		api: "openai-chatgpt-responses",
		reasoning: true,
		input: ["text", "image"],
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0
		},
		contextWindow: void 0,
		maxTokens: void 0
	};
	const legacyScheduledAppRecoveryPrompt = buildLegacyScheduledCodexAppRecoveryPrompt(params);
	const runtimeParams = usesSupervisionConnection ? {
		...paramsWithoutOuterNativeOwnership,
		provider: "codex",
		modelId: effectiveRuntimeModelId,
		model: supervisedRuntimeModel,
		thinkLevel: _outerThinkLevel,
		fastMode: _outerFastMode,
		sessionKey: contextSessionKey
	} : {
		...params,
		authProfileStore: attemptAuthProfileStore,
		sessionKey: contextSessionKey,
		...legacyScheduledAppRecoveryPrompt ? { extraSystemPrompt: [params.extraSystemPrompt, legacyScheduledAppRecoveryPrompt].filter((value) => Boolean(value?.trim())).join("\n\n") } : {},
		...startupAuthProfileId ? { authProfileId: startupAuthProfileId } : {}
	};
	const activeSessionId = params.sessionId;
	const activeSessionFile = params.sessionFile;
	const buildActiveRunAttemptParams = () => ({
		...runtimeParams,
		sessionId: activeSessionId,
		sessionFile: activeSessionFile
	});
	const startupAuthAccountCacheKey = usesSupervisionConnection ? void 0 : startupPreparedAuth?.kind === "api-key" ? resolveCodexAppServerPreparedApiKeyCacheKey(startupPreparedAuth.apiKey) : startupPreparedAuth?.kind === "profile" ? startupPreparedAuth.snapshot?.secretFreeCacheKey : await resolveCodexAppServerAuthAccountCacheKey({
		authProfileId: startupAuthProfileId,
		authProfileStore: attemptAuthProfileStore,
		agentDir,
		config: params.config
	});
	const startupEnvApiKeyCacheKey = usesSupervisionConnection ? void 0 : startupPreparedAuth || startupAuthProfileId ? void 0 : resolveCodexAppServerFallbackApiKeyCacheKey({ startOptions: appServer.start });
	preDynamicStartupStages.mark("auth-cache");
	const codexMcpToolOverrides = resolveCodexMcpToolOverridesForAgent(params.config, {
		agentId: sessionAgentId,
		toolOverrides: params.toolOverrides
	});
	const bundleManifestRegistry = resolveCodexAttemptBundleManifestRegistry(params.preparedModelRuntime);
	const bundleMcpThreadConfig = await loadCodexBundleMcpThreadConfig({
		workspaceDir: effectiveWorkspace,
		agentId: sessionAgentId,
		cfg: params.config,
		toolsEnabled: usesSupervisionConnection || supportsModelTools(params.model),
		disableTools: params.disableTools,
		toolsAllow: params.toolsAllow,
		manifestRegistry: bundleManifestRegistry,
		toolOverrides: codexMcpToolOverrides
	});
	const authenticatedScheduledMode = params.trigger === "cron" && params.scheduledToolPolicy !== void 0 && Array.isArray(params.toolsAllow);
	const scheduledConfiguredMcpSurface = authenticatedScheduledMode && (bundleMcpThreadConfig.staticServerNames.length > 0 || mutable.startupBinding?.configuredMcpOwnershipVersion === 1);
	const cronCreatorAuthorityCapability = params.cronCreatorAuthorityCapability;
	const hasFreshCreatorAuthority = cronCreatorAuthorityCapability?.active === true && cronCreatorAuthorityCapability.runId === params.runId && !cronCreatorAuthorityCapability.signal.aborted;
	const mayResolveScheduledConfiguredMcpCreatorAuthority = !authenticatedScheduledMode && canResolveScheduledConfiguredMcpCreatorAuthority({
		trigger: params.trigger,
		connectionClass: appServer.connectionClass,
		bindingKind: connection.bindingIdentity.kind,
		bindingSessionKey: connection.bindingIdentity.kind === "session" ? connection.bindingIdentity.sessionKey : void 0,
		sessionKey: params.sessionKey,
		usesSupervisionConnection,
		preservesNativeModel: mutable.startupBinding?.preserveNativeModel === true,
		senderIsOwner: params.senderIsOwner,
		hasFreshCreatorAuthority,
		senderId: params.senderId,
		inputProvenance: params.inputProvenance,
		trustedInternalHandoff: params.trustedInternalHandoff,
		spawnedBy: params.spawnedBy,
		scheduledToolPolicy: params.scheduledToolPolicy,
		hasStaticConfiguredMcp: bundleMcpThreadConfig.staticServerNames.length > 0
	});
	preDynamicStartupStages.mark("bundle-mcp");
	const sandboxExecServerEnabled = isCodexSandboxExecServerEnabled(pluginConfig, sandbox);
	const nativeToolSurfaceEnabled = shouldEnableCodexAppServerNativeToolSurface(runtimeParams, sandbox, {
		agentId: policyAgentId,
		runtimeSessionKey: sandboxSessionKey,
		sandboxExecServerEnabled
	});
	const configuredMcpSurface = scheduledConfiguredMcpSurface ? "scheduled" : !nativeToolSurfaceEnabled && bundleMcpThreadConfig.staticServerNames.length > 0 ? "transient" : void 0;
	preDynamicStartupStages.mark("native-tool-surface");
	const nativeProviderWebSearchSupport = resolveCodexWebSearchPlan({
		config: params.config,
		disableTools: params.disableTools,
		nativeToolSurfaceEnabled
	}).kind === "native-hosted" ? await resolveCodexProviderWebSearchSupport({
		clientFactory: attemptClientFactory,
		appServer,
		authProfileId: startupClientAuthProfileId,
		preparedAuth: startupPreparedAuth,
		agentDir,
		config: params.config,
		modelProviderOverride: usesSupervisionConnection ? mutable.startupBinding?.modelProvider : resolveCodexAppServerThreadModelSelection({
			provider: params.provider,
			model: params.modelId,
			binding: mutable.startupBinding,
			authProfileId: startupAuthProfileId,
			authProfileStore: attemptAuthProfileStore,
			agentDir,
			config: params.config
		}).modelProvider,
		signal: runAbortController.signal
	}) : "unsupported";
	preDynamicStartupStages.mark("provider-capabilities");
	for (const diagnostic of bundleMcpThreadConfig.diagnostics) embeddedAgentLog.warn(`bundle-mcp: ${diagnostic.pluginId}: ${diagnostic.message}`);
	if (activeContextEngine) assertContextEngineHostSupport({
		contextEngine: activeContextEngine,
		operation: "agent-run",
		host: CODEX_APP_SERVER_CONTEXT_ENGINE_HOST
	});
	const hookChannelId = resolveCodexAppServerHookChannelId(params, sandboxSessionKey);
	preDynamicStartupStages.mark("context-engine-support");
	return {
		connection,
		preparedAuthBinding,
		runtimeParams,
		activeSessionId,
		activeSessionFile,
		buildActiveRunAttemptParams,
		attemptAuthProfileStore,
		effectiveContextWindowInfo,
		effectiveContextTokenBudget,
		effectiveRuntimeProviderId,
		effectiveRuntimeModelId,
		startupAuthAccountCacheKey,
		startupEnvApiKeyCacheKey,
		bundleMcpThreadConfig,
		bundleManifestRegistry,
		authenticatedScheduledMode,
		configuredMcpSurface,
		canResolveScheduledConfiguredMcpCreatorAuthority: mayResolveScheduledConfiguredMcpCreatorAuthority,
		codexMcpToolOverrides,
		sandboxExecServerEnabled,
		nativeToolSurfaceEnabled,
		nativeProviderWebSearchSupport,
		hookChannelId
	};
}
//#endregion
//#region extensions/codex/src/app-server/dynamic-tool-result-projection.ts
/** Project one OpenClaw dynamic-tool response with its executed mutation identity. */
function recordCodexDynamicToolResult(projector, call, response, protocolResponse) {
	projector?.recordDynamicToolResult({
		callId: call.callId,
		tool: call.tool,
		asyncStarted: response.asyncStarted === true,
		terminalResolution: response.terminalResolution,
		success: protocolResponse.success,
		terminalType: response.diagnosticTerminalType ?? (protocolResponse.success ? "completed" : "error"),
		sideEffectEvidence: response.sideEffectEvidence === true || response.terminalResolution?.sideEffectEvidence === true,
		contentItems: protocolResponse.contentItems,
		details: response.transcriptDetails
	});
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-tools.ts
function toTranscriptToolResult(response) {
	const sanitized = sanitizeCodexToolResponse(response);
	const contentItems = Array.isArray(sanitized.contentItems) ? sanitized.contentItems : [];
	const result = {
		...sanitized,
		content: contentItems.map(toTranscriptToolResultContentItem)
	};
	delete result.contentItems;
	delete result.success;
	return result;
}
function toTranscriptToolResultContentItem(item) {
	if (!item || typeof item !== "object") return {
		type: "text",
		text: ""
	};
	const record = item;
	if (record.type === "inputText") return {
		type: "text",
		text: typeof record.text === "string" ? record.text : ""
	};
	if (record.type === "inputImage") return typeof record.imageUrl === "string" ? {
		type: "image",
		url: record.imageUrl
	} : {
		type: "text",
		text: formatUnsupportedCodexDynamicToolOutput(record.type)
	};
	return {
		type: "text",
		text: formatUnsupportedCodexDynamicToolOutput(record.type)
	};
}
function formatUnsupportedCodexDynamicToolOutput(type) {
	const rawType = typeof type === "string" ? type.replace(/\s+/g, " ").trim() : "";
	return `[Unsupported Codex dynamic tool output: ${rawType ? truncateUtf16Safe(rawType, 80) : "unknown"}${rawType.length > 80 ? "..." : ""}]`;
}
function createCodexDynamicToolExecutionRegistry() {
	const executions = /* @__PURE__ */ new Map();
	const keyFor = (call) => JSON.stringify([
		call.threadId,
		call.turnId,
		call.callId
	]);
	return {
		get(call) {
			return executions.get(keyFor(call));
		},
		claim(call, start) {
			const existing = executions.get(keyFor(call));
			if (existing) return {
				execution: existing,
				replayed: true
			};
			const execution = start();
			executions.set(keyFor(call), execution);
			return {
				execution,
				replayed: false
			};
		}
	};
}
function resolveCodexDynamicToolDirectNames(params, hostSystemAgentActive = false) {
	const names = [];
	if (hostSystemAgentActive && isSystemAgentOnlyCodexDynamicToolAllowlist(params.toolsAllow)) names.push("openclaw");
	if (params.sourceReplyDeliveryMode === "message_tool_only") names.push("message");
	return names;
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-server-requests.ts
const DYNAMIC_TOOL_TERMINAL_DIAGNOSTIC_TYPES = [
	"tool.execution.completed",
	"tool.execution.error",
	"tool.execution.blocked"
];
function createCodexAttemptServerRequestController(resources, turnRuntime, lifecycle) {
	const { prompt, state: resourceState, projectorRef, trajectoryRecorder } = resources;
	const { context } = prompt;
	const { runtime, attemptTools } = context;
	const { connection } = runtime;
	const { params, computerUseConfig, runAbortController, appServer, sessionAgentId } = connection;
	const autoApprove = shouldAutoApproveCodexAppServerApprovals(appServer);
	const { compactionPlanState, toolBridge, toolOutcomeOrdinals, suppressedDynamicToolOutcomeOrdinals, allocateCodexToolOutcomeOrdinal } = attemptTools;
	const { state, turnIdRef, userInputBridgeRef, openClawDynamicToolExecutions, pendingOpenClawDynamicToolCompletionIds, noteProgress } = turnRuntime;
	const { emitExecutionPhaseOnce, scheduleTurnReleaseAfterTerminalDynamicTool, scheduleTerminalDynamicToolReleaseCheck } = lifecycle;
	const handleServerRequest = async (request, scope, requestSignal = new AbortController().signal) => {
		const signal = AbortSignal.any([runAbortController.signal, requestSignal]);
		const turnId = turnIdRef.current;
		const projector = projectorRef.current;
		let requestCountsAsTurnActivity = false;
		const markCurrentTurnRequestProgress = () => {
			state.activeAppServerTurnRequests += 1;
			requestCountsAsTurnActivity = true;
			noteProgress(`request:${request.method}:start`);
		};
		try {
			if (!turnId) return;
			if (request.method === "mcpServer/elicitation/request") {
				if (!scope.turnId || scope.turnId === turnId) markCurrentTurnRequestProgress();
				const approvalResult = await routeCodexAppServerElicitationRequest({
					requestParams: request.params,
					paramsForRun: params,
					threadId: resourceState.thread.threadId,
					turnId,
					autoApproveMcpTools: autoApprove,
					projectedMcpServers: runtime.bundleMcpThreadConfig.configPatch?.mcp_servers,
					getActiveMcpToolCall: (serverName) => projector?.getActiveMcpToolCall(serverName),
					pluginAppPolicyContext: resourceState.thread.pluginAppPolicyContext,
					...computerUseConfig.enabled ? { computerUseMcpServerName: computerUseConfig.mcpServerName } : {},
					signal
				});
				if (approvalResult.kind === "handled") return approvalResult.response;
				return await userInputBridgeRef.current?.handleElicitationRequest({
					id: request.id,
					params: request.params
				});
			}
			if (request.method === "item/tool/requestUserInput") {
				if (scope.turnId === turnId) markCurrentTurnRequestProgress();
				return await userInputBridgeRef.current?.handleRequest({
					id: request.id,
					params: request.params
				});
			}
			if (request.method !== "item/tool/call") {
				if (isCodexAppServerApprovalRequest(request.method)) {
					if (scope.turnId === turnId) markCurrentTurnRequestProgress();
					return await handleCodexAppServerApprovalRequest({
						method: request.method,
						requestParams: request.params,
						paramsForRun: params,
						threadId: resourceState.thread.threadId,
						turnId,
						nativeHookRelay: resourceState.nativeHookRelay,
						autoApprove,
						signal,
						onNativeToolFailureDisposition: (itemId, disposition, approvalKind) => projector?.recordNativeToolApprovalFailure(itemId, disposition, approvalKind)
					});
				}
				return;
			}
			const call = readCodexDynamicToolCallParams(request.params);
			if (!call || call.threadId !== resourceState.thread.threadId || call.turnId !== turnId) return;
			const replayedExecution = openClawDynamicToolExecutions.get(call);
			if (replayedExecution) {
				markCurrentTurnRequestProgress();
				return toCodexDynamicToolProtocolResponse(await replayedExecution);
			}
			const toolCallOrdinal = allocateCodexToolOutcomeOrdinal?.(call.callId);
			markCurrentTurnRequestProgress();
			pendingOpenClawDynamicToolCompletionIds.add(call.callId);
			trajectoryRecorder?.recordEvent("tool.call", {
				threadId: call.threadId,
				turnId: call.turnId,
				toolCallId: call.callId,
				name: call.tool,
				arguments: call.arguments
			});
			projector?.recordDynamicToolCall({
				callId: call.callId,
				tool: call.tool,
				arguments: call.arguments
			});
			emitExecutionPhaseOnce(`tool:${call.callId}`, {
				phase: "tool_execution_started",
				tool: call.tool,
				toolCallId: call.callId
			});
			const toolMeta = inferCodexDynamicToolMeta(call, resolveCodexToolProgressDetailMode(params.toolProgressDetail));
			const toolArgs = sanitizeCodexToolArguments(call.arguments);
			const commandBearing = isCodexCommandBearingToolCall(call.tool, toolArgs);
			const shouldEmitDynamicToolProgress = shouldEmitTranscriptToolProgress(call.tool, toolArgs);
			if (shouldEmitDynamicToolProgress) emitCodexAppServerEvent(params, {
				stream: "tool",
				data: {
					phase: "start",
					name: call.tool,
					itemId: call.callId,
					toolCallId: call.callId,
					...toolMeta ? { meta: toolMeta } : {},
					...toolArgs ? { args: toolArgs } : {},
					...commandBearing ? { commandBearing: true } : {}
				}
			});
			const dynamicToolTimeoutMs = resolveDynamicToolCallTimeoutMs({
				call,
				config: params.config
			});
			const toolStartedAt = Date.now();
			let terminalDiagnosticObserved = false;
			const unsubscribeToolDiagnosticObserver = onInternalDiagnosticEvent((event) => {
				if (isDynamicToolTerminalDiagnosticEvent(event) && isMatchingDynamicToolTerminalDiagnostic({
					event,
					call,
					runId: params.runId,
					sessionId: params.sessionId,
					sessionKey: params.sessionKey
				})) terminalDiagnosticObserved = true;
			}, { include: DYNAMIC_TOOL_TERMINAL_DIAGNOSTIC_TYPES });
			try {
				const { execution } = openClawDynamicToolExecutions.claim(call, async () => {
					await projector?.transcriptCheckpoint.flushInOrder();
					emitDynamicToolStartedDiagnostic({
						call,
						agentId: sessionAgentId,
						runId: params.runId,
						sessionId: params.sessionId,
						sessionKey: params.sessionKey
					});
					const response = await handleDynamicToolCallWithTimeout({
						call,
						toolBridge,
						signal,
						timeoutMs: dynamicToolTimeoutMs,
						toolMeta,
						toolCallOrdinal,
						onAgentToolResult: params.onAgentToolResult,
						observeToolTerminal: params.observeToolTerminal,
						onFallbackSelected: () => {
							if (toolCallOrdinal !== void 0) suppressedDynamicToolOutcomeOrdinals.add(toolCallOrdinal);
						},
						onTimeout: () => {
							trajectoryRecorder?.recordEvent("tool.timeout", {
								threadId: call.threadId,
								turnId: call.turnId,
								toolCallId: call.callId,
								name: call.tool,
								timeoutMs: dynamicToolTimeoutMs
							});
						}
					});
					recordCodexDynamicToolResult(projector, call, response, toCodexDynamicToolProtocolResponse(response));
					await projector?.transcriptCheckpoint.flushInOrder();
					return response;
				});
				const response = await execution;
				const protocolResponse = toCodexDynamicToolProtocolResponse(response);
				if (!protocolResponse.success && toolCallOrdinal !== void 0) {
					suppressedDynamicToolOutcomeOrdinals.add(toolCallOrdinal);
					params.onToolOutcome?.({
						toolName: call.tool,
						argsHash: "",
						resultHash: "",
						toolCallOrdinal,
						terminalPresentation: void 0,
						presentationOnly: true
					});
				}
				const toolDurationMs = Math.max(0, Date.now() - toolStartedAt);
				trajectoryRecorder?.recordEvent("tool.result", {
					threadId: call.threadId,
					turnId: call.turnId,
					toolCallId: call.callId,
					name: call.tool,
					success: protocolResponse.success,
					contentItems: protocolResponse.contentItems
				});
				if (protocolResponse.success && call.tool === "progress_card") {
					const progressCardInput = response.executedArguments ?? call.arguments;
					await projector?.recordDynamicProgressCardUpdate(progressCardInput);
					compactionPlanState.recordProgressCardInput(progressCardInput);
				}
				if (shouldEmitDynamicToolProgress) {
					const progressResponse = toCodexDynamicToolProgressResponse(response, protocolResponse);
					emitCodexAppServerEvent(params, {
						stream: "tool",
						data: {
							phase: "result",
							name: call.tool,
							itemId: call.callId,
							toolCallId: call.callId,
							...toolMeta ? { meta: toolMeta } : {},
							...commandBearing ? { commandBearing: true } : {},
							isError: !protocolResponse.success,
							result: toTranscriptToolResult(progressResponse)
						}
					});
				}
				if (!terminalDiagnosticObserved && !hasPendingDynamicToolTerminalDiagnostic({
					call,
					runId: params.runId,
					sessionId: params.sessionId,
					sessionKey: params.sessionKey
				})) emitDynamicToolTerminalDiagnostic({
					response,
					call,
					agentId: sessionAgentId,
					runId: params.runId,
					sessionId: params.sessionId,
					sessionKey: params.sessionKey,
					durationMs: toolDurationMs
				});
				pendingOpenClawDynamicToolCompletionIds.delete(call.callId);
				if (response.terminate === true && response.success) scheduleTurnReleaseAfterTerminalDynamicTool({
					call,
					response,
					durationMs: toolDurationMs
				});
				else if (!shouldBlockTerminalReleaseForNonTerminalDynamicToolResult(response)) scheduleTerminalDynamicToolReleaseCheck();
				else {
					state.currentTurnHadNonTerminalDynamicToolResult = true;
					state.pendingTerminalDynamicToolRelease = void 0;
				}
				return protocolResponse;
			} catch (error) {
				pendingOpenClawDynamicToolCompletionIds.delete(call.callId);
				if (!terminalDiagnosticObserved && !hasPendingDynamicToolTerminalDiagnostic({
					call,
					runId: params.runId,
					sessionId: params.sessionId,
					sessionKey: params.sessionKey
				})) emitDynamicToolErrorDiagnostic({
					call,
					agentId: sessionAgentId,
					runId: params.runId,
					sessionId: params.sessionId,
					sessionKey: params.sessionKey,
					durationMs: Math.max(0, Date.now() - toolStartedAt)
				});
				throw error;
			} finally {
				toolOutcomeOrdinals.delete(call.callId);
				unsubscribeToolDiagnosticObserver();
			}
		} finally {
			if (requestCountsAsTurnActivity) {
				state.activeAppServerTurnRequests -= 1;
				noteProgress(`request:${request.method}:response`);
				scheduleTerminalDynamicToolReleaseCheck();
			}
		}
	};
	return { handleServerRequest };
}
//#endregion
//#region extensions/codex/src/app-server/attempt-runtime-artifact.ts
async function verifyStartupArtifact(params) {
	if (!params.request) return;
	const { readCodexAppServerClientRuntimeArtifact, validateCodexAppServerRuntimeArtifact } = await import("./runtime-artifact-C3jVimFn.js");
	const runtimeArtifact = readCodexAppServerClientRuntimeArtifact(params.client);
	const expected = params.request.expected;
	const matchesExpected = !expected || runtimeArtifact?.id === expected.id && runtimeArtifact.fingerprint === expected.fingerprint;
	if (!runtimeArtifact || !matchesExpected || !await validateCodexAppServerRuntimeArtifact(runtimeArtifact, params.signal)) {
		retireSharedCodexAppServerClientIfCurrent(params.client);
		throw new Error(expected ? "Codex app-server runtime artifact does not match verified inference" : "Codex app-server runtime artifact is unavailable or stale");
	}
	return runtimeArtifact;
}
//#endregion
//#region extensions/codex/src/app-server/computer-use-health.ts
const COMPUTER_USE_HEALTH_MONITOR_STATE = Symbol.for("openclaw.codexComputerUseHealthMonitorState");
function getComputerUseHealthMonitorState() {
	const globalState = globalThis;
	globalState[COMPUTER_USE_HEALTH_MONITOR_STATE] ??= { monitors: /* @__PURE__ */ new WeakMap() };
	return globalState[COMPUTER_USE_HEALTH_MONITOR_STATE];
}
function startCodexComputerUseHealthMonitor(params) {
	const state = getComputerUseHealthMonitorState();
	const existing = state.monitors.get(params.client);
	if (!params.config.enabled || !params.config.healthCheckEnabled) {
		if (existing) clearComputerUseHealthMonitor(params.client, existing);
		return {
			started: false,
			reason: params.config.enabled ? "health_disabled" : "disabled"
		};
	}
	const fingerprint = buildComputerUseHealthMonitorFingerprint(params.config);
	const intervalMs = params.config.healthCheckIntervalMinutes * 6e4;
	if (existing?.fingerprint === fingerprint) return {
		started: false,
		intervalMs,
		reason: "already_started"
	};
	if (existing) clearComputerUseHealthMonitor(params.client, existing);
	const monitor = {
		fingerprint,
		intervalMs,
		timer: setInterval(() => {
			runCodexComputerUseHealthProbe(params.client, params.config, monitor);
		}, intervalMs),
		disposeCloseHandler: () => void 0,
		running: false
	};
	monitor.timer.unref?.();
	monitor.disposeCloseHandler = params.client.addCloseHandler((client) => {
		const active = state.monitors.get(client);
		if (active) clearComputerUseHealthMonitor(client, active);
	});
	state.monitors.set(params.client, monitor);
	return {
		started: true,
		intervalMs
	};
}
function buildComputerUseHealthMonitorFingerprint(config) {
	return JSON.stringify({
		autoRepair: config.autoRepair,
		healthCheckIntervalMinutes: config.healthCheckIntervalMinutes,
		liveTestTimeoutMs: config.liveTestTimeoutMs,
		mcpServerName: config.mcpServerName,
		toolCallTimeoutMs: config.toolCallTimeoutMs
	});
}
async function runCodexComputerUseHealthProbe(client, config, monitor) {
	if (monitor.running) return;
	monitor.running = true;
	try {
		const { liveTest, repair } = await runCodexComputerUseLiveTest({
			config,
			request: async (method, requestParams, requestOptions) => await client.request(method, requestParams, { timeoutMs: requestOptions?.timeoutMs ?? config.liveTestTimeoutMs })
		});
		if (!liveTest.ok) {
			embeddedAgentLog.warn("codex computer-use periodic health failed", {
				mcpServerName: config.mcpServerName,
				attempts: liveTest.attempts,
				timeoutMs: liveTest.timeoutMs,
				error: liveTest.error,
				repair
			});
			return;
		}
		if (repair?.attempted && repair.warnings.length === 0) embeddedAgentLog.info("codex computer-use periodic health reloaded MCP servers", { mcpServerName: config.mcpServerName });
	} catch (error) {
		embeddedAgentLog.warn("codex computer-use periodic health probe crashed", {
			mcpServerName: config.mcpServerName,
			error: error instanceof Error ? error.message : String(error)
		});
	} finally {
		monitor.running = false;
	}
}
function clearComputerUseHealthMonitor(client, monitor) {
	clearInterval(monitor.timer);
	monitor.disposeCloseHandler();
	getComputerUseHealthMonitorState().monitors.delete(client);
}
//#endregion
//#region extensions/codex/src/app-server/plugin-thread-config-deadline.ts
/** Enforces one bounded startup budget across Codex plugin config discovery. */
const CODEX_PLUGIN_THREAD_CONFIG_MAX_TIMEOUT_MS = 6e4;
const CODEX_PLUGIN_THREAD_CONFIG_TIMEOUT_DIVISOR = 4;
const CODEX_PLUGIN_THREAD_CONFIG_MIN_TIMEOUT_MS = 100;
var CodexPluginThreadConfigDeadlineError = class extends Error {
	constructor() {
		super("Codex plugin thread config deadline elapsed");
		this.name = "CodexPluginThreadConfigDeadlineError";
	}
};
/** Resolves the plugin policy state reused throughout app-server startup. */
function resolveCodexPluginThreadConfigStartupPolicy(params) {
	const pluginThreadConfigRequired = Boolean(params.scheduledRuntimeAuthority) || !params.nativeToolSurfaceEnabled || shouldBuildCodexPluginThreadConfig(params.pluginConfig);
	const pluginThreadConfigPluginConfig = params.nativeToolSurfaceEnabled || params.scheduledRuntimeAuthority ? params.pluginConfig : disableCodexPluginThreadConfig(params.pluginConfig);
	const resolvedPluginPolicy = pluginThreadConfigRequired ? resolveCodexPluginsPolicy(pluginThreadConfigPluginConfig) : void 0;
	return {
		pluginThreadConfigRequired,
		pluginThreadConfigPluginConfig,
		resolvedPluginPolicy,
		enabledPluginConfigKeys: resolvedPluginPolicy ? resolvedPluginPolicy.pluginPolicies.filter((plugin) => plugin.enabled).map((plugin) => plugin.configKey).toSorted() : void 0
	};
}
/** Builds plugin config without allowing sequential RPC timeouts to consume the turn. */
async function buildCodexPluginThreadConfigWithinDeadline(params) {
	const { requestTimeoutMs, signal, request, failClosedOnTimeout, transform, ...buildParams } = params;
	const timeoutMs = resolveCodexPluginThreadConfigTimeoutMs(requestTimeoutMs);
	const deadlineMs = Date.now() + timeoutMs;
	const boundedRequest = (method, requestParams) => {
		const remainingTimeoutMs = deadlineMs - Date.now();
		if (remainingTimeoutMs <= 0) throw new CodexPluginThreadConfigDeadlineError();
		return request(method, requestParams, {
			timeoutMs: remainingTimeoutMs,
			signal
		});
	};
	try {
		return await withAbortableTimeout({
			signal,
			timeoutMs,
			promise: (async () => {
				const config = await buildCodexPluginThreadConfig({
					...buildParams,
					request: boundedRequest
				});
				return transform ? await transform(config, boundedRequest) : config;
			})(),
			timeoutMessage: "Codex plugin thread config deadline elapsed",
			createTimeoutError: () => new CodexPluginThreadConfigDeadlineError()
		});
	} catch (error) {
		if (signal.aborted || !isCodexPluginThreadConfigTimeoutError(error)) throw error;
		if (failClosedOnTimeout) throw new AgentHarnessPreflightError(`Scheduled Codex app policy verification exceeded its ${timeoutMs} ms startup budget. No app tools were executed. Retry after Codex app inventory is responsive, or reauthorize the automation.`);
		return buildCodexPluginThreadConfigTimeoutFallback({
			pluginConfig: buildParams.pluginConfig,
			appCacheKey: buildParams.appCacheKey,
			message: `Codex plugin discovery exceeded its ${timeoutMs} ms startup budget; plugin apps were disabled for this turn.`
		});
	}
}
/** Creates the recovery metadata and bounded builder used by thread startup. */
function createCodexPluginThreadConfigStartupProvider(params) {
	const { client, policy, inputFingerprint, enabledPluginConfigKeys, appCache, metadataCache: configuredMetadataCache, ...buildParams } = params;
	const metadataCache = configuredMetadataCache ?? defaultCodexPluginMetadataCache;
	return {
		enabled: true,
		requiresCurrentPolicyCheck: Boolean(params.scheduledRuntimeAuthority),
		inputFingerprint,
		enabledPluginConfigKeys,
		accountAppRecoveryEnabled: policy?.allowAllPlugins,
		recoverablePluginConfigKeys: policy ? resolveRecoverableCodexPluginConfigKeys({
			policy,
			metadataCache,
			appCacheKey: params.appCacheKey,
			configCwd: params.configCwd
		}) : void 0,
		build: async (buildOptions) => {
			const config = await buildCodexPluginThreadConfigWithinDeadline({
				...buildParams,
				threadId: buildOptions?.threadId,
				appCache: appCache ?? defaultCodexAppInventoryCache,
				metadataCache,
				failClosedOnTimeout: Boolean(params.scheduledRuntimeAuthority),
				transform: params.scheduledRuntimeAuthority ? async (builtConfig, request) => intersectCodexPluginThreadConfigWithScheduledAuthority(builtConfig, params.scheduledRuntimeAuthority, await readCurrentCodexScheduledAppPolicy(request, params.configCwd, buildOptions?.threadId)) : void 0,
				request: (method, requestParams, options) => client.request(method, requestParams, options)
			});
			return params.scheduledRuntimeAuthority && params.inputFingerprint ? {
				...config,
				inputFingerprint: params.inputFingerprint
			} : config;
		}
	};
}
async function readCurrentCodexScheduledAppPolicy(request, cwd, threadId) {
	return await readCurrentCodexScheduledAppPolicy$1({
		request,
		configCwd: cwd,
		threadId
	});
}
function resolveCodexPluginThreadConfigTimeoutMs(requestTimeoutMs) {
	return Math.min(CODEX_PLUGIN_THREAD_CONFIG_MAX_TIMEOUT_MS, Math.max(CODEX_PLUGIN_THREAD_CONFIG_MIN_TIMEOUT_MS, Math.floor((Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0 ? requestTimeoutMs : CODEX_PLUGIN_THREAD_CONFIG_MAX_TIMEOUT_MS * CODEX_PLUGIN_THREAD_CONFIG_TIMEOUT_DIVISOR) / CODEX_PLUGIN_THREAD_CONFIG_TIMEOUT_DIVISOR)));
}
function isCodexPluginThreadConfigTimeoutError(error) {
	return error instanceof CodexPluginThreadConfigDeadlineError || error instanceof Error && "code" in error && error.code === "CODEX_APP_SERVER_LOCAL_REQUEST_CANCELLED" && error.message.endsWith(" timed out");
}
//#endregion
//#region extensions/codex/src/app-server/attempt-startup.ts
/**
* Startup orchestration for Codex app-server attempts, including shared-client
* leasing, plugin thread config, sandbox environment, and thread lifecycle binding.
*/
const CODEX_APP_SERVER_STARTUP_MAX_ATTEMPTS = 3;
const CODEX_APP_SERVER_CONTEXT_RESTART_SELECTION_CHANGED = "CODEX_APP_SERVER_CONTEXT_RESTART_SELECTION_CHANGED";
/** True when a pre-write context restart must replay on the newly selected owner. */
function isCodexContextRestartSelectionChangedError(error) {
	return error instanceof Error && "code" in error && error.code === CODEX_APP_SERVER_CONTEXT_RESTART_SELECTION_CHANGED;
}
/**
* Starts or resumes the Codex app-server thread and returns the resources the
* run loop must later release.
*/
async function startCodexAttemptThread(params) {
	let pluginAppServer = params.appServer;
	const startupRuntimeAuthProfileId = params.startupPreparedAuth?.kind === "profile" ? params.startupPreparedAuth.profileId : params.startupAuthProfileId ?? void 0;
	const startupRuntimeAuthProfileStore = params.startupPreparedAuth?.kind === "profile" ? params.startupPreparedAuth.store : void 0;
	let releaseSharedClientLease;
	let startupClientForAbandonedRequestCleanup;
	let releaseStartupResourcesOnTimeout;
	let startupAbandoned = false;
	const startupAbandonController = new AbortController();
	const abandonStartupAcquire = () => startupAbandonController.abort();
	params.signal.addEventListener("abort", abandonStartupAcquire, { once: true });
	try {
		const startupResult = await withCodexStartupTimeout({
			timeoutMs: params.startupTimeoutMs,
			signal: params.signal,
			onTimeout: async () => {
				startupAbandoned = true;
				startupAbandonController.abort();
				await params.onStartupTimeout();
				await releaseStartupResourcesOnTimeout?.();
				releaseSharedClientLease?.();
				releaseSharedClientLease = void 0;
				await closeCodexStartupClientBestEffort(startupClientForAbandonedRequestCleanup);
				startupClientForAbandonedRequestCleanup = void 0;
			},
			operation: async () => {
				const threadConfig = mergeCodexThreadConfigs(params.configuredMcpDynamicSurface ? void 0 : params.bundleMcpThreadConfig?.configPatch);
				const { pluginThreadConfigRequired, pluginThreadConfigPluginConfig, resolvedPluginPolicy, enabledPluginConfigKeys } = resolveCodexPluginThreadConfigStartupPolicy({
					pluginConfig: params.pluginConfig,
					nativeToolSurfaceEnabled: params.nativeToolSurfaceEnabled,
					scheduledRuntimeAuthority: params.buildAttemptParams().scheduledRuntimeAuthority
				});
				pluginAppServer = resolvedPluginPolicy?.enabled === true || params.computerUseConfig.enabled || params.nativeToolSurfaceEnabled && params.configuredMcpOwnershipVersion !== 1 && hasCodexMcpToolApprovalOverrides(params.config?.mcp?.servers, params.bundleMcpThreadConfig.userStaticServerNames, params.bundleMcpThreadConfig.configPatch?.mcp_servers) ? {
					...params.appServer,
					approvalPolicy: withMcpElicitationsApprovalPolicy(params.appServer.approvalPolicy)
				} : params.appServer;
				let attemptedClient;
				const startupAttempt = async () => {
					let startupClientLease;
					let startupClient;
					let startupAttemptError;
					let startupAttemptSucceeded = false;
					try {
						const attemptParams = params.buildAttemptParams();
						startupClient = await params.attemptClientFactory({
							startOptions: params.appServer.start,
							pluginConfig: params.pluginConfig,
							...params.startupPreparedAuth ? { preparedAuth: params.startupPreparedAuth } : { authProfileId: params.startupAuthProfileId },
							authRequirement: params.startupAuthRequirement,
							authProfileStore: attemptParams.authProfileStore,
							authBindingFingerprint: params.startupAuthBindingFingerprint,
							...params.runtimeArtifactRequest ? {
								runtimeArtifactMode: "capture",
								...params.runtimeArtifactRequest.expected ? { expectedRuntimeArtifact: params.runtimeArtifactRequest.expected } : {}
							} : {},
							agentId: params.sessionAgentId,
							agentDir: params.agentDir,
							config: params.config,
							onStartedClient: (client) => {
								startupClientForAbandonedRequestCleanup = client;
								if (startupAbandoned || startupAbandonController.signal.aborted) closeCodexStartupClientBestEffort(client);
							},
							abandonSignal: startupAbandonController.signal,
							timeoutMs: params.appServer.requestTimeoutMs
						});
						const activeStartupClient = startupClient;
						let startupClientLeaseReleased = false;
						startupClientLease = () => {
							if (startupClientLeaseReleased) return;
							startupClientLeaseReleased = true;
							if (params.attemptClientFactory === createIsolatedCodexAppServerClient) activeStartupClient.close();
							else releaseLeasedSharedCodexAppServerClient(activeStartupClient);
						};
						releaseSharedClientLease = startupClientLease;
						attemptedClient = activeStartupClient;
						startupClientForAbandonedRequestCleanup = activeStartupClient;
						if (startupAbandoned) throw new CodexAppServerStartupError("timed_out");
						if (startupAbandonController.signal.aborted) throw new CodexAppServerStartupError("aborted");
						const runtimeArtifact = await verifyStartupArtifact({
							client: activeStartupClient,
							request: params.runtimeArtifactRequest,
							signal: startupAbandonController.signal
						});
						ensureCodexAppServerClientRuntime(activeStartupClient, {
							agentDir: params.agentDir,
							authProfileId: startupRuntimeAuthProfileId,
							authMode: params.startupPreparedAuth?.kind === "api-key" ? "prepared-api-key" : "profile",
							authProfileStore: startupRuntimeAuthProfileStore ?? attemptParams.authProfileStore,
							config: params.config
						});
						const turnRouter = getCodexAppServerTurnRouter(activeStartupClient);
						try {
							await ensureCodexComputerUse({
								client: activeStartupClient,
								pluginConfig: params.pluginConfig,
								config: params.config,
								agentDir: params.agentDir,
								timeoutMs: params.appServer.requestTimeoutMs,
								signal: startupAbandonController.signal
							});
						} catch (error) {
							if (startupAbandonController.signal.aborted || isCodexAppServerStartSelectionChangedError(error)) throw error;
							throw new AgentHarnessPreflightError(`Codex Computer Use readiness failed: ${formatErrorMessage(error)}`, {
								cause: error,
								scope: "harness"
							});
						}
						const startupRuntimeIdentity = activeStartupClient.getRuntimeIdentity();
						const pluginAppCacheKey = buildCodexPluginAppCacheKey({
							appServer: params.appServer,
							agentDir: params.agentDir,
							authProfileId: startupRuntimeAuthProfileId,
							accountId: params.startupAuthAccountCacheKey,
							envApiKeyFingerprint: params.startupEnvApiKeyCacheKey,
							appServerVersion: activeStartupClient.getServerVersion(),
							runtimeIdentity: startupRuntimeIdentity,
							desktopGenerationFingerprint: readCodexAppServerClientDesktopGenerationFingerprint(activeStartupClient)
						});
						const appServerRuntimeFingerprint = buildCodexAppServerRuntimeFingerprint({
							appServer: params.appServer,
							appServerVersion: activeStartupClient.getServerVersion(),
							runtimeIdentity: startupRuntimeIdentity
						});
						const basePluginThreadConfigInputFingerprint = pluginThreadConfigRequired ? buildCodexPluginThreadConfigInputFingerprint({
							pluginConfig: pluginThreadConfigPluginConfig,
							appCacheKey: pluginAppCacheKey
						}) : void 0;
						const pluginThreadConfigInputFingerprint = basePluginThreadConfigInputFingerprint ? buildScheduledCodexAppAuthorityInputFingerprint(basePluginThreadConfigInputFingerprint, attemptParams.scheduledRuntimeAuthority) : void 0;
						embeddedAgentLog.debug("codex plugin thread config eligibility", buildCodexPluginThreadConfigEligibilityLogData({
							sessionId: attemptParams.sessionId,
							sessionKey: attemptParams.sessionKey ?? "",
							pluginThreadConfigRequired,
							resolvedPluginPolicy,
							enabledPluginConfigKeys,
							pluginAppCacheKey,
							startupAuthProfileId: startupRuntimeAuthProfileId,
							appServer: params.appServer
						}));
						let startupSandboxEnvironment;
						let startupSandboxEnvironmentAcquired = false;
						const releaseStartupSandboxEnvironment = async () => {
							if (startupSandboxEnvironmentAcquired) {
								startupSandboxEnvironmentAcquired = false;
								await releaseCodexSandboxExecServerEnvironment(params.sandbox, startupSandboxEnvironment);
							}
						};
						releaseStartupResourcesOnTimeout = releaseStartupSandboxEnvironment;
						try {
							const sandboxEnvironmentRequired = shouldRequireCodexSandboxExecServerEnvironment({
								sandbox: params.sandbox,
								nativeToolSurfaceEnabled: params.nativeToolSurfaceEnabled,
								sandboxExecServerEnabled: params.sandboxExecServerEnabled
							});
							startupSandboxEnvironment = sandboxEnvironmentRequired ? await ensureCodexSandboxExecServerEnvironment({
								client: activeStartupClient,
								sandbox: params.sandbox ?? null,
								runtime: params.runtime,
								appServerStartOptions: params.appServer.start,
								timeoutMs: params.appServer.requestTimeoutMs,
								signal: AbortSignal.any([params.signal, startupAbandonController.signal]),
								onExecutionDisconnect: params.onExecutionDisconnect
							}) : void 0;
							startupSandboxEnvironmentAcquired = Boolean(startupSandboxEnvironment);
							if (startupAbandonController.signal.aborted) {
								await releaseStartupSandboxEnvironment();
								throw new CodexAppServerStartupError("aborted");
							}
							if (sandboxEnvironmentRequired && !startupSandboxEnvironment) throw new Error("Codex app-server did not register an OpenClaw sandbox exec-server environment.");
						} catch (error) {
							await releaseStartupSandboxEnvironment();
							throw error;
						}
						const startupEnvironmentSelection = resolveCodexSandboxEnvironmentSelection(startupSandboxEnvironment, params.nativeToolSurfaceEnabled);
						const startupExecutionCwd = resolveCodexAppServerExecutionCwd({
							effectiveCwd: params.effectiveCwd,
							localWorkspaceRoot: params.effectiveWorkspace,
							environment: startupSandboxEnvironment,
							nativeToolSurfaceEnabled: params.nativeToolSurfaceEnabled,
							remoteWorkspaceRoot: params.appServer.remoteWorkspaceRoot
						});
						const startupSandboxPolicy = startupSandboxEnvironment ? resolveCodexExternalSandboxPolicyForOpenClawSandbox(params.sandbox) : void 0;
						let startupReservation;
						const releaseStartupReservation = () => {
							startupReservation?.release();
							startupReservation = void 0;
						};
						const reserveStartupThread = (threadId) => {
							if (startupReservation) {
								if (startupReservation.threadId !== threadId) throw new Error(`codex app-server reserved ${startupReservation.threadId} but started ${threadId}`);
								return { release: releaseStartupReservation };
							}
							startupReservation = turnRouter.reserveThread({ threadId });
							return { release: releaseStartupReservation };
						};
						const releaseStartupResources = async () => {
							releaseStartupReservation();
							await releaseStartupSandboxEnvironment();
						};
						releaseStartupResourcesOnTimeout = releaseStartupResources;
						const buildThreadLifecycleParams = (signal, reserveResumeThread) => ({
							client: activeStartupClient,
							reserveResumeThread,
							bindingStore: params.bindingStore,
							params: params.buildAttemptParams(),
							runtimeModelId: params.runtimeModelId,
							agentId: params.sessionAgentId,
							agentDir: params.agentDir,
							cwd: startupExecutionCwd,
							dynamicTools: params.dynamicTools,
							persistentWebSearchAllowed: params.persistentWebSearchAllowed,
							webSearchAllowed: params.webSearchAllowed,
							appServer: pluginAppServer,
							developerInstructions: params.developerInstructions,
							agentWorkspaceDeveloperInstructions: params.agentWorkspaceDeveloperInstructions,
							config: threadConfig,
							shellEnvironment: params.shellEnvironment,
							disableLoginShell: params.disableLoginShell,
							finalConfigPatch: params.finalConfigPatch,
							buildFinalConfigPatch: params.buildFinalConfigPatch,
							nativeHookRelayGeneration: params.nativeHookRelayGeneration,
							nativeHookRelayRequired: params.nativeHookRelayRequired,
							nativeCodeModeEnabled: params.nativeToolSurfaceEnabled && String(params.buildAttemptParams()?.provider ?? "").trim().toLowerCase() !== "deepseek",
							nativeProviderWebSearchSupport: params.nativeProviderWebSearchSupport,
							nativeCodeModeOnlyEnabled: params.appServer.codeModeOnly,
							userMcpServersEnabled: params.configuredMcpDynamicSurface ? false : params.nativeToolSurfaceEnabled,
							mcpServersFingerprint: params.configuredMcpDynamicSurface ? void 0 : params.bundleMcpThreadConfig.fingerprint,
							mcpServersFingerprintEvaluated: params.configuredMcpDynamicSurface || params.bundleMcpThreadConfig.evaluated,
							configuredMcpOwnershipVersion: params.configuredMcpOwnershipVersion,
							environmentSelection: startupEnvironmentSelection,
							appServerRuntimeFingerprint,
							contextEngineProjection: params.contextEngineProjection,
							signal,
							pluginThreadConfig: pluginThreadConfigRequired ? createCodexPluginThreadConfigStartupProvider({
								inputFingerprint: pluginThreadConfigInputFingerprint,
								enabledPluginConfigKeys,
								policy: resolvedPluginPolicy,
								requestTimeoutMs: params.appServer.requestTimeoutMs,
								signal,
								pluginConfig: pluginThreadConfigPluginConfig,
								client: activeStartupClient,
								configCwd: startupExecutionCwd,
								appCacheKey: pluginAppCacheKey,
								scheduledRuntimeAuthority: attemptParams.scheduledRuntimeAuthority
							}) : void 0
						});
						try {
							const startupThread = await startOrResumeThread(buildThreadLifecycleParams(startupAbandonController.signal, reserveStartupThread));
							try {
								reserveStartupThread(startupThread.threadId);
							} catch (error) {
								if (!await unsubscribeCodexThreadBestEffort(activeStartupClient, {
									threadId: startupThread.threadId,
									timeoutMs: 5e3
								})) throw new CodexAppServerUnsafeSubscriptionError("Codex startup subscription cleanup failed", { cause: error });
								throw error;
							}
							if (startupAbandonController.signal.aborted) throw new CodexAppServerStartupError("aborted");
							const startupRoute = startupReservation;
							if (!startupRoute) throw new Error("codex app-server startup did not reserve its thread route");
							startupSandboxEnvironmentAcquired = false;
							startCodexComputerUseHealthMonitor({
								client: activeStartupClient,
								config: params.computerUseConfig
							});
							startupAttemptSucceeded = true;
							return {
								client: activeStartupClient,
								turnRouter,
								turnRoute: startupRoute,
								thread: startupThread,
								sandboxEnvironment: startupSandboxEnvironment,
								environmentSelection: startupEnvironmentSelection,
								executionCwd: startupExecutionCwd,
								sandboxPolicy: startupSandboxPolicy,
								...runtimeArtifact ? { runtimeArtifact } : {},
								restartContextEngineCodexThread: async () => {
									try {
										return await startOrResumeThread(buildThreadLifecycleParams(params.signal));
									} catch (error) {
										if (!isCodexAppServerStartSelectionChangedError(error)) throw error;
										retireSharedCodexAppServerClientIfCurrent(activeStartupClient);
										throw Object.assign(new Error("codex app-server client is closed", { cause: error }), { code: CODEX_APP_SERVER_CONTEXT_RESTART_SELECTION_CHANGED });
									}
								}
							};
						} catch (error) {
							await releaseStartupResources();
							throw error;
						} finally {
							if (releaseStartupResourcesOnTimeout === releaseStartupResources) releaseStartupResourcesOnTimeout = void 0;
						}
					} catch (error) {
						startupAttemptError = error;
						if (!startupAbandoned && !params.signal.aborted && !startupClient) {
							const sharedClient = clearSharedCodexAppServerClientIfCurrentAndUnclaimed(startupClientForAbandonedRequestCleanup);
							if (sharedClient.found && !sharedClient.closed) startupClientForAbandonedRequestCleanup = void 0;
						}
						throw error;
					} finally {
						if (!startupAttemptSucceeded) {
							if (releaseSharedClientLease === startupClientLease) releaseSharedClientLease = void 0;
							startupClientLease?.();
							if (startupAbandoned || params.signal.aborted) {
								if (startupClientForAbandonedRequestCleanup === startupClient) startupClientForAbandonedRequestCleanup = void 0;
								await closeCodexStartupClientBestEffort(startupClient);
							} else if (!isCodexAppServerStartSelectionChangedError(startupAttemptError) && (shouldClearSharedClientAfterStartupRace(startupAttemptError) || shouldClearSharedClientAfterStartupFailure(startupAttemptError, params.spawnedBy))) {
								if (startupClientForAbandonedRequestCleanup === startupClient) startupClientForAbandonedRequestCleanup = void 0;
								await closeCodexStartupClientBestEffort(startupClient);
							}
						}
					}
				};
				for (let attempt = 1; attempt <= CODEX_APP_SERVER_STARTUP_MAX_ATTEMPTS; attempt += 1) try {
					return await startupAttempt();
				} catch (error) {
					const selectionChanged = isCodexAppServerStartSelectionChangedError(error);
					if (startupAbandoned || params.signal.aborted || !selectionChanged && !isCodexAppServerConnectionClosedError(error)) throw error;
					const refreshedSharedClient = selectionChanged ? retireSharedCodexAppServerClientIfCurrent(attemptedClient) : clearSharedCodexAppServerClientIfCurrent(attemptedClient);
					if (startupClientForAbandonedRequestCleanup === attemptedClient) startupClientForAbandonedRequestCleanup = void 0;
					if (attempt >= CODEX_APP_SERVER_STARTUP_MAX_ATTEMPTS) {
						embeddedAgentLog.warn(selectionChanged ? "codex app-server executable selection kept changing during startup; retries exhausted" : "codex app-server connection closed during startup; retries exhausted", {
							attempt,
							maxAttempts: CODEX_APP_SERVER_STARTUP_MAX_ATTEMPTS,
							refreshedSharedClient,
							error: formatErrorMessage(error)
						});
						throw error;
					}
					const retryDelayMs = selectionChanged ? 0 : 1e3 * 2 ** (attempt - 1);
					embeddedAgentLog.warn(selectionChanged ? "codex app-server executable selection changed during startup; restarting app-server and retrying" : "codex app-server connection closed during startup; restarting app-server and retrying", {
						attempt,
						nextAttempt: attempt + 1,
						maxAttempts: CODEX_APP_SERVER_STARTUP_MAX_ATTEMPTS,
						refreshedSharedClient,
						error: formatErrorMessage(error)
					});
					await sleepWithAbort(retryDelayMs, startupAbandonController.signal);
				}
				throw new Error("codex app-server startup retry loop exited unexpectedly");
			}
		});
		startupClientForAbandonedRequestCleanup = void 0;
		if (!releaseSharedClientLease) throw new Error("codex app-server startup succeeded without a shared client lease");
		return {
			...startupResult,
			pluginAppServer,
			releaseSharedClientLease
		};
	} catch (error) {
		if (params.signal.aborted || isCodexAppServerStartupError(error)) {
			releaseSharedClientLease?.();
			releaseSharedClientLease = void 0;
			await closeCodexStartupClientBestEffort(startupClientForAbandonedRequestCleanup);
			startupClientForAbandonedRequestCleanup = void 0;
		} else if (!isCodexAppServerStartSelectionChangedError(error) && (shouldClearSharedClientAfterStartupRace(error) || shouldClearSharedClientAfterStartupFailure(error, params.spawnedBy))) {
			releaseSharedClientLease?.();
			releaseSharedClientLease = void 0;
			await closeCodexStartupClientBestEffort(startupClientForAbandonedRequestCleanup);
			startupClientForAbandonedRequestCleanup = void 0;
		}
		throw error;
	} finally {
		params.signal.removeEventListener("abort", abandonStartupAcquire);
	}
}
function shouldClearSharedClientAfterStartupRace(error) {
	return isCodexAppServerStartupError(error) || isCodexAppServerRequestTimeoutError(error);
}
function shouldClearSharedClientAfterStartupFailure(error, spawnedBy) {
	return !isCodexAppServerOverloadError(error) && !(error instanceof AgentHarnessPreflightError && error.scope === void 0) && (isCodexAppServerBrokenPipeError(error) || !spawnedBy);
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-start.ts
async function startCodexAttemptRuntime(resources) {
	const { prompt, state, trajectoryRecorder, activateNativePreToolUseFailureFallback, releaseSandboxExecEnvironment, releaseSharedClientLeaseAndRetireOneShotClient, releaseCurrentRoute, runCleanupStep, startupTimeoutMs, buildNativeHookRelayFinalConfigPatch } = resources;
	const { context, turnState, buildRenderedCodexDeveloperInstructions, rebuildCodexTurnPromptTextFromCurrentProjection, applyNoContextEngineContinuityProjection } = prompt;
	const { runtime, attemptTools, promptState } = context;
	const { connection, runtimeParams, preparedAuthBinding, buildActiveRunAttemptParams, startupAuthAccountCacheKey, startupEnvApiKeyCacheKey, bundleMcpThreadConfig, nativeToolSurfaceEnabled, nativeProviderWebSearchSupport, effectiveRuntimeModelId, sandboxExecServerEnabled } = runtime;
	const { toolBridge, toolState } = attemptTools;
	const developerInstructions = joinPresentSections(turnState.promptBuild.developerInstructions, attemptTools.configuredMcp?.diagnosticNotice);
	const { params, attemptClientFactory, bindingStore, appServer, pluginConfig, computerUseConfig, startupClientAuthProfileId, runtimeArtifactRequest, startupPreparedAuth, agentDir, sessionAgentId, effectiveWorkspace, effectiveCwd, sandbox, runAbortController, usesSupervisionConnection, resolveReviewerPolicyContext, resolveRuntimeOptionsForCurrentBinding, startupAuthProfileId, startupAuthRequirement, abortFromUpstream } = connection;
	let pluginAppServer = withCodexAppServerFastModeServiceTier(appServer, runtimeParams);
	const loopDetectionEnabled = (sessionAgentId && params.config ? resolveAgentConfig$1(params.config, sessionAgentId)?.tools?.loopDetection?.enabled : void 0) ?? params.config?.tools?.loopDetection?.enabled ?? false;
	try {
		emitCodexAppServerEvent(params, {
			stream: "codex_app_server.lifecycle",
			data: { phase: "startup" }
		});
		const startupResult = await startCodexAttemptThread({
			attemptClientFactory,
			bindingStore,
			runtime: connection.options.runtime,
			appServer: pluginAppServer,
			pluginConfig,
			computerUseConfig,
			startupAuthProfileId: startupClientAuthProfileId,
			startupAuthRequirement,
			startupAuthBindingFingerprint: preparedAuthBinding?.fingerprint,
			...runtimeArtifactRequest ? { runtimeArtifactRequest } : {},
			startupPreparedAuth,
			startupAuthAccountCacheKey,
			startupEnvApiKeyCacheKey,
			agentDir,
			config: params.config,
			shellEnvironment: connection.shellEnvironment,
			disableLoginShell: connection.disableLoginShell,
			buildAttemptParams: buildActiveRunAttemptParams,
			...effectiveRuntimeModelId !== runtimeParams.modelId ? { runtimeModelId: effectiveRuntimeModelId } : {},
			sessionAgentId,
			effectiveWorkspace,
			effectiveCwd,
			dynamicTools: toolBridge.specs,
			persistentWebSearchAllowed: toolState.persistentWebSearchAllowed,
			webSearchAllowed: toolState.webSearchAllowed,
			developerInstructions,
			agentWorkspaceDeveloperInstructions: context.agentWorkspaceDeveloperInstructions,
			buildFinalConfigPatch: buildNativeHookRelayFinalConfigPatch,
			nativeHookRelayRequired: connection.options.nativeHookRelay?.enabled !== false && params.pluginHarnessToolPolicyRestricted !== true && connection.nativeHookRelayEvents.includes("pre_tool_use") && (hasBeforeToolCallPolicy() || appServer.loopDetectionPreToolUseRelay && Boolean(connection.sandboxSessionKey) && loopDetectionEnabled),
			bundleMcpThreadConfig,
			configuredMcpDynamicSurface: attemptTools.configuredMcp !== void 0,
			configuredMcpOwnershipVersion: attemptTools.configuredMcpOwnershipVersion,
			nativeToolSurfaceEnabled,
			nativeProviderWebSearchSupport,
			sandboxExecServerEnabled,
			sandbox,
			contextEngineProjection: promptState.contextEngineProjection,
			startupTimeoutMs,
			signal: runAbortController.signal,
			onStartupTimeout: () => runAbortController.abort("codex_startup_timeout"),
			onExecutionDisconnect: (error) => {
				state.executionDisconnectError = error;
				embeddedAgentLog.warn(error.message);
				runAbortController.abort("client_closed");
			},
			spawnedBy: params.spawnedBy
		});
		state.client = startupResult.client;
		state.thread = startupResult.thread;
		state.runtimeArtifact = startupResult.runtimeArtifact;
		state.turnRouter = startupResult.turnRouter;
		state.turnRoute = startupResult.turnRoute;
		state.sandboxExecEnvironment = startupResult.sandboxEnvironment;
		state.releaseSharedClientLease = startupResult.releaseSharedClientLease;
		state.restartContextEngineCodexThread = startupResult.restartContextEngineCodexThread;
		pluginAppServer = startupResult.pluginAppServer;
		toolBridge.setRemoteWorkspaceFileReader?.(({ path, maxBytes, workspaceRoot, signal, timeoutMs }) => readBoundedCodexRemoteWorkspaceFile({
			client: startupResult.client,
			path,
			maxBytes,
			workspaceRoot,
			signal,
			timeoutMs
		}));
		if (usesSupervisionConnection && (state.thread.connectionScope !== "supervision" || state.thread.supervisionSourceThreadId !== connection.mutable.startupBinding?.supervisionSourceThreadId)) throw new Error("Codex supervised thread lost its private connection ownership");
		if (state.thread.lifecycle.action === "started" || state.thread.lifecycle.action === "forked") {
			const activePolicy = resolveReviewerPolicyContext(state.thread);
			const activeConfig = resolveRuntimeOptionsForCurrentBinding({
				modelProvider: activePolicy.modelProvider,
				model: activePolicy.model
			});
			const activeAppServer = resolveCodexAppServerForModelProvider({
				appServer: activeConfig,
				provider: activePolicy.modelProvider,
				model: activePolicy.model,
				config: params.config,
				env: process.env,
				agentDir
			});
			const previousReviewer = pluginAppServer.approvalsReviewer;
			pluginAppServer = {
				...pluginAppServer,
				approvalsReviewer: activeAppServer.approvalsReviewer
			};
			if (pluginAppServer.approvalsReviewer !== previousReviewer) embeddedAgentLog.info("codex app-server approval reviewer updated from active thread model provider", {
				from: previousReviewer,
				to: pluginAppServer.approvalsReviewer,
				modelProvider: activePolicy.modelProvider
			});
		}
		state.codexEnvironmentSelection = startupResult.environmentSelection;
		state.codexExecutionCwd = startupResult.executionCwd;
		state.codexSandboxPolicy = startupResult.sandboxPolicy;
		emitCodexAppServerEvent(params, {
			stream: "codex_app_server.lifecycle",
			data: {
				phase: "thread_ready",
				threadId: state.thread.threadId,
				action: state.thread.lifecycle.action,
				clientId: state.client.getInstanceId()
			}
		});
		await context.historyState?.ensureHistoryFor?.(state.thread.lifecycle.action, state.thread); // v-codex-bounded-history-v1
		if (applyNoContextEngineContinuityProjection(state.thread.lifecycle.action, state.thread)) await rebuildCodexTurnPromptTextFromCurrentProjection();
		trajectoryRecorder?.recordEvent("session.started", {
			sessionFile: params.sessionFile,
			threadId: state.thread.threadId,
			authProfileId: startupAuthProfileId,
			workspaceDir: effectiveWorkspace,
			toolCount: flattenCodexDynamicToolFunctions(toolBridge.specs).length
		});
		recordCodexTrajectoryContext(trajectoryRecorder, {
			attempt: params,
			cwd: effectiveCwd,
			developerInstructions: joinPresentSections(buildRenderedCodexDeveloperInstructions(), attemptTools.configuredMcp?.diagnosticNotice),
			prompt: turnState.codexTurnPromptText,
			tools: toolBridge.availableSpecs
		});
		connection.mutable.pluginAppServer = pluginAppServer;
	} catch (error) {
		await runCleanupStep("codex-start-failure-hook-fallback", activateNativePreToolUseFailureFallback);
		await runCleanupStep("codex-start-failure-route-release", releaseCurrentRoute);
		const nativeHookRelay = state.nativeHookRelay;
		state.nativeHookRelay = void 0;
		await runCleanupStep("codex-start-failure-native-hook-relay", () => nativeHookRelay?.unregister());
		await runCleanupStep("codex-start-failure-sandbox-release", releaseSandboxExecEnvironment);
		await runCleanupStep("codex-start-failure-shared-client-release", releaseSharedClientLeaseAndRetireOneShotClient);
		await runCleanupStep("codex-start-failure-abort-listener", () => params.abortSignal?.removeEventListener("abort", abortFromUpstream));
		throw error instanceof CodexThreadPolicyHandoffError ? error : state.executionDisconnectError ?? error;
	}
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-tool-setup.ts
function isAuthorityResolutionOperationAbort(error, signal) {
	return signal?.aborted === true && error === signal.reason;
}
async function prepareCodexAttemptTools(runtime) {
	const { connection, bundleMcpThreadConfig, bundleManifestRegistry, runtimeParams, effectiveRuntimeModelId, nativeToolSurfaceEnabled, nativeProviderWebSearchSupport, hookChannelId, codexMcpToolOverrides, authenticatedScheduledMode, configuredMcpSurface, canResolveScheduledConfiguredMcpCreatorAuthority } = runtime;
	const { params, preDynamicStartupStages, mutable, startupAuthProfileId, resolvedWorkspace, effectiveWorkspace, effectiveCwd, sandboxSessionKey, contextSessionKey, sandbox, sessionPermissionPolicy, runAbortController, sessionAgentId, policyAgentId, pluginConfig, profilerEnabled, agentDir } = connection;
	const preDynamicSummary = preDynamicStartupStages.snapshot();
	if (shouldWarnCodexDynamicToolBuildStageSummary(preDynamicSummary)) embeddedAgentLog.warn(`codex app-server pre-dynamic startup timings runId=${params.runId} sessionId=${params.sessionId} totalMs=${preDynamicSummary.totalMs} stages=${formatCodexDynamicToolBuildStageSummary(preDynamicSummary)}`, {
		runId: params.runId,
		sessionId: params.sessionId,
		totalMs: preDynamicSummary.totalMs,
		stages: preDynamicSummary.stages,
		hasStartupBinding: Boolean(mutable.startupBinding?.threadId),
		startupAuthProfileId: startupAuthProfileId ?? null,
		bundleMcpDiagnosticCount: bundleMcpThreadConfig.diagnostics.length,
		nativeToolSurfaceEnabled
	});
	const toolState = {
		yieldDetected: false,
		yieldAcknowledgment: void 0,
		persistentWebSearchAllowed: void 0,
		webSearchAllowed: false
	};
	const toolOutcomeOrdinals = /* @__PURE__ */ new Map();
	const suppressedDynamicToolOutcomeOrdinals = /* @__PURE__ */ new Set();
	const onCodexToolOutcome = params.onToolOutcome ? (observation) => {
		if (observation.toolCallOrdinal !== void 0 && suppressedDynamicToolOutcomeOrdinals.has(observation.toolCallOrdinal)) return;
		params.onToolOutcome?.(observation);
	} : void 0;
	const baseAllocateToolOutcomeOrdinal = params.allocateToolOutcomeOrdinal;
	const allocateCodexToolOutcomeOrdinal = baseAllocateToolOutcomeOrdinal ? (toolCallId) => {
		const reservedOrdinal = toolCallId ? toolOutcomeOrdinals.get(toolCallId) : void 0;
		if (reservedOrdinal !== void 0) return reservedOrdinal;
		const ordinal = baseAllocateToolOutcomeOrdinal(toolCallId);
		if (toolCallId) toolOutcomeOrdinals.set(toolCallId, ordinal);
		return ordinal;
	} : void 0;
	const compactionPlanState = new CodexCompactionPlanState();
	const dynamicToolParams = {
		...runtimeParams,
		onAgentEvent: (event) => {
			compactionPlanState.record(event);
			return runtimeParams.onAgentEvent?.(event);
		},
		...allocateCodexToolOutcomeOrdinal ? { allocateToolOutcomeOrdinal: allocateCodexToolOutcomeOrdinal } : {},
		...onCodexToolOutcome ? { onToolOutcome: onCodexToolOutcome } : {}
	};
	const computerContextEpoch = { value: 0 };
	const runCleanups = [];
	const cronCreatorToolAllowlist = [];
	const cronCreatorToolAllowlistCaptureRef = {};
	const scheduledAppAuthoritySourceRef = {};
	const preparedChatgptAuth = connection.startupPreparedAuth?.kind === "profile" && connection.startupPreparedAuth.snapshot?.loginParams.type === "chatgptAuthTokens" && connection.startupPreparedAuth.snapshot.chatgptAccountId ? {
		kind: "prepared-profile",
		profileId: connection.startupPreparedAuth.profileId,
		accountId: connection.startupPreparedAuth.snapshot.chatgptAccountId
	} : void 0;
	const configuredAppServerAuth = !preparedChatgptAuth && connection.appServer.start.transport !== "stdio" ? {
		kind: "configured-app-server",
		connectionFingerprint: buildScheduledCodexAppServerConnectionIdentity(connection.appServer)
	} : void 0;
	const scheduledCodexAppAuth = preparedChatgptAuth ?? configuredAppServerAuth;
	const appPolicy = resolveCodexPluginsPolicy(pluginConfig);
	const codexAppsMayBeVisible = appPolicy.enabled && (appPolicy.allowAllPlugins || appPolicy.pluginPolicies.some((entry) => entry.enabled));
	const appCreatorCapture = resolveScheduledCodexAppCreatorCaptureDecision({
		appsMayBeVisible: codexAppsMayBeVisible,
		authenticatedScheduledMode,
		usesSupervisionConnection: connection.usesSupervisionConnection,
		homeScope: connection.appServer.start.homeScope,
		hasPreparedAccountIdentity: Boolean(preparedChatgptAuth),
		hasConfiguredAppServerIdentity: Boolean(configuredAppServerAuth)
	});
	const codexAppAuthorityUnavailableReason = appCreatorCapture.unavailableReason;
	const canResolveScheduledCodexAppAuthority = appCreatorCapture.supported;
	const requiresScheduledCodexAppAuthority = appCreatorCapture.required;
	const canResolveAnyScheduledCreatorAuthority = canResolveScheduledConfiguredMcpCreatorAuthority || requiresScheduledCodexAppAuthority;
	let toolBridge;
	let creatorAuthorityPromise;
	let resolveCreatorAuthorityImpl;
	const runtimeYieldCompletionClaim = {};
	const commonToolParams = {
		nodeExecAvailability: {},
		params: dynamicToolParams,
		resolvedWorkspace,
		effectiveWorkspace,
		effectiveCwd,
		sandboxSessionKey,
		sandbox,
		sessionPermissionPolicy,
		nativeToolSurfaceEnabled,
		nativeProviderWebSearchSupport,
		runAbortController,
		sessionAgentId,
		policyAgentId,
		pluginConfig,
		profilerEnabled,
		...params.cronCreatorAuthorityUnavailableReason === "queued-local-operator" && bundleMcpThreadConfig.staticServerNames.length > 0 ? { cronCreatorAuthorityUnavailableReason: "queued-local-operator-configured-mcp" } : {},
		onYieldDetected: (acknowledgment) => {
			toolState.yieldDetected = true;
			toolState.yieldAcknowledgment = acknowledgment;
		},
		claimYieldCompletion: () => runtimeYieldCompletionClaim.current?.() ?? false,
		onCodexAppServerEvent: (event) => {
			emitCodexAppServerEvent(params, event);
		},
		computerContextEpoch,
		...canResolveAnyScheduledCreatorAuthority ? { resolveCronCreatorToolAuthority: (options) => {
			if (!resolveCreatorAuthorityImpl) throw new Error("configured MCP authority resolver was invoked before tool setup");
			options?.signal?.throwIfAborted();
			if (creatorAuthorityPromise) return creatorAuthorityPromise;
			const pending = resolveCreatorAuthorityImpl(options);
			creatorAuthorityPromise = pending;
			pending.catch((error) => {
				if (creatorAuthorityPromise === pending && isAuthorityResolutionOperationAbort(error, options?.signal)) creatorAuthorityPromise = void 0;
			});
			return pending;
		} } : {}
	};
	let nativeSpecs;
	if (hasCodexNativeToolCatalog(mutable.startupBinding)) {
		runAbortController.signal.throwIfAborted();
		params.hostCapabilities.assertActive();
		const client = await connection.attemptClientFactory({
			startOptions: connection.appServer.start,
			authProfileId: connection.startupClientAuthProfileId,
			agentDir,
			config: params.config,
			timeoutMs: connection.appServer.requestTimeoutMs
		});
		try {
			nativeSpecs = await loadCodexNativeToolCatalog({
				client,
				binding: mutable.startupBinding,
				appServer: connection.appServer,
				agentDir,
				assertCurrent: () => {
					runAbortController.signal.throwIfAborted();
					params.hostCapabilities.assertActive();
				}
			});
		} finally {
			releaseLeasedSharedCodexAppServerClient(client);
		}
	}
	const tools = await buildDynamicTools({
		...commonToolParams,
		registerRunCleanup: (cleanup) => runCleanups.push(cleanup),
		cronCreatorToolAllowlistRef: cronCreatorToolAllowlist,
		cronCreatorToolAllowlistCaptureRef,
		onPersistentWebSearchPolicyResolved: (allowed) => {
			toolState.persistentWebSearchAllowed = allowed;
		},
		onWebSearchPolicyResolved: (allowed) => {
			toolState.webSearchAllowed = allowed;
		}
	});
	const registeredTools = nativeSpecs ? [] : await buildDynamicTools({
		...commonToolParams,
		forceHeartbeatTool: true,
		ignoreDisableMessageTool: true,
		ignoreRuntimePlan: true
	});
	const policyContext = {
		config: params.config,
		sessionKey: sandboxSessionKey,
		runSessionKey: params.sessionKey && params.sessionKey !== sandboxSessionKey ? params.sessionKey : void 0,
		sessionId: params.sessionId,
		runId: params.runId,
		agentId: policyAgentId,
		agentDir: agentDir ?? resolveAgentDir(params.config ?? {}, sessionAgentId),
		agentAccountId: params.agentAccountId,
		messageProvider: params.messageProvider ?? params.messageChannel,
		messageChannel: params.messageChannel,
		chatType: params.chatType,
		messageTo: params.messageTo,
		messageThreadId: params.messageThreadId,
		currentChannelId: params.currentChannelId,
		currentMessagingTarget: params.currentMessagingTarget,
		currentThreadTs: params.currentThreadTs,
		currentMessageId: params.currentMessageId,
		groupId: params.groupId,
		groupChannel: params.groupChannel,
		groupSpace: params.groupSpace,
		memberRoleIds: params.memberRoleIds,
		spawnedBy: params.spawnedBy,
		senderId: params.senderId,
		senderName: params.senderName,
		senderUsername: params.senderUsername,
		senderE164: params.senderE164,
		senderIsOwner: params.senderIsOwner,
		modelProvider: params.provider,
		modelId: params.modelId,
		modelApi: params.model.api,
		modelContextWindowTokens: params.model.contextWindow,
		modelHasVision: params.model.input?.includes("image") ?? false,
		workspaceDir: effectiveWorkspace,
		cwd: effectiveCwd ?? effectiveWorkspace,
		sandboxToolPolicy: sandbox?.tools,
		conversationToolPolicy: params.conversationToolPolicy,
		inputProvenance: params.inputProvenance,
		trustedInternalHandoff: params.trustedInternalHandoff,
		scheduledToolPolicy: params.scheduledToolPolicy
	};
	const reservedToolNames = [...tools.map((tool) => tool.name), ...registeredTools.map((tool) => tool.name)];
	const turnSourceChannel = params.messageChannel ?? params.messageProvider;
	const turnSourceTo = params.currentMessagingTarget ?? params.currentChannelId;
	const requester = {
		...turnSourceChannel ? { channel: turnSourceChannel } : {},
		...params.agentAccountId ? { accountId: params.agentAccountId } : {},
		...params.senderId ? { senderId: params.senderId } : {},
		...params.senderIsOwner !== void 0 ? { senderIsOwner: params.senderIsOwner } : {},
		...params.memberRoleIds?.length ? { roleIds: [...params.memberRoleIds] } : {}
	};
	const hasRequester = Object.keys(requester).length > 0;
	const configuredMcp = configuredMcpSurface ? await materializeStaticMcpToolsForHarnessRun({
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		agentId: sessionAgentId,
		workspaceDir: effectiveWorkspace,
		agentDir: policyContext.agentDir,
		cfg: params.config,
		manifestRegistry: bundleManifestRegistry,
		reservedToolNames,
		toolsAllow: params.toolsAllow,
		toolOverrides: codexMcpToolOverrides,
		autoApproveCodexAppServerApprovals: shouldAutoApproveCodexAppServerApprovals(connection.appServer),
		projectedMcpServers: bundleMcpThreadConfig.configPatch?.mcp_servers,
		...configuredMcpSurface === "transient" ? { requestInteractiveCodexApproval: async (approval) => {
			const allowedDecisions = approval.mode === "prompt" ? ["allow-once", "deny"] : [
				"allow-once",
				"allow-always",
				"deny"
			];
			const outcome = await requestPluginApprovalOutcome({
				hostCapabilities: params.hostCapabilities,
				signal: approval.signal,
				title: `Run MCP tool ${approval.serverName}/${approval.toolName}`,
				description: `Codex approval mode "${approval.mode}" requires an operator decision before this MCP tool runs. ${formatMcpCodexApprovalRemedy(approval.serverName)}`,
				allowedDecisions,
				toolName: approval.safeToolName,
				toolCallId: approval.toolCallId,
				mcpTool: {
					server: approval.serverName,
					tool: approval.toolName
				},
				isMcpToolApprovalActive: approval.isActive
			});
			if (outcome !== "approved-once" && outcome !== "approved-session") throw new Error(`${approval.serverName}/${approval.toolName}: interactive Codex approval (${approval.mode}) was not granted: ${outcome}`);
		} } : {},
		policyContext,
		warn: (message) => embeddedAgentLog.warn(message)
	}) : void 0;
	let scopedMcpTools = void 0;
	try {
		scopedMcpTools = authenticatedScheduledMode ? void 0 : await materializeRequesterScopedMcpToolsForHarnessRun({
			sessionId: params.sessionId,
			sessionKey: params.sessionKey,
			workspaceDir: effectiveWorkspace,
			agentDir: policyContext.agentDir,
			cfg: params.config,
			manifestRegistry: bundleManifestRegistry,
			toolOverrides: codexMcpToolOverrides,
			requesterSenderId: params.senderId,
			agentAccountId: params.agentAccountId,
			messageChannel: params.messageChannel ?? params.messageProvider,
			reservedToolNames: [...reservedToolNames, ...configuredMcp?.tools.map((tool) => tool.name) ?? []],
			toolsAllow: params.toolsAllow,
			policyContext,
			warn: (message) => embeddedAgentLog.warn(message)
		});
		const scopedExecutable = filterCodexDynamicTools([...configuredMcp?.tools ?? [], ...scopedMcpTools?.tools ?? []], pluginConfig);
		const scopedAdvertised = filterCodexDynamicTools([...configuredMcp?.tools ?? [], ...scopedMcpTools?.advertisedTools ?? []], pluginConfig);
		const toolsWithScopedMcp = scopedExecutable.length > 0 ? [...tools, ...scopedExecutable] : tools;
		const registeredWithScopedMcp = scopedAdvertised.length > 0 ? [...registeredTools, ...scopedAdvertised] : registeredTools;
		const hookContext = {
			agentId: sessionAgentId,
			config: params.config,
			contextWindowTokens: params.contextTokenBudget ?? params.model.contextWindow,
			workspaceDir: effectiveWorkspace,
			remoteWorkspaceRoot: connection.appServer.remoteWorkspaceRoot,
			remoteWorkspaceRequestTimeoutMs: connection.appServer.requestTimeoutMs,
			sessionId: params.sessionId,
			sessionKey: contextSessionKey,
			runId: params.runId,
			channelId: hookChannelId,
			currentChannelProvider: resolveCodexMessageToolProvider(params),
			currentChannelId: params.currentChannelId,
			currentMessagingTarget: params.currentMessagingTarget,
			currentMessageId: params.currentMessageId,
			currentThreadId: params.currentThreadTs,
			replyToMode: params.replyToMode,
			hasRepliedRef: params.hasRepliedRef,
			sourceReplyDeliveryMode: params.sourceReplyDeliveryMode,
			onToolOutcome: onCodexToolOutcome,
			allocateToolOutcomeOrdinal: allocateCodexToolOutcomeOrdinal,
			trigger: params.trigger,
			approvalReviewerDeviceId: params.approvalReviewerDeviceId,
			...hasRequester ? { requester } : {},
			...turnSourceChannel ? { turnSourceChannel } : {},
			...turnSourceTo ? { turnSourceTo } : {},
			...params.agentAccountId ? { turnSourceAccountId: params.agentAccountId } : {},
			...params.currentThreadTs !== void 0 ? { turnSourceThreadId: params.currentThreadTs } : {}
		};
		toolBridge = createCodexDynamicToolBridge({
			tools: toolsWithScopedMcp,
			registeredTools: registeredWithScopedMcp,
			registeredSpecs: nativeSpecs,
			signal: runAbortController.signal,
			computerContextEpoch,
			loading: resolveCodexDynamicToolsLoadingForRuntime(pluginConfig, effectiveRuntimeModelId, { connectionClass: connection.appServer.connectionClass }),
			directToolNames: resolveCodexDynamicToolDirectNames(params, isHostScopedAgentToolActive("openclaw")),
			hookContext
		});
		await captureFinalCodexCronCreatorToolAllowlist(cronCreatorToolAllowlist, cronCreatorToolAllowlistCaptureRef, toolBridge.availableTools);
		if (!authenticatedScheduledMode && bundleMcpThreadConfig.staticServerNames.length > 0 && !canResolveScheduledConfiguredMcpCreatorAuthority) delete cronCreatorToolAllowlistCaptureRef.value;
		if (requiresScheduledCodexAppAuthority) delete cronCreatorToolAllowlistCaptureRef.value;
		if (canResolveAnyScheduledCreatorAuthority) resolveCreatorAuthorityImpl = async (options) => {
			options?.signal?.throwIfAborted();
			if (codexAppAuthorityUnavailableReason) throw new Error(codexAppAuthorityUnavailableReason);
			if (!toolBridge) throw new Error("cron creator authority resolver lost the active tool bridge");
			const authorityTools = [];
			const captureRef = {};
			await captureFinalCodexCronCreatorToolAllowlist(authorityTools, captureRef, toolBridge.availableTools);
			if (!captureRef.value) throw new Error("cron creator authority snapshot did not produce provenance");
			const appSource = scheduledAppAuthoritySourceRef.current;
			const runtimeAuthority = canResolveScheduledCodexAppAuthority && scheduledCodexAppAuth ? appSource ? await captureScheduledCodexAppAuthority({
				...appSource,
				auth: scheduledCodexAppAuth,
				signal: options?.signal
			}) : (() => {
				throw new Error("Codex app authority is unavailable before the exact creator thread is active. Retry this automation mutation from the current owner turn.");
			})() : void 0;
			if (!canResolveScheduledConfiguredMcpCreatorAuthority) {
				options?.signal?.throwIfAborted();
				return Object.freeze({
					tools: Object.freeze(authorityTools.map((entry) => Object.freeze(entry))),
					provenance: Object.freeze(captureRef.value),
					...runtimeAuthority ? { runtimeAuthority } : {}
				});
			}
			const authorityRuntimeId = `cron-authority:${params.runId}`;
			let materialized;
			try {
				materialized = await materializeStaticMcpToolsForHarnessRun({
					sessionId: authorityRuntimeId,
					agentId: sessionAgentId,
					workspaceDir: effectiveWorkspace,
					agentDir: policyContext.agentDir,
					cfg: params.config,
					manifestRegistry: bundleManifestRegistry,
					reservedToolNames: toolBridge.availableTools.map((tool) => tool.name),
					toolsAllow: params.toolsAllow,
					toolOverrides: codexMcpToolOverrides,
					autoApproveCodexAppServerApprovals: shouldAutoApproveCodexAppServerApprovals(connection.appServer),
					projectedMcpServers: bundleMcpThreadConfig.configPatch?.mcp_servers,
					policyContext,
					warn: (message) => embeddedAgentLog.warn(message),
					retireSessionRuntimeAfterDispose: true
				});
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				throw new Error(`Configured MCP discovery failed while resolving inherited automation authority: ${detail}. Retry after the server is available, or provide an explicit finite toolsAllow list containing only currently visible tools; no automation changes were saved.`, { cause: error });
			}
			try {
				options?.signal?.throwIfAborted();
				if (materialized.diagnosticNotice) throw new Error(`${materialized.diagnosticNotice} Sign in to the affected MCP server and retry, or provide an explicit finite toolsAllow list containing only currently visible tools. No automation changes were saved.`);
				const projectedConfiguredMcp = projectCodexExecutableDynamicTools({
					tools: filterCodexDynamicTools(materialized.tools, pluginConfig),
					hookContext
				});
				await captureFinalCodexCronCreatorToolAllowlist(authorityTools, captureRef, [...toolBridge.availableTools, ...projectedConfiguredMcp.availableTools]);
				if (!captureRef.value) throw new Error("configured MCP authority snapshot did not produce provenance");
				options?.signal?.throwIfAborted();
				return Object.freeze({
					tools: Object.freeze(authorityTools.map((entry) => Object.freeze(entry))),
					provenance: Object.freeze(captureRef.value),
					...runtimeAuthority ? { runtimeAuthority } : {}
				});
			} finally {
				await materialized.dispose();
			}
		};
		return {
			tools: toolsWithScopedMcp,
			registeredTools: registeredWithScopedMcp,
			scopedMcpTools,
			configuredMcp,
			configuredMcpOwnershipVersion: configuredMcpSurface === "scheduled" ? 1 : void 0,
			cronCreatorToolAllowlist,
			cronCreatorToolAllowlistCaptureRef,
			scheduledAppAuthoritySourceRef,
			dynamicToolParams,
			compactionPlanState,
			computerContextEpoch,
			runCleanups,
			toolBridge,
			toolState,
			toolOutcomeOrdinals,
			suppressedDynamicToolOutcomeOrdinals,
			onCodexToolOutcome,
			allocateCodexToolOutcomeOrdinal,
			runtimeYieldCompletionClaim
		};
	} catch (error) {
		await scopedMcpTools?.dispose();
		await configuredMcp?.dispose();
		throw error;
	}
}
//#endregion
//#region extensions/codex/src/app-server/explicit-skill-input.ts
function comparablePath(value) {
	const resolved = path.resolve(value);
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
async function resolveCodexExplicitSkillInputs(params) {
	if (!params.selections?.length) return [];
	try {
		const response = await params.client.request("skills/list", {
			cwds: [params.cwd],
			forceReload: false
		}, { signal: params.signal });
		const cwd = comparablePath(params.cwd);
		const catalog = response.data.find((entry) => comparablePath(entry.cwd) === cwd);
		return params.selections.flatMap((selection) => {
			const selectedPath = comparablePath(selection.path);
			const skill = catalog?.skills.find((candidate) => candidate.enabled && comparablePath(candidate.path) === selectedPath);
			return skill ? [{
				type: "skill",
				name: skill.name,
				path: skill.path
			}] : [];
		});
	} catch (error) {
		embeddedAgentLog.debug("codex explicit skill catalog unavailable; using prompt fallback", { error: formatErrorMessage(error) });
		return [];
	}
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-turn-request.ts
async function prepareCodexAttemptTurnRequest(resources, turnRuntime, ensureCurrentThreadRoute, waitForActiveNativeTurnCompletion) {
	const { prompt, state: resourceState, releaseCurrentRoute } = resources;
	const { context, turnState, buildRenderedCodexDeveloperInstructions } = prompt;
	const { runtime, attemptTools, hookContextWindowFields, workspaceBootstrapContext } = context;
	const { connection, runtimeParams, effectiveRuntimeProviderId, effectiveRuntimeModelId } = runtime;
	const { tools, toolBridge } = attemptTools;
	const { params, usesSupervisionConnection, codexModelCallId, codexModelCallTrace, codexModelContentCapture, appServer, runAbortController } = connection;
	const { state } = turnRuntime;
	const explicitSkillInputs = await resolveCodexExplicitSkillInputs({
		client: resourceState.client,
		cwd: resourceState.codexExecutionCwd,
		selections: runtimeParams.explicitSkillSelections,
		signal: runAbortController.signal
	});
	const buildCodexModelInputMessages = () => [...prompt.codexModelInputHistoryMessages, buildCodexUserPromptMessage({
		...runtimeParams,
		prompt: turnState.codexTurnPromptText
	})];
	const codexModelCallDiagnostics = createCodexModelCallDiagnosticEmitter({
		baseFields: {
			runId: params.runId,
			callId: codexModelCallId,
			...params.sessionKey ? { sessionKey: params.sessionKey } : {},
			sessionId: params.sessionId,
			provider: usesSupervisionConnection ? resourceState.thread.modelProvider ?? effectiveRuntimeProviderId : params.provider,
			model: usesSupervisionConnection ? resourceState.thread.model ?? effectiveRuntimeModelId : params.modelId,
			api: usesSupervisionConnection ? runtimeParams.model.api : params.model.api,
			transport: appServer.start.transport,
			observationUnit: "turn",
			...hookContextWindowFields,
			trace: codexModelCallTrace
		},
		capture: codexModelContentCapture,
		tools,
		buildInputMessages: buildCodexModelInputMessages,
		buildSystemPrompt: buildRenderedCodexDeveloperInstructions,
		onErrorDiagnostic: (error) => {
			embeddedAgentLog.debug("codex app-server model call diagnostic ended with error", { error: formatErrorMessage(error) });
		}
	});
	const throwIfTurnStartAcceptedAfterAbort = () => {
		if (!runAbortController.signal.aborted) return;
		const reason = runAbortController.signal.reason;
		if (reason instanceof Error) throw reason;
		const error = new Error(typeof reason === "string" && reason.length > 0 ? reason : "codex app-server turn start aborted before acceptance");
		error.name = "AbortError";
		throw error;
	};
	const startCodexTurn = async () => {
		const activeTurnRoute = await ensureCurrentThreadRoute();
		const turnAppServer = withCodexAppServerFastModeServiceTier(connection.mutable.pluginAppServer, runtimeParams);
		connection.mutable.pluginAppServer = turnAppServer;
		// v-codex-turn-context-handoff-v1: catalog-backed models drop collaboration-mode developer_instructions
		const turnContextInstructions = joinPresentSections(workspaceBootstrapContext.turnScopedDeveloperInstructions, workspaceBootstrapContext.memoryCollaborationInstructions, context.skillsCollaborationInstructions);
		resourceState.vTurnContextHandoff = usesSupervisionConnection ? void 0 : {
			agentDir: params.agentDir,
			instructions: turnContextInstructions
		};
		const turnContextHandoff = usesSupervisionConnection ? "skipped" : await deliverCodexTurnContextHandoff({
			client: resourceState.client,
			threadId: resourceState.thread.threadId,
			...resourceState.vTurnContextHandoff,
			timeoutMs: appServer.requestTimeoutMs,
			signal: runAbortController.signal
		});
		const turnContextInCollaboration = turnContextHandoff === "failed" || turnContextHandoff === "skipped";
		const turnStartParams = buildTurnStartParams(runtimeParams, {
			threadId: resourceState.thread.threadId,
			cwd: resourceState.codexExecutionCwd,
			appServer: turnAppServer,
			promptText: turnState.codexTurnPromptText,
			explicitSkillInputs,
			sandboxPolicy: resourceState.codexSandboxPolicy,
			environmentSelection: resourceState.codexEnvironmentSelection,
			clearInheritedServiceTier: resourceState.thread.clearInheritedServiceTier,
			...usesSupervisionConnection ? {} : {
				model: resourceState.thread.model,
				modelProvider: resourceState.thread.modelProvider
			},
			turnScopedDeveloperInstructions: turnContextInCollaboration ? workspaceBootstrapContext.turnScopedDeveloperInstructions : void 0,
			skillsCollaborationInstructions: turnContextInCollaboration ? context.skillsCollaborationInstructions : void 0,
			memoryCollaborationInstructions: turnContextInCollaboration ? workspaceBootstrapContext.memoryCollaborationInstructions : void 0,
			preserveNativeTurnSettings: usesSupervisionConnection,
			sessionStatusAvailable: toolBridge.availableTools.some((tool) => tool.name === "session_status")
		});
		codexModelCallDiagnostics.setRequestPayloadBytes(utf8JsonByteLength(turnStartParams));
		state.latestStartupErrorNotification = void 0;
		state.rateLimitsRevisionBeforeLastTurnStart = readCodexRateLimitsRevision(resourceState.client);
		activeTurnRoute.armTurn();
		emitCodexAppServerEvent(params, {
			stream: "codex_app_server.lifecycle",
			data: {
				phase: "turn_starting",
				threadId: resourceState.thread.threadId,
				model: params.modelId,
				effort: turnStartParams.effort,
				collaborationEffort: turnStartParams.collaborationMode?.settings.reasoning_effort,
				serviceTier: turnStartParams.serviceTier
			}
		});
		let acceptedTurnId;
		try {
			const startedTurn = assertCodexTurnStartResponse(await resourceState.client.request("turn/start", turnStartParams, {
				timeoutMs: params.timeoutMs,
				signal: runAbortController.signal
			}));
			acceptedTurnId = startedTurn.turn.id;
			throwIfTurnStartAcceptedAfterAbort();
			return startedTurn;
		} catch (error) {
			if (acceptedTurnId || isCodexAppServerIndeterminateRequestCancellationError(error)) try {
				resourceState.startupClientUnsafe = !await interruptCodexTurnAndWaitBestEffort(resourceState.client, {
					threadId: resourceState.thread.threadId,
					turnId: acceptedTurnId ?? ""
				});
				if (resourceState.startupClientUnsafe) await retireUnsafeCodexTurnClientBestEffort(resourceState.client, "startup interrupt");
			} finally {
				releaseCurrentRoute();
			}
			else await activeTurnRoute.cancelTurn();
			throw error;
		}
	};
	if (resourceState.thread.lifecycle.action === "resumed" && (resourceState.thread.lifecycle.activeTurnIds?.length ?? 0) > 0) {
		embeddedAgentLog.info("codex app-server resumed thread has active native turn; waiting before turn/start", { threadId: resourceState.thread.threadId });
		emitCodexAppServerEvent(params, {
			stream: "codex_app_server.lifecycle",
			data: {
				phase: "turn_start_waiting_for_native_turn",
				threadId: resourceState.thread.threadId
			}
		});
		if (await waitForActiveNativeTurnCompletion()) await resourceState.turnRoute?.drain();
		else if (!runAbortController.signal.aborted) embeddedAgentLog.warn("codex app-server active native turn did not complete before turn/start wait timed out", { threadId: resourceState.thread.threadId });
	}
	const buildLlmInputEvent = () => ({
		runId: params.runId,
		sessionId: params.sessionId,
		provider: usesSupervisionConnection ? resourceState.thread.modelProvider ?? effectiveRuntimeProviderId : params.provider,
		model: usesSupervisionConnection ? resourceState.thread.model ?? effectiveRuntimeModelId : params.modelId,
		systemPrompt: buildRenderedCodexDeveloperInstructions(),
		prompt: turnState.codexTurnPromptText,
		historyMessages: prompt.codexModelInputHistoryMessages,
		imagesCount: params.images?.length ?? 0,
		tools
	});
	return {
		codexModelCallDiagnostics,
		startCodexTurn,
		buildLlmInputEvent
	};
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-turn-start.ts
async function startCodexAttemptTurn(resources, turnRuntime, notifications, requestRuntime) {
	const { prompt, state: resourceState, trajectoryRecorder, markTrajectoryEndRecorded, activateNativePreToolUseFailureFallback, releaseCurrentRoute, releaseSandboxExecEnvironment, releaseSharedClientLeaseAndRetireOneShotClient } = resources;
	const { context, turnState, systemPromptReport } = prompt;
	const { runtime, historyState, hookContext, hookContextWindowFields, hookRunner } = context;
	const { connection, runtimeParams, effectiveRuntimeProviderId, effectiveRuntimeModelId } = runtime;
	const { params, usesSupervisionConnection, runAbortController, activeContextEngine, bindingStore, bindingIdentity, appServer, attemptStartedAt, startupAuthProfileId, abortFromUpstream } = connection;
	const { state, turnIdRef } = turnRuntime;
	const { waitForActiveNativeTurnCompletion } = notifications;
	const { codexModelCallDiagnostics, startCodexTurn, buildLlmInputEvent } = requestRuntime;
	let turn;
	try {
		codexModelCallDiagnostics.emitStarted();
		runAgentHarnessLlmInputHook({
			event: buildLlmInputEvent(),
			ctx: hookContext,
			hookRunner
		});
		turn = await startCodexTurn();
	} catch (error) {
		let turnStartError = error;
		if (isCodexActiveCompactTurnError(turnStartError)) {
			embeddedAgentLog.info("codex app-server turn/start blocked by active compact turn; waiting to retry", { threadId: resourceState.thread.threadId });
			if (await waitForActiveNativeTurnCompletion() && !runAbortController.signal.aborted) {
				emitCodexAppServerEvent(params, {
					stream: "codex_app_server.lifecycle",
					data: {
						phase: "turn_start_retry_after_compact",
						threadId: resourceState.thread.threadId
					}
				});
				try {
					turn = await startCodexTurn();
				} catch (retryError) {
					turnStartError = retryError;
				}
			}
		}
		if (turn === void 0 && resourceState.thread.connectionScope !== "supervision" && shouldUseFreshCodexThreadAfterContextEngineOverflow({
			error: turnStartError,
			contextEngineActive: Boolean(activeContextEngine),
			thread: resourceState.thread
		}) && resourceState.restartContextEngineCodexThread) {
			embeddedAgentLog.warn("codex app-server context-engine turn overflowed on resume; retrying with fresh thread", {
				threadId: resourceState.thread.threadId,
				error: formatErrorMessage(turnStartError)
			});
			try {
				if (!await bindingStore.mutate(bindingIdentity, {
					kind: "clear",
					threadId: resourceState.thread.threadId
				})) embeddedAgentLog.warn("codex app-server preserved newer context-engine binding after resume overflow; skipping fresh retry", {
					threadId: resourceState.thread.threadId,
					error: formatErrorMessage(turnStartError)
				});
				else {
					resourceState.thread = await resourceState.restartContextEngineCodexThread();
					const retryBinding = await bindingStore.read(bindingIdentity);
					if (retryBinding && retryBinding.threadId === resourceState.thread.threadId && retryBinding.contextEngine?.projection) {
						await bindingStore.mutate(bindingIdentity, {
							kind: "patch",
							threadId: retryBinding.threadId,
							patch: { contextEngine: {
								...retryBinding.contextEngine,
								projection: void 0
							} }
						});
						embeddedAgentLog.info("codex app-server cleared stale context-engine projection after overflow retry", {
							threadId: resourceState.thread.threadId,
							previousEpoch: retryBinding.contextEngine.projection.epoch
						});
					}
					emitCodexAppServerEvent(params, {
						stream: "codex_app_server.lifecycle",
						data: {
							phase: "thread_ready_retry",
							threadId: resourceState.thread.threadId
						}
					});
					try {
						turn = await startCodexTurn();
					} catch (retryError) {
						turnStartError = retryError;
					}
				}
			} catch (retrySetupError) {
				turnStartError = retrySetupError;
			}
		}
		if (turn === void 0) {
			const usageLimitError = await formatCodexTurnStartUsageLimitError({
				client: resourceState.client,
				error: turnStartError,
				errorNotification: state.latestStartupErrorNotification,
				rateLimitsRevisionBeforeTurnStart: state.rateLimitsRevisionBeforeLastTurnStart,
				timeoutMs: appServer.requestTimeoutMs,
				signal: runAbortController.signal
			});
			const message = usageLimitError?.message ?? formatErrorMessage(turnStartError);
			if (isInvalidCodexImagePayloadError(message)) await clearCodexBindingAfterInvalidImagePayload(bindingStore, bindingIdentity, {
				phase: "turn_start",
				threadId: resourceState.thread.threadId,
				error: message
			});
			emitCodexAppServerEvent(params, {
				stream: "codex_app_server.lifecycle",
				data: {
					phase: "turn_start_failed",
					error: message
				}
			});
			trajectoryRecorder?.recordEvent("session.ended", {
				status: "error",
				threadId: resourceState.thread.threadId,
				timedOut: state.timeout !== void 0,
				aborted: runAbortController.signal.aborted,
				promptError: message
			});
			markTrajectoryEndRecorded();
			runAgentHarnessLlmOutputHook({
				event: {
					runId: params.runId,
					sessionId: params.sessionId,
					provider: usesSupervisionConnection ? resourceState.thread.modelProvider ?? effectiveRuntimeProviderId : params.provider,
					model: usesSupervisionConnection ? resourceState.thread.model ?? effectiveRuntimeModelId : params.modelId,
					...hookContextWindowFields,
					resolvedRef: usesSupervisionConnection ? `${resourceState.thread.modelProvider ?? effectiveRuntimeProviderId}/${resourceState.thread.model ?? effectiveRuntimeModelId}` : params.runtimePlan?.observability.resolvedRef ?? `${params.provider}/${params.modelId}`,
					...!usesSupervisionConnection && params.runtimePlan?.observability.harnessId ? { harnessId: params.runtimePlan.observability.harnessId } : {},
					assistantTexts: []
				},
				ctx: hookContext,
				hookRunner
			});
			const failureKind = classifyCodexModelCallFailureKind({
				error: turnStartError,
				timedOut: state.timeout !== void 0,
				runAborted: runAbortController.signal.aborted,
				abortReason: runAbortController.signal.reason,
				clientClosedAbort: state.clientClosedAbort,
				formatError: formatErrorMessage
			});
			codexModelCallDiagnostics.emitError(message, failureKind ? { failureKind } : {});
			const messagesSnapshot = [...historyState.messages, buildCodexUserPromptMessage({
				...runtimeParams,
				prompt: turnState.codexTurnPromptText
			})];
			await runCodexAgentEndHook(params, {
				event: {
					messages: messagesSnapshot,
					success: false,
					error: message,
					durationMs: Date.now() - attemptStartedAt
				},
				ctx: hookContext,
				hookRunner
			});
			if ((isIncognitoSessionKey(params.sessionKey) ? await bindingStore.mutate(bindingIdentity, {
				kind: "clear",
				threadId: resourceState.thread.threadId
			}) : true) && !resourceState.startupClientUnsafe) {
				if (!await unsubscribeCodexThreadBestEffort(resourceState.client, {
					threadId: resourceState.thread.threadId,
					timeoutMs: 5e3
				})) await runAgentCleanupStep({
					runId: params.runId,
					sessionId: params.sessionId,
					step: "codex-retire-unsafe-startup-client",
					log: embeddedAgentLog,
					cleanup: async () => closeCodexStartupClientBestEffort(resourceState.client)
				});
			}
			releaseCurrentRoute();
			activateNativePreToolUseFailureFallback();
			resourceState.nativeHookRelay?.unregister();
			await releaseSandboxExecEnvironment();
			await runAgentCleanupStep({
				runId: params.runId,
				sessionId: params.sessionId,
				step: "codex-trajectory-flush-startup-failure",
				log: embeddedAgentLog,
				cleanup: async () => trajectoryRecorder?.flush()
			});
			params.abortSignal?.removeEventListener("abort", abortFromUpstream);
			await releaseSharedClientLeaseAndRetireOneShotClient();
			if (usageLimitError) {
				await markCodexAuthProfileBlockedFromRateLimits({
					params,
					authProfileId: startupAuthProfileId,
					rateLimits: usageLimitError.rateLimitsForProfile
				});
				return { result: buildCodexTurnStartFailureResult({
					params,
					message: usageLimitError.message,
					promptError: createCodexUsageLimitPromptError(usageLimitError.message),
					messagesSnapshot,
					systemPromptReport
				}) };
			}
			if (isCodexContextRestartSelectionChangedError(turnStartError)) return { result: {
				...buildCodexTurnStartFailureResult({
					params,
					message,
					messagesSnapshot,
					systemPromptReport
				}),
				codexAppServerFailure: {
					kind: "client_closed_before_turn_completed",
					transport: appServer.start.transport,
					threadId: resourceState.thread.threadId,
					replaySafe: true
				}
			} };
			throw turnStartError;
		}
	}
	if (!turn) {
		activateNativePreToolUseFailureFallback();
		await releaseSharedClientLeaseAndRetireOneShotClient();
		throw new Error("codex app-server turn/start failed without an error");
	}
	const authoritySourceRef = context.attemptTools.scheduledAppAuthoritySourceRef;
	if (resourceState.thread.pluginAppPolicyContext) authoritySourceRef.current = {
		client: resourceState.client,
		threadId: resourceState.thread.threadId,
		policyContext: resourceState.thread.pluginAppPolicyContext,
		configCwd: connection.effectiveCwd
	};
	turnIdRef.current = turn.turn.id;
	resourceState.nativeSubagentMonitor?.bindTurn(turn.turn.id);
	return { turn };
}
//#endregion
//#region extensions/codex/src/app-server/attempt-deadlines.ts
function createCodexAttemptDeadlineController(params) {
	let deadline = { kind: "closed" };
	let timer;
	const armDeadline = (next) => {
		clearTimeout(timer);
		deadline = next;
		const deadlineAtMs = next.startedAtMs + next.timeoutMs;
		params.onDeadlineChanged?.({
			kind: "bounded",
			deadlineAtMs
		});
		timer = setTimeout(() => {
			if (deadline !== next || params.signal.aborted) return;
			deadline = { kind: "closed" };
			params.onTimeout({
				kind: next.kind,
				elapsedMs: Math.max(0, Date.now() - next.startedAtMs),
				timeoutMs: next.timeoutMs
			});
		}, resolveTimerTimeoutMs(Math.max(1, deadlineAtMs - Date.now()), 1));
		timer.unref?.();
	};
	const dispose = () => {
		deadline = { kind: "closed" };
		clearTimeout(timer);
		params.signal.removeEventListener("abort", dispose);
	};
	if (!params.signal.aborted) {
		params.signal.addEventListener("abort", dispose, { once: true });
		if (params.timeoutMs >= MAX_TIMER_TIMEOUT_MS) {
			deadline = { kind: "unlimited" };
			params.onDeadlineChanged?.({ kind: "unlimited" });
		} else armDeadline({
			kind: "execution",
			startedAtMs: params.startedAtMs,
			timeoutMs: params.timeoutMs
		});
	}
	return {
		ownsExecutionWait: () => deadline.kind === "unlimited" || deadline.kind === "execution" && Date.now() < deadline.startedAtMs + deadline.timeoutMs,
		beginSettlement: (startedAtMs) => {
			if (deadline.kind === "closed" || deadline.kind === "settlement") return;
			armDeadline({
				kind: "settlement",
				startedAtMs,
				timeoutMs: TURN_TERMINAL_SETTLEMENT_TIMEOUT_MS
			});
		},
		dispose
	};
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt-turn-state.ts
const CODEX_NATIVE_HOOK_RELAY_RENEW_INTERVAL_MS = 6e4;
function createCodexAttemptTurnState(resources) {
	const { prompt, state: resourceState, projectorRef, trajectoryRecorder, startupTimeoutMs } = resources;
	const { connection } = prompt.context.runtime;
	const { params, options, runAbortController } = connection;
	const state = {
		latestStartupErrorNotification: void 0,
		rateLimitsRevisionBeforeLastTurnStart: void 0,
		completed: false,
		abortCleanup: Promise.resolve(),
		permissionChangeRestart: void 0,
		localCompletionRequested: false,
		terminalTurnNotificationQueued: false,
		sawCodexInterruptMarker: false,
		timeout: void 0,
		clientClosedPromptError: void 0,
		clientClosedDiagnostic: void 0,
		clientClosedAbort: false,
		shouldDelayNativeHookRelayUnregister: false,
		lifecycleStarted: false,
		lifecycleTerminalEmitted: false,
		nativeHookRelayLastRenewedAt: 0,
		activeAppServerTurnRequests: 0,
		activeLocalProjections: 0,
		projectionClosed: false,
		pendingTerminalDynamicToolRelease: void 0,
		terminalDynamicToolReleaseCheckScheduled: false,
		currentTurnHadNonTerminalDynamicToolResult: false
	};
	const { promise: completion, resolve: resolveCompletion } = createDeferred();
	const pendingOpenClawDynamicToolCompletionIds = /* @__PURE__ */ new Set();
	const openClawDynamicToolExecutions = createCodexDynamicToolExecutionRegistry();
	const activeTurnItemIds = /* @__PURE__ */ new Set();
	const turnIdRef = {};
	const userInputBridgeRef = {};
	const steeringQueueRef = {};
	const completeTurn = () => {
		if (state.completed) return;
		state.completed = true;
		steeringQueueRef.current?.cancel();
		deadlines.beginSettlement(Date.now());
		resolveCompletion();
	};
	const interruptTurn = async (turnId, completionOptions) => {
		if (completionOptions?.locallyCompleted) state.localCompletionRequested = true;
		const completed = await interruptCodexTurnAndWaitBestEffort(resourceState.client, {
			threadId: resourceState.thread.threadId,
			turnId,
			timeoutMs: completionOptions?.timeoutMs
		});
		if (!completed) await closeCodexStartupClientBestEffort(resourceState.client);
		return completed;
	};
	const renewNativeHookRelayForTurnProgress = () => {
		if (!resourceState.nativeHookRelay || options.nativeHookRelay?.ttlMs !== void 0) return;
		const now = Date.now();
		const renewsRecently = now - state.nativeHookRelayLastRenewedAt < CODEX_NATIVE_HOOK_RELAY_RENEW_INTERVAL_MS;
		const expiresSoon = now >= resourceState.nativeHookRelay.expiresAtMs - CODEX_NATIVE_HOOK_RELAY_TTL_GRACE_MS;
		if (renewsRecently && !expiresSoon) return;
		state.nativeHookRelayLastRenewedAt = now;
		resourceState.nativeHookRelay.renew(resolveCodexNativeHookRelayTtlMs({
			explicitTtlMs: void 0,
			attemptTimeoutMs: params.timeoutMs,
			startupTimeoutMs,
			turnStartTimeoutMs: params.timeoutMs
		}));
	};
	const noteProgress = (reason) => {
		if (state.completed || state.projectionClosed || runAbortController.signal.aborted) return;
		renewNativeHookRelayForTurnProgress();
		params.onRunProgress?.({
			reason,
			provider: params.provider,
			model: params.modelId,
			backend: "codex-app-server"
		});
		emitTrustedDiagnosticEvent({
			type: "run.progress",
			runId: params.runId,
			sessionId: params.sessionId,
			sessionKey: params.sessionKey,
			reason: `codex_app_server:${reason}`
		});
	};
	const deadlines = createCodexAttemptDeadlineController({
		startedAtMs: connection.attemptStartedAt,
		timeoutMs: params.timeoutMs,
		signal: runAbortController.signal,
		onDeadlineChanged: params.onAttemptDeadlineChanged,
		onTimeout: (timeout) => {
			state.timeout = timeout;
			projectorRef.current?.markTimedOut();
			const error = /* @__PURE__ */ new Error(timeout.kind === "execution" ? "codex app-server execution budget timed out" : "codex app-server terminal settlement timed out");
			const fields = {
				threadId: resourceState.thread.threadId,
				turnId: turnIdRef.current,
				...timeout
			};
			trajectoryRecorder?.recordEvent(`turn.${timeout.kind}_timeout`, fields);
			embeddedAgentLog.warn(error.message, fields);
			params.onAttemptTimeout?.(error);
			runAbortController.abort(error);
		}
	});
	return {
		state,
		completion,
		pendingOpenClawDynamicToolCompletionIds,
		openClawDynamicToolExecutions,
		activeTurnItemIds,
		turnIdRef,
		userInputBridgeRef,
		steeringQueueRef,
		completeTurn,
		interruptTurn,
		renewNativeHookRelayForTurnProgress,
		noteProgress,
		deadlines
	};
}
//#endregion
//#region extensions/codex/src/app-server/run-attempt.ts
async function runCodexAppServerAttempt(params, options) {
	const connection = await prepareCodexAttemptConnection({
		params,
		options
	});
	const runtime = await prepareCodexAttemptRuntime(connection);
	const attemptTools = await prepareCodexAttemptTools(runtime);
	const resources = prepareCodexAttemptResources(await prepareCodexAttemptPrompt(await prepareCodexAttemptContext(runtime, attemptTools)));
	attemptTools.runtimeYieldCompletionClaim.current = () => resources.state.nativeHookRelay?.hasClaimedDirectChild() ?? false;
	await startCodexAttemptRuntime(resources);
	const turnRuntime = createCodexAttemptTurnState(resources);
	try {
		const lifecycle = createCodexAttemptLifecycleController(resources, turnRuntime);
		const notifications = createCodexAttemptNotificationController(resources, turnRuntime, lifecycle);
		const { ensureCurrentThreadRoute } = await prepareCodexAttemptRoute(resources, turnRuntime, notifications, createCodexAttemptServerRequestController(resources, turnRuntime, lifecycle).handleServerRequest);
		const turnRequest = await prepareCodexAttemptTurnRequest(resources, turnRuntime, ensureCurrentThreadRoute, notifications.waitForActiveNativeTurnCompletion);
		const turnStart = await startCodexAttemptTurn(resources, turnRuntime, notifications, turnRequest);
		if ("result" in turnStart) return turnStart.result;
		const activeTurn = activateCodexAttemptTurn(resources, turnRuntime, lifecycle, notifications, turnStart.turn);
		let finalizedResult;
		try {
			await activeTurn.ready;
			finalizedResult = await finalizeCodexAttempt(resources, turnRuntime, lifecycle, notifications, turnRequest, activeTurn);
		} finally {
			await cleanupCodexAttempt(resources, turnRuntime, lifecycle, turnRequest, activeTurn);
		}
		if (resources.state.executionDisconnectError && !connection.terminalState.explicitCancellationObserved) throw resources.state.executionDisconnectError;
		return finalizedResult;
	} finally {
		turnRuntime.deadlines.dispose();
	}
}
//#endregion
export { runCodexAppServerAttempt };
