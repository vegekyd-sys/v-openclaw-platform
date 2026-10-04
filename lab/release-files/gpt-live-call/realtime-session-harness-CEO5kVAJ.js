// gpt-live-backend-call-control-v1: harness
// gpt-live-consult-continuation-v1: harness
import { createGptLiveConsultContinuationOwner } from "./gpt-live-consult-continuation.js";
import { F as resolveTimerTimeoutMs, l as asNonNegativeFiniteNumber } from "./number-coercion-CLj0HTDM.js";
import { a as asOptionalRecord, c as isRecord } from "./record-coerce-DItp3I4t.js";
import { c as normalizeOptionalLowercaseString, l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { y as uniqueStrings } from "./string-normalization-DiSb4JeN.js";
import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { a as getChildLogger } from "./logger-Dj_CBJHF.js";
import { o as emitTrustedDiagnosticEvent } from "./diagnostic-events-D_BPObBj.js";
import { n as readTrimmedStringAlias } from "./string-readers-e58-jh1A.js";
import { O as parseAgentSessionKey } from "./session-key-CRjxKW0X.js";
import { _ as resolveSessionAgentId } from "./agent-scope-CSlN0kZb.js";
import { r as normalizeCapabilityProviderId, t as buildCapabilityProviderIndex } from "./provider-registry-shared-DVSyKRD5.js";
import { c as normalizeDeliveryContext, i as hasDeliveryTargetFields, l as normalizeSessionDeliveryState, n as deliveryContextFromSession } from "./delivery-context.shared-DlcU69m_.js";
import { n as buildSessionCreationStamp, r as inheritSessionCreationPolicy } from "./session-entry-provenance-Ch9ZRplR.js";
import { i as ModelSelectionLockedError, s as isModelSelectionLocked } from "./model-overrides-Bm7jo7Di.js";
import { i as resolvePluginCapabilityProviders, r as resolvePluginCapabilityProvider } from "./capability-provider-runtime-D-IsNQEm.js";
import { n as parseSessionThreadInfoFast } from "./thread-info-DVD7Pkoa.js";
import { t as resolveConfiguredCapabilityProvider } from "./provider-selection-runtime-Cb-SFMF0.js";
import { randomUUID } from "node:crypto";
//#region src/talk/provider-types.ts
function realtimeVoiceAudioDurationMs(format, byteLength) {
	const bytesPerSample = format.encoding === "pcm16" ? 2 : 1;
	return byteLength * 1e3 / (format.sampleRateHz * format.channels * bytesPerSample);
}
function toOpenAICompatibleRealtimeAudioFormat(format) {
	return format.encoding === "pcm16" ? {
		type: "audio/pcm",
		rate: 24e3
	} : { type: "audio/pcmu" };
}
const REALTIME_VOICE_AUDIO_FORMAT_G711_ULAW_8KHZ = {
	encoding: "g711_ulaw",
	sampleRateHz: 8e3,
	channels: 1
};
const REALTIME_VOICE_AUDIO_FORMAT_PCM16_24KHZ = {
	encoding: "pcm16",
	sampleRateHz: 24e3,
	channels: 1
};
/** Normalizes OpenAI-style realtime response status details into the shared Talk contract. */
function normalizeRealtimeVoiceResponseOutcome(params) {
	const response = isRecord(params.response) ? params.response : void 0;
	const details = isRecord(response?.status_details) ? response.status_details : void 0;
	const rawError = isRecord(details?.error) ? details.error : void 0;
	const code = normalizeOptionalString(rawError?.code);
	const errorMessage = normalizeOptionalString(rawError?.message);
	const errorType = normalizeOptionalString(rawError?.type);
	const error = code || errorMessage || errorType ? {
		...code ? { code } : {},
		...errorMessage ? { message: errorMessage } : {},
		...errorType ? { type: errorType } : {}
	} : void 0;
	const reason = normalizeOptionalString(details?.reason);
	const responseId = normalizeOptionalString(response?.id) ?? normalizeOptionalString(params.responseId);
	const base = responseId ? { responseId } : {};
	switch (response?.status) {
		case "completed": return {
			...base,
			status: "completed"
		};
		case "cancelled": return {
			...base,
			status: "cancelled",
			...reason ? { reason } : {}
		};
		case "failed":
		case "incomplete": {
			const status = response.status;
			const detail = [reason, errorMessage ?? code ?? errorType].filter(Boolean).join(": ");
			return {
				...base,
				status,
				...reason ? { reason } : {},
				...error ? { error } : {},
				message: `${params.providerLabel} response ${status}${detail ? `: ${detail}` : ""}`
			};
		}
		default: {
			const rawStatus = normalizeOptionalString(response?.status);
			const detail = rawStatus ? `invalid status ${rawStatus}` : "missing terminal status";
			return {
				...base,
				status: "failed",
				reason: "invalid_response_status",
				error: {
					type: "invalid_response_status",
					message: detail
				},
				message: `${params.providerLabel} response failed: ${detail}`
			};
		}
	}
}
//#endregion
//#region src/talk/talk-events.ts
/**
* Canonical event names emitted by Talk sessions across realtime and STT/TTS flows.
*/
const TALK_EVENT_TYPES = [
	"session.started",
	"session.ready",
	"session.closed",
	"session.error",
	"session.replaced",
	"turn.started",
	"turn.ended",
	"turn.cancelled",
	"capture.started",
	"capture.stopped",
	"capture.cancelled",
	"capture.once",
	"input.audio.delta",
	"input.audio.committed",
	"transcript.delta",
	"transcript.done",
	"output.text.delta",
	"output.text.done",
	"output.audio.started",
	"output.audio.delta",
	"output.audio.done",
	"tool.call",
	"tool.progress",
	"tool.result",
	"tool.error",
	"usage.metrics",
	"latency.metrics",
	"health.changed"
];
const TURN_SCOPED_TALK_EVENT_TYPES = /* @__PURE__ */ new Set([
	"turn.started",
	"turn.ended",
	"turn.cancelled",
	"input.audio.delta",
	"input.audio.committed",
	"transcript.delta",
	"transcript.done",
	"output.text.delta",
	"output.text.done",
	"output.audio.started",
	"output.audio.delta",
	"output.audio.done",
	"tool.call",
	"tool.progress",
	"tool.result",
	"tool.error"
]);
const CAPTURE_SCOPED_TALK_EVENT_TYPES = /* @__PURE__ */ new Set([
	"capture.started",
	"capture.stopped",
	"capture.cancelled",
	"capture.once"
]);
function assertTalkEventCorrelation(input) {
	if (TURN_SCOPED_TALK_EVENT_TYPES.has(input.type) && !input.turnId?.trim()) throw new Error(`Talk event ${input.type} requires turnId`);
	if (CAPTURE_SCOPED_TALK_EVENT_TYPES.has(input.type) && !input.captureId?.trim()) throw new Error(`Talk event ${input.type} requires captureId`);
}
/**
* Creates a sequencer that stamps Talk events with stable session context and monotonic ids.
*/
function createTalkEventSequencer(context, options = {}) {
	let seq = 0;
	const now = options.now ?? (() => /* @__PURE__ */ new Date());
	return { next(input) {
		assertTalkEventCorrelation(input);
		seq += 1;
		const timestamp = input.timestamp ?? (() => {
			const value = now();
			return typeof value === "string" ? value : value.toISOString();
		})();
		return {
			...context,
			id: `${context.sessionId}:${seq}`,
			type: input.type,
			turnId: input.turnId,
			captureId: input.captureId,
			seq,
			timestamp,
			final: input.final,
			callId: input.callId,
			itemId: input.itemId,
			parentId: input.parentId,
			payload: input.payload
		};
	} };
}
//#endregion
//#region src/talk/event-metrics.ts
/**
* Shared metric extraction helpers for Talk event diagnostics and logging.
*
* Talk event payloads are provider-owned JSON blobs, so callers must coerce
* records and read only bounded numeric counters that are safe to export.
*/
/** Read the first non-negative finite number from a provider payload record. */
function firstFiniteTalkEventNumber(record, keys) {
	if (!record) return;
	for (const key of keys) {
		const value = asNonNegativeFiniteNumber(record[key]);
		if (value !== void 0) return value;
	}
}
//#endregion
//#region src/talk/diagnostics.ts
/**
* Privacy-preserving Talk diagnostic event projection.
*
* The diagnostic stream needs timing and size counters for reliability work,
* but must not export raw provider payloads, transcripts, or audio content.
*/
/** Convert a Talk event into the bounded diagnostic payload shape. */
function createTalkDiagnosticEvent(event) {
	const payload = asOptionalRecord(event.payload);
	return {
		type: "talk.event",
		sessionId: event.sessionId,
		turnId: event.turnId,
		captureId: event.captureId,
		talkEventType: event.type,
		mode: event.mode,
		transport: event.transport,
		brain: event.brain,
		provider: event.provider,
		final: event.final,
		durationMs: firstFiniteTalkEventNumber(payload, [
			"durationMs",
			"latencyMs",
			"elapsedMs"
		]),
		byteLength: firstFiniteTalkEventNumber(payload, ["byteLength", "audioBytes"])
	};
}
/** Emit a trusted internal diagnostic event for one Talk event. */
function recordTalkDiagnosticEvent(event) {
	emitTrustedDiagnosticEvent(createTalkDiagnosticEvent(event));
}
//#endregion
//#region src/talk/logging.ts
const OMITTED_TALK_LOG_EVENT_TYPES = /* @__PURE__ */ new Set([
	"input.audio.delta",
	"output.audio.delta",
	"output.text.delta",
	"transcript.delta",
	"tool.progress"
]);
const TALK_LOGGER_BINDINGS = Object.freeze({ subsystem: "talk" });
/**
* Converts high-level Talk events into compact structured log records, skipping noisy deltas.
*/
function createTalkLogRecord(event) {
	if (OMITTED_TALK_LOG_EVENT_TYPES.has(event.type)) return;
	const payload = asOptionalRecord(event.payload);
	const attributes = {
		sessionId: event.sessionId,
		talkEventType: event.type,
		talkMode: event.mode,
		talkTransport: event.transport,
		talkBrain: event.brain
	};
	if (event.provider) attributes.talkProvider = event.provider;
	if (typeof event.final === "boolean") attributes.talkFinal = event.final;
	const durationMs = firstFiniteTalkEventNumber(payload, [
		"durationMs",
		"latencyMs",
		"elapsedMs"
	]);
	if (durationMs !== void 0) attributes.talkDurationMs = durationMs;
	const byteLength = firstFiniteTalkEventNumber(payload, ["byteLength", "audioBytes"]);
	if (byteLength !== void 0) attributes.talkByteLength = byteLength;
	return {
		level: event.type === "session.error" || event.type === "tool.error" ? "warn" : "info",
		message: `talk event ${event.type}`,
		attributes
	};
}
/**
* Emits Talk logs best-effort so logging failures never break realtime audio handling.
*/
function recordTalkLogEvent(event) {
	const record = createTalkLogRecord(event);
	if (!record) return;
	try {
		const logger = getChildLogger(TALK_LOGGER_BINDINGS);
		if (record.level === "warn") {
			logger.warn(record.attributes, record.message);
			return;
		}
		logger.info(record.attributes, record.message);
	} catch {}
}
//#endregion
//#region src/talk/observability.ts
/**
* Combined Talk observability hook for relays and SDK consumers.
*
* A single Talk event should feed both trusted diagnostics and structured logs;
* this facade keeps relay call sites from choosing only one path.
*/
/** Record one Talk event through diagnostics and logging projections. */
function recordTalkObservabilityEvent(event) {
	recordTalkDiagnosticEvent(event);
	recordTalkLogEvent(event);
}
//#endregion
//#region src/talk/talk-session-controller.ts
function defaultTalkEventPayload(payload) {
	return payload === void 0 ? {} : payload;
}
/**
* Creates a per-session Talk controller that emits correlated turn and output-audio events.
*/
function createTalkSessionController(params, options = {}) {
	const { maxRecentEvents = 20, turnIdPrefix = "turn", ...context } = params;
	const sequencer = options.sequencer ?? createTalkEventSequencer(context, { now: options.now });
	const recentEvents = [];
	let activeTurnId;
	let outputAudioActive = false;
	let turnSeq = 0;
	const remember = (event) => {
		recentEvents.push(event);
		if (recentEvents.length > maxRecentEvents) recentEvents.splice(0, recentEvents.length - maxRecentEvents);
		try {
			options.onEvent?.(event);
		} catch {}
		return event;
	};
	const emit = (input) => {
		return remember(sequencer.next(input));
	};
	const resolveActiveTurn = (requestedTurnId) => {
		if (!activeTurnId) return {
			ok: false,
			reason: "no_active_turn"
		};
		const normalizedRequested = normalizeOptionalString(requestedTurnId);
		if (normalizedRequested && normalizedRequested !== activeTurnId) return {
			ok: false,
			reason: "stale_turn"
		};
		return activeTurnId;
	};
	const ensureTurn = (ensureParams = {}) => {
		if (activeTurnId) return { turnId: activeTurnId };
		return startTurn(ensureParams);
	};
	const startTurn = (startParams = {}) => {
		const turnId = normalizeOptionalString(startParams.turnId) ?? `${turnIdPrefix}-${++turnSeq}`;
		outputAudioActive = false;
		activeTurnId = turnId;
		return {
			turnId,
			event: emit({
				type: "turn.started",
				turnId,
				payload: defaultTalkEventPayload(startParams.payload)
			})
		};
	};
	const finishTurn = (type, paramsForTurn = {}) => {
		const turnId = resolveActiveTurn(paramsForTurn.turnId);
		if (typeof turnId !== "string") return turnId;
		outputAudioActive = false;
		activeTurnId = void 0;
		return {
			ok: true,
			turnId,
			event: emit({
				type,
				turnId,
				payload: defaultTalkEventPayload(paramsForTurn.payload),
				final: true
			})
		};
	};
	return {
		get activeTurnId() {
			return activeTurnId;
		},
		context,
		get outputAudioActive() {
			return outputAudioActive;
		},
		get recentEvents() {
			return recentEvents;
		},
		clearActiveTurn() {
			activeTurnId = void 0;
			outputAudioActive = false;
		},
		emit,
		ensureTurn,
		startTurn,
		endTurn(paramsForTurn) {
			return finishTurn("turn.ended", paramsForTurn);
		},
		cancelTurn(paramsForTurn) {
			return finishTurn("turn.cancelled", paramsForTurn);
		},
		finishOutputAudio(paramsForOutput = {}) {
			if (!outputAudioActive) return;
			const turnId = resolveActiveTurn(paramsForOutput.turnId);
			if (typeof turnId !== "string") return;
			outputAudioActive = false;
			return emit({
				type: "output.audio.done",
				turnId,
				payload: defaultTalkEventPayload(paramsForOutput.payload),
				final: true
			});
		},
		startOutputAudio(paramsForOutput = {}) {
			const turn = ensureTurn({
				turnId: paramsForOutput.turnId,
				payload: {}
			});
			if (outputAudioActive) return { turnId: turn.turnId };
			outputAudioActive = true;
			return {
				turnId: turn.turnId,
				event: emit({
					type: "output.audio.started",
					turnId: turn.turnId,
					payload: defaultTalkEventPayload(paramsForOutput.payload)
				})
			};
		}
	};
}
/**
* Normalizes legacy realtime transport names into Talk transport families.
*/
function normalizeTalkTransport(value) {
	const normalized = normalizeOptionalString(value);
	if (!normalized) return;
	if (normalized === "webrtc-sdp") return "webrtc";
	if (normalized === "json-pcm-websocket") return "provider-websocket";
	return normalized;
}
//#endregion
//#region src/talk/consult-question.ts
/**
* Realtime voice consult-question extraction and result summarization helpers.
*
* These utilities connect Talk tool calls to spoken follow-up answers by
* pulling human-readable questions/results out of provider-owned payloads.
*/
const REALTIME_VOICE_CONSULT_QUESTION_STOPWORDS = /* @__PURE__ */ new Set([
	"a",
	"an",
	"and",
	"are",
	"can",
	"check",
	"could",
	"for",
	"in",
	"is",
	"it",
	"look",
	"me",
	"of",
	"on",
	"or",
	"please",
	"see",
	"that",
	"the",
	"this",
	"to",
	"would",
	"you"
]);
const DEFAULT_REALTIME_VOICE_CONSULT_QUESTION_KEYS = [
	"question",
	"prompt",
	"query",
	"task"
];
const DEFAULT_REALTIME_VOICE_SPEAKABLE_RESULT_KEYS = [
	"text",
	"result",
	"output",
	"error"
];
const DEFAULT_REALTIME_VOICE_SPEAKABLE_RESULT_MAX_CHARS = 1800;
/** Read the consult question from a raw string or selected object keys. */
function readRealtimeVoiceConsultQuestion(args, keys = DEFAULT_REALTIME_VOICE_CONSULT_QUESTION_KEYS) {
	if (typeof args === "string") return normalizeOptionalString(args);
	if (!args || typeof args !== "object" || Array.isArray(args)) return;
	return readTrimmedStringAlias(args, keys);
}
/** Normalize consult questions for stable matching across punctuation/casing. */
function normalizeRealtimeVoiceConsultQuestion(value) {
	return value?.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/gu, " ").trim() || void 0;
}
/** Compare two consult questions with exact, containment, and token-overlap matching. */
function matchRealtimeVoiceConsultQuestions(left, right, options = {}) {
	const normalizedLeft = normalizeRealtimeVoiceConsultQuestion(left);
	const normalizedRight = normalizeRealtimeVoiceConsultQuestion(right);
	if (!normalizedLeft || !normalizedRight) return false;
	if (normalizedLeft === normalizedRight || normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return true;
	const leftTokens = realtimeVoiceConsultQuestionTokens(normalizedLeft);
	const rightTokens = realtimeVoiceConsultQuestionTokens(normalizedRight);
	if (leftTokens.size === 0 || rightTokens.size === 0) return false;
	let overlap = 0;
	for (const token of leftTokens) if (rightTokens.has(token)) overlap += 1;
	const minTokenOverlapCount = options.minTokenOverlapCount ?? 2;
	if (overlap < minTokenOverlapCount) return false;
	const minTokenOverlapRatio = options.minTokenOverlapRatio ?? .6;
	return overlap / Math.min(leftTokens.size, rightTokens.size) >= minTokenOverlapRatio;
}
/** Extract a bounded speakable string from a tool result payload. */
function readSpeakableRealtimeVoiceToolResult(result, options = {}) {
	if (typeof result === "string") return limitSpeakableRealtimeVoiceToolResult(result, options.maxChars);
	if (!result || typeof result !== "object" || Array.isArray(result)) return;
	const record = result;
	const keys = options.keys ?? DEFAULT_REALTIME_VOICE_SPEAKABLE_RESULT_KEYS;
	const value = readTrimmedStringAlias(record, keys);
	return value ? limitSpeakableRealtimeVoiceToolResult(value, options.maxChars) : void 0;
}
function realtimeVoiceConsultQuestionTokens(value) {
	return new Set(value.split(/[^\p{L}\p{N}]+/gu).map((token) => token.trim()).filter((token) => token.length >= 2 && !REALTIME_VOICE_CONSULT_QUESTION_STOPWORDS.has(token)));
}
function limitSpeakableRealtimeVoiceToolResult(value, maxChars = DEFAULT_REALTIME_VOICE_SPEAKABLE_RESULT_MAX_CHARS) {
	const trimmed = value.trim();
	if (!trimmed) return;
	if (trimmed.length <= maxChars) return trimmed;
	return `${truncateUtf16Safe(trimmed, Math.max(0, maxChars - 16)).trimEnd()} [truncated]`;
}
//#endregion
//#region src/talk/forced-consult-coordinator.ts
/**
* Forced-consult dedupe coordinator for realtime voice sessions.
*
* The relay may synthesize an OpenClaw consult when the model hesitates, but a
* native provider tool call can still arrive later. This coordinator prevents
* duplicate consults and keeps late native calls correlated to forced handles.
*/
const DEFAULT_REALTIME_VOICE_FORCED_CONSULT_NATIVE_DEDUPE_MS = 2e3;
const DEFAULT_REALTIME_VOICE_FORCED_CONSULT_LIMIT = 12;
/** Create an in-memory forced-consult coordinator for one realtime session. */
function createRealtimeVoiceForcedConsultCoordinator(options = {}) {
	const state = /* @__PURE__ */ new Map();
	const recentNativeConsults = [];
	let nextId = 0;
	const now = options.now ?? Date.now;
	const limit = options.limit ?? DEFAULT_REALTIME_VOICE_FORCED_CONSULT_LIMIT;
	const nativeDedupeMs = options.nativeDedupeMs ?? DEFAULT_REALTIME_VOICE_FORCED_CONSULT_NATIVE_DEDUPE_MS;
	const setTimer = options.setTimer ?? ((fn, ms) => {
		const timer = setTimeout(fn, ms);
		timer.unref?.();
		return { clear: () => clearTimeout(timer) };
	});
	const questionsMatch = options.questionsMatch ?? matchRealtimeVoiceConsultQuestions;
	const clearTimer = (stored) => {
		stored.timer?.clear();
		stored.timer = void 0;
	};
	const scheduleCleanup = (stored) => {
		stored.cleanupTimer?.clear();
		stored.cleanupTimer = setTimer(() => {
			if (state.get(stored.handle.id) === stored) state.delete(stored.handle.id);
		}, nativeDedupeMs);
	};
	const prune = () => {
		const earliestRecentNative = now() - nativeDedupeMs;
		for (let index = recentNativeConsults.length - 1; index >= 0; index -= 1) {
			const recent = recentNativeConsults[index];
			if (recent && recent.at < earliestRecentNative) recentNativeConsults.splice(index, 1);
		}
		while (recentNativeConsults.length > limit) recentNativeConsults.shift();
		while (state.size > limit) {
			const first = state.values().next().value;
			if (!first) return;
			first.timer?.clear();
			first.cleanupTimer?.clear();
			state.delete(first.handle.id);
		}
	};
	const findMatching = (question) => {
		if (!question) return;
		return [...state.values()].toReversed().find((candidate) => candidate.questions.some((candidateQuestion) => questionsMatch(candidateQuestion, question)));
	};
	const rememberStoredQuestion = (stored, question) => {
		const trimmed = question?.trim();
		if (!trimmed) return;
		if (stored.questions.some((candidate) => questionsMatch(candidate, trimmed))) return;
		stored.questions.push(trimmed);
	};
	const recordRecentNativeConsult = (question) => {
		recentNativeConsults.push({
			question,
			at: now()
		});
		prune();
	};
	const hasRecentNativeConsult = (question, recentOptions = {}) => {
		prune();
		return recentNativeConsults.toReversed().some((recent) => recent.question ? questionsMatch(recent.question, question) : recentOptions.allowUnknownQuestion === true);
	};
	const getStored = (handle) => state.get(handle.id);
	return {
		prepare(question, prepareOptions) {
			const trimmed = question.trim();
			if (!trimmed) return;
			const id = prepareOptions?.id ?? `forced-consult:${now()}:${++nextId}`;
			const existing = state.get(id);
			if (existing) {
				existing.timer?.clear();
				existing.cleanupTimer?.clear();
			}
			const handle = {
				id,
				question: trimmed,
				...prepareOptions && "context" in prepareOptions ? { context: prepareOptions.context } : {}
			};
			state.set(handle.id, {
				handle,
				createdAt: now(),
				nativeCallIds: /* @__PURE__ */ new Set(),
				questions: [trimmed],
				pending: true,
				started: false,
				delivered: false,
				cancelled: false
			});
			prune();
			return handle;
		},
		schedule(handle, delayMs, run) {
			const stored = getStored(handle);
			if (!stored || !stored.pending || stored.timer) return;
			stored.timer = setTimer(() => {
				stored.timer = void 0;
				if (state.get(handle.id) === stored && stored.pending && !stored.cancelled) run(handle);
			}, resolveTimerTimeoutMs(delayMs, 0, 0));
		},
		clearPending() {
			for (const stored of state.values()) if (stored.pending) {
				clearTimer(stored);
				state.delete(stored.handle.id);
			}
		},
		consumePending(question) {
			const pendingCandidates = [...state.values()].filter((candidate) => candidate.pending);
			const stored = !question && pendingCandidates.length === 1 ? pendingCandidates[0] : pendingCandidates.toReversed().find((candidate) => candidate.questions.some((candidateQuestion) => questionsMatch(candidateQuestion, question)));
			if (!stored?.pending) return;
			clearTimer(stored);
			stored.pending = false;
			return stored.handle;
		},
		cancelPending(handle) {
			const stored = getStored(handle);
			if (!stored?.pending) return;
			clearTimer(stored);
			stored.pending = false;
			state.delete(handle.id);
		},
		recordNativeConsult(args, nativeCallId) {
			const question = readRealtimeVoiceConsultQuestion(args);
			recordRecentNativeConsult(question);
			const pending = [...state.values()].toReversed().find((candidate) => candidate.pending && candidate.questions.some((candidateQuestion) => questionsMatch(candidateQuestion, question)));
			if (pending) {
				clearTimer(pending);
				rememberStoredQuestion(pending, question);
				if (nativeCallId) pending.nativeCallIds.add(nativeCallId);
				pending.pending = false;
				scheduleCleanup(pending);
				return {
					kind: "pending",
					question,
					handle: pending.handle
				};
			}
			const stored = findMatching(question);
			if (!stored) return {
				kind: "none",
				question
			};
			if (nativeCallId) stored.nativeCallIds.add(nativeCallId);
			rememberStoredQuestion(stored, question);
			if (stored.cancelled) return {
				kind: "already_delivered",
				question,
				handle: stored.handle
			};
			if (stored.delivered) return {
				kind: "already_delivered",
				question,
				handle: stored.handle
			};
			if (stored.started) return {
				kind: "in_flight",
				question,
				handle: stored.handle
			};
			return {
				kind: "none",
				question
			};
		},
		markStarted(handle) {
			const stored = getStored(handle);
			if (!stored) return;
			clearTimer(stored);
			stored.pending = false;
			stored.started = true;
		},
		markDelivered(handle) {
			const stored = getStored(handle);
			if (!stored) return;
			clearTimer(stored);
			stored.pending = false;
			stored.started = true;
			stored.delivered = true;
			scheduleCleanup(stored);
		},
		markCancelled(handle) {
			const stored = getStored(handle);
			if (!stored || stored.delivered) return;
			clearTimer(stored);
			stored.pending = false;
			stored.cancelled = true;
			scheduleCleanup(stored);
		},
		isCancelled(handle) {
			return getStored(handle)?.cancelled === true;
		},
		nativeCallIds(handle) {
			return [...getStored(handle)?.nativeCallIds ?? []];
		},
		handles() {
			return [...state.values()].map((stored) => stored.handle);
		},
		rememberQuestion(handle, question) {
			const stored = getStored(handle);
			if (stored) rememberStoredQuestion(stored, question);
		},
		findRecent(question) {
			prune();
			return findMatching(question)?.handle;
		},
		hasRecent(question) {
			return Boolean(findMatching(question));
		},
		hasRecentNativeConsult,
		remove(handle) {
			const stored = getStored(handle);
			stored?.timer?.clear();
			stored?.cleanupTimer?.clear();
			state.delete(handle.id);
		},
		clear() {
			for (const stored of state.values()) {
				stored.timer?.clear();
				stored.cleanupTimer?.clear();
			}
			state.clear();
			recentNativeConsults.length = 0;
		}
	};
}
//#endregion
//#region src/talk/output-activity-tracker.ts
/** Create a fresh output activity tracker for a realtime voice session. */
function createRealtimeVoiceOutputActivityTracker(options = {}) {
	const now = options.now ?? Date.now;
	let audioMs = 0;
	let chunks = 0;
	let sourceAudioBytes = 0;
	let sinkAudioBytes = 0;
	let playbackStarted = false;
	let streamEnding = false;
	let lastAudioAt;
	let playbackStartedAt;
	const snapshot = () => ({
		audioMs,
		chunks,
		sourceAudioBytes,
		sinkAudioBytes,
		playbackStarted,
		streamEnding,
		...lastAudioAt === void 0 ? {} : { lastAudioAt },
		...playbackStartedAt === void 0 ? {} : { playbackStartedAt }
	});
	return {
		markStreamOpened() {
			streamEnding = false;
			playbackStarted = false;
			playbackStartedAt = void 0;
			lastAudioAt = void 0;
		},
		markStreamEnding() {
			streamEnding = true;
		},
		markPlaybackStarted() {
			if (playbackStarted) return;
			playbackStarted = true;
			playbackStartedAt = now();
		},
		markAudio(delta) {
			audioMs += Math.max(0, delta.audioMs ?? 0);
			sourceAudioBytes += Math.max(0, delta.sourceAudioBytes ?? 0);
			sinkAudioBytes += Math.max(0, delta.sinkAudioBytes ?? 0);
			chunks += 1;
			lastAudioAt = now();
		},
		reset() {
			audioMs = 0;
			chunks = 0;
			sourceAudioBytes = 0;
			sinkAudioBytes = 0;
			playbackStarted = false;
			streamEnding = false;
			lastAudioAt = void 0;
			playbackStartedAt = void 0;
		},
		isActive(sinkActive = false) {
			return sinkActive || chunks > 0;
		},
		isInterruptible(sinkActive = false) {
			return sinkActive || chunks > 0 || audioMs > 0;
		},
		elapsedPlaybackMs() {
			return playbackStartedAt === void 0 ? 0 : now() - playbackStartedAt;
		},
		playbackWatchdogDelayMs({ marginMs, minMs = 1e3 }) {
			if (playbackStartedAt === void 0 || audioMs <= 0) return;
			return Math.max(minMs, audioMs - (now() - playbackStartedAt) + marginMs);
		},
		snapshot
	};
}
//#endregion
//#region src/talk/agent-consult-tool.ts
/**
* Realtime voice tool definition and helpers for delegating work to OpenClaw.
*
* Voice providers call this function tool when a spoken request needs normal
* agent tools, memory, workspace context, or current information before reply.
*/
/** Stable provider-facing tool name for realtime voice agent delegation. */
const REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME = "openclaw_agent_consult";
/** Closed policy set controlling whether the consult tool is exposed. */
const REALTIME_VOICE_AGENT_CONSULT_TOOL_POLICIES = [
	"safe-read-only",
	"owner",
	"none"
];
/** Shared realtime voice function-tool descriptor projected to providers. */
const REALTIME_VOICE_AGENT_CONSULT_TOOL = {
	type: "function",
	name: REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME,
	description: "Delegate the caller's request to the configured OpenClaw agent for normal tool-backed work, actions, context, memory, or reasoning before speaking.",
	parameters: {
		type: "object",
		properties: {
			question: {
				type: "string",
				description: "The complete currently authorized user goal, including all requested outputs, constraints, verified completed steps, and remaining steps relevant to this task. Do not delegate only the first step of a multi-step request. Latest explicit corrections or cancellation supersede earlier context; assistant promises do not grant authorization."
			},
			context: {
				type: "string",
				description: "Relevant user-approved context, including the overall goal and any verified completed or remaining steps from the same task. Preserve exact dates, amounts, party details, and constraints. Keep unverified statements labeled; exclude unrelated past tasks."
			},
			responseStyle: {
				type: "string",
				description: "Optional style hint for the spoken answer."
			},
			confirmationId: {
				type: "string",
				description: "Server-issued confirmation id from a prior VOICE_CONFIRMATION_REQUIRED result, supplied only after the user explicitly confirms aloud."
			}
		},
		required: ["question"]
	}
};
/** Build the interim spoken instruction while the delegated agent turn runs. */
function buildRealtimeVoiceAgentConsultWorkingResponse(audienceLabel = "person") {
	return {
		status: "working",
		tool: REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME,
		message: `Tell the ${audienceLabel} briefly that you are checking, then wait for the final OpenClaw result before answering with the actual result.`
	};
}
/** Default safe tool allowlist for voice consults in read-only mode. */
const SAFE_READ_ONLY_TOOLS = [
	"read",
	"web_search",
	"web_fetch",
	"x_search",
	"memory_search",
	"memory_get"
];
/** Type guard for user/config supplied consult tool policies. */
function isRealtimeVoiceAgentConsultToolPolicy(value) {
	return typeof value === "string" && REALTIME_VOICE_AGENT_CONSULT_TOOL_POLICIES.includes(value);
}
/** Normalize a configured consult tool policy with a caller-owned fallback. */
function resolveRealtimeVoiceAgentConsultToolPolicy(value, fallback) {
	const normalized = normalizeOptionalLowercaseString(value);
	return isRealtimeVoiceAgentConsultToolPolicy(normalized) ? normalized : fallback;
}
/** Merge the shared consult tool with provider/plugin custom realtime tools. */
function resolveRealtimeVoiceAgentConsultTools(policy, customTools = []) {
	const tools = /* @__PURE__ */ new Map();
	if (policy !== "none") tools.set(REALTIME_VOICE_AGENT_CONSULT_TOOL.name, REALTIME_VOICE_AGENT_CONSULT_TOOL);
	for (const tool of customTools) {
		const name = readRealtimeVoiceCustomToolName(tool);
		if (name !== void 0 && !tools.has(name)) tools.set(name, tool);
	}
	return [...tools.values()];
}
function readRealtimeVoiceCustomToolName(tool) {
	try {
		const name = tool.name;
		return typeof name === "string" ? name : void 0;
	} catch {
		return;
	}
}
/** Resolve the OpenClaw tool allowlist paired with the consult exposure policy. */
function resolveRealtimeVoiceAgentConsultToolsAllow(policy) {
	if (policy === "owner") return;
	if (policy === "safe-read-only") return [...SAFE_READ_ONLY_TOOLS];
	return [];
}
/** Build model instructions for when the voice agent should call the consult tool. */
function buildRealtimeVoiceAgentConsultPolicyInstructions(config) {
	if (config.toolPolicy === "none" || !config.consultPolicy || config.consultPolicy === "auto") return;
	if (config.consultPolicy === "always") return [
		"Consult behavior:",
		"- Call openclaw_agent_consult before every substantive answer.",
		"- You may answer directly only for greetings, acknowledgements, brief latency tests, or filler while waiting for the consult result.",
		"- After the consult result arrives, speak that result concisely."
	].join("\n");
	return [
		"Consult behavior:",
		"- Answer directly for greetings, acknowledgements, simple conversational glue, and brief latency tests.",
		"- Call openclaw_agent_consult before answering requests that need facts, memory, current information, tools, workspace state, or the user's OpenClaw-specific context.",
		"- Keep spoken replies concise and natural."
	].join("\n");
}
/** Build the shared instructions for a realtime voice agent session. */
function buildRealtimeVoiceSessionInstructions(params) {
	if (params.isAgentProxy) return [
		params.base,
		params.bootstrapContextInstructions?.trim(),
		"Mode: OpenClaw agent proxy.",
		"You are the realtime voice surface for the same OpenClaw agent the user can message directly.",
		"Do not mention a backend, supervisor, helper, or separate system. Present the result as your own work.",
		"Delegate substantive requests, actions, tool work, current facts, memory, workspace context, and user-specific context with openclaw_agent_consult.",
		"Do not block, refuse, or downscope at the voice layer. Delegate to OpenClaw and treat its result as authoritative.",
		"Answer directly only for greetings, acknowledgements, brief latency tests, or filler while waiting.",
		"While waiting for OpenClaw data or tool results, use at most one short natural backchannel such as \"yeah\", \"mm-hmm\", \"got it\", or \"one sec\"; vary it and do not treat it as the final answer.",
		"When OpenClaw sends an internal exact answer to speak, do not call tools. Say only that answer.",
		buildRealtimeVoiceAgentConsultPolicyInstructions({
			toolPolicy: params.toolPolicy,
			consultPolicy: params.consultPolicy
		})
	].join("\n\n");
	return [
		params.base,
		params.bootstrapContextInstructions?.trim(),
		"While waiting for OpenClaw data or tool results, use at most one short natural backchannel such as \"yeah\", \"mm-hmm\", \"got it\", or \"one sec\"; vary it and do not treat it as the final answer.",
		buildRealtimeVoiceAgentConsultPolicyInstructions({
			toolPolicy: params.toolPolicy,
			consultPolicy: params.consultPolicy
		})
	].filter(Boolean).join("\n\n");
}
/** Parse provider-owned consult tool arguments into the normalized contract. */
function parseRealtimeVoiceAgentConsultArgs(args) {
	const question = readConsultStringArg(args, "question") ?? readConsultStringArg(args, "prompt") ?? readConsultStringArg(args, "query") ?? readConsultStringArg(args, "task");
	if (!question) throw new Error("question required");
	const context = readConsultStringArg(args, "context");
	const responseStyle = readConsultStringArg(args, "responseStyle");
	const confirmationId = readConsultStringArg(args, "confirmationId");
	return {
		question,
		context,
		responseStyle,
		...confirmationId ? { confirmationId } : {}
	};
}
/** Build the plain chat message used by browser/chat forwarding paths. */
function buildRealtimeVoiceAgentConsultChatMessage(args) {
	const parsed = parseRealtimeVoiceAgentConsultArgs(args);
	return [
		parsed.question,
		parsed.context ? `Context:\n${parsed.context}` : void 0,
		parsed.responseStyle ? `Spoken style:\n${parsed.responseStyle}` : void 0
	].filter(Boolean).join("\n\n");
}
/** Build the delegated OpenClaw agent prompt for a live voice consult. */
function buildRealtimeVoiceAgentConsultPrompt(params) {
	const parsed = parseRealtimeVoiceAgentConsultArgs(params.args);
	const assistantLabel = params.assistantLabel ?? "Agent";
	const questionSourceLabel = params.questionSourceLabel ?? params.userLabel.toLowerCase();
	const transcript = params.transcript.slice(-12).map((entry) => `${entry.role === "assistant" ? assistantLabel : params.userLabel}: ${entry.text}`).join("\n");
	return [
		`Live voice request from the ${questionSourceLabel} during ${params.surface}.`,
		"Act as the configured OpenClaw agent on behalf of this user. Use available tools when the request asks you to do work.",
		"Task completion boundary: Own the complete currently authorized user goal, not just its first substep. Preserve the supplied question and context, all requested outputs, constraints, and exact dates or amounts. Use relevant earlier user-approved context to resolve a continuation request, while applying the latest explicit corrections or cancellation. An assistant promise is not user authorization; do not broaden the task or infer permission to book, pay, publish, or send.",
		"执行前核对：以完整 User request 和最新明确修正为准，在内部逐项对应“用户原句步骤→指定执行者→前置完成证据”。明确要求先后时，前一步真实完成后才开始下一步，不并行替代。用户要求同一个子任务执行的有序步骤，必须在首次交办时作为一个完整任务交给单次 sessions_spawn：spawn.task 原样保留当前有效步骤的用户原句、精确命令、等待和后续动作，以及已授权的公开阶段事实播报；不得截成首步或把后续步骤留给父任务或另一子任务。已受理则沿原任务继续，不重复创建。用实际工具和子任务结果核对执行者、顺序与来源；不符或缺证据时只报告已证实部分和未满足约束，不得称整体或指定子任务全部成功，也不得把父任务补做的结果改称子任务结果。",
		"Voice 子任务阶段契约：若交办子任务，spawn.task 必须继承本次有效的完整目标、指定执行者、步骤依赖、公开范围，以及用户要求的阶段事实和最终输出。若用户要求阶段播报，明确交给子任务：成功取得该阶段已授权公开的结果后，先用一条简短完整的公开 commentary/preamble 给出实际值及其主体、单位或时区，再调用后续工具继续同一任务；不要等整个任务结束才公开，也不要以 Step done、正在等待或轮询计划替代实际事实。未取得或不允许公开的值不要猜测或披露。父任务核对是否已交办这些要求；已受理后沿原任务继续，不为补播创建替代任务。",
		"After a verified intermediate result, emit the requested short public fact, then actually call the next required tool or continue the remaining work in this same run. Without a requested stage update, one short verified fact is optional. Commentary is a progress update, not a final answer or a pause for the caller to say continue. Keep working while the voice layer speaks it. Do not end the run, ask whether to proceed again, or claim you are continuing when authorized steps remain executable.",
		"Use final-answer output only when all requested outputs have been verified, or when a specific genuine blocker, explicit cancellation, or limit prevents completion. Before final, check the complete goal against what you actually verified; identify any missing outputs and the concrete blocker honestly. A result for one step and a promise to do the next step are not completion. If work is still running in accepted child tasks, use the actual supported yield/continuation mechanism rather than a final answer; never invent a child, yield, active state, or result.",
		"Public stage updates should report new verified facts only, at most one short fact per 15 seconds; the caller requesting progress does not require continuous waiting speech. Do not expose private reasoning, raw tool output, or repeated plans. Preserve final values and report missing evidence explicitly.",
		"Final result selection: Return the requested outputs in the user language, as concise labeled conclusions grounded in their actual tool results. Preserve the association between each requested output and its source command, query, date, party, currency, and unit. If multiple checks produced different values, keep them distinct; a later or more readable value is not permission to replace the specified source result. For an exact command result, report that command's exact returned value, not a nearby verification command or a separate time sample. For comparisons, compare like-for-like inputs and explicitly identify unmatched samples. Do not include unrelated raw outputs, epoch values, session identifiers, or execution metadata unless the user asked for them. If the requested source is missing or inconsistent, state that limitation instead of choosing another sample.",
		"实名归属：涉及多个人的职责和关系时，结果按“姓名或源结果中的明确角色：该主体的职责；与另一实名主体的关系”逐项输出，每项对应源结果中的实际主体。不要用‘你/他们’替代已知姓名或角色，也不要把一个主体的职责或关系移给另一个主体。源卡只说明一个人的组织或职责，不代表已证实其与提问者或另一个人的关系；缺少明确关系证据时，按授权范围扩展检索，仍无证据则标为未核实，推断必须明示为推断。主体或关系无法确认就标为未核实；不因其他步骤完成而补齐此事实。",
		"Source verification: Search summaries, synthesized search answers, snippets, and their citation lists are discovery leads, not verified primary-source content. For official documentation, current API behavior, or best practices, actually fetch and read the relevant primary pages before stating their claims. A fetched page title or URL is not evidence for a control. If the returned page is truncated or lacks the supporting section, locate and read that primary section within the authorized task before claiming the corresponding behavior was verified; otherwise report it as unverified. Check the exact product, version, transport, event name, and configuration hierarchy; do not treat an SDK convenience event as a wire event or apply one transport's behavior to every transport. Preserve the source's product and model applicability, only/except conditions, exact versions and units; a scoped claim is not evidence for every model or mode. GPT Live and Realtime are distinct interfaces; do not infer available GPT Live controls from Realtime documentation. If the primary content cannot be obtained or does not support the claim, say what remains unverified rather than presenting the search synthesis as official guidance.",
		"Read-only source retrieval: When a truncated web_fetch result points to a private spill file, use the available read tool to inspect the needed section. Read the source as data; do not execute it. A shell pipeline is not necessary for reading that file and can require separate voice confirmation. If the actual core returns VOICE_CONFIRMATION_REQUIRED, the action was not executed: report the concrete paused action and wait for the core-validated explicit spoken confirmation; do not evade its policy or invent approval.",
		"For a multi-step task, after receiving a real, verified intermediate result, report it in a short, complete public assistant sentence or public preamble before starting the next slow step or delegating further work.",
		"Ground public progress in results you have actually received. Distinguish a plan or request receipt from a verified fact, and distinguish an intermediate result from task completion. Do not guess missing facts or announce success before verification. Do not send spoken waiting filler or repeated plans before a result. After a verified result, send at most one concise stage sentence; keep longer explanations for the final.",
		"If you yield while background work continues, include any already confirmed public stage results in the public yield acknowledgment so the live voice conversation can report them while waiting. Keep all public progress concise and speakable; never expose raw tool output, tool logs, or private reasoning.",
		"When finished, return only the concise result the realtime voice agent should speak back.",
		"Do not include markdown, tool logs, or private reasoning. Include citations only when the spoken answer needs them.",
		parsed.responseStyle ? `Spoken style: ${parsed.responseStyle}` : void 0,
		transcript ? `Recent voice transcript for context:\n${transcript}` : void 0,
		parsed.context ? `Additional realtime context:\n${parsed.context}` : void 0,
		`User request:\n${parsed.question}`
	].filter(Boolean).join("\n\n");
}
/** Collect only visible answer text from streamed delegated-agent payloads. */
function collectRealtimeVoiceAgentConsultVisibleText(payloads) {
	const chunks = [];
	for (const payload of payloads) {
		if (payload.isError || payload.isReasoning || payload.isCommentary) continue;
		const text = normalizeOptionalString(payload.text);
		if (text) chunks.push(text);
	}
	return chunks.length > 0 ? chunks.join("\n\n").trim() : null;
}
function readConsultStringArg(args, key) {
	if (!args || typeof args !== "object" || Array.isArray(args)) return;
	return normalizeOptionalString(args[key]);
}
//#endregion
//#region src/talk/agent-consult-runtime.ts
/**
* Sender-auth contract revision for official realtime voice plugins.
*
* Revision 1 forwards ingress-authenticated `senderId` and `senderIsOwner` unchanged. Ingress
* owns authentication; consumers that require this handoff must fail closed on other revisions.
*/
const REALTIME_VOICE_AGENT_CONSULT_SENDER_AUTH_VERSION = 1;
/**
* Fails closed when a realtime consult would cross a model-selection lock.
*/
function assertRealtimeVoiceAgentConsultModelSelectionUnlocked(params) {
	const candidates = /* @__PURE__ */ new Map();
	const remember = (sessionKey, fallbackAgentId, storePath) => {
		const candidateAgentId = parseAgentSessionKey(sessionKey)?.agentId ?? fallbackAgentId;
		const candidateStorePath = storePath ?? params.agentRuntime.session.resolveStorePath(params.cfg.session?.store, { agentId: candidateAgentId });
		candidates.set(`${candidateStorePath}\u0000${sessionKey}`, {
			agentId: candidateAgentId,
			sessionKey,
			storePath: candidateStorePath
		});
	};
	remember(params.sessionKey, params.agentId, params.storePath);
	const requesterSessionKey = params.spawnedBy?.trim();
	if (requesterSessionKey) {
		const requesterAgentId = parseAgentSessionKey(requesterSessionKey)?.agentId ?? params.agentId;
		remember(requesterSessionKey, requesterAgentId);
		const { baseSessionKey } = parseSessionThreadInfoFast(requesterSessionKey);
		if (baseSessionKey && baseSessionKey !== requesterSessionKey) remember(baseSessionKey, requesterAgentId);
	}
	for (const { agentId, sessionKey, storePath } of candidates.values()) {
		const entry = params.agentRuntime.session.getSessionEntry({
			agentId,
			storePath,
			sessionKey,
			readConsistency: "latest"
		});
		if (isModelSelectionLocked(entry)) throw new ModelSelectionLockedError();
	}
}
function resolveRealtimeVoiceAgentSandboxSessionKey(agentId, sessionKey) {
	const trimmed = sessionKey.trim();
	if (trimmed.toLowerCase().startsWith("agent:")) return trimmed;
	return `agent:${agentId}:${trimmed}`;
}
function resolveDeliverySessionFields(context) {
	const normalized = normalizeDeliveryContext(context);
	if (!normalized?.channel || !normalized.to) return {};
	return { delivery: normalizeSessionDeliveryState({ context: normalized }) };
}
function resolveRealtimeVoiceAgentDeliveryContext(params) {
	const requesterSessionKey = params.spawnedBy?.trim();
	try {
		const candidates = [];
		if (requesterSessionKey) {
			const { baseSessionKey } = parseSessionThreadInfoFast(requesterSessionKey);
			for (const key of [requesterSessionKey, baseSessionKey]) if (key) candidates.push({ sessionKey: key });
		}
		candidates.push({
			sessionKey: params.sessionKey,
			storePath: params.storePath
		});
		for (const candidate of candidates) {
			const agentId = parseAgentSessionKey(candidate.sessionKey)?.agentId ?? params.agentId;
			const storePath = candidate.storePath ?? params.agentRuntime.session.resolveStorePath(params.cfg.session?.store, { agentId });
			const entry = params.agentRuntime.session.getSessionEntry({
				agentId,
				storePath,
				sessionKey: candidate.sessionKey
			});
			const context = deliveryContextFromSession(entry);
			if (hasDeliveryTargetFields(context)) return context;
		}
	} catch {}
}
async function resolveRealtimeVoiceAgentConsultSessionEntry(params) {
	const now = Date.now();
	const deliveryFields = resolveDeliverySessionFields(params.deliveryContext);
	const requesterSessionKey = params.spawnedBy?.trim();
	const requesterAgentId = parseAgentSessionKey(requesterSessionKey)?.agentId;
	const requesterEntry = requesterSessionKey ? params.agentRuntime.session.getSessionEntry({
		agentId: requesterAgentId ?? params.agentId,
		storePath: params.agentRuntime.session.resolveStorePath(params.cfg.session?.store, { agentId: requesterAgentId ?? params.agentId }),
		sessionKey: requesterSessionKey,
		readConsistency: "latest"
	}) : void 0;
	const creationStamp = buildSessionCreationStamp({
		via: "talk",
		...inheritSessionCreationPolicy(requesterEntry, requesterSessionKey ? {
			type: "agent",
			id: requesterSessionKey
		} : void 0)
	});
	const shouldFork = params.contextMode === "fork" && requesterSessionKey && (!requesterAgentId || requesterAgentId === params.agentId);
	let forkDecisionWarning;
	let patched = null;
	if (shouldFork) {
		const { forkSessionEntryFromParent } = await import("./session-fork-wXS25ZS0.js");
		const forked = await forkSessionEntryFromParent({
			storePath: params.storePath,
			parentSessionKey: requesterSessionKey,
			agentId: params.agentId,
			config: params.cfg,
			sessionKey: params.sessionKey,
			fallbackEntry: {
				...creationStamp,
				sessionId: "",
				updatedAt: now
			},
			skipForkWhen: (entry) => Boolean(entry.sessionId?.trim()),
			skipPatch: () => ({
				...deliveryFields,
				updatedAt: now
			}),
			patch: () => ({
				...deliveryFields,
				spawnedBy: requesterSessionKey,
				updatedAt: now
			})
		});
		if (forked.status === "forked" || forked.status === "skipped") {
			if (forked.status === "skipped" && forked.decision?.status === "skip") forkDecisionWarning = forked.decision.message;
			if (forked.sessionEntry.sessionId?.trim()) patched = forked.sessionEntry;
		}
	}
	patched ??= await params.agentRuntime.session.patchSessionEntry({
		agentId: params.agentId,
		storePath: params.storePath,
		sessionKey: params.sessionKey,
		fallbackEntry: {
			...creationStamp,
			sessionId: "",
			updatedAt: now
		},
		update: async (entry) => {
			if (entry.sessionId?.trim()) return {
				...deliveryFields,
				updatedAt: now
			};
			return {
				...deliveryFields,
				sessionId: randomUUID(),
				...requesterSessionKey ? { spawnedBy: requesterSessionKey } : {},
				updatedAt: now
			};
		}
	});
	if (forkDecisionWarning) params.logger.warn(`[talk] ${forkDecisionWarning}`);
	if (patched?.sessionId?.trim()) return patched;
	throw new Error("realtime voice agent consult session could not be initialized");
}
/**
* Runs an embedded agent consult and returns concise speakable text for realtime voice playback.
*/
// gpt-live-consult-progress-v1: public replies only; never reasoning.
function createGptLiveConsultProgressObserver({ onProgress, abortSignal, logger, runId }) {
  let closed = false;
  let sequence = 0;
  let lastPublicSnapshot = "";
  let lastPublicDeliveredLength = 0;
  const previousTextBySource = new Map();
  const deliveredLengthBySource = new Map();
  const normalize = (text) => text.replace(/\s+/gu, " ").trim();
  // Keep unfinished dates, numbers and statements together. A public hook is
  // not evidence that its current token already forms a speakable fact.
  const completePrefixLength = (text, messageComplete) => {
    let boundary = 0;
    const closing = /["'\u2019\u201d\u300d\u300f\uff09)\]}]/u;
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (character === "\n" && /^\n[\t \r]*\n/u.test(text.slice(index))) {
        boundary = index + text.slice(index).match(/^\n[\t \r]*\n/u)[0].length;
        continue;
      }
      if (!"。？！?!.".includes(character)) continue;
      if (character === ".") {
        const previous = text[index - 1] ?? "";
        const next = text[index + 1] ?? "";
        if (/\p{N}/u.test(previous) && /\p{N}/u.test(next)) continue;
        if (next && !/\s/u.test(next) && !closing.test(next) && !".?!".includes(next)) continue;
        // A trailing "1." may still become "1.25" on the next delta.
        if (!next && /\p{N}/u.test(previous) && !messageComplete) continue;
      }
      let end = index + 1;
      while (end < text.length && ("。？！?!.".includes(text[end]) || closing.test(text[end]))) end++;
      boundary = end;
      index = end - 1;
    }
    return normalize(text.slice(0, boundary)).length;
  };
  const reportFailure = (error) => {
    try {
      logger?.warn?.(`[talk] public consult progress failed: ${error instanceof Error ? error.message : String(error)}`);
    } catch {}
  };
  const observe = (source, value, messageComplete = false, itemId) => {
    if (closed || abortSignal?.aborted || typeof onProgress !== "function") return false;
    // Retain trailing paragraph whitespace until after boundary detection.
    const text = typeof value === "string" ? value.trimStart() : "";
    const previousText = previousTextBySource.get(source) ?? "";
    const publicSnapshot = normalize(text);
    if (!publicSnapshot) return false;
    const previousSnapshot = normalize(previousText);
    let deliveredLength = publicSnapshot.startsWith(previousSnapshot) ? deliveredLengthBySource.get(source) ?? 0 : 0;
    previousTextBySource.set(source, text);
    // Native public replies and builtin public preambles can reconcile the
    // same cumulative message through different hooks with different IDs.
    // Share their already delivered prefix, including a mirror followed by
    // a genuine extension. Each source still advances its own cursor.
    if (publicSnapshot.startsWith(lastPublicSnapshot)) deliveredLength = Math.max(deliveredLength, lastPublicDeliveredLength);
    deliveredLengthBySource.set(source, deliveredLength);
    lastPublicSnapshot = publicSnapshot;
    lastPublicDeliveredLength = deliveredLength;
    const completeLength = completePrefixLength(text, messageComplete);
    if (completeLength <= deliveredLength) return false;
    const progressText = publicSnapshot.slice(deliveredLength, completeLength).trim();
    deliveredLengthBySource.set(source, completeLength);
    lastPublicDeliveredLength = completeLength;
    // Late closing quotes or punctuation must not become standalone speech.
    if (!progressText || !/[\p{L}\p{N}]/u.test(progressText)) return false;
    try {
      const pending = onProgress({ text: progressText, kind: "commentary", ...(runId ? {
        provenance: { emittedAt: Date.now(), sequence: ++sequence, runId, source,
          ...(typeof itemId === "string" && itemId ? { itemId } : {}) },
      } : {}) });
      if (pending && typeof pending.then === "function") Promise.resolve(pending).catch(reportFailure);
    } catch (error) {
      reportFailure(error);
    }
    // This observes progress; it does not claim successful final reply delivery.
    return false;
  };
  return {
    onPartialReply: (payload) => {
      // An unfinished or unphased assistant answer is not a progress fact.
      // Native late phase reconciliation reaches onAgentEvent as a preamble;
      // final/legacy text remains available through the canonical final path.
      if (payload?.isReasoning || payload?.phase !== "commentary") return false;
      return observe("reply", payload?.text, false, payload?.itemId);
    },
    onAgentEvent: (event) => {
      const data = event?.data;
      if (event?.stream !== "item" || data?.kind !== "preamble" || data?.isReasoning || data.phase !== "update" && data.phase !== "end") return false;
      return observe(`preamble:${typeof data.itemId === "string" ? data.itemId : ""}`, data.progressText, data.phase === "end", data.itemId);
    },
    close: () => { closed = true; },
  };
}
async function consultRealtimeVoiceAgent(params) {
	params.abortSignal?.throwIfAborted();
	const [{ beginSessionWorkAdmission }, { resolveSessionWorkStartError }] = await Promise.all([import("./session-lifecycle-admission-DCnoxd2o.js"), import("./lifecycle-7GS52a1a.js")]);
	params.abortSignal?.throwIfAborted();
	const agentId = params.agentId ?? resolveSessionAgentId({
		config: params.cfg,
		sessionKey: params.sessionKey
	});
	const agentDir = params.agentRuntime.resolveAgentDir(params.cfg, agentId);
	const workspaceDir = params.agentRuntime.resolveAgentWorkspaceDir(params.cfg, agentId);
	const storePath = params.storePath ?? params.agentRuntime.session.resolveStorePath(params.cfg.session?.store, { agentId });
	const initialSessionEntry = params.agentRuntime.session.getSessionEntry({
		agentId,
		storePath,
		sessionKey: params.sessionKey,
		readConsistency: "latest"
	});
	const modelLockParams = {
		cfg: params.cfg,
		agentRuntime: params.agentRuntime,
		agentId,
		sessionKey: params.sessionKey,
		spawnedBy: params.spawnedBy,
		storePath
	};
	assertRealtimeVoiceAgentConsultModelSelectionUnlocked(modelLockParams);
	const lifecycleAbortController = new AbortController();
	const sessionWorkAdmission = await beginSessionWorkAdmission({
		scope: storePath,
		identities: [params.sessionKey, initialSessionEntry?.sessionId],
		onInterrupt: () => lifecycleAbortController.abort(/* @__PURE__ */ new Error("Realtime voice agent consult interrupted by a session lifecycle change.")),
		assertAllowed: () => {
			const currentEntry = params.agentRuntime.session.getSessionEntry({
				agentId,
				storePath,
				sessionKey: params.sessionKey,
				readConsistency: "latest"
			});
			if (initialSessionEntry ? !currentEntry || currentEntry.sessionId !== initialSessionEntry.sessionId : Boolean(currentEntry)) throw new Error(`Session "${params.sessionKey}" changed while starting work. Retry.`);
			const archivedSessionError = resolveSessionWorkStartError(params.sessionKey, currentEntry);
			if (archivedSessionError) throw new Error(archivedSessionError);
			assertRealtimeVoiceAgentConsultModelSelectionUnlocked(modelLockParams);
		}
	});
	const abortFromCaller = () => lifecycleAbortController.abort(params.abortSignal?.reason);
	if (params.abortSignal?.aborted) abortFromCaller();
	else params.abortSignal?.addEventListener("abort", abortFromCaller, { once: true });
	try {
		const consultResult = await sessionWorkAdmission.run(async () => {
			await params.agentRuntime.ensureAgentWorkspace({ dir: workspaceDir });
			const resolvedDeliveryContext = resolveRealtimeVoiceAgentDeliveryContext({
				cfg: params.cfg,
				agentRuntime: params.agentRuntime,
				agentId,
				storePath,
				sessionKey: params.sessionKey,
				spawnedBy: params.spawnedBy
			});
			const sessionEntry = await resolveRealtimeVoiceAgentConsultSessionEntry({
				agentId,
				cfg: params.cfg,
				sessionKey: params.sessionKey,
				spawnedBy: params.spawnedBy,
				contextMode: params.contextMode,
				deliveryContext: resolvedDeliveryContext,
				storePath,
				agentRuntime: params.agentRuntime,
				logger: params.logger
			});
			const consultDeliveryContext = resolvedDeliveryContext ?? deliveryContextFromSession(sessionEntry);
			const sessionId = sessionEntry.sessionId;
			assertRealtimeVoiceAgentConsultModelSelectionUnlocked(modelLockParams);
			const runId = `${params.runIdPrefix}:${Date.now()}:${randomUUID()}`;
			const timeoutMs = params.timeoutMs ?? params.agentRuntime.resolveAgentTimeoutMs({ cfg: params.cfg });
			const runRegistration = params.onRunStarted?.({
				runId,
				sessionId,
				timeoutMs
			});
			const abortSignal = runRegistration?.abortSignal ? AbortSignal.any([lifecycleAbortController.signal, runRegistration.abortSignal]) : lifecycleAbortController.signal;
			const continuationOwner = createGptLiveConsultContinuationOwner({
				continuationContext: params.continuationContext, runId, sessionId, sessionKey: params.sessionKey, agentId,
				isSessionCurrent: () => params.agentRuntime.session.getSessionEntry({ agentId, storePath, sessionKey: params.sessionKey, readConsistency: "latest" })?.sessionId === sessionId,
				abortSignal: params.abortSignal ? AbortSignal.any([abortSignal, params.abortSignal]) : abortSignal, timeoutMs, runRegistration, onProgress: params.onProgress,
				onResumeRunStarted: params.onResumeRunStarted, onResumeExecutionStarted: params.onResumeExecutionStarted, collectVisibleText: collectRealtimeVoiceAgentConsultVisibleText, logger: params.logger
			});
			const executionAbortSignal = continuationOwner ? AbortSignal.any([abortSignal, continuationOwner.signal]) : abortSignal;
			const progressObserver = createGptLiveConsultProgressObserver({ onProgress: continuationOwner ? continuationOwner.onProgress : params.onProgress, abortSignal: executionAbortSignal, logger: params.logger, runId });
			const result = await params.agentRuntime.runEmbeddedAgent({
				sessionId,
				sessionKey: params.sessionKey,
				sessionTarget: {
					agentId,
					sessionId,
					sessionKey: params.sessionKey,
					storePath
				},
				sandboxSessionKey: resolveRealtimeVoiceAgentSandboxSessionKey(agentId, params.sessionKey),
				agentId,
				spawnedBy: params.spawnedBy,
				senderId: params.senderId,
				senderIsOwner: params.senderIsOwner,
				messageProvider: consultDeliveryContext?.channel ?? params.messageProvider,
				agentAccountId: consultDeliveryContext?.accountId,
				messageTo: consultDeliveryContext?.to,
				messageThreadId: consultDeliveryContext?.threadId,
				currentChannelId: consultDeliveryContext?.to,
				currentThreadTs: consultDeliveryContext?.threadId != null ? String(consultDeliveryContext.threadId) : void 0,
				workspaceDir,
				config: params.cfg,
				prompt: buildRealtimeVoiceAgentConsultPrompt({
					args: params.args,
					transcript: params.transcript,
					surface: params.surface,
					userLabel: params.userLabel,
					assistantLabel: params.assistantLabel,
					questionSourceLabel: params.questionSourceLabel
				}),
				provider: params.provider,
				model: params.model,
				thinkLevel: params.thinkLevel ?? "high",
				fastMode: params.fastMode,
				verboseLevel: "off",
				reasoningLevel: "off",
				toolResultFormat: "plain",
				toolsAllow: params.toolsAllow,
				// No schema is inherited by child/resume dispatches. Its callbacks are
				// process-local in the exact continuation owner, never IPC tool args.
				...(continuationOwner && params.continuationContext?.callControl ? {
					clientTools: [params.continuationContext.callControl.tool],
				} : {}),
				timeoutMs,
				runId,
				lane: params.lane,
				extraSystemPrompt: params.extraSystemPrompt ?? "You are the configured OpenClaw agent receiving delegated requests from a live voice bridge. Act on behalf of the user, use available tools when appropriate, and return a brief speakable result.",
				agentDir,
				abortSignal: executionAbortSignal,
				onPartialReply: progressObserver.onPartialReply,
				onAgentEvent: progressObserver.onAgentEvent
			}).catch((error) => {
				continuationOwner?.abort(error);
				throw error;
			}).finally(() => {
				progressObserver.close();
				if (!continuationOwner) runRegistration?.cleanup?.();
			});
			if (continuationOwner) {
				continuationOwner.finishInitial(result);
				return { continuationOwner };
			}
			const text = collectRealtimeVoiceAgentConsultVisibleText(result.payloads ?? []);
			if (!text) {
				const reason = result.meta?.aborted ? "agent run aborted" : "agent returned no speakable text";
				params.logger.warn(`[talk] agent consult produced no answer: ${reason}`);
				return { text: params.fallbackText ?? "I need a moment to verify that before answering." };
			}
			return { text };
		});
		// Return the promise without awaiting here: turn admission must release after yield.
		return consultResult.continuationOwner ? consultResult.continuationOwner.wait() : consultResult;
	} finally {
		params.abortSignal?.removeEventListener("abort", abortFromCaller);
		sessionWorkAdmission.release();
	}
}
//#endregion
//#region src/talk/agent-talkback-runtime.ts
const MAX_PENDING_QUESTIONS = 32;
const MAX_PENDING_QUESTION_CHARS = 32768;
/** Create a serial consult queue for realtime transcript talkback. */
function createRealtimeVoiceAgentTalkbackQueue(params) {
	let active = false;
	let closed = false;
	let pendingQuestions = [];
	let pendingQuestionChars = 0;
	let overflowWarned = false;
	let debounceTimer;
	let activeAbortController;
	const shouldStop = () => closed || params.isStopped();
	const clearDebounceTimer = () => {
		if (!debounceTimer) return;
		clearTimeout(debounceTimer);
		debounceTimer = void 0;
	};
	const appendPendingQuestion = (next) => {
		const current = pendingQuestions.at(-1);
		const mergeWithCurrent = current !== void 0 && Object.is(current.metadata, next.metadata);
		const addedChars = next.question.length + (mergeWithCurrent ? 1 : 0);
		const exceedsQuestionLimit = !mergeWithCurrent && pendingQuestions.length >= MAX_PENDING_QUESTIONS;
		const exceedsCharacterLimit = pendingQuestionChars + addedChars > MAX_PENDING_QUESTION_CHARS;
		if (exceedsQuestionLimit || exceedsCharacterLimit) {
			if (!overflowWarned) {
				overflowWarned = true;
				params.logger.warn(`${params.logPrefix} consult queue full: droppedChars=${next.question.length} queued=${pendingQuestions.length} queuedChars=${pendingQuestionChars}`);
			}
			return false;
		}
		if (current && mergeWithCurrent) current.question = `${current.question}\n${next.question}`;
		else pendingQuestions.push(next);
		pendingQuestionChars += addedChars;
		return true;
	};
	const shiftPendingQuestion = () => {
		const next = pendingQuestions.shift();
		if (!next) return;
		pendingQuestionChars -= next.question.length;
		if (pendingQuestions.length === 0) overflowWarned = false;
		return next;
	};
	const clearPendingQuestions = () => {
		pendingQuestions = [];
		pendingQuestionChars = 0;
		overflowWarned = false;
	};
	const run = async (pending) => {
		const trimmed = pending.question.trim();
		if (!trimmed || shouldStop()) return;
		if (active) {
			appendPendingQuestion({
				question: trimmed,
				metadata: pending.metadata
			});
			return;
		}
		active = true;
		let nextQuestion = {
			question: trimmed,
			metadata: pending.metadata
		};
		let consultStartedAt;
		try {
			while (nextQuestion) {
				if (shouldStop()) return;
				const currentQuestion = nextQuestion;
				consultStartedAt = Date.now();
				params.logger.info(`${params.logPrefix} consult: chars=${currentQuestion.question.length} queued=${pendingQuestions.length}`);
				activeAbortController = new AbortController();
				const result = await params.consult({
					question: currentQuestion.question,
					metadata: currentQuestion.metadata,
					responseStyle: params.responseStyle,
					signal: activeAbortController.signal
				});
				activeAbortController = void 0;
				const text = result.text.trim();
				params.logger.info(`${params.logPrefix} consult done: elapsedMs=${Date.now() - consultStartedAt} answerChars=${text.length} queued=${pendingQuestions.length}`);
				if (!shouldStop() && text) params.deliver(text);
				nextQuestion = shiftPendingQuestion();
			}
		} catch (error) {
			activeAbortController = void 0;
			if (shouldStop() || isAbortError(error)) return;
			const message = error instanceof Error ? error.message : String(error);
			const elapsedDetail = consultStartedAt === void 0 ? "" : ` elapsedMs=${Date.now() - consultStartedAt}`;
			params.logger.warn(`${params.logPrefix} consult failed:${elapsedDetail} ${message}`);
			params.deliver(params.fallbackText);
		} finally {
			active = false;
			if (shouldStop()) clearPendingQuestions();
			else {
				const queuedQuestion = shiftPendingQuestion();
				if (queuedQuestion) run(queuedQuestion);
			}
		}
	};
	return {
		close: () => {
			if (closed) return;
			closed = true;
			clearDebounceTimer();
			clearPendingQuestions();
			activeAbortController?.abort();
		},
		enqueue: (question, metadata) => {
			const trimmed = question.trim();
			if (!trimmed || shouldStop()) return;
			if (active) {
				if (appendPendingQuestion({
					question: trimmed,
					metadata
				})) params.logger.info(`${params.logPrefix} consult queued: chars=${trimmed.length} queued=${pendingQuestions.length}`);
				clearDebounceTimer();
				return;
			}
			if (!appendPendingQuestion({
				question: trimmed,
				metadata
			})) return;
			clearDebounceTimer();
			debounceTimer = setTimeout(() => {
				debounceTimer = void 0;
				const queuedQuestion = shiftPendingQuestion();
				if (queuedQuestion && !shouldStop()) run(queuedQuestion);
			}, params.debounceMs);
			debounceTimer.unref?.();
		}
	};
}
function isAbortError(error) {
	return error instanceof Error && error.name === "AbortError";
}
//#endregion
//#region src/talk/provider-registry.ts
/**
* Normalizes realtime voice provider ids so direct ids and aliases compare through one registry key.
*/
function normalizeRealtimeVoiceProviderId(providerId) {
	return normalizeCapabilityProviderId(providerId);
}
/**
* Lists canonical realtime voice providers, discovering additional candidates through manifest policy.
*/
function listRealtimeVoiceProviders(cfg, additionalProviderIds) {
	const providers = resolvePluginCapabilityProviders({
		key: "realtimeVoiceProviders",
		cfg,
		additionalProviderIds
	});
	return [...buildCapabilityProviderIndex(providers, "canonical").values()];
}
/**
* Resolves a realtime voice provider by canonical id or declared alias.
*/
function getRealtimeVoiceProvider(providerId, cfg) {
	const normalized = normalizeRealtimeVoiceProviderId(providerId);
	if (!normalized) return;
	return resolvePluginCapabilityProvider({
		key: "realtimeVoiceProviders",
		providerId: normalized,
		cfg
	});
}
/**
* Converts a realtime voice provider id or alias into the canonical provider id when known.
*/
function canonicalizeRealtimeVoiceProviderId(providerId, cfg) {
	const normalized = normalizeRealtimeVoiceProviderId(providerId);
	if (!normalized) return;
	return getRealtimeVoiceProvider(normalized, cfg)?.id ?? normalized;
}
//#endregion
//#region src/talk/provider-internal.ts
const INTERNAL_REALTIME_VOICE_PROVIDER = Symbol.for("openclaw.internal.realtime-voice-provider.v1");
function readInternalRealtimeVoiceProviderApi(provider) {
	const value = Reflect.get(provider, INTERNAL_REALTIME_VOICE_PROVIDER);
	if (!value || typeof value !== "object") return;
	const api = value;
	return typeof api.isBrowserSessionConfigured === "function" ? api : void 0;
}
function isInternalRealtimeVoiceBrowserSessionConfigured(params) {
	return readInternalRealtimeVoiceProviderApi(params.provider)?.isBrowserSessionConfigured({
		cfg: params.cfg,
		providerConfig: params.providerConfig,
		agentId: params.agentId
	});
}
function resolveInternalRealtimeVoiceBrowserSessionCapabilities(params) {
	return readInternalRealtimeVoiceProviderApi(params.provider)?.resolveBrowserSessionCapabilities?.({
		cfg: params.cfg,
		providerConfig: params.providerConfig,
		agentId: params.agentId,
		model: params.model
	});
}
function isInternalRealtimeVoiceGatewayRelayConfigured(params) {
	return readInternalRealtimeVoiceProviderApi(params.provider)?.isGatewayRelayConfigured?.({
		cfg: params.cfg,
		providerConfig: params.providerConfig,
		agentId: params.agentId
	});
}
function resolveInternalRealtimeVoiceGatewayRelayCapabilities(params) {
	return readInternalRealtimeVoiceProviderApi(params.provider)?.resolveGatewayRelayCapabilities?.({
		cfg: params.cfg,
		providerConfig: params.providerConfig,
		model: params.model
	});
}
function resolveInternalRealtimeVoiceGatewayRelayLaunchError(params) {
	return readInternalRealtimeVoiceProviderApi(params.provider)?.validateGatewayRelayLaunch?.({
		cfg: params.cfg,
		providerConfig: params.providerConfig,
		model: params.model,
		autoRespondToAudio: params.autoRespondToAudio
	});
}
async function cancelInternalRealtimeVoiceBrowserSession(params) {
	const internal = readInternalRealtimeVoiceProviderApi(params.provider)?.cancelBrowserSession;
	if (internal) {
		await internal(params.request, params.session);
		return;
	}
	await params.provider.cancelBrowserSession?.(params.request, params.session);
}
//#endregion
//#region src/talk/provider-resolver.ts
function resolveRealtimeVoiceProviderCapabilities(params) {
	if (params.surface === "browser-session") {
		const internalCapabilities = resolveInternalRealtimeVoiceBrowserSessionCapabilities(params);
		if (internalCapabilities) return internalCapabilities;
	}
	if (params.surface === "gateway-relay") {
		const internalCapabilities = resolveInternalRealtimeVoiceGatewayRelayCapabilities(params);
		if (internalCapabilities) return internalCapabilities;
	}
	return params.provider.capabilities;
}
function isRealtimeVoiceProviderConfigured(params) {
	const internalConfigured = params.surface === "browser-session" ? isInternalRealtimeVoiceBrowserSessionConfigured(params) : params.surface === "gateway-relay" ? isInternalRealtimeVoiceGatewayRelayConfigured(params) : void 0;
	if (internalConfigured !== void 0) return internalConfigured;
	return params.provider.isConfigured({
		cfg: params.cfg,
		agentId: params.agentId,
		providerConfig: params.providerConfig
	});
}
/** Resolve the configured realtime voice provider or auto-select the first configured one. */
function resolveConfiguredRealtimeVoiceProvider(params) {
	const cfgForResolve = params.cfgForResolve ?? params.cfg ?? {};
	const resolution = resolveConfiguredCapabilityProvider({
		configuredProviderId: params.configuredProviderId,
		providerConfigs: params.providerConfigs,
		cfg: params.cfg,
		cfgForResolve,
		getConfiguredProvider: (providerId) => params.providers?.find((entry) => entry.id === providerId) ?? getRealtimeVoiceProvider(providerId, params.cfg),
		listProviders: () => params.providers ?? listRealtimeVoiceProviders(params.cfg, Object.keys(params.providerConfigs ?? {})),
		isProviderAvailable: params.isProviderAvailable ? ({ provider }) => params.isProviderAvailable?.(provider) === true : void 0,
		resolveProviderConfig: ({ provider, cfg, rawConfig }) => {
			const rawConfigWithOverrides = {
				...params.defaultModel && rawConfig.model === void 0 ? {
					...rawConfig,
					model: params.defaultModel
				} : rawConfig,
				...params.providerConfigOverrides
			};
			return provider.resolveConfig?.({
				cfg,
				rawConfig: rawConfigWithOverrides
			}) ?? rawConfigWithOverrides;
		},
		isProviderConfigured: ({ provider, cfg, providerConfig }) => isRealtimeVoiceProviderConfigured({
			provider,
			cfg,
			providerConfig,
			agentId: params.agentId,
			surface: params.surface
		})
	});
	if (!resolution.ok && resolution.code === "missing-configured-provider") throw new Error(`Realtime voice provider "${resolution.configuredProviderId}" is not registered`);
	if (!resolution.ok && resolution.code === "no-registered-provider") throw new Error(params.noRegisteredProviderMessage ?? "No realtime voice provider registered");
	if (!resolution.ok && resolution.code === "provider-unavailable" && resolution.provider) {
		params.assertProviderAvailable?.(resolution.provider);
		throw new Error(`Realtime voice provider "${resolution.provider.id}" is unavailable`);
	}
	if (!resolution.ok) throw new Error(`Realtime voice provider "${resolution.provider?.id}" is not configured`);
	return {
		provider: resolution.provider,
		providerConfig: resolution.providerConfig
	};
}
//#endregion
//#region src/talk/session-runtime.ts
/**
* Creates a realtime voice bridge session and wires provider events to the configured audio sink.
*/
function createRealtimeVoiceBridgeSession(params) {
	const bridgeRef = {};
	let phase = "admitting";
	let terminalBeforeBridgeAdoption = false;
	let closeReported = false;
	const isAdmitting = () => phase === "admitting";
	const requireBridge = () => {
		if (!bridgeRef.current) throw new Error("Realtime voice bridge is not ready");
		return bridgeRef.current;
	};
	const session = {
		get bridge() {
			return requireBridge();
		},
		acknowledgeMark: (markName) => requireBridge().acknowledgeMark(markName),
		close: (options) => {
			if (phase === "disposed") return;
			const bridge = requireBridge();
			phase = "disposed";
			bridge.close(options);
		},
		connect: () => {
			if (phase === "disposed") return Promise.reject(/* @__PURE__ */ new Error("Realtime voice session is closed"));
			if (phase === "provider-terminal") {
				if (!terminalBeforeBridgeAdoption) return Promise.reject(/* @__PURE__ */ new Error("Realtime voice connection is closed"));
				terminalBeforeBridgeAdoption = false;
				phase = "admitting";
				closeReported = false;
			}
			return requireBridge().connect();
		},
		sendAudio: (audio) => {
			if (isAdmitting()) requireBridge().sendAudio(audio);
		},
		sendUserMessage: (text) => requireBridge().sendUserMessage?.(text),
		handleBargeIn: (options) => requireBridge().handleBargeIn?.(options),
		setMediaTimestamp: (ts) => requireBridge().setMediaTimestamp(ts),
		submitToolResult: (callId, result, options) => {
			const bridge = requireBridge();
			if (options?.suppressResponse && bridge.supportsToolResultSuppression === false) throw new Error("Realtime provider does not support suppressed tool results");
			return bridge.submitToolResult(callId, result, options);
		},
		triggerGreeting: (instructions) => requireBridge().triggerGreeting?.(instructions)
	};
	const canSendAudio = () => isAdmitting() && (params.audioSink.isOpen?.() ?? true);
	const reportCallbackError = (error) => {
		if (!isAdmitting()) return;
		try {
			params.onError?.(error instanceof Error ? error : new Error(String(error)));
		} catch {}
	};
	bridgeRef.current = params.provider.createBridge({
		cfg: params.cfg,
		agentId: params.agentId,
		providerConfig: params.providerConfig,
		audioFormat: params.audioFormat,
		instructions: params.instructions,
		language: params.language,
		autoRespondToAudio: params.autoRespondToAudio,
		interruptResponseOnInputAudio: params.interruptResponseOnInputAudio,
		tools: params.tools,
		onAudio: (audio) => {
			if (canSendAudio()) params.audioSink.sendAudio(audio);
		},
		onClearAudio: (reason) => {
			if (canSendAudio()) params.audioSink.clearAudio?.(reason);
		},
		onMark: (markName) => {
			if (!canSendAudio() || params.markStrategy === "ignore") return;
			if (params.markStrategy === "ack-immediately") {
				bridgeRef.current?.acknowledgeMark(markName);
				return;
			}
			if (params.markStrategy === void 0 || params.markStrategy === "transport") params.audioSink.sendMark?.(markName);
		},
		onTranscript: params.onTranscript,
		onEvent: params.onEvent,
		onResponseDone: params.onResponseDone,
		onToolCall: (event) => {
			if (!bridgeRef.current || !isAdmitting()) return;
			try {
				const pending = params.onToolCall?.(event, session);
				if (pending) pending.catch(reportCallbackError);
			} catch (error) {
				reportCallbackError(error);
			}
		},
		onReady: () => {
			if (!bridgeRef.current || !isAdmitting()) return;
			if (params.triggerGreetingOnReady) bridgeRef.current.triggerGreeting?.(params.initialGreetingInstructions);
			params.onReady?.(session);
		},
		onError: params.onError,
		onClose: (reason) => {
			if (!bridgeRef.current) terminalBeforeBridgeAdoption = true;
			if (phase !== "disposed") phase = "provider-terminal";
			if (closeReported) return;
			closeReported = true;
			params.onClose?.(reason);
		}
	});
	return session;
}
//#endregion
//#region src/talk/session-log-runtime.ts
/** Appends a transcript entry and trims old rows in-place to bound Talk diagnostics memory. */
function recordRealtimeVoiceTranscript(transcript, role, text, maxEntries = 40) {
	const entry = {
		at: (/* @__PURE__ */ new Date()).toISOString(),
		role,
		text
	};
	transcript.push(entry);
	if (transcript.length > maxEntries) transcript.splice(0, transcript.length - maxEntries);
	return entry;
}
/** Summarizes transcript history for health endpoints and UI diagnostics. */
function getRealtimeVoiceTranscriptHealth(transcript) {
	const last = transcript.at(-1);
	return {
		realtimeTranscriptLines: transcript.length,
		lastRealtimeTranscriptAt: last?.at,
		lastRealtimeTranscriptRole: last?.role,
		lastRealtimeTranscriptText: last?.text,
		recentRealtimeTranscript: transcript.slice(-5)
	};
}
/** Records low-volume bridge events while dropping raw audio chunks from diagnostics. */
function recordRealtimeVoiceBridgeEvent(events, event, maxEntries = 40) {
	if (event.direction === "client" && event.type === "input_audio_buffer.append") return;
	events.push({
		at: (/* @__PURE__ */ new Date()).toISOString(),
		...event
	});
	if (events.length > maxEntries) events.splice(0, events.length - maxEntries);
}
/** Summarizes recent bridge events without exposing the full rolling event buffer. */
function getRealtimeVoiceBridgeEventHealth(events) {
	const last = events.at(-1);
	return {
		lastRealtimeEventAt: last?.at,
		lastRealtimeEventType: last ? `${last.direction}:${last.type}` : void 0,
		lastRealtimeEventDetail: last?.detail,
		recentRealtimeEvents: events.slice(-10)
	};
}
function normalizeTranscriptForEchoMatch(text) {
	return text.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((token) => token.length > 1);
}
function hasMeaningfulEchoOverlap(userTokens, assistantTokens) {
	if (userTokens.length < 4 || assistantTokens.length < 4) return false;
	const uniqueUserTokens = uniqueStrings(userTokens);
	if (uniqueUserTokens.length < 4) return false;
	const assistantTokenSet = new Set(assistantTokens);
	return uniqueUserTokens.filter((token) => assistantTokenSet.has(token)).length / uniqueUserTokens.length >= .58;
}
/** Detects user transcript text that likely came from assistant speaker echo, not speech. */
function isLikelyRealtimeVoiceAssistantEchoTranscript(params) {
	const userTokens = normalizeTranscriptForEchoMatch(params.text);
	if (userTokens.length < 4) return false;
	const nowMs = params.nowMs ?? Date.now();
	const recentAssistantText = params.transcript.filter((entry) => {
		if (entry.role !== "assistant") return false;
		const at = Date.parse(entry.at);
		return Number.isFinite(at) && nowMs - at <= params.lookbackMs;
	}).slice(-6).map((entry) => entry.text).join(" ");
	if (!recentAssistantText.trim()) return false;
	const userNormalized = userTokens.join(" ");
	const assistantTokens = normalizeTranscriptForEchoMatch(recentAssistantText);
	const assistantNormalized = assistantTokens.join(" ");
	return userNormalized.length >= 18 && assistantNormalized.includes(userNormalized) || assistantNormalized.length >= 18 && userNormalized.includes(assistantNormalized) || hasMeaningfulEchoOverlap(userTokens, assistantTokens);
}
/** Extends input suppression through the estimated playback tail for assistant audio. */
function extendRealtimeVoiceOutputEchoSuppression(params) {
	const durationMs = Math.ceil(params.audio.byteLength / params.bytesPerMs);
	const playbackEndMs = Math.max(params.nowMs, params.lastOutputPlayableUntilMs) + durationMs;
	return {
		durationMs,
		lastOutputPlayableUntilMs: playbackEndMs,
		suppressInputUntilMs: Math.max(params.suppressInputUntilMs, playbackEndMs + params.tailMs)
	};
}
//#endregion
//#region src/talk/realtime-session-harness.ts
const MAX_SETTLED_RESPONSE_IDS = 64;
const harnessResponseOwners = /* @__PURE__ */ new WeakMap();
/** Core-only adapter for direct provider bridges that cannot use createBridge(). */
function handleRealtimeVoiceHarnessBridgeEvent(harness, event) {
	const owner = harnessResponseOwners.get(harness);
	owner?.claimResponseEvent(event);
	return owner?.finishLegacyEvent(event);
}
function createRealtimeVoiceSessionHarness(params) {
	let closed = false;
	let bridge;
	let lastInputAt;
	let lastOutputAt;
	let lastSuppressedInputAt;
	let lastInputBytes = 0;
	let suppressedInputBytes = 0;
	let suppressInputUntilMs = 0;
	let lastOutputPlayableUntilMs = 0;
	let outputFlushGeneration = 0;
	let responseOwnerTurnId;
	let responseOwnerId;
	let suppressNextUnkeyedLegacyTerminal = false;
	const settledResponseIds = /* @__PURE__ */ new Set();
	const settledResponseIdOrder = [];
	const transcript = [];
	const bridgeEvents = [];
	const outputActivity = createRealtimeVoiceOutputActivityTracker();
	const transcriptLookbackMs = params.transcriptLookbackMs ?? params.echoSuppression?.transcriptLookbackMs;
	const forcedConsults = createRealtimeVoiceForcedConsultCoordinator(params.forcedConsults);
	const talk = createTalkSessionController({
		maxRecentEvents: 40,
		...params.talk
	}, { onEvent: (event) => {
		recordTalkObservabilityEvent(event);
		params.onTalkEvent?.(event);
	} });
	const talkback = params.talkback ? createRealtimeVoiceAgentTalkbackQueue({
		...params.talkback,
		isStopped: () => closed
	}) : void 0;
	const ensureTurn = () => {
		const turnId = talk.ensureTurn({ payload: params.talkPayloads.turnStarted() }).turnId;
		responseOwnerTurnId ??= turnId;
		return turnId;
	};
	const rememberSettledResponse = (responseId) => {
		if (!responseId || settledResponseIds.has(responseId)) return;
		settledResponseIds.add(responseId);
		settledResponseIdOrder.push(responseId);
		if (settledResponseIdOrder.length > MAX_SETTLED_RESPONSE_IDS) {
			const oldest = settledResponseIdOrder.shift();
			if (oldest) settledResponseIds.delete(oldest);
		}
	};
	const claimResponseEvent = (event) => {
		if (event.direction !== "server" || event.type !== "response.created") return;
		responseOwnerTurnId = ensureTurn();
		responseOwnerId = event.responseId;
		suppressNextUnkeyedLegacyTerminal = false;
	};
	const finishResponse = (outcome, source) => {
		if (outcome.responseId && settledResponseIds.has(outcome.responseId)) return {
			ok: false,
			reason: "no_active_turn"
		};
		if (outcome.responseId && responseOwnerId && outcome.responseId !== responseOwnerId) return {
			ok: false,
			reason: "stale_turn"
		};
		const turnId = responseOwnerTurnId ?? talk.activeTurnId;
		if (!turnId) return {
			ok: false,
			reason: "no_active_turn"
		};
		if (talk.activeTurnId !== turnId) return {
			ok: false,
			reason: "stale_turn"
		};
		talk.finishOutputAudio({
			turnId,
			payload: params.talkPayloads.outputAudioDone(outcome.status)
		});
		if (outcome.status === "failed" || outcome.status === "incomplete") talk.emit({
			type: "session.error",
			turnId,
			payload: outcome,
			final: true
		});
		const payload = params.talkPayloads.turnEnded(outcome.status);
		const result = outcome.status === "cancelled" ? talk.cancelTurn({
			turnId,
			payload
		}) : talk.endTurn({
			turnId,
			payload
		});
		if (result.ok) {
			rememberSettledResponse(outcome.responseId);
			if (!outcome.responseId && source === "typed") suppressNextUnkeyedLegacyTerminal = true;
			if (!responseOwnerId || !outcome.responseId || responseOwnerId === outcome.responseId) {
				responseOwnerTurnId = void 0;
				responseOwnerId = void 0;
			}
		}
		return result;
	};
	const finishLegacyEvent = (event) => {
		if (event.direction !== "server" || event.type !== "response.done" && event.type !== "response.cancelled") return;
		if (event.responseId && settledResponseIds.has(event.responseId)) return;
		if (!event.responseId && suppressNextUnkeyedLegacyTerminal) {
			suppressNextUnkeyedLegacyTerminal = false;
			return;
		}
		const outcome = {
			status: event.type === "response.cancelled" ? "cancelled" : "completed",
			...event.responseId ? { responseId: event.responseId } : {}
		};
		return finishResponse(outcome, "legacy").ok ? outcome : void 0;
	};
	const flushOutput = (flush) => {
		outputFlushGeneration += 1;
		suppressInputUntilMs = 0;
		lastOutputPlayableUntilMs = 0;
		flush();
	};
	const harness = {
		forcedConsults,
		outputActivity,
		talk,
		talkback,
		transcript,
		close() {
			if (closed) return;
			closed = true;
			talkback?.close();
			forcedConsults.clear();
			responseOwnerTurnId = void 0;
			responseOwnerId = void 0;
		},
		createBridge(bridgeParams) {
			bridge = createRealtimeVoiceBridgeSession({
				...bridgeParams,
				onTranscript: (role, text, isFinal) => {
					if (isFinal) harness.recordTranscript(role, text);
					bridgeParams.onTranscript?.(role, text, isFinal);
				},
				onEvent: (event) => {
					claimResponseEvent(event);
					const legacyOutcome = finishLegacyEvent(event);
					if (legacyOutcome) bridgeParams.onResponseDone?.(legacyOutcome);
					if (params.captureBridgeEvents !== false) recordRealtimeVoiceBridgeEvent(bridgeEvents, event);
					bridgeParams.onEvent?.(event);
				},
				onResponseDone: (outcome) => {
					if (finishResponse(outcome, "typed").ok) bridgeParams.onResponseDone?.(outcome);
				}
			});
			return bridge;
		},
		emit: (input) => talk.emit(input),
		ensureTurn,
		endTurn(reason = "completed") {
			if (talk.endTurn({ payload: params.talkPayloads.turnEnded(reason) }).ok) {
				responseOwnerTurnId = void 0;
				responseOwnerId = void 0;
			}
		},
		finishResponse(outcome) {
			return finishResponse(outcome, "typed");
		},
		finishOutputAudio(reason) {
			talk.finishOutputAudio({ payload: params.talkPayloads.outputAudioDone(reason) });
		},
		flushOutput,
		getHealth(healthParams) {
			const output = outputActivity.snapshot();
			return {
				providerConnected: healthParams.providerConnected,
				realtimeReady: healthParams.realtimeReady,
				audioInputActive: lastInputBytes > 0,
				audioOutputActive: outputActivity.isActive(),
				lastInputAt,
				lastOutputAt,
				lastSuppressedInputAt,
				lastInputBytes,
				lastOutputBytes: output.sinkAudioBytes,
				suppressedInputBytes,
				...getRealtimeVoiceTranscriptHealth(transcript),
				...bridge ? getRealtimeVoiceBridgeEventHealth(bridgeEvents) : {},
				recentTalkEvents: talk.recentEvents.slice(-20).map((event) => ({
					id: event.id,
					type: event.type,
					sessionId: event.sessionId,
					turnId: event.turnId,
					seq: event.seq,
					timestamp: event.timestamp,
					final: event.final
				}))
			};
		},
		handleBargeIn(options, fallbackFlush) {
			suppressInputUntilMs = 0;
			const flushGeneration = outputFlushGeneration;
			bridge?.handleBargeIn(options);
			if (flushGeneration === outputFlushGeneration) flushOutput(fallbackFlush);
		},
		isLikelyAssistantEchoTranscript(text) {
			return transcriptLookbackMs === void 0 ? false : isLikelyRealtimeVoiceAssistantEchoTranscript({
				transcript,
				text,
				lookbackMs: transcriptLookbackMs
			});
		},
		isOutputPlaybackWindowActive() {
			return Date.now() <= Math.max(lastOutputPlayableUntilMs, suppressInputUntilMs);
		},
		recordInputAudio(audio) {
			if (Date.now() < suppressInputUntilMs) {
				lastSuppressedInputAt = (/* @__PURE__ */ new Date()).toISOString();
				suppressedInputBytes += audio.byteLength;
				return false;
			}
			lastInputAt = (/* @__PURE__ */ new Date()).toISOString();
			lastInputBytes += audio.byteLength;
			harness.emit({
				type: "input.audio.delta",
				turnId: ensureTurn(),
				payload: params.talkPayloads.inputAudioDelta(audio)
			});
			return true;
		},
		recordOutputAudio(audio, activity = {}) {
			const turnId = ensureTurn();
			talk.startOutputAudio({
				turnId,
				payload: params.talkPayloads.outputAudioStarted()
			});
			harness.emit({
				type: "output.audio.delta",
				turnId,
				payload: params.talkPayloads.outputAudioDelta(audio)
			});
			let audioMs = activity.audioMs;
			if (params.echoSuppression) {
				const suppression = extendRealtimeVoiceOutputEchoSuppression({
					audio,
					bytesPerMs: params.echoSuppression.bytesPerMs,
					tailMs: params.echoSuppression.tailMs,
					nowMs: Date.now(),
					lastOutputPlayableUntilMs,
					suppressInputUntilMs
				});
				lastOutputPlayableUntilMs = suppression.lastOutputPlayableUntilMs;
				suppressInputUntilMs = suppression.suppressInputUntilMs;
				audioMs ??= suppression.durationMs;
			}
			outputActivity.markAudio({
				audioMs,
				sourceAudioBytes: activity.sourceAudioBytes ?? audio.byteLength,
				sinkAudioBytes: activity.sinkAudioBytes ?? audio.byteLength
			});
			lastOutputAt = (/* @__PURE__ */ new Date()).toISOString();
		},
		recordTranscript: (role, text) => recordRealtimeVoiceTranscript(transcript, role, text)
	};
	harnessResponseOwners.set(harness, {
		claimResponseEvent,
		finishLegacyEvent
	});
	return harness;
}
//#endregion
export { REALTIME_VOICE_AUDIO_FORMAT_PCM16_24KHZ as $, buildRealtimeVoiceSessionInstructions as A, normalizeRealtimeVoiceConsultQuestion as B, REALTIME_VOICE_AGENT_CONSULT_TOOL as C, buildRealtimeVoiceAgentConsultPolicyInstructions as D, buildRealtimeVoiceAgentConsultChatMessage as E, resolveRealtimeVoiceAgentConsultTools as F, recordTalkObservabilityEvent as G, readSpeakableRealtimeVoiceToolResult as H, resolveRealtimeVoiceAgentConsultToolsAllow as I, createTalkDiagnosticEvent as J, createTalkLogRecord as K, createRealtimeVoiceOutputActivityTracker as L, isRealtimeVoiceAgentConsultToolPolicy as M, parseRealtimeVoiceAgentConsultArgs as N, buildRealtimeVoiceAgentConsultPrompt as O, resolveRealtimeVoiceAgentConsultToolPolicy as P, REALTIME_VOICE_AUDIO_FORMAT_G711_ULAW_8KHZ as Q, createRealtimeVoiceForcedConsultCoordinator as R, consultRealtimeVoiceAgent as S, REALTIME_VOICE_AGENT_CONSULT_TOOL_POLICIES as T, createTalkSessionController as U, readRealtimeVoiceConsultQuestion as V, normalizeTalkTransport as W, TALK_EVENT_TYPES as X, recordTalkDiagnosticEvent as Y, createTalkEventSequencer as Z, listRealtimeVoiceProviders as _, getRealtimeVoiceTranscriptHealth as a, REALTIME_VOICE_AGENT_CONSULT_SENDER_AUTH_VERSION as b, recordRealtimeVoiceTranscript as c, resolveConfiguredRealtimeVoiceProvider as d, normalizeRealtimeVoiceResponseOutcome as et, resolveRealtimeVoiceProviderCapabilities as f, getRealtimeVoiceProvider as g, canonicalizeRealtimeVoiceProviderId as h, getRealtimeVoiceBridgeEventHealth as i, collectRealtimeVoiceAgentConsultVisibleText as j, buildRealtimeVoiceAgentConsultWorkingResponse as k, createRealtimeVoiceBridgeSession as l, resolveInternalRealtimeVoiceGatewayRelayLaunchError as m, handleRealtimeVoiceHarnessBridgeEvent as n, toOpenAICompatibleRealtimeAudioFormat as nt, isLikelyRealtimeVoiceAssistantEchoTranscript as o, cancelInternalRealtimeVoiceBrowserSession as p, recordTalkLogEvent as q, extendRealtimeVoiceOutputEchoSuppression as r, recordRealtimeVoiceBridgeEvent as s, createRealtimeVoiceSessionHarness as t, realtimeVoiceAudioDurationMs as tt, isRealtimeVoiceProviderConfigured as u, normalizeRealtimeVoiceProviderId as v, REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME as w, assertRealtimeVoiceAgentConsultModelSelectionUnlocked as x, createRealtimeVoiceAgentTalkbackQueue as y, matchRealtimeVoiceConsultQuestions as z };
