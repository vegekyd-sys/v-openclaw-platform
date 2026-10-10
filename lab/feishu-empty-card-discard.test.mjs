import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { MARKER, patchFeishuMonitor } from './patch-feishu-empty-card-discard.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
// Base: the Feishu monitor on V and shared VLab (763bb8eb… = feishu-card-precreate).
const base = read('./release-files/feishu-card-precreate/monitor.account-WFdlCDhR.js');
const patched = read('./release-files/feishu-empty-card-discard/monitor.account-WFdlCDhR.js');

test('release file is V\'s Feishu monitor plus only this patch', () => {
  assert.equal(patchFeishuMonitor(base), patched);
  assert.throws(() => patchFeishuMonitor(patched), /already patched/);
  assert.equal(patched.split(MARKER).length, 2);
});

// Run the real performStreamingClose with a fake streaming session.
function closer(source, { answer = '', reasoning = '', taskStatus = false, env = {} } = {}) {
  const start = source.indexOf('\tconst performStreamingClose = async (disposition) => {');
  const end = source.indexOf('\n\tconst closeStreaming = ', start);
  assert(start > 0 && end > start);
  const calls = [];
  const session = {
    isActive: () => true,
    discard: async () => { calls.push('discard'); return { visibleReplySent: false }; },
    closeWithResult: async (text, options) => { calls.push(['close', text, options?.note]); return { visibleReplySent: Boolean(text.trim()), content: text }; },
    ...(taskStatus ? { vTaskStatusCard: { key: 'k' } } : {}),
  };
  const context = {
    process: { env }, calls, session, answer, reasoning,
    noVisibleFeishuReplyDelivery: { visibleReplySent: false },
    FeishuStreamingFinalizationError: class extends Error {},
  };
  vm.runInNewContext(`
    let streaming = session, activeStreamingGeneration = 1, streamingStartPromise, partialUpdateQueue;
    let streamText = answer, reasoningText = reasoning, statusLine = '正在 message', vProgressText = '';
    const vlab91Commentary = { close() {} };
    const params = { runtime: { log() {} } }, account = { accountId: 'default' };
    const ocCardPhaseAwait = async (_l, _c, _p, fn) => fn();
    const buildCombinedStreamText = (r, a) => [r, a].filter(Boolean).join('\\n');
    const agentId = 'makaron', identity = {}, responsePrefixContextProvider = () => ({});
    const resolveCardNote = () => 'Agent: V';
    const vTaskStatusClosing = () => {};
    const createFeishuReplyDeliveryResult = ({ visibleReplySent, content }) => ({ visibleReplySent, content });
    const markVisibleReplySent = () => {};
    const deliveredFinalTexts = new Set();
    const createFeishuPartialReplyDeliveryError = (e) => e;
    const rememberClosedStreamingSettlement = () => {};
    const resetStreamingState = () => { streaming = undefined; };
    ${source.slice(start, end)}
    this.run = performStreamingClose;
  `, context);
  return { run: context.run, calls };
}

test('unpatched: a silent turn leaves an empty card with only the footer (the bug)', async () => {
  const { run, calls } = closer(base);
  const out = await run('closed');
  assert.deepEqual(calls, [['close', '', 'Agent: V']]);
  assert.equal(out.result.visibleReplySent, false);
});

test('patched: a card that ends with no text is taken back', async () => {
  const { run, calls } = closer(patched);
  const out = await run('closed');
  assert.deepEqual(calls, ['discard']);
  assert.equal(out.disposition, 'closed');
  assert.equal(out.result.visibleReplySent, false);
  const blank = closer(patched, { answer: '  \n' });
  await blank.run('closed');
  assert.deepEqual(blank.calls, ['discard']);
});

test('patched: cards with text, reasoning or background-task status close as before', async () => {
  for (const [opts, text] of [[{ answer: '好的' }, '好的'], [{ reasoning: '想一想' }, '想一想']]) {
    const { run, calls } = closer(patched, opts);
    await run('closed');
    assert.deepEqual(calls, [['close', text, 'Agent: V']]);
  }
  const task = closer(patched, { taskStatus: true });
  await task.run('closed');
  assert.deepEqual(task.calls, [['close', '', 'Agent: V']]);
  const off = closer(patched, { env: { OPENCLAW_FEISHU_EMPTY_CARD_DISCARD: '0' } });
  await off.run('closed');
  assert.deepEqual(off.calls, [['close', '', 'Agent: V']]);
  const discarded = closer(patched, { answer: '好的' });
  await discarded.run('discarded');
  assert.deepEqual(discarded.calls, ['discard']);
});
