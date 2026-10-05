import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { patchFeishuMonitor } from './patch-feishu-firsttext-e2e.mjs';
import { parseRecords, measure, report, percentile } from '../scripts/firsttext-e2e-report.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
const original = read('../release/captured/v2026.9.1-db91.6-gpt-live-voice-20261005.feishu/dist/dist/monitor.account-WFdlCDhR.js');
const released = read('./release-files/feishu-firsttext-e2e/monitor.account-WFdlCDhR.js');

test('release file is V\'s Feishu monitor with only the firsttext-e2e marks', () => {
  assert.equal(patchFeishuMonitor(original), released);
  assert.throws(() => patchFeishuMonitor(released), /Expected exactly one/);
  // every mark the report reads is recorded somewhere
  for (const key of ['runStartAtMs', 'typingShownAtMs', 'firstReasoningAtMs', 'firstAnswerTokenAtMs', 'cardStartAtMs', 'cardCreatedAtMs', 'firstPushAtMs', 'firstAnswerPushAtMs', 'visibleAtMs']) {
    assert.match(released, new RegExp(`vFirsttextMark\\("${key}"\\)`), key);
  }
  assert.match(released, /onAgentRunStart: \(runId\) => \{\n\t*if \(typeof runId === "string" && vFirsttextE2e\.runId === void 0\) vFirsttextE2e\.runId = runId;/);
  // the log line can never throw into the reply path and carries no message text
  const emit = released.slice(released.indexOf('[firsttext-e2e.1]') - 200, released.indexOf('[firsttext-e2e.1]') + 300);
  assert.match(emit, /try \{\n\t*log\("\[firsttext-e2e\.1\] "/);
  assert.doesNotMatch(emit, /ctx\.content|rawText|BodyForAgent/);
});

const t0 = 1_791_180_161_300;
const sample = {
  v: 1, sessionKey: 'agent:makaron:feishu:group:oc_x', chatId: 'oc_x', inboundMessageId: 'om_1',
  sentAtMs: t0, receivedAtMs: t0 + 458, dispatcherAtMs: t0 + 470, typingShownAtMs: t0 + 900,
  firstAnswerTokenAtMs: t0 + 2900, cardStartAtMs: t0 + 2905, cardCreatedAtMs: t0 + 4268,
  firstPushAtMs: t0 + 4780, firstAnswerPushAtMs: t0 + 4780, endAtMs: t0 + 5400,
  agentRuntime: 'vlab-worker', model: 'deepseek-flash', queuedFinal: true, finalCount: 1,
};

test('a record measures from the user\'s send time and splits the segments', () => {
  const m = measure(sample);
  assert.equal(m.firstVisibleMs, 4780);
  assert.equal(m.firstAnswerMs, 4780);
  assert.equal(m.inboundMs, 458);
  assert.equal(m.agentMs, 2900 - 458);
  assert.equal(m.deliveryMs, 4780 - 2900);
  assert.equal(m.cardCreateMs, 4268 - 2905);
  assert.equal(m.chat, 'group');
});

test('reasoning shown first counts as first visible, the answer is measured separately', () => {
  const m = measure({ ...sample, firstReasoningAtMs: t0 + 1500, firstPushAtMs: t0 + 3200, firstAnswerPushAtMs: t0 + 6000 });
  assert.equal(m.firstVisibleMs, 3200);
  assert.equal(m.firstAnswerMs, 6000);
  assert.equal(m.reasoningMs, 1500 - 458);
  assert.equal(m.agentMs, 2900 - 458);
  assert.equal(m.deliveryMs, 6000 - 2900);
});

test('a status line pushed before the answer is visible but is not 首字', () => {
  const m = measure({ ...sample, firstPushAtMs: t0 + 1200, firstAnswerPushAtMs: t0 + 4780 });
  assert.equal(m.firstVisibleMs, 1200);
  assert.equal(m.firstAnswerMs, 4780);
  assert.equal(m.deliveryMs, 4780 - 2900);
  assert.equal(m.cardReadyBeforeAnswer, false);
});

test('a non-streaming reply counts through its visible time', () => {
  const m = measure({ ...sample, firstPushAtMs: undefined, firstAnswerPushAtMs: undefined, cardStartAtMs: undefined, cardCreatedAtMs: undefined, visibleAtMs: t0 + 3500 });
  assert.equal(m.firstVisibleMs, 3500);
  assert.equal(m.firstAnswerMs, 3500);
});

test('journal lines parse, broken lines are skipped, percentiles interpolate', () => {
  const text = [
    `2026-10-05T14:02:46.700+08:00 [feishu] feishu[default]: dispatch complete (queuedFinal=true, replies=1)`,
    `2026-10-05T14:02:46.701+08:00 [firsttext-e2e.1] ${JSON.stringify(sample)}`,
    `2026-10-05T14:02:47.000+08:00 [firsttext-e2e.1] {broken`,
    `[firsttext-e2e.1] ${JSON.stringify({ ...sample, firstPushAtMs: t0 + 9000, firstAnswerPushAtMs: t0 + 9000 })}`,
  ].join('\n');
  const records = parseRecords(text);
  assert.equal(records.length, 2);
  const out = report(records);
  assert.equal(out.firstVisible.n, 2);
  assert.equal(out.firstAnswer.max, 9000);
  assert.equal(out.byHarness['vlab-worker/deepseek-flash'].n, 2);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(percentile([], 0.5), undefined);
});
