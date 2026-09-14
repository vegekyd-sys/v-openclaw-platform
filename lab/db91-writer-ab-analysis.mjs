import assert from 'node:assert/strict';

function finite(values) {
  return values.filter(Number.isFinite).sort((left, right) => left - right);
}

export function quantile(values, fraction) {
  const sorted = finite(values);
  if (sorted.length === 0) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function ratio(candidate, baseline) {
  if (!Number.isFinite(candidate) || !Number.isFinite(baseline) || baseline === 0) return null;
  return candidate / baseline;
}

export function summarizeDb91WriterAbRun(run) {
  assert(run && Array.isArray(run.health) && Array.isArray(run.resources));
  const eventLoopP50 = run.health.map(sample => sample.eventLoop?.delayP50Ms);
  const eventLoopP99 = run.health.map(sample => sample.eventLoop?.delayP99Ms);
  const memories = run.resources.map(sample => sample.memoryCurrent);
  const swaps = run.resources.map(sample => sample.memorySwapCurrent);
  const gatewayRss = run.resources.map(sample => sample.gatewayRss);
  const childRss = run.resources.flatMap(sample => sample.processes?.map(process => process.rss) ?? []);
  const failedWriteWaitMaxMs = quantile(run.rows.filter(row => row.terminal === 'error').map(row => row.totalMs), 1);
  const slowSessionWriteMaxMs = quantile(run.slowSessionWrites?.map(write => write.elapsedMs) ?? [], 1);
  const firstMemory = finite(memories)[0] === undefined ? null : run.resources.find(sample => Number.isFinite(sample.memoryCurrent))?.memoryCurrent;
  const lastMemory = [...run.resources].reverse().find(sample => Number.isFinite(sample.memoryCurrent))?.memoryCurrent ?? null;
  return {
    variant: run.variant,
    release: run.release,
    configSha256: run.configSha256,
    workerConfigSha256: run.workerConfigSha256,
    rounds: run.rounds,
    concurrency: run.concurrency,
    completed: run.rows.filter(row => row.terminal === 'final').length,
    persisted: run.rows.filter(row => row.persisted === true).length,
    databaseLocked: run.runtimeErrors.filter(error => error.databaseLocked).length,
    runtimeErrors: run.runtimeErrors.length,
    failedWriteWaitMaxMs,
    slowSessionWriteMaxMs,
    longWriteWaitMaxMs: Math.max(failedWriteWaitMaxMs ?? 0, slowSessionWriteMaxMs ?? 0),
    healthErrors: run.health.filter(sample => sample.error).length,
    failure: run.failure ?? null,
    eventLoopP50Ms: {
      median: quantile(eventLoopP50, 0.5),
      p95: quantile(eventLoopP50, 0.95),
      max: quantile(eventLoopP50, 1),
    },
    eventLoopP99Ms: {
      median: quantile(eventLoopP99, 0.5),
      p95: quantile(eventLoopP99, 0.95),
      max: quantile(eventLoopP99, 1),
    },
    memory: {
      start: firstMemory,
      end: lastMemory,
      growth: Number.isFinite(firstMemory) && Number.isFinite(lastMemory) ? lastMemory - firstMemory : null,
      peak: quantile(memories, 1),
      peakSwap: quantile(swaps, 1),
      peakGatewayRss: quantile(gatewayRss, 1),
      peakChildRss: quantile(childRss, 1),
    },
  };
}

export function compareDb91WriterAb(baselineRun, candidateRun) {
  const baseline = summarizeDb91WriterAbRun(baselineRun);
  const candidate = summarizeDb91WriterAbRun(candidateRun);
  assert.equal(baseline.variant, 'baseline');
  assert.equal(candidate.variant, 'candidate');
  assert.equal(candidate.rounds, baseline.rounds, 'A/B rounds differ');
  assert.equal(candidate.concurrency, baseline.concurrency, 'A/B concurrency differs');
  assert.equal(candidate.configSha256, baseline.configSha256, 'A/B Gateway config differs');
  assert.equal(candidate.workerConfigSha256, baseline.workerConfigSha256, 'A/B Worker config differs');
  const expected = baseline.rounds * baseline.concurrency;
  const checks = {
    baselineNoRunnerFailure: baseline.failure === null,
    baselineReproducedDatabaseLock: baseline.databaseLocked > 0,
    baselineReproducedLongWriteWait: baseline.longWriteWaitMaxMs >= 30_000,
    baselineReproducedEventLoopStall: baseline.eventLoopP99Ms.max >= 1_000,
    baselineReproducedMemoryGrowth: baseline.memory.growth >= 1024 ** 3,
    candidateNoRunnerFailure: candidate.failure === null,
    candidateCompleted: candidate.completed === expected,
    candidatePersisted: candidate.persisted === expected,
    candidateNoDatabaseLocked: candidate.databaseLocked === 0,
    candidateNoRuntimeErrors: candidate.runtimeErrors === 0,
    candidateNoHealthErrors: candidate.healthErrors === 0,
    eventLoopP50Lower: Number.isFinite(candidate.eventLoopP50Ms.median) && Number.isFinite(baseline.eventLoopP50Ms.median) && candidate.eventLoopP50Ms.median < baseline.eventLoopP50Ms.median,
    eventLoopP99Lower: Number.isFinite(candidate.eventLoopP99Ms.p95) && Number.isFinite(baseline.eventLoopP99Ms.p95) && candidate.eventLoopP99Ms.p95 < baseline.eventLoopP99Ms.p95,
    memoryPeakNotHigher: Number.isFinite(candidate.memory.peak) && Number.isFinite(baseline.memory.peak) && candidate.memory.peak <= baseline.memory.peak * 1.05,
    memoryGrowthNotHigher: Number.isFinite(candidate.memory.growth) && Number.isFinite(baseline.memory.growth) && candidate.memory.growth <= Math.max(0, baseline.memory.growth) + 64 * 1024 ** 2,
  };
  return {
    passed: Object.values(checks).every(Boolean),
    checks,
    baseline,
    candidate,
    ratios: {
      eventLoopP50Median: ratio(candidate.eventLoopP50Ms.median, baseline.eventLoopP50Ms.median),
      eventLoopP99P95: ratio(candidate.eventLoopP99Ms.p95, baseline.eventLoopP99Ms.p95),
      memoryPeak: ratio(candidate.memory.peak, baseline.memory.peak),
      memoryGrowth: ratio(candidate.memory.growth, baseline.memory.growth),
    },
  };
}
