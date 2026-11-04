import assert from 'node:assert/strict';

// Let the fallback model take over when DeepSeek fails before a turn ran any tool (V 2026-11-03).
//
// 16:53-17:47 CST DeepSeek Flash answered "503 Service is too busy" or answered 200 and then sent
// nothing. Every turn that reached the fallback (openai/gpt-6-luna) finished, including four
// sessions of 443k-503k tokens: the mid-turn precheck compacted them through versa-fast-quality-v1
// (azure gpt-5.6-sol) in 20-30 s. The turns that failed never got there:
//
//   B  The Worker failed cleanly (503 x2, no tool, replay-safe) and the Gateway's prompt stage
//      answered with rotate_profile: one more DeepSeek attempt on its other auth candidate (same
//      account, same overloaded service). That attempt hung or ran a tool and then got a 503, after
//      which the turn was no longer replay-safe and could not move to the fallback. 9 turns.
//   D  DeepSeek answered 200 and went silent. The Worker's run hit "LLM idle timeout (90s): no
//      response from model", its single-candidate failover surfaced it without throwing
//      (terminal.timedOut), and the Gateway received an aborted, replay-safe reply that it does not
//      fall back from. 8 turns. #375 covered a request that hangs before the response headers, not
//      a stream that opens and stays silent.
//
// luna-fallback-takeover-v1:
//   embedded-agent  When the transport-owning harness already retried the model and the failure is
//                   server_error/overloaded, a fallback configured and the attempt replay-safe, go to
//                   the fallback model instead of rotating to another profile of the same provider.
//                   rate_limit keeps rotating (another key may have quota); timeout already falls
//                   back through promptTimeoutFallbackSafe.
//   worker index    A Worker reply that ended in the idle timeout with no tool call, no visible text
//                   and no delivery is reported to the Gateway as the same provider timeout #375
//                   reports for a hung request, so promptTimeoutFallbackSafe applies. Without a
//                   fallback (a user-selected model) the Gateway surfaces it as it does today for
//                   a hung request.
//   chatgpt provider gpt-6-luna's context budget 272000 -> 850000. The 272000 came with V's own
//                   synthesized GPT-6 entries (v91-gpt6-sol-luna-v1, upstream's ChatGPT default).
//                   The subscription backend took 454,831 / 491,681 / 520,029 / 806,326 input tokens
//                   and refused ~980k ("Your input exceeds the context window"), matching the Codex
//                   catalog's max_context_window 872000 (shared VLab, real account, 2026-11-03).
//                   A models.providers.openai.models row cannot raise it: on the vlab-worker path an
//                   authored contextTokens is only a cap. With 272000 every fallback to luna over
//                   ~252k tokens compacted first (20-100 s, and the session stays compacted).

export const MARKER = 'luna-fallback-takeover-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

function guard(source) {
  assert(!source.includes(MARKER), 'already patched');
}

// core/dist/embedded-agent-DaSvA-Yk.js
export function patchEmbeddedAgent(source) {
  guard(source);
  const anchor = `	const vHarnessAlreadyRetried = Boolean(input.pluginHarnessOwnsTransport && input.fallbackConfigured && input.promptErrorSource === "prompt" && (promptFailoverReason === "server_error" || promptFailoverReason === "overloaded" || promptFailoverReason === "rate_limit" || promptFailoverReason === "timeout"));
`;
  return replaceExactlyOnce(source, anchor, `${anchor}	// ${MARKER}: another auth profile of the provider that just answered 5xx is one more blind retry of the same
	// service; when that retry runs a tool and fails again the turn can no longer move to the fallback model.
	if (vHarnessAlreadyRetried && failoverDecision.action === "rotate_profile" && (promptFailoverReason === "server_error" || promptFailoverReason === "overloaded") && input.attempt.replayMetadata?.replaySafe === true) {
		log$3.warn(\`[${MARKER}] \${promptFailoverReason}: \${sanitizeForLog(input.provider)}/\${sanitizeForLog(input.modelId)} already retried by the harness; skipping profile rotation for the fallback model runId=\${input.runParams.runId}\`);
		failoverDecision = {
			action: "fallback_model",
			reason: promptFailoverReason
		};
	}
`, 'harness retry marker');
}

// worker/index.mjs (production-worker)
export function patchWorkerIndex(source) {
  guard(source);
  let out = replaceExactlyOnce(source,
    `        workerMessagesSnapshot = result.attempt.messagesSnapshot;
        return result.attempt;
      } catch (error) {`,
    `        // ${MARKER}: the model went silent (idle timeout) before any tool, text or delivery; report it
        // as the provider timeout of a hung request so the Gateway can try the fallback model.
        const silentModelTimeout = readSilentModelTimeout(result.attempt, params.abortSignal);
        if (silentModelTimeout) {
          api.logger.warn(\`[${MARKER}] worker run ended silent runId=\${String(params.runId)} sessionKey=\${sessionKey} error=\${silentModelTimeout}\`);
          const silentError = new Error(silentModelTimeout);
          silentError.name = "FailoverError";
          silentError.failoverReason = "timeout";
          throw silentError;
        }
        workerMessagesSnapshot = result.attempt.messagesSnapshot;
        return result.attempt;
      } catch (error) {`,
    'worker attempt return');
  out = replaceExactlyOnce(out,
    `import { buildHarnessFailureAttempt } from "./harness-failure.mjs";
`,
    `import { buildHarnessFailureAttempt } from "./harness-failure.mjs";
// ${MARKER}: a Worker reply that only says the model never answered.
const SILENT_MODEL_TIMEOUT_RE = /^LLM idle timeout \\(\\d+s\\): no response from model$/u;
function readSilentModelTimeout(attempt, abortSignal) {
  if (!attempt || abortSignal?.aborted || attempt.externalAbort === true || attempt.promptError) return undefined;
  if (attempt.replayMetadata?.replaySafe !== true || attempt.replayMetadata?.hadPotentialSideEffects === true) return undefined;
  if ((attempt.toolMetas?.length ?? 0) > 0 || (attempt.clientToolCalls?.length ?? 0) > 0) return undefined;
  if (attempt.didSendViaMessagingTool === true || attempt.didDeliverSourceReplyViaMessageTool === true || attempt.yieldDetected === true) return undefined;
  if ((attempt.assistantTexts ?? []).some((text) => typeof text === "string" && text.trim().length > 0)) return undefined;
  const assistant = attempt.currentAttemptAssistant ?? attempt.lastAssistant;
  if (assistant?.role !== "assistant" || assistant.stopReason !== "aborted") return undefined;
  const message = typeof assistant.errorMessage === "string" ? assistant.errorMessage.trim() : "";
  return SILENT_MODEL_TIMEOUT_RE.test(message) ? message : undefined;
}
`,
    'harness-failure import');
  return out;
}

// core/dist/openai-chatgpt-provider-BApw3_oy.js
export const LUNA_CONTEXT_TOKENS = 850000;
export function patchChatgptProvider(source) {
  guard(source);
  const luna = `	if (lower === "gpt-6-luna") return normalizeModelCompat({
		id: trimmedModelId, name: "GPT-6 Luna", provider: PROVIDER_ID,
		api: "openai-chatgpt-responses", baseUrl: synthBaseUrl,
		reasoning: true, input: ["text", "image"],
		contextWindow: 1050000, contextTokens: 272000, maxTokens: 128000,
`;
  return replaceExactlyOnce(source, luna, luna.replace(
    '		contextWindow: 1050000, contextTokens: 272000, maxTokens: 128000,\n',
    `		// ${MARKER}: the subscription takes luna requests up to its 872k window
		contextWindow: 1050000, contextTokens: ${LUNA_CONTEXT_TOKENS}, maxTokens: 128000,\n`), 'gpt-6-luna entry');
}

export const FILES = [
  { name: 'embedded-agent-DaSvA-Yk.js', base: 'core/dist', target: 'openclaw/dist', before: '88a9a95e96af39eea5753ae75b0952fa216c9a83c99d876c24dc2b44c3e3ac86', patch: patchEmbeddedAgent },
  { name: 'index.mjs', base: 'worker', target: 'production-worker', before: 'e657c62b022692e4f740b0914b8ac8cdc291af58c8f3fa8f1b45d812a7b9ff0d', patch: patchWorkerIndex },
  { name: 'openai-chatgpt-provider-BApw3_oy.js', base: 'core/dist', target: 'openclaw/dist', before: '46bc8cc01badf720ab5d3443bf66cc2885b998f90a072b3588d6694566935df2', patch: patchChatgptProvider },
];
