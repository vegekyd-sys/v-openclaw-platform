// gpt-live-consult-continuation-v1: process-local causal capabilities only
import { f as onAgentEventForRun, c as getAgentEventLifecycleGeneration, l as isAgentEventLifecycleGenerationCurrent, m as registerAgentEventLifecycleRotationHandler } from "./agent-events-Con5xUCM.js";
function createGptLiveConsultProgressObserver({ onProgress, abortSignal, logger, runId }) {
  let closed = false;
  let sequence = 0;
  let lastPublicSnapshot = "";
  let lastPublicDeliveredLength = 0;
  const previousTextBySource = new Map();
  const deliveredLengthBySource = new Map();
  const normalize = (text) => text.replace(/\s+/gu, " ").trim();
  // Keep unfinished dates, numbers and statements together. A public hook is
  // not evidence that its current token already forms a speakable fact.
  const completePrefixLength = (text, messageComplete) => {
    let boundary = 0;
    const closing = /["'\u2019\u201d\u300d\u300f\uff09)\]}]/u;
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (character === "\n" && /^\n[\t \r]*\n/u.test(text.slice(index))) {
        boundary = index + text.slice(index).match(/^\n[\t \r]*\n/u)[0].length;
        continue;
      }
      if (!"。？！?!.".includes(character)) continue;
      if (character === ".") {
        const previous = text[index - 1] ?? "";
        const next = text[index + 1] ?? "";
        if (/\p{N}/u.test(previous) && /\p{N}/u.test(next)) continue;
        if (next && !/\s/u.test(next) && !closing.test(next) && !".?!".includes(next)) continue;
        // A trailing "1." may still become "1.25" on the next delta.
        if (!next && /\p{N}/u.test(previous) && !messageComplete) continue;
      }
      let end = index + 1;
      while (end < text.length && ("。？！?!.".includes(text[end]) || closing.test(text[end]))) end++;
      boundary = end;
      index = end - 1;
    }
    return normalize(text.slice(0, boundary)).length;
  };
  const reportFailure = (error) => {
    try {
      logger?.warn?.(`[talk] public consult progress failed: ${error instanceof Error ? error.message : String(error)}`);
    } catch {}
  };
  const observe = (source, value, messageComplete = false, itemId) => {
    if (closed || abortSignal?.aborted || typeof onProgress !== "function") return false;
    // Retain trailing paragraph whitespace until after boundary detection.
    const text = typeof value === "string" ? value.trimStart() : "";
    const previousText = previousTextBySource.get(source) ?? "";
    const publicSnapshot = normalize(text);
    if (!publicSnapshot) return false;
    const previousSnapshot = normalize(previousText);
    let deliveredLength = publicSnapshot.startsWith(previousSnapshot) ? deliveredLengthBySource.get(source) ?? 0 : 0;
    previousTextBySource.set(source, text);
    // Native public replies and builtin public preambles can reconcile the
    // same cumulative message through different hooks with different IDs.
    // Share their already delivered prefix, including a mirror followed by
    // a genuine extension. Each source still advances its own cursor.
    if (publicSnapshot.startsWith(lastPublicSnapshot)) deliveredLength = Math.max(deliveredLength, lastPublicDeliveredLength);
    deliveredLengthBySource.set(source, deliveredLength);
    lastPublicSnapshot = publicSnapshot;
    lastPublicDeliveredLength = deliveredLength;
    const completeLength = completePrefixLength(text, messageComplete);
    if (completeLength <= deliveredLength) return false;
    const progressText = publicSnapshot.slice(deliveredLength, completeLength).trim();
    deliveredLengthBySource.set(source, completeLength);
    lastPublicDeliveredLength = completeLength;
    // Late closing quotes or punctuation must not become standalone speech.
    if (!progressText || !/[\p{L}\p{N}]/u.test(progressText)) return false;
    try {
      const pending = onProgress({ text: progressText, kind: "commentary", ...(runId ? {
        provenance: { emittedAt: Date.now(), sequence: ++sequence, runId, source,
          ...(typeof itemId === "string" && itemId ? { itemId } : {}) },
      } : {}) });
      if (pending && typeof pending.then === "function") Promise.resolve(pending).catch(reportFailure);
    } catch (error) {
      reportFailure(error);
    }
    // This observes progress; it does not claim successful final reply delivery.
    return false;
  };
  return {
    onPartialReply: (payload) => {
      if (payload?.isReasoning) return false;
      // Native streaming omits itemId; builtin completion reconciliation adds
      // one for the same cumulative reply. Keep their progress cursor shared.
      return observe("reply", payload?.text, false, payload?.itemId);
    },
    onAgentEvent: (event) => {
      const data = event?.data;
      if (event?.stream !== "item" || data?.kind !== "preamble" || data.phase !== "update" && data.phase !== "end") return false;
      return observe(`preamble:${typeof data.itemId === "string" ? data.itemId : ""}`, data.progressText, data.phase === "end", data.itemId);
    },
    close: () => { closed = true; },
  };
}
function createGptLiveConsultContinuationRegistry(deps) {
  const byRun = new Map();
  const byBatch = new Map();
  const byVoice = new Map();
  const voiceGenerations = new Map();
  const byChildTask = new Map();
  const externalScopes = new WeakMap();
  const owners = new Set();
  const clean = (value) => typeof value === "string" ? value.trim() : "";
  const error = (message) => Object.assign(new Error(message), { name: "AbortError" });
  const batchKey = ({ requesterSessionKey, requesterAgentId, batchRunIds, rearmGeneration }) => JSON.stringify([
    requesterAgentId, requesterSessionKey, [...batchRunIds].sort(), rearmGeneration,
  ]);
  deps.onLifecycleRotation?.(() => { for (const owner of [...owners]) owner.abort(error("Voice continuation gateway lifecycle changed")); voiceGenerations.clear(); });
  const createOwner = (params) => {
    const identity = params.continuationContext?.identity;
    const context = params.continuationContext;
    if (!clean(identity?.delegationItemId) || !Number.isSafeInteger(identity?.delegationGeneration) || identity.delegationGeneration < 1 ||
        !clean(context?.ownerConnId) || !clean(context?.voiceSessionId) || !clean(context?.ownerGeneration) || typeof context.isCurrent !== "function") return;
    const voiceKey = JSON.stringify([context.ownerConnId, context.voiceSessionId, context.ownerGeneration]);
    const previous = byVoice.get(voiceKey);
    if (identity.delegationGeneration <= (voiceGenerations.get(voiceKey) ?? 0)) throw error("Repeated or stale voice delegation");
    voiceGenerations.set(voiceKey, identity.delegationGeneration);
    if (voiceGenerations.size > 1024) voiceGenerations.delete(voiceGenerations.keys().next().value);
    previous?.abort(error("Voice delegation superseded"));
    const controller = new AbortController();
    const lifecycleGeneration = deps.getLifecycleGeneration();
    const bindings = new Map();
    const batches = new Set();
    const cleanups = new Set();
    let done = false;
    let resolve;
    let reject;
    const pending = new Promise((ok, fail) => { resolve = ok; reject = fail; });
    // A very fast resumed final can settle before the initial yielded turn returns.
    pending.catch(() => {});
    const isCurrent = () => {
      if (done || controller.signal.aborted || params.abortSignal?.aborted || !deps.isLifecycleCurrent(lifecycleGeneration) || byVoice.get(voiceKey) !== owner) return false;
      try { return context.isCurrent() === true && params.isSessionCurrent?.() !== false; } catch { return false; }
    };
    const assertCurrent = () => {
      if (isCurrent()) return;
      const failure = error("Voice continuation owner is no longer current");
      owner.abort(failure);
      throw failure;
    };
    const cleanup = () => {
      clearTimeout(timer);
      params.abortSignal?.removeEventListener("abort", abortFromCaller);
      for (const fn of cleanups) { try { fn(); } catch {} }
      cleanups.clear();
      for (const [runId, binding] of bindings) {
        if (byRun.get(runId) === binding) byRun.delete(runId);
        if (binding.taskRunId && byChildTask.get(binding.taskRunId) === binding) byChildTask.delete(binding.taskRunId);
      }
      for (const batch of batches) if (byBatch.get(batch.key) === batch) byBatch.delete(batch.key);
      if (byVoice.get(voiceKey) === owner) byVoice.delete(voiceKey);
      owners.delete(owner);
    };
    const settle = (result, failure) => {
      if (done) return false;
      done = true;
      cleanup();
      if (failure) { controller.abort(failure); reject(failure); } else resolve(result);
      return true;
    };
    const report = (progress, binding) => {
      if (!isCurrent() || binding.isCurrent?.() === false) return;
      const { emittedAt, runId, source, itemId } = progress.provenance ?? {};
      const provenance = { emittedAt, sequence: ++binding.sequence, runId, source, ...(itemId ? { itemId } : {}),
        parentRunId: params.runId, ...(binding.batch ? { batchRunIds: [...binding.batch.batchRunIds], rearmGeneration: binding.batch.rearmGeneration } : {}),
        role: binding.role };
      return params.onProgress?.({ text: progress.text, kind: "commentary", provenance });
    };
    const attachRun = ({ runId, sessionKey, sessionId, agentId, role, batch, isCurrent: check, taskRunId, registration }) => {
      assertCurrent();
      const existing = byRun.get(runId);
      if (existing) {
        if (existing.owner !== owner || existing.role !== role || existing.sessionKey !== sessionKey) throw error("Voice continuation run ownership conflict");
        return existing;
      }
      const binding = { owner, runId, sessionKey, sessionId, agentId, role, batch, isCurrent: check, taskRunId, sequence: 0 };
      bindings.set(runId, binding);
      byRun.set(runId, binding);
      if (taskRunId) byChildTask.set(taskRunId, binding);
      if (registration?.cleanup) cleanups.add(registration.cleanup);
      if (registration?.abortSignal) {
        const abort = () => owner.abort(registration.abortSignal.reason ?? error("Voice continuation task cancelled"));
        if (registration.abortSignal.aborted) abort();
        else {
          registration.abortSignal.addEventListener("abort", abort, { once: true });
          cleanups.add(() => registration.abortSignal.removeEventListener("abort", abort));
        }
      }
      const observer = deps.createProgressObserver({ onProgress: (progress) => report(progress, binding), abortSignal: controller.signal, logger: params.logger, runId });
      cleanups.add(observer.close);
      if (role !== "initial") {
        const unsubscribe = deps.subscribeRun(runId, (event) => {
          if (!isCurrent()) { owner.abort(error("Voice continuation owner changed before public progress")); return; }
          if (check?.() === false || event.runId !== runId ||
              event.lifecycleGeneration && event.lifecycleGeneration !== lifecycleGeneration ||
              event.sessionKey && event.sessionKey !== sessionKey || sessionId && event.sessionId && event.sessionId !== sessionId) return;
          // The assistant stream is the public text projection. No thought/tool/error stream is accepted.
          if (event.stream === "assistant" && typeof event.data?.text === "string" && event.data.isReasoning !== true &&
              (event.data.phase === undefined || event.data.phase === "final")) observer.onPartialReply(event.data);
          else observer.onAgentEvent(event);
        });
        binding.unsubscribe = unsubscribe;
        cleanups.add(unsubscribe);
      }
      return binding;
    };
    const finishResult = (result, binding) => {
      assertCurrent();
      if (result?.meta?.yielded === true) {
        // Only the actual public yield acknowledgment is eligible; no manufactured progress.
        const acknowledgment = clean(result.meta.yieldAcknowledgment);
        if (acknowledgment) deps.createProgressObserver({ onProgress: (progress) => report({ ...progress,
          provenance: { ...progress.provenance, source: "yield_ack" } }, binding), runId: binding.runId,
          abortSignal: controller.signal, logger: params.logger }).onPartialReply({ text: acknowledgment });
        if (!binding.pendingBatch) throw new Error("Yielded voice consult has no causally accepted requester batch");
        return;
      }
      if (result?.meta?.aborted || result?.meta?.error || !result || !Array.isArray(result.payloads)) throw new Error("Voice requester continuation ended without a successful final result");
      if (binding.role === "child") return;
      const text = params.collectVisibleText(result.payloads);
      if (!text) throw new Error("Voice requester continuation returned no speakable final");
      settle({ text });
    };
    const owner = {
      identity: { delegationItemId: identity.delegationItemId, delegationGeneration: identity.delegationGeneration },
      signal: controller.signal,
      isCurrent,
      assertCurrent,
      attachRun,
      onProgress: (progress) => report(progress, bindings.get(params.runId)),
      wait: () => pending,
      abort: (reason) => settle(undefined, reason instanceof Error ? reason : error(String(reason ?? "Voice continuation cancelled"))),
      finishInitial: (result) => {
        if (done) return pending;
        try { finishResult(result, bindings.get(params.runId)); } catch (failure) { owner.abort(failure); }
        return pending;
      },
    };
    byVoice.set(voiceKey, owner);
    owners.add(owner);
    const abortFromCaller = () => owner.abort(params.abortSignal.reason);
    const timer = setTimeout(() => owner.abort(new Error("Voice requester continuation timed out")), params.timeoutMs);
    timer.unref?.();
    try {
      attachRun({ runId: params.runId, sessionKey: params.sessionKey, sessionId: params.sessionId, agentId: params.agentId, role: "initial", registration: params.runRegistration });
      if (params.abortSignal?.aborted) abortFromCaller();
      else params.abortSignal?.addEventListener("abort", abortFromCaller, { once: true });
    } catch (failure) { owner.abort(failure); throw failure; }
    owner._bindBatch = (batch, binding) => { binding.pendingBatch = batch; batches.add(batch); };
    owner._finish = finishResult;
    owner._registerResume = params.onResumeRunStarted;
    owner._timeoutMs = params.timeoutMs;
    return owner;
  };
  const attachAcceptedChild = ({ entry, getCurrentEntry }) => {
    const requester = byRun.get(entry.requesterTurnRunId);
    const previous = byChildTask.get(entry.taskRunId ?? entry.runId);
    const parent = requester ?? previous?.parent;
    if (!parent || !parent.owner.isCurrent() || parent.sessionKey !== entry.requesterSessionKey ||
        parent.agentId && parent.agentId !== entry.requesterAgentId) return;
    const runId = entry.runId;
    const generation = entry.generation;
    const lifecycleGeneration = entry.execution?.lifecycleGeneration;
    if (previous && previous.runId !== runId) { previous.unsubscribe?.(); byRun.delete(previous.runId); }
    const binding = parent.owner.attachRun({ runId, sessionKey: entry.childSessionKey, sessionId: entry.childSessionId,
      taskRunId: entry.taskRunId ?? runId, role: "child", batch: parent.pendingBatch,
      isCurrent: () => getCurrentEntry(runId) === entry && entry.runId === runId && entry.generation === generation &&
        entry.execution?.lifecycleGeneration === lifecycleGeneration && entry.killIntent === undefined && entry.pauseReason !== "sessions_yield" });
    binding.parent = parent;
  };
  const bindYieldBatch = ({ requesterSessionKey, requesterAgentId, requesterTurnRunId, batchRunIds, rearmGeneration, requesterYielded }) => {
    if (!requesterYielded || !Number.isSafeInteger(rearmGeneration)) return;
    const parent = byRun.get(requesterTurnRunId);
    if (!parent || !parent.owner.isCurrent() || parent.sessionKey !== requesterSessionKey || parent.agentId && parent.agentId !== requesterAgentId) return;
    if (!batchRunIds.length || batchRunIds.some((runId) => {
      const child = byRun.get(runId);
      return !child || child.owner !== parent.owner || child.parent !== parent;
    })) { parent.owner.abort(new Error("Voice yield batch contains an unbound child")); return; }
    const batch = { key: batchKey({ requesterSessionKey, requesterAgentId, batchRunIds, rearmGeneration }),
      owner: parent.owner, parent, requesterSessionKey, requesterAgentId, batchRunIds: [...batchRunIds].sort(), rearmGeneration };
    parent.owner._bindBatch(batch, parent);
    for (const runId of batchRunIds) byRun.get(runId).batch = batch;
    byBatch.set(batch.key, batch);
  };
  const capabilityForBatch = (batch) => {
    if (!batch || batch.parent.pendingBatch !== batch || !batch.owner.isCurrent()) return;
    return {
      signal: batch.owner.signal,
      assertCurrent: ({ sessionKey, sessionId }) => {
        batch.owner.assertCurrent();
        if (batch.parent.pendingBatch !== batch || sessionKey !== batch.requesterSessionKey ||
            batch.parent.sessionId && sessionId !== batch.parent.sessionId) {
          const failure = error("Voice requester wake causal ownership changed"); batch.owner.abort(failure); throw failure;
        }
      },
      onAccepted: (accepted) => {
        batch.owner.assertCurrent();
        const runId = clean(accepted?.runId);
        if (!runId || batch.acceptedRunId && batch.acceptedRunId !== runId) throw error("Voice requester wake accepted a different replay run");
        batch.acceptedRunId = runId;
        batch.resumed = batch.owner.attachRun({ runId, sessionKey: batch.requesterSessionKey, sessionId: batch.parent.sessionId, agentId: batch.requesterAgentId,
          role: batch.parent.role === "child" ? "child" : "parent", batch,
          registration: batch.resumed ? undefined : batch.owner._registerResume?.({ runId, sessionId: batch.parent.sessionId, timeoutMs: batch.owner._timeoutMs }) });
      },
      finish: (result) => {
        if (!batch.resumed) { batch.owner.abort(new Error("Voice requester final arrived without an accepted causal run")); return; }
        try { batch.owner._finish(result, batch.resumed); } catch (failure) { batch.owner.abort(failure); }
      },
    };
  };
  const resolveWake = (params) => capabilityForBatch(byBatch.get(batchKey(params)));
  const bindHarnessSpawns = ({ scope, requesterSessionKey, requesterSessionId, requesterTurnRunId, acceptedSessionSpawns, requesterYielded, getChildSessionId }) => {
    const parent = byRun.get(requesterTurnRunId);
    if (!parent || !parent.owner.isCurrent()) return false;
    parent.owner.assertCurrent();
    if (parent.sessionKey !== requesterSessionKey || parent.sessionId && parent.sessionId !== requesterSessionId) throw error("Voice harness task scope does not own the original requester run");
    const spawns = [...new Map(acceptedSessionSpawns.map((spawn) => [clean(spawn.runId), spawn])).values()];
    if (!spawns.length) return false;
    const accepted = new Map();
    for (const spawn of spawns) {
      const runId = clean(spawn.runId); const childSessionKey = clean(spawn.childSessionKey); const childSessionId = getChildSessionId(childSessionKey);
      if (!runId || !childSessionKey || !childSessionId) throw new Error("Voice harness child has no accepted run/session identity");
      const existing = byRun.get(runId);
      const binding = existing ?? parent.owner.attachRun({ runId, sessionKey: childSessionKey, sessionId: childSessionId, role: "child",
        isCurrent: () => getChildSessionId(childSessionKey) === childSessionId });
      if (binding.owner !== parent.owner || binding.parent && binding.parent !== parent) throw error("Voice harness child is owned by another requester run");
      binding.parent = parent;
      const previousCheck = binding.isCurrent;
      binding.isCurrent = () => previousCheck?.() !== false && getChildSessionId(childSessionKey) === childSessionId;
      accepted.set(runId, { binding, childSessionKey, childSessionId, legacy: spawn.vlabGatewayOwned !== true });
    }
    if (requesterYielded) {
      // The host-issued scope identity and accepted child receipt form this private batch.
      // It is separate from registry outbox generations, and cannot be reconstructed from session text.
      const previous = externalScopes.get(scope);
      if (previous && previous.parent !== parent) throw error("Voice harness scope reused by another requester run");
      const batchRunIds = [...accepted.keys()].sort();
      const rearmGeneration = (previous?.rearmGeneration ?? 0) + 1;
      const batch = { key: `harness:${JSON.stringify([requesterTurnRunId, batchRunIds, rearmGeneration])}`, owner: parent.owner, parent,
        requesterSessionKey, requesterAgentId: parent.agentId, batchRunIds, rearmGeneration, accepted };
      parent.owner._bindBatch(batch, parent);
      for (const { binding } of accepted.values()) binding.batch = batch;
      byBatch.set(batch.key, batch); externalScopes.set(scope, batch);
    }
    return true;
  };
  const resolveHarnessCompletion = ({ scope, requesterSessionKey, requesterSessionId, requesterTurnRunId, childRunId, childSessionKey, childSessionId }) => {
    const batch = externalScopes.get(scope);
    if (!batch) return;
    if (!batch.owner.isCurrent()) return;
    const child = batch.accepted.get(childRunId);
    if (batch.parent.runId !== requesterTurnRunId || batch.requesterSessionKey !== requesterSessionKey ||
        batch.parent.sessionId && batch.parent.sessionId !== requesterSessionId || !child || !child.legacy ||
        child.childSessionKey !== childSessionKey || child.childSessionId !== childSessionId || child.binding.isCurrent?.() === false) throw error("Voice harness completion causal identity changed");
    // More than one legacy completion is steered into one pending parent turn. A genuine
    // final is accepted only after every accepted child has reported its completion.
    (batch.completedChildren ??= new Set()).add(childRunId);
    const resolved = capabilityForBatch(batch);
    if (!resolved) return;
    const finish = resolved.finish;
    return { ...resolved, finish: (result) => {
      if (result?.meta?.yielded !== true && batch.completedChildren.size !== batch.accepted.size) {
        batch.owner.abort(new Error("Voice requester returned final before every accepted child completed")); return;
      }
      finish(result);
    } };
  };
  return { createOwner, attachAcceptedChild, bindYieldBatch, resolveWake, bindHarnessSpawns, resolveHarnessCompletion };
}
const registry = createGptLiveConsultContinuationRegistry({
 subscribeRun: onAgentEventForRun, createProgressObserver: createGptLiveConsultProgressObserver,
 getLifecycleGeneration: getAgentEventLifecycleGeneration, isLifecycleCurrent: isAgentEventLifecycleGenerationCurrent,
 onLifecycleRotation: (callback) => registerAgentEventLifecycleRotationHandler("gpt-live-consult-continuation", callback),
});
export const { createOwner: createGptLiveConsultContinuationOwner, attachAcceptedChild: attachGptLiveConsultAcceptedChild, bindYieldBatch: bindGptLiveConsultYieldBatch, resolveWake: resolveGptLiveConsultRequesterWake, bindHarnessSpawns: bindGptLiveHarnessVoiceSpawns, resolveHarnessCompletion: resolveGptLiveHarnessVoiceCompletion } = registry;
