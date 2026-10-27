import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const patcher = path.join(root, "lab/release-files/openclaw-tool-safe-deny/patch-openclaw-tool-safe-deny.mjs");
const vBytes = path.join(root, "release/captured/v2026.9.1-db91.6-sessions-search-20261026/dist/selection-BC0YSSFq.js");
const release = path.join(root, "lab/release-files/openclaw-tool-safe-deny/dist/selection-BC0YSSFq.js");
const plan = JSON.parse(fs.readFileSync(path.join(root, "lab/release-files/openclaw-tool-safe-deny/release.plan.json"), "utf8"));
const sha = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function scratch(src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-safe-deny-"));
  fs.writeFileSync(path.join(dir, "selection-BC0YSSFq.js"), src);
  return dir;
}
const run = (dir, ...extra) => JSON.parse(execFileSync(process.execPath, [patcher, "--dist", dir, ...extra], { encoding: "utf8" }));

test("V's bytes patch to the release bytes the plan ships, once", () => {
  const [entry] = plan.files;
  assert.equal(sha(vBytes), entry.before);
  assert.equal(sha(release), entry.after);
  const dir = scratch(fs.readFileSync(vBytes));
  assert.deepEqual(run(dir, "--check"), { file: "selection-BC0YSSFq.js", changed: true, wrote: false });
  assert.equal(sha(path.join(dir, "selection-BC0YSSFq.js")), entry.before, "--check must not write");
  assert.equal(run(dir).changed, true);
  assert.equal(sha(path.join(dir, "selection-BC0YSSFq.js")), entry.after);
  assert.equal(run(dir).changed, false, "second run must be a no-op");
  assert.equal(sha(path.join(dir, "selection-BC0YSSFq.js")), entry.after);
});

test("the only change is the openclaw exemption inside toolPolicyRestrictsHarnessNativeTools", () => {
  const before = fs.readFileSync(vBytes, "utf8").split("\n");
  const after = fs.readFileSync(release, "utf8").split("\n");
  assert.equal(after.length, before.length + 1);
  const added = after.findIndex((line, i) => line !== before[i]);
  assert.deepEqual([...after.slice(0, added), ...after.slice(added + 1)], before);
  assert.match(after[added], /^\t\tif \(normalized === "openclaw"\) return false; \/\/ v-openclaw-tool-safe-deny-v1/);
  const fn = after.slice(0, added).findLastIndex((line) => line.startsWith("function "));
  assert.equal(after[fn], "function toolPolicyRestrictsHarnessNativeTools(policy, safeDenyToolNames) {");
});

test("refuses a module whose anchor moved instead of guessing", () => {
  const src = fs.readFileSync(vBytes, "utf8").replace("return !isKnownCoreToolId(normalized) || !safeDenyToolNames.has(normalized);", "return !safeDenyToolNames.has(normalized);");
  const dir = scratch(src);
  assert.throws(() => execFileSync(process.execPath, [patcher, "--dist", dir], { stdio: "pipe" }));
  assert.equal(fs.readFileSync(path.join(dir, "selection-BC0YSSFq.js"), "utf8"), src);
});
