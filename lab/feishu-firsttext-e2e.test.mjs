import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { patchFeishuMonitor } from './patch-feishu-firsttext-e2e.mjs';
import { parseRecords, parseModelMetrics, measure, report, percentile, isInterSession } from '../scripts/firsttext-e2e-report.mjs';

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
  assert.equal(m.preDispatchMs, 12);
  assert.equal(m.dispatchToRunMs, undefined);
  assert.equal(measure({ ...sample, runStartAtMs: t0 + 880 }).dispatchToRunMs, 410);
  assert.equal(m.agentMs, 2900 - 458);
  assert.equal(m.deliveryMs, 4780 - 2900);
  assert.equal(m.cardCreateMs, 4268 - 2905);
  assert.equal(m.chat, 'group');
});

test('reasoning shown first counts as first visible, the answer is measured separately', () => {
  const m = measure({ ...sample, firstReasoningAtMs: t0 + 1500, firstPushAtMs: t0 + 3200, firstAnswerPushAtMs: t0 + 6000 });
  assert.equal(m.firstVisibleMs, 3200);
  assert.equal(m.firstAnswerMs, 6000);
  assert.equal(m.firstTextMs, 6000);
  assert.equal(m.reasoningMs, 1500 - 458);
  assert.equal(m.agentMs, 2900 - 458);
  assert.equal(m.deliveryMs, 6000 - 2900);
});

test('a status line pushed before the answer counts as 首字 (inferred for older records)', () => {
  const m = measure({ ...sample, firstPushAtMs: t0 + 1200, firstAnswerPushAtMs: t0 + 4780 });
  assert.equal(m.firstVisibleMs, 1200);
  assert.equal(m.firstTextMs, 1200);
  assert.equal(m.statusFirst, true);
  assert.equal(m.firstAnswerMs, 4780);
  assert.equal(m.deliveryMs, 4780 - 2900);
  assert.equal(m.cardReadyBeforeAnswer, false);
});

test('text written before a tool call is delivered as a block, so the partial-reply mark is not its text time', () => {
  // the first answer push carries the pre-tool text; onPartialReply only fires for the final answer
  const r = { ...sample, firstAnswerTokenAtMs: t0 + 40_000, firstPushAtMs: t0 + 4780, firstAnswerPushAtMs: t0 + 4780 };
  const withModel = measure(r, { firstTextAt: t0 + 4100, textCallEnterAt: t0 + 1000, firstCallEnterAt: t0 + 1000 });
  assert.equal(withModel.deliveryMs, 4780 - 4100);
  assert.equal(withModel.agentMs, 4100 - 458);
  assert.equal(withModel.cardReadyBeforeAnswer, false);
  // without the Worker's mark there is no text time before the push: leave it out, never negative
  assert.equal(measure(r).deliveryMs, undefined);
  // the earlier of the two marks wins either way
  assert.equal(measure(sample, { firstTextAt: t0 + 3500, textCallEnterAt: t0 + 1000, firstCallEnterAt: t0 + 1000 }).deliveryMs, 4780 - 2900);
});

test('the recorded status push wins over the inference', () => {
  const m = measure({ ...sample, firstReasoningAtMs: t0 + 900, firstPushAtMs: t0 + 1000, firstStatusPushAtMs: t0 + 2000, firstAnswerPushAtMs: t0 + 4780 });
  assert.equal(m.firstTextMs, 2000);
  assert.equal(m.statusFirst, true);
});

test('reasoning before the first push is not taken for a status line', () => {
  const m = measure({ ...sample, firstReasoningAtMs: t0 + 900, firstPushAtMs: t0 + 1000, firstAnswerPushAtMs: t0 + 4780 });
  assert.equal(m.firstVisibleMs, 1000);
  assert.equal(m.firstTextMs, 4780);
  assert.equal(m.statusFirst, false);
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
  assert.equal(out.firstText.max, 9000);
  assert.equal(out.statusFirst, 0);
  assert.equal(out.byHarness['vlab-worker/deepseek-flash'].n, 2);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(percentile([], 0.5), undefined);
});

const runId = '6101061d-305d-4139-9cc3-5a1b04d543cf';
const metric = (callId, stage, at) => `[firsttext-metrics] ${JSON.stringify({ runId, callId, provider: 'deepseek', model: 'deepseek-flash', at, pid: 7, stage })}`;

test('model time is split out of 首字 by joining the Worker\'s model-call lines on runId', () => {
  const text = [
    metric('c1', 'model-call-enter', t0 + 1200),
    metric('c1', 'first-decoded-event', t0 + 1700),
    metric('c1', 'first-thinking-event', t0 + 1700),
    metric('c1', 'first-thinking-event', t0 + 1800), // repeated stage keeps the first time
    metric('c1', 'first-nonempty-text', t0 + 2850),
    `[firsttext-metrics] {broken`,
  ].join('\n');
  const models = parseModelMetrics(text);
  const m = measure({ ...sample, runId }, models.get(runId));
  assert.equal(m.toModelMs, 1200);
  assert.equal(m.modelFirstEventMs, 500);
  assert.equal(m.modelToTextMs, 1650);
  assert.equal(m.afterTextMs, 4780 - 2850);
  assert.equal(m.overheadMs, 4780 - 1650);
  assert.equal(m.overheadNoToolsMs, 4780 - 1650);
  const out = report([{ ...sample, runId }, sample], models);
  assert.equal(out.overhead.n, 1);
  assert.equal(out.model.modelToTextMs.p50, 1650);
});

test('a tool call before the answer stays in overhead and is left out of the no-tools figure', () => {
  const models = parseModelMetrics([
    metric('c1', 'model-call-enter', t0 + 1000),
    metric('c1', 'first-decoded-event', t0 + 1400),
    metric('c1', 'first-tool-event', t0 + 1500),
    metric('c2', 'model-call-enter', t0 + 2000),
    metric('c2', 'first-decoded-event', t0 + 2300),
    metric('c2', 'first-nonempty-text', t0 + 2600),
  ].join('\n'));
  const run = models.get(runId);
  assert.equal(run.calls, 2);
  const m = measure({ ...sample, runId }, run);
  assert.equal(m.toModelMs, 1000);
  assert.equal(m.modelFirstEventMs, 400);
  assert.equal(m.modelToTextMs, 600);
  assert.equal(m.overheadMs, 4780 - 600);
  assert.equal(m.overheadNoToolsMs, undefined);
});

test('without model lines the overhead is unknown, not zero', () => {
  const m = measure({ ...sample, runId }, undefined);
  assert.equal(m.overheadMs, undefined);
  assert.equal(m.toModelMs, undefined);
});

// Inter-session collaboration (docs/inter-session/design.md §2.c, §3.6 item 11): the Feishu bridge
// delivers sessions_send requests and wake-ups as synthetic inbound messages. Their record carries
// origin:"inter_session" and a preset v-a2a- runId; nobody typed them, so they are not 首字.
const a2a = { ...sample, origin: 'inter_session', attempt: 0, runId: 'v-a2a-req-s_mgk3x1a2f9c1-0', inboundMessageId: 'v-a2a-req-s_mgk3x1a2f9c1-0', firstPushAtMs: t0 + 90_000, firstAnswerPushAtMs: t0 + 90_000 };

test('an inter-session turn is recognised by its origin, its runId or its synthetic message id', () => {
  assert.equal(isInterSession(a2a), true);
  // the harness did not adopt the preset runId: the origin mark still says what it was
  assert.equal(isInterSession({ ...sample, origin: 'inter_session', runId: '6101061d-305d-4139-9cc3-5a1b04d543cf' }), true);
  // an older bridge build without the origin field
  assert.equal(isInterSession({ ...sample, runId: 'v-a2a-wake-b_mgk3x1a2f9c1-1' }), true);
  assert.equal(isInterSession({ ...sample, inboundMessageId: 'v-a2a-ask-s_x-0' }), true);
  for (const r of [sample, { ...sample, runId: '6101061d-305d-4139-9cc3-5a1b04d543cf' }, { ...sample, runId: 'DB91_HI_1_x' }, { ...sample, origin: 'user' }, {}, undefined]) {
    assert.equal(isInterSession(r), false, JSON.stringify(r));
  }
});

test('the report leaves inter-session turns out of every figure and counts them separately', () => {
  const text = [
    `[firsttext-e2e.1] ${JSON.stringify(sample)}`,
    `[firsttext-e2e.1] ${JSON.stringify(a2a)}`,
    `[firsttext-e2e.1] ${JSON.stringify({ ...a2a, origin: undefined, runId: 'v-a2a-wake-b_1-0', inboundMessageId: 'om_anchor' })}`,
  ].join('\n');
  const records = parseRecords(text);
  assert.equal(records.length, 3, '--records keeps every parsed record');
  const out = report(records);
  assert.equal(out.n, 1);
  assert.equal(out.interSessionExcluded, 2);
  assert.equal(out.firstText.max, 4780, 'the 90 s collaboration turn is not a slow 首字');
  assert.equal(out.byHarness['vlab-worker/deepseek-flash'].n, 1);
  assert.deepEqual(out.slowest.map((r) => r.inboundMessageId), ['om_1']);
  assert.equal(report([sample]).interSessionExcluded, 0);
  assert.equal(report([a2a]).n, 0);
});
