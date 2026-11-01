import { l as asNonNegativeFiniteNumber, n as MAX_TIMER_TIMEOUT_MS, u as asPositiveFiniteNumber } from "./number-coercion-CLj0HTDM.js";
import { _ as resolvePrimaryStringValue, l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { t as createLazyImportLoader } from "./lazy-promise-DGqyc4Y4.js";
import { t as isFastTestRuntimeEnv } from "./test-runtime-env-DQDRzsLt.js";
import "./env-UY9MQ9LW.js";
import "./utils-D3A1hGii.js";
import { C as createChildDiagnosticTraceContext, D as freezeDiagnosticTraceContext, f as isDiagnosticsEnabled, o as emitTrustedDiagnosticEvent } from "./diagnostic-events-D_BPObBj.js";
import { i as isSilentReplyPayloadText, n as SILENT_REPLY_TOKEN } from "./tokens-DbeAFqg7.js";
import { c as resolveAgentConfig, m as resolveAgentWorkspaceDir, u as resolveAgentDir, w as tryResolveAmbientOwnerAgentId } from "./agent-scope-config-CUiGBd59.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { O as parseAgentSessionKey, w as isCronSessionKey } from "./session-key-CRjxKW0X.js";
import { S as selectApplicableRuntimeConfig, a as getRuntimeConfigSnapshot, c as getRuntimeConfigSourceSnapshot } from "./runtime-snapshot-BVoUH4MI.js";
import { _ as resolveHooksGmailModel, g as resolveConfiguredModelRef, h as resolveConfiguredModelPolicyAllow, s as getModelRefStatus, x as findModelInCatalog } from "./model-selection-shared-BUMiYTyL.js";
import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-CdX9UGcX.js";
import { t as splitTrailingAuthProfile } from "./model-ref-profile-BIKs-96s.js";
import { a as resolveAgentModelPrimaryValue } from "./model-input-BuGMCNOz.js";
import { x as resolveSubagentModelConfigSelectionResult } from "./agent-scope-CSlN0kZb.js";
import { s as normalizeThinkLevel } from "./thinking.shared-bHYuuc1L.js";
import "./config-Cv60gBux.js";
import { i as logWarn } from "./logger-dgyRJ-bX.js";
import { c as getAgentEventLifecycleGeneration, t as assertAgentRunLifecycleGenerationCurrent, v as withAgentRunLifecycleGeneration } from "./agent-events-Con5xUCM.js";
import { c as getAgentRunContext, o as consumeCronNextCheckProposal, r as claimAgentRunContext, v as releaseAgentRunContext } from "./agent-run-registry-D84MDeZl.js";
import { l as retireSessionMcpRuntime } from "./agent-bundle-mcp-manager-api-Bk_6h3Rj.js";
import { n as withPluginRuntimeGenerationScope } from "./generation-scope-CcvBHxkU.js";
import { t as hasAnyAuthProfileStoreSource } from "./source-check-dXMlw_Sl.js";
import { n as publishedModelCatalogOwnerMatchesAgent } from "./prepared-model-catalog-owner-Ca2Si6qe.js";
import { a as hasNonzeroUsage, i as hasBillableUsage, r as deriveSessionTotalTokens, t as deriveContextPromptTokens } from "./usage-CtmV8Xxq.js";
import { n as beginSessionWorkAdmission } from "./session-lifecycle-admission-siUq03Jk.js";
import { a as isAgentHarnessSessionKey, n as AGENT_HARNESS_SESSION_ID_LOCKED_MESSAGE, r as AGENT_HARNESS_SESSION_KEY_RESERVED_MESSAGE } from "./agent-harness-session-key-CLRQddqz.js";
import { n as isThinkingLevelSupported, o as resolveSupportedThinkingLevel } from "./thinking-DxxV8Ztb.js";
import { i as resolveSessionRuntimeOverrideForProvider } from "./session-runtime-compat-BmHRQBtd.js";
import { i as normalizeThinkingCatalogProviders, n as hasResolvedThinkingCatalogEntry, o as resolveEffectiveAgentRuntime } from "./thinking-runtime-CMnVn0Uq.js";
import { p as ensureAgentWorkspace } from "./workspace-BFk42BX6.js";
import { t as PreparedModelRuntimeOwnerNotPublishedError } from "./prepared-model-runtime.errors-DeG6Ut3_.js";
import { t as resolveAllowedModelRefCore } from "./model-selection-resolve-C6fFERVD.js";
import { m as preparedModelRuntimeConfigsMatch, s as loadPublishedGatewayReplyDispatchRuntime, t as acquireAgentRunPreparedModelRuntime } from "./prepared-model-runtime-C1N_aVhw.js";
import { i as withPreparedModelRuntimePluginGenerationScope } from "./prepared-model-runtime-generation-scope-o4umnoSw.js";
import { c as loadProviderScopedThinkingCatalog, d as loadResolvedPublishedModelCatalogOwner } from "./prepared-model-catalog-BSfJgEXd.js";
import { n as mapHookExternalContentSource, r as resolveHookExternalContentSource, t as isExternalHookSession } from "./external-content-source-DI01uOKv.js";
import { n as resolveThinkingDefault, t as resolveConfiguredThinkingDefault } from "./model-thinking-default-DOCrUkf0.js";
import { c as createAgentRunRestartAbortError, h as resolveAgentRunErrorLifecycleFields } from "./run-termination-Ts9RsbeN.js";
import { n as extractTextFromChatContent } from "./chat-content-DNdfeXZh.js";
import { n as resolveAgentTimeoutMs } from "./timeout-Dm7mxETK.js";
import { s as resolveCronScheduledToolPolicy } from "./scheduled-tool-policy-WcH3cpLk.js";
import { n as isDetachedCronSessionTarget } from "./session-target-DJsUULzX.js";
import { l as isCommandLaneTaskTimeoutError } from "./command-queue-oRD7ZANz.js";
import "./sessions-eI69vxPt.js";
import { f as resolveSessionWorkStartError } from "./lifecycle-CKz-1QIz.js";
import { n as resolveTrustedSessionContextTokens, t as resolveProjectedSessionContextTokens } from "./context-token-provenance-CAdnGN1p.js";
import { t as createDiagnosticMessageLifecycle } from "./message-lifecycle-CbLL539K.js";
import "./agent-bundle-mcp-tools-B8DYsLEh.js";
import { a as resolveCreatorSandbox } from "./operator-role-policy-B_VzZMic.js";
import { T as projectChatDisplayMessages, o as readSessionMessagesAsync } from "./session-transcript-readers-Bry9KBsD.js";
import { c as resolveAuthoredModelContextTokens } from "./context-resolution-D7NN8z52.js";
import { t as resolveCronAgentSessionKey } from "./session-key-U_mu0r_L.js";
import { t as hasAcceptedSessionSpawn } from "./accepted-session-spawn-CUc_zZp_.js";
import { c as hasCommittedMessagingToolDeliveryEvidence } from "./delivery-evidence-BDLYyuib.js";
import { n as resolveCronStyleNow } from "./current-time-Cwxy-JQb.js";
import { i as normalizeCronRunErrorText, o as resolveCronAbortReasonText } from "./execution-errors-CdfjHusX.js";
import { t as removeCronRunContinuationSessionIfIdle } from "./cron-run-continuation-cleanup-VkuZ48hg.js";
import { n as resolveSourceDeliveryOutcome } from "./source-delivery-plan-DMpUap-H.js";
import { r as hasIntentionalTerminalCompletion } from "./result-fallback-classifier-Up3vvvkk.js";
import { n as isEmbeddedRunTerminalToolFailure, t as CODE_MODE_MCP_CATALOG_MISS_MESSAGE } from "./terminal-tool-failure-BkE784wQ.js";
import { t as cleanupBrowserSessionsForLifecycleEnd } from "./browser-lifecycle-cleanup-DF03MTfE.js";
import { i as mergeCronRunDiagnostics, n as createCronRunDiagnosticsFromError, t as createCronRunDiagnosticsFromAgentResult } from "./run-diagnostics-fB-3R961.js";
import { n as resolveCronJobEffectiveAgentId } from "./agent-id-KnPjqPdM.js";
import { n as resolveCronSession, t as loadCronSessionEntryLatest } from "./session-D4AJhdUK.js";
import { t as createAgentLifecycleTerminalBackstop } from "./agent-lifecycle-terminal-BKyQ-iM8.js";
import { t as classifyCronAgentTurnShellPrompt } from "./agent-turn-command-prompt-D-Ndr_7a.js";
import { c as loadCronDeliveryRuntime, l as resolveCronDeliveryContext, n as resolveCronPreflight, o as buildCronDeliveryTrace, s as createCronToolsAllowPreflightDiagnostics, u as resolveCronChannelOutputPolicy } from "./run-fallback-policy-C9PQPquK.js";
import { a as markCronSessionPreRun, c as resolveCronLifecycleRevisionIdentity, i as createPersistCronSessionEntry, l as setCronSessionAgentHarnessId, m as resolveCronPayloadOutcome, n as adoptCronRunSessionMetadata, o as persistCronSkillsSnapshotIfChanged, r as createCronRunContinuationSession, s as projectCronOwnershipFields, t as CronSessionLifecycleClaimError, u as setCronSessionRuntimeModel } from "./run-session-state-CZMoAMOg.js";
import { t as cleanupCronRunSessionAfterRun } from "./session-cleanup-C_Zwwuwo.js";
import { isDeepStrictEqual } from "node:util";
//#region src/cron/isolated-agent/run-finalize.ts
/** Final persistence, telemetry, and delivery for an isolated cron run. */
const cronContextRuntimeLoader = createLazyImportLoader(() => import("./run-context.runtime.js"));
async function finalizeCronRun(params) {
	const { prepared, execution } = params;
	const finalRunResult = execution.runResult;
	const payloads = finalRunResult.payloads ?? [];
	const cleanupRunSession = async (reason) => {
		await cleanupCronRunSessionAfterRun({
			job: prepared.input.job,
			agentSessionKey: prepared.agentSessionKey,
			sessionId: prepared.currentRunSessionId(),
			lifecycleRevision: prepared.cronSession.lifecycleRevision,
			sessionUpdatedAt: prepared.cronSession.sessionEntry.updatedAt,
			beforeDelete: params.beforeSessionDelete,
			reason
		});
		params.markCronRunSessionCleanupHandled();
	};
	if (!params.isAborted()) {
		if (finalRunResult.meta?.systemPromptReport) prepared.cronSession.sessionEntry.systemPromptReport = finalRunResult.meta.systemPromptReport;
		if (finalRunResult.meta?.executionTrace?.runner !== "cli") adoptCronRunSessionMetadata({
			entry: prepared.cronSession.sessionEntry,
			sessionKey: prepared.agentSessionKey,
			runMeta: finalRunResult.meta?.agentMeta
		});
	}
	const usage = finalRunResult.meta?.agentMeta?.usage;
	const diagnosticUsage = finalRunResult.meta?.agentMeta?.diagnosticUsage ?? usage;
	const lastCallUsage = finalRunResult.meta?.agentMeta?.lastCallUsage;
	const promptTokens = finalRunResult.meta?.agentMeta?.promptTokens;
	const modelUsed = finalRunResult.meta?.agentMeta?.model ?? execution.fallbackModel ?? execution.liveSelection.model;
	const providerUsed = finalRunResult.meta?.agentMeta?.provider ?? execution.fallbackProvider ?? execution.liveSelection.provider;
	const runtimeContextTokens = asPositiveFiniteNumber(finalRunResult.meta?.agentMeta?.contextTokens);
	const modelContextTokens = (await cronContextRuntimeLoader.load()).resolveContextTokensForModel({
		cfg: prepared.cfgWithAgentDefaults,
		provider: providerUsed,
		model: modelUsed,
		allowAsyncLoad: false
	});
	const agentHarnessId = normalizeOptionalString(finalRunResult.meta?.agentMeta?.agentHarnessId);
	const authoredContextTokens = resolveAuthoredModelContextTokens({
		cfg: prepared.cfgWithAgentDefaults,
		provider: providerUsed,
		model: modelUsed
	});
	const retainedRuntimeContextTokens = resolveTrustedSessionContextTokens({
		entry: prepared.cronSession.sessionEntry,
		provider: providerUsed,
		model: modelUsed,
		agentHarnessId
	});
	const projectedContextTokens = resolveProjectedSessionContextTokens({
		entry: prepared.cronSession.sessionEntry,
		provider: providerUsed,
		model: modelUsed,
		agentHarnessId,
		resolvedContextTokens: modelContextTokens,
		authoredContextTokens
	});
	const contextTokens = runtimeContextTokens ?? projectedContextTokens ?? 2e5;
	const projectedUsesPersistedContext = retainedRuntimeContextTokens !== void 0 && (prepared.cronSession.sessionEntry.modelSelectionLocked === true || authoredContextTokens === void 0 && projectedContextTokens === retainedRuntimeContextTokens);
	const contextTokensSource = runtimeContextTokens !== void 0 ? finalRunResult.meta?.agentMeta?.contextTokensSource ?? "resolved" : projectedUsesPersistedContext ? prepared.cronSession.sessionEntry.contextTokensSource : "resolved";
	if (!params.isAborted()) {
		setCronSessionRuntimeModel({
			entry: prepared.cronSession.sessionEntry,
			provider: providerUsed,
			model: modelUsed
		});
		setCronSessionAgentHarnessId({
			entry: prepared.cronSession.sessionEntry,
			agentHarnessId
		});
		prepared.cronSession.sessionEntry.contextTokens = contextTokens;
		prepared.cronSession.sessionEntry.contextTokensSource = contextTokensSource;
	}
	let telemetry = {
		model: modelUsed,
		provider: providerUsed
	};
	if (hasNonzeroUsage(usage)) {
		const input = usage.input ?? 0;
		const output = usage.output ?? 0;
		const cacheRead = usage.cacheRead ?? 0;
		const cacheWrite = usage.cacheWrite ?? 0;
		const lastCallTotalTokens = deriveSessionTotalTokens({
			usage: lastCallUsage,
			contextTokens,
			promptTokens
		});
		const totalTokens = typeof lastCallTotalTokens === "number" && lastCallTotalTokens > 0 ? lastCallTotalTokens : void 0;
		prepared.cronSession.sessionEntry.inputTokens = input;
		prepared.cronSession.sessionEntry.outputTokens = output;
		const bucketTotalTokens = input + output + cacheRead + cacheWrite;
		const aggregateTotalTokens = typeof usage.total === "number" && Number.isFinite(usage.total) ? Math.max(bucketTotalTokens, usage.total) : bucketTotalTokens;
		const telemetryUsage = {
			input_tokens: input,
			output_tokens: output,
			...aggregateTotalTokens > 0 ? { total_tokens: aggregateTotalTokens } : {},
			...cacheRead > 0 ? { cache_read_tokens: cacheRead } : {},
			...cacheWrite > 0 ? { cache_write_tokens: cacheWrite } : {}
		};
		if (typeof totalTokens === "number" && Number.isFinite(totalTokens) && totalTokens > 0) {
			prepared.cronSession.sessionEntry.totalTokens = totalTokens;
			prepared.cronSession.sessionEntry.totalTokensFresh = true;
			prepared.cronSession.sessionEntry.totalTokensVersion = 1;
		} else {
			prepared.cronSession.sessionEntry.totalTokens = void 0;
			prepared.cronSession.sessionEntry.totalTokensFresh = false;
			prepared.cronSession.sessionEntry.totalTokensVersion = void 0;
		}
		prepared.cronSession.sessionEntry.cacheRead = cacheRead;
		prepared.cronSession.sessionEntry.cacheWrite = cacheWrite;
		telemetry = {
			model: modelUsed,
			provider: providerUsed,
			usage: telemetryUsage
		};
	}
	if (hasBillableUsage(usage) || hasBillableUsage(diagnosticUsage)) {
		const { estimateAggregateUsageCost, resolveModelCostConfig } = await import("./usage-format-Kve_C0mJ.js");
		const costConfig = resolveModelCostConfig({
			provider: providerUsed,
			model: modelUsed,
			config: prepared.cfgWithAgentDefaults
		});
		if (hasBillableUsage(usage)) prepared.cronSession.sessionEntry.estimatedCostUsd = asNonNegativeFiniteNumber(estimateAggregateUsageCost({
			usage,
			cost: costConfig
		}));
		if (isDiagnosticsEnabled(prepared.cfgWithAgentDefaults) && hasBillableUsage(diagnosticUsage)) {
			const diagnosticInput = diagnosticUsage?.input ?? 0;
			const diagnosticOutput = diagnosticUsage?.output ?? 0;
			const diagnosticCacheRead = diagnosticUsage?.cacheRead ?? 0;
			const diagnosticCacheWrite = diagnosticUsage?.cacheWrite ?? 0;
			const usagePromptTokens = diagnosticInput + diagnosticCacheRead + diagnosticCacheWrite;
			const diagnosticBucketTotalTokens = usagePromptTokens + diagnosticOutput;
			const diagnosticTotalTokens = typeof diagnosticUsage?.total === "number" && Number.isFinite(diagnosticUsage.total) ? Math.max(diagnosticBucketTotalTokens, diagnosticUsage.total) : diagnosticBucketTotalTokens;
			const diagnosticEstimatedCostUsd = asNonNegativeFiniteNumber(estimateAggregateUsageCost({
				usage: diagnosticUsage,
				cost: costConfig
			}));
			const contextUsedTokens = deriveContextPromptTokens({
				lastCallUsage,
				promptTokens,
				usage
			});
			emitTrustedDiagnosticEvent({
				type: "model.usage",
				...finalRunResult.diagnosticTrace ? { trace: freezeDiagnosticTraceContext(createChildDiagnosticTraceContext(finalRunResult.diagnosticTrace)) } : {},
				sessionKey: prepared.runSessionKey,
				sessionId: prepared.currentRunSessionId(),
				channel: "cron",
				agentId: prepared.agentId,
				provider: providerUsed,
				model: modelUsed,
				usage: {
					input: diagnosticInput,
					output: diagnosticOutput,
					cacheRead: diagnosticCacheRead,
					cacheWrite: diagnosticCacheWrite,
					promptTokens: usagePromptTokens,
					total: diagnosticTotalTokens
				},
				lastCallUsage,
				context: {
					limit: contextTokens,
					...contextUsedTokens !== void 0 ? { used: contextUsedTokens } : {}
				},
				...diagnosticEstimatedCostUsd !== void 0 ? { costUsd: diagnosticEstimatedCostUsd } : {},
				durationMs: execution.runEndedAt - execution.runStartedAt
			});
		}
	}
	await prepared.persistSessionEntry();
	await prepared.runContinuationSession?.seal({ basePersisted: true });
	if (params.isAborted()) return prepared.withRunSession({
		status: "error",
		error: params.abortReason(),
		diagnostics: mergeCronRunDiagnostics(prepared.preflightDiagnostics, createCronRunDiagnosticsFromAgentResult(finalRunResult, { finalStatus: "error" }), createCronRunDiagnosticsFromError("cron-setup", params.abortReason())),
		...telemetry
	});
	const cronPayloadOutcome = resolveCronPayloadOutcome({
		payloads,
		runLevelError: finalRunResult.meta?.error,
		failureSignal: finalRunResult.meta?.failureSignal,
		finalAssistantVisibleText: finalRunResult.meta?.finalAssistantVisibleText,
		preferFinalAssistantVisibleText: (await resolveCronChannelOutputPolicy(prepared.resolvedDelivery.channel, { deliveryRequested: prepared.deliveryRequested })).preferFinalAssistantVisibleText
	});
	if (finalRunResult.meta?.aborted === true && !cronPayloadOutcome.hasFatalErrorPayload) {
		const error = normalizeOptionalString(finalRunResult.meta.error?.message) ?? "cron isolated agent run aborted";
		await cleanupRunSession("cron-delete-after-run-aborted");
		return prepared.withRunSession({
			status: "error",
			error,
			diagnostics: mergeCronRunDiagnostics(prepared.preflightDiagnostics, createCronRunDiagnosticsFromAgentResult(finalRunResult, { finalStatus: "error" }), createCronRunDiagnosticsFromError("agent-run", error)),
			...telemetry
		});
	}
	const { deliveryDisposition, deliveryPayloadHasStructuredContent, hasFatalStructuredErrorPayload, pendingPresentationWarningError } = cronPayloadOutcome;
	let { synthesizedText, deliveryPayloads, summary, outputText, hasFatalErrorPayload, embeddedRunError } = cronPayloadOutcome;
	const terminalToolFailure = finalRunResult.meta?.terminalToolFailure;
	const hasTerminalToolFailure = isEmbeddedRunTerminalToolFailure(terminalToolFailure);
	if (hasFatalErrorPayload && hasTerminalToolFailure) summary = CODE_MODE_MCP_CATALOG_MISS_MESSAGE;
	const agentDiagnostics = createCronRunDiagnosticsFromAgentResult(finalRunResult, { finalStatus: hasFatalErrorPayload ? "error" : "ok" });
	const runDiagnostics = mergeCronRunDiagnostics(prepared.preflightDiagnostics, agentDiagnostics);
	const resolveRunOutcome = (result) => prepared.withRunSession({
		status: hasFatalErrorPayload ? "error" : "ok",
		...hasFatalErrorPayload ? { error: embeddedRunError ?? "cron isolated run returned an error payload" } : {},
		summary,
		outputText,
		deliveryState: result?.deliveryState,
		delivered: result?.delivered,
		deliveryAttempted: result?.deliveryAttempted,
		deliveryError: result?.deliveryError,
		deliverySuppressionReason: result?.deliverySuppressionReason,
		delivery: result?.delivery,
		diagnostics: mergeCronRunDiagnostics(runDiagnostics, hasFatalErrorPayload && !hasTerminalToolFailure ? createCronRunDiagnosticsFromError("agent-run", embeddedRunError ?? "cron isolated run returned an error payload") : void 0, result?.deliveryError ? createCronRunDiagnosticsFromError("delivery", result.deliveryError) : void 0),
		...telemetry
	});
	const failPendingPresentationWarningUnlessDelivered = (delivered) => {
		if (pendingPresentationWarningError && delivered !== true) {
			hasFatalErrorPayload = true;
			embeddedRunError = pendingPresentationWarningError;
		}
	};
	const acceptedSessionSpawn = hasAcceptedSessionSpawn(finalRunResult.acceptedSessionSpawns);
	const heartbeatOnlyResponse = prepared.deliveryRequested && !hasFatalErrorPayload && deliveryDisposition.kind !== "visible";
	const heartbeatControlOnlyResponse = heartbeatOnlyResponse && (deliveryDisposition.kind === "empty" || deliveryDisposition.kind === "heartbeat" && deliveryDisposition.controlOnly);
	const spawnOnlyHandoff = acceptedSessionSpawn && (heartbeatControlOnlyResponse || deliveryPayloads.length === 0 && normalizeOptionalString(synthesizedText) === void 0);
	if (spawnOnlyHandoff && heartbeatControlOnlyResponse) {
		deliveryPayloads = [];
		synthesizedText = void 0;
		summary = void 0;
		outputText = void 0;
	}
	const skipHeartbeatDelivery = heartbeatOnlyResponse && !spawnOnlyHandoff;
	const sourceDeliveryOutcome = resolveSourceDeliveryOutcome(prepared.sourceDelivery, {
		didSendViaMessageTool: finalRunResult.didSendViaMessagingTool,
		messageToolSentTargets: finalRunResult.messagingToolSentTargets
	});
	let queueSourceSessionMessageToolAwareness;
	if (sourceDeliveryOutcome.visibleDeliveries.length > 0) {
		const { queueCronMessageToolDeliveryAwareness } = await loadCronDeliveryRuntime();
		queueSourceSessionMessageToolAwareness = await queueCronMessageToolDeliveryAwareness({
			cfg: prepared.cfgWithAgentDefaults,
			runSessionKey: prepared.runSessionKey,
			job: prepared.input.job,
			agentId: prepared.agentId,
			agentSessionKey: prepared.agentSessionKey,
			deferredTargetSessionKey: prepared.input.job.sessionTarget === "current" ? prepared.sourceSessionKey : void 0,
			runStartedAt: execution.runStartedAt,
			resolvedDelivery: prepared.resolvedDelivery,
			sourceDeliveryOutcome
		});
	}
	const hasCommittedTerminalProgress = hasCommittedMessagingToolDeliveryEvidence(finalRunResult) || finalRunResult.didSendDeterministicApprovalPrompt === true || acceptedSessionSpawn || (finalRunResult.successfulCronAdds ?? 0) > 0;
	const hasIntentionalSilentReply = finalRunResult.meta?.terminalReplyKind === "silent-empty" || isSilentReplyPayloadText(finalRunResult.meta?.finalAssistantRawText) || isSilentReplyPayloadText(finalRunResult.meta?.finalAssistantVisibleText);
	if (prepared.deliveryRequested && !hasFatalErrorPayload && !sourceDeliveryOutcome.satisfiesSourceDelivery && !hasCommittedTerminalProgress && !hasIntentionalSilentReply && !hasIntentionalTerminalCompletion(finalRunResult) && deliveryPayloads.length === 0 && normalizeOptionalString(synthesizedText) === void 0) {
		await queueSourceSessionMessageToolAwareness?.();
		const error = "cron isolated run completed without a final assistant payload";
		return prepared.withRunSession({
			status: "error",
			error,
			summary: error,
			outputText: error,
			delivered: false,
			deliveryAttempted: false,
			diagnostics: mergeCronRunDiagnostics(runDiagnostics, createCronRunDiagnosticsFromError("agent-run", error)),
			...telemetry
		});
	}
	if (hasFatalStructuredErrorPayload && prepared.deliveryRequested) {
		await cleanupRunSession("cron-delete-after-run-fatal-error");
		const deliveryTrace = buildCronDeliveryTrace({
			deliveryPlan: prepared.deliveryPlan,
			resolvedDelivery: prepared.resolvedDelivery,
			sourceDeliveryOutcome,
			fallbackUsed: false,
			delivered: sourceDeliveryOutcome.verifiedMessageToolDelivery
		});
		await queueSourceSessionMessageToolAwareness?.();
		return resolveRunOutcome({
			delivered: sourceDeliveryOutcome.verifiedMessageToolDelivery,
			deliveryAttempted: sourceDeliveryOutcome.verifiedMessageToolDelivery,
			delivery: deliveryTrace
		});
	}
	params.markCronRunSessionCleanupHandled();
	const { dispatchCronDelivery, resolveCronDeliveryBestEffort } = await loadCronDeliveryRuntime();
	const deliveryResult = await dispatchCronDelivery({
		cfg: prepared.input.cfg,
		cfgWithAgentDefaults: prepared.cfgWithAgentDefaults,
		deps: prepared.input.deps,
		job: prepared.input.job,
		agentId: prepared.agentId,
		agentSessionKey: prepared.agentSessionKey,
		sourceSessionKey: prepared.sourceSessionKey,
		sourceSessionGeneration: prepared.sourceSessionGeneration,
		runSessionKey: prepared.runSessionKey,
		sessionId: prepared.currentRunSessionId(),
		lifecycleRevision: prepared.cronSession.lifecycleRevision,
		sessionUpdatedAt: prepared.cronSession.sessionEntry.updatedAt,
		beforeSessionDelete: params.beforeSessionDelete,
		runStartedAt: execution.runStartedAt,
		runEndedAt: execution.runEndedAt,
		timeoutMs: prepared.timeoutMs,
		resolvedDelivery: prepared.resolvedDelivery,
		deliveryRequested: prepared.deliveryRequested,
		undeliveredRunStatus: hasFatalErrorPayload || pendingPresentationWarningError ? "error" : "ok",
		skipDelivery: skipHeartbeatDelivery ? hasIntentionalSilentReply ? "silent" : deliveryDisposition.kind : void 0,
		spawnOnlyHandoff,
		sourceDeliveryOutcome,
		queueSourceSessionMessageToolAwareness,
		deliveryBestEffort: resolveCronDeliveryBestEffort(prepared.input.job),
		deliveryPayloadHasStructuredContent,
		deliveryPayloads,
		synthesizedText,
		ttsAuto: prepared.cronSession.sessionEntry.ttsAuto,
		summary,
		outputText,
		telemetry,
		abortSignal: prepared.input.abortSignal ?? prepared.input.signal,
		isAborted: params.isAborted,
		abortReason: params.abortReason,
		withRunSession: prepared.withRunSession
	});
	const deliveryTrace = buildCronDeliveryTrace({
		deliveryPlan: prepared.deliveryPlan,
		resolvedDelivery: prepared.resolvedDelivery,
		sourceDeliveryOutcome,
		fallbackUsed: prepared.deliveryRequested && deliveryResult.deliveryAttempted && !sourceDeliveryOutcome.satisfiesSourceDelivery,
		delivered: deliveryResult.delivered
	});
	if (deliveryResult.result) {
		const deliveryError = deliveryResult.result.deliveryError ?? deliveryResult.deliveryError;
		const deliveryDiagnosticError = deliveryError ?? (deliveryResult.result.status === "error" ? deliveryResult.result.error : void 0);
		const resultWithDeliveryMeta = {
			...deliveryResult.result,
			deliveryState: deliveryResult.deliveryState,
			delivered: deliveryResult.result.delivered ?? deliveryResult.delivered,
			deliveryAttempted: deliveryResult.result.deliveryAttempted ?? deliveryResult.deliveryAttempted,
			deliveryError,
			delivery: deliveryTrace,
			diagnostics: mergeCronRunDiagnostics(runDiagnostics, deliveryResult.result.diagnostics, deliveryDiagnosticError ? createCronRunDiagnosticsFromError("delivery", deliveryDiagnosticError) : void 0)
		};
		failPendingPresentationWarningUnlessDelivered(resultWithDeliveryMeta.delivered ?? deliveryResult.delivered);
		if (!hasFatalErrorPayload) return resultWithDeliveryMeta;
		if (deliveryResult.result.status !== "ok") return resultWithDeliveryMeta;
		return resolveRunOutcome({
			deliveryState: deliveryResult.deliveryState,
			delivered: deliveryResult.result.delivered,
			deliveryAttempted: resultWithDeliveryMeta.deliveryAttempted,
			deliverySuppressionReason: resultWithDeliveryMeta.deliverySuppressionReason,
			delivery: deliveryTrace
		});
	}
	summary = deliveryResult.summary;
	outputText = deliveryResult.outputText;
	failPendingPresentationWarningUnlessDelivered(deliveryResult.delivered);
	return resolveRunOutcome({
		deliveryState: deliveryResult.deliveryState,
		delivered: deliveryResult.delivered,
		deliveryAttempted: deliveryResult.deliveryAttempted,
		deliveryError: deliveryResult.deliveryError,
		deliverySuppressionReason: deliveryResult.deliverySuppressionReason,
		delivery: deliveryTrace
	});
}
//#endregion
//#region src/skills/runtime/cron-snapshot.ts
const skillsSnapshotRuntimeLoader = createLazyImportLoader(() => import("./cron-snapshot.runtime.js"));
async function loadSkillsSnapshotRuntime() {
	return await skillsSnapshotRuntimeLoader.load();
}
async function resolveCronSkillsSnapshot(params) {
	if (params.isFastTestEnv) return params.existingSnapshot ?? {
		prompt: "",
		skills: []
	};
	const runtime = await loadSkillsSnapshotRuntime();
	const skillFilter = runtime.resolveEffectiveAgentSkillFilter(params.config, params.agentId);
	const nodeSkills = runtime.resolveNodeExecEligibility({
		cfg: params.config,
		agentId: params.agentId
	});
	return runtime.resolveReusableWorkspaceSkillSnapshot({
		workspaceDir: params.workspaceDir,
		config: params.config,
		agentId: params.agentId,
		existingSnapshot: params.existingSnapshot,
		librarySelections: params.librarySelections,
		skillFilter,
		eligibility: {
			nodeSkills,
			remote: runtime.getRemoteSkillEligibility({ advertiseExecNode: nodeSkills.canExec })
		},
		watch: false,
		hydrateExisting: false
	}).snapshot;
}
//#endregion
//#region src/cron/isolated-agent/run-config.ts
/** Selects the active reloadable config when it descends from the cron caller's snapshot. */
function resolveCronActiveRuntimeConfig(cfg) {
	const runtimeConfig = getRuntimeConfigSnapshot();
	const runtimeSourceConfig = getRuntimeConfigSourceSnapshot();
	if (!runtimeConfig || !runtimeSourceConfig) return cfg;
	return selectApplicableRuntimeConfig({
		inputConfig: cfg,
		runtimeConfig,
		runtimeSourceConfig
	}) ?? cfg;
}
function extractCronAgentDefaultsOverride(agentConfigOverride) {
	const { model: overrideModel, sandbox: _agentSandboxOverride, memory: _agentMemoryOverride, ...agentOverrideRest } = agentConfigOverride ?? {};
	return {
		overrideModel,
		definedOverrides: Object.fromEntries(Object.entries(agentOverrideRest).filter(([, value]) => value !== void 0))
	};
}
function mergeCronAgentModelOverride(params) {
	const nextDefaults = { ...params.defaults };
	const existingModel = nextDefaults.model && typeof nextDefaults.model === "object" ? nextDefaults.model : {};
	if (typeof params.overrideModel === "string") nextDefaults.model = {
		...existingModel,
		primary: params.overrideModel
	};
	else if (params.overrideModel) nextDefaults.model = {
		...existingModel,
		...params.overrideModel
	};
	return nextDefaults;
}
/** Selects the active runtime snapshot before deriving isolated cron agent defaults. */
function resolveCronAgentConfig(params) {
	const runtimeConfig = resolveCronActiveRuntimeConfig(params.config);
	const { overrideModel, definedOverrides } = extractCronAgentDefaultsOverride(params.agentConfigOverride);
	const agentDefaults = mergeCronAgentModelOverride({
		defaults: Object.assign({}, runtimeConfig.agents?.defaults, definedOverrides),
		overrideModel
	});
	return {
		runtimeConfig,
		agentDefaults,
		cfgWithAgentDefaults: {
			...runtimeConfig,
			agents: Object.assign({}, runtimeConfig.agents, { defaults: agentDefaults })
		}
	};
}
//#endregion
//#region src/cron/isolated-agent/model-selection.ts
function formatAllowedModelRefs(params) {
	const configured = resolveConfiguredModelPolicyAllow(params).refs;
	if (configured && configured.length > 0) return configured.toSorted().join(", ");
	return "(none configured)";
}
function formatCronPayloadModelRejection(params) {
	const { modelOverride, error } = params;
	if (error.startsWith("model not allowed:")) {
		const modelRef = error.slice(18).trim();
		return `automation model override '${modelOverride}' rejected by ${resolveConfiguredModelPolicyAllow(params).configPath ?? "agents.defaults.modelPolicy.allow"}: ${modelRef} is not in [${formatAllowedModelRefs(params)}]`;
	}
	return `automation model override '${modelOverride}' rejected: ${error}`;
}
async function resolveCronModelSelectionOwner(params) {
	const owner = await loadResolvedPublishedModelCatalogOwner({
		config: params.cfg,
		...params.agentId ? { agentId: params.agentId } : {},
		...params.agentDir ? { agentDir: params.agentDir } : {},
		...params.workspaceDir ? { workspaceDir: params.workspaceDir } : {},
		readOnly: true,
		allowGatewaySubagentBinding: true
	});
	if (params.requiredAgentId && !publishedModelCatalogOwnerMatchesAgent(owner, params.requiredAgentId)) throw new Error(`cron model catalog owner changed from ${params.requiredAgentId} to ${owner.agentId}`);
	return owner;
}
async function resolveCronThinkingCatalog(params) {
	const catalog = normalizeThinkingCatalogProviders(params.owner.modelCatalog.entries);
	if (hasResolvedThinkingCatalogEntry({
		catalog,
		provider: params.provider,
		model: params.model
	})) return catalog;
	return normalizeThinkingCatalogProviders(await loadProviderScopedThinkingCatalog({
		config: params.owner.config,
		provider: params.provider,
		model: params.model,
		agentId: params.owner.agentId,
		agentDir: params.owner.agentDir,
		workspaceDir: params.owner.workspaceDir
	}));
}
async function resolveCronThinkingSelection(params) {
	const immutableThinkLevel = normalizeThinkLevel(params.jobThinking) ?? normalizeThinkLevel(params.hookThinking) ?? normalizeThinkLevel(params.sessionThinking);
	const requestedThinkLevel = immutableThinkLevel ?? resolveConfiguredThinkingDefault({
		cfg: params.cfg,
		provider: params.provider,
		model: params.model
	});
	return {
		catalog: requestedThinkLevel === "off" ? params.owner.modelCatalog.entries : await resolveCronThinkingCatalog(params),
		immutableThinkLevel,
		loadThinkingCatalog: async (provider, model) => await resolveCronThinkingCatalog({
			owner: params.owner,
			provider,
			model
		}),
		requestedThinkLevel
	};
}
/** Resolves the effective model for an isolated cron run across defaults, agents, hooks, payload, and session state. */
async function resolveCronModelSelection(params) {
	const owner = params.owner ?? await resolveCronModelSelectionOwner({
		cfg: params.cfg,
		...params.agentId ? {
			agentId: params.agentId,
			requiredAgentId: params.agentId,
			agentDir: params.agentDir,
			workspaceDir: params.workspaceDir
		} : {}
	});
	const ownerAgentId = owner.agentId;
	const ownerAgentConfigOverride = params.agentConfigOverride ? owner.config === params.cfg && (!params.agentId || ownerAgentId === params.agentId) ? params.agentConfigOverride : resolveAgentConfig(owner.config, ownerAgentId) : void 0;
	const { cfgWithAgentDefaults } = resolveCronAgentConfig({
		config: owner.config,
		agentConfigOverride: ownerAgentConfigOverride
	});
	const resolvedDefault = resolveConfiguredModelRef({
		cfg: cfgWithAgentDefaults,
		defaultProvider: DEFAULT_PROVIDER,
		defaultModel: DEFAULT_MODEL,
		manifestPlugins: owner.metadataSnapshot
	});
	const selectionParams = {
		cfg: owner.config,
		catalog: owner.modelCatalog.entries,
		defaultProvider: resolvedDefault.provider,
		defaultModel: resolvedDefault.model,
		agentId: ownerAgentId,
		manifestPlugins: owner.metadataSnapshot
	};
	let provider = resolvedDefault.provider;
	let model = resolvedDefault.model;
	let modelSource = "default";
	let configuredProfileId = splitTrailingAuthProfile(resolveAgentModelPrimaryValue(cfgWithAgentDefaults.agents?.defaults?.model) ?? "").profile;
	const subagentModelConfigSelection = resolveSubagentModelConfigSelectionResult({
		cfg: owner.config,
		agentId: ownerAgentId,
		agentConfigOverride: ownerAgentConfigOverride
	});
	const subagentModelRaw = resolvePrimaryStringValue(subagentModelConfigSelection?.raw);
	const subagentModelSource = subagentModelConfigSelection?.source === "agent" ? "agent" : "subagent";
	if (subagentModelRaw) {
		const resolvedSubagent = resolveAllowedModelRefCore({
			...selectionParams,
			raw: subagentModelRaw
		});
		if (!("error" in resolvedSubagent)) {
			provider = resolvedSubagent.ref.provider;
			model = resolvedSubagent.ref.model;
			modelSource = subagentModelSource;
			configuredProfileId = splitTrailingAuthProfile(subagentModelRaw).profile;
		}
	}
	let hooksGmailModelApplied = false;
	const hooksGmailModelRef = params.isGmailHook ? resolveHooksGmailModel({
		cfg: owner.config,
		defaultProvider: DEFAULT_PROVIDER,
		manifestPlugins: owner.metadataSnapshot
	}) : null;
	if (hooksGmailModelRef) {
		if (getModelRefStatus({
			...selectionParams,
			ref: hooksGmailModelRef
		}).allowed) {
			provider = hooksGmailModelRef.provider;
			model = hooksGmailModelRef.model;
			hooksGmailModelApplied = true;
			modelSource = "hook";
			configuredProfileId = splitTrailingAuthProfile(owner.config.hooks?.gmail?.model ?? "").profile;
		}
	}
	const modelOverrideRaw = params.payload.kind === "agentTurn" ? params.payload.model : void 0;
	const modelOverride = typeof modelOverrideRaw === "string" ? modelOverrideRaw.trim() : void 0;
	if (modelOverride !== void 0 && modelOverride.length > 0) {
		const resolvedOverride = resolveAllowedModelRefCore({
			...selectionParams,
			raw: modelOverride
		});
		if ("error" in resolvedOverride) return {
			ok: false,
			error: formatCronPayloadModelRejection({
				cfg: owner.config,
				agentId: ownerAgentId,
				modelOverride,
				error: resolvedOverride.error
			})
		};
		provider = resolvedOverride.ref.provider;
		model = resolvedOverride.ref.model;
		modelSource = "payload";
		configuredProfileId = splitTrailingAuthProfile(modelOverride).profile;
	}
	if (!modelOverride && !hooksGmailModelApplied) {
		const sessionModelOverride = params.sessionEntry.modelOverride?.trim();
		if (sessionModelOverride) {
			const sessionProviderOverride = params.sessionEntry.providerOverride?.trim() || resolvedDefault.provider;
			const resolvedSessionOverride = resolveAllowedModelRefCore({
				...selectionParams,
				raw: `${sessionProviderOverride}/${sessionModelOverride}`
			});
			if (!("error" in resolvedSessionOverride)) {
				provider = resolvedSessionOverride.ref.provider;
				model = resolvedSessionOverride.ref.model;
				modelSource = "session";
				configuredProfileId = void 0;
			}
		}
	}
	return {
		ok: true,
		provider,
		model,
		modelSource,
		...configuredProfileId ? { configuredProfileId } : {},
		cfgWithAgentDefaults,
		owner
	};
}
//#endregion
//#region src/cron/isolated-agent/run-command-preflight.ts
/** Rejects deterministic command prompts whose stored cap cannot execute them. */
function resolveCronCommandPromptPreflight(job) {
	if (job.payload.kind !== "agentTurn" || classifyCronAgentTurnShellPrompt(job.payload) !== "commandPromptWithoutShellAccess") return;
	const error = `Automation ${job.id} cannot run its requested command because the agent prompt contains a "Command to run:" block but toolsAllow does not grant shell/process access. No command was executed. Recreate it as a command automation with \`openclaw automations add ... --command "<shell>"\`, or explicitly reauthorize this job from a trusted operator shell with \`openclaw automations edit ${job.id} --tools exec,process\`.`;
	return {
		status: "error",
		error,
		diagnostics: createCronRunDiagnosticsFromError("cron-preflight", error)
	};
}
//#endregion
//#region src/cron/isolated-agent/run-current-context.ts
const CURRENT_CONTEXT_RAW_MESSAGES_MAX = 220;
const CURRENT_CONTEXT_READ_MAX_BYTES = 262144;
const CURRENT_CONTEXT_MAX_LINE_CHARS = 220;
const CURRENT_CONTEXT_MAX_BLOCK_CHARS = 1400;
const CURRENT_CONTEXT_HEADER = "Recent conversation:";
function truncateContextLine(role, text) {
	const prefix = `- ${role === "user" ? "User" : "Assistant"}: `;
	const textLimit = CURRENT_CONTEXT_MAX_LINE_CHARS - prefix.length;
	if (text.length <= textLimit) return `${prefix}${text}`;
	return `${prefix}${truncateUtf16Safe(text, textLimit - 3).trimEnd()}...`;
}
function formatCurrentConversationContext(messages) {
	const lines = projectChatDisplayMessages(messages, { maxChars: CURRENT_CONTEXT_MAX_LINE_CHARS }).flatMap((message) => {
		if (!message || typeof message !== "object" || Array.isArray(message)) return [];
		const record = message;
		if (record.role !== "user" && record.role !== "assistant") return [];
		const text = extractTextFromChatContent(record.content);
		return text ? [truncateContextLine(record.role, text)] : [];
	}).slice(-10);
	while (lines.length > 0 && `${CURRENT_CONTEXT_HEADER}\n${lines.join("\n")}`.length > CURRENT_CONTEXT_MAX_BLOCK_CHARS) lines.shift();
	return lines.length > 0 ? `${CURRENT_CONTEXT_HEADER}\n${lines.join("\n")}` : void 0;
}
async function buildCurrentConversationContextBlock(params, deps = {}) {
	const sessionId = params.sourceSessionEntry.sessionId?.trim();
	if (!sessionId) return;
	try {
		const messages = await (deps.readSessionMessages ?? readSessionMessagesAsync)({
			agentId: params.agentId,
			sessionEntry: params.sourceSessionEntry,
			sessionId,
			sessionKey: params.sourceSessionKey,
			storePath: params.storePath
		}, {
			mode: "recent",
			maxBytes: CURRENT_CONTEXT_READ_MAX_BYTES,
			maxLines: CURRENT_CONTEXT_RAW_MESSAGES_MAX,
			maxMessages: CURRENT_CONTEXT_RAW_MESSAGES_MAX
		});
		return formatCurrentConversationContext(Array.isArray(messages) ? messages : []);
	} catch {
		return;
	}
}
//#endregion
//#region src/cron/isolated-agent/run-prepare-runtime.ts
/** Lazy preparation runtimes and session lifecycle helpers for cron runs. */
function resolveCronAgentTurnMessage(input) {
	if (input.job.payload.kind === "agentTurn") return input.job.payload.message;
	return input.message;
}
const sessionAccessorRuntimeLoader = createLazyImportLoader(() => import("./session-accessor-Dj50cDcA.js"));
const cronExternalContentRuntimeLoader = createLazyImportLoader(() => import("./run-external-content.runtime.js"));
const cronAuthProfileRuntimeLoader = createLazyImportLoader(() => import("./run-auth-profile.runtime.js"));
async function loadSessionAccessorRuntime() {
	return await sessionAccessorRuntimeLoader.load();
}
async function loadCronExternalContentRuntime() {
	return await cronExternalContentRuntimeLoader.load();
}
async function loadCronAuthProfileRuntime() {
	return await cronAuthProfileRuntimeLoader.load();
}
function hasConfiguredAuthProfiles(cfg) {
	return Boolean(cfg.auth?.profiles && Object.keys(cfg.auth.profiles).length > 0) || Boolean(cfg.auth?.order && Object.keys(cfg.auth.order).length > 0);
}
/**
* Resolves the run's auth profile, skipping the lazy runtime entirely when no
* override, configured profile, or store source exists for it to find. Auth
* resolution may mutate session state, so it uses the store and key that
* persistence will write.
*/
async function resolveCronAuthSelection(params) {
	if (!Boolean(params.cronSession.sessionEntry.authProfileOverride?.trim()) && !hasConfiguredAuthProfiles(params.cfg) && !hasAnyAuthProfileStoreSource(params.agentDir)) return;
	return await (await loadCronAuthProfileRuntime()).resolveSessionAuthSelection({
		cfg: params.cfg,
		provider: params.provider,
		modelId: params.modelId,
		...params.configuredProfileId ? { configuredProfileId: params.configuredProfileId } : {},
		harnessRuntime: params.harnessRuntime,
		agentDir: params.agentDir,
		sessionEntry: params.cronSession.sessionEntry,
		sessionStore: params.cronSession.store,
		sessionKey: params.sessionKey,
		storePath: params.cronSession.storePath,
		isNewSession: params.isNewSession
	});
}
async function retireRolledCronSessionMcpRuntime(params) {
	if (params.job.sessionTarget === "isolated") return;
	const previousSessionId = normalizeOptionalString(params.cronSession.previousSessionId);
	const currentSessionId = normalizeOptionalString(params.cronSession.sessionEntry.sessionId);
	if (!previousSessionId || previousSessionId === currentSessionId) return;
	await retireSessionMcpRuntime({
		sessionId: previousSessionId,
		reason: "cron-session-rollover",
		onError: (error, sessionId) => {
			logWarn(`[cron:${params.job.id}] Failed to dispose retired bundle MCP runtime for session ${sessionId}: ${String(error)}`);
		}
	});
}
function appendCronUnattendedRunPreamble(commandBody, opts) {
	return `${commandBody}\n\n${`This is an unattended scheduled run. Nobody is present to clarify or approve, so complete the task with what you have. Your final reply is the deliverable — not a plan, an acknowledgement, or a request for input. If nothing needs doing, reply exactly ${SILENT_REPLY_TOKEN}. If something failed, state plainly what failed and what you tried — the scheduler owns retries and failure alerts.`}${opts.externalHook ? "" : " Where the job's own instructions conflict with this preamble, the job's instructions win (a question or plan the job explicitly requests is a valid deliverable). If this job is no longer needed, remove it if your available tools allow."}`;
}
//#endregion
//#region src/cron/isolated-agent/run-timeout.ts
/** Converts cron payload timeout overrides into embedded-runner timeout signals. */
/** Converts explicit cron payload timeoutSeconds into a timer-safe millisecond override signal. */
function resolveCronRunTimeoutOverrideMs(timeoutSeconds) {
	const timeoutMs = Math.floor((timeoutSeconds ?? 0) * 1e3);
	return Number.isFinite(timeoutSeconds) && timeoutMs > 0 ? Math.min(timeoutMs, MAX_TIMER_TIMEOUT_MS) : void 0;
}
//#endregion
//#region src/cron/isolated-agent/run-prepare.ts
/** Session identity and context preparation for isolated cron runs. */
async function prepareCronRunContext(params) {
	const { input } = params;
	const commandPromptPreflight = resolveCronCommandPromptPreflight(input.job);
	if (commandPromptPreflight) return {
		ok: false,
		result: commandPromptPreflight
	};
	const requestedRuntimeCfg = resolveCronActiveRuntimeConfig(input.cfg);
	const requestedAgentId = input.agentId?.trim() || input.job.agentId?.trim();
	const requiredAgentId = (requestedAgentId ? normalizeAgentId(requestedAgentId) : void 0) ?? parseAgentSessionKey(input.job.sessionKey ?? input.sessionKey)?.agentId;
	const initialAgentId = resolveCronJobEffectiveAgentId({ agentId: requiredAgentId }, tryResolveAmbientOwnerAgentId(requestedRuntimeCfg));
	const modelOwner = await resolveCronModelSelectionOwner({
		cfg: requestedRuntimeCfg,
		...requiredAgentId ? {
			agentId: initialAgentId,
			requiredAgentId,
			agentDir: resolveAgentDir(requestedRuntimeCfg, initialAgentId),
			workspaceDir: resolveAgentWorkspaceDir(requestedRuntimeCfg, initialAgentId)
		} : {}
	});
	const { agentId, agentDir } = modelOwner;
	const publishedRuntime = await loadPublishedGatewayReplyDispatchRuntime({
		agentId,
		abortSignal: input.abortSignal ?? input.signal
	});
	if (publishedRuntime && (publishedRuntime.pluginGeneration.pluginMetadataSnapshot !== modelOwner.metadataSnapshot || !preparedModelRuntimeConfigsMatch(publishedRuntime.config, modelOwner.config))) throw new PreparedModelRuntimeOwnerNotPublishedError("cron model runtime generation was superseded during preparation");
	const agentConfigOverride = requiredAgentId ? resolveAgentConfig(modelOwner.config, agentId) : void 0;
	const { runtimeConfig: runtimeCfg, agentDefaults: agentCfg } = resolveCronAgentConfig({
		config: modelOwner.config,
		agentConfigOverride
	});
	const baseSessionKey = (input.sessionKey?.trim() || `cron:${input.job.id}`).trim();
	const currentBoundSourceKey = input.job.sessionTarget === "current" ? input.job.sessionKey?.trim() : void 0;
	const usesDetachedRunSession = isDetachedCronSessionTarget(input.job.sessionTarget) || Boolean(currentBoundSourceKey);
	const baseSessionKeyIsCron = baseSessionKey.startsWith("cron:") || isCronSessionKey(baseSessionKey);
	const cronExecutionSessionKey = usesDetachedRunSession && !baseSessionKeyIsCron ? `cron:${input.job.id}` : baseSessionKey;
	const agentSessionKey = resolveCronAgentSessionKey({
		sessionKey: cronExecutionSessionKey,
		agentId,
		mainKey: runtimeCfg.session?.mainKey,
		cfg: runtimeCfg
	});
	const resolvedBaseSessionKey = resolveCronAgentSessionKey({
		sessionKey: currentBoundSourceKey ?? baseSessionKey,
		agentId,
		mainKey: runtimeCfg.session?.mainKey,
		cfg: runtimeCfg
	});
	const sourceSessionKey = currentBoundSourceKey && resolvedBaseSessionKey !== agentSessionKey ? resolvedBaseSessionKey : void 0;
	const hookExternalContentSource = (input.job.payload.kind === "agentTurn" ? input.job.payload.externalContentSource : void 0) ?? resolveHookExternalContentSource(baseSessionKey);
	const workspaceDir = (await ensureAgentWorkspace({
		dir: modelOwner.workspaceDir,
		ensureBootstrapFiles: !agentCfg?.skipBootstrap && !params.isFastTestEnv,
		skipOptionalBootstrapFiles: agentCfg?.skipOptionalBootstrapFiles,
		provisioning: await (await import("./acp-workspace-provisioning-BeD_7yxe.js")).resolveAcpAgentWorkspaceProvisioningForTurn({
			cfg: runtimeCfg,
			agentId
		})
	})).dir;
	const isGmailHook = hookExternalContentSource === "gmail";
	const now = Date.now();
	const sandbox = resolveCreatorSandbox(runtimeCfg, { actor: input.job.createdActor });
	const cronSession = resolveCronSession({
		cfg: runtimeCfg,
		sessionKey: agentSessionKey,
		sourceSessionKey,
		skillLibrarySelections: input.job.skillLibrarySelections,
		agentId,
		nowMs: now,
		forceNew: usesDetachedRunSession,
		hookExternalContentSource
	});
	const sourceEntry = sourceSessionKey ? cronSession.store[sourceSessionKey] : void 0;
	const sourceSessionGeneration = sourceEntry ? {
		sessionId: sourceEntry.sessionId,
		lifecycleRevision: sourceEntry.lifecycleRevision
	} : void 0;
	const reservedKey = isAgentHarnessSessionKey(agentSessionKey);
	if (cronSession.initialSessionEntry?.modelSelectionLocked === true) throw new Error(reservedKey ? AGENT_HARNESS_SESSION_KEY_RESERVED_MESSAGE : AGENT_HARNESS_SESSION_ID_LOCKED_MESSAGE);
	if (reservedKey && !cronSession.initialSessionEntry) throw new Error(AGENT_HARNESS_SESSION_KEY_RESERVED_MESSAGE);
	const runSessionId = cronSession.sessionEntry.sessionId;
	const currentRunSessionId = () => cronSession.sessionEntry.sessionId ?? runSessionId;
	const usesExactRunSession = usesDetachedRunSession || baseSessionKey.startsWith("cron:");
	const runSessionKey = usesExactRunSession ? `${agentSessionKey}:run:${runSessionId}` : agentSessionKey;
	const initialSessionEntry = cronSession.initialSessionEntry;
	const sessionWorkAdmission = await beginSessionWorkAdmission({
		scope: cronSession.storePath,
		identities: [
			agentSessionKey,
			initialSessionEntry?.sessionId,
			cronSession.sessionEntry.sessionId,
			resolveCronLifecycleRevisionIdentity(cronSession.lifecycleRevision),
			runSessionKey
		],
		signal: input.abortSignal ?? input.signal,
		onInterrupt: params.onLifecycleInterrupt,
		assertAllowed: () => {
			const currentEntry = loadCronSessionEntryLatest(cronSession.storePath, agentSessionKey);
			if (initialSessionEntry ? !currentEntry || !isDeepStrictEqual(projectCronOwnershipFields(currentEntry), projectCronOwnershipFields(initialSessionEntry)) : Boolean(currentEntry)) throw new CronSessionLifecycleClaimError(agentSessionKey);
			const archivedSessionError = resolveSessionWorkStartError(agentSessionKey, currentEntry);
			if (archivedSessionError) throw new CronSessionLifecycleClaimError(agentSessionKey, archivedSessionError);
		}
	});
	let preparedModelRuntimeLease;
	try {
		const persistCronSessionRow = async ({ storePath, sessionKey, fallbackEntry, resetBoundaryReason, update, assertCommitAllowed }) => {
			const { applySessionEntryLifecycleMutation, patchSessionEntryCore } = await loadSessionAccessorRuntime();
			if (resetBoundaryReason) {
				await applySessionEntryLifecycleMutation({
					activeSessionKey: sessionKey,
					agentId,
					storePath,
					upserts: [{
						sessionKey,
						resetBoundary: {
							context: "preserve-tail",
							reason: resetBoundaryReason
						},
						buildEntry: ({ currentEntry }) => update(currentEntry)
					}],
					skipMaintenance: true
				});
				return;
			}
			await patchSessionEntryCore({
				storePath,
				sessionKey,
				agentId
			}, (_entry, context) => update(context.existingEntry), {
				fallbackEntry,
				replaceEntry: true,
				assertCommitAllowed
			});
		};
		const persistSessionEntry = createPersistCronSessionEntry({
			cronSession,
			agentSessionKey,
			createdActor: input.job.createdActor,
			sandbox,
			persistSessionEntry: persistCronSessionRow
		});
		const withRunSession = (result) => ({
			...result,
			sessionId: currentRunSessionId(),
			sessionKey: runSessionKey
		});
		if (!cronSession.sessionEntry.label?.trim() && baseSessionKey.startsWith("cron:")) {
			const labelSuffix = typeof input.job.name === "string" && input.job.name.trim() ? input.job.name.trim() : input.job.id;
			cronSession.sessionEntry.label = `Automation: ${labelSuffix}`;
		}
		const resolvedModelSelection = await resolveCronModelSelection({
			cfg: runtimeCfg,
			owner: modelOwner,
			agentConfigOverride,
			sessionEntry: cronSession.sessionEntry,
			payload: input.job.payload,
			isGmailHook,
			agentId,
			agentDir,
			workspaceDir
		});
		if (!resolvedModelSelection.ok) {
			sessionWorkAdmission.release();
			return {
				ok: false,
				result: withRunSession({
					status: "error",
					error: resolvedModelSelection.error,
					diagnostics: createCronRunDiagnosticsFromError("cron-preflight", resolvedModelSelection.error)
				})
			};
		}
		const cfgWithAgentDefaults = resolvedModelSelection.cfgWithAgentDefaults;
		const ownerAgentConfig = resolveAgentConfig(modelOwner.config, modelOwner.agentId);
		const matchesDefaultFallbackAgentStringModel = typeof ownerAgentConfig?.model === "string" && resolveAgentModelPrimaryValue(ownerAgentConfig.model) === resolveAgentModelPrimaryValue(modelOwner.config.agents?.defaults?.model);
		const useSubagentFallbacks = resolvedModelSelection.modelSource === "subagent";
		const inheritDefaultFallbacksForAgentStringModel = matchesDefaultFallbackAgentStringModel && (resolvedModelSelection.modelSource === "default" || resolvedModelSelection.modelSource === "agent");
		const preflight = await resolveCronPreflight({
			cfg: cfgWithAgentDefaults,
			job: input.job,
			agentId: modelOwner.agentId,
			provider: resolvedModelSelection.provider,
			model: resolvedModelSelection.model,
			useSubagentFallbacks,
			inheritDefaultFallbacksForAgentStringModel
		});
		if (!preflight.ok) {
			logWarn(`[cron:${input.job.id}] ${preflight.reason}`);
			sessionWorkAdmission.release();
			return {
				ok: false,
				result: withRunSession({
					status: "skipped",
					error: preflight.reason,
					diagnostics: createCronRunDiagnosticsFromError("model-preflight", preflight.reason, { severity: "warn" }),
					provider: resolvedModelSelection.provider,
					model: resolvedModelSelection.model
				})
			};
		}
		const { provider, model, modelFallbacksOverride, runtimePluginCandidates } = preflight;
		const thinkingSelection = await resolveCronThinkingSelection({
			cfg: cfgWithAgentDefaults,
			owner: modelOwner,
			provider,
			model,
			jobThinking: input.job.payload.kind === "agentTurn" ? input.job.payload.thinking : void 0,
			hookThinking: isGmailHook ? runtimeCfg.hooks?.gmail?.thinking : void 0,
			sessionThinking: cronSession.sessionEntry.thinkingLevel
		});
		const effectiveAgentRuntime = resolveEffectiveAgentRuntime({
			cfg: cfgWithAgentDefaults,
			provider,
			modelId: model,
			agentId: modelOwner.agentId,
			sessionKey: agentSessionKey,
			sessionEntry: cronSession.sessionEntry
		});
		let requestedThinkLevel = thinkingSelection.requestedThinkLevel;
		if (!requestedThinkLevel) requestedThinkLevel = resolveThinkingDefault({
			cfg: cfgWithAgentDefaults,
			provider,
			model,
			catalog: thinkingSelection.catalog,
			agentRuntime: effectiveAgentRuntime
		});
		if (!isThinkingLevelSupported({
			provider,
			model,
			level: requestedThinkLevel,
			catalog: thinkingSelection.catalog,
			agentRuntime: effectiveAgentRuntime
		})) {
			const fallbackThinkLevel = resolveSupportedThinkingLevel({
				provider,
				model,
				level: requestedThinkLevel,
				catalog: thinkingSelection.catalog,
				agentRuntime: effectiveAgentRuntime
			});
			if (fallbackThinkLevel !== requestedThinkLevel) logWarn(`[cron:${input.job.id}] Thinking level "${requestedThinkLevel}" is not supported for ${provider}/${model}; using "${fallbackThinkLevel}" for this candidate.`);
		}
		const explicitTimeoutSeconds = input.job.payload.kind === "agentTurn" ? input.job.payload.timeoutSeconds : void 0;
		const timeoutMs = resolveAgentTimeoutMs({
			cfg: cfgWithAgentDefaults,
			overrideSeconds: explicitTimeoutSeconds
		});
		const runTimeoutOverrideMs = resolveCronRunTimeoutOverrideMs(explicitTimeoutSeconds);
		const agentPayload = input.job.payload.kind === "agentTurn" ? input.job.payload : null;
		const configuredProvider = cfgWithAgentDefaults.models?.providers?.[provider];
		const modelApi = findModelInCatalog(thinkingSelection.catalog, provider, model)?.api ?? configuredProvider?.models?.find((candidate) => candidate.id === model)?.api ?? configuredProvider?.api;
		const preflightDiagnostics = await createCronToolsAllowPreflightDiagnostics({
			cfg: cfgWithAgentDefaults,
			jobId: input.job.id,
			provider,
			model,
			modelApi,
			agentId: modelOwner.agentId,
			agentDir: modelOwner.agentDir,
			workspaceDir,
			sessionKey: agentSessionKey,
			agentPayload,
			agentRuntime: effectiveAgentRuntime,
			toolsAllowProvenance: input.job.toolsAllowProvenance
		});
		const { deliveryPlan, deliveryRequested, resolvedDelivery, sourceDelivery } = await resolveCronDeliveryContext({
			cfg: cfgWithAgentDefaults,
			job: input.job,
			agentId
		});
		const { formattedTime, timeLine } = resolveCronStyleNow(runtimeCfg, now);
		const originalMessage = resolveCronAgentTurnMessage(input);
		const currentConversationContext = input.job.sessionTarget === "current" && agentPayload && sourceSessionKey && sourceEntry ? await buildCurrentConversationContextBlock({
			agentId,
			sourceSessionEntry: sourceEntry,
			sourceSessionKey,
			storePath: cronSession.storePath
		}) : void 0;
		const message = currentConversationContext ? `${currentConversationContext}\n\n${originalMessage}` : originalMessage;
		const base = `[cron:${input.job.id} ${input.job.name}] ${message}`.trim();
		const isExternalHook = hookExternalContentSource !== void 0 || isExternalHookSession(baseSessionKey);
		const allowUnsafeExternalContent = agentPayload?.allowUnsafeExternalContent === true || isGmailHook && input.cfg.hooks?.gmail?.allowUnsafeExternalContent === true;
		const shouldWrapExternal = isExternalHook && !allowUnsafeExternalContent;
		let commandBody;
		if (isExternalHook) {
			const { detectSuspiciousPatterns } = await loadCronExternalContentRuntime();
			const suspiciousPatterns = detectSuspiciousPatterns(message);
			if (suspiciousPatterns.length > 0) logWarn(`[security] Suspicious patterns detected in external hook content (session=${baseSessionKey}, patterns=${suspiciousPatterns.length}): ${suspiciousPatterns.slice(0, 3).join(", ")}`);
		}
		if (shouldWrapExternal) {
			const { buildSafeExternalPrompt } = await loadCronExternalContentRuntime();
			commandBody = `${buildSafeExternalPrompt({
				content: message,
				source: mapHookExternalContentSource(hookExternalContentSource ?? "webhook"),
				jobName: input.job.name,
				jobId: input.job.id,
				timestamp: formattedTime
			})}\n\n${timeLine}`.trim();
		} else commandBody = `${base}\n${timeLine}`.trim();
		commandBody = appendCronUnattendedRunPreamble(commandBody, { externalHook: isExternalHook });
		const skillsSnapshot = await resolveCronSkillsSnapshot({
			workspaceDir,
			config: cfgWithAgentDefaults,
			agentId,
			existingSnapshot: cronSession.sessionEntry.skillsSnapshot,
			librarySelections: cronSession.sessionEntry.skillLibrarySelections,
			isFastTestEnv: params.isFastTestEnv
		});
		await persistCronSkillsSnapshotIfChanged({
			isFastTestEnv: params.isFastTestEnv,
			cronSession,
			skillsSnapshot,
			nowMs: Date.now(),
			persistSessionEntry
		});
		markCronSessionPreRun({
			entry: cronSession.sessionEntry,
			provider,
			model
		});
		try {
			await persistSessionEntry();
		} catch (err) {
			if (err instanceof CronSessionLifecycleClaimError) throw err;
			logWarn(`[cron:${input.job.id}] Failed to persist pre-run session entry: ${String(err)}`);
			if (sandbox === "required" || cronSession.sessionEntry.sandbox === "required") throw err;
		}
		await retireRolledCronSessionMcpRuntime({
			job: input.job,
			cronSession
		});
		const authSelection = await resolveCronAuthSelection({
			cfg: cfgWithAgentDefaults,
			provider,
			modelId: model,
			...provider === resolvedModelSelection.provider && resolvedModelSelection.configuredProfileId ? { configuredProfileId: resolvedModelSelection.configuredProfileId } : {},
			harnessRuntime: effectiveAgentRuntime,
			agentDir,
			cronSession,
			sessionKey: agentSessionKey,
			isNewSession: cronSession.isNewSession && input.job.sessionTarget !== "isolated"
		});
		const authProfileId = authSelection?.profileId;
		const liveSelection = {
			provider,
			model,
			agentRuntimeOverride: resolveSessionRuntimeOverrideForProvider({
				provider,
				entry: cronSession.sessionEntry,
				cfg: cfgWithAgentDefaults
			}),
			authProfileId,
			authProfileIdSource: authSelection?.source
		};
		preparedModelRuntimeLease = await acquireAgentRunPreparedModelRuntime({
			config: cfgWithAgentDefaults,
			agentId,
			agentDir,
			workspaceDir,
			allowGatewaySubagentBinding: true,
			runtimePluginSelections: runtimePluginCandidates.map((candidate) => {
				const runtime = resolveSessionRuntimeOverrideForProvider({
					provider: candidate.provider,
					entry: cronSession.sessionEntry,
					cfg: cfgWithAgentDefaults
				});
				return runtime ? {
					provider: candidate.provider,
					modelId: candidate.model,
					runtime,
					agentId
				} : {
					provider: candidate.provider,
					modelId: candidate.model,
					agentId
				};
			})
		}, {
			catalogMode: "static",
			...publishedRuntime ? { pluginGeneration: publishedRuntime.pluginGeneration } : { pluginMetadataSnapshot: modelOwner.metadataSnapshot },
			abortSignal: input.abortSignal ?? input.signal
		});
		const runContinuationSession = usesExactRunSession ? createCronRunContinuationSession({
			cronSession,
			runSessionKey,
			createdActor: input.job.createdActor,
			sandbox,
			thinkingLevel: requestedThinkLevel,
			toolsAllow: agentPayload?.toolsAllow,
			toolsAllowIsDefault: agentPayload?.toolsAllowIsDefault,
			scheduledToolPolicy: resolveCronScheduledToolPolicy({
				toolsAllow: agentPayload?.toolsAllow,
				scheduledToolPolicy: input.job.scheduledToolPolicy,
				owner: input.job.owner
			}),
			scheduledToolCallerOrigin: input.job.toolsAllowProvenance?.callerOrigin,
			toolsAllowExecTarget: input.job.toolsAllowExecTarget,
			toolsAllowExecTargetRequirement: input.job.toolsAllowExecTargetRequirement,
			cliSessionBindingFacts: {
				sourceReplyDeliveryMode: sourceDelivery.sourceReplyDeliveryMode,
				requireExplicitMessageTarget: sourceDelivery.messageTool.requireExplicitTarget
			},
			persistSessionEntry: persistCronSessionRow
		}) : void 0;
		await runContinuationSession?.initialize();
		return {
			ok: true,
			context: {
				input,
				cfgWithAgentDefaults,
				agentId,
				agentCfg,
				agentDir,
				agentSessionKey,
				sourceSessionKey,
				sourceSessionGeneration,
				runSessionId,
				currentRunSessionId,
				runSessionKey,
				usesDetachedRunSession,
				workspaceDir,
				commandBody,
				cronSession,
				sessionWorkAdmission,
				persistSessionEntry,
				runContinuationSession,
				withRunSession,
				agentPayload,
				deliveryPlan,
				resolvedDelivery,
				deliveryRequested,
				sourceDelivery,
				suppressExecNotifyOnExit: deliveryPlan.mode === "none",
				skillsSnapshot,
				liveSelection,
				useSubagentFallbacks,
				inheritDefaultFallbacksForAgentStringModel,
				modelFallbacksOverride,
				thinkingSelection,
				timeoutMs,
				preflightDiagnostics,
				runTimeoutOverrideMs,
				pluginRegistry: preparedModelRuntimeLease.snapshot.pluginRegistry,
				preparedModelRuntimeLease
			}
		};
	} catch (error) {
		preparedModelRuntimeLease?.release();
		sessionWorkAdmission.release();
		throw error;
	}
}
//#endregion
//#region src/cron/isolated-agent/run.ts
const cronExecutorRuntimeLoader = createLazyImportLoader(() => import("./run-executor.runtime.js"));
function isCronNestedLaneTaskTimeoutError(err) {
	return isCommandLaneTaskTimeoutError(err, "cron-nested");
}
/**
* Release runtime references held by a completed isolated cron run.
*
* After the final durable write and delivery complete, the cron session store
* and run context are no longer needed in memory.  This shallow disposal prevents
* the heap-retention pattern described in #85019 where ~113k copies of the skill
* prompt string accumulated through cron run contexts that were never released.
*
* O(1) — nulls known large fields without deep traversal.  MUST run after the
* final `persistSessionEntry()` and delivery construction, never before.
*/
async function disposeCronRunContext(params) {
	releaseAgentRunContext(params.sessionId, params.runContextOwnerToken);
	if (params.ownsRunContext) await retireSessionMcpRuntime({
		sessionId: params.sessionId,
		reason: "isolated-cron-dispose",
		onError: (error, sid) => {
			logWarn(`[cron] Failed to retire MCP runtime during isolated cron dispose ${sid}: ${String(error)}`);
		}
	}).catch(() => {});
	params.cronSession.store = void 0;
}
/** Runs one isolated cron agent turn, including setup, execution, delivery, and persistence. */
async function runCronIsolatedAgentTurn(params) {
	const admittedLifecycleGeneration = getAgentEventLifecycleGeneration();
	const upstreamAbortSignal = params.abortSignal ?? params.signal;
	const lifecycleAbortController = new AbortController();
	const abortSignal = upstreamAbortSignal ? AbortSignal.any([upstreamAbortSignal, lifecycleAbortController.signal]) : lifecycleAbortController.signal;
	const isAborted = () => abortSignal?.aborted ?? false;
	const abortReason = () => resolveCronAbortReasonText(abortSignal?.reason) ?? "cron: job execution timed out";
	const isFastTestEnv = isFastTestRuntimeEnv();
	let prepared;
	try {
		prepared = await prepareCronRunContext({
			input: {
				...params,
				abortSignal
			},
			isFastTestEnv,
			onLifecycleInterrupt: () => lifecycleAbortController.abort(createAgentRunRestartAbortError())
		});
	} catch (err) {
		if (err instanceof CronSessionLifecycleClaimError) return {
			status: "error",
			error: err.message,
			admissionDisposition: err.admissionDisposition
		};
		throw err;
	}
	if (!prepared.ok) return {
		...prepared.result,
		admissionDisposition: "rejected"
	};
	let preparedRuntimeLease = prepared.context.preparedModelRuntimeLease;
	const releasePreparedRuntime = () => {
		preparedRuntimeLease?.release();
		preparedRuntimeLease = void 0;
	};
	const initialSessionId = prepared.context.cronSession.sessionEntry.sessionId;
	const ownsRunContext = params.job.sessionTarget === "isolated";
	let runContextOwnerToken;
	let runLifecycleGeneration = admittedLifecycleGeneration;
	let executionStarted = false;
	const notifyExecutionStarted = (info) => {
		executionStarted = true;
		if (info?.lifecycleGeneration) runLifecycleGeneration = info.lifecycleGeneration;
		params.onExecutionStarted?.({
			jobId: params.job.id,
			agentId: prepared.context.agentId,
			sessionId: prepared.context.currentRunSessionId(),
			sessionKey: prepared.context.runSessionKey,
			...info?.isFallback === true ? { isFallback: true } : {},
			phase: "runner_entered",
			provider: info?.provider ?? prepared.context.liveSelection.provider,
			model: info?.model ?? prepared.context.liveSelection.model
		});
	};
	const notifyExecutionPhase = (info) => {
		params.onExecutionPhase?.({
			jobId: params.job.id,
			agentId: prepared.context.agentId,
			sessionId: prepared.context.currentRunSessionId(),
			sessionKey: prepared.context.runSessionKey,
			provider: prepared.context.liveSelection.provider,
			model: prepared.context.liveSelection.model,
			...info
		});
	};
	const turnStartedAtMs = Date.now();
	const messageLifecycle = (() => {
		try {
			const lifecycle = createDiagnosticMessageLifecycle({
				enabled: isDiagnosticsEnabled(params.cfg),
				sessionId: prepared.context.runSessionId,
				sessionKey: prepared.context.runSessionKey,
				channel: "cron",
				source: "cron-isolated",
				startedAtMs: turnStartedAtMs,
				trackSessionState: true
			});
			lifecycle.markProcessing();
			return lifecycle;
		} catch (error) {
			releasePreparedRuntime();
			prepared.context.sessionWorkAdmission.release();
			throw error;
		}
	})();
	let outcome = "completed";
	let outcomeError;
	let cronRunSessionCleanupHandled = false;
	const lifecycle = createAgentLifecycleTerminalBackstop({
		runId: initialSessionId,
		sessionKey: prepared.context.runSessionKey,
		startedAt: turnStartedAtMs,
		getLifecycleGeneration: () => runLifecycleGeneration,
		resolveTerminationFields: (error) => resolveAgentRunErrorLifecycleFields(error, abortSignal)
	});
	try {
		assertAgentRunLifecycleGenerationCurrent(runLifecycleGeneration);
		const existingRunContext = getAgentRunContext(initialSessionId);
		runContextOwnerToken = claimAgentRunContext(initialSessionId, {
			sessionKey: ownsRunContext || !existingRunContext?.sessionKey ? prepared.context.runSessionKey : existingRunContext.sessionKey,
			sessionId: initialSessionId,
			lifecycleGeneration: runLifecycleGeneration,
			cronRunsByJobId: /* @__PURE__ */ new Map([[params.job.id, { pacingEnabled: params.job.pacing !== void 0 }]])
		}, {
			trackOwner: true,
			ownsContext: ownsRunContext
		});
		const { executeCronRun } = await cronExecutorRuntimeLoader.load();
		const executionParams = {
			cfg: params.cfg,
			cfgWithAgentDefaults: prepared.context.cfgWithAgentDefaults,
			job: params.job,
			agentId: prepared.context.agentId,
			agentDir: prepared.context.agentDir,
			agentSessionKey: prepared.context.agentSessionKey,
			runSessionKey: prepared.context.runSessionKey,
			usesDetachedRunSession: prepared.context.usesDetachedRunSession,
			workspaceDir: prepared.context.workspaceDir,
			lane: params.lane,
			resolvedDelivery: {
				channel: prepared.context.resolvedDelivery.channel,
				to: prepared.context.resolvedDelivery.to,
				accountId: prepared.context.resolvedDelivery.accountId,
				threadId: prepared.context.resolvedDelivery.threadId
			},
			resolvedDeliveryOk: prepared.context.resolvedDelivery.ok,
			deliveryRequested: prepared.context.deliveryRequested,
			sourceDelivery: prepared.context.sourceDelivery,
			skillsSnapshot: prepared.context.skillsSnapshot,
			agentPayload: prepared.context.agentPayload,
			useSubagentFallbacks: prepared.context.useSubagentFallbacks,
			inheritDefaultFallbacksForAgentStringModel: prepared.context.inheritDefaultFallbacksForAgentStringModel,
			modelFallbacksOverride: prepared.context.modelFallbacksOverride,
			agentVerboseDefault: prepared.context.agentCfg?.verboseDefault,
			liveSelection: prepared.context.liveSelection,
			cronSession: prepared.context.cronSession,
			commandBody: prepared.context.commandBody,
			persistSessionEntry: prepared.context.persistSessionEntry,
			persistRunContinuationSession: prepared.context.runContinuationSession?.sync,
			setRunContinuationCliExecutionProvider: prepared.context.runContinuationSession?.setCliExecutionProvider,
			abortSignal,
			lifecycle,
			onExecutionStarted: notifyExecutionStarted,
			onExecutionPhase: notifyExecutionPhase,
			onLaneWait: params.onLaneWait,
			abortReason,
			isAborted,
			immutableThinkLevel: prepared.context.thinkingSelection.immutableThinkLevel,
			thinkingCatalog: prepared.context.thinkingSelection.catalog,
			loadThinkingCatalog: prepared.context.thinkingSelection.loadThinkingCatalog,
			timeoutMs: prepared.context.timeoutMs,
			runTimeoutOverrideMs: prepared.context.runTimeoutOverrideMs,
			suppressExecNotifyOnExit: prepared.context.suppressExecNotifyOnExit,
			pluginRegistry: prepared.context.pluginRegistry,
			executionIdentity: params.executionIdentity
		};
		const runExecutionWithAdmission = () => prepared.context.sessionWorkAdmission.run(() => withAgentRunLifecycleGeneration(runLifecycleGeneration, () => withPluginRuntimeGenerationScope(prepared.context.preparedModelRuntimeLease.snapshot, () => executeCronRun(executionParams))));
		let execution;
		try {
			execution = await withPreparedModelRuntimePluginGenerationScope(prepared.context.preparedModelRuntimeLease.pluginGeneration, runExecutionWithAdmission, () => preparedRuntimeLease?.snapshot);
		} finally {
			releasePreparedRuntime();
		}
		lifecycle.emit("end", execution.runResult);
		const finalized = await finalizeCronRun({
			prepared: prepared.context,
			execution,
			abortReason,
			isAborted,
			markCronRunSessionCleanupHandled: () => {
				cronRunSessionCleanupHandled = true;
			},
			beforeSessionDelete: prepared.context.sessionWorkAdmission.release
		});
		if (finalized.status === "error") {
			outcome = "error";
			outcomeError = finalized.error;
		}
		const delayMs = consumeCronNextCheckProposal(initialSessionId, params.job.id);
		return finalized.status !== "ok" || delayMs === void 0 ? finalized : {
			...finalized,
			nextCheck: { delayMs }
		};
	} catch (err) {
		lifecycle.emit("error", err);
		consumeCronNextCheckProposal(initialSessionId, params.job.id);
		const isCronLaneTimeout = isAborted() || isCronNestedLaneTaskTimeoutError(err);
		const error = isCronLaneTimeout ? abortReason() : normalizeCronRunErrorText(err);
		outcome = "error";
		outcomeError = error;
		return prepared.context.withRunSession({
			status: "error",
			error,
			executionStarted,
			...!executionStarted ? { admissionDisposition: err instanceof CronSessionLifecycleClaimError ? err.admissionDisposition : "rejected" } : {},
			provider: prepared.context.liveSelection.provider,
			model: prepared.context.liveSelection.model,
			diagnostics: mergeCronRunDiagnostics(prepared.context.preflightDiagnostics, createCronRunDiagnosticsFromError(isCronLaneTimeout ? "cron-setup" : "agent-run", isCronLaneTimeout ? error : err))
		});
	} finally {
		releasePreparedRuntime();
		try {
			await prepared.context.runContinuationSession?.seal();
		} catch (sealError) {
			logWarn(`[cron:${params.job.id}] Failed to seal run continuation during cleanup: ${String(sealError)}`);
		}
		const finalSessionRef = {
			sessionId: prepared.context.currentRunSessionId(),
			sessionKey: prepared.context.runSessionKey
		};
		try {
			messageLifecycle.markIdle(void 0, finalSessionRef);
			messageLifecycle.markProcessed(outcome, {
				...finalSessionRef,
				error: outcomeError
			});
		} finally {
			try {
				if (!cronRunSessionCleanupHandled) await cleanupCronRunSessionAfterRun({
					job: params.job,
					agentSessionKey: prepared.context.agentSessionKey,
					sessionId: prepared.context.currentRunSessionId(),
					lifecycleRevision: prepared.context.cronSession.lifecycleRevision,
					sessionUpdatedAt: prepared.context.cronSession.sessionEntry.updatedAt,
					beforeDelete: prepared.context.sessionWorkAdmission.release,
					reason: "cron-delete-after-run-finally"
				});
			} finally {
				try {
					try {
						await disposeCronRunContext({
							sessionId: initialSessionId,
							cronSession: prepared.context.cronSession,
							ownsRunContext,
							runContextOwnerToken
						});
					} finally {
						prepared.context.sessionWorkAdmission.release();
					}
					if (prepared.context.runContinuationSession) try {
						await removeCronRunContinuationSessionIfIdle(prepared.context.runSessionKey);
					} catch (error) {
						logWarn(`[cron:${params.job.id}] Failed to remove unused run continuation: ${String(error)}`);
					}
				} finally {
					if (prepared.context.runSessionKey !== prepared.context.agentSessionKey) await cleanupBrowserSessionsForLifecycleEnd({
						cfg: prepared.context.cfgWithAgentDefaults,
						sessionKeys: [prepared.context.runSessionKey],
						onWarn: (message) => logWarn(`[cron:${params.job.id}] ${message}`)
					});
				}
			}
		}
	}
}
//#endregion
export { resolveCronActiveRuntimeConfig as n, resolveCronAgentConfig as r, runCronIsolatedAgentTurn as t };
