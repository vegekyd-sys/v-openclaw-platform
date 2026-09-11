import { r as normalizeProviderId } from "./provider-id-DMd-TDFp.js";
import { S as toAgentEntriesRecord, g as resolveAmbientOwnerAgentId, i as listAgentEntries } from "./agent-scope-config-CUiGBd59.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import "./session-key-CRjxKW0X.js";
import { t as SYSTEM_AGENT_ID } from "./agent-id-CaFmP6-7.js";
import { n as cliBackendAcceptsAuthProfileForwarding, r as resolveCliExecutionAuthProfileId } from "./cli-execution-auth-BiNJogJT.js";
import { isDeepStrictEqual } from "node:util";
//#region src/system-agent/inference-route.ts
function projectSystemAgentExecutionConfig(config, routeAgentId) {
	const agents = listAgentEntries(config);
	const routeAgent = agents.find((agent) => normalizeAgentId(agent.id) === routeAgentId);
	const projectedAgents = [...agents.filter((agent) => normalizeAgentId(agent.id) !== SYSTEM_AGENT_ID), {
		id: SYSTEM_AGENT_ID,
		...routeAgent?.params !== void 0 ? { params: structuredClone(routeAgent.params) } : {},
		...routeAgent?.tools !== void 0 ? { tools: structuredClone(routeAgent.tools) } : {}
	}];
	const { list: _legacyList, ...agentsConfig } = config.agents ?? {};
	return {
		...config,
		agents: {
			...agentsConfig,
			entries: toAgentEntriesRecord(projectedAgents)
		}
	};
}
async function resolveSystemAgentConfiguredRouteFromConfig(runConfig, requestedAgentId, deps = {}) {
	const [agentScope, modelSelection, modelRuntimeAliases, simpleCompletion, harnessPolicy] = await Promise.all([
		import("./agent-scope-DzYOhOj0.js"),
		import("./model-selection-a5W5TAQi.js"),
		import("./model-runtime-aliases-Cr1jwG76.js"),
		import("./simple-completion-runtime-C8cxwxib.js"),
		import("./policy-BxqHFE8I.js")
	]);
	const modelOwnerAgentId = resolveAmbientOwnerAgentId(runConfig, requestedAgentId);
	if (!agentScope.resolveAgentEffectiveModelPrimary(runConfig, modelOwnerAgentId)) return null;
	const selection = simpleCompletion.resolveSimpleCompletionSelectionForAgent({
		cfg: runConfig,
		agentId: modelOwnerAgentId,
		manifestPlugins: deps.pluginMetadataPlugins
	});
	if (!selection) return null;
	const metadataSnapshot = deps.pluginMetadataPlugins ? { plugins: deps.pluginMetadataPlugins } : void 0;
	const executionProvider = modelRuntimeAliases.resolveCliRuntimeExecutionProvider({
		provider: selection.provider,
		cfg: runConfig,
		agentId: modelOwnerAgentId,
		modelId: selection.modelId,
		...selection.profileId ? { authProfileId: selection.profileId } : {},
		...metadataSnapshot ? { metadataSnapshot } : {}
	}) ?? selection.runtimeProvider ?? selection.provider;
	const isCliRoute = modelSelection.isCliProvider(executionProvider, runConfig);
	const allowCliAuthProfileForwarding = isCliRoute && cliBackendAcceptsAuthProfileForwarding({
		provider: executionProvider,
		config: runConfig,
		agentId: modelOwnerAgentId
	});
	const cliAuthProfileId = allowCliAuthProfileForwarding ? resolveCliExecutionAuthProfileId({
		cliExecutionProvider: executionProvider,
		authProfileProvider: selection.provider,
		config: runConfig,
		agentDir: selection.agentDir,
		...selection.profileId ? { selected: {
			authProfileId: selection.profileId,
			authProfileIdSource: "user"
		} } : {},
		...deps.loadAuthProfileStoreForRuntime ? { loadAuthProfileStoreForRuntime: deps.loadAuthProfileStoreForRuntime } : {}
	}) : void 0;
	const authProfileId = allowCliAuthProfileForwarding ? cliAuthProfileId : selection.profileId;
	const base = {
		runConfig: projectSystemAgentExecutionConfig(runConfig, modelOwnerAgentId),
		modelLabel: `${selection.provider}/${selection.modelId}`,
		provider: executionProvider,
		model: selection.modelId,
		agentDir: selection.agentDir,
		agentId: modelOwnerAgentId,
		...authProfileId ? { authProfileId } : {}
	};
	if (isCliRoute) return {
		runner: "cli",
		...base
	};
	const policy = harnessPolicy.resolveAgentHarnessPolicy({
		config: runConfig,
		agentId: modelOwnerAgentId,
		provider: selection.provider,
		modelId: selection.modelId
	});
	return {
		runner: "embedded",
		...policy.runtimeSource === "implicit" ? {} : { agentHarnessRuntimeOverride: policy.runtime },
		...base
	};
}
function projectRelevantModelMap(params) {
	if (!params.models) return;
	const relevant = Object.fromEntries(Object.entries(params.models).filter(([key, entry]) => {
		const slash = key.indexOf("/");
		const provider = slash > 0 ? normalizeProviderId(key.slice(0, slash)) : "";
		const model = slash > 0 ? key.slice(slash + 1) : key;
		return params.providerIds.has(provider) && (model === params.modelId || model === "*" || key === params.rawModel) || entry.alias?.trim() === params.rawModel;
	}));
	return Object.keys(relevant).length > 0 ? relevant : void 0;
}
/** Project every config input that can change the configured default-agent route. */
async function projectDefaultInferenceRoute(config, deps = {}) {
	return await projectInferenceRoute(config, void 0, deps);
}
/** Project every config input that can change one configured agent route. */
async function projectInferenceRoute(config, requestedAgentId, deps = {}) {
	const { resolveProviderIdForAuth } = await import("./provider-auth-aliases-DBtXXRRU.js");
	const routeAgentId = resolveAmbientOwnerAgentId(config, requestedAgentId);
	const route = await resolveSystemAgentConfiguredRouteFromConfig(config, routeAgentId, deps);
	const agent = listAgentEntries(config).find((entry) => normalizeAgentId(entry.id) === routeAgentId);
	const executionAgent = listAgentEntries(route?.runConfig ?? {}).find((entry) => normalizeAgentId(entry.id) === SYSTEM_AGENT_ID);
	const defaults = config.agents?.defaults;
	const logicalProvider = normalizeProviderId(route?.modelLabel.split("/", 1)[0] ?? "");
	const providerIds = new Set([logicalProvider, normalizeProviderId(route?.provider ?? "")].filter(Boolean));
	const metadataSnapshot = deps.pluginMetadataPlugins ? { plugins: deps.pluginMetadataPlugins } : void 0;
	const authAliasParams = {
		config,
		...metadataSnapshot ? { metadataSnapshot } : {}
	};
	const authProviderIds = new Set([...providerIds].map((provider) => resolveProviderIdForAuth(provider, authAliasParams)));
	const authProfiles = Object.fromEntries(Object.entries(config.auth?.profiles ?? {}).filter(([, profile]) => authProviderIds.has(resolveProviderIdForAuth(profile.provider, authAliasParams))));
	const authOrder = Object.fromEntries(Object.entries(config.auth?.order ?? {}).filter(([provider]) => authProviderIds.has(resolveProviderIdForAuth(provider, authAliasParams))));
	const modelProviders = Object.fromEntries(Object.entries(config.models?.providers ?? {}).filter(([provider]) => providerIds.has(normalizeProviderId(provider))).map(([provider, providerConfig]) => [provider, structuredClone(providerConfig)]));
	const rawModel = typeof agent?.model === "string" ? agent.model : agent?.model?.primary || (typeof defaults?.model === "string" ? defaults.model : defaults?.model?.primary);
	const agentRouteOverrides = agent ? {
		model: structuredClone(agent.model),
		params: structuredClone(agent.params),
		tools: structuredClone(agent.tools),
		models: projectRelevantModelMap({
			models: agent.models,
			providerIds,
			modelId: route?.model,
			rawModel
		}),
		agentRuntime: structuredClone(agent.agentRuntime)
	} : void 0;
	const hasAgentRouteOverrides = agentRouteOverrides !== void 0 && Object.values(agentRouteOverrides).some((value) => value !== void 0);
	let projectedRoute = null;
	if (route) {
		const { runConfig: _runConfig, ...routeWithoutConfig } = route;
		projectedRoute = routeWithoutConfig;
	}
	return {
		route: projectedRoute,
		defaultSelection: { explicitIds: [routeAgentId] },
		auth: {
			profiles: authProfiles,
			order: authOrder
		},
		models: {
			mode: config.models?.mode,
			providers: modelProviders
		},
		defaults: {
			model: structuredClone(defaults?.model),
			params: structuredClone(defaults?.params),
			models: projectRelevantModelMap({
				models: defaults?.models,
				providerIds,
				modelId: route?.model,
				rawModel
			}),
			agentRuntime: structuredClone(defaults?.agentRuntime)
		},
		...agent && hasAgentRouteOverrides ? { agent: {
			id: normalizeAgentId(agent.id),
			...agentRouteOverrides
		} } : {},
		...executionAgent ? { executionAgent: {
			id: SYSTEM_AGENT_ID,
			params: structuredClone(executionAgent.params),
			tools: structuredClone(executionAgent.tools)
		} } : {},
		env: structuredClone(config.env),
		secrets: structuredClone(config.secrets),
		plugins: structuredClone(config.plugins),
		tools: structuredClone(config.tools)
	};
}
function sameDefaultInferenceRoute(left, right) {
	return isDeepStrictEqual(left, right);
}
//#endregion
export { sameDefaultInferenceRoute as i, projectInferenceRoute as n, resolveSystemAgentConfiguredRouteFromConfig as r, projectDefaultInferenceRoute as t };
