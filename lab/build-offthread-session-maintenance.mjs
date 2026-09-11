import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entryTarget = "openclaw/dist/session-accessor.sqlite-entry-BlklNPKQ.js";
const expectedBefore = "6b12190ca8e975ea6c8bce6703af805e01a1ef492e83f4829a6fe0f90669d96b";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const once = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `anchor drift: ${before.slice(0, 120)}`);
  return source.replace(before, after);
};

export function patchOffthreadSessionMaintenance(source) {
  let output = once(
    source,
    'import {acquireAutomaticMaintenancePermit} from "./automatic-maintenance-coordinator.mjs";\n',
    'import {acquireAutomaticMaintenancePermit} from "./automatic-maintenance-coordinator.mjs";\nimport {filterAutomaticSessionMaintenancePlan, runAutomaticSessionMaintenancePlan} from "./automatic-session-maintenance-planner.mjs";\n',
  );
  output = once(
    output,
    'import {commitPlannedSessionMaintenanceArchives} from "./session-history-eviction-d5aiCsHS.js";\n',
    'import {commitPlannedSessionMaintenanceArchives} from "./session-history-eviction-d5aiCsHS.js";\nimport {s as resolveMaintenanceConfig} from "./disk-budget-BzLS0kmH.js";\nimport {i as collectActiveSessionWorkAdmissions} from "./session-lifecycle-admission-siUq03Jk.js";\n',
  );
  output = once(
    output,
    '\t\tconst activeSessionKeys = [...owner.activeSessionKeys];\n',
    '\t\tconst currentAdmissionIdentities = () => collectActiveSessionWorkAdmissions().get(owner.storePath) ?? /* @__PURE__ */ new Set();\n\t\tconst activeSessionKeys = uniqueStrings([...owner.activeSessionKeys, ...currentAdmissionIdentities()]);\n',
  );
  const before = `\t\ttry {
\t\t\tconst plan = await runExclusiveSqliteSessionWrite(owner.scope, async () => {
\t\t\t\tif (!isCurrent()) return;
\t\t\t\t// Global selection runs in a native deferred read snapshot, not BEGIN
\t\t\t\t// IMMEDIATE. Foreground writers in other processes remain unblocked.
\t\t\t\tconst planned = runSqliteDeferredTransactionSync(owner.database.db, () => applySessionEntryMaintenance(owner.database, {
\t\t\t\t\tactiveSessionKeys,
\t\t\t\t\tarchiveDirectory: owner.archiveDirectory,
\t\t\t\t\tmaintenanceConfig: owner.maintenanceConfig,
\t\t\t\t\tstorePath: owner.storePath,
\t\t\t\t\tplanOnly: true
\t\t\t\t}));
\t\t\t\tif (!planned.plannedEntryArchives?.length) return planned;
\t\t\t\treturn withSqliteBeginContentionRetry({database: owner.database.db,
\t\t\t\t\trun: operation => runOpenClawAgentWriteTransaction(operation, toDatabaseOptions(owner.scope)),
\t\t\t\t\toperation: database => isCurrent() ? commitPlannedSessionMaintenanceArchives(database, planned) : void 0});
\t\t\t});`;
  const after = `\t\ttry {
\t\t\tconst incognito = isIncognitoOpenClawAgentSqlitePath(owner.database.path, {agentId: owner.scope.agentId, env: owner.scope.env});
\t\t\tconst maintenanceConfig = owner.maintenanceConfig ?? resolveMaintenanceConfig();
\t\t\t// A file-backed store can require a multi-second global read scan. Keep that
\t\t\t// synchronous SQLite work off the request-owning Gateway/Worker event loop.
\t\t\t// Incognito stores are process-local and retain the native inline path.
\t\t\tlet plan = incognito
\t\t\t\t? runSqliteDeferredTransactionSync(owner.database.db, () => applySessionEntryMaintenance(owner.database, {
\t\t\t\t\tactiveSessionKeys,
\t\t\t\t\tarchiveDirectory: owner.archiveDirectory,
\t\t\t\t\tmaintenanceConfig,
\t\t\t\t\tstorePath: owner.storePath,
\t\t\t\t\tplanOnly: true
\t\t\t\t}))
\t\t\t\t: await runAutomaticSessionMaintenancePlan({
\t\t\t\t\tactiveSessionKeys,
\t\t\t\t\tagentId: owner.scope.agentId,
\t\t\t\t\tarchiveDirectory: owner.archiveDirectory,
\t\t\t\t\tmaintenanceConfig,
\t\t\t\t\tstorePath: owner.storePath
\t\t\t\t});
\t\t\tplan = filterAutomaticSessionMaintenancePlan(plan, currentAdmissionIdentities());
\t\t\tif (!isCurrent()) plan = void 0;
\t\t\tif (plan?.plannedEntryArchives?.length) plan = await runExclusiveSqliteSessionWrite(owner.scope, async () => {
\t\t\t\tif (!isCurrent()) return;
\t\t\t\tplan = filterAutomaticSessionMaintenancePlan(plan, currentAdmissionIdentities());
\t\t\t\treturn withSqliteBeginContentionRetry({database: owner.database.db,
\t\t\t\t\trun: operation => runOpenClawAgentWriteTransaction(operation, toDatabaseOptions(owner.scope)),
\t\t\t\t\toperation: database => isCurrent() ? commitPlannedSessionMaintenanceArchives(database, plan) : void 0});
\t\t\t});`;
  output = once(output, before, after);
  return once(
    output,
    '\t\t\tawait finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort(owner.scope, [plan], { isCurrent });\n',
    '\t\t\tplan = filterAutomaticSessionMaintenancePlan(plan, currentAdmissionIdentities());\n\t\t\tawait finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort(owner.scope, [plan], { isCurrent });\n',
  );
}

const result = JSON.parse(execFileSync(process.execPath, [
  "/Users/tianyicai/vlab-dev/lab/vlab.mjs",
  "read-code",
  "--repo",
  "/Users/tianyicai/vlab-dev",
  "--target",
  entryTarget,
], { encoding: "utf8", maxBuffer: 10 * 1024 ** 2 }));
const baseline = Buffer.from(result.content, "base64").toString();
assert.equal(result.sha256, expectedBefore);
assert.equal(sha(baseline), expectedBefore);
const candidate = patchOffthreadSessionMaintenance(baseline);
const candidatePath = path.join(root, "lab/release-files/session-accessor.sqlite-entry-BlklNPKQ.js");
assert.equal(candidate, fs.readFileSync(candidatePath, "utf8"), "committed candidate differs from deterministic patch");

const plan = {
  baseRelease: result.current.release,
  files: [
    { source: "lab/release-files/session-accessor.sqlite-entry-BlklNPKQ.js", target: entryTarget, before: expectedBefore },
    { source: "lab/release-files/automatic-session-maintenance-planner.mjs", target: "openclaw/dist/automatic-session-maintenance-planner.mjs", before: null },
    { source: "lab/release-files/automatic-session-maintenance.worker.mjs", target: "openclaw/dist/automatic-session-maintenance.worker.mjs", before: null },
  ],
};
fs.writeFileSync(path.join(root, "lab/offthread-session-maintenance-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({ candidateSha: sha(candidate), ...plan }));
