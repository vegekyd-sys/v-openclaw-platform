import assert from 'node:assert/strict';
import test from 'node:test';
import {decide, splitRef, runtimeFor, BLOCK_MESSAGE} from './guard-core.mjs';

const config = {agents: {defaults: {models: {
  'codex/deepseek/deepseek-flash': {agentRuntime: {id: 'codex'}},
  'openai/gpt-5.6-sol': {agentRuntime: {id: 'codex'}},
  'deepseek/deepseek-v4-flash': {agentRuntime: {id: 'vlab-worker'}},
}}}};
const run = (state, sessionId, provider, model) => {
  const sel = splitRef(provider, model);
  return decide({state, sessionId, sel, runtime: runtimeFor(config, 'makaron', sel.ref)});
};

test('vds then vcodex in the same session is blocked with guidance', () => {
  const state = {};
  assert.equal(run(state, 's1', 'codex', 'deepseek/deepseek-flash').outcome, 'pass');
  const r = run(state, 's1', 'openai', 'gpt-5.6-sol');
  assert.equal(r.outcome, 'block');
  assert.equal(r.message, BLOCK_MESSAGE);
});

test('vds -> ds-flash (vlab-worker) -> vcodex is still blocked', () => {
  const state = {};
  run(state, 's1', 'codex', 'deepseek/deepseek-flash');
  assert.equal(run(state, 's1', 'deepseek', 'deepseek-v4-flash').outcome, 'pass');
  assert.equal(run(state, 's1', 'openai', 'gpt-5.6-sol').outcome, 'block');
});

test('vcodex then vds is allowed', () => {
  const state = {};
  assert.equal(run(state, 's1', 'openai', 'gpt-5.6-sol').outcome, 'pass');
  assert.equal(run(state, 's1', 'codex', 'deepseek/deepseek-flash').outcome, 'pass');
});

test('a new session (/new) is not affected', () => {
  const state = {};
  run(state, 's1', 'codex', 'deepseek/deepseek-flash');
  assert.equal(run(state, 's2', 'openai', 'gpt-5.6-sol').outcome, 'pass');
});

test('OpenAI models on other runtimes are never blocked', () => {
  const state = {s1: 1};
  const sel = splitRef('openai', 'gpt-5.6-sol');
  assert.equal(decide({state, sessionId: 's1', sel, runtime: 'vlab-worker'}).outcome, 'pass');
});
