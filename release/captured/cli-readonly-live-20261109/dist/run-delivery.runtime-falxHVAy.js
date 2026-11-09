// v-feishu-cron-continuation-progress-v1
import "./v-feishu-task-presentation-core-bridge.mjs";
import {deliverCronPresentation} from "./v-feishu-task-presentation-cron.mjs";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { t as createLazyImportLoader } from "./lazy-promise-DGqyc4Y4.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { Kt as resolveAdmittedCronCompletionStatus } from "./openclaw-state-db-Bh3Bq87y.js";
import { o as isSilentReplyText } from "./tokens-DbeAFqg7.js";
import { M as parseThreadSessionSuffix, O as parseAgentSessionKey, w as isCronSessionKey } from "./session-key-CRjxKW0X.js";
import { o as resolveSessionStorePathCore } from "./paths-DDTeIhCT.js";
import { i as copyReplyPayloadMetadata } from "./reply-payload-DahKk-7n.js";
import { f as stringifyRouteThreadId } from "./channel-route--2in3Ckg.js";
import { h as withSystemEventOwner } from "./system-events-GfU3KOHp.js";
import { o as isAudioFileName } from "./mime-BxTGWg2e.js";
import { f as loadSessionEntryReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { c as getSessionWorkAdmissionRelease, h as runExclusiveSessionLifecycleMutation, n as beginSessionWorkAdmission } from "./session-lifecycle-admission-siUq03Jk.js";
import "./session-accessor-K0XuW6ln.js";
import { i as OPENCLAW_TRANSCRIPT_ARTIFACT_PROVIDER, r as OPENCLAW_TRANSCRIPT_ARTIFACT_API, t as CRON_DIRECT_DELIVERY_CONTEXT_KIND } from "./transcript-only-openclaw-assistant-DPLRJnG4.js";
import { n as canonicalizeMainSessionAlias, r as resolveAgentMainSessionKey } from "./main-session-TZQkcBLs.js";
import { n as stripOutboundTargetKindPrefix, r as stripTargetProviderPrefix } from "./channel-target-prefix-CCF7M7EQ.js";
import { f as resolveSessionWorkStartError } from "./lifecycle-CKz-1QIz.js";
import { n as appendExactAssistantMessageToSessionTranscript } from "./transcript-DhHr8x2-.js";
import { t as resolveMirroredTranscriptText } from "./transcript-mirror-DxrLtJZQ.js";
import { o as hasReplyPayloadContent } from "./payload-DYE7bQ2k.js";
import { s as projectOutboundPayloadPlanForMirror, t as createOutboundPayloadPlan } from "./payloads-Ch7RD6Ym.js";
import { r as resolveControlUiSessionUrl } from "./control-ui-link-base-CUjuJWdQ.js";
import { i as normalizeCronRunErrorText } from "./execution-errors-CdfjHusX.js";
import "./inbound.runtime-BWVsMOI5.js";
import { t as createCronExecutionId } from "./run-id-kGde0n7U.js";
import { t as loadCronSessionEntryLatest } from "./session-D4AJhdUK.js";
import { c as resolveCronLifecycleRevisionIdentity, f as pickLastNonEmptyTextFromPayloads, p as pickSummaryFromOutput } from "./run-session-state-CZMoAMOg.js";
import { t as cleanupCronRunSessionAfterRun } from "./session-cleanup-C_Zwwuwo.js";
import { n as resolvedDeliveryTargetsExternalChannel, t as resolveDeliveryTarget } from "./delivery-target-JX6OFX49.js";
import { n as isLikelyInterimCronMessage } from "./subagent-followup-hints-CdPqyvGp.js";
import { a as logCronDeliveryError, c as maybeApplyTtsToCronPayloads, d as resolveCronDeliveryBestEffort, f as resolveCronDeliveryScheduledAtMs, g as waitForCompletedDirectCronDelivery, h as retryTransientDirectCronDelivery, i as isStaleCronDelivery, l as normalizeDeliveryTarget, m as resolveDescendantSubagentFollowup, n as buildDirectCronDeliveryIdempotencyKey, o as logCronDeliveryErrorDeferred, p as resolveCronDeliveryStartDelayMs, r as isCompletedDirectCronDelivery, s as logCronDeliveryWarn, t as DIRECT_CRON_DELIVERY_COMPLETION_RETENTION, u as normalizeSilentReplyText } from "./delivery-dispatch-policy-Dq5A24Be.js";
//#region src/sessions/background-session-result.ts
const AUTOMATION_RESULT_MODEL = "automation-result";
/** Serializes a background assistant result behind active work on its target conversation. */
async function commitBackgroundResultToSession(params) {
	const sessionKey = normalizeOptionalString(params.sessionKey);
	const text = normalizeOptionalString(params.text);
	const idempotencyKey = normalizeOptionalString(params.idempotencyKey);
	if (!sessionKey || !text || !idempotencyKey) return {
		ok: false,
		reason: "background session result is missing required data"
	};
	const storePath = resolveSessionStorePathCore(params.config.session?.store, { agentId: params.agentId });
	const expectedSessionId = normalizeOptionalString(params.expectedGeneration.sessionId);
	if (!expectedSessionId) return {
		ok: false,
		reason: "background session result has an invalid expected generation"
	};
	const expectedLifecycleRevision = normalizeOptionalString(params.expectedGeneration.lifecycleRevision);
	const identities = [sessionKey, expectedSessionId];
	return await runExclusiveSessionLifecycleMutation({
		scope: storePath,
		identities,
		signal: params.signal,
		prepare: async () => {
			await getSessionWorkAdmissionRelease({
				scope: storePath,
				identities
			});
		},
		run: async () => {
			const current = loadSessionEntryReadOnly({
				agentId: params.agentId,
				sessionKey,
				storePath,
				readConsistency: "latest"
			});
			if (current?.sessionId !== expectedSessionId || normalizeOptionalString(current.lifecycleRevision) !== expectedLifecycleRevision) return {
				ok: false,
				reason: `session rebound for sessionKey: ${sessionKey}`
			};
			const unavailable = resolveSessionWorkStartError(sessionKey, current, { expectedSessionId });
			if (unavailable) return {
				ok: false,
				reason: unavailable
			};
			const message = {
				role: "assistant",
				content: [{
					type: "text",
					text
				}],
				api: OPENCLAW_TRANSCRIPT_ARTIFACT_API,
				provider: OPENCLAW_TRANSCRIPT_ARTIFACT_PROVIDER,
				model: AUTOMATION_RESULT_MODEL,
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						total: 0
					}
				},
				stopReason: "stop",
				timestamp: Date.now(),
				openclawAutomation: params.provenance
			};
			const appended = await appendExactAssistantMessageToSessionTranscript({
				agentId: params.agentId,
				sessionKey,
				expectedSessionId,
				expectedLifecycleRevision: expectedLifecycleRevision ?? null,
				idempotencyKey,
				message,
				storePath,
				updateMode: "inline",
				config: params.config
			});
			return appended.ok ? {
				ok: true,
				messageId: appended.messageId
			} : {
				ok: false,
				reason: appended.reason
			};
		}
	});
}
//#endregion
//#region src/cron/isolated-agent/delivery-route-session-key.ts
/**
* Picks the session-key identity used to resolve a cron delivery's outbound route.
*
* An isolated run does not carry its bound source conversation's namespace.
* Reuse only a canonical conversation belonging to the same agent, actual
* delivery provider, and destination; otherwise jobs can adopt another peer's
* conversation or thread.
*/
function selectCronRouteCurrentSessionKey(job, agentSessionKey, deliveryProvider, deliveryTarget) {
	const bound = (job.sessionKey ?? "").trim();
	const parsedBound = parseAgentSessionKey(bound);
	const parsedRun = parseAgentSessionKey(agentSessionKey);
	if (!parsedBound || !parsedRun || parsedBound.agentId !== parsedRun.agentId) return agentSessionKey;
	const conversation = /^([^:]+):(direct|group|channel):([^:]+)(?::thread:[^:]+)?$/i.exec(parsedBound.rest);
	const targetPeerId = stripOutboundTargetKindPrefix(stripTargetProviderPrefix(deliveryTarget, deliveryProvider));
	if (conversation?.[1]?.toLowerCase() !== deliveryProvider.trim().toLowerCase() || conversation[3] !== targetPeerId) return agentSessionKey;
	return bound;
}
//#endregion
//#region src/cron/isolated-agent/delivery-dispatch-awareness.ts
/** Session awareness and transcript mirroring for direct cron delivery. */
const deliveryOutboundRuntimeLoader$1 = createLazyImportLoader(() => import("./delivery-outbound.runtime.js"));
const outboundSessionRuntimeLoader = createLazyImportLoader(() => import("./outbound-session-CAm-_-9b.js"));
const transcriptRuntimeLoader = createLazyImportLoader(() => import("./transcript.runtime.js"));
function shouldQueueCronAwareness(params) {
	return params.job.sessionTarget === "isolated" && !params.deliveryBestEffort && params.delivery.mode === "explicit";
}
function resolveCronAwarenessMainSessionKey(params) {
	return params.cfg.session?.scope === "global" ? "global" : resolveAgentMainSessionKey({
		cfg: params.cfg,
		agentId: params.agentId
	});
}
function isSameSessionKey(left, right) {
	const normalizedLeft = normalizeOptionalString(left);
	const normalizedRight = normalizeOptionalString(right);
	return normalizedLeft != null && normalizedLeft === normalizedRight;
}
function resolveCronAwarenessText(params) {
	if (params.outboundPayloads?.length) {
		const projectedText = resolveDirectCronTranscriptMirrorText(projectDeliveredDirectCronPayloadsForMirror(params.outboundPayloads));
		if (projectedText) return projectedText;
	}
	return params.deliveryPayloads ? pickLastNonEmptyTextFromPayloads(params.deliveryPayloads) : normalizeOptionalString(params.outputText) ?? normalizeOptionalString(params.synthesizedText);
}
function resolveDirectCronSummaryFallbackText(params) {
	return normalizeOptionalString(params.outputText) ?? normalizeOptionalString(params.summary) ?? normalizeOptionalString(params.synthesizedText);
}
function shouldAttachDirectCronFallbackText(payload) {
	return Boolean(payload.channelData) && !hasReplyPayloadContent(payload, {
		trimText: true,
		hasChannelData: false
	});
}
function resolveDirectCronFallbackSourceIndex(payloads, fallbackText) {
	if (!fallbackText) return;
	const index = payloads.findLastIndex((payload) => normalizeOptionalString(payload.text) === fallbackText);
	return index >= 0 ? index : void 0;
}
function formatTargetCronDeliveryAwarenessText(text) {
	return `A scheduled automation delivered this message to this channel:\n${text}`;
}
function formatTargetCronDeliveryFailureAwarenessText(params) {
	const targetParts = [`${params.channel}:${params.to}`];
	if (params.threadId) targetParts.push(`thread ${params.threadId}`);
	return [
		"A scheduled automation attempted to deliver to this channel, but delivery failed.",
		`Job: ${params.job.name || params.job.id}`,
		`Target: ${targetParts.join(" ")}`,
		"Check automation history for delivery error details.",
		params.partialDelivered ? "One or more scheduled message payloads may already have been delivered." : "No scheduled message was delivered."
	].join("\n");
}
async function queueCronAwarenessSystemEvent(params) {
	try {
		const { enqueueSystemEvent } = await deliveryOutboundRuntimeLoader$1.load();
		const mainSessionKey = resolveCronAwarenessMainSessionKey({
			cfg: params.cfg,
			agentId: params.agentId
		});
		if (params.queueMainSession) enqueueSystemEvent(params.text, withSystemEventOwner({
			sessionKey: mainSessionKey,
			contextKey: params.deliveryIdempotencyKey
		}, params.agentId));
		const targetSessionKey = params.targetSessionKey;
		if (targetSessionKey && (!isSameSessionKey(targetSessionKey, mainSessionKey) || !params.queueMainSession)) enqueueSystemEvent(params.targetText ?? formatTargetCronDeliveryAwarenessText(params.text), withSystemEventOwner({
			sessionKey: targetSessionKey,
			contextKey: params.deliveryIdempotencyKey
		}, params.agentId));
	} catch (err) {
		await logCronDeliveryWarn(`[cron:${params.jobId}] failed to queue isolated cron awareness: ${formatErrorMessage(err)}`);
	}
}
function isCustomCronSessionTarget(sessionTarget) {
	return typeof sessionTarget === "string" && sessionTarget.startsWith("session:");
}
function buildDirectCronTranscriptMirrorPayloads(payloads) {
	return payloads.map((payload) => {
		const spokenText = normalizeOptionalString(payload.spokenText);
		if (!spokenText) return payload;
		const mediaUrls = [payload.mediaUrl, ...payload.mediaUrls ?? []].filter((url) => Boolean(url) && !isAudioFileName(url));
		const { mediaUrl: _mediaUrl, mediaUrls: _mediaUrls, audioAsVoice: _audioAsVoice, spokenText: _spokenText, ...rest } = payload;
		return {
			...rest,
			text: spokenText,
			...mediaUrls.length ? { mediaUrls } : {}
		};
	});
}
function resolveDirectCronTranscriptMirrorText(params) {
	const text = normalizeOptionalString(params.text);
	const mediaText = resolveMirroredTranscriptText({ mediaUrls: params.mediaUrls }) ?? void 0;
	if (text && mediaText) return `${text}\n${mediaText}`;
	if (text || mediaText) return text ?? mediaText;
}
function pickDirectCronMirrorPayloadText(payload) {
	return normalizeOptionalString(payload.hookContent) ?? normalizeOptionalString(payload.text);
}
function isTtsAudioMirrorOnly(params) {
	return (params.payload.audioAsVoice === true || Boolean(params.payload.hookContent)) && isAudioFileName(params.mediaUrl);
}
function projectDeliveredDirectCronPayloadsForMirror(payloads) {
	const textParts = [];
	const mediaUrls = [];
	for (const payload of payloads) {
		const text = pickDirectCronMirrorPayloadText(payload);
		if (text) textParts.push(text);
		for (const mediaUrl of payload.mediaUrls) {
			if (isTtsAudioMirrorOnly({
				payload,
				mediaUrl
			})) continue;
			mediaUrls.push(mediaUrl);
		}
	}
	return {
		text: textParts.join("\n"),
		mediaUrls
	};
}
function canonicalizeDirectCronRouteSessionKey(params) {
	const sessionKey = params.sessionKey.trim();
	const canonical = canonicalizeMainSessionAlias({
		cfg: params.cfg,
		agentId: params.agentId,
		sessionKey
	});
	if (canonical !== sessionKey) return canonical;
	const thread = parseThreadSessionSuffix(sessionKey);
	if (!thread.baseSessionKey || !thread.threadId) return sessionKey;
	const canonicalBase = canonicalizeMainSessionAlias({
		cfg: params.cfg,
		agentId: params.agentId,
		sessionKey: thread.baseSessionKey
	});
	if (canonicalBase === thread.baseSessionKey || canonicalBase === "global") return sessionKey;
	return `${canonicalBase}:thread:${thread.threadId}`;
}
async function resolveCronDeliveryRouteSessionKey(params) {
	try {
		const { resolveOutboundSessionRoute } = await outboundSessionRuntimeLoader.load();
		const route = await resolveOutboundSessionRoute({
			cfg: params.cfg,
			channel: params.delivery.channel,
			agentId: params.agentId,
			accountId: params.delivery.accountId,
			target: params.delivery.to,
			currentSessionKey: selectCronRouteCurrentSessionKey(params.job, params.agentSessionKey, params.delivery.channel, params.delivery.to),
			threadId: params.delivery.threadId
		});
		const routeSessionKey = route?.sessionKey?.trim();
		if (!route || !routeSessionKey) return {
			sessionKey: params.agentSessionKey,
			route: null
		};
		const canonicalRouteSessionKey = canonicalizeDirectCronRouteSessionKey({
			cfg: params.cfg,
			agentId: params.agentId,
			sessionKey: routeSessionKey
		});
		const canonicalRouteBaseSessionKey = canonicalizeDirectCronRouteSessionKey({
			cfg: params.cfg,
			agentId: params.agentId,
			sessionKey: route.baseSessionKey
		});
		return {
			sessionKey: canonicalRouteSessionKey,
			route: canonicalRouteSessionKey === route.sessionKey && canonicalRouteBaseSessionKey === route.baseSessionKey ? route : {
				...route,
				sessionKey: canonicalRouteSessionKey,
				baseSessionKey: canonicalRouteBaseSessionKey
			}
		};
	} catch (err) {
		await logCronDeliveryWarn(`[cron:${params.job.id}] failed to resolve destination session for ${params.warningContext}: ${formatErrorMessage(err)}`);
		return {
			sessionKey: params.agentSessionKey,
			route: null
		};
	}
}
async function commitDirectCronOutboundRoute(params) {
	if (!params.route) return;
	try {
		const { ensureOutboundSessionEntry } = await outboundSessionRuntimeLoader.load();
		await ensureOutboundSessionEntry({
			cfg: params.cfg,
			channel: params.delivery.channel,
			accountId: params.delivery.accountId,
			route: params.route,
			sourceSessionKey: params.runSessionKey
		});
	} catch (err) {
		await logCronDeliveryWarn(`[cron] failed to persist outbound route after delivery: ${formatErrorMessage(err)}`);
	}
}
/** Resolves the transcript mirror session key and route for direct cron delivery.
*  The route must be persisted by the caller after successful platform delivery
*  via `commitDirectCronOutboundRoute`. */
async function resolveDirectCronDeliverySessionKey(params) {
	if (isCustomCronSessionTarget(params.job.sessionTarget)) return {
		sessionKey: params.agentSessionKey,
		route: null
	};
	return await resolveCronDeliveryRouteSessionKey({
		cfg: params.cfg,
		job: params.job,
		agentId: params.agentId,
		agentSessionKey: params.agentSessionKey,
		delivery: params.delivery,
		warningContext: "direct delivery mirror"
	});
}
function resolveCronMessageToolAwarenessTarget(params) {
	const { target } = params.delivery;
	const text = normalizeOptionalString(target.text) ?? resolveMirroredTranscriptText({ mediaUrls: target.mediaUrls }) ?? void 0;
	if (!text) return;
	const targetChannel = normalizeOptionalString(target.provider);
	const channel = targetChannel && targetChannel !== "message" ? targetChannel : params.delivery.verifiedTarget && params.resolvedDelivery.ok ? params.resolvedDelivery.channel : void 0;
	const to = normalizeOptionalString(target.to) ?? (params.delivery.verifiedTarget && params.resolvedDelivery.ok ? params.resolvedDelivery.to : void 0);
	if (!channel || !to) return;
	const accountId = target.accountId ?? (params.delivery.verifiedTarget && params.resolvedDelivery.ok ? params.resolvedDelivery.accountId : void 0);
	const threadId = target.threadId ?? (params.delivery.verifiedTarget && target.threadImplicit === true && params.resolvedDelivery.ok ? params.resolvedDelivery.threadId : void 0);
	return {
		ok: true,
		channel,
		to,
		...accountId ? { accountId } : {},
		...threadId ? { threadId } : {},
		mode: "explicit",
		text
	};
}
/** Queues target-session context awareness for cron deliveries made via message tool. */
async function queueCronMessageToolDeliveryAwareness(params) {
	const seen = /* @__PURE__ */ new Set();
	const deferredAwareness = [];
	for (const delivery of params.sourceDeliveryOutcome.visibleDeliveries) {
		const target = resolveCronMessageToolAwarenessTarget({
			delivery,
			resolvedDelivery: params.resolvedDelivery
		});
		if (!target) continue;
		const dedupeKey = [
			target.channel,
			normalizeDeliveryTarget(target.channel, target.to),
			target.accountId ?? "",
			target.threadId ?? "",
			target.text
		].join("\0");
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);
		const { sessionKey: targetSessionKey, route: targetRoute } = await resolveCronDeliveryRouteSessionKey({
			cfg: params.cfg,
			job: params.job,
			agentId: params.agentId,
			agentSessionKey: params.agentSessionKey,
			delivery: target,
			warningContext: "message-tool delivery awareness"
		});
		await commitDirectCronOutboundRoute({
			cfg: params.cfg,
			runSessionKey: params.runSessionKey,
			delivery: target,
			route: targetRoute
		});
		const deliveryIdempotencyKey = buildDirectCronDeliveryIdempotencyKey({
			jobId: params.job.id,
			runStartedAt: params.runStartedAt,
			delivery: target
		});
		const awarenessParams = {
			cfg: params.cfg,
			jobId: params.job.id,
			agentId: params.agentId,
			deliveryIdempotencyKey,
			queueMainSession: false,
			targetSessionKey,
			text: target.text
		};
		if (isSameSessionKey(targetSessionKey, params.deferredTargetSessionKey)) {
			deferredAwareness.push(() => queueCronAwarenessSystemEvent(awarenessParams));
			continue;
		}
		await queueCronAwarenessSystemEvent(awarenessParams);
	}
	if (deferredAwareness.length === 0) return;
	return async () => {
		for (const queue of deferredAwareness) await queue();
	};
}
async function appendDirectCronDeliveryTranscriptMirror(params) {
	if (!params.mirror.text && !params.mirror.mediaUrls?.length) return;
	try {
		const { appendAssistantMessageToSessionTranscript } = await transcriptRuntimeLoader.load();
		const result = await appendAssistantMessageToSessionTranscript(params.mirror);
		if (!result.ok) await logCronDeliveryWarn(`[cron:${params.job.id}] failed to mirror direct delivery into session transcript: ${result.reason}`);
	} catch (err) {
		await logCronDeliveryWarn(`[cron:${params.job.id}] failed to mirror direct delivery into session transcript: ${formatErrorMessage(err)}`);
	}
}
async function appendAdmittedDirectCronDeliveryTranscriptMirror(params) {
	const storePath = params.mirror.storePath;
	const initial = storePath ? loadCronSessionEntryLatest(storePath, params.mirror.sessionKey) : void 0;
	const expectedSessionId = params.mirror.expectedSessionId ?? initial?.sessionId;
	const expectedLifecycleRevision = params.mirror.expectedLifecycleRevision ?? initial?.lifecycleRevision;
	if (!storePath || !expectedSessionId) {
		await logCronDeliveryWarn(`[cron:${params.job.id}] skipped transcript mirror without an exact session identity`);
		return;
	}
	const admittedMirror = {
		...params.mirror,
		expectedSessionId,
		...expectedLifecycleRevision ? { expectedLifecycleRevision } : {}
	};
	try {
		const admission = await beginSessionWorkAdmission({
			scope: storePath,
			identities: [
				params.mirror.sessionKey,
				expectedSessionId,
				expectedLifecycleRevision ? resolveCronLifecycleRevisionIdentity(expectedLifecycleRevision) : void 0
			],
			signal: params.abortSignal,
			assertAllowed: () => {
				const latest = loadCronSessionEntryLatest(storePath, params.mirror.sessionKey);
				if (latest?.sessionId !== expectedSessionId || expectedLifecycleRevision !== void 0 && latest.lifecycleRevision !== expectedLifecycleRevision) throw new Error(`Session "${params.mirror.sessionKey}" changed before transcript mirror.`);
				const archivedError = resolveSessionWorkStartError(params.mirror.sessionKey, latest);
				if (archivedError) throw new Error(archivedError);
			}
		});
		try {
			await admission.run(() => appendDirectCronDeliveryTranscriptMirror({
				job: params.job,
				mirror: admittedMirror
			}));
		} finally {
			admission.release();
		}
	} catch (err) {
		await logCronDeliveryWarn(`[cron:${params.job.id}] skipped transcript mirror: ${formatErrorMessage(err)}`);
	}
}
//#endregion
//#region src/cron/isolated-agent/current-session-completion.ts
async function commitCurrentSessionCronCompletion(params, text) {
	const sourceSessionKey = params.sourceSessionKey?.trim();
	if (!sourceSessionKey) return {
		ok: false,
		reason: "current cron delivery is missing its source session binding"
	};
	if (!params.sourceSessionGeneration) return {
		ok: false,
		reason: "current cron delivery is missing its source session generation"
	};
	const completionText = resolveDirectCronTranscriptMirrorText(projectOutboundPayloadPlanForMirror(createOutboundPayloadPlan(buildDirectCronTranscriptMirrorPayloads(params.deliveryPayloads)))) ?? normalizeOptionalString(text);
	if (!completionText) return {
		ok: false,
		reason: "current cron completion has no durable transcript projection"
	};
	const runId = createCronExecutionId(params.job.id, params.runStartedAt);
	const committed = await commitBackgroundResultToSession({
		agentId: params.agentId,
		sessionKey: sourceSessionKey,
		expectedGeneration: params.sourceSessionGeneration,
		text: completionText,
		idempotencyKey: `cron-current-completion:${runId}`,
		provenance: {
			kind: "cron",
			jobId: params.job.id,
			runId
		},
		config: params.cfgWithAgentDefaults,
		signal: params.abortSignal
	});
	if (!committed.ok) return committed;
	if (params.sourceDeliveryOutcome.satisfiesSourceDelivery) return {
		ok: true,
		requiresExternalDelivery: false
	};
	if (params.resolvedDelivery.ok) return {
		ok: true,
		requiresExternalDelivery: true
	};
	if (resolvedDeliveryTargetsExternalChannel(params.resolvedDelivery)) return {
		ok: true,
		requiresExternalDelivery: false,
		deliveryError: params.resolvedDelivery.error.message
	};
	return {
		ok: true,
		requiresExternalDelivery: false
	};
}
//#endregion
//#region src/cron/isolated-agent/delivery-payload-normalization.ts
function normalizeDirectPayload(payload) {
	const normalized = payload.text ? normalizeSilentReplyText(payload.text) : void 0;
	return normalized ? copyReplyPayloadMetadata(payload, {
		...payload,
		text: normalized.strippedTrailingSilentToken ? void 0 : normalized.text
	}) : payload;
}
function normalizeDirectCronDeliveryPayloads(params) {
	const fallback = normalizeSilentReplyText(resolveDirectCronSummaryFallbackText(params));
	const fallbackText = fallback.strippedTrailingSilentToken ? void 0 : fallback.text;
	const candidates = params.deliveryPayloads.map(normalizeDirectPayload).filter((payload) => hasReplyPayloadContent(payload, { trimText: true }));
	if (candidates.length === 0 && fallbackText) candidates.push({ text: fallbackText });
	let fallbackSourceIndex = resolveDirectCronFallbackSourceIndex(candidates, fallbackText);
	if (fallbackText && fallbackSourceIndex === void 0 && candidates.some(shouldAttachDirectCronFallbackText)) {
		candidates.unshift({ text: fallbackText });
		fallbackSourceIndex = 0;
	}
	const prepared = candidates.map((payload) => shouldAttachDirectCronFallbackText(payload) && fallbackText && fallbackSourceIndex !== void 0 ? copyReplyPayloadMetadata(payload, Object.assign({}, payload, { fallbackText: {
		text: fallbackText,
		replacesPayloadIndex: fallbackSourceIndex
	} })) : payload);
	const accepted = [];
	let fallbackSourceSuppressed = false;
	let channelSuppressed = false;
	for (const [index, candidate] of prepared.entries()) {
		const transformed = params.channelTransform ? params.channelTransform.apply(candidate) : candidate;
		if (transformed === null) {
			channelSuppressed = true;
			fallbackSourceSuppressed ||= index === fallbackSourceIndex;
		} else accepted.push({
			payload: transformed,
			sourceIndex: index
		});
	}
	if (accepted.length === 0) return {
		kind: "suppress",
		reason: channelSuppressed ? "channel_transform" : "empty"
	};
	const acceptedFallbackIndex = accepted.findIndex(({ sourceIndex }) => sourceIndex === fallbackSourceIndex);
	return {
		kind: "deliver",
		payload: accepted.map(({ payload }) => {
			const fallbackMeta = payload.fallbackText;
			if (!fallbackMeta || fallbackMeta.replacesPayloadIndex !== fallbackSourceIndex) return payload;
			return copyReplyPayloadMetadata(payload, Object.assign({}, payload, { fallbackText: fallbackSourceSuppressed || acceptedFallbackIndex < 0 ? void 0 : {
				...fallbackMeta,
				replacesPayloadIndex: acceptedFallbackIndex
			} }));
		})
	};
}
/**
* Appends the Control UI run-inspection link to the last visible payload.
* Callers invoke this only after silent-reply suppression so a link cannot turn
* a silent or empty run into a visible announcement; the payload is replaced
* rather than mutated because payload objects can be aliased by the caller.
*/
function appendCronRunInspectionLink(payloads, inspectionUrl) {
	const index = payloads.findLastIndex((payload) => payload.text?.trim());
	if (!inspectionUrl || index < 0) return payloads;
	const payload = payloads[index];
	const linked = copyReplyPayloadMetadata(payload, {
		...payload,
		text: `${payload.text}\nInspect: ${inspectionUrl}`
	});
	return payloads.map((entry, at) => at === index ? linked : entry);
}
//#endregion
//#region src/cron/isolated-agent/delivery-dispatch.ts
const deliveryOutboundRuntimeLoader = createLazyImportLoader(() => import("./delivery-outbound.runtime.js"));
/** Dispatches cron run output through verified message-tool or direct delivery paths. */
async function dispatchCronDelivery(params) {
	const sourceDeliverySatisfied = params.sourceDeliveryOutcome.satisfiesSourceDelivery;
	const requiresCurrentSessionCompletion = params.job.sessionTarget === "current";
	const verifiedMessageToolDelivery = params.sourceDeliveryOutcome.verifiedMessageToolDelivery;
	let summary = params.summary;
	let outputText = params.outputText;
	let synthesizedText = params.synthesizedText;
	let deliveryPayloads = params.deliveryPayloads;
	const deliveryState = {
		status: params.deliveryRequested ? "not-delivered" : "not-requested",
		delivered: false,
		failureNotification: { status: "not-requested" }
	};
	const recordDelivery = (status, error, deliverySuppressionReason) => {
		deliveryState.status = status;
		deliveryState.delivered = status === "delivered" ? true : status === "not-delivered" ? false : void 0;
		deliveryState.error = error;
		deliveryState.deliverySuppressionReason = deliverySuppressionReason;
	};
	if (verifiedMessageToolDelivery) recordDelivery("delivered");
	let deliveryAttempted = verifiedMessageToolDelivery;
	let deferredDeletingSessionMirror;
	const buildDeliveryState = async (result) => {
		const completion = resolveAdmittedCronCompletionStatus(params.job, result?.status === "error" ? "error" : params.undeliveredRunStatus, deliveryState.status, deliveryState.deliverySuppressionReason);
		if (deliveryState.status === "delivered" || deliveryState.status === "not-requested" || completion === "succeeded") await cleanupDirectCronSessionIfNeeded();
		await params.queueSourceSessionMessageToolAwareness?.();
		return {
			...result ? { result } : {},
			deliveryState,
			delivered: deliveryState.delivered,
			deliveryAttempted,
			deliveryError: deliveryState.error,
			deliverySuppressionReason: deliveryState.deliverySuppressionReason,
			summary,
			outputText,
			synthesizedText,
			deliveryPayloads
		};
	};
	const formatDeliveryTargetError = (error) => params.sourceDeliveryOutcome.unverifiedMessageToolDelivery ? `${error}; the agent used the message tool, but OpenClaw could not verify that message matched the cron delivery target` : error;
	const failDeliveryTarget = (error) => params.withRunSession({
		status: "error",
		error: formatDeliveryTargetError(error),
		errorKind: "delivery-target",
		summary,
		outputText,
		delivered: deliveryState.delivered,
		deliveryAttempted,
		deliveryError: deliveryState.error,
		...params.telemetry
	});
	const cleanupDirectCronSessionIfNeeded = async () => {
		const cleanupOutcome = await cleanupCronRunSessionAfterRun({
			job: params.job,
			agentSessionKey: params.agentSessionKey,
			sessionId: params.sessionId,
			lifecycleRevision: params.lifecycleRevision,
			sessionUpdatedAt: params.sessionUpdatedAt,
			beforeDelete: params.beforeSessionDelete,
			reason: "cron-delete-after-run-fallback"
		});
		const survivingMirror = deferredDeletingSessionMirror;
		deferredDeletingSessionMirror = void 0;
		if (cleanupOutcome !== "not-requested" && cleanupOutcome !== "deleted" && survivingMirror) await appendAdmittedDirectCronDeliveryTranscriptMirror({
			job: params.job,
			mirror: survivingMirror,
			abortSignal: params.abortSignal
		});
	};
	const finishSilentReplyDelivery = (reason) => {
		deliveryAttempted = true;
		recordDelivery("not-delivered", void 0, reason);
		return params.withRunSession({
			status: "ok",
			summary,
			outputText,
			delivered: false,
			deliveryAttempted: true,
			deliverySuppressionReason: reason,
			...params.telemetry
		});
	};
	const deliverViaDirect = async (delivery) => {
		const { buildOutboundSessionContext, createOutboundSendDeps, durableMessageBatchMayHaveReachedRecipient, resolveAgentOutboundIdentity, resolveCronChannelReplyTransform, sendDurableMessageBatchCore } = await deliveryOutboundRuntimeLoader.load();
		const payloadNormalization = normalizeDirectCronDeliveryPayloads({
			deliveryPayloads,
			outputText,
			summary,
			synthesizedText,
			channelTransform: resolveCronChannelReplyTransform({
				channel: delivery.channel,
				cfg: params.cfgWithAgentDefaults,
				accountId: delivery.accountId
			})
		});
		if (payloadNormalization.kind === "suppress") return finishSilentReplyDelivery(payloadNormalization.reason);
		const normalizedPayloads = payloadNormalization.payload;
		const deliveryIdempotencyKey = buildDirectCronDeliveryIdempotencyKey({
			jobId: params.job.id,
			runStartedAt: params.runStartedAt,
			delivery
		});
		let completedDelivery = false;
		try {
			completedDelivery = isCompletedDirectCronDelivery(deliveryIdempotencyKey);
		} catch (err) {
			if (!params.deliveryBestEffort) throw err;
			await logCronDeliveryWarn(`[cron:${params.job.id}] durable delivery receipt unavailable; continuing best-effort delivery: ${formatErrorMessage(err)}`);
		}
		if (completedDelivery) {
			recordDelivery("delivered");
			deliveryAttempted = true;
			return null;
		}
		const identity = resolveAgentOutboundIdentity(params.cfgWithAgentDefaults, params.agentId);
		try {
			if (params.isAborted()) return params.withRunSession({
				status: "error",
				error: params.abortReason(),
				deliveryAttempted,
				...params.telemetry
			});
			if (params.deliveryRequested && isStaleCronDelivery({
				job: params.job,
				runStartedAt: params.runStartedAt
			})) {
				deliveryAttempted = true;
				const nowMs = Date.now();
				const scheduledAtMs = resolveCronDeliveryScheduledAtMs({
					job: params.job,
					runStartedAt: params.runStartedAt
				});
				const startDelayMs = resolveCronDeliveryStartDelayMs({
					job: params.job,
					runStartedAt: params.runStartedAt
				});
				const deliveryError = `skipping stale delivery scheduled at ${new Date(scheduledAtMs).toISOString()}, started ${Math.round(startDelayMs / 6e4)}m late, current age ${Math.round((nowMs - scheduledAtMs) / 6e4)}m`;
				recordDelivery("not-delivered", deliveryError);
				await logCronDeliveryWarn(`[cron:${params.job.id}] ${deliveryError}`);
				return params.withRunSession({
					status: "ok",
					summary,
					outputText,
					deliveryAttempted,
					delivered: false,
					deliveryError,
					...params.telemetry
				});
			}
			const payloadsForDelivery = (await maybeApplyTtsToCronPayloads({
				cfg: params.cfgWithAgentDefaults,
				payloads: normalizedPayloads,
				delivery,
				agentId: params.agentId,
				ttsAuto: params.ttsAuto
			})).filter((p) => hasReplyPayloadContent(p, { trimText: true }));
			if (payloadsForDelivery.length === 0) {
				recordDelivery("not-delivered", "cron delivery payload was empty after TTS");
				return null;
			}
			const linkedPayloadsForDelivery = appendCronRunInspectionLink(payloadsForDelivery, resolveControlUiSessionUrl(params.cfgWithAgentDefaults, {
				sessionKey: params.runSessionKey,
				fallbackAgentId: params.agentId,
				exactKey: true
			}));
			deliveryAttempted = true;
			const { sessionKey: deliverySessionKey, route: directCronOutboundRoute } = await resolveDirectCronDeliverySessionKey({
				cfg: params.cfgWithAgentDefaults,
				job: params.job,
				agentId: params.agentId,
				agentSessionKey: params.agentSessionKey,
				delivery
			});
			const deliverySession = buildOutboundSessionContext({
				cfg: params.cfgWithAgentDefaults,
				agentId: params.agentId,
				sessionKey: deliverySessionKey
			});
			const awarenessMainSessionKey = resolveCronAwarenessMainSessionKey({
				cfg: params.cfgWithAgentDefaults,
				agentId: params.agentId
			});
			const mirrorTargetsAwarenessMainSession = isSameSessionKey(deliverySessionKey, awarenessMainSessionKey);
			const mirrorTargetsDeletingRunSession = params.job.deleteAfterRun === true && isCronSessionKey(params.agentSessionKey) && isSameSessionKey(deliverySessionKey, params.agentSessionKey);
			let hadPartialFailure = false;
			let completedByConcurrentDelivery = false;
			let payloadMayHaveReachedRecipientBeforeFailure = false;
			let directCronRouteCommitted = false;
			const commitDirectCronRouteEarly = async () => {
				if (directCronRouteCommitted || !directCronOutboundRoute) return;
				directCronRouteCommitted = true;
				await commitDirectCronOutboundRoute({
					cfg: params.cfgWithAgentDefaults,
					runSessionKey: params.runSessionKey,
					delivery,
					route: directCronOutboundRoute
				});
			};
			const attemptedPayloadsForMirror = [];
			const onError = params.deliveryBestEffort ? (err, _payload) => {
				logCronDeliveryErrorDeferred(`[cron:${params.job.id}] delivery payload failed (bestEffort): ${formatErrorMessage(err)}`);
			} : void 0;
			const sendPresentedCronBatch = batch => deliverCronPresentation(params, batch, sendDurableMessageBatchCore);
			const runDelivery = async () => {
				attemptedPayloadsForMirror.length = 0;
				const send = await sendPresentedCronBatch({
					cfg: params.cfgWithAgentDefaults,
					channel: delivery.channel,
					to: delivery.to,
					accountId: delivery.accountId,
					threadId: delivery.threadId,
					payloads: linkedPayloadsForDelivery,
					session: deliverySession,
					identity,
					bestEffort: params.deliveryBestEffort,
					durability: params.deliveryBestEffort ? "best_effort" : "required",
					deliveryIntentId: deliveryIdempotencyKey,
					reusePendingDeliveryIntent: true,
					completionRetention: DIRECT_CRON_DELIVERY_COMPLETION_RETENTION,
					deps: createOutboundSendDeps(params.deps),
					signal: params.abortSignal,
					onError,
					onPayload: (payload) => {
						attemptedPayloadsForMirror.push(payload);
					},
					onDeliveryResult: () => {
						return commitDirectCronRouteEarly();
					}
				});
				payloadMayHaveReachedRecipientBeforeFailure ||= durableMessageBatchMayHaveReachedRecipient(send);
				if (send.status === "failed" && await waitForCompletedDirectCronDelivery({
					id: deliveryIdempotencyKey,
					signal: params.abortSignal
				})) {
					completedByConcurrentDelivery = true;
					return [];
				}
				if (send.status === "failed") throw send.error;
				if (send.status === "partial_failed") {
					payloadMayHaveReachedRecipientBeforeFailure = true;
					if (!params.deliveryBestEffort) throw send.error;
					hadPartialFailure = true;
					deliveryState.error ??= formatErrorMessage(send.error);
				}
				if (send.status === "suppressed") {
					const uncertain = durableMessageBatchMayHaveReachedRecipient(send);
					const reason = uncertain ? "adapter_returned_no_identity" : send.reason;
					recordDelivery(uncertain ? "unknown" : "not-delivered", `cron delivery ${uncertain ? "outcome is unknown" : "was suppressed"}: ${reason}`);
				}
				return send.status === "sent" || send.status === "partial_failed" ? send.results : [];
			};
			let deliveryResults;
			try {
				deliveryResults = await retryTransientDirectCronDelivery({
					jobId: params.job.id,
					signal: params.abortSignal,
					run: runDelivery,
					shouldRetryError: () => !payloadMayHaveReachedRecipientBeforeFailure
				});
			} catch (err) {
				const failureAwarenessText = formatTargetCronDeliveryFailureAwarenessText({
					job: params.job,
					channel: delivery.channel,
					to: delivery.to,
					threadId: stringifyRouteThreadId(delivery.threadId),
					partialDelivered: payloadMayHaveReachedRecipientBeforeFailure
				});
				await queueCronAwarenessSystemEvent({
					cfg: params.cfgWithAgentDefaults,
					jobId: params.job.id,
					agentId: params.agentId,
					deliveryIdempotencyKey: `${deliveryIdempotencyKey}:failure`,
					queueMainSession: false,
					targetSessionKey: deliverySessionKey,
					text: failureAwarenessText,
					targetText: failureAwarenessText
				});
				if (payloadMayHaveReachedRecipientBeforeFailure) await commitDirectCronRouteEarly();
				throw err;
			}
			if (completedByConcurrentDelivery) {
				recordDelivery("delivered");
				await commitDirectCronRouteEarly();
				return null;
			}
			if (deliveryResults.length > 0) recordDelivery(hadPartialFailure ? "not-delivered" : "delivered", deliveryState.error);
			if (deliveryState.delivered || payloadMayHaveReachedRecipientBeforeFailure) await commitDirectCronRouteEarly();
			const deliveryAwarenessText = resolveCronAwarenessText({
				outputText,
				synthesizedText,
				deliveryPayloads: linkedPayloadsForDelivery,
				outboundPayloads: attemptedPayloadsForMirror
			});
			const shouldQueueAwarenessForDelivery = shouldQueueCronAwareness({
				job: params.job,
				delivery,
				deliveryBestEffort: params.deliveryBestEffort
			});
			const targetSessionAwarenessText = !params.deliveryBestEffort && (shouldQueueAwarenessForDelivery || !isSameSessionKey(deliverySessionKey, awarenessMainSessionKey)) ? deliveryAwarenessText : void 0;
			const deliveryWillReachAwarenessMainSession = mirrorTargetsAwarenessMainSession && Boolean(targetSessionAwarenessText);
			const mirrorWouldBypassIsolatedAwarenessPolicy = mirrorTargetsAwarenessMainSession && params.job.sessionTarget === "isolated" && delivery.mode !== "explicit";
			if (deliveryState.delivered && !requiresCurrentSessionCompletion && !deliveryWillReachAwarenessMainSession && !mirrorWouldBypassIsolatedAwarenessPolicy) {
				const mirrorText = resolveDirectCronTranscriptMirrorText(attemptedPayloadsForMirror.length > 0 ? projectDeliveredDirectCronPayloadsForMirror(attemptedPayloadsForMirror) : projectOutboundPayloadPlanForMirror(createOutboundPayloadPlan(buildDirectCronTranscriptMirrorPayloads(linkedPayloadsForDelivery), {
					cfg: params.cfgWithAgentDefaults,
					sessionKey: deliverySessionKey,
					surface: delivery.channel
				})));
				const transcriptMirror = {
					sessionKey: deliverySessionKey,
					agentId: params.agentId,
					...mirrorTargetsDeletingRunSession ? {
						expectedSessionId: params.sessionId,
						expectedLifecycleRevision: params.lifecycleRevision
					} : {},
					text: mirrorText,
					mediaUrls: void 0,
					storePath: resolveSessionStorePathCore(params.cfgWithAgentDefaults.session?.store, { agentId: params.agentId }),
					idempotencyKey: deliveryIdempotencyKey,
					...targetSessionAwarenessText === void 0 ? { deliveryMirror: { kind: CRON_DIRECT_DELIVERY_CONTEXT_KIND } } : {},
					config: params.cfgWithAgentDefaults
				};
				if (mirrorTargetsDeletingRunSession) deferredDeletingSessionMirror = transcriptMirror;
				else await appendAdmittedDirectCronDeliveryTranscriptMirror({
					job: params.job,
					mirror: transcriptMirror,
					abortSignal: params.abortSignal
				});
			}
			if (deliveryState.delivered && targetSessionAwarenessText) await queueCronAwarenessSystemEvent({
				cfg: params.cfgWithAgentDefaults,
				jobId: params.job.id,
				agentId: params.agentId,
				deliveryIdempotencyKey,
				queueMainSession: shouldQueueAwarenessForDelivery,
				text: targetSessionAwarenessText,
				targetSessionKey: deliverySessionKey
			});
			return null;
		} catch (err) {
			await logCronDeliveryError(`[cron:${params.job.id}] delivery failed (${params.deliveryBestEffort ? "bestEffort" : "required"}): ${formatErrorMessage(err)}`);
			deliveryState.error = normalizeCronRunErrorText(err);
			return null;
		}
	};
	const finalizeTextDelivery = async (delivery) => {
		if (!synthesizedText && !params.spawnOnlyHandoff && !(requiresCurrentSessionCompletion && params.deliveryPayloadHasStructuredContent)) return null;
		const initialSynthesizedText = synthesizedText?.trim() ?? "";
		const spawnOnlyHandoff = params.spawnOnlyHandoff;
		const { finalReply, activeSubagentRuns, hadDescendants } = await resolveDescendantSubagentFollowup({
			sessionKey: params.runSessionKey,
			runStartedAt: params.runStartedAt,
			timeoutMs: params.timeoutMs,
			deliveryBestEffort: params.deliveryBestEffort,
			spawnOnlyHandoff,
			initialSynthesizedText
		});
		if (finalReply) {
			outputText = finalReply;
			summary = pickSummaryFromOutput(finalReply) ?? summary;
			synthesizedText = finalReply;
			deliveryPayloads = [{ text: finalReply }];
		}
		if (spawnOnlyHandoff && !synthesizedText?.trim()) {
			const error = params.isAborted() ? params.abortReason() : activeSubagentRuns > 0 ? "cron child-session handoff timed out before producing a final assistant payload" : "cron child-session handoff completed without a final assistant payload";
			deliveryAttempted = true;
			return params.withRunSession({
				status: "error",
				error,
				delivered: false,
				deliveryAttempted,
				...params.telemetry
			});
		}
		if (!params.deliveryBestEffort && activeSubagentRuns > 0) {
			deliveryAttempted = true;
			recordDelivery("not-delivered", "cron descendants are still active without a final reply");
			return params.withRunSession({
				status: "ok",
				summary,
				outputText,
				deliveryAttempted,
				...params.telemetry
			});
		}
		if (hadDescendants && synthesizedText?.trim() === initialSynthesizedText && isLikelyInterimCronMessage(initialSynthesizedText) && !isSilentReplyText(initialSynthesizedText, "NO_REPLY")) {
			deliveryAttempted = true;
			recordDelivery("not-delivered", "cron descendants completed without a final reply");
			return params.withRunSession({
				status: "ok",
				summary,
				outputText,
				deliveryAttempted,
				...params.telemetry
			});
		}
		const normalizedSynthesizedText = normalizeSilentReplyText(synthesizedText);
		const hasStructuredCurrentSessionCompletion = requiresCurrentSessionCompletion && params.deliveryPayloadHasStructuredContent;
		if ((normalizedSynthesizedText.text === void 0 || normalizedSynthesizedText.strippedTrailingSilentToken) && !hasStructuredCurrentSessionCompletion) return finishSilentReplyDelivery("silent");
		synthesizedText = normalizedSynthesizedText.text;
		if (synthesizedText) outputText = synthesizedText;
		if (params.isAborted()) return params.withRunSession({
			status: "error",
			error: params.abortReason(),
			deliveryAttempted,
			...params.telemetry
		});
		if (requiresCurrentSessionCompletion) {
			deliveryAttempted = true;
			const completion = await commitCurrentSessionCronCompletion(params, synthesizedText);
			if (!completion.ok) {
				recordDelivery("not-delivered", completion.reason);
				return failDeliveryTarget(completion.reason);
			}
			params.queueSourceSessionMessageToolAwareness = void 0;
			if (!completion.requiresExternalDelivery) {
				recordDelivery(completion.deliveryError ? "not-delivered" : "delivered", completion.deliveryError);
				return null;
			}
			recordDelivery("not-delivered");
		}
		if (!delivery) return null;
		return await deliverViaDirect(delivery);
	};
	if (params.deliveryRequested && params.skipDelivery && !sourceDeliverySatisfied) return buildDeliveryState(finishSilentReplyDelivery(params.skipDelivery));
	if (params.deliveryRequested && !params.skipDelivery && (!sourceDeliverySatisfied || requiresCurrentSessionCompletion)) {
		if (!params.resolvedDelivery.ok) {
			if (requiresCurrentSessionCompletion) return buildDeliveryState(await finalizeTextDelivery() ?? void 0);
			if (!params.deliveryBestEffort) {
				const error = params.resolvedDelivery.error.message;
				recordDelivery("not-delivered", formatDeliveryTargetError(error));
				return buildDeliveryState(failDeliveryTarget(error));
			}
			recordDelivery("not-delivered", params.resolvedDelivery.error.message);
			await logCronDeliveryWarn(`[cron:${params.job.id}] ${params.resolvedDelivery.error.message}`);
			return buildDeliveryState(params.withRunSession({
				status: "ok",
				summary,
				outputText,
				delivered: deliveryState.delivered,
				deliveryError: deliveryState.error,
				deliveryAttempted,
				...params.telemetry
			}));
		}
		if (!requiresCurrentSessionCompletion && (params.deliveryPayloadHasStructuredContent || params.resolvedDelivery.threadId != null && !params.spawnOnlyHandoff)) {
			const directResult = await deliverViaDirect(params.resolvedDelivery);
			if (directResult) return buildDeliveryState(directResult);
		} else {
			const finalizedTextResult = await finalizeTextDelivery(params.resolvedDelivery);
			if (finalizedTextResult) return buildDeliveryState(finalizedTextResult);
		}
	}
	return buildDeliveryState();
}
//#endregion
export { dispatchCronDelivery, queueCronMessageToolDeliveryAwareness, resolveCronDeliveryBestEffort, resolveDeliveryTarget };
