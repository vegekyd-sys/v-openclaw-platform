import assert from "node:assert/strict";
import {
  resolveOpenClawAgentCommandRuntimePath,
  resolveOpenClawAgentHarnessRuntimePath,
  resolveOpenClawAgentRuntimePath,
  resolveOpenClawPreparedModelRuntimePath,
  resolveOpenClawSubagentAnnounceOriginRuntimePath,
  resolveOpenClawSubagentAnnounceRuntimePath,
  loadNativeRuntimeContract,
  resolveGatewayScopeContract,
  resolveHostGatewayBridge,
  createMediaCompletionDelivery,
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
// 9.6 splits the gateway scope contract across two chunks; 9.5 keeps it in one.
const scopeFiles = {
  "gateway-context-binding-VqB7gkMe.mjs": "export { getGatewayContextResolver as a, bindGatewayContextResolver as t };",
  "gateway-context-binding-owner-bQvbtsTz.mjs": "export { getGatewayContextBindingSlot as t };",
  "gateway-request-scope-BLBH-Gpf.mjs": "export { withPluginRuntimeGatewayContextResolver as o, createRegistryScope as t };",
  "gateway-request-scope-YnkE23gw.mjs": "export { withPluginRuntimeRegistryScope };",
};
const split = resolveGatewayScopeContract({
  agentRuntimePath: vlabRuntime,
  readDirectory: () => Object.keys(scopeFiles),
  readFile: file => scopeFiles[file.split("/").pop()],
});
assert.deepEqual(split.parts.map(part => part.path.split("/").pop()), [
  "gateway-context-binding-VqB7gkMe.mjs",
  "gateway-request-scope-BLBH-Gpf.mjs",
]);
const loaded = await loadNativeRuntimeContract(split, async href =>
  href.includes("gateway-context-binding") ? { a: () => "resolver" } : { o: () => "scope" });
assert.equal(loaded.getGatewayContextResolver(), "resolver");
assert.equal(loaded.withPluginRuntimeGatewayContextResolver(), "scope");
const single = resolveGatewayScopeContract({
  agentRuntimePath: vlabRuntime,
  readDirectory: () => ["gateway-request-scope-CVb8Vezy.mjs"],
  readFile: () => "export { getGatewayContextResolver as a, withPluginRuntimeGatewayContextResolver as f };",
});
assert.equal(single.parts, undefined);
assert.deepEqual(single.bindings, { getGatewayContextResolver: "a", withPluginRuntimeGatewayContextResolver: "f" });
// The fork's host bridge wins when complete; older cores have none.
const fn = () => {};
const bridgeKey = Symbol.for("versa.openclaw.host-gateway-bridge.v1");
assert.equal(resolveHostGatewayBridge({}), undefined);
assert.equal(resolveHostGatewayBridge({ [bridgeKey]: { contract: "versa-host-gateway-bridge-v1", withoutGatewayToolCallerIdentity: fn } }), undefined);
const complete = { contract: "versa-host-gateway-bridge-v1", withoutGatewayToolCallerIdentity: fn, getGatewayContextResolver: fn, withPluginRuntimeGatewayContextResolver: fn };
assert.equal(resolveHostGatewayBridge({ [bridgeKey]: complete }), complete);
// Detached work admission (cb03bd0 lacks it; later bridges carry the host's).
const admitting = { ...complete, runWithGatewayDetachedWorkContinuation: fn };
assert.equal(resolveHostGatewayBridge({ [bridgeKey]: admitting })?.runWithGatewayDetachedWorkContinuation, fn);
assert.equal(resolveHostGatewayBridge({ [bridgeKey]: { ...complete, runWithGatewayDetachedWorkContinuation: 1 } }), undefined);
// Media completion delivery (9.6 fork bridge): the host's own delivery wins over
// the captured-copy native import, which never schedules the queued row.
const mediaDelivering = { ...admitting, deliverWorkerMediaCompletion: async (d) => ({ host: d }) };
assert.equal(resolveHostGatewayBridge({ [bridgeKey]: mediaDelivering }), mediaDelivering);
assert.equal(resolveHostGatewayBridge({ [bridgeKey]: { ...admitting, deliverWorkerMediaCompletion: 1 } }), undefined);
let nativeLoads = 0;
const nativeDeliver = async () => { nativeLoads++; return async (d) => ({ copy: d }); };
assert.deepEqual(await createMediaCompletionDelivery(mediaDelivering, nativeDeliver)({ id: 1 }), { host: { id: 1 } });
assert.equal(nativeLoads, 0);
assert.deepEqual(await createMediaCompletionDelivery(admitting, nativeDeliver)({ id: 2 }), { copy: { id: 2 } });
assert.deepEqual(await createMediaCompletionDelivery(undefined, nativeDeliver)({ id: 3 }), { copy: { id: 3 } });
await assert.rejects(createMediaCompletionDelivery(undefined, async () => undefined)({}), /delivery runtime is unavailable/);
console.log(JSON.stringify({ ok: true, cases: 29 }));
