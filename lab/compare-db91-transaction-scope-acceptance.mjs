import assert from 'node:assert/strict';
import fs from 'node:fs';

const [baselinePath, candidatePath] = process.argv.slice(2);
assert(baselinePath && candidatePath, 'usage: compare BASELINE_JSON CANDIDATE_JSON');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')).summary;
const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8')).summary;
assert.equal(baseline.variant, 'baseline');
assert.equal(candidate.variant, 'candidate');
for (const key of ['model', 'count', 'holderWaitMs', 'configSha256', 'workerConfigSha256']) assert.equal(candidate[key], baseline[key], `${key} differs`);
const checks = {
  baselineValid: !baseline.failure && baseline.completed === 5 && baseline.persisted === 5 && baseline.runtimeErrors === 0,
  candidateValid: !candidate.failure && candidate.completed === 5 && candidate.persisted === 5 && candidate.runtimeErrors === 0 && candidate.healthErrors === 0,
  fixedFiveWorkers: candidate.count === 5 && candidate.configuredMinWorkers === 5,
  scopeDelayReproduced: baseline.firstTextP50Ms - candidate.firstTextP50Ms >= 1_000,
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
