import "./src-vebZIeLe.js";
import { t as expectDefined } from "./expect-CyE8FADM.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { i as listAgentEntries } from "./agent-scope-config-CUiGBd59.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { O as parseAgentSessionKey } from "./session-key-CRjxKW0X.js";
import { t as isIncognitoSessionKey } from "./incognito-session-key-BwpD1Lwd.js";
import { o as resolveSessionStorePathCore } from "./paths-DDTeIhCT.js";
import { n as resolveSessionStoreCompatibilityAgentId } from "./legacy.default-agent-owner-BMzvJbjU.js";
import "./agent-scope-CSlN0kZb.js";
import { H as listOpenClawRegisteredAgentDatabases, U as readOpenClawAgentDatabaseRegistryToken } from "./openclaw-agent-db-maintenance-DYSkzMMg.js";
import { _ as readOpenIncognitoAgentDatabaseGeneration, h as listOpenIncognitoAgentDatabases } from "./openclaw-agent-db-CUTe8BX6.js";
import { a as listSessionEntriesReadOnly, t as countSessionEntryRowsReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { o as resolveDeliveryProvenCanonicalSessionKey, u as resolveSqliteTargetFromSessionStorePath } from "./store-entry-CMuTqREZ.js";
import { m as canonicalSessionKeyMigrationRequiredError, listCanonicalSessionKeyValidatedPaths } from "./session-accessor.sqlite-transcript-state-Cz9g7S9v.js";
import { i as openOpenClawStateDatabase } from "./openclaw-state-db-Bh3Bq87y.js";
import { Worker } from "node:worker_threads";
import "./session-accessor-K0XuW6ln.js";
import { i as resolveStoredSessionKeyForAgentStore, n as resolveSessionStoreAgentId, r as resolveSessionStoreKey } from "./session-store-key-DVtVp9hU.js";
import { t as listSessionEntriesCore } from "./session-accessor.entry-B8arwR7t.js";
import { listSessionEntriesMatchingReadOnly } from "./v-session-entries-matching.mjs";
import { d as dedupeSessionStoreTargetsBySqliteTarget, i as resolveAgentSessionStoreTargetsSync, n as listConfiguredSessionStoreAgentIds, o as resolveAllAgentSessionStoreTargetsSync, r as listKnownSessionStoreAgentIds } from "./targets-M9xRkscp.js";
//#region src/config/sessions/combined-store-gateway.ts
let preparedConfiguredSessionStoreTargets;
function isStorePathTemplate(store) {
	return typeof store === "string" && store.includes("{agentId}");
}
function resolveCombinedStorePath(paths, storeConfig) {
	return paths.length === 1 ? expectDefined(paths[0], "store path at 0") : typeof storeConfig === "string" && storeConfig.trim() ? storeConfig.trim() : "(multiple)";
}
function resolveCombinedDatabasePath(targets, defaultAgentId, physicallyDeduped = false) {
	if (physicallyDeduped && targets.length !== 1) return "(multiple)";
	const paths = [...new Set(targets.map((target) => resolveSqliteTargetFromSessionStorePath(target.storePath, {
		agentId: target.agentId,
		defaultAgentId
	}).path))];
	return paths.length === 1 ? expectDefined(paths[0], "database path at 0") : "(multiple)";
}
function loadGatewayStoreEntries(params) {
	// sessions-visibility-columns-v1: projection "visibility" is the list projection read from promoted columns.
	const projection = params.projection === "visibility" ? "list" : params.projection;
	// sessions-search-exact-read: a search reads only the rows it can match (durable stores).
	if (params.match && !params.includeOpenDatabases) return listSessionEntriesMatchingReadOnly({
		agentId: params.agentId,
		clone: false,
		projection,
		storePath: params.storePath
	}, params.match);
	return (params.includeOpenDatabases ? listSessionEntriesCore : listSessionEntriesReadOnly)({
		agentId: params.agentId,
		clone: false,
		projection,
		...params.projection === "visibility" ? { visibilityColumns: true } : {},
		storePath: params.storePath
	});
}
function mergeSessionEntryIntoCombined(params) {
	const { cfg, combined, entry, agentId, canonicalKey } = params;
	const existing = combined[canonicalKey];
	if (existing && (canonicalKey === "global" || canonicalKey === "unknown")) return;
	if (existing) throw canonicalSessionKeyMigrationRequiredError(`duplicate rows resolve to canonical session key ${canonicalKey}`);
	const deliveryCanonicalKey = resolveDeliveryProvenCanonicalSessionKey(canonicalKey, entry);
	if (deliveryCanonicalKey !== canonicalKey) throw canonicalSessionKeyMigrationRequiredError(`non-canonical persisted row resolves to session key ${deliveryCanonicalKey}`);
	const resolveLineageKey = (sessionKey) => sessionKey ? resolveSessionStoreKey({
		cfg,
		sessionKey,
		storeAgentId: agentId
	}) : void 0;
	combined[canonicalKey] = {
		...entry,
		...entry.parentSessionKey ? { parentSessionKey: resolveLineageKey(entry.parentSessionKey) } : {},
		...entry.spawnedBy ? { spawnedBy: resolveLineageKey(entry.spawnedBy) } : {}
	};
	params.agentIdBySessionKey.set(canonicalKey, agentId);
}
function mergeOpenIncognitoStores(params) {
	const storePaths = [];
	for (const target of params.targets) {
		const store = loadGatewayStoreEntries({
			agentId: target.agentId,
			includeOpenDatabases: true,
			projection: params.projection,
			storePath: target.storePath
		});
		let merged = false;
		for (const { sessionKey, entry } of store) {
			if (!isIncognitoSessionKey(sessionKey) || entry.incognito !== true) continue;
			mergeSessionEntryIntoCombined({
				cfg: params.cfg,
				combined: params.combined,
				agentIdBySessionKey: params.agentIdBySessionKey,
				entry,
				agentId: target.agentId,
				canonicalKey: sessionKey
			});
			merged = true;
		}
		if (merged) storePaths.push(target.storePath);
	}
	return storePaths;
}
function filterCombinedStoreToConfiguredAgents(params) {
	const isConfiguredSessionKey = (key) => {
		const normalizedKey = normalizeOptionalString(key);
		if (!normalizedKey) return false;
		const canonicalKey = resolveSessionStoreKey({
			cfg: params.cfg,
			sessionKey: normalizedKey
		});
		const agentId = resolveSessionStoreAgentId(params.cfg, canonicalKey);
		return params.configuredAgentIds.has(normalizeAgentId(agentId));
	};
	for (const [key, entry] of Object.entries(params.store)) if (!(key === "global" || key === "unknown" || isConfiguredSessionKey(key) || isConfiguredSessionKey(entry.spawnedBy) || isConfiguredSessionKey(entry.parentSessionKey))) {
		delete params.store[key];
		params.agentIdBySessionKey.delete(key);
	}
}
function resolvePreparedConfiguredSessionStoreTargets(cfg, includeIncognito) {
	const registryToken = readOpenClawAgentDatabaseRegistryToken();
	const incognitoGeneration = readOpenIncognitoAgentDatabaseGeneration();
	const cached = preparedConfiguredSessionStoreTargets;
	if (cached?.cfg === cfg && cached.registryToken === registryToken && cached.incognitoGeneration === incognitoGeneration && cached.includeIncognito === includeIncognito) return cached.resolved;
	const storeConfig = cfg.session?.store;
	const defaultAgentId = normalizeAgentId(resolveSessionStoreCompatibilityAgentId(cfg));
	const configuredIds = listConfiguredSessionStoreAgentIds(cfg);
	const configuredAgentIds = new Set(configuredIds);
	const incognitoTargets = includeIncognito ? listOpenIncognitoAgentDatabases() : [];
	const incognitoTargetKeys = new Set(incognitoTargets.map((target) => `${target.agentId}\0${target.storePath}`));
	const diagnostics = [];
	const candidates = dedupeSessionStoreTargetsBySqliteTarget([
		...listOpenClawRegisteredAgentDatabases().map(({ agentId, path }) => ({
			agentId,
			storePath: path
		})),
		...configuredIds.map((agentId) => ({
			agentId,
			storePath: resolveSessionStorePathCore(storeConfig, { agentId })
		})),
		...incognitoTargets
	], {
		defaultAgentId,
		onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.message)
	});
	const durableTargets = candidates.filter((target) => !incognitoTargetKeys.has(`${target.agentId}\0${target.storePath}`));
	const resolved = Object.freeze({
		configuredAgentIds,
		defaultAgentId,
		diagnostics: Object.freeze(diagnostics),
		durableStorePath: resolveCombinedDatabasePath(durableTargets, defaultAgentId, true),
		durableTargets: Object.freeze(durableTargets.map((target) => Object.freeze({ ...target }))),
		incognitoTargets: Object.freeze(candidates.filter((target) => incognitoTargetKeys.has(`${target.agentId}\0${target.storePath}`)).map((target) => Object.freeze({ ...target }))),
		storeConfig
	});
	preparedConfiguredSessionStoreTargets = {
		cfg,
		includeIncognito,
		incognitoGeneration,
		registryToken,
		resolved
	};
	return resolved;
}
function resolveGatewaySessionStoreTargets(cfg, opts) {
	const storeConfig = cfg.session?.store;
	const diagnostics = [];
	const requestedAgentId = typeof opts.agentId === "string" && opts.agentId.trim() ? normalizeAgentId(opts.agentId) : void 0;
	if (opts.configuredAgentsOnly === true && !requestedAgentId) return resolvePreparedConfiguredSessionStoreTargets(cfg, opts.includeIncognito !== false);
	const defaultAgentId = normalizeAgentId(resolveSessionStoreCompatibilityAgentId(cfg));
	const incognitoTargets = opts.includeIncognito === false ? [] : listOpenIncognitoAgentDatabases().filter((target) => !requestedAgentId || target.agentId === requestedAgentId);
	if (storeConfig && !isStorePathTemplate(storeConfig)) {
		const ownerIds = [.../* @__PURE__ */ new Set([
			...listAgentEntries(cfg).map((entry) => normalizeAgentId(entry.id)),
			...listKnownSessionStoreAgentIds(cfg),
			defaultAgentId,
			...requestedAgentId ? [requestedAgentId] : []
		])];
		return {
			defaultAgentId,
			diagnostics,
			durableTargets: dedupeSessionStoreTargetsBySqliteTarget(ownerIds.map((agentId) => ({
				agentId,
				storePath: resolveSessionStorePathCore(storeConfig, { agentId })
			})), {
				defaultAgentId,
				onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.message)
			}),
			incognitoTargets,
			requestedAgentId,
			storeConfig
		};
	}
	return {
		defaultAgentId,
		diagnostics,
		durableTargets: requestedAgentId ? dedupeSessionStoreTargetsBySqliteTarget(resolveAgentSessionStoreTargetsSync(cfg, requestedAgentId), { defaultAgentId }) : resolveAllAgentSessionStoreTargetsSync(cfg),
		incognitoTargets,
		requestedAgentId,
		storeConfig
	};
}
/** Checks whether Gateway prewarm can project the selected stores within a bounded row budget. */
function canPrewarmCombinedSessionStoresForGateway(cfg, params) {
	let totalRows = 0;
	for (const agentId of params.agentIds) {
		const resolved = resolveGatewaySessionStoreTargets(cfg, { agentId });
		const projectionTargets = resolved.incognitoTargets.length === 0 ? resolved.durableTargets : dedupeSessionStoreTargetsBySqliteTarget([...resolved.durableTargets, ...resolved.incognitoTargets], { defaultAgentId: resolved.defaultAgentId });
		for (const target of projectionTargets) {
			totalRows += countSessionEntryRowsReadOnly(target);
			if (totalRows > params.maxRows) return false;
		}
	}
	return true;
}
/** Reads every durable target and merges its canonical rows into combined (the durable part of loadCombinedSessionStoreForGatewayCore). */
function mergeDurableGatewayStores(params) {
	const { cfg, combined, agentIdBySessionKey, durableTargets, requestedAgentId, projection } = params;
	for (const target of durableTargets) {
		const agentId = target.agentId;
		const storePath = target.storePath;
		const store = loadGatewayStoreEntries({
			agentId,
			projection,
			storePath,
			...params.match ? { match: params.match } : {}
		});
		for (const { sessionKey: key, entry } of store) {
			const canonicalKey = resolveStoredSessionKeyForAgentStore({
				cfg,
				agentId,
				sessionKey: key
			});
			if (key !== canonicalKey) throw canonicalSessionKeyMigrationRequiredError(`non-canonical persisted row resolves to session key ${canonicalKey}`);
			const canonicalAgentId = normalizeAgentId(parseAgentSessionKey(canonicalKey)?.agentId ?? agentId);
			if (requestedAgentId && canonicalAgentId !== requestedAgentId) continue;
			mergeSessionEntryIntoCombined({
				cfg,
				combined,
				agentIdBySessionKey,
				entry,
				agentId: canonicalAgentId,
				canonicalKey
			});
		}
	}
}
// workboard-full-sweep: the entry fields sessions.list reads after the merge for a lifecycle listing (lifecycleOnly, no
// activeMinutes, only the parameters sessions-read's LIFECYCLE_SNAPSHOT_LIST_PARAMS allows): the configured-agent
// filter (spawnedBy, parentSessionKey), the selection (archivedAt; the phantom check: sessionId, updatedAt; the
// owner projection: owner, createdActor; the order: pinnedAt, updatedAt), the lifecycle row (updatedAt, sessionId,
// abortedLastRun, status; the row classification: chatType, heartbeatIsolatedBaseSessionKey, spawnedBy) and a
// single row's subagent index (spawnedBy, parentSessionKey).
const LIFECYCLE_SNAPSHOT_ENTRY_FIELDS = [
	"sessionId",
	"updatedAt",
	"archivedAt",
	"pinnedAt",
	"status",
	"abortedLastRun",
	"spawnedBy",
	"parentSessionKey",
	"owner",
	"createdActor",
	"chatType",
	"heartbeatIsolatedBaseSessionKey"
];
/** Runs on the lifecycle snapshot worker: the durable merge with the list projection, kept to the lifecycle fields. */
function readDurableLifecycleSnapshot(params) {
	const combined = {};
	const agentIdBySessionKey = /* @__PURE__ */ new Map();
	mergeDurableGatewayStores({
		cfg: params.cfg,
		combined,
		agentIdBySessionKey,
		durableTargets: params.durableTargets,
		requestedAgentId: params.requestedAgentId,
		projection: "list"
	});
	const entries = [];
	for (const [key, entry] of Object.entries(combined)) {
		const kept = {};
		for (const field of LIFECYCLE_SNAPSHOT_ENTRY_FIELDS) if (Object.hasOwn(entry, field)) kept[field] = entry[field];
		entries.push([key, kept]);
	}
	return {
		entries,
		agentIds: [...agentIdBySessionKey]
	};
}
const LIFECYCLE_SNAPSHOT_WORKER_TIMEOUT_MS = 12e4;
/** The durable part of a lifecycle listing, read and merged on a one-shot worker thread (see readDurableLifecycleSnapshot). */
function readCombinedLifecycleSnapshotInWorker(cfg, opts = {}) {
	const { durableTargets, requestedAgentId } = resolveGatewaySessionStoreTargets(cfg, opts);
	const targets = durableTargets.map((target) => ({
		agentId: target.agentId,
		storePath: target.storePath
	}));
	// The worker reads the persisted subagent runs from the state database this thread has open; without it the
	// rows read them here, as before.
	let stateDatabasePath;
	try {
		stateDatabasePath = openOpenClawStateDatabase().path;
	} catch {}
	return new Promise((resolve, reject) => {
		let settled = false;
		let timer;
		const worker = new Worker(new URL("./v-session-lifecycle-snapshot-worker.mjs", import.meta.url), { workerData: {
			cfg,
			durableTargets: targets,
			requestedAgentId,
			canonicalValidatedPaths: listCanonicalSessionKeyValidatedPaths(),
			...typeof stateDatabasePath === "string" && stateDatabasePath ? { stateDatabasePath } : {}
		} });
		const finish = (error, value) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			worker.terminate().catch(() => {});
			if (error) reject(error);
			else resolve({
				...value,
				durableTargets: targets,
				requestedAgentId
			});
		};
		timer = setTimeout(() => finish(new Error(`lifecycle snapshot worker timed out after ${LIFECYCLE_SNAPSHOT_WORKER_TIMEOUT_MS} ms`)), LIFECYCLE_SNAPSHOT_WORKER_TIMEOUT_MS);
		timer.unref?.();
		worker.unref();
		worker.once("message", (message) => {
			if (message?.ok === true) finish(void 0, message.value);
			else finish(Object.assign(new Error(message?.error?.message ?? "lifecycle snapshot worker failed"), {
				...message?.error?.name ? { name: message.error.name } : {},
				...message?.error?.code ? { code: message.error.code } : {}
			}));
		});
		worker.once("error", (error) => finish(error));
		worker.once("exit", (code) => finish(new Error(`lifecycle snapshot worker exited with code ${code}`)));
	});
}
function isDurableLifecycleSnapshotFor(snapshot, durableTargets, requestedAgentId) {
	return snapshot.requestedAgentId === requestedAgentId && snapshot.durableTargets.length === durableTargets.length && snapshot.durableTargets.every((target, index) => target.agentId === durableTargets[index].agentId && target.storePath === durableTargets[index].storePath);
}
/** Loads and canonicalizes session entries for gateway views across one or more agent stores. */
function loadCombinedSessionStoreForGatewayCore(cfg, opts = {}) {
	const projection = opts.projection ?? "full";
	const { configuredAgentIds, defaultAgentId, diagnostics, durableStorePath: preparedDurableStorePath, durableTargets, incognitoTargets, requestedAgentId, storeConfig } = resolveGatewaySessionStoreTargets(cfg, opts);
	const combined = {};
	const agentIdBySessionKey = /* @__PURE__ */ new Map();
	// workboard-full-sweep: durable stores a lifecycle snapshot worker already read and merged for these same targets.
	const durableSnapshot = opts.durableSnapshot && isDurableLifecycleSnapshotFor(opts.durableSnapshot, durableTargets, requestedAgentId) ? opts.durableSnapshot : void 0;
	if (durableSnapshot) {
		for (const [key, entry] of durableSnapshot.entries) combined[key] = entry;
		for (const [key, agentId] of durableSnapshot.agentIds) agentIdBySessionKey.set(key, agentId);
	} else mergeDurableGatewayStores({
		cfg,
		combined,
		agentIdBySessionKey,
		durableTargets,
		requestedAgentId,
		projection,
		...opts.match ? { match: opts.match } : {}
	});
	const incognitoStorePaths = mergeOpenIncognitoStores({
		cfg,
		combined,
		agentIdBySessionKey,
		projection,
		targets: incognitoTargets
	});
	if (configuredAgentIds) filterCombinedStoreToConfiguredAgents({
		cfg,
		configuredAgentIds,
		store: combined,
		agentIdBySessionKey
	});
	const durableStorePaths = durableTargets.map((target) => target.storePath);
	const durableStorePath = preparedDurableStorePath ?? resolveCombinedDatabasePath(durableTargets, defaultAgentId);
	return {
		diagnostics,
		durableStorePath,
		durableTargets,
		storePath: storeConfig && !isStorePathTemplate(storeConfig) ? incognitoStorePaths.length > 0 ? "(multiple)" : durableStorePath : resolveCombinedStorePath([...durableStorePaths, ...incognitoStorePaths], storeConfig),
		store: combined,
		agentIdBySessionKey
	};
}
//#endregion
export { loadCombinedSessionStoreForGatewayCore as n, canPrewarmCombinedSessionStoresForGateway as t };
export { readCombinedLifecycleSnapshotInWorker, readDurableLifecycleSnapshot };
