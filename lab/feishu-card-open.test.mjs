import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { FILES, V_MODEL_CARD, nativeFeishuCardText, openNativeFeishuCard, patchMonitor, patchReplyDelivery } from './patch-feishu-card-open.mjs';
import { DEMO_CARD } from './candidate/feishu-card-open.mjs';

const read = (f) => fs.readFileSync(new URL(`../${f.base}/${f.name}`, import.meta.url), 'utf8');
const [replyFile, monitorFile] = FILES;

test('every taught component survives; the card is a copy marked as model-written', () => {
  const card = openNativeFeishuCard(DEMO_CARD);
  assert.deepEqual(JSON.parse(JSON.stringify(card)), DEMO_CARD);
  assert.notEqual(card, DEMO_CARD);
  assert.equal(card[V_MODEL_CARD], true);
  assert.equal(JSON.stringify(card).includes('modelCard'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(openNativeFeishuCard({ type: 'interactive', card: DEMO_CARD }))), DEMO_CARD);
});

test('v1, template and empty cards', () => {
  assert.ok(openNativeFeishuCard({ elements: [{ tag: 'div', text: { tag: 'lark_md', content: 'v1' } }] }));
  assert.ok(openNativeFeishuCard({ type: 'template', data: { template_id: 'AAq' } }));
  assert.equal(openNativeFeishuCard({ a: 1 }), undefined);
  assert.equal(openNativeFeishuCard({ schema: '2.0', body: { elements: [] } }), undefined);
});

test('fallback text keeps the title, the prose and the table, and drops the chart', () => {
  const text = nativeFeishuCardText(DEMO_CARD);
  assert.match(text, /^\*\*【测试】卡片组件自检\*\*/);
  assert.match(text, /彩色字/);
  assert.match(text, /\| 名称 \| 价格 \|\n\| --- \| --- \|\n\| A \| 99 \|/);
  assert.match(text, /折叠的内容/);
  assert.doesNotMatch(text, /chart_spec|1月/);
});

test('patched files carry their markers once and route cards through the open path', async () => {
  const reply = patchReplyDelivery(read(replyFile));
  assert.equal(reply.split('v-feishu-card-open-v1').length, 2);
  assert.match(reply, /function sanitizeNativeFeishuCard\(card\) \{\n\treturn openNativeFeishuCard\(card\);\n\}/);
  assert.match(reply, /async function sendCardFeishuOnce\(params\)/);
  assert.match(reply, /model card rejected, sent as text/);
  const monitor = patchMonitor(read(monitorFile));
  assert.match(monitor, /if \(cleaned\.trimStart\(\)\.startsWith\("\{"\)\) return false;/);
  assert.match(monitor, /it as vReadNativeFeishuCardJson, s as vBuildFeishuPayloadCard/);
  assert.match(monitor, /const prepared = vModelCard \? \{/);
});

test('patches refuse drift and double application', () => {
  const reply = read(replyFile), monitor = read(monitorFile);
  assert.throws(() => patchReplyDelivery(patchReplyDelivery(reply)), /already patched/);
  assert.throws(() => patchMonitor(patchMonitor(monitor)), /already patched/);
  assert.throws(() => patchReplyDelivery(reply.replace('async function sendCardFeishu(params) {', 'async function sendCardFeishu(p) {')), /anchor drift/);
  assert.throws(() => patchMonitor(monitor.replace('if (!cleaned) return false;', '')), /anchor drift/);
});

test('release files are the builder output from V bytes', async () => {
  const { build } = await import('./build-feishu-card-open.mjs');
  for (const f of build({ write: false })) {
    assert.equal(createHash('sha256').update(fs.readFileSync(new URL(`../${f.source}`, import.meta.url))).digest('hex'), f.after, f.source);
  }
});
