import { c as normalizeOptionalLowercaseString, o as normalizeLowercaseStringOrEmpty, p as normalizeStringifiedOptionalString } from "./string-coerce-CIXf7egm.js";
import { n as getRuntimeConfig } from "./io.runtime-CKu7Rw0j.js";
import { r as resolveRealpathOrAbsolute } from "./boundary-path-DMNeww4q.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { t as parseDurationMs } from "./parse-duration-CuuCHKpt.js";
import { n as ok, t as err } from "./result-BQGgYouL.js";
import { M as parseThreadSessionSuffix, O as parseAgentSessionKey, S as isAcpSessionKey, T as isSubagentSessionKey, w as isCronSessionKey } from "./session-key-CRjxKW0X.js";
import { a as isPrimarySessionTranscriptFileName, c as isSessionStoreTempArtifactName, i as isMigrationArchiveArtifactName, l as isTrajectorySessionArtifactName, o as isRetainedSessionTranscriptArchiveName, r as isCompactionCheckpointTranscriptFileName, s as isSessionArchiveArtifactName, t as SESSION_STORE_TEMP_STALE_MS } from "./artifacts-DMDO9PHy.js";
import { i as resolveSessionFilePathCore } from "./paths-DDTeIhCT.js";
import { m as parseByteSize } from "./zod-schema-B8Isge8w.js";
import "./config-Cv60gBux.js";
import { t as runTasksWithConcurrency } from "./run-with-concurrency-B6LtW2cN.js";
import { f as sessionDeliveryOrigin } from "./delivery-context.shared-DlcU69m_.js";
import { o as projectSessionStoreForPersistence } from "./store-writer-state-_Y6b9Vjm.js";
import { a as normalizeStoreSessionKey, l as listDurableSqliteTargetPathsForSessionStorePath } from "./store-entry-CMuTqREZ.js";
import { i as collectActiveSessionWorkAdmissions } from "./session-lifecycle-admission-siUq03Jk.js";
import { a as resolveTrajectoryFilePath, o as resolveTrajectoryPointerFilePath } from "./paths-DBZSw_GC.js";
import fs from "node:fs";
import path from "node:path";
//#region src/config/sessions/store-maintenance.ts
const log = createSubsystemLogger("sessions/store");
const DEFAULT_SESSION_PRUNE_AFTER_MS = 2592e6;
const DEFAULT_DASHBOARD_ARCHIVE_AFTER_MS = 6048e5;
const DEFAULT_MODEL_RUN_PRUNE_AFTER_MS = 864e5;
const DEFAULT_SESSION_MAX_ENTRIES = 500;
const DEFAULT_SESSION_MAINTENANCE_MODE = "enforce";
const DEFAULT_SESSION_DISK_BUDGET_HIGH_WATER_RATIO = .8;
const DEFAULT_SESSION_MAX_DISK_BYTES = 10737418240;
const STRICT_ENTRY_MAINTENANCE_MAX_ENTRIES = 49;
const MIN_BATCHED_ENTRY_MAINTENANCE_SLACK = 25;
const BATCHED_ENTRY_MAINTENANCE_SLACK_RATIO = .1;
function resolvePruneAfterMs(maintenance) {
	const raw = maintenance?.pruneAfter;
	const normalized = normalizeStringifiedOptionalString(raw);
	if (!normalized) return DEFAULT_SESSION_PRUNE_AFTER_MS;
	try {
		return parseDurationMs(normalized, { defaultUnit: "d" });
	} catch {
		return DEFAULT_SESSION_PRUNE_AFTER_MS;
	}
}
function resolveArchiveDashboardAfterMs(maintenance) {
	const raw = maintenance?.archiveDashboardAfter;
	if (raw === false || raw === 0) return null;
	const normalized = normalizeStringifiedOptionalString(raw);
	if (!normalized) return DEFAULT_DASHBOARD_ARCHIVE_AFTER_MS;
	try {
		const parsed = parseDurationMs(normalized, { defaultUnit: "d" });
		return parsed > 0 ? parsed : null;
	} catch {
		return DEFAULT_DASHBOARD_ARCHIVE_AFTER_MS;
	}
}
function resolveResetArchiveRetentionMs(maintenance) {
	const raw = maintenance?.resetArchiveRetention;
	if (raw === false) return null;
	const normalized = normalizeStringifiedOptionalString(raw);
	if (!normalized) return null;
	try {
		return parseDurationMs(normalized, { defaultUnit: "d" });
	} catch {
		return null;
	}
}
function resolvePreserveRecentMs(maintenance) {
	const raw = maintenance?.preserveRecent;
	if (raw === false || raw === void 0) return null;
	try {
		return parseDurationMs(normalizeStringifiedOptionalString(raw) ?? "", { defaultUnit: "d" });
	} catch {
		return null;
	}
}
function resolveMaxDiskBytes(maintenance) {
	const raw = maintenance?.maxDiskBytes;
	if (raw === false) return null;
	const normalized = normalizeStringifiedOptionalString(raw);
	if (!normalized) return DEFAULT_SESSION_MAX_DISK_BYTES;
	try {
		const bytes = parseByteSize(normalized, { defaultUnit: "b" });
		if (bytes <= 0) return null;
		return bytes;
	} catch {
		return null;
	}
}
function resolveHighWaterBytes(maintenance, maxDiskBytes) {
	if (maxDiskBytes == null) return null;
	const defaultHighWaterBytes = Math.max(1, Math.min(maxDiskBytes, Math.floor(maxDiskBytes * DEFAULT_SESSION_DISK_BUDGET_HIGH_WATER_RATIO)));
	const raw = maintenance?.highWaterBytes;
	const normalized = normalizeStringifiedOptionalString(raw);
	if (!normalized) return defaultHighWaterBytes;
	try {
		const parsed = parseByteSize(normalized, { defaultUnit: "b" });
		return parsed > 0 ? Math.min(parsed, maxDiskBytes) : defaultHighWaterBytes;
	} catch {
		return defaultHighWaterBytes;
	}
}
/**
* Resolve maintenance settings from openclaw.json (`session.maintenance`).
* Falls back to built-in defaults when config is missing or unset.
*/
function resolveMaintenanceConfigFromInput(maintenance) {
	const pruneAfterMs = resolvePruneAfterMs(maintenance);
	const maxDiskBytes = resolveMaxDiskBytes(maintenance);
	return {
		mode: maintenance?.mode ?? DEFAULT_SESSION_MAINTENANCE_MODE,
		pruneAfterMs,
		archiveDashboardAfterMs: resolveArchiveDashboardAfterMs(maintenance),
		maxEntries: maintenance?.maxEntries ?? DEFAULT_SESSION_MAX_ENTRIES,
		modelRunPruneAfterMs: DEFAULT_MODEL_RUN_PRUNE_AFTER_MS,
		preserveRecentMs: resolvePreserveRecentMs(maintenance),
		resetArchiveRetentionMs: resolveResetArchiveRetentionMs(maintenance),
		maxDiskBytes,
		highWaterBytes: resolveHighWaterBytes(maintenance, maxDiskBytes)
	};
}
function normalizeResolvedMaintenanceConfigInput(maintenance) {
	return {
		...maintenance,
		archiveDashboardAfterMs: maintenance.archiveDashboardAfterMs === void 0 ? DEFAULT_DASHBOARD_ARCHIVE_AFTER_MS : maintenance.archiveDashboardAfterMs,
		modelRunPruneAfterMs: maintenance.modelRunPruneAfterMs ?? DEFAULT_MODEL_RUN_PRUNE_AFTER_MS,
		preserveRecentMs: maintenance.preserveRecentMs ?? null
	};
}
function resolveSessionEntryMaintenanceHighWater(maxEntries) {
	if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) return 1;
	if (maxEntries <= STRICT_ENTRY_MAINTENANCE_MAX_ENTRIES) return maxEntries + 1;
	return maxEntries + Math.max(MIN_BATCHED_ENTRY_MAINTENANCE_SLACK, Math.ceil(maxEntries * BATCHED_ENTRY_MAINTENANCE_SLACK_RATIO));
}
function shouldRunSessionEntryMaintenance(params) {
	if (params.force) return true;
	return params.entryCount >= resolveSessionEntryMaintenanceHighWater(params.maxEntries);
}
function shouldRunModelRunPrune(params) {
	if (params.force) return params.entryCount > params.maintenance.maxEntries;
	return shouldRunSessionEntryMaintenance({
		entryCount: params.entryCount,
		maxEntries: params.maintenance.maxEntries
	});
}
function isGatewayModelRunSessionKey(sessionKey) {
	const match = /^agent:([^:\s]+):explicit:model-run-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.exec(sessionKey);
	if (!match) return false;
	const agentId = match[1];
	if (!agentId || /\s/.test(agentId)) return false;
	const parsed = parseAgentSessionKey(sessionKey);
	if (!parsed || parsed.agentId !== agentId.toLowerCase()) return false;
	const rest = normalizeLowercaseStringOrEmpty(parsed.rest);
	return /^explicit:model-run-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(rest);
}
/**
* Remove entries whose `updatedAt` is older than the configured threshold.
* Entries without `updatedAt` are kept (cannot determine staleness).
* Mutates `store` in-place.
*/
function pruneStaleEntries(store, overrideMaxAgeMs, opts = {}) {
	const maxAgeMs = overrideMaxAgeMs ?? resolveMaintenanceConfigFromInput().pruneAfterMs;
	if (maxAgeMs <= 0) return 0;
	const cutoffMs = Date.now() - maxAgeMs;
	let pruned = 0;
	for (const [key, entry] of Object.entries(store)) {
		if (shouldPreserveMaintenanceEntry({
			key,
			entry,
			preserveKeys: opts.preserveKeys,
			preserveRecentMs: opts.preserveRecentMs
		})) continue;
		if (entry?.updatedAt != null && entry.updatedAt < cutoffMs) {
			opts.onPruned?.({
				key,
				entry
			});
			delete store[key];
			pruned++;
		}
	}
	if (pruned > 0 && opts.log !== false) log.info("pruned stale session entries", {
		pruned,
		maxAgeMs
	});
	return pruned;
}
/**
* Remove stale one-shot gateway model-run probe sessions before normal retention/capping.
* Existing polluted stores may not carry modelRun metadata, so this intentionally keys off the
* strict explicit model-run UUID session shape created by the gateway probe CLI path.
*/
function pruneStaleModelRunEntries(store, overrideMaxAgeMs, opts = {}) {
	if (overrideMaxAgeMs == null || overrideMaxAgeMs <= 0) return 0;
	const cutoffMs = Date.now() - overrideMaxAgeMs;
	let pruned = 0;
	for (const [key, entry] of Object.entries(store)) {
		if (shouldPreserveMaintenanceEntry({
			key,
			entry,
			preserveKeys: opts.preserveKeys,
			preserveRecentMs: opts.preserveRecentMs
		})) continue;
		if (!isGatewayModelRunSessionKey(key)) continue;
		if (entry?.updatedAt != null && entry.updatedAt < cutoffMs) {
			opts.onPruned?.({
				key,
				entry
			});
			delete store[key];
			pruned++;
		}
	}
	if (pruned > 0 && opts.log !== false) log.info("pruned stale gateway model-run session entries", {
		pruned,
		maxAgeMs: overrideMaxAgeMs
	});
	return pruned;
}
const DEFAULT_QUOTA_SUSPENSION_TTL_MS = 18e5;
/**
* Resolves the TTL maintenance patch for one session entry without reading or
* mutating the whole store. Attempt hot paths use this before entry-scoped
* accessor writes so unrelated sessions stay out of the request path.
*/
function resolveQuotaSuspensionEntryMaintenance(params) {
	const suspension = params.entry.quotaSuspension;
	if (!suspension) return {
		patch: null,
		cleared: false
	};
	const ttlMs = params.ttlMs ?? DEFAULT_QUOTA_SUSPENSION_TTL_MS;
	const cleanupAfterResumeMs = ttlMs * 1;
	const resumeAtMs = suspension.expectedResumeBy ?? suspension.suspendedAt + ttlMs;
	const cleanupAtMs = resumeAtMs + cleanupAfterResumeMs;
	if (params.now >= cleanupAtMs) return {
		patch: { quotaSuspension: void 0 },
		cleared: true
	};
	if (suspension.state === "suspended" && params.now >= resumeAtMs) return {
		patch: { quotaSuspension: {
			...suspension,
			state: "resuming"
		} },
		cleared: false
	};
	return {
		patch: null,
		cleared: false
	};
}
function getEntryUpdatedAt$1(entry) {
	return entry?.updatedAt ?? Number.NEGATIVE_INFINITY;
}
function getSessionMaintenanceActivityAt(entry) {
	return Math.max(entry?.lastInteractionAt ?? 0, entry?.lastActivityAt ?? 0, entry?.sessionStartedAt ?? 0, entry?.updatedAt ?? 0);
}
/** Archive inactive dashboard sessions while retaining runtime-owned or explicitly active keys. */
function archiveStaleDashboardEntries(store, archiveAfterMs, opts = {}) {
	if (archiveAfterMs == null || archiveAfterMs <= 0) return 0;
	const now = opts.nowMs ?? Date.now();
	const cutoffMs = now - archiveAfterMs;
	let archived = 0;
	for (const [key, entry] of Object.entries(store)) {
		if (!parseAgentSessionKey(key)?.rest.startsWith("dashboard:") || entry.pinnedAt !== void 0 || entry.archivedAt !== void 0 || opts.preserveKeys?.has(key) === true) continue;
		const activityAt = getSessionMaintenanceActivityAt(entry);
		if (activityAt <= 0 || activityAt >= cutoffMs) continue;
		entry.archivedAt = now;
		opts.onArchived?.({
			key,
			entry
		});
		archived += 1;
	}
	if (archived > 0 && opts.log !== false) log.info("archived stale dashboard session entries", {
		archived,
		archiveAfterMs
	});
	return archived;
}
function isSyntheticSessionMaintenanceKey(sessionKey) {
	const parsed = parseAgentSessionKey(sessionKey);
	const rest = normalizeLowercaseStringOrEmpty(parsed?.rest ?? sessionKey);
	return isGatewayModelRunSessionKey(sessionKey) || isSubagentSessionKey(sessionKey) || isAcpSessionKey(sessionKey) || isCronSessionKey(sessionKey) || rest.startsWith("acp-bridge:") || rest.startsWith("hook:") || rest.startsWith("node:") || rest === "heartbeat" || rest.endsWith(":heartbeat") || rest.includes(":heartbeat:");
}
function isRecentSessionMaintenanceEntry(params) {
	if (params.preserveRecentMs == null || isSyntheticSessionMaintenanceKey(params.key)) return false;
	const activityAt = getSessionMaintenanceActivityAt(params.entry);
	const now = params.nowMs ?? Date.now();
	return activityAt > 0 && now - activityAt <= params.preserveRecentMs;
}
function isProtectedExternalConversationSessionKey(sessionKey) {
	const parsed = parseAgentSessionKey(sessionKey);
	const rest = normalizeLowercaseStringOrEmpty(parsed?.rest ?? sessionKey);
	return /^[^:]+:(?:group|channel):.+$/.test(rest) || /^telegram:(?:direct|dm):.+:topic:[^:]+$/.test(rest);
}
function isPrimarySessionMaintenanceKey(sessionKey) {
	if (normalizeLowercaseStringOrEmpty(sessionKey) === "global") return true;
	return parseAgentSessionKey(sessionKey)?.rest === "main";
}
function isProtectedSessionMaintenanceEntry(sessionKey, entry) {
	if (isSyntheticSessionMaintenanceKey(sessionKey)) return false;
	if (isPrimarySessionMaintenanceKey(sessionKey)) return true;
	if (parseThreadSessionSuffix(sessionKey).threadId) return true;
	if (isProtectedExternalConversationSessionKey(sessionKey)) return true;
	const chatType = normalizeLowercaseStringOrEmpty(entry?.chatType ?? sessionDeliveryOrigin(entry)?.chatType);
	return chatType === "group" || chatType === "channel" || chatType === "thread";
}
function shouldPreserveMaintenanceEntry(params) {
	if (params.entry?.archivedAt !== void 0 || params.entry?.pinnedAt !== void 0) return true;
	return params.entry?.modelSelectionLocked === true || params.preserveKeys?.has(params.key) === true || isRecentSessionMaintenanceEntry(params) || isProtectedSessionMaintenanceEntry(params.key, params.entry);
}
function selectSessionEntryCapVictims(store, maxEntries, preserveKeys, preserveRecentMs) {
	const keys = Object.keys(store);
	const overflow = keys.length - Math.max(0, maxEntries);
	if (overflow <= 0) return [];
	const eligibleKeys = keys.filter((key) => !shouldPreserveMaintenanceEntry({
		key,
		entry: store[key],
		preserveKeys,
		preserveRecentMs
	}));
	const victimCount = Math.min(overflow, eligibleKeys.length);
	if (victimCount === 0) return [];
	return eligibleKeys.toSorted((a, b) => getEntryUpdatedAt$1(store[b]) - getEntryUpdatedAt$1(store[a])).slice(-victimCount);
}
function getActiveSessionMaintenanceWarning(params) {
	const activeSessionKey = params.activeSessionKey.trim();
	if (!activeSessionKey) return null;
	const activeEntry = params.store[activeSessionKey];
	if (!activeEntry) return null;
	if (shouldPreserveMaintenanceEntry({
		key: activeSessionKey,
		entry: activeEntry,
		preserveKeys: params.preserveKeys,
		preserveRecentMs: params.preserveRecentMs
	})) return null;
	const cutoffMs = (params.nowMs ?? Date.now()) - params.pruneAfterMs;
	const wouldPrune = activeEntry.updatedAt != null ? activeEntry.updatedAt < cutoffMs : false;
	const keys = Object.keys(params.store);
	const wouldCap = selectSessionEntryCapVictims(params.store, params.maxEntries, params.preserveKeys, params.preserveRecentMs).includes(activeSessionKey);
	if (!wouldPrune && !wouldCap) return null;
	return {
		activeSessionKey,
		activeUpdatedAt: activeEntry.updatedAt,
		totalEntries: keys.length,
		pruneAfterMs: params.pruneAfterMs,
		maxEntries: params.maxEntries,
		wouldPrune,
		wouldCap
	};
}
/**
* Cap the total store to N entries by removing the oldest eviction-eligible rows.
* Protected rows count toward the cap but are never removed, so a store whose protected rows
* alone exceed the cap remains above it until protection is released or rows are deleted.
* Mutates `store` in-place.
*/
function capEntryCount(store, maxEntries, opts = {}) {
	const toRemove = selectSessionEntryCapVictims(store, maxEntries, opts.preserveKeys, opts.preserveRecentMs);
	if (toRemove.length === 0) return 0;
	for (const key of toRemove) {
		const entry = store[key];
		if (entry) opts.onCapped?.({
			key,
			entry
		});
		delete store[key];
	}
	if (opts.log !== false) log.info("capped session entry count", {
		removed: toRemove.length,
		maxEntries
	});
	return toRemove.length;
}
//#endregion
//#region src/config/sessions/store-maintenance-preserve.ts
const preserveKeysProviders = /* @__PURE__ */ new Set();
/** Registers a provider for session maintenance preserve keys. */
function registerSessionMaintenancePreserveKeysProvider(provider) {
	preserveKeysProviders.add(provider);
	return () => {
		preserveKeysProviders.delete(provider);
	};
}
function addSessionMaintenancePreserveKey(keys, value) {
	const normalized = normalizeStoreSessionKey(value ?? "");
	if (normalized) keys.add(normalized);
}
function addSessionMaintenancePreserveKeys(keys, values) {
	for (const value of values ?? []) addSessionMaintenancePreserveKey(keys, value);
}
/** Collects normalized session keys that maintenance/pruning must preserve. */
function collectSessionMaintenancePreserveKeys(baseKeys) {
	const keys = /* @__PURE__ */ new Set();
	addSessionMaintenancePreserveKeys(keys, baseKeys);
	for (const provider of preserveKeysProviders) try {
		addSessionMaintenancePreserveKeys(keys, provider());
	} catch {}
	return keys.size > 0 ? keys : void 0;
}
/** Resolves store keys owned by active work, including aliases sharing a backing session id. */
function collectActiveSessionWorkAdmissionKeys(params) {
	const activeIdentities = collectActiveSessionWorkAdmissions().get(params.storePath) ?? /* @__PURE__ */ new Set();
	if (activeIdentities.size === 0) return;
	const normalizedIdentities = new Set(Array.from(activeIdentities, (identity) => normalizeStoreSessionKey(identity)));
	const keys = /* @__PURE__ */ new Set();
	for (const [key, entry] of Object.entries(params.store)) if (normalizedIdentities.has(normalizeStoreSessionKey(key)) || activeIdentities.has(entry.sessionId)) {
		keys.add(key);
		keys.add(normalizeStoreSessionKey(key));
	}
	return keys.size > 0 ? keys : void 0;
}
/** Collects every runtime and active-work key protected from automatic maintenance. */
function collectSessionMaintenancePreserveKeysForStore(params) {
	const keys = collectSessionMaintenancePreserveKeys(params.baseKeys) ?? /* @__PURE__ */ new Set();
	for (const key of collectActiveSessionWorkAdmissionKeys({
		storePath: params.storePath,
		store: params.store
	}) ?? []) keys.add(key);
	return keys.size > 0 ? keys : void 0;
}
//#endregion
//#region src/config/sessions/store-maintenance-runtime.ts
function resolveMaintenanceConfig() {
	let maintenance;
	try {
		maintenance = getRuntimeConfig().session?.maintenance;
	} catch {}
	return resolveMaintenanceConfigFromInput(maintenance);
}
//#endregion
//#region src/config/sessions/disk-budget.ts
const NOOP_LOGGER = {
	warn: () => {},
	info: () => {}
};
function measureStoreBytes(store) {
	return Buffer.byteLength(JSON.stringify(store, null, 2), "utf-8");
}
function measureStoreEntryChunkBytes(key, entry) {
	const singleEntryStore = JSON.stringify({ [key]: entry }, null, 2);
	if (!singleEntryStore.startsWith("{\n") || !singleEntryStore.endsWith("\n}")) return measureStoreBytes({ [key]: entry }) - 4;
	const chunk = singleEntryStore.slice(2, -2);
	return Buffer.byteLength(chunk, "utf-8");
}
function buildStoreEntryChunkSizeMap(store) {
	const out = /* @__PURE__ */ new Map();
	for (const [key, entry] of Object.entries(store)) out.set(key, measureStoreEntryChunkBytes(key, entry));
	return out;
}
function resolveProjectedPromptBlobHash(entry) {
	const ref = entry?.skillsSnapshot?.promptRef;
	return ref?.algorithm === "sha256" && typeof ref.hash === "string" ? ref.hash : void 0;
}
function buildProjectedPromptBlobRefCounts(store) {
	const counts = /* @__PURE__ */ new Map();
	for (const entry of Object.values(store)) {
		const hash = resolveProjectedPromptBlobHash(entry);
		if (!hash) continue;
		counts.set(hash, (counts.get(hash) ?? 0) + 1);
	}
	return counts;
}
function getEntryUpdatedAt(entry) {
	if (!entry) return 0;
	const updatedAt = entry.updatedAt;
	return Number.isFinite(updatedAt) ? updatedAt : 0;
}
function buildSessionIdRefCounts(store) {
	const counts = /* @__PURE__ */ new Map();
	for (const entry of Object.values(store)) {
		const sessionId = entry?.sessionId;
		if (!sessionId) continue;
		counts.set(sessionId, (counts.get(sessionId) ?? 0) + 1);
	}
	return counts;
}
function resolveSessionTranscriptPathForEntry(params) {
	if (!params.entry.sessionId) return null;
	try {
		const resolved = resolveSessionFilePathCore(params.entry.sessionId, params.entry, { sessionsDir: params.sessionsDir });
		const resolvedSessionsDir = resolveRealpathOrAbsolute(params.sessionsDir);
		const resolvedPath = resolveRealpathOrAbsolute(resolved);
		const relative = path.relative(resolvedSessionsDir, resolvedPath);
		if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
		return resolvedPath;
	} catch {
		return null;
	}
}
function resolveSessionArtifactPathsForEntry(params) {
	const transcriptPath = resolveSessionTranscriptPathForEntry(params);
	if (!transcriptPath) return [];
	const paths = [transcriptPath];
	if (params.entry.sessionId) {
		paths.push(resolveTrajectoryPointerFilePath(transcriptPath));
		paths.push(resolveTrajectoryFilePath({
			env: {},
			sessionFile: transcriptPath,
			sessionId: params.entry.sessionId
		}));
	}
	return paths;
}
function resolveSessionArtifactCanonicalPathsForEntry(params) {
	return resolveSessionArtifactPathsForEntry(params).map(resolveRealpathOrAbsolute);
}
function resolveReferencedSessionArtifactPaths(params) {
	const referenced = /* @__PURE__ */ new Set();
	const resolvedSessionsDir = resolveRealpathOrAbsolute(params.sessionsDir);
	for (const entry of Object.values(params.store)) {
		for (const resolved of resolveSessionArtifactCanonicalPathsForEntry({
			sessionsDir: params.sessionsDir,
			entry
		})) referenced.add(resolved);
		for (const checkpoint of entry.compactionCheckpoints ?? []) {
			const checkpointFiles = [checkpoint.preCompaction.sessionFile?.trim(), checkpoint.postCompaction.sessionFile?.trim()].filter((filePath) => Boolean(filePath));
			for (const checkpointFile of checkpointFiles) {
				const resolvedCheckpointPath = resolveRealpathOrAbsolute(checkpointFile);
				const relative = path.relative(resolvedSessionsDir, resolvedCheckpointPath);
				if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) referenced.add(resolvedCheckpointPath);
			}
		}
	}
	return referenced;
}
const SESSIONS_DIR_STAT_CONCURRENCY = 8;
// [disk-budget-scan-v1] readdir reports symlinks as non-files, so every entry kept
// here is a regular file directly inside the directory. Canonicalize the directory
// once instead of running a synchronous realpath per file on the Gateway thread
// (31k files on V: ~3 s of lstat per scan).
async function resolveCanonicalDirectory(directory) {
	return await fs.promises.realpath(directory).catch(() => path.resolve(directory));
}
async function readSessionsDirFiles(sessionsDir) {
	const dirents = await fs.promises.readdir(sessionsDir, { withFileTypes: true }).catch(() => []);
	const canonicalDir = await resolveCanonicalDirectory(sessionsDir);
	const tasks = dirents.filter((dirent) => dirent.isFile() && !isMigrationArchiveArtifactName(dirent.name)).map((dirent) => async () => {
		const filePath = path.join(sessionsDir, dirent.name);
		const stat = await fs.promises.stat(filePath).catch(() => null);
		if (!stat?.isFile()) return null;
		return {
			path: filePath,
			canonicalPath: path.join(canonicalDir, dirent.name),
			name: dirent.name,
			size: stat.size,
			mtimeMs: stat.mtimeMs
		};
	});
	const { results } = await runTasksWithConcurrency({
		tasks,
		limit: SESSIONS_DIR_STAT_CONCURRENCY
	});
	return results.filter((file) => Boolean(file));
}
async function readSqliteDatabaseFiles(storePath) {
	const files = [];
	for (const databasePath of listDurableSqliteTargetPathsForSessionStorePath(storePath)) for (const filePath of [databasePath, `${databasePath}-wal`]) {
		const stat = await fs.promises.stat(filePath).catch(() => null);
		if (!stat?.isFile()) continue;
		files.push({
			path: filePath,
			canonicalPath: resolveRealpathOrAbsolute(filePath),
			name: path.basename(filePath),
			size: stat.size,
			mtimeMs: stat.mtimeMs
		});
	}
	return files;
}
/** Measures current physical session artifacts plus the agent SQLite main file and WAL. */
async function measureSessionPhysicalDiskUsage(storePath) {
	const sessionsDirFiles = await readSessionsDirFiles(path.dirname(storePath));
	const promptBlobFiles = await readSessionPromptBlobFiles(path.dirname(storePath));
	const databaseFiles = await readSqliteDatabaseFiles(storePath);
	const databaseMainPaths = new Set(databaseFiles.filter((file) => !file.path.endsWith("-wal")).map((file) => file.canonicalPath));
	const databaseWalPaths = new Set(databaseFiles.filter((file) => file.path.endsWith("-wal")).map((file) => file.canonicalPath));
	const uniqueFiles = /* @__PURE__ */ new Map();
	for (const file of [
		...sessionsDirFiles,
		...promptBlobFiles,
		...databaseFiles
	]) uniqueFiles.set(file.canonicalPath, file);
	const databaseMainBytes = [...databaseMainPaths].reduce((sum, databasePath) => sum + (uniqueFiles.get(databasePath)?.size ?? 0), 0);
	const databaseWalBytes = [...databaseWalPaths].reduce((sum, databasePath) => sum + (uniqueFiles.get(databasePath)?.size ?? 0), 0);
	const totalBytes = [...uniqueFiles.values()].reduce((sum, file) => sum + file.size, 0);
	return {
		databaseMainBytes,
		databaseWalBytes,
		sessionFilesBytes: totalBytes - databaseMainBytes - databaseWalBytes,
		totalBytes
	};
}
// [disk-budget-scan-v1] After removing files from the sessions directory, carry the
// directory total forward and restat only the SQLite files instead of rescanning
// every file. Files added meanwhile are counted by the pass's closing measurement.
async function remeasureSessionPhysicalDiskUsageAfterRemoval(storePath, usage, removedBytes) {
	const databaseFiles = await readSqliteDatabaseFiles(storePath);
	const databaseMainBytes = databaseFiles.filter((file) => !file.path.endsWith("-wal")).reduce((sum, file) => sum + file.size, 0);
	const databaseWalBytes = databaseFiles.filter((file) => file.path.endsWith("-wal")).reduce((sum, file) => sum + file.size, 0);
	const sessionFilesBytes = Math.max(0, usage.sessionFilesBytes - removedBytes);
	return {
		databaseMainBytes,
		databaseWalBytes,
		sessionFilesBytes,
		totalBytes: sessionFilesBytes + databaseMainBytes + databaseWalBytes
	};
}
async function hasRetainedSessionTranscriptArchives(storePath) {
	return (await readSessionsDirFiles(path.dirname(storePath))).some((file) => isRetainedSessionTranscriptArchiveName(file.name));
}
const SESSION_ARCHIVE_PRUNE_BATCH = 16;
/** Removes oldest retained archives and legacy compact backups in small writer-admitted batches. */
async function pruneSessionTranscriptArchivesToHighWater(params) {
	const files = (await readSessionsDirFiles(path.dirname(params.storePath))).filter((file) => isRetainedSessionTranscriptArchiveName(file.name) && !params.excludeNames?.has(file.name)).toSorted((left, right) => left.mtimeMs - right.mtimeMs);
	const runWriter = params.runWriter ?? (async (fn) => await fn());
	let usage = params.usage ?? await measureSessionPhysicalDiskUsage(params.storePath);
	let removedFiles = 0;
	let index = 0;
	// [disk-budget-scan-v1] Carry the total forward instead of rescanning after each
	// file, and release the session writer between batches so foreground writes interleave.
	while (index < files.length && usage.totalBytes > params.highWaterBytes) {
		let estimatedBytes = usage.totalBytes;
		const batch = await runWriter(async () => {
			let removed = 0;
			let removedBytes = 0;
			while (index < files.length && removed < SESSION_ARCHIVE_PRUNE_BATCH && estimatedBytes > params.highWaterBytes) {
				const file = files[index++];
				if (!(await removeFileIfExists(file.path)).ok) continue;
				removed += 1;
				removedBytes += file.size;
				estimatedBytes -= file.size;
			}
			return {
				removed,
				removedBytes
			};
		});
		removedFiles += batch.removed;
		await new Promise((resolve) => setImmediate(resolve));
		if (batch.removed > 0) usage = await remeasureSessionPhysicalDiskUsageAfterRemoval(params.storePath, usage, batch.removedBytes);
	}
	return {
		removedFiles,
		usage
	};
}
async function readSessionPromptBlobFiles(sessionsDir) {
	const root = path.join(sessionsDir, "skills-prompts", "sha256");
	const prefixEntries = await fs.promises.readdir(root, { withFileTypes: true }).catch(() => []);
	const canonicalRoot = prefixEntries.length > 0 ? await resolveCanonicalDirectory(root) : root;
	const files = [];
	for (const prefixEntry of prefixEntries) {
		if (!prefixEntry.isDirectory() || !/^[a-f0-9]{2}$/u.test(prefixEntry.name)) continue;
		const prefixDir = path.join(root, prefixEntry.name);
		const canonicalPrefixDir = path.join(canonicalRoot, prefixEntry.name);
		const blobEntries = await fs.promises.readdir(prefixDir, { withFileTypes: true }).catch(() => []);
		for (const blobEntry of blobEntries) {
			if (!blobEntry.isFile() || !/^[a-f0-9]{64}\.txt$/u.test(blobEntry.name) && !isSessionPromptBlobTempArtifactName(blobEntry.name)) continue;
			const filePath = path.join(prefixDir, blobEntry.name);
			const stat = await fs.promises.stat(filePath).catch(() => null);
			if (!stat?.isFile()) continue;
			files.push({
				path: filePath,
				canonicalPath: path.join(canonicalPrefixDir, blobEntry.name),
				name: blobEntry.name,
				size: stat.size,
				mtimeMs: stat.mtimeMs
			});
		}
	}
	return files;
}
function resolvePromptBlobFileHash(file) {
	return /^[a-f0-9]{64}\.txt$/u.test(file.name) ? file.name.slice(0, -4) : void 0;
}
function isSessionPromptBlobTempArtifactName(name) {
	return /^[a-f0-9]{64}\.txt\.(?:\d+\.)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/u.test(name);
}
function isUnreferencedSessionArtifactFile(file, referencedPaths) {
	if (referencedPaths.has(file.canonicalPath)) return false;
	return isCompactionCheckpointTranscriptFileName(file.name) || isTrajectorySessionArtifactName(file.name) || isPrimarySessionTranscriptFileName(file.name);
}
const SESSION_PROMPT_BLOB_UNREFERENCED_GRACE_MS = SESSION_STORE_TEMP_STALE_MS;
function isUnreferencedPromptBlobFileRemovable(file, projectedPromptBlobRefCounts, cutoffMs) {
	if (file.mtimeMs > cutoffMs) return false;
	const hash = resolvePromptBlobFileHash(file);
	return hash ? !projectedPromptBlobRefCounts.has(hash) : false;
}
function isPromptBlobArtifactRemovable(file, projectedPromptBlobRefCounts, promptBlobCutoffMs, tempCutoffMs) {
	if (isSessionPromptBlobTempArtifactName(file.name)) return file.mtimeMs <= tempCutoffMs;
	return isUnreferencedPromptBlobFileRemovable(file, projectedPromptBlobRefCounts, promptBlobCutoffMs);
}
function isDiskBudgetRemovableSessionFile(file, referencedPaths, tempStaleCutoffMs, storeBasename) {
	if (isSessionStoreTempArtifactName(file.name, storeBasename)) return file.mtimeMs <= tempStaleCutoffMs;
	return isSessionArchiveArtifactName(file.name) || isUnreferencedSessionArtifactFile(file, referencedPaths);
}
async function removeFileIfExists(filePath) {
	const stat = await fs.promises.stat(filePath).catch(() => null);
	if (!stat?.isFile()) return err("not-removed");
	return fs.promises.rm(filePath).then(() => ok(stat.size), () => err("not-removed"));
}
async function removeFileForBudget(params) {
	const resolvedPath = path.resolve(params.filePath);
	const canonicalPath = params.canonicalPath ?? resolveRealpathOrAbsolute(resolvedPath);
	if (params.dryRun) {
		if (params.simulatedRemovedPaths.has(canonicalPath)) return err("not-removed");
		const size = params.fileSizesByPath.get(canonicalPath);
		if (size === void 0) return err("not-removed");
		params.simulatedRemovedPaths.add(canonicalPath);
		params.onRemovedPath?.(canonicalPath);
		return ok(size);
	}
	const removal = await removeFileIfExists(resolvedPath);
	if (removal.ok) params.onRemovedPath?.(canonicalPath);
	return removal;
}
async function removePromptBlobFileForBudget(params) {
	let file = params.file;
	if (!params.dryRun) {
		const stat = await fs.promises.stat(file.path).catch(() => null);
		if (!stat?.isFile()) return err("not-removed");
		file = {
			...file,
			size: stat.size,
			mtimeMs: stat.mtimeMs
		};
	}
	if (!isPromptBlobArtifactRemovable(file, params.projectedPromptBlobRefCounts, params.promptBlobCutoffMs, params.tempCutoffMs)) return err("not-removed");
	return await removeFileForBudget({
		filePath: file.path,
		canonicalPath: file.canonicalPath,
		dryRun: params.dryRun,
		fileSizesByPath: params.fileSizesByPath,
		simulatedRemovedPaths: params.simulatedRemovedPaths,
		onRemovedPath: params.onRemovedPath
	});
}
async function pruneUnreferencedSessionArtifacts(params) {
	const olderThanMs = Number.isFinite(params.olderThanMs) && params.olderThanMs > 0 ? params.olderThanMs : 0;
	const sessionsDir = path.dirname(params.storePath);
	const files = await readSessionsDirFiles(sessionsDir);
	const promptBlobFiles = await readSessionPromptBlobFiles(sessionsDir);
	const fileSizesByPath = new Map([...files, ...promptBlobFiles].map((file) => [file.canonicalPath, file.size]));
	const simulatedRemovedPaths = /* @__PURE__ */ new Set();
	const referencedPaths = resolveReferencedSessionArtifactPaths({
		sessionsDir,
		store: params.store
	});
	const projectedPromptBlobRefCounts = buildProjectedPromptBlobRefCounts(projectSessionStoreForPersistence({
		storePath: params.storePath,
		store: params.store
	}).store);
	const cutoffMs = Date.now() - olderThanMs;
	const tempCutoffMs = Date.now() - SESSION_STORE_TEMP_STALE_MS;
	const promptBlobCutoffMs = Date.now() - Math.max(olderThanMs, SESSION_PROMPT_BLOB_UNREFERENCED_GRACE_MS);
	const storeBasename = path.basename(params.storePath);
	const removableStoreFiles = files.filter((file) => {
		if (params.excludeCanonicalPaths?.has(file.canonicalPath)) return false;
		if (isSessionStoreTempArtifactName(file.name, storeBasename)) return file.mtimeMs <= tempCutoffMs;
		return file.mtimeMs <= cutoffMs && isUnreferencedSessionArtifactFile(file, referencedPaths);
	});
	const removablePromptBlobFiles = promptBlobFiles.filter((file) => {
		if (params.excludeCanonicalPaths?.has(file.canonicalPath)) return false;
		return isPromptBlobArtifactRemovable(file, projectedPromptBlobRefCounts, promptBlobCutoffMs, tempCutoffMs);
	});
	const removableFiles = [...removableStoreFiles.map((file) => ({
		kind: "store",
		file
	})), ...removablePromptBlobFiles.map((file) => ({
		kind: "promptBlob",
		file
	}))].filter((file) => {
		return !params.excludeCanonicalPaths?.has(file.file.canonicalPath);
	}).toSorted((a, b) => a.file.mtimeMs - b.file.mtimeMs);
	let removedFiles = 0;
	let freedBytes = 0;
	const dryRun = params.dryRun === true;
	for (const item of removableFiles) {
		const removal = item.kind === "promptBlob" ? await removePromptBlobFileForBudget({
			file: item.file,
			projectedPromptBlobRefCounts,
			promptBlobCutoffMs,
			tempCutoffMs,
			dryRun,
			fileSizesByPath,
			simulatedRemovedPaths
		}) : await removeFileForBudget({
			filePath: item.file.path,
			canonicalPath: item.file.canonicalPath,
			dryRun,
			fileSizesByPath,
			simulatedRemovedPaths
		});
		if (!removal.ok) continue;
		removedFiles += 1;
		freedBytes += removal.value;
	}
	return {
		scannedFiles: files.length + promptBlobFiles.length,
		removedFiles,
		freedBytes,
		olderThanMs
	};
}
async function enforceSessionDiskBudget(params) {
	const maxBytes = params.maintenance.maxDiskBytes;
	const highWaterBytes = params.maintenance.highWaterBytes;
	if (maxBytes == null || highWaterBytes == null) return null;
	const log = params.log ?? NOOP_LOGGER;
	const dryRun = params.dryRun === true;
	const sessionsDir = path.dirname(params.storePath);
	const files = await readSessionsDirFiles(sessionsDir);
	const promptBlobFiles = await readSessionPromptBlobFiles(sessionsDir);
	const fileSizesByPath = new Map([...files, ...promptBlobFiles].map((file) => [file.canonicalPath, file.size]));
	const simulatedRemovedPaths = /* @__PURE__ */ new Set();
	const resolvedStorePath = resolveRealpathOrAbsolute(params.storePath);
	const storeFile = files.find((file) => file.canonicalPath === resolvedStorePath);
	const projectedPersistence = projectSessionStoreForPersistence({
		storePath: params.storePath,
		store: params.store
	});
	const projectedStore = projectedPersistence.store;
	let projectedStoreBytes = measureStoreBytes(projectedStore);
	const projectedPromptBlobBytesByHash = /* @__PURE__ */ new Map();
	const existingPromptBlobFilesByHash = /* @__PURE__ */ new Map();
	for (const file of promptBlobFiles) {
		const hash = resolvePromptBlobFileHash(file);
		if (hash) existingPromptBlobFilesByHash.set(hash, file);
	}
	for (const [hash, blob] of projectedPersistence.promptBlobs) if (!existingPromptBlobFilesByHash.has(hash)) projectedPromptBlobBytesByHash.set(hash, blob.ref.bytes);
	const projectedPromptBlobRefCounts = buildProjectedPromptBlobRefCounts(projectedStore);
	const projectedPromptBlobBytes = [...projectedPromptBlobBytesByHash.values()].reduce((sum, bytes) => sum + bytes, 0);
	let total = [...files, ...promptBlobFiles].reduce((sum, file) => sum + file.size, 0) - (storeFile?.size ?? 0) + projectedStoreBytes + projectedPromptBlobBytes;
	const totalBefore = total;
	if (total <= maxBytes) return {
		totalBytesBefore: totalBefore,
		totalBytesAfter: total,
		removedFiles: 0,
		removedEntries: 0,
		freedBytes: 0,
		maxBytes,
		highWaterBytes,
		overBudget: false
	};
	if (params.warnOnly) {
		log.warn("session disk budget exceeded (warn-only mode)", {
			sessionsDir,
			totalBytes: total,
			maxBytes,
			highWaterBytes
		});
		return {
			totalBytesBefore: totalBefore,
			totalBytesAfter: total,
			removedFiles: 0,
			removedEntries: 0,
			freedBytes: 0,
			maxBytes,
			highWaterBytes,
			overBudget: true
		};
	}
	let removedFiles = 0;
	let removedEntries = 0;
	let freedBytes = 0;
	const commitEvictedIndex = params.commitEvictedIndex;
	const referencedPaths = resolveReferencedSessionArtifactPaths({
		sessionsDir,
		store: params.store
	});
	const tempStaleCutoffMs = Date.now() - SESSION_STORE_TEMP_STALE_MS;
	const promptBlobOrphanCutoffMs = Date.now() - SESSION_PROMPT_BLOB_UNREFERENCED_GRACE_MS;
	const storeBasename = path.basename(params.storePath);
	const unreferencedPromptBlobQueue = promptBlobFiles.filter((file) => {
		return isPromptBlobArtifactRemovable(file, projectedPromptBlobRefCounts, promptBlobOrphanCutoffMs, tempStaleCutoffMs);
	}).toSorted((a, b) => a.mtimeMs - b.mtimeMs);
	for (const file of unreferencedPromptBlobQueue) {
		if (total <= highWaterBytes) break;
		const removal = await removePromptBlobFileForBudget({
			file,
			projectedPromptBlobRefCounts,
			promptBlobCutoffMs: promptBlobOrphanCutoffMs,
			tempCutoffMs: tempStaleCutoffMs,
			dryRun,
			fileSizesByPath,
			simulatedRemovedPaths,
			onRemovedPath: params.onRemoveFile
		});
		if (!removal.ok) continue;
		total -= removal.value;
		freedBytes += removal.value;
		removedFiles += 1;
	}
	const removableFileQueue = files.filter((file) => isDiskBudgetRemovableSessionFile(file, referencedPaths, tempStaleCutoffMs, storeBasename)).toSorted((a, b) => a.mtimeMs - b.mtimeMs);
	for (const file of removableFileQueue) {
		if (total <= highWaterBytes) break;
		const removal = await removeFileForBudget({
			filePath: file.path,
			canonicalPath: file.canonicalPath,
			dryRun,
			fileSizesByPath,
			simulatedRemovedPaths,
			onRemovedPath: params.onRemoveFile
		});
		if (!removal.ok) continue;
		total -= removal.value;
		freedBytes += removal.value;
		removedFiles += 1;
	}
	if (total > highWaterBytes) {
		const activeSessionKey = normalizeOptionalLowercaseString(params.activeSessionKey);
		const sessionIdRefCounts = buildSessionIdRefCounts(params.store);
		const entryChunkBytesByKey = buildStoreEntryChunkSizeMap(projectedStore);
		const keys = Object.keys(params.store).toSorted((a, b) => {
			return getEntryUpdatedAt(params.store[a]) - getEntryUpdatedAt(params.store[b]);
		});
		for (const key of keys) {
			if (total <= highWaterBytes) break;
			if (activeSessionKey && normalizeLowercaseStringOrEmpty(key) === activeSessionKey) continue;
			const entry = params.store[key];
			if (!entry) continue;
			if (shouldPreserveMaintenanceEntry({
				key,
				entry,
				preserveKeys: params.preserveKeys,
				preserveRecentMs: params.maintenance.preserveRecentMs
			})) continue;
			const previousProjectedBytes = projectedStoreBytes;
			const projectedEntry = projectedStore[key];
			const promptBlobHash = resolveProjectedPromptBlobHash(projectedEntry);
			delete params.store[key];
			delete projectedStore[key];
			const chunkBytes = entryChunkBytesByKey.get(key);
			entryChunkBytesByKey.delete(key);
			if (typeof chunkBytes === "number" && Number.isFinite(chunkBytes) && chunkBytes >= 0) projectedStoreBytes = Math.max(2, projectedStoreBytes - (chunkBytes + 2));
			else projectedStoreBytes = measureStoreBytes(projectedStore);
			total += projectedStoreBytes - previousProjectedBytes;
			removedEntries += 1;
			if (!dryRun && commitEvictedIndex) {
				await commitEvictedIndex();
				if (projectedPromptBlobBytesByHash.size > 0) for (const file of await readSessionPromptBlobFiles(sessionsDir)) {
					const hash = resolvePromptBlobFileHash(file);
					if (hash && projectedPromptBlobBytesByHash.delete(hash)) existingPromptBlobFilesByHash.set(hash, file);
				}
			}
			if (promptBlobHash) {
				const nextRefCount = (projectedPromptBlobRefCounts.get(promptBlobHash) ?? 1) - 1;
				if (nextRefCount > 0) projectedPromptBlobRefCounts.set(promptBlobHash, nextRefCount);
				else {
					projectedPromptBlobRefCounts.delete(promptBlobHash);
					const virtualBlobBytes = projectedPromptBlobBytesByHash.get(promptBlobHash) ?? 0;
					if (virtualBlobBytes > 0) {
						total -= virtualBlobBytes;
						projectedPromptBlobBytesByHash.delete(promptBlobHash);
					} else {
						const blobFile = existingPromptBlobFilesByHash.get(promptBlobHash);
						if (blobFile && (dryRun || commitEvictedIndex)) {
							const removal = await removePromptBlobFileForBudget({
								file: blobFile,
								projectedPromptBlobRefCounts,
								promptBlobCutoffMs: promptBlobOrphanCutoffMs,
								tempCutoffMs: tempStaleCutoffMs,
								dryRun,
								fileSizesByPath,
								simulatedRemovedPaths,
								onRemovedPath: dryRun ? void 0 : params.onRemoveFile
							});
							if (removal.ok) {
								total -= removal.value;
								freedBytes += removal.value;
								removedFiles += 1;
							}
						}
					}
				}
			}
			const sessionId = entry.sessionId;
			if (!sessionId) continue;
			const nextRefCount = (sessionIdRefCounts.get(sessionId) ?? 1) - 1;
			if (nextRefCount > 0) {
				sessionIdRefCounts.set(sessionId, nextRefCount);
				continue;
			}
			sessionIdRefCounts.delete(sessionId);
			if (!dryRun && !commitEvictedIndex) continue;
			for (const artifactPath of resolveSessionArtifactPathsForEntry({
				sessionsDir,
				entry
			})) {
				const removal = await removeFileForBudget({
					filePath: artifactPath,
					dryRun,
					fileSizesByPath,
					simulatedRemovedPaths,
					onRemovedPath: dryRun ? void 0 : params.onRemoveFile
				});
				if (!removal.ok) continue;
				total -= removal.value;
				freedBytes += removal.value;
				removedFiles += 1;
			}
		}
	}
	if (!dryRun) {
		if (total > highWaterBytes) log.warn("session disk budget still above high-water target after cleanup", {
			sessionsDir,
			totalBytes: total,
			maxBytes,
			highWaterBytes,
			removedFiles,
			removedEntries
		});
		else if (removedFiles > 0 || removedEntries > 0) log.info("applied session disk budget cleanup", {
			sessionsDir,
			totalBytesBefore: totalBefore,
			totalBytesAfter: total,
			maxBytes,
			highWaterBytes,
			removedFiles,
			removedEntries
		});
	}
	return {
		totalBytesBefore: totalBefore,
		totalBytesAfter: total,
		removedFiles,
		removedEntries,
		freedBytes,
		maxBytes,
		highWaterBytes,
		overBudget: true
	};
}
//#endregion
export { remeasureSessionPhysicalDiskUsageAfterRemoval, shouldRunSessionEntryMaintenance as S, pruneStaleModelRunEntries as _, pruneUnreferencedSessionArtifacts as a, shouldPreserveMaintenanceEntry as b, collectActiveSessionWorkAdmissionKeys as c, archiveStaleDashboardEntries as d, capEntryCount as f, pruneStaleEntries as g, normalizeResolvedMaintenanceConfigInput as h, pruneSessionTranscriptArchivesToHighWater as i, collectSessionMaintenancePreserveKeysForStore as l, isRecentSessionMaintenanceEntry as m, hasRetainedSessionTranscriptArchives as n, resolveSessionArtifactCanonicalPathsForEntry as o, getActiveSessionMaintenanceWarning as p, measureSessionPhysicalDiskUsage as r, resolveMaintenanceConfig as s, enforceSessionDiskBudget as t, registerSessionMaintenancePreserveKeysProvider as u, resolveMaintenanceConfigFromInput as v, shouldRunModelRunPrune as x, resolveQuotaSuspensionEntryMaintenance as y };
