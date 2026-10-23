import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// sessions.resolve by key reads only that key's store rows, as sessions.get and sessions.preview do.
//
// resolveSessionKeyFromResolveParams looked a key up with resolveGatewaySessionStoreTargetWithStore
// without exactRead: listSessionEntriesCore with the default full projection, which never uses the
// entry cache (readSessionEntryCache returns early for "full"). Every call parsed every session_nodes
// row of the agent (V, 2026-10-23: makaron 9,050 rows, 592 MB of entry JSON, 83 % of it finished
// Night Shift subagent sessions) and projected their participants on the Gateway main thread, to read
// one entry: 5.0-6.3 s per call on V. Tianyi's Mac app called it every ~6 s on 10/23 19:09 (RSS
// 4.2 -> 7.8 GB, liveness 4-5 s late); agent tools and CLI clients call it a few times an hour.
//
// The key branch now asks for the same scan targets with exactRead: true, readOnly: true. It reads
// the entry the same way afterwards (store[canonicalKey]) and the spawnedBy visibility filter only
// tests that key, which filterSessionEntries decides from that entry alone (and the subagent
// registry), so a store holding just the scan targets gives the same answer. One difference is kept
// on purpose: the whole-store read never returned internal-session-effects rows, so neither does this.
// Unchanged: sessionId, label and shortId lookups (they search, so they still read the store).
// OPENCLAW_V_SESSIONS_RESOLVE_EXACT=0 restores the whole-store read.

export const MARKER = 'sessions-resolve-exact-read';
export const NAME = 'sessions-resolve-_D6BmQTT.js';
export const BEFORE_SHA = 'c3d8c8017ee3d0122493d762cd6790165810dca5adf6e107b5e1b836b7acd3a7';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const IMPORT_BEFORE = 'import { n as createSessionListEntryFilter } from "./session-sharing-BlMqwMBH.js";\n';
const IMPORT_AFTER = `${IMPORT_BEFORE}import { O as isInternalSessionEffectsKey } from "./session-accessor.sqlite-entry-BlklNPKQ.js";\n`;

const LOOKUP_BEFORE = `\t\tconst target = resolveGatewaySessionStoreTargetWithStore({
\t\t\tcfg,
\t\t\tkey,
\t\t\tclone: false,
\t\t\t...requestedAgent.agentId ? { agentId: requestedAgent.agentId } : {}
\t\t});
\t\tconst store = target.store;
\t\tconst entry = store[target.canonicalKey];
`;
const LOOKUP_AFTER = `\t\t// ${MARKER}: read only this key's store rows, as sessions.get does.
\t\tconst exactRead = process.env.OPENCLAW_V_SESSIONS_RESOLVE_EXACT !== "0";
\t\tconst target = resolveGatewaySessionStoreTargetWithStore({
\t\t\tcfg,
\t\t\tkey,
\t\t\tclone: false,
\t\t\t...exactRead ? {
\t\t\t\texactRead: true,
\t\t\t\treadOnly: true
\t\t\t} : {},
\t\t\t...requestedAgent.agentId ? { agentId: requestedAgent.agentId } : {}
\t\t});
\t\tconst store = target.store;
\t\tconst entry = exactRead && isInternalSessionEffectsKey(target.canonicalKey) ? void 0 : store[target.canonicalKey];
`;

const once = (source, needle, what) => assert.equal(source.split(needle).length, 2, `Expected exactly one ${what}`);

export function patchSessionsResolve(source) {
  assert(!source.includes(MARKER), 'sessions.resolve already patched');
  once(source, IMPORT_BEFORE, 'session sharing import');
  once(source, LOOKUP_BEFORE, 'sessions.resolve key lookup');
  return source.replace(IMPORT_BEFORE, IMPORT_AFTER).replace(LOOKUP_BEFORE, LOOKUP_AFTER);
}

export function unpatchSessionsResolve(source) {
  assert(source.includes(MARKER), 'sessions.resolve not patched');
  once(source, IMPORT_AFTER, 'patched import');
  once(source, LOOKUP_AFTER, 'patched key lookup');
  return source.replace(IMPORT_AFTER, IMPORT_BEFORE).replace(LOOKUP_AFTER, LOOKUP_BEFORE);
}
