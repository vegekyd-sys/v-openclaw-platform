import test from 'node:test';
import assert from 'node:assert/strict';
import {compareDb91WriterAb, quantile, summarizeDb91WriterAbRun} from './db91-writer-ab-analysis.mjs';

function fixture(variant, overrides = {}) {
  const healthy = variant === 'candidate';
  return {
    variant,
    release: variant === 'baseline' ? 'db91-global-write-admission-v3' : 'db91-process-global-writer-v1',
    configSha256: 'same',
    workerConfigSha256: 'same-worker',
    rounds: 2,
    concurrency: 2,
    rows: Array.from({length: 4}, (_, index) => ({terminal: 'final', persisted: true, index})),
    health: [10, 20, 30, 40].map((value, index) => ({
      at: index,
      eventLoop: {delayP50Ms: healthy ? value / 2 : value, delayP99Ms: healthy ? value : value * 2},
    })),
    resources: [0, 1, 2].map(index => ({
      at: index,
      memoryCurrent: (healthy ? 900 : 1000) + index * (healthy ? 10 : 100),
      memorySwapCurrent: 0,
      gatewayRss: 500 + index,
      processes: [{pid: 100 + index, rss: 300 + index}],
    })),
    runtimeErrors: healthy ? [] : [{databaseLocked: true}],
    ...overrides,
  };
}

test('quantile uses nearest-rank values and rejects empty input', () => {
  assert.equal(quantile([40, 10, 30, 20], 0.5), 20);
  assert.equal(quantile([40, 10, 30, 20], 0.99), 40);
  assert.equal(quantile([], 0.5), null);
});

test('summary keeps P50, P99, memory, swap, Gateway, and Worker RSS separate', () => {
  const summary = summarizeDb91WriterAbRun(fixture('baseline'));
  assert.deepEqual(summary.eventLoopP50Ms, {median: 20, p95: 40, max: 40});
  assert.deepEqual(summary.eventLoopP99Ms, {median: 40, p95: 80, max: 80});
  assert.equal(summary.memory.start, 1000);
  assert.equal(summary.memory.end, 1200);
  assert.equal(summary.memory.growth, 200);
  assert.equal(summary.databaseLocked, 1);
});

test('candidate passes only when persistence, event loop, and memory all improve', () => {
  const result = compareDb91WriterAb(fixture('baseline'), fixture('candidate'));
  assert.equal(result.passed, true);
  assert.equal(result.checks.eventLoopP50Lower, true);
  assert.equal(result.checks.eventLoopP99Lower, true);
  assert.equal(result.checks.memoryPeakNotHigher, true);
});

test('zero SQLite errors cannot hide a P99 or memory regression', () => {
  const candidate = fixture('candidate');
  candidate.health = candidate.health.map(sample => ({...sample, eventLoop: {delayP50Ms: 50, delayP99Ms: 100}}));
  candidate.resources = candidate.resources.map((sample, index) => ({...sample, memoryCurrent: 1000 + index * 500}));
  const result = compareDb91WriterAb(fixture('baseline'), candidate);
  assert.equal(result.passed, false);
  assert.equal(result.checks.candidateNoDatabaseLocked, true);
  assert.equal(result.checks.eventLoopP99Lower, false);
  assert.equal(result.checks.memoryPeakNotHigher, false);
});

test('missing metrics or a partial runner failure fails closed', () => {
  const candidate = fixture('candidate', {health: [], resources: [], failure: {message: 'safety stop'}});
  const result = compareDb91WriterAb(fixture('baseline'), candidate);
  assert.equal(result.passed, false);
  assert.equal(result.checks.candidateNoRunnerFailure, false);
  assert.equal(result.checks.eventLoopP50Lower, false);
  assert.equal(result.checks.memoryPeakNotHigher, false);
});
