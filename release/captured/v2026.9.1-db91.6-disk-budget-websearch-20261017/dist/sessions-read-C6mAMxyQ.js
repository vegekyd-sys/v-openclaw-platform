import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { o as measureDiagnosticsTimelineSpan, s as measureDiagnosticsTimelineSpanSync } from "./diagnostics-timeline-H3aAUCYk.js";
import { o as listAgentIds } from "./agent-scope-config-CUiGBd59.js";
import { n as normalizeAgentId, r as normalizeAgentIdStrict } from "./agent-id-CeT3w4ap.js";
import { O as parseAgentSessionKey } from "./session-key-CRjxKW0X.js";
import { t as isIncognitoSessionKey } from "./incognito-session-key-BwpD1Lwd.js";
import { o as resolveSessionStorePathCore } from "./paths-DDTeIhCT.js";
import { n as resolvePersistedSessionStoreOwnerForKey } from "./session-store-owner-Df_uY3tv.js";
import { Ci as validateSessionsSearchParams, Nr as validateSessionsCleanupParams, Ur as validateSessionsDescribeParams, ci as validateSessionsListParams, gi as validateSessionsPreviewParams, xi as validateSessionsResolveParams } from "./src-B9mb84px.js";
import { t as ErrorCodes } from "./gateway-error-details-B9ifm8Ur.js";
import { p as readAgentRunIndexVersion, t as buildProjectedAgentRunIndex } from "./agent-run-registry-D84MDeZl.js";
import { d as errorShape } from "./error-codes-DKSaEjvx.js";
import { U as readOpenClawAgentDatabaseRegistryToken } from "./openclaw-agent-db-maintenance-DYSkzMMg.js";
import { _ as readOpenIncognitoAgentDatabaseGeneration } from "./openclaw-agent-db-CUTe8BX6.js";
import { a as listSessionEntriesReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";
import { g as readSessionLifecycleVersion, h as readSessionIdentityMutationVersion } from "./session-history-eviction-d5aiCsHS.js";
import { o as readSessionTranscriptUpdateVersion } from "./transcript-events-BMaG3A_w.js";
import "./session-accessor-K0XuW6ln.js";
import { i as resolveStoredSessionKeyForAgentStore, n as resolveSessionStoreAgentId, r as resolveSessionStoreKey } from "./session-store-key-DVtVp9hU.js";
import { l as resolveExistingAgentSessionStoreTargetsSync, t as isConfiguredSessionStoreAgentId } from "./targets-M9xRkscp.js";
import { S as readUserProfileVersion } from "./user-profiles-ftXkbNlK.js";
import { n as loadCombinedSessionStoreForGatewayCore } from "./combined-store-gateway-BwDhjbIt.js";
import { u as listSessionMembershipKeys } from "./sessions-eI69vxPt.js";
import { r as runSessionsCleanup, s as serializeSessionCleanupResult } from "./cleanup-service-CHVXsp6n.js";
import { h as gatewayClientSessionCreator, i as operatorSessionCap, n as hasOperatorBoundary } from "./operator-role-policy-B_VzZMic.js";
import { l as readSessionPreviewItemsFromTranscript, n as readRecentSessionMessagesWithStatsAsync } from "./session-transcript-readers-Bry9KBsD.js";
import { _ as readSessionAutomationVersion, n as listSessionsFromStoreAsync, r as resolveSessionsListDefaultsAgentId, s as buildGatewaySessionRow, u as readSessionTitleProjectionUnavailableVersion } from "./session-utils-list-BUP03AzS.js";
import { i as tryResolveSessionCompatibilityOwnerAgentId, n as resolveRequestedSessionAgentId } from "./session-request-agent-Db9uggbl.js";
import { f as resolveGatewaySessionStoreTargetWithStore, s as resolveCanonicalSessionEntryFromStoreKeys, u as createGatewaySessionStoreDiscoveryCache } from "./session-utils-store-Dlphca2N.js";
import "./session-utils-C2DgQXXH.js";
import { M as canAccessIncognitoSession, P as isGatewayAdmin, R as resolveSessionSharingTarget, n as createSessionListEntryFilter, r as prepareSessionSharing, z as resolveSessionVisibility } from "./session-sharing-BlMqwMBH.js";
import { t as searchSessionTranscripts } from "./session-transcript-search-pRB2YScP.js";
import { o as readSessionLifecyclePersistenceVersion } from "./session-lifecycle-state-WnjErOqP.js";
import { i as resolveVisibleActiveSessionRunState, t as collectTrackedActiveSessionRuns } from "./session-active-runs-CAmWpnXM.js";
import { t as resolveGatewayModelSelectionPolicy } from "./session-model-selection-policy-BjgUEc4y.js";
import { n as readSessionPlacementFields, t as createSessionPlacementBatchProjector } from "./session-placement-read-projection-eZkSl0va.js";
import { t as assertValidParams } from "./validation-D9mcPHCB.js";
import { i as readSessionsMutationVersion, n as emitSessionsChanged } from "./session-change-event-COUHoCIh.js";
import { t as resolveSessionKeyFromResolveParams } from "./sessions-resolve-_D6BmQTT.js";
import { t as readPreparedServerMethodModelCatalog } from "./optional-model-catalog-CIJvOLOk.js";
import { a as loadSessionEntriesForTarget, s as requireSessionKey } from "./sessions-shared-Bdbh46q8.js";
import { setImmediate } from "node:timers/promises";
//#region src/gateway/server-methods/sessions-list-cache.ts
const SESSIONS_LIST_COMPLETED_CACHE_LIMIT = 64;
const sessionListsByContext = /* @__PURE__ */ new WeakMap();
const modelCatalogRevisions = /* @__PURE__ */ new WeakMap();
let nextModelCatalogRevision = 1;
function readModelCatalogRevision(modelCatalog) {
	if (!modelCatalog) return 0;
	const existing = modelCatalogRevisions.get(modelCatalog);
	if (existing !== void 0) return existing;
	const revision = nextModelCatalogRevision++;
	modelCatalogRevisions.set(modelCatalog, revision);
	return revision;
}
/**
* Serializes the per-agent catalog revision set so the cache fence advances
* when any row owner's entries or provider policy changes. A new read wrapper
* alone does not invalidate the cache; the prepared facts retain stable identity.
*/
function readSessionListModelCatalogFence(modelCatalog) {
	if (!modelCatalog || modelCatalog.size === 0) return "none";
	return [...modelCatalog.entries()].toSorted(([left], [right]) => left.localeCompare(right)).map(([agentId, catalog]) => `${agentId}:${readModelCatalogRevision(catalog?.entries)}:${readModelCatalogRevision(catalog?.pluginRegistry)}`).join(",");
}
function readSessionListFence(context, modelCatalog) {
	return {
		agentRunIndexVersion: readAgentRunIndexVersion(),
		agentDatabaseRegistryToken: readOpenClawAgentDatabaseRegistryToken(),
		incognitoDatabaseGeneration: readOpenIncognitoAgentDatabaseGeneration(),
		lifecyclePersistenceVersion: readSessionLifecyclePersistenceVersion(),
		modelCatalogRevision: readSessionListModelCatalogFence(modelCatalog),
		sessionAutomationVersion: readSessionAutomationVersion(),
		sessionIdentityMutationVersion: readSessionIdentityMutationVersion(),
		sessionLifecycleVersion: readSessionLifecycleVersion(),
		userProfileVersion: readUserProfileVersion(),
		sessionsMutationVersion: readSessionsMutationVersion(context),
		sessionTranscriptUpdateVersion: readSessionTranscriptUpdateVersion(),
		titleProjectionUnavailableVersion: readSessionTitleProjectionUnavailableVersion(),
		workerEnvironmentInventoryVersion: context.workerEnvironmentService?.inventoryVersion() ?? 0,
		workerPlacementDiskSpaceVersion: context.workerPlacementDiskSpaceReader?.version() ?? 0,
		workerPlacementRunnerAvailabilityVersion: context.workerPlacementRunnerAvailabilityReader?.version() ?? 0
	};
}
function matchesSessionListFence(value, fence) {
	return value.agentRunIndexVersion === fence.agentRunIndexVersion && value.agentDatabaseRegistryToken === fence.agentDatabaseRegistryToken && value.incognitoDatabaseGeneration === fence.incognitoDatabaseGeneration && value.lifecyclePersistenceVersion === fence.lifecyclePersistenceVersion && value.modelCatalogRevision === fence.modelCatalogRevision && value.sessionAutomationVersion === fence.sessionAutomationVersion && value.sessionIdentityMutationVersion === fence.sessionIdentityMutationVersion && value.sessionLifecycleVersion === fence.sessionLifecycleVersion && value.userProfileVersion === fence.userProfileVersion && value.sessionsMutationVersion === fence.sessionsMutationVersion && value.sessionTranscriptUpdateVersion === fence.sessionTranscriptUpdateVersion && value.titleProjectionUnavailableVersion === fence.titleProjectionUnavailableVersion && value.workerEnvironmentInventoryVersion === fence.workerEnvironmentInventoryVersion && value.workerPlacementDiskSpaceVersion === fence.workerPlacementDiskSpaceVersion && value.workerPlacementRunnerAvailabilityVersion === fence.workerPlacementRunnerAvailabilityVersion;
}
function sessionListWorkKey(params, client, config) {
	return JSON.stringify([
		gatewayClientSessionCreator(client)?.id ?? null,
		isGatewayAdmin(client) ? "admin" : operatorSessionCap(client, config) ?? null,
		Object.entries(params).toSorted(([left], [right]) => left.localeCompare(right))
	]);
}
function sessionListState(context, config) {
	let state = sessionListsByContext.get(context);
	if (!state || state.config !== config) {
		state = {
			completed: /* @__PURE__ */ new Map(),
			config,
			inFlight: /* @__PURE__ */ new Map()
		};
		sessionListsByContext.set(context, state);
	}
	return state;
}
function rememberCompletedSessionList(state, workKey, completed) {
	state.completed.delete(workKey);
	state.completed.set(workKey, completed);
	while (state.completed.size > SESSIONS_LIST_COMPLETED_CACHE_LIMIT) {
		const oldest = state.completed.keys().next().value;
		if (oldest === void 0) break;
		state.completed.delete(oldest);
	}
}
function resolveSessionListExpiration(result) {
	let expiresAt;
	for (const session of result.sessions) {
		if (session.hasActiveRun || session.hasActiveSubagentRun || session.childSessions?.length) return null;
		const statusExpiration = session.agentStatus?.expiresAt;
		if (statusExpiration !== void 0 && (expiresAt === void 0 || statusExpiration < expiresAt)) expiresAt = statusExpiration;
	}
	return expiresAt;
}
async function respondWithCachedSessionList(params) {
	const workKey = sessionListWorkKey(params.request, params.client, params.config);
	const state = sessionListState(params.context, params.config);
	const fence = readSessionListFence(params.context, params.modelCatalog);
	const cacheCompleted = params.request.activeMinutes === void 0 && !params.request.spawnedBy;
	const completed = cacheCompleted ? state.completed.get(workKey) : void 0;
	if (completed && matchesSessionListFence(completed, fence) && (completed.expiresAt === void 0 || completed.expiresAt > Date.now())) {
		params.respond(true, completed.result, void 0);
		return;
	}
	const pending = state.inFlight.get(workKey);
	if (pending && matchesSessionListFence(pending, fence)) {
		params.respond(true, await pending.promise, void 0);
		return;
	}
	const promise = Promise.resolve().then(params.run).then((result) => {
		if (cacheCompleted && matchesSessionListFence(readSessionListFence(params.context, params.modelCatalog), fence)) {
			const expiresAt = resolveSessionListExpiration(result);
			if (expiresAt !== null && (expiresAt === void 0 || expiresAt > Date.now())) rememberCompletedSessionList(state, workKey, {
				...fence,
				result,
				expiresAt
			});
		}
		return result;
	});
	const operation = {
		...fence,
		promise
	};
	state.inFlight.set(workKey, operation);
	try {
		params.respond(true, await promise, void 0);
	} finally {
		if (state.inFlight.get(workKey) === operation) state.inFlight.delete(workKey);
	}
}
//#endregion
//#region src/gateway/server-methods/sessions-search-scope.ts
function resolveSessionSearchScope(cfg, params) {
	const normalizedRequest = params.agentId === void 0 ? null : normalizeAgentIdStrict(params.agentId);
	if (normalizedRequest && !normalizedRequest.ok) return {
		ok: false,
		error: errorShape(ErrorCodes.INVALID_REQUEST, `Unknown agent id "${params.agentId}"`)
	};
	const requestedAgentId = normalizedRequest?.value;
	const resolvedSessionKeys = params.sessionKeys ? [] : void 0;
	for (const sessionKey of params.sessionKeys ?? []) {
		const requestedAgent = requestedAgentId && !isConfiguredSessionStoreAgentId(cfg, requestedAgentId) && resolvePersistedSessionStoreOwnerForKey(cfg, sessionKey).kind === "none" ? {
			ok: true,
			agentId: requestedAgentId
		} : resolveRequestedSessionAgentId(cfg, sessionKey, requestedAgentId);
		if (!requestedAgent.ok) return {
			ok: false,
			error: requestedAgent.error
		};
		resolvedSessionKeys?.push({
			sessionKey: requestedAgent.agentId ? resolveStoredSessionKeyForAgentStore({
				cfg,
				agentId: requestedAgent.agentId,
				sessionKey
			}) : resolveSessionStoreKey({
				cfg,
				sessionKey
			}),
			agentId: requestedAgent.agentId
		});
	}
	const sessionKeys = resolvedSessionKeys?.map((resolved) => resolved.sessionKey);
	const agentIds = new Set(resolvedSessionKeys?.map((resolved) => resolved.agentId ? resolved.agentId : resolveSessionStoreAgentId(cfg, resolved.sessionKey)));
	if (agentIds.size > 1 || requestedAgentId && [...agentIds].some((agentId) => agentId !== requestedAgentId)) return {
		ok: false,
		error: errorShape(ErrorCodes.INVALID_REQUEST, "sessions.search supports one agent per call")
	};
	let agentId = requestedAgentId ?? agentIds.values().next().value;
	if (!agentId) {
		const fallbackAgent = resolveRequestedSessionAgentId(cfg, "main");
		if (!fallbackAgent.ok) return {
			ok: false,
			error: fallbackAgent.error
		};
		agentId = fallbackAgent.agentId;
	}
	return {
		ok: true,
		agentId,
		configured: isConfiguredSessionStoreAgentId(cfg, agentId),
		requestedAgentId,
		sessionKeys
	};
}
//#endregion
//#region src/gateway/server-methods/sessions-read.ts
const sessionReadHandlers = {
	"sessions.search": async ({ params, respond, context, client }) => {
		if (!assertValidParams(params, validateSessionsSearchParams, "sessions.search", respond)) return;
		const query = params.query.trim();
		if (!query) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "query must not be empty"));
			return;
		}
		const cfg = context.getRuntimeConfig();
		const restrictIncognito = Boolean(gatewayClientSessionCreator(client)) && !isGatewayAdmin(client);
		const roleVisibilityFilter = hasOperatorBoundary(client, cfg) ? createSessionListEntryFilter({
			client,
			cfg
		}) : void 0;
		const restrictVisibility = restrictIncognito || Boolean(roleVisibilityFilter);
		const canSearchSessionKey = (sessionKey) => {
			if (isIncognitoSessionKey(sessionKey) && !canAccessIncognitoSession({
				cfg,
				client: client ?? null,
				sessionKey
			})) return false;
			if (!roleVisibilityFilter) return true;
			const target = resolveSessionSharingTarget({
				cfg,
				sessionKey
			});
			return Boolean(target && roleVisibilityFilter(target.storeKey, target.entry));
		};
		const scope = resolveSessionSearchScope(cfg, params);
		if (!scope.ok) {
			respond(false, void 0, scope.error);
			return;
		}
		const { agentId, configured, requestedAgentId, sessionKeys } = scope;
		if (requestedAgentId && !params.sessionKeys && configured) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "agentId requires sessionKeys"));
			return;
		}
		const scopedSessionKeys = (configured ? sessionKeys : sessionKeys?.filter((sessionKey) => {
			return (requestedAgentId && (sessionKey === "global" || sessionKey === "unknown") ? requestedAgentId : resolveSessionStoreAgentId(cfg, sessionKey)) === agentId;
		}))?.filter(canSearchSessionKey);
		const searchTargets = configured ? [{
			agentId,
			storePath: resolveSessionStorePathCore(cfg.session?.store, { agentId })
		}] : resolveExistingAgentSessionStoreTargetsSync(cfg, agentId);
		if (!configured && (searchTargets.length === 0 || scopedSessionKeys?.length === 0)) {
			respond(true, { results: [] }, void 0);
			return;
		}
		try {
			const targetResults = searchTargets.flatMap((target) => {
				const targetSessionKeys = scopedSessionKeys ?? (restrictVisibility ? listSessionEntriesReadOnly({
					agentId: target.agentId,
					storePath: target.storePath
				}).map((entry) => entry.sessionKey).filter((sessionKey) => {
					if (!canSearchSessionKey(sessionKey)) return false;
					const parsed = parseAgentSessionKey(sessionKey);
					return !parsed || normalizeAgentId(parsed.agentId) === agentId;
				}) : void 0);
				if (targetSessionKeys?.length === 0) return [];
				return [searchSessionTranscripts({
					...target,
					query,
					limit: configured ? params.limit : 25,
					...targetSessionKeys ? { sessionKeys: targetSessionKeys } : {}
				})];
			});
			const limit = params.limit ?? 10;
			const sortedHits = targetResults.flatMap((result) => result.hits).toSorted((left, right) => right.score - left.score || right.timestamp - left.timestamp || left.messageId.localeCompare(right.messageId));
			const seenHits = /* @__PURE__ */ new Set();
			const hits = sortedHits.filter((hit) => {
				const identity = `${hit.sessionKey}\u0000${hit.sessionId}\u0000${hit.messageId}`;
				if (seenHits.has(identity)) return false;
				seenHits.add(identity);
				return true;
			});
			respond(true, {
				results: hits.slice(0, limit),
				...targetResults.some((result) => result.indexing) ? { indexing: true } : {},
				...targetResults.some((result) => result.truncated) || hits.length > limit ? { truncated: true } : {}
			});
		} catch (error) {
			respond(false, void 0, errorShape(ErrorCodes.UNAVAILABLE, formatErrorMessage(error)));
		}
	},
	"sessions.list": async ({ params, respond, client, context }) => {
		if (!assertValidParams(params, validateSessionsListParams, "sessions.list", respond)) return;
		const p = params;
		const cfg = context.getRuntimeConfig();
		const configuredAgentsOnly = p.configuredAgentsOnly === true;
		const identityId = gatewayClientSessionCreator(client)?.id;
		const defaultsAgentId = resolveSessionsListDefaultsAgentId(cfg, p.agentId);
		const modelSelectionTarget = resolveGatewayModelSelectionPolicy({
			agentId: defaultsAgentId,
			callerScopes: client?.connect?.scopes ?? [],
			cfg
		}).target;
		const preparedModelCatalogByAgent = await measureDiagnosticsTimelineSpan("gateway.sessions.list.model_catalog", async () => {
			const catalogByAgent = /* @__PURE__ */ new Map();
			const agentIds = p.agentId ? [normalizeAgentId(p.agentId)] : listAgentIds(cfg);
			for (const agentId of agentIds) catalogByAgent.set(agentId, await readPreparedServerMethodModelCatalog(context, { agentId }));
			return catalogByAgent;
		}, {
			config: cfg,
			phase: "sessions.list"
		});
		const run = () => measureDiagnosticsTimelineSpan("gateway.sessions.list", async function listVisibleSessions(options = {}) {
			let loaded = options.loaded;
			if (!loaded) loaded = {
				...measureDiagnosticsTimelineSpanSync("gateway.sessions.list.store_load", () => loadCombinedSessionStoreForGatewayCore(cfg, {
					agentId: p.agentId,
					configuredAgentsOnly,
					projection: "list"
				}), {
					config: cfg,
					phase: "sessions.list",
					attributes: {
						agentId: p.agentId ?? null,
						configuredAgentsOnly
					}
				}),
				modelCatalogByAgent: preparedModelCatalogByAgent
			};
			const { durableStorePath, durableTargets, modelCatalogByAgent, storePath } = loaded;
			const visibilityFilter = prepareSessionSharing({
				client,
				cfg
			}).entryFilter;
			// v-workboard-sweep-light-v1: a caller that sees every row and reads only lifecycle fields skips the
			// per-session sharing resolution (synchronous, ~3.5 s on V for every Workboard full sweep).
			const lifecycleOnly = p.lifecycleOnly === true && !visibilityFilter;
			const entryFilter = visibilityFilter || options.excludedKeys?.size ? (key, entry) => !options.excludedKeys?.has(key) && (visibilityFilter?.(key, entry) ?? true) : void 0;
			const result = await measureDiagnosticsTimelineSpan("gateway.sessions.list.rows", () => listSessionsFromStoreAsync({
				cfg,
				durableStorePath,
				...entryFilter ? { entryFilter } : {},
				storePath,
				store: loaded.store,
				modelCatalog: modelCatalogByAgent,
				opts: p,
				...p.involvingMe === true && identityId ? { involvingActorId: identityId } : {},
				...p.ownerFirst === true && identityId ? { ownerFirstActorId: identityId } : {}
			}), {
				config: cfg,
				phase: "sessions.list"
			});
			result.defaults = {
				...result.defaults,
				modelSelectionTarget
			};
			const { sharingTargets, membershipKeys } = lifecycleOnly ? {
				sharingTargets: [],
				membershipKeys: /* @__PURE__ */ new Set()
			} : await measureDiagnosticsTimelineSpan("gateway.sessions.list.sharing", () => {
				const sharingStoreCache = /* @__PURE__ */ new Map();
				const targetDiscoveryCache = createGatewaySessionStoreDiscoveryCache({
					cfg,
					targets: durableTargets,
					agentIds: result.sessions.map((session) => session.key === "global" && p.agentId ? p.agentId : resolveSessionStoreAgentId(cfg, session.key))
				});
				const resolvedSharingTargets = result.sessions.map((session) => resolveSessionSharingTarget({
					cfg,
					sessionKey: session.key,
					storeCache: sharingStoreCache,
					targetDiscoveryCache,
					...session.key === "global" && p.agentId ? { agentId: p.agentId } : {}
				}));
				const resolvedMembershipKeys = /* @__PURE__ */ new Set();
				if (identityId && !isGatewayAdmin(client)) {
					const groups = /* @__PURE__ */ new Map();
					for (const target of resolvedSharingTargets) {
						if (!target) continue;
						const groupKey = `${target.agentId}\0${target.storePath}`;
						const group = groups.get(groupKey) ?? {
							agentId: target.agentId,
							sessionKeys: [],
							storePath: target.storePath
						};
						group.sessionKeys.push(target.storeKey);
						groups.set(groupKey, group);
					}
					for (const group of groups.values()) {
						const firstSessionKey = group.sessionKeys[0];
						if (!firstSessionKey) continue;
						for (const sessionKey of listSessionMembershipKeys({
							agentId: group.agentId,
							sessionKey: firstSessionKey,
							storePath: group.storePath
						}, group.sessionKeys, identityId)) resolvedMembershipKeys.add(`${group.agentId}\0${group.storePath}\0${sessionKey}`);
					}
				}
				return {
					sharingTargets: resolvedSharingTargets,
					membershipKeys: resolvedMembershipKeys
				};
			}, {
				config: cfg,
				phase: "sessions.list",
				attributes: { sessions: result.sessions.length }
			});
			const projectPlacement = lifecycleOnly ? () => ({}) : createSessionPlacementBatchProjector(context, result.sessions);
			const trackedActiveRuns = collectTrackedActiveSessionRuns(context);
			const projectedAgentRunIndex = buildProjectedAgentRunIndex();
			const sharing = prepareSessionSharing({
				client,
				cfg
			});
			const sessions = measureDiagnosticsTimelineSpanSync("gateway.sessions.list.active_run_flags", () => {
				return result.sessions.map((session, index) => {
					const sharingTarget = sharingTargets[index];
					const visibility = sharingTarget ? resolveSessionVisibility(sharingTarget.entry) : "shared";
					const activeRunState = resolveVisibleActiveSessionRunState({
						context,
						requestedKey: session.key,
						canonicalKey: session.key,
						sessionId: session.sessionId,
						agentId: session.agentId,
						defaultAgentId: tryResolveSessionCompatibilityOwnerAgentId(cfg, session.key),
						trackedActiveRuns,
						projectedAgentRunIndex
					});
					return Object.assign({}, session, {
						visibility,
						...sharingTarget ? { sharingRole: sharing.roleForTarget(sharingTarget, membershipKeys.has(`${sharingTarget.agentId}\0${sharingTarget.storePath}\0${sharingTarget.storeKey}`)) } : {},
						hasActiveRun: activeRunState.active,
						...activeRunState.active ? { status: activeRunState.status ?? "running" } : {},
						...projectPlacement(session.sessionId),
						...activeRunState.runIds !== void 0 ? { activeRunIds: activeRunState.runIds } : {}
					});
				});
			}, {
				config: cfg,
				phase: "sessions.list",
				attributes: { sessions: result.sessions.length }
			});
			const currentVisibilityFilter = sharing.entryFilter;
			const visibleSessions = currentVisibilityFilter ? sessions.filter((_, index) => {
				const target = sharingTargets[index];
				return target ? currentVisibilityFilter(target.storeKey, target.entry) : false;
			}) : sessions;
			if (visibleSessions.length !== sessions.length) {
				const visibleKeys = new Set(visibleSessions.map((session) => session.key));
				const excludedKeys = new Set(options.excludedKeys);
				for (const session of sessions) if (!visibleKeys.has(session.key)) excludedKeys.add(session.key);
				if (!options.rowRepairAttempted) return await listVisibleSessions({
					...options,
					excludedKeys,
					loaded,
					rowRepairAttempted: true
				});
				if (options.allowFullReload !== false) return await listVisibleSessions({ allowFullReload: false });
				return {
					...result,
					count: visibleSessions.length,
					sessions: visibleSessions
				};
			}
			return {
				...result,
				sessions: visibleSessions
			};
		}, {
			config: cfg,
			phase: "sessions.list",
			attributes: {
				agentId: p.agentId ?? null,
				configuredAgentsOnly
			}
		});
		await respondWithCachedSessionList({
			client,
			config: cfg,
			context,
			modelCatalog: preparedModelCatalogByAgent,
			request: p,
			respond,
			run
		});
	},
	"sessions.cleanup": async ({ params, respond, context }) => {
		if (!assertValidParams(params, validateSessionsCleanupParams, "sessions.cleanup", respond)) return;
		try {
			const { mode, appliedSummaries, failure } = await runSessionsCleanup({
				cfg: context.getRuntimeConfig(),
				opts: {
					agent: params.agent,
					allAgents: params.allAgents,
					enforce: params.enforce,
					activeKey: params.activeKey,
					fixMissing: params.fixMissing,
					fixDmScope: params.fixDmScope
				}
			});
			const result = serializeSessionCleanupResult({
				mode,
				dryRun: false,
				summaries: appliedSummaries,
				failure
			});
			if (failure) respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, failure.message, { details: result }));
			else respond(true, result, void 0);
			for (const summary of appliedSummaries) {
				emitSessionsChanged(context, {
					reason: "cleanup",
					sessionKey: void 0
				});
				if (summary.wouldMutate) context.logGateway.debug(`sessions.cleanup applied ${summary.storePath}: ${summary.beforeCount} -> ${summary.afterCount}`);
			}
			if (failure?.lifecycleCommitted) emitSessionsChanged(context, {
				reason: "cleanup",
				sessionKey: void 0
			});
		} catch (error) {
			respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, formatErrorMessage(error)));
		}
	},
	"sessions.preview": async ({ params, respond, context, client }) => {
		if (!assertValidParams(params, validateSessionsPreviewParams, "sessions.preview", respond)) return;
		const keys = (Array.isArray(params.keys) ? params.keys : []).map((key) => normalizeOptionalString(key ?? "")).filter((key) => Boolean(key)).slice(0, 64);
		const limit = params.limit ?? 12;
		const maxChars = params.maxChars ?? 240;
		if (keys.length === 0) {
			respond(true, {
				ts: Date.now(),
				previews: []
			}, void 0);
			return;
		}
		const cfg = context.getRuntimeConfig();
		const roleVisibilityFilter = hasOperatorBoundary(client, cfg) ? createSessionListEntryFilter({
			client,
			cfg
		}) : void 0;
		const previews = [];
		for (const key of keys) {
			if (previews.length > 0) await setImmediate();
			const requestedAgent = resolveRequestedSessionAgentId(cfg, key);
			if (!requestedAgent.ok) {
				respond(false, void 0, requestedAgent.error);
				return;
			}
			try {
				const target = resolveGatewaySessionStoreTargetWithStore({
					cfg,
					key,
					agentId: requestedAgent.agentId,
					exactRead: true,
					readOnly: true
				});
				const entry = resolveCanonicalSessionEntryFromStoreKeys(target.store, target.storeKeys);
				if (!entry?.sessionId || roleVisibilityFilter?.(target.canonicalKey, entry) === false) {
					previews.push({
						key,
						status: "missing",
						items: []
					});
					continue;
				}
				const items = readSessionPreviewItemsFromTranscript({
					agentId: target.agentId,
					sessionEntry: entry,
					sessionId: entry.sessionId,
					sessionKey: target.canonicalKey,
					storePath: target.storePath
				}, limit, maxChars);
				previews.push({
					key,
					status: items.length > 0 ? "ok" : "empty",
					items
				});
			} catch {
				previews.push({
					key,
					status: "error",
					items: []
				});
			}
		}
		respond(true, {
			ts: Date.now(),
			previews
		}, void 0);
	},
	"sessions.describe": ({ params, respond, context }) => {
		if (!assertValidParams(params, validateSessionsDescribeParams, "sessions.describe", respond)) return;
		const key = requireSessionKey(params.key, respond);
		if (!key) return;
		const cfg = context.getRuntimeConfig();
		const requestedAgent = resolveRequestedSessionAgentId(cfg, key);
		if (!requestedAgent.ok) {
			respond(false, void 0, requestedAgent.error);
			return;
		}
		// sessions-describe-exact-read: this session and its direct children only (all buildGatewaySessionRow reads), as loadGatewaySessionSnapshot does.
		const target = resolveGatewaySessionStoreTargetWithStore({
			cfg,
			key,
			...requestedAgent.agentId ? { agentId: requestedAgent.agentId } : {},
			exactRead: true,
			readOnly: true,
			includeStoreChildEntries: true
		});
		const { storePath, store } = target;
		const entry = resolveCanonicalSessionEntryFromStoreKeys(store, target.storeKeys);
		if (!entry) {
			respond(true, { session: null }, void 0);
			return;
		}
		const row = buildGatewaySessionRow({
			cfg,
			storePath,
			store,
			key: target.canonicalKey,
			entry,
			agentId: target.agentId,
			includeDerivedTitles: params.includeDerivedTitles,
			includeLastMessage: params.includeLastMessage,
			transcriptUsageMaxBytes: 65536
		});
		respond(true, { session: {
			...row,
			...readSessionPlacementFields(context, row.sessionId)
		} });
	},
	"sessions.resolve": async ({ params, respond, context, client }) => {
		if (!assertValidParams(params, validateSessionsResolveParams, "sessions.resolve", respond)) return;
		const resolved = await resolveSessionKeyFromResolveParams({
			cfg: context.getRuntimeConfig(),
			client,
			p: params
		});
		if (!resolved.ok) {
			respond(false, void 0, resolved.error);
			return;
		}
		if ("missing" in resolved) {
			respond(true, { ok: false }, void 0);
			return;
		}
		if ("ambiguous" in resolved) {
			respond(true, {
				ok: false,
				candidates: resolved.candidates
			}, void 0);
			return;
		}
		respond(true, resolved, void 0);
	},
	"sessions.get": async ({ params, respond, context }) => {
		const p = params;
		const key = requireSessionKey(p.key ?? p.sessionKey, respond);
		if (!key) return;
		const limit = typeof p.limit === "number" && Number.isFinite(p.limit) ? Math.max(1, Math.floor(p.limit)) : 200;
		const cfg = context.getRuntimeConfig();
		const requestedAgent = resolveRequestedSessionAgentId(cfg, key, normalizeOptionalString(p.agentId));
		if (!requestedAgent.ok) {
			respond(false, void 0, requestedAgent.error);
			return;
		}
		// sessions-get-exact-read: read only this session's store keys, as sessions.preview does.
		const target = resolveGatewaySessionStoreTargetWithStore({
			cfg,
			key,
			agentId: requestedAgent.agentId,
			exactRead: true,
			readOnly: true
		});
		const storePath = target.storePath;
		const entry = resolveCanonicalSessionEntryFromStoreKeys(target.store, target.storeKeys);
		if (!entry?.sessionId) {
			respond(true, { messages: [] }, void 0);
			return;
		}
		const { messages } = await readRecentSessionMessagesWithStatsAsync({
			agentId: requestedAgent.agentId,
			sessionEntry: entry,
			sessionId: entry.sessionId,
			sessionKey: key,
			storePath
		}, {
			maxMessages: limit,
			maxLines: limit * 20 + 20,
			allowResetArchiveFallback: true
		});
		respond(true, { messages }, void 0);
	}
};
const sessionsListHandler = sessionReadHandlers["sessions.list"];
//#endregion
export { sessionsListHandler as n, sessionReadHandlers as t };
