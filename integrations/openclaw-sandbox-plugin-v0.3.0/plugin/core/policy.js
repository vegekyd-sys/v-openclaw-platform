const POLICY_ID = "project-sandbox-host-deny";

const ALLOWED_TOOLS = new Set([
  "project_sandbox_open",
  "project_sandbox_files",
  "project_sandbox_exec",
  "project_sandbox_finish",
  "message",
]);

const TOOL_ALIASES = new Map([
  ["bash", "exec"],
  ["exec_command", "exec"],
  ["shell", "exec"],
  ["terminal", "exec"],
  ["read_file", "read"],
  ["file_read", "read"],
  ["write_file", "write"],
  ["file_write", "write"],
  ["patch", "apply_patch"],
  ["apply-patch", "apply_patch"],
]);

export function createProjectSandboxHostDenyPolicy(config = {}) {
  const blockedAgentIds = new Set(normalizeBlockedAgentIds(config.blockedAgentIds));
  return {
    id: POLICY_ID,
    description:
      "Restrict configured Project Sandbox agents to Broker-backed project tools and message delivery.",
    evaluate(event, context) {
      const agentId = normalizeAgentId(context?.agentId);
      if (!agentId || !blockedAgentIds.has(agentId)) {
        return undefined;
      }
      const toolName = normalizeToolName(event?.toolName);
      if (ALLOWED_TOOLS.has(toolName)) {
        return undefined;
      }
      return {
        allow: false,
        reason: `Tool ${toolName || "<unknown>"} is disabled for agent ${agentId}; only project_sandbox_* and message are allowed.`,
      };
    },
  };
}

export function normalizeProjectSandboxPolicyToolName(value) {
  return normalizeToolName(value);
}

function normalizeBlockedAgentIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(normalizeAgentId).filter(Boolean);
}

function normalizeAgentId(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeToolName(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return TOOL_ALIASES.get(normalized) ?? normalized;
}
