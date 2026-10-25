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
import { m as canonicalSessionKeyMigrationRequiredError } from "./session-accessor.sqlite-transcript-state-Cz9g7S9v.js";
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
	// sessions-search-exact-read: a search reads only the rows it can match (durable stores).
	if (params.match && !params.includeOpenDatabases) return listSessionEntriesMatchingReadOnly({
		agentId: params.agentId,
		clone: false,
		projection: params.projection,
		storePath: params.storePath
	}, params.match);
	return (params.includeOpenDatabases ? listSessionEntriesCore : listSessionEntriesReadOnly)({
		agentId: params.agentId,
		clone: false,
		projection: params.projection,
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
/** Loads and canonicalizes session entries for gateway views across one or more agent stores. */
function loadCombinedSessionStoreForGatewayCore(cfg, opts = {}) {
	const projection = opts.projection ?? "full";
	const { configuredAgentIds, defaultAgentId, diagnostics, durableStorePath: preparedDurableStorePath, durableTargets, incognitoTargets, requestedAgentId, storeConfig } = resolveGatewaySessionStoreTargets(cfg, opts);
	const combined = {};
	const agentIdBySessionKey = /* @__PURE__ */ new Map();
	for (const target of durableTargets) {
		const agentId = target.agentId;
		const storePath = target.storePath;
		const store = loadGatewayStoreEntries({
			agentId,
			projection,
			storePath,
			...opts.match ? { match: opts.match } : {}
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
