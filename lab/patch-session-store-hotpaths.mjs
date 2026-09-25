import assert from 'node:assert/strict';

// Second layer of the dreaming 03:00 stall. After the corpus-listing patch, the remaining
// multi-second blocks on the shared VLab profile were all "materialise every session entry"
// callers on the session-reset path that every dreaming narrative run walks twice
// (subagent.deleteSession before and after the run) plus dreaming's own lifecycle scrub.
function once(source, before, after) {
  assert.equal(source.split(before).length, 2, `Source anchor drift: ${before.slice(0, 120)}`);
  return source.replace(before, after);
}

// session-accessor: cleanupPluginHostSessionStore scans a whole agent store (full projection,
// never cached, one JSON.parse per row) to find the entries owned by a plugin or matching one
// session key, and clearPluginOwnedSessionStores does that for every agent store on each session
// reset/delete. The predicates it applies before the per-entry patch only read metadata
// (sessionId, pluginExtensions, pluginExtensionSlotKeys, pluginNextTurnInjections, promoted slot
// keys, modelSelectionLocked, agentHarnessId) - none of them live in skillsSnapshot or
// systemPromptReport, the two fields the "list" projection strips in SQL. The list projection also
// goes through the process session-entry cache (validated by PRAGMA data_version + the
// session_nodes generation), so an unchanged store costs one cache check instead of a full parse.
// The actual mutation still re-reads the full entry inside patchSessionEntryCore.
export function patchSessionAccessorCleanup(source) {
  assert(!source.includes('projection: "list",\n\t\tstorePath: params.storePath\n\t})) {\n\t\tif (isLockedHarnessSessionOwnedByPlugin'), 'Session accessor cleanup patch already applied');
  return once(source,
`	for (const { entry, sessionKey } of listSessionEntriesCore({
		agentId: params.agentId,
		storePath: params.storePath
	})) {
		if (isLockedHarnessSessionOwnedByPlugin(entry, params.preserveLockedHarnessIds)) continue;`,
`	for (const { entry, sessionKey } of listSessionEntriesCore({
		agentId: params.agentId,
		projection: "list",
		storePath: params.storePath
	})) {
		if (isLockedHarnessSessionOwnedByPlugin(entry, params.preserveLockedHarnessIds)) continue;`);
}

// dreaming-session-cleanup: scrubDreamingNarrativeArtifacts runs after every narrative run
// (light / rem / deep per workspace, so up to a dozen times a night) and each run plans a full
// lifecycle artifact cleanup: two complete session_nodes reads plus per-row transcript queries,
// all inside one synchronous critical section. The scrub only exists to reclaim narrative
// sessions that are already at least DREAMING_ORPHAN_MIN_AGE_MS (5 min) old, so running it at most
// once per agent per 10 minutes loses nothing: whatever a skipped scrub would have reclaimed is
// reclaimed by the next one. Explicit callers that pass nowMs (tests, repair tooling) keep the
// old always-run behaviour.
export function patchDreamingSessionCleanup(source) {
  assert(!source.includes('DREAMING_SCRUB_MIN_INTERVAL_MS'), 'Dreaming session cleanup patch already applied');
  source = once(source,
`async function scrubDreamingNarrativeArtifacts(params) {
	const result = await cleanupSessionLifecycleArtifacts({`,
`const DREAMING_SCRUB_MIN_INTERVAL_MS = 6e5;
const dreamingScrubLastRunMsByAgent = /* @__PURE__ */ new Map();
function shouldSkipDreamingScrub(params) {
	if (params.nowMs !== void 0) return false;
	const now = Date.now();
	const last = dreamingScrubLastRunMsByAgent.get(params.agentId);
	if (last !== void 0 && now - last < DREAMING_SCRUB_MIN_INTERVAL_MS) return true;
	dreamingScrubLastRunMsByAgent.set(params.agentId, now);
	return false;
}
async function scrubDreamingNarrativeArtifacts(params) {
	if (shouldSkipDreamingScrub(params)) return;
	const result = await cleanupSessionLifecycleArtifacts({`);
  return source;
}
