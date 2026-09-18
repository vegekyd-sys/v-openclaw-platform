import { a as asOptionalRecord } from "./record-coerce-DItp3I4t.js";
import { n as getRuntimeConfig } from "./io.runtime-CKu7Rw0j.js";
import { p as redactSensitiveText } from "./redact-Df68iObN.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { lt as stripInboundMetadata } from "./openclaw-state-db-Bh3Bq87y.js";
import { f as stripInternalRuntimeContext } from "./internal-runtime-context-DWUZUDW2.js";
import { i as isSilentReplyPayloadText } from "./tokens-DbeAFqg7.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { C as isCronRunSessionKey } from "./session-key-CRjxKW0X.js";
import { f as parseUsageCountedSessionIdFromFileName, g as materializeSessionArchiveForRead, r as isCompactionCheckpointTranscriptFileName, s as isSessionArchiveArtifactName, u as isUsageCountedSessionTranscriptFileName } from "./artifacts-DMDO9PHy.js";
import { l as resolveSessionTranscriptsDirForAgent } from "./paths-DDTeIhCT.js";
import { _ as resolveSessionAgentId } from "./agent-scope-CSlN0kZb.js";
import { D as listSessionTranscriptArchivesReadOnly, c as listSessionTranscriptInstances } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { n as parseSqliteSessionFileMarker } from "./legacy-sqlite-marker-COPKCuIN.js";
import { j as listSessionParticipantsReadOnly } from "./session-accessor.sqlite-transcript-state-Cz9g7S9v.js";
import "./session-accessor-K0XuW6ln.js";
import { n as canonicalizeMainSessionAlias } from "./main-session-TZQkcBLs.js";
import { a as readRegularFile, s as statRegularFile } from "./fs-utils-BgbE2uPY.js";
import { n as HEARTBEAT_PROMPT } from "./heartbeat-ofet59jF.js";
import { a as hasInterSessionUserProvenance } from "./input-provenance-CCQsDhUy.js";
import { r as isHeartbeatUserMessage } from "./heartbeat-filter-D8ksZ4Uk.js";
import { n as retryTransientMemoryRead, r as hashText } from "./read-retry-BdeoTeOo.js";
import "./query-expansion-_C4ftD-k.js";
import { h as resolveTranscriptSessionKeyBySessionId, i as listSessionEntries, m as resolveStorePath, o as loadTranscriptEventsSync, u as readTranscriptStatsSync } from "./session-store-runtime-Di9N1AZ9.js";
import { a as isExecCompletionEvent } from "./heartbeat-events-filter-CEGCW5Gh.js";
import { t as classifySessionMessageOrigin } from "./session-provenance-HdsJkZBJ.js";
import { a as readTranscriptContentRevisionSync, i as isDreamingNarrativeSessionStoreKey, n as extractAgentIdFromSessionPath, r as extractAgentIdFromSessionsDir } from "./openclaw-runtime-session-DIUJdVKp.js";
import fs from "node:fs";
import path from "node:path";
//#region packages/memory-host-sdk/src/host/session-reset-recall.ts
function eventId(event) {
	if (!event || typeof event !== "object" || Array.isArray(event)) return;
	const id = event.id;
	return typeof id === "string" && id.trim() ? id : void 0;
}
/** Resolves the first raw transcript line owned by the current reset generation. */
function resolveSessionResetRecallCutoff(events) {
	const resetIndex = events.findLastIndex((event) => event !== null && typeof event === "object" && !Array.isArray(event) && event.type === "reset");
	if (resetIndex < 0) return { state: "absent" };
	const reset = events[resetIndex];
	if (reset.firstKeptEntryId === void 0) return {
		state: "valid",
		cutoffLine: resetIndex + 1
	};
	if (typeof reset.firstKeptEntryId !== "string" || !reset.firstKeptEntryId.trim()) return { state: "invalid" };
	const keptIndex = events.findIndex((event, index) => index < resetIndex && eventId(event) === reset.firstKeptEntryId);
	return keptIndex < 0 ? { state: "invalid" } : {
		state: "valid",
		cutoffLine: keptIndex + 1
	};
}
//#endregion
//#region packages/memory-host-sdk/src/host/session-transcript-corpus.ts
function fileContentRevision(filePath) {
	try {
		const stat = fs.statSync(filePath, { bigint: true });
		if (!stat.isFile()) return;
		return `file:${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
	} catch {
		return;
	}
}
function sqliteContentRevision(params) {
	try {
		return readTranscriptContentRevisionSync(params);
	} catch {
		return;
	}
}
function isDreamingNarrativeSessionKeyLike(value) {
	return typeof value === "string" && isDreamingNarrativeSessionStoreKey(value);
}
function normalizeComparablePath$1(pathname) {
	const resolved = path.resolve(pathname);
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
function normalizeRealComparablePath(pathname) {
	try {
		return normalizeComparablePath$1(fs.realpathSync(pathname));
	} catch {
		try {
			return normalizeComparablePath$1(path.join(fs.realpathSync(path.dirname(pathname)), path.basename(pathname)));
		} catch {
			return normalizeComparablePath$1(pathname);
		}
	}
}
function rememberArtifactDir(dirs, dir) {
	dirs.set(normalizeRealComparablePath(dir), dir);
}
function classifySessionEntry(sessionKey, entry, cronGeneratedSessionKeys) {
	const generatedByDreamingNarrative = isDreamingNarrativeSessionStoreKey(sessionKey) || isDreamingNarrativeSessionKeyLike(entry.spawnedBy);
	const generatedByCronRun = cronGeneratedSessionKeys.has(sessionKey);
	return {
		generatedByDreamingNarrative,
		generatedByCronRun,
		sessionKind: generatedByCronRun ? "cron" : typeof entry.heartbeatIsolatedBaseSessionKey === "string" && entry.heartbeatIsolatedBaseSessionKey.trim() ? "heartbeat" : generatedByDreamingNarrative || Boolean(entry.spawnedBy) ? "subagent" : sessionKey.includes(":subagent:") ? "subagent" : "interactive"
	};
}
function readParentSessionKeys(entry) {
	const keys = /* @__PURE__ */ new Set();
	for (const value of [entry?.parentSessionKey, entry?.spawnedBy]) {
		if (typeof value !== "string") continue;
		const trimmed = value.trim();
		if (trimmed) keys.add(trimmed);
	}
	return [...keys];
}
function collectCronGeneratedSessionKeys(summaries) {
	const entriesByKey = new Map(summaries.map((summary) => [summary.sessionKey, summary.entry]));
	const cronGeneratedKeys = /* @__PURE__ */ new Set();
	const cache = /* @__PURE__ */ new Map();
	const resolving = /* @__PURE__ */ new Set();
	const isCronGenerated = (sessionKey, entry) => {
		if (isCronRunSessionKey(sessionKey)) {
			cache.set(sessionKey, true);
			cronGeneratedKeys.add(sessionKey);
			return true;
		}
		const cached = cache.get(sessionKey);
		if (cached !== void 0) return cached;
		if (resolving.has(sessionKey)) return false;
		resolving.add(sessionKey);
		const generated = readParentSessionKeys(entry).some((parentKey) => isCronRunSessionKey(parentKey) || isCronGenerated(parentKey, entriesByKey.get(parentKey)));
		resolving.delete(sessionKey);
		cache.set(sessionKey, generated);
		if (generated) cronGeneratedKeys.add(sessionKey);
		return generated;
	};
	for (const summary of summaries) isCronGenerated(summary.sessionKey, summary.entry);
	return cronGeneratedKeys;
}
function toSessionStoreCorpusEntry(agentId, storePath, summary, cronGeneratedSessionKeys, includeContentRevision) {
	const sessionId = summary.entry.sessionId?.trim();
	if (!sessionId) return null;
	const sessionKey = summary.sessionKey.trim();
	const classification = classifySessionEntry(summary.sessionKey, summary.entry, cronGeneratedSessionKeys);
	const contentRevision = includeContentRevision ? sqliteContentRevision({
		agentId,
		sessionId,
		...sessionKey ? { sessionKey } : {},
		storePath
	}) : void 0;
	return {
		agentId,
		artifactKind: "active-session",
		sessionFile: sessionKey,
		sessionId,
		...contentRevision ? { contentRevision } : {},
		transcriptSource: "sqlite",
		storePath,
		...Number.isFinite(summary.entry.updatedAt) ? { updatedAtMs: summary.entry.updatedAt } : {},
		...sessionKey ? { sessionKey } : {},
		...classification.generatedByDreamingNarrative ? { generatedByDreamingNarrative: true } : {},
		...classification.generatedByCronRun ? { generatedByCronRun: true } : {},
		sessionKind: classification.sessionKind
	};
}
function toRetainedSessionCorpusEntry(agentId, instance, sessionKey, storePath, cronGeneratedSessionKeys, includeContentRevision) {
	if (!instance.provenanceKnown || instance.acpOwned || instance.entry.pluginOwnerId || instance.entry.hookExternalContentSource) return null;
	const classification = classifySessionEntry(sessionKey, instance.entry, cronGeneratedSessionKeys);
	const contentRevision = includeContentRevision ? sqliteContentRevision({
		agentId,
		sessionId: instance.sessionId,
		...sessionKey ? { sessionKey } : {},
		storePath
	}) : void 0;
	return {
		agentId,
		artifactKind: "retained-session",
		sessionFile: sessionKey,
		sessionId: instance.sessionId,
		...contentRevision ? { contentRevision } : {},
		storePath,
		transcriptSource: "sqlite",
		updatedAtMs: instance.updatedAtMs,
		...sessionKey ? { sessionKey } : {},
		...classification.generatedByDreamingNarrative ? { generatedByDreamingNarrative: true } : {},
		...classification.generatedByCronRun ? { generatedByCronRun: true } : {},
		sessionKind: classification.sessionKind
	};
}
function listSessionTranscriptArtifactFiles(sessionsDir) {
	try {
		return fs.readdirSync(sessionsDir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).filter((name) => isUsageCountedSessionTranscriptFileName(name)).filter((name) => isSessionArchiveArtifactName(name)).map((name) => path.join(sessionsDir, name));
	} catch (err) {
		if (err.code === "ENOENT") return [];
		throw err;
	}
}
function toArtifactCorpusEntry(agentId, artifactPath, sessionId, primaryEntry, includeContentRevision = true) {
	const contentRevision = includeContentRevision ? fileContentRevision(artifactPath) : void 0;
	return {
		agentId,
		artifactKind: "archive-artifact",
		sessionFile: artifactPath,
		sessionId,
		...contentRevision ? { contentRevision } : {},
		...primaryEntry?.generatedByDreamingNarrative ? { generatedByDreamingNarrative: true } : {},
		...primaryEntry?.generatedByCronRun ? { generatedByCronRun: true } : {},
		sessionKind: primaryEntry?.sessionKind ?? "unknown"
	};
}
function listSessionTranscriptCorpusEntriesForAgentSync(agentId, options = {}) {
	const includeContentRevision = options.includeContentRevision !== false;
	const normalizedAgentId = normalizeAgentId(agentId);
	const cfg = getRuntimeConfig();
	const configuredStore = cfg.session?.store;
	const storePath = resolveStorePath(configuredStore, { agentId: normalizedAgentId });
	const sessionsDir = path.dirname(storePath);
	const fixedStoreOwnerAgentId = extractAgentIdFromSessionsDir(sessionsDir);
	const isAgentOwnedFixedStore = fixedStoreOwnerAgentId !== null && normalizeAgentId(fixedStoreOwnerAgentId) === normalizedAgentId;
	const isSharedFixedStore = typeof configuredStore === "string" && configuredStore.trim().length > 0 && !configuredStore.includes("{agentId}") && !isAgentOwnedFixedStore;
	const activeEntriesBySessionId = /* @__PURE__ */ new Map();
	const entryOwnersBySessionId = /* @__PURE__ */ new Map();
	const artifactDirsByPath = /* @__PURE__ */ new Map();
	rememberArtifactDir(artifactDirsByPath, sessionsDir);
	rememberArtifactDir(artifactDirsByPath, resolveSessionTranscriptsDirForAgent(normalizedAgentId));
	const sessionEntries = listSessionEntries({
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
	}) : [];
	const artifactPaths = [];
	const scannedArtifactPaths = /* @__PURE__ */ new Set();
	for (const artifactDir of artifactDirsByPath.values()) for (const artifactPath of listSessionTranscriptArtifactFiles(artifactDir)) {
		const normalizedArtifactPath = normalizeRealComparablePath(artifactPath);
		if (!scannedArtifactPaths.has(normalizedArtifactPath)) {
			scannedArtifactPaths.add(normalizedArtifactPath);
			artifactPaths.push(artifactPath);
		}
	}
	const archivedIdentitiesByName = new Map(listSessionTranscriptArchivesReadOnly({
		agentId: normalizedAgentId,
		archiveNames: artifactPaths.map((artifactPath) => path.basename(artifactPath)),
		storePath
	}).map((archive) => [archive.archiveName, archive]));
	const cronGeneratedSessionKeys = collectCronGeneratedSessionKeys([...retainedInstances.map(({ entry, sessionKey }) => ({
		entry,
		sessionKey
	})), ...sessionEntries]);
	for (const summary of sessionEntries) {
		const sessionKey = isSharedFixedStore ? summary.sessionKey : canonicalizeMainSessionAlias({
			cfg,
			agentId: normalizedAgentId,
			sessionKey: summary.sessionKey
		});
		const ownerAgentId = resolveSessionAgentId({
			config: cfg,
			sessionKey,
			...isSharedFixedStore ? {} : { fallbackAgentId: normalizedAgentId }
		});
		const entry = toSessionStoreCorpusEntry(ownerAgentId, storePath, summary, cronGeneratedSessionKeys, includeContentRevision);
		if (!entry) continue;
		entryOwnersBySessionId.set(entry.sessionId, ownerAgentId);
		if (ownerAgentId === normalizedAgentId) activeEntriesBySessionId.set(entry.sessionId, entry);
	}
	const includeUnownedArtifacts = !isSharedFixedStore;
	const corpusEntries = [...activeEntriesBySessionId.values()];
	if (options.includeRetainedSqlite) for (const instance of retainedInstances) {
		if (activeEntriesBySessionId.has(instance.sessionId)) continue;
		const sessionKey = isSharedFixedStore ? instance.sessionKey : canonicalizeMainSessionAlias({
			cfg,
			agentId: normalizedAgentId,
			sessionKey: instance.sessionKey
		});
		const ownerAgentId = resolveSessionAgentId({
			config: cfg,
			sessionKey,
			...isSharedFixedStore ? {} : { fallbackAgentId: normalizedAgentId }
		});
		if (ownerAgentId !== normalizedAgentId) continue;
		const entry = toRetainedSessionCorpusEntry(ownerAgentId, instance, sessionKey, storePath, cronGeneratedSessionKeys, includeContentRevision);
		if (entry?.transcriptSource === "sqlite") corpusEntries.push(entry);
	}
	for (const artifactPath of artifactPaths) {
		const artifactName = path.basename(artifactPath);
		const archivedIdentity = archivedIdentitiesByName.get(artifactName);
		const primarySessionId = archivedIdentity?.sessionId ?? parseUsageCountedSessionIdFromFileName(artifactName);
		if (!primarySessionId) continue;
		const primaryEntry = activeEntriesBySessionId.get(primarySessionId);
		const primaryOwner = entryOwnersBySessionId.get(primarySessionId);
		if (primaryOwner && primaryOwner !== normalizedAgentId) continue;
		if (!primaryOwner && !archivedIdentity && !includeUnownedArtifacts) continue;
		corpusEntries.push({
			...toArtifactCorpusEntry(normalizedAgentId, artifactPath, primarySessionId, primaryEntry, includeContentRevision),
			...archivedIdentity?.sessionKey ? { sessionKey: archivedIdentity.sessionKey } : {},
			...archivedIdentity ? { storePath } : {}
		});
	}
	return corpusEntries;
}
/**
* Lists transcript corpus entries for memory indexing.
*
* Active sessions come from the session accessor seam; retained reset/delete
* transcript artifacts remain explicit file artifacts until core owns archive
* artifact enumeration.
*/
async function listSessionTranscriptCorpusEntriesForAgent(agentId, options = {}) {
	return listSessionTranscriptCorpusEntriesForAgentSync(agentId, options);
}
//#endregion
//#region packages/memory-host-sdk/src/host/session-files.ts
const SESSION_EXPORT_CONTENT_WRAP_CHARS = 800;
const SESSION_ENTRY_PARSE_YIELD_LINES = 250;
const MAX_DATE_TIMESTAMP_MS = 864e13;
const DIRECT_CRON_PROMPT_RE = /^\[cron:[^\]]+\]\s*/;
function shouldSkipTranscriptFileForDreaming(absPath) {
	const fileName = path.basename(absPath);
	if (isCompactionCheckpointTranscriptFileName(fileName)) return true;
	if (isSessionArchiveArtifactName(fileName) && !isUsageCountedSessionTranscriptFileName(fileName)) return true;
	return false;
}
function isUsageCountedSessionArchiveTranscriptPath(absPath) {
	const fileName = path.basename(absPath);
	return isUsageCountedSessionTranscriptFileName(fileName) && isSessionArchiveArtifactName(fileName) && parseUsageCountedSessionIdFromFileName(fileName) !== null;
}
function isDreamingNarrativeBootstrapRecord(record) {
	if (!record || typeof record !== "object" || Array.isArray(record)) return false;
	const candidate = record;
	if (candidate.type !== "custom" || candidate.customType !== "openclaw:bootstrap-context:full" || !candidate.data || typeof candidate.data !== "object" || Array.isArray(candidate.data)) return false;
	const runId = candidate.data.runId;
	return typeof runId === "string" && runId.startsWith("dreaming-narrative-");
}
function hasDreamingNarrativeIdentity(value) {
	return typeof value === "string" && isDreamingNarrativeSessionStoreKey(value);
}
function isDreamingNarrativeGeneratedRecord(record) {
	if (isDreamingNarrativeBootstrapRecord(record)) return true;
	if (!record || typeof record !== "object" || Array.isArray(record)) return false;
	const candidate = record;
	if (hasDreamingNarrativeIdentity(candidate.runId) || hasDreamingNarrativeIdentity(candidate.sessionKey)) return true;
	const message = candidate.type === "message" ? asOptionalRecord(candidate.message) : void 0;
	if (message) {
		const metadata = asOptionalRecord(message["__openclaw"]);
		if ((message.role === "assistant" || message.role === "toolResult") && hasDreamingNarrativeIdentity(metadata?.runId)) return true;
	}
	if (!candidate.data || typeof candidate.data !== "object" || Array.isArray(candidate.data)) return false;
	const nested = candidate.data;
	return hasDreamingNarrativeIdentity(nested.runId) || hasDreamingNarrativeIdentity(nested.sessionKey);
}
function hasCronRunSessionKey(value) {
	return typeof value === "string" && isCronRunSessionKey(value);
}
function isCronRunGeneratedRecord(record) {
	if (!record || typeof record !== "object" || Array.isArray(record)) return false;
	const candidate = record;
	if (hasCronRunSessionKey(candidate.sessionKey)) return true;
	if (!candidate.data || typeof candidate.data !== "object" || Array.isArray(candidate.data)) return false;
	const nested = candidate.data;
	return hasCronRunSessionKey(nested.sessionKey);
}
function normalizeComparablePath(pathname) {
	const resolved = path.resolve(pathname);
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
function normalizeSessionTranscriptPathForComparison(pathname) {
	return normalizeComparablePath(pathname);
}
function resolveSessionStoreTranscriptPath(sessionsDir, entry) {
	const resolved = resolveSessionStoreTranscriptResolvedPath(sessionsDir, entry);
	return resolved ? normalizeComparablePath(resolved) : null;
}
function resolveSessionStoreTranscriptResolvedPath(sessionsDir, entry) {
	if (typeof entry?.sessionFile === "string" && entry.sessionFile.trim().length > 0) {
		const sessionFile = entry.sessionFile.trim();
		return path.isAbsolute(sessionFile) ? sessionFile : path.resolve(sessionsDir, sessionFile);
	}
	if (typeof entry?.sessionId === "string" && entry.sessionId.trim().length > 0) return path.join(sessionsDir, `${entry.sessionId.trim()}.jsonl`);
	return null;
}
function isCanonicalSessionsDirForAgent(sessionsDir, agentId) {
	return normalizeComparablePath(sessionsDir) === normalizeComparablePath(resolveSessionTranscriptsDirForAgent(agentId));
}
function loadSessionTranscriptClassificationForSessionsDir(sessionsDir) {
	const agentId = extractAgentIdFromSessionsDir(sessionsDir);
	if (agentId && isCanonicalSessionsDirForAgent(sessionsDir, agentId)) return classifySessionTranscriptCorpusEntries(listSessionTranscriptCorpusEntriesForAgentSync(agentId));
	const store = readSessionTranscriptClassificationStore(path.join(sessionsDir, "sessions.json"));
	const dreamingTranscriptPaths = /* @__PURE__ */ new Set();
	const cronRunTranscriptPaths = /* @__PURE__ */ new Set();
	for (const [sessionKey, entry] of Object.entries(store)) {
		const transcriptPath = resolveSessionStoreTranscriptPath(sessionsDir, entry);
		if (!transcriptPath) continue;
		if (isDreamingNarrativeSessionStoreKey(sessionKey)) dreamingTranscriptPaths.add(transcriptPath);
		if (isCronRunSessionKey(sessionKey)) cronRunTranscriptPaths.add(transcriptPath);
	}
	return {
		dreamingNarrativeTranscriptPaths: dreamingTranscriptPaths,
		cronRunTranscriptPaths
	};
}
function readSessionTranscriptClassificationStore(storePath) {
	try {
		const parsed = JSON.parse(fs.readFileSync(storePath, "utf-8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		return parsed;
	} catch {
		return {};
	}
}
function classifySessionTranscriptCorpusEntries(corpusEntries) {
	const dreamingTranscriptPaths = /* @__PURE__ */ new Set();
	const cronRunTranscriptPaths = /* @__PURE__ */ new Set();
	for (const entry of corpusEntries) {
		if (entry.transcriptSource === "sqlite") continue;
		const normalizedPath = normalizeComparablePath(entry.sessionFile);
		if (entry.generatedByDreamingNarrative) dreamingTranscriptPaths.add(normalizedPath);
		if (entry.generatedByCronRun) cronRunTranscriptPaths.add(normalizedPath);
	}
	return {
		dreamingNarrativeTranscriptPaths: dreamingTranscriptPaths,
		cronRunTranscriptPaths
	};
}
function loadDreamingNarrativeTranscriptPathSetForAgent(agentId) {
	return loadSessionTranscriptClassificationForAgent(agentId).dreamingNarrativeTranscriptPaths;
}
function loadSessionTranscriptClassificationForAgent(agentId) {
	return classifySessionTranscriptCorpusEntries(listSessionTranscriptCorpusEntriesForAgentSync(agentId));
}
function classifySessionTranscriptFromSessionStore(absPath) {
	const sessionsDir = path.dirname(absPath);
	const normalizedAbsPath = normalizeComparablePath(absPath);
	const primarySessionId = parseUsageCountedSessionIdFromFileName(path.basename(absPath));
	const normalizedPrimaryPath = primarySessionId && isSessionArchiveArtifactName(path.basename(absPath)) ? normalizeComparablePath(path.join(sessionsDir, `${primarySessionId}.jsonl`)) : null;
	const classification = loadSessionTranscriptClassificationForSessionsDir(sessionsDir);
	const hasClassifiedPath = (paths) => paths.has(normalizedAbsPath) || normalizedPrimaryPath !== null && paths.has(normalizedPrimaryPath);
	return {
		generatedByDreamingNarrative: hasClassifiedPath(classification.dreamingNarrativeTranscriptPaths),
		generatedByCronRun: hasClassifiedPath(classification.cronRunTranscriptPaths)
	};
}
async function listSessionFilesForAgent(agentId) {
	return (await listSessionTranscriptCorpusEntriesForAgent(agentId)).filter((entry) => entry.transcriptSource !== "sqlite").map((entry) => entry.sessionFile);
}
function sessionPathForFile(absPath) {
	const agentId = extractAgentIdFromSessionPath(absPath);
	return path.join("sessions", ...agentId ? [agentId] : [], path.basename(absPath)).replace(/\\/g, "/");
}
/** Returns the logical memory path for a live SQLite-backed session transcript. */
function sessionPathForSessionIdentity(agentId, sessionId) {
	return path.join("sessions", normalizeAgentId(agentId), `${sessionId}.jsonl`).replace(/\\/g, "/");
}
/**
* Parses a deprecated path-shaped memory sync hint only when it points at an
* OpenClaw-owned usage-counted transcript in the canonical agent sessions dir.
*/
function parseCanonicalSessionSyncTargetFromPath(sessionFile) {
	const trimmed = sessionFile.trim();
	if (!trimmed) return null;
	const resolved = path.resolve(trimmed);
	const fileName = path.basename(resolved);
	const sessionId = parseUsageCountedSessionIdFromFileName(fileName);
	if (!sessionId || !isUsageCountedSessionTranscriptFileName(fileName)) return null;
	const agentId = extractAgentIdFromSessionPath(resolved);
	if (!agentId) return null;
	const canonicalSessionsDir = normalizeComparablePath(resolveSessionTranscriptsDirForAgent(agentId));
	if (normalizeComparablePath(path.dirname(resolved)) !== canonicalSessionsDir) return null;
	return {
		agentId,
		sessionId
	};
}
/**
* Resolves a current transcript path back to the canonical session-store
* identity when available, falling back to the usage-counted file identity.
*/
function resolveSessionIdentityForTranscriptFile(sessionFile) {
	const parsed = parseCanonicalSessionSyncTargetFromPath(sessionFile);
	if (!parsed?.agentId) return null;
	const sessionsDir = resolveSessionTranscriptsDirForAgent(parsed.agentId);
	const normalizedSessionFile = normalizeComparablePath(sessionFile);
	const store = readSessionTranscriptClassificationStore(path.join(sessionsDir, "sessions.json"));
	for (const [sessionKey, entry] of Object.entries(store)) {
		if (resolveSessionStoreTranscriptPath(sessionsDir, entry) !== normalizedSessionFile) continue;
		const sessionId = typeof entry.sessionId === "string" ? entry.sessionId.trim() : "";
		if (!sessionId) continue;
		return {
			agentId: parsed.agentId,
			sessionId,
			...sessionKey.trim() ? { sessionKey } : {}
		};
	}
	return {
		agentId: parsed.agentId,
		sessionId: parsed.sessionId
	};
}
/** Resolves only deprecated path-shaped sync targets; live identity uses corpus entries. */
function resolveSessionFileForSyncTarget(target, defaultAgentId) {
	const sessionId = target.sessionId.trim();
	if (!(target.agentId ?? defaultAgentId ?? "").trim() || !sessionId) return null;
	return null;
}
async function logSessionFileReadFailure(absPath, err) {
	createSubsystemLogger("memory").debug(`Failed reading session file ${absPath}: ${String(err)}`);
}
function normalizeSessionText(value) {
	return value.replace(/\s*\n+\s*/g, " ").replace(/\s+/g, " ").trim();
}
function collectRawSessionText(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return null;
	const parts = [];
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		const record = block;
		if (record.type === "text" && typeof record.text === "string") parts.push(record.text);
	}
	return parts.length > 0 ? parts.join("\n") : null;
}
function isHighSurrogate(code) {
	return code >= 55296 && code <= 56319;
}
function isLowSurrogate(code) {
	return code >= 56320 && code <= 57343;
}
function splitLongSessionLine(text, maxChars = SESSION_EXPORT_CONTENT_WRAP_CHARS) {
	const normalized = text.trim();
	if (!normalized) return [];
	if (normalized.length <= maxChars) return [normalized];
	const segments = [];
	let cursor = 0;
	while (cursor < normalized.length) {
		if (normalized.length - cursor <= maxChars) {
			segments.push(normalized.slice(cursor).trim());
			break;
		}
		const limit = cursor + maxChars;
		let splitAt = limit;
		for (let index = limit; index > cursor; index -= 1) if (normalized[index] === " ") {
			splitAt = index;
			break;
		}
		if (splitAt < normalized.length && splitAt > cursor && isHighSurrogate(normalized.charCodeAt(splitAt - 1)) && isLowSurrogate(normalized.charCodeAt(splitAt))) splitAt -= 1;
		segments.push(normalized.slice(cursor, splitAt).trim());
		cursor = splitAt;
		while (cursor < normalized.length && normalized[cursor] === " ") cursor += 1;
	}
	return segments.filter(Boolean);
}
function renderSessionExportLines(label, text) {
	return splitLongSessionLine(text).map((segment) => `${label}: ${segment}`);
}
/**
* Strip OpenClaw-injected inbound metadata envelopes from a raw text block.
*
* User-role messages arriving from external channels (Telegram, Discord,
* Slack, …) are stored with a multi-line prefix containing Conversation info,
* Sender info, and other AI-facing metadata blocks. These envelopes must be
* removed BEFORE normalization, because `stripInboundMetadata` relies on
* newline structure and fenced `json` code fences to locate sentinels; once
* `normalizeSessionText` collapses newlines into spaces, stripping is
* impossible.
*
* See: https://github.com/openclaw/openclaw/issues/63921
*/
function stripInboundMetadataForUserRole(text, role) {
	if (role !== "user") return text;
	return stripInboundMetadata(text);
}
const GENERATED_SYSTEM_MESSAGE_RE = /^System(?: \(untrusted\))?: \[[^\]]+\]\s*/;
function isGeneratedSystemWrapperMessage(text, role) {
	if (role !== "user") return false;
	return GENERATED_SYSTEM_MESSAGE_RE.test(text);
}
function isGeneratedCronPromptMessage(text, role) {
	if (role !== "user") return false;
	return DIRECT_CRON_PROMPT_RE.test(text);
}
function isGeneratedHeartbeatPromptMessage(text, role) {
	return role === "user" && isHeartbeatUserMessage({
		role,
		content: text
	}, HEARTBEAT_PROMPT);
}
function sanitizeSessionText(text, role) {
	const strippedInbound = stripInboundMetadataForUserRole(text, role);
	const normalized = normalizeSessionText(stripInternalRuntimeContext(strippedInbound));
	if (!normalized) return null;
	if (isGeneratedSystemWrapperMessage(normalized, role)) return null;
	if (isGeneratedCronPromptMessage(normalized, role)) return null;
	if (isGeneratedHeartbeatPromptMessage(normalized, role)) return null;
	if (isSilentReplyPayloadText(normalized)) return null;
	if (role === "assistant" && normalized === "HEARTBEAT_OK") return null;
	const withoutSystemEnvelope = normalized.replace(GENERATED_SYSTEM_MESSAGE_RE, "").trim();
	if (isExecCompletionEvent(withoutSystemEnvelope)) return null;
	return normalized;
}
function isRecalledMemoryMessage(message) {
	const provenance = message.provenance;
	return provenance?.kind === "internal_system" && (provenance.sourceTool === "memory_search" || provenance.sourceTool === "memory_get");
}
function parseSessionTimestampMs(record, message) {
	const candidates = [message.timestamp, record.timestamp];
	for (const value of candidates) {
		if (typeof value === "number" && Number.isFinite(value)) {
			const ms = value > 0 && value < 1e11 ? value * 1e3 : value;
			if (Number.isFinite(ms) && ms > 0 && ms <= MAX_DATE_TIMESTAMP_MS) return Math.floor(ms);
		}
		if (typeof value === "string") {
			const parsed = Date.parse(value);
			if (Number.isFinite(parsed) && parsed > 0) return parsed;
		}
	}
	return 0;
}
function resolveSessionEntryParseYieldLines(opts) {
	const configured = opts.parseYieldEveryLines;
	if (typeof configured === "number" && Number.isFinite(configured)) return Math.max(1, Math.floor(configured));
	return SESSION_ENTRY_PARSE_YIELD_LINES;
}
function resolveBuildSessionSqliteIdentity(absPath, opts) {
	if (opts.agentId && opts.sessionId && opts.storePath) return {
		agentId: opts.agentId,
		sessionId: opts.sessionId,
		...opts.sessionKey ? { sessionKey: opts.sessionKey } : {},
		storePath: opts.storePath
	};
	const marker = parseSqliteSessionFileMarker(absPath);
	return marker && opts.sessionKey ? {
		...marker,
		sessionKey: opts.sessionKey
	} : marker;
}
function statSessionEntrySync(absPath, opts = {}) {
	const sqliteIdentity = resolveBuildSessionSqliteIdentity(absPath, opts);
	if (sqliteIdentity) {
		const stats = readTranscriptStatsSync({ ...sqliteIdentity });
		return {
			absPath,
			path: sessionPathForSessionIdentity(sqliteIdentity.agentId, sqliteIdentity.sessionId),
			mtimeMs: opts.updatedAtMs ?? stats.maxSeq,
			size: stats.sizeBytes
		};
	}
	try {
		const stat = fs.statSync(absPath);
		return stat.isFile() ? {
			absPath,
			path: sessionPathForFile(absPath),
			mtimeMs: stat.mtimeMs,
			size: stat.size
		} : null;
	} catch {
		return null;
	}
}
async function yieldSessionEntryParseIfNeeded(lineIndex, everyLines) {
	if (lineIndex > 0 && lineIndex % everyLines === 0) await new Promise((resolve) => {
		setImmediate(resolve);
	});
}
async function buildSessionEntry(absPath, opts = {}) {
	try {
		const sqliteIdentity = resolveBuildSessionSqliteIdentity(absPath, opts);
		const sqliteSource = sqliteIdentity ? (() => {
			const stats = readTranscriptStatsSync(sqliteIdentity);
			const records = loadTranscriptEventsSync(sqliteIdentity);
			const resetRecallCutoff = resolveSessionResetRecallCutoff(records);
			return {
				mtimeMs: opts.updatedAtMs ?? stats.maxSeq,
				path: sessionPathForSessionIdentity(sqliteIdentity.agentId, sqliteIdentity.sessionId),
				records,
				resetRecallCutoff,
				size: stats.sizeBytes
			};
		})() : null;
		let raw = "";
		let mtimeMs;
		let size;
		let memoryPath;
		if (sqliteSource) {
			mtimeMs = sqliteSource.mtimeMs;
			size = sqliteSource.size;
			memoryPath = sqliteSource.path;
		} else {
			const regularFile = await statRegularFile(absPath);
			if (regularFile.missing) return null;
			const stat = regularFile.stat;
			if (shouldSkipTranscriptFileForDreaming(absPath)) return {
				path: sessionPathForFile(absPath),
				absPath,
				mtimeMs: stat.mtimeMs,
				size: stat.size,
				hash: hashText("\n\n"),
				content: "",
				lineMap: [],
				messageTimestampsMs: [],
				lineProvenance: [],
				sessionKind: opts.sessionKind ?? "unknown"
			};
			raw = (await retryTransientMemoryRead(() => readRegularFile({ filePath: isUsageCountedSessionArchiveTranscriptPath(absPath) ? materializeSessionArchiveForRead(absPath) : absPath }), `read session transcript ${absPath}`)).buffer.toString("utf-8");
			mtimeMs = stat.mtimeMs;
			size = stat.size;
			memoryPath = sessionPathForFile(absPath);
		}
		const collected = [];
		const lineMap = [];
		const messageTimestampsMs = [];
		const lineProvenance = [];
		const parseYieldEveryLines = resolveSessionEntryParseYieldLines(opts);
		const sqliteSessionKey = sqliteIdentity && !opts.sessionKey ? resolveTranscriptSessionKeyBySessionId({
			agentId: sqliteIdentity.agentId,
			sessionId: sqliteIdentity.sessionId,
			storePath: sqliteIdentity.storePath
		}) : void 0;
		const sessionStoreClassification = !sqliteIdentity && (opts.generatedByDreamingNarrative === void 0 || opts.generatedByCronRun === void 0) ? classifySessionTranscriptFromSessionStore(absPath) : null;
		let generatedByDreamingNarrative = opts.generatedByDreamingNarrative ?? (sqliteSessionKey ? isDreamingNarrativeSessionStoreKey(sqliteSessionKey) : void 0) ?? sessionStoreClassification?.generatedByDreamingNarrative ?? false;
		let generatedByCronRun = opts.generatedByCronRun ?? (sqliteSessionKey ? isCronRunSessionKey(sqliteSessionKey) : void 0) ?? sessionStoreClassification?.generatedByCronRun ?? false;
		const sessionKind = opts.sessionKind ?? "unknown";
		const allowArchiveRecordCronClassification = isUsageCountedSessionArchiveTranscriptPath(absPath);
		let insideHeartbeatTurn = false;
		let insideRecalledMemoryTurn = false;
		let turnOrigin = "untrusted";
		for (let jsonlIdx = 0, lineStart = 0; sqliteSource ? jsonlIdx < sqliteSource.records.length : lineStart <= raw.length; jsonlIdx++) {
			await yieldSessionEntryParseIfNeeded(jsonlIdx, parseYieldEveryLines);
			let record;
			if (sqliteSource) record = sqliteSource.records[jsonlIdx];
			else {
				const newlineIndex = raw.indexOf("\n", lineStart);
				const lineEnd = newlineIndex === -1 ? raw.length : newlineIndex;
				const line = raw.slice(lineStart, lineEnd);
				lineStart = newlineIndex === -1 ? raw.length + 1 : newlineIndex + 1;
				if (!line.trim()) continue;
				try {
					record = JSON.parse(line);
				} catch {
					continue;
				}
			}
			const identifiesDreamingNarrative = !generatedByDreamingNarrative && isDreamingNarrativeGeneratedRecord(record);
			const identifiesCronRun = !generatedByCronRun && allowArchiveRecordCronClassification && isCronRunGeneratedRecord(record);
			if (identifiesDreamingNarrative || identifiesCronRun) {
				generatedByDreamingNarrative ||= identifiesDreamingNarrative;
				generatedByCronRun ||= identifiesCronRun;
				collected.length = 0;
				lineMap.length = 0;
				messageTimestampsMs.length = 0;
				lineProvenance.length = 0;
			}
			if (!record || typeof record !== "object" || record.type !== "message") continue;
			const message = record.message;
			if (!message || typeof message.role !== "string") continue;
			if (message.role !== "user" && message.role !== "assistant") continue;
			const timestampMs = parseSessionTimestampMs(record, message);
			opts.onTranscriptMessage?.(message, Math.max(0, Math.floor(timestampMs || mtimeMs)));
			const inputProvenance = message.provenance;
			const isHeartbeatUser = message.role === "user" && inputProvenance?.kind === "internal_system" && inputProvenance.sourceTool === "heartbeat";
			if (message.role === "user") {
				insideHeartbeatTurn = isHeartbeatUser;
				insideRecalledMemoryTurn = isRecalledMemoryMessage(message);
				turnOrigin = classifySessionMessageOrigin(message, turnOrigin);
			}
			if (message.role === "user" && hasInterSessionUserProvenance(message)) continue;
			if (insideHeartbeatTurn || insideRecalledMemoryTurn || generatedByDreamingNarrative || generatedByCronRun) continue;
			const rawText = collectRawSessionText(message.content);
			if (rawText === null) continue;
			const text = sanitizeSessionText(rawText, message.role);
			if (!text) continue;
			const safe = redactSensitiveText(text, { mode: "tools" });
			const renderedLines = renderSessionExportLines(message.role === "user" ? "User" : "Assistant", safe);
			const memoryProvenance = {
				originClass: classifySessionMessageOrigin(message, turnOrigin),
				sessionKind,
				observedAt: Math.max(0, Math.floor(timestampMs || mtimeMs))
			};
			collected.push(...renderedLines);
			lineMap.push(...renderedLines.map(() => jsonlIdx + 1));
			messageTimestampsMs.push(...renderedLines.map(() => timestampMs));
			lineProvenance.push(...renderedLines.map(() => memoryProvenance));
		}
		const content = collected.join("\n");
		const entry = {
			path: memoryPath,
			absPath,
			mtimeMs,
			size,
			hash: hashText(content + "\n" + lineMap.join(",") + "\n" + messageTimestampsMs.join(",") + "\n" + JSON.stringify(lineProvenance) + "\n" + JSON.stringify(sqliteSource?.resetRecallCutoff ?? { state: "absent" })),
			content,
			lineMap,
			messageTimestampsMs,
			lineProvenance,
			sessionKind,
			...generatedByDreamingNarrative ? { generatedByDreamingNarrative: true } : {},
			...generatedByCronRun ? { generatedByCronRun: true } : {}
		};
		Object.defineProperty(entry, Symbol.for("openclaw.memory.sessionResetRecallCutoff"), {
			configurable: false,
			enumerable: false,
			value: sqliteSource?.resetRecallCutoff ?? { state: "absent" },
			writable: false
		});
		return entry;
	} catch (err) {
		logSessionFileReadFailure(absPath, err);
		return null;
	}
}
//#endregion
//#region src/plugin-sdk/memory-core-host-engine-sessions.ts
/** Private-local SDK subpath for memory session transcript helpers. */
function projectSessionMetadata(instance, participants = []) {
	return {
		agentId: instance.agentId,
		sessionId: instance.sessionId,
		sessionKey: instance.sessionKey,
		resolution: "live",
		...instance.sourceMetadata,
		participants
	};
}
/** Read authoritative admission facts without creating a missing agent database. */
function loadMemorySessionMetadata(params) {
	const instance = listSessionTranscriptInstances(params, {
		includeAllWindows: true,
		sessionId: params.sessionId
	}).find((candidate) => candidate.agentId === normalizeAgentId(params.agentId) && (!params.sessionKey || candidate.sessionKey === params.sessionKey));
	return instance ? projectSessionMetadata(instance) : void 0;
}
/** Resolve explicit memory-forget selectors against authoritative session owners. */
function resolveMemorySessionTargets(params) {
	const sessionIds = [...new Set(params.sessionIds ?? [])];
	const hookSources = [...new Set(params.hookSources ?? [])];
	const participants = [...new Set(params.participants ?? [])];
	if (sessionIds.length === 0 && hookSources.length === 0 && participants.length === 0) return [];
	const since = typeof params.since === "string" ? Date.parse(params.since) : params.since;
	if (since !== void 0 && !Number.isFinite(since)) throw new Error(`Invalid memory session date: ${params.since}`);
	const resolvedSelectors = /* @__PURE__ */ new Set();
	const participantRecords = listSessionParticipantsReadOnly(params);
	const targets = /* @__PURE__ */ new Map();
	const instances = listSessionTranscriptInstances(params, { includeAllWindows: true }).filter((instance) => instance.agentId === normalizeAgentId(params.agentId)).toSorted((left, right) => left.sourceMetadata.createdAt - right.sourceMetadata.createdAt || left.sessionId.localeCompare(right.sessionId));
	for (const instance of instances) {
		const identities = (participantRecords.get(instance.sessionKey) ?? []).map(({ identity }) => identity);
		const source = instance.sourceMetadata.hookExternalContentSource;
		if (!sessionIds.includes(instance.sessionId) && !sessionIds.includes(instance.sessionKey) && !(source && hookSources.includes(source)) && !identities.some((identity) => participants.includes(identity.id))) continue;
		resolvedSelectors.add(instance.sessionId);
		resolvedSelectors.add(instance.sessionKey);
		if (since === void 0 || instance.sourceMetadata.createdAt >= since) targets.set(instance.sessionId, projectSessionMetadata(instance, identities));
	}
	for (const archive of listSessionTranscriptArchivesReadOnly({
		...params,
		sessionIds
	})) {
		resolvedSelectors.add(archive.sessionId);
		resolvedSelectors.add(archive.sessionKey);
		if (targets.has(archive.sessionId) || since !== void 0 && archive.createdAt < since) continue;
		targets.set(archive.sessionId, {
			agentId: params.agentId,
			sessionId: archive.sessionId,
			sessionKey: archive.sessionKey,
			resolution: "archived",
			hookExternalContentSource: null,
			channel: null,
			accountId: null,
			chatType: null,
			createdAt: archive.createdAt,
			participants: []
		});
	}
	for (const sessionId of sessionIds) if (!resolvedSelectors.has(sessionId)) targets.set(sessionId, {
		agentId: params.agentId,
		sessionId,
		resolution: "unresolved",
		hookExternalContentSource: null,
		channel: null,
		accountId: null,
		chatType: null,
		participants: []
	});
	return [...targets.values()];
}
//#endregion
export { loadDreamingNarrativeTranscriptPathSetForAgent as a, parseCanonicalSessionSyncTargetFromPath as c, sessionPathForFile as d, sessionPathForSessionIdentity as f, listSessionFilesForAgent as i, resolveSessionFileForSyncTarget as l, listSessionTranscriptCorpusEntriesForAgent as m, resolveMemorySessionTargets as n, loadSessionTranscriptClassificationForAgent as o, statSessionEntrySync as p, buildSessionEntry as r, normalizeSessionTranscriptPathForComparison as s, loadMemorySessionMetadata as t, resolveSessionIdentityForTranscriptFile as u };
