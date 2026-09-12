import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseRelease = "offthread-session-maintenance-20260912-v6";
const source = "lab/release-files/session-accessor.sqlite-entry-BlklNPKQ.js";
const target = "openclaw/dist/session-accessor.sqlite-entry-BlklNPKQ.js";
const before = "29fe4c0848cb9ad4e17e891a376aa1324b17a939f329e80551d5ef691b54a274";
const coordinatorSource = "lab/release-files/automatic-maintenance-coordinator.mjs";
const coordinatorTarget = "openclaw/dist/automatic-maintenance-coordinator.mjs";
const coordinatorBefore = "276b63f98c2b1432a3224ac27d033695aee062c7db31479a29223e77e6b956f1";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const once = (value, from, to) => {
  assert.equal(value.split(from).length, 2, `anchor drift: ${from.slice(0, 120)}`);
  return value.replace(from, to);
};

function readCode(runtimeTarget, expectedHash) {
  const result = JSON.parse(execFileSync(process.execPath, [
    "/Users/tianyicai/vlab-dev/lab/vlab.mjs", "read-code", "--repo", "/Users/tianyicai/vlab-dev", "--target", runtimeTarget,
  ], { encoding: "utf8", maxBuffer: 20 * 1024 ** 2 }));
  assert.equal(result.current.release, baseRelease);
  assert.equal(result.sha256, expectedHash);
  const value = Buffer.from(result.content, "base64").toString();
  assert.equal(sha(value), expectedHash);
  return value;
}

let candidate = readCode(target, before);
candidate = once(candidate,
  `\tconst owner = maintenanceByStore.get(databasePath);\n\tif (owner?.database === database) {\n\t\towner.activeSessionKeys.add(params.activeSessionKey);\n\t\tObject.assign(owner, params, { generation: owner.generation + 1 });\n\t\treturn;\n\t}\n`,
  `\tconst owner = maintenanceByStore.get(databasePath);\n\tconst fileBackedOwner = owner && !isIncognitoOpenClawAgentSqlitePath(database.path, {agentId: params.scope.agentId, env: params.scope.env});\n\tif (owner?.database === database || fileBackedOwner) {\n\t\towner.activeSessionKeys.add(params.activeSessionKey);\n\t\t// A long quiet wait can outlive one cached SQLite handle. Rebind the same\n\t\t// physical file-backed owner instead of replacing it while its coordinator\n\t\t// permit is still held. Incognito generations remain object-identity scoped.\n\t\tObject.assign(owner, params, { database, generation: owner.generation + 1 });\n\t\treturn;\n\t}\n`,
);
candidate = once(candidate,
  `\t\t\tpermit.finish(completed);\n`,
  `\t\t\tpermit.finish(completed, owner.database);\n`,
);
const expected = fs.readFileSync(path.join(root, source), "utf8");
assert.equal(candidate, expected, "v7 candidate differs from deterministic patch");
let coordinatorCandidate = readCode(coordinatorTarget, coordinatorBefore);
coordinatorCandidate = once(coordinatorCandidate,
  `    finish(success) {\n      if (finished) return;\n      finished = true;\n      if (!success || !database.db.isOpen || cooldownMs === 0) { release(); return; }\n`,
  `    finish(success, currentDatabase = database) {\n      if (finished) return;\n      finished = true;\n      const currentDatabaseOpen = currentDatabase?.path === database.path && currentDatabase?.db?.isOpen === true;\n      if (!success || !currentDatabaseOpen || cooldownMs === 0) { release(); return; }\n`,
);
const expectedCoordinator = fs.readFileSync(path.join(root, coordinatorSource), "utf8");
assert.equal(coordinatorCandidate, expectedCoordinator, "v7 coordinator differs from deterministic patch");
console.log(JSON.stringify({baseRelease, files: [
  {source, target, before, candidate: sha(candidate)},
  {source: coordinatorSource, target: coordinatorTarget, before: coordinatorBefore, candidate: sha(coordinatorCandidate)},
]}, null, 2));
