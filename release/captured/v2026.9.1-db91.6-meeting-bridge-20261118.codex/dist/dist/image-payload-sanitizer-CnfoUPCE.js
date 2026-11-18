import { isRecord } from "openclaw/plugin-sdk/string-coerce-runtime";
import { INLINE_IMAGE_DATA_URL_PREFIX, sanitizeInlineImageDataUrl } from "openclaw/plugin-sdk/inline-image-data-url-runtime";
//#region extensions/codex/src/app-server/image-payload-sanitizer.ts
/**
* Sanitizes inline image payloads mirrored through Codex history so invalid
* base64 data becomes readable text instead of poisoning replayed transcripts.
*/
const IMAGE_OMITTED_TEXT = "omitted image payload: invalid inline image data";
/** Validates and normalizes an inline image data URL for Codex history payloads. */
function sanitizeInlineImageDataUrl$1(imageUrl) {
	return sanitizeInlineImageDataUrl(imageUrl);
}
/** Builds the replacement text inserted when an inline image payload is invalid. */
function invalidInlineImageText(label) {
	return `[${label}] ${IMAGE_OMITTED_TEXT}`;
}
function sanitizeImageContentRecord(record, label) {
	if (record.type === "image" && typeof record.data === "string") {
		const mimeType = typeof record.mimeType === "string" ? record.mimeType : "image/png";
		const imageUrl = sanitizeInlineImageDataUrl$1(`data:${mimeType};base64,${record.data}`);
		if (!imageUrl) return {
			type: "text",
			text: invalidInlineImageText(label)
		};
		const commaIndex = imageUrl.indexOf(",");
		const mime = imageUrl.slice(INLINE_IMAGE_DATA_URL_PREFIX.length, commaIndex).split(";")[0] ?? mimeType;
		return {
			...record,
			mimeType: mime,
			data: imageUrl.slice(commaIndex + 1)
		};
	}
	if (record.type === "inputImage" && typeof record.imageUrl === "string") {
		const imageUrl = sanitizeInlineImageDataUrl$1(record.imageUrl);
		return imageUrl ? {
			...record,
			imageUrl
		} : {
			type: "inputText",
			text: invalidInlineImageText(label)
		};
	}
	if (record.type === "input_image" && typeof record.image_url === "string") {
		const imageUrl = sanitizeInlineImageDataUrl$1(record.image_url);
		return imageUrl ? {
			...record,
			image_url: imageUrl
		} : {
			type: "input_text",
			text: invalidInlineImageText(label)
		};
	}
}
/** Recursively sanitizes all Codex history image shapes while preserving unknown structure. */
function sanitizeCodexHistoryImagePayloads(value, label) {
	if (Array.isArray(value)) return value.map((entry) => sanitizeCodexHistoryImagePayloads(entry, label));
	if (!isRecord(value)) return value;
	const imageRecord = sanitizeImageContentRecord(value, label);
	if (imageRecord) return imageRecord;
	const next = {};
	for (const [key, child] of Object.entries(value)) next[key] = sanitizeCodexHistoryImagePayloads(child, label);
	return next;
}
//#endregion
export { sanitizeCodexHistoryImagePayloads as n, sanitizeInlineImageDataUrl$1 as r, invalidInlineImageText as t };
