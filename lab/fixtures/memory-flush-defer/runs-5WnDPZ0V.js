import { F as resolveTimerTimeoutMs } from "./number-coercion-CLj0HTDM.js";
import { i as resolveGlobalSingleton } from "./global-singleton-Dc_stLtU.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { n as getRuntimeConfig } from "./io.runtime-CKu7Rw0j.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { o as resolveSessionStorePathCore } from "./paths-DDTeIhCT.js";
import { _ as resolveSessionAgentId } from "./agent-scope-CSlN0kZb.js";
import "./io-Des9Xfzj.js";
import { c as getAgentEventLifecycleGeneration, l as isAgentEventLifecycleGenerationCurrent } from "./agent-events-Con5xUCM.js";
import { s as getActiveAgentRunDelegatedAuthority } from "./agent-run-registry-D84MDeZl.js";
import { d as loadSessionEntry } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { mt as updateSessionEntry } from "./session-accessor-K0XuW6ln.js";
import { A as hasReplyOperationExecutionStarted, O as resolveReplyBackendQueueMessageMismatch, T as forceClearReplyOperation, b as waitForReplyRunEndBySessionId, c as isReplyRunAbortableForCompaction, d as listActiveReplyRunSessionIds, g as resolveActiveReplyRunSessionId, h as resolveActiveReplyOperationForSessionId, i as expireStaleReplyRunBySessionId, k as getAttachedBackend, l as isReplyRunActiveForSessionId, n as abortReplyRunBySessionId, t as abortActiveReplyRuns, u as isReplyRunEvidenceStaleBySessionId, v as supersedeReplyRunByRunId, y as waitForReplyOperationOwnerSettlement } from "./reply-run-registry.registry-DWAbDPHN.js";
import { t as hasPromptImageInput } from "./prompt-image-input-D9m64odM.js";
import { a as ACTIVE_EMBEDDED_RUNS_BY_RUN_ID, c as ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_KEY, d as EMBEDDED_RUN_WAITERS, f as RETAINED_EMBEDDED_RUN_ABORTABILITY_RUN_IDS, h as setActiveEmbeddedRunLifecycleGeneration, i as ACTIVE_EMBEDDED_RUNS, l as ACTIVE_EMBEDDED_RUN_SNAPSHOTS, m as resolveActiveEmbeddedRunRecoveryBlocker, n as ABANDONED_EMBEDDED_RUN_SESSION_IDS_BY_FILE, o as ACTIVE_EMBEDDED_RUN_REGISTRATIONS, r as ABANDONED_EMBEDDED_RUN_SESSION_IDS_BY_KEY, s as ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE, t as ABANDONED_EMBEDDED_RUNS_BY_SESSION_ID, u as EMBEDDED_RUN_FORCED_TERMINAL_SETTLEMENTS } from "./run-state-DklzSa7D.js";
import { _ as resolveRunStaleThresholdMs, a as getDiagnosticSessionActivitySnapshot, c as markDiagnosticEmbeddedRunEnded, d as markDiagnosticRunProgress, l as markDiagnosticEmbeddedRunStarted, o as isDiagnosticEmbeddedRunOwnerClosed } from "./diagnostic-run-activity-DLw8ESkx.js";
import { a as logMessageQueuedWithBacklogPolicy, t as diagnosticLogger } from "./diagnostic-runtime-CSG-z4ca.js";
import "./reply-run-registry-CjJljBy4.js";
import { o as logSessionStateChange } from "./diagnostic-CN79G-MT.js";
import { r as getGatewayToolCallerIdentity } from "./gateway-caller-context-CRUBJj3M.js";
import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
//#region src/agents/session-placement-forced-terminal-settlement.ts
const forcedTerminalSettlement = resolveGlobalSingleton(Symbol.for("openclaw.sessionPlacementForcedTerminalSettlement"), () => new AsyncLocalStorage());
function withSessionPlacementForcedTerminalSettlement(settle, assertClaimCurrent, task) {
	return forcedTerminalSettlement.run({
		settle,
		assertCurrent: assertClaimCurrent
	}, task);
}
function resolveSessionPlacementForcedTerminalSettlement() {
	return forcedTerminalSettlement.getStore()?.settle;
}
function resolveSessionPlacementTurnSettlementAssertion() {
	return forcedTerminalSettlement.getStore()?.assertCurrent;
}
//#endregion
//#region src/agents/embedded-agent-runner/runs.ts
/**
* Manages active embedded-agent run handles, queues, aborts, and waiters.
*/
function createQueueFailureOutcome(sessionId, reason, errorMessage) {
	return {
		queued: false,
		sessionId,
		reason,
		gatewayHealth: "live",
		...errorMessage ? { errorMessage } : {}
	};
}
function formatEmbeddedAgentQueueFailureSummary(outcome) {
	if (outcome.queued) return;
	const errorPart = outcome.errorMessage ? ` error=${outcome.errorMessage}` : "";
	return `queue_message_failed reason=${outcome.reason} sessionId=${outcome.sessionId} gatewayHealth=${outcome.gatewayHealth}${errorPart}`;
}
function setActiveRunSessionKey(sessionKey, sessionId) {
	const normalizedSessionKey = sessionKey?.trim();
	if (!normalizedSessionKey) return;
	ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_KEY.set(normalizedSessionKey, sessionId);
}
function clearActiveRunSessionKeys(sessionId, sessionKey) {
	const normalizedSessionKey = sessionKey?.trim();
	if (normalizedSessionKey) {
		if (ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_KEY.get(normalizedSessionKey) === sessionId) ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_KEY.delete(normalizedSessionKey);
		return;
	}
	for (const [key, activeSessionId] of ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_KEY) if (activeSessionId === sessionId) ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_KEY.delete(key);
}
function normalizeSessionFileRegistryKey(sessionFile) {
	const normalized = sessionFile?.trim();
	if (!normalized) return;
	if (normalized.startsWith("agent:") || normalized.startsWith("sqlite:") || normalized.startsWith("in-memory:")) return normalized;
	const resolved = path.resolve(normalized);
	const parent = path.dirname(resolved);
	try {
		return path.join(fs.realpathSync(parent), path.basename(resolved));
	} catch {
		return resolved;
	}
}
function setActiveRunSessionFile(sessionFile, sessionId) {
	const normalizedSessionFile = normalizeSessionFileRegistryKey(sessionFile);
	if (!normalizedSessionFile) return;
	ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE.set(normalizedSessionFile, sessionId);
}
function clearEmbeddedRunAbandonmentBySessionId(sessionId) {
	const abandonedRun = ABANDONED_EMBEDDED_RUNS_BY_SESSION_ID.get(sessionId);
	if (!abandonedRun) return;
	ABANDONED_EMBEDDED_RUNS_BY_SESSION_ID.delete(sessionId);
	const normalizedSessionKey = abandonedRun.sessionKey?.trim();
	if (normalizedSessionKey && ABANDONED_EMBEDDED_RUN_SESSION_IDS_BY_KEY.get(normalizedSessionKey) === sessionId) ABANDONED_EMBEDDED_RUN_SESSION_IDS_BY_KEY.delete(normalizedSessionKey);
	const normalizedSessionFile = normalizeSessionFileRegistryKey(abandonedRun.sessionFile);
	if (normalizedSessionFile) {
		const sessionFileKey = normalizedSessionFile;
		if (ABANDONED_EMBEDDED_RUN_SESSION_IDS_BY_FILE.get(sessionFileKey) === sessionId) ABANDONED_EMBEDDED_RUN_SESSION_IDS_BY_FILE.delete(sessionFileKey);
	}
}
function clearEmbeddedRunAbandonmentBySessionKey(sessionKey) {
	const normalizedSessionKey = sessionKey?.trim();
	if (!normalizedSessionKey) return;
	const sessionId = ABANDONED_EMBEDDED_RUN_SESSION_IDS_BY_KEY.get(normalizedSessionKey);
	if (sessionId) clearEmbeddedRunAbandonmentBySessionId(sessionId);
}
function clearEmbeddedRunAbandonmentBySessionFile(sessionFile) {
	const normalizedSessionFile = normalizeSessionFileRegistryKey(sessionFile);
	if (!normalizedSessionFile) return;
	const sessionFileKey = normalizedSessionFile;
	const sessionId = ABANDONED_EMBEDDED_RUN_SESSION_IDS_BY_FILE.get(sessionFileKey);
	if (sessionId) clearEmbeddedRunAbandonmentBySessionId(sessionId);
}
function clearEmbeddedRunAbandonment(params) {
	const normalizedSessionId = params.sessionId?.trim();
	if (normalizedSessionId) clearEmbeddedRunAbandonmentBySessionId(normalizedSessionId);
	clearEmbeddedRunAbandonmentBySessionKey(params.sessionKey);
	clearEmbeddedRunAbandonmentBySessionFile(params.sessionFile);
}
function markEmbeddedRunAbandoned(params) {
	const sessionId = params.sessionId.trim();
	if (!sessionId) return;
	clearEmbeddedRunAbandonment({
		sessionId,
		sessionKey: params.sessionKey,
		sessionFile: params.sessionFile
	});
	const normalizedSessionFile = normalizeSessionFileRegistryKey(params.sessionFile);
	const abandonedRun = {
		sessionId,
		abandonedAtMs: Date.now(),
		reason: params.reason,
		...params.sessionKey?.trim() ? { sessionKey: params.sessionKey.trim() } : {},
		...normalizedSessionFile ? { sessionFile: normalizedSessionFile } : {}
	};
	ABANDONED_EMBEDDED_RUNS_BY_SESSION_ID.set(sessionId, abandonedRun);
	if (abandonedRun.sessionKey) ABANDONED_EMBEDDED_RUN_SESSION_IDS_BY_KEY.set(abandonedRun.sessionKey, sessionId);
	if (abandonedRun.sessionFile) ABANDONED_EMBEDDED_RUN_SESSION_IDS_BY_FILE.set(abandonedRun.sessionFile, sessionId);
}
function markActiveEmbeddedRunAbandoned(params) {
	const sessionId = params.sessionId.trim();
	if (!sessionId || ACTIVE_EMBEDDED_RUNS.get(sessionId) !== params.handle) return false;
	markEmbeddedRunAbandoned(params);
	return true;
}
function isEmbeddedRunAbandoned(params) {
	const normalizedSessionId = params.sessionId?.trim();
	if (normalizedSessionId && ABANDONED_EMBEDDED_RUNS_BY_SESSION_ID.has(normalizedSessionId)) return true;
	const normalizedSessionKey = params.sessionKey?.trim();
	if (normalizedSessionKey && ABANDONED_EMBEDDED_RUN_SESSION_IDS_BY_KEY.has(normalizedSessionKey)) return true;
	const normalizedSessionFile = normalizeSessionFileRegistryKey(params.sessionFile);
	return Boolean(normalizedSessionFile && ABANDONED_EMBEDDED_RUN_SESSION_IDS_BY_FILE.has(normalizedSessionFile));
}
function clearActiveRunSessionFiles(sessionId, sessionFile) {
	const normalizedSessionFile = normalizeSessionFileRegistryKey(sessionFile);
	if (normalizedSessionFile) {
		if (ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE.get(normalizedSessionFile) === sessionId) ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE.delete(normalizedSessionFile);
	}
	for (const [sessionFileKey, activeSessionId] of ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE) if (activeSessionId === sessionId) ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE.delete(sessionFileKey);
}
/**
* @deprecated Prefer queueEmbeddedAgentMessageWithOutcomeAsync when callers need to
* know whether steering was accepted. This sync helper is fire-and-forget after
* initial eligibility and only logs later runtime rejection.
*/
function queueEmbeddedAgentMessageWithOutcome(sessionId, text, options) {
	const prepared = prepareEmbeddedAgentQueueMessage(sessionId, options);
	if (prepared.kind === "complete") return prepared.outcome;
	logActiveRunMessageAccepted(sessionId);
	prepared.queueMessage(text, options ?? { steeringMode: "all" }).catch((err) => {
		diagnosticLogger.debug(`queue message rejected after enqueue: sessionId=${sessionId} err=${formatErrorMessage(err)}`);
	});
	return {
		queued: true,
		sessionId,
		target: "embedded_run",
		gatewayHealth: "live",
		enqueuedAtMs: Date.now()
	};
}
function logActiveRunMessageAccepted(sessionId) {
	logMessageQueuedWithBacklogPolicy({
		sessionId,
		source: "embedded-agent-runner"
	}, false);
}
function resolveEmbeddedQueueMessage(sessionId, handle) {
	try {
		const injection = handle.messageInjection;
		if (injection) return injection.isAvailable() ? (text, options) => injection.queueMessage(text, options) : void 0;
		return (handle.isStopped ? !handle.isStopped() : handle.isStreaming()) ? (text, options) => handle.queueMessage(text, options) : void 0;
	} catch (err) {
		diagnosticLogger.warn(`queue message failed: sessionId=${sessionId} reason=injectable_check_failed err=${String(err)}`);
		return;
	}
}
function isEmbeddedRunHandleAbortable(sessionId, handle) {
	try {
		return handle.isAbortable?.() !== false;
	} catch (err) {
		diagnosticLogger.warn(`abort failed: sessionId=${sessionId} reason=abortable_check_failed err=${String(err)}`);
		return false;
	}
}
function isEmbeddedRunHandleSupersedable(runId, handle) {
	if (!isEmbeddedRunHandleAbortable(runId, handle)) return false;
	try {
		return handle.isStopped?.() !== true && handle.isAborted?.() !== true;
	} catch (err) {
		diagnosticLogger.warn(`supersede failed: runId=${runId} reason=lifecycle_check_failed err=${String(err)}`);
		return false;
	}
}
function isEmbeddedAgentRunAbortableForRunId(runId) {
	const normalizedRunId = runId.trim();
	if (!normalizedRunId) return true;
	const handle = ACTIVE_EMBEDDED_RUNS_BY_RUN_ID.get(normalizedRunId);
	return handle ? isEmbeddedRunHandleAbortable(normalizedRunId, handle) : true;
}
/** Cancels one exact process-local run after recording its superseded terminal owner. */
function supersedeEmbeddedAgentRunByRunId(runId, beforeCancel) {
	const normalizedRunId = runId.trim();
	if (!normalizedRunId) return false;
	const handle = ACTIVE_EMBEDDED_RUNS_BY_RUN_ID.get(normalizedRunId);
	if (handle) {
		if (!isEmbeddedRunHandleSupersedable(normalizedRunId, handle)) return false;
		beforeCancel();
		if (handle.cancel) handle.cancel("superseded");
		else handle.abort();
		return true;
	}
	return supersedeReplyRunByRunId(normalizedRunId, beforeCancel);
}
function clearEmbeddedAgentRunAbortabilityForRunId(runId) {
	const normalizedRunId = runId.trim();
	if (normalizedRunId) {
		ACTIVE_EMBEDDED_RUNS_BY_RUN_ID.delete(normalizedRunId);
		RETAINED_EMBEDDED_RUN_ABORTABILITY_RUN_IDS.delete(normalizedRunId);
	}
}
function retainEmbeddedAgentRunAbortabilityForRunId(runId) {
	const normalizedRunId = runId.trim();
	if (normalizedRunId) RETAINED_EMBEDDED_RUN_ABORTABILITY_RUN_IDS.add(normalizedRunId);
}
function clearEmbeddedRunAbortability(handle, opts) {
	ACTIVE_EMBEDDED_RUN_REGISTRATIONS.get(handle)?.humanInputWaits?.clear();
	if (!handle.runId || ACTIVE_EMBEDDED_RUNS_BY_RUN_ID.get(handle.runId) !== handle) return;
	if (opts?.retainFinalizing && RETAINED_EMBEDDED_RUN_ABORTABILITY_RUN_IDS.has(handle.runId) && !isEmbeddedRunHandleAbortable(handle.runId, handle)) return;
	ACTIVE_EMBEDDED_RUNS_BY_RUN_ID.delete(handle.runId);
}
async function queueEmbeddedAgentMessageWithOutcomeAsync(sessionId, text, options) {
	const prepared = prepareEmbeddedAgentQueueMessage(sessionId, options);
	if (prepared.kind === "complete") {
		const activeToolAuthorityFingerprint = normalizeOptionalString(ACTIVE_EMBEDDED_RUNS.get(sessionId)?.toolAuthorityFingerprint);
		const pendingInputAuthorityProven = Boolean(activeToolAuthorityFingerprint && (normalizeOptionalString(options?.toolAuthorityFingerprint) === activeToolAuthorityFingerprint || normalizeOptionalString(options?.pendingInputAuthorityFingerprint) === activeToolAuthorityFingerprint));
		if (!prepared.outcome.queued && (prepared.outcome.reason === "tool_authority_mismatch" || prepared.outcome.reason === "image_input_unsupported") && options?.isInboundUserMessage === true && hasPromptImageInput(options) && pendingInputAuthorityProven) try {
			await ACTIVE_EMBEDDED_RUNS.get(sessionId)?.cancelPendingUserInput?.("image-reply");
		} catch (err) {
			diagnosticLogger.warn(`failed to cancel pending user input before queued image fallback: sessionId=${sessionId} err=${formatErrorMessage(err)}`);
		}
		if (!prepared.outcome.queued && prepared.outcome.reason === "tool_authority_mismatch" && options?.isInboundUserMessage === true && !hasPromptImageInput(options) && pendingInputAuthorityProven) {
			const claimPendingUserInputAnswer = ACTIVE_EMBEDDED_RUNS.get(sessionId)?.claimPendingUserInputAnswer;
			if (claimPendingUserInputAnswer) try {
				if (await claimPendingUserInputAnswer(text, options)) {
					options.onQueueAccepted?.(true);
					logActiveRunMessageAccepted(sessionId);
					return {
						queued: true,
						sessionId,
						target: "embedded_run",
						gatewayHealth: "live",
						enqueuedAtMs: Date.now()
					};
				}
			} catch (err) {
				return createQueueFailureOutcome(sessionId, "runtime_rejected", formatErrorMessage(err));
			}
		}
		return prepared.outcome;
	}
	const enqueuedAtMs = Date.now();
	try {
		const queueResult = await prepared.queueMessage(text, options ?? { steeringMode: "all" });
		if (queueResult?.transcriptCommit === "unconfirmed") {
			diagnosticLogger.warn(`queue message accepted without transcript confirmation: sessionId=${sessionId} err=${queueResult.errorMessage}`);
			logActiveRunMessageAccepted(sessionId);
			return {
				queued: true,
				sessionId,
				target: "embedded_run",
				gatewayHealth: "live",
				transcriptCommit: "unconfirmed",
				errorMessage: queueResult.errorMessage,
				enqueuedAtMs
			};
		}
		const deliveredAtMs = options?.waitForTranscriptCommit ? Date.now() : void 0;
		logActiveRunMessageAccepted(sessionId);
		return {
			queued: true,
			sessionId,
			target: "embedded_run",
			gatewayHealth: "live",
			...deliveredAtMs !== void 0 ? { deliveredAtMs } : {},
			enqueuedAtMs
		};
	} catch (err) {
		const errorMessage = formatErrorMessage(err);
		diagnosticLogger.debug(`queue message rejected: sessionId=${sessionId} err=${errorMessage}`);
		return createQueueFailureOutcome(sessionId, "runtime_rejected", errorMessage);
	}
}
function prepareEmbeddedAgentQueueMessage(sessionId, options) {
	const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
	if (!handle) {
		if (isReplyRunEvidenceStaleBySessionId(sessionId)) {
			diagnosticLogger.debug(`queue message failed: sessionId=${sessionId} reason=stale_run`);
			return {
				kind: "complete",
				outcome: createQueueFailureOutcome(sessionId, "stale_run")
			};
		}
		if (options?.waitForTranscriptCommit === true) {
			diagnosticLogger.debug(`queue message failed: sessionId=${sessionId} reason=transcript_commit_wait_unsupported`);
			return {
				kind: "complete",
				outcome: createQueueFailureOutcome(sessionId, "transcript_commit_wait_unsupported")
			};
		}
		return {
			kind: "complete",
			outcome: createQueueFailureOutcome(sessionId, "no_active_run")
		};
	}
	const queueMessage = resolveEmbeddedQueueMessage(sessionId, handle);
	if (!queueMessage) {
		diagnosticLogger.debug(`queue message failed: sessionId=${sessionId} reason=not_streaming`);
		return {
			kind: "complete",
			outcome: createQueueFailureOutcome(sessionId, "not_streaming")
		};
	}
	const recoveryBlocker = resolveActiveEmbeddedRunRecoveryBlocker(sessionId, handle);
	if (ACTIVE_EMBEDDED_RUNS.get(sessionId) !== handle) return {
		kind: "complete",
		outcome: createQueueFailureOutcome(sessionId, "no_active_run")
	};
	const activity = getDiagnosticSessionActivitySnapshot({ sessionId });
	if (typeof activity.lastProgressAgeMs === "number" && activity.lastProgressAgeMs > resolveRunStaleThresholdMs(activity) && !recoveryBlocker) {
		diagnosticLogger.debug(`queue message failed: sessionId=${sessionId} reason=stale_run`);
		return {
			kind: "complete",
			outcome: createQueueFailureOutcome(sessionId, "stale_run")
		};
	}
	if (handle.isCompacting()) {
		diagnosticLogger.debug(`queue message failed: sessionId=${sessionId} reason=compacting`);
		return {
			kind: "complete",
			outcome: createQueueFailureOutcome(sessionId, "compacting")
		};
	}
	if (options?.waitForTranscriptCommit === true && handle.supportsTranscriptCommitWait !== true) {
		diagnosticLogger.debug(`queue message failed: sessionId=${sessionId} reason=transcript_commit_wait_unsupported`);
		return {
			kind: "complete",
			outcome: createQueueFailureOutcome(sessionId, "transcript_commit_wait_unsupported")
		};
	}
	const deliveryModeMismatch = resolveReplyBackendQueueMessageMismatch(handle, options, resolveActiveReplyOperationForSessionId(sessionId));
	if (deliveryModeMismatch) {
		diagnosticLogger.debug(`queue message failed: sessionId=${sessionId} reason=${deliveryModeMismatch}`);
		return {
			kind: "complete",
			outcome: createQueueFailureOutcome(sessionId, deliveryModeMismatch)
		};
	}
	return {
		kind: "embedded_run",
		queueMessage
	};
}
function abortEmbeddedAgentRun(sessionId, opts) {
	if (typeof sessionId === "string" && sessionId.length > 0) {
		const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
		if (!handle) {
			if (abortReplyRunBySessionId(sessionId)) return true;
			diagnosticLogger.debug(`abort failed: sessionId=${sessionId} reason=no_active_run`);
			return false;
		}
		if (!isEmbeddedRunHandleAbortable(sessionId, handle)) {
			diagnosticLogger.debug(`abort failed: sessionId=${sessionId} reason=not_abortable`);
			return false;
		}
		diagnosticLogger.debug(`aborting run: sessionId=${sessionId}`);
		try {
			handle.abort(opts?.reason);
		} catch (err) {
			diagnosticLogger.warn(`abort failed: sessionId=${sessionId} err=${String(err)}`);
			return false;
		}
		return true;
	}
	const abortActiveEmbeddedRunHandles = (params) => {
		let aborted = false;
		for (const [id, handle] of ACTIVE_EMBEDDED_RUNS) {
			if (params.skipSessionIds?.has(id)) continue;
			if (!params.shouldAbort(handle)) continue;
			if (!isEmbeddedRunHandleAbortable(id, handle)) continue;
			diagnosticLogger.debug(params.formatDebugMessage(id));
			try {
				handle.abort(opts?.reason);
				aborted = true;
			} catch (err) {
				diagnosticLogger.warn(`abort failed: sessionId=${id} err=${String(err)}`);
			}
		}
		return aborted;
	};
	const mode = opts?.mode;
	if (mode === "compacting") {
		const replyOwnedSessionIds = new Set(listActiveReplyRunSessionIds());
		const replyAborted = abortActiveReplyRuns({
			mode,
			onAbortError: (id, err) => diagnosticLogger.warn(`abort failed: sessionId=${id} owner=reply_run err=${String(err)}`)
		});
		const aborted = abortActiveEmbeddedRunHandles({
			shouldAbort: (handle) => handle.isCompacting(),
			formatDebugMessage: (id) => `aborting compacting run: sessionId=${id}`,
			skipSessionIds: replyOwnedSessionIds
		});
		return replyAborted || aborted;
	}
	if (mode === "all") {
		const replyOwnedSessionIds = new Set(listActiveReplyRunSessionIds());
		const replyAborted = abortActiveReplyRuns({
			mode,
			onAbortError: (id, err) => diagnosticLogger.warn(`abort failed: sessionId=${id} owner=reply_run err=${String(err)}`)
		});
		const aborted = abortActiveEmbeddedRunHandles({
			shouldAbort: () => true,
			formatDebugMessage: (id) => `aborting run: sessionId=${id}`,
			skipSessionIds: replyOwnedSessionIds
		});
		return replyAborted || aborted;
	}
	return false;
}
async function preemptAndDrainEmbeddedHeartbeatRun(sessionId, timeoutMs) {
	const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
	if (!handle?.preemptByVisibleTurn) return "not-heartbeat";
	const drainPromise = waitForCurrentEmbeddedAgentRunEnd(sessionId, timeoutMs, handle);
	try {
		handle.preemptByVisibleTurn();
	} catch (err) {
		diagnosticLogger.warn(`heartbeat preemption failed: sessionId=${sessionId} err=${String(err)}`);
	}
	return await drainPromise ? "drained" : "timed-out";
}
function isEmbeddedAgentRunActive(sessionId) {
	const active = ACTIVE_EMBEDDED_RUNS.has(sessionId) || isReplyRunActiveForSessionId(sessionId);
	if (active) diagnosticLogger.debug(`run active check: sessionId=${sessionId} active=true`);
	return active;
}
/**
* Returns whether a registry-owned run is still doing user-visible work.
* Terminal reply operations and aborted handles retain their lane for cleanup,
* but must not keep session activity projections in the running state.
*/
function resolveEmbeddedAgentRunProgressState(sessionId) {
	const replyOperation = resolveActiveReplyOperationForSessionId(sessionId);
	const replyPhase = replyOperation?.phase;
	const replyInProgress = replyPhase !== void 0 && replyPhase !== "completed" && replyPhase !== "failed" && replyPhase !== "aborted";
	if (isEmbeddedRunHandleInProgress(ACTIVE_EMBEDDED_RUNS.get(sessionId)) || replyInProgress && replyOperation && replyPhase !== "waiting_for_global_lane" && hasReplyOperationExecutionStarted(replyOperation)) return "running";
	return replyInProgress ? "queued" : void 0;
}
function isEmbeddedAgentRunInProgress(sessionId) {
	return resolveEmbeddedAgentRunProgressState(sessionId) !== void 0;
}
function resolveEmbeddedReplyActivity(sessionId) {
	const operation = resolveActiveReplyOperationForSessionId(sessionId);
	return operation ? {
		phase: operation.phase,
		lastActivityAtMs: operation.lastActivityAtMs
	} : void 0;
}
function isEmbeddedAgentRunHandleActive(sessionId) {
	const active = ACTIVE_EMBEDDED_RUNS.has(sessionId);
	if (active) diagnosticLogger.debug(`run handle active check: sessionId=${sessionId} active=true`);
	return active;
}
function isEmbeddedAgentRunAbortableForCompaction(sessionId) {
	const active = ACTIVE_EMBEDDED_RUNS.get(sessionId) ? true : isReplyRunAbortableForCompaction(sessionId);
	if (active) diagnosticLogger.debug(`run compact coordination check: sessionId=${sessionId} active=true`);
	return active;
}
function isEmbeddedAgentRunStreaming(sessionId) {
	return ACTIVE_EMBEDDED_RUNS.get(sessionId)?.isStreaming() ?? false;
}
function resolveActiveEmbeddedRunHandleSessionId(sessionKey) {
	const normalizedSessionKey = sessionKey.trim();
	if (!normalizedSessionKey) return;
	return ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_KEY.get(normalizedSessionKey);
}
function isEmbeddedRunHandleInProgress(handle) {
	if (!handle) return false;
	if (handle.isAborted) try {
		if (handle.isAborted()) return false;
	} catch {}
	return true;
}
function projectActiveEmbeddedRunOwner(registration, handle) {
	const runId = handle.runId;
	if (!runId || !isEmbeddedRunHandleInProgress(handle)) return;
	return {
		runId,
		sessionId: registration.sessionId,
		...registration.sessionKey ? { sessionKey: registration.sessionKey } : {},
		...handle.startedAtMs === void 0 ? {} : { startedAtMs: handle.startedAtMs },
		abort: () => {
			if (ACTIVE_EMBEDDED_RUNS.get(registration.sessionId) !== handle || ACTIVE_EMBEDDED_RUNS_BY_RUN_ID.get(runId) !== handle || !isEmbeddedRunHandleAbortable(runId, handle)) return false;
			try {
				if (handle.cancel) handle.cancel("user_abort");
				else handle.abort();
				return true;
			} catch {
				return false;
			}
		}
	};
}
function resolveActiveEmbeddedRunOwner(sessionId) {
	const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
	const registration = handle ? ACTIVE_EMBEDDED_RUN_REGISTRATIONS.get(handle) : void 0;
	return handle && registration ? projectActiveEmbeddedRunOwner(registration, handle) : void 0;
}
function resolveActiveEmbeddedRunOwnerByRunId(runId) {
	const normalizedRunId = runId.trim();
	const handle = normalizedRunId ? ACTIVE_EMBEDDED_RUNS_BY_RUN_ID.get(normalizedRunId) : void 0;
	if (!handle) return;
	const registration = ACTIVE_EMBEDDED_RUN_REGISTRATIONS.get(handle);
	return registration && ACTIVE_EMBEDDED_RUNS.get(registration.sessionId) === handle ? projectActiveEmbeddedRunOwner(registration, handle) : void 0;
}
function isActiveEmbeddedRunId(runId) {
	const normalizedRunId = runId.trim();
	const handle = normalizedRunId ? ACTIVE_EMBEDDED_RUNS_BY_RUN_ID.get(normalizedRunId) : void 0;
	const registration = handle ? ACTIVE_EMBEDDED_RUN_REGISTRATIONS.get(handle) : void 0;
	return Boolean(handle && registration && ACTIVE_EMBEDDED_RUNS.get(registration.sessionId) === handle && isEmbeddedRunHandleInProgress(handle));
}
function resolveActiveEmbeddedRunHandleSessionIdBySessionFile(sessionFile) {
	const normalizedSessionFile = normalizeSessionFileRegistryKey(sessionFile);
	if (!normalizedSessionFile) return;
	return ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE.get(normalizedSessionFile);
}
function resolveActiveEmbeddedRunSessionIdBySessionFile(sessionFile) {
	return resolveActiveEmbeddedRunHandleSessionIdBySessionFile(sessionFile);
}
function getActiveEmbeddedRunSnapshot(sessionId) {
	return ACTIVE_EMBEDDED_RUN_SNAPSHOTS.get(sessionId);
}
function waitForCurrentEmbeddedAgentRunEnd(sessionId, timeoutMs, handle) {
	const isHandleActive = () => handle ? ACTIVE_EMBEDDED_RUNS.get(sessionId) === handle : ACTIVE_EMBEDDED_RUNS.has(sessionId);
	if (!isHandleActive()) {
		if (handle) return Promise.resolve(true);
		return waitForReplyRunEndBySessionId(sessionId, timeoutMs);
	}
	const timeoutLabel = timeoutMs === null ? "none" : String(timeoutMs);
	diagnosticLogger.debug(`waiting for run end: sessionId=${sessionId} timeoutMs=${timeoutLabel}`);
	return new Promise((resolve) => {
		const waiters = EMBEDDED_RUN_WAITERS.get(sessionId) ?? /* @__PURE__ */ new Set();
		const waiter = {
			resolve,
			handle
		};
		if (timeoutMs !== null) waiter.timer = setTimeout(() => {
			waiters.delete(waiter);
			if (waiters.size === 0) EMBEDDED_RUN_WAITERS.delete(sessionId);
			diagnosticLogger.warn(`wait timeout: sessionId=${sessionId} timeoutMs=${timeoutMs}`);
			resolve(false);
		}, resolveTimerTimeoutMs(timeoutMs, 100, 100));
		waiters.add(waiter);
		EMBEDDED_RUN_WAITERS.set(sessionId, waiters);
		if (!isHandleActive()) {
			waiters.delete(waiter);
			if (waiters.size === 0) EMBEDDED_RUN_WAITERS.delete(sessionId);
			if (waiter.timer) clearTimeout(waiter.timer);
			resolve(true);
		}
	});
}
async function waitForEmbeddedAgentRunEnd(sessionId, timeoutMs = 15e3) {
	if (!sessionId) return true;
	const deadline = timeoutMs === null ? void 0 : Date.now() + timeoutMs;
	while (isEmbeddedAgentRunActive(sessionId)) {
		const remainingMs = deadline === void 0 ? null : deadline - Date.now();
		if (remainingMs !== null && remainingMs <= 0) return false;
		if (!await waitForCurrentEmbeddedAgentRunEnd(sessionId, remainingMs)) return false;
	}
	return true;
}
async function abortAndDrainEmbeddedAgentRun(params) {
	const settleMs = params.settleMs ?? 15e3;
	const settleDeadline = Date.now() + settleMs;
	const embeddedRunHandle = ACTIVE_EMBEDDED_RUNS.get(params.sessionId);
	const agentId = embeddedRunHandle ? ACTIVE_EMBEDDED_RUN_REGISTRATIONS.get(embeddedRunHandle)?.agentId : void 0;
	const replyOperation = resolveActiveReplyOperationForSessionId(params.sessionId);
	let releaseStaleExpiryBarrier;
	const staleExpiryBarrier = params.reason === "stuck_recovery" ? new Promise((resolve) => {
		releaseStaleExpiryBarrier = resolve;
	}) : void 0;
	const expiredReplyRun = params.reason === "stuck_recovery" && expireStaleReplyRunBySessionId(params.sessionId, "stuck_recovery", {
		afterClearBarrier: staleExpiryBarrier,
		followupAdmissionBarrierTimeout: settleMs + 1e3
	});
	const stampedStaleReplyRun = params.reason === "stuck_recovery" && replyOperation?.staleExpiryReason === "stuck_recovery";
	const waitForExpiredOwnerSettlement = async () => {
		if (!stampedStaleReplyRun || !replyOperation) return true;
		const settled = await waitForReplyOperationOwnerSettlement(replyOperation, Math.max(100, settleDeadline - Date.now()));
		if (!settled) diagnosticLogger.warn(`stuck recovery: reply owner settlement timed out sessionId=${params.sessionId} settleMs=${settleMs}`);
		return settled;
	};
	try {
		if (expiredReplyRun && !ACTIVE_EMBEDDED_RUNS.has(params.sessionId)) await new Promise((resolve) => {
			setImmediate(resolve);
		});
		let aborted = abortEmbeddedAgentRun(params.sessionId) || expiredReplyRun;
		const embeddedDrained = aborted || stampedStaleReplyRun ? await waitForEmbeddedAgentRunEnd(params.sessionId, settleMs) : false;
		const ownerSettled = await waitForExpiredOwnerSettlement();
		const drained = embeddedDrained && ownerSettled;
		if (!aborted && stampedStaleReplyRun && drained) aborted = true;
		const persistenceSnapshot = params.forceClear === true && params.sessionKey ? tryLoadForceClearSessionSnapshot(params.sessionKey, agentId) : void 0;
		const forceCleared = params.forceClear === true && (!expiredReplyRun && stampedStaleReplyRun && !ownerSettled || !aborted || !drained) ? await forceClearEmbeddedAgentRun(params.sessionId, embeddedRunHandle, replyOperation, params.sessionKey, params.reason) : false;
		if (forceCleared && params.sessionKey && persistenceSnapshot) await persistForceClearedEmbeddedRunTerminalState({
			...persistenceSnapshot,
			sessionId: params.sessionId,
			sessionKey: params.sessionKey
		});
		return {
			aborted,
			drained,
			forceCleared
		};
	} finally {
		releaseStaleExpiryBarrier?.();
	}
}
function tryLoadForceClearSessionSnapshot(sessionKey, preparedAgentId) {
	try {
		const cfg = getRuntimeConfig();
		const agentId = resolveSessionAgentId({
			config: cfg,
			sessionKey,
			agentId: preparedAgentId
		});
		const storePath = resolveSessionStorePathCore(cfg.session?.store, { agentId });
		const entry = loadSessionEntry({
			agentId,
			sessionKey,
			storePath
		});
		if (!entry || entry.status !== "running") return;
		return {
			agentId,
			...entry.startedAt === void 0 ? {} : { startedAt: entry.startedAt },
			storePath,
			updatedAt: entry.updatedAt
		};
	} catch (err) {
		diagnosticLogger.warn(`load force-clear session snapshot failed: sessionKey=${sessionKey} error=${String(err)}`);
		return;
	}
}
/** Persists terminal state when a forced registry clear cannot emit normal lifecycle. */
async function persistForceClearedEmbeddedRunTerminalState(params) {
	try {
		await updateSessionEntry({
			agentId: params.agentId,
			sessionKey: params.sessionKey,
			storePath: params.storePath
		}, (storedEntry) => {
			const entry = storedEntry;
			if (ACTIVE_EMBEDDED_RUNS.has(params.sessionId) || ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_KEY.has(params.sessionKey) || isReplyRunActiveForSessionId(params.sessionId) || resolveActiveReplyRunSessionId(params.sessionKey) !== void 0 || entry.sessionId !== params.sessionId || entry.status !== "running" || entry.updatedAt !== params.updatedAt || entry.startedAt !== params.startedAt) return null;
			const endedAt = Date.now();
			return {
				status: "killed",
				abortedLastRun: true,
				lifecycleRunId: void 0,
				endedAt,
				updatedAt: endedAt
			};
		}, {
			skipMaintenance: true,
			takeCacheOwnership: true,
			requireWriteSuccess: false
		});
	} catch (err) {
		diagnosticLogger.warn(`persist force-cleared terminal state failed: sessionKey=${params.sessionKey} error=${String(err)}`);
	}
}
function notifyEmbeddedRunEnded(sessionId, endedHandle) {
	const waiters = EMBEDDED_RUN_WAITERS.get(sessionId);
	if (!waiters || waiters.size === 0) return;
	const sessionIdle = !ACTIVE_EMBEDDED_RUNS.has(sessionId);
	diagnosticLogger.debug(`notifying waiters: sessionId=${sessionId} waiterCount=${waiters.size}`);
	for (const waiter of waiters) {
		if (waiter.handle ? waiter.handle !== endedHandle : !sessionIdle) continue;
		waiters.delete(waiter);
		if (waiter.timer) clearTimeout(waiter.timer);
		waiter.resolve(true);
	}
	if (waiters.size === 0) EMBEDDED_RUN_WAITERS.delete(sessionId);
}
function setActiveEmbeddedRun(sessionId, handle, sessionKey, sessionFile, agentId) {
	const currentLifecycleGeneration = getAgentEventLifecycleGeneration();
	const incomingLifecycleGeneration = setActiveEmbeddedRunLifecycleGeneration(handle, currentLifecycleGeneration);
	if (!isAgentEventLifecycleGenerationCurrent(incomingLifecycleGeneration)) {
		try {
			handle.abort("restart");
		} catch (error) {
			diagnosticLogger.warn(`stale run registration abort failed: sessionId=${sessionId} err=${String(error)}`);
			throw error;
		}
		return;
	}
	if (handle.diagnosticOwner && isDiagnosticEmbeddedRunOwnerClosed(handle.diagnosticOwner)) {
		handle.abort("restart");
		return;
	}
	const previousHandle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
	const wasActive = previousHandle !== void 0;
	if (previousHandle) {
		previousHandle.closeDiagnostics?.();
		clearEmbeddedRunAbortability(previousHandle, { retainFinalizing: true });
		EMBEDDED_RUN_FORCED_TERMINAL_SETTLEMENTS.delete(previousHandle);
	}
	clearEmbeddedRunAbandonment({
		sessionId,
		sessionKey,
		sessionFile
	});
	ACTIVE_EMBEDDED_RUNS.set(sessionId, handle);
	const operationalRunInstance = getGatewayToolCallerIdentity()?.operationalRunInstance;
	ACTIVE_EMBEDDED_RUN_REGISTRATIONS.set(handle, {
		sessionId,
		agentId,
		...sessionKey ? { sessionKey } : {},
		delegatedAuthority: operationalRunInstance?.runId === handle.runId && operationalRunInstance ? getActiveAgentRunDelegatedAuthority(operationalRunInstance) : void 0,
		onHumanInputResolved: () => {
			const operation = resolveActiveReplyOperationForSessionId(sessionId);
			if (operation && getAttachedBackend(operation) === handle) operation.recordActivity();
			markDiagnosticRunProgress({
				sessionId,
				sessionKey,
				reason: "human_input:resolved"
			});
			logSessionStateChange({
				sessionId,
				sessionKey,
				sessionFile,
				state: "processing",
				reason: "human_input_resolved"
			});
		}
	});
	const forcedTerminalSettlement = resolveSessionPlacementForcedTerminalSettlement();
	if (forcedTerminalSettlement) EMBEDDED_RUN_FORCED_TERMINAL_SETTLEMENTS.set(handle, forcedTerminalSettlement);
	if (handle.runId) ACTIVE_EMBEDDED_RUNS_BY_RUN_ID.set(handle.runId, handle);
	clearActiveRunSessionKeys(sessionId);
	setActiveRunSessionKey(sessionKey, sessionId);
	clearActiveRunSessionFiles(sessionId);
	setActiveRunSessionFile(sessionFile, sessionId);
	logSessionStateChange({
		sessionId,
		sessionKey,
		sessionFile,
		state: "processing",
		reason: wasActive ? "run_replaced" : "run_started"
	});
	markDiagnosticEmbeddedRunStarted({
		sessionId,
		sessionKey,
		runId: handle.runId,
		owner: handle.diagnosticOwner
	});
	if (!sessionId.startsWith("probe-")) diagnosticLogger.debug(`run registered: sessionId=${sessionId} totalActive=${ACTIVE_EMBEDDED_RUNS.size}`);
}
function updateActiveEmbeddedRunSnapshot(sessionId, snapshot) {
	if (!ACTIVE_EMBEDDED_RUNS.has(sessionId)) return;
	ACTIVE_EMBEDDED_RUN_SNAPSHOTS.set(sessionId, snapshot);
}
function clearActiveEmbeddedRun(sessionId, handle, sessionKey, sessionFile, reason = "run_completed") {
	const activeHandle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
	if (activeHandle === handle) {
		handle.closeDiagnostics?.();
		ACTIVE_EMBEDDED_RUNS.delete(sessionId);
		clearEmbeddedRunAbortability(handle, { retainFinalizing: true });
		ACTIVE_EMBEDDED_RUN_SNAPSHOTS.delete(sessionId);
		clearActiveRunSessionKeys(sessionId, sessionKey);
		clearActiveRunSessionFiles(sessionId, sessionFile);
		logSessionStateChange({
			sessionId,
			sessionKey,
			sessionFile,
			state: "idle",
			reason
		});
		if (!handle.diagnosticOwner) markDiagnosticEmbeddedRunEnded({
			sessionId,
			sessionKey
		});
		if (!sessionId.startsWith("probe-")) diagnosticLogger.debug(`run cleared: sessionId=${sessionId} totalActive=${ACTIVE_EMBEDDED_RUNS.size}`);
	} else if (activeHandle !== void 0) diagnosticLogger.debug(`run clear skipped: sessionId=${sessionId} reason=handle_mismatch`);
	EMBEDDED_RUN_FORCED_TERMINAL_SETTLEMENTS.delete(handle);
	notifyEmbeddedRunEnded(sessionId, handle);
}
async function forceClearEmbeddedAgentRun(sessionId, expectedHandle, expectedReplyOperation, sessionKey, reason = "stuck_recovery") {
	let cleared = false;
	let forcedTerminalSettlement;
	const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
	if (handle && handle === expectedHandle) {
		forcedTerminalSettlement = EMBEDDED_RUN_FORCED_TERMINAL_SETTLEMENTS.get(handle);
		EMBEDDED_RUN_FORCED_TERMINAL_SETTLEMENTS.delete(handle);
		handle.closeDiagnostics?.();
		ACTIVE_EMBEDDED_RUNS.delete(sessionId);
		clearEmbeddedRunAbortability(handle);
		ACTIVE_EMBEDDED_RUN_SNAPSHOTS.delete(sessionId);
		clearActiveRunSessionKeys(sessionId, sessionKey);
		clearActiveRunSessionFiles(sessionId);
		logSessionStateChange({
			sessionId,
			sessionKey,
			state: "idle",
			reason
		});
		if (!handle.diagnosticOwner) markDiagnosticEmbeddedRunEnded({
			sessionId,
			sessionKey
		});
		notifyEmbeddedRunEnded(sessionId, handle);
		cleared = true;
	}
	const cause = /* @__PURE__ */ new Error(`Embedded run force-cleared by ${reason}`);
	try {
		return (expectedReplyOperation ? forceClearReplyOperation(expectedReplyOperation, cause) : false) || cleared;
	} finally {
		await forcedTerminalSettlement?.();
	}
}
const testing = {
	persistForceClearedEmbeddedRunTerminalState,
	resetActiveEmbeddedRuns() {
		for (const handle of ACTIVE_EMBEDDED_RUNS.values()) EMBEDDED_RUN_FORCED_TERMINAL_SETTLEMENTS.delete(handle);
		for (const waiters of EMBEDDED_RUN_WAITERS.values()) for (const waiter of waiters) {
			if (waiter.timer) clearTimeout(waiter.timer);
			waiter.resolve(!waiter.handle);
		}
		EMBEDDED_RUN_WAITERS.clear();
		ACTIVE_EMBEDDED_RUNS.clear();
		ACTIVE_EMBEDDED_RUNS_BY_RUN_ID.clear();
		RETAINED_EMBEDDED_RUN_ABORTABILITY_RUN_IDS.clear();
		ACTIVE_EMBEDDED_RUN_SNAPSHOTS.clear();
		ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_KEY.clear();
		ACTIVE_EMBEDDED_RUN_SESSION_IDS_BY_FILE.clear();
		ABANDONED_EMBEDDED_RUNS_BY_SESSION_ID.clear();
		ABANDONED_EMBEDDED_RUN_SESSION_IDS_BY_KEY.clear();
		ABANDONED_EMBEDDED_RUN_SESSION_IDS_BY_FILE.clear();
	}
};
if (process.env.VITEST || false) globalThis[Symbol.for("openclaw.embeddedRunsTestApi")] = testing;
//#endregion
export { waitForEmbeddedAgentRunEnd as A, resolveActiveEmbeddedRunSessionIdBySessionFile as C, setActiveEmbeddedRun as D, retainEmbeddedAgentRunAbortabilityForRunId as E, withSessionPlacementForcedTerminalSettlement as M, supersedeEmbeddedAgentRunByRunId as O, resolveActiveEmbeddedRunOwnerByRunId as S, resolveEmbeddedReplyActivity as T, queueEmbeddedAgentMessageWithOutcome as _, formatEmbeddedAgentQueueFailureSummary as a, resolveActiveEmbeddedRunHandleSessionIdBySessionFile as b, isEmbeddedAgentRunAbortableForCompaction as c, isEmbeddedAgentRunHandleActive as d, isEmbeddedAgentRunInProgress as f, preemptAndDrainEmbeddedHeartbeatRun as g, markActiveEmbeddedRunAbandoned as h, clearEmbeddedAgentRunAbortabilityForRunId as i, resolveSessionPlacementTurnSettlementAssertion as j, updateActiveEmbeddedRunSnapshot as k, isEmbeddedAgentRunAbortableForRunId as l, isEmbeddedRunAbandoned as m, abortEmbeddedAgentRun as n, getActiveEmbeddedRunSnapshot as o, isEmbeddedAgentRunStreaming as p, clearActiveEmbeddedRun as r, isActiveEmbeddedRunId as s, abortAndDrainEmbeddedAgentRun as t, isEmbeddedAgentRunActive as u, queueEmbeddedAgentMessageWithOutcomeAsync as v, resolveEmbeddedAgentRunProgressState as w, resolveActiveEmbeddedRunOwner as x, resolveActiveEmbeddedRunHandleSessionId as y };
