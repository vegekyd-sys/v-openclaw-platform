import assert from 'node:assert/strict';

// Two gaps left by E3 (deepseek-budget-image-v1, 2026-09-29), found by the 10.1 upgrade review
// (~/v-upgrade-private/20261011-upgrade101/cov-g2 E3/E3b) and confirmed on V's live bytes:
//
// 1. @openclaw/ai carries two copies of applyDeepSeekOutputBudget (deepseek-empty-budget-v1):
//    transports.mjs (OpenClaw-managed transport, main agent turns) and
//    openai-completions-D0QZ0AyB.mjs (the built-in "openai-completions" provider that the API
//    registry dispatches to: completeSimple/streamSimple callers such as utility, isolated and
//    companion completions). E3 fixed only transports.mjs; the provider copy still estimates two
//    bytes per token over the whole JSON, so one generated image (1.5-2.5 MB of base64) looks like
//    0.8-1.2M tokens and a deepseek-v4 request is refused before it is sent. Same hunk as E3:
//    each inline image counts as a fixed 8192 tokens.
//
// 2. The Chinese notice for an unrecoverable budget refusal never reaches users. The guard throws
//    "Context overflow: [V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED] ...", so native overflow recovery
//    compacts first, and when that is exhausted renderOverflowResetGuidance surfaces the English
//    "Context overflow: prompt too large for the model. Try /reset ..." text. The only place that
//    renders the Chinese text, formatUserFacingAssistantErrorText, matches the prefix
//    "上下文剩余空间不足，已停止本次生成。", which the guard never throws (openclaw-versa
//    062f3e6f181 keeps that bug on purpose; 090874a1126 is the working form). And when the run
//    ends in an error rather than an error payload (the V worker runtime), the auto-reply runner
//    channels reply through swaps in its own English overflow copy. All three now recognise the
//    guard's real message (candidate 2026-10-12: V's bytes delivered English on both runtimes).

export const IMAGE_MARKER = 'deepseek-budget-image-v1';
export const NOTICE_MARKER = 'deepseek-budget-notice-v1';

// The guard's message is "Context overflow: [V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED] ..."; match the code
// anywhere so a wrapped or prefixed copy (e.g. across the Worker boundary) is still recognised.
const GUARD_CODE = '[V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED]';
const USER_TEXT = '上下文剩余空间不足，已停止本次生成。请先压缩上下文后再继续；历史和任务状态未清空，恢复前请核对已执行操作，避免重复执行。';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

// @openclaw/ai/dist/openai-completions-D0QZ0AyB.mjs — the same lines E3 put into transports.mjs.
export function patchOpenAICompletions(source) {
  assert(source.includes('deepseek-empty-budget-v1'), 'DeepSeek output budget (deepseek-empty-budget-v1) is missing');
  assert(!source.includes(IMAGE_MARKER), 'already patched');
  return replaceExactlyOnce(source,
    `  const bytes = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value ?? ''), 'utf8');\n`,
    `  // ${IMAGE_MARKER}: inline images are billed per image, not per base64 byte.
  // Counting their bytes as text made one generated image (1.5-2.5 MB of base64) look
  // like 0.8-1.2M tokens and refused the turn before any request (V 2026-09-28 14:20,
  // providerPayloadBytes=1909721). Each inline image counts as a fixed 8192 tokens.
  const IMAGE_PLACEHOLDER = 'x'.repeat(8192 * 2);
  const INLINE_IMAGE_DATA_URL = /^data:image\\/[a-z0-9.+-]+;base64,/i;
  const isInlineImageUrl = value => typeof value === 'string' && value.length >= 1024 && INLINE_IMAGE_DATA_URL.test(value);
  const withoutInlineImageBytes = function (key, value) {
    if (typeof value !== 'string' || value.length < 1024) return value;
    if (INLINE_IMAGE_DATA_URL.test(value)) return IMAGE_PLACEHOLDER;
    if (key === 'data' && this && this.type === 'image') return IMAGE_PLACEHOLDER;
    return value;
  };
  const bytes = value => Buffer.byteLength(typeof value === 'string' ? (isInlineImageUrl(value) ? IMAGE_PLACEHOLDER : value) : (JSON.stringify(value ?? '', withoutInlineImageBytes) ?? ''), 'utf8');\n`,
    'applyDeepSeekOutputBudget bytes estimate');
}

// dist/embedded-agent-helpers-*.js — formatUserFacingAssistantErrorText (the failover path).
export function patchErrorText(source) {
  assert(!source.includes(NOTICE_MARKER), 'already patched');
  return replaceExactlyOnce(source,
    `	// deepseek-empty-budget-v1
	if (/^deepseek-v4(?:-|$)/i.test(msg.model ?? "") && rawError?.startsWith("上下文剩余空间不足，已停止本次生成。")) return "${USER_TEXT}";`,
    `	// deepseek-empty-budget-v1, ${NOTICE_MARKER}: match what the budget guard actually throws
	if (/^deepseek-v4(?:-|$)/i.test(msg.model ?? "") && rawError?.includes(${JSON.stringify(GUARD_CODE)})) return "${USER_TEXT}";`,
    'formatUserFacingAssistantErrorText DeepSeek budget check');
}

// dist/embedded-agent-*.js — the text surfaced when overflow recovery (compaction, retries,
// tool-result truncation) cannot make the request fit.
export function patchOverflowGuidance(source) {
  assert(!source.includes(NOTICE_MARKER), 'already patched');
  let out = replaceExactlyOnce(source,
    `function renderOverflowResetGuidance(attempt) {
	return "Context overflow: prompt too large for the model.`,
    `function renderOverflowResetGuidance(attempt, errorText) {
	// ${NOTICE_MARKER}: V's DeepSeek v4 budget guard refused the request; say so in Chinese
	if (typeof errorText === "string" && errorText.includes(${JSON.stringify(GUARD_CODE)})) return "${USER_TEXT}";
	return "Context overflow: prompt too large for the model.`,
    'renderOverflowResetGuidance');
  out = replaceExactlyOnce(out,
    `			userText: renderOverflowResetGuidance(input.attempt)\n`,
    `			userText: renderOverflowResetGuidance(input.attempt, errorText)\n`,
    'request-size ceiling guidance call');
  return replaceExactlyOnce(out,
    `	const userText = renderOverflowResetGuidance(input.attempt);\n`,
    `	const userText = renderOverflowResetGuidance(input.attempt, errorText);\n`,
    'exhausted recovery guidance call');
}

// dist/agent-runner.runtime-*.js — the auto-reply runner channels (Feishu, webchat…) reply
// through. When the run ends in an error instead of an error payload (the V worker runtime
// throws; in-Gateway runs can end with meta.error and no text), it substitutes its own English
// overflow copy. Recognise the guard's code, or the notice the patched recovery already rendered.
export function patchAgentRunner(source) {
  assert(!source.includes(NOTICE_MARKER), 'already patched');
  let out = replaceExactlyOnce(source,
    `async function handleAgentExecutionError(params) {\n`,
    `// ${NOTICE_MARKER}: V's DeepSeek v4 budget guard, raw or as the notice overflow recovery rendered
function vDeepSeekBudgetNoticeText(text) {
	if (typeof text !== "string") return;
	if (text.includes(${JSON.stringify(GUARD_CODE)}) || text.trim().startsWith("上下文剩余空间不足，已停止本次生成。")) return "${USER_TEXT}";
}
async function handleAgentExecutionError(params) {\n`,
    'handleAgentExecutionError');
  out = replaceExactlyOnce(out,
    `	const isContextOverflow = !isBilling && (failoverReason === "context_overflow" || isLikelyContextOverflowError(message));\n`,
    `	const isContextOverflow = !isBilling && (failoverReason === "context_overflow" || isLikelyContextOverflowError(message) || vDeepSeekBudgetNoticeText(message) !== void 0);\n`,
    'thrown-error overflow classification');
  out = replaceExactlyOnce(out,
    `isContextOverflow ? "⚠️ Context overflow — prompt too large for this model. Try a shorter message or a larger-context model." :`,
    `isContextOverflow ? vDeepSeekBudgetNoticeText(message) ?? "⚠️ Context overflow — prompt too large for this model. Try a shorter message or a larger-context model." :`,
    'thrown-error overflow copy');
  // The guard's raw message also classifies as a compaction failure (in-Gateway runs land here),
  // and as a context overflow on the settled-result path; both keep their handling, only the text changes.
  out = replaceExactlyOnce(out,
    `			payload: markAgentRunFailureReplyPayload({ text: buildContextOverflowRecoveryText({
				duringCompaction: true,\n`,
    `			payload: markAgentRunFailureReplyPayload({ text: vDeepSeekBudgetNoticeText(message) ?? buildContextOverflowRecoveryText({
				duringCompaction: true,\n`,
    'compaction-failure copy');
  out = replaceExactlyOnce(out,
    `			payload: markAgentRunFailureReplyPayload({ text: buildContextOverflowRecoveryText({
				preserveSessionMapping: true,
				cfg: cycle.runtimeConfig,\n`,
    `			payload: markAgentRunFailureReplyPayload({ text: vDeepSeekBudgetNoticeText(embeddedError.message) ?? buildContextOverflowRecoveryText({
				preserveSessionMapping: true,
				cfg: cycle.runtimeConfig,\n`,
    'settled overflow copy');
  out = replaceExactlyOnce(out,
    `		if (isContextOverflowError(errorMsg)) {\n`,
    `		if (isContextOverflowError(errorMsg) || vDeepSeekBudgetNoticeText(errorMsg) !== void 0) {\n`,
    'meta.error overflow classification');
  return replaceExactlyOnce(out,
    `payload: markAgentRunFailureReplyPayload({ text: "⚠️ Context overflow — this conversation is too large for the model. Use /new to start a fresh session." }),`,
    `payload: markAgentRunFailureReplyPayload({ text: vDeepSeekBudgetNoticeText(errorMsg) ?? "⚠️ Context overflow — this conversation is too large for the model. Use /new to start a fresh session." }),`,
    'meta.error overflow copy');
}

export const TARGETS = [
  { name: 'openai-completions', pattern: /^openai-completions-[\w-]+\.mjs$/u, dir: 'node_modules/@openclaw/ai/dist', needle: 'function applyDeepSeekOutputBudget(', patch: patchOpenAICompletions },
  { name: 'error-text', pattern: /^embedded-agent-helpers-[\w-]+\.js$/u, dir: 'dist', needle: 'function formatUserFacingAssistantErrorText(', patch: patchErrorText },
  { name: 'overflow-guidance', pattern: /^embedded-agent-[\w-]+\.js$/u, dir: 'dist', needle: 'function renderOverflowResetGuidance(attempt', patch: patchOverflowGuidance },
  { name: 'agent-runner', pattern: /^agent-runner\.runtime-[\w-]+\.js$/u, dir: 'dist', needle: 'async function handleAgentExecutionError(params) {', patch: patchAgentRunner },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs');
  const [kind, input, output] = process.argv.slice(2);
  const target = TARGETS.find((t) => t.name === kind);
  assert(target && input && output, `usage: patch-deepseek-budget-completions.mjs <${TARGETS.map((t) => t.name).join('|')}> <in> <out>`);
  fs.writeFileSync(output, target.patch(fs.readFileSync(input, 'utf8')));
}
