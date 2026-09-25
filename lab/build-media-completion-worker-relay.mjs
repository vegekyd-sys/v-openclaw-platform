// Builds the media completion relay release from read-code-verified VLab bytes;
// never writes the live runtime. Both targets must still equal production V.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { patchOpenClawMediaCompletionBundle } from "../scripts/patch-openclaw-media-completion-relay.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = "lab/release-files/media-completion-worker-relay";
const fixedRouter = readFileSync(
  path.join(root, "experiments/agent-worker-isolation-v1/worker-gateway-events.mjs"),
  "utf8",
);
const specs = [
  {
    target: "openclaw/dist/openclaw-tools-BODVdJQD.js",
    // v2026.9.1-db91.6-feishu-model-20260924 as captured from V.
    expectedBefore: "b20468a24be539da4f7618ac1d82cc4c6708ba0dcee3f1e178f2a719c00e3527",
    build: (before) => patchOpenClawMediaCompletionBundle(before).source,
  },
  {
    target: "production-worker/worker-gateway-events.mjs",
    // Worker plugin 0.2.11 on V: caches pending results and drops disposition.
    expectedBefore: "fbda3387757c56b33631e8a8ee8059cab79637e9c162afac028962ad5e9cd329",
    build: () => fixedRouter,
  },
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

mkdirSync(path.join(root, releaseDir), { recursive: true });
const files = [];
let baseRelease;
for (const spec of specs) {
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "/Users/tianyicai/vlab-dev/lab/vlab.mjs",
        "read-code",
        "--repo",
        "/Users/tianyicai/vlab-dev",
        "--target",
        spec.target,
      ],
      { encoding: "utf8", maxBuffer: 16 * 1024 ** 2, timeout: 120_000 },
    ),
  );
  baseRelease ??= result.current.release;
  assert.equal(result.current.release, baseRelease, "VLab release changed during artifact read");
  const before = Buffer.from(result.content, "base64").toString();
  assert.equal(sha256(before), result.sha256, `${spec.target} read-code digest mismatch`);
  assert.equal(result.sha256, spec.expectedBefore, `${spec.target} no longer matches production V; rebuild from V bytes`);
  const after = spec.build(before);
  assert.notEqual(sha256(after), result.sha256, `${spec.target} unchanged`);
  const source = `${releaseDir}/${path.basename(spec.target)}`;
  writeFileSync(path.join(root, source), after);
  files.push({ source, target: spec.target, before: result.sha256 });
  console.log(JSON.stringify({ target: spec.target, before: result.sha256, after: sha256(after) }));
}

writeFileSync(
  path.join(root, "lab/media-completion-worker-relay-plan.json"),
  `${JSON.stringify({ baseRelease, files }, null, 2)}\n`,
);
