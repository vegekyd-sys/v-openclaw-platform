import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseRelease = "offthread-session-maintenance-20260912-v9";
const sha = value => createHash("sha256").update(value).digest("hex");
const once = (value, from, to) => {
  assert.equal(value.split(from).length, 2, `anchor drift: ${from.slice(0, 120)}`);
  return value.replace(from, to);
};
const insertAfter = (value, anchor, addition) => once(value, anchor, anchor + addition);
function readCode(target, expectedHash) {
  const result = JSON.parse(execFileSync(process.execPath, [
    "/Users/tianyicai/vlab-dev/lab/vlab.mjs", "read-code", "--repo", "/Users/tianyicai/vlab-dev", "--target", target,
  ], { encoding: "utf8", maxBuffer: 20 * 1024 ** 2 }));
  assert.equal(result.current.release, baseRelease);
  assert.equal(result.sha256, expectedHash);
  const value = Buffer.from(result.content, "base64").toString();
  assert.equal(sha(value), expectedHash);
  return value;
}

const file = {
  source: "lab/release-files/session-accessor.sqlite-entry-BlklNPKQ.js",
  target: "openclaw/dist/session-accessor.sqlite-entry-BlklNPKQ.js",
  before: "1264183c10756da00e0d4fd2c34429439c531fbbab9730b3c0e863fda0b8fecb",
};
let candidate = readCode(file.target, file.before);
candidate = insertAfter(candidate,
  `const AUTOMATIC_MAINTENANCE_IDLE_POLLS = 120;\n`,
  `function traceAutomaticMaintenance(stage, databasePath, owner, details = {}) {\n` +
  `\tif (process.env.OPENCLAW_DB91_MAINTENANCE_TRACE !== "1") return;\n` +
  `\tconst current = maintenanceByStore.get(databasePath);\n` +
  `\tgetChildLogger({subsystem: "session-sqlite"}).warn("SQLite automatic maintenance trace", {\n` +
  `\t\tstage,\n\t\tpid: process.pid,\n\t\tcurrentOwner: current === owner,\n` +
  `\t\tcurrentGeneration: current?.generation,\n\t\townerGeneration: owner.generation,\n` +
  `\t\tdatabaseOpen: owner.database.db.isOpen,\n\t\t...details\n\t});\n}\n`,
);
candidate = insertAfter(candidate,
  `\t\tObject.assign(owner, params, { database, generation: owner.generation + 1 });\n`,
  `\t\ttraceAutomaticMaintenance("kick-coalesced", databasePath, owner);\n`,
);
candidate = insertAfter(candidate,
  `\tmaintenanceByStore.set(databasePath, created);\n`,
  `\ttraceAutomaticMaintenance("kick-created", databasePath, created);\n`,
);
candidate = insertAfter(candidate,
  `\tconst isCurrent = () => maintenanceByStore.get(databasePath) === owner && (!incognito || owner.database.db.isOpen);\n`,
  `\ttraceAutomaticMaintenance("run-start", databasePath, owner, {incognito});\n`,
);
candidate = insertAfter(candidate,
  `\t\tif (!permit) {\n`,
  `\t\t\ttraceAutomaticMaintenance("permit-missing", databasePath, owner);\n`,
);
candidate = once(candidate,
  `\t\t\treturn;\n\t\t}\n\t\tlet completed = false;\n`,
  `\t\t\treturn;\n\t\t}\n` +
  `\t\ttraceAutomaticMaintenance("permit-acquired", databasePath, owner);\n` +
  `\t\tlet completed = false;\n`,
);
candidate = insertAfter(candidate,
  `\t\t\tif (!incognito && !quietWindow) {\n`,
  `\t\t\t\ttraceAutomaticMaintenance("quiet-window-missing", databasePath, owner);\n`,
);
candidate = once(candidate,
  `\t\t\t\treturn;\n\t\t\t}\n\t\t\tgeneration = owner.generation;\n`,
  `\t\t\t\treturn;\n\t\t\t}\n` +
  `\t\t\ttraceAutomaticMaintenance("quiet-window-ready", databasePath, owner);\n` +
  `\t\t\tgeneration = owner.generation;\n`,
);
candidate = once(candidate,
  `\t\t\tif (!incognito && await quietWindow.changed()) {\n`,
  `\t\t\ttraceAutomaticMaintenance("plan-resolved", databasePath, owner, {\n` +
  `\t\t\t\tentryRemovals: plan?.entryRemovals?.length,\n` +
  `\t\t\t\tstateDeletePlans: plan?.stateDeletePlans?.length\n\t\t\t});\n` +
  `\t\t\tconst changedAfterPlan = !incognito && await quietWindow.changed();\n` +
  `\t\t\ttraceAutomaticMaintenance("plan-revalidated", databasePath, owner, {\n` +
  `\t\t\t\tchangedAfterPlan,\n\t\t\t\tadmissions: currentAdmissionIdentities().size\n\t\t\t});\n` +
  `\t\t\tif (changedAfterPlan) {\n`,
);
candidate = once(candidate,
  `\t\t\tif (!incognito && !await waitForAutomaticMaintenanceAdmissionsToDrain(isCurrent, currentAdmissionIdentities)) {\n`,
  `\t\t\tconst admissionsDrained = incognito || await waitForAutomaticMaintenanceAdmissionsToDrain(isCurrent, currentAdmissionIdentities);\n` +
  `\t\t\ttraceAutomaticMaintenance("admissions-drained", databasePath, owner, {\n` +
  `\t\t\t\tadmissions: currentAdmissionIdentities().size,\n` +
  `\t\t\t\tadmissionsDrained\n\t\t\t});\n` +
  `\t\t\tif (!admissionsDrained) {\n`,
);
candidate = insertAfter(candidate,
  `\t\t\tif (!plan) {\n`,
  `\t\t\t\ttraceAutomaticMaintenance("plan-discarded", databasePath, owner, {retryAfterForegroundActivity});\n`,
);
candidate = insertAfter(candidate,
  `\t\t\tconst archiveBytesBySessionId = plan.automaticArchiveBytesBySessionId\n\t\t\t\t? new Map(plan.automaticArchiveBytesBySessionId)\n\t\t\t\t: void 0;\n`,
  `\t\t\ttraceAutomaticMaintenance("finalizer-start", databasePath, owner, {\n` +
  `\t\t\t\tentryRemovals: plan.entryRemovals?.length,\n` +
  `\t\t\t\tstateDeletePlans: plan.stateDeletePlans?.length\n\t\t\t});\n`,
);
candidate = insertAfter(candidate,
  `\t\t\tawait finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort(owner.scope, [plan], { isCurrent, archiveBytesBySessionId });\n`,
  `\t\t\ttraceAutomaticMaintenance("finalizer-finished", databasePath, owner);\n`,
);
candidate = once(candidate,
  `\t\t\tcompleted = true;\n\t\t} catch (error) {\n`,
  `\t\t\tcompleted = true;\n\t\t} catch (error) {\n` +
  `\t\t\ttraceAutomaticMaintenance("failed", databasePath, owner, {\n` +
  `\t\t\t\terrorName: error instanceof Error ? error.name : typeof error\n\t\t\t});\n`,
);
candidate = once(candidate,
  `\t\t\t}\n\t\t} finally {\n\t\t\tpermit.finish(completed, owner.database);\n`,
  `\t\t\t}\n\t\t} finally {\n` +
  `\t\t\ttraceAutomaticMaintenance("permit-finish", databasePath, owner, {completed, retryAfterForegroundActivity});\n` +
  `\t\t\tpermit.finish(completed, owner.database);\n`,
);
assert.equal(candidate, fs.readFileSync(path.join(root, file.source), "utf8"), "v10 trace candidate differs from deterministic patch");

console.log(JSON.stringify({baseRelease, files: [{...file, candidate: sha(candidate)}]}, null, 2));
