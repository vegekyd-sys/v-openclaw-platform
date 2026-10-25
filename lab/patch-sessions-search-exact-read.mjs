import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// sessions.resolve by sessionId / label / shortId, and the plugin session ownership check, read only
// the session rows they can match (see lab/sessions-search-exact-read.md).
//
// Both searched the agent's whole store with the full projection, which never uses the entry cache:
// every session_nodes row parsed on the Gateway main thread (makaron on V, 2026-10-24: 9,503 rows,
// 623 MB of entry JSON, 5-10 s per read). The ownership check runs before every plugin
// runEmbeddedAgent with a session id, i.e. every V Voice product task (~17 a day); the resolve
// searches come from agent session tools given a session id or label, ACP targets and short ids.
//
// v-session-entries-matching.mjs reads the candidate keys from indexed or key-only columns
// (current_session_id, session_key, label) and then those rows with the whole-store read's own
// columns, parser and participant projection. loadCombinedSessionStoreForGatewayCore takes an
// optional `match` for its durable stores; everything after the row read (canonical keys, lineage,
// agent filter, visibility filter, selection) is unchanged V code running on fewer rows.
// OPENCLAW_V_SESSIONS_RESOLVE_SEARCH_EXACT=0 and OPENCLAW_V_SESSION_OWNERSHIP_EXACT=0 restore the
// whole-store reads.

export const MARKER = 'sessions-search-exact-read';
export const MODULE = 'v-session-entries-matching.mjs';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const once = (source, needle, what) => assert.equal(source.split(needle).length, 2, `Expected exactly one ${what}`);
const swap = (pairs) => ({
  patch(source) {
    assert(!source.includes(MARKER), 'already patched');
    for (const [before, , what] of pairs) once(source, before, what);
    return pairs.reduce((text, [before, after]) => text.replace(before, after), source);
  },
  unpatch(source) {
    assert(source.includes(MARKER), 'not patched');
    for (const [, after, what] of pairs) once(source, after, `patched ${what}`);
    return pairs.reduce((text, [before, after]) => text.replace(after, before), source);
  },
});

// ---- combined-store-gateway-BwDhjbIt.js ----
export const COMBINED = 'combined-store-gateway-BwDhjbIt.js';
export const COMBINED_BEFORE = '4b7612af99fe8bf9d54b28ea89feeb132858ea0d659ceb3efca072008d95c186';
const combined = swap([
  [
    'import { t as listSessionEntriesCore } from "./session-accessor.entry-B8arwR7t.js";\n',
    `import { t as listSessionEntriesCore } from "./session-accessor.entry-B8arwR7t.js";\nimport { listSessionEntriesMatchingReadOnly } from "./${MODULE}";\n`,
    'entry accessor import',
  ],
  [
    `function loadGatewayStoreEntries(params) {
\treturn (params.includeOpenDatabases ? listSessionEntriesCore : listSessionEntriesReadOnly)({
`,
    `function loadGatewayStoreEntries(params) {
\t// ${MARKER}: a search reads only the rows it can match (durable stores).
\tif (params.match && !params.includeOpenDatabases) return listSessionEntriesMatchingReadOnly({
\t\tagentId: params.agentId,
\t\tclone: false,
\t\tprojection: params.projection,
\t\tstorePath: params.storePath
\t}, params.match);
\treturn (params.includeOpenDatabases ? listSessionEntriesCore : listSessionEntriesReadOnly)({
`,
    'store entry loader',
  ],
  [
    `\t\tconst store = loadGatewayStoreEntries({
\t\t\tagentId,
\t\t\tprojection,
\t\t\tstorePath
\t\t});
`,
    `\t\tconst store = loadGatewayStoreEntries({
\t\t\tagentId,
\t\t\tprojection,
\t\t\tstorePath,
\t\t\t...opts.match ? { match: opts.match } : {}
\t\t});
`,
    'durable store read',
  ],
]);
export const patchCombinedStore = combined.patch;
export const unpatchCombinedStore = combined.unpatch;

// ---- sessions-resolve-_D6BmQTT.js (on top of sessions-resolve-exact-read, PR #462) ----
export const RESOLVE = 'sessions-resolve-_D6BmQTT.js';
const resolve = swap([
  [
    `\tif (hasKey) {
\t\tconst requestedAgent = resolveRequestedSessionAgentId(cfg, key, p.agentId);
`,
    `\t// ${MARKER}: the sessionId, shortId and label searches read only the rows they can match.
\tconst searchExact = process.env.OPENCLAW_V_SESSIONS_RESOLVE_SEARCH_EXACT !== "0";
\tconst loadSearchStore = (opts, match) => loadCombinedSessionStoreForGatewayCore(cfg, searchExact ? {
\t\t...opts,
\t\tmatch
\t} : opts);
\t// findVisibleSessionIdMatches keeps entry.sessionId === sessionId or key === sessionId.
\tconst sessionIdMatch = {
\t\tsessionIds: [sessionId],
\t\tsessionKeys: [sessionId]
\t};
\tif (hasKey) {
\t\tconst requestedAgent = resolveRequestedSessionAgentId(cfg, key, p.agentId);
`,
    'key branch start',
  ],
  [
    '\t\t\t\t\tstore: loadCombinedSessionStoreForGatewayCore(cfg, { agentId }).store,\n',
    '\t\t\t\t\tstore: loadSearchStore({ agentId }, sessionIdMatch).store,\n',
    'per-agent sessionId store',
  ],
  [
    `\t\tconst { store } = loadCombinedSessionStoreForGatewayCore(cfg, { agentId: p.agentId });
\t\tconst matches = findVisibleSessionIdMatches({
`,
    `\t\tconst { store } = loadSearchStore({ agentId: p.agentId }, sessionIdMatch);
\t\tconst matches = findVisibleSessionIdMatches({
`,
    'sessionId store',
  ],
  [
    '\t\tconst { storePath, store } = loadCombinedSessionStoreForGatewayCore(cfg, { agentId: p.agentId });\n',
    `\t\t// findVisibleShortIdMatches keeps keys whose UUID suffix starts with the short id.
\t\tconst { storePath, store } = loadSearchStore({ agentId: p.agentId }, { keyFilter: (storedKey) => (parseAgentSessionKey(storedKey)?.rest.match(SESSION_UUID_SUFFIX_RE)?.[1])?.toLowerCase().replaceAll("-", "").startsWith(shortId) === true });
`,
    'shortId store',
  ],
  [
    `\tconst { store } = loadCombinedSessionStoreForGatewayCore(cfg, { agentId: p.agentId });
\tconst now = Date.now();
`,
    `\t// filterSessionEntries keeps entry.label === the trimmed label; the label column is the trimmed entry.label.
\tconst { store } = loadSearchStore({ agentId: p.agentId }, { labels: [parsedLabel.label] });
\tconst now = Date.now();
`,
    'label store',
  ],
]);
export const patchSessionsResolveSearch = resolve.patch;
export const unpatchSessionsResolveSearch = resolve.unpatch;

// ---- registry-runtime-session-ownership-B1XvaNE7.js ----
export const OWNERSHIP = 'registry-runtime-session-ownership-B1XvaNE7.js';
export const OWNERSHIP_BEFORE = 'f1c58a03dc5ef50a3e54b2e9db399f93438da9ac70de8236d28c6e5a1ba873fe';
const ownership = swap([
  [
    'import { a as isAgentHarnessSessionKey, o as isAgentHarnessSessionKeyOwnedBy } from "./agent-harness-session-key-CLRQddqz.js";\n',
    `import { a as isAgentHarnessSessionKey, o as isAgentHarnessSessionKeyOwnedBy } from "./agent-harness-session-key-CLRQddqz.js";\nimport { listSessionEntriesMatchingReadOnly } from "./${MODULE}";\n`,
    'harness key import',
  ],
  [
    `\t\tif (sessionIds.size === 0 && sessionFiles.size === 0) return;
\t\tconst entries = registryParams.runtime.agent.session.listSessionEntries({
\t\t\t...agentId ? { agentId } : {},
\t\t\t...storePath ? { storePath } : {},
\t\t\treadOnly: true
\t\t});
`,
    `\t\tif (sessionIds.size === 0 && sessionFiles.size === 0) return;
\t\t// ${MARKER}: read only the rows the checks below look at (sessionId or key match).
\t\tconst exactRead = process.env.OPENCLAW_V_SESSION_OWNERSHIP_EXACT !== "0";
\t\tconst listOwnedEntries = (scope, match) => exactRead ? listSessionEntriesMatchingReadOnly(scope, match) : registryParams.runtime.agent.session.listSessionEntries({
\t\t\t...scope,
\t\t\treadOnly: true
\t\t});
\t\tconst ownershipScope = {
\t\t\t...agentId ? { agentId } : {},
\t\t\t...storePath ? { storePath } : {}
\t\t};
\t\tconst entries = listOwnedEntries(ownershipScope, {
\t\t\tsessionIds: [...sessionIds],
\t\t\tsessionKeys: [...sessionFiles]
\t\t});
`,
    'ownership store read',
  ],
  [
    '\t\t\t\tfor (const match of entries) {\n',
    '\t\t\t\tfor (const match of exactRead ? listOwnedEntries(ownershipScope, { sessionIds: [...matchedSessionIds] }) : entries) {\n',
    'matched session id pass',
  ],
  [
    `\t\t\tconst matches = registryParams.runtime.agent.session.listSessionEntries({
\t\t\t\tagentId: marker.agentId,
\t\t\t\tstorePath: marker.storePath,
\t\t\t\treadOnly: true
\t\t\t}).filter(({ entry }) => entry.sessionId === marker.sessionId);
`,
    `\t\t\tconst matches = listOwnedEntries({
\t\t\t\tagentId: marker.agentId,
\t\t\t\tstorePath: marker.storePath
\t\t\t}, { sessionIds: [marker.sessionId] }).filter(({ entry }) => entry.sessionId === marker.sessionId);
`,
    'marker store read',
  ],
]);
export const patchSessionOwnership = ownership.patch;
export const unpatchSessionOwnership = ownership.unpatch;
