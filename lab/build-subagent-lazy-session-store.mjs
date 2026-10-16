// Builds the subagent-lazy-session-store release from V's exact db91.6 bytes
// (lab/fixtures/subagent-lazy-store, captured from V core/dist 2026-10-17). Never touches a
// live runtime.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADMISSION_BEFORE, ADMISSION_FILE, CAPABILITIES_BEFORE, CAPABILITIES_FILE, ENTRY_BEFORE, ENTRY_BEFORE_PR403, ENTRY_FILE,
  patchAdmission, patchCapabilities, patchEntryLookup,
} from "./patch-subagent-lazy-session-store.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = "lab/fixtures/subagent-lazy-store";
const releaseDir = "lab/release-files/subagent-lazy-store";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
mkdirSync(path.join(root, releaseDir), { recursive: true });
const files = [];
for (const [file, before, patch] of [
  [ENTRY_FILE, ENTRY_BEFORE, patchEntryLookup],
  [CAPABILITIES_FILE, CAPABILITIES_BEFORE, patchCapabilities],
  [ADMISSION_FILE, ADMISSION_BEFORE, patchAdmission],
]) {
  const source = readFileSync(path.join(root, fixtures, file), "utf8");
  assert.equal(sha256(source), before, `${file} fixture is not V's bytes`);
  const after = patch(source);
  const out = `${releaseDir}/${file}`;
  writeFileSync(path.join(root, out), after);
  files.push({ source: out, target: `openclaw/dist/${file}`, before });
  console.log(JSON.stringify({ file, before, after: sha256(after) }));
}
writeFileSync(path.join(root, "lab/subagent-lazy-session-store.plan.json"), `${JSON.stringify({ files }, null, 2)}\n`);

// Stacked on PR #403 (not yet on V): use this entry chunk instead when #403 ships first or together.
{
  const source = readFileSync(path.join(root, "lab/release-files/session-sharing-bounded-reads", ENTRY_FILE), "utf8");
  assert.equal(sha256(source), ENTRY_BEFORE_PR403, "PR #403 entry chunk changed");
  const after = patchEntryLookup(source);
  const out = `${releaseDir}/on-pr403/${ENTRY_FILE}`;
  mkdirSync(path.join(root, releaseDir, "on-pr403"), { recursive: true });
  writeFileSync(path.join(root, out), after);
  console.log(JSON.stringify({ file: `on-pr403/${ENTRY_FILE}`, before: ENTRY_BEFORE_PR403, after: sha256(after) }));
}
