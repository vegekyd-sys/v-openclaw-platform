import { y as uniqueStrings } from "./string-normalization-DiSb4JeN.js";
import { i as allowsProcessHomeSessionScan } from "./paths-Dx1CjxA5.js";
import { i as parseModelCatalogRef } from "./model-catalog-refs-BdjEHOKQ.js";
import { c as stripSelfProviderModelPrefix, n as normalizeBuiltInProviderModelId } from "./provider-model-id-normalization-BFjPahr6.js";
import { r as getPluginModuleLoaderStats } from "./plugin-module-loader-cache-C4l9L2gm.js";
import { d as extractPluginInstallRecordsFromInstalledPluginIndex } from "./installed-plugin-index-DzUab7zi.js";
import { l as normalizePluginsConfig } from "./config-state-B-P4NhQV.js";
import { t as createDeferredCore } from "./deferred-D0La5CRk.js";
import { n as getCurrentPluginMetadataSnapshot } from "./current-plugin-metadata-snapshot-BqMIdsHK.js";
import { s as normalizeModelRef } from "./model-ref-shared-Dz7QU0Lx.js";
import { n as parseModelRef } from "./model-selection-normalize-D1HuPOqZ.js";
import { t as ADMIN_SCOPE, u as normalizeOperatorScopeList } from "./operator-scopes-Dw7Gu2cA.js";
import { i as NODE_DUPLEX_INVOKE_IDLE_TIMEOUT_MS } from "./node-commands-BC8PhxqU.js";
import { d as getActivePluginRegistry } from "./runtime-MupoouIC.js";
import { t as createEmptyPluginRegistry } from "./registry-empty-55wlVNzO.js";
import { a as getPluginRuntimeGatewayRequestScope, s as withPluginRuntimeGatewayContextResolver, t as bindGatewayContextResolver } from "./gateway-request-scope-CmMd3nUp.js";
import { r as authorizeOperatorScopesForRequiredScope } from "./method-scopes-C3BvHJ95.js";
import { t as applyPluginAutoEnable } from "./plugin-auto-enable-CKnydTHu.js";
import { u as resolvePluginSubagentCompletionRequester } from "./hook-runner-global-DLqoAE5f.js";
import { t as loadAndActivateRootPluginRegistry } from "./loader-UHuBXZwI.js";
import { t as activatePluginRegistry } from "./loader-shared-DZbJ6qPD.js";
import { a as setPluginRuntimeLoadContext, r as createPluginRuntimeLoaderLogger, t as buildPluginRuntimeLoadOptions } from "./load-context-Ck0KAI4Z.js";
import { r as getInProcessGatewayRequestContext, t as dispatchGatewayMethodInProcess } from "./server-plugin-in-process-dispatch-BirRDL7L.js";
import { t as loadPluginLookUpTable } from "./plugin-lookup-table-CMtfXf_a.js";
import { r as resolvePluginSubagentToolsAlsoAllow } from "./server-plugin-runtime-client-CXu_O7BH.js";
import { t as createNodeDuplexEndpoint } from "./node-duplex-framing-SEDM1SDZ.js";
import { l as resolveNodeCommandAllowlist, o as isNodeCommandAllowed } from "./node-command-policy-DjkgEl_k.js";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
//#region src/gateway/server-plugin-subagent-runtime.ts
function normalizePluginSubagentAllowedModelRef(raw) {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	if (trimmed === "*") return "*";
	const parsed = parseModelCatalogRef(trimmed);
	if (!parsed) return null;
	const modelId = normalizeBuiltInProviderModelId(parsed.provider, stripSelfProviderModelPrefix(parsed.provider, parsed.modelId));
	return `${parsed.provider}/${modelId}`;
}
function resolvePluginSubagentRequestedModelRef(params) {
	if (params.provider && params.model) {
		const normalizedRequest = normalizeModelRef(params.provider, params.model);
		return `${normalizedRequest.provider}/${normalizedRequest.model}`;
	}
	const rawModel = params.model?.trim();
	if (!rawModel || !rawModel.includes("/")) return null;
	const parsed = parseModelRef(rawModel, "");
	if (!parsed?.provider || !parsed.model) return null;
	return `${parsed.provider}/${parsed.model}`;
}
function normalizePluginSubagentRunRuntime(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return;
	const record = value;
	const harness = typeof record.harness === "string" ? record.harness.trim() : "";
	const provider = typeof record.provider === "string" ? record.provider.trim() : "";
	const model = typeof record.model === "string" ? record.model.trim() : "";
	return harness && provider && model ? {
		harness,
		provider,
		model
	} : void 0;
}
//#endregion
//#region src/gateway/server-plugins-node-runtime.ts
function hasInProcessGatewayContext(resolveGatewayContext) {
	return Boolean(getInProcessGatewayRequestContext(resolveGatewayContext));
}
/** Opens one lifecycle-fenced binary channel through the canonical node invocation owner. */
async function openGatewayNodeDuplex(options) {
	const { params, resolveGatewayContext, runtimeLifetime, invokeNode } = options;
	const scope = getPluginRuntimeGatewayRequestScope();
	if (!scope?.pluginId?.trim()) throw new Error("Plugin node duplex commands require an active owning plugin identity.");
	const registrations = scope.pluginRegistry?.nodeHostCommands.filter((entry) => entry.command.command === params.command);
	if (registrations?.length !== 1 || registrations[0]?.pluginId !== scope.pluginId || registrations[0]?.command.duplex !== true) throw new Error(`Node command "${params.command}" must be registered exactly once by plugin "${scope.pluginId}" and declare duplex: true.`);
	const callerIdentity = scope.client?.internal?.agentRuntimeIdentity;
	const context = getInProcessGatewayRequestContext(resolveGatewayContext);
	if (!context?.nodeRegistry) throw new Error("Plugin node duplex commands require an active Gateway node registry.");
	const controller = new AbortController();
	const signals = [
		controller.signal,
		runtimeLifetime,
		params.signal
	].filter((candidate) => candidate !== void 0);
	const signal = AbortSignal.any(signals);
	const abortError = () => signal.reason instanceof Error ? signal.reason : /* @__PURE__ */ new Error("Node duplex invocation cancelled.");
	if (signal.aborted) throw abortError();
	let invokeId;
	let framedReady = false;
	const ready = createDeferredCore();
	const isRuntimeCurrent = () => !signal.aborted && (!resolveGatewayContext || resolveGatewayContext() === context) && (!callerIdentity || context.validateAgentRuntimeApprovalAuthority?.(callerIdentity) === true);
	const assertRuntimeCurrent = () => {
		if (!isRuntimeCurrent()) {
			const error = signal.aborted ? abortError() : /* @__PURE__ */ new Error("Plugin Gateway runtime authority is no longer current.");
			controller.abort(error);
			throw error;
		}
	};
	const endpoint = createNodeDuplexEndpoint({
		requireReady: true,
		maxMessageBytes: params.maxMessageBytes,
		maxOutstandingDeliveryBytes: params.maxOutstandingDeliveryBytes,
		sendFrame(frame) {
			assertRuntimeCurrent();
			if (!invokeId || !framedReady) throw new Error("Node duplex command is not ready for binary messages.");
			context.nodeRegistry.sendInvokeInput(invokeId, JSON.parse(frame));
		},
		onReady() {
			if (!invokeId) throw new Error("Node duplex command announced readiness before its dispatch.");
			framedReady = true;
			ready.resolve();
		},
		onError: (error) => controller.abort(error)
	});
	const onAbort = () => endpoint.close();
	signal.addEventListener("abort", onAbort, { once: true });
	const closed = invokeNode(params, {
		onProgress: (chunk) => {
			assertRuntimeCurrent();
			endpoint.receive(chunk);
		},
		onDispatchReady: (id) => {
			assertRuntimeCurrent();
			invokeId = id;
		},
		isRuntimeCurrent,
		idleTimeoutMs: NODE_DUPLEX_INVOKE_IDLE_TIMEOUT_MS
	}, signal).then(async (result) => {
		if (!invokeId || !framedReady) throw new Error("Node command completed without opening a ready duplex invocation.");
		await endpoint.drain();
		return result;
	}).finally(() => {
		signal.removeEventListener("abort", onAbort);
		endpoint.close();
		controller.abort(/* @__PURE__ */ new Error("Node duplex command has closed."));
	});
	closed.catch(ready.reject);
	await ready.promise;
	return {
		send: (message) => endpoint.send(message),
		onMessage: (listener) => {
			assertRuntimeCurrent();
			return endpoint.onMessage(listener);
		},
		closed,
		close: () => controller.abort(/* @__PURE__ */ new Error("Node duplex channel closed by its caller."))
	};
}
function projectGatewayRuntimeNodes(nodes, context) {
	return nodes.map((node) => {
		if (!node || typeof node !== "object" || Array.isArray(node) || !context?.nodeRegistry?.get || !context.getRuntimeConfig) return node;
		const nodeRecord = node;
		const nodeId = typeof nodeRecord.nodeId === "string" ? nodeRecord.nodeId : "";
		const liveNode = nodeId ? context.nodeRegistry.get(nodeId) : void 0;
		if (!liveNode) return node;
		const allowlist = resolveNodeCommandAllowlist(context.getRuntimeConfig(), {
			...liveNode,
			approvedCommands: liveNode.commands
		});
		const invocableCommands = liveNode.commands.filter((command) => isNodeCommandAllowed({
			command,
			declaredCommands: liveNode.commands,
			allowlist
		}).ok);
		return Object.assign({}, nodeRecord, { invocableCommands });
	});
}
function createGatewayHooksRuntime(resolveGatewayContext) {
	return { dispatchHookAgentTurn: async (params) => {
		const pluginId = getPluginRuntimeGatewayRequestScope()?.pluginId;
		const gatewayContext = resolveGatewayContext?.();
		if (!pluginId || !gatewayContext?.dispatchHookAgentTurn) throw new Error("Plugin hook runtime requires an active Gateway and plugin identity.");
		return await gatewayContext.dispatchHookAgentTurn(pluginId, params);
	} };
}
//#endregion
//#region src/gateway/server-plugins.ts
function resolvePluginSubagentOverridePolicies(cfg) {
	const normalized = normalizePluginsConfig(cfg.plugins);
	const policies = {};
	for (const [pluginId, entry] of Object.entries(normalized.entries)) {
		const allowModelOverride = entry.subagent?.allowModelOverride === true;
		const hasConfiguredAllowlist = entry.subagent?.hasAllowedModelsConfig === true;
		const configuredAllowedModels = entry.subagent?.allowedModels ?? [];
		const allowedModels = /* @__PURE__ */ new Set();
		let allowAnyModel = false;
		for (const modelRef of configuredAllowedModels) {
			const normalizedModelRef = normalizePluginSubagentAllowedModelRef(modelRef);
			if (!normalizedModelRef) continue;
			if (normalizedModelRef === "*") {
				allowAnyModel = true;
				continue;
			}
			allowedModels.add(normalizedModelRef);
		}
		if (!allowModelOverride && !hasConfiguredAllowlist && allowedModels.size === 0 && !allowAnyModel) continue;
		policies[pluginId] = {
			allowModelOverride,
			allowAnyModel,
			hasConfiguredAllowlist,
			allowedModels
		};
	}
	return policies;
}
function authorizeFallbackModelOverride(params) {
	const pluginId = params.pluginId?.trim();
	if (!pluginId) return {
		allowed: false,
		reason: "provider/model override requires plugin identity in fallback subagent runs."
	};
	const policy = params.policies[pluginId];
	if (!policy?.allowModelOverride) return {
		allowed: false,
		reason: `plugin "${pluginId}" is not trusted for fallback provider/model override requests. See https://docs.openclaw.ai/plugins/sdk-runtime#api-runtime-subagent and search for: plugins.entries.<id>.subagent.allowModelOverride`
	};
	if (policy.allowAnyModel) return { allowed: true };
	if (policy.hasConfiguredAllowlist && policy.allowedModels.size === 0) return {
		allowed: false,
		reason: `plugin "${pluginId}" configured subagent.allowedModels, but none of the entries normalized to a valid provider/model target.`
	};
	if (policy.allowedModels.size === 0) return { allowed: true };
	const requestedModelRef = resolvePluginSubagentRequestedModelRef(params);
	if (!requestedModelRef) return {
		allowed: false,
		reason: "fallback provider/model overrides that use an allowlist must resolve to a canonical provider/model target."
	};
	if (policy.allowedModels.has(requestedModelRef)) return { allowed: true };
	return {
		allowed: false,
		reason: `model override "${requestedModelRef}" is not allowlisted for plugin "${pluginId}".`
	};
}
function hasAdminScope(client) {
	return (Array.isArray(client?.connect?.scopes) ? client.connect.scopes : []).includes(ADMIN_SCOPE);
}
function canClientUseModelOverride(client) {
	return hasAdminScope(client) || client?.internal?.allowModelOverride === true;
}
function canTrustedOfficialPluginRequestScopes(params) {
	if (!params.pluginId) return false;
	if (params.pluginOrigin === "bundled" || params.pluginTrustedOfficialInstall === true) return true;
	const record = getActivePluginRegistry()?.plugins.find((entry) => entry.id === params.pluginId);
	return record?.origin === "bundled" || record?.trustedOfficialInstall === true;
}
function resolveRuntimeNodeInvokeSyntheticScopes(params) {
	return canTrustedOfficialPluginRequestScopes(params) ? params.requestedScopes : void 0;
}
async function dispatchTrustedPluginGatewayMethod(method, params = {}, options, resolveGatewayContext) {
	const scope = getPluginRuntimeGatewayRequestScope();
	const pluginId = scope?.pluginId?.trim();
	if (!canTrustedOfficialPluginRequestScopes(scope ?? {})) throw new Error("Gateway requests are only available to bundled or trusted official plugins.");
	const syntheticScopes = normalizeOperatorScopeList(options?.scopes);
	return await dispatchGatewayMethodInProcess(method, params, {
		forceSyntheticClient: true,
		pluginRuntimeOwnerId: pluginId,
		resolveGatewayContext,
		...!scope?.client ? { operatorRoleActor: { kind: "system" } } : {},
		...syntheticScopes ? { syntheticScopes } : {},
		...options?.timeoutMs !== void 0 ? { timeoutMs: options.timeoutMs } : {}
	});
}
const PLUGIN_SUBAGENT_SESSION_MESSAGES_MAX_LIMIT = 1e3;
function createGatewaySubagentRuntime(resolveGatewayContext, overridePolicies = {}) {
	const getSessionMessages = async (params) => {
		const scope = getPluginRuntimeGatewayRequestScope();
		const limit = params.limit == null || !Number.isFinite(params.limit) ? void 0 : Math.min(PLUGIN_SUBAGENT_SESSION_MESSAGES_MAX_LIMIT, Math.max(1, Math.floor(params.limit)));
		const payload = await dispatchGatewayMethodInProcess("sessions.get", {
			key: params.sessionKey,
			...limit != null && { limit }
		}, {
			resolveGatewayContext,
			...!scope?.client && canTrustedOfficialPluginRequestScopes(scope ?? {}) ? { operatorRoleActor: { kind: "system" } } : {}
		});
		return { messages: Array.isArray(payload?.messages) ? payload.messages : [] };
	};
	const subagentRuntime = {
		async run(params) {
			if (params.disableTools === true && (params.toolsAlsoAllow?.length ?? 0) > 0) throw new Error("Tool-free plugin subagent runs cannot request additive tools.");
			const pluginSubagentRequester = resolvePluginSubagentCompletionRequester(params.completionDelivery);
			const scope = getPluginRuntimeGatewayRequestScope();
			const pluginId = typeof scope?.pluginId === "string" && scope.pluginId.trim() ? scope.pluginId.trim() : void 0;
			const runtimePluginToolGrant = resolvePluginSubagentToolsAlsoAllow({
				pluginId,
				toolsAlsoAllow: params.toolsAlsoAllow
			});
			const overrideRequested = Boolean(params.provider || params.model);
			const hasRequestScopeClient = Boolean(scope?.client);
			let allowOverride = hasRequestScopeClient && canClientUseModelOverride(scope?.client ?? null);
			let allowSyntheticModelOverride = false;
			if (overrideRequested && !allowOverride && !hasRequestScopeClient) {
				const fallbackAuth = authorizeFallbackModelOverride({
					policies: overridePolicies,
					pluginId: scope?.pluginId,
					provider: params.provider,
					model: params.model
				});
				if (!fallbackAuth.allowed) throw new Error(fallbackAuth.reason);
				allowOverride = true;
				allowSyntheticModelOverride = true;
			}
			if (overrideRequested && !allowOverride) throw new Error("provider/model override is not authorized for this plugin subagent run.");
			const payload = await dispatchGatewayMethodInProcess("agent", {
				sessionKey: params.sessionKey,
				message: params.message,
				deliver: params.deliver ?? false,
				...allowOverride && params.provider && { provider: params.provider },
				...allowOverride && params.model && { model: params.model },
				...params.extraSystemPrompt && { extraSystemPrompt: params.extraSystemPrompt },
				...params.promptMode === "minimal" && { promptMode: params.promptMode },
				...params.lane && { lane: params.lane },
				...params.cwd && { cwd: params.cwd },
				...params.lightContext === true && { bootstrapContextMode: "lightweight" },
				idempotencyKey: params.idempotencyKey || randomUUID()
			}, {
				allowSyntheticModelOverride,
				agentRunTracking: "plugin_subagent",
				...!scope?.client ? { operatorRoleActor: { kind: "system" } } : {},
				...pluginId ? { pluginRuntimeOwnerId: pluginId } : {},
				...pluginSubagentRequester ? { pluginSubagentRequester } : {},
				...runtimePluginToolGrant ? { runtimePluginToolGrant } : {},
				...params.disableTools === true ? { pluginSubagentToolsAllow: [] } : {},
				resolveGatewayContext
			});
			const runId = payload?.runId;
			if (typeof runId !== "string" || !runId) throw new Error("Gateway agent method returned an invalid runId.");
			const sessionKey = payload?.sessionKey?.trim() || params.sessionKey;
			const runtime = normalizePluginSubagentRunRuntime(payload?.runtime);
			return {
				runId,
				sessionKey,
				...runtime ? { runtime } : {}
			};
		},
		async waitForRun(params) {
			const { status: rawStatus, error, ...metadata } = await dispatchGatewayMethodInProcess("agent.wait", {
				runId: params.runId,
				...params.timeoutMs != null && { timeoutMs: params.timeoutMs }
			}, { resolveGatewayContext });
			let status = rawStatus;
			if (status === "completed" || status === "succeeded") status = "ok";
			else if (status === "error" && error?.trim().toLowerCase() === "completed") status = "ok";
			if (status !== "ok" && status !== "error" && status !== "timeout" && status !== "pending") throw new Error(`Gateway agent.wait returned unexpected status: ${rawStatus}`);
			return {
				...metadata,
				status,
				...status !== "ok" && error ? { error } : {}
			};
		},
		getSessionMessages,
		async deleteSession(params) {
			const scope = getPluginRuntimeGatewayRequestScope();
			const pluginId = typeof scope?.pluginId === "string" && scope.pluginId.trim() ? scope.pluginId.trim() : void 0;
			const pluginOwnedCleanupOptions = pluginId ? {
				pluginRuntimeOwnerId: pluginId,
				...!hasAdminScope(scope?.client) ? {
					forceSyntheticClient: true,
					syntheticScopes: [ADMIN_SCOPE]
				} : {}
			} : void 0;
			await dispatchGatewayMethodInProcess("sessions.delete", {
				key: params.sessionKey,
				deleteTranscript: params.deleteTranscript ?? true
			}, {
				...pluginOwnedCleanupOptions,
				resolveGatewayContext,
				...!scope?.client && canTrustedOfficialPluginRequestScopes(scope ?? {}) ? { operatorRoleActor: { kind: "system" } } : {}
			});
		}
	};
	if (resolveGatewayContext) bindGatewayContextResolver(subagentRuntime, resolveGatewayContext);
	return subagentRuntime;
}
function createGatewayNodesRuntime(resolveGatewayContext, runtimeLifetime) {
	const invokeNode = async (params, stream, signal = params.signal) => {
		const scope = getPluginRuntimeGatewayRequestScope();
		const pluginId = scope?.pluginId?.trim() || void 0;
		const requestedScopes = resolveRuntimeNodeInvokeSyntheticScopes({
			pluginId,
			pluginOrigin: scope?.pluginOrigin,
			pluginTrustedOfficialInstall: scope?.pluginTrustedOfficialInstall,
			requestedScopes: normalizeOperatorScopeList(params.scopes)
		});
		const callerScopes = stream && scope?.client ? normalizeOperatorScopeList(scope.client.connect.scopes) ?? [] : void 0;
		if (callerScopes && requestedScopes?.some((requestedScope) => !authorizeOperatorScopesForRequiredScope(requestedScope, callerScopes).allowed)) throw new Error("Requested node scopes exceed the authenticated Gateway caller's authority.");
		const syntheticScopes = requestedScopes ?? callerScopes;
		return dispatchGatewayMethodInProcess("node.invoke", {
			nodeId: params.nodeId,
			command: params.command,
			...params.params !== void 0 && { params: params.params },
			timeoutMs: params.timeoutMs,
			idempotencyKey: params.idempotencyKey || randomUUID(),
			...params.sessionKey ? { sessionKey: params.sessionKey } : {}
		}, {
			...pluginId ? { pluginRuntimeOwnerId: pluginId } : {},
			nodeInvokeApprovalSessionKey: params.sessionKey,
			...syntheticScopes ? { syntheticScopes } : {},
			...stream || syntheticScopes ? { forceSyntheticClient: true } : {},
			...stream ? { nodeInvokeStream: stream } : {},
			...signal ? { signal } : {},
			resolveGatewayContext
		});
	};
	return {
		async list(params) {
			const context = getInProcessGatewayRequestContext(resolveGatewayContext);
			const payload = await dispatchGatewayMethodInProcess("node.list", {}, { resolveGatewayContext: () => context });
			const nodes = Array.isArray(payload?.nodes) ? payload.nodes : [];
			return { nodes: projectGatewayRuntimeNodes(params?.connected === true ? nodes.filter((node) => typeof node === "object" && node?.connected === true) : nodes, context) };
		},
		invoke: invokeNode,
		openDuplex: (params) => openGatewayNodeDuplex({
			params,
			invokeNode,
			resolveGatewayContext,
			runtimeLifetime
		})
	};
}
function createGatewayPluginRuntimeBindings(resolveGatewayContext, overridePolicies) {
	let active = true;
	const lifetime = new AbortController();
	const resolveBoundGatewayContext = resolveGatewayContext ? () => active ? resolveGatewayContext() : void 0 : void 0;
	return {
		retire: () => {
			lifetime.abort(/* @__PURE__ */ new Error("Plugin Gateway runtime retired; duplex invocation cancelled."));
			active = false;
		},
		runtime: {
			dispatchReplyFromConfig: async (params) => {
				const { dispatchLowLevelChannelReplyFromConfig } = await import("./dispatch-from-config-DbkBOOpk.js");
				const sessionWorkerPlacementContext = getInProcessGatewayRequestContext(resolveBoundGatewayContext);
				const run = async () => await dispatchLowLevelChannelReplyFromConfig({
					...params,
					...sessionWorkerPlacementContext ? { sessionWorkerPlacementContext } : {}
				});
				return resolveBoundGatewayContext ? await withPluginRuntimeGatewayContextResolver(resolveBoundGatewayContext, run) : await run();
			},
			gateway: {
				isAvailable: async () => hasInProcessGatewayContext(resolveBoundGatewayContext),
				request: (method, params, options) => dispatchTrustedPluginGatewayMethod(method, params, options, resolveBoundGatewayContext)
			},
			hooks: createGatewayHooksRuntime(resolveBoundGatewayContext),
			nodes: createGatewayNodesRuntime(resolveBoundGatewayContext, lifetime.signal),
			subagent: createGatewaySubagentRuntime(resolveBoundGatewayContext, overridePolicies)
		}
	};
}
function createGatewayPluginRegistrationLogger(params) {
	const logger = createPluginRuntimeLoaderLogger();
	if (params?.suppressInfoLogs !== true) return logger;
	return {
		...logger,
		info: (_message) => void 0
	};
}
function loadGatewayPlugins(params) {
	const started = performance.now();
	const allowProcessHomeSessionCatalogs = allowsProcessHomeSessionScan();
	const activationAutoEnabled = params.activationSourceConfig !== void 0 && params.autoEnabledReasons === void 0 ? applyPluginAutoEnable({
		config: params.activationSourceConfig,
		env: process.env,
		...params.pluginLookUpTable?.manifestRegistry ? { manifestRegistry: params.pluginLookUpTable.manifestRegistry } : {},
		discovery: params.pluginLookUpTable?.discovery,
		ambientEnvTriggers: params.ambientEnvTriggers
	}) : void 0;
	const autoEnableMs = performance.now() - started;
	const autoEnabled = params.activationSourceConfig !== void 0 || params.autoEnabledReasons !== void 0 ? {
		config: params.cfg,
		autoEnabledReasons: params.autoEnabledReasons ?? activationAutoEnabled?.autoEnabledReasons ?? {}
	} : applyPluginAutoEnable({
		config: params.cfg,
		env: process.env,
		manifestRegistry: params.pluginLookUpTable?.manifestRegistry,
		discovery: params.pluginLookUpTable?.discovery,
		ambientEnvTriggers: params.ambientEnvTriggers
	});
	const resolvedConfigMs = performance.now() - started;
	const resolvedConfig = autoEnabled.config;
	const pluginIds = params.pluginIds ?? [...(params.pluginLookUpTable ?? loadPluginLookUpTable({
		config: resolvedConfig,
		activationSourceConfig: params.activationSourceConfig,
		workspaceDir: params.workspaceDir,
		env: process.env,
		ambientEnvTriggers: params.ambientEnvTriggers
	})).startup.pluginIds];
	const pluginIdsMs = performance.now() - started;
	const metadataSnapshot = params.pluginMetadataSnapshot ?? getCurrentPluginMetadataSnapshot({
		config: params.cfg,
		workspaceDir: params.workspaceDir
	});
	const loaderMetadata = metadataSnapshot ?? params.pluginLookUpTable;
	const loadContext = {
		rawConfig: params.cfg,
		config: resolvedConfig,
		activationSourceConfig: params.activationSourceConfig ?? params.cfg,
		autoEnabledReasons: autoEnabled.autoEnabledReasons,
		workspaceDir: params.workspaceDir,
		env: process.env,
		logger: createGatewayPluginRegistrationLogger({ suppressInfoLogs: params.suppressPluginInfoLogs }),
		preferBuiltPluginArtifacts: true,
		metadataSnapshot,
		...loaderMetadata ? {
			manifestRegistry: loaderMetadata.manifestRegistry,
			installRecords: extractPluginInstallRecordsFromInstalledPluginIndex(loaderMetadata.index)
		} : {}
	};
	if (pluginIds.length === 0) {
		const pluginRegistry = createEmptyPluginRegistry();
		setPluginRuntimeLoadContext(pluginRegistry, loadContext);
		activatePluginRegistry(pluginRegistry, null, "gateway-bindable", params.workspaceDir);
		params.startupTrace?.detail("plugins.gateway-load", [
			["autoEnableMs", autoEnableMs],
			["resolvedConfigMs", resolvedConfigMs],
			["pluginIdsMs", pluginIdsMs],
			["loadMs", 0],
			["pluginIds", "0"],
			["pluginCount", 0],
			["gatewayHandlerCount", 0]
		]);
		return {
			pluginRegistry,
			gatewayMethods: [...params.baseMethods],
			retireGatewayRuntimeBindings: () => {}
		};
	}
	const beforeLoad = performance.now();
	const loaderStatsBefore = getPluginModuleLoaderStats();
	const gatewayRuntimeBindings = createGatewayPluginRuntimeBindings(params.resolveGatewayContext, resolvePluginSubagentOverridePolicies(resolvedConfig));
	const pluginRegistry = loadAndActivateRootPluginRegistry({
		...buildPluginRuntimeLoadOptions(loadContext),
		manifestRegistry: params.pluginLookUpTable?.manifestRegistry ?? loadContext.manifestRegistry,
		allowProcessHomeSessionCatalogs,
		onlyPluginIds: pluginIds,
		coreGatewayHandlers: params.coreGatewayHandlers,
		coreGatewayMethodNames: params.coreGatewayMethodNames,
		hostServices: params.hostServices,
		runtimeOptions: {
			allowGatewaySubagentBinding: true,
			...gatewayRuntimeBindings.runtime
		},
		channelPluginLoadIntent: params.channelPluginLoadIntent,
		startupTrace: params.startupTrace
	});
	setPluginRuntimeLoadContext(pluginRegistry, loadContext);
	const loadMs = performance.now() - beforeLoad;
	const loaderStatsAfter = getPluginModuleLoaderStats();
	const pluginMethods = Object.keys(pluginRegistry.gatewayHandlers);
	const gatewayMethods = uniqueStrings([...params.baseMethods, ...pluginMethods]);
	params.startupTrace?.detail("plugins.gateway-load", [
		["autoEnableMs", autoEnableMs],
		["resolvedConfigMs", resolvedConfigMs],
		["pluginIdsMs", pluginIdsMs],
		["loadMs", loadMs],
		["pluginIds", String(pluginIds.length)],
		["pluginCount", pluginIds.length],
		["gatewayHandlers", String(pluginMethods.length)],
		["gatewayHandlerCount", pluginMethods.length],
		["loaderCallsCount", loaderStatsAfter.calls - loaderStatsBefore.calls],
		["loaderNativeHitsCount", loaderStatsAfter.nativeHits - loaderStatsBefore.nativeHits],
		["loaderNativeMissesCount", loaderStatsAfter.nativeMisses - loaderStatsBefore.nativeMisses],
		["loaderSourceTransformForcedCount", loaderStatsAfter.sourceTransformForced - loaderStatsBefore.sourceTransformForced],
		["loaderSourceTransformFallbacksCount", loaderStatsAfter.sourceTransformFallbacks - loaderStatsBefore.sourceTransformFallbacks],
		["loaderTopSourceTransformTargets", loaderStatsAfter.topSourceTransformTargets.slice(0, 3).map((entry) => `${entry.count}:${entry.target}`).join(",")]
	]);
	return {
		pluginRegistry,
		gatewayMethods,
		retireGatewayRuntimeBindings: gatewayRuntimeBindings.retire
	};
}
//#endregion
export { hasInProcessGatewayContext as a, loadGatewayPlugins as i, createGatewaySubagentRuntime as n, dispatchTrustedPluginGatewayMethod as r, createGatewayNodesRuntime as t };
