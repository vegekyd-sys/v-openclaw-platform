// gpt-live-voice-tool-order-v1: worker-native
// gpt-live-voice-exec-lifetime-v1: worker-native
// Worker-only hooks. Contexts are registered by trusted IPC admission, never by
// tool arguments. Native run ownership and permission checks remain in core.
import { AsyncLocalStorage } from 'node:async_hooks';
import { applyNativeHarnessData } from './native-harness-data.mjs';
import { isBridgedHarnessEventCallback } from './harness-event-contract.mjs';
import { acknowledgeGatewayPersistedUserTurn } from './user-turn-ownership.mjs';
export const NATIVE_ATTEMPT_BRIDGE = Symbol.for("versa.vlab.native-attempt-91-v1");

export function createNativeAttemptBridge() {
  const runs = new Map();
  const retiredNativeRuns = new Set();
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
      return () => {
        if (runs.get(message.runId) === context) {
          runs.delete(message.runId); retiredNativeRuns.add(message.runId);
          if (retiredNativeRuns.size > 2048) retiredNativeRuns.delete(retiredNativeRuns.values().next().value);
        }
      };
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
        // worker-stream-lifecycle-v1
        callbacks[name] = (...args) => {
          const delivery = (async () => {
          if (runs.get(input.runId) !== c || c.signal.aborted) return;
          const result = await local?.(...args);
          if (runs.get(input.runId) === c && !c.signal.aborted) await relay(...args);
          return result;
          })();
          c.callbackPending ??= new Set();
          c.callbackPending.add(delivery);
          delivery.then(() => c.callbackPending.delete(delivery), error => {
            c.callbackPending.delete(delivery);
            c.callbackFailure ??= error;
          });
          return delivery;
        };
      }
      c.prepared = true;
      return {
        ...applyNativeHarnessData(input, c.message.nativeHarnessData),
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
    async drainCallbacks(runId) {
      const c = current(runId);
      let timer;
      try {
        await Promise.race([
          (async () => { while (c.callbackPending?.size) await Promise.allSettled([...c.callbackPending]); })(),
          new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(
            new Error("Worker native callback drain timed out"), {code:"VLAB_WORKER_STREAM_ACK_TIMEOUT"})), 30000); }),
        ]);
      } finally { clearTimeout(timer); }
      if (c.callbackFailure) throw c.callbackFailure;
    },
    assertPrepared(runId) {
      if (!current(runId).prepared) throw new Error("OpenClaw 9.1 native Worker adapter patch was not executed");
    },
    bind(attempt, handle, isCurrent, applyAuthorized, applyVoiceToolOrder) {
      const c = current(attempt.runId);
      if (attempt.sessionId !== c.message.sessionId) throw new Error("Worker native owner mismatch");
      const instance = attempt.admittedRunContext?.operationalRunInstance;
      if (!instance || instance.runId !== attempt.runId || attempt.agentId !== c.message.agentId || attempt.sessionKey !== c.message.sessionKey) {
        throw new Error("Worker exec admitted source mismatch");
      }
      if (c.message.gptLiveVoiceToolOrder === "sequential-v1" && c.operationalRunInstance && c.operationalRunInstance !== instance) {
        throw new Error("Worker voice tool-order admitted instance changed");
      }
      c.operationalRunInstance = instance;
      c.handle = handle;
      c.isCurrent = isCurrent;
      c.applyAuthorized = applyAuthorized;
      if (c.message.gptLiveVoiceToolOrder !== undefined && c.message.gptLiveVoiceToolOrder !== "sequential-v1") {
        throw new Error("Unknown Worker voice tool-order admission");
      }
      if (c.message.gptLiveVoiceToolOrder === "sequential-v1") {
        if (c.message.nativeAttempt91 !== true || !c.isCurrent?.() || c.handle?.isStopped?.() ||
            typeof applyVoiceToolOrder !== "function") throw new Error("Worker voice tool-order owner is unavailable");
        if (applyVoiceToolOrder() !== true || current(attempt.runId) !== c || !c.isCurrent() || c.handle.isStopped?.()) {
          throw new Error("Worker voice tool-order was not applied to the admitted Agent");
        }
        c.voiceToolOrderApplied = true;
      }
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
      if (options.isInboundUserMessage === true && (!options.toolAuthorityFingerprint ||
          options.toolAuthorityFingerprint !== c.handle.toolAuthorityFingerprint)) {
        throw new Error('Native Worker Steer tool authority mismatch');
      }
      return await c.handle.queueMessage(text, options);
    },
    async executeVoiceExec(options, toolCallId, args, signal) {
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
