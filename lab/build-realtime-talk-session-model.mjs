import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchRealtimeTalkSessionModel } from "./patch-realtime-talk-session-model.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = "openclaw/dist/realtime-session-harness-CEO5kVAJ.js";
const fixture = resolve(
  root,
  "lab/fixtures/realtime-talk-session-model/realtime-session-harness-CEO5kVAJ.js",
);
const output = resolve(
  root,
  "lab/release-files/talk-session-model-inheritance/realtime-session-harness-CEO5kVAJ.js",
);
const planPath = resolve(root, "lab/realtime-talk-session-model-plan.json");
const expectedBaseRelease = "talk-voice-wip-cleanup-v1";
const expectedBefore = "ea7f772f4e383c58fed00ec7a0922ce73bd58173acfde5cebde869672279ce85";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function build() {
  const before = readFileSync(fixture);
  assert.equal(sha256(before), expectedBefore, "realtime session harness drifted");
  const after = patchRealtimeTalkSessionModel(before.toString("utf8"));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, after);
  const plan = {
    baseRelease: expectedBaseRelease,
    files: [{
      source:
        "lab/release-files/talk-session-model-inheritance/realtime-session-harness-CEO5kVAJ.js",
      target,
      before: expectedBefore,
    }],
  };
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return { before: expectedBefore, after: sha256(after), target };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(build(), null, 2));
}
