import { parentPort, workerData } from "node:worker_threads";
import { setPriority } from "node:os";
import { l as runSqliteDeferredTransactionSync } from "./node-sqlite-CL-d6drd.js";
import { n as withOpenClawAgentDatabaseReadOnly } from "./openclaw-agent-db-readonly-wb-jdztx.js";
import { c as resolveSqliteScope, m as toDatabaseOptions } from "./session-accessor.sqlite-scope-BwPKGcgm.js";
import { boundAutomaticSessionMaintenancePlan } from "./automatic-session-maintenance-planner.mjs";
import { a as applySessionEntryMaintenance, b as buildSessionMaintenanceBatches } from "./session-history-eviction-d5aiCsHS.js";

const processChannel = !parentPort && typeof process.send === "function";
if (!parentPort && !processChannel) throw new Error("Automatic session maintenance requires an isolated message channel");
if (processChannel) {
  try { setPriority(0, 10); } catch {}
}

const request = parentPort ? workerData : await new Promise((resolve, reject) => {
  process.once("message", resolve);
  process.once("disconnect", () => reject(new Error("Automatic session maintenance owner disconnected before dispatch")));
});
const postMessage = (message) => parentPort ? parentPort.postMessage(message) : process.send(message);
const closeChannel = () => parentPort ? parentPort.close() : process.disconnect();

const TRANSCRIPT_SIZE_BATCH = 64;

function attachArchiveByteSizes(database, plan) {
  const sessionIds = [...new Set(plan.stateDeletePlans
    .filter((item) => item.archiveTranscript)
    .map((item) => item.sessionId))];
  // An archived session can legitimately have no transcript rows. Preserve the
  // native finalizer's zero-byte behavior while still returning one validated
  // size for every archive plan.
  const bytes = new Map(sessionIds.map((sessionId) => [sessionId, 0]));
  for (let offset = 0; offset < sessionIds.length; offset += TRANSCRIPT_SIZE_BATCH) {
    const batch = sessionIds.slice(offset, offset + TRANSCRIPT_SIZE_BATCH);
    const placeholders = batch.map(() => "?").join(",");
    const rows = database.db.prepare(
      `SELECT session_id, SUM(OCTET_LENGTH(event_json) + 1) AS jsonl_bytes
       FROM transcript_events WHERE session_id IN (${placeholders}) GROUP BY session_id`,
    ).all(...batch);
    for (const row of rows) bytes.set(row.session_id, Number(row.jsonl_bytes));
  }
  return boundAutomaticSessionMaintenancePlan({
    ...plan,
    automaticArchiveBytesBySessionId: [...bytes],
  }, buildSessionMaintenanceBatches);
}

try {
  const resolved = resolveSqliteScope({
    agentId: request.agentId,
    sessionKey: "",
    storePath: request.storePath,
  });
  const opened = withOpenClawAgentDatabaseReadOnly((database) =>
    runSqliteDeferredTransactionSync(database.db, () => attachArchiveByteSizes(database,
      applySessionEntryMaintenance(database, {
      activeSessionKeys: request.activeSessionKeys,
      archiveDirectory: request.archiveDirectory,
      maintenanceConfig: request.maintenanceConfig,
      planOnly: true,
      storePath: request.storePath,
    }))), toDatabaseOptions(resolved));
  if (!opened.found) {
    throw new Error(`Automatic session maintenance could not open the Agent database: ${opened.reason}`);
  }
  postMessage({ type: "result", plan: opened.value });
} catch (error) {
  postMessage({
    type: "error",
    message: error instanceof Error ? error.message : String(error),
  });
} finally {
  closeChannel();
}
