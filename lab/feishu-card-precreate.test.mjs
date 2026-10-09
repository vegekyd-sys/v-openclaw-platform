import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { MARKER, patchFeishuMonitor } from './patch-feishu-card-precreate.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
// V's Feishu monitor as live since release-batch-20261009 (same bytes as feishu-firsttext-e2e)
const original = read('../release/captured/release-batch-20261009.feishu/dist/dist/monitor.account-WFdlCDhR.js');
const released = read('./release-files/feishu-card-precreate/monitor.account-WFdlCDhR.js');

test('release file is V\'s Feishu monitor plus only the precreate patch', () => {
  assert.equal(original, read('./release-files/feishu-firsttext-e2e/monitor.account-WFdlCDhR.js'));
  assert.equal(patchFeishuMonitor(original), released);
  assert.throws(() => patchFeishuMonitor(released), /already patched/);
});

// Run the patched FeishuStreamingSession against a fake Feishu API that records call order.
function loadSession({ sendFails = false, putFails = false } = {}) {
  const start = released.indexOf('var FeishuStreamingSession = class {');
  const end = released.indexOf('\n};\n', start) + 4;
  const calls = [];
  let cards = 0;
  const pending = [];
  const later = (value) => new Promise((resolve) => pending.push(() => resolve(value)));
  const context = {
    performance, JSON, Math, Error, Boolean, String, Promise, process: { env: {} },
    VFEISHU_CARD_PRECREATE_ENABLED: true,
    STREAMING_UPDATE_THROTTLE_MS: 160,
    resolveApiBase: () => 'https://api',
    getToken: async () => 't',
    getFeishuUserAgent: () => 'ua',
    resolveAllowedHostnames: () => [],
    resolveFeishuCardTemplate: (t) => t,
    resolveStreamingCardSendMode: () => 'reply',
    cancelUnreadResponseBody: () => {},
    shouldPushStreamingUpdate: () => true,
    fetchWithSsrFGuard: async ({ url, init }) => {
      const body = JSON.parse(init.body);
      if (url.endsWith('/cardkit/v1/cards')) {
        calls.push('create');
        return { response: { ok: true, card: `card-${++cards}` }, release: async () => {} };
      }
      calls.push(`put:${JSON.parse(body.element ?? '{}').content ?? body.content}:${body.sequence}`);
      return { response: await later({ ok: !putFails }), release: async () => {} };
    },
    readFeishuJsonResponse: async (res) => ({ code: 0, data: { card_id: res.card } }),
    assertSuccessfulCardKitResponse: async (res) => { if (!res.ok) throw new Error('put failed'); },
    requestFeishuApi: async (fn) => fn(),
  };
  vm.runInNewContext(`${released.slice(start, end)}\nthis.FeishuStreamingSession = FeishuStreamingSession;`, context);
  const client = { im: { message: { reply: async () => {
    calls.push('send');
    const res = await later(sendFails ? { code: 1, msg: 'nope' } : { code: 0, data: { message_id: 'om_1' } });
    calls.push('send-done');
    return res;
  } } } };
  const flush = async () => { while (pending.length) { pending.shift()(); await new Promise((r) => setImmediate(r)); } };
  const session = new context.FeishuStreamingSession(client, {}, () => {});
  return { session, calls, flush };
}

test('a precreated card skips create and writes the first text while the message is sent', async () => {
  const { session, calls, flush } = loadSession();
  const started = session.start('oc_1', 'chat_id', { replyToMessageId: 'om_0', note: 'n', precreatedCardId: 'pre-1', initialText: () => 'hello' });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual([...calls].sort(), ['put:hello:2', 'send'], 'PUT and send are both in flight before either returns');
  await flush();
  await started;
  assert.equal(session.state.cardId, 'pre-1');
  assert.equal(session.state.messageId, 'om_1');
  assert.equal(session.state.sentText, 'hello');
  await session.update('hello');
  assert.equal(calls.filter((c) => c.startsWith('put')).length, 1, 'the flush after start does not resend the same text');
});

test('without a precreated card it creates first, then still overlaps text and send', async () => {
  const { session, calls, flush } = loadSession();
  const started = session.start('oc_1', 'chat_id', { replyToMessageId: 'om_0', note: 'n', initialText: () => 'hi' });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual([calls[0], ...calls.slice(1).sort()], ['create', 'put:hi:2', 'send']);
  await flush();
  await started;
  assert.equal(session.state.cardId, 'card-1');
});

test('empty first text only sends; a failed first PUT leaves the text for the next update', async () => {
  const a = loadSession();
  const s1 = a.session.start('oc_1', 'chat_id', { replyToMessageId: 'om_0', precreatedCardId: 'pre', initialText: () => '' });
  await a.flush(); await s1;
  assert.deepEqual(a.calls, ['send', 'send-done']);
  const b = loadSession({ putFails: true });
  const s2 = b.session.start('oc_1', 'chat_id', { replyToMessageId: 'om_0', precreatedCardId: 'pre', initialText: () => 'x' });
  await b.flush(); await s2;
  assert.equal(b.session.state.sentText, '');
});

test('a failed send leaves no half-started state behind', async () => {
  const { session, flush } = loadSession({ sendFails: true });
  const started = session.start('oc_1', 'chat_id', { replyToMessageId: 'om_0', precreatedCardId: 'pre', initialText: () => 'x' });
  const outcome = started.then(() => 'ok', (e) => e.message);
  await flush();
  assert.match(await outcome, /Send card failed/);
  assert.equal(session.state, null);
});

test('dispatcher precreates on reply start only outside card mode and hands the entity to the first card', () => {
  const at = released.indexOf('else if (previewStreamingEnabled) vPrecreateCard();');
  assert(at > 0);
  assert(released.lastIndexOf('onReplyStart: async () => {', at) > released.lastIndexOf('const vPrecreateCard = () => {', at));
  const startStreaming = released.indexOf('const startStreaming = () => {', released.indexOf(`// ${MARKER}: one card entity per reply`));
  const take = released.indexOf('const precreated = await vTakePrecreatedCard(cardHeader);', startStreaming);
  const startCall = released.indexOf('await session.start(streamingTarget', startStreaming);
  assert(take > startStreaming && take < startCall, 'the first await in startStreaming comes before start() reads the text');
  assert(released.indexOf('initialText: () => buildCombinedStreamText(reasoningText, streamText)', startCall) - startCall < 400);
});

// V 2026-10-10 00:24: the note refresh went through the streaming content endpoint and the footer was
// typed out character by character. It must replace the whole note component instead.
function loadNoteRefresh() {
  const fixStart = released.indexOf('if (precreated && precreated.note !== cardNote) session.queue = session.queue.then(() => {');
  const fixEnd = released.indexOf('card note refresh failed: ${String(error)}`));', fixStart);
  assert(fixStart > 0 && fixEnd > fixStart, 'note refresh not found');
  const fix = released.slice(fixStart, fixEnd + 'card note refresh failed: ${String(error)}`));'.length);
  const helperStart = released.indexOf('async function vAskCardKitWrite(session, state, suffix, payload) {');
  const helperEnd = released.indexOf('\n}\n', helperStart) + 3;
  const calls = [];
  const logs = [];
  const context = {
    JSON, String, Promise,
    resolveApiBase: () => 'https://api',
    getToken: async () => 't',
    getFeishuUserAgent: () => 'ua',
    resolveAllowedHostnames: () => [],
    fetchWithSsrFGuard: async ({ url, init }) => { calls.push({ url, method: init.method, body: JSON.parse(init.body) }); return { response: { ok: true }, release: async () => {} }; },
    assertSuccessfulCardKitResponse: async () => {},
    pushLog: (m) => logs.push(m),
  };
  vm.runInNewContext(`${released.slice(helperStart, helperEnd)}
this.refresh = async (precreated, cardNote, session) => {
  const params = { runtime: { log: pushLog } };
  const account = { accountId: 'default' };
  ${fix}
  await session.queue;
};`, context);
  return { refresh: context.refresh, calls, logs };
}

test('a stale precreated note is replaced as a whole component, never streamed into the content endpoint', async () => {
  const { refresh, calls, logs } = loadNoteRefresh();
  let streamed = 0;
  const session = { queue: Promise.resolve(), creds: { domain: 'feishu' }, state: { cardId: 'card-1', hasNote: true, sequence: 4 }, updateNoteContent: async () => { streamed += 1; } };
  const full = 'Agent: V × Makaron | Model: deepseek-flash | Provider: deepseek | Runtime: vlab-worker';
  await refresh({ cardId: 'card-1', note: 'Agent: V × Makaron' }, full, session);
  assert.deepEqual(logs, []);
  assert.equal(streamed, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api/cardkit/v1/cards/card-1/elements/note');
  assert(!calls[0].url.endsWith('/content'));
  assert.equal(calls[0].method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].body.element), { tag: 'markdown', element_id: 'note', content: `<font color='grey'>${full}</font>` });
  assert.equal(calls[0].body.sequence, 5);
  assert.equal(session.state.sequence, 5);
});

test('note refresh: nothing when the note is already right or the card has no note; an inline question keeps its own whole-component write', async () => {
  const { refresh, calls } = loadNoteRefresh();
  const mk = (over = {}) => ({ queue: Promise.resolve(), state: { cardId: 'c', hasNote: true, sequence: 0 }, updates: [], updateNoteContent(n) { this.updates.push(n); }, ...over });
  const same = mk();
  await refresh({ cardId: 'c', note: 'N' }, 'N', same);
  await refresh(null, 'N', same);
  const noNote = mk({ state: { cardId: 'c', hasNote: false, sequence: 0 } });
  await refresh({ cardId: 'c', note: 'old' }, 'new', noNote);
  assert.equal(calls.length, 0);
  assert.deepEqual([...same.updates, ...noNote.updates], []);
  const asked = mk({ vAskAttached: true });
  await refresh({ cardId: 'c', note: 'old' }, 'new', asked);
  assert.deepEqual(asked.updates, ['new']);
  assert.equal(calls.length, 0);
});

test('a failed note refresh is logged and does not break the write queue', async () => {
  const { refresh, logs } = loadNoteRefresh();
  const session = { queue: Promise.resolve(), state: null, get vAskAttached() { throw new Error('boom'); } };
  session.state = { cardId: 'c', hasNote: true, sequence: 0 };
  await refresh({ cardId: 'c', note: 'old' }, 'new', session);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /card note refresh failed/);
  await session.queue;
});
