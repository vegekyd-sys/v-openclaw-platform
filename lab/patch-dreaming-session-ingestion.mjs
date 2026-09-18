import assert from 'node:assert/strict';

// Anchor-based rewrite of two OpenClaw 2026.9.1 dist chunks. Every anchor must match exactly once,
// so any upstream drift fails loudly instead of producing a half-applied file.
function once(source, before, after) {
  assert.equal(source.split(before).length, 2, `Source anchor drift: ${before.slice(0, 120)}`);
  return source.replace(before, after);
}

// memory-core-host-engine-sessions: give the transcript-corpus listing a cheap "list" entry projection.
// Dreaming only reads sessionId / updatedAt / spawnedBy / parentSessionKey / heartbeatIsolatedBaseSessionKey,
// none of which live in skillsSnapshot / systemPromptReport (the bulk of entry_json), and none of which are
// among the private fields projectPluginSessionEntry strips. The read-only listing also reuses the process
// session-entry cache instead of re-materialising every row on each call.
export function patchHostEngineSessions(source) {
  assert(!source.includes('options.entryProjection'), 'Host engine sessions patch already applied');
  source = once(source,
    'import { D as listSessionTranscriptArchivesReadOnly, c as listSessionTranscriptInstances } from "./session-accessor.sqlite-entry-BlklNPKQ.js";',
    'import { D as listSessionTranscriptArchivesReadOnly, a as listSessionEntriesReadOnly, c as listSessionTranscriptInstances } from "./session-accessor.sqlite-entry-BlklNPKQ.js";');
  source = once(source,
`	const sessionEntries = listSessionEntries({
		agentId: normalizedAgentId,
		hydrateSkillPromptRefs: false,
		readOnly: options.readOnly === true,
		storePath
	});
	const retainedInstances = options.includeRetainedSqlite ? listSessionTranscriptInstances({
		agentId: normalizedAgentId,
		hydrateSkillPromptRefs: false,
		readConsistency: "latest",
		storePath
	}) : [];`,
`	const listProjection = options.entryProjection === "list";
	const sessionEntries = listProjection ? listSessionEntriesReadOnly({
		agentId: normalizedAgentId,
		clone: false,
		hydrateSkillPromptRefs: false,
		projection: "list",
		storePath
	}) : listSessionEntries({
		agentId: normalizedAgentId,
		hydrateSkillPromptRefs: false,
		readOnly: options.readOnly === true,
		storePath
	});
	const retainedInstances = options.includeRetainedSqlite ? listSessionTranscriptInstances({
		agentId: normalizedAgentId,
		hydrateSkillPromptRefs: false,
		...listProjection ? { projection: "list" } : {},
		readConsistency: "latest",
		storePath
	}) : [];`);
  return source;
}

// dreaming-phases: list the transcript corpus once per sweep per agent (light and REM both ingest), skip the
// per-session content-revision queries the ingestion never reads, and yield to the event loop between
// session scans so the Gateway keeps answering RPCs while dreaming walks thousands of sessions.
export function patchDreamingPhases(source) {
  assert(!source.includes('resolveDreamingSessionCorpusEntries'), 'Dreaming phases patch already applied');
  source = once(source,
    'async function collectSessionIngestionBatches(params) {',
`const DREAMING_SESSION_SCAN_YIELD_EVERY = 32;
let dreamingSessionCorpusSweep = null;
function yieldDreamingEventLoop() {
	return new Promise((resolve) => setImmediate(resolve));
}
// One sweep (light + REM) shares a single corpus listing per agent; a new sweep timestamp evicts the old one.
async function resolveDreamingSessionCorpusEntries(agentId, nowMs) {
	if (dreamingSessionCorpusSweep?.nowMs !== nowMs) dreamingSessionCorpusSweep = {
		nowMs,
		entriesByAgent: /* @__PURE__ */ new Map()
	};
	const sweep = dreamingSessionCorpusSweep;
	let pending = sweep.entriesByAgent.get(agentId);
	if (!pending) {
		pending = listSessionTranscriptCorpusEntriesForAgent(agentId, {
			includeRetainedSqlite: true,
			includeContentRevision: false,
			entryProjection: "list"
		}).catch((err) => {
			if (sweep.entriesByAgent.get(agentId) === pending) sweep.entriesByAgent.delete(agentId);
			throw err;
		});
		sweep.entriesByAgent.set(agentId, pending);
	}
	await yieldDreamingEventLoop();
	return await pending;
}
async function collectSessionIngestionBatches(params) {`);
  source = once(source,
    'for (const entry of await listSessionTranscriptCorpusEntriesForAgent(agentId, { includeRetainedSqlite: true })) {',
    'for (const entry of await resolveDreamingSessionCorpusEntries(agentId, params.nowMs)) {');
  source = once(source,
`	const totalCap = 240;
	let remaining = totalCap;`,
`	const totalCap = 240;
	let remaining = totalCap;
	let scannedSources = 0;`);
  source = once(source,
`	for (const source of sortedSources) {
		if (remaining <= 0) break;
		const fileCap = Math.max(1, Math.min(perFileCap, remaining));`,
`	for (const source of sortedSources) {
		if (remaining <= 0) break;
		if (scannedSources++ % DREAMING_SESSION_SCAN_YIELD_EVERY === 0) await yieldDreamingEventLoop();
		const fileCap = Math.max(1, Math.min(perFileCap, remaining));`);
  return source;
}
