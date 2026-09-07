// Worker-only hooks. Contexts are registered by trusted IPC admission, never by
// tool arguments. Native run ownership and permission checks remain in core.
import { AsyncLocalStorage } from 'node:async_hooks';
import { applyNativeHarnessData } from './native-harness-data.mjs';
import { isBridgedHarnessEventCallback } from './harness-event-contract.mjs';
import { acknowledgeGatewayPersistedUserTurn } from './user-turn-ownership.mjs';
export const NATIVE_ATTEMPT_BRIDGE = Symbol.for("versa.vlab.native-attempt-91-v1");

export function createNativeAttemptBridge() {
  const runs = new Map();
  const runtimeScope = new AsyncLocalStorage();
  function current(runId) {
    const context = runs.get(runId);
    if (!context || context.signal.aborted) throw new Error("Worker native attempt is no longer active");
    return context;
  }
  return {
    // Use native prepared plugin registrations, never a copied capability list.
    // Async scope keeps simultaneous agents from changing each other's registry.
    withPluginGeneration(generation, run) {
      return runtimeScope.run(generation?.pluginRegistry, run);
    },
    getChannelRegistry() { return runtimeScope.getStore(); },
    register(message, signal, onDeadline, executeMessage, getStreamCallbacks = () => ({})) {
      if (runs.has(message.runId)) throw new Error("Duplicate Worker native run identity");
      const context = { message, signal, onDeadline, executeMessage, getStreamCallbacks };
      runs.set(message.runId, context);
      return () => { if (runs.get(message.runId) === context) runs.delete(message.runId); };
    },
    prepare(input) {
      const c = current(input.runId);
      if (input.sessionId !== c.message.sessionId || input.agentId !== c.message.agentId) {
        throw new Error("Worker native attempt identity mismatch");
      }
      const gatewayUserTurnPersisted = acknowledgeGatewayPersistedUserTurn(input, c.message);
      const upstreamDeadline = input.onAttemptDeadlineChanged;
      const callbacks = {};
      for (const [name, relay] of Object.entries(c.getStreamCallbacks())) {
        if (!isBridgedHarnessEventCallback(name) || typeof relay !== 'function') throw new Error('Unreviewed native event callback');
        // The dedicated deadline bridge preserves synchronous native ownership.
        if (name === 'onAttemptDeadlineChanged') continue;
        const local = input[name];
        callbacks[name] = async (...args) => {
          if (runs.get(input.runId) !== c || c.signal.aborted) return;
          const result = await local?.(...args);
          if (runs.get(input.runId) === c && !c.signal.aborted) await relay(...args);
          return result;
        };
      }
      c.prepared = true;
      const prepared = applyNativeHarnessData(input, c.message.nativeHarnessData);
      // 9.2 prepares execution authority before runEmbeddedAttempt. A Gateway
      // fingerprint is not the Worker's process-local prepared authority.
      if (input.toolAuthorityFingerprint) {
        prepared.toolAuthorityFingerprint = input.toolAuthorityFingerprint;
        c.localToolAuthorityFingerprint = input.toolAuthorityFingerprint;
      }
      return {
        ...prepared,
        // This is a derived handoff invariant, not an ordinary request option.
        // Keep the admitted row and suppress exactly one native replay append.
        ...(gatewayUserTurnPersisted ? {suppressNextUserMessagePersistence:true} : {}),
        ...callbacks,
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
    async steer(runId, text, options) {
      const c = current(runId);
      if (!c.handle || !c.isCurrent?.() || c.handle.isStopped?.() || c.handle.isCompacting?.()) {
        throw new Error('Native Worker is not ready for message injection');
      }
      if (options.isInboundUserMessage === true) {
        const gatewayFingerprint = c.message.nativeHarnessData?.toolAuthorityFingerprint;
        const expected = c.localToolAuthorityFingerprint ? gatewayFingerprint : c.handle.toolAuthorityFingerprint;
        if (!options.toolAuthorityFingerprint || options.toolAuthorityFingerprint !== expected ||
            (c.localToolAuthorityFingerprint && c.handle.toolAuthorityFingerprint !== c.localToolAuthorityFingerprint)) {
          throw new Error('Native Worker Steer tool authority mismatch');
        }
        // The trusted IPC owner has already validated Gateway authority. Core
        // still validates its own exact current handle, policy and lifecycle.
        options = {...options, toolAuthorityFingerprint: c.handle.toolAuthorityFingerprint};
      }
      return await c.handle.queueMessage(text, options);
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
    async resolveGatewayIdentity(identity, params) {
      const c = current(identity?.operationalRunInstance?.runId);
      if(identity.sessionKey !== c.message.sessionKey || identity.agentId !== c.message.agentId) {
        throw new Error("Worker Gateway identity mismatch");
      }
      if(params.target !== "local" || params.opts?.gatewayUrl || params.opts?.gatewayToken) {
        throw new Error("Worker identity requires trusted local Gateway");
      }
      const result = await c.executeMessage({kind:"native-gateway-identity",ownerRequestId:c.message.id,
        method:params.method,required:params.required===true});
      if(current(identity.operationalRunInstance.runId)!==c)throw new Error("Worker Gateway owner retired");
      return result?.token;
    },
  };
}
