import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const GPT_LIVE_TOOL_ORDER_BUILTIN_BEFORE = "f121be943b9694cbc73a00529a38235df4f6ebdb652208fa103c44b7a8ca0e80";
export const GPT_LIVE_TOOL_ORDER_AGENT_CORE_BEFORE = "0c9bcca812ac44e9cd79a8df3ce627c55cd569182a4e9f0f6623d54483f149fa";
const FLAG = "gptLiveVoiceToolOrder";
const MODE = "sequential-v1";

function patch(source, label, replacements, beforeSha) {
  const marker = `// gpt-live-voice-tool-order-v1: ${label}`;
  if (source.includes(marker)) return source;
  if (beforeSha) assert.equal(createHash("sha256").update(source).digest("hex"), beforeSha,
    `${label} captured voice tool-order source drifted`);
  for (const [before, after] of replacements) {
    assert.equal(source.split(before).length - 1, 1, `${label} voice tool-order anchor drifted: ${before.slice(0, 90)}`);
    source = source.replace(before, after);
  }
  return `${marker}\n${source}`;
}

/** Called on the already-patched native Gateway index. No model option enters this admission. */
export function patchGptLiveVoiceToolOrderGatewayIndex(source) {
  return patch(source, "gateway-index", [[
    "                onGatewayToolRequest: gatewayMessageRelay?.execute,",
    `                onGatewayToolRequest: gatewayMessageRelay?.execute,
                // This function remains Gateway-local. Only the actual host's
                // admitted voice source can select the private IPC mode.
                authorizeNativeVoiceToolOrder: () => {
                  params.hostCapabilities?.assertActive?.();
                  return params.hostCapabilities?.vlabHasVoiceExecLifetime?.() === true;
                },`,
  ]]);
}

/** Called after the exec patch; every request field is stripped before trusted admission. */
export function patchGptLiveVoiceToolOrderWorkerPool(source) {
  return patch(source, "worker-pool", [[
    "    const requestId = `request-${nextPoolRequestId}`;",
    `    // A request/prompt/nativeHarnessData boolean cannot mint this mode.
    const { ${FLAG}: untrustedVoiceToolOrder, ...toolOrderRequest } = request;
    const voiceSequential = request.nativeAttempt91 === true &&
      typeof options.authorizeNativeVoiceToolOrder === "function" &&
      options.authorizeNativeVoiceToolOrder() === true;
    const admittedToolOrderRequest = voiceSequential
      ? { ...toolOrderRequest, ${FLAG}: "${MODE}" } : toolOrderRequest;
    const requestId = \`request-\${nextPoolRequestId}\`;`,
  ], [
    "        request,\n        onEvent:",
    "        request: admittedToolOrderRequest,\n        onEvent:",
  ]]);
}

/** Only a registered native IPC attempt can invoke the actual Agent closure. */
export function patchGptLiveVoiceToolOrderNativeAttemptBridge(source) {
  assert(source.includes("// gpt-live-voice-exec-lifetime-v1: worker-native"),
    "voice tool-order bridge requires the exact admitted exec identity patch first");
  return patch(source, "worker-native", [[
    "    bind(attempt, handle, isCurrent, applyAuthorized) {",
    "    bind(attempt, handle, isCurrent, applyAuthorized, applyVoiceToolOrder) {",
  ], [
    "      c.operationalRunInstance = instance;",
    `      if (c.message.${FLAG} === "${MODE}" && c.operationalRunInstance && c.operationalRunInstance !== instance) {
        throw new Error("Worker voice tool-order admitted instance changed");
      }
      c.operationalRunInstance = instance;`,
  ], [
    "      c.applyAuthorized = applyAuthorized;",
    `      c.applyAuthorized = applyAuthorized;
      if (c.message.${FLAG} !== undefined && c.message.${FLAG} !== "${MODE}") {
        throw new Error("Unknown Worker voice tool-order admission");
      }
      if (c.message.${FLAG} === "${MODE}") {
        if (c.message.nativeAttempt91 !== true || !c.isCurrent?.() || c.handle?.isStopped?.() ||
            typeof applyVoiceToolOrder !== "function") throw new Error("Worker voice tool-order owner is unavailable");
        if (applyVoiceToolOrder() !== true || current(attempt.runId) !== c || !c.isCurrent() || c.handle.isStopped?.()) {
          throw new Error("Worker voice tool-order was not applied to the admitted Agent");
        }
        c.voiceToolOrderApplied = true;
      }`,
  ]]);
}

/** New target: the actual native built-in module, not a guessed Agent handle API. */
export function patchGptLiveVoiceToolOrderBuiltin(source) {
  return patch(source, "native-builtin", [[
    '\t\t\t() => queueHandle.applyPermissionMode(mode, revoke)));',
    `\t\t\t() => queueHandle.applyPermissionMode(mode, revoke)),
\t\t() => {
\t\t\tif (ACTIVE_EMBEDDED_RUNS_BY_RUN_ID.get(attempt.runId) !== queueHandle || queueHandle.isStopped() ||
\t\t\t\tinput.activeSession.agent.state.isStreaming || input.activeSession.agent.signal) throw new Error("Native voice tool-order closure is stale or already active");
\t\t\t// Agent.createLoopConfig snapshots this public SDK field at prompt start.
\t\t\t// Every attempt creates a fresh AgentSession; the SDK default is unchanged.
\t\t\tinput.activeSession.agent.toolExecution = "sequential";
\t\t\treturn input.activeSession.agent.toolExecution === "sequential";
\t\t});`,
  ]], GPT_LIVE_TOOL_ORDER_BUILTIN_BEFORE);
}
