import {resolveActorTools as vResolveActorTools} from "./v-feishu-voice-tools.mjs";
// v-feishu-voice-actor-catalog-v1
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { m as resolveAgentWorkspaceDir, u as resolveAgentDir } from "./agent-scope-config-CUiGBd59.js";
import { i as listCoreToolSections, n as PROFILE_OPTIONS, o as resolveCoreToolProfiles } from "./tool-catalog-CsKMGPc2.js";
import "./agent-scope-CSlN0kZb.js";
import { Ia as validateToolsCatalogParams } from "./src-B9mb84px.js";
import { d as getActivePluginRegistry } from "./runtime-MupoouIC.js";
import { r as getPluginToolMeta, t as buildPluginToolMetadataKey } from "./tool-metadata-B4LwDu-h.js";
import { t as resolveSwarmConfig } from "./swarm-config-BhpoVrlT.js";
import { n as resolvePluginTools, t as ensureStandalonePluginToolRegistryLoaded } from "./tools-D1uCZ7Tn.js";
import { n as summarizeToolDescriptionText } from "./tool-description-summary-hYOwJvkn.js";
import { t as resolveAgentIdOrRespondError } from "./agent-id-shared-DqJHqB_x.js";
import { t as assertValidParams } from "./validation-D9mcPHCB.js";
//#region src/gateway/server-methods/tools-catalog.ts
function buildCoreGroups(params) {
	const swarmEnabled = resolveSwarmConfig(params.cfg, params.agentId).enabled;
	return listCoreToolSections({ swarmEnabled }).map((section) => ({
		id: section.id,
		label: section.label,
		source: "core",
		tools: section.tools.map((tool) => ({
			id: tool.id,
			label: tool.label,
			description: tool.description,
			source: "core",
			defaultProfiles: resolveCoreToolProfiles(tool.id)
		}))
	}));
}
function buildPluginGroups(params) {
	const workspaceDir = resolveAgentWorkspaceDir(params.cfg, params.agentId);
	const agentDir = resolveAgentDir(params.cfg, params.agentId);
	const toolContext = {
		config: params.cfg,
		workspaceDir,
		agentDir,
		agentId: params.agentId
	};
	const toolRegistry = ensureStandalonePluginToolRegistryLoaded({
		context: toolContext,
		toolAllowlist: ["group:plugins"],
		allowGatewaySubagentBinding: true
	});
	const pluginTools = resolvePluginTools({
		context: toolContext,
		existingToolNames: params.existingToolNames,
		toolAllowlist: ["group:plugins"],
		suppressNameConflicts: true,
		allowGatewaySubagentBinding: true,
		runtimeRegistry: toolRegistry
	});
	const catalogRegistry = toolRegistry ?? getActivePluginRegistry();
	const groups = /* @__PURE__ */ new Map();
	const pluginToolMetadata = /* @__PURE__ */ new Map();
	if (catalogRegistry) for (const entry of catalogRegistry.toolMetadata) {
		const metadataKey = buildPluginToolMetadataKey(entry.pluginId, entry.metadata.toolName);
		pluginToolMetadata.set(metadataKey, entry.metadata);
	}
	const seenToolIds = /* @__PURE__ */ new Set();
	for (const tool of pluginTools) {
		const meta = getPluginToolMeta(tool);
		const pluginId = meta?.pluginId ?? "plugin";
		const groupId = `plugin:${pluginId}`;
		const existing = groups.get(groupId) ?? {
			id: groupId,
			label: pluginId,
			source: "plugin",
			pluginId,
			tools: []
		};
		const ownedMetadata = meta?.pluginId ? pluginToolMetadata.get(buildPluginToolMetadataKey(meta.pluginId, tool.name)) : void 0;
		existing.tools.push({
			id: tool.name,
			label: normalizeOptionalString(ownedMetadata?.displayName) ?? normalizeOptionalString(tool.label) ?? tool.name,
			description: summarizeToolDescriptionText({
				rawDescription: ownedMetadata?.description ?? (typeof tool.description === "string" ? tool.description : void 0),
				displaySummary: tool.displaySummary
			}),
			source: "plugin",
			pluginId,
			optional: meta?.optional,
			risk: ownedMetadata?.risk,
			tags: ownedMetadata?.tags,
			defaultProfiles: []
		});
		seenToolIds.add(tool.name);
		groups.set(groupId, existing);
	}
	for (const entry of catalogRegistry?.tools ?? []) {
		const names = entry.names.length > 0 ? entry.names : entry.declaredNames ?? [];
		for (const name of names) {
			if (seenToolIds.has(name) || params.existingToolNames.has(name)) continue;
			const groupId = `plugin:${entry.pluginId}`;
			const existing = groups.get(groupId) ?? {
				id: groupId,
				label: entry.pluginName ?? entry.pluginId,
				source: "plugin",
				pluginId: entry.pluginId,
				tools: []
			};
			const ownedMetadata = pluginToolMetadata.get(buildPluginToolMetadataKey(entry.pluginId, name));
			existing.tools.push({
				id: name,
				label: normalizeOptionalString(ownedMetadata?.displayName) ?? name,
				description: summarizeToolDescriptionText({ rawDescription: ownedMetadata?.description }) || `Plugin tool from ${entry.pluginName ?? entry.pluginId}`,
				source: "plugin",
				pluginId: entry.pluginId,
				optional: entry.optional,
				risk: ownedMetadata?.risk,
				tags: ownedMetadata?.tags,
				defaultProfiles: []
			});
			seenToolIds.add(name);
			groups.set(groupId, existing);
		}
	}
	return [...groups.values()].map((group) => Object.assign({}, group, { tools: group.tools.toSorted((a, b) => a.id.localeCompare(b.id)) })).toSorted((a, b) => a.label.localeCompare(b.label));
}
/** Build the merged core/plugin tool catalog for one agent. */
function buildToolsCatalogResult(params) {
	const agentId = params.agentId;
	const includePlugins = params.includePlugins !== false;
	const groups = buildCoreGroups({
		cfg: params.cfg,
		agentId
	});
	if (includePlugins) {
		const existingToolNames = new Set(groups.flatMap((group) => group.tools.map((tool) => tool.id)));
		groups.push(...buildPluginGroups({
			cfg: params.cfg,
			agentId,
			existingToolNames
		}));
	}
	return {
		agentId,
		profiles: PROFILE_OPTIONS.map((profile) => ({
			id: profile.id,
			label: profile.label
		})),
		groups
	};
}
/** Gateway request handlers for tool catalog queries. */
const toolsCatalogHandlers = { "tools.catalog": ({ params, respond, context, client }) => {
	if (!assertValidParams(params, validateToolsCatalogParams, "tools.catalog", respond)) return;
	const resolved = resolveAgentIdOrRespondError({
		rawAgentId: params.agentId,
		respond,
		cfg: context.getRuntimeConfig(),
		normalize: normalizeOptionalString
	});
	if (!resolved) return;
  if (client?.internal?.voiceActor) {
    const {tools}=vResolveActorTools({cfg:resolved.cfg,actor:client.internal.voiceActor,
      clientCaps:client.connect?.caps,disablePluginTools:params.includePlugins===false});
    respond(true,{agentId:resolved.agentId,profiles:[],groups:[{id:"conversation",label:"Conversation",source:"core",
      tools:tools.map(tool=>({id:tool.name,label:tool.label??tool.name,description:tool.description,source:"core"}))}]});
    return;
  }
	respond(true, buildToolsCatalogResult({
		cfg: resolved.cfg,
		agentId: resolved.agentId,
		includePlugins: params.includePlugins
	}), void 0);
} };
//#endregion
export { toolsCatalogHandlers };
