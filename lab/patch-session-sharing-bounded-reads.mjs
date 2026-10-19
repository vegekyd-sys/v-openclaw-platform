import assert from 'node:assert/strict';

export const MARKER = 'session-sharing-bounded-reads-v1';
const replace = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `Expected one anchor: ${before.slice(0, 100)}`);
  return source.replace(before, after);
};

export function patchState(source) {
  assert(!source.includes(MARKER));
  const helper = `// ${MARKER}: inspect a valid full-store snapshot without rebuilding it.
function readSessionEntryCacheIfCurrent(database) {
\tif (database.db.isTransaction) return;
\tconst cached = sessionEntryCaches.get(database.db);
\tif (cached && cacheValidityTokensEqual(cached.validityToken, readCacheValidityToken(database.db))) return cached;
}
`;
  return replace(source, 'function readSessionEntryCache(database, options) {', helper + 'function readSessionEntryCache(database, options) {') +
    '\nexport { readSessionEntryCacheIfCurrent, projectSqliteSessionParticipantsBatch };\n';
}

export function patchEntry(source) {
  assert(!source.includes(MARKER));
  const helper = `// ${MARKER}: one native scope and bounded SQL chunks, no full-store fill.
function loadExactSessionEntriesReadOnly(scope, requestedKeys) {
\tconst keys = [...new Set(requestedKeys.map(key => key.trim()).filter(Boolean))];
\tif (keys.length === 0) return [];
\tconst resolved = resolveSqliteScope({...scope, sessionKey: keys[0]});
\tconst projection = scope.projection ?? "list";
\tconst result = withOpenClawAgentDatabaseReadOnly(database => {
\t\tassertCanonicalSqliteSessionKeysCurrent(database);
\t\tconst cached = projection === "list" ? readSessionEntryCacheIfCurrent(database) : void 0;
\t\t// Missing parsed values for persisted rows still need native invalid/tombstone checks.
\t\tif (cached && !keys.some(key => !cached.entries.has(key) && cached.keys.includes(key))) return keys.flatMap(sessionKey => {
\t\t\tconst entry = cached.entries.get(sessionKey);
\t\t\tif (!entry) return [];
\t\t\tif (resolveDeliveryProvenCanonicalSessionKey(sessionKey, entry) !== sessionKey) throw canonicalSessionKeyMigrationRequiredError(\x60non-canonical persisted row resolves to session key \x24{sessionKey}\x60);
\t\t\treturn [{sessionKey, entry}];
\t\t});
\t\tconst read = () => {
\t\t\tconst entries = new Map();
\t\t\tfor (let offset = 0; offset < keys.length; offset += 400) {
\t\t\t\tconst chunk = keys.slice(offset, offset + 400);
\t\t\t\tconst query = projection === "list" ? selectSessionEntryRows(database, projection).select(["current_session_id", "updated_at"]) : getSessionKysely(database.db).selectFrom("session_nodes").selectAll();
\t\t\t\tconst parsed = new Map();
\t\t\t\tfor (const row of executeSqliteQuerySync(database.db, query.where("session_key", "in", chunk)).rows) {
\t\t\t\t\tconst entry = parseSessionEntryJson(row, projection);
\t\t\t\t\t// Keep the native invalid-row/tombstone contract, including its window check.
\t\t\t\t\tif (!entry) { parseReadableSqliteSessionEntryRow(database, row, projection); continue; }
\t\t\t\t\tparsed.set(row.session_key, entry);
\t\t\t\t}
\t\t\t\tfor (const [sessionKey, entry] of projectSqliteSessionParticipantsBatch(database.db, parsed)) {
\t\t\t\t\tif (resolveDeliveryProvenCanonicalSessionKey(sessionKey, entry) !== sessionKey) throw canonicalSessionKeyMigrationRequiredError(\x60non-canonical persisted row resolves to session key \x24{sessionKey}\x60);
\t\t\t\t\tentries.set(sessionKey, entry);
\t\t\t\t}
\t\t\t}
\t\t\treturn keys.flatMap(sessionKey => entries.has(sessionKey) ? [{sessionKey, entry: entries.get(sessionKey)}] : []);
\t\t};
\t\t// One SQLite snapshot for nodes and participants, including external writers.
\t\treturn database.db.isTransaction ? read() : runSqliteDeferredTransactionSync(database.db, read);
\t}, toDatabaseOptions(resolved));
\treturn result.found ? result.value : [];
}
`;
  return 'import { E as parseSessionEntryJson, readSessionEntryCacheIfCurrent, projectSqliteSessionParticipantsBatch } from "./session-accessor.sqlite-transcript-state-Cz9g7S9v.js";\n' +
    replace(source, 'function loadExactSessionEntryReadOnly(scope) {', helper + 'function loadExactSessionEntryReadOnly(scope) {') +
    '\nexport { loadExactSessionEntriesReadOnly };\n';
}

export function patchUtils(source) {
  assert(!source.includes(MARKER));
  const cacheKey = '`${storePath}\\u0000${agentId ?? ""}\\u0000${clone === false ? "0" : "1"}\\u0000${options.readOnly}\\u0000${options.projection ?? "full"}\\u0000${options.exactKeys?.join("\x01") ?? ""}`';
  let output = replace(source, `const cacheKey = cache ? ${cacheKey} : "";`, 'const cacheKey = cache ? gatewaySessionLookupCacheKey(storePath, clone, agentId, options) : "";');
  output = replace(output, 'function loadGatewaySessionLookupStore(storePath, clone, agentId, options = {}) {', `function gatewaySessionLookupCacheKey(storePath, clone, agentId, options) { return ${cacheKey}; }
function loadGatewaySessionLookupStore(storePath, clone, agentId, options = {}) {`);
  // Planning uses the same routing, aliases, candidate stores and incognito path.
  for (const call of ['loadGatewaySessionLookupStore(target.storePath, params.clone, target.agentId, {', 'loadGatewaySessionLookupStore(storePath, params.clone, agentId, {']) {
    const count = output.split(call).length - 1;
    assert.equal(count, call.startsWith('loadGatewaySessionLookupStore(target') ? 2 : 1);
    output = output.replaceAll(call, '(params.lookupStore ?? loadGatewaySessionLookupStore)(' + call.slice('loadGatewaySessionLookupStore('.length));
  }
  const propagation = '\t\texactRead: params.exactRead,';
  assert.equal(output.split(propagation).length, 3);
  output = output.replaceAll(propagation, propagation + '\n\t\tlookupStore: params.lookupStore,');
  const helper = `// ${MARKER}: prepare once, consume synchronously; never retain across awaits.
function createGatewaySessionStoreBatchCache(params) {
\tconst groups = new Map();
\tconst lookupStore = (storePath, clone, agentId, options) => {
\t\tconst cacheKey = gatewaySessionLookupCacheKey(storePath, clone, agentId, {...options, exactKeys: void 0});
\t\tlet group = groups.get(cacheKey);
\t\tif (!group) groups.set(cacheKey, group = {storePath, agentId, projection: options.projection, keys: new Set(), lookupCacheKeys: new Set([cacheKey])});
\t\t// Live sharing uses warm exact reads; other callers use the full-cache key.
\t\tgroup.lookupCacheKeys.add(gatewaySessionLookupCacheKey(storePath, clone, agentId, options));
\t\tfor (const key of options.exactKeys ?? []) group.keys.add(key);
\t\treturn {};
\t};
\tfor (const target of params.targets) {
\t\ttry {
\t\t\tresolveGatewaySessionStoreTargetWithStore({cfg: params.cfg, key: target.sessionKey, agentId: target.agentId, clone: false, projection: "list", exactRead: true, targetDiscoveryCache: params.targetDiscoveryCache, lookupStore});
\t\t} catch {
\t\t\t// This pass has no rows. A deleted legacy owner may require an actual match.
\t\t\t// The normal resolver below still performs and surfaces every final check.
\t\t}
\t}
\tconst cache = new Map();
\tfor (const [cacheKey, group] of groups) {
\t\tlet store;
\t\ttry {
\t\t\tstore = Object.fromEntries(loadExactSessionEntriesReadOnly(group, [...group.keys]).map(({sessionKey, entry}) => [sessionKey, entry]));
\t\t} catch {
\t\t\t// A failed batch must not hide valid siblings of one malformed row.
\t\t\t// Let the original exact/bulk loader retain its own error degradation.
\t\t\tcontinue;
\t\t}
\t\tfor (const key of group.lookupCacheKeys) cache.set(key, store);
\t}
\treturn cache;
}
`;
  return 'import { loadExactSessionEntriesReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";\n' +
    replace(output, 'function isAgentScopedSentinelSessionKey(canonicalKey) {', helper + 'function isAgentScopedSentinelSessionKey(canonicalKey) {') +
    '\nexport { createGatewaySessionStoreBatchCache };\n';
}

export function patchRead(source) {
  assert(!source.includes(MARKER));
  let output = replace(source, '\t\t\t\tconst sharingStoreCache = /* @__PURE__ */ new Map();\n', '');
  const anchor = '\t\t\t\tconst resolvedSharingTargets = result.sessions.map((session) => resolveSessionSharingTarget({';
  output = replace(output, anchor, `\t\t\t\t// ${MARKER}: read only the selected page after the async list stage.
\t\t\t\tconst sharingStoreCache = createGatewaySessionStoreBatchCache({
\t\t\t\t\tcfg,
\t\t\t\t\ttargetDiscoveryCache,
\t\t\t\t\ttargets: result.sessions.map(session => ({sessionKey: session.key, ...session.key === "global" && p.agentId ? {agentId: p.agentId} : {}}))
\t\t\t\t});
` + anchor);
  return 'import { createGatewaySessionStoreBatchCache } from "./session-utils-store-Dlphca2N.js";\n' + output;
}
