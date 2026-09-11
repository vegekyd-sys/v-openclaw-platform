import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseRelease = "offthread-session-maintenance-20260912-v1";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const once = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `anchor drift: ${before.slice(0, 120)}`);
  return source.replace(before, after);
};
const targets = {
  entry: {
    source: "lab/release-files/session-accessor.sqlite-entry-BlklNPKQ.js",
    target: "openclaw/dist/session-accessor.sqlite-entry-BlklNPKQ.js",
    before: "01abf7ea3c5376a943c7941b1783c45a7290257f78553ac64698352faff9651b",
  },
  history: {
    source: "lab/release-files/session-history-eviction-d5aiCsHS.js",
    target: "openclaw/dist/session-history-eviction-d5aiCsHS.js",
    before: "04a6851b05385b6361637c8a8e52d82260943717c507b4ccfda34970b12b22e0",
  },
  planner: {
    source: "lab/release-files/automatic-session-maintenance-planner.mjs",
    target: "openclaw/dist/automatic-session-maintenance-planner.mjs",
    before: "3f36d87751c42f3a634a2ff2b4bb34d203da3d775263c08822c58644bdb9e27b",
  },
  worker: {
    source: "lab/release-files/automatic-session-maintenance.worker.mjs",
    target: "openclaw/dist/automatic-session-maintenance.worker.mjs",
    before: "7b6c31b73f5027a1de09a6dae2b1e9df22aada68230aa553d007acb979a02e3f",
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

function patchEntry(source) {
  return once(source,
    '\t\t\tawait finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort(owner.scope, [plan], { isCurrent });\n',
    '\t\t\tconst archiveBytesBySessionId = plan.automaticArchiveBytesBySessionId\n\t\t\t\t? new Map(plan.automaticArchiveBytesBySessionId)\n\t\t\t\t: void 0;\n\t\t\tawait finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort(owner.scope, [plan], { isCurrent, archiveBytesBySessionId });\n',
  );
}

function patchHistory(source) {
  return once(source,
    '\tlet archiveBytesBySessionId;\n\ttry {\n\t\tarchiveBytesBySessionId = await readSessionTranscriptJsonlBytes(scope, stateDeletePlans.filter((plan) => plan.archiveTranscript).map((plan) => plan.sessionId), isCurrent);\n',
    '\tlet archiveBytesBySessionId = options.archiveBytesBySessionId;\n\ttry {\n\t\tif (archiveBytesBySessionId) {\n\t\t\tfor (const plan of stateDeletePlans) if (plan.archiveTranscript && !archiveBytesBySessionId.has(plan.sessionId)) throw new Error(`Missing precomputed archive byte size for ${plan.sessionId}`);\n\t\t} else archiveBytesBySessionId = await readSessionTranscriptJsonlBytes(scope, stateDeletePlans.filter((plan) => plan.archiveTranscript).map((plan) => plan.sessionId), isCurrent);\n',
  );
}

function patchPlanner(source) {
  let output = once(source,
    '  if (plan.plannedEntryArchives !== undefined && !Array.isArray(plan.plannedEntryArchives)) {\n    throw new Error("Automatic session maintenance plan has invalid plannedEntryArchives");\n  }\n',
    '  if (plan.plannedEntryArchives !== undefined && !Array.isArray(plan.plannedEntryArchives)) {\n    throw new Error("Automatic session maintenance plan has invalid plannedEntryArchives");\n  }\n  if (plan.automaticArchiveBytesBySessionId !== undefined) {\n    if (!Array.isArray(plan.automaticArchiveBytesBySessionId) ||\n      plan.automaticArchiveBytesBySessionId.some((entry) =>\n        !Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" ||\n        !Number.isFinite(entry[1]) || entry[1] < 0)) {\n      throw new Error("Automatic session maintenance plan has invalid archive byte sizes");\n    }\n    const ids = plan.automaticArchiveBytesBySessionId.map(([sessionId]) => sessionId);\n    if (new Set(ids).size !== ids.length) {\n      throw new Error("Automatic session maintenance plan has duplicate archive byte sizes");\n    }\n    const sized = new Set(ids);\n    if (plan.stateDeletePlans.some((item) => item.archiveTranscript && !sized.has(item.sessionId))) {\n      throw new Error("Automatic session maintenance plan is missing an archive byte size");\n    }\n  }\n',
  );
  output = once(output,
    '  const archivedWorktrees = plan.archivedWorktrees?.filter((item) => !isProtected(item, protectedIdentities));\n  return {\n',
    '  const archivedWorktrees = plan.archivedWorktrees?.filter((item) => !isProtected(item, protectedIdentities));\n  const retainedStateIds = new Set(stateDeletePlans.map((item) => item.sessionId));\n  const automaticArchiveBytesBySessionId = plan.automaticArchiveBytesBySessionId\n    ?.filter(([sessionId]) => retainedStateIds.has(sessionId));\n  return {\n',
  );
  return once(output,
    '    entryRemovals,\n    stateDeletePlans,\n    ...archivedWorktrees ? { archivedWorktrees } : {},\n',
    '    entryRemovals,\n    stateDeletePlans,\n    ...automaticArchiveBytesBySessionId ? { automaticArchiveBytesBySessionId } : {},\n    ...archivedWorktrees ? { archivedWorktrees } : {},\n',
  );
}

function patchWorker(source) {
  let output = once(source,
    'if (!parentPort) throw new Error("Automatic session maintenance worker requires a parent port");\n\n',
    'if (!parentPort) throw new Error("Automatic session maintenance worker requires a parent port");\n\nconst TRANSCRIPT_SIZE_BATCH = 64;\n\nfunction attachArchiveByteSizes(database, plan) {\n  const sessionIds = [...new Set(plan.stateDeletePlans\n    .filter((item) => item.archiveTranscript)\n    .map((item) => item.sessionId))];\n  // An archived session can legitimately have no transcript rows. Preserve the\n  // native finalizer\'s zero-byte behavior while still returning one validated\n  // size for every archive plan.\n  const bytes = new Map(sessionIds.map((sessionId) => [sessionId, 0]));\n  for (let offset = 0; offset < sessionIds.length; offset += TRANSCRIPT_SIZE_BATCH) {\n    const batch = sessionIds.slice(offset, offset + TRANSCRIPT_SIZE_BATCH);\n    const placeholders = batch.map(() => "?").join(",");\n    const rows = database.db.prepare(\n      `SELECT session_id, SUM(OCTET_LENGTH(event_json) + 1) AS jsonl_bytes\n       FROM transcript_events WHERE session_id IN (${placeholders}) GROUP BY session_id`,\n    ).all(...batch);\n    for (const row of rows) bytes.set(row.session_id, Number(row.jsonl_bytes));\n  }\n  return { ...plan, automaticArchiveBytesBySessionId: [...bytes] };\n}\n\n',
  );
  return once(output,
    '  const opened = withOpenClawAgentDatabaseReadOnly((database) =>\n    runSqliteDeferredTransactionSync(database.db, () => applySessionEntryMaintenance(database, {\n      activeSessionKeys: request.activeSessionKeys,\n      archiveDirectory: request.archiveDirectory,\n      maintenanceConfig: request.maintenanceConfig,\n      planOnly: true,\n      storePath: request.storePath,\n    })), toDatabaseOptions(resolved));\n',
    '  const opened = withOpenClawAgentDatabaseReadOnly((database) =>\n    runSqliteDeferredTransactionSync(database.db, () => attachArchiveByteSizes(database,\n      applySessionEntryMaintenance(database, {\n      activeSessionKeys: request.activeSessionKeys,\n      archiveDirectory: request.archiveDirectory,\n      maintenanceConfig: request.maintenanceConfig,\n      planOnly: true,\n      storePath: request.storePath,\n    }))), toDatabaseOptions(resolved));\n',
  );
}

const patchers = { entry: patchEntry, history: patchHistory, planner: patchPlanner, worker: patchWorker };
const files = [];
for (const [name, target] of Object.entries(targets)) {
  const candidate = patchers[name](readCode(target));
  const candidatePath = path.join(root, target.source);
  assert.equal(candidate, fs.readFileSync(candidatePath, "utf8"), `${name} candidate differs from deterministic patch`);
  files.push({ ...target, candidate: sha(candidate) });
}
console.log(JSON.stringify({ baseRelease, files }, null, 2));
