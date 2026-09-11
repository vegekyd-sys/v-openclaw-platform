import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const [coreArg, stateArg, configArg, agentId = "makaron"] = process.argv.slice(2);
for (const [label, value] of [["core", coreArg], ["state", stateArg], ["config", configArg]]) {
  assert(value && path.isAbsolute(value), `${label} must be an absolute path`);
}
const core = fs.realpathSync(coreArg);
const state = fs.realpathSync(stateArg);
const configPath = fs.realpathSync(configArg);
assert(core.startsWith("/srv/vlab-production-mirror/"), "verifier is scoped to shared VLab");
assert(state.startsWith("/srv/vlab-production-mirror/"), "verifier is scoped to shared VLab state");
const dist = path.join(core, "dist");
const plannerPath = path.join(dist, "automatic-session-maintenance-planner.mjs");
const diskBudgetPath = path.join(dist, "disk-budget-BzLS0kmH.js");
assert(fs.statSync(plannerPath).isFile());
assert(fs.statSync(diskBudgetPath).isFile());

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const [{runAutomaticSessionMaintenancePlan}, {v: resolveMaintenanceConfigFromInput}] = await Promise.all([
  import(pathToFileURL(plannerPath).href),
  import(pathToFileURL(diskBudgetPath).href),
]);
const agentRoot = path.join(state, "agents", agentId);
const databasePath = path.join(agentRoot, "agent", "openclaw-agent.sqlite");
const storePath = path.join(agentRoot, "sessions", "sessions.json");
const archiveDirectory = path.join(agentRoot, "sessions");
assert(fs.statSync(databasePath).isFile());

const database = new DatabaseSync(databasePath, {readOnly: true});
const before = {
  dataVersion: Number(database.prepare("PRAGMA data_version").get().data_version),
  sessions: Number(database.prepare("SELECT COUNT(*) AS count FROM session_nodes").get().count),
  stat: fs.statSync(databasePath),
};
let eventLoopTurns = 0;
const timer = setInterval(() => eventLoopTurns += 1, 10);
const startedAt = Date.now();
let plan;
try {
  plan = await runAutomaticSessionMaintenancePlan({
    activeSessionKeys: ["agent:makaron:explicit:offthread-verifier-protected"],
    agentId,
    archiveDirectory,
    maintenanceConfig: resolveMaintenanceConfigFromInput(config.session?.maintenance),
    storePath,
  });
} finally {
  clearInterval(timer);
}
const elapsedMs = Date.now() - startedAt;
const after = {
  dataVersion: Number(database.prepare("PRAGMA data_version").get().data_version),
  sessions: Number(database.prepare("SELECT COUNT(*) AS count FROM session_nodes").get().count),
  stat: fs.statSync(databasePath),
};
database.close();
assert.equal(after.dataVersion, before.dataVersion, "database changed during read-only planner probe");
assert.equal(after.sessions, before.sessions, "session count changed during read-only planner probe");
assert.equal(after.stat.size, before.stat.size, "database size changed during read-only planner probe");
assert.equal(after.stat.mtimeMs, before.stat.mtimeMs, "database mtime changed during read-only planner probe");
assert(eventLoopTurns >= 3, `caller event loop advanced only ${eventLoopTurns} times`);
assert(Array.isArray(plan.automaticArchiveBytesBySessionId), "planner did not return precomputed archive sizes");
assert(plan.automaticPlanSummary && typeof plan.automaticPlanSummary === "object", "planner did not return a bounded-plan summary");
const archiveIds = new Set(plan.stateDeletePlans.filter((item) => item.archiveTranscript).map((item) => item.sessionId));
const archiveSizes = new Map(plan.automaticArchiveBytesBySessionId);
assert.equal(archiveSizes.size, plan.automaticArchiveBytesBySessionId.length, "planner returned duplicate archive sizes");
for (const sessionId of archiveIds) assert(archiveSizes.has(sessionId), `planner omitted archive size for ${sessionId}`);
const serializedBytes = Buffer.byteLength(JSON.stringify(plan));
assert(serializedBytes <= 16 * 1024 * 1024, `bounded plan is unexpectedly large: ${serializedBytes} bytes`);
console.log(JSON.stringify({
  agentId,
  elapsedMs,
  eventLoopTurns,
  sessionCount: after.sessions,
  plan: {
    archived: plan.archived,
    capped: plan.capped,
    entryRemovals: plan.entryRemovals.length,
    modelRunPruned: plan.modelRunPruned,
    plannedEntryArchives: plan.plannedEntryArchives?.length ?? 0,
    pruned: plan.pruned,
    stateDeletePlans: plan.stateDeletePlans.length,
    transcriptSizeCount: archiveSizes.size,
    transcriptBytes: [...archiveSizes.values()].reduce((sum, bytes) => sum + bytes, 0),
    serializedBytes,
    summary: plan.automaticPlanSummary,
  },
  readOnly: true,
}));
