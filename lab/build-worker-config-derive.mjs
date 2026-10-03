// Builds the Worker config derivation release from the exact production V
// bytes captured in release/captured/feishu-ask-chat-answer-20261003.worker.
// Never touches a live runtime. With --verify-vlab it also confirms that shared
// VLab still serves the same index.mjs (read-only read-code).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { patchWorkerIndexForConfigDerivation } from "./worker-config-derive-patch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const captured = "release/captured/feishu-ask-chat-answer-20261003.worker";
const releaseDir = "lab/release-files/worker-config-derive";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

// production-worker/index.mjs on V (Worker plugin 0.2.11 + V-only patches).
const INDEX_BEFORE = "c047f3df1f730b4eacb2db0ec64cd0e0281bc4f8388c8032768192a204222259";

const manifest = JSON.parse(readFileSync(path.join(root, captured, "manifest.json"), "utf8"));
const manifestSha = (file) => manifest.files.find((entry) => entry.path === `./${file}`)?.sha256;
const indexBefore = readFileSync(path.join(root, captured, "dist/index.mjs"), "utf8");
assert.equal(sha256(indexBefore), INDEX_BEFORE, "captured index.mjs changed");
assert.equal(manifestSha("index.mjs"), INDEX_BEFORE, "manifest disagrees with captured index.mjs");
assert.equal(manifestSha("worker-config-derive.mjs"), undefined, "V already has worker-config-derive.mjs");

if (process.argv.includes("--verify-vlab")) {
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "/Users/tianyicai/vlab-dev/lab/vlab.mjs",
        "read-code",
        "--repo",
        "/Users/tianyicai/vlab-dev",
        "--target",
        "production-worker/index.mjs",
      ],
      { encoding: "utf8", maxBuffer: 16 * 1024 ** 2, timeout: 120_000 },
    ),
  );
  assert.equal(result.sha256, INDEX_BEFORE, "VLab production-worker/index.mjs differs from V");
  console.log(JSON.stringify({ vlabRelease: result.current.release, index: "matches V" }));
}

const derive = readFileSync(
  path.join(root, "experiments/agent-worker-isolation-v1/worker-config-derive.mjs"),
  "utf8",
);
const specs = [
  {
    target: "production-worker/index.mjs",
    before: INDEX_BEFORE,
    content: patchWorkerIndexForConfigDerivation(indexBefore),
  },
  {
    target: "production-worker/worker-config-derive.mjs",
    before: null,
    content: derive,
  },
];

mkdirSync(path.join(root, releaseDir), { recursive: true });
const files = [];
for (const spec of specs) {
  const source = `${releaseDir}/${path.basename(spec.target)}`;
  writeFileSync(path.join(root, source), spec.content);
  files.push({ source, target: spec.target, before: spec.before });
  console.log(JSON.stringify({ target: spec.target, before: spec.before, after: sha256(spec.content) }));
}

writeFileSync(
  path.join(root, "lab/worker-config-derive-plan.json"),
  `${JSON.stringify({ baseRelease: "feishu-ask-chat-answer-v1", files }, null, 2)}\n`,
);
