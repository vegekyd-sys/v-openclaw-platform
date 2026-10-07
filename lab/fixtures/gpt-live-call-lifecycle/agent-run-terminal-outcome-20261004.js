import { s as asFiniteNumber } from "./number-coercion-CLj0HTDM.js";
import { m as readNonBlankString } from "./string-coerce-CIXf7egm.js";
import { t as asBoolean } from "./boolean-DmBL0YJK.js";
import { f as isAgentRunRestartAbortReason, i as AGENT_RUN_RESTART_ABORT_STOP_REASON, m as resolveAgentRunAbortLifecycleFields, o as AGENT_RUN_SUPERSEDED_STOP_REASON, p as isAgentRunSupersededAbortReason, t as AGENT_RUN_ABORTED_ERROR, u as isAbortedAgentStopReason } from "./run-termination-Ts9RsbeN.js";
//#region src/shared/agent-liveness.ts
/** Return true for the normalized liveness state that means a run is blocked. */
function isBlockedLivenessState(livenessState) {
	return typeof livenessState === "string" && livenessState.trim().toLowerCase() === "blocked";
}
/** Return true for the normalized liveness state that means a run ended incomplete. */
function isAbandonedLivenessState(livenessState) {
	return typeof livenessState === "string" && livenessState.trim().toLowerCase() === "abandoned";
}
/** Convert a blocked-run error payload into a user-facing wait/status message. */
function formatBlockedLivenessError(error) {
	return (typeof error === "string" ? error.trim() : "") || "Agent run blocked before producing a usable result.";
}
/** Convert an abandoned-run error payload into a user-facing wait/status message. */
function formatAbandonedLivenessError(error) {
	return (typeof error === "string" ? error.trim() : "") || "Agent run ended before producing a complete result.";
}
/** Coerce any blocked liveness state into an error status while preserving other statuses. */
function normalizeBlockedLivenessWaitStatus(params) {
	const error = typeof params.error === "string" ? params.error : void 0;
	if (!isBlockedLivenessState(params.livenessState)) return {
		status: params.status,
		error
	};
	return {
		status: "error",
		error: formatBlockedLivenessError(error)
	};
}
//#endregion
//#region src/agents/run-timeout-attribution.ts
const AGENT_RUN_TIMEOUT_PHASE_SET = /* @__PURE__ */ new Set([
	"queue",
	"preflight",
	"provider",
	"post_turn",
	"gateway_draining"
]);
/** Normalizes raw timeout phase metadata into a known agent run phase. */
function normalizeAgentRunTimeoutPhase(value) {
	if (typeof value !== "string") return;
	const normalized = value.trim();
	return AGENT_RUN_TIMEOUT_PHASE_SET.has(normalized) ? normalized : void 0;
}
//#endregion
//#region src/agents/agent-run-terminal-outcome.ts
/** Normalizes agent run wait/liveness/timeout metadata into sticky terminal outcomes. */
const ATTEMPT_TERMINAL_KIND_RANK = {
	ok: 0,
	failed: 1,
	aborted: 2,
	timeout: 3
};
const ATTEMPT_TIMEOUT_PHASE_RANK = {
	prompt: 0,
	tool_execution: 1,
	compaction: 2
};
const ATTEMPT_TIMEOUT_SOURCE_RANK = {
	observation: 0,
	runtime: 1,
	idle: 2,
	run_budget: 3,
	external: 4
};
const ATTEMPT_ABORT_SOURCE_RANK = {
	yield_cleanup: 0,
	runtime: 1,
	external: 2
};
function mergeAgentRunAttemptTimeoutPhase(phase, observation) {
	return observation && ATTEMPT_TIMEOUT_PHASE_RANK[observation] > ATTEMPT_TIMEOUT_PHASE_RANK[phase] ? observation : phase;
}
function getAgentRunAttemptFailure(terminal) {
	return terminal.kind === "failed" ? {
		source: terminal.source,
		error: terminal.error
	} : terminal.kind === "ok" ? void 0 : terminal.failure;
}
function withAgentRunAttemptFailure(terminal, failure) {
	if (!failure || terminal.kind === "ok") return terminal;
	if (terminal.kind === "failed") return {
		...terminal,
		...failure
	};
	return {
		...terminal,
		failure
	};
}
function withAgentRunAttemptTimeoutObservation(terminal, phase) {
	const timeoutObservation = terminal.timeoutObservation === "compaction" || phase === "compaction" ? "compaction" : "tool_execution";
	return {
		...terminal,
		timeoutObservation
	};
}
function hasAgentRunAttemptTimeoutAbort(terminal) {
	return terminal.kind === "timeout" && terminal.source !== "observation" && terminal.aborted === true;
}
/** Replaces attempt failure detail without changing a stronger interruption. */
function setAgentRunAttemptTerminalFailure(terminal, failure) {
	if (!failure) {
		if (terminal.kind === "failed") return terminal.timeoutObservation ? {
			kind: "timeout",
			phase: terminal.timeoutObservation,
			source: "observation"
		} : { kind: "ok" };
		if (terminal.kind === "aborted" || terminal.kind === "timeout") {
			const { failure: _failure, ...withoutFailure } = terminal;
			return withoutFailure;
		}
		return terminal;
	}
	if (terminal.kind === "timeout" && terminal.source === "observation") return {
		kind: "failed",
		...failure,
		timeoutObservation: terminal.phase
	};
	if (terminal.kind === "failed" || terminal.kind === "ok") return {
		kind: "failed",
		...failure,
		...terminal.kind === "failed" && terminal.timeoutObservation && { timeoutObservation: terminal.timeoutObservation }
	};
	return {
		...terminal,
		failure
	};
}
/** Merges attempt observations while keeping terminal precedence in one owner. */
function mergeAgentRunAttemptTerminal(current, incoming) {
	if (incoming.kind === "ok") return current;
	const failure = getAgentRunAttemptFailure(incoming) ?? getAgentRunAttemptFailure(current);
	if (incoming.kind === "timeout" && incoming.source === "observation" && current.kind !== "timeout") return current.kind === "ok" ? withAgentRunAttemptFailure(incoming, failure) : withAgentRunAttemptFailure(withAgentRunAttemptTimeoutObservation(current, incoming.phase), failure);
	if (current.kind === "timeout" && current.source === "observation" && incoming.kind !== "timeout") return incoming.kind === "failed" || incoming.kind === "aborted" ? withAgentRunAttemptFailure(withAgentRunAttemptTimeoutObservation(incoming, current.phase), failure) : withAgentRunAttemptFailure(incoming, failure);
	if (current.kind === "timeout" && incoming.kind === "timeout") {
		const phase = ATTEMPT_TIMEOUT_PHASE_RANK[incoming.phase] > ATTEMPT_TIMEOUT_PHASE_RANK[current.phase] ? incoming.phase : current.phase;
		const selected = ATTEMPT_TIMEOUT_SOURCE_RANK[incoming.source] > ATTEMPT_TIMEOUT_SOURCE_RANK[current.source] ? incoming : current;
		if (selected.source === "observation") return withAgentRunAttemptFailure({
			kind: "timeout",
			phase: current.phase === "compaction" || incoming.phase === "compaction" ? "compaction" : "tool_execution",
			source: "observation"
		}, failure);
		return withAgentRunAttemptFailure({
			kind: "timeout",
			phase,
			source: selected.source,
			...(hasAgentRunAttemptTimeoutAbort(current) || hasAgentRunAttemptTimeoutAbort(incoming)) && { aborted: true }
		}, failure);
	}
	if ((current.kind === "aborted" || current.kind === "failed") && incoming.kind === "timeout") {
		if (incoming.source === "observation") return withAgentRunAttemptFailure(withAgentRunAttemptTimeoutObservation(current, incoming.phase), failure);
		const source = current.kind === "aborted" && current.source === "external" ? "external" : incoming.source;
		const phase = mergeAgentRunAttemptTimeoutPhase(incoming.phase, current.timeoutObservation);
		return withAgentRunAttemptFailure({
			...incoming,
			phase,
			source,
			...(current.kind === "aborted" && current.source !== "yield_cleanup" || incoming.aborted === true) && { aborted: true }
		}, failure);
	}
	if (current.kind === "timeout" && (incoming.kind === "aborted" || incoming.kind === "failed")) {
		if (current.source === "observation") return withAgentRunAttemptFailure(withAgentRunAttemptTimeoutObservation(incoming, current.phase), failure);
		const source = incoming.kind === "aborted" && incoming.source === "external" ? "external" : current.source;
		const phase = mergeAgentRunAttemptTimeoutPhase(current.phase, incoming.timeoutObservation);
		return withAgentRunAttemptFailure({
			...current,
			phase,
			source,
			...(incoming.kind === "aborted" && incoming.source !== "yield_cleanup" || current.aborted === true) && { aborted: true }
		}, failure);
	}
	if ((current.kind === "aborted" || current.kind === "failed") && (incoming.kind === "aborted" || incoming.kind === "failed")) {
		let selected;
		if (current.kind === "aborted" && incoming.kind === "aborted") selected = {
			kind: "aborted",
			source: ATTEMPT_ABORT_SOURCE_RANK[incoming.source] > ATTEMPT_ABORT_SOURCE_RANK[current.source] ? incoming.source : current.source
		};
		else selected = ATTEMPT_TERMINAL_KIND_RANK[incoming.kind] >= ATTEMPT_TERMINAL_KIND_RANK[current.kind] ? incoming : current;
		for (const observation of [current.timeoutObservation, incoming.timeoutObservation]) if (observation) selected = withAgentRunAttemptTimeoutObservation(selected, observation);
		return withAgentRunAttemptFailure(selected, failure);
	}
	return withAgentRunAttemptFailure(ATTEMPT_TERMINAL_KIND_RANK[incoming.kind] >= ATTEMPT_TERMINAL_KIND_RANK[current.kind] ? incoming : current, failure);
}
/** Normalizes the shipped harness result shape at the Plugin SDK boundary. */
function normalizeAgentRunAttemptTerminal(input) {
	let terminal = { kind: "ok" };
	if (input.aborted || input.externalAbort) terminal = mergeAgentRunAttemptTerminal(terminal, {
		kind: "aborted",
		source: input.externalAbort ? "external" : "runtime"
	});
	if (input.timedOut || input.idleTimedOut || input.timedOutByRunBudget) terminal = mergeAgentRunAttemptTerminal(terminal, {
		kind: "timeout",
		phase: input.timedOutDuringCompaction ? "compaction" : input.timedOutDuringToolExecution ? "tool_execution" : "prompt",
		source: input.externalAbort ? "external" : input.timedOutByRunBudget ? "run_budget" : input.idleTimedOut ? "idle" : "runtime",
		...(input.aborted || input.externalAbort) && { aborted: true }
	});
	else if (input.timedOutDuringCompaction || input.timedOutDuringToolExecution) terminal = mergeAgentRunAttemptTerminal(terminal, {
		kind: "timeout",
		phase: input.timedOutDuringCompaction ? "compaction" : "tool_execution",
		source: "observation"
	});
	if (input.promptError !== null && input.promptError !== void 0) terminal = setAgentRunAttemptTerminalFailure(terminal, {
		error: input.promptError,
		source: input.promptErrorSource ?? "prompt"
	});
	return terminal;
}
/** Projects the closed attempt terminal into legacy event/meta fields. */
function projectAgentRunAttemptTerminal(terminal) {
	const failure = getAgentRunAttemptFailure(terminal);
	const externalAbort = (terminal.kind === "aborted" || terminal.kind === "timeout") && terminal.source === "external";
	const timedOut = terminal.kind === "timeout" && terminal.source !== "observation";
	return {
		aborted: terminal.kind === "aborted" && terminal.source !== "yield_cleanup" || terminal.kind === "timeout" && terminal.source !== "observation" && terminal.aborted === true,
		cleanupYieldAborted: terminal.kind === "aborted" && terminal.source === "yield_cleanup",
		externalAbort,
		failed: failure !== void 0,
		idleTimedOut: terminal.kind === "timeout" && terminal.source === "idle",
		interrupted: externalAbort || timedOut,
		promptError: failure ? failure.error : null,
		promptErrorSource: failure?.source ?? null,
		timedOut,
		timedOutByRunBudget: terminal.kind === "timeout" && terminal.source === "run_budget",
		timedOutDuringCompaction: terminal.kind === "timeout" && terminal.phase === "compaction" || (terminal.kind === "aborted" || terminal.kind === "failed") && terminal.timeoutObservation === "compaction",
		timedOutDuringToolExecution: terminal.kind === "timeout" && terminal.phase === "tool_execution" || (terminal.kind === "aborted" || terminal.kind === "failed") && terminal.timeoutObservation === "tool_execution"
	};
}
const AGENT_RUN_TERMINAL_CLASSIFICATION = {
	completed: "success",
	hard_timeout: "timeout",
	timed_out: "timeout",
	superseded: "cancellation",
	cancelled: "cancellation",
	aborted: "cancellation",
	blocked: "failure",
	abandoned: "failure",
	failed: "failure"
};
/** Collapses terminal reasons into the four projections shared by run consumers. */
function classifyAgentRunTerminalOutcome(outcome) {
	return AGENT_RUN_TERMINAL_CLASSIFICATION[outcome.reason];
}
/** Shared grace window for terminal observations that may still be followed by a retry. */
const AGENT_RUN_TERMINAL_RETRY_GRACE_MS = 15e3;
const HARD_TIMEOUT_PHASES = /* @__PURE__ */ new Set([
	"preflight",
	"provider",
	"post_turn"
]);
/** True when a timeout phase should be treated as a hard agent-run timeout. */
function isHardAgentRunTimeoutPhase(value) {
	const phase = normalizeAgentRunTimeoutPhase(value);
	return phase !== void 0 && HARD_TIMEOUT_PHASES.has(phase);
}
/** True when an outcome should not be overwritten by ordinary later status. */
function isStickyAgentRunTerminalOutcome(outcome) {
	return outcome?.reason === "hard_timeout" || outcome?.reason === "superseded" || outcome?.reason === "cancelled";
}
function isCancellationStopReason(value) {
	return value === "rpc" || value === "stop";
}
function asAgentRunWaitStatus(value) {
	return value === "ok" || value === "timeout" || value === "error" || value === "pending" ? value : void 0;
}
/** Builds the normalized terminal outcome from raw run status metadata. */
function buildAgentRunTerminalOutcome(input) {
	const stopReason = readNonBlankString(input.stopReason);
	const livenessState = readNonBlankString(input.livenessState);
	const timeoutPhase = normalizeAgentRunTimeoutPhase(input.timeoutPhase);
	const providerStarted = asBoolean(input.providerStarted);
	const rawError = readNonBlankString(input.error);
	const restartCancelled = stopReason === AGENT_RUN_RESTART_ABORT_STOP_REASON;
	const superseded = stopReason === AGENT_RUN_SUPERSEDED_STOP_REASON;
	const hardTimeout = isHardAgentRunTimeoutPhase(timeoutPhase) || !restartCancelled && input.status === "timeout" && providerStarted === true;
	const aborted = isAbortedAgentStopReason(stopReason) && !restartCancelled;
	const cancelled = restartCancelled || input.status !== "ok" && isCancellationStopReason(stopReason);
	const blocked = isBlockedLivenessState(livenessState);
	const abandoned = isAbandonedLivenessState(livenessState);
	const error = hardTimeout ? rawError : blocked ? formatBlockedLivenessError(rawError) : aborted && !rawError ? AGENT_RUN_ABORTED_ERROR : superseded || aborted || cancelled ? rawError : abandoned ? formatAbandonedLivenessError(rawError) : rawError;
	const reason = hardTimeout ? "hard_timeout" : superseded ? "superseded" : blocked ? "blocked" : aborted ? "aborted" : cancelled ? "cancelled" : abandoned ? "abandoned" : input.status === "timeout" ? "timed_out" : input.status === "error" ? "failed" : "completed";
	return {
		reason,
		status: reason === "completed" ? "ok" : reason === "hard_timeout" || reason === "timed_out" ? "timeout" : "error",
		...error ? { error } : {},
		...stopReason ? { stopReason } : {},
		...livenessState ? { livenessState } : {},
		...timeoutPhase ? { timeoutPhase } : {},
		...providerStarted !== void 0 ? { providerStarted } : {},
		...asFiniteNumber(input.startedAt) !== void 0 ? { startedAt: asFiniteNumber(input.startedAt) } : {},
		...asFiniteNumber(input.endedAt) !== void 0 ? { endedAt: asFiniteNumber(input.endedAt) } : {}
	};
}
/** Builds the canonical outcome directly from a terminal lifecycle event. */
function buildAgentRunTerminalOutcomeFromLifecycleEvent(input) {
	const data = input.data;
	const abortFields = typeof data?.aborted === "boolean" ? {} : resolveAgentRunAbortLifecycleFields(input.abortSignal);
	const stopReason = readNonBlankString(data?.stopReason) ?? abortFields.stopReason;
	const timeoutPhase = normalizeAgentRunTimeoutPhase(data?.timeoutPhase);
	const lifecycleStatus = readNonBlankString(data?.status)?.toLowerCase();
	const timedOut = stopReason === "timeout" || timeoutPhase !== void 0 || lifecycleStatus === "timeout" || lifecycleStatus === "timed_out";
	const aborted = data?.aborted === true || abortFields.aborted === true || lifecycleStatus === "aborted";
	const cancellationStatus = lifecycleStatus === "cancelled" || lifecycleStatus === "canceled" || lifecycleStatus === "aborted" || lifecycleStatus === "superseded";
	const cancelled = cancellationStatus || aborted;
	const failed = input.phase === "error" || lifecycleStatus === "error" || lifecycleStatus === "failed" || stopReason === "error";
	const normalizedStopReason = !timedOut && cancelled && !isAbortedAgentStopReason(stopReason) && !isCancellationStopReason(stopReason) && stopReason !== "superseded" && (stopReason === void 0 || cancellationStatus) ? aborted ? "aborted" : "stop" : stopReason;
	const outcome = buildAgentRunTerminalOutcome({
		status: timedOut ? "timeout" : cancelled || failed ? "error" : "ok",
		error: data?.error,
		stopReason: normalizedStopReason,
		livenessState: data?.livenessState,
		timeoutPhase,
		providerStarted: data?.providerStarted,
		startedAt: input.startedAt ?? data?.startedAt,
		endedAt: input.endedAt ?? data?.endedAt
	});
	return stopReason && outcome.stopReason !== stopReason ? {
		...outcome,
		stopReason
	} : outcome;
}
/** Reads the outer execution owner's publication fact, independent of outcome. */
function hasExecutionSettlement(data) {
	return data?.executionSettled === true;
}
/** True for lifecycle events that cannot be followed by a same-run retry. */
function isDefinitiveRunLifecycle(input) {
	if (input.phase === "end") return true;
	if (input.phase !== "error") return false;
	const outcome = buildAgentRunTerminalOutcomeFromLifecycleEvent({
		phase: "error",
		data: input.data
	});
	return hasExecutionSettlement(input.data) || input.data?.fallbackExhaustedFailure === true || outcome.reason !== "failed";
}
function hasNestedAbortReason(value, matches) {
	let candidate = value;
	for (let depth = 0; depth < 3; depth += 1) {
		if (matches(candidate)) return true;
		if (!(candidate instanceof Error)) return false;
		try {
			if (candidate.cause === void 0) return false;
			candidate = candidate.cause;
		} catch {
			return false;
		}
	}
	return false;
}
/** Maps the closed embedded-attempt terminal into the canonical run outcome. */
function buildAgentRunTerminalOutcomeFromAttempt(input) {
	const projected = projectAgentRunAttemptTerminal(input.terminal);
	const abortFields = resolveAgentRunAbortLifecycleFields(input.abortSignal);
	const timedOut = projected.timedOut || abortFields.stopReason === "timeout";
	const timedOutDuringPrompt = projected.timedOut && input.terminal.kind === "timeout" && input.terminal.phase === "prompt";
	const timeoutPhase = input.promptTimeoutOutcome?.timeoutPhase ?? (timedOutDuringPrompt ? "provider" : void 0);
	const providerStarted = input.promptTimeoutOutcome?.providerStarted ?? (timedOutDuringPrompt ? true : void 0);
	const restartAborted = hasNestedAbortReason(projected.promptError, isAgentRunRestartAbortReason);
	const superseded = hasNestedAbortReason(projected.promptError, isAgentRunSupersededAbortReason);
	const assistantStopReason = projected.promptErrorSource !== null ? void 0 : input.assistant?.stopReason;
	const stopReason = projected.timedOut && timeoutPhase === void 0 && providerStarted !== true ? void 0 : (superseded ? "superseded" : void 0) ?? abortFields.stopReason ?? (restartAborted ? "restart" : void 0) ?? (!timedOut && projected.aborted ? "aborted" : void 0) ?? (!timedOut ? assistantStopReason : void 0);
	return buildAgentRunTerminalOutcome({
		status: timedOut ? "timeout" : abortFields.aborted || projected.aborted || projected.promptErrorSource !== null || assistantStopReason === "error" ? "error" : "ok",
		error: projected.promptErrorSource !== null ? projected.promptError : input.assistant?.errorMessage,
		stopReason,
		livenessState: input.promptTimeoutOutcome?.livenessState,
		timeoutPhase,
		providerStarted
	});
}
/** Builds a terminal outcome from wait paths where status may still be pending/unknown. */
function buildAgentRunTerminalOutcomeFromWaitResult(wait) {
	const status = asAgentRunWaitStatus(wait?.status);
	if (!status || status === "pending") return;
	return buildAgentRunTerminalOutcome({
		status,
		error: wait?.error,
		stopReason: wait?.stopReason,
		livenessState: wait?.livenessState,
		timeoutPhase: wait?.timeoutPhase,
		providerStarted: wait?.providerStarted,
		startedAt: wait?.startedAt,
		endedAt: wait?.endedAt
	});
}
//#endregion
export { buildAgentRunTerminalOutcomeFromWaitResult as a, isDefinitiveRunLifecycle as c, normalizeAgentRunAttemptTerminal as d, projectAgentRunAttemptTerminal as f, normalizeBlockedLivenessWaitStatus as h, buildAgentRunTerminalOutcomeFromLifecycleEvent as i, isStickyAgentRunTerminalOutcome as l, normalizeAgentRunTimeoutPhase as m, buildAgentRunTerminalOutcome as n, classifyAgentRunTerminalOutcome as o, setAgentRunAttemptTerminalFailure as p, buildAgentRunTerminalOutcomeFromAttempt as r, hasExecutionSettlement as s, AGENT_RUN_TERMINAL_RETRY_GRACE_MS as t, mergeAgentRunAttemptTerminal as u };
