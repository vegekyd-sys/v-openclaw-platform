import assert from 'node:assert/strict';

// Upstream 5xx/429 reach the configured fallback model (2026-10-15).
//
// V runs deepseek/deepseek-flash with fallbacks [xai/grok-4.6]. When DeepSeek answers
// "503 Service is too busy. We advise users to temporarily switch to alternative LLM API service
// providers." the fallback never ran: 2026-10-15 09:19 a user saw the first sentence of a reply and
// then an English "request failed (provider internal error, HTTP 503)" line. Candidate on V's bytes
// (candidate-9fba87ba): 503, 429 and 500 all end in an English error after 8-10 s, four DeepSeek
// requests, zero Grok requests.
//
// Patches, each against V's live bytes:
//
// 1. classify-*.js — back-port of upstream 776f76b4b87 (#141843, v2026.9.6): an HTTP 5xx the
//    provider answered is a server_error, not a timeout; only 499/504/522/524 stay timeout. 9.1
//    called a bare 503/500/502 "timeout", and with the vlab-worker harness owning the transport a
//    timeout neither rotates nor falls back (shouldRotateAssistant) and never counts as a provider
//    error payload for result fallback (classifyProviderErrorPayloadReason). The CDN HTML branch
//    goes through the same status rules, as upstream.
export const MARKER = 'upstream-5xx-fallback-v1';

export function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

// dist/classify-*.js
export function patchClassify(source) {
  assert(!source.includes(MARKER), 'already patched');
  let out = replaceExactlyOnce(source,
    `	if (status === 503 || status === 499) {
		if (messageReason === "overloaded") return messageClassification;
		return toReasonClassification("timeout");
	}
	if (status === 500 || status === 502 || status === 504) {
		if (messageReason === "server_error") return messageClassification;
		return toReasonClassification("timeout");
	}`,
    `	// ${MARKER}: upstream 776f76b4b87 (v2026.9.6) — an answered HTTP 5xx is a server_error;
	// only the timing statuses (499, 504) stay timeout.
	if (status === 503 || status === 499) {
		if (messageReason === "overloaded") return messageClassification;
		return toReasonClassification(status === 499 ? "timeout" : "server_error");
	}
	if (status === 500 || status === 502 || status === 504) {
		if (messageReason === "server_error") return messageClassification;
		return toReasonClassification(status === 504 ? "timeout" : "server_error");
	}`,
    'HTTP 5xx status classification');
  out = replaceExactlyOnce(out,
    `	if (!providerPluginReason && signal.message && isTransportHtmlErrorStatus(inferredStatus) && isHtmlErrorResponse(signal.message, inferredStatus)) return toReasonClassification("timeout");`,
    `	if (!providerPluginReason && signal.message && isTransportHtmlErrorStatus(inferredStatus) && isHtmlErrorResponse(signal.message, inferredStatus)) return classifyFailoverClassificationFromHttpStatus(inferredStatus, void 0, null, signal.status, signal.provider) ?? toReasonClassification("timeout"); // ${MARKER}`,
    'CDN HTML status classification');
  return out;
}

// dist/embedded-agent-*.js
//
// 2. Same-model retries before a fallback: at most one. A run whose fallback chain still has a
//    candidate (isFinalFallbackAttempt === false) stops transient same-model retries (429/5xx and
//    timeouts) after the first; the vlab-worker's inner run gets that flag from patch 4. Without a
//    pending fallback 9.1's budget of 3 is unchanged. And when a harness owns the transport
//    (vlab-worker) and a fallback is configured, the Gateway's prompt stage does not retry the same
//    model again on top of the harness's own retry; it goes straight to rotate/fallback.
//
// 3. 5xx/429 after a settled tool batch: continue from the transcript on the same model instead of
//    surfacing the error. Back-port of the idea in upstream a9e9dec42df (#139397, v2026.9.3, "never
//    resubmit the original user request"), shaped like 9.1's own transport-drop continuation: the
//    failed request produced nothing, tools already ran, so the next attempt only continues the
//    saved transcript. Up to 3 continuations with the transient backoff (1 s base, jitter).
//    Upstream deliberately never switches models here (a replay could repeat side effects), and
//    neither do we. Timeouts are left alone.
export function patchEmbeddedAgent(source) {
  assert(!source.includes(MARKER), 'already patched');
  let out = replaceExactlyOnce(source,
    `			if (transientRetryCount >= transientRetryBudget) return false;\n`,
    `			if (transientRetryCount >= transientRetryBudget) return false;
			// ${MARKER}: one quick same-model retry while a fallback model is still pending
			if (params.isFinalFallbackAttempt === false && transientRetryCount >= 1) {
				log$3.warn(\`[\${"${MARKER}"}] \${retry.reason}: same-model retry already used for \${sanitizeForLog(provider)}/\${sanitizeForLog(modelId)}; leaving it to the fallback model\`);
				return false;
			}\n`,
    'transient retry cap');
  out = replaceExactlyOnce(out,
    `	const canRetryRateLimit = promptFailoverReason !== "rate_limit" || isShortWindowRateLimitMessage(errorText);
	if (!input.externalAbort && canRetryRateLimit && promptFailoverReason && (failoverDecision.action === "rotate_profile"`,
    `	const canRetryRateLimit = promptFailoverReason !== "rate_limit" || isShortWindowRateLimitMessage(errorText);
	// ${MARKER}: the harness that owns the transport already retried this model; with a fallback configured, move on
	const vHarnessAlreadyRetried = Boolean(input.pluginHarnessOwnsTransport && input.fallbackConfigured && input.promptErrorSource === "prompt" && (promptFailoverReason === "server_error" || promptFailoverReason === "overloaded" || promptFailoverReason === "rate_limit" || promptFailoverReason === "timeout"));
	if (!input.externalAbort && !vHarnessAlreadyRetried && canRetryRateLimit && promptFailoverReason && (failoverDecision.action === "rotate_profile"`,
    'prompt-stage transient retry');
  out = replaceExactlyOnce(out,
    `const MAX_TRANSPORT_DROP_CONTINUATIONS = 2;\n`,
    `const MAX_TRANSPORT_DROP_CONTINUATIONS = 2;
// ${MARKER}: a 5xx/429 that produced nothing after a settled tool batch continues the transcript
const MAX_PROVIDER_ERROR_CONTINUATIONS = 3;
const PROVIDER_ERROR_CONTINUATION_REASONS = new Set(["server_error", "overloaded", "rate_limit"]);
function resolveSilentProviderErrorReason(assistant) {
	if (!assistant || assistant.stopReason !== "error" || !isRetryableAssistantError(assistant)) return null;
	const reason = classifyFailoverReason(assistant.errorMessage?.trim() ?? "", { provider: assistant.provider });
	if (!PROVIDER_ERROR_CONTINUATION_REASONS.has(reason)) return null;
	return (Array.isArray(assistant.content) ? assistant.content : []).length === 0 || hasOnlyAssistantReasoningContent(assistant) ? reason : null;
}\n`,
    'transport drop continuation limit');
  out = replaceExactlyOnce(out,
    `	const currentAttemptReplaySafe = isCurrentAttemptReplaySafe(attempt);
	const settledEvidence = resolveSettledToolBatchEvidence(attempt);`,
    `	// ${MARKER}: once this run continued a transcript after side effects, no later attempt of it is
	// replay-safe: a fallback model would resubmit the user's request and could repeat those effects.
	if ((input.contextRecoveryState.vProviderErrorContinuations ?? 0) > 0) {
		attempt.currentAttemptReplayMetadata = { hadPotentialSideEffects: true, replaySafe: false };
		attempt.replayMetadata = { ...attempt.replayMetadata, hadPotentialSideEffects: true, replaySafe: false };
	}
	const currentAttemptReplaySafe = isCurrentAttemptReplaySafe(attempt);
	const settledEvidence = resolveSettledToolBatchEvidence(attempt);`,
    'replay safety after a provider error continuation');
  out = replaceExactlyOnce(out,
    `	const { signalOwnedInterruption } = terminalState;
	const assistantOverflowCandidate =`,
    `	const vProviderErrorReason = !settledTransportDropAssistant && !currentAttemptReplaySafe && !promptError && !aborted && !timedOut && !terminalInterrupted && !hasNonToolTerminalState(attempt) && !settledEvidence.hasUnsettledToolError && transportBatchSettled ? resolveSilentProviderErrorReason(currentAttemptAssistant) : null; // ${MARKER}
	const { signalOwnedInterruption } = terminalState;
	const assistantOverflowCandidate =`,
    'provider error continuation candidate');
  out = replaceExactlyOnce(out,
    `	if (!currentAttemptReplaySafe && !canContinueSettledMidTurnOverflow && !settledTransportDropAssistant) return { action: "proceed" };`,
    `	if (!currentAttemptReplaySafe && !canContinueSettledMidTurnOverflow && !settledTransportDropAssistant && !vProviderErrorReason) return { action: "proceed" };`,
    'replay-unsafe proceed gate');
  out = replaceExactlyOnce(out,
    `		return retry();
	}
	if (!currentAttemptReplaySafe) return { action: "proceed" };`,
    `		return retry();
	}
	if (vProviderErrorReason && (recoveryState.vProviderErrorContinuations ?? 0) < MAX_PROVIDER_ERROR_CONTINUATIONS) {
		runInput.laneController.throwIfAborted();
		recoveryState.vProviderErrorContinuations = (recoveryState.vProviderErrorContinuations ?? 0) + 1;
		const delayMs = resolveTransientRetryDelayMs({
			retryNumber: recoveryState.vProviderErrorContinuations,
			retryAfterMs: resolveRetryAfterMs(currentAttemptAssistant?.errorMessage),
			elapsedMs: 0
		}) ?? 1e3;
		log$3.warn(\`[\${"${MARKER}"}] \${vProviderErrorReason} after a settled tool batch; continuing from the transcript attempt=\${recoveryState.vProviderErrorContinuations}/\${MAX_PROVIDER_ERROR_CONTINUATIONS} delayMs=\${delayMs} provider=\${preparedRuntime.provider} model=\${preparedRuntime.modelId} runId=\${params.runId} sessionId=\${params.sessionId}\`);
		await sleepWithAbort(delayMs, params.abortSignal);
		runInput.laneController.throwIfAborted();
		sessionPromptState.markOwnedTranscriptRetry();
		sessionPromptState.continueFromCurrentTranscript({ includeToolFailureInstruction: settledEvidence.failedToolNames.size > 0 });
		return retry({ lastRetryFailoverReason: vProviderErrorReason });
	}
	if (!currentAttemptReplaySafe) return { action: "proceed" };`,
    'provider error continuation');
  return out;
}

// dist/agent-command-*.js
//
// 4. The vlab-worker runs the whole turn through agentCommand, whose own fallback runner has one
//    candidate (the model the Gateway picked) and so always says isFinalFallbackAttempt=true. The
//    Gateway forwards its real value (FORWARDED_HARNESS_OPTIONS.isFinalFallbackAttempt); keep a
//    false so the inner run knows a fallback model is waiting and retries only once (patch 2).
export function patchAgentCommand(source) {
  assert(!source.includes(MARKER), 'already patched');
  return replaceExactlyOnce(source,
    `						isFinalFallbackAttempt: runOptions?.isFinalFallbackAttempt,\n`,
    `						isFinalFallbackAttempt: params.opts?.isFinalFallbackAttempt === false ? false : runOptions?.isFinalFallbackAttempt, // ${MARKER}\n`,
    'agentCommand isFinalFallbackAttempt');
}

// dist/embedded-agent-helpers-*.js
//
// 5. What the user reads when it still fails (fallback also failed, or 5xx after tools and three
//    continuations): Chinese, says the turn did not finish and how to resume, instead of
//    "⚠️ deepseek/deepseek-flash request failed (provider internal error, HTTP 503). This is
//    usually temporary — try again shortly." appended under half a reply.
export const TRANSIENT_FAILURE_TEXT = '这一轮没能完成。请稍后再试，或直接回复「继续」，我会从中断的地方接着做。';
export function patchFailureCopy(source) {
  assert(!source.includes(MARKER), 'already patched');
  return replaceExactlyOnce(source,
    `	if (normalizedReason === "overloaded" || normalizedReason === "server_error" || normalizedReason === "timeout" || normalizedReason === "rate_limit") return \`\${summary} This is usually temporary — try again shortly.\`;`,
    `	// ${MARKER}: V's users read Chinese; say the turn stopped and how to resume
	if (normalizedReason === "overloaded" || normalizedReason === "server_error" || normalizedReason === "timeout" || normalizedReason === "rate_limit") return \`⚠️ 模型服务暂时不可用（\${[target, { overloaded: "服务繁忙", server_error: "服务端出错", timeout: "请求超时", rate_limit: "请求过于频繁" }[normalizedReason], status].filter(Boolean).join("，")}）。${TRANSIENT_FAILURE_TEXT}\`;`,
    'transient request failure copy');
}

// production-worker (vlab-worker plugin)
//
// 6. On the worker runtime the turn runs inside the worker, whose own fallback runner has only the
//    model the Gateway picked. When DeepSeek keeps failing the worker throws, and the Gateway
//    turns that into an attempt marked "not replay-safe, may have side effects" with only the
//    error text. So the Gateway's fallback (deepseek -> grok) never ran, not even for a 429.
//    - worker.mjs / worker-pool.mjs: the provider failure keeps status/provider/model across IPC,
//      so the Gateway classifies it like any provider error (5xx -> server_error with patch 1).
//    - index.mjs / harness-failure.mjs: if the failure is a provider failure the worker's run
//      classified (server_error/overloaded/rate_limit/timeout; or HTTP 429/5xx) and this turn's
//      transcript (messages written since the Gateway handed the attempt over) holds no tool call
//      or tool result, the failed attempt is replay-safe: nothing ran that a fallback model could
//      repeat. Anything else keeps today's conservative "not replay-safe".
export function patchWorkerSerializeError(source) {
  assert(!source.includes(MARKER), 'already patched');
  return replaceExactlyOnce(source,
    `function serializeError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    name: error instanceof Error ? error.name : undefined,
    code:
      error && typeof error === "object" && "code" in error
        ? error.code
        : undefined,
  };
}`,
    `function serializeError(error) {
  // ${MARKER}: a provider failure keeps its identity (status, provider, model, reason) across IPC
  const failover =
    error && typeof error === "object"
      ? {
          status: Number.isInteger(error.status) ? error.status : undefined,
          provider: typeof error.provider === "string" ? error.provider : undefined,
          model: typeof error.model === "string" ? error.model : undefined,
          failoverReason: error.name === "FailoverError" && typeof error.reason === "string" ? error.reason : undefined,
        }
      : {};
  return {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    name: error instanceof Error ? error.name : undefined,
    code:
      error && typeof error === "object" && "code" in error
        ? error.code
        : undefined,
    ...failover,
  };
}`,
    'worker serializeError');
}

export function patchWorkerPool(source) {
  assert(!source.includes(MARKER), 'already patched');
  return replaceExactlyOnce(source,
    `      if (message.error?.code) {
        error.code = message.error.code;
      }
      active.reject(error);`,
    `      if (message.error?.code) {
        error.code = message.error.code;
      }
      // ${MARKER}: provider failure identity from the worker
      if (Number.isInteger(message.error?.status)) error.status = message.error.status;
      if (typeof message.error?.provider === "string") error.provider = message.error.provider;
      if (typeof message.error?.model === "string") error.model = message.error.model;
      if (typeof message.error?.failoverReason === "string") error.failoverReason = message.error.failoverReason;
      active.reject(error);`,
    'worker pool error reconstruction');
}

export function patchHarnessFailure(source) {
  assert(!source.includes(MARKER), 'already patched');
  const out = replaceExactlyOnce(source,
    `    timedOut: !compactionFailure && isTimeoutFailure(promptError),`,
    `    // ${MARKER}: a model timeout the worker already retried is a prompt failure for the Gateway's
    // fallback rules (promptTimeoutFallbackSafe), not a timeout of this Gateway attempt
    timedOut: !compactionFailure && params.providerFailureWithoutTools !== true && isTimeoutFailure(promptError),`,
    'harness failure timeout flag');
  return replaceExactlyOnce(out,
    `    replayMetadata: {
      // The worker may have completed tools before the terminal failure. Never
      // replay an opaque failed attempt merely because its IPC call rejected.
      hadPotentialSideEffects: true,
      replaySafe: false,
    },`,
    `    // ${MARKER}: replay-safe only when the caller proved the turn ran no tool
    replayMetadata: params.providerFailureWithoutTools === true
      ? { hadPotentialSideEffects: false, replaySafe: true }
      : {
      // The worker may have completed tools before the terminal failure. Never
      // replay an opaque failed attempt merely because its IPC call rejected.
      hadPotentialSideEffects: true,
      replaySafe: false,
    },`,
    'harness failure replay metadata');
}

export function patchWorkerIndex(source) {
  assert(!source.includes(MARKER), 'already patched');
  return replaceExactlyOnce(source,
    `        return buildHarnessFailureAttempt(error, {
          ...params,
          sessionId: finalSession.sessionId,
          sessionFile: finalSession.sessionFile,
        });`,
    `        // ${MARKER}: a provider failure (429/5xx, or a model timeout the worker's run classified) on a
        // turn that wrote no tool call or tool result since this attempt began can go to the fallback model.
        let providerFailureWithoutTools = false;
        const providerStatus = Number.isInteger(error?.status) ? error.status : undefined;
        const providerReason = typeof error?.failoverReason === "string" ? error.failoverReason : undefined;
        const answeredProviderFailure = providerReason
          ? ["server_error", "overloaded", "rate_limit", "timeout"].includes(providerReason)
          : providerStatus === 429 || (providerStatus >= 500 && providerStatus < 600);
        if (answeredProviderFailure) {
          try {
            const turnMessages = (await readNativeSessionMessages({
              agentId: params.agentId ?? "makaron", sessionKey, sessionId: finalSession.sessionId,
            }, { attemptStartedAt: harnessAttemptStartedAt })).filter((message) => {
              const time = typeof message?.timestamp === "number" ? message.timestamp : Date.parse(message?.timestamp);
              return Number.isFinite(time) && time >= harnessAttemptStartedAt;
            });
            providerFailureWithoutTools = !turnMessages.some((message) =>
              message?.role === "toolResult" || message?.role === "tool_result" ||
              (message?.role === "assistant" && Array.isArray(message.content) &&
                message.content.some((block) => block?.type === "toolCall" || block?.type === "tool_use")));
          } catch (readError) {
            api.logger.warn(\`[${MARKER}] could not read the failed turn for runId=\${String(params.runId)}; keeping it not replay-safe: \${readError instanceof Error ? readError.message : String(readError)}\`);
          }
          api.logger.warn(\`[${MARKER}] worker provider failure runId=\${String(params.runId)} status=\${providerStatus ?? "-"} reason=\${error?.failoverReason ?? "-"} replaySafe=\${providerFailureWithoutTools}\`);
        }
        return buildHarnessFailureAttempt(error, {
          ...params,
          sessionId: finalSession.sessionId,
          sessionFile: finalSession.sessionFile,
          providerFailureWithoutTools,
        });`,
    'worker harness failure');
}

// dist/builtin-openclaw-*.js
//
// 7. The incomplete-turn text the user reads when a turn stops after tools ran (and the generic
//    one), in Chinese like the "length" line V already carries in the same function.
export const INCOMPLETE_AFTER_TOOLS_TEXT = '⚠️ 这一轮没能完成：模型服务中途出错，部分操作可能已经执行。请先核对结果；需要继续时直接回复「继续」，我会从中断处接着做。';
export const INCOMPLETE_TEXT = '⚠️ 这一轮没能生成回复。请稍后再试，或直接回复「继续」。';
export function patchIncompleteTurnText(source) {
  assert(!source.includes(MARKER), 'already patched');
  let out = replaceExactlyOnce(source,
    `	if (params.hadPotentialSideEffects || params.attempt.replayMetadata.hadPotentialSideEffects) return "⚠️ Agent couldn't generate a response. Note: some tool actions may have already been executed — please verify before retrying.";`,
    `	if (params.hadPotentialSideEffects || params.attempt.replayMetadata.hadPotentialSideEffects) return ${JSON.stringify(INCOMPLETE_AFTER_TOOLS_TEXT)}; // ${MARKER}`,
    'incomplete turn after side effects');
  out = replaceExactlyOnce(out,
    `	return "⚠️ Agent couldn't generate a response. Please try again.";
}
/**
* Allows one retry when the provider returned no assistant turn at all`,
    `	return ${JSON.stringify(INCOMPLETE_TEXT)}; // ${MARKER}
}
/**
* Allows one retry when the provider returned no assistant turn at all`,
    'incomplete turn generic text');
  return out;
}
