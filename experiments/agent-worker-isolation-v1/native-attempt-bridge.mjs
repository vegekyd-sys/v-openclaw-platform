// Worker-only hooks. Contexts are registered by trusted IPC admission, never by
// tool arguments. Native run ownership and permission checks remain in core.
export const NATIVE_ATTEMPT_BRIDGE = Symbol.for("versa.vlab.native-attempt-91-v1");

export function createNativeAttemptBridge() {
  const runs = new Map();
  function current(runId) {
    const context = runs.get(runId);
    if (!context || context.signal.aborted) throw new Error("Worker native attempt is no longer active");
    return context;
  }
  return {
    register(message, signal, onDeadline, executeMessage) {
      if (runs.has(message.runId)) throw new Error("Duplicate Worker native run identity");
      const context = { message, signal, onDeadline, executeMessage };
      runs.set(message.runId, context);
      return () => { if (runs.get(message.runId) === context) runs.delete(message.runId); };
    },
    prepare(input) {
      const c = current(input.runId);
      if (input.sessionId !== c.message.sessionId || input.agentId !== c.message.agentId) {
        throw new Error("Worker native attempt identity mismatch");
      }
      const upstreamDeadline = input.onAttemptDeadlineChanged;
      c.prepared = true;
      return {
        ...input,
        conversationRoutePeerId: c.message.agentCommandOptions?.conversationRoutePeerId,
        onAttemptDeadlineChanged(deadline) {
          // Native cleanup may close an approval wait after cancellation.
          // Ignore retired notifications without throwing into native cleanup.
          if (runs.get(input.runId) !== c || c.signal.aborted) return;
          upstreamDeadline?.(deadline);
          c.onDeadline(deadline);
        },
      };
    },
    assertPrepared(runId) {
      if (!current(runId).prepared) throw new Error("OpenClaw 9.1 native Worker adapter patch was not executed");
    },
    bind(attempt, handle, isCurrent, applyAuthorized) {
      const c = current(attempt.runId);
      if (attempt.sessionId !== c.message.sessionId) throw new Error("Worker native owner mismatch");
      c.handle = handle;
      c.isCurrent = isCurrent;
      c.applyAuthorized = applyAuthorized;
    },
    async applyPermission(runId, mode) {
      const c = current(runId);
      if (!c.handle?.applyPermissionMode || !c.isCurrent?.()) return false;
      // Core refreshes its tool generation and aborts pending tools. Gateway
      // revokes Gateway-owned approvals before this authenticated IPC request.
      const result = await c.applyAuthorized(mode, () => {
        if (current(runId) !== c || !c.isCurrent()) throw new Error("Stale Worker permission change");
      });
      return result === true && runs.get(runId) === c && !c.signal.aborted && c.isCurrent();
    },
    async executeMessage(options, toolCallId, args, signal) {
      const c = current(options?.runId);
      if (options.sessionId !== c.message.sessionId || options.agentSessionKey !== c.message.sessionKey) {
        throw new Error("Worker message tool identity mismatch");
      }
      if (signal?.aborted) throw signal.reason ?? new Error("Message tool aborted");
      if (!c.message.gatewayMessageTool) return { handled: false };
      const result = await c.executeMessage({
        ownerRequestId: c.message.id,
        kind: "native-message",
        toolCallId,
        args,
      });
      if (current(options.runId) !== c || signal?.aborted) throw new Error("Message owner ended during delivery");
      return { handled: true, result };
    },
  };
}
