import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { MARKER, patchFeishuMonitor } from './patch-feishu-firsttext-msgtype.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
// Base: the Feishu monitor on dev (V's monitor + #298 card precreate)
const base = read('./release-files/feishu-card-precreate/monitor.account-WFdlCDhR.js');
const released = read('./release-files/feishu-firsttext-msgtype/monitor.account-WFdlCDhR.js');

test('release file is the dev Feishu monitor plus only this patch', () => {
  assert.equal(patchFeishuMonitor(base), released);
  assert.throws(() => patchFeishuMonitor(released), /already patched/);
});

test('the firsttext-e2e record carries message type and media kinds, nothing else new', () => {
  const start = released.indexOf('const vFirsttextE2e = {');
  const end = released.indexOf('};', start) + 2;
  const params = { sessionKey: 'k', messageCreateTimeMs: 1, vMessageType: 'media', vMediaKinds: ['video'] };
  const context = { params, chatId: 'oc', typingTargetMessageId: 'om', normalizeEpochMs: (v) => v, Date: { now: () => 5 } };
  vm.runInNewContext(`${released.slice(start, end)}\nthis.record = vFirsttextE2e;`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.record)),
    { v: 1, sessionKey: 'k', chatId: 'oc', inboundMessageId: 'om', sentAtMs: 1, dispatcherAtMs: 5, messageType: 'media', mediaKinds: ['video'] });
});

test('both dispatcher call sites pass the inbound type and attachment kinds', () => {
  const calls = released.split('vMediaKinds: ').slice(1).map((s) => s.slice(0, s.indexOf('\n')));
  assert.equal(calls.length, 2);
  assert.equal(released.split('vMessageType: ctx.contentType,').length, 3);
  for (const expr of calls) {
    const kinds = (mediaList) => vm.runInNewContext(expr, { mediaList, String });
    assert.deepEqual([...kinds([{ kind: 'video', path: '/x' }, { contentType: 'image/png' }, {}])], ['video', 'image', 'file']);
    assert.deepEqual([...kinds([])], []);
  }
  assert(released.includes(`// ${MARKER}`));
});
