import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Two Gateway main-thread lookups that read the agent's whole session store to find one entry now
// read only the matching rows (see lab/gateway-freeze-lookups.md). Both froze V on 2026-10-27:
// CPU profiles 16:48 (18 of 25 s in the first) and 18:36 (15 of 23.5 s in the second), GC ~7 s each.
// makaron on V that day: 10,724 rows, 708 MB of entry JSON; one whole-store read is seconds of main
// thread and >2 GB of short-lived objects.
//
// 1. server-session-key: resolveSessionKeyForRun. server-chat's handleEvent falls back to it when an
//    event has no chat link, no sessionKey and no run context with a key. It loaded the whole combined
//    store (full projection, never cached) to keep the rows whose sessionId === runId, and remembers a
//    miss for only 1 s, so a run that keeps emitting costs one whole-store read per event round. It now
//    passes match: { sessionIds: [runId] } to loadCombinedSessionStoreForGatewayCore.
// 2. task-registry.maintenance: findTaskSessionEntry. Deciding whether an active subagent / cli task
//    still has its session read the whole store once per reconcile context. The restart-blocker check
//    (createGatewayActiveWorkSnapshot, behind restartChannels and the host-thaw loop that runs every
//    30 s once the Gateway was stalled > 75 s) builds a fresh context every call, so every call read
//    it, keeping the stall going. It now reads the task's own key and caches it in the context.
//
// Both use listSessionEntriesMatchingReadOnly (sessions-search-exact-read, on V since 2026-10-25):
// candidate keys from the indexed current_session_id / session_key columns, then those rows with the
// whole-store read's own columns, parser and participant projection, internal-session-effects rows
// skipped and the canonical-key check. Everything after the read is V's code.
// OPENCLAW_V_RUN_SESSION_LOOKUP_EXACT=0 and OPENCLAW_V_TASK_SESSION_LOOKUP_EXACT=0 restore the
// whole-store reads.

export const MARKER = 'gateway-freeze-lookups';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const count = (source, needle) => source.split(needle).length - 1;
const swap = (pairs) => ({
  patch(source) {
    assert(!source.includes(MARKER), 'already patched');
    for (const [before, , what] of pairs) assert.equal(count(source, before), 1, `Expected exactly one ${what}`);
    return pairs.reduce((text, [before, after]) => text.replace(before, after), source);
  },
  unpatch(source) {
    assert(source.includes(MARKER), 'not patched');
    for (const [, after, what] of pairs) assert.equal(count(source, after), 1, `Expected exactly one patched ${what}`);
    return pairs.reduce((text, [before, after]) => text.replace(after, before), source);
  },
});

// ---- server-session-key-ZtX3Ble7.js (9.1 install bytes) ----
export const RUN_LOOKUP_BEFORE = '\tconst { store } = loadCombinedSessionStoreForGatewayCore(cfg, { agentId: requestedAgentId });\n';
export const RUN_LOOKUP_AFTER = `\t// ${MARKER}: read only the rows whose current session id is the run id (indexed).
\tconst exactRunLookup = typeof runId === "string" && runId.length > 0 && process.env.OPENCLAW_V_RUN_SESSION_LOOKUP_EXACT !== "0";
\tconst { store } = loadCombinedSessionStoreForGatewayCore(cfg, {
\t\tagentId: requestedAgentId,
\t\t...exactRunLookup ? { match: { sessionIds: [runId] } } : {}
\t});
`;
const sessionKey = swap([[RUN_LOOKUP_BEFORE, RUN_LOOKUP_AFTER, 'whole-store run lookup']]);

// ---- task-registry.maintenance-C4nMaDY9.js (V bytes after #442) ----
const MAINT_IMPORT_BEFORE = 'import { a as listSessionEntriesReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";\n';
const MAINT_IMPORT_AFTER = `${MAINT_IMPORT_BEFORE}import { listSessionEntriesMatchingReadOnly } from "./v-session-entries-matching.mjs";\n`;
export const TASK_LOOKUP_BEFORE = `function findTaskSessionEntry(task, context) {
\tconst childSessionKey = task.childSessionKey?.trim();
\tif (!childSessionKey) return;
\tconst agentId = taskRegistryMaintenanceRuntime.parseAgentSessionKey(childSessionKey)?.agentId;
\treturn findSessionEntryByKey(getSessionEntryLookup(taskRegistryMaintenanceRuntime.resolveStorePath(void 0, { agentId }), context), childSessionKey);
}
`;
export const TASK_LOOKUP_AFTER = `function findTaskSessionEntry(task, context) {
\tconst childSessionKey = task.childSessionKey?.trim();
\tif (!childSessionKey) return;
\tconst agentId = taskRegistryMaintenanceRuntime.parseAgentSessionKey(childSessionKey)?.agentId;
\tconst storePath = taskRegistryMaintenanceRuntime.resolveStorePath(void 0, { agentId });
\t// ${MARKER}: read only this key's rows (default runtime only), cached per reconcile context.
\tif (taskRegistryMaintenanceRuntime.listSessionEntries === listSessionEntriesReadOnly && process.env.OPENCLAW_V_TASK_SESSION_LOOKUP_EXACT !== "0") {
\t\tconst cacheKey = \`\${storePath}\\0\${childSessionKey}\`;
\t\tconst cachedEntries = context ? context.sessionEntriesByKeyExact ??= /* @__PURE__ */ new Map() : void 0;
\t\tif (cachedEntries?.has(cacheKey)) return cachedEntries.get(cacheKey);
\t\tconst entry = findSessionEntryByKey(buildSessionEntryLookup(listSessionEntriesMatchingReadOnly({ storePath }, { sessionKeys: [childSessionKey] })), childSessionKey);
\t\tcachedEntries?.set(cacheKey, entry);
\t\treturn entry;
\t}
\treturn findSessionEntryByKey(getSessionEntryLookup(storePath, context), childSessionKey);
}
`;
const maintenance = swap([
  [MAINT_IMPORT_BEFORE, MAINT_IMPORT_AFTER, 'entry accessor import'],
  [TASK_LOOKUP_BEFORE, TASK_LOOKUP_AFTER, 'task session lookup'],
]);

export const FILES = {
  'server-session-key-ZtX3Ble7.js': {
    before: '30a0e1f9884da81e4c4a3d22fd69a025552c8b8419597c940cfe46e35b3cb5ae',
    ...sessionKey,
  },
  'task-registry.maintenance-C4nMaDY9.js': {
    before: 'b6fe747f864dd451d2740c336d287794c2e77ded31c78a6beed5b5cc5f2ad9bc',
    ...maintenance,
  },
};
