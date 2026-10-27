import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// resolveSessionKeyForRun reads only the session rows whose current session id is the run id.
//
// server-chat's handleEvent resolves an agent event's session as chatLink -> event sessionKey ->
// run context -> resolveSessionKeyForRun(runId). When the first three are empty the last one loaded
// the agent's whole combined store with the full projection (never cached) to keep the rows whose
// sessionId === runId, and a miss is remembered for only 1 s (RUN_LOOKUP_MISS_TTL_MS). Events reach
// it on V because every channel reply run registers its context with isControlUiVisible: false, so
// enrichAgentEvent drops sessionKey from its assistant / tool / reasoning events, and server-runtime-
// subscriptions hands events to handleEvent asynchronously: once the run context is cleared (or for a
// run registered without a sessionKey) each event costs one whole-store read, about one per second
// per run while it keeps emitting. makaron on V is ~9-10k rows / ~600 MB of entry JSON: seconds of
// main thread and >2 GB of garbage per read. 2026-10-27 16:37-16:47 this froze the Gateway (CPU
// profile: 18 of 20 s in this lookup, GC 7.3 s) until a restart.
//
// The lookup now passes match: { sessionIds: [runId] } to loadCombinedSessionStoreForGatewayCore
// (sessions-search-exact-read, on V since 2026-10-25): candidate keys come from the indexed
// current_session_id column, which the entry writer projects from entry.sessionId, then those rows
// are read with the whole-store read's own columns, parser and participant projection. The filter,
// selection and caching after the read are V's code. A run id that is not a non-empty string keeps
// the whole-store read. OPENCLAW_V_RUN_SESSION_LOOKUP_EXACT=0 restores it for every lookup.

export const MARKER = 'run-session-lookup-exact';
export const NAME = 'server-session-key-ZtX3Ble7.js';
export const BEFORE_SHA = '30a0e1f9884da81e4c4a3d22fd69a025552c8b8419597c940cfe46e35b3cb5ae';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export const LOOKUP_BEFORE = '\tconst { store } = loadCombinedSessionStoreForGatewayCore(cfg, { agentId: requestedAgentId });\n';
export const LOOKUP_AFTER = `\t// ${MARKER}: read only the rows whose current session id is the run id (indexed).
\tconst exactRunLookup = typeof runId === "string" && runId.length > 0 && process.env.OPENCLAW_V_RUN_SESSION_LOOKUP_EXACT !== "0";
\tconst { store } = loadCombinedSessionStoreForGatewayCore(cfg, {
\t\tagentId: requestedAgentId,
\t\t...exactRunLookup ? { match: { sessionIds: [runId] } } : {}
\t});
`;

const count = (source, needle) => source.split(needle).length - 1;

export function patchRunSessionLookup(source) {
  assert(!source.includes(MARKER), 'already patched');
  assert.equal(count(source, LOOKUP_BEFORE), 1, 'Expected exactly one whole-store run lookup');
  return source.replace(LOOKUP_BEFORE, LOOKUP_AFTER);
}

export function unpatchRunSessionLookup(source) {
  assert(source.includes(MARKER), 'not patched');
  assert.equal(count(source, LOOKUP_AFTER), 1, 'Expected exactly one patched run lookup');
  return source.replace(LOOKUP_AFTER, LOOKUP_BEFORE);
}
