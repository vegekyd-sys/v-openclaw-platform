import "./src-vebZIeLe.js";
import { t as expectDefined } from "./expect-CyE8FADM.js";
import { f as normalizeStringifiedEntries, l as normalizeOptionalString, o as normalizeLowercaseStringOrEmpty } from "./string-coerce-CIXf7egm.js";
import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { n as SILENT_REPLY_TOKEN, o as isSilentReplyText } from "./tokens-DbeAFqg7.js";
import { t as assertAgentRunLifecycleGenerationCurrent, y as createAgentRunStaleLifecycleError } from "./agent-events-Con5xUCM.js";
import { a as classifyOAuthRefreshFailureError, i as classifyOAuthRefreshFailure, r as buildOAuthRefreshFailureLoginCommand, s as formatOAuthRefreshFailureLoginCommandMarkdown } from "./oauth-refresh-failure-FDM8bCmh.js";
import { a as getReplyPayloadMetadata, f as isReplyPayloadTerminalContent, g as markReplyPayloadForSourceSuppressionDelivery, i as copyReplyPayloadMetadata, y as setReplyPayloadMetadata } from "./reply-payload-DahKk-7n.js";
import { n as extractErrorHttpStatus } from "./assistant-error-format-oP4GVe5A.js";
import { t as classifyFailoverReason } from "./classify-Dm9sTbZz.js";
import { d as loadSessionEntry, p as patchSessionEntryCore } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { P as sessionMatchesExpectedTranscriptTurn, mt as updateSessionEntry } from "./session-accessor-K0XuW6ln.js";
import { a as hasRestartRecoveryTerminalRun, i as hasRestartRecoverySourceClaim, t as buildRestartRecoveryClaimCleanupPatch } from "./restart-recovery-state-xVcgAuHK.js";
import { a as isProviderAuthError } from "./model-auth-runtime-shared-C48YoQY0.js";
import { a as isFailoverError } from "./error-Crg6nsju.js";
import { r as sanitizeUserFacingText, t as renderUserFacingText } from "./user-facing-text-BQgPNsCa.js";
import { E as classifyProviderRequestFacets, S as renderRateLimitReplyCopy, T as resolveProviderRequestFailureCopy, b as renderMissingApiKeyReplyCopy, g as renderCliTimeoutReplyCopy, h as renderBillingReplyCopy, m as renderAuthProfileFailoverCopy, n as GENERIC_EXTERNAL_RUN_FAILURE_TEXT, r as HEARTBEAT_EXTERNAL_RUN_FAILURE_TEXT, v as renderFailoverCodeUserCopy, x as renderRateLimitOrOverloadedCopy } from "./user-copy-BLzGKYoR.js";
import { f as renderAssistantRequestFailureCopy } from "./embedded-agent-helpers-CzpaLpCq.js";
import { t as createKeyedFifoLeaseRegistry } from "./keyed-fifo-lease-Bc9PJVw6.js";
import { ht as classifyCompactionReason } from "./builtin-openclaw-zQV8Wwjr.js";
import { a as findCliMaxTurnsError, h as isAgentHarnessPreflightError, i as describeFailoverError, o as findCliTimeoutError } from "./failover-error-B46Ke6VT.js";
import { t as buildProviderAuthRecoveryHint } from "./provider-auth-recovery-hint-BanRJq49.js";
import { l as resolveSilentReplyPolicy } from "./session-entry-handle-Dwtrp-sb.js";
import { t as buildCodexLoginRecovery } from "./codex-login-recovery-C1HtauQM.js";
import { randomUUID } from "node:crypto";
//#region src/auto-reply/reply/agent-runner-failure-reply.ts
function resolveReplyFailoverFacts(error, message) {
	const described = describeFailoverError(error);
	const status = extractErrorHttpStatus(described.rawError ?? message)?.code ?? described.status;
	const reason = described.reason ?? classifyFailoverReason(described.rawError ?? message, { provider: described.provider });
	const classification = reason ? {
		kind: "reason",
		reason
	} : null;
	return {
		reason: classification?.kind === "reason" ? classification.reason : void 0,
		code: described.code,
		provider: described.provider,
		model: described.model,
		status,
		authMode: described.authMode,
		providerRequestError: resolveProviderRequestFailureCopy({
			classification,
			facet: classifyProviderRequestFacets({
				status,
				message: described.rawError ?? message
			}),
			status,
			technicalMessage: message
		})
	};
}
function readFallbackAttempts(error) {
	return isFailoverError(error) && Array.isArray(error.attempts) ? error.attempts : [];
}
function collapseRepeatedFailureDetail(message) {
	const parts = message.split(/\s+\|\s+/u).map((part) => part.trim()).filter(Boolean);
	if (parts.length >= 2 && parts.every((part) => part === parts[0])) return expectDefined(parts[0], "parts entry at 0");
	return message.trim();
}
const EXTERNAL_RUN_FAILURE_DETAIL_MAX_CHARS = 900;
const AGENT_FAILED_BEFORE_REPLY_TEXT = "Agent failed before reply:";
const PREFLIGHT_COMPACTION_FAILURE_PREFIX = "Preflight compaction required but failed:";
function isNonDirectConversationContext(ctx) {
	const chatType = normalizeLowercaseStringOrEmpty(ctx.ChatType);
	return chatType === "group" || chatType === "channel";
}
function isVerboseFailureDetailEnabled(level) {
	return level === "on" || level === "full";
}
function resolveExternalRunFailureTextForConversation(params) {
	if (params.visibleReplyDelivered || !isNonDirectConversationContext(params.sessionCtx)) return params.text;
	if (!params.isGenericRunnerFailure && !params.text.includes(AGENT_FAILED_BEFORE_REPLY_TEXT)) return params.text;
	return resolveSilentReplyPolicy({
		cfg: params.cfg,
		sessionKey: params.sessionCtx.SessionKey,
		surface: params.sessionCtx.Surface ?? params.sessionCtx.Provider,
		conversationType: "group"
	}) === "disallow" ? params.text : SILENT_REPLY_TOKEN;
}
const CODEX_APP_SERVER_CLIENT_CLOSED_BEFORE_REPLY_RE = /\bcodex app-server client closed before turn completed\b/iu;
const CODEX_APP_SERVER_TURN_COMPLETION_IDLE_TIMEOUT_RE = /\bcodex app-server turn idle timed out waiting for turn\/completed\b/iu;
const CODEX_SESSION_GENERATION_NOT_CURRENT_RE = /\bcodex session generation is no longer current\b/iu;
function buildCodexAppServerFailureText(message) {
	const normalizedMessage = collapseRepeatedFailureDetail(message);
	if (CODEX_SESSION_GENERATION_NOT_CURRENT_RE.test(normalizedMessage)) return "⚠️ This Codex session changed before your message could run. Please send it again.";
	if (CODEX_APP_SERVER_CLIENT_CLOSED_BEFORE_REPLY_RE.test(normalizedMessage)) return "⚠️ Codex app-server connection closed before this turn finished. OpenClaw retried once when the stdio turn was still replay-safe; please try again if this keeps happening.";
	if (CODEX_APP_SERVER_TURN_COMPLETION_IDLE_TIMEOUT_RE.test(normalizedMessage)) return "⚠️ Codex app-server stopped before confirming turn completion. OpenClaw did not replay the turn automatically because it may still be active; try again, or use /new if the session stays stuck.";
	return null;
}
/** Formats the reply shown when preflight compaction fails before a run. */
function buildPreflightCompactionFailureText(message, options) {
	const normalizedMessage = collapseRepeatedFailureDetail(message);
	if (!normalizedMessage.startsWith(PREFLIGHT_COMPACTION_FAILURE_PREFIX)) return null;
	const reason = renderUserFacingText(normalizedMessage.slice(41), { errorContext: true }).trim().replace(/\s+/gu, " ");
	const isTimeout = classifyCompactionReason(reason) === "timeout";
	const reasonSuffix = options?.includeDetails && reason && !isTimeout ? ` Reason: ${reason}.` : "";
	return `${isTimeout ? "⚠️ Context is too large and auto-compaction timed out before it could finish." : "⚠️ Context is too large and auto-compaction could not recover this turn."}${reasonSuffix} Try again, use /compact, or use /new to start a fresh session.`;
}
function buildAuthProfileFailoverFailureText(error) {
	if (!isFailoverError(error) || !error.provider || !error.authProfileFailure) return null;
	return renderAuthProfileFailoverCopy({
		reason: error.reason,
		provider: error.provider,
		allInCooldown: error.authProfileFailure.allInCooldown,
		causeText: error.cause ? formatErrorMessage(error.cause).trim() : void 0,
		recoveryHint: buildProviderAuthRecoveryHint({ provider: error.provider })
	});
}
function formatForwardedExternalRunFailureText(message) {
	const sanitized = message.trim().replace(/^⚠️\s*/u, "").replace(/\s+/gu, " ");
	if (!sanitized) return GENERIC_EXTERNAL_RUN_FAILURE_TEXT;
	const detail = sanitized.length > EXTERNAL_RUN_FAILURE_DETAIL_MAX_CHARS ? `${truncateUtf16Safe(sanitized, 899).trimEnd()}…` : sanitized;
	return `⚠️ Agent failed before reply: ${detail}${/[.!?]$/u.test(detail) ? "" : "."} Please try again, or use /new to start a fresh session.`;
}
function buildExternalRunFailureReply(input, options) {
	const message = typeof input === "string" ? input : input.message;
	const error = typeof input === "string" ? void 0 : input.error;
	const normalizedMessage = collapseRepeatedFailureDetail(message);
	if (isAgentHarnessPreflightError(error)) return {
		text: options?.isHeartbeat ? HEARTBEAT_EXTERNAL_RUN_FAILURE_TEXT : options?.includeDetails ? formatForwardedExternalRunFailureText(sanitizeUserFacingText(normalizedMessage, { errorContext: true })) : GENERIC_EXTERNAL_RUN_FAILURE_TEXT,
		isGenericRunnerFailure: !options?.isHeartbeat
	};
	const failoverFacts = options?.failoverFacts ?? resolveReplyFailoverFacts(error ?? normalizedMessage, normalizedMessage);
	const failoverCodeCopy = renderFailoverCodeUserCopy(failoverFacts.code);
	if (failoverCodeCopy) return {
		text: failoverCodeCopy,
		isGenericRunnerFailure: false
	};
	const oauthRefreshFailure = classifyOAuthRefreshFailureError(error) ?? classifyOAuthRefreshFailure(normalizedMessage);
	const codexLoginRecovery = buildCodexLoginRecovery({
		provider: oauthRefreshFailure?.provider ?? failoverFacts.provider,
		oauthReason: oauthRefreshFailure?.reason,
		failoverReason: failoverFacts.reason,
		authMode: failoverFacts.authMode
	});
	if (oauthRefreshFailure) {
		const loginCommand = buildOAuthRefreshFailureLoginCommand(oauthRefreshFailure.provider, { profileId: options?.includeAuthProfileId ? oauthRefreshFailure.profileId : void 0 });
		const loginCommandMarkdown = formatOAuthRefreshFailureLoginCommandMarkdown(loginCommand);
		const providerText = oauthRefreshFailure.provider ? ` for ${oauthRefreshFailure.provider}` : "";
		const retryLoginHint = codexLoginRecovery ? "send `/login codex` from a private chat or Web UI session to pair a new Codex login, or re-auth" : "re-auth";
		if (oauthRefreshFailure.reason) return {
			text: codexLoginRecovery ? `⚠️ ${codexLoginRecovery.hint} You can also re-auth with ${loginCommandMarkdown} on the gateway.` : `⚠️ Model login expired on the gateway${providerText}. Re-auth with ${loginCommandMarkdown} in a terminal, then try again.`,
			...codexLoginRecovery ? { presentation: codexLoginRecovery.presentation } : {},
			isGenericRunnerFailure: false
		};
		return {
			text: `⚠️ Model login failed on the gateway${providerText}. Please try again. If this keeps happening, ${retryLoginHint} with ${loginCommandMarkdown} in a terminal.`,
			isGenericRunnerFailure: false
		};
	}
	const authProfileFailoverFailure = buildAuthProfileFailoverFailureText(error);
	if (authProfileFailoverFailure) return {
		text: codexLoginRecovery ? `${codexLoginRecovery.hint}\n\n${authProfileFailoverFailure}` : authProfileFailoverFailure,
		...codexLoginRecovery ? { presentation: codexLoginRecovery.presentation } : {},
		isGenericRunnerFailure: false
	};
	const cliMaxTurnsError = findCliMaxTurnsError(error);
	if (cliMaxTurnsError) return {
		text: renderUserFacingText(cliMaxTurnsError.message, { errorContext: true }),
		isGenericRunnerFailure: false
	};
	const cliTimeoutError = findCliTimeoutError(error);
	const cliBackendTimeoutFailure = renderCliTimeoutReplyCopy({
		message: normalizedMessage,
		cliTimeout: cliTimeoutError?.cliTimeout,
		provider: cliTimeoutError?.provider,
		replayPrevented: options?.replayPrevented
	});
	if (cliBackendTimeoutFailure) return {
		text: cliBackendTimeoutFailure,
		isGenericRunnerFailure: false
	};
	const providerRequestError = failoverFacts.providerRequestError;
	if (providerRequestError) return {
		text: providerRequestError.userMessage,
		isGenericRunnerFailure: false
	};
	const authError = isProviderAuthError(error) ? error : void 0;
	const missingApiKeyFailure = renderMissingApiKeyReplyCopy(authError ? {
		provider: authError.provider,
		providerGuidance: authError.providerGuidance
	} : void 0);
	if (missingApiKeyFailure) return {
		text: missingApiKeyFailure,
		isGenericRunnerFailure: false
	};
	if (options?.isHeartbeat) return {
		text: HEARTBEAT_EXTERNAL_RUN_FAILURE_TEXT,
		isGenericRunnerFailure: false
	};
	const codexAppServerFailure = buildCodexAppServerFailureText(normalizedMessage);
	if (codexAppServerFailure) return {
		text: codexAppServerFailure,
		isGenericRunnerFailure: false
	};
	const classifiedFailure = renderAssistantRequestFailureCopy(failoverFacts);
	if (classifiedFailure) return {
		text: classifiedFailure,
		isGenericRunnerFailure: false
	};
	return {
		text: options?.includeDetails ? formatForwardedExternalRunFailureText(renderUserFacingText(normalizedMessage, { errorContext: true })) : GENERIC_EXTERNAL_RUN_FAILURE_TEXT,
		isGenericRunnerFailure: true
	};
}
function markAgentRunFailureReplyPayload(payload) {
	const marked = markReplyPayloadForSourceSuppressionDelivery(payload);
	if (!isSilentReplyText(marked.text, "NO_REPLY")) marked.isError = true;
	return marked;
}
function markPostCompactionModelFailurePayload(postCompactionModelFailure, payload) {
	return postCompactionModelFailure === true && payload.isError === true && isReplyPayloadTerminalContent(payload) && typeof payload.text === "string" ? setReplyPayloadMetadata(payload, { postCompactionModelFailure: true }) : payload;
}
function renderPostCompactionModelFailurePayload(payload) {
	return getReplyPayloadMetadata(payload)?.postCompactionModelFailure === true && typeof payload.text === "string" ? copyReplyPayloadMetadata(payload, {
		...payload,
		text: `⚠️ Context compaction succeeded, but the later model request still failed. ${payload.text.replace(/^⚠️\s*/u, "")}`
	}) : payload;
}
function buildTerminalAgentRunFailureReplyPayload(params) {
	const text = params.isHeartbeat ? HEARTBEAT_EXTERNAL_RUN_FAILURE_TEXT : GENERIC_EXTERNAL_RUN_FAILURE_TEXT;
	return markAgentRunFailureReplyPayload({ text: resolveExternalRunFailureTextForConversation({
		...params,
		text,
		isGenericRunnerFailure: true
	}) });
}
function buildEmptyInteractiveReplyPayload(params) {
	if (!params.isInteractive || params.isHeartbeat === true || params.silentExpected === true || params.allowEmptyAssistantReplyAsSilent === true || params.hasPendingContinuation || params.hasExplicitSilentReply || params.hasCommittedDelivery || params.hasIntentionalTerminalCompletion) return;
	return markAgentRunFailureReplyPayload({ text: resolveExternalRunFailureTextForConversation({
		text: "I finished the turn, but it did not produce a visible reply. Please try again, or start a new session if this keeps happening.",
		sessionCtx: params.sessionCtx,
		isGenericRunnerFailure: true,
		cfg: params.cfg
	}) });
}
/** Converts known agent-run failures into user-facing reply payloads. */
function buildKnownAgentRunFailureReplyPayload(params) {
	if (isAgentHarnessPreflightError(params.err)) return;
	const message = formatErrorMessage(params.err);
	const failoverFacts = resolveReplyFailoverFacts(params.err, message);
	const fallbackAttempts = readFallbackAttempts(params.err);
	const hasFallbackAttempts = fallbackAttempts.length > 0;
	if (hasFallbackAttempts ? fallbackAttempts.some((attempt) => attempt.reason === "billing") : failoverFacts.reason === "billing") return markAgentRunFailureReplyPayload({ text: resolveExternalRunFailureTextForConversation({
		text: renderBillingReplyCopy({
			attempts: fallbackAttempts,
			...isFailoverError(params.err) ? {
				provider: params.err.provider,
				model: params.err.model,
				authMode: params.err.authMode
			} : {}
		}),
		sessionCtx: params.sessionCtx,
		isGenericRunnerFailure: false,
		cfg: params.cfg
	}) });
	const preflightCompactionFailureText = buildPreflightCompactionFailureText(message, { includeDetails: isVerboseFailureDetailEnabled(params.resolvedVerboseLevel) });
	if (preflightCompactionFailureText) return markAgentRunFailureReplyPayload({ text: resolveExternalRunFailureTextForConversation({
		text: preflightCompactionFailureText,
		sessionCtx: params.sessionCtx,
		isGenericRunnerFailure: false,
		cfg: params.cfg
	}) });
	const isPureTransientSummary = hasFallbackAttempts ? fallbackAttempts.every((attempt) => attempt.reason === "rate_limit" || attempt.reason === "overloaded") : false;
	const failoverReason = failoverFacts.reason;
	const isOverloaded = hasFallbackAttempts ? fallbackAttempts.every((attempt) => attempt.reason === "overloaded") : failoverReason === "overloaded";
	const isRateLimit = hasFallbackAttempts ? isPureTransientSummary : failoverReason === "rate_limit" || failoverReason === "overloaded";
	const rateLimitOrOverloadedCopy = !hasFallbackAttempts && (failoverReason === "rate_limit" || failoverReason === "overloaded") || isPureTransientSummary ? renderRateLimitOrOverloadedCopy({
		reason: isOverloaded ? "overloaded" : "rate_limit",
		raw: message
	}) : void 0;
	if (isRateLimit && !isOverloaded) return markAgentRunFailureReplyPayload({ text: resolveExternalRunFailureTextForConversation({
		text: renderRateLimitReplyCopy({
			message,
			reason: failoverReason,
			attempts: fallbackAttempts,
			provider: isFailoverError(params.err) ? params.err.provider : void 0,
			cooldownExpiry: isFailoverError(params.err) ? params.err.soonestCooldownExpiry : void 0,
			sanitizeText: (text) => sanitizeUserFacingText(text, { errorContext: true })
		}),
		sessionCtx: params.sessionCtx,
		isGenericRunnerFailure: false,
		cfg: params.cfg
	}) });
	if (rateLimitOrOverloadedCopy) return markAgentRunFailureReplyPayload({ text: resolveExternalRunFailureTextForConversation({
		text: rateLimitOrOverloadedCopy,
		sessionCtx: params.sessionCtx,
		isGenericRunnerFailure: false,
		cfg: params.cfg
	}) });
	const externalRunFailureReply = buildExternalRunFailureReply({
		message,
		error: params.err
	}, {
		includeAuthProfileId: !isNonDirectConversationContext(params.sessionCtx),
		includeDetails: isVerboseFailureDetailEnabled(params.resolvedVerboseLevel),
		failoverFacts
	});
	if (externalRunFailureReply.isGenericRunnerFailure) return;
	return markAgentRunFailureReplyPayload({
		text: resolveExternalRunFailureTextForConversation({
			text: externalRunFailureReply.text,
			sessionCtx: params.sessionCtx,
			isGenericRunnerFailure: false,
			cfg: params.cfg
		}),
		...externalRunFailureReply.presentation ? { presentation: externalRunFailureReply.presentation } : {}
	});
}
//#endregion
//#region src/auto-reply/reply/restart-recovery-claim.ts
/** Provider redelivery guard shared by ingress and the agent admission boundary. */
function isDuplicateRestartRecoverySource(entry, sourceTurnId) {
	const normalizedSourceTurnId = normalizeOptionalString(sourceTurnId);
	return Boolean(normalizedSourceTurnId && (hasRestartRecoveryTerminalRun(entry ?? void 0, normalizedSourceTurnId) || hasRestartRecoverySourceClaim(entry ?? void 0, normalizedSourceTurnId)));
}
async function retireTerminalRestartRecoverySourceClaim(params) {
	let didRetire = false;
	const retired = await updateSessionEntry({
		storePath: params.storePath,
		sessionKey: params.sessionKey
	}, (current) => {
		if (current.sessionId !== params.sessionId || current.status === "running" || current.restartRecoveryDeliveryReceiptState === "terminal-pending" || !hasRestartRecoverySourceClaim(current, params.sourceTurnId)) return null;
		didRetire = true;
		return {
			...buildRestartRecoveryClaimCleanupPatch({
				entry: current,
				recordTerminalSource: true,
				terminalSourceRunId: params.sourceTurnId
			}),
			updatedAt: Date.now()
		};
	}, {
		skipMaintenance: true,
		takeCacheOwnership: true
	});
	return didRetire ? retired ?? void 0 : void 0;
}
function buildExpectedSessionState(entry) {
	return {
		abortedLastRun: entry.abortedLastRun,
		mainRestartRecoveryCycleId: entry.mainRestartRecovery?.cycleId,
		mainRestartRecoveryRevision: entry.mainRestartRecovery?.revision,
		restartRecoveryBeforeAgentReplyState: entry.restartRecoveryBeforeAgentReplyState,
		restartRecoveryDeliveryReceiptState: entry.restartRecoveryDeliveryReceiptState,
		restartRecoveryDeliveryToolCallId: entry.restartRecoveryDeliveryToolCallId,
		restartRecoveryDeliveryRequestFingerprint: entry.restartRecoveryDeliveryRequestFingerprint,
		restartRecoveryDeliveryRunId: entry.restartRecoveryDeliveryRunId,
		restartRecoveryDeliverySourceRunId: entry.restartRecoveryDeliverySourceRunId,
		restartRecoveryRequesterAccountId: entry.restartRecoveryRequesterAccountId,
		restartRecoveryRequesterSenderId: entry.restartRecoveryRequesterSenderId,
		restartRecoverySameChannelThreadRequired: entry.restartRecoverySameChannelThreadRequired,
		restartRecoverySourceIngress: entry.restartRecoverySourceIngress,
		restartRecoverySourceReplyDeliveryMode: entry.restartRecoverySourceReplyDeliveryMode,
		restartRecoveryTerminalRunIds: entry.restartRecoveryTerminalRunIds,
		status: entry.status
	};
}
function createReplyRestartRecoveryClaimController(params) {
	let recoveryRunId = randomUUID();
	let recoverySourceRunId;
	let tracked = false;
	const persistAdmissionPatch = async (options) => {
		const expectedSessionState = buildExpectedSessionState(options.entry);
		if (options.recorder && !options.recorder.hasPersisted()) {
			const result = await options.recorder.persistApproved({
				target: params.resolveUserTurnTarget?.({
					entry: options.entry,
					sessionId: options.sessionId,
					sessionKey: options.sessionKey,
					storePath: options.storePath
				}),
				expectedSessionId: options.sessionId,
				expectedSessionState,
				sessionLifecyclePatch: options.patch
			});
			if (!result?.sessionEntry) throw new Error("session changed before durable user-turn admission");
			return result.sessionEntry;
		}
		const persisted = await updateSessionEntry({
			storePath: options.storePath,
			sessionKey: options.sessionKey
		}, (current) => sessionMatchesExpectedTranscriptTurn({ entry: current }, {
			expectedSessionId: options.sessionId,
			expectedSessionState
		}) ? options.patch : null);
		if (!persisted) throw new Error("restart recovery claim changed before agent adoption");
		return persisted;
	};
	const persistUserTurnOnly = async (recorder, sessionId) => {
		if (!recorder || recorder.hasPersisted()) return;
		const entry = params.getEntry();
		const target = entry && params.sessionKey && params.storePath ? params.resolveUserTurnTarget?.({
			entry,
			sessionId,
			sessionKey: params.sessionKey,
			storePath: params.storePath
		}) : void 0;
		const result = await recorder.persistApproved({
			target,
			expectedSessionId: sessionId
		});
		if (!result) throw new Error("session changed before durable user-turn admission");
		if (result.sessionEntry) params.setEntry(result.sessionEntry);
	};
	const admitUserTurn = async (recorder) => {
		if (!params.sessionKey || !params.storePath) {
			await recorder?.persistApproved();
			return "admitted";
		}
		const sessionId = params.getSessionId();
		const entry = loadSessionEntry({
			storePath: params.storePath,
			sessionKey: params.sessionKey,
			clone: false,
			hydrateSkillPromptRefs: false
		}) ?? params.getEntry();
		if (!entry || entry.sessionId !== sessionId) throw new Error("session changed before durable user-turn admission");
		const admissionRunId = normalizeOptionalString(params.admissionRunId);
		const sourceTurnId = normalizeOptionalString(params.sourceTurnId);
		const activeClaimRunId = normalizeOptionalString(entry.restartRecoveryDeliveryRunId);
		const isExactRecoveryClaim = admissionRunId && activeClaimRunId === admissionRunId;
		if (sourceTurnId) {
			if (hasRestartRecoveryTerminalRun(entry, sourceTurnId)) return "duplicate-source";
			if (!isExactRecoveryClaim && hasRestartRecoverySourceClaim(entry, sourceTurnId)) {
				if (entry.status !== "running") {
					const retired = await retireTerminalRestartRecoverySourceClaim({
						sessionId,
						sessionKey: params.sessionKey,
						sourceTurnId,
						storePath: params.storePath
					});
					if (retired) params.setEntry(retired);
				}
				return "duplicate-source";
			}
		}
		if (isExactRecoveryClaim) {
			if (entry.status !== "running" || entry.abortedLastRun === true) throw new Error("restart recovery claim changed before agent adoption");
			const preservesTerminalReceipt = entry.restartRecoveryDeliveryReceiptState === "terminal-pending";
			const adopted = await persistAdmissionPatch({
				entry,
				patch: {
					restartRecoveryBeforeAgentReplyState: void 0,
					...preservesTerminalReceipt ? {} : {
						restartRecoveryDeliveryReceiptState: void 0,
						restartRecoveryDeliveryToolCallId: void 0,
						restartRecoveryDeliveryRequestFingerprint: void 0
					},
					restartRecoverySourceIngress: entry.restartRecoverySourceIngress ?? "control-ui",
					updatedAt: Date.now()
				},
				recorder,
				sessionId,
				sessionKey: params.sessionKey,
				storePath: params.storePath
			});
			params.setEntry(adopted);
			recoveryRunId = admissionRunId;
			recoverySourceRunId = normalizeOptionalString(adopted.restartRecoveryDeliverySourceRunId);
			tracked = true;
			return "admitted";
		}
		const deliveryContext = params.resolveDeliveryContext(entry);
		const recoverableDeliveryContext = deliveryContext && sourceTurnId ? deliveryContext : void 0;
		if (recoverableDeliveryContext) {
			const sourceMessage = recorder?.getPersistedMessage?.() ?? await recorder?.resolveMessage();
			const persistedSourceTurnId = normalizeOptionalString(sourceMessage?.idempotencyKey);
			if (!recorder || persistedSourceTurnId !== sourceTurnId) throw new Error("channel restart recovery requires source-keyed user-turn admission");
		}
		if (!recoverableDeliveryContext && !activeClaimRunId) {
			await persistUserTurnOnly(recorder, sessionId);
			return "admitted";
		}
		const updatedAt = Date.now();
		if (activeClaimRunId && (entry.abortedLastRun === true || entry.status === "running" || entry.restartRecoveryDeliveryReceiptState === "terminal-pending")) throw new Error("restart recovery claim changed before agent adoption");
		const retiredClaim = activeClaimRunId ? buildRestartRecoveryClaimCleanupPatch({
			entry,
			recordTerminalSource: true,
			terminalSourceRunId: normalizeOptionalString(entry.restartRecoveryDeliverySourceRunId)
		}) : {};
		const patch = recoverableDeliveryContext ? {
			...retiredClaim,
			abortedLastRun: false,
			endedAt: void 0,
			restartRecoveryBeforeAgentReplyState: void 0,
			restartRecoveryDeliveryReceiptState: void 0,
			restartRecoveryDeliveryToolCallId: void 0,
			restartRecoveryDeliveryContext: recoverableDeliveryContext,
			restartRecoveryDeliveryRequestFingerprint: void 0,
			restartRecoveryDeliveryRunId: recoveryRunId,
			restartRecoveryDeliverySourceRunId: sourceTurnId,
			restartRecoveryRequesterAccountId: sourceTurnId ? normalizeOptionalString(params.requesterAccountId) : void 0,
			restartRecoveryRequesterSenderId: sourceTurnId ? normalizeOptionalString(params.requesterSenderId) : void 0,
			restartRecoverySameChannelThreadRequired: sourceTurnId && params.sameChannelThreadRequired === true ? true : void 0,
			restartRecoverySourceIngress: sourceTurnId ? "channel" : void 0,
			restartRecoverySourceReplyDeliveryMode: params.sourceReplyDeliveryMode,
			runtimeMs: void 0,
			startedAt: updatedAt,
			status: "running",
			updatedAt
		} : {
			...retiredClaim,
			updatedAt
		};
		const persisted = await persistAdmissionPatch({
			entry,
			patch,
			recorder,
			sessionId,
			sessionKey: params.sessionKey,
			storePath: params.storePath
		});
		params.setEntry(persisted);
		recoverySourceRunId = normalizeOptionalString(persisted.restartRecoveryDeliverySourceRunId);
		tracked = persisted.restartRecoveryDeliveryRunId === recoveryRunId;
		return "admitted";
	};
	const checkpointBeforeAgentReply = async ({ state, pendingFinalDelivery }) => {
		if (!tracked || !params.sessionKey || !params.storePath) return;
		const updatedAt = Date.now();
		const persisted = await updateSessionEntry({
			storePath: params.storePath,
			sessionKey: params.sessionKey
		}, (current) => current.sessionId === params.getSessionId() && current.restartRecoveryDeliveryRunId === recoveryRunId && current.restartRecoveryDeliverySourceRunId === recoverySourceRunId && current.restartRecoveryBeforeAgentReplyState === "pending" ? {
			restartRecoveryBeforeAgentReplyState: state,
			...pendingFinalDelivery ? {
				pendingFinalDelivery: {
					...pendingFinalDelivery.text ? {
						kind: "replayable",
						text: pendingFinalDelivery.text
					} : { kind: "transport-only" },
					createdAt: updatedAt,
					...pendingFinalDelivery.intentId ? { intentId: pendingFinalDelivery.intentId } : {},
					deliveries: pendingFinalDelivery.deliveries,
					...pendingFinalDelivery.context ? { context: pendingFinalDelivery.context } : {}
				},
				restartRecoveryForceSafeTools: true
			} : {},
			updatedAt
		} : null, {
			skipMaintenance: true,
			takeCacheOwnership: true
		});
		if (!persisted) throw new Error("before_agent_reply checkpoint lost restart recovery ownership");
		params.setEntry(persisted);
	};
	const beginBeforeAgentReply = async () => {
		if (!tracked || !params.sessionKey || !params.storePath) return true;
		const updatedAt = Date.now();
		const persisted = await updateSessionEntry({
			storePath: params.storePath,
			sessionKey: params.sessionKey
		}, (persistedCurrent) => persistedCurrent.sessionId === params.getSessionId() && persistedCurrent.restartRecoveryDeliveryRunId === recoveryRunId && persistedCurrent.restartRecoveryDeliverySourceRunId === recoverySourceRunId && persistedCurrent.restartRecoveryBeforeAgentReplyState === void 0 ? {
			restartRecoveryBeforeAgentReplyState: "pending",
			updatedAt
		} : null, {
			skipMaintenance: true,
			takeCacheOwnership: true
		});
		if (!persisted) throw new Error("before_agent_reply start lost restart recovery ownership");
		params.setEntry(persisted);
		return true;
	};
	const clear = async () => {
		const lifecycleGeneration = params.lifecycleGeneration;
		if (!tracked || !params.sessionKey || !params.storePath || !lifecycleGeneration || params.isRestartAbort()) return;
		const persisted = await patchSessionEntryCore({
			storePath: params.storePath,
			sessionKey: params.sessionKey
		}, (current) => {
			if (current.abortedLastRun === true && current.mainRestartRecovery !== void 0 || current.sessionId !== params.getSessionId() || current.restartRecoveryDeliveryRunId !== recoveryRunId) return null;
			if (current.restartRecoveryDeliveryReceiptState === "terminal-pending") {
				const endedAt = Date.now();
				return {
					...buildRestartRecoveryClaimCleanupPatch({
						entry: current,
						recordTerminalSource: true,
						terminalSourceRunId: recoverySourceRunId
					}),
					abortedLastRun: true,
					endedAt,
					lifecycleRunId: void 0,
					pendingFinalDelivery: void 0,
					runtimeMs: typeof current.startedAt === "number" ? Math.max(0, endedAt - current.startedAt) : void 0,
					status: "failed",
					updatedAt: endedAt
				};
			}
			const preservesPendingFinal = current.pendingFinalDelivery !== void 0;
			const endedAt = current.restartRecoveryBeforeAgentReplyState === "handled-silent" && !preservesPendingFinal ? Date.now() : void 0;
			return {
				...buildRestartRecoveryClaimCleanupPatch({
					entry: current,
					recordTerminalSource: true,
					terminalSourceRunId: recoverySourceRunId
				}),
				...preservesPendingFinal ? {
					restartRecoveryBeforeAgentReplyState: current.restartRecoveryBeforeAgentReplyState,
					restartRecoverySourceIngress: current.restartRecoverySourceIngress,
					restartRecoveryForceSafeTools: current.restartRecoveryForceSafeTools
				} : {},
				...endedAt !== void 0 ? {
					abortedLastRun: false,
					endedAt,
					lifecycleRunId: void 0,
					runtimeMs: typeof current.startedAt === "number" ? Math.max(0, endedAt - current.startedAt) : void 0,
					status: "done"
				} : {},
				updatedAt: endedAt ?? Date.now()
			};
		}, { assertCommitAllowed: () => {
			assertAgentRunLifecycleGenerationCurrent(lifecycleGeneration);
			if (params.isRestartAbort()) throw createAgentRunStaleLifecycleError();
		} });
		if (persisted) params.setEntry(persisted);
	};
	const isArmed = () => {
		if (!tracked || !params.sessionKey || !params.storePath) return false;
		return loadSessionEntry({
			sessionKey: params.sessionKey,
			storePath: params.storePath,
			clone: false,
			hydrateSkillPromptRefs: false
		})?.abortedLastRun === true || params.getEntry()?.abortedLastRun === true;
	};
	return {
		admitUserTurn,
		beginBeforeAgentReply,
		checkpointBeforeAgentReply,
		clear,
		isArmed
	};
}
//#endregion
//#region src/auto-reply/reply/commentary-progress-owner.ts
/** Freezes and registers one commentary owner for the current agent turn. */
function resolveTurnCommentaryProgressOwner(params) {
	const shouldDeliverCommentaryPayloads = params.commentaryPayloadsEnabled ? params.options?.shouldDeliverCommentaryPayloads : void 0;
	const frozenVerboseProgressVisibility = shouldDeliverCommentaryPayloads ? params.resolveVerboseProgressVisibility() : void 0;
	params.options?.onVerboseProgressVisibility?.(frozenVerboseProgressVisibility === void 0 ? params.resolveVerboseProgressVisibility : () => frozenVerboseProgressVisibility);
	const commentaryPayloadsEnabled = params.commentaryPayloadsEnabled && (shouldDeliverCommentaryPayloads?.() ?? true);
	return {
		commentaryPayloadsEnabled,
		draftOwnsCommentaryProgress: params.commentaryPayloadsEnabled && shouldDeliverCommentaryPayloads !== void 0 && !commentaryPayloadsEnabled
	};
}
//#endregion
//#region src/auto-reply/reply/get-reply.types.ts
function shouldBridgeCliPreambleEvents(opts) {
	return opts?.commentaryProgressEnabled === true || opts?.progressPreambleEnabled === true;
}
//#endregion
//#region src/auto-reply/reply/reply-admission-ticket.ts
const REPLY_ADMISSION_TICKET = Symbol("openclaw.replyAdmissionTicket");
const replyAdmissionTickets = createKeyedFifoLeaseRegistry(Symbol.for("openclaw.replyAdmissionTickets"));
/** Briefly orders queue publication across a command's source and target sessions. */
function reserveReplyAdmissionTicket(sessionKeys) {
	return replyAdmissionTickets.reserve(normalizeStringifiedEntries(sessionKeys));
}
//#endregion
export { markPostCompactionModelFailurePayload as _, createReplyRestartRecoveryClaimController as a, resolveReplyFailoverFacts as b, buildAuthProfileFailoverFailureText as c, buildKnownAgentRunFailureReplyPayload as d, buildPreflightCompactionFailureText as f, markAgentRunFailureReplyPayload as g, isVerboseFailureDetailEnabled as h, resolveTurnCommentaryProgressOwner as i, buildEmptyInteractiveReplyPayload as l, isNonDirectConversationContext as m, reserveReplyAdmissionTicket as n, isDuplicateRestartRecoverySource as o, buildTerminalAgentRunFailureReplyPayload as p, shouldBridgeCliPreambleEvents as r, retireTerminalRestartRecoverySourceClaim as s, REPLY_ADMISSION_TICKET as t, buildExternalRunFailureReply as u, renderPostCompactionModelFailurePayload as v, resolveExternalRunFailureTextForConversation as y };
