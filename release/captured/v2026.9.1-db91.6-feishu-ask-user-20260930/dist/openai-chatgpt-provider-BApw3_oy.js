import { g as readStringValue, o as normalizeLowercaseStringOrEmpty } from "./string-coerce-CIXf7egm.js";
import { b as uniqueValues } from "./string-normalization-DiSb4JeN.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import "./defaults-CdX9UGcX.js";
import "./persisted-DzIu-muU.js";
import { i as normalizeModelCompat } from "./provider-model-compat-C3R5Y-Pj.js";
import { o as findCatalogTemplate } from "./provider-catalog-BBF6IcEG.js";
import { m as resolveOpenAICodexAuthIdentity } from "./provider-auth-BSTUvZrs.js";
import { t as buildOauthProviderAuthResult } from "./provider-auth-result-BJQq6asp.js";
import "./error-runtime-BmBsU1OI.js";
import "./string-coerce-runtime-GQa0ehRA.js";
import { d as normalizeProviderId, m as matchesExactOrPrefix, p as cloneFirstTemplateModel } from "./provider-model-shared-DhQU-DEE.js";
import { a as isOpenAIApiBaseUrl, n as OPENAI_CODEX_RESPONSES_BASE_URL, o as isOpenAICodexBaseUrl } from "./base-url-DVAaAeRo.js";
import { t as OPENAI_CODEX_DEFAULT_MODEL } from "./default-models-Dn67kTkm.js";
import { n as buildOpenAIResponsesProviderHooks, r as buildOpenAISyntheticCatalogEntry, t as OPENAI_DEFAULT_RUNTIME_CONTEXT_TOKENS } from "./shared-Case4zjK.js";
import { a as OPENAI_GPT_54_MINI_MODEL_ID, c as OPENAI_GPT_54_PRO_MODEL_ID, h as OPENAI_GPT_56_VARIANT_MODEL_IDS, l as OPENAI_GPT_55_MODEL_ID, o as OPENAI_GPT_54_MODEL_ID, t as OPENAI_CHATGPT_MODERN_MODEL_IDS, u as OPENAI_GPT_55_PRO_MODEL_ID } from "./model-route-contract-B2Q_03Gg.js";
import { t as resolveOpenAICodexThinkingProfile } from "./thinking-policy-CswKYMBU.js";
import { n as resolveOpenAIUsageAuth, t as fetchOpenAIUsage } from "./usage-C4hKzLds.js";
//#region extensions/openai/openai-chatgpt-provider.ts
const PROVIDER_ID = "openai";
const OPENAI_CODEX_BASE_URL = OPENAI_CODEX_RESPONSES_BASE_URL;
const OPENAI_CODEX_GPT_56_THINKING_LEVEL_MAP = {
	off: null,
	xhigh: "xhigh",
	max: "max"
};
const OPENAI_CODEX_GPT_56_NATIVE_CONTEXT_TOKENS = 372e3;
const OPENAI_CODEX_GPT_55_CODEX_CONTEXT_TOKENS = 4e5;
const OPENAI_CODEX_GPT_55_PRO_NATIVE_CONTEXT_TOKENS = 1e6;
const OPENAI_CODEX_GPT_54_NATIVE_CONTEXT_TOKENS = 105e4;
const OPENAI_CODEX_GPT_54_MINI_NATIVE_CONTEXT_TOKENS = 4e5;
const OPENAI_CODEX_GPT_53_SPARK_CONTEXT_TOKENS = 128e3;
const OPENAI_CODEX_GPT_54_MAX_TOKENS = 128e3;
const OPENAI_CODEX_GPT_55_PRO_COST = {
	input: 30,
	output: 180,
	cacheRead: 0,
	cacheWrite: 0
};
const OPENAI_CODEX_GPT_54_COST = {
	input: 2.5,
	output: 15,
	cacheRead: .25,
	cacheWrite: 0
};
const OPENAI_CODEX_GPT_54_PRO_COST = {
	input: 30,
	output: 180,
	cacheRead: 0,
	cacheWrite: 0
};
const OPENAI_CODEX_GPT_54_MINI_COST = {
	input: .75,
	output: 4.5,
	cacheRead: .075,
	cacheWrite: 0
};
const OPENAI_CODEX_GPT_54_TEMPLATE_MODEL_IDS = ["gpt-5.3-codex"];
/** Legacy codex rows first; fall back to catalog `gpt-5.4` when the API omits 5.3/5.2. */
const OPENAI_CODEX_GPT_54_CATALOG_SYNTH_TEMPLATE_MODEL_IDS = [...OPENAI_CODEX_GPT_54_TEMPLATE_MODEL_IDS, OPENAI_GPT_54_MODEL_ID];
const OPENAI_CODEX_GPT_55_PRO_TEMPLATE_MODEL_IDS = [
	OPENAI_GPT_54_MODEL_ID,
	OPENAI_GPT_54_PRO_MODEL_ID,
	...OPENAI_CODEX_GPT_54_TEMPLATE_MODEL_IDS
];
const OPENAI_CODEX_IMAGE_CAPABLE_MODEL_IDS = [
	...OPENAI_GPT_56_VARIANT_MODEL_IDS,
	OPENAI_GPT_55_MODEL_ID,
	OPENAI_GPT_55_PRO_MODEL_ID,
	OPENAI_GPT_54_MODEL_ID,
	OPENAI_GPT_54_PRO_MODEL_ID,
	OPENAI_GPT_54_MINI_MODEL_ID
];
function isOpenAIOrLegacyCodexProvider(provider) {
	return normalizeProviderId(provider ?? "") === PROVIDER_ID;
}
function isLegacyCodexCompatBaseUrl(baseUrl) {
	const trimmed = baseUrl?.trim();
	return trimmed !== void 0 && /^https?:\/\/api\.githubcopilot\.com(?:\/v1)?\/?$/iu.test(trimmed);
}
function normalizeCodexTransportFields(params) {
	const useCodexTransport = !params.baseUrl || isOpenAIApiBaseUrl(params.baseUrl) || isOpenAICodexBaseUrl(params.baseUrl) || isLegacyCodexCompatBaseUrl(params.baseUrl);
	const api = useCodexTransport && (!params.api || params.api === "openai-responses" || params.api === "openai-completions") ? "openai-chatgpt-responses" : params.api ?? void 0;
	return {
		api,
		baseUrl: api === "openai-chatgpt-responses" && useCodexTransport ? OPENAI_CODEX_BASE_URL : params.baseUrl
	};
}
function hasImageInput(input) {
	return Array.isArray(input) && input.includes("image");
}
function matchesOpenAICodexImageCapableModel(modelId, modelName) {
	return [modelId, modelName].filter((value) => typeof value === "string").some((candidate) => matchesExactOrPrefix(candidate, OPENAI_CODEX_IMAGE_CAPABLE_MODEL_IDS));
}
/**
* Restore native `["text", "image"]` input capability on resolved Codex rows
* for known image-capable modern model IDs (GPT-5.4 through GPT-5.6).
* Persisted/configured model rows can omit the `input` field
* entirely when they were written by older OpenClaw versions. When that row wins
* the catalog merge, `modelSupportsInput(entry, "image")` returns false and the
* gateway's `chat.send` handler offloads inbound images as `media://inbound/<id>`
* claim-check URIs instead of inlining them.
*
* Mirrors the Anthropic precedent set by upstream #83756.
*/
function applyOpenAICodexImageInputCapability(params) {
	if (hasImageInput(params.model.input)) return;
	if (!matchesOpenAICodexImageCapableModel(params.modelId, params.model.name)) return;
	return {
		...params.model,
		input: ["text", "image"]
	};
}
function normalizeCodexTransport(model) {
	const canonicalModelId = normalizeLowercaseStringOrEmpty(model.id) === "gpt-5.4-codex" ? OPENAI_GPT_54_MODEL_ID : model.id;
	const canonicalName = normalizeLowercaseStringOrEmpty(model.name) === "gpt-5.4-codex" ? OPENAI_GPT_54_MODEL_ID : model.name;
	const normalizedTransport = normalizeCodexTransportFields({
		api: model.api,
		baseUrl: model.baseUrl
	});
	const api = normalizedTransport.api ?? model.api;
	const baseUrl = normalizedTransport.baseUrl ?? model.baseUrl;
	if (api === model.api && baseUrl === model.baseUrl && canonicalModelId === model.id && canonicalName === model.name) return model;
	return {
		...model,
		id: canonicalModelId,
		name: canonicalName,
		api,
		baseUrl
	};
}
function resolveCodexForwardCompatModel(ctx) {
	const trimmedModelId = ctx.modelId.trim();
	const lower = normalizeLowercaseStringOrEmpty(trimmedModelId);
	const synthBaseUrl = ctx.providerConfig?.baseUrl ?? OPENAI_CODEX_BASE_URL;
	// v91-gpt6-sol-luna-v1
	if (lower === "gpt-6-sol") return normalizeModelCompat({
		id: trimmedModelId, name: "GPT-6 Sol", provider: PROVIDER_ID,
		api: "openai-chatgpt-responses", baseUrl: synthBaseUrl,
		reasoning: true, input: ["text", "image"],
		contextWindow: 1050000, contextTokens: 272000, maxTokens: 128000,
		cost: {input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5},
		thinkingLevelMap: {off: "low", minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max"},
		compat: {supportsTemperature: false, supportsReasoningEffort: true,
			supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"], codeMode: "preferred"}
	});
	if (lower === "gpt-6-luna") return normalizeModelCompat({
		id: trimmedModelId, name: "GPT-6 Luna", provider: PROVIDER_ID,
		api: "openai-chatgpt-responses", baseUrl: synthBaseUrl,
		reasoning: true, input: ["text", "image"],
		contextWindow: 1050000, contextTokens: 272000, maxTokens: 128000,
		cost: {input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125},
		thinkingLevelMap: {off: "low", minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max"},
		compat: {supportsTemperature: false, supportsReasoningEffort: true,
			supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"], codeMode: "preferred"}
	});
	// vlab-astra-subscription-model-v1
	if (lower === "gpt-6-astra") return normalizeModelCompat({
		id: trimmedModelId, name: "GPT-6 Astra", provider: PROVIDER_ID,
		api: "openai-chatgpt-responses", baseUrl: synthBaseUrl,
		reasoning: true, input: ["text", "image"],
		contextWindow: 1050000, contextTokens: 272000, maxTokens: 128000,
		cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0},
		thinkingLevelMap: {off: "low", minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max"},
		compat: {supportsTemperature: false, supportsReasoningEffort: true,
			supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"], codeMode: "preferred"}
	});
	if (OPENAI_GPT_56_VARIANT_MODEL_IDS.some((modelId) => modelId === lower)) {
		const registeredModel = withDefaultCodexContextMetadata({
			model: withCodexTransport(ctx.modelRegistry.find(PROVIDER_ID, trimmedModelId), synthBaseUrl),
			contextWindow: OPENAI_CODEX_GPT_56_NATIVE_CONTEXT_TOKENS,
			contextTokens: OPENAI_DEFAULT_RUNTIME_CONTEXT_TOKENS
		});
		if (registeredModel) return normalizeModelCompat({
			...registeredModel,
			thinkingLevelMap: {
				...OPENAI_CODEX_GPT_56_THINKING_LEVEL_MAP,
				...registeredModel.thinkingLevelMap
			}
		});
		return normalizeModelCompat({
			id: trimmedModelId,
			name: trimmedModelId,
			api: "openai-chatgpt-responses",
			provider: PROVIDER_ID,
			baseUrl: synthBaseUrl,
			reasoning: true,
			input: ["text", "image"],
			cost: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0
			},
			contextWindow: OPENAI_CODEX_GPT_56_NATIVE_CONTEXT_TOKENS,
			contextTokens: OPENAI_DEFAULT_RUNTIME_CONTEXT_TOKENS,
			maxTokens: OPENAI_CODEX_GPT_54_MAX_TOKENS,
			thinkingLevelMap: OPENAI_CODEX_GPT_56_THINKING_LEVEL_MAP
		});
	}
	if (lower === "gpt-5.5") return withDefaultCodexContextMetadata({
		model: withCodexTransport(ctx.modelRegistry.find(PROVIDER_ID, trimmedModelId), synthBaseUrl),
		contextWindow: OPENAI_CODEX_GPT_55_CODEX_CONTEXT_TOKENS,
		contextTokens: 272e3
	}) ?? normalizeModelCompat({
		id: trimmedModelId,
		name: trimmedModelId,
		api: "openai-chatgpt-responses",
		provider: PROVIDER_ID,
		baseUrl: synthBaseUrl,
		reasoning: true,
		input: ["text", "image"],
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0
		},
		contextWindow: OPENAI_CODEX_GPT_55_CODEX_CONTEXT_TOKENS,
		contextTokens: 272e3,
		maxTokens: OPENAI_CODEX_GPT_54_MAX_TOKENS
	});
	let templateIds;
	let patch;
	if (lower === "gpt-5.5-pro") {
		templateIds = OPENAI_CODEX_GPT_55_PRO_TEMPLATE_MODEL_IDS;
		patch = {
			contextWindow: OPENAI_CODEX_GPT_55_PRO_NATIVE_CONTEXT_TOKENS,
			contextTokens: OPENAI_DEFAULT_RUNTIME_CONTEXT_TOKENS,
			maxTokens: OPENAI_CODEX_GPT_54_MAX_TOKENS,
			cost: OPENAI_CODEX_GPT_55_PRO_COST
		};
	} else if (lower === "gpt-5.4" || lower === "gpt-5.4-codex") {
		templateIds = OPENAI_CODEX_GPT_54_CATALOG_SYNTH_TEMPLATE_MODEL_IDS;
		patch = {
			contextWindow: OPENAI_CODEX_GPT_54_NATIVE_CONTEXT_TOKENS,
			contextTokens: OPENAI_DEFAULT_RUNTIME_CONTEXT_TOKENS,
			maxTokens: OPENAI_CODEX_GPT_54_MAX_TOKENS,
			cost: OPENAI_CODEX_GPT_54_COST
		};
	} else if (lower === "gpt-5.4-pro") {
		templateIds = OPENAI_CODEX_GPT_54_CATALOG_SYNTH_TEMPLATE_MODEL_IDS;
		patch = {
			contextWindow: OPENAI_CODEX_GPT_54_NATIVE_CONTEXT_TOKENS,
			contextTokens: OPENAI_DEFAULT_RUNTIME_CONTEXT_TOKENS,
			maxTokens: OPENAI_CODEX_GPT_54_MAX_TOKENS,
			cost: OPENAI_CODEX_GPT_54_PRO_COST
		};
	} else if (lower === "gpt-5.4-mini") {
		templateIds = OPENAI_CODEX_GPT_54_CATALOG_SYNTH_TEMPLATE_MODEL_IDS;
		patch = {
			contextWindow: OPENAI_CODEX_GPT_54_MINI_NATIVE_CONTEXT_TOKENS,
			contextTokens: OPENAI_DEFAULT_RUNTIME_CONTEXT_TOKENS,
			maxTokens: OPENAI_CODEX_GPT_54_MAX_TOKENS,
			cost: OPENAI_CODEX_GPT_54_MINI_COST
		};
	} else if (lower === "gpt-5.3-codex-spark") {
		templateIds = OPENAI_CODEX_GPT_54_CATALOG_SYNTH_TEMPLATE_MODEL_IDS;
		patch = {
			input: ["text"],
			contextWindow: OPENAI_CODEX_GPT_53_SPARK_CONTEXT_TOKENS,
			contextTokens: OPENAI_CODEX_GPT_53_SPARK_CONTEXT_TOKENS,
			maxTokens: OPENAI_CODEX_GPT_54_MAX_TOKENS,
			cost: OPENAI_CODEX_GPT_54_MINI_COST
		};
	} else if (ctx.agentRuntimeId === "codex" && ctx.authProfileId === void 0 && ctx.authProfileMode === void 0 && ctx.providerConfig?.auth === void 0) {
		templateIds = OPENAI_GPT_56_VARIANT_MODEL_IDS;
		patch = {
			reasoning: true,
			input: ["text", "image"],
			thinkingLevelMap: OPENAI_CODEX_GPT_56_THINKING_LEVEL_MAP,
			compat: {
				supportsReasoningEffort: true,
				supportedReasoningEfforts: [
					"low",
					"medium",
					"high",
					"xhigh",
					"max"
				]
			}
		};
	} else return;
	patch = {
		...patch,
		api: "openai-chatgpt-responses",
		baseUrl: synthBaseUrl
	};
	return cloneFirstTemplateModel({
		providerId: PROVIDER_ID,
		modelId: lower === "gpt-5.4-codex" ? "gpt-5.4" : trimmedModelId,
		templateIds,
		ctx,
		patch
	}) ?? normalizeModelCompat({
		id: lower === "gpt-5.4-codex" ? "gpt-5.4" : trimmedModelId,
		name: lower === "gpt-5.4-codex" ? "gpt-5.4" : trimmedModelId,
		api: "openai-chatgpt-responses",
		provider: PROVIDER_ID,
		baseUrl: synthBaseUrl,
		reasoning: true,
		input: patch?.input ?? ["text", "image"],
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0
		},
		contextWindow: patch?.contextWindow ?? 2e5,
		contextTokens: patch?.contextTokens,
		maxTokens: patch?.maxTokens ?? 2e5,
		...patch?.thinkingLevelMap ? { thinkingLevelMap: patch.thinkingLevelMap } : {},
		...patch?.compat ? { compat: patch.compat } : {}
	});
}
function withDefaultCodexContextMetadata(params) {
	if (!params.model) return;
	const contextTokens = typeof params.model.contextTokens === "number" ? params.model.contextTokens : typeof params.model.contextWindow === "number" && params.model.contextWindow > 0 ? Math.min(params.contextTokens, params.model.contextWindow) : params.contextTokens;
	const input = params.model.input?.includes("image") ? params.model.input : uniqueValues([...params.model.input ?? ["text"], "image"]);
	return {
		...params.model,
		input,
		contextWindow: params.contextWindow,
		contextTokens
	};
}
function withCodexTransport(model, baseUrl) {
	if (!model) return;
	return normalizeModelCompat({
		...model,
		api: "openai-chatgpt-responses",
		baseUrl
	});
}
function buildCodexCredentialExtra(identity) {
	const extra = {
		...identity.accountId ? { accountId: identity.accountId } : {},
		...identity.chatgptPlanType ? { chatgptPlanType: identity.chatgptPlanType } : {}
	};
	return Object.keys(extra).length > 0 ? extra : void 0;
}
function buildOpenAICodexAuthConfigPatch() {
	return { agents: { defaults: { models: { [OPENAI_CODEX_DEFAULT_MODEL]: {} } } } };
}
async function refreshOpenAICodexOAuthCredential(cred) {
	try {
		const { refreshOpenAICodexToken } = await import("./extensions/openai/openai-chatgpt-provider.runtime.js");
		const refreshed = await refreshOpenAICodexToken(cred.refresh);
		const identity = resolveOpenAICodexAuthIdentity({
			access: refreshed.access,
			email: cred.email
		});
		return {
			...cred,
			...refreshed,
			type: "oauth",
			provider: PROVIDER_ID,
			email: identity.email ?? cred.email,
			displayName: cred.displayName,
			...buildCodexCredentialExtra(identity)
		};
	} catch (error) {
		const message = formatErrorMessage(error);
		if (/extract\s+accountid\s+from\s+token/i.test(message) && typeof cred.access === "string" && cred.access.trim().length > 0) return cred;
		throw error;
	}
}
async function runOpenAICodexOAuth(ctx) {
	const { loginOpenAICodexOAuth } = await import("./extensions/openai/openai-chatgpt-oauth.runtime.js");
	const creds = await loginOpenAICodexOAuth({
		prompter: ctx.prompter,
		runtime: ctx.runtime,
		oauth: ctx.oauth,
		isRemote: ctx.isRemote,
		openUrl: ctx.openUrl,
		signal: ctx.signal,
		onManualCodeInput: ctx.onManualCodeInput,
		localBrowserMessage: "Complete sign-in in browser…"
	});
	if (!creds) return { profiles: [] };
	const identity = resolveOpenAICodexAuthIdentity({
		access: creds.access,
		email: readStringValue(creds.email)
	});
	return buildOauthProviderAuthResult({
		providerId: PROVIDER_ID,
		defaultModel: OPENAI_CODEX_DEFAULT_MODEL,
		configPatch: buildOpenAICodexAuthConfigPatch(),
		access: creds.access,
		refresh: creds.refresh,
		expires: creds.expires,
		email: identity.email,
		profileName: identity.profileName,
		credentialExtra: buildCodexCredentialExtra(identity)
	});
}
async function runOpenAICodexDeviceCode(ctx) {
	const spin = ctx.prompter.progress("Starting device code flow…");
	try {
		const { loginOpenAICodexDeviceCode } = await import("./extensions/openai/openai-chatgpt-device-code.js");
		const creds = await loginOpenAICodexDeviceCode({
			...ctx.signal ? { signal: ctx.signal } : {},
			onProgress: (message) => spin.update(message),
			onVerification: async ({ verificationUrl, userCode, expiresInMs }) => {
				const expiresInMinutes = Math.max(1, Math.round(expiresInMs / 6e4));
				const deviceCodeMessage = [ctx.isRemote ? "Open this URL in your LOCAL browser and enter the code below." : "Open this URL in your browser and enter the code below.", `URL: ${verificationUrl}`].join("\n");
				if (ctx.isRemote) await ctx.openUrl(verificationUrl);
				if (ctx.prompter.deviceCode) await ctx.prompter.deviceCode({
					title: "OpenAI Codex device code",
					code: userCode,
					expiresInMinutes,
					message: deviceCodeMessage
				});
				else await ctx.prompter.note([
					deviceCodeMessage,
					`Code: ${userCode}`,
					`Code expires in ${expiresInMinutes} minutes. Never share it.`
				].join("\n"), "OpenAI Codex device code");
				if (ctx.isRemote) {
					ctx.runtime.log(`\nOpen this URL in your LOCAL browser:\n\n${verificationUrl}\n`);
					return;
				}
				try {
					await ctx.openUrl(verificationUrl);
					ctx.runtime.log(`Open: ${verificationUrl}`);
				} catch {
					ctx.runtime.log(`Open manually: ${verificationUrl}`);
				}
			}
		});
		spin.stop("OpenAI device code complete");
		const identity = resolveOpenAICodexAuthIdentity({ access: creds.access });
		return buildOauthProviderAuthResult({
			providerId: PROVIDER_ID,
			defaultModel: OPENAI_CODEX_DEFAULT_MODEL,
			configPatch: buildOpenAICodexAuthConfigPatch(),
			access: creds.access,
			refresh: creds.refresh,
			expires: creds.expires,
			email: identity.email,
			profileName: identity.profileName,
			credentialExtra: buildCodexCredentialExtra(identity)
		});
	} catch (error) {
		spin.stop("OpenAI device code failed");
		ctx.runtime.error(formatErrorMessage(error));
		await ctx.prompter.note("Trouble with device code login? See https://docs.openclaw.ai/start/faq", "OAuth help");
		throw error;
	}
}
function buildOpenAICodexAuthDoctorHint(ctx) {
	if (ctx.profileId !== "openai:codex-cli") return;
	return "Deprecated profile. Run `openclaw models auth login --provider openai` or `openclaw configure`.";
}
function buildOpenAIChatGPTAuthMethodRuns() {
	return {
		oauth: async (ctx) => await runOpenAICodexOAuth(ctx),
		"device-code": async (ctx) => await runOpenAICodexDeviceCode(ctx)
	};
}
function buildOpenAICodexProviderHooks() {
	return {
		resolveDynamicModel: (ctx) => resolveCodexForwardCompatModel(ctx),
		buildAuthDoctorHint: (ctx) => buildOpenAICodexAuthDoctorHint(ctx),
		resolveThinkingProfile: ({ modelId, agentRuntime, api, compat }) => resolveOpenAICodexThinkingProfile(modelId, agentRuntime, compat, api),
		isModernModelRef: ({ modelId }) => matchesExactOrPrefix(modelId, OPENAI_CHATGPT_MODERN_MODEL_IDS),
		preferRuntimeResolvedModel: (ctx) => {
			if (!isOpenAIOrLegacyCodexProvider(ctx.provider)) return false;
			const id = ctx.modelId.trim().toLowerCase();
			return OPENAI_CHATGPT_MODERN_MODEL_IDS.some((modelId) => modelId === id);
		},
		...buildOpenAIResponsesProviderHooks(),
		resolveReasoningOutputMode: () => "native",
		normalizeResolvedModel: (ctx) => {
			if (!isOpenAIOrLegacyCodexProvider(ctx.provider)) return;
			const transportNormalized = normalizeCodexTransport(ctx.model);
			const imageCapable = applyOpenAICodexImageInputCapability({
				modelId: ctx.modelId,
				model: transportNormalized
			}) ?? transportNormalized;
			return imageCapable === ctx.model ? void 0 : imageCapable;
		},
		normalizeTransport: ({ provider, api, baseUrl }) => {
			if (!isOpenAIOrLegacyCodexProvider(provider)) return;
			const normalized = normalizeCodexTransportFields({
				api,
				baseUrl
			});
			if (normalized.api === api && normalized.baseUrl === baseUrl) return;
			return normalized;
		},
		resolveUsageAuth: resolveOpenAIUsageAuth,
		fetchUsageSnapshot: fetchOpenAIUsage,
		refreshOAuth: async (cred) => await refreshOpenAICodexOAuthCredential(cred),
		augmentModelCatalog: (ctx) => {
			const gpt54Template = findCatalogTemplate({
				entries: ctx.entries,
				providerId: PROVIDER_ID,
				templateIds: OPENAI_CODEX_GPT_54_CATALOG_SYNTH_TEMPLATE_MODEL_IDS
			});
			const gpt55ProTemplate = findCatalogTemplate({
				entries: ctx.entries,
				providerId: PROVIDER_ID,
				templateIds: OPENAI_CODEX_GPT_55_PRO_TEMPLATE_MODEL_IDS
			});
			return [
				buildOpenAISyntheticCatalogEntry(gpt55ProTemplate, {
					id: OPENAI_GPT_55_PRO_MODEL_ID,
					reasoning: true,
					input: ["text", "image"],
					contextWindow: OPENAI_CODEX_GPT_55_PRO_NATIVE_CONTEXT_TOKENS,
					contextTokens: OPENAI_DEFAULT_RUNTIME_CONTEXT_TOKENS,
					cost: OPENAI_CODEX_GPT_55_PRO_COST
				}),
				buildOpenAISyntheticCatalogEntry(gpt54Template, {
					id: OPENAI_GPT_54_MODEL_ID,
					reasoning: true,
					input: ["text", "image"],
					contextWindow: OPENAI_CODEX_GPT_54_NATIVE_CONTEXT_TOKENS,
					contextTokens: OPENAI_DEFAULT_RUNTIME_CONTEXT_TOKENS,
					cost: OPENAI_CODEX_GPT_54_COST
				}),
				buildOpenAISyntheticCatalogEntry(gpt54Template, {
					id: OPENAI_GPT_54_PRO_MODEL_ID,
					reasoning: true,
					input: ["text", "image"],
					contextWindow: OPENAI_CODEX_GPT_54_NATIVE_CONTEXT_TOKENS,
					contextTokens: OPENAI_DEFAULT_RUNTIME_CONTEXT_TOKENS,
					cost: OPENAI_CODEX_GPT_54_PRO_COST
				}),
				buildOpenAISyntheticCatalogEntry(gpt54Template, {
					id: OPENAI_GPT_54_MINI_MODEL_ID,
					reasoning: true,
					input: ["text", "image"],
					contextWindow: OPENAI_CODEX_GPT_54_MINI_NATIVE_CONTEXT_TOKENS,
					contextTokens: OPENAI_DEFAULT_RUNTIME_CONTEXT_TOKENS,
					cost: OPENAI_CODEX_GPT_54_MINI_COST
				})
			].filter((entry) => entry !== void 0);
		}
	};
}
//#endregion
export { buildOpenAICodexProviderHooks as n, buildOpenAIChatGPTAuthMethodRuns as t };
