import assert from 'node:assert/strict';

// Hand a turn whose tools already ran to the fallback model when DeepSeek keeps failing (V 2026-11-07).
//
// 15:00-15:54 CST DeepSeek Flash answered 500/503 for most requests. The turns that failed before any
// tool reached openai/gpt-6-luna (#375 + #543) and finished about 50 s later. The turns that had
// already run a tool did not: 5 Feishu turns ended in "⚠️ 模型服务暂时不可用 ... 这一轮没能完成" after
// 89-128 s, e.g. runId a209d427 (exec x2 settled, then six DeepSeek calls: 500, 500, 500, 200 that
// broke off, 500, 500). The user typed "继续喔" and got the same card again. #543 left this class (C)
// open: 9.1 and upstream only ever continue a side-effecting turn on the same model, because a
// fallback candidate resubmits the user's request and could repeat the tools.
//
// pi-settled-tool-handoff-v1 keeps that guarantee and still moves on: the fallback model does not get
// the user's request again, it starts from the saved transcript with 9.1's own continuation prompt
// (MID_TURN_PRECHECK_CONTINUATION_PROMPT, the one used after a settled-tool overflow or transport
// drop), so the persisted tool results are its input and nothing is replayed.
//
//   embedded-agent  attempt-recovery
//                   (a) Where 5xx/overloaded/429 arrives silently after a settled tool batch (#375's
//                       continuation), allow ONE same-model continuation per runId when a fallback is
//                       pending (isFinalFallbackAttempt === false); the next such failure throws a
//                       FailoverError and records the runId as a pending hand-off. On the Gateway over
//                       the Worker that one continuation already happened inside the Worker's run
//                       (candidate A: Worker continues once, then the Gateway once more), so the
//                       Gateway hands over on its first detection. The count is per
//                       runId, not per run: on V the Worker re-entered the run and printed
//                       "attempt=1/3" twice for one turn. Without a fallback (user-selected model, or
//                       already the last candidate) nothing changes: up to 3 continuations as today.
//                   (b) On the Gateway, a Worker harness failure that the Worker marked as such a
//                       hand-off (attempt.vSettledContinuation) is rethrown for the fallback runner
//                       instead of being surfaced as an incomplete turn.
//                   session prompt state
//                   (c) A run whose runId the fallback runner marked as continuing starts with the
//                       internal continuation prompt (model-only, not written to the transcript).
//   model-fallback-runner
//                   (d) A candidate failure with a pending hand-off skips canFallbackAfterError (text
//                       already shown stays; the next model continues after it) and marks the runId so
//                       the next candidate's run starts as (c).
//   worker          (e) worker.mjs: the response error carries vSettledContinuation when the Worker's run
//                       recorded a hand-off for this runId; worker-pool.mjs keeps it across IPC;
//                       index.mjs/harness-failure.mjs put it on the harness attempt, and such a failure
//                       is never reported replay-safe (the #375 transcript read once called a turn with
//                       two settled exec calls replay-safe; the Gateway's own side-effect tracking
//                       overruled it, but a hand-off must never take the replay path).
//
// The registry is process-global (Symbol.for), entries expire after 30 minutes, and every path that does
// not involve a settled-tool 5xx with a pending fallback is byte-for-byte the old behaviour.

export const MARKER = 'pi-settled-tool-handoff-v1';
const REGISTRY = `globalThis[Symbol.for("openclaw.v.settledToolHandoff")] ??= { pending: new Map(), continuing: new Map(), continuations: new Map() }`;

export function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function insertBeforeUniqueLine(source, linePrefix, text, label) {
  const lines = source.split('\n');
  const hits = lines.flatMap((line, i) => (line.startsWith(linePrefix) ? [i] : []));
  assert.equal(hits.length, 1, `Expected exactly one ${label}`);
  lines.splice(hits[0], 0, ...text.replace(/\n$/u, '').split('\n'));
  return lines.join('\n');
}

function guard(source) {
  assert(!source.includes(MARKER), 'already patched');
}

// core/dist/embedded-agent-DaSvA-Yk.js (Gateway and Worker load the same file)
export function patchEmbeddedAgent(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    `const PROVIDER_ERROR_CONTINUATION_REASONS = new Set(["server_error", "overloaded", "rate_limit"]);\n`,
    `const PROVIDER_ERROR_CONTINUATION_REASONS = new Set(["server_error", "overloaded", "rate_limit"]);
// ${MARKER}: runIds whose settled transcript goes to the fallback model (see lab/patch-settled-tool-handoff.mjs)
const V_SETTLED_HANDOFF = ${REGISTRY};
function vSettledHandoffSweep(now = Date.now()) {
	for (const map of [V_SETTLED_HANDOFF.pending, V_SETTLED_HANDOFF.continuing, V_SETTLED_HANDOFF.continuations]) for (const [key, value] of map) if (now - (value?.at ?? 0) > 18e5) map.delete(key);
}
// A settled-tool provider error may continue once on the same model while a fallback is pending; the next
// one hands the transcript over. A transport-owning harness (the Worker) has already made that one
// continuation inside its own run, so the Gateway hands over at once. Returns the error to throw, or
// undefined to continue as before.
function vSettledHandoffError(params, reason, assistant, provider, modelId, harnessRetried) {
	if (params.isFinalFallbackAttempt !== false || !params.runId) return void 0;
	vSettledHandoffSweep();
	const used = V_SETTLED_HANDOFF.continuations.get(params.runId)?.count ?? 0;
	if (used < (harnessRetried ? 0 : 1)) {
		V_SETTLED_HANDOFF.continuations.set(params.runId, { at: Date.now(), count: used + 1 });
		return void 0;
	}
	V_SETTLED_HANDOFF.continuations.delete(params.runId);
	V_SETTLED_HANDOFF.pending.set(params.runId, { at: Date.now(), reason, from: \`\${provider}/\${modelId}\` });
	const rawError = assistant?.errorMessage?.trim() || reason;
	const error = new FailoverError(rawError, { reason, provider, model: modelId, status: resolveFailoverStatus(reason), rawError });
	error.vSettledContinuation = true;
	return error;
}
`,
    'provider error continuation reasons');
  // (b) Gateway: a Worker harness failure marked as a hand-off goes to the fallback runner.
  // The gate line also carries #380's !vSettledToolOverflow when that release is underneath; anchor on its prefix.
  out = insertBeforeUniqueLine(out,
    `	if (!currentAttemptReplaySafe && !canContinueSettledMidTurnOverflow && !settledTransportDropAssistant && !vProviderErrorReason`,
    `	// ${MARKER}: the same-model continuation this runId already got failed silently again. The continuation
	// attempt itself has no tool calls, so the settled-batch evidence above cannot see it (candidate: the Worker's
	// second 500 went back to the Gateway on chat.send, and on agentCommand was surfaced as an incomplete turn).
	const vContinuationErrorReason = !vProviderErrorReason && !settledTransportDropAssistant && !currentAttemptReplaySafe && !promptError && !aborted && !timedOut && !terminalInterrupted && sessionPromptState.activePrompt.internal === true && params.runId && V_SETTLED_HANDOFF.continuations.has(params.runId) ? resolveSilentProviderErrorReason(currentAttemptAssistant) : null;
	const vContinuationHandoff = vContinuationErrorReason ? vSettledHandoffError(params, vContinuationErrorReason, currentAttemptAssistant, preparedRuntime.provider, preparedRuntime.modelId, true) : void 0;
	if (vContinuationHandoff) {
		log$3.warn(\`[${MARKER}] \${vContinuationErrorReason} on the same-model continuation; handing the transcript to the fallback model provider=\${preparedRuntime.provider} model=\${preparedRuntime.modelId} runId=\${params.runId} sessionId=\${params.sessionId}\`);
		throw vContinuationHandoff;
	}
	if (attempt.vSettledContinuation === true && promptError && !currentAttemptReplaySafe && !aborted && !terminalInterrupted && params.isFinalFallbackAttempt === false && params.runId) {
		vSettledHandoffSweep();
		V_SETTLED_HANDOFF.pending.set(params.runId, { at: Date.now(), reason: promptError.failoverReason ?? promptError.reason ?? "server_error", from: \`\${preparedRuntime.provider}/\${preparedRuntime.modelId}\` });
		log$3.warn(\`[${MARKER}] harness failed after a settled tool batch; handing the transcript to the fallback model provider=\${preparedRuntime.provider} model=\${preparedRuntime.modelId} runId=\${params.runId} sessionId=\${params.sessionId}\`); // ${MARKER}
		throw promptError;
	}
`,
    'replay-unsafe proceed gate');
  // (a) one same-model continuation, then hand over.
  out = replaceExactlyOnce(out,
    `	if (vProviderErrorReason && (recoveryState.vProviderErrorContinuations ?? 0) < MAX_PROVIDER_ERROR_CONTINUATIONS) {\n`,
    `	const vHandoffError = vProviderErrorReason ? vSettledHandoffError(params, vProviderErrorReason, currentAttemptAssistant, preparedRuntime.provider, preparedRuntime.modelId, runtime.pluginHarnessOwnsTransport === true) : void 0; // ${MARKER}
	if (vHandoffError) {
		log$3.warn(\`[${MARKER}] \${vProviderErrorReason} again after a settled tool batch; handing the transcript to the fallback model provider=\${preparedRuntime.provider} model=\${preparedRuntime.modelId} runId=\${params.runId} sessionId=\${params.sessionId}\`);
		throw vHandoffError;
	}
	if (vProviderErrorReason && (recoveryState.vProviderErrorContinuations ?? 0) < MAX_PROVIDER_ERROR_CONTINUATIONS) {\n`,
    'provider error continuation');
  // (c) the next candidate's run starts from the transcript.
  out = replaceExactlyOnce(out,
    `	let suppressNextUserMessagePersistence = params.suppressNextUserMessagePersistence ?? false;
	let activePrompt = {
		persisted: suppressNextUserMessagePersistence,
		internal: false
	};\n`,
    `	let suppressNextUserMessagePersistence = params.suppressNextUserMessagePersistence ?? false;
	let activePrompt = {
		persisted: suppressNextUserMessagePersistence,
		internal: false
	};
	// ${MARKER}: the previous model failed after this turn's tools settled; continue the saved transcript
	const vSettledHandoff = params.runId ? V_SETTLED_HANDOFF.continuing.get(params.runId) : void 0;
	if (vSettledHandoff) {
		V_SETTLED_HANDOFF.continuing.delete(params.runId);
		suppressNextUserMessagePersistence = true;
		activePrompt = { override: MID_TURN_PRECHECK_CONTINUATION_PROMPT, persisted: true, internal: true };
		log$3.warn(\`[${MARKER}] continuing the transcript on \${params.provider ?? "-"}/\${params.model ?? params.modelId ?? "-"} after \${vSettledHandoff.from} failed (\${vSettledHandoff.reason}) runId=\${params.runId} sessionId=\${params.sessionId}\`);
	}\n`,
    'session prompt state init');
  return out;
}

// core/dist/model-fallback-runner-DOsPfj4O.js
export function patchFallbackRunner(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    `		const err = attemptRun.error;\n		if (isAgentHarnessPreflightError(err)) {\n`,
    `		const err = attemptRun.error;
		// ${MARKER}: this candidate failed after the turn's tools settled; the next one continues the transcript
		const vSettledHandoffState = ${REGISTRY};
		const vSettledHandoff = params.runId ? vSettledHandoffState.pending.get(params.runId) : void 0;
		if (vSettledHandoff && hasRemainingCandidate) {
			vSettledHandoffState.pending.delete(params.runId);
			vSettledHandoffState.continuing.set(params.runId, { ...vSettledHandoff, at: Date.now() });
			log.warn(\`[${MARKER}] \${sanitizeForLog(candidate.provider)}/\${sanitizeForLog(candidate.model)} failed after settled tools (\${vSettledHandoff.reason}); next candidate continues the transcript runId=\${params.runId}\`);
		}
		if (isAgentHarnessPreflightError(err)) {\n`,
    'candidate error');
  out = replaceExactlyOnce(out,
    `		if (!attemptRun.classifiedResult && params.canFallbackAfterError && !await params.canFallbackAfterError({`,
    `		if (!(vSettledHandoff && hasRemainingCandidate) && !attemptRun.classifiedResult && params.canFallbackAfterError && !await params.canFallbackAfterError({`,
    'canFallbackAfterError gate');
  return out;
}

// worker/worker.mjs (Worker process)
export function patchWorker(source) {
  guard(source);
  return replaceExactlyOnce(source,
    `    ocFirsttextWorkerMark("worker-response-error", message.runId, {requestId:message.id});
    process.send?.({
      type: "response",
      id: message.id,
      ok: false,
      error: serializeError(error),\n`,
    `    ocFirsttextWorkerMark("worker-response-error", message.runId, {requestId:message.id});
    // ${MARKER}: the run handed its settled transcript to the fallback model; tell the Gateway
    const vSettledHandoffState = ${REGISTRY};
    const vSettledHandoff = typeof message.runId === "string" && vSettledHandoffState.pending.delete(message.runId);
    process.send?.({
      type: "response",
      id: message.id,
      ok: false,
      error: { ...serializeError(error), ...(vSettledHandoff ? { vSettledContinuation: true } : {}) },\n`,
    'worker response error');
}

// worker/worker-pool.mjs (Gateway process)
export function patchWorkerPool(source) {
  guard(source);
  return replaceExactlyOnce(source,
    `      if (typeof message.error?.failoverReason === "string") error.failoverReason = message.error.failoverReason;\n`,
    `      if (typeof message.error?.failoverReason === "string") error.failoverReason = message.error.failoverReason;
      if (message.error?.vSettledContinuation === true) error.vSettledContinuation = true; // ${MARKER}\n`,
    'worker pool error identity');
}

// worker/index.mjs (Gateway process)
export function patchWorkerIndex(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    `          api.logger.warn(\`[upstream-5xx-fallback-v1] worker provider failure runId=\${String(params.runId)} status=\${providerStatus ?? "-"} reason=\${error?.failoverReason ?? "-"} replaySafe=\${providerFailureWithoutTools}\`);\n`,
    `          // ${MARKER}: a hand-off after settled tools is never replay-safe, whatever the transcript read said
          if (error?.vSettledContinuation === true) providerFailureWithoutTools = false;
          api.logger.warn(\`[upstream-5xx-fallback-v1] worker provider failure runId=\${String(params.runId)} status=\${providerStatus ?? "-"} reason=\${error?.failoverReason ?? "-"} replaySafe=\${providerFailureWithoutTools}\${error?.vSettledContinuation === true ? " settledHandoff=true" : ""}\`);\n`,
    'worker provider failure log');
  out = replaceExactlyOnce(out,
    `          providerFailureWithoutTools,\n        });\n`,
    `          providerFailureWithoutTools,
          settledContinuation: error?.vSettledContinuation === true, // ${MARKER}
        });\n`,
    'harness failure attempt');
  return out;
}

// worker/harness-failure.mjs (Gateway process)
export function patchHarnessFailure(source) {
  guard(source);
  return replaceExactlyOnce(source,
    `    // upstream-5xx-fallback-v1: replay-safe only when the caller proved the turn ran no tool
    replayMetadata: params.providerFailureWithoutTools === true\n`,
    `    // ${MARKER}: the Worker handed this turn's settled transcript to the fallback model
    ...(params.settledContinuation === true ? { vSettledContinuation: true } : {}),
    // upstream-5xx-fallback-v1: replay-safe only when the caller proved the turn ran no tool
    replayMetadata: params.providerFailureWithoutTools === true && params.settledContinuation !== true\n`,
    'harness failure replay metadata');
}

// base = directory in the V runtime layout (core/dist, worker); target = release layout.
export const FILES = [
  { name: 'embedded-agent-DaSvA-Yk.js', base: 'core/dist', target: 'openclaw/dist', before: '21df02d95ba86c931d5a89a3be390695ab2482d955d00ec67c2733357be34871', patch: patchEmbeddedAgent },
  { name: 'model-fallback-runner-DOsPfj4O.js', base: 'core/dist', target: 'openclaw/dist', before: '3fd62e0856271064bcd7a913c62b29b398972da125e311dcfaf43fff62c14278', patch: patchFallbackRunner },
  { name: 'worker.mjs', base: 'worker', target: 'production-worker', before: '198bd1f5c254802f8112df4203a61c18ca98a6a9f23b03cb1c8493d10ec82fde', patch: patchWorker },
  { name: 'worker-pool.mjs', base: 'worker', target: 'production-worker', before: 'f6ca5d76214d77dda922327dac6bbc804cff99247e924ca4c10efd61b69bb18e', patch: patchWorkerPool },
  { name: 'index.mjs', base: 'worker', target: 'production-worker', before: '1bf070dc80a0ac091679aba565133e85e6c2590d929af7e7c866f9096ab7cb2c', patch: patchWorkerIndex },
  { name: 'harness-failure.mjs', base: 'worker', target: 'production-worker', before: '89419679ae076530c9935b4ad9f9986d4400c767e9c2917ca8a02ba24eb0c660', patch: patchHarnessFailure },
];
