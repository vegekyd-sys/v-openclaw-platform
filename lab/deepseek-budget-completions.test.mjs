import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { IMAGE_MARKER, NOTICE_MARKER, patchAgentRunner, patchErrorText, patchOpenAICompletions, patchOverflowGuidance } from './patch-deepseek-budget-completions.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
// Bases are V's live bytes (2026-10-12): openai-completions 6a34cb79… (= the deepseek-compaction
// release file), embedded-agent-helpers 342e6269…, embedded-agent 22dad1ef… and agent-runner.runtime
// 75b5b4b1… (= the v-voice-content-product-20261011 capture).
const base = {
  completions: read('./release-files/deepseek-compaction-openai-completions-D0QZ0AyB.mjs'),
  helpers: read('../release/captured/v-voice-content-product-20261011/dist/embedded-agent-helpers-CzpaLpCq.js'),
  agent: read('../release/captured/v-voice-content-product-20261011/dist/embedded-agent-DaSvA-Yk.js'),
  runner: read('../release/captured/v-voice-content-product-20261011/dist/agent-runner.runtime-CAdsMsQt.js'),
};
const released = {
  completions: read('./release-files/deepseek-budget-completions/openai-completions-D0QZ0AyB.mjs'),
  helpers: read('./release-files/deepseek-budget-completions/embedded-agent-helpers-CzpaLpCq.js'),
  agent: read('./release-files/deepseek-budget-completions/embedded-agent-DaSvA-Yk.js'),
  runner: read('./release-files/deepseek-budget-completions/agent-runner.runtime-CAdsMsQt.js'),
};
const GUARD_ERROR = 'Context overflow: [V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED] 上下文剩余空间不足，需要压缩上下文后继续；历史和任务状态未清空，恢复前请核对已执行操作，避免重复执行。';
const CHINESE = '上下文剩余空间不足，已停止本次生成。请先压缩上下文后再继续；历史和任务状态未清空，恢复前请核对已执行操作，避免重复执行。';

const slice = (source, signature) => {
  const start = source.indexOf(signature);
  assert(start >= 0, signature);
  return source.slice(start, source.indexOf('\n}\n', start) + 3);
};

test('release files are V\'s live bytes plus only this patch', () => {
  assert.equal(patchOpenAICompletions(base.completions), released.completions);
  assert.equal(patchErrorText(base.helpers), released.helpers);
  assert.equal(patchOverflowGuidance(base.agent), released.agent);
  assert.equal(patchAgentRunner(base.runner), released.runner);
  assert.throws(() => patchAgentRunner(released.runner), /already patched/);
  assert.throws(() => patchOpenAICompletions(released.completions), /already patched/);
  assert.throws(() => patchErrorText(released.helpers), /already patched/);
  assert.throws(() => patchOverflowGuidance(released.agent), /already patched/);
});

test('the provider copy of the budget now has the same image hunk as transports.mjs', () => {
  const transports = read('./release-files/deepseek-budget-image/transports.mjs');
  assert.equal(slice(released.completions, 'function applyDeepSeekOutputBudget('), slice(transports, 'function applyDeepSeekOutputBudget('));
  assert(released.completions.includes(IMAGE_MARKER));
});

const budgetFrom = (source) => new Function('Buffer', `${slice(source, 'function applyDeepSeekOutputBudget(')}\nreturn applyDeepSeekOutputBudget;`)(Buffer);
const model = { id: 'deepseek-v4-flash', contextWindow: 1_000_000, maxTokens: 384_000, input: ['text', 'image'] };
const imageRequest = () => ({
  messages: [
    { role: 'user', content: 'a'.repeat(40_000) },
    { role: 'user', content: [{ type: 'text', text: 'generated image' }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${'A'.repeat(2_400_000)}` } }] },
  ],
  max_tokens: 384_000,
});

test('a 2.4 MB inline image is refused by V\'s provider copy and sent by the patched one', () => {
  assert.throws(() => budgetFrom(base.completions)(imageRequest(), model, undefined), /V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED/);
  const params = imageRequest();
  budgetFrom(released.completions)(params, model, undefined);
  assert.equal(params.max_tokens, 384_000);
});

test('a genuinely oversized text request is still refused', () => {
  assert.throws(() => budgetFrom(released.completions)({ messages: [{ content: 'a'.repeat(2_000_000) }], max_tokens: 384_000 }, model, undefined), /V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED/);
});

test('overflow recovery surfaces the Chinese notice for the guard, English for everything else', () => {
  const render = (source) => {
    const context = {};
    vm.runInNewContext(`${slice(source, 'function renderOverflowResetGuidance(')}\nthis.render = renderOverflowResetGuidance;`, context);
    return context.render;
  };
  const attempt = { replayMetadata: { hadPotentialSideEffects: false } };
  const before = render(base.agent);
  const after = render(released.agent);
  assert.match(before(attempt, GUARD_ERROR), /^Context overflow: prompt too large for the model\./, 'V today: English');
  assert.equal(after(attempt, GUARD_ERROR), CHINESE);
  assert.equal(after(attempt, `LLM request failed: ${GUARD_ERROR}`), CHINESE, 'wrapped copy');
  assert.equal(after(attempt, 'Context overflow: prompt too large for the model (precheck).'), before(attempt, 'x'));
  assert.equal(after({ replayMetadata: { hadPotentialSideEffects: true } }, '400 context length exceeded'),
    before({ replayMetadata: { hadPotentialSideEffects: true } }, '400 context length exceeded'));
  // Both surface sites pass the error text.
  assert.equal(released.agent.split('renderOverflowResetGuidance(input.attempt, errorText)').length, 3);
});

test('the failover formatter matches the guard\'s real message, only for deepseek-v4', () => {
  const check = (source) => {
    const fn = slice(source, 'function formatUserFacingAssistantErrorText(');
    const first = fn.split('\n').find((line) => line.includes('deepseek-v4'));
    assert(first, 'DeepSeek check line');
    const context = {};
    vm.runInNewContext(`function f(msg) { const rawError = msg.errorMessage?.trim();\n${first}\nreturn null; }\nthis.f = f;`, context);
    return context.f;
  };
  assert.equal(check(base.helpers)({ model: 'deepseek-v4-pro', errorMessage: GUARD_ERROR }), null, 'V today: never matches');
  const after = check(released.helpers);
  assert.equal(after({ model: 'deepseek-v4-pro', errorMessage: GUARD_ERROR }), CHINESE);
  assert.equal(after({ model: 'deepseek-v4-flash', errorMessage: GUARD_ERROR }), CHINESE);
  assert.equal(after({ model: 'deepseek-flash', errorMessage: GUARD_ERROR }), null);
  assert.equal(after({ model: 'deepseek-v4-pro', errorMessage: 'Context overflow: prompt too large' }), null);
  assert(released.helpers.includes(NOTICE_MARKER));
});

test('the channel runner keeps the notice when the run ends in an error', () => {
  const context = {};
  vm.runInNewContext(`${slice(released.runner, 'function vDeepSeekBudgetNoticeText(')}\nthis.notice = vDeepSeekBudgetNoticeText;`, context);
  assert.equal(context.notice(GUARD_ERROR), CHINESE, 'raw guard error');
  assert.equal(context.notice(CHINESE), CHINESE, 'already rendered by overflow recovery (V worker throws it)');
  assert.equal(context.notice('Context overflow: prompt too large for the model. Try /reset'), undefined);
  assert.equal(context.notice(undefined), undefined);
  // Every English overflow substitution in the runner now defers to it.
  assert.equal(released.runner.split('vDeepSeekBudgetNoticeText(message)').length, 4);
  assert.equal(released.runner.split('vDeepSeekBudgetNoticeText(errorMsg)').length, 3);
  assert.equal(released.runner.split('vDeepSeekBudgetNoticeText(embeddedError.message)').length, 2);
  assert.equal(released.runner.split('text: buildContextOverflowRecoveryText(').length, 1, 'no recovery copy left unguarded');
});
