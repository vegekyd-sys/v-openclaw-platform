import { i as resolveGlobalSingleton, r as resolveGlobalSet } from "./global-singleton-Dc_stLtU.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { y as uniqueStrings } from "./string-normalization-DiSb4JeN.js";
import { a as getChildLogger } from "./logger-Dj_CBJHF.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { p as runWithSqliteBusyTimeout } from "./node-sqlite-CL-d6drd.js";
import { a as iterateSqliteQuerySync, n as executeSqliteQuerySync } from "./kysely-sync-DKYGT267.js";
import { n as registerListener, t as notifyListeners } from "./listeners-BogSNJ-R.js";
import { r as resolveOpenClawAgentSqlitePath, t as isIncognitoOpenClawAgentSqlitePath } from "./openclaw-agent-db.paths-DYna80bS.js";
import { g as openOpenClawAgentDatabase, y as runOpenClawAgentWriteTransaction } from "./openclaw-agent-db-CUTe8BX6.js";
import { n as withOpenClawAgentDatabaseReadOnly } from "./openclaw-agent-db-readonly-wb-jdztx.js";
import { I as runSqliteSessionDeletionTransaction, L as withSqliteSessionDeletions, f as readSessionEntryCount, h as readSessionEntryStore, x as collectSessionStateIdsForEntry, y as writeSessionEntry } from "./session-accessor.sqlite-entry-store-VfW3gyuj.js";
import { u as runQueuedStoreWrite } from "./store-writer-state-_Y6b9Vjm.js";
import { a as normalizeStoreSessionKey } from "./store-entry-CMuTqREZ.js";
import { c as resolveSqliteScope, i as getSessionKysely, m as toDatabaseOptions, p as runExclusiveSqliteSessionWrite, t as cloneSessionEntry, u as resolveSqliteTranscriptArchiveDirectory } from "./session-accessor.sqlite-scope-BwPKGcgm.js";
import { A as sessionEntryMetadataJson, E as parseSessionEntryJson } from "./session-accessor.sqlite-transcript-state-Cz9g7S9v.js";
import { h as runExclusiveSessionLifecycleMutation, i as collectActiveSessionWorkAdmissions } from "./session-lifecycle-admission-siUq03Jk.js";
import { r as materializeSessionStateDeletePlans } from "./session-accessor.sqlite-archive-CuBPV-IT.js";
import { a as partitionUnchangedPlannedLifecycleArtifactEntries, c as planSessionStateDeleteIfUnreferenced, f as readSessionGenerationIdsForKeys, g as emitArchivedTranscriptUpdates, h as publishSessionStateArchives, i as deletePlannedLifecycleArtifactEntries, n as collectProjectedReferencedSessionIds, r as deleteMaterializedSessionStatePlans, u as readReferencedSessionIds } from "./session-accessor.sqlite-lifecycle-state-CrB_K2kA.js";
import { S as shouldRunSessionEntryMaintenance, _ as pruneStaleModelRunEntries, b as shouldPreserveMaintenanceEntry, d as archiveStaleDashboardEntries, f as capEntryCount, g as pruneStaleEntries, h as normalizeResolvedMaintenanceConfigInput, i as pruneSessionTranscriptArchivesToHighWater, l as collectSessionMaintenancePreserveKeysForStore, m as isRecentSessionMaintenanceEntry, n as hasRetainedSessionTranscriptArchives, r as measureSessionPhysicalDiskUsage, s as resolveMaintenanceConfig, x as shouldRunModelRunPrune } from "./disk-budget-BzLS0kmH.js";
import fs from "node:fs";
import path from "node:path";
import { sql } from "kysely";
//#region src/sessions/session-lifecycle-events.ts
/** Session lifecycle event broadcast to observers when a session is created or linked. */
const SESSION_LIFECYCLE_LISTENERS = resolveGlobalSet(Symbol.for("openclaw.sessionLifecycleEventListeners"), "close-and-restart");
const SESSION_IDENTITY_MUTATION_LISTENERS = resolveGlobalSet(Symbol.for("openclaw.sessionIdentityMutationListeners"), "close-and-restart");
const SESSION_IDENTITY_MUTATION_STATE = resolveGlobalSingleton(Symbol.for("openclaw.sessionIdentityMutationState"), () => ({ version: 0 }));
const SESSION_LIFECYCLE_STATE = resolveGlobalSingleton(Symbol.for("openclaw.sessionLifecycleState"), () => ({ version: 0 }));
function readSessionLifecycleVersion() {
	return SESSION_LIFECYCLE_STATE.version;
}
/** Registers a session lifecycle listener. */
function onSessionLifecycleEvent(listener) {
	return registerListener(SESSION_LIFECYCLE_LISTENERS, listener);
}
/** Emits a best-effort session lifecycle event to all listeners. */
function emitSessionLifecycleEvent(event) {
	SESSION_LIFECYCLE_STATE.version += 1;
	notifyListeners(SESSION_LIFECYCLE_LISTENERS, event);
}
function onSessionIdentityMutation(listener) {
	return registerListener(SESSION_IDENTITY_MUTATION_LISTENERS, listener);
}
/** Monotonic fence for projections that consume session identities across owner boundaries. */
function readSessionIdentityMutationVersion() {
	return SESSION_IDENTITY_MUTATION_STATE.version;
}
function emitSessionIdentityMutation(mutation) {
	SESSION_IDENTITY_MUTATION_STATE.version += 1;
	notifyListeners(SESSION_IDENTITY_MUTATION_LISTENERS, mutation);
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-identity.ts
function toSessionIdentityTarget(entry, sessionKeys) {
	const sessionId = normalizeOptionalString(entry?.sessionId);
	return {
		...sessionId ? { sessionId } : {},
		sessionKeys
	};
}
function emitCommittedSessionEntryRemoval(sessionKey, entry) {
	emitSessionIdentityMutation({
		kind: "delete",
		previous: toSessionIdentityTarget(entry, [sessionKey])
	});
}
function emitCommittedSessionEntryRemovals(removals) {
	const emittedKeys = /* @__PURE__ */ new Set();
	for (const removal of removals) {
		if (emittedKeys.has(removal.sessionKey)) continue;
		emittedKeys.add(removal.sessionKey);
		emitCommittedSessionEntryRemoval(removal.sessionKey, removal.expectedEntry);
	}
}
function emitCommittedSessionEntryChange(params) {
	const previous = toSessionIdentityTarget(params.previousEntry, [params.previousKey]);
	const current = toSessionIdentityTarget(params.currentEntry, [params.currentKey]);
	const moved = params.previousKey !== params.currentKey;
	if (!moved && previous.sessionId === current.sessionId) return;
	emitSessionIdentityMutation({
		kind: moved ? "move" : "replace",
		previous,
		current
	});
}
function emitCommittedSessionIdentityDiff(previous, current) {
	const currentKeysBySessionId = /* @__PURE__ */ new Map();
	for (const [sessionKey, entry] of current) {
		const sessionId = normalizeOptionalString(entry.sessionId);
		if (sessionId) currentKeysBySessionId.set(sessionId, [...currentKeysBySessionId.get(sessionId) ?? [], sessionKey]);
	}
	const movedKeysByCurrentKey = /* @__PURE__ */ new Map();
	const handledPreviousKeys = /* @__PURE__ */ new Set();
	const handledCurrentKeys = /* @__PURE__ */ new Set();
	for (const [sessionKey, entry] of previous) {
		if (current.has(sessionKey)) continue;
		const sessionId = normalizeOptionalString(entry.sessionId);
		const currentKeys = sessionId ? currentKeysBySessionId.get(sessionId) : void 0;
		if (currentKeys?.length !== 1) continue;
		const [currentKey] = currentKeys;
		if (!currentKey) continue;
		movedKeysByCurrentKey.set(currentKey, [...movedKeysByCurrentKey.get(currentKey) ?? [], sessionKey]);
		handledPreviousKeys.add(sessionKey);
		handledCurrentKeys.add(currentKey);
	}
	for (const [currentKey, previousKeys] of movedKeysByCurrentKey) {
		const currentEntry = current.get(currentKey);
		if (currentEntry) emitSessionIdentityMutation({
			kind: "move",
			previous: toSessionIdentityTarget(currentEntry, previousKeys),
			current: toSessionIdentityTarget(currentEntry, [currentKey])
		});
	}
	for (const [sessionKey, previousEntry] of previous) {
		const currentEntry = current.get(sessionKey);
		if (currentEntry) {
			handledCurrentKeys.add(sessionKey);
			emitCommittedSessionEntryChange({
				currentEntry,
				currentKey: sessionKey,
				previousEntry,
				previousKey: sessionKey
			});
		} else if (!handledPreviousKeys.has(sessionKey)) emitCommittedSessionEntryRemoval(sessionKey, previousEntry);
	}
	for (const [sessionKey, currentEntry] of current) {
		if (handledCurrentKeys.has(sessionKey)) continue;
		emitSessionIdentityMutation({
			kind: "create",
			previous: { sessionKeys: [] },
			current: toSessionIdentityTarget(currentEntry, [sessionKey])
		});
	}
}
function emitCommittedLifecycleIdentityMutations(params) {
	const removedKeys = new Set(params.removedSessionKeys);
	const previous = new Map(params.projected.removals.filter((removal) => removedKeys.has(removal.sessionKey)).map((removal) => [removal.sessionKey, removal.expectedEntry]));
	const current = /* @__PURE__ */ new Map();
	for (const upsert of params.projected.upsertedEntries) {
		if (!current.has(upsert.sessionKey) && upsert.expectedEntry) previous.set(upsert.sessionKey, upsert.expectedEntry);
		current.set(upsert.sessionKey, upsert.entry);
	}
	emitCommittedSessionIdentityDiff(previous, current);
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-maintenance-candidates.ts
function collectSqliteSessionMaintenanceBaseKeys(store, activeSessionKeys) {
	const keys = [];
	const seen = /* @__PURE__ */ new Set();
	for (const activeSessionKey of activeSessionKeys) {
		let currentKey = normalizeStoreSessionKey(activeSessionKey);
		while (currentKey && !seen.has(currentKey)) {
			seen.add(currentKey);
			keys.push(currentKey);
			currentKey = normalizeStoreSessionKey(store[currentKey]?.parentSessionKey ?? "");
		}
	}
	return keys;
}
function readSessionMaintenanceKeyProjection(database) {
	const db = getSessionKysely(database.db);
	const store = {};
	for (const row of iterateSqliteQuerySync(database.db, db.selectFrom("session_nodes").select([
		"current_session_id",
		"parent_session_key",
		"session_key",
		"updated_at"
	]).orderBy("session_key", "asc"))) store[row.session_key] = {
		sessionId: row.current_session_id,
		updatedAt: row.updated_at,
		...row.parent_session_key ? { parentSessionKey: row.parent_session_key } : {}
	};
	return store;
}
function readSessionMaintenanceAgeCandidates(params) {
	if (params.minimumAgeMs == null || params.minimumAgeMs <= 0) return {};
	const db = getSessionKysely(params.database.db);
	const store = {};
	for (const row of iterateSqliteQuerySync(params.database.db, db.selectFrom("session_nodes").select([
		sessionEntryMetadataJson,
		"current_session_id",
		"session_key",
		"updated_at"
	]).where("updated_at", "<", Date.now() - params.minimumAgeMs).where("archived_at", "is", null).orderBy("updated_at", "asc"))) {
		const entry = parseSessionEntryJson(row);
		if (entry) store[row.session_key] = entry;
	}
	return store;
}
function readSessionMaintenanceCapCandidates(params) {
	const db = getSessionKysely(params.database.db);
	const store = {};
	let eligible = 0;
	for (const row of iterateSqliteQuerySync(params.database.db, db.selectFrom("session_nodes").select([
		sessionEntryMetadataJson,
		"current_session_id",
		"session_key",
		"updated_at"
	]).orderBy("updated_at", "asc").orderBy("session_key", "asc"))) {
		if (params.excludedKeys.has(row.session_key)) continue;
		const entry = parseSessionEntryJson(row);
		if (!entry) continue;
		store[row.session_key] = entry;
		if (!shouldPreserveMaintenanceEntry({
			key: row.session_key,
			entry,
			preserveKeys: params.preserveKeys,
			preserveRecentMs: params.preserveRecentMs
		})) {
			eligible += 1;
			if (eligible >= params.overflow) break;
		}
	}
	return store;
}
//#endregion
//#region src/config/sessions/session-accessor.sqlite-maintenance.ts
const MAX_SESSION_MAINTENANCE_BATCH_ENTRIES = 64;
const MAX_SESSION_MAINTENANCE_BATCH_ARCHIVE_BYTES = 67108864;
const SESSION_TRANSCRIPT_BYTE_QUERY_BATCH = MAX_SESSION_MAINTENANCE_BATCH_ENTRIES;
const SESSION_PLANNER_ANALYSIS_MIN_DELETED_ENTRIES = MAX_SESSION_MAINTENANCE_BATCH_ENTRIES;
const SESSION_PLANNER_ANALYSIS_LIMIT = 1e3;
const plannerMaintenanceByStore = /* @__PURE__ */ new Map();
/** Coalesce bounded planner-statistics refreshes behind the per-store writer lane. */
async function refreshSqliteSessionPlannerStatisticsBestEffort(scope, deletedEntries, options = {}) {
	const isCurrent = options.isCurrent ?? (() => true);
	if (deletedEntries < SESSION_PLANNER_ANALYSIS_MIN_DELETED_ENTRIES || !isCurrent()) return;
	const storePath = resolveOpenClawAgentSqlitePath(toDatabaseOptions(scope));
	const active = plannerMaintenanceByStore.get(storePath);
	if (active) {
		await active;
		return;
	}
	const completion = runExclusiveSqliteSessionWrite(scope, async () => {
		if (!isCurrent()) return;
		const database = openOpenClawAgentDatabase(toDatabaseOptions(scope));
		runWithSqliteBusyTimeout(database.db, 0, () => {
			const row = database.db.prepare("PRAGMA analysis_limit").get();
			const previousLimit = Number(row?.analysis_limit ?? 0);
			try {
				database.db.exec(`PRAGMA analysis_limit = ${SESSION_PLANNER_ANALYSIS_LIMIT}; ANALYZE main;`);
			} finally {
				database.db.exec(`PRAGMA analysis_limit = ${previousLimit};`);
			}
		});
	}).catch((error) => {
		getChildLogger({ subsystem: "session-sqlite" }).warn("SQLite session planner-statistics refresh failed", {
			agentId: scope.agentId,
			error,
			path: storePath
		});
	}).finally(() => {
		plannerMaintenanceByStore.delete(storePath);
	});
	plannerMaintenanceByStore.set(storePath, completion);
	await completion;
}
function buildSessionMaintenanceBatches(params) {
	const parent = params.entryRemovals.map((_, index) => index);
	const find = (index) => {
		let root = index;
		while (parent[root] !== root) root = parent[root] ?? root;
		let current = index;
		while (parent[current] !== current) {
			const next = parent[current] ?? root;
			parent[current] = root;
			current = next;
		}
		return root;
	};
	const union = (left, right) => {
		const leftRoot = find(left);
		const rightRoot = find(right);
		if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
	};
	const removalIndexesBySessionId = /* @__PURE__ */ new Map();
	const removalIndexBySessionKey = /* @__PURE__ */ new Map();
	const addRemovalIndex = (sessionId, index) => {
		const indexes = removalIndexesBySessionId.get(sessionId) ?? [];
		if (indexes.includes(index)) return;
		if (indexes.length > 0) union(indexes[0] ?? index, index);
		indexes.push(index);
		removalIndexesBySessionId.set(sessionId, indexes);
	};
	for (const [index, removal] of params.entryRemovals.entries()) {
		if (!removal.expectedEntry) continue;
		removalIndexBySessionKey.set(removal.sessionKey, index);
		for (const sessionId of collectSessionStateIdsForEntry(removal.expectedEntry)) addRemovalIndex(sessionId, index);
	}
	for (const plan of params.stateDeletePlans) {
		const ownerIndex = plan.snapshot.sessionKey ? removalIndexBySessionKey.get(plan.snapshot.sessionKey) : void 0;
		if (ownerIndex !== void 0) addRemovalIndex(plan.sessionId, ownerIndex);
	}
	const groupsByRoot = /* @__PURE__ */ new Map();
	for (const [index, removal] of params.entryRemovals.entries()) {
		const root = find(index);
		const group = groupsByRoot.get(root) ?? {
			archiveBytes: 0,
			entryRemovals: [],
			order: index,
			stateDeletePlans: [],
			workItems: 0
		};
		group.entryRemovals.push(removal);
		group.order = Math.min(group.order, index);
		groupsByRoot.set(root, group);
	}
	const plansBySessionId = /* @__PURE__ */ new Map();
	for (const plan of params.stateDeletePlans) {
		const plans = plansBySessionId.get(plan.sessionId) ?? [];
		plans.push(plan);
		plansBySessionId.set(plan.sessionId, plans);
	}
	const standaloneGroups = [];
	let standaloneOrder = params.entryRemovals.length;
	for (const [sessionId, plans] of plansBySessionId) {
		const removalIndex = removalIndexesBySessionId.get(sessionId)?.[0];
		const removalGroup = removalIndex === void 0 ? void 0 : groupsByRoot.get(find(removalIndex));
		const group = removalGroup ?? {
			archiveBytes: 0,
			entryRemovals: [],
			order: standaloneOrder++,
			stateDeletePlans: [],
			workItems: 0
		};
		group.stateDeletePlans.push(...plans);
		if (plans.some((plan) => plan.archiveTranscript)) group.archiveBytes += params.archiveBytesBySessionId.get(sessionId) ?? 0;
		if (!removalGroup) standaloneGroups.push(group);
	}
	const groups = [...groupsByRoot.values(), ...standaloneGroups].map((group) => {
		group.workItems = Math.max(group.entryRemovals.length, new Set(group.stateDeletePlans.map((plan) => plan.sessionId)).size);
		return group;
	}).toSorted((left, right) => left.order - right.order);
	const batches = [];
	let batch = {
		archiveBytes: 0,
		entryRemovals: [],
		stateDeletePlans: [],
		workItems: 0
	};
	const flush = () => {
		if (batch.workItems === 0) return;
		batches.push(batch);
		batch = {
			archiveBytes: 0,
			entryRemovals: [],
			stateDeletePlans: [],
			workItems: 0
		};
	};
	for (const group of groups) {
		const exceedsEntryLimit = batch.workItems > 0 && batch.workItems + group.workItems > MAX_SESSION_MAINTENANCE_BATCH_ENTRIES;
		const exceedsByteLimit = batch.workItems > 0 && batch.archiveBytes + group.archiveBytes > MAX_SESSION_MAINTENANCE_BATCH_ARCHIVE_BYTES;
		if (exceedsEntryLimit || exceedsByteLimit) flush();
		batch.archiveBytes += group.archiveBytes;
		batch.entryRemovals.push(...group.entryRemovals);
		batch.stateDeletePlans.push(...group.stateDeletePlans);
		batch.workItems += group.workItems;
	}
	flush();
	return batches;
}
async function readSessionTranscriptJsonlBytes(scope, sessionIds, isCurrent) {
	const bytesBySessionId = /* @__PURE__ */ new Map();
	for (let offset = 0; offset < sessionIds.length; offset += SESSION_TRANSCRIPT_BYTE_QUERY_BATCH) {
		const batch = sessionIds.slice(offset, offset + SESSION_TRANSCRIPT_BYTE_QUERY_BATCH);
		await new Promise((resolve) => {
			setImmediate(resolve);
		});
		if (!isCurrent()) return bytesBySessionId;
		const opened = withOpenClawAgentDatabaseReadOnly((database) => {
			const db = getSessionKysely(database.db);
			return executeSqliteQuerySync(database.db, db.selectFrom("transcript_events").select(["session_id", sql`SUM(OCTET_LENGTH(event_json) + 1)`.as("jsonl_bytes")]).where("session_id", "in", batch).groupBy("session_id")).rows;
		}, toDatabaseOptions(scope));
		if (!opened.found) throw new Error(`Cannot size SQLite session transcripts: ${opened.reason.replaceAll("-", " ")}`);
		for (const row of opened.value) bytesBySessionId.set(row.session_id, Number(row.jsonl_bytes));
	}
	return bytesBySessionId;
}
function applySessionEntryMaintenance(database, params) {
	if (params.skipMaintenance) return {
		entryRemovals: [],
		stateDeletePlans: [],
		archived: 0,
		modelRunPruned: 0,
		pruned: 0,
		capped: 0
	};
	const maintenance = params.maintenanceConfig ? normalizeResolvedMaintenanceConfigInput(params.maintenanceConfig) : resolveMaintenanceConfig();
	if (maintenance.mode === "warn") return {
		entryRemovals: [],
		stateDeletePlans: [],
		archived: 0,
		modelRunPruned: 0,
		pruned: 0,
		capped: 0
	};
	const entryCount = readSessionEntryCount(database);
	const activeSessionKeys = uniqueStrings([params.activeSessionKey ?? "", ...params.activeSessionKeys ?? []]);
	const keyProjection = readSessionMaintenanceKeyProjection(database);
	const preserveKeys = collectSessionMaintenancePreserveKeysForStore({
		storePath: params.storePath,
		store: keyProjection,
		baseKeys: collectSqliteSessionMaintenanceBaseKeys(keyProjection, activeSessionKeys)
	}) ?? /* @__PURE__ */ new Set();
	const runModelRunPrune = shouldRunModelRunPrune({
		maintenance,
		entryCount,
		force: params.forceMaintenance
	});
	const candidateAges = [
		maintenance.pruneAfterMs,
		maintenance.archiveDashboardAfterMs,
		runModelRunPrune ? maintenance.modelRunPruneAfterMs : null
	].filter((age) => age != null && age > 0);
	const store = readSessionMaintenanceAgeCandidates({
		database,
		minimumAgeMs: candidateAges.length > 0 ? Math.min(...candidateAges) : null
	});
	const removalReasons = /* @__PURE__ */ new Map();
	const rememberRemoval = (maintenanceReason) => ({ key }) => {
		removalReasons.set(key, maintenanceReason);
	};
	let remainingEntryCount = entryCount;
	let modelRunPruned = 0;
	if (runModelRunPrune) {
		modelRunPruned = pruneStaleModelRunEntries(store, maintenance.modelRunPruneAfterMs, {
			log: false,
			onPruned: rememberRemoval("model-run-pruned"),
			preserveKeys,
			preserveRecentMs: maintenance.preserveRecentMs
		});
		remainingEntryCount -= modelRunPruned;
	}
	const archivedKeys = /* @__PURE__ */ new Set();
	const archived = archiveStaleDashboardEntries(store, maintenance.archiveDashboardAfterMs, {
		log: false,
		onArchived: ({ key }) => {
			archivedKeys.add(key);
		},
		preserveKeys
	});
	const pruned = pruneStaleEntries(store, maintenance.pruneAfterMs, {
		log: false,
		onPruned: rememberRemoval("pruned"),
		preserveKeys,
		preserveRecentMs: maintenance.preserveRecentMs
	});
	remainingEntryCount -= pruned;
	let capped = 0;
	if (shouldRunSessionEntryMaintenance({
		entryCount: remainingEntryCount,
		maxEntries: maintenance.maxEntries,
		force: params.forceMaintenance
	})) {
		const overflow = Math.max(0, remainingEntryCount - maintenance.maxEntries);
		if (overflow > 0) {
			const capStore = readSessionMaintenanceCapCandidates({
				database,
				excludedKeys: new Set(removalReasons.keys()),
				overflow,
				preserveKeys,
				preserveRecentMs: maintenance.preserveRecentMs
			});
			for (const key of archivedKeys) {
				const archivedEntry = store[key];
				if (archivedEntry && capStore[key]) capStore[key] = archivedEntry;
			}
			capped = capEntryCount(capStore, Object.keys(capStore).length - overflow, {
				log: false,
				onCapped: rememberRemoval("capped"),
				preserveKeys,
				preserveRecentMs: maintenance.preserveRecentMs
			});
		}
	}
	const selectedKeys = uniqueStrings([...archivedKeys, ...removalReasons.keys()]);
	const selectedEntryRows = readSessionEntryStore(database, { sessionKeys: selectedKeys });
	const selectedEntries = params.planOnly === true ? Object.fromEntries(Object.entries(selectedEntryRows).map(([key, entry]) => [key, cloneSessionEntry(entry)])) : selectedEntryRows;
	const plannedEntryArchives = [];
	const archivedWorktrees = [];
	for (const key of archivedKeys) {
		const entry = selectedEntries[key];
		const planned = store[key];
		if (!entry || !planned?.archivedAt) continue;
		const expectedEntry = params.planOnly === true ? cloneSessionEntry(entry) : void 0;
		entry.archivedAt = planned.archivedAt;
		if (params.planOnly === true) plannedEntryArchives.push({sessionKey: key, expectedEntry, entry: cloneSessionEntry(entry)});
		else writeSessionEntry(database, key, entry);
		if (entry.worktree) archivedWorktrees.push({
			entry: cloneSessionEntry(entry),
			sessionKey: key,
			storePath: params.storePath
		});
	}
	const removals = [...removalReasons].flatMap(([sessionKey, maintenanceReason]) => {
		const expectedEntry = selectedEntries[sessionKey];
		return expectedEntry ? [{
			expectedEntry,
			maintenanceReason,
			sessionKey
		}] : [];
	});
	if (removals.length === 0) return {
		...params.planOnly === true ? { plannedEntryArchives } : {},
		...archivedWorktrees.length ? { archivedWorktrees } : {},
		entryRemovals: [],
		stateDeletePlans: [],
		archived,
		modelRunPruned: 0,
		pruned: 0,
		capped: 0
	};
	const removedSessionIds = /* @__PURE__ */ new Set();
	for (const removal of removals) for (const sessionId of collectSessionStateIdsForEntry(removal.expectedEntry)) removedSessionIds.add(sessionId);
	for (const sessionId of readSessionGenerationIdsForKeys(database, removals.map((removal) => removal.sessionKey))) removedSessionIds.add(sessionId);
	const referencedSessionIds = collectProjectedReferencedSessionIds({
		database,
		excludedSessionKeys: removals.map((removal) => removal.sessionKey),
		projectedStore: {}
	});
	const deletePlans = [];
	for (const sessionId of removedSessionIds) {
		const plan = planSessionStateDeleteIfUnreferenced({
			archiveTranscript: true,
			archiveDirectory: params.archiveDirectory,
			database,
			referencedSessionIds,
			sessionId
		});
		if (plan) deletePlans.push(plan);
	}
	return {
		...params.planOnly === true ? { plannedEntryArchives } : {},
		...archivedWorktrees.length ? { archivedWorktrees } : {},
		entryRemovals: removals,
		stateDeletePlans: deletePlans,
		archived,
		modelRunPruned,
		pruned,
		capped
	};
}
/** Finalizes maintenance after its caller releases the per-store writer lane. */
async function finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort(scope, plans, options = {}) {
	const isCurrent = options.isCurrent ?? (() => true);
	const committedCounts = {
		archived: plans.reduce((count, plan) => count + plan.archived, 0),
		modelRunPruned: 0,
		pruned: 0,
		capped: 0
	};
	const emptyResult = () => ({
		archivedTranscripts: [],
		...committedCounts
	});
	if (!isCurrent()) return emptyResult();
	const archivedWorktrees = plans.flatMap((plan) => plan.archivedWorktrees ?? []);
	if (archivedWorktrees.length) {
		const { cleanUpAutomaticallyArchivedWorktrees } = await import("./session-worktree-lifecycle-CFTDZDMU.js");
		if (!isCurrent()) return emptyResult();
		await cleanUpAutomaticallyArchivedWorktrees(scope, archivedWorktrees);
	}
	const entryRemovals = plans.flatMap((plan) => plan.entryRemovals);
	const stateDeletePlans = plans.flatMap((plan) => plan.stateDeletePlans);
	const warn = (message, error, warnedStateDeletePlans) => {
		getChildLogger({ subsystem: "session-sqlite" }).warn(message, {
			agentId: scope.agentId,
			error,
			path: scope.path,
			sessionIds: uniqueStrings(warnedStateDeletePlans.map((plan) => plan.sessionId))
		});
	};
	if (!isCurrent()) return emptyResult();
	if (entryRemovals.length === 0 && stateDeletePlans.length === 0) {
		await refreshSqliteSessionPlannerStatisticsBestEffort(scope, options.deletedEntriesBeforeMaintenance ?? 0, { isCurrent });
		return emptyResult();
	}
	let archiveBytesBySessionId;
	try {
		archiveBytesBySessionId = await readSessionTranscriptJsonlBytes(scope, stateDeletePlans.filter((plan) => plan.archiveTranscript).map((plan) => plan.sessionId), isCurrent);
	} catch (error) {
		warn("SQLite session maintenance archive sizing failed", error, stateDeletePlans);
		await refreshSqliteSessionPlannerStatisticsBestEffort(scope, options.deletedEntriesBeforeMaintenance ?? 0, { isCurrent });
		return emptyResult();
	}
	if (!isCurrent()) return emptyResult();
	const publishedTranscripts = [];
	let deletedEntries = options.deletedEntriesBeforeMaintenance ?? 0;
	for (const batch of buildSessionMaintenanceBatches({
		archiveBytesBySessionId,
		entryRemovals,
		stateDeletePlans
	})) {
		if (!isCurrent()) break;
		let archivedTranscripts;
		let changedEntryRemovals = [];
		let committedEntryRemovals = batch.entryRemovals;
		try {
			const materializedPlans = await materializeSessionStateDeletePlans(batch.stateDeletePlans);
			if (!isCurrent()) break;
			archivedTranscripts = await withSqliteSessionDeletions(scope, batch.entryRemovals.flatMap(({ expectedEntry: entry, sessionKey }) => entry ? [{
				entry,
				sessionKey
			}] : []), async () => await runExclusiveSqliteSessionWrite(scope, async () => {
				if (!isCurrent()) return [];
				let committed = [];
				runSqliteSessionDeletionTransaction((database) => {
					const partition = partitionUnchangedPlannedLifecycleArtifactEntries(database, batch.entryRemovals);
					changedEntryRemovals = partition.changed;
					committedEntryRemovals = partition.unchanged;
					committed = deleteMaterializedSessionStatePlans(database, materializedPlans, void 0, new Set(committedEntryRemovals.map((removal) => removal.sessionKey)));
					deletePlannedLifecycleArtifactEntries(database, committedEntryRemovals);
				}, toDatabaseOptions(scope));
				return committed;
			}));
		} catch (error) {
			warn("SQLite session maintenance cleanup failed", error, batch.stateDeletePlans);
			break;
		}
		if (!isCurrent()) break;
		if (changedEntryRemovals.length > 0) getChildLogger({ subsystem: "session-sqlite" }).warn("SQLite session maintenance skipped changed entries", {
			agentId: scope.agentId,
			path: scope.path,
			sessionKeys: changedEntryRemovals.map((removal) => removal.sessionKey)
		});
		deletedEntries += batch.workItems - (batch.entryRemovals.length - committedEntryRemovals.length);
		emitCommittedSessionEntryRemovals(committedEntryRemovals);
		for (const removal of committedEntryRemovals) if (removal.maintenanceReason === "model-run-pruned") committedCounts.modelRunPruned += 1;
		else if (removal.maintenanceReason === "pruned") committedCounts.pruned += 1;
		else if (removal.maintenanceReason === "capped") committedCounts.capped += 1;
		try {
			publishedTranscripts.push(...await publishSessionStateArchives(scope, archivedTranscripts));
		} catch (error) {
			warn("SQLite session maintenance archive publication failed", error, batch.stateDeletePlans);
		}
	}
	if (isCurrent()) await refreshSqliteSessionPlannerStatisticsBestEffort(scope, deletedEntries, { isCurrent });
	return {
		archivedTranscripts: publishedTranscripts,
		...committedCounts
	};
}
//#endregion
//#region src/config/sessions/session-history-eviction.ts
function createPhysicalBudgetResult(params) {
	const totalBytesAfter = params.totalBytesAfter ?? params.totalBytesBefore;
	return {
		totalBytesBefore: params.totalBytesBefore,
		totalBytesAfter,
		removedFiles: params.removedFiles ?? 0,
		removedEntries: params.removedEntries ?? 0,
		freedBytes: Math.max(0, params.totalBytesBefore - totalBytesAfter),
		maxBytes: params.maxBytes,
		highWaterBytes: params.highWaterBytes,
		overBudget: params.totalBytesBefore > params.maxBytes
	};
}
/** Reports the same physical total enforce mode compares, without projecting logical row bytes. */
async function inspectSqliteSessionHistoryDiskBudget(params) {
	const { highWaterBytes, maxDiskBytes } = params.maintenance;
	if (maxDiskBytes == null || highWaterBytes == null) return {
		diskBudget: null,
		wouldMutate: false
	};
	const diskBudget = createPhysicalBudgetResult({
		totalBytesBefore: (await measureSessionPhysicalDiskUsage(params.storePath)).totalBytes,
		maxBytes: maxDiskBytes,
		highWaterBytes
	});
	if (!diskBudget.overBudget || params.mode !== "enforce") return {
		diskBudget,
		wouldMutate: false
	};
	const resolved = resolveSqliteScope({
		...params.agentId ? { agentId: params.agentId } : {},
		sessionKey: "",
		storePath: params.storePath
	});
	const databaseOptions = toDatabaseOptions(resolved);
	if (hasCanonicalSessionTranscriptArchives(databaseOptions) || await hasRetainedSessionTranscriptArchives(params.storePath)) return {
		diskBudget,
		wouldMutate: true
	};
	return {
		diskBudget,
		wouldMutate: readHistoricalSessionIds({
			databaseOptions,
			preserveRecentMs: params.maintenance.preserveRecentMs,
			storePath: params.storePath
		}).length > 0
	};
}
function collectProtectedHistoricalSessionIds(params) {
	const protectedSessionIds = readReferencedSessionIds(params.database);
	for (const sessionId of collectAdmissionProtectedSessionIds(params)) protectedSessionIds.add(sessionId);
	return protectedSessionIds;
}
function collectRecentSessionHistoryIds(params) {
	if (params.preserveRecentMs == null) return /* @__PURE__ */ new Set();
	const db = getSessionKysely(params.database.db);
	const rows = executeSqliteQuerySync(params.database.db, db.selectFrom("session_windows").innerJoin("session_nodes", "session_nodes.session_key", "session_windows.session_key").select([
		"session_nodes.current_session_id",
		"session_nodes.entry_json",
		"session_nodes.session_key",
		"session_nodes.updated_at",
		"session_windows.session_id"
	])).rows;
	return new Set(rows.flatMap((row) => {
		const entry = parseSessionEntryJson(row);
		return entry && isRecentSessionMaintenanceEntry({
			key: row.session_key,
			entry,
			preserveRecentMs: params.preserveRecentMs
		}) ? [row.session_id] : [];
	}));
}
function isRecentHistoricalSessionId(params) {
	if (params.preserveRecentMs == null) return false;
	const db = getSessionKysely(params.database.db);
	const row = executeSqliteQuerySync(params.database.db, db.selectFrom("session_windows").innerJoin("session_nodes", "session_nodes.session_key", "session_windows.session_key").select([
		"session_nodes.current_session_id",
		"session_nodes.entry_json",
		"session_nodes.session_key",
		"session_nodes.updated_at"
	]).where("session_windows.session_id", "=", params.sessionId)).rows[0];
	if (!row) return false;
	const entry = parseSessionEntryJson(row);
	return Boolean(entry && isRecentSessionMaintenanceEntry({
		key: row.session_key,
		entry,
		preserveRecentMs: params.preserveRecentMs
	}));
}
function collectCandidateProtectedHistoricalSessionIds(params) {
	const protectedSessionIds = collectProtectedHistoricalSessionIds(params);
	if (isRecentHistoricalSessionId(params)) protectedSessionIds.add(params.sessionId);
	return protectedSessionIds;
}
/** Session ids owned by in-flight work admissions, without live-reference protection. */
function collectAdmissionProtectedSessionIds(params) {
	const protectedSessionIds = /* @__PURE__ */ new Set();
	const admissionIdentities = collectActiveSessionWorkAdmissions().get(params.storePath) ?? /* @__PURE__ */ new Set();
	if (admissionIdentities.size === 0) return protectedSessionIds;
	for (const identity of admissionIdentities) protectedSessionIds.add(identity);
	const normalizedAdmissionKeys = new Set([...admissionIdentities].map((identity) => normalizeStoreSessionKey(identity)));
	const db = getSessionKysely(params.database.db);
	const rows = executeSqliteQuerySync(params.database.db, db.selectFrom("session_nodes").select([
		"entry_json",
		"current_session_id",
		"session_key"
	])).rows;
	for (const row of rows) {
		if (!normalizedAdmissionKeys.has(normalizeStoreSessionKey(row.session_key))) continue;
		protectedSessionIds.add(row.current_session_id);
		const entry = parseSessionEntryJson(row);
		if (entry) for (const sessionId of collectSessionStateIdsForEntry(entry)) protectedSessionIds.add(sessionId);
	}
	const generationRows = executeSqliteQuerySync(params.database.db, db.selectFrom("session_windows").select(["session_id", "session_key"])).rows;
	for (const row of generationRows) if (normalizedAdmissionKeys.has(normalizeStoreSessionKey(row.session_key))) protectedSessionIds.add(row.session_id);
	return protectedSessionIds;
}
function readHistoricalSessionIds(params) {
	const database = openOpenClawAgentDatabase(params.databaseOptions);
	const scope = {
		...params,
		database
	};
	const protectedSessionIds = collectProtectedHistoricalSessionIds(scope);
	for (const sessionId of collectRecentSessionHistoryIds(scope)) protectedSessionIds.add(sessionId);
	const db = getSessionKysely(database.db);
	return executeSqliteQuerySync(database.db, db.selectFrom("session_windows").select("session_id").orderBy("updated_at", "asc").orderBy("session_id", "asc")).rows.flatMap((row) => protectedSessionIds.has(row.session_id) ? [] : [row.session_id]);
}
function reclaimSqliteFreePages(databaseOptions) {
	const database = openOpenClawAgentDatabase(databaseOptions);
	database.walMaintenance.checkpoint();
	const row = database.db.prepare("PRAGMA freelist_count").get();
	const freePages = Number(row?.freelist_count ?? 0);
	if (Number.isSafeInteger(freePages) && freePages > 0) database.db.exec(`PRAGMA incremental_vacuum(${freePages});`);
	database.walMaintenance.checkpoint();
}
function hasCanonicalSessionTranscriptArchives(databaseOptions) {
	const database = openOpenClawAgentDatabase(databaseOptions);
	const db = getSessionKysely(database.db);
	if (!executeSqliteQuerySync(database.db, db.selectFrom("sqlite_schema").select("name").where("type", "=", "table").where("name", "=", "session_transcript_archives")).rows[0]) return false;
	return executeSqliteQuerySync(database.db, db.selectFrom("session_transcript_archives").select("session_id").where("published_at", "is not", null).limit(1)).rows.length > 0;
}
function readUnpublishedSessionTranscriptArchiveNames(databaseOptions) {
	const database = openOpenClawAgentDatabase(databaseOptions);
	const db = getSessionKysely(database.db);
	if (!executeSqliteQuerySync(database.db, db.selectFrom("sqlite_schema").select("name").where("type", "=", "table").where("name", "=", "session_transcript_archives")).rows[0]) return /* @__PURE__ */ new Set();
	return new Set(executeSqliteQuerySync(database.db, db.selectFrom("session_transcript_archives").select("archive_name").where("published_at", "is", null)).rows.map((row) => row.archive_name));
}
async function pruneCanonicalSessionTranscriptArchivesToHighWater(params) {
	let usage = await measureSessionPhysicalDiskUsage(params.storePath);
	let removedFiles = 0;
	while (usage.totalBytes > params.highWaterBytes) {
		const database = openOpenClawAgentDatabase(params.databaseOptions);
		const db = getSessionKysely(database.db);
		const row = executeSqliteQuerySync(database.db, db.selectFrom("session_transcript_archives").select([
			"archive_name",
			"generation",
			"session_id"
		]).where("published_at", "is not", null).orderBy("created_at", "asc").orderBy("session_id", "asc").orderBy("generation", "asc").limit(1)).rows[0];
		if (!row) break;
		const archivePath = path.resolve(params.archiveDirectory, row.archive_name);
		if (path.dirname(archivePath) !== path.resolve(params.archiveDirectory) || path.basename(archivePath) !== row.archive_name) throw new Error(`Invalid canonical session archive name for ${row.session_id}`);
		try {
			await fs.promises.rm(archivePath);
			removedFiles += 1;
		} catch (error) {
			if (error.code !== "ENOENT") break;
		}
		runOpenClawAgentWriteTransaction((transactionDb) => {
			const transactionKysely = getSessionKysely(transactionDb.db);
			executeSqliteQuerySync(transactionDb.db, transactionKysely.deleteFrom("session_transcript_archives").where("session_id", "=", row.session_id).where("generation", "=", row.generation));
		}, params.databaseOptions);
		reclaimSqliteFreePages(params.databaseOptions);
		usage = await measureSessionPhysicalDiskUsage(params.storePath);
	}
	return {
		removedFiles,
		usage
	};
}
async function pruneAllSessionTranscriptArchivesToHighWater(params) {
	let canonical = {
		removedFiles: 0,
		usage: await measureSessionPhysicalDiskUsage(params.storePath)
	};
	if (hasCanonicalSessionTranscriptArchives(params.databaseOptions)) canonical = await pruneCanonicalSessionTranscriptArchivesToHighWater(params);
	if (canonical.usage.totalBytes <= params.highWaterBytes) return canonical;
	const legacy = await pruneSessionTranscriptArchivesToHighWater({
		excludeNames: readUnpublishedSessionTranscriptArchiveNames(params.databaseOptions),
		highWaterBytes: params.highWaterBytes,
		storePath: params.storePath
	});
	return {
		removedFiles: canonical.removedFiles + legacy.removedFiles,
		usage: legacy.usage
	};
}
const log = createSubsystemLogger("sessions/history-eviction");
const PHYSICAL_BUDGET_CHECK_INTERVAL_MS = 18e5;
const budgetKickStateByStore = /* @__PURE__ */ new Map();
/** Fire-and-forget budget pass from the ordinary entry-write maintenance seam. */
function kickSessionHistoryDiskBudgetMaintenance(params) {
	if (params.agentId && isIncognitoOpenClawAgentSqlitePath(params.storePath, { agentId: params.agentId })) return;
	const maintenance = params.maintenanceConfig ?? resolveMaintenanceConfig();
	if (maintenance.mode !== "enforce" || maintenance.maxDiskBytes == null || maintenance.highWaterBytes == null) return;
	const now = params.now ?? Date.now();
	const state = budgetKickStateByStore.get(params.storePath) ?? {
		lastCheckAt: 0,
		running: false,
		pendingForce: false
	};
	if (state.running) {
		state.pendingForce = state.pendingForce || params.force === true;
		budgetKickStateByStore.set(params.storePath, state);
		return;
	}
	if (!params.force && now - state.lastCheckAt < PHYSICAL_BUDGET_CHECK_INTERVAL_MS) return;
	state.lastCheckAt = now;
	state.running = true;
	budgetKickStateByStore.set(params.storePath, state);
	enforceSqliteSessionHistoryDiskBudget({
		...params.agentId ? { agentId: params.agentId } : {},
		storePath: params.storePath,
		mode: maintenance.mode,
		maintenance
	}).catch((error) => {
		log.warn("session history disk-budget sweep failed; retrying on next kick", {
			error,
			storePath: params.storePath
		});
	}).finally(() => {
		state.running = false;
		if (state.pendingForce) {
			state.pendingForce = false;
			kickSessionHistoryDiskBudgetMaintenance({
				...params,
				force: true
			});
		}
	});
}
const SESSION_HISTORY_MAINTENANCE_QUEUES = /* @__PURE__ */ new Map();
/** Extracts historical sessions durably before reclaiming their SQLite rows. */
async function enforceSqliteSessionHistoryDiskBudget(params) {
	return await runQueuedStoreWrite({
		queues: SESSION_HISTORY_MAINTENANCE_QUEUES,
		storePath: params.storePath,
		label: "enforceSqliteSessionHistoryDiskBudget",
		fn: async () => await enforceSessionHistoryMaintenanceSerialized(params)
	});
}
async function enforceSessionHistoryMaintenanceSerialized(params) {
	const { highWaterBytes, maxDiskBytes } = params.maintenance;
	if (maxDiskBytes == null || highWaterBytes == null) return null;
	const initialUsage = await measureSessionPhysicalDiskUsage(params.storePath);
	if (initialUsage.totalBytes <= maxDiskBytes || params.mode === "warn") return createPhysicalBudgetResult({
		totalBytesBefore: initialUsage.totalBytes,
		maxBytes: maxDiskBytes,
		highWaterBytes
	});
	const resolved = resolveSqliteScope({
		...params.agentId ? { agentId: params.agentId } : {},
		sessionKey: "",
		storePath: params.storePath
	});
	const databaseOptions = toDatabaseOptions(resolved);
	const archiveDirectory = resolveSqliteTranscriptArchiveDirectory(resolved);
	let usage = await runExclusiveSqliteSessionWrite(resolved, async () => {
		reclaimSqliteFreePages(databaseOptions);
		return await measureSessionPhysicalDiskUsage(params.storePath);
	});
	let removedEntries = 0;
	let removedFiles = 0;
	if (usage.totalBytes > highWaterBytes) {
		const archiveSweep = await runExclusiveSqliteSessionWrite(resolved, async () => pruneAllSessionTranscriptArchivesToHighWater({
			archiveDirectory,
			databaseOptions,
			highWaterBytes,
			storePath: params.storePath
		}));
		removedFiles = archiveSweep.removedFiles;
		usage = archiveSweep.usage;
	}
	const candidates = readHistoricalSessionIds({
		databaseOptions,
		preserveRecentMs: params.maintenance.preserveRecentMs,
		storePath: params.storePath
	});
	for (const sessionId of candidates) {
		if (usage.totalBytes <= highWaterBytes) break;
		const eviction = await runExclusiveSessionLifecycleMutation({
			scope: params.storePath,
			identities: [sessionId],
			run: async () => {
				const plan = await runExclusiveSqliteSessionWrite(resolved, async () => {
					const database = openOpenClawAgentDatabase(databaseOptions);
					const protectedBeforeArchive = collectCandidateProtectedHistoricalSessionIds({
						database,
						preserveRecentMs: params.maintenance.preserveRecentMs,
						sessionId,
						storePath: params.storePath
					});
					return planSessionStateDeleteIfUnreferenced({
						archiveDirectory,
						archiveTranscript: true,
						database,
						reason: "deleted",
						referencedSessionIds: protectedBeforeArchive,
						sessionId
					});
				});
				if (!plan) return null;
				const materialized = await materializeSessionStateDeletePlans([plan]);
				const committedArchives = await runExclusiveSqliteSessionWrite(resolved, async () => {
					let deleted = false;
					let archivedTranscripts = [];
					runOpenClawAgentWriteTransaction((transactionDb) => {
						const protectedAtDelete = collectCandidateProtectedHistoricalSessionIds({
							database: transactionDb,
							preserveRecentMs: params.maintenance.preserveRecentMs,
							sessionId,
							storePath: params.storePath
						});
						archivedTranscripts = deleteMaterializedSessionStatePlans(transactionDb, materialized, protectedAtDelete);
						const db = getSessionKysely(transactionDb.db);
						deleted = executeSqliteQuerySync(transactionDb.db, db.selectFrom("session_windows").select("session_id").where("session_id", "=", sessionId)).rows.length === 0;
					}, databaseOptions);
					if (!deleted) return null;
					try {
						reclaimSqliteFreePages(databaseOptions);
					} catch {}
					return archivedTranscripts;
				});
				if (!committedArchives) return null;
				return { archivedTranscripts: committedArchives };
			}
		});
		if (!eviction) continue;
		const publishedArchives = await publishSessionStateArchives(resolved, eviction.archivedTranscripts);
		removedEntries += 1;
		emitArchivedTranscriptUpdates(publishedArchives);
		usage = await measureSessionPhysicalDiskUsage(params.storePath);
		if (usage.totalBytes > highWaterBytes) {
			const repruned = await runExclusiveSqliteSessionWrite(resolved, async () => pruneAllSessionTranscriptArchivesToHighWater({
				archiveDirectory,
				databaseOptions,
				highWaterBytes,
				storePath: params.storePath
			}));
			removedFiles += repruned.removedFiles;
			usage = repruned.usage;
		}
	}
	if (usage.totalBytes > highWaterBytes) {
		const finalPrune = await runExclusiveSqliteSessionWrite(resolved, async () => pruneAllSessionTranscriptArchivesToHighWater({
			archiveDirectory,
			databaseOptions,
			highWaterBytes,
			storePath: params.storePath
		}));
		removedFiles += finalPrune.removedFiles;
		usage = finalPrune.usage;
	}
	if (removedEntries > 0) {
		await refreshSqliteSessionPlannerStatisticsBestEffort(resolved, removedEntries);
		usage = await measureSessionPhysicalDiskUsage(params.storePath);
	}
	return createPhysicalBudgetResult({
		totalBytesBefore: initialUsage.totalBytes,
		totalBytesAfter: usage.totalBytes,
		removedEntries,
		removedFiles,
		maxBytes: maxDiskBytes,
		highWaterBytes
	});
}
//#endregion
export { applySessionEntryMaintenance as a, emitCommittedLifecycleIdentityMutations as c, emitSessionIdentityMutation as d, emitSessionLifecycleEvent as f, readSessionLifecycleVersion as g, readSessionIdentityMutationVersion as h, kickSessionHistoryDiskBudgetMaintenance as i, emitCommittedSessionEntryRemovals as l, onSessionLifecycleEvent as m, enforceSqliteSessionHistoryDiskBudget as n, finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort as o, onSessionIdentityMutation as p, inspectSqliteSessionHistoryDiskBudget as r, refreshSqliteSessionPlannerStatisticsBestEffort as s, collectAdmissionProtectedSessionIds as t, emitCommittedSessionIdentityDiff as u };

// Automatic planning is read-only. Revalidate exact entry snapshots at commit.
export function commitPlannedSessionMaintenanceArchives(database, plan) {
  const pending = plan.plannedEntryArchives ?? [];
  const {unchanged} = partitionUnchangedPlannedLifecycleArtifactEntries(database, pending);
  const committedKeys = new Set(unchanged.map(item => item.sessionKey));
  for (const item of unchanged) writeSessionEntry(database, item.sessionKey, item.entry);
  const {plannedEntryArchives, ...committed} = plan;
  return {...committed, archived: unchanged.length,
    ...(plan.archivedWorktrees ? {archivedWorktrees: plan.archivedWorktrees.filter(item => committedKeys.has(item.sessionKey))} : {})};
}
