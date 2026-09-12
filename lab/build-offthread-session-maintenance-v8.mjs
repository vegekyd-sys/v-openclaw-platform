import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseRelease = "offthread-session-maintenance-20260912-v7";
const sha = value => createHash("sha256").update(value).digest("hex");
const once = (value, from, to) => {
  assert.equal(value.split(from).length, 2, `anchor drift: ${from.slice(0, 120)}`);
  return value.replace(from, to);
};
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

const entry = {
  source: "lab/release-files/session-accessor.sqlite-entry-BlklNPKQ.js",
  target: "openclaw/dist/session-accessor.sqlite-entry-BlklNPKQ.js",
  before: "6edf599b79706345abc89984f0dc05156317e7949dc46f9d6b5042562fad26a3",
};
let entryCandidate = readCode(entry.target, entry.before);
entryCandidate = once(entryCandidate,
  `async function runPendingMaintenance(databasePath, owner) {\n\tconst isCurrent = () => maintenanceByStore.get(databasePath) === owner && owner.database.db.isOpen;\n\twhile (isCurrent()) {\n`,
  `async function runPendingMaintenance(databasePath, owner) {\n\tconst incognito = isIncognitoOpenClawAgentSqlitePath(owner.database.path, {agentId: owner.scope.agentId, env: owner.scope.env});\n\t// File-backed maintenance is owned by the physical store, not by one cached\n\t// SQLite handle. The handle that queued the work may close while the quiet\n\t// window or isolated planner is running; commit paths reopen and revalidate\n\t// the store under the native writer lane. Incognito stores remain tied to the\n\t// process-local handle because they have no stable physical owner.\n\tconst isCurrent = () => maintenanceByStore.get(databasePath) === owner && (!incognito || owner.database.db.isOpen);\n\twhile (isCurrent()) {\n`,
);
entryCandidate = once(entryCandidate,
  `\t\tconst incognito = isIncognitoOpenClawAgentSqlitePath(owner.database.path, {agentId: owner.scope.agentId, env: owner.scope.env});\n\t\tconst currentAdmissionIdentities`,
  `\t\tconst currentAdmissionIdentities`,
);
entryCandidate = once(entryCandidate,
  `\t\t\t\t: acquireAutomaticMaintenancePermit(owner.database, tryAcquireExclusiveSqliteCoordinator, {\n\t\t\t\t\tonReleaseError:`,
  `\t\t\t\t: acquireAutomaticMaintenancePermit(owner.database, tryAcquireExclusiveSqliteCoordinator, {\n\t\t\t\t\tallowClosedFileOwner: true,\n\t\t\t\t\tonReleaseError:`,
);
entryCandidate = once(entryCandidate,
  `\t\t\tif (plan?.plannedEntryArchives?.length) plan = await runExclusiveSqliteSessionWrite(owner.scope, async () => {\n\t\t\t\tif (!isCurrent()) return;\n\t\t\t\tplan = filterAutomaticSessionMaintenancePlan(plan, currentAdmissionIdentities());\n\t\t\t\treturn withSqliteBeginContentionRetry({database: owner.database.db,\n`,
  `\t\t\tif (plan?.plannedEntryArchives?.length) plan = await runExclusiveSqliteSessionWrite(owner.scope, async () => {\n\t\t\t\tif (!isCurrent()) return;\n\t\t\t\tconst currentDatabase = openOpenClawAgentDatabase(toDatabaseOptions(owner.scope));\n\t\t\t\towner.database = currentDatabase;\n\t\t\t\tplan = filterAutomaticSessionMaintenancePlan(plan, currentAdmissionIdentities());\n\t\t\t\treturn withSqliteBeginContentionRetry({database: currentDatabase.db,\n`,
);
entryCandidate = once(entryCandidate,
  `\t\tif (!owner.database.db.isOpen || owner.generation === generation) {\n`,
  `\t\tif ((incognito && !owner.database.db.isOpen) || owner.generation === generation) {\n`,
);
assert.equal(entryCandidate, fs.readFileSync(path.join(root, entry.source), "utf8"), "v8 entry candidate differs from deterministic patch");

const coordinator = {
  source: "lab/release-files/automatic-maintenance-coordinator.mjs",
  target: "openclaw/dist/automatic-maintenance-coordinator.mjs",
  before: "3d58ded08cad686cf505a30975aae3eb856a2c6fde85ee854d7f5b56fa3cc01b",
};
let coordinatorCandidate = readCode(coordinator.target, coordinator.before);
coordinatorCandidate = once(coordinatorCandidate,
  `  if (!database.db.isOpen) return null;\n`,
  `  if (!database.db.isOpen && options.allowClosedFileOwner !== true) return null;\n`,
);
coordinatorCandidate = once(coordinatorCandidate,
  `      const currentDatabaseOpen = currentDatabase?.path === database.path && currentDatabase?.db?.isOpen === true;\n      if (!success || !currentDatabaseOpen || cooldownMs === 0) { release(); return; }\n`,
  `      const currentDatabaseOwned = currentDatabase?.path === database.path &&\n        (currentDatabase?.db?.isOpen === true || options.allowClosedFileOwner === true);\n      if (!success || !currentDatabaseOwned || cooldownMs === 0) { release(); return; }\n`,
);
assert.equal(coordinatorCandidate, fs.readFileSync(path.join(root, coordinator.source), "utf8"), "v8 coordinator candidate differs from deterministic patch");

const planner = {
  source: "lab/release-files/automatic-session-maintenance-planner.mjs",
  target: "openclaw/dist/automatic-session-maintenance-planner.mjs",
  before: "a31e3d2af312b0be8d309b58684ca4224a42ce4be756c789274c2f499f9cd032",
};
let plannerCandidate = readCode(planner.target, planner.before);
plannerCandidate = once(plannerCandidate,
  `  const child = spawn(process.execPath, [\n    \`--max-old-space-size=\${maxOldGenerationSizeMb}\`,\n    fileURLToPath(url),\n  ], {\n`,
  `  const nodeArgs = [\n    \`--max-old-space-size=\${maxOldGenerationSizeMb}\`,\n    fileURLToPath(url),\n  ];\n  // Keep a global read scan below foreground Gateway and Agent Worker CPU work.\n  // nice(1) execs Node in place, so the IPC channel remains the child channel.\n  const useNice = process.platform !== "win32";\n  const child = spawn(useNice ? "/usr/bin/nice" : process.execPath, useNice ? ["-n", "10", process.execPath, ...nodeArgs] : nodeArgs, {\n`,
);
assert.equal(plannerCandidate, fs.readFileSync(path.join(root, planner.source), "utf8"), "v8 planner candidate differs from deterministic patch");

const files = [
  {...entry, candidate: sha(entryCandidate)},
  {...coordinator, candidate: sha(coordinatorCandidate)},
  {...planner, candidate: sha(plannerCandidate)},
];
console.log(JSON.stringify({baseRelease, files}, null, 2));
