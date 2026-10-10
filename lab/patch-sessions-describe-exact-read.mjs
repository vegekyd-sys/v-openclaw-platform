import assert from 'node:assert/strict';

// sessions.describe reads only the requested session and its direct children, not the whole store.
//
// sessions.describe found its session with loadSessionEntriesForTarget (no exactRead): every
// makaron session entry (on V: 2,558, 158 MB of JSON) loaded and parsed on the Gateway main thread,
// then handed to buildGatewaySessionRow. On V (2026-10-10) it ran 31 times in 24 hours, p50 7.9 s,
// max 9.9 s; one call at 08:08 stalled the event loop for 8.5 s (a session opened in Control UI).
//
// buildGatewaySessionRow uses the store for one thing only: resolveChildSessionKeys, which keeps
// the entries whose spawnedBy or parentSessionKey is this session (and reads only those entries).
// Upstream's own single-row path (loadGatewaySessionSnapshot) already loads exactly that:
// includeStoreChildEntries adds the rows whose parent_session_key or spawned_by column is the
// session. sessions.describe now resolves its target with exactRead, readOnly and
// includeStoreChildEntries, and picks the entry with the same resolveCanonicalSessionEntryFromStoreKeys.
// Unchanged: agent resolution, the null answer for a missing session, the row options
// (includeDerivedTitles, includeLastMessage, transcriptUsageMaxBytes) and the placement fields.

export const MARKER = 'sessions-describe-exact-read';

export function patchSessionsRead(source) {
  assert(!source.includes(MARKER), 'sessions.describe already patched');
  assert(source.includes('sessions-get-exact-read'), 'expected the sessions.get patch (#308) underneath');
  const before = '\t\tconst { target, storePath, store, entry } = loadSessionEntriesForTarget({\n\t\t\tkey,\n\t\t\tcfg,\n\t\t\t...requestedAgent.agentId ? { agentId: requestedAgent.agentId } : {}\n\t\t});';
  assert.equal(source.split(before).length, 2, 'Expected exactly one sessions.describe store lookup');
  return source.replace(before, `\t\t// ${MARKER}: this session and its direct children only (all buildGatewaySessionRow reads), as loadGatewaySessionSnapshot does.
\t\tconst target = resolveGatewaySessionStoreTargetWithStore({
\t\t\tcfg,
\t\t\tkey,
\t\t\t...requestedAgent.agentId ? { agentId: requestedAgent.agentId } : {},
\t\t\texactRead: true,
\t\t\treadOnly: true,
\t\t\tincludeStoreChildEntries: true
\t\t});
\t\tconst { storePath, store } = target;
\t\tconst entry = resolveCanonicalSessionEntryFromStoreKeys(store, target.storeKeys);`);
}
