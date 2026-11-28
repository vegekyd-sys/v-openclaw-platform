// v-codex-suppressed-prompt-finalization-v1
import { d as serializeCodexMirrorSourceEvidence } from "./transcript-mirror-DTUxFWa_.js";
import { i as readUpstreamUserText, r as readMirrorIdentity } from "./upstream-prompt-provenance-LphB8slG.js";
import { t as readCodexMirroredSessionHistory } from "./session-history-C5J1AKzG.js";
import { isRecord, normalizeOptionalString } from "openclaw/plugin-sdk/string-coerce-runtime";
import { embeddedAgentLog, formatErrorMessage } from "openclaw/plugin-sdk/agent-harness-runtime";
import { Buffer } from "node:buffer";
//#region extensions/codex/src/app-server/settled-turn-projection.ts
const MAX_RESPONSE_ITEMS = 200;
const MAX_PROJECTION_BYTES = 524288;
const MAX_TEXT_BYTES = 65536;
const TOOL_NAME_PATTERN = /^[a-zA-Z0-9._-]{1,128}$/u;
const TOOL_ERROR_STATUS_PREFIX = "[Tool result status: error]\n";
function readBoundedText(value, label, maxBytes = MAX_TEXT_BYTES) {
	if (typeof value !== "string" || !value.trim()) return;
	if (Buffer.byteLength(value, "utf8") > maxBytes) throw new Error(`Codex settled-turn projection found oversized ${label}`);
	return value;
}
function requireBoundedText(value, label, maxBytes = MAX_TEXT_BYTES) {
	const text = readBoundedText(value, label, maxBytes);
	if (!text) throw new Error(`Codex settled-turn projection found empty ${label}`);
	return text;
}
function responseItemBytes(item) {
	return Buffer.byteLength(JSON.stringify(item), "utf8");
}
function requireCallId(value) {
	const callId = normalizeOptionalString(value);
	if (!callId || callId.length > 256) throw new Error("Codex settled-turn projection found an invalid tool call id");
	return callId;
}
function requireToolName(value) {
	const name = normalizeOptionalString(value);
	if (!name || !TOOL_NAME_PATTERN.test(name)) throw new Error(`Codex settled-turn projection found an invalid tool name${name ? `: ${name.slice(0, 64)}` : ""}`);
	return name;
}
function serializeToolArguments(value) {
	if (typeof value === "string") {
		let parsed;
		try {
			parsed = JSON.parse(value);
		} catch {
			throw new Error("Codex settled-turn projection found invalid JSON tool arguments");
		}
		if (!isRecord(parsed)) throw new Error("Codex settled-turn projection requires object tool arguments");
		return requireBoundedText(value, "tool arguments");
	}
	if (!isRecord(value)) throw new Error("Codex settled-turn projection requires object tool arguments");
	let serialized;
	try {
		serialized = JSON.stringify(value);
	} catch {
		throw new Error("Codex settled-turn projection found unserializable tool arguments");
	}
	return requireBoundedText(serialized, "tool arguments");
}
function projectUserMessage(message) {
	const upstreamUserText = readUpstreamUserText(message);
	if (typeof message.content === "string") return {
		type: "message",
		role: "user",
		content: [{
			type: "input_text",
			text: upstreamUserText ? requireBoundedText(upstreamUserText, "upstream user text", MAX_PROJECTION_BYTES) : requireBoundedText(message.content, "user message")
		}]
	};
	if (!Array.isArray(message.content)) throw new Error("Codex settled-turn projection found unsupported user content");
	const content = [];
	let bytes = responseItemBytes({
		type: "message",
		role: "user",
		content
	});
	for (const value of message.content) {
		if (!isRecord(value)) throw new Error("Codex settled-turn projection found malformed user content");
		if (value.type !== "text") throw new Error(`Codex settled-turn projection does not support user content ${value.type}`);
		const text = readBoundedText(value.text, "user text");
		if (text) {
			const part = {
				type: "input_text",
				text
			};
			bytes += responseItemBytes(part) + (content.length > 0 ? 1 : 0);
			if (bytes > MAX_PROJECTION_BYTES) throw new Error("Codex settled-turn projection exceeds the byte limit");
			content.push(part);
		}
	}
	if (content.length === 0) throw new Error("Codex settled-turn projection found an empty user message");
	return {
		type: "message",
		role: "user",
		content
	};
}
function* projectAssistantMessage(message) {
	const values = typeof message.content === "string" ? [{
		type: "text",
		text: message.content
	}] : message.content;
	if (!Array.isArray(values)) throw new Error("Codex settled-turn projection found unsupported assistant content");
	for (const value of values) {
		if (!isRecord(value)) throw new Error("Codex settled-turn projection found malformed assistant content");
		if (value.type === "text") {
			const text = readBoundedText(value.text, "assistant text");
			if (text) yield { item: {
				type: "message",
				role: "assistant",
				content: [{
					type: "output_text",
					text
				}]
			} };
			continue;
		}
		if (value.type === "toolCall") {
			const id = requireCallId(value.id ?? value.toolCallId);
			const name = requireToolName(value.name ?? value.toolName);
			yield {
				call: {
					id,
					name
				},
				item: {
					type: "function_call",
					call_id: id,
					name,
					arguments: serializeToolArguments(value.arguments ?? value.input)
				}
			};
			continue;
		}
		if (value.type === "thinking" || value.type === "reasoning") continue;
		throw new Error(`Codex settled-turn projection does not support assistant content ${String(value.type)}`);
	}
}
function projectToolResult(message) {
	const id = requireCallId(message.toolCallId);
	const name = requireToolName(message.toolName);
	if (!Array.isArray(message.content)) throw new Error("Codex settled-turn projection found unsupported tool result content");
	const isErrorValue = message.isError;
	if (isErrorValue !== void 0 && typeof isErrorValue !== "boolean") throw new Error("Codex settled-turn projection found invalid tool result status");
	const isError = isErrorValue === true;
	const parts = [];
	let bytes = 0;
	const appendText = (text) => {
		bytes += Buffer.byteLength(text, "utf8") + (parts.length > 0 ? 1 : 0);
		if (bytes > MAX_TEXT_BYTES) throw new Error("Codex settled-turn projection found oversized tool result output");
		parts.push(text);
	};
	for (const value of message.content) {
		if (!isRecord(value)) throw new Error("Codex settled-turn projection found malformed tool result content");
		if (value.type === "image") {
			appendText(`[Image tool result: ${normalizeOptionalString(value.mimeType) ?? "unknown type"}]`);
			continue;
		}
		if (value.type !== "text" && value.type !== "toolResult") throw new Error("Codex settled-turn projection found malformed tool result content");
		const text = value.type === "text" ? readBoundedText(value.text, "tool result text") : readBoundedText(value.content ?? value.text, "tool result text");
		if (text) appendText(text);
	}
	const resultText = parts.join("\n") || (isError ? "Tool failed without textual output." : "Tool completed without textual output.");
	const output = requireBoundedText(isError ? `${TOOL_ERROR_STATUS_PREFIX}${resultText}` : resultText, "tool result output", isError ? MAX_TEXT_BYTES + Buffer.byteLength(TOOL_ERROR_STATUS_PREFIX, "utf8") : MAX_TEXT_BYTES);
	return {
		result: {
			id,
			name
		},
		item: {
			type: "function_call_output",
			call_id: id,
			output
		}
	};
}
function* projectMessage(message) {
	if (message.role === "user") yield { item: projectUserMessage(message) };
	else if (message.role === "assistant") yield* projectAssistantMessage(message);
	else if (message.role === "toolResult") yield projectToolResult(message);
	else throw new Error(`Codex settled-turn projection does not support role ${message.role}`);
}
/** Consumes complete evidence or rejects at the existing limits, never truncating its history. */
function projectSettledCodexMessages(messages) {
	const items = [];
	const calls = /* @__PURE__ */ new Map();
	const results = /* @__PURE__ */ new Set();
	let bytes = 0;
	for (const message of messages) for (const { item, call, result } of projectMessage(message)) {
		if (call) {
			if (calls.has(call.id)) throw new Error("Codex settled-turn projection found a duplicate tool call");
			calls.set(call.id, call.name);
		}
		if (result) {
			if (calls.get(result.id) !== result.name || results.has(result.id)) throw new Error("Codex settled-turn projection found an ambiguous tool transcript");
			results.add(result.id);
		}
		if (items.length === MAX_RESPONSE_ITEMS) throw new Error("Codex settled-turn projection exceeds the item limit");
		bytes += responseItemBytes(item);
		if (bytes > MAX_PROJECTION_BYTES) throw new Error("Codex settled-turn projection exceeds the byte limit");
		items.push(item);
	}
	if (calls.size !== results.size) throw new Error("Codex settled-turn projection found an incomplete tool transcript");
	if (results.size === 0) throw new Error("Codex settled-turn projection found no completed tool result");
	return items;
}
//#endregion
//#region extensions/codex/src/app-server/settled-turn-context.ts
function freezeProjection(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) freezeProjection(child);
		Object.freeze(value);
	}
}
/** Only the Codex owner interprets this bounded, detached replay projection. */
var CodexSettledTurnContext = class {
	constructor(data) {
		this.data = data;
		this.source = "harness";
		freezeProjection(data);
		Object.freeze(this);
	}
};
function rejectEvidence(reason) {
	throw new Error("Codex settled-turn transcript does not match the settled turn: " + reason);
}
// A core-admitted announce prompt can predate native mirror annotation. Resolve
// it only by this turn's exact idempotency key and unchanged persisted content.
// This is a detached replay projection; never rewrite or duplicate the transcript.
function isPureReasoningMessage(message) {
 return message.role==="assistant" && Array.isArray(message.content) && message.content.length>0 && message.content.every(part=>part && (part.type==="thinking" || part.type==="reasoning"));
}
function verifiedPrePersistedPrompt(params) {
 const prompt=params.settledMessages[0];
 const identity=prompt && readMirrorIdentity(prompt);
 if(prompt?.role!=="user" || identity!==params.turnId+":prompt" || params.mirroredMessages.some(m=>readMirrorIdentity(m)===identity))return;
 const key=prompt.idempotencyKey;
 if(typeof key!=="string" || !key.trim())return;
 const found=(params.persistedUserMessages??[]).filter(m=>m.role==="user" && m.idempotencyKey===key);
 if(found.length!==1)return;
 const persisted=found[0];
 if(readMirrorIdentity(persisted) || persisted.__openclaw?.upstreamUserText!==undefined || JSON.stringify(persisted.content)!==JSON.stringify(prompt.content))return;
 return {key,prompt,persisted};
}
/** Yields only the settled prefix, but exhausts suffix identity checks before accepting it. */
function* verifiedSettledMessages(history, params) {
 // Reasoning is never replayed by projectAssistantMessage and is persisted at
 // turn end, after streamed tools. It cannot define public evidence ordering.
 params={...params,settledMessages:params.settledMessages.filter(m=>!isPureReasoningMessage(m)),mirroredMessages:params.mirroredMessages.filter(m=>!isPureReasoningMessage(m))};
	const promptIdentity = `${params.turnId}:prompt`;
	const boundaryIndex = params.settledMessages.findLastIndex((message) => message.role === "toolResult");
	const boundary = params.settledMessages[boundaryIndex];
	const boundaryIdentity = boundary && readMirrorIdentity(boundary);
	const requiredIds = params.settledMessages.slice(0, boundaryIndex + 1).flatMap((message) => readMirrorIdentity(message) ?? []);
	if (!boundaryIdentity?.startsWith(`${params.turnId}:tool:`) || requiredIds.length !== boundaryIndex + 1 || new Set(requiredIds).size !== requiredIds.length || (!requiredIds.includes(promptIdentity) && !(params.suppressNextUserMessagePersistence === true && !params.settledMessages.slice(0, boundaryIndex + 1).some(message => message.role === "user")))) rejectEvidence("settled-prefix");
	const admittedPrompt = verifiedPrePersistedPrompt(params);
	const mirrored = admittedPrompt ? [admittedPrompt.prompt, ...params.mirroredMessages] : params.mirroredMessages;
	const mirroredIds = mirrored.flatMap((message) => readMirrorIdentity(message) ?? []);
	const mirroredBoundaryIndex = mirrored.findIndex((message) => readMirrorIdentity(message) === boundaryIdentity);
	if (new Set(mirroredIds).size !== mirroredIds.length || mirroredBoundaryIndex + 1 !== requiredIds.length || requiredIds.some((id, index) => readMirrorIdentity(mirrored[index]) !== id)) rejectEvidence("mirror-prefix");
	const required = new Map(requiredIds.map((id, index) => [id, mirrored[index]]));
	const seen = /* @__PURE__ */ new Set();
	let matched = 0;
	let throughBoundary = false;
	let admittedPromptSeen = false;
	for (const storedMessage of history) {
  if(isPureReasoningMessage(storedMessage))continue;
  let message = storedMessage;
  if(admittedPrompt && storedMessage.idempotencyKey===admittedPrompt.key){
   if(admittedPromptSeen || serializeCodexMirrorSourceEvidence(storedMessage)!==serializeCodexMirrorSourceEvidence(admittedPrompt.persisted))rejectEvidence("admitted-prompt-changed-or-duplicated");
   admittedPromptSeen=true;
   message=admittedPrompt.prompt;
  }
		const identity = readMirrorIdentity(message);
		if (identity) {
			if (seen.has(identity)) rejectEvidence("duplicate-history");
			seen.add(identity);
			const expected = required.get(identity);
			if (expected) {
				if (identity !== requiredIds[matched] || serializeCodexMirrorSourceEvidence(message) !== serializeCodexMirrorSourceEvidence(expected)) rejectEvidence("history-order-or-content");
				matched += 1;
			}
		}
		if (!throughBoundary) yield message;
		throughBoundary ||= identity === boundaryIdentity;
	}
	if (!throughBoundary || matched !== requiredIds.length) rejectEvidence("missing-boundary");
}
/** Verifies and freezes a complete replay projection while reading the active branch. */
async function captureCodexSettledTurnFinalizationContext(params) {
	try {
		return await readCodexMirroredSessionHistory(params, (messages) => {
   try { return new CodexSettledTurnContext(projectSettledCodexMessages(verifiedSettledMessages(messages, params))); }
   catch (error) {
    embeddedAgentLog.warn("codex settled-turn evidence verification failed " + JSON.stringify({error: formatErrorMessage(error), turnId: params.turnId, suppressedPrompt: params.suppressNextUserMessagePersistence === true, settledCount: params.settledMessages.length, mirroredCount: params.mirroredMessages.length}));
    throw error;
   }
  });
	} catch (error) {
		embeddedAgentLog.warn("codex settled-turn finalization context capture failed", {
			error: formatErrorMessage(error),
			turnId: params.turnId
		});
		return;
	}
}
//#endregion
export { captureCodexSettledTurnFinalizationContext as n, CodexSettledTurnContext as t };
