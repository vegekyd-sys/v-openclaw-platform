import { i as asOptionalObjectRecord } from "./record-coerce-DItp3I4t.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { y as uniqueStrings } from "./string-normalization-DiSb4JeN.js";
import { n as sliceUtf16Safe, r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { r as createLazyPromiseLoader } from "./lazy-promise-DGqyc4Y4.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { n as getTaskRegistryObservers, r as getTaskRegistryStore } from "./task-registry.store-DX2X5fCs.js";
import { a as formatTaskStatusTitleText, c as sanitizeTaskStatusText } from "./task-status-BoHY3pXn.js";
import { r as readCompletedFileMutationDelta, t as resolveFileMutationToolName } from "./tool-mutation-names-BalpObx-.js";
import { createRequire } from "node:module";
//#region src/tasks/task-registry-records.ts
function cloneTaskRecord(record) {
	return {
		...record,
		...record.detail !== void 0 ? { detail: structuredClone(record.detail) } : {}
	};
}
function normalizeTaskTimestamps(task) {
	let createdAt = task.createdAt;
	for (const candidate of [
		task.startedAt,
		task.lastEventAt,
		task.endedAt
	]) if (typeof candidate === "number" && candidate < createdAt) createdAt = candidate;
	const startedAt = typeof task.startedAt === "number" ? Math.max(task.startedAt, createdAt) : task.startedAt;
	const endedAt = typeof task.endedAt === "number" ? Math.max(task.endedAt, startedAt ?? createdAt) : task.endedAt;
	const lastEventAt = typeof task.lastEventAt === "number" ? Math.max(task.lastEventAt, endedAt ?? startedAt ?? createdAt) : task.lastEventAt;
	if (createdAt === task.createdAt && startedAt === task.startedAt && lastEventAt === task.lastEventAt && endedAt === task.endedAt) return task;
	const normalized = {
		...task,
		createdAt
	};
	if (typeof startedAt === "number") normalized.startedAt = startedAt;
	if (typeof lastEventAt === "number") normalized.lastEventAt = lastEventAt;
	if (typeof endedAt === "number") normalized.endedAt = endedAt;
	return normalized;
}
function cloneTaskDeliveryState(state) {
	return {
		...state,
		...state.requesterOrigin ? { requesterOrigin: { ...state.requesterOrigin } } : {}
	};
}
//#endregion
//#region src/tasks/task-registry.process-state.ts
const TASK_REGISTRY_PROCESS_STATE_KEY = Symbol.for("openclaw.taskRegistry.state");
/** Returns the singleton in-process task registry state. */
function getTaskRegistryProcessState() {
	const globalState = globalThis;
	globalState[TASK_REGISTRY_PROCESS_STATE_KEY] ??= {
		tasks: /* @__PURE__ */ new Map(),
		taskDeliveryStates: /* @__PURE__ */ new Map(),
		taskIdsByRunId: /* @__PURE__ */ new Map(),
		taskIdsByOwnerKey: /* @__PURE__ */ new Map(),
		taskIdsByParentFlowId: /* @__PURE__ */ new Map(),
		taskIdsByRelatedSessionKey: /* @__PURE__ */ new Map(),
		tasksWithPendingDelivery: /* @__PURE__ */ new Set(),
		taskActivityByTaskId: /* @__PURE__ */ new Map()
	};
	return globalState[TASK_REGISTRY_PROCESS_STATE_KEY];
}
//#endregion
//#region src/tasks/task-registry-state.ts
const taskRegistryLog = createSubsystemLogger("tasks/registry");
const TASK_FLOW_SYNC_RETRY_DELAYS_MS = [
	1e3,
	5e3,
	25e3,
	12e4,
	6e5
];
const taskRegistryProcessState = getTaskRegistryProcessState();
const TASK_REGISTRY_REVISION_KEY = Symbol.for("openclaw.taskRegistry.revision");
const taskRegistryRevisionGlobal = globalThis;
const taskRegistryRevisionState = taskRegistryRevisionGlobal[TASK_REGISTRY_REVISION_KEY] ??= { value: 0 };
function readTaskRegistryRevision() {
	return taskRegistryRevisionState.value;
}
function bumpTaskRegistryRevision() {
	taskRegistryRevisionState.value += 1;
}
const tasks = taskRegistryProcessState.tasks;
const taskDeliveryStates = taskRegistryProcessState.taskDeliveryStates;
const taskIdsByRunId = taskRegistryProcessState.taskIdsByRunId;
const taskIdsByOwnerKey = taskRegistryProcessState.taskIdsByOwnerKey;
const taskIdsByParentFlowId = taskRegistryProcessState.taskIdsByParentFlowId;
const taskIdsByRelatedSessionKey = taskRegistryProcessState.taskIdsByRelatedSessionKey;
const tasksWithPendingDelivery = taskRegistryProcessState.tasksWithPendingDelivery;
const taskActivityByTaskId = taskRegistryProcessState.taskActivityByTaskId;
let taskRegistryRestoreState = { status: "uninitialized" };
const taskFlowSyncRetryTimers = /* @__PURE__ */ new Map();
const TASK_REGISTRY_DELIVERY_RUNTIME_OVERRIDE_KEY = Symbol.for("openclaw.taskRegistry.deliveryRuntimeOverride");
const TASK_REGISTRY_CONTROL_RUNTIME_OVERRIDE_KEY = Symbol.for("openclaw.taskRegistry.controlRuntimeOverride");
const require = createRequire(import.meta.url);
const TASK_REGISTRY_CONTROL_RUNTIME_CANDIDATES = ["./task-registry-control.runtime.js", "./task-registry-control.runtime.ts"];
const deliveryRuntimeLoader = createLazyPromiseLoader(() => import("./task-registry-delivery-runtime-DNd4ZUz2.js"), { cacheRejections: true });
const controlRuntimeLoader = createLazyPromiseLoader(() => Promise.resolve().then(() => {
	for (const candidate of TASK_REGISTRY_CONTROL_RUNTIME_CANDIDATES) try {
		return require(candidate);
	} catch {}
	throw new Error("Failed to load task registry control runtime.");
}), { cacheRejections: true });
let listenerStarter = () => {};
function setTaskRegistryListenerStarter(starter) {
	listenerStarter = starter;
}
function claimTaskRegistryListenerStart() {
	if (taskRegistryProcessState.listenerStop !== void 0) return false;
	taskRegistryProcessState.listenerStop = null;
	return true;
}
function setTaskRegistryListenerStop(stop) {
	taskRegistryProcessState.listenerStop = stop;
}
function resetTaskRegistryListenerState() {
	taskRegistryProcessState.listenerStop?.();
	taskRegistryProcessState.listenerStop = void 0;
}
function clearTaskFlowSyncRetries() {
	for (const timer of taskFlowSyncRetryTimers.values()) clearTimeout(timer);
	taskFlowSyncRetryTimers.clear();
}
function snapshotTaskRecords(source) {
	return [...source.values()].map((record) => cloneTaskRecord(record));
}
function emitTaskRegistryObserverEvent(createEvent) {
	const observers = getTaskRegistryObservers();
	if (!observers?.onEvent) return;
	try {
		observers.onEvent(createEvent());
	} catch (error) {
		taskRegistryLog.warn("Task registry observer failed", {
			event: "task-registry",
			error
		});
	}
}
function persistTaskRegistry() {
	try {
		getTaskRegistryStore().saveSnapshot({
			tasks,
			deliveryStates: taskDeliveryStates
		});
		return true;
	} catch (error) {
		taskRegistryLog.warn("Failed to persist task registry snapshot", { error });
		return false;
	}
}
function persistTaskUpsert(task, pendingDeliveryState) {
	const store = getTaskRegistryStore();
	const deliveryState = pendingDeliveryState ?? taskDeliveryStates.get(task.taskId);
	if (store.upsertTaskWithDeliveryState) {
		store.upsertTaskWithDeliveryState({
			task,
			...deliveryState ? { deliveryState } : {}
		});
		return;
	}
	if (!deliveryState && store.upsertTask) {
		store.upsertTask(task);
		return;
	}
	store.saveSnapshot({
		tasks: new Map(tasks).set(task.taskId, task),
		deliveryStates: deliveryState ? new Map(taskDeliveryStates).set(task.taskId, deliveryState) : taskDeliveryStates
	});
}
function tryPersistTaskUpsert(task, operation, pendingDeliveryState) {
	try {
		persistTaskUpsert(task, pendingDeliveryState);
		return true;
	} catch (error) {
		taskRegistryLog.warn("Failed to persist task registry upsert", {
			operation,
			taskId: task.taskId,
			runId: task.runId,
			error
		});
		return false;
	}
}
function persistTaskDelete(taskId) {
	const store = getTaskRegistryStore();
	if (store.deleteTaskWithDeliveryState) {
		store.deleteTaskWithDeliveryState(taskId);
		return;
	}
	const projectedTasks = new Map(tasks);
	projectedTasks.delete(taskId);
	const projectedDeliveryStates = new Map(taskDeliveryStates);
	projectedDeliveryStates.delete(taskId);
	store.saveSnapshot({
		tasks: projectedTasks,
		deliveryStates: projectedDeliveryStates
	});
}
function tryPersistTaskDelete(taskId) {
	try {
		persistTaskDelete(taskId);
		return true;
	} catch (error) {
		taskRegistryLog.warn("Failed to persist task registry delete", {
			taskId,
			error
		});
		return false;
	}
}
function persistTaskDeliveryStateUpsert(state) {
	const store = getTaskRegistryStore();
	if (store.upsertDeliveryState) {
		store.upsertDeliveryState(state);
		return;
	}
	const projectedDeliveryStates = new Map(taskDeliveryStates);
	projectedDeliveryStates.set(state.taskId, cloneTaskDeliveryState(state));
	store.saveSnapshot({
		tasks,
		deliveryStates: projectedDeliveryStates
	});
}
function tryPersistTaskDeliveryStateUpsert(state) {
	try {
		persistTaskDeliveryStateUpsert(state);
		return true;
	} catch (error) {
		taskRegistryLog.warn("Failed to persist task delivery state", {
			taskId: state.taskId,
			error
		});
		return false;
	}
}
function clearTaskRegistryMemory() {
	clearTaskFlowSyncRetries();
	for (const activity of taskActivityByTaskId.values()) if (activity.flushTimer) clearTimeout(activity.flushTimer);
	taskActivityByTaskId.clear();
	tasks.clear();
	bumpTaskRegistryRevision();
	taskDeliveryStates.clear();
	taskIdsByRunId.clear();
	taskIdsByOwnerKey.clear();
	taskIdsByParentFlowId.clear();
	taskIdsByRelatedSessionKey.clear();
	tasksWithPendingDelivery.clear();
}
function loadTaskRegistryDeliveryRuntime() {
	const deliveryRuntimeOverride = globalThis[TASK_REGISTRY_DELIVERY_RUNTIME_OVERRIDE_KEY];
	if (deliveryRuntimeOverride) return Promise.resolve(deliveryRuntimeOverride);
	return deliveryRuntimeLoader.load();
}
function loadTaskRegistryControlRuntime() {
	const controlRuntimeOverride = globalThis[TASK_REGISTRY_CONTROL_RUNTIME_OVERRIDE_KEY];
	if (controlRuntimeOverride) return Promise.resolve(controlRuntimeOverride);
	return controlRuntimeLoader.load();
}
function addRunIdIndex(taskId, runId) {
	const trimmed = runId?.trim();
	if (!trimmed) return;
	let ids = taskIdsByRunId.get(trimmed);
	if (!ids) {
		ids = /* @__PURE__ */ new Set();
		taskIdsByRunId.set(trimmed, ids);
	}
	ids.add(taskId);
}
function addIndexedKey(index, key, taskId) {
	let ids = index.get(key);
	if (!ids) {
		ids = /* @__PURE__ */ new Set();
		index.set(key, ids);
	}
	ids.add(taskId);
}
function deleteIndexedKey(index, key, taskId) {
	const ids = index.get(key);
	if (!ids) return;
	ids.delete(taskId);
	if (ids.size === 0) index.delete(key);
}
function getTaskRelatedSessionIndexKeys(task) {
	return uniqueStrings([normalizeOptionalString(task.ownerKey), normalizeOptionalString(task.childSessionKey)].filter(Boolean));
}
function addOwnerKeyIndex(taskId, task) {
	const key = normalizeOptionalString(task.ownerKey);
	if (!key) return;
	addIndexedKey(taskIdsByOwnerKey, key, taskId);
}
function deleteOwnerKeyIndex(taskId, task) {
	const key = normalizeOptionalString(task.ownerKey);
	if (!key) return;
	deleteIndexedKey(taskIdsByOwnerKey, key, taskId);
}
function addParentFlowIdIndex(taskId, task) {
	const key = task.parentFlowId?.trim();
	if (!key) return;
	addIndexedKey(taskIdsByParentFlowId, key, taskId);
}
function deleteParentFlowIdIndex(taskId, task) {
	const key = task.parentFlowId?.trim();
	if (!key) return;
	deleteIndexedKey(taskIdsByParentFlowId, key, taskId);
}
function addRelatedSessionKeyIndex(taskId, task) {
	for (const sessionKey of getTaskRelatedSessionIndexKeys(task)) addIndexedKey(taskIdsByRelatedSessionKey, sessionKey, taskId);
}
function deleteRelatedSessionKeyIndex(taskId, task) {
	for (const sessionKey of getTaskRelatedSessionIndexKeys(task)) deleteIndexedKey(taskIdsByRelatedSessionKey, sessionKey, taskId);
}
function rebuildRunIdIndex() {
	taskIdsByRunId.clear();
	for (const [taskId, task] of tasks.entries()) addRunIdIndex(taskId, task.runId);
}
function rebuildOwnerKeyIndex() {
	taskIdsByOwnerKey.clear();
	for (const [taskId, task] of tasks.entries()) addOwnerKeyIndex(taskId, task);
}
function rebuildParentFlowIdIndex() {
	taskIdsByParentFlowId.clear();
	for (const [taskId, task] of tasks.entries()) addParentFlowIdIndex(taskId, task);
}
function rebuildRelatedSessionKeyIndex() {
	taskIdsByRelatedSessionKey.clear();
	for (const [taskId, task] of tasks.entries()) addRelatedSessionKeyIndex(taskId, task);
}
function getTasksByRunId(runId) {
	const ids = taskIdsByRunId.get(runId.trim());
	if (!ids || ids.size === 0) return [];
	return [...ids].map((taskId) => tasks.get(taskId)).filter((task) => Boolean(task));
}
function taskRunScopeKey(task) {
	return [
		task.runtime,
		task.scopeKind,
		normalizeOptionalString(task.ownerKey) ?? "",
		normalizeOptionalString(task.childSessionKey) ?? ""
	].join("\0");
}
function getTasksByRunScope(params) {
	const matches = getTasksByRunId(params.runId).filter((task) => !params.runtime || task.runtime === params.runtime);
	const sessionKey = normalizeOptionalString(params.sessionKey);
	if (sessionKey) {
		const childMatches = matches.filter((task) => normalizeOptionalString(task.childSessionKey) === sessionKey);
		if (childMatches.length > 0) return childMatches;
		return matches.filter((task) => task.scopeKind === "session" && normalizeOptionalString(task.ownerKey) === sessionKey);
	}
	return new Set(matches.map((task) => taskRunScopeKey(task))).size <= 1 ? matches : [];
}
function getPeerTasksForDelivery(task) {
	if (!task.runId?.trim()) return [];
	return getTasksByRunId(task.runId).filter((candidate) => candidate.runtime === task.runtime && candidate.scopeKind === task.scopeKind && (normalizeOptionalString(candidate.ownerKey) ?? "") === (normalizeOptionalString(task.ownerKey) ?? "") && (normalizeOptionalString(candidate.childSessionKey) ?? "") === (normalizeOptionalString(task.childSessionKey) ?? ""));
}
function taskLookupPriority(task) {
	return task.runtime === "cli" ? 1 : 0;
}
function pickPreferredRunIdTask(matches) {
	return [...matches].toSorted((left, right) => {
		const priorityDiff = taskLookupPriority(left) - taskLookupPriority(right);
		if (priorityDiff !== 0) return priorityDiff;
		return left.createdAt - right.createdAt;
	})[0];
}
function compareTasksNewestFirst(left, right) {
	const createdAtDiff = right.createdAt - left.createdAt;
	if (createdAtDiff !== 0) return createdAtDiff;
	return (right.insertionIndex ?? 0) - (left.insertionIndex ?? 0);
}
function restoreTaskRegistryOnce() {
	switch (taskRegistryRestoreState.status) {
		case "ready": return;
		case "failed": throw taskRegistryRestoreState.error;
		case "restoring": throw new Error("Task registry restore is already in progress.");
	}
	taskRegistryRestoreState = { status: "restoring" };
	try {
		const restored = getTaskRegistryStore().loadSnapshot();
		const restoredTasks = /* @__PURE__ */ new Map();
		for (const [taskId, task] of restored.tasks.entries()) restoredTasks.set(taskId, normalizeTaskTimestamps(task));
		const restoredDeliveryStates = new Map(restored.deliveryStates);
		clearTaskRegistryMemory();
		for (const [taskId, task] of restoredTasks.entries()) tasks.set(taskId, task);
		for (const [taskId, state] of restoredDeliveryStates.entries()) taskDeliveryStates.set(taskId, state);
		rebuildRunIdIndex();
		rebuildOwnerKeyIndex();
		rebuildParentFlowIdIndex();
		rebuildRelatedSessionKeyIndex();
		taskRegistryRestoreState = { status: "ready" };
		if (restoredTasks.size > 0 || restoredDeliveryStates.size > 0) emitTaskRegistryObserverEvent(() => ({
			kind: "restored",
			tasks: snapshotTaskRecords(tasks)
		}));
	} catch (error) {
		clearTaskRegistryMemory();
		const message = formatErrorMessage(error);
		const restoreError = new Error(`Task registry restore failed: ${message}`, { cause: error });
		taskRegistryRestoreState = {
			status: "failed",
			error: restoreError
		};
		taskRegistryLog.warn("Failed to restore task registry", {
			error: message,
			consoleMessage: `Failed to restore task registry: ${message}`
		});
		throw restoreError;
	}
}
function ensureTaskRegistryReady() {
	restoreTaskRegistryOnce();
	listenerStarter();
}
function reloadTaskRegistryFromStore() {
	clearTaskRegistryMemory();
	taskRegistryRestoreState = { status: "uninitialized" };
	ensureTaskRegistryReady();
}
function resetTaskRegistryRestoreState() {
	taskRegistryRestoreState = { status: "uninitialized" };
}
//#endregion
//#region src/tasks/detached-task-runtime-contract.ts
const SUBAGENT_KILL_TASK_ERROR = "Subagent run killed.";
//#endregion
//#region src/tasks/task-executor-policy.ts
/** Returns whether a task status is terminal for delivery and retention policy. */
function isTerminalTaskStatus(status) {
	return status === "succeeded" || status === "failed" || status === "timed_out" || status === "cancelled" || status === "lost";
}
function resolveTaskDisplayTitle(task) {
	return formatTaskStatusTitleText(task.label?.trim() || (task.runtime === "acp" ? "ACP background task" : task.runtime === "subagent" ? "Subagent task" : task.task.trim() || "Background task"));
}
function resolveTaskRunLabel(task) {
	return task.runId ? ` (run ${task.runId.slice(0, 8)})` : "";
}
function formatTaskTerminalMessage(task, options = {}) {
	const title = resolveTaskDisplayTitle(task);
	const runLabel = resolveTaskRunLabel(task);
	const summary = sanitizeTaskStatusText(task.terminalSummary, { errorContext: task.status !== "succeeded" || task.terminalOutcome === "blocked" });
	if (task.status === "succeeded") {
		if (task.terminalOutcome === "blocked") return summary ? `Background task blocked: ${title}${runLabel}. ${summary}` : `Background task blocked: ${title}${runLabel}.`;
		if (options.surface === "parent_session") {
			const reviewNext = "Next: parent will review/verify before calling it done.";
			return summary ? `Background task ready for review: ${title}${runLabel}. ${summary} ${reviewNext}` : `Background task ready for review: ${title}${runLabel}. ${reviewNext}`;
		}
		return summary ? `Background task done: ${title}${runLabel}. ${summary}` : `Background task done: ${title}${runLabel}.`;
	}
	if (task.status === "timed_out") return `Background task timed out: ${title}${runLabel}.`;
	if (task.status === "lost") {
		const error = sanitizeTaskStatusText(task.error, { errorContext: true });
		const fallbackSummary = sanitizeTaskStatusText(task.terminalSummary, { errorContext: true });
		return `Background task lost: ${title}${runLabel}. ${error || fallbackSummary || "Backing session disappeared."}`;
	}
	if (task.status === "cancelled") {
		if (task.runtime === "subagent") return `Background task cancellation requested: ${title}${runLabel}.`;
		return `Background task cancelled: ${title}${runLabel}.`;
	}
	const error = sanitizeTaskStatusText(task.error, { errorContext: true });
	const fallbackSummary = sanitizeTaskStatusText(task.terminalSummary, { errorContext: true });
	return error ? `Background task failed: ${title}${runLabel}. ${error}` : fallbackSummary ? `Background task failed: ${title}${runLabel}. ${fallbackSummary}` : `Background task failed: ${title}${runLabel}.`;
}
function shouldUseParentReviewTaskTerminalMessage(task) {
	return task.runtime === "acp" && task.status === "succeeded" && task.terminalOutcome !== "blocked" && Boolean(task.childSessionKey?.trim());
}
function formatTaskBlockedFollowupMessage(task) {
	if (task.status !== "succeeded" || task.terminalOutcome !== "blocked") return null;
	return `Task needs follow-up: ${resolveTaskDisplayTitle(task)}${resolveTaskRunLabel(task)}. ${sanitizeTaskStatusText(task.terminalSummary, { errorContext: true }) || "Task is blocked and needs follow-up."}`;
}
function formatTaskStateChangeMessage(task, event) {
	const title = resolveTaskDisplayTitle(task);
	if (event.kind === "running") return `Background task started: ${title}.`;
	if (event.kind === "progress") {
		const summary = sanitizeTaskStatusText(event.summary);
		return summary ? `Background task update: ${title}. ${summary}` : null;
	}
	return null;
}
function shouldAutoDeliverTaskTerminalUpdate(task) {
	if (task.notifyPolicy === "silent") return false;
	if (task.runtime === "subagent" && task.status !== "cancelled") return false;
	if (task.runtime === "subagent" && task.status === "cancelled" && task.error === "Subagent run killed.") return false;
	if (!isTerminalTaskStatus(task.status)) return false;
	return task.deliveryStatus === "pending";
}
function shouldAutoDeliverTaskStateChange(task) {
	return task.notifyPolicy === "state_changes" && task.deliveryStatus === "pending" && !isTerminalTaskStatus(task.status);
}
function shouldSuppressDuplicateTerminalDelivery(params) {
	if (!params.task.runId?.trim()) return false;
	if (!(params.task.runtime === "acp" || params.task.runtime === "subagent" && params.task.status === "cancelled")) return false;
	if (params.task.runtime === "subagent" && params.peerDeliveryCovered) return true;
	return Boolean(params.preferredTaskId && params.preferredTaskId !== params.task.taskId);
}
//#endregion
//#region src/tasks/task-registry-activity.ts
const MAX_ACTIVITY_CHARS = 200;
const ACTIVITY_LINE_PREFIX = new RegExp(`^(?:\\s*\\S){1,201}`);
const ACTIVITY_FLUSH_MS = 1e3;
const MAX_PENDING_DIFFS = 64;
function activityFor(task) {
	const runId = task.runId ?? "";
	const existing = taskActivityByTaskId.get(task.taskId);
	if (existing?.runId === runId) return existing;
	if (existing?.flushTimer) clearTimeout(existing.flushTimer);
	const created = {
		runId,
		assistantText: "",
		thinkingText: "",
		hasAssistantActivity: false,
		files: /* @__PURE__ */ new Set(),
		added: 0,
		removed: 0,
		pendingDiffByToolCallId: /* @__PURE__ */ new Map(),
		dirty: false
	};
	taskActivityByTaskId.set(task.taskId, created);
	return created;
}
function lastLineSnippet(text) {
	const prefix = text.trimEnd().split(/\r\n|\r|\n/).at(-1)?.match(ACTIVITY_LINE_PREFIX)?.[0];
	return prefix ? truncateUtf16Safe(prefix.replace(/\s+/g, " ").trim(), MAX_ACTIVITY_CHARS) : void 0;
}
function scheduleFlush(taskId, activity) {
	if (activity.flushTimer) return;
	const elapsed = activity.lastFlushedAt === void 0 ? 0 : Date.now() - activity.lastFlushedAt;
	const delay = Math.max(0, ACTIVITY_FLUSH_MS - elapsed);
	activity.flushTimer = setTimeout(() => {
		activity.flushTimer = void 0;
		flushTaskActivity(taskId);
	}, delay);
	activity.flushTimer.unref?.();
}
function markChanged(taskId, activity) {
	activity.dirty = true;
	scheduleFlush(taskId, activity);
}
/** Folds transient text and file activity into the in-memory task overlay. */
function recordTaskActivityEvent(task, event) {
	const textStream = event.stream;
	if (textStream === "assistant" || textStream === "thinking") {
		const activity = activityFor(task);
		if (textStream === "thinking" && activity.hasAssistantActivity) return;
		const key = textStream === "assistant" ? "assistantText" : "thinkingText";
		let cumulative;
		if (typeof event.data.text === "string") cumulative = event.data.text;
		else if (typeof event.data.delta === "string") cumulative = activity[key] + event.data.delta;
		else return;
		activity[key] = sliceUtf16Safe(cumulative, -4e3);
		const snippet = lastLineSnippet(cumulative);
		if (!snippet) return;
		if (textStream === "assistant") {
			activity.hasAssistantActivity = true;
			activity.thinkingText = "";
		}
		if (activity.lastActivity !== snippet) {
			activity.lastActivity = snippet;
			markChanged(task.taskId, activity);
		}
		return;
	}
	if (event.stream !== "tool") return;
	const toolName = typeof event.data.name === "string" ? event.data.name : "";
	const kind = resolveFileMutationToolName(toolName);
	if (!kind) return;
	const toolCallId = normalizeOptionalString(event.data.toolCallId);
	if (event.data.phase === "start") {
		const args = asOptionalObjectRecord(event.data.args);
		const delta = args ? readCompletedFileMutationDelta(kind, args) : void 0;
		if (!toolCallId || !delta) return;
		const activity = activityFor(task);
		if (!activity.pendingDiffByToolCallId.has(toolCallId) && activity.pendingDiffByToolCallId.size >= MAX_PENDING_DIFFS) return;
		activity.pendingDiffByToolCallId.set(toolCallId, delta);
		return;
	}
	if (event.data.phase !== "result") return;
	const activity = taskActivityByTaskId.get(task.taskId);
	const delta = toolCallId ? activity?.pendingDiffByToolCallId.get(toolCallId) : void 0;
	if (toolCallId) activity?.pendingDiffByToolCallId.delete(toolCallId);
	if (event.data.isError === true || !delta || !activity) return;
	let changed = delta.added > 0 || delta.removed > 0;
	for (const file of delta.files) {
		const size = activity.files.size;
		activity.files.add(file);
		changed ||= activity.files.size !== size;
	}
	if (changed) {
		activity.added += delta.added;
		activity.removed += delta.removed;
		markChanged(task.taskId, activity);
	}
}
function getTaskActivitySnapshot(taskId) {
	const activity = taskActivityByTaskId.get(taskId);
	return activity ? {
		...activity.lastActivity ? { lastActivity: activity.lastActivity } : {},
		...activity.files.size > 0 ? { diffStat: {
			files: activity.files.size,
			added: activity.added,
			removed: activity.removed
		} } : {}
	} : void 0;
}
function flushTaskActivity(taskId) {
	const activity = taskActivityByTaskId.get(taskId);
	if (!activity?.dirty) return;
	if (activity.flushTimer) {
		clearTimeout(activity.flushTimer);
		activity.flushTimer = void 0;
	}
	const task = tasks.get(taskId);
	if (!task || isTerminalTaskStatus(task.status)) {
		clearTaskActivity(taskId);
		return;
	}
	activity.dirty = false;
	activity.lastFlushedAt = Date.now();
	emitTaskRegistryObserverEvent(() => ({
		kind: "upserted",
		task: cloneTaskRecord(task)
	}));
}
function clearTaskActivity(taskId) {
	const activity = taskActivityByTaskId.get(taskId);
	if (activity?.flushTimer) clearTimeout(activity.flushTimer);
	taskActivityByTaskId.delete(taskId);
}
//#endregion
export { taskRegistryLog as $, emitTaskRegistryObserverEvent as A, rebuildRunIdIndex as B, clearTaskRegistryMemory as C, deleteParentFlowIdIndex as D, deleteOwnerKeyIndex as E, loadTaskRegistryControlRuntime as F, setTaskRegistryListenerStarter as G, resetTaskRegistryListenerState as H, loadTaskRegistryDeliveryRuntime as I, taskDeliveryStates as J, setTaskRegistryListenerStop as K, persistTaskRegistry as L, getPeerTasksForDelivery as M, getTasksByRunId as N, deleteRelatedSessionKeyIndex as O, getTasksByRunScope as P, taskIdsByRelatedSessionKey as Q, pickPreferredRunIdTask as R, claimTaskRegistryListenerStart as S, controlRuntimeLoader as T, resetTaskRegistryRestoreState as U, reloadTaskRegistryFromStore as V, restoreTaskRegistryOnce as W, taskIdsByOwnerKey as X, taskFlowSyncRetryTimers as Y, taskIdsByParentFlowId as Z, addOwnerKeyIndex as _, formatTaskBlockedFollowupMessage as a, cloneTaskDeliveryState as at, addRunIdIndex as b, isTerminalTaskStatus as c, shouldSuppressDuplicateTerminalDelivery as d, tasks as et, shouldUseParentReviewTaskTerminalMessage as f, TASK_REGISTRY_DELIVERY_RUNTIME_OVERRIDE_KEY as g, TASK_REGISTRY_CONTROL_RUNTIME_OVERRIDE_KEY as h, recordTaskActivityEvent as i, tryPersistTaskUpsert as it, ensureTaskRegistryReady as j, deliveryRuntimeLoader as k, shouldAutoDeliverTaskStateChange as l, TASK_FLOW_SYNC_RETRY_DELAYS_MS as m, flushTaskActivity as n, tryPersistTaskDelete as nt, formatTaskStateChangeMessage as o, cloneTaskRecord as ot, SUBAGENT_KILL_TASK_ERROR as p, snapshotTaskRecords as q, getTaskActivitySnapshot as r, tryPersistTaskDeliveryStateUpsert as rt, formatTaskTerminalMessage as s, normalizeTaskTimestamps as st, clearTaskActivity as t, tasksWithPendingDelivery as tt, shouldAutoDeliverTaskTerminalUpdate as u, addParentFlowIdIndex as v, compareTasksNewestFirst as w, bumpTaskRegistryRevision as x, addRelatedSessionKeyIndex as y, readTaskRegistryRevision as z };
