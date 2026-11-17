import { $t as isJsonObject, At as retainCodexAppServerLiveThread, kt as releaseCodexAppServerLiveThread, xt as claimCodexAppServerLiveThread } from "./shared-client-DxcfF9KX.js";
import { A as shouldRecordNativeToolTranscript, C as isSideEffectingNativeToolItem, D as itemTitle, E as itemStatus, F as readHookOutputEntries, I as readItem, N as normalizeOptionalString$1, R as readNonEmptyString, S as isNonSuccessItemStatus, T as itemName, V as readNullableString$1, j as shouldSynthesizeToolProgressForItem, w as itemKind, x as isMutatingNativeToolItem, y as auditNativeToolTerminalStatus, z as readNonEmptyStringArray } from "./attempt-client-cleanup-DYHcRQAa.js";
import { t as attachCodexMirrorIdentity } from "./upstream-prompt-provenance-LphB8slG.js";
import { t as resolveCodexLocalRuntimeAttribution } from "./local-runtime-attribution-B_2mnqhb.js";
import { n as codexApprovalTimeoutText } from "./plugin-approval-roundtrip-CNe-Xrjx.js";
import { n as readCodexMirroredSessionHistoryMessages } from "./session-history-C5J1AKzG.js";
import { asFiniteNumber, asNonArrayRecord, normalizeOptionalString, readStringField } from "openclaw/plugin-sdk/string-coerce-runtime";
import path from "node:path";
import { asDateTimestampMs } from "openclaw/plugin-sdk/number-runtime";
import { TOOL_PROGRESS_OUTPUT_MAX_CHARS, embeddedAgentLog, emitAgentEvent, formatErrorMessage, formatToolAggregate, formatToolProgressOutput, inferToolMetaFromArgs, runAgentHarnessAfterToolCallHook } from "openclaw/plugin-sdk/agent-harness-runtime";
import { truncateUtf16Safe } from "openclaw/plugin-sdk/text-utility-runtime";
import { redactSensitiveFieldValue, redactToolPayloadText } from "openclaw/plugin-sdk/logging-core";
import { KeyedAsyncQueue } from "openclaw/plugin-sdk/keyed-async-queue";
import { createAgentHarnessTaskRuntime, deliverAgentHarnessTaskCompletion, isDurableAgentHarnessCompletionDelivery } from "openclaw/plugin-sdk/agent-harness-task-runtime";
//#region extensions/codex/src/app-server/event-projector-tool-output.ts
const TOOL_TRANSCRIPT_OUTPUT_MAX_CHARS = 1e4;
const TOOL_OUTPUT_TRUNCATION_NOTICE_PREFIX = "...(OpenClaw truncated Codex native tool output";
var ToolOutputAccumulator = class {
	constructor() {
		this.prefixByItem = /* @__PURE__ */ new Map();
		this.originalLengthByItem = /* @__PURE__ */ new Map();
		this.normalizedLengthByItem = /* @__PURE__ */ new Map();
		this.trimStateByItem = /* @__PURE__ */ new Map();
		this.truncatedItemIds = /* @__PURE__ */ new Set();
		this.textByItem = /* @__PURE__ */ new Map();
	}
	append(itemId, delta) {
		const originalLength = (this.originalLengthByItem.get(itemId) ?? this.textByItem.get(itemId)?.length ?? 0) + delta.length;
		this.originalLengthByItem.set(itemId, originalLength);
		const normalizedLength = updateToolOutputTrimState(this.trimStateByItem, itemId, delta);
		this.normalizedLengthByItem.set(itemId, normalizedLength);
		if (this.truncatedItemIds.has(itemId)) {
			const next = appendBoundedToolTranscriptText(this.prefixByItem.get(itemId) ?? this.textByItem.get(itemId) ?? "", "", originalLength);
			this.prefixByItem.set(itemId, next.rawPrefix);
			this.textByItem.set(itemId, next.text);
			return {
				text: next.text,
				originalLength,
				normalizedLength,
				rawPrefix: next.rawPrefix
			};
		}
		const next = appendBoundedToolTranscriptText(this.prefixByItem.get(itemId) ?? this.textByItem.get(itemId) ?? "", delta, originalLength);
		this.prefixByItem.set(itemId, next.rawPrefix);
		this.textByItem.set(itemId, next.text);
		if (originalLength > 1e4) this.truncatedItemIds.add(itemId);
		return {
			text: next.text,
			originalLength,
			normalizedLength,
			rawPrefix: next.rawPrefix
		};
	}
};
function updateToolOutputTrimState(trimStateByItem, itemId, delta) {
	const state = trimStateByItem.get(itemId) ?? {
		totalLength: 0,
		leadingWhitespaceLength: 0,
		trailingWhitespaceLength: 0,
		sawNonWhitespace: false
	};
	state.totalLength += delta.length;
	const firstNonWhitespace = delta.search(/\S/u);
	if (firstNonWhitespace === -1) {
		if (!state.sawNonWhitespace) state.leadingWhitespaceLength += delta.length;
		state.trailingWhitespaceLength += delta.length;
		trimStateByItem.set(itemId, state);
		return state.sawNonWhitespace ? state.totalLength - state.leadingWhitespaceLength - state.trailingWhitespaceLength : 0;
	}
	if (!state.sawNonWhitespace) {
		state.leadingWhitespaceLength += firstNonWhitespace;
		state.sawNonWhitespace = true;
	}
	state.trailingWhitespaceLength = delta.match(/\s*$/u)?.[0].length ?? 0;
	trimStateByItem.set(itemId, state);
	return state.totalLength - state.leadingWhitespaceLength - state.trailingWhitespaceLength;
}
function toolOutputRawEchoSignature(text) {
	const trimmed = text.trim();
	if (!trimmed) return;
	return {
		rawLength: trimmed.length,
		rawPrefix: trimmed.slice(0, TOOL_TRANSCRIPT_OUTPUT_MAX_CHARS)
	};
}
function normalizeToolTranscriptArguments(value) {
	return asNonArrayRecord(value);
}
function collectDynamicToolContentText(contentItems) {
	if (!Array.isArray(contentItems)) return "";
	return contentItems.flatMap((entry) => {
		if (!isJsonObject(entry)) return [];
		const text = readStringField(entry, "text");
		return text ? [text] : [];
	}).join("\n");
}
function appendBoundedToolTranscriptText(currentPrefix, delta, originalLength) {
	if (originalLength <= 1e4) {
		const rawPrefix = currentPrefix + delta;
		return {
			text: rawPrefix,
			rawPrefix
		};
	}
	const notice = toolTranscriptTruncationNotice(originalLength);
	if (notice.length >= 1e4) return {
		text: notice.slice(0, TOOL_TRANSCRIPT_OUTPUT_MAX_CHARS),
		rawPrefix: ""
	};
	const textBudget = TOOL_TRANSCRIPT_OUTPUT_MAX_CHARS - notice.length;
	const remaining = Math.max(0, textBudget - currentPrefix.length);
	const prefix = remaining > 0 ? `${currentPrefix}${truncateUtf16Safe(delta, remaining)}` : currentPrefix;
	const rawPrefix = truncateUtf16Safe(prefix, textBudget);
	return {
		text: `${rawPrefix}${notice}`,
		rawPrefix
	};
}
function toolTranscriptTruncationNotice(originalLength) {
	return `\n${`${TOOL_OUTPUT_TRUNCATION_NOTICE_PREFIX}: original ${originalLength} chars, showing ${TOOL_TRANSCRIPT_OUTPUT_MAX_CHARS}; rerun with narrower args.)`}`;
}
function truncateToolTranscriptText(text, originalLength = text.length) {
	if (originalLength <= 1e4 && text.length <= 1e4) return text;
	const notice = toolTranscriptTruncationNotice(originalLength);
	if (notice.length >= 1e4) return notice.slice(1, 10001);
	const textBudget = TOOL_TRANSCRIPT_OUTPUT_MAX_CHARS - notice.length;
	return `${truncateUtf16Safe(text, textBudget)}${notice}`;
}
function formatToolSummary(toolName, meta) {
	const trimmedMeta = meta?.trim();
	return formatToolAggregate(toolName, trimmedMeta ? [trimmedMeta] : void 0, { markdown: true });
}
function formatToolOutput(toolName, meta, output) {
	const formattedOutput = formatToolProgressOutput(output);
	if (!formattedOutput) return formatToolSummary(toolName, meta);
	const fence = markdownFenceForText(formattedOutput);
	return `${formatToolSummary(toolName, meta)}\n${fence}txt\n${formattedOutput}\n${fence}`;
}
function markdownFenceForText(text) {
	return "`".repeat(Math.max(3, longestBacktickRun(text) + 1));
}
function longestBacktickRun(value) {
	let longest = 0;
	let current = 0;
	for (const char of value) {
		if (char === "`") {
			current += 1;
			longest = Math.max(longest, current);
			continue;
		}
		current = 0;
	}
	return longest;
}
//#endregion
//#region extensions/codex/src/app-server/tool-progress-normalization.ts
/**
* Normalizes and sanitizes Codex dynamic-tool progress payloads before they are
* emitted into OpenClaw events or logs.
*/
/** Maps OpenClaw tool-progress config to the mode used by Codex progress metadata. */
function resolveCodexToolProgressDetailMode(value) {
	return value === "raw" ? "raw" : "explain";
}
function isCodexCommandBearingToolCall(name, args) {
	const normalizedName = name?.trim().toLowerCase();
	return normalizedName === "exec" || normalizedName === "bash" || normalizedName === "shell" || typeof args?.command === "string" && args.command.trim().length > 0;
}
/** Recursively redacts sensitive strings and handles circular values in event payloads. */
function sanitizeCodexAgentEventValue(value, seen = /* @__PURE__ */ new WeakSet()) {
	if (typeof value === "string") return redactToolPayloadText(value);
	if (Array.isArray(value)) {
		if (seen.has(value)) return "[Circular]";
		seen.add(value);
		return value.map((entry) => sanitizeCodexAgentEventValue(entry, seen));
	}
	if (value && typeof value === "object") {
		if (seen.has(value)) return "[Circular]";
		seen.add(value);
		const out = {};
		for (const [key, child] of Object.entries(value)) out[key] = typeof child === "string" ? redactSensitiveFieldValue(key, child) : sanitizeCodexAgentEventValue(child, seen);
		return out;
	}
	return value;
}
/** Sanitizes a record-shaped Codex agent event payload. */
function sanitizeCodexAgentEventRecord(value) {
	return sanitizeCodexAgentEventValue(value);
}
/** Sanitizes dynamic-tool arguments before diagnostic/event emission. */
function sanitizeCodexToolArguments(value) {
	if (!isJsonObject(value)) return;
	return sanitizeCodexAgentEventRecord(value);
}
/** Sanitizes a Codex dynamic-tool response before diagnostic/event emission. */
function sanitizeCodexToolResponse(response) {
	return sanitizeCodexAgentEventRecord({ ...response });
}
/** Infers compact human-readable tool metadata from Codex dynamic-tool arguments. */
function inferCodexDynamicToolMeta(call, detailMode) {
	return inferToolMetaFromArgs(call.tool, call.arguments, { detailMode });
}
//#endregion
//#region extensions/codex/src/app-server/event-projector-tool-items.ts
function isNativePostToolUseRelayItem(item) {
	switch (item.type) {
		case "commandExecution":
		case "fileChange":
		case "mcpToolCall": return true;
		default: return false;
	}
}
function shouldSuppressChannelProgressForItem(item) {
	if (shouldSynthesizeToolProgressForItem(item)) return true;
	return item.type === "dynamicToolCall";
}
function itemToolArgs(item) {
	if (item.type === "commandExecution") return sanitizeCodexAgentEventRecord({
		command: item.command,
		...typeof item.cwd === "string" ? { cwd: item.cwd } : {}
	});
	if (item.type === "fileChange") return sanitizeCodexAgentEventRecord({ changes: itemFileChangesForTranscript(item) });
	if (item.type === "webSearch") return webSearchToolArgs(item);
	if (item.type === "dynamicToolCall" || item.type === "mcpToolCall") return sanitizeCodexToolArguments(item.arguments);
}
function isCommandBearingToolItem(item, args) {
	if (item.type === "commandExecution") return true;
	return typeof args?.command === "string" && args.command.trim().length > 0;
}
function webSearchToolArgs(item) {
	const action = isJsonObject(item.action) ? item.action : void 0;
	const actionType = action ? readNonEmptyString(action, "type") : void 0;
	const queries = action && actionType === "search" ? readNonEmptyStringArray(action, "queries") : [];
	const query = normalizeOptionalString$1(item.query) ?? (action && actionType === "search" ? readNonEmptyString(action, "query") : void 0) ?? queries[0];
	const url = action ? readNonEmptyString(action, "url") : void 0;
	const pattern = action ? readNonEmptyString(action, "pattern") : void 0;
	const args = {};
	if (query) args.query = query;
	if (queries.length > 0) args.queries = queries;
	if (actionType && actionType !== "search") args.action = actionType;
	if (url) args.url = url;
	if (pattern) args.pattern = pattern;
	if (!query && !url && !pattern) args.queryUnavailable = true;
	return sanitizeCodexAgentEventRecord(args);
}
function itemToolResult(item) {
	if (item.type === "commandExecution") return { result: sanitizeCodexAgentEventRecord({
		status: item.status,
		exitCode: item.exitCode,
		durationMs: item.durationMs
	}) };
	if (item.type === "fileChange") return { result: sanitizeCodexAgentEventRecord({
		status: item.status,
		changes: itemFileChanges(item)
	}) };
	if (item.type === "mcpToolCall") return { result: sanitizeCodexAgentEventRecord({
		status: item.status,
		durationMs: item.durationMs,
		...item.error ? { error: item.error } : {},
		...item.result ? { result: item.result } : {}
	}) };
	if (item.type === "webSearch") return { result: webSearchToolResult(item) };
	return {};
}
function webSearchToolResult(item) {
	return sanitizeCodexAgentEventRecord({
		status: itemStatus(item),
		...typeof item.durationMs === "number" ? { durationMs: item.durationMs } : {},
		...webSearchToolArgs(item)
	});
}
function itemFileChangeRecords(item) {
	const changes = item.changes;
	return Array.isArray(changes) ? changes.filter(isJsonObject) : [];
}
function itemFileChanges(item) {
	return itemFileChangeRecords(item).flatMap((change) => {
		const path = normalizeOptionalString$1(change.path);
		if (!path || change.kind === void 0) return [];
		return [{
			path,
			kind: change.kind
		}];
	});
}
function fileChangeKindType(kind) {
	if (typeof kind === "string") return kind;
	return isJsonObject(kind) ? normalizeOptionalString$1(kind.type) : void 0;
}
function countFileContentLines(content) {
	if (!content) return 0;
	const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
	if (lines.length > 1 && lines.at(-1) === "") lines.pop();
	return lines.length;
}
function fileChangeDiffStat(diff, kind) {
	const kindType = fileChangeKindType(kind);
	if (kindType === "add") return {
		added: countFileContentLines(diff),
		removed: 0
	};
	if (kindType === "delete") return {
		added: 0,
		removed: countFileContentLines(diff)
	};
	let added = 0;
	let removed = 0;
	let inHunk = false;
	for (const line of diff.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
		if (line.startsWith("@@")) {
			inHunk = true;
			continue;
		}
		if (!inHunk) continue;
		if (line.startsWith("+")) added += 1;
		else if (line.startsWith("-")) removed += 1;
	}
	return {
		added,
		removed
	};
}
function truncateFileChangeDiffAtLineBoundary(diff, maxChars) {
	if (diff.length <= maxChars) return { diff };
	if (maxChars <= 0) return { diffTruncated: true };
	const boundary = diff.lastIndexOf("\n", maxChars - 1);
	return boundary >= 0 ? {
		diff: diff.slice(0, boundary + 1),
		diffTruncated: true
	} : { diffTruncated: true };
}
function itemFileChangesForTranscript(item) {
	let remainingDiffChars = 1e4;
	return itemFileChangeRecords(item).flatMap((change) => {
		const path = normalizeOptionalString$1(change.path);
		if (!path || change.kind === void 0) return [];
		const result = {
			path,
			kind: change.kind
		};
		if (typeof change.diff !== "string") return [result];
		result.stat = fileChangeDiffStat(change.diff, change.kind);
		const bounded = truncateFileChangeDiffAtLineBoundary(change.diff, remainingDiffChars);
		if (bounded.diff !== void 0) {
			result.diff = bounded.diff;
			remainingDiffChars -= bounded.diff.length;
		}
		if (bounded.diffTruncated) result.diffTruncated = true;
		return [result];
	});
}
function itemToolError(item, status, outputTextByItem) {
	if (status === "blocked") return "codex native tool blocked";
	if (status !== "failed") return;
	return itemOutputText(item, outputTextByItem) ?? "codex native tool failed";
}
function itemMeta(item, detailMode = "explain") {
	if (item.type === "commandExecution" && typeof item.command === "string") return inferToolMetaFromArgs("exec", {
		command: item.command,
		cwd: typeof item.cwd === "string" ? item.cwd : void 0
	}, { detailMode });
	if (item.type === "webSearch") return inferToolMetaFromArgs("web_search", webSearchToolArgs(item), { detailMode });
	const toolName = itemName(item);
	if ((item.type === "dynamicToolCall" || item.type === "mcpToolCall") && toolName) return inferToolMetaFromArgs(toolName, item.arguments, { detailMode });
}
function itemOutputText(item, outputTextByItem) {
	if (item.type === "commandExecution") {
		const output = item.aggregatedOutput?.trim() || outputTextByItem?.get(item.id)?.trim();
		return output ? truncateToolTranscriptText(output) : void 0;
	}
	if (item.type === "dynamicToolCall") {
		const output = collectDynamicToolContentText(item.contentItems).trim();
		return output ? truncateToolTranscriptText(output) : void 0;
	}
	if (item.type === "mcpToolCall") {
		const output = item.error ? stringifyJsonValue(item.error) : item.result ? stringifyJsonValue(item.result) : void 0;
		return output ? truncateToolTranscriptText(output) : void 0;
	}
}
function itemTranscriptResultText(item, outputTextByItem) {
	const output = itemOutputText(item, outputTextByItem);
	if (output) return output;
	const result = itemToolResult(item).result;
	const resultText = result ? stringifyJsonValue(result) : void 0;
	return resultText ? truncateToolTranscriptText(resultText) : itemStatus(item);
}
function stringifyJsonValue(value) {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return;
	}
}
//#endregion
//#region extensions/codex/src/app-server/event-projector-tool-progress.ts
const TRANSCRIPT_PROGRESS_SUPPRESSED_TOOL_NAMES = /* @__PURE__ */ new Set([
	"message",
	"messages",
	"reply",
	"send",
	"reaction",
	"react",
	"typing"
]);
function shouldEmitTranscriptToolProgress(toolName, _args) {
	const normalized = typeof toolName === "string" ? toolName.trim().toLowerCase() : "";
	return Boolean(normalized && !TRANSCRIPT_PROGRESS_SUPPRESSED_TOOL_NAMES.has(normalized));
}
var CodexToolProgressProjection = class {
	constructor(params) {
		this.params = params;
		this.echoesByItem = /* @__PURE__ */ new Map();
		this.resultSummaryItemIds = /* @__PURE__ */ new Set();
		this.resultOutputItemIds = /* @__PURE__ */ new Set();
		this.resultOutputStreamedItemIds = /* @__PURE__ */ new Set();
		this.transcriptProgressSuppressedIds = /* @__PURE__ */ new Set();
		this.transcriptArgumentsById = /* @__PURE__ */ new Map();
		this.resultOutputDeltaState = /* @__PURE__ */ new Map();
		this.output = new ToolOutputAccumulator();
		this.metas = /* @__PURE__ */ new Map();
		this.sideEffectingNativeIds = /* @__PURE__ */ new Set();
		this.sideEffectingDynamicIds = /* @__PURE__ */ new Set();
		this.transcriptProgressCallIds = /* @__PURE__ */ new Set();
		this.approvalTimeoutKinds = /* @__PURE__ */ new Map();
	}
	get outputTextByItem() {
		return this.output.textByItem;
	}
	get toolMetas() {
		return [...this.metas.values()];
	}
	getToolMeta(itemId) {
		return this.metas.get(itemId);
	}
	get lastToolError() {
		return this.lastNativeToolError;
	}
	get hasPotentialSideEffects() {
		return this.sideEffectingNativeIds.size > 0 || this.sideEffectingDynamicIds.size > 0;
	}
	approvalTimeoutExplanation(itemId, status) {
		const kind = isNonSuccessItemStatus(status) && this.approvalTimeoutKinds.get(itemId);
		return kind ? codexApprovalTimeoutText(kind) : void 0;
	}
	setLastToolError(error) {
		if (!error) {
			this.lastNativeToolError = void 0;
			return;
		}
		const terminalResolution = this.params.observeToolTerminal?.({
			toolName: error.toolName,
			...error.meta ? { meta: error.meta } : {},
			outcome: "failure",
			failure: {
				...error.errorCode ? { errorCode: error.errorCode } : {},
				...error.error ? { error: error.error } : {},
				...error.validationErrorSummary ? { validationErrorSummary: error.validationErrorSummary } : {},
				...error.timedOut ? { timedOut: true } : {},
				...error.middlewareError ? { middlewareError: true } : {}
			},
			nativeMutation: {
				mutatingAction: error.mutatingAction === true,
				replaySafe: error.mutatingAction !== true
			}
		});
		this.lastNativeToolError = terminalResolution?.lastToolError ?? (this.lastNativeToolError?.mutatingAction && error.mutatingAction !== true ? this.lastNativeToolError : error);
	}
	recordDynamicToolResult(params) {
		const resultText = collectDynamicToolContentText(params.contentItems);
		const existing = this.metas.get(params.callId);
		this.metas.set(params.callId, {
			toolName: existing?.toolName ?? params.tool,
			...existing?.meta ? { meta: existing.meta } : {},
			...params.asyncStarted === true ? { asyncStarted: true } : {},
			isError: !params.success
		});
		if (params.terminalResolution) this.lastNativeToolError = params.terminalResolution.lastToolError;
		else if (!params.success) this.lastNativeToolError = {
			toolName: params.tool,
			error: resultText || (params.terminalType === "blocked" ? "codex dynamic tool blocked" : "codex dynamic tool failed")
		};
		else if (this.lastNativeToolError?.mutatingAction !== true) this.lastNativeToolError = void 0;
		if (params.sideEffectEvidence === true) this.sideEffectingDynamicIds.add(params.callId);
	}
	handleOutputDelta(params, toolName) {
		const itemId = readStringField(params, "itemId");
		const delta = readStringField(params, "delta");
		if (!itemId || !delta) return;
		const storedOutput = this.output.append(itemId, delta);
		this.rememberEcho(itemId, {
			displayText: storedOutput.text,
			rawLength: storedOutput.normalizedLength,
			rawPrefix: storedOutput.rawPrefix,
			streamedDisplay: true
		});
		if (!this.shouldEmitToolOutput()) return;
		if (this.transcriptProgressSuppressedIds.has(itemId) || !shouldEmitTranscriptToolProgress(toolName, this.transcriptArgumentsById.get(itemId))) return;
		const state = this.resultOutputDeltaState.get(itemId) ?? {
			chars: 0,
			messages: 0,
			truncated: false
		};
		if (state.truncated) return;
		const remainingChars = Math.max(0, TOOL_PROGRESS_OUTPUT_MAX_CHARS - state.chars);
		const remainingMessages = Math.max(0, 20 - state.messages);
		if (remainingChars === 0 || remainingMessages === 0) {
			state.truncated = true;
			this.resultOutputDeltaState.set(itemId, state);
			this.emitToolResultMessage({
				itemId,
				text: formatToolOutput(toolName, void 0, "(output truncated)")
			});
			return;
		}
		const chunk = delta.length > remainingChars ? truncateUtf16Safe(delta, remainingChars) : delta;
		state.chars += chunk.length;
		state.messages += 1;
		const reachedLimit = delta.length > remainingChars || state.chars >= TOOL_PROGRESS_OUTPUT_MAX_CHARS || state.messages >= 20;
		if (reachedLimit) state.truncated = true;
		this.resultOutputDeltaState.set(itemId, state);
		this.resultOutputStreamedItemIds.add(itemId);
		this.emitToolResultMessage({
			itemId,
			text: formatToolOutput(toolName, void 0, reachedLimit ? `${chunk}\n...(truncated)...` : chunk)
		});
	}
	recordNativeToolError(params) {
		const executionStarted = params.status !== "blocked";
		const mutatingAction = executionStarted && isMutatingNativeToolItem(params.item);
		const isFailure = isNonSuccessItemStatus(params.status);
		const approvalTimeoutExplanation = this.approvalTimeoutExplanation(params.item.id, params.status);
		const error = isFailure ? approvalTimeoutExplanation ?? itemToolError(params.item, params.status, this.output.textByItem) : void 0;
		const failure = error ? {
			...approvalTimeoutExplanation ? { errorCode: "approval_timeout" } : {},
			error,
			...approvalTimeoutExplanation ? { timedOut: true } : {}
		} : {};
		const terminalResolution = this.params.observeToolTerminal?.({
			toolCallId: params.item.id,
			toolName: params.name,
			arguments: itemToolArgs(params.item),
			...params.meta ? { meta: params.meta } : {},
			executionStarted,
			outcome: isFailure ? "failure" : "success",
			...isFailure ? { failure } : {},
			nativeMutation: {
				mutatingAction,
				replaySafe: !mutatingAction
			}
		});
		if (terminalResolution) {
			this.lastNativeToolError = terminalResolution.lastToolError;
			return;
		}
		if (isFailure) this.lastNativeToolError = {
			toolName: params.name,
			...params.meta ? { meta: params.meta } : {},
			...failure,
			...mutatingAction ? { mutatingAction: true } : {}
		};
		else if (this.lastNativeToolError?.mutatingAction !== true) this.lastNativeToolError = void 0;
	}
	emitToolResultSummary(item) {
		if (!item || !this.params.onToolResult || !this.shouldEmitToolResult()) return;
		if (this.resultSummaryItemIds.has(item.id)) return;
		const toolName = itemName(item);
		const args = itemToolArgs(item);
		if (!toolName || !shouldEmitTranscriptToolProgress(toolName, args)) return;
		this.resultSummaryItemIds.add(item.id);
		const meta = this.shouldIncludeFormattedMeta(isCommandBearingToolItem(item, args)) ? itemMeta(item, this.toolProgressDetailMode()) : void 0;
		this.emitToolResultMessage({
			itemId: item.id,
			text: formatToolSummary(toolName, meta)
		});
	}
	emitToolResultOutput(item) {
		if (!item || !this.params.onToolResult || !this.shouldEmitToolOutput()) return;
		if (this.resultOutputItemIds.has(item.id) || this.resultOutputStreamedItemIds.has(item.id)) return;
		const toolName = itemName(item);
		const output = itemOutputText(item, this.output.textByItem);
		if (!toolName || !output || !shouldEmitTranscriptToolProgress(toolName, itemToolArgs(item))) return;
		const meta = this.shouldIncludeFormattedMeta(isCommandBearingToolItem(item, itemToolArgs(item))) ? itemMeta(item, this.toolProgressDetailMode()) : void 0;
		this.emitToolResultMessage({
			itemId: item.id,
			text: formatToolOutput(toolName, meta, output),
			finalOutput: true,
			isError: isNonSuccessItemStatus(itemStatus(item))
		});
	}
	recordToolMeta(item) {
		if (!item) return;
		if (isSideEffectingNativeToolItem(item)) this.sideEffectingNativeIds.add(item.id);
		else this.sideEffectingNativeIds.delete(item.id);
		const toolName = itemName(item);
		if (!toolName) return;
		const meta = itemMeta(item, this.toolProgressDetailMode());
		const existing = this.metas.get(item.id);
		const terminalStatus = auditNativeToolTerminalStatus(item);
		const isError = typeof existing?.isError === "boolean" ? existing.isError : terminalStatus === "completed" ? false : terminalStatus === "failed" || terminalStatus === "blocked" ? true : void 0;
		this.metas.set(item.id, {
			toolName,
			...meta ? { meta } : {},
			...existing?.asyncStarted ? { asyncStarted: true } : {},
			...isError === void 0 ? {} : { isError }
		});
	}
	recordTranscriptCall(params) {
		this.transcriptArgumentsById.set(params.id, params.arguments);
		if (!shouldEmitTranscriptToolProgress(params.name, params.arguments)) this.transcriptProgressSuppressedIds.add(params.id);
		else this.transcriptProgressSuppressedIds.delete(params.id);
		this.emitTranscriptToolCallProgress(params);
	}
	recordTranscriptResult(params) {
		this.emitTranscriptToolResultProgress(params);
	}
	matchesEcho(text) {
		for (const state of this.echoesByItem.values()) {
			if (state.streamedDisplayText === text || state.displayTexts.includes(text)) return true;
			if (state.streamedRawSignature && text.length === state.streamedRawSignature.length && text.startsWith(state.streamedRawSignature.prefix)) return true;
			for (const signature of state.rawSignatures) if (text.length === signature.length && text.startsWith(signature.prefix)) return true;
		}
		return false;
	}
	rememberCommandAggregateOutputEcho(item) {
		if (item?.type !== "commandExecution" || typeof item.aggregatedOutput !== "string") return;
		const signature = toolOutputRawEchoSignature(item.aggregatedOutput);
		if (signature) this.rememberEcho(item.id, signature);
	}
	toolProgressDetailMode() {
		return resolveCodexToolProgressDetailMode(this.params.toolProgressDetail);
	}
	emitToolResultMessage(params) {
		const rawText = params.text.trim();
		const text = truncateToolTranscriptText(rawText);
		if (!text) return;
		this.rememberEcho(params.itemId, {
			displayText: text,
			rawText
		});
		if (params.finalOutput) this.resultOutputItemIds.add(params.itemId);
		try {
			Promise.resolve(this.params.onToolResult?.({
				text,
				...(this.params.messageChannel || this.params.messageProvider) && { channelData: { openclawToolProgressId: params.itemId } },
				...params.isError === true ? { isError: true } : {}
			})).catch(() => {});
		} catch {}
	}
	shouldEmitToolResult() {
		return typeof this.params.shouldEmitToolResult === "function" ? this.params.shouldEmitToolResult() : this.params.verboseLevel === "on" || this.params.verboseLevel === "full";
	}
	shouldEmitToolOutput() {
		return typeof this.params.shouldEmitToolOutput === "function" ? this.params.shouldEmitToolOutput() : this.params.verboseLevel === "full";
	}
	shouldIncludeFormattedMeta(commandBearing) {
		const channel = this.params.messageChannel ?? this.params.messageProvider;
		return !commandBearing || !channel && this.shouldEmitToolOutput();
	}
	emitTranscriptToolCallProgress(params) {
		if (!shouldEmitTranscriptToolProgress(params.name, params.arguments)) return;
		this.transcriptProgressCallIds.add(params.id);
		const args = normalizeToolTranscriptArguments(params.arguments);
		const meta = this.shouldIncludeFormattedMeta(isCodexCommandBearingToolCall(params.name, args)) ? inferToolMetaFromArgs(params.name, args, { detailMode: this.toolProgressDetailMode() }) : void 0;
		if (!this.params.onToolResult || !this.shouldEmitToolResult() || this.resultSummaryItemIds.has(params.id) || this.resultOutputStreamedItemIds.has(params.id)) return;
		this.resultSummaryItemIds.add(params.id);
		this.emitToolResultMessage({
			itemId: params.id,
			text: formatToolSummary(params.name, meta)
		});
	}
	emitTranscriptToolResultProgress(params) {
		if (this.transcriptProgressSuppressedIds.has(params.id) || !shouldEmitTranscriptToolProgress(params.name, this.transcriptArgumentsById.get(params.id))) return;
		if (!this.transcriptProgressCallIds.has(params.id)) this.emitTranscriptToolCallProgress({
			id: params.id,
			name: params.name,
			arguments: {}
		});
		if (!this.params.onToolResult || !this.shouldEmitToolOutput() || this.resultOutputItemIds.has(params.id) || this.resultOutputStreamedItemIds.has(params.id)) return;
		const text = params.text?.trim();
		if (text) this.emitToolResultMessage({
			itemId: params.id,
			text: formatToolOutput(params.name, void 0, text),
			finalOutput: true,
			isError: params.isError
		});
	}
	rememberEcho(itemId, signature) {
		if (!itemId) return;
		const existing = this.echoesByItem.get(itemId) ?? {
			displayTexts: [],
			rawSignatures: []
		};
		const displayText = signature.displayText?.trim();
		if (displayText) {
			if (signature.streamedDisplay) existing.streamedDisplayText = displayText;
			else if (!existing.displayTexts.includes(displayText)) {
				if (existing.displayTexts.length >= 24) existing.displayTexts.shift();
				existing.displayTexts.push(displayText);
			}
		}
		const rawText = signature.rawText?.trim();
		const rawLength = signature.rawLength ?? rawText?.length;
		const rawPrefix = signature.rawPrefix?.trim() ?? rawText;
		if (rawLength !== void 0 && rawPrefix && rawPrefix.length >= 1024) {
			const next = {
				length: rawLength,
				prefix: rawPrefix.slice(0, TOOL_TRANSCRIPT_OUTPUT_MAX_CHARS)
			};
			if (signature.streamedDisplay) existing.streamedRawSignature = next;
			else {
				const matchIndex = existing.rawSignatures.findIndex((entry) => entry.prefix === next.prefix);
				if (matchIndex >= 0) existing.rawSignatures[matchIndex] = next;
				else {
					if (existing.rawSignatures.length >= 24) existing.rawSignatures.shift();
					existing.rawSignatures.push(next);
				}
			}
		}
		this.echoesByItem.set(itemId, existing);
	}
};
//#endregion
//#region extensions/codex/src/app-server/event-projector-tool-transcript.ts
const ZERO_USAGE = {
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
};
const MISSING_TOOL_RESULT_ERROR = "OpenClaw recorded a native Codex tool.call without a matching tool.result before the turn completed.";
const NATIVE_PATCH_REJECTION_RE = /^\s*patch rejected:\s*writing outside of the project;\s*rejected by user approval settings\s*$/iu;
const CODE_MODE_NATIVE_PATCH_SOURCE_RE = /^\s*(?:\/\/[^\r\n]*\r?\n\s*)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+tools\.apply_patch\(\s*("(?:\\[\s\S]|[^"\\])*")\s*\)\s*;?\s*text\(\s*\1\s*\)\s*;?\s*$/u;
const CODE_MODE_NATIVE_PATCH_RESULT_RE = /^\s*Script (completed|failed)\s*\r?\nWall time\s+\d+(?:\.\d+)?\s+seconds\s*\r?\nOutput:\s*([\s\S]*?)\s*$/iu;
const MAX_TOOL_APPROVAL_REVIEWS = 16;
function toolApprovalReviewOutcome(state) {
	return state.denied ? "denied" : state.unresolvedReviewIds === null || state.unresolvedReviewIds.size > 0 ? "reviewing" : "approved";
}
function readCodeModeNativePatchInput(source) {
	if (typeof source !== "string") return;
	const match = CODE_MODE_NATIVE_PATCH_SOURCE_RE.exec(source);
	if (!match?.[2]) return;
	try {
		const patch = JSON.parse(match[2]);
		return typeof patch === "string" && /^\*\*\* Begin Patch\r?\n[\s\S]*\r?\n\*\*\* End Patch(?:\r?\n)?$/u.test(patch) ? patch : void 0;
	} catch {
		return;
	}
}
function readInterceptedNativePatchInput(command) {
	if (typeof command !== "string") return;
	const lines = command.replace(/\r\n?/gu, "\n").split("\n");
	const patchStart = lines.indexOf("*** Begin Patch");
	const invocation = /^[\t ]*(?:cd[\t ]+(?:'([^'\n]+)'|([A-Za-z0-9_./-]+))[\t ]+&&[\t ]+)?apply_patch[\t ]*<<-?[\t ]*'([^'\n]+)'[\t ]*$/u.exec(lines[0] ?? "");
	if (!invocation || patchStart !== 1) return;
	const patchEnd = lines.indexOf("*** End Patch", patchStart + 1);
	const cwd = invocation[1] ?? invocation[2];
	const delimiter = invocation[3];
	if (patchEnd < 0 || lines[patchEnd + 1] !== delimiter || lines.slice(patchEnd + 2).some((line) => line.trim().length > 0)) return;
	return {
		input: `${lines.slice(patchStart, patchEnd + 1).join("\n")}\n`,
		...cwd ? { cwd } : {}
	};
}
var CodexToolTranscriptProjection = class {
	constructor(params, threadId, turnId, progress, nextTranscriptTimestamp, options = {}) {
		this.params = params;
		this.threadId = threadId;
		this.turnId = turnId;
		this.progress = progress;
		this.nextTranscriptTimestamp = nextTranscriptTimestamp;
		this.options = options;
		this.messages = [];
		this.callIds = /* @__PURE__ */ new Set();
		this.resultIds = /* @__PURE__ */ new Set();
		this.namesById = /* @__PURE__ */ new Map();
		this.trajectoryCallIds = /* @__PURE__ */ new Set();
		this.trajectoryResultIds = /* @__PURE__ */ new Set();
		this.trajectoryNamesById = /* @__PURE__ */ new Map();
		this.trajectoryItemsById = /* @__PURE__ */ new Map();
		this.afterToolCallObservedItemIds = /* @__PURE__ */ new Set();
		this.nativeMcpAppResultDetails = /* @__PURE__ */ new Map();
		this.nativeMcpAppResultDetailsAttempted = /* @__PURE__ */ new Set();
		this.approvalReviewsByCallId = /* @__PURE__ */ new Map();
		this.rawNativeToolOutputByCallId = /* @__PURE__ */ new Map();
		this.pendingRawPatchOutputIds = /* @__PURE__ */ new Set();
		this.codeModeNativePatchInputsByCallId = /* @__PURE__ */ new Map();
	}
	get transcriptMessages() {
		return this.messages;
	}
	recordToolApprovalReview(toolCallId, reviewId, status, review) {
		const state = this.approvalReviewsByCallId.get(toolCallId) ?? {
			reviews: [],
			denied: false,
			unresolvedReviewIds: /* @__PURE__ */ new Set()
		};
		state.reviews = [...state.reviews.filter((candidate) => candidate.id !== reviewId), review].slice(-16);
		state.denied ||= [
			"denied",
			"timed_out",
			"aborted"
		].includes(status);
		const unresolved = state.unresolvedReviewIds;
		if (status === "in_progress") state.unresolvedReviewIds = unresolved && (unresolved.size < MAX_TOOL_APPROVAL_REVIEWS || unresolved.has(reviewId)) ? unresolved.add(reviewId) : null;
		else unresolved?.delete(reviewId);
		this.approvalReviewsByCallId.set(toolCallId, state);
		return toolApprovalReviewOutcome(state);
	}
	finalizeToolApprovalReviews(toolCallId) {
		const state = this.approvalReviewsByCallId.get(toolCallId);
		if (!state) return;
		state.unresolvedReviewIds = /* @__PURE__ */ new Set();
		return toolApprovalReviewOutcome(state);
	}
	recordDynamicToolCall(params) {
		this.recordToolCall({
			id: params.callId,
			name: params.tool,
			arguments: sanitizeCodexToolArguments(params.arguments)
		});
	}
	recordDynamicToolResult(params, resultContentSource) {
		this.recordToolResult({
			id: params.callId,
			name: params.tool,
			text: collectDynamicToolContentText(params.contentItems),
			isError: !params.success,
			details: params.details,
			...resultContentSource ? { resultContentSource } : {}
		});
	}
	recordNativeToolCall(item) {
		if (!item || !shouldRecordNativeToolTranscript(item)) return;
		const name = itemName(item);
		if (name) this.recordToolCall({
			id: item.id,
			name,
			arguments: itemToolArgs(item)
		});
	}
	recordNativeToolResult(item, details) {
		if (!item || !shouldRecordNativeToolTranscript(item) || this.resultIds.has(item.id)) return;
		const name = itemName(item);
		if (name) {
			const status = itemStatus(item);
			const approvalTimeoutExplanation = this.progress.approvalTimeoutExplanation(item.id, status);
			this.recordToolResult({
				id: item.id,
				name,
				text: approvalTimeoutExplanation ?? this.rawNativeToolOutputByCallId.get(item.id) ?? itemTranscriptResultText(item, this.progress.outputTextByItem),
				isError: isNonSuccessItemStatus(status),
				details,
				...item.type === "webSearch" ? { resultContentSource: "network" } : {}
			});
			this.progress.approvalTimeoutKinds.delete(item.id);
		}
	}
	recordRawNativeToolItem(item) {
		const type = typeof item.type === "string" ? item.type : void 0;
		const callId = typeof item.call_id === "string" ? item.call_id : typeof item.callId === "string" ? item.callId : void 0;
		if (!callId) return;
		if ((type === "custom_tool_call" || type === "function_call") && (item.name === "apply_patch" || item.name === "exec_command" || item.name === "exec")) {
			let args;
			if (type === "custom_tool_call" && item.name === "apply_patch" && typeof item.input === "string") args = { input: item.input };
			else if (type === "custom_tool_call" && item.name === "exec") {
				const input = readCodeModeNativePatchInput(item.input);
				if (input) this.codeModeNativePatchInputsByCallId.set(callId, input);
				return;
			} else if (type === "function_call" && typeof item.arguments === "string") try {
				const parsed = JSON.parse(item.arguments);
				if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
					const parsedArguments = parsed;
					if (item.name === "apply_patch") args = parsedArguments;
					else {
						const patch = readInterceptedNativePatchInput(typeof parsedArguments.cmd === "string" ? parsedArguments.cmd : typeof parsedArguments.command === "string" ? parsedArguments.command : void 0);
						if (patch) {
							const workdir = typeof parsedArguments.workdir === "string" ? parsedArguments.workdir : typeof parsedArguments.cwd === "string" ? parsedArguments.cwd : void 0;
							const cwd = patch.cwd ? workdir && !path.isAbsolute(patch.cwd) ? path.join(workdir, patch.cwd) : patch.cwd : workdir;
							args = {
								input: patch.input,
								...cwd ? { cwd } : {}
							};
						}
					}
				}
			} catch {
				return;
			}
			if (args) {
				this.pendingRawPatchOutputIds.add(callId);
				this.recordToolCall({
					id: callId,
					name: "apply_patch",
					arguments: args
				});
			}
			return;
		}
		if (type !== "custom_tool_call_output" && type !== "function_call_output" || this.namesById.get(callId) !== "apply_patch" && !this.codeModeNativePatchInputsByCallId.has(callId)) return;
		this.pendingRawPatchOutputIds.delete(callId);
		const text = typeof item.output === "string" ? item.output : Array.isArray(item.output) ? collectDynamicToolContentText(item.output) : "";
		if (!text.trim()) return;
		const codeModePatchInput = this.codeModeNativePatchInputsByCallId.get(callId);
		if (codeModePatchInput) {
			this.codeModeNativePatchInputsByCallId.delete(callId);
			const execution = CODE_MODE_NATIVE_PATCH_RESULT_RE.exec(text);
			if (execution?.[1]?.toLowerCase() === "completed" && execution[2]?.trim() === "{}") return;
			if (execution?.[1]?.toLowerCase() === "failed") {
				const failure = execution[2]?.replace(/^Script error:\s*/iu, "").trim() || text;
				this.recordToolCall({
					id: callId,
					name: "apply_patch",
					arguments: { input: codeModePatchInput }
				});
				this.recordToolResult({
					id: callId,
					name: "apply_patch",
					text: failure,
					isError: true
				});
			}
			return;
		}
		this.rawNativeToolOutputByCallId.set(callId, text);
		const result = this.messages.find((message) => message.role === "toolResult" && message.toolCallId === callId);
		if (!result) {
			if (NATIVE_PATCH_REJECTION_RE.test(text)) this.recordToolResult({
				id: callId,
				name: "apply_patch",
				text,
				isError: true
			});
			return;
		}
		result.content = this.createToolResultMessage({
			id: callId,
			name: "apply_patch",
			text,
			isError: result.isError
		}).content;
	}
	async recordNativeToolResultWithDetails(item) {
		const preparedDetails = await this.prepareNativeMcpAppResultDetails(item);
		const approvalReviewState = item ? this.approvalReviewsByCallId.get(item.id) : void 0;
		const reviewDetails = approvalReviewState ? {
			approvalReviews: approvalReviewState.reviews,
			approvalReviewOutcome: toolApprovalReviewOutcome(approvalReviewState)
		} : void 0;
		const details = reviewDetails ? isJsonObject(preparedDetails) ? {
			...preparedDetails,
			...reviewDetails
		} : {
			...preparedDetails !== void 0 ? { toolDetails: preparedDetails } : {},
			...reviewDetails
		} : preparedDetails;
		this.recordNativeToolResult(item, details);
	}
	async prepareNativeMcpAppResultDetails(item) {
		if (!item || item.type !== "mcpToolCall" || itemStatus(item) === "running") return;
		if (this.nativeMcpAppResultDetails.has(item.id)) return this.nativeMcpAppResultDetails.get(item.id);
		if (this.nativeMcpAppResultDetailsAttempted.has(item.id) || !this.options.prepareNativeMcpAppResultDetails) return;
		this.nativeMcpAppResultDetailsAttempted.add(item.id);
		try {
			const details = await this.options.prepareNativeMcpAppResultDetails(item);
			if (details !== void 0) this.nativeMcpAppResultDetails.set(item.id, details);
			return details;
		} catch (error) {
			embeddedAgentLog.debug("codex native MCP App preview preparation failed", {
				itemId: item.id,
				error
			});
			return;
		}
	}
	recordTrajectoryEvent(params) {
		if (params.phase === "start") {
			this.trajectoryCallIds.add(params.item.id);
			this.trajectoryNamesById.set(params.item.id, params.name);
			this.trajectoryItemsById.set(params.item.id, params.item);
			this.options.trajectoryRecorder?.recordEvent("tool.call", {
				threadId: this.threadId,
				turnId: this.turnId,
				itemId: params.item.id,
				toolCallId: params.item.id,
				name: params.name,
				arguments: params.args
			});
			return;
		}
		this.trajectoryResultIds.add(params.item.id);
		const toolResult = itemToolResult(params.item).result;
		const output = this.progress.approvalTimeoutExplanation(params.item.id, params.status) ?? itemOutputText(params.item, this.progress.outputTextByItem);
		this.options.trajectoryRecorder?.recordEvent("tool.result", {
			threadId: this.threadId,
			turnId: this.turnId,
			itemId: params.item.id,
			toolCallId: params.item.id,
			name: params.name,
			status: params.status,
			isError: isNonSuccessItemStatus(params.status),
			...toolResult ? { result: toolResult } : {},
			...output ? { output } : {}
		});
	}
	emitAfterToolCallObservation(item) {
		if (!this.shouldEmitAfterToolCallObservation(item)) return;
		const name = itemName(item);
		const status = itemStatus(item);
		if (!name || status === "running") return;
		this.afterToolCallObservedItemIds.add(item.id);
		const result = itemToolResult(item).result;
		const error = this.progress.approvalTimeoutExplanation(item.id, status) ?? itemToolError(item, status, this.progress.outputTextByItem);
		const startedAt = resolveStartedAtFromDurationMs(item.durationMs);
		const hookParams = {
			toolName: name,
			toolCallId: item.id,
			runId: this.params.runId,
			agentId: this.params.agentId,
			sessionId: this.params.sessionId,
			sessionKey: this.params.sessionKey,
			startArgs: itemToolArgs(item) ?? {},
			...result !== void 0 ? { result } : {},
			...error ? { error } : {},
			...startedAt !== void 0 ? { startedAt } : {}
		};
		setImmediate(() => {
			runAgentHarnessAfterToolCallHook(hookParams);
		});
	}
	synthesizeMissingToolResults(params) {
		if (!params.synthesize) return;
		const missingTranscriptIds = [...this.callIds].filter((id) => !this.resultIds.has(id));
		const missingTrajectoryIds = [...this.trajectoryCallIds].filter((id) => !this.trajectoryResultIds.has(id));
		if (missingTranscriptIds.length === 0 && missingTrajectoryIds.length === 0) return;
		for (const id of missingTranscriptIds) {
			const name = this.namesById.get(id) ?? this.trajectoryNamesById.get(id);
			if (name) this.recordToolResult({
				id,
				name,
				text: formatMissingToolResultError({
					id,
					name
				}),
				isError: true,
				details: { reason: "missing_tool_result" }
			});
		}
		for (const id of missingTrajectoryIds) {
			const name = this.trajectoryNamesById.get(id) ?? this.namesById.get(id);
			if (!name) continue;
			this.trajectoryResultIds.add(id);
			const text = formatMissingToolResultError({
				id,
				name
			});
			this.options.trajectoryRecorder?.recordEvent("tool.result", {
				threadId: this.threadId,
				turnId: this.turnId,
				itemId: id,
				toolCallId: id,
				name,
				status: "failed",
				isError: true,
				result: {
					status: "failed",
					reason: "missing_tool_result"
				},
				output: text
			});
		}
		if (params.terminalDisposition === "tool_error") {
			this.recordMissingToolError(missingTranscriptIds, missingTrajectoryIds);
			return;
		}
		if (params.terminalDisposition === "diagnostic_only") return;
		const missingCount = (/* @__PURE__ */ new Set([...missingTranscriptIds, ...missingTrajectoryIds])).size;
		return missingCount === 1 ? MISSING_TOOL_RESULT_ERROR : `${MISSING_TOOL_RESULT_ERROR} missingToolResultCount=${missingCount}`;
	}
	async readMirroredSessionMessages() {
		return await readCodexMirroredSessionHistoryMessages({
			agentId: this.params.agentId,
			sessionFile: this.params.sessionFile,
			sessionId: this.params.sessionId,
			sessionKey: this.params.sessionKey
		}) ?? [];
	}
	recordToolCall(params) {
		if (!params.id || !params.name || this.callIds.has(params.id)) return;
		this.callIds.add(params.id);
		this.namesById.set(params.id, params.name);
		this.progress.recordTranscriptCall(params);
		const message = attachCodexMirrorIdentity(this.createToolCallMessage(params), `${this.turnId}:tool:${params.id}:call`);
		this.messages.push(message);
		this.options.checkpointMessage?.({ read: () => message });
	}
	recordToolResult(params) {
		if (!params.id || !params.name || this.resultIds.has(params.id)) return;
		this.resultIds.add(params.id);
		this.progress.recordTranscriptResult(params);
		const message = attachCodexMirrorIdentity(this.createToolResultMessage(params), `${this.turnId}:tool:${params.id}:result`);
		this.messages.push(message);
		this.options.checkpointMessage?.({
			read: () => message,
			ready: () => !this.pendingRawPatchOutputIds.has(params.id)
		});
	}
	recordMissingToolError(missingTranscriptIds, missingTrajectoryIds) {
		const firstMissingId = missingTranscriptIds.find((id) => Boolean(this.namesById.get(id))) ?? missingTrajectoryIds.find((id) => Boolean(this.trajectoryNamesById.get(id) ?? this.namesById.get(id)));
		if (!firstMissingId) return;
		const name = this.namesById.get(firstMissingId) ?? this.trajectoryNamesById.get(firstMissingId);
		if (!name) return;
		const item = this.trajectoryItemsById.get(firstMissingId);
		const meta = item ? itemMeta(item, this.progress.toolProgressDetailMode()) : this.progress.getToolMeta(firstMissingId)?.meta;
		this.progress.setLastToolError({
			toolName: name,
			...meta ? { meta } : {},
			error: formatMissingToolResultError({
				id: firstMissingId,
				name
			}),
			...item && isMutatingNativeToolItem(item) ? { mutatingAction: true } : {}
		});
	}
	shouldEmitAfterToolCallObservation(item) {
		if (!shouldSynthesizeToolProgressForItem(item) || this.afterToolCallObservedItemIds.has(item.id)) return false;
		return !(this.options.nativePostToolUseRelayEnabled && isNativePostToolUseRelayItem(item));
	}
	createToolCallMessage(params) {
		const args = normalizeToolTranscriptArguments(params.arguments);
		const attribution = resolveCodexLocalRuntimeAttribution(this.params);
		return {
			role: "assistant",
			content: [{
				type: "toolCall",
				id: params.id,
				name: params.name,
				arguments: args,
				input: args
			}],
			api: attribution.api ?? "openai-chatgpt-responses",
			provider: attribution.provider,
			model: this.params.modelId,
			usage: ZERO_USAGE,
			stopReason: "toolUse",
			timestamp: this.nextTranscriptTimestamp()
		};
	}
	createToolResultMessage(params) {
		const text = truncateToolTranscriptText(params.text?.trim() || toolResultStatusText(params));
		return {
			role: "toolResult",
			toolCallId: params.id,
			toolName: params.name,
			isError: params.isError,
			content: [{
				type: "toolResult",
				id: params.id,
				name: params.name,
				toolName: params.name,
				toolCallId: params.id,
				toolUseId: params.id,
				tool_use_id: params.id,
				content: text,
				text
			}],
			...params.details !== void 0 ? { details: params.details } : {},
			...params.resultContentSource ? { __openclaw: { resultContentSource: params.resultContentSource } } : {},
			timestamp: this.nextTranscriptTimestamp()
		};
	}
};
function formatMissingToolResultError(params) {
	return `${MISSING_TOOL_RESULT_ERROR} toolCallId=${params.id}; toolName=${params.name}`;
}
function toolResultStatusText(params) {
	return params.isError ? `${params.name} failed` : `${params.name} completed`;
}
function resolveStartedAtFromDurationMs(durationMs) {
	if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) return;
	return asDateTimestampMs(Date.now() - Math.max(0, durationMs));
}
//#endregion
//#region extensions/codex/src/app-server/event-projector-events.ts
/** Downstream event consumers must never corrupt the canonical Codex turn projection. */
function emitCodexAgentEvent(params, event) {
	try {
		emitAgentEvent({
			runId: params.runId,
			stream: event.stream,
			data: event.data,
			...params.sessionKey ? { sessionKey: params.sessionKey } : {}
		});
	} catch (error) {
		embeddedAgentLog.debug("codex app-server global agent event emit failed", { error });
	}
	try {
		const maybePromise = params.onAgentEvent?.(event);
		Promise.resolve(maybePromise).catch((error) => {
			embeddedAgentLog.debug("codex app-server agent event handler rejected", { error });
		});
	} catch (error) {
		embeddedAgentLog.debug("codex app-server agent event handler threw", { error });
	}
}
function guardianActionCommand(action) {
	if (!action) return;
	const directLabel = readStringField(action, "command") ?? readStringField(action, "target") ?? readStringField(action, "toolTitle") ?? readStringField(action, "reason");
	if (directLabel) return directLabel;
	const server = readStringField(action, "connectorName") ?? readStringField(action, "server");
	const tool = readStringField(action, "toolName");
	if (server && tool) return `${server}/${tool}`;
	const argv = Array.isArray(action.argv) ? action.argv.filter((value) => typeof value === "string") : [];
	return argv.length > 0 ? argv.join(" ") : readStringField(action, "program");
}
function normalizeApprovalReviewStatus(status) {
	return status === "inProgress" ? "in_progress" : status === "timedOut" ? "timed_out" : status;
}
const GUARDIAN_TIMEOUT_WARNING = "Automatic approval review timed out while evaluating the requested approval.";
const LOG_ONLY_CODEX_WARNING_PATTERNS = [/^Configured service tier `[^`\r\n]+` is not advertised as supported for model `[^`\r\n]+` and will be omitted from requests\.$/, /^Code Mode is enabled in configuration, but model `[^`\r\n]+` does not advertise Code Mode support\. This may degrade model performance\. Disable `features\.code_mode` and `features\.code_mode_only`, or select a model whose metadata enables Code Mode\.$/];
function projectNormalizedToolItem(params) {
	const { item } = params;
	if (!item || !shouldSynthesizeToolProgressForItem(item)) return;
	const name = itemName(item);
	if (!name) return;
	const status = params.phase === "result" ? itemStatus(item) : "running";
	const args = itemToolArgs(item);
	const commandBearing = isCommandBearingToolItem(item, args);
	const meta = itemMeta(item, params.detailMode);
	return {
		name,
		status,
		args,
		meta,
		event: shouldEmitTranscriptToolProgress(name, args) ? {
			stream: "tool",
			data: {
				phase: params.phase,
				name,
				itemId: item.id,
				toolCallId: item.id,
				...meta ? { meta } : {},
				...commandBearing ? { commandBearing: true } : {},
				...params.phase === "start" && args ? { args } : {},
				...params.phase === "result" ? {
					status,
					isError: isNonSuccessItemStatus(status),
					...itemToolResult(item)
				} : {}
			}
		} : void 0
	};
}
var CodexEventProjection = class {
	constructor(threadId, turnId, emitAgentEvent, toolProgress, toolTranscript, onNativeToolResultRecorded) {
		this.threadId = threadId;
		this.turnId = turnId;
		this.emitAgentEvent = emitAgentEvent;
		this.toolProgress = toolProgress;
		this.toolTranscript = toolTranscript;
		this.onNativeToolResultRecorded = onNativeToolResultRecorded;
		this.reviewCount = 0;
	}
	get guardianReviewCount() {
		return this.reviewCount;
	}
	emitCompactionEnd(itemId, completed) {
		this.emitAgentEvent({
			stream: "compaction",
			data: {
				phase: "end",
				backend: "codex-app-server",
				completed,
				threadId: this.threadId,
				turnId: this.turnId,
				itemId
			}
		});
	}
	handleGuardianReview(method, params) {
		this.reviewCount += 1;
		const review = isJsonObject(params.review) ? params.review : void 0;
		const action = isJsonObject(params.action) ? params.action : void 0;
		const reviewId = readStringField(params, "reviewId");
		const targetItemId = readNullableString$1(params, "targetItemId");
		const command = guardianActionCommand(action);
		const reviewStatus = review ? readStringField(review, "status") : void 0;
		const status = normalizeApprovalReviewStatus(reviewStatus);
		const riskLevel = review ? readStringField(review, "riskLevel") : void 0;
		const userAuthorization = review ? readStringField(review, "userAuthorization") : void 0;
		const rationale = review ? readNullableString$1(review, "rationale") : void 0;
		const expectedWarning = status === "timed_out" ? GUARDIAN_TIMEOUT_WARNING : rationale && riskLevel && userAuthorization && (status === "approved" || status === "denied") ? `Automatic approval review ${status} (risk: ${riskLevel}, authorization: ${userAuthorization}): ${rationale}` : void 0;
		if (Boolean(targetItemId) && Boolean(reviewId) && this.pendingGuardianWarning === expectedWarning) this.pendingGuardianWarning = void 0;
		else this.flushPendingGuardianWarning();
		const threadId = readStringField(params, "threadId") ?? this.threadId;
		const turnId = readStringField(params, "turnId") ?? this.turnId;
		if (method.endsWith("/started")) this.activeGuardianReview = {
			reviewId,
			targetItemId,
			command,
			threadId,
			turnId
		};
		this.emitAgentEvent({
			stream: "codex_app_server.guardian",
			data: {
				method,
				phase: method.endsWith("/started") ? "started" : "completed",
				threadId,
				turnId,
				reviewId,
				targetItemId,
				decisionSource: readStringField(params, "decisionSource"),
				status: reviewStatus,
				riskLevel,
				userAuthorization,
				rationale,
				actionType: action ? readStringField(action, "type") : void 0,
				command
			}
		});
		if (reviewId && targetItemId && status) {
			const approvalReview = {
				id: reviewId,
				label: "Guardian",
				status,
				...riskLevel ? { riskLevel } : {},
				...userAuthorization ? { userAuthorization } : {},
				...rationale ? { rationale } : {}
			};
			const approvalReviewOutcome = this.toolTranscript.recordToolApprovalReview(targetItemId, reviewId, status, approvalReview);
			this.emitAgentEvent({
				stream: "tool",
				data: {
					phase: "review",
					toolCallId: targetItemId,
					hideFromChannelProgress: true,
					approvalReviewOutcome,
					review: approvalReview
				}
			});
		}
		if (method.endsWith("/completed") && this.activeGuardianReview?.reviewId === reviewId) this.activeGuardianReview = void 0;
	}
	handleGuardianWarning(params) {
		this.flushPendingGuardianWarning();
		const message = readStringField(params, "message");
		if (message) {
			this.pendingGuardianWarning = message;
			return;
		}
		this.emitAgentEvent({
			stream: "codex_app_server.guardian",
			data: {
				phase: "warning",
				message
			}
		});
	}
	handleWarning(params) {
		const message = [readStringField(params, "summary") ?? readStringField(params, "message"), readStringField(params, "details")].filter(Boolean).join("\n");
		if (LOG_ONLY_CODEX_WARNING_PATTERNS.some((pattern) => pattern.test(message))) embeddedAgentLog.warn(message);
		else if (message) this.emitAgentEvent({
			stream: "notice",
			data: {
				phase: "warning",
				message
			}
		});
	}
	handleModelRerouted(params) {
		const fromModel = readStringField(params, "fromModel");
		const toModel = readStringField(params, "toModel");
		const reason = readStringField(params, "reason");
		if (fromModel && toModel && fromModel !== toModel) this.emitAgentEvent({
			stream: "fallback",
			data: {
				fromModel,
				toModel,
				...reason ? { reason } : {}
			}
		});
	}
	flushPendingGuardianWarning() {
		const pending = this.pendingGuardianWarning;
		if (!pending) return;
		this.pendingGuardianWarning = void 0;
		this.emitAgentEvent({
			stream: "codex_app_server.guardian",
			data: {
				phase: "warning",
				message: pending
			}
		});
	}
	handleStrictReviewRequired(params) {
		this.emitAgentEvent({
			stream: "codex_app_server.guardian",
			data: {
				method: "autoApprovalReview/strictReviewRequired",
				phase: "strict_review_required",
				threadId: readStringField(params, "threadId") ?? this.activeGuardianReview?.threadId ?? this.threadId,
				turnId: readStringField(params, "turnId") ?? this.activeGuardianReview?.turnId ?? this.turnId,
				reviewId: this.activeGuardianReview?.reviewId,
				targetItemId: this.activeGuardianReview?.targetItemId,
				command: this.activeGuardianReview?.command,
				startedAtMs: asFiniteNumber(params.startedAtMs)
			}
		});
	}
	handleHook(method, params) {
		const run = isJsonObject(params.run) ? params.run : void 0;
		if (!run) return;
		const durationMs = asFiniteNumber(run.durationMs);
		const entries = readHookOutputEntries(run.entries);
		const hookTurnId = readNullableString$1(params, "turnId");
		this.emitAgentEvent({
			stream: "codex_app_server.hook",
			data: {
				phase: method === "hook/started" ? "started" : "completed",
				threadId: this.threadId,
				turnId: hookTurnId === void 0 ? this.turnId : hookTurnId,
				hookRunId: readStringField(run, "id"),
				eventName: readStringField(run, "eventName"),
				handlerType: readStringField(run, "handlerType"),
				executionMode: readStringField(run, "executionMode"),
				scope: readStringField(run, "scope"),
				source: readStringField(run, "source"),
				sourcePath: readStringField(run, "sourcePath"),
				status: readStringField(run, "status"),
				statusMessage: readNullableString$1(run, "statusMessage"),
				...durationMs !== void 0 ? { durationMs } : {},
				...entries.length > 0 ? { entries } : {}
			}
		});
	}
	emitStandardItemEvent(params) {
		const { item } = params;
		if (!item) return;
		const kind = itemKind(item);
		if (!kind) return;
		const name = itemName(item);
		const commandBearing = isCommandBearingToolItem(item, itemToolArgs(item));
		const meta = itemMeta(item, this.toolProgress.toolProgressDetailMode());
		const suppressChannelProgress = shouldSuppressChannelProgressForItem(item);
		this.emitAgentEvent({
			stream: "item",
			data: {
				itemId: item.id,
				phase: params.phase,
				kind,
				title: itemTitle(item),
				status: params.phase === "start" ? "running" : itemStatus(item),
				...name ? { name } : {},
				...meta ? { meta } : {},
				...commandBearing ? { commandBearing: true } : {},
				...suppressChannelProgress ? { suppressChannelProgress: true } : {}
			}
		});
	}
	async emitNormalizedToolItemEvent(params) {
		const projection = projectNormalizedToolItem({
			...params,
			detailMode: this.toolProgress.toolProgressDetailMode()
		});
		if (!projection || !params.item) return;
		const { item } = params;
		const { name, status, args, meta, event } = projection;
		const approvalReviewOutcome = params.phase === "result" ? this.toolTranscript.finalizeToolApprovalReviews(item.id) : void 0;
		if (event && approvalReviewOutcome) event.data.approvalReviewOutcome = approvalReviewOutcome;
		this.toolTranscript.recordTrajectoryEvent({
			phase: params.phase,
			item,
			name,
			args,
			status
		});
		if (params.phase === "result") this.toolProgress.recordNativeToolError({
			item,
			name,
			meta,
			status
		});
		if (!event) {
			if (params.phase === "result") {
				this.toolTranscript.emitAfterToolCallObservation(item);
				await this.onNativeToolResultRecorded?.();
			}
			return;
		}
		this.emitAgentEvent(event);
		if (params.phase === "result") {
			this.toolTranscript.emitAfterToolCallObservation(item);
			await this.onNativeToolResultRecorded?.();
		}
	}
};
//#endregion
//#region extensions/codex/src/app-server/native-subagent-notification.ts
/**
* Extracts native Codex subagent completion notifications from trusted
* inter-agent commentary messages emitted by the app-server.
*/
const CODEX_SUBAGENT_NOTIFICATION_START = "<subagent_notification>";
const CODEX_SUBAGENT_NOTIFICATION_END = "</subagent_notification>";
/** Extracts trusted subagent completion payloads from a Codex server notification. */
function extractCodexNativeSubagentCompletions(notification) {
	const params = isJsonObject(notification.params) ? notification.params : void 0;
	if (!params) return [];
	const item = isJsonObject(params.item) ? params.item : void 0;
	if (!item) return [];
	const text = readTrustedInterAgentCommunicationContent(item);
	if (!text) return [];
	const author = readTrustedInterAgentCommunicationAuthor(item);
	return extractCodexNativeSubagentCompletionsFromText(text).filter((completion) => completion.agentPath === author);
}
/** Parses one or more tagged subagent completion payloads from commentary text. */
function extractCodexNativeSubagentCompletionsFromText(text) {
	const completions = [];
	let cursor = 0;
	while (cursor < text.length) {
		const start = text.indexOf(CODEX_SUBAGENT_NOTIFICATION_START, cursor);
		if (start < 0) break;
		const bodyStart = start + 23;
		const end = text.indexOf(CODEX_SUBAGENT_NOTIFICATION_END, bodyStart);
		if (end < 0) break;
		const parsed = parseCodexNativeSubagentNotificationBody(text.slice(bodyStart, end));
		if (parsed) completions.push(parsed);
		cursor = end + 24;
	}
	return completions;
}
const codexNativeSubagentNotifications = {
	fromNotification: extractCodexNativeSubagentCompletions,
	fromText: extractCodexNativeSubagentCompletionsFromText,
	deliveredAgentPaths: readDeliveredNativeCompletionPaths
};
/** Reads native delivery receipts, leaving status and result ownership with the child lifecycle. */
function readDeliveredNativeCompletionPaths(notification) {
	if (notification.method !== "rawResponseItem/completed") return [];
	const params = isJsonObject(notification.params) ? notification.params : void 0;
	const item = isJsonObject(params?.item) ? params.item : void 0;
	if (!item || readStringField(item, "type") !== "agent_message") return extractCodexNativeSubagentCompletions(notification).map((completion) => completion.agentPath);
	const author = readStringField(item, "author");
	const recipient = readStringField(item, "recipient");
	const content = item.content;
	if (!author || !recipient || !Array.isArray(content) || content.length !== 1) return [];
	const part = content[0];
	if (!isJsonObject(part) || readStringField(part, "type") !== "input_text") return [];
	return readStringField(part, "text")?.startsWith(`Message Type: FINAL_ANSWER\nTask name: ${recipient}\nSender: ${author}\nPayload:\n`) ? [author] : [];
}
function parseCodexNativeSubagentNotificationBody(body) {
	let payload;
	try {
		payload = JSON.parse(body.trim());
	} catch {
		return;
	}
	if (!isJsonObject(payload)) return;
	const agentPath = readStringField(payload, "agent_path")?.trim();
	const status = isJsonObject(payload.status) ? payload.status : void 0;
	if (!agentPath || !status) return;
	const statusEntry = readCompletionStatus(status);
	if (!statusEntry) return;
	return {
		agentPath,
		status: statusEntry.status,
		statusLabel: statusEntry.label,
		result: statusEntry.result
	};
}
function readCompletionStatus(status) {
	for (const [rawKey, value] of Object.entries(status)) {
		const mappedStatus = mapCompletionStatus(normalizeStatusKey(rawKey));
		if (!mappedStatus) continue;
		const result = stringifyResult(value, mappedStatus);
		return {
			status: mappedStatus,
			label: mappedStatus === "succeeded" && result.kind === "no_final_assistant_message" ? "completed_without_final_message" : rawKey,
			result: result.text
		};
	}
}
function mapCompletionStatus(value) {
	if (value === "completed" || value === "succeeded" || value === "success") return "succeeded";
	if (value === "cancelled" || value === "canceled" || value === "interrupted" || value === "shutdown") return "cancelled";
	if (value === "failed" || value === "error" || value === "errored" || value === "systemerror" || value === "notfound") return "failed";
}
function stringifyResult(value, status) {
	if (typeof value === "string") {
		const text = value.trim();
		if (text) return { text };
		return status === "succeeded" ? completedWithoutFinalAssistantMessage() : { text: "(no output)" };
	}
	if (value === null || value === void 0) return status === "succeeded" ? completedWithoutFinalAssistantMessage() : { text: "(no output)" };
	try {
		return { text: JSON.stringify(value) };
	} catch {
		return { text: "(unserializable output)" };
	}
}
function completedWithoutFinalAssistantMessage() {
	return {
		text: "Codex native subagent completed without a final assistant message.",
		kind: "no_final_assistant_message"
	};
}
function readTrustedInterAgentCommunicationContent(item) {
	const communication = readTrustedInterAgentCommunication(item);
	return typeof communication?.content === "string" ? communication.content : void 0;
}
function readTrustedInterAgentCommunicationAuthor(item) {
	const communication = readTrustedInterAgentCommunication(item);
	return typeof communication?.author === "string" ? communication.author : void 0;
}
function readTrustedInterAgentCommunication(item) {
	if (readStringField(item, "type") !== "message" || readStringField(item, "role") !== "assistant" || readStringField(item, "phase") !== "commentary") return;
	const text = extractSingleTextPart(item);
	if (!text) return;
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		return;
	}
	if (!isJsonObject(parsed)) return;
	if (typeof parsed.author !== "string" || typeof parsed.recipient !== "string" || typeof parsed.content !== "string" || parsed.trigger_turn !== false) return;
	return parsed;
}
function extractSingleTextPart(item) {
	const content = item.content;
	if (!Array.isArray(content) || content.length !== 1) return;
	const [entry] = content;
	if (!isJsonObject(entry)) return;
	const type = readStringField(entry, "type");
	if (type !== "output_text" && type !== "text") return;
	return readStringField(entry, "text")?.trim();
}
function normalizeStatusKey(value) {
	return value.replace(/[^a-z0-9]/giu, "").toLowerCase();
}
//#endregion
//#region extensions/codex/src/app-server/native-subagent-task-ids.ts
/**
* Shared identifiers for representing Codex native subagents as OpenClaw task
* runtime rows.
*/
/** Task runtime namespace for Codex native subagent task rows. */
const CODEX_NATIVE_SUBAGENT_RUNTIME = "subagent";
/** Task kind used to distinguish native Codex subagents from other subagent runtimes. */
const CODEX_NATIVE_SUBAGENT_TASK_KIND = "codex-native";
/** Run id prefix for task rows keyed by Codex child thread ids. */
const CODEX_NATIVE_SUBAGENT_RUN_ID_PREFIX = "codex-thread:";
//#endregion
//#region extensions/codex/src/app-server/native-subagent-task-mirror.ts
/** Projects Codex thread and collab-agent notifications into task lifecycle updates. */
var CodexNativeSubagentTaskMirror = class {
	constructor(params, runtime) {
		this.params = params;
		this.runtime = runtime;
		this.mirrorStateByThreadId = /* @__PURE__ */ new Map();
		this.terminalRunIds = /* @__PURE__ */ new Set();
		this.authoritativeRunIds = /* @__PURE__ */ new Set();
		this.expectedAuthoritativeRunIds = /* @__PURE__ */ new Set();
		this.now = params.now ?? Date.now;
	}
	markAuthoritativeCompletion(childThreadId) {
		const runId = codexNativeSubagentRunId(childThreadId);
		this.authoritativeRunIds.add(runId);
		this.terminalRunIds.add(runId);
	}
	markAuthoritativeCompletionExpected(childThreadId) {
		this.expectedAuthoritativeRunIds.add(codexNativeSubagentRunId(childThreadId));
	}
	handleNotification(notification) {
		const params = isJsonObject(notification.params) ? notification.params : void 0;
		if (!params) return;
		if (notification.method === "thread/started") {
			this.handleThreadStarted(params);
			return;
		}
		if (notification.method === "thread/status/changed") {
			this.handleThreadStatusChanged(params);
			return;
		}
		if (notification.method === "item/started" || notification.method === "item/completed") {
			const item = isJsonObject(params.item) ? params.item : void 0;
			if (notification.method === "item/completed" && item && readStringField(item, "type") === "subAgentActivity") {
				this.handleSubagentActivityItem(params);
				return;
			}
			this.handleCollabAgentItem(params);
		}
	}
	handleThreadStarted(params) {
		const notification = readThreadStartedNotification(params);
		if (!notification) return;
		const thread = notification.thread;
		const spawn = readSubagentThreadSpawnSource(thread.source, this.params.parentThreadId);
		if (!spawn) return;
		const threadId = thread.id.trim();
		const label = normalizeOptionalString(spawn.agent_nickname) ?? normalizeOptionalString(thread.agentNickname) ?? normalizeOptionalString(spawn.agent_role) ?? normalizeOptionalString(thread.agentRole) ?? "Codex subagent";
		const task = normalizeOptionalString(thread.preview) ?? `Codex native subagent${label === "Codex subagent" ? "" : ` ${label}`}`;
		const createdAt = secondsToMillis(thread.createdAt) ?? this.now();
		if (!this.createRunningTask({
			threadId,
			label,
			task,
			startedAt: createdAt,
			progressSummary: "Codex native subagent started."
		})) return;
		this.applyStatus(threadId, thread.status);
	}
	handleThreadStatusChanged(params) {
		const notification = readThreadStatusChangedNotification(params);
		if (!notification) return;
		this.applyStatus(notification.threadId, notification.status);
	}
	applyStatus(threadId, status) {
		if (this.mirrorStateByThreadId.get(threadId) === "failed") return;
		const statusType = status?.type;
		if (!statusType) return;
		const runId = codexNativeSubagentRunId(threadId);
		if (this.authoritativeRunIds.has(runId)) return;
		if (this.terminalRunIds.has(runId) && statusType !== "systemError") return;
		const eventAt = this.now();
		if (statusType === "active") {
			this.runtime.recordTaskRunProgressByRunId({
				runId,
				lastEventAt: eventAt,
				progressSummary: "Codex native subagent is active."
			});
			return;
		}
		if (statusType === "idle") {
			this.runtime.recordTaskRunProgressByRunId({
				runId,
				lastEventAt: eventAt,
				progressSummary: "Codex native subagent is idle."
			});
			return;
		}
		if (statusType === "systemError") {
			if (this.expectedAuthoritativeRunIds.has(runId)) {
				this.terminalRunIds.delete(runId);
				this.runtime.recordTaskRunProgressByRunId({
					runId,
					lastEventAt: eventAt,
					progressSummary: "Codex native subagent hit a system error; awaiting recovery."
				});
				return;
			}
			this.terminalRunIds.add(runId);
			this.runtime.finalizeTaskRunByRunId({
				runId,
				status: "failed",
				endedAt: eventAt,
				lastEventAt: eventAt,
				error: "Codex app-server reported a system error for the native subagent thread.",
				progressSummary: "Codex native subagent hit a system error.",
				terminalSummary: "Codex native subagent failed."
			});
			return;
		}
		if (statusType === "notLoaded") this.runtime.recordTaskRunProgressByRunId({
			runId,
			lastEventAt: eventAt,
			progressSummary: "Codex native subagent is not loaded."
		});
	}
	handleCollabAgentItem(params) {
		const item = isJsonObject(params.item) ? params.item : void 0;
		if (!item || readStringField(item, "type") !== "collabAgentToolCall") return;
		if ((readStringField(item, "senderThreadId") ?? readStringField(params, "threadId")) !== this.params.parentThreadId) return;
		const isSpawnAgentTool = normalizeToolName(readStringField(item, "tool")) === "spawnagent";
		const receiverThreadIds = readStringArray$1(item.receiverThreadIds);
		const agentsStates = readAgentsStates(item.agentsStates);
		const spawnChildThreadIds = /* @__PURE__ */ new Set([...receiverThreadIds, ...agentsStates.keys()]);
		if (isSpawnAgentTool) for (const childThreadId of spawnChildThreadIds) this.createTaskFromCollabSpawnItem(childThreadId, item);
		const toolCallStatus = normalizeCollabToolCallStatus(readStringField(item, "status"));
		const terminalToolCallThreadIds = /* @__PURE__ */ new Set();
		if (isSpawnAgentTool && isBlockedOrFailedCollabToolCallStatus(toolCallStatus)) {
			for (const threadId of spawnChildThreadIds) terminalToolCallThreadIds.add(threadId);
			for (const threadId of agentsStates.keys()) terminalToolCallThreadIds.add(threadId);
		}
		const terminalAgentStateThreadIds = /* @__PURE__ */ new Set();
		for (const [threadId, state] of agentsStates) {
			const normalizedStatus = normalizeAgentStateStatus(state.status);
			if (terminalToolCallThreadIds.has(threadId) && isNonTerminalAgentStateStatus(normalizedStatus)) continue;
			this.applyCollabAgentStatus(threadId, normalizedStatus, state.message);
			if (isTerminalAgentStateStatus(normalizedStatus)) terminalAgentStateThreadIds.add(threadId);
		}
		if (isBlockedOrFailedCollabToolCallStatus(toolCallStatus)) for (const threadId of terminalToolCallThreadIds) {
			if (terminalAgentStateThreadIds.has(threadId)) continue;
			const state = agentsStates.get(threadId);
			this.applyCollabAgentStatus(threadId, toolCallStatus, state?.message);
		}
	}
	handleSubagentActivityItem(params) {
		const item = isJsonObject(params.item) ? params.item : void 0;
		if (!item || readStringField(item, "type") !== "subAgentActivity" || readStringField(params, "threadId") !== this.params.parentThreadId) return;
		const threadId = normalizeOptionalString(readStringField(item, "agentThreadId"));
		const kind = normalizeSubagentActivityKind(readStringField(item, "kind"));
		if (!threadId || !kind) return;
		if (kind === "started") {
			this.createTaskFromSubagentActivity(threadId, normalizeOptionalString(readStringField(item, "agentPath")));
			return;
		}
		if (this.mirrorStateByThreadId.get(threadId) !== "mirrored") return;
		const message = kind === "interacted" ? "Codex native subagent received more input." : "Codex native subagent was interrupted.";
		this.applyCollabAgentStatus(threadId, kind === "interacted" ? "running" : "interrupted", message);
	}
	createTaskFromSubagentActivity(threadId, agentPath) {
		const eventAt = this.now();
		this.createRunningTask({
			threadId,
			label: "Codex subagent",
			task: agentPath ? `Codex native subagent ${agentPath}` : "Codex native subagent",
			startedAt: eventAt,
			progressSummary: "Codex native subagent started."
		});
	}
	createTaskFromCollabSpawnItem(threadId, item) {
		const prompt = normalizeOptionalString(readStringField(item, "prompt"));
		const createdAt = this.now();
		this.createRunningTask({
			threadId,
			label: "Codex subagent",
			task: prompt ?? "Codex native subagent",
			startedAt: createdAt,
			progressSummary: "Codex native subagent spawned."
		});
	}
	createRunningTask(params) {
		const threadId = params.threadId.trim();
		if (!threadId || this.mirrorStateByThreadId.get(threadId) === "mirrored") return false;
		this.mirrorStateByThreadId.set(threadId, "mirrored");
		const runId = codexNativeSubagentRunId(threadId);
		if (!this.runtime.tryCreateRunningTaskRun({
			sourceId: runId,
			agentId: this.params.agentId,
			runId,
			label: params.label,
			task: params.task,
			notifyPolicy: "silent",
			deliveryStatus: "not_applicable",
			preferMetadata: true,
			startedAt: params.startedAt,
			lastEventAt: this.now(),
			progressSummary: params.progressSummary
		})) {
			this.mirrorStateByThreadId.set(threadId, "failed");
			return false;
		}
		this.terminalRunIds.delete(runId);
		this.authoritativeRunIds.delete(runId);
		return true;
	}
	applyCollabAgentStatus(threadId, status, message) {
		if (this.mirrorStateByThreadId.get(threadId) === "failed") return;
		const normalizedStatus = normalizeAgentStateStatus(status);
		if (!normalizedStatus) return;
		const runId = codexNativeSubagentRunId(threadId);
		if (this.authoritativeRunIds.has(runId)) return;
		if (this.terminalRunIds.has(runId) && isNonTerminalAgentStateStatus(normalizedStatus)) return;
		const eventAt = this.now();
		if (isNonTerminalAgentStateStatus(normalizedStatus)) {
			this.runtime.recordTaskRunProgressByRunId({
				runId,
				lastEventAt: eventAt,
				progressSummary: normalizeOptionalString(message) ?? (normalizedStatus === "pendingInit" ? "Codex native subagent is initializing." : normalizedStatus === "interrupted" ? "Codex native subagent was interrupted." : "Codex native subagent is running.")
			});
			return;
		}
		if (normalizedStatus === "completed") {
			this.terminalRunIds.add(runId);
			const summary = normalizeOptionalString(message) ?? "Codex native subagent completed.";
			if (this.expectedAuthoritativeRunIds.has(runId)) this.runtime.recordTaskRunProgressByRunId({
				runId,
				lastEventAt: eventAt,
				progressSummary: summary
			});
			else this.runtime.finalizeTaskRunByRunId({
				runId,
				status: "succeeded",
				endedAt: eventAt,
				lastEventAt: eventAt,
				progressSummary: summary,
				terminalSummary: summary
			});
			return;
		}
		if (normalizedStatus === "blocked") {
			this.terminalRunIds.add(runId);
			this.runtime.finalizeTaskRunByRunId({
				runId,
				status: "succeeded",
				endedAt: eventAt,
				lastEventAt: eventAt,
				progressSummary: normalizeOptionalString(message) ?? "Codex native subagent blocked.",
				terminalSummary: normalizeOptionalString(message) ?? "Codex native subagent blocked.",
				terminalOutcome: "blocked"
			});
			return;
		}
		this.terminalRunIds.add(runId);
		this.runtime.finalizeTaskRunByRunId({
			runId,
			status: normalizedStatus === "shutdown" ? "cancelled" : "failed",
			endedAt: eventAt,
			lastEventAt: eventAt,
			error: normalizeOptionalString(message) ?? `Codex native subagent status: ${normalizedStatus}`,
			progressSummary: normalizeOptionalString(message) ?? `Codex native subagent ${normalizedStatus}.`,
			terminalSummary: normalizeOptionalString(message) ?? "Codex native subagent did not complete."
		});
	}
};
/** Converts a Codex child thread id into the OpenClaw task-runtime run id. */
function codexNativeSubagentRunId(threadId) {
	return `${CODEX_NATIVE_SUBAGENT_RUN_ID_PREFIX}${threadId.trim()}`;
}
/** Reads a subagent thread-spawn source only when it belongs to the expected parent thread. */
function readSubagentThreadSpawnSource(source, parentThreadId) {
	if (!source || typeof source !== "object" || !("subAgent" in source)) return;
	const subAgent = source.subAgent;
	if (!subAgent || typeof subAgent !== "object" || !("thread_spawn" in subAgent)) return;
	const spawn = subAgent.thread_spawn;
	if (!spawn || typeof spawn !== "object") return;
	return spawn.parent_thread_id === parentThreadId ? spawn : void 0;
}
function readThreadStartedNotification(params) {
	const thread = params.thread;
	if (!isJsonObject(thread) || typeof thread.id !== "string") return;
	return { thread };
}
function readThreadStatusChangedNotification(params) {
	if (typeof params.threadId !== "string") return;
	const status = params.status;
	if (!isJsonObject(status) || !isCodexThreadStatusType(status.type)) return;
	return {
		threadId: params.threadId,
		status
	};
}
function isCodexThreadStatusType(value) {
	return value === "notLoaded" || value === "idle" || value === "systemError" || value === "active";
}
function readAgentsStates(value) {
	const states = /* @__PURE__ */ new Map();
	if (!isJsonObject(value)) return states;
	for (const [threadId, rawState] of Object.entries(value)) {
		if (!isJsonObject(rawState)) continue;
		const status = readStringField(rawState, "status");
		const message = readNullableString(rawState, "message");
		states.set(threadId, {
			status,
			message
		});
	}
	return states;
}
function readStringArray$1(value) {
	if (!Array.isArray(value)) return [];
	return value.filter((entry) => typeof entry === "string" && entry.trim() !== "");
}
function readNullableString(value, key) {
	const entry = value[key];
	return typeof entry === "string" || entry === null ? entry : void 0;
}
function normalizeToolName(value) {
	return value?.replace(/[^a-z0-9]/giu, "").toLowerCase();
}
function normalizeSubagentActivityKind(value) {
	const key = value?.replace(/[^a-z]/giu, "").toLowerCase();
	return key === "started" || key === "interacted" || key === "interrupted" ? key : void 0;
}
function normalizeCollabToolCallStatus(value) {
	const key = value?.replace(/[^a-z0-9]/giu, "").toLowerCase();
	if (key === "completed" || key === "succeeded" || key === "success") return "completed";
	if (key === "failed" || key === "error" || key === "errored") return "failed";
	if (key === "blocked" || key === "declined") return "blocked";
	if (key === "inprogress" || key === "running") return "running";
	return value?.trim();
}
function isBlockedOrFailedCollabToolCallStatus(value) {
	return value === "failed" || value === "blocked";
}
function isNonTerminalAgentStateStatus(value) {
	return value === "pendingInit" || value === "running" || value === "interrupted";
}
function isTerminalAgentStateStatus(value) {
	return value !== void 0 && !isNonTerminalAgentStateStatus(value);
}
function normalizeAgentStateStatus(value) {
	const key = value?.replace(/[^a-z0-9]/giu, "").toLowerCase();
	if (!key) return;
	if (key === "pendinginit") return "pendingInit";
	if (key === "inprogress" || key === "running") return "running";
	if (key === "completed" || key === "succeeded" || key === "success") return "completed";
	if (key === "interrupted" || key === "cancelled" || key === "canceled" || key === "shutdown") return key === "shutdown" ? "shutdown" : "interrupted";
	if (key === "failed" || key === "error" || key === "systemerror") return "failed";
	if (key === "blocked" || key === "declined") return "blocked";
	return value?.trim();
}
function secondsToMillis(value) {
	if (typeof value !== "number" || !Number.isFinite(value)) return;
	return value * 1e3;
}
//#endregion
//#region extensions/codex/src/app-server/native-subagent-monitor.ts
/**
* Mirrors Codex native subagent lifecycle and completion into OpenClaw task
* runtime records, with app-server history as the recovery source.
*/
const DEFAULT_RECOVERY_POLL_DELAYS_MS = [
	2e3,
	5e3,
	1e4,
	15e3,
	3e4,
	6e4,
	12e4,
	3e5
];
const DEFAULT_COMPLETION_DELIVERY_RETRY_DELAYS_MS = [
	5e3,
	15e3,
	3e4,
	6e4,
	12e4,
	3e5
];
const RECENT_TERMINAL_TASK_RECONCILE_GRACE_MS = 6e4;
const THREAD_READ_TIMEOUT_MS = 3e4;
const NATIVE_SUBAGENT_NOTIFICATION_METHODS = /* @__PURE__ */ new Set([
	"thread/started",
	"thread/status/changed",
	"turn/started",
	"turn/completed",
	"item/agentMessage/delta",
	"item/reasoning/summaryTextDelta",
	"item/started",
	"item/completed",
	"rawResponseItem/completed"
]);
const RECOVERY_REVISION_NOTIFICATION_METHODS = /* @__PURE__ */ new Set([
	"thread/started",
	"thread/status/changed",
	"turn/started",
	"turn/completed"
]);
const MAX_PENDING_DIRECT_SPAWN_EVIDENCE = 32;
const defaultRuntime = {
	createAgentHarnessTaskRuntime,
	deliverAgentHarnessTaskCompletion
};
const monitors = /* @__PURE__ */ new WeakMap();
const completionDeliveryOwners = /* @__PURE__ */ new Map();
function registerMonitor(params) {
	let monitor = monitors.get(params.client);
	if (!monitor) {
		const childThreadOwnership = /* @__PURE__ */ new Map();
		const childThreadTransitions = new KeyedAsyncQueue();
		monitor = new Monitor(params.client, params.runtime ?? defaultRuntime, {
			retainClient: params.retainClient,
			retainParentThread: params.retainParentThread,
			claimChildThread: (threadId) => childThreadTransitions.enqueue(threadId, async () => {
				const ownership = await claimCodexAppServerLiveThread(params.client, threadId);
				if (ownership) childThreadOwnership.set(threadId, ownership);
				return ownership;
			}),
			retainChildThread: (threadId) => childThreadTransitions.enqueue(threadId, async () => {
				const ownership = childThreadOwnership.get(threadId);
				let retained = false;
				try {
					retained = await retainCodexAppServerLiveThread(params.client, threadId, ownership?.release);
					return retained;
				} finally {
					if (!retained && ownership) await ownership.release(threadId);
					if (childThreadOwnership.get(threadId) === ownership) childThreadOwnership.delete(threadId);
				}
			}),
			releaseChildThread: (threadId) => childThreadTransitions.enqueue(threadId, async () => {
				const ownership = childThreadOwnership.get(threadId);
				if (ownership) {
					await ownership.release(threadId);
					if (childThreadOwnership.get(threadId) === ownership) childThreadOwnership.delete(threadId);
				} else await releaseCodexAppServerLiveThread(params.client, threadId);
			})
		});
		monitors.set(params.client, monitor);
	}
	return monitor.registerParent({
		parentThreadId: params.parentThreadId,
		requesterSessionKey: params.requesterSessionKey,
		taskRuntimeScope: params.taskRuntimeScope,
		agentId: params.agentId,
		claimDirectChild: params.claimDirectChild,
		rejectPendingDirectChild: params.rejectPendingDirectChild,
		onDirectChildAccepted: params.onDirectChildAccepted
	});
}
var Monitor = class {
	constructor(client, runtime = defaultRuntime, options = {}) {
		this.client = client;
		this.runtime = runtime;
		this.parentStates = /* @__PURE__ */ new Map();
		this.pendingDirectSpawnEvidence = /* @__PURE__ */ new Map();
		this.retiredParentStates = /* @__PURE__ */ new WeakSet();
		this.childStates = /* @__PURE__ */ new Map();
		this.childThreadIdsByAgentPath = /* @__PURE__ */ new Map();
		this.taskReconciliations = /* @__PURE__ */ new Map();
		this.taskReconciliationTimers = /* @__PURE__ */ new Map();
		this.threadStatusRevisions = /* @__PURE__ */ new Map();
		this.parentThreadRetentions = /* @__PURE__ */ new Map();
		this.disposed = false;
		this.recoveryPollDelaysMs = options.recoveryPollDelaysMs ?? DEFAULT_RECOVERY_POLL_DELAYS_MS;
		this.completionDeliveryRetryDelaysMs = options.completionDeliveryRetryDelaysMs ?? DEFAULT_COMPLETION_DELIVERY_RETRY_DELAYS_MS;
		this.completionDeliveryMaxRetries = options.completionDeliveryMaxRetries ?? this.completionDeliveryRetryDelaysMs.length;
		this.now = options.now ?? Date.now;
		this.retainClient = options.retainClient;
		this.retainParentThread = options.retainParentThread;
		this.claimChildThread = options.claimChildThread;
		this.retainChildThread = options.retainChildThread;
		this.releaseChildThread = options.releaseChildThread;
		this.removeNotificationHandler = client.addNotificationHandler(async (notification) => {
			if (!NATIVE_SUBAGENT_NOTIFICATION_METHODS.has(notification.method)) return;
			await this.handleNotification(notification);
		});
		this.removeCloseHandler = client.addCloseHandler(() => this.dispose());
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.removeNotificationHandler();
		this.removeCloseHandler();
		for (const timer of this.taskReconciliationTimers.values()) clearTimeout(timer);
		this.taskReconciliationTimers.clear();
		for (const childState of this.childStates.values()) {
			this.releaseDirectChild(childState);
			if (childState.terminal && childState.pendingCompletion) {
				this.clearRecoveryTimers(childState);
				continue;
			}
			this.unregisterChild(childState);
		}
		this.releaseRetainedClient();
		for (const release of this.parentThreadRetentions.values()) release();
		this.parentThreadRetentions.clear();
		for (const state of this.parentStates.values()) {
			state.owners.clear();
			state.turnIds.clear();
			this.deliverDetachedCompletions(state);
		}
		this.pendingDirectSpawnEvidence.clear();
		for (const [parentThreadId] of this.parentStates) if (![...this.childStates.values()].some((childState) => childState.parentThreadId === parentThreadId)) this.parentStates.delete(parentThreadId);
	}
	registerParent(params) {
		const parentThreadId = params.parentThreadId.trim();
		if (!parentThreadId) throw new Error("Codex native subagent monitor requires a parent thread id");
		if (this.disposed) throw new Error("Codex native subagent monitor is closed");
		let state = this.parentStates.get(parentThreadId);
		if (state?.requesterSessionKey && params.requesterSessionKey && state.requesterSessionKey !== params.requesterSessionKey) throw new Error(`Codex thread ${parentThreadId} is already bound to another session`);
		if (!state) {
			state = {
				parentThreadId,
				owners: /* @__PURE__ */ new Map(),
				turnIds: /* @__PURE__ */ new Set(),
				nativeCompletionReceipts: /* @__PURE__ */ new Set()
			};
			this.parentStates.set(parentThreadId, state);
		}
		state.requesterSessionKey ??= params.requesterSessionKey;
		state.taskRuntimeScope ??= params.taskRuntimeScope;
		state.agentId ??= params.agentId;
		const owner = Symbol("codex-native-subagent-owner");
		state.owners.set(owner, {
			claimDirectChild: params.claimDirectChild,
			rejectPendingDirectChild: params.rejectPendingDirectChild,
			onDirectChildAccepted: params.onDirectChildAccepted
		});
		this.prepareParentTaskRuntime(state);
		for (const childState of this.childStates.values()) if (childState.parentThreadId === parentThreadId && childState.pendingCompletion) this.deliverPendingCompletion(state, childState);
		let registered = true;
		const registeredState = state;
		this.reconcileTaskRowsForParent(registeredState).catch((error) => {
			embeddedAgentLog.warn("Failed to reconcile Codex native subagent task rows", {
				parentThreadId,
				error: formatErrorMessage(error)
			});
		});
		return {
			bindTurn: (turnIdInput) => {
				const turnId = turnIdInput.trim();
				if (!turnId || this.parentStates.get(parentThreadId) !== registeredState) return;
				const current = registeredState.owners.get(owner);
				if (!current || [...registeredState.owners.values()].some((other) => other !== current && other.turnId === turnId)) return;
				current.turnId = turnId;
				registeredState.turnIds.add(turnId);
				this.drainPendingDirectSpawnEvidence(registeredState, current, turnId);
				this.clearUnconsumablePendingDirectSpawnEvidence();
			},
			unregister: () => {
				if (!registered) return;
				registered = false;
				const current = this.parentStates.get(parentThreadId);
				if (current === registeredState) {
					const turnId = current.owners.get(owner)?.turnId;
					current.owners.delete(owner);
					if (turnId) current.turnIds.delete(turnId);
					if (current.owners.size === 0) {
						current.turnIds.clear();
						current.nativeCompletionReceipts = /* @__PURE__ */ new Set();
					}
					this.clearUnconsumablePendingDirectSpawnEvidence();
					this.deliverDetachedCompletions(current);
					this.pruneParentIfUnused(current);
				}
			}
		};
	}
	retireParent(parentThreadIdInput) {
		const parentThreadId = parentThreadIdInput.trim();
		const state = this.parentStates.get(parentThreadId);
		if (!state) return;
		this.retiredParentStates.add(state);
		state.owners.clear();
		this.clearPendingDirectSpawnEvidenceForParent(parentThreadId);
		for (const childState of Array.from(this.childStates.values())) if (childState.parentThreadId === parentThreadId) this.retireChild(state, childState, "Codex native subagent parent session ended.");
		if (this.parentStates.get(parentThreadId) === state) this.parentStates.delete(parentThreadId);
	}
	prepareParentTaskRuntime(state) {
		if (!state.requesterSessionKey || !state.taskRuntimeScope) return;
		state.taskRuntime ??= this.runtime.createAgentHarnessTaskRuntime({
			runtime: CODEX_NATIVE_SUBAGENT_RUNTIME,
			taskKind: CODEX_NATIVE_SUBAGENT_TASK_KIND,
			scope: state.taskRuntimeScope,
			runIdPrefix: CODEX_NATIVE_SUBAGENT_RUN_ID_PREFIX
		});
		state.mirror ??= new CodexNativeSubagentTaskMirror({
			parentThreadId: state.parentThreadId,
			requesterSessionKey: state.requesterSessionKey,
			agentId: state.agentId
		}, state.taskRuntime);
	}
	/** Handles one notification from the client-wide router observer. */
	async handleNotification(notification) {
		if (this.disposed) return;
		const state = this.resolveMirrorState(notification);
		const params = isJsonObject(notification.params) ? notification.params : void 0;
		const startedThread = isJsonObject(params?.thread) ? params.thread : void 0;
		const threadId = readStringField(params, "threadId")?.trim() ?? readStringField(startedThread, "id")?.trim();
		if (notification.method === "turn/completed" && threadId && this.followupDirectClaims?.has(threadId)) { // v-codex-native-followup-admission-v1
			const releaseFollowupClaim = this.followupDirectClaims.get(threadId);
			this.followupDirectClaims.delete(threadId);
			releaseFollowupClaim?.();
		}
		const threadStatus = isJsonObject(params?.status) ? normalizeIdentifier(readStringField(params.status, "type")) : void 0;
		const parent = threadId ? this.parentStates.get(threadId) : void 0;
		if (parent && parent.owners.size > 0 && notification.method === "turn/started") {
			const turnId = isJsonObject(params?.turn) ? readStringField(params.turn, "id") : void 0;
			if (turnId) parent.turnIds.add(turnId);
		}
		const tracksRecoveryRevision = Boolean(threadId && this.threadStatusRevisions.has(threadId));
		if (RECOVERY_REVISION_NOTIFICATION_METHODS.has(notification.method) && threadId && tracksRecoveryRevision) this.threadStatusRevisions.get(threadId).value += 1;
		if (!state && (!threadId || !this.parentStates.has(threadId) && !this.childStates.has(threadId) && !tracksRecoveryRevision)) return;
		if (state?.mirror) try {
			state.mirror.handleNotification(notification);
		} catch (error) {
			embeddedAgentLog.warn("Failed to mirror Codex native subagent lifecycle event", {
				method: notification.method,
				error: formatErrorMessage(error)
			});
		}
		if (state) this.handleClosedChild(notification, state);
		const childState = threadId ? this.childStates.get(threadId) : void 0;
		if (notification.method === "turn/started" && childState) {
			childState.nativeCompletionDelivered = false;
			for (const key of childState.agentPathKeys) state?.nativeCompletionReceipts.delete(key);
			this.resumeChild(childState);
		}
		if (parent && parent.turnIds.has(readStringField(params, "turnId") ?? "")) this.recordNativeCompletionDelivery(parent, notification);
		if (childState && !childState.terminal) this.emitChildTaskActivity(notification, childState);
		this.captureChildAssistantMessage(notification);
		await this.handleChildTurnCompletion(notification);
		if (notification.method === "thread/status/changed" && threadId && threadStatus) {
			if (threadStatus !== "systemerror") {
				if (childState) this.clearSystemErrorFallback(childState);
			} else {
				if (childState) {
					this.resumeChild(childState, { scheduleRecovery: false });
					this.setRecoveryFallback(childState, systemErrorFallbackCompletion(childState.childThreadId), this.now());
				}
				this.reconcileChildThread(threadId).catch((error) => {
					this.logRecoveryFailure(threadId, error);
					return false;
				}).then((reconciled) => {
					if (!reconciled && childState && this.childStates.get(threadId) === childState) this.scheduleRecoveryPoll(childState);
				});
			}
		}
		await this.handleCompletionNotification(notification);
	}
	emitChildTaskActivity(notification, childState) {
		const params = isJsonObject(notification.params) ? notification.params : void 0;
		if (!params) return;
		const owner = {
			runId: codexNativeSubagentRunId(childState.childThreadId),
			...childState.agentId ? { agentId: childState.agentId } : {}
		};
		if (notification.method === "item/agentMessage/delta") {
			const delta = readStringField(params, "delta");
			if (delta) emitAgentEvent({
				...owner,
				stream: "assistant",
				data: { delta }
			});
			return;
		}
		if (notification.method === "item/reasoning/summaryTextDelta") {
			const delta = readStringField(params, "delta");
			if (delta) emitAgentEvent({
				...owner,
				stream: "thinking",
				data: { delta }
			});
			return;
		}
		if (notification.method !== "item/started" && notification.method !== "item/completed") return;
		const item = readItem(params.item);
		if (item?.type === "agentMessage" && notification.method === "item/completed" && item.text) emitAgentEvent({
			...owner,
			stream: "assistant",
			data: { text: item.text }
		});
		const projection = projectNormalizedToolItem({
			phase: notification.method === "item/started" ? "start" : "result",
			item
		});
		if (projection?.event) emitAgentEvent({
			...owner,
			...projection.event
		});
	}
	resumeChild(childState, options = {}) {
		if (childState.terminal) return;
		this.observeActiveChild(childState);
		this.clearRecoveryTimers(childState);
		childState.recoveryAttempt = 0;
		if (options.scheduleRecovery !== false) this.scheduleRecoveryPoll(childState);
	}
	observeActiveChild(childState) {
		childState.settledWithoutCompletion = false;
		childState.fallbackCompletion = void 0;
		this.releaseClientRetention ??= this.retainClient?.();
	}
	settleResumableChild(childState) {
		if (childState.terminal) return;
		childState.settledWithoutCompletion = true;
		childState.fallbackCompletion = void 0;
		this.releaseDirectChild(childState);
		this.clearRecoveryTimers(childState);
		this.releaseClientRetentionIfIdle();
	}
	captureChildAssistantMessage(notification) {
		const params = isJsonObject(notification.params) ? notification.params : void 0;
		const childThreadId = readStringField(params, "threadId")?.trim();
		const childState = childThreadId ? this.childStates.get(childThreadId) : void 0;
		if (!childState || childState.terminal) return;
		if (notification.method === "item/agentMessage/delta") {
			const turnId = readStringField(params, "turnId");
			const itemId = readStringField(params, "itemId");
			const delta = readStringField(params, "delta");
			if (turnId && itemId && delta) this.recordChildAssistantMessage(childState, turnId, itemId, delta);
			return;
		}
		if (notification.method !== "item/started" && notification.method !== "item/completed") return;
		this.captureChildAssistantMessageItem(childState, readStringField(params, "turnId"), isJsonObject(params?.item) ? params.item : void 0);
	}
	captureChildAssistantMessageItem(childState, turnId, item) {
		if (readStringField(item, "type") !== "agentMessage" || !turnId) return;
		const itemId = readStringField(item, "id");
		if (!itemId) return;
		const messages = this.getChildAssistantMessages(childState, turnId);
		if (readStringField(item, "phase") === "commentary") messages.commentaryIds.add(itemId);
		else messages.finalMessageIds.add(itemId);
		const text = readStringField(item, "text");
		if (text) this.recordChildAssistantMessage(childState, turnId, itemId, text, { replace: true });
	}
	captureChildTurnAssistantMessages(childState, turn) {
		const turnId = readStringField(turn, "id");
		if (!turnId || !Array.isArray(turn.items)) return;
		for (const item of turn.items) this.captureChildAssistantMessageItem(childState, turnId, isJsonObject(item) ? item : void 0);
	}
	recordChildAssistantMessage(childState, turnId, itemId, text, options = {}) {
		const messages = this.getChildAssistantMessages(childState, turnId);
		if (!messages.texts.has(itemId)) messages.order.push(itemId);
		const existing = messages.texts.get(itemId) ?? "";
		messages.texts.set(itemId, options.replace ? text : `${existing}${text}`);
	}
	getChildAssistantMessages(childState, turnId) {
		let messages = childState.assistantMessagesByTurn.get(turnId);
		if (!messages) {
			messages = {
				texts: /* @__PURE__ */ new Map(),
				order: [],
				commentaryIds: /* @__PURE__ */ new Set(),
				finalMessageIds: /* @__PURE__ */ new Set()
			};
			childState.assistantMessagesByTurn.set(turnId, messages);
		}
		return messages;
	}
	async handleChildTurnCompletion(notification) {
		if (notification.method !== "turn/completed") return;
		const params = isJsonObject(notification.params) ? notification.params : void 0;
		const childThreadId = readStringField(params, "threadId")?.trim();
		const childState = childThreadId ? this.childStates.get(childThreadId) : void 0;
		const state = childState ? this.parentStates.get(childState.parentThreadId) : void 0;
		const turn = isJsonObject(params?.turn) ? params.turn : void 0;
		if (!state || !childState || !turn || childState.terminal) return;
		const turnId = readStringField(turn, "id");
		const status = normalizeIdentifier(readStringField(turn, "status"));
		if (status === "interrupted") {
			this.removePendingDirectSpawnEvidenceForChild(childState.childThreadId);
			this.rejectPendingDirectChild(state, childState.childThreadId, "Codex child turn interrupted");
			if (turnId) childState.assistantMessagesByTurn.delete(turnId);
			this.settleResumableChild(childState);
			return;
		}
		if (status === "completed" || status === "failed") {
			const revision = this.threadStatusRevisions.get(childState.childThreadId);
			if (revision) revision.terminal = true;
			this.rejectPendingDirectChild(state, childState.childThreadId, "Codex child turn completed");
			this.releaseDirectChild(childState);
			this.removePendingDirectSpawnEvidenceForChild(childState.childThreadId);
		}
		this.captureChildTurnAssistantMessages(childState, turn);
		const completion = toChildTurnCompletion(childState, turn);
		if (!completion) return;
		await this.processObservedCompletion(state, childState, completion);
	}
	/** Reads one child through app-server history and delivers a terminal result when present. */
	async reconcileChildThread(childThreadIdInput) {
		const childState = this.childStates.get(childThreadIdInput.trim());
		if (!childState || childState.terminal || this.disposed) return false;
		if (childState.recoveryInFlight) return await childState.recoveryInFlight;
		const recovery = this.reconcileChildState(childState);
		childState.recoveryInFlight = recovery;
		try {
			return await recovery;
		} finally {
			if (childState.recoveryInFlight === recovery) childState.recoveryInFlight = void 0;
		}
	}
	resolveMirrorState(notification) {
		const params = isJsonObject(notification.params) ? notification.params : void 0;
		if (!params) return;
		if (notification.method === "thread/started") {
			const thread = isJsonObject(params.thread) ? params.thread : void 0;
			const parentThreadId = readThreadParentThreadId(thread);
			const childThreadId = thread ? readStringField(thread, "id")?.trim() : void 0;
			const agentPath = readStringField(readThreadSpawnSource(thread), "agent_path")?.trim();
			const state = parentThreadId ? this.parentStates.get(parentThreadId) : void 0;
			if (state && childThreadId && parentThreadId) return this.registerChildThread(state, childThreadId, agentPath === void 0 ? {} : { agentPath }) ? state : void 0;
			return state;
		}
		if (notification.method === "thread/status/changed" || notification.method === "turn/started" || notification.method === "turn/completed" || notification.method === "item/agentMessage/delta") {
			const childThreadId = readStringField(params, "threadId")?.trim();
			const parentThreadId = childThreadId ? this.childStates.get(childThreadId)?.parentThreadId : void 0;
			return parentThreadId ? this.parentStates.get(parentThreadId) : void 0;
		}
		if (notification.method === "item/started" || notification.method === "item/completed") {
			const item = isJsonObject(params.item) ? params.item : void 0;
			const parentThreadId = item ? (readStringField(item, "senderThreadId") ?? readStringField(params, "threadId"))?.trim() : void 0;
			const state = parentThreadId ? this.parentStates.get(parentThreadId) : void 0;
			if (state && parentThreadId) {
				const turnId = readStringField(params, "turnId");
				const owner = this.resolveParentOwner(state, turnId);
				if (notification.method === "item/completed" && readStringField(item, "type") === "subAgentActivity" && normalizeIdentifier(readStringField(item, "kind")) === "started") {
					const childThreadId = readStringField(item, "agentThreadId")?.trim();
					const agentPath = readStringField(item, "agentPath");
					if (childThreadId) this.registerDirectSpawnChild(state, turnId, {
						parentThreadId,
						childThreadId,
						...agentPath === void 0 ? {} : { agentPath }
					}, owner);
					return state;
				}
				// v-codex-native-followup-admission-v1: a follow-up from the parent's current turn admits the child again.
				if (notification.method === "item/completed" && readStringField(item, "type") === "subAgentActivity" && normalizeIdentifier(readStringField(item, "kind")) === "interacted") {
					const childThreadId = readStringField(item, "agentThreadId")?.trim();
					if (childThreadId) this.readmitFollowupChild(state, childThreadId, owner);
					return state;
				}
				const isCompletedSpawnAgentTool = notification.method === "item/completed" && readStringField(item, "type") === "collabAgentToolCall" && normalizeIdentifier(readStringField(item, "tool")) === "spawnagent" && normalizeIdentifier(readStringField(item, "status")) === "completed";
				if (normalizeIdentifier(readStringField(item, "tool")) === "closeagent") return state;
				const childThreadIds = new Set(readStringArray(item?.receiverThreadIds));
				let accepted = true;
				for (const childThreadId of childThreadIds) accepted = Boolean(isCompletedSpawnAgentTool ? this.registerDirectSpawnChild(state, turnId, {
					parentThreadId,
					childThreadId
				}, owner) : this.registerChildThread(state, childThreadId)) && accepted;
				if (notification.method === "item/completed" && readStringField(item, "type") === "collabAgentToolCall" && CODEX_FOLLOWUP_COLLAB_TOOLS.has(normalizeIdentifier(readStringField(item, "tool"))) && normalizeIdentifier(readStringField(item, "status")) === "completed") for (const childThreadId of childThreadIds) this.readmitFollowupChild(state, childThreadId, owner); // v-codex-native-followup-admission-v1
				if (!accepted) return;
			}
			return state;
		}
	}
	handleClosedChild(notification, state) {
		if (notification.method !== "item/completed") return;
		const params = isJsonObject(notification.params) ? notification.params : void 0;
		const item = isJsonObject(params?.item) ? params.item : void 0;
		if (readStringField(item, "type") !== "collabAgentToolCall" || normalizeIdentifier(readStringField(item, "tool")) !== "closeagent" || normalizeIdentifier(readStringField(item, "status")) !== "completed") return;
		const childThreadIds = /* @__PURE__ */ new Set([...readStringArray(item?.receiverThreadIds), ...readObjectStringKeys(item?.agentsStates)]);
		for (const childThreadId of childThreadIds) {
			const childState = this.childStates.get(childThreadId);
			if (childState && childState.parentThreadId !== state.parentThreadId) continue;
			if (childState) this.retireChild(state, childState, "Codex native subagent was closed.");
			else this.updateChildThreadOwnership("release", childThreadId, this.releaseChildThread);
		}
	}
	retireChild(state, childState, summary) {
		if (!childState.terminal) {
			childState.terminal = true;
			const revision = this.threadStatusRevisions.get(childState.childThreadId);
			if (revision) revision.terminal = true;
			const eventAt = this.now();
			state.mirror?.markAuthoritativeCompletion(childState.childThreadId);
			state.taskRuntime?.finalizeTaskRunByRunId({
				runId: codexNativeSubagentRunId(childState.childThreadId),
				status: "cancelled",
				endedAt: eventAt,
				lastEventAt: eventAt,
				error: summary,
				progressSummary: summary,
				terminalSummary: summary
			});
		}
		if (childState.pendingCompletion) {
			childState.pendingCompletion = void 0;
			state.taskRuntime?.setDetachedTaskDeliveryStatusByRunId({
				runId: codexNativeSubagentRunId(childState.childThreadId),
				deliveryStatus: "failed",
				error: summary
			});
		}
		this.unregisterChild(childState, { retainSubscription: false });
		this.updateChildThreadOwnership("release", childState.childThreadId, this.releaseChildThread);
	}
	async handleCompletionNotification(notification) {
		const params = isJsonObject(notification.params) ? notification.params : void 0;
		const parentThreadId = params ? readStringField(params, "threadId")?.trim() : void 0;
		const state = parentThreadId ? this.parentStates.get(parentThreadId) : void 0;
		if (!state) return;
		for (const nativeCompletion of codexNativeSubagentNotifications.fromNotification(notification)) {
			const childThreadId = this.childThreadIdsByAgentPath.get(buildParentAgentPathKey(state.parentThreadId, nativeCompletion.agentPath));
			const childState = childThreadId ? this.childStates.get(childThreadId) : void 0;
			if (!childState || childState.parentThreadId !== state.parentThreadId || childState.terminal) {
				embeddedAgentLog.warn("Ignoring Codex native subagent completion for unknown child thread", {
					parentThreadId: state.parentThreadId,
					agentPath: nativeCompletion.agentPath
				});
				continue;
			}
			const completion = {
				childThreadId: childState.childThreadId,
				status: nativeCompletion.status,
				statusLabel: nativeCompletion.statusLabel,
				result: nativeCompletion.result
			};
			await this.processObservedCompletion(state, childState, completion);
		}
	}
	async processObservedCompletion(state, childState, completion) {
		if (!isNoFinalCompletion(completion)) {
			await this.processCompletion(state, childState, completion);
			return;
		}
		this.resumeChild(childState, { scheduleRecovery: false });
		this.setRecoveryFallback(childState, completion, this.now());
		await this.reconcileChildThread(childState.childThreadId).catch((error) => {
			this.logRecoveryFailure(childState.childThreadId, error);
			return false;
		});
	}
	async reconcileChildState(childState) {
		const state = this.parentStates.get(childState.parentThreadId);
		if (!state) return false;
		const statusRead = this.retainThreadStatusRevision(childState.childThreadId);
		try {
			const recovery = await this.readThreadRecovery(childState.childThreadId);
			if (!statusRead.isCurrent() || this.childStates.get(childState.childThreadId) !== childState) return false;
			if (recovery.parentThreadId && recovery.parentThreadId !== childState.parentThreadId) {
				embeddedAgentLog.warn("Codex native subagent parent did not match monitor state", {
					childThreadId: childState.childThreadId,
					expectedParentThreadId: childState.parentThreadId,
					actualParentThreadId: recovery.parentThreadId
				});
				this.unregisterChild(childState);
				return false;
			}
			if (recovery.agentPath) this.registerAgentPath(childState, recovery.agentPath);
			if (recovery.threadState === "active") {
				this.observeActiveChild(childState);
				return false;
			}
			if (recovery.threadState === "other") this.clearSystemErrorFallback(childState);
			if (recovery.resumable) {
				this.settleResumableChild(childState);
				return false;
			}
			const completion = recovery.completion;
			if (!completion) {
				if (recovery.fallbackCompletion) this.setRecoveryFallback(childState, recovery.fallbackCompletion, recovery.fallbackCompletion.completedAt ?? this.now());
				return false;
			}
			if (isNoFinalCompletion(completion)) {
				this.setRecoveryFallback(childState, completion, completion.completedAt ?? this.now());
				return false;
			}
			await this.processCompletion(state, childState, completion, completion.completedAt);
			return true;
		} finally {
			statusRead.release();
		}
	}
	requestThreadRead(childThreadId, includeTurns) {
		return this.client.request("thread/read", {
			threadId: childThreadId,
			includeTurns
		}, { timeoutMs: THREAD_READ_TIMEOUT_MS });
	}
	requestLatestThreadTurn(childThreadId) {
		return this.client.request("thread/turns/list", {
			threadId: childThreadId,
			limit: 1,
			sortDirection: "desc",
			itemsView: "full"
		}, { timeoutMs: THREAD_READ_TIMEOUT_MS });
	}
	async readThreadRecovery(childThreadId) {
		const response = await this.requestThreadRead(childThreadId, true).catch(() => this.requestThreadRead(childThreadId, false));
		const thread = isJsonObject(response.thread) ? response.thread : void 0;
		if (!thread || readStringField(thread, "id")?.trim() !== childThreadId) return {
			resumable: false,
			threadState: "unavailable"
		};
		const threadStatus = isJsonObject(thread.status) ? normalizeIdentifier(readStringField(thread.status, "type")) : void 0;
		let completion;
		let fallbackCompletion;
		let resumable = false;
		let threadState = threadStatus === "active" ? "active" : threadStatus === "systemerror" ? "system_error" : threadStatus ? "other" : "unavailable";
		if (threadStatus === "systemerror") {
			const turnsResponse = await this.requestLatestThreadTurn(childThreadId).catch(() => void 0);
			const data = isJsonObject(turnsResponse) && Array.isArray(turnsResponse.data) ? turnsResponse.data : [];
			const latestTurn = isJsonObject(data[0]) ? data[0] : void 0;
			const latestTurnStatus = normalizeIdentifier(readStringField(latestTurn, "status"));
			completion = latestTurn && latestTurnStatus === "failed" ? readTurnCompletion(latestTurn, childThreadId) : void 0;
			if (latestTurnStatus === "inprogress") threadState = "active";
			else if (!completion) fallbackCompletion = systemErrorFallbackCompletion(childThreadId);
		} else if (threadStatus !== "active") {
			const turnRecovery = readThreadTurnRecovery(thread, childThreadId);
			completion = turnRecovery.completion;
			resumable = turnRecovery.resumable;
		}
		return {
			parentThreadId: readThreadParentThreadId(thread),
			agentPath: normalizeOptionalString(readStringField(readThreadSpawnSource(thread), "agent_path")),
			completion,
			fallbackCompletion,
			resumable,
			threadState
		};
	}
	async processCompletion(state, childState, completion, eventAt = this.now()) {
		if (childState.terminal) return;
		if (!this.claimCompletionDelivery(state, childState)) {
			this.unregisterChild(childState);
			return;
		}
		childState.terminal = true;
		const revision = this.threadStatusRevisions.get(childState.childThreadId);
		if (revision) revision.terminal = true;
		this.releaseDirectChild(childState);
		this.clearRecoveryTimers(childState);
		state.mirror?.markAuthoritativeCompletion(completion.childThreadId);
		state.taskRuntime?.finalizeTaskRunByRunId({
			runId: codexNativeSubagentRunId(completion.childThreadId),
			status: completion.status,
			endedAt: eventAt,
			lastEventAt: eventAt,
			...completion.status === "succeeded" ? {} : { error: completion.result },
			progressSummary: completion.result,
			terminalSummary: completion.result
		});
		if (!state.requesterSessionKey || !state.taskRuntimeScope) {
			this.unregisterChild(childState);
			return;
		}
		if (childState.nativeCompletionDelivered) {
			this.finishCompletionDelivery(state, childState);
			return;
		}
		childState.pendingCompletion = completion;
		state.taskRuntime?.setDetachedTaskDeliveryStatusByRunId({
			runId: codexNativeSubagentRunId(completion.childThreadId),
			deliveryStatus: "pending"
		});
		this.releaseClientRetentionIfIdle();
		await this.deliverPendingCompletion(state, childState);
	}
	async deliverPendingCompletion(state, childState) {
		const completion = childState.pendingCompletion;
		if (!completion || !state.requesterSessionKey || !state.taskRuntimeScope) return;
		if (state.owners.size > 0) return;
		if (childState.deliveringCompletion || childState.completionDeliveryTimer) return;
		childState.deliveringCompletion = true;
		try {
			const delivery = await this.runtime.deliverAgentHarnessTaskCompletion({
				scope: state.taskRuntimeScope,
				childSessionKey: codexNativeSubagentRunId(completion.childThreadId),
				childSessionId: completion.childThreadId,
				announceId: `codex-native:${state.parentThreadId}:${completion.childThreadId}:${completion.status}`,
				announceType: "Codex native subagent",
				taskLabel: "Codex native subagent",
				status: completion.status,
				statusLabel: completion.statusLabel,
				result: completion.result,
				replyInstruction: "Use the Codex native subagent result to continue or wrap up the parent task. If this is a Discord/channel session, send the visible response with the message tool instead of only writing a transcript final answer. Reply in your normal assistant voice and do not expose internal notification markup."
			});
			if (this.childStates.get(childState.childThreadId) !== childState || this.parentStates.get(state.parentThreadId) !== state) return;
			if (isDurableAgentHarnessCompletionDelivery(delivery)) {
				this.finishCompletionDelivery(state, childState);
				return;
			}
			const error = delivery.error ?? "completion delivery did not produce a parent response";
			state.taskRuntime?.setDetachedTaskDeliveryStatusByRunId({
				runId: codexNativeSubagentRunId(completion.childThreadId),
				deliveryStatus: "pending",
				error
			});
			this.scheduleCompletionDeliveryRetry(childState, error);
		} catch (error) {
			if (this.childStates.get(childState.childThreadId) !== childState || this.parentStates.get(state.parentThreadId) !== state) return;
			const message = formatErrorMessage(error);
			state.taskRuntime?.setDetachedTaskDeliveryStatusByRunId({
				runId: codexNativeSubagentRunId(completion.childThreadId),
				deliveryStatus: "pending",
				error: message
			});
			this.scheduleCompletionDeliveryRetry(childState, message);
			embeddedAgentLog.warn("Failed to deliver Codex native subagent completion", {
				parentThreadId: state.parentThreadId,
				childThreadId: completion.childThreadId,
				error: message
			});
		} finally {
			childState.deliveringCompletion = false;
		}
	}
	recordNativeCompletionDelivery(state, notification) {
		for (const agentPath of codexNativeSubagentNotifications.deliveredAgentPaths(notification)) {
			const key = buildParentAgentPathKey(state.parentThreadId, agentPath);
			state.nativeCompletionReceipts.add(key);
			const childThreadId = this.childThreadIdsByAgentPath.get(key);
			const child = childThreadId ? this.childStates.get(childThreadId) : void 0;
			if (!child || child.parentThreadId !== state.parentThreadId) continue;
			child.nativeCompletionDelivered = true;
			if (child.pendingCompletion && !child.deliveringCompletion) this.finishCompletionDelivery(state, child);
		}
	}
	finishCompletionDelivery(state, child) {
		child.pendingCompletion = void 0;
		child.completionDeliveryAttempt = 0;
		state.taskRuntime?.setDetachedTaskDeliveryStatusByRunId({
			runId: codexNativeSubagentRunId(child.childThreadId),
			deliveryStatus: "delivered"
		});
		this.unregisterChild(child);
	}
	deliverDetachedCompletions(state) {
		for (const child of this.childStates.values()) if (child.parentThreadId === state.parentThreadId && child.pendingCompletion) this.deliverPendingCompletion(state, child);
	}
	scheduleCompletionDeliveryRetry(childState, error) {
		if (!childState.pendingCompletion || childState.completionDeliveryTimer || this.childStates.get(childState.childThreadId) !== childState) return;
		if (childState.completionDeliveryAttempt >= this.completionDeliveryMaxRetries) {
			this.parentStates.get(childState.parentThreadId)?.taskRuntime?.setDetachedTaskDeliveryStatusByRunId({
				runId: codexNativeSubagentRunId(childState.childThreadId),
				deliveryStatus: "failed",
				error
			});
			this.unregisterChild(childState);
			return;
		}
		const delayMs = delayForAttempt(this.completionDeliveryRetryDelaysMs, childState.completionDeliveryAttempt++);
		childState.completionDeliveryTimer = setTimeout(() => {
			childState.completionDeliveryTimer = void 0;
			if (this.childStates.get(childState.childThreadId) !== childState) return;
			const state = this.parentStates.get(childState.parentThreadId);
			if (state) this.deliverPendingCompletion(state, childState);
		}, delayMs);
		unrefTimer(childState.completionDeliveryTimer);
	}
	// v-codex-native-followup-admission-v1
	readmitFollowupChild(state, childThreadIdInput, owner) {
		const childThreadId = childThreadIdInput.trim();
		if (!childThreadId || !owner?.claimDirectChild || this.disposed) return;
		const existing = this.childStates.get(childThreadId);
		const revision = this.threadStatusRevisions.get(childThreadId);
		if ((existing ? existing.parentThreadId : revision?.parentThreadId) !== state.parentThreadId) return;
		if (existing?.releaseDirectChild || this.followupDirectClaims?.has(childThreadId)) return;
		let admission;
		if (existing?.terminal) {
			(this.followupDirectClaims ??= /* @__PURE__ */ new Map()).set(childThreadId, owner.claimDirectChild(childThreadId));
			admission = "turn-scoped";
		} else {
			if (existing) existing.settledWithoutCompletion = false;
			if (revision?.terminal) revision.terminal = false;
			if (this.registerChildThread(state, childThreadId, { claimDirectChild: owner.claimDirectChild })?.releaseDirectChild) admission = "child-state";
		}
		if (admission) embeddedAgentLog.info("Codex native subagent follow-up admitted to the parent relay", { childThreadId, parentThreadId: state.parentThreadId, admission });
	}
	registerChildThread(state, childThreadIdInput, options = {}) {
		const parentThreadId = state.parentThreadId;
		const childThreadId = childThreadIdInput.trim();
		if (!parentThreadId || !childThreadId || this.disposed) return;
		if (options.claimDirectChild && this.threadStatusRevisions.get(childThreadId)?.terminal) return;
		let childState = this.childStates.get(childThreadId);
		if (childState && childState.parentThreadId !== parentThreadId) {
			embeddedAgentLog.warn("Ignoring Codex native subagent child reparenting", {
				childThreadId,
				existingParentThreadId: childState.parentThreadId,
				attemptedParentThreadId: parentThreadId
			});
			return;
		}
		if (!childState) {
			this.updateChildThreadOwnership("claim", childThreadId, this.claimChildThread);
			this.releaseClientRetention ??= this.retainClient?.();
			if (!this.parentThreadRetentions.has(parentThreadId)) {
				const releaseParentThread = this.retainParentThread?.(parentThreadId);
				if (releaseParentThread) this.parentThreadRetentions.set(parentThreadId, releaseParentThread);
			}
			childState = {
				childThreadId,
				parentThreadId,
				agentId: state.agentId,
				agentPathKeys: /* @__PURE__ */ new Set(),
				assistantMessagesByTurn: /* @__PURE__ */ new Map(),
				recoveryAttempt: 0,
				terminal: false,
				nativeCompletionDelivered: false,
				settledWithoutCompletion: false,
				completionDeliveryAttempt: 0,
				deliveringCompletion: false
			};
			this.childStates.set(childThreadId, childState);
			this.threadStatusRevisions.set(childThreadId, this.threadStatusRevisions.get(childThreadId) ?? {
				value: 0,
				readers: 0,
				parentThreadId
			});
		}
		if (options.claimDirectChild && !childState.terminal && !childState.settledWithoutCompletion && !childState.releaseDirectChild) childState.releaseDirectChild = options.claimDirectChild(childThreadId);
		this.registerAgentPath(childState, childThreadId);
		state.mirror?.markAuthoritativeCompletionExpected(childThreadId);
		const agentPath = normalizeOptionalString(options.agentPath);
		if (agentPath) this.registerAgentPath(childState, agentPath);
		this.scheduleRecoveryPoll(childState);
		return childState;
	}
	resolveParentOwner(state, turnIdInput) {
		const turnId = turnIdInput?.trim();
		if (!turnId) return;
		const owners = [...state.owners.values()].filter((owner) => owner.turnId === turnId);
		return owners.length === 1 ? owners[0] : void 0;
	}
	registerDirectSpawnChild(state, turnIdInput, evidence, owner) {
		const childState = this.registerChildThread(state, evidence.childThreadId, {
			...evidence.agentPath === void 0 ? {} : { agentPath: evidence.agentPath },
			...owner?.claimDirectChild ? { claimDirectChild: owner.claimDirectChild } : {}
		});
		if (!owner) this.bufferPendingDirectSpawnEvidence(turnIdInput, evidence);
		else if (childState) owner.onDirectChildAccepted?.();
		return childState;
	}
	bufferPendingDirectSpawnEvidence(turnIdInput, evidence) {
		const turnId = turnIdInput?.trim();
		if (!turnId || !this.hasUnboundParentOwner(evidence.parentThreadId)) return;
		const pending = this.pendingDirectSpawnEvidence.get(turnId) ?? [];
		if (pending.some((candidate) => candidate.parentThreadId === evidence.parentThreadId && candidate.childThreadId === evidence.childThreadId && candidate.agentPath === evidence.agentPath) || [...this.pendingDirectSpawnEvidence.values()].reduce((count, entries) => count + entries.length, 0) >= MAX_PENDING_DIRECT_SPAWN_EVIDENCE) return;
		pending.push(evidence);
		this.pendingDirectSpawnEvidence.set(turnId, pending);
	}
	drainPendingDirectSpawnEvidence(state, owner, turnId) {
		const pending = this.pendingDirectSpawnEvidence.get(turnId);
		this.pendingDirectSpawnEvidence.delete(turnId);
		if (!pending || !owner.claimDirectChild) return;
		for (const evidence of pending) if (evidence.parentThreadId === state.parentThreadId) {
			if (this.registerChildThread(state, evidence.childThreadId, {
				...evidence.agentPath === void 0 ? {} : { agentPath: evidence.agentPath },
				claimDirectChild: owner.claimDirectChild
			})) owner.onDirectChildAccepted?.();
		}
	}
	hasUnboundParentOwner(parentThreadId) {
		return [...parentThreadId ? [this.parentStates.get(parentThreadId)].filter((state) => Boolean(state)) : this.parentStates.values()].some((state) => [...state.owners.values()].some((owner) => owner.turnId === void 0));
	}
	clearUnconsumablePendingDirectSpawnEvidence() {
		if (!this.hasUnboundParentOwner()) this.pendingDirectSpawnEvidence.clear();
	}
	clearPendingDirectSpawnEvidenceForParent(parentThreadId) {
		this.filterPendingDirectSpawnEvidence((evidence) => evidence.parentThreadId !== parentThreadId);
	}
	removePendingDirectSpawnEvidenceForChild(childThreadId) {
		this.filterPendingDirectSpawnEvidence((evidence) => evidence.childThreadId !== childThreadId);
	}
	filterPendingDirectSpawnEvidence(keep) {
		for (const [turnId, pending] of this.pendingDirectSpawnEvidence) {
			const remaining = pending.filter(keep);
			if (remaining.length) this.pendingDirectSpawnEvidence.set(turnId, remaining);
			else this.pendingDirectSpawnEvidence.delete(turnId);
		}
	}
	registerAgentPath(childState, agentPath) {
		const key = buildParentAgentPathKey(childState.parentThreadId, agentPath);
		const existingChild = this.childThreadIdsByAgentPath.get(key);
		if (existingChild && existingChild !== childState.childThreadId) {
			embeddedAgentLog.warn("Ignoring conflicting Codex native subagent agent path", {
				parentThreadId: childState.parentThreadId,
				agentPath,
				existingChildThreadId: existingChild,
				attemptedChildThreadId: childState.childThreadId
			});
			return;
		}
		this.childThreadIdsByAgentPath.set(key, childState.childThreadId);
		childState.agentPathKeys.add(key);
		if (this.parentStates.get(childState.parentThreadId)?.nativeCompletionReceipts.has(key)) childState.nativeCompletionDelivered = true;
	}
	unregisterChild(childState, options = {}) {
		this.releaseDirectChild(childState);
		if (childState.terminal && options.retainSubscription !== false && !this.disposed) this.updateChildThreadOwnership("retain", childState.childThreadId, this.retainChildThread);
		this.clearRecoveryTimers(childState);
		if (childState.completionDeliveryTimer) clearTimeout(childState.completionDeliveryTimer);
		const deliveryOwnerKey = childState.deliveryOwnerKey;
		if (deliveryOwnerKey && completionDeliveryOwners.get(deliveryOwnerKey) === childState) completionDeliveryOwners.delete(deliveryOwnerKey);
		childState.deliveryOwnerKey = void 0;
		for (const key of childState.agentPathKeys) if (this.childThreadIdsByAgentPath.get(key) === childState.childThreadId) this.childThreadIdsByAgentPath.delete(key);
		if (this.childStates.get(childState.childThreadId) === childState) this.childStates.delete(childState.childThreadId);
		if (![...this.childStates.values()].some((remainingChild) => remainingChild.parentThreadId === childState.parentThreadId)) {
			const releaseParentThread = this.parentThreadRetentions.get(childState.parentThreadId);
			this.parentThreadRetentions.delete(childState.parentThreadId);
			releaseParentThread?.();
		}
		this.collectThreadStatusRevision(childState.childThreadId);
		this.releaseClientRetentionIfIdle();
		const state = this.parentStates.get(childState.parentThreadId);
		if (state) this.pruneParentIfUnused(state);
	}
	releaseDirectChild(childState) {
		const release = childState.releaseDirectChild;
		childState.releaseDirectChild = void 0;
		release?.();
	}
	rejectPendingDirectChild(state, childThreadId, reason) {
		for (const owner of state.owners.values()) owner.rejectPendingDirectChild?.(childThreadId, reason);
	}
	updateChildThreadOwnership(operation, childThreadId, update) {
		if (!update) return;
		update(childThreadId).catch((error) => {
			embeddedAgentLog.warn("Failed to update Codex native subagent thread ownership", {
				operation,
				childThreadId,
				error: formatErrorMessage(error)
			});
		});
	}
	releaseClientRetentionIfIdle() {
		if ([...this.childStates.values()].some((childState) => !childState.terminal && !childState.settledWithoutCompletion)) return;
		this.releaseRetainedClient();
	}
	releaseRetainedClient() {
		const release = this.releaseClientRetention;
		this.releaseClientRetention = void 0;
		release?.();
	}
	claimCompletionDelivery(state, childState) {
		const requesterSessionKey = state.requesterSessionKey?.trim();
		if (!requesterSessionKey) return true;
		const key = `${requesterSessionKey}\0${childState.childThreadId}`;
		const owner = completionDeliveryOwners.get(key);
		if (owner) return owner === childState;
		const runId = codexNativeSubagentRunId(childState.childThreadId);
		if (state.taskRuntime?.listTaskRecords().some((task) => task.runId === runId && task.deliveryStatus === "delivered")) return false;
		completionDeliveryOwners.set(key, childState);
		childState.deliveryOwnerKey = key;
		return true;
	}
	pruneParentIfUnused(state) {
		if (state.owners.size > 0) return;
		for (const childState of this.childStates.values()) if (childState.parentThreadId === state.parentThreadId) return;
		if (this.parentStates.get(state.parentThreadId) === state) {
			this.clearTerminalRevisionsForParent(state.parentThreadId);
			this.parentStates.delete(state.parentThreadId);
		}
	}
	clearTerminalRevisionsForParent(parentThreadId) {
		for (const [threadId, revision] of this.threadStatusRevisions) if (revision.parentThreadId === parentThreadId) this.collectThreadStatusRevision(threadId, revision);
	}
	collectThreadStatusRevision(threadId, revision = this.threadStatusRevisions.get(threadId)) {
		if (!revision || revision.readers > 0 || this.childStates.has(threadId)) return;
		if ((revision.parentThreadId ? this.parentStates.get(revision.parentThreadId) : void 0)?.owners.size) return;
		if (this.threadStatusRevisions.get(threadId) === revision) this.threadStatusRevisions.delete(threadId);
	}
	scheduleRecoveryPoll(childState) {
		if (childState.terminal || childState.settledWithoutCompletion || childState.recoveryTimer || this.disposed || this.recoveryPollDelaysMs.length === 0) return;
		const delayMs = delayForAttempt(this.recoveryPollDelaysMs, childState.recoveryAttempt++);
		childState.recoveryTimer = setTimeout(() => {
			childState.recoveryTimer = void 0;
			this.reconcileChildThread(childState.childThreadId).catch((error) => {
				this.logRecoveryFailure(childState.childThreadId, error);
				return false;
			}).then(async (reconciled) => {
				if (reconciled || this.childStates.get(childState.childThreadId) !== childState) return;
				const fallback = childState.fallbackCompletion;
				const state = this.parentStates.get(childState.parentThreadId);
				if (fallback && state && childState.recoveryAttempt >= 2) {
					await this.processCompletion(state, childState, fallback, fallback.completedAt ?? this.now());
					return;
				}
				this.scheduleRecoveryPoll(childState);
			});
		}, delayMs);
		unrefTimer(childState.recoveryTimer);
	}
	setRecoveryFallback(childState, completion, eventAt) {
		if (childState.terminal) return;
		const current = childState.fallbackCompletion;
		if (current?.status === completion.status && current.statusLabel === completion.statusLabel && current.result === completion.result) return;
		if (childState.recoveryTimer) {
			clearTimeout(childState.recoveryTimer);
			childState.recoveryTimer = void 0;
		}
		childState.recoveryAttempt = 0;
		childState.fallbackCompletion = {
			...completion,
			completedAt: eventAt
		};
		this.scheduleRecoveryPoll(childState);
	}
	clearSystemErrorFallback(childState) {
		if (childState.fallbackCompletion?.statusLabel !== "system_error") return;
		childState.fallbackCompletion = void 0;
	}
	retainThreadStatusRevision(threadId) {
		const revision = this.threadStatusRevisions.get(threadId) ?? {
			value: 0,
			readers: 0
		};
		this.threadStatusRevisions.set(threadId, revision);
		revision.readers += 1;
		const capturedValue = revision.value;
		let retained = true;
		return {
			isCurrent: () => this.threadStatusRevisions.get(threadId) === revision && revision.value === capturedValue,
			release: () => {
				if (!retained) return;
				retained = false;
				revision.readers -= 1;
				this.collectThreadStatusRevision(threadId, revision);
			}
		};
	}
	clearRecoveryTimers(childState) {
		if (childState.recoveryTimer) {
			clearTimeout(childState.recoveryTimer);
			childState.recoveryTimer = void 0;
		}
	}
	async reconcileTaskRowsForParent(state) {
		if (this.disposed || this.parentStates.get(state.parentThreadId) !== state || !state.taskRuntime || !state.requesterSessionKey || !state.taskRuntimeScope) return;
		const candidates = /* @__PURE__ */ new Map();
		for (const task of state.taskRuntime.listTaskRecords()) {
			if (task.requesterSessionKey !== state.requesterSessionKey || !this.shouldReconcileCodexNativeTask(task)) continue;
			const childThreadId = task.runId.slice(13).trim();
			candidates.set(childThreadId, {
				parentState: state,
				nativeCompletionReceipts: state.nativeCompletionReceipts,
				requesterSessionKey: state.requesterSessionKey,
				childThreadId,
				recoveryAttempt: 0,
				taskRuntimeScope: state.taskRuntimeScope,
				agentId: state.agentId,
				taskRuntime: state.taskRuntime
			});
		}
		for (const candidate of candidates.values()) await this.reconcileTaskCandidate(candidate);
	}
	async reconcileTaskCandidate(candidate) {
		const key = `${candidate.requesterSessionKey}\0${candidate.childThreadId}`;
		const scheduled = this.taskReconciliationTimers.get(key);
		if (scheduled) {
			clearTimeout(scheduled);
			this.taskReconciliationTimers.delete(key);
		}
		const existing = this.taskReconciliations.get(key);
		if (existing) {
			await existing;
			return;
		}
		const reconciliation = this.reconcileTaskCandidateOnce(candidate);
		this.taskReconciliations.set(key, reconciliation);
		try {
			await reconciliation;
		} finally {
			if (this.taskReconciliations.get(key) === reconciliation) this.taskReconciliations.delete(key);
		}
	}
	scheduleTaskCandidateReconciliation(candidate) {
		const key = `${candidate.requesterSessionKey}\0${candidate.childThreadId}`;
		if (this.disposed || this.retiredParentStates.has(candidate.parentState) || this.recoveryPollDelaysMs.length === 0 || this.taskReconciliationTimers.has(key)) return;
		const delayMs = delayForAttempt(this.recoveryPollDelaysMs, candidate.recoveryAttempt++);
		const timer = setTimeout(() => {
			this.taskReconciliationTimers.delete(key);
			this.reconcileTaskCandidate(candidate).catch((error) => {
				this.logRecoveryFailure(candidate.childThreadId, error);
				this.scheduleTaskCandidateReconciliation(candidate);
			});
		}, delayMs);
		this.taskReconciliationTimers.set(key, timer);
		unrefTimer(timer);
	}
	async reconcileTaskCandidateOnce(candidate) {
		if (this.retiredParentStates.has(candidate.parentState)) return;
		const runId = codexNativeSubagentRunId(candidate.childThreadId);
		const task = candidate.taskRuntime.listTaskRecords().find((record) => record.runId === runId);
		if (!task || task.requesterSessionKey !== candidate.requesterSessionKey || !this.shouldReconcileCodexNativeTask(task)) return;
		const childBeforeRead = this.childStates.get(candidate.childThreadId);
		const statusRead = this.retainThreadStatusRevision(candidate.childThreadId);
		try {
			let recovery;
			try {
				recovery = await this.readThreadRecovery(candidate.childThreadId);
			} catch (error) {
				this.logRecoveryFailure(candidate.childThreadId, error);
				this.scheduleTaskCandidateReconciliation(candidate);
				return;
			}
			if (this.retiredParentStates.has(candidate.parentState)) return;
			if (!statusRead.isCurrent() || this.childStates.get(candidate.childThreadId) !== childBeforeRead) {
				this.scheduleTaskCandidateReconciliation(candidate);
				return;
			}
			const parentThreadId = recovery.parentThreadId;
			if (!parentThreadId) {
				this.scheduleTaskCandidateReconciliation(candidate);
				return;
			}
			let state = this.parentStates.get(parentThreadId);
			if (state && state.requesterSessionKey !== candidate.requesterSessionKey) return;
			if (!state) {
				state = {
					parentThreadId,
					owners: /* @__PURE__ */ new Map(),
					turnIds: /* @__PURE__ */ new Set(),
					nativeCompletionReceipts: /* @__PURE__ */ new Set(),
					requesterSessionKey: candidate.requesterSessionKey,
					taskRuntimeScope: candidate.taskRuntimeScope,
					agentId: candidate.agentId,
					taskRuntime: candidate.taskRuntime
				};
				this.prepareParentTaskRuntime(state);
				this.parentStates.set(parentThreadId, state);
			}
			const childState = this.registerChildThread(state, candidate.childThreadId, recovery.agentPath ? { agentPath: recovery.agentPath } : {});
			if (!childState) {
				this.pruneParentIfUnused(state);
				return;
			}
			if ([...childState.agentPathKeys].some((key) => candidate.nativeCompletionReceipts.has(key))) childState.nativeCompletionDelivered = true;
			if (recovery.threadState === "active") this.observeActiveChild(childState);
			if (recovery.threadState === "other") this.clearSystemErrorFallback(childState);
			if (recovery.resumable) {
				this.settleResumableChild(childState);
				return;
			}
			const completion = recovery.completion;
			if (!completion) {
				if (recovery.fallbackCompletion) {
					this.setRecoveryFallback(childState, recovery.fallbackCompletion, recovery.fallbackCompletion.completedAt ?? this.now());
					return;
				}
				this.scheduleRecoveryPoll(childState);
				return;
			}
			if (isNoFinalCompletion(completion)) {
				this.setRecoveryFallback(childState, completion, completion.completedAt ?? this.now());
				return;
			}
			await this.processCompletion(state, childState, completion, completion.completedAt);
		} finally {
			statusRead.release();
		}
	}
	shouldReconcileCodexNativeTask(task) {
		if (task.status === "queued" || task.status === "running" || task.deliveryStatus === "pending") return true;
		if (task.deliveryStatus !== "not_applicable" || task.endedAt === void 0) return false;
		return task.endedAt >= this.now() - RECENT_TERMINAL_TASK_RECONCILE_GRACE_MS;
	}
	logRecoveryFailure(childThreadId, error) {
		embeddedAgentLog.debug("Codex native subagent history is not ready", {
			childThreadId,
			error: formatErrorMessage(error)
		});
	}
};
const codexNativeSubagentMonitorRuntime = {
	Monitor,
	register: registerMonitor,
	retireParent: (client, parentThreadId) => {
		monitors.get(client)?.retireParent(parentThreadId);
	}
};
function readThreadTurnRecovery(thread, childThreadId) {
	const turns = Array.isArray(thread.turns) ? thread.turns : [];
	for (let index = turns.length - 1; index >= 0; index -= 1) {
		const turn = turns[index];
		if (!isJsonObject(turn)) continue;
		const status = normalizeIdentifier(readStringField(turn, "status"));
		return {
			completion: readTurnCompletion(turn, childThreadId),
			resumable: status === "interrupted"
		};
	}
	return { resumable: false };
}
function toChildTurnCompletion(childState, turn) {
	const status = normalizeIdentifier(readStringField(turn, "status"));
	if (status === "completed") {
		const turnId = readStringField(turn, "id");
		const result = turnId ? lastChildAssistantMessage(childState, turnId) : void 0;
		return {
			childThreadId: childState.childThreadId,
			status: "succeeded",
			statusLabel: result ? "turn_completed" : "completed_without_final_message",
			result: result ?? "Codex native subagent completed without a final assistant message."
		};
	}
	if (status === "failed") return {
		childThreadId: childState.childThreadId,
		status: "failed",
		statusLabel: "turn_failed",
		result: readTurnErrorMessage(turn) ?? "Codex native subagent failed."
	};
}
function lastChildAssistantMessage(childState, turnId) {
	const messages = childState.assistantMessagesByTurn.get(turnId);
	if (!messages) return;
	for (const itemId of messages.order.toReversed()) if (messages.finalMessageIds.has(itemId) && !messages.commentaryIds.has(itemId)) {
		const text = normalizeOptionalString(messages.texts.get(itemId));
		if (text) return text;
	}
}
function readTurnErrorMessage(turn) {
	const error = isJsonObject(turn.error) ? turn.error : void 0;
	return normalizeOptionalString(readStringField(error, "message")) ?? normalizeOptionalString(isJsonObject(error?.codexErrorInfo) ? readStringField(error.codexErrorInfo, "message") : void 0);
}
function systemErrorFallbackCompletion(childThreadId) {
	return {
		childThreadId,
		status: "failed",
		statusLabel: "system_error",
		result: "Codex app-server reported a system error for the native subagent thread."
	};
}
function readTurnCompletion(turn, childThreadId) {
	const status = normalizeIdentifier(readStringField(turn, "status"));
	if (status === "inprogress" || !status) return;
	const result = readLastAgentMessage(turn);
	const completedAtSeconds = asFiniteNumber(turn.completedAt);
	const completedAt = completedAtSeconds === void 0 ? void 0 : Math.round(completedAtSeconds * 1e3);
	if (status === "completed") return {
		childThreadId,
		status: "succeeded",
		statusLabel: result ? "task_complete" : "completed_without_final_message",
		result: result ?? "Codex native subagent completed without a final assistant message.",
		completedAt
	};
	if (status === "interrupted") return;
	if (status === "failed") return {
		childThreadId,
		status: "failed",
		statusLabel: "task_failed",
		result: readTurnErrorMessage(turn) ?? result ?? "Codex native subagent failed.",
		completedAt
	};
}
function readLastAgentMessage(turn) {
	const items = Array.isArray(turn.items) ? turn.items : [];
	let legacyResult;
	for (let index = items.length - 1; index >= 0; index -= 1) {
		const item = items[index];
		if (!isJsonObject(item)) continue;
		if (normalizeIdentifier(readStringField(item, "type")) !== "agentmessage") continue;
		const text = readStringField(item, "text")?.trim();
		if (!text) continue;
		const phase = normalizeIdentifier(readStringField(item, "phase"));
		if (phase === "finalanswer") return text;
		if (!phase) legacyResult ??= text;
	}
	return legacyResult;
}
function buildParentAgentPathKey(parentThreadId, agentPath) {
	return `${parentThreadId}\0${agentPath}`;
}
function isNoFinalCompletion(completion) {
	return completion.status === "succeeded" && completion.statusLabel === "completed_without_final_message";
}
function delayForAttempt(delays, attempt) {
	return Math.max(1, delays[Math.min(attempt, delays.length - 1)] ?? 1);
}
function readThreadParentThreadId(thread) {
	return readStringField(thread, "parentThreadId")?.trim() ?? readStringField(readThreadSpawnSource(thread), "parent_thread_id")?.trim();
}
function readThreadSpawnSource(thread) {
	const source = isJsonObject(thread?.source) ? thread.source : void 0;
	const subAgent = isJsonObject(source?.subAgent) ? source.subAgent : void 0;
	return isJsonObject(subAgent?.thread_spawn) ? subAgent.thread_spawn : void 0;
}
function readStringArray(value) {
	if (!Array.isArray(value)) return [];
	return value.filter((entry) => typeof entry === "string" && entry.trim() !== "");
}
function readObjectStringKeys(value) {
	return isJsonObject(value) ? Object.keys(value).filter((entry) => entry.trim() !== "") : [];
}
const CODEX_FOLLOWUP_COLLAB_TOOLS = new Set(["followuptask", "sendinput", "resumeagent"]); // v-codex-native-followup-admission-v1
function normalizeIdentifier(value) {
	return value?.replace(/[^a-z0-9]/giu, "").toLowerCase();
}
function unrefTimer(timer) {
	if (typeof timer === "object" && timer && "unref" in timer) timer.unref();
}
//#endregion
export { CodexToolProgressProjection as a, isCodexCommandBearingToolCall as c, sanitizeCodexToolResponse as d, CodexToolTranscriptProjection as i, resolveCodexToolProgressDetailMode as l, CodexEventProjection as n, shouldEmitTranscriptToolProgress as o, emitCodexAgentEvent as r, inferCodexDynamicToolMeta as s, codexNativeSubagentMonitorRuntime as t, sanitizeCodexToolArguments as u };
