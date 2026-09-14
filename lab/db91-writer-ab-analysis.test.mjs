import test from 'node:test';
import assert from 'node:assert/strict';
import {compareDb91WriterAb, quantile, summarizeDb91WriterAbRun} from './db91-writer-ab-analysis.mjs';

function fixture(variant, overrides = {}) {
  const healthy = variant === 'candidate';
  const mib = 1024 ** 2;
  return {
    variant,
    release: variant === 'baseline' ? 'db91-global-write-admission-v3' : 'db91-process-global-writer-v1',
    configSha256: 'same',
    workerConfigSha256: 'same-worker',
    rounds: 2,
    concurrency: 2,
    rows: Array.from({length: 4}, (_, index) => ({terminal: 'final', persisted: true, index})),
    health: [100, 200, 300, 600].map((value, index) => ({
      at: index,
      eventLoop: {delayP50Ms: healthy ? value / 2 : value, delayP99Ms: healthy ? value : value * 2},
    })),
    resources: [0, 1, 2].map(index => ({
      at: index,
      memoryCurrent: 7 * 1024 ** 3 + index * (healthy ? 10 * mib : 600 * mib),
      memorySwapCurrent: 0,
      gatewayRss: 500 + index,
      processes: [{pid: 100 + index, rss: 300 + index}],
    })),
    runtimeErrors: healthy ? [] : [{databaseLocked: true}],
    slowSessionWrites: healthy ? [] : [{elapsedMs: 35_000}],
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
  assert.deepEqual(summary.eventLoopP50Ms, {median: 200, p95: 600, max: 600});
  assert.deepEqual(summary.eventLoopP99Ms, {median: 400, p95: 1200, max: 1200});
  assert.equal(summary.memory.start, 7 * 1024 ** 3);
  assert.equal(summary.memory.end, 7 * 1024 ** 3 + 1200 * 1024 ** 2);
  assert.equal(summary.memory.growth, 1200 * 1024 ** 2);
  assert.equal(summary.databaseLocked, 1);
  assert.equal(summary.slowSessionWriteMaxMs, 35_000);
  assert.equal(summary.longWriteWaitMaxMs, 35_000);
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
  candidate.health = candidate.health.map(sample => ({...sample, eventLoop: {delayP50Ms: 1_000, delayP99Ms: 2_000}}));
  candidate.resources = candidate.resources.map((sample, index) => ({...sample, memoryCurrent: 9 * 1024 ** 3 + index * 1024 ** 3}));
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
