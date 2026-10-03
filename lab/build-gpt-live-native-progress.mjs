import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchGptLiveNativeProgress } from "./patch-gpt-live-native-progress.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = resolve(root, "lab/fixtures/gpt-live-native-progress");
const fileName = "realtime-quicksilver-delegation-controller-B0yPpiHp.js";
const expectedBefore = "e7a27df564dc8296dba853e27752f592f68ebf660736176793ede1bbb2762679";
const target = `openclaw/dist/${fileName}`;
const source = `lab/release-files/gpt-live-native-progress/${fileName}`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function build() {
  const baseline = JSON.parse(readFileSync(resolve(fixtureRoot, "baseline.json"), "utf8"));
  const before = readFileSync(resolve(fixtureRoot, fileName));
  assert.equal(baseline.target, target, "Unexpected native provider target");
  assert.equal(baseline.sha256, expectedBefore, "Unexpected native provider metadata baseline");
  assert.equal(sha256(before), expectedBefore, "Native provider fixture drifted");
  const after = patchGptLiveNativeProgress(before.toString("utf8"));
  const output = resolve(root, source);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, after);
  const plan = { baseRelease: baseline.current.release, files: [{ source, target, before: expectedBefore }] };
  writeFileSync(resolve(root, "lab/gpt-live-native-progress-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  writeFileSync(resolve(root, "lab/candidate/gpt-live-native-progress.plan.json"), `${JSON.stringify({
    files: [{ source, target }],
    tests: ["lab/gpt-live-native-progress.test.mjs"],
    support: ["lab/patch-gpt-live-native-progress.mjs", "lab/fixtures/gpt-live-native-progress/realtime-quicksilver-delegation-controller-B0yPpiHp.js"],
    timeoutSeconds: 120,
  }, null, 2)}\n`);
  return { before: expectedBefore, after: sha256(after), target, baseRelease: plan.baseRelease };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(build(), null, 2));
