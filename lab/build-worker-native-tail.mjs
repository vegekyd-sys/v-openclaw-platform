// Builds the Worker native-tail release: production-worker/harness-result.mjs
// reads a turn's messages from the tail of its session instead of the whole
// session (experiments/agent-worker-isolation-v1/harness-result.mjs). V's bytes
// before the change are captured in release/captured/codex-vds-oversized-20261008.worker
// and equal the experiment source at the branch point. Never touches a live
// runtime; with --verify-vlab it confirms shared VLab serves the same bytes.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const captured = "release/captured/codex-vds-oversized-20261008.worker";
const releaseDir = "lab/release-files/worker-native-tail";
const target = "production-worker/harness-result.mjs";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

// production-worker/harness-result.mjs on V and shared VLab (2026-10-08).
const BEFORE = "c1be75befbc89393b165fd9abf979a1096590284db176029bdb47c564ef40f9c";

const manifest = JSON.parse(readFileSync(path.join(root, captured, "manifest.json"), "utf8"));
assert.equal(manifest.files.find((entry) => entry.path === "./harness-result.mjs")?.sha256, BEFORE, "manifest disagrees with V's harness-result.mjs");
assert.equal(sha256(readFileSync(path.join(root, captured, "dist/harness-result.mjs"))), BEFORE, "captured harness-result.mjs changed");

if (process.argv.includes("--verify-vlab")) {
  const result = JSON.parse(execFileSync(process.execPath, [
    "/Users/tianyicai/vlab-dev/lab/vlab.mjs", "read-code", "--repo", "/Users/tianyicai/vlab-dev", "--target", target,
  ], { encoding: "utf8", maxBuffer: 16 * 1024 ** 2, timeout: 120_000 }));
  assert.equal(result.sha256, BEFORE, `VLab ${target} differs from V`);
  console.log(JSON.stringify({ vlabRelease: result.current.release, [target]: "matches V" }));
}

const after = readFileSync(path.join(root, "experiments/agent-worker-isolation-v1/harness-result.mjs"));
assert.notEqual(sha256(after), BEFORE, "the experiment source carries no change");
assert(after.includes("readNativeTailEntries"), "the experiment source is not the native-tail version");
mkdirSync(path.join(root, releaseDir), { recursive: true });
const source = `${releaseDir}/harness-result.mjs`;
writeFileSync(path.join(root, source), after);
console.log(JSON.stringify({ target, before: BEFORE, after: sha256(after) }));
writeFileSync(path.join(root, "lab/worker-native-tail-plan.json"), `${JSON.stringify({ files: [{ source, target, before: BEFORE }] }, null, 2)}\n`);
