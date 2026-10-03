import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { p as redactSensitiveText } from "./redact-Df68iObN.js";
import { Et as array, Rn as string, Tn as object, dn as literal, wn as number, yt as _enum } from "./schemas-zxit8y5H.js";
import { l as readResponseTextPrefix } from "./http-body-C8wtGPZr.js";
import { h as readProviderTextResponse } from "./provider-http-errors-Bx1_sbMM.js";
import { d as resolveProviderRequestHeaders } from "./provider-request-config-BsyiChYr.js";
import "./response-limit-runtime-DyCIsZbV.js";
import "./security-runtime-D-LGLycn.js";
import "./provider-http-DHxbXo6-.js";
import "./text-utility-runtime-ChP15RP5.js";
import { i as isOpenAIGptLiveModel, o as resolveOpenAIQuicksilverVoice } from "./realtime-quicksilver-BthHSTFW.js";
import { randomBytes } from "node:crypto";
//#region extensions/openai/realtime-quicksilver-wire.ts
const OPENAI_QUICKSILVER_APPEND_MAX_BYTES = 500;
const OPENAI_QUICKSILVER_DELEGATION_RESULT_MAX_CHARS = 1800;
const OPENAI_QUICKSILVER_CONTEXT_MAX_ENTRIES = 16;
const OPENAI_QUICKSILVER_CONTEXT_MAX_ITEM_CHARS = 800;
const OPENAI_QUICKSILVER_CONTEXT_MAX_UTF8_BYTES = 8e3;
const OPENAI_QUICKSILVER_CALL_URL = "https://api.openai.com/v1/live";
const OPENAI_CHATGPT_QUICKSILVER_CALL_URL = "https://chatgpt.com/backend-api/codex/realtime/calls?intent=quicksilver&architecture=avas";
const OPENAI_REALTIME_CALL_URL = "https://api.openai.com/v1/realtime/calls";
const OPENAI_REALTIME_ERROR_BODY_MAX_BYTES = 16384;
const OPENAI_REALTIME_ERROR_DETAIL_MAX_CHARS = 500;
const OPENAI_REALTIME_SDP_ANSWER_MAX_BYTES = 262144;
const OPENAI_REALTIME_LOCATION_MAX_BYTES = 512;
const OPENAI_REALTIME_CALL_ID_RE = /^[A-Za-z0-9_-]{1,128}$/u;
const OPENAI_GPT_LIVE_WAITLIST_URL = "https://openai.com/form/gpt-live-1-in-the-api/";
function redactOpenAIRealtimeErrorDetail(text, auth) {
	let redacted = text;
	const exactSecrets = [auth.token, auth.type === "oauth" ? auth.accountId : void 0];
	for (const secret of exactSecrets) if (secret) redacted = redacted.split(secret).join("[REDACTED]");
	return redactSensitiveText(redacted, { mode: "tools" });
}
const eventEnvelopeSchema = object({ type: string() }).passthrough();
const sessionStartedSchema = object({
	type: literal("session.started"),
	session: object({ expires_at: number().optional() }).passthrough()
}).passthrough();
const transcriptAddedSchema = object({ item: object({ text: string() }).passthrough() }).passthrough();
const outputAudioDeltaSchema = object({
	type: literal("output_audio.delta"),
	audio: string()
}).passthrough();
const turnDoneSchema = object({ turn: object({
	role: _enum(["user", "assistant"]),
	transcript: string()
}).passthrough() }).passthrough();
const delegationSchema = object({
	type: literal("delegation.created"),
	item: object({
		type: string(),
		target: string(),
		id: string().optional(),
		content: array(object({
			type: string(),
			text: string().optional()
		}).passthrough()).optional()
	}).passthrough()
}).passthrough();
var OpenAIQuicksilverCallError = class extends Error {
	constructor(message, status) {
		super(message);
		this.status = status;
		this.name = "OpenAIQuicksilverCallError";
	}
};
function buildOpenAIQuicksilverSession(params) {
	const initialItems = boundOpenAIQuicksilverContextItems(params.initialItems ?? []).map((item) => ({
		type: "message",
		role: item.role,
		content: [{
			type: item.role === "assistant" ? "output_text" : "input_text",
			text: item.text
		}]
	}));
	return {
		model: params.model,
		instructions: params.instructions?.trim() ?? "",
		audio: { output: { voice: resolveOpenAIQuicksilverVoice(params.voice) } },
		delegation: { type: "client" },
		...initialItems && initialItems.length > 0 ? { initial_items: initialItems } : {}
	};
}
/** Builds the direct Frameless Bidi WebSocket handshake used by Codex realtime v3. */
function buildOpenAIQuicksilverSessionUpdate(params) {
	const { model: _model, ...session } = buildOpenAIQuicksilverSession({
		model: "direct-websocket",
		...params
	});
	return {
		type: "session.update",
		session
	};
}
function buildOpenAIQuicksilverWebSocketUrl(model) {
	const url = new URL(OPENAI_QUICKSILVER_CALL_URL);
	url.protocol = "wss:";
	url.searchParams.set("model", model);
	return url.toString();
}
function truncateOpenAIQuicksilverContextText(text, maxBytes) {
	let result = "";
	let bytes = 0;
	let characters = 0;
	for (const character of text) {
		const characterBytes = Buffer.byteLength(character, "utf8");
		if (characters >= OPENAI_QUICKSILVER_CONTEXT_MAX_ITEM_CHARS || bytes + characterBytes > maxBytes) break;
		result += character;
		bytes += characterBytes;
		characters += 1;
	}
	return result;
}
function boundOpenAIQuicksilverContextItems(items) {
	let remainingBytes = OPENAI_QUICKSILVER_CONTEXT_MAX_UTF8_BYTES;
	const newestFirst = [];
	for (let index = items.length - 1; index >= 0 && newestFirst.length < OPENAI_QUICKSILVER_CONTEXT_MAX_ENTRIES; index -= 1) {
		const item = items[index];
		if (!item || remainingBytes <= 0) continue;
		const text = truncateOpenAIQuicksilverContextText(item.text, remainingBytes);
		if (!text) continue;
		newestFirst.push({
			role: item.role,
			text
		});
		remainingBytes -= Buffer.byteLength(text, "utf8");
	}
	return newestFirst.toReversed();
}
function openAIQuicksilverAuthHeaders(auth, requestIds) {
	return openAIRealtimeAuthHeaders({
		auth,
		requestIds,
		baseUrl: OPENAI_QUICKSILVER_CALL_URL,
		includeQuicksilverAlpha: true
	});
}
function openAIRealtimeAuthHeaders(params) {
	return {
		...resolveProviderRequestHeaders({
			provider: "openai",
			baseUrl: params.baseUrl,
			capability: "audio",
			transport: "http",
			defaultHeaders: {}
		}) ?? {},
		Authorization: `Bearer ${params.auth.token}`,
		...params.includeQuicksilverAlpha ? { "OpenAI-Alpha": "quicksilver=v2" } : {},
		"session-id": params.requestIds.sessionId,
		"thread-id": params.requestIds.threadId,
		"x-session-id": params.requestIds.realtimeSessionId,
		...params.auth.type === "oauth" ? { "chatgpt-account-id": params.auth.accountId } : {}
	};
}
function buildOpenAIQuicksilverMultipartBody(params) {
	const sessionJson = JSON.stringify(params.session);
	let boundary;
	do
		boundary = `openclaw-quicksilver-${randomBytes(18).toString("hex")}`;
	while (params.sdp.includes(boundary) || sessionJson.includes(boundary));
	return {
		body: [
			`--${boundary}\r\n`,
			"Content-Disposition: form-data; name=\"sdp\"\r\n",
			"Content-Type: application/sdp\r\n\r\n",
			params.sdp,
			"\r\n",
			`--${boundary}\r\n`,
			"Content-Disposition: form-data; name=\"session\"\r\n",
			"Content-Type: application/json\r\n\r\n",
			sessionJson,
			"\r\n",
			`--${boundary}--\r\n`
		].join(""),
		contentType: `multipart/form-data; boundary=${boundary}`
	};
}
function parseOpenAIRealtimeCallLocation(location) {
	if (!location) throw new Error("OpenAI Realtime call response is missing the Location header");
	if (Buffer.byteLength(location, "utf8") > OPENAI_REALTIME_LOCATION_MAX_BYTES) throw new Error("OpenAI Realtime call response Location header is too large");
	let url;
	try {
		url = new URL(location, OPENAI_REALTIME_CALL_URL);
	} catch {
		throw new Error("OpenAI Realtime call response Location header is invalid");
	}
	if (url.origin !== "https://api.openai.com" || url.search || url.hash) throw new Error("OpenAI Realtime call response Location header has an unexpected target");
	const match = /^\/v1\/realtime\/calls\/([^/]+)\/?$/u.exec(url.pathname);
	if (!match?.[1] || !OPENAI_REALTIME_CALL_ID_RE.test(match[1])) throw new Error("OpenAI Realtime call response Location header has no valid call id");
	return match[1];
}
function buildOpenAIRealtimeSidebandUrl(callId) {
	if (!OPENAI_REALTIME_CALL_ID_RE.test(callId)) throw new Error("OpenAI Realtime call id is invalid");
	const url = new URL("wss://api.openai.com/v1/realtime");
	url.searchParams.set("call_id", callId);
	return url.toString();
}
function isOpenAIQuicksilverCallId(value) {
	return /^rtc_[\w-]+$/.test(value) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function decodeOpenAIQuicksilverCallId(params) {
	const sessionId = params.openAiSessionId?.trim() ?? "";
	if (!params.location) {
		if (isOpenAIQuicksilverCallId(sessionId)) return sessionId;
		throw new OpenAIQuicksilverCallError(sessionId ? "GPT-Live call response returned an invalid openai-session-id" : "GPT-Live call response missing Location and openai-session-id headers");
	}
	let pathname;
	try {
		pathname = new URL(params.location, params.callUrl).pathname;
	} catch {
		if (isOpenAIQuicksilverCallId(sessionId)) return sessionId;
		throw new OpenAIQuicksilverCallError("GPT-Live call response returned an invalid Location");
	}
	const callId = pathname.split("/").filter(Boolean).find(isOpenAIQuicksilverCallId);
	if (!callId) {
		if (isOpenAIQuicksilverCallId(sessionId)) return sessionId;
		throw new OpenAIQuicksilverCallError("GPT-Live call response Location has no valid call id");
	}
	return callId;
}
function describeOpenAIQuicksilverCallError(status, detail, auth) {
	const normalized = detail.toLowerCase();
	if (status === 403) return "GPT-Live rejected the session (403). Verify the selected OpenAI account, model, and GPT-Live voice; this response alone does not identify which was denied.";
	if (status === 400 && auth.type === "api-key" && (normalized.includes("model_not_found") || normalized.includes("does not exist or you do not have access"))) return `OpenAI Platform API-key access to /v1/live is waitlist-gated. Use a ChatGPT OAuth profile or request access at ${OPENAI_GPT_LIVE_WAITLIST_URL}`;
	if (status === 400 && normalized.includes("session.model") && normalized.includes("not allowed")) return "The GPT-Live model value is not permitted. Choose a supported GPT-Live model in Settings > Talk.";
	return `GPT-Live call creation failed (${status})${detail ? `: ${detail}` : ""}`;
}
async function createOpenAIQuicksilverCall(params) {
	const isGptLive = isOpenAIGptLiveModel(params.session.model);
	if (params.gaSideband && (isGptLive || params.auth.type !== "api-key")) throw new Error("OpenAI Realtime Gateway control requires a GA model and Platform API key");
	const chatGptCall = isGptLive && params.auth.type === "oauth";
	const callUrl = chatGptCall ? OPENAI_CHATGPT_QUICKSILVER_CALL_URL : isGptLive ? OPENAI_QUICKSILVER_CALL_URL : OPENAI_REALTIME_CALL_URL;
	const authHeaders = openAIRealtimeAuthHeaders({
		auth: params.auth,
		requestIds: params.requestIds,
		baseUrl: callUrl,
		includeQuicksilverAlpha: isGptLive
	});
	const payload = {
		sdp: params.sdp,
		session: params.session
	};
	const requestBody = chatGptCall ? {
		body: JSON.stringify(payload),
		contentType: "application/json"
	} : buildOpenAIQuicksilverMultipartBody(payload);
	const response = await (params.fetchImpl ?? fetch)(callUrl, {
		method: "POST",
		headers: {
			...authHeaders,
			"Content-Type": requestBody.contentType
		},
		body: requestBody.body,
		signal: params.signal
	});
	if (!response.ok) {
		const providerDetail = await readResponseTextPrefix(response, OPENAI_REALTIME_ERROR_BODY_MAX_BYTES).catch(() => void 0);
		const detail = providerDetail?.truncated ? "" : truncateUtf16Safe(redactOpenAIRealtimeErrorDetail(providerDetail?.text.trim() ?? "", params.auth), OPENAI_REALTIME_ERROR_DETAIL_MAX_CHARS);
		throw new OpenAIQuicksilverCallError(isGptLive ? describeOpenAIQuicksilverCallError(response.status, detail, params.auth) : `OpenAI Realtime call creation failed (${response.status})${detail ? `: ${detail}` : ""}`, response.status);
	}
	const answerSdp = await readProviderTextResponse(response, `${isGptLive ? "GPT-Live" : "OpenAI Realtime"} SDP answer`, { maxBytes: OPENAI_REALTIME_SDP_ANSWER_MAX_BYTES });
	if (!answerSdp.trim()) throw new OpenAIQuicksilverCallError(`${isGptLive ? "GPT-Live" : "OpenAI Realtime"} call creation returned an empty SDP answer`, response.status);
	if (params.gaSideband) {
		const callId = parseOpenAIRealtimeCallLocation(response.headers.get("Location"));
		return {
			kind: "ga-sideband",
			status: response.status,
			answerSdp,
			callId,
			sidebandUrl: buildOpenAIRealtimeSidebandUrl(callId)
		};
	}
	if (!isGptLive) return {
		kind: "ga-realtime",
		status: response.status,
		answerSdp
	};
	const callId = decodeOpenAIQuicksilverCallId({
		location: response.headers.get("Location"),
		openAiSessionId: response.headers.get("openai-session-id"),
		callUrl
	});
	return {
		kind: "gpt-live",
		status: response.status,
		answerSdp,
		callId,
		sidebandUrl: `wss://api.openai.com/v1/live/${callId}`
	};
}
async function hangupOpenAIRealtimeCall(params) {
	if (!OPENAI_REALTIME_CALL_ID_RE.test(params.callId)) throw new Error("OpenAI Realtime call id is invalid");
	const url = `${OPENAI_REALTIME_CALL_URL}/${encodeURIComponent(params.callId)}/hangup`;
	const headers = resolveProviderRequestHeaders({
		provider: "openai",
		baseUrl: url,
		capability: "audio",
		transport: "http",
		defaultHeaders: { Authorization: `Bearer ${params.apiKey}` }
	}) ?? { Authorization: `Bearer ${params.apiKey}` };
	const response = await (params.fetchImpl ?? fetch)(url, {
		method: "POST",
		headers,
		signal: params.signal
	});
	if (!response.ok && response.status !== 404) throw new Error(`OpenAI Realtime call hangup failed (${response.status})`);
	await response.body?.cancel().catch(() => void 0);
}
function readQuicksilverErrorMessage(value) {
	if (typeof value === "string" && value.trim()) return value.trim();
	if (value && typeof value === "object") {
		const record = value;
		if (typeof record.message === "string" && record.message.trim()) return record.message.trim();
		const error = record.error;
		if (error && typeof error === "object") {
			const nestedMessage = error.message;
			if (typeof nestedMessage === "string" && nestedMessage.trim()) return nestedMessage.trim();
		}
		if (typeof error === "string" && error.trim()) return error.trim();
		try {
			const serialized = JSON.stringify(error ?? value);
			if (serialized && serialized !== "{}") return serialized;
		} catch {}
	}
	return "GPT-Live sideband error";
}
function isFatalQuicksilverAuthError(value) {
	if (!value || typeof value !== "object") return false;
	const record = value;
	const error = record.error && typeof record.error === "object" ? record.error : void 0;
	const status = record.status ?? error?.status;
	if (status === 401 || status === "401") return true;
	const code = typeof (record.code ?? error?.code) === "string" ? String(record.code ?? error?.code).toLowerCase() : "";
	return [
		"authentication_error",
		"invalid_api_key",
		"invalid_token",
		"token_expired"
	].includes(code);
}
function parseOpenAIQuicksilverEvent(payload) {
	let decoded;
	try {
		decoded = JSON.parse(payload);
	} catch {
		return null;
	}
	const envelope = eventEnvelopeSchema.safeParse(decoded);
	if (!envelope.success) return null;
	const eventType = envelope.data.type;
	if (eventType === "session.started") {
		const started = sessionStartedSchema.safeParse(decoded);
		if (!started.success) return {
			kind: "ignored",
			eventType
		};
		const expiresAt = started.data.session.expires_at;
		return {
			kind: "session-started",
			...expiresAt !== void 0 ? { expiresAt } : {}
		};
	}
	if (eventType === "input_transcript.added" || eventType === "output_transcript.added") {
		const transcript = transcriptAddedSchema.safeParse(decoded);
		return transcript.success ? {
			kind: "transcript-delta",
			role: eventType === "input_transcript.added" ? "user" : "assistant",
			text: transcript.data.item.text
		} : {
			kind: "ignored",
			eventType
		};
	}
	if (eventType === "turn.done") {
		const turn = turnDoneSchema.safeParse(decoded);
		return turn.success ? {
			kind: "transcript-done",
			role: turn.data.turn.role,
			text: turn.data.turn.transcript
		} : {
			kind: "ignored",
			eventType
		};
	}
	if (eventType === "output_audio.delta") {
		const audio = outputAudioDeltaSchema.safeParse(decoded);
		return audio.success ? {
			kind: "audio",
			data: audio.data.audio
		} : {
			kind: "ignored",
			eventType
		};
	}
	if (eventType === "session.updated") return {
		kind: "ignored",
		eventType
	};
	if (eventType === "delegation.created") {
		const delegation = delegationSchema.safeParse(decoded);
		if (!delegation.success) return {
			kind: "ignored",
			eventType
		};
		const { item } = delegation.data;
		if (item.type !== "delegation" || item.target !== "client" || !item.id) return {
			kind: "ignored",
			eventType
		};
		return {
			kind: "delegation",
			id: item.id,
			prompt: (item.content ?? []).filter((part) => part.type === "input_text").map((part) => part.text ?? "").join("")
		};
	}
	if (eventType === "error") return {
		kind: "error",
		message: readQuicksilverErrorMessage(decoded),
		fatalAuth: isFatalQuicksilverAuthError(decoded)
	};
	return {
		kind: "unknown",
		eventType
	};
}
function chunkOpenAIQuicksilverAppendText(text) {
	if (Buffer.byteLength(text, "utf8") <= OPENAI_QUICKSILVER_APPEND_MAX_BYTES) return [text];
	const chunks = [];
	let current = "";
	let currentBytes = 0;
	for (const character of text) {
		const characterBytes = Buffer.byteLength(character, "utf8");
		if (current && currentBytes + characterBytes > OPENAI_QUICKSILVER_APPEND_MAX_BYTES) {
			chunks.push(current);
			current = "";
			currentBytes = 0;
		}
		current += character;
		currentBytes += characterBytes;
	}
	if (current) chunks.push(current);
	return chunks;
}
/** Bound completed delegation output while preserving under-limit text byte-for-byte. */
function boundOpenAIQuicksilverDelegationResult(text) {
	if (text.length <= OPENAI_QUICKSILVER_DELEGATION_RESULT_MAX_CHARS) return text;
	return `${truncateUtf16Safe(text, 1784).trimEnd()} [truncated]`;
}
//#endregion
export { buildOpenAIQuicksilverWebSocketUrl as a, createOpenAIQuicksilverCall as c, parseOpenAIQuicksilverEvent as d, buildOpenAIQuicksilverSessionUpdate as i, hangupOpenAIRealtimeCall as l, boundOpenAIQuicksilverDelegationResult as n, buildOpenAIRealtimeSidebandUrl as o, buildOpenAIQuicksilverSession as r, chunkOpenAIQuicksilverAppendText as s, boundOpenAIQuicksilverContextItems as t, openAIQuicksilverAuthHeaders as u };
