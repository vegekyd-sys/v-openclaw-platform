import { g as readStringValue } from "./string-coerce-CIXf7egm.js";
//#region src/shared/chat-message-content.ts
/** Returns inline string content or the first array text block without scanning later blocks. */
function extractFirstTextBlock(message) {
	if (!message || typeof message !== "object") return;
	const content = message.content;
	const inline = readStringValue(content);
	if (inline !== void 0) return inline;
	if (!Array.isArray(content) || content.length === 0) return;
	const first = content[0];
	if (!first || typeof first !== "object") return;
	return readStringValue(first.text);
}
const assistantTextSignatureCache = /* @__PURE__ */ new WeakMap();
function isAssistantTextContentBlockType(value) {
	return value === "text" || value === "input_text" || value === "output_text";
}
/** Narrows unknown phase metadata to assistant text phases that affect visibility. */
function normalizeAssistantPhase(value) {
	return value === "commentary" || value === "final_answer" ? value : void 0;
}
/** Parses assistant text block signatures, preserving legacy raw ids when not JSON encoded. */
function parseAssistantTextSignature(block) {
	const value = block.textSignature;
	const cached = assistantTextSignatureCache.get(block);
	if (cached && cached.text === value) return cached.result;
	let result;
	if (typeof value !== "string" || value.trim().length === 0) result = null;
	else if (!value.startsWith("{")) result = { id: value };
	else try {
		const parsed = JSON.parse(value);
		result = parsed.v === 1 ? {
			...typeof parsed.id === "string" ? { id: parsed.id } : {},
			...normalizeAssistantPhase(parsed.phase) ? { phase: normalizeAssistantPhase(parsed.phase) } : {}
		} : null;
	} catch {
		result = null;
	}
	assistantTextSignatureCache.set(block, {
		text: value,
		result
	});
	return result;
}
/** Resolves a message phase only when the top-level phase or all explicit blocks agree. */
function resolveAssistantMessagePhase(message) {
	if (!message || typeof message !== "object") return;
	const entry = message;
	const directPhase = normalizeAssistantPhase(entry.phase);
	if (directPhase) return directPhase;
	if (!Array.isArray(entry.content)) return;
	let explicitPhase;
	for (const block of entry.content) {
		if (!block || typeof block !== "object") continue;
		const record = block;
		if (!isAssistantTextContentBlockType(record.type)) continue;
		const phase = parseAssistantTextSignature(record)?.phase;
		if (phase) {
			if (explicitPhase && explicitPhase !== phase) return;
			explicitPhase = phase;
		}
	}
	return explicitPhase;
}
/** Finds assistant phase metadata on event payloads that may wrap message-like records. */
function resolveAssistantEventPhase(data) {
	if (!data || typeof data !== "object") return;
	const record = data;
	return normalizeAssistantPhase(record.phase) ?? resolveAssistantMessagePhase(record.message) ?? resolveAssistantMessagePhase(record.partial) ?? resolveAssistantMessagePhase(record.item) ?? resolveAssistantMessagePhase(record);
}
/** Extracts assistant text for a requested phase without mixing legacy and explicitly phased text. */
function extractAssistantTextForPhase(message, options) {
	if (!message || typeof message !== "object") return;
	const entry = message;
	const messagePhase = normalizeAssistantPhase(entry.phase);
	const phase = options?.phase;
	const shouldIncludeContent = (resolvedPhase) => {
		if (phase) return resolvedPhase === phase;
		return resolvedPhase === void 0;
	};
	const sanitizeText = options?.sanitizeText;
	const joinWith = options?.joinWith ?? "\n";
	const sanitizeBlockText = (text) => sanitizeText ? sanitizeText(text) : text;
	const normalizeJoinedText = (text) => {
		return text.trim() || void 0;
	};
	if (typeof entry.text === "string") {
		if (!shouldIncludeContent(messagePhase)) return;
		return normalizeJoinedText(sanitizeBlockText(entry.text));
	}
	if (typeof entry.content === "string") {
		if (!shouldIncludeContent(messagePhase)) return;
		return normalizeJoinedText(sanitizeBlockText(entry.content));
	}
	if (!Array.isArray(entry.content)) return;
	const hasExplicitPhasedTextBlocks = entry.content.some((block) => {
		if (!block || typeof block !== "object") return false;
		const record = block;
		if (!isAssistantTextContentBlockType(record.type)) return false;
		return Boolean(parseAssistantTextSignature(record)?.phase);
	});
	if (!phase && hasExplicitPhasedTextBlocks) return;
	const parts = entry.content.map((block) => {
		if (!block || typeof block !== "object") return null;
		const record = block;
		if (!isAssistantTextContentBlockType(record.type) || typeof record.text !== "string") return null;
		const resolvedPhase = parseAssistantTextSignature(record)?.phase ?? (hasExplicitPhasedTextBlocks ? void 0 : messagePhase);
		if (!shouldIncludeContent(resolvedPhase)) return null;
		const sanitized = sanitizeBlockText(record.text);
		return sanitized.trim() ? sanitized : null;
	}).filter((value) => typeof value === "string");
	if (parts.length === 0) return;
	return normalizeJoinedText(parts.join(joinWith));
}
/** Returns user-visible assistant text, preferring final answers over legacy unphased text. */
function extractAssistantPhaseText(message) {
	const finalAnswerText = extractAssistantTextForPhase(message, { phase: "final_answer" });
	if (finalAnswerText) return finalAnswerText;
	return extractAssistantTextForPhase(message);
}
//#endregion
export { parseAssistantTextSignature as a, normalizeAssistantPhase as i, extractAssistantTextForPhase as n, resolveAssistantEventPhase as o, extractFirstTextBlock as r, resolveAssistantMessagePhase as s, extractAssistantPhaseText as t };
