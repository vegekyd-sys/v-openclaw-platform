import "./src-vebZIeLe.js";
import { t as stableStringify } from "./stable-stringify-C8X7niaI.js";
import { n as findNormalizedProviderValue, r as normalizeProviderId } from "./provider-id-DMd-TDFp.js";
import { i as parseModelCatalogRef, t as buildModelCatalogMergeKey } from "./model-catalog-refs-BdjEHOKQ.js";
import { n as sha256Base64Url } from "./crypto-digest-IGAbV2KW.js";
import { l as normalizePluginsConfig } from "./config-state-B-P4NhQV.js";
import { n as getCurrentPluginMetadataSnapshot } from "./current-plugin-metadata-snapshot-BqMIdsHK.js";
import { c as resolvePluginMetadataSnapshot } from "./plugin-metadata-snapshot-BuNx7zRZ.js";
import { k as withAgentRosterFactsBatch } from "./agent-scope-config-CUiGBd59.js";
import { u as hashRuntimeConfigValue } from "./runtime-snapshot-BVoUH4MI.js";
import { f as parseConfiguredModelVisibilityEntries, r as buildConfiguredModelCatalog } from "./model-selection-shared-BUMiYTyL.js";
import { M as getPreparedMessageToolCatalog, N as getPreparedMessageToolCatalogForRegistry, d as getActivePluginRegistry, h as getActivePluginRuntimeSubagentMode, m as getActivePluginRegistryWorkspaceDir } from "./runtime-MupoouIC.js";
import { d as withPluginRuntimeRegistryScope } from "./gateway-request-scope-CmMd3nUp.js";
import { c as mergeAuthProfileStores } from "./persisted-DzIu-muU.js";
import { i as listRuntimePluginIdsFromRegistry, o as registryMatchesManifestPluginIds } from "./active-runtime-registry-D12UHfQh.js";
import { n as withPluginRuntimeGenerationScope } from "./generation-scope-CcvBHxkU.js";
import { a as setPluginRuntimeLoadContext } from "./load-context-Ck0KAI4Z.js";
import { o as resolveLoadedProviderRuntimePlugin } from "./provider-hook-runtime-CsaSWxqC.js";
import { a as getPreparedRuntimeAuthProfileStoreSnapshotCore, o as getRuntimeAuthProfileStoreCredentialsRevision } from "./runtime-snapshots-C1iF8uaR.js";
import { a as ensureAuthProfileStoreWithoutExternalProfiles, s as getPreparedRuntimeAuthProfileStoreSnapshot } from "./store-CZzbMlii.js";
import { n as resolveRuntimeSyntheticAuthProviderRefs } from "./synthetic-auth.runtime.js";
import { a as modelCatalogEntryKey, d as resolveAmbientAgentCredentialsForDiscovery, l as discoverModelsFromCapturedSources, n as createPreparedPluginGeneration, o as prepareConfiguredRuntimeFacts, s as discoverAuthStorageFacts } from "./prepared-model-runtime.plugin-generation-pQZavE54.js";
import "./sessions-CHgQo4vL.js";
import { s as loadPersistedPluginModelCatalogsReadOnly, u as resolvePluginModelCatalogOwnerPluginId } from "./plugin-model-catalog-55XYIoBQ.js";
import { t as buildInlineProviderModels } from "./model.inline-provider-BWYR64i_.js";
import { n as createBundledStaticCatalogModelResolver, r as loadBundledProviderStaticCatalogContextModels, s as createStaticModelIdMatcher } from "./model.static-catalog-B4mBD5e6.js";
import { a as prepareRuntimeCapabilityModels, i as prepareConfiguredRuntimeModels, n as collectPreparedModelRuntimeConfiguredRefs, o as toStaticCatalogEntry, r as collectPreparedModelRuntimeProviderIds, t as collectConfiguredProviderIdsNeedingStaticCatalog } from "./prepared-model-runtime.configured-B_V2AuhE.js";
import { t as createAgentRuntimeMetadataPluginIdScope } from "./runtime-plugin-load-plan-Bm46qisR.js";
import { n as prepareMediaCapabilityProviders } from "./capability-provider-runtime-D-IsNQEm.js";
import { n as planOpenClawModelsJsonSource, r as prepareImplicitProviderStaticCatalog, t as ensureOpenClawModelsJson } from "./models-config-DnRg51uw.js";
import { t as resolvePluginRuntimeLoadContext } from "./load-context.resolve-Zn_Yuxnc.js";
import { t as loadAgentRuntimePluginRegistryHandle } from "./runtime-plugins-CWkOjN1D.js";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
//#region src/agents/prepared-model-runtime.auth-store.ts
const defaultDeps = {
	loadDurable: (input) => ensureAuthProfileStoreWithoutExternalProfiles(input.agentDir, {
		allowKeychainPrompt: false,
		...input.inheritedAuthDir ? { inheritedAuthDir: input.inheritedAuthDir } : {},
		readOnly: true
	}),
	loadPublished: (input) => getPreparedRuntimeAuthProfileStoreSnapshot(input.agentDir, input.inheritedAuthDir)
};
/** Merges runtime-only external auth over durable profiles for one replacement generation. */
function loadPreparedModelRuntimeAuthStore(input, deps = defaultDeps) {
	const published = deps.loadPublished(input);
	if (!published || published.runtimeExternalProfileIds === void 0 && published.runtimeExternalProfileIdsAuthoritative !== true) return;
	return mergeAuthProfileStores(deps.loadDurable(input), published);
}
//#endregion
//#region src/agents/prepared-model-runtime.configured-completion.ts
function completeConfiguredRuntimeModels(params) {
	const existing = new Map(params.configuredRuntimeModels.map((configured) => [buildModelCatalogMergeKey(configured.provider, configured.modelId), configured]));
	const completed = [];
	const seen = /* @__PURE__ */ new Set();
	for (const ref of params.configuredModelRefs) {
		const key = buildModelCatalogMergeKey(ref.provider, ref.modelId);
		if (seen.has(key)) continue;
		seen.add(key);
		const model = existing.get(key)?.model ?? params.resolveDynamicModel(ref);
		if (model) completed.push({
			...ref,
			model
		});
	}
	return completed;
}
//#endregion
//#region src/agents/prepared-model-runtime.plugin-context.ts
const emptyPluginDiscovery = {
	candidates: [],
	diagnostics: []
};
/** Resolves and attaches the plugin facts owned by one prepared workspace generation. */
function prepareOwnedPluginLoadContext(input, env, registry, preparedMetadataSnapshot, preferBuiltPluginArtifacts = false) {
	const metadataSnapshot = preparedMetadataSnapshot ?? resolvePluginMetadataSnapshot({
		config: input.config,
		env,
		...input.workspaceDir ? {
			workspaceDir: input.workspaceDir,
			allowWorkspaceScopedCurrent: true
		} : {},
		...input.loadRuntimePlugins && input.runtimePluginSelections && input.workspaceDir ? { pluginIdScope: createAgentRuntimeMetadataPluginIdScope({
			config: input.config,
			workspaceDir: input.workspaceDir,
			selections: input.runtimePluginSelections
		}) } : {}
	});
	if (!registry) return metadataSnapshot;
	const { config } = input;
	const workspaceDir = metadataSnapshot.workspaceDir ?? input.workspaceDir;
	const discoverySnapshot = metadataSnapshot.discovery ? metadataSnapshot : {
		...metadataSnapshot,
		discovery: emptyPluginDiscovery
	};
	const context = {
		...resolvePluginRuntimeLoadContext({
			config,
			env,
			workspaceDir,
			metadataSnapshot: discoverySnapshot,
			manifestRegistry: metadataSnapshot.manifestRegistry,
			preferBuiltPluginArtifacts
		}),
		metadataSnapshot
	};
	setPluginRuntimeLoadContext(registry, context);
	return metadataSnapshot;
}
//#endregion
//#region src/agents/prepared-model-runtime.inbound-registry.ts
function inboundRegistryIdentity(input) {
	return JSON.stringify({
		config: hashRuntimeConfigValue(input.config),
		env: hashRuntimeConfigValue(input.env ?? process.env),
		workspaceDir: input.workspaceDir,
		allowGatewaySubagentBinding: input.allowGatewaySubagentBinding === true
	});
}
/** Groups model-selected workspace facts while keeping generic inbound identity narrower. */
function preparedModelRuntimeWorkspaceFactsKey(input) {
	return JSON.stringify({
		config: hashRuntimeConfigValue(input.config),
		env: hashRuntimeConfigValue(input.env ?? process.env),
		readOnly: input.readOnly === true,
		loadRuntimePlugins: input.loadRuntimePlugins === true,
		workspaceDir: input.workspaceDir,
		allowGatewaySubagentBinding: input.allowGatewaySubagentBinding === true,
		runtimePluginSelections: input.runtimePluginSelections?.map(({ provider, runtime, pluginScope }) => ({
			provider,
			runtime,
			...pluginScope ? { pluginScope } : {} // infer-latency
		}))
	});
}
/** Loads generic plugin facts without acquiring model, catalog, or credential state. */
function loadPreparedInboundPluginRegistry(input, metadataSnapshot = prepareOwnedPluginLoadContext(input, input.env ?? process.env, void 0), configuredHarnessRuntimes) {
	const activeRegistry = getActivePluginRegistry();
	const registry = (input.allowGatewaySubagentBinding === true && input.env === void 0 && getActivePluginRuntimeSubagentMode() === "gateway-bindable" && activeRegistry && getActivePluginRegistryWorkspaceDir() === metadataSnapshot.workspaceDir && getCurrentPluginMetadataSnapshot({
		config: input.config,
		workspaceDir: metadataSnapshot.workspaceDir,
		allowWorkspaceScopedSnapshot: true
	}) === metadataSnapshot && registryMatchesManifestPluginIds(activeRegistry, metadataSnapshot.manifestRegistry.plugins, listRuntimePluginIdsFromRegistry(activeRegistry)) ? activeRegistry : void 0) ?? loadAgentRuntimePluginRegistryHandle({
		config: input.config,
		env: input.env ?? process.env,
		...input.workspaceDir ? { workspaceDir: input.workspaceDir } : {},
		...input.allowGatewaySubagentBinding ? { allowGatewaySubagentBinding: true } : {},
		metadataSnapshot,
		preferBuiltPluginArtifacts: true,
		configuredHarnessRuntimes
	});
	prepareOwnedPluginLoadContext(input, input.env ?? process.env, registry, metadataSnapshot, true);
	return registry;
}
/** Creates one lifecycle-batch loader that shares exact generic registry identities. */
function createPreparedInboundRegistryLoader() {
	const registries = /* @__PURE__ */ new Map();
	return (input, metadataSnapshot, configuredHarnessRuntimes) => {
		const key = inboundRegistryIdentity(input);
		const existing = registries.get(key);
		if (existing?.metadataSnapshot === metadataSnapshot) return existing.registry;
		const registry = loadPreparedInboundPluginRegistry(input, metadataSnapshot, configuredHarnessRuntimes);
		registries.set(key, {
			metadataSnapshot,
			registry
		});
		return registry;
	};
}
/** Prepares distinct generic-inbound and model-selected registries for one workspace generation. */
function prepareWorkspacePluginRegistries(input, metadataSnapshot, loadInboundRegistry, preferBuiltPluginArtifacts = false, reusableGeneration, getConfiguredHarnessRuntimes, basePluginIds) {
	if (input.readOnly && !input.loadRuntimePlugins && !input.runtimePluginSelections) return {};
	const inboundPluginRegistry = input.readOnly ? void 0 : reusableGeneration?.inboundPluginRegistry ?? loadInboundRegistry?.(input, metadataSnapshot, getConfiguredHarnessRuntimes?.());
	const baseRegistry = reusableGeneration?.pluginRegistry ?? inboundPluginRegistry;
	return {
		runtimePluginRegistry: input.runtimePluginSelections || !baseRegistry ? loadAgentRuntimePluginRegistryHandle({
			...input.loadRuntimePlugins ? { basePluginIds: [] } : baseRegistry ? { basePluginIds: listRuntimePluginIdsFromRegistry(baseRegistry) } : basePluginIds !== void 0 ? { basePluginIds } : {},
			...reusableGeneration?.pluginRegistry ? { reusableRegistry: reusableGeneration.pluginRegistry } : {},
			config: input.config,
			env: input.env ?? process.env,
			...input.workspaceDir ? { workspaceDir: input.workspaceDir } : {},
			...input.allowGatewaySubagentBinding ? { allowGatewaySubagentBinding: true } : {},
			metadataSnapshot,
			...preferBuiltPluginArtifacts ? { preferBuiltPluginArtifacts: true } : {},
			selections: input.runtimePluginSelections,
			configuredHarnessRuntimes: getConfiguredHarnessRuntimes?.()
		}) : baseRegistry,
		...inboundPluginRegistry ? { inboundPluginRegistry } : {}
	};
}
//#endregion
//#region src/agents/prepared-model-runtime.synthetic-auth.ts
/** Synthetic-auth provider ref selection and prepared-catalog resolution for model-runtime builds. */
function scopeSyntheticAuthProviderRefs(refs, providerDiscoveryProviderIds) {
	if (!providerDiscoveryProviderIds) return [...refs];
	const scoped = new Set(providerDiscoveryProviderIds.map((id) => normalizeProviderId(id)));
	return refs.filter((ref) => scoped.has(normalizeProviderId(ref)));
}
function listPreparedSyntheticAuthProviderRefs(providers) {
	return [...new Set(providers.flatMap((provider) => typeof provider.resolveSyntheticAuth === "function" ? [
		provider.id,
		...provider.aliases ?? [],
		...provider.hookAliases ?? []
	] : []))].toSorted((left, right) => left.localeCompare(right));
}
function resolvePreparedSyntheticAuth(params) {
	const normalizedProvider = normalizeProviderId(params.provider);
	return params.providers.find((candidate) => [
		candidate.id,
		...candidate.aliases ?? [],
		...candidate.hookAliases ?? []
	].some((ref) => normalizeProviderId(ref) === normalizedProvider))?.resolveSyntheticAuth?.({
		config: params.config,
		provider: params.provider,
		providerConfig: Object.entries(params.config.models?.providers ?? {}).find(([providerId]) => normalizeProviderId(providerId) === normalizedProvider)?.[1]
	}) ?? void 0;
}
//#endregion
//#region src/agents/prepared-model-runtime.facts.ts
const MODEL_RUNTIME_PROVIDER_DISCOVERY_TIMEOUT_MS = 5e3;
function prepareAgentFacts(input, catalogMode, ambientCredentials, additionalProviderIds = [], includeCredentialProviders = catalogMode === "live") {
	const env = input.env ?? process.env;
	const preparedStore = loadPreparedModelRuntimeAuthStore(input);
	const authFacts = discoverAuthStorageFacts(input.agentDir, {
		config: input.config,
		readOnly: true,
		ambientCredentials,
		...preparedStore ? { preparedStore } : {},
		...input.skipCredentials ? { skipCredentials: true } : {},
		...input.inheritedAuthDir ? { inheritedAuthDir: input.inheritedAuthDir } : {},
		...input.workspaceDir ? { workspaceDir: input.workspaceDir } : {},
		...input.env ? { env } : {}
	});
	const credentials = authFacts.credentials;
	const templateAuthStorage = authFacts.authStorage;
	const rawConfiguredModelRefs = collectPreparedModelRuntimeConfiguredRefs(input.config, input.agentId);
	return {
		input,
		env,
		authStore: authFacts.store,
		templateAuthStorage,
		credentials,
		configuredModelRefs: rawConfiguredModelRefs.flatMap(({ value }) => {
			const ref = parseModelCatalogRef(value);
			return ref ? [ref] : [];
		}),
		providerIds: [.../* @__PURE__ */ new Set([
			...collectPreparedModelRuntimeProviderIds(input.config, credentials, includeCredentialProviders, rawConfiguredModelRefs, input.agentId),
			...parseConfiguredModelVisibilityEntries({
				cfg: input.config,
				agentId: input.agentId
			}).providerWildcards,
			...additionalProviderIds.map(normalizeProviderId).filter(Boolean)
		])].toSorted((left, right) => left.localeCompare(right))
	};
}
async function prepareWorkspaceBuildGroup(inputs, catalogMode, options = {}, loadInboundPluginRegistry, reusablePluginGeneration, preparedPluginMetadataSnapshot) {
	const input = inputs[0];
	if (!input) throw new Error("prepared model runtime workspace group is empty");
	const env = input.env ?? process.env;
	const pluginMetadataStartedAt = performance.now();
	const pluginMetadataSnapshot = preparedPluginMetadataSnapshot ?? reusablePluginGeneration?.pluginMetadataSnapshot ?? prepareOwnedPluginLoadContext(input, env, void 0);
	const pluginMetadataMs = reusablePluginGeneration ? 0 : performance.now() - pluginMetadataStartedAt;
	const runtimePluginStartedAt = performance.now();
	const preferBuiltPluginArtifacts = reusablePluginGeneration?.preferBuiltPluginArtifacts ?? options.preferBuiltPluginArtifacts === true;
	const { inboundPluginRegistry, runtimePluginRegistry } = prepareWorkspacePluginRegistries(input, pluginMetadataSnapshot, loadInboundPluginRegistry, preferBuiltPluginArtifacts, reusablePluginGeneration, options.getConfiguredHarnessRuntimes, options.basePluginIds);
	const reuseRuntimeFacts = reusablePluginGeneration && runtimePluginRegistry === reusablePluginGeneration.pluginRegistry;
	const runtimePluginMs = performance.now() - runtimePluginStartedAt;
	prepareOwnedPluginLoadContext(input, env, runtimePluginRegistry, pluginMetadataSnapshot, preferBuiltPluginArtifacts);
	const prepare = async () => {
		const matchesStaticModelId = createStaticModelIdMatcher({ manifestPlugins: pluginMetadataSnapshot });
		const mediaCapabilityProviders = reuseRuntimeFacts ? reusablePluginGeneration.mediaCapabilityProviders : input.readOnly || !runtimePluginRegistry ? void 0 : prepareMediaCapabilityProviders({
			cfg: input.config,
			pluginMetadataSnapshot,
			registry: runtimePluginRegistry
		});
		const messageToolCatalog = reuseRuntimeFacts ? reusablePluginGeneration.messageToolCatalog : runtimePluginRegistry ? getPreparedMessageToolCatalogForRegistry(runtimePluginRegistry) : catalogMode === "live" ? getPreparedMessageToolCatalog() : void 0;
		const resolveManifestStaticCatalogModel = createBundledStaticCatalogModelResolver({
			cfg: input.config,
			env,
			includeRuntimeDiscovery: true,
			metadataSnapshot: pluginMetadataSnapshot,
			...input.workspaceDir ? { workspaceDir: input.workspaceDir } : {}
		});
		const configuredManifestModels = /* @__PURE__ */ new Map();
		const resolveConfiguredManifestModel = (lookup) => {
			const key = `${normalizeProviderId(lookup.provider)}\0${lookup.modelId.trim().toLowerCase()}`;
			if (configuredManifestModels.has(key)) return configuredManifestModels.get(key);
			const model = resolveManifestStaticCatalogModel(lookup);
			configuredManifestModels.set(key, model);
			return model;
		};
		const configuredProviderIds = [.../* @__PURE__ */ new Set([...inputs.flatMap(({ config, agentId }) => withAgentRosterFactsBatch(config, () => [...collectPreparedModelRuntimeProviderIds(config, {}, false, collectPreparedModelRuntimeConfiguredRefs(config, agentId), agentId), ...parseConfiguredModelVisibilityEntries({
			cfg: config,
			agentId
		}).providerWildcards])), ...(options.providerDiscoveryProviderIds ?? []).map(normalizeProviderId).filter(Boolean)])].toSorted((left, right) => left.localeCompare(right));
		const staticCatalogProviderIds = [.../* @__PURE__ */ new Set([...collectConfiguredProviderIdsNeedingStaticCatalog({
			config: input.config,
			matchesStaticModelId,
			resolveStaticCatalogModel: resolveConfiguredManifestModel
		}), ...(options.providerDiscoveryProviderIds ?? []).map(normalizeProviderId).filter(Boolean)])].toSorted((left, right) => left.localeCompare(right));
		const staticProviderCatalogStartedAt = performance.now();
		let preparedStaticProviderCatalog = reusablePluginGeneration ? reusablePluginGeneration.preparedStaticProviderCatalog : catalogMode === "static" ? await prepareImplicitProviderStaticCatalog({
			config: input.config,
			env,
			pluginMetadataSnapshot,
			providerDiscoveryProviderIds: configuredProviderIds,
			staticCatalogProviderIds,
			...input.workspaceDir ? { workspaceDir: input.workspaceDir } : {}
		}) : void 0;
		if (catalogMode === "static" && reusablePluginGeneration && !reuseRuntimeFacts && runtimePluginRegistry?.providers.length) preparedStaticProviderCatalog = Object.freeze({
			entries: preparedStaticProviderCatalog?.entries ?? [],
			providers: Object.freeze([...new Map([...(preparedStaticProviderCatalog?.providers ?? []).map((provider) => [provider.id, provider]), ...runtimePluginRegistry.providers.map(({ provider }) => [provider.id, provider])]).values()])
		});
		const staticProviderCatalogMs = reusablePluginGeneration ? 0 : performance.now() - staticProviderCatalogStartedAt;
		const preparedSyntheticAuthProviders = preparedStaticProviderCatalog?.providers ?? [];
		const ambientCredentialsStartedAt = performance.now();
		const ambientCredentials = resolveAmbientAgentCredentialsForDiscovery({
			config: input.config,
			env,
			authoritativeSyntheticAuthProviderRefs: pluginMetadataSnapshot.owners.cliBackends.keys(),
			syntheticAuthProviderRefs: catalogMode === "static" ? listPreparedSyntheticAuthProviderRefs(preparedSyntheticAuthProviders) : scopeSyntheticAuthProviderRefs(resolveRuntimeSyntheticAuthProviderRefs({
				config: input.config,
				env,
				index: pluginMetadataSnapshot.index,
				registryDiagnostics: pluginMetadataSnapshot.registryDiagnostics,
				...input.workspaceDir ? { workspaceDir: input.workspaceDir } : {}
			}), configuredProviderIds),
			...catalogMode === "static" ? { resolveSyntheticAuth: (provider) => resolvePreparedSyntheticAuth({
				config: input.config,
				provider,
				providers: preparedSyntheticAuthProviders
			}) } : {},
			...input.workspaceDir ? { workspaceDir: input.workspaceDir } : {}
		});
		const ambientCredentialsMs = performance.now() - ambientCredentialsStartedAt;
		const agentFactsStartedAt = performance.now();
		const agentBaseFacts = inputs.map((candidate) => withAgentRosterFactsBatch(candidate.config, () => prepareAgentFacts(candidate, catalogMode, ambientCredentials, options.providerDiscoveryProviderIds, options.includeCredentialProviders)));
		const agentFactsMs = performance.now() - agentFactsStartedAt;
		const configuredProjectionStartedAt = performance.now();
		const providerStaticModels = reusablePluginGeneration?.providerStaticModels ?? (catalogMode === "static" ? [] : await loadBundledProviderStaticCatalogContextModels({
			cfg: input.config,
			env,
			metadataSnapshot: pluginMetadataSnapshot,
			...input.workspaceDir ? { workspaceDir: input.workspaceDir } : {}
		}));
		const inlineProviderModels = reusablePluginGeneration?.inlineProviderModels ?? buildInlineProviderModels(input.config.models?.providers ?? {}, { providerMetadataOwners: pluginMetadataSnapshot.owners });
		const configuredCatalogEntries = reusablePluginGeneration?.configuredCatalogEntries ?? buildConfiguredModelCatalog({
			cfg: input.config,
			manifestPlugins: pluginMetadataSnapshot,
			...input.workspaceDir ? { workspaceDir: input.workspaceDir } : {}
		});
		const agentFacts = [];
		for (const facts of agentBaseFacts) {
			const configuredRuntimeModels = prepareConfiguredRuntimeModels({
				configuredModelRefs: facts.configuredModelRefs,
				metadataSnapshot: pluginMetadataSnapshot,
				...preparedStaticProviderCatalog ? { preparedStaticProviderCatalog } : {},
				providerStaticModels,
				matchesStaticModelId,
				resolveStaticCatalogModel: resolveConfiguredManifestModel
			});
			const runtimeCapabilityModels = prepareRuntimeCapabilityModels({
				config: facts.input.config,
				agentId: facts.input.agentId,
				candidates: [...configuredCatalogEntries, ...configuredRuntimeModels.map(({ model, modelId, provider }) => ({
					...toStaticCatalogEntry(model),
					id: modelId,
					provider
				}))],
				resolveRuntimeModel: resolveConfiguredManifestModel
			});
			const configuredEntryKeys = new Set(configuredCatalogEntries.map(modelCatalogEntryKey));
			for (const configured of configuredRuntimeModels) configuredEntryKeys.add(modelCatalogEntryKey({
				provider: configured.provider,
				id: configured.modelId
			}));
			const configuredGeneratedCatalogPluginIds = [...new Set(facts.configuredModelRefs.flatMap(({ provider, modelId }) => {
				if (configuredEntryKeys.has(modelCatalogEntryKey({
					provider,
					id: modelId
				}))) return [];
				const pluginId = resolvePluginModelCatalogOwnerPluginId({
					providerId: provider,
					pluginMetadataSnapshot
				});
				return pluginId ? [pluginId] : [];
			}))].toSorted((left, right) => left.localeCompare(right));
			agentFacts.push({
				...facts,
				configuredRuntimeModels,
				runtimeCapabilityModels,
				configuredGeneratedCatalogPluginIds
			});
		}
		const configuredProjectionMs = performance.now() - configuredProjectionStartedAt;
		const pluginGeneration = createPreparedPluginGeneration({
			catalogMode,
			configuredCatalogEntries,
			inboundPluginRegistry,
			inlineProviderModels,
			mediaCapabilityProviders,
			messageToolCatalog,
			pluginMetadataSnapshot,
			preparedStaticProviderCatalog,
			providerStaticModels,
			preferBuiltPluginArtifacts,
			reusablePluginGeneration,
			runtimePluginRegistry
		});
		return {
			agentFacts,
			buildStats: {
				runtimePluginMs,
				pluginMetadataMs,
				staticProviderCatalogMs,
				ambientCredentialsMs,
				agentFactsMs,
				configuredProjectionMs
			},
			pluginGeneration
		};
	};
	return await withPluginRuntimeGenerationScope({
		metadataSnapshot: pluginMetadataSnapshot,
		pluginRegistry: runtimePluginRegistry
	}, prepare);
}
function captureModelsJsonContents(agentDir) {
	try {
		return fs.readFileSync(path.join(agentDir, "models.json"), "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return null;
		throw error;
	}
}
const fingerprintPreparedRuntimeFacts = (value) => sha256Base64Url(stableStringify(value));
/** Record discovery scope before config projection or auth-owner publication can replace it. */
function preparedModelInventoryKey(input) {
	const { models, auth, env } = input.config;
	const plugins = normalizePluginsConfig(input.config.plugins);
	for (const entry of Object.values(plugins.entries)) entry.config ??= {};
	return fingerprintPreparedRuntimeFacts({
		...input,
		config: {
			models,
			auth,
			env,
			plugins
		},
		env: input.env ?? process.env,
		runtimePluginSelections: void 0,
		credentials: getRuntimeAuthProfileStoreCredentialsRevision(),
		order: getPreparedRuntimeAuthProfileStoreSnapshotCore(input.agentDir, input.inheritedAuthDir)?.order ?? {}
	});
}
function hasSameOAuthProviderGeneration(left, right) {
	return left.length === right.length && left.every((provider, index) => {
		const candidate = right[index];
		return candidate !== void 0 && provider.id === candidate.id && provider.name === candidate.name && provider.usesCallbackServer === candidate.usesCallbackServer && provider.login === candidate.login && provider.refreshToken === candidate.refreshToken && provider.getApiKey === candidate.getApiKey && provider.modifyModels === candidate.modifyModels;
	});
}
function groupConfiguredRegistrySources(agentFacts) {
	const groups = /* @__PURE__ */ new Map();
	for (const facts of agentFacts) {
		const modelsJsonContents = captureModelsJsonContents(facts.input.agentDir);
		const oauthProviders = facts.templateAuthStorage.getOAuthProviders();
		const pluginCatalogs = loadPersistedPluginModelCatalogsReadOnly(facts.input.agentDir, facts.configuredGeneratedCatalogPluginIds);
		const key = fingerprintPreparedRuntimeFacts({
			credentials: facts.credentials,
			modelsJsonContents,
			pluginCatalogs
		});
		const candidates = groups.get(key) ?? [];
		const group = candidates.find((candidate) => hasSameOAuthProviderGeneration(candidate.oauthProviders, oauthProviders));
		if (group) group.agentFacts.push(facts);
		else {
			candidates.push({
				agentFacts: [facts],
				modelsJsonContents,
				oauthProviders,
				pluginCatalogs
			});
			groups.set(key, candidates);
		}
	}
	return [...groups.values()].flat();
}
function prepareConfiguredRuntimeFactsBatch(params) {
	const catalogs = /* @__PURE__ */ new Map();
	let registryCount = 0;
	for (const group of groupConfiguredRegistrySources(params.agentFacts)) {
		const representative = group.agentFacts[0];
		if (!representative) continue;
		const templateModelRegistry = discoverModelsFromCapturedSources(representative.templateAuthStorage, {
			config: representative.input.config,
			includePluginCatalogs: true,
			modelsJsonContents: group.modelsJsonContents,
			pluginCatalogs: group.pluginCatalogs,
			pluginMetadataSnapshot: params.pluginGeneration.pluginMetadataSnapshot,
			...representative.input.workspaceDir ? { workspaceDir: representative.input.workspaceDir } : {}
		});
		registryCount += 1;
		withPluginRuntimeRegistryScope(params.pluginGeneration.pluginRegistry, () => {
			for (const facts of group.agentFacts) {
				const { input } = facts;
				const configuredRuntimeModels = params.pluginGeneration.pluginRegistry ? completeConfiguredRuntimeModels({
					configuredModelRefs: facts.configuredModelRefs,
					configuredRuntimeModels: facts.configuredRuntimeModels,
					resolveDynamicModel: ({ provider, modelId }) => {
						const providerConfig = input.config.models?.providers?.[provider] ?? findNormalizedProviderValue(input.config.models?.providers, provider);
						return resolveLoadedProviderRuntimePlugin({
							provider,
							modelId,
							config: input.config,
							workspaceDir: input.workspaceDir,
							env: facts.env
						})?.resolveDynamicModel?.({
							config: input.config,
							agentDir: input.agentDir,
							workspaceDir: input.workspaceDir,
							provider,
							modelId,
							modelRegistry: templateModelRegistry,
							providerConfig
						}) ?? void 0;
					}
				}) : facts.configuredRuntimeModels;
				catalogs.set(input, prepareConfiguredRuntimeFacts({
					agentFacts: facts,
					workspaceFacts: params.pluginGeneration,
					templateModelRegistry,
					configuredRuntimeModels
				}));
			}
		});
	}
	return {
		catalogs,
		registryCount
	};
}
async function prepareAgentCatalogSource(agentFacts, pluginGeneration, catalogMode, persist = true, sourceOptions = {}) {
	const { env, input, providerIds } = agentFacts;
	const providerOutcomes = /* @__PURE__ */ new Map();
	const recordProviderOutcome = (outcome) => {
		const provider = normalizeProviderId(outcome.provider);
		if (provider) providerOutcomes.set(`${provider}\0${outcome.profileId ?? ""}`, {
			...outcome,
			provider
		});
	};
	const resultOutcomes = () => [...providerOutcomes.values()].toSorted((left, right) => left.provider.localeCompare(right.provider) || (left.profileId ?? "").localeCompare(right.profileId ?? ""));
	const options = {
		pluginMetadataSnapshot: pluginGeneration.pluginMetadataSnapshot,
		providerDiscoveryProviderIds: sourceOptions.providerDiscoveryProviderIds ?? providerIds,
		...pluginGeneration.preparedStaticProviderCatalog ? { preparedStaticProviderCatalog: pluginGeneration.preparedStaticProviderCatalog } : {},
		...input.workspaceDir ? { workspaceDir: input.workspaceDir } : {},
		...input.env ? { env } : {},
		...catalogMode === "static" ? { providerDiscoveryEntriesOnly: true } : { providerDiscoveryTimeoutMs: MODEL_RUNTIME_PROVIDER_DISCOVERY_TIMEOUT_MS }
	};
	const prepareSource = async () => {
		if (!persist) {
			const source = await planOpenClawModelsJsonSource(input.config, input.agentDir, {
				...options,
				...sourceOptions.authStore ? { authStore: sourceOptions.authStore } : {},
				...catalogMode === "live" ? { onProviderCatalogOutcome: recordProviderOutcome } : {}
			});
			return {
				modelsJsonContents: source.modelsJsonContents,
				pluginCatalogs: source.pluginCatalogs,
				providerOutcomes: resultOutcomes()
			};
		}
		if (!input.readOnly) await ensureOpenClawModelsJson(input.config, input.agentDir, {
			...options,
			...catalogMode === "live" ? { onProviderCatalogOutcome: recordProviderOutcome } : {}
		});
		return {
			modelsJsonContents: captureModelsJsonContents(input.agentDir),
			pluginCatalogs: loadPersistedPluginModelCatalogsReadOnly(input.agentDir),
			providerOutcomes: resultOutcomes()
		};
	};
	const { pluginMetadataSnapshot: metadataSnapshot, pluginRegistry } = pluginGeneration;
	return pluginRegistry ? withPluginRuntimeGenerationScope({
		metadataSnapshot,
		pluginRegistry
	}, prepareSource) : prepareSource();
}
//#endregion
export { preparedModelInventoryKey as a, scopeSyntheticAuthProviderRefs as c, preparedModelRuntimeWorkspaceFactsKey as d, prepareOwnedPluginLoadContext as f, prepareWorkspaceBuildGroup as i, createPreparedInboundRegistryLoader as l, prepareAgentCatalogSource as n, listPreparedSyntheticAuthProviderRefs as o, prepareConfiguredRuntimeFactsBatch as r, resolvePreparedSyntheticAuth as s, fingerprintPreparedRuntimeFacts as t, loadPreparedInboundPluginRegistry as u };
