import { h as finiteSecondsToTimerSafeMilliseconds, o as asDateTimestampMs } from "./number-coercion-CLj0HTDM.js";
//#region src/agents/subagents/registry/subagent-run-timeout.ts
/**
* Subagent run timeout math.
*
* Separates timer-safe delays from duration/deadline values because setTimeout has stricter bounds.
*/
/** Convert subagent timeout seconds to a timer-safe delay. */
function resolveSubagentRunTimerDelayMs(timeoutSeconds) {
	return finiteSecondsToTimerSafeMilliseconds(timeoutSeconds, { floorSeconds: true });
}
/** Convert subagent timeout seconds to a finite millisecond duration. */
function resolveSubagentRunDurationMs(timeoutSeconds) {
	if (typeof timeoutSeconds !== "number" || !Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) return;
	const durationMs = Math.floor(timeoutSeconds) * 1e3;
	return Number.isSafeInteger(durationMs) && durationMs > 0 ? durationMs : void 0;
}
/** Resolve the absolute timeout deadline for a subagent run. */
function resolveSubagentRunDeadlineMs(entry, observedStartedAt) {
	const durationMs = resolveSubagentRunDurationMs(entry.runTimeoutSeconds);
	if (durationMs === void 0) return;
	const startedAt = typeof observedStartedAt === "number" && Number.isFinite(observedStartedAt) ? observedStartedAt : typeof entry.execution.startedAt === "number" && Number.isFinite(entry.execution.startedAt) ? entry.execution.startedAt : entry.collect ? void 0 : entry.createdAt;
	const safeStartedAt = asDateTimestampMs(startedAt);
	if (safeStartedAt === void 0) return;
	const deadlineMs = safeStartedAt + durationMs;
	return Number.isSafeInteger(deadlineMs) && asDateTimestampMs(deadlineMs) !== void 0 ? deadlineMs : void 0;
}
/** Clamp a reported terminal time to the run's explicit timeout deadline. */
function resolveSubagentRunEffectiveEndedAt(entry, endedAt, observedStartedAt) {
	const deadlineMs = resolveSubagentRunDeadlineMs(entry, observedStartedAt);
	return deadlineMs !== void 0 && endedAt > deadlineMs ? deadlineMs : endedAt;
}
//#endregion
//#region src/agents/subagents/registry/subagent-lifecycle-events.ts
/**
* Shared subagent lifecycle event literals.
*
* Event writers and readers use these constants to keep subagent target,
* end-reason, and outcome values stable across registry/runtime boundaries.
*/
/** Target kind used for subagent lifecycle events. */
const SUBAGENT_TARGET_KIND_SUBAGENT = "subagent";
/** End reason for a completed subagent run. */
const SUBAGENT_ENDED_REASON_COMPLETE = "subagent-complete";
/** End reason for a failed subagent run. */
const SUBAGENT_ENDED_REASON_ERROR = "subagent-error";
/** End reason for an explicitly killed subagent run. */
const SUBAGENT_ENDED_REASON_KILLED = "subagent-killed";
/** Error subagent lifecycle outcome. */
const SUBAGENT_ENDED_OUTCOME_ERROR = "error";
/** Timeout subagent lifecycle outcome. */
const SUBAGENT_ENDED_OUTCOME_TIMEOUT = "timeout";
/** Killed subagent lifecycle outcome. */
const SUBAGENT_ENDED_OUTCOME_KILLED = "killed";
//#endregion
//#region src/agents/subagents/registry/subagent-session-metrics.ts
/**
* Subagent session metric helpers.
*
* Derives display/runtime status from partial live, archived, or recovered registry records.
*/
/** Returns a recorded execution start, never the earlier admission time. */
function getSubagentSessionStartedAt(entry) {
	if (!entry) return;
	if (typeof entry.sessionStartedAt === "number" && Number.isFinite(entry.sessionStartedAt)) return entry.sessionStartedAt;
	if (typeof entry.execution.startedAt === "number" && Number.isFinite(entry.execution.startedAt)) return entry.execution.startedAt;
}
/** Computes accumulated runtime including the current live run when still active. */
function getSubagentSessionRuntimeMs(entry, now = Date.now()) {
	if (!entry) return;
	const accumulatedRuntimeMs = typeof entry.accumulatedRuntimeMs === "number" && Number.isFinite(entry.accumulatedRuntimeMs) ? Math.max(0, entry.accumulatedRuntimeMs) : 0;
	const startedAt = entry.execution.startedAt;
	if (typeof startedAt !== "number" || !Number.isFinite(startedAt)) return accumulatedRuntimeMs > 0 ? accumulatedRuntimeMs : void 0;
	const endedAt = entry.execution.endedAt;
	return Math.max(0, accumulatedRuntimeMs + Math.max(0, (typeof endedAt === "number" && Number.isFinite(endedAt) ? endedAt : now) - startedAt));
}
/** Maps persisted run outcome fields to the compact session status shown in tools/UI. */
function resolveSubagentSessionStatus(entry) {
	if (!entry) return;
	if (!entry.execution.endedAt) return entry.execution.status === "queued" ? "queued" : "running";
	if (entry.endedReason === "subagent-killed") return "killed";
	const status = entry.execution.outcome?.status;
	if (status === "error") return "failed";
	if (status === "timeout") return "timeout";
	return "done";
}
/** Formats the authoritative run status while preserving unfinished descendants. */
function resolveSubagentDisplayStatus(entry, pendingDescendants = 0) {
	const status = resolveSubagentSessionStatus(entry) ?? "done";
	const pending = Math.max(0, pendingDescendants);
	if (pending > 0) {
		const waiting = `waiting on ${pending} ${pending === 1 ? "child" : "children"}`;
		return status === "running" || status === "done" ? `active (${waiting})` : `${status} (${waiting})`;
	}
	return status;
}
//#endregion
//#region src/agents/subagents/registry/subagent-run-liveness.ts
const STALE_UNENDED_SUBAGENT_RUN_MS = 72e5;
const RECENT_ENDED_SUBAGENT_CHILD_SESSION_MS = 18e5;
const EXPLICIT_TIMEOUT_STALE_GRACE_MS = 6e4;
const MIN_REALISTIC_RUN_TIMESTAMP_MS = Date.UTC(2020, 0, 1);
/** Return whether a subagent run has a finite execution end timestamp. */
function hasSubagentRunEnded(entry) {
	return typeof entry.execution.endedAt === "number" && Number.isFinite(entry.execution.endedAt);
}
function resolveStaleCutoffMs(entry) {
	const durationMs = resolveSubagentRunDurationMs(entry.runTimeoutSeconds);
	if (durationMs !== void 0) return Math.max(STALE_UNENDED_SUBAGENT_RUN_MS, durationMs + EXPLICIT_TIMEOUT_STALE_GRACE_MS);
	return STALE_UNENDED_SUBAGENT_RUN_MS;
}
/** Return whether an unended subagent run is stale enough to hide as inactive. */
function isStaleUnendedSubagentRun(entry, now = Date.now()) {
	if (hasSubagentRunEnded(entry)) return false;
	const startedAt = getSubagentSessionStartedAt(entry) ?? entry.createdAt;
	if (typeof startedAt !== "number" || !Number.isFinite(startedAt) || startedAt < MIN_REALISTIC_RUN_TIMESTAMP_MS) return false;
	return now - startedAt > resolveStaleCutoffMs(entry);
}
/** Return whether a subagent run is still live and unended. */
function isLiveUnendedSubagentRun(entry, now = Date.now()) {
	return !hasSubagentRunEnded(entry) && !isStaleUnendedSubagentRun(entry, now);
}
function isRecentlyEndedSubagentRun(entry, now = Date.now(), recentMs = RECENT_ENDED_SUBAGENT_CHILD_SESSION_MS) {
	if (!hasSubagentRunEnded(entry)) return false;
	return now - entry.execution.endedAt <= recentMs;
}
/** Return whether a child-session link should still appear in subagent listings. */
function shouldKeepSubagentRunChildLink(entry, options) {
	const now = options?.now ?? Date.now();
	return isLiveUnendedSubagentRun(entry, now) || (options?.activeDescendants ?? 0) > 0 || isRecentlyEndedSubagentRun(entry, now);
}
//#endregion
export { resolveSubagentRunDeadlineMs as _, shouldKeepSubagentRunChildLink as a, resolveSubagentDisplayStatus as c, SUBAGENT_ENDED_OUTCOME_KILLED as d, SUBAGENT_ENDED_OUTCOME_TIMEOUT as f, SUBAGENT_TARGET_KIND_SUBAGENT as g, SUBAGENT_ENDED_REASON_KILLED as h, isStaleUnendedSubagentRun as i, resolveSubagentSessionStatus as l, SUBAGENT_ENDED_REASON_ERROR as m, hasSubagentRunEnded as n, getSubagentSessionRuntimeMs as o, SUBAGENT_ENDED_REASON_COMPLETE as p, isLiveUnendedSubagentRun as r, getSubagentSessionStartedAt as s, RECENT_ENDED_SUBAGENT_CHILD_SESSION_MS as t, SUBAGENT_ENDED_OUTCOME_ERROR as u, resolveSubagentRunEffectiveEndedAt as v, resolveSubagentRunTimerDelayMs as y };
