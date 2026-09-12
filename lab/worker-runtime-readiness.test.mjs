import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("release Worker gates ready on bounded fail-open runtime preparation", () => {
  const worker = read("./release-files/production-worker-worker.mjs");
  assert.match(worker, /import \{ prewarmWorkerRuntime \}/);
  assert.match(worker, /OPENCLAW_WORKER_EAGER_PREPARE_TIMEOUT_MS/);
  assert.match(worker, /runtimePrewarm = await prewarmWorkerRuntime/);
  assert(
    worker.indexOf("runtimePrewarm = await prewarmWorkerRuntime") <
      worker.indexOf('type: "ready"'),
  );
  assert.match(worker, /\[worker-runtime-prewarm\.2\]/);
});

test("release pool exposes sanitized preparation state", () => {
  const pool = read("./release-files/production-worker-worker-pool.mjs");
  assert.match(pool, /worker\.runtimePrewarm = message\.runtimePrewarm/);
  assert.match(pool, /runtimePrewarm: worker\.runtimePrewarm/);
});

test("release pool contains transient fork exhaustion without dropping queued work", () => {
  const pool = read("./release-files/production-worker-worker-pool.mjs");
  assert.match(pool, /child\.once\("error", \(error\) => this\.onExit/);
  assert.match(pool, /cause\?\.code === "EAGAIN"/);
  assert.match(pool, /this\.scheduleSpawnRetry\(\)/);
  assert.match(pool, /if \(this\.closing \|\| this\.spawnRetryTimer\) return/);
  assert.match(
    pool,
    /if \(failure\.code === "EAGAIN"\) \{\s*this\.scheduleSpawnRetry\(\);\s*return;\s*\}\s*for \(const pending of this\.pending\.splice\(0\)\)/,
  );
});

test("release plan is pinned to the deployed cold-start candidate", () => {
  const plan = JSON.parse(read("./worker-runtime-readiness-plan.json"));
  assert.equal(plan.baseRelease, "worker-coldstart-longterm-20260912-v1");
  assert.deepEqual(
    plan.files.map(({ target, before }) => [target, before]),
    [
      [
        "production-worker/worker.mjs",
        "5b49deac1c9eaafe69ec93d4c0ce9b2328d19fa44ec47158aa1b6c664effddf9",
      ],
      [
        "production-worker/runtime-prewarm.mjs",
        "9d6822a344e8e9a26d6a3784b0e85ca8279549d1360e95141208177804a560a9",
      ],
      [
        "production-worker/worker-pool.mjs",
        "14dc8e6c4f588a77ef8b9d9c465b7c34c865af3a0c36bf085481eec3952611fb",
      ],
    ],
  );
});
