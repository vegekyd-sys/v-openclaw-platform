import { n as normalizePluginsConfigWithResolverCore } from "./config-normalization-shared-Ci376FnC.js";
import { d as resolveEffectivePluginActivationState, m as resolveSelectedContextEnginePluginId, o as isTestDefaultMemorySlotDisabled } from "./config-state-B-P4NhQV.js";
import { S as hashJson } from "./discovery-BQKfofUJ.js";
import { t as isPluginEnabledByDefaultForPlatform } from "./default-enablement-CEIbpabL.js";
import { i as loadPluginRegistrySnapshot } from "./plugin-registry-snapshot-BgY5CJXJ.js";
import { r as normalizePluginsConfigWithRegistry } from "./plugin-registry-contributions-B9tFAmmi.js";
import "./plugin-registry-iDfyoy7U.js";
import { a as normalizeOptionalAgentRuntimeId, r as isDefaultAgentRuntimeId } from "./agent-runtime-id-CYhl-5UQ.js";
import { t as resolveManifestActivationPlan } from "./activation-planner-BptD0yB2.js";
import { m as normalizePluginsConfigForInstalledIndex, n as addConfiguredSlotPluginIds } from "./gateway-startup-plugin-config-BUSG8F2S.js";
import { t as resolveAgentHarnessPolicy } from "./policy-DLijLMMe.js";
import { t as collectConfiguredAgentHarnessRuntimes } from "./harness-runtimes-Co-CLL5a.js";
import { f as resolveOwningPluginIdsForProviderRef, n as resolveActivatableProviderOwnerPluginIds, r as resolveBundledProviderCompatPluginIds } from "./providers-DYtRw48-.js";
import { n as withActivatedPluginIds } from "./activation-context-Dnlgbesu.js";
import { t as createInstalledPluginIndexScopeLookup } from "./installed-plugin-index-scope-lookup-DmsqD82B.js";
import { i as isCliRuntimeAliasForProvider } from "./model-runtime-aliases-CUfAXUCq.js";
//#region src/agents/harness/runtime-plugin-load-plan.ts
function dedupePluginIds(values) {
	const result = [];
	for (const value of values) {
		const pluginId = value.trim();
		if (pluginId && !result.includes(pluginId)) result.push(pluginId);
	}
	return result;
}
function restrictiveAllowlistOmitsPlugin(config, pluginId) {
	const allow = config?.plugins?.allow ?? [];
	return allow.length > 0 && !allow.includes(pluginId);
}
function resolveSelectedMemoryPluginIds(params) {
	if (isTestDefaultMemorySlotDisabled(params.config ?? {})) return [];
	const registry = params.metadataSnapshot?.index ?? loadPluginRegistrySnapshot({
		config: params.config,
		workspaceDir: params.workspaceDir
	});
	const plugins = params.metadataSnapshot ? normalizePluginsConfigWithResolverCore(params.config?.plugins, params.metadataSnapshot.normalizePluginId) : normalizePluginsConfigWithRegistry(params.config?.plugins, registry);
	const memorySlot = plugins.slots.memory;
	if (typeof memorySlot !== "string" || restrictiveAllowlistOmitsPlugin(params.config, memorySlot)) return [];
	const plugin = registry.plugins.find((entry) => entry.pluginId === memorySlot);
	if (!plugin?.startup.memory) return [];
	return resolveEffectivePluginActivationState({
		id: plugin.pluginId,
		origin: plugin.origin,
		config: plugins,
		rootConfig: params.config,
		enabledByDefault: isPluginEnabledByDefaultForPlatform(plugin)
	}).activated ? [plugin.pluginId] : [];
}
/** infer-latency: true when every selection is a direct provider completion (pluginScope "provider"). */
function isProviderOnlyPluginSelection(selections) {
	return selections.length > 0 && selections.every((selection) => selection.pluginScope === "provider");
}
function resolveAgentRuntimePluginSelections(config, selections, configuredHarnessRuntimes) {
	if (isProviderOnlyPluginSelection(selections)) return [...selections];
	return [...(configuredHarnessRuntimes ?? collectConfiguredAgentHarnessRuntimes(config ?? {})).map((runtime) => ({
		runtime,
		provider: "",
		modelId: ""
	})), ...selections];
}
function resolveAgentRuntimeMetadataPluginIds(params) {
	const lookup = createInstalledPluginIndexScopeLookup(params.index);
	const pluginsConfig = normalizePluginsConfigForInstalledIndex(params.config?.plugins, lookup);
	if (!pluginsConfig.enabled) return [];
	const pluginIds = /* @__PURE__ */ new Set();
	lookup.addShorthandModelOwners(pluginIds, params.shorthandModelIds ?? []);
	const selections = resolveAgentRuntimePluginSelections(params.config, params.selections);
	const providerIds = dedupePluginIds(selections.map((selection) => selection.provider));
	for (const providerId of providerIds) {
		const providerPluginIds = /* @__PURE__ */ new Set();
		lookup.addDirectProviderOwners(providerPluginIds, [providerId]);
		if (providerPluginIds.size === 0) lookup.addProviderContributionOwners(providerPluginIds, [providerId]);
		if (providerPluginIds.size !== 1) return;
		for (const pluginId of providerPluginIds) pluginIds.add(pluginId);
	}
	if (isProviderOnlyPluginSelection(selections)) return lookup.hasInstalledPluginIds(pluginIds) ? [...pluginIds].toSorted((left, right) => left.localeCompare(right)) : void 0;
	const runtimeIds = dedupePluginIds(selections.map((selection) => resolveSelectedAgentHarnessRuntime(selection, params.config)).filter((runtime) => !isDefaultAgentRuntimeId(runtime) && runtime !== "openclaw"));
	if (!lookup.hasAgentHarnessOwners(runtimeIds)) return;
	lookup.addAgentHarnessOwners(pluginIds, runtimeIds);
	addConfiguredSlotPluginIds(pluginIds, {
		activationSourceConfig: params.config ?? {},
		activationSourcePlugins: pluginsConfig,
		lookup
	});
	if (!lookup.hasInstalledPluginIds(pluginIds)) return;
	return [...pluginIds].toSorted((left, right) => left.localeCompare(right));
}
/** Narrows cold manifest preparation to candidates needed by one selected runtime generation. */
function createAgentRuntimeMetadataPluginIdScope(params) {
	return {
		key: hashJson({
			kind: "agent-runtime",
			config: params.config ?? null,
			workspaceDir: params.workspaceDir,
			selections: params.selections,
			shorthandModelIds: params.shorthandModelIds ?? []
		}),
		resolve: ({ index }) => resolveAgentRuntimeMetadataPluginIds({
			config: params.config,
			selections: params.selections,
			shorthandModelIds: params.shorthandModelIds,
			index
		})
	};
}
function resolveSelectedProviderOwnerPluginIds(params) {
	const providerOwnerPluginIds = dedupePluginIds(resolveOwningPluginIdsForProviderRef(params) ?? []);
	if (providerOwnerPluginIds.length === 0) return [];
	const safeProviderOwnerPluginIds = dedupePluginIds([...resolveBundledProviderCompatPluginIds({
		config: params.config,
		workspaceDir: params.workspaceDir,
		onlyPluginIds: providerOwnerPluginIds,
		manifestRegistry: params.metadataSnapshot?.manifestRegistry
	}), ...resolveActivatableProviderOwnerPluginIds({
		pluginIds: providerOwnerPluginIds,
		config: params.config,
		workspaceDir: params.workspaceDir,
		...params.metadataSnapshot ? {
			registry: params.metadataSnapshot.index,
			manifestRegistry: params.metadataSnapshot.manifestRegistry
		} : {}
	})]);
	return providerOwnerPluginIds.filter((pluginId) => safeProviderOwnerPluginIds.includes(pluginId));
}
/** Resolve manifest owners required by one selected non-core harness runtime. */
function resolveAgentHarnessOwnerPluginIds(params) {
	const harnessPluginIds = resolveManifestActivationPlan({
		trigger: {
			kind: "agentHarness",
			runtime: params.runtime
		},
		config: params.config,
		workspaceDir: params.workspaceDir,
		requireExplicitManifestOwnerTrust: true,
		manifestRecords: params.metadataSnapshot?.plugins
	}).entries.map((entry) => entry.pluginId);
	if (harnessPluginIds.length === 0 || params.runtime !== "codex" || !harnessPluginIds.includes("codex") || restrictiveAllowlistOmitsPlugin(params.config, "codex")) return harnessPluginIds;
	const providerOwnerPluginIds = params.providerOwnerPluginIds ?? resolveSelectedProviderOwnerPluginIds(params);
	if (providerOwnerPluginIds.length === 0) return harnessPluginIds;
	return dedupePluginIds([...harnessPluginIds, ...providerOwnerPluginIds.filter((pluginId) => pluginId !== "codex")]);
}
function withRuntimePluginIdsAllowed(config, pluginIds, materializeAllowlist) {
	const existingAllowlist = config?.plugins?.allow ?? [];
	if (pluginIds.length === 0 || !materializeAllowlist && existingAllowlist.length === 0) return config;
	return {
		...config,
		plugins: {
			...config?.plugins,
			allow: dedupePluginIds([...existingAllowlist, ...pluginIds])
		}
	};
}
function resolveSelectedAgentHarnessRuntime(selection, config) {
	const requestedRuntime = normalizeOptionalAgentRuntimeId(selection.runtime);
	return requestedRuntime && !isDefaultAgentRuntimeId(requestedRuntime) ? requestedRuntime : resolveAgentHarnessPolicy({
		provider: selection.provider,
		modelId: selection.modelId,
		config,
		agentId: selection.agentId
	}).runtime;
}
function requiresAgentHarnessPluginSelection(selection, config) {
	const runtime = resolveSelectedAgentHarnessRuntime(selection, config);
	if (isDefaultAgentRuntimeId(runtime) || runtime === "openclaw") return false;
	return runtime === "codex" || !isCliRuntimeAliasForProvider({
		runtime,
		provider: selection.provider,
		cfg: config
	});
}
/** Folds selected harness, memory, and context-engine owners into one deterministic load plan. */
function resolveAgentRuntimePluginLoadPlan(params) {
	let config = params.config;
	// infer-latency: a direct provider completion runs no agent turn: no memory slot, context engine or harness.
	const providerOnly = isProviderOnlyPluginSelection(params.selections);
	const memoryPluginIds = providerOnly ? [] : resolveSelectedMemoryPluginIds({
		config: params.config,
		workspaceDir: params.workspaceDir,
		metadataSnapshot: params.metadataSnapshot
	});
	const contextEnginePluginId = providerOnly ? void 0 : resolveSelectedContextEnginePluginId(params.config);
	const contextEnginePluginIds = contextEnginePluginId ? [contextEnginePluginId] : [];
	const basePluginIds = (params.basePluginIds ?? []).filter((pluginId) => !restrictiveAllowlistOmitsPlugin(params.config, pluginId));
	const pluginIds = [
		...basePluginIds,
		...memoryPluginIds,
		...contextEnginePluginIds
	];
	const forceActivatedPluginIds = [...memoryPluginIds, ...contextEnginePluginIds];
	for (const selection of params.selections) {
		const runtime = resolveSelectedAgentHarnessRuntime(selection, config);
		const providerOwnerPluginIds = resolveSelectedProviderOwnerPluginIds({
			provider: selection.provider,
			config,
			workspaceDir: params.workspaceDir,
			metadataSnapshot: params.metadataSnapshot
		});
		pluginIds.push(...providerOwnerPluginIds);
		forceActivatedPluginIds.push(...providerOwnerPluginIds);
		if (providerOnly || !requiresAgentHarnessPluginSelection(selection, config)) continue;
		const harnessPluginIds = resolveAgentHarnessOwnerPluginIds({
			runtime,
			provider: selection.provider,
			config,
			workspaceDir: params.workspaceDir,
			providerOwnerPluginIds,
			metadataSnapshot: params.metadataSnapshot
		});
		pluginIds.push(...harnessPluginIds);
		const allowedHarnessPluginIds = runtime === "codex" ? restrictiveAllowlistOmitsPlugin(params.config, "codex") ? [] : harnessPluginIds : harnessPluginIds.filter((pluginId) => !restrictiveAllowlistOmitsPlugin(params.config, pluginId));
		forceActivatedPluginIds.push(...allowedHarnessPluginIds);
	}
	const scopedPluginIds = dedupePluginIds(pluginIds).toSorted((left, right) => left.localeCompare(right));
	config = withRuntimePluginIdsAllowed(config, [...basePluginIds, ...forceActivatedPluginIds], params.basePluginIds !== void 0);
	const activatedConfig = withActivatedPluginIds({
		config,
		pluginIds: forceActivatedPluginIds.toSorted()
	}) ?? config;
	if (params.basePluginIds === void 0 && (params.config?.plugins?.allow?.length ?? 0) === 0 && activatedConfig?.plugins) {
		const plugins = { ...activatedConfig.plugins };
		if (params.config?.plugins?.allow === void 0) delete plugins.allow;
		else plugins.allow = params.config.plugins.allow;
		config = {
			...activatedConfig,
			plugins
		};
	} else config = activatedConfig;
	return {
		...config ? { config } : {},
		...params.basePluginIds === void 0 && scopedPluginIds.length === 0 ? {} : { pluginIds: scopedPluginIds }
	};
}
//#endregion
export { resolveAgentRuntimePluginSelections as a, resolveAgentRuntimePluginLoadPlan as i, requiresAgentHarnessPluginSelection as n, resolveSelectedAgentHarnessRuntime as o, resolveAgentHarnessOwnerPluginIds as r, createAgentRuntimeMetadataPluginIdScope as t };
