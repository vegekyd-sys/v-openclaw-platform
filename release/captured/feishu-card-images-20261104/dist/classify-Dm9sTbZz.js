import { c as normalizeOptionalLowercaseString, o as normalizeLowercaseStringOrEmpty } from "./string-coerce-CIXf7egm.js";
import { i as classifyOAuthRefreshFailure } from "./oauth-refresh-failure-FDM8bCmh.js";
import { t as classifyProviderFailoverSignalWithPlugin } from "./provider-failover-B_gP2g8i.js";
import { c as isGenericProviderInternalError, l as parseApiErrorInfo, r as extractLeadingHttpStatus } from "./assistant-error-format-oP4GVe5A.js";
import { n as isTransientNetworkError } from "./retryable-network-errors-D2gJmBqw.js";
import { a as isBillingErrorMessage, c as isProviderCompletedErrorFinishReasonMessage, d as isServerErrorMessage, f as isTimeoutErrorMessage, i as isAuthPermanentErrorMessage, l as isProviderRequestSizeCeilingError, o as isOverloadedErrorMessage, p as matchesFormatErrorPattern, r as isAuthErrorMessage, s as isPeriodicUsageLimitErrorMessage, t as GENERIC_MODEL_NOT_FOUND_RE, u as isRateLimitErrorMessage } from "./message-patterns-DUJIJ5zt.js";
import { matchesContextOverflowMessage } from "@openclaw/ai/internal/runtime";
import { inspectTlsCertificateError } from "@openclaw/ai/internal/shared";
//#region src/agents/embedded-agent-helpers/image-errors.ts
const IMAGE_DIMENSION_ERROR_RE = /image dimensions exceed max allowed size for many-image requests:\s*(\d+)\s*pixels/i;
const IMAGE_DIMENSION_PATH_RE = /messages\.(\d+)\.content\.(\d+)\.image/i;
const IMAGE_SIZE_ERROR_RE = /image exceeds\s*(\d+(?:\.\d+)?)\s*mb/i;
function parseImageDimensionError(raw) {
	if (!raw) return null;
	if (!/image dimensions exceed max allowed size/i.test(raw)) return null;
	const limitMatch = raw.match(IMAGE_DIMENSION_ERROR_RE);
	const pathMatch = raw.match(IMAGE_DIMENSION_PATH_RE);
	return {
		maxDimensionPx: limitMatch?.[1] ? Number.parseInt(limitMatch[1], 10) : void 0,
		messageIndex: pathMatch?.[1] ? Number.parseInt(pathMatch[1], 10) : void 0,
		contentIndex: pathMatch?.[2] ? Number.parseInt(pathMatch[2], 10) : void 0,
		raw
	};
}
function isImageDimensionErrorMessage(raw) {
	return Boolean(parseImageDimensionError(raw));
}
function parseImageSizeError(raw) {
	if (!raw) return null;
	if (!/image exceeds[\s\S]*mb/i.test(raw)) return null;
	const match = raw.match(IMAGE_SIZE_ERROR_RE);
	return {
		maxMb: match?.[1] ? Number.parseFloat(match[1]) : void 0,
		raw
	};
}
function isImageSizeError(errorMessage) {
	return Boolean(errorMessage && parseImageSizeError(errorMessage));
}
//#endregion
//#region src/agents/live-model-errors.ts
/**
* Live-provider model error classifiers.
*
* Probe and fallback code uses these string checks to distinguish missing or
* deprecated model ids from generic provider/runtime failures.
*/
/** Returns whether a provider error message indicates a missing or retired model id. */
function isModelNotFoundErrorMessage(raw) {
	const msg = raw.trim();
	if (!msg) return false;
	if (/no endpoints found for/i.test(msg)) return true;
	if (/\brouter not found\b/i.test(msg)) return true;
	if (/unknown model/i.test(msg)) return true;
	if (/model(?:[_\-\s])?not(?:[_\-\s])?found/i.test(msg)) return true;
	if (/\b404\b/.test(msg) && /not(?:[_\-\s])?found/i.test(msg)) return true;
	if (/not_found_error/i.test(msg)) return true;
	if (/\bnot supported model\b/i.test(msg)) return true;
	if (/\bmodel\b[^.]{0,120}?\bis not supported when using\b[^.]{0,80}?\bwith a ChatGPT account\b/i.test(msg)) return true;
	if (/model:\s*[a-z0-9._/-]+/i.test(msg) && /not(?:[_\-\s])?found/i.test(msg)) return true;
	if (/models\/[^\s]+ is not found/i.test(msg)) return true;
	if (/model/i.test(msg) && /does not exist/i.test(msg)) return true;
	if (/selected model/i.test(msg) && /not(?:[_\-\s])?found/i.test(msg)) return true;
	if (/model/i.test(msg) && /deprecated/i.test(msg) && /(upgrade|transition) to/i.test(msg)) return true;
	if (/stealth model/i.test(msg) && /find it here/i.test(msg)) return true;
	if (/is not a valid model id/i.test(msg)) return true;
	if (/invalid model/i.test(msg) && !/invalid model reference/i.test(msg)) return true;
	return false;
}
//#endregion
//#region src/agents/failover/classification-rules.ts
const FAILOVER_TIMEOUT_ERROR_CODES = /* @__PURE__ */ new Set([
	"EHOSTDOWN",
	"ENETRESET",
	"ERR_STREAM_PREMATURE_CLOSE"
]);
const NO_BODY_HTTP_WRAPPER_RE = /^(?:no body(?: response)?|no response body|status code \(no body\))$/i;
function stripErrorPrefix(raw) {
	return raw.replace(/^error:\s*/i, "").trim();
}
function inferSignalStatus(signal) {
	if (typeof signal.status === "number" && Number.isFinite(signal.status)) return signal.status;
	return extractLeadingHttpStatus(stripErrorPrefix(signal.message?.trim() ?? ""))?.code;
}
function isExplicitNoBodyHttpMessage(raw, status) {
	const trimmed = raw?.trim();
	if (!trimmed) return false;
	const candidate = extractLeadingHttpStatus(trimmed) ? trimmed : stripErrorPrefix(trimmed);
	const leadingStatus = extractLeadingHttpStatus(candidate);
	if (leadingStatus) {
		if (typeof status === "number" && leadingStatus.code !== status) return false;
		return NO_BODY_HTTP_WRAPPER_RE.test(leadingStatus.rest);
	}
	return NO_BODY_HTTP_WRAPPER_RE.test(candidate);
}
function isUnclassifiedNoBodyHttpSignal(signal) {
	const status = inferSignalStatus(signal);
	if (status !== 400 && status !== 422) return false;
	const message = signal.message?.trim();
	return !message || isExplicitNoBodyHttpMessage(message, status);
}
const TRANSIENT_HTTP_ERROR_CODES = /* @__PURE__ */ new Set([
	499,
	500,
	502,
	503,
	504,
	521,
	522,
	523,
	524,
	529
]);
const BILLING_402_HINTS = [
	"insufficient credits",
	"insufficient quota",
	"credit balance",
	"insufficient balance",
	"plans & billing",
	"add more credits",
	"top up"
];
const BILLING_402_PLAN_HINTS = [
	"upgrade your plan",
	"upgrade plan",
	"current plan",
	"subscription"
];
const PERIODIC_402_HINTS = [
	"daily",
	"weekly",
	"monthly"
];
const RETRYABLE_402_RETRY_HINTS = [
	"try again",
	"retry",
	"temporary",
	"cooldown"
];
const RETRYABLE_402_LIMIT_HINTS = [
	"usage limit",
	"rate limit",
	"organization usage"
];
const RETRYABLE_402_SCOPED_HINTS = ["organization", "workspace"];
const RETRYABLE_402_SCOPED_RESULT_HINTS = [
	"billing period",
	"exceeded",
	"reached",
	"exhausted"
];
const RAW_402_MARKER_RE = /["']?(?:status|code)["']?\s*[:=]\s*402\b|\bhttp\s*402\b|\berror(?:\s+code)?\s*[:=]?\s*402\b|\b(?:got|returned|received)\s+(?:a\s+)?402\b|^\s*402\s+(?:payment required\b|.*used up your points\b|no available asset for api access\b)/i;
const BARE_LEADING_402_RE = /^\s*402\b/i;
const LEADING_402_WRAPPER_RE = /^(?:error[:\s-]+)?(?:(?:http\s*)?402(?:\s+payment required)?|payment required)(?:[:\s-]+|$)/i;
function includesAnyHint(text, hints) {
	return hints.some((hint) => text.includes(hint));
}
function hasExplicit402BillingSignal(text) {
	return includesAnyHint(text, BILLING_402_HINTS) || includesAnyHint(text, BILLING_402_PLAN_HINTS) && text.includes("limit") || text.includes("billing hard limit") || text.includes("hard limit reached") || text.includes("maximum allowed") && text.includes("limit");
}
function hasQuotaRefreshWindowSignal(text) {
	return text.includes("subscription quota limit") && (text.includes("automatic quota refresh") || text.includes("rolling time window"));
}
function hasRetryable402TransientSignal(text) {
	const hasPeriodicHint = includesAnyHint(text, PERIODIC_402_HINTS);
	const hasSpendLimit = text.includes("spend limit") || text.includes("spending limit");
	const hasScopedHint = includesAnyHint(text, RETRYABLE_402_SCOPED_HINTS);
	return includesAnyHint(text, RETRYABLE_402_RETRY_HINTS) && includesAnyHint(text, RETRYABLE_402_LIMIT_HINTS) || hasPeriodicHint && (text.includes("usage limit") || hasSpendLimit) || hasPeriodicHint && text.includes("limit") && text.includes("reset") || hasScopedHint && text.includes("limit") && (hasSpendLimit || includesAnyHint(text, RETRYABLE_402_SCOPED_RESULT_HINTS));
}
function hasKnownBareLeading402Signal(text) {
	return hasQuotaRefreshWindowSignal(text) || hasExplicit402BillingSignal(text) || isRateLimitErrorMessage(text) || hasRetryable402TransientSignal(text);
}
function normalize402Message(raw) {
	return normalizeOptionalLowercaseString(raw)?.replace(LEADING_402_WRAPPER_RE, "").trim() ?? "";
}
function classify402Message(message) {
	const normalized = normalize402Message(message);
	if (!normalized) return "billing";
	if (hasQuotaRefreshWindowSignal(normalized)) return "rate_limit";
	if (hasExplicit402BillingSignal(normalized)) return "billing";
	if (isRateLimitErrorMessage(normalized)) return "rate_limit";
	if (hasRetryable402TransientSignal(normalized)) return "rate_limit";
	return "billing";
}
function classifyFailoverReasonFrom402Text(raw) {
	if (RAW_402_MARKER_RE.test(raw)) return classify402Message(raw);
	if (!BARE_LEADING_402_RE.test(raw)) return null;
	const normalized = normalize402Message(raw);
	if (!normalized || !hasKnownBareLeading402Signal(normalized)) return null;
	return classify402Message(raw);
}
function toReasonClassification(reason) {
	return {
		kind: "reason",
		reason
	};
}
function toPluginClassification(reason) {
	return reason === "context_overflow" ? { kind: "context_overflow" } : toReasonClassification(reason);
}
function failoverReasonFromClassification(classification) {
	if (!classification) return null;
	return classification.kind === "reason" ? classification.reason : "context_overflow";
}
function isTransientHttpError(raw) {
	const trimmed = raw.trim();
	if (!trimmed) return false;
	const status = extractLeadingHttpStatus(trimmed);
	if (!status) return false;
	return TRANSIENT_HTTP_ERROR_CODES.has(status.code);
}
function classifyFailoverClassificationFromHttpStatus(status, message, messageClassification, explicitStatus, provider, opts) {
	const messageReason = failoverReasonFromClassification(messageClassification);
	if (typeof status !== "number" || !Number.isFinite(status)) return null;
	if (status === 402) {
		if (!message) return toReasonClassification("billing");
		if (extractLeadingHttpStatus(message.trim())?.code === 402) {
			const reasonFrom402Text = classifyFailoverReasonFrom402Text(message);
			if (reasonFrom402Text) return toReasonClassification(reasonFrom402Text);
			return typeof explicitStatus === "number" ? toReasonClassification(classify402Message(message)) : messageClassification;
		}
		return toReasonClassification(classify402Message(message));
	}
	if (status === 429) {
		if (messageReason === "billing" && !isAmbiguousGeneric429BalanceMessage(message ?? "")) return toReasonClassification("billing");
		if (message && isBilling429MessageForProvider(message, provider)) return toReasonClassification("billing");
		return toReasonClassification("rate_limit");
	}
	if (status === 401 || status === 403) {
		if (opts?.preserveProviderSignalClassification && messageClassification) return messageClassification;
		if (message && isAuthPermanentErrorMessage(message)) return toReasonClassification("auth_permanent");
		if (messageReason === "billing") return toReasonClassification("billing");
		return toReasonClassification("auth");
	}
	if (status === 408) return toReasonClassification("timeout");
	if (status === 410) {
		if (messageReason === "session_expired" || messageReason === "billing" || messageReason === "auth_permanent" || messageReason === "auth") return messageClassification;
		return toReasonClassification("timeout");
	}
	if (messageClassification?.kind === "context_overflow") return messageClassification;
	if (status === 404) {
		if (messageReason === "session_expired" || messageReason === "billing" || messageReason === "auth_permanent" || messageReason === "auth" || messageReason === "format") return messageClassification;
		return toReasonClassification("model_not_found");
	}
	// upstream-5xx-fallback-v1: upstream 776f76b4b87 (v2026.9.6) — an answered HTTP 5xx is a server_error;
	// only the timing statuses (499, 504) stay timeout.
	if (status === 503 || status === 499) {
		if (messageReason === "overloaded") return messageClassification;
		return toReasonClassification(status === 499 ? "timeout" : "server_error");
	}
	if (status === 500 || status === 502 || status === 504) {
		if (messageReason === "server_error") return messageClassification;
		return toReasonClassification(status === 504 ? "timeout" : "server_error");
	}
	if (status === 529) return toReasonClassification("overloaded");
	if (status === 400 || status === 422) {
		if (messageClassification && messageReason !== "server_error") return messageClassification;
		if (isUnclassifiedNoBodyHttpSignal({
			status,
			message
		})) return null;
		return toReasonClassification("format");
	}
	return null;
}
function classifyFailoverReasonFromCode(raw) {
	const normalized = raw?.trim().toUpperCase();
	if (!normalized) return null;
	switch (normalized) {
		case "RESOURCE_EXHAUSTED":
		case "RATE_LIMIT":
		case "RATE_LIMITED":
		case "RATE_LIMIT_EXCEEDED":
		case "TOO_MANY_REQUESTS":
		case "THROTTLED":
		case "THROTTLING":
		case "THROTTLINGEXCEPTION":
		case "THROTTLING_EXCEPTION": return "rate_limit";
		case "DEACTIVATED_WORKSPACE": return "auth_permanent";
		case "OVERLOADED":
		case "OVERLOADED_ERROR": return "overloaded";
		default: return FAILOVER_TIMEOUT_ERROR_CODES.has(normalized) || isTransientNetworkError({ code: normalized }) ? "timeout" : null;
	}
}
function classifyCoreFailoverReasonFromErrorType(raw) {
	switch (normalizeOptionalLowercaseString(raw)) {
		case "invalid_request_error": return "format";
		case "server_error":
		case "upstream_error": return "server_error";
		case "overloaded_error": return "overloaded";
		default: return null;
	}
}
function classifyFailoverClassificationFromErrorType(raw) {
	const reason = classifyCoreFailoverReasonFromErrorType(raw);
	return reason ? toReasonClassification(reason) : null;
}
function isProvider(provider, match) {
	const normalized = normalizeOptionalLowercaseString(provider);
	return Boolean(normalized && normalized.includes(match));
}
function hasProviderBilling429Override(provider) {
	return isProvider(provider, "xai") || isProvider(provider, "moonshot") || isProvider(provider, "kimi");
}
function hasStructuredBilling429Signal(raw) {
	if (hasBillingApiErrorType(raw)) return true;
	const leadingStatus = extractLeadingHttpStatus(raw.trim());
	return Boolean(leadingStatus?.rest && hasBillingApiErrorType(leadingStatus.rest));
}
function hasBillingApiErrorType(raw) {
	const type = normalizeOptionalLowercaseString(parseApiErrorInfo(raw)?.type);
	if (!type) return false;
	return isBillingErrorMessage(type) || isBillingErrorMessage(type.replaceAll("_", " "));
}
function isAmbiguousGeneric429BalanceMessage(raw) {
	return /\binsufficient\s+account\s+balance\b/i.test(raw) && !hasStructuredBilling429Signal(raw);
}
function isBilling429MessageForProvider(raw, provider) {
	if (!isBillingErrorMessage(raw)) return false;
	return hasProviderBilling429Override(provider) || !isAmbiguousGeneric429BalanceMessage(raw);
}
function isGenericUnknownStreamErrorMessage(raw) {
	return /^\s*an unknown error occurred\.?\s*$/i.test(raw);
}
function isExactUnknownNoDetailsError(raw) {
	return normalizeOptionalLowercaseString(raw)?.trim() === "unknown error (no error details in response)";
}
function isClaudeCliAuthError(raw, provider) {
	if (normalizeOptionalLowercaseString(provider)?.trim() !== "claude-cli") return false;
	return /\bnot logged in\b\s*·\s*please run \/login\b|\bfailed to authenticate:\s*oauth session expired and could not be refreshed\b/i.test(raw);
}
function isUnsupportedImageInputErrorMessage(raw) {
	const normalized = normalizeOptionalLowercaseString(raw);
	if (!normalized) return false;
	return /\bdoes not support image inputs?\b/.test(normalized) || /\bunsupported image input\b/.test(normalized) || /\bno endpoints found\b/.test(normalized) && /\bsupport image input\b/.test(normalized);
}
//#endregion
//#region src/agents/failover/provider-patterns.ts
/**
* Provider-specific patterns that map to specific failover reasons.
* These handle cases where the generic message tables produce wrong results
* for specific providers.
*/
const PROVIDER_SPECIFIC_PATTERNS = [
	{
		test: /\bworkers_ai\b.*\bquota limit exceeded\b/i,
		reason: "rate_limit"
	},
	{
		test: /\bmodelnotreadyexception\b/i,
		reason: "overloaded"
	},
	{
		test: /model(?:_is)?_deactivated|model has been deactivated/i,
		reason: "model_not_found"
	}
];
const PROVIDER_CONTEXT_OVERFLOW_SIGNAL_RE = /\b(?:context|window|prompt|token|tokens|input|request|model)\b/i;
const PROVIDER_CONTEXT_OVERFLOW_ACTION_RE = /\b(?:too\s+(?:large|long|many)|exceed(?:s|ed|ing)?|overflow|limit|maximum|max)\b/i;
function looksLikeProviderContextOverflowCandidate(errorMessage) {
	return !isRateLimitErrorMessage(errorMessage) && PROVIDER_CONTEXT_OVERFLOW_SIGNAL_RE.test(errorMessage) && PROVIDER_CONTEXT_OVERFLOW_ACTION_RE.test(errorMessage);
}
function classifyProviderPluginError(context) {
	const { providerPlugin, ...providerContext } = context;
	if (providerPlugin === null) return null;
	if (providerPlugin) {
		const ownedContext = {
			...providerContext,
			provider: providerPlugin.id
		};
		if (providerPlugin.matchesContextOverflowError?.(ownedContext)) return "context_overflow";
		return providerPlugin.classifyFailoverReason?.(ownedContext) ?? null;
	}
	return classifyProviderFailoverSignalWithPlugin({
		provider: context.provider,
		context: providerContext
	}) ?? null;
}
function classifyLegacyProviderSpecificError(context) {
	for (const pattern of PROVIDER_SPECIFIC_PATTERNS) if (pattern.test.test(context.errorMessage)) return pattern.reason;
	return null;
}
//#endregion
//#region src/agents/failover/context-overflow.ts
function isReasoningConstraintErrorMessage(raw) {
	if (!raw) return false;
	const lower = normalizeLowercaseStringOrEmpty(raw);
	return lower.includes("reasoning is mandatory") || lower.includes("reasoning is required") || lower.includes("requires reasoning") || lower.includes("reasoning") && lower.includes("cannot be disabled");
}
function hasRateLimitTpmHint(raw) {
	return matchesContextOverflowMessage(raw, "tpm-rate-limit-hint");
}
/** Detect explicit context-window overflow without confusing TPM rate limits. */
function isContextOverflowErrorFromTables(errorMessage) {
	if (!errorMessage) return false;
	if (hasRateLimitTpmHint(errorMessage) && !isProviderRequestSizeCeilingError(errorMessage)) return false;
	if (isReasoningConstraintErrorMessage(errorMessage)) return false;
	return matchesContextOverflowMessage(errorMessage, "failover-explicit") || looksLikeProviderContextOverflowCandidate(errorMessage) && matchesContextOverflowMessage(errorMessage, "provider-fallback");
}
function isContextOverflowError(errorMessage, opts) {
	if (!errorMessage) return false;
	return isContextOverflowErrorFromTables(errorMessage) || looksLikeProviderContextOverflowCandidate(errorMessage) && classifyProviderPluginError({
		errorMessage,
		providerPlugin: opts?.providerPlugin
	}) === "context_overflow";
}
function isLikelyContextOverflowError(errorMessage) {
	if (!errorMessage) return false;
	if (isProviderRequestSizeCeilingError(errorMessage)) return isContextOverflowErrorFromTables(errorMessage);
	if (hasRateLimitTpmHint(errorMessage)) return false;
	if (isReasoningConstraintErrorMessage(errorMessage)) return false;
	if (isBillingErrorMessage(errorMessage)) return false;
	if (matchesContextOverflowMessage(errorMessage, "context-window-too-small")) return false;
	if (isRateLimitErrorMessage(errorMessage)) return false;
	if (isContextOverflowError(errorMessage)) return true;
	if (normalizeLowercaseStringOrEmpty(errorMessage).includes("prompt template")) return false;
	if (matchesContextOverflowMessage(errorMessage, "rate-limit-hint")) return false;
	return matchesContextOverflowMessage(errorMessage, "failover-hint");
}
//#endregion
//#region src/agents/failover/classify.ts
const HTML_BODY_RE = /^\s*(?:<!doctype\s+html\b|<html\b)/i;
const HTML_CLOSE_RE = /<\/html>/i;
const REPLAY_INVALID_RE = /\bprevious_response_id\b.*\b(?:invalid|unknown|not found|does not exist|expired|mismatch)\b|\btool_(?:use|call)\.(?:input|arguments)\b.*\b(?:missing|required)\b|\bincorrect role information\b|\broles must alternate\b|\binput item id does not belong to this connection\b/i;
const THINKING_SIGNATURE_ERROR_RE = /\b(?:invalid|expired)\b.*\bsignature\b|\bsignature\b.*\b(?:invalid|expired)\b/i;
function isThinkingSignatureReplayInvalidErrorMessage(raw) {
	return /\bthinking\b/i.test(raw) && THINKING_SIGNATURE_ERROR_RE.test(raw);
}
function isReplayInvalidErrorMessage(raw) {
	return REPLAY_INVALID_RE.test(raw) || isThinkingSignatureReplayInvalidErrorMessage(raw);
}
function isHtmlErrorResponse(raw, status) {
	const trimmed = raw.trim();
	if (!trimmed) return false;
	const candidate = extractLeadingHttpStatus(trimmed) ? trimmed : trimmed.replace(/^error:\s*/i, "").trim();
	const inferred = typeof status === "number" && Number.isFinite(status) ? status : extractLeadingHttpStatus(candidate)?.code;
	if (typeof inferred !== "number" || inferred < 400) return false;
	const rest = extractLeadingHttpStatus(candidate)?.rest ?? candidate;
	return HTML_BODY_RE.test(rest) && HTML_CLOSE_RE.test(rest);
}
function isTransportHtmlErrorStatus(status) {
	return status === 408 || status === 499 || typeof status === "number" && status >= 500 && status < 600;
}
function classifyFailoverClassificationFromMessage(raw, provider) {
	if (isImageDimensionErrorMessage(raw)) return null;
	if (isImageSizeError(raw)) return null;
	if (isUnsupportedImageInputErrorMessage(raw)) return toReasonClassification("format");
	if (isClaudeCliAuthError(raw, provider)) return toReasonClassification("auth");
	if (isCliSessionExpiredErrorMessage(raw)) return toReasonClassification("session_expired");
	if (isModelNotFoundErrorMessage(raw)) return toReasonClassification("model_not_found");
	const legacyProviderReason = classifyLegacyProviderSpecificError({
		errorMessage: raw,
		provider
	});
	if (legacyProviderReason) return toReasonClassification(legacyProviderReason);
	if (isContextOverflowErrorFromTables(raw)) return { kind: "context_overflow" };
	if (isReplayInvalidErrorMessage(raw)) return toReasonClassification("format");
	const reasonFrom402Text = classifyFailoverReasonFrom402Text(raw);
	if (reasonFrom402Text) return toReasonClassification(reasonFrom402Text);
	if (extractLeadingHttpStatus(raw.trim())?.code !== 429 && isBillingErrorMessage(raw)) return toReasonClassification("billing");
	if (isPeriodicUsageLimitErrorMessage(raw)) return toReasonClassification(isBillingErrorMessage(raw) ? "billing" : "rate_limit");
	if (GENERIC_MODEL_NOT_FOUND_RE.test(raw)) return toReasonClassification("model_not_found");
	if (isRateLimitErrorMessage(raw)) return toReasonClassification("rate_limit");
	if (isOverloadedErrorMessage(raw)) return toReasonClassification("overloaded");
	if (isProviderCompletedErrorFinishReasonMessage(raw)) return toReasonClassification("server_error");
	if (isStructuredServerErrorMessage(raw) && !isBillingErrorMessage(raw) && !isAuthPermanentErrorMessage(raw) && !isAuthErrorMessage(raw)) return toReasonClassification("server_error");
	if (isTransientHttpError(raw)) {
		if (extractLeadingHttpStatus(raw.trim())?.code === 529) return toReasonClassification("overloaded");
		return toReasonClassification("timeout");
	}
	if (isGenericProviderInternalError(raw)) return toReasonClassification("timeout");
	if (classifyOAuthRefreshFailure(raw)?.reason) return toReasonClassification("auth_permanent");
	if (isAuthPermanentErrorMessage(raw)) return toReasonClassification("auth_permanent");
	if (isAuthErrorMessage(raw)) return toReasonClassification("auth");
	if (isGenericUnknownStreamErrorMessage(raw)) return toReasonClassification("timeout");
	if (isServerErrorMessage(raw)) return toReasonClassification("timeout");
	if (isJsonApiInternalServerError(raw)) return toReasonClassification("timeout");
	if (isCloudCodeAssistFormatError(raw)) return toReasonClassification("format");
	if (isExactUnknownNoDetailsError(raw)) return toReasonClassification("no_error_details");
	if (isTimeoutErrorMessage(raw)) return toReasonClassification("timeout");
	const apiErrorReason = classifyCoreFailoverReasonFromErrorType(parseApiErrorInfo(raw)?.type);
	if (apiErrorReason) return toReasonClassification(apiErrorReason);
	return null;
}
function classificationReason(classification) {
	return classification?.kind === "reason" ? classification.reason : void 0;
}
function classifyFailoverDetailCandidates(details, provider) {
	for (const detail of details ?? []) {
		const classification = classifyFailoverClassificationFromMessage(detail, provider);
		if (classification) return classification;
	}
	return null;
}
function mergeMessageAndDetailClassification(messageClassification, detailClassification) {
	if (!messageClassification) return detailClassification;
	if (!detailClassification) return messageClassification;
	if (messageClassification.kind === "context_overflow") return messageClassification;
	if (detailClassification.kind === "context_overflow") return detailClassification;
	if (classificationReason(detailClassification) === "billing" && classificationReason(messageClassification) === "rate_limit") return detailClassification;
	return classificationReason(messageClassification) === "format" ? detailClassification : messageClassification;
}
function classifyFailoverSignal(signal, opts) {
	const inferredStatus = inferSignalStatus(signal);
	const explicitStatus = typeof signal.status === "number" && Number.isFinite(signal.status) ? signal.status : void 0;
	const messageClassification = signal.message ? classifyFailoverClassificationFromMessage(signal.message, signal.provider) : null;
	const messageOrDetailClassification = mergeMessageAndDetailClassification(messageClassification, classifyFailoverDetailCandidates(signal.details, signal.provider));
	const errorTypeClassification = classifyFailoverClassificationFromErrorType(signal.errorType);
	const providerHookStatus = explicitStatus ?? (signal.provider && (inferredStatus === 401 || inferredStatus === 403 || inferredStatus === 429) ? inferredStatus : void 0);
	const hasProviderHookSignal = Boolean(signal.message || signal.code || signal.errorType || typeof inferredStatus === "number");
	const hasStructuredDescriptor = providerHookStatus !== void 0 || signal.code !== void 0 || signal.errorType !== void 0;
	const hasContextCandidate = Boolean(signal.message && looksLikeProviderContextOverflowCandidate(signal.message));
	const providerPluginReason = hasProviderHookSignal && (hasStructuredDescriptor || hasContextCandidate || !messageClassification) ? classifyProviderPluginError({
		errorMessage: signal.message ?? "",
		provider: signal.provider,
		status: providerHookStatus,
		code: signal.code,
		errorType: signal.errorType,
		providerPlugin: opts?.providerPlugin
	}) : null;
	const tlsCertificateError = inspectTlsCertificateError(signal);
	if (!providerPluginReason && tlsCertificateError && inferredStatus === void 0) return toReasonClassification("tls_certificate");
	if (!providerPluginReason && signal.message && isTransportHtmlErrorStatus(inferredStatus) && isHtmlErrorResponse(signal.message, inferredStatus)) return classifyFailoverClassificationFromHttpStatus(inferredStatus, void 0, null, signal.status, signal.provider) ?? toReasonClassification("timeout"); // upstream-5xx-fallback-v1
	const codeReason = classifyFailoverReasonFromCode(signal.code);
	const effectiveMessageClassification = providerPluginReason ? toPluginClassification(providerPluginReason) : mergeMessageAndDetailClassification(messageOrDetailClassification ?? errorTypeClassification, codeReason ? toReasonClassification(codeReason) : null);
	if (codeReason === "auth_permanent") return toReasonClassification(codeReason);
	const statusClassification = classifyFailoverClassificationFromHttpStatus(inferredStatus, signal.message, effectiveMessageClassification, signal.status, signal.provider, { preserveProviderSignalClassification: providerPluginReason !== null });
	if (statusClassification) return statusClassification;
	if (codeReason) return toReasonClassification(codeReason);
	return effectiveMessageClassification;
}
function isCloudCodeAssistFormatError(raw) {
	return !isImageDimensionErrorMessage(raw) && matchesFormatErrorPattern(raw);
}
const API_ERROR_TRANSIENT_SIGNALS_RE = /internal server error|overload|temporarily unavailable|service unavailable|unknown error|server error|bad gateway|gateway timeout|upstream error|backend error|try again later|temporarily.+unable|unexpected error/i;
function isJsonApiInternalServerError(raw) {
	if (!raw) return false;
	if (!normalizeLowercaseStringOrEmpty(raw).includes("\"type\":\"api_error\"")) return false;
	if (isBillingErrorMessage(raw) || isAuthErrorMessage(raw) || isAuthPermanentErrorMessage(raw)) return false;
	return API_ERROR_TRANSIENT_SIGNALS_RE.test(raw);
}
function isStructuredServerErrorMessage(raw) {
	if (!raw) return false;
	const parsedType = normalizeOptionalLowercaseString(parseApiErrorInfo(raw)?.type);
	if (parsedType === "server_error" || parsedType === "upstream_error") return true;
	const value = normalizeLowercaseStringOrEmpty(raw);
	return value.includes("\"type\":\"server_error\"") || value.includes("\"code\":\"server_error\"") || value.includes("\"type\":\"upstream_error\"") || value.includes("\"code\":\"upstream_error\"");
}
function isCliSessionExpiredErrorMessage(raw) {
	return /\b(?:session (?:not found|does not exist|expired|invalid)|conversation (?:not found|does not exist|expired|invalid)|no conversation found|no such session|invalid session|(?:session|conversation) id not found)\b/.test(normalizeLowercaseStringOrEmpty(raw));
}
function classifyFailoverReason(raw, opts) {
	return failoverReasonFromClassification(classifyFailoverSignal({
		message: raw,
		provider: opts?.provider
	}, opts));
}
function isFailoverErrorMessage(raw, opts) {
	return classifyFailoverReason(raw, opts) !== null;
}
//#endregion
export { isContextOverflowError as a, isReasoningConstraintErrorMessage as c, isExactUnknownNoDetailsError as d, isUnclassifiedNoBodyHttpSignal as f, isFailoverErrorMessage as i, failoverReasonFromClassification as l, parseImageSizeError as m, classifyFailoverSignal as n, isContextOverflowErrorFromTables as o, parseImageDimensionError as p, isCloudCodeAssistFormatError as r, isLikelyContextOverflowError as s, classifyFailoverReason as t, inferSignalStatus as u };
