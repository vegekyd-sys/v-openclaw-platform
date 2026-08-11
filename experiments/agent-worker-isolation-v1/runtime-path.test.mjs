import assert from "node:assert/strict";
import {
  resolveOpenClawAgentHarnessRuntimePath,
  resolveOpenClawAgentRuntimePath,
  resolveOpenClawSubagentAnnounceOriginRuntimePath,
  resolveOpenClawSubagentAnnounceRuntimePath,
} from "./runtime-path.mjs";

const vlabRuntime =
  "/opt/vlab/current/node_modules/openclaw/dist/plugin-sdk/agent-runtime.js";
assert.equal(
  resolveOpenClawAgentRuntimePath({
    gatewayEntryPath: "/opt/vlab/current/node_modules/openclaw/openclaw.mjs",
    fileExists: (candidate) => candidate === vlabRuntime,
  }),
  vlabRuntime,
);

const productionRuntime =
  "/opt/openclaw-2026.7.1/node_modules/openclaw/dist/plugin-sdk/agent-runtime.js";
assert.equal(
  resolveOpenClawAgentRuntimePath({
    gatewayEntryPath:
      "/opt/openclaw-2026.7.1/node_modules/openclaw/dist/index.js",
    fileExists: (candidate) => candidate === productionRuntime,
  }),
  productionRuntime,
);

assert.equal(
  resolveOpenClawAgentRuntimePath({
    explicitPath: "/srv/custom/agent-runtime.js",
    gatewayEntryPath: "/ignored/openclaw.mjs",
    fileExists: (candidate) => candidate === "/srv/custom/agent-runtime.js",
  }),
  "/srv/custom/agent-runtime.js",
);

assert.throws(
  () =>
    resolveOpenClawAgentRuntimePath({
      gatewayEntryPath: "/opt/unknown/openclaw.mjs",
      fileExists: () => false,
    }),
  /OpenClaw Agent runtime was not found/,
);

assert.equal(
  resolveOpenClawAgentHarnessRuntimePath({
    agentRuntimePath: vlabRuntime,
    fileExists: (candidate) =>
      candidate ===
      "/opt/vlab/current/node_modules/openclaw/dist/plugin-sdk/agent-harness-runtime.js",
  }),
  "/opt/vlab/current/node_modules/openclaw/dist/plugin-sdk/agent-harness-runtime.js",
);

assert.equal(
  resolveOpenClawSubagentAnnounceRuntimePath({
    agentRuntimePath: vlabRuntime,
    readDirectory: () => [
      "agent-events-abc.js",
      "subagent-announce-CIkgndJa.js",
      "subagent-announce-origin-DRzxvCSi.js",
    ],
  }),
  "/opt/vlab/current/node_modules/openclaw/dist/subagent-announce-CIkgndJa.js",
);

assert.throws(
  () =>
    resolveOpenClawSubagentAnnounceRuntimePath({
      agentRuntimePath: vlabRuntime,
      readDirectory: () => [],
    }),
  /was not uniquely resolved/,
);

assert.equal(
  resolveOpenClawSubagentAnnounceOriginRuntimePath({
    agentRuntimePath: vlabRuntime,
    readDirectory: () => [
      "subagent-announce-CIkgndJa.js",
      "subagent-announce-origin-DRzxvCSi.js",
    ],
  }),
  "/opt/vlab/current/node_modules/openclaw/dist/subagent-announce-origin-DRzxvCSi.js",
);

console.log(JSON.stringify({ ok: true, cases: 8 }));
