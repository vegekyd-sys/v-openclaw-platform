import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchRealtimeTalkConsultModel } from "./patch-realtime-talk-consult-model.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = "openclaw/dist/talk-DkFuKRod.js";
const fixture = resolve(root, "lab/fixtures/realtime-talk-consult-model/talk-DkFuKRod.js");
const output = resolve(root, "lab/release-files/talk-consult-model/talk-DkFuKRod.js");
const planPath = resolve(root, "lab/realtime-talk-consult-model-plan.json");
const expectedBaseRelease = "talk-voice-wip-cleanup-v1";
const expectedBefore = "bc7f7e15e211fc7669446b221222de980a355a042c4f8a40e301357186e5aa42";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function build() {
  const before = readFileSync(fixture);
  assert.equal(sha256(before), expectedBefore, "Talk runtime drifted");
  const after = patchRealtimeTalkConsultModel(before.toString("utf8"));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, after);
  writeFileSync(planPath, `${JSON.stringify({
    baseRelease: expectedBaseRelease,
    files: [{
      source: "lab/release-files/talk-consult-model/talk-DkFuKRod.js",
      target,
      before: expectedBefore,
    }],
  }, null, 2)}\n`);
  return { before: expectedBefore, after: sha256(after), target };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(build(), null, 2));
}
