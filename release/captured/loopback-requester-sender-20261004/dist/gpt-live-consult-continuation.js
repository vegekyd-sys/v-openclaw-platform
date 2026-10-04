// gpt-live-consult-continuation-v1: process-local causal capabilities only
import { createHash } from "node:crypto";
import { a as loadRequesterSessionEntry } from "./subagent-announce-delivery-Dosep7Zr.js";
import { f as resolveAgentIdFromSessionKey } from "./session-key-CRjxKW0X.js";
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
      // An unfinished or unphased assistant answer is not a progress fact.
      // Native late phase reconciliation reaches onAgentEvent as a preamble;
      // final/legacy text remains available through the canonical final path.
      if (payload?.isReasoning || payload?.phase !== "commentary") return false;
      return observe("reply", payload?.text, false, payload?.itemId);
    },
    onAgentEvent: (event) => {
      const data = event?.data;
      if (event?.stream !== "item" || data?.kind !== "preamble" || data?.isReasoning || data.phase !== "update" && data.phase !== "end") return false;
      return observe(`preamble:${typeof data.itemId === "string" ? data.itemId : ""}`, data.progressText, data.phase === "end", data.itemId);
    },
    close: () => { closed = true; },
  };
}
function createGptLiveConsultContinuationRegistry(deps) {
  const byRun = new Map();
  const settledVoiceRuns = new Set();
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
    const callControl = context.callControl;
    if (callControl && (callControl.nativeDelegationId !== identity.delegationItemId ||
        callControl.delegationGeneration !== identity.delegationGeneration || !clean(callControl.originUserTurnId) ||
        !clean(callControl.userTurnText) || callControl.tool?.function?.name !== "openclaw_end_call" ||
        typeof callControl.isCurrent !== "function" || typeof callControl.accept !== "function")) {
      throw error("Voice call control lost its native source identity");
    }
    const voiceKey = JSON.stringify([context.ownerConnId, context.voiceSessionId, context.ownerGeneration]);
    const previous = byVoice.get(voiceKey);
    if (identity.delegationGeneration <= (voiceGenerations.get(voiceKey) ?? 0)) throw error("Repeated or stale voice delegation");
    // A new speech turn is not authority to cancel already accepted work.
    // Native delegations are serialized before owner creation. Reject an
    // overlapping owner without changing the old owner's generation or state.
    if (previous?.isCurrent()) throw error("Voice task is still active; queue the new delegation");
    previous?.abort(error("Voice owner became stale before the next accepted task"));
    voiceGenerations.set(voiceKey, identity.delegationGeneration);
    if (voiceGenerations.size > 1024) voiceGenerations.delete(voiceGenerations.keys().next().value);
    const controller = new AbortController();
    const lifecycleGeneration = deps.getLifecycleGeneration();
    const bindings = new Map();
    const batches = new Set();
    const cleanups = new Set();
    const pendingInputs = [];
    const consumedInputs = [];
    const acceptedActiveInputs = [];
    const activeInputReservations = [];
    let inputSequence = 0;
    let done = false;
    let cancellationNotified = false;
    let cancellationAccepted = false;
    let callControlReceipt;
    const callControlStarts = new Set();
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
      pendingInputs.length = 0;
      consumedInputs.length = 0;
      acceptedActiveInputs.length = 0;
      activeInputReservations.length = 0;
      callControlStarts.clear();
      for (const [runId, binding] of bindings) {
        if (byRun.get(runId) === binding) byRun.delete(runId);
        settledVoiceRuns.add(runId);
        if (settledVoiceRuns.size > 2048) settledVoiceRuns.delete(settledVoiceRuns.values().next().value);
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
      if (callControlReceipt) return;
      if (!isCurrent() || binding.isCurrent?.() === false) return;
      const { emittedAt, runId, source, itemId } = progress.provenance ?? {};
      const provenance = { emittedAt, sequence: ++binding.sequence, runId, source, ...(itemId ? { itemId } : {}),
        parentRunId: params.runId, ...(binding.batch ? { batchRunIds: [...binding.batch.batchRunIds], rearmGeneration: binding.batch.rearmGeneration } : {}),
        role: binding.role };
      return params.onProgress?.({ text: progress.text, kind: "commentary", provenance });
    };
    const observeCallControl = (event, binding) => {
      // Only the original parent receives this schema. A child, resumed run,
      // partial callback, assistant text or metadata-only result has no control authority.
      if (!callControl || callControlReceipt || binding.role !== "initial" || binding.runId !== params.runId ||
          binding.yielded || binding.completed || binding.controlSignal.aborted || callControl.isCurrent() !== true ||
          event.stream !== "tool" || event.data?.name !== "openclaw_end_call") return;
      const data = event.data;
      const id = data.toolCallId;
      if (typeof id !== "string" || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(id)) return;
      if (data.phase === "start") {
        if (data.args && typeof data.args === "object" && !Array.isArray(data.args) && Object.keys(data.args).length === 0) {
          if (callControlStarts.size >= 32) throw error("Voice call control tool request limit exceeded");
          callControlStarts.add(id);
        }
        return;
      }
      if (data.phase !== "result" || !callControlStarts.delete(id) || data.isError !== false ||
          data.result?.terminate !== true || data.result?.details?.status !== "pending" ||
          data.result.details.tool !== "openclaw_end_call" ||
          data.result.details.message !== "Tool execution delegated to client") return;
      assertCurrent();
      const receipt = callControl.accept({ backendRunId: binding.runId, backendToolCallId: id });
      assertCurrent();
      if (!receipt || receipt.then || receipt.source !== "backend_model_client_tool" || receipt.status !== "accepted" ||
          receipt.closeAfterPlayback !== true || receipt.backendRunId !== binding.runId || receipt.backendToolCallId !== id ||
          receipt.callId !== id || receipt.requestId !== identity.delegationItemId ||
          receipt.nativeDelegationId !== identity.delegationItemId || receipt.delegationGeneration !== identity.delegationGeneration ||
          receipt.originUserTurnId !== callControl.originUserTurnId || callControl.isCurrent() !== true) {
        throw error("Voice call control acceptance was not confirmed by its original host");
      }
      callControlReceipt = receipt;
    };
    const attachRun = ({ runId, sessionKey, sessionId, agentId, role, batch, isCurrent: check, isTerminal, taskRunId, registration }) => {
      assertCurrent();
      const existing = byRun.get(runId);
      if (existing) {
        if (existing.owner !== owner || existing.role !== role || existing.sessionKey !== sessionKey) throw error("Voice continuation run ownership conflict");
        return existing;
      }
      const binding = { owner, runId, sessionKey, sessionId, agentId, role, batch, isCurrent: check, isTerminal, taskRunId, sequence: 0,
        controlSignal: registration?.abortSignal ?? controller.signal };
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
      if (role !== "initial" || callControl) {
        const unsubscribe = deps.subscribeRun(runId, (event) => {
          if (!isCurrent()) { owner.abort(error("Voice continuation owner changed before public progress")); return; }
          if (check?.() === false || event.runId !== runId ||
              event.lifecycleGeneration && event.lifecycleGeneration !== lifecycleGeneration ||
              event.sessionKey && event.sessionKey !== sessionKey || sessionId && event.sessionId && event.sessionId !== sessionId) return;
          if (role === "initial") {
            try { observeCallControl(event, binding); } catch (failure) { owner.abort(failure); }
            return;
          }
          // The assistant stream is the public text projection. No thought/tool/error stream is accepted.
          if (event.stream === "assistant" && typeof event.data?.text === "string" && event.data.isReasoning !== true) observer.onPartialReply(event.data);
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
      if (binding.role === "initial" && callControlReceipt) {
        if (!result || !Array.isArray(result.payloads) || result?.meta?.error ||
            result?.meta?.yielded === true || callControl.isCurrent() !== true) {
          throw error("Voice call control source changed before its terminal result");
        }
        // A real client-tool termination has no final text. Keep this host
        // acceptance out of ordinary BACKEND_FINAL/BACKEND_FAILURE speech.
        settle({ callControl: callControlReceipt });
        return;
      }
      if (result?.meta?.yielded === true) {
        binding.yielded = true;
        // Only the actual public yield acknowledgment is eligible; no manufactured progress.
        const acknowledgment = clean(result.meta.yieldAcknowledgment);
        if (acknowledgment) deps.createProgressObserver({ onProgress: (progress) => report({ ...progress,
          provenance: { ...progress.provenance, source: "yield_ack" } }, binding), runId: binding.runId,
          abortSignal: controller.signal, logger: params.logger }).onPartialReply({ text: acknowledgment, phase: "commentary" });
        if (!binding.pendingBatch) throw new Error("Yielded voice consult has no causally accepted requester batch");
        return;
      }
      if (result?.meta?.error || !result || !Array.isArray(result.payloads)) throw new Error("Voice requester continuation ended without a successful final result");
      if (binding.role === "child") { binding.completed = true; return; }
      if ([...bindings.values()].some((child) => child.role === "child" && child.completed !== true && child.isTerminal?.() !== true)) {
        throw new Error("Voice requester ended before its accepted child tasks completed; no complete final is available");
      }
      if (pendingInputs.length) throw new Error("Voice requester ended before its pending user conditions reached a continuation checkpoint");
      if (activeInputReservations.length) throw new Error("Voice requester ended before its caller input acceptance was confirmed");
      const text = params.collectVisibleText(result.payloads);
      if (!text) throw new Error("Voice requester continuation returned no speakable final");
      // The voice model did not hear conditions entered through the H5 form.
      // Keep these host-owned instructions distinct from the model's result.
      // Checkpoint inputs require actual dispatch/start; active inputs require
      // the original queue's real acceptance (not proof of model consumption).
      const deliveredInputs = [...consumedInputs, ...acceptedActiveInputs].sort((a, b) => a.sequence - b.sequence);
      const callerConditions = deliveredInputs.length ? {
        ownerRunId: params.runId, sequence: deliveredInputs.at(-1).sequence,
        inputs: deliveredInputs.map(({ sequence, mode, text }) => ({ sequence, mode, text })),
      } : undefined;
      settle({ text, provenance: { runId: binding.runId, ownerRunId: params.runId,
        source: "canonical_final", role: binding.role }, ...(callerConditions ? { callerConditions } : {}) });
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
    owner.controlOwnedRun = async ({ mode, text, resolveRun, executeControl }) => {
      assertCurrent();
      if (!["status", "steer", "followup"].includes(mode)) return;
      const terminal = (binding) => binding.yielded === true || binding.completed === true || binding.isTerminal?.() === true;
      const makeTarget = (binding) => ({
        sessionKey: binding.sessionKey,
        runTarget: { runId: binding.runId, signal: binding.controlSignal,
          isCurrent: (sessionId) => isCurrent() && !binding.controlSignal.aborted && !terminal(binding) && binding.isCurrent?.() !== false &&
            (sessionId === undefined || !binding.sessionId || binding.sessionId === sessionId) },
      });
      const actualTargets = (predicate) => [...bindings.values()].filter((binding) => predicate(binding) && !terminal(binding)).flatMap((binding) => {
        const target = makeTarget(binding);
        if (!target.runTarget.isCurrent()) return [];
        const actual = resolveRun(binding.runId, binding.controlSignal);
        return actual?.sessionKey === binding.sessionKey && target.runTarget.isCurrent(actual.sessionId) ? [target] : [];
      });
      const parents = actualTargets((binding) => binding.role !== "child" && binding.sessionKey === params.sessionKey);
      if (parents.length > 1) throw error("Voice continuation active parent is ambiguous");
      const inputText = clean(text);
      const retainedInputs = [...consumedInputs, ...acceptedActiveInputs, ...pendingInputs, ...activeInputReservations];
      const canRetain = inputText && retainedInputs.length < 8 &&
        retainedInputs.reduce((bytes, input) => bytes + Buffer.byteLength(input.text, "utf8"), 0) + Buffer.byteLength(inputText, "utf8") <= 8000;
      const inputLimit = () => ({ ok: false, mode, sessionKey: params.sessionKey, active: true, queued: false,
        reason: "pending_input_limit", message: "The voice continuation could not retain that condition; please shorten it or wait for the current step.",
        speak: true, show: true, suppress: false });
      if (parents.length) {
        if (mode !== "status" && !canRetain) return inputLimit();
        const input = mode === "status" ? undefined : { sequence: ++inputSequence, mode, text: inputText, receivedAt: Date.now() };
        if (input) activeInputReservations.push(input);
        try {
          const result = await executeControl(parents[0]);
          // Queue acceptance is caller authority, not proof of model consumption.
          if (input && result?.ok === true && result.queued === true) {
            if (!isCurrent()) return { ok: false, mode, sessionKey: params.sessionKey, active: false, queued: false,
              queueAcceptedBeforeOwnerChanged: true, reason: "owner_changed",
              message: "That voice task ended or changed before its output condition could be retained. Please add the condition to the current task.",
              speak: true, show: true, suppress: false };
            acceptedActiveInputs.push(input);
          }
          return result;
        } finally {
          const index = activeInputReservations.indexOf(input);
          if (index >= 0) activeInputReservations.splice(index, 1);
        }
      }
      // Child execution is evidence of this owner's pending work, never permission
      // to send a whole-task redirect to whichever child happens to be first.
      if (mode === "status") {
        const children = actualTargets((binding) => binding.role === "child");
        if (children.length === 1) return await executeControl(children[0]);
        return { ok: true, mode, sessionKey: params.sessionKey, active: true,
          continuationPending: true, message: children.length ? `The voice task is waiting on ${children.length} owned child runs.` : "The voice task is waiting for its owned continuation.",
          speak: true, show: true, suppress: false };
      }
      const waiting = [...bindings.values()].some((binding) => binding.yielded === true && binding.pendingBatch?.owner === owner &&
        binding.pendingBatch.parent === binding && binding.isCurrent?.() !== false);
      if (!waiting) return { ok: false, mode, sessionKey: params.sessionKey, active: true, queued: false,
        reason: "not_streaming", message: "The owned voice task is not currently accepting steering.", speak: true, show: true, suppress: false };
      if (!canRetain) return inputLimit();
      pendingInputs.push({ sequence: ++inputSequence, mode, text: inputText, receivedAt: Date.now() });
      return { ok: true, mode, sessionKey: params.sessionKey, active: true, queued: true, applied: false,
        target: "owned_continuation_checkpoint", message: "That condition is retained for this voice task's next continuation checkpoint; it has not been applied yet.",
        speak: true, show: true, suppress: false };
    };
    owner._prepareResumeInput = (agentParams) => {
      assertCurrent();
      if (agentParams.sessionKey !== params.sessionKey) throw error("Voice continuation input does not own the requester message");
      const inputs = pendingInputs.map((input) => ({ ...input }));
      if (!inputs.length) return { agentParams, sequences: [] };
      if (typeof agentParams.message !== "string") throw error("Voice continuation input has no requester message to preserve");
      const message = `${agentParams.message}\n\nAdditional user conditions for this same authorized voice task (not child results).\nApply these in sequence; a later correction takes priority. Follow-up work belongs after the current step unless it changes the current task. Do not start an unrelated task.\n${inputs.map((input) => JSON.stringify(input)).join("\n")}`;
      return { agentParams: { ...agentParams, message }, sequences: inputs.map((input) => input.sequence) };
    };
    owner._consumeResumeInput = (sequences) => {
      assertCurrent();
      const consumed = new Set(sequences);
      const inputs = pendingInputs.filter((input) => consumed.has(input.sequence));
      if (!inputs.length) return;
      const steeringConsumed = { sequence: inputs.at(-1).sequence, count: inputs.length,
        textSha256: createHash("sha256").update(JSON.stringify(inputs.map((input) => input.text))).digest("hex") };
      consumedInputs.push(...inputs.map((input) => ({ ...input })));
      for (let index = pendingInputs.length - 1; index >= 0; index--) if (consumed.has(pendingInputs[index].sequence)) pendingInputs.splice(index, 1);
      return steeringConsumed;
    };
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
    owner._notifyResumeExecutionStarted = params.onResumeExecutionStarted;
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
    let preparedSequences = [];
    let preparedInput;
    let acceptedInputRunId;
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
        acceptedInputRunId = runId;
        batch.resumed = batch.owner.attachRun({ runId, sessionKey: batch.requesterSessionKey, sessionId: batch.parent.sessionId, agentId: batch.requesterAgentId,
          role: batch.parent.role === "child" ? "child" : "parent", batch,
          registration: batch.resumed ? undefined : batch.owner._registerResume?.({ runId, sessionId: batch.parent.sessionId, timeoutMs: batch.owner._timeoutMs }) });
      },
      prepareResumeInput: (agentParams) => {
        batch.owner.assertCurrent();
        assertAcceptedChildBindingsCurrent(batch);
        if (batch.parent.pendingBatch !== batch) throw error("Voice continuation input checkpoint changed");
        if (agentParams.sessionKey !== batch.requesterSessionKey) throw error("Voice continuation input does not own its batch requester message");
        if (preparedInput) {
          if (preparedInput.sessionKey !== agentParams.sessionKey || preparedInput.message !== agentParams.message) throw error("Voice continuation input changed after checkpoint snapshot");
          return preparedInput.agentParams;
        }
        // Whole-task conditions belong to the original requester. A nested
        // child's own continuation preserves its message without consuming them.
        const prepared = batch.parent.role === "child" ? { agentParams, sequences: [] } : batch.owner._prepareResumeInput(agentParams);
        preparedSequences = prepared.sequences;
        preparedInput = { sessionKey: agentParams.sessionKey, message: agentParams.message, agentParams: prepared.agentParams };
        return prepared.agentParams;
      },
      onExecutionStarted: () => {
        batch.owner.assertCurrent();
        assertAcceptedChildBindingsCurrent(batch);
        if (!acceptedInputRunId || !batch.resumed || batch.acceptedRunId !== acceptedInputRunId || acceptedInputRunId !== batch.resumed.runId || batch.parent.pendingBatch !== batch) throw error("Voice continuation input started without its accepted run");
        const steeringConsumed = batch.owner._consumeResumeInput(preparedSequences);
        preparedSequences = [];
        // This callback is diagnostic evidence of the exact accepted dispatch
        // input being consumed, never an acknowledgment that the model obeyed it.
        if (steeringConsumed) {
          try { batch.owner._notifyResumeExecutionStarted?.({ runId: acceptedInputRunId, steeringConsumed }); } catch {}
        }
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
  // Called only by the admitted host closure. An accepted child record has a
  // canonical session key but need not contain the transcript's session id.
  // Resolve that id through core's session store, never Worker request fields.
  const resolveOwnedExecSource = (source) => {
    const binding = byRun.get(source.runId);
    if (!binding) {
      if (settledVoiceRuns.has(source.runId)) throw error("Voice exec run has already settled or been cancelled");
      return;
    }
    const assertCurrent = () => {
      binding.owner.assertCurrent();
      if (byRun.get(source.runId) !== binding || binding.controlSignal.aborted || binding.isCurrent?.() === false ||
          binding.yielded === true || binding.completed === true || binding.isTerminal?.() === true) throw error("Voice exec run is no longer current");
      const canonical = deps.resolveSessionIdentity?.(binding.sessionKey);
      const sessionId = binding.sessionId ?? canonical?.sessionId;
      const agentId = binding.agentId ?? canonical?.agentId;
      if (!sessionId || !agentId || binding.sessionKey !== source.sessionKey || sessionId !== source.sessionId || agentId !== source.agentId ||
          canonical && (canonical.sessionId !== sessionId || canonical.agentId !== agentId)) throw error("Voice exec canonical source identity mismatch");
      // Pin only a trusted core-store identity after every admission check.
      binding.sessionId ??= sessionId;
      binding.agentId ??= agentId;
    };
    assertCurrent();
    return Object.freeze({ assertCurrent, signal: binding.controlSignal, ownerSignal: binding.owner.signal });
  };
  return { createOwner, attachAcceptedChild, bindYieldBatch, resolveWake, bindHarnessSpawns, resolveHarnessCompletion, resolveOwnedControl, resolveOwnedExecSource };
}
const registry = createGptLiveConsultContinuationRegistry({
 subscribeRun: onAgentEventForRun, createProgressObserver: createGptLiveConsultProgressObserver,
 resolveSessionIdentity: (sessionKey) => ({ sessionId: loadRequesterSessionEntry(sessionKey).entry?.sessionId, agentId: resolveAgentIdFromSessionKey(sessionKey) }),
 getLifecycleGeneration: getAgentEventLifecycleGeneration, isLifecycleCurrent: isAgentEventLifecycleGenerationCurrent,
 onLifecycleRotation: (callback) => registerAgentEventLifecycleRotationHandler("gpt-live-consult-continuation", callback),
});
export const { createOwner: createGptLiveConsultContinuationOwner, attachAcceptedChild: attachGptLiveConsultAcceptedChild, bindYieldBatch: bindGptLiveConsultYieldBatch, resolveWake: resolveGptLiveConsultRequesterWake, bindHarnessSpawns: bindGptLiveHarnessVoiceSpawns, resolveHarnessCompletion: resolveGptLiveHarnessVoiceCompletion, resolveOwnedControl: resolveGptLiveVoiceConsultControl, resolveOwnedExecSource: resolveGptLiveVoiceExecSource } = registry;
