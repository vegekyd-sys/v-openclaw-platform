import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { Fa as validateTasksRecoveryParams, Ma as validateTasksCancelParams, Na as validateTasksGetParams, Pa as validateTasksListParams } from "./src-B9mb84px.js";
import { t as ErrorCodes } from "./gateway-error-details-B9ifm8Ur.js";
import { d as errorShape } from "./error-codes-DKSaEjvx.js";
import { n as canonicalizeMainSessionAlias } from "./main-session-TZQkcBLs.js";
import { S as getTaskById, T as listTaskRecordPage } from "./task-registry-B4-CJZk7.js";
import "./runtime-internal-_JeaUumR.js";
import "./sessions-eI69vxPt.js";
import { v as readGatewayAccessRevision } from "./operator-role-policy-B_VzZMic.js";
import { n as resolveRequestedSessionAgentId } from "./session-request-agent-Db9uggbl.js";
import { i as retrySubagentCompletionDelivery, n as dismissSubagentCompletionDelivery } from "./subagent-completion-delivery-fFWP8SI_.js";
import { t as assertValidParams } from "./validation-D9mcPHCB.js";
import { n as canAccessTaskRequesterSession, t as mapTaskSummary } from "./task-summary-qdovVAE7.js";
//#region src/gateway/server-methods/tasks.ts
const DEFAULT_TASKS_LIST_LIMIT = 100;
const MAX_TASKS_LIST_LIMIT = 500;
const TASKS_LIST_MAX_ATTEMPTS = 3;
const LEDGER_STATUS_TO_TASK_STATUSES = {
	queued: ["queued"],
	running: ["running"],
	completed: ["succeeded"],
	failed: ["failed", "lost"],
	timed_out: ["timed_out"],
	cancelled: ["cancelled"]
};
function normalizeTaskStatusFilter(status) {
	if (!status) return null;
	return new Set((Array.isArray(status) ? status : [status]).flatMap((value) => LEDGER_STATUS_TO_TASK_STATUSES[value] ?? []));
}
function parseCursor(cursor) {
	if (!cursor) return 0;
	if (!/^\d+$/.test(cursor.trim())) return null;
	const parsed = Number(cursor);
	return Number.isSafeInteger(parsed) ? parsed : null;
}
const tasksHandlers = {
	"tasks.list": async ({ params, respond, context, client }) => {
		if (!assertValidParams(params, validateTasksListParams, "tasks.list", respond)) return;
		const cursor = parseCursor(params.cursor);
		if (cursor === null) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "invalid tasks.list cursor"));
			return;
		}
		const statusFilter = normalizeTaskStatusFilter(params.status);
		const limit = Math.min(params.limit ?? DEFAULT_TASKS_LIST_LIMIT, MAX_TASKS_LIST_LIMIT);
		const requestedSessionKey = normalizeOptionalString(params.sessionKey);
		const cfg = context.getRuntimeConfig();
		let sessionKey;
		let sessionAgentId;
		if (requestedSessionKey) {
			const sessionOwner = resolveRequestedSessionAgentId(cfg, requestedSessionKey, normalizeOptionalString(params.agentId));
			if (!sessionOwner.ok) {
				respond(false, void 0, sessionOwner.error);
				return;
			}
			sessionAgentId = sessionOwner.agentId;
			sessionKey = canonicalizeMainSessionAlias({
				cfg,
				agentId: sessionOwner.agentId,
				sessionKey: requestedSessionKey
			});
		}
		let taskAccessCaches = {
			storeCache: /* @__PURE__ */ new Map(),
			targetDiscoveryCache: /* @__PURE__ */ new Map()
		};
		const canReadTask = (task) => canAccessTaskRequesterSession({
			cfg,
			client,
			task,
			storeCache: taskAccessCaches.storeCache,
			targetDiscoveryCache: taskAccessCaches.targetDiscoveryCache
		});
		const pageParams = {
			offset: cursor,
			limit,
			statuses: statusFilter ? [...statusFilter] : void 0,
			agentId: sessionKey ? void 0 : params.agentId,
			sessionKey,
			sessionAgentId,
			cfg,
			filter: canReadTask
		};
		for (let attempt = 0; attempt < TASKS_LIST_MAX_ATTEMPTS; attempt += 1) {
			taskAccessCaches = {
				storeCache: /* @__PURE__ */ new Map(),
				targetDiscoveryCache: /* @__PURE__ */ new Map()
			};
			const accessRevision = readGatewayAccessRevision();
			const pageResult = await listTaskRecordPage(pageParams);
			if (!pageResult.ok) {
				respond(false, void 0, errorShape(ErrorCodes.UNAVAILABLE, "task registry changed during tasks.list; retry"));
				return;
			}
			const page = pageResult.value;
			if (accessRevision !== readGatewayAccessRevision() || page.tasks.some((task) => !canReadTask(task))) continue;
			const nextOffset = cursor + page.tasks.length;
			respond(true, {
				tasks: page.tasks.map((task) => mapTaskSummary(task)),
				...page.hasMore ? { nextCursor: String(nextOffset) } : {}
			});
			return;
		}
		respond(false, void 0, errorShape(ErrorCodes.UNAVAILABLE, "task access changed during tasks.list; retry"));
	},
	"tasks.get": ({ params, respond, context, client }) => {
		if (!assertValidParams(params, validateTasksGetParams, "tasks.get", respond)) return;
		const taskId = params.taskId;
		const task = getTaskById(taskId);
		if (!task || !canAccessTaskRequesterSession({
			cfg: context.getRuntimeConfig(),
			client,
			task
		})) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, `task not found: ${taskId}`));
			return;
		}
		respond(true, { task: mapTaskSummary(task, { includePrompt: true }) });
	},
	"tasks.cancel": async ({ params, respond, context, client }) => {
		if (!assertValidParams(params, validateTasksCancelParams, "tasks.cancel", respond)) return;
		const taskId = params.taskId;
		const reason = normalizeOptionalString(params.reason);
		const { cancelDetachedTaskRunByIdCore } = await import("./task-executor-cancel.runtime.js");
		const cfg = context.getRuntimeConfig();
		const task = getTaskById(taskId);
		if (task && !canAccessTaskRequesterSession({
			access: "write",
			cfg,
			client,
			task
		})) {
			respond(true, {
				found: false,
				cancelled: false
			});
			return;
		}
		const result = await cancelDetachedTaskRunByIdCore({
			cfg,
			taskId,
			...reason ? { reason } : {}
		});
		respond(true, {
			found: result.found,
			cancelled: result.cancelled,
			...result.reason ? { reason: result.reason } : {},
			...result.task ? { task: mapTaskSummary(result.task) } : {}
		});
	},
	"tasks.retry": async ({ params, respond, context, client }) => {
		if (!assertValidParams(params, validateTasksRecoveryParams, "tasks.retry", respond)) return;
		const results = [];
		const cfg = context.getRuntimeConfig();
		for (const taskId of params.taskIds) {
			const task = getTaskById(taskId);
			if (task && !canAccessTaskRequesterSession({
				access: "write",
				cfg,
				client,
				task
			})) {
				results.push({
					taskId,
					ok: false,
					reason: "task not found"
				});
				continue;
			}
			const result = await retrySubagentCompletionDelivery(taskId);
			results.push({
				taskId,
				ok: result.ok,
				...result.reason ? { reason: result.reason } : {},
				...result.duplicateRisk ? { duplicateRisk: true } : {},
				...result.task ? { task: mapTaskSummary(result.task, { includePrompt: true }) } : {}
			});
		}
		respond(true, { results });
	},
	"tasks.dismiss": async ({ params, respond, context, client }) => {
		if (!assertValidParams(params, validateTasksRecoveryParams, "tasks.dismiss", respond)) return;
		const { discardSubagentTerminalDelivery } = await import("./subagent-registry-DrJqNCcx.js");
		const results = [];
		const cfg = context.getRuntimeConfig();
		for (const taskId of params.taskIds) {
			const task = getTaskById(taskId);
			if (task && !canAccessTaskRequesterSession({
				access: "write",
				cfg,
				client,
				task
			})) {
				results.push({
					taskId,
					ok: false,
					reason: "task not found"
				});
				continue;
			}
			const result = await dismissSubagentCompletionDelivery(taskId, { discardTerminalDelivery: discardSubagentTerminalDelivery });
			results.push({
				taskId,
				ok: result.ok,
				...result.reason ? { reason: result.reason } : {},
				...result.task ? { task: mapTaskSummary(result.task, { includePrompt: true }) } : {}
			});
		}
		respond(true, { results });
	}
};
//#endregion
export { tasksHandlers };
