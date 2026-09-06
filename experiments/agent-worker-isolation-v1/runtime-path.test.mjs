import assert from "node:assert/strict";
import {
  nativeExportBindings,
  resolveGatewayScopeContract,
  loadNativeRuntimeContract,
  resolveOpenClawAgentCommandRuntimePath,
  resolveOpenClawAgentHarnessRuntimePath,
  resolveOpenClawAgentRuntimePath,
  resolveOpenClawPreparedModelRuntimePath,
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

assert.equal(
  resolveOpenClawAgentCommandRuntimePath({
    agentRuntimePath: vlabRuntime,
    readDirectory: () => ["agent-command-source.js", "agent-command-public.js"],
    readFile: (candidate) =>
      candidate.endsWith("agent-command-public.js")
        ? "export { agentCommandFromGatewayIngress, agentCommandFromIngress };"
        : "export { agentCommandFromGatewayIngress as n };",
  }),
  "/opt/vlab/current/node_modules/openclaw/dist/agent-command-public.js",
);

assert.equal(
  resolveOpenClawPreparedModelRuntimePath({
    agentRuntimePath: vlabRuntime,
    readDirectory: () => [
      "prepared-model-runtime-source.js",
      "prepared-model-runtime-public.js",
    ],
    readFile: (candidate) =>
      candidate.endsWith("prepared-model-runtime-public.js")
        ? "export { acquireAgentRunPreparedModelRuntime, loadPreparedModelRuntimeSnapshot };"
        : "export { acquireAgentRunPreparedModelRuntime as t };",
  }),
  "/opt/vlab/current/node_modules/openclaw/dist/prepared-model-runtime-public.js",
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
    readFile: (candidate) =>
      candidate.endsWith("subagent-announce-CIkgndJa.js")
        ? "export { runSubagentAnnounceFlow };"
        : "",
  }),
  "/opt/vlab/current/node_modules/openclaw/dist/subagent-announce-CIkgndJa.js",
);

assert.throws(
  () =>
    resolveOpenClawSubagentAnnounceRuntimePath({
      agentRuntimePath: vlabRuntime,
      readDirectory: () => [],
      readFile: () => "",
    }),
  /was not uniquely resolved/,
);

assert.equal(
  resolveOpenClawSubagentAnnounceRuntimePath({
    agentRuntimePath: vlabRuntime,
    readDirectory: () => [
      "subagent-announce-BjkO3GIf.js",
      "subagent-announce-CizXkoJk.js",
    ],
    readFile: (candidate) =>
      candidate.endsWith("subagent-announce-CizXkoJk.js")
        ? "export { buildSubagentSystemPrompt, runSubagentAnnounceFlow, testing };"
        : "export { runSubagentAnnounceFlow as n, testing as r };",
  }),
  "/opt/vlab/current/node_modules/openclaw/dist/subagent-announce-CizXkoJk.js",
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

assert.equal(
  resolveOpenClawSubagentAnnounceOriginRuntimePath({
    agentRuntimePath: vlabRuntime,
    readDirectory: () => [
      "subagent-announce-delivery-CzAZKB_N.js",
      "subagent-announce-output-_n5-qgxC.js",
    ],
    readFile: (candidate) =>
      candidate.endsWith("subagent-announce-delivery-CzAZKB_N.js")
        ? "export { deliverSubagentAnnouncement as t, resolveAnnounceOrigin as r };"
        : "export { captureSubagentCompletionReply as i };",
  }),
  "/opt/vlab/current/node_modules/openclaw/dist/subagent-announce-delivery-CzAZKB_N.js",
);

// OpenClaw 2026.9.1's public facade contains a hyphen in its build hash.
assert.equal(
  resolveOpenClawSubagentAnnounceRuntimePath({
    agentRuntimePath: vlabRuntime,
    readDirectory: () => ["subagent-announce-D-7rIufL.js", "subagent-announce-DM0I4BxK.js"],
    readFile: (candidate) => candidate.endsWith("subagent-announce-D-7rIufL.js")
      ? "export { runSubagentAnnounceFlow, testing };"
      : "export { runSubagentAnnounceFlow as n, testing as r };",
  }),
  "/opt/vlab/current/node_modules/openclaw/dist/subagent-announce-D-7rIufL.js",
);
assert.equal(
  resolveOpenClawSubagentAnnounceOriginRuntimePath({
    agentRuntimePath: vlabRuntime,
    readDirectory: () => ["subagent-announce-delivery-Dose-7Zr.js"],
    readFile: () => "export { deliverSubagentAnnouncement as t };",
  }),
  "/opt/vlab/current/node_modules/openclaw/dist/subagent-announce-delivery-Dose-7Zr.js",
);
assert.throws(() => resolveOpenClawSubagentAnnounceRuntimePath({
  agentRuntimePath: vlabRuntime,
  readDirectory: () => ["subagent-announce-D-7rIufL.js", "subagent-announce-another.js"],
  readFile: () => "export { runSubagentAnnounceFlow };",
}), /was not uniquely resolved/);
for (const alias of ['s', 'c']) {
  const descriptor = resolveGatewayScopeContract({
    agentRuntimePath: vlabRuntime,
    readDirectory: () => ['gateway-request-scope-native.js', 'gateway-request-scope-facade.js'],
    readFile: file => file.endsWith('native.js')
      ? `export { getGatewayContextResolver as r, withPluginRuntimeGatewayContextResolver as ${alias}${alias === 'c' ? ', hasGatewayContextOwner as s' : ''} };`
      : 'export { withPluginRuntimeRegistryScope };',
  });
  assert.equal(descriptor.bindings.withPluginRuntimeGatewayContextResolver, alias);
  const expected = () => true, wrong = () => false;
  const runtime = await loadNativeRuntimeContract(descriptor, async () => ({s: wrong, r: () => {}, [alias]: expected}));
  assert.equal(runtime.withPluginRuntimeGatewayContextResolver, expected);
  await assert.rejects(loadNativeRuntimeContract(descriptor, async () => ({})), /is not a function/);
}
assert.throws(() => nativeExportBindings('export { unrelated as s };', ['withPluginRuntimeGatewayContextResolver']), /exactly once/);
assert.throws(() => nativeExportBindings('export { wanted as a, wanted as b };', ['wanted']), /exactly once/);
assert.throws(() => resolveGatewayScopeContract({agentRuntimePath: vlabRuntime,
  readDirectory: () => ['gateway-request-scope-one.js', 'gateway-request-scope-two.js'],
  readFile: () => 'export { getGatewayContextResolver as r, withPluginRuntimeGatewayContextResolver as c };',
}), /resolve uniquely/);
assert.deepEqual(nativeExportBindings('export { deliverSubagentAnnouncement as n };', ['deliverSubagentAnnouncement']), {deliverSubagentAnnouncement: 'n'});
console.log(JSON.stringify({ ok: true, cases: 27 }));
