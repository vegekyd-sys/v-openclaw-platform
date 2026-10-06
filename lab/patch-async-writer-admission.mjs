// Patches V's session-accessor.sqlite-entry chunk so its two async write sites
// wait for the process-global Agent DB writer lease on the event loop before
// entering the native sync transaction (see agent-db-writer-admission-wait.mjs).
function once(source, before, after, label) {
  if (source.split(before).length - 1 !== 1) throw new Error(`${label} anchor mismatch`);
  return source.replace(before, after);
}

export const ADMISSION_MARKER = 'OPENCLAW_ASYNC_WRITER_ADMISSION_V1';

export function patchSessionEntryChunk(source) {
  if (source.includes(ADMISSION_MARKER)) throw new Error('already patched');
  source = once(source,
    'import crypto from "node:crypto";\n',
    'import crypto from "node:crypto";\n' +
    'import { isAgentDatabaseProcessLeaseHeld } from "./agent-db-process-coordinator.mjs";\n' +
    'import { waitForAgentDatabaseWriterAdmission } from "./agent-db-writer-admission-wait.mjs";\n' +
    `// ${ADMISSION_MARKER}: async writers wait for the process writer lease without Atomics.wait.\n` +
    'function awaitAgentDatabaseWriterAdmission(database, scope) {\n' +
    '\treturn waitForAgentDatabaseWriterAdmission(database.path, {\n' +
    '\t\tacquire: tryAcquireExclusiveSqliteCoordinator,\n' +
    '\t\tisHeld: isAgentDatabaseProcessLeaseHeld,\n' +
    '\t\tisIncognito: (databasePath) => isIncognitoOpenClawAgentSqlitePath(databasePath, toDatabaseOptions(scope))\n' +
    '\t});\n' +
    '}\n',
    'imports');
  source = once(source,
    '\t\t\t\tif (!planned.plannedEntryArchives?.length) return planned;\n\t\t\t\treturn withSqliteBeginContentionRetry({database: owner.database.db,',
    '\t\t\t\tif (!planned.plannedEntryArchives?.length) return planned;\n\t\t\t\tawait awaitAgentDatabaseWriterAdmission(owner.database, owner.scope);\n\t\t\t\treturn withSqliteBeginContentionRetry({database: owner.database.db,',
    'maintenance commit');
  source = once(source,
    '\t\tlet currentIdentity = /* @__PURE__ */ new Map();\n\t\tawait withSqliteBeginContentionRetry({\n\t\t\tdatabase: database.db,\n\t\t\trun: operation => runOpenClawAgentWriteTransaction(operation, toDatabaseOptions(resolved)),',
    '\t\tlet currentIdentity = /* @__PURE__ */ new Map();\n\t\tawait awaitAgentDatabaseWriterAdmission(database, resolved);\n\t\tawait withSqliteBeginContentionRetry({\n\t\t\tdatabase: database.db,\n\t\t\trun: operation => runOpenClawAgentWriteTransaction(operation, toDatabaseOptions(resolved)),',
    'entry patch commit');
  return source;
}

// The heartbeat outcome claim is a sync write transaction on the prompt path,
// right before the model call; wait for the writer lease on the event loop first.
export function patchBuiltinChunk(source) {
  if (source.includes(ADMISSION_MARKER)) throw new Error('already patched');
  source = once(source,
    'import { n as claimHeartbeatOutcomeForRun, t as buildHeartbeatOutcomeContext } from "./heartbeat-outcome-store-BoT9c8Af.js";\n',
    'import { n as claimHeartbeatOutcomeForRun, t as buildHeartbeatOutcomeContext } from "./heartbeat-outcome-store-BoT9c8Af.js";\n' +
    'import { c as heartbeatAdmissionResolveSqliteScope, m as heartbeatAdmissionToDatabaseOptions } from "./session-accessor.sqlite-scope-BwPKGcgm.js";\n' +
    'import { r as heartbeatAdmissionResolveSqlitePath, t as heartbeatAdmissionIsIncognitoSqlitePath } from "./openclaw-agent-db.paths-DYna80bS.js";\n' +
    'import { o as heartbeatAdmissionTryAcquireCoordinator } from "./node-sqlite-CL-d6drd.js";\n' +
    'import { isAgentDatabaseProcessLeaseHeld as heartbeatAdmissionIsLeaseHeld } from "./agent-db-process-coordinator.mjs";\n' +
    'import { waitForAgentDatabaseWriterAdmission as heartbeatAdmissionWait } from "./agent-db-writer-admission-wait.mjs";\n' +
    `// ${ADMISSION_MARKER}: wait for the Agent DB writer lease without Atomics.wait before the sync heartbeat claim.\n` +
    'async function claimHeartbeatOutcomeForRunAfterWriterAdmission(params) {\n' +
    '\ttry {\n' +
    '\t\tconst options = heartbeatAdmissionToDatabaseOptions(heartbeatAdmissionResolveSqliteScope(params));\n' +
    '\t\tawait heartbeatAdmissionWait(heartbeatAdmissionResolveSqlitePath(options), {\n' +
    '\t\t\tacquire: heartbeatAdmissionTryAcquireCoordinator,\n' +
    '\t\t\tisHeld: heartbeatAdmissionIsLeaseHeld,\n' +
    '\t\t\tisIncognito: (databasePath) => heartbeatAdmissionIsIncognitoSqlitePath(databasePath, options)\n' +
    '\t\t});\n' +
    '\t} catch {}\n' +
    '\treturn claimHeartbeatOutcomeForRun(params);\n' +
    '}\n',
    'builtin imports');
  source = once(source,
    'buildHeartbeatOutcomeContext(claimHeartbeatOutcomeForRun({',
    'buildHeartbeatOutcomeContext(await claimHeartbeatOutcomeForRunAfterWriterAdmission({',
    'heartbeat claim');
  return source;
}
