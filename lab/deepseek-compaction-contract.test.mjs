import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const files = ['transports.mjs', 'openai-completions-D0QZ0AyB.mjs'];
function budget(file) {
  const source = fs.readFileSync(new URL('./release-files/deepseek-compaction-' + file, import.meta.url), 'utf8');
  return vm.runInNewContext(source.slice(0, source.indexOf('\nimport ')) + '\napplyDeepSeekOutputBudget', {Buffer});
}
const model = {id: 'deepseek-v4-pro', contextWindow: 1000000, maxTokens: 32768};
const message = count => ({messages: [{role: 'user', content: 'x'.repeat(count)}], max_tokens: 32768});
function exhausted(file) {
  try { budget(file)(message(2100000), model, {messages: []}); }
  catch (error) { return error; }
  assert.fail('Expected budget exhaustion');
}
for (const file of files) {
  test(file + ': budget still blocks oversized input with native recovery marker', () => {
    const error = exhausted(file);
    assert.equal(error.code, 'V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED');
    assert.match(error.message, /^Context overflow: \[V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED\]/);
    // IPC may preserve only errorMessage. The discriminator must survive it.
    const wire = JSON.parse(JSON.stringify({stopReason: 'error', content: [], errorMessage: error.message}));
    assert.match(wire.errorMessage, /^Context overflow:/);
  });
  test(file + ': normal calls and alternate token field retain output cap', () => {
    const apply = budget(file);
    const normal = message(100);
    assert.equal(apply(normal, model, {messages: []}).max_tokens, 32768);
    const near = message(1850000);
    near.max_completion_tokens = near.max_tokens;
    delete near.max_tokens;
    apply(near, model, {messages: []});
    assert(near.max_completion_tokens >= 4096 && near.max_completion_tokens < 32768);
    assert.equal(near.max_tokens, undefined);
    const other = message(2100000);
    assert.equal(apply(other, {...model, id: 'other-model'}, {}), other);
  });
}
test('native overflow recovery compacts then continues the transcript after settled tools', async () => {
  const calls = [];
  const native = fs.readFileSync(new URL('./fixtures/deepseek-native-overflow.js', import.meta.url), 'utf8');
  const recover = vm.runInNewContext(native + '\nrecoverEmbeddedRunOverflow', {
    // Verified against the live classifier: old localized error=false, marker=true.
    isLikelyContextOverflowError: text => text.startsWith('Context overflow:'),
    isProviderRefusalAssistantError: () => false,
    isContextOverflow: () => false,
    projectAgentRunAttemptTerminal: () => ({}),
    markLastProviderPromptContextRejected: () => undefined,
    getProviderPromptState: () => ({}),
    createRunRecoveryDiagId: () => 'test',
    extractObservedOverflowTokenCount: () => undefined,
    truncateUtf16Safe: text => text,
    log$3: {warn() {}, info() {}, debug() {}, isEnabled: () => false},
    isCompactionFailureError: () => false,
    isProviderRequestSizeCeilingError: () => false,
    compactEmbeddedRunForRecovery: async (_input, options) => {
      calls.push(['compact', options.trigger]);
      return {result: {ok: true, compacted: true}};
    },
  });
  const input = {
    assistantErrorText: exhausted(files[0]).message,
    genericCompactionRecoveryAllowed: true, contextTokenBudget: 1000000,
    assertRecoveryActive() {}, runParams: {runId: 'fixture', sessionKey: 'fixture'},
    attempt: {terminal: {}, toolMetas: [{toolName: 'write', settled: true}], messagesSnapshot: []},
    state: {overflowCompactionAttempts: 0, autoCompactionCount: 0}, attemptCompactionCount: 0,
    provider: 'deepseek', modelId: model.id, contextEngine: {},
    getActiveSession: () => ({id: 'same-session', file: 'fixture'}),
    runOwnsCompactionAfterHook: async () => {}, armPostCompactionGuard() {},
    markOwnedTranscriptRetry() {calls.push(['owned-retry']);},
    prepareCompactedTranscriptRetry: async () => {calls.push(['continue-compacted-transcript']);},
  };
  assert.equal((await recover(input)).action, 'retry');
  assert.deepEqual(calls, [['compact', 'overflow'], ['owned-retry'], ['continue-compacted-transcript']]);
  calls.length = 0;
  input.assistantErrorText = '上下文剩余空间不足，已停止本次生成。';
  assert.equal((await recover(input)).action, 'none');
  assert.deepEqual(calls, []);
  input.assistantErrorText = exhausted(files[0]).message;
  input.aborted = true;
  assert.equal((await recover(input)).action, 'none');
  assert.deepEqual(calls, []);
});
