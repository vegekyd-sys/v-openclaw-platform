import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { MARKER, patchFeishuMonitor } from './patch-feishu-name-swr.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
// V's Feishu monitor as captured after firsttext-r4 (2026-10-07)
const original = read('../release/captured/v2026.9.1-db91.6-firsttext-r4-20261007.feishu/dist/dist/monitor.account-WFdlCDhR.js');
const released = read('./release-files/feishu-name-swr/monitor.account-WFdlCDhR.js');

test('release file is V\'s Feishu monitor plus only the name refresh change', () => {
  assert.equal(patchFeishuMonitor(original), released);
  assert.throws(() => patchFeishuMonitor(released), /already patched/);
  assert(released.includes(MARKER));
});

// Run the real group-name and sender-name code from the release file against a fake clock and
// fake Feishu client.
function loadNameCode(source, env = {}) {
  const start = source.indexOf('//#region extensions/feishu/src/bot-group-name-state.ts');
  const end = source.indexOf('//#region extensions/feishu/src/dedup-state.ts');
  assert(start > 0 && end > start);
  const clock = { now: 1_000_000 };
  const calls = { chat: 0, user: 0 };
  const lookup = { chat: async () => ({ name: 'Group A' }), user: async () => ({ data: { user: { name: 'Alice' } } }) };
  const ctx = {
    Date: { now: () => clock.now },
    process: { env },
    asDateTimestampMs: (v) => (Number.isFinite(v) ? v : undefined),
    resolveExpiresAtMsFromDurationMs: (ms) => clock.now + ms,
    pruneMapToMaxSize: () => {},
    normalizeLowercaseStringOrEmpty: (s) => String(s ?? '').toLowerCase(),
    createFeishuClient: () => ({ contact: { user: { get: (...a) => { calls.user += 1; return lookup.user(...a); } } } }),
    getChatInfo: (...a) => { calls.chat += 1; return lookup.chat(...a); },
  };
  vm.runInNewContext(`${source.slice(start, end)}\nthis.resolveGroupName = resolveGroupName; this.resolveFeishuSenderName = resolveFeishuSenderName;`, ctx);
  return { ctx, clock, calls, lookup };
}

const account = { configured: true, accountId: 'acc' };
const log = () => {};
const tick = () => new Promise((r) => setImmediate(r));

test('an expired group name is returned at once and refreshed once in the background', async () => {
  const { ctx, clock, calls, lookup } = loadNameCode(released);
  assert.equal(await ctx.resolveGroupName({ account, chatId: 'oc_1', log }), 'Group A');
  assert.equal(calls.chat, 1);
  clock.now += 31 * 60_000; // past the 30 min TTL
  let release;
  lookup.chat = () => { return new Promise((r) => { release = () => r({ name: 'Group B' }); }); };
  assert.equal(await ctx.resolveGroupName({ account, chatId: 'oc_1', log }), 'Group A');
  assert.equal(await ctx.resolveGroupName({ account, chatId: 'oc_1', log }), 'Group A');
  assert.equal(calls.chat, 2, 'one background refresh in flight');
  release(); await tick();
  assert.equal(await ctx.resolveGroupName({ account, chatId: 'oc_1', log }), 'Group B');
  assert.equal(calls.chat, 2);
});

test('a failed background group refresh keeps the old name', async () => {
  const { ctx, clock, calls, lookup } = loadNameCode(released);
  await ctx.resolveGroupName({ account, chatId: 'oc_1', log });
  clock.now += 31 * 60_000;
  lookup.chat = async () => { throw new Error('boom'); };
  assert.equal(await ctx.resolveGroupName({ account, chatId: 'oc_1', log }), 'Group A');
  await tick();
  assert.equal(await ctx.resolveGroupName({ account, chatId: 'oc_1', log }), 'Group A');
  assert.equal(calls.chat, 3);
});

test('another group\'s lookup does not evict a recently expired name', async () => {
  const { ctx, clock, calls } = loadNameCode(released);
  await ctx.resolveGroupName({ account, chatId: 'oc_1', log });
  clock.now += 31 * 60_000;
  await ctx.resolveGroupName({ account, chatId: 'oc_2', log }); // runs the eviction pass
  const before = calls.chat;
  assert.equal(await ctx.resolveGroupName({ account, chatId: 'oc_1', log }), 'Group A');
  assert.equal(calls.chat, before + 1, 'served stale, refreshed in background');
});

test('an expired sender name is returned at once and refreshed in the background', async () => {
  const { ctx, clock, calls, lookup } = loadNameCode(released);
  assert.deepEqual({ ...(await ctx.resolveFeishuSenderName({ account, senderId: 'ou_1', log })) }, { name: 'Alice' });
  clock.now += 11 * 60_000; // past the 10 min TTL
  let release;
  lookup.user = () => { return new Promise((r) => { release = () => r({ data: { user: { name: 'Alice2' } } }); }); };
  assert.deepEqual({ ...(await ctx.resolveFeishuSenderName({ account, senderId: 'ou_1', log })) }, { name: 'Alice' });
  assert.deepEqual({ ...(await ctx.resolveFeishuSenderName({ account, senderId: 'ou_1', log })) }, { name: 'Alice' });
  assert.equal(calls.user, 2);
  release(); await tick();
  assert.deepEqual({ ...(await ctx.resolveFeishuSenderName({ account, senderId: 'ou_1', log })) }, { name: 'Alice2' });
});

test('first lookups and entries older than the 24 h window still wait, as before', async () => {
  const { ctx, clock, calls } = loadNameCode(released);
  await ctx.resolveFeishuSenderName({ account, senderId: 'ou_1', log });
  assert.equal(calls.user, 1);
  clock.now += 25 * 3600_000;
  let settled = false;
  const p = ctx.resolveFeishuSenderName({ account, senderId: 'ou_1', log }).then((r) => { settled = true; return r; });
  assert.equal(calls.user, 2);
  assert.deepEqual({ ...(await p) }, { name: 'Alice' });
  assert(settled);
});

test('OPENCLAW_FEISHU_NAME_SWR=0 restores the blocking lookup', async () => {
  const { ctx, clock, calls, lookup } = loadNameCode(released, { OPENCLAW_FEISHU_NAME_SWR: '0' });
  await ctx.resolveGroupName({ account, chatId: 'oc_1', log });
  clock.now += 31 * 60_000;
  lookup.chat = async () => ({ name: 'Group B' });
  assert.equal(await ctx.resolveGroupName({ account, chatId: 'oc_1', log }), 'Group B');
  assert.equal(calls.chat, 2);
});
