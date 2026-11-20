import { c as isRecord } from "./record-coerce-DItp3I4t.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { n as getRuntimeConfig } from "./io.runtime-CKu7Rw0j.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { n as ok, t as err } from "./result-BQGgYouL.js";
import { A as parseRawSessionConversationRef, O as parseAgentSessionKey, S as isAcpSessionKey, T as isSubagentSessionKey, u as normalizeMainKey } from "./session-key-CRjxKW0X.js";
import { t as isIncognitoSessionKey } from "./incognito-session-key-BwpD1Lwd.js";
import { _ as resolveSessionAgentId } from "./agent-scope-CSlN0kZb.js";
import { n as GATEWAY_CLIENT_IDS, o as normalizeGatewayClientId } from "./client-info-B1bPgeKr.js";
import "./config-Cv60gBux.js";
import { f as isGatewayClientRequestError } from "./call-DcwkiOeW.js";
import "./client-D8eBb67K.js";
import { t as GatewayClientRequestError } from "./request-error-BSFClQsA.js";
import { a as getPluginRuntimeGatewayRequestScope } from "./gateway-request-scope-CmMd3nUp.js";
import { s as resolveLeastPrivilegeOperatorScopesForMethod } from "./method-scopes-C3BvHJ95.js";
import { t as resolveCanonicalMainSessionKey } from "./main-session-key-BQIOpq9a.js";
import { r as getGatewayToolCallerIdentity } from "./gateway-caller-context-CRUBJj3M.js";
import "./lifecycle-CKz-1QIz.js";
import { o as runWithGatewaySessionSpawnContext, t as callGatewayTool } from "./gateway-DVu5Urba.js";
import { i as recordExecutionDecisionWork } from "./execution-decision-work-DdwPx8Ic.js";
import { d as logSessionOwnershipLookupFailure, f as lookupFailedDenialMessage, g as sessionOwnershipLookupFailure, h as sessionOwnershipLookupDenied, l as createSessionVisibilityDecisionChecker, m as renderSessionVisibilityDenial, n as createSessionVisibilityChecker, o as resolveEffectiveSessionToolsVisibility, p as lookupFailedOperationMessage, s as resolveSandboxSessionToolsVisibility, t as createAgentToAgentPolicy, u as listSpawnedSessionKeysWithResult } from "./session-visibility-VPIpfopg.js";
import { f as withInProcessAgentRuntimeIdentity, r as getInProcessGatewayRequestContext, t as dispatchGatewayMethodInProcess } from "./server-plugin-in-process-dispatch-BirRDL7L.js";
import { a as hasInProcessGatewayContext } from "./server-plugins-Dr-GcAg-.js";
import { randomUUID } from "node:crypto";
//#region src/agents/tools/in-process-gateway.ts
const agentToolGatewayRuntimeIdentities = /* @__PURE__ */ new WeakMap();
/** Carry trusted runtime identity without making it enumerable or transportable. */
function withAgentToolGatewayRuntimeIdentity(request, identity) {
	if (!identity) return request;
	const carried = { ...request };
	agentToolGatewayRuntimeIdentities.set(carried, identity);
	return carried;
}
const DEFAULT_IN_PROCESS_GATEWAY_REQUEST_TIMEOUT_MS = 1e4;
function callerGatewayContextResolver(explicit) {
	return explicit ?? getGatewayToolCallerIdentity()?.gatewayContextResolver;
}
function bindInProcessGatewayContext(method, resolveGatewayContext) {
	const admittedContext = resolveGatewayContext();
	if (!admittedContext) throw new Error(`Gateway instance unavailable for ${method}`);
	const assertCurrent = () => {
		if (resolveGatewayContext() !== admittedContext) throw new Error(`Gateway instance unavailable for ${method}`);
	};
	return {
		assertCurrent,
		resolve: () => {
			assertCurrent();
			return admittedContext;
		}
	};
}
async function runBoundInProcessGatewayCall(boundGateway, run) {
	try {
		const result = await run(boundGateway?.resolve);
		boundGateway?.assertCurrent();
		return result;
	} catch (error) {
		boundGateway?.assertCurrent();
		throw error;
	}
}
function hasInProcessGatewayToolContext() {
	const resolveGatewayContext = callerGatewayContextResolver();
	return resolveGatewayContext ? Boolean(resolveGatewayContext()) : hasInProcessGatewayContext();
}
/** Whether Gateway routing belongs to this caller or the hosting process. */
function hasGatewayToolRoutingContext() {
	const resolver = callerGatewayContextResolver() ?? getPluginRuntimeGatewayRequestScope()?.resolveGatewayContext;
	const context = getInProcessGatewayRequestContext(resolver);
	return context?.localEmbedded !== true && Boolean(resolver || context);
}
function getInProcessGatewayToolContext(explicitResolver) {
	const resolveGatewayContext = callerGatewayContextResolver(explicitResolver);
	return resolveGatewayContext ? resolveGatewayContext() : getInProcessGatewayRequestContext();
}
/**
* Dispatches a request-shaped built-in tool call through the local Gateway
* router without opening a loopback transport. Outside a Gateway process, the
* same request falls back to the ordinary Gateway client.
*/
async function callAgentToolGatewayRequestBound(request, resolveGatewayContext, runtimeIdentity) {
	const boundGateway = resolveGatewayContext ? bindInProcessGatewayContext(request.method, resolveGatewayContext) : void 0;
	if (!hasInProcessGatewayContext(boundGateway?.resolve)) {
		if (runtimeIdentity) throw new Error("trusted agent runtime identity requires in-process Gateway dispatch");
		if (boundGateway) throw new Error(`Gateway instance unavailable for ${request.method}`);
		const { callGateway } = await import("./call-biHULXUC.js");
		const { agentRunTracking: _agentRunTracking, agentToolCaller: _agentToolCaller, ...wireRequest } = request;
		return await callGateway(wireRequest);
	}
	const scopes = request.scopes ?? resolveLeastPrivilegeOperatorScopesForMethod(request.method, request.params);
	const timeoutMs = request.timeoutMs === null ? void 0 : request.timeoutMs ?? DEFAULT_IN_PROCESS_GATEWAY_REQUEST_TIMEOUT_MS;
	const dispatchOptions = {
		forceSyntheticClient: true,
		...request.agentRunTracking ? { agentRunTracking: request.agentRunTracking } : {},
		...request.agentToolCaller ? { agentToolCaller: request.agentToolCaller } : {},
		syntheticScopes: scopes,
		...request.expectFinal !== void 0 ? { expectFinal: request.expectFinal } : {},
		...request.onAccepted ? { onAccepted: request.onAccepted } : {},
		...request.onSignalAbort ? { onSignalAbort: () => request.onSignalAbort?.((method, params, options) => callAgentToolGatewayRequestBound({
			method,
			params,
			...options
		}, boundGateway?.resolve ?? resolveGatewayContext, runtimeIdentity)) } : {},
		...request.signal ? { signal: request.signal } : {},
		...timeoutMs !== void 0 ? { timeoutMs } : {},
		...boundGateway ? { resolveGatewayContext: boundGateway.resolve } : {}
	};
	return await runBoundInProcessGatewayCall(boundGateway, async () => await dispatchGatewayMethodInProcess(request.method, request.params ?? {}, withInProcessAgentRuntimeIdentity(dispatchOptions, runtimeIdentity)));
}
const callAgentToolGatewayRequest = async (request) => {
	return await callAgentToolGatewayRequestBound(request, callerGatewayContextResolver(), agentToolGatewayRuntimeIdentities.get(request));
};
async function callInProcessGatewayToolBound(method, params, options, fallback) {
	const scopes = resolveLeastPrivilegeOperatorScopesForMethod(method, params);
	const resolveGatewayContext = callerGatewayContextResolver(options.resolveGatewayContext);
	const boundGateway = resolveGatewayContext ? bindInProcessGatewayContext(method, resolveGatewayContext) : void 0;
	if (hasInProcessGatewayContext(boundGateway?.resolve)) return await runBoundInProcessGatewayCall(boundGateway, async (boundResolver) => await dispatchGatewayMethodInProcess(method, params, {
		forceSyntheticClient: true,
		syntheticScopes: scopes,
		...options.sessionCreation ? { sessionCreation: options.sessionCreation } : {},
		...options.sessionMutationCommitGuard ? { sessionMutationCommitGuard: options.sessionMutationCommitGuard } : {},
		...options.signal ? { signal: options.signal } : {},
		...options.timeoutMs !== void 0 && options.timeoutMs !== null ? { timeoutMs: options.timeoutMs } : {},
		...boundResolver ? { resolveGatewayContext: boundResolver } : {}
	}));
	if (boundGateway) throw new Error(`Gateway instance unavailable for ${method}`);
	return await fallback(scopes);
}
const callInProcessGatewayTool = async (method, params, options = {}) => {
	return await callInProcessGatewayToolBound(method, params, options, async (scopes) => callGatewayTool(method, {}, params, {
		scopes,
		...options.signal ? { signal: options.signal } : {},
		...options.timeoutMs !== void 0 && options.timeoutMs !== null ? { timeoutMs: options.timeoutMs } : {}
	}));
};
async function callInProcessGatewayToolWithCreation(method, params, creation, options = {}) {
	return await callInProcessGatewayToolBound(method, params, {
		...options,
		sessionCreation: creation
	}, async (scopes) => {
		if (creation.via !== "spawn" || !creation.inheritedToolPolicy) return await callGatewayTool(method, {}, params, {
			scopes,
			...options.signal ? { signal: options.signal } : {},
			...options.timeoutMs !== void 0 ? { timeoutMs: options.timeoutMs } : {}
		});
		return await runWithGatewaySessionSpawnContext({
			...creation.completionOwnerSessionKey ? { completionOwnerSessionKey: creation.completionOwnerSessionKey } : {},
			inheritedToolPolicy: creation.inheritedToolPolicy
		}, () => callGatewayTool(method, {}, params, {
			scopes,
			requireAgentRuntimeIdentity: true,
			...options.signal ? { signal: options.signal } : {},
			...options.timeoutMs !== void 0 ? { timeoutMs: options.timeoutMs } : {}
		}));
	});
}
//#endregion
//#region src/sessions/session-id.ts
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function looksLikeSessionId(value) {
	return SESSION_ID_RE.test(value.trim());
}
//#endregion
//#region src/agents/tools/sessions-resolution.ts
/**
* Session key resolution helpers.
*
* Normalizes display/internal/current-session aliases and resolves session-id inputs through Gateway.
*/
const CURRENT_SESSION_CLIENT_ALIAS_IDS = /* @__PURE__ */ new Set([
	GATEWAY_CLIENT_IDS.TUI,
	GATEWAY_CLIENT_IDS.CLI,
	GATEWAY_CLIENT_IDS.WEBCHAT_UI,
	GATEWAY_CLIENT_IDS.CONTROL_UI,
	GATEWAY_CLIENT_IDS.MACOS_APP,
	GATEWAY_CLIENT_IDS.IOS_APP,
	GATEWAY_CLIENT_IDS.ANDROID_APP
]);
function resolveMainSessionAlias(cfg) {
	const mainKey = normalizeMainKey(cfg.session?.mainKey);
	const scope = cfg.session?.scope ?? "per-sender";
	return {
		mainKey,
		alias: scope === "global" ? "global" : mainKey,
		scope
	};
}
function resolveDisplaySessionKey(params) {
	if (params.key === params.alias) return "main";
	if (params.key === params.mainKey) return "main";
	return params.key;
}
function resolveInternalSessionKey(params) {
	if (params.key === "current") return params.requesterInternalKey ?? params.key;
	if (params.key === "main") return params.alias;
	return params.key;
}
function resolveCurrentSessionClientAlias(params) {
	const requesterKey = normalizeOptionalString(params.requesterInternalKey);
	if (!requesterKey) return;
	const clientId = normalizeGatewayClientId(params.key);
	if (!clientId || !CURRENT_SESSION_CLIENT_ALIAS_IDS.has(clientId)) return;
	return requesterKey;
}
function isExpectedSessionLookupMiss(error) {
	return error instanceof Error && error.message.includes("No session found") && (!(error instanceof GatewayClientRequestError) || error.gatewayCode === "INVALID_REQUEST");
}
function isUnsupportedSpawnedSessionResolve(error) {
	return error instanceof GatewayClientRequestError && error.gatewayCode === "INVALID_REQUEST" && error.message === "unknown method: sessions.resolve";
}
async function lookupRequesterSessionOwnership(params) {
	if (params.requesterSessionKey === params.targetSessionKey && params.targetAgentId === params.requesterAgentId) return ok(true);
	const gatewayCall = params.callGateway ?? callAgentToolGatewayRequest;
	try {
		const resolved = await requestResolvedSession({
			key: params.targetSessionKey,
			agentId: params.targetAgentId,
			spawnedBy: params.requesterSessionKey,
			allowMissing: true
		}, gatewayCall);
		return ok(resolved?.key === params.targetSessionKey);
	} catch (error) {
		if (isExpectedSessionLookupMiss(error)) return ok(false);
		if (isUnsupportedSpawnedSessionResolve(error)) {
			const listed = await listSpawnedSessionKeysWithResult({
				requesterSessionKey: params.requesterSessionKey,
				callGateway: gatewayCall
			});
			return listed.ok ? ok(params.targetAgentId === params.requesterAgentId && listed.value.has(params.targetSessionKey)) : err(listed.error);
		}
		return err(sessionOwnershipLookupFailure(error));
	}
}
function looksLikeSessionKey(value) {
	const raw = normalizeOptionalString(value) ?? "";
	if (!raw) return false;
	if (raw === "main" || raw === "global" || raw === "unknown" || raw === "current") return true;
	if (isAcpSessionKey(raw)) return true;
	if (raw.startsWith("agent:")) return true;
	if (raw.startsWith("cron:") || raw.startsWith("hook:")) return true;
	if (raw.startsWith("node-") || raw.startsWith("node:")) return true;
	if (raw.includes(":group:") || raw.includes(":channel:")) return true;
	return false;
}
function shouldResolveSessionIdInput(value) {
	return looksLikeSessionId(value) || !looksLikeSessionKey(value);
}
function buildResolvedSessionReference(params) {
	return {
		ok: true,
		...params.agentId ? { agentId: params.agentId } : {},
		key: params.key,
		displayKey: resolveDisplaySessionKey({
			key: params.key,
			alias: params.alias,
			mainKey: params.mainKey
		}),
		resolvedViaSessionId: params.resolvedViaSessionId,
		requesterOwned: params.requesterOwned
	};
}
function buildFailedSessionReference(error, raw, restrictToSpawned) {
	return restrictToSpawned ? {
		ok: false,
		status: "forbidden",
		error: `Session not visible from this sandboxed agent session: ${raw}`
	} : {
		ok: false,
		status: "error",
		error: formatErrorMessage(error) || `Session not found: ${raw} (use the full sessionKey from sessions_list)`
	};
}
async function requestResolvedSession(params, callGateway) {
	const toResolvedSession = (result) => {
		const key = normalizeOptionalString(result?.key);
		if (!key) return;
		const agentId = normalizeOptionalString(result?.agentId);
		return {
			key,
			...agentId ? { agentId } : {}
		};
	};
	try {
		return toResolvedSession(await callGateway({
			method: "sessions.resolve",
			params
		}));
	} catch (error) {
		if (!(params.allowMissing === true && error instanceof GatewayClientRequestError && error.gatewayCode === "INVALID_REQUEST" && error.message.includes("invalid sessions.resolve params") && error.message.includes("unexpected property 'allowMissing'"))) throw error;
		const legacyParams = { ...params };
		delete legacyParams.allowMissing;
		return toResolvedSession(await callGateway({
			method: "sessions.resolve",
			params: legacyParams
		}));
	}
}
function buildSessionResolveQuery(params) {
	return {
		[params.kind]: params.input,
		agentId: params.agentId,
		spawnedBy: params.restrictToSpawned ? params.requesterInternalKey : void 0,
		...params.kind === "sessionId" ? {
			includeGlobal: !params.restrictToSpawned,
			includeUnknown: !params.restrictToSpawned
		} : {},
		...params.allowMissing ? { allowMissing: true } : {}
	};
}
async function lookupSessionReference(params) {
	try {
		const resolved = await requestResolvedSession(buildSessionResolveQuery({
			input: params.input,
			kind: params.kind,
			agentId: params.kind === "key" ? parseAgentSessionKey(params.input)?.agentId ?? params.keyAgentId ?? params.agentId : params.agentId,
			requesterInternalKey: params.requesterInternalKey,
			restrictToSpawned: params.restrictToSpawned,
			allowMissing: params.allowMissing
		}), params.callGateway);
		if (!resolved) return ok(null);
		return ok(buildResolvedSessionReference({
			...resolved,
			alias: params.alias,
			mainKey: params.mainKey,
			resolvedViaSessionId: params.kind === "sessionId",
			requesterOwned: params.restrictToSpawned
		}));
	} catch (error) {
		if (isExpectedSessionLookupMiss(error)) return ok(null);
		return err(sessionOwnershipLookupFailure(error));
	}
}
async function resolveSessionReferenceByKeyOrSessionId(params) {
	if (!params.skipKeyLookup) {
		const resolvedByKey = await lookupSessionReference({
			input: params.raw,
			kind: "key",
			keyAgentId: params.keyAgentId,
			agentId: params.agentId,
			alias: params.alias,
			mainKey: params.mainKey,
			requesterInternalKey: params.requesterInternalKey,
			restrictToSpawned: params.restrictToSpawned,
			allowMissing: params.allowMissing,
			callGateway: params.callGateway
		});
		if (!resolvedByKey.ok || resolvedByKey.value) return resolvedByKey;
	}
	if (!(params.forceSessionIdLookup || shouldResolveSessionIdInput(params.raw))) return ok(null);
	return await lookupSessionReference({
		input: params.raw,
		kind: "sessionId",
		keyAgentId: params.keyAgentId,
		agentId: params.agentId,
		alias: params.alias,
		mainKey: params.mainKey,
		requesterInternalKey: params.requesterInternalKey,
		restrictToSpawned: params.restrictToSpawned,
		allowMissing: params.allowMissing,
		callGateway: params.callGateway
	});
}
async function resolveSessionReference(params) {
	const gatewayCall = params.callGateway ?? callAgentToolGatewayRequest;
	const failedLookup = (failure) => {
		logSessionOwnershipLookupFailure({
			requesterSessionKey: params.requesterInternalKey ?? "unknown",
			failure
		});
		return {
			ok: false,
			status: params.restrictToSpawned ? "forbidden" : "error",
			error: params.restrictToSpawned ? lookupFailedDenialMessage(params.action, failure.kind) : lookupFailedOperationMessage(params.action, failure.kind)
		};
	};
	const rawInput = resolveCurrentSessionClientAlias({
		key: params.sessionKey,
		requesterInternalKey: params.requesterInternalKey
	}) ?? params.sessionKey.trim();
	const raw = rawInput === "current" && params.requesterInternalKey ? params.requesterInternalKey : rawInput;
	if (shouldResolveSessionIdInput(raw)) {
		const resolvedByGateway = await resolveSessionReferenceByKeyOrSessionId({
			raw,
			keyAgentId: params.keyAgentId,
			agentId: params.agentId,
			alias: params.alias,
			mainKey: params.mainKey,
			requesterInternalKey: params.requesterInternalKey,
			restrictToSpawned: params.restrictToSpawned,
			callGateway: gatewayCall
		});
		if (!resolvedByGateway.ok) return failedLookup(resolvedByGateway.error);
		if (resolvedByGateway.value) return resolvedByGateway.value;
		return {
			ok: false,
			status: params.restrictToSpawned ? "forbidden" : "error",
			notFound: true,
			error: params.restrictToSpawned ? `Session not visible from this sandboxed agent session: ${raw}` : `Session not found: ${raw} (use the full sessionKey from sessions_list)`
		};
	}
	const resolvedKey = resolveInternalSessionKey({
		key: raw,
		alias: params.alias,
		mainKey: params.mainKey,
		requesterInternalKey: params.requesterInternalKey
	});
	const semanticAliasAgentId = params.agentId ?? (rawInput === "current" ? parseAgentSessionKey(resolvedKey)?.agentId ?? params.keyAgentId : rawInput === "main" || rawInput === params.mainKey ? params.keyAgentId : void 0);
	const displayKey = resolveDisplaySessionKey({
		key: resolvedKey,
		alias: params.alias,
		mainKey: params.mainKey
	});
	return {
		ok: true,
		...semanticAliasAgentId ? { agentId: semanticAliasAgentId } : {},
		key: resolvedKey,
		displayKey,
		resolvedViaSessionId: false,
		requesterOwned: resolvedKey === params.requesterInternalKey && (!semanticAliasAgentId || semanticAliasAgentId === (parseAgentSessionKey(params.requesterInternalKey ?? "")?.agentId ?? params.keyAgentId))
	};
}
async function resolveVisibleSessionReference(params) {
	let resolvedKey = params.resolvedSession.key;
	let resolvedAgentId = params.resolvedSession.agentId ?? parseAgentSessionKey(resolvedKey)?.agentId;
	let displayKey = params.resolvedSession.displayKey;
	let missing = false;
	const requesterOwnedByResolution = params.resolvedSession.requesterOwned ?? (params.restrictToSpawned && params.resolvedSession.resolvedViaSessionId);
	if (isIncognitoSessionKey(resolvedKey)) return {
		ok: false,
		status: "forbidden",
		error: `Session not visible from session tools: ${params.visibilitySessionKey}`,
		displayKey
	};
	const input = params.visibilitySessionKey.trim();
	if (!params.resolvedSession.resolvedViaSessionId && input !== "current" && input !== "main" && input !== "global" && input !== "unknown" && !shouldResolveSessionIdInput(input) && !params.restrictToSpawned && (params.action === "history" || params.action === "send")) try {
		const resolved = await requestResolvedSession(buildSessionResolveQuery({
			input: resolvedKey,
			kind: "key",
			agentId: resolvedAgentId,
			requesterInternalKey: params.requesterSessionKey,
			restrictToSpawned: params.restrictToSpawned,
			allowMissing: params.allowMissingKey
		}), params.callGateway ?? callAgentToolGatewayRequest);
		if (resolved) {
			resolvedKey = resolved.key;
			resolvedAgentId = resolved.agentId ?? parseAgentSessionKey(resolved.key)?.agentId;
			displayKey = resolved.key;
		} else if (params.allowMissingKey) missing = true;
	} catch (error) {
		if (params.concealResolutionError && !params.restrictToSpawned) return {
			ok: false,
			status: "forbidden",
			error: params.concealResolutionError,
			displayKey
		};
		return {
			...buildFailedSessionReference(error, params.visibilitySessionKey, params.restrictToSpawned),
			displayKey
		};
	}
	if (isIncognitoSessionKey(resolvedKey)) return {
		ok: false,
		status: "forbidden",
		error: `Session not visible from session tools: ${params.visibilitySessionKey}`,
		displayKey
	};
	return {
		ok: true,
		...resolvedAgentId ? { agentId: resolvedAgentId } : {},
		key: resolvedKey,
		displayKey,
		requesterOwned: requesterOwnedByResolution || params.requesterSessionKey === resolvedKey && resolvedAgentId === params.requesterAgentId,
		...missing ? { missing: true } : {}
	};
}
//#endregion
//#region src/agents/tools/sessions-access.ts
/**
* Session visibility and access helpers for session tools.
*
* Adds OpenClaw session-key alias normalization and sandbox requester scoping over SDK visibility contracts.
*/
function readDescribedSessionVisibilityRow(value) {
	if (!isRecord(value)) return null;
	const key = normalizeOptionalString(value.key);
	if (!key) return null;
	return {
		key,
		agentId: normalizeOptionalString(value.agentId),
		ownerSessionKey: normalizeOptionalString(value.ownerSessionKey),
		spawnedBy: normalizeOptionalString(value.spawnedBy),
		parentSessionKey: normalizeOptionalString(value.parentSessionKey),
		sessionId: normalizeOptionalString(value.sessionId)
	};
}
/** Render operator guidance only when a tool presents a private access decision. */
const formatSessionToolAccessDenial = renderSessionVisibilityDenial;
function recordAdmittedSessionDecision(params) {
	const caller = getGatewayToolCallerIdentity();
	if (!caller?.executionIdentityToken || !caller.receiptAuthority) return false;
	try {
		if (caller.receiptAuthority() === false) return false;
	} catch {
		return false;
	}
	const receiptId = `${params.owner}:${randomUUID()}`;
	return recordExecutionDecisionWork({
		workVersion: 1,
		token: caller.executionIdentityToken,
		receipt: {
			schemaVersion: 1,
			receiptId,
			occurredAt: Date.now(),
			action: {
				family: "session",
				operation: params.action
			},
			decision: {
				outcome: params.outcome,
				reasonCode: params.reasonCode
			},
			enforcement: {
				coverageState: params.coverageState,
				policyRefs: params.policyRefs ?? [],
				grantRefs: [],
				contextFieldsUsed: params.contextFieldsUsed
			},
			source: {
				owner: params.owner,
				recordRef: receiptId,
				decisionBoundary: params.decisionBoundary
			},
			missingEvidence: params.missingEvidence ?? [],
			remediation: []
		},
		refs: { target: {
			namespace: "session",
			value: JSON.stringify([params.targetAgentId, params.targetSessionKey])
		} }
	});
}
function recordAdmittedSessionAccessDenial(params) {
	return recordAdmittedSessionDecision({
		action: params.action,
		targetAgentId: params.targetAgentId,
		targetSessionKey: params.targetSessionKey,
		outcome: "denied",
		reasonCode: params.denial.reasonCode,
		coverageState: params.denial.missingEvidence.length > 0 ? "unknown" : "enforced",
		policyRefs: params.denial.policyRefs,
		contextFieldsUsed: params.denial.contextFieldsUsed,
		missingEvidence: params.denial.missingEvidence,
		owner: "session-access",
		decisionBoundary: "session-tool.access"
	});
}
/** Queue an owner-native model-mediated session result after its final await. */
function recordSessionToolActionFact(params) {
	const reasonCode = `session_${params.operation.replaceAll("-", "_")}_${params.fact.replaceAll("-", "_")}`;
	return recordAdmittedSessionDecision({
		action: params.operation,
		targetAgentId: params.targetAgentId,
		targetSessionKey: params.targetSessionKey,
		outcome: params.fact === "conflict" ? "denied" : params.fact === "no-op" ? "not-applicable" : "allowed",
		reasonCode,
		coverageState: "attribution-only",
		contextFieldsUsed: ["targetAgentId", "sessionActionResult"],
		owner: "session-action",
		decisionBoundary: "session-tool.result"
	});
}
/** Record owner-native lifecycle conflicts without classifying presentation text. */
async function runSessionToolActionWithConflictReceipt(params) {
	try {
		return await params.run();
	} catch (error) {
		if (isGatewayClientRequestError(error) && isRecord(error.details) && error.details.reason === "session-changed") recordSessionToolActionFact({
			operation: params.operation,
			fact: "conflict",
			targetAgentId: params.targetAgentId,
			targetSessionKey: params.targetSessionKey
		});
		throw error;
	}
}
/** Check one prepared target without re-listing the requester's spawned sessions. */
async function resolveSessionToolAccess(params) {
	const authorizationTargetSessionKey = params.authorizationTargetSessionKey ?? params.targetSessionKey;
	const deny = (denial) => {
		recordAdmittedSessionAccessDenial({
			action: params.displayAction ?? params.action,
			targetAgentId: params.targetAgentId,
			targetSessionKey: authorizationTargetSessionKey,
			denial
		});
		return denial;
	};
	const scoped = createSessionVisibilityChecker.resolveScopedAccess({
		action: params.action,
		requesterSessionKey: params.requesterSessionKey,
		targetSessionKey: authorizationTargetSessionKey
	});
	if (scoped) return {
		allowed: true,
		expectedSessionId: scoped.expectedSessionId
	};
	const decisionChecker = createSessionVisibilityDecisionChecker({
		action: params.action,
		defaultAgentId: params.targetAgentId,
		requesterAgentId: params.requesterAgentId,
		requesterSessionKey: params.requesterSessionKey,
		mainSessionKey: params.mainSessionKey,
		explicitTargetAgentOwnership: !parseAgentSessionKey(authorizationTargetSessionKey),
		visibility: params.visibility,
		a2aPolicy: params.a2aPolicy
	});
	const check = (requesterOwned) => decisionChecker.check({
		key: authorizationTargetSessionKey,
		agentId: params.targetAgentId,
		...requesterOwned ? { spawnedBy: params.requesterSessionKey } : {}
	});
	const initial = check(false);
	if (initial.allowed) return initial;
	const requesterOwnedAccess = check(true);
	if (params.requesterOwned) {
		if (requesterOwnedAccess.allowed) return requesterOwnedAccess;
		return deny(requesterOwnedAccess);
	}
	if (!requesterOwnedAccess.allowed) return deny(initial);
	if (params.action === "history" && params.displayAction !== "search" && authorizationTargetSessionKey === params.targetSessionKey) try {
		const row = readDescribedSessionVisibilityRow((await (params.callGateway ?? callAgentToolGatewayRequest)({
			method: "sessions.describe",
			params: { key: params.targetSessionKey }
		}))?.session);
		if (row?.key === params.targetSessionKey) {
			const access = decisionChecker.check(row);
			if (!access.allowed) return deny(access);
			if (row.sessionId) return {
				allowed: true,
				expectedSessionId: row.sessionId
			};
		}
	} catch {}
	const ownership = await lookupRequesterSessionOwnership({
		requesterSessionKey: params.requesterSessionKey,
		requesterAgentId: params.requesterAgentId,
		targetSessionKey: params.targetSessionKey,
		targetAgentId: params.targetAgentId,
		callGateway: params.callGateway
	});
	if (!ownership.ok) {
		logSessionOwnershipLookupFailure({
			requesterSessionKey: params.requesterSessionKey,
			failure: ownership.error
		});
		return deny(sessionOwnershipLookupDenied(ownership.error.kind));
	}
	if (ownership.value) return requesterOwnedAccess;
	return deny(initial);
}
/** Resolves the requester context used to filter sandboxed session-tool access. */
function resolveSandboxedSessionToolContext(params) {
	const { mainKey, alias, scope } = resolveMainSessionAlias(params.cfg);
	const visibility = resolveSandboxSessionToolsVisibility(params.cfg);
	const requesterSessionKey = normalizeOptionalString(params.agentSessionKey);
	const requesterInternalKey = requesterSessionKey ? resolveInternalSessionKey({
		key: requesterSessionKey,
		alias,
		mainKey
	}) : void 0;
	const effectiveRequesterKey = requesterInternalKey ?? alias;
	const restrictToSpawned = params.sandboxed === true && visibility === "spawned" && Boolean(requesterInternalKey) && !isSubagentSessionKey(requesterInternalKey);
	const requesterAgentId = parseAgentSessionKey(requesterInternalKey)?.agentId ?? (!restrictToSpawned && requesterInternalKey === alias ? resolveSessionAgentId({
		config: params.cfg,
		sessionKey: requesterInternalKey,
		agentId: params.requesterAgentId
	}) : void 0);
	return {
		mainKey,
		alias,
		visibility,
		requesterInternalKey,
		mainSessionKey: !restrictToSpawned && requesterAgentId ? resolveCanonicalMainSessionKey({
			agentId: requesterAgentId,
			mainKey,
			sessionScope: scope
		}) : void 0,
		effectiveRequesterKey,
		restrictToSpawned
	};
}
//#endregion
//#region src/agents/tools/sessions-helpers.ts
/**
* Shared session-tool data shapes and classification helpers.
*
* Keeps list/send/status tools aligned on rows, visibility context, and compact kind/channel labels.
*/
/** Coarse session kind used by session list/status tools. */
const SESSION_LIST_KINDS = [
	"main",
	"group",
	"cron",
	"hook",
	"node",
	"other"
];
const SESSION_KIND_BY_CLASSIFICATION = {
	main: "main",
	global: "main",
	group: "group",
	channel: "group",
	cron: "cron",
	hook: "hook",
	node: "node"
};
/** Resolves config plus sandbox visibility context for a session tool call. */
function resolveSessionToolContext(opts) {
	const cfg = opts?.config ?? getRuntimeConfig();
	return {
		cfg,
		a2aPolicy: createAgentToAgentPolicy(cfg),
		sessionVisibility: resolveEffectiveSessionToolsVisibility({
			cfg,
			sandboxed: opts?.sandboxed === true
		}),
		...resolveSandboxedSessionToolContext({
			cfg,
			agentSessionKey: opts?.agentSessionKey,
			requesterAgentId: opts?.requesterAgentIdOverride ?? opts?.agentId,
			sandboxed: opts?.sandboxed
		})
	};
}
/** Projects the Gateway's authoritative classification into the tool's coarse kinds. */
function classifySessionListKind(params) {
	if (params.classification === "thread") return params.peerKind === "group" || params.peerKind === "channel" ? "group" : "other";
	return SESSION_KIND_BY_CLASSIFICATION[params.classification] ?? "other";
}
/** Derives the best channel label for a session row. */
function deriveChannel(params) {
	if (params.kind === "cron" || params.kind === "hook" || params.kind === "node") return "internal";
	const channel = normalizeOptionalString(params.channel ?? void 0);
	if (channel) return channel;
	const lastChannel = normalizeOptionalString(params.lastChannel ?? void 0);
	if (lastChannel) return lastChannel;
	return parseRawSessionConversationRef(params.key)?.channel ?? "unknown";
}
//#endregion
export { hasGatewayToolRoutingContext as C, getInProcessGatewayToolContext as S, withAgentToolGatewayRuntimeIdentity as T, shouldResolveSessionIdInput as _, formatSessionToolAccessDenial as a, callInProcessGatewayTool as b, resolveSessionToolAccess as c, resolveCurrentSessionClientAlias as d, resolveDisplaySessionKey as f, resolveVisibleSessionReference as g, resolveSessionReference as h, resolveSessionToolContext as i, runSessionToolActionWithConflictReceipt as l, resolveMainSessionAlias as m, classifySessionListKind as n, recordSessionToolActionFact as o, resolveInternalSessionKey as p, deriveChannel as r, resolveSandboxedSessionToolContext as s, SESSION_LIST_KINDS as t, isExpectedSessionLookupMiss as u, SESSION_ID_RE as v, hasInProcessGatewayToolContext as w, callInProcessGatewayToolWithCreation as x, callAgentToolGatewayRequest as y };
