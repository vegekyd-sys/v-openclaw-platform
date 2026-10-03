import { AsyncLocalStorage } from "node:async_hooks";

/** No JSON flag, prompt or tool option can mint this process-local capability. */
export function createGptLiveVoiceExecLifetime(resolveOwnedExecSource, hooks = {}) {
  const storage = new AsyncLocalStorage();
  const issued = new WeakSet();
  const sourceFor = ({ attempt, operationalRunInstance, assertActive }) => {
    assertActive();
    const source = { runId: attempt.runId, sessionId: attempt.sessionId, sessionKey: attempt.sessionKey, agentId: attempt.agentId };
    const owner = resolveOwnedExecSource(source);
    if (!owner) return;
    const authority = hooks.getAuthority?.(attempt.admittedRunContext);
    if (!authority || authority.operationalRunInstance !== operationalRunInstance) throw new Error("Voice exec has no admitted delegated authority");
    if (!operationalRunInstance || attempt.admittedRunContext?.operationalRunInstance !== operationalRunInstance ||
        operationalRunInstance.runId !== attempt.runId) throw new Error("Voice exec admitted instance mismatch");
    const assertCurrent = () => {
      assertActive();
      if (attempt.admittedRunContext?.operationalRunInstance !== operationalRunInstance ||
          hooks.getAuthority?.(attempt.admittedRunContext) !== authority ||
          operationalRunInstance.runId !== attempt.runId || attempt.abortSignal?.aborted) throw new Error("Voice exec admission retired");
      owner.assertCurrent();
    };
    assertCurrent();
    return { ...source, operationalRunInstance, assertCurrent, signals: [owner.signal, owner.ownerSignal].filter(Boolean) };
  };
  const hasSource = (host) => Boolean(sourceFor(host));
  const bindTool = (tool, host) => {
    if (tool.name !== "exec") return tool;
    const withSource = async (run, signal) => {
      const source = sourceFor(host);
      if (!source) return await run(signal);
      const capability = Object.freeze(source);
      issued.add(capability);
      const combined = AbortSignal.any([...source.signals, ...signal ? [signal] : []]);
      try { return await storage.run(capability, async () => {
        source.assertCurrent(); combined.throwIfAborted();
        const result = await run(combined);
        source.assertCurrent(); combined.throwIfAborted();
        return result;
      }); } finally { issued.delete(capability); }
    };
    const bound = { ...tool, execute: (...args) => withSource((signal) => {
      const argv = [...args]; argv[2] = signal;
      return tool.execute(...argv);
    }, args[2]) };
    hooks.copyMetadata?.(tool, bound);
    const prepare = hooks.getPreparer?.(tool);
    if (prepare) hooks.attachPreparer(bound, async (params) => {
      const prepared = await withSource((signal) => prepare({ ...params, signal }), params.signal);
      return prepared.kind === "ready" ? { ...prepared,
        execute: (start) => withSource(() => prepared.execute(start), params.signal) } : prepared;
    });
    return bound;
  };
  const requireForeground = (defaults, caller) => {
    const capability = storage.getStore();
    if (!capability) return false;
    if (!issued.has(capability)) throw new Error("Unissued voice exec capability");
    capability.assertCurrent();
    if (defaults?.operationalRunInstance !== capability.operationalRunInstance || defaults.runId !== capability.runId ||
        defaults.sessionKey !== capability.sessionKey || defaults.sessionId !== capability.sessionId ||
        caller?.operationalRunInstance !== capability.operationalRunInstance || caller.sessionKey !== capability.sessionKey || caller.agentId !== capability.agentId) {
      throw new Error("Voice exec tool construction lost admitted source identity");
    }
    return true;
  };
  return Object.freeze({ hasSource, bindTool, requireForeground });
}

export function createGptLiveVoiceExecLifetimeRuntimeSource() {
  return `// gpt-live-voice-exec-lifetime-v1: opaque admitted foreground execution\n` +
    `import { AsyncLocalStorage } from "node:async_hooks";\n` +
    `import { resolveGptLiveVoiceExecSource } from "./gpt-live-consult-continuation.js";\n` +
    `import { r as copyAgentToolMetadata } from "./agent-tool-metadata-CkrU8K-F.js";\n` +
    `import { a as attachInternalToolExecutionPreparer, f as getInternalToolExecutionPreparer } from "./internal-hooks-CiSltLvS.js";\n` +
    `import { i as getAdmittedRunDelegatedAuthority } from "./admitted-run-context-DO5gB_Jz.js";\n` +
    `${createGptLiveVoiceExecLifetime.toString()}\n` +
    `const lifetime = createGptLiveVoiceExecLifetime((source) => resolveGptLiveVoiceExecSource(source), { getAuthority: getAdmittedRunDelegatedAuthority, copyMetadata: copyAgentToolMetadata, getPreparer: getInternalToolExecutionPreparer, attachPreparer: attachInternalToolExecutionPreparer });\n` +
    `export const { hasSource: hasGptLiveVoiceExecSource, bindTool: bindGptLiveVoiceExecTool, requireForeground: requireGptLiveVoiceExecForeground } = lifetime;\n`;
}
