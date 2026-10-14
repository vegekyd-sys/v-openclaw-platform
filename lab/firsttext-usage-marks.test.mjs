import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { USAGE_MARKS_MARKER, patchModelDiagnosticEvents } from './patch-firsttext-usage-marks.mjs';
import { USAGE_MARKS_FILE } from './build-firsttext-usage-marks.mjs';
import { exportRecords } from '../scripts/firsttext-daily/export-records.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (file) => fs.readFileSync(path.join(repo, file), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');

test('release file is the patched V chunk', () => {
  const original = read(USAGE_MARKS_FILE.input);
  const patched = read(USAGE_MARKS_FILE.output);
  assert.equal(sha(original), USAGE_MARKS_FILE.before);
  assert.equal(sha(patchModelDiagnosticEvents(original)), sha(patched));
  assert.throws(() => patchModelDiagnosticEvents(patched), /already patched/);
  assert.equal(patched.split(USAGE_MARKS_MARKER).length - 1, 2);
  assert.equal(spawnSync(process.execPath, ['--check', path.join(repo, USAGE_MARKS_FILE.output)]).status, 0);
});

function extract(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `cannot extract ${start}`);
  return source.slice(from, to);
}

test('model-call-ended mark carries token counts and request bytes, nothing else', () => {
  const patched = read(USAGE_MARKS_FILE.output);
  const helpers = extract(patched, 'function firstTextUsageFields(', 'function firstTextMetricChunk(');
  const lines = [];
  const consoleStub = { error: (line) => lines.push(line) };
  const { firstTextUsageFields, firstTextMetric } = new Function('console', `${helpers}; return { firstTextUsageFields, firstTextMetric };`)(consoleStub);
  const endedCall = extract(patched, " firstTextMetric(observer.state,'model-call-ended'", ');') + ');';
  const emit = new Function('observer', 'failure', 'firstTextMetric', 'firstTextUsageFields', endedCall);
  const state = {
    firstTextMetricBase: { runId: 'r1', callId: 'r1:model:1', provider: 'deepseek', model: 'deepseek-flash' },
    usage: { input: 1200, output: 340, cacheRead: 812000, cacheWrite: 0, totalTokens: 813540, promptTokens: 813200 },
    requestPayloadBytes: 3100000,
  };
  emit({ state }, undefined, firstTextMetric, firstTextUsageFields);
  assert.equal(lines.length, 1);
  const mark = JSON.parse(lines[0].replace('[firsttext-metrics] ', ''));
  assert.equal(mark.stage, 'model-call-ended');
  assert.equal(mark.failed, false);
  assert.deepEqual({ input: mark.input, cacheRead: mark.cacheRead, cacheWrite: mark.cacheWrite, output: mark.output, requestBytes: mark.requestBytes },
    { input: 1200, cacheRead: 812000, cacheWrite: 0, output: 340, requestBytes: 3100000 });
  assert.equal(mark.totalTokens, undefined);
  // A call that failed before any usage arrived keeps the old shape.
  lines.length = 0;
  emit({ state: { firstTextMetricBase: state.firstTextMetricBase } }, { error: new Error('x') }, firstTextMetric, firstTextUsageFields);
  const failed = JSON.parse(lines[0].replace('[firsttext-metrics] ', ''));
  assert.equal(failed.failed, true);
  assert.equal(failed.input, undefined);
});

test('daily export keeps the first model request size and usage per run', () => {
  const line = (tag, value) => `x [${tag}] ${JSON.stringify(value)}`;
  const text = [
    line('firsttext-e2e.1', { runId: 'r1', sentAtMs: 1, sessionKey: 'agent:makaron:feishu:group:oc_x', agentRuntime: 'vlab-worker' }),
    line('firsttext-metrics', { runId: 'r1', at: 20, stage: 'payload-ready', inputItems: 900, toolCount: 102 }),
    line('firsttext-metrics', { runId: 'r1', at: 10, stage: 'payload-ready', inputItems: 812, toolCount: 102 }),
    line('firsttext-metrics', { runId: 'r1', at: 30, stage: 'model-call-ended', failed: false, input: 5000, cacheRead: 0, output: 9 }),
    line('firsttext-metrics', { runId: 'r1', at: 15, stage: 'model-call-ended', failed: false, input: 12, cacheRead: 800000, output: 300, requestBytes: 3000000 }),
    line('firsttext-e2e.1', { runId: 'r2', sentAtMs: 1 }),
  ].join('\n');
  const [r1, r2] = exportRecords(text);
  assert.deepEqual(r1.payload, { inputItems: 812, toolCount: 102, input: 12, cacheRead: 800000, output: 300, requestBytes: 3000000 });
  assert.equal(r2.payload, undefined);
});
