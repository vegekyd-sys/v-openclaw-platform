import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseRelease = "offthread-session-maintenance-20260912-v3";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const once = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `anchor drift: ${before.slice(0, 120)}`);
  return source.replace(before, after);
};
const targets = {
  history: {
    source: "lab/release-files/session-history-eviction-d5aiCsHS.js",
    target: "openclaw/dist/session-history-eviction-d5aiCsHS.js",
    before: "e013d6d541770dc2a8622a196e6a448f928fbf46c3ae7467537a750278ff9e04",
  },
  planner: {
    source: "lab/release-files/automatic-session-maintenance-planner.mjs",
    target: "openclaw/dist/automatic-session-maintenance-planner.mjs",
    before: "1c2bef4559e424d9face2d79c8f9a13e6d8cad001052e9969f8581b316a40c9f",
  },
  worker: {
    source: "lab/release-files/automatic-session-maintenance.worker.mjs",
    target: "openclaw/dist/automatic-session-maintenance.worker.mjs",
    before: "cf9d00f55d8e2bc05590ace24c3026d502d1a5f16b323fc4b8a24c9cd93001f0",
  },
};

function readCode(target) {
  const result = JSON.parse(execFileSync(process.execPath, [
    "/Users/tianyicai/vlab-dev/lab/vlab.mjs",
    "read-code",
    "--repo",
    "/Users/tianyicai/vlab-dev",
    "--target",
    target.target,
  ], { encoding: "utf8", maxBuffer: 20 * 1024 ** 2 }));
  const source = Buffer.from(result.content, "base64").toString();
  assert.equal(result.current.release, baseRelease);
  assert.equal(result.sha256, target.before);
  assert.equal(sha(source), target.before);
  return source;
}

function patchHistory(source) {
  return once(source,
    "applySessionEntryMaintenance as a, emitCommittedLifecycleIdentityMutations as c,",
    "applySessionEntryMaintenance as a, buildSessionMaintenanceBatches as b, emitCommittedLifecycleIdentityMutations as c,",
  );
}

function patchPlanner(source) {
  return once(source,
    "/** Remove work that became active after the isolated read snapshot began. */\nexport function filterAutomaticSessionMaintenancePlan",
    `/** Return at most one native cleanup batch so Worker-to-Gateway transfer and
 * owner-process revalidation stay bounded even for a multi-thousand-session
 * backlog. The full read-only scan still chooses the same oldest candidates. */
export function boundAutomaticSessionMaintenancePlan(plan, buildBatches) {
  if (typeof buildBatches !== "function") throw new Error("Automatic maintenance batch builder is required");
  const automaticArchiveBytesBySessionId = plan.automaticArchiveBytesBySessionId ?? [];
  const [batch] = buildBatches({
    archiveBytesBySessionId: new Map(automaticArchiveBytesBySessionId),
    entryRemovals: plan.entryRemovals,
    stateDeletePlans: plan.stateDeletePlans,
  });
  const entryRemovals = batch?.entryRemovals ?? [];
  const stateDeletePlans = batch?.stateDeletePlans ?? [];
  const retainedStateIds = new Set(stateDeletePlans.map((item) => item.sessionId));
  const boundedArchiveBytes = automaticArchiveBytesBySessionId.filter(([sessionId]) => retainedStateIds.has(sessionId));
  const plannedEntryArchives = plan.plannedEntryArchives?.slice(0, 64);
  const retainedArchiveKeys = new Set(plannedEntryArchives?.map((item) => item.sessionKey) ?? []);
  const archivedWorktrees = plan.archivedWorktrees?.filter((item) => retainedArchiveKeys.has(item.sessionKey));
  const counts = { modelRunPruned: 0, pruned: 0, capped: 0 };
  for (const removal of entryRemovals) {
    if (removal.maintenanceReason === "model-run-pruned") counts.modelRunPruned += 1;
    else if (removal.maintenanceReason === "pruned") counts.pruned += 1;
    else if (removal.maintenanceReason === "capped") counts.capped += 1;
  }
  const automaticPlanSummary = {
    truncated: entryRemovals.length < plan.entryRemovals.length ||
      stateDeletePlans.length < plan.stateDeletePlans.length ||
      (plannedEntryArchives?.length ?? 0) < (plan.plannedEntryArchives?.length ?? 0),
    entryRemovalsTotal: plan.entryRemovals.length,
    plannedEntryArchivesTotal: plan.plannedEntryArchives?.length ?? 0,
    stateDeletePlansTotal: plan.stateDeletePlans.length,
  };
  return {
    ...plan,
    ...plannedEntryArchives ? { plannedEntryArchives, archived: plannedEntryArchives.length } : { archived: 0 },
    ...archivedWorktrees ? { archivedWorktrees } : {},
    ...counts,
    entryRemovals,
    stateDeletePlans,
    automaticArchiveBytesBySessionId: boundedArchiveBytes,
    automaticPlanSummary,
  };
}

/** Remove work that became active after the isolated read snapshot began. */
export function filterAutomaticSessionMaintenancePlan`,
  );
}

function patchWorker(source) {
  let output = once(source,
    'import { a as applySessionEntryMaintenance } from "./session-history-eviction-d5aiCsHS.js";\n',
    'import { boundAutomaticSessionMaintenancePlan } from "./automatic-session-maintenance-planner.mjs";\nimport { a as applySessionEntryMaintenance, b as buildSessionMaintenanceBatches } from "./session-history-eviction-d5aiCsHS.js";\n',
  );
  return once(output,
    "  return { ...plan, automaticArchiveBytesBySessionId: [...bytes] };\n",
    "  return boundAutomaticSessionMaintenancePlan({\n    ...plan,\n    automaticArchiveBytesBySessionId: [...bytes],\n  }, buildSessionMaintenanceBatches);\n",
  );
}

const patchers = { history: patchHistory, planner: patchPlanner, worker: patchWorker };
const files = [];
for (const [name, target] of Object.entries(targets)) {
  const candidate = patchers[name](readCode(target));
  const candidatePath = path.join(root, target.source);
  assert.equal(candidate, fs.readFileSync(candidatePath, "utf8"), `${name} candidate differs from deterministic patch`);
  files.push({ ...target, candidate: sha(candidate) });
}
console.log(JSON.stringify({ baseRelease, files }, null, 2));
