import { y as uniqueStrings } from "./string-normalization-DiSb4JeN.js";
import { r as isKnownCoreToolId } from "./tool-catalog-CsKMGPc2.js";
import { c as normalizeToolPolicyName } from "./tool-policy-shared-D_3SrG-g.js";
import "./tool-policy-De2653Mj.js";
import "./operator-scopes-Dw7Gu2cA.js";
import { n as GATEWAY_CLIENT_IDS, r as GATEWAY_CLIENT_MODES } from "./client-info-B1bPgeKr.js";
import "./version-CwNT1gaY.js";
import { d as getActivePluginRegistry } from "./runtime-MupoouIC.js";
import "./method-scopes-C3BvHJ95.js";
//#region src/gateway/server-plugin-runtime-client.ts
function createSyntheticPluginRuntimeClient(params) {
	const pluginRuntimeOwnerId = typeof params?.pluginRuntimeOwnerId === "string" && params.pluginRuntimeOwnerId.trim() ? params.pluginRuntimeOwnerId.trim() : void 0;
	return {
		...params?.authenticatedUserProfile ? { authenticatedUserProfile: params.authenticatedUserProfile } : {},
		connect: {
			minProtocol: 4,
			maxProtocol: 4,
			client: {
				id: GATEWAY_CLIENT_IDS.GATEWAY_CLIENT,
				version: "internal",
				platform: "node",
				mode: GATEWAY_CLIENT_MODES.BACKEND
			},
			role: "operator",
			scopes: params?.scopes ?? ["operator.write"]
		},
		internal: {
			syntheticClient: true,
			...params?.operatorRoleActor ? { operatorRoleActor: params.operatorRoleActor } : {},
			...params?.sessionCreation ? { sessionCreation: params.sessionCreation } : {},
			...params?.agentToolCaller ? { agentToolCaller: params.agentToolCaller } : {},
			allowModelOverride: params?.allowModelOverride === true,
			...params?.agentRunTracking ? { agentRunTracking: params.agentRunTracking } : {},
			...params?.cronRunContinuation === true ? { cronRunContinuation: true } : {},
			...params?.internalDeliveryMediaUrls ? { internalDeliveryMediaUrls: [...params.internalDeliveryMediaUrls] } : {},
			...params?.internalDeliverySuppressText === true ? { internalDeliverySuppressText: true } : {},
			...params?.scopes?.includes("operator.approvals") ? { approvalRuntime: true } : {},
			...pluginRuntimeOwnerId ? { pluginRuntimeOwnerId } : {},
			...params?.nodeInvokeApprovalSessionKey ? { nodeInvokeApprovalSessionKey: params.nodeInvokeApprovalSessionKey } : {},
			...params?.pluginSubagentRequester ? { pluginSubagentRequester: params.pluginSubagentRequester } : {},
			...params?.runtimePluginToolGrant ? { runtimePluginToolGrant: params.runtimePluginToolGrant } : {},
			...params?.pluginSubagentToolsAllow ? { pluginSubagentToolsAllow: [...params.pluginSubagentToolsAllow] } : {},
			...params?.delegatedToolPolicyHandoffId ? { delegatedToolPolicyHandoffId: params.delegatedToolPolicyHandoffId } : {}
		}
	};
}
function mergePluginRuntimeClientInternal(client, internal) {
	if (!client || !internal) return client ?? null;
	return {
		...client,
		internal: {
			...client.internal,
			...internal
		}
	};
}
function resolvePluginSubagentToolsAlsoAllow(params) {
	const requested = uniqueStrings((params.toolsAlsoAllow ?? []).map((entry) => normalizeToolPolicyName(entry.trim())).filter(Boolean));
	if (requested.length === 0) return;
	const pluginId = params.pluginId?.trim();
	if (!pluginId) throw new Error("toolsAlsoAllow requires plugin identity for subagent runs.");
	const registry = getActivePluginRegistry();
	for (const toolName of requested) {
		if (isKnownCoreToolId(toolName)) throw new Error(`plugin "${pluginId}" may not add core tool "${toolName}" to subagent runs.`);
		const owners = uniqueStrings((registry?.tools ?? []).filter((registration) => [...registration.names, ...registration.declaredNames ?? []].some((registeredName) => normalizeToolPolicyName(registeredName) === toolName)).map((registration) => registration.pluginId));
		if (owners.length !== 1 || owners[0] !== pluginId) throw new Error(`plugin "${pluginId}" does not uniquely own subagent tool "${toolName}".`);
	}
	return {
		pluginId,
		toolNames: requested
	};
}
//#endregion
export { mergePluginRuntimeClientInternal as n, resolvePluginSubagentToolsAlsoAllow as r, createSyntheticPluginRuntimeClient as t };
