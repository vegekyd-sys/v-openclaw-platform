import assert from 'node:assert/strict';

// sessions.delete must not read every session's entry_json for its plugin host cleanup (V 2026-11-05).
//
// After #558 the cron cleanup path no longer reads the whole store, but the sessions.delete RPC
// (deleteAfterRun cron jobs and manual deletes) still did: shared VLab measured ~6.5 s and +275-335 MB
// Gateway RSS per call on a store of 3,813 rows / 131 MB entry_json. A private Gateway with a
// node:sqlite trace (lab/candidate/session-delete-rpc-trace.mjs) pinned the raw full read to
//   sessions.delete -> cleanupSessionBeforeMutation -> runPluginHostCleanup
//   -> clearPluginOwnedSessionStores -> cleanupPluginHostSessionStore -> listSessionEntriesCore
// which lists every complete entry (full projection: saved prompts included) to find the one
// session the cleanup targets. On V that is ~1.3G characters, ~2.6 GB of strings, per call.
//
// session-delete-plugin-cleanup-v1: a session-scoped cleanup matches by persisted key or session id,
// both kept by the cached metadata listing; it selects candidates there and reads complete entries
// only for the matched rows. A store-wide cleanup (plugin disable) is unchanged.
// Source: openclaw-versa versa/port-session-delete-plugin-cleanup-20261105 (b0cbe1db060).

export const MARKER = 'session-delete-plugin-cleanup-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

// core/dist/session-accessor-K0XuW6ln.js
export function patchSessionAccessor(source) {
  assert(!source.includes(MARKER), 'already patched');
  let out = replaceExactlyOnce(source,
    `m as matchesPluginHostCleanupSession, p as isLockedHarnessSessionOwnedByPlugin, s as resolveSessionEntrySelection, t as listSessionEntriesCore, u as clearPluginHostCleanupTarget } from "./session-accessor.entry-B8arwR7t.js";`,
    `m as matchesPluginHostCleanupSession, n as openSessionEntryReadView, p as isLockedHarnessSessionOwnedByPlugin, s as resolveSessionEntrySelection, t as listSessionEntriesCore, u as clearPluginHostCleanupTarget } from "./session-accessor.entry-B8arwR7t.js";`,
    'session-accessor.entry import');
  out = replaceExactlyOnce(out,
    `async function cleanupPluginHostSessionStore(params) {`,
    `// ${MARKER}: a session-scoped cleanup selects candidates from the cached metadata listing
// (key and session id are kept there) and reads complete entries only for the matched rows.
function listPluginHostCleanupCandidates(params) {
	const scope = {
		agentId: params.agentId,
		storePath: params.storePath
	};
	if (!params.sessionKey) return listSessionEntriesCore(scope);
	const view = openSessionEntryReadView(scope);
	return listSessionEntriesCore({
		...scope,
		projection: "list"
	}).filter(({ entry, sessionKey }) => matchesPluginHostCleanupSession(sessionKey, entry, params.sessionKey)).flatMap(({ sessionKey }) => {
		const entry = view.get(sessionKey);
		return entry ? [{
			entry: structuredClone(entry),
			sessionKey
		}] : [];
	});
}
async function cleanupPluginHostSessionStore(params) {`,
    'cleanupPluginHostSessionStore');
  out = replaceExactlyOnce(out,
    `	for (const { entry, sessionKey } of listSessionEntriesCore({
		agentId: params.agentId,
		storePath: params.storePath
	})) {
		if (isLockedHarnessSessionOwnedByPlugin(entry, params.preserveLockedHarnessIds)) continue;`,
    `	for (const { entry, sessionKey } of listPluginHostCleanupCandidates(params)) {
		if (isLockedHarnessSessionOwnedByPlugin(entry, params.preserveLockedHarnessIds)) continue;`,
    'cleanup candidate loop');
  return out;
}

export const FILES = [
  { name: 'session-accessor-K0XuW6ln.js', base: 'core/dist', target: 'openclaw/dist', before: '30c7b9d6e3d9baf842e51f4811708b0f21a95c5cd36ebc150b2dd7a2fed2c15d', patch: patchSessionAccessor },
];
