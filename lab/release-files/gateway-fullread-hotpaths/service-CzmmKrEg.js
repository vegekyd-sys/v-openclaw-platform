import { h as finiteSecondsToTimerSafeMilliseconds, o as asDateTimestampMs } from "./number-coercion-CLj0HTDM.js";
import { l as normalizeOptionalString, o as normalizeLowercaseStringOrEmpty } from "./string-coerce-CIXf7egm.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { t as parseDurationMs } from "./parse-duration-CuuCHKpt.js";
import { o as resolveOpenClawStateSqlitePath } from "./openclaw-state-db.paths-Dwj4ZWNN.js";
import { At as cronTaskRecordToScriptRunResult, Dt as cronRunStatusToTaskStatus, Et as cronRunLogEntryToTaskDetail, Ft as resolveCronTaskRecordTimestamp, Kt as resolveAdmittedCronCompletionStatus, Ot as cronTaskRecordStoreKey, Tt as cronQuietTriggerTaskDetail, jt as cronTaskRecordToTriggerEval, kt as cronTaskRecordToRunLogEntry, qt as resolveCronCompletionStatus, s as runOpenClawStateWriteTransaction } from "./openclaw-state-db-Bh3Bq87y.js";
import { m as resolveAgentWorkspaceDir, o as listAgentIds } from "./agent-scope-config-CUiGBd59.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { C as isCronRunSessionKey, O as parseAgentSessionKey, d as normalizeOptionalAgentId, f as resolveAgentIdFromSessionKey } from "./session-key-CRjxKW0X.js";
import "./agent-scope-CSlN0kZb.js";
import { r as beginGatewayRootWorkAdmissionWhenOpen, t as GatewayDrainingError, x as runWithGatewayIndependentRootWorkContinuation, y as runOutsideGatewayRootWorkAdmission } from "./gateway-work-admission-3tn4Qiws.js";
import { n as deliveryContextFromSession } from "./delivery-context.shared-DlcU69m_.js";
import { c as isRetryableHeartbeatSkipReason, t as HEARTBEAT_IDLE_RETRY_GRACE_MS } from "./heartbeat-wake-c_7_7clI.js";
import { t as canonicalizePath } from "./paths-CIwQeLl6.js";
import { f as loadSessionEntryReadOnly, loadExactSessionEntriesReadOnly, o as listSessionEntryKeysReadOnly, u as loadExactSessionEntryReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { s as resolveMaintenanceConfig } from "./disk-budget-BzLS0kmH.js";
import { It as applySessionEntryLifecycleMutation } from "./session-accessor-K0XuW6ln.js";
import { t as listSessionEntriesCore } from "./session-accessor.entry-B8arwR7t.js";
import { i as isRetainedExecutionOwnerBinding, n as createExecutionStartedOwnerBinding } from "./execution-owner-binding-BlIkuQuA.js";
import { n as bindTaskRunExecution, s as listTaskRecordsByRuntimeSourceIdInDatabase } from "./task-registry.store.sqlite-paxOzi9K.js";
import { t as bindTaskFlowExecution } from "./task-flow-registry.store.sqlite-x5EfDgmc.js";
import { m as CRON_TASK_KIND } from "./task-registry-B4-CJZk7.js";
import { c as finalizeTaskRunById, f as recordTaskRunProgressByRunIdCore, l as finalizeTaskRunByRunIdCore, o as createRunningTaskRunCore, u as findTaskByRunId } from "./task-executor-DR3AwKDz.js";
import { t as buildPendingGeneratedMediaSessionKeySet } from "./task-status-access-BL-VaEOd.js";
import { l as noteCronJobsStoreCommit, u as removeStaleCronJobFamilyRows } from "./store-vWBHfJUH.js";
import { t as cronStoreKey } from "./key-BBZ40bDq.js";
import { a as loadedCronStoreFromRows, d as upsertCronJobRow, i as loadCronRows, m as tryCronScheduleIdentity, n as deleteCronJobRowInDatabase, p as cronSchedulingInputsEqual } from "./row-codec-CSqjzVm_.js";
import { c as cronStreamScheduleKey, n as resolvePacedNextRunAtMs, o as appendCronPayloadText, s as createCronStreamSourceIdentity } from "./pacing-DTlKwJhL.js";
import "./normalize-XGZhdNGB.js";
import { c as resolveCronToolsAllowExecTargetRecoveryError } from "./scheduled-tool-policy-WcH3cpLk.js";
import { t as parseAbsoluteTimeMs } from "./parse-tlCSjrTr.js";
import { t as isSystemOwnedCronPayloadKind } from "./types-DQrueG6d.js";
import { t as assertCronJobStateTimestamps } from "./persisted-shape-BvaoExR0.js";
import { d as noteActiveCronJobRemoval, f as noteActiveCronJobScheduleMutation, h as requestActiveCronJobCancellation, l as markCronJobActive, m as onCronJobInactive, n as clearCronJobActive, o as isCronActiveJobMarkerCurrent, p as noteActiveCronJobTriggerMutation, s as isCronJobActive, u as markCronJobWaitingForHeartbeat } from "./active-jobs-BKloUR4E.js";
import { i as registerActiveCronTaskRun, o as trackActiveCronTaskRunSettlement } from "./active-run-cancellation-st3bUr95.js";
import { r as enqueueCommandInLane } from "./command-queue-oRD7ZANz.js";
import { l as resolveFailoverReasonFromError } from "./failover-error-B46Ke6VT.js";
import { t as resolveSkillWorkshopConfig } from "./config-Cjp42tXL.js";
import { n as AgentDeletionCommitUncertainError, t as AgentDeletionAuthorityRollbackError } from "./agent-lifecycle-registry-Bhx8Gpp7.js";
import { t as resolveCronAgentSessionKey } from "./session-key-U_mu0r_L.js";
import { a as preExecutionTimeoutErrorMessage, c as timeoutErrorMessage, i as normalizeCronRunErrorText, r as isSetupTimeoutErrorText, s as setupTimeoutErrorMessage, t as abortErrorMessage } from "./execution-errors-CdfjHusX.js";
import { t as materializeLegacyDefaultCronJobOwners } from "./legacy-default-agent-owner-migration-5tNNr77j.js";
import { n as resolveCronDeliveryPlan } from "./delivery-plan-BVGDwgsx.js";
import { A as CronRunReceiptConflictError, B as finishCronRunReceipt, C as summarizeCronJobSchedule, D as enqueueCronSystemEvent, F as assertCronRunReceiptCurrentInDatabase, G as listActiveCronRunReceiptJobIdsInDatabase, H as inspectActiveCronRunReceipt, I as assertCronRunReceiptOwnedInDatabase, J as releaseLocalCronRunReceiptOwnership, K as prepareCronRunReceiptAdjudication, L as bindCronRunReceiptExecution, M as activateCronRunReceiptInDatabase, N as adjudicateActiveCronRunReceiptInDatabase, O as requestCronHeartbeat, P as assertCronRunReceiptCurrent, R as claimCronRunReceiptInDatabase, S as resolveJobPayloadTextForMain, T as maybeAutoDisableCronJobAfterRunFailure, U as isCronRunReceiptOwnerStale, V as finishCronRunReceiptInDatabase, W as isCronRunReceiptSettlementPending, Y as trackCronRunReceiptSettlement, _ as recomputeSingleJobForMaintenance, a as findJobOrThrow, b as resolveJobErrorBackoffUntilMs, c as isJobDue, d as needsCronTimerMaintenance, f as nextWakeAtMs, g as recomputeNextRunsForMaintenance, i as errorBackoffMs, j as CronRunReceiptRevisionError, k as wake, l as isJobEnabled, m as recomputeJobNextRunAtMs, n as computeJobNextRunAtMs, o as hasActiveCronRun, q as prepareCronRunReceiptClaim, r as computeJobPreviousRunAtOrBeforeMs, s as hasScheduledNextRunAtMs, t as DEFAULT_ERROR_BACKOFF_SCHEDULE_MS, u as isStaleFutureCronSlot, v as recordScheduleComputeError, w as autoDisableCronJob, x as resolveJobLastRunStatus, z as findActiveCronRunReceiptInDatabase } from "./jobs-scheduling-BcxEr6o2.js";
import { A as getPendingCronSessionCleanup, C as createCronServiceState, E as isImmediateCronRunMode, M as registerPendingCronSessionCleanup, O as assertSupportedJobSpec, S as warnIfDisabled, T as emit, _ as persistOrRestore, a as reconcileRuntimeAuthority, b as runPostPersistCronNotifications, d as maybeEmitFailureAlert, f as resolveFailureAlert, g as persist, h as ensureLoaded, i as createJob, j as locked, k as cronPatchTouchesDeliveryResolution, l as failureNotificationDeliveryFromJobState, m as commitCronRuntimeRows, n as applyDeclarativeJobSpec, p as applyCronRuntimeRowsToState, r as applyJobPatch, s as normalizeCronTaskRunJobId, t as resolveCronListSnapshotRevision, u as finalizeCronFailureNotifications, v as pruneCronJobScratchAfterCommit, w as cronFailureNotificationEventContext, x as snapshotStoreForRollback, y as publishCronRuntimeRows } from "./list-snapshot-revision-B919xtbt.js";
import { o as writeCronJobScratch, r as readCronJobScratchState } from "./scratch-store-D7R5-K1V.js";
import { t as resolveCronJobConfigRevision } from "./config-revision-B_P6W-B9.js";
import { t as computeNextRunAtMs } from "./schedule-rjP0_0it.js";
import { n as resolveCronTriggerMinIntervalMs } from "./cron-limits-txevLFpr.js";
import { a as normalizeCronRunDiagnostics, n as createCronRunDiagnosticsFromError, o as summarizeCronRunDiagnostics } from "./run-diagnostics-fB-3R961.js";
import { n as resolveCronJobEffectiveAgentId, t as CRON_AGENT_SELECTION_REQUIRED_MESSAGE } from "./agent-id-KnPjqPdM.js";
import { t as createCronExecutionId } from "./run-id-kGde0n7U.js";
import { r as isHeartbeatTaskCronJob, t as HEARTBEAT_TASK_DECLARATION_PREFIX } from "./heartbeat-task-ByPo-qx_.js";
import { o as resolveHeartbeatPhaseMs, s as resolveHeartbeatSchedulerSeed } from "./heartbeat-runner-B05TJenq.js";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import pMap, { pMapSkip } from "p-map";
//#region src/cron/service/foreign-receipt-monitor.ts
const CRON_FOREIGN_RECEIPT_RECHECK_MS = 2e3;
const monitors = /* @__PURE__ */ new WeakMap();
function monitor(state) {
	let current = monitors.get(state);
	if (!current) {
		current = {
			byJobId: /* @__PURE__ */ new Map(),
			timer: null
		};
		monitors.set(state, current);
	}
	return current;
}
function arm(state) {
	const current = monitor(state);
	const reconcile = current.reconcile;
	if (state.stopped || current.timer || current.byJobId.size === 0 || !reconcile) return;
	current.timer = setTimeout(() => {
		current.timer = null;
		reconcile().catch((error) => {
			state.deps.log.warn({ err: String(error) }, "cron: foreign receipt reconciliation failed");
		}).finally(() => arm(state));
	}, CRON_FOREIGN_RECEIPT_RECHECK_MS);
	current.timer.unref?.();
}
function configureForeignReceiptMonitor(state, reconcile) {
	monitor(state).reconcile = reconcile;
	arm(state);
}
function enrollForeignReceipt(state, receipt) {
	monitor(state).byJobId.set(receipt.jobId, receipt);
	arm(state);
}
function listForeignReceipts(state) {
	return [...monitor(state).byJobId.values()].toSorted((left, right) => left.jobId.localeCompare(right.jobId));
}
function removeForeignReceipt(state, jobId) {
	monitor(state).byJobId.delete(jobId);
}
function stopForeignReceiptMonitor(state) {
	const current = monitor(state);
	if (current.timer) {
		clearTimeout(current.timer);
		current.timer = null;
	}
	current.byJobId.clear();
	current.reconcile = void 0;
}
function resumeForeignReceiptMonitor(state) {
	arm(state);
}
//#endregion
//#region src/cron/service/run-receipts.ts
function currentDefaultAgentId(state) {
	return state.deps.resolveDefaultAgentId?.() ?? state.deps.defaultAgentId;
}
function resolveCronRunReceiptAgentId(state, job) {
	return resolveCronJobEffectiveAgentId(job, currentDefaultAgentId(state));
}
function resolveAgentId(state) {
	return (job) => resolveCronRunReceiptAgentId(state, job);
}
function prepareServiceCronRunReceiptClaim(params) {
	return prepareCronRunReceiptClaim({
		storePath: params.state.deps.storePath,
		job: params.job,
		agentId: resolveCronRunReceiptAgentId(params.state, params.job),
		startedAtMs: params.startedAtMs,
		requestRunId: params.requestRunId
	});
}
function claimServiceCronRunReceiptInDatabase(state, database, prepared) {
	return claimCronRunReceiptInDatabase({
		database,
		prepared,
		resolveAgentId: resolveAgentId(state)
	});
}
function activateServiceCronRunReceiptInDatabase(state, database, handle, startedAtMs) {
	return activateCronRunReceiptInDatabase({
		database,
		handle,
		startedAtMs,
		resolveAgentId: resolveAgentId(state)
	});
}
function cronRunReceiptOwnerMutationHooks(params) {
	const prepared = prepareCronRunReceiptAdjudication({
		storePath: params.state.deps.storePath,
		jobId: params.jobId,
		nowMs: params.state.deps.nowMs()
	});
	return { beforeWrite: (database) => {
		adjudicateActiveCronRunReceiptInDatabase({
			database,
			jobId: params.jobId,
			prepared,
			finishedAtMs: params.state.deps.nowMs()
		});
	} };
}
function assertServiceCronRunReceiptCurrent(state, handle) {
	assertCronRunReceiptCurrent({
		handle,
		resolveAgentId: resolveAgentId(state),
		isAgentAvailable: state.deps.isAgentAvailable
	});
}
function resolveCronRunReceiptTerminalStatus(status, triggerFired) {
	if (status === "ok") return triggerFired === false ? "skipped" : "ok";
	return status === "skipped" ? "skipped" : "error";
}
function logReceiptFinishError(state, handle, error) {
	state.deps.log.warn({
		jobId: handle.jobId,
		err: String(error)
	}, "cron: failed to finalize run receipt after execution settlement");
}
function finishReceiptAfterCommit(state, terminal) {
	try {
		finishCronRunReceipt(terminal);
	} catch (error) {
		logReceiptFinishError(state, terminal.handle, error);
	}
}
function trackServiceCronRunReceiptSettlement(params) {
	trackCronRunReceiptSettlement({
		handle: params.handle,
		settlement: params.settlement,
		onFinishError: (error) => logReceiptFinishError(params.state, params.handle, error)
	});
}
function cronRunReceiptPersistHooks(params) {
	const terminal = params.terminal ? {
		handle: params.handle,
		status: resolveCronRunReceiptTerminalStatus(params.terminal.status, params.terminal.triggerFired),
		finishedAtMs: params.terminal.finishedAtMs,
		error: params.terminal.error
	} : void 0;
	const deferTerminal = terminal && isCronRunReceiptSettlementPending(params.handle);
	return {
		beforeWrite: (database) => {
			const unavailableError = `cron job agent is unavailable: ${params.handle.agentId}`;
			const recordsUnavailableGuard = terminal?.status === "error" && params.terminal?.disposition === "owner-unavailable";
			if (params.state.deps.isAgentAvailable?.(params.handle.agentId) === false && !recordsUnavailableGuard) throw new CronRunReceiptRevisionError(params.handle.receiptId, unavailableError, "owner-unavailable");
			if (params.allowMissingJob) assertCronRunReceiptOwnedInDatabase({
				database,
				handle: params.handle
			});
			else assertCronRunReceiptCurrentInDatabase({
				database,
				handle: params.handle,
				resolveAgentId: resolveAgentId(params.state)
			});
		},
		...terminal && !deferTerminal ? { afterWrite: (database) => {
			finishCronRunReceiptInDatabase({
				database,
				...terminal
			});
		} } : {},
		...terminal && deferTerminal ? { afterCommit: () => finishReceiptAfterCommit(params.state, terminal) } : {}
	};
}
function cronRunReceiptSupersedeHooks(params) {
	const terminal = {
		handle: params.handle,
		status: "superseded",
		finishedAtMs: params.finishedAtMs,
		error: params.error
	};
	if (isCronRunReceiptSettlementPending(params.handle)) return { afterCommit: () => finishReceiptAfterCommit(params.state, terminal) };
	return { afterWrite: (database) => {
		finishCronRunReceiptInDatabase({
			database,
			...terminal
		});
	} };
}
function supersedeServiceCronRunReceipt(handle, finishedAtMs, error) {
	finishCronRunReceipt({
		handle,
		status: "superseded",
		finishedAtMs,
		error
	});
}
//#endregion
//#region src/cron/run-error-reason.ts
/** Resolve one cron-owned classification before falling back to provider error inference. */
function resolveCronRunErrorReason(error, provider, classification) {
	if (classification?.kind === "permanent") return;
	if (classification?.kind === "reason") return classification.reason;
	return resolveFailoverReasonFromError(error, provider) ?? void 0;
}
//#endregion
//#region src/cron/task-run-event-codec.ts
/** Write-side cron codec: converts a finished service event into a run-history entry.
* Kept separate from task-run-detail.ts so the read/history codec stays free of the
* agents failover tree (which transitively pulls the sandbox module graph). */
/** Uses execution timing for one timestamp shared by ledger and legacy dual-write paths. */
function resolveCronRunEndedAt(event, fallbackTs) {
	if (typeof event.runAtMs === "number" && Number.isFinite(event.runAtMs) && typeof event.durationMs === "number" && Number.isFinite(event.durationMs)) return event.runAtMs + event.durationMs;
	return fallbackTs;
}
/** Builds the legacy run-history record from one finished service event. */
function cronRunLogEntryFromEvent(event, fallbackTs, errorClassification) {
	const errorReason = resolveCronRunErrorReason(event.error, event.provider, errorClassification);
	return {
		ts: resolveCronRunEndedAt(event, fallbackTs),
		jobId: event.jobId,
		action: "finished",
		status: event.status,
		completionStatus: event.completionStatus,
		error: event.error,
		errorReason,
		summary: event.summary,
		diagnostics: event.diagnostics,
		delivered: event.delivered,
		deliveryStatus: event.deliveryStatus,
		deliveryError: event.deliveryError,
		deliverySuppressionReason: event.deliverySuppressionReason,
		failureNotificationDelivery: event.failureNotificationDelivery,
		delivery: event.delivery,
		sessionId: event.sessionId,
		sessionKey: event.sessionKey,
		runId: event.runId,
		runAtMs: event.runAtMs,
		durationMs: event.durationMs,
		nextRunAtMs: event.nextRunAtMs,
		triggerFired: event.triggerFired,
		model: event.model,
		provider: event.provider,
		usage: event.usage
	};
}
//#endregion
//#region src/cron/service/task-ledger.ts
/** Progress summary shown while a detached task ledger row represents an active automation run. */
const CRON_TASK_RUNNING_PROGRESS_SUMMARY = "Running automation.";
//#endregion
//#region src/cron/service/task-runs.ts
/** Detached task-ledger integration for cron runs. */
function requireCronAgentId(agentId) {
	if (!agentId?.trim()) throw new Error(CRON_AGENT_SELECTION_REQUIRED_MESSAGE);
	return normalizeAgentId(agentId);
}
function resolveCurrentDefaultAgentId$1(state) {
	return state.deps.resolveDefaultAgentId?.() ?? state.deps.defaultAgentId;
}
/** Carries exact admission into the first post-admission owner lifecycle phase. */
function createCronOwnerExecutionIdentityAdmission(params) {
	const ownerBinding = createExecutionStartedOwnerBinding((admitted) => {
		try {
			const receiptResult = bindCronRunReceiptExecution({
				admitted,
				handle: params.runReceipt
			});
			const taskResult = params.taskId ? isRetainedExecutionOwnerBinding(receiptResult) ? bindTaskRunExecution({
				admitted,
				taskId: params.taskId
			}) : receiptResult : void 0;
			const flowParentResult = params.taskId ? taskResult : receiptResult;
			const flowResult = params.flowId ? isRetainedExecutionOwnerBinding(receiptResult) && isRetainedExecutionOwnerBinding(flowParentResult) ? bindTaskFlowExecution({
				admitted,
				flowId: params.flowId
			}) : flowParentResult : void 0;
			if ([
				receiptResult,
				taskResult,
				flowResult
			].some((result) => result === "mismatch" || result === "missing")) params.state.deps.log.warn({
				receiptResult,
				taskResult,
				flowResult
			}, "cron: exact execution identity binding was not retained");
		} catch (error) {
			params.state.deps.log.warn({ error }, "cron: failed to retain exact execution identity binding");
		}
	});
	return {
		ingress: {
			kind: "schedule",
			boundary: "cron.isolated-agent",
			state: "present"
		},
		onPostAdmission: ownerBinding.onPostAdmission,
		onExecutionStarted: ownerBinding.onExecutionStarted
	};
}
/** Updates an active cron task with the exact transcript identity reported by its runner. */
function tryUpdateCronTaskRunSession(state, taskRunId, sessionKey) {
	const childSessionKey = sessionKey?.trim();
	if (!taskRunId || !childSessionKey) return;
	try {
		if (recordTaskRunProgressByRunIdCore({
			runId: taskRunId,
			runtime: "cron",
			childSessionKey
		}).length === 0) state.deps.log.warn({ runId: taskRunId }, "cron: task ledger session was not updated");
	} catch (error) {
		state.deps.log.warn({
			runId: taskRunId,
			error
		}, "cron: failed to update task ledger session");
	}
}
function tryCreateCronTaskRunHandle(params) {
	const runId = createCronTaskRunId(params.job.id, params.startedAt, params.runReceipt?.receiptId, params.publicRunId);
	return tryCreateCronTaskRunRecord({
		state: params.state,
		job: params.job,
		jobId: params.job.id,
		startedAt: params.startedAt,
		runId
	}) ?? { runId };
}
function createCronTaskRunId(jobId, startedAt, receiptId, publicRunId) {
	const receipt = receiptId?.trim();
	const publicId = publicRunId?.trim();
	const discriminator = receipt || publicId || randomUUID();
	const publicSuffix = publicId && publicId !== discriminator ? `:${publicId}` : "";
	return `${createCronExecutionId(jobId, startedAt)}:${discriminator}${publicSuffix}`;
}
function findLatestCronTaskRunForRecoveryFromRecords(records, jobId, startedAt, storeKey, receiptId) {
	const executionRunId = createCronExecutionId(jobId, startedAt);
	const prefix = `${executionRunId}:`;
	const receiptRunId = receiptId ? `${prefix}${receiptId}` : void 0;
	return records.filter((task) => {
		if (task.runtime !== "cron" || task.sourceId !== jobId) return false;
		const taskStoreKey = cronTaskRecordStoreKey(task);
		if (receiptRunId) return taskStoreKey === storeKey && (task.runId === receiptRunId || task.runId?.startsWith(`${receiptRunId}:`));
		if (taskStoreKey === void 0) return task.runId === executionRunId;
		return taskStoreKey === storeKey && (task.runId === executionRunId || task.runId?.startsWith(prefix));
	}).toSorted((left, right) => Number(left.endedAt !== void 0) - Number(right.endedAt !== void 0) || resolveCronTaskRecordTimestamp(right) - resolveCronTaskRecordTimestamp(left) || right.createdAt - left.createdAt || right.taskId.localeCompare(left.taskId))[0];
}
function finalizedCronTaskRun(task, jobId) {
	if (task?.runtime !== "cron" || task.sourceId !== jobId || task.endedAt === void 0) return;
	const triggerEval = cronTaskRecordToTriggerEval(task);
	const entry = cronTaskRecordToRunLogEntry(task) ?? (task.status === "succeeded" && triggerEval?.fired === false ? {
		ts: task.endedAt,
		jobId,
		action: "finished",
		status: "ok",
		...task.startedAt === void 0 ? {} : {
			runAtMs: task.startedAt,
			durationMs: Math.max(0, task.endedAt - task.startedAt)
		}
	} : void 0);
	if (!entry?.status) return;
	const scriptResult = cronTaskRecordToScriptRunResult(task);
	return {
		entry: {
			...entry,
			status: entry.status
		},
		...scriptResult ? { scriptResult } : {},
		...triggerEval ? { triggerEval } : {}
	};
}
/** Re-reads task recovery facts on the caller's exact SQLite transaction. */
function findCronTaskRunRecoveryInDatabase(params) {
	const task = findLatestCronTaskRunForRecoveryFromRecords(listTaskRecordsByRuntimeSourceIdInDatabase(params.database, "cron", params.jobId), params.jobId, params.startedAt, params.storeKey, params.receiptId);
	const finalized = finalizedCronTaskRun(task, params.jobId);
	return {
		...task?.runId ? { taskRunId: task.runId } : {},
		...finalized ? { finalized } : {}
	};
}
function tryCreateCronTaskRunRecord(params) {
	try {
		const childSessionKey = params.childSessionKey;
		const effectiveJobAgentId = params.job ? resolveCronJobEffectiveAgentId(params.job, resolveCurrentDefaultAgentId$1(params.state)) : void 0;
		const task = createRunningTaskRunCore({
			runtime: "cron",
			taskKind: CRON_TASK_KIND,
			sourceId: params.jobId,
			ownerKey: "",
			scopeKind: "system",
			childSessionKey,
			agentId: effectiveJobAgentId ?? (childSessionKey ? resolveAgentIdFromSessionKey(childSessionKey, resolveCurrentDefaultAgentId$1(params.state)) : requireCronAgentId(resolveCurrentDefaultAgentId$1(params.state))),
			runId: params.runId,
			label: params.job?.name,
			task: params.job?.name || params.jobId,
			deliveryStatus: "not_applicable",
			notifyPolicy: "silent",
			startedAt: params.startedAt,
			lastEventAt: params.startedAt,
			progressSummary: CRON_TASK_RUNNING_PROGRESS_SUMMARY,
			detail: { storeKey: cronStoreKey(params.state.deps.storePath) }
		});
		if (!task) {
			params.state.deps.log.warn({ jobId: params.jobId }, "cron: task ledger record was not persisted");
			return;
		}
		return {
			runId: params.runId,
			taskId: task.taskId,
			...task.parentFlowId ? { flowId: task.parentFlowId } : {}
		};
	} catch (error) {
		params.state.deps.log.warn({
			jobId: params.jobId,
			error
		}, "cron: failed to create task ledger record");
		return;
	}
}
/** Finalizes executions that intentionally do not produce a run-history row. */
function tryFinishCronTaskRunWithoutHistory(state, result) {
	if (!result.taskRunId) return;
	const error = result.status !== "ok" && result.error !== void 0 ? normalizeCronRunErrorText(result.error) : void 0;
	const quietTriggerEval = result.triggerEval?.fired === false ? {
		...result.triggerEval,
		fired: false
	} : void 0;
	try {
		finalizeTaskRunByRunIdCore({
			runId: result.taskRunId,
			runtime: "cron",
			status: cronRunStatusToTaskStatus({
				status: result.status,
				completionStatus: quietTriggerEval ? "succeeded" : result.completionStatus,
				error
			}),
			endedAt: result.endedAt,
			lastEventAt: result.endedAt,
			error,
			terminalSummary: result.summary,
			childSessionKey: result.childSessionKey ?? result.sessionKey ?? null,
			...quietTriggerEval ? { detail: cronQuietTriggerTaskDetail(cronStoreKey(state.deps.storePath), quietTriggerEval) } : {}
		});
	} catch (cause) {
		state.deps.log.warn({
			runId: result.taskRunId,
			jobStatus: result.status,
			error: cause
		}, "cron: failed to update task ledger record");
	}
}
/** Finalizes the authoritative task row, creating one for terminal-only cron events. */
function tryFinishCronTaskRun(state, result) {
	const entry = cronRunLogEntryFromEvent(result.event, state.deps.nowMs(), result.errorClassification);
	const startedAt = entry.runAtMs ?? entry.ts;
	const candidateRunId = result.taskRunId ?? createCronTaskRunId(entry.jobId, startedAt, entry.runId);
	try {
		const existingCandidate = findTaskByRunId(candidateRunId);
		const created = existingCandidate?.runtime === "cron" ? void 0 : tryCreateCronTaskRunRecord({
			state,
			job: result.job ?? result.event.job,
			jobId: entry.jobId,
			startedAt,
			runId: candidateRunId,
			childSessionKey: entry.sessionKey
		});
		const taskRunId = existingCandidate?.runtime === "cron" ? candidateRunId : created?.runId;
		if (!taskRunId) return;
		const storeKey = cronStoreKey(state.deps.storePath);
		const legacyRecoveryRunId = createCronExecutionId(entry.jobId, startedAt);
		const detail = cronRunLogEntryToTaskDetail(entry, {
			storeKey,
			...result.scriptResult ? { scriptResult: result.scriptResult } : {},
			...result.triggerEval ? { triggerEval: result.triggerEval } : {}
		});
		const finalize = (runId, status = cronRunStatusToTaskStatus(entry)) => finalizeTaskRunByRunIdCore({
			runId,
			runtime: "cron",
			status,
			endedAt: entry.ts,
			lastEventAt: entry.ts,
			...status === "cancelled" ? {} : {
				error: entry.error,
				clearError: entry.error === void 0,
				terminalSummary: entry.summary ?? null,
				preserveTerminalSummary: true
			},
			childSessionKey: entry.sessionKey ?? null,
			detail
		});
		let updated = finalize(taskRunId);
		if (updated.length === 0) {
			const existing = findTaskByRunId(taskRunId);
			if (existing?.runtime === "cron" && existing.status === "cancelled") updated = finalize(taskRunId, "cancelled");
			else if (existing?.runtime === "cron" && (existing.status === "lost" || cronTaskRecordStoreKey(existing) === storeKey && cronTaskRecordToRunLogEntry(existing) === null || existing.detail === void 0 && existing.runId === legacyRecoveryRunId)) {
				const recovered = finalizeTaskRunById({
					taskId: existing.taskId,
					status: cronRunStatusToTaskStatus(entry),
					childSessionKey: entry.sessionKey ?? null,
					endedAt: entry.ts,
					lastEventAt: entry.ts,
					error: entry.error,
					terminalSummary: entry.summary ?? null,
					preserveTerminalSummary: true,
					detail
				});
				updated = recovered ? [recovered] : [];
			} else if (existing?.runtime === "cron") updated = finalize(taskRunId);
			else {
				const recreated = tryCreateCronTaskRunRecord({
					state,
					job: result.job ?? result.event.job,
					jobId: entry.jobId,
					startedAt,
					runId: taskRunId,
					childSessionKey: entry.sessionKey
				});
				if (recreated) updated = finalize(recreated.runId);
			}
		}
		if (updated.length === 0) state.deps.log.warn({ runId: taskRunId }, "cron: task ledger record was not finalized");
	} catch (error) {
		state.deps.log.warn({
			runId: candidateRunId,
			jobStatus: entry.status,
			error
		}, "cron: failed to update task ledger record");
	}
}
//#endregion
//#region src/cron/service/timer-execution-timeout.ts
const MAX_CRON_TIMER_DELAY_MS = 6e4;
/**
* Minimum gap between consecutive fires of the same cron job.  This is a
* safety net that prevents spin-loops when `computeJobNextRunAtMs` returns
* a value within the same second as the just-completed run.  The guard
* is intentionally generous (2 s) so it never masks a legitimate schedule
* but always breaks an infinite re-trigger cycle.  (See #17821)
*/
const MIN_REFIRE_GAP_MS = 2e3;
/** Payloads that execute outside the main session own cancellable task-run state. */
function runsDetachedFromMainSession(job) {
	return job.sessionTarget !== "main" || job.payload.kind === "script" || job.payload.kind === "skillCollectionReview";
}
function resolveMainSessionCronDeliveryContext(state, job) {
	const targetSessionKey = job.sessionKey?.trim();
	if (!targetSessionKey) return;
	const explicitAgentId = job.agentId?.trim();
	const agentId = normalizeAgentId(explicitAgentId || resolveAgentIdFromSessionKey(targetSessionKey, state.deps.resolveDefaultAgentId?.() ?? state.deps.defaultAgentId));
	const storePath = state.deps.resolveSessionStorePath?.(agentId) ?? state.deps.sessionStorePath;
	if (!storePath) return;
	try {
		const sessionEntry = loadSessionEntryReadOnly({
			agentId,
			sessionKey: targetSessionKey,
			storePath
		});
		return deliveryContextFromSession(sessionEntry);
	} catch {
		return;
	}
}
//#endregion
//#region src/cron/service/timer-outcome-events.ts
function cronOutcomeEvent(job, result, runAtMs) {
	return {
		jobId: job.id,
		action: "finished",
		job,
		status: result.status,
		completionStatus: result.completionStatus,
		error: result.error,
		summary: result.summary,
		diagnostics: result.diagnostics,
		delivered: job.state.lastDelivered,
		deliveryStatus: job.state.lastDeliveryStatus,
		deliveryError: job.state.lastDeliveryError,
		deliverySuppressionReason: job.state.deliverySuppressionReason,
		failureNotificationDelivery: failureNotificationDeliveryFromJobState(job),
		delivery: result.delivery,
		sessionId: result.sessionId,
		sessionKey: result.sessionKey,
		runAtMs,
		durationMs: job.state.lastDurationMs,
		nextRunAtMs: job.state.nextRunAtMs,
		...result.triggerEval?.fired ? { triggerFired: true } : {},
		model: result.model,
		provider: result.provider,
		usage: result.usage
	};
}
function recordCronOutcomeForJob(state, job, result) {
	const event = cronOutcomeEvent(job, result, result.startedAt);
	tryFinishCronTaskRun(state, {
		taskRunId: result.taskRunId,
		job,
		event,
		errorClassification: result.errorClassification,
		scriptResult: {
			scriptStateChanged: result.scriptStateChanged,
			scriptState: result.scriptState
		},
		...result.triggerEval ? { triggerEval: result.triggerEval } : {}
	});
}
function emitCronOutcomeEventForJob(state, job, result) {
	emit(state, cronOutcomeEvent(job, result, result.startedAt), cronFailureNotificationEventContext(result.failureNotificationDetail));
}
//#endregion
//#region src/cron/retry-hint.ts
const SERVER_ERROR_PATTERN = /\b(?:https?|status(?:[ _]code)?|response(?:[ _]code)?|http(?:[ _]status)?)\b[\s:=#"']{0,4}5\d{2}\b|\b5\d{2}\b[\s:)\].,-]*(?:internal server error|server error|bad gateway|service unavailable|gateway time-?out)\b|\binternal server error\b|\bbad gateway\b|\bservice unavailable\b|\bgateway time-?out\b|\b5xx\b|^\s*5\d{2}\s*$/i;
const RATE_LIMIT_PATTERN = /\b(?:https?(?:\/\d(?:\.\d)?)?|status(?:[ _-]?code)?|response(?:[ _-]?code)?|http(?:[ _-]?status)?)\b[\s:=#"'(]{0,6}429\b|\b(?:provider\s+)?api[ _-]?error\b[\s:=#"'(]{0,6}429\b|\b(?:requested\s+)?url\s+returned\s+error\b[\s:=#"'(]{0,6}429\b|\b429\b[\s:)\].,-]*(?:rate[_ -]?limit(?:ed|ing)?(?:[_ -](?:error|exceeded|reached))?|too many requests|resource has been exhausted|quota(?:\s+(?:exceeded|exhausted|depleted|reached))?)\b|\brate[_ -]?limit(?:ed|ing)?(?:[_ -](?:error|exceeded|reached))?\b|\btoo many requests\b|\bresource has been exhausted\b|\btokens per day\b|^\s*429\s*$/i;
const SESSION_LIFECYCLE_CLAIM_ERROR_PATTERN = /^(?:(?:CronSessionLifecycleClaimError|Error): )?Session "[^"\n]+" (?:changed|was deleted) while starting work\. Retry\.$/;
const TRANSIENT_PATTERNS = {
	rate_limit: RATE_LIMIT_PATTERN,
	overloaded: /^\s*529(?:\s*$|[\s:)\].,-]*(?:api\b.*\bbusy\b|(?:please\s+)?try\s+again\b))|\b(?:https?(?:\/\d(?:\.\d)?)?|status(?:[ _-]?code)?|response(?:[ _-]?code)?|http(?:[ _-]?status)?|(?:provider\s+)?api[ _-]?error|(?:requested\s+)?url\s+returned\s+error)\b[\s:=#"'(]{0,6}529\b|\boverloaded(?:_error)?\b|high demand|temporar(?:ily|y) overloaded|capacity exceeded/i,
	network: /(network|fetch failed|socket|econnreset|econnrefused|eai_again|enetdown|ehostunreach|ehostdown|enetreset|enetunreach|epipe)/i,
	timeout: /(timeout|timed out|stalled before execution start|etimedout)/i,
	server_error: SERVER_ERROR_PATTERN
};
/** Classifies cron execution errors against the configured retryable transient categories. */
function resolveCronExecutionRetryHint(input) {
	const { error, retryOn, classifiedReason, executionStarted } = input;
	if (!error || typeof error !== "string") return { retryable: false };
	if (SESSION_LIFECYCLE_CLAIM_ERROR_PATTERN.test(error)) return { retryable: executionStarted !== true };
	const keys = retryOn?.length ? retryOn : Object.keys(TRANSIENT_PATTERNS);
	const classified = classifiedReason ?? void 0;
	if (classified) return keys.includes(classified) ? {
		retryable: true,
		category: classified
	} : { retryable: false };
	for (const key of keys) if (TRANSIENT_PATTERNS[key]?.test(error)) return {
		retryable: true,
		category: key
	};
	return { retryable: false };
}
//#endregion
//#region src/cron/service/timer-trigger.ts
/** Default max retries for cron jobs on transient errors (#24355). */
const DEFAULT_MAX_TRANSIENT_RETRIES = 3;
/** Rejects outcome-generated schedule timestamps before they can persist or arm a timer. */
function resolveNextRunAtMsOrDisable(params) {
	const nextRunAtMs = asDateTimestampMs(params.candidate);
	if (nextRunAtMs !== void 0 && nextRunAtMs > 0) return nextRunAtMs;
	autoDisableCronJob({
		state: params.state,
		job: params.job,
		reason: "schedule-errors",
		atMs: params.state.deps.nowMs(),
		consecutiveErrors: 1,
		deferredNotifications: params.deferredNotifications
	});
}
/** Persists non-busy trigger evaluation state without touching payload-run history. */
function applyTriggerEvaluationState(job, triggerEval, evaluatedAtMs) {
	if (triggerEval.busy) return;
	job.state.lastTriggerEvalAtMs = evaluatedAtMs;
	job.state.triggerEvalCount = (job.state.triggerEvalCount ?? 0) + 1;
	if (triggerEval.stateChanged) job.state.triggerState = triggerEval.state;
	if (triggerEval.fired) job.state.lastTriggerFireAtMs = evaluatedAtMs;
}
/** Persists fired/error trigger metadata and disarms successful once triggers. */
function applyTriggerRunResult(job, result, opts) {
	if (!result.triggerEval || opts?.triggerOwnership === "stale") return;
	applyTriggerEvaluationState(job, result.status === "ok" ? result.triggerEval : {
		...result.triggerEval,
		stateChanged: false,
		state: void 0
	}, result.endedAt);
	if (opts?.scheduleOwnership !== "stale" && result.triggerEval.fired && job.trigger?.once === true && result.status === "ok") {
		if (job.schedule.kind === "stream") job.state.streamSourceIdentity = createCronStreamSourceIdentity();
		job.enabled = false;
		job.state.nextRunAtMs = void 0;
	}
}
function resolveCronNextRunWithLowerBound(params) {
	if (params.naturalNext === void 0) {
		params.state.deps.log.warn({
			jobId: params.job.id,
			jobName: params.job.name
		}, "cron: next run unresolved; clearing schedule to avoid a refire loop");
		return;
	}
	return resolveNextRunAtMsOrDisable({
		state: params.state,
		job: params.job,
		candidate: Math.max(params.naturalNext, params.lowerBoundMs),
		deferredNotifications: params.deferredNotifications
	});
}
function resolveTransientCronRetryDecision(params) {
	if (params.errorClassification?.kind === "permanent") return {
		retryable: false,
		consecutiveErrors: params.consecutiveErrors ?? 0,
		reason: "permanent error"
	};
	const retryHint = resolveCronExecutionRetryHint({
		error: params.error,
		retryOn: void 0,
		classifiedReason: params.errorClassification?.kind === "reason" ? params.errorClassification.reason : params.lastErrorReason,
		executionStarted: params.executionStarted
	});
	const consecutiveErrors = params.consecutiveErrors ?? 0;
	if (!retryHint.retryable) return {
		retryable: false,
		consecutiveErrors,
		retryCategory: retryHint.category,
		reason: "permanent error"
	};
	if (consecutiveErrors > DEFAULT_MAX_TRANSIENT_RETRIES) return {
		retryable: false,
		consecutiveErrors,
		retryCategory: retryHint.category,
		reason: "max retries exhausted"
	};
	return {
		retryable: true,
		consecutiveErrors,
		retryCategory: retryHint.category,
		backoffMs: errorBackoffMs(consecutiveErrors, DEFAULT_ERROR_BACKOFF_SCHEDULE_MS.slice(0, DEFAULT_MAX_TRANSIENT_RETRIES)),
		reason: "transient retry"
	};
}
function resolveDisabledHeartbeatOneShotRetryDecision(params) {
	const consecutiveSkipped = params.consecutiveSkipped ?? 0;
	if (consecutiveSkipped > DEFAULT_MAX_TRANSIENT_RETRIES) return {
		retryable: false,
		consecutiveSkipped,
		reason: "max retries exhausted"
	};
	return {
		retryable: true,
		consecutiveSkipped,
		backoffMs: errorBackoffMs(consecutiveSkipped, DEFAULT_ERROR_BACKOFF_SCHEDULE_MS.slice(0, DEFAULT_MAX_TRANSIENT_RETRIES)),
		reason: "disabled heartbeat retry"
	};
}
function normalizeQueuedSystemEventHandle(result) {
	if (typeof result === "boolean") return { accepted: result };
	if (result && typeof result === "object") return {
		accepted: result.accepted !== false,
		...result.remove ? { remove: result.remove } : {}
	};
	return { accepted: true };
}
function removeQueuedSystemEventHandle(state, job, queued) {
	if (!queued.accepted || !queued.remove) return;
	try {
		queued.remove();
	} catch (err) {
		state.deps.log.warn({
			jobId: job.id,
			jobName: job.name,
			err
		}, "cron: failed to remove undelivered main-session system event");
	}
}
function shouldRetryDisabledHeartbeatOneShot(job, result) {
	return job.schedule.kind === "at" && job.sessionTarget === "main" && job.wakeMode === "now" && result.status === "skipped" && result.error === "disabled";
}
function isScheduledTerminalOneShotRetry(job, lastRunStatus, lastRun, nextRun) {
	if (!isJobEnabled(job) || typeof nextRun !== "number" || typeof lastRun !== "number" || nextRun <= lastRun) return false;
	if (lastRunStatus === "error") return true;
	return lastRunStatus === "skipped" && job.sessionTarget === "main" && job.wakeMode === "now" && job.state.lastError === "disabled";
}
function resolveDeliveryState(params) {
	const primaryDeliveryPlan = resolveCronDeliveryPlan(params.job);
	const primaryDeliveryRequested = primaryDeliveryPlan.requested;
	const noFailureNotification = { status: "not-requested" };
	if (params.delivered === true && (params.runStatus !== "error" || params.delivery?.delivered === true)) return {
		delivered: true,
		status: "delivered",
		failureNotification: noFailureNotification
	};
	if (!primaryDeliveryRequested) {
		if (primaryDeliveryPlan.mode === "webhook" && params.deliveryAttempted === true) return {
			delivered: false,
			status: "not-delivered",
			error: params.error,
			failureNotification: noFailureNotification
		};
		return {
			status: "not-requested",
			failureNotification: noFailureNotification
		};
	}
	if (params.runStatus === "error") {
		if (params.delivered !== void 0) return {
			delivered: false,
			status: "not-delivered",
			error: params.error,
			deliverySuppressionReason: params.deliverySuppressionReason,
			failureNotification: noFailureNotification
		};
		return {
			status: "unknown",
			error: params.error,
			failureNotification: noFailureNotification
		};
	}
	if (params.delivered === false) return {
		delivered: false,
		status: "not-delivered",
		error: params.error,
		deliverySuppressionReason: params.deliverySuppressionReason,
		failureNotification: { status: "not-requested" }
	};
	return {
		status: "unknown",
		failureNotification: { status: "not-requested" }
	};
}
//#endregion
//#region src/cron/service/timer-outcomes.ts
/** Checks both the admitted schedule and edits that may have returned to its original value. */
function resolveCronRunScheduleOwnership(params) {
	return params.activeJobMarker?.scheduleMutated === true || !cronSchedulingInputsEqual(params.admittedJob, params.currentJob) ? "stale" : "current";
}
/** Keeps trigger state owned by the exact script/once definition that evaluated it. */
function resolveCronRunTriggerOwnership(params) {
	return params.activeJobMarker?.triggerMutated === true || params.admittedJob.trigger?.script !== params.currentJob.trigger?.script || params.admittedJob.trigger?.once !== params.currentJob.trigger?.once ? "stale" : "current";
}
function assignNextRunAtMs(params) {
	const nextRunAtMs = resolveNextRunAtMsOrDisable(params);
	params.job.state.nextRunAtMs = nextRunAtMs;
	return nextRunAtMs;
}
/** Applies run outcome state, delivery state, backoff/next-run scheduling, and delete-after-run policy. */
function applyJobResult(state, job, result, opts) {
	const previousScheduleState = {
		enabled: job.enabled,
		nextRunAtMs: job.state.nextRunAtMs,
		pacedNextRunAtMs: job.state.pacedNextRunAtMs,
		forcePreservedNextRunAtMs: job.state.forcePreservedNextRunAtMs
	};
	job.state.queuedAtMs = void 0;
	job.state.runningAtMs = void 0;
	job.state.pacedNextRunAtMs = void 0;
	job.state.forcePreservedNextRunAtMs = void 0;
	job.state.lastRunAtMs = result.startedAt;
	job.state.lastRunStatus = result.status;
	job.state.lastStatus = result.status;
	job.state.lastDurationMs = Math.max(0, result.endedAt - result.startedAt);
	job.state.lastError = result.error;
	job.state.lastDiagnostics = normalizeCronRunDiagnostics(result.diagnostics);
	job.state.lastDiagnosticSummary = summarizeCronRunDiagnostics(job.state.lastDiagnostics);
	job.state.lastErrorReason = result.status === "error" && typeof result.error === "string" ? resolveCronRunErrorReason(result.error, result.provider, result.errorClassification) : void 0;
	if (result.status === "error") state.deps.log.warn({
		jobId: job.id,
		jobName: job.name,
		error: result.error,
		diagnosticsSummary: job.state.lastDiagnosticSummary
	}, "cron: job run returned error status");
	const deliveryState = result.deliveryState ?? resolveDeliveryState({
		job,
		runStatus: result.status,
		delivery: result.delivery,
		delivered: result.delivered,
		deliveryAttempted: result.deliveryAttempted,
		error: result.deliveryError ?? result.error,
		deliverySuppressionReason: result.deliverySuppressionReason
	});
	job.state.lastDelivered = deliveryState.delivered;
	job.state.lastDeliveryStatus = deliveryState.status;
	job.state.deliverySuppressionReason = deliveryState.deliverySuppressionReason;
	job.state.lastDeliveryError = deliveryState.error;
	job.state.lastFailureNotificationDelivered = void 0;
	job.state.lastFailureNotificationDeliveryStatus = "not-requested";
	job.state.lastFailureNotificationDeliveryError = void 0;
	job.updatedAtMs = result.endedAt;
	const completionStatus = result.completionStatus ?? resolveAdmittedCronCompletionStatus(job, result.status, deliveryState.status, deliveryState.deliverySuppressionReason);
	const previousConsecutiveErrors = job.state.consecutiveErrors ?? 0;
	const alertConfig = resolveFailureAlert(state, job);
	if (result.status === "error") {
		job.state.consecutiveErrors = (job.state.consecutiveErrors ?? 0) + 1;
		job.state.consecutiveSkipped = 0;
	} else if (result.status === "skipped") {
		job.state.consecutiveErrors = 0;
		job.state.consecutiveSkipped = (job.state.consecutiveSkipped ?? 0) + 1;
		if (alertConfig?.includeSkipped && !opts?.replay) maybeEmitFailureAlert(state, {
			job,
			alertConfig,
			status: "skipped",
			error: result.error,
			runAtMs: result.startedAt,
			consecutiveCount: job.state.consecutiveSkipped,
			deferredNotifications: opts?.deferredNotifications
		});
	} else {
		job.state.consecutiveErrors = 0;
		job.state.consecutiveSkipped = 0;
		if (completionStatus === "succeeded") job.state.lastFailureAlertAtMs = void 0;
	}
	const preserveOneShotSchedule = opts?.scheduleMode === "preserve" && job.schedule.kind === "at" && previousScheduleState.nextRunAtMs !== void 0 && previousScheduleState.nextRunAtMs > (opts.scheduleOwnershipAtMs ?? result.startedAt);
	const ownsSchedule = opts?.scheduleOwnership !== "stale";
	const isOneShotSchedule = job.schedule.kind === "at" || job.schedule.kind === "on-exit";
	const shouldDelete = ownsSchedule && isOneShotSchedule && !preserveOneShotSchedule && job.deleteAfterRun === true && completionStatus === "succeeded";
	let autoDisableNotificationOwnsFailure = false;
	const applyReplaySchedule = () => {
		const nextRunAtMs = job.state.autoDisabled ? void 0 : opts?.replaySchedule?.nextRunAtMs;
		job.state.nextRunAtMs = nextRunAtMs === void 0 ? void 0 : assignNextRunAtMs({
			state,
			job,
			candidate: nextRunAtMs,
			deferredNotifications: opts?.deferredNotifications
		});
	};
	const finish = () => {
		if (opts?.replaySchedule && job.schedule.kind !== "at") applyReplaySchedule();
		finalizeCronFailureNotifications(state, {
			job,
			alertConfig,
			result,
			completionFailed: completionStatus === "failed",
			autoDisableNotificationOwnsFailure,
			replay: opts?.replay,
			deferredNotifications: opts?.deferredNotifications
		});
		return shouldDelete;
	};
	if (!ownsSchedule) {
		job.enabled = previousScheduleState.enabled;
		job.state.nextRunAtMs = previousScheduleState.nextRunAtMs;
		job.state.pacedNextRunAtMs = previousScheduleState.pacedNextRunAtMs;
		job.state.forcePreservedNextRunAtMs = previousScheduleState.forcePreservedNextRunAtMs;
	} else if (!shouldDelete) {
		if (preserveOneShotSchedule) {
			job.state.nextRunAtMs = previousScheduleState.nextRunAtMs;
			job.state.pacedNextRunAtMs = previousScheduleState.pacedNextRunAtMs;
			job.state.forcePreservedNextRunAtMs = previousScheduleState.nextRunAtMs;
		} else if (opts?.replaySchedule && job.schedule.kind === "at") {
			applyReplaySchedule();
			job.enabled = job.state.nextRunAtMs !== void 0;
		} else if (job.schedule.kind === "at") {
			if (shouldRetryDisabledHeartbeatOneShot(job, result)) {
				const retryDecision = resolveDisabledHeartbeatOneShotRetryDecision({
					cronConfig: state.deps.cronConfig,
					consecutiveSkipped: job.state.consecutiveSkipped
				});
				if (retryDecision.retryable && retryDecision.backoffMs !== void 0) {
					job.enabled = true;
					if (assignNextRunAtMs({
						state,
						job,
						candidate: result.endedAt + retryDecision.backoffMs,
						deferredNotifications: opts?.deferredNotifications
					}) !== void 0) state.deps.log.info({
						jobId: job.id,
						jobName: job.name,
						consecutiveSkipped: retryDecision.consecutiveSkipped,
						backoffMs: retryDecision.backoffMs,
						nextRunAtMs: job.state.nextRunAtMs
					}, "cron: scheduling one-shot retry after disabled heartbeat");
				} else {
					job.enabled = false;
					job.state.nextRunAtMs = void 0;
					state.deps.log.warn({
						jobId: job.id,
						jobName: job.name,
						consecutiveSkipped: retryDecision.consecutiveSkipped,
						reason: retryDecision.reason
					}, "cron: disabling one-shot job after disabled heartbeat retries");
				}
			} else if (result.status === "ok" || result.status === "skipped") {
				job.enabled = false;
				job.state.nextRunAtMs = void 0;
			} else if (result.status === "error") {
				const retryDecision = resolveTransientCronRetryDecision({
					cronConfig: state.deps.cronConfig,
					error: result.error,
					errorClassification: result.errorClassification,
					lastErrorReason: job.state.lastErrorReason,
					executionStarted: result.executionStarted,
					consecutiveErrors: job.state.consecutiveErrors
				});
				if (retryDecision.retryable && retryDecision.backoffMs !== void 0) {
					if (assignNextRunAtMs({
						state,
						job,
						candidate: result.endedAt + retryDecision.backoffMs,
						deferredNotifications: opts?.deferredNotifications
					}) !== void 0) state.deps.log.info({
						jobId: job.id,
						jobName: job.name,
						consecutiveErrors: retryDecision.consecutiveErrors,
						backoffMs: retryDecision.backoffMs,
						nextRunAtMs: job.state.nextRunAtMs,
						retryCategory: retryDecision.retryCategory
					}, "cron: scheduling one-shot retry after transient error");
				} else {
					job.enabled = false;
					job.state.nextRunAtMs = void 0;
					state.deps.log.warn({
						jobId: job.id,
						jobName: job.name,
						consecutiveErrors: retryDecision.consecutiveErrors,
						error: result.error,
						reason: retryDecision.reason,
						retryCategory: retryDecision.retryCategory
					}, "cron: disabling one-shot job after error");
				}
			}
		} else if (opts?.scheduleMode === "preserve") {
			job.state.nextRunAtMs = previousScheduleState.nextRunAtMs;
			job.state.pacedNextRunAtMs = previousScheduleState.pacedNextRunAtMs;
			job.state.forcePreservedNextRunAtMs = previousScheduleState.nextRunAtMs;
		} else if (result.status === "error" && isJobEnabled(job) && maybeAutoDisableCronJobAfterRunFailure({
			state,
			job,
			atMs: result.endedAt,
			deferredNotifications: opts?.deferredNotifications
		})) {
			autoDisableNotificationOwnsFailure = true;
			state.deps.log.error({
				jobId: job.id,
				name: job.name,
				consecutiveErrors: job.state.consecutiveErrors,
				error: result.error
			}, "cron: auto-disabled job after consecutive run failures");
		} else if (result.status === "error" && isJobEnabled(job)) {
			const retryDecision = resolveTransientCronRetryDecision({
				cronConfig: state.deps.cronConfig,
				error: result.error,
				errorClassification: result.errorClassification,
				lastErrorReason: job.state.lastErrorReason,
				executionStarted: result.executionStarted,
				consecutiveErrors: job.state.consecutiveErrors
			});
			let normalNext;
			let normalNextComputed = false;
			const computeNormalNext = () => {
				if (!normalNextComputed) {
					try {
						normalNext = (retryDecision.retryable || previousConsecutiveErrors > 0) && job.schedule.kind === "every" ? computeNextRunAtMs(job.schedule, result.endedAt) : computeJobNextRunAtMs(job, result.endedAt);
					} catch (err) {
						recordScheduleComputeError({
							state,
							job,
							err,
							deferredNotifications: opts?.deferredNotifications
						});
					}
					normalNextComputed = true;
				}
				return normalNext;
			};
			if (retryDecision.retryable && retryDecision.backoffMs !== void 0) {
				normalNext = computeNormalNext();
				if (normalNext === void 0) {} else {
					const retryNextRunAtMs = assignNextRunAtMs({
						state,
						job,
						candidate: result.endedAt + retryDecision.backoffMs,
						deferredNotifications: opts?.deferredNotifications
					});
					if (retryNextRunAtMs === void 0) return finish();
					if (retryNextRunAtMs < normalNext) {
						state.deps.log.info({
							jobId: job.id,
							jobName: job.name,
							consecutiveErrors: retryDecision.consecutiveErrors,
							backoffMs: retryDecision.backoffMs,
							nextRunAtMs: job.state.nextRunAtMs,
							normalNextRunAtMs: normalNext,
							retryCategory: retryDecision.retryCategory
						}, "cron: scheduling recurring retry after transient error");
						return finish();
					}
				}
			}
			const backoff = errorBackoffMs(job.state.consecutiveErrors ?? 1, DEFAULT_ERROR_BACKOFF_SCHEDULE_MS);
			normalNext = computeNormalNext();
			if (normalNext === void 0 && job.schedule.kind === "every") {
				assignNextRunAtMs({
					state,
					job,
					candidate: void 0,
					deferredNotifications: opts?.deferredNotifications
				});
				return finish();
			}
			const backoffNext = assignNextRunAtMs({
				state,
				job,
				candidate: result.endedAt + backoff,
				deferredNotifications: opts?.deferredNotifications
			});
			if (backoffNext === void 0) return finish();
			job.state.nextRunAtMs = job.schedule.kind === "cron" ? resolveCronNextRunWithLowerBound({
				state,
				job,
				naturalNext: normalNext,
				lowerBoundMs: backoffNext,
				deferredNotifications: opts?.deferredNotifications
			}) : normalNext !== void 0 ? Math.max(normalNext, backoffNext) : backoffNext;
			state.deps.log.info({
				jobId: job.id,
				consecutiveErrors: job.state.consecutiveErrors,
				backoffMs: backoff,
				nextRunAtMs: job.state.nextRunAtMs
			}, "cron: applying error backoff");
		} else if (isJobEnabled(job) && result.status === "ok" && job.pacing !== void 0 && result.nextCheck !== void 0) {
			const pacedNextRunAtMs = resolvePacedNextRunAtMs({
				nowMs: result.endedAt,
				delayMs: result.nextCheck.delayMs,
				pacing: job.pacing
			});
			const nextRunAtMs = assignNextRunAtMs({
				state,
				job,
				candidate: job.trigger ? Math.max(pacedNextRunAtMs ?? NaN, result.endedAt + Math.max(MIN_REFIRE_GAP_MS, resolveCronTriggerMinIntervalMs())) : pacedNextRunAtMs,
				deferredNotifications: opts?.deferredNotifications
			});
			job.state.pacedNextRunAtMs = nextRunAtMs;
		} else if (isJobEnabled(job)) {
			let naturalNext;
			try {
				naturalNext = previousConsecutiveErrors > 0 && job.schedule.kind === "every" ? computeNextRunAtMs(job.schedule, result.endedAt) : computeJobNextRunAtMs(job, result.endedAt);
			} catch (err) {
				recordScheduleComputeError({
					state,
					job,
					err,
					deferredNotifications: opts?.deferredNotifications
				});
			}
			if (job.schedule.kind === "cron") {
				const minNext = result.endedAt + Math.max(MIN_REFIRE_GAP_MS, job.trigger ? resolveCronTriggerMinIntervalMs() : 0);
				job.state.nextRunAtMs = resolveCronNextRunWithLowerBound({
					state,
					job,
					naturalNext,
					lowerBoundMs: minNext,
					deferredNotifications: opts?.deferredNotifications
				});
			} else {
				const triggerNext = naturalNext !== void 0 && job.trigger ? Math.max(naturalNext, result.endedAt + resolveCronTriggerMinIntervalMs()) : naturalNext;
				job.state.nextRunAtMs = triggerNext;
				if (triggerNext !== void 0 || job.schedule.kind === "every") assignNextRunAtMs({
					state,
					job,
					candidate: triggerNext,
					deferredNotifications: opts?.deferredNotifications
				});
			}
		} else job.state.nextRunAtMs = void 0;
	}
	return finish();
}
/** Commits payload-script state only after the complete cron run succeeds. */
function applyScriptRunResult(job, result, opts) {
	if (opts?.triggerOwnership !== "stale" && result.status === "ok" && result.scriptStateChanged === true) job.state.triggerState = result.scriptState;
}
/** Applies a quiet trigger tick without mutating normal run-history state. */
function applyTriggerNoFireResult(state, job, result, opts) {
	const previousNextRunAtMs = job.state.nextRunAtMs;
	const previousPacedNextRunAtMs = job.state.pacedNextRunAtMs;
	const previousForcePreservedNextRunAtMs = job.state.forcePreservedNextRunAtMs;
	job.state.queuedAtMs = void 0;
	job.state.runningAtMs = void 0;
	job.updatedAtMs = result.endedAt;
	if (!result.triggerEval.busy && opts?.triggerOwnership !== "stale") {
		job.state.consecutiveErrors = 0;
		job.state.scheduleErrorCount = 0;
		applyTriggerEvaluationState(job, result.triggerEval, result.endedAt);
	}
	if (opts?.scheduleMode === "immediate-preserve" || opts?.scheduleMode === "stale-preserve") {
		job.state.nextRunAtMs = previousNextRunAtMs;
		job.state.pacedNextRunAtMs = previousPacedNextRunAtMs;
		job.state.forcePreservedNextRunAtMs = opts.scheduleMode === "immediate-preserve" ? previousNextRunAtMs : previousForcePreservedNextRunAtMs;
		return;
	}
	job.state.pacedNextRunAtMs = void 0;
	job.state.forcePreservedNextRunAtMs = void 0;
	try {
		const naturalNext = computeJobNextRunAtMs(job, result.endedAt);
		const floorMs = Math.max(MIN_REFIRE_GAP_MS, resolveCronTriggerMinIntervalMs());
		job.state.nextRunAtMs = naturalNext;
		if (naturalNext !== void 0 || job.schedule.kind === "every") assignNextRunAtMs({
			state,
			job,
			candidate: naturalNext === void 0 ? void 0 : Math.max(naturalNext, result.endedAt + floorMs),
			deferredNotifications: opts?.deferredNotifications
		});
	} catch (err) {
		recordScheduleComputeError({
			state,
			job,
			err,
			deferredNotifications: opts?.deferredNotifications
		});
	}
}
function applyOutcomeToStoredJob(state, result, opts) {
	const store = state.store;
	if (!store) {
		tryFinishCronTaskRunWithoutHistory(state, result);
		return;
	}
	const jobs = store.jobs;
	const job = jobs.find((entry) => entry.id === result.jobId);
	if (!job || result.activeJobMarker?.jobRemoved === true) {
		if (result.status === "ok" && result.triggerEval?.fired === false) {
			tryFinishCronTaskRunWithoutHistory(state, result);
			return;
		}
		applyJobResult(state, result.job, result, {
			scheduleOwnership: "stale",
			deferredNotifications: opts?.deferredNotifications
		});
		emitCronOutcomeForJob(state, result.job, result);
		state.deps.log.info({
			jobId: result.jobId,
			status: result.status
		}, "cron: finalized run after job was removed during execution");
		return;
	}
	if (applyOutcomeToAuthoritativeJob(state, job, result, opts)) {
		store.jobs = jobs.filter((entry) => entry.id !== job.id);
		return job;
	}
}
/** Applies one outcome to a row already re-read under the runtime write transaction. */
function applyOutcomeToAuthoritativeJob(state, job, result, opts) {
	const scheduleOwnership = resolveCronRunScheduleOwnership({
		admittedJob: result.job,
		currentJob: job,
		activeJobMarker: result.activeJobMarker
	});
	const triggerOwnership = resolveCronRunTriggerOwnership({
		admittedJob: result.job,
		currentJob: job,
		activeJobMarker: result.activeJobMarker
	});
	if (result.status === "ok" && result.triggerEval && !result.triggerEval.fired) {
		applyTriggerNoFireResult(state, job, {
			startedAt: result.startedAt,
			endedAt: result.endedAt,
			triggerEval: result.triggerEval
		}, {
			scheduleMode: scheduleOwnership === "stale" ? "stale-preserve" : "advance",
			triggerOwnership,
			deferredNotifications: opts?.deferredNotifications
		});
		job.state.startupCatchupAtMs = void 0;
		if (scheduleOwnership === "current") job.state.pacedNextRunAtMs = void 0;
		return false;
	}
	const shouldDelete = applyJobResult(state, job, result, {
		scheduleOwnership,
		deferredNotifications: opts?.deferredNotifications
	});
	applyTriggerRunResult(job, result, {
		scheduleOwnership,
		triggerOwnership
	});
	applyScriptRunResult(job, result, { triggerOwnership });
	job.state.startupCatchupAtMs = void 0;
	if (opts?.emit !== false) emitCronOutcomeForJob(state, job, result);
	return shouldDelete;
}
/** Records a terminal task/event fact before the fallible runtime-row commit. */
function emitCronOutcomeForJob(state, job, result) {
	if (result.status === "ok" && result.triggerEval && !result.triggerEval.fired) return;
	recordCronOutcomeForJob(state, job, result);
	emitCronOutcomeEventForJob(state, job, result);
}
//#endregion
//#region src/cron/service/startup-run-repair.ts
/** Repairs interrupted and finalized cron runs while the service starts. */
const STARTUP_INTERRUPTED_ERROR = "cron: job interrupted by gateway restart";
function resolveOneShotReplacementAtMs(job, runningAtMs) {
	if (job.schedule.kind !== "at" || !job.enabled) return;
	const nextRunAtMs = job.state.nextRunAtMs;
	if (typeof nextRunAtMs !== "number" || nextRunAtMs <= runningAtMs) return;
	return parseAbsoluteTimeMs(job.schedule.at) === nextRunAtMs ? nextRunAtMs : void 0;
}
function markInterruptedStartupRun(params) {
	const { job, runningAtMs, nowMs } = params;
	const replacementAtMs = resolveOneShotReplacementAtMs(job, runningAtMs);
	const previousErrors = typeof job.state.consecutiveErrors === "number" && Number.isFinite(job.state.consecutiveErrors) ? Math.max(0, Math.floor(job.state.consecutiveErrors)) : 0;
	params.state.deps.log.warn({
		jobId: job.id,
		runningAtMs
	}, "cron: marking interrupted running job failed on startup");
	job.state.runningAtMs = void 0;
	job.state.lastRunAtMs = runningAtMs;
	job.state.lastRunStatus = "error";
	job.state.lastStatus = "error";
	job.state.lastError = STARTUP_INTERRUPTED_ERROR;
	job.state.lastErrorReason = void 0;
	job.state.lastDurationMs = Math.max(0, nowMs - runningAtMs);
	job.state.consecutiveErrors = previousErrors + 1;
	job.state.lastDelivered = false;
	job.state.lastDeliveryStatus = "unknown";
	job.state.lastDeliveryError = STARTUP_INTERRUPTED_ERROR;
	job.state.deliverySuppressionReason = void 0;
	job.state.lastFailureNotificationDelivered = void 0;
	job.state.lastFailureNotificationDeliveryStatus = "not-requested";
	job.state.lastFailureNotificationDeliveryError = void 0;
	job.state.nextRunAtMs = replacementAtMs;
	job.state.startupCatchupAtMs = void 0;
	job.updatedAtMs = nowMs;
	const alertConfig = resolveFailureAlert(params.state, job);
	const autoDisableNotificationOwnsFailure = maybeAutoDisableCronJobAfterRunFailure({
		state: params.state,
		job,
		atMs: nowMs,
		deferredNotifications: params.deferredNotifications
	});
	if (autoDisableNotificationOwnsFailure) params.state.deps.log.error({
		jobId: job.id,
		name: job.name,
		consecutiveErrors: job.state.consecutiveErrors
	}, "cron: auto-disabled interrupted job after consecutive run failures");
	finalizeCronFailureNotifications(params.state, {
		job,
		alertConfig,
		result: {
			status: "error",
			error: STARTUP_INTERRUPTED_ERROR,
			startedAt: runningAtMs
		},
		completionFailed: false,
		autoDisableNotificationOwnsFailure,
		deferredNotifications: params.deferredNotifications
	});
	if (job.schedule.kind === "at" && replacementAtMs === void 0 && !params.recoverInterruptedOneShot) job.enabled = false;
	return {
		jobId: job.id,
		...params.taskRunId ? { taskRunId: params.taskRunId } : {},
		...replacementAtMs === void 0 ? {} : { replacementAtMs },
		runAtMs: runningAtMs,
		durationMs: job.state.lastDurationMs
	};
}
function restoreFinalizedStartupRun(params) {
	const { state, job, runningAtMs, entry } = params;
	const startedAt = asDateTimestampMs(entry.runAtMs ?? runningAtMs);
	const endedAt = asDateTimestampMs(entry.ts);
	if (startedAt === void 0 || startedAt < 0 || endedAt === void 0 || endedAt < 0) {
		state.deps.log.warn({ jobId: job.id }, "cron: ignoring finalized startup run with an invalid timestamp envelope");
		return;
	}
	const replacementAtMs = resolveOneShotReplacementAtMs(job, startedAt);
	const persistedNextRunAtMs = asDateTimestampMs(job.state.nextRunAtMs);
	const scheduleOwnership = job.schedule.kind === "at" && (!job.enabled || persistedNextRunAtMs !== void 0 && persistedNextRunAtMs > startedAt) ? "stale" : "current";
	job.state.startupCatchupAtMs = void 0;
	if (params.triggerEval?.fired === false) {
		applyTriggerNoFireResult(state, job, {
			startedAt,
			endedAt,
			triggerEval: params.triggerEval
		}, {
			scheduleMode: scheduleOwnership === "stale" ? "stale-preserve" : "advance",
			deferredNotifications: params.deferredNotifications
		});
		return {
			shouldDelete: false,
			...replacementAtMs === void 0 ? {} : { replacementAtMs }
		};
	}
	const shouldDelete = applyJobResult(state, job, {
		...entry,
		completionStatus: entry.completionStatus ?? resolveCronCompletionStatus({
			status: entry.status,
			delivered: entry.delivered,
			deliveryStatus: entry.deliveryStatus
		}),
		deliveryState: {
			delivered: entry.delivered,
			status: entry.deliveryStatus ?? "unknown",
			error: entry.deliveryError,
			deliverySuppressionReason: entry.deliverySuppressionReason,
			failureNotification: entry.failureNotificationDelivery ?? { status: "not-requested" }
		},
		startedAt,
		endedAt
	}, {
		replay: true,
		scheduleOwnership,
		...scheduleOwnership === "current" ? { replaySchedule: { nextRunAtMs: entry.nextRunAtMs } } : {},
		deferredNotifications: params.deferredNotifications
	});
	job.state.lastDurationMs = entry.durationMs ?? Math.max(0, endedAt - startedAt);
	job.state.lastErrorReason = entry.errorReason;
	if (entry.failureNotificationDelivery) {
		job.state.lastFailureNotificationDelivered = entry.failureNotificationDelivery.delivered;
		job.state.lastFailureNotificationDeliveryStatus = entry.failureNotificationDelivery.status;
		job.state.lastFailureNotificationDeliveryError = entry.failureNotificationDelivery.error;
		const lastAlert = job.state.lastFailureAlertAtMs;
		if (entry.failureNotificationDelivery.status !== "not-requested" && (lastAlert === void 0 || lastAlert < endedAt || lastAlert > state.deps.nowMs())) job.state.lastFailureAlertAtMs = endedAt;
	}
	if (params.triggerEval) applyTriggerRunResult(job, {
		status: entry.status,
		endedAt,
		triggerEval: params.triggerEval
	}, { scheduleOwnership });
	if (params.scriptResult) applyScriptRunResult(job, {
		status: entry.status,
		...params.scriptResult
	});
	state.deps.log.info({
		jobId: job.id,
		runningAtMs,
		status: entry.status
	}, "cron: restored finalized task-ledger run on startup");
	return {
		shouldDelete,
		...replacementAtMs === void 0 ? {} : { replacementAtMs }
	};
}
//#endregion
//#region src/cron/service/run-recovery.ts
function exactReceiptMatches(current, proposed) {
	return current?.receiptId === proposed.receiptId && current.ownerPid === proposed.ownerPid && current.ownerStartTime === proposed.ownerStartTime && current.storeKey === proposed.storeKey && current.jobId === proposed.jobId && current.startedAtMs === proposed.startedAtMs;
}
function repairInDatabase(params) {
	const { state, database, proposal } = params;
	const storeKey = cronStoreKey(state.deps.storePath);
	const currentReceipt = findActiveCronRunReceiptInDatabase({
		database: database.db,
		storePath: state.deps.storePath,
		jobId: proposal.jobId
	});
	if (proposal.receipt) {
		if (!exactReceiptMatches(currentReceipt, proposal.receipt) && currentReceipt) return {
			kind: "superseded",
			receipt: currentReceipt
		};
		if (currentReceipt && !params.proposedReceiptIsStale) return {
			kind: "live",
			receipt: currentReceipt
		};
	} else if (currentReceipt) return {
		kind: "superseded",
		receipt: currentReceipt
	};
	const row = loadCronRows(database.db, storeKey).find((entry) => entry.job_id === proposal.jobId);
	const job = row ? loadedCronStoreFromRows([row]).store.jobs.find((entry) => entry.id === proposal.jobId) : void 0;
	if (!row || !job) {
		if (proposal.receipt && currentReceipt) {
			finishCronRunReceiptInDatabase({
				database: database.db,
				handle: proposal.receipt,
				status: "interrupted",
				finishedAtMs: state.deps.nowMs(),
				error: "cron: owner unavailable after the job row was finalized"
			});
			return {
				kind: "repaired",
				notifications: []
			};
		}
		return { kind: "superseded" };
	}
	let changed = false;
	if (proposal.queuedAtMs !== void 0 && job.state.queuedAtMs === proposal.queuedAtMs) {
		delete job.state.queuedAtMs;
		if (proposal.receipt && currentReceipt) finishCronRunReceiptInDatabase({
			database: database.db,
			handle: proposal.receipt,
			status: "interrupted",
			finishedAtMs: state.deps.nowMs(),
			error: "cron: queued run interrupted because owner is unavailable"
		});
		changed = true;
	}
	let interrupted;
	let replacementAtMs;
	const notifications = [];
	if (proposal.runningAtMs !== void 0) {
		if (job.state.runningAtMs !== proposal.runningAtMs) {
			if (proposal.receipt && currentReceipt) {
				finishCronRunReceiptInDatabase({
					database: database.db,
					handle: proposal.receipt,
					status: "interrupted",
					finishedAtMs: state.deps.nowMs(),
					error: "cron: owner unavailable after run state was already finalized"
				});
				return {
					kind: "repaired",
					notifications: []
				};
			}
			return {
				kind: "superseded",
				...currentReceipt ? { receipt: currentReceipt } : {}
			};
		}
		const task = findCronTaskRunRecoveryInDatabase({
			database: database.db,
			jobId: proposal.jobId,
			startedAt: proposal.runningAtMs,
			storeKey,
			receiptId: proposal.receipt?.receiptId
		});
		const finalized = task.finalized;
		const restored = finalized ? restoreFinalizedStartupRun({
			state,
			job,
			runningAtMs: proposal.runningAtMs,
			entry: finalized.entry,
			...finalized.scriptResult ? { scriptResult: finalized.scriptResult } : {},
			...finalized.triggerEval ? { triggerEval: finalized.triggerEval } : {},
			deferredNotifications: notifications
		}) : void 0;
		replacementAtMs = restored?.replacementAtMs;
		if (!restored) {
			const nowMs = state.deps.nowMs();
			interrupted = markInterruptedStartupRun({
				state,
				job,
				taskRunId: task.taskRunId,
				runningAtMs: proposal.runningAtMs,
				nowMs,
				recoverInterruptedOneShot: params.mode === "startup",
				deferredNotifications: notifications
			});
			replacementAtMs = interrupted.replacementAtMs;
			if (job.enabled && job.state.nextRunAtMs === void 0) recomputeJobNextRunAtMs({
				state,
				job,
				nowMs,
				deferredNotifications: notifications
			});
			if (params.mode === "startup" && job.schedule.kind === "at") job.state.startupCatchupAtMs = job.state.nextRunAtMs;
		}
		if (proposal.receipt) finishCronRunReceiptInDatabase({
			database: database.db,
			handle: proposal.receipt,
			status: restored && finalized ? resolveCronRunReceiptTerminalStatus(finalized.entry.status, finalized.triggerEval?.fired) : "interrupted",
			finishedAtMs: restored && finalized ? finalized.entry.ts : state.deps.nowMs(),
			error: restored && finalized ? finalized.entry.error : "cron: job interrupted because owner is unavailable"
		});
		if (restored?.shouldDelete) {
			deleteCronJobRowInDatabase(database.db, storeKey, proposal.jobId);
			return {
				kind: "repaired",
				notifications,
				...restored.replacementAtMs === void 0 ? { skipStartupCatchup: true } : {}
			};
		}
		changed = true;
	}
	if (!changed) {
		if (proposal.receipt && currentReceipt && params.proposedReceiptIsStale) {
			finishCronRunReceiptInDatabase({
				database: database.db,
				handle: proposal.receipt,
				status: "interrupted",
				finishedAtMs: state.deps.nowMs(),
				error: "cron: owner unavailable after run marker retirement"
			});
			return {
				kind: "repaired",
				notifications
			};
		}
		return {
			kind: "superseded",
			...currentReceipt ? { receipt: currentReceipt } : {}
		};
	}
	upsertCronJobRow(database.db, storeKey, job, row.sort_order);
	return {
		kind: "repaired",
		...interrupted ? { interrupted } : {},
		notifications,
		...replacementAtMs === void 0 && proposal.runningAtMs !== void 0 && !(params.mode === "startup" && interrupted && job.schedule.kind === "at") ? { skipStartupCatchup: true } : {}
	};
}
function proposeCronRunRecovery(state, jobId, queuedAtMs, runningAtMs) {
	return {
		jobId,
		...queuedAtMs !== void 0 ? { queuedAtMs } : {},
		...queuedAtMs !== void 0 || runningAtMs !== void 0 ? { receipt: inspectActiveCronRunReceipt({
			storePath: state.deps.storePath,
			jobId
		}) } : {},
		...runningAtMs !== void 0 ? { runningAtMs } : {}
	};
}
/** Reconciles the bounded durable marker set so live siblings can adopt dead owners. */
function recoverNonTerminalCronRunReceipts(state) {
	let repaired = false;
	const receipts = [];
	const notifications = [];
	for (const job of state.store?.jobs ?? []) {
		const queuedAtMs = job.state.queuedAtMs;
		const runningAtMs = job.state.runningAtMs;
		if (queuedAtMs === void 0 && runningAtMs === void 0) continue;
		const result = recoverCronRunProposal(state, proposeCronRunRecovery(state, job.id, queuedAtMs, runningAtMs));
		if (result.kind === "live") {
			if (result.receipt.ownerPid !== process.pid) receipts.push(result.receipt);
		} else if (result.kind === "superseded") {
			if (result.receipt && result.receipt.ownerPid !== process.pid) receipts.push(result.receipt);
		} else {
			repaired = true;
			notifications.push(...result.notifications);
		}
	}
	return {
		repaired,
		receipts,
		notifications
	};
}
function recoverCronRunProposal(state, proposal, mode = "reclaim") {
	const proposedReceiptIsStale = proposal.receipt ? isCronRunReceiptOwnerStale(proposal.receipt, state.deps.nowMs()) : true;
	const result = runOpenClawStateWriteTransaction((database) => repairInDatabase({
		state,
		database,
		proposal,
		proposedReceiptIsStale,
		mode
	}), {}, { operationLabel: "cron.run-recovery" });
	if (result.kind === "repaired") noteCronJobsStoreCommit(cronStoreKey(state.deps.storePath));
	return result;
}
/** Schedules only authoritative rows that are not protected by an active run. */
function recomputeUnownedCronSchedules(state, opts) {
	const storeKey = cronStoreKey(state.deps.storePath);
	const nowMs = state.deps.nowMs();
	const result = runOpenClawStateWriteTransaction(({ db }) => {
		const notifications = [];
		let changed = false;
		const jobs = [];
		const rows = loadCronRows(db, storeKey);
		const decodedJobs = loadedCronStoreFromRows(rows).store.jobs;
		const jobsById = new Map(decodedJobs.map((job) => [job.id, job]));
		const activeJobIds = listActiveCronRunReceiptJobIdsInDatabase(db, state.deps.storePath);
		for (const row of rows) {
			if (activeJobIds.has(row.job_id)) continue;
			const job = jobsById.get(row.job_id);
			if (!job) continue;
			if (recomputeSingleJobForMaintenance(state, job, {
				...opts,
				nowMs: opts?.nowMs ?? nowMs,
				deferredNotifications: notifications
			})) {
				upsertCronJobRow(db, storeKey, job, row.sort_order);
				jobs.push(job);
				changed = true;
			}
		}
		return {
			changed,
			jobs,
			notifications
		};
	}, {}, { operationLabel: "cron.schedule-unowned" });
	if (result.changed) noteCronJobsStoreCommit(storeKey);
	return result;
}
//#endregion
//#region src/cron/service/timer-notifications.ts
function maybeNotifyIsolatedAgentSetupTimeout(state, result) {
	const signal = result.isolatedAgentSetupTimeout;
	if (!signal) return false;
	const notify = state.deps.onIsolatedAgentSetupTimeout;
	if (!notify) return false;
	const logFailure = (err) => {
		state.deps.log.warn({
			jobId: result.job.id,
			err: String(err)
		}, "cron: isolated setup timeout handler failed");
	};
	try {
		Promise.resolve(notify({
			job: result.job,
			error: signal.error,
			timeoutMs: signal.timeoutMs
		})).catch(logFailure);
		return true;
	} catch (err) {
		logFailure(err);
		return false;
	}
}
//#endregion
//#region src/cron/script-failure.ts
function classifyCronScriptFailure(code) {
	if (code === "timeout") return {
		kind: "reason",
		reason: "timeout"
	};
	if (code === "runtime_unavailable") return {
		kind: "reason",
		reason: "server_error"
	};
	return { kind: "permanent" };
}
/** Authors matched retry policy and safe notification detail from one closed code. */
function cronScriptFailureMetadata(source, code) {
	return {
		errorClassification: classifyCronScriptFailure(code),
		failureNotificationDetail: {
			kind: "script-failure",
			source,
			code
		}
	};
}
//#endregion
//#region src/cron/service/timer-execution.ts
/** Executes a cron job without mutating persisted job state. */
async function executeJobCore(state, job, abortSignal, options) {
	const resolveAbortError = () => ({
		status: "error",
		error: abortErrorMessage(abortSignal)
	});
	const waitWithAbort = async (ms) => {
		if (!abortSignal) {
			await new Promise((resolve) => {
				setTimeout(resolve, ms);
			});
			return;
		}
		if (abortSignal.aborted) return;
		await new Promise((resolve) => {
			const timer = setTimeout(() => {
				abortSignal.removeEventListener("abort", onAbort);
				resolve();
			}, ms);
			const onAbort = () => {
				clearTimeout(timer);
				abortSignal.removeEventListener("abort", onAbort);
				resolve();
			};
			abortSignal.addEventListener("abort", onAbort, { once: true });
		});
	};
	if (abortSignal?.aborted) return resolveAbortError();
	const execTargetRecoveryError = resolveCronToolsAllowExecTargetRecoveryError({
		jobId: job.id,
		requirement: job.toolsAllowExecTargetRequirement,
		execTarget: job.toolsAllowExecTarget
	});
	if (execTargetRecoveryError) return {
		status: "error",
		error: execTargetRecoveryError,
		diagnostics: createCronRunDiagnosticsFromError("cron-preflight", execTargetRecoveryError, { nowMs: state.deps.nowMs })
	};
	if (options?.streamScheduleKey !== void 0 || options?.streamSourceIdentity !== void 0) {
		const currentKey = job.schedule.kind === "stream" ? cronStreamScheduleKey(job.schedule) : void 0;
		if (options.streamScheduleKey === void 0 || options.streamSourceIdentity === void 0 || currentKey !== options.streamScheduleKey || job.state.streamSourceIdentity !== options.streamSourceIdentity) return {
			status: "skipped",
			error: "stream batch source no longer current"
		};
	}
	let effectiveJob = job;
	let triggerEval;
	if (job.trigger) {
		const evaluator = state.deps.evaluateCronTrigger;
		if (!evaluator) return {
			status: "error",
			error: "cron trigger evaluator is unavailable",
			...cronScriptFailureMetadata("trigger", "runtime_unavailable")
		};
		const evaluation = await evaluator({
			job,
			script: job.trigger.script,
			state: job.state.triggerState,
			streamBatch: options?.streamBatch,
			abortSignal
		});
		if (abortSignal?.aborted) return resolveAbortError();
		if (evaluation.kind === "busy") {
			state.deps.log.debug({ jobId: job.id }, "cron: trigger evaluation skipped while busy");
			return {
				status: "ok",
				triggerEval: {
					fired: false,
					stateChanged: false,
					busy: true
				}
			};
		}
		if (evaluation.kind === "error") return {
			status: "error",
			error: `cron trigger evaluation failed (${evaluation.code}): ${evaluation.error}`,
			...cronScriptFailureMetadata("trigger", evaluation.code),
			triggerEval: {
				fired: false,
				stateChanged: false
			}
		};
		const stateChanged = Object.hasOwn(evaluation, "state");
		triggerEval = {
			fired: evaluation.fire,
			stateChanged,
			...stateChanged ? { state: evaluation.state } : {}
		};
		if (!evaluation.fire) return {
			status: "ok",
			triggerEval
		};
		if (evaluation.message !== void 0) effectiveJob = {
			...job,
			payload: appendCronPayloadText(job.payload, evaluation.message)
		};
	}
	options?.assertRunCurrent?.();
	if (effectiveJob.payload.kind === "script") {
		const result = await executeScriptCronJob(state, effectiveJob, abortSignal, options?.activeJobMarker, options?.streamBatch, options?.assertRunCurrent);
		return triggerEval ? {
			...result,
			triggerEval
		} : result;
	}
	if (options?.streamBatch !== void 0) effectiveJob = {
		...effectiveJob,
		payload: appendCronPayloadText(effectiveJob.payload, options.streamBatch)
	};
	if (effectiveJob.payload.kind === "skillCollectionReview") {
		const result = state.deps.runSkillCollectionReview ? await state.deps.runSkillCollectionReview({
			agentId: resolveCronJobEffectiveAgentId(effectiveJob, state.deps.resolveDefaultAgentId?.() ?? state.deps.defaultAgentId),
			...abortSignal ? { abortSignal } : {}
		}) : {
			status: "skipped",
			summary: "skill collection review runner unavailable"
		};
		return triggerEval ? {
			...result,
			triggerEval
		} : result;
	}
	const heartbeatTask = isHeartbeatTaskCronJob(effectiveJob) ? effectiveJob : void 0;
	if (effectiveJob.payload.kind === "heartbeat" || heartbeatTask) {
		const agentId = resolveCronJobEffectiveAgentId(effectiveJob, state.deps.resolveDefaultAgentId?.() ?? state.deps.defaultAgentId);
		const heartbeatWake = heartbeatTask ? {
			source: "interval",
			intent: "task",
			reason: `heartbeat-task:${heartbeatTask.id}`,
			agentId,
			tasks: [{
				jobId: heartbeatTask.id,
				name: heartbeatTask.name,
				prompt: heartbeatTask.payload.text
			}]
		} : {
			source: "interval",
			intent: "scheduled",
			reason: "interval",
			agentId,
			scheduledEveryMs: effectiveJob.schedule.kind === "every" ? effectiveJob.schedule.everyMs : void 0
		};
		options?.onHeartbeatExecutionStarted?.(heartbeatWake);
		const releaseHeartbeatWait = markCronJobWaitingForHeartbeat(options?.activeJobMarker, options?.owningCronLaneTaskMarker);
		let heartbeatResult;
		try {
			heartbeatResult = await (state.deps.requestHeartbeatAndWait?.(heartbeatWake, abortSignal ? { abortSignal } : {}) ?? {
				status: "failed",
				reason: "heartbeat wake settlement unavailable"
			});
		} finally {
			releaseHeartbeatWait();
		}
		if (abortSignal?.aborted) return resolveAbortError();
		const result = heartbeatResult.status === "ran" ? {
			status: "ok",
			summary: heartbeatTask ? "heartbeat task completed" : "heartbeat completed"
		} : heartbeatResult.status === "failed" ? {
			status: "error",
			error: `heartbeat failed: ${heartbeatResult.reason}`
		} : {
			status: "skipped",
			error: `heartbeat skipped: ${heartbeatResult.reason}`
		};
		return triggerEval ? {
			...result,
			triggerEval
		} : result;
	}
	if (effectiveJob.sessionTarget === "main") {
		const result = await executeMainSessionCronJob(state, effectiveJob, abortSignal, waitWithAbort, options?.onHeartbeatExecutionStarted, options?.activeJobMarker, options?.owningCronLaneTaskMarker);
		return triggerEval ? {
			...result,
			triggerEval
		} : result;
	}
	const result = await executeDetachedCronJob(state, effectiveJob, abortSignal, resolveAbortError, options);
	return triggerEval ? {
		...result,
		triggerEval
	} : result;
}
async function executeMainSessionCronJob(state, job, abortSignal, waitWithAbort, onHeartbeatExecutionStarted, activeJobMarker, owningCronLaneTaskMarker) {
	const text = resolveJobPayloadTextForMain(job);
	if (!text) return {
		status: "skipped",
		error: job.payload.kind === "systemEvent" ? "main job requires non-empty systemEvent text" : "main job requires payload.kind=\"systemEvent\""
	};
	const agentId = resolveCronJobEffectiveAgentId(job, state.deps.resolveDefaultAgentId?.() ?? state.deps.defaultAgentId);
	const deliveryContext = resolveMainSessionCronDeliveryContext(state, job);
	const queuedSystemEvent = normalizeQueuedSystemEventHandle(enqueueCronSystemEvent(state, text, {
		agentId,
		contextKey: `cron:${job.id}`,
		...deliveryContext ? { deliveryContext } : {}
	}));
	const heartbeatWake = {
		source: "cron",
		intent: job.wakeMode === "now" ? "immediate" : "event",
		reason: `cron:${job.id}`,
		agentId,
		heartbeat: { target: "last" }
	};
	const removeQueuedSystemEvent = () => removeQueuedSystemEventHandle(state, job, queuedSystemEvent);
	if (job.wakeMode === "now" && state.deps.runHeartbeatOnce) {
		onHeartbeatExecutionStarted?.(heartbeatWake);
		const maxWaitMs = state.deps.wakeNowHeartbeatBusyMaxWaitMs ?? 12e4;
		const retryDelayMs = state.deps.wakeNowHeartbeatBusyRetryDelayMs ?? 250;
		const waitStartedAt = state.deps.nowMs();
		let heartbeatResult;
		for (;;) {
			if (abortSignal?.aborted) {
				removeQueuedSystemEvent();
				return {
					status: "error",
					error: timeoutErrorMessage()
				};
			}
			try {
				heartbeatResult = await state.deps.runHeartbeatOnce({
					...heartbeatWake,
					owningCronJobMarker: activeJobMarker,
					owningCronLaneTaskMarker
				});
			} catch (error) {
				removeQueuedSystemEvent();
				throw error;
			}
			if (abortSignal?.aborted) {
				removeQueuedSystemEvent();
				return {
					status: "error",
					error: timeoutErrorMessage()
				};
			}
			if (heartbeatResult.status !== "skipped" || !isRetryableHeartbeatSkipReason(heartbeatResult.reason)) break;
			const elapsedMs = heartbeatResult.reason === "cron-in-progress" ? maxWaitMs : state.deps.nowMs() - waitStartedAt;
			const delayMs = heartbeatResult.retryAtMs !== void 0 ? Math.max(0, heartbeatResult.retryAtMs - state.deps.nowMs()) : heartbeatResult.reason === "preempted" ? HEARTBEAT_IDLE_RETRY_GRACE_MS : retryDelayMs;
			if (elapsedMs >= maxWaitMs || delayMs > maxWaitMs - elapsedMs) {
				requestCronHeartbeat(state, heartbeatWake, heartbeatResult);
				return {
					status: "ok",
					summary: text
				};
			}
			await waitWithAbort(delayMs);
		}
		if (heartbeatResult.status === "ran") return {
			status: "ok",
			summary: text
		};
		removeQueuedSystemEvent();
		return {
			status: heartbeatResult.status === "skipped" ? "skipped" : "error",
			error: heartbeatResult.reason,
			summary: text
		};
	}
	if (abortSignal?.aborted) {
		removeQueuedSystemEvent();
		return {
			status: "error",
			error: timeoutErrorMessage()
		};
	}
	requestCronHeartbeat(state, heartbeatWake);
	return {
		status: "ok",
		summary: text
	};
}
async function executeDetachedCronJob(state, job, abortSignal, resolveAbortError, options) {
	if (job.payload.kind === "command") {
		if (!state.deps.runCommandJob) {
			const error = "cron command runner is not configured";
			return {
				status: "skipped",
				error,
				diagnostics: createCronRunDiagnosticsFromError("cron-preflight", error, {
					severity: "warn",
					nowMs: state.deps.nowMs
				})
			};
		}
		const res = await state.deps.runCommandJob({
			job,
			abortSignal
		});
		if (abortSignal?.aborted) {
			const error = abortErrorMessage(abortSignal);
			return {
				status: "error",
				error,
				diagnostics: createCronRunDiagnosticsFromError("cron-setup", error, { nowMs: state.deps.nowMs })
			};
		}
		return {
			status: res.status,
			error: res.error,
			errorClassification: res.errorClassification,
			deliveryError: res.deliveryError,
			deliverySuppressionReason: res.deliverySuppressionReason,
			deliveryState: res.deliveryState,
			summary: res.summary,
			delivered: res.delivered,
			deliveryAttempted: res.deliveryAttempted,
			delivery: res.delivery,
			diagnostics: res.diagnostics,
			failureNotificationDetail: res.failureNotificationDetail
		};
	}
	if (job.payload.kind !== "agentTurn") {
		const error = "isolated job requires payload.kind=\"agentTurn\" or \"command\"";
		return {
			status: "skipped",
			error,
			diagnostics: createCronRunDiagnosticsFromError("cron-preflight", error, {
				severity: "warn",
				nowMs: state.deps.nowMs
			})
		};
	}
	if (abortSignal?.aborted) {
		const aborted = resolveAbortError();
		return {
			...aborted,
			diagnostics: createCronRunDiagnosticsFromError("cron-setup", aborted.error, { nowMs: state.deps.nowMs })
		};
	}
	const res = await state.deps.runIsolatedAgentJob({
		job,
		message: job.payload.message,
		abortSignal,
		onExecutionStarted: options?.onExecutionStarted,
		onExecutionPhase: options?.onExecutionPhase,
		onLaneWait: options?.onLaneWait,
		executionIdentity: options?.executionIdentity
	});
	if (abortSignal?.aborted) {
		const error = abortErrorMessage(abortSignal);
		return {
			status: "error",
			error,
			diagnostics: createCronRunDiagnosticsFromError("cron-setup", error, { nowMs: state.deps.nowMs })
		};
	}
	return {
		status: res.status,
		error: res.error,
		errorClassification: res.errorClassification,
		executionStarted: res.executionStarted,
		deliveryError: res.deliveryError,
		deliverySuppressionReason: res.deliverySuppressionReason,
		deliveryState: res.deliveryState,
		nextCheck: res.nextCheck,
		summary: res.summary,
		delivered: res.delivered,
		deliveryAttempted: res.deliveryAttempted,
		delivery: res.delivery,
		sessionId: res.sessionId,
		sessionKey: res.sessionKey,
		diagnostics: res.diagnostics,
		failureNotificationDetail: res.failureNotificationDetail,
		model: res.model,
		provider: res.provider,
		usage: res.usage
	};
}
async function executeScriptCronJob(state, job, abortSignal, activeJobMarker, streamBatch, assertRunCurrent) {
	if (state.deps.cronConfig?.triggers?.enabled === false) return {
		status: "error",
		error: "cron script payload execution is disabled because the operator set cron.triggers.enabled: false; remove it or set it to true to allow unattended scripts"
	};
	if (!state.deps.runScriptJob) return {
		status: "error",
		error: "cron script payload executor is unavailable",
		...cronScriptFailureMetadata("payload", "runtime_unavailable")
	};
	const result = await state.deps.runScriptJob({
		job,
		streamBatch,
		abortSignal
	});
	if (!isCronActiveJobMarkerCurrent(activeJobMarker)) return {
		status: "error",
		error: "Gateway restarting."
	};
	if (abortSignal?.aborted) return {
		status: "error",
		error: abortErrorMessage(abortSignal)
	};
	assertRunCurrent?.();
	if (result.status !== "ok") return result;
	if (result.nextCheck && !job.pacing) return {
		status: "error",
		error: "cron script payload returned nextCheck, but this job has no pacing bounds",
		...cronScriptFailureMetadata("payload", "invalid_input")
	};
	const notify = result.notify?.trim() ? result.notify : void 0;
	if (job.sessionTarget === "main" && notify || result.wake) {
		const agentId = resolveCronJobEffectiveAgentId(job, state.deps.resolveDefaultAgentId?.() ?? state.deps.defaultAgentId);
		const deliveryContext = job.sessionTarget === "main" ? resolveMainSessionCronDeliveryContext(state, job) : void 0;
		const eventOptions = {
			agentId,
			...deliveryContext ? { deliveryContext } : {}
		};
		if (job.sessionTarget === "main" && notify) enqueueCronSystemEvent(state, notify, {
			...eventOptions,
			contextKey: `cron:${job.id}:script`
		});
		if (result.wake) {
			if (job.sessionTarget !== "main" || !notify) enqueueCronSystemEvent(state, notify ?? `script job ${job.name} completed`, {
				...eventOptions,
				contextKey: `cron:${job.id}:script-wake`
			});
			requestCronHeartbeat(state, {
				source: result.wake === "now" ? "notifications-event" : "cron",
				intent: result.wake === "now" ? "immediate" : "event",
				reason: result.wake === "now" ? "wake" : `cron:${job.id}:script`,
				agentId
			});
		}
	}
	return {
		status: "ok",
		...notify ? { summary: notify } : {},
		delivered: result.delivered,
		deliveryAttempted: result.deliveryAttempted,
		deliveryError: result.deliveryError,
		deliverySuppressionReason: result.deliverySuppressionReason,
		deliveryState: result.deliveryState,
		delivery: result.delivery,
		nextCheck: result.nextCheck,
		scriptStateChanged: result.stateChanged === true,
		...result.stateChanged === true ? { scriptState: result.state } : {}
	};
}
/** Clears the currently armed cron timer. */
function stopTimer(state) {
	if (state.timer) clearTimeout(state.timer);
	state.timer = null;
}
//#endregion
//#region src/cron/session-reaper.ts
/** Prunes expired per-run cron sessions and archives unreferenced transcripts. */
const DEFAULT_RETENTION_MS = 864e5;
/** Minimum interval between reaper sweeps (avoid running every timer tick). */
const MIN_SWEEP_INTERVAL_MS = 3e5;
const lastSweepAtMsByTarget = /* @__PURE__ */ new Map();
function reaperTargetKey(agentId, storePath) {
	return `${normalizeAgentId(agentId)}\0${path.resolve(storePath)}`;
}
/** Resolves cron run-session retention; `false` disables pruning, bad strings fall back safely. */
function resolveRetentionMs(cronConfig) {
	if (cronConfig?.sessionRetention === false) return null;
	const raw = cronConfig?.sessionRetention;
	if (typeof raw === "string" && raw.trim()) try {
		const ms = parseDurationMs(raw.trim(), { defaultUnit: "h" });
		if (ms <= 0) return null;
		return ms;
	} catch {
		return DEFAULT_RETENTION_MS;
	}
	return DEFAULT_RETENTION_MS;
}
/** Removes the reusable base session whose owning isolated cron job was deleted. */
async function removeCronJobBaseSession(params) {
	const sessionKey = resolveCronAgentSessionKey({
		agentId: params.agentId,
		sessionKey: `cron:${params.jobId}`
	});
	const existing = loadExactSessionEntryReadOnly({
		storePath: params.sessionStorePath,
		sessionKey
	})?.entry;
	if (!existing) return false;
	return (await applySessionEntryLifecycleMutation({
		agentId: params.agentId,
		storePath: params.sessionStorePath,
		removals: [{
			sessionKey,
			archiveRemovedTranscript: true,
			expectedEntry: existing
		}]
	})).removedEntries > 0;
}
// v-gateway-fullread-hotpaths-v1: list keys only (no entry JSON), keep cron run keys, then read just
// those rows (full projection, one snapshot) in key order, as the whole-store read returned them.
function listCronRunSessionEntries(scope) {
	if (process.env.OPENCLAW_V_FULLREAD_HOTPATHS === "0") return listSessionEntriesCore(scope);
	const keys = listSessionEntryKeysReadOnly(scope).filter((sessionKey) => isCronRunSessionKey(sessionKey));
	return keys.length === 0 ? [] : loadExactSessionEntriesReadOnly({
		...scope,
		projection: "full"
	}, keys);
}
/**
* Sweeps completed isolated cron run sessions while preserving base cron sessions.
*
* Must run outside the cron service `locked()` section because this acquires
* the session-store file lock; reversing that order can deadlock timer ticks.
*/
async function sweepCronRunSessions(params) {
	const retentionMs = resolveRetentionMs(params.cronConfig);
	if (retentionMs === null) return {
		swept: false,
		pruned: 0
	};
	const now = params.nowMs ?? Date.now();
	const storePath = params.sessionStorePath;
	const targetKey = reaperTargetKey(params.agentId, storePath);
	const lastSweepAtMs = lastSweepAtMsByTarget.get(targetKey) ?? 0;
	if (!params.force && now >= lastSweepAtMs && now - lastSweepAtMs < MIN_SWEEP_INTERVAL_MS) return {
		swept: false,
		pruned: 0
	};
	lastSweepAtMsByTarget.set(targetKey, now);
	let pruned = 0;
	let transcriptCleanupError;
	try {
		const cutoff = now - retentionMs;
		const requestedOwner = normalizeAgentId(params.agentId);
		let pendingMediaSessionKeys;
		const removals = [];
		for (const { sessionKey, entry } of listCronRunSessionEntries({
			agentId: params.agentId,
			storePath
		})) {
			if (!isCronRunSessionKey(sessionKey)) continue;
			const scopedOwner = parseAgentSessionKey(sessionKey)?.agentId;
			if (!scopedOwner || normalizeAgentId(scopedOwner) !== requestedOwner) continue;
			if ((entry.updatedAt ?? 0) >= cutoff) continue;
			if (entry.cronRunContinuation) {
				pendingMediaSessionKeys ??= buildPendingGeneratedMediaSessionKeySet();
				if (pendingMediaSessionKeys.has(sessionKey)) continue;
			}
			removals.push({
				sessionKey,
				expectedEntry: entry,
				...entry.sessionId ? { expectedSessionId: entry.sessionId } : {},
				expectedUpdatedAt: entry.updatedAt,
				archiveRemovedTranscript: true
			});
		}
		if (removals.length > 0) {
			const archiveRetentionMs = resolveMaintenanceConfig().resetArchiveRetentionMs;
			const result = await applySessionEntryLifecycleMutation({
				agentId: params.agentId,
				storePath,
				removals,
				...archiveRetentionMs == null ? {} : { cleanupArchivedTranscripts: {
					rules: [{
						reason: "deleted",
						olderThanMs: archiveRetentionMs
					}],
					nowMs: now
				} },
				captureArtifactCleanupError: true
			});
			pruned = result.removedEntries;
			transcriptCleanupError = result.artifactCleanupError;
		}
	} catch (err) {
		params.log.warn({ err: String(err) }, "cron-reaper: failed to sweep session store");
		return {
			swept: false,
			pruned: 0
		};
	}
	if (transcriptCleanupError) params.log.warn({ err: formatErrorMessage(transcriptCleanupError) }, "cron-reaper: transcript cleanup failed");
	if (pruned > 0) params.log.info({
		pruned,
		retentionMs
	}, `cron-reaper: pruned ${pruned} expired cron run session(s)`);
	return {
		swept: true,
		pruned
	};
}
/** Resets per-target reaper throttles between tests. */
function resetReaperThrottle() {
	lastSweepAtMsByTarget.clear();
}
if (process.env.VITEST || false) globalThis[Symbol.for("openclaw.cronSessionReaperTestApi")] = { resetReaperThrottle };
//#endregion
//#region src/cron/service/run-admission-capacity.ts
function resolveRunConcurrency() {
	return 8;
}
function acquireCronRunSlot(state) {
	state.runAdmission.active += 1;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		state.runAdmission.active -= 1;
		dispatchWaiters(state);
	};
}
function dispatchWaiters(state) {
	const admission = state.runAdmission;
	if (state.stopped) {
		cancelCronRunAdmissionWaiters(state);
		return;
	}
	const maxConcurrentRuns = resolveRunConcurrency();
	while (admission.active < maxConcurrentRuns) {
		const waiter = admission.waiters.shift();
		if (!waiter) break;
		waiter(acquireCronRunSlot(state));
	}
	if (admission.active < maxConcurrentRuns && admission.waiters.length === 0) {
		const listener = admission.capacityListener;
		admission.capacityListener = null;
		if (listener) queueMicrotask(listener);
	}
}
/**
* Acquire only the slots currently available to scheduled work. Unlike the
* waiter-based path used by direct runs, this never retains a timer batch while
* the pool is saturated.
*/
function tryAcquireCronRunSlots(state, requested) {
	if (state.stopped || requested <= 0 || state.runAdmission.waiters.length > 0) return [];
	const available = Math.max(0, resolveRunConcurrency() - state.runAdmission.active);
	return Array.from({ length: Math.min(requested, available) }, () => acquireCronRunSlot(state));
}
/** Keep the first wake-up until capacity release consumes or cancellation clears it. */
function setCronRunCapacityListener(state, listener) {
	state.runAdmission.capacityListener ??= listener;
}
async function acquireCronRunAdmission(state) {
	const admission = state.runAdmission;
	if (state.stopped) return null;
	if (admission.waiters.length === 0 && admission.active < resolveRunConcurrency()) return acquireCronRunSlot(state);
	return await new Promise((resolve) => {
		admission.waiters.push(resolve);
	});
}
/** Wake queued work on stop so each caller can release its durable reservation. */
function cancelCronRunAdmissionWaiters(state) {
	state.runAdmission.capacityListener = null;
	const waiters = state.runAdmission.waiters.splice(0);
	for (const waiter of waiters) waiter(null);
}
/** Apply one service-level cap to every cron execution source. Queue waiters
* keep their job reservation, then recheck scheduler state before execution.
*/
async function runWithCronAdmission(state, execute, acquiredRelease) {
	const release = acquiredRelease ?? await acquireCronRunAdmission(state);
	if (!release) return { kind: "stopped" };
	try {
		return {
			kind: "admitted",
			value: await execute()
		};
	} finally {
		release();
	}
}
//#endregion
//#region src/cron/service/agent-watchdog.ts
const CRON_TIMEOUT_CLEANUP_GUARD_MS = 2e4;
const CRON_AGENT_SETUP_WATCHDOG_MS = 6e4;
const CRON_AGENT_PRE_EXECUTION_WATCHDOG_MS = 6e4;
const CRON_AGENT_PRE_EXECUTION_MIN_WATCHDOG_MS = 1e3;
const CRON_AGENT_PHASE_WATCHDOG_STAGE = {
	runner_entered: "pre_execution",
	workspace: "pre_execution",
	runtime_plugins: "pre_execution",
	before_agent_reply: "execution",
	model_resolution: "pre_execution",
	auth: "pre_execution",
	context_engine: "pre_execution",
	attempt_dispatch: "execution",
	context_assembled: "execution",
	turn_accepted: "execution",
	process_spawned: "execution",
	tool_execution_started: "execution",
	assistant_output_started: "execution",
	model_call_started: "execution"
};
/** Tracks isolated-agent setup/execution progress and fires the correct cron timeout reason. */
function createCronAgentWatchdog(params) {
	let state = params.deferUntilRunner ? "waiting_for_runner" : "executing";
	let timeoutId;
	let setupTimeoutId;
	let preExecutionTimeoutId;
	let activeExecution;
	let observedLaneWait = false;
	let waitingForLane = false;
	const setTimedOut = (reason) => {
		if (state === "timed_out" || state === "disposed") return;
		state = "timed_out";
		params.triggerTimeout(reason);
	};
	const startTimeout = () => {
		if (timeoutId || state === "disposed") return;
		timeoutId = setTimeout(() => {
			setTimedOut(timeoutErrorMessage(activeExecution));
		}, params.jobTimeoutMs);
	};
	const clearSetupTimeout = () => {
		if (!setupTimeoutId) return;
		clearTimeout(setupTimeoutId);
		setupTimeoutId = void 0;
	};
	const startSetupTimeout = () => {
		if (setupTimeoutId || state !== "waiting_for_runner" || waitingForLane) return;
		setupTimeoutId = setTimeout(() => {
			if (state === "waiting_for_runner" && !waitingForLane) setTimedOut(setupTimeoutErrorMessage(activeExecution));
		}, CRON_AGENT_SETUP_WATCHDOG_MS);
	};
	const clearPreExecutionTimeout = () => {
		if (!preExecutionTimeoutId) return;
		clearTimeout(preExecutionTimeoutId);
		preExecutionTimeoutId = void 0;
	};
	const isWaitingForExecution = () => state === "waiting_for_initial_progress" || state === "waiting_for_fallback_execution";
	const startPreExecutionTimeout = () => {
		if (preExecutionTimeoutId || !isWaitingForExecution()) return;
		preExecutionTimeoutId = setTimeout(() => {
			if (isWaitingForExecution()) setTimedOut(preExecutionTimeoutErrorMessage(activeExecution));
		}, resolveCronAgentPreExecutionWatchdogMs(params.jobTimeoutMs));
	};
	const noteExecutionProgress = (info) => {
		if (!info) return;
		activeExecution = {
			...activeExecution,
			...info
		};
		const stage = info.phase ? CRON_AGENT_PHASE_WATCHDOG_STAGE[info.phase] : void 0;
		if (state === "waiting_for_initial_progress" && info.phase !== void 0 && info.phase !== "runner_entered" || state === "waiting_for_fallback_execution" && stage === "execution") {
			state = "executing";
			clearPreExecutionTimeout();
		}
	};
	return {
		start: () => {
			if (params.deferUntilRunner) {
				startSetupTimeout();
				return;
			}
			startTimeout();
		},
		replaceTimeout: (timeoutMs) => {
			if (timeoutId) clearTimeout(timeoutId);
			timeoutId = timeoutMs !== void 0 && state !== "timed_out" && state !== "disposed" ? setTimeout(() => setTimedOut(timeoutErrorMessage(activeExecution)), timeoutMs) : void 0;
		},
		noteLaneWait: () => {
			if (state === "waiting_for_runner") {
				observedLaneWait = true;
				waitingForLane = true;
				clearSetupTimeout();
			}
		},
		noteLaneAdmitted: () => {
			if (state === "waiting_for_runner") {
				observedLaneWait = false;
				waitingForLane = false;
				startSetupTimeout();
			}
		},
		noteRunnerStarted: (info) => {
			if (state === "disposed" || state === "timed_out") return;
			clearSetupTimeout();
			startTimeout();
			if (info?.isFallback === true) {
				clearPreExecutionTimeout();
				state = "waiting_for_fallback_execution";
			} else if (state === "waiting_for_runner") state = "waiting_for_initial_progress";
			noteExecutionProgress(info);
			startPreExecutionTimeout();
		},
		notePhase: (info) => {
			if (state === "disposed" || state === "timed_out") return;
			noteExecutionProgress(info);
		},
		activeExecution: () => activeExecution,
		observedLaneWait: () => observedLaneWait,
		dispose: () => {
			state = "disposed";
			if (timeoutId) clearTimeout(timeoutId);
			clearSetupTimeout();
			clearPreExecutionTimeout();
		}
	};
}
/** Runs timeout cleanup with a guard so stuck cleanup cannot block the cron lane. */
async function cleanupTimedOutCronAgentRun(state, job, timeoutMs, execution) {
	if (!state.deps.cleanupTimedOutAgentRun) return;
	let settleTimer;
	const cleanupPromise = state.deps.cleanupTimedOutAgentRun({
		job,
		timeoutMs,
		execution
	});
	const settleTimeout = new Promise((resolve) => {
		settleTimer = setTimeout(resolve, CRON_TIMEOUT_CLEANUP_GUARD_MS);
	});
	try {
		await Promise.race([cleanupPromise, settleTimeout]);
	} catch (err) {
		state.deps.log.warn({
			jobId: job.id,
			err: String(err)
		}, "cron: timed-out agent cleanup failed");
	} finally {
		if (settleTimer) clearTimeout(settleTimer);
	}
}
function resolveCronAgentPreExecutionWatchdogMs(jobTimeoutMs) {
	return Math.max(CRON_AGENT_PRE_EXECUTION_MIN_WATCHDOG_MS, Math.min(CRON_AGENT_PRE_EXECUTION_WATCHDOG_MS, Math.floor(jobTimeoutMs / 2)));
}
//#endregion
//#region src/cron/service/timeout-policy.ts
/** Resolves cron job wall-clock timeout policy. */
/**
* Maximum wall-clock time for a single job execution. Acts as a safety net
* on top of per-provider/per-agent timeouts to prevent one stuck job from
* wedging the entire cron lane.
*/
const DEFAULT_JOB_TIMEOUT_MS = 6e5;
/**
* Agent turns can legitimately run much longer than generic cron jobs.
* Use a larger safety ceiling when no explicit timeout is set.
*/
const AGENT_TURN_SAFETY_TIMEOUT_MS = 36e5;
/** Resolves the wall-clock timeout for a cron job, including explicit detached-run overrides. */
function resolveCronJobTimeoutMs(job) {
	const configuredTimeoutMs = (job.payload.kind === "agentTurn" || job.payload.kind === "command" || job.payload.kind === "script") && typeof job.payload.timeoutSeconds === "number" ? finiteSecondsToTimerSafeMilliseconds(job.payload.timeoutSeconds) ?? 0 : void 0;
	if (configuredTimeoutMs === void 0) return job.payload.kind === "agentTurn" ? AGENT_TURN_SAFETY_TIMEOUT_MS : DEFAULT_JOB_TIMEOUT_MS;
	return configuredTimeoutMs <= 0 ? void 0 : configuredTimeoutMs;
}
//#endregion
//#region src/cron/service/timer-job-runner.interruption.ts
function withPrimaryWebhookTrace(params) {
	const plan = resolveCronDeliveryPlan(params.job);
	const intended = params.result.delivery?.intended ?? {
		to: plan.to,
		source: "explicit"
	};
	return {
		...params.result,
		deliveryState: {
			status: params.delivered ? "delivered" : "not-delivered",
			delivered: params.delivered,
			error: params.error,
			deliverySuppressionReason: params.deliverySuppressionReason,
			failureNotification: { status: "not-requested" }
		},
		delivered: params.delivered,
		deliverySuppressionReason: params.deliverySuppressionReason,
		deliveryAttempted: params.deliverySuppressionReason === void 0,
		...params.error ? { deliveryError: params.error } : { deliveryError: void 0 },
		delivery: {
			...params.result.delivery,
			intended,
			delivered: params.delivered,
			resolved: {
				to: plan.to,
				source: "explicit",
				ok: params.delivered,
				...params.error ? { error: params.error } : {}
			}
		}
	};
}
function withPrimaryWebhookInterruption(params) {
	return resolveCronDeliveryPlan(params.job).mode === "webhook" && params.result.triggerEval?.fired !== false ? withPrimaryWebhookTrace({
		...params,
		delivered: false
	}) : params.result;
}
function resolveInterruptedRunProgress(params) {
	if (params.progress.settledDeliveryResult) return params.progress.settledDeliveryResult;
	if (params.progress.completedCoreResult) return withPrimaryWebhookInterruption({
		job: params.job,
		result: params.progress.completedCoreResult,
		error: params.error
	});
}
//#endregion
//#region src/cron/service/timer-job-runner.ts
async function deliverPrimaryWebhook(state, job, result, abortSignal, progress, assertRunCurrent) {
	const settle = (settledResult) => {
		progress.settledDeliveryResult ??= settledResult;
		return progress.settledDeliveryResult;
	};
	if (resolveCronDeliveryPlan(job).mode !== "webhook" || result.triggerEval?.fired === false) return result;
	if (result.status !== "error" && !(typeof result.summary === "string" && result.summary.trim())) return settle(withPrimaryWebhookTrace({
		job,
		result,
		delivered: false,
		deliverySuppressionReason: "empty"
	}));
	if (!state.deps.sendCronWebhook) return withPrimaryWebhookTrace({
		job,
		result,
		delivered: false,
		error: "cron webhook delivery is unavailable"
	});
	const interruptionError = () => {
		const reason = abortErrorMessage(abortSignal);
		return abortSignal.reason instanceof Error && abortSignal.reason.name === "TimeoutError" ? `cron webhook delivery timed out: ${reason}` : `cron webhook delivery cancelled: ${reason}`;
	};
	if (abortSignal.aborted) return withPrimaryWebhookTrace({
		job,
		result,
		delivered: false,
		error: interruptionError()
	});
	assertRunCurrent?.();
	const startedAt = job.state.runningAtMs;
	const deliveredResult = withPrimaryWebhookTrace({
		job,
		result,
		delivered: true
	});
	try {
		await state.deps.sendCronWebhook({
			job,
			abortSignal,
			onDeliveryAccepted: () => {
				settle(deliveredResult);
			},
			event: {
				jobId: job.id,
				action: "finished",
				job,
				...typeof startedAt === "number" ? { runAtMs: startedAt } : {},
				...typeof startedAt === "number" ? { durationMs: Math.max(0, state.deps.nowMs() - startedAt) } : {},
				status: result.status,
				error: result.error,
				summary: result.summary,
				diagnostics: result.diagnostics,
				delivered: true,
				deliveryStatus: "delivered",
				delivery: deliveredResult.delivery,
				sessionId: result.sessionId,
				sessionKey: result.sessionKey,
				model: result.model,
				provider: result.provider,
				usage: result.usage
			}
		});
		if (progress.settledDeliveryResult) return progress.settledDeliveryResult;
		if (abortSignal.aborted) return withPrimaryWebhookTrace({
			job,
			result,
			delivered: false,
			error: interruptionError()
		});
		return settle(deliveredResult);
	} catch (error) {
		if (progress.settledDeliveryResult) return progress.settledDeliveryResult;
		const deliveryError = abortSignal.aborted ? interruptionError() : formatErrorMessage(error);
		state.deps.log.warn({
			jobId: job.id,
			err: deliveryError
		}, "cron: webhook delivery failed");
		return settle(withPrimaryWebhookTrace({
			job,
			result,
			delivered: false,
			error: deliveryError
		}));
	}
}
/**
* Carries the already-resolved run attribution from watchdog-visible execution
* state into a timer-built error outcome. The wall-clock/cancel paths return
* their own outcome (the inner run result loses the Promise.race), so without
* this the persisted cron run record drops provider/model/session for a
* post-runner timeout or cancel even though they were already known. Stays
* empty before the runner starts, so pre-execution setup timeouts read blank.
*/
function cronRunAttributionFromExecution(execution) {
	if (!execution) return {};
	return {
		provider: execution.provider,
		model: execution.model,
		sessionId: execution.sessionId,
		sessionKey: execution.sessionKey
	};
}
/** Executes cron job core logic with the configured wall-clock timeout and watchdog cleanup. */
async function executeJobCoreWithTimeoutUnfinalized(state, job, opts) {
	const runAbortController = new AbortController();
	const assertRunCurrent = opts?.runReceipt ? () => assertServiceCronRunReceiptCurrent(state, opts.runReceipt) : void 0;
	const trackRunSettlement = (settlement) => {
		if (opts?.runReceipt) trackServiceCronRunReceiptSettlement({
			state,
			handle: opts.runReceipt,
			settlement
		});
		trackActiveCronTaskRunSettlement(settlement, runAbortController.signal);
	};
	const operatorCancellationMarker = Symbol("cron-operator-cancelled");
	let resolveOperatorCancellation;
	const operatorCancellationPromise = new Promise((resolve) => {
		resolveOperatorCancellation = resolve;
	});
	const createOperatorCancellationOutcome = (execution) => {
		const error = abortErrorMessage(runAbortController.signal);
		return withPrimaryWebhookInterruption({
			job,
			result: {
				status: "error",
				error,
				...cronRunAttributionFromExecution(execution),
				diagnostics: createCronRunDiagnosticsFromError("cron-setup", error, { nowMs: state.deps.nowMs })
			},
			error: `cron webhook delivery cancelled: ${error}`
		});
	};
	const reservation = opts?.runReceipt ? state.queuedRunReservationsByJobId.get(job.id) : void 0;
	if (!isCronActiveJobMarkerCurrent(opts?.activeJobMarker) || opts?.runReceipt && (reservation?.runReceipt.receiptId !== opts.runReceipt.receiptId || reservation.lifecycleGeneration !== state.lifecycleGeneration)) {
		runAbortController.abort("Gateway restarting.");
		return createOperatorCancellationOutcome();
	}
	const releaseCronTaskRun = runsDetachedFromMainSession(job) ? registerActiveCronTaskRun({
		runId: opts?.runId ?? `cron-active:${job.id}`,
		controller: runAbortController,
		activeJobMarker: opts?.activeJobMarker,
		onCancel: () => resolveOperatorCancellation?.(operatorCancellationMarker)
	}) : void 0;
	const recordTaskExecutionStart = (info) => {
		tryUpdateCronTaskRunSession(state, opts?.runId, info?.sessionKey);
	};
	const jobTimeoutMs = resolveCronJobTimeoutMs(job);
	try {
		if (typeof jobTimeoutMs !== "number") {
			let activeExecution;
			const accumulateExecution = (info) => {
				if (info) activeExecution = {
					...activeExecution,
					...info
				};
			};
			const noteExecutionStarted = (info) => {
				accumulateExecution(info);
				recordTaskExecutionStart(info);
			};
			const progress = {};
			const coreOptions = {
				activeJobMarker: opts?.activeJobMarker,
				owningCronLaneTaskMarker: opts?.owningCronLaneTaskMarker,
				streamBatch: opts?.streamBatch,
				streamScheduleKey: opts?.streamScheduleKey,
				streamSourceIdentity: opts?.streamSourceIdentity,
				onExecutionStarted: noteExecutionStarted,
				onExecutionPhase: accumulateExecution,
				assertRunCurrent,
				executionIdentity: opts?.executionIdentity
			};
			const runPromise = executeJobCore(state, job, runAbortController.signal, coreOptions).then(async (result) => {
				progress.completedCoreResult = result;
				return await deliverPrimaryWebhook(state, job, result, runAbortController.signal, progress, assertRunCurrent);
			});
			trackRunSettlement(runPromise);
			runPromise.catch((err) => {
				if (runAbortController.signal.aborted) state.deps.log.warn({
					jobId: job.id,
					err: String(err)
				}, "cron: job core rejected after cancellation abort");
			});
			const first = await Promise.race([runPromise, operatorCancellationPromise]);
			if (first !== operatorCancellationMarker) return first;
			const settled = resolveInterruptedRunProgress({
				progress,
				job,
				error: `cron webhook delivery cancelled: ${abortErrorMessage(runAbortController.signal)}`
			});
			if (settled) return settled;
			return createOperatorCancellationOutcome(activeExecution);
		}
		let timeoutReason;
		const timeoutMarker = Symbol("cron-timeout");
		let resolveTimeout;
		const timeoutPromise = new Promise((resolve) => {
			resolveTimeout = resolve;
		});
		const deferTimeoutUntilExecutionStart = job.sessionTarget !== "main" && job.payload.kind === "agentTurn";
		const triggerTimeout = (reason) => {
			timeoutReason = reason;
			if (!runAbortController.signal.aborted) {
				const timeoutError = new Error(reason);
				timeoutError.name = "TimeoutError";
				runAbortController.abort(timeoutError);
			}
			resolveTimeout?.(timeoutMarker);
		};
		const watchdog = createCronAgentWatchdog({
			deferUntilRunner: deferTimeoutUntilExecutionStart,
			jobTimeoutMs,
			triggerTimeout
		});
		const noteLaneState = (info) => {
			if (info?.waiting === false) {
				watchdog.noteLaneAdmitted();
				return;
			}
			watchdog.noteLaneWait();
		};
		const noteRunnerStarted = (info) => {
			watchdog.noteRunnerStarted(info);
			recordTaskExecutionStart(info);
		};
		const resolveHeartbeatTimeoutMs = state.deps.resolveHeartbeatTimeoutMs;
		const progress = {};
		const coreOptions = {
			activeJobMarker: opts?.activeJobMarker,
			owningCronLaneTaskMarker: opts?.owningCronLaneTaskMarker,
			streamBatch: opts?.streamBatch,
			streamScheduleKey: opts?.streamScheduleKey,
			streamSourceIdentity: opts?.streamSourceIdentity,
			onExecutionStarted: deferTimeoutUntilExecutionStart ? noteRunnerStarted : void 0,
			onExecutionPhase: deferTimeoutUntilExecutionStart ? watchdog.notePhase : void 0,
			onLaneWait: deferTimeoutUntilExecutionStart ? noteLaneState : void 0,
			onHeartbeatExecutionStarted: resolveHeartbeatTimeoutMs ? (heartbeat) => watchdog.replaceTimeout(resolveHeartbeatTimeoutMs(heartbeat)) : void 0,
			assertRunCurrent,
			executionIdentity: opts?.executionIdentity
		};
		watchdog.start();
		const runPromise = executeJobCore(state, job, runAbortController.signal, coreOptions).then(async (result) => {
			progress.completedCoreResult = result;
			return await deliverPrimaryWebhook(state, job, result, runAbortController.signal, progress, assertRunCurrent);
		});
		trackRunSettlement(runPromise);
		runPromise.catch((err) => {
			if (runAbortController.signal.aborted) state.deps.log.warn({
				jobId: job.id,
				err: String(err)
			}, "cron: job core rejected after timeout abort");
		});
		try {
			const first = await Promise.race([
				runPromise,
				timeoutPromise,
				operatorCancellationPromise
			]);
			if (first === operatorCancellationMarker) {
				const settled = resolveInterruptedRunProgress({
					progress,
					job,
					error: `cron webhook delivery cancelled: ${abortErrorMessage(runAbortController.signal)}`
				});
				if (settled) return settled;
				return createOperatorCancellationOutcome(watchdog.activeExecution());
			}
			if (first !== timeoutMarker) return first;
			const activeExecution = watchdog.activeExecution();
			const settled = resolveInterruptedRunProgress({
				progress,
				job,
				error: `cron webhook delivery timed out: ${timeoutReason ?? timeoutErrorMessage(activeExecution)}`
			});
			if (settled) return settled;
			await cleanupTimedOutCronAgentRun(state, job, jobTimeoutMs, activeExecution);
			const error = timeoutReason ?? timeoutErrorMessage(activeExecution);
			const observedLaneWait = watchdog.observedLaneWait();
			const isolatedAgentSetupTimeout = job.sessionTarget === "isolated" && isSetupTimeoutErrorText(error) && !observedLaneWait ? {
				error,
				timeoutMs: CRON_AGENT_SETUP_WATCHDOG_MS,
				otherCronJobsActiveAtTimeout: false
			} : void 0;
			return withPrimaryWebhookInterruption({
				job,
				result: {
					status: "error",
					error,
					...cronRunAttributionFromExecution(activeExecution),
					diagnostics: createCronRunDiagnosticsFromError("cron-setup", error, { nowMs: state.deps.nowMs }),
					...isolatedAgentSetupTimeout ? { isolatedAgentSetupTimeout } : {}
				},
				error: `cron webhook delivery timed out: ${error}`
			});
		} finally {
			watchdog.dispose();
		}
	} finally {
		releaseCronTaskRun?.();
	}
}
function authorCronRunCompletion(_state, job, result) {
	const deliveryState = result.deliveryState ?? resolveDeliveryState({
		job,
		runStatus: result.status,
		delivery: result.delivery,
		delivered: result.delivered,
		deliveryAttempted: result.deliveryAttempted,
		error: result.deliveryError ?? result.error,
		deliverySuppressionReason: result.deliverySuppressionReason
	});
	return {
		...result,
		deliveryState,
		completionStatus: resolveAdmittedCronCompletionStatus(job, result.status, deliveryState.status, deliveryState.deliverySuppressionReason)
	};
}
/** Authors completion after execution and primary delivery have both settled. */
async function executeJobCoreWithTimeout(state, job, opts) {
	return authorCronRunCompletion(state, job, await executeJobCoreWithTimeoutUnfinalized(state, job, opts));
}
//#endregion
//#region src/cron/service/timer-runnable.ts
/**
* Reports whether a cron job's last completed run is older than its previous
* effective slot, which is how restart catch-up detects a missed run once
* nextRunAtMs has already advanced past it.
*/
function hasMissedCronSlotSinceLastRun(job, nowMs) {
	const lastRunAtMs = job.state.lastRunAtMs;
	if (typeof lastRunAtMs !== "number" || !Number.isFinite(lastRunAtMs)) return false;
	let previousRunAtMs;
	try {
		previousRunAtMs = computeJobPreviousRunAtOrBeforeMs(job, nowMs);
	} catch {
		return false;
	}
	if (typeof previousRunAtMs !== "number" || !Number.isFinite(previousRunAtMs) || previousRunAtMs <= lastRunAtMs) return false;
	const activatedAtMs = job.state.scheduleActivatedAtMs;
	if (typeof activatedAtMs !== "number" || !Number.isFinite(activatedAtMs)) return true;
	return previousRunAtMs > activatedAtMs;
}
function isRunnableJob(params) {
	const { job, nowMs } = params;
	if (!job.state) job.state = {};
	if (!isJobEnabled(job)) return false;
	if (params.skipJobIds?.has(job.id)) return false;
	if (hasActiveCronRun(job)) return false;
	const next = job.state.nextRunAtMs;
	if (hasScheduledNextRunAtMs(next) && nowMs < next && (!params.allowCronMissedRunByLastRun || job.state.startupCatchupAtMs === next)) return false;
	const lastRunStatus = resolveJobLastRunStatus(job);
	if (params.skipAtIfAlreadyRan && job.schedule.kind === "at" && lastRunStatus) {
		if (hasScheduledNextRunAtMs(next) && job.state.startupCatchupAtMs === next) return nowMs >= next;
		const lastRun = job.state.lastRunAtMs;
		const nextRun = job.state.nextRunAtMs;
		if (typeof lastRun === "number" && typeof nextRun === "number" && nextRun > lastRun && parseAbsoluteTimeMs(job.schedule.at) === nextRun) return nowMs >= nextRun;
		if (isScheduledTerminalOneShotRetry(job, lastRunStatus, lastRun, nextRun)) return typeof nextRun === "number" && nowMs >= nextRun;
		return false;
	}
	if (isErrorBackoffPending(job, nowMs, lastRunStatus)) return false;
	if (hasScheduledNextRunAtMs(next) && nowMs >= next) {
		const lastRunAtMs = job.state.lastRunAtMs;
		if (!(params.allowCronMissedRunByLastRun && job.schedule.kind === "cron" && (lastRunStatus === "ok" || lastRunStatus === "skipped") && typeof lastRunAtMs === "number" && Number.isFinite(lastRunAtMs) && lastRunAtMs >= next)) return true;
		let latestRunAtMs;
		try {
			latestRunAtMs = computeJobPreviousRunAtOrBeforeMs(job, nowMs);
		} catch {
			return false;
		}
		return typeof latestRunAtMs === "number" && latestRunAtMs > lastRunAtMs;
	}
	if (!params.allowCronMissedRunByLastRun || job.schedule.kind !== "cron") return false;
	return hasMissedCronSlotSinceLastRun(job, nowMs);
}
function isErrorBackoffPending(job, nowMs, lastRunStatus) {
	if (job.schedule.kind === "at" || lastRunStatus !== "error") return false;
	const backoffUntilMs = resolveJobErrorBackoffUntilMs(job, DEFAULT_ERROR_BACKOFF_SCHEDULE_MS);
	return backoffUntilMs !== void 0 && nowMs < backoffUntilMs;
}
function collectRunnableJobs(state, nowMs, opts) {
	if (!state.store) return [];
	return state.store.jobs.filter((job) => isRunnableJob({
		state,
		job,
		nowMs,
		skipJobIds: opts?.skipJobIds,
		skipAtIfAlreadyRan: opts?.skipAtIfAlreadyRan,
		allowCronMissedRunByLastRun: opts?.allowCronMissedRunByLastRun
	}));
}
//#endregion
//#region src/cron/service/run-admission.ts
/** Track a persisted marker through shared admission and payload execution. */
function reserveQueuedCronRun(state, jobId, reservationAt, opts) {
	const identity = {};
	state.queuedRunReservationsByJobId.set(jobId, {
		identity,
		lifecycleGeneration: state.lifecycleGeneration,
		markerAtMs: reservationAt,
		runReceipt: opts.runReceipt,
		preserveWhenDisabled: opts?.preserveWhenDisabled === true
	});
	return identity;
}
function releaseQueuedCronRun(state, jobId, identity) {
	if (state.queuedRunReservationsByJobId.get(jobId)?.identity !== identity) return false;
	state.queuedRunReservationsByJobId.delete(jobId);
	return true;
}
function isQueuedCronRunReservationCurrent(state, jobId, identity) {
	const reservation = state.queuedRunReservationsByJobId.get(jobId);
	return reservation?.identity === identity && reservation.lifecycleGeneration === state.lifecycleGeneration;
}
/** Durably clears reservations still owned by this process. Ownership stays
* held through commit; after one retry it is dropped for restart repair. */
async function cleanupQueuedCronRunReservations(params) {
	const { state, reservations } = params;
	const attempt = async () => {
		await locked(state, async () => {
			const postPersistNotifications = [];
			const committedJobs = commitCronRuntimeRows({
				state,
				jobIds: reservations.map((reservation) => reservation.jobId),
				operationLabel: "cron.run-reservation-cleanup",
				transactionHooks: params.transactionHooks,
				mutate: ({ database, jobs }) => {
					const committed = [];
					for (const reservation of reservations) {
						const ownership = state.queuedRunReservationsByJobId.get(reservation.jobId);
						if (ownership?.identity !== reservation.reservationIdentity) continue;
						if (!params.transactionHooks) finishCronRunReceiptInDatabase({
							database,
							handle: ownership.runReceipt,
							status: "skipped",
							finishedAtMs: state.deps.nowMs(),
							error: "cron reservation released before completion"
						});
						const job = jobs.get(reservation.jobId);
						if (!job) continue;
						const queuedMatches = ownership.markerAtMs === job.state.queuedAtMs;
						const runningMatches = ownership.markerAtMs === job.state.runningAtMs;
						if (!queuedMatches && !runningMatches) continue;
						if (params.restoreLastError !== false && ownership.activationPreviousLastError) job.state.lastError = ownership.activationPreviousLastError.value;
						if (queuedMatches) delete job.state.queuedAtMs;
						if (runningMatches) delete job.state.runningAtMs;
						if (params.recompute && job.enabled && job.state.nextRunAtMs === void 0) recomputeJobNextRunAtMs({
							state,
							job,
							nowMs: state.deps.nowMs(),
							deferredNotifications: postPersistNotifications
						});
						committed.push(job);
					}
					return {
						upsertJobIds: committed.map((job) => job.id),
						value: committed
					};
				}
			});
			runPostPersistCronNotifications(state, postPersistNotifications);
			applyCronRuntimeRowsToState(state, committedJobs);
			for (const reservation of reservations) {
				const ownership = state.queuedRunReservationsByJobId.get(reservation.jobId);
				if (ownership?.identity === reservation.reservationIdentity) releaseLocalCronRunReceiptOwnership(ownership.runReceipt);
				releaseQueuedCronRun(state, reservation.jobId, reservation.reservationIdentity);
			}
		});
	};
	try {
		await attempt();
	} catch {
		try {
			await attempt();
		} catch (error) {
			for (const reservation of reservations) {
				const ownership = state.queuedRunReservationsByJobId.get(reservation.jobId);
				if (ownership?.identity === reservation.reservationIdentity) releaseLocalCronRunReceiptOwnership(ownership.runReceipt);
				releaseQueuedCronRun(state, reservation.jobId, reservation.reservationIdentity);
			}
			throw error;
		}
	}
}
/** Supersedes one activated run and releases only its exact durable marker.
* Receipt terminalization shares the marker transaction, so no successor can
* enter between dropping the fence and repairing scheduling state. */
async function supersedeActivatedCronRun(params) {
	try {
		await cleanupQueuedCronRunReservations({
			state: params.state,
			reservations: [params],
			recompute: "maintenance",
			transactionHooks: cronRunReceiptSupersedeHooks({
				state: params.state,
				handle: params.runReceipt,
				finishedAtMs: params.state.deps.nowMs(),
				error: params.reason
			})
		});
	} finally {
		releaseLocalCronRunReceiptOwnership(params.runReceipt);
	}
}
/** Persists queued markers only while no gateway owns an active run receipt.
* Each retry re-reads and updates only pending rows, so excluded foreign jobs
* can advance without a stale full-store snapshot overwriting their state.
*/
async function persistQueuedCronRunReservations(params) {
	const pendingJobs = new Map(params.candidates.map((job) => [job.id, structuredClone(job)]));
	const preparedClaims = new Map([...pendingJobs].map(([jobId, job]) => [jobId, prepareServiceCronRunReceiptClaim({
		state: params.state,
		job,
		startedAtMs: params.reservedAtMs
	})]));
	while (pendingJobs.size > 0) {
		const replacedReceipts = [];
		try {
			const committedReservations = commitCronRuntimeRows({
				state: params.state,
				jobIds: pendingJobs.keys(),
				operationLabel: "cron.run-reservation",
				mutate: ({ database, jobs }) => {
					const jobIds = [...pendingJobs.keys()].toSorted();
					for (const jobId of jobIds) if (!params.state.queuedRunReservationsByJobId.has(jobId)) adjudicateActiveCronRunReceiptInDatabase({
						database,
						jobId,
						prepared: preparedClaims.get(jobId),
						finishedAtMs: params.reservedAtMs
					});
					const committed = [];
					for (const jobId of jobIds) {
						const job = jobs.get(jobId);
						const planned = pendingJobs.get(jobId);
						if (!job || !planned || job.enabled !== planned.enabled || !params.immediateJobIds?.has(jobId) && job.state.nextRunAtMs !== planned.state.nextRunAtMs || job.state.lastRunAtMs !== planned.state.lastRunAtMs || job.state.lastRunStatus !== planned.state.lastRunStatus || job.state.queuedAtMs !== void 0 || job.state.runningAtMs !== void 0 || resolveCronJobConfigRevision(job) !== resolveCronJobConfigRevision(planned)) continue;
						committed.push(job);
					}
					const reservations = committed.map((job) => {
						const prior = params.state.queuedRunReservationsByJobId.get(job.id)?.runReceipt;
						if (prior) {
							finishCronRunReceiptInDatabase({
								database,
								handle: prior,
								status: "superseded",
								finishedAtMs: params.reservedAtMs,
								error: "cron reservation replaced before activation"
							});
							replacedReceipts.push(prior);
						}
						return {
							job,
							runReceipt: claimServiceCronRunReceiptInDatabase(params.state, database, preparedClaims.get(job.id))
						};
					});
					for (const { job } of reservations) job.state.queuedAtMs = params.reservedAtMs;
					return {
						upsertJobIds: committed.map((job) => job.id),
						value: reservations
					};
				}
			});
			for (const receipt of replacedReceipts) releaseLocalCronRunReceiptOwnership(receipt);
			const committedJobs = committedReservations.map(({ job }) => job);
			if (params.state.stopped) {
				const committedById = new Map(committedJobs.map((job) => [job.id, job]));
				if (params.state.store) params.state.store.jobs = params.state.store.jobs.map((job) => committedById.get(job.id) ?? job);
				return committedReservations;
			}
			await ensureLoaded(params.state, {
				forceReload: true,
				skipRecompute: true
			}).catch(() => applyCronRuntimeRowsToState(params.state, committedJobs));
			const committed = new Set(committedJobs.map((job) => job.id));
			const receiptByJobId = new Map(committedReservations.map(({ job, runReceipt }) => [job.id, runReceipt]));
			const reloadedReservations = (params.state.store?.jobs ?? []).filter((job) => committed.has(job.id)).map((job) => ({
				job,
				runReceipt: receiptByJobId.get(job.id)
			}));
			const reloadedJobIds = new Set(reloadedReservations.map(({ job }) => job.id));
			for (const reservation of committedReservations) {
				if (reloadedJobIds.has(reservation.job.id)) continue;
				finishCronRunReceipt({
					handle: reservation.runReceipt,
					status: "skipped",
					finishedAtMs: params.state.deps.nowMs(),
					error: "cron reservation job disappeared before local handoff"
				});
			}
			return reloadedReservations;
		} catch (error) {
			for (const prepared of preparedClaims.values()) releaseLocalCronRunReceiptOwnership(prepared.handle);
			if (!(error instanceof CronRunReceiptConflictError)) throw error;
			enrollForeignReceipt(params.state, error.candidate);
			pendingJobs.delete(error.candidate.jobId);
		}
	}
	await ensureLoaded(params.state, {
		forceReload: true,
		skipRecompute: true
	});
	return [];
}
async function activateQueuedCronRun(params) {
	const { state, job, reservationIdentity } = params;
	const startedAt = state.deps.nowMs();
	const reservation = state.queuedRunReservationsByJobId.get(job.id);
	const runReceipt = reservation?.runReceipt;
	if (!reservation || reservation.identity !== reservationIdentity || !runReceipt) return { kind: "fenced" };
	let previousLastError;
	let activatedJob;
	let activatedReceipt;
	try {
		activatedJob = commitCronRuntimeRows({
			state,
			jobIds: [job.id],
			operationLabel: "cron.run-activation",
			mutate: ({ database, jobs }) => {
				const current = jobs.get(job.id);
				const markerAtMs = state.queuedRunReservationsByJobId.get(job.id)?.markerAtMs;
				if (!current || markerAtMs === void 0 || current.state.queuedAtMs !== markerAtMs) return {
					value: void 0,
					runHooks: false
				};
				previousLastError = current.state.lastError;
				activatedReceipt = activateServiceCronRunReceiptInDatabase(state, database, runReceipt, startedAt);
				delete current.state.queuedAtMs;
				current.state.runningAtMs = startedAt;
				current.state.lastError = void 0;
				return {
					value: current,
					upsertJobIds: [current.id]
				};
			}
		});
	} catch (error) {
		if (error instanceof CronRunReceiptConflictError) {
			enrollForeignReceipt(state, error.candidate);
			return { kind: "fenced" };
		}
		if (error instanceof CronRunReceiptRevisionError) return { kind: "fenced" };
		throw error;
	}
	if (!activatedJob) return { kind: "fenced" };
	applyCronRuntimeRowsToState(state, [activatedJob]);
	if (reservation?.identity === reservationIdentity) {
		reservation.markerAtMs = startedAt;
		reservation.runReceipt = activatedReceipt;
		reservation.activationPreviousLastError = { value: previousLastError };
	}
	if (!state.stopped && reservation.lifecycleGeneration === state.lifecycleGeneration) return {
		kind: "activated",
		job: activatedJob,
		startedAt,
		runReceipt: activatedReceipt
	};
	params.onUnavailable?.();
	try {
		const restoredJob = commitCronRuntimeRows({
			state,
			jobIds: [job.id],
			operationLabel: "cron.run-activation-unavailable",
			transactionHooks: cronRunReceiptPersistHooks({
				state,
				handle: activatedReceipt,
				terminal: {
					status: "skipped",
					finishedAtMs: state.deps.nowMs(),
					error: "cron service stopped"
				}
			}),
			mutate: ({ jobs }) => {
				const current = jobs.get(job.id);
				if (!current || current.state.runningAtMs !== startedAt) return { value: void 0 };
				current.state.lastError = previousLastError;
				delete current.state.runningAtMs;
				return {
					value: current,
					upsertJobIds: [current.id]
				};
			}
		});
		if (restoredJob) applyCronRuntimeRowsToState(state, [restoredJob]);
	} catch (error) {
		await params.onUnavailableRollbackError?.();
		throw error;
	} finally {
		releaseLocalCronRunReceiptOwnership(activatedReceipt);
	}
	releaseQueuedCronRun(state, job.id, reservationIdentity);
	return {
		kind: "unavailable",
		reason: "stopped"
	};
}
async function executeQueuedCronRun(params) {
	const { state } = params;
	let activated = false;
	const executeAdmitted = async () => {
		const started = await locked(state, async () => {
			await ensureLoaded(state, {
				forceReload: true,
				skipRecompute: true
			});
			if (params.isUnavailable?.() || state.stopped) {
				params.onUnavailable?.();
				return;
			}
			const job = state.store?.jobs.find((entry) => entry.id === params.jobId);
			if (!job || !isQueuedCronRunReservationCurrent(state, params.jobId, params.reservationIdentity) || job.state.queuedAtMs !== params.reservedAtMs) {
				const ownership = state.queuedRunReservationsByJobId.get(params.jobId);
				if (job && ownership?.identity === params.reservationIdentity && job.state.queuedAtMs === params.reservedAtMs) {
					await params.onNotRunnable(job);
					return;
				}
				if (ownership?.identity === params.reservationIdentity) try {
					finishCronRunReceipt({
						handle: ownership.runReceipt,
						status: "skipped",
						finishedAtMs: state.deps.nowMs(),
						error: "cron reservation fenced by concurrent mutation"
					});
				} catch {}
				releaseQueuedCronRun(state, params.jobId, params.reservationIdentity);
				return;
			}
			const runnableJob = structuredClone(job);
			delete runnableJob.state.queuedAtMs;
			if (!isRunnableJob({
				state,
				job: runnableJob,
				nowMs: state.deps.nowMs(),
				...params.runnableOptions
			})) {
				await params.onNotRunnable(job);
				return;
			}
			const activation = await activateQueuedCronRun({
				state,
				job,
				reservationIdentity: params.reservationIdentity,
				onUnavailable: params.onUnavailable
			});
			if (activation.kind !== "activated") return;
			activated = true;
			params.onActivated?.();
			return {
				job: activation.job,
				startedAt: activation.startedAt,
				runReceipt: activation.runReceipt
			};
		});
		if (!started) return;
		const executionJob = structuredClone(started.job);
		executionJob.state.runningAtMs = started.startedAt;
		executionJob.state.lastError = void 0;
		const taskRun = tryCreateCronTaskRunHandle({
			state,
			job: executionJob,
			startedAt: started.startedAt,
			runReceipt: started.runReceipt
		});
		const taskRunId = taskRun?.runId;
		const activeJobMarker = markCronJobActive(executionJob.id, {
			payloadKind: executionJob.payload.kind,
			preserveAcrossGenerationAdvance: !runsDetachedFromMainSession(executionJob)
		});
		emit(state, {
			jobId: executionJob.id,
			action: "started",
			job: executionJob,
			runAtMs: started.startedAt
		});
		const base = {
			jobId: params.jobId,
			job: executionJob,
			taskRunId,
			activeJobMarker,
			reservationIdentity: params.reservationIdentity,
			startedAt: started.startedAt,
			runReceipt: started.runReceipt
		};
		let outcome;
		try {
			const execute = async () => await executeJobCoreWithTimeout(state, executionJob, {
				runId: taskRunId,
				activeJobMarker,
				runReceipt: started.runReceipt,
				executionIdentity: createCronOwnerExecutionIdentityAdmission({
					state,
					runReceipt: started.runReceipt,
					taskId: taskRun?.taskId,
					flowId: taskRun?.flowId
				})
			});
			const result = state.deps.runSchedulerOwned ? await state.deps.runSchedulerOwned(execute) : await execute();
			outcome = {
				...base,
				...result,
				endedAt: state.deps.nowMs()
			};
		} catch (error) {
			const receiptSettlementDisposition = error instanceof CronRunReceiptRevisionError && error.reason === "owner-unavailable" ? "owner-unavailable" : void 0;
			const errorText = error instanceof CronRunReceiptRevisionError ? error.message : normalizeCronRunErrorText(error);
			params.onSetupError?.(executionJob, errorText);
			outcome = {
				...base,
				...authorCronRunCompletion(state, executionJob, {
					status: "error",
					error: errorText,
					diagnostics: createCronRunDiagnosticsFromError("cron-setup", errorText, { nowMs: state.deps.nowMs })
				}),
				...receiptSettlementDisposition ? { receiptSettlementDisposition } : {},
				endedAt: state.deps.nowMs()
			};
		}
		return {
			outcome,
			handled: await params.onCompleted?.(outcome) === true
		};
	};
	const admission = await runWithCronAdmission(state, executeAdmitted, params.admissionRelease).catch(async (error) => {
		if (activated) await cleanupQueuedCronRunReservations({
			state,
			reservations: [{
				jobId: params.jobId,
				reservationIdentity: params.reservationIdentity
			}],
			recompute: "maintenance"
		});
		throw error;
	});
	if (admission.kind === "stopped") return { kind: "stopped" };
	if (!admission.value) return { kind: "skipped" };
	return {
		kind: "completed",
		...admission.value
	};
}
//#endregion
//#region src/cron/service/timer-capacity-recheck.ts
/** Tracks capacity-triggered child ticks without leaking the parent timer lifecycle. */
function createCronCapacityRecheckTracker(requestRecheck, requestRecheckAfterClose) {
	let pendingActivations = 0;
	let activationsAllowRecheck = true;
	let activationGateResolved = false;
	let activationGateAllowsRecheck = false;
	let closed = false;
	let resolveActivationGate;
	const activationGate = new Promise((resolve) => {
		resolveActivationGate = resolve;
	});
	const trackedRechecks = /* @__PURE__ */ new Set();
	const runInParentContext = AsyncLocalStorage.snapshot();
	const resolveActivationGateOnce = (allowRecheck) => {
		if (activationGateResolved) return;
		activationGateResolved = true;
		activationGateAllowsRecheck = allowRecheck;
		resolveActivationGate(allowRecheck);
	};
	return {
		initializeActivations(count, allowRecheckWhenEmpty = false) {
			pendingActivations = count;
			if (count === 0) resolveActivationGateOnce(allowRecheckWhenEmpty);
		},
		settleActivation(allowRecheck) {
			if (activationGateResolved) return;
			activationsAllowRecheck &&= allowRecheck;
			pendingActivations -= 1;
			if (pendingActivations === 0) resolveActivationGateOnce(activationsAllowRecheck);
		},
		request() {
			if (closed) {
				if (activationGateAllowsRecheck) requestRecheckAfterClose();
				return;
			}
			const recheck = activationGate.then(async (allowRecheck) => {
				if (allowRecheck) await runInParentContext(requestRecheck);
			});
			trackedRechecks.add(recheck);
			recheck.finally(() => trackedRechecks.delete(recheck));
		},
		abort() {
			closed = true;
			resolveActivationGateOnce(false);
		},
		async drain() {
			while (trackedRechecks.size > 0) await Promise.all(trackedRechecks);
		}
	};
}
//#endregion
//#region src/cron/service/timer-outcome-finalization.ts
/** Finalizes cron task rows and active markers after timer outcome persistence. */
/** Coalesces terminal cron writes without holding an execution admission slot. */
function createCompletedCronRunOutcomeDrain(state, opts) {
	const pendingOutcomes = [];
	const finalizedOutcomes = [];
	let drainPromise;
	let drainFailure;
	const startDrain = () => {
		if (drainPromise || pendingOutcomes.length === 0) return;
		drainPromise = Promise.resolve().then(async () => {
			while (pendingOutcomes.length > 0) {
				const completed = pendingOutcomes.splice(0);
				try {
					finalizedOutcomes.push(...await finalizeCompletedCronRunOutcomes(state, completed, opts));
				} catch (error) {
					drainFailure ??= { error };
				}
			}
		}).catch((error) => {
			drainFailure ??= { error };
		}).finally(() => {
			drainPromise = void 0;
			if (pendingOutcomes.length > 0) startDrain();
		});
	};
	return {
		enqueue(outcome) {
			pendingOutcomes.push(outcome);
			startDrain();
		},
		async flush() {
			for (;;) {
				const pendingDrain = drainPromise;
				if (!pendingDrain) break;
				await pendingDrain;
			}
			if (drainFailure) throw drainFailure.error;
			return finalizedOutcomes.splice(0);
		}
	};
}
/** Durably finalizes finished work without waiting for unrelated cron runs. */
async function finalizeCompletedCronRunOutcomes(state, outcomes, opts) {
	if (outcomes.length === 0) return [];
	let finalizedOutcomes = [];
	let finalizationSucceeded = false;
	const canPublish = (outcome) => !(state.stopped && opts?.discardWhenStopped) && isCronActiveJobMarkerCurrent(outcome.activeJobMarker);
	try {
		await locked(state, async () => {
			await ensureLoaded(state, {
				forceReload: true,
				skipRecompute: true
			});
			for (const outcome of outcomes) if (outcome.status !== "ok" || outcome.triggerEval?.fired !== false) {
				const taskJob = structuredClone(state.store?.jobs.find((job) => job.id === outcome.jobId) ?? outcome.job);
				applyOutcomeToAuthoritativeJob(state, taskJob, outcome, {
					deferredNotifications: [],
					emit: false
				});
				recordCronOutcomeForJob(state, taskJob, outcome);
			}
			finalizedOutcomes = outcomes.filter((outcome) => outcome.runReceipt || canPublish(outcome));
			if (finalizedOutcomes.length === 0) {
				finalizationSucceeded = true;
				return;
			}
			const postPersistNotifications = [];
			const receiptHooks = finalizedOutcomes.filter((outcome) => outcome.runReceipt).map((outcome) => cronRunReceiptPersistHooks({
				state,
				handle: outcome.runReceipt,
				allowMissingJob: outcome.activeJobMarker?.jobRemoved === true || !state.store?.jobs.some((job) => job.id === outcome.jobId),
				terminal: {
					status: outcome.status,
					...outcome.triggerEval ? { triggerFired: outcome.triggerEval.fired } : {},
					finishedAtMs: outcome.endedAt,
					error: outcome.error,
					...outcome.receiptSettlementDisposition ? { disposition: outcome.receiptSettlementDisposition } : {}
				}
			}));
			const transactionHooks = receiptHooks.length > 0 ? {
				beforeWrite: (database) => {
					for (const hooks of receiptHooks) hooks.beforeWrite?.(database);
				},
				afterWrite: (database) => {
					for (const hooks of receiptHooks) hooks.afterWrite?.(database);
				},
				afterCommit: () => {
					for (const hooks of receiptHooks) hooks.afterCommit?.();
				}
			} : void 0;
			const committed = commitCronRuntimeRows({
				state,
				jobIds: finalizedOutcomes.map((outcome) => outcome.jobId),
				operationLabel: "cron.run-finalization",
				transactionHooks,
				mutate: ({ jobs }) => {
					const upsertedJobs = [];
					const removedJobs = [];
					const eventPlans = [];
					for (const outcome of finalizedOutcomes) {
						const job = jobs.get(outcome.jobId);
						if (!job || outcome.activeJobMarker?.jobRemoved === true) {
							eventPlans.push({ outcome });
							continue;
						}
						if (applyOutcomeToAuthoritativeJob(state, job, outcome, {
							deferredNotifications: postPersistNotifications,
							emit: false
						})) removedJobs.push(job);
						else upsertedJobs.push(job);
						eventPlans.push({
							outcome,
							job: structuredClone(job)
						});
					}
					return {
						deleteJobIds: removedJobs.map((job) => job.id),
						upsertJobIds: upsertedJobs.map((job) => job.id),
						value: {
							eventPlans,
							removedJobs,
							upsertedJobs
						}
					};
				}
			});
			applyCronRuntimeRowsToState(state, committed.upsertedJobs, committed.removedJobs.map((job) => job.id), { publish: false });
			for (const outcome of finalizedOutcomes) {
				if (outcome.status === "ok" && outcome.triggerEval?.fired === false) tryFinishCronTaskRunWithoutHistory(state, outcome);
				if (!canPublish(outcome)) state.durableNextRunAtMsByJobId.set(outcome.jobId, state.store?.jobs.find((job) => job.id === outcome.jobId)?.state.nextRunAtMs);
			}
			finalizedOutcomes = finalizedOutcomes.filter(canPublish);
			finalizationSucceeded = true;
			if (finalizedOutcomes.length === 0) {
				runPostPersistCronNotifications(state, postPersistNotifications);
				return;
			}
			const publishedJobIds = new Set(finalizedOutcomes.map((outcome) => outcome.jobId));
			for (const plan of committed.eventPlans) {
				if (!publishedJobIds.has(plan.outcome.jobId)) continue;
				if (plan.job) emitCronOutcomeEventForJob(state, plan.job, plan.outcome);
				else applyOutcomeToStoredJob(state, plan.outcome, { deferredNotifications: postPersistNotifications });
			}
			runPostPersistCronNotifications(state, postPersistNotifications);
			for (const removedJob of committed.removedJobs) if (publishedJobIds.has(removedJob.id)) emit(state, {
				jobId: removedJob.id,
				action: "removed",
				job: removedJob
			});
			publishCronRuntimeRows(state);
			try {
				const maintenance = recomputeUnownedCronSchedules(state, opts?.repairFutureCronNextRunAtMs === false ? { repairFutureCronNextRunAtMs: false } : void 0);
				applyCronRuntimeRowsToState(state, maintenance.jobs);
				runPostPersistCronNotifications(state, maintenance.notifications);
			} catch (error) {
				state.deps.log.warn({ err: String(error) }, "cron: post-finalization schedule maintenance failed");
			}
		});
		finalizationSucceeded ||= finalizedOutcomes.length > 0;
		return finalizedOutcomes;
	} catch (error) {
		if (error instanceof CronRunReceiptRevisionError) {
			const stale = outcomes.find((outcome) => outcome.runReceipt?.receiptId === error.receiptId);
			if (stale?.runReceipt) {
				if (isCronActiveJobMarkerCurrent(stale.activeJobMarker)) {
					if (stale.reservationIdentity) await supersedeActivatedCronRun({
						state,
						jobId: stale.jobId,
						reservationIdentity: stale.reservationIdentity,
						runReceipt: stale.runReceipt,
						reason: error.message
					});
					else supersedeServiceCronRunReceipt(stale.runReceipt, state.deps.nowMs(), error.message);
					tryFinishCronTaskRunWithoutHistory(state, {
						taskRunId: stale.taskRunId,
						status: "skipped",
						error: error.message,
						endedAt: state.deps.nowMs()
					});
				}
				return await finalizeCompletedCronRunOutcomes(state, outcomes.filter((outcome) => outcome !== stale), opts);
			}
		}
		throw error;
	} finally {
		for (const outcome of outcomes) {
			if (outcome.reservationIdentity) releaseQueuedCronRun(state, outcome.jobId, outcome.reservationIdentity);
			if (opts?.clearOnFailure !== false || finalizationSucceeded) clearCronJobActive(outcome.jobId, outcome.activeJobMarker);
			if (outcome.runReceipt) releaseLocalCronRunReceiptOwnership(outcome.runReceipt);
		}
	}
}
//#endregion
//#region src/cron/service/timer-scheduler.ts
/** Arms the cron timer for the next wake or a maintenance recheck. */
function armTimer(state) {
	if (state.timer) clearTimeout(state.timer);
	state.timer = null;
	if (state.stopped || state.schedulingPaused || state.startupCatchup) {
		state.deps.log.debug({}, "cron: armTimer skipped - scheduler stopped");
		return;
	}
	if (!state.deps.cronEnabled) {
		state.deps.log.debug({}, "cron: armTimer skipped - scheduler disabled");
		return;
	}
	const { nextWakeAtMs: nextAt, jobCount, enabledCount } = summarizeCronJobSchedule(state);
	if (!nextAt) {
		const withNextRun = 0;
		if (enabledCount > 0) {
			armRunningRecheckTimer(state);
			state.deps.log.debug({
				jobCount,
				enabledCount,
				withNextRun,
				delayMs: MAX_CRON_TIMER_DELAY_MS
			}, "cron: timer armed for maintenance recheck");
			return;
		}
		state.deps.log.debug({
			jobCount,
			enabledCount,
			withNextRun
		}, "cron: armTimer skipped - no jobs with nextRunAtMs");
		return;
	}
	const now = state.deps.nowMs();
	const delay = Math.max(nextAt - now, 0);
	const clampedDelay = Math.min(delay === 0 ? MIN_REFIRE_GAP_MS : delay, MAX_CRON_TIMER_DELAY_MS);
	setCronTimer(state, clampedDelay);
	state.deps.log.debug({
		nextAt,
		delayMs: clampedDelay,
		clamped: delay > MAX_CRON_TIMER_DELAY_MS
	}, "cron: timer armed");
}
function armRunningRecheckTimer(state) {
	if (state.stopped || state.schedulingPaused) return;
	if (state.timer) clearTimeout(state.timer);
	setCronTimer(state, MAX_CRON_TIMER_DELAY_MS);
}
function setCronTimer(state, delayMs) {
	state.timer = setTimeout(() => {
		runOutsideGatewayRootWorkAdmission(() => {
			onTimer(state).catch((err) => {
				state.deps.log.error({ err: String(err) }, "cron: timer tick failed");
			});
		});
	}, delayMs);
}
/** Consume a released slot without routing overdue work through the refire floor. */
function requestImmediateCronRecheck(state) {
	if (state.stopped || state.schedulingPaused || !state.deps.cronEnabled) return;
	if (state.timer) {
		clearTimeout(state.timer);
		state.timer = null;
	}
	return onTimer(state).catch((err) => {
		state.deps.log.error({ err: String(err) }, "cron: immediate capacity recheck failed");
	});
}
function requestIndependentImmediateCronRecheck(state) {
	return runOutsideGatewayRootWorkAdmission(() => requestImmediateCronRecheck(state));
}
/** Handles one cron timer tick under the process-wide root work admission. */
async function onTimer(state) {
	const lifecycleGeneration = state.lifecycleGeneration;
	let admission;
	try {
		admission = await beginGatewayRootWorkAdmissionWhenOpen("cron:timer-tick");
	} catch (err) {
		if (err instanceof GatewayDrainingError) return;
		throw err;
	}
	try {
		if (state.lifecycleGeneration === lifecycleGeneration) await admission.run(async () => await onAdmittedTimer(state));
	} finally {
		admission.release();
	}
}
/** Loads due jobs, reserves them, executes, persists, and re-arms. */
async function onAdmittedTimer(state) {
	if (state.stopped || state.schedulingPaused || state.startupCatchup) return;
	state.running = true;
	state.activeTimerTicks += 1;
	armRunningRecheckTimer(state);
	const capacityRechecks = createCronCapacityRecheckTracker(() => requestImmediateCronRecheck(state), () => requestIndependentImmediateCronRecheck(state));
	let allowEmptyCapacityRecheck = false;
	try {
		const dueJobs = await locked(state, async () => {
			await ensureLoaded(state, {
				forceReload: true,
				skipRecompute: true
			});
			if (state.stopped || state.startupCatchup) {
				state.deps.log.warn({}, "cron: due job reservation skipped - scheduler unavailable");
				return [];
			}
			const leaseRecovery = recoverNonTerminalCronRunReceipts(state);
			runPostPersistCronNotifications(state, leaseRecovery.notifications);
			for (const receipt of leaseRecovery.receipts) enrollForeignReceipt(state, receipt);
			if (leaseRecovery.repaired) await ensureLoaded(state, {
				forceReload: true,
				skipRecompute: true
			});
			const dueCheckNow = state.deps.nowMs();
			const due = collectRunnableJobs(state, dueCheckNow);
			if (due.length === 0) {
				if (!state.store?.jobs.some((job) => needsCronTimerMaintenance(job, dueCheckNow))) return [];
				const maintenance = recomputeUnownedCronSchedules(state, {
					recomputeExpired: true,
					nowMs: dueCheckNow,
					repairFutureCronNextRunAtMs: state.store.jobs.some((job) => isStaleFutureCronSlot(job, dueCheckNow))
				});
				runPostPersistCronNotifications(state, maintenance.notifications);
				applyCronRuntimeRowsToState(state, maintenance.jobs);
				return [];
			}
			const admissionReleases = tryAcquireCronRunSlots(state, due.length);
			const admittedDue = due.slice(0, admissionReleases.length);
			if (admittedDue.length < due.length) {
				setCronRunCapacityListener(state, admittedDue.length > 0 ? () => capacityRechecks.request() : () => void requestIndependentImmediateCronRecheck(state));
				allowEmptyCapacityRecheck = admittedDue.length > 0;
			}
			if (admittedDue.length === 0) return [];
			const now = state.deps.nowMs();
			try {
				const reservedDue = (await persistQueuedCronRunReservations({
					state,
					candidates: admittedDue,
					reservedAtMs: now
				})).map(({ job, runReceipt }, index) => ({
					id: job.id,
					job,
					reservedAtMs: now,
					reservationIdentity: reserveQueuedCronRun(state, job.id, now, { runReceipt }),
					releaseAdmission: admissionReleases[index]
				}));
				for (const releaseAdmission of admissionReleases.slice(reservedDue.length)) releaseAdmission();
				return reservedDue;
			} catch (error) {
				for (const releaseAdmission of admissionReleases) releaseAdmission();
				throw error;
			}
		});
		if (state.runAdmission.capacityListener) armRunningRecheckTimer(state);
		else armTimer(state);
		const concurrency = Math.min(resolveRunConcurrency(), Math.max(1, dueJobs.length));
		capacityRechecks.initializeActivations(dueJobs.length, allowEmptyCapacityRecheck);
		const completedOutcomeDrain = createCompletedCronRunOutcomeDrain(state);
		const claimedIndexes = /* @__PURE__ */ new Set();
		let reservationReleaseError;
		let setupTimeoutNotified = false;
		let stopAdmittingDueJobs = false;
		const releaseUnclaimedDueJobReservationsWithRetry = async () => {
			const unclaimed = dueJobs.filter((_, index) => !claimedIndexes.has(index));
			const reservations = unclaimed.map((due) => ({
				jobId: due.id,
				reservationIdentity: due.reservationIdentity
			}));
			try {
				await cleanupQueuedCronRunReservations({
					state,
					reservations,
					recompute: "maintenance"
				});
			} finally {
				for (const due of unclaimed) due.releaseAdmission();
			}
		};
		if (state.stopped) {
			capacityRechecks.abort();
			await releaseUnclaimedDueJobReservationsWithRetry();
			return;
		}
		let completedResults;
		let batchExecutionError;
		try {
			completedResults = await pMap(dueJobs, async (due, index) => {
				let initialActivationSettled = false;
				const settleThisInitialActivation = (allowRecheck) => {
					if (initialActivationSettled) return;
					initialActivationSettled = true;
					capacityRechecks.settleActivation(allowRecheck);
				};
				if (stopAdmittingDueJobs || state.stopped) {
					stopAdmittingDueJobs = true;
					settleThisInitialActivation(false);
					return pMapSkip;
				}
				try {
					const execution = await executeQueuedCronRun({
						state,
						jobId: due.id,
						reservedAtMs: due.reservedAtMs,
						reservationIdentity: due.reservationIdentity,
						admissionRelease: due.releaseAdmission,
						isUnavailable: () => stopAdmittingDueJobs,
						onUnavailable: () => {
							stopAdmittingDueJobs = true;
						},
						onActivated: () => {
							claimedIndexes.add(index);
							settleThisInitialActivation(true);
						},
						onNotRunnable: async () => {
							const committedJob = commitCronRuntimeRows({
								state,
								jobIds: [due.id],
								operationLabel: "cron.skipped-reservation-cleanup",
								mutate: ({ database, jobs }) => {
									const current = jobs.get(due.id);
									const ownership = state.queuedRunReservationsByJobId.get(due.id);
									if (!current || ownership?.identity !== due.reservationIdentity || ownership.markerAtMs !== current.state.queuedAtMs) return { value: void 0 };
									finishCronRunReceiptInDatabase({
										database,
										handle: ownership.runReceipt,
										status: "skipped",
										finishedAtMs: state.deps.nowMs(),
										error: "cron scheduled reservation became ineligible"
									});
									delete current.state.queuedAtMs;
									return {
										upsertJobIds: [current.id],
										value: current
									};
								}
							});
							if (committedJob) applyCronRuntimeRowsToState(state, [committedJob]);
							const ownership = state.queuedRunReservationsByJobId.get(due.id);
							if (ownership?.identity === due.reservationIdentity) releaseLocalCronRunReceiptOwnership(ownership.runReceipt);
							releaseQueuedCronRun(state, due.id, due.reservationIdentity);
						},
						onSetupError: (job, errorText) => {
							state.deps.log.warn({
								jobId: due.id,
								jobName: job.name,
								timeoutMs: resolveCronJobTimeoutMs(job) ?? null
							}, `cron: job failed: ${errorText}`);
						},
						onCompleted: async (result) => {
							if (!result.isolatedAgentSetupTimeout) {
								completedOutcomeDrain.enqueue(result);
								return true;
							}
							let finalizedResults;
							try {
								finalizedResults = await finalizeCompletedCronRunOutcomes(state, [result], { clearOnFailure: false });
							} catch {
								return false;
							}
							if (finalizedResults.length > 0 && !setupTimeoutNotified && maybeNotifyIsolatedAgentSetupTimeout(state, result)) {
								setupTimeoutNotified = true;
								stopAdmittingDueJobs = true;
								try {
									await releaseUnclaimedDueJobReservationsWithRetry();
								} catch (err) {
									reservationReleaseError = err;
								}
							}
							return true;
						}
					});
					if (execution.kind === "stopped") {
						stopAdmittingDueJobs = true;
						return pMapSkip;
					}
					if (execution.kind === "skipped") {
						settleThisInitialActivation(!stopAdmittingDueJobs && !state.stopped);
						return pMapSkip;
					}
					if (execution.handled) return pMapSkip;
					return execution.outcome;
				} catch (error) {
					stopAdmittingDueJobs = true;
					batchExecutionError ??= error;
					return pMapSkip;
				} finally {
					settleThisInitialActivation(false);
				}
			}, {
				concurrency,
				stopOnError: false
			});
		} catch (error) {
			let finalizationError;
			try {
				await completedOutcomeDrain.flush();
			} catch (drainError) {
				finalizationError = drainError;
			}
			await releaseUnclaimedDueJobReservationsWithRetry();
			if (finalizationError) throw finalizationError instanceof Error ? finalizationError : new Error(formatErrorMessage(finalizationError));
			throw error instanceof AggregateError && error.errors.length > 0 ? error.errors[0] : error;
		}
		let postBatchError = reservationReleaseError;
		try {
			await completedOutcomeDrain.flush();
		} catch (error) {
			postBatchError ??= error;
			stopAdmittingDueJobs = true;
		}
		if (stopAdmittingDueJobs) try {
			await releaseUnclaimedDueJobReservationsWithRetry();
		} catch (error) {
			postBatchError ??= error;
		}
		if (completedResults.length > 0) {
			const finalizedResults = await finalizeCompletedCronRunOutcomes(state, completedResults);
			for (const result of finalizedResults) if (!setupTimeoutNotified && result.isolatedAgentSetupTimeout && maybeNotifyIsolatedAgentSetupTimeout(state, result)) {
				setupTimeoutNotified = true;
				break;
			}
		}
		if (postBatchError) throw postBatchError instanceof Error ? postBatchError : new Error(formatErrorMessage(postBatchError));
		if (batchExecutionError) throw batchExecutionError instanceof Error ? batchExecutionError : new Error(formatErrorMessage(batchExecutionError));
	} finally {
		capacityRechecks.abort();
		await capacityRechecks.drain();
		try {
			if (state.deps.resolveSessionStorePath || state.deps.sessionStorePath) {
				const configuredDefaultAgentId = (state.deps.resolveDefaultAgentId?.() ?? state.deps.defaultAgentId)?.trim();
				const defaultAgentId = configuredDefaultAgentId ? normalizeAgentId(configuredDefaultAgentId) : void 0;
				const reaperAgentIds = new Set((state.deps.resolveSessionStoreAgentIds?.() ?? []).map(normalizeAgentId));
				const resolveJobAgentId = (job) => {
					if (typeof job.agentId === "string" && job.agentId.trim()) return normalizeAgentId(job.agentId);
					try {
						return resolveAgentIdFromSessionKey(job.sessionKey, defaultAgentId);
					} catch {
						return;
					}
				};
				for (const job of state.store?.jobs ?? []) {
					const agentId = resolveJobAgentId(job);
					if (agentId) reaperAgentIds.add(agentId);
				}
				if (defaultAgentId) reaperAgentIds.add(defaultAgentId);
				if (reaperAgentIds.size > 0) {
					const nowMs = state.deps.nowMs();
					for (const agentId of reaperAgentIds) {
						if (state.deps.isAgentAvailable?.(agentId) === false) {
							if (!state.reportedUnavailableReaperAgentIds.has(agentId)) {
								state.reportedUnavailableReaperAgentIds.add(agentId);
								state.deps.log.debug({ agentId }, "cron-reaper: skipped unavailable agent");
							}
							continue;
						}
						state.reportedUnavailableReaperAgentIds.delete(agentId);
						const storePath = state.deps.resolveSessionStorePath ? state.deps.resolveSessionStorePath(agentId) : state.deps.sessionStorePath;
						if (!storePath) continue;
						try {
							await sweepCronRunSessions({
								agentId,
								cronConfig: state.deps.cronConfig,
								sessionStorePath: storePath,
								nowMs,
								log: state.deps.log
							});
						} catch (err) {
							state.deps.log.warn({
								err: String(err),
								storePath
							}, "cron: session reaper sweep failed");
						}
					}
				}
			}
		} catch (err) {
			state.deps.log.warn({ err: String(err) }, "cron: session reaper preparation failed");
		} finally {
			state.activeTimerTicks = Math.max(0, state.activeTimerTicks - 1);
			state.running = state.activeTimerTicks > 0;
			if (!state.running) armTimer(state);
		}
	}
}
//#endregion
//#region src/cron/service/timer-catchup.ts
function collectStartupCatchupJobs(state, nowMs, opts) {
	if (!state.store) return [];
	const missed = [];
	const skippedJobIds = [];
	const postPersistNotifications = [];
	const committedJobs = commitCronRuntimeRows({
		state,
		jobIds: state.store.jobs.map((job) => job.id),
		operationLabel: "cron.startup-schedules",
		mutate: ({ database, jobs }) => {
			const committed = [];
			for (const job of jobs.values()) {
				if (!isJobEnabled(job) || opts?.skipJobIds?.has(job.id) || hasActiveCronRun(job) || findActiveCronRunReceiptInDatabase({
					database,
					storePath: state.deps.storePath,
					jobId: job.id
				})) continue;
				const backoffUntilMs = job.schedule.kind === "cron" ? resolveJobErrorBackoffUntilMs(job, DEFAULT_ERROR_BACKOFF_SCHEDULE_MS) : void 0;
				if (backoffUntilMs !== void 0 && nowMs < backoffUntilMs && hasMissedCronSlotSinceLastRun(job, nowMs) && job.state.nextRunAtMs !== backoffUntilMs) {
					job.state.nextRunAtMs = backoffUntilMs;
					committed.push(job);
					continue;
				}
				if (!isRunnableJob({
					state,
					job,
					nowMs,
					skipAtIfAlreadyRan: true,
					allowCronMissedRunByLastRun: true
				})) continue;
				if (state.deps.cronConfig?.skipMissedJobs && (job.schedule.kind === "cron" || job.schedule.kind === "every")) {
					if (recomputeJobNextRunAtMs({
						state,
						job,
						nowMs,
						deferredNotifications: postPersistNotifications
					})) committed.push(job);
					skippedJobIds.push(job.id);
				} else missed.push(job);
			}
			return {
				upsertJobIds: committed.map((job) => job.id),
				value: committed
			};
		}
	});
	runPostPersistCronNotifications(state, postPersistNotifications);
	applyCronRuntimeRowsToState(state, committedJobs);
	if (skippedJobIds.length > 0) state.deps.log.info({
		count: skippedJobIds.length,
		jobIds: skippedJobIds
	}, "cron: skipped missed recurring jobs after restart");
	return missed;
}
function commitStartupCatchupRows(params) {
	const postPersistNotifications = [];
	const deferredJobs = params.deferredJobs ?? [];
	const reservationByJobId = new Map(params.reservations.map((reservation) => [reservation.jobId, reservation]));
	const deferredByJobId = new Map(deferredJobs.map((deferred) => [deferred.jobId, deferred]));
	const baseNow = params.state.deps.nowMs();
	let offset = params.staggerMs ?? 0;
	const committedJobs = commitCronRuntimeRows({
		state: params.state,
		jobIds: [...reservationByJobId.keys(), ...deferredByJobId.keys()],
		operationLabel: "cron.startup-catchup-state",
		mutate: ({ database, jobs }) => {
			const committed = [];
			for (const [jobId, job] of jobs) {
				let changed = false;
				const reservation = reservationByJobId.get(jobId);
				const ownership = params.state.queuedRunReservationsByJobId.get(jobId);
				if (reservation && ownership?.identity === reservation.reservationIdentity) {
					finishCronRunReceiptInDatabase({
						database,
						handle: ownership.runReceipt,
						status: "skipped",
						finishedAtMs: params.state.deps.nowMs(),
						error: "cron startup reservation abandoned before completion"
					});
					if (ownership.activationPreviousLastError) job.state.lastError = ownership.activationPreviousLastError.value;
					if (ownership.markerAtMs === job.state.queuedAtMs) {
						delete job.state.queuedAtMs;
						changed = true;
					}
					if (ownership.markerAtMs === job.state.runningAtMs) {
						delete job.state.runningAtMs;
						changed = true;
					}
				}
				const deferred = deferredByJobId.get(jobId);
				if (deferred && isJobEnabled(job) && job.state.queuedAtMs === void 0 && job.state.runningAtMs === void 0 && job.state.nextRunAtMs === deferred.nextRunAtMs && job.state.lastRunAtMs === deferred.lastRunAtMs && job.state.lastRunStatus === deferred.lastRunStatus && job.state.scheduleActivatedAtMs === deferred.scheduleActivatedAtMs && job.createdAtMs === deferred.createdAtMs && job.payload.kind === deferred.payloadKind && deferred.scheduleIdentity !== void 0 && tryCronScheduleIdentity(job) === deferred.scheduleIdentity && !findActiveCronRunReceiptInDatabase({
					database,
					storePath: params.state.deps.storePath,
					jobId
				})) {
					const candidate = typeof deferred.delayMs === "number" ? baseNow + deferred.delayMs + offset - (params.staggerMs ?? 0) : baseNow + offset;
					const runAtMs = resolveNextRunAtMsOrDisable({
						state: params.state,
						job,
						candidate,
						deferredNotifications: postPersistNotifications
					});
					job.state.nextRunAtMs = runAtMs;
					job.state.startupCatchupAtMs = runAtMs;
					offset += params.staggerMs ?? 0;
					changed = true;
				}
				if (changed) committed.push(job);
			}
			return {
				upsertJobIds: committed.map((job) => job.id),
				value: committed
			};
		}
	});
	runPostPersistCronNotifications(params.state, postPersistNotifications);
	applyCronRuntimeRowsToState(params.state, committedJobs);
	for (const reservation of params.reservations) {
		const ownership = params.state.queuedRunReservationsByJobId.get(reservation.jobId);
		if (ownership?.identity === reservation.reservationIdentity) releaseLocalCronRunReceiptOwnership(ownership.runReceipt);
		releaseQueuedCronRun(params.state, reservation.jobId, reservation.reservationIdentity);
	}
}
async function releaseStartupCatchupReservationsAfterFailure(state, plan, outcomes) {
	const startedJobIds = new Set(outcomes.map((outcome) => outcome.jobId));
	await cleanupQueuedCronRunReservations({
		state,
		reservations: plan.candidates.filter((candidate) => !startedJobIds.has(candidate.jobId)),
		recompute: "startup-overflow"
	});
}
/** Runs or defers missed startup jobs using restart catch-up limits. */
async function runMissedJobs(state, opts) {
	if (state.stopped) return;
	const catchup = {};
	state.startupCatchup = catchup;
	try {
		const plan = await planStartupCatchup(state, opts);
		if (plan.candidates.length === 0 && plan.deferredJobs.length === 0) return;
		const completedOutcomeDrain = createCompletedCronRunOutcomeDrain(state, {
			discardWhenStopped: true,
			repairFutureCronNextRunAtMs: false
		});
		const execution = await executeStartupCatchupPlan(state, plan, completedOutcomeDrain);
		let finalizedOutcomes;
		try {
			let completedOutcomes;
			try {
				completedOutcomes = await completedOutcomeDrain.flush();
			} catch (drainError) {
				await applyStartupCatchupOutcomes(state, plan, execution.outcomes);
				throw drainError;
			}
			finalizedOutcomes = await applyStartupCatchupOutcomes(state, plan, completedOutcomes);
		} catch (finalizationError) {
			try {
				await releaseStartupCatchupReservationsAfterFailure(state, plan, execution.outcomes);
			} catch (cleanupError) {
				state.deps.log.warn({ err: String(cleanupError) }, execution.ok ? "cron: failed to release startup catch-up reservations after finalization error" : "cron: failed to release startup catch-up reservations after execution error");
			}
			throw execution.ok ? finalizationError : execution.error;
		}
		for (const outcome of finalizedOutcomes) maybeNotifyIsolatedAgentSetupTimeout(state, outcome);
		if (!execution.ok) throw execution.error;
	} finally {
		if (state.startupCatchup === catchup) state.startupCatchup = void 0;
	}
}
async function planStartupCatchup(state, opts) {
	const maxImmediate = Math.max(0, state.deps.maxMissedJobsPerRestart ?? 5);
	return locked(state, async () => {
		await ensureLoaded(state, { skipRecompute: true });
		if (state.stopped || !state.store) return {
			candidates: [],
			deferredJobs: []
		};
		const now = state.deps.nowMs();
		const missed = collectStartupCatchupJobs(state, now, { skipJobIds: opts?.skipJobIds });
		if (missed.length === 0) return {
			candidates: [],
			deferredJobs: []
		};
		const sorted = missed.toSorted((a, b) => (a.state.nextRunAtMs ?? 0) - (b.state.nextRunAtMs ?? 0));
		const deferredAgentJobs = opts?.deferAgentTurnJobs ? sorted.filter((job) => job.payload.kind === "agentTurn") : [];
		const startupEligible = opts?.deferAgentTurnJobs ? sorted.filter((job) => job.payload.kind !== "agentTurn") : sorted;
		const startupCandidates = startupEligible.slice(0, maxImmediate);
		const deferredOverflow = startupEligible.slice(maxImmediate);
		const deferredAgentDelayMs = Math.max(0, state.deps.startupDeferredMissedAgentJobDelayMs ?? 12e4);
		const deferredJob = (job, delayMs) => ({
			jobId: job.id,
			...delayMs === void 0 ? {} : { delayMs },
			scheduleIdentity: tryCronScheduleIdentity(job),
			createdAtMs: job.createdAtMs,
			payloadKind: job.payload.kind,
			scheduleActivatedAtMs: job.state.scheduleActivatedAtMs,
			nextRunAtMs: job.state.nextRunAtMs,
			lastRunAtMs: job.state.lastRunAtMs,
			lastRunStatus: job.state.lastRunStatus
		});
		const deferred = [...deferredOverflow.map((job) => deferredJob(job)), ...deferredAgentJobs.map((job) => deferredJob(job, deferredAgentDelayMs))];
		if (deferred.length > 0) state.deps.log.info({
			immediateCount: startupCandidates.length,
			deferredCount: deferred.length,
			totalMissed: missed.length
		}, "cron: staggering missed jobs to prevent gateway overload");
		if (deferredAgentJobs.length > 0) state.deps.log.info({
			count: deferredAgentJobs.length,
			jobIds: deferredAgentJobs.map((job) => job.id),
			delayMs: deferredAgentDelayMs
		}, "cron: deferring missed agent jobs until after gateway startup");
		if (startupCandidates.length > 0) state.deps.log.info({
			count: startupCandidates.length,
			jobIds: startupCandidates.map((j) => j.id)
		}, "cron: running missed jobs after restart");
		return {
			candidates: (await persistQueuedCronRunReservations({
				state,
				candidates: startupCandidates,
				reservedAtMs: now
			})).map(({ job, runReceipt }) => ({
				jobId: job.id,
				job,
				reservedAtMs: now,
				reservationIdentity: reserveQueuedCronRun(state, job.id, now, { runReceipt })
			})),
			deferredJobs: deferred
		};
	});
}
async function executeStartupCatchupPlan(state, plan, completedOutcomeDrain) {
	const outcomes = [];
	try {
		for (const candidate of plan.candidates) {
			if (state.stopped) break;
			const execution = await executeQueuedCronRun({
				state,
				jobId: candidate.jobId,
				reservedAtMs: candidate.reservedAtMs,
				reservationIdentity: candidate.reservationIdentity,
				runnableOptions: {
					skipAtIfAlreadyRan: true,
					allowCronMissedRunByLastRun: true
				},
				onNotRunnable: async () => {
					commitStartupCatchupRows({
						state,
						reservations: [candidate]
					});
				}
			});
			if (execution.kind === "stopped") break;
			if (execution.kind === "completed") {
				outcomes.push(execution.outcome);
				completedOutcomeDrain.enqueue(execution.outcome);
			}
		}
	} catch (error) {
		return {
			ok: false,
			outcomes,
			error
		};
	}
	return {
		ok: true,
		outcomes
	};
}
async function applyStartupCatchupOutcomes(state, plan, outcomes) {
	const staggerMs = Math.max(0, state.deps.missedJobStaggerMs ?? 5e3);
	await locked(state, async () => {
		await ensureLoaded(state, {
			forceReload: true,
			skipRecompute: true
		});
		if (!state.store) return;
		const startedJobIds = new Set(outcomes.map((outcome) => outcome.jobId));
		const pendingReleases = plan.candidates.filter((candidate) => !startedJobIds.has(candidate.jobId));
		if (state.stopped || outcomes.length === 0 && plan.deferredJobs.length === 0) {
			if (pendingReleases.length > 0) commitStartupCatchupRows({
				state,
				reservations: pendingReleases
			});
			return;
		}
		commitStartupCatchupRows({
			state,
			reservations: pendingReleases,
			deferredJobs: plan.deferredJobs,
			staggerMs
		});
		const maintenance = recomputeUnownedCronSchedules(state, { repairFutureCronNextRunAtMs: false });
		runPostPersistCronNotifications(state, maintenance.notifications);
		applyCronRuntimeRowsToState(state, maintenance.jobs);
	});
	return outcomes;
}
//#endregion
//#region src/cron/service/timer.ts
if (process.env.VITEST || false) globalThis[Symbol.for("openclaw.cronTimerTestApi")] = {
	executeJobCore,
	onTimer
};
//#endregion
//#region src/cron/service/ops-shared.ts
/** Shared cron operation invariants used across lifecycle, CRUD, and manual runs. */
/** Resolves the effective agent using explicit job identity before configured defaults. */
function resolveEffectiveJobAgentId(job, defaultAgentId) {
	return resolveCronJobEffectiveAgentId(job, defaultAgentId);
}
function markManualCronJobActive(state, job) {
	const jobId = job.id;
	state.activeManualRunJobIds.add(jobId);
	return markCronJobActive(jobId, {
		payloadKind: job.payload.kind,
		preserveAcrossGenerationAdvance: !runsDetachedFromMainSession(job)
	});
}
function clearManualCronJobActive(state, jobId, activeJobMarker) {
	state.activeManualRunJobIds.delete(jobId);
	clearCronJobActive(jobId, activeJobMarker);
	if (state.activeManualRunJobIds.size === 0) state.manualSetupTimeoutNotified = false;
}
function maybeNotifyManualIsolatedSetupTimeout(state, result) {
	if (!result.isolatedAgentSetupTimeout || state.manualSetupTimeoutNotified) return false;
	const notified = maybeNotifyIsolatedAgentSetupTimeout(state, result);
	state.manualSetupTimeoutNotified ||= notified;
	return notified;
}
async function ensureLoadedForRead(state) {
	await ensureLoaded(state, { skipRecompute: true });
	if (!state.store || state.schedulerStarted) return;
	const maintenance = recomputeUnownedCronSchedules(state);
	runPostPersistCronNotifications(state, maintenance.notifications);
	applyCronRuntimeRowsToState(state, maintenance.jobs);
}
/** Resolves the current configured default agent without caching reloadable state. */
function resolveCurrentDefaultAgentId(state) {
	return state.deps.resolveDefaultAgentId?.() ?? state.deps.defaultAgentId;
}
/** Returns whether a stream event still belongs to the job's current logical source. */
function ownsStreamSource(job, streamScheduleKey, streamSourceIdentity) {
	return job.schedule.kind === "stream" && cronStreamScheduleKey(job.schedule) === streamScheduleKey && job.state.streamSourceIdentity === streamSourceIdentity;
}
//#endregion
//#region src/cron/service/ops-run-preparation.ts
function emitCronRunFinished(state, evt, tracker, taskRunId, details) {
	const event = {
		...evt,
		completionStatus: evt.completionStatus ?? resolveCronCompletionStatus({
			status: evt.status,
			deliveryStatus: evt.deliveryStatus
		})
	};
	tryFinishCronTaskRun(state, {
		taskRunId,
		job: evt.job,
		event,
		errorClassification: details?.errorClassification,
		...details?.scriptResult ? { scriptResult: details.scriptResult } : {},
		...details?.triggerEval ? { triggerEval: details.triggerEval } : {}
	});
	emit(state, event, cronFailureNotificationEventContext(details?.failureNotificationDetail));
	if (tracker) tracker.emitted = true;
}
function admitsStreamSourceRun(job, streamScheduleKey, streamSourceIdentity) {
	if (streamScheduleKey === void 0 && streamSourceIdentity === void 0) return true;
	return streamScheduleKey !== void 0 && streamSourceIdentity !== void 0 && isJobEnabled(job) && ownsStreamSource(job, streamScheduleKey, streamSourceIdentity);
}
async function skipInvalidPersistedManualRun(params) {
	const postPersistNotifications = [];
	const endedAt = params.state.deps.nowMs();
	const errorText = normalizeCronRunErrorText(params.error);
	const diagnostics = createCronRunDiagnosticsFromError("cron-preflight", errorText, {
		severity: "warn",
		nowMs: params.state.deps.nowMs
	});
	applyJobResult(params.state, params.job, {
		status: "skipped",
		completionStatus: "failed",
		error: errorText,
		diagnostics,
		startedAt: endedAt,
		endedAt
	}, {
		scheduleMode: isImmediateCronRunMode(params.mode) ? "preserve" : "advance",
		deferredNotifications: postPersistNotifications
	});
	emitCronRunFinished(params.state, {
		jobId: params.job.id,
		action: "finished",
		job: params.job,
		status: "skipped",
		error: errorText,
		diagnostics,
		runId: params.runId,
		runAtMs: endedAt,
		durationMs: params.job.state.lastDurationMs,
		nextRunAtMs: params.job.state.nextRunAtMs,
		deliveryStatus: params.job.state.lastDeliveryStatus,
		deliveryError: params.job.state.lastDeliveryError,
		failureNotificationDelivery: failureNotificationDeliveryFromJobState(params.job)
	}, params.terminalTracker);
	const committedJob = commitCronRuntimeRows({
		state: params.state,
		jobIds: [params.job.id],
		operationLabel: "cron.invalid-manual-run",
		mutate: ({ jobs }) => {
			const current = jobs.get(params.job.id);
			if (!current || resolveCronJobConfigRevision(current) !== resolveCronJobConfigRevision(params.job)) return { value: void 0 };
			current.enabled = params.job.enabled;
			current.updatedAtMs = params.job.updatedAtMs;
			current.state = structuredClone(params.job.state);
			return {
				upsertJobIds: [current.id],
				value: current
			};
		}
	});
	if (!committedJob) {
		armTimer(params.state);
		return;
	}
	runPostPersistCronNotifications(params.state, postPersistNotifications);
	applyCronRuntimeRowsToState(params.state, [committedJob]);
	armTimer(params.state);
}
function recomputeManualRunPreflight(state, id, mode) {
	const maintenance = recomputeUnownedCronSchedules(state, {
		...isImmediateCronRunMode(mode) ? { preserveExpiredPacedNextRunJobId: id } : {},
		skipScheduleErrorHandling: true
	});
	runPostPersistCronNotifications(state, maintenance.notifications);
	applyCronRuntimeRowsToState(state, maintenance.jobs);
}
async function inspectManualRunPreflight(state, id, mode, runId, terminalTracker, streamScheduleKey, streamSourceIdentity) {
	return await locked(state, async () => {
		warnIfDisabled(state, "run");
		await ensureLoaded(state, { skipRecompute: true });
		if (state.stopped) return {
			ok: true,
			ran: false,
			reason: "stopped"
		};
		recomputeManualRunPreflight(state, id, mode);
		const job = findJobOrThrow(state, id);
		if (mode === "if-enabled" && (!isJobEnabled(job) || job.state.autoDisabled)) return {
			ok: true,
			ran: false,
			reason: "disabled"
		};
		if (!admitsStreamSourceRun(job, streamScheduleKey, streamSourceIdentity)) return {
			ok: true,
			ran: false,
			reason: "not-due"
		};
		try {
			assertSupportedJobSpec(job);
		} catch (error) {
			await skipInvalidPersistedManualRun({
				state,
				job,
				mode,
				runId,
				terminalTracker,
				error
			});
			return {
				ok: true,
				ran: false,
				reason: "invalid-spec"
			};
		}
		if (hasActiveCronRun(job)) return {
			ok: true,
			ran: false,
			reason: "already-running"
		};
		const now = state.deps.nowMs();
		if (!isJobDue(job, now, { forced: isImmediateCronRunMode(mode) })) return {
			ok: true,
			ran: false,
			reason: "not-due"
		};
		return {
			ok: true,
			runnable: true,
			job,
			now
		};
	});
}
async function inspectManualRunDisposition(state, id, mode) {
	const result = await inspectManualRunPreflight(state, id, mode);
	if (!result.ok) return result;
	if ("reason" in result) return result;
	return {
		ok: true,
		runnable: true
	};
}
async function prepareManualRun(state, id, mode, opts) {
	const preflight = await inspectManualRunPreflight(state, id, mode, opts?.runId, opts?.terminalTracker, opts?.streamScheduleKey, opts?.streamSourceIdentity);
	if (!preflight.ok) return preflight;
	if ("reason" in preflight) return {
		ok: true,
		ran: false,
		reason: preflight.reason
	};
	return await locked(state, async () => {
		if (state.stopped) return {
			ok: true,
			ran: false,
			reason: "stopped"
		};
		await ensureLoaded(state, { skipRecompute: true });
		recomputeManualRunPreflight(state, id, mode);
		const job = findJobOrThrow(state, id);
		if (mode === "if-enabled" && (!isJobEnabled(job) || job.state.autoDisabled)) return {
			ok: true,
			ran: false,
			reason: "disabled"
		};
		if (!admitsStreamSourceRun(job, opts?.streamScheduleKey, opts?.streamSourceIdentity)) return {
			ok: true,
			ran: false,
			reason: "not-due"
		};
		try {
			assertSupportedJobSpec(job);
		} catch (error) {
			await skipInvalidPersistedManualRun({
				state,
				job,
				mode,
				runId: opts?.runId,
				terminalTracker: opts?.terminalTracker,
				error
			});
			return {
				ok: true,
				ran: false,
				reason: "invalid-spec"
			};
		}
		if (hasActiveCronRun(job)) return {
			ok: true,
			ran: false,
			reason: "already-running"
		};
		opts?.commitGuard?.();
		const reservationAt = state.deps.nowMs();
		if (!isJobDue(job, reservationAt, { forced: isImmediateCronRunMode(mode) })) return {
			ok: true,
			ran: false,
			reason: "not-due"
		};
		const [reserved] = await persistQueuedCronRunReservations({
			state,
			candidates: [job],
			...isImmediateCronRunMode(mode) ? { immediateJobIds: /* @__PURE__ */ new Set([job.id]) } : {},
			reservedAtMs: reservationAt
		});
		if (!reserved) return {
			ok: true,
			ran: false,
			reason: "already-running"
		};
		const reservedJob = reserved.job;
		const reservationIdentity = reserveQueuedCronRun(state, reservedJob.id, reservationAt, {
			runReceipt: reserved.runReceipt,
			preserveWhenDisabled: mode === "force" && !isJobEnabled(job)
		});
		if (state.stopped) {
			try {
				await releasePreparedManualReservationWithRetry(state, {
					jobId: reservedJob.id,
					reservationIdentity
				});
			} catch (error) {
				releaseQueuedCronRun(state, job.id, reservationIdentity);
				throw error;
			}
			return {
				ok: true,
				ran: false,
				reason: "stopped"
			};
		}
		return {
			ok: true,
			ran: true,
			jobId: reservedJob.id,
			runId: opts?.runId,
			terminalTracker: opts?.terminalTracker,
			owningCronLaneTaskMarker: opts?.owningCronLaneTaskMarker,
			reservationAt,
			scheduleOwnershipAtMs: opts?.scheduleOwnershipAtMs ?? reservationAt,
			reservationIdentity,
			wasEnabled: isJobEnabled(job),
			...opts?.payload ? { payload: structuredClone(opts.payload) } : {},
			...opts?.evaluateTrigger ? { evaluateTrigger: true } : {},
			...opts?.streamBatch !== void 0 ? { streamBatch: opts.streamBatch } : {},
			...opts?.streamScheduleKey !== void 0 ? { streamScheduleKey: opts.streamScheduleKey } : {},
			...opts?.streamSourceIdentity !== void 0 ? { streamSourceIdentity: opts.streamSourceIdentity } : {},
			...opts?.onTriggerDisposition ? { onTriggerDisposition: opts.onTriggerDisposition } : {}
		};
	});
}
async function activatePreparedManualRun(state, prepared, mode) {
	return await locked(state, async () => {
		await ensureLoaded(state, {
			forceReload: true,
			skipRecompute: true
		});
		if (state.stopped) {
			await releasePreparedManualReservationWithRetry(state, prepared);
			return {
				ok: true,
				ran: false,
				reason: "stopped"
			};
		}
		const job = state.store?.jobs.find((entry) => entry.id === prepared.jobId);
		if (!job) {
			await releasePreparedManualReservationWithRetry(state, prepared);
			return {
				ok: true,
				ran: false,
				reason: "not-due"
			};
		}
		if (!isQueuedCronRunReservationCurrent(state, prepared.jobId, prepared.reservationIdentity) || job.state.queuedAtMs !== prepared.reservationAt) {
			await releasePreparedManualReservationWithRetry(state, prepared);
			return {
				ok: true,
				ran: false,
				reason: "not-due"
			};
		}
		if (mode === "if-enabled" && (!isJobEnabled(job) || job.state.autoDisabled)) {
			await releasePreparedManualReservationWithRetry(state, prepared);
			return {
				ok: true,
				ran: false,
				reason: "disabled"
			};
		}
		if (!admitsStreamSourceRun(job, prepared.streamScheduleKey, prepared.streamSourceIdentity)) {
			await releasePreparedManualReservationWithRetry(state, prepared);
			return {
				ok: true,
				ran: false,
				reason: "not-due"
			};
		}
		const dueProbe = structuredClone(job);
		delete dueProbe.state.queuedAtMs;
		if (prepared.wasEnabled && !isJobEnabled(job) || !isJobDue(dueProbe, state.deps.nowMs(), { forced: isImmediateCronRunMode(mode) })) {
			await releasePreparedManualReservationWithRetry(state, prepared);
			return {
				ok: true,
				ran: false,
				reason: "not-due"
			};
		}
		try {
			assertSupportedJobSpec(job);
		} catch (error) {
			await skipInvalidPersistedManualRun({
				state,
				job,
				mode,
				runId: prepared.runId,
				terminalTracker: prepared.terminalTracker,
				error
			});
			releaseQueuedCronRun(state, prepared.jobId, prepared.reservationIdentity);
			return {
				ok: true,
				ran: false,
				reason: "invalid-spec"
			};
		}
		const activation = await activateQueuedCronRun({
			state,
			job,
			reservationIdentity: prepared.reservationIdentity,
			onUnavailableRollbackError: async () => {
				await releasePreparedManualReservationWithRetry(state, prepared);
			}
		});
		if (activation.kind === "unavailable") return {
			ok: true,
			ran: false,
			reason: activation.reason
		};
		if (activation.kind === "fenced") {
			await releasePreparedManualReservationWithRetry(state, prepared);
			return {
				ok: true,
				ran: false,
				reason: "already-running"
			};
		}
		const { job: activatedJob, startedAt } = activation;
		emit(state, {
			jobId: activatedJob.id,
			action: "started",
			job: activatedJob,
			runAtMs: startedAt
		});
		const taskRun = tryCreateCronTaskRunHandle({
			state,
			job: activatedJob,
			startedAt,
			runReceipt: activation.runReceipt,
			publicRunId: prepared.runId
		});
		const taskRunId = taskRun?.runId;
		const activeJobMarker = markManualCronJobActive(state, job);
		const admittedJob = structuredClone(activatedJob);
		const executionJob = structuredClone(activatedJob);
		if (isImmediateCronRunMode(mode) && executionJob.trigger && !prepared.evaluateTrigger) delete executionJob.trigger;
		if (prepared.payload) executionJob.payload = structuredClone(prepared.payload);
		return {
			...prepared,
			startedAt,
			runId: prepared.runId ?? taskRunId,
			taskRunId,
			taskId: taskRun?.taskId,
			flowId: taskRun?.flowId,
			activeJobMarker,
			admittedJob,
			executionJob,
			runReceipt: activation.runReceipt
		};
	});
}
async function releasePreparedManualReservation(state, prepared) {
	if (state.queuedRunReservationsByJobId.get(prepared.jobId)?.identity !== prepared.reservationIdentity) return;
	const committedJob = commitCronRuntimeRows({
		state,
		jobIds: [prepared.jobId],
		operationLabel: "cron.manual-reservation-cleanup",
		mutate: ({ database, jobs }) => {
			const job = jobs.get(prepared.jobId);
			const ownership = state.queuedRunReservationsByJobId.get(prepared.jobId);
			if (ownership?.identity !== prepared.reservationIdentity) return { value: void 0 };
			finishCronRunReceiptInDatabase({
				database,
				handle: ownership.runReceipt,
				status: "skipped",
				finishedAtMs: state.deps.nowMs(),
				error: "cron manual reservation abandoned before completion"
			});
			if (!job) return { value: void 0 };
			const queuedMatches = ownership.markerAtMs === job.state.queuedAtMs;
			const runningMatches = ownership.markerAtMs === job.state.runningAtMs;
			if (!queuedMatches && !runningMatches) return { value: void 0 };
			if (ownership.activationPreviousLastError) job.state.lastError = ownership.activationPreviousLastError.value;
			if (queuedMatches) delete job.state.queuedAtMs;
			if (runningMatches) delete job.state.runningAtMs;
			return {
				upsertJobIds: [job.id],
				value: job
			};
		}
	});
	if (committedJob) applyCronRuntimeRowsToState(state, [committedJob]);
	const ownership = state.queuedRunReservationsByJobId.get(prepared.jobId);
	if (ownership?.identity === prepared.reservationIdentity) releaseLocalCronRunReceiptOwnership(ownership.runReceipt);
	releaseQueuedCronRun(state, prepared.jobId, prepared.reservationIdentity);
}
async function releasePreparedManualReservationWithRetry(state, prepared) {
	try {
		await releasePreparedManualReservation(state, prepared);
	} catch {
		try {
			await releasePreparedManualReservation(state, prepared);
		} catch (error) {
			const ownership = state.queuedRunReservationsByJobId.get(prepared.jobId);
			if (ownership?.identity === prepared.reservationIdentity) releaseLocalCronRunReceiptOwnership(ownership.runReceipt);
			releaseQueuedCronRun(state, prepared.jobId, prepared.reservationIdentity);
			throw error;
		}
	}
}
async function releasePreparedManualReservationAfterReloadWithRetry(state, prepared) {
	await cleanupQueuedCronRunReservations({
		state,
		reservations: [prepared],
		restoreLastError: false
	});
}
//#endregion
//#region src/cron/service/ops-lifecycle.ts
function emitInterruptedRun(state, interrupted) {
	const job = state.store?.jobs.find((entry) => entry.id === interrupted.jobId);
	emitCronRunFinished(state, {
		jobId: interrupted.jobId,
		action: "finished",
		job,
		status: "error",
		error: STARTUP_INTERRUPTED_ERROR,
		delivered: false,
		deliveryStatus: "unknown",
		deliveryError: STARTUP_INTERRUPTED_ERROR,
		failureNotificationDelivery: job ? failureNotificationDeliveryFromJobState(job) : void 0,
		runAtMs: interrupted.runAtMs,
		durationMs: interrupted.durationMs,
		nextRunAtMs: job?.state.nextRunAtMs
	}, void 0, interrupted.taskRunId);
}
function applyRecoveryResult(params) {
	const { state, proposal, result } = params;
	if (result.kind === "live") {
		enrollForeignReceipt(state, result.receipt);
		params.skipJobIds?.add(proposal.jobId);
		return false;
	}
	if (result.kind === "superseded") {
		if (result.receipt) {
			enrollForeignReceipt(state, result.receipt);
			params.skipJobIds?.add(proposal.jobId);
		} else removeForeignReceipt(state, proposal.jobId);
		return true;
	}
	removeForeignReceipt(state, proposal.jobId);
	runPostPersistCronNotifications(state, result.notifications);
	if (result.interrupted) params.interruptedRuns.push(result.interrupted);
	if (result.skipStartupCatchup) params.skipJobIds?.add(proposal.jobId);
	return true;
}
async function reconcileForeignRunReceipts(state) {
	let schedulingChanged = false;
	const interruptedRuns = [];
	await locked(state, async () => {
		if (state.stopped) return;
		for (const receipt of listForeignReceipts(state)) {
			const job = state.store?.jobs.find((entry) => entry.id === receipt.jobId);
			const proposal = {
				jobId: receipt.jobId,
				...job?.state.queuedAtMs !== void 0 ? { queuedAtMs: job.state.queuedAtMs } : {},
				...job?.state.runningAtMs !== void 0 ? { runningAtMs: job.state.runningAtMs } : {},
				receipt
			};
			schedulingChanged = applyRecoveryResult({
				state,
				proposal,
				result: recoverCronRunProposal(state, proposal),
				interruptedRuns
			}) || schedulingChanged;
		}
		if (schedulingChanged) {
			await ensureLoaded(state, {
				forceReload: true,
				skipRecompute: true
			});
			for (const interrupted of interruptedRuns) emitInterruptedRun(state, interrupted);
		}
	});
	if (schedulingChanged) armTimer(state);
}
/** Starts the cron service, atomically repairs abandoned runs, and arms scheduling. */
async function start(state) {
	state.stopped = false;
	stopForeignReceiptMonitor(state);
	configureForeignReceiptMonitor(state, async () => await reconcileForeignRunReceipts(state));
	if (!state.deps.cronEnabled) {
		state.deps.log.info({ enabled: false }, "cron: disabled");
		return;
	}
	const interruptedRuns = [];
	const skipJobIds = /* @__PURE__ */ new Set();
	await locked(state, async () => {
		await ensureLoaded(state, { skipRecompute: true });
		if (state.stopped) return;
		if (state.deps.legacyDefaultAgentId) {
			const rewritten = await materializeLegacyDefaultCronJobOwners({
				storePath: state.deps.storePath,
				legacyDefaultAgentId: state.deps.legacyDefaultAgentId
			});
			if (rewritten > 0) {
				state.deps.log.info({
					storePath: state.deps.storePath,
					rewritten
				}, "cron: assigned legacy jobs to the retained owner");
				await ensureLoaded(state, {
					forceReload: true,
					skipRecompute: true
				});
			}
		}
		const proposals = [];
		for (const job of state.store?.jobs ?? []) {
			job.state ??= {};
			if (typeof job.state.queuedAtMs === "number") proposals.push(proposeCronRunRecovery(state, job.id, job.state.queuedAtMs, void 0));
			if (typeof job.state.runningAtMs === "number") proposals.push(proposeCronRunRecovery(state, job.id, void 0, job.state.runningAtMs));
		}
		for (const proposal of proposals) applyRecoveryResult({
			state,
			proposal,
			result: recoverCronRunProposal(state, proposal, "startup"),
			interruptedRuns,
			skipJobIds
		});
		if (proposals.length > 0) await ensureLoaded(state, {
			forceReload: true,
			skipRecompute: true
		});
		if (listForeignReceipts(state).length > 0) {
			const maintenance = recomputeUnownedCronSchedules(state);
			runPostPersistCronNotifications(state, maintenance.notifications);
			if (maintenance.changed) applyCronRuntimeRowsToState(state, maintenance.jobs);
		}
	});
	if (state.stopped) return;
	for (const interrupted of interruptedRuns) emitInterruptedRun(state, interrupted);
	await runMissedJobs(state, {
		skipJobIds: skipJobIds.size > 0 ? skipJobIds : void 0,
		deferAgentTurnJobs: true
	});
	await locked(state, async () => {
		await ensureLoaded(state, {
			forceReload: true,
			skipRecompute: true
		});
		if (state.stopped) return;
		if (listForeignReceipts(state).length === 0) {
			const maintenance = recomputeUnownedCronSchedules(state, { recomputeExpired: true });
			runPostPersistCronNotifications(state, maintenance.notifications);
			applyCronRuntimeRowsToState(state, maintenance.jobs);
		}
		armTimer(state);
		resumeForeignReceiptMonitor(state);
		state.deps.log.info({
			enabled: true,
			jobs: state.store?.jobs.length ?? 0,
			nextWakeAtMs: nextWakeAtMs(state) ?? null
		}, "cron: started");
	});
}
/** Stops the cron service timer without mutating persisted job state. */
function stop(state) {
	state.lifecycleGeneration += 1;
	state.stopped = true;
	cancelCronRunAdmissionWaiters(state);
	state.schedulerStarted = false;
	stopForeignReceiptMonitor(state);
	stopTimer(state);
}
/** Temporarily stops automatic ticks without running startup recovery on resume. */
function pauseScheduling(state) {
	state.schedulingPaused = true;
	stopTimer(state);
}
function resumeScheduling(state) {
	if (!state.schedulingPaused) return;
	state.schedulingPaused = false;
	if (!state.schedulerStarted) return;
	try {
		armTimer(state);
		resumeForeignReceiptMonitor(state);
	} catch (err) {
		state.schedulingPaused = true;
		stopTimer(state);
		throw err;
	}
}
//#endregion
//#region src/cron/skill-collection-review-monitor.ts
/** Canonical projection from skill workshop config to system-owned cron jobs. */
const SKILL_COLLECTION_REVIEW_DECLARATION_PREFIX = "skill-collection-review:";
const SKILL_COLLECTION_REVIEW_EVERY_MS = 6048e5;
function skillCollectionReviewMonitorAgentId(job) {
	const key = job.declarationKey;
	if (!key?.startsWith("skill-collection-review:") || job.payload.kind !== "skillCollectionReview") return;
	return key.slice(24) || void 0;
}
function resolveSkillCollectionReviewMonitorSpecs(cfg, options = {}) {
	const workspaceAgents = /* @__PURE__ */ new Map();
	for (const agentId of listAgentIds(cfg)) {
		const workspaceDir = canonicalizePath(resolveAgentWorkspaceDir(cfg, agentId));
		const agentIds = workspaceAgents.get(workspaceDir) ?? [];
		agentIds.push(agentId);
		workspaceAgents.set(workspaceDir, agentIds);
	}
	const schedulerSeed = resolveHeartbeatSchedulerSeed(options.schedulerSeed);
	const enabled = resolveSkillWorkshopConfig(cfg).autonomous.mode === "auto";
	return [...workspaceAgents.values()].flatMap((agentIds) => {
		const agentId = agentIds[0];
		if (!agentId) return [];
		return [{
			agentId,
			input: {
				declarationKey: `${SKILL_COLLECTION_REVIEW_DECLARATION_PREFIX}${agentId}`,
				name: `skill-collection-review-${agentId}`,
				displayName: `Skill collection review (${agentId})`,
				agentId,
				enabled,
				schedule: {
					kind: "every",
					everyMs: SKILL_COLLECTION_REVIEW_EVERY_MS,
					anchorMs: resolveHeartbeatPhaseMs({
						schedulerSeed,
						agentId,
						intervalMs: SKILL_COLLECTION_REVIEW_EVERY_MS
					})
				},
				payload: { kind: "skillCollectionReview" },
				sessionTarget: "main",
				wakeMode: "next-heartbeat"
			}
		}];
	});
}
//#endregion
//#region src/cron/system-owned-declaration.ts
/** Declaration-key namespaces reserved for jobs the gateway converges itself. */
const SYSTEM_OWNED_DECLARATION_PREFIXES = [HEARTBEAT_TASK_DECLARATION_PREFIX, SKILL_COLLECTION_REVIEW_DECLARATION_PREFIX];
function systemOwnedDeclarationKeyNamespace(declarationKey) {
	return SYSTEM_OWNED_DECLARATION_PREFIXES.find((prefix) => declarationKey?.startsWith(prefix));
}
//#endregion
//#region src/cron/service/ops-mutations.ts
const RETRY_ADD_AFTER_SESSION_CLEANUP = /* @__PURE__ */ new Error("retry add after session cleanup");
async function resolveConfiguredChannelsForValidation(state) {
	if (!state.deps.listConfiguredChannels) return;
	try {
		return await state.deps.listConfiguredChannels();
	} catch {
		state.deps.log.debug({}, "cron: configured channel validation skipped");
		return;
	}
}
function reconcileStreamSourceIdentity(job, nextJob) {
	if (nextJob.schedule.kind !== "stream") {
		nextJob.state.streamSourceIdentity = void 0;
		return;
	}
	const sourceChanged = job.schedule.kind !== "stream" || cronStreamScheduleKey(job.schedule) !== cronStreamScheduleKey(nextJob.schedule) || isJobEnabled(job) !== isJobEnabled(nextJob);
	const currentIdentity = job.schedule.kind === "stream" ? job.state.streamSourceIdentity : void 0;
	nextJob.state.streamSourceIdentity = sourceChanged || !currentIdentity ? createCronStreamSourceIdentity() : currentIdentity;
}
function finalizeUpdatedJob(params) {
	const { job, nextJob, now } = params;
	if (nextJob.schedule.kind === "every") {
		const anchor = nextJob.schedule.anchorMs;
		if (typeof anchor !== "number" || !Number.isFinite(anchor)) {
			const fallbackAnchorMs = (job.schedule.kind === "every" && job.schedule.everyMs === nextJob.schedule.everyMs && typeof job.schedule.anchorMs === "number" && Number.isFinite(job.schedule.anchorMs) ? job.schedule.anchorMs : void 0) ?? (params.scheduleChanged ? now : typeof nextJob.createdAtMs === "number" && Number.isFinite(nextJob.createdAtMs) ? nextJob.createdAtMs : now);
			nextJob.schedule = {
				...nextJob.schedule,
				anchorMs: Math.max(0, Math.floor(fallbackAnchorMs))
			};
		}
	}
	reconcileStreamSourceIdentity(job, nextJob);
	const previousScript = job.payload.kind === "script" ? job.payload.script : void 0;
	const nextScript = nextJob.payload.kind === "script" ? nextJob.payload.script : void 0;
	if (!isDeepStrictEqual(job.trigger, nextJob.trigger) || previousScript !== nextScript) for (const field of [
		"triggerState",
		"triggerEvalCount",
		"lastTriggerEvalAtMs",
		"lastTriggerFireAtMs"
	]) if (params.explicitTriggerState && Object.hasOwn(params.explicitTriggerState, field)) Object.assign(nextJob.state, { [field]: params.explicitTriggerState[field] });
	else delete nextJob.state[field];
	const schedulingInputsChanged = params.schedulingInputsRequested && !cronSchedulingInputsEqual(job, nextJob);
	if (params.scheduleChanged && nextJob.schedule.kind === "cron" && !isJobEnabled(nextJob)) computeJobNextRunAtMs({
		...nextJob,
		enabled: true
	}, now);
	nextJob.updatedAtMs = now;
	if (schedulingInputsChanged) {
		nextJob.state.scheduleActivatedAtMs = now;
		nextJob.state.startupCatchupAtMs = void 0;
		nextJob.state.pacedNextRunAtMs = void 0;
		nextJob.state.forcePreservedNextRunAtMs = void 0;
		if (isJobEnabled(nextJob)) nextJob.state.nextRunAtMs = computeJobNextRunAtMs(nextJob, now);
		else {
			nextJob.state.nextRunAtMs = void 0;
			nextJob.state.queuedAtMs = void 0;
			if (!isCronJobActive(nextJob.id)) nextJob.state.runningAtMs = void 0;
		}
	} else if (isJobEnabled(nextJob) && !hasScheduledNextRunAtMs(nextJob.state.nextRunAtMs)) nextJob.state.nextRunAtMs = computeJobNextRunAtMs(nextJob, now);
}
async function persistUpdatedJob(params) {
	const { state, snapshot, previousJob, nextJob } = params;
	if (nextJob.state.queuedAtMs !== void 0 && resolveCronJobConfigRevision(previousJob) !== resolveCronJobConfigRevision(nextJob)) delete nextJob.state.queuedAtMs;
	if (state.store) {
		const index = state.store.jobs.findIndex((entry) => entry.id === nextJob.id);
		if (index >= 0) state.store.jobs[index] = nextJob;
	}
	const defaultAgentId = resolveCurrentDefaultAgentId(state);
	const ownerChanged = resolveEffectiveJobAgentId(previousJob, defaultAgentId) !== resolveEffectiveJobAgentId(nextJob, defaultAgentId);
	await persistOrRestore(state, snapshot, {
		suppressScheduledJobId: nextJob.id,
		transactionHooks: ownerChanged ? cronRunReceiptOwnerMutationHooks({
			state,
			jobId: nextJob.id
		}) : void 0
	});
	if (!cronSchedulingInputsEqual(previousJob, nextJob)) noteActiveCronJobScheduleMutation(nextJob.id);
	if (isJobEnabled(previousJob) && !isJobEnabled(nextJob)) requestActiveCronJobCancellation(nextJob.id, "Cron job disabled by operator.");
	if (!isDeepStrictEqual(previousJob.trigger, nextJob.trigger) || !isDeepStrictEqual(previousJob.state.triggerState, nextJob.state.triggerState) || (previousJob.payload.kind === "script" || nextJob.payload.kind === "script") && !isDeepStrictEqual(previousJob.payload, nextJob.payload)) noteActiveCronJobTriggerMutation(nextJob.id);
	armTimer(state);
	emit(state, {
		jobId: nextJob.id,
		action: "updated",
		job: nextJob,
		nextRunAtMs: nextJob.state.nextRunAtMs
	});
}
function declarativeFields(job, includeEnabled) {
	return {
		schedule: job.schedule,
		pacing: job.pacing,
		trigger: job.trigger,
		payload: job.payload,
		scheduledToolPolicy: job.scheduledToolPolicy,
		toolsAllowProvenance: job.toolsAllowProvenance,
		toolsAllowExecTarget: job.toolsAllowExecTarget,
		runtimeAuthority: job.runtimeAuthority,
		runtimeAuthorityRecoveryRequired: job.runtimeAuthorityRecoveryRequired,
		delivery: job.delivery,
		displayName: job.displayName,
		...includeEnabled ? { enabled: job.enabled } : {}
	};
}
function consumeRuntimeAuthorityMutationOptions(opts) {
	opts?.commitGuard?.();
	return {
		captured: opts?.captureRuntimeAuthority !== void 0,
		runtimeAuthority: opts?.captureRuntimeAuthority?.()
	};
}
/** Adds or converges a declaration-keyed cron job inside one store lock and write transaction. */
async function add(state, input, opts) {
	let pendingSessionCleanup;
	return await locked(state, async () => {
		warnIfDisabled(state, "add");
		const declarationKey = normalizeOptionalString(input.declarationKey);
		if (input.payload && isSystemOwnedCronPayloadKind(input.payload.kind) && opts?.systemOwned !== true) throw new Error("system-owned payloads cannot be created by cron clients");
		const systemOwnedDeclarationNamespace = systemOwnedDeclarationKeyNamespace(declarationKey);
		if (systemOwnedDeclarationNamespace && opts?.systemOwned !== true) throw new Error(`cron declarationKey namespace "${systemOwnedDeclarationNamespace}" is system-owned; jobs cannot be created with it`);
		await ensureLoaded(state, { skipRecompute: true });
		const agentId = resolveEffectiveJobAgentId(input, resolveCurrentDefaultAgentId(state));
		if (state.deps.isAgentAvailable?.(agentId) === false) throw new Error(`cron job agent is unavailable: ${agentId}`);
		const normalizedId = normalizeOptionalString(input.id);
		if (input.id !== void 0 && !normalizedId) throw new Error("cron job id must not be blank");
		if (normalizedId) {
			normalizeCronTaskRunJobId(normalizedId);
			pendingSessionCleanup = getPendingCronSessionCleanup(state, normalizedId);
			if (pendingSessionCleanup) throw RETRY_ADD_AFTER_SESSION_CLEANUP;
		}
		const normalizedInput = normalizedId ? {
			...input,
			id: normalizedId
		} : input;
		const matches = declarationKey ? state.store?.jobs.filter((job) => job.declarationKey === declarationKey && (opts?.matchesExisting?.(job) ?? true)) ?? [] : [];
		if (matches.length > 1) throw new Error(`cron declarationKey is ambiguous within caller scope: ${declarationKey}`);
		const existing = matches[0];
		const configuredChannels = await resolveConfiguredChannelsForValidation(state);
		if (existing) {
			if (isSystemOwnedCronPayloadKind(existing.payload.kind) && opts?.systemOwned !== true) throw new Error("system-owned monitor jobs cannot be edited by cron clients");
			const now = state.deps.nowMs();
			const nextJob = structuredClone(existing);
			applyDeclarativeJobSpec(nextJob, normalizedInput, {
				defaultAgentId: state.deps.defaultAgentId,
				enabledExplicit: opts?.enabledExplicit === true,
				nowMs: now,
				cronConfig: state.deps.cronConfig,
				scheduledToolPolicy: opts?.scheduledToolPolicy,
				toolsAllowProvenance: opts?.toolsAllowProvenance,
				toolsAllowExecTarget: opts?.toolsAllowExecTarget,
				configuredChannels
			});
			const runtimeAuthorityMutation = consumeRuntimeAuthorityMutationOptions(opts);
			reconcileRuntimeAuthority({
				job: nextJob,
				...runtimeAuthorityMutation,
				explicitlyMutatesToolsAllow: normalizedInput.payload.toolsAllow !== void 0
			});
			const includeEnabled = opts?.enabledExplicit === true;
			if (isDeepStrictEqual(declarativeFields(existing, includeEnabled), declarativeFields(nextJob, includeEnabled))) return {
				...existing,
				created: false,
				updated: false,
				job: existing
			};
			const snapshot = snapshotStoreForRollback(state);
			finalizeUpdatedJob({
				job: existing,
				nextJob,
				now,
				schedulingInputsRequested: true,
				scheduleChanged: !isDeepStrictEqual(existing.schedule, nextJob.schedule),
				explicitTriggerState: normalizedInput.state
			});
			await persistUpdatedJob({
				state,
				snapshot,
				previousJob: existing,
				nextJob
			});
			return {
				...nextJob,
				created: false,
				updated: true,
				job: nextJob
			};
		}
		if (normalizedId && state.store?.jobs.some((job) => job.id === normalizedId)) throw new Error(`cron job already exists: ${normalizedId}`);
		const explicitOwnerAgentId = normalizeOptionalAgentId(normalizedInput.agentId) ?? parseAgentSessionKey(normalizeOptionalString(normalizedInput.sessionKey))?.agentId;
		const retainedLegacyAgentId = normalizeOptionalAgentId(state.deps.legacyDefaultAgentId);
		const creationInput = !explicitOwnerAgentId && retainedLegacyAgentId === agentId ? {
			...normalizedInput,
			agentId
		} : normalizedInput;
		const snapshot = snapshotStoreForRollback(state);
		const job = createJob(state, creationInput, {
			scheduledToolPolicy: opts?.scheduledToolPolicy,
			toolsAllowProvenance: opts?.toolsAllowProvenance,
			toolsAllowExecTarget: opts?.toolsAllowExecTarget,
			configuredChannels
		});
		if (opts?.createdActor) job.createdActor = structuredClone(opts.createdActor);
		if (opts?.skillLibrarySelections) job.skillLibrarySelections = structuredClone(opts.skillLibrarySelections);
		const runtimeAuthorityMutation = consumeRuntimeAuthorityMutationOptions(opts);
		reconcileRuntimeAuthority({
			job,
			...runtimeAuthorityMutation,
			explicitlyMutatesToolsAllow: normalizedInput.payload.toolsAllow !== void 0
		});
		state.store?.jobs.push(job);
		const postPersistNotifications = [];
		recomputeNextRunsForMaintenance(state, { deferredNotifications: postPersistNotifications });
		await persistOrRestore(state, snapshot, {
			postPersistNotifications,
			suppressScheduledJobId: job.id
		});
		armTimer(state);
		state.deps.log.info({
			jobId: job.id,
			jobName: job.name,
			nextRunAtMs: job.state.nextRunAtMs,
			schedulerNextWakeAtMs: nextWakeAtMs(state) ?? null,
			timerArmed: state.timer !== null,
			cronEnabled: state.deps.cronEnabled
		}, "cron: job added");
		emit(state, {
			jobId: job.id,
			action: "added",
			job,
			nextRunAtMs: job.state.nextRunAtMs
		});
		return declarationKey ? {
			...job,
			created: true,
			job
		} : job;
	}).catch(async (error) => {
		if (error !== RETRY_ADD_AFTER_SESSION_CLEANUP || !pendingSessionCleanup) throw error;
		await pendingSessionCleanup;
		return await add(state, input, opts);
	});
}
/** Prunes an owned job family from obsolete store partitions after active-store convergence. */
async function removeStaleJobFamily(state, family) {
	return await locked(state, async () => {
		await ensureLoaded(state, { skipRecompute: true });
		return removeStaleCronJobFamilyRows(state.deps.storePath, family);
	});
}
async function updateLoadedJob(params) {
	const { state, id, patch, precondition, opts } = params;
	warnIfDisabled(state, "update");
	if (patch.payload && isSystemOwnedCronPayloadKind(patch.payload.kind)) throw new Error("system-owned payloads cannot be patched by cron clients");
	await ensureLoaded(state, { skipRecompute: true });
	const job = findJobOrThrow(state, id);
	if (isSystemOwnedCronPayloadKind(job.payload.kind)) throw new Error("system-owned monitor jobs cannot be edited by cron clients");
	const now = state.deps.nowMs();
	const configuredChannels = cronPatchTouchesDeliveryResolution(patch) ? await resolveConfiguredChannelsForValidation(state) : void 0;
	await precondition?.(structuredClone(job), now);
	const nextJob = structuredClone(job);
	applyJobPatch(nextJob, patch, {
		defaultAgentId: state.deps.defaultAgentId,
		scheduleValidationNowMs: now,
		cronConfig: state.deps.cronConfig,
		scheduledToolPolicy: opts?.scheduledToolPolicy,
		toolsAllowProvenance: opts?.toolsAllowProvenance,
		toolsAllowExecTarget: opts?.toolsAllowExecTarget,
		configuredChannels
	});
	if (patch.agentId !== void 0) {
		const agentId = resolveEffectiveJobAgentId(nextJob, resolveCurrentDefaultAgentId(state));
		if (state.deps.isAgentAvailable?.(agentId) === false) throw new Error(`cron job agent is unavailable: ${agentId}`);
	}
	finalizeUpdatedJob({
		job,
		nextJob,
		now,
		schedulingInputsRequested: patch.schedule !== void 0 || patch.enabled !== void 0 || "trigger" in patch || "pacing" in patch,
		scheduleChanged: patch.schedule !== void 0,
		explicitTriggerState: patch.state
	});
	const runtimeAuthorityMutation = consumeRuntimeAuthorityMutationOptions(opts);
	reconcileRuntimeAuthority({
		job: nextJob,
		...runtimeAuthorityMutation,
		explicitlyMutatesToolsAllow: patch.payload !== void 0 && Object.hasOwn(patch.payload, "toolsAllow")
	});
	await persistUpdatedJob({
		state,
		snapshot: snapshotStoreForRollback(state),
		previousJob: job,
		nextJob
	});
	return nextJob;
}
/** Updates a cron job patch in-place, recomputes affected schedule state, and persists it. */
async function update(state, id, patch, opts) {
	return await locked(state, async () => await updateLoadedJob({
		state,
		id,
		patch,
		opts
	}));
}
/** Updates a cron job only after a store-locked caller precondition passes. */
async function updateWithPrecondition(state, id, patch, precondition, opts) {
	return await locked(state, async () => await updateLoadedJob({
		state,
		id,
		patch,
		precondition,
		opts
	}));
}
/** Removes a cron job by id and re-arms the timer when the in-memory store changes. */
async function remove(state, id, opts) {
	let sessionCleanup;
	const result = await locked(state, async () => {
		warnIfDisabled(state, "remove");
		const previousStore = state.store;
		await ensureLoaded(state, { skipRecompute: true });
		if (!state.store) return {
			ok: false,
			removed: false
		};
		const removedJob = state.store.jobs.find((j) => j.id === id);
		if (!removedJob) {
			if (state.store !== previousStore) armTimer(state);
			return {
				ok: true,
				removed: false
			};
		}
		if (isSystemOwnedCronPayloadKind(removedJob.payload.kind) && opts?.systemOwned !== true) throw new Error("system-owned monitor jobs cannot be removed by cron clients");
		opts?.commitGuard?.();
		const snapshot = snapshotStoreForRollback(state);
		state.store.jobs = state.store.jobs.filter((j) => j.id !== id);
		const postPersistNotifications = [];
		recomputeNextRunsForMaintenance(state, { deferredNotifications: postPersistNotifications });
		await persistOrRestore(state, snapshot, {
			postPersistNotifications,
			suppressScheduledJobId: id
		});
		const activeMarker = noteActiveCronJobRemoval(id);
		const agentId = resolveEffectiveJobAgentId(removedJob, resolveCurrentDefaultAgentId(state));
		const sessionStorePath = state.deps.resolveSessionStorePath?.(agentId) ?? state.deps.sessionStorePath;
		if (sessionStorePath && (removedJob.sessionTarget === "isolated" || removedJob.sessionTarget === "current")) {
			let finish;
			const done = new Promise((resolve) => {
				finish = resolve;
			});
			const release = registerPendingCronSessionCleanup(state, id, done);
			sessionCleanup = {
				activeMarker,
				agentId,
				sessionStorePath,
				done,
				finish,
				release
			};
		}
		pruneCronJobScratchAfterCommit(state, [id]);
		armTimer(state);
		emit(state, {
			jobId: id,
			action: "removed",
			job: removedJob
		});
		return {
			ok: true,
			removed: true
		};
	});
	if (!sessionCleanup) return result;
	const { activeMarker, agentId, sessionStorePath, finish, release } = sessionCleanup;
	const cleanup = async () => {
		try {
			if (await locked(state, async () => {
				await ensureLoaded(state, { skipRecompute: true });
				return !state.store?.jobs.some((job) => job.id === id);
			})) await removeCronJobBaseSession({
				agentId,
				jobId: id,
				sessionStorePath
			});
		} catch (error) {
			state.deps.log.warn({
				jobId: id,
				err: String(error)
			}, "cron: session cleanup failed");
		} finally {
			release();
			finish();
		}
	};
	if (activeMarker) {
		onCronJobInactive(activeMarker, () => void cleanup());
		return result;
	}
	await cleanup();
	return result;
}
/** Remove one agent's jobs while holding the cron lock across an external roster commit. */
async function removeAgentJobsTransactional(state, agentId, commit) {
	return await locked(state, async () => {
		warnIfDisabled(state, "remove agent jobs");
		await ensureLoaded(state, { skipRecompute: true });
		const id = normalizeOptionalAgentId(agentId);
		if (!id || !state.store) return await commit();
		const defaultAgentId = resolveCurrentDefaultAgentId(state);
		const removedJobs = state.store.jobs.filter((job) => resolveEffectiveJobAgentId(job, defaultAgentId) === id);
		if (removedJobs.length === 0) return await commit();
		const snapshot = snapshotStoreForRollback(state);
		state.store.jobs = state.store.jobs.filter((job) => resolveEffectiveJobAgentId(job, defaultAgentId) !== id);
		const postPersistNotifications = [];
		recomputeNextRunsForMaintenance(state, { deferredNotifications: postPersistNotifications });
		await persistOrRestore(state, snapshot);
		let result;
		try {
			result = await commit();
		} catch (error) {
			if (error instanceof AgentDeletionCommitUncertainError) {
				runPostPersistCronNotifications(state, postPersistNotifications);
				armTimer(state);
				for (const job of removedJobs) noteActiveCronJobRemoval(job.id);
				pruneCronJobScratchAfterCommit(state, removedJobs.map((job) => job.id));
				for (const job of removedJobs) emit(state, {
					jobId: job.id,
					action: "removed",
					job
				});
				throw error;
			}
			state.store = snapshot.store;
			state.durableNextRunAtMsByJobId = snapshot.durableNextRunAtMsByJobId;
			try {
				if (!await persist(state)) throw new Error("cron: rollback store write did not complete", { cause: error });
				armTimer(state);
			} catch (rollbackError) {
				throw new AgentDeletionAuthorityRollbackError([error, rollbackError], `cron: failed to roll back agent job deletion for ${id}`, { cause: error });
			}
			throw error;
		}
		runPostPersistCronNotifications(state, postPersistNotifications);
		for (const job of removedJobs) noteActiveCronJobRemoval(job.id);
		pruneCronJobScratchAfterCommit(state, removedJobs.map((job) => job.id));
		armTimer(state);
		for (const job of removedJobs) emit(state, {
			jobId: job.id,
			action: "removed",
			job
		});
		return result;
	});
}
//#endregion
//#region src/cron/service/list-page-sort.ts
function sortCronJobs(jobs, sortBy, sortDir) {
	const dir = sortDir === "desc" ? -1 : 1;
	let compareNames;
	return jobs.toSorted((a, b) => {
		let cmp = 0;
		if (sortBy === "name") {
			const aName = typeof a.name === "string" ? a.name : "";
			const bName = typeof b.name === "string" ? b.name : "";
			compareNames ??= new Intl.Collator(void 0, { sensitivity: "base" }).compare;
			cmp = compareNames(aName, bName);
		} else if (sortBy === "updatedAtMs") cmp = a.updatedAtMs - b.updatedAtMs;
		else {
			const aNext = a.state.nextRunAtMs;
			const bNext = b.state.nextRunAtMs;
			if (typeof aNext === "number" && typeof bNext === "number") cmp = aNext - bNext;
			else if (typeof aNext === "number" || typeof bNext === "number") return typeof aNext === "number" ? -1 : 1;
		}
		if (cmp !== 0) return cmp * dir;
		const aId = typeof a.id === "string" ? a.id : "";
		const bId = typeof b.id === "string" ? b.id : "";
		return aId.localeCompare(bId);
	});
}
//#endregion
//#region src/cron/service/ops-read.ts
/** Returns cron service status after a read-only maintenance pass. */
async function status(state) {
	return await locked(state, async () => {
		await ensureLoadedForRead(state);
		const sqlitePath = resolveOpenClawStateSqlitePath();
		return {
			enabled: state.deps.cronEnabled,
			triggersEnabled: state.deps.cronConfig?.triggers?.enabled !== false,
			storePath: sqlitePath,
			storage: "sqlite",
			sqlitePath,
			jobs: state.store?.jobs.length ?? 0,
			nextWakeAtMs: state.deps.cronEnabled ? nextWakeAtMs(state) ?? null : null
		};
	});
}
/** Lists cron jobs sorted by next run time, excluding disabled jobs unless requested. */
async function list(state, opts) {
	return await locked(state, async () => {
		await ensureLoadedForRead(state);
		const includeDisabled = opts?.includeDisabled === true;
		return sortCronJobs((state.store?.jobs ?? []).filter((j) => includeDisabled || isJobEnabled(j)), "nextRunAtMs", "asc");
	});
}
/** Reads one cron job by id without advancing due schedules. */
async function readJob(state, id) {
	return await locked(state, async () => {
		await ensureLoadedForRead(state);
		return state.store?.jobs.find((job) => job.id === id);
	});
}
/** Reads one job's private scratch state after proving the job exists in this store. */
async function readScratch(state, id) {
	return await locked(state, async () => {
		await ensureLoaded(state, { skipRecompute: true });
		findJobOrThrow(state, id);
		return readCronJobScratchState(state.deps.storePath, id);
	});
}
/** Writes or clears one job's private scratch under the cron mutation lock. */
async function writeScratch(state, id, params) {
	return await locked(state, async () => {
		await ensureLoaded(state, { skipRecompute: true });
		findJobOrThrow(state, id);
		params.commitGuard?.();
		return writeCronJobScratch({
			storePath: state.deps.storePath,
			jobId: id,
			content: params.content,
			expectedRevision: params.expectedRevision,
			sourceSha256: params.sourceSha256,
			nowMs: state.deps.nowMs()
		});
	});
}
/** Record a terminal failure from a scheduler-owned event source. */
async function recordExternalFailure(state, id, error, statePatch, source) {
	await locked(state, async () => {
		await ensureLoaded(state, { skipRecompute: true });
		const job = findJobOrThrow(state, id);
		if (source && !ownsStreamSource(job, source.scheduleKey, source.identity)) return;
		const postPersistNotifications = [];
		const now = state.deps.nowMs();
		assertCronJobStateTimestamps(statePatch);
		const committedJob = commitCronRuntimeRows({
			state,
			jobIds: [id],
			operationLabel: "cron.external-failure",
			mutate: ({ jobs }) => {
				const current = jobs.get(id);
				if (!current || source && !ownsStreamSource(current, source.scheduleKey, source.identity)) return { value: void 0 };
				const sourceIdentity = current.state.streamSourceIdentity;
				Object.assign(current.state, statePatch);
				current.state.streamSourceIdentity = sourceIdentity;
				current.state.consecutiveErrors = Math.max(current.state.consecutiveErrors ?? 0, 4);
				applyJobResult(state, current, {
					status: "error",
					error,
					executionStarted: false,
					startedAt: now,
					endedAt: now
				}, { deferredNotifications: postPersistNotifications });
				current.state.nextRunAtMs = void 0;
				emitCronRunFinished(state, {
					jobId: current.id,
					action: "finished",
					job: current,
					status: "error",
					error,
					runAtMs: now,
					durationMs: 0,
					failureNotificationDelivery: failureNotificationDeliveryFromJobState(current)
				});
				return {
					upsertJobIds: [current.id],
					value: current
				};
			}
		});
		runPostPersistCronNotifications(state, postPersistNotifications);
		if (committedJob) applyCronRuntimeRowsToState(state, [committedJob]);
		armTimer(state);
	});
}
/** Atomically persist owner state only while its logical stream source still matches. */
async function updateExternalState(state, id, streamScheduleKey, streamSourceIdentity, statePatch) {
	return await locked(state, async () => {
		await ensureLoaded(state, { skipRecompute: true });
		assertCronJobStateTimestamps(statePatch);
		const committedJob = commitCronRuntimeRows({
			state,
			jobIds: [id],
			operationLabel: "cron.external-state",
			mutate: ({ jobs }) => {
				const job = jobs.get(id);
				if (!job || !ownsStreamSource(job, streamScheduleKey, streamSourceIdentity)) return { value: void 0 };
				const sourceIdentity = job.state.streamSourceIdentity;
				Object.assign(job.state, statePatch);
				job.state.streamSourceIdentity = sourceIdentity;
				return {
					upsertJobIds: [job.id],
					value: job
				};
			}
		});
		if (committedJob) applyCronRuntimeRowsToState(state, [committedJob]);
		return committedJob !== void 0;
	});
}
/** Retire a logical stream source before teardown that has no job-definition mutation. */
async function retireExternalStreamSource(state, id, streamScheduleKey, streamSourceIdentity) {
	return await locked(state, async () => {
		await ensureLoaded(state, { skipRecompute: true });
		const nextIdentity = createCronStreamSourceIdentity();
		const committedJob = commitCronRuntimeRows({
			state,
			jobIds: [id],
			operationLabel: "cron.retire-stream-source",
			mutate: ({ jobs }) => {
				const job = jobs.get(id);
				if (!job || !ownsStreamSource(job, streamScheduleKey, streamSourceIdentity)) return { value: void 0 };
				job.state.streamSourceIdentity = nextIdentity;
				return {
					upsertJobIds: [job.id],
					value: job
				};
			}
		});
		if (!committedJob) return;
		applyCronRuntimeRowsToState(state, [committedJob]);
		return nextIdentity;
	});
}
/** Persist the owner's monotonic loss counters across stream schedule replacement. */
async function updateExternalCounters(state, id, counters) {
	await locked(state, async () => {
		await ensureLoaded(state, { skipRecompute: true });
		const committedJob = commitCronRuntimeRows({
			state,
			jobIds: [id],
			operationLabel: "cron.external-counters",
			mutate: ({ jobs }) => {
				const job = jobs.get(id);
				if (!job || job.schedule.kind !== "stream") return { value: void 0 };
				job.state.streamDroppedBatches = Math.max(job.state.streamDroppedBatches ?? 0, counters.streamDroppedBatches ?? 0);
				job.state.streamCoalescedBatches = Math.max(job.state.streamCoalescedBatches ?? 0, counters.streamCoalescedBatches ?? 0);
				return {
					upsertJobIds: [job.id],
					value: job
				};
			}
		});
		if (committedJob) applyCronRuntimeRowsToState(state, [committedJob]);
	});
}
function resolveEnabledFilter(opts) {
	if (opts?.enabled === "all" || opts?.enabled === "enabled" || opts?.enabled === "disabled") return opts.enabled;
	return opts?.includeDisabled ? "all" : "enabled";
}
function resolveScheduleKindFilter(opts) {
	if (opts?.scheduleKind === "all" || opts?.scheduleKind === "at" || opts?.scheduleKind === "every" || opts?.scheduleKind === "cron" || opts?.scheduleKind === "on-exit" || opts?.scheduleKind === "stream") return opts.scheduleKind;
	return "all";
}
function resolveLastRunStatusFilter(opts) {
	if (opts?.lastRunStatus === "all" || opts?.lastRunStatus === "ok" || opts?.lastRunStatus === "error" || opts?.lastRunStatus === "skipped" || opts?.lastRunStatus === "unknown") return opts.lastRunStatus;
	return "all";
}
function resolveTriggerFilter(opts) {
	if (opts?.trigger === "all" || opts?.trigger === "conditional" || opts?.trigger === "unconditional") return opts.trigger;
	return "all";
}
/** Lists a filtered, sorted, bounded page of cron jobs for CLI/RPC callers. */
async function listPage(state, opts) {
	return await locked(state, async () => {
		await ensureLoadedForRead(state);
		const query = normalizeLowercaseStringOrEmpty(opts?.query);
		const enabledFilter = resolveEnabledFilter(opts);
		const scheduleKindFilter = resolveScheduleKindFilter(opts);
		const lastRunStatusFilter = resolveLastRunStatusFilter(opts);
		const triggerFilter = resolveTriggerFilter(opts);
		const sortBy = opts?.sortBy ?? "nextRunAtMs";
		const sortDir = opts?.sortDir ?? "asc";
		const requestedAgentId = normalizeOptionalAgentId(opts?.agentId);
		const sortedJobs = sortCronJobs((state.store?.jobs ?? []).filter((job) => {
			if (enabledFilter === "enabled" && !isJobEnabled(job)) return false;
			if (enabledFilter === "disabled" && isJobEnabled(job)) return false;
			if (requestedAgentId && resolveEffectiveJobAgentId(job, resolveCurrentDefaultAgentId(state)) !== requestedAgentId) return false;
			if (scheduleKindFilter !== "all" && job.schedule.kind !== scheduleKindFilter) return false;
			if (lastRunStatusFilter !== "all" && (resolveJobLastRunStatus(job) ?? "unknown") !== lastRunStatusFilter) return false;
			if (triggerFilter === "conditional" && !job.trigger) return false;
			if (triggerFilter === "unconditional" && job.trigger) return false;
			if (!query) return true;
			return normalizeLowercaseStringOrEmpty([
				job.id,
				job.name,
				job.description ?? "",
				job.agentId ?? "",
				...job.displayName ? [job.displayName] : []
			].join(" ")).includes(query);
		}), sortBy, sortDir);
		const snapshotRevision = resolveCronListSnapshotRevision(sortedJobs);
		const total = sortedJobs.length;
		const offset = Math.max(0, Math.min(total, Math.floor(opts?.offset ?? 0)));
		const defaultLimit = total === 0 ? 50 : total;
		const limit = Math.max(1, Math.min(200, Math.floor(opts?.limit ?? defaultLimit)));
		const jobs = structuredClone(sortedJobs.slice(offset, offset + limit));
		const nextOffset = offset + jobs.length;
		return {
			jobs,
			snapshotRevision,
			total,
			offset,
			limit,
			hasMore: nextOffset < total,
			nextOffset: nextOffset < total ? nextOffset : null
		};
	});
}
//#endregion
//#region src/cron/service/ops-run.ts
let nextManualRunId = 1;
function applyManualRunOutcome(params) {
	const scheduleOwnership = resolveCronRunScheduleOwnership({
		admittedJob: params.prepared.admittedJob,
		currentJob: params.job,
		activeJobMarker: params.prepared.activeJobMarker
	});
	const triggerOwnership = resolveCronRunTriggerOwnership({
		admittedJob: params.prepared.admittedJob,
		currentJob: params.job,
		activeJobMarker: params.prepared.activeJobMarker
	});
	const scheduleMode = scheduleOwnership === "stale" ? "stale-preserve" : isImmediateCronRunMode(params.mode) ? "immediate-preserve" : "advance";
	if (params.triggerSkipped) {
		applyTriggerNoFireResult(params.state, params.job, {
			startedAt: params.startedAt,
			endedAt: params.endedAt,
			triggerEval: params.coreResult.triggerEval
		}, {
			scheduleMode,
			triggerOwnership,
			deferredNotifications: params.deferredNotifications
		});
		return false;
	}
	const removed = applyJobResult(params.state, params.job, {
		...params.coreResult,
		startedAt: params.startedAt,
		endedAt: params.endedAt
	}, {
		scheduleMode: scheduleMode === "immediate-preserve" ? "preserve" : "advance",
		scheduleOwnership,
		scheduleOwnershipAtMs: params.prepared.scheduleOwnershipAtMs,
		deferredNotifications: params.deferredNotifications
	});
	applyTriggerRunResult(params.job, {
		status: params.coreResult.status,
		endedAt: params.endedAt,
		triggerEval: params.coreResult.triggerEval
	}, {
		scheduleOwnership,
		triggerOwnership
	});
	applyScriptRunResult(params.job, params.coreResult, { triggerOwnership });
	if (params.job.schedule.kind === "stream") params.job.state.nextRunAtMs = void 0;
	return removed;
}
async function finishPreparedManualRun(state, prepared, mode) {
	const executionJob = prepared.executionJob;
	const startedAt = prepared.startedAt;
	const jobId = prepared.jobId;
	const taskRunId = prepared.taskRunId;
	const runId = prepared.runId;
	let finalized = false;
	let supersedeReason;
	let receiptSettlementDisposition;
	try {
		let coreResult;
		try {
			coreResult = await executeJobCoreWithTimeout(state, executionJob, {
				runId: taskRunId,
				activeJobMarker: prepared.activeJobMarker,
				owningCronLaneTaskMarker: prepared.owningCronLaneTaskMarker,
				streamBatch: prepared.streamBatch,
				streamScheduleKey: prepared.streamScheduleKey,
				streamSourceIdentity: prepared.streamSourceIdentity,
				runReceipt: prepared.runReceipt,
				executionIdentity: createCronOwnerExecutionIdentityAdmission({
					state,
					runReceipt: prepared.runReceipt,
					taskId: prepared.taskId,
					flowId: prepared.flowId
				})
			});
		} catch (err) {
			if (err instanceof CronRunReceiptRevisionError && err.reason === "owner-unavailable") receiptSettlementDisposition = "owner-unavailable";
			coreResult = authorCronRunCompletion(state, executionJob, {
				status: "error",
				error: err instanceof CronRunReceiptRevisionError ? err.message : normalizeCronRunErrorText(err)
			});
		}
		if (prepared.onTriggerDisposition) {
			const disposition = coreResult.triggerEval?.busy ? "busy" : coreResult.status === "error" ? "error" : coreResult.status !== "ok" ? "dropped" : !executionJob.trigger ? "fired" : coreResult.triggerEval?.fired ? "fired" : "dropped";
			prepared.onTriggerDisposition(disposition);
		}
		const endedAt = state.deps.nowMs();
		const triggerSkipped = coreResult.status === "ok" && coreResult.triggerEval?.fired === false;
		const emitMissingTerminal = (required = false) => {
			const tracker = prepared.terminalTracker;
			if (!tracker && !required || tracker?.emitted) return;
			const job = prepared.activeJobMarker?.jobRemoved === true ? executionJob : state.store?.jobs.find((entry) => entry.id === jobId);
			emitCronRunFinished(state, {
				jobId,
				action: "finished",
				job,
				status: triggerSkipped ? "skipped" : coreResult.status,
				completionStatus: triggerSkipped ? "failed" : coreResult.completionStatus,
				error: triggerSkipped ? "queued manual run skipped: trigger condition not met" : coreResult.error,
				deliveryError: coreResult.deliveryState.error,
				deliverySuppressionReason: coreResult.deliveryState.deliverySuppressionReason,
				summary: triggerSkipped ? void 0 : coreResult.summary,
				diagnostics: coreResult.diagnostics,
				delivered: coreResult.deliveryState.delivered,
				deliveryStatus: coreResult.deliveryState.status,
				delivery: coreResult.delivery,
				sessionId: coreResult.sessionId,
				sessionKey: coreResult.sessionKey,
				runId,
				runAtMs: startedAt,
				durationMs: Math.max(0, endedAt - startedAt),
				nextRunAtMs: job?.state.nextRunAtMs,
				model: coreResult.model,
				provider: coreResult.provider,
				usage: coreResult.usage
			}, tracker, taskRunId, {
				errorClassification: triggerSkipped ? void 0 : coreResult.errorClassification,
				failureNotificationDetail: triggerSkipped ? void 0 : coreResult.failureNotificationDetail
			});
		};
		const finishRemovedRun = () => {
			finishCronRunReceipt({
				handle: prepared.runReceipt,
				status: resolveCronRunReceiptTerminalStatus(triggerSkipped ? "skipped" : coreResult.status, coreResult.triggerEval?.fired),
				finishedAtMs: endedAt,
				error: coreResult.error
			});
			finalized = true;
			emitMissingTerminal(true);
		};
		if (prepared.activeJobMarker?.jobRemoved === true) {
			finishRemovedRun();
			return;
		}
		let notifySetupTimeout = coreResult.isolatedAgentSetupTimeout !== void 0;
		await locked(state, async () => {
			await ensureLoaded(state, {
				forceReload: true,
				skipRecompute: true
			});
			const job = state.store?.jobs.find((entry) => entry.id === jobId);
			if (prepared.activeJobMarker?.jobRemoved === true || !job) {
				notifySetupTimeout = false;
				finishRemovedRun();
				return;
			}
			const postPersistNotifications = [];
			if (!triggerSkipped) {
				const taskJob = structuredClone(job);
				applyManualRunOutcome({
					state,
					job: taskJob,
					prepared,
					coreResult,
					startedAt,
					endedAt,
					triggerSkipped,
					mode,
					deferredNotifications: []
				});
				recordCronOutcomeForJob(state, taskJob, {
					...coreResult,
					jobId,
					job: executionJob,
					taskRunId,
					activeJobMarker: prepared.activeJobMarker,
					runReceipt: prepared.runReceipt,
					startedAt,
					endedAt
				});
			}
			let removedJob;
			try {
				const committed = commitCronRuntimeRows({
					state,
					jobIds: [jobId],
					operationLabel: "cron.manual-run-finalization",
					transactionHooks: cronRunReceiptPersistHooks({
						state,
						handle: prepared.runReceipt,
						terminal: {
							status: triggerSkipped ? "skipped" : coreResult.status,
							finishedAtMs: endedAt,
							error: coreResult.error,
							...receiptSettlementDisposition ? { disposition: receiptSettlementDisposition } : {}
						}
					}),
					mutate: ({ jobs }) => {
						const current = jobs.get(jobId);
						if (!current) return { value: void 0 };
						const removed = applyManualRunOutcome({
							state,
							job: current,
							prepared,
							coreResult,
							startedAt,
							endedAt,
							triggerSkipped,
							mode,
							deferredNotifications: postPersistNotifications
						});
						return {
							...removed ? { deleteJobIds: [jobId] } : { upsertJobIds: [jobId] },
							value: {
								job: structuredClone(current),
								removed
							}
						};
					}
				});
				if (!committed) return;
				removedJob = committed.removed ? committed.job : void 0;
				runPostPersistCronNotifications(state, postPersistNotifications);
				applyCronRuntimeRowsToState(state, committed.removed ? [] : [committed.job], committed.removed ? [jobId] : [], { publish: false });
				if (triggerSkipped) tryFinishCronTaskRunWithoutHistory(state, {
					taskRunId,
					status: coreResult.status,
					error: coreResult.error,
					endedAt,
					summary: coreResult.summary,
					childSessionKey: coreResult.sessionKey,
					triggerEval: coreResult.triggerEval
				});
				if (!isCronActiveJobMarkerCurrent(prepared.activeJobMarker)) {
					finalized = true;
					return;
				}
				if (!triggerSkipped) emitCronRunFinished(state, {
					jobId,
					action: "finished",
					job: committed.job,
					status: coreResult.status,
					completionStatus: coreResult.completionStatus,
					error: coreResult.error,
					summary: coreResult.summary,
					diagnostics: coreResult.diagnostics,
					delivered: committed.job.state.lastDelivered,
					deliveryStatus: committed.job.state.lastDeliveryStatus,
					deliveryError: committed.job.state.lastDeliveryError,
					deliverySuppressionReason: committed.job.state.deliverySuppressionReason,
					failureNotificationDelivery: failureNotificationDeliveryFromJobState(committed.job),
					delivery: coreResult.delivery,
					sessionId: coreResult.sessionId,
					sessionKey: coreResult.sessionKey,
					runId,
					runAtMs: startedAt,
					durationMs: committed.job.state.lastDurationMs,
					nextRunAtMs: committed.job.state.nextRunAtMs,
					...coreResult.triggerEval?.fired ? { triggerFired: true } : {},
					model: coreResult.model,
					provider: coreResult.provider,
					usage: coreResult.usage
				}, prepared.terminalTracker, taskRunId, {
					triggerEval: coreResult.triggerEval,
					scriptResult: {
						scriptStateChanged: coreResult.scriptStateChanged,
						scriptState: coreResult.scriptState
					},
					errorClassification: coreResult.errorClassification,
					failureNotificationDetail: coreResult.failureNotificationDetail
				});
				publishCronRuntimeRows(state);
				const maintenance = recomputeUnownedCronSchedules(state, {
					recomputeExpired: true,
					...isImmediateCronRunMode(mode) ? { preserveExpiredPacedNextRunJobId: jobId } : {}
				});
				runPostPersistCronNotifications(state, maintenance.notifications);
				applyCronRuntimeRowsToState(state, maintenance.jobs);
			} catch (error) {
				if (error instanceof CronRunReceiptRevisionError) {
					if (isCronActiveJobMarkerCurrent(prepared.activeJobMarker)) supersedeReason = error.message;
					notifySetupTimeout = false;
					return;
				}
				throw error;
			}
			if (removedJob) emit(state, {
				jobId: removedJob.id,
				action: "removed",
				job: removedJob
			});
			finalized = true;
		});
		if (supersedeReason) await supersedeActivatedCronRun({
			state,
			jobId,
			reservationIdentity: prepared.reservationIdentity,
			runReceipt: prepared.runReceipt,
			reason: supersedeReason
		});
		if (notifySetupTimeout && isCronActiveJobMarkerCurrent(prepared.activeJobMarker)) maybeNotifyManualIsolatedSetupTimeout(state, {
			jobId,
			job: executionJob,
			isolatedAgentSetupTimeout: coreResult.isolatedAgentSetupTimeout
		});
		if (finalized && isCronActiveJobMarkerCurrent(prepared.activeJobMarker)) armTimer(state);
		emitMissingTerminal();
	} finally {
		releaseLocalCronRunReceiptOwnership(prepared.runReceipt);
		try {
			releaseQueuedCronRun(state, prepared.jobId, prepared.reservationIdentity);
		} finally {
			clearManualCronJobActive(state, jobId, prepared.activeJobMarker);
		}
	}
}
/** Runs a cron job manually, reserving it under lock before executing outside the lock. */
async function run(state, id, mode, opts) {
	const prepared = await prepareManualRun(state, id, mode, opts);
	if (!prepared.ok || !prepared.ran) return prepared;
	const admission = await runWithCronAdmission(state, async () => {
		let activeRun;
		try {
			activeRun = await activatePreparedManualRun(state, prepared, mode);
		} catch (error) {
			try {
				await locked(state, async () => {
					await releasePreparedManualReservationWithRetry(state, prepared);
				});
			} catch (cleanupError) {
				state.deps.log.warn({
					jobId: prepared.jobId,
					err: String(cleanupError)
				}, "cron: failed to release manual run reservation after activation error");
			}
			throw error;
		}
		if (!activeRun.ran) return activeRun;
		await finishPreparedManualRun(state, activeRun, mode);
		return {
			ok: true,
			ran: true
		};
	});
	if (admission.kind === "stopped") {
		await releasePreparedManualReservationAfterReloadWithRetry(state, prepared);
		return {
			ok: true,
			ran: false,
			reason: "stopped"
		};
	}
	return admission.value;
}
/** Queues a manual cron run behind the cron command lane and returns an immediate run id. */
async function enqueueRun(state, id, mode, opts) {
	const disposition = await inspectManualRunDisposition(state, id, mode);
	if (!disposition.ok || !("runnable" in disposition && disposition.runnable)) return disposition;
	const scheduleOwnershipAtMs = state.deps.nowMs();
	const runId = `manual:${id}:${scheduleOwnershipAtMs}:${nextManualRunId++}`;
	const terminalTracker = { emitted: false };
	runWithGatewayIndependentRootWorkContinuation(() => enqueueCommandInLane("cron", async (owningCronLaneTaskMarker) => {
		const result = await run(state, id, mode, {
			runId,
			scheduleOwnershipAtMs,
			terminalTracker,
			owningCronLaneTaskMarker,
			...opts?.commitGuard ? { commitGuard: opts.commitGuard } : {}
		});
		if (result.ok && "ran" in result && !result.ran) {
			if (result.reason !== "invalid-spec") {
				const finishedAt = state.deps.nowMs();
				const job = state.store?.jobs.find((entry) => entry.id === id);
				emitCronRunFinished(state, {
					jobId: id,
					action: "finished",
					job,
					status: "skipped",
					error: `queued manual run skipped before execution: ${result.reason}`,
					runId,
					runAtMs: finishedAt,
					durationMs: 0,
					nextRunAtMs: job?.state.nextRunAtMs
				}, terminalTracker);
			}
			state.deps.log.info({
				jobId: id,
				runId,
				reason: result.reason
			}, "cron: queued manual run skipped before execution");
		}
		return result;
	}, {
		warnAfterMs: 5e3,
		onWait: (waitMs, queuedAhead) => {
			state.deps.log.warn({
				jobId: id,
				runId,
				waitMs,
				queuedAhead
			}, "cron: queued manual run waiting for an execution slot");
		}
	}), "cron:manual-run").catch((err) => {
		if (terminalTracker.emitted) {
			state.deps.log.error({
				jobId: id,
				runId,
				err: String(err)
			}, "cron: queued manual run failed after emitting its terminal event");
			return;
		}
		const finishedAt = state.deps.nowMs();
		const job = state.store?.jobs.find((entry) => entry.id === id);
		emitCronRunFinished(state, {
			jobId: id,
			action: "finished",
			job,
			status: "error",
			error: normalizeCronRunErrorText(err),
			runId,
			runAtMs: finishedAt,
			durationMs: 0,
			nextRunAtMs: job?.state.nextRunAtMs
		}, terminalTracker);
		state.deps.log.error({
			jobId: id,
			runId,
			err: String(err)
		}, "cron: queued manual run background execution failed");
	});
	return {
		ok: true,
		enqueued: true,
		runId
	};
}
/** Enqueues manual wake text through the cron wake API. */
function wakeNow(state, opts) {
	return wake(state, opts);
}
//#endregion
//#region src/cron/service.ts
/** Public cron service facade that owns mutable scheduler state and delegates to locked ops. */
var CronService = class {
	constructor(deps) {
		this.startInProgress = 0;
		this.startState = null;
		this.state = createCronServiceState(deps);
	}
	async start() {
		const generation = this.state.lifecycleGeneration;
		const pending = this.startState;
		if (pending) {
			try {
				await pending.promise;
			} catch (err) {
				if (pending.generation === generation) throw err;
			}
			if (pending.generation === generation) return;
			await this.start();
			return;
		}
		const promise = this.startOnce(generation);
		this.startState = {
			generation,
			promise
		};
		try {
			await promise;
		} finally {
			if (this.startState?.promise === promise) this.startState = null;
		}
	}
	async startOnce(generation) {
		this.startInProgress += 1;
		this.state.schedulerStarted = false;
		try {
			await start(this.state);
			if (generation !== this.state.lifecycleGeneration) {
				stop(this.state);
				return;
			}
			this.state.schedulerStarted = !this.state.stopped;
		} finally {
			this.startInProgress -= 1;
		}
	}
	stop() {
		stop(this.state);
	}
	pauseScheduling() {
		pauseScheduling(this.state);
	}
	resumeScheduling() {
		resumeScheduling(this.state);
	}
	getSuspensionBlockerCount() {
		return this.startInProgress;
	}
	async status() {
		return await status(this.state);
	}
	async list(opts) {
		return await list(this.state, opts);
	}
	async listPage(opts) {
		return await listPage(this.state, opts);
	}
	async add(input, opts) {
		return await add(this.state, input, opts);
	}
	async removeStaleJobFamily(family) {
		return await removeStaleJobFamily(this.state, family);
	}
	async update(id, patch, opts) {
		return await update(this.state, id, patch, opts);
	}
	async updateWithPrecondition(id, patch, precondition, opts) {
		return await updateWithPrecondition(this.state, id, patch, precondition, opts);
	}
	async remove(id, opts) {
		return await remove(this.state, id, opts);
	}
	async removeAgentJobsTransactional(agentId, commit) {
		return await removeAgentJobsTransactional(this.state, agentId, commit);
	}
	async run(id, mode, opts) {
		return await run(this.state, id, mode, opts);
	}
	async enqueueRun(id, mode, opts) {
		const result = await enqueueRun(this.state, id, mode, opts);
		if (result.ok && "runnable" in result) throw new Error("cron enqueueRun returned unresolved runnable disposition");
		return result;
	}
	getJob(id) {
		return this.state.store?.jobs.find((job) => job.id === id);
	}
	/** In-memory job snapshot; undefined until the store is loaded. */
	getLoadedJobs() {
		return this.state.store?.jobs;
	}
	async readJob(id) {
		return await readJob(this.state, id);
	}
	async readScratch(id) {
		return await readScratch(this.state, id);
	}
	async writeScratch(id, params) {
		return await writeScratch(this.state, id, params);
	}
	async recordExternalFailure(id, error, statePatch, source) {
		await recordExternalFailure(this.state, id, error, statePatch, source);
	}
	async updateExternalState(id, streamScheduleKey, streamSourceIdentity, statePatch) {
		return await updateExternalState(this.state, id, streamScheduleKey, streamSourceIdentity, statePatch);
	}
	async retireExternalStreamSource(id, streamScheduleKey, streamSourceIdentity) {
		return await retireExternalStreamSource(this.state, id, streamScheduleKey, streamSourceIdentity);
	}
	async updateExternalCounters(id, counters) {
		await updateExternalCounters(this.state, id, counters);
	}
	getDefaultAgentId() {
		return this.state.deps.defaultAgentId;
	}
	wake(opts) {
		return wakeNow(this.state, opts);
	}
};
//#endregion
export { cronScriptFailureMetadata as i, resolveSkillCollectionReviewMonitorSpecs as n, skillCollectionReviewMonitorAgentId as r, CronService as t };
