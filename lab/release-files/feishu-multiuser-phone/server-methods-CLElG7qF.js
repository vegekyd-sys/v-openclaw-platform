import {prepareVoiceActor as vPrepareVoiceActor} from "./v-feishu-voice-runtime.mjs";
// v-feishu-voice-actor-dispatch-v1
import { c as isRecord } from "./record-coerce-DItp3I4t.js";
import { l as isOperatorScope, t as ADMIN_SCOPE } from "./operator-scopes-Dw7Gu2cA.js";
import { Ed as GATEWAY_SUSPEND_UNAVAILABLE_REASON, Td as GATEWAY_RESTART_UNAVAILABLE_REASON } from "./src-B9mb84px.js";
import { t as ErrorCodes } from "./gateway-error-details-B9ifm8Ur.js";
import { i as gatewayStartupUnavailableDetails } from "./startup-unavailable-D0-EeFjq.js";
import { d as getActivePluginRegistry, l as getActivePluginHttpRouteRegistry } from "./runtime-MupoouIC.js";
import { a as getPluginRuntimeGatewayRequestScope, c as withPluginRuntimeGatewayRequestScope, i as getPluginRuntimeGatewayNodeAuthorities } from "./gateway-request-scope-CmMd3nUp.js";
import { d as isCoreGatewayMethodClassified, n as authorizeOperatorScopesForMethod, p as listCoreGatewayHandlerMethodNames, r as authorizeOperatorScopesForRequiredScope, s as resolveLeastPrivilegeOperatorScopesForMethod, u as createCoreGatewayMethodDescriptors } from "./method-scopes-C3BvHJ95.js";
import { i as sessionMutationTargetFields } from "./session-method-policy-BAkxsFSx.js";
import { C as tryBeginGatewayPreparedRestartRootWorkAdmission, T as tryBeginGatewayRootWorkAdmission, c as getGatewaySuspendAdmissionPhase, u as isGatewayRestartDraining } from "./gateway-work-admission-3tn4Qiws.js";
import { d as errorShape, f as missingScopeErrorShape } from "./error-codes-DKSaEjvx.js";
import { p as authenticatedProfileUnavailableError } from "./operator-role-policy-B_VzZMic.js";
import { B as SessionMutationAuthorizationChangedError, c as resolveDirectIncognitoTargets, i as resolveSessionMutationAuthorization } from "./session-sharing-BlMqwMBH.js";
import { n as resolveControlPlaneActor, t as formatControlPlaneActor } from "./control-plane-audit-CN8L3SYx.js";
import { n as consumeControlPlaneWriteBudget, t as CONTROL_PLANE_RATE_LIMIT_WINDOW_MS } from "./control-plane-rate-limit-B1YxvgrA.js";
import { n as createGatewayMethodRegistry, r as createPluginGatewayMethodDescriptors, t as createGatewayMethodDescriptorsFromHandlers } from "./registry-BagSHJEt.js";
import { n as parseGatewayRole, t as isRoleAuthorizedForMethod } from "./role-policy-BOHKCNLs.js";
import { t as isTargetedNonSafeGatewayRestartRequest } from "./restart-request-DCnDLrlM.js";
import { n as classifyGatewayStaleInstall } from "./stale-install-Coqyo4R-.js";
//#region src/gateway/server-methods/lazy-core-handlers.ts
function lazyHandlerModule(loadModule, selectHandlers) {
	let handlersPromise = null;
	return () => handlersPromise ??= loadModule().then(selectHandlers);
}
function createLazyCoreHandlers(params) {
	return Object.fromEntries(params.methods.map((method) => [method, async (opts) => {
		const handler = (await params.loadHandlers())[method];
		if (!handler) throw new Error(`lazy gateway handler not found: ${method}`);
		await handler(opts);
	}]));
}
//#endregion
//#region src/gateway/server-methods.ts
const CORE_GATEWAY_HANDLER_MODULES = {
	agent: () => import("./agent-BKXR6yzS.js").then((module) => module.agentHandlers),
	"agent-identity": () => import("./agent-identity-DqBKhLZY.js").then((module) => module.agentIdentityHandlers),
	agents: () => import("./agents-7Q26VwD5.js").then((module) => module.agentsHandlers),
	"agents-workspace": () => import("./agents-workspace-BRulec_S.js").then((module) => module.agentsWorkspaceHandlers),
	artifacts: () => import("./artifacts-DlHIJU7h.js").then((module) => module.artifactsHandlers),
	board: () => import("./board-Bmf4OhAE.js").then((module) => module.boardHandlers),
	audit: () => import("./audit-DVmI2OKa.js").then((module) => module.auditHandlers),
	users: () => import("./users-DldoqbDa.js").then((module) => module.usersHandlers),
	attach: () => import("./attach-CYmJJY_2.js").then((module) => module.attachHandlers),
	channels: () => import("./channels-BQqaELmQ.js").then((module) => module.channelsHandlers),
	"channel-pairing": () => import("./channel-pairing-CWdYe91p.js").then((module) => module.channelPairingHandlers),
	chat: () => import("./chat-DlcBOBZm.js").then((module) => module.chatHandlers),
	"chat-abort": () => import("./chat-abort-handler-YZ6LlL4T.js").then((module) => ({ "chat.abort": module.handleChatAbortRequest })),
	commands: () => import("./commands-B6lPMj61.js").then((module) => module.commandsHandlers),
	config: () => import("./config-CRl5bDj8.js").then((module) => module.configHandlers),
	conversations: () => import("./conversations-Bwe1Yo1k.js").then((module) => module.conversationHandlers),
	connect: () => import("./connect-BP1bn8e4.js").then((module) => module.connectHandlers),
	"control-ui": () => import("./control-ui-QO5ZJby6.js").then((module) => module.controlUiHandlers),
	cron: () => import("./cron-BVJheEkX.js").then((module) => module.cronHandlers),
	devices: () => import("./devices-BFHNNdDO.js").then((module) => module.deviceHandlers),
	"device-pair-setup": () => import("./device-pair-setup-UJ2NbWU3.js").then((module) => module.devicePairSetupHandlers),
	diagnostics: () => import("./diagnostics-BAzQgv2s.js").then((module) => module.diagnosticsHandlers),
	doctor: () => import("./doctor-DCUYnQu6.js").then((module) => module.createDoctorHandlers()),
	environments: () => import("./environments-D83ywt9y.js").then((module) => module.environmentsHandlers),
	worktrees: () => import("./worktrees-DXt9YXp8.js").then((module) => module.worktreesHandlers),
	"exec-approvals": () => import("./exec-approvals-CPWYA-vG.js").then((module) => module.execApprovalsHandlers),
	fs: () => import("./fs-CY0cKwqb.js").then((module) => module.fsHandlers),
	health: () => import("./health-BHAW2sfF.js").then((module) => module.healthHandlers),
	logs: () => import("./logs-DCSZ2QFL.js").then((module) => module.logsHandlers),
	"memory-search": () => import("./memory-search-e1yw9Qhr.js").then((module) => module.memorySearchHandlers),
	terminal: () => import("./terminal-Dvy-L5cd.js").then((module) => module.terminalHandlers),
	"ui-command": () => import("./ui-command-C65mq8ql.js").then((module) => module.uiCommandHandlers),
	"models-auth-status": () => import("./models-auth-status-B8G5g2d2.js").then((module) => module.modelsAuthStatusHandlers),
	models: () => import("./models-KzM-Ta89.js").then((module) => module.modelsHandlers),
	"models-probe": () => import("./models-probe-C-gHvqTn.js").then((module) => module.modelsProbeHandlers),
	"native-hook-relay": () => import("./native-hook-relay-CF3oZ965.js").then((module) => module.nativeHookRelayHandlers),
	"nodes-pending": () => import("./nodes.pending-work-BvXlJ9UT.js").then((module) => module.nodePendingWorkHandlers),
	nodes: () => import("./nodes-Bqss3Rbl.js").then((module) => module.nodeHandlers),
	"plugin-host-hooks": () => import("./plugin-host-hooks-lLvWISXW.js").then((module) => module.pluginHostHookHandlers),
	plugins: () => import("./plugins-CGiVn08u.js").then((module) => module.pluginsHandlers),
	projects: () => import("./projects-Cqt7ocTu.js").then((module) => module.projectsHandlers),
	portals: () => import("./portals-Aq1XcwJl.js").then((module) => module.portalHandlers),
	"progress-card": () => import("./progress-card-CciYmFS8.js").then((module) => module.progressCardHandlers),
	migrations: () => import("./migrations-Bpi0pq2q.js").then((module) => module.migrationsHandlers),
	push: () => import("./push-BjbvQLBZ.js").then((module) => module.pushHandlers),
	restart: () => import("./restart-4i11OkX0.js").then((module) => module.restartHandlers),
	suspend: () => import("./suspend-D3YekccP.js").then((module) => module.suspendHandlers),
	send: () => import("./send-BcPUy9RI.js").then((module) => module.sendHandlers),
	"sessions-files": () => import("./sessions-files-DZfCAWoc.js").then((module) => module.sessionsFilesHandlers),
	"sessions-github": () => import("./sessions-github-w9l-mKjY.js").then((module) => module.sessionsGitHubHandlers),
	"sessions-diff": () => import("./sessions-diff-Dam2p7Hm.js").then((module) => module.sessionsDiffHandlers),
	"sessions-abort": () => import("./sessions-abort-CuCu1w5D.js").then((module) => module.sessionAbortHandlers),
	"sessions-compact": () => import("./sessions-compact-CQag1EjV.js").then((module) => module.sessionCompactHandlers),
	"sessions-compaction-checkpoints": () => import("./sessions-compaction-checkpoints-dzsSVuyJ.js").then((module) => module.sessionCheckpointHandlers),
	"sessions-compaction-queries": () => import("./sessions-compaction-queries-DSPXneXa.js").then((module) => module.sessionCheckpointQueryHandlers),
	"sessions-create": () => import("./sessions-create-CTZErPEU.js").then((module) => module.sessionCreateHandlers),
	"sessions-title": () => import("./sessions-title-Ba2Alsfz.js").then((module) => module.sessionTitleHandlers),
	"sessions-recover": () => import("./sessions-recover-BQzOJdEo.js").then((module) => module.sessionRecoverHandlers),
	"sessions-delete": () => import("./sessions-delete-BaNjwz6S.js").then((module) => module.sessionDeleteHandlers),
	"sessions-dispatch": () => import("./sessions-dispatch-B8YldShr.js").then((module) => module.sessionDispatchHandlers),
	"sessions-groups": () => import("./sessions-groups-Cd_AMnZw.js").then((module) => module.sessionGroupHandlers),
	"sessions-goal": () => import("./sessions-goal-D4Wbns6x.js").then((module) => module.sessionGoalHandlers),
	"sessions-messaging": () => import("./sessions-messaging-BDG9ZO0n.js").then((module) => module.sessionMessagingHandlers),
	"sessions-mutations": () => import("./sessions-mutations-CRuxCgQf.js").then((module) => module.sessionMutationHandlers),
	"sessions-read": () => import("./sessions-read-CBrTqSH3.js").then((module) => module.sessionReadHandlers),
	"sessions-rewind": () => import("./sessions-rewind-Cp7gVVQ3.js").then((module) => module.sessionRewindHandlers),
	"sessions-sharing": () => import("./sessions-sharing-BmdVV2oP.js").then((module) => module.sessionSharingHandlers),
	"sessions-subscriptions": () => import("./sessions-subscriptions-BelsNenW.js").then((module) => module.sessionSubscriptionHandlers),
	"sessions-suggestions": () => import("./sessions-suggestions-3wnuLR_B.js").then((module) => module.sessionSuggestionHandlers),
	"session-catalog": () => import("./session-catalog-lXdbSZqb.js").then((module) => module.sessionCatalogHandlers),
	"session-discussion": () => import("./session-discussion-DFev0Vpf.js").then((module) => module.sessionDiscussionHandlers),
	"session-observer-rpc": () => import("./session-observer-rpc-Cuu2HAz8.js").then((module) => module.sessionObserverHandlers),
	"session-companion-rpc": () => import("./session-companion-rpc-CzCawjHi.js").then((module) => module.sessionCompanionHandlers),
	"hooks-status": () => import("./hooks-status-bJPp0ZT7.js").then((module) => module.hooksStatusHandlers),
	skills: () => import("./skills-COcxxLOZ.js").then((module) => module.skillsHandlers),
	system: () => import("./system-DNSTD3U_.js").then((module) => module.systemHandlers),
	talk: () => import("./talk-DkFuKRod.js").then((module) => module.talkHandlers),
	tasks: () => import("./tasks-DNVtnKlS.js").then((module) => module.tasksHandlers),
	"task-suggestions": () => import("./task-suggestions-Dg76nzVC.js").then((module) => module.taskSuggestionsHandlers),
	"tools-catalog": () => import("./tools-catalog-DGR0f9wo.js").then((module) => module.toolsCatalogHandlers),
	"tools-github": () => import("./tools-github-CzZSy50C.js").then((module) => module.toolsGitHubHandlers),
	"tools-effective": () => import("./tools-effective-RRbraYwZ.js").then((module) => module.toolsEffectiveHandlers),
	"tools-invoke": () => import("./tools-invoke-ev4-EXmh.js").then((module) => module.toolsInvokeHandlers),
	"mcp-app": () => import("./mcp-app-CWiyO_QT.js").then((module) => module.mcpAppHandlers),
	tts: () => import("./tts-ybGoKfj7.js").then((module) => module.ttsHandlers),
	update: () => import("./update-CnF_qlQo.js").then((module) => module.updateHandlers),
	usage: () => import("./usage-CRyzjNwJ.js").then((module) => module.usageHandlers),
	"voicewake-routing": () => import("./voicewake-routing-Do4U7rg2.js").then((module) => module.voicewakeRoutingHandlers),
	voicewake: () => import("./voicewake-Db8wczP7.js").then((module) => module.voicewakeHandlers),
	web: () => import("./web-Dghhexnu.js").then((module) => module.webHandlers),
	"system-agent": () => import("./system-agent-BhnNvC3z.js").then((module) => module.systemAgentHandlers),
	"system-changes": () => import("./system-changes-B69Wr1Gc.js").then((module) => module.systemChangesHandlers),
	wizard: () => import("./wizard-BqWZHgEC.js").then((module) => module.wizardHandlers)
};
function authorizeGatewayMethod(method, client, params, methodRegistry) {
	if (!client?.connect || method === "health") return null;
	const roleRaw = client.connect.role ?? "operator";
	const role = parseGatewayRole(roleRaw);
	if (!role) return errorShape(ErrorCodes.INVALID_REQUEST, `unauthorized role: ${roleRaw}`);
	const scopes = client.connect.scopes ?? [];
	if (!isRoleAuthorizedForMethod(role, method)) return errorShape(ErrorCodes.INVALID_REQUEST, `unauthorized role: ${role}`);
	if (role === "node") return null;
	if (method === "device.scopes.requestUpgrade" || method === "device.scopes.waitUpgrade") return null;
	if (scopes.includes("operator.admin")) return null;
	const registeredScope = methodRegistry.getScope(method);
	const scopeAuth = isOperatorScope(registeredScope) ? authorizeOperatorScopesForRequiredScope(registeredScope, scopes) : authorizeOperatorScopesForMethod(method, scopes, params);
	if (!scopeAuth.allowed) {
		const resolvedRequiredScopes = isOperatorScope(registeredScope) ? [registeredScope] : resolveLeastPrivilegeOperatorScopesForMethod(method, params);
		return missingScopeErrorShape({
			missingScope: scopeAuth.missingScope,
			requiredScopes: resolvedRequiredScopes.length > 0 ? resolvedRequiredScopes : [scopeAuth.missingScope]
		});
	}
	return null;
}
const SUSPEND_CONTROL_METHODS = /* @__PURE__ */ new Set([
	"gateway.suspend.prepare",
	"gateway.suspend.status",
	"gateway.suspend.resume"
]);
function runGatewayPendingWorkContinuation(params) {
	if (!isRecord(params.requestParams)) return null;
	const request = params.requestParams;
	if (params.client?.connect.role === "node") {
		if (getGatewaySuspendAdmissionPhase() !== "draining" && !isGatewayRestartDraining()) return null;
		const invokeId = params.method === "node.invoke.progress" ? request.invokeId : params.method === "node.invoke.result" ? request.id : void 0;
		if (typeof invokeId !== "string" || typeof request.nodeId !== "string") return null;
		return params.context.nodeRegistry.runPendingInvokeContinuation({
			invokeId,
			nodeId: request.nodeId,
			connId: params.client.connId,
			run: params.run
		});
	}
	if (getGatewaySuspendAdmissionPhase() !== "draining" || params.client?.connect.role !== "operator" || typeof request.id !== "string") return null;
	if (params.method === "question.resolve" || params.method === "question.get") return params.context.questionManager?.runPendingContinuation(request.id, params.run) ?? null;
	return (params.method === "exec.approval.resolve" ? params.context.execApprovalManager : params.method === "plugin.approval.resolve" ? params.context.pluginApprovalManager : params.method === "approval.resolve" ? request.kind === "exec" ? params.context.execApprovalManager : request.kind === "plugin" ? params.context.pluginApprovalManager : request.kind === "system-agent" ? params.context.systemAgentApprovalManager : void 0 : void 0)?.runPendingContinuation(request.id, params.run) ?? null;
}
async function authorizeAuthenticatedProfileForMethod(params) {
	const sync = params.client?.authenticatedGitHubIdentitySync;
	if (!sync || params.client?.authenticatedUserProfile?.profileId.trim()) return null;
	if (!(params.methodRegistry.requiresAuthenticatedProfile(params.method) || resolveDirectIncognitoTargets(params.method, params.requestParams).length > 0 || sessionMutationTargetFields(params.method).length > 0 && params.context.getRuntimeConfig().gateway?.roles !== void 0)) return null;
	try {
		await sync();
	} catch {
		return authenticatedProfileUnavailableError();
	}
	return params.client?.authenticatedUserProfile?.profileId.trim() ? null : authenticatedProfileUnavailableError();
}
const coreGatewayHandlerMethodNames = listCoreGatewayHandlerMethodNames();
const coreGatewayHandlerModules = Object.entries(CORE_GATEWAY_HANDLER_MODULES);
const coreGatewayHandlers = Object.fromEntries(coreGatewayHandlerModules.flatMap(([family, loadModule]) => Object.entries(createLazyCoreHandlers({
	methods: coreGatewayHandlerMethodNames.get(family) ?? [],
	loadHandlers: lazyHandlerModule(loadModule, (handlers) => handlers)
}))));
/** Builds the per-request method registry from core, plugin, and explicit extra handlers. */
function createRequestGatewayMethodRegistry(extraHandlers) {
	const gatewayPluginRegistry = getActivePluginHttpRouteRegistry();
	const gatewayPluginHandlers = gatewayPluginRegistry?.gatewayHandlers ?? {};
	const extraHandlerEntries = Object.entries(extraHandlers ?? {});
	const pluginMethodNames = new Set(Object.keys(gatewayPluginHandlers));
	const coreDescriptorHandlers = { ...coreGatewayHandlers };
	for (const [method, extraHandler] of extraHandlerEntries) if (!pluginMethodNames.has(method) && isCoreGatewayMethodClassified(method)) coreDescriptorHandlers[method] = extraHandler;
	const coreDescriptors = createCoreGatewayMethodDescriptors(coreDescriptorHandlers);
	for (const descriptor of coreDescriptors) {
		const extraHandler = extraHandlers?.[descriptor.name];
		if (extraHandler && !pluginMethodNames.has(descriptor.name)) descriptor.handler = extraHandler;
	}
	const coreMethodNames = new Set(coreDescriptors.map((descriptor) => descriptor.name));
	const auxHandlers = Object.fromEntries(extraHandlerEntries.filter(([method]) => !pluginMethodNames.has(method) && !coreMethodNames.has(method)));
	return createGatewayMethodRegistry([
		...coreDescriptors,
		...gatewayPluginRegistry ? createPluginGatewayMethodDescriptors(gatewayPluginRegistry) : [],
		...createGatewayMethodDescriptorsFromHandlers({
			handlers: auxHandlers,
			owner: {
				kind: "aux",
				area: "gateway-extra"
			},
			defaultScope: ADMIN_SCOPE
		})
	], gatewayPluginRegistry ?? void 0);
}
/** Applies the router-owned authorization fence before any transport or typed dispatch. */
async function authorizeGatewayRequestPreDispatch(params) {
	const authError = authorizeGatewayMethod(params.method, params.client, params.requestParams, params.methodRegistry);
	if (authError) return { error: authError };
	const profileError = await authorizeAuthenticatedProfileForMethod(params);
	if (profileError) return { error: profileError };
	if (params.context.unavailableGatewayMethods?.has(params.method)) return { error: errorShape(ErrorCodes.UNAVAILABLE, `${params.method} unavailable during gateway startup`, {
		retryable: true,
		retryAfterMs: 500,
		details: {
			...gatewayStartupUnavailableDetails(),
			method: params.method
		}
	}) };
	const sessionMutation = resolveSessionMutationAuthorization({
		client: params.client ?? null,
		method: params.method,
		requestParams: params.requestParams,
		context: params.context
	});
	if (sessionMutation.error) return { error: sessionMutation.error };
	if (params.client?.connect.role === "node" && (!params.client.connId || !await params.context.nodeRegistry.isConnectionCurrentPairingState(params.client.connId))) return { error: errorShape(ErrorCodes.UNAVAILABLE, "node pairing changed before request dispatch", {
		retryable: true,
		details: { code: "PAIRING_CHANGED" }
	}) };
	return {
		error: null,
		...sessionMutation.authorization ? { sessionMutationAuthorization: sessionMutation.authorization } : {}
	};
}
/** Runs admitted Gateway work inside the shared root and plugin request scopes. */
async function runWithGatewayRequestEnvelope(method, client, fn, options) {
	const rejectRateLimitedControlPlaneWrite = () => {
		if (!options.methodRegistry.isControlPlaneWrite(method)) return;
		const budget = consumeControlPlaneWriteBudget({
			client,
			method
		});
		if (budget.allowed) return;
		const actor = resolveControlPlaneActor(client);
		options.context.logGateway.warn(`control-plane write rate-limited method=${method} ${formatControlPlaneActor(actor)} retryAfterMs=${budget.retryAfterMs} key=${budget.key}`);
		return errorShape(ErrorCodes.UNAVAILABLE, `rate limit exceeded for ${method}; retry after ${Math.ceil(budget.retryAfterMs / 1e3)}s`, {
			retryable: true,
			retryAfterMs: budget.retryAfterMs,
			details: {
				method,
				limit: `30 per ${CONTROL_PLANE_RATE_LIMIT_WINDOW_MS / 1e3}s`
			}
		});
	};
	const isSuspendPrepare = method === "gateway.suspend.prepare";
	const preAdmissionRateLimitError = isSuspendPrepare ? rejectRateLimitedControlPlaneWrite() : void 0;
	if (preAdmissionRateLimitError) return await options.reject(preAdmissionRateLimitError);
	const rootWorkAdmission = tryBeginGatewayRootWorkAdmission(`ws:${method}`) ?? (method === "gateway.restart.request" && isTargetedNonSafeGatewayRestartRequest(options.requestParams) ? tryBeginGatewayPreparedRestartRootWorkAdmission() : null);
	if (!rootWorkAdmission) {
		const continuation = runGatewayPendingWorkContinuation({
			method,
			client,
			requestParams: options.requestParams,
			context: options.context,
			run: invokeWithRequestScope
		});
		if (continuation) return await continuation;
	}
	if (isSuspendPrepare && rootWorkAdmission && !rootWorkAdmission.ownsRoot) return await options.reject(errorShape(ErrorCodes.UNAVAILABLE, "gateway suspension cannot begin from a nested request", {
		retryable: true,
		retryAfterMs: 1e3,
		details: {
			method,
			reason: "nested-gateway-request"
		}
	}));
	if (!rootWorkAdmission && !SUSPEND_CONTROL_METHODS.has(method)) {
		const restartDraining = isGatewayRestartDraining();
		return await options.reject(errorShape(ErrorCodes.UNAVAILABLE, `${method} unavailable during gateway ${restartDraining ? "restart" : "suspension"}`, {
			retryable: true,
			retryAfterMs: 1e3,
			details: {
				method,
				reason: restartDraining ? GATEWAY_RESTART_UNAVAILABLE_REASON : GATEWAY_SUSPEND_UNAVAILABLE_REASON,
				phase: getGatewaySuspendAdmissionPhase()
			}
		}));
	}
	async function invokeWithRequestScope() {
		const postAdmissionRateLimitError = isSuspendPrepare ? void 0 : rejectRateLimitedControlPlaneWrite();
		if (postAdmissionRateLimitError) return await options.reject(postAdmissionRateLimitError);
		try {
			const pluginRegistry = options.methodRegistry.pluginRegistry ?? getPluginRuntimeGatewayRequestScope()?.pluginRegistry ?? getActivePluginRegistry() ?? void 0;
			return await withPluginRuntimeGatewayRequestScope({
				context: options.context,
				resolveGatewayContext: options.context.resolveGatewayContext,
				client,
				isWebchatConnect: options.isWebchatConnect,
				...client?.internal?.nodeInvokeStream ? getPluginRuntimeGatewayNodeAuthorities() : {},
				...pluginRegistry ? { pluginRegistry } : {}
			}, fn);
		} catch (error) {
			if (error instanceof SessionMutationAuthorizationChangedError) return await options.reject(error.error);
			const staleInstall = classifyGatewayStaleInstall(error);
			if (staleInstall) return await options.reject(staleInstall.error);
			throw error;
		}
	}
	if (!rootWorkAdmission) return await invokeWithRequestScope();
	try {
		return await rootWorkAdmission.run(invokeWithRequestScope);
	} finally {
		rootWorkAdmission.release();
	}
}
/** Authorizes and dispatches one gateway JSON-RPC-style request. */
async function handleGatewayRequest(opts) {
  try {
    opts = await vPrepareVoiceActor(opts);
    if (!opts) return;
  } catch (error) {
    opts.respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "Feishu voice identity or conversation was not authorized",
      error?.code === "FEISHU_CONVERSATION_MEMBERSHIP_REQUIRED" ? {details:{reason:"conversation_membership_required"}} : undefined));
    return;
  }
	const { req, respond, client, isWebchatConnect, context, signal } = opts;
	const methodRegistry = opts.methodRegistry?.getHandler(req.method) !== void 0 ? opts.methodRegistry : createRequestGatewayMethodRegistry(opts.extraHandlers);
	const authorization = await authorizeGatewayRequestPreDispatch({
		method: req.method,
		requestParams: req.params,
		client,
		context,
		methodRegistry
	});
	if (authorization.error) {
		respond(false, void 0, authorization.error);
		return;
	}
	const handler = methodRegistry.getHandler(req.method);
	if (!handler) {
		respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, `unknown method: ${req.method}`));
		return;
	}
	const invokeHandler = () => handler({
		req,
		params: req.params ?? {},
		client,
		isWebchatConnect,
		respond,
		context,
		...signal ? { signal } : {},
		...opts.sessionMutationCommitGuard ? { sessionMutationCommitGuard: opts.sessionMutationCommitGuard } : {},
		...authorization.sessionMutationAuthorization ? { sessionMutationAuthorization: authorization.sessionMutationAuthorization } : {}
	});
	await runWithGatewayRequestEnvelope(req.method, client, invokeHandler, {
		context,
		isWebchatConnect,
		methodRegistry,
		requestParams: req.params,
		reject: (error) => respond(false, void 0, error)
	});
}
//#endregion
export { runWithGatewayRequestEnvelope as a, handleGatewayRequest as i, coreGatewayHandlers as n, createRequestGatewayMethodRegistry as r, authorizeGatewayRequestPreDispatch as t };
