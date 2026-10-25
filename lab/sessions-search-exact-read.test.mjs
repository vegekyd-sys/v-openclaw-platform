import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MARKER as KEY_MARKER, patchSessionsResolve, unpatchSessionsResolve } from './patch-sessions-resolve-exact-read.mjs';
import {
  COMBINED, MARKER, MODULE, OWNERSHIP, RESOLVE,
  patchCombinedStore, patchSessionOwnership, patchSessionsResolveSearch, sha256,
  unpatchCombinedStore, unpatchSessionOwnership, unpatchSessionsResolveSearch,
} from './patch-sessions-search-exact-read.mjs';

// sessions-search-exact-read: sessions.resolve by sessionId / label / shortId and the plugin session
// ownership check read only the rows they can match. See lab/sessions-search-exact-read.md.
const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
const dir = 'lab/release-files/sessions-search-exact-read';
const plan = JSON.parse(read('lab/sessions-search-exact-read.plan.json'));
const released = Object.fromEntries([RESOLVE, COMBINED, OWNERSHIP, MODULE].map((name) => [name, read(`${dir}/${name}`)]));
const original = {
  [RESOLVE]: unpatchSessionsResolve(unpatchSessionsResolveSearch(released[RESOLVE])),
  [COMBINED]: unpatchCombinedStore(released[COMBINED]),
  [OWNERSHIP]: unpatchSessionOwnership(released[OWNERSHIP]),
};
const patch = {
  [RESOLVE]: (s) => patchSessionsResolveSearch(patchSessionsResolve(s)),
  [COMBINED]: patchCombinedStore,
  [OWNERSHIP]: patchSessionOwnership,
};
const branch = (source, from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
const removedLines = (name) => {
  const releaseLines = new Set(released[name].split('\n'));
  return original[name].split('\n').filter((line) => !releaseLines.has(line)).map((line) => line.trim());
};

test('plan pins V bytes before and the release files after', () => {
  assert.deepEqual(plan.files.map((f) => f.target), [RESOLVE, COMBINED, OWNERSHIP, MODULE].map((name) => `openclaw/dist/${name}`));
  for (const file of plan.files) {
    const name = file.target.slice('openclaw/dist/'.length);
    assert.equal(file.source, `${dir}/${name}`);
    assert.equal(sha256(released[name]), file.after, `release bytes ${name}`);
    if (name === MODULE) {
      assert.equal(file.before, null, 'new file');
      continue;
    }
    assert.equal(sha256(original[name]), file.before, `V bytes ${name}`);
    assert.equal(patch[name](original[name]), released[name]);
    assert.throws(() => patch[name](released[name]), /already patched/);
  }
  // this plan carries PR #462's key lookup as well
  assert(released[RESOLVE].includes(KEY_MARKER));
});

test('sessions.resolve: the three searches pass a match; nothing else changes', () => {
  const source = released[RESOLVE];
  assert.equal(source.split('loadCombinedSessionStoreForGatewayCore(').length - 1, 1, 'only the switchable loader calls it');
  assert.match(source, /const searchExact = process\.env\.OPENCLAW_V_SESSIONS_RESOLVE_SEARCH_EXACT !== "0";/);
  assert.match(source, /loadCombinedSessionStoreForGatewayCore\(cfg, searchExact \? \{\n\t\t\.\.\.opts,\n\t\tmatch\n\t\} : opts\)/);
  // findVisibleSessionIdMatches keeps entry.sessionId === sessionId || key === sessionId
  assert.match(source, /const sessionIdMatch = \{\n\t\tsessionIds: \[sessionId\],\n\t\tsessionKeys: \[sessionId\]\n\t\};/);
  assert.match(source, /entry\?\.sessionId === params\.sessionId \|\| key === params\.sessionId/);
  assert.equal(source.split('loadSearchStore({ agentId }, sessionIdMatch)').length - 1, 1);
  assert.equal(source.split('loadSearchStore({ agentId: p.agentId }, sessionIdMatch)').length - 1, 1);
  // the shortId key filter is findVisibleShortIdMatches' own key test
  const shortTest = '(parseAgentSessionKey(storedKey)?.rest.match(SESSION_UUID_SUFFIX_RE)?.[1])?.toLowerCase().replaceAll("-", "").startsWith(shortId) === true';
  assert(source.includes(shortTest));
  assert(source.includes(shortTest.replace('storedKey', 'key').replace('startsWith(shortId) === true', 'startsWith(params.shortId)')));
  // label: parseSessionLabel trims; filterSessionEntries compares entry.label to the trimmed label
  assert(source.includes('loadSearchStore({ agentId: p.agentId }, { labels: [parsedLabel.label] })'));
  assert.match(source, /label: parsedLabel\.label,\n\t\t\tlimit: 2/);
  // the lines replaced are the four store reads (and PR #462's key read)
  assert.deepEqual(removedLines(RESOLVE).sort(), [
    'const entry = store[target.canonicalKey];',
    'const { store } = loadCombinedSessionStoreForGatewayCore(cfg, { agentId: p.agentId });',
    'const { store } = loadCombinedSessionStoreForGatewayCore(cfg, { agentId: p.agentId });',
    'const { storePath, store } = loadCombinedSessionStoreForGatewayCore(cfg, { agentId: p.agentId });',
    'store: loadCombinedSessionStoreForGatewayCore(cfg, { agentId }).store,',
  ].sort());
  // matching, visibility and selection functions are V's
  const helpers = (s) => s.slice(s.indexOf('function resolveSessionVisibilityFilterOptions'), s.indexOf('async function resolveSessionKeyFromResolveParams'));
  assert.equal(helpers(source), helpers(original[RESOLVE]));
});

test('combined store: match only changes how durable rows are read', () => {
  const source = released[COMBINED];
  assert.deepEqual(removedLines(COMBINED), ['storePath']);
  assert.match(source, /if \(params\.match && !params\.includeOpenDatabases\) return listSessionEntriesMatchingReadOnly\(\{/);
  assert.match(source, /storePath,\n\t\t\t\.\.\.opts\.match \? \{ match: opts\.match \} : \{\}\n\t\t\}\);/);
  // canonical keys, lineage rewrite, configured-agent filter and incognito stores are V's
  for (const fn of ['function mergeSessionEntryIntoCombined', 'function mergeOpenIncognitoStores', 'function filterCombinedStoreToConfiguredAgents', 'function resolveGatewaySessionStoreTargets']) {
    const body = (s) => branch(s, fn, '\n}\n');
    assert.equal(body(source), body(original[COMBINED]), fn);
  }
  const loop = (s) => branch(s, '\t\tfor (const { sessionKey: key, entry } of store) {', 'const incognitoStorePaths');
  assert.equal(loop(source), loop(original[COMBINED]));
});

test('ownership: the same checks over the rows they look at', () => {
  const source = released[OWNERSHIP];
  assert.match(source, /const exactRead = process\.env\.OPENCLAW_V_SESSION_OWNERSHIP_EXACT !== "0";/);
  assert.match(source, /listOwnedEntries\(ownershipScope, \{\n\t\t\tsessionIds: \[\.\.\.sessionIds\],\n\t\t\tsessionKeys: \[\.\.\.sessionFiles\]\n\t\t\}\)/);
  assert(source.includes('for (const match of exactRead ? listOwnedEntries(ownershipScope, { sessionIds: [...matchedSessionIds] }) : entries) {'));
  assert(source.includes('}, { sessionIds: [marker.sessionId] }).filter(({ entry }) => entry.sessionId === marker.sessionId);'));
  // switch off: the original runtime call, same arguments
  assert.match(source, /: registryParams\.runtime\.agent\.session\.listSessionEntries\(\{\n\t\t\t\.\.\.scope,\n\t\t\treadOnly: true\n\t\t\}\);/);
  // the assertions themselves are V's
  for (const needle of ['for (const { sessionKey, entry } of entries) if (sessionIds.has(entry.sessionId)) assertSessionEntryOwned({', 'const sessionKeyMatches = entries.filter(({ sessionKey }) => sessionKey === sessionFile);', 'if (matches.length === 0) throw new Error(`Plugin session ownership target not found: ${marker.sessionId}`);']) {
    assert(source.includes(needle) && original[OWNERSHIP].includes(needle), needle);
  }
  const outside = (s) => s.slice(0, s.indexOf('const assertSessionIdentitiesOwned')) + s.slice(s.indexOf('const resolveRunSessionExecutionOwner'));
  assert.equal(outside(source).replace(`import { listSessionEntriesMatchingReadOnly } from "./${MODULE}";\n`, ''), outside(original[OWNERSHIP]));
});

test('matching reader: the whole-store read limited to candidate keys', () => {
  const source = released[MODULE];
  assert(source.includes(MARKER));
  // candidates come from the indexed id column, the key, the label column, or a key-only pass
  assert.match(source, /where\("current_session_id", "in", chunk\)/);
  assert.match(source, /where\("session_key", "in", chunk\)\)/);
  assert.match(source, /where\("label", "in", chunk\)/);
  assert.match(source, /db\.selectFrom\("session_nodes"\)\.select\("session_key"\)\)\.rows\) \{\n\t\t\t\tif \(match\.keyFilter\(row\.session_key\)\)/);
  // rows are read like loadSessionEntrySnapshot and filtered like listSqliteSessionEntriesFromDatabase
  assert.match(source, /selectSessionEntryRows\(database, projection\)\.select\("updated_at"\)\.where\("session_key", "in", chunk\)\.orderBy\("session_key"\)/);
  assert.match(source, /const entry = parseSessionEntryJson\(row, projection\);\n\t\t\t\tif \(entry\) parsedEntries\.set/);
  assert.match(source, /projectSqliteSessionParticipantsBatch\(database\.db, parsedEntries\)/);
  assert.match(source, /if \(isInternalSessionEffectsKey\(sessionKey\)\) return \[\];/);
  assert.match(source, /if \(deliveryCanonicalKey !== sessionKey\) throw canonicalSessionKeyMigrationRequiredError/);
  assert.match(source, /assertCanonicalSqliteSessionKeysCurrent\(database\);/);
  // no whole-row scan
  assert.doesNotMatch(source, /selectAll|entry_json/);
});
