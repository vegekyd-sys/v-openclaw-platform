import { o as asDateTimestampMs } from "./number-coercion-CLj0HTDM.js";
import { l as normalizeOptionalString, o as normalizeLowercaseStringOrEmpty } from "./string-coerce-CIXf7egm.js";
import { m as shortenHomePath } from "./utils-D3A1hGii.js";
import { s as coerceSecretRef } from "./types.secrets-kC0nOetj.js";
import { u as resolveAgentDir } from "./agent-scope-config-CUiGBd59.js";
import { c as normalizeProviderId } from "./model-ref-shared-Dz7QU0Lx.js";
import { t as modelKey } from "./model-key-CMdQNkZf.js";
import { f as parseConfiguredModelVisibilityEntries, l as isModelKeyAllowedBySet, r as buildConfiguredModelCatalog, y as resolveModelRefFromString } from "./model-selection-shared-BUMiYTyL.js";
import { A as resolveSessionAuthProfileOverrideSource } from "./agent-scope-CSlN0kZb.js";
import { t as findNormalizedProviderValue } from "./model-selection-normalize-D1HuPOqZ.js";
import { n as resolveAuthStorePathForDisplay } from "./paths-C4SynZrk.js";
import { t as resolveAgentHarnessPolicy } from "./policy-DLijLMMe.js";
import { a as enqueueSystemEvent } from "./system-events-GfU3KOHp.js";
import { r as ensureAuthProfileStore } from "./store-CZzbMlii.js";
import { o as isProfileInCooldown } from "./usage-state-C0QBjJnZ.js";
import { i as resolveAuthProfileOrder, t as isConfiguredAwsSdkAuthProfileForProvider } from "./order-DZ_d3_p5.js";
import { t as resolveEnvApiKey } from "./model-auth-env-CPoZO_2l.js";
import { t as getChannelPlugin } from "./registry-CkcjiYIl.js";
import "./plugins-BssTyOqH.js";
import { f as emitSessionLifecycleEvent } from "./session-history-eviction-d5aiCsHS.js";
import { s as isModelSelectionLocked, t as MODEL_SELECTION_LOCKED_MESSAGE } from "./model-overrides-Bm7jo7Di.js";
import { n as isThinkingLevelSupported, o as resolveSupportedThinkingLevel, t as formatThinkingLevels } from "./thinking-DxxV8Ztb.js";
import { i as resolveSessionRuntimeOverrideForProvider } from "./session-runtime-compat-BmHRQBtd.js";
import { o as resolveEffectiveAgentRuntime } from "./thinking-runtime-CMnVn0Uq.js";
import { t as resolveAuthProfileDisplayLabel } from "./auth-profiles-DvLkLvBr.js";
import { S as resolveUsableCustomProviderApiKey } from "./model-auth-provider-config-6b_JxQon.js";
import "./model-auth-BBgoS_xI.js";
import "./model-selection-DG2dN6VK.js";
import { i as formatFastModeCurrentStatus, r as formatFastModeCommandOptions, s as formatFastModeValue } from "./fast-mode-CCX0YiYh.js";
import { n as resolveSandboxRuntimeStatus } from "./runtime-status-hcw0I7bE.js";
import "./sandbox-ejCqp821.js";
import { t as buildAgentRuntimeAuthPlan } from "./auth-BcBpmum3.js";
import { p as renderExecTargetLabel } from "./bash-tools.exec-runtime-BqKIsnxW.js";
import { t as resolveExecDefaults } from "./exec-defaults-DRtGLLOe.js";
import { t as resolveFastModeState } from "./fast-mode-CGDySgLE.js";
import { c as refreshQueuedFollowupSession, t as resolveQueueSettingsCore } from "./settings-B6dacI0n.js";
import "./queue-CsUB-_ct.js";
import { t as triggerSessionPatchHook } from "./session-patch-hooks-BR_6t2pX.js";
import { t as applyModelOverrideWithAuthProfileCompatibility } from "./auth-profile-preservation-B0RcY8kT.js";
import { t as RUNTIME_MODEL_VISIBILITY_NORMALIZATION } from "./model-visibility-policy-B1zFZD7p.js";
import { t as resolveConfiguredModelEntries } from "./configured-model-entries-BP8dFOoy.js";
import { t as persistStickyModelSelectionBestEffort } from "./sticky-model-selection-DfNCb7JF.js";
import { a as prepareModelSelectionRuntime, s as applyModelRuntimeDirective, t as findSelectedCatalogEntry } from "./model-runtime-normalization-BOTUJuoD.js";
import { _ as maybeHandleUnexpectedNativeDirectiveArguments, a as enqueueModeSwitchEvents, c as formatElevatedUnavailableText, d as formatInternalVerbosePersistenceDeniedText, f as formatModelSelectionScopeAck, g as withOptions, h as resolveDirectiveTouchedSessionFields, i as canPersistSessionDirectiveDefaults, l as formatInternalExecPersistenceDeniedText, m as rejectSessionDirectiveTransaction, n as acknowledgeIgnoredSessionDirective, o as formatDirectiveAck, p as persistSessionDirectiveSnapshot, r as applySessionDirectiveFields, s as formatElevatedRuntimeHint, t as DIRECTIVE_ACK_MESSAGES, u as formatInternalVerboseCurrentReplyOnlyText, v as resolveModelSelectionFromDirective } from "./directive-handling.shared-Uf5jfEUv.js";
import { t as resolveRuntimePolicySessionKey } from "./runtime-policy-session-key-BxXTzM8T.js";
import { i as resolveModelsCommandReply } from "./commands-models-Boygy8-x.js";
import { n as resolveSelectedAndActiveModel } from "./model-runtime-BzIef07I.js";
import { r as formatRemainingShort } from "./auth-health-Hep6zPJl.js";
import { t as maskApiKey } from "./secret-mask-BEdLuCrN.js";
//#region src/auto-reply/reply/directive-handling.auth.ts
function resolveStoredCredentialLabel(params) {
	const masked = maskApiKey(typeof params.value === "string" ? params.value : "");
	if (masked !== "missing") return masked;
	if (coerceSecretRef(params.refValue)) return params.mode === "compact" ? "(ref)" : "ref";
	return "missing";
}
function formatExpirationLabel(expires, now, formatUntil, compactExpiredPrefix = " expired") {
	const timestampMs = asDateTimestampMs(expires);
	if (timestampMs === void 0 || timestampMs <= 0) return "";
	return timestampMs <= now ? compactExpiredPrefix : ` exp ${formatUntil(timestampMs)}`;
}
function formatFlagsSuffix(flags) {
	return flags.length > 0 ? ` (${flags.join(", ")})` : "";
}
function isStoredAuthProfileType(value) {
	return value === "api_key" || value === "oauth" || value === "token";
}
/** Resolves the displayed auth source for a provider without exposing secrets. */
const resolveAuthLabel = async (provider, cfg, modelsPath, agentDir, mode = "compact", workspaceDir, options) => {
	const formatPath = (value) => shortenHomePath(value);
	const store = ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false });
	const rawOrder = resolveAuthProfileOrder({
		cfg,
		store,
		provider
	});
	const acceptedProfileTypes = options?.acceptedProfileTypes ? new Set(options.acceptedProfileTypes) : void 0;
	const order = acceptedProfileTypes ? rawOrder.filter((profileId) => {
		const profile = store.profiles[profileId];
		if (profile) return acceptedProfileTypes.has(profile.type);
		const configuredMode = cfg.auth?.profiles?.[profileId]?.mode;
		return isStoredAuthProfileType(configuredMode) ? acceptedProfileTypes.has(configuredMode) : true;
	}) : rawOrder;
	const providerKey = normalizeProviderId(provider);
	const lastGood = findNormalizedProviderValue(store.lastGood, providerKey);
	const nextProfileId = order[0];
	const now = Date.now();
	const formatUntil = (timestampMs) => formatRemainingShort(timestampMs - now, { underMinuteLabel: "soon" });
	if (order.length > 0) {
		if (mode === "compact") {
			const profileId = nextProfileId;
			if (!profileId) return {
				label: "missing",
				source: "missing"
			};
			const profile = store.profiles[profileId];
			const configProfile = cfg.auth?.profiles?.[profileId];
			const configOnlyAwsSdk = !profile ? isConfiguredAwsSdkAuthProfileForProvider({
				cfg,
				provider,
				profileId
			}) : false;
			const more = order.length > 1 ? ` (+${order.length - 1})` : "";
			if (configOnlyAwsSdk) return {
				label: `${profileId} aws-sdk${more}`,
				source: ""
			};
			if (!profile || configProfile?.provider && configProfile.provider !== profile.provider || configProfile?.mode && configProfile.mode !== profile.type && !(configProfile.mode === "oauth" && profile.type === "token")) return {
				label: `${profileId} missing${more}`,
				source: ""
			};
			if (profile.type === "api_key") return {
				label: `${profileId} api-key ${resolveStoredCredentialLabel({
					value: profile.key,
					refValue: profile.keyRef,
					mode
				})}${more}`,
				source: ""
			};
			if (profile.type === "token") return {
				label: `${profileId} token ${resolveStoredCredentialLabel({
					value: profile.token,
					refValue: profile.tokenRef,
					mode
				})}${formatExpirationLabel(profile.expires, now, formatUntil)}${more}`,
				source: ""
			};
			const display = resolveAuthProfileDisplayLabel({
				cfg,
				store,
				profileId
			});
			return {
				label: `${display === profileId ? profileId : display} oauth${formatExpirationLabel(profile.expires, now, formatUntil)}${more}`,
				source: ""
			};
		}
		return {
			label: order.map((profileId) => {
				const profile = store.profiles[profileId];
				const configProfile = cfg.auth?.profiles?.[profileId];
				const flags = [];
				if (profileId === nextProfileId) flags.push("next");
				if (lastGood && profileId === lastGood) flags.push("lastGood");
				if (isProfileInCooldown(store, profileId)) {
					const until = store.usageStats?.[profileId]?.cooldownUntil;
					if (typeof until === "number" && Number.isFinite(until) && until > now) flags.push(`cooldown ${formatUntil(until)}`);
					else flags.push("cooldown");
				}
				if (!profile && isConfiguredAwsSdkAuthProfileForProvider({
					cfg,
					provider,
					profileId
				})) return `${profileId}=aws-sdk${formatFlagsSuffix(flags)}`;
				if (!profile || configProfile?.provider && configProfile.provider !== profile.provider || configProfile?.mode && configProfile.mode !== profile.type && !(configProfile.mode === "oauth" && profile.type === "token")) return `${profileId}=missing${formatFlagsSuffix(flags)}`;
				if (profile.type === "api_key") return `${profileId}=${resolveStoredCredentialLabel({
					value: profile.key,
					refValue: profile.keyRef,
					mode
				})}${formatFlagsSuffix(flags)}`;
				if (profile.type === "token") {
					const tokenLabel = resolveStoredCredentialLabel({
						value: profile.token,
						refValue: profile.tokenRef,
						mode
					});
					const expirationFlag = formatExpirationLabel(profile.expires, now, formatUntil, "expired");
					if (expirationFlag) flags.push(expirationFlag);
					return `${profileId}=token:${tokenLabel}${formatFlagsSuffix(flags)}`;
				}
				const display = resolveAuthProfileDisplayLabel({
					cfg,
					store,
					profileId
				});
				const suffix = display === profileId ? "" : display.startsWith(profileId) ? display.slice(profileId.length).trim() : `(${display})`;
				const expirationFlag = formatExpirationLabel(profile.expires, now, formatUntil, "expired");
				if (expirationFlag) flags.push(expirationFlag);
				return `${profileId}=OAuth${suffix ? ` ${suffix}` : ""}${formatFlagsSuffix(flags)}`;
			}).join(", "),
			source: `auth profile store: ${formatPath(resolveAuthStorePathForDisplay(agentDir))}`
		};
	}
	const envKey = resolveEnvApiKey(provider, process.env, {
		config: cfg,
		workspaceDir
	});
	if (envKey) return {
		label: envKey.source.includes("ANTHROPIC_OAUTH_TOKEN") || normalizeLowercaseStringOrEmpty(envKey.source).includes("oauth") ? "OAuth (env)" : maskApiKey(envKey.apiKey),
		source: mode === "verbose" ? envKey.source : ""
	};
	const customKey = resolveUsableCustomProviderApiKey({
		cfg,
		provider
	})?.apiKey;
	if (customKey) return {
		label: maskApiKey(customKey),
		source: mode === "verbose" ? `models.json: ${formatPath(modelsPath)}` : ""
	};
	return {
		label: "missing",
		source: "missing"
	};
};
/** Formats an auth label plus source for one-line status output. */
const formatAuthLabel = (auth) => {
	if (!auth.source || auth.source === auth.label || auth.source === "missing") return auth.label;
	return `${auth.label} (${auth.source})`;
};
//#endregion
//#region src/auto-reply/reply/directive-handling.model-picker.ts
/** Resolves optional endpoint/API labels for a provider in picker details. */
function resolveProviderEndpointLabel(provider, cfg) {
	const normalized = normalizeProviderId(provider);
	const providers = cfg.models?.providers ?? {};
	const entry = findNormalizedProviderValue(providers, normalized);
	const endpoint = normalizeOptionalString(entry?.baseUrl);
	const api = normalizeOptionalString(entry?.api);
	return {
		endpoint: endpoint || void 0,
		api: api || void 0
	};
}
//#endregion
//#region src/auto-reply/reply/directive-handling.model.ts
function isMissingAuthLabel(auth) {
	return auth.label === "missing" && auth.source === "missing";
}
function resolveStatusHarnessRuntime(params) {
	const sessionRuntime = resolveSessionRuntimeOverrideForProvider({
		provider: params.provider,
		entry: params.sessionEntry,
		cfg: params.cfg
	});
	if (sessionRuntime) return sessionRuntime;
	return params.defaultRuntime;
}
function resolveStatusAcceptedProfileTypes(params) {
	if (normalizeProviderId(params.provider) !== "openai" || params.harnessRuntime === "codex") return;
	return ["api_key"];
}
async function resolveStatusAuthLabel(params) {
	const provider = normalizeProviderId(params.provider);
	const harnessPolicy = resolveAgentHarnessPolicy({
		provider,
		modelId: params.modelId,
		config: params.cfg,
		agentId: params.activeAgentId
	});
	const harnessRuntime = resolveStatusHarnessRuntime({
		sessionEntry: params.sessionEntry,
		defaultRuntime: harnessPolicy.runtime,
		provider,
		cfg: params.cfg
	});
	const auth = await resolveAuthLabel(params.provider, params.cfg, params.modelsPath, params.agentDir, params.authMode, params.workspaceDir, { acceptedProfileTypes: resolveStatusAcceptedProfileTypes({
		provider,
		harnessRuntime
	}) });
	if (!isMissingAuthLabel(auth)) return formatAuthLabel(auth);
	const effectiveAuthProvider = buildAgentRuntimeAuthPlan({
		provider,
		config: params.cfg,
		workspaceDir: params.workspaceDir,
		harnessRuntime
	}).harnessAuthProvider;
	if (!effectiveAuthProvider || effectiveAuthProvider === provider) return formatAuthLabel(auth);
	const runtimeAuth = await resolveAuthLabel(effectiveAuthProvider, params.cfg, params.modelsPath, params.agentDir, params.authMode, params.workspaceDir);
	if (isMissingAuthLabel(runtimeAuth)) return formatAuthLabel(auth);
	return `via ${harnessRuntime} runtime / ${effectiveAuthProvider} ${formatAuthLabel(runtimeAuth)}`;
}
function pushUniqueCatalogEntry(params) {
	const provider = normalizeProviderId(params.provider);
	const id = normalizeOptionalString(params.id) ?? "";
	if (!provider || !id) return;
	const key = modelKey(provider, id);
	if (params.keys.has(key)) return;
	params.keys.add(key);
	params.out.push({
		provider,
		id,
		name: params.fallbackNameToId ? params.name ?? id : params.name
	});
}
function buildModelPickerCatalog(params) {
	const configuredProjection = resolveConfiguredModelEntries({
		cfg: params.cfg,
		agentId: params.agentId,
		defaultProvider: params.defaultProvider,
		defaultModel: params.defaultModel,
		aliasIndex: params.aliasIndex,
		...RUNTIME_MODEL_VISIBILITY_NORMALIZATION
	});
	const resolvedDefault = configuredProjection.defaultRef;
	const configuredCatalog = configuredProjection.entries.map((entry) => ({
		provider: entry.ref.provider,
		id: entry.ref.model,
		name: entry.ref.model
	}));
	const keys = /* @__PURE__ */ new Set();
	const out = [];
	const push = (entry) => {
		pushUniqueCatalogEntry({
			keys,
			out,
			provider: entry.provider,
			id: entry.id ?? "",
			name: entry.name,
			fallbackNameToId: false
		});
	};
	const visibility = parseConfiguredModelVisibilityEntries({
		cfg: params.cfg,
		agentId: params.agentId
	});
	if (!visibility.hasEntries) {
		for (const entry of params.allowedModelCatalog) push({
			provider: entry.provider,
			id: entry.id ?? "",
			name: entry.name
		});
		for (const entry of configuredCatalog) push(entry);
		return out;
	}
	for (const entry of params.allowedModelCatalog.filter((candidate) => isModelKeyAllowedBySet(params.allowedModelKeys, modelKey(candidate.provider, candidate.id ?? "")))) push({
		provider: entry.provider,
		id: entry.id ?? "",
		name: entry.name
	});
	for (const raw of visibility.exactModelRefs) {
		const resolved = resolveModelRefFromString({
			cfg: params.cfg,
			agentId: params.agentId,
			raw,
			defaultProvider: params.defaultProvider,
			aliasIndex: params.policyAliasIndex,
			...RUNTIME_MODEL_VISIBILITY_NORMALIZATION
		});
		if (!resolved) continue;
		const catalogEntry = params.allowedModelCatalog.find((entry) => modelKey(entry.provider, entry.id ?? "") === modelKey(resolved.ref.provider, resolved.ref.model));
		push(catalogEntry ? {
			provider: catalogEntry.provider,
			id: catalogEntry.id ?? "",
			name: catalogEntry.name
		} : {
			provider: resolved.ref.provider,
			id: resolved.ref.model,
			name: resolved.ref.model
		});
	}
	if (resolvedDefault.model && isModelKeyAllowedBySet(params.allowedModelKeys, modelKey(resolvedDefault.provider, resolvedDefault.model))) push({
		provider: resolvedDefault.provider,
		id: resolvedDefault.model,
		name: resolvedDefault.model
	});
	return out;
}
function filterMissingAuthNestedProviderDuplicates(params) {
	const configuredKeys = new Set(buildConfiguredModelCatalog({ cfg: params.cfg }).map((entry) => modelKey(entry.provider, entry.id)));
	const wrapperKeys = /* @__PURE__ */ new Set();
	for (const entry of params.entries) {
		const id = normalizeOptionalString(entry.id) ?? "";
		const slash = id.indexOf("/");
		if (slash <= 0) continue;
		const nestedProvider = normalizeProviderId(id.slice(0, slash));
		const nestedModel = normalizeOptionalString(id.slice(slash + 1)) ?? "";
		const wrapperProvider = normalizeProviderId(entry.provider);
		if (!nestedProvider || !nestedModel || nestedProvider === wrapperProvider) continue;
		wrapperKeys.add(modelKey(nestedProvider, nestedModel));
	}
	if (wrapperKeys.size === 0) return params.entries;
	return params.entries.filter((entry) => {
		const provider = normalizeProviderId(entry.provider);
		const id = normalizeOptionalString(entry.id) ?? "";
		const key = modelKey(provider, id);
		if (configuredKeys.has(key)) return true;
		return params.authByProvider.get(provider) !== "missing" || !wrapperKeys.has(key);
	});
}
async function maybeHandleModelDirectiveInfo(params) {
	if (!params.directives.hasModelDirective) return;
	const rawDirective = normalizeOptionalString(params.directives.rawModelDirective);
	const directive = rawDirective ? normalizeLowercaseStringOrEmpty(rawDirective) : void 0;
	const isLiteralModelDirective = params.directives.modelDirectiveSource !== "alias";
	const wantsStatus = isLiteralModelDirective && directive === "status";
	const wantsSummary = isLiteralModelDirective && !rawDirective;
	const wantsLegacyList = isLiteralModelDirective && directive === "list";
	if (!wantsSummary && !wantsStatus && !wantsLegacyList) return;
	if (params.directives.rawModelProfile) return {
		text: "Auth profile override requires a model selection.",
		isError: true
	};
	if (params.directives.rawModelRuntime) return {
		text: "Runtime override requires a model selection.",
		isError: true
	};
	if (params.directives.modelScope) return {
		text: `${params.directives.modelScope === "session" ? "Session-only" : params.directives.modelScope === "agent" ? "Agent" : "Global"} scope requires a model selection.`,
		isError: true
	};
	if (wantsLegacyList) return await resolveModelsCommandReply({
		cfg: params.cfg,
		commandBodyNormalized: "/models",
		surface: params.surface,
		currentModel: `${params.provider}/${params.model}`,
		agentId: params.activeAgentId,
		agentDir: params.agentDir,
		workspaceDir: params.workspaceDir,
		sessionEntry: isCompleteSessionEntry(params.sessionEntry) ? params.sessionEntry : void 0
	}) ?? { text: "No models available." };
	if (wantsSummary) {
		const modelRefs = resolveSelectedAndActiveModel({
			selectedProvider: params.provider,
			selectedModel: params.model,
			sessionEntry: params.sessionEntry
		});
		const current = modelRefs.selected.label;
		const thinkingRuntime = resolveEffectiveAgentRuntime({
			cfg: params.cfg,
			provider: params.provider,
			modelId: params.model,
			agentId: params.activeAgentId,
			sessionKey: params.runtimePolicySessionKey,
			sessionEntry: params.sessionEntry
		});
		const thinkingLine = `Think: ${resolveSupportedThinkingLevel({
			provider: params.provider,
			model: params.model,
			level: params.currentThinkLevel,
			catalog: params.thinkingCatalog,
			agentRuntime: thinkingRuntime
		})} (change with /think <level>)`;
		const activeRuntimeLine = modelRefs.activeDiffers ? `Active: ${modelRefs.active.label} (runtime)` : null;
		const channelData = (params.surface ? getChannelPlugin(params.surface) : null)?.commands?.buildModelBrowseChannelData?.();
		if (channelData) return {
			text: [
				`Current: ${current}${modelRefs.activeDiffers ? " (selected)" : ""}`,
				activeRuntimeLine,
				thinkingLine,
				"",
				"Tap below to select a model, or use:",
				"/model <provider/model> -s for this session only",
				"/model <provider/model> -a to update this agent's default",
				"/model <provider/model> -g to update the global default",
				"/model <provider/model> --runtime <runtime> -s to switch harnesses",
				"/model status for details"
			].filter(Boolean).join("\n"),
			channelData
		};
		return { text: [
			`Current: ${current}${modelRefs.activeDiffers ? " (selected)" : ""}`,
			activeRuntimeLine,
			thinkingLine,
			"",
			"Session: /model <provider/model> -s",
			"Agent default: /model <provider/model> -a",
			"Global default: /model <provider/model> -g",
			"Runtime: /model <provider/model> --runtime <runtime> -s",
			"Browse: /models (providers) or /models <provider> (models)",
			"More: /model status"
		].filter(Boolean).join("\n") };
	}
	const pickerCatalog = buildModelPickerCatalog({
		cfg: params.cfg,
		defaultProvider: params.defaultProvider,
		defaultModel: params.defaultModel,
		agentId: params.activeAgentId,
		aliasIndex: params.aliasIndex,
		policyAliasIndex: params.policyAliasIndex ?? params.aliasIndex,
		allowedModelKeys: params.allowedModelKeys,
		allowedModelCatalog: params.allowedModelCatalog
	});
	const modelsPath = `${params.agentDir}/models.json`;
	const formatPath = (value) => shortenHomePath(value);
	const authMode = "verbose";
	if (pickerCatalog.length === 0) return { text: "No models available." };
	const authByProvider = /* @__PURE__ */ new Map();
	for (const entry of pickerCatalog) {
		const provider = normalizeProviderId(entry.provider);
		if (authByProvider.has(provider)) continue;
		const authLabel = await resolveStatusAuthLabel({
			provider,
			modelId: entry.id,
			cfg: params.cfg,
			modelsPath,
			agentDir: params.agentDir,
			activeAgentId: params.activeAgentId,
			authMode,
			workspaceDir: params.workspaceDir,
			sessionEntry: params.sessionEntry
		});
		authByProvider.set(provider, authLabel);
	}
	const modelRefs = resolveSelectedAndActiveModel({
		selectedProvider: params.provider,
		selectedModel: params.model,
		sessionEntry: params.sessionEntry
	});
	const current = modelRefs.selected.label;
	const defaultLabel = `${params.defaultProvider}/${params.defaultModel}`;
	const lines = [
		`Current: ${current}${modelRefs.activeDiffers ? " (selected)" : ""}`,
		modelRefs.activeDiffers ? `Active: ${modelRefs.active.label} (runtime)` : null,
		`Default: ${defaultLabel}`,
		`Agent: ${params.activeAgentId}`,
		`Auth store: ${formatPath(resolveAuthStorePathForDisplay(params.agentDir))}`
	].filter((line) => Boolean(line));
	if (params.resetModelOverride) lines.push(`(previous selection reset to default)`);
	const byProvider = /* @__PURE__ */ new Map();
	const statusCatalog = filterMissingAuthNestedProviderDuplicates({
		cfg: params.cfg,
		entries: pickerCatalog,
		authByProvider
	});
	for (const entry of statusCatalog) {
		const provider = normalizeProviderId(entry.provider);
		const models = byProvider.get(provider);
		if (models) {
			models.push(entry);
			continue;
		}
		byProvider.set(provider, [entry]);
	}
	for (const provider of byProvider.keys()) {
		const models = byProvider.get(provider);
		if (!models) continue;
		const authLabel = authByProvider.get(provider) ?? "missing";
		const endpoint = resolveProviderEndpointLabel(provider, params.cfg);
		const endpointSuffix = endpoint.endpoint ? ` endpoint: ${endpoint.endpoint}` : " endpoint: default";
		const apiSuffix = endpoint.api ? ` api: ${endpoint.api}` : "";
		lines.push("");
		lines.push(`[${provider}]${endpointSuffix}${apiSuffix} auth: ${authLabel}`);
		for (const entry of models) {
			const label = `${provider}/${entry.id}`;
			const aliases = params.aliasIndex.byKey.get(label);
			const aliasSuffix = aliases && aliases.length > 0 ? ` (${aliases.join(", ")})` : "";
			lines.push(`  • ${label}${aliasSuffix}`);
		}
	}
	return { text: lines.join("\n") };
}
function isCompleteSessionEntry(entry) {
	return Boolean(entry && typeof entry.sessionId === "string" && typeof entry.updatedAt === "number");
}
//#endregion
//#region src/auto-reply/reply/directive-handling.queue-validation.ts
/** Validates `/queue` directives and returns immediate status/error replies. */
function maybeHandleQueueDirective(params) {
	const { directives } = params;
	if (!directives.hasQueueDirective) return;
	if (!directives.queueMode && !directives.queueReset && !directives.hasQueueOptions && directives.rawQueueMode === void 0 && directives.rawDebounce === void 0 && directives.rawCap === void 0 && directives.rawDrop === void 0) {
		const settings = resolveQueueSettingsCore({
			cfg: params.cfg,
			channel: params.channel,
			sessionEntry: params.sessionEntry
		});
		const debounceLabel = typeof settings.debounceMs === "number" ? `${settings.debounceMs}ms` : "default";
		const capLabel = typeof settings.cap === "number" ? String(settings.cap) : "default";
		const dropLabel = settings.dropPolicy ?? "default";
		return { text: withOptions(`Current queue settings: mode=${settings.mode}, debounce=${debounceLabel}, cap=${capLabel}, drop=${dropLabel}.`, "modes steer, followup, collect, interrupt; debounce:<ms|s|m>, cap:<n>, drop:old|new|summarize") };
	}
	const queueModeInvalid = !directives.queueMode && !directives.queueReset && Boolean(directives.rawQueueMode);
	const queueDebounceInvalid = directives.rawDebounce !== void 0 && typeof directives.debounceMs !== "number";
	const queueCapInvalid = directives.rawCap !== void 0 && typeof directives.cap !== "number";
	const queueDropInvalid = directives.rawDrop !== void 0 && !directives.dropPolicy;
	if (queueModeInvalid || queueDebounceInvalid || queueCapInvalid || queueDropInvalid) {
		const errors = [];
		if (queueModeInvalid) errors.push(`Unrecognized queue mode "${directives.rawQueueMode ?? ""}". Valid modes: steer, followup, collect, interrupt.`);
		if (queueDebounceInvalid) errors.push(`Invalid debounce "${directives.rawDebounce ?? ""}". Use ms/s/m (e.g. debounce:1500ms, debounce:2s).`);
		if (queueCapInvalid) errors.push(`Invalid cap "${directives.rawCap ?? ""}". Use a positive integer (e.g. cap:10).`);
		if (queueDropInvalid) errors.push(`Invalid drop policy "${directives.rawDrop ?? ""}". Use drop:old, drop:new, or drop:summarize.`);
		return { text: errors.join(" ") };
	}
}
//#endregion
//#region src/auto-reply/reply/directive-runtime-context.ts
function resolveDirectiveRuntimeContext(params) {
	const activeAgentId = params.agentId;
	const agentDir = resolveAgentDir(params.cfg, activeAgentId);
	const runtimePolicySessionKey = resolveRuntimePolicySessionKey({
		agentId: activeAgentId,
		cfg: params.cfg,
		ctx: params.ctx,
		sessionKey: params.sessionKey
	});
	return {
		activeAgentId,
		agentDir,
		runtimePolicySessionKey,
		runtimeIsSandboxed: resolveSandboxRuntimeStatus({
			cfg: params.cfg,
			agentId: activeAgentId,
			sessionKey: params.sessionKey,
			classificationSessionKey: runtimePolicySessionKey
		}).sandboxed
	};
}
//#endregion
//#region src/auto-reply/reply/directive-handling.impl.ts
/** Applies directive-only command state changes without running the agent. */
/** Handles inline directives that can be acknowledged without a model turn. */
async function handleDirectiveOnly(params) {
	const { directives, sessionEntry, sessionStore, sessionKey, storePath, elevatedEnabled, elevatedAllowed, defaultProvider, defaultModel, aliasIndex, policyAliasIndex, allowedModelKeys, allowedModelCatalog, resetModelOverride, provider, model, initialModelLabel, formatModelSwitchEvent, currentThinkLevel, currentFastMode, currentVerboseLevel, currentReasoningLevel, currentElevatedLevel } = params;
	const allowPrivilegedPersistence = canPersistSessionDirectiveDefaults(params);
	const rejectModelTransaction = (errorText) => rejectSessionDirectiveTransaction(params.persistenceState, errorText);
	const acknowledgeIgnoredDirective = (reply, ignoredDirective) => acknowledgeIgnoredSessionDirective({
		reply,
		directives,
		ignoredDirective,
		persistenceState: params.persistenceState,
		allowPrivilegedPersistence,
		applyRemainingDirectives: (remainingDirectives) => handleDirectiveOnly({
			...params,
			directives: remainingDirectives
		})
	});
	const delegatedTraceAllowed = (params.gatewayClientScopes ?? []).includes("operator.admin");
	if (directives.hasTraceDirective && !params.senderIsOwner && !delegatedTraceAllowed) return acknowledgeIgnoredDirective({ text: "❌ /trace is restricted to owners and gateway clients with operator.admin scope." }, "hasTraceDirective");
	const { activeAgentId, agentDir, runtimePolicySessionKey, runtimeIsSandboxed } = resolveDirectiveRuntimeContext(params);
	const shouldHintDirectRuntime = directives.hasElevatedDirective && !runtimeIsSandboxed;
	let thinkingCatalog = params.thinkingCatalog && params.thinkingCatalog.length > 0 ? params.thinkingCatalog : allowedModelCatalog.length > 0 ? allowedModelCatalog : void 0;
	const modelInfo = await maybeHandleModelDirectiveInfo({
		directives,
		cfg: params.cfg,
		agentDir,
		activeAgentId,
		provider,
		model,
		defaultProvider,
		defaultModel,
		aliasIndex,
		policyAliasIndex,
		allowedModelKeys,
		allowedModelCatalog,
		currentThinkLevel: currentThinkLevel ?? "off",
		thinkingCatalog,
		runtimePolicySessionKey,
		resetModelOverride,
		workspaceDir: params.workspaceDir,
		surface: params.surface,
		sessionEntry
	});
	if (modelInfo) return acknowledgeIgnoredDirective(modelInfo, "hasModelDirective");
	const modelResolution = resolveModelSelectionFromDirective({
		directives,
		cfg: params.cfg,
		agentDir,
		defaultProvider,
		defaultModel,
		aliasIndex,
		allowedModelKeys,
		allowedModelCatalog,
		provider,
		agentId: activeAgentId,
		modelPolicy: params.modelPolicy
	});
	if (modelResolution.errorText) return rejectModelTransaction(modelResolution.errorText);
	const modelSelection = modelResolution.modelSelection;
	const profileOverride = modelResolution.profileOverride;
	if (modelSelection && isModelSelectionLocked(sessionEntry)) return rejectModelTransaction(MODEL_SELECTION_LOCKED_MESSAGE);
	const resolvedProvider = modelSelection?.provider ?? provider;
	const resolvedModel = modelSelection?.model ?? model;
	let modelRuntimeResolution = { kind: "unchanged" };
	if (modelSelection) {
		const prepared = await prepareModelSelectionRuntime({
			cfg: params.cfg,
			agentId: activeAgentId,
			provider: resolvedProvider,
			model: resolvedModel,
			catalog: thinkingCatalog ?? [],
			rawRuntime: directives.rawModelRuntime,
			sessionEntry
		});
		if (prepared.status === "rejected") return rejectModelTransaction(prepared.message);
		thinkingCatalog = prepared.catalog;
		modelRuntimeResolution = prepared.runtime;
	}
	const prospectiveSessionEntry = { ...sessionEntry };
	applyModelRuntimeDirective(prospectiveSessionEntry, modelRuntimeResolution);
	const selectedCatalogEntry = findSelectedCatalogEntry({
		catalog: thinkingCatalog,
		provider: resolvedProvider,
		model: resolvedModel
	});
	const resolveThinkingRuntime = (entry) => resolveEffectiveAgentRuntime({
		cfg: params.cfg,
		provider: resolvedProvider,
		modelId: resolvedModel,
		modelApi: selectedCatalogEntry?.api,
		modelBaseUrl: selectedCatalogEntry?.baseUrl,
		agentId: activeAgentId,
		sessionKey: runtimePolicySessionKey,
		sessionEntry: entry
	});
	const thinkingRuntime = resolveThinkingRuntime(prospectiveSessionEntry);
	const thinkingPolicy = {
		provider: resolvedProvider,
		model: resolvedModel,
		catalog: thinkingCatalog,
		agentRuntime: thinkingRuntime
	};
	const fastModeState = resolveFastModeState({
		cfg: params.cfg,
		provider: resolvedProvider,
		model: resolvedModel,
		agentId: activeAgentId,
		sessionEntry: directives.clearFastMode ? void 0 : sessionEntry
	});
	const effectiveFastMode = directives.fastMode ?? (directives.clearFastMode ? fastModeState.mode : currentFastMode) ?? fastModeState.mode;
	const effectiveFastModeSource = directives.fastMode !== void 0 ? "session" : fastModeState.source;
	if (directives.hasThinkDirective && !directives.thinkLevel && !directives.clearThinkLevel) {
		if (!directives.rawThinkLevel) {
			const level = resolveSupportedThinkingLevel({
				...thinkingPolicy,
				level: currentThinkLevel ?? "off"
			});
			return acknowledgeIgnoredDirective({ text: withOptions(`Current thinking level: ${level}.`, `default, ${formatThinkingLevels(resolvedProvider, resolvedModel, ", ", thinkingCatalog, thinkingRuntime)}`) }, "hasThinkDirective");
		}
		return acknowledgeIgnoredDirective({ text: `Unrecognized thinking level "${directives.rawThinkLevel}". Valid levels: default, ${formatThinkingLevels(resolvedProvider, resolvedModel, ", ", thinkingCatalog, thinkingRuntime)}.` }, "hasThinkDirective");
	}
	if (directives.hasVerboseDirective && !directives.verboseLevel) return acknowledgeIgnoredDirective({ text: directives.rawVerboseLevel ? `Unrecognized verbose level "${directives.rawVerboseLevel}". Valid levels: off, on, full.` : withOptions(`Current verbose level: ${currentVerboseLevel ?? "off"}.`, "on, full, off") }, "hasVerboseDirective");
	if (directives.hasTraceDirective && !directives.traceLevel) return acknowledgeIgnoredDirective({ text: directives.rawTraceLevel ? `Unrecognized trace level "${directives.rawTraceLevel}". Valid levels: off, on, raw.` : withOptions(`Current trace level: ${sessionEntry.traceLevel ?? "off"}.`, "on, off, raw") }, "hasTraceDirective");
	if (directives.hasFastDirective && directives.fastMode === void 0 && !directives.clearFastMode) {
		const isFastStatus = normalizeLowercaseStringOrEmpty(directives.rawFastMode) === "status";
		if (!directives.rawFastMode || isFastStatus) {
			const statusText = formatFastModeCurrentStatus({
				mode: effectiveFastMode,
				source: effectiveFastModeSource,
				fastAutoOnSeconds: fastModeState.fastAutoOnSeconds
			});
			return acknowledgeIgnoredDirective({ text: isFastStatus ? statusText : withOptions(statusText, formatFastModeCommandOptions({ fastAutoOnSeconds: fastModeState.fastAutoOnSeconds })) }, "hasFastDirective");
		}
		return acknowledgeIgnoredDirective({ text: `Unrecognized fast mode "${directives.rawFastMode}". Valid levels: on, off, auto, default, status.` }, "hasFastDirective");
	}
	if (directives.hasReasoningDirective && !directives.reasoningLevel) return acknowledgeIgnoredDirective({ text: directives.rawReasoningLevel ? `Unrecognized reasoning level "${directives.rawReasoningLevel}". Valid levels: on, off, stream.` : withOptions(`Current reasoning level: ${currentReasoningLevel ?? "off"}.`, "on, off, stream") }, "hasReasoningDirective");
	if (directives.hasElevatedDirective && !directives.elevatedLevel) {
		if (!directives.rawElevatedLevel) {
			if (!elevatedEnabled || !elevatedAllowed) return acknowledgeIgnoredDirective({ text: formatElevatedUnavailableText({
				runtimeSandboxed: runtimeIsSandboxed,
				failures: params.elevatedFailures,
				sessionKey: params.sessionKey
			}) }, "hasElevatedDirective");
			return acknowledgeIgnoredDirective({ text: [withOptions(`Current elevated level: ${currentElevatedLevel ?? "off"}.`, "on, off, ask, full"), shouldHintDirectRuntime ? formatElevatedRuntimeHint() : null].filter(Boolean).join("\n") }, "hasElevatedDirective");
		}
		return acknowledgeIgnoredDirective({ text: `Unrecognized elevated level "${directives.rawElevatedLevel}". Valid levels: off, on, ask, full.` }, "hasElevatedDirective");
	}
	if (directives.hasElevatedDirective && (!elevatedEnabled || !elevatedAllowed)) return acknowledgeIgnoredDirective({ text: formatElevatedUnavailableText({
		runtimeSandboxed: runtimeIsSandboxed,
		failures: params.elevatedFailures,
		sessionKey: params.sessionKey
	}) }, "hasElevatedDirective");
	if (directives.hasExecDirective) {
		const invalidExecMessage = directives.invalidExecHost ? `Unrecognized exec host "${directives.rawExecHost ?? ""}". Valid hosts: auto, sandbox, gateway, node.` : directives.invalidExecSecurity ? `Unrecognized exec security "${directives.rawExecSecurity ?? ""}". Valid: deny, allowlist, full.` : directives.invalidExecAsk ? `Unrecognized exec ask "${directives.rawExecAsk ?? ""}". Valid: off, on-miss, always.` : directives.invalidExecNode ? "Exec node requires a value." : void 0;
		if (invalidExecMessage) return acknowledgeIgnoredDirective({ text: invalidExecMessage }, "hasExecDirective");
		const unexpectedExecArguments = maybeHandleUnexpectedNativeDirectiveArguments(directives);
		if (unexpectedExecArguments) return unexpectedExecArguments;
		if (!directives.hasExecOptions) {
			const execDefaults = resolveExecDefaults({
				cfg: params.cfg,
				sessionEntry,
				agentId: activeAgentId,
				sandboxAvailable: runtimeIsSandboxed
			});
			const nodeLabel = execDefaults.node ? `node=${execDefaults.node}` : "node=(unset)";
			return acknowledgeIgnoredDirective({ text: withOptions(`Current exec defaults: host=${renderExecTargetLabel(execDefaults.host)}, effective=${execDefaults.effectiveHost}, security=${execDefaults.security}, ask=${execDefaults.ask}, ${nodeLabel}.`, "host=auto|sandbox|gateway|node, security=deny|allowlist|full, ask=off|on-miss|always, node=<id>") }, "hasExecDirective");
		}
	}
	const queueAck = maybeHandleQueueDirective({
		directives,
		cfg: params.cfg,
		channel: provider,
		sessionEntry
	});
	if (queueAck) return acknowledgeIgnoredDirective(queueAck, "hasQueueDirective");
	const unexpectedNativeArguments = maybeHandleUnexpectedNativeDirectiveArguments(directives);
	if (unexpectedNativeArguments) return unexpectedNativeArguments;
	if (directives.hasThinkDirective && directives.thinkLevel && !isThinkingLevelSupported({
		...thinkingPolicy,
		level: directives.thinkLevel
	})) return rejectModelTransaction(`Thinking level "${directives.thinkLevel}" is not supported for ${resolvedProvider}/${resolvedModel}. Use one of: ${formatThinkingLevels(resolvedProvider, resolvedModel, ", ", thinkingCatalog, thinkingRuntime)}.`);
	const nextThinkLevel = directives.hasThinkDirective ? directives.thinkLevel : sessionEntry?.thinkingLevel ?? currentThinkLevel;
	const remappedUnsupportedThinkLevel = !directives.hasThinkDirective && nextThinkLevel ? resolveSupportedThinkingLevel({
		...thinkingPolicy,
		level: nextThinkLevel
	}) : void 0;
	const shouldRemapUnsupportedThinkLevel = Boolean(remappedUnsupportedThinkLevel) && remappedUnsupportedThinkLevel !== nextThinkLevel;
	const prevReasoningLevel = currentReasoningLevel ?? sessionEntry.reasoningLevel ?? "off";
	const elevatedChanged = directives.hasElevatedDirective && directives.elevatedLevel !== void 0 && directives.elevatedLevel !== (currentElevatedLevel ?? sessionEntry.elevatedLevel ?? "off") && elevatedEnabled && elevatedAllowed;
	let modelSelectionUpdated = false;
	let configuredDefaultUpdate;
	const appliedSessionEntry = sessionEntry;
	const touchedSessionFields = resolveDirectiveTouchedSessionFields({
		directives,
		allowPrivilegedPersistence
	});
	// thinking-preserve-on-switch-v1: a model switch keeps the stored thinking level; runs clamp it per turn.
	const shouldPersistSessionEntry = touchedSessionFields.length > 0;
	const fastModeChanged = directives.hasFastDirective && directives.fastMode !== void 0 && directives.fastMode !== currentFastMode || directives.clearFastMode && currentFastMode !== fastModeState.mode;
	const reasoningChanged = directives.hasReasoningDirective && directives.reasoningLevel !== void 0 && directives.reasoningLevel !== prevReasoningLevel;
	if (shouldPersistSessionEntry) {
		const initialSessionEntry = { ...sessionEntry };
		applySessionDirectiveFields({
			directives,
			sessionEntry,
			allowPrivilegedPersistence,
			allowTracePersistence: true,
			allowElevatedPersistence: elevatedEnabled && elevatedAllowed,
			persistDirectiveOnlyFields: true
		});
		if (modelSelection) {
			const applied = applyModelOverrideWithAuthProfileCompatibility({
				cfg: params.cfg,
				agentDir,
				entry: sessionEntry,
				currentProvider: provider,
				selection: modelSelection,
				profileOverride,
				markLiveSwitchPending: true
			});
			const appliedRuntime = applyModelRuntimeDirective(sessionEntry, modelRuntimeResolution);
			modelSelectionUpdated = applied.updated || appliedRuntime.updated;
		}
		sessionEntry.updatedAt = Date.now();
		sessionStore[sessionKey] = sessionEntry;
		if (storePath) {
			const persistence = await persistSessionDirectiveSnapshot({
				storePath,
				sessionKey,
				initialEntry: initialSessionEntry,
				sessionEntry,
				sessionStore,
				hasModelSelection: Boolean(modelSelection),
				reassertLiveModelSwitchPending: modelSelectionUpdated && sessionEntry.liveModelSwitchPending === true,
				touchedFields: touchedSessionFields
			});
			if (persistence.status !== "applied") return rejectModelTransaction(persistence.status === "model-selection-locked" ? MODEL_SELECTION_LOCKED_MESSAGE : modelSelection ? "Model change was not applied because the session changed. Retry." : "Session settings were not applied because the session changed. Retry.");
		}
		if (modelSelection && (!modelSelection.isDefault || params.stickyModelSelectionTarget) && params.canPersistStickyModelSelection === true) configuredDefaultUpdate = persistStickyModelSelectionBestEffort({
			agentId: activeAgentId,
			model: `${modelSelection.provider}/${modelSelection.model}`,
			...params.stickyModelSelectionTarget ? { target: params.stickyModelSelectionTarget } : {}
		});
		if (modelSelection && modelSelectionUpdated && sessionKey) {
			emitSessionLifecycleEvent({
				sessionKey,
				agentId: activeAgentId,
				reason: "patch"
			});
			triggerSessionPatchHook({
				cfg: params.cfg,
				sessionEntry: appliedSessionEntry,
				sessionKey,
				patch: {
					key: sessionKey,
					model: directives.rawModelDirective ?? `${modelSelection.provider}/${modelSelection.model}`
				}
			});
			refreshQueuedFollowupSession({
				key: sessionKey,
				nextProvider: modelSelection.provider,
				nextModel: modelSelection.model,
				nextRouteResolution: "resolved",
				nextModelOverrideSource: modelSelection.isDefault ? void 0 : "user",
				nextAuthProfileId: appliedSessionEntry.authProfileOverride,
				nextAuthProfileIdSource: resolveSessionAuthProfileOverrideSource(appliedSessionEntry),
				nextThinking: {
					level: appliedSessionEntry.thinkingLevel,
					catalog: thinkingCatalog,
					agentRuntime: resolveThinkingRuntime(appliedSessionEntry)
				}
			});
		}
	}
	if (modelSelection) {
		const nextLabel = `${modelSelection.provider}/${modelSelection.model}`;
		if (nextLabel !== initialModelLabel) enqueueSystemEvent(formatModelSwitchEvent(nextLabel, modelSelection.alias), {
			sessionKey,
			contextKey: `model:${nextLabel}`
		});
	}
	enqueueModeSwitchEvents({
		enqueueSystemEvent,
		sessionEntry: appliedSessionEntry,
		sessionKey,
		elevatedChanged,
		reasoningChanged
	});
	if (params.persistenceState) params.persistenceState.outcome = {
		kind: "applied",
		provider: resolvedProvider,
		model: resolvedModel,
		modelCatalog: thinkingCatalog
	};
	const parts = [];
	if (directives.clearThinkLevel) parts.push("Thinking level reset to default.");
	else if (directives.hasThinkDirective && directives.thinkLevel) parts.push(directives.thinkLevel === "off" ? "Thinking disabled." : `Thinking level set to ${directives.thinkLevel}.`);
	if (directives.clearFastMode) parts.push(formatDirectiveAck("Fast mode reset to default."));
	else if (directives.hasFastDirective && directives.fastMode !== void 0) parts.push(directives.fastMode === "auto" ? formatDirectiveAck("Fast mode set to auto.") : directives.fastMode ? formatDirectiveAck("Fast mode enabled.") : formatDirectiveAck("Fast mode disabled."));
	if (directives.hasVerboseDirective && directives.verboseLevel) {
		const message = allowPrivilegedPersistence ? DIRECTIVE_ACK_MESSAGES.verbose[directives.verboseLevel] : formatInternalVerboseCurrentReplyOnlyText();
		parts.push(formatDirectiveAck(message));
	}
	if (directives.hasTraceDirective && directives.traceLevel) parts.push(formatDirectiveAck(DIRECTIVE_ACK_MESSAGES.trace[directives.traceLevel]));
	if (directives.hasVerboseDirective && directives.verboseLevel && !allowPrivilegedPersistence) parts.push(formatDirectiveAck(formatInternalVerbosePersistenceDeniedText()));
	if (directives.hasReasoningDirective && directives.reasoningLevel) parts.push(formatDirectiveAck(DIRECTIVE_ACK_MESSAGES.reasoning[directives.reasoningLevel]));
	if (directives.hasElevatedDirective && directives.elevatedLevel) {
		parts.push(formatDirectiveAck(DIRECTIVE_ACK_MESSAGES.elevated[directives.elevatedLevel]));
		if (shouldHintDirectRuntime) parts.push(formatElevatedRuntimeHint());
	}
	if (directives.hasExecDirective && directives.hasExecOptions) for (const [label, options] of [[allowPrivilegedPersistence && "Exec defaults set", {
		host: directives.execHost,
		node: directives.execNode
	}], ["Exec policy for this run only", {
		security: directives.execSecurity,
		ask: directives.execAsk
	}]]) {
		const execParts = Object.entries(options).filter(([, value]) => Boolean(value)).map(([key, value]) => `${key}=${value}`);
		if (execParts.length > 0) {
			const message = label ? `${label} (${execParts.join(", ")}).` : formatInternalExecPersistenceDeniedText();
			parts.push(formatDirectiveAck(message));
		}
	}
	if (modelSelection) {
		const label = `${modelSelection.provider}/${modelSelection.model}`;
		const labelWithAlias = modelSelection.alias ? `${modelSelection.alias} (${label})` : label;
		parts.push(formatModelSelectionScopeAck({
			isDefault: modelSelection.isDefault,
			label: labelWithAlias,
			configuredDefaultUpdate,
			...params.stickyModelSelectionTarget ? { stickyModelSelectionTarget: params.stickyModelSelectionTarget } : {}
		}));
		if (profileOverride) parts.push(`Auth profile set to ${profileOverride}.`);
		if (modelRuntimeResolution.kind === "clear") parts.push("Runtime reset to configured policy.");
		else if (modelRuntimeResolution.kind === "set") parts.push(`Runtime set to ${modelRuntimeResolution.runtime} for this session.`);
	}
	if (!directives.hasThinkDirective && shouldRemapUnsupportedThinkLevel && remappedUnsupportedThinkLevel) parts.push(`Thinking level set to ${remappedUnsupportedThinkLevel} (${nextThinkLevel} not supported for ${resolvedProvider}/${resolvedModel}).`);
	if (directives.hasQueueDirective && directives.queueMode) parts.push(formatDirectiveAck(`Queue mode set to ${directives.queueMode}.`));
	else if (directives.hasQueueDirective && directives.queueReset) parts.push(formatDirectiveAck("Queue mode reset to default."));
	if (directives.hasQueueDirective && typeof directives.debounceMs === "number") parts.push(formatDirectiveAck(`Queue debounce set to ${directives.debounceMs}ms.`));
	if (directives.hasQueueDirective && typeof directives.cap === "number") parts.push(formatDirectiveAck(`Queue cap set to ${directives.cap}.`));
	if (directives.hasQueueDirective && directives.dropPolicy) parts.push(formatDirectiveAck(`Queue drop set to ${directives.dropPolicy}.`));
	if (fastModeChanged) {
		const nextFastMode = directives.clearFastMode ? fastModeState.mode : sessionEntry.fastMode;
		enqueueSystemEvent(nextFastMode === "auto" ? "Fast mode set to auto." : `Fast mode ${nextFastMode ? "enabled" : "disabled"}.`, {
			sessionKey,
			contextKey: `fast:${formatFastModeValue(nextFastMode)}`
		});
	}
	const ack = parts.join(" ").trim();
	if (!ack && directives.hasStatusDirective) return;
	return { text: ack || "OK." };
}
//#endregion
export { handleDirectiveOnly };
