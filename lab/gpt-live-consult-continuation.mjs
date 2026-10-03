/** Process-local voice capabilities. Nothing in this registry is persisted or supplied by a client. */
export function createGptLiveConsultContinuationRegistry(deps) {
  const byRun = new Map();
  const byBatch = new Map();
  const settledVoiceBatches = new Set();
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
    let cancellationNotified = false;
    let cancellationAccepted = false;
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
      for (const batch of batches) {
        if (byBatch.get(batch.key) === batch) byBatch.delete(batch.key);
        // A known voice batch must never degrade into ordinary nonvoice
        // announcement after cancellation or final settlement.
        settledVoiceBatches.add(batch.key);
        if (settledVoiceBatches.size > 1024) settledVoiceBatches.delete(settledVoiceBatches.values().next().value);
      }
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
    const cancel = (reason, source = "owner_signal", sourceRunId = params.runId) => {
      if (done) return false;
      cancellationAccepted = true;
      if (!cancellationNotified) {
        cancellationNotified = true;
        // This is a host-issued capability, never a string classifier. Revoke
        // native delivery before rejecting the pending consult or its Worker.
        try { context.onCanceled?.({ ...owner.identity, ownerRunId: params.runId, runId: sourceRunId, source }); } catch {}
      }
      const failure = error(reason instanceof Error ? reason.message : "Voice consult cancelled");
      settle(undefined, failure);
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
    const attachRun = ({ runId, sessionKey, sessionId, agentId, role, batch, isCurrent: check, isTerminal, taskRunId, registration }) => {
      assertCurrent();
      const existing = byRun.get(runId);
      if (existing) {
        if (existing.owner !== owner || existing.role !== role || existing.sessionKey !== sessionKey) throw error("Voice continuation run ownership conflict");
        return existing;
      }
      const binding = { owner, runId, sessionKey, sessionId, agentId, role, batch, isCurrent: check, isTerminal, taskRunId, sequence: 0 };
      bindings.set(runId, binding);
      byRun.set(runId, binding);
      if (taskRunId) byChildTask.set(taskRunId, binding);
      if (registration?.cleanup) cleanups.add(registration.cleanup);
      if (registration?.abortSignal) {
        const abort = () => cancel(registration.abortSignal.reason, "owned_run_signal", binding.runId);
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
      if (result?.meta?.aborted === true) {
        cancel(error("Voice requester run was aborted"), "aborted_result");
        return;
      }
      if (result?.meta?.yielded === true) {
        binding.yielded = true;
        // Only the actual public yield acknowledgment is eligible; no manufactured progress.
        const acknowledgment = clean(result.meta.yieldAcknowledgment);
        if (acknowledgment) deps.createProgressObserver({ onProgress: (progress) => report({ ...progress,
          provenance: { ...progress.provenance, source: "yield_ack" } }, binding), runId: binding.runId,
          abortSignal: controller.signal, logger: params.logger }).onPartialReply({ text: acknowledgment });
        if (!binding.pendingBatch) throw new Error("Yielded voice consult has no causally accepted requester batch");
        return;
      }
      if (result?.meta?.error || !result || !Array.isArray(result.payloads)) throw new Error("Voice requester continuation ended without a successful final result");
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
      cancel,
      finishInitial: (result) => {
        if (done) return pending;
        try { finishResult(result, bindings.get(params.runId)); } catch (failure) { owner.abort(failure); }
        return pending;
      },
    };
    owner.matchesControl = (target) => context.ownerConnId === target.ownerConnId && params.sessionKey === target.sessionKey &&
      (target.agentId === undefined || params.agentId === target.agentId) &&
      (target.runId === undefined || bindings.has(target.runId)) && isCurrent();
    owner.cancelOwnedRuns = async (executeCancel) => {
      assertCurrent();
      // Mint exact run capabilities before revocation. They remain usable only
      // for this accepted cancellation, this transport and this generation.
      const terminal = (binding) => binding.yielded === true || binding.completed === true || binding.isTerminal?.() === true;
      const controlCurrent = (binding, resolvedSessionId) => {
        if (resolvedSessionId !== undefined && binding.sessionId && binding.sessionId !== resolvedSessionId) return false;
        if (!deps.isLifecycleCurrent(lifecycleGeneration) || voiceGenerations.get(voiceKey) !== identity.delegationGeneration || binding.isCurrent?.() === false) return false;
        try { return context.isCurrent() === true && params.isSessionCurrent?.() !== false &&
          (isCurrent() || cancellationAccepted); } catch { return false; }
      };
      const targets = [...bindings.values()].filter((binding) => !terminal(binding)).map((binding) => ({
        binding, sessionKey: binding.sessionKey,
        runTarget: { runId: binding.runId, signal: new AbortController().signal,
          isCurrent: (sessionId) => controlCurrent(binding, sessionId) },
      }));
      let aborted = 0;
      const failures = [];
      for (const target of targets) {
        if (terminal(target.binding)) continue;
        const result = await executeCancel(target, () => cancel(error("Voice consult explicitly cancelled"), "explicit_control", target.binding.runId));
        if (result?.ok === true && result.mode === "cancel" && result.aborted === true) aborted++;
        else if (!(result?.reason === "no_active_run" && terminal(target.binding))) failures.push(result?.reason ?? "abort_rejected");
      }
      if (failures.length) return { ok: false, mode: "cancel", sessionKey: params.sessionKey, active: true, aborted: aborted > 0,
        reason: "owned_cancel_incomplete", message: "OpenClaw could not confirm cancellation of every owned run.", speak: true, show: true, suppress: false };
      if (!cancellationAccepted && !cancel(error("Voice continuation wait explicitly cancelled"), "explicit_control")) {
        return { ok: false, mode: "cancel", sessionKey: params.sessionKey, active: false, aborted: false,
          reason: "owner_changed", message: "The voice task changed before cancellation.", speak: true, show: true, suppress: false };
      }
      return { ok: true, mode: "cancel", sessionKey: params.sessionKey, active: true, aborted: true,
        message: "Cancelled the active OpenClaw voice task.", speak: true, show: true, suppress: false };
    };
    byVoice.set(voiceKey, owner);
    owners.add(owner);
    const abortFromCaller = () => cancel(params.abortSignal.reason, "owner_signal");
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
      isTerminal: () => getCurrentEntry(runId) === entry && (typeof entry.execution?.endedAt === "number" || entry.execution?.status === "terminal"),
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
  const assertAcceptedChildBindingsCurrent = (batch) => {
    if (!batch.accepted) return;
    for (const { binding } of batch.accepted.values()) {
      let current = false;
      try { current = binding.isCurrent?.() !== false; } catch {}
      if (!current) {
        const failure = error("Voice harness completion accepted child identity changed");
        batch.owner.abort(failure);
        throw failure;
      }
    }
  };
  const capabilityForBatch = (batch) => {
    if (!batch || batch.parent.pendingBatch !== batch || !batch.owner.isCurrent()) return;
    assertAcceptedChildBindingsCurrent(batch);
    return {
      signal: batch.owner.signal,
      assertCurrent: ({ sessionKey, sessionId }) => {
        batch.owner.assertCurrent();
        assertAcceptedChildBindingsCurrent(batch);
        if (batch.parent.pendingBatch !== batch || sessionKey !== batch.requesterSessionKey ||
            batch.parent.sessionId && sessionId !== batch.parent.sessionId) {
          const failure = error("Voice requester wake causal ownership changed"); batch.owner.abort(failure); throw failure;
        }
      },
      onAccepted: (accepted) => {
        batch.owner.assertCurrent();
        assertAcceptedChildBindingsCurrent(batch);
        const runId = clean(accepted?.runId);
        if (!runId || batch.acceptedRunId && batch.acceptedRunId !== runId) throw error("Voice requester wake accepted a different replay run");
        batch.acceptedRunId = runId;
        batch.resumed = batch.owner.attachRun({ runId, sessionKey: batch.requesterSessionKey, sessionId: batch.parent.sessionId, agentId: batch.requesterAgentId,
          role: batch.parent.role === "child" ? "child" : "parent", batch,
          registration: batch.resumed ? undefined : batch.owner._registerResume?.({ runId, sessionId: batch.parent.sessionId, timeoutMs: batch.owner._timeoutMs }) });
      },
      finish: (result) => {
        try {
          assertAcceptedChildBindingsCurrent(batch);
          if (!batch.resumed) { batch.owner.abort(new Error("Voice requester final arrived without an accepted causal run")); return; }
          batch.owner._finish(result, batch.resumed);
        } catch (failure) { batch.owner.abort(failure); }
      },
    };
  };
  const resolveWake = (params) => {
    const key = batchKey(params), batch = byBatch.get(key);
    if (!batch && settledVoiceBatches.has(key)) throw error("Voice requester batch has already settled or been cancelled");
    return capabilityForBatch(batch);
  };
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
    if (!batch.owner.isCurrent()) throw error("Voice harness completion owner has already settled or been cancelled");
    assertAcceptedChildBindingsCurrent(batch);
    const child = batch.accepted.get(childRunId);
    if (batch.parent.runId !== requesterTurnRunId || batch.requesterSessionKey !== requesterSessionKey ||
        batch.parent.sessionId && batch.parent.sessionId !== requesterSessionId || !child || !child.legacy ||
        child.childSessionKey !== childSessionKey || child.childSessionId !== childSessionId || child.binding.isCurrent?.() === false) throw error("Voice harness completion causal identity changed");
    // More than one legacy completion is steered into one pending parent turn. A genuine
    // final is accepted only after every accepted child has reported its completion.
    (batch.completedChildren ??= new Set()).add(childRunId);
    child.binding.completed = true;
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
  const resolveOwnedControl = (target) => {
    const matching = [...owners].filter((owner) => owner.matchesControl(target));
    if (matching.length > 1) throw error("Voice cancellation owner is ambiguous");
    return matching[0];
  };
  return { createOwner, attachAcceptedChild, bindYieldBatch, resolveWake, bindHarnessSpawns, resolveHarnessCompletion, resolveOwnedControl };
}
