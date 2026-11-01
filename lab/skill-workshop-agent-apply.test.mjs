import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  BRIDGE_BEFORE, EXPERIENCE_REVIEW_BEFORE, OPENCLAW_TOOLS_BEFORE, SERVICE_QUERY_BEFORE,
  patchExperienceReview, patchNativeAttemptBridge, patchOpenClawTools, patchServiceQuery,
} from "./patch-skill-workshop-agent-apply.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const capture = path.join(root, "release/captured/v2026.9.1-db91.6-unified-session-20261027");
const fixtures = path.join(root, "lab/fixtures/skill-workshop-agent-apply");
const release = path.join(root, "lab/release-files/skill-workshop-agent-apply");
const read = (file) => fs.readFileSync(file, "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const cases = [
  ["service-query-Bt8YN8NM.js", path.join(fixtures, "service-query-Bt8YN8NM.js"), SERVICE_QUERY_BEFORE, patchServiceQuery],
  ["openclaw-tools-BODVdJQD.js", path.join(capture, "dist/openclaw-tools-BODVdJQD.js"), OPENCLAW_TOOLS_BEFORE, patchOpenClawTools],
  ["experience-review-default-Dr4f0pMZ.js", path.join(fixtures, "experience-review-default-Dr4f0pMZ.js"), EXPERIENCE_REVIEW_BEFORE, patchExperienceReview],
  ["native-attempt-bridge.mjs", path.join(capture + ".worker", "dist/native-attempt-bridge.mjs"), BRIDGE_BEFORE, patchNativeAttemptBridge],
];

test("release files are the patch applied to V's bytes, and the patch is idempotent", () => {
  for (const [name, source, before, patch] of cases) {
    const original = read(source);
    assert.equal(sha256(original), before, `${name} input is not V's bytes`);
    const patched = patch(original);
    assert.equal(patched, read(path.join(release, name)), `${name} release file is stale; run lab/build-skill-workshop-agent-apply.mjs`);
    assert.equal(patch(patched), patched, `${name} patch is not idempotent`);
  }
});

test("patch refuses bytes that are not V's", () => {
  for (const [name, source, , patch] of cases) {
    assert.throws(() => patch(`${read(source)}\n// drift\n`), /not V's bytes/u, name);
  }
});

test("ownership: explicit agent updates pass; autonomous captures and composites keep the gate", () => {
  const patched = read(path.join(release, "service-query-Bt8YN8NM.js"));
  assert.match(patched, /vExplicitAgentUpdate = input\.eventActor\?\.type === "agent" && record\.autonomousCapture !== true && !vComposite && process\.env\.OPENCLAW_V_WORKSHOP_AGENT_USER_SKILLS !== "0"/u);
  assert.match(patched, /record\.kind === "update" && !operatorActor && !vExplicitAgentUpdate && !isWorkshopOwnedSkillDir/u);
  assert.match(patched, /existsSync\(path\.join\(record\.target\.skillDir, "COMPOSITE\.json"\)\)/u);
  assert.equal(patched.split("does not own this skill path").length - 1, 2, "both refusals keep the upstream wording");
});

test("Worker proxy is skipped only for proposal-only review tools", () => {
  const patched = read(path.join(release, "openclaw-tools-BODVdJQD.js"));
  assert.match(patched, /if \(typeof workerToolProxy === "function" && options\.proposalOnly !== true\) return await workerToolProxy\(\{/u);
});

test("review keeps the turn's auth profile only for its own provider", () => {
  const patched = read(path.join(release, "experience-review-default-Dr4f0pMZ.js"));
  assert.match(patched, /candidate\.ctx\.authProfileId && candidate\.ctx\.authProfileId\.startsWith\(`\$\{modelProviderId\}:`\)/u);
});

test("native-attempt bridge passes local Workshop reviews and still rejects unknown runs", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-bridge-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.copyFileSync(path.join(release, "native-attempt-bridge.mjs"), path.join(dir, "native-attempt-bridge.mjs"));
  fs.writeFileSync(path.join(dir, "native-harness-data.mjs"), "export const applyNativeHarnessData = (input) => input;\n");
  fs.writeFileSync(path.join(dir, "harness-event-contract.mjs"), "export const isBridgedHarnessEventCallback = () => true;\n");
  fs.writeFileSync(path.join(dir, "user-turn-ownership.mjs"), "export const acknowledgeGatewayPersistedUserTurn = () => false;\n");
  const { createNativeAttemptBridge } = await import(pathToFileURL(path.join(dir, "native-attempt-bridge.mjs")).href);
  const bridge = createNativeAttemptBridge();

  const review = { runId: "skill-workshop-review:5c73d3bf-a16f-4080-a222-9d0000000000", sessionId: "s", agentId: "makaron" };
  assert.equal(bridge.prepare(review), review, "local review attempt passes unchanged");
  assert.equal(bridge.bind({ runId: review.runId, sessionId: "s" }), undefined, "local review bind is a no-op");

  assert.throws(() => bridge.prepare({ runId: "turn-1", sessionId: "s", agentId: "makaron" }), /Worker native attempt is no longer active/u);
  assert.throws(() => bridge.bind({ runId: "turn-1", sessionId: "s" }), /Worker native attempt is no longer active/u);

  // A review id that was admitted over IPC keeps the native checks.
  const controller = new AbortController();
  const release_ = bridge.register({ runId: review.runId, sessionId: "s", agentId: "makaron" }, controller.signal, () => {}, async () => ({}));
  assert.throws(() => bridge.prepare({ ...review, sessionId: "other" }), /identity mismatch/u);
  release_();
});
