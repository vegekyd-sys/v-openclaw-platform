import { a as asOptionalRecord, c as isRecord } from "./record-coerce-DItp3I4t.js";
import { c as redactModelVisibleToolPayloadTextWithConfig, d as redactSensitiveFieldValueWithConfig, g as redactToolPayloadTextWithConfig, i as redactInputTextWithSourcePolicy, l as redactSecrets, o as redactModelVisibleSensitiveFieldValueWithConfig, p as redactSensitiveText, y as readLoggingConfig } from "./redact-Df68iObN.js";
import { At as boolean, Et as array, Rn as string, Tn as object, Zn as unknown, dn as literal, wn as number } from "./schemas-zxit8y5H.js";
import { n as findNormalizedProviderValue } from "./provider-id-DMd-TDFp.js";
import { l as runSqliteDeferredTransactionSync } from "./node-sqlite-CL-d6drd.js";
import { a as iterateSqliteQuerySync, n as executeSqliteQuerySync, o as prepareSqliteQuerySync, r as executeSqliteQueryTakeFirstSync } from "./kysely-sync-DKYGT267.js";
import { t as boundedJsonUtf8Bytes } from "./json-utf8-bytes-Bpw3jR_G.js";
import { r as resolveOpenClawAgentSqlitePath } from "./openclaw-agent-db.paths-DYna80bS.js";
import { c as deferOpenClawAgentPostCommitPublication, g as openOpenClawAgentDatabase } from "./openclaw-agent-db-CUTe8BX6.js";
import { t as MODEL_CONTEXT_PRIVATE_METADATA_KEYS } from "./model-context-message-Dmngk3hL.js";
import { n as resolveProviderEndpoint } from "./provider-attribution-CGOGO3H1.js";
import { n as SYNTHETIC_MISSING_TOOL_RESULT_DETAIL_KEY, t as DEFAULT_MISSING_TOOL_RESULT_TEXT } from "./tool-result-pairing-B40RoFjc.js";
import "./version-Bsehiavt.js";
import { r as canonicalizePersistedUserMessageMedia } from "./media-facts-CN7USs9i.js";
import { f as resolveCodeModeExecToolInputKind } from "./code-mode-control-tools-E097WPds.js";
import { n as withOpenClawAgentDatabaseReadOnly } from "./openclaw-agent-db-readonly-wb-jdztx.js";
import { d as resolveSqliteTranscriptReadScope, i as getSessionKysely, m as toDatabaseOptions } from "./session-accessor.sqlite-scope-BwPKGcgm.js";
import { a as readNextTranscriptSeq, c as rotateTranscriptGenerationInTransaction, i as ensureTranscriptSessionRoot, l as touchTranscriptMutationInTransaction, n as deleteTranscriptEventsInTransaction, o as readTranscriptGenerationInTransaction, r as ensureTranscriptGenerationInTransaction, s as readTranscriptMutationStateInTransaction, t as advanceTranscriptMutationAtInTransaction, v as coerceSqliteNumber } from "./session-accessor.sqlite-transcript-state-Cz9g7S9v.js";
import { t as readSessionStateDeleteSnapshot } from "./session-accessor.sqlite-delete-snapshot-D_8sMB0n.js";
import { a as deleteSessionTranscriptIndexInTransaction, c as reconcileSessionTranscriptIndexInTransaction, r as createTranscriptIndexAppenderInTransaction, s as markSessionTranscriptIndexDirtyInTransaction, u as shouldRebuildSessionTranscriptIndexSynchronously } from "./session-transcript-index-9itOio9h.js";
import { i as sanitizeInlineImageDataUrlForStorage, n as sanitizeInlineImageBase64 } from "./inline-image-data-url-BSaoEClB.js";
import { t as extractAssistantPhaseText } from "./chat-message-content-Dws_XUEQ.js";
import { l as isTranscriptOnlyOpenClawAssistantModel } from "./transcript-only-openclaw-assistant-DPLRJnG4.js";
import { r as startSessionTranscriptIndexReconcile } from "./session-transcript-reconcile-j5qhAafV.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { OPENAI_RESPONSES_APIS, readOpenAIResponsesCompactionWindow } from "@openclaw/ai/internal/openai-responses-payload-policy";
import { parseExpressionAt, tokTypes, tokenizer } from "acorn";
//#region src/agents/transcript-code-mode-source.ts
const sourceAppends = /* @__PURE__ */ new WeakMap();
const responseSlots = /* @__PURE__ */ new WeakMap();
const pendingAppends = /* @__PURE__ */ new WeakMap();
function outerCalls(message) {
	return isRecord(message) && message.role === "assistant" && Array.isArray(message.content) ? message.content.filter((block) => isRecord(block) && block.type === "toolCall") : [];
}
/** Capture the prepared tool owner on this response, after provider normalization.
* Unsupported dialects must retain diagnostic masking, even on a marked tool.
*/
function wrapStreamFnCodeModeSource(base, toolNames) {
	const names = new Set(toolNames);
	return async (model, context, options) => {
		const stream = await base(model, context, options);
		const result = stream.result.bind(stream);
		let captured = false;
		const readResult = async () => {
			const message = await result();
			if (captured) return message;
			captured = true;
			const slots = outerCalls(message).flatMap((block) => {
				const language = resolveCodeModeExecToolInputKind(block.arguments);
				if (typeof block.id !== "string" || typeof block.name !== "string" || !names.has(block.name) || !language || !isRecord(block.arguments)) return [];
				const fields = /* @__PURE__ */ new Map();
				for (const key of ["code", "command"]) {
					const value = block.arguments[key];
					if (typeof value === "string") fields.set(key, value);
				}
				return fields.size ? [{
					block,
					id: block.id,
					name: block.name,
					language,
					fields
				}] : [];
			});
			if (!slots.length) return message;
			const token = {};
			sourceAppends.set(token, {
				message,
				slots,
				active: false
			});
			responseSlots.set(message.content, token);
			return message;
		};
		return {
			[Symbol.asyncIterator]: stream[Symbol.asyncIterator].bind(stream),
			result: readResult
		};
	};
}
/** Consume before extension hooks can replace or remove the response's calls. */
function takeCodeModeResponseSource(message) {
	if (message.role !== "assistant") return;
	const token = responseSlots.get(message.content);
	responseSlots.delete(message.content);
	const state = token && sourceAppends.get(token);
	if (state) state.message = message;
	return token;
}
/** Keep the carrier private: public append options and serialized messages gain no fields. */
function prepareCodeModeSourceAppend(options, message, token) {
	if (token && sourceAppends.get(token)?.message === message) pendingAppends.set(options, token);
	return options;
}
function getCodeModeSourceAppend(options) {
	const token = options && pendingAppends.get(options);
	return token && sourceAppends.get(token)?.active ? token : void 0;
}
function copyCodeModeSourceAppendOptions(original, copy) {
	const token = getCodeModeSourceAppend(original);
	if (token) pendingAppends.set(copy, token);
	return copy;
}
/** Consume once at the guard; retained options and nested appends cannot borrow this append. */
function withCodeModeSourceAppend(message, options, append) {
	const token = options && pendingAppends.get(options);
	if (options) pendingAppends.delete(options);
	const state = token && sourceAppends.get(token);
	if (!state || state.message !== message) return append();
	state.active = true;
	try {
		return append(token);
	} finally {
		sourceAppends.delete(token);
	}
}
function readCodeModeSourceFields(message, token) {
	const state = token && sourceAppends.get(token);
	const slots = state?.active && state.message === message ? state.slots : [];
	const calls = outerCalls(message);
	const fields = /* @__PURE__ */ new Map();
	for (const slot of slots) {
		const block = calls.find((call) => call === slot.block);
		if (!block || block.id !== slot.id || block.name !== slot.name || resolveCodeModeExecToolInputKind(block.arguments) !== slot.language || !isRecord(block.arguments) || calls.filter((call) => call.id === slot.id).length !== 1) continue;
		const args = block.arguments;
		fields.set(block, new Map([...slot.fields].filter(([key, value]) => args[key] === value)));
	}
	return fields;
}
/** Hook replacements must retain the exact call objects; only owner-known copies may clone them. */
function copyCodeModeSourceAppend(original, copy, token, transformSource) {
	const state = token && sourceAppends.get(token);
	if (original === copy || !state?.active || state.message !== original) return;
	const originals = outerCalls(original);
	const copies = outerCalls(copy);
	const fieldsByBlock = readCodeModeSourceFields(original, token);
	const slots = [];
	for (const [index, block] of originals.entries()) {
		const fields = fieldsByBlock.get(block);
		const language = resolveCodeModeExecToolInputKind(block.arguments);
		const next = transformSource ? copies[index] : copies.find((call) => call === block);
		if (!fields?.size || !language || !next || next.id !== block.id || next.name !== block.name || resolveCodeModeExecToolInputKind(next.arguments) !== language || typeof next.id !== "string" || typeof next.name !== "string" || !isRecord(next.arguments)) continue;
		const transferred = /* @__PURE__ */ new Map();
		for (const [key, value] of fields) {
			const expected = transformSource ? transformSource(value) : value;
			if (next.arguments[key] === expected) transferred.set(key, expected);
		}
		slots.push({
			block: next,
			id: next.id,
			name: next.name,
			language,
			fields: transferred
		});
	}
	state.message = copy;
	state.slots = slots;
}
//#endregion
//#region src/logging/redact-source.ts
const MAX_SOURCE_REDACTION_SYNTAX_CHARS = 131072;
function createSourceAssignmentMatcher() {
	let parsedText;
	const tokens = /* @__PURE__ */ new Map();
	return (text, offset) => {
		if (text !== parsedText) {
			parsedText = text;
			tokens.clear();
			if (text.length <= MAX_SOURCE_REDACTION_SYNTAX_CHARS) try {
				for (const token of tokenizer(text, { ecmaVersion: "latest" })) tokens.set(token.start, token.type);
			} catch {
				tokens.clear();
			}
		}
		const token = tokens.get(offset);
		if (!token) return false;
		if (token === tokTypes.name) return true;
		try {
			const expression = parseExpressionAt(text, offset, {
				ecmaVersion: "latest",
				allowAwaitOutsideFunction: true
			});
			return expression.type === "Literal" ? typeof expression.value === "boolean" || expression.raw === "null" : expression.type !== "TemplateLiteral";
		} catch {
			return false;
		}
	};
}
function redactSourceInputTextWithConfig(text, loggingConfig) {
	if (text.length > MAX_SOURCE_REDACTION_SYNTAX_CHARS) return redactToolPayloadTextWithConfig(text, loggingConfig);
	return redactInputTextWithSourcePolicy(text, loggingConfig, createSourceAssignmentMatcher());
}
//#endregion
//#region src/sessions/nested-tool-activity.ts
const NESTED_TOOL_ACTIVITY_CUSTOM_TYPE = "openclaw.nested-tool.v1";
const correlationId = string().min(1).max(1024);
const activityDetails = object({
	runId: correlationId,
	scopeId: correlationId,
	afterEntryId: correlationId.nullable(),
	startOrder: number().int().nonnegative(),
	parentToolCallId: correlationId.optional(),
	toolCallId: correlationId,
	toolName: string().min(1).max(256),
	input: unknown(),
	result: object({
		content: array(unknown()),
		details: unknown().optional()
	}),
	isError: boolean(),
	startedAt: number().finite(),
	timestamp: number().finite()
}).strict();
const activitySchema = object({
	role: literal("custom"),
	customType: literal(NESTED_TOOL_ACTIVITY_CUSTOM_TYPE),
	display: literal(true),
	excludeFromContext: literal(true),
	content: literal(""),
	details: activityDetails,
	timestamp: number().finite()
});
/** Validate correlation slots separately from the payloads that always require redaction. */
function readNestedToolActivity(value) {
	if (asOptionalRecord(value)?.customType !== NESTED_TOOL_ACTIVITY_CUSTOM_TYPE) return;
	const parsed = activitySchema.safeParse(value);
	return parsed.success ? parsed.data : void 0;
}
/** Keep each terminal activity bounded independently of provider context. */
function createNestedToolActivity(details) {
	const input = boundedJsonUtf8Bytes(details.input, 8192).complete ? structuredClone(details.input) : "[Nested tool input omitted: exceeds display limit]";
	const result = boundedJsonUtf8Bytes(details.result, 32768).complete ? details.result : { content: [{
		type: "text",
		text: "[Nested tool output omitted: exceeds display limit]"
	}] };
	return activitySchema.parse({
		role: "custom",
		customType: NESTED_TOOL_ACTIVITY_CUSTOM_TYPE,
		display: true,
		excludeFromContext: true,
		content: "",
		details: {
			...details,
			input,
			result
		},
		timestamp: details.startedAt
	});
}
/** Tool-card content for public history. */
function nestedToolActivityContent({ details }) {
	const { input, result, ...call } = details;
	return [{
		type: "toolCall",
		id: call.toolCallId,
		runId: call.runId,
		name: call.toolName,
		arguments: input,
		parentToolCallId: call.parentToolCallId,
		timestamp: call.startedAt
	}, {
		...call,
		...result,
		type: "toolResult"
	}];
}
/** Hooks retain call/result evidence; model snapshots and context engines stay unchanged. */
function projectNestedToolActivityForHooks(messages, activities) {
	return [...messages, ...activities.map((activity) => ({
		...activity,
		content: JSON.stringify({
			scopeId: activity.details.scopeId,
			toolCallId: activity.details.toolCallId,
			toolName: activity.details.toolName,
			isError: activity.details.isError
		})
	}))];
}
//#endregion
//#region src/agents/transcript-redact-images.ts
const isImageMimeType = (value) => typeof value === "string" && /^image\//iu.test(value.trim());
const normalizeImageMimeType = (value) => isImageMimeType(value) ? value.trim().toLowerCase() : void 0;
function imageMimeTypeForRecord(value) {
	return normalizeImageMimeType(value.mimeType) ?? normalizeImageMimeType(value.mediaType) ?? normalizeImageMimeType(value.media_type);
}
function imageMimeTypeFieldsForRecord(value) {
	return [
		"mimeType",
		"mediaType",
		"media_type"
	].filter((key) => isImageMimeType(value[key]));
}
function sanitizeOpaqueImageBase64(base64, mimeType) {
	return mimeType ? sanitizeInlineImageBase64({
		mimeType,
		base64
	}) : void 0;
}
function isValidOpaqueImageBase64(base64, mimeType) {
	return sanitizeOpaqueImageBase64(base64, mimeType) !== void 0;
}
function isOpaqueImageDataBlock(value) {
	return (value.type === "image" || value.type === "base64") && typeof value.data === "string" && isValidOpaqueImageBase64(value.data, imageMimeTypeForRecord(value));
}
function sanitizeTranscriptImageRecord(source) {
	const isImageBlock = source.type === "image";
	const isBase64SourceBlock = source.type === "base64";
	if (!isImageBlock && !isBase64SourceBlock || typeof source.data !== "string") return;
	const mimeTypeFields = imageMimeTypeFieldsForRecord(source);
	if (mimeTypeFields.length === 0) return;
	const sanitized = sanitizeOpaqueImageBase64(source.data, imageMimeTypeForRecord(source));
	if (!sanitized) return;
	const hasCanonicalMimeTypes = mimeTypeFields.every((key) => source[key] === sanitized.mimeType);
	if (source.data === sanitized.base64 && hasCanonicalMimeTypes) return source;
	const next = {
		...source,
		data: sanitized.base64
	};
	for (const field of mimeTypeFields) next[field] = sanitized.mimeType;
	return next;
}
function startsWithDataUrl(value) {
	return value.slice(0, 5).toLowerCase() === "data:";
}
function sanitizeImageDataUrlField(source, key, value) {
	if (!startsWithDataUrl(value)) return;
	return source.type === "input_image" && key === "image_url" || (source.type === "image" || source.type === "image_url") && key === "url" || source.type === "image" && (key === "source" || key === "data") ? sanitizeInlineImageDataUrlForStorage(value) : void 0;
}
function sanitizeTranscriptImageDataUrlField(params) {
	if (params.preserveImageDataUrlFields && params.key === "url") return startsWithDataUrl(params.value) ? sanitizeInlineImageDataUrlForStorage(params.value) : void 0;
	return sanitizeImageDataUrlField(params.source, params.key, params.value);
}
function shouldPreserveTranscriptImagePayload(source, key, item, preserveImageDataUrlFields) {
	if (typeof item !== "string") return false;
	if (key === "data" && isOpaqueImageDataBlock(source)) return true;
	if (preserveImageDataUrlFields && key === "url") return startsWithDataUrl(item) && sanitizeInlineImageDataUrlForStorage(item) !== void 0;
	return sanitizeImageDataUrlField(source, key, item) !== void 0;
}
function shouldPreserveNestedTranscriptImageDataUrlFields(source, key) {
	return key === "image_url" && (source.type === "image_url" || source.type === "input_image" || source.type === "image");
}
//#endregion
//#region src/agents/transcript-redact-replay.ts
const OPENAI_REPLAY_DESCRIPTOR = {
	replayTypes: ["openai-responses-compaction", "openai-responses-retained-compaction"],
	suppressionType: "openai-responses-compaction-suppression",
	matchesRoute: (route, helpers) => helpers.isOpenAIResponsesRoute(route),
	matchesApi: (api, _route, helpers) => typeof api === "string" && helpers.isOpenAIResponsesApi(api),
	sanitizeData: (data, _cfg, helpers) => helpers.isStructurallyValidOpaqueReplayToken(data) ? data : void 0,
	readId: (value, route, helpers) => typeof value.id === "string" && helpers.isOpenAIResponseItemId(value.id, route) ? value.id : void 0
};
const REPLAY_DESCRIPTORS = [OPENAI_REPLAY_DESCRIPTOR, {
	replayTypes: ["anthropic-compaction"],
	suppressionType: "anthropic-compaction-suppression",
	matchesRoute: (route, helpers) => helpers.isAnthropicReasoningRoute(route),
	matchesApi: (api, route) => api === route?.api,
	sanitizeData: (data, cfg, helpers) => data.length > 0 ? helpers.redactTranscriptText(data, cfg) : void 0
}];
function sanitizeCompactedWindow(replay, cfg, helpers) {
	const window = replay.compactedWindow;
	return readOpenAIResponsesCompactionWindow(replay)?.every((item) => {
		if (item.type !== "compaction") return helpers.redactTranscriptStructuredValue(item, cfg) === item;
		const { encrypted_content: _encrypted, ...plaintext } = item;
		return helpers.redactTranscriptStructuredValue(plaintext, cfg) === plaintext;
	}) && window && typeof window === "object" && helpers.isPlainTranscriptObject(window) && typeof window.output === "string" ? {
		state: "ready",
		output: window.output
	} : { state: "refresh-required" };
}
function sanitizeCompactionReplayState(value, route, cfg, helpers) {
	if (!value || typeof value !== "object" || !helpers.isPlainTranscriptObject(value)) return;
	const replayType = typeof value.type === "string" ? value.type : "";
	const descriptor = REPLAY_DESCRIPTORS.find(({ replayTypes, suppressionType }) => replayTypes.includes(replayType) || replayType === suppressionType);
	const isSuppression = value.type === descriptor?.suppressionType;
	if (!descriptor || !descriptor.matchesRoute(route, helpers) || value.v !== 1 || typeof value.data !== "string" || value.type === "openai-responses-retained-compaction" && value.replayIndex !== void 0 || value.replayIndex !== void 0 && (isSuppression || !Number.isSafeInteger(value.replayIndex) || value.replayIndex < 0) || value.provider !== route?.provider || !descriptor.matchesApi(value.api, route, helpers) || value.model !== route?.model || !helpers.isOpenAIReplayContextHash(value.baseUrlHash) || value.sessionHash !== void 0 && !helpers.isOpenAIReplayContextHash(value.sessionHash) || value.authProfileHash !== void 0 && !helpers.isOpenAIReplayContextHash(value.authProfileHash)) return;
	const data = isSuppression ? value.data === "rejected" ? value.data : void 0 : descriptor.sanitizeData(value.data, cfg, helpers);
	if (data === void 0) return;
	const replayId = isSuppression ? void 0 : descriptor.readId?.(value, route, helpers);
	return {
		v: 1,
		type: value.type,
		...replayId !== void 0 ? { id: replayId } : {},
		data,
		...value.replayIndex !== void 0 ? { replayIndex: value.replayIndex } : {},
		provider: value.provider,
		api: value.api,
		model: value.model,
		baseUrlHash: value.baseUrlHash,
		...value.sessionHash !== void 0 ? { sessionHash: value.sessionHash } : {},
		...value.authProfileHash !== void 0 ? { authProfileHash: value.authProfileHash } : {},
		...!isSuppression && descriptor === OPENAI_REPLAY_DESCRIPTOR && value.compactedWindow !== void 0 ? { compactedWindow: sanitizeCompactedWindow({
			data,
			id: replayId,
			compactedWindow: value.compactedWindow
		}, cfg, helpers) } : {}
	};
}
//#endregion
//#region src/agents/transcript-redact.ts
/**
* Agent transcript redaction helpers.
*
* Applies logging redaction rules to persisted messages while preserving unchanged object identity.
*/
function resolveTranscriptLoggingConfig(cfg) {
	const configuredLogging = readLoggingConfig();
	const redactPatterns = cfg?.logging?.redactPatterns ?? configuredLogging?.redactPatterns;
	return redactPatterns ? { redactPatterns } : void 0;
}
function redactTranscriptText(value, cfg, modelVisibleToolResult = false) {
	const loggingConfig = resolveTranscriptLoggingConfig(cfg);
	return modelVisibleToolResult ? redactModelVisibleToolPayloadTextWithConfig(value, loggingConfig) : redactToolPayloadTextWithConfig(value, loggingConfig);
}
function redactTranscriptStructuredFieldValue(key, value, cfg, modelVisibleToolResult = false) {
	return /^(?:next[_-]?)?page[_-]?token$|^page[_-]?cursor$/i.test(key) ? redactTranscriptText(value, cfg, modelVisibleToolResult) : modelVisibleToolResult ? redactModelVisibleSensitiveFieldValueWithConfig(key, value, resolveTranscriptLoggingConfig(cfg)) : redactSensitiveFieldValueWithConfig(key, value, resolveTranscriptLoggingConfig(cfg));
}
function isPlainTranscriptObject(value) {
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}
const GOOGLE_REASONING_APIS = /* @__PURE__ */ new Set([
	"google-generative-ai",
	"google-vertex",
	"google-gemini-cli",
	"openclaw-google-generative-ai-transport"
]);
const ANTHROPIC_REASONING_APIS = /* @__PURE__ */ new Set([
	"anthropic-messages",
	"bedrock-converse-stream",
	"openclaw-anthropic-messages-transport"
]);
const OPENAI_COMPLETIONS_APIS = /* @__PURE__ */ new Set(["openai-completions", "openclaw-openai-completions-transport"]);
const OPAQUE_REPLAY_TOKEN_RE = /^[A-Za-z0-9+/_-]+={0,2}$/;
const GOOGLE_THOUGHT_SIGNATURE_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const OPENAI_REPLAY_CONTEXT_HASH_RE = /^[a-z0-9]{2,16}$/;
function isOpenAIReplayContextHash(value) {
	return typeof value === "string" && OPENAI_REPLAY_CONTEXT_HASH_RE.test(value);
}
function isOpenAIResponsesApi(api) {
	return OPENAI_RESPONSES_APIS.has(api);
}
function isOpenAIResponsesRoute(route) {
	return typeof route?.api === "string" && isOpenAIResponsesApi(route.api);
}
function isGoogleReasoningRoute(route) {
	return typeof route?.api === "string" && GOOGLE_REASONING_APIS.has(route.api);
}
function isAnthropicReasoningRoute(route) {
	return typeof route?.api === "string" && ANTHROPIC_REASONING_APIS.has(route.api);
}
const isOpenAICompletionsRoute = (route) => OPENAI_COMPLETIONS_APIS.has(route?.api ?? "");
function isGoogleOpenAICompletionsRoute(route) {
	return isOpenAICompletionsRoute(route) && (route?.provider === "google" || route?.endpointClass === "google-generative-ai" || route?.endpointClass === "google-vertex");
}
function isVeniceGeminiOpenAICompletionsRoute(route) {
	return isOpenAICompletionsRoute(route) && route?.provider === "venice" && typeof route.model === "string" && /(?:^|\/)gemini-/.test(route.model.trim().toLowerCase());
}
function isCustomProviderRoute(route) {
	return Boolean(route?.api && route.model && route.provider) && route?.api !== "mistral-conversations" && !isOpenAIResponsesRoute(route) && !isGoogleReasoningRoute(route) && !isAnthropicReasoningRoute(route) && !isOpenAICompletionsRoute(route);
}
function isGitHubCopilotResponsesRoute(route) {
	return (route?.api === "openai-responses" || route?.api === "openclaw-openai-responses-transport") && route.provider === "github-copilot";
}
function isStructurallyValidOpaqueReplayToken(value) {
	return value.length > 0 && value === value.trim() && OPAQUE_REPLAY_TOKEN_RE.test(value) && !value.includes("…");
}
function isCredentialSafeOpaqueReplayToken(value) {
	if (!isStructurallyValidOpaqueReplayToken(value)) return false;
	return value.startsWith("gAAAA") || redactSensitiveText(value, { mode: "tools" }) === value;
}
function isGoogleThoughtSignature(value) {
	return value.length > 0 && value === value.trim() && !value.includes("…") && GOOGLE_THOUGHT_SIGNATURE_RE.test(value);
}
function resolveTranscriptAssistantRoute(source, cfg) {
	const api = typeof source.api === "string" ? source.api : void 0;
	const model = typeof source.model === "string" ? source.model : void 0;
	const provider = typeof source.provider === "string" ? source.provider : void 0;
	const providerConfig = provider ? findNormalizedProviderValue(cfg?.models?.providers, provider) : void 0;
	const baseUrl = (model ? providerConfig?.models?.find((candidate) => candidate.id === model) : void 0)?.baseUrl ?? providerConfig?.baseUrl;
	const endpointClass = baseUrl ? resolveProviderEndpoint(baseUrl).endpointClass : void 0;
	return {
		...api ? { api } : {},
		...endpointClass ? { endpointClass } : {},
		...model ? { model } : {},
		...provider ? { provider } : {}
	};
}
function isSafeReplayIdentifier(value, maxLength = 512) {
	return value.length > 0 && value.length <= maxLength && value === value.trim() && /^[A-Za-z0-9+/_:.=-]+$/.test(value) && redactSensitiveText(value, { mode: "tools" }) === value;
}
function isOpenAIResponseItemId(value, route) {
	return isSafeReplayIdentifier(value, isGitHubCopilotResponsesRoute(route) ? 64 : 512);
}
const replaySanitizerHelpers = {
	isAnthropicReasoningRoute,
	isOpenAIReplayContextHash,
	isOpenAIResponseItemId,
	isOpenAIResponsesApi,
	isOpenAIResponsesRoute,
	isPlainTranscriptObject,
	isStructurallyValidOpaqueReplayToken,
	redactTranscriptStructuredValue,
	redactTranscriptText
};
function isOpenAITextSignature(value, route) {
	if (value.startsWith("{")) try {
		const parsed = JSON.parse(value);
		if (!parsed || typeof parsed !== "object" || !isPlainTranscriptObject(parsed)) return false;
		if (!Object.keys(parsed).every((key) => key === "v" || key === "id" || key === "phase")) return false;
		const id = typeof parsed.id === "string" && isOpenAIResponseItemId(parsed.id, route) ? parsed.id : void 0;
		const phase = parsed.phase === "commentary" || parsed.phase === "final_answer" ? parsed.phase : void 0;
		if (parsed.id !== void 0 && id === void 0) return false;
		return parsed.v === 1 && (id !== void 0 || phase !== void 0);
	} catch {
		return false;
	}
	return isOpenAIResponseItemId(value, route);
}
const OPENAI_REASONING_REPLAY_METADATA_KEYS = /* @__PURE__ */ new Set([
	"v",
	"source",
	"provider",
	"api",
	"model",
	"baseUrlHash",
	"sessionHash",
	"authProfileHash"
]);
const OPENAI_REASONING_REPLAY_METADATA_KEY = "__openclaw_replay";
function sanitizeOpenAIReasoningReplayMetadata(value, route) {
	if (!value || typeof value !== "object" || !isPlainTranscriptObject(value) || !route?.api || !route.model || !route.provider) return;
	if (value.v !== 1 || value.source !== "openai-responses" || value.provider !== route?.provider || value.api !== route.api || value.model !== route.model || value.baseUrlHash !== void 0 && !isOpenAIReplayContextHash(value.baseUrlHash) || value.sessionHash !== void 0 && !isOpenAIReplayContextHash(value.sessionHash) || value.authProfileHash !== void 0 && !isOpenAIReplayContextHash(value.authProfileHash)) return;
	if (Object.keys(value).every((key) => OPENAI_REASONING_REPLAY_METADATA_KEYS.has(key))) return value;
	return {
		v: 1,
		source: "openai-responses",
		provider: value.provider,
		api: value.api,
		model: value.model,
		...value.baseUrlHash !== void 0 ? { baseUrlHash: value.baseUrlHash } : {},
		...value.sessionHash !== void 0 ? { sessionHash: value.sessionHash } : {},
		...value.authProfileHash !== void 0 ? { authProfileHash: value.authProfileHash } : {}
	};
}
function shouldPreserveOpaqueProviderPayload(source, key, item, location, route) {
	if (location !== "assistant-content-block" || typeof item !== "string") return false;
	const type = source.type;
	const isAnthropicSlot = type === "thinking" && (key === "thinkingSignature" || key === "signature") || type === "redacted_thinking" && (key === "data" || key === "signature" || key === "thinkingSignature");
	if (isAnthropicReasoningRoute(route) && isAnthropicSlot) return isStructurallyValidOpaqueReplayToken(item);
	const isGoogleSlot = type === "text" && key === "textSignature" || type === "thinking" && (key === "thinkingSignature" || key === "thought_signature") || type === "toolCall" && key === "thoughtSignature";
	if (isGoogleReasoningRoute(route) && isGoogleSlot) return isGoogleThoughtSignature(item);
	if ((isGoogleOpenAICompletionsRoute(route) || isVeniceGeminiOpenAICompletionsRoute(route)) && type === "toolCall" && key === "thoughtSignature") return isStructurallyValidOpaqueReplayToken(item);
	if (!isCustomProviderRoute(route) || !isCredentialSafeOpaqueReplayToken(item)) return false;
	return type === "text" && key === "textSignature" || type === "thinking" && (key === "thinkingSignature" || key === "signature" || key === "thought_signature") || type === "redacted_thinking" && (key === "data" || key === "signature" || key === "thinkingSignature") || type === "toolCall" && key === "thoughtSignature";
}
function sanitizeOpenAIReasoningSignature(value, route) {
	let parsed;
	try {
		parsed = JSON.parse(value);
	} catch {
		return;
	}
	if (!parsed || typeof parsed !== "object" || !isPlainTranscriptObject(parsed) || parsed.type !== "reasoning" || parsed.summary !== void 0 && !Array.isArray(parsed.summary)) return;
	const encryptedContent = parsed.encrypted_content;
	const hasEncryptedContent = Object.hasOwn(parsed, "encrypted_content");
	const isValidEncryptedContent = isOpenAIResponsesRoute(route) ? isStructurallyValidOpaqueReplayToken : isCredentialSafeOpaqueReplayToken;
	if (encryptedContent !== void 0 && encryptedContent !== null && (typeof encryptedContent !== "string" || !isValidEncryptedContent(encryptedContent))) return;
	if (parsed.id !== void 0 && (typeof parsed.id !== "string" || !isOpenAIResponseItemId(parsed.id, route))) return;
	if (parsed.status !== void 0 && parsed.status !== "in_progress" && parsed.status !== "completed" && parsed.status !== "incomplete") return;
	if (!hasEncryptedContent && typeof parsed.id !== "string") return;
	const replayMetadata = sanitizeOpenAIReasoningReplayMetadata(parsed[OPENAI_REASONING_REPLAY_METADATA_KEY], route);
	return JSON.stringify({
		...typeof parsed.id === "string" ? { id: parsed.id } : {},
		type: "reasoning",
		summary: [],
		...parsed.status !== void 0 ? { status: parsed.status } : {},
		...hasEncryptedContent ? { encrypted_content: encryptedContent } : {},
		...replayMetadata ? { [OPENAI_REASONING_REPLAY_METADATA_KEY]: replayMetadata } : {}
	});
}
function sanitizeOpenAICompletionsToolSignature(value, route) {
	let parsed;
	try {
		parsed = JSON.parse(value);
	} catch {
		return;
	}
	const isValidEncryptedData = isOpenAICompletionsRoute(route) ? isStructurallyValidOpaqueReplayToken : isCredentialSafeOpaqueReplayToken;
	if (!parsed || typeof parsed !== "object" || !isPlainTranscriptObject(parsed) || parsed.type !== "reasoning.encrypted" || typeof parsed.data !== "string" || !isValidEncryptedData(parsed.data) || parsed.id !== void 0 && parsed.id !== null && (typeof parsed.id !== "string" || !isSafeReplayIdentifier(parsed.id)) || parsed.format !== void 0 && parsed.format !== null && (typeof parsed.format !== "string" || parsed.format.length > 64 || !/^[a-z0-9.-]+$/.test(parsed.format)) || parsed.index !== void 0 && (!Number.isSafeInteger(parsed.index) || parsed.index < 0)) return;
	return JSON.stringify({
		type: "reasoning.encrypted",
		data: parsed.data,
		...parsed.id !== void 0 ? { id: parsed.id } : {},
		...parsed.format !== void 0 ? { format: parsed.format } : {},
		...parsed.index !== void 0 ? { index: parsed.index } : {}
	});
}
function redactTranscriptStructuredValue(value, cfg, fieldKey, seen = /* @__PURE__ */ new WeakSet(), preserveImageDataUrlFields = false, location = "nested", assistantRoute, modelVisibleToolResult = false, sourceFields, sourceSlots) {
	if (typeof value === "string") {
		if (fieldKey) return redactTranscriptStructuredFieldValue(fieldKey, value, cfg, modelVisibleToolResult);
		return redactTranscriptText(value, cfg, modelVisibleToolResult);
	}
	if (Array.isArray(value)) {
		if (seen.has(value)) return "[Circular]";
		seen.add(value);
		let changed = false;
		const redacted = value.map((item) => {
			const next = redactTranscriptStructuredValue(item, cfg, fieldKey, seen, preserveImageDataUrlFields, location === "assistant-content-array" ? "assistant-content-block" : "nested", assistantRoute, modelVisibleToolResult, void 0, sourceSlots);
			changed ||= next !== item;
			return next;
		});
		seen.delete(value);
		return changed ? redacted : value;
	}
	if (!value || typeof value !== "object") return value;
	if (seen.has(value)) return "[Circular]";
	if (!isPlainTranscriptObject(value)) return value;
	seen.add(value);
	const source = sanitizeTranscriptImageRecord(value) ?? value;
	const currentAssistantRoute = location === "root" && source.role === "assistant" ? resolveTranscriptAssistantRoute(source, cfg) : assistantRoute;
	let next = null;
	if (source !== value) next = { ...source };
	for (const [key, item] of Object.entries(source)) {
		if (location === "root" && key === "idempotencyKey") continue;
		if (typeof item === "string" && (location === "root" && source.role === "toolResult" && key === "toolCallId" || location === "assistant-content-block" && source.type === "toolCall" && key === "id" || location === "nested-tool-details" && (key === "toolCallId" || key === "parentToolCallId" || key === "runId" || key === "scopeId" || key === "afterEntryId"))) continue;
		if (location === "root" && source.role === "assistant" && key === "providerReplay") {
			const sanitizedReplay = sanitizeCompactionReplayState(item, currentAssistantRoute, cfg, replaySanitizerHelpers);
			if (sanitizedReplay !== void 0) {
				if (sanitizedReplay !== item) {
					next ??= { ...source };
					next[key] = sanitizedReplay;
				}
				continue;
			}
			next ??= { ...source };
			delete next[key];
			continue;
		}
		if (location === "assistant-content-block" && (isOpenAIResponsesRoute(currentAssistantRoute) || isCustomProviderRoute(currentAssistantRoute)) && source.type === "thinking" && key === "openclawReasoningReplay") {
			const sanitizedMetadata = sanitizeOpenAIReasoningReplayMetadata(item, currentAssistantRoute);
			if (sanitizedMetadata !== void 0) {
				if (sanitizedMetadata !== item) {
					next ??= { ...source };
					next[key] = sanitizedMetadata;
				}
				continue;
			}
		}
		if (location === "assistant-content-block" && (isOpenAIResponsesRoute(currentAssistantRoute) || isCustomProviderRoute(currentAssistantRoute)) && source.type === "thinking" && key === "thinkingSignature" && typeof item === "string") {
			const sanitizedSignature = sanitizeOpenAIReasoningSignature(item, currentAssistantRoute);
			if (sanitizedSignature !== void 0) {
				if (sanitizedSignature !== item) {
					next ??= { ...source };
					next[key] = sanitizedSignature;
				}
				continue;
			}
		}
		if (location === "assistant-content-block" && (isOpenAIResponsesRoute(currentAssistantRoute) || isOpenAICompletionsRoute(currentAssistantRoute) || isAnthropicReasoningRoute(currentAssistantRoute) || isCustomProviderRoute(currentAssistantRoute)) && source.type === "text" && key === "textSignature" && typeof item === "string" && isOpenAITextSignature(item, currentAssistantRoute)) continue;
		if (location === "assistant-content-block" && (isOpenAICompletionsRoute(currentAssistantRoute) || isCustomProviderRoute(currentAssistantRoute)) && source.type === "toolCall" && key === "thoughtSignature" && typeof item === "string") {
			const sanitizedSignature = sanitizeOpenAICompletionsToolSignature(item, currentAssistantRoute);
			if (sanitizedSignature !== void 0) {
				if (sanitizedSignature !== item) {
					next ??= { ...source };
					next[key] = sanitizedSignature;
				}
				continue;
			}
		}
		if (shouldPreserveOpaqueProviderPayload(source, key, item, location, currentAssistantRoute)) continue;
		if (typeof item === "string") {
			const sanitizedDataUrl = sanitizeTranscriptImageDataUrlField({
				source,
				key,
				value: item,
				preserveImageDataUrlFields
			});
			if (sanitizedDataUrl !== void 0) {
				if (sanitizedDataUrl !== item) {
					next ??= { ...source };
					next[key] = sanitizedDataUrl;
				}
				continue;
			}
		}
		if (shouldPreserveTranscriptImagePayload(source, key, item, preserveImageDataUrlFields)) continue;
		const redacted = typeof item === "string" && sourceFields?.get(key) === item ? redactSourceInputTextWithConfig(item, resolveTranscriptLoggingConfig(cfg)) : redactTranscriptStructuredValue(item, cfg, key, seen, preserveImageDataUrlFields || shouldPreserveNestedTranscriptImageDataUrlFields(source, key), location === "root" && source.role === "assistant" && key === "content" && Array.isArray(item) ? "assistant-content-array" : location === "root" && key === "details" && readNestedToolActivity(source) ? "nested-tool-details" : "nested", currentAssistantRoute, modelVisibleToolResult || location === "root" && source.role === "toolResult" && key === "content", location === "assistant-content-block" && key === "arguments" ? sourceSlots?.get(source) : void 0, sourceSlots);
		if (redacted === item) continue;
		next ??= { ...source };
		next[key] = redacted;
	}
	if (fieldKey === "__openclaw" && next && (next.senderIdentity !== source.senderIdentity || next.senderId !== source.senderId)) delete next.senderIdentity;
	seen.delete(value);
	return next ?? value;
}
/** Return a redacted transcript message according to logging config. */
function redactTranscriptMessage(message, cfg, sourceAppend) {
	const redacted = redactTranscriptStructuredValue(message, cfg, void 0, /* @__PURE__ */ new WeakSet(), false, "root", void 0, false, void 0, readCodeModeSourceFields(message, sourceAppend));
	copyCodeModeSourceAppend(message, redacted, sourceAppend, (source) => redactSourceInputTextWithConfig(source, resolveTranscriptLoggingConfig(cfg)));
	return redacted;
}
//#endregion
//#region src/config/sessions/session-model-context-projection.ts
/** Exclude storage-only fields in SQLite, before a row's JSON crosses into JavaScript. */
function projectModelContextEventSql(event, omitCheckpoint) {
	const paths = MODEL_CONTEXT_PRIVATE_METADATA_KEYS.map((key) => `$.message.__openclaw.${key}`);
	const projected = sql`json_remove(${event}, ${sql.join(paths)})`;
	const modelEvent = sql`CASE WHEN json_extract(${event}, '$.message.role') = 'toolResult'
    THEN json_remove(${projected}, '$.message.details') ELSE ${projected} END`;
	return sql`CASE WHEN ${omitCheckpoint} = 1
    THEN json_remove(${modelEvent}, '$.message.providerReplay') ELSE ${modelEvent} END`;
}
function pickJsonObject(value, keys) {
	return sql`(SELECT json_group_object(key, CASE type
    WHEN 'object' THEN json(value) WHEN 'array' THEN json(value)
    WHEN 'true' THEN json('true') WHEN 'false' THEN json('false')
    ELSE value END) FROM json_each(${value}) WHERE key IN (${sql.join(keys)}))`;
}
const TRANSCRIPT_NAVIGATION_KEYS = [
	"type",
	"id",
	"parentId",
	"targetId",
	"appendParentId",
	"appendMode"
];
/** Cursor resolution needs only tree facts, even when a row has an opaque body. */
function projectTranscriptNavigationSql(event) {
	return pickJsonObject(event, TRANSCRIPT_NAVIGATION_KEYS);
}
/** Reset boundaries select ancestry and replay roles without loading message bodies. */
function projectResetBoundaryNavigationSql(event) {
	const entry = pickJsonObject(event, [
		...TRANSCRIPT_NAVIGATION_KEYS,
		"timestamp",
		"firstKeptEntryId"
	]);
	return sql`CASE WHEN json_valid(${event}) THEN
    CASE WHEN json_type(${event}) = 'object' THEN
      json_set(${entry}, '$.message', json_object('role', json_extract(${event}, '$.message.role')))
    ELSE ${event} END
    ELSE ${event} END`;
}
/** Lightweight tree/state records; these never serve as persisted transcript evidence. */
function projectModelContextNavigationSql(event) {
	const entry = pickJsonObject(event, [
		...TRANSCRIPT_NAVIGATION_KEYS,
		"timestamp",
		"version",
		"cwd",
		"firstKeptEntryId",
		"reason",
		"tokensBefore",
		"thinkingLevel",
		"provider",
		"modelId",
		"fromId",
		"customType",
		"display",
		"label",
		"name"
	]);
	const messageFacts = pickJsonObject(sql`json_extract(${event}, '$.message')`, [
		"role",
		"provider",
		"model",
		"timestamp",
		"excludeFromContext",
		"toolCallId",
		"toolUseId",
		"tool_call_id",
		"tool_use_id",
		"callId",
		"call_id",
		"toolName",
		"isError",
		"stopReason",
		"customType",
		"display"
	]);
	const calls = sql`(SELECT json_group_array(json_object(
    'type', json_extract(value, '$.type'), 'id', json_extract(value, '$.id'),
    'name', json_extract(value, '$.name')))
    FROM json_each(${event}, '$.message.content') WHERE type = 'object'
    AND json_extract(value, '$.type') IN ('toolCall', 'toolUse', 'functionCall'))`;
	const synthetic = sql`COALESCE(json_extract(${event}, ${`$.message.details.${SYNTHETIC_MISSING_TOOL_RESULT_DETAIL_KEY}`}), 0) = 1 OR EXISTS (
    SELECT 1 FROM json_each(${event}, '$.message.content') WHERE type = 'object'
    AND json_extract(value, '$.type') = 'text' AND json_extract(value, '$.text') = ${DEFAULT_MISSING_TOOL_RESULT_TEXT})`;
	return sql`CASE json_extract(${event}, '$.type')
    WHEN 'message' THEN json_set(${entry}, '$.message', json_set(${messageFacts},
      '$.content', json(${calls}), '$.command', '', '$.output', '',
      '$.providerReplay', json_object('type', json_extract(${event}, '$.message.providerReplay.type')),
      '$.details', json_object(${SYNTHETIC_MISSING_TOOL_RESULT_DETAIL_KEY}, json(CASE WHEN (${synthetic}) THEN 'true' ELSE 'false' END))))
    WHEN 'custom_message' THEN json_set(${entry}, '$.content', json('[]'))
    WHEN 'compaction' THEN json_set(${entry}, '$.summary', '')
    WHEN 'branch_summary' THEN json_set(${entry}, '$.summary', '')
    ELSE ${entry} END`;
}
//#endregion
//#region src/config/sessions/session-transcript-read-fence.ts
const transcriptReadFenceStorage = new AsyncLocalStorage();
var SessionTranscriptReadFenceError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "SessionTranscriptReadFenceError";
	}
};
function runWithSessionTranscriptReadFence(receipt, run) {
	return receipt ? transcriptReadFenceStorage.run(receipt, run) : run();
}
function resolveSessionTranscriptReadFence(session) {
	const receipt = transcriptReadFenceStorage.getStore();
	return receipt?.agentId === session.agentId && receipt.sessionId === session.sessionId ? receipt : void 0;
}
function resolveSqliteSessionTranscriptReadFence(params) {
	const receipt = resolveSessionTranscriptReadFence(params);
	if (!receipt) return;
	if (receipt.role !== "user") throw new SessionTranscriptReadFenceError(`Current-turn transcript admission is not a user message: ${receipt.entryId}`);
	if (params.database.path !== receipt.storePath) throw new SessionTranscriptReadFenceError("Current-turn transcript admission belongs to a different transcript store");
	if (params.sessionKey !== void 0 && params.sessionKey !== receipt.sessionKey) throw new SessionTranscriptReadFenceError("Current-turn transcript admission belongs to a different session key");
	const db = getSessionKysely(params.database.db);
	const boundary = executeSqliteQueryTakeFirstSync(params.database.db, db.selectFrom("transcript_event_identities as identity").innerJoin("session_transcript_active_events as active", (join) => join.onRef("active.session_id", "=", "identity.session_id").onRef("active.event_seq", "=", "identity.seq")).innerJoin("transcript_events as event", (join) => join.onRef("event.session_id", "=", "identity.session_id").onRef("event.seq", "=", "identity.seq")).innerJoin("transcript_rewrite_watermarks as rewrite", (join) => join.onRef("rewrite.session_id", "=", "identity.session_id")).select([
		"identity.seq",
		"identity.parent_id",
		"active.message_position",
		"rewrite.generation",
		sql`json_extract(event.event_json, '$.type')`.as("event_type"),
		sql`json_extract(event.event_json, '$.message.role')`.as("message_role")
	]).where("identity.session_id", "=", params.sessionId).where("identity.event_id", "=", receipt.entryId).limit(1));
	if (boundary?.message_position === null || boundary?.message_position === void 0) throw new SessionTranscriptReadFenceError(`Current-turn transcript admission is no longer a visible message: ${receipt.entryId}`);
	if (boundary.generation !== receipt.generation || boundary.seq !== receipt.rawSeq || boundary.parent_id !== receipt.effectiveParentId || boundary.message_position !== receipt.activeMessagePosition) throw new SessionTranscriptReadFenceError(`Current-turn transcript admission identity changed: ${receipt.entryId}`);
	if (boundary.event_type !== "message" || boundary.message_role !== "user") throw new SessionTranscriptReadFenceError(`Current-turn transcript admission is not a user message: ${receipt.entryId}`);
	return {
		admission: receipt,
		beforeActiveMessagePosition: boundary.message_position,
		beforeRawSeq: boundary.seq
	};
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-read.ts
function createTranscriptIdentityReader(database, sessionId) {
	const read = prepareSqliteQuerySync(database.db, (parameter) => getSessionKysely(database.db).selectFrom("transcript_event_identities").select([
		"event_id",
		"parent_id",
		"seq"
	]).where("session_id", "=", sessionId).where("event_id", "=", parameter((eventId) => eventId)));
	return (eventId) => {
		const row = read(eventId).rows[0];
		return row ? {
			eventId: row.event_id,
			parentId: row.parent_id,
			seq: row.seq
		} : void 0;
	};
}
function readTranscriptIdentityByEventId(database, sessionId, eventId) {
	return createTranscriptIdentityReader(database, sessionId)(eventId);
}
/** Loads raw transcript events from the additive SQLite transcript store. */
async function loadTranscriptEvents(scope) {
	return loadTranscriptEventsSync(scope);
}
/** Loads raw transcript events synchronously from the additive SQLite transcript store. */
function loadTranscriptEventsSync(scope) {
	const resolved = resolveSqliteTranscriptReadScope(scope);
	const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
	return runSqliteDeferredTransactionSync(database.db, () => {
		const fence = resolveSqliteSessionTranscriptReadFence({
			database,
			...resolved
		});
		return loadTranscriptEventsFromDatabase(database, resolved.sessionId, { beforeEventSeq: fence?.beforeRawSeq });
	}, {
		databaseLabel: database.path,
		operationLabel: "session transcript fenced read"
	});
}
/** Reads a complete transcript and its lifecycle snapshot from one SQLite read transaction. */
function inspectTranscriptEventsSync(scope) {
	const resolved = resolveSqliteTranscriptReadScope(scope);
	const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
	return runSqliteDeferredTransactionSync(database.db, () => ({
		events: readTranscriptSnapshot(database, resolved.sessionId).events,
		snapshot: readSessionStateDeleteSnapshot(database.db, resolved.sessionId)
	}), {
		databaseLabel: database.path,
		operationLabel: "session transcript inspection"
	});
}
/** Loads only the first transcript row for header metadata hot paths. */
function loadTranscriptHeaderSync(scope) {
	const resolved = resolveSqliteTranscriptReadScope(scope);
	const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
	const db = getSessionKysely(database.db);
	const row = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_events").select("event_json").where("session_id", "=", resolved.sessionId).orderBy("seq", "asc").limit(1));
	return row ? JSON.parse(row.event_json) : void 0;
}
/** Loads a bounded newest tail in storage order for hot-path accounting. */
function loadTranscriptTailEventsSync(scope, maxEvents) {
	const limit = Number.isFinite(maxEvents) ? Math.max(0, Math.floor(maxEvents)) : 0;
	if (limit === 0) return [];
	const resolved = resolveSqliteTranscriptReadScope(scope);
	const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
	const db = getSessionKysely(database.db);
	return executeSqliteQuerySync(database.db, db.selectFrom("transcript_events").select("event_json").where("session_id", "=", resolved.sessionId).orderBy("seq", "desc").limit(limit)).rows.toReversed().map((row) => JSON.parse(row.event_json));
}
/** Loads additive transcript rows after one durable sequence checkpoint. */
function loadTranscriptEventRowsAfterSeqSync(scope, afterSeq, throughSeq) {
	const resolved = resolveSqliteTranscriptReadScope(scope);
	const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
	let query = getSessionKysely(database.db).selectFrom("transcript_events").select(["event_json", "seq"]).where("session_id", "=", resolved.sessionId).where("seq", ">", afterSeq);
	if (throughSeq !== void 0) query = query.where("seq", "<=", throughSeq);
	return executeSqliteQuerySync(database.db, query.orderBy("seq", "asc")).rows.map((row) => ({
		event: JSON.parse(row.event_json),
		seq: coerceSqliteNumber(row.seq)
	}));
}
/** Reads one checkpoint row so incremental consumers can reject transcript rewrites. */
function readTranscriptEventAtSeqSync(scope, seq) {
	const resolved = resolveSqliteTranscriptReadScope(scope);
	const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
	const db = getSessionKysely(database.db);
	const row = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_events").select(["event_json", "seq"]).where("session_id", "=", resolved.sessionId).where("seq", "=", seq));
	return row ? {
		event: JSON.parse(row.event_json),
		seq: coerceSqliteNumber(row.seq)
	} : void 0;
}
function loadTranscriptEventsFromDatabase(database, sessionId, options = {}) {
	const { beforeEventSeq } = options;
	const db = getSessionKysely(database.db);
	const rows = iterateSqliteQuerySync(database.db, db.selectFrom("transcript_events").select((eb) => [options.projection === "reset-boundary" ? projectResetBoundaryNavigationSql(eb.ref("event_json")).as("event_json") : "event_json"]).where("session_id", "=", sessionId).$if(beforeEventSeq !== void 0, (query) => query.where("seq", "<", beforeEventSeq)).orderBy("seq", "asc"));
	return Array.from(rows, (row) => JSON.parse(row.event_json));
}
function readTranscriptSnapshot(database, sessionId) {
	const rows = readTranscriptEventRows(database, sessionId);
	return {
		events: rows.map((row) => JSON.parse(row.eventJson)),
		rows
	};
}
/** Reads transcript rows without decoding payloads for snapshot comparison. */
function readTranscriptEventRows(database, sessionId) {
	const db = getSessionKysely(database.db);
	return executeSqliteQuerySync(database.db, db.selectFrom("transcript_events").select(["event_json", "seq"]).where("session_id", "=", sessionId).orderBy("seq", "asc")).rows.map((row) => ({
		eventJson: row.event_json,
		seq: coerceSqliteNumber(row.seq)
	}));
}
/** Reads exact transcript storage rows for guarded doctor rewrites. */
function readTranscriptStorageRows(database, sessionId) {
	const db = getSessionKysely(database.db);
	return executeSqliteQuerySync(database.db, db.selectFrom("transcript_events").select([
		"created_at",
		"event_json",
		"seq"
	]).where("session_id", "=", sessionId).orderBy("seq", "asc")).rows.map((row) => ({
		createdAt: coerceSqliteNumber(row.created_at),
		eventJson: row.event_json,
		seq: coerceSqliteNumber(row.seq)
	}));
}
function sqliteTranscriptJsonlByteSize() {
	return sql`COALESCE(SUM(OCTET_LENGTH(event_json)), 0)
    + CASE WHEN COUNT(*) > 0 THEN COUNT(*) - 1 ELSE 0 END`.as("size_bytes");
}
/** Reads transcript freshness and byte size without materializing event rows. */
function readTranscriptStatsFromDatabase(database, sessionId) {
	const db = getSessionKysely(database.db);
	const row = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_events").select((eb) => [
		eb.fn.count("seq").as("event_count"),
		eb.fn.max("seq").as("max_seq"),
		sqliteTranscriptJsonlByteSize()
	]).where("session_id", "=", sessionId));
	const session = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("session_windows").select(["transcript_observed_at", "transcript_updated_at"]).where("session_id", "=", sessionId));
	return {
		eventCount: row?.event_count ?? 0,
		...session?.transcript_updated_at !== null && session?.transcript_updated_at !== void 0 ? { lastMutationAtMs: session.transcript_updated_at } : {},
		...session?.transcript_observed_at !== null && session?.transcript_observed_at !== void 0 ? { lastObservedMutationAtMs: session.transcript_observed_at } : {},
		maxSeq: row?.max_seq ?? 0,
		sizeBytes: row?.size_bytes ?? 0
	};
}
/** Reads transcript freshness and byte size without materializing event rows. */
function readTranscriptStatsSync(scope) {
	const resolved = resolveSqliteTranscriptReadScope(scope);
	return readTranscriptStatsFromDatabase(openOpenClawAgentDatabase(toDatabaseOptions(resolved)), resolved.sessionId);
}
/** Read transcript stats in database groups without joining the writable lifecycle. */
function readTranscriptStatsBatchReadOnlySync(scopes) {
	const results = scopes.map(() => null);
	const groups = /* @__PURE__ */ new Map();
	for (const [index, scope] of scopes.entries()) {
		const resolved = resolveSqliteTranscriptReadScope(scope);
		const options = toDatabaseOptions(resolved);
		const pathname = resolveOpenClawAgentSqlitePath(options);
		const key = `${options.agentId}\0${pathname}`;
		const group = groups.get(key) ?? {
			options,
			items: []
		};
		group.items.push({
			index,
			sessionId: resolved.sessionId
		});
		groups.set(key, group);
	}
	for (const group of groups.values()) if (!withOpenClawAgentDatabaseReadOnly((database) => {
		for (const item of group.items) results[item.index] = readTranscriptStatsFromDatabase(database, item.sessionId);
	}, group.options).found) for (const item of group.items) results[item.index] = null;
	return results;
}
/** Reads the latest visible assistant text from SQLite transcript rows in reverse order. */
function loadLatestAssistantText(scope, options = {}) {
	const resolved = resolveSqliteTranscriptReadScope(scope);
	const database = openOpenClawAgentDatabase(toDatabaseOptions(resolved));
	return runSqliteDeferredTransactionSync(database.db, () => {
		const db = getSessionKysely(database.db);
		const beforeEventSeq = resolveSqliteSessionTranscriptReadFence({
			database,
			...resolved
		})?.beforeRawSeq;
		const rows = iterateSqliteQuerySync(database.db, db.selectFrom("transcript_events as te").innerJoin("transcript_event_identities as ti", (join) => join.onRef("ti.session_id", "=", "te.session_id").onRef("ti.seq", "=", "te.seq")).select("te.event_json as event_json").where("te.session_id", "=", resolved.sessionId).where("ti.event_type", "=", "message").$if(beforeEventSeq !== void 0, (query) => query.where("ti.seq", "<", beforeEventSeq)).orderBy("ti.seq", "desc"));
		for (const row of rows) {
			const latest = parseLatestAssistantMessageEvent(row.event_json, options);
			if (!latest) continue;
			const text = parseLatestAssistantText(latest);
			if (text) return text;
		}
	}, {
		databaseLabel: database.path,
		operationLabel: "latest assistant fenced read"
	});
}
function parseLatestAssistantText(latest) {
	const message = latest.message;
	const text = extractAssistantPhaseText(latest.message)?.trim();
	if (!text) return;
	return {
		...latest.id ? { id: latest.id } : {},
		text,
		...typeof message.timestamp === "number" && Number.isFinite(message.timestamp) ? { timestamp: message.timestamp } : {}
	};
}
function parseLatestAssistantMessageEvent(raw, options = {}) {
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return;
	}
	const message = parsed.message;
	if (!message || message.role !== "assistant") return;
	if (!options.includeTranscriptOnlyOpenClawAssistant && isTranscriptOnlyOpenClawAssistantModel(message.provider, message.model)) return;
	return {
		...typeof parsed.id === "string" && parsed.id.trim() ? { id: parsed.id } : {},
		message
	};
}
/** Finds the newest transcript record accepted by the matcher without parsing older rows. */
async function findTranscriptEvent(scope, match) {
	const resolved = resolveSqliteTranscriptReadScope(scope);
	return findTranscriptEventInDatabase(openOpenClawAgentDatabase(toDatabaseOptions(resolved)), resolved.sessionId, match);
}
function findTranscriptEventInDatabase(database, sessionId, match) {
	const db = getSessionKysely(database.db);
	const rows = iterateSqliteQuerySync(database.db, db.selectFrom("transcript_events").select(["event_json"]).where("session_id", "=", sessionId).orderBy("seq", "desc"));
	for (const row of rows) try {
		const event = JSON.parse(row.event_json);
		if (match(event)) return { event };
	} catch {}
}
function readTranscriptEventMessage(event) {
	if (!event || typeof event !== "object" || Array.isArray(event)) return;
	const message = event.message;
	return message && typeof message === "object" && !Array.isArray(message) ? message : void 0;
}
function readTranscriptEventId(event) {
	if (!event || typeof event !== "object" || Array.isArray(event)) return;
	const id = event.id;
	return typeof id === "string" && id.trim() ? id : void 0;
}
//#endregion
//#region src/config/sessions/transcript-header.ts
/** Creates a session transcript header entry with current version metadata. */
function createSessionTranscriptHeader(params = {}) {
	return {
		type: "session",
		version: 3,
		id: params.sessionId ?? randomUUID(),
		timestamp: params.timestamp ?? (/* @__PURE__ */ new Date()).toISOString(),
		cwd: params.cwd ?? process.cwd(),
		...params.parentSession ? { parentSession: params.parentSession } : {}
	};
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-transcript-store.ts
function createTranscriptEventInserter(database, sessionId) {
	return prepareSqliteQuerySync(database.db, (parameter) => getSessionKysely(database.db).insertInto("transcript_events").values({
		session_id: sessionId,
		seq: parameter((row) => row.seq),
		event_json: parameter((row) => row.eventJson),
		created_at: parameter((row) => row.createdAt)
	}));
}
function createTranscriptIdentityInserter(database, sessionId, ignoreConflicts) {
	return prepareSqliteQuerySync(database.db, (parameter) => getSessionKysely(database.db).insertInto("transcript_event_identities").values({
		session_id: sessionId,
		event_id: parameter((row) => row.eventId),
		seq: parameter((row) => row.seq),
		event_type: parameter((row) => row.eventType),
		parent_id: parameter((row) => row.parentId),
		message_idempotency_key: parameter((row) => row.messageIdempotencyKey),
		created_at: parameter((row) => row.createdAt)
	}).$if(ignoreConflicts, (query) => query.onConflict((conflict) => conflict.columns(["session_id", "event_id"]).doNothing())));
}
function appendTranscriptEventInTransaction(database, scope, event, options = {}) {
	return appendTranscriptEvent(database, scope, event, options);
}
function appendTranscriptEvent(database, scope, event, options, cursor = {}) {
	const persistedEvent = canonicalizeTranscriptEventMedia(event);
	const db = getSessionKysely(database.db);
	const createdAt = readEventTimestamp(persistedEvent) ?? Date.now();
	if (cursor.initialized) {
		cursor.updateWindow ??= prepareSqliteQuerySync(database.db, (parameter) => db.updateTable("session_windows").set({ updated_at: parameter((timestamp) => timestamp) }).where("session_id", "=", scope.sessionId));
		cursor.updateWindow(createdAt);
	} else {
		ensureTranscriptSessionRoot(database, scope, createdAt, { allowStoredAlias: options.allowStoredAlias === true });
		ensureTranscriptGenerationInTransaction(database, scope.sessionId);
		cursor.initialized = true;
	}
	const identity = readTranscriptEventIdentity(persistedEvent);
	if (identity) {
		cursor.readIdentity ??= createTranscriptIdentityReader(database, scope.sessionId);
		if (cursor.readIdentity(identity.eventId)) return false;
	}
	const idempotencyKeyOwner = identity?.messageIdempotencyKey ? readIdempotencyKeyOwner(database, scope.sessionId, identity.messageIdempotencyKey) : void 0;
	if (idempotencyKeyOwner && options.idempotencyKeyMode === "dedupe") return false;
	const seq = cursor.nextSeq ?? readNextTranscriptSeq(database, scope.sessionId);
	cursor.insertEvent ??= createTranscriptEventInserter(database, scope.sessionId);
	cursor.insertEvent({
		seq,
		eventJson: JSON.stringify(persistedEvent),
		createdAt
	});
	cursor.nextSeq = seq + 1;
	if (options.touchMutation !== false) touchTranscriptMutationInTransaction(database, scope.sessionId);
	cursor.appendToIndex ??= createTranscriptIndexAppenderInTransaction(database.db, scope.sessionId);
	const projectionNeedsRebuild = cursor.appendToIndex({
		seq,
		event: persistedEvent,
		eventId: identity?.eventId ?? null,
		createdAt
	});
	if (projectionNeedsRebuild) options.onProjectionReconcileNeeded?.();
	if (identity) {
		if (idempotencyKeyOwner && options.idempotencyKeyMode === "relocate-owner") executeSqliteQuerySync(database.db, db.updateTable("transcript_event_identities").set({ message_idempotency_key: null }).where("session_id", "=", scope.sessionId).where("event_id", "=", idempotencyKeyOwner.eventId));
		identity.messageIdempotencyKey = idempotencyKeyOwner && options.idempotencyKeyMode !== "relocate-owner" ? null : identity.messageIdempotencyKey;
		cursor.insertIdentity ??= createTranscriptIdentityInserter(database, scope.sessionId, true);
		cursor.insertIdentity({
			...identity,
			seq,
			createdAt
		});
	}
	scheduleTranscriptProjectionReconcile(database, scope.sessionId, projectionNeedsRebuild, options);
	return true;
}
function scheduleTranscriptProjectionReconcile(database, sessionId, projectionNeedsRebuild, options) {
	if (!projectionNeedsRebuild || options.scheduleProjectionReconcile === false) return;
	deferOpenClawAgentPostCommitPublication(database, () => startSessionTranscriptIndexReconcile({
		agentId: database.agentId,
		path: database.path,
		preferredSessionId: sessionId
	}));
}
function appendTranscriptEventsInTransaction(database, scope, events, options = {}) {
	let appended = 0;
	let projectionNeedsRebuild = false;
	const cursor = {};
	const iterator = events[Symbol.iterator]();
	const appendOptions = {
		...options,
		onProjectionReconcileNeeded: () => {
			projectionNeedsRebuild = true;
		},
		scheduleProjectionReconcile: false,
		touchMutation: false
	};
	try {
		let next = iterator.next();
		while (!next.done) {
			const inserted = appendTranscriptEvent(database, scope, next.value, appendOptions, cursor);
			if (inserted) appended += 1;
			next = iterator.next(inserted);
		}
	} catch (error) {
		try {
			iterator.return?.();
		} catch {}
		throw error;
	}
	if (appended > 0) {
		if (options.touchMutation !== false) touchTranscriptMutationInTransaction(database, scope.sessionId);
		scheduleTranscriptProjectionReconcile(database, scope.sessionId, projectionNeedsRebuild, options);
	}
	return appended;
}
function appendTranscriptEventRowInTransaction(event, seq, state, createdAtOverride) {
	const persistedEvent = canonicalizeTranscriptEventMedia(event);
	const createdAt = createdAtOverride ?? readEventTimestamp(persistedEvent) ?? Date.now();
	const identity = readTranscriptEventIdentity(persistedEvent);
	if (identity && state.seenEventIds.has(identity.eventId)) return false;
	state.insertEvent({
		seq,
		eventJson: JSON.stringify(persistedEvent),
		createdAt
	});
	state.appendToIndex({
		seq,
		event: persistedEvent,
		eventId: identity?.eventId ?? null,
		createdAt
	});
	if (!identity) return true;
	state.seenEventIds.add(identity.eventId);
	if (identity.messageIdempotencyKey) {
		if (state.seenMessageIdempotencyKeys.has(identity.messageIdempotencyKey)) identity.messageIdempotencyKey = null;
		else state.seenMessageIdempotencyKeys.add(identity.messageIdempotencyKey);
	}
	state.insertIdentity({
		...identity,
		seq,
		createdAt
	});
	return true;
}
function ensureTranscriptHeader(database, scope, cwd) {
	const db = getSessionKysely(database.db);
	if (executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_events").select("seq").where("session_id", "=", scope.sessionId).limit(1))) return;
	appendTranscriptEventInTransaction(database, scope, createSessionTranscriptHeader({
		cwd,
		sessionId: scope.sessionId
	}));
}
function replaceSqliteTranscriptEventsInTransaction(database, resolved, events, options = {}) {
	const rebuildSynchronously = events.length > 0 && shouldRebuildSessionTranscriptIndexSynchronously(database.db, resolved.sessionId, events);
	const preservedTranscriptUpdatedAt = options.preserveSessionWindowRecency === true ? readTranscriptMutationStateInTransaction(database, resolved.sessionId).updatedAt : void 0;
	const previousGeneration = readTranscriptGenerationInTransaction(database, resolved.sessionId);
	const deleted = deleteTranscriptEventsInTransaction(database, resolved.sessionId);
	if (events.length === 0) {
		deleteSessionTranscriptIndexInTransaction(database.db, resolved.sessionId);
		if (deleted || previousGeneration) {
			rotateTranscriptGenerationInTransaction(database, resolved.sessionId);
			recordTranscriptReplacementMutation(database, resolved.sessionId, preservedTranscriptUpdatedAt);
		}
		return;
	}
	if (!deleted || options.preserveSessionWindowRecency !== true) ensureTranscriptSessionRoot(database, resolved, readEventTimestamp(events[0]) ?? Date.now());
	if (deleted || previousGeneration) rotateTranscriptGenerationInTransaction(database, resolved.sessionId);
	else ensureTranscriptGenerationInTransaction(database, resolved.sessionId);
	if (rebuildSynchronously) deleteSessionTranscriptIndexInTransaction(database.db, resolved.sessionId);
	else markSessionTranscriptIndexDirtyInTransaction(database.db, resolved.sessionId);
	let seq = 0;
	const state = {
		seenEventIds: /* @__PURE__ */ new Set(),
		seenMessageIdempotencyKeys: /* @__PURE__ */ new Set(),
		insertEvent: createTranscriptEventInserter(database, resolved.sessionId),
		insertIdentity: createTranscriptIdentityInserter(database, resolved.sessionId, false),
		appendToIndex: createTranscriptIndexAppenderInTransaction(database.db, resolved.sessionId)
	};
	for (const [eventIndex, event] of events.entries()) if (appendTranscriptEventRowInTransaction(event, seq, state, options.createdAtByIndex?.[eventIndex])) seq += 1;
	if (deleted || seq > 0) {
		recordTranscriptReplacementMutation(database, resolved.sessionId, preservedTranscriptUpdatedAt);
		if (rebuildSynchronously) reconcileSessionTranscriptIndexInTransaction(database.db, resolved.sessionId);
		else scheduleTranscriptProjectionReconcile(database, resolved.sessionId, true, {});
	}
}
function recordTranscriptReplacementMutation(database, sessionId, preservedUpdatedAt) {
	if (preservedUpdatedAt === void 0 || preservedUpdatedAt === null) {
		touchTranscriptMutationInTransaction(database, sessionId);
		return;
	}
	advanceTranscriptMutationAtInTransaction(database, sessionId, preservedUpdatedAt, { strictly: true });
}
/** Rewrite existing transcript rows exactly, without append-time deduplication. */
function rewriteSqliteTranscriptEventRowsInTransaction(database, resolved, rows) {
	if (rows.length === 0) return;
	const rebuildSynchronously = shouldRebuildSessionTranscriptIndexSynchronously(database.db, resolved.sessionId);
	const db = getSessionKysely(database.db);
	for (const row of rows) {
		const persistedEvent = canonicalizeTranscriptEventMedia(row.event);
		if (executeSqliteQuerySync(database.db, db.updateTable("transcript_events").set({ event_json: JSON.stringify(persistedEvent) }).where("session_id", "=", resolved.sessionId).where("seq", "=", row.seq).where("event_json", "=", row.expectedEventJson)).numAffectedRows !== 1n) throw new Error(`Transcript row ${resolved.sessionId}:${row.seq} changed before exact rewrite`);
	}
	rotateTranscriptGenerationInTransaction(database, resolved.sessionId);
	touchTranscriptMutationInTransaction(database, resolved.sessionId);
	if (rebuildSynchronously) {
		deleteSessionTranscriptIndexInTransaction(database.db, resolved.sessionId);
		reconcileSessionTranscriptIndexInTransaction(database.db, resolved.sessionId);
	} else {
		markSessionTranscriptIndexDirtyInTransaction(database.db, resolved.sessionId);
		scheduleTranscriptProjectionReconcile(database, resolved.sessionId, true, {});
	}
}
function updateSqliteTranscriptEventJsonInTransaction(database, sessionId, updates) {
	if (updates.length === 0) return;
	const rebuildSynchronously = shouldRebuildSessionTranscriptIndexSynchronously(database.db, sessionId);
	const db = getSessionKysely(database.db);
	for (const { seq, eventJson } of updates) executeSqliteQuerySync(database.db, db.updateTable("transcript_events").set({ event_json: eventJson }).where("session_id", "=", sessionId).where("seq", "=", seq));
	rotateTranscriptGenerationInTransaction(database, sessionId);
	if (rebuildSynchronously) {
		deleteSessionTranscriptIndexInTransaction(database.db, sessionId);
		reconcileSessionTranscriptIndexInTransaction(database.db, sessionId);
	} else markSessionTranscriptIndexDirtyInTransaction(database.db, sessionId);
	const currentUpdatedAt = readTranscriptMutationStateInTransaction(database, sessionId).updatedAt;
	if (currentUpdatedAt === null) touchTranscriptMutationInTransaction(database, sessionId);
	else advanceTranscriptMutationAtInTransaction(database, sessionId, currentUpdatedAt, { strictly: true });
	scheduleTranscriptProjectionReconcile(database, sessionId, !rebuildSynchronously, {});
}
function readIdempotencyKeyOwner(database, sessionId, idempotencyKey) {
	const db = getSessionKysely(database.db);
	const row = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_event_identities").select(["event_id", "seq"]).where("session_id", "=", sessionId).where("message_idempotency_key", "=", idempotencyKey).orderBy("seq", "desc").limit(1));
	return row ? {
		eventId: row.event_id,
		seq: row.seq
	} : void 0;
}
function readTranscriptMessageByIdempotencyKey(database, scope, idempotencyKey) {
	const identity = readIdempotencyKeyOwner(database, scope.sessionId, idempotencyKey);
	return identity ? readTranscriptMessageByIdentity(database, scope, identity) : void 0;
}
function readTranscriptMessageByScopedIdempotencyKey(database, scope, idempotencyKey, lookup) {
	if (lookup !== "scan-assistant") return readTranscriptMessageByIdempotencyKey(database, scope, idempotencyKey);
	const found = findTranscriptEventInDatabase(database, scope.sessionId, (event) => {
		const message = readTranscriptEventMessage(event);
		return message?.role === "assistant" && message.idempotencyKey === idempotencyKey;
	});
	if (!found) return;
	const message = readTranscriptEventMessage(found.event);
	return message ? {
		messageId: readTranscriptEventId(found.event) ?? idempotencyKey,
		message
	} : void 0;
}
function readTranscriptMessageByEventId(database, scope, eventId) {
	const identity = readTranscriptIdentityByEventId(database, scope.sessionId, eventId);
	return identity ? readTranscriptMessageByIdentity(database, scope, identity) : void 0;
}
function readTranscriptMessageByIdentity(database, scope, identity) {
	const db = getSessionKysely(database.db);
	const eventRow = executeSqliteQueryTakeFirstSync(database.db, db.selectFrom("transcript_events").select(["event_json"]).where("session_id", "=", scope.sessionId).where("seq", "=", identity.seq));
	if (!eventRow) return;
	const event = JSON.parse(eventRow.event_json);
	return {
		messageId: identity.eventId,
		message: event.message
	};
}
function readTranscriptEventIdentity(event) {
	if (!isRecord(event)) return;
	const eventId = typeof event.id === "string" && event.id.trim() ? event.id.trim() : void 0;
	return eventId ? {
		eventId,
		eventType: typeof event.type === "string" ? event.type : null,
		parentId: typeof event.parentId === "string" ? event.parentId : null,
		messageIdempotencyKey: readMessageIdempotencyKey(event.message)
	} : void 0;
}
function canonicalizeTranscriptEventMedia(event) {
	if (!isRecord(event)) return event;
	const message = event.message;
	if (event.type !== "message" || !isRecord(message)) return event;
	const canonical = canonicalizePersistedUserMessageMedia(message);
	return canonical.changed ? {
		...event,
		message: canonical.message
	} : event;
}
function readMessageIdempotencyKey(message) {
	if (!isRecord(message)) return null;
	const value = message.idempotencyKey;
	return typeof value === "string" && value.trim() ? value.trim() : null;
}
function readEventTimestamp(event) {
	if (!isRecord(event)) return;
	const value = event.timestamp;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "string" || !value.trim()) return;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : void 0;
}
function redactTranscriptMessageForStorage(message, options) {
	return isTranscriptAgentMessage(message) ? redactTranscriptMessage(message, options.config, getCodeModeSourceAppend(options)) : redactSecrets(message);
}
function isTranscriptAgentMessage(value) {
	return isRecord(value) && typeof value.role === "string";
}
//#endregion
export { readTranscriptStatsSync as A, nestedToolActivityContent as B, readTranscriptEventAtSeqSync as C, readTranscriptIdentityByEventId as D, readTranscriptEventRows as E, projectModelContextEventSql as F, getCodeModeSourceAppend as G, readNestedToolActivity as H, projectModelContextNavigationSql as I, withCodeModeSourceAppend as J, prepareCodeModeSourceAppend as K, projectTranscriptNavigationSql as L, SessionTranscriptReadFenceError as M, resolveSqliteSessionTranscriptReadFence as N, readTranscriptSnapshot as O, runWithSessionTranscriptReadFence as P, redactTranscriptMessage as R, loadTranscriptTailEventsSync as S, readTranscriptEventMessage as T, copyCodeModeSourceAppend as U, projectNestedToolActivityForHooks as V, copyCodeModeSourceAppendOptions as W, wrapStreamFnCodeModeSource as Y, loadTranscriptEventRowsAfterSeqSync as _, readMessageIdempotencyKey as a, loadTranscriptEventsSync as b, redactTranscriptMessageForStorage as c, updateSqliteTranscriptEventJsonInTransaction as d, createSessionTranscriptHeader as f, loadLatestAssistantText as g, inspectTranscriptEventsSync as h, ensureTranscriptHeader as i, readTranscriptStorageRows as j, readTranscriptStatsBatchReadOnlySync as k, replaceSqliteTranscriptEventsInTransaction as l, findTranscriptEventInDatabase as m, appendTranscriptEventsInTransaction as n, readTranscriptMessageByEventId as o, findTranscriptEvent as p, takeCodeModeResponseSource as q, createTranscriptEventInserter as r, readTranscriptMessageByScopedIdempotencyKey as s, appendTranscriptEventInTransaction as t, rewriteSqliteTranscriptEventRowsInTransaction as u, loadTranscriptEvents as v, readTranscriptEventId as w, loadTranscriptHeaderSync as x, loadTranscriptEventsFromDatabase as y, createNestedToolActivity as z };
