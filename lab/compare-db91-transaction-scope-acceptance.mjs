import assert from 'node:assert/strict';
import fs from 'node:fs';

const [baselinePath, candidatePath, targetLoadPath] = process.argv.slice(2);
assert(baselinePath && candidatePath && targetLoadPath, 'usage: compare BASELINE_C15_JSON CANDIDATE_C15_JSON CANDIDATE_C5_JSON');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')).summary;
const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8')).summary;
const targetLoad = JSON.parse(fs.readFileSync(targetLoadPath, 'utf8')).summary;
assert.equal(baseline.variant, 'baseline');
assert.equal(candidate.variant, 'candidate');
assert.equal(targetLoad.variant, 'candidate');
for (const key of ['model', 'count', 'rounds', 'concurrency', 'holderWaitMs', 'configSha256', 'workerConfigSha256']) assert.equal(candidate[key], baseline[key], `${key} differs`);
for (const key of ['model', 'holderWaitMs', 'configSha256', 'workerConfigSha256']) assert.equal(targetLoad[key], baseline[key], `target-load ${key} differs`);
const expected = baseline.rounds * baseline.concurrency;
const checks = {
  baselineValid: !baseline.failure && baseline.count === expected,
  baselineReproducedBroadScopeStall: baseline.firstTextP95Ms >= 30_000 && baseline.totalP95Ms >= 30_000,
  baselineReproducedServicePressure: baseline.healthErrors > 0 && baseline.eventLoopP99MaxMs >= 500 && baseline.memoryGrowth >= 1024 ** 3,
  candidateValid: !candidate.failure && candidate.completed === expected && candidate.persisted === expected && candidate.failed === 0 && candidate.runtimeErrors === 0 && candidate.healthErrors === 0,
  candidateNoLockOrCoordinatorFailure: candidate.databaseLocked === 0 && candidate.coordinatorErrors === 0,
  fixedFiveWorkers: candidate.configuredMinWorkers === 5,
  stressFirstTextP95ReducedByAtLeastHalf: candidate.firstTextP95Ms <= baseline.firstTextP95Ms * 0.5,
  stressTotalP95ReducedByAtLeastHalf: candidate.totalP95Ms <= baseline.totalP95Ms * 0.5,
  targetLoadValid: !targetLoad.failure && targetLoad.rounds === 1 && targetLoad.concurrency === 5 && targetLoad.completed === 5 && targetLoad.persisted === 5 && targetLoad.failed === 0 && targetLoad.runtimeErrors === 0 && targetLoad.healthErrors === 0,
  targetLoadFirstTextP50WithinSevenSeconds: targetLoad.firstTextP50Ms <= 7_000,
  targetLoadFirstTextP95WithinSevenSeconds: targetLoad.firstTextP95Ms <= 7_000,
  targetLoadEventLoopP50TailHealthy: targetLoad.eventLoopP50P95Ms <= 25,
  targetLoadEventLoopP99TailHealthy: targetLoad.eventLoopP99P95Ms <= 500,
};
const result = {
  passed: Object.values(checks).every(Boolean),
  checks,
  baseline,
  candidate,
  targetLoad,
  ratios: {
    firstTextP50: candidate.firstTextP50Ms / baseline.firstTextP50Ms,
    firstTextP95: candidate.firstTextP95Ms / baseline.firstTextP95Ms,
    totalP95: candidate.totalP95Ms / baseline.totalP95Ms,
    eventLoopP50P95: candidate.eventLoopP50P95Ms / baseline.eventLoopP50P95Ms,
    eventLoopP99P95: candidate.eventLoopP99P95Ms / baseline.eventLoopP99P95Ms,
  },
};
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
