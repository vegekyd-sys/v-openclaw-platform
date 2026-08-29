import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { BrokerClient } from "./core/broker-client.js";
import { createProjectSandboxHostDenyPolicy } from "./core/policy.js";
import { createSandboxTools, TOOL_NAMES } from "./core/tools.js";

const DESCRIPTIONS = {
  project_sandbox_open: "Open or inspect a Session-bound project Sandbox.",
  project_sandbox_files: "Read or update approved project files inside the Sandbox.",
  project_sandbox_exec: "Start, poll, or cancel an argv operation inside the Sandbox.",
  project_sandbox_finish: "Return a reviewable patch and artifact hashes, or cancel the Sandbox.",
};

export default definePluginEntry({
  id: "project-sandbox",
  name: "Project Sandbox",
  description: "One Broker-backed Sandbox tool set shared by OpenClaw and Codex runtimes.",
  register(api) {
    const config = api.pluginConfig ?? {};
    const broker = new BrokerClient(config);
    api.registerTool(
      (context) => createSandboxTools(context, { broker, config, logger: api.logger }),
      { names: TOOL_NAMES },
    );
    api.registerTrustedToolPolicy(createProjectSandboxHostDenyPolicy(config));
    for (const toolName of TOOL_NAMES) {
      api.registerToolMetadata({
        toolName,
        displayName: DESCRIPTIONS[toolName],
        description: DESCRIPTIONS[toolName],
        risk: toolName === "project_sandbox_open" ? "medium" : "high",
        tags: ["sandbox", "project", "isolated-development"],
      });
    }
  },
});
