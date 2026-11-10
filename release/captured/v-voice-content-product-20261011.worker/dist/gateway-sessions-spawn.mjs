import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

let createOpenClawToolsPromise;

async function resolveCreateOpenClawTools(agentRuntimePath) {
  if (!createOpenClawToolsPromise) {
    createOpenClawToolsPromise = (async () => {
      const distDir = dirname(dirname(agentRuntimePath));
      const candidates = (await readdir(distDir))
        .filter((name) => /^openclaw-tools-.*\.js$/.test(name))
        .sort();
      const matches = [];
      for (const name of candidates) {
        const modulePath = join(distDir, name);
        const source = await readFile(modulePath, "utf8");
        if (source.includes("sessions_spawn built-in tool")) {
          matches.push(modulePath);
        }
      }
      if (matches.length !== 1) {
        throw new Error(
          `OpenClaw sessions_spawn tools module was not uniquely resolved; found ${matches.length}`,
        );
      }
      const module = await import(pathToFileURL(matches[0]).href);
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
