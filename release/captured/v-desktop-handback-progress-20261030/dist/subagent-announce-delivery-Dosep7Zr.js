// v-task-announce-receipt-v1
import {reconcilePresentedResult} from "./v-feishu-task-presentation-delivery.mjs";
// voice-resume-projection-v1
// gpt-live-consult-continuation-v1: delivery
import { m as clampTimerTimeoutMs } from "./number-coercion-CLj0HTDM.js";
import { c as normalizeOptionalLowercaseString, l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { y as uniqueStrings } from "./string-normalization-DiSb4JeN.js";
import { i as truncateWithMarker } from "./utf16-slice-D_ngcYKd.js";
import { r as defaultRuntime } from "./runtime-V1VdbWVS.js";
import { t as isFastTestRuntimeEnv } from "./test-runtime-env-DQDRzsLt.js";
import "./env-UY9MQ9LW.js";
import { n as getRuntimeConfig } from "./io.runtime-CKu7Rw0j.js";
import { et as sanitizeAgentRunTerminalReplyText, nt as normalizeAgentRunRouteChange } from "./openclaw-state-db-Bh3Bq87y.js";
import { n as INTERNAL_RUNTIME_CONTEXT_END, s as escapeInternalRuntimeContextDelimiters, t as INTERNAL_RUNTIME_CONTEXT_BEGIN } from "./internal-runtime-context-DWUZUDW2.js";
import { D as tryResolveLegacyCompatibilityAgentId } from "./agent-scope-config-CUiGBd59.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { C as isCronRunSessionKey, O as parseAgentSessionKey, u as normalizeMainKey, w as isCronSessionKey } from "./session-key-CRjxKW0X.js";
import { n as normalizeAccountId } from "./account-id-CETVCrTz.js";
import { o as resolveSessionStorePathCore } from "./paths-DDTeIhCT.js";
import "./legacy.default-agent-owner-BMzvJbjU.js";
import { n as resolvePersistedSessionStoreOwnerForKey } from "./session-store-owner-Df_uY3tv.js";
import "./config-Cv60gBux.js";
import { o as callGateway } from "./call-DcwkiOeW.js";
import { r as getLoadedChannelPluginForRead } from "./registry-loaded-CWEKVWPu.js";
import { t as deriveSessionChatTypeFromKey } from "./session-chat-type-shared-BKTfMJHj.js";
import { t as getGlobalHookRunner } from "./hook-runner-global-DLqoAE5f.js";
import { f as stringifyRouteThreadId } from "./channel-route--2in3Ckg.js";
import { t as INTERNAL_MESSAGE_CHANNEL } from "./message-channel-constants-2zSoJXQC.js";
import { n as normalizeMessageChannel } from "./message-channel-core-D0_xUNNr.js";
import { c as normalizeDeliveryContext, d as sessionDeliveryChannel, n as deliveryContextFromSession, o as mergeDeliveryContext } from "./delivery-context.shared-DlcU69m_.js";
import { t as basenameFromAnyPath } from "./file-name-CKnWacTs.js";
import { n as sanitizeForPromptLiteral, r as wrapPromptDataBlock } from "./sanitize-for-prompt-C5q9LjmF.js";
import { f as loadSessionEntryReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { n as isGatewayMessageChannel, t as isDeliverableMessageChannel } from "./message-channel-normalize-DzpgR6ro.js";
import { a as isInternalMessageChannel } from "./message-channel-BGKf9KPa.js";
import "./session-accessor-K0XuW6ln.js";
import { I as completionRequiresMessageToolDelivery } from "./task-registry-B4-CJZk7.js";
import { a as isFailoverError } from "./error-Crg6nsju.js";
import { i as stripTargetTopicSuffix, n as stripOutboundTargetKindPrefix, r as stripTargetProviderPrefix } from "./channel-target-prefix-CCF7M7EQ.js";
import { i as resolveConversationIdFromTargets } from "./conversation-resolution-Bh8rItgJ.js";
import { n as normalizeConversationRef } from "./session-binding-normalization-bCHv4vu6.js";
import { t as getSessionBindingService } from "./session-binding-service-BMVDxMW1.js";
import { a as formatEmbeddedAgentQueueFailureSummary, m as isEmbeddedRunAbandoned, u as isEmbeddedAgentRunActive, v as queueEmbeddedAgentMessageWithOutcomeAsync } from "./runs-5WnDPZ0V.js";
import { i as resolveActiveEmbeddedRunSessionId } from "./active-run-projections-rkNbMELs.js";
import "./sessions-eI69vxPt.js";
import { l as isPlatformMessageRejectedError, s as isOutboundDeliveryError } from "./deliver-types-Diy-VQKA.js";
import { l as resolveDeliveryNotSentRetryability } from "./delivery-recovery.shared-BHlrbHZ6.js";
import { c as getSubagentDepthFromSessionStore } from "./subagent-capabilities-CPAHEjL-.js";
import "./failover-error-B46Ke6VT.js";
import { d as shouldPreserveUserFacingSessionStateForInputProvenance, o as isAgentMediatedCompletionSourceTool } from "./input-provenance-CCQsDhUy.js";
import { r as hasGeneratedMediaCompletionEvent, t as resolveRequesterStoreKey } from "./subagent-requester-store-key-BqjpAwdL.js";
import { n as createUserTurnTranscriptRecorder } from "./user-turn-transcript-sTfkLnbR.js";
import { t as dispatchGatewayMethodInProcess } from "./server-plugin-in-process-dispatch-BirRDL7L.js";
import { S as scheduleSessionDelivery } from "./subagent-completion-admission.store-JmpNDYTF.js";
import { d as enqueueClaimedSessionDelivery, x as releaseSessionDeliveryClaim } from "./session-delivery-queue-storage-BRivgTij.js";
import { a as hasVisibleAgentPayload, i as hasIntentionalSilentAgentPayload } from "./message-visibility-D0FOL9Zj.js";
import "./subagent-announce.runtime.js";
import { _ as hasUnaccountedMessagingToolAggregateEvidence, a as getAgentCommandDeliveryFailure, b as resolveExplicitFinalSourceReplyDeliveryEvidence, h as hasMessagingToolDeliveryEvidence, l as hasCommittedOutboundDeliveryEvidence, o as getAutomaticDeliveryEvidence, s as getGatewayAgentResult, u as hasCommittedSourceReplyDeliveryEvidence } from "./delivery-evidence-BDLYyuib.js";
import { o as sanitizePendingFinalDeliveryText } from "./pending-final-delivery-CNQYsZ37.js";
import { t as admitCorrelatedSubagentSessionDelivery } from "./subagent-completion-delivery-fFWP8SI_.js";
import { t as resolveQueueSettings } from "./queue-CsUB-_ct.js";
import { t as resolveExternalBestEffortDeliveryTarget } from "./best-effort-delivery-BXvpWOzi.js";
import { t as sendMessage } from "./message-BU0Kr-BJ.js";
import { n as normalizeAgentRunTerminalDeliverySnapshot, t as isNonTerminalAgentRunStatus } from "./agent-run-status-Ie-4cjf6.js";
import { r as sourceDeliveryTargetsMatch } from "./source-delivery-plan-DMpUap-H.js";
import { t as deliveryContextFromConversation } from "./route-projection-jTmEzjDR.js";
//#region src/agents/generated-attachments.ts
/**
* Formats generated attachment references for agent-visible output.
*/
function generatedAttachmentReference(attachment) {
	return normalizeOptionalString(attachment.path ?? attachment.url ?? attachment.mediaUrl ?? attachment.filePath);
}
/** Return unique media URLs/paths from generated attachments. */
function mediaUrlsFromGeneratedAttachments(attachments) {
	return uniqueStrings(attachments?.flatMap((attachment) => generatedAttachmentReference(attachment) ?? []) ?? []);
}
function nameFromGeneratedAttachment(attachment) {
	return normalizeOptionalString(attachment.name) ?? basenameFromAnyPath(generatedAttachmentReference(attachment) ?? "");
}
function neutralizeEscapedGeneratedMediaDirective(value) {
	return value.replace(/((?:\\r\\n|\\n|\\r)[^\S\r\n]*)(media):/giu, "$1$2：").replace(/((?:\\r\\n|\\n|\\r) {0,3})(`{3,}|~{3,})/gu, "$1>$2");
}
/** Escape provider-controlled summary text without changing its structured result. */
function sanitizeGeneratedMediaDisplayText(value) {
	let sanitized = "";
	for (const char of value) switch (char) {
		case "\\":
			sanitized += "\\\\";
			break;
		case "\r":
			sanitized += "\\r";
			break;
		case "\n":
			sanitized += "\\n";
			break;
		case "	":
			sanitized += "\\t";
			break;
		default: {
			const code = char.charCodeAt(0);
			sanitized += code <= 31 || code === 127 || code === 8232 || code === 8233 ? `\\u${code.toString(16).padStart(4, "0")}` : char;
		}
	}
	return neutralizeEscapedGeneratedMediaDirective(sanitizeForPromptLiteral(sanitized)).replaceAll("[[", "［[").replaceAll("![", "!［");
}
function quoteGeneratedAttachmentDisplay(value) {
	return neutralizeEscapedGeneratedMediaDirective(JSON.stringify(sanitizeForPromptLiteral(value))).replaceAll("[", "\\u005b");
}
/** Format generated attachment metadata as prompt-safe text lines. */
function formatGeneratedAttachmentLines(attachments) {
	if (!attachments?.length) return [];
	const lines = ["Attachments:"];
	for (const [index, attachment] of attachments.entries()) {
		const parts = [`${index + 1}.`];
		const type = normalizeOptionalString(attachment.type);
		const name = nameFromGeneratedAttachment(attachment);
		const mimeType = normalizeOptionalString(attachment.mimeType);
		const path = normalizeOptionalString(attachment.path ?? attachment.filePath);
		const url = normalizeOptionalString(attachment.url ?? attachment.mediaUrl);
		if (type) parts.push(`type=${quoteGeneratedAttachmentDisplay(type).slice(1, -1)}`);
		if (name) parts.push(`name=${quoteGeneratedAttachmentDisplay(name)}`);
		if (mimeType) parts.push(`mimeType=${quoteGeneratedAttachmentDisplay(mimeType).slice(1, -1)}`);
		if (path) parts.push(`path=${quoteGeneratedAttachmentDisplay(path)}`);
		else if (url) parts.push(`mediaUrl=${quoteGeneratedAttachmentDisplay(url)}`);
		lines.push(parts.join(" "));
	}
	return lines;
}
//#endregion
//#region src/agents/internal-events.ts
/**
* Internal runtime event prompt formatting.
* Sanitizes background task completion events into protected runtime-context
* blocks or plain prompt text.
*/
const MAX_TASK_COMPLETION_RESULT_ESCAPED_CHARS = 6e3;
const TASK_COMPLETION_RESULT_TRUNCATION_NOTICE = "\n[child result truncated]";
const MAX_TASK_COMPLETION_STATUS_LABEL_CHARS = 500;
const TASK_COMPLETION_STATUS_LABEL_TRUNCATION_MARKER = "…[truncated]";
/** Collect ordered media descriptors and per-reference trust from internal events. */
function collectAgentInternalEventMedia(events) {
	if (!events?.length) return {
		mediaUrls: [],
		attachments: [],
		trustByUrl: /* @__PURE__ */ new Map()
	};
	const mediaUrls = [];
	const attachments = [];
	const indexByUrl = /* @__PURE__ */ new Map();
	const trustByUrl = /* @__PURE__ */ new Map();
	for (const event of events) {
		const generatedMediaEvent = hasGeneratedMediaCompletionEvent([event]);
		const attachmentByUrl = new Map((event.attachments ?? []).flatMap((attachment) => {
			const reference = normalizeOptionalString(attachment.path ?? attachment.url ?? attachment.mediaUrl ?? attachment.filePath);
			return reference ? [[reference, attachment]] : [];
		}));
		for (const mediaUrl of [...Array.isArray(event.mediaUrls) ? event.mediaUrls : [], ...mediaUrlsFromGeneratedAttachments(event.attachments)]) {
			const normalized = normalizeOptionalString(mediaUrl);
			if (!normalized) continue;
			const metadata = attachmentByUrl.get(normalized);
			const existingIndex = indexByUrl.get(normalized);
			if (existingIndex !== void 0) {
				trustByUrl.set(normalized, trustByUrl.get(normalized) === true || generatedMediaEvent);
				if (metadata && Object.keys(attachments[existingIndex] ?? {}).length === 0) attachments[existingIndex] = metadata;
				continue;
			}
			indexByUrl.set(normalized, mediaUrls.length);
			trustByUrl.set(normalized, generatedMediaEvent);
			mediaUrls.push(normalized);
			attachments.push(metadata ?? {});
		}
	}
	return {
		mediaUrls,
		attachments,
		trustByUrl
	};
}
function sanitizeSingleLineField(value, fallback) {
	return escapeInternalRuntimeContextDelimiters(value).replace(/\r?\n+/g, " ").trim() || fallback;
}
function sanitizeMultilineField(value, fallback) {
	return escapeInternalRuntimeContextDelimiters(value).replace(/\r\n/g, "\n").trim() || fallback;
}
function sanitizeMediaDirectiveValue(value) {
	let singleLine = "";
	for (const char of escapeInternalRuntimeContextDelimiters(value).replace(/\r?\n/g, " ")) {
		const code = char.charCodeAt(0);
		singleLine += code < 32 || code === 127 ? " " : char;
	}
	return singleLine.trim() || null;
}
function formatChildResultDataBlock(value) {
	return wrapPromptDataBlock({
		label: "Child result",
		text: value,
		maxEscapedChars: MAX_TASK_COMPLETION_RESULT_ESCAPED_CHARS,
		truncationMarker: TASK_COMPLETION_RESULT_TRUNCATION_NOTICE
	}) || "Child result: (no output)";
}
function formatGeneratedMediaDirectiveLines(event) {
	const mediaUrls = Array.from(new Set([...event.mediaUrls ?? [], ...mediaUrlsFromGeneratedAttachments(event.attachments)].map(sanitizeMediaDirectiveValue).filter((value) => value !== null)));
	if (mediaUrls.length === 0) return [];
	return ["Generated media:", ...mediaUrls.map((mediaUrl) => `MEDIA:${mediaUrl}`)];
}
function formatTaskCompletionEvent(event, mode) {
	const sessionKey = sanitizeSingleLineField(event.childSessionKey, "unknown");
	const sessionId = sanitizeSingleLineField(event.childSessionId ?? "unknown", "unknown");
	const announceType = sanitizeSingleLineField(event.announceType, "unknown");
	const taskLabel = sanitizeSingleLineField(event.taskLabel, "unnamed task");
	const statusLabel = truncateWithMarker(sanitizeSingleLineField(event.statusLabel, event.status), MAX_TASK_COMPLETION_STATUS_LABEL_CHARS, {
		marker: TASK_COMPLETION_STATUS_LABEL_TRUNCATION_MARKER,
		reserve: 12,
		trimEnd: true
	});
	const result = formatChildResultDataBlock(event.result);
	const modelRouteChange = normalizeAgentRunRouteChange(event.modelRouteChange);
	const attachmentLines = formatGeneratedAttachmentLines(event.attachments);
	const mediaDirectiveLines = formatGeneratedMediaDirectiveLines(event);
	const lines = mode === "protected" ? ["[Internal task completion event]"] : ["A background task completed. Use this result to reply to the user in your normal assistant voice.", ""];
	lines.push(`source: ${event.source}`, `session_key: ${sessionKey}`, `session_id: ${sessionId}`, `type: ${announceType}`, `task: ${taskLabel}`, `status: ${statusLabel}`, "", result);
	if (modelRouteChange) lines.push("", modelRouteChange);
	if (attachmentLines.length > 0) lines.push("", ...attachmentLines);
	if (mediaDirectiveLines.length > 0) lines.push("", ...mediaDirectiveLines);
	if (event.statsLine?.trim()) lines.push("", sanitizeMultilineField(event.statsLine, ""));
	lines.push("", mode === "protected" ? "Action:" : "Instruction:", sanitizeMultilineField(event.replyInstruction, ""));
	return lines.join("\n");
}
/** Format internal runtime events for the protected runtime-context prompt block. */
function formatAgentInternalEventsForPrompt(events) {
	if (!events || events.length === 0) return "";
	const blocks = events.map((event) => {
		if (event.type === "task_completion") return formatTaskCompletionEvent(event, "protected");
		return "";
	}).filter((value) => value.trim().length > 0);
	if (blocks.length === 0) return "";
	return [
		INTERNAL_RUNTIME_CONTEXT_BEGIN,
		"OpenClaw runtime context (internal):",
		"This context is runtime-generated, not user-authored. Keep internal details private.",
		"",
		blocks.join("\n\n---\n\n"),
		INTERNAL_RUNTIME_CONTEXT_END
	].join("\n");
}
/** Build a protected follow-up that can retry only media proven missing from a partial send. */
function formatGeneratedMediaDeliveryRetryForPrompt(mediaUrls) {
	const mediaDirectiveLines = Array.from(new Set(mediaUrls.map(sanitizeMediaDirectiveValue).filter((value) => value !== null))).map((mediaUrl) => `MEDIA:${mediaUrl}`);
	if (mediaDirectiveLines.length === 0) return "";
	return [
		INTERNAL_RUNTIME_CONTEXT_BEGIN,
		"OpenClaw runtime context (internal):",
		"This context is runtime-generated, not user-authored. Keep internal details private.",
		"",
		"[Generated media delivery retry]",
		"A previous agent turn delivered only part of this generated-media result.",
		"",
		"Generated media still missing:",
		...mediaDirectiveLines,
		"",
		"Action:",
		"Deliver only the generated media listed above. Do not resend any other attachment.",
		INTERNAL_RUNTIME_CONTEXT_END
	].join("\n");
}
/** Format internal runtime events for plain prompts that lack context delimiters. */
function formatAgentInternalEventsForPlainPrompt(events) {
	if (!events || events.length === 0) return "";
	return events.map((event) => {
		if (event.type === "task_completion") return formatTaskCompletionEvent(event, "plain");
		return "";
	}).filter((value) => value.trim().length > 0).join("\n\n---\n\n");
}
//#endregion
//#region src/agents/subagents/announce/subagent-announce-delivery-retry.ts
/**
* Retry and error policy for subagent announcement delivery.
*/
const DEFAULT_SUBAGENT_ANNOUNCE_TIMEOUT_MS = 12e4;
var SourceOwnerChangedError = class extends Error {
	constructor() {
		super("subagent source lifecycle changed before completion delivery");
		this.name = "SourceOwnerChangedError";
	}
};
function sourceOwnerChangedResult() {
	return {
		delivered: false,
		path: "none",
		reason: "source_owner_changed",
		error: "subagent source lifecycle changed before completion delivery",
		terminal: true,
		disposition: "intentional_non_delivery"
	};
}
function resolveSubagentAnnounceTimeoutMs(cfg) {
	const configured = cfg.agents?.defaults?.subagents?.announceTimeoutMs;
	return clampTimerTimeoutMs(configured) ?? DEFAULT_SUBAGENT_ANNOUNCE_TIMEOUT_MS;
}
function summarizeDeliveryError(error) {
	if (error instanceof Error) return error.message || "error";
	if (typeof error === "string") return error;
	if (error === void 0 || error === null) return "unknown error";
	try {
		return JSON.stringify(error);
	} catch {
		return "error";
	}
}
const TRANSIENT_ANNOUNCE_DELIVERY_ERROR_PATTERNS = [
	/\berrorcode=unavailable\b/i,
	/\bstatus\s*[:=]\s*"?unavailable\b/i,
	/\bUNAVAILABLE\b/,
	/no active .* listener/i,
	/gateway not connected/i,
	/gateway closed \(1006/i,
	/gateway timeout/i,
	/\b(econnreset|econnrefused|etimedout|enotfound|ehostunreach|network error)\b/i
];
const WRITER_CLAIM_REBOUND_ANNOUNCE_RE = /session writer claim changed before transcript persistence/i;
const PERMANENT_ANNOUNCE_DELIVERY_ERROR_PATTERNS = [
	/unsupported channel/i,
	/unknown channel/i,
	/chat not found/i,
	/user not found/i,
	/bot.*not.*member/i,
	/bot was blocked by the user/i,
	/forbidden: bot was kicked/i,
	/recipient is not a valid/i,
	/outbound not configured for channel/i,
	WRITER_CLAIM_REBOUND_ANNOUNCE_RE
];
function isWriterClaimReboundAnnounceError(error) {
	return Boolean(error && typeof error === "object" && error.name === "SessionTranscriptWriterClaimReboundError" || WRITER_CLAIM_REBOUND_ANNOUNCE_RE.test(summarizeDeliveryError(error)));
}
const ANNOUNCE_ERROR_CHAIN_KEYS = [
	"cause",
	"error",
	"reason"
];
function isAnnounceErrorRecord(error) {
	return Boolean(error && typeof error === "object");
}
function hasAnnounceErrorMatch(error, matches, seen = /* @__PURE__ */ new Set()) {
	if (matches(error)) return true;
	if (!isAnnounceErrorRecord(error)) return false;
	if (seen.has(error)) return false;
	seen.add(error);
	return ANNOUNCE_ERROR_CHAIN_KEYS.some((key) => hasAnnounceErrorMatch(error[key], matches, seen));
}
function hasWriterClaimReboundAnnounceError(error) {
	return hasAnnounceErrorMatch(error, isWriterClaimReboundAnnounceError);
}
function isTransientFailoverAnnounceError(error) {
	return isFailoverError(error) && (error.reason === "overloaded" || (error.attempts?.length ?? 0) > 0);
}
function isPermanentNonWriterAnnounceError(error) {
	return hasAnnounceErrorMatch(error, (candidate) => isPlatformMessageRejectedError(candidate) || !isWriterClaimReboundAnnounceError(candidate) && PERMANENT_ANNOUNCE_DELIVERY_ERROR_PATTERNS.some((pattern) => pattern.test(summarizeDeliveryError(candidate))));
}
function isTransientAnnounceDeliveryError(error) {
	if (hasAnnounceSendEvidence(error)) return false;
	const typedRetryability = resolveDeliveryNotSentRetryability(error);
	if (typedRetryability !== void 0) return typedRetryability;
	if (isPermanentNonWriterAnnounceError(error)) return false;
	if (hasWriterClaimReboundAnnounceError(error)) return true;
	return hasAnnounceErrorMatch(error, (candidate) => {
		if (isTransientFailoverAnnounceError(candidate)) return true;
		const message = summarizeDeliveryError(candidate);
		if (candidate && typeof candidate === "object" && candidate.gatewayCode === "UNAVAILABLE" && /cron run continuation/i.test(message)) return true;
		return TRANSIENT_ANNOUNCE_DELIVERY_ERROR_PATTERNS.some((pattern) => pattern.test(message));
	});
}
function isPermanentAnnounceDeliveryError(error) {
	const typedRetryability = resolveDeliveryNotSentRetryability(error);
	if (typedRetryability !== void 0) return !typedRetryability;
	return isPermanentNonWriterAnnounceError(error) || hasWriterClaimReboundAnnounceError(error);
}
function isIncompleteAnnounceAgentResultError(error) {
	const message = summarizeDeliveryError(error);
	return /(?:incomplete terminal response|code=incomplete_result)\b/i.test(message);
}
function hasDirectAnnounceSendEvidence(error) {
	if (isOutboundDeliveryError(error) && error.sentBeforeError) return true;
	if (!isAnnounceErrorRecord(error)) return false;
	return error.sentBeforeError === true || error.visibleReplySent === true;
}
function hasAnnounceSendEvidence(error) {
	return hasAnnounceErrorMatch(error, hasDirectAnnounceSendEvidence);
}
async function waitForAnnounceRetryDelay(ms, signal) {
	if (ms <= 0) return;
	if (!signal) {
		await new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
		return;
	}
	if (signal.aborted) return;
	await new Promise((resolve) => {
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			signal.removeEventListener("abort", onAbort);
			resolve();
		};
		signal.addEventListener("abort", onAbort, { once: true });
	});
}
function resolveDirectAnnounceTransientRetryDelaysMs() {
	return isFastTestRuntimeEnv() ? [
		8,
		16,
		32
	] : [
		5e3,
		1e4,
		2e4
	];
}
async function runAnnounceDeliveryWithRetry(params) {
	const retryDelaysMs = resolveDirectAnnounceTransientRetryDelaysMs();
	for (const [retryIndex, delayMs] of retryDelaysMs.entries()) {
		if (params.isAttemptAllowed?.() === false) throw new SourceOwnerChangedError();
		if (params.signal?.aborted) throw new Error("announce delivery aborted");
		try {
			return await params.run();
		} catch (err) {
			if (!isTransientAnnounceDeliveryError(err) || params.signal?.aborted) throw err;
			if (params.isAttemptAllowed?.() === false) throw new SourceOwnerChangedError();
			const nextAttempt = retryIndex + 2;
			const maxAttempts = retryDelaysMs.length + 1;
			defaultRuntime.log(`[warn] Subagent announce ${params.operation} transient failure, retrying ${nextAttempt}/${maxAttempts} in ${Math.round(delayMs / 1e3)}s: ${summarizeDeliveryError(err)}`);
			await waitForAnnounceRetryDelay(delayMs, params.signal);
		}
	}
	if (params.signal?.aborted) throw new Error("announce delivery aborted");
	if (params.isAttemptAllowed?.() === false) throw new SourceOwnerChangedError();
	return await params.run();
}
//#endregion
//#region src/infra/outbound/bound-delivery-router.ts
function isActiveBinding(record) {
	return record.status === "active";
}
function resolveBindingForRequester(requester, bindings) {
	const matchingChannelAccount = bindings.filter((entry) => {
		const conversation = normalizeConversationRef(entry.conversation);
		return conversation.channel === requester.channel && conversation.accountId === requester.accountId;
	});
	if (matchingChannelAccount.length === 0) return null;
	const exactConversation = matchingChannelAccount.find((entry) => normalizeConversationRef(entry.conversation).conversationId === requester.conversationId);
	if (exactConversation) return exactConversation;
	if (matchingChannelAccount.length === 1) return matchingChannelAccount[0] ?? null;
	return null;
}
/** Creates a router that resolves task-completion delivery through active session bindings. */
function createBoundDeliveryRouter(service = getSessionBindingService()) {
	return { resolveDestination: (input) => {
		const targetSessionKey = input.targetSessionKey.trim();
		if (!targetSessionKey) return {
			binding: null,
			mode: "fallback",
			reason: "missing-target-session"
		};
		const activeBindings = service.listBySession(targetSessionKey).filter(isActiveBinding);
		if (activeBindings.length === 0) return {
			binding: null,
			mode: "fallback",
			reason: "no-active-binding"
		};
		if (!input.requester) {
			if (input.failClosed) return {
				binding: null,
				mode: "fallback",
				reason: "missing-requester"
			};
			if (activeBindings.length === 1) return {
				binding: activeBindings[0] ?? null,
				mode: "bound",
				reason: "single-active-binding"
			};
			return {
				binding: null,
				mode: "fallback",
				reason: "ambiguous-without-requester"
			};
		}
		const requester = normalizeConversationRef(input.requester);
		if (!requester.channel || !requester.conversationId) return {
			binding: null,
			mode: "fallback",
			reason: "invalid-requester"
		};
		const fromRequester = resolveBindingForRequester(requester, activeBindings);
		if (fromRequester) return {
			binding: fromRequester,
			mode: "bound",
			reason: "requester-match"
		};
		if (activeBindings.length === 1 && !input.failClosed) return {
			binding: activeBindings[0] ?? null,
			mode: "bound",
			reason: "single-active-binding-fallback"
		};
		return {
			binding: null,
			mode: "fallback",
			reason: "no-requester-match"
		};
	} };
}
//#endregion
//#region src/agents/subagents/announce/subagent-announce-delivery.runtime.ts
/**
* Runtime dependency owner for subagent announcement delivery.
*
* Tests override this module's delivery capabilities while origin routing keeps
* using the direct runtime exports below.
*/
function tryResolveSubagentRequesterAgentId(cfg, requesterSessionKey, explicitAgentId) {
	const requestedAgentId = explicitAgentId?.trim() ? normalizeAgentId(explicitAgentId) : void 0;
	const parsedAgentId = parseAgentSessionKey(requesterSessionKey)?.agentId;
	if (requestedAgentId && parsedAgentId && requestedAgentId !== parsedAgentId) return;
	const persistedStoreOwner = resolvePersistedSessionStoreOwnerForKey(cfg, requesterSessionKey);
	if (persistedStoreOwner.kind === "retired") return;
	if (requestedAgentId && persistedStoreOwner.kind === "configured" && requestedAgentId !== persistedStoreOwner.agentId) return;
	const resolvedAgentId = requestedAgentId ?? parsedAgentId;
	if (resolvedAgentId) return resolvedAgentId;
	return (persistedStoreOwner.kind === "configured" ? persistedStoreOwner.agentId : void 0) ?? tryResolveLegacyCompatibilityAgentId(cfg);
}
function loadDefaultRequesterSessionEntry(requesterSessionKey, explicitAgentId) {
	const cfg = subagentAnnounceDeliveryDeps.getRuntimeConfig();
	const rawStorageKey = requesterSessionKey.trim();
	const canonicalKey = resolveRequesterStoreKey(cfg, requesterSessionKey, explicitAgentId);
	const configuredMainKey = normalizeMainKey(cfg.session?.mainKey);
	const storageKey = rawStorageKey === "main" || rawStorageKey === configuredMainKey ? canonicalKey : rawStorageKey;
	const agentId = tryResolveSubagentRequesterAgentId(cfg, rawStorageKey, explicitAgentId);
	if (!agentId) return {
		cfg,
		entry: void 0,
		canonicalKey
	};
	const storePath = resolveSessionStorePathCore(cfg.session?.store, { agentId });
	return {
		cfg,
		entry: subagentAnnounceDeliveryDeps.loadSessionEntry({
			storePath,
			sessionKey: storageKey,
			agentId,
			clone: false
		}),
		canonicalKey,
		agentId,
		storePath
	};
}
const defaultSubagentAnnounceDeliveryDeps = {
	callGateway: ((...args) => callGateway(...args)),
	dispatchGatewayMethodInProcess: ((...args) => dispatchGatewayMethodInProcess(...args)),
	getRuntimeConfig: () => getRuntimeConfig(),
	getRequesterSessionActivity: (requesterSessionKey, requesterAgentId) => {
		const resolvedAgentId = tryResolveSubagentRequesterAgentId(getRuntimeConfig(), requesterSessionKey, requesterAgentId);
		if (!resolvedAgentId) return { isActive: false };
		const storedSessionId = loadRequesterSessionEntry(requesterSessionKey, resolvedAgentId).entry?.sessionId;
		const sessionId = (parseAgentSessionKey(requesterSessionKey) ? resolveActiveEmbeddedRunSessionId(requesterSessionKey) : void 0) ?? storedSessionId;
		return {
			sessionId,
			isActive: Boolean(sessionId && isEmbeddedAgentRunActive(sessionId))
		};
	},
	isRequesterSessionAbandoned: (requesterSessionKey, sessionId) => isEmbeddedRunAbandoned({
		sessionKey: requesterSessionKey,
		sessionId
	}),
	loadSessionEntry: (...args) => loadSessionEntryReadOnly(...args),
	loadRequesterSessionEntry: loadDefaultRequesterSessionEntry,
	queueEmbeddedAgentMessageWithOutcome: (...args) => queueEmbeddedAgentMessageWithOutcomeAsync(...args),
	sendMessage: (...args) => sendMessage(...args)
};
let subagentAnnounceDeliveryDeps = defaultSubagentAnnounceDeliveryDeps;
function setSubagentAnnounceDeliveryDepsForTest(overrides) {
	const callGatewayOverride = overrides?.callGateway;
	const dispatchGatewayMethodInProcessOverride = overrides?.dispatchGatewayMethodInProcess ?? (callGatewayOverride ? (async (method, agentParams, options) => await callGatewayOverride({
		method,
		params: agentParams,
		expectFinal: options?.expectFinal,
		onAccepted: options?.onAccepted,
		timeoutMs: options?.timeoutMs
	})) : void 0);
	subagentAnnounceDeliveryDeps = overrides ? {
		...defaultSubagentAnnounceDeliveryDeps,
		...overrides,
		...dispatchGatewayMethodInProcessOverride ? { dispatchGatewayMethodInProcess: dispatchGatewayMethodInProcessOverride } : {}
	} : defaultSubagentAnnounceDeliveryDeps;
}
function getSubagentAnnounceRuntimeConfig() {
	return subagentAnnounceDeliveryDeps.getRuntimeConfig();
}
function getSubagentRequesterSessionActivity(requesterSessionKey, requesterAgentId) {
	return subagentAnnounceDeliveryDeps.getRequesterSessionActivity(requesterSessionKey, requesterAgentId);
}
function isSubagentRequesterSessionAbandoned(requesterSessionKey, sessionId) {
	return subagentAnnounceDeliveryDeps.isRequesterSessionAbandoned(requesterSessionKey, sessionId);
}
function loadRequesterSessionEntry(requesterSessionKey, explicitAgentId) {
	return subagentAnnounceDeliveryDeps.loadRequesterSessionEntry(requesterSessionKey, explicitAgentId);
}
function loadSessionEntryByKey(sessionKey, explicitAgentId) {
	const cfg = subagentAnnounceDeliveryDeps.getRuntimeConfig();
	const agentId = tryResolveSubagentRequesterAgentId(cfg, sessionKey, explicitAgentId);
	if (!agentId) return;
	const storePath = resolveSessionStorePathCore(cfg.session?.store, { agentId });
	return subagentAnnounceDeliveryDeps.loadSessionEntry({
		storePath,
		sessionKey,
		agentId,
		clone: false
	});
}
async function queueSubagentAnnounceMessage(sessionId, text, options) {
	return await subagentAnnounceDeliveryDeps.queueEmbeddedAgentMessageWithOutcome(sessionId, text, options);
}
async function dispatchSubagentAnnounceAgent(agentParams, options) {
	return await subagentAnnounceDeliveryDeps.dispatchGatewayMethodInProcess("agent", agentParams, options);
}
async function sendSubagentAnnounceMessage(params) {
	return await subagentAnnounceDeliveryDeps.sendMessage(params);
}
//#endregion
//#region src/agents/subagents/announce/subagent-announce-active-wake.ts
/**
* Active-requester wake and steering for subagent announcements.
*/
const SOURCE_OWNER_CHANGED = Symbol("source_owner_changed");
function formatQueueWakeFailureError(fallback, outcome) {
	const summary = formatEmbeddedAgentQueueFailureSummary(outcome);
	return summary ? `${fallback}: ${summary}` : fallback;
}
function resolveRequesterSessionActivity(requesterSessionKey, requesterAgentId) {
	const resolvedAgentId = tryResolveSubagentRequesterAgentId(getSubagentAnnounceRuntimeConfig(), requesterSessionKey, requesterAgentId);
	if (!resolvedAgentId) return { isActive: false };
	const activity = getSubagentRequesterSessionActivity(requesterSessionKey, resolvedAgentId);
	if (activity.sessionId || activity.isActive) return activity;
	const { entry } = loadRequesterSessionEntry(requesterSessionKey, resolvedAgentId);
	const sessionId = entry?.sessionId;
	return {
		sessionId,
		isActive: Boolean(sessionId && isEmbeddedAgentRunActive(sessionId))
	};
}
function resolveCompactionSteerRetryDelaysMs() {
	return isFastTestRuntimeEnv() ? [
		8,
		16,
		32,
		64
	] : [
		1e3,
		2e3,
		4e3,
		8e3
	];
}
async function resolveActiveWakeWithRetries(sessionId, message, wakeOptions, signal, isAttemptAllowed) {
	const compactionDeadlineMs = typeof wakeOptions.deliveryTimeoutMs === "number" && wakeOptions.deliveryTimeoutMs > 0 ? Date.now() + wakeOptions.deliveryTimeoutMs : void 0;
	let currentOptions = wakeOptions;
	const resolveRetryOptions = () => {
		if (compactionDeadlineMs === void 0) return currentOptions;
		const remainingDeliveryTimeoutMs = compactionDeadlineMs - Date.now();
		if (remainingDeliveryTimeoutMs <= 0) return;
		return {
			...currentOptions,
			deliveryTimeoutMs: remainingDeliveryTimeoutMs
		};
	};
	const attemptWake = async (options) => {
		if (isAttemptAllowed?.() === false) return SOURCE_OWNER_CHANGED;
		const result = await queueSubagentAnnounceMessage(sessionId, message, options);
		return isAttemptAllowed?.() === false ? SOURCE_OWNER_CHANGED : result;
	};
	let outcome = await attemptWake(currentOptions);
	const compactionRetryDelaysMs = resolveCompactionSteerRetryDelaysMs();
	let compactionRetryIndex = 0;
	for (;;) {
		if (outcome === SOURCE_OWNER_CHANGED) break;
		if (outcome.queued || signal?.aborted) break;
		if (isAttemptAllowed?.() === false) {
			outcome = SOURCE_OWNER_CHANGED;
			break;
		}
		if (outcome.reason === "transcript_commit_wait_unsupported" && currentOptions.waitForTranscriptCommit === true) {
			const bestEffortOptions = { ...currentOptions };
			delete bestEffortOptions.waitForTranscriptCommit;
			currentOptions = bestEffortOptions;
			outcome = await attemptWake(currentOptions);
			continue;
		}
		if (outcome.reason === "source_reply_delivery_mode_mismatch" && currentOptions.sourceReplyDeliveryMode !== void 0) {
			const activeRunOptions = { ...currentOptions };
			delete activeRunOptions.sourceReplyDeliveryMode;
			currentOptions = activeRunOptions;
			outcome = await attemptWake(currentOptions);
			continue;
		}
		if (outcome.reason === "compacting") {
			const remainingDeliveryTimeoutMs = compactionDeadlineMs === void 0 ? void 0 : compactionDeadlineMs - Date.now();
			if (!(remainingDeliveryTimeoutMs === void 0 ? compactionRetryIndex < compactionRetryDelaysMs.length : remainingDeliveryTimeoutMs > 0)) break;
			const scheduledDelayMs = compactionRetryDelaysMs[Math.min(compactionRetryIndex, compactionRetryDelaysMs.length - 1)] ?? 0;
			const delayMs = remainingDeliveryTimeoutMs === void 0 ? scheduledDelayMs : Math.min(scheduledDelayMs, remainingDeliveryTimeoutMs);
			if (delayMs <= 0 && remainingDeliveryTimeoutMs !== void 0) break;
			await waitForAnnounceRetryDelay(delayMs, signal);
			if (signal?.aborted) break;
			compactionRetryIndex += 1;
			const retryOptions = resolveRetryOptions();
			if (!retryOptions) break;
			outcome = await attemptWake(retryOptions);
			continue;
		}
		break;
	}
	return outcome;
}
async function maybeSteerSubagentAnnounce(params) {
	if (params.signal?.aborted) return { status: "none" };
	const cfg = getSubagentAnnounceRuntimeConfig();
	const requesterAgentId = tryResolveSubagentRequesterAgentId(cfg, params.requesterSessionKey, params.requesterAgentId);
	if (!requesterAgentId) return { status: "none" };
	const { entry } = loadRequesterSessionEntry(params.requesterSessionKey, requesterAgentId);
	const canonicalKey = resolveRequesterStoreKey(cfg, params.requesterSessionKey, requesterAgentId);
	const { sessionId, isActive } = resolveRequesterSessionActivity(params.requesterSessionKey, requesterAgentId);
	if (isSubagentRequesterSessionAbandoned(canonicalKey, sessionId)) return { status: "none" };
	if (!sessionId || !isActive) return { status: "none" };
	const queueSettings = resolveQueueSettings({
		cfg,
		channel: sessionDeliveryChannel(entry),
		sessionEntry: entry
	});
	const queueOptions = {
		deliveryTimeoutMs: params.deliveryTimeoutMs,
		steeringMode: "all",
		...queueSettings.debounceMs !== void 0 ? { debounceMs: queueSettings.debounceMs } : {},
		waitForTranscriptCommit: true,
		...params.createUserTurnTranscriptRecorder ? { userTurnTranscriptRecorder: params.createUserTurnTranscriptRecorder(sessionId) } : {}
	};
	const queueOutcome = await resolveActiveWakeWithRetries(sessionId, params.steerMessage, queueOptions, params.signal, params.isSourceSessionEffectsAllowed);
	if (queueOutcome === SOURCE_OWNER_CHANGED) return { status: "source_owner_changed" };
	if (queueOutcome.queued) return {
		status: "steered",
		deliveredAt: queueOutcome.deliveredAtMs,
		enqueuedAt: queueOutcome.enqueuedAtMs
	};
	if (queueOutcome.reason === "stale_run") return { status: "none" };
	return { status: resolveRequesterSessionActivity(params.requesterSessionKey, requesterAgentId).isActive ? "dropped" : "none" };
}
function formatActiveWakeFailure(fallback, outcome) {
	return formatQueueWakeFailureError(fallback, outcome);
}
function isSourceOwnerChangedWake(outcome) {
	return outcome === SOURCE_OWNER_CHANGED;
}
//#endregion
//#region src/agents/subagents/announce/subagent-announce-origin.ts
/**
* Subagent announcement origin resolver.
*
* Merges requester and session delivery context while avoiding stale thread ids after retargeting.
*/
function normalizeAnnounceRouteTarget(context) {
	const rawTo = normalizeOptionalString(context?.to);
	if (!rawTo) return;
	const channel = normalizeOptionalString(context?.channel);
	const messaging = channel ? getLoadedChannelPluginForRead(channel)?.messaging : void 0;
	const route = stripTargetTopicSuffix(stripOutboundTargetKindPrefix(stripTargetProviderPrefix(rawTo, channel ?? ""), ["group", "channel"]));
	return (messaging?.normalizeTarget?.(route) ?? route) || void 0;
}
function shouldStripThreadFromAnnounceEntry(normalizedRequester, normalizedEntry) {
	if (!normalizedRequester?.to || normalizedRequester.threadId != null || normalizedEntry?.threadId == null) return false;
	const requesterTarget = normalizeAnnounceRouteTarget(normalizedRequester);
	const entryTarget = normalizeAnnounceRouteTarget(normalizedEntry);
	if (requesterTarget && entryTarget) return requesterTarget !== entryTarget;
	return false;
}
/** Resolve the delivery origin for a subagent completion announcement. */
function resolveAnnounceOrigin(entry, requesterOrigin) {
	const normalizedRequester = normalizeDeliveryContext(requesterOrigin);
	const normalizedEntry = deliveryContextFromSession(entry);
	if (normalizedRequester?.channel && isInternalMessageChannel(normalizedRequester.channel)) return mergeDeliveryContext({
		accountId: normalizedRequester.accountId,
		threadId: normalizedRequester.threadId
	}, normalizedEntry);
	const entryForMerge = normalizedEntry && shouldStripThreadFromAnnounceEntry(normalizedRequester, normalizedEntry) ? (() => {
		const { threadId: _ignore, ...rest } = normalizedEntry;
		return rest;
	})() : normalizedEntry;
	return mergeDeliveryContext(normalizedRequester, entryForMerge);
}
function resolveBoundConversationOrigin(params) {
	const conversation = params.bindingConversation;
	const conversationId = conversation.conversationId?.trim() ?? "";
	const parentConversationId = conversation.parentConversationId?.trim() ?? "";
	const requesterConversationId = params.requesterConversation?.conversationId?.trim() ?? "";
	const requesterTo = params.requesterOrigin?.to?.trim();
	const boundTarget = deliveryContextFromConversation(conversation);
	const inferredThreadId = boundTarget?.threadId ?? (parentConversationId && parentConversationId !== conversationId ? conversationId : void 0) ?? (params.requesterOrigin?.threadId != null && params.requesterOrigin.threadId !== "" ? stringifyRouteThreadId(params.requesterOrigin.threadId) : void 0);
	if (requesterTo && conversationId && requesterConversationId && conversationId.toLowerCase() === requesterConversationId.toLowerCase()) return {
		channel: conversation.channel,
		accountId: conversation.accountId,
		to: requesterTo,
		threadId: inferredThreadId
	};
	return {
		channel: conversation.channel,
		accountId: conversation.accountId,
		to: boundTarget?.to,
		threadId: inferredThreadId
	};
}
/** Resolve the bound or hook-provided external origin for a completed subagent. */
async function resolveSubagentCompletionOrigin(params) {
	const requesterOrigin = normalizeDeliveryContext(params.requesterOrigin);
	const channel = normalizeOptionalLowercaseString(requesterOrigin?.channel);
	const to = requesterOrigin?.to?.trim();
	const accountId = normalizeAccountId(requesterOrigin?.accountId);
	const threadId = requesterOrigin?.threadId != null && requesterOrigin.threadId !== "" ? requesterOrigin.threadId : void 0;
	const conversationId = stringifyRouteThreadId(threadId) || resolveConversationIdFromTargets({ targets: [to] }) || "";
	const requesterConversation = channel && conversationId ? {
		channel,
		accountId,
		conversationId
	} : void 0;
	const router = createBoundDeliveryRouter();
	for (const targetSessionKey of [params.requesterSessionKey, params.childSessionKey]) {
		const route = router.resolveDestination({
			eventKind: "task_completion",
			targetSessionKey,
			requester: requesterConversation,
			failClosed: true
		});
		if (route.mode === "bound" && route.binding) return mergeDeliveryContext(resolveBoundConversationOrigin({
			bindingConversation: route.binding.conversation,
			requesterConversation,
			requesterOrigin
		}), requesterOrigin);
	}
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("subagent_delivery_target")) return requesterOrigin;
	try {
		const result = await hookRunner.runSubagentDeliveryTarget({
			childSessionKey: params.childSessionKey,
			requesterSessionKey: params.requesterSessionKey,
			requesterOrigin,
			childRunId: params.childRunId,
			spawnMode: params.spawnMode,
			expectsCompletionMessage: params.expectsCompletionMessage
		}, {
			runId: params.childRunId,
			childSessionKey: params.childSessionKey,
			requesterSessionKey: params.requesterSessionKey
		});
		const hookOrigin = normalizeDeliveryContext(result?.origin);
		return !hookOrigin || hookOrigin.channel && isInternalMessageChannel(hookOrigin.channel) ? requesterOrigin : mergeDeliveryContext(hookOrigin, requesterOrigin);
	} catch {
		return requesterOrigin;
	}
}
function stripNonDeliverableChannel(context) {
	const normalized = normalizeDeliveryContext(context);
	if (!normalized?.channel) return normalized;
	const channel = normalizeMessageChannel(normalized.channel);
	if (!channel || isDeliverableMessageChannel(channel)) return normalized;
	const { channel: _channel, ...rest } = normalized;
	return normalizeDeliveryContext(rest);
}
/** Resolve normalized session and external completion origins once for every delivery path. */
function resolveCompletionDeliveryOrigins(params) {
	const directOrigin = normalizeDeliveryContext(params.directOrigin);
	const requesterSessionOrigin = normalizeDeliveryContext(params.requesterSessionOrigin);
	const completionFallbackOrigin = mergeDeliveryContext(directOrigin, requesterSessionOrigin);
	return {
		directOrigin,
		requesterSessionOrigin,
		effectiveDirectOrigin: params.expectsCompletionMessage ? mergeDeliveryContext(stripNonDeliverableChannel(params.completionDirectOrigin), completionFallbackOrigin) : directOrigin
	};
}
/** Infer whether a normalized delivery target addresses a direct, group, or channel chat. */
function inferDeliveryTargetChatType(target) {
	const normalizedTo = normalizeOptionalLowercaseString(target.to);
	if (!normalizedTo) return;
	if (normalizedTo.startsWith("dm:") || normalizedTo.startsWith("direct:") || normalizedTo.startsWith("user:") || normalizedTo.includes(":dm:") || normalizedTo.includes(":direct:")) return "direct";
	if (normalizedTo.startsWith("channel:") || normalizedTo.startsWith("thread:")) return "channel";
	if (normalizedTo.startsWith("group:")) return "group";
	const channel = normalizeMessageChannel(target.channel);
	return channel ? getLoadedChannelPluginForRead(channel)?.messaging?.inferTargetChatType?.({ to: target.to ?? "" }) : void 0;
}
/** Resolve the durable generated-media handoff route from the canonical completion origin. */
function resolveGeneratedMediaSessionDeliveryRoute(params) {
	const { effectiveDirectOrigin: deliveryContext } = resolveCompletionDeliveryOrigins({
		...params,
		expectsCompletionMessage: true
	});
	const channel = normalizeMessageChannel(deliveryContext?.channel);
	const to = deliveryContext?.to?.trim();
	const inferredRouteChatType = inferDeliveryTargetChatType({
		channel,
		to
	});
	const derivedChatType = deriveSessionChatTypeFromKey(params.sessionKey);
	const chatType = inferredRouteChatType ?? (!derivedChatType || derivedChatType === "unknown" ? "direct" : derivedChatType);
	if (channel && isGatewayMessageChannel(channel) && to) return {
		route: {
			channel,
			to,
			...deliveryContext?.accountId ? { accountId: deliveryContext.accountId } : {},
			...deliveryContext?.threadId != null ? { threadId: stringifyRouteThreadId(deliveryContext.threadId) } : {},
			chatType
		},
		deliveryContext
	};
	return {
		route: {
			channel: INTERNAL_MESSAGE_CHANNEL,
			to: params.sessionKey,
			chatType
		},
		deliveryContext
	};
}
//#endregion
//#region src/agents/subagents/announce/subagent-announce-completion-delivery.ts
/**
* Direct completion fallback and source-delivery evidence for subagent announcements.
*/
const FAILED_COMPLETION_NOTICE = "A delegated task failed before it could report a result. Please retry the task.";
function isGatewayAgentRunPending(response) {
	if (!response || typeof response !== "object") return false;
	const status = response.status;
	return isNonTerminalAgentRunStatus(status);
}
function isDirectMessageDeliveryTarget(target, requesterSessionKey) {
	if (target.threadId) return false;
	const targetChatType = inferDeliveryTargetChatType(target);
	if (targetChatType) return targetChatType === "direct";
	return deriveSessionChatTypeFromKey(requesterSessionKey) === "direct";
}
function resolveTextCompletionDirectFallback(events, contentKind) {
	if (contentKind === "failed_notice") return FAILED_COMPLETION_NOTICE;
	for (let index = (events?.length ?? 0) - 1; index >= 0; index -= 1) {
		const event = events?.[index];
		if (event?.type !== "task_completion" || event.source !== "subagent") continue;
		if (event.status !== "ok") continue;
		const result = typeof event.result === "string" ? sanitizeAgentRunTerminalReplyText(sanitizePendingFinalDeliveryText(event.result)) : "";
		if (result && result !== "(no output)") return result;
	}
}
function hasFailedSubagentNoOutputCompletion(events) {
	return events?.some((event) => event.type === "task_completion" && event.source === "subagent" && event.status !== "ok" && event.result.trim() === "(no output)") === true;
}
async function deliverCompletionDirect(params) {
	const content = resolveTextCompletionDirectFallback(params.internalEvents, params.contentKind);
	if (!content || !params.deliveryTarget.deliver || !params.deliveryTarget.channel || !params.deliveryTarget.to || !isDirectMessageDeliveryTarget(params.deliveryTarget, params.requesterSessionKey)) return;
	const agentId = tryResolveSubagentRequesterAgentId(params.cfg, params.requesterSessionKey, params.requesterAgentId);
	if (!agentId) return;
	const idempotencyKey = `${params.directIdempotencyKey}:text-direct`;
	let committedDelivery;
	try {
		if (params.isSourceSessionEffectsAllowed?.() === false) return sourceOwnerChangedResult();
		if (params.signal?.aborted) return {
			delivered: false,
			path: "none"
		};
		const sendResult = await sendSubagentAnnounceMessage({
			cfg: params.cfg,
			channel: params.deliveryTarget.channel,
			to: params.deliveryTarget.to,
			accountId: params.deliveryTarget.accountId,
			threadId: params.deliveryTarget.threadId,
			requesterSessionKey: params.requesterSessionKey,
			agentId,
			conversationType: "direct",
			content,
			idempotencyKey,
			skipQueue: true,
			abortSignal: params.signal,
			onPlatformSendDispatch: async () => {
				params.signal?.throwIfAborted();
				if (params.isSourceSessionEffectsAllowed?.() === false) throw new SourceOwnerChangedError();
			},
			onDeliveryResult: () => {
				if (committedDelivery) return;
				committedDelivery = {
					delivered: true,
					path: "direct",
					deliveredAt: Date.now()
				};
				params.onDeliveryResult?.(committedDelivery);
			},
			mirror: {
				sessionKey: params.requesterSessionKey,
				agentId,
				idempotencyKey
			}
		});
		if (committedDelivery) return committedDelivery;
		if (sendResult.deliveryStatus === "suppressed") {
			const ambiguous = sendResult.suppressionReason === "adapter_returned_no_identity";
			return {
				delivered: false,
				path: "direct",
				reason: ambiguous ? void 0 : "delivery_suppressed",
				error: ambiguous ? "text completion direct delivery could not be confirmed: adapter returned no identity" : `text completion direct delivery was suppressed: ${sendResult.suppressionReason ?? "unknown reason"}`,
				...ambiguous ? { disposition: "ambiguous" } : {
					disposition: "intentional_non_delivery",
					terminal: true
				}
			};
		}
		return {
			delivered: true,
			path: "direct"
		};
	} catch (err) {
		if (committedDelivery) return committedDelivery;
		if (err instanceof SourceOwnerChangedError) return sourceOwnerChangedResult();
		if (params.signal?.aborted) return {
			delivered: false,
			path: "none"
		};
		return {
			delivered: false,
			path: "direct",
			error: `text completion direct delivery failed: ${summarizeDeliveryError(err)}`
		};
	}
}
function hasMessagingToolDeliveryToSource(result, deliveryTarget, options) {
	const targets = Array.isArray(result.messagingToolSentTargets) ? result.messagingToolSentTargets : [];
	const sourceTargets = targets.filter((target) => {
		if (!target || typeof target !== "object" || Array.isArray(target) || !deliveryTarget.channel || !deliveryTarget.to) return false;
		const record = target;
		const sourceTarget = typeof record.to === "string" && record.to.trim() ? record : {
			...record,
			to: deliveryTarget.to
		};
		return sourceDeliveryTargetsMatch(sourceTarget, deliveryTarget);
	});
	if (options?.requireFinalReply) return (hasCommittedSourceReplyDeliveryEvidence(result) || hasMessagingToolDeliveryEvidence(result) && sourceTargets.length > 0) && resolveExplicitFinalSourceReplyDeliveryEvidence({
		messagingToolSentTargets: sourceTargets,
		messagingToolSourceReplyPayloads: result.messagingToolSourceReplyPayloads
	}) !== false;
	if (hasCommittedSourceReplyDeliveryEvidence(result) || hasUnaccountedMessagingToolAggregateEvidence({
		...result,
		didSendViaMessagingTool: false
	})) return true;
	if (targets.length === 0 || !deliveryTarget.channel || !deliveryTarget.to) return hasMessagingToolDeliveryEvidence(result);
	return hasMessagingToolDeliveryEvidence(result) && sourceTargets.length > 0;
}
//#endregion
//#region src/agents/subagents/announce/subagent-announce-direct-delivery.ts
/**
* Requester-agent handoff and direct delivery for subagent announcements.
*/
async function runAnnounceAgentCall(params) {
	const voice = params.voiceContinuation;
	const assertVoiceCurrent = () => voice?.assertCurrent({ sessionKey: params.agentParams.sessionKey, sessionId: params.getRequesterSessionId?.() });
	assertVoiceCurrent();
	const deadline = new AbortController();
	const signal = AbortSignal.any([deadline.signal, ...params.signal ? [params.signal] : [], ...voice ? [voice.signal] : []]);
	let timer;
	let executionStarted = false;
	const armDeadline = () => {
		clearTimeout(timer);
		if (params.timeoutMs !== void 0) {
			timer = setTimeout(() => deadline.abort(/* @__PURE__ */ new Error("gateway request timeout for agent")), params.timeoutMs);
			timer.unref?.();
		}
	};
	armDeadline();
	try {
		if (voice) {
			// A child can finish while another Worker rebuilds the parent transcript.
			// Wait for the canonical projection before dispatch, never replay the task.
			const loaded = loadRequesterSessionEntry(params.agentParams.sessionKey, params.agentParams.agentId);
			const sessionId = loaded.entry?.sessionId;
			voice.assertCurrent({ sessionKey: params.agentParams.sessionKey, sessionId });
			if (!sessionId || !loaded.agentId || !loaded.storePath) throw new Error("Voice resume requires its canonical transcript target");
			const { waitForSessionTranscriptProjection } = await import("./session-transcript-reconcile-DFsDtc9l.js");
			await waitForSessionTranscriptProjection({ sessionId, agentId: loaded.agentId, storePath: loaded.storePath, sessionKey: params.agentParams.sessionKey }, signal, {
				assertActive: () => { signal.throwIfAborted(); assertVoiceCurrent(); if (!params.isExecutionAllowed()) throw new SourceOwnerChangedError(); }
			});
			assertVoiceCurrent();
		}
		const agentParams = voice?.prepareResumeInput?.(params.agentParams) ?? params.agentParams;
		const response = await dispatchSubagentAnnounceAgent(agentParams, {
			cancelOnDeadline: true,
			expectFinal: params.expectFinal,
			forceSyntheticClient: shouldPreserveUserFacingSessionStateForInputProvenance(params.agentParams.inputProvenance),
			operatorRoleActor: { kind: "system" },
			delegatedToolPolicyHandoff: params.delegatedToolPolicyHandoff,
			signal,
			onAccepted: (accepted) => {
				assertVoiceCurrent();
				voice?.onAccepted(accepted);
				if (!executionStarted) clearTimeout(timer);
			},
			onExecutionStarted: () => {
				assertVoiceCurrent();
				signal.throwIfAborted();
				if (!params.isExecutionAllowed()) throw new SourceOwnerChangedError();
				voice?.onExecutionStarted?.();
				executionStarted = true;
				armDeadline();
			},
			resolveGatewayContext: params.resolveGatewayContext
		});
		voice?.finish(getGatewayAgentResult(response));
		return response;
	} finally {
		clearTimeout(timer);
	}
}
async function sendSubagentAnnounceDirectly(params) {
	if (params.signal?.aborted) return {
		delivered: false,
		path: "none"
	};
	const cfg = getSubagentAnnounceRuntimeConfig();
	const announceTimeoutMs = resolveSubagentAnnounceTimeoutMs(cfg);
	const canonicalRequesterSessionKey = resolveRequesterStoreKey(cfg, params.targetRequesterSessionKey, params.requesterAgentId);
	try {
		const { directOrigin, requesterSessionOrigin, effectiveDirectOrigin } = resolveCompletionDeliveryOrigins(params);
		const sessionOnlyOrigin = effectiveDirectOrigin?.channel ? effectiveDirectOrigin : requesterSessionOrigin;
		const requesterEntry = loadRequesterSessionEntry(params.targetRequesterSessionKey, params.requesterAgentId).entry;
		const deliveryTarget = !params.requesterIsSubagent ? resolveExternalBestEffortDeliveryTarget({
			channel: effectiveDirectOrigin?.channel,
			to: effectiveDirectOrigin?.to,
			accountId: effectiveDirectOrigin?.accountId,
			threadId: effectiveDirectOrigin?.threadId
		}) : { deliver: false };
		const normalizedSessionOnlyOriginChannel = !params.requesterIsSubagent ? normalizeMessageChannel(sessionOnlyOrigin?.channel) : void 0;
		const sessionOnlyOriginChannel = normalizedSessionOnlyOriginChannel && isGatewayMessageChannel(normalizedSessionOnlyOriginChannel) ? normalizedSessionOnlyOriginChannel : void 0;
		const sourceToolId = normalizeOptionalLowercaseString(params.sourceTool) ?? (params.expectsCompletionMessage ? "subagent_announce" : "");
		const isSubagentCompletion = sourceToolId === "subagent_announce";
		const subagentCompletionEvents = params.internalEvents?.filter((event) => event.type === "task_completion" && event.source === "subagent");
		const trustedCompletionEvent = subagentCompletionEvents?.length === 1 && subagentCompletionEvents[0]?.childSessionKey === params.sourceSessionKey ? subagentCompletionEvents[0] : void 0;
		const hasFailedTrustedSubagentCompletion = trustedCompletionEvent !== void 0 && trustedCompletionEvent.status !== "ok";
		const hasRequiredSubagentNoOutputCompletion = params.expectsCompletionMessage && isSubagentCompletion && (trustedCompletionEvent?.result.trim() === "(no output)" || hasFailedSubagentNoOutputCompletion(params.internalEvents));
		const hasSuccessfulTrustedSubagentNoOutputCompletion = hasRequiredSubagentNoOutputCompletion && trustedCompletionEvent?.status === "ok";
		const textCompletionDirectDeliveryKind = hasFailedTrustedSubagentCompletion ? "failed_notice" : "completed_result";
		const agentMediatedCompletion = params.expectsCompletionMessage && isAgentMediatedCompletionSourceTool(sourceToolId);
		const completionRouteRequiresMessageToolDelivery = params.expectsCompletionMessage && completionRequiresMessageToolDelivery({
			cfg,
			requesterSessionKey: params.requesterSessionKey,
			targetRequesterSessionKey: canonicalRequesterSessionKey,
			requesterEntry,
			directOrigin: effectiveDirectOrigin,
			requesterSessionOrigin
		});
		const subagentDirectMessageCompletionRequiresMessageTool = params.expectsCompletionMessage && isSubagentCompletion && deliveryTarget.deliver && isDirectMessageDeliveryTarget(deliveryTarget, canonicalRequesterSessionKey);
		const requiresMessageToolDelivery = completionRouteRequiresMessageToolDelivery || subagentDirectMessageCompletionRequiresMessageTool;
		const requesterActivity = resolveRequesterSessionActivity(params.targetRequesterSessionKey, params.requesterAgentId);
		if (params.expectsCompletionMessage && isSubagentRequesterSessionAbandoned(canonicalRequesterSessionKey, requesterActivity.sessionId)) return {
			delivered: false,
			path: "none",
			reason: "requester_abandoned",
			error: "requester session abandoned after timeout"
		};
		const isCompletionDeliveryAllowed = () => params.isSourceSessionEffectsAllowed?.() !== false && !(params.expectsCompletionMessage && params.isCompletionOwnedByRequesterYield?.());
		if (!isCompletionDeliveryAllowed()) return {
			delivered: false,
			path: "none",
			reason: "completion_handoff_pending",
			terminal: true,
			disposition: "intentional_non_delivery"
		};
		const tryTextCompletionDirectDelivery = (contentKind = "completed_result") => deliverCompletionDirect({
			cfg,
			requesterSessionKey: canonicalRequesterSessionKey,
			requesterAgentId: params.requesterAgentId,
			directIdempotencyKey: params.directIdempotencyKey,
			deliveryTarget,
			internalEvents: params.internalEvents,
			contentKind,
			signal: params.signal,
			onDeliveryResult: params.onDeliveryResult,
			isSourceSessionEffectsAllowed: isCompletionDeliveryAllowed
		});
		const completionSourceReplyDeliveryMode = requiresMessageToolDelivery ? "message_tool_only" : params.requireVisibleReply && deliveryTarget.deliver ? "automatic" : void 0;
		const shouldDeliverAgentFinal = deliveryTarget.deliver && !requiresMessageToolDelivery;
		const requesterQueueSettings = resolveQueueSettings({
			cfg,
			channel: sessionDeliveryChannel(requesterEntry) ?? requesterSessionOrigin?.channel ?? directOrigin?.channel,
			sessionEntry: requesterEntry
		});
		if (params.expectsCompletionMessage && requesterActivity.sessionId && requesterActivity.isActive) {
			const wakeOptions = {
				deliveryTimeoutMs: announceTimeoutMs,
				steeringMode: "all",
				...completionSourceReplyDeliveryMode ? { sourceReplyDeliveryMode: completionSourceReplyDeliveryMode } : {},
				...requesterQueueSettings.debounceMs !== void 0 ? { debounceMs: requesterQueueSettings.debounceMs } : {},
				waitForTranscriptCommit: true,
				...params.createUserTurnTranscriptRecorder ? { userTurnTranscriptRecorder: params.createUserTurnTranscriptRecorder(requesterActivity.sessionId) } : {}
			};
			const wakeOutcome = await resolveActiveWakeWithRetries(requesterActivity.sessionId, params.triggerMessage, wakeOptions, params.signal, isCompletionDeliveryAllowed);
			if (isSourceOwnerChangedWake(wakeOutcome)) return sourceOwnerChangedResult();
			if (wakeOutcome.queued) return {
				delivered: true,
				deliveredAt: wakeOutcome.deliveredAtMs,
				enqueuedAt: wakeOutcome.enqueuedAtMs,
				path: "steered"
			};
			defaultRuntime.log(`[warn] Active requester session could not be woken for subagent completion; falling back to requester-agent handoff: ${formatActiveWakeFailure("active requester session could not be woken", wakeOutcome)}`);
		}
		if (params.expectsCompletionMessage && isCronRunSessionKey(canonicalRequesterSessionKey) && !resolveRequesterSessionActivity(params.targetRequesterSessionKey, params.requesterAgentId).isActive && !agentMediatedCompletion) return {
			delivered: false,
			path: "none",
			reason: "completion_handoff_pending",
			terminal: true,
			disposition: "intentional_non_delivery"
		};
		if (params.signal?.aborted) return {
			delivered: false,
			path: "none"
		};
		const directAgentThreadId = shouldDeliverAgentFinal ? stringifyRouteThreadId(deliveryTarget.threadId) : sessionOnlyOriginChannel ? stringifyRouteThreadId(sessionOnlyOrigin?.threadId) : void 0;
		const directAgentParams = {
			sessionKey: canonicalRequesterSessionKey,
			message: params.triggerMessage,
			deliver: shouldDeliverAgentFinal,
			bestEffortDeliver: params.bestEffortDeliver,
			internalEvents: params.internalEvents,
			channel: shouldDeliverAgentFinal ? deliveryTarget.channel : sessionOnlyOriginChannel,
			accountId: shouldDeliverAgentFinal ? deliveryTarget.accountId : sessionOnlyOriginChannel ? sessionOnlyOrigin?.accountId : void 0,
			to: shouldDeliverAgentFinal ? deliveryTarget.to : sessionOnlyOriginChannel ? sessionOnlyOrigin?.to : void 0,
			threadId: directAgentThreadId,
			inputProvenance: {
				kind: "inter_session",
				sourceSessionKey: params.sourceSessionKey,
				sourceChannel: params.sourceChannel ?? "webchat",
				sourceTool: params.sourceTool ?? "subagent_announce"
			},
			...completionSourceReplyDeliveryMode ? { sourceReplyDeliveryMode: completionSourceReplyDeliveryMode } : {},
			idempotencyKey: params.directIdempotencyKey
		};
		let directAnnounceResponse;
		try {
			directAnnounceResponse = await runAnnounceDeliveryWithRetry({
				operation: params.expectsCompletionMessage ? "completion direct announce agent call" : "direct announce agent call",
				signal: params.signal,
				isAttemptAllowed: isCompletionDeliveryAllowed,
				run: async () => {
					if (!isCompletionDeliveryAllowed()) throw new SourceOwnerChangedError();
					return await runAnnounceAgentCall({
						agentParams: directAgentParams,
						voiceContinuation: params.voiceContinuation,
						getRequesterSessionId: () => loadRequesterSessionEntry(params.targetRequesterSessionKey, params.requesterAgentId).entry?.sessionId,
						delegatedToolPolicyHandoff: isSubagentCompletion && trustedCompletionEvent && params.sourceSessionKey && requesterActivity.sessionId && params.isSourceSessionEffectsAllowed?.() !== false ? {
							sourceSessionKey: params.sourceSessionKey,
							...trustedCompletionEvent.childSessionId ? { sourceSessionId: trustedCompletionEvent.childSessionId } : {},
							targetSessionKey: canonicalRequesterSessionKey,
							targetSessionId: requesterActivity.sessionId,
							idempotencyKey: params.directIdempotencyKey
						} : void 0,
						expectFinal: true,
						signal: params.signal,
						timeoutMs: announceTimeoutMs,
						isExecutionAllowed: isCompletionDeliveryAllowed,
						resolveGatewayContext: params.resolveGatewayContext
					});
				}
			});
			if (!isCompletionDeliveryAllowed()) return sourceOwnerChangedResult();
		} catch (err) {
			if (err instanceof SourceOwnerChangedError) return sourceOwnerChangedResult();
			if (hasAnnounceSendEvidence(err)) throw err;
			if (params.signal?.aborted) return {
				delivered: false,
				path: "none"
			};
			const directCompletionFallbackKind = hasFailedTrustedSubagentCompletion ? "failed_notice" : isIncompleteAnnounceAgentResultError(err) ? "completed_result" : void 0;
			if (params.expectsCompletionMessage && (shouldDeliverAgentFinal || subagentDirectMessageCompletionRequiresMessageTool) && isSubagentCompletion && directCompletionFallbackKind) {
				const textDelivery = await tryTextCompletionDirectDelivery(directCompletionFallbackKind);
				if (textDelivery) return textDelivery;
			}
			throw err;
		}
		if (isGatewayAgentRunPending(directAnnounceResponse)) return {
			delivered: true,
			path: "direct"
		};
		const directAnnounceResult = reconcilePresentedResult(directAgentParams.idempotencyKey, getGatewayAgentResult(directAnnounceResponse));
		const hasFinalMessagingToolDelivery = Boolean(directAnnounceResult && hasMessagingToolDeliveryToSource(directAnnounceResult, deliveryTarget, { requireFinalReply: true }));
		const hasMessagingToolDelivery = Boolean(directAnnounceResult && hasMessagingToolDeliveryToSource(directAnnounceResult, deliveryTarget));
		const requiresAutomaticFinalReceipt = shouldDeliverAgentFinal && (params.expectsCompletionMessage || params.requireVisibleReply);
		const automaticEvidence = getAutomaticDeliveryEvidence(directAnnounceResult ?? {});
		const directDeliveryFailure = (shouldDeliverAgentFinal || requiresMessageToolDelivery) && directAnnounceResult ? getAgentCommandDeliveryFailure(directAnnounceResult) : void 0;
		if (directDeliveryFailure && !(requiresAutomaticFinalReceipt ? hasFinalMessagingToolDelivery : hasMessagingToolDelivery)) return {
			delivered: false,
			path: "direct",
			error: directDeliveryFailure,
			...automaticEvidence.mayHaveSent ? { disposition: "ambiguous" } : {}
		};
		const hasVisibleNonSilentGatewayPayload = Boolean(directAnnounceResult && hasVisibleAgentPayload(directAnnounceResult, {
			includeErrorPayloads: false,
			includeReasoningPayloads: false,
			requireTerminalContent: true,
			includeSilentReplyPayloads: false
		}));
		const terminalDelivery = normalizeAgentRunTerminalDeliverySnapshot(directAnnounceResult?.deliveryStatus);
		const automaticFinalDelivered = terminalDelivery?.status === "sent" && terminalDelivery.resultCount > 0;
		if (requiresAutomaticFinalReceipt && !hasFinalMessagingToolDelivery && terminalDelivery?.status === "suppressed" && (automaticEvidence.mayHaveSent || automaticEvidence.suppressionReason !== "no_visible_payload")) return {
			delivered: false,
			path: "direct",
			reason: automaticEvidence.mayHaveSent ? void 0 : "delivery_suppressed",
			error: automaticEvidence.mayHaveSent ? "automatic completion delivery could not be confirmed" : automaticEvidence.suppressionReason ?? "automatic completion delivery suppressed",
			disposition: automaticEvidence.mayHaveSent ? "ambiguous" : "intentional_non_delivery",
			terminal: automaticEvidence.mayHaveSent ? void 0 : true
		};
		const hasIntentionalSilentCompletionReply = Boolean(directAnnounceResult && hasIntentionalSilentAgentPayload(directAnnounceResult));
		const hasCompletionSideEffect = Boolean(directAnnounceResult && hasCommittedOutboundDeliveryEvidence(directAnnounceResult));
		const hasVisibleRequiredCompletionReply = hasMessagingToolDelivery || !requiresMessageToolDelivery && hasVisibleNonSilentGatewayPayload;
		if (params.expectsCompletionMessage && shouldDeliverAgentFinal && isSubagentCompletion && !hasVisibleNonSilentGatewayPayload && !hasMessagingToolDelivery) {
			const textDelivery = await tryTextCompletionDirectDelivery(textCompletionDirectDeliveryKind);
			if (textDelivery) return textDelivery;
			if (hasSuccessfulTrustedSubagentNoOutputCompletion && !hasCompletionSideEffect) return {
				delivered: false,
				path: "direct",
				reason: "visible_reply_missing",
				error: "completion agent did not produce a visible reply"
			};
		}
		if (hasSuccessfulTrustedSubagentNoOutputCompletion && !hasVisibleRequiredCompletionReply && hasCompletionSideEffect) return {
			delivered: false,
			path: "direct",
			reason: "visible_reply_missing",
			error: "completion agent did not produce a visible reply",
			disposition: "permanent_failure"
		};
		if (params.expectsCompletionMessage && requiresMessageToolDelivery && !hasMessagingToolDelivery && (!hasIntentionalSilentCompletionReply || subagentDirectMessageCompletionRequiresMessageTool || hasRequiredSubagentNoOutputCompletion)) {
			if (hasSuccessfulTrustedSubagentNoOutputCompletion) return {
				delivered: false,
				path: "direct",
				reason: "visible_reply_missing",
				error: "completion agent did not produce a visible reply"
			};
			if (subagentDirectMessageCompletionRequiresMessageTool) {
				const textDelivery = await tryTextCompletionDirectDelivery(textCompletionDirectDeliveryKind);
				if (textDelivery) return textDelivery;
			}
			return {
				delivered: false,
				path: "direct",
				reason: "message_tool_delivery_missing",
				error: "completion agent did not use the message tool for message-tool-only delivery"
			};
		}
		const requesterVisibleFinalDelivered = hasFinalMessagingToolDelivery || shouldDeliverAgentFinal && automaticFinalDelivered;
		const hasVisibleCompletionReply = requesterVisibleFinalDelivered || !shouldDeliverAgentFinal && !params.requireVisibleReply && hasMessagingToolDelivery || !requiresMessageToolDelivery && hasVisibleNonSilentGatewayPayload && directAnnounceResult?.deliveryStatus?.status !== "suppressed" && (params.requesterIsSubagent || [effectiveDirectOrigin, requesterSessionOrigin].every((origin) => origin?.channel ? normalizeMessageChannel(origin.channel) === "webchat" : !origin?.to));
		const acceptsIntentionalSilentCompletion = hasIntentionalSilentCompletionReply && !isSubagentCompletion;
		if (!hasVisibleCompletionReply && (params.requireVisibleReply || params.expectsCompletionMessage && (shouldDeliverAgentFinal || !requiresMessageToolDelivery && !hasCompletionSideEffect && !acceptsIntentionalSilentCompletion))) return {
			delivered: false,
			path: "direct",
			reason: "visible_reply_missing",
			error: "completion agent did not produce a visible reply"
		};
		return {
			delivered: true,
			path: "direct",
			...params.expectsCompletionMessage && !params.requesterIsSubagent && requesterVisibleFinalDelivered ? { requesterVisibleFinalDelivered: true } : {}
		};
	} catch (err) {
		const disposition = hasAnnounceSendEvidence(err) ? "ambiguous" : isPermanentAnnounceDeliveryError(err) ? "permanent_failure" : "retryable";
		return {
			delivered: false,
			path: "direct",
			error: summarizeDeliveryError(err),
			disposition
		};
	}
}
//#endregion
//#region src/agents/subagents/announce/subagent-announce-dispatch.ts
/** Converts a steer outcome into the shared delivery result shape. */
function mapSteerOutcomeToDeliveryResult(outcome) {
	if (outcome.status === "steered") return {
		delivered: true,
		path: "steered",
		deliveredAt: outcome.deliveredAt,
		enqueuedAt: outcome.enqueuedAt
	};
	if (outcome.status === "source_owner_changed") return {
		delivered: false,
		path: "none",
		reason: "source_owner_changed",
		error: "subagent source lifecycle changed before completion delivery",
		terminal: true,
		disposition: "intentional_non_delivery"
	};
	return {
		delivered: false,
		path: "none",
		...outcome.status === "dropped" ? { reason: "steer_dropped" } : {}
	};
}
/** Runs the ordered steer/direct announcement delivery strategy. */
async function runSubagentAnnounceDispatch(params) {
	const phases = [];
	const appendPhase = (phase, result) => {
		phases.push({
			phase,
			delivered: result.delivered,
			path: result.path,
			deliveredAt: result.deliveredAt,
			enqueuedAt: result.enqueuedAt,
			...result.reason ? { reason: result.reason } : {},
			error: result.error
		});
	};
	const withPhases = (result) => ({
		...result,
		phases
	});
	if (params.signal?.aborted) return withPhases({
		delivered: false,
		path: "none"
	});
	if (params.requireDirectDelivery) {
		const primaryDirect = await params.direct();
		appendPhase("direct-primary", primaryDirect);
		return withPhases(primaryDirect);
	}
	if (!params.expectsCompletionMessage) {
		const primarySteerOutcome = await params.steer();
		const primarySteer = mapSteerOutcomeToDeliveryResult(primarySteerOutcome);
		appendPhase("steer-primary", primarySteer);
		if (primarySteer.delivered) return withPhases(primarySteer);
		if (primarySteer.terminal) return withPhases(primarySteer);
		if (primarySteerOutcome.status === "dropped") return withPhases(primarySteer);
		const primaryDirect = await params.direct();
		appendPhase("direct-primary", primaryDirect);
		return withPhases(primaryDirect);
	}
	const primaryDirect = await params.direct();
	appendPhase("direct-primary", primaryDirect);
	if (primaryDirect.delivered || primaryDirect.disposition === "session_queued" || primaryDirect.disposition === "intentional_non_delivery" || primaryDirect.disposition === "ambiguous" || primaryDirect.disposition === "permanent_failure") return withPhases(primaryDirect);
	if (params.signal?.aborted) return withPhases(primaryDirect);
	const fallbackSteer = mapSteerOutcomeToDeliveryResult(await params.steer());
	appendPhase("steer-fallback", fallbackSteer);
	if (fallbackSteer.delivered) return withPhases(fallbackSteer);
	if (fallbackSteer.terminal) return withPhases(fallbackSteer);
	return withPhases(primaryDirect);
}
//#endregion
//#region src/agents/subagents/announce/subagent-announce-delivery.ts
/**
* Subagent completion announcement delivery.
*
* Routes completion payloads through gateway/channel/session paths and records delivery evidence.
*/
function isInternalAnnounceRequesterSession(sessionKey) {
	return getSubagentDepthFromSessionStore(sessionKey) >= 1 || isCronSessionKey(sessionKey);
}
function collectExpectedMediaFromInternalEvents(events) {
	const { mediaUrls: expectedMediaUrls, attachments } = collectAgentInternalEventMedia(events);
	const expectedMediaAttachments = Object.fromEntries(expectedMediaUrls.map((mediaUrl, index) => [mediaUrl, attachments[index] ?? {}]));
	return {
		expectedMediaUrls,
		...expectedMediaUrls.length > 0 ? { expectedMediaAttachments } : {}
	};
}
function createCompletionUserTurnTranscriptRecorderFactory(params) {
	const provenance = {
		kind: "inter_session",
		...params.sourceSessionKey ? { sourceSessionKey: params.sourceSessionKey } : {},
		sourceChannel: params.sourceChannel ?? "webchat",
		sourceTool: params.sourceTool ?? "subagent_announce"
	};
	const recorders = /* @__PURE__ */ new Map();
	return (sessionId) => {
		const existing = recorders.get(sessionId);
		if (existing) return existing;
		const recorder = createUserTurnTranscriptRecorder({
			input: {
				text: params.triggerMessage,
				idempotencyKey: `${params.directIdempotencyKey}:active-wake`,
				provenance
			},
			target: () => {
				const loaded = loadRequesterSessionEntry(params.targetRequesterSessionKey, params.requesterAgentId);
				if (!loaded.entry || loaded.entry.sessionId?.trim() !== sessionId || !loaded.agentId) return;
				return {
					sessionId,
					expectedSessionId: sessionId,
					sessionKey: loaded.canonicalKey,
					sessionEntry: loaded.entry,
					...loaded.storePath ? { storePath: loaded.storePath } : {},
					agentId: loaded.agentId,
					config: loaded.cfg
				};
			},
			errorContext: "active requester completion transcript"
		});
		recorders.set(sessionId, recorder);
		return recorder;
	};
}
async function deliverSubagentAnnouncement(params) {
	const sourceOwnerChanged = () => params.isSourceSessionEffectsAllowed?.() === false;
	if (sourceOwnerChanged()) return sourceOwnerChangedResult();
	const durableGeneratedMediaHandoff = params.expectsCompletionMessage && isAgentMediatedCompletionSourceTool(params.sourceTool) && hasGeneratedMediaCompletionEvent(params.internalEvents);
	let durableQueueId;
	let durableQueueClaimed = false;
	if (durableGeneratedMediaHandoff) try {
		const cfg = getSubagentAnnounceRuntimeConfig();
		const canonicalSessionKey = resolveRequesterStoreKey(cfg, params.targetRequesterSessionKey, params.requesterAgentId);
		const queuedRoute = resolveGeneratedMediaSessionDeliveryRoute({
			sessionKey: canonicalSessionKey,
			completionDirectOrigin: params.completionDirectOrigin,
			directOrigin: params.directOrigin,
			requesterSessionOrigin: params.requesterSessionOrigin
		});
		const { requesterSessionOrigin, effectiveDirectOrigin } = resolveCompletionDeliveryOrigins({
			expectsCompletionMessage: params.expectsCompletionMessage,
			completionDirectOrigin: params.completionDirectOrigin,
			directOrigin: params.directOrigin,
			requesterSessionOrigin: params.requesterSessionOrigin
		});
		const requesterEntry = loadRequesterSessionEntry(params.targetRequesterSessionKey, params.requesterAgentId).entry;
		const sourceReplyDeliveryMode = queuedRoute.route.channel === "webchat" ? "automatic" : completionRequiresMessageToolDelivery({
			cfg,
			requesterSessionKey: params.requesterSessionKey,
			targetRequesterSessionKey: canonicalSessionKey,
			requesterEntry,
			directOrigin: effectiveDirectOrigin,
			requesterSessionOrigin
		}) ? "message_tool_only" : "automatic";
		const expectedMedia = collectExpectedMediaFromInternalEvents(params.internalEvents);
		const queuePayload = {
			kind: "agentTurn",
			sessionKey: canonicalSessionKey,
			message: formatAgentInternalEventsForPrompt(params.internalEvents) || params.triggerMessage,
			messageId: `${params.directIdempotencyKey}:agent-loop`,
			route: queuedRoute.route,
			...queuedRoute.deliveryContext ? { deliveryContext: queuedRoute.deliveryContext } : {},
			inputProvenance: {
				kind: "inter_session",
				...params.sourceSessionKey ? { sourceSessionKey: params.sourceSessionKey } : {},
				sourceChannel: params.sourceChannel ?? "webchat",
				sourceTool: params.sourceTool ?? "subagent_announce"
			},
			sourceReplyDeliveryMode,
			...expectedMedia,
			idempotencyKey: `${params.directIdempotencyKey}:agent-loop`
		};
		const queued = params.sourceRunId ? admitCorrelatedSubagentSessionDelivery({
			runId: params.sourceRunId,
			payload: queuePayload
		}) : await enqueueClaimedSessionDelivery(queuePayload, resolveSubagentAnnounceTimeoutMs(cfg));
		if (queued.status === "failed") return {
			delivered: false,
			path: "queued",
			reason: "completion_handoff_unavailable",
			error: "generated media session handoff was already dead-lettered",
			disposition: "permanent_failure"
		};
		if (queued.status === "completed") return {
			delivered: true,
			path: "queued",
			disposition: "delivered"
		};
		durableQueueId = queued.id;
		durableQueueClaimed = queued.claimed;
	} catch (error) {
		defaultRuntime.log(`[warn] Generated media session handoff could not be persisted; refusing ambiguous fallback: ${summarizeDeliveryError(error)}`);
		return {
			delivered: false,
			path: "queued",
			reason: "completion_handoff_unavailable",
			error: "generated media session handoff could not be persisted",
			disposition: "retryable"
		};
	}
	if (durableQueueId) {
		if (durableQueueClaimed) await releaseSessionDeliveryClaim(durableQueueId).catch((error) => {
			defaultRuntime.log(`[warn] Generated media session handoff lease release failed; durable recovery remains pending: ${summarizeDeliveryError(error)}`);
		});
		await scheduleSessionDelivery(durableQueueId).catch((error) => {
			defaultRuntime.log(`[warn] Generated media session handoff retry scheduling failed; durable recovery remains pending: ${summarizeDeliveryError(error)}`);
		});
		return {
			delivered: false,
			path: "queued",
			disposition: "session_queued"
		};
	}
	const createCompletionUserTurnTranscriptRecorder = params.expectsCompletionMessage ? createCompletionUserTurnTranscriptRecorderFactory(params) : void 0;
	return await runSubagentAnnounceDispatch({
		expectsCompletionMessage: params.expectsCompletionMessage,
		requireDirectDelivery: params.requireDirectDelivery,
		signal: params.signal,
		steer: async () => {
			if (sourceOwnerChanged()) return { status: "source_owner_changed" };
			return await maybeSteerSubagentAnnounce({
				deliveryTimeoutMs: resolveSubagentAnnounceTimeoutMs(getSubagentAnnounceRuntimeConfig()),
				requesterSessionKey: params.requesterSessionKey,
				requesterAgentId: params.requesterAgentId,
				steerMessage: params.steerMessage,
				createUserTurnTranscriptRecorder: createCompletionUserTurnTranscriptRecorder,
				signal: params.signal,
				isSourceSessionEffectsAllowed: params.isSourceSessionEffectsAllowed
			});
		},
		direct: async () => {
			if (sourceOwnerChanged()) return sourceOwnerChangedResult();
			return await sendSubagentAnnounceDirectly({
				voiceContinuation: params.voiceContinuation,
				requesterSessionKey: params.requesterSessionKey,
				requesterAgentId: params.requesterAgentId,
				targetRequesterSessionKey: params.targetRequesterSessionKey,
				triggerMessage: params.triggerMessage,
				internalEvents: params.internalEvents,
				directIdempotencyKey: params.directIdempotencyKey,
				completionDirectOrigin: params.completionDirectOrigin,
				directOrigin: params.directOrigin,
				requesterSessionOrigin: params.requesterSessionOrigin,
				sourceSessionKey: params.sourceSessionKey,
				sourceChannel: params.sourceChannel,
				sourceTool: params.sourceTool,
				isSourceSessionEffectsAllowed: params.isSourceSessionEffectsAllowed,
				isCompletionOwnedByRequesterYield: params.isCompletionOwnedByRequesterYield,
				requesterIsSubagent: params.requesterIsSubagent,
				expectsCompletionMessage: params.expectsCompletionMessage,
				createUserTurnTranscriptRecorder: createCompletionUserTurnTranscriptRecorder,
				requireVisibleReply: params.requireVisibleReply,
				onDeliveryResult: params.onDeliveryResult,
				signal: params.signal,
				bestEffortDeliver: params.bestEffortDeliver,
				resolveGatewayContext: params.resolveGatewayContext
			});
		}
	});
}
const testing = {
	setDepsForTest(overrides) {
		setSubagentAnnounceDeliveryDepsForTest(overrides);
	},
	hasAnnounceSendEvidence,
	isWriterClaimReboundAnnounceError
};
if (process.env.VITEST || false) globalThis[Symbol.for("openclaw.subagentAnnounceDeliveryTestApi")] = testing;
//#endregion
export { loadRequesterSessionEntry as a, runAnnounceDeliveryWithRetry as c, formatAgentInternalEventsForPrompt as d, formatGeneratedMediaDeliveryRetryForPrompt as f, sanitizeGeneratedMediaDisplayText as h, resolveSubagentCompletionOrigin as i, collectAgentInternalEventMedia as l, mediaUrlsFromGeneratedAttachments as m, isInternalAnnounceRequesterSession as n, loadSessionEntryByKey as o, formatGeneratedAttachmentLines as p, resolveAnnounceOrigin as r, resolveSubagentAnnounceTimeoutMs as s, deliverSubagentAnnouncement as t, formatAgentInternalEventsForPlainPrompt as u };
