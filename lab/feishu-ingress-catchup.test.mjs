import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { CATCHUP_MODULE, MARKER, patchFeishuMonitor } from './patch-feishu-ingress-catchup.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
// Base: the Feishu monitor on V and shared VLab (31238429… = feishu-empty-card-discard).
const base = read('./release-files/feishu-empty-card-discard/monitor.account-WFdlCDhR.js');
const patched = read('./release-files/feishu-ingress-catchup/monitor.account-WFdlCDhR.js');

const BOT = 'ou_bot';
// objects built inside the vm context have that realm's prototypes
const plain = (v) => JSON.parse(JSON.stringify(v));
const T0 = 1_792_000_000_000;

test('release file is V\'s Feishu monitor plus only this patch', () => {
  assert.equal(patchFeishuMonitor(base), patched);
  assert.throws(() => patchFeishuMonitor(patched), /already patched/);
  assert(patched.includes(CATCHUP_MODULE));
  // every lifecycle hook and the wiring landed once
  assert.equal(patched.split('vFeishuIngressCatchups.get(accountId)?.connectionDown()').length, 4);
  assert.equal(patched.split('vFeishuIngressCatchups.get(accountId)?.connectionUp()').length, 2);
  assert.equal(patched.split('vIngressCatchup?.start();').length, 2);
  assert.equal(patched.split('vIngressCatchup?.stop();').length, 2);
});

// Run the real catch-up module against a fake clock, fake timers, a fake Feishu message list and
// a dedupe store with the real store's claim/commit/forget/hasRecent semantics.
function harness({ env = {}, listed = {}, failInvoke = false, store = new Map() } = {}) {
  const clock = { now: T0 };
  const timers = [];
  let interval = null;
  const invoked = [];
  const forwarded = [];
  const lists = [];
  const logs = [];
  const context = {
    process: { env },
    Date, Math, Number, String, Boolean, Array, Map, Set, Promise, Error, JSON, isFinite,
    console,
    setTimeout: (fn, ms) => { const t = { fn, at: clock.now + ms, unref() {} }; timers.push(t); return t; },
    clearTimeout: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
    setInterval: (fn) => { interval = fn; return { unref() {} }; },
    clearInterval: () => { interval = null; },
    isRecord$1: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
    parseRawEnvelope: (raw) => JSON.parse(raw),
    decryptEnvelope: (envelope) => envelope,
    normalizeNullableString: (v) => (typeof v === 'string' && v.trim() ? v.trim() : null),
    botOpenIds: new Map([['default', BOT]]),
    resolveFeishuMessageDedupeKey: (event) => `text:${event.message.message_id}:${event.message.content}`,
    hasProcessedFeishuMessage: async (key) => store.has(key),
    finalizeFeishuMessageProcessing: async ({ messageId }) => { store.set(messageId, true); return true; },
    forgetProcessedFeishuMessage: async (key) => store.delete(key),
    createFeishuClient: () => { throw new Error('tests pass listMessages'); },
  };
  vm.createContext(context);
  vm.runInContext(`${CATCHUP_MODULE}\nthis.create = createVFeishuIngressCatchup; this.registry = vFeishuIngressCatchups;`, context);
  const catchup = context.create({
    account: { appId: 'cli_x' },
    accountId: 'default',
    runtime: { log: (m) => logs.push(m), error: (m) => logs.push(`ERR ${m}`) },
    invoke: async (envelope) => {
      if (failInvoke) throw new Error('ingress is stopped');
      invoked.push(envelope);
    },
    listMessages: async (params) => {
      lists.push(params);
      const items = (listed[params.container_id] ?? []).filter((item) => {
        const s = Math.floor(Number(item.create_time) / 1000);
        return s >= Number(params.start_time) && s <= Number(params.end_time);
      });
      return { code: 0, data: { items, has_more: false } };
    },
    now: () => clock.now,
  });
  const push = catchup.wrapInvoke(async (data) => { forwarded.push(data.header.event_id); });
  const fire = async (ms) => {
    clock.now += ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= clock.now).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers.splice(timers.indexOf(due), 1);
      await due.fn();
    }
    await new Promise((r) => setImmediate(r));
  };
  return { catchup, push, fire, clock, invoked, forwarded, lists, logs, store, tick: () => interval?.(), registry: context.registry };
}

const pushed = (id, chatId, chatType, at, mentions = []) => ({
  schema: '2.0',
  header: { event_id: `ev-${id}`, event_type: 'im.message.receive_v1' },
  event: {
    sender: { sender_id: { open_id: 'ou_user' }, sender_type: 'user' },
    message: { message_id: id, chat_id: chatId, chat_type: chatType, message_type: 'text', create_time: String(at), content: '{"text":"hi"}', mentions: mentions.map((open_id) => ({ key: '@_user_1', id: { open_id }, name: 'V' })) },
  },
});
const item = (id, chatId, at, { sender = 'user', mentions = [], type = 'text' } = {}) => ({
  message_id: id, chat_id: chatId, create_time: String(at), msg_type: type, body: { content: '{"text":"hi"}' },
  sender: { id: sender === 'user' ? 'ou_user' : 'cli_other', id_type: sender === 'user' ? 'open_id' : 'app_id', sender_type: sender, tenant_key: 'tk' },
  mentions: mentions.map((id) => ({ key: '@_user_1', id, id_type: 'open_id', name: 'V' })),
});

test('after a reconnect, a message Feishu never pushed is pulled once and its re-push is dropped', async () => {
  const h = harness({ listed: { oc_dm: [item('m1', 'oc_dm', T0 + 1_000), item('m2', 'oc_dm', T0 + 90_000)] } });
  h.catchup.start();
  assert.equal(h.registry.get('default'), h.catchup);
  await h.push(pushed('m1', 'oc_dm', 'p2p', T0 + 1_000));
  assert.deepEqual(h.forwarded, ['ev-m1']);

  h.clock.now = T0 + 60_000;
  h.catchup.connectionDown();
  h.catchup.connectionDown(); // a second "down" keeps the first start of the gap
  h.clock.now = T0 + 120_000;
  h.catchup.connectionUp();
  assert.equal(h.invoked.length, 0, 'waits for buffered pushes first');
  await h.fire(5_000);

  assert.equal(h.lists.length, 1);
  assert.equal(h.lists[0].start_time, String(Math.floor((T0 + 0) / 1000)), 'window opens a margin before the gap');
  assert.equal(h.invoked.length, 1);
  const ev = h.invoked[0];
  assert.equal(ev.header.event_id, 'v-catchup-m2');
  assert.equal(ev.header.event_type, 'im.message.receive_v1');
  assert.deepEqual(plain(ev.event.sender.sender_id), { open_id: 'ou_user' });
  assert.equal(ev.event.message.chat_type, 'p2p');
  assert.equal(ev.event.message.message_type, 'text');
  assert.equal(ev.event.message.content, '{"text":"hi"}');
  assert(h.store.has('v-catchup:m2'));
  assert(h.logs.some((l) => /listed 2, injected 1, already received 1, errors 0/.test(l)), h.logs.join('\n'));

  // Feishu's re-push of m2, minutes later: acknowledged without reaching the ingress
  h.clock.now = T0 + 700_000;
  await h.push(pushed('m2', 'oc_dm', 'p2p', T0 + 90_000));
  assert.deepEqual(h.forwarded, ['ev-m1']);

  // the follow-up pass a minute later finds nothing new
  await h.fire(60_000);
  assert.equal(h.lists.length, 2);
  assert.equal(h.invoked.length, 1);
  h.catchup.stop();
  assert.equal(h.registry.get('default'), undefined);
});

test('a re-push after a restart is dropped by the persistent marker; on-time pushes skip the lookup', async () => {
  const store = new Map([['v-catchup:m9', true]]);
  const h = harness({ store });
  let lookups = 0;
  const has = store.has.bind(store);
  store.has = (k) => { lookups += 1; return has(k); };
  h.clock.now = T0 + 3_600_000;
  await h.push(pushed('m9', 'oc_g', 'group', T0, [BOT]));
  assert.deepEqual(h.forwarded, []);
  await h.push(pushed('m10', 'oc_g', 'group', h.clock.now - 2_000, [BOT]));
  assert.deepEqual(h.forwarded, ['ev-m10']);
  assert.equal(lookups, 1);
});

test('groups: only bot mentions unless the chat gets every message; never apps, deleted or system', async () => {
  const at = T0 + 30_000;
  const h = harness({ listed: {
    oc_g: [item('a', 'oc_g', at), item('b', 'oc_g', at, { mentions: [BOT] }), item('c', 'oc_g', at, { sender: 'app', mentions: [BOT] }),
      { ...item('d', 'oc_g', at, { mentions: [BOT] }), deleted: true }, item('e', 'oc_g', at, { type: 'system', mentions: [BOT] })],
    oc_all: [item('f', 'oc_all', at), item('g', 'oc_all', at, { mentions: ['ou_someone'] })],
  } });
  h.catchup.start();
  await h.push(pushed('p1', 'oc_g', 'group', T0, [BOT]));
  await h.push(pushed('p2', 'oc_all', 'group', T0, [BOT]));
  await h.push(pushed('p3', 'oc_all', 'group', T0)); // a non-mention push: Feishu sends this chat everything
  h.clock.now = T0 + 20_000;
  h.catchup.connectionDown();
  h.clock.now = T0 + 40_000;
  h.catchup.connectionUp();
  await h.fire(5_000);
  assert.deepEqual(h.invoked.map((e) => e.event.message.message_id).sort(), ['b', 'f', 'g']);
  const b = h.invoked.find((e) => e.event.message.message_id === 'b');
  assert.deepEqual(plain(b.event.message.mentions), [{ key: '@_user_1', id: { open_id: BOT }, name: 'V' }]);
  h.catchup.stop();
});

test('an event-loop stall opens a pull over the stalled time', async () => {
  const h = harness({ listed: { oc_dm: [item('s1', 'oc_dm', T0 + 30_000)] } });
  h.catchup.start();
  await h.push(pushed('s0', 'oc_dm', 'p2p', T0));
  h.clock.now = T0 + 10_000; h.tick();
  h.clock.now = T0 + 11_000; h.tick();
  assert.equal(h.lists.length, 0, 'a normal tick does nothing');
  h.clock.now = T0 + 70_000; h.tick(); // 59 s with no tick: GC freeze
  await h.fire(5_000);
  assert.equal(h.lists.length, 1);
  assert.equal(h.lists[0].start_time, String(Math.floor((T0 + 11_000 - 60_000) / 1000)));
  assert.deepEqual(h.invoked.map((e) => e.event.message.message_id), ['s1']);
  assert(h.logs.some((l) => /event loop stalled 59s/.test(l)));
  h.catchup.stop();
});

test('a failed injection leaves the message to Feishu\'s re-push', async () => {
  const h = harness({ failInvoke: true, listed: { oc_dm: [item('x1', 'oc_dm', T0 + 30_000)] } });
  h.catchup.start();
  await h.push(pushed('x0', 'oc_dm', 'p2p', T0));
  h.catchup.connectionDown();
  h.clock.now = T0 + 40_000;
  h.catchup.connectionUp();
  await h.fire(5_000);
  assert.equal(h.store.has('v-catchup:x1'), false);
  assert(h.logs.some((l) => /errors 1/.test(l)));
  h.clock.now = T0 + 600_000;
  await h.push(pushed('x1', 'oc_dm', 'p2p', T0 + 30_000));
  assert.deepEqual(h.forwarded, ['ev-x0', 'ev-x1']);
  h.catchup.stop();
});

test('nothing happens on the first connect or when the chat list is empty', async () => {
  const h = harness();
  h.catchup.start();
  h.catchup.connectionUp();
  await h.fire(10_000);
  assert.equal(h.lists.length, 0);
  h.catchup.connectionDown();
  h.clock.now += 30_000;
  h.catchup.connectionUp();
  await h.fire(5_000);
  assert.equal(h.lists.length, 0);
  assert(h.logs.some((l) => /chats 0, listed 0, injected 0/.test(l)));
  h.catchup.stop();
});

test('OPENCLAW_FEISHU_INGRESS_CATCHUP=0 and webhook mode leave the dispatcher untouched', () => {
  assert(patched.includes('const VFEISHU_INGRESS_CATCHUP_ENABLED = process.env.OPENCLAW_FEISHU_INGRESS_CATCHUP !== "0";'));
  assert(patched.includes('durableIngress && connectionMode !== "webhook" && VFEISHU_INGRESS_CATCHUP_ENABLED ? createVFeishuIngressCatchup'));
  assert(patched.includes(`// ${MARKER}`));
});
