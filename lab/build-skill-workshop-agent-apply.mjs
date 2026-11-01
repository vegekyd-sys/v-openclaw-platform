// Builds the skill-workshop-agent-apply release from V's exact bytes: the
// unified-session-20261027 capture (openclaw-tools, native-attempt-bridge) and the
// unmodified upstream 2026.9.1 files kept in lab/fixtures/skill-workshop-agent-apply.
// Never touches a live runtime.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BRIDGE_BEFORE, BRIDGE_FILE, EXPERIENCE_REVIEW_BEFORE, EXPERIENCE_REVIEW_FILE,
  OPENCLAW_TOOLS_BEFORE, OPENCLAW_TOOLS_FILE, SERVICE_QUERY_BEFORE, SERVICE_QUERY_FILE,
  patchExperienceReview, patchNativeAttemptBridge, patchOpenClawTools, patchServiceQuery,
} from "./patch-skill-workshop-agent-apply.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = "lab/release-files/skill-workshop-agent-apply";
const capture = "release/captured/v2026.9.1-db91.6-unified-session-20261027";
const fixtures = "lab/fixtures/skill-workshop-agent-apply";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const inputs = [
  { file: SERVICE_QUERY_FILE, from: `${fixtures}/${SERVICE_QUERY_FILE}`, before: SERVICE_QUERY_BEFORE, patch: patchServiceQuery, target: `openclaw/dist/${SERVICE_QUERY_FILE}` },
  { file: OPENCLAW_TOOLS_FILE, from: `${capture}/dist/${OPENCLAW_TOOLS_FILE}`, before: OPENCLAW_TOOLS_BEFORE, patch: patchOpenClawTools, target: `openclaw/dist/${OPENCLAW_TOOLS_FILE}` },
  { file: EXPERIENCE_REVIEW_FILE, from: `${fixtures}/${EXPERIENCE_REVIEW_FILE}`, before: EXPERIENCE_REVIEW_BEFORE, patch: patchExperienceReview, target: `openclaw/dist/${EXPERIENCE_REVIEW_FILE}` },
  { file: BRIDGE_FILE, from: `${capture}.worker/dist/${BRIDGE_FILE}`, before: BRIDGE_BEFORE, patch: patchNativeAttemptBridge, target: `production-worker/${BRIDGE_FILE}` },
];

mkdirSync(path.join(root, releaseDir), { recursive: true });
const files = [];
for (const input of inputs) {
  const before = readFileSync(path.join(root, input.from), "utf8");
  assert.equal(sha256(before), input.before, `${input.from} is not V's bytes`);
  const after = input.patch(before);
  assert.notEqual(after, before, `${input.file} unchanged`);
  assert.equal(input.patch(after), after, `${input.file} patch is not idempotent`);
  const source = `${releaseDir}/${input.file}`;
  writeFileSync(path.join(root, source), after);
  files.push({ source, target: input.target, before: input.before });
  console.log(JSON.stringify({ target: input.target, before: input.before, after: sha256(after) }));
}
writeFileSync(path.join(root, "lab/skill-workshop-agent-apply.plan.json"), `${JSON.stringify({ files }, null, 2)}\n`);
