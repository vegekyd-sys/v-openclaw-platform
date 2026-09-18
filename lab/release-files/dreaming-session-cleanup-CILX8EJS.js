import { t as cleanupSessionLifecycleArtifacts } from "./session-store-runtime-Di9N1AZ9.js";
//#region extensions/memory-core/src/dreaming-session-cleanup.ts
const DREAMING_SESSION_KEY_PREFIX = "dreaming-narrative-";
const DREAMING_ORPHAN_MIN_AGE_MS = 3e5;
const DREAMING_TRANSCRIPT_RUN_MARKER = "\"runId\":\"dreaming-narrative-";
const DREAMING_SCRUB_MIN_INTERVAL_MS = 6e5;
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
	const result = await cleanupSessionLifecycleArtifacts({
		agentId: params.agentId,
		archiveRemovedEntryTranscripts: false,
		orphanTranscriptMinAgeMs: DREAMING_ORPHAN_MIN_AGE_MS,
		pluginOwnerId: "memory-core",
		sessionStore: params.config.session?.store,
		sessionKeySegmentPrefix: DREAMING_SESSION_KEY_PREFIX,
		transcriptContentMarker: DREAMING_TRANSCRIPT_RUN_MARKER,
		...params.nowMs === void 0 ? {} : { nowMs: params.nowMs }
	});
	const prunedEntries = result.removedEntries;
	const archivedOrphans = result.archivedTranscriptArtifacts;
	if (prunedEntries > 0 || archivedOrphans > 0) params.logger.info(`memory-core: dreaming cleanup scrubbed ${prunedEntries} stale session entr${prunedEntries === 1 ? "y" : "ies"} and archived ${archivedOrphans} orphan transcript${archivedOrphans === 1 ? "" : "s"}.`);
}
//#endregion
export { DREAMING_SESSION_KEY_PREFIX as n, scrubDreamingNarrativeArtifacts as r, DREAMING_ORPHAN_MIN_AGE_MS as t };
