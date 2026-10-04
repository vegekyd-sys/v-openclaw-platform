import assert from "node:assert/strict";
export { createGptLiveVoiceExecLifetimeRuntimeSource } from "./gpt-live-voice-exec-lifetime.mjs";

const MODULE = "./gpt-live-voice-exec-lifetime.js";
function patch(source, replacements, label, imports = "") {
  const marker = `// gpt-live-voice-exec-lifetime-v1: ${label}`;
  if (source.includes(marker)) return source;
  let result = source;
  for (const [before, after] of replacements) {
    assert.equal(result.split(before).length - 1, 1, `${label} exec lifetime anchor drifted: ${before.slice(0, 90)}`);
    result = result.replace(before, after);
  }
  return `${marker}\n${imports}${result}`;
}

export function patchGptLiveVoiceExecHostCapability(source) {
  return patch(source, [
    [".map((tool) => gateBoundTool(tool, assertActive, observeResult));", ".map((tool) => gateBoundTool(tool, assertActive, observeResult)).map((tool) => bindGptLiveVoiceExecTool(tool, { attempt, operationalRunInstance, assertActive }));"],
    ["\t\tkind: \"agent-harness-host-capability\",", "\t\tkind: \"agent-harness-host-capability\",\n\t\tvlabHasVoiceExecLifetime: () => hasGptLiveVoiceExecSource({ attempt, operationalRunInstance, assertActive }),"],
  ], "host", `import { hasGptLiveVoiceExecSource, bindGptLiveVoiceExecTool } from "${MODULE}";\n`);
}

export function patchGptLiveVoiceExecBashTools(source) {
  return patch(source, [
    ["\tconst allowBackground = defaults?.processToolAvailabilityRef?.value ?? defaults?.allowBackground ?? true;", "\tconst configuredAllowBackground = defaults?.processToolAvailabilityRef?.value ?? defaults?.allowBackground ?? true;"],
    ["\t\t\tsignal?.throwIfAborted();\n\t\t\tassertSupportedExecParams(args);", `\t\t\tsignal?.throwIfAborted();
\t\t\tassertSupportedExecParams(args);
\t\t\tconst execCaller = getGptLiveExecCallerIdentity();
\t\t\tconst voiceForeground = requireGptLiveVoiceExecForeground(defaults, execCaller);
\t\t\tif (!voiceForeground) {
\t\t\t\tconst bridge = globalThis[Symbol.for("versa.vlab.native-attempt-91-v1")];
\t\t\t\tif (bridge?.executeVoiceExec) {
\t\t\t\t\tconst reply = await bridge.executeVoiceExec({ operationalRunInstance: defaults?.operationalRunInstance,
\t\t\t\t\t\trunId: defaults?.runId, sessionId: defaults?.sessionId, agentSessionKey: defaults?.sessionKey, agentId: execCaller?.agentId,
\t\t\t\t\t\tcallerRunInstance: execCaller?.operationalRunInstance }, toolCallId, args, signal);
\t\t\t\t\tif (reply?.handled === true) return reply.result;
\t\t\t\t\tif (reply?.handled !== false) throw new Error("Invalid native voice exec response");
\t\t\t\t}
\t\t\t}
\t\t\t// A model's background/yieldMs cannot shorten an admitted voice tool's lifetime.
\t\t\tconst allowBackground = voiceForeground ? false : configuredAllowBackground;`],
  ], "bash", `import { requireGptLiveVoiceExecForeground } from "${MODULE}";\nimport { r as getGptLiveExecCallerIdentity } from "./gateway-caller-context-CRUBJj3M.js";\n`);
}

export function patchGptLiveVoiceExecNativeAttemptBridge(source) {
  return patch(source, [
    ["  const runs = new Map();", "  const runs = new Map();\n  const retiredNativeRuns = new Set();"],
    ["      return () => { if (runs.get(message.runId) === context) runs.delete(message.runId); };", `      return () => {
        if (runs.get(message.runId) === context) {
          runs.delete(message.runId); retiredNativeRuns.add(message.runId);
          if (retiredNativeRuns.size > 2048) retiredNativeRuns.delete(retiredNativeRuns.values().next().value);
        }
      };`],
    ["      c.handle = handle;\n      c.isCurrent = isCurrent;", `      const instance = attempt.admittedRunContext?.operationalRunInstance;
      if (!instance || instance.runId !== attempt.runId || attempt.agentId !== c.message.agentId || attempt.sessionKey !== c.message.sessionKey) {
        throw new Error("Worker exec admitted source mismatch");
      }
      c.operationalRunInstance = instance;
      c.handle = handle;
      c.isCurrent = isCurrent;`],
    ["    async executeMessage(options, toolCallId, args, signal) {", `    async executeVoiceExec(options, toolCallId, args, signal) {
      // A non-native/legacy Worker tool has no registered native admission.
      // Never add a new RPC or lifetime restriction to that ordinary path.
      if (!runs.has(options?.runId)) {
        if (retiredNativeRuns.has(options?.runId)) throw new Error("Worker native exec owner has retired");
        return { handled: false };
      }
      const c = current(options?.runId);
      const assertCurrent = () => {
        if (current(options.runId) !== c || !c.handle || !c.isCurrent?.() || c.handle.isStopped?.() ||
            !c.operationalRunInstance || options.operationalRunInstance !== c.operationalRunInstance || options.callerRunInstance !== c.operationalRunInstance ||
            options.operationalRunInstance.runId !== options.runId || options.sessionId !== c.message.sessionId ||
            options.agentSessionKey !== c.message.sessionKey || options.agentId !== c.message.agentId) {
          throw new Error("Worker voice exec admitted source mismatch or retired owner");
        }
      };
      assertCurrent();
      if (typeof toolCallId !== "string" || !toolCallId) throw new Error("Invalid Worker exec tool call id");
      const combined = signal ? AbortSignal.any([c.signal, signal]) : c.signal;
      combined.throwIfAborted();
      // Cancellation is routed to this admission's existing relay only. No
      // authority flag, construction option or user identity crosses the wire.
      let cancellation;
      const cancel = () => cancellation ??= c.executeMessage({ kind: "native-voice-exec-cancel",
        ownerRequestId: c.message.id, toolCallId });
      const abort = () => { void cancel().catch(() => {}); };
      const execution = c.executeMessage({ kind: "native-voice-exec", ownerRequestId: c.message.id, toolCallId, args });
      combined.addEventListener("abort", abort, { once: true });
      if (combined.aborted) abort();
      try {
        const reply = await execution;
        if (combined.aborted) { await cancel(); combined.throwIfAborted(); }
        assertCurrent();
        if (reply?.handled !== true && reply?.handled !== false) throw new Error("Invalid Gateway exec lifetime reply");
        return reply;
      } catch (failure) {
        // A failed/expired IPC promise is not evidence that the OS command died.
        // Revoke it through the original relay and await its real tool settlement.
        await cancel().catch(() => {});
        throw failure;
      } finally {
        combined.removeEventListener("abort", abort);
      }
    },
    async executeMessage(options, toolCallId, args, signal) {`],
  ], "worker-native");
}

export function patchGptLiveVoiceExecGatewayRelay(source) {
  return patch(source, [
    ["  const pending = new Set();", "  const pending = new Set();\n  const execCalls = new Map();\n  const usedExecCallIds = new Set();"],
    ["    async execute(request) {\n      assertActive();", `    async execute(request) {
      if (request.kind === "native-voice-exec-cancel") {
        // Revocation remains available after source cancellation; it cannot
        // execute a tool or cancel another relay's guessed/reused call id.
        const owned = execCalls.get(request.toolCallId);
        if (!owned) throw new Error("No pending exec belongs to this Gateway relay call id");
        owned.controller.abort(Object.assign(new Error("Worker exec tool was cancelled"), { name: "AbortError" }));
        await owned.settled;
        return { cancelled: true, settled: true };
      }
      assertActive();`],
    ["      if (request.kind !== \"native-message\" || typeof request.toolCallId !== \"string\" || !request.toolCallId) {", `      const voiceExec = request.kind === "native-voice-exec";
      if (voiceExec) {
        if (typeof params.hostCapabilities.vlabHasVoiceExecLifetime !== "function") throw new Error("Native voice exec host adapter is unavailable");
        if (!params.hostCapabilities.vlabHasVoiceExecLifetime()) return { handled: false };
        if (typeof (params.cwd ?? params.workspaceDir) !== "string" || !(params.cwd ?? params.workspaceDir).startsWith("/")) {
          throw new Error("Voice exec requires its admitted absolute workspace");
        }
      }
      if ((!voiceExec && request.kind !== "native-message") || typeof request.toolCallId !== "string" || !request.toolCallId) {`],
    ["      const tool = tools.find(t => t.name === \"message\");\n      if (!tool?.execute) throw new Error(\"Native Gateway policy does not allow the message tool\");", `      const tool = tools.find(t => t.name === (voiceExec ? "exec" : "message"));
      if (!tool?.execute) throw new Error("Native Gateway policy does not allow the requested tool");
      if (voiceExec && (usedExecCallIds.has(request.toolCallId) || usedExecCallIds.size >= 1024)) throw new Error("Gateway voice exec call id was already used or capacity reached");`],
    ["      pending.add(controller);\n      const abort = () => controller.abort(params.abortSignal.reason);", `      pending.add(controller);
      let finish; let deadline;
      if (voiceExec) {
        usedExecCallIds.add(request.toolCallId);
        const settled = new Promise(resolve => { finish = resolve; });
        execCalls.set(request.toolCallId, { controller, settled });
        // Same bound as the original Worker tool RPC; do not leave an orphan
        // if that IPC connection disappears before its cancellation arrives.
        const configured = Number(process.env.VLAB_GATEWAY_OWNED_TOOL_TIMEOUT_MS ?? 310000);
        const timeoutMs = Number.isFinite(configured) ? Math.max(1000, configured) : 310000;
        deadline = setTimeout(() => controller.abort(Object.assign(new Error("Gateway voice exec RPC deadline exceeded"),
          { name: "AbortError", code: "VLAB_GATEWAY_TOOL_TIMEOUT" })), timeoutMs);
        deadline.unref?.();
      }
      const abort = () => controller.abort(params.abortSignal.reason);`],
    ["        return result;\n      } finally {\n        pending.delete(controller);", `        return voiceExec ? { handled: true, result } : result;
      } finally {
        clearTimeout(deadline);
        if (voiceExec) { execCalls.delete(request.toolCallId); finish(); }
        pending.delete(controller);`],
  ], "gateway-relay");
}

export function patchGptLiveVoiceExecWorkerPool(source) {
  return patch(source, [
    ["        if ([\"native-message\", \"native-gateway-identity\"].includes(message.request?.kind)) {", "        if ([\"native-message\", \"native-gateway-identity\", \"native-voice-exec\", \"native-voice-exec-cancel\"].includes(message.request?.kind)) {"],
    ["          if (!owner || owner.cancelRequested || owner.timeoutError || !owner.onGatewayToolRequest) {", "          const revokeOnly = message.request.kind === \"native-voice-exec-cancel\";\n          if (!owner || !owner.onGatewayToolRequest || !revokeOnly && (owner.cancelRequested || owner.timeoutError)) {"],
  ], "worker-pool");
}
