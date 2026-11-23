import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { c as resolvePluginMetadataSnapshot } from "./plugin-metadata-snapshot-BuNx7zRZ.js";
import { m as resolveAgentWorkspaceDir, u as resolveAgentDir, y as resolveDefaultAgentId } from "./agent-scope-config-CUiGBd59.js";
import { i as buildModelAliasIndex, y as resolveModelRefFromString } from "./model-selection-shared-BUMiYTyL.js";
import "./defaults-CdX9UGcX.js";
import { t as splitTrailingAuthProfile } from "./model-ref-profile-BIKs-96s.js";
import { o as resolveAgentEffectiveModelPrimary } from "./agent-scope-CSlN0kZb.js";
import { t as resolveDefaultModelForAgent } from "./model-selection-config-bdtzr00S.js";
import { i as isOpenAIProvider } from "./openai-routing-ChWi-Lfh.js";
import { a as resolveOpenAIModelRoutes, f as buildProviderModelAuthDirectSource, o as selectOpenAIModelRouteAuth, p as buildProviderModelAuthSourcePlan } from "./openai-model-routes-Cz6pbfIt.js";
import { a as prepareProviderRuntimeAuth } from "./provider-runtime.runtime.js";
import { n as withPluginRuntimeGenerationScope } from "./generation-scope-CcvBHxkU.js";
import { r as ensureAuthProfileStore } from "./store-CZzbMlii.js";
import { t as applyPreparedRuntimeAuthToModel } from "./provider-request-config-BsyiChYr.js";
import { d as resolveClaudeSonnet5ModelIdentity, u as resolveClaudeOpus5ModelIdentity } from "./anthropic-BQXQudmA.js";
import "./src-g7CpceXJ.js";
import { t as protectPreparedProviderRuntimeAuth } from "./provider-secret-egress-Be7E79mv.js";
import { dt as getModelRegistryRuntime } from "./sessions-CHgQo4vL.js";
import { a as bindModelLlmRuntime, c as getModelLlmRuntime, n as completeSimple, s as getModelCompletionTransport } from "./stream-BbY-2nPo.js";
import { t as createAgentRuntimeMetadataPluginIdScope } from "./runtime-plugin-load-plan-Bm46qisR.js";
import { r as formatMissingAuthError } from "./model-auth-runtime-shared-C48YoQY0.js";
import { t as acquireAgentRunPreparedModelRuntime } from "./prepared-model-runtime-C1N_aVhw.js";
import { t as resolveApiKeyForProviderCore } from "./model-auth-provider-DLz9PQ3e.js";
import { i as getApiKeyForModelCore, n as applyLocalNoAuthHeaderOverride, r as applySecretRefHeaderSentinels } from "./model-auth-BBgoS_xI.js";
import "./model-selection-DG2dN6VK.js";
import { t as buildAgentRuntimeAuthPlan } from "./auth-BcBpmum3.js";
import { n as resolveModelAsync } from "./model-BtcPfJ_-.js";
import { o as fingerprintResolvedProviderAuth, t as fingerprintAuthProfileCredential } from "./execution-auth-binding-CmucNoqo.js";
import { t as materializePreparedRuntimeModel } from "./materialize-model-CVFDy__1.js";
import { n as resolveUtilityModelRefForAgent } from "./utility-model-DITM0_NG.js";
import { reasoningTagTextPolicy, supportsOpenAIReasoningEffort } from "@openclaw/ai/internal/openai";
import { prepareModelForSimpleCompletion } from "@openclaw/ai/transports";
import { defaultApiRegistry } from "@openclaw/ai/internal/runtime";
//#region src/agents/simple-completion-scope.ts
/** Bind every resolution in one completion to one prepared generation and store pair. */
function createPreparedSimpleCompletionResolverContext(params) {
	const stores = params.preparedModelRuntime.createStores();
	const modelResolver = params.modelResolver ?? resolveModelAsync;
	return {
		preparedModelRuntime: params.preparedModelRuntime,
		workspaceDir: params.workspaceDir,
		modelResolver: (provider, modelId, agentDir, cfg, options) => modelResolver(provider, modelId, agentDir, cfg, {
			...options,
			authStorage: stores.authStorage,
			modelRegistry: stores.modelRegistry,
			preparedModelRuntime: params.preparedModelRuntime,
			workspaceDir: params.workspaceDir,
			...params.agentRuntimeId ? { agentRuntimeId: params.agentRuntimeId } : {}
		})
	};
}
//#endregion
//#region src/agents/simple-completion-runtime.ts
function resolveSimpleCompletionSelectionRequest(params) {
	const fallbackRef = resolveDefaultModelForAgent({
		cfg: params.cfg,
		agentId: params.agentId,
		manifestPlugins: params.manifestPlugins
	});
	const modelRef = params.modelRef?.trim() || (params.useUtilityModel ? resolveUtilityModelRefForAgent({
		cfg: params.cfg,
		agentId: params.agentId,
		primaryProvider: fallbackRef.provider,
		...params.manifestPlugins ? { metadataSnapshot: "plugins" in params.manifestPlugins ? params.manifestPlugins : { plugins: params.manifestPlugins } } : {}
	}) : void 0) || resolveAgentEffectiveModelPrimary(params.cfg, params.agentId);
	const split = modelRef ? splitTrailingAuthProfile(modelRef) : null;
	const aliasIndex = buildModelAliasIndex({
		cfg: params.cfg,
		agentId: params.agentId,
		defaultProvider: fallbackRef.provider || "openai",
		manifestPlugins: params.manifestPlugins
	});
	const resolved = split ? resolveModelRefFromString({
		cfg: params.cfg,
		agentId: params.agentId,
		raw: split.model,
		defaultProvider: fallbackRef.provider || "openai",
		aliasIndex,
		manifestPlugins: params.manifestPlugins
	}) : null;
	const provider = resolved?.ref.provider ?? fallbackRef.provider;
	const modelId = resolved?.ref.model ?? fallbackRef.model;
	if (!provider || !modelId) return null;
	return {
		selection: {
			provider,
			modelId,
			profileId: split?.profile || void 0,
			agentDir: params.agentDir?.trim() || resolveAgentDir(params.cfg, params.agentId)
		},
		...split && !split.model.includes("/") ? { shorthandModelId: split.model } : {}
	};
}
function resolveSimpleCompletionSelectionForAgent(params) {
	return resolveSimpleCompletionSelectionRequest(params)?.selection ?? null;
}
async function prepareSimpleCompletionModel(params) {
	return await withPreparedSimpleCompletionRuntime(params, [{
		provider: params.provider,
		modelId: params.modelId,
		...params.agentRuntimeId ? { runtime: params.agentRuntimeId } : {}
	}], async (context) => await prepareSimpleCompletionModelCore({
		...params,
		agentDir: context.preparedModelRuntime.agentDir
	}, context));
}
async function prepareSimpleCompletionModelCore(params, context) {
	const { modelResolver, workspaceDir } = context;
	const resolved = await modelResolver(params.provider, params.modelId, params.agentDir, params.cfg, {
		...params.agentId ? { agentId: params.agentId } : {},
		...params.allowBundledStaticCatalogFallback !== void 0 ? { allowBundledStaticCatalogFallback: params.allowBundledStaticCatalogFallback } : {},
		...params.skipAgentDiscovery ? { skipAgentDiscovery: true } : {},
		authProfileId: params.profileId,
		preferredProfile: params.preferredProfile
	});
	if (!resolved.model) return { error: resolved.error ?? `Unknown model: ${params.provider}/${params.modelId}` };
	const initialModel = resolved.model;
	let resolvedModel = initialModel;
	const routeResolution = resolveOpenAIModelRoutes({
		provider: initialModel.provider,
		modelId: initialModel.id,
		api: initialModel.api,
		baseUrl: initialModel.baseUrl,
		config: params.cfg,
		env: process.env
	});
	const resolvesAuthBeforePhysicalRoute = routeResolution?.kind === "routes" && routeResolution.routes.length > 1;
	let auth;
	const authStore = params.bindAuthOwner ? ensureAuthProfileStore(params.agentDir, {
		readOnly: true,
		allowKeychainPrompt: false,
		config: params.cfg
	}) : void 0;
	try {
		auth = resolvesAuthBeforePhysicalRoute ? await resolveApiKeyForProviderCore({
			provider: initialModel.provider,
			cfg: params.cfg,
			agentDir: params.agentDir,
			workspaceDir,
			profileId: params.profileId,
			preferredProfile: params.preferredProfile,
			...authStore ? { store: authStore } : {},
			...params.bindAuthOwner && params.profileId ? { lockedProfile: true } : {},
			modelId: initialModel.id,
			secretSentinels: true
		}) : await getApiKeyForModelCore({
			model: initialModel,
			cfg: params.cfg,
			agentDir: params.agentDir,
			workspaceDir,
			profileId: params.profileId,
			preferredProfile: params.preferredProfile,
			...authStore ? { store: authStore } : {},
			...params.bindAuthOwner && params.profileId ? { lockedProfile: true } : {},
			secretSentinels: true
		});
		if (routeResolution?.kind === "routes") {
			const source = auth.profileId ? {
				kind: "profile",
				profileId: auth.profileId,
				provider: initialModel.provider,
				mode: auth.mode,
				readiness: "ready",
				cooldown: "clear"
			} : buildProviderModelAuthDirectSource({
				mode: auth.mode,
				availability: true,
				evidence: "runtime",
				authorization: "declared"
			});
			const routeAuthDecision = selectOpenAIModelRouteAuth({
				resolution: routeResolution,
				sourcePlan: buildProviderModelAuthSourcePlan({
					ownership: {
						reason: "provider-binding",
						source
					},
					profiles: []
				})
			});
			if (routeAuthDecision.kind !== "selected") throw new Error(routeAuthDecision.kind === "rejected" ? routeAuthDecision.message : "OpenAI route selection unexpectedly deferred after auth was resolved.");
			const route = routeAuthDecision.selection.route;
			const plan = buildAgentRuntimeAuthPlan({
				provider: initialModel.provider,
				modelId: initialModel.id,
				authProfileProvider: initialModel.provider,
				authProfileMode: auth.mode,
				sessionAuthProfileId: auth.profileId,
				sessionAuthProfileSource: params.profileId ? "user" : "auto",
				modelRoute: {
					provider: initialModel.provider,
					modelId: initialModel.id,
					api: route.api,
					baseUrl: route.baseUrl,
					authRequirement: route.authRequirement,
					requestTransportOverrides: route.requestTransportOverrides,
					runtimePolicy: route.runtimePolicy
				},
				config: params.cfg,
				workspaceDir
			});
			resolvedModel = await materializePreparedRuntimeModel({
				plan,
				provider: initialModel.provider,
				modelId: initialModel.id,
				config: params.cfg,
				model: initialModel,
				resolveModel: ({ config, authProfileId, authProfileMode }) => modelResolver(initialModel.provider, initialModel.id, params.agentDir, config, {
					...params.agentId ? { agentId: params.agentId } : {},
					skipAgentDiscovery: true,
					allowBundledStaticCatalogFallback: true,
					preferBundledStaticCatalogTransport: true,
					authProfileId,
					authProfileMode
				})
			}) ?? initialModel;
			if (resolvesAuthBeforePhysicalRoute) auth = await getApiKeyForModelCore({
				model: resolvedModel,
				cfg: params.cfg,
				agentDir: params.agentDir,
				workspaceDir,
				profileId: auth.profileId,
				preferredProfile: params.preferredProfile,
				...authStore ? { store: authStore } : {},
				...params.bindAuthOwner && params.profileId ? { lockedProfile: true } : {},
				secretSentinels: true
			});
		}
	} catch (err) {
		return { error: `Auth lookup failed for provider "${initialModel.provider}": ${formatErrorMessage(err)}` };
	}
	const rawApiKey = auth.apiKey?.trim();
	if (!rawApiKey && !params.allowMissingApiKeyModes?.includes(auth.mode)) return {
		error: formatMissingAuthError(auth, resolvedModel.provider),
		auth
	};
	let authValue = rawApiKey;
	if (rawApiKey) {
		const preparedAuth = protectPreparedProviderRuntimeAuth({
			provider: resolvedModel.provider,
			preparedAuth: await prepareProviderRuntimeAuth({
				provider: resolvedModel.provider,
				config: params.cfg,
				workspaceDir,
				env: process.env,
				context: {
					config: params.cfg,
					workspaceDir,
					env: process.env,
					provider: resolvedModel.provider,
					modelId: resolvedModel.id,
					model: resolvedModel,
					apiKey: rawApiKey,
					authMode: auth.mode,
					profileId: auth.profileId
				}
			})
		});
		authValue = preparedAuth?.apiKey?.trim() || rawApiKey;
		resolved.authStorage.setRuntimeApiKey(resolvedModel.provider, authValue);
		resolvedModel = applyPreparedRuntimeAuthToModel(resolvedModel, preparedAuth);
	}
	const resolvedAuth = {
		...auth,
		apiKey: authValue
	};
	const profileCredential = params.profileId ? authStore?.profiles[params.profileId] : void 0;
	const sourceAuthFingerprint = params.bindAuthOwner ? profileCredential?.type === "oauth" && params.profileId ? fingerprintAuthProfileCredential({
		profileId: params.profileId,
		credential: profileCredential
	}) : fingerprintResolvedProviderAuth(auth) : void 0;
	const modelRuntime = getModelRegistryRuntime(resolved.modelRegistry);
	const model = applySecretRefHeaderSentinels(applyLocalNoAuthHeaderOverride(resolvedModel, resolvedAuth), params.cfg);
	const completionTransport = prepareModelForSimpleCompletion({
		apiRegistry: modelRuntime.apiRegistry,
		model,
		cfg: params.cfg
	});
	return {
		model: bindModelLlmRuntime(model, modelRuntime.llmRuntime, completionTransport),
		auth: resolvedAuth,
		...sourceAuthFingerprint ? { sourceAuthFingerprint } : {}
	};
}
async function withPreparedSimpleCompletionRuntime(params, runtimePluginSelections, run) {
	const config = params.cfg ?? {};
	const agentId = params.agentId ?? resolveDefaultAgentId(config);
	const agentDir = params.agentDir?.trim() || resolveAgentDir(config, agentId);
	const requestedWorkspaceDir = params.workspaceDir ?? params.preparedModelRuntime?.workspaceDir ?? resolveAgentWorkspaceDir(config, agentId);
	const lease = params.preparedModelRuntime ? void 0 : await acquireAgentRunPreparedModelRuntime({
		config,
		agentId,
		agentDir,
		workspaceDir: requestedWorkspaceDir,
		loadRuntimePlugins: true,
		runtimePluginSelections: runtimePluginSelections.map((selection) => ({
			...selection,
			agentId,
			...params.runtimePluginScope ? { pluginScope: params.runtimePluginScope } : {} // infer-latency
		}))
	}, {
		catalogMode: "static",
		...params.pluginMetadataSnapshot ? { pluginMetadataSnapshot: params.pluginMetadataSnapshot } : {}
	});
	const preparedModelRuntime = params.preparedModelRuntime ?? lease.snapshot;
	const context = createPreparedSimpleCompletionResolverContext({
		preparedModelRuntime,
		workspaceDir: params.workspaceDir ?? preparedModelRuntime.workspaceDir ?? requestedWorkspaceDir,
		modelResolver: params.modelResolver,
		agentRuntimeId: params.agentRuntimeId
	});
	try {
		return await withPluginRuntimeGenerationScope(preparedModelRuntime, () => run(context));
	} finally {
		lease?.release();
	}
}
async function prepareSimpleCompletionModelForAgent(params) {
	const selectionParams = {
		cfg: params.cfg,
		agentId: params.agentId,
		agentDir: params.agentDir,
		modelRef: params.modelRef,
		useUtilityModel: params.useUtilityModel
	};
	const tentativeRequest = resolveSimpleCompletionSelectionRequest(selectionParams);
	if (!tentativeRequest) return { error: `No model configured for agent ${params.agentId}.` };
	const tentativeSelection = tentativeRequest.selection;
	const workspaceDir = resolveAgentWorkspaceDir(params.cfg, params.agentId);
	const pluginIdScope = createAgentRuntimeMetadataPluginIdScope({
		config: params.cfg,
		workspaceDir,
		selections: [{
			provider: tentativeSelection.provider,
			modelId: tentativeSelection.modelId,
			agentId: params.agentId,
			...params.runtimePluginScope ? { pluginScope: params.runtimePluginScope } : {}
		}],
		...tentativeRequest.shorthandModelId ? { shorthandModelIds: [tentativeRequest.shorthandModelId] } : {}
	});
	let metadataSnapshot = resolvePluginMetadataSnapshot({
		config: params.cfg,
		env: process.env,
		workspaceDir,
		pluginIdScope,
		allowWorkspaceScopedCurrent: true
	});
	const resolveSelection = () => resolveSimpleCompletionSelectionForAgent({
		...selectionParams,
		manifestPlugins: metadataSnapshot
	});
	let selection = resolveSelection();
	if (!selection) return { error: `No model configured for agent ${params.agentId}.` };
	const canonicalPluginIdScope = createAgentRuntimeMetadataPluginIdScope({
		config: params.cfg,
		workspaceDir,
		selections: [{
			provider: selection.provider,
			modelId: selection.modelId,
			agentId: params.agentId,
			...params.runtimePluginScope ? { pluginScope: params.runtimePluginScope } : {}
		}],
		...tentativeRequest.shorthandModelId && selection.provider === tentativeSelection.provider && selection.modelId === tentativeSelection.modelId ? { shorthandModelIds: [tentativeRequest.shorthandModelId] } : {}
	});
	if (canonicalPluginIdScope.key !== pluginIdScope.key) {
		metadataSnapshot = resolvePluginMetadataSnapshot({
			config: params.cfg,
			env: process.env,
			workspaceDir,
			pluginIdScope: canonicalPluginIdScope,
			allowWorkspaceScopedCurrent: true
		});
		selection = resolveSelection();
		if (!selection) return { error: `No model configured for agent ${params.agentId}.` };
	}
	return await withPreparedSimpleCompletionRuntime({
		...params,
		agentDir: selection.agentDir,
		pluginMetadataSnapshot: metadataSnapshot
	}, [{
		provider: selection.provider,
		modelId: selection.modelId
	}], async (context) => {
		return {
			...await prepareSimpleCompletionModelCore({
				cfg: params.cfg,
				agentId: params.agentId,
				provider: selection.provider,
				modelId: selection.modelId,
				agentDir: selection.agentDir,
				profileId: selection.profileId,
				preferredProfile: params.preferredProfile,
				allowMissingApiKeyModes: params.allowMissingApiKeyModes,
				...params.allowBundledStaticCatalogFallback !== void 0 ? { allowBundledStaticCatalogFallback: params.allowBundledStaticCatalogFallback } : {},
				skipAgentDiscovery: params.skipAgentDiscovery,
				bindAuthOwner: params.bindAuthOwner
			}, context),
			selection
		};
	});
}
async function completeWithPreparedSimpleCompletionModel(params) {
	const runtime = getModelLlmRuntime(params.model);
	let completionModel = getModelCompletionTransport(params.model) ?? prepareModelForSimpleCompletion({
		apiRegistry: runtime?.registry ?? defaultApiRegistry,
		model: params.model,
		cfg: params.cfg
	});
	if (runtime) completionModel = bindModelLlmRuntime(completionModel, runtime);
	const { reasoning: rawReasoning, strictReasoningTags, ...options } = params.options ?? {};
	const reasoning = normalizeSimpleCompletionReasoning(rawReasoning, completionModel);
	const completionOptions = {
		...options,
		...reasoning ? { reasoning } : {},
		apiKey: params.auth.apiKey
	};
	if (strictReasoningTags) reasoningTagTextPolicy.markStrict(completionOptions);
	return await completeSimple(completionModel, params.context, completionOptions);
}
function normalizeSimpleCompletionReasoning(reasoning, model) {
	switch (reasoning) {
		case void 0: return;
		case "off": return resolveClaudeSonnet5ModelIdentity(model) || resolveClaudeOpus5ModelIdentity(model) ? "off" : void 0;
		case "adaptive": return "medium";
		case "ultra":
		case "max": return isOpenAIProvider(model.provider) && supportsOpenAIReasoningEffort(model, "max") ? "max" : "xhigh";
		default: return reasoning;
	}
}
//#endregion
export { resolveSimpleCompletionSelectionForAgent as i, prepareSimpleCompletionModel as n, prepareSimpleCompletionModelForAgent as r, completeWithPreparedSimpleCompletionModel as t };
