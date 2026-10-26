import "./src-vebZIeLe.js";
import { l as toErrorObject } from "./error-coercion-CwcmpTBO.js";
import { t as expectDefined } from "./expect-CyE8FADM.js";
import { t as hasNonEmptyString } from "./string-coerce-CIXf7egm.js";
import { a as writeRuntimeJson } from "./runtime-V1VdbWVS.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { m as resolveAgentWorkspaceDir, y as resolveDefaultAgentId } from "./agent-scope-config-CUiGBd59.js";
import { _ as resolveSessionAgentId } from "./agent-scope-CSlN0kZb.js";
import { c as formatUnknownChannelMessage } from "./error-format-Cae7EwnT.js";
import { i as copyReplyPayloadMetadata } from "./reply-payload-DahKk-7n.js";
import { a as normalizeChannelId, t as getChannelPlugin } from "./registry-CkcjiYIl.js";
import "./plugins-BssTyOqH.js";
import { a as isInternalMessageChannel } from "./message-channel-BGKf9KPa.js";
import { f as isAgentRunRestartAbortReason } from "./run-termination-Ts9RsbeN.js";
import { o as hasReplyPayloadContent } from "./payload-DYE7bQ2k.js";
import { a as resolveResponsePrefixTemplate, r as normalizeReplyPayloadOutcome } from "./normalize-reply-BnIqL8WP.js";
import { r as formatBtwTextForExternalDelivery } from "./reply-payloads-BviiIpcn.js";
import { a as resolveMessagingToolPayloadDedupe, r as hasEnabledDeliveryOperation, t as filterMessagingToolMediaDuplicates } from "./reply-payloads-dedupe-DqHal5_B.js";
import { a as projectOutboundPayloadPlanForDelivery, c as projectOutboundPayloadPlanForOutbound, n as formatOutboundPayloadLog, o as projectOutboundPayloadPlanForJson, r as normalizeOutboundPayloadsForJson, t as createOutboundPayloadPlan } from "./payloads-Ch7RD6Ym.js";
import { n as isNestedAgentLane } from "./lanes-CI0_P-yC.js";
import { r as createChannelReplyTransform } from "./reply-transform-DyIKvYWJ.js";
import { n as sendDurableMessageBatchCore, r as serializeDurableMessagePayloadOutcomes } from "./send-Dm_2yoaJ.js";
import "./runtime-DNt16qF0.js";
import { r as resolveMessageChannelSelection } from "./channel-selection-cs_ikGB-.js";
import { i as resolveChannelDefaultAccountId } from "./helpers-MDpd3Xlg.js";
import { t as createReplyPrefixContext } from "./reply-prefix-Ddn3qL_7.js";
import { n as resolveAgentOutboundIdentity } from "./identity-dWR9MUdT.js";
import { t as createOutboundSendDeps } from "./outbound-send-deps-CzQHPhLv.js";
import { r as resolveAgentOutboundTarget, t as resolveAgentDeliveryPlanWithSessionRoute } from "./agent-delivery-k4NdoSge.js";
import { n as createReplyMediaPathNormalizer } from "./reply-media-paths.runtime-B0dVQiC4.js";
import "./reply-payloads-dedupe.runtime-BrlfUWfP.js";
//#region src/infra/outbound/envelope.ts
const isOutboundPayloadJson = (payload) => "mediaUrl" in payload;
/** Builds the outbound result envelope, flattening plain delivery-only results by default. */
function buildOutboundResultEnvelope(params) {
	const hasPayloads = params.payloads !== void 0;
	const payloads = params.payloads === void 0 ? void 0 : params.payloads.length === 0 ? [] : isOutboundPayloadJson(expectDefined(params.payloads[0], "payloads entry at 0")) ? [...params.payloads] : normalizeOutboundPayloadsForJson(params.payloads);
	if (params.flattenDelivery !== false && params.delivery && !params.meta && !hasPayloads) return params.delivery;
	return {
		...hasPayloads ? { payloads } : {},
		...params.meta ? { meta: params.meta } : {},
		...params.delivery ? { delivery: params.delivery } : {}
	};
}
//#endregion
//#region src/agents/command/delivery.ts
/**
* Normalizes and delivers agent command results to outbound channels.
*/
function createRestartOnlyAbortSignal(source) {
	if (!source) return { dispose: () => {} };
	const controller = new AbortController();
	const onAbort = () => {
		if (isAgentRunRestartAbortReason(source.reason)) controller.abort(source.reason);
	};
	if (source.aborted) onAbort();
	else source.addEventListener("abort", onAbort, { once: true });
	return {
		signal: controller.signal,
		dispose: () => source.removeEventListener("abort", onAbort)
	};
}
const NESTED_LOG_PREFIX = "[agent:nested]";
function normalizeDeliverySessionId(value) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : void 0;
}
function isFreshDeliverySessionMatch(freshSessionEntry, expectedSessionId) {
	const normalizedExpected = normalizeDeliverySessionId(expectedSessionId);
	return Boolean(normalizedExpected && freshSessionEntry.sessionId === normalizedExpected);
}
function formatNestedLogPrefix(opts, sessionKey) {
	const parts = [NESTED_LOG_PREFIX];
	const session = sessionKey ?? opts.sessionKey ?? opts.sessionId;
	if (session) parts.push(`session=${session}`);
	if (opts.runId) parts.push(`run=${opts.runId}`);
	const channel = opts.messageChannel ?? opts.channel;
	if (channel) parts.push(`channel=${channel}`);
	if (opts.to) parts.push(`to=${opts.to}`);
	if (opts.accountId) parts.push(`account=${opts.accountId}`);
	return parts.join(" ");
}
function logNestedOutput(runtime, opts, output, sessionKey) {
	const prefix = formatNestedLogPrefix(opts, sessionKey);
	for (const line of output.split(/\r?\n/)) {
		if (!line) continue;
		runtime.log(`${prefix} ${line}`);
	}
}
function hasNonEmptyStringArray(value) {
	return Array.isArray(value) && value.some(hasNonEmptyString);
}
function hasNonEmptyArray(value) {
	return Array.isArray(value) && value.length > 0;
}
function buildDeliveryResult(params) {
	const successfulCronAdds = params.result.successfulCronAdds;
	const hasSuccessfulCronAdds = typeof successfulCronAdds === "number" && Number.isFinite(successfulCronAdds) && successfulCronAdds > 0;
	return {
		payloads: params.payloads,
		meta: params.meta,
		...params.result.didSendViaMessagingTool === true ? { didSendViaMessagingTool: true } : {},
		...hasNonEmptyStringArray(params.result.messagingToolSentTexts) ? { messagingToolSentTexts: params.result.messagingToolSentTexts } : {},
		...hasNonEmptyStringArray(params.result.messagingToolSentMediaUrls) ? { messagingToolSentMediaUrls: params.result.messagingToolSentMediaUrls } : {},
		...hasNonEmptyArray(params.result.messagingToolSentTargets) ? { messagingToolSentTargets: params.result.messagingToolSentTargets } : {},
		...params.result.didSendDeterministicApprovalPrompt === true ? { didSendDeterministicApprovalPrompt: true } : {},
		...hasNonEmptyArray(params.result.acceptedSessionSpawns) ? { acceptedSessionSpawns: params.result.acceptedSessionSpawns } : {},
		...hasSuccessfulCronAdds ? { successfulCronAdds } : {},
		...params.deliverySucceeded !== void 0 ? { deliverySucceeded: params.deliverySucceeded } : {},
		...params.deliveryStatus ? { deliveryStatus: params.deliveryStatus } : {}
	};
}
function deliveryStatusFromDurableSend(send) {
	const payloadOutcomes = serializeDurableMessagePayloadOutcomes(send.payloadOutcomes, { includeHookEffect: true });
	switch (send.status) {
		case "sent": return {
			requested: true,
			attempted: true,
			status: "sent",
			succeeded: true,
			resultCount: send.results.length,
			...payloadOutcomes ? { payloadOutcomes } : {}
		};
		case "suppressed": return {
			requested: true,
			attempted: true,
			status: "suppressed",
			succeeded: true,
			reason: send.reason,
			resultCount: 0,
			...payloadOutcomes ? { payloadOutcomes } : {}
		};
		case "partial_failed": return {
			requested: true,
			attempted: true,
			status: "partial_failed",
			succeeded: "partial",
			error: true,
			errorMessage: formatErrorMessage(send.error),
			resultCount: send.results.length,
			sentBeforeError: true,
			...payloadOutcomes ? { payloadOutcomes } : {}
		};
		case "failed": return {
			requested: true,
			attempted: true,
			status: "failed",
			succeeded: false,
			error: true,
			errorMessage: formatErrorMessage(send.error),
			...send.stage ? { reason: send.stage } : {},
			...payloadOutcomes ? { payloadOutcomes } : {}
		};
	}
	return send;
}
function preDeliveryFailureStatus(reason) {
	return {
		requested: true,
		attempted: false,
		status: "failed",
		succeeded: false,
		error: true,
		reason
	};
}
function noVisiblePayloadStatus(reason) {
	return {
		requested: true,
		attempted: false,
		status: "suppressed",
		succeeded: true,
		reason: reason === "channel_transform" ? reason : "no_visible_payload",
		resultCount: 0
	};
}
async function normalizeReplyMediaPathsForDelivery(params) {
	if (params.payloads.length === 0) return { payloads: params.payloads };
	const agentId = params.outboundSession?.agentId ?? resolveSessionAgentId({
		sessionKey: params.sessionKey,
		config: params.cfg
	});
	const workspaceDir = agentId ? resolveAgentWorkspaceDir(params.cfg, agentId) : void 0;
	if (!workspaceDir) return { payloads: params.payloads };
	const normalizeMediaPaths = createReplyMediaPathNormalizer({
		cfg: params.cfg,
		sessionKey: params.sessionKey,
		agentId,
		workspaceDir,
		messageProvider: params.deliveryChannel,
		accountId: params.accountId
	});
	const result = [];
	for (const payload of params.payloads) result.push(await normalizeMediaPaths(payload));
	return {
		payloads: result,
		normalizeMediaPaths
	};
}
async function normalizeSentMediaUrlsForDelivery(params) {
	const normalizedUrls = [];
	const seen = /* @__PURE__ */ new Set();
	for (const raw of params.sentMediaUrls) {
		const trimmed = raw.trim();
		if (!trimmed) continue;
		if (!seen.has(trimmed)) {
			seen.add(trimmed);
			normalizedUrls.push(trimmed);
		}
		if (!params.normalizeMediaPaths) continue;
		try {
			const normalized = await params.normalizeMediaPaths({
				mediaUrl: trimmed,
				mediaUrls: [trimmed]
			});
			for (const mediaUrl of [normalized.mediaUrl, ...normalized.mediaUrls ?? []]) {
				const candidate = mediaUrl?.trim();
				if (!candidate || seen.has(candidate)) continue;
				seen.add(candidate);
				normalizedUrls.push(candidate);
			}
		} catch {}
	}
	return normalizedUrls;
}
const UNRESOLVED_RESPONSE_PREFIX_VAR_PATTERN = /\{[a-zA-Z][a-zA-Z0-9.]*\}/;
async function filterAlreadyDeliveredReplyPayloads(params) {
	const sentTexts = params.result.messagingToolSentTexts ?? [];
	const sentMediaUrls = params.result.messagingToolSentMediaUrls ?? [];
	const implicitToolAccountId = params.sourceAccountId ?? params.defaultAccountId;
	const sentTargets = (params.result.messagingToolSentTargets ?? []).flatMap((target) => {
		if (target.accountId || !params.accountId) return [target];
		return implicitToolAccountId ? [{
			...target,
			accountId: implicitToolAccountId
		}] : [];
	});
	if (sentTexts.length === 0 && sentMediaUrls.length === 0 && sentTargets.length === 0) return params.payloads;
	const decision = resolveMessagingToolPayloadDedupe({
		config: params.cfg,
		messageProvider: params.deliveryChannel,
		messagingToolSentTargets: sentTargets,
		originatingTo: params.deliveryTarget,
		originatingThreadId: params.threadId,
		accountId: params.accountId
	});
	if (!decision.matchingRoute) return params.payloads;
	const routeSentMediaUrls = decision.useGlobalSentMediaUrlEvidenceFallback ? sentMediaUrls : decision.routeSentMediaUrls;
	const rawRouteSentTexts = decision.useGlobalSentTextEvidenceFallback ? sentTexts : decision.routeSentTexts;
	const routeSentTexts = params.normalizeSentTexts?.(rawRouteSentTexts) ?? rawRouteSentTexts;
	const exactRouteSentTexts = new Set(routeSentTexts.filter((text) => Boolean(text.trim())));
	const normalizedSentMediaUrls = await normalizeSentMediaUrlsForDelivery({
		sentMediaUrls: routeSentMediaUrls,
		normalizeMediaPaths: params.normalizeMediaPaths
	});
	const mediaFiltered = filterMessagingToolMediaDuplicates({
		payloads: params.payloads,
		sentMediaUrls: normalizedSentMediaUrls
	});
	const filteredPayloads = [];
	for (const candidate of mediaFiltered) {
		if (hasEnabledDeliveryOperation(candidate)) {
			filteredPayloads.push(candidate);
			continue;
		}
		const effectiveCandidateText = formatBtwTextForExternalDelivery(candidate) ?? candidate.text ?? "";
		if (!effectiveCandidateText.trim() || !exactRouteSentTexts.has(effectiveCandidateText)) {
			filteredPayloads.push(candidate);
			continue;
		}
		const withoutDuplicateText = copyReplyPayloadMetadata(candidate, {
			...candidate,
			text: void 0
		});
		if (hasReplyPayloadContent(withoutDuplicateText, {
			trimText: true,
			extraContent: withoutDuplicateText.location != null
		})) filteredPayloads.push(withoutDuplicateText);
	}
	return filteredPayloads;
}
/** Normalizes reply payloads and media paths before delivery. */
function normalizeAgentCommandReplyPayloads(params) {
	const payloads = params.payloads ?? [];
	if (payloads.length === 0) return {
		kind: "suppress",
		reason: "empty"
	};
	const channel = params.deliveryChannel && !isInternalMessageChannel(params.deliveryChannel) ? normalizeChannelId(params.deliveryChannel) ?? params.deliveryChannel : void 0;
	if (!channel) return {
		kind: "deliver",
		payload: payloads
	};
	const applyChannelTransforms = params.applyChannelTransforms ?? true;
	const deliveryPlugin = applyChannelTransforms ? params.plugin : void 0;
	const sessionKey = params.outboundSession?.key ?? params.opts.sessionKey;
	const agentId = params.outboundSession?.agentId ?? resolveSessionAgentId({
		sessionKey,
		config: params.cfg
	});
	const replyPrefix = createReplyPrefixContext({
		cfg: params.cfg,
		agentId,
		channel,
		accountId: params.accountId
	});
	const modelUsed = params.result.meta.agentMeta?.model;
	const providerUsed = params.result.meta.agentMeta?.provider;
	if (params.includeRunModelContext !== false && providerUsed && modelUsed) replyPrefix.onModelSelected({
		provider: providerUsed,
		model: modelUsed,
		thinkLevel: void 0
	});
	const responsePrefixContext = replyPrefix.responsePrefixContextProvider();
	const resolvedResponsePrefix = resolveResponsePrefixTemplate(replyPrefix.responsePrefix, responsePrefixContext);
	const responsePrefix = params.includeRunModelContext === false && resolvedResponsePrefix && UNRESOLVED_RESPONSE_PREFIX_VAR_PATTERN.test(resolvedResponsePrefix) ? void 0 : replyPrefix.responsePrefix;
	const deliveryMessaging = deliveryPlugin?.messaging;
	const transformReplyPayload = createChannelReplyTransform({
		messaging: deliveryMessaging,
		cfg: params.cfg,
		accountId: params.accountId
	});
	const normalizedPayloads = [];
	let suppressionReason;
	for (const payload of payloads) {
		const outcome = normalizeReplyPayloadOutcome(payload, {
			responsePrefix,
			applyChannelTransforms,
			responsePrefixContext,
			transformReplyPayload
		});
		if (outcome.kind === "deliver") normalizedPayloads.push(outcome.payload);
		else if (suppressionReason === void 0 || outcome.reason === "channel_transform") suppressionReason = outcome.reason;
	}
	return normalizedPayloads.length > 0 ? {
		kind: "deliver",
		payload: normalizedPayloads
	} : {
		kind: "suppress",
		reason: suppressionReason ?? "empty"
	};
}
/** Delivers an agent command result or records why delivery was skipped. */
async function deliverAgentCommandResult(params) {
	params.assertDeliveryCurrent?.();
	const { cfg, deps, runtime, opts, outboundSession, sessionEntry, payloads, result } = params;
	const effectiveSessionKey = outboundSession?.key ?? opts.sessionKey;
	const deliveryAgentId = outboundSession?.agentId ?? resolveSessionAgentId({
		sessionKey: effectiveSessionKey,
		config: cfg
	}) ?? resolveDefaultAgentId(cfg);
	const deliver = opts.deliver === true;
	const bestEffortDeliver = opts.bestEffortDeliver === true;
	const turnSourceChannel = opts.runContext?.messageChannel ?? opts.messageChannel;
	const turnSourceTo = opts.runContext?.currentChannelId ?? opts.to;
	const turnSourceAccountId = opts.runContext?.accountId ?? opts.accountId;
	const turnSourceThreadId = opts.runContext?.currentThreadTs ?? opts.threadId;
	const explicitChannelHint = (opts.replyChannel ?? opts.channel)?.trim();
	const resolveDeliveryRouting = async (candidateSessionEntry) => {
		const deliveryPlan = await resolveAgentDeliveryPlanWithSessionRoute({
			cfg,
			agentId: deliveryAgentId,
			currentSessionKey: effectiveSessionKey,
			sessionEntry: candidateSessionEntry,
			requestedChannel: opts.replyChannel ?? opts.channel,
			explicitTo: opts.replyTo ?? opts.to,
			explicitThreadId: opts.threadId,
			accountId: opts.replyAccountId ?? opts.accountId,
			wantsDelivery: deliver,
			preparedPlugin: params.preparedPlugin,
			turnSourceChannel,
			turnSourceTo,
			turnSourceAccountId,
			turnSourceThreadId
		});
		params.assertDeliveryCurrent?.();
		let deliveryChannel = deliveryPlan.resolvedChannel;
		let preparedPlugin = deliveryPlan.plugin;
		if (deliver && isInternalMessageChannel(deliveryChannel) && !explicitChannelHint) try {
			const selection = await resolveMessageChannelSelection({ cfg });
			params.assertDeliveryCurrent?.();
			deliveryChannel = selection.channel;
			preparedPlugin = selection.plugin;
		} catch {}
		const effectiveDeliveryPlan = deliveryChannel === deliveryPlan.resolvedChannel ? deliveryPlan : {
			...deliveryPlan,
			resolvedChannel: deliveryChannel,
			plugin: preparedPlugin
		};
		const deliveryPlugin = deliver && !isInternalMessageChannel(deliveryChannel) ? effectiveDeliveryPlan.plugin ?? getChannelPlugin(normalizeChannelId(deliveryChannel) ?? deliveryChannel) : void 0;
		const pluginDeliveryPlan = deliveryPlugin && deliveryPlugin !== effectiveDeliveryPlan.plugin ? {
			...effectiveDeliveryPlan,
			plugin: deliveryPlugin
		} : effectiveDeliveryPlan;
		const isDeliveryChannelKnown = isInternalMessageChannel(deliveryChannel) || Boolean(deliveryPlugin);
		const targetMode = opts.deliveryTargetMode ?? pluginDeliveryPlan.deliveryTargetMode ?? (opts.to ? "explicit" : "implicit");
		const defaultAccountId = !pluginDeliveryPlan.resolvedAccountId && deliveryPlugin?.config?.listAccountIds ? resolveChannelDefaultAccountId({
			plugin: deliveryPlugin,
			cfg
		}) : void 0;
		const resolvedAccountId = pluginDeliveryPlan.resolvedAccountId ?? defaultAccountId;
		const resolvedDeliveryPlan = resolvedAccountId === pluginDeliveryPlan.resolvedAccountId ? pluginDeliveryPlan : {
			...pluginDeliveryPlan,
			resolvedAccountId
		};
		const resolved = deliver && isDeliveryChannelKnown && deliveryChannel ? resolveAgentOutboundTarget({
			cfg,
			plan: resolvedDeliveryPlan,
			targetMode,
			validateExplicitTarget: true
		}) : {
			resolvedTarget: null,
			resolvedTo: effectiveDeliveryPlan.resolvedTo,
			targetMode
		};
		const resolvedThreadId = deliveryPlan.resolvedThreadId ?? opts.threadId;
		const replyTransport = deliveryPlugin?.threading?.resolveReplyTransport?.({
			cfg,
			accountId: resolvedAccountId,
			threadId: resolvedThreadId
		}) ?? null;
		return {
			deliveryPlan,
			deliveryChannel,
			effectiveDeliveryPlan: resolvedDeliveryPlan,
			deliveryPlugin,
			isDeliveryChannelKnown,
			targetMode,
			defaultAccountId,
			resolvedAccountId,
			resolved,
			resolvedTarget: resolved.resolvedTarget,
			deliveryTarget: resolved.resolvedTo,
			resolvedThreadId,
			resolvedReplyToId: replyTransport?.replyToId ?? void 0,
			resolvedThreadTarget: replyTransport && Object.hasOwn(replyTransport, "threadId") ? replyTransport.threadId ?? null : resolvedThreadId ?? null
		};
	};
	const deliveryRoutingFailureReason = (route) => {
		if (!deliver) return;
		if (isInternalMessageChannel(route.deliveryChannel)) return "channel_resolved_to_internal";
		if (!route.isDeliveryChannelKnown) return "unknown_channel";
		if (route.resolvedTarget && !route.resolvedTarget.ok) return "invalid_delivery_target";
		if (!route.deliveryTarget) return "no_delivery_target";
	};
	const isRetryableFreshSessionRoutingFailure = (route) => {
		const reason = deliveryRoutingFailureReason(route);
		if (!reason) return false;
		if (reason === "unknown_channel") return false;
		return true;
	};
	let deliveryRouting = await resolveDeliveryRouting(sessionEntry);
	params.assertDeliveryCurrent?.();
	if (isRetryableFreshSessionRoutingFailure(deliveryRouting)) {
		const freshSessionEntry = await params.resolveFreshSessionEntryForDelivery?.();
		params.assertDeliveryCurrent?.();
		const expectedFreshSessionId = params.expectedSessionIdForFreshDelivery ?? sessionEntry?.sessionId;
		if (freshSessionEntry && freshSessionEntry !== sessionEntry && isFreshDeliverySessionMatch(freshSessionEntry, expectedFreshSessionId)) {
			const freshRouting = await resolveDeliveryRouting(freshSessionEntry);
			params.assertDeliveryCurrent?.();
			if (!deliveryRoutingFailureReason(freshRouting)) {
				if (!opts.json) runtime.log(`[delivery] refreshed session routing before final delivery (session=${effectiveSessionKey ?? "unknown"} channel=${freshRouting.deliveryChannel})`);
				deliveryRouting = freshRouting;
			}
		}
	}
	const { deliveryChannel, isDeliveryChannelKnown, defaultAccountId, resolvedAccountId, resolvedTarget, deliveryTarget, resolvedReplyToId, resolvedThreadTarget, deliveryPlugin } = deliveryRouting;
	let deliveryLoggedError = false;
	const logDeliveryError = (err) => {
		deliveryLoggedError = true;
		const message = `Delivery failed (${deliveryChannel}${deliveryTarget ? ` to ${deliveryTarget}` : ""}): ${String(err)}`;
		runtime.error?.(message);
		if (!runtime.error) runtime.log(message);
	};
	let strictPreDeliveryError;
	let deliveryStatus;
	const handlePreDeliveryError = (err, reason) => {
		deliveryStatus = preDeliveryFailureStatus(reason);
		if (!bestEffortDeliver) {
			if (opts.json) {
				strictPreDeliveryError = err;
				return;
			}
			throw err;
		}
		logDeliveryError(err);
	};
	if (deliver) {
		if (isInternalMessageChannel(deliveryChannel)) handlePreDeliveryError(/* @__PURE__ */ new Error("delivery channel is required: pass --channel/--reply-channel or use a main session with a previous channel"), "channel_resolved_to_internal");
		else if (!isDeliveryChannelKnown) handlePreDeliveryError(new Error(formatUnknownChannelMessage({ channel: deliveryChannel })), "unknown_channel");
		else if (resolvedTarget && !resolvedTarget.ok) handlePreDeliveryError(resolvedTarget.error, "invalid_delivery_target");
	}
	const replyNormalization = normalizeAgentCommandReplyPayloads({
		cfg,
		opts,
		outboundSession,
		payloads,
		result,
		deliveryChannel,
		plugin: deliveryPlugin,
		accountId: resolvedAccountId,
		applyChannelTransforms: deliver
	});
	const normalizedReplyPayloads = replyNormalization.kind === "deliver" ? replyNormalization.payload : [];
	const canonicalReplyPayloads = projectOutboundPayloadPlanForDelivery(createOutboundPayloadPlan(normalizedReplyPayloads));
	const shouldFilterDeliveredPayloads = deliver && !deliveryStatus && Boolean(deliveryTarget) && !isInternalMessageChannel(deliveryChannel);
	const normalizeSentTexts = (sentTexts) => {
		const outcome = normalizeAgentCommandReplyPayloads({
			cfg,
			opts,
			outboundSession,
			payloads: sentTexts.map((text) => ({ text })),
			result,
			deliveryChannel,
			plugin: deliveryPlugin,
			accountId: resolvedAccountId,
			applyChannelTransforms: deliver,
			includeRunModelContext: false
		});
		return (outcome.kind === "deliver" ? outcome.payload : []).flatMap((payload) => payload.text?.trim() ? [payload.text] : []);
	};
	const filterDeliveredPayloads = (replyPayloads, normalizeMediaPaths) => {
		if (!shouldFilterDeliveredPayloads || !deliveryTarget) return Promise.resolve(replyPayloads);
		return filterAlreadyDeliveredReplyPayloads({
			cfg,
			payloads: replyPayloads,
			result,
			deliveryChannel,
			deliveryTarget,
			accountId: resolvedAccountId,
			sourceAccountId: turnSourceAccountId,
			defaultAccountId,
			threadId: resolvedThreadTarget ?? resolvedReplyToId ?? void 0,
			normalizeMediaPaths,
			normalizeSentTexts
		});
	};
	const rawFilteredReplyPayloads = await filterDeliveredPayloads(canonicalReplyPayloads);
	const mediaNormalization = deliver && !deliveryStatus && !isInternalMessageChannel(deliveryChannel) ? await normalizeReplyMediaPathsForDelivery({
		cfg,
		payloads: rawFilteredReplyPayloads,
		sessionKey: effectiveSessionKey,
		outboundSession,
		deliveryChannel,
		accountId: resolvedAccountId
	}) : { payloads: rawFilteredReplyPayloads };
	const mediaNormalizedReplyPayloads = await filterDeliveredPayloads(mediaNormalization.payloads, mediaNormalization.normalizeMediaPaths);
	params.assertDeliveryCurrent?.();
	const outboundPayloadPlan = createOutboundPayloadPlan(mediaNormalizedReplyPayloads);
	const normalizedPayloads = projectOutboundPayloadPlanForJson(outboundPayloadPlan);
	const captureDeliveryResult = (deliveryResult) => {
		params.onDeliveryResult?.(deliveryResult);
		return deliveryResult;
	};
	const emitJsonEnvelope = (status) => {
		if (!opts.json) return;
		writeRuntimeJson(runtime, {
			...buildOutboundResultEnvelope({
				payloads: normalizedPayloads,
				meta: result.meta
			}),
			...status ? { deliveryStatus: status } : {}
		});
	};
	if (strictPreDeliveryError) {
		emitJsonEnvelope(deliveryStatus);
		captureDeliveryResult(buildDeliveryResult({
			payloads: normalizedPayloads,
			meta: result.meta,
			result,
			deliveryStatus
		}));
		throw toErrorObject(strictPreDeliveryError, "Non-Error thrown");
	}
	const deliveryPayloads = projectOutboundPayloadPlanForOutbound(outboundPayloadPlan);
	if (deliveryPayloads.length === 0) {
		deliveryStatus = deliver ? deliveryStatus ?? noVisiblePayloadStatus(replyNormalization.kind === "suppress" ? replyNormalization.reason : void 0) : void 0;
		const deliverySucceeded = deliveryStatus?.succeeded === true ? true : void 0;
		emitJsonEnvelope(deliveryStatus);
		return captureDeliveryResult(buildDeliveryResult({
			payloads: normalizedPayloads,
			meta: result.meta,
			result,
			deliverySucceeded,
			deliveryStatus
		}));
	}
	let deliverySucceeded = false;
	const logPayload = (payload) => {
		if (opts.json) return;
		const output = formatOutboundPayloadLog(payload);
		if (!output) return;
		if (isNestedAgentLane(opts.lane)) {
			logNestedOutput(runtime, opts, output, effectiveSessionKey);
			return;
		}
		runtime.log(output);
	};
	if (!deliver) {
		for (const payload of deliveryPayloads) logPayload(payload);
		emitJsonEnvelope();
		return captureDeliveryResult(buildDeliveryResult({
			payloads: normalizedPayloads,
			meta: result.meta,
			result
		}));
	}
	if (deliver && deliveryChannel && !isInternalMessageChannel(deliveryChannel)) {
		if (deliveryTarget && !deliveryStatus) {
			params.assertDeliveryCurrent?.();
			const restartAbort = createRestartOnlyAbortSignal(opts.abortSignal);
			let send;
			try {
				send = await sendDurableMessageBatchCore({
					cfg,
					channel: deliveryChannel,
					to: deliveryTarget,
					accountId: resolvedAccountId,
					payloads: deliveryPayloads,
					session: outboundSession,
					identity: resolveAgentOutboundIdentity(cfg, deliveryAgentId),
					replyPayloadSendingHook: {
						kind: "final",
						channel: deliveryChannel,
						...effectiveSessionKey ? { sessionKey: effectiveSessionKey } : {},
						...opts.runId ? { runId: opts.runId } : {},
						context: {
							channelId: deliveryChannel,
							...resolvedAccountId ? { accountId: resolvedAccountId } : {},
							conversationId: deliveryTarget,
							...effectiveSessionKey ? { sessionKey: effectiveSessionKey } : {},
							...opts.runId ? { runId: opts.runId } : {}
						}
					},
					replyToId: resolvedReplyToId ?? null,
					threadId: resolvedThreadTarget ?? null,
					bestEffort: bestEffortDeliver,
					durability: bestEffortDeliver ? "best_effort" : "required",
					signal: restartAbort.signal,
					onDeliveryIntent: restartAbort.dispose,
					onError: logDeliveryError,
					onPayload: logPayload,
					deps: createOutboundSendDeps(deps)
				});
			} finally {
				restartAbort.dispose();
			}
			if (restartAbort.signal?.aborted && send.status === "failed") throw restartAbort.signal.reason;
			deliveryStatus = deliveryStatusFromDurableSend(send);
			if (!bestEffortDeliver && (send.status === "failed" || send.status === "partial_failed")) {
				emitJsonEnvelope(deliveryStatus);
				captureDeliveryResult(buildDeliveryResult({
					payloads: normalizedPayloads,
					meta: result.meta,
					result,
					deliverySucceeded: false,
					deliveryStatus
				}));
				throw send.error;
			}
			deliverySucceeded = send.status === "sent" || send.status === "suppressed";
		}
	}
	if (deliver && !deliveryStatus) deliveryStatus = preDeliveryFailureStatus("no_delivery_target");
	if (deliver && !deliverySucceeded && !opts.json && !deliveryLoggedError) {
		const message = `[delivery] delivery requested but not completed: ${deliveryStatus?.status ?? "unknown"} (reason=${deliveryStatus?.reason ?? "none"} session=${effectiveSessionKey ?? "unknown"} channel=${deliveryChannel ?? "none"} target=${deliveryTarget ?? "none"} payloads=${deliveryPayloads.length})`;
		runtime.error?.(message);
		if (!runtime.error) runtime.log(message);
	}
	emitJsonEnvelope(deliveryStatus);
	return captureDeliveryResult(buildDeliveryResult({
		payloads: normalizedPayloads,
		meta: result.meta,
		result,
		deliverySucceeded,
		deliveryStatus
	}));
}
//#endregion
export { deliverAgentCommandResult };
