import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Context overflow after a settled tool batch (V 2026-10-12 14:49, group oc_5195cdfe, 455 messages)
// and the English notices users get when overflow recovery gives up.
//
// 1. context-overflow-settled-tools-v1 — backport of upstream openclaw a6093ef81fa (#148383,
//    "fix: continue tasks after provider context overflows", first released in 2026.9.6).
//    On 9.1 an overflow that the provider (DeepSeek 400) or the transport budget guard
//    (V_COMPLETIONS_CONTEXT_BUDGET_EXHAUSTED) reports for the next model call after tools ran is
//    "not replay-safe", so recoverEmbeddedRunAttempt returns "proceed" before overflow recovery and
//    the user gets "Context overflow: ... Try /reset". Only the mid-turn precheck path could compact
//    and continue, and its estimate disagrees with both the transport guard and DeepSeek's count.
//    Upstream admits overflow recovery when every tool in the batch is proven settled and then
//    continues from the current transcript (requiresTranscriptContinuation) instead of replaying
//    the user's request. V's gate is narrower than upstream's: it only opens for an error that is a
//    context overflow, so timeout and other non-replay-safe paths keep their 9.1 handling.
//
// 2. context-overflow-notice-zh-v1 — when compaction, retries and tool-result truncation still
//    cannot make the request fit, V users (Chinese, Feishu/DingTalk) got four different English
//    texts depending on runtime and failure path. They now get one Chinese notice with the two
//    actions that work in chat: /compact and /new. The DeepSeek v4 budget notice
//    (deepseek-budget-notice-v1) is unchanged.

export const SETTLED_MARKER = 'context-overflow-settled-tools-v1';
export const NOTICE_MARKER = 'context-overflow-notice-zh-v1';

export const OVERFLOW_NOTICE = '这段对话太长，超出了模型能处理的上下文，自动压缩后仍然放不下，这一轮没有完成。请发送 /compact 压缩后重试，或发送 /new 开始新对话（长期记忆和文件不受影响）。';
export const SIDE_EFFECT_NOTICE = '本轮已经执行过的操作不会重做，重试前请先核对结果。';
export const COMPACTION_FAILED_NOTICE = '这段对话太长，自动压缩没能完成，这一轮没有完成，会话保持不变。请稍后重试，或发送 /compact 手动压缩，或发送 /new 开始新对话（长期记忆和文件不受影响）。';
export const RESET_NOTICE = '这段对话超出了模型能处理的上下文，已经为你换成新会话，请重新发送刚才的消息。';
// Anything that starts with this is already the notice; the Gateway must pass it through unchanged.
export const NOTICE_PREFIX = '这段对话';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

// dist/embedded-agent-DaSvA-Yk.js
export function patchEmbeddedAgent(source) {
  assert(source.includes('upstream-5xx-fallback-v1'), 'expected V bytes with upstream-5xx-fallback-v1');
  assert(source.includes('deepseek-budget-notice-v1'), 'expected V bytes with deepseek-budget-notice-v1');
  assert(!source.includes(SETTLED_MARKER) && !source.includes(NOTICE_MARKER), 'already patched');
  let out = source;

  // (1a) recoverEmbeddedRunOverflow: continue from the transcript whenever the attempt is not
  // replay-safe, exactly like the mid-turn precheck path.
  out = replaceExactlyOnce(out,
    `	const preflightRecovery = input.attempt.preflightRecovery;
	const truncateToolResults = () => {`,
    `	const preflightRecovery = input.attempt.preflightRecovery;
	// ${SETTLED_MARKER}: upstream #148383 — an attempt that already ran tools continues from its
	// recorded results after compaction; it never replays the user's request.
	const requiresTranscriptContinuation = preflightRecovery?.source === "mid-turn" || !isCurrentAttemptReplaySafe(input.attempt);
	const truncateToolResults = () => {`,
    'recoverEmbeddedRunOverflow preflightRecovery');
  out = replaceExactlyOnce(out,
    `retrying prompt without additional compaction for \${input.provider}/\${input.modelId}\`);
		if (preflightRecovery?.source === "mid-turn") input.prepareCurrentTranscriptRetry();`,
    `retrying prompt without additional compaction for \${input.provider}/\${input.modelId}\`);
		if (requiresTranscriptContinuation) input.prepareCurrentTranscriptRetry();`,
    'persisted overflow retry');
  out = replaceExactlyOnce(out,
    `parkedWorkBlocksContinuation = previousSessionId !== void 0 && preflightRecovery?.source === "mid-turn" && input.attempt.toolMetas`,
    `parkedWorkBlocksContinuation = previousSessionId !== void 0 && requiresTranscriptContinuation && input.attempt.toolMetas`,
    'parked work continuation');
  out = replaceExactlyOnce(out,
    `resetting the context snapshot and retrying prompt\`);
			if (preflightRecovery.source === "mid-turn") input.prepareCurrentTranscriptRetry();`,
    `resetting the context snapshot and retrying prompt\`);
			if (requiresTranscriptContinuation) input.prepareCurrentTranscriptRetry();`,
    'no-real-conversation retry');
  out = replaceExactlyOnce(out,
    `				input.markOwnedTranscriptRetry();
				if (preflightRecovery?.source === "mid-turn") input.prepareCurrentTranscriptRetry();
				else {`,
    `				input.markOwnedTranscriptRetry();
				if (requiresTranscriptContinuation) input.prepareCurrentTranscriptRetry();
				else {`,
    'post-compaction retry');
  out = replaceExactlyOnce(out,
    `Truncated \${truncResult.truncatedCount} tool result(s); retrying prompt\`);
				if (preflightRecovery?.source === "mid-turn") input.prepareCurrentTranscriptRetry();`,
    `Truncated \${truncResult.truncatedCount} tool result(s); retrying prompt\`);
				if (requiresTranscriptContinuation) input.prepareCurrentTranscriptRetry();`,
    'tool-result truncation retry');

  // (1b) recoverEmbeddedRunAttempt: admit overflow recovery for a settled tool batch.
  out = replaceExactlyOnce(out,
    `	const retry = (updates) => ({
		action: "retry",
		authRetryPending: updates?.authRetryPending ?? false,
		codexAppServerRecoveryRetries: updates?.codexAppServerRecoveryRetries ?? input.codexAppServerRecoveryRetries,`,
    `	// ${SETTLED_MARKER}: upstream #148383 canRecoverSettledToolResults — the provider (or the
	// transport budget guard) rejected the next model call after every tool had settled. Compact
	// their recorded results and continue instead of surfacing "Try /reset". V only opens this
	// gate for a context overflow; other non-replay-safe failures keep their 9.1 handling.
	const vSettledToolOverflowText = promptError ? promptErrorSource === "prompt" ? formatErrorMessage(promptError) : void 0 : assistantErrorText ?? assistantOverflowCandidate?.errorMessage;
	const vSettledToolOverflow = !currentAttemptReplaySafe && preparedRuntime.genericCompactionRecoveryAllowed && !aborted && !terminalInterrupted && (!promptError || promptErrorSource === "prompt") && settledEvidence.allToolsProvenSettled && !settledEvidence.intentionalTermination && !hasAsyncActivity(attempt.toolMetas) && !attempt.yieldDetected && !attempt.clientToolCalls && !attempt.didSendDeterministicApprovalPrompt && (typeof vSettledToolOverflowText === "string" && isLikelyContextOverflowError(vSettledToolOverflowText) || assistantOverflowCandidate !== void 0 && runtime.contextTokenBudget !== void 0 && isContextOverflow(assistantOverflowCandidate, runtime.contextTokenBudget));
	const retry = (updates) => ({
		action: "retry",
		authRetryPending: updates?.authRetryPending ?? false,
		codexAppServerRecoveryRetries: updates?.codexAppServerRecoveryRetries ?? input.codexAppServerRecoveryRetries,`,
    'recoverEmbeddedRunAttempt retry helper');
  out = replaceExactlyOnce(out,
    `	if (!currentAttemptReplaySafe && !canContinueSettledMidTurnOverflow && !settledTransportDropAssistant && !vProviderErrorReason) return { action: "proceed" };`,
    `	if (!currentAttemptReplaySafe && !canContinueSettledMidTurnOverflow && !settledTransportDropAssistant && !vProviderErrorReason && !vSettledToolOverflow) return { action: "proceed" };
	if (vSettledToolOverflow) log$3.warn(\`[\${${JSON.stringify(SETTLED_MARKER)}}] context overflow after a settled tool batch; compacting and continuing from the transcript provider=\${preparedRuntime.provider} model=\${preparedRuntime.modelId} tools=\${attempt.toolMetas.length} runId=\${params.runId} sessionId=\${params.sessionId}\`);`,
    'replay-unsafe proceed gate');

  // (2) The text surfaced when overflow recovery is exhausted.
  out = replaceExactlyOnce(out,
    `	return "Context overflow: prompt too large for the model. Try /reset (or /new) to start a fresh session, or use a larger-context model." + ((attempt.currentAttemptReplayMetadata ?? attempt.replayMetadata).hadPotentialSideEffects ? " Completed tool actions were not replayed; verify their effects before retrying." : "");`,
    `	// ${NOTICE_MARKER}
	return ${JSON.stringify(OVERFLOW_NOTICE)} + ((attempt.currentAttemptReplayMetadata ?? attempt.replayMetadata).hadPotentialSideEffects ? ${JSON.stringify(SIDE_EFFECT_NOTICE)} : "");`,
    'renderOverflowResetGuidance text');
  return out;
}

// dist/embedded-agent-helpers-CzpaLpCq.js — formatUserFacingAssistantErrorText (failover path).
export function patchHelpers(source) {
  assert(!source.includes(NOTICE_MARKER), 'already patched');
  return replaceExactlyOnce(source,
    `	if (failoverReason === "context_overflow") return "Context overflow: prompt too large for the model. Try /reset (or /new) to start a fresh session, or use a larger-context model.";`,
    `	if (failoverReason === "context_overflow") return ${JSON.stringify(OVERFLOW_NOTICE)}; // ${NOTICE_MARKER}`,
    'formatUserFacingAssistantErrorText overflow text');
}

// dist/agent-runner.runtime-CAdsMsQt.js — what the channel reply runner sends when a run ends in
// an overflow (Gateway side, both runtimes).
export function patchAgentRunner(source) {
  assert(source.includes('deepseek-budget-notice-v1'), 'expected V bytes with deepseek-budget-notice-v1');
  assert(!source.includes(NOTICE_MARKER), 'already patched');
  let out = source;
  out = replaceExactlyOnce(out,
    `function buildContextOverflowRecoveryText(params) {
	return (params.preserveSessionMapping ? "⚠️ Auto-compaction could not recover this turn. I kept this conversation mapped to the current session. Please try again, use /compact, or use /new to start a fresh session." : params.duringCompaction ? "⚠️ Context limit exceeded during compaction. I've reset our conversation to start fresh - please try again." : "⚠️ Context limit exceeded. I've reset our conversation to start fresh - please try again.")`,
    `function buildContextOverflowRecoveryText(params) {
	// ${NOTICE_MARKER}
	return (params.preserveSessionMapping ? ${JSON.stringify(COMPACTION_FAILED_NOTICE)} : ${JSON.stringify(RESET_NOTICE)})`,
    'buildContextOverflowRecoveryText');
  out = replaceExactlyOnce(out,
    `function buildContextOverflowResetHint() {
	return "\\n\\nTry starting a fresh session or using a model with a larger context window.";
}`,
    `function buildContextOverflowResetHint() {
	return ""; // ${NOTICE_MARKER}: the Chinese notices already name /compact and /new
}`,
    'buildContextOverflowResetHint');
  // The Worker (and in-Gateway recovery) already rendered the Chinese notice; pass it through.
  out = replaceExactlyOnce(out,
    `	if (typeof text !== "string") return;
	if (text.includes("[V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED]")`,
    `	if (typeof text !== "string") return;
	if (text.trim().startsWith(${JSON.stringify(OVERFLOW_NOTICE.slice(0, 24))})) return text.trim(); // ${NOTICE_MARKER}
	if (text.includes("[V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED]")`,
    'vDeepSeekBudgetNoticeText passthrough');
  out = replaceExactlyOnce(out,
    `"⚠️ Context overflow — prompt too large for this model. Try a shorter message or a larger-context model."`,
    JSON.stringify(OVERFLOW_NOTICE),
    'handleAgentExecutionError overflow text');
  out = replaceExactlyOnce(out,
    `"⚠️ Context overflow — this conversation is too large for the model. Use /new to start a fresh session."`,
    JSON.stringify(OVERFLOW_NOTICE),
    'fallback overflow text');
  return out;
}

export const FILES = [
  { name: 'embedded-agent-DaSvA-Yk.js', target: 'openclaw/dist/embedded-agent-DaSvA-Yk.js', patch: patchEmbeddedAgent },
  { name: 'embedded-agent-helpers-CzpaLpCq.js', target: 'openclaw/dist/embedded-agent-helpers-CzpaLpCq.js', patch: patchHelpers },
  { name: 'agent-runner.runtime-CAdsMsQt.js', target: 'openclaw/dist/agent-runner.runtime-CAdsMsQt.js', patch: patchAgentRunner },
];

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// node lab/patch-context-overflow-recovery.mjs <dir with V's live files> <out dir>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [inDir, outDir] = process.argv.slice(2);
  assert(inDir && outDir, 'usage: patch-context-overflow-recovery.mjs <inDir> <outDir>');
  fs.mkdirSync(outDir, { recursive: true });
  for (const file of FILES) {
    const before = fs.readFileSync(`${inDir}/${file.name}`);
    const after = Buffer.from(file.patch(before.toString('utf8')), 'utf8');
    fs.writeFileSync(`${outDir}/${file.name}`, after);
    console.log(`${file.name} ${sha256(before)} -> ${sha256(after)}`);
  }
}
