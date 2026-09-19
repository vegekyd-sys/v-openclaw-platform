import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const DEPLOYED = "./release-files/worker-memory-recycle/production-worker-worker-pool.mjs";
const CANDIDATE = "./release-files/worker-demand-expansion/production-worker-worker-pool.mjs";

// Capabilities that are live on production V today. A release artifact that
// drops any of them is a silent rollback, which is how the cold-start work of
// 2026-09-11 and the Worker recycling of 2026-09-16 ended up on two lineages
// that each lacked the other's fix.
const LIVE_CAPABILITIES = [
  ["Worker memory recycling", /recycleRssBytes/],
  ["recycling capacity floor", /capacityFloor\(\)/],
  ["first-text worker phase marks", /ocFirsttextWorkerMark\(/],
  ["late Worker reply delivery", /sendLateWorkerReply/],
];

// Fixes that exist on the experiments lineage but have never reached
// production. This release deliberately ports only the first one, because it
// is the only one the 2026-09-19 load test measured. The others are recorded
// here so the gap stays visible instead of being rediscovered.
const LINEAGE_GAPS = [
  ["demand-sized pool expansion", /ensureDemandWorkers/, "ported by this release"],
  ["transient spawn (EAGAIN) retry", /scheduleSpawnRetry/, "still absent"],
  ["sanitized preparation state", /runtimePrewarm: worker\.runtimePrewarm/, "still absent"],
];

test("the candidate keeps every capability the deployed pool already has", () => {
  const candidate = read(CANDIDATE);
  for (const [name, pattern] of LIVE_CAPABILITIES) {
    assert.match(candidate, pattern, `candidate drops: ${name}`);
  }
});

test("the deployed pool is the lineage the candidate was built from", () => {
  // Guards against rebuilding the candidate from experiments/ instead of from
  // the bytes production actually runs.
  const deployed = read(DEPLOYED);
  for (const [name, pattern] of LIVE_CAPABILITIES) {
    assert.match(deployed, pattern, `deployed lineage lacks: ${name}`);
  }
});

test("the candidate starts capacity for queued demand, not one Worker per pump", () => {
  const candidate = read(CANDIDATE);
  assert.match(candidate, /ensureDemandWorkers\(\) \{/);
  assert.match(candidate, /startingWorkerCount\(\) < this\.maxConcurrentStarts/);
  // Demand is the count of distinct sessions without a Worker, minus the slots
  // existing Workers can still take.
  assert.match(candidate, /const unowned = new Set\(this\.pending/);
  assert.match(candidate, /this\.sessionsPerWorker - w\.ownerSessionKeys\.size/);
});

test("the single-slot demand guard is gone", () => {
  const candidate = read(CANDIDATE);
  // capacityStartupPromise allowed exactly one demand-driven boot at a time, so
  // a burst of 30 sessions grew the pool one Worker per boot: the last session
  // waited 154s on production V on 2026-09-19.
  assert.doesNotMatch(candidate, /capacityStartupPromise/);
  assert.match(read(DEPLOYED), /capacityStartupPromise/, "deployed lineage should still show the old guard");
});

test("the concurrent-start bound is validated and observable", () => {
  const candidate = read(CANDIDATE);
  assert.match(candidate, /maxConcurrentStarts must be an integer from 1 to maxWorkers/);
  assert.match(candidate, /maxConcurrentStarts: this\.maxConcurrentStarts/);
  assert.match(candidate, /Math\.min\(this\.maxWorkers, 4, availableParallelism\(\)\)/);
  assert.match(candidate, /import \{ availableParallelism \} from "node:os"/);
});

test("warm spare and idle recycling still bound the pool", () => {
  const candidate = read(CANDIDATE);
  assert.match(candidate, /ensureWarmSpareWorkers\(\)/);
  assert.match(candidate, /this\.workers\.size < this\.maxWorkers/);
});

test("the lineage gaps this release does and does not close are pinned", () => {
  const deployed = read(DEPLOYED);
  const candidate = read(CANDIDATE);
  for (const [name, pattern, status] of LINEAGE_GAPS) {
    assert.doesNotMatch(deployed, pattern, `deployed lineage unexpectedly has: ${name}`);
    if (status === "ported by this release") {
      assert.match(candidate, pattern, `candidate should port: ${name}`);
    } else {
      // Not a defect in this release: porting an unmeasured fix would widen the
      // change beyond what the load test justifies.
      assert.doesNotMatch(candidate, pattern, `candidate unexpectedly widened to: ${name}`);
    }
  }
});
