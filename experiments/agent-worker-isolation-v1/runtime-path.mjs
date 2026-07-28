import { existsSync } from "node:fs";
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
