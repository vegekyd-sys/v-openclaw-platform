import { ut as stripLeadingInboundMetadata } from "./openclaw-state-db-Bh3Bq87y.js";
import { d as normalizeLegacyInteractiveReply, f as normalizeMessagePresentation, g as renderMessagePresentationChartFallbackText, i as hasReplyChannelData, n as hasLegacyInteractiveReplyBlocks, o as hasReplyPayloadContent, r as hasMessagePresentationBlocks, y as renderMessagePresentationTableFallbackText } from "./payload-DYE7bQ2k.js";
import { T as formatLocationText } from "./reply-payload-y5EgUJuZ.js";
import { a as resolveSendableOutboundReplyParts } from "./reply-payload-parts-ntRzlUkv.js";
import { t as parseReplyDirectives } from "./reply-directives-CgnjbVSt.js";
import { i as isRenderablePayload, o as shouldSuppressReasoningPayload, r as formatBtwTextForExternalDelivery } from "./reply-payloads-BviiIpcn.js";
//#region src/shared/text/citation-control-markers.ts
const UNSUPPORTED_CITATION_CONTROL_MARKER_RE = /cite(?:[^]*)?/g;
const TRAILING_UNSUPPORTED_CITATION_CONTROL_MARKER_RE = /[ \t]*cite(?:[^]*)?(?=\r?\n|$)/g;
/** Removes unsupported model citation-control markers without disturbing normal hard breaks. */
function stripUnsupportedCitationControlMarkers(text) {
	return text.replace(TRAILING_UNSUPPORTED_CITATION_CONTROL_MARKER_RE, "").replace(UNSUPPORTED_CITATION_CONTROL_MARKER_RE, "");
}
//#endregion
//#region src/infra/outbound/payloads.ts
function collectBlockMirrorText(blocks, options = {}) {
	const lines = [];
	for (const block of blocks) {
		if ((block.type === "text" || options.includeContext === true && block.type === "context") && block.text.trim()) {
			lines.push(block.text.trim());
			continue;
		}
		if (block.type === "buttons") {
			for (const button of block.buttons) if (button.label.trim()) lines.push(button.label.trim());
			continue;
		}
		if (block.type === "chart") {
			lines.push(renderMessagePresentationChartFallbackText(block));
			continue;
		}
		if (block.type === "table") {
			lines.push(renderMessagePresentationTableFallbackText(block));
			continue;
		}
		if (block.type === "select") {
			if (block.placeholder?.trim()) lines.push(block.placeholder.trim());
			for (const option of block.options) if (option.label.trim()) lines.push(option.label.trim());
		}
	}
	return lines;
}
function collectPresentationMirrorText(presentation) {
	if (!presentation) return [];
	const lines = [];
	if (presentation.title?.trim()) lines.push(presentation.title.trim());
	lines.push(...collectBlockMirrorText(presentation.blocks, { includeContext: true }));
	return lines;
}
/** Renders user-visible payload content safely for every outbound transcript mirror. */
function resolveOutboundPayloadMirrorText(payload) {
	const text = payload.text?.trim() ? payload.text : payload.location && formatLocationText(payload.location);
	const presentation = normalizeMessagePresentation(payload.presentation);
	if (text?.trim()) return [text, ...presentation ? collectBlockMirrorText(presentation.blocks.filter((block) => block.type === "chart" || block.type === "table")) : []].join("\n");
	const interactive = normalizeLegacyInteractiveReply(payload.interactive);
	return [...collectPresentationMirrorText(presentation), ...collectBlockMirrorText(interactive?.blocks ?? [])].join("\n");
}
function isSuppressedRelayStatusText(text) {
	const normalized = text.trim();
	if (!normalized) return false;
	if (/^no channel reply\.?$/i.test(normalized)) return true;
	if (/^replied in-thread\.?$/i.test(normalized)) return true;
	if (/^replied in #[-\w]+\.?$/i.test(normalized)) return true;
	if (/^updated\s+\[[^\]]*wiki\/[^\]]+\](?:\([^)]+\))?(?:\s+with\b[\s\S]*)?(?:\.\s*)?(?:no channel reply\.?)?$/i.test(normalized)) return true;
	return false;
}
function mergeMediaUrls(...lists) {
	const seen = /* @__PURE__ */ new Set();
	const merged = [];
	for (const list of lists) {
		if (!list) continue;
		for (const entry of list) {
			const trimmed = entry?.trim();
			if (!trimmed) continue;
			if (seen.has(trimmed)) continue;
			seen.add(trimmed);
			merged.push(trimmed);
		}
	}
	return merged;
}
function createOutboundPayloadPlanEntry(payload, context = {}) {
	if (shouldSuppressReasoningPayload(payload)) return null;
	const parsed = parseReplyDirectives(stripLeadingInboundMetadata(payload.text ?? ""), { extractMarkdownImages: context.extractMarkdownImages });
	const explicitMediaUrls = payload.mediaUrls ?? parsed.mediaUrls;
	const explicitMediaUrl = payload.mediaUrl ?? parsed.mediaUrls?.[0];
	const mergedMedia = mergeMediaUrls(explicitMediaUrls, explicitMediaUrl ? [explicitMediaUrl] : void 0, parsed.mediaUrls);
	const strippedText = stripUnsupportedCitationControlMarkers(parsed.text ?? "");
	const strippedParsed = strippedText === (parsed.text ?? "") ? parsed : parseReplyDirectives(strippedText);
	const parsedText = strippedParsed.text ?? "";
	const suppressedText = strippedParsed.isSilent || isSuppressedRelayStatusText(parsedText);
	const resolvedMediaUrl = mergedMedia.length > 1 ? void 0 : explicitMediaUrl;
	const normalizedPayload = {
		...payload,
		text: formatBtwTextForExternalDelivery({
			...payload,
			text: suppressedText ? "" : parsedText
		}) ?? "",
		mediaUrls: mergedMedia.length ? mergedMedia : void 0,
		mediaUrl: resolvedMediaUrl,
		replyToId: payload.replyToId ?? parsed.replyToId,
		replyToTag: payload.replyToTag || parsed.replyToTag,
		replyToCurrent: payload.replyToCurrent || parsed.replyToCurrent,
		audioAsVoice: Boolean(payload.audioAsVoice || parsed.audioAsVoice)
	};
	if (!(suppressedText ? hasReplyPayloadContent(normalizedPayload) : isRenderablePayload(normalizedPayload))) return null;
	const hasChannelData = hasReplyChannelData(normalizedPayload.channelData);
	return {
		payload: normalizedPayload,
		parts: resolveSendableOutboundReplyParts(normalizedPayload),
		hasPresentation: hasMessagePresentationBlocks(normalizedPayload.presentation),
		hasInteractive: hasLegacyInteractiveReplyBlocks(normalizedPayload.interactive),
		hasChannelData
	};
}
/** Builds the canonical outbound payload plan shared by delivery projections. */
function createOutboundPayloadPlan(payloads, context = {}) {
	const plan = [];
	for (const [sourceIndex, payload] of payloads.entries()) {
		const entry = createOutboundPayloadPlanEntry(payload, { extractMarkdownImages: context.extractMarkdownImages });
		if (!entry) continue;
		plan.push({
			sourceIndex,
			...entry
		});
	}
	return plan;
}
/** Projects a payload plan back to normalized reply payloads for delivery. */
function projectOutboundPayloadPlanForDelivery(plan) {
	return plan.map((entry) => entry.payload);
}
/** Projects a payload plan into runtime transport payload summaries. */
function projectOutboundPayloadPlanForOutbound(plan) {
	const normalizedPayloads = [];
	for (const entry of plan) {
		const payload = entry.payload;
		const text = entry.parts.text;
		if (!hasReplyPayloadContent({
			...payload,
			text,
			mediaUrls: entry.parts.mediaUrls
		}, {
			hasChannelData: entry.hasChannelData,
			extraContent: payload.location != null
		})) continue;
		normalizedPayloads.push({
			text,
			mediaUrls: entry.parts.mediaUrls,
			audioAsVoice: payload.audioAsVoice === true ? true : void 0,
			...entry.hasPresentation ? { presentation: payload.presentation } : {},
			...entry.hasPresentation && payload.presentationTextMode ? { presentationTextMode: payload.presentationTextMode } : {},
			...payload.delivery ? { delivery: payload.delivery } : {},
			...entry.hasInteractive ? { interactive: payload.interactive } : {},
			...entry.hasChannelData ? { channelData: payload.channelData } : {},
			...payload.location ? { location: payload.location } : {}
		});
	}
	return normalizedPayloads;
}
/** Projects a payload plan into JSON-safe envelope/debug payloads. */
function projectOutboundPayloadPlanForJson(plan) {
	const normalized = [];
	for (const entry of plan) {
		const payload = entry.payload;
		normalized.push({
			text: entry.parts.text,
			// deepseek-empty-budget-v1
			mediaUrl: payload.mediaUrl ?? null,
			...payload.isError === true ? { isError: true } : {},
			...payload.isReasoning === true ? { isReasoning: true } : {},
			mediaUrls: entry.parts.mediaUrls.length ? entry.parts.mediaUrls : void 0,
			audioAsVoice: payload.audioAsVoice === true ? true : void 0,
			presentation: payload.presentation,
			...payload.presentationTextMode ? { presentationTextMode: payload.presentationTextMode } : {},
			delivery: payload.delivery,
			interactive: payload.interactive,
			channelData: payload.channelData,
			...payload.location ? { location: payload.location } : {}
		});
	}
	return normalized;
}
/** Projects a payload plan into text/media content for session mirroring. */
function projectOutboundPayloadPlanForMirror(plan) {
	return {
		text: plan.map(({ payload }) => resolveOutboundPayloadMirrorText(payload)).filter((text) => Boolean(text)).join("\n"),
		mediaUrls: plan.flatMap((entry) => entry.parts.mediaUrls)
	};
}
/** Summarizes one reply payload for channel transport and hook processing. */
function summarizeOutboundPayloadForTransport(payload) {
	const parts = resolveSendableOutboundReplyParts(payload);
	const text = stripUnsupportedCitationControlMarkers(parts.text);
	const strippedSpokenText = typeof payload.spokenText === "string" ? stripUnsupportedCitationControlMarkers(payload.spokenText) : void 0;
	const spokenText = strippedSpokenText?.trim() ? strippedSpokenText : void 0;
	return {
		text,
		mediaUrls: parts.mediaUrls,
		audioAsVoice: payload.audioAsVoice === true ? true : void 0,
		presentation: payload.presentation,
		...payload.presentationTextMode ? { presentationTextMode: payload.presentationTextMode } : {},
		delivery: payload.delivery,
		interactive: payload.interactive,
		channelData: payload.channelData,
		...payload.location ? { location: payload.location } : {},
		...text || !spokenText ? {} : { hookContent: spokenText }
	};
}
/** Normalizes reply payloads for direct delivery using the shared plan. */
function normalizeReplyPayloadsForDelivery(payloads) {
	return projectOutboundPayloadPlanForDelivery(createOutboundPayloadPlan(payloads));
}
/** Normalizes reply payloads into JSON-safe outbound envelope payloads. */
function normalizeOutboundPayloadsForJson(payloads) {
	return projectOutboundPayloadPlanForJson(createOutboundPayloadPlan(payloads));
}
/** Formats normalized outbound payload text and attachments for logs. */
function formatOutboundPayloadLog(payload) {
	const lines = [];
	if (payload.text) lines.push(payload.text.trimEnd());
	for (const url of payload.mediaUrls) lines.push(`Attachment: ${url}`);
	return lines.join("\n");
}
//#endregion
export { projectOutboundPayloadPlanForDelivery as a, projectOutboundPayloadPlanForOutbound as c, stripUnsupportedCitationControlMarkers as d, normalizeReplyPayloadsForDelivery as i, resolveOutboundPayloadMirrorText as l, formatOutboundPayloadLog as n, projectOutboundPayloadPlanForJson as o, normalizeOutboundPayloadsForJson as r, projectOutboundPayloadPlanForMirror as s, createOutboundPayloadPlan as t, summarizeOutboundPayloadForTransport as u };
