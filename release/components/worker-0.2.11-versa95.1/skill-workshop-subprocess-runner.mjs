import { dirname } from "node:path";
import { writeSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolveOpenClawToolsModule } from "./openclaw-tools-module.mjs";

async function readRequest() {
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += chunk.toString("utf8");
  }
  return JSON.parse(raw);
}

async function resolveToolsModule() {
  const configured = process.env.VLAB_OPENCLAW_TOOLS_MODULE;
  if (configured) {
    return configured;
  }
  const runtimePath = process.env.VLAB_OPENCLAW_AGENT_RUNTIME;
  if (!runtimePath) {
    throw new Error("VLAB_OPENCLAW_AGENT_RUNTIME is required");
  }
  return await resolveOpenClawToolsModule(dirname(dirname(runtimePath)), {
    marker: "Create the Skill Workshop tool for proposal discovery",
    label: "Skill Workshop",
  });
}

function writeEnvelope(envelope, exitCode) {
  writeSync(3, `${JSON.stringify(envelope)}\n`);
  process.exit(exitCode);
}

try {
  const request = await readRequest();
  if (request?.toolName !== "skill_workshop") {
    throw Object.assign(
      new Error(`unsupported isolated tool: ${String(request?.toolName)}`),
      { code: "VLAB_GATEWAY_OWNED_TOOL_UNSUPPORTED" },
    );
  }
  const configPath = process.env.VLAB_GATEWAY_CONFIG_PATH;
  if (!configPath) {
    throw new Error("VLAB_GATEWAY_CONFIG_PATH is required");
  }
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const modulePath = await resolveToolsModule();
  const toolsModule = await import(pathToFileURL(modulePath).href);
  const createOpenClawTools = Object.values(toolsModule).find(
    (value) =>
      typeof value === "function" && value.name === "createOpenClawTools",
  );
  if (!createOpenClawTools) {
    throw new Error("OpenClaw createOpenClawTools export was not found");
  }
  const options = request.context ?? {};
  const tools = createOpenClawTools({
    workspaceDir: options.workspaceDir,
    config,
    agentSessionKey: options.agentSessionKey ?? options.runSessionKey,
    runSessionKey: options.runSessionKey ?? options.agentSessionKey,
    requesterAgentIdOverride:
      options.requesterAgentIdOverride ?? options.agentId,
    agentId: options.agentId,
    wrapBeforeToolCallHook: false,
  });
  const tool = tools.find((candidate) => candidate.name === "skill_workshop");
  if (!tool) {
    throw new Error("skill_workshop tool was not created in subprocess");
  }
  const result = await tool.execute(request.toolCallId, request.args);
  writeEnvelope({ ok: true, result }, 0);
} catch (error) {
  writeEnvelope(
    {
      ok: false,
      error: {
        name: error instanceof Error ? error.name : undefined,
        message: error instanceof Error ? error.message : String(error),
        code:
          error && typeof error === "object" && "code" in error
            ? error.code
            : undefined,
      },
    },
    1,
  );
}
