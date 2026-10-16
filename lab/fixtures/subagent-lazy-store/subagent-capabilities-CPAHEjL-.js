import { C as parseStrictNonNegativeInteger, M as resolveNonNegativeIntegerOption, j as resolveIntegerOption } from "./number-coercion-CLj0HTDM.js";
import { c as normalizeOptionalLowercaseString, l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { O as parseAgentSessionKey, S as isAcpSessionKey, T as isSubagentSessionKey, x as getSubagentDepth } from "./session-key-CRjxKW0X.js";
import { o as resolveSessionStorePathCore } from "./paths-DDTeIhCT.js";
import { _ as resolveSessionAgentId } from "./agent-scope-CSlN0kZb.js";
import { a as listSessionEntriesReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import "./session-accessor-K0XuW6ln.js";
import "./sessions-eI69vxPt.js";
import { c as normalizeInheritedToolDenylist, s as normalizeInheritedToolAllowlist } from "./inherited-tool-deny-QVM6xpjt.js";
//#region src/agents/subagents/spawn/subagent-depth.ts
/**
* Subagent spawn-depth lookup helpers.
*
* Reads persisted session store state to recover spawn depth and parent lineage across restarts.
*/
function normalizeSpawnDepth(value) {
	if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : void 0;
	if (typeof value === "string") return parseStrictNonNegativeInteger(value);
}
function readSubagentSessionStore(storePath, agentId) {
	try {
		return Object.fromEntries(listSessionEntriesReadOnly({
			agentId,
			storePath,
			clone: false
		}).map(({ sessionKey, entry }) => [sessionKey, entry]));
	} catch {}
	return {};
}
function buildKeyCandidates(rawKey, cfg, explicitAgentId) {
	if (!cfg) return [rawKey];
	if (rawKey === "unknown") return [rawKey];
	if (parseAgentSessionKey(rawKey)) return [rawKey];
	const prefixed = `agent:${resolveSessionAgentId({
		sessionKey: rawKey,
		config: cfg,
		agentId: explicitAgentId
	})}:${rawKey}`;
	return prefixed === rawKey ? [rawKey] : [rawKey, prefixed];
}
function findSubagentSessionEntryById(store, sessionId) {
	const normalizedSessionId = normalizeOptionalString(sessionId);
	if (!normalizedSessionId) return;
	for (const entry of Object.values(store)) {
		const candidateSessionId = normalizeOptionalString(entry?.sessionId);
		if (candidateSessionId && candidateSessionId === normalizedSessionId) return entry;
	}
}
function resolveEntryForSessionKey(params) {
	const candidates = buildKeyCandidates(params.sessionKey, params.cfg, params.agentId);
	if (params.store) {
		for (const key of candidates) {
			const entry = params.store[key];
			if (entry) return entry;
		}
		const entry = findSubagentSessionEntryById(params.store, params.sessionKey);
		if (entry || !params.cfg) return entry;
	}
	if (!params.cfg) return;
	const candidateAgentIds = new Set(candidates.flatMap((key) => {
		const agentId = parseAgentSessionKey(key)?.agentId;
		return agentId ? [agentId] : [];
	}));
	for (const agentId of candidateAgentIds) {
		const storePath = resolveSessionStorePathCore(params.cfg.session?.store, { agentId });
		const cacheKey = `${storePath}\0${normalizeAgentId(agentId)}`;
		let store = params.cache.get(cacheKey);
		if (!store) {
			store = readSubagentSessionStore(storePath, agentId);
			params.cache.set(cacheKey, store);
		}
		const entry = candidates.map((key) => store[key]).find((candidate) => candidate !== void 0) ?? findSubagentSessionEntryById(store, params.sessionKey);
		if (entry) return entry;
	}
}
function getSubagentDepthFromSessionStore(sessionKey, opts) {
	const raw = (sessionKey ?? "").trim();
	const fallbackDepth = getSubagentDepth(raw);
	if (!raw) return fallbackDepth;
	const cache = /* @__PURE__ */ new Map();
	const visited = /* @__PURE__ */ new Set();
	const depthFromStore = (key) => {
		const normalizedKey = normalizeOptionalString(key);
		if (!normalizedKey) return;
		if (visited.has(normalizedKey)) return;
		visited.add(normalizedKey);
		const entry = resolveEntryForSessionKey({
			sessionKey: normalizedKey,
			cfg: opts?.cfg,
			store: opts?.store,
			cache,
			agentId: opts?.agentId
		});
		const storedDepth = normalizeSpawnDepth(entry?.spawnDepth);
		if (storedDepth !== void 0) return storedDepth;
		const parentKey = normalizeOptionalString(entry?.spawnedBy);
		if (!parentKey) return;
		const parentDepth = depthFromStore(parentKey);
		if (parentDepth !== void 0) return parentDepth + 1;
		return getSubagentDepth(parentKey) + 1;
	};
	return depthFromStore(raw) ?? fallbackDepth;
}
//#endregion
//#region src/agents/subagents/spawn/subagent-capabilities.ts
/**
* Subagent capability resolution.
* Combines session-key shape, stored envelopes, spawn depth, and inherited tool
* policy to decide role, control scope, and subagent permissions.
*/
const SUBAGENT_SESSION_ROLES = [
	"main",
	"orchestrator",
	"leaf"
];
const SUBAGENT_CONTROL_SCOPES = ["children", "none"];
function normalizeSubagentRole(value) {
	const trimmed = normalizeOptionalLowercaseString(value);
	return SUBAGENT_SESSION_ROLES.find((entry) => entry === trimmed);
}
function normalizeSubagentControlScope(value) {
	const trimmed = normalizeOptionalLowercaseString(value);
	return SUBAGENT_CONTROL_SCOPES.find((entry) => entry === trimmed);
}
function shouldInspectStoredSubagentEnvelope(sessionKey) {
	return isSubagentSessionKey(sessionKey) || isAcpSessionKey(sessionKey);
}
function isDashboardSessionKey(sessionKey) {
	return parseAgentSessionKey(sessionKey)?.rest.startsWith("dashboard:") === true;
}
function canInspectStoredSubagentEnvelope(sessionKey, store) {
	return shouldInspectStoredSubagentEnvelope(sessionKey) || Boolean(store) && isDashboardSessionKey(sessionKey);
}
function isSameAgentSessionStore(leftSessionKey, rightSessionKey) {
	const leftAgentId = normalizeOptionalLowercaseString(parseAgentSessionKey(leftSessionKey)?.agentId);
	const rightAgentId = normalizeOptionalLowercaseString(parseAgentSessionKey(rightSessionKey)?.agentId);
	return Boolean(leftAgentId) && leftAgentId === rightAgentId;
}
function resolveSessionCapabilityEntry(params) {
	if (params.store) return params.store[params.sessionKey] ?? findSubagentSessionEntryById(params.store, params.sessionKey);
	if (!params.cfg) return;
	const parsed = parseAgentSessionKey(params.sessionKey);
	if (!parsed?.agentId) return;
	const store = readSubagentSessionStore(resolveSessionStorePathCore(params.cfg.session?.store, { agentId: parsed.agentId }), parsed.agentId);
	return store[params.sessionKey] ?? findSubagentSessionEntryById(store, params.sessionKey);
}
/** Resolve the session-store subset used for subagent capability lookup. */
function resolveSubagentCapabilityStore(sessionKey, opts) {
	const normalizedSessionKey = normalizeOptionalString(sessionKey);
	if (!normalizedSessionKey) return opts?.store;
	if (opts?.store) return opts.store;
	if (!opts?.cfg || !shouldInspectStoredSubagentEnvelope(normalizedSessionKey) && !isDashboardSessionKey(normalizedSessionKey)) return;
	const parsed = parseAgentSessionKey(normalizedSessionKey);
	if (!parsed?.agentId) return;
	return readSubagentSessionStore(resolveSessionStorePathCore(opts.cfg.session?.store, { agentId: parsed.agentId }), parsed.agentId);
}
/** Resolve depth-derived role/scope booleans for a subagent position. */
function resolveSubagentRoleForDepth(params) {
	const depth = resolveNonNegativeIntegerOption(params.depth, 0);
	const maxSpawnDepth = resolveIntegerOption(params.maxSpawnDepth, 1, { min: 1 });
	if (depth <= 0) return "main";
	return depth < maxSpawnDepth ? "orchestrator" : "leaf";
}
function resolveSubagentControlScopeForRole(role) {
	return role === "leaf" ? "none" : "children";
}
/** Resolve depth-derived role, scope, and spawn/control booleans. */
function resolveSubagentCapabilities(params) {
	const depth = resolveNonNegativeIntegerOption(params.depth, 0);
	const role = resolveSubagentRoleForDepth(params);
	const controlScope = resolveSubagentControlScopeForRole(role);
	return {
		depth,
		role,
		controlScope,
		canSpawn: role === "main" || role === "orchestrator",
		canControlChildren: controlScope === "children"
	};
}
function isStoredSubagentEnvelopeSession(params, visited = /* @__PURE__ */ new Set()) {
	const normalizedSessionKey = normalizeOptionalString(params.sessionKey);
	if (!normalizedSessionKey || visited.has(normalizedSessionKey)) return false;
	visited.add(normalizedSessionKey);
	if (isSubagentSessionKey(normalizedSessionKey)) return true;
	const dashboardSession = isDashboardSessionKey(normalizedSessionKey);
	if (!isAcpSessionKey(normalizedSessionKey) && !dashboardSession) return false;
	const entry = params.entry ?? resolveSessionCapabilityEntry({
		sessionKey: normalizedSessionKey,
		cfg: params.cfg,
		store: params.store
	});
	if (dashboardSession) return typeof entry?.spawnDepth === "number" && Number.isInteger(entry.spawnDepth) && entry.spawnDepth >= 1 && Boolean(normalizeOptionalString(entry.spawnedBy));
	if (normalizeSubagentRole(entry?.subagentRole) || normalizeSubagentControlScope(entry?.subagentControlScope)) return true;
	const spawnedBy = normalizeOptionalString(entry?.spawnedBy);
	if (!spawnedBy) return false;
	const parentStore = isSameAgentSessionStore(normalizedSessionKey, spawnedBy) ? params.store : void 0;
	return isStoredSubagentEnvelopeSession({
		sessionKey: spawnedBy,
		cfg: params.cfg,
		store: parentStore
	}, visited);
}
/** Return true when a session key or persisted ACP envelope represents a subagent. */
function isSubagentEnvelopeSession(sessionKey, opts) {
	const normalizedSessionKey = normalizeOptionalString(sessionKey);
	if (!normalizedSessionKey) return false;
	if (isSubagentSessionKey(normalizedSessionKey)) return true;
	if (!isAcpSessionKey(normalizedSessionKey) && !isDashboardSessionKey(normalizedSessionKey)) return false;
	if (isDashboardSessionKey(normalizedSessionKey) && !opts?.entry && !opts?.store) return false;
	const store = resolveSubagentCapabilityStore(normalizedSessionKey, opts);
	return isStoredSubagentEnvelopeSession({
		sessionKey: normalizedSessionKey,
		cfg: opts?.cfg,
		store,
		entry: opts?.entry
	});
}
/**
* Resolve a persisted child envelope that is strong enough to carry authority.
* Session-key shape alone is useful for fail-closed subagent restrictions, but
* never sufficient to bypass requester-scoped policy re-resolution.
*/
function resolvePersistedSubagentToolPolicyEnvelope(sessionKey, opts) {
	const normalizedSessionKey = normalizeOptionalString(sessionKey);
	if (!normalizedSessionKey || !canInspectStoredSubagentEnvelope(normalizedSessionKey, opts?.store)) return;
	const store = resolveSubagentCapabilityStore(normalizedSessionKey, opts);
	const entry = resolveSessionCapabilityEntry({
		sessionKey: normalizedSessionKey,
		cfg: opts?.cfg,
		store
	});
	const spawnedBy = normalizeOptionalString(entry?.spawnedBy);
	const hasSpawnDepth = typeof entry?.spawnDepth === "number" && Number.isInteger(entry.spawnDepth) && entry.spawnDepth >= 1;
	const role = normalizeSubagentRole(entry?.subagentRole);
	const controlScope = normalizeSubagentControlScope(entry?.subagentControlScope);
	if (!entry || !spawnedBy || entry.inheritedToolPolicyVersion !== 1 || !isSubagentEnvelopeSession(normalizedSessionKey, {
		...opts,
		store,
		entry
	}) || !hasSpawnDepth && role === void 0 && controlScope === void 0) return;
	const completionOwnerSessionKey = normalizeOptionalString(entry.completionOwnerSessionKey);
	return {
		sessionKey: normalizedSessionKey,
		spawnedBy,
		...completionOwnerSessionKey ? { completionOwnerSessionKey } : {},
		inheritedToolAllow: normalizeInheritedToolAllowlist(entry.inheritedToolAllow),
		inheritedToolDeny: normalizeInheritedToolDenylist(entry.inheritedToolDeny)
	};
}
/**
* Resolve the effective subagent role/scope, combining stored envelope metadata
* with depth-derived fallback behavior.
*/
function resolveStoredSubagentCapabilities(sessionKey, opts) {
	const normalizedSessionKey = normalizeOptionalString(sessionKey);
	const maxSpawnDepth = opts?.cfg?.agents?.defaults?.subagents?.maxSpawnDepth ?? 1;
	if (!normalizedSessionKey) return resolveSubagentCapabilities({
		depth: 0,
		maxSpawnDepth
	});
	if (!shouldInspectStoredSubagentEnvelope(normalizedSessionKey)) return resolveSubagentCapabilities({
		depth: getSubagentDepthFromSessionStore(normalizedSessionKey, {
			cfg: opts?.cfg,
			store: opts?.store,
			agentId: opts?.agentId
		}),
		maxSpawnDepth
	});
	const store = resolveSubagentCapabilityStore(normalizedSessionKey, opts);
	const entry = normalizedSessionKey ? resolveSessionCapabilityEntry({
		sessionKey: normalizedSessionKey,
		cfg: opts?.cfg,
		store
	}) : void 0;
	const depthStore = opts?.cfg && typeof entry?.spawnDepth !== "number" ? void 0 : store;
	const depth = getSubagentDepthFromSessionStore(normalizedSessionKey, {
		cfg: opts?.cfg,
		store: depthStore,
		agentId: opts?.agentId
	});
	if (!isSubagentEnvelopeSession(normalizedSessionKey, {
		...opts,
		store,
		entry
	})) return resolveSubagentCapabilities({
		depth,
		maxSpawnDepth
	});
	const storedRole = normalizeSubagentRole(entry?.subagentRole);
	const storedControlScope = normalizeSubagentControlScope(entry?.subagentControlScope);
	const fallback = resolveSubagentCapabilities({
		depth,
		maxSpawnDepth
	});
	const role = storedRole ?? fallback.role;
	const controlScope = storedControlScope ?? resolveSubagentControlScopeForRole(role);
	return {
		depth,
		role,
		controlScope,
		canSpawn: role === "main" || role === "orchestrator",
		canControlChildren: controlScope === "children"
	};
}
/** Resolve inherited tool deny rules stored on a subagent envelope. */
function resolveStoredSubagentInheritedToolDenylist(sessionKey, opts) {
	const normalizedSessionKey = normalizeOptionalString(sessionKey);
	if (!normalizedSessionKey || !canInspectStoredSubagentEnvelope(normalizedSessionKey, opts?.store)) return [];
	const store = resolveSubagentCapabilityStore(normalizedSessionKey, opts);
	const entry = resolveSessionCapabilityEntry({
		sessionKey: normalizedSessionKey,
		cfg: opts?.cfg,
		store
	});
	return normalizeInheritedToolDenylist(entry?.inheritedToolDeny);
}
/** Resolve inherited tool allow rules stored on a subagent envelope. */
function resolveStoredSubagentInheritedToolAllowlist(sessionKey, opts) {
	const normalizedSessionKey = normalizeOptionalString(sessionKey);
	if (!normalizedSessionKey || !canInspectStoredSubagentEnvelope(normalizedSessionKey, opts?.store)) return [];
	const store = resolveSubagentCapabilityStore(normalizedSessionKey, opts);
	const entry = resolveSessionCapabilityEntry({
		sessionKey: normalizedSessionKey,
		cfg: opts?.cfg,
		store
	});
	return normalizeInheritedToolAllowlist(entry?.inheritedToolAllow);
}
//#endregion
export { resolveStoredSubagentInheritedToolDenylist as a, getSubagentDepthFromSessionStore as c, resolveStoredSubagentInheritedToolAllowlist as i, resolvePersistedSubagentToolPolicyEnvelope as n, resolveSubagentCapabilities as o, resolveStoredSubagentCapabilities as r, resolveSubagentCapabilityStore as s, isSubagentEnvelopeSession as t };
