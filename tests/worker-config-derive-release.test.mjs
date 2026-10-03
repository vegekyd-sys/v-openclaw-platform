// The worker-config-derive release files must be exactly what the build
// produces from V's captured bytes, and the patched entry point must load the
// derivation only in the Gateway.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { patchWorkerIndexForConfigDerivation } from "../lab/worker-config-derive-patch.mjs";

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const plan = JSON.parse(read("lab/worker-config-derive-plan.json"));
const candidatePlan = JSON.parse(read("lab/candidate/worker-config-derive.plan.json"));
const capturedIndex = read("release/captured/feishu-ask-chat-answer-20261003.worker/dist/index.mjs");

test("release index is V's captured index plus only the derivation call site", () => {
  const entry = plan.files.find((file) => file.target === "production-worker/index.mjs");
  assert.equal(sha256(capturedIndex), entry.before);
  const built = read(entry.source);
  assert.equal(built, patchWorkerIndexForConfigDerivation(capturedIndex));
  assert.match(built, /process\.env\.VLAB_WORKER_CHILD === "1"\s*\? \{ ok: true, changed: false, skipped: "worker-child" \}/);
  assert.equal(built.includes("syncWorkerRuntimeConfigFile"), false);
  assert.equal(built.includes("runtimePolicySync: workerRuntimeConfigSync"), true);
});

test("release derivation module is the reviewed experiment source", () => {
  const entry = plan.files.find((file) => file.target === "production-worker/worker-config-derive.mjs");
  assert.equal(entry.before, null);
  assert.equal(read(entry.source), read("experiments/agent-worker-isolation-v1/worker-config-derive.mjs"));
});

test("candidate plan installs exactly the release files", () => {
  assert.deepEqual(candidatePlan.files, plan.files);
  assert.equal(candidatePlan.baseRelease, plan.baseRelease);
});

test("the patch refuses unknown or already patched entry points", () => {
  assert.throws(() => patchWorkerIndexForConfigDerivation("export default {}"), /exactly one sync import/);
  assert.throws(
    () => patchWorkerIndexForConfigDerivation(patchWorkerIndexForConfigDerivation(capturedIndex)),
    /already derives/,
  );
});
