import { s as asFiniteNumber } from "./number-coercion-CLj0HTDM.js";
import { s as readErrorName } from "./error-coercion-CwcmpTBO.js";
import { y as uniqueStrings } from "./string-normalization-DiSb4JeN.js";
import { n as sliceUtf16Safe, r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { r as defaultRuntime } from "./runtime-V1VdbWVS.js";
import { n as getRuntimeConfig } from "./io.runtime-CKu7Rw0j.js";
import { n as computeBackoff } from "./src-BQ327IOM.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { B as loadDeliveryQueueEntryInDatabase, I as bindDeliveryQueueEntry, Jt as deferSqlitePostCommitPublication, W as upsertBoundDeliveryQueueEntryInDatabase, s as runOpenClawStateWriteTransaction } from "./openclaw-state-db-Bh3Bq87y.js";
import { f as resolveAgentIdFromSessionKey, p as resolveEventSessionKey } from "./session-key-CRjxKW0X.js";
import { o as resolveSessionStorePathCore } from "./paths-DDTeIhCT.js";
import "./config-Cv60gBux.js";
import { t as truncateUtf8Prefix } from "./utf8-truncate-CwYSlvjM.js";
import "./backoff-BkMI1WEL.js";
import { t as getGlobalHookRunner } from "./hook-runner-global-DLqoAE5f.js";
import { a as listSessionEntriesReadOnly, f as loadSessionEntryReadOnly, p as patchSessionEntryCore, w as resolveSessionStorePathForScope } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { a as normalizeStoreSessionKey } from "./store-entry-CMuTqREZ.js";
import "./session-accessor-K0XuW6ln.js";
import { _ as upsertTaskRunRowInDatabase, p as readTaskRecord, t as bindTaskRecord } from "./task-registry.store.sqlite-paxOzi9K.js";
import { v as publishTaskRecordAfterAtomicStore } from "./task-registry-B4-CJZk7.js";
import { a as formatTaskBlockedFollowupMessage, p as SUBAGENT_KILL_TASK_ERROR } from "./task-registry-activity-DSlVVJwD.js";
import { n as extractTextFromChatContent } from "./chat-content-DNdfeXZh.js";
import "./runtime-internal-_JeaUumR.js";
import { i as failTaskRunByRunId, l as setDetachedTaskDeliveryStatusByRunId, t as completeTaskRunByRunId } from "./detached-task-runtime-BitcQpyY.js";
import { n as resolveRequiredCompletionTerminalResult, t as resolveRequiredCompletionDeliveryFailureTerminalResult } from "./task-completion-contract-BJW3TUQJ.js";
import "./sessions-eI69vxPt.js";
import { a as getErrnoCode, n as createDeliveryRecoveryCoordinator, o as isDeliveryRecoveryRetryEligible, r as createEmptyDeliveryRecoverySummary, t as computeBackoffMs, u as resolveDeliveryRecoveryDeadlineMs } from "./delivery-recovery.shared-BHlrbHZ6.js";
import { _ as hasRetainedRequiredCompletionDelivery, f as clearDeliveryState, g as getDeliveryLastError, h as getDeliveryAttemptCount, l as upsertSubagentRunRowInDatabase, m as ensureDeliveryState, o as readSubagentRun, p as ensureCompletionState, t as bindSubagentRunRecord, u as compareSubagentRunGeneration, w as subagentRuns } from "./subagent-registry.store.sqlite-hzGu4QSk.js";
import { f as SUBAGENT_ENDED_OUTCOME_TIMEOUT, g as SUBAGENT_TARGET_KIND_SUBAGENT, h as SUBAGENT_ENDED_REASON_KILLED, i as isStaleUnendedSubagentRun, l as resolveSubagentSessionStatus, m as SUBAGENT_ENDED_REASON_ERROR, n as hasSubagentRunEnded, o as getSubagentSessionRuntimeMs, p as SUBAGENT_ENDED_REASON_COMPLETE, s as getSubagentSessionStartedAt, u as SUBAGENT_ENDED_OUTCOME_ERROR } from "./subagent-run-liveness-CrhVXF5Y.js";
import { t as resolveSubagentCompletionResultText } from "./subagent-completion-result-CYyGxBfk.js";
import { _ as markSessionDeliverySettlement, a as SessionDeliveryDeferredError, b as prepareClaimedSessionDelivery, h as loadPendingSessionDelivery, i as SessionDeliveryDeadLetteredError, l as completeSessionDelivery, m as loadPendingSessionDeliveries, n as SessionDeliveryAcknowledgementFinalizeError, o as SessionDeliveryRetryChargedError, p as failSessionDelivery, r as SessionDeliveryAttemptStartError, s as SessionDeliverySafeRetryError, t as SESSION_DELIVERY_QUEUE_NAME, y as moveSessionDeliveryToFailed } from "./session-delivery-queue-storage-BRivgTij.js";
import { n as buildAnnounceIdempotencyKey, t as buildAnnounceIdFromChildRun } from "./announce-idempotency-D7LnUTJR.js";
import { c as isSilentAgentReplyText } from "./message-visibility-D0FOL9Zj.js";
import fs, { promises } from "node:fs";
import path from "node:path";
//#region src/agents/subagents/registry/subagent-registry-completion.ts
/**
* Subagent run completion helpers.
* Compares outcomes, maps them to lifecycle events, and emits completion hooks
* exactly once per completed child run.
*/
const log = createSubsystemLogger("agents/subagent-registry-completion");
/** Returns the complete task projection only after completion capture has settled. */
function resolveFinalizedSubagentTaskState(entry) {
	const endedAt = entry.execution.endedAt;
	const outcome = entry.execution.outcome;
	const completion = entry.completion;
	if (typeof endedAt !== "number" || !outcome || entry.pauseReason === "sessions_yield" || completion?.resultText === void 0 && typeof completion?.capturedAt !== "number") return;
	const progressSummary = resolveSubagentCompletionResultText(entry);
	if (entry.endedReason === "subagent-killed" && entry.suppressAnnounceReason !== "steer-restart") return {
		status: "cancelled",
		endedAt,
		lastEventAt: endedAt,
		error: SUBAGENT_KILL_TASK_ERROR,
		progressSummary,
		terminalSummary: null
	};
	if (outcome.status === "ok") {
		const terminal = entry.expectsCompletionMessage !== true ? {} : entry.delivery?.disposition === "intentional_non_delivery" ? {
			terminalOutcome: "succeeded",
			terminalSummary: null
		} : resolveRequiredCompletionTerminalResult(progressSummary);
		return {
			status: "succeeded",
			endedAt,
			lastEventAt: endedAt,
			progressSummary,
			terminalSummary: terminal.terminalSummary ?? null,
			terminalOutcome: terminal.terminalOutcome
		};
	}
	return {
		status: outcome.status === "timeout" ? "timed_out" : "failed",
		endedAt,
		lastEventAt: endedAt,
		error: outcome.status === "error" ? outcome.error : void 0,
		progressSummary,
		terminalSummary: null
	};
}
/** Preserves execution end time, except when a paused run was killed after its yield. */
function resolveKilledSubagentTaskEndedAt(entry) {
	if (entry.killReconciliation) return entry.killReconciliation.killedAt;
	const endedAt = entry.execution.endedAt;
	const cleanupCompletedAt = entry.cleanupCompletedAt;
	return entry.suppressAnnounceReason === "killed" && typeof endedAt === "number" && typeof cleanupCompletedAt === "number" && cleanupCompletedAt > endedAt ? cleanupCompletedAt : endedAt;
}
/** Maps registry run outcome to lifecycle event outcome. */
function resolveLifecycleOutcomeFromRunOutcome(outcome) {
	if (outcome?.status === "error") return SUBAGENT_ENDED_OUTCOME_ERROR;
	if (outcome?.status === "timeout") return SUBAGENT_ENDED_OUTCOME_TIMEOUT;
	return "ok";
}
/** Emits the transient presentation event for a newly terminal child run. */
async function emitSubagentProgressEndedHook(entry) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("subagent_progress")) return;
	const outcome = entry.endedReason === "subagent-killed" ? "killed" : entry.execution.outcome ? resolveLifecycleOutcomeFromRunOutcome(entry.execution.outcome) : "unknown";
	try {
		await hookRunner.runSubagentProgress({
			phase: "ended",
			runId: entry.runId,
			childSessionKey: entry.childSessionKey,
			outcome,
			requester: entry.progressOrigin
		}, {
			runId: entry.runId,
			childSessionKey: entry.childSessionKey,
			requesterSessionKey: entry.requesterSessionKey
		});
	} catch (err) {
		log.warn(`failed to emit subagent progress for run ${entry.runId}: ${err instanceof Error ? err.message : String(err)}`);
	}
}
/** Emits the subagent_ended hook once per completed run. */
async function emitSubagentEndedHookOnce(params) {
	const runId = params.entry.runId.trim();
	if (!runId) return false;
	if (params.entry.endedHookEmittedAt) return false;
	if (params.inFlightRunIds.has(runId)) return false;
	params.inFlightRunIds.add(runId);
	try {
		const hookRunner = getGlobalHookRunner();
		if (!hookRunner) return false;
		if (hookRunner?.hasHooks("subagent_ended")) await hookRunner.runSubagentEnded({
			targetSessionKey: params.entry.childSessionKey,
			targetKind: SUBAGENT_TARGET_KIND_SUBAGENT,
			reason: params.reason,
			sendFarewell: params.sendFarewell,
			accountId: params.accountId,
			runId: params.entry.runId,
			endedAt: params.entry.execution.endedAt,
			outcome: params.outcome,
			error: params.error
		}, {
			runId: params.entry.runId,
			childSessionKey: params.entry.childSessionKey,
			requesterSessionKey: params.entry.requesterSessionKey
		});
		params.entry.endedHookEmittedAt = Date.now();
		params.persist(runId);
		return true;
	} catch (err) {
		log.warn(`failed to emit subagent_ended hook for run ${runId}: ${err instanceof Error ? err.message : String(err)}`);
		return false;
	} finally {
		params.inFlightRunIds.delete(runId);
	}
}
//#endregion
//#region src/agents/subagents/registry/subagent-session-reconciliation.ts
/**
* Subagent session-store reconciliation.
*
* Infers child completion from persisted session entries when registry updates arrive late.
*/
function finiteTimestamp(value) {
	return asFiniteNumber(value);
}
function terminalSessionTimestamp(sessionEntry) {
	return finiteTimestamp(sessionEntry?.endedAt) ?? finiteTimestamp(sessionEntry?.updatedAt);
}
function isFreshForRun(sessionEntry, notBeforeMs) {
	if (notBeforeMs === void 0) return true;
	const terminalAt = terminalSessionTimestamp(sessionEntry);
	return terminalAt !== void 0 && terminalAt >= notBeforeMs;
}
function freshSessionStartedAt(sessionEntry, notBeforeMs) {
	const startedAt = finiteTimestamp(sessionEntry?.startedAt);
	if (startedAt === void 0) return;
	return notBeforeMs === void 0 || startedAt >= notBeforeMs ? startedAt : void 0;
}
/** Load a child session entry using the agent-specific session store path. */
function loadSubagentSessionEntry(params) {
	const key = params.childSessionKey.trim();
	if (!key) return;
	const agentId = resolveAgentIdFromSessionKey(key);
	const cfg = params.cfg ?? getRuntimeConfig();
	const storePath = resolveSessionStorePathCore(cfg.session?.store, { agentId });
	let store = params.storeCache?.get(storePath);
	if (!store) {
		store = Object.fromEntries(listSessionEntriesReadOnly({
			storePath,
			clone: false
		}).map(({ sessionKey, entry }) => [sessionKey, entry]));
		params.storeCache?.set(storePath, store);
	}
	return store[key] ?? store[normalizeStoreSessionKey(key)];
}
/** Resolve a child session entry without depending on the file-backed store shape. */
function loadSubagentSessionEntryForAccessor(params) {
	const key = params.childSessionKey.trim();
	if (!key) return;
	const agentId = resolveAgentIdFromSessionKey(key);
	const cfg = params.cfg ?? getRuntimeConfig();
	const storePath = resolveSessionStorePathCore(cfg.session?.store, { agentId });
	return loadSessionEntryReadOnly({
		storePath,
		sessionKey: key,
		clone: false
	});
}
/** Resolves whether a registry row is orphaned from its child session entry. */
function resolveSubagentRunOrphanReason(params) {
	const childSessionKey = params.entry.childSessionKey?.trim();
	if (!childSessionKey) return "missing-session-entry";
	try {
		const sessionEntry = loadSubagentSessionEntryForAccessor({
			childSessionKey,
			cfg: params.cfg
		});
		if (!sessionEntry) return "missing-session-entry";
		if (typeof sessionEntry.sessionId !== "string" || !sessionEntry.sessionId.trim()) return "missing-session-id";
		if (params.includeStaleUnended === true && sessionEntry.abortedLastRun !== true && isStaleUnendedSubagentRun(params.entry, params.now)) return "stale-unended-run";
		return null;
	} catch {
		return null;
	}
}
/** Convert persisted session status into a subagent completion outcome. */
function resolveCompletionFromSessionEntry(sessionEntry, fallbackEndedAt, opts) {
	const status = sessionEntry?.status;
	const startedAt = freshSessionStartedAt(sessionEntry, opts?.notBeforeMs);
	const endedAt = finiteTimestamp(sessionEntry?.endedAt) ?? finiteTimestamp(sessionEntry?.updatedAt) ?? fallbackEndedAt;
	if (status === "done") {
		if (!isFreshForRun(sessionEntry, opts?.notBeforeMs)) return null;
		return {
			startedAt,
			endedAt,
			outcome: { status: "ok" },
			reason: SUBAGENT_ENDED_REASON_COMPLETE
		};
	}
	if (status === "timeout") {
		if (!isFreshForRun(sessionEntry, opts?.notBeforeMs)) return null;
		return {
			startedAt,
			endedAt,
			outcome: { status: "timeout" },
			reason: SUBAGENT_ENDED_REASON_COMPLETE
		};
	}
	if (status === "failed") {
		if (!isFreshForRun(sessionEntry, opts?.notBeforeMs)) return null;
		return {
			startedAt,
			endedAt,
			outcome: {
				status: "error",
				error: "session completed before registry settled"
			},
			reason: SUBAGENT_ENDED_REASON_ERROR
		};
	}
	if (status === "killed") {
		if (!isFreshForRun(sessionEntry, opts?.notBeforeMs)) return null;
		return {
			startedAt,
			endedAt,
			outcome: {
				status: "error",
				error: "subagent run terminated"
			},
			reason: SUBAGENT_ENDED_REASON_KILLED
		};
	}
	if (status !== "running" && typeof sessionEntry?.endedAt === "number") {
		if (!isFreshForRun(sessionEntry, opts?.notBeforeMs)) return null;
		return {
			startedAt,
			endedAt,
			outcome: { status: "ok" },
			reason: SUBAGENT_ENDED_REASON_COMPLETE
		};
	}
	return null;
}
/** Resolve child completion by reading its persisted session entry. */
function resolveSubagentSessionCompletion(params) {
	return resolveCompletionFromSessionEntry(loadSubagentSessionEntry({
		childSessionKey: params.childSessionKey,
		storeCache: params.storeCache,
		cfg: params.cfg
	}), params.fallbackEndedAt, { notBeforeMs: params.notBeforeMs });
}
/** Resolve a fresh child session start time for lifecycle reconciliation. */
function resolveSubagentSessionStartedAt(params) {
	const sessionEntry = loadSubagentSessionEntry({
		childSessionKey: params.childSessionKey,
		storeCache: params.storeCache,
		cfg: params.cfg
	});
	return isFreshForRun(sessionEntry, params.notBeforeMs) ? freshSessionStartedAt(sessionEntry, params.notBeforeMs) : void 0;
}
//#endregion
//#region src/agents/subagents/registry/subagent-registry-helpers.ts
/**
* Subagent registry persistence and recovery helpers.
*
* Handles frozen result caps, orphan detection, timing persistence, and announce retry logging.
*/
const PROVISIONAL_KILL_RECONCILIATION_MS = 3e5;
const MIN_ANNOUNCE_RETRY_DELAY_MS = 15e3;
const MAX_ANNOUNCE_RETRY_DELAY_MS = 3e5;
const ANNOUNCE_RETRY_JITTER = .2;
const ANNOUNCE_EXPIRY_MS = 3e5;
const ANNOUNCE_COMPLETION_HARD_EXPIRY_MS = 18e5;
const ANNOUNCE_RETRY_BACKOFF = {
	initialMs: MIN_ANNOUNCE_RETRY_DELAY_MS,
	maxMs: MAX_ANNOUNCE_RETRY_DELAY_MS,
	factor: 2,
	jitter: ANNOUNCE_RETRY_JITTER
};
const FROZEN_RESULT_TEXT_MAX_BYTES = 102400;
/** Caps frozen completion text stored for later announce/recovery delivery. */
function capFrozenResultText(resultText) {
	const trimmed = resultText.trim();
	if (!trimmed) return "";
	const totalBytes = Buffer.byteLength(trimmed, "utf8");
	if (totalBytes <= FROZEN_RESULT_TEXT_MAX_BYTES) return trimmed;
	const notice = `\n\n[truncated: frozen completion output exceeded ${Math.round(FROZEN_RESULT_TEXT_MAX_BYTES / 1024)}KB (${Math.round(totalBytes / 1024)}KB)]`;
	const maxPayloadBytes = Math.max(0, FROZEN_RESULT_TEXT_MAX_BYTES - Buffer.byteLength(notice, "utf8"));
	return `${truncateUtf8Prefix(trimmed, maxPayloadBytes)}${notice}`;
}
/** Computes bounded exponential backoff for subagent announce retries. */
function resolveAnnounceRetryDelayMs(retryCount) {
	return computeBackoff(ANNOUNCE_RETRY_BACKOFF, Math.max(1, retryCount));
}
function formatAnnounceGiveUpLogField(value) {
	const normalized = value.replace(/\s+/g, " ").trim();
	return JSON.stringify(normalized.length > 2e3 ? `${truncateUtf16Safe(normalized, 2e3)}…` : normalized);
}
/** Logs a sanitized final give-up line for failed subagent announce delivery. */
function logAnnounceGiveUp(entry, reason) {
	const retryCount = getDeliveryAttemptCount(entry);
	const endedAt = entry.execution.endedAt;
	const endedAgoMs = typeof endedAt === "number" ? Math.max(0, Date.now() - endedAt) : void 0;
	const endedAgoLabel = endedAgoMs != null ? `${Math.round(endedAgoMs / 1e3)}s` : "n/a";
	const lastDeliveryError = getDeliveryLastError(entry);
	const deliveryError = lastDeliveryError ? ` deliveryError=${formatAnnounceGiveUpLogField(lastDeliveryError)}` : "";
	defaultRuntime.log(`[warn] Subagent announce give up (${reason}) run=${entry.runId} child=${entry.childSessionKey} requester=${entry.requesterSessionKey} retries=${retryCount} endedAgo=${endedAgoLabel}${deliveryError}`);
}
/** Persists child session timing/status derived from the subagent registry row. */
async function persistSubagentSessionTiming(entry, options) {
	const childSessionKey = entry.childSessionKey?.trim();
	if (!childSessionKey) return;
	const cfg = getRuntimeConfig();
	const agentId = resolveAgentIdFromSessionKey(childSessionKey);
	const storePath = resolveSessionStorePathCore(cfg.session?.store, { agentId });
	const startedAt = getSubagentSessionStartedAt(entry);
	const endedAt = typeof entry.execution.endedAt === "number" && Number.isFinite(entry.execution.endedAt) ? entry.execution.endedAt : void 0;
	const runtimeMs = endedAt !== void 0 ? getSubagentSessionRuntimeMs(entry, endedAt) : getSubagentSessionRuntimeMs(entry);
	const status = resolveSubagentSessionStatus(entry);
	await patchSessionEntryCore({
		storePath,
		sessionKey: childSessionKey
	}, (sessionEntry) => {
		if (options?.isCurrentGeneration && !options.isCurrentGeneration()) return null;
		if (status === "killed") {
			const existingCompletion = resolveCompletionFromSessionEntry(sessionEntry, Date.now(), { notBeforeMs: entry.execution.startedAt ?? entry.createdAt });
			if (existingCompletion && existingCompletion.reason !== "subagent-killed") {
				if (sessionEntry.abortedLastRun !== true) return null;
				const completedEntry = { ...sessionEntry };
				delete completedEntry.abortedLastRun;
				return completedEntry;
			}
		}
		const next = { ...sessionEntry };
		if (typeof startedAt === "number" && Number.isFinite(startedAt)) next.startedAt = startedAt;
		else delete next.startedAt;
		if (typeof endedAt === "number" && Number.isFinite(endedAt)) next.endedAt = endedAt;
		else delete next.endedAt;
		if (typeof runtimeMs === "number" && Number.isFinite(runtimeMs)) next.runtimeMs = runtimeMs;
		else delete next.runtimeMs;
		if (status) next.status = status;
		else delete next.status;
		if (status && status !== "killed") delete next.abortedLastRun;
		return next;
	}, {
		assertCommitAllowed: options?.assertCommitAllowed,
		replaceEntry: true
	});
}
function isResolvedChildPath(params) {
	const rootWithSep = params.rootPath.endsWith(path.sep) ? params.rootPath : `${params.rootPath}${path.sep}`;
	return params.childPath.startsWith(rootWithSep);
}
/** Best-effort async removal for a subagent attachment directory. */
async function safeRemoveAttachmentsDir(entry) {
	if (!entry.attachmentsDir || !entry.attachmentsRootDir) return true;
	const resolveReal = async (targetPath) => {
		try {
			return await promises.realpath(targetPath);
		} catch (err) {
			if (err?.code === "ENOENT") return null;
			throw err;
		}
	};
	try {
		const [rootReal, dirReal] = await Promise.all([resolveReal(entry.attachmentsRootDir), resolveReal(entry.attachmentsDir)]);
		if (!dirReal) return true;
		const rootBase = rootReal ?? path.resolve(entry.attachmentsRootDir);
		const dirBase = dirReal;
		if (!isResolvedChildPath({
			childPath: dirBase,
			rootPath: rootBase
		})) return false;
		await promises.rm(dirBase, {
			recursive: true,
			force: true
		});
		return true;
	} catch {
		return false;
	}
}
function safeRemoveAttachmentsDirSync(entry) {
	if (!entry.attachmentsDir || !entry.attachmentsRootDir) return;
	const resolveReal = (targetPath) => {
		try {
			return fs.realpathSync.native(targetPath);
		} catch (err) {
			if (err?.code === "ENOENT") return null;
			throw err;
		}
	};
	try {
		const rootReal = resolveReal(entry.attachmentsRootDir);
		const dirReal = resolveReal(entry.attachmentsDir);
		if (!dirReal) return;
		if (!isResolvedChildPath({
			childPath: dirReal,
			rootPath: rootReal ?? path.resolve(entry.attachmentsRootDir)
		})) return;
		fs.rmSync(dirReal, {
			recursive: true,
			force: true
		});
	} catch {}
}
/** Marks an orphaned registry run finished, cleans attachments, and removes it. */
function reconcileOrphanedRun(params) {
	if (hasRetainedRequiredCompletionDelivery(params.entry)) return false;
	if (params.entry.cleanup === "delete" || !params.entry.retainAttachmentsOnKeep) safeRemoveAttachmentsDirSync(params.entry);
	const removed = params.runs.delete(params.runId);
	params.resumedRuns.delete(params.runId);
	if (!removed) return false;
	defaultRuntime.log(`[warn] Subagent orphan run pruned source=${params.source} run=${params.runId} child=${params.entry.childSessionKey} reason=${params.reason}`);
	return true;
}
/** Reconciles orphaned runs found when restoring persisted subagent registry state. */
function reconcileOrphanedRestoredRuns(params) {
	const now = Date.now();
	let changed = false;
	for (const [runId, entry] of params.runs.entries()) {
		if (entry.collect && entry.collectorCompletion) continue;
		if (entry.requesterSettleWake) continue;
		if (entry.killReconciliation || entry.killIntent || entry.execution.restartRecovery || entry.terminalOwner === "interrupted-recovery") continue;
		const orphanReason = resolveSubagentRunOrphanReason({
			entry,
			includeStaleUnended: true,
			now
		});
		if (!orphanReason) continue;
		if (reconcileOrphanedRun({
			runId,
			entry,
			reason: orphanReason,
			source: "restore",
			runs: params.runs,
			resumedRuns: params.resumedRuns
		})) changed = true;
	}
	return changed;
}
/** Resolves the completed subagent archive delay from config. */
function resolveArchiveAfterMs(cfg) {
	const minutes = (cfg ?? getRuntimeConfig()).agents?.defaults?.subagents?.archiveAfterMinutes ?? 60;
	if (!Number.isFinite(minutes) || minutes < 0) return;
	if (minutes === 0) return;
	return Math.max(1, Math.floor(minutes)) * 6e4;
}
/** Arms retention only after the run or its waitable collector result has completed. */
function updateSubagentArchiveAtMs(entry, cfg) {
	const endedAt = typeof entry.execution.endedAt === "number" && Number.isFinite(entry.execution.endedAt) ? entry.execution.endedAt : void 0;
	const completedAt = entry.collect ? endedAt === void 0 && !entry.collectorCompletion ? void 0 : typeof entry.completion?.capturedAt === "number" && Number.isFinite(entry.completion.capturedAt) ? entry.completion.capturedAt : endedAt : entry.cleanup === "delete" && entry.pauseReason !== "sessions_yield" ? endedAt : void 0;
	const archiveAfterMs = entry.spawnMode === "session" || completedAt === void 0 ? void 0 : resolveArchiveAfterMs(cfg);
	const expectedArchiveAt = completedAt !== void 0 && archiveAfterMs !== void 0 ? completedAt + archiveAfterMs : void 0;
	if (entry.archiveAtMs === expectedArchiveAt) return false;
	if (expectedArchiveAt === void 0) delete entry.archiveAtMs;
	else entry.archiveAtMs = expectedArchiveAt;
	return true;
}
//#endregion
//#region src/infra/session-delivery-queue-recovery.ts
const MAX_SESSION_DELIVERY_RETRIES = 5;
const recoveryCoordinator = createDeliveryRecoveryCoordinator();
async function notifySessionDeliverySettled(params) {
	try {
		await params.onSettled?.(params.entry, params.outcome);
		return true;
	} catch (error) {
		params.log.error(`session delivery: settled callback failed for ${params.entry.id}: ${String(error)}`);
		return false;
	}
}
async function finalizeSessionDeliverySettlement(params) {
	if (!await notifySessionDeliverySettled(params)) return false;
	try {
		if (params.outcome === "recovered") await completeSessionDelivery(params.entry.id, params.stateDir);
		else await moveSessionDeliveryToFailed(params.entry.id, params.stateDir);
		return true;
	} catch (error) {
		params.log.error(`session delivery: ${params.outcome} finalization failed for ${params.entry.id}: ${String(error)}`);
		return false;
	}
}
function resolvePendingSettlementOutcome(entry) {
	return entry.settlementOutcome ?? (entry.acknowledgedAt !== void 0 ? "recovered" : void 0);
}
function resolveSessionDeliveryMaxRetries(entry) {
	return entry.maxRetries ?? MAX_SESSION_DELIVERY_RETRIES;
}
function canReconcileStartedAgentAttemptAtRetryLimit(entry) {
	return entry.kind === "agentTurn" && entry.deliveryStartedAt !== void 0 && entry.retryCount === resolveSessionDeliveryMaxRetries(entry);
}
function resolveSessionRetryEligibility(entry, now) {
	if (entry.kind === "agentTurn" && entry.owner?.kind === "subagent_completion") {
		if (now >= entry.owner.deadlineAt) return { eligible: true };
		const remainingBackoffMs = Math.max(0, (entry.availableAt ?? 0) - now);
		return remainingBackoffMs > 0 ? {
			eligible: false,
			remainingBackoffMs
		} : { eligible: true };
	}
	return isDeliveryRecoveryRetryEligible(entry, now);
}
async function processPendingSessionDelivery(opts) {
	const { entry, context } = opts;
	const pendingSettlementOutcome = resolvePendingSettlementOutcome(entry);
	if (pendingSettlementOutcome) return {
		status: pendingSettlementOutcome,
		finalized: await finalizeSessionDeliverySettlement({
			entry,
			log: context.log,
			onSettled: context.onSettled,
			outcome: pendingSettlementOutcome,
			stateDir: context.stateDir
		})
	};
	if (!canReconcileStartedAgentAttemptAtRetryLimit(entry) && entry.retryCount >= resolveSessionDeliveryMaxRetries(entry)) {
		await markSessionDeliverySettlement(entry, "moved-to-failed", context.stateDir);
		return {
			status: "max-retries",
			finalized: await finalizeSessionDeliverySettlement({
				entry,
				log: context.log,
				onSettled: context.onSettled,
				outcome: "moved-to-failed",
				stateDir: context.stateDir
			})
		};
	}
	if (!opts.bypassBackoff) {
		const retryEligibility = resolveSessionRetryEligibility(entry, Date.now());
		if (!retryEligibility.eligible) return {
			status: "backoff",
			remainingMs: retryEligibility.remainingBackoffMs
		};
	}
	if (await opts.beforeDelivery?.() === "stop") return { status: "stop" };
	let result;
	try {
		await context.deliver(entry, { stateDir: context.stateDir });
		await markSessionDeliverySettlement(entry, "recovered", context.stateDir);
		result = "recovered";
	} catch (err) {
		if (err instanceof SessionDeliveryDeadLetteredError) {
			try {
				await markSessionDeliverySettlement(entry, "moved-to-failed", context.stateDir);
			} catch (markError) {
				if (markError instanceof SessionDeliveryAcknowledgementFinalizeError) return { status: "deferred" };
				throw markError;
			}
			result = "moved-to-failed";
		} else if (err instanceof SessionDeliveryDeferredError || err instanceof SessionDeliveryAcknowledgementFinalizeError || err instanceof SessionDeliveryAttemptStartError) return { status: "deferred" };
		else {
			const errMsg = formatErrorMessage(err);
			opts.onFailed?.(entry, errMsg);
			if (err instanceof SessionDeliveryRetryChargedError) return { status: "failed" };
			try {
				await failSessionDelivery(entry.id, errMsg, context.stateDir, { releaseAttemptOwnership: err instanceof SessionDeliverySafeRetryError });
			} catch (failErr) {
				if (getErrnoCode(failErr) === "ENOENT") return { status: "already-gone" };
				throw failErr;
			}
			return { status: "failed" };
		}
	}
	const finalized = await finalizeSessionDeliverySettlement({
		entry,
		log: context.log,
		onSettled: context.onSettled,
		outcome: result,
		stateDir: context.stateDir
	});
	return {
		status: result,
		finalized
	};
}
async function processDrainedSessionDelivery(entry, context, bypassBackoff) {
	const result = await processPendingSessionDelivery({
		entry,
		context,
		bypassBackoff,
		onFailed: (failedEntry, errMsg) => {
			context.log.warn(`${context.logLabel}: retry failed for entry ${failedEntry.id}: ${errMsg}`);
		}
	});
	if (result.status === "max-retries" && result.finalized) context.log.warn(`${context.logLabel}: entry ${entry.id} exceeded max retries and was moved to failed`);
	else if (result.status === "backoff") context.log.info(`${context.logLabel}: entry ${entry.id} not ready for retry yet — backoff ${result.remainingMs}ms remaining`);
	return result;
}
/** Drain one exact queued session delivery and return its final pending state. */
async function drainPendingSessionDelivery(opts) {
	const claim = await recoveryCoordinator.withClaim(opts.id, async () => {
		const entry = await loadPendingSessionDelivery(opts.id, opts.stateDir);
		if (!entry) return null;
		const result = await processDrainedSessionDelivery(entry, opts, opts.bypassBackoff);
		if (result.status === "already-gone" || "finalized" in result && result.finalized) return null;
		return result.status === "backoff" ? entry : loadPendingSessionDelivery(opts.id, opts.stateDir);
	});
	if (claim.status === "claimed-by-other-owner") {
		opts.log.info(`${opts.logLabel}: entry ${opts.id} is already being recovered`);
		return loadPendingSessionDelivery(opts.id, opts.stateDir);
	}
	return claim.value;
}
/** Replay pending session deliveries until the recovery budget is exhausted. */
async function recoverPendingSessionDeliveries(opts) {
	const pending = (await loadPendingSessionDeliveries(opts.stateDir)).filter((entry) => opts.maxEnqueuedAt == null || entry.enqueuedAt <= opts.maxEnqueuedAt);
	if (pending.length === 0) return createEmptyDeliveryRecoverySummary();
	const summary = createEmptyDeliveryRecoverySummary();
	const deadline = resolveDeliveryRecoveryDeadlineMs(opts.maxRecoveryMs);
	const onDeadlineExceeded = () => {
		opts.log.warn("Session delivery recovery time budget exceeded — remaining entries deferred");
	};
	const context = {
		...opts,
		logLabel: "Session delivery"
	};
	const beforeDelivery = async () => {
		if (await recoveryCoordinator.waitForReplay(deadline) === "deadline-exceeded") {
			onDeadlineExceeded();
			return "stop";
		}
		return "continue";
	};
	const onFailed = (_failedEntry, errMsg) => {
		summary.failed += 1;
		opts.log.warn(`Session delivery retry failed: ${errMsg}`);
	};
	await recoveryCoordinator.scan({
		entries: pending,
		loadEntry: (id) => loadPendingSessionDelivery(id, opts.stateDir),
		deadlineMs: deadline,
		onDeadlineExceeded,
		onEntry: async (currentEntry) => {
			if (opts.maxEnqueuedAt != null && currentEntry.enqueuedAt > opts.maxEnqueuedAt) return "continue";
			const result = await processPendingSessionDelivery({
				entry: currentEntry,
				context,
				beforeDelivery,
				onFailed
			});
			if (result.status === "max-retries") {
				summary.skippedMaxRetries += 1;
				return "continue";
			}
			if (result.status === "backoff") {
				summary.deferredBackoff += 1;
				return "continue";
			}
			if (result.status === "stop") return "stop";
			if (result.status === "recovered" && result.finalized) {
				summary.recovered += 1;
				opts.log.info(`Recovered session delivery ${currentEntry.id}`);
			}
			return "continue";
		}
	});
	return summary;
}
//#endregion
//#region src/infra/session-delivery-queue-runtime.ts
const RUNTIME_RELOAD_RETRY_MS = 1e3;
let runtime;
let runtimeGeneration = 0;
const scheduledEntries = /* @__PURE__ */ new Map();
const runningEntries = /* @__PURE__ */ new Map();
let pendingScanTimer;
function clearScheduledEntries() {
	for (const scheduled of scheduledEntries.values()) clearTimeout(scheduled.timer);
	scheduledEntries.clear();
	if (pendingScanTimer) {
		clearTimeout(pendingScanTimer);
		pendingScanTimer = void 0;
	}
}
function armPendingScan(generation) {
	if (!runtime || generation !== runtimeGeneration || pendingScanTimer) return;
	pendingScanTimer = setTimeout(() => {
		pendingScanTimer = void 0;
		schedulePendingSessionDeliveries();
	}, RUNTIME_RELOAD_RETRY_MS);
	pendingScanTimer.unref?.();
}
function resolveRetryDelayMs(entry) {
	const claimDelayMs = Math.max(0, (entry.availableAt ?? 0) - Date.now());
	const deadlineDelayMs = entry.kind === "agentTurn" && entry.owner?.kind === "subagent_completion" ? Math.max(0, entry.owner.deadlineAt - Date.now()) : Number.POSITIVE_INFINITY;
	if (entry.retryCount <= 0) return Math.min(claimDelayMs, deadlineDelayMs);
	if (entry.kind === "agentTurn" && entry.owner?.kind === "subagent_completion") return Math.min(deadlineDelayMs, claimDelayMs);
	const attemptedAt = entry.lastAttemptAt ?? entry.enqueuedAt;
	return Math.min(deadlineDelayMs, Math.max(claimDelayMs, attemptedAt + computeBackoffMs(entry.retryCount) - Date.now()));
}
function armSessionDeliveryId(id, delayMs, generation) {
	if (!runtime || generation !== runtimeGeneration) return;
	const dueAt = performance.now() + delayMs;
	const existing = scheduledEntries.get(id);
	if (existing && existing.dueAt <= dueAt) return;
	if (existing) clearTimeout(existing.timer);
	const timer = setTimeout(() => {
		scheduledEntries.delete(id);
		runScheduledSessionDelivery(id, generation);
	}, delayMs);
	timer.unref?.();
	scheduledEntries.set(id, {
		timer,
		dueAt
	});
}
function armSessionDelivery(entry, generation, minimumDelayMs = 0) {
	if (runningEntries.get(entry.id) === generation) return;
	armSessionDeliveryId(entry.id, Math.max(minimumDelayMs, resolveRetryDelayMs(entry)), generation);
}
async function runScheduledSessionDelivery(id, generation) {
	const activeRuntime = runtime;
	if (!activeRuntime || generation !== runtimeGeneration) return;
	if (runningEntries.get(id) === generation) return;
	runningEntries.set(id, generation);
	let pending = null;
	try {
		pending = await (activeRuntime.drain ?? drainPendingSessionDelivery)({
			id,
			logLabel: "session delivery",
			log: activeRuntime.log,
			deliver: activeRuntime.deliver,
			onSettled: activeRuntime.onSettled
		});
	} catch (error) {
		activeRuntime.log.error(`session delivery: runtime drain failed for ${id}: ${String(error)}`);
		if (runtime && generation === runtimeGeneration) armSessionDeliveryId(id, RUNTIME_RELOAD_RETRY_MS, generation);
	} finally {
		if (runningEntries.get(id) === generation) runningEntries.delete(id);
	}
	if (!runtime || generation !== runtimeGeneration) return;
	if (pending) armSessionDelivery(pending, generation, RUNTIME_RELOAD_RETRY_MS);
}
/** Register the gateway-owned delivery callback and return its lifecycle stop handle. */
function startSessionDeliveryRuntime(params) {
	runtimeGeneration += 1;
	const generation = runtimeGeneration;
	clearScheduledEntries();
	runtime = params;
	return () => {
		if (runtimeGeneration !== generation) return;
		runtimeGeneration += 1;
		runtime = void 0;
		clearScheduledEntries();
	};
}
/** Schedule one durable entry when a gateway runtime is available. */
async function scheduleSessionDelivery(id) {
	const generation = runtimeGeneration;
	const activeRuntime = runtime;
	if (!activeRuntime) return false;
	let entry;
	try {
		entry = await (activeRuntime.reloadPending ?? loadPendingSessionDelivery)(id);
	} catch (error) {
		activeRuntime.log.error(`session delivery: failed to load ${id}: ${String(error)}`);
		armSessionDeliveryId(id, RUNTIME_RELOAD_RETRY_MS, generation);
		return true;
	}
	if (!entry || !runtime || generation !== runtimeGeneration) return !entry;
	armSessionDelivery(entry, generation);
	return true;
}
/** Schedule every pending entry after startup recovery installs the runtime owner. */
async function schedulePendingSessionDeliveries() {
	const generation = runtimeGeneration;
	const activeRuntime = runtime;
	if (!activeRuntime) return;
	let entries;
	try {
		entries = await (activeRuntime.listPending ?? loadPendingSessionDeliveries)();
	} catch (error) {
		activeRuntime.log.error(`session delivery: failed to scan pending entries: ${String(error)}`);
		armPendingScan(generation);
		return;
	}
	if (!runtime || generation !== runtimeGeneration) return;
	for (const entry of entries) armSessionDelivery(entry, generation);
}
//#endregion
//#region src/agents/subagents/registry/subagent-registry-lifecycle-delivery.ts
const DELIVERY_MIRROR_HISTORY_MAX_CHARS = 131072;
function buildSafeLifecycleErrorMeta(error) {
	const message = formatErrorMessage(error);
	const name = readErrorName(error);
	return name ? {
		name,
		message
	} : { message };
}
function maskLifecycleIdentifier(value, kind) {
	const trimmed = value.trim();
	if (!trimmed) return "unknown";
	return kind === "session" ? `${trimmed.split(":").slice(0, 2).join(":") || "session"}:…` : trimmed.length <= 8 ? "***" : `${sliceUtf16Safe(trimmed, 0, 4)}…${sliceUtf16Safe(trimmed, -4)}`;
}
const formatAnnounceDeliveryError = (delivery) => {
	const errors = [
		delivery.error,
		delivery.reason,
		...(delivery.phases ?? []).map((phase) => phase.error ? `${phase.phase}: ${phase.error}` : void 0)
	].map((value) => value?.trim()).filter((value) => Boolean(value));
	return errors.length > 0 ? uniqueStrings(errors).join("; ") : `delivery path ${delivery.path} did not complete`;
};
const recordAnnounceDeliveryResult = (entry, delivery, runs) => {
	const deliveryState = ensureDeliveryState(entry);
	if (typeof delivery.enqueuedAt === "number") deliveryState.enqueuedAt ??= delivery.enqueuedAt;
	if (!delivery.delivered && delivery.disposition !== "intentional_non_delivery") {
		if (delivery.reason === "steer_dropped" || delivery.phases?.some((phase) => phase.reason === "steer_dropped")) deliveryState.lastDropReason = "steer_dropped";
		else if (delivery.path === "none") deliveryState.lastDropReason = "sink_unavailable";
	}
	if (delivery.delivered) {
		deliveryState.deliveredAt = typeof delivery.deliveredAt === "number" ? delivery.deliveredAt : Date.now();
		deliveryState.lastDropReason = void 0;
		const requesterTurnRunId = entry.requesterTurnRunId?.trim();
		if (delivery.path === "direct" && delivery.requesterVisibleFinalDelivered && requesterTurnRunId) {
			const siblings = [...runs?.values() ?? []].filter((sibling) => sibling.requesterSessionKey === entry.requesterSessionKey && sibling.requesterTurnRunId === requesterTurnRunId && sibling.expectsCompletionMessage === true);
			if (siblings.some((sibling) => sibling === entry) && siblings.every((sibling) => sibling.execution.status === "terminal" && hasSubagentRunEnded(sibling) && (sibling === entry || sibling.delivery?.status === "delivered"))) deliveryState.requesterVisibleFinal = {
				requesterTurnRunId,
				batchRunIds: siblings.map((sibling) => sibling.runId).toSorted()
			};
		}
	}
	deliveryState.disposition = delivery.disposition ?? (delivery.delivered ? "delivered" : "retryable");
};
const markRequesterSettleWakePending = (entry, options) => {
	const existing = entry.requesterSettleWake;
	entry.requesterSettleWake = {
		...structuredClone(existing),
		status: existing?.status ?? "pending",
		attemptCount: existing?.attemptCount ?? 0,
		...existing?.retireAfterSettle === true || options?.retireAfterSettle === true ? { retireAfterSettle: true } : {}
	};
};
const hasPriorRequesterDeliveryMirror = async (params, entry) => {
	const completion = ensureCompletionState(entry);
	const expectedText = extractTextFromChatContent(completion.resultText, { joinWith: "" });
	if (entry.expectsCompletionMessage !== true || expectedText == null) return false;
	const mirrorNotBefore = entry.execution.startedAt ?? entry.createdAt;
	const mirrorNotAfter = Date.now() + 3e4;
	const expectedIdempotencyKey = buildAnnounceIdempotencyKey(buildAnnounceIdFromChildRun({
		childSessionKey: entry.childSessionKey,
		childRunId: entry.runId
	}));
	const isExpectedMirrorIdempotencyKey = (value) => typeof value === "string" && (value === expectedIdempotencyKey || value.startsWith(`${expectedIdempotencyKey}:internal-source-reply:`) || value.startsWith(`${expectedIdempotencyKey}:message-tool:internal-source-reply:`) || value.startsWith(`${entry.runId}:message-tool:`) || value.startsWith(`${entry.runId}:internal-source-reply:`));
	try {
		const mirror = (await params.callGateway({
			method: "chat.history",
			params: {
				sessionKey: entry.requesterSessionKey,
				limit: 25,
				maxChars: DELIVERY_MIRROR_HISTORY_MAX_CHARS
			},
			timeoutMs: 5e3
		})).messages?.find((message) => {
			if (!message || typeof message !== "object") return false;
			const record = message;
			const timestamp = record.timestamp;
			if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp < mirrorNotBefore || timestamp > mirrorNotAfter || !isExpectedMirrorIdempotencyKey(record.idempotencyKey)) return false;
			const text = extractTextFromChatContent(record.content, { joinWith: "" });
			return record.role === "assistant" && record.provider === "openclaw" && record.model === "delivery-mirror" && text === expectedText;
		});
		if (mirror) ensureDeliveryState(entry).deliveredAt = mirror.timestamp;
		return Boolean(mirror);
	} catch {
		return false;
	}
};
const resolveSubagentTaskTarget = (params, entry, resolution = params.resolveSubagentTask(entry)) => {
	const durableTaskRunId = entry.taskRunId ?? entry.runId;
	return {
		runId: resolution.lookup === "available" ? resolution.task?.runId ?? durableTaskRunId : durableTaskRunId,
		sessionKey: resolution.lookup === "available" ? resolution.task?.childSessionKey ?? entry.childSessionKey : entry.childSessionKey
	};
};
const safeSetSubagentTaskDeliveryStatus = (params, args) => {
	const target = resolveSubagentTaskTarget(params, args.entry);
	try {
		setDetachedTaskDeliveryStatusByRunId({
			runId: target.runId,
			runtime: "subagent",
			sessionKey: target.sessionKey,
			deliveryStatus: args.deliveryStatus,
			error: args.deliveryStatus === "failed" ? args.deliveryError : void 0
		});
	} catch (err) {
		params.warn("failed to update subagent background task delivery state", {
			error: buildSafeLifecycleErrorMeta(err),
			runId: maskLifecycleIdentifier(target.runId, "run"),
			childSessionKey: maskLifecycleIdentifier(target.sessionKey, "session"),
			deliveryStatus: args.deliveryStatus
		});
	}
};
const safeFinalizeSubagentTaskRun = (params, args) => {
	const terminal = resolveFinalizedSubagentTaskState(args.entry);
	if (!terminal) return [];
	const target = resolveSubagentTaskTarget(params, args.entry, args.taskResolution);
	const { status, error, terminalOutcome, ...details } = terminal;
	const suppressDelivery = args.entry.suppressCompletionDelivery === true;
	try {
		if (status === "succeeded") return completeTaskRunByRunId({
			runId: target.runId,
			runtime: "subagent",
			sessionKey: target.sessionKey,
			...details,
			terminalOutcome,
			suppressDelivery
		});
		return failTaskRunByRunId({
			runId: target.runId,
			runtime: "subagent",
			sessionKey: target.sessionKey,
			...details,
			status,
			error,
			suppressDelivery
		});
	} catch (err) {
		params.warn("failed to finalize subagent background task state", {
			error: buildSafeLifecycleErrorMeta(err),
			runId: maskLifecycleIdentifier(args.entry.runId, "run"),
			childSessionKey: maskLifecycleIdentifier(args.entry.childSessionKey, "session"),
			outcomeStatus: args.outcome.status
		});
		return [];
	}
};
const freezeRunResultAtCompletion = async (context, entry, outcome) => {
	const params = context.options;
	if (ensureCompletionState(entry).resultText !== void 0) return false;
	if (outcome.status === "error") {
		const completion = ensureCompletionState(entry);
		completion.resultText = null;
		completion.capturedAt = Date.now();
		return true;
	}
	let resultText;
	try {
		const transcriptTarget = entry.execution.transcriptTarget;
		const agentId = transcriptTarget?.agentId ?? resolveAgentIdFromSessionKey(entry.childSessionKey);
		const sessionKey = transcriptTarget?.sessionKey ?? entry.childSessionKey;
		const configuredStorePath = agentId ? transcriptTarget?.storePath ?? resolveSessionStorePathCore(params.getRuntimeConfig().session?.store, { agentId }) : void 0;
		const storePath = configuredStorePath ? resolveSessionStorePathForScope({
			agentId,
			sessionKey,
			storePath: configuredStorePath
		}) : void 0;
		const sessionId = transcriptTarget?.sessionId ?? (agentId && storePath ? loadSessionEntryReadOnly({
			agentId,
			sessionKey,
			storePath
		})?.sessionId : void 0);
		const sessionTarget = agentId && sessionId && storePath ? {
			agentId,
			sessionId,
			sessionKey,
			storePath
		} : void 0;
		const captured = await params.captureSubagentCompletionReply(entry.childSessionKey, {
			waitForReply: entry.expectsCompletionMessage === true,
			outcome,
			...sessionTarget ? { sessionTarget } : {}
		});
		resultText = captured?.trim() ? capFrozenResultText(captured) : null;
	} catch {
		resultText = null;
	}
	const liveEntry = params.runs.get(entry.runId);
	if (entry.pauseReason === "sessions_yield" || liveEntry?.pauseReason === "sessions_yield" || context.newerGenerationOwnsSession(entry)) return false;
	const completion = ensureCompletionState(entry);
	if (completion.resultText !== void 0) return false;
	completion.resultText = resultText;
	completion.capturedAt = Date.now();
	return true;
};
const listPendingCompletionRunsForSession = (params, sessionKey) => {
	const key = sessionKey.trim();
	if (!key) return [];
	const out = [];
	for (const entry of params.runs.values()) {
		if (entry.childSessionKey !== key) continue;
		if (entry.expectsCompletionMessage !== true) continue;
		if (typeof entry.execution.endedAt !== "number") continue;
		if (typeof entry.cleanupCompletedAt === "number") continue;
		if (entry.pauseReason === "sessions_yield") continue;
		out.push(entry);
	}
	return out;
};
const refreshFrozenResultFromSession = async (context, sessionKey) => {
	const params = context.options;
	const entry = listPendingCompletionRunsForSession(params, sessionKey).filter((entry) => entry.execution.outcome?.status !== "error").toSorted(compareSubagentRunGeneration).at(-1);
	if (!entry || context.newerGenerationOwnsSession(entry)) return false;
	const generation = entry.generation;
	let captured;
	try {
		captured = await params.captureSubagentCompletionReply(sessionKey);
	} catch {
		return false;
	}
	const trimmed = captured?.trim();
	if (!trimmed || isSilentAgentReplyText(trimmed)) return false;
	if (params.runs.get(entry.runId) !== entry || entry.generation !== generation || context.newerGenerationOwnsSession(entry)) return false;
	const nextFrozen = capFrozenResultText(trimmed);
	const completion = ensureCompletionState(entry);
	if (completion.resultText === nextFrozen) return false;
	completion.resultText = nextFrozen;
	completion.capturedAt = Date.now();
	params.persist(entry.runId);
	return true;
};
const emitCompletionEndedHookIfNeeded = async (params, entry, reason, isCurrent) => {
	if (params.shouldEmitEndedHookForRun({
		entry,
		reason
	})) await params.emitSubagentEndedHookForRun({
		entry,
		reason,
		sendFarewell: true,
		isCurrent
	});
};
const clearSubagentPendingDelivery = (entry) => {
	const delivery = ensureDeliveryState(entry);
	delivery.payload = void 0;
	delivery.createdAt = void 0;
	delivery.lastAttemptAt = void 0;
	delivery.attemptCount = void 0;
	delivery.lastError = void 0;
	delivery.suspendedAt = void 0;
	delivery.suspendedReason = void 0;
	if (delivery.status !== "delivered" && delivery.status !== "failed") clearDeliveryState(entry);
};
const loadPendingFinalDeliveryPayload = (entry) => {
	return {
		requesterSessionKey: entry.delivery?.payload?.requesterSessionKey ?? entry.requesterSessionKey,
		requesterOrigin: entry.delivery?.payload?.requesterOrigin ?? entry.requesterOrigin,
		requesterDisplayKey: entry.delivery?.payload?.requesterDisplayKey ?? entry.requesterDisplayKey,
		childSessionKey: entry.delivery?.payload?.childSessionKey ?? entry.childSessionKey,
		childRunId: entry.delivery?.payload?.childRunId ?? entry.runId,
		task: entry.delivery?.payload?.task ?? entry.task,
		label: entry.delivery?.payload?.label ?? entry.label,
		startedAt: entry.delivery?.payload?.startedAt ?? entry.execution.startedAt,
		endedAt: entry.delivery?.payload?.endedAt ?? entry.execution.endedAt,
		outcome: entry.delivery?.payload?.outcome ?? entry.execution.outcome,
		expectsCompletionMessage: entry.delivery?.payload?.expectsCompletionMessage ?? entry.expectsCompletionMessage,
		spawnMode: entry.delivery?.payload?.spawnMode ?? entry.spawnMode,
		wakeOnDescendantSettle: entry.delivery?.payload?.wakeOnDescendantSettle ?? entry.wakeOnDescendantSettle,
		terminalReply: entry.completion?.terminalReply ?? entry.delivery?.payload?.terminalReply
	};
};
const markPendingFinalDelivery = (args) => {
	const now = Date.now();
	const payload = loadPendingFinalDeliveryPayload(args.entry);
	const delivery = ensureDeliveryState(args.entry);
	delivery.status = "pending";
	delivery.createdAt ??= now;
	delivery.lastAttemptAt = now;
	delivery.attemptCount = (delivery.attemptCount ?? 0) + 1;
	delivery.lastError = args.error ?? null;
	delivery.payload = payload;
};
const refreshPendingFinalDeliveryPayload = (entry) => {
	const delivery = entry.delivery;
	if (!delivery?.payload || delivery.status === "delivered" || typeof delivery.announcedAt === "number") return false;
	delivery.payload = {
		...delivery.payload,
		startedAt: entry.execution.startedAt,
		endedAt: entry.execution.endedAt,
		outcome: entry.execution.outcome,
		terminalReply: entry.completion?.terminalReply
	};
	return true;
};
//#endregion
//#region src/agents/subagents/completion/subagent-completion-admission.store.ts
const SUSPENDED_RETENTION_MS = 6048e5;
function invokeSynchronousHook(hook) {
	const result = hook?.();
	if (result && typeof result.then === "function") throw new Error("subagent completion admission transaction hooks must be synchronous");
}
function publishCommittedRecords(subagent, task) {
	const live = subagentRuns.get(subagent.runId);
	if (live) {
		for (const key of Object.keys(live)) Reflect.deleteProperty(live, key);
		Object.assign(live, subagent);
	} else subagentRuns.set(subagent.runId, subagent);
	publishTaskRecordAfterAtomicStore(task);
}
function assertCorrelatedEntry(params) {
	const owner = params.queueEntry.kind === "agentTurn" ? params.queueEntry.owner : void 0;
	const delivery = params.subagent.delivery;
	if (!owner || owner.kind !== "subagent_completion" || owner.runId !== params.subagent.runId || owner.taskId !== params.task.taskId || owner.generation !== delivery?.generation || owner.deadlineAt !== delivery.deadlineAt || params.queueEntry.id !== delivery.queueId || params.task.deliveryStatus !== "session_queued") throw new Error("subagent completion admission records do not share one owner generation");
}
/**
* Commits the physical queue generation, logical completion owner, and task
* projection as one database-only transaction on one exact shared-state handle.
*/
function admitSubagentCompletionDelivery(params) {
	assertCorrelatedEntry(params);
	const boundQueue = bindDeliveryQueueEntry({
		queueName: SESSION_DELIVERY_QUEUE_NAME,
		entry: params.queueEntry,
		insertOnly: true
	});
	const boundSubagent = bindSubagentRunRecord(params.subagent);
	const boundTask = bindTaskRecord(params.task);
	invokeSynchronousHook(params.testHooks?.afterBind);
	return runOpenClawStateWriteTransaction((database) => {
		const claimed = upsertBoundDeliveryQueueEntryInDatabase(boundQueue, database);
		invokeSynchronousHook(() => params.testHooks?.afterMutation?.("queue", database));
		if (!claimed) {
			const existing = loadDeliveryQueueEntryInDatabase(database, SESSION_DELIVERY_QUEUE_NAME, params.queueEntry.id);
			const expectedOwner = params.queueEntry.kind === "agentTurn" ? params.queueEntry.owner : void 0;
			const existingOwner = existing?.kind === "agentTurn" ? existing.owner : void 0;
			if (!existingOwner || !expectedOwner || existingOwner.kind !== expectedOwner.kind || existingOwner.runId !== expectedOwner.runId || existingOwner.taskId !== expectedOwner.taskId || existingOwner.generation !== expectedOwner.generation || existingOwner.deadlineAt !== expectedOwner.deadlineAt) throw new Error(`session delivery queue conflict for ${params.queueEntry.id}`);
		}
		upsertSubagentRunRowInDatabase(database, boundSubagent);
		invokeSynchronousHook(() => params.testHooks?.afterMutation?.("subagent", database));
		upsertTaskRunRowInDatabase(database, boundTask);
		invokeSynchronousHook(() => params.testHooks?.afterMutation?.("task", database));
		return { claimed };
	}, params.databaseOptions, { operationLabel: "subagent completion delivery admission" });
}
/** Atomically consumes a correlated queue settlement into registry and task projections. */
function settleSubagentCompletionDelivery(params) {
	const boundTask = bindTaskRecord(params.task);
	runOpenClawStateWriteTransaction((database) => {
		invokeSynchronousHook(() => params.mutateSubagent?.(params.subagent));
		upsertSubagentRunRowInDatabase(database, bindSubagentRunRecord(params.subagent));
		upsertTaskRunRowInDatabase(database, boundTask);
	}, params.databaseOptions, { operationLabel: "subagent completion delivery settlement" });
}
function blockSubagentCompletionDelivery(params) {
	const generation = params.subagent.delivery?.generation ?? 1;
	const now = Date.now();
	return runOpenClawStateWriteTransaction((database) => {
		const subagent = readSubagentRun(database, params.subagent.runId);
		const task = readTaskRecord(database.db, params.taskId);
		if (!subagent || !task || task.runtime !== "subagent" || task.status !== "succeeded" || subagent.execution.status !== "terminal" || subagent.execution.outcome?.status !== "ok" || subagent.expectsCompletionMessage !== true || (subagent.taskRunId ?? subagent.runId) !== task.runId || (subagent.delivery?.generation ?? 1) !== generation) return false;
		const delivery = ensureDeliveryState(subagent);
		delivery.payload ??= loadPendingFinalDeliveryPayload(subagent);
		Object.assign(delivery, {
			status: params.suspendedReason ? "suspended" : "failed",
			disposition: params.suspendedReason ? "permanent_failure" : params.disposition ?? delivery.disposition,
			lastError: params.reason,
			deliveredAt: void 0,
			announcedAt: void 0,
			suspendedAt: params.suspendedReason ? delivery.suspendedAt ?? now : delivery.suspendedAt,
			suspendedReason: params.suspendedReason ?? delivery.suspendedReason,
			nextAttemptAt: void 0,
			queueId: void 0
		});
		Object.assign(subagent, {
			cleanupHandled: false,
			wakeOnDescendantSettle: void 0
		});
		if (params.suspendedReason) markRequesterSettleWakePending(subagent);
		else subagent.suppressCompletionDelivery = true;
		const terminal = resolveRequiredCompletionDeliveryFailureTerminalResult(params.reason);
		Object.assign(task, {
			deliveryStatus: "failed",
			...terminal,
			error: params.reason,
			cleanupAfter: Math.max(task.cleanupAfter ?? 0, now + SUSPENDED_RETENTION_MS),
			lastEventAt: now
		});
		const text = task.notifyPolicy === "silent" ? null : formatTaskBlockedFollowupMessage(task);
		const queued = text ? prepareClaimedSessionDelivery({
			kind: "systemEvent",
			sessionKey: resolveEventSessionKey(task.requesterSessionKey),
			...task.requesterAgentId ? { agentId: task.requesterAgentId } : {},
			text,
			...subagent.requesterOrigin ? { deliveryContext: subagent.requesterOrigin } : {},
			idempotencyKey: `subagent-completion-blocked:${task.taskId}:generation:${generation}`
		}, 0, now) : void 0;
		if (queued) upsertBoundDeliveryQueueEntryInDatabase(bindDeliveryQueueEntry({
			queueName: SESSION_DELIVERY_QUEUE_NAME,
			entry: queued,
			insertOnly: true
		}), database);
		settleSubagentCompletionDelivery({
			subagent,
			task,
			databaseOptions: { database }
		});
		deferSqlitePostCommitPublication(database.db, () => {
			publishCommittedRecords(subagent, task);
			if (queued) scheduleSessionDelivery(queued.id);
		});
		return true;
	}, params.databaseOptions);
}
//#endregion
export { logAnnounceGiveUp as A, resolveSubagentSessionCompletion as B, startSessionDeliveryRuntime as C, ANNOUNCE_EXPIRY_MS as D, ANNOUNCE_COMPLETION_HARD_EXPIRY_MS as E, safeRemoveAttachmentsDir as F, resolveKilledSubagentTaskEndedAt as G, emitSubagentEndedHookOnce as H, updateSubagentArchiveAtMs as I, resolveLifecycleOutcomeFromRunOutcome as K, loadSubagentSessionEntry as L, reconcileOrphanedRestoredRuns as M, reconcileOrphanedRun as N, MIN_ANNOUNCE_RETRY_DELAY_MS as O, resolveAnnounceRetryDelayMs as P, resolveCompletionFromSessionEntry as R, scheduleSessionDelivery as S, recoverPendingSessionDeliveries as T, emitSubagentProgressEndedHook as U, resolveSubagentSessionStartedAt as V, resolveFinalizedSubagentTaskState as W, refreshFrozenResultFromSession as _, settleSubagentCompletionDelivery as a, safeSetSubagentTaskDeliveryStatus as b, emitCompletionEndedHookIfNeeded as c, hasPriorRequesterDeliveryMirror as d, loadPendingFinalDeliveryPayload as f, recordAnnounceDeliveryResult as g, maskLifecycleIdentifier as h, publishCommittedRecords as i, persistSubagentSessionTiming as j, PROVISIONAL_KILL_RECONCILIATION_MS as k, formatAnnounceDeliveryError as l, markRequesterSettleWakePending as m, admitSubagentCompletionDelivery as n, buildSafeLifecycleErrorMeta as o, markPendingFinalDelivery as p, blockSubagentCompletionDelivery as r, clearSubagentPendingDelivery as s, SUSPENDED_RETENTION_MS as t, freezeRunResultAtCompletion as u, refreshPendingFinalDeliveryPayload as v, drainPendingSessionDelivery as w, schedulePendingSessionDeliveries as x, safeFinalizeSubagentTaskRun as y, resolveSubagentRunOrphanReason as z };
