import { a as asOptionalRecord } from "./record-coerce-DItp3I4t.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { n as ok, t as err } from "./result-BQGgYouL.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { O as parseAgentSessionKey } from "./session-key-CRjxKW0X.js";
import { _ as resolveSessionAgentId } from "./agent-scope-CSlN0kZb.js";
import { d as onAgentEvent } from "./agent-events-Con5xUCM.js";
import { b as runWithGatewayIndependentRootWorkAdmission, u as isGatewayRestartDraining, x as runWithGatewayIndependentRootWorkContinuation } from "./gateway-work-admission-3tn4Qiws.js";
import { t as normalizeChatType } from "./chat-type-CG0X_HJM.js";
import { t as deriveSessionChatTypeFromKey } from "./session-chat-type-shared-BKTfMJHj.js";
import { c as normalizeDeliveryContext, f as sessionDeliveryOrigin } from "./delivery-context.shared-DlcU69m_.js";
import { l as requestHeartbeat } from "./heartbeat-wake-c_7_7clI.js";
import { a as enqueueSystemEvent, h as withSystemEventOwner } from "./system-events-GfU3KOHp.js";
import { t as isDeliverableMessageChannel } from "./message-channel-normalize-DzpgR6ro.js";
import "./message-channel-BGKf9KPa.js";
import { n as isTerminalTaskFlow } from "./task-flow-registry.types-BidrdCoB.js";
import { o as parseTaskNotifyPolicy } from "./task-registry.types-73FJYVhP.js";
import { i as loadTaskFlowRegistryStateFromSqlite, n as closeTaskFlowRegistryDatabase, o as saveTaskFlowRegistryStateToSqlite, r as deleteTaskFlowRegistryRecordFromSqlite, s as upsertTaskFlowRegistryRecordToSqlite } from "./task-flow-registry.store.sqlite-x5EfDgmc.js";
import { i as buildAgentRunTerminalOutcomeFromLifecycleEvent, o as classifyAgentRunTerminalOutcome } from "./agent-run-terminal-outcome-CyRezSup.js";
import { $ as taskRegistryLog, A as emitTaskRegistryObserverEvent, B as rebuildRunIdIndex, C as clearTaskRegistryMemory, D as deleteParentFlowIdIndex, E as deleteOwnerKeyIndex, F as loadTaskRegistryControlRuntime, G as setTaskRegistryListenerStarter, H as resetTaskRegistryListenerState, I as loadTaskRegistryDeliveryRuntime, J as taskDeliveryStates, K as setTaskRegistryListenerStop, L as persistTaskRegistry, M as getPeerTasksForDelivery, N as getTasksByRunId, O as deleteRelatedSessionKeyIndex, P as getTasksByRunScope, Q as taskIdsByRelatedSessionKey, R as pickPreferredRunIdTask, S as claimTaskRegistryListenerStart, T as controlRuntimeLoader, U as resetTaskRegistryRestoreState, W as restoreTaskRegistryOnce, X as taskIdsByOwnerKey, Y as taskFlowSyncRetryTimers, Z as taskIdsByParentFlowId, _ as addOwnerKeyIndex, a as formatTaskBlockedFollowupMessage, at as cloneTaskDeliveryState, b as addRunIdIndex, c as isTerminalTaskStatus, d as shouldSuppressDuplicateTerminalDelivery, et as tasks, f as shouldUseParentReviewTaskTerminalMessage, g as TASK_REGISTRY_DELIVERY_RUNTIME_OVERRIDE_KEY, h as TASK_REGISTRY_CONTROL_RUNTIME_OVERRIDE_KEY, i as recordTaskActivityEvent, it as tryPersistTaskUpsert, j as ensureTaskRegistryReady, k as deliveryRuntimeLoader, l as shouldAutoDeliverTaskStateChange, m as TASK_FLOW_SYNC_RETRY_DELAYS_MS, n as flushTaskActivity, nt as tryPersistTaskDelete, o as formatTaskStateChangeMessage, ot as cloneTaskRecord, p as SUBAGENT_KILL_TASK_ERROR, q as snapshotTaskRecords, rt as tryPersistTaskDeliveryStateUpsert, s as formatTaskTerminalMessage, st as normalizeTaskTimestamps, t as clearTaskActivity, tt as tasksWithPendingDelivery, u as shouldAutoDeliverTaskTerminalUpdate, v as addParentFlowIdIndex, w as compareTasksNewestFirst, x as bumpTaskRegistryRevision, y as addRelatedSessionKeyIndex, z as readTaskRegistryRevision } from "./task-registry-activity-DSlVVJwD.js";
import { i as resetTaskRegistryRuntimeForTests, r as getTaskRegistryStore } from "./task-registry.store-DX2X5fCs.js";
import { o as resolveSourceReplyDeliveryMode } from "./source-reply-delivery-mode-7Re9v3QT.js";
import { t as channelSupportsThreadDelivery } from "./thread-addressing-BNVtRbdF.js";
import { n as resolveTaskCleanupAfter } from "./task-retention-Dg3rO5ZP.js";
import crypto from "node:crypto";
import { setImmediate } from "node:timers/promises";
//#region src/tasks/task-flow-registry.store.ts
const defaultFlowRegistryStore = {
	loadSnapshot: loadTaskFlowRegistryStateFromSqlite,
	saveSnapshot: saveTaskFlowRegistryStateToSqlite,
	upsertFlow: upsertTaskFlowRegistryRecordToSqlite,
	deleteFlow: deleteTaskFlowRegistryRecordFromSqlite,
	close: closeTaskFlowRegistryDatabase
};
let configuredFlowRegistryStore = defaultFlowRegistryStore;
let configuredFlowRegistryObservers = null;
function getTaskFlowRegistryStore() {
	return configuredFlowRegistryStore;
}
function getTaskFlowRegistryObservers() {
	return configuredFlowRegistryObservers;
}
function configureTaskFlowRegistryRuntime(params) {
	if (params.store) configuredFlowRegistryStore = params.store;
	if ("observers" in params) configuredFlowRegistryObservers = params.observers ?? null;
}
function resetTaskFlowRegistryRuntimeForTests() {
	configuredFlowRegistryStore.close?.();
	configuredFlowRegistryStore = defaultFlowRegistryStore;
	configuredFlowRegistryObservers = null;
}
if (process.env.VITEST || false) globalThis[Symbol.for("openclaw.taskFlowRegistryStoreTestApi")] = { configureTaskFlowRegistryRuntime };
//#endregion
//#region src/tasks/task-flow-registry.ts
const log = createSubsystemLogger("tasks/task-flow-registry");
let flows = /* @__PURE__ */ new Map();
let taskFlowRegistryRestoreState = { status: "uninitialized" };
function cloneStructuredValue(value) {
	if (value === void 0) return;
	return structuredClone(value);
}
function cloneFlowRecord(record) {
	return {
		...record,
		...record.requesterOrigin ? { requesterOrigin: cloneStructuredValue(record.requesterOrigin) } : {},
		...record.stateJson !== void 0 ? { stateJson: cloneStructuredValue(record.stateJson) } : {},
		...record.waitJson !== void 0 ? { waitJson: cloneStructuredValue(record.waitJson) } : {}
	};
}
function normalizeRestoredFlowRecord(record) {
	const syncMode = record.syncMode === "task_mirrored" ? "task_mirrored" : "managed";
	const controllerId = syncMode === "managed" ? normalizeOptionalString(record.controllerId) ?? "core/legacy-restored" : void 0;
	return {
		...record,
		syncMode,
		ownerKey: assertFlowOwnerKey(record.ownerKey),
		...record.requesterOrigin ? { requesterOrigin: cloneStructuredValue(record.requesterOrigin) } : {},
		...controllerId ? { controllerId } : {},
		currentStep: normalizeOptionalString(record.currentStep),
		blockedTaskId: normalizeOptionalString(record.blockedTaskId),
		blockedSummary: normalizeOptionalString(record.blockedSummary),
		...record.stateJson !== void 0 ? { stateJson: cloneStructuredValue(record.stateJson) } : {},
		...record.waitJson !== void 0 ? { waitJson: cloneStructuredValue(record.waitJson) } : {},
		revision: Math.max(0, record.revision),
		cancelRequestedAt: record.cancelRequestedAt ?? void 0,
		endedAt: record.endedAt ?? void 0
	};
}
function snapshotFlowRecords(source) {
	return [...source.values()].map((record) => cloneFlowRecord(record));
}
function emitFlowRegistryObserverEvent(createEvent) {
	const observers = getTaskFlowRegistryObservers();
	if (!observers?.onEvent) return;
	try {
		observers.onEvent(createEvent());
	} catch {}
}
function ensureNotifyPolicy$1(notifyPolicy) {
	return notifyPolicy ?? "done_only";
}
function normalizeJsonBlob(value) {
	return value === void 0 ? void 0 : cloneStructuredValue(value);
}
function assertFlowOwnerKey(ownerKey) {
	const normalized = normalizeOptionalString(ownerKey);
	if (!normalized) throw new Error("Flow ownerKey is required.");
	return normalized;
}
function assertControllerId(controllerId) {
	const normalized = normalizeOptionalString(controllerId);
	if (!normalized) throw new Error("Managed flow controllerId is required.");
	return normalized;
}
function resolveFlowBlockedSummary(task) {
	if (task.status !== "succeeded" || task.terminalOutcome !== "blocked") return;
	return normalizeOptionalString(task.terminalSummary) ?? normalizeOptionalString(task.progressSummary);
}
function deriveTaskFlowStatusFromTask(task) {
	if (task.status === "queued") return "queued";
	if (task.status === "running") return "running";
	if (task.status === "succeeded") return task.terminalOutcome === "blocked" ? "blocked" : "succeeded";
	if (task.status === "cancelled") return "cancelled";
	if (task.status === "lost") return "lost";
	return "failed";
}
function isTerminalTaskFlowStatus(status) {
	return status === "succeeded" || status === "blocked" || status === "failed" || status === "cancelled" || status === "lost";
}
function resolveTaskMirroredFlowTiming(task, isTerminal) {
	if (!isTerminal) return { updatedAt: task.lastEventAt ?? task.createdAt };
	const endedAt = task.endedAt ?? task.lastEventAt ?? task.createdAt;
	return {
		updatedAt: endedAt,
		endedAt
	};
}
function restoreTaskFlowRegistryOnce() {
	switch (taskFlowRegistryRestoreState.status) {
		case "ready": return;
		case "failed": throw taskFlowRegistryRestoreState.error;
		case "restoring": throw new Error("Task-flow registry restore is already in progress.");
	}
	taskFlowRegistryRestoreState = { status: "restoring" };
	try {
		const restored = getTaskFlowRegistryStore().loadSnapshot();
		const restoredFlows = /* @__PURE__ */ new Map();
		for (const [flowId, flow] of restored.flows) restoredFlows.set(flowId, normalizeRestoredFlowRecord(flow));
		flows = restoredFlows;
		taskFlowRegistryRestoreState = { status: "ready" };
	} catch (error) {
		flows = /* @__PURE__ */ new Map();
		const message = formatErrorMessage(error);
		const restoreError = new Error(`Task-flow registry restore failed: ${message}`, { cause: error });
		taskFlowRegistryRestoreState = {
			status: "failed",
			error: restoreError,
			message
		};
		log.warn("Failed to restore task-flow registry", {
			error: message,
			consoleMessage: `Failed to restore task-flow registry: ${message}`
		});
		throw restoreError;
	}
	emitFlowRegistryObserverEvent(() => ({
		kind: "restored",
		flows: snapshotFlowRecords(flows)
	}));
}
function ensureTaskFlowRegistryReady() {
	restoreTaskFlowRegistryOnce();
}
function getTaskFlowRegistryRestoreFailure() {
	try {
		ensureTaskFlowRegistryReady();
		return null;
	} catch {
		return taskFlowRegistryRestoreState.status === "failed" ? taskFlowRegistryRestoreState.message : "Task-flow registry restore did not complete.";
	}
}
function reloadTaskFlowRegistryFromStore() {
	flows = /* @__PURE__ */ new Map();
	taskFlowRegistryRestoreState = { status: "uninitialized" };
	ensureTaskFlowRegistryReady();
}
function createFlowSnapshotWith(next, deletedFlowId) {
	const snapshot = new Map(snapshotFlowRecords(flows).map((flow) => [flow.flowId, flow]));
	if (deletedFlowId) snapshot.delete(deletedFlowId);
	if (next) snapshot.set(next.flowId, cloneFlowRecord(next));
	return snapshot;
}
function persistFlowRegistry() {
	try {
		getTaskFlowRegistryStore().saveSnapshot({ flows: createFlowSnapshotWith() });
		return true;
	} catch (error) {
		log.warn("Failed to persist task-flow registry snapshot", { error });
		return false;
	}
}
function persistFlowUpsert(flow) {
	const store = getTaskFlowRegistryStore();
	if (store.upsertFlow) {
		store.upsertFlow(cloneFlowRecord(flow));
		return;
	}
	store.saveSnapshot({ flows: createFlowSnapshotWith(flow) });
}
function tryPersistFlowUpsert(flow, operation) {
	try {
		persistFlowUpsert(flow);
		return true;
	} catch (error) {
		log.warn("Failed to persist task-flow registry upsert", {
			operation,
			flowId: flow.flowId,
			error
		});
		return false;
	}
}
function persistFlowDelete(flowId) {
	const store = getTaskFlowRegistryStore();
	if (store.deleteFlow) {
		store.deleteFlow(flowId);
		return;
	}
	store.saveSnapshot({ flows: createFlowSnapshotWith(void 0, flowId) });
}
function tryPersistFlowDelete(flowId) {
	try {
		persistFlowDelete(flowId);
		return true;
	} catch (error) {
		log.warn("Failed to persist task-flow registry delete", {
			flowId,
			error
		});
		return false;
	}
}
function buildFlowRecord(params) {
	const now = params.createdAt ?? Date.now();
	const syncMode = params.syncMode ?? "managed";
	const controllerId = syncMode === "managed" ? assertControllerId(params.controllerId) : void 0;
	return {
		flowId: crypto.randomUUID(),
		syncMode,
		ownerKey: assertFlowOwnerKey(params.ownerKey),
		...params.requesterOrigin ? { requesterOrigin: cloneStructuredValue(params.requesterOrigin) } : {},
		...controllerId ? { controllerId } : {},
		revision: Math.max(0, params.revision ?? 0),
		status: params.status ?? "queued",
		notifyPolicy: ensureNotifyPolicy$1(params.notifyPolicy),
		goal: params.goal,
		currentStep: normalizeOptionalString(params.currentStep),
		blockedTaskId: normalizeOptionalString(params.blockedTaskId),
		blockedSummary: normalizeOptionalString(params.blockedSummary),
		...normalizeJsonBlob(params.stateJson) !== void 0 ? { stateJson: normalizeJsonBlob(params.stateJson) } : {},
		...normalizeJsonBlob(params.waitJson) !== void 0 ? { waitJson: normalizeJsonBlob(params.waitJson) } : {},
		...params.cancelRequestedAt != null ? { cancelRequestedAt: params.cancelRequestedAt } : {},
		createdAt: now,
		updatedAt: params.updatedAt ?? now,
		...params.endedAt != null ? { endedAt: params.endedAt } : {}
	};
}
function applyFlowPatch(current, patch) {
	const controllerId = patch.controllerId === void 0 ? current.controllerId : normalizeOptionalString(patch.controllerId);
	if (current.syncMode === "managed") assertControllerId(controllerId);
	return {
		...current,
		...patch.status ? { status: patch.status } : {},
		...patch.notifyPolicy ? { notifyPolicy: patch.notifyPolicy } : {},
		...patch.goal ? { goal: patch.goal } : {},
		controllerId,
		currentStep: patch.currentStep === void 0 ? current.currentStep : normalizeOptionalString(patch.currentStep),
		blockedTaskId: patch.blockedTaskId === void 0 ? current.blockedTaskId : normalizeOptionalString(patch.blockedTaskId),
		blockedSummary: patch.blockedSummary === void 0 ? current.blockedSummary : normalizeOptionalString(patch.blockedSummary),
		stateJson: patch.stateJson === void 0 ? current.stateJson : normalizeJsonBlob(patch.stateJson),
		waitJson: patch.waitJson === void 0 ? current.waitJson : normalizeJsonBlob(patch.waitJson),
		cancelRequestedAt: patch.cancelRequestedAt === void 0 ? current.cancelRequestedAt : patch.cancelRequestedAt ?? void 0,
		revision: current.revision + 1,
		updatedAt: patch.updatedAt ?? Date.now(),
		endedAt: patch.endedAt === void 0 ? current.endedAt : patch.endedAt ?? void 0
	};
}
function writeFlowRecord(next, previous) {
	if (!tryPersistFlowUpsert(next, previous ? "update" : "create")) return null;
	flows.set(next.flowId, next);
	emitFlowRegistryObserverEvent(() => ({
		kind: "upserted",
		flow: cloneFlowRecord(next),
		...previous ? { previous: cloneFlowRecord(previous) } : {}
	}));
	return cloneFlowRecord(next);
}
function createFlowRecord(params) {
	ensureTaskFlowRegistryReady();
	return writeFlowRecord(buildFlowRecord(params));
}
function createManagedTaskFlow(params) {
	return createFlowRecord({
		...params,
		syncMode: "managed",
		controllerId: assertControllerId(params.controllerId)
	});
}
function createTaskFlowForTask(params) {
	const terminalFlowStatus = deriveTaskFlowStatusFromTask(params.task);
	const timing = resolveTaskMirroredFlowTiming(params.task, isTerminalTaskFlowStatus(terminalFlowStatus));
	return createFlowRecord({
		syncMode: "task_mirrored",
		ownerKey: params.task.ownerKey,
		requesterOrigin: params.requesterOrigin,
		status: terminalFlowStatus,
		notifyPolicy: params.task.notifyPolicy,
		goal: normalizeOptionalString(params.task.label) ?? (params.task.task.trim() || "Background task"),
		blockedTaskId: terminalFlowStatus === "blocked" ? normalizeOptionalString(params.task.taskId) : void 0,
		blockedSummary: resolveFlowBlockedSummary(params.task),
		createdAt: params.task.createdAt,
		updatedAt: timing.updatedAt,
		...timing.endedAt !== void 0 ? { endedAt: timing.endedAt } : {}
	});
}
function updateFlowRecordByIdUnchecked(flowId, patch) {
	ensureTaskFlowRegistryReady();
	const current = flows.get(flowId);
	if (!current) return null;
	return writeFlowRecord(applyFlowPatch(current, patch), current);
}
function updateFlowRecordByIdExpectedRevision(params) {
	ensureTaskFlowRegistryReady();
	const current = flows.get(params.flowId);
	if (!current) return {
		applied: false,
		reason: "not_found"
	};
	if (current.revision !== params.expectedRevision) return {
		applied: false,
		reason: "revision_conflict",
		current: cloneFlowRecord(current)
	};
	const flow = writeFlowRecord(applyFlowPatch(current, params.patch), current);
	if (!flow) return {
		applied: false,
		reason: "persist_failed",
		current: cloneFlowRecord(current)
	};
	return {
		applied: true,
		flow
	};
}
function setFlowWaiting(params) {
	return updateFlowRecordByIdExpectedRevision({
		flowId: params.flowId,
		expectedRevision: params.expectedRevision,
		patch: {
			status: normalizeOptionalString(params.blockedTaskId) || normalizeOptionalString(params.blockedSummary) ? "blocked" : "waiting",
			currentStep: params.currentStep,
			stateJson: params.stateJson,
			waitJson: params.waitJson,
			blockedTaskId: params.blockedTaskId,
			blockedSummary: params.blockedSummary,
			endedAt: null,
			updatedAt: params.updatedAt
		}
	});
}
function resumeFlow(params) {
	return updateFlowRecordByIdExpectedRevision({
		flowId: params.flowId,
		expectedRevision: params.expectedRevision,
		patch: {
			status: params.status ?? "queued",
			currentStep: params.currentStep,
			stateJson: params.stateJson,
			waitJson: null,
			blockedTaskId: null,
			blockedSummary: null,
			endedAt: null,
			updatedAt: params.updatedAt
		}
	});
}
function finishFlow(params) {
	const endedAt = params.endedAt ?? params.updatedAt ?? Date.now();
	return updateFlowRecordByIdExpectedRevision({
		flowId: params.flowId,
		expectedRevision: params.expectedRevision,
		patch: {
			status: "succeeded",
			currentStep: params.currentStep,
			stateJson: params.stateJson,
			waitJson: null,
			blockedTaskId: null,
			blockedSummary: null,
			endedAt,
			updatedAt: params.updatedAt ?? endedAt
		}
	});
}
function failFlow(params) {
	const endedAt = params.endedAt ?? params.updatedAt ?? Date.now();
	return updateFlowRecordByIdExpectedRevision({
		flowId: params.flowId,
		expectedRevision: params.expectedRevision,
		patch: {
			status: "failed",
			currentStep: params.currentStep,
			stateJson: params.stateJson,
			waitJson: null,
			blockedTaskId: params.blockedTaskId,
			blockedSummary: params.blockedSummary,
			endedAt,
			updatedAt: params.updatedAt ?? endedAt
		}
	});
}
function requestFlowCancel(params) {
	return updateFlowRecordByIdExpectedRevision({
		flowId: params.flowId,
		expectedRevision: params.expectedRevision,
		patch: {
			cancelRequestedAt: params.cancelRequestedAt ?? params.updatedAt ?? Date.now(),
			updatedAt: params.updatedAt
		}
	});
}
function syncFlowFromTaskResult(task) {
	const flowId = task.parentFlowId?.trim();
	if (!flowId) return {
		ok: true,
		flow: null
	};
	const flow = getTaskFlowById(flowId);
	if (!flow) return {
		ok: true,
		flow: null
	};
	if (flow.syncMode !== "task_mirrored") return {
		ok: true,
		flow
	};
	const terminalFlowStatus = deriveTaskFlowStatusFromTask(task);
	const isTerminal = isTerminalTaskFlowStatus(terminalFlowStatus);
	const timing = resolveTaskMirroredFlowTiming({
		createdAt: flow.createdAt,
		lastEventAt: task.lastEventAt,
		endedAt: task.endedAt
	}, isTerminal);
	const updated = updateFlowRecordByIdUnchecked(flowId, {
		status: terminalFlowStatus,
		notifyPolicy: task.notifyPolicy,
		goal: normalizeOptionalString(task.label) ?? (task.task.trim() || "Background task"),
		blockedTaskId: terminalFlowStatus === "blocked" ? task.taskId.trim() || null : null,
		blockedSummary: terminalFlowStatus === "blocked" ? resolveFlowBlockedSummary(task) ?? null : null,
		waitJson: null,
		updatedAt: timing.updatedAt,
		...isTerminal ? { endedAt: timing.endedAt ?? timing.updatedAt } : { endedAt: null }
	});
	if (!updated) return {
		ok: false,
		reason: "persist_failed",
		current: flow
	};
	return {
		ok: true,
		flow: updated
	};
}
function getTaskFlowById(flowId) {
	ensureTaskFlowRegistryReady();
	const flow = flows.get(flowId);
	return flow ? cloneFlowRecord(flow) : void 0;
}
function listTaskFlowsForOwnerKey(ownerKey) {
	ensureTaskFlowRegistryReady();
	const normalizedOwnerKey = ownerKey.trim();
	if (!normalizedOwnerKey) return [];
	return [...flows.values()].filter((flow) => flow.ownerKey.trim() === normalizedOwnerKey).map((flow) => cloneFlowRecord(flow)).toSorted((left, right) => right.createdAt - left.createdAt);
}
function findLatestTaskFlowForOwnerKey(ownerKey) {
	return listTaskFlowsForOwnerKey(ownerKey)[0];
}
function findTaskFlowForOwnerLookup(ownerKey) {
	const ownerFlows = listTaskFlowsForOwnerKey(ownerKey);
	return ownerFlows.find((flow) => !isTerminalTaskFlow(flow)) ?? ownerFlows[0];
}
function resolveTaskFlowForLookupToken(token) {
	const lookup = token.trim();
	if (!lookup) return;
	return getTaskFlowById(lookup) ?? findTaskFlowForOwnerLookup(lookup);
}
function listTaskFlowRecords() {
	ensureTaskFlowRegistryReady();
	return [...flows.values()].map((flow) => cloneFlowRecord(flow)).toSorted((left, right) => right.createdAt - left.createdAt);
}
function deleteTaskFlowRecordById(flowId) {
	ensureTaskFlowRegistryReady();
	const current = flows.get(flowId);
	if (!current) return false;
	if (!tryPersistFlowDelete(flowId)) return false;
	flows.delete(flowId);
	emitFlowRegistryObserverEvent(() => ({
		kind: "deleted",
		flowId,
		previous: cloneFlowRecord(current)
	}));
	return true;
}
function resetTaskFlowRegistryForTests(opts) {
	flows = /* @__PURE__ */ new Map();
	taskFlowRegistryRestoreState = { status: "uninitialized" };
	resetTaskFlowRegistryRuntimeForTests();
	if (opts?.persist !== false) persistFlowRegistry();
	getTaskFlowRegistryStore().close?.();
}
if (process.env.VITEST || false) globalThis[Symbol.for("openclaw.taskFlowRegistryTestApi")] = {
	createFlowRecord,
	resetTaskFlowRegistryForTests
};
//#endregion
//#region src/tasks/task-backing-authority.ts
const TASK_BACKING_DETAIL_KIND = "task_backing_instance";
function readTaskBackingInstance(value) {
	const detail = asOptionalRecord(value);
	if (detail?.kind !== TASK_BACKING_DETAIL_KIND) return;
	if (detail.runtime === "acp") {
		const instanceId = typeof detail.instanceId === "string" ? detail.instanceId.trim() : "";
		return instanceId && typeof detail.generation === "number" && Number.isSafeInteger(detail.generation) && detail.generation > 0 ? {
			runtime: "acp",
			instanceId,
			generation: detail.generation
		} : void 0;
	}
	if (detail.runtime === "subagent" && typeof detail.generation === "number" && Number.isSafeInteger(detail.generation) && detail.generation > 0) return {
		runtime: "subagent",
		generation: detail.generation
	};
}
function readManagedTaskBacking(value) {
	const detail = asOptionalRecord(value);
	const taskId = typeof detail?.taskId === "string" ? detail.taskId.trim() : "";
	const instance = readTaskBackingInstance(detail);
	return taskId && instance ? {
		taskId,
		instance
	} : void 0;
}
function sameTaskBackingInstance(left, right) {
	return left.runtime === "acp" && right.runtime === "acp" ? left.instanceId === right.instanceId && left.generation === right.generation : left.runtime === "subagent" && right.runtime === "subagent" ? left.generation === right.generation : false;
}
function isCanonicalBackingTask(task) {
	const flowId = task.parentFlowId?.trim();
	return Boolean(flowId && getTaskFlowById(flowId)?.syncMode === "task_mirrored");
}
function resolveCurrentCanonicalBacking(params) {
	ensureTaskRegistryReady();
	const current = [...taskIdsByRelatedSessionKey.get(params.childSessionKey) ?? []].flatMap((taskId) => {
		const task = tasks.get(taskId);
		return task ? [task] : [];
	}).flatMap((task) => {
		const instance = readTaskBackingInstance(task.detail);
		return instance && instance.runtime === params.runtime && task.runtime === params.runtime && task.scopeKind === params.scopeKind && task.childSessionKey?.trim() === params.childSessionKey && isCanonicalBackingTask(task) ? [{
			task,
			instance
		}] : [];
	}).toSorted((left, right) => {
		const generationDelta = right.instance.generation - left.instance.generation;
		if (generationDelta !== 0) return generationDelta;
		return right.task.createdAt - left.task.createdAt || right.task.taskId.localeCompare(left.task.taskId);
	})[0];
	return current?.task.ownerKey === params.ownerKey && current.task.runId?.trim() === params.runId ? current : void 0;
}
function createAcpTaskBackingDetail(instanceId, generation = 1) {
	return {
		kind: TASK_BACKING_DETAIL_KIND,
		runtime: "acp",
		instanceId,
		generation
	};
}
function createNextAcpTaskBackingDetail(params) {
	ensureTaskRegistryReady();
	let generation = 0;
	for (const taskId of taskIdsByRelatedSessionKey.get(params.childSessionKey) ?? []) {
		const task = tasks.get(taskId);
		const instance = task ? readTaskBackingInstance(task.detail) : void 0;
		if (task && instance?.runtime === "acp" && isCanonicalBackingTask(task)) generation = Math.max(generation, instance.generation);
	}
	return createAcpTaskBackingDetail(params.instanceId, generation + 1);
}
function createSubagentTaskBackingDetail(generation) {
	return {
		kind: TASK_BACKING_DETAIL_KIND,
		runtime: "subagent",
		generation
	};
}
function resolveManagedTaskBackingDetail(params) {
	const current = resolveCurrentCanonicalBacking(params);
	return current ? current.instance.runtime === "acp" ? {
		...createAcpTaskBackingDetail(current.instance.instanceId, current.instance.generation),
		taskId: current.task.taskId
	} : {
		...createSubagentTaskBackingDetail(current.instance.generation),
		taskId: current.task.taskId
	} : void 0;
}
function getManagedTaskBackingInstance(task) {
	const flowId = task.parentFlowId?.trim();
	return flowId && getTaskFlowById(flowId)?.syncMode === "managed" ? readManagedTaskBacking(task.detail)?.instance : void 0;
}
/** A managed projection may control a child only while its exact canonical instance is current. */
function hasAuthoritativeTaskBacking(task) {
	if (task.runtime !== "acp" && task.runtime !== "subagent") return true;
	const flowId = task.parentFlowId?.trim();
	if (!flowId || getTaskFlowById(flowId)?.syncMode !== "managed") return true;
	const childSessionKey = task.childSessionKey?.trim();
	if (!childSessionKey) return true;
	const runId = task.runId?.trim();
	const managed = readManagedTaskBacking(task.detail);
	if (!runId || !managed) return false;
	const current = resolveCurrentCanonicalBacking({
		runtime: task.runtime,
		scopeKind: task.scopeKind,
		ownerKey: task.ownerKey,
		childSessionKey,
		runId
	});
	return Boolean(current && current.task.taskId === managed.taskId && sameTaskBackingInstance(current.instance, managed.instance));
}
//#endregion
//#region src/tasks/task-registry-common.ts
var ParentFlowLinkError = class extends Error {
	constructor(code, message, details) {
		super(message);
		this.code = code;
		this.details = details;
		this.name = "ParentFlowLinkError";
	}
};
function isParentFlowLinkError(error) {
	return error instanceof ParentFlowLinkError;
}
function isActiveTaskStatus(status) {
	return status === "queued" || status === "running";
}
function assertTaskOwner(params) {
	if (!params.ownerKey.trim() && params.scopeKind !== "system") throw new Error("Task ownerKey is required.");
}
function assertParentFlowLinkAllowed(params) {
	const flowId = params.parentFlowId?.trim();
	if (!flowId) return;
	if (params.scopeKind !== "session") throw new ParentFlowLinkError("scope_kind_not_session", "Only session-scoped tasks can link to flows.", { flowId });
	const flow = getTaskFlowById(flowId);
	if (!flow) throw new ParentFlowLinkError("parent_flow_not_found", `Parent flow not found: ${flowId}`, { flowId });
	if (normalizeOptionalString(flow.ownerKey) !== normalizeOptionalString(params.ownerKey)) throw new ParentFlowLinkError("owner_key_mismatch", "Task ownerKey must match parent flow ownerKey.", { flowId });
	if (flow.cancelRequestedAt != null) throw new ParentFlowLinkError("cancel_requested", "Parent flow cancellation has already been requested.", {
		flowId,
		status: flow.status
	});
	if (isTerminalTaskFlow(flow)) throw new ParentFlowLinkError("terminal", `Parent flow is already ${flow.status}.`, {
		flowId,
		status: flow.status
	});
}
function ensureLinkedTaskFlowRegistryReady(task) {
	if (task.parentFlowId?.trim()) ensureTaskFlowRegistryReady();
}
function ensureDeliveryStatus(params) {
	if (params.scopeKind === "system") return "not_applicable";
	return params.ownerKey.trim() ? "pending" : "parent_missing";
}
function ensureNotifyPolicy(params) {
	if (params.notifyPolicy) return params.notifyPolicy;
	return (params.deliveryStatus ?? ensureDeliveryStatus({
		ownerKey: params.ownerKey,
		scopeKind: params.scopeKind
	})) === "not_applicable" ? "silent" : "done_only";
}
function resolveTaskScopeKind(params) {
	if (params.scopeKind) return params.scopeKind;
	return params.requesterSessionKey.trim() ? "session" : "system";
}
function resolveTaskRequesterSessionKey(params) {
	const requesterSessionKey = params.requesterSessionKey?.trim();
	if (requesterSessionKey) return requesterSessionKey;
	if (params.scopeKind === "system") return "";
	return params.ownerKey?.trim() ?? "";
}
function resolveTaskOwnerKey(params) {
	return params.ownerKey?.trim() || params.requesterSessionKey.trim();
}
function normalizeTaskSummary(value) {
	return value?.replace(/\s+/g, " ").trim() || void 0;
}
function normalizeTaskStatus(value) {
	return value === "running" || value === "queued" || value === "succeeded" || value === "failed" || value === "timed_out" || value === "cancelled" || value === "lost" ? value : "queued";
}
function normalizeTaskTerminalOutcome(value) {
	return value === "succeeded" || value === "blocked" ? value : void 0;
}
function shouldApplyRunScopedStatusUpdate(params) {
	if (params.currentRuntime === "subagent" && params.nextStatus === "cancelled" && params.nextError === "Subagent run killed." && isTerminalTaskStatus(params.currentStatus) && !(params.currentStatus === "cancelled" && params.currentError === "Subagent run killed.")) return false;
	if (params.currentStatus === params.nextStatus) return true;
	if (!isTerminalTaskStatus(params.currentStatus)) return true;
	if (!isTerminalTaskStatus(params.nextStatus)) return false;
	if (params.currentStatus === "cancelled" && (params.nextStatus === "succeeded" || params.nextStatus === "failed" || params.nextStatus === "timed_out")) return params.currentRuntime === "subagent" && params.currentEndedAt !== void 0 && params.nextEndedAt !== void 0 && params.nextEndedAt < params.currentEndedAt || params.currentRuntime === "subagent" && Boolean(params.currentChildSessionKey?.trim()) && params.currentError === "Subagent run killed.";
	return params.currentStatus === "succeeded" && params.nextStatus !== "lost";
}
function resolveTaskTerminalOutcome(params) {
	const normalized = normalizeTaskTerminalOutcome(params.terminalOutcome);
	if (normalized) return normalized;
	return params.status === "succeeded" ? "succeeded" : void 0;
}
const TASK_STATUS_BY_TERMINAL_CLASSIFICATION = {
	success: "succeeded",
	timeout: "timed_out",
	cancellation: "cancelled",
	failure: "failed"
};
function mapAgentRunTerminalOutcomeToTaskStatus(outcome) {
	return TASK_STATUS_BY_TERMINAL_CLASSIFICATION[classifyAgentRunTerminalOutcome(outcome)];
}
function resolveTaskLifecycleTerminalError(params) {
	return params.runtime === "subagent" && params.status === "cancelled" && params.terminalReason !== "superseded" ? SUBAGENT_KILL_TASK_ERROR : params.error;
}
function appendTaskEvent(event) {
	const summary = normalizeTaskSummary(event.summary);
	return {
		at: event.at,
		kind: event.kind,
		...summary ? { summary } : {}
	};
}
//#endregion
//#region src/auto-reply/reply/completion-delivery-policy.ts
function resolveCompletionChatType(params) {
	const explicit = normalizeChatType(params.requesterEntry?.chatType ?? sessionDeliveryOrigin(params.requesterEntry)?.chatType);
	if (explicit) return explicit;
	for (const key of [params.targetRequesterSessionKey, params.requesterSessionKey]) {
		const derived = deriveSessionChatTypeFromKey(key);
		if (derived !== "unknown") return derived;
	}
	return inferCompletionChatTypeFromTarget(params.directOrigin?.to ?? params.requesterSessionOrigin?.to);
}
function completionRequiresMessageToolDelivery(params) {
	return resolveSourceReplyDeliveryMode({
		cfg: params.cfg,
		ctx: { ChatType: resolveCompletionChatType(params) },
		messageToolAvailable: params.messageToolAvailable
	}) === "message_tool_only";
}
/** Resolve transport authority for a durable, fixed-route agent completion. */
function resolveDurableCompletionDeliveryMode(sourceReplyDeliveryMode) {
	return sourceReplyDeliveryMode === "message_tool_only" ? "host_owned" : "automatic";
}
function shouldRouteCompletionThroughRequesterSession(sessionKey) {
	const chatType = deriveSessionChatTypeFromKey(sessionKey);
	return chatType === "group" || chatType === "channel";
}
function inferCompletionChatTypeFromTarget(to) {
	const normalized = to?.trim().toLowerCase();
	if (!normalized) return "unknown";
	if (normalized.startsWith("group:")) return "group";
	if (normalized.startsWith("channel:") || normalized.startsWith("thread:")) return "channel";
	if (normalized.startsWith("dm:") || normalized.startsWith("direct:") || normalized.startsWith("user:")) return "direct";
	return "unknown";
}
//#endregion
//#region src/tasks/task-cancellation-state.ts
function isProvisionalSubagentKillTask(task) {
	return task.runtime === "subagent" && task.status === "cancelled" && task.error === "Subagent run killed.";
}
function isTaskFlowCancellationPending(task) {
	return task.status === "queued" || task.status === "running" || isProvisionalSubagentKillTask(task);
}
//#endregion
//#region src/tasks/task-session-identity.ts
/** Retained rows with unresolved owners stay inaccessible without hiding other tasks. */
function resolveTaskSessionAgentId(sessionKey, agentId, cfg) {
	const knownAgentId = normalizeOptionalString(agentId) ?? parseAgentSessionKey(sessionKey)?.agentId;
	if (knownAgentId || !sessionKey || !cfg) return knownAgentId;
	try {
		return resolveSessionAgentId({
			sessionKey,
			config: typeof cfg === "function" ? cfg() : cfg
		});
	} catch {
		return;
	}
}
//#endregion
//#region src/tasks/task-registry-query.ts
function listTaskRecordsUnsorted() {
	ensureTaskRegistryReady();
	return snapshotTaskRecords(tasks);
}
function taskMatchesRelatedSession(task, sessionKey, sessionAgentId, cfg) {
	if (!sessionKey) return true;
	return [
		{
			key: task.requesterSessionKey,
			agentId: task.requesterAgentId
		},
		{
			key: task.childSessionKey,
			agentId: task.agentId
		},
		{
			key: task.ownerKey,
			agentId: task.requesterAgentId
		}
	].some((candidate) => {
		if (normalizeOptionalString(candidate.key) !== sessionKey) return false;
		if (!sessionAgentId) return true;
		return resolveTaskSessionAgentId(candidate.key, candidate.agentId, cfg) === sessionAgentId;
	});
}
function taskMatchesAgent(task, agentId, cfg) {
	if (!agentId) return true;
	const knownAgentId = normalizeOptionalString(task.agentId) ?? normalizeOptionalString(task.requesterAgentId);
	if (knownAgentId) return knownAgentId === agentId;
	return [
		task.requesterSessionKey,
		task.childSessionKey,
		task.ownerKey
	].some((candidate) => resolveTaskSessionAgentId(candidate, void 0, cfg) === agentId);
}
function taskUpdatedAt(task) {
	return task.lastEventAt ?? task.endedAt ?? task.startedAt ?? task.createdAt;
}
function compareTaskPageOrder(left, right) {
	const updatedDiff = taskUpdatedAt(right) - taskUpdatedAt(left);
	if (updatedDiff !== 0) return updatedDiff;
	return left.taskId < right.taskId ? -1 : left.taskId > right.taskId ? 1 : 0;
}
function siftWorstTaskDown(heap, startIndex) {
	let index = startIndex;
	while (true) {
		const leftIndex = index * 2 + 1;
		if (leftIndex >= heap.length) return;
		const left = heap[leftIndex];
		const current = heap[index];
		if (!left || !current) return;
		const rightIndex = leftIndex + 1;
		let worstIndex = leftIndex;
		const right = heap[rightIndex];
		if (right && compareTaskPageOrder(right, left) > 0) worstIndex = rightIndex;
		const worst = heap[worstIndex];
		if (!worst || compareTaskPageOrder(worst, current) <= 0) return;
		heap[index] = worst;
		heap[worstIndex] = current;
		index = worstIndex;
	}
}
function heapifyWorstTaskFirst(heap) {
	for (let index = Math.floor(heap.length / 2) - 1; index >= 0; index -= 1) siftWorstTaskDown(heap, index);
}
const TASK_PAGE_MAX_ATTEMPTS = 3;
async function listTaskRecordPage(params) {
	ensureTaskRegistryReady();
	const statuses = params.statuses ? new Set(params.statuses) : null;
	const agentId = normalizeOptionalString(params.agentId);
	const sessionKey = normalizeOptionalString(params.sessionKey);
	const windowSize = params.offset + params.limit;
	for (let attempt = 0; attempt < TASK_PAGE_MAX_ATTEMPTS; attempt += 1) {
		const revision = readTaskRegistryRevision();
		const scanLimit = tasks.size;
		const window = [];
		let matchingCount = 0;
		let heapReady = false;
		let scannedCount = 0;
		for (const task of tasks.values()) {
			if (scannedCount >= scanLimit) break;
			scannedCount += 1;
			if (scannedCount % 32 === 0) await setImmediate();
			if (statuses && !statuses.has(task.status) || !taskMatchesAgent(task, agentId, params.cfg) || !taskMatchesRelatedSession(task, sessionKey, params.sessionAgentId, params.cfg) || params.filter && !params.filter(task)) continue;
			matchingCount += 1;
			if (windowSize <= 0) continue;
			if (window.length < windowSize) {
				window.push(task);
				continue;
			}
			if (!heapReady) {
				heapifyWorstTaskFirst(window);
				heapReady = true;
			}
			const cutoff = window[0];
			if (cutoff && compareTaskPageOrder(task, cutoff) < 0) {
				window[0] = task;
				siftWorstTaskDown(window, 0);
			}
		}
		if (revision !== readTaskRegistryRevision()) continue;
		if (params.offset >= matchingCount) return ok({
			tasks: [],
			hasMore: false
		});
		const selected = window.toSorted(compareTaskPageOrder).slice(params.offset);
		return ok({
			tasks: selected.map((task) => cloneTaskRecord(task)),
			hasMore: params.offset + selected.length < matchingCount
		});
	}
	return err("registry_changed");
}
function listTaskRecords(filter) {
	ensureTaskRegistryReady();
	const records = [...tasks.values()];
	return (filter ? records.filter(filter) : records).map((task, insertionIndex) => Object.assign({}, cloneTaskRecord(task), { insertionIndex })).toSorted(compareTasksNewestFirst).map(({ insertionIndex: _insertionIndex, ...task }) => task);
}
function hasActiveTaskForChildSessionKey(params) {
	ensureTaskRegistryReady();
	const sessionKey = normalizeOptionalString(params.sessionKey);
	if (!sessionKey) return false;
	const ids = taskIdsByRelatedSessionKey.get(sessionKey);
	if (!ids) return false;
	for (const taskId of ids) {
		if (taskId === params.excludeTaskId) continue;
		const task = tasks.get(taskId);
		if (task && isActiveTaskStatus(task.status) && normalizeOptionalString(task.childSessionKey) === sessionKey && (!params.agentId || resolveTaskSessionAgentId(task.childSessionKey, task.agentId) === params.agentId)) return true;
	}
	return false;
}
function getTaskById(taskId) {
	ensureTaskRegistryReady();
	const task = tasks.get(taskId.trim());
	return task ? cloneTaskRecord(task) : void 0;
}
function findTaskByRunId(runId) {
	ensureTaskRegistryReady();
	const task = pickPreferredRunIdTask(getTasksByRunId(runId));
	return task ? cloneTaskRecord(task) : void 0;
}
function listTasksFromIndex(index, key) {
	const ids = index.get(key);
	if (!ids || ids.size === 0) return [];
	return [...ids].map((taskId, insertionIndex) => {
		const task = tasks.get(taskId);
		return task ? Object.assign({}, cloneTaskRecord(task), { insertionIndex }) : null;
	}).filter((task) => Boolean(task)).toSorted(compareTasksNewestFirst).map(({ insertionIndex: _insertionIndex, ...task }) => task);
}
function listTasksForAgentId(agentId) {
	ensureTaskRegistryReady();
	const lookup = agentId.trim();
	if (!lookup) return [];
	return snapshotTaskRecords(tasks).filter((task) => task.agentId?.trim() === lookup).toSorted(compareTasksNewestFirst);
}
function findLatestTaskForFlowId(flowId) {
	const task = listTasksForFlowId(flowId)[0];
	return task ? cloneTaskRecord(task) : void 0;
}
function listTasksForOwnerKey(ownerKey) {
	ensureTaskRegistryReady();
	const key = normalizeOptionalString(ownerKey);
	if (!key) return [];
	return listTasksFromIndex(taskIdsByOwnerKey, key);
}
function listFreshTasksForOwnerKey(ownerKey) {
	ensureTaskRegistryReady();
	const key = normalizeOptionalString(ownerKey);
	if (!key) return [];
	const store = getTaskRegistryStore();
	if (store.listTasksForOwnerKey) try {
		const merged = /* @__PURE__ */ new Map();
		for (const task of store.listTasksForOwnerKey(key)) merged.set(task.taskId, cloneTaskRecord(normalizeTaskTimestamps(task)));
		return [...merged.values()].map((task, insertionIndex) => Object.assign({}, task, { insertionIndex })).toSorted(compareTasksNewestFirst).map(({ insertionIndex: _insertionIndex, ...task }) => task);
	} catch (error) {
		taskRegistryLog.warn("Failed to read fresh owner task registry records", {
			ownerKey: key,
			error
		});
	}
	return listTasksFromIndex(taskIdsByOwnerKey, key);
}
function listTasksForFlowId(flowId) {
	ensureTaskRegistryReady();
	const key = flowId.trim();
	if (!key) return [];
	return listTasksFromIndex(taskIdsByParentFlowId, key);
}
function findLatestTaskForRelatedSessionKey(sessionKey) {
	const task = listTasksForRelatedSessionKey(sessionKey)[0];
	return task ? cloneTaskRecord(task) : void 0;
}
function listTasksForRelatedSessionKey(sessionKey, sessionAgentId) {
	ensureTaskRegistryReady();
	const key = normalizeOptionalString(sessionKey);
	if (!key) return [];
	return listTasksFromIndex(taskIdsByRelatedSessionKey, key).filter((task) => taskMatchesRelatedSession(task, key, sessionAgentId));
}
function resolveTaskForLookupToken(token) {
	const lookup = token.trim();
	if (!lookup) return;
	return getTaskById(lookup) ?? findTaskByRunId(lookup) ?? findLatestTaskForRelatedSessionKey(lookup);
}
function deleteTaskRecordById(taskId) {
	ensureTaskRegistryReady();
	const current = tasks.get(taskId);
	if (!current) return false;
	ensureLinkedTaskFlowRegistryReady(current);
	if (!tryPersistTaskDelete(taskId)) return false;
	deleteOwnerKeyIndex(taskId, current);
	deleteParentFlowIdIndex(taskId, current);
	deleteRelatedSessionKeyIndex(taskId, current);
	clearTaskActivity(taskId);
	tasks.delete(taskId);
	bumpTaskRegistryRevision();
	taskDeliveryStates.delete(taskId);
	rebuildRunIdIndex();
	emitTaskRegistryObserverEvent(() => ({
		kind: "deleted",
		taskId: current.taskId,
		previous: cloneTaskRecord(current)
	}));
	return true;
}
function resetTaskRegistryForTests(opts) {
	clearTaskRegistryMemory();
	resetTaskRegistryRestoreState();
	resetTaskRegistryRuntimeForTests();
	resetTaskRegistryListenerState();
	deliveryRuntimeLoader.clear();
	controlRuntimeLoader.clear();
	if (opts?.persist !== false) persistTaskRegistry();
	getTaskRegistryStore().close?.();
}
function resetTaskRegistryDeliveryRuntimeForTests() {
	globalThis[TASK_REGISTRY_DELIVERY_RUNTIME_OVERRIDE_KEY] = null;
	deliveryRuntimeLoader.clear();
}
function setTaskRegistryDeliveryRuntimeForTests(runtime) {
	globalThis[TASK_REGISTRY_DELIVERY_RUNTIME_OVERRIDE_KEY] = runtime;
	deliveryRuntimeLoader.clear();
}
function resetTaskRegistryControlRuntimeForTests() {
	globalThis[TASK_REGISTRY_CONTROL_RUNTIME_OVERRIDE_KEY] = null;
	controlRuntimeLoader.clear();
}
function setTaskRegistryControlRuntimeForTests(runtime) {
	globalThis[TASK_REGISTRY_CONTROL_RUNTIME_OVERRIDE_KEY] = runtime;
	controlRuntimeLoader.clear();
}
//#endregion
//#region src/tasks/task-registry-mutation.ts
function syncManagedFlowCancellationFromTask(task) {
	const flowId = task.parentFlowId?.trim();
	if (!flowId) return;
	let flow = getTaskFlowById(flowId);
	if (!flow || flow.syncMode !== "managed" || flow.cancelRequestedAt == null || isTerminalTaskFlow(flow)) return;
	if (listTasksForFlowId(flowId).some(isTaskFlowCancellationPending)) return;
	const endedAt = task.endedAt ?? task.lastEventAt ?? Date.now();
	for (let attempt = 0; attempt < 2; attempt += 1) {
		const result = updateFlowRecordByIdExpectedRevision({
			flowId,
			expectedRevision: flow.revision,
			patch: {
				status: "cancelled",
				blockedTaskId: null,
				blockedSummary: null,
				waitJson: null,
				endedAt,
				updatedAt: endedAt
			}
		});
		if (result.applied || result.reason === "not_found") return;
		flow = result.current;
		if (!flow || flow.syncMode !== "managed" || flow.cancelRequestedAt == null || isTerminalTaskFlow(flow)) return;
		if (listTasksForFlowId(flowId).some(isTaskFlowCancellationPending)) return;
	}
}
function scheduleTaskFlowSyncRetry(task, operation, attempt = 0) {
	const taskId = task.taskId.trim();
	if (!taskId || taskFlowSyncRetryTimers.has(taskId)) return;
	const delayMs = TASK_FLOW_SYNC_RETRY_DELAYS_MS[attempt];
	if (delayMs == null) {
		taskRegistryLog.warn("Exhausted parent flow sync retries from task", {
			operation,
			taskId,
			flowId: task.parentFlowId
		});
		return;
	}
	const retryTimer = setTimeout(() => {
		taskFlowSyncRetryTimers.delete(taskId);
		runWithGatewayIndependentRootWorkAdmission(async () => {
			const current = tasks.get(taskId);
			if (!current) return;
			const flowId = current.parentFlowId?.trim();
			if (!flowId || findLatestTaskForFlowId(flowId)?.taskId !== taskId) return;
			const result = syncFlowFromTaskResult(current);
			if (!result.ok) {
				taskRegistryLog.warn("Failed to retry parent flow sync from task", {
					operation,
					taskId,
					flowId: current.parentFlowId,
					reason: result.reason
				});
				scheduleTaskFlowSyncRetry(current, operation, attempt + 1);
			}
		}, "tasks:mutation").catch((error) => {
			taskRegistryLog.warn("Failed to admit parent flow sync retry from task", {
				operation,
				taskId,
				flowId: task.parentFlowId,
				error
			});
		});
	}, delayMs);
	retryTimer.unref?.();
	taskFlowSyncRetryTimers.set(taskId, retryTimer);
}
function syncFlowFromTaskAfterTaskMutation(task, operation) {
	const result = syncFlowFromTaskResult(task);
	if (result.ok) return;
	taskRegistryLog.warn("Failed to sync parent flow from task mutation", {
		operation,
		taskId: task.taskId,
		flowId: task.parentFlowId,
		reason: result.reason
	});
	scheduleTaskFlowSyncRetry(task, operation);
}
function updateTask(taskId, patch) {
	const current = tasks.get(taskId);
	if (!current) return null;
	const next = normalizeTaskTimestamps({
		...current,
		...patch,
		...patch.detail !== void 0 ? { detail: structuredClone(patch.detail) } : {}
	});
	if (Object.hasOwn(patch, "error") && patch.error === void 0) delete next.error;
	if (Object.hasOwn(patch, "childSessionKey") && patch.childSessionKey === void 0) delete next.childSessionKey;
	if (isTerminalTaskStatus(next.status) && typeof next.cleanupAfter !== "number") {
		const createdAt = next.createdAt ?? Date.now();
		next.cleanupAfter = resolveTaskCleanupAfter({
			...next,
			createdAt
		});
	}
	const sessionIndexChanged = normalizeOptionalString(current.ownerKey) !== normalizeOptionalString(next.ownerKey) || normalizeOptionalString(current.childSessionKey) !== normalizeOptionalString(next.childSessionKey);
	const parentFlowIndexChanged = current.parentFlowId?.trim() !== next.parentFlowId?.trim();
	ensureLinkedTaskFlowRegistryReady(current);
	ensureLinkedTaskFlowRegistryReady(next);
	const becomesTerminal = !isTerminalTaskStatus(current.status) && isTerminalTaskStatus(next.status);
	if (becomesTerminal) flushTaskActivity(taskId);
	if (!tryPersistTaskUpsert(next, "update")) return null;
	tasks.set(taskId, next);
	bumpTaskRegistryRevision();
	if (becomesTerminal) clearTaskActivity(taskId);
	if (patch.runId && patch.runId !== current.runId) rebuildRunIdIndex();
	if (sessionIndexChanged) {
		deleteOwnerKeyIndex(taskId, current);
		addOwnerKeyIndex(taskId, next);
		deleteRelatedSessionKeyIndex(taskId, current);
		addRelatedSessionKeyIndex(taskId, next);
	}
	if (parentFlowIndexChanged) {
		deleteParentFlowIdIndex(taskId, current);
		addParentFlowIdIndex(taskId, next);
	}
	syncFlowFromTaskAfterTaskMutation(next, "update");
	try {
		syncManagedFlowCancellationFromTask(next);
	} catch (error) {
		taskRegistryLog.warn("Failed to finalize managed flow cancellation from task update", {
			taskId,
			flowId: next.parentFlowId,
			error
		});
	}
	emitTaskRegistryObserverEvent(() => ({
		kind: "upserted",
		task: cloneTaskRecord(next),
		previous: cloneTaskRecord(current)
	}));
	return cloneTaskRecord(next);
}
/** Publishes a record already committed by a cross-owner shared-state transaction. */
function publishTaskRecordAfterAtomicStore(record) {
	const next = normalizeTaskTimestamps(cloneTaskRecord(record));
	const current = tasks.get(next.taskId);
	const becomesTerminal = current !== void 0 && !isTerminalTaskStatus(current.status) && isTerminalTaskStatus(next.status);
	if (becomesTerminal) flushTaskActivity(next.taskId);
	if (current) {
		deleteOwnerKeyIndex(next.taskId, current);
		deleteParentFlowIdIndex(next.taskId, current);
		deleteRelatedSessionKeyIndex(next.taskId, current);
	}
	tasks.set(next.taskId, next);
	bumpTaskRegistryRevision();
	if (becomesTerminal) clearTaskActivity(next.taskId);
	addOwnerKeyIndex(next.taskId, next);
	addParentFlowIdIndex(next.taskId, next);
	addRelatedSessionKeyIndex(next.taskId, next);
	rebuildRunIdIndex();
	syncFlowFromTaskAfterTaskMutation(next, "atomic completion admission");
	emitTaskRegistryObserverEvent(() => ({
		kind: "upserted",
		task: cloneTaskRecord(next),
		...current ? { previous: cloneTaskRecord(current) } : {}
	}));
	return cloneTaskRecord(next);
}
function upsertTaskDeliveryState(state) {
	const current = taskDeliveryStates.get(state.taskId);
	const next = {
		taskId: state.taskId,
		...state.requesterOrigin ? { requesterOrigin: normalizeDeliveryContext(state.requesterOrigin) } : {},
		...state.lastNotifiedEventAt != null ? { lastNotifiedEventAt: state.lastNotifiedEventAt } : {}
	};
	if (!next.requesterOrigin && typeof next.lastNotifiedEventAt !== "number" && !current) return cloneTaskDeliveryState({ taskId: state.taskId });
	if (!tryPersistTaskDeliveryStateUpsert(next)) return current ? cloneTaskDeliveryState(current) : cloneTaskDeliveryState({ taskId: state.taskId });
	taskDeliveryStates.set(state.taskId, next);
	return cloneTaskDeliveryState(next);
}
function getTaskDeliveryState(taskId) {
	const state = taskDeliveryStates.get(taskId);
	return state ? cloneTaskDeliveryState(state) : void 0;
}
//#endregion
//#region src/tasks/task-registry-delivery.ts
function resolveTaskStateChangeIdempotencyKey(params) {
	if (params.owner.flowId) return `flow-event:${params.owner.flowId}:${params.task.taskId}:${params.latestEvent.at}:${params.latestEvent.kind}`;
	return `task-event:${params.task.taskId}:${params.latestEvent.at}:${params.latestEvent.kind}`;
}
function resolveTaskTerminalIdempotencyKey(task, owner) {
	const prefix = owner.flowId ? `flow-terminal:${owner.flowId}` : "task-terminal";
	const outcome = task.status === "succeeded" ? task.terminalOutcome ?? "default" : "default";
	return `${prefix}:${task.taskId}:${task.status}:${outcome}`;
}
function resolveTaskDeliveryOwner(task) {
	if (task.scopeKind !== "session") return {};
	const flowId = task.parentFlowId?.trim();
	const candidate = flowId ? getTaskFlowById(flowId) : void 0;
	const flow = candidate && normalizeOptionalString(candidate.ownerKey) === normalizeOptionalString(task.ownerKey) ? candidate : void 0;
	return {
		sessionKey: task.ownerKey.trim(),
		agentId: resolveTaskSessionAgentId(task.ownerKey, task.requesterAgentId),
		requesterOrigin: normalizeDeliveryContext(flow?.requesterOrigin ?? taskDeliveryStates.get(task.taskId)?.requesterOrigin),
		...flow ? { flowId: flow.flowId } : {}
	};
}
function canDeliverTaskToRequesterOrigin(owner) {
	if (shouldRouteCompletionThroughRequesterSession(owner.sessionKey)) return false;
	return canDeliverToRequesterOrigin(owner.requesterOrigin);
}
function canDeliverToRequesterOrigin(origin) {
	const channel = origin?.channel?.trim();
	const to = origin?.to?.trim();
	return Boolean(channel && to && isDeliverableMessageChannel(channel));
}
function canDeliverParentReviewTaskToThreadOrigin(task, owner) {
	if (!shouldUseParentReviewTaskTerminalMessage(task)) return false;
	const origin = owner.requesterOrigin;
	const threadId = String(origin?.threadId ?? "").trim();
	return Boolean(threadId && channelSupportsThreadDelivery(origin?.channel) && canDeliverToRequesterOrigin(origin));
}
function resolveMissingOwnerDeliveryStatus(task) {
	return task.scopeKind === "system" ? "not_applicable" : "parent_missing";
}
function queueTaskSystemEvent(task, text, owner, source = "background-task") {
	const ownerKey = owner.sessionKey?.trim();
	if (!ownerKey) return false;
	const options = {
		sessionKey: ownerKey,
		contextKey: `task:${task.taskId}${source === "background-task-blocked" ? ":blocked-followup" : ""}`,
		deliveryContext: owner.requesterOrigin
	};
	enqueueSystemEvent(text, owner.agentId ? withSystemEventOwner(options, owner.agentId) : options);
	requestHeartbeat({
		source,
		intent: "immediate",
		reason: source,
		sessionKey: ownerKey,
		agentId: owner.agentId
	});
	return true;
}
function queueBlockedTaskFollowup(task, owner) {
	const followupText = formatTaskBlockedFollowupMessage(task);
	if (!followupText) return false;
	return queueTaskSystemEvent(task, followupText, owner, "background-task-blocked");
}
async function maybeDeliverTaskTerminalUpdate(taskId) {
	return await runTaskDeliveryWithIndependentAdmission(taskId, async () => maybeDeliverTaskTerminalUpdateUnderAdmission(taskId));
}
async function runTaskDeliveryWithIndependentAdmission(taskId, deliver) {
	ensureTaskRegistryReady();
	let admitted = false;
	try {
		return await runWithGatewayIndependentRootWorkContinuation(async () => {
			admitted = true;
			return await deliver();
		}, "tasks:delivery");
	} catch (error) {
		if (!admitted && isGatewayRestartDraining()) {
			ensureTaskRegistryReady();
			const current = tasks.get(taskId);
			return current ? cloneTaskRecord(current) : null;
		}
		throw error;
	}
}
async function maybeDeliverTaskTerminalUpdateUnderAdmission(taskId) {
	ensureTaskRegistryReady();
	const current = tasks.get(taskId);
	if (!current || !shouldAutoDeliverTaskTerminalUpdate(current)) return current ? cloneTaskRecord(current) : null;
	if (tasksWithPendingDelivery.has(taskId)) return cloneTaskRecord(current);
	tasksWithPendingDelivery.add(taskId);
	try {
		const latest = tasks.get(taskId);
		if (!latest || !shouldAutoDeliverTaskTerminalUpdate(latest)) return latest ? cloneTaskRecord(latest) : null;
		const peers = latest.runId ? getPeerTasksForDelivery(latest) : [];
		const isSubagentCancellation = latest.runtime === "subagent" && latest.status === "cancelled";
		const preferred = pickPreferredRunIdTask(isSubagentCancellation ? peers.filter((candidate) => shouldAutoDeliverTaskTerminalUpdate(candidate)) : peers);
		const peerDeliveryCovered = isSubagentCancellation && peers.some((candidate) => candidate.taskId !== latest.taskId && (candidate.deliveryStatus === "delivered" || candidate.deliveryStatus === "session_queued"));
		if (shouldSuppressDuplicateTerminalDelivery({
			task: latest,
			preferredTaskId: preferred?.taskId,
			peerDeliveryCovered
		})) return updateTask(taskId, {
			deliveryStatus: "not_applicable",
			lastEventAt: Date.now()
		});
		const owner = resolveTaskDeliveryOwner(latest);
		const ownerSessionKey = owner.sessionKey?.trim();
		if (!ownerSessionKey) return updateTask(taskId, {
			deliveryStatus: resolveMissingOwnerDeliveryStatus(latest),
			lastEventAt: Date.now()
		});
		const shouldRouteParentReview = shouldUseParentReviewTaskTerminalMessage(latest);
		const shouldDeliverParentReviewDirect = canDeliverParentReviewTaskToThreadOrigin(latest, owner);
		const canDeliverDirect = canDeliverTaskToRequesterOrigin(owner) || shouldDeliverParentReviewDirect;
		const sessionEventText = formatTaskTerminalMessage(latest, shouldRouteParentReview ? { surface: "parent_session" } : void 0);
		if (shouldRouteParentReview && !shouldDeliverParentReviewDirect || !canDeliverDirect) try {
			queueTaskSystemEvent(latest, sessionEventText, owner);
			if (latest.terminalOutcome === "blocked") queueBlockedTaskFollowup(latest, owner);
			return updateTask(taskId, {
				deliveryStatus: shouldRouteParentReview && canDeliverDirect ? "pending" : "session_queued",
				lastEventAt: Date.now()
			});
		} catch (error) {
			taskRegistryLog.warn("Failed to queue background task session delivery", {
				taskId,
				ownerKey: latest.ownerKey,
				error
			});
			return updateTask(taskId, {
				deliveryStatus: "failed",
				lastEventAt: Date.now()
			});
		}
		try {
			const { sendMessage, resolveTaskControlUiSessionUrl } = await loadTaskRegistryDeliveryRuntime();
			const beforeSend = tasks.get(taskId);
			if (!beforeSend || !shouldAutoDeliverTaskTerminalUpdate(beforeSend)) return beforeSend ? cloneTaskRecord(beforeSend) : null;
			const requesterAgentId = owner.agentId;
			const inspectUrl = latest.childSessionKey ? resolveTaskControlUiSessionUrl?.({
				sessionKey: latest.childSessionKey,
				fallbackAgentId: parseAgentSessionKey(latest.childSessionKey)?.agentId ?? requesterAgentId
			}) : void 0;
			const directEventText = shouldDeliverParentReviewDirect ? sessionEventText : formatTaskTerminalMessage(latest);
			const idempotencyKey = resolveTaskTerminalIdempotencyKey(latest, owner);
			const sendResult = await sendMessage({
				channel: owner.requesterOrigin?.channel,
				to: owner.requesterOrigin?.to ?? "",
				accountId: owner.requesterOrigin?.accountId,
				threadId: owner.requesterOrigin?.threadId,
				content: inspectUrl ? `${directEventText}\nInspect: ${inspectUrl}` : directEventText,
				agentId: requesterAgentId,
				idempotencyKey,
				mirror: {
					sessionKey: ownerSessionKey,
					agentId: requesterAgentId,
					idempotencyKey
				}
			});
			const afterSend = tasks.get(taskId);
			if (!afterSend || !shouldAutoDeliverTaskTerminalUpdate(afterSend)) return afterSend ? cloneTaskRecord(afterSend) : null;
			if (sendResult.deliveryStatus === "suppressed") {
				if (sendResult.suppressionReason === "adapter_returned_no_identity") {
					taskRegistryLog.warn("Background task update delivery was not confirmed", {
						taskId,
						ownerKey: ownerSessionKey,
						requesterOrigin: owner.requesterOrigin,
						suppressionReason: sendResult.suppressionReason
					});
					return updateTask(taskId, {
						deliveryStatus: "failed",
						lastEventAt: Date.now()
					});
				}
				throw new Error(`background task update suppressed: ${sendResult.suppressionReason ?? "unknown reason"}`);
			}
			if (afterSend.terminalOutcome === "blocked") queueBlockedTaskFollowup(afterSend, resolveTaskDeliveryOwner(afterSend));
			return updateTask(taskId, {
				deliveryStatus: "delivered",
				lastEventAt: Date.now()
			});
		} catch (error) {
			taskRegistryLog.warn("Failed to deliver background task update", {
				taskId,
				ownerKey: ownerSessionKey,
				requesterOrigin: owner.requesterOrigin,
				error
			});
			const beforeFallback = tasks.get(taskId);
			if (!beforeFallback || !shouldAutoDeliverTaskTerminalUpdate(beforeFallback)) return beforeFallback ? cloneTaskRecord(beforeFallback) : null;
			try {
				const fallbackOwner = resolveTaskDeliveryOwner(beforeFallback);
				queueTaskSystemEvent(beforeFallback, sessionEventText, fallbackOwner);
				if (beforeFallback.terminalOutcome === "blocked") queueBlockedTaskFollowup(beforeFallback, fallbackOwner);
			} catch (fallbackError) {
				taskRegistryLog.warn("Failed to queue background task fallback event", {
					taskId,
					ownerKey: latest.ownerKey,
					error: fallbackError
				});
			}
			return updateTask(taskId, {
				deliveryStatus: "failed",
				lastEventAt: Date.now()
			});
		}
	} finally {
		tasksWithPendingDelivery.delete(taskId);
	}
}
async function maybeDeliverTaskStateChangeUpdate(taskId, latestEvent) {
	return await runTaskDeliveryWithIndependentAdmission(taskId, async () => maybeDeliverTaskStateChangeUpdateUnderAdmission(taskId, latestEvent));
}
async function maybeDeliverTaskStateChangeUpdateUnderAdmission(taskId, latestEvent) {
	ensureTaskRegistryReady();
	const current = tasks.get(taskId);
	if (!current || !shouldAutoDeliverTaskStateChange(current)) return current ? cloneTaskRecord(current) : null;
	const deliveryState = getTaskDeliveryState(taskId);
	if (!latestEvent || (deliveryState?.lastNotifiedEventAt ?? 0) >= latestEvent.at) return cloneTaskRecord(current);
	const eventText = formatTaskStateChangeMessage(current, latestEvent);
	if (!eventText) return cloneTaskRecord(current);
	try {
		const owner = resolveTaskDeliveryOwner(current);
		const ownerSessionKey = owner.sessionKey?.trim();
		if (!ownerSessionKey) return updateTask(taskId, {
			deliveryStatus: resolveMissingOwnerDeliveryStatus(current),
			lastEventAt: Date.now()
		});
		if (!canDeliverTaskToRequesterOrigin(owner)) {
			queueTaskSystemEvent(current, eventText, owner);
			upsertTaskDeliveryState({
				taskId,
				requesterOrigin: deliveryState?.requesterOrigin,
				lastNotifiedEventAt: latestEvent.at
			});
			return updateTask(taskId, { lastEventAt: Date.now() });
		}
		const { sendMessage } = await loadTaskRegistryDeliveryRuntime();
		const requesterAgentId = owner.agentId;
		const idempotencyKey = resolveTaskStateChangeIdempotencyKey({
			task: current,
			latestEvent,
			owner
		});
		const sendResult = await sendMessage({
			channel: owner.requesterOrigin?.channel,
			to: owner.requesterOrigin?.to ?? "",
			accountId: owner.requesterOrigin?.accountId,
			threadId: owner.requesterOrigin?.threadId,
			content: eventText,
			agentId: requesterAgentId,
			idempotencyKey,
			mirror: {
				sessionKey: ownerSessionKey,
				agentId: requesterAgentId,
				idempotencyKey
			}
		});
		if (sendResult.deliveryStatus === "suppressed") {
			if (sendResult.suppressionReason !== "adapter_returned_no_identity") throw new Error(`background task state change suppressed: ${sendResult.suppressionReason ?? "unknown reason"}`);
			taskRegistryLog.warn("Background task state change delivery was not confirmed", {
				taskId,
				ownerKey: current.ownerKey,
				requesterOrigin: owner.requesterOrigin,
				suppressionReason: sendResult.suppressionReason
			});
		}
		upsertTaskDeliveryState({
			taskId,
			requesterOrigin: deliveryState?.requesterOrigin,
			lastNotifiedEventAt: latestEvent.at
		});
		return updateTask(taskId, { lastEventAt: Date.now() });
	} catch (error) {
		taskRegistryLog.warn("Failed to deliver background task state change", {
			taskId,
			ownerKey: current.ownerKey,
			error
		});
		return cloneTaskRecord(current);
	}
}
//#endregion
//#region src/tasks/task-registry-lifecycle.ts
const ACTIVITY_LIVENESS_WRITE_MS = 6e4;
function ensureListener() {
	if (!claimTaskRegistryListenerStart()) return;
	const stop = onAgentEvent((evt) => {
		restoreTaskRegistryOnce();
		const scopedTasks = getTasksByRunScope({
			runId: evt.runId,
			sessionKey: evt.sessionKey
		});
		if (scopedTasks.length === 0) return;
		const now = evt.ts || Date.now();
		for (const current of scopedTasks) {
			if (isTerminalTaskStatus(current.status) || !hasAuthoritativeTaskBacking(current)) continue;
			recordTaskActivityEvent(current, evt);
			const patch = {};
			if (evt.stream === "lifecycle") {
				const phase = typeof evt.data?.phase === "string" ? evt.data.phase : void 0;
				const eventStartedAt = evt.data?.startedAt;
				const startedAt = typeof eventStartedAt === "number" && Number.isFinite(eventStartedAt) ? eventStartedAt : current.startedAt;
				const endedAt = typeof evt.data?.endedAt === "number" ? evt.data.endedAt : void 0;
				if (startedAt !== void 0) patch.startedAt = startedAt;
				if (phase === "start") patch.status = "running";
				else if (phase === "end") {
					const terminal = buildAgentRunTerminalOutcomeFromLifecycleEvent({
						phase,
						data: evt.data,
						startedAt,
						endedAt: endedAt ?? now
					});
					patch.status = mapAgentRunTerminalOutcomeToTaskStatus(terminal);
					patch.endedAt = terminal.endedAt ?? now;
					const error = resolveTaskLifecycleTerminalError({
						runtime: current.runtime,
						status: patch.status,
						terminalReason: terminal.reason,
						error: terminal.error
					});
					if (error) patch.error = error;
				} else if (phase === "error") {
					const terminal = buildAgentRunTerminalOutcomeFromLifecycleEvent({
						phase,
						data: evt.data,
						startedAt,
						endedAt: endedAt ?? now
					});
					patch.status = mapAgentRunTerminalOutcomeToTaskStatus(terminal);
					patch.endedAt = terminal.endedAt ?? now;
					patch.error = resolveTaskLifecycleTerminalError({
						runtime: current.runtime,
						status: patch.status,
						terminalReason: terminal.reason,
						error: terminal.error
					}) ?? current.error;
				}
			} else if (evt.stream === "error") patch.error = typeof evt.data?.error === "string" ? evt.data.error : current.error;
			else if (evt.stream === "tool" && evt.data?.phase === "start") {
				const toolName = typeof evt.data.name === "string" ? evt.data.name.trim() : "";
				if (toolName) {
					patch.toolUseCount = (current.toolUseCount ?? 0) + 1;
					patch.lastToolName = toolName;
				}
			}
			const lastEventAt = current.lastEventAt ?? current.startedAt ?? current.createdAt;
			if (Object.keys(patch).length === 0 && now - lastEventAt < ACTIVITY_LIVENESS_WRITE_MS) continue;
			patch.lastEventAt = now;
			const stateChangeEvent = patch.status && patch.status !== current.status ? appendTaskEvent({
				at: now,
				kind: patch.status,
				summary: patch.status === "failed" ? patch.error ?? current.error : patch.status === "succeeded" ? current.terminalSummary : void 0
			}) : void 0;
			if (updateTask(current.taskId, patch)) {
				maybeDeliverTaskStateChangeUpdate(current.taskId, stateChangeEvent);
				maybeDeliverTaskTerminalUpdate(current.taskId);
			}
		}
	});
	setTaskRegistryListenerStop(stop);
}
setTaskRegistryListenerStarter(ensureListener);
//#endregion
//#region src/tasks/background-exec-task-contract.ts
const BACKGROUND_EXEC_TASK_KIND = "exec";
function isBackgroundExecTask(task) {
	return task.runtime === "cli" && task.taskKind === "exec";
}
//#endregion
//#region src/tasks/cron-task-contract.ts
/** Durable task kind stamped by the current cron task-ledger owner. */
const CRON_TASK_KIND = "automation_run";
//#endregion
//#region src/tasks/harness-owned-subagent-task.ts
function isHarnessOwnedSubagentTask(task) {
	return task.runtime === "subagent" && !task.childSessionKey?.trim() && Boolean(task.taskKind?.trim());
}
//#endregion
//#region src/tasks/task-registry-create-helpers.ts
function findExistingTaskForCreate(params) {
	const runId = params.runId?.trim();
	const runScopeMatches = runId ? getTasksByRunId(runId).filter((task) => {
		if (task.runtime !== params.runtime || task.scopeKind !== params.scopeKind || (normalizeOptionalString(task.ownerKey) ?? "") !== (normalizeOptionalString(params.ownerKey) ?? "") || (normalizeOptionalString(task.childSessionKey) ?? "") !== (normalizeOptionalString(params.childSessionKey) ?? "")) return false;
		if (params.runtime === "acp" && !params.parentFlowId?.trim()) {
			const existingFlowId = task.parentFlowId?.trim();
			return !existingFlowId || getTaskFlowById(existingFlowId)?.syncMode === "task_mirrored";
		}
		return (normalizeOptionalString(task.parentFlowId) ?? "") === (normalizeOptionalString(params.parentFlowId) ?? "");
	}) : [];
	const exact = runId ? runScopeMatches.find((task) => (normalizeOptionalString(task.label) ?? "") === (normalizeOptionalString(params.label) ?? "") && (normalizeOptionalString(task.task) ?? "") === (normalizeOptionalString(params.task) ?? "")) : void 0;
	if (exact) return exact;
	if (!runId || params.runtime !== "acp") return;
	if (runScopeMatches.length === 0) return;
	return pickPreferredRunIdTask(runScopeMatches);
}
function mergeExistingTaskForCreate(existing, params) {
	ensureLinkedTaskFlowRegistryReady(existing);
	const patch = {};
	const requesterOrigin = normalizeDeliveryContext(params.requesterOrigin);
	const currentDeliveryState = taskDeliveryStates.get(existing.taskId);
	if (requesterOrigin && !currentDeliveryState?.requesterOrigin) {
		if (!upsertTaskDeliveryState({
			taskId: existing.taskId,
			requesterOrigin,
			lastNotifiedEventAt: currentDeliveryState?.lastNotifiedEventAt
		}).requesterOrigin) return null;
	}
	if (params.sourceId?.trim() && !existing.sourceId?.trim()) patch.sourceId = params.sourceId.trim();
	if (params.taskKind?.trim() && !existing.taskKind?.trim()) patch.taskKind = params.taskKind.trim();
	if (params.parentFlowId?.trim() && !existing.parentFlowId?.trim()) {
		assertParentFlowLinkAllowed({
			ownerKey: existing.ownerKey,
			scopeKind: existing.scopeKind,
			parentFlowId: params.parentFlowId
		});
		patch.parentFlowId = params.parentFlowId.trim();
	}
	if (params.parentTaskId?.trim() && !existing.parentTaskId?.trim()) patch.parentTaskId = params.parentTaskId.trim();
	if (params.agentId?.trim() && !existing.agentId?.trim()) patch.agentId = params.agentId.trim();
	if (params.requesterAgentId?.trim() && !existing.requesterAgentId?.trim()) patch.requesterAgentId = params.requesterAgentId.trim();
	const nextLabel = params.label?.trim();
	if (params.preferMetadata) {
		if (nextLabel && (normalizeOptionalString(existing.label) ?? "") !== nextLabel) patch.label = nextLabel;
		const nextTask = params.task.trim();
		if (nextTask && (normalizeOptionalString(existing.task) ?? "") !== nextTask) patch.task = nextTask;
	} else if (nextLabel && !existing.label?.trim()) patch.label = nextLabel;
	if (params.deliveryStatus === "pending" && existing.deliveryStatus !== "delivered") patch.deliveryStatus = "pending";
	const notifyPolicy = ensureNotifyPolicy({
		notifyPolicy: params.notifyPolicy,
		deliveryStatus: params.deliveryStatus,
		ownerKey: existing.ownerKey,
		scopeKind: existing.scopeKind
	});
	if (notifyPolicy !== existing.notifyPolicy && existing.notifyPolicy === "silent") patch.notifyPolicy = notifyPolicy;
	if (params.detail !== void 0) patch.detail = params.detail;
	if (Object.keys(patch).length === 0) return cloneTaskRecord(existing);
	return updateTask(existing.taskId, patch);
}
function resolveTaskAgentId(params) {
	return normalizeOptionalString(params.explicitAgentId) ?? parseAgentSessionKey(params.childSessionKey)?.agentId ?? parseAgentSessionKey(params.ownerKey)?.agentId ?? parseAgentSessionKey(params.requesterSessionKey)?.agentId;
}
function resolveTaskRequesterAgentId(params) {
	const explicitRequesterAgentId = normalizeOptionalString(params.explicitRequesterAgentId);
	return (explicitRequesterAgentId ? normalizeAgentId(explicitRequesterAgentId) : void 0) ?? parseAgentSessionKey(params.ownerKey)?.agentId ?? parseAgentSessionKey(params.requesterSessionKey)?.agentId;
}
//#endregion
//#region src/tasks/task-registry-record-api.ts
function setTaskCleanupAfterById(params) {
	ensureTaskRegistryReady();
	return updateTask(params.taskId, { cleanupAfter: params.cleanupAfter });
}
function markTaskTerminalById(params) {
	ensureTaskRegistryReady();
	const patch = {
		status: params.status,
		...params.childSessionKey !== void 0 ? { childSessionKey: params.childSessionKey?.trim() || void 0 } : {},
		endedAt: params.endedAt,
		lastEventAt: params.lastEventAt ?? params.endedAt,
		...params.terminalSummary !== void 0 ? { terminalSummary: params.preserveTerminalSummary ? params.terminalSummary ?? void 0 : normalizeTaskSummary(params.terminalSummary) } : {},
		...params.terminalOutcome !== void 0 ? { terminalOutcome: resolveTaskTerminalOutcome({
			status: params.status,
			terminalOutcome: params.terminalOutcome
		}) } : {},
		...params.detail !== void 0 ? { detail: structuredClone(params.detail) } : {}
	};
	if (Object.hasOwn(params, "error")) patch.error = params.error;
	return updateTask(params.taskId, patch);
}
function markTaskLostById(params) {
	ensureTaskRegistryReady();
	return updateTask(params.taskId, {
		status: "lost",
		endedAt: params.endedAt,
		lastEventAt: params.lastEventAt ?? params.endedAt,
		...params.error !== void 0 ? { error: params.error } : {},
		...params.cleanupAfter !== void 0 ? { cleanupAfter: params.cleanupAfter } : {}
	});
}
function updateTasksByRunId(params) {
	const matches = getTasksByRunScope(params);
	if (matches.length === 0) return [];
	const updated = [];
	for (const match of matches) {
		if (!hasAuthoritativeTaskBacking(match)) continue;
		const task = updateTask(match.taskId, params.patch);
		if (task) updated.push(task);
	}
	return updated;
}
function createTaskRecord(params) {
	ensureTaskRegistryReady();
	const requesterSessionKey = resolveTaskRequesterSessionKey(params);
	const scopeKind = resolveTaskScopeKind({
		scopeKind: params.scopeKind,
		requesterSessionKey
	});
	const ownerKey = resolveTaskOwnerKey({
		requesterSessionKey,
		ownerKey: params.ownerKey
	});
	const agentId = resolveTaskAgentId({
		explicitAgentId: params.agentId,
		childSessionKey: params.childSessionKey,
		ownerKey,
		requesterSessionKey
	});
	const requesterAgentId = resolveTaskRequesterAgentId({
		explicitRequesterAgentId: params.requesterAgentId,
		ownerKey,
		requesterSessionKey
	});
	assertTaskOwner({
		ownerKey,
		scopeKind
	});
	assertParentFlowLinkAllowed({
		ownerKey,
		scopeKind,
		parentFlowId: params.parentFlowId
	});
	const existing = findExistingTaskForCreate({
		runtime: params.runtime,
		ownerKey,
		scopeKind,
		childSessionKey: params.childSessionKey,
		parentFlowId: params.parentFlowId,
		runId: params.runId,
		label: params.label,
		task: params.task
	});
	if (existing) return mergeExistingTaskForCreate(existing, {
		...params,
		agentId
	});
	const now = Date.now();
	const taskId = crypto.randomUUID();
	const status = normalizeTaskStatus(params.status);
	const deliveryStatus = params.deliveryStatus ?? ensureDeliveryStatus({
		ownerKey,
		scopeKind
	});
	const notifyPolicy = ensureNotifyPolicy({
		notifyPolicy: params.notifyPolicy,
		deliveryStatus,
		ownerKey,
		scopeKind
	});
	const lastEventAt = params.lastEventAt ?? params.startedAt ?? now;
	const record = normalizeTaskTimestamps({
		taskId,
		runtime: params.runtime,
		taskKind: normalizeOptionalString(params.taskKind),
		sourceId: normalizeOptionalString(params.sourceId),
		requesterSessionKey,
		ownerKey,
		scopeKind,
		childSessionKey: params.childSessionKey,
		parentFlowId: normalizeOptionalString(params.parentFlowId),
		parentTaskId: normalizeOptionalString(params.parentTaskId),
		agentId,
		requesterAgentId,
		runId: normalizeOptionalString(params.runId),
		label: normalizeOptionalString(params.label),
		task: params.task,
		status,
		deliveryStatus,
		notifyPolicy,
		createdAt: now,
		startedAt: params.startedAt,
		lastEventAt,
		cleanupAfter: params.cleanupAfter,
		progressSummary: normalizeTaskSummary(params.progressSummary),
		terminalSummary: normalizeTaskSummary(params.terminalSummary),
		terminalOutcome: resolveTaskTerminalOutcome({
			status,
			terminalOutcome: params.terminalOutcome
		}),
		...params.detail !== void 0 ? { detail: structuredClone(params.detail) } : {}
	});
	if (isTerminalTaskStatus(record.status) && typeof record.cleanupAfter !== "number") record.cleanupAfter = resolveTaskCleanupAfter(record);
	const requesterOrigin = normalizeDeliveryContext(params.requesterOrigin);
	const deliveryState = requesterOrigin ? {
		taskId,
		requesterOrigin
	} : void 0;
	if (!tryPersistTaskUpsert(record, "create", deliveryState)) return null;
	tasks.set(taskId, record);
	bumpTaskRegistryRevision();
	if (requesterOrigin) taskDeliveryStates.set(taskId, deliveryState);
	addRunIdIndex(taskId, record.runId);
	addOwnerKeyIndex(taskId, record);
	addParentFlowIdIndex(taskId, record);
	addRelatedSessionKeyIndex(taskId, record);
	syncFlowFromTaskAfterTaskMutation(record, "create");
	emitTaskRegistryObserverEvent(() => ({
		kind: "upserted",
		task: cloneTaskRecord(record)
	}));
	if (isTerminalTaskStatus(record.status)) maybeDeliverTaskTerminalUpdate(taskId);
	return cloneTaskRecord(record);
}
function updateTaskStateByRunId(params) {
	ensureTaskRegistryReady();
	const matches = getTasksByRunScope(params);
	if (matches.length === 0) return [];
	const updated = [];
	for (const current of matches) {
		if (!hasAuthoritativeTaskBacking(current)) continue;
		const patch = {};
		const nextStatus = params.status ? normalizeTaskStatus(params.status) : current.status;
		if (params.status && !shouldApplyRunScopedStatusUpdate({
			currentStatus: current.status,
			currentRuntime: current.runtime,
			currentChildSessionKey: current.childSessionKey,
			currentError: current.error,
			currentEndedAt: current.endedAt,
			nextStatus,
			nextError: params.error,
			nextEndedAt: params.endedAt
		})) continue;
		const eventAt = params.lastEventAt ?? params.endedAt ?? Date.now();
		if (params.status) patch.status = normalizeTaskStatus(params.status);
		if (params.startedAt != null) patch.startedAt = params.startedAt;
		if (params.endedAt != null) patch.endedAt = params.endedAt;
		if (params.lastEventAt != null) patch.lastEventAt = params.lastEventAt;
		if (params.childSessionKey !== void 0) patch.childSessionKey = params.childSessionKey?.trim() || void 0;
		if (params.clearError) patch.error = void 0;
		else if (current.status === "cancelled" && nextStatus !== "cancelled" && params.error === void 0) patch.error = void 0;
		else if (params.error !== void 0) patch.error = params.error;
		if (params.progressSummary !== void 0) patch.progressSummary = normalizeTaskSummary(params.progressSummary);
		if (params.terminalSummary !== void 0) patch.terminalSummary = params.preserveTerminalSummary ? params.terminalSummary ?? void 0 : normalizeTaskSummary(params.terminalSummary);
		if (params.terminalOutcome !== void 0) patch.terminalOutcome = resolveTaskTerminalOutcome({
			status: nextStatus,
			terminalOutcome: params.terminalOutcome
		});
		if (params.detail !== void 0) patch.detail = params.detail;
		if (params.suppressDelivery) patch.deliveryStatus = "not_applicable";
		const eventSummary = normalizeTaskSummary(params.eventSummary) ?? (nextStatus === "failed" ? normalizeTaskSummary(params.error ?? current.error) : nextStatus === "succeeded" ? normalizeTaskSummary(params.terminalSummary ?? current.terminalSummary) : void 0);
		const nextEvent = params.status && params.status !== current.status || Boolean(normalizeTaskSummary(params.eventSummary)) ? appendTaskEvent({
			at: eventAt,
			kind: params.status && normalizeTaskStatus(params.status) !== current.status ? normalizeTaskStatus(params.status) : "progress",
			summary: eventSummary
		}) : void 0;
		const task = updateTask(current.taskId, patch);
		if (task) {
			updated.push(task);
			if (!params.suppressDelivery) {
				maybeDeliverTaskStateChangeUpdate(task.taskId, nextEvent);
				maybeDeliverTaskTerminalUpdate(task.taskId);
			}
		}
	}
	return updated;
}
function updateTaskDeliveryByRunId(params) {
	ensureTaskRegistryReady();
	const patch = { deliveryStatus: params.deliveryStatus };
	if (params.error !== void 0) patch.error = params.error;
	return updateTasksByRunId({
		runId: params.runId,
		runtime: params.runtime,
		sessionKey: params.sessionKey,
		patch
	});
}
function markTaskRunningByRunId(params) {
	return updateTaskStateByRunId({
		runId: params.runId,
		runtime: params.runtime,
		sessionKey: params.sessionKey,
		status: "running",
		startedAt: params.startedAt,
		lastEventAt: params.lastEventAt,
		progressSummary: params.progressSummary,
		eventSummary: params.eventSummary
	});
}
function recordTaskProgressByRunId(params) {
	return updateTaskStateByRunId({
		runId: params.runId,
		runtime: params.runtime,
		sessionKey: params.sessionKey,
		childSessionKey: params.childSessionKey,
		lastEventAt: params.lastEventAt,
		progressSummary: params.progressSummary,
		eventSummary: params.eventSummary
	});
}
function finalizeTaskRecordByRunId(params) {
	return updateTaskStateByRunId({
		runId: params.runId,
		runtime: params.runtime,
		sessionKey: params.sessionKey,
		childSessionKey: params.childSessionKey,
		status: params.status,
		startedAt: params.startedAt,
		endedAt: params.endedAt,
		lastEventAt: params.lastEventAt,
		error: params.error,
		clearError: params.clearError,
		progressSummary: params.progressSummary,
		terminalSummary: params.terminalSummary,
		preserveTerminalSummary: params.preserveTerminalSummary,
		terminalOutcome: params.terminalOutcome,
		detail: params.detail,
		suppressDelivery: params.suppressDelivery
	});
}
function setTaskRunDeliveryStatusByRunId(params) {
	return updateTaskDeliveryByRunId(params);
}
function updateTaskNotifyPolicyById(params) {
	const notifyPolicy = parseTaskNotifyPolicy(params.notifyPolicy);
	ensureTaskRegistryReady();
	return updateTask(params.taskId, {
		notifyPolicy,
		lastEventAt: Date.now()
	});
}
function linkTaskToFlowById(params) {
	ensureTaskRegistryReady();
	const flowId = params.flowId.trim();
	if (!flowId) return null;
	const current = tasks.get(params.taskId);
	if (!current) return null;
	if (current.parentFlowId?.trim()) return cloneTaskRecord(current);
	assertParentFlowLinkAllowed({
		ownerKey: current.ownerKey,
		scopeKind: current.scopeKind,
		parentFlowId: flowId
	});
	return updateTask(params.taskId, { parentFlowId: flowId });
}
//#endregion
//#region src/tasks/task-registry-cancel.ts
function ensureTaskCancellationReady(task) {
	const runId = task.runId?.trim();
	const linkedTasks = runId && (task.runtime === "acp" || task.runtime === "subagent") ? getTasksByRunScope({
		runId,
		runtime: task.runtime,
		sessionKey: task.childSessionKey
	}) : [task];
	for (const linkedTask of linkedTasks.length > 0 ? linkedTasks : [task]) ensureLinkedTaskFlowRegistryReady(linkedTask);
}
async function cancelTaskById(params) {
	ensureTaskRegistryReady();
	const task = tasks.get(params.taskId.trim());
	if (!task) return {
		found: false,
		cancelled: false,
		reason: "Task not found."
	};
	const notCancelled = (reason) => {
		const current = tasks.get(task.taskId);
		return {
			found: true,
			cancelled: false,
			reason,
			...current ? { task: cloneTaskRecord(current) } : {}
		};
	};
	const requestedReason = params.reason?.trim();
	const cancellationError = requestedReason && requestedReason !== "Subagent run killed." ? requestedReason : "Cancelled by operator.";
	let isProvisionalSubagentKill = task.runtime === "subagent" && task.status === "cancelled" && task.error === "Subagent run killed.";
	if (!isProvisionalSubagentKill && (task.status === "succeeded" || task.status === "failed" || task.status === "timed_out" || task.status === "lost" || task.status === "cancelled")) return notCancelled("Task is already terminal.");
	const childSessionKey = task.childSessionKey?.trim();
	const promoteCancellation = () => {
		const eventAt = Date.now();
		const current = tasks.get(task.taskId) ?? task;
		const endedAt = isProvisionalSubagentKill ? current.endedAt ?? eventAt : eventAt;
		const updated = (task.runtime === "acp" || task.runtime === "subagent") && task.runId?.trim() ? updateTaskStateByRunId({
			runId: task.runId,
			runtime: task.runtime,
			sessionKey: childSessionKey,
			status: "cancelled",
			endedAt,
			lastEventAt: eventAt,
			error: cancellationError
		}).find((record) => record.taskId === task.taskId) ?? null : updateTask(task.taskId, {
			status: "cancelled",
			endedAt,
			lastEventAt: eventAt,
			error: cancellationError
		});
		if (!updated) return notCancelled("Task persistence failed.");
		maybeDeliverTaskTerminalUpdate(updated.taskId);
		return {
			found: true,
			cancelled: true,
			task: updated
		};
	};
	try {
		if (!hasAuthoritativeTaskBacking(task)) return notCancelled("Task backing ownership could not be verified.");
		const managedBacking = getManagedTaskBackingInstance(task);
		ensureTaskCancellationReady(task);
		if (isBackgroundExecTask(task)) {
			const processSessionId = task.sourceId?.trim();
			const { cancelBackgroundExecSession } = await loadTaskRegistryControlRuntime();
			if (!processSessionId || !cancelBackgroundExecSession?.(processSessionId)) return notCancelled("Background command has no active cancellation handle.");
		} else if (task.runtime !== "cli") {
			if (task.runtime === "cron") {
				const { cancelActiveCronTaskRun } = await loadTaskRegistryControlRuntime();
				if (!cancelActiveCronTaskRun({
					runId: task.runId,
					reason: params.reason?.trim() || "Cancelled by operator."
				})) {
					if (task.taskKind === "automation_run" || childSessionKey) return notCancelled("Cron task has no active cancellation handle.");
				}
			} else if (!childSessionKey) {
				if (!isHarnessOwnedSubagentTask(task)) return notCancelled("Task has no cancellable child session.");
			}
			if (task.runtime === "cron") {} else if (!childSessionKey) {} else if (task.runtime === "acp") {
				const { getAcpSessionManager } = await loadTaskRegistryControlRuntime();
				await getAcpSessionManager().cancelSession({
					cfg: params.cfg,
					sessionKey: childSessionKey,
					agentId: task.agentId,
					reason: params.reason?.trim() || "task-cancel",
					expectedRunId: task.runId,
					...managedBacking?.runtime === "acp" ? {
						expectedInstanceId: managedBacking.instanceId,
						expectedOwnerKey: task.ownerKey
					} : {}
				});
			} else if (task.runtime === "subagent") {
				const { killSubagentRunAdmin } = await loadTaskRegistryControlRuntime();
				const reconcile = (result) => {
					const current = tasks.get(task.taskId);
					if (current?.status === "cancelled" && current.error === "Subagent run killed.") isProvisionalSubagentKill = true;
					let reason;
					if (current?.status === "succeeded") reason = "Subagent completed while cancellation was in progress.";
					else if (current && isTerminalTaskStatus(current.status) && current.status !== "cancelled") reason = `Subagent became ${current.status} while cancellation was in progress.`;
					else if (current?.status === "cancelled" && !isProvisionalSubagentKill) reason = "Subagent was cancelled while cancellation was in progress.";
					else if (result.found && result.targetState?.state === "terminal") {
						if (!finalizeTaskRecordByRunId({
							runId: task.runId?.trim() || result.runId,
							runtime: "subagent",
							sessionKey: childSessionKey,
							...result.targetState.task
						}).find((candidate) => candidate.taskId === task.taskId)) reason = "Subagent became terminal, but task state reconciliation failed to persist.";
						else if (result.targetState.task.status === "cancelled" && result.targetState.task.error === "Subagent run killed.") isProvisionalSubagentKill = true;
						else reason = result.targetState.task.status === "succeeded" ? "Subagent completed while cancellation was in progress." : `Subagent became ${result.targetState.task.status} while cancellation was in progress.`;
					}
					if (result.found && result.error) reason = `${reason ? `${reason} ` : ""}Subagent cancellation incomplete: ${result.error}`;
					if (reason) return notCancelled(reason);
					if (result.found && result.targetState?.state === "finalizing") return notCancelled("Subagent completion is still being finalized.");
					if (!result.found || !result.killed && !isProvisionalSubagentKill) return notCancelled(result.found ? "Subagent was not running." : "Subagent task not found.");
					return promoteCancellation();
				};
				let cancellation = notCancelled("Subagent cancellation result was not published.");
				await killSubagentRunAdmin({
					cfg: params.cfg,
					sessionKey: childSessionKey,
					expectedRunId: task.runId,
					...managedBacking?.runtime === "subagent" ? {
						expectedGeneration: managedBacking.generation,
						expectedOwnerKey: task.ownerKey
					} : {},
					onResult: (result) => {
						cancellation = reconcile(result);
					}
				});
				return cancellation;
			} else return notCancelled("Task runtime does not support cancellation yet.");
		}
		return promoteCancellation();
	} catch (error) {
		return notCancelled(formatErrorMessage(error));
	}
}
function assertTaskCancellationReadyById(taskId) {
	ensureTaskRegistryReady();
	const task = tasks.get(taskId.trim());
	if (!task) return null;
	if (!isTerminalTaskStatus(task.status) || isProvisionalSubagentKillTask(task)) ensureTaskCancellationReady(task);
	return cloneTaskRecord(task);
}
//#endregion
//#region src/tasks/task-registry.ts
if (process.env.VITEST || false) globalThis[Symbol.for("openclaw.taskRegistryTestApi")] = {
	maybeDeliverTaskStateChangeUpdate,
	resetTaskRegistryControlRuntimeForTests,
	resetTaskRegistryDeliveryRuntimeForTests,
	resetTaskRegistryForTests,
	setTaskRegistryControlRuntimeForTests,
	setTaskRegistryDeliveryRuntimeForTests
};
//#endregion
export { getTaskFlowRegistryRestoreFailure as $, listTasksForOwnerKey as A, createNextAcpTaskBackingDetail as B, hasActiveTaskForChildSessionKey as C, listTaskRecordsUnsorted as D, listTaskRecords as E, isTaskFlowCancellationPending as F, createTaskFlowForTask as G, hasAuthoritativeTaskBacking as H, completionRequiresMessageToolDelivery as I, failFlow as J, deleteTaskFlowRecordById as K, resolveDurableCompletionDeliveryMode as L, resolveTaskForLookupToken as M, resolveTaskSessionAgentId as N, listTasksForAgentId as O, isProvisionalSubagentKillTask as P, getTaskFlowById as Q, isParentFlowLinkError as R, getTaskById as S, listTaskRecordPage as T, resolveManagedTaskBackingDetail as U, createSubagentTaskBackingDetail as V, createManagedTaskFlow as W, findTaskFlowForOwnerLookup as X, findLatestTaskFlowForOwnerKey as Y, finishFlow as Z, maybeDeliverTaskTerminalUpdate as _, linkTaskToFlowById as a, resumeFlow as at, deleteTaskRecordById as b, markTaskTerminalById as c, setTaskRunDeliveryStatusByRunId as d, listTaskFlowRecords as et, updateTaskNotifyPolicyById as f, isBackgroundExecTask as g, BACKGROUND_EXEC_TASK_KIND as h, finalizeTaskRecordByRunId as i, resolveTaskFlowForLookupToken as it, listTasksForRelatedSessionKey as j, listTasksForFlowId as k, recordTaskProgressByRunId as l, CRON_TASK_KIND as m, cancelTaskById as n, reloadTaskFlowRegistryFromStore as nt, markTaskLostById as o, setFlowWaiting as ot, isHarnessOwnedSubagentTask as p, ensureTaskFlowRegistryReady as q, createTaskRecord as r, requestFlowCancel as rt, markTaskRunningByRunId as s, updateFlowRecordByIdExpectedRevision as st, assertTaskCancellationReadyById as t, listTaskFlowsForOwnerKey as tt, setTaskCleanupAfterById as u, publishTaskRecordAfterAtomicStore as v, listFreshTasksForOwnerKey as w, findTaskByRunId as x, updateTask as y, mapAgentRunTerminalOutcomeToTaskStatus as z };
