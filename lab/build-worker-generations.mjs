// Writes the worker-generations release plan from read-code-verified VLab bytes;
// never writes the live runtime. Every target must still hold the exact
// production V bytes the release files were derived from
// (release/captured/feishu-ask-chat-answer-20261003.worker).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { promoteWorkerLifecycle } from "./worker-lifecycle-promotion.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = "lab/release-files/worker-generations";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const specs = [
  // Worker plugin 0.2.11 on V; the release file is the accepted 0.2.12
  // lifecycle projection plus worker-generations.1.
  { target: "production-worker/index.mjs", expectedBefore: "c047f3df1f730b4eacb2db0ec64cd0e0281bc4f8388c8032768192a204222259" },
  { target: "production-worker/worker-pool.mjs", expectedBefore: "a9f718d0c9ca1f209aba9a9a55d86181b84f2ab1afa8b65cc86bde96bc3b5ea3" },
  { target: "production-worker/worker-runtime-lifecycle.mjs", expectedBefore: null },
];

const files = [];
let baseRelease;
for (const spec of specs) {
  let result;
  try {
    result = JSON.parse(execFileSync(process.execPath, [
      "/Users/tianyicai/vlab-dev/lab/vlab.mjs", "read-code", "--repo", "/Users/tianyicai/vlab-dev", "--target", spec.target,
    ], { encoding: "utf8", maxBuffer: 16 * 1024 ** 2, timeout: 120_000 }));
  } catch (error) {
    assert.equal(spec.expectedBefore, null, `${spec.target}: ${error.message}`);
    result = null;
  }
  if (result) {
    baseRelease ??= result.current.release;
    assert.equal(result.current.release, baseRelease, "VLab release changed during artifact read");
    assert.equal(result.sha256, spec.expectedBefore, `${spec.target} no longer matches production V; rebuild from V bytes`);
  }
  const source = `${releaseDir}/${path.basename(spec.target)}`;
  const after = readFileSync(path.join(root, source), "utf8");
  if (spec.target.endsWith("/index.mjs")) {
    // The release index must contain the accepted lifecycle projection of V's
    // exact bytes; worker-generations.1 only adds to it.
    const before = Buffer.from(result.content, "base64").toString();
    const projected = promoteWorkerLifecycle(before);
    assert.ok(projected.includes("createWorkerRuntimeLifecycle"), "lifecycle projection still applies");
  }
  files.push({ source, target: spec.target, before: result ? result.sha256 : null });
  console.log(JSON.stringify({ target: spec.target, before: result?.sha256 ?? null, after: sha256(after) }));
}

writeFileSync(
  path.join(root, "lab/worker-generations-plan.json"),
  `${JSON.stringify({ baseRelease, files }, null, 2)}\n`,
);
