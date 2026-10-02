import { t as asNonArrayRecord } from "./record-coerce-DItp3I4t.js";
import { c as normalizeOptionalLowercaseString, l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { n as isAbortError } from "./abort-signal-D2k14JsD.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
//#region src/talk/agent-run-control-shared.ts
/**
* Shared realtime voice controls for active OpenClaw agent runs.
*
* This module owns the provider-facing control tool, conservative intent
* classifier, and user-visible status/queue/cancel messages used by Talk.
*/
/** Provider-facing control modes for status, steering, cancellation, and follow-up work. */
const REALTIME_VOICE_AGENT_CONTROL_MODES = [
	"status",
	"steer",
	"cancel",
	"followup"
];
/** Stable provider-facing tool name for active-run voice control. */
const REALTIME_VOICE_AGENT_CONTROL_TOOL_NAME = "openclaw_agent_control";
/** Realtime function-tool descriptor projected to voice providers. */
const REALTIME_VOICE_AGENT_CONTROL_TOOL = {
	type: "function",
	name: REALTIME_VOICE_AGENT_CONTROL_TOOL_NAME,
	description: "Control an active OpenClaw tool-backed voice run. Use this when the caller asks in any language for status/progress, cancellation, a redirect/change to the active work, or a follow-up after the current work. Do not use this for ordinary greetings or chatter unless the caller is asking about the active work.",
	parameters: {
		type: "object",
		properties: {
			text: {
				type: "string",
				description: "The caller's exact spoken request or a concise semantic equivalent."
			},
			mode: {
				type: "string",
				enum: REALTIME_VOICE_AGENT_CONTROL_MODES,
				description: "status for progress questions, cancel for stop/abort, steer for changing the current work, followup for work to do after the current result."
			}
		},
		required: ["text", "mode"]
	}
};
/** Normalize user/config/provider supplied control modes. */
function normalizeRealtimeVoiceAgentControlMode(value) {
	const normalized = normalizeOptionalLowercaseString(value);
	return REALTIME_VOICE_AGENT_CONTROL_MODES.includes(normalized) ? normalized : void 0;
}
const CANCEL_CONTROL_PATTERNS = [
	/^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:please\s+)?(?:cancel|cancle|abort)(?:\s+(?:that|this|it|the\s+(?:check|run|task|work)))?(?:\s*[.!?])?$/,
	/^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:please\s+)?(?:never mind|nevermind|forget it|kill it|end that)(?:\s*[.!?])?$/,
	/^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:please\s+)?stop(?:\s+(?:that|this|it|the\s+(?:check|run|task|work)))?(?:\s*[.!?])?$/,
	/^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:can|could|would)\s+you\s+(?:please\s+)?(?:cancel|cancle|stop|abort)(?:\s+(?:that|this|it|the\s+(?:check|run|task|work)))?(?:\s*[.!?])?$/,
	/^(?:(?:ok|okay|alright|all right|actually)[,\s]+)?(?:can|could|would)\s+(?:we|you)\s+(?:just\s+)?(?:cancel|cancle|stop|abort)(?:\s+(?:that|this|it|the\s+(?:check|run|task|work)))?(?:\s*[.!?])?$/,
	/\b(?:cancel|cancle|stop|abort)\s+(?:that|this|it|the\s+(?:check|run|task|work))\b/
];
const STATUS_CONTROL_PATTERNS = [
	/^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:status|progress|update)(?:\s*[.!?])?$/,
	/^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:give me|what'?s|any)\s+(?:an?\s+)?update(?:\s*[.!?])?$/,
	/^(?:(?:ok|okay|alright|all right)[,\s]+)?(where are we|what'?s happening|what (?:are you|is it) doing|what'?s it doing|how (?:is|are) (?:it|you|that|this) going|how'?s it going|are you still working|is it done|did it finish)(\b|[.!?])/
];
const FOLLOWUP_CONTROL_PATTERNS = [/^(after that|when you'?re done|when it'?s done|next|then|also|one more thing|follow up)(\b|[,.!?])/];
const STEER_CONTROL_PATTERNS = [
	/^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:please\s+)?update\s+\S/,
	/^(?:actually|instead|change|switch|focus|use|try|prefer|make|do|check|look at|go with|redirect|steer|tell it to)\b/,
	/^(?:can|could|would)\s+you\s+(?:actually\s+)?(?:change|switch|focus|use|try|prefer|make|do|check|look at|go with|redirect|steer)\b/,
	/\b(?:instead|not that|rather than|change that|switch to|focus on|use the|try the|go with|tell it to)\b/
];
const STOP_REDIRECT_CONTROL_PATTERNS = [
	/^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:please\s+)?stop\s+(?:using|doing|checking|looking at|focusing on|trying)\b/,
	/^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:can|could|would)\s+(?:you|we)\s+(?:please\s+)?stop\s+(?:using|doing|checking|looking at|focusing on|trying)\b/,
	/^(?:(?:ok|okay|alright|all right)[,\s]+)?(?:please\s+)?stop\s+(?:that|this|it|the\s+(?:check|run|task|work))\s+from\b/
];
function matchesAnyPattern(text, patterns) {
	return patterns.some((pattern) => pattern.test(text));
}
function hasNegatedCancelIntent(text) {
	return /\b(?:don'?t|do\s+not|not|never)\s+(?:please\s+)?(?:cancel|cancle|stop|abort|kill|end)\b/.test(text) || /\bstop\s+(?:it|that|this)\s+from\b/.test(text);
}
/** Classify raw spoken control text with conservative auto-control gating. */
function resolveRealtimeVoiceAgentControlIntent(params) {
	const explicitMode = normalizeRealtimeVoiceAgentControlMode(params.mode);
	if (explicitMode) return {
		mode: explicitMode,
		confidence: "high",
		reason: "explicit_mode",
		shouldAutoControl: true
	};
	const normalized = params.text.trim().toLowerCase();
	if (matchesAnyPattern(normalized, STOP_REDIRECT_CONTROL_PATTERNS)) return {
		mode: "steer",
		confidence: "medium",
		reason: "steer_command",
		shouldAutoControl: true
	};
	if (!hasNegatedCancelIntent(normalized) && matchesAnyPattern(normalized, CANCEL_CONTROL_PATTERNS)) return {
		mode: "cancel",
		confidence: "high",
		reason: "cancel_safety",
		shouldAutoControl: true
	};
	if (matchesAnyPattern(normalized, STATUS_CONTROL_PATTERNS)) return {
		mode: "status",
		confidence: "high",
		reason: "status_query",
		shouldAutoControl: true
	};
	if (matchesAnyPattern(normalized, FOLLOWUP_CONTROL_PATTERNS)) return {
		mode: "followup",
		confidence: "high",
		reason: "followup_marker",
		shouldAutoControl: true
	};
	if (matchesAnyPattern(normalized, STEER_CONTROL_PATTERNS)) return {
		mode: "steer",
		confidence: "medium",
		reason: "steer_command",
		shouldAutoControl: true
	};
	return {
		mode: "status",
		confidence: "low",
		reason: "safe_default",
		shouldAutoControl: false
	};
}
/** Return the best control mode for a spoken utterance, even if auto-routing is unsafe. */
function classifyRealtimeVoiceAgentControlText(text) {
	return resolveRealtimeVoiceAgentControlIntent({ text }).mode;
}
/** Whether a spoken utterance is safe to route automatically to the control tool. */
function shouldAutoControlRealtimeVoiceAgentText(text) {
	return resolveRealtimeVoiceAgentControlIntent({ text }).shouldAutoControl;
}
/** Parse provider-owned control tool args from JSON strings or object payloads. */
function parseRealtimeVoiceAgentControlToolArgs(args) {
	const parsed = parseRealtimeVoiceAgentControlToolArgsRecord(args);
	const record = asNonArrayRecord(parsed);
	const text = normalizeOptionalString(record.text) ?? normalizeOptionalString(record.message) ?? normalizeOptionalString(record.request) ?? normalizeOptionalString(record.query);
	if (!text) throw new Error("text required");
	return {
		text,
		mode: normalizeRealtimeVoiceAgentControlMode(record.mode) ?? resolveRealtimeVoiceAgentControlIntent({ text }).mode
	};
}
function parseRealtimeVoiceAgentControlToolArgsRecord(args) {
	if (typeof args !== "string") return args;
	const trimmed = args.trim();
	if (!trimmed) return {};
	try {
		return JSON.parse(trimmed);
	} catch {
		return { text: trimmed };
	}
}
/** Build the system-style instruction that forces exact spoken status output. */
function buildRealtimeVoiceAgentControlSpeechMessage(text) {
	return [
		"Internal OpenClaw voice control result.",
		"Do not call openclaw_agent_consult or any other tool for this message.",
		"Speak this exact OpenClaw status to the voice call, without adding, removing, or rephrasing words.",
		`Status: ${JSON.stringify(text)}`
	].join("\n");
}
/** Provider result payload used when the control tool cancels active work. */
function buildRealtimeVoiceAgentCancelProviderResult(message = "Cancelled the active OpenClaw run.") {
	return {
		status: "cancelled",
		message
	};
}
/** Wrap follow-up text so an active run treats it as deferred context. */
function buildRealtimeVoiceAgentFollowupSteeringText(text) {
	return [
		"Spoken follow-up for the current voice call.",
		"If you are mid-task, incorporate this after the current step or result unless it directly changes the current task.",
		"",
		text
	].join("\n");
}
/** User-facing message for queue failures while steering or adding follow-up work. */
function formatRealtimeVoiceAgentQueueRejection(mode, reason) {
	if (reason === "compacting") return "OpenClaw is compacting the active run and cannot accept voice steering yet.";
	if (reason === "not_streaming") return "OpenClaw has an active run, but it is not currently accepting steering.";
	return mode === "followup" ? "OpenClaw could not queue that follow-up." : "OpenClaw could not steer the active run.";
}
function isRealtimeVoiceAgentControlToolEvent(event) {
	if (!event.type.startsWith("tool.")) return false;
	const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
	return normalizeOptionalString(payload.name) === REALTIME_VOICE_AGENT_CONTROL_TOOL_NAME;
}
/** Format a concise spoken status for the active or most recent voice run. */
function formatRealtimeVoiceAgentStatus(params) {
	const recent = (params.recentEvents ?? []).toReversed();
	if (!params.active) return recent.find((event) => event.type === "turn.ended") ? "OpenClaw finished the last voice request." : "I'm not working on an active request right now.";
	const toolEvent = recent.find((event) => event.type.startsWith("tool.") && !isRealtimeVoiceAgentControlToolEvent(event));
	if (toolEvent) {
		const payload = toolEvent.payload && typeof toolEvent.payload === "object" ? toolEvent.payload : {};
		const name = normalizeOptionalString(payload.name);
		const phase = normalizeOptionalString(payload.phase);
		if (toolEvent.type === "tool.call") return name ? `OpenClaw is starting ${name}.` : "OpenClaw is starting a tool.";
		if (toolEvent.type === "tool.result") return name ? `OpenClaw finished ${name} and is continuing.` : "OpenClaw finished a tool and is continuing.";
		if (toolEvent.type === "tool.progress") return name ? `OpenClaw is working in ${name}${phase ? ` (${phase})` : ""}.` : "OpenClaw is still working.";
	}
	if (params.activity?.activeToolName) return `OpenClaw is running ${params.activity.activeToolName}.`;
	if (params.activity?.activeWorkKind === "model_call") return "OpenClaw is waiting on the model.";
	if (params.activity?.activeWorkKind === "embedded_run" || params.activity?.hasActiveEmbeddedRun) return "OpenClaw is working on the current voice request.";
	return "OpenClaw is working on the current voice request.";
}
//#endregion
//#region src/talk/agent-run-control.ts
/** Host error projection needs server-side redaction, outside browser-shared contracts. */
function buildRealtimeVoiceAgentErrorProviderResult(error) {
	return isAbortError(error) ? buildRealtimeVoiceAgentCancelProviderResult() : { error: formatErrorMessage(error) };
}
/** Apply a spoken status, cancel, steer, or follow-up request to an active run. */
async function controlRealtimeVoiceAgentRun(params, providedDeps) {
	const deps = providedDeps ?? (await import("./agent-run-control.runtime.js")).realtimeVoiceControlRuntime;
	const sessionKey = params.sessionKey.trim();
	const text = params.text.trim();
	const mode = resolveRealtimeVoiceAgentControlIntent({
		text,
		mode: params.mode
	}).mode;
	const target = params.runTarget;
	const candidate = target && !target.signal.aborted && target.isCurrent() ? deps.resolveActiveEmbeddedRunOwnerByRunId?.(target.runId) ?? deps.resolveActiveReplyRunOwnerForSignal?.(target.signal) : void 0;
	const exactOwner = candidate?.sessionKey === sessionKey && target?.isCurrent(candidate.sessionId) ? candidate : void 0;
	const sessionId = target === void 0 ? deps.resolveActiveEmbeddedRunSessionId(sessionKey) : exactOwner?.sessionId;
	const activity = target === void 0 ? deps.getDiagnosticSessionActivitySnapshot({
		sessionId,
		sessionKey
	}) : sessionId ? deps.getDiagnosticSessionActivitySnapshot({ sessionId }) : void 0;
	const active = Boolean(sessionId || activity?.activeWorkKind || activity?.hasActiveEmbeddedRun);
	if (mode === "status") return {
		ok: true,
		mode,
		sessionKey,
		...sessionId ? { sessionId } : {},
		active,
		message: formatRealtimeVoiceAgentStatus({
			active,
			recentEvents: params.recentEvents,
			activity
		}),
		speak: true,
		show: true,
		suppress: false
	};
	if (mode === "cancel") {
		if (!sessionId) return {
			ok: false,
			mode,
			sessionKey,
			active: false,
			aborted: false,
			reason: "no_active_run",
			message: "There is no active OpenClaw run to cancel.",
			speak: true,
			show: true,
			suppress: false
		};
		const aborted = target === void 0 ? deps.abortEmbeddedAgentRun(sessionId) : exactOwner?.abort() === true;
		const message = aborted ? "Cancelled the active OpenClaw run." : "OpenClaw could not cancel the active run.";
		return {
			ok: aborted,
			mode,
			sessionKey,
			sessionId,
			active: true,
			aborted,
			...aborted ? {} : { reason: "abort_rejected" },
			message,
			speak: true,
			show: true,
			suppress: false,
			...aborted ? { providerResult: buildRealtimeVoiceAgentCancelProviderResult(message) } : {}
		};
	}
	if (!sessionId) return {
		ok: false,
		mode,
		sessionKey,
		active: false,
		queued: false,
		reason: "no_active_run",
		message: "There is no active OpenClaw run to steer.",
		speak: true,
		show: true,
		suppress: false
	};
	const steerText = mode === "followup" ? buildRealtimeVoiceAgentFollowupSteeringText(text) : text;
	const outcome = await deps.queueEmbeddedAgentMessageWithOutcomeAsync(sessionId, steerText, {
		steeringMode: "all",
		debounceMs: 0,
		isInboundUserMessage: true,
		taskSuggestionDeliveryMode: void 0
	});
	if (!outcome.queued) return {
		ok: false,
		mode,
		sessionKey,
		sessionId: outcome.sessionId,
		active: true,
		queued: false,
		reason: outcome.reason,
		message: formatRealtimeVoiceAgentQueueRejection(mode, outcome.reason),
		speak: true,
		show: true,
		suppress: false
	};
	return {
		ok: true,
		mode,
		sessionKey,
		sessionId: outcome.sessionId,
		active: true,
		queued: true,
		target: outcome.target,
		message: mode === "followup" ? "Queued that follow-up for the active OpenClaw run." : "Got it. I steered the active run.",
		speak: true,
		show: true,
		suppress: false,
		...outcome.enqueuedAtMs !== void 0 ? { enqueuedAtMs: outcome.enqueuedAtMs } : {},
		...outcome.deliveredAtMs !== void 0 ? { deliveredAtMs: outcome.deliveredAtMs } : {}
	};
}
//#endregion
export { REALTIME_VOICE_AGENT_CONTROL_TOOL_NAME as a, classifyRealtimeVoiceAgentControlText as c, resolveRealtimeVoiceAgentControlIntent as d, shouldAutoControlRealtimeVoiceAgentText as f, REALTIME_VOICE_AGENT_CONTROL_TOOL as i, normalizeRealtimeVoiceAgentControlMode as l, controlRealtimeVoiceAgentRun as n, buildRealtimeVoiceAgentCancelProviderResult as o, REALTIME_VOICE_AGENT_CONTROL_MODES as r, buildRealtimeVoiceAgentControlSpeechMessage as s, buildRealtimeVoiceAgentErrorProviderResult as t, parseRealtimeVoiceAgentControlToolArgs as u };
