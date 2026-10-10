import assert from 'node:assert/strict';

// sessions.get reads only the requested session's store keys, as sessions.preview already does.
//
// sessions.get found its session with loadSessionEntriesForTarget, which calls
// resolveGatewaySessionStoreTargetWithStore without exactRead: the whole agent session store
// (on V, makaron: 2,558 sessions, 158 MB of entry JSON) loaded and parsed on the Gateway main
// thread, to pick one entry. Night Shift reads a card's session this way (limit 12-300) to see
// whether its agent is still working: 968 calls in 6 hours on V (2026-10-10), avg 1.7 s, max 3.0 s,
// about 27 minutes of blocked main thread. sessions.preview, in the same file, already looks
// sessions up with exactRead: true, readOnly: true and never shows up in the >=50 ms log.
//
// sessions.get now resolves its target the same way and picks the entry with the same
// resolveCanonicalSessionEntryFromStoreKeys over the same storeKeys; it uses only storePath and
// the entry afterwards, never the store. Unchanged: key and agent resolution, the empty answer for
// a missing session, the message read and its limits. sessions.describe, which hands the store to
// buildGatewaySessionRow, keeps the full read.

export const MARKER = 'sessions-get-exact-read';

export function patchSessionsRead(source) {
  assert(!source.includes(MARKER), 'sessions read already patched');
  const before = '\t\tconst { storePath, entry } = loadSessionEntriesForTarget({\n\t\t\tkey,\n\t\t\tcfg,\n\t\t\tagentId: requestedAgent.agentId\n\t\t});\n\t\tif (!entry?.sessionId) {\n\t\t\trespond(true, { messages: [] }, void 0);';
  assert.equal(source.split(before).length, 2, 'Expected exactly one sessions.get store lookup');
  return source.replace(before, `\t\t// ${MARKER}: read only this session's store keys, as sessions.preview does.
\t\tconst target = resolveGatewaySessionStoreTargetWithStore({
\t\t\tcfg,
\t\t\tkey,
\t\t\tagentId: requestedAgent.agentId,
\t\t\texactRead: true,
\t\t\treadOnly: true
\t\t});
\t\tconst storePath = target.storePath;
\t\tconst entry = resolveCanonicalSessionEntryFromStoreKeys(target.store, target.storeKeys);
\t\tif (!entry?.sessionId) {
\t\t\trespond(true, { messages: [] }, void 0);`);
}
