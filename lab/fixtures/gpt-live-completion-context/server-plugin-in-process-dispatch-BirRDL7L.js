import { D as resolveExpiresAtMsFromDurationMs, g as isFutureDateTimestampMs } from "./number-coercion-CLj0HTDM.js";
import { n as resolveGlobalMap } from "./global-singleton-Dc_stLtU.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { t as createAbortError } from "./abort-signal-D2k14JsD.js";
import { t as ADMIN_SCOPE } from "./operator-scopes-Dw7Gu2cA.js";
import { c as resolveSafeTimeoutDelayMs } from "./timeouts-D2XMKe-X.js";
import { i as retainGatewayResponsePayload } from "./protocol-request-BMUN1re6.js";
import { t as GatewayClientRequestError } from "./request-error-BSFClQsA.js";
import { d as getActivePluginRegistry } from "./runtime-MupoouIC.js";
import { a as getPluginRuntimeGatewayRequestScope } from "./gateway-request-scope-CmMd3nUp.js";
import { n as mergePluginRuntimeClientInternal, t as createSyntheticPluginRuntimeClient } from "./server-plugin-runtime-client-CXu_O7BH.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
//#region src/gateway/in-process-agent-runtime-identity.ts
const inProcessAgentRuntimeIdentities = /* @__PURE__ */ new WeakMap();
/** Carry authenticated runtime identity without widening plugin dispatch options. */
function withInProcessAgentRuntimeIdentity(options, identity) {
	if (!identity) return options;
	const carried = { ...options };
	inProcessAgentRuntimeIdentities.set(carried, identity);
	return carried;
}
function readInProcessAgentRuntimeIdentity(options) {
	return options ? inProcessAgentRuntimeIdentities.get(options) : void 0;
}
//#endregion
//#region src/gateway/server-in-process-dispatch.ts
function unwrapGatewayMethodDispatchResponse(method, response) {
	if (!response.ok) {
		const requestError = new GatewayClientRequestError({
			code: response.error?.code,
			message: response.error?.message ?? `Gateway method "${method}" failed.`,
			details: response.error?.details,
			retryable: response.error?.retryable,
			retryAfterMs: response.error?.retryAfterMs
		});
		retainGatewayResponsePayload(requestError, response.payload);
		const cause = response.error?.cause;
		if (cause !== void 0) Object.defineProperty(requestError, "cause", { value: cause });
		throw requestError;
	}
	return response.payload;
}
function resolveDispatchDeadlineMs(timeoutMs) {
	if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) return;
	return Date.now() + resolveSafeTimeoutDelayMs(timeoutMs);
}
function resolveRemainingDispatchTimeoutMs(deadlineMs) {
	return deadlineMs === void 0 ? void 0 : resolveSafeTimeoutDelayMs(deadlineMs - Date.now(), { minMs: 0 });
}
function resolveDispatchAbortError(method, signal) {
	return signal.reason instanceof Error ? signal.reason : createAbortError(`gateway request aborted for ${method}`, { cause: signal.reason });
}
/** Reject before a cancelled in-process request can invoke method work. */
function throwIfGatewayDispatchAborted(method, signal) {
	if (signal?.aborted) throw resolveDispatchAbortError(method, signal);
}
async function waitForDispatch(method, promise, deadlineMs, signal, onSignalAbort, onTimeout) {
	let timeout;
	let onAbort;
	try {
		if (signal?.aborted) throw resolveDispatchAbortError(method, signal);
		const remainingTimeoutMs = resolveRemainingDispatchTimeoutMs(deadlineMs);
		if (remainingTimeoutMs === void 0 && !signal) return await promise;
		const cancellation = new Promise((_resolve, reject) => {
			if (remainingTimeoutMs !== void 0) timeout = setTimeout(() => {
				onTimeout?.();
				reject(/* @__PURE__ */ new Error(`gateway request timeout for ${method}`));
			}, remainingTimeoutMs);
			if (signal) {
				onAbort = () => reject(resolveDispatchAbortError(method, signal));
				signal.addEventListener("abort", onAbort, { once: true });
				if (signal.aborted) onAbort();
			}
		});
		return await Promise.race([promise, cancellation]);
	} catch (error) {
		if (signal?.aborted && onSignalAbort) await Promise.resolve().then(onSignalAbort).catch(() => {});
		throw error;
	} finally {
		if (timeout) clearTimeout(timeout);
		if (signal && onAbort) signal.removeEventListener("abort", onAbort);
	}
}
/** Applies the same non-cancelling deadline used by in-process Gateway dispatch. */
async function waitForGatewayDispatch(method, promise, timeoutMs, signal, onSignalAbort, onTimeout) {
	return await waitForDispatch(method, promise, resolveDispatchDeadlineMs(timeoutMs), signal, onSignalAbort, onTimeout);
}
/** Dispatches one request through the ordinary Gateway router without opening a transport. */
async function dispatchGatewayRequestInProcessRaw(method, params, options) {
	throwIfGatewayDispatchAborted(method, options.signal);
	let firstResponse;
	let finalResponse;
	let resolveFirstResponse;
	let rejectFirstResponse;
	let resolveFinalResponse;
	let rejectFinalResponse;
	let postFirstResponseError;
	const firstResponsePromise = new Promise((resolve, reject) => {
		resolveFirstResponse = resolve;
		rejectFirstResponse = reject;
	});
	const deadlineMs = resolveDispatchDeadlineMs(options.timeoutMs);
	const { handleGatewayRequest } = await import("./server-methods-CBcm6UgT.js");
	handleGatewayRequest({
		req: {
			type: "req",
			id: `${options.requestIdPrefix ?? "in-process"}-${randomUUID()}`,
			method,
			params
		},
		client: options.client,
		isWebchatConnect: options.isWebchatConnect ?? (() => false),
		respond: (ok, payload, error, meta) => {
			const response = {
				ok,
				payload,
				error,
				...meta ? { meta } : {}
			};
			if (!firstResponse) {
				firstResponse = response;
				resolveFirstResponse?.(response);
				return;
			}
			if (!finalResponse) {
				finalResponse = response;
				resolveFinalResponse?.(response);
			}
		},
		context: options.context,
		methodRegistry: options.methodRegistry,
		sessionMutationCommitGuard: options.sessionMutationCommitGuard,
		...options.signal ? { signal: options.signal } : {}
	}).then(() => {
		if (!firstResponse) rejectFirstResponse?.(/* @__PURE__ */ new Error(`Gateway method "${method}" completed without a response.`));
	}).catch((err) => {
		const error = err instanceof Error ? err : new Error(String(err));
		if (!firstResponse) {
			rejectFirstResponse?.(error);
			return;
		}
		postFirstResponseError = error;
		rejectFinalResponse?.(error);
	});
	firstResponse = await waitForDispatch(method, firstResponsePromise, deadlineMs, options.signal, options.onSignalAbort);
	const firstPayload = firstResponse.payload;
	if (!firstResponse.ok || options.expectFinal !== true || firstPayload?.status !== "accepted") return firstResponse;
	options.onAccepted?.(firstResponse.payload);
	if (postFirstResponseError) throw postFirstResponseError;
	return finalResponse ?? await waitForDispatch(method, new Promise((resolve, reject) => {
		resolveFinalResponse = resolve;
		rejectFinalResponse = reject;
		if (postFirstResponseError) {
			reject(postFirstResponseError);
			return;
		}
		if (finalResponse) resolve(finalResponse);
	}), deadlineMs, options.signal, options.onSignalAbort);
}
async function dispatchGatewayRequestInProcess(method, params, options) {
	return unwrapGatewayMethodDispatchResponse(method, await dispatchGatewayRequestInProcessRaw(method, params, options));
}
//#endregion
//#region src/gateway/subagent-completion-tool-handoff.ts
const SUBAGENT_COMPLETION_TOOL_HANDOFF_TTL_MS = 3e5;
const handoffs = resolveGlobalMap(Symbol.for("openclaw.subagentCompletionToolHandoffs"), "close-and-restart");
function normalizeRegistration(params) {
	const sourceSessionKey = normalizeOptionalString(params.sourceSessionKey);
	const sourceSessionId = normalizeOptionalString(params.sourceSessionId);
	const targetSessionKey = normalizeOptionalString(params.targetSessionKey);
	const targetSessionId = normalizeOptionalString(params.targetSessionId);
	const idempotencyKey = normalizeOptionalString(params.idempotencyKey);
	if (!sourceSessionKey || !targetSessionKey || !targetSessionId || !idempotencyKey) return;
	return {
		sourceSessionKey,
		...sourceSessionId ? { sourceSessionId } : {},
		targetSessionKey,
		targetSessionId,
		idempotencyKey
	};
}
function pruneExpired(nowMs) {
	for (const [handoffId, entry] of handoffs) if (!isFutureDateTimestampMs(entry.expiresAtMs, { nowMs })) handoffs.delete(handoffId);
}
/** Register one short-lived capability for the exact completion delivery request. */
function registerSubagentCompletionToolHandoff(params) {
	const normalized = normalizeRegistration(params);
	if (!normalized) return;
	const nowMs = params.nowMs ?? Date.now();
	pruneExpired(nowMs);
	const expiresAtMs = resolveExpiresAtMsFromDurationMs(SUBAGENT_COMPLETION_TOOL_HANDOFF_TTL_MS, { nowMs });
	if (expiresAtMs === void 0) return;
	const handoffId = randomUUID();
	handoffs.set(handoffId, {
		...normalized,
		expiresAtMs
	});
	return handoffId;
}
/** Remove an unconsumed capability after its in-process dispatch finishes or fails. */
function cancelSubagentCompletionToolHandoff(handoffId) {
	const normalized = normalizeOptionalString(handoffId);
	return normalized ? handoffs.delete(normalized) : false;
}
/**
* Consume the capability once and bind it to the model route admitted for this run.
* Mismatches do not burn the capability; only the exact request may consume it.
*/
function consumeSubagentCompletionToolHandoff(params) {
	const handoffId = normalizeOptionalString(params.handoffId);
	const sourceSessionKey = normalizeOptionalString(params.sourceSessionKey);
	const sourceSessionId = normalizeOptionalString(params.sourceSessionId);
	const targetSessionKey = normalizeOptionalString(params.targetSessionKey);
	const targetSessionId = normalizeOptionalString(params.targetSessionId);
	const idempotencyKey = normalizeOptionalString(params.idempotencyKey);
	const provider = normalizeOptionalString(params.provider)?.toLowerCase();
	const model = normalizeOptionalString(params.model);
	if (!handoffId || !sourceSessionKey || !targetSessionKey || !targetSessionId || !idempotencyKey || !provider || !model) return;
	pruneExpired(params.nowMs ?? Date.now());
	const entry = handoffs.get(handoffId);
	if (!entry || entry.sourceSessionKey !== sourceSessionKey || entry.sourceSessionId !== sourceSessionId || entry.targetSessionKey !== targetSessionKey || entry.targetSessionId !== targetSessionId || entry.idempotencyKey !== idempotencyKey) return;
	handoffs.delete(handoffId);
	return {
		kind: "subagent-completion",
		sourceSessionKey,
		...sourceSessionId ? { sourceSessionId } : {},
		targetSessionKey,
		targetSessionId,
		provider,
		model
	};
}
//#endregion
//#region src/gateway/server-plugin-in-process-dispatch.ts
const operatorToolGatewayAuthority = new AsyncLocalStorage();
/** Retains one verified operator identity only for its awaited tool invocation. */
async function withOperatorToolGatewayAuthority(authority, run) {
	const activeAuthority = {
		...authority,
		active: true
	};
	try {
		return await operatorToolGatewayAuthority.run(activeAuthority, run);
	} finally {
		activeAuthority.active = false;
	}
}
function resolveInProcessGatewayDispatch(method, options) {
	const inheritedOperatorAuthority = operatorToolGatewayAuthority.getStore();
	if (inheritedOperatorAuthority && !inheritedOperatorAuthority.active) throw new Error("operator tool invocation authority expired");
	const scope = getPluginRuntimeGatewayRequestScope();
	const scopedOperatorProfile = scope?.client?.authenticatedUserProfile;
	const scopedRoleActor = scope?.client?.internal?.operatorRoleActor;
	const explicitSystemActor = !scope?.client ? options?.operatorRoleActor : void 0;
	const verifiedOperatorAuthority = inheritedOperatorAuthority ?? (scopedOperatorProfile?.profileId ? {
		authenticatedUserProfile: scopedOperatorProfile,
		scopes: scope?.client?.connect.scopes ?? []
	} : void 0);
	const isHostOwnedAgentRun = method === "agent" && Boolean(options?.agentRunTracking);
	const operatorAuthority = isHostOwnedAgentRun ? void 0 : verifiedOperatorAuthority;
	const operatorRoleActor = isHostOwnedAgentRun ? inheritedOperatorAuthority ? {
		kind: "operator",
		profileId: inheritedOperatorAuthority.authenticatedUserProfile.profileId
	} : scopedRoleActor ?? (scopedOperatorProfile?.profileId ? {
		kind: "operator",
		profileId: scopedOperatorProfile.profileId
	} : scope?.client ? void 0 : explicitSystemActor ?? { kind: "system" }) : scopedRoleActor ?? explicitSystemActor;
	const resolveGatewayContext = options?.resolveGatewayContext ?? scope?.resolveGatewayContext;
	const context = getInProcessGatewayRequestContext(resolveGatewayContext);
	const isWebchatConnect = scope?.isWebchatConnect ?? (() => false);
	if (!context) throw new Error(`In-process gateway dispatch requires a gateway request scope or instance binding (method: ${method}).`);
	if (options?.requireScopedClient === true && !scope?.client) throw new Error(`In-process gateway dispatch requires an authenticated plugin request scope (method: ${method}).`);
	const pluginRuntimeOwnerId = typeof options?.pluginRuntimeOwnerId === "string" && options.pluginRuntimeOwnerId.trim() ? options.pluginRuntimeOwnerId.trim() : void 0;
	const pluginRecord = pluginRuntimeOwnerId ? getActivePluginRegistry()?.plugins.find((entry) => entry.id === pluginRuntimeOwnerId) : void 0;
	const nodeInvokeApprovalSessionKey = method === "node.invoke" && scope?.pluginId?.trim() === pluginRuntimeOwnerId && (scope?.pluginOrigin === "bundled" || scope?.pluginTrustedOfficialInstall === true || pluginRecord?.origin === "bundled" || pluginRecord?.trustedOfficialInstall === true) ? options?.nodeInvokeApprovalSessionKey : void 0;
	if (options?.nodeInvokeStream && (method !== "node.invoke" || !pluginRuntimeOwnerId || options.forceSyntheticClient !== true)) throw new Error("Node invoke streaming requires an owner-bound trusted synthetic client.");
	const delegatedToolPolicyHandoffId = options?.delegatedToolPolicyHandoff ? registerSubagentCompletionToolHandoff(options.delegatedToolPolicyHandoff) : void 0;
	const requestedSyntheticScopes = options?.syntheticScopes ?? ["operator.write"];
	const operatorScopes = operatorAuthority?.scopes ?? (operatorRoleActor?.kind === "operator" ? verifiedOperatorAuthority?.scopes ?? scope?.client?.connect.scopes ?? [] : void 0);
	const syntheticScopes = operatorScopes ? requestedSyntheticScopes.filter((requestedScope) => operatorScopes.includes(requestedScope)) : options?.syntheticScopes;
	if (operatorScopes?.includes("operator.admin") && !syntheticScopes?.includes("operator.admin")) syntheticScopes?.push(ADMIN_SCOPE);
	const baseSyntheticClient = createSyntheticPluginRuntimeClient({
		...operatorAuthority ? { authenticatedUserProfile: operatorAuthority.authenticatedUserProfile } : {},
		allowModelOverride: options?.allowSyntheticModelOverride === true,
		agentToolCaller: options?.agentToolCaller,
		agentRunTracking: options?.agentRunTracking,
		...operatorRoleActor ? { operatorRoleActor } : {},
		cronRunContinuation: options?.allowSyntheticCronRunContinuation === true,
		internalDeliveryMediaUrls: options?.internalDeliveryMediaUrls,
		internalDeliverySuppressText: options?.internalDeliverySuppressText,
		...pluginRuntimeOwnerId ? { pluginRuntimeOwnerId } : {},
		...nodeInvokeApprovalSessionKey ? { nodeInvokeApprovalSessionKey } : {},
		...options?.pluginSubagentRequester ? { pluginSubagentRequester: options.pluginSubagentRequester } : {},
		...options?.runtimePluginToolGrant ? { runtimePluginToolGrant: options.runtimePluginToolGrant } : {},
		...options?.pluginSubagentToolsAllow ? { pluginSubagentToolsAllow: options.pluginSubagentToolsAllow } : {},
		delegatedToolPolicyHandoffId,
		...options?.sessionCreation ? { sessionCreation: options.sessionCreation } : {},
		scopes: syntheticScopes
	});
	const scopedStreamClient = options?.nodeInvokeStream ? scope?.client : void 0;
	const agentRuntimeIdentity = scopedStreamClient?.internal?.agentRuntimeIdentity ?? readInProcessAgentRuntimeIdentity(options);
	const syntheticClient = agentRuntimeIdentity || options?.nodeInvokeStream ? {
		...scopedStreamClient ?? baseSyntheticClient,
		...scopedStreamClient ? { connect: {
			...scopedStreamClient.connect,
			scopes: baseSyntheticClient.connect.scopes
		} } : {},
		internal: {
			...scopedStreamClient?.internal,
			...baseSyntheticClient.internal,
			...agentRuntimeIdentity ? { agentRuntimeIdentity } : {},
			...options?.nodeInvokeStream ? { nodeInvokeStream: options.nodeInvokeStream } : {}
		}
	} : baseSyntheticClient;
	const scopedClient = mergePluginRuntimeClientInternal(scope?.client, pluginRuntimeOwnerId || options?.agentRunTracking || options?.pluginSubagentRequester || options?.runtimePluginToolGrant || options?.pluginSubagentToolsAllow || options?.delegatedToolPolicyHandoff || scope?.client?.internal?.delegatedToolPolicyHandoffId ? {
		...options?.agentRunTracking ? { agentRunTracking: options.agentRunTracking } : {},
		...pluginRuntimeOwnerId ? { pluginRuntimeOwnerId } : {},
		...options?.pluginSubagentRequester ? { pluginSubagentRequester: options.pluginSubagentRequester } : {},
		runtimePluginToolGrant: options?.runtimePluginToolGrant,
		pluginSubagentToolsAllow: options?.pluginSubagentToolsAllow,
		delegatedToolPolicyHandoffId
	} : void 0);
	if (options?.disableSyntheticClient === true && !scopedClient) {
		cancelSubagentCompletionToolHandoff(delegatedToolPolicyHandoffId);
		throw new Error(`In-process gateway dispatch requires a scoped client (method: ${method}).`);
	}
	return {
		assertContextCurrent: () => {
			if ((resolveGatewayContext ? resolveGatewayContext() : scope?.context) !== context) throw new Error(`In-process gateway dispatch requires a current gateway instance binding (method: ${method}).`);
		},
		client: options?.forceSyntheticClient === true ? syntheticClient : scopedClient ?? syntheticClient,
		context,
		delegatedToolPolicyHandoffId,
		isWebchatConnect
	};
}
async function withInProcessGatewayDispatch(method, options, run) {
	const resolved = resolveInProcessGatewayDispatch(method, options);
	try {
		return method === "agent" && operatorToolGatewayAuthority.getStore() ? await operatorToolGatewayAuthority.exit(() => run(resolved)) : await run(resolved);
	} finally {
		cancelSubagentCompletionToolHandoff(resolved.delegatedToolPolicyHandoffId);
	}
}
async function dispatchGatewayMethodInProcessRaw(method, params, options) {
	return await withInProcessGatewayDispatch(method, options, async (resolved) => {
		return await dispatchGatewayRequestInProcessRaw(method, params, {
			client: resolved.client,
			context: resolved.context,
			expectFinal: options?.expectFinal,
			isWebchatConnect: resolved.isWebchatConnect,
			methodRegistry: resolved.context.getGatewayMethodRegistry?.(),
			onAccepted: options?.onAccepted,
			onSignalAbort: options?.onSignalAbort,
			requestIdPrefix: "plugin-subagent",
			sessionMutationCommitGuard: () => {
				resolved.assertContextCurrent();
				options?.sessionMutationCommitGuard?.();
			},
			timeoutMs: options?.timeoutMs,
			...options?.signal ? { signal: options.signal } : {}
		});
	});
}
/** Live request context for trusted built-in tools that need direct runtime state. */
function getInProcessGatewayRequestContext(resolveGatewayContext) {
	if (resolveGatewayContext) return resolveGatewayContext();
	const scope = getPluginRuntimeGatewayRequestScope();
	return scope?.resolveGatewayContext ? scope.resolveGatewayContext() : scope?.context;
}
async function dispatchGatewayMethodInProcess(method, params, options) {
	if (method === "agent" || method === "agent.wait") return await withInProcessGatewayDispatch(method, options, async (resolved) => {
		const createAgentTurnFacade = resolved.context.createAgentTurnFacade;
		if (!createAgentTurnFacade) throw new Error(`Gateway instance agent turn facade unavailable for ${method}`);
		const facade = await createAgentTurnFacade({
			assertContextCurrent: resolved.assertContextCurrent,
			client: resolved.client,
			isWebchatConnect: resolved.isWebchatConnect
		});
		return method === "agent" ? await facade.dispatch(params, {
			cancelOnDeadline: options?.cancelOnDeadline,
			expectFinal: options?.expectFinal,
			onAccepted: options?.onAccepted,
			onExecutionStarted: options?.onExecutionStarted,
			onSignalAbort: options?.onSignalAbort,
			signal: options?.signal,
			timeoutMs: options?.timeoutMs
		}) : await facade.wait(params, options?.timeoutMs, options?.signal, options?.onSignalAbort);
	});
	return unwrapGatewayMethodDispatchResponse(method, await dispatchGatewayMethodInProcessRaw(method, params, options));
}
//#endregion
export { cancelSubagentCompletionToolHandoff as a, dispatchGatewayRequestInProcess as c, waitForGatewayDispatch as d, withInProcessAgentRuntimeIdentity as f, withOperatorToolGatewayAuthority as i, throwIfGatewayDispatchAborted as l, dispatchGatewayMethodInProcessRaw as n, consumeSubagentCompletionToolHandoff as o, getInProcessGatewayRequestContext as r, registerSubagentCompletionToolHandoff as s, dispatchGatewayMethodInProcess as t, unwrapGatewayMethodDispatchResponse as u };
