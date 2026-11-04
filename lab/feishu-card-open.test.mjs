import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { FILES, V_MODEL_CARD, vPartialFeishuCard, nativeFeishuCardText, openNativeFeishuCard, patchMonitor, patchReplyDelivery } from './patch-feishu-card-open.mjs';
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
  assert.match(monitor, /if \(cleaned\.trimStart\(\)\.startsWith\("\{"\)\) \{\n\t+vStreamModelCard\(cleaned\);/);
  assert.match(monitor, /async vCloseWithModelCard\(card\)/);
  assert.match(monitor, /if \(vModelCard && \(streaming\?\.isActive\(\) \|\| streamingStartPromise\)\)/);
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

test('the reply-card reference shows exactly the layouts the candidate sends to Feishu', async () => {
  const { PATTERNS, replyCardsReference } = await import('./feishu-card-ui-patterns.mjs');
  const skill = fs.readFileSync(new URL('./feishu-card-ui/reply-cards.md', import.meta.url), 'utf8');
  assert.equal(skill, replyCardsReference());
  for (const card of Object.values(PATTERNS)) {
    assert.ok(skill.includes(JSON.stringify(card)));
    assert.deepEqual(JSON.parse(JSON.stringify(openNativeFeishuCard(card))), card);
    assert.ok(Buffer.byteLength(JSON.stringify(card)) < 30720);
  }
});

test('a half-written card shows its header and every finished element, nothing else', () => {
  const card = JSON.stringify({ schema: '2.0', config: { width_mode: 'fill' }, header: { title: { tag: 'plain_text', content: '标题 {不是对象}' } }, body: { elements: [
    { tag: 'markdown', content: 'a "}" ] b \\ c' }, { tag: 'chart', chart_spec: { data: { values: [{ x: 1 }] } } }, { tag: 'hr' },
  ] } });
  assert.equal(vPartialFeishuCard('好的'), null);
  assert.equal(vPartialFeishuCard(card.slice(0, 40)), null);
  const counts = [];
  for (let n = 1; n <= card.length; n++) {
    const p = vPartialFeishuCard(card.slice(0, n));
    if (p && p.count !== counts.at(-1)) counts.push(p.count);
    if (p) assert.equal(p.card.config.streaming_mode, true);
  }
  assert.deepEqual(counts, [1, 2, 3, 4]);
  const done = vPartialFeishuCard(card);
  assert.deepEqual(done.card.body.elements, JSON.parse(card).body.elements);
  assert.deepEqual(done.card.header, JSON.parse(card).header);
  const headerOnly = vPartialFeishuCard(card.slice(0, card.indexOf('"body"')));
  assert.deepEqual(headerOnly.card.body.elements, [{ tag: 'markdown', content: '…' }]);
});
