import { l as normalizeOptionalString, o as normalizeLowercaseStringOrEmpty } from "./string-coerce-CIXf7egm.js";
import { n as getRuntimeConfig } from "./io.runtime-CKu7Rw0j.js";
import { i as listAgentEntries, m as resolveAgentWorkspaceDir, o as listAgentIds } from "./agent-scope-config-CUiGBd59.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { O as parseAgentSessionKey, S as isAcpSessionKey } from "./session-key-CRjxKW0X.js";
import { t as isIncognitoSessionKey } from "./incognito-session-key-BwpD1Lwd.js";
import { o as resolveSessionStorePathCore } from "./paths-DDTeIhCT.js";
import { t as splitTrailingAuthProfile } from "./model-ref-profile-BIKs-96s.js";
import { i as resolveAgentModelFallbackValues } from "./model-input-BuGMCNOz.js";
import { u as resolveAgentModelFallbacksOverride } from "./agent-scope-CSlN0kZb.js";
import { t as resolveDefaultModelForAgent } from "./model-selection-config-bdtzr00S.js";
import "./io-Des9Xfzj.js";
import { r as listAgentProvenance } from "./agent-provenance-CCPuNr8-.js";
import { n as resolveIncognitoOpenClawAgentSqlitePath } from "./openclaw-agent-db.paths-DYna80bS.js";
import { u as getOpenClawAgentDatabaseIfOpen } from "./openclaw-agent-db-CUTe8BX6.js";
import { c as resolveSqliteScope, m as toDatabaseOptions } from "./session-accessor.sqlite-scope-BwPKGcgm.js";
import { O as isInternalSessionEffectsKey, a as listSessionEntriesReadOnly, l as loadExactSessionEntry, r as listSessionChildEntriesReadOnly, u as loadExactSessionEntryReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { m as canonicalSessionKeyMigrationRequiredError } from "./session-accessor.sqlite-transcript-state-Cz9g7S9v.js";
import "./session-accessor-K0XuW6ln.js";
import { r as resolveAgentMainSessionKey } from "./main-session-TZQkcBLs.js";
import { i as resolveStoredSessionKeyForAgentStore, n as resolveSessionStoreAgentId, r as resolveSessionStoreKey } from "./session-store-key-DVtVp9hU.js";
import { t as listSessionEntriesCore } from "./session-accessor.entry-B8arwR7t.js";
import { l as resolveExistingAgentSessionStoreTargetsSync, t as isConfiguredSessionStoreAgentId } from "./targets-M9xRkscp.js";
import "./model-selection-DG2dN6VK.js";
import { a as readAcpSessionMetaForEntry, o as repairAcpSessionMetaKeyForMigration, r as readAcpSessionMeta } from "./session-meta-CMnopLdV.js";
import "./sessions-eI69vxPt.js";
import { S as resolveExecPolicyForMode } from "./exec-approvals-policy-CCFUzTzd.js";
import { t as SESSION_PERMISSION_BY_EXEC_MODE } from "./session-permission-exec-mode-CJHB47SR.js";
import { i as resolveSandboxConfigForAgent } from "./config-5-zV7VP6.js";
import { r as loadExecApprovals } from "./exec-approvals-store-D159_AKa.js";
import { i as resolveGatewayModelThinkingProfile } from "./session-utils-model-CsFM0F10.js";
import { n as resolveModelAgentRuntimeMetadata } from "./agent-runtime-metadata-BHZnBUsP.js";
import { t as resolveExecDefaults } from "./exec-defaults-DRtGLLOe.js";
import { r as resolveAgentAvatarUrlFromSource } from "./identity-avatar-file-CWIN-fQz.js";
import { a as insideGitCheckout } from "./git-BejBdEKq.js";
import { t as listGatewayAgentsBasic } from "./agent-list-CFshms7U.js";
import { i as tryResolveSessionCompatibilityOwnerAgentId } from "./session-request-agent-Db9uggbl.js";
import { t as projectWorkerPlacementAgentRuntime } from "./placement-session-runtime-CRRdyhxB.js";
//#region src/gateway/session-utils-store-lookup.ts
function findCanonicalStoreMatch(store, candidates, onCanonicalError) {
	const matches = /* @__PURE__ */ new Map();
	for (const candidate of candidates) {
		const trimmed = normalizeOptionalString(candidate) ?? "";
		if (!trimmed) continue;
		const exact = store[trimmed];
		if (exact) matches.set(trimmed, {
			entry: exact,
			key: trimmed
		});
	}
	if (matches.size === 0) return;
	const canonicalKey = candidates[0] ?? "";
	const selected = matches.get(canonicalKey) ?? matches.values().next().value;
	if (matches.size > 1) {
		const error = canonicalSessionKeyMigrationRequiredError(`duplicate rows resolve to canonical session key ${canonicalKey || selected?.key || ""}`);
		if (!onCanonicalError) throw error;
		onCanonicalError(error);
	}
	if (selected && selected.key !== canonicalKey) {
		const error = canonicalSessionKeyMigrationRequiredError(`non-canonical persisted row resolves to session key ${canonicalKey || selected.key}`);
		if (!onCanonicalError) throw error;
		onCanonicalError(error);
	}
	return selected;
}
function buildGatewaySessionStoreScanTargets(params) {
	const targets = /* @__PURE__ */ new Set();
	if (params.canonicalKey) targets.add(params.canonicalKey);
	if (params.key && params.key !== params.canonicalKey) targets.add(params.key);
	if (params.canonicalKey === "global" || params.canonicalKey === "unknown") return [...targets];
	const agentMainKey = resolveAgentMainSessionKey({
		cfg: params.cfg,
		agentId: params.agentId
	});
	if (params.canonicalKey === agentMainKey) targets.add(`agent:${params.agentId}:main`);
	return [...targets];
}
function resolveGatewaySessionStoreCandidates(cfg, agentId, cache) {
	const cached = cache?.get(agentId);
	if (cached) return cached;
	const storeConfig = cfg.session?.store;
	const fallback = {
		agentId,
		storePath: resolveSessionStorePathCore(storeConfig, { agentId })
	};
	const discovery = {
		existing: resolveExistingAgentSessionStoreTargetsSync(cfg, agentId),
		fallback
	};
	cache?.set(agentId, discovery);
	return discovery;
}
function createGatewaySessionStoreDiscoveryCache(params) {
	const cache = /* @__PURE__ */ new Map();
	const prepare = (rawAgentId, target) => {
		const agentId = normalizeAgentId(rawAgentId);
		const current = cache.get(agentId);
		if (current) {
			if (target) current.existing.push(target);
			return;
		}
		const fallback = {
			agentId,
			storePath: resolveSessionStorePathCore(params.cfg.session?.store, { agentId })
		};
		const existing = target ? [target] : params.targets.length > 0 ? [...params.targets] : [fallback];
		cache.set(agentId, {
			existing,
			fallback,
			prepared: true
		});
	};
	for (const target of params.targets) prepare(target.agentId, target);
	for (const agentId of params.agentIds) prepare(agentId);
	return cache;
}
function mayUseWarmExactSessionLookup(storePath, agentId, sessionKey) {
	try {
		const database = getOpenClawAgentDatabaseIfOpen(toDatabaseOptions(resolveSqliteScope({storePath, agentId, sessionKey})));
		return database?.db.isOpen === true && database.db.isTransaction !== true;
	} catch { return false; }
}
function loadGatewaySessionLookupStore(storePath, clone, agentId, options = {}) {
	if (options.warmExact && options.exactKeys && !mayUseWarmExactSessionLookup(storePath, agentId, options.exactKeys[0] ?? "")) options = {...options, exactKeys: void 0};
	const cache = options.cache;
	const cacheKey = cache ? `${storePath}\u0000${agentId ?? ""}\u0000${clone === false ? "0" : "1"}\u0000${options.readOnly}\u0000${options.projection ?? "full"}\u0000${options.exactKeys?.join("") ?? ""}` : "";
	if (cache) {
		const cached = cache.get(cacheKey);
		if (cached) return cached;
	}
	const loaded = loadGatewaySessionLookupStoreUncached(storePath, clone, agentId, options);
	cache?.set(cacheKey, loaded);
	return loaded;
}
function loadGatewaySessionLookupStoreUncached(storePath, clone, agentId, options = {}) {
	try {
		if (options.exactKeys) {
			const store = {};
			const loadExact = options.readOnly === false && clone !== false ? loadExactSessionEntry : loadExactSessionEntryReadOnly;
			for (const sessionKey of options.exactKeys) {
				const match = loadExact({
					...agentId ? { agentId } : {},
					clone: false,
					projection: options.projection,
					sessionKey,
					storePath
				});
				if (match) store[match.sessionKey] = match.entry;
			}
			return store;
		}
		const listEntries = options.readOnly ? listSessionEntriesReadOnly : listSessionEntriesCore;
		return Object.fromEntries(listEntries({
			...agentId ? { agentId } : {},
			...clone === false ? { clone: false } : {},
			...options.projection ? { projection: options.projection } : {},
			storePath
		}).map(({ sessionKey, entry }) => [sessionKey, entry]));
	} catch {
		return {};
	}
}
function resolveGatewaySessionStoreLookup(params) {
	const scanTargets = buildGatewaySessionStoreScanTargets(params);
	const discovery = resolveGatewaySessionStoreCandidates(params.cfg, params.agentId, params.targetDiscoveryCache);
	const { existing, fallback } = discovery;
	const configured = isConfiguredSessionStoreAgentId(params.cfg, params.agentId);
	const candidates = discovery.prepared ? existing : configured ? [fallback, ...existing.filter((target) => target.storePath !== fallback.storePath)] : existing;
	if (candidates.length === 0) return {
		storePath: fallback.storePath,
		store: {},
		match: void 0
	};
	const loadStore = (target) => loadGatewaySessionLookupStore(target.storePath, params.clone, target.agentId, {
		readOnly: configured ? params.readOnly : true,
		...params.exactRead ? { exactKeys: scanTargets, warmExact: params.exactRead === "warm" } : {},
		...params.projection ? { projection: params.projection } : {},
		...params.storeCache ? { cache: params.storeCache } : {}
	});
	const firstCandidate = candidates[0] ?? fallback;
	let selectedStorePath = firstCandidate.storePath;
	let selectedStore = params.initialStore && firstCandidate.storePath === fallback.storePath ? params.initialStore : loadStore(firstCandidate);
	let canonicalValidationError;
	const recordCanonicalError = params.deferCanonicalValidation ? (error) => {
		canonicalValidationError ??= error;
	} : void 0;
	let selectedMatch = findCanonicalStoreMatch(selectedStore, scanTargets, recordCanonicalError);
	for (let index = 1; index < candidates.length; index += 1) {
		const candidate = candidates[index];
		if (!candidate) continue;
		const store = loadStore(candidate);
		const match = findCanonicalStoreMatch(store, scanTargets, recordCanonicalError);
		if (!match) continue;
		if (selectedMatch) {
			const error = canonicalSessionKeyMigrationRequiredError(`duplicate rows resolve to canonical session key ${params.canonicalKey}`);
			if (!recordCanonicalError) throw error;
			recordCanonicalError(error);
			if (match.key !== params.canonicalKey || selectedMatch.key === params.canonicalKey) continue;
		}
		selectedStorePath = candidate.storePath;
		selectedStore = store;
		selectedMatch = match;
	}
	return {
		storePath: selectedStorePath,
		store: selectedStore,
		match: selectedMatch,
		...canonicalValidationError ? { canonicalValidationError } : {}
	};
}
function isAgentScopedSentinelSessionKey(canonicalKey) {
	return canonicalKey === "global" || canonicalKey === "unknown";
}
function resolveExplicitDeletedLegacyMainStoreTarget(params) {
	const parsed = parseAgentSessionKey(params.key);
	const legacyAgentId = normalizeAgentId(parsed?.agentId);
	if (!parsed || legacyAgentId !== "main" || listAgentIds(params.cfg).includes(legacyAgentId)) return null;
	const canonicalKey = resolveStoredSessionKeyForAgentStore({
		cfg: params.cfg,
		agentId: legacyAgentId,
		sessionKey: params.key
	});
	const agentMainKey = resolveAgentMainSessionKey({
		cfg: params.cfg,
		agentId: legacyAgentId
	});
	const legacyAgentMainKey = `agent:${legacyAgentId}:main`;
	const lookupSeeds = Array.from(/* @__PURE__ */ new Set([
		params.key,
		canonicalKey,
		agentMainKey,
		legacyAgentMainKey
	]));
	let best;
	const { existing } = resolveGatewaySessionStoreCandidates(params.cfg, legacyAgentId, params.targetDiscoveryCache);
	let canonicalValidationError;
	const recordCanonicalError = params.deferCanonicalValidation ? (error) => {
		canonicalValidationError ??= error;
	} : void 0;
	for (const target of existing) {
		if (target.agentId !== legacyAgentId) continue;
		const store = loadGatewaySessionLookupStore(target.storePath, params.clone, target.agentId, {
			readOnly: true,
			...params.exactRead ? { exactKeys: lookupSeeds, warmExact: params.exactRead === "warm" } : {},
			...params.projection ? { projection: params.projection } : {},
			...params.storeCache ? { cache: params.storeCache } : {}
		});
		const match = findCanonicalStoreMatch(store, lookupSeeds, recordCanonicalError);
		if (!match) continue;
		if (best) {
			const error = canonicalSessionKeyMigrationRequiredError(`duplicate rows resolve to canonical session key ${canonicalKey}`);
			if (!recordCanonicalError) throw error;
			recordCanonicalError(error);
		}
		if (!best || (match.entry.updatedAt ?? 0) >= (best.match.entry.updatedAt ?? 0)) best = {
			storePath: target.storePath,
			store,
			match
		};
	}
	if (!best) return null;
	const storeKeys = /* @__PURE__ */ new Set([canonicalKey]);
	if (params.key !== canonicalKey) storeKeys.add(params.key);
	storeKeys.add(best.match.key);
	for (const seed of lookupSeeds) storeKeys.add(seed);
	return {
		agentId: legacyAgentId,
		storePath: best.storePath,
		canonicalKey,
		storeKeys: Array.from(storeKeys),
		store: best.store,
		...canonicalValidationError ? { canonicalValidationError } : {}
	};
}
function resolveGatewaySessionStoreTargetWithStore(params) {
	const key = normalizeOptionalString(params.key) ?? "";
	const explicitDeletedMainTarget = resolveExplicitDeletedLegacyMainStoreTarget({
		cfg: params.cfg,
		key,
		clone: params.clone,
		...params.deferCanonicalValidation ? { deferCanonicalValidation: true } : {},
		readOnly: params.readOnly,
		exactRead: params.exactRead,
		...params.projection ? { projection: params.projection } : {},
		...params.storeCache ? { storeCache: params.storeCache } : {},
		...params.targetDiscoveryCache ? { targetDiscoveryCache: params.targetDiscoveryCache } : {}
	});
	if (explicitDeletedMainTarget) return includeDirectChildEntries(explicitDeletedMainTarget, params.includeStoreChildEntries, params.projection);
	const requestedAgentId = normalizeOptionalString(params.agentId);
	const canonicalKey = resolveSessionStoreKey({
		cfg: params.cfg,
		sessionKey: key,
		...requestedAgentId ? { storeAgentId: requestedAgentId } : {}
	});
	const agentId = requestedAgentId && (isAgentScopedSentinelSessionKey(canonicalKey) || !parseAgentSessionKey(key)) ? normalizeAgentId(requestedAgentId) : resolveSessionStoreAgentId(params.cfg, canonicalKey);
	if (isIncognitoSessionKey(canonicalKey)) {
		const storePath = resolveIncognitoOpenClawAgentSqlitePath({ agentId });
		const store = loadGatewaySessionLookupStore(storePath, params.clone, agentId, {
			readOnly: true,
			...params.exactRead ? { exactKeys: [canonicalKey], warmExact: params.exactRead === "warm" } : {},
			...params.projection ? { projection: params.projection } : {},
			...params.storeCache ? { cache: params.storeCache } : {}
		});
		return includeDirectChildEntries({
			agentId,
			storePath,
			canonicalKey,
			storeKeys: [canonicalKey],
			store
		}, params.includeStoreChildEntries, params.projection);
	}
	const { canonicalValidationError, storePath, store } = resolveGatewaySessionStoreLookup({
		cfg: params.cfg,
		key,
		canonicalKey,
		agentId,
		clone: params.clone,
		readOnly: params.readOnly,
		exactRead: params.exactRead,
		deferCanonicalValidation: params.deferCanonicalValidation,
		initialStore: params.store,
		...params.projection ? { projection: params.projection } : {},
		...params.storeCache ? { storeCache: params.storeCache } : {},
		...params.targetDiscoveryCache ? { targetDiscoveryCache: params.targetDiscoveryCache } : {}
	});
	if (canonicalKey === "global" || canonicalKey === "unknown") return includeDirectChildEntries({
		agentId,
		storePath,
		canonicalKey,
		storeKeys: key && key !== canonicalKey ? [canonicalKey, key] : [key],
		store,
		...canonicalValidationError ? { canonicalValidationError } : {}
	}, params.includeStoreChildEntries, params.projection);
	const storeKeys = new Set(buildGatewaySessionStoreScanTargets({
		cfg: params.cfg,
		key,
		canonicalKey,
		agentId
	}));
	return includeDirectChildEntries({
		agentId,
		storePath,
		canonicalKey,
		storeKeys: Array.from(storeKeys),
		store,
		...canonicalValidationError ? { canonicalValidationError } : {}
	}, params.includeStoreChildEntries, params.projection);
}
function includeDirectChildEntries(target, include, projection) {
	if (!include) return target;
	try {
		const parentKeys = /* @__PURE__ */ new Set([target.canonicalKey, ...target.storeKeys]);
		for (const parentKey of parentKeys) for (const { sessionKey, entry } of listSessionChildEntriesReadOnly({
			agentId: target.agentId,
			clone: false,
			projection,
			sessionKey: parentKey,
			storePath: target.storePath
		})) target.store[sessionKey] = entry;
	} catch {}
	return target;
}
function resolveGatewaySessionStoreTarget(params) {
	const { store: _store, ...target } = resolveGatewaySessionStoreTargetWithStore({
		...params,
		projection: "list"
	});
	return target;
}
//#endregion
//#region src/gateway/session-utils-store.ts
/**
* Returns the owning agent id if the session key belongs to an agent that is no
* longer present in config (deleted). Returns null for non-agent legacy/global
* keys, confirmed ACP runtime session keys, or when the owning agent still
* exists (#65524).
*/
function resolveDeletedAgentIdFromSessionKey(cfg, sessionKey, entry, options) {
	const parsed = parseAgentSessionKey(sessionKey);
	if (!parsed) return null;
	const agentId = normalizeAgentId(parsed.agentId);
	if (listAgentIds(cfg).includes(agentId)) return null;
	if (isAcpSessionKey(sessionKey) && !parsed.rest.startsWith("acp:binding:")) {
		if (readAcpMetaForDeletedAgentCheck({
			cfg,
			sessionKey,
			entry,
			acpMetadataSessionKey: options?.acpMetadataSessionKey
		})) return null;
	}
	return agentId;
}
function readAcpMetaForDeletedAgentCheck(params) {
	if (params.entry?.acp) return params.entry.acp;
	const acpMetadataSessionKey = normalizeOptionalString(params.acpMetadataSessionKey);
	const directKeys = /* @__PURE__ */ new Set();
	if (acpMetadataSessionKey) directKeys.add(acpMetadataSessionKey);
	else {
		const acpMeta = readAcpSessionMeta({
			sessionKey: params.sessionKey,
			cfg: params.cfg
		});
		if (acpMeta) return acpMeta;
	}
	directKeys.add(params.sessionKey);
	for (const directKey of directKeys) {
		const agentId = parseAgentSessionKey(directKey)?.agentId ?? tryResolveSessionCompatibilityOwnerAgentId(params.cfg, directKey);
		const acpMeta = readAcpSessionMetaForEntry({
			sessionKey: directKey,
			...agentId ? { agentId } : {},
			entry: params.entry ?? void 0
		});
		if (acpMeta) return acpMeta;
	}
	repairAcpSessionMetaKeyForMigration({
		sessionKey: params.sessionKey,
		candidateSessionKeys: directKeys,
		entry: params.entry ?? void 0
	});
	const finalAgentId = parseAgentSessionKey(params.sessionKey)?.agentId ?? tryResolveSessionCompatibilityOwnerAgentId(params.cfg, params.sessionKey);
	return readAcpSessionMetaForEntry({
		sessionKey: params.sessionKey,
		...finalAgentId ? { agentId: finalAgentId } : {},
		entry: params.entry ?? void 0
	});
}
function loadSessionEntryWithMode(sessionKey, opts, readOnly) {
	const cfg = getRuntimeConfig();
	const target = resolveGatewaySessionStoreTargetWithStore({
		cfg,
		key: normalizeOptionalString(sessionKey) ?? "",
		exactRead: true,
		readOnly,
		projection: opts?.projection,
		targetDiscoveryCache: opts?.targetDiscoveryCache,
		...opts?.clone === false ? { clone: false } : {},
		...opts?.agentId ? { agentId: opts.agentId } : {},
		...opts?.includeStoreChildEntries ? { includeStoreChildEntries: true } : {}
	});
	const storePath = target.storePath;
	const store = target.store;
	if (!readOnly) {
		for (const storeKey of target.storeKeys) if (isInternalSessionEffectsKey(storeKey)) delete store[storeKey];
	}
	const canonicalMatch = resolveCanonicalSessionStoreMatchFromStoreKeys(store, target.storeKeys);
	const legacyKey = canonicalMatch?.key !== target.canonicalKey ? canonicalMatch?.key : void 0;
	const entry = readOnly && opts?.clone !== false && canonicalMatch?.entry ? structuredClone(canonicalMatch.entry) : canonicalMatch?.entry;
	return {
		cfg,
		agentId: target.agentId,
		storePath,
		store,
		entry,
		canonicalKey: target.canonicalKey,
		storeKeys: target.storeKeys,
		legacyKey
	};
}
function loadGatewaySessionEntry(sessionKey, opts) {
	return loadSessionEntryWithMode(sessionKey, opts, false);
}
function loadGatewaySessionEntryReadOnly(sessionKey, opts) {
	return loadSessionEntryWithMode(sessionKey, opts, true);
}
/** Returns the one canonical entry and the exact persisted key that owns it. */
function resolveCanonicalSessionStoreMatchFromStoreKeys(store, storeKeys) {
	let selected;
	for (const key of storeKeys) {
		const entry = store[key];
		if (!entry) continue;
		const match = {
			key,
			entry
		};
		if (selected) throw canonicalSessionKeyMigrationRequiredError(`duplicate rows resolve to canonical session key ${storeKeys[0] ?? key}`);
		selected = match;
	}
	if (selected && selected.key !== storeKeys[0]) throw canonicalSessionKeyMigrationRequiredError(`non-canonical persisted row resolves to session key ${storeKeys[0] ?? selected.key}`);
	return selected;
}
function resolveCanonicalSessionEntryFromStoreKeys(store, storeKeys) {
	return resolveCanonicalSessionStoreMatchFromStoreKeys(store, storeKeys)?.entry;
}
function resolveCanonicalGatewaySessionStoreKey(params) {
	const target = resolveGatewaySessionStoreTarget({
		cfg: params.cfg,
		key: params.key,
		store: params.store,
		...params.agentId ? { agentId: params.agentId } : {}
	});
	const primaryKey = target.canonicalKey;
	resolveCanonicalSessionStoreMatchFromStoreKeys(params.store, target.storeKeys);
	return {
		target,
		primaryKey,
		entry: params.store[primaryKey]
	};
}
function parseGroupKey(key) {
	const parts = (parseAgentSessionKey(key)?.rest ?? key).split(":").filter(Boolean);
	if (parts.length >= 3) {
		const [channel, kind, ...rest] = parts;
		if (kind === "group" || kind === "channel") return {
			channel,
			kind,
			id: rest.join(":")
		};
	}
	return null;
}
function isGroupOrChannelDisplaySession(entry, parsed) {
	return entry?.chatType === "group" || entry?.chatType === "channel" || parsed?.kind === "group" || parsed?.kind === "channel";
}
function normalizeFallbackList(values) {
	const out = [];
	const seen = /* @__PURE__ */ new Set();
	for (const value of values) {
		const trimmed = value.trim();
		if (!trimmed) continue;
		const key = normalizeLowercaseStringOrEmpty(trimmed);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(trimmed);
	}
	return out;
}
function resolveGatewayAgentModel(cfg, agentId, resolvedModel) {
	const primary = `${resolvedModel.provider}/${resolvedModel.model}`;
	const fallbackOverride = resolveAgentModelFallbacksOverride(cfg, agentId);
	const defaultFallbacks = resolveAgentModelFallbackValues(cfg.agents?.defaults?.model);
	const fallbacks = normalizeFallbackList((fallbackOverride ?? defaultFallbacks).map((value) => splitTrailingAuthProfile(value).model));
	return {
		primary,
		...fallbacks.length > 0 ? { fallbacks } : {}
	};
}
function resolvedPermissionLabel(policy) {
	const { mode } = policy;
	const canonical = resolveExecPolicyForMode(mode);
	return mode !== "allowlist" && policy.security === canonical.security && policy.ask === canonical.ask ? SESSION_PERMISSION_BY_EXEC_MODE[mode] : void 0;
}
function listAgentsForGateway(cfg, modelCatalog, options) {
	const basic = listGatewayAgentsBasic(cfg);
	const execApprovals = loadExecApprovals();
	const identityById = /* @__PURE__ */ new Map();
	for (const entry of listAgentEntries(cfg)) {
		if (!entry?.id) continue;
		const agentId = normalizeAgentId(entry.id);
		const avatar = normalizeOptionalString(entry.identity?.avatar);
		const avatarUrl = resolveAgentAvatarUrlFromSource(cfg, agentId, avatar);
		const identity = entry.identity ? {
			name: normalizeOptionalString(entry.identity.name),
			theme: normalizeOptionalString(entry.identity.theme),
			emoji: normalizeOptionalString(entry.identity.emoji),
			avatar,
			avatarUrl
		} : void 0;
		identityById.set(agentId, identity);
	}
	const roster = options?.includeSystem ? basic.agents : basic.agents.filter((entry) => entry.kind !== "system");
	const provenanceById = new Map(listAgentProvenance().map((record) => [record.agentId, record]));
	const agents = roster.map((entry) => {
		const { id } = entry;
		const execDefaults = resolveExecDefaults({
			cfg,
			agentId: id,
			execApprovals
		});
		const defaultPermissionMode = resolveSandboxConfigForAgent(cfg, id).mode === "off" ? resolvedPermissionLabel(execDefaults) : void 0;
		const resolvedModel = resolveDefaultModelForAgent({
			cfg,
			agentId: id
		});
		const model = resolveGatewayAgentModel(cfg, id, resolvedModel);
		const sessionKey = resolveAgentMainSessionKey({
			cfg,
			agentId: id
		});
		const agentRuntime = projectWorkerPlacementAgentRuntime(resolveModelAgentRuntimeMetadata({
			cfg,
			agentId: id,
			provider: resolvedModel.provider,
			model: resolvedModel.model,
			sessionKey,
			acpRuntime: false
		}));
		const hasAgentCatalog = options?.modelCatalogByAgentId?.has(id);
		const preparedCatalog = hasAgentCatalog ? options?.modelCatalogByAgentId?.get(id) : modelCatalog ? void 0 : options?.modelCatalogByAgentId?.get(basic.defaultId);
		const agentModelCatalog = hasAgentCatalog ? preparedCatalog?.entries : modelCatalog ?? preparedCatalog?.entries;
		const thinkingProfile = resolveGatewayModelThinkingProfile({
			cfg,
			agentId: id,
			provider: resolvedModel.provider,
			model: resolvedModel.model,
			modelCatalog: agentModelCatalog,
			sessionKey,
			providerPolicySource: preparedCatalog?.pluginRegistry
		});
		const workspace = resolveAgentWorkspaceDir(cfg, id);
		const workspaceGit = insideGitCheckout(workspace);
		const agent = Object.assign({
			id,
			...options?.includeSystem ? { kind: entry.kind } : {},
			name: entry.name,
			identity: identityById.get(id),
			workspace,
			workspaceGit,
			agentRuntime,
			thinkingLevels: thinkingProfile.thinkingLevels,
			thinkingOptions: thinkingProfile.thinkingLevels.map((level) => level.label),
			thinkingDefault: thinkingProfile.thinkingDefault
		}, { model }, defaultPermissionMode ? { defaultPermissionMode } : {});
		const provenance = provenanceById.get(id);
		return provenance ? Object.assign(agent, {
			createdVia: provenance.createdVia,
			creatorAgentId: provenance.creatorAgentId,
			createdAt: provenance.createdAtMs
		}) : agent;
	});
	return {
		defaultId: basic.defaultId,
		ownership: basic.ownership,
		selectionRequired: basic.selectionRequired,
		mainKey: basic.mainKey,
		scope: basic.scope,
		agents
	};
}
//#endregion
export { parseGroupKey as a, resolveCanonicalSessionStoreMatchFromStoreKeys as c, resolveGatewaySessionStoreTarget as d, resolveGatewaySessionStoreTargetWithStore as f, loadGatewaySessionEntryReadOnly as i, resolveDeletedAgentIdFromSessionKey as l, listAgentsForGateway as n, resolveCanonicalGatewaySessionStoreKey as o, loadGatewaySessionEntry as r, resolveCanonicalSessionEntryFromStoreKeys as s, isGroupOrChannelDisplaySession as t, createGatewaySessionStoreDiscoveryCache as u };
