import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveOpenClawToolsModule } from "./openclaw-tools-module.mjs";

let createOpenClawToolsPromise;

async function resolveCreateOpenClawTools(agentRuntimePath) {
  if (!createOpenClawToolsPromise) {
    createOpenClawToolsPromise = (async () => {
      // 9.6 moved the sessions_spawn description into its own chunk; the
      // factory that builds the tool is what this executor needs.
      const modulePath = await resolveOpenClawToolsModule(dirname(dirname(agentRuntimePath)), {
        label: "createOpenClawTools",
      });
      const module = await import(pathToFileURL(modulePath).href);
      const createOpenClawTools = Object.values(module).find(
        (value) =>
          typeof value === "function" && value.name === "createOpenClawTools",
      );
      if (!createOpenClawTools) {
        throw new Error("OpenClaw createOpenClawTools export was not found");
      }
      return createOpenClawTools;
    })();
  }
  return await createOpenClawToolsPromise;
}

export function createGatewaySessionsSpawnExecutor(options) {
  const { agentRuntimePath, getConfig, createTools } = options;
  if (!agentRuntimePath && typeof createTools !== "function") {
    throw new Error("agentRuntimePath is required");
  }
  if (typeof getConfig !== "function") throw new Error("getConfig is required");

  return async function executeGatewaySessionsSpawn(request) {
    if (request?.toolName !== "sessions_spawn") {
      throw Object.assign(
        new Error(`unsupported Gateway-owned tool: ${String(request?.toolName)}`),
        { code: "VLAB_GATEWAY_TOOL_UNSUPPORTED" },
      );
    }
    const createOpenClawTools =
      createTools ?? (await resolveCreateOpenClawTools(agentRuntimePath));
    const context = request.context ?? {};
    const tools = createOpenClawTools({
      workspaceDir: context.workspaceDir,
      config: getConfig(),
      agentSessionKey: context.agentSessionKey,
      completionOwnerKey: context.completionOwnerKey,
      agentChannel: context.agentChannel,
      agentAccountId: context.agentAccountId,
      agentTo: context.agentTo,
      agentThreadId: context.agentThreadId,
      agentGroupId: context.agentGroupId,
      agentGroupChannel: context.agentGroupChannel,
      agentGroupSpace: context.agentGroupSpace,
      agentMemberRoleIds: context.agentMemberRoleIds,
      requesterAgentIdOverride: context.requesterAgentIdOverride,
      inheritedToolAllowlist: context.inheritedToolAllowlist,
      inheritedToolDenylist: context.inheritedToolDenylist,
      wrapBeforeToolCallHook: false,
    });
    const tool = tools.find((candidate) => candidate.name === "sessions_spawn");
    if (!tool) throw new Error("sessions_spawn tool was not created in Gateway");
    const result = await tool.execute(request.toolCallId, request.args);
    if (result?.details && typeof result.details === "object") {
      result.details.vlabGatewayOwned = true;
    }
    return result;
  };
}
