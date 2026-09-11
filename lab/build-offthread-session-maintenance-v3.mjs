import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = "openclaw/dist/session-accessor.sqlite-entry-BlklNPKQ.js";
const sourcePath = "lab/release-files/session-accessor.sqlite-entry-BlklNPKQ.js";
const baseRelease = "offthread-session-maintenance-20260912-v2";
const expectedBefore = "45cfdf6b9313d0492dd7e59486591af6287a90f446b74b832e205a7f8ab5580e";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const once = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `anchor drift: ${before.slice(0, 120)}`);
  return source.replace(before, after);
};

const result = JSON.parse(execFileSync(process.execPath, [
  "/Users/tianyicai/vlab-dev/lab/vlab.mjs",
  "read-code",
  "--repo",
  "/Users/tianyicai/vlab-dev",
  "--target",
  target,
], { encoding: "utf8", maxBuffer: 20 * 1024 ** 2 }));
const baseline = Buffer.from(result.content, "base64").toString();
assert.equal(result.current.release, baseRelease);
assert.equal(result.sha256, expectedBefore);
assert.equal(sha(baseline), expectedBefore);

let candidate = once(baseline,
  'const maintenanceByStore = /* @__PURE__ */ new Map();\n',
  'const maintenanceByStore = /* @__PURE__ */ new Map();\nconst AUTOMATIC_MAINTENANCE_IDLE_POLL_MS = 250;\nconst AUTOMATIC_MAINTENANCE_IDLE_POLLS = 120;\nasync function waitForAutomaticMaintenanceAdmissionsToDrain(isCurrent, currentAdmissionIdentities) {\n\tfor (let remaining = AUTOMATIC_MAINTENANCE_IDLE_POLLS; isCurrent() && currentAdmissionIdentities().size > 0; remaining -= 1) {\n\t\tif (remaining <= 0) return false;\n\t\tawait new Promise((resolve) => setTimeout(resolve, AUTOMATIC_MAINTENANCE_IDLE_POLL_MS));\n\t}\n\treturn isCurrent();\n}\n',
);
candidate = once(candidate,
  '\t\t\t\t\tstorePath: owner.storePath\n\t\t\t\t});\n\t\t\tplan = filterAutomaticSessionMaintenancePlan(plan, currentAdmissionIdentities());\n\t\t\tif (!isCurrent()) plan = void 0;\n',
  '\t\t\t\t\tstorePath: owner.storePath\n\t\t\t\t});\n\t\t\t// Planning is read-only and can overlap active work. Archive commits and\n\t\t\t// deletion transactions are best-effort background writes: never let them\n\t\t\t// enter SQLite while a real Agent turn for this store is still admitted.\n\t\t\tif (!incognito && !await waitForAutomaticMaintenanceAdmissionsToDrain(isCurrent, currentAdmissionIdentities)) plan = void 0;\n\t\t\tif (plan) plan = filterAutomaticSessionMaintenancePlan(plan, currentAdmissionIdentities());\n\t\t\tif (!isCurrent()) plan = void 0;\n',
);
const candidatePath = path.join(root, sourcePath);
assert.equal(candidate, fs.readFileSync(candidatePath, "utf8"), "v3 candidate differs from deterministic patch");
console.log(JSON.stringify({
  baseRelease,
  file: { source: sourcePath, target, before: expectedBefore, candidate: sha(candidate) },
}, null, 2));
