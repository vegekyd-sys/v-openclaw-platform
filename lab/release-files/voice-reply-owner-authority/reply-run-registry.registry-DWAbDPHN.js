// voice-reply-owner-authority-v1
import { F as resolveTimerTimeoutMs } from "./number-coercion-CLj0HTDM.js";
import { i as resolveGlobalSingleton } from "./global-singleton-Dc_stLtU.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { t as createAbortError } from "./abort-signal-D2k14JsD.js";
import { t as createDeferredCore } from "./deferred-D0La5CRk.js";
import { c as getAgentEventLifecycleGeneration, l as isAgentEventLifecycleGenerationCurrent, m as registerAgentEventLifecycleRotationHandler } from "./agent-events-Con5xUCM.js";
import { c as createAgentRunRestartAbortError, f as isAgentRunRestartAbortReason, l as createAgentRunSupersededAbortError, p as isAgentRunSupersededAbortReason } from "./run-termination-Ts9RsbeN.js";
import { a as resetReplyRunSettleTimersForTesting, i as formatReplyOperationResult, n as createReplyRunFinalizationLease, r as createReplyRunSettleTimer } from "./reply-run-finalization-lease-Ds9-0UNB.js";
import { t as hasPromptImageInput } from "./prompt-image-input-D9m64odM.js";
import { m as resolveActiveEmbeddedRunRecoveryBlocker } from "./run-state-DklzSa7D.js";
import { _ as resolveRunStaleThresholdMs, a as getDiagnosticSessionActivitySnapshot, d as markDiagnosticRunProgress } from "./diagnostic-run-activity-DLw8ESkx.js";
import { t as diagnosticLogger } from "./diagnostic-runtime-CSG-z4ca.js";
//#region src/auto-reply/reply/reply-run-registry.contracts.ts
const replyMessageInjectionTargetOperation = Symbol("replyMessageInjectionTargetOperation");
const replyRunInterruptTargetOperation = Symbol("replyRunInterruptTargetOperation");
const REPLY_RUN_IDLE_SETTLE_TIMEOUT_MS = 15e3;
const REPLY_RUN_TERMINAL_SETTLE_TIMEOUT_MS = 6e4;
var ReplyRunAlreadyActiveError = class extends Error {
	constructor(sessionKey) {
		super(`Reply run already active for ${sessionKey}`);
		this.name = "ReplyRunAlreadyActiveError";
	}
};
var ReplyRunFollowupAdmissionBlockedError = class extends Error {
	constructor(sessionKey) {
		super(`Reply follow-up admission is blocked for ${sessionKey}`);
		this.name = "ReplyRunFollowupAdmissionBlockedError";
	}
};
var ReplyRunSuccessorAdmissionBlockedError = class extends Error {
	constructor(sessionKey) {
		super(`Reply successor admission is blocked for ${sessionKey}`);
		this.name = "ReplyRunSuccessorAdmissionBlockedError";
	}
};
const replyRunState = resolveGlobalSingleton(Symbol.for("openclaw.replyRunRegistry"), () => ({
	activeRunsByKey: /* @__PURE__ */ new Map(),
	activeSessionIdsByKey: /* @__PURE__ */ new Map(),
	activeKeysBySessionId: /* @__PURE__ */ new Map(),
	waitKeysBySessionId: /* @__PURE__ */ new Map(),
	waitersByKey: /* @__PURE__ */ new Map(),
	followupAdmissionBarriersByKey: /* @__PURE__ */ new Map(),
	successorAdmissionBarriersByKey: /* @__PURE__ */ new Map(),
	evictOperationByOperation: /* @__PURE__ */ new WeakMap(),
	executionStartedOperations: /* @__PURE__ */ new WeakSet()
}));
replyRunState.followupAdmissionBarriersByKey ??= /* @__PURE__ */ new Map();
replyRunState.successorAdmissionBarriersByKey ??= /* @__PURE__ */ new Map();
const evictReplyOperationByOperation = replyRunState.evictOperationByOperation ?? (replyRunState.evictOperationByOperation = /* @__PURE__ */ new WeakMap());
function createUserAbortError() {
	return createAbortError("Reply operation aborted by user");
}
function registerWaitSessionId(sessionKey, sessionId) {
	replyRunState.waitKeysBySessionId.set(sessionId, sessionKey);
}
function clearWaitSessionIds(sessionKey) {
	for (const [sessionId, mappedKey] of replyRunState.waitKeysBySessionId) if (mappedKey === sessionKey) replyRunState.waitKeysBySessionId.delete(sessionId);
}
function notifyReplyRunEnded(sessionKey) {
	const waiters = replyRunState.waitersByKey.get(sessionKey);
	if (!waiters || waiters.size === 0) return;
	replyRunState.waitersByKey.delete(sessionKey);
	for (const waiter of waiters) waiter.finish(true);
}
function resolveReplyRunForCurrentSessionId(sessionId) {
	const normalizedSessionId = normalizeOptionalString(sessionId);
	if (!normalizedSessionId) return;
	const sessionKey = replyRunState.activeKeysBySessionId.get(normalizedSessionId);
	if (!sessionKey) return;
	return replyRunState.activeRunsByKey.get(sessionKey);
}
function resolveReplyRunWaitKey(sessionId) {
	const normalizedSessionId = normalizeOptionalString(sessionId);
	if (!normalizedSessionId) return;
	return replyRunState.activeKeysBySessionId.get(normalizedSessionId) ?? replyRunState.waitKeysBySessionId.get(normalizedSessionId);
}
function isReplyRunCompacting(operation) {
	if (operation.phase === "preflight_compacting" || operation.phase === "memory_flushing") return true;
	if (operation.phase !== "running") return false;
	return getAttachedBackend(operation)?.isCompacting?.() ?? false;
}
function isReplyOperationPreBackendPhase(phase) {
	return phase === "queued" || phase === "waiting_for_deferred_maintenance" || phase === "waiting_for_global_lane";
}
const attachedBackendByOperation = /* @__PURE__ */ new WeakMap();
const executionStartedOperations = replyRunState.executionStartedOperations ?? (replyRunState.executionStartedOperations = /* @__PURE__ */ new WeakSet());
function markReplyOperationExecutionStarted(operation) {
	executionStartedOperations.add(operation);
}
function hasReplyOperationExecutionStarted(operation) {
	return executionStartedOperations.has(operation);
}
const abortFrozenOperations = /* @__PURE__ */ new WeakSet();
const operationsByUpstreamAbortSignal = /* @__PURE__ */ new WeakMap();
const retainStateUntilCompleteOperations = /* @__PURE__ */ new WeakSet();
const afterClearCallbacksByOperation = /* @__PURE__ */ new WeakMap();
const successorBarrierStartsByOperation = /* @__PURE__ */ new WeakMap();
const successorBarrierGroupsByOperation = /* @__PURE__ */ new WeakMap();
const expireReplyOperationByOperation = /* @__PURE__ */ new WeakMap();
function getAttachedBackend(operation) {
	return attachedBackendByOperation.get(operation);
}
function isReplyOperationAbortable(operation) {
	if (operation.result || abortFrozenOperations.has(operation)) return false;
	const backend = getAttachedBackend(operation);
	if (!backend?.isAbortable) return true;
	try {
		return backend.isAbortable();
	} catch {
		return false;
	}
}
function isReplyRunAbortableForSignal(signal) {
	const operation = operationsByUpstreamAbortSignal.get(signal);
	return operation ? isReplyOperationAbortable(operation) : true;
}
/** Resolve only the live operation admitted with this exact upstream signal. */
function resolveActiveReplyRunOwnerForSignal(signal) {
	const operation = operationsByUpstreamAbortSignal.get(signal);
	if (!operation) return;
	const { key: sessionKey, sessionId } = operation;
	const isCurrent = () => !signal.aborted && !operation.result && operation.key === sessionKey && operation.sessionId === sessionId && replyRunState.activeRunsByKey.get(sessionKey) === operation;
	if (!isCurrent()) return;
	return {
		sessionId,
		sessionKey,
		toolAuthorityFingerprint: normalizeOptionalString(getAttachedBackend(operation)?.toolAuthorityFingerprint ?? operation.toolAuthorityFingerprint),
		sourceReplyDeliveryMode: getAttachedBackend(operation)?.sourceReplyDeliveryMode,
		taskSuggestionDeliveryMode: getAttachedBackend(operation)?.taskSuggestionDeliveryMode,
		abort: () => isCurrent() && operation.abortByUser()
	};
}
/** Keep terminal state registered until the operation owner exits via complete(). */
function retainReplyOperationUntilComplete(operation) {
	retainStateUntilCompleteOperations.add(operation);
}
/** Queue-first compatibility adapter for shipped Plugin SDK/embedded handles. */
function runAfterReplyOperationClear(operation, afterClear) {
	if (replyRunState.activeRunsByKey.get(operation.key) !== operation) {
		const barrier = replyRunState.followupAdmissionBarriersByKey.get(operation.key);
		if (barrier) {
			barrier.settled.then(() => afterClear(barrier.sessionId));
			return;
		}
		afterClear(operation.sessionId);
		return;
	}
	const callbacks = afterClearCallbacksByOperation.get(operation) ?? /* @__PURE__ */ new Set();
	callbacks.add(afterClear);
	afterClearCallbacksByOperation.set(operation, callbacks);
}
function registerSuccessorAdmissionBarrier(sessionKey, sessionId, barrier) {
	const barriersByKey = replyRunState.successorAdmissionBarriersByKey;
	const previous = barriersByKey.get(sessionKey)?.settled;
	const settled = previous ? Promise.all([previous, barrier]).then(() => void 0) : barrier;
	const entry = {
		settled,
		sessionId
	};
	barriersByKey.set(sessionKey, entry);
	settled.then(() => {
		if (barriersByKey.get(sessionKey) === entry) barriersByKey.delete(sessionKey);
	});
	return entry;
}
/** Fence successor admission until owner handoff started at slot clear settles. */
function registerReplyOperationSuccessorBarrier(params) {
	const settlement = createDeferredCore();
	const barriers = /* @__PURE__ */ new Set();
	for (const sessionKey of new Set(params.sessionKeys.map(normalizeOptionalString))) if (sessionKey) barriers.add(registerSuccessorAdmissionBarrier(sessionKey, params.sessionId, settlement.promise));
	let started = false;
	const start = () => {
		if (started) return;
		started = true;
		try {
			Promise.resolve(params.start()).then(() => settlement.resolve(void 0), () => {});
		} catch {}
	};
	if (replyRunState.activeRunsByKey.get(params.operation.key) !== params.operation) {
		start();
		return;
	}
	const groups = successorBarrierGroupsByOperation.get(params.operation) ?? /* @__PURE__ */ new Set();
	groups.add({
		registrationKey: params.operation.key,
		barriers
	});
	successorBarrierGroupsByOperation.set(params.operation, groups);
	const starts = successorBarrierStartsByOperation.get(params.operation) ?? /* @__PURE__ */ new Set();
	starts.add(start);
	successorBarrierStartsByOperation.set(params.operation, starts);
}
function startReplyOperationSuccessorBarriers(operation) {
	const starts = successorBarrierStartsByOperation.get(operation);
	successorBarrierStartsByOperation.delete(operation);
	successorBarrierGroupsByOperation.delete(operation);
	if (!starts) return;
	for (const start of starts) start();
}
function updateSuccessorAdmissionSessionId(operation, sessionId) {
	for (const group of successorBarrierGroupsByOperation.get(operation) ?? []) {
		if (group.registrationKey !== operation.key) continue;
		for (const barrier of group.barriers) barrier.sessionId = sessionId;
	}
}
function isReplyRunSuccessorAdmissionBlocked(sessionKey) {
	const normalizedSessionKey = normalizeOptionalString(sessionKey);
	return Boolean(normalizedSessionKey && !replyRunState.activeRunsByKey.has(normalizedSessionKey) && replyRunState.successorAdmissionBarriersByKey.has(normalizedSessionKey));
}
function flushReplyOperationAfterClear(operation, sessionId) {
	const callbacks = afterClearCallbacksByOperation.get(operation);
	if (!callbacks) return;
	afterClearCallbacksByOperation.delete(operation);
	for (const callback of callbacks) callback(sessionId);
}
function waitForReplyBarrierSettlement(barrier, timeout = REPLY_RUN_IDLE_SETTLE_TIMEOUT_MS) {
	return new Promise((resolve) => {
		let settled = false;
		let timer;
		const finish = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve();
		};
		const schedule = (delayMs, callback) => {
			timer = setTimeout(callback, delayMs);
			timer.unref?.();
		};
		if (typeof timeout === "number") schedule(resolveTimerTimeoutMs(timeout, REPLY_RUN_IDLE_SETTLE_TIMEOUT_MS), finish);
		else {
			const startedAt = Date.now();
			const maxTimeoutMs = resolveTimerTimeoutMs(timeout.maxTimeoutMs, REPLY_RUN_IDLE_SETTLE_TIMEOUT_MS);
			const checkOwnerActivity = () => {
				const remainingMs = maxTimeoutMs - (Date.now() - startedAt);
				if (remainingMs <= 0) {
					finish();
					return;
				}
				let shouldExtend;
				try {
					shouldExtend = timeout.shouldExtend();
				} catch {
					finish();
					return;
				}
				if (!shouldExtend) {
					finish();
					return;
				}
				schedule(Math.min(REPLY_RUN_IDLE_SETTLE_TIMEOUT_MS, remainingMs), checkOwnerActivity);
			};
			schedule(Math.min(REPLY_RUN_IDLE_SETTLE_TIMEOUT_MS, maxTimeoutMs), checkOwnerActivity);
		}
		Promise.resolve(barrier).then(finish, finish);
	});
}
function registerFollowupAdmissionBarrier(sessionKey, sessionId, barrier, timeout = REPLY_RUN_IDLE_SETTLE_TIMEOUT_MS) {
	const barriersByKey = replyRunState.followupAdmissionBarriersByKey;
	const previous = barriersByKey.get(sessionKey)?.settled;
	const current = waitForReplyBarrierSettlement(barrier, timeout);
	const settled = previous ? Promise.all([previous, current]).then(() => void 0) : current;
	const entry = {
		settled,
		sessionId
	};
	barriersByKey.set(sessionKey, entry);
	settled.then(() => {
		if (barriersByKey.get(sessionKey) === entry) barriersByKey.delete(sessionKey);
	});
	return entry;
}
function updateFollowupAdmissionSessionId(sessionKey, sessionId) {
	const barrier = replyRunState.followupAdmissionBarriersByKey.get(sessionKey);
	if (barrier) barrier.sessionId = sessionId;
}
function clearReplyRunState(params) {
	if (replyRunState.activeRunsByKey.get(params.sessionKey) !== params.operation) {
		if (replyRunState.activeKeysBySessionId.get(params.sessionId) === params.sessionKey && replyRunState.activeSessionIdsByKey.get(params.sessionKey) !== params.sessionId) replyRunState.activeKeysBySessionId.delete(params.sessionId);
		return;
	}
	replyRunState.activeRunsByKey.delete(params.sessionKey);
	replyRunState.activeSessionIdsByKey.delete(params.sessionKey);
	if (replyRunState.activeKeysBySessionId.get(params.sessionId) === params.sessionKey) replyRunState.activeKeysBySessionId.delete(params.sessionId);
	clearWaitSessionIds(params.sessionKey);
	notifyReplyRunEnded(params.sessionKey);
}
function markReplyRunDiagnosticProgress(params) {
	markDiagnosticRunProgress({
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		reason: params.reason
	});
}
function isReplyRunRecoveryBlocked(operation) {
	const backend = getAttachedBackend(operation);
	const blocker = !operation.result && backend ? resolveActiveEmbeddedRunRecoveryBlocker(operation.sessionId, backend) : void 0;
	return blocker === "human_input_wait" || blocker === "runtime_owned_wait";
}
function isReplyRunEvidenceStale(operation) {
	const recoveryBlocked = isReplyRunRecoveryBlocked(operation);
	const activity = getDiagnosticSessionActivitySnapshot({
		sessionId: operation.sessionId,
		sessionKey: operation.key
	});
	return !operation.result && operation.phase !== "waiting_for_global_lane" && Date.now() - operation.lastActivityAtMs > resolveRunStaleThresholdMs(activity, Date.now() - operation.lastActivityAtMs) && !recoveryBlocked;
}
//#endregion
//#region src/auto-reply/reply/reply-run-registry.message-injection.ts
function resolveReplyBackendQueueMessageMismatch(backend, options, authority) {
	if (options?.isInboundUserMessage === true) {
		const activeFingerprint = normalizeOptionalString(backend.toolAuthorityFingerprint ?? authority?.toolAuthorityFingerprint);
		const incomingFingerprint = normalizeOptionalString(options.toolAuthorityFingerprint);
		if (!activeFingerprint || !incomingFingerprint || activeFingerprint !== incomingFingerprint) return "tool_authority_mismatch";
	}
	if (hasPromptImageInput(options) && backend.supportsQueueMessageImages !== true) return "image_input_unsupported";
	if (options?.sourceReplyDeliveryMode === "message_tool_only" && backend.sourceReplyDeliveryMode !== "message_tool_only") return "source_reply_delivery_mode_mismatch";
	if (options !== void 0 && Object.hasOwn(options, "taskSuggestionDeliveryMode") && options?.taskSuggestionDeliveryMode !== backend.taskSuggestionDeliveryMode) return "task_suggestion_delivery_mode_mismatch";
}
function resolveReplyBackendMessageInjection(backend) {
	if (backend.messageInjection) return backend.messageInjection;
	if (!backend.queueMessage) return;
	return {
		isAvailable: () => {
			if (backend.isStopped) return !backend.isStopped();
			return true;
		},
		queueMessage: (text, options) => options ? backend.queueMessage(text, options) : backend.queueMessage(text)
	};
}
function resolveReplyMessageInjectionRejection(params) {
	const { operation } = params;
	if (!operation || replyRunState.activeRunsByKey.get(operation.key) !== operation) return { reason: "no_active_run" };
	if (operation.result || operation.phase !== "running") return { reason: "not_running" };
	if (isReplyRunEvidenceStale(operation)) return { reason: "stale_run" };
	const backend = getAttachedBackend(operation);
	const injection = backend ? resolveReplyBackendMessageInjection(backend) : void 0;
	if (!backend || !injection) return { reason: "injection_unavailable" };
	try {
		if (!injection.isAvailable()) return { reason: "injection_unavailable" };
	} catch (error) {
		return {
			reason: "injection_unavailable",
			errorMessage: String(error)
		};
	}
	const mismatch = resolveReplyBackendQueueMessageMismatch(backend, params.options, operation);
	const activeFingerprint = normalizeOptionalString(backend.toolAuthorityFingerprint ?? operation.toolAuthorityFingerprint);
	const pendingInputAuthorityProven = activeFingerprint !== void 0 && normalizeOptionalString(params.options?.pendingInputAuthorityFingerprint) === activeFingerprint;
	if (mismatch === "tool_authority_mismatch" && pendingInputAuthorityProven && !hasPromptImageInput(params.options) && backend.claimPendingUserInputAnswer) return {
		backend,
		injection: {
			isAvailable: () => true,
			queueMessage: async (text, options) => {
				if (!await backend.claimPendingUserInputAnswer?.(text, options)) throw new Error("pending user input was not accepted");
			}
		}
	};
	return mismatch ? {
		reason: mismatch,
		backend
	} : {
		backend,
		injection
	};
}
function beginReplyMessageInjectionTarget(target, text, options) {
	const operation = target[replyMessageInjectionTargetOperation];
	const { toolAuthorityOverlay, ...backendOptions } = options ?? {};
	const projectedToolAuthorityFingerprint = toolAuthorityOverlay ? operation.projectToolAuthorityFingerprint(toolAuthorityOverlay) : backendOptions.toolAuthorityFingerprint;
	const queueOptions = options ? {
		...backendOptions,
		...toolAuthorityOverlay ? { toolAuthorityFingerprint: projectedToolAuthorityFingerprint } : {}
	} : void 0;
	const resolved = resolveReplyMessageInjectionRejection({
		operation,
		options: queueOptions
	});
	if (!("injection" in resolved)) {
		const immediateRejection = {
			status: "rejected",
			reason: resolved.reason,
			...resolved.errorMessage ? { errorMessage: resolved.errorMessage } : {}
		};
		const cancelPendingImage = options?.isInboundUserMessage === true && hasPromptImageInput(options) && (resolved.reason === "tool_authority_mismatch" || resolved.reason === "image_input_unsupported") ? resolved.backend?.cancelPendingUserInput : void 0;
		return {
			targetRunId: target.runId,
			acceptance: Promise.resolve(false),
			outcome: cancelPendingImage ? Promise.resolve(cancelPendingImage("image-reply")).then(() => immediateRejection) : Promise.resolve(immediateRejection)
		};
	}
	const targetRunId = normalizeOptionalString(resolved.backend.runId);
	const userTurnTranscriptRecorder = queueOptions?.userTurnTranscriptRecorder;
	const acceptance = createDeferredCore();
	let acceptanceSettled = false;
	const settleAcceptance = (accepted) => {
		if (acceptanceSettled) return;
		acceptanceSettled = true;
		acceptance.resolve(accepted);
	};
	const callerOnQueueAccepted = queueOptions?.onQueueAccepted;
	const runtimeQueueOptions = {
		...queueOptions,
		onQueueAccepted: (accepted) => {
			settleAcceptance(accepted);
			callerOnQueueAccepted?.(accepted);
		}
	};
	let queued;
	try {
		queued = resolved.injection.queueMessage(text, runtimeQueueOptions);
	} catch (error) {
		settleAcceptance(false);
		const immediateRejection = {
			status: "rejected",
			reason: "runtime_rejected",
			errorMessage: String(error)
		};
		return {
			targetRunId,
			acceptance: acceptance.promise,
			outcome: Promise.resolve(immediateRejection)
		};
	}
	const outcome = queued.then(async (result) => {
		settleAcceptance(true);
		if (targetRunId && queueOptions?.waitForTranscriptCommit === true && result?.transcriptCommit !== "unconfirmed") await userTurnTranscriptRecorder?.confirmSteerTargetRunIdForPersistence?.(targetRunId);
		return result ? {
			status: "accepted",
			result
		} : { status: "accepted" };
	}, (error) => {
		settleAcceptance(false);
		return {
			status: "rejected",
			reason: "runtime_rejected",
			errorMessage: String(error)
		};
	});
	return {
		targetRunId,
		acceptance: acceptance.promise,
		outcome
	};
}
/** Finalize adoption and cleanup on the captured operation without rediscovery. */
async function finalizeReplyMessageInjectionAttempt(params) {
	const outcome = await params.attempt.outcome;
	if (outcome.status === "rejected") return {
		status: "rejected",
		outcome,
		targetRunId: params.attempt.targetRunId
	};
	recordAcceptedReplyMessageInjectionTarget(params.target, { inboundAudio: params.inboundAudio });
	params.onAccepted?.();
	let aborted = outcome.result?.transcriptCommit === "unconfirmed";
	if (aborted) abortReplyMessageInjectionTarget(params.target);
	let adoptionError;
	try {
		await params.onAdopted?.();
	} catch (error) {
		adoptionError = error;
		if (params.shouldAbortOnAdoptionError?.(error)) {
			abortReplyMessageInjectionTarget(params.target);
			aborted = true;
		}
	}
	return {
		status: "accepted",
		outcome,
		targetRunId: params.attempt.targetRunId,
		aborted,
		...adoptionError === void 0 ? {} : { adoptionError }
	};
}
/** Abort only the operation captured by this target; never a same-key successor. */
function abortReplyMessageInjectionTarget(target) {
	return target[replyMessageInjectionTargetOperation].abortByUser();
}
/** Record accepted input on the exact operation without rediscovering its session slot. */
function recordAcceptedReplyMessageInjectionTarget(target, options) {
	const operation = target[replyMessageInjectionTargetOperation];
	operation.recordActivity();
	if (options?.inboundAudio === true) operation.markAcceptedSteeredInboundAudio();
}
//#endregion
//#region src/auto-reply/reply/reply-run-registry.operation.ts
function createReplyOperation(params) {
	const sessionKey = normalizeOptionalString(params.sessionKey);
	const sessionId = normalizeOptionalString(params.sessionId);
	if (!sessionKey) throw new Error("Reply operations require a canonical sessionKey");
	if (!sessionId) throw new Error("Reply operations require a sessionId");
	if (params.respectFollowupAdmissionBarrier && replyRunState.followupAdmissionBarriersByKey.has(sessionKey)) throw new ReplyRunFollowupAdmissionBlockedError(sessionKey);
	if (replyRunState.activeRunsByKey.has(sessionKey)) throw new ReplyRunAlreadyActiveError(sessionKey);
	if (replyRunState.successorAdmissionBarriersByKey.has(sessionKey)) throw new ReplyRunSuccessorAdmissionBlockedError(sessionKey);
	const controller = new AbortController();
	let currentSessionKey = sessionKey;
	let currentSessionId = sessionId;
	let phase = "queued";
	let phaseBeforeGlobalLaneWait;
	let staleExpiryReason;
	let result = null;
	let stateCleared = false;
	let clearBarrierSettlement;
	let pendingClearBarrier;
	let retainFailureUntilComplete = false;
	let terminalRecovery = false;
	let acceptedSteeredInboundAudio = false;
	let toolAuthorityFingerprint;
	let toolAuthorityProjector;
	let toolAuthorityRoute;
	const ownerSettlement = createDeferredCore();
	let ownerSettled = false;
	const settleOwner = () => {
		if (ownerSettled) return;
		ownerSettled = true;
		ownerSettlement.resolve(void 0);
	};
	const startedAtMs = Date.now();
	const lifecycleGeneration = getAgentEventLifecycleGeneration();
	let lastActivityAtMs = startedAtMs;
	const upstreamAbortSignal = params.upstreamAbortSignal;
	let upstreamAbortHandler;
	const detachUpstreamAbort = () => {
		if (!upstreamAbortHandler) return;
		upstreamAbortSignal?.removeEventListener("abort", upstreamAbortHandler);
		upstreamAbortHandler = void 0;
	};
	const ownedSessionIds = /* @__PURE__ */ new Set([sessionId]);
	const recordActivity = () => {
		lastActivityAtMs = Date.now();
	};
	const setResult = (next) => {
		result = next;
		recordActivity();
	};
	const clearState = (afterClearBarrier, followupAdmissionBarrierTimeout) => {
		if (stateCleared) return;
		stateCleared = true;
		terminalSettleTimer.clear();
		finalizationLease.clear();
		expireReplyOperationByOperation.delete(operation);
		evictReplyOperationByOperation.delete(operation);
		detachUpstreamAbort();
		const registeredBarrier = afterClearBarrier ? registerFollowupAdmissionBarrier(currentSessionKey, currentSessionId, afterClearBarrier, followupAdmissionBarrierTimeout) : pendingClearBarrier;
		pendingClearBarrier = void 0;
		updateFollowupAdmissionSessionId(currentSessionKey, currentSessionId);
		startReplyOperationSuccessorBarriers(operation);
		markReplyRunDiagnosticProgress({
			sessionKey: currentSessionKey,
			sessionId: currentSessionId,
			reason: "reply_operation:ended"
		});
		clearReplyRunState({
			sessionKey: currentSessionKey,
			sessionId: currentSessionId,
			operation
		});
		if (!registeredBarrier) {
			flushReplyOperationAfterClear(operation, currentSessionId);
			return;
		}
		registeredBarrier.settled.then(() => flushReplyOperationAfterClear(operation, registeredBarrier.sessionId));
		clearBarrierSettlement = registeredBarrier.settled;
	};
	const abortInternally = (reason) => {
		if (!controller.signal.aborted) controller.abort(reason);
	};
	const scheduleTerminalSettle = () => {
		if (stateCleared) return;
		terminalSettleTimer.scheduleOnce(REPLY_RUN_TERMINAL_SETTLE_TIMEOUT_MS);
	};
	const abortOperation = (reason, abortReason, abortedCode) => {
		const phaseBeforeAbort = phase;
		if (!result) {
			setResult({
				kind: "aborted",
				code: abortedCode
			});
			detachUpstreamAbort();
		}
		phase = "aborted";
		abortInternally(abortReason);
		try {
			getAttachedBackend(operation)?.cancel(reason);
		} finally {
			if (isReplyOperationPreBackendPhase(phaseBeforeAbort) && !retainStateUntilCompleteOperations.has(operation)) clearState();
			else scheduleTerminalSettle();
		}
	};
	const operation = {
		get key() {
			return currentSessionKey;
		},
		get sessionId() {
			return currentSessionId;
		},
		turnKind: params.turnKind ?? "visible",
		lifecycleGeneration,
		get routeThreadId() {
			return params.routeThreadId;
		},
		get originatingLeafEntryId() {
			return params.originatingLeafEntryId;
		},
		get abortSignal() {
			return controller.signal;
		},
		get resetTriggered() {
			return params.resetTriggered;
		},
		get terminalRecovery() {
			return terminalRecovery;
		},
		get acceptedSteeredInboundAudio() {
			return acceptedSteeredInboundAudio;
		},
		get toolAuthorityFingerprint() {
			return toolAuthorityFingerprint;
		},
		get toolAuthorityRoute() {
			return toolAuthorityRoute;
		},
		get phase() {
			return phase;
		},
		get result() {
			return result;
		},
		get staleExpiryReason() {
			return staleExpiryReason;
		},
		get startedAtMs() {
			return startedAtMs;
		},
		get lastActivityAtMs() {
			return lastActivityAtMs;
		},
		hasOwnedSessionId(candidateSessionId) {
			const normalizedSessionId = normalizeOptionalString(candidateSessionId);
			return normalizedSessionId ? ownedSessionIds.has(normalizedSessionId) : false;
		},
		recordActivity() {
			finalizationLease.recordActivity();
		},
		setPhase(next) {
			if (result) return;
			recordActivity();
			phase = next;
		},
		markWaitingForDeferredMaintenance() {
			if (result || phase !== "queued") return;
			phase = "waiting_for_deferred_maintenance";
			markReplyRunDiagnosticProgress({
				sessionKey: currentSessionKey,
				sessionId: currentSessionId,
				reason: "deferred_maintenance:waiting"
			});
		},
		markDeferredMaintenanceWaitEnded() {
			if (result || phase !== "waiting_for_deferred_maintenance") return;
			phase = "queued";
			markReplyRunDiagnosticProgress({
				sessionKey: currentSessionKey,
				sessionId: currentSessionId,
				reason: "deferred_maintenance:wait_ended"
			});
		},
		markWaitingForGlobalLane() {
			if (result || phase !== "queued" && phase !== "running") return;
			phaseBeforeGlobalLaneWait = phase;
			phase = "waiting_for_global_lane";
			markReplyRunDiagnosticProgress({
				sessionKey: currentSessionKey,
				sessionId: currentSessionId,
				reason: "global_lane:waiting"
			});
		},
		markGlobalLaneWaitEnded() {
			if (result || phase !== "waiting_for_global_lane") return;
			phase = phaseBeforeGlobalLaneWait ?? "queued";
			phaseBeforeGlobalLaneWait = void 0;
			markReplyRunDiagnosticProgress({
				sessionKey: currentSessionKey,
				sessionId: currentSessionId,
				reason: "global_lane:wait_ended"
			});
		},
		markTerminalRecovery() {
			terminalRecovery = true;
		},
		markAcceptedSteeredInboundAudio() {
			acceptedSteeredInboundAudio = true;
		},
		bindToolAuthorityFingerprint(fingerprint) {
			const normalized = normalizeOptionalString(fingerprint);
			if (!normalized) throw new Error("Reply operation tool authority fingerprint is required");
			if (toolAuthorityFingerprint && toolAuthorityFingerprint !== normalized) throw new Error("Reply operation cannot change tool authority after admission");
			toolAuthorityFingerprint = normalized;
		},
		bindToolAuthorityProjector(projector) {
			if (toolAuthorityProjector && toolAuthorityProjector !== projector) throw new Error("Reply operation cannot change tool authority projector after admission");
			toolAuthorityProjector = projector;
		},
		projectToolAuthorityFingerprint(overlay) {
			if (result || !toolAuthorityProjector || !toolAuthorityRoute) return;
			try {
				return normalizeOptionalString(toolAuthorityProjector(overlay, toolAuthorityRoute));
			} catch {
				return;
			}
		},
		bindToolAuthorityRoute(route) {
			const provider = normalizeOptionalString(route.provider);
			const model = normalizeOptionalString(route.model);
			if (!provider || !model) throw new Error("Reply operation tool authority route is required");
			toolAuthorityRoute = {
				provider,
				model
			};
		},
		updateSessionId(nextSessionId) {
			if (result) return;
			const normalizedNextSessionId = normalizeOptionalString(nextSessionId);
			if (!normalizedNextSessionId || normalizedNextSessionId === currentSessionId) return;
			recordActivity();
			if (replyRunState.activeKeysBySessionId.has(normalizedNextSessionId) && replyRunState.activeKeysBySessionId.get(normalizedNextSessionId) !== currentSessionKey) throw new Error(`Cannot rebind reply operation ${currentSessionKey} to active session ${normalizedNextSessionId}`);
			replyRunState.activeKeysBySessionId.delete(currentSessionId);
			registerWaitSessionId(currentSessionKey, currentSessionId);
			currentSessionId = normalizedNextSessionId;
			ownedSessionIds.add(currentSessionId);
			updateFollowupAdmissionSessionId(currentSessionKey, currentSessionId);
			updateSuccessorAdmissionSessionId(operation, currentSessionId);
			replyRunState.activeSessionIdsByKey.set(currentSessionKey, currentSessionId);
			replyRunState.activeKeysBySessionId.set(currentSessionId, currentSessionKey);
			registerWaitSessionId(currentSessionKey, currentSessionId);
			markReplyRunDiagnosticProgress({
				sessionKey: currentSessionKey,
				sessionId: currentSessionId,
				reason: "reply_operation:session_updated"
			});
		},
		updateSessionKey(nextSessionKey) {
			const normalizedNextKey = normalizeOptionalString(nextSessionKey);
			if (!normalizedNextKey) throw new Error("Reply operations require a canonical sessionKey");
			if (normalizedNextKey === currentSessionKey) return;
			if (result || stateCleared || phase !== "queued") throw new Error(`Cannot rekey reply operation ${currentSessionKey} in phase ${phase}`);
			if (replyRunState.activeRunsByKey.has(normalizedNextKey)) throw new ReplyRunAlreadyActiveError(normalizedNextKey);
			if (replyRunState.successorAdmissionBarriersByKey.has(normalizedNextKey)) throw new ReplyRunSuccessorAdmissionBlockedError(normalizedNextKey);
			recordActivity();
			const previousKey = currentSessionKey;
			replyRunState.activeRunsByKey.delete(previousKey);
			replyRunState.activeSessionIdsByKey.delete(previousKey);
			currentSessionKey = normalizedNextKey;
			replyRunState.activeRunsByKey.set(currentSessionKey, operation);
			replyRunState.activeSessionIdsByKey.set(currentSessionKey, currentSessionId);
			replyRunState.activeKeysBySessionId.set(currentSessionId, currentSessionKey);
			for (const ownedSessionId of ownedSessionIds) if (replyRunState.waitKeysBySessionId.get(ownedSessionId) === previousKey) replyRunState.waitKeysBySessionId.set(ownedSessionId, currentSessionKey);
			notifyReplyRunEnded(previousKey);
			markReplyRunDiagnosticProgress({
				sessionKey: currentSessionKey,
				sessionId: currentSessionId,
				reason: "reply_operation:session_key_adopted"
			});
		},
		attachBackend(handle) {
			if (result) {
				handle.cancel(result.kind === "aborted" ? result.code === "aborted_for_restart" ? "restart" : result.code === "aborted_for_supersession" ? "superseded" : "user_abort" : "superseded");
				return;
			}
			recordActivity();
			const backendToolAuthorityFingerprint = normalizeOptionalString(handle.toolAuthorityFingerprint);
			if (backendToolAuthorityFingerprint) toolAuthorityFingerprint = backendToolAuthorityFingerprint;
			attachedBackendByOperation.set(operation, handle);
			if (controller.signal.aborted) handle.cancel("superseded");
		},
		detachBackend(handle) {
			if (getAttachedBackend(operation) === handle) attachedBackendByOperation.delete(operation);
		},
		freezeAbort() {
			abortFrozenOperations.add(operation);
			detachUpstreamAbort();
			finalizationLease.begin();
		},
		retainFailureUntilComplete() {
			retainFailureUntilComplete = true;
		},
		ownerSettlement: ownerSettlement.promise,
		complete() {
			if (!result) {
				setResult({ kind: "completed" });
				phase = "completed";
			}
			clearState();
			settleOwner();
		},
		completeThen(afterClear) {
			runAfterReplyOperationClear(operation, afterClear);
			operation.complete();
		},
		completeWithAfterClearBarrier(barrier, timeoutMs) {
			if (!result) {
				setResult({ kind: "completed" });
				phase = "completed";
			}
			const wasAlreadyCleared = stateCleared;
			const ownerCompletionSettlement = pendingClearBarrier ? waitForReplyBarrierSettlement(barrier, timeoutMs) : void 0;
			clearState(barrier, timeoutMs);
			const completionSettlement = wasAlreadyCleared ? waitForReplyBarrierSettlement(barrier, timeoutMs) : ownerCompletionSettlement ?? clearBarrierSettlement;
			if (completionSettlement) completionSettlement.then(settleOwner);
			else settleOwner();
		},
		fail(code, cause) {
			abortFrozenOperations.add(operation);
			detachUpstreamAbort();
			finalizationLease.clear();
			if (!result) {
				setResult({
					kind: "failed",
					code,
					cause
				});
				phase = "failed";
			}
			if (!retainFailureUntilComplete && !retainStateUntilCompleteOperations.has(operation)) clearState();
			else scheduleTerminalSettle();
		},
		abortByUser() {
			if (!isReplyOperationAbortable(operation)) return false;
			abortOperation("user_abort", createUserAbortError(), "aborted_by_user");
			return true;
		},
		abortForRestart() {
			if (!isReplyOperationAbortable(operation)) return false;
			abortOperation("restart", createAgentRunRestartAbortError(), "aborted_for_restart");
			return true;
		},
		supersede(beforeSupersede) {
			const abortFrozen = abortFrozenOperations.has(operation);
			if (result || stateCleared || !abortFrozen && !isReplyOperationAbortable(operation)) return false;
			beforeSupersede?.();
			if (abortFrozen) {
				setResult({
					kind: "aborted",
					code: "aborted_for_supersession"
				});
				phase = "aborted";
				scheduleTerminalSettle();
				return true;
			}
			abortOperation("superseded", createAgentRunSupersededAbortError(), "aborted_for_supersession");
			return true;
		}
	};
	expireReplyOperationByOperation.set(operation, (reason, options) => {
		if (replyRunState.activeRunsByKey.get(currentSessionKey) !== operation) return false;
		if (!result) {
			abortFrozenOperations.add(operation);
			detachUpstreamAbort();
			staleExpiryReason = reason;
			setResult({
				kind: "failed",
				code: "run_stalled"
			});
			phase = "failed";
		}
		const logStaleTakeoverRelease = () => {
			diagnosticLogger.warn(`reply run stale takeover: forced release sessionKey=${currentSessionKey} reason=${reason} phase=${phase} result=${formatReplyOperationResult(result)} ageMs=${Date.now() - lastActivityAtMs} ranForMs=${Date.now() - startedAtMs}`);
		};
		if (options?.afterClearBarrier) pendingClearBarrier = registerFollowupAdmissionBarrier(currentSessionKey, currentSessionId, options.afterClearBarrier, options.followupAdmissionBarrierTimeout);
		const backend = getAttachedBackend(operation);
		let cancelFailed = false;
		try {
			backend?.cancel("superseded");
		} catch (error) {
			cancelFailed = true;
			diagnosticLogger.warn(`reply run stale takeover cancel failed: sessionKey=${currentSessionKey} reason=${reason} owner=${stateCleared ? "completed" : "retained"} error=${String(error)}`);
		}
		abortInternally(createAbortError("Reply operation expired as stale"));
		if (stateCleared) {
			logStaleTakeoverRelease();
			return true;
		}
		if (!cancelFailed) diagnosticLogger.warn(`reply run stale takeover retained: sessionKey=${currentSessionKey} reason=${reason} owner=awaiting_terminal_completion backend=${backend ? "attached" : "pending"}`);
		scheduleTerminalSettle();
		return false;
	});
	const finalizationLease = createReplyRunFinalizationLease({
		owner: operation,
		canExpire: () => !stateCleared && !result && replyRunState.activeRunsByKey.get(currentSessionKey) === operation,
		onActivity: recordActivity,
		onFinalizationProgress: () => markReplyRunDiagnosticProgress({
			sessionKey: currentSessionKey,
			sessionId: currentSessionId,
			reason: "reply_operation:finalizing_progress"
		}),
		onExpire: () => {
			diagnosticLogger.warn(`reply run finalization settle: forced release sessionKey=${currentSessionKey} phase=${phase} result=${formatReplyOperationResult(result)} ageMs=${Date.now() - lastActivityAtMs} ranForMs=${Date.now() - startedAtMs}`);
			if (expireReplyOperationByOperation.get(operation)?.("finalization_stalled") === false && replyRunState.activeRunsByKey.get(currentSessionKey) === operation) forceClearReplyOperation(operation);
		}
	});
	const terminalSettleTimer = createReplyRunSettleTimer({
		canExpire: () => replyRunState.activeRunsByKey.get(currentSessionKey) === operation,
		onExpire: () => {
			diagnosticLogger.warn(`reply run terminal settle: forced release sessionKey=${currentSessionKey} phase=${phase} result=${formatReplyOperationResult(result)} ageMs=${Date.now() - lastActivityAtMs} ranForMs=${Date.now() - startedAtMs}`);
			clearState();
		}
	});
	evictReplyOperationByOperation.set(operation, () => {
		if (stateCleared) return;
		if (!result) {
			setResult({
				kind: "aborted",
				code: "aborted_for_restart"
			});
			phase = "aborted";
		}
		abortInternally(createAgentRunRestartAbortError());
		let cancelError;
		let cancelFailed = false;
		try {
			getAttachedBackend(operation)?.cancel("restart");
		} catch (error) {
			cancelFailed = true;
			cancelError = error;
			diagnosticLogger.warn(`reply run lifecycle eviction cancel failed: sessionKey=${currentSessionKey} error=${String(error)}`);
		} finally {
			clearState();
		}
		if (cancelFailed) throw cancelError;
	});
	replyRunState.activeRunsByKey.set(sessionKey, operation);
	replyRunState.activeSessionIdsByKey.set(sessionKey, currentSessionId);
	replyRunState.activeKeysBySessionId.set(currentSessionId, sessionKey);
	registerWaitSessionId(sessionKey, currentSessionId);
	markReplyRunDiagnosticProgress({
		sessionKey,
		sessionId: currentSessionId,
		reason: "reply_operation:queued"
	});
	if (upstreamAbortSignal) {
		operationsByUpstreamAbortSignal.set(upstreamAbortSignal, operation);
		const abortFromUpstream = () => {
			if (result) return;
			const restart = isAgentRunRestartAbortReason(upstreamAbortSignal.reason);
			const superseded = isAgentRunSupersededAbortReason(upstreamAbortSignal.reason);
			abortOperation(restart ? "restart" : superseded ? "superseded" : "user_abort", upstreamAbortSignal.reason, restart ? "aborted_for_restart" : superseded ? "aborted_for_supersession" : "aborted_by_user");
		};
		if (upstreamAbortSignal.aborted) abortFromUpstream();
		else {
			upstreamAbortHandler = abortFromUpstream;
			upstreamAbortSignal.addEventListener("abort", upstreamAbortHandler, { once: true });
		}
	}
	return operation;
}
function expireStaleReplyOperation(operation, reason, options) {
	return expireReplyOperationByOperation.get(operation)?.(reason, options) ?? false;
}
function forceClearReplyOperation(operation, cause) {
	if (replyRunState.activeRunsByKey.get(operation.key) !== operation) return false;
	operation.fail("run_failed", cause);
	operation.complete();
	return true;
}
//#endregion
//#region src/auto-reply/reply/reply-run-registry.registry.ts
async function waitForReplyOperationOwnerSettlement(operation, timeoutMs) {
	const settlement = operation.ownerSettlement;
	if (!settlement) return true;
	const resolvedTimeoutMs = resolveTimerTimeoutMs(timeoutMs, 100, 100);
	let timer;
	const settled = await Promise.race([settlement.then(() => true), new Promise((resolve) => {
		timer = setTimeout(() => resolve(false), resolvedTimeoutMs);
		timer.unref?.();
	})]);
	if (timer) clearTimeout(timer);
	return settled;
}
function expireStaleReplyRunBySessionId(sessionId, reason, options) {
	const operation = resolveReplyRunForCurrentSessionId(sessionId);
	return operation ? expireStaleReplyOperation(operation, reason, options) : false;
}
function markReplyOperationGlobalLaneWaitProgress(operation) {
	if (operation.result || operation.phase !== "waiting_for_global_lane") return;
	markReplyRunDiagnosticProgress({
		sessionKey: operation.key,
		sessionId: operation.sessionId,
		reason: "global_lane:waiting"
	});
}
function isReplyRunEvidenceStaleBySessionId(sessionId) {
	const operation = resolveReplyRunForCurrentSessionId(sessionId);
	return operation ? isReplyRunEvidenceStale(operation) : false;
}
const replyRunRegistry = {
	begin(params) {
		return createReplyOperation(params);
	},
	get(sessionKey) {
		const normalizedSessionKey = normalizeOptionalString(sessionKey);
		if (!normalizedSessionKey) return;
		return replyRunState.activeRunsByKey.get(normalizedSessionKey);
	},
	isActive(sessionKey) {
		const normalizedSessionKey = normalizeOptionalString(sessionKey);
		if (!normalizedSessionKey) return false;
		return replyRunState.activeRunsByKey.has(normalizedSessionKey);
	},
	resolveCurrentMessageInjectionTarget(sessionKey) {
		const operation = this.get(sessionKey);
		const resolved = resolveReplyMessageInjectionRejection({ operation });
		if (!operation || !("injection" in resolved)) return;
		return {
			[replyMessageInjectionTargetOperation]: operation,
			...resolved.backend.runId ? { runId: resolved.backend.runId } : {}
		};
	},
	resolveCurrentInterruptTarget(sessionKey) {
		const operation = this.get(sessionKey);
		return operation ? { [replyRunInterruptTargetOperation]: operation } : void 0;
	},
	abort(sessionKey) {
		const operation = this.get(sessionKey);
		if (!operation) return false;
		return operation.abortByUser();
	},
	waitForIdle(sessionKey, timeoutMs, opts) {
		const normalizedSessionKey = normalizeOptionalString(sessionKey);
		if (!normalizedSessionKey || !replyRunState.activeRunsByKey.has(normalizedSessionKey)) return Promise.resolve(true);
		if (opts?.signal?.aborted) return Promise.resolve(false);
		return new Promise((resolve) => {
			const waiters = replyRunState.waitersByKey.get(normalizedSessionKey) ?? /* @__PURE__ */ new Set();
			let abortHandler;
			let settled = false;
			const waiter = { finish: (ended) => {
				if (settled) return;
				settled = true;
				waiters.delete(waiter);
				if (waiters.size === 0) replyRunState.waitersByKey.delete(normalizedSessionKey);
				if (waiter.timer) clearTimeout(waiter.timer);
				if (abortHandler) opts?.signal?.removeEventListener("abort", abortHandler);
				resolve(ended);
			} };
			if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs)) waiter.timer = setTimeout(() => waiter.finish(false), resolveTimerTimeoutMs(timeoutMs, 100, 100));
			if (opts?.signal) {
				abortHandler = () => waiter.finish(false);
				opts.signal.addEventListener("abort", abortHandler, { once: true });
			}
			waiters.add(waiter);
			replyRunState.waitersByKey.set(normalizedSessionKey, waiters);
			if (!replyRunState.activeRunsByKey.has(normalizedSessionKey)) waiter.finish(true);
		});
	},
	resolveSessionId(sessionKey) {
		const normalizedSessionKey = normalizeOptionalString(sessionKey);
		if (!normalizedSessionKey) return;
		return replyRunState.activeSessionIdsByKey.get(normalizedSessionKey);
	}
};
/** Abort and await only the captured operation; a same-key successor is never rediscovered. */
async function interruptReplyRunTarget(target, timeoutMs = REPLY_RUN_IDLE_SETTLE_TIMEOUT_MS) {
	const operation = target[replyRunInterruptTargetOperation];
	return {
		aborted: operation.abortByUser(),
		settled: await waitForReplyOperationOwnerSettlement(operation, timeoutMs)
	};
}
function resolveActiveReplyRunSessionId(sessionKey) {
	return replyRunRegistry.resolveSessionId(sessionKey);
}
/** Cancels the current reply backend only when its native run identity matches exactly. */
function supersedeReplyRunByRunId(runId, beforeCancel) {
	const expectedRunId = normalizeOptionalString(runId);
	if (!expectedRunId) return false;
	for (const operation of replyRunState.activeRunsByKey.values()) {
		const backend = getAttachedBackend(operation);
		if (normalizeOptionalString(backend?.runId) !== expectedRunId) continue;
		return operation.supersede(beforeCancel);
	}
	return false;
}
function resolveActiveReplyRunThreadId(sessionKey) {
	return replyRunRegistry.get(sessionKey)?.routeThreadId;
}
function isReplyRunActiveForSessionId(sessionId) {
	return resolveReplyRunForCurrentSessionId(sessionId) !== void 0;
}
function isReplyRunAbortableForCompaction(sessionId) {
	const operation = resolveReplyRunForCurrentSessionId(sessionId);
	return Boolean(operation && !isReplyOperationPreBackendPhase(operation.phase));
}
function abortReplyRunBySessionId(sessionId) {
	const operation = resolveReplyRunForCurrentSessionId(sessionId);
	if (!operation) return false;
	return operation.abortByUser();
}
function resolveActiveReplyOperationForSessionId(sessionId) {
	return resolveReplyRunForCurrentSessionId(sessionId);
}
function forceClearReplyRunBySessionId(sessionId, cause) {
	const operation = resolveReplyRunForCurrentSessionId(sessionId);
	return operation ? forceClearReplyOperation(operation, cause) : false;
}
function clearReplyRunForResetBySessionId(sessionId) {
	const operation = resolveReplyRunForCurrentSessionId(sessionId);
	if (!operation || isReplyOperationPreBackendPhase(operation.phase)) return;
	try {
		operation.abortForRestart();
	} finally {
		if (replyRunState.activeRunsByKey.get(operation.key) === operation) operation.complete();
	}
}
function waitForReplyRunEndBySessionId(sessionId, timeoutMs) {
	const waitKey = resolveReplyRunWaitKey(sessionId);
	if (!waitKey) return Promise.resolve(true);
	return replyRunRegistry.waitForIdle(waitKey, timeoutMs);
}
async function waitForReplyRunAdmissionBarrier(params) {
	const deadline = typeof params.timeoutMs === "number" ? Date.now() + resolveTimerTimeoutMs(params.timeoutMs, params.minimumTimeoutMs, params.minimumTimeoutMs) : void 0;
	let sessionId;
	while (true) {
		if (params.signal?.aborted) return { settled: false };
		const barrier = params.barriersByKey.get(params.sessionKey);
		if (!barrier) return {
			settled: true,
			sessionId
		};
		const remainingMs = deadline === void 0 ? void 0 : deadline - Date.now();
		if (remainingMs !== void 0 && remainingMs <= 0) return { settled: false };
		let timer;
		let abortHandler;
		const outcome = await Promise.race([
			barrier.settled.then(() => true),
			...remainingMs !== void 0 ? [new Promise((resolve) => {
				timer = setTimeout(() => resolve(false), Math.max(1, remainingMs));
				timer.unref?.();
			})] : [],
			...params.signal ? [new Promise((resolve) => {
				abortHandler = () => resolve(false);
				params.signal?.addEventListener("abort", abortHandler, { once: true });
				if (params.signal?.aborted) abortHandler();
			})] : []
		]);
		if (timer) clearTimeout(timer);
		if (abortHandler) params.signal?.removeEventListener("abort", abortHandler);
		if (!outcome) return { settled: false };
		sessionId = barrier.sessionId;
	}
}
async function waitForReplyRunFollowupAdmission(sessionKey, timeoutMs, opts) {
	const normalizedSessionKey = normalizeOptionalString(sessionKey);
	return normalizedSessionKey ? await waitForReplyRunAdmissionBarrier({
		barriersByKey: replyRunState.followupAdmissionBarriersByKey,
		minimumTimeoutMs: 100,
		sessionKey: normalizedSessionKey,
		signal: opts?.signal,
		timeoutMs
	}) : { settled: true };
}
async function waitForReplyRunSuccessorAdmission(sessionKey, timeoutMs, opts) {
	const normalizedSessionKey = normalizeOptionalString(sessionKey);
	return normalizedSessionKey ? await waitForReplyRunAdmissionBarrier({
		barriersByKey: replyRunState.successorAdmissionBarriersByKey,
		minimumTimeoutMs: 0,
		sessionKey: normalizedSessionKey,
		signal: opts?.signal,
		timeoutMs
	}) : { settled: true };
}
function abortActiveReplyRuns(opts) {
	let aborted = false;
	for (const operation of replyRunState.activeRunsByKey.values()) {
		if (opts.mode === "compacting" && !isReplyRunCompacting(operation)) continue;
		try {
			if (operation.abortForRestart()) aborted = true;
		} catch (error) {
			if (operation.result?.kind === "aborted" && operation.result.code === "aborted_for_restart") aborted = true;
			opts.onAbortError?.(operation.sessionId, error);
		}
	}
	return aborted;
}
function getActiveReplyRunCount() {
	return replyRunState.activeRunsByKey.size;
}
function listActiveReplyRunSessionIds() {
	return [...replyRunState.activeSessionIdsByKey.values()];
}
function listActiveReplyRunSessionKeys() {
	return [...replyRunState.activeSessionIdsByKey.keys()];
}
function evictPriorLifecycleReplyRuns() {
	const errors = [];
	for (const operation of replyRunState.activeRunsByKey.values()) {
		if (operation.lifecycleGeneration && isAgentEventLifecycleGenerationCurrent(operation.lifecycleGeneration)) continue;
		const evict = evictReplyOperationByOperation.get(operation);
		if (evict) {
			try {
				evict();
			} catch (error) {
				errors.push(error);
				try {
					clearReplyRunState({
						sessionKey: operation.key,
						sessionId: operation.sessionId,
						operation
					});
				} catch (clearError) {
					errors.push(clearError);
				}
			}
			continue;
		}
		try {
			if (!operation.abortForRestart()) errors.push(/* @__PURE__ */ new Error(`Stale reply operation was not abortable: ${operation.key}`));
		} catch (error) {
			errors.push(error);
		}
		try {
			operation.complete();
		} catch (error) {
			errors.push(error);
		}
		try {
			clearReplyRunState({
				sessionKey: operation.key,
				sessionId: operation.sessionId,
				operation
			});
		} catch (error) {
			errors.push(error);
		}
	}
	if (errors.length > 0) throw new AggregateError(errors, "Failed to abort stale reply runs");
}
registerAgentEventLifecycleRotationHandler("reply-runs", evictPriorLifecycleReplyRuns);
const replyRunRegistryTestApi = { resetReplyRunRegistry() {
	for (const [sessionKey, sessionId] of replyRunState.activeSessionIdsByKey) markReplyRunDiagnosticProgress({
		sessionKey,
		sessionId,
		reason: "reply_operation:registry_reset"
	});
	replyRunState.activeRunsByKey.clear();
	replyRunState.activeSessionIdsByKey.clear();
	replyRunState.activeKeysBySessionId.clear();
	replyRunState.waitKeysBySessionId.clear();
	resetReplyRunSettleTimersForTesting();
	for (const waiters of replyRunState.waitersByKey.values()) for (const waiter of waiters) waiter.finish(false);
	replyRunState.waitersByKey.clear();
	replyRunState.followupAdmissionBarriersByKey.clear();
	replyRunState.successorAdmissionBarriersByKey.clear();
} };
if (process.env.VITEST === "true" || false) globalThis[Symbol.for("openclaw.replyRunRegistryTestApi")] = replyRunRegistryTestApi;
//#endregion
export { hasReplyOperationExecutionStarted as A, waitForReplyBarrierSettlement as B, createReplyOperation as C, finalizeReplyMessageInjectionAttempt as D, beginReplyMessageInjectionTarget as E, markReplyOperationExecutionStarted as F, ReplyRunSuccessorAdmissionBlockedError as G, REPLY_RUN_TERMINAL_SETTLE_TIMEOUT_MS as H, registerReplyOperationSuccessorBarrier as I, resolveActiveReplyRunOwnerForSignal as L, isReplyRunEvidenceStale as M, isReplyRunRecoveryBlocked as N, resolveReplyBackendQueueMessageMismatch as O, isReplyRunSuccessorAdmissionBlocked as P, retainReplyOperationUntilComplete as R, waitForReplyRunSuccessorAdmission as S, forceClearReplyOperation as T, ReplyRunAlreadyActiveError as U, REPLY_RUN_IDLE_SETTLE_TIMEOUT_MS as V, ReplyRunFollowupAdmissionBlockedError as W, resolveActiveReplyRunThreadId as _, forceClearReplyRunBySessionId as a, waitForReplyRunEndBySessionId as b, isReplyRunAbortableForCompaction as c, listActiveReplyRunSessionIds as d, listActiveReplyRunSessionKeys as f, resolveActiveReplyRunSessionId as g, resolveActiveReplyOperationForSessionId as h, expireStaleReplyRunBySessionId as i, isReplyRunAbortableForSignal as j, getAttachedBackend as k, isReplyRunActiveForSessionId as l, replyRunRegistry as m, abortReplyRunBySessionId as n, getActiveReplyRunCount as o, markReplyOperationGlobalLaneWaitProgress as p, clearReplyRunForResetBySessionId as r, interruptReplyRunTarget as s, abortActiveReplyRuns as t, isReplyRunEvidenceStaleBySessionId as u, supersedeReplyRunByRunId as v, expireStaleReplyOperation as w, waitForReplyRunFollowupAdmission as x, waitForReplyOperationOwnerSettlement as y, runAfterReplyOperationClear as z };
