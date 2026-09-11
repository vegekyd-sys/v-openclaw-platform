import { parentPort, workerData } from "node:worker_threads";
import { l as runSqliteDeferredTransactionSync } from "./node-sqlite-CL-d6drd.js";
import { n as withOpenClawAgentDatabaseReadOnly } from "./openclaw-agent-db-readonly-wb-jdztx.js";
import { c as resolveSqliteScope, m as toDatabaseOptions } from "./session-accessor.sqlite-scope-BwPKGcgm.js";
import { a as applySessionEntryMaintenance } from "./session-history-eviction-d5aiCsHS.js";

if (!parentPort) throw new Error("Automatic session maintenance worker requires a parent port");

try {
  const request = workerData;
  const resolved = resolveSqliteScope({
    agentId: request.agentId,
    sessionKey: "",
    storePath: request.storePath,
  });
  const opened = withOpenClawAgentDatabaseReadOnly((database) =>
    runSqliteDeferredTransactionSync(database.db, () => applySessionEntryMaintenance(database, {
      activeSessionKeys: request.activeSessionKeys,
      archiveDirectory: request.archiveDirectory,
      maintenanceConfig: request.maintenanceConfig,
      planOnly: true,
      storePath: request.storePath,
    })), toDatabaseOptions(resolved));
  if (!opened.found) {
    throw new Error(`Automatic session maintenance could not open the Agent database: ${opened.reason}`);
  }
  parentPort.postMessage({ type: "result", plan: opened.value });
} catch (error) {
  parentPort.postMessage({
    type: "error",
    message: error instanceof Error ? error.message : String(error),
  });
} finally {
  parentPort.close();
}
