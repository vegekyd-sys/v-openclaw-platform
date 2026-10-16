// Builds the codex-process-inspection-budget release from V's exact bytes of the Codex plugin
// (lab/fixtures/codex-process-inspection, captured from V 2026-10-17). Never touches a live runtime.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PLUGIN_DIST, TRANSPORT_BEFORE, TRANSPORT_FILE, patchCodexProcessInspectionBudget } from "./patch-codex-process-inspection-budget.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const source = readFileSync(path.join(root, "lab/fixtures/codex-process-inspection", TRANSPORT_FILE), "utf8");
assert.equal(sha256(source), TRANSPORT_BEFORE, "fixture is not V's bytes");
const after = patchCodexProcessInspectionBudget(source);
const out = `lab/release-files/codex-process-inspection/${TRANSPORT_FILE}`;
mkdirSync(path.join(root, path.dirname(out)), { recursive: true });
writeFileSync(path.join(root, out), after);
const files = [{ source: out, target: `${PLUGIN_DIST}/${TRANSPORT_FILE}`, before: TRANSPORT_BEFORE }];
writeFileSync(path.join(root, "lab/codex-process-inspection-budget.plan.json"), `${JSON.stringify({ files }, null, 2)}\n`);
console.log(JSON.stringify({ file: TRANSPORT_FILE, before: TRANSPORT_BEFORE, after: sha256(after) }));
