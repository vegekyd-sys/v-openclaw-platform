import { p as clampPositiveTimerTimeoutMs } from "./number-coercion-CLj0HTDM.js";
import { c as isRecord } from "./record-coerce-DItp3I4t.js";
import { t as hasNonEmptyString } from "./string-coerce-CIXf7egm.js";
import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { C as createChildDiagnosticTraceContext, D as freezeDiagnosticTraceContext, o as emitTrustedDiagnosticEvent, t as areDiagnosticsEnabledForProcess, x as formatPropagatedDiagnosticTraceparent } from "./diagnostic-events-D_BPObBj.js";
import { n as emitDiagnosticsTimelineEvent } from "./diagnostics-timeline-H3aAUCYk.js";
import { t as isPromiseLike } from "./promise-like-D7-l5Fsp.js";
import { t as getGlobalHookRunner, y as fireAndForgetBoundedHook } from "./hook-runner-global-DLqoAE5f.js";
import { c as normalizeUsage, n as derivePromptTokens } from "./usage-CtmV8Xxq.js";
import { l as getStreamLlmRuntime } from "./stream-BbY-2nPo.js";
import { o as createAnthropicVertexStreamFnForModel } from "./ai-transport-runtime-host-BCAHK6CH.js";
import { b as emitCoreModelRequestStartedDiagnosticEvent, d as markDiagnosticRunProgress, v as emitCoreSemanticRunProgressDiagnosticEvent, y as emitCoreModelRequestEndedDiagnosticEvent } from "./diagnostic-run-activity-DLw8ESkx.js";
import { a as diagnosticProviderRequestIdHash, i as diagnosticHttpStatusCode, n as diagnosticErrorFailureKind, t as diagnosticErrorCategory } from "./diagnostic-error-metadata-qnHBNuqn.js";
import { t as cloneDiagnosticContentValue } from "./diagnostic-llm-content-CAc71KJ1.js";
import { createBoundaryAwareStreamFnForModel, withProviderAcceptanceObserver } from "@openclaw/ai/transports";
import { notifyLlmRequestActivity, onLlmRequestActivity } from "@openclaw/ai/internal/runtime";
import { stripSystemPromptCacheBoundary } from "@openclaw/ai/internal/shared";
//#region src/agents/embedded-agent-runner/stream-resolution.ts
const embeddedAgentBaseStreamFnCache = /* @__PURE__ */ new WeakMap();
function resolveEmbeddedAgentBaseStreamFn(params) {
	const cached = embeddedAgentBaseStreamFnCache.get(params.session);
	if (cached !== void 0 || embeddedAgentBaseStreamFnCache.has(params.session)) {
		if (!cached) throw new Error("Agent session has no lifecycle-owned base stream.");
		return cached;
	}
	const baseStreamFn = params.session.agent.streamFn;
	embeddedAgentBaseStreamFnCache.set(params.session, baseStreamFn);
	if (!baseStreamFn) throw new Error("Agent session has no lifecycle-owned base stream.");
	return baseStreamFn;
}
function resolveEmbeddedStreamRuntime(owner) {
	const runtime = owner.llmRuntime ?? getStreamLlmRuntime(owner.currentStreamFn);
	if (!runtime) throw new Error("Embedded stream has no lifecycle runtime owner.");
	return runtime;
}
function isDefaultOpenClawStreamFnForModel(model, streamFn, llmRuntime) {
	if (!streamFn || streamFn === llmRuntime.streamSimple) return true;
	const api = typeof model.api === "string" ? model.api.trim() : "";
	if (!api) return false;
	const provider = llmRuntime.registry.getApiProvider(api);
	return streamFn === provider?.streamSimple || streamFn === provider?.stream;
}
function isOpenAICodexResponsesModel(model) {
	return model.provider === "openai" && model.api === "openai-chatgpt-responses";
}
function resolveOpenClawNativeCodexResponsesStreamFn(params) {
	if (!isOpenAICodexResponsesModel(params.model)) return;
	if (!isDefaultOpenClawStreamFnForModel(params.model, params.currentStreamFn, params.llmRuntime) && getStreamLlmRuntime(params.currentStreamFn) !== params.llmRuntime) return;
	return params.currentStreamFn ?? params.llmRuntime.streamSimple;
}
async function resolveEmbeddedAgentApiKey(params) {
	const resolvedApiKey = params.resolvedApiKey?.trim();
	if (resolvedApiKey) return resolvedApiKey;
	return params.authStorage ? await params.authStorage.getApiKey(params.provider) : void 0;
}
function resolveEmbeddedAgentStream(params) {
	const llmRuntime = resolveEmbeddedStreamRuntime(params);
	const wrapOptions = {
		runSignal: params.signal,
		resolvedApiKey: params.resolvedApiKey,
		authProfileId: params.authProfileId,
		authStorage: params.authStorage,
		providerId: params.model.provider,
		promptCacheKey: params.promptCacheKey
	};
	const stripCacheBoundary = (context) => context.systemPrompt ? {
		...context,
		systemPrompt: stripSystemPromptCacheBoundary(context.systemPrompt)
	} : context;
	if (params.providerStreamFn) return {
		streamFn: wrapEmbeddedAgentStreamFn(params.providerStreamFn, {
			...wrapOptions,
			transformContext: stripCacheBoundary
		}),
		strategy: "provider"
	};
	const currentStreamFn = params.currentStreamFn ?? llmRuntime.streamSimple;
	if (params.model.provider === "anthropic-vertex") {
		const vertexStreamFn = createAnthropicVertexStreamFnForModel(params.model);
		return {
			streamFn: params.signal ? wrapEmbeddedAgentStreamFn(vertexStreamFn, {
				runSignal: params.signal,
				providerId: params.model.provider
			}) : vertexStreamFn,
			strategy: "anthropic-vertex"
		};
	}
	const nativeStreamFn = resolveOpenClawNativeCodexResponsesStreamFn({
		model: params.model,
		currentStreamFn: params.currentStreamFn,
		llmRuntime
	});
	if (nativeStreamFn) return {
		streamFn: wrapEmbeddedAgentStreamFn(nativeStreamFn, {
			...wrapOptions,
			sessionId: params.sessionId,
			transformContext: stripCacheBoundary
		}),
		strategy: "openclaw-native-codex-responses"
	};
	const isDefault = isDefaultOpenClawStreamFnForModel(params.model, params.currentStreamFn, llmRuntime);
	if (isDefault || hasNonEmptyString(params.resolvedApiKey) || params.transportAuthAvailable || params.model.api === "anthropic-messages" && params.model.provider !== "anthropic") {
		const boundaryAwareStreamFn = createBoundaryAwareStreamFnForModel(params.model);
		if (boundaryAwareStreamFn) return {
			streamFn: wrapEmbeddedAgentStreamFn(boundaryAwareStreamFn, {
				...wrapOptions,
				sessionId: params.sessionId
			}),
			strategy: `boundary-aware:${params.model.api}`
		};
	}
	const promptCacheKey = params.promptCacheKey?.trim();
	return {
		streamFn: !promptCacheKey && !params.signal ? currentStreamFn : wrapEmbeddedAgentStreamFn(currentStreamFn, {
			runSignal: params.signal,
			providerId: params.model.provider,
			promptCacheKey
		}),
		strategy: isDefault ? "stream-simple" : "session-custom"
	};
}
/** Preserve request activity across cancellation composition without retaining completed turns. */
function composeRunSignal(callerSignal, runSignal) {
	const composedSignal = AbortSignal.any([callerSignal, runSignal]);
	onLlmRequestActivity(composedSignal, () => {
		if (!composedSignal.aborted) notifyLlmRequestActivity(callerSignal);
	});
	return composedSignal;
}
function wrapEmbeddedAgentStreamFn(inner, params) {
	const transformContext = params.transformContext ?? ((context) => context);
	const mergeRunSignal = (options) => {
		const embeddedOptions = options;
		const callerSignal = embeddedOptions?.signal;
		const signal = callerSignal && params.runSignal && callerSignal !== params.runSignal ? composeRunSignal(callerSignal, params.runSignal) : callerSignal ?? params.runSignal;
		let merged = params.sessionId && !embeddedOptions?.sessionId ? {
			...embeddedOptions,
			sessionId: params.sessionId
		} : embeddedOptions;
		const promptCacheKey = params.promptCacheKey?.trim();
		if (promptCacheKey && !merged?.promptCacheKey) merged = {
			...merged,
			promptCacheKey
		};
		if (params.authProfileId && !merged?.authProfileId) merged = {
			...merged,
			authProfileId: params.authProfileId
		};
		return signal ? {
			...merged,
			signal
		} : merged;
	};
	if (!params.authStorage && !params.resolvedApiKey) return (m, context, options) => inner(m, transformContext(context), mergeRunSignal(options));
	const { authStorage, providerId, resolvedApiKey } = params;
	return async (m, context, options) => {
		const selectedApiKey = await resolveEmbeddedAgentApiKey({
			provider: providerId,
			resolvedApiKey,
			authStorage
		}) ?? options?.apiKey;
		return inner(m, transformContext(context), {
			...mergeRunSignal(options),
			apiKey: selectedApiKey
		});
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt.model-diagnostic-lifecycle.ts
const TRACEPARENT_HEADER_NAME = "traceparent";
const TIMELINE_ATTRIBUTE_MAX_LENGTH = 256;
function baseModelCallEvent(ctx, callId, trace, promptStats) {
	return {
		runId: ctx.runId,
		callId,
		...ctx.sessionKey && { sessionKey: ctx.sessionKey },
		...ctx.sessionId && { sessionId: ctx.sessionId },
		provider: ctx.provider,
		model: ctx.model,
		...ctx.api && { api: ctx.api },
		...ctx.transport && { transport: ctx.transport },
		observationUnit: "request",
		...ctx.contextTokenBudget ? { contextTokenBudget: ctx.contextTokenBudget } : {},
		...ctx.contextWindowSource ? { contextWindowSource: ctx.contextWindowSource } : {},
		...ctx.contextWindowReferenceTokens ? { contextWindowReferenceTokens: ctx.contextWindowReferenceTokens } : {},
		...promptStats ? { promptStats } : {},
		trace
	};
}
function modelContentPrivateData(modelContent) {
	return modelContent ? { modelContent } : void 0;
}
function boundedTimelineAttribute(value) {
	return truncateUtf16Safe(value?.trim() ?? "", TIMELINE_ATTRIBUTE_MAX_LENGTH) || void 0;
}
function emitProviderRequestTimelineEvent(eventBase, startedAt, durationMs, ok, responseStatus, providerAcceptanceKind) {
	const provider = boundedTimelineAttribute(eventBase.provider);
	const model = boundedTimelineAttribute(eventBase.model);
	const api = boundedTimelineAttribute(eventBase.api);
	const transport = boundedTimelineAttribute(eventBase.transport);
	emitDiagnosticsTimelineEvent({
		type: "provider.request",
		name: "provider.request",
		timestamp: new Date(startedAt).toISOString(),
		runId: eventBase.runId,
		spanId: eventBase.callId,
		durationMs,
		provider,
		operation: api ?? transport ?? "model.call",
		ok,
		...responseStatus !== void 0 ? { status: responseStatus } : {},
		attributes: {
			...model ? { model } : {},
			...api ? { api } : {},
			...transport ? { transport } : {},
			providerAccepted: providerAcceptanceKind !== void 0,
			...providerAcceptanceKind ? { providerAcceptanceKind } : {}
		}
	});
}
function modelCallErrorFields(err) {
	const upstreamRequestIdHash = diagnosticProviderRequestIdHash(err);
	const failureKind = diagnosticErrorFailureKind(err);
	return {
		errorCategory: diagnosticErrorCategory(err),
		...failureKind ? {
			failureKind,
			memory: processMemoryUsageSnapshot()
		} : {},
		...upstreamRequestIdHash ? { upstreamRequestIdHash } : {}
	};
}
function processMemoryUsageSnapshot() {
	try {
		const memory = process.memoryUsage();
		return {
			rssBytes: memory.rss,
			heapTotalBytes: memory.heapTotal,
			heapUsedBytes: memory.heapUsed,
			externalBytes: memory.external,
			arrayBuffersBytes: memory.arrayBuffers
		};
	} catch {
		return;
	}
}
function modelCallHookEventBase(eventBase) {
	return {
		runId: eventBase.runId,
		callId: eventBase.callId,
		...eventBase.sessionKey ? { sessionKey: eventBase.sessionKey } : {},
		...eventBase.sessionId ? { sessionId: eventBase.sessionId } : {},
		provider: eventBase.provider,
		model: eventBase.model,
		...eventBase.api ? { api: eventBase.api } : {},
		...eventBase.transport ? { transport: eventBase.transport } : {},
		...eventBase.contextTokenBudget ? { contextTokenBudget: eventBase.contextTokenBudget } : {},
		...eventBase.contextWindowSource ? { contextWindowSource: eventBase.contextWindowSource } : {},
		...eventBase.contextWindowReferenceTokens ? { contextWindowReferenceTokens: eventBase.contextWindowReferenceTokens } : {}
	};
}
function modelCallHookContext(eventBase) {
	return Object.freeze({
		runId: eventBase.runId,
		trace: eventBase.trace,
		...eventBase.sessionKey ? { sessionKey: eventBase.sessionKey } : {},
		...eventBase.sessionId ? { sessionId: eventBase.sessionId } : {},
		modelProviderId: eventBase.provider,
		modelId: eventBase.model,
		...eventBase.contextTokenBudget ? { contextTokenBudget: eventBase.contextTokenBudget } : {},
		...eventBase.contextWindowSource ? { contextWindowSource: eventBase.contextWindowSource } : {},
		...eventBase.contextWindowReferenceTokens ? { contextWindowReferenceTokens: eventBase.contextWindowReferenceTokens } : {}
	});
}
function dispatchModelCallStartedHook(eventBase) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("model_call_started")) return;
	const event = Object.freeze(modelCallHookEventBase(eventBase));
	const hookCtx = modelCallHookContext(eventBase);
	fireAndForgetBoundedHook(() => hookRunner.runModelCallStarted(event, hookCtx), "model_call_started plugin hook failed");
}
function dispatchModelCallEndedHook(eventBase, fields) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("model_call_ended")) return;
	const event = Object.freeze({
		...modelCallHookEventBase(eventBase),
		...fields
	});
	const hookCtx = modelCallHookContext(eventBase);
	fireAndForgetBoundedHook(() => hookRunner.runModelCallEnded(event, hookCtx), "model_call_ended plugin hook failed");
}
function emitModelCallEnded(eventBase, startedAt, observer, failure, ownerGeneration) {
	if (observer.state.terminalEventEmitted) return;
	observer.state.terminalEventEmitted = true;
 firstTextMetric(observer.state,'model-call-ended',{failed:Boolean(failure)});
	const durationMs = Date.now() - startedAt;
	const sizeTimingFields = observer.sizeTimingFields();
	const fields = failure ? modelCallErrorFields(failure.error) : void 0;
	const terminal = fields ? {
		type: "model.call.error",
		...fields
	} : { type: "model.call.completed" };
	const errorStatus = failure ? diagnosticHttpStatusCode(failure.error) : void 0;
	const responseStatus = observer.state.responseStatus ?? (errorStatus === void 0 ? void 0 : Number(errorStatus));
	emitProviderRequestTimelineEvent(eventBase, startedAt, durationMs, failure === void 0, responseStatus, observer.state.providerAcceptanceKind);
	emitCoreModelRequestEndedDiagnosticEvent({
		...terminal,
		...eventBase,
		durationMs,
		...sizeTimingFields,
		...observer.usageField()
	}, ownerGeneration, modelContentPrivateData(observer.completedContent()));
	if (!observer.state.suppressPluginHooks) dispatchModelCallEndedHook(eventBase, {
		durationMs,
		outcome: failure ? "error" : "completed",
		...sizeTimingFields,
		...fields
	});
}
function withDiagnosticRequestContext(options, trace, observer, callId) {
	const traceparent = formatPropagatedDiagnosticTraceparent(trace);
	const originalOnPayload = options?.onPayload;
	const originalOnResponse = options?.onResponse;
	const onPayload = (payload, model) => {
 firstTextMetric(observer.state,'payload-ready',{inputItems:Array.isArray(payload?.input)?payload.input.length:payload?.messages?.length,toolCount:payload?.tools?.length,nativeWebSearch:payload?.tools?.some(t=>typeof t?.type==='string'&&t.type.startsWith('web_search')),effort:payload?.reasoning?.effort??payload?.reasoning_effort,serviceTier:payload?.service_tier});
		if (!originalOnPayload) {
			observer.assignRequestPayloadBytes(payload);
			return;
		}
		const result = originalOnPayload(payload, model);
		if (isPromiseLike(result)) return result.then((replacement) => {
			observer.assignRequestPayloadBytes(replacement ?? payload);
			return replacement;
		});
		observer.assignRequestPayloadBytes(result ?? payload);
		return result;
	};
	const onResponse = (response, model) => {
		observer.state.responseStatus = response.status;
 firstTextMetric(observer.state,'response-headers',{status:response.status});
		return originalOnResponse?.(response, model);
	};
	const headers = {};
	for (const [key, value] of Object.entries(options?.headers ?? {})) {
		if (key.toLowerCase() === TRACEPARENT_HEADER_NAME) continue;
		headers[key] = value;
	}
	if (traceparent) headers[TRACEPARENT_HEADER_NAME] = traceparent;
	const requestOptions = {
		...options,
		requestId: callId,
		...(options?.headers || traceparent) && { headers },
		onPayload,
		onResponse
	};
	return withProviderAcceptanceObserver(requestOptions, (acceptance) => {
		observer.state.providerAcceptanceKind = acceptance.kind;
 firstTextMetric(observer.state,'provider-accepted',{kind:acceptance.kind});
		if (acceptance.kind === "http_response") observer.state.responseStatus = acceptance.status;
	});
}
function createModelLifecycle(params) {
	const callId = params.ctx.nextCallId();
	const trace = freezeDiagnosticTraceContext(createChildDiagnosticTraceContext(params.ctx.trace));
	const observer = params.createObserver(areDiagnosticsEnabledForProcess());
	const eventBase = baseModelCallEvent(params.ctx, callId, trace, observer.promptStats);
 observer.state.firstTextMetricBase={runId:params.ctx.runId,callId,provider:params.ctx.provider,model:params.ctx.model};
 firstTextMetric(observer.state,'model-call-enter');
	emitCoreModelRequestStartedDiagnosticEvent(eventBase, params.ctx.ownerGeneration, params.requestTimeoutMs, modelContentPrivateData(observer.modelContent));
	if (params.ctx.suppressPluginHooks !== true) dispatchModelCallStartedHook(eventBase);
	params.ctx.onStarted?.();
	const startedAt = Date.now();
	return {
		eventBase,
		observer,
		propagatedOptions: withDiagnosticRequestContext(params.options, trace, observer, callId),
		startedAt,
		emitCompleted() {
			emitModelCallEnded(eventBase, startedAt, observer, observer.state.terminalError ? { error: observer.state.terminalError } : void 0, params.ctx.ownerGeneration);
		},
		emitError(err) {
			emitModelCallEnded(eventBase, startedAt, observer, { error: err }, params.ctx.ownerGeneration);
		}
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt.model-diagnostic-observation.ts
const MODEL_CALL_STREAM_PROGRESS_INTERVAL_MS = 3e4;
const MODEL_CALL_STREAM_PROGRESS_REASON = "model_call:stream_progress";
const MODEL_CALL_SEMANTIC_PROGRESS_REASON = "model_call:semantic_result";
function utf8JsonByteLength(value) {
	try {
		return Buffer.byteLength(JSON.stringify(value), "utf8");
	} catch {
		return;
	}
}
function assignRequestPayloadBytes(state, payload) {
	const bytes = utf8JsonByteLength(payload);
	if (bytes !== void 0) state.requestPayloadBytes = bytes;
}
function utf8StringByteLength(value) {
	return Buffer.byteLength(value, "utf8");
}
function jsonCharLength(value) {
	try {
		return JSON.stringify(value)?.length;
	} catch {
		return;
	}
}
function streamDeltaByteLength(chunk) {
	const type = chunk.type;
	if ((type === "text_delta" || type === "thinking_delta" || type === "toolcall_delta") && typeof chunk.delta === "string") return utf8StringByteLength(chunk.delta);
}
function responseStreamChunkByteLengthUnchecked(chunk) {
	if (!isRecord(chunk)) return utf8JsonByteLength(chunk);
	const deltaBytes = streamDeltaByteLength(chunk);
	if (deltaBytes !== void 0) return deltaBytes;
	if (!("partial" in chunk)) return utf8JsonByteLength(chunk);
	const { partial: _partial, ...snapshotlessChunk } = chunk;
	return utf8JsonByteLength(snapshotlessChunk);
}
function responseStreamChunkByteLength(chunk) {
	try {
		return responseStreamChunkByteLengthUnchecked(chunk);
	} catch {
		return;
	}
}
function streamContextModelContentFields(policy, streamContext) {
	if (!policy?.anyModelContent || !isRecord(streamContext)) return;
	const content = {
		...policy.inputMessages && Array.isArray(streamContext.messages) ? { inputMessages: cloneDiagnosticContentValue(streamContext.messages) } : {},
		...policy.systemPrompt && typeof streamContext.systemPrompt === "string" ? { systemPrompt: streamContext.systemPrompt } : {},
		...policy.toolDefinitions && Array.isArray(streamContext.tools) ? { toolDefinitions: cloneDiagnosticContentValue(streamContext.tools) } : {}
	};
	return Object.keys(content).length > 0 ? content : void 0;
}
function streamContextModelPromptStats(streamContext) {
	if (!isRecord(streamContext)) return;
	const messages = Array.isArray(streamContext.messages) ? streamContext.messages : void 0;
	const tools = Array.isArray(streamContext.tools) ? streamContext.tools : void 0;
	const systemPrompt = typeof streamContext.systemPrompt === "string" ? streamContext.systemPrompt : void 0;
	const inputMessagesChars = messages ? jsonCharLength(messages) : void 0;
	const toolDefinitionsChars = tools ? jsonCharLength(tools) : void 0;
	const systemPromptChars = systemPrompt?.length;
	if (messages === void 0 && tools === void 0 && systemPromptChars === void 0 && inputMessagesChars === void 0 && toolDefinitionsChars === void 0) return;
	const totalChars = (inputMessagesChars ?? 0) + (systemPromptChars ?? 0) + (toolDefinitionsChars ?? 0);
	return {
		...messages ? { inputMessagesCount: messages.length } : {},
		...inputMessagesChars !== void 0 ? { inputMessagesChars } : {},
		...systemPromptChars !== void 0 ? { systemPromptChars } : {},
		...tools ? { toolDefinitionsCount: tools.length } : {},
		...toolDefinitionsChars !== void 0 ? { toolDefinitionsChars } : {},
		totalChars
	};
}
function normalizedModelCallUsage(rawUsage) {
	if (!isRecord(rawUsage)) return;
	const usage = normalizeUsage(rawUsage);
	if (!usage) return;
	const promptTokens = derivePromptTokens(usage);
	return {
		...usage,
		...promptTokens !== void 0 ? { promptTokens } : {}
	};
}
function observeModelCallTerminalMessage(state, value) {
	if (!isRecord(value)) return;
	let rawUsage;
	try {
		rawUsage = value.usage;
		if (value.role === "assistant" && (value.stopReason === "error" || value.stopReason === "aborted")) state.terminalError ??= Object.assign(new Error(typeof value.errorMessage === "string" ? value.errorMessage : value.stopReason), { code: value.errorCode });
	} catch {
		return;
	}
	const usage = normalizedModelCallUsage(rawUsage);
	if (usage) state.usage = usage;
}
function observeOutputMessageContent(state, chunk) {
	if (!isRecord(chunk)) return;
	let type;
	let message;
	try {
		type = chunk.type;
		message = type === "done" ? chunk.message : type === "error" ? chunk.error : void 0;
	} catch {
		return;
	}
	if (message !== void 0) {
		observeModelCallTerminalMessage(state, message);
		if (state.contentCapture?.outputMessages) state.outputMessages = [cloneDiagnosticContentValue(message)];
	}
}
function observeResultMessageContent(state, startedAt, result) {
	state.timeToFirstByteMs ??= Math.max(0, Date.now() - startedAt);
	observeModelCallTerminalMessage(state, result);
	if (state.contentCapture?.outputMessages && state.outputMessages === void 0) state.outputMessages = [cloneDiagnosticContentValue(result)];
	if (state.responseStreamBytes === 0) {
		const bytes = utf8JsonByteLength(result);
		if (bytes !== void 0) state.responseStreamBytes = bytes;
	}
}
function isNormalizedToolCall(value) {
	if (!isRecord(value) || value.type !== "toolCall") return false;
	return typeof value.id === "string" && value.id.trim().length > 0 && typeof value.name === "string" && value.name.trim().length > 0 && isRecord(value.arguments);
}
function isSemanticModelCallResult(result) {
	try {
		if (!isRecord(result) || result.role !== "assistant" || result.stopReason === "error" || result.stopReason === "aborted" || !Array.isArray(result.content)) return false;
		return result.stopReason === "toolUse" && result.content.some(isNormalizedToolCall) || result.content.some((item) => isRecord(item) && item.type === "text" && typeof item.text === "string" && item.text.trim().length > 0);
	} catch {
		return false;
	}
}
function maybeEmitModelCallSemanticProgress(eventBase, state, result) {
	if (state.semanticProgressEmitted || !isSemanticModelCallResult(result)) return;
	state.semanticProgressEmitted = true;
	emitCoreSemanticRunProgressDiagnosticEvent({
		runId: eventBase.runId,
		...eventBase.sessionKey ? { sessionKey: eventBase.sessionKey } : {},
		...eventBase.sessionId ? { sessionId: eventBase.sessionId } : {},
		reason: MODEL_CALL_SEMANTIC_PROGRESS_REASON
	});
}
function observeResponseChunk(state, startedAt, chunk) {
 firstTextMetricChunk(state,chunk);
	state.timeToFirstByteMs ??= Math.max(0, Date.now() - startedAt);
	observeOutputMessageContent(state, chunk);
	const bytes = responseStreamChunkByteLength(chunk);
	if (bytes !== void 0) state.responseStreamBytes += bytes;
}
function maybeEmitModelCallStreamProgress(eventBase, state) {
	if (!areDiagnosticsEnabledForProcess()) return;
	const now = Date.now();
	const progressFields = {
		runId: eventBase.runId,
		...eventBase.sessionKey ? { sessionKey: eventBase.sessionKey } : {},
		...eventBase.sessionId ? { sessionId: eventBase.sessionId } : {},
		reason: MODEL_CALL_STREAM_PROGRESS_REASON
	};
	markDiagnosticRunProgress(progressFields);
	if (state.lastStreamProgressAt !== void 0 && now - state.lastStreamProgressAt < MODEL_CALL_STREAM_PROGRESS_INTERVAL_MS) return;
	state.lastStreamProgressAt = now;
	emitTrustedDiagnosticEvent({
		type: "run.progress",
		...progressFields
	});
}
function modelCallSizeTimingFields(state) {
	return {
		...state.requestPayloadBytes !== void 0 ? { requestPayloadBytes: state.requestPayloadBytes } : {},
		...state.responseStreamBytes > 0 ? { responseStreamBytes: state.responseStreamBytes } : {},
		...state.timeToFirstByteMs !== void 0 ? { timeToFirstByteMs: state.timeToFirstByteMs } : {}
	};
}
function modelCallCompletedContent(state) {
	if (!state.modelContent && !state.outputMessages) return;
	return {
		...state.modelContent,
		...state.outputMessages ? { outputMessages: state.outputMessages } : {}
	};
}
function modelCallUsageField(state) {
	return state.usage ? { usage: state.usage } : {};
}
function createModelObserver(params) {
	const modelContent = streamContextModelContentFields(params.contentCapture, params.streamContext);
	const promptStats = params.capturePromptStats ? streamContextModelPromptStats(params.streamContext) : void 0;
	const state = {
		responseStreamBytes: 0,
		modelContent,
		contentCapture: params.contentCapture,
		suppressPluginHooks: params.suppressPluginHooks
	};
	return {
		state,
		promptStats,
		modelContent,
		assignRequestPayloadBytes(payload) {
			assignRequestPayloadBytes(state, payload);
		},
		observeResponseChunk(startedAt, chunk) {
			observeResponseChunk(state, startedAt, chunk);
		},
		observeFinalResult(eventBase, startedAt, result) {
			observeResultMessageContent(state, startedAt, result);
			maybeEmitModelCallSemanticProgress(eventBase, state, result);
		},
		maybeEmitStreamProgress(eventBase) {
			maybeEmitModelCallStreamProgress(eventBase, state);
		},
		sizeTimingFields() {
			return modelCallSizeTimingFields(state);
		},
		completedContent() {
			return modelCallCompletedContent(state);
		},
		usageField() {
			return modelCallUsageField(state);
		}
	};
}
//#endregion
//#region src/agents/embedded-agent-runner/run/attempt.model-diagnostic-events.ts
const MODEL_CALL_STREAM_RETURN_TIMEOUT_MS = 1e3;
function asyncIteratorFactory(value) {
	if (value === null || typeof value !== "object") return;
	try {
		const asyncIterator = value[Symbol.asyncIterator];
		if (typeof asyncIterator !== "function") return;
		return () => asyncIterator.call(value);
	} catch {
		return;
	}
}
async function safeReturnIterator(iterator) {
	let returnResult;
	try {
		returnResult = iterator.return?.();
	} catch {
		return;
	}
	if (!returnResult) return;
	let timeout;
	try {
		await Promise.race([Promise.resolve(returnResult).catch(() => void 0), new Promise((resolve) => {
			timeout = setTimeout(resolve, MODEL_CALL_STREAM_RETURN_TIMEOUT_MS);
			const unref = typeof timeout === "object" && timeout ? timeout.unref : void 0;
			if (unref) unref.call(timeout);
		})]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}
async function* observeModelCallIterator(iterator, lifecycle) {
	let iteratorSettled = false;
	try {
		for (;;) {
			const next = await iterator.next();
			if (next.done) {
				iteratorSettled = true;
				break;
			}
			lifecycle.observer.observeResponseChunk(lifecycle.startedAt, next.value);
			lifecycle.observer.maybeEmitStreamProgress(lifecycle.eventBase);
			yield next.value;
		}
		lifecycle.emitCompleted();
	} catch (err) {
		iteratorSettled = true;
		lifecycle.emitError(err);
		throw err;
	} finally {
		if (!iteratorSettled) {
			await safeReturnIterator(iterator);
			lifecycle.emitCompleted();
		}
	}
}
function observeModelCallFinalResult(result, lifecycle) {
	lifecycle.observer.observeFinalResult(lifecycle.eventBase, lifecycle.startedAt, result);
	lifecycle.emitCompleted();
	return result;
}
function createObservedResultFunction(stream, lifecycle) {
	if (!isRecord(stream) || typeof stream.result !== "function") return;
	const resultFn = stream.result;
	return (...args) => {
		try {
			const result = resultFn.apply(stream, args);
			if (isPromiseLike(result)) return result.then((resolved) => observeModelCallFinalResult(resolved, lifecycle), (err) => {
				lifecycle.emitError(err);
				throw err;
			});
			return observeModelCallFinalResult(result, lifecycle);
		} catch (err) {
			lifecycle.emitError(err);
			throw err;
		}
	};
}
function observeModelCallStream(stream, createIterator, lifecycle) {
	const observedIterator = () => observeModelCallIterator(createIterator(), lifecycle)[Symbol.asyncIterator]();
	const observedResult = createObservedResultFunction(stream, lifecycle);
	let hasNonConfigurableIterator;
	try {
		hasNonConfigurableIterator = Object.getOwnPropertyDescriptor(stream, Symbol.asyncIterator)?.configurable === false;
	} catch {
		hasNonConfigurableIterator = true;
	}
	if (hasNonConfigurableIterator) return {
		[Symbol.asyncIterator]: observedIterator,
		...observedResult ? { result: observedResult } : {}
	};
	return new Proxy(stream, { get(target, property, receiver) {
		if (property === Symbol.asyncIterator) return observedIterator;
		if (property === "result" && observedResult) return observedResult;
		const value = Reflect.get(target, property, receiver);
		return typeof value === "function" ? value.bind(target) : value;
	} });
}
function observeModelCallResult(result, lifecycle) {
	const createIterator = asyncIteratorFactory(result);
	if (createIterator) return observeModelCallStream(result, createIterator, lifecycle);
	lifecycle.emitCompleted();
	return result;
}
/**
* Wraps a model stream function with diagnostic model-call lifecycle events,
* traceparent propagation, request/response byte accounting, optional captured
* model content, progress heartbeats, and plugin hook dispatch.
*/
function wrapStreamFnWithDiagnosticModelCallEvents(streamFn, ctx) {
	return ((model, streamContext, options) => {
		const lifecycle = createModelLifecycle({
			ctx,
			options,
			requestTimeoutMs: clampPositiveTimerTimeoutMs((isRecord(model) ? model.requestTimeoutMs : void 0) ?? ctx.requestTimeoutMs),
			createObserver: (capturePromptStats) => createModelObserver({
				streamContext,
				contentCapture: ctx.contentCapture,
				suppressPluginHooks: ctx.suppressPluginHooks,
				capturePromptStats
			})
		});
		try {
			const result = streamFn(model, streamContext, lifecycle.propagatedOptions);
			if (isPromiseLike(result)) return result.then((resolved) => observeModelCallResult(resolved, lifecycle), (err) => {
				lifecycle.emitError(err);
				throw err;
			});
			return observeModelCallResult(result, lifecycle);
		} catch (err) {
			lifecycle.emitError(err);
			throw err;
		}
	});
}
//#endregion
export { resolveEmbeddedAgentStream as i, resolveEmbeddedAgentApiKey as n, resolveEmbeddedAgentBaseStreamFn as r, wrapStreamFnWithDiagnosticModelCallEvents as t };

// v-firsttext-metrics-v2: timing only; never log payloads, credentials or reasoning.
function firstTextMetric(state, stage, extra = {}) {
 try {
  if (!state.firstTextMetricBase) return;
  const seen = state.firstTextMetricSeen ??= new Set();
  if (seen.has(stage)) return;
  seen.add(stage);
  console.error('[firsttext-metrics] '+JSON.stringify({...state.firstTextMetricBase,at:Date.now(),pid:process.pid,stage,...extra}));
 } catch {}
}
function firstTextMetricChunk(state, chunk) {
 const type=typeof chunk?.type === 'string' ? chunk.type : 'unknown';
 firstTextMetric(state,'first-decoded-event',{type});
 if(type==='text_delta' && typeof chunk.delta==='string' && chunk.delta.trim()) firstTextMetric(state,'first-nonempty-text',{chars:chunk.delta.length});
 if(type==='thinking_delta') firstTextMetric(state,'first-thinking-event');
 if(type==='toolcall_start') firstTextMetric(state,'first-tool-event');
}
