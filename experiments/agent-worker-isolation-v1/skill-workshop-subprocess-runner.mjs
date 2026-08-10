import { dirname, join } from "node:path";
import { writeSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

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
  const distDir = dirname(dirname(runtimePath));
  const candidates = (await readdir(distDir))
    .filter((name) => /^openclaw-tools-.*\.js$/.test(name))
    .sort();
  const matches = [];
  for (const name of candidates) {
    const path = join(distDir, name);
    const source = await readFile(path, "utf8");
    if (source.includes("Create the Skill Workshop tool for proposal discovery")) {
      matches.push(path);
    }
  }
  if (matches.length !== 1) {
    throw new Error(
      `expected one OpenClaw tools module with Skill Workshop, found ${matches.length}`,
    );
  }
  return matches[0];
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
    agentSessionKey: options.agentSessionKey,
    requesterAgentIdOverride: options.requesterAgentIdOverride,
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
