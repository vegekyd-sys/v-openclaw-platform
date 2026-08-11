import { existsSync, readdirSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";

export function resolveOpenClawAgentRuntimePath(options = {}) {
  const fileExists = options.fileExists ?? existsSync;
  const explicitPath =
    options.explicitPath ?? process.env.VLAB_OPENCLAW_AGENT_RUNTIME;
  const gatewayEntryPath = options.gatewayEntryPath ?? process.argv[1];
  const candidates = [];

  if (typeof explicitPath === "string" && explicitPath.trim() !== "") {
    candidates.push(normalize(explicitPath.trim()));
  }

  if (
    typeof gatewayEntryPath === "string" &&
    gatewayEntryPath.trim() !== ""
  ) {
    const normalizedEntry = normalize(gatewayEntryPath.trim());
    const distMarker = `${sep}dist${sep}`;
    const distIndex = normalizedEntry.lastIndexOf(distMarker);
    const packageRoot =
      distIndex >= 0
        ? normalizedEntry.slice(0, distIndex)
        : dirname(normalizedEntry);
    candidates.push(
      join(packageRoot, "dist", "plugin-sdk", "agent-runtime.js"),
    );
  }

  const uniqueCandidates = [...new Set(candidates)];
  const resolved = uniqueCandidates.find((candidate) => fileExists(candidate));
  if (resolved) {
    return resolved;
  }
  throw new Error(
    `OpenClaw Agent runtime was not found; checked: ${
      uniqueCandidates.join(", ") || "(no candidates)"
    }`,
  );
}

export function resolveOpenClawAgentHarnessRuntimePath(options = {}) {
  const agentRuntimePath =
    options.agentRuntimePath ?? resolveOpenClawAgentRuntimePath(options);
  const candidate = join(dirname(agentRuntimePath), "agent-harness-runtime.js");
  const fileExists = options.fileExists ?? existsSync;
  if (!fileExists(candidate)) {
    throw new Error(
      `OpenClaw Agent Harness runtime was not found; checked: ${candidate}`,
    );
  }
  return candidate;
}

export function resolveOpenClawSubagentAnnounceRuntimePath(options = {}) {
  const agentRuntimePath =
    options.agentRuntimePath ?? resolveOpenClawAgentRuntimePath(options);
  const distDir = dirname(dirname(agentRuntimePath));
  const readDirectory = options.readDirectory ?? readdirSync;
  const candidates = readDirectory(distDir)
    .filter(
      (name) =>
        name === "subagent-announce.js" ||
        /^subagent-announce-[A-Za-z0-9_]+\.js$/.test(name),
    )
    .sort();
  if (candidates.length !== 1) {
    throw new Error(
      `OpenClaw native subagent announce runtime was not uniquely resolved in ${distDir}; found ${candidates.length}`,
    );
  }
  return join(distDir, candidates[0]);
}

export function resolveOpenClawSubagentAnnounceOriginRuntimePath(options = {}) {
  const agentRuntimePath =
    options.agentRuntimePath ?? resolveOpenClawAgentRuntimePath(options);
  const distDir = dirname(dirname(agentRuntimePath));
  const readDirectory = options.readDirectory ?? readdirSync;
  const candidates = readDirectory(distDir)
    .filter((name) =>
      /^subagent-announce-origin-[A-Za-z0-9_]+\.js$/.test(name),
    )
    .sort();
  if (candidates.length !== 1) {
    throw new Error(
      `OpenClaw subagent announce origin runtime was not uniquely resolved in ${distDir}; found ${candidates.length}`,
    );
  }
  return join(distDir, candidates[0]);
}
