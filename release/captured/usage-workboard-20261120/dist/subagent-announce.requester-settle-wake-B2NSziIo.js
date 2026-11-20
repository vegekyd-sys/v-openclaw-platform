// subagent-settle-backlog-v1
// gpt-live-consult-continuation-v1: wake
import { resolveGptLiveConsultRequesterWake } from "./gpt-live-consult-continuation.js";
import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { n as getRuntimeConfig } from "./io.runtime-CKu7Rw0j.js";
import { n as SILENT_REPLY_TOKEN } from "./tokens-DbeAFqg7.js";
import { w as isCronSessionKey } from "./session-key-CRjxKW0X.js";
import "./config-Cv60gBux.js";
import { i as logWarn } from "./logger-dgyRJ-bX.js";
import { o as getSharedGatewayContextResolver } from "./gateway-request-scope-CmMd3nUp.js";
import { t as INTERNAL_MESSAGE_CHANNEL } from "./message-channel-constants-2zSoJXQC.js";
import { n as normalizeMessageChannel } from "./message-channel-core-D0_xUNNr.js";
import { c as normalizeDeliveryContext } from "./delivery-context.shared-DlcU69m_.js";
import { t as isDeliverableMessageChannel } from "./message-channel-normalize-DzpgR6ro.js";
import "./message-channel-BGKf9KPa.js";
import { c as getSubagentDepthFromSessionStore } from "./subagent-capabilities-CPAHEjL-.js";
import { g as listSubagentRunsForRequester, s as getLatestSubagentRunByChildSessionKey, u as hasDescendantRunAwaitingSettle } from "./subagent-registry-read-UaDFTyfW.js";
import { n as resolveSubagentRequesterAgentId } from "./subagent-requester-owner-D7K1yW_G.js";
import { n as hasSubagentRunEnded } from "./subagent-run-liveness-CrhVXF5Y.js";
import { a as dedupeLatestChildCompletionRows, n as buildChildCompletionFindings, o as filterCurrentDirectChildCompletionRows } from "./subagent-announce-output-CgCr3vGC.js";
import { n as buildAnnounceIdempotencyKey } from "./announce-idempotency-D7LnUTJR.js";
import { a as loadRequesterSessionEntry, r as resolveAnnounceOrigin, t as deliverSubagentAnnouncement } from "./subagent-announce-delivery-Dosep7Zr.js";
import { t as hasUsableSessionEntry } from "./subagent-announce-DM0I4BxK.js";
//#region src/agents/subagents/announce/subagent-announce.requester-settle-wake.ts
/**
* Durable top-level requester settle wake delivery.
*
* Lifecycle owns the persisted outbox state on retained subagent run rows;
* this module selects a drained wave and delivers its synthesized wake.
*/
const REQUESTER_SETTLE_WAKE_MAX_ATTEMPTS = 3;
const REQUESTER_SETTLE_WAKE_MAX_AMBIGUOUS_REPLAYS = 3;
const REQUESTER_SETTLE_WAKE_MAX_DEFERRALS = 10;
const REQUESTER_SETTLE_WAKE_ROUTE_NOTICE_MAX_CHARS = 1024;
const ROUTE_NOTICE_TRUNCATION = "\n[model-route changes truncated]";
const REQUESTER_SETTLE_WAKE_RETRY_DELAYS_MS = [3e4, 12e4];
const activeRequesterSettleWakeBatches = /* @__PURE__ */ new Set();
function buildRequesterSettleWakeMessage(params) {
	return [
		"[Subagent Context] Every subagent spawned from this session has now settled — none are still running or awaiting completion delivery.",
		"[Subagent Context] Do not keep waiting or call sessions_yield again for this batch; no further completion events will arrive.",
		"[Subagent Context] Review the completion results and send your consolidated final answer to the user now.",
		params.requireVisibleReply ? "[Subagent Context] Child completion delivery is internal; the original user request still requires your visible final answer." : `[Subagent Context] Reply ONLY: ${SILENT_REPLY_TOKEN} only if you already delivered the consolidated final answer for this batch.`,
		...params.modelRouteChange ? [params.modelRouteChange, params.preserveModelRouteNotice ? "[Subagent Context] Preserve this runtime-authored model-route change notice in your final answer." : "[Subagent Context] Keep this runtime-authored model-route change notice internal on this shared surface."] : [],
		"",
		params.findings ?? "(each child result was announced individually in earlier completion events)"
	].join("\n");
}
function buildConnectedSettledWave(candidates, settledEntry) {
	const targetIndex = candidates.findIndex((entry) => entry.runId === settledEntry.runId);
	const target = candidates[targetIndex];
	if (!target) return [];
	const sorted = candidates.map((entry, originalIndex) => ({
		entry,
		originalIndex,
		endedAt: typeof entry.execution.endedAt === "number" ? entry.execution.endedAt : Number.MAX_SAFE_INTEGER
	})).toSorted((a, b) => a.entry.createdAt - b.entry.createdAt || a.endedAt - b.endedAt || a.originalIndex - b.originalIndex);
	const first = sorted[0];
	if (!first) return [];
	let componentStart = 0;
	let componentEnd = first.endedAt;
	let containsTarget = first.originalIndex === targetIndex;
	for (let index = 1; index <= sorted.length; index += 1) {
		const next = sorted[index];
		if (!next || next.entry.createdAt > componentEnd) {
			if (containsTarget) return [target, ...sorted.slice(componentStart, index).filter((item) => item.originalIndex !== targetIndex).toSorted((a, b) => a.originalIndex - b.originalIndex).map((item) => item.entry)];
			if (!next) break;
			componentStart = index;
			componentEnd = next.endedAt;
			containsTarget = next.originalIndex === targetIndex;
			continue;
		}
		componentEnd = Math.max(componentEnd, next.endedAt);
		containsTarget ||= next.originalIndex === targetIndex;
	}
	return [];
}
function readSharedBatchState(batch) {
	const states = batch.map((entry) => entry.requesterSettleWake).filter((state) => Boolean(state));
	const source = states.find((state) => state.status === "dispatching") ?? states[0];
	return {
		status: source?.status ?? "pending",
		attemptCount: Math.max(0, ...states.map((state) => state.attemptCount)),
		...source?.replayCount !== void 0 ? { replayCount: source.replayCount } : {},
		...source?.nextAttemptAt !== void 0 ? { nextAttemptAt: source.nextAttemptAt } : {},
		...source?.batchRunIds ? { batchRunIds: [...source.batchRunIds] } : {},
		...states.some((state) => state.requesterYieldBatch === true) ? { requesterYieldBatch: true } : {},
		...states.some((state) => state.afterRequesterYield === true) ? { afterRequesterYield: true } : {},
		...source?.rearmGeneration !== void 0 ? { rearmGeneration: source.rearmGeneration } : {},
		...source?.lastError !== void 0 ? { lastError: source.lastError } : {},
		deferralCount: Math.max(0, ...states.map((state) => state.deferralCount ?? 0))
	};
}
function deferRequesterSettleWakeBatch(params) {
	const deferralCount = (params.state.deferralCount ?? 0) + 1;
	if (deferralCount >= REQUESTER_SETTLE_WAKE_MAX_DEFERRALS) {
		completeRequesterSettleWakeBatch({
			runIds: params.batchRunIds,
			state: params.state,
			completeBatch: (runIds, rearmGeneration, delivery) => params.completeBatch(runIds, rearmGeneration, delivery),
			delivery: {
				delivered: false,
				path: "none",
				error: "requester settle wake deferred too many times"
			}
		});
		return;
	}
	params.transitionBatch(params.batchRunIds, {
		status: params.state.status,
		attemptCount: params.state.attemptCount,
		...params.state.replayCount !== void 0 ? { replayCount: params.state.replayCount } : {},
		nextAttemptAt: Math.max(params.state.nextAttemptAt ?? 0, Date.now() + REQUESTER_SETTLE_WAKE_RETRY_DELAYS_MS[0]),
		batchRunIds: [...params.batchRunIds],
		...params.state.requesterYieldBatch === true ? { requesterYieldBatch: true } : {},
		...params.state.afterRequesterYield === true ? { afterRequesterYield: true } : {},
		...params.state.rearmGeneration !== void 0 ? { rearmGeneration: params.state.rearmGeneration } : {},
		...params.state.lastError !== void 0 ? { lastError: params.state.lastError } : {},
		deferralCount
	});
}
function completeRequesterSettleWakeBatch(params) {
	if (params.state.rearmGeneration === void 0) {
		params.completeBatch(params.runIds, void 0, params.delivery);
		return;
	}
	params.completeBatch(params.runIds, params.state.rearmGeneration, params.delivery);
}
/**
* Wakes a registry-less top-level requester once its last spawned child
* reaches terminal settle. Durable state transitions happen synchronously
* through lifecycle-owned callbacks before and after every async delivery.
*/
async function maybeWakeRequesterAfterAllChildrenSettled(params) {
	if (params.signal?.aborted) return false;
	const completeBatch = (runIds, rearmGeneration, delivery) => {
		if (rearmGeneration === void 0) {
			params.completeBatch(runIds, void 0, delivery);
			return;
		}
		params.completeBatch(runIds, rearmGeneration, delivery);
	};
	const requesterSessionKey = params.requesterSessionKey.trim();
	const cfg = getRuntimeConfig();
	const requesterAgentId = resolveSubagentRequesterAgentId(cfg, params.settledEntry);
	const initialState = params.settledEntry.requesterSettleWake;
	if (!requesterSessionKey || !initialState) return false;
	const admittedRearmGeneration = initialState.rearmGeneration;
	if (isCronSessionKey(requesterSessionKey)) {
		completeRequesterSettleWakeBatch({
			runIds: [params.settledEntry.runId],
			state: initialState,
			completeBatch
		});
		return false;
	}
	const listedRuns = listSubagentRunsForRequester(requesterSessionKey, { requesterAgentId });
	const requesterRuns = Array.isArray(listedRuns) ? listedRuns : [];
	const currentSettledEntry = requesterRuns.find((entry) => entry.runId === params.settledEntry.runId) ?? params.settledEntry;
	const currentState = currentSettledEntry.requesterSettleWake;
	if (!currentState || currentState.rearmGeneration !== admittedRearmGeneration) return false;
	const requesterHasUnsettledDescendants = () => hasDescendantRunAwaitingSettle(requesterSessionKey, currentSettledEntry.runId, requesterAgentId);
	const frozenBatchRunIds = currentState.batchRunIds;
	const currentRearmGeneration = currentState.rearmGeneration;
	let settledBatch;
	if (frozenBatchRunIds && frozenBatchRunIds.length > 0) {
		const runsById = new Map(requesterRuns.map((entry) => [entry.runId, entry]));
		settledBatch = frozenBatchRunIds.map((runId) => runsById.get(runId)).filter((entry) => Boolean(entry?.requesterSettleWake) && entry?.requesterSettleWake?.rearmGeneration === currentRearmGeneration);
		if (settledBatch.some((entry) => entry.execution.status === "running" || !hasSubagentRunEnded(entry))) return false;
	} else settledBatch = buildConnectedSettledWave(requesterRuns.filter((entry) => entry.requesterSettleWake && entry.execution.status !== "running" && hasSubagentRunEnded(entry)), currentSettledEntry);
	if (settledBatch.length === 0) return false;
	const batchRunIds = settledBatch.map((entry) => entry.runId).toSorted();
	const selectedState = readSharedBatchState(settledBatch);
	const requiredSettled = settledBatch.filter((entry) => entry.expectsCompletionMessage === true);
	// A notification-free wave has no requester delivery to wait for. Settle it
	// before consulting unrelated live descendants, including after a restart.
	// Select the original connected/frozen wave first: mixed and yielded batches
	// keep their required children, generation and durable delivery ownership.
	if (requiredSettled.length === 0) {
		completeRequesterSettleWakeBatch({
			runIds: batchRunIds,
			state: selectedState,
			completeBatch
		});
		return false;
	}
	const hasUnsettledDescendants = requesterHasUnsettledDescendants();
	if (hasUnsettledDescendants) {
		if (frozenBatchRunIds && frozenBatchRunIds.length > 0) deferRequesterSettleWakeBatch({
			batchRunIds,
			state: selectedState,
			transitionBatch: params.transitionBatch,
			completeBatch
		});
		return false;
	}
	const hasUndeliveredRequiredCompletion = requiredSettled.some((entry) => entry.delivery?.status !== "delivered");
	const requesterYieldedAfterDelivery = selectedState.afterRequesterYield === true || selectedState.requesterYieldBatch === true && selectedState.rearmGeneration !== void 0;
	if (requiredSettled.length < 2 && !hasUndeliveredRequiredCompletion && !requesterYieldedAfterDelivery || getSubagentDepthFromSessionStore(requesterSessionKey, {
		cfg,
		agentId: requesterAgentId
	}) >= 1) {
		completeRequesterSettleWakeBatch({
			runIds: batchRunIds,
			state: selectedState,
			completeBatch
		});
		return false;
	}
	const { entry: requesterEntry } = loadRequesterSessionEntry(requesterSessionKey, requesterAgentId);
	if (!hasUsableSessionEntry(requesterEntry)) {
		completeRequesterSettleWakeBatch({
			runIds: batchRunIds,
			state: selectedState,
			completeBatch,
			delivery: {
				delivered: false,
				path: "none",
				error: "requester session unavailable"
			}
		});
		return false;
	}
	const completionRows = dedupeLatestChildCompletionRows(filterCurrentDirectChildCompletionRows(settledBatch, {
		requesterSessionKey,
		requesterAgentId,
		getLatestSubagentRunByChildSessionKey
	}));
	const findings = buildChildCompletionFindings(completionRows);
	const requesterSessionOrigin = normalizeDeliveryContext(params.requesterOrigin);
	const directOrigin = resolveAnnounceOrigin(requesterEntry, requesterSessionOrigin);
	const routeNotices = [...new Set(completionRows.flatMap(({ completion }) => {
		const reply = completion?.terminalReply;
		return reply?.disposition === "visible" && reply.modelRouteChange ? [reply.modelRouteChange] : [];
	}))].toSorted().join("\n");
	const modelRouteChange = routeNotices.length > REQUESTER_SETTLE_WAKE_ROUTE_NOTICE_MAX_CHARS ? `${truncateUtf16Safe(routeNotices, 992)}${ROUTE_NOTICE_TRUNCATION}` : routeNotices;
	const completionChannel = normalizeMessageChannel(directOrigin?.channel);
	const wakeMessage = buildRequesterSettleWakeMessage({
		findings,
		requireVisibleReply: requesterYieldedAfterDelivery,
		modelRouteChange,
		preserveModelRouteNotice: !completionChannel || !isDeliverableMessageChannel(completionChannel)
	});
	const wakeKeyBase = [`requester-settle:${requesterAgentId ?? "unknown"}:${requesterSessionKey}:${batchRunIds.join(",")}`, selectedState.rearmGeneration === void 0 ? void 0 : `yield-${selectedState.rearmGeneration}`].filter(Boolean).join(":");
	if (activeRequesterSettleWakeBatches.has(wakeKeyBase)) return false;
	activeRequesterSettleWakeBatches.add(wakeKeyBase);
	try {
		if (params.signal?.aborted) return false;
		let state = readSharedBatchState(settledBatch);
		if (!settledBatch.some((entry) => entry.requesterSettleWake)) return false;
		if ((state.nextAttemptAt ?? 0) > Date.now()) return false;
		if (requesterHasUnsettledDescendants()) {
			deferRequesterSettleWakeBatch({
				batchRunIds,
				state,
				transitionBatch: params.transitionBatch,
				completeBatch
			});
			return false;
		}
		let attemptIndex;
		if (state.status === "dispatching") attemptIndex = Math.max(0, state.attemptCount - 1);
		else {
			if (state.attemptCount >= REQUESTER_SETTLE_WAKE_MAX_ATTEMPTS) {
				completeRequesterSettleWakeBatch({
					runIds: batchRunIds,
					state,
					completeBatch,
					delivery: {
						delivered: false,
						path: "none",
						error: state.lastError ?? "requester settle wake attempts exhausted"
					}
				});
				return false;
			}
			attemptIndex = state.attemptCount;
			state = {
				status: "dispatching",
				attemptCount: state.attemptCount + 1,
				batchRunIds,
				...state.requesterYieldBatch === true ? { requesterYieldBatch: true } : {},
				...state.afterRequesterYield === true ? { afterRequesterYield: true } : {},
				...state.rearmGeneration !== void 0 ? { rearmGeneration: state.rearmGeneration } : {}
			};
			params.transitionBatch(batchRunIds, state);
		}
		const voiceContinuation = resolveGptLiveConsultRequesterWake({ requesterSessionKey, requesterAgentId, batchRunIds, rearmGeneration: state.rearmGeneration });
		let delivery;
		try {
			delivery = await deliverSubagentAnnouncement({
				voiceContinuation,
				requesterSessionKey,
				requesterAgentId,
				triggerMessage: wakeMessage,
				steerMessage: wakeMessage,
				summaryLine: "all spawned subagents settled",
				requesterSessionOrigin,
				requesterOrigin: requesterSessionOrigin,
				directOrigin,
				sourceSessionKey: currentSettledEntry.childSessionKey,
				sourceChannel: INTERNAL_MESSAGE_CHANNEL,
				sourceTool: "subagent_announce",
				targetRequesterSessionKey: requesterSessionKey,
				requesterIsSubagent: false,
				expectsCompletionMessage: false,
				requireDirectDelivery: true,
				...requesterYieldedAfterDelivery ? { requireVisibleReply: true } : {},
				directIdempotencyKey: buildAnnounceIdempotencyKey(attemptIndex === 0 ? wakeKeyBase : `${wakeKeyBase}:retry-${attemptIndex}`),
				signal: params.signal,
				resolveGatewayContext: getSharedGatewayContextResolver(settledBatch)
			});
		} catch (error) {
			const lastError = error instanceof Error ? error.message : String(error);
			const replayCount = (state.replayCount ?? 0) + 1;
			const retryDelayMs = REQUESTER_SETTLE_WAKE_RETRY_DELAYS_MS[replayCount - 1];
			if (replayCount >= REQUESTER_SETTLE_WAKE_MAX_AMBIGUOUS_REPLAYS || retryDelayMs === void 0) {
				completeRequesterSettleWakeBatch({
					runIds: batchRunIds,
					state,
					completeBatch,
					delivery: {
						delivered: false,
						path: "none",
						error: lastError
					}
				});
				return false;
			}
			const nextAttemptAt = Date.now() + retryDelayMs;
			state = {
				status: "dispatching",
				attemptCount: state.attemptCount,
				replayCount,
				nextAttemptAt,
				batchRunIds,
				...state.requesterYieldBatch === true ? { requesterYieldBatch: true } : {},
				...state.afterRequesterYield === true ? { afterRequesterYield: true } : {},
				...state.rearmGeneration !== void 0 ? { rearmGeneration: state.rearmGeneration } : {},
				lastError
			};
			params.transitionBatch(batchRunIds, state);
			logWarn(`requester settle wake transport replay ${replayCount} scheduled in ${Math.round(retryDelayMs / 1e3)}s: ${lastError}`);
			return false;
		}
		if (delivery.delivered) {
			completeRequesterSettleWakeBatch({
				runIds: batchRunIds,
				state,
				completeBatch,
				delivery
			});
			return true;
		}
		if (delivery.disposition === "ambiguous" || delivery.disposition === "permanent_failure" || delivery.disposition === "intentional_non_delivery" || delivery.reason === "requester_abandoned") {
			completeRequesterSettleWakeBatch({
				runIds: batchRunIds,
				state,
				completeBatch,
				delivery
			});
			return false;
		}
		const attemptCount = attemptIndex + 1;
		const retryDelayMs = REQUESTER_SETTLE_WAKE_RETRY_DELAYS_MS[attemptIndex];
		const lastError = delivery.error ?? delivery.reason ?? "undelivered";
		if (attemptCount >= REQUESTER_SETTLE_WAKE_MAX_ATTEMPTS || retryDelayMs === void 0) {
			completeRequesterSettleWakeBatch({
				runIds: batchRunIds,
				state,
				completeBatch,
				delivery: {
					...delivery,
					error: lastError
				}
			});
			return false;
		}
		const nextAttemptAt = Date.now() + retryDelayMs;
		params.transitionBatch(batchRunIds, {
			status: "pending",
			attemptCount,
			nextAttemptAt,
			batchRunIds,
			...state.requesterYieldBatch === true ? { requesterYieldBatch: true } : {},
			...state.afterRequesterYield === true ? { afterRequesterYield: true } : {},
			...state.rearmGeneration !== void 0 ? { rearmGeneration: state.rearmGeneration } : {},
			lastError
		});
		logWarn(`requester settle wake attempt ${attemptCount} failed; retrying in ${Math.round(retryDelayMs / 1e3)}s: ${lastError}`);
		return false;
	} finally {
		activeRequesterSettleWakeBatches.delete(wakeKeyBase);
	}
}
//#endregion
export { maybeWakeRequesterAfterAllChildrenSettled };
