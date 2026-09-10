import { n as resolveGlobalMap } from "./global-singleton-Dc_stLtU.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { i as getNodeSqliteKysely, n as executeSqliteQuerySync } from "./kysely-sync-DKYGT267.js";
import { E as ensureColumn, O as tableHasColumn } from "./openclaw-state-db-cache-AunrvrzG.js";
import { i as openOpenClawStateDatabase, s as runOpenClawStateWriteTransaction } from "./openclaw-state-db-Bh3Bq87y.js";
import { r as readConfigMachineState } from "./config-machine-state-HqtPitRm.js";
import { _ as resolveConfiguredAgentId, g as resolveAmbientOwnerAgentId, t as AgentSelectionRequiredError } from "./agent-scope-config-CUiGBd59.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { O as parseAgentSessionKey } from "./session-key-CRjxKW0X.js";
import { t as isIncognitoSessionKey } from "./incognito-session-key-BwpD1Lwd.js";
import { _ as resolveSessionAgentId } from "./agent-scope-CSlN0kZb.js";
import { n as resolvePersistedSessionStoreOwnerForKey } from "./session-store-owner-Df_uY3tv.js";
import { t as ErrorCodes } from "./gateway-error-details-B9ifm8Ur.js";
import { i as sessionMutationTargetFields, n as isRequiredSessionTargetMethod, r as isSessionProfileDependentMethod, t as isApprovalSessionTargetMethod } from "./session-method-policy-BAkxsFSx.js";
import { d as errorShape } from "./error-codes-DKSaEjvx.js";
import { a as listSessionEntriesReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { a as sessionCreatorProfileId } from "./session-entry-provenance-Ch9ZRplR.js";
import { Lt as applySessionEntryReplacements } from "./session-accessor-K0XuW6ln.js";
import { r as resolveAgentMainSessionKey } from "./main-session-TZQkcBLs.js";
import { n as resolveSessionStoreAgentId, r as resolveSessionStoreKey, t as canonicalizeSessionKeyForAgent } from "./session-store-key-DVtVp9hU.js";
import { o as resolveAllAgentSessionStoreTargetsSync } from "./targets-M9xRkscp.js";
import { h as readUserProfileAliases } from "./user-profiles-ftXkbNlK.js";
import { c as isSessionMember } from "./sessions-eI69vxPt.js";
import { _ as bumpGatewayAccessRevision, g as isGatewayClientProfilePending, h as gatewayClientSessionCreator, i as operatorSessionCap, o as resolveGatewayOperatorRoleActor, p as authenticatedProfileUnavailableError, s as resolveOperatorRolePolicy, t as authorizeGatewaySessionCreation } from "./operator-role-policy-B_VzZMic.js";
import { c as resolveCanonicalSessionStoreMatchFromStoreKeys, f as resolveGatewaySessionStoreTargetWithStore } from "./session-utils-store-Dlphca2N.js";
import "./session-utils-C2DgQXXH.js";
import { s as resolveAuthorizedBoardViewTicketClaims } from "./board-view-ticket-Sc3N6g2B.js";
import "./server-utils-CT_zAZOY.js";
//#region src/gateway/session-creator.ts
/** Namespace qualification precedes aliases; responsibility and participation never grant access. */
function isSessionCreatorProfile(actor, profileId) {
	return prepareSessionCreatorProfile(profileId)(actor);
}
/** One read-only synchronous fan-out only; prepare again after awaits or profile/storage changes. */
function prepareSessionCreatorProfile(profileId, aliases) {
	let callerAliases = aliases;
	return (actor) => {
		const creatorId = sessionCreatorProfileId(actor);
		return Boolean(creatorId && profileId && (creatorId === profileId || (callerAliases ??= readUserProfileAliases(profileId)).has(creatorId)));
	};
}
//#endregion
//#region src/gateway/session-mutation-authorization-error.ts
var SessionMutationAuthorizationChangedError = class extends Error {
	constructor(error) {
		super(error.message);
		this.name = "SessionMutationAuthorizationChangedError";
		this.error = error;
	}
};
//#endregion
//#region src/gateway/session-sharing-policy.ts
function resolveSessionVisibility(entry) {
	return entry.visibility ?? "shared";
}
function isGatewayAdmin(client) {
	return client?.connect?.scopes?.includes("operator.admin") === true;
}
function allowedSessionVisibilities(cfg) {
	const policy = cfg.session?.sharing;
	return [
		"shared",
		...policy?.readOnly === false ? [] : ["read-only"],
		...policy?.suggest === false ? [] : ["suggest"],
		...policy?.drafts === false ? [] : ["draft"]
	];
}
function isSessionVisibilityAllowed(cfg, visibility) {
	return allowedSessionVisibilities(cfg).includes(visibility);
}
function resolveSessionSharingTarget(params) {
	const target = resolveGatewaySessionStoreTargetWithStore({
		cfg: params.cfg,
		key: params.sessionKey,
		agentId: params.agentId,
		clone: false,
		projection: "list",
		...params.exactRead ? { exactRead: "warm" } : {},
		...params.storeCache ? { storeCache: params.storeCache } : {},
		...params.targetDiscoveryCache ? { targetDiscoveryCache: params.targetDiscoveryCache } : {}
	});
	const match = resolveCanonicalSessionStoreMatchFromStoreKeys(target.store, target.storeKeys);
	return match ? {
		agentId: target.agentId,
		canonicalKey: target.canonicalKey,
		entry: match.entry,
		storeKey: match.key,
		storeKeys: target.storeKeys,
		storePath: target.storePath
	} : null;
}
function sharingIdentity(client, actor) {
	const operator = actor?.kind === "operator" ? { id: actor.profileId } : void 0;
	return gatewayClientSessionCreator(client) ?? operator;
}
function resolveSessionSharingRole(params, preparedCap, isCreator) {
	if (isGatewayAdmin(params.client)) return "admin";
	const operatorActor = resolveGatewayOperatorRoleActor(params.client);
	const identity = sharingIdentity(params.client, operatorActor);
	if (!identity) return params.client?.authenticatedGitHubIdentitySync || params.cfg?.gateway?.roles && operatorActor?.kind !== "system" ? "viewer" : "owner";
	if ((isCreator ?? prepareSessionCreatorProfile(identity.id))(params.target.entry.createdActor)) return "owner";
	const sessionCap = preparedCap ? preparedCap.value : params.cfg && operatorSessionCap(params.client, params.cfg);
	if (sessionCap === "write" && resolveSessionVisibility(params.target.entry) !== "draft" && params.target.entry.incognito !== true && !isIncognitoSessionKey(params.target.canonicalKey)) return "member";
	if (sessionCap === "none") return "viewer";
	return params.isMember ?? (params.includeMembership !== false && isSessionMember({
		agentId: params.target.agentId,
		sessionKey: params.target.storeKey,
		storePath: params.target.storePath
	}, identity.id)) ? "member" : "viewer";
}
function canManageSessionSharing(role) {
	return role === "admin" || role === "owner";
}
function hiddenSessionNotFound(sessionKey, incognito = false) {
	const label = incognito ? "Incognito session" : "Session";
	return errorShape(ErrorCodes.INVALID_REQUEST, `${label} "${sessionKey}" was not found.`);
}
function isIncognitoSessionTarget(params) {
	return params.target ? params.target.entry.incognito === true || isIncognitoSessionKey(params.target.canonicalKey) : isIncognitoSessionKey(params.sessionKey);
}
function isResolvedIncognitoSession(params) {
	return isIncognitoSessionTarget({
		sessionKey: params.sessionKey,
		target: resolveSessionSharingTarget(params)
	});
}
function authorizeIncognitoSessionTarget(params) {
	if (!isIncognitoSessionTarget(params)) return null;
	if (isGatewayAdmin(params.client)) return null;
	if (isGatewayClientProfilePending(params.client)) return authenticatedProfileUnavailableError();
	if (!gatewayClientSessionCreator(params.client)) return null;
	return hiddenSessionNotFound(params.sessionKey, true);
}
function canAccessIncognitoSession(params) {
	if (isGatewayAdmin(params.client)) return true;
	return authorizeIncognitoSessionTarget({
		client: params.client,
		sessionKey: params.sessionKey,
		target: resolveSessionSharingTarget(params)
	}) === null;
}
function authorizeResolvedSessionMutation(params) {
	if (isGatewayAdmin(params.client) && !params.cfg.gateway?.roles) return null;
	if (isGatewayClientProfilePending(params.client)) return authenticatedProfileUnavailableError();
	const target = resolveSessionSharingTarget(params);
	if (target) {
		const agentError = authorizeSessionAgentRun({
			cfg: params.cfg,
			client: params.client,
			target
		});
		if (agentError) return agentError;
	}
	if (isGatewayAdmin(params.client)) return null;
	const incognitoError = authorizeIncognitoSessionTarget({
		client: params.client,
		sessionKey: params.sessionKey,
		target
	});
	if (incognitoError) return incognitoError;
	if (!target) return null;
	return authorizeSessionSharingTarget({
		cfg: params.cfg,
		client: params.client,
		target
	});
}
function authorizeSessionAgentRun(params) {
	const agentError = authorizeGatewaySessionCreation({
		cfg: params.cfg,
		client: params.client,
		agentId: params.target.agentId
	});
	if (agentError) return agentError;
	if (params.cfg.gateway?.roles && params.target.entry.sandbox !== "required" && resolveOperatorRolePolicy(params.client, params.cfg)?.sandbox === "required") return errorShape(ErrorCodes.FORBIDDEN, `Your operator role requires a sandboxed session; create a new session instead of running in "${params.target.canonicalKey}".`);
	return null;
}
function authorizeSessionSharingTarget(params) {
	const visibility = resolveSessionVisibility(params.target.entry);
	const sessionCap = params.cfg && operatorSessionCap(params.client, params.cfg);
	const role = resolveSessionSharingRole(params, { value: sessionCap });
	if (sessionCap === "none" && role !== "owner" && role !== "admin") return hiddenSessionNotFound(params.target.canonicalKey);
	return (visibility === "draft" ? canManageSessionSharing(role) : role !== "viewer" || visibility === "shared" && !(sessionCap === "view" || sessionCap === "suggest")) ? null : errorShape(ErrorCodes.INVALID_REQUEST, `session is ${visibility} for this connection`, { details: {
		code: "SESSION_PARTICIPATION_REQUIRED",
		sessionKey: params.target.canonicalKey,
		visibility
	} });
}
function authorizeSessionSharing(params) {
	const target = resolveSessionSharingTarget(params);
	return target && authorizeSessionSharingTarget({
		cfg: params.cfg,
		client: params.client,
		target
	});
}
//#endregion
//#region src/gateway/session-sharing-snapshot-cache.ts
const SNAPSHOT_CACHE_LIMIT = 2048;
const snapshotCache = /* @__PURE__ */ new Map();
const snapshotAliases = /* @__PURE__ */ new Map();
const snapshotKeysBySessionKey = /* @__PURE__ */ new Map();
const aliasKeysBySessionKey = /* @__PURE__ */ new Map();
const aliasKeysByCanonicalKey = /* @__PURE__ */ new Map();
function snapshotKey(sessionKey, agentId) {
	return `${agentId ?? ""}\0${sessionKey}`;
}
function logicalSessionKey(key) {
	return key.slice(key.lastIndexOf("\0") + 1);
}
function addReverseIndex(index, key, value) {
	const values = index.get(key) ?? /* @__PURE__ */ new Set();
	values.add(value);
	index.set(key, values);
}
function removeReverseIndex(index, key, value) {
	const values = index.get(key);
	values?.delete(value);
	if (values?.size === 0) index.delete(key);
}
function removeSnapshotAlias(alias) {
	const canonical = snapshotAliases.get(alias);
	if (!canonical) return;
	snapshotAliases.delete(alias);
	removeReverseIndex(aliasKeysBySessionKey, logicalSessionKey(alias), alias);
	removeReverseIndex(aliasKeysByCanonicalKey, canonical, alias);
}
function removeSnapshot(key) {
	if (!snapshotCache.delete(key)) return;
	removeReverseIndex(snapshotKeysBySessionKey, logicalSessionKey(key), key);
	for (const alias of aliasKeysByCanonicalKey.get(key) ?? []) removeSnapshotAlias(alias);
}
function rememberSnapshot(key, snapshot) {
	const known = snapshotCache.delete(key);
	snapshotCache.set(key, snapshot);
	if (!known) addReverseIndex(snapshotKeysBySessionKey, logicalSessionKey(key), key);
	if (snapshotCache.size <= SNAPSHOT_CACHE_LIMIT) return;
	const oldest = snapshotCache.keys().next().value;
	if (oldest) removeSnapshot(oldest);
}
function rememberSnapshotAlias(alias, canonical) {
	removeSnapshotAlias(alias);
	snapshotAliases.set(alias, canonical);
	addReverseIndex(aliasKeysBySessionKey, logicalSessionKey(alias), alias);
	addReverseIndex(aliasKeysByCanonicalKey, canonical, alias);
	if (snapshotAliases.size <= SNAPSHOT_CACHE_LIMIT * 2) return;
	const oldest = snapshotAliases.keys().next().value;
	if (oldest) removeSnapshotAlias(oldest);
}
function invalidateSessionSharingSnapshot(sessionKey) {
	bumpGatewayAccessRevision();
	if (sessionKey) {
		const matchingCanonicalKeys = new Set(snapshotKeysBySessionKey.get(sessionKey));
		for (const alias of aliasKeysBySessionKey.get(sessionKey) ?? []) {
			const canonical = snapshotAliases.get(alias);
			if (canonical) matchingCanonicalKeys.add(canonical);
		}
		for (const key of matchingCanonicalKeys) removeSnapshot(key);
		return;
	}
	snapshotCache.clear();
	snapshotAliases.clear();
	snapshotKeysBySessionKey.clear();
	aliasKeysBySessionKey.clear();
	aliasKeysByCanonicalKey.clear();
}
function loadCachedSessionSharingSnapshot(params) {
	const requestedKey = snapshotKey(params.sessionKey, params.agentId);
	const aliasedKey = snapshotAliases.get(requestedKey);
	const cached = snapshotCache.get(aliasedKey ?? requestedKey);
	if (cached) return cached;
	const resolved = params.resolve();
	const canonicalKey = snapshotKey(resolved.canonicalKey, resolved.canonicalAgentId);
	const canonicalCached = snapshotCache.get(canonicalKey);
	if (!canonicalCached) rememberSnapshot(canonicalKey, resolved.snapshot);
	if (requestedKey !== canonicalKey) rememberSnapshotAlias(requestedKey, canonicalKey);
	return canonicalCached ?? resolved.snapshot;
}
//#endregion
//#region src/gateway/session-groups.ts
var SessionGroupNotFoundError = class extends Error {
	constructor(name) {
		super(`unknown session group: ${name}`);
		this.name = "SessionGroupNotFoundError";
	}
};
var SessionGroupNotEmptyError = class extends Error {
	constructor(groups) {
		super(`sessions.groups.put cannot drop groups that still have member sessions: ${groups.map((group) => `"${group.name}" (${group.memberSessions})`).join(", ")}; include them in names or remove them via sessions.groups.delete`);
		this.groups = groups;
		this.name = "SessionGroupNotEmptyError";
	}
};
const ensuredSessionGroupDefaultsDatabases = /* @__PURE__ */ new WeakSet();
const SIDEBAR_SECTION_ORDER_STATE_KEY = "sidebar.sectionOrder";
function dbFor(env) {
	return openOpenClawStateDatabase({ env }).db;
}
function kyselyFor(db) {
	return getNodeSqliteKysely(db);
}
function updateSidebarSectionOrder(db, update) {
	const kysely = kyselyFor(db);
	const row = executeSqliteQuerySync(db, kysely.selectFrom("config_machine_state").select("value_json").where("state_key", "=", SIDEBAR_SECTION_ORDER_STATE_KEY)).rows[0];
	const next = update(row ? JSON.parse(row.value_json) : void 0);
	if (!next) return;
	const valueJson = JSON.stringify(next);
	const updatedAtMs = Date.now();
	executeSqliteQuerySync(db, kysely.insertInto("config_machine_state").values({
		state_key: SIDEBAR_SECTION_ORDER_STATE_KEY,
		value_json: valueJson,
		updated_at_ms: updatedAtMs
	}).onConflict((conflict) => conflict.column("state_key").doUpdateSet({
		value_json: valueJson,
		updated_at_ms: updatedAtMs
	})));
}
function hasSessionGroupDefaultsSchema(db) {
	return tableHasColumn(db, "session_groups", "cwd") && tableHasColumn(db, "session_groups", "worktree");
}
function normalizeGroupNames(names) {
	const seen = /* @__PURE__ */ new Set();
	const normalized = [];
	for (const raw of names) {
		const name = normalizeOptionalString(raw);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		normalized.push(name);
	}
	return normalized;
}
function normalizeSidebarSectionOrder(sectionOrder, groupNames) {
	const groups = new Set(groupNames);
	const seen = /* @__PURE__ */ new Set();
	const normalized = [];
	for (const raw of sectionOrder) {
		const sectionId = raw.trim();
		let canonical = null;
		if (sectionId === "ungrouped" || sectionId === "groups" || sectionId === "work") canonical = sectionId;
		else if (sectionId.startsWith("category:")) {
			const name = normalizeOptionalString(sectionId.slice(9));
			if (name && groups.has(name)) canonical = `category:${name}`;
		} else if (sectionId.startsWith("catalog:")) {
			const catalogId = normalizeOptionalString(sectionId.slice(8));
			if (catalogId) canonical = `catalog:${catalogId}`;
		}
		if (!canonical || seen.has(canonical)) continue;
		seen.add(canonical);
		normalized.push(canonical);
	}
	return normalized;
}
function listSessionGroups(env = process.env) {
	const db = dbFor(env);
	const query = kyselyFor(db).selectFrom("session_groups").select(["name", "position"]).orderBy("position", "asc").orderBy("name", "asc");
	return executeSqliteQuerySync(db, query).rows;
}
function listSessionGroupDefaults(env = process.env) {
	const db = dbFor(env);
	if (!hasSessionGroupDefaultsSchema(db)) return listSessionGroups(env).map(({ name }) => ({ name }));
	return executeSqliteQuerySync(db, kyselyFor(db).selectFrom("session_groups").select([
		"name",
		"cwd",
		"worktree"
	]).orderBy("position", "asc").orderBy("name", "asc")).rows.map((row) => {
		const group = { name: row.name };
		if (row.cwd) group.cwd = row.cwd;
		if (row.worktree !== null) group.worktree = row.worktree === 1;
		return group;
	});
}
function listSidebarSectionOrder(env = process.env) {
	return readConfigMachineState(SIDEBAR_SECTION_ORDER_STATE_KEY, { env }) ?? [];
}
/**
* Replaces the ordered catalog. Dropping a name whose group still has member
* sessions is rejected: member sweeps stay owned by sessions.groups.delete,
* so a put can never leave dangling categories that resurrect the group.
*/
function putSessionGroups(params) {
	const { cfg, names, sectionOrder, env = process.env } = params;
	const normalized = normalizeGroupNames(names);
	const normalizedSectionOrder = sectionOrder === void 0 ? void 0 : normalizeSidebarSectionOrder(sectionOrder, normalized);
	params.assertCurrent?.();
	const dropped = listSessionGroups(env).filter((group) => !normalized.includes(group.name));
	if (dropped.length > 0) {
		const targetsByName = resolveSessionGroupMutationTargetsByName(cfg, env);
		for (const { name } of dropped) for (const target of targetsByName.get(name) ?? []) params.assertTargetCurrent?.({
			agentId: target.agentId,
			sessionKey: target.sessionKey
		});
		const nonEmpty = dropped.map(({ name }) => ({
			name,
			memberSessions: targetsByName.get(name)?.length ?? 0
		})).filter((group) => group.memberSessions > 0);
		if (nonEmpty.length > 0) throw new SessionGroupNotEmptyError(nonEmpty);
	}
	const now = Date.now();
	runOpenClawStateWriteTransaction(({ db }) => {
		const kysely = kyselyFor(db);
		const existing = new Map(executeSqliteQuerySync(db, kysely.selectFrom("session_groups").select(["name", "created_at"])).rows.map((row) => [row.name, row]));
		executeSqliteQuerySync(db, normalized.length === 0 ? kysely.deleteFrom("session_groups") : kysely.deleteFrom("session_groups").where("name", "not in", normalized));
		normalized.forEach((name, position) => {
			const prior = existing.get(name);
			executeSqliteQuerySync(db, prior ? kysely.updateTable("session_groups").set({ position }).where("name", "=", name) : kysely.insertInto("session_groups").values({
				name,
				position,
				created_at: now
			}));
		});
		if (normalizedSectionOrder) updateSidebarSectionOrder(db, () => normalizedSectionOrder);
	}, { env });
	return listSessionGroups(env);
}
/**
* Absorbs a category assigned through sessions.patch so the catalog keeps
* covering every group an operator UI can observe, appended at the end.
*/
function ensureSessionGroupRegistered(name, env = process.env) {
	const normalized = normalizeOptionalString(name);
	if (!normalized) return false;
	let inserted = false;
	runOpenClawStateWriteTransaction(({ db }) => {
		const kysely = kyselyFor(db);
		if (executeSqliteQuerySync(db, kysely.selectFrom("session_groups").select("name").where("name", "=", normalized).limit(1)).rows[0]) return;
		inserted = true;
		const maxRow = executeSqliteQuerySync(db, kysely.selectFrom("session_groups").select("position").orderBy("position", "desc").limit(1)).rows[0];
		executeSqliteQuerySync(db, kysely.insertInto("session_groups").values({
			name: normalized,
			position: (maxRow?.position ?? -1) + 1,
			created_at: Date.now()
		}));
	}, { env });
	return inserted;
}
function renameCatalogEntry(from, to, env) {
	runOpenClawStateWriteTransaction(({ db }) => {
		const kysely = kyselyFor(db);
		const hasDefaults = hasSessionGroupDefaultsSchema(db);
		const source = executeSqliteQuerySync(db, hasDefaults ? kysely.selectFrom("session_groups").selectAll().where("name", "=", from).limit(1) : kysely.selectFrom("session_groups").select([
			"name",
			"position",
			"created_at"
		]).where("name", "=", from).limit(1)).rows[0];
		if (!source) throw new SessionGroupNotFoundError(from);
		const targetExists = executeSqliteQuerySync(db, kysely.selectFrom("session_groups").select("name").where("name", "=", to).limit(1)).rows[0];
		const sourceSectionId = `category:${from}`;
		const targetSectionId = `category:${to}`;
		executeSqliteQuerySync(db, kysely.deleteFrom("session_groups").where("name", "=", from));
		updateSidebarSectionOrder(db, (current) => {
			if (!current?.includes(sourceSectionId)) return;
			return current.includes(targetSectionId) ? current.filter((sectionId) => sectionId !== sourceSectionId) : current.map((sectionId) => sectionId === sourceSectionId ? targetSectionId : sectionId);
		});
		if (targetExists) return;
		const base = {
			name: to,
			position: source.position,
			created_at: source.created_at
		};
		executeSqliteQuerySync(db, kysely.insertInto("session_groups").values(hasDefaults ? {
			...base,
			cwd: "cwd" in source && typeof source.cwd === "string" ? source.cwd : null,
			worktree: "worktree" in source && typeof source.worktree === "number" ? source.worktree : null
		} : base));
	}, { env });
}
function updateSessionGroupDefaults(name, defaults, env = process.env) {
	const normalized = normalizeOptionalString(name);
	if (!normalized) throw new Error("group defaults update requires a non-empty name");
	const database = openOpenClawStateDatabase({ env });
	let updated = false;
	let defaultsSchemaEnsured = false;
	runOpenClawStateWriteTransaction(({ db }) => {
		const kysely = kyselyFor(db);
		if (!executeSqliteQuerySync(db, kysely.selectFrom("session_groups").select("name").where("name", "=", normalized).limit(1)).rows[0]) return;
		if (!ensuredSessionGroupDefaultsDatabases.has(db)) {
			ensureColumn(db, "session_groups", "cwd TEXT");
			ensureColumn(db, "session_groups", "worktree INTEGER");
			defaultsSchemaEnsured = true;
		}
		updated = executeSqliteQuerySync(db, kysely.updateTable("session_groups").set({
			cwd: normalizeOptionalString(defaults.cwd) ?? null,
			worktree: defaults.worktree ? 1 : 0
		}).where("name", "=", normalized)).numAffectedRows === 1n;
	}, { env });
	if (defaultsSchemaEnsured) ensuredSessionGroupDefaultsDatabases.add(database.db);
	return updated ? listSessionGroupDefaults(env) : null;
}
function resolveSessionGroupMutationTargetsByName(cfg, env = process.env) {
	const targetsByName = /* @__PURE__ */ new Map();
	for (const storeTarget of resolveAllAgentSessionStoreTargetsSync(cfg, { env })) for (const { sessionKey, entry } of listSessionEntriesReadOnly({
		agentId: storeTarget.agentId,
		storePath: storeTarget.storePath
	})) {
		const groupName = normalizeOptionalString(entry.category);
		if (!groupName) continue;
		const targets = targetsByName.get(groupName) ?? [];
		targets.push({
			sessionKey,
			agentId: storeTarget.agentId
		});
		targetsByName.set(groupName, targets);
	}
	return targetsByName;
}
/**
* Bulk-updates member session categories across every agent store without
* bumping updatedAt: group maintenance must not reshuffle recency ordering.
*/
async function updateMemberCategories(cfg, from, to, env, assertTargetCurrent) {
	let updated = 0;
	for (const target of resolveAllAgentSessionStoreTargetsSync(cfg, { env })) updated += await applySessionEntryReplacements({
		storePath: target.storePath,
		update: (entries) => {
			const replacements = entries.flatMap(({ sessionKey, entry }) => {
				if (entry.category?.trim() !== from) return [];
				try {
					assertTargetCurrent?.({
						agentId: target.agentId,
						sessionKey
					});
				} catch (error) {
					if (error instanceof SessionMutationAuthorizationChangedError) return [];
					throw error;
				}
				const next = { ...entry };
				if (to === void 0) delete next.category;
				else next.category = to;
				return [{
					sessionKey,
					entry: next
				}];
			});
			return {
				replacements,
				result: replacements.length
			};
		}
	});
	return updated;
}
async function renameSessionGroup(params) {
	const env = params.env ?? process.env;
	const from = normalizeOptionalString(params.name);
	const to = normalizeOptionalString(params.to);
	if (!from || !to) throw new Error("group rename requires non-empty names");
	if (from !== to) {
		params.assertCurrent?.();
		renameCatalogEntry(from, to, env);
	}
	const updatedSessions = from === to ? 0 : await updateMemberCategories(params.cfg, from, to, env, params.assertTargetCurrent);
	return {
		groups: listSessionGroups(env),
		sectionOrder: listSidebarSectionOrder(env),
		updatedSessions
	};
}
async function deleteSessionGroup(params) {
	const env = params.env ?? process.env;
	const name = normalizeOptionalString(params.name);
	if (!name) throw new Error("group delete requires a non-empty name");
	params.assertCurrent?.();
	runOpenClawStateWriteTransaction(({ db }) => {
		const kysely = kyselyFor(db);
		executeSqliteQuerySync(db, kysely.deleteFrom("session_groups").where("name", "=", name));
		const sectionId = `category:${name}`;
		updateSidebarSectionOrder(db, (current) => current?.includes(sectionId) ? current.filter((section) => section !== sectionId) : void 0);
	}, { env });
	const updatedSessions = await updateMemberCategories(params.cfg, name, void 0, env, params.assertTargetCurrent);
	return {
		groups: listSessionGroups(env),
		sectionOrder: listSidebarSectionOrder(env),
		updatedSessions
	};
}
//#endregion
//#region src/gateway/talk-session-registry.ts
/**
* Process-local registry that lets Talk protocol methods resolve opaque
* `sessionId` values to the concrete relay or managed-room backend.
*/
const unifiedTalkSessions = resolveGlobalMap(Symbol.for("openclaw.unifiedTalkSessions"), "close-and-restart");
const talkConnectionCleanups = resolveGlobalMap(Symbol.for("openclaw.talkConnectionCleanups"), "close-and-restart");
/**
* Keeps one owner cleanup per relay kind until the connection closes.
* Replacing by kind stays bounded while the owner cleanup scans all live sessions.
*/
function registerTalkConnectionCleanup(connId, kind, cleanup) {
	const cleanups = talkConnectionCleanups.get(connId) ?? /* @__PURE__ */ new Map();
	cleanups.set(kind, cleanup);
	talkConnectionCleanups.set(connId, cleanups);
}
/** Runs and forgets every Talk cleanup owned by a disconnected gateway connection. */
function cleanupTalkConnection(connId, log) {
	const cleanups = talkConnectionCleanups.get(connId);
	if (!cleanups) return;
	talkConnectionCleanups.delete(connId);
	for (const [kind, cleanup] of cleanups) try {
		cleanup();
	} catch (error) {
		log.warn(`failed to run ${kind} Talk cleanup after connection disconnect: ${formatErrorMessage(error)}`);
	}
}
/** Associates a public Talk session id with its concrete gateway backend. */
function rememberUnifiedTalkSession(sessionId, session) {
	unifiedTalkSessions.set(sessionId, session);
}
/** Resolves a Talk session id or throws the protocol-facing unknown-session error. */
function getUnifiedTalkSession(sessionId) {
	const session = unifiedTalkSessions.get(sessionId);
	if (!session) throw new Error("Unknown Talk session");
	return session;
}
/** Retains the realtime relay's admitted target without reinterpreting current defaults. */
function resolveUnifiedTalkSessionTarget(sessionId, connId) {
	const session = unifiedTalkSessions.get(sessionId);
	if (session?.kind !== "realtime-relay") return;
	requireUnifiedTalkSessionConn(session, connId);
	const target = session.sessionTarget;
	return {
		target,
		isCurrent: () => unifiedTalkSessions.get(sessionId) === session && session.connId === connId && session.sessionTarget === target
	};
}
/** Removes a Talk session id after the concrete backend closes. */
function forgetUnifiedTalkSession(sessionId) {
	unifiedTalkSessions.delete(sessionId);
}
/** Enforces that a relay-backed Talk session is controlled by its owner socket. */
function requireUnifiedTalkSessionConn(session, connId) {
	if (!connId || session.connId !== connId) throw new Error("Talk session is not owned by this connection");
	return connId;
}
//#endregion
//#region src/gateway/session-sharing-target-input.ts
function resolveDirectSessionTargets(method, params) {
	if (method === "sessions.create" || method === "sessions.list") return [];
	if (!params || typeof params !== "object" || Array.isArray(params)) return [];
	const record = params;
	const candidates = [record.key, record.sessionKey];
	if (Array.isArray(record.keys)) candidates.push(...record.keys);
	if (Array.isArray(record.sessionKeys)) candidates.push(...record.sessionKeys);
	const agentId = normalizeOptionalString(record.agentId);
	return candidates.flatMap((candidate) => typeof candidate === "string" ? [{
		sessionKey: candidate,
		...agentId ? { agentId } : {}
	}] : []);
}
function resolveDirectIncognitoTargets(method, params) {
	return resolveDirectSessionTargets(method, params).filter((target) => isIncognitoSessionKey(canonicalizeSessionKeyForAgent(target.agentId ?? "main", target.sessionKey)));
}
function readSessionSharingStringParam(params, key) {
	if (!params || typeof params !== "object" || Array.isArray(params)) return;
	return normalizeOptionalString(params[key]);
}
function resolveSessionGroupMutationTargets(params) {
	const groupName = readSessionSharingStringParam(params.requestParams, "name");
	return groupName ? resolveSessionGroupMutationTargetsByName(params.getCfg()).get(groupName) ?? [] : void 0;
}
function resolveSessionGroupsPutMutationTargets(getCfg, requestParams) {
	const names = requestParams && typeof requestParams === "object" && "names" in requestParams ? requestParams.names : void 0;
	if (!Array.isArray(names)) return;
	const requested = new Set(normalizeGroupNames(names.filter((name) => typeof name === "string")));
	const dropped = listSessionGroups().map((group) => group.name).filter((name) => !requested.has(name));
	if (dropped.length === 0) return [];
	const byName = resolveSessionGroupMutationTargetsByName(getCfg());
	return dropped.flatMap((name) => byName.get(name) ?? []);
}
function resolveApprovalSessionTarget(method, params, context) {
	const id = readSessionSharingStringParam(params, "id");
	if (!id) return;
	const kind = readSessionSharingStringParam(params, "kind");
	const manager = method === "plugin.approval.resolve" || kind === "plugin" ? context.pluginApprovalManager : method === "approval.resolve" && kind === "system-agent" ? context.systemAgentApprovalManager : context.execApprovalManager;
	const resolvedId = manager?.lookupApprovalId(id, { includeResolved: true });
	const recordId = resolvedId?.kind === "exact" || resolvedId?.kind === "prefix" ? resolvedId.id : id;
	const request = manager?.getSnapshot(recordId)?.request;
	const sessionKey = readSessionSharingStringParam(request, "sessionKey");
	const agentId = readSessionSharingStringParam(request, "agentId");
	return sessionKey ? {
		sessionKey,
		...agentId ? { agentId } : {}
	} : void 0;
}
/** Realtime creates authorize their effective default; transcription stays sessionless. */
function resolveTalkSessionTargetInput(method, params, connId) {
	if (method === "talk.session.steer") {
		const sessionId = readSessionSharingStringParam(params, "sessionId");
		const retained = sessionId ? resolveUnifiedTalkSessionTarget(sessionId, connId) : void 0;
		return retained ? {
			kind: "relay",
			...retained
		} : void 0;
	}
	if (method !== "talk.client.create" && method !== "talk.client.toolCall" && method !== "talk.session.create" && method !== "talk.client.transcript" && method !== "talk.client.close" && method !== "talk.client.steer") return;
	const sessionKey = readSessionSharingStringParam(params, "sessionKey");
	if (sessionKey) return {
		kind: "request",
		sessionKey
	};
	if (method === "talk.client.create") return { kind: "request" };
	if (method === "talk.session.create" && (readSessionSharingStringParam(params, "mode") ?? "realtime") === "realtime" && readSessionSharingStringParam(params, "transport") !== "managed-room") return { kind: "request" };
}
function resolveSessionMutationTargets(params) {
	if (params.method === "sessions.patchMany") {
		const targets = params.requestParams && typeof params.requestParams === "object" && "targets" in params.requestParams ? params.requestParams.targets : void 0;
		return Array.isArray(targets) ? targets.slice(0, 101).flatMap((target) => {
			const sessionKey = readSessionSharingStringParam(target, "key");
			const agentId = readSessionSharingStringParam(target, "agentId");
			return sessionKey ? [{
				sessionKey,
				...agentId ? { agentId } : {}
			}] : [];
		}) : void 0;
	}
	if (params.method === "sessions.groups.rename" || params.method === "sessions.groups.delete" || params.method === "sessions.groups.update") return resolveSessionGroupMutationTargets({
		getCfg: params.getCfg,
		requestParams: params.requestParams
	});
	if (params.method === "sessions.groups.put") return resolveSessionGroupsPutMutationTargets(params.getCfg, params.requestParams);
	if (isApprovalSessionTargetMethod(params.method)) {
		const target = resolveApprovalSessionTarget(params.method, params.requestParams, params.context);
		return target ? [target] : void 0;
	}
	const requestedAgentId = readSessionSharingStringParam(params.requestParams, "agentId");
	const directTargets = [];
	for (const field of sessionMutationTargetFields(params.method)) {
		const sessionKey = readSessionSharingStringParam(params.requestParams, field);
		if (!sessionKey) continue;
		const parentUsesRequestedAgent = field !== "parentSessionKey" || ["global", "unknown"].includes(sessionKey.toLowerCase());
		directTargets.push({
			sessionKey,
			...requestedAgentId && parentUsesRequestedAgent ? { agentId: requestedAgentId } : {}
		});
	}
	if (directTargets.length) return directTargets;
	if (params.method === "board.event" || params.method === "board.action") {
		const ticket = readSessionSharingStringParam(params.requestParams, "ticket");
		const claims = ticket ? resolveAuthorizedBoardViewTicketClaims(ticket, { gatewayContext: params.context }) : void 0;
		if (!claims || requestedAgentId && requestedAgentId !== claims.agentId) return;
		return [{
			sessionKey: claims.sessionKey,
			...claims.agentId ? { agentId: claims.agentId } : {}
		}];
	}
	if (params.method !== "sessions.abort") return;
	const runId = readSessionSharingStringParam(params.requestParams, "runId");
	const run = runId ? params.context.chatAbortControllers.get(runId) : void 0;
	return run ? [{
		sessionKey: run.sessionKey,
		...run.agentId ? { agentId: run.agentId } : {}
	}] : void 0;
}
//#endregion
//#region src/talk/agent-target.ts
/** Agent-scoped keys own their Talk session; legacy/unscoped aliases use the Talk target. */
function resolveTalkSessionAgentId(config, sessionKey) {
	const normalizedSessionKey = sessionKey ?? void 0;
	const scopedAgentId = parseAgentSessionKey(normalizedSessionKey)?.agentId;
	if (scopedAgentId) return normalizeAgentId(scopedAgentId);
	return resolvePersistedSessionStoreOwnerForKey(config, normalizedSessionKey).kind === "none" ? resolveAmbientOwnerAgentId(config, config.talk?.agentId, {
		surface: "Talk session ownership",
		hint: "Set talk.agentId to the agent that owns unscoped Talk sessions."
	}) : resolveSessionAgentId({
		config,
		sessionKey: normalizedSessionKey
	});
}
//#endregion
//#region src/gateway/talk-session-target.ts
function requirePreparedTalkSessionTarget(target) {
	if (!target) throw new Error("Talk session target was not prepared by the Gateway");
	return target;
}
/** Resolve Talk ownership before aliases collapse, then retain the exact storage target. */
function prepareTalkSessionTarget(cfg, requestedSessionKey) {
	const requestedKey = normalizeOptionalString(requestedSessionKey);
	const owner = resolveTalkSessionAgentId(cfg, requestedKey ?? "main");
	const sessionKey = requestedKey ?? resolveAgentMainSessionKey({
		cfg,
		agentId: owner
	});
	const { agentId, canonicalKey, storePath } = resolveTalkSessionStorageTarget(cfg, sessionKey, owner);
	return Object.freeze({
		agentId,
		sessionKey,
		canonicalKey,
		storePath
	});
}
/** Revalidate a retained owner without consulting the current ambient Talk default. */
function assertTalkSessionStorageTarget(cfg, target) {
	const current = resolveTalkSessionStorageTarget(cfg, target.canonicalKey, target.agentId);
	if (current.agentId !== target.agentId || current.canonicalKey !== target.canonicalKey || current.storePath !== target.storePath) throw new Error("Talk session storage target changed; retry the request");
}
function resolveTalkSessionStorageTarget(cfg, sessionKey, owner) {
	const requestedAgentId = resolveSessionStoreAgentId(cfg, sessionKey, resolveConfiguredAgentId(cfg, owner));
	const canonicalKey = resolveSessionStoreKey({
		cfg,
		sessionKey,
		storeAgentId: requestedAgentId
	});
	const agentId = resolveSessionStoreAgentId(cfg, canonicalKey, requestedAgentId);
	return {
		agentId,
		canonicalKey,
		storePath: resolveGatewaySessionStoreTargetWithStore({
			cfg,
			key: canonicalKey,
			agentId,
			readOnly: true,
			exactRead: true
		}).storePath
	};
}
//#endregion
//#region src/gateway/session-sharing.ts
const AGENT_RUN_START_METHODS = /* @__PURE__ */ new Set([
	"agent",
	"chat.send",
	"message.action",
	"send",
	"sessions.dispatch",
	"sessions.send",
	"sessions.steer",
	"talk.client.create",
	"talk.client.toolCall",
	"talk.session.create",
	"tools.invoke",
	"wake"
]);
const VISIBILITY_AUTHORIZED_METHODS = /* @__PURE__ */ new Set(["sessions.assignOwner"]);
function resolveSessionMutationAuthorization(params) {
	const authorizesAgentRun = AGENT_RUN_START_METHODS.has(params.method) || params.method === "sessions.goal.update" && typeof params.requestParams === "object" && params.requestParams !== null && "action" in params.requestParams && params.requestParams.action === "resume";
	if (isGatewayAdmin(params.client) && !authorizesAgentRun) return { error: null };
	if (isGatewayClientProfilePending(params.client) && isSessionProfileDependentMethod(params.method)) return { error: authenticatedProfileUnavailableError() };
	let cachedCfg;
	const getCfg = () => cachedCfg ??= params.context.getRuntimeConfig();
	const createLookupCaches = () => ({
		storeCache: /* @__PURE__ */ new Map(),
		targetDiscoveryCache: /* @__PURE__ */ new Map()
	});
	let lookupCaches;
	const resolveAuthorizedTarget = (targetRef) => {
		try {
			return { target: resolveSessionSharingTarget({
				cfg: getCfg(),
				exactRead: true,
				sessionKey: targetRef.sessionKey,
				agentId: targetRef.agentId,
				...lookupCaches ??= createLookupCaches()
			}) };
		} catch (error) {
			if (error instanceof AgentSelectionRequiredError) return { error: errorShape(ErrorCodes.INVALID_REQUEST, error.message) };
			throw error;
		}
	};
	let talkInput;
	let talkSessionTarget;
	try {
		talkInput = resolveTalkSessionTargetInput(params.method, params.requestParams, params.client?.connId);
		if (talkInput?.kind === "relay") {
			assertTalkSessionStorageTarget(getCfg(), talkInput.target);
			talkSessionTarget = talkInput.target;
		} else talkSessionTarget = talkInput && prepareTalkSessionTarget(getCfg(), talkInput.sessionKey);
	} catch (error) {
		return { error: errorShape(ErrorCodes.INVALID_REQUEST, String(error instanceof Error ? error.message : error)) };
	}
	const talkTargets = talkSessionTarget ? [{
		sessionKey: talkSessionTarget.canonicalKey,
		agentId: talkSessionTarget.agentId
	}] : void 0;
	const directTargets = talkTargets ?? resolveDirectSessionTargets(params.method, params.requestParams);
	const hidesForeignSessions = directTargets.length > 0 && gatewayClientSessionCreator(params.client) && operatorSessionCap(params.client, getCfg()) === "none";
	const protectedTargets = hidesForeignSessions ? directTargets : talkTargets?.filter((target) => isIncognitoSessionKey(target.sessionKey)) ?? resolveDirectIncognitoTargets(params.method, params.requestParams);
	for (const targetRef of protectedTargets) {
		const resolved = resolveAuthorizedTarget(targetRef);
		if ("error" in resolved) return { error: resolved.error };
		const target = resolved.target;
		const error = authorizeIncognitoSessionTarget({
			client: params.client,
			sessionKey: targetRef.sessionKey,
			target
		});
		if (error) return { error };
		if (hidesForeignSessions && target && !isSessionCreatorProfile(target.entry.createdActor, params.client?.authenticatedUserProfile?.profileId)) return { error: hiddenSessionNotFound(targetRef.sessionKey) };
	}
	const targetRefs = talkTargets ?? resolveSessionMutationTargets({
		method: params.method,
		requestParams: params.requestParams,
		context: params.context,
		getCfg
	});
	if (!targetRefs) {
		if (isRequiredSessionTargetMethod(params.method)) return { error: errorShape(ErrorCodes.INVALID_REQUEST, "session mutation target is unavailable", { details: {
			code: "SESSION_MUTATION_TARGET_REQUIRED",
			method: params.method
		} }) };
		return { error: null };
	}
	if (talkSessionTarget && authorizesAgentRun) {
		const error = authorizeGatewaySessionCreation({
			cfg: getCfg(),
			client: params.client,
			agentId: talkSessionTarget.agentId
		});
		if (error) return { error };
	}
	const authorizedTargets = [];
	for (const targetRef of targetRefs) {
		const resolved = resolveAuthorizedTarget(targetRef);
		if ("error" in resolved) return { error: resolved.error };
		const target = resolved.target;
		const error = (target && authorizesAgentRun ? authorizeSessionAgentRun({
			cfg: getCfg(),
			client: params.client,
			target
		}) : null) ?? authorizeIncognitoSessionTarget({
			client: params.client,
			sessionKey: targetRef.sessionKey,
			target
		}) ?? (target && !(VISIBILITY_AUTHORIZED_METHODS.has(params.method) && (operatorSessionCap(params.client, getCfg()) ?? "write") === "write") ? authorizeSessionSharingTarget({
			cfg: getCfg(),
			client: params.client,
			target
		}) : null);
		if (error) return { error };
		authorizedTargets.push({
			...targetRef,
			resolved: target ? {
				agentId: target.agentId,
				canonicalKey: target.canonicalKey,
				storeKey: target.storeKey,
				storePath: target.storePath
			} : null,
			sessionId: target?.entry.sessionId?.trim() || null
		});
	}
	return {
		error: null,
		authorization: (() => {
			const targetChanged = (sessionKey) => new SessionMutationAuthorizationChangedError(errorShape(ErrorCodes.INVALID_REQUEST, `session changed before ${params.method}; retry the request`, { details: {
				code: "SESSION_MUTATION_AUTHORIZATION_CHANGED",
				method: params.method,
				sessionKey
			} }));
			const assertTalkTargetCurrent = (cfg) => {
				if (!talkInput || !talkSessionTarget) return;
				let current;
				try {
					if (talkInput.kind === "relay") {
						if (!talkInput.isCurrent()) throw targetChanged(talkSessionTarget.sessionKey);
						assertTalkSessionStorageTarget(cfg, talkSessionTarget);
						current = talkSessionTarget;
					} else current = prepareTalkSessionTarget(cfg, talkInput.sessionKey);
				} catch {
					throw targetChanged(talkSessionTarget.sessionKey);
				}
				if (current.agentId !== talkSessionTarget.agentId || current.sessionKey !== talkSessionTarget.sessionKey || current.canonicalKey !== talkSessionTarget.canonicalKey || current.storePath !== talkSessionTarget.storePath) throw targetChanged(talkSessionTarget.sessionKey);
				const error = authorizesAgentRun && authorizeGatewaySessionCreation({
					cfg,
					client: params.client,
					agentId: current.agentId
				});
				if (error) throw new SessionMutationAuthorizationChangedError(error);
			};
			const assertTargetCurrent = (targetRef, expected, currentCfg, currentLookupCaches, ensuredSessionId) => {
				const current = resolveSessionSharingTarget({
					cfg: currentCfg,
				exactRead: true,
					sessionKey: targetRef.sessionKey,
					agentId: targetRef.agentId,
					...currentLookupCaches
				});
				const ensuredTarget = talkSessionTarget && authorizesAgentRun && expected?.sessionId === null && ensuredSessionId ? {
					agentId: talkSessionTarget.agentId,
					canonicalKey: talkSessionTarget.canonicalKey,
					storeKey: talkSessionTarget.canonicalKey,
					storePath: talkSessionTarget.storePath
				} : void 0;
				const expectedResolved = expected?.resolved ?? ensuredTarget;
				const expectedSessionId = expected?.sessionId ?? (ensuredTarget ? ensuredSessionId : null);
				if (!(expected !== void 0 && (current === null ? expected.resolved === null && !ensuredSessionId : expectedResolved !== void 0 && expectedResolved !== null && current.agentId === expectedResolved.agentId && current.canonicalKey === expectedResolved.canonicalKey && current.storeKey === expectedResolved.storeKey && current.storePath === expectedResolved.storePath && (current.entry.sessionId?.trim() || null) === expectedSessionId))) throw targetChanged(targetRef.sessionKey);
				if (!current) return;
				const error = (authorizesAgentRun ? authorizeSessionAgentRun({
					cfg: currentCfg,
					client: params.client,
					target: current
				}) : null) ?? authorizeIncognitoSessionTarget({
					client: params.client,
					sessionKey: targetRef.sessionKey,
					target: current
				}) ?? authorizeSessionSharingTarget({
					cfg: currentCfg,
					client: params.client,
					target: current
				});
				if (error) throw new SessionMutationAuthorizationChangedError(error);
			};
			return {
				...talkSessionTarget ? { talkSessionTarget } : {},
				assertCurrent: () => {
					const currentCfg = params.context.getRuntimeConfig();
					assertTalkTargetCurrent(currentCfg);
					const currentLookupCaches = createLookupCaches();
					for (const authorized of authorizedTargets) assertTargetCurrent(authorized, authorized, currentCfg, currentLookupCaches);
				},
				assertTargetCurrent: (targetRef) => {
					const sessionKey = normalizeOptionalString(targetRef.sessionKey);
					const agentId = normalizeOptionalString(targetRef.agentId);
					const normalizedTarget = {
						sessionKey: sessionKey ?? targetRef.sessionKey,
						agentId
					};
					const expected = authorizedTargets.find((target) => target.sessionKey === sessionKey && target.agentId === agentId);
					const currentCfg = params.context.getRuntimeConfig();
					assertTalkTargetCurrent(currentCfg);
					assertTargetCurrent(normalizedTarget, expected, currentCfg, void 0, targetRef.ensuredSessionId);
				}
			};
		})()
	};
}
function loadSharingSnapshot(params) {
	const { sessionKey, agentId } = params;
	return loadCachedSessionSharingSnapshot({
		agentId,
		sessionKey,
		resolve: () => {
			const target = resolveSessionSharingTarget(params);
			return {
				canonicalKey: target?.canonicalKey ?? sessionKey,
				canonicalAgentId: target?.agentId ?? agentId,
				snapshot: {
					visibility: target ? resolveSessionVisibility(target.entry) : "draft",
					incognito: target ? target.entry.incognito === true || isIncognitoSessionKey(target.canonicalKey) : isIncognitoSessionKey(sessionKey),
					...target ? { createdActor: target.entry.createdActor } : {}
				}
			};
		}
	});
}
function canReceiveSessionEvent(params) {
	const { cfg, client, sessionKeys, event } = params;
	if (isGatewayAdmin(client)) return true;
	const operatorActor = resolveGatewayOperatorRoleActor(client);
	const identity = sharingIdentity(client, operatorActor);
	if (!identity) return (!cfg.gateway?.roles || operatorActor?.kind === "system") && event !== "session.suggestion" && event !== "session.typing";
	const hidesForeignSessions = operatorSessionCap(client, cfg) === "none";
	const sharing = prepareSessionSharing({
		cfg,
		client
	});
	const lookup = {
		cfg,
		agentId: params.agentId,
		storeCache: /* @__PURE__ */ new Map(),
		targetDiscoveryCache: /* @__PURE__ */ new Map()
	};
	const visible = sessionKeys.every((sessionKey) => {
		const snapshot = loadSharingSnapshot({
			...lookup,
			sessionKey
		});
		const isCreator = sharing.isCreator(snapshot.createdActor);
		if (snapshot.incognito || hidesForeignSessions && !isCreator) return false;
		if (snapshot.visibility !== "draft" || isCreator) return true;
		if (event !== "session.typing") return false;
		const target = resolveSessionSharingTarget({
			...lookup,
			sessionKey
		});
		return target !== null && canManageSessionSharing(sharing.roleForTarget(target));
	});
	if (!visible || event !== "session.suggestion") return visible;
	if ((params.payload && typeof params.payload === "object" ? params.payload.suggestion?.author?.id : void 0) === identity.id) return true;
	return sessionKeys.every((sessionKey) => {
		const target = resolveSessionSharingTarget({
			...lookup,
			sessionKey
		});
		return target !== null && sharing.roleForTarget(target) !== "viewer";
	});
}
/** Share caller facts across synchronous selection/role projection, never across an await. */
function prepareSessionSharing(params) {
	const isCreator = prepareSessionCreatorProfile(sharingIdentity(params.client, resolveGatewayOperatorRoleActor(params.client))?.id);
	return {
		isCreator,
		entryFilter: createSessionListEntryFilter(params, isCreator),
		roleForTarget: (target, isMember) => resolveSessionSharingRole({
			...params,
			target,
			isMember
		}, void 0, isCreator)
	};
}
function createSessionListEntryFilter(params, isCreator) {
	const operatorActor = resolveGatewayOperatorRoleActor(params.client);
	const identity = sharingIdentity(params.client, operatorActor);
	if (isGatewayAdmin(params.client) || !identity && operatorActor?.kind === "system") return;
	if (!identity) return params.cfg?.gateway?.roles ? () => false : void 0;
	const hidesForeignSessions = params.cfg && operatorSessionCap(params.client, params.cfg) === "none";
	const creatorMatches = isCreator ?? ((actor) => isSessionCreatorProfile(actor, identity.id));
	return (sessionKey, entry) => entry.incognito !== true && !isIncognitoSessionKey(sessionKey) && (creatorMatches(entry.createdActor) || !hidesForeignSessions && resolveSessionVisibility(entry) !== "draft");
}
//#endregion
export { authorizeSessionSharing as A, SessionMutationAuthorizationChangedError as B, renameSessionGroup as C, allowedSessionVisibilities as D, invalidateSessionSharingSnapshot as E, isResolvedIncognitoSession as F, isSessionVisibilityAllowed as I, resolveSessionSharingRole as L, canAccessIncognitoSession as M, canManageSessionSharing as N, authorizeIncognitoSessionTarget as O, isGatewayAdmin as P, resolveSessionSharingTarget as R, putSessionGroups as S, updateSessionGroupDefaults as T, prepareSessionCreatorProfile as V, deleteSessionGroup as _, prepareTalkSessionTarget as a, listSessionGroups as b, resolveDirectIncognitoTargets as c, getUnifiedTalkSession as d, registerTalkConnectionCleanup as f, SessionGroupNotFoundError as g, SessionGroupNotEmptyError as h, resolveSessionMutationAuthorization as i, authorizeSessionSharingTarget as j, authorizeResolvedSessionMutation as k, cleanupTalkConnection as l, requireUnifiedTalkSessionConn as m, createSessionListEntryFilter as n, requirePreparedTalkSessionTarget as o, rememberUnifiedTalkSession as p, prepareSessionSharing as r, resolveTalkSessionAgentId as s, canReceiveSessionEvent as t, forgetUnifiedTalkSession as u, ensureSessionGroupRegistered as v, resolveSessionGroupMutationTargetsByName as w, listSidebarSectionOrder as x, listSessionGroupDefaults as y, resolveSessionVisibility as z };
