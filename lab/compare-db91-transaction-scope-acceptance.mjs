import assert from 'node:assert/strict';
import fs from 'node:fs';

const [baselinePath, candidatePath] = process.argv.slice(2);
assert(baselinePath && candidatePath, 'usage: compare BASELINE_JSON CANDIDATE_JSON');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')).summary;
const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8')).summary;
assert.equal(baseline.variant, 'baseline');
assert.equal(candidate.variant, 'candidate');
for (const key of ['model', 'count', 'rounds', 'concurrency', 'holderWaitMs', 'configSha256', 'workerConfigSha256']) assert.equal(candidate[key], baseline[key], `${key} differs`);
const expected = baseline.rounds * baseline.concurrency;
const checks = {
  baselineValid: !baseline.failure && baseline.count === expected,
  baselineReproducedBroadScopeFailure: baseline.failed > 0 && baseline.coordinatorErrors > 0,
  baselineReproducedThirtySecondWait: baseline.totalP95Ms >= 30_000,
  candidateValid: !candidate.failure && candidate.completed === expected && candidate.persisted === expected && candidate.failed === 0 && candidate.runtimeErrors === 0 && candidate.healthErrors === 0,
  candidateNoLockOrCoordinatorFailure: candidate.databaseLocked === 0 && candidate.coordinatorErrors === 0,
  fixedFiveWorkers: candidate.configuredMinWorkers === 5,
  scopeDelayReproduced: baseline.totalP95Ms - candidate.totalP95Ms >= 10_000,
  firstTextP50AbsoluteGate: candidate.firstTextP50Ms <= 7_000,
  firstTextP95AbsoluteGate: candidate.firstTextP95Ms <= 12_000,
  firstTextP50NotSlower: candidate.firstTextP50Ms <= baseline.firstTextP50Ms * 1.05,
  firstTextP95NotSlower: candidate.firstTextP95Ms <= baseline.firstTextP95Ms * 1.05,
  eventLoopP50TailNotSlower: candidate.eventLoopP50P95Ms <= baseline.eventLoopP50P95Ms * 1.05,
  eventLoopP99TailNotSlower: candidate.eventLoopP99P95Ms <= baseline.eventLoopP99P95Ms * 1.05,
};
const result = {
  passed: Object.values(checks).every(Boolean),
  checks,
  baseline,
  candidate,
  ratios: {
    firstTextP50: candidate.firstTextP50Ms / baseline.firstTextP50Ms,
    firstTextP95: candidate.firstTextP95Ms / baseline.firstTextP95Ms,
    eventLoopP50P95: candidate.eventLoopP50P95Ms / baseline.eventLoopP50P95Ms,
    eventLoopP99P95: candidate.eventLoopP99P95Ms / baseline.eventLoopP99P95Ms,
  },
};
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
