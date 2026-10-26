import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { O as parseAgentSessionKey } from "./session-key-CRjxKW0X.js";
import { r as getTaskActivitySnapshot } from "./task-registry-activity-DSlVVJwD.js";
import { c as sanitizeTaskStatusText, i as formatTaskStatusTitle, s as sanitizeTaskPromptText } from "./task-status-BoHY3pXn.js";
import { n as hasOperatorBoundary } from "./operator-role-policy-B_VzZMic.js";
import { O as authorizeIncognitoSessionTarget, P as isGatewayAdmin, R as resolveSessionSharingTarget, j as authorizeSessionSharingTarget, n as createSessionListEntryFilter } from "./session-sharing-BlMqwMBH.js";
//#region src/gateway/task-session-access.ts
function resolveTaskRequesterSessionTarget(task) {
	const sessionKey = normalizeOptionalString(task.requesterSessionKey);
	if (!sessionKey) return;
	const agentId = normalizeOptionalString(task.requesterAgentId) ?? parseAgentSessionKey(sessionKey)?.agentId ?? parseAgentSessionKey(task.ownerKey)?.agentId;
	return {
		sessionKey,
		...agentId ? { agentId } : {}
	};
}
function canAccessTaskRequesterSession(params) {
	const target = resolveTaskRequesterSessionTarget(params.task);
	if (!target || isGatewayAdmin(params.client)) return true;
	const sharingTarget = resolveSessionSharingTarget({
		cfg: params.cfg,
		...params.storeCache ? { storeCache: params.storeCache } : {},
		...params.targetDiscoveryCache ? { targetDiscoveryCache: params.targetDiscoveryCache } : {},
		...target
	});
	if (authorizeIncognitoSessionTarget({
		client: params.client,
		sessionKey: target.sessionKey,
		target: sharingTarget
	})) return false;
	if (!hasOperatorBoundary(params.client, params.cfg)) return true;
	if (!sharingTarget) return false;
	if (params.access === "write") return !authorizeSessionSharingTarget({
		cfg: params.cfg,
		client: params.client,
		target: sharingTarget
	});
	return createSessionListEntryFilter({
		cfg: params.cfg,
		client: params.client
	})?.(sharingTarget.storeKey, sharingTarget.entry) ?? true;
}
//#endregion
//#region src/gateway/server-methods/task-summary.ts
const TASK_PROMPT_MAX_CHARS = 4e3;
const TASK_RESULT_MAX_CHARS = 4e3;
const TASK_STATUS_TO_LEDGER_STATUS = {
	queued: "queued",
	running: "running",
	succeeded: "completed",
	failed: "failed",
	timed_out: "timed_out",
	cancelled: "cancelled",
	lost: "failed"
};
function taskUpdatedAt(task) {
	return task.lastEventAt ?? task.endedAt ?? task.startedAt ?? task.createdAt;
}
function sanitizeOptionalTaskText(value, opts) {
	return sanitizeTaskStatusText(value, {
		errorContext: opts?.errorContext,
		maxChars: 120
	}) || void 0;
}
function mapTaskSummary(task, opts) {
	const activity = getTaskActivitySnapshot(task.taskId);
	const lastActivity = sanitizeOptionalTaskText(activity?.lastActivity);
	const progressSummary = sanitizeOptionalTaskText(task.progressSummary);
	const terminalSummary = sanitizeOptionalTaskText(task.terminalSummary, { errorContext: true });
	const error = sanitizeOptionalTaskText(task.error, { errorContext: true });
	const lastToolName = sanitizeOptionalTaskText(task.lastToolName);
	const prompt = opts?.includePrompt ? sanitizeTaskPromptText(task.task, TASK_PROMPT_MAX_CHARS) || void 0 : void 0;
	const progressResult = opts?.includePrompt ? sanitizeTaskStatusText(task.progressSummary, { maxChars: TASK_RESULT_MAX_CHARS }) : "";
	const terminalResult = opts?.includePrompt ? sanitizeTaskStatusText(task.terminalSummary, {
		errorContext: true,
		maxChars: TASK_RESULT_MAX_CHARS
	}) : "";
	const result = (task.runtime === "subagent" || task.runtime === "acp" ? progressResult : terminalResult || progressResult) || void 0;
	const toolUseCount = typeof task.toolUseCount === "number" && Number.isInteger(task.toolUseCount) ? Math.max(0, task.toolUseCount) : void 0;
	return {
		id: task.taskId,
		taskId: task.taskId,
		kind: task.taskKind ?? task.runtime,
		runtime: task.runtime,
		status: TASK_STATUS_TO_LEDGER_STATUS[task.status],
		title: formatTaskStatusTitle(task),
		...task.agentId ? { agentId: task.agentId } : {},
		sessionKey: task.requesterSessionKey,
		...task.childSessionKey ? { childSessionKey: task.childSessionKey } : {},
		ownerKey: task.ownerKey,
		...task.runId ? { runId: task.runId } : {},
		...task.parentFlowId ? { flowId: task.parentFlowId } : {},
		...task.parentTaskId ? { parentTaskId: task.parentTaskId } : {},
		...task.sourceId ? { sourceId: task.sourceId } : {},
		createdAt: task.createdAt,
		updatedAt: taskUpdatedAt(task),
		...task.startedAt !== void 0 ? { startedAt: task.startedAt } : {},
		...task.endedAt !== void 0 ? { endedAt: task.endedAt } : {},
		...toolUseCount !== void 0 ? { toolUseCount } : {},
		...lastToolName ? { lastToolName } : {},
		...lastActivity ? { lastActivity } : {},
		...activity?.diffStat ? { diffStat: activity.diffStat } : {},
		...progressSummary ? { progressSummary } : {},
		...terminalSummary ? { terminalSummary } : {},
		...error ? { error } : {},
		deliveryStatus: task.deliveryStatus,
		...task.terminalOutcome ? { terminalOutcome: task.terminalOutcome } : {},
		...result ? { result } : {},
		...prompt ? { prompt } : {}
	};
}
//#endregion
export { canAccessTaskRequesterSession as n, resolveTaskRequesterSessionTarget as r, mapTaskSummary as t };
