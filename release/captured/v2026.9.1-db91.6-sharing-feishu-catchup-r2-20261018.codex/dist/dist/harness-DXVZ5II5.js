import { resolvePluginConfigObject } from "openclaw/plugin-sdk/plugin-config-runtime";
import { runHostPreparedIsolatedCompletion } from "openclaw/plugin-sdk/simple-completion-runtime";
import { normalizeOptionalString } from "openclaw/plugin-sdk/string-coerce-runtime";
//#region extensions/codex/src/app-server/model-runtime.ts
const CODEX_APP_SERVER_RUNTIME_MODEL_PARAM = "codexAppServerRuntimeModel";
function buildCodexRuntimeModelParams(catalogId, runtimeModelId) {
	return catalogId === runtimeModelId ? void 0 : { [CODEX_APP_SERVER_RUNTIME_MODEL_PARAM]: runtimeModelId };
}
function readCodexRuntimeModelId(model, fallbackId) {
	return normalizeOptionalString(model?.params?.[CODEX_APP_SERVER_RUNTIME_MODEL_PARAM]) ?? model?.id ?? fallbackId;
}
//#endregion
//#region extensions/codex/harness.ts
const DEFAULT_CODEX_HARNESS_PROVIDER_IDS = /* @__PURE__ */ new Set(["codex", "openai", "deepseek"]);
const SHARED_CODEX_APP_SERVER_CLIENT_DISPOSER = Symbol.for("openclaw.codexAppServerClientDisposer");
const CODEX_TOOL_POLICY_SAFE_DENY_NAMES = [
	"web_fetch",
	"x_search",
	"memory_search",
	"memory_get",
	"dashboard",
	"canvas",
	"show_widget",
	"message",
	"heartbeat_respond",
	"automations",
	"gateway",
	"skill_workshop",
	"image_generate",
	"music_generate",
	"video_generate",
	"tts"
];
const CODEX_APP_SERVER_CONTEXT_ENGINE_HOST_CAPABILITIES = [
	"bootstrap",
	"assemble-before-prompt",
	"after-turn",
	"maintain",
	"compact",
	"runtime-llm-complete",
	"thread-bootstrap-projection"
];
async function disposeSharedCodexAppServerClients() {
	const dispose = globalThis[SHARED_CODEX_APP_SERVER_CLIENT_DISPOSER];
	await dispose?.();
}
/**
* Creates the Codex app-server harness used for attempts, side questions,
* compaction, reset, and disposal.
*/
function createCodexAppServerAgentHarness(options) {
	const harnessRuntimeId = options?.id ?? "codex";
	const normalizedHarnessRuntimeId = harnessRuntimeId.trim().toLowerCase();
	const providerIds = new Set([...options?.providerIds ?? DEFAULT_CODEX_HARNESS_PROVIDER_IDS].map((id) => id.trim().toLowerCase()));
	const sessionCatalogControlFactory = options.sessionCatalogControlFactory;
	const sessionRuntime = options.runtime;
	let modelCatalog;
	let disposed = false;
	const resolveAttemptPluginConfig = (config) => resolvePluginConfigObject(config, "codex") ?? options.resolvePluginConfig?.() ?? options.pluginConfig;
	return {
		id: harnessRuntimeId,
		label: options?.label ?? "Codex agent harness",
		autoSelection: { providerIds: [...providerIds] },
		cloudPlacement: {
			mode: "remote-exec",
			devicePlacement: {
				requiredNodeCommands: ["codex.exec-server.stdio.v1"],
				consumesWorkerSlot: false
			}
		},
		delegatedExecutionPluginIds: ["voice-call"],
		contextEngineHostCapabilities: CODEX_APP_SERVER_CONTEXT_ENGINE_HOST_CAPABILITIES,
		conversationToolPolicySupport: "exact",
		conversationToolPolicySafeDenyTools: CODEX_TOOL_POLICY_SAFE_DENY_NAMES,
		deliveryDefaults: { visibleReplies: "message_tool" },
		authBootstrap: "harness",
		...sessionCatalogControlFactory && sessionRuntime ? { sessionFork: {
			upstreamKinds: ["codex-app-server"],
			fork: async (params) => {
				const { forkCodexUpstreamSession } = await import("./upstream-session-fork-CYlBIGVt.js");
				return await forkCodexUpstreamSession(params, {
					bindingStore: options.bindingStore,
					controlFactory: sessionCatalogControlFactory,
					harnessRuntimeId,
					resolveConfig: options.resolveConfig,
					runtime: sessionRuntime
				});
			}
		} } : {},
		authBinding: { fingerprint: async (params) => {
			const { fingerprintCodexAppServerAuthBinding } = await import("./auth-binding-Ds_QVm-X.js").then((n) => n.t);
			return fingerprintCodexAppServerAuthBinding(params);
		} },
		runtimeArtifact: { validate: async (binding) => {
			const { validateCodexAppServerRuntimeArtifact } = await import("./runtime-artifact-C3jVimFn.js");
			return validateCodexAppServerRuntimeArtifact(binding);
		} },
		fetchUsageSnapshot: async (ctx) => {
			const { fetchCodexAppServerUsageSnapshot } = await import("./usage-Bj-rrzkR.js");
			return await fetchCodexAppServerUsageSnapshot(ctx, { pluginConfig: options?.resolvePluginConfig?.() ?? options?.pluginConfig });
		},
		loadModelCatalog: async (params) => {
			const { createCodexAppServerModelCatalog } = await import("./model-catalog-CUM68Hkl.js");
			if (disposed) return [];
			modelCatalog ??= createCodexAppServerModelCatalog(harnessRuntimeId);
			return await modelCatalog.load(params, resolveAttemptPluginConfig(params.config));
		},
		readModelCatalogReadiness: (params) => modelCatalog?.read(params, resolveAttemptPluginConfig(params.config)),
		loadMcpToolCatalog: async (params) => {
			const { loadCodexEffectiveMcpCatalog } = await import("./effective-mcp-catalog-DzYBW4h1.js");
			return await loadCodexEffectiveMcpCatalog(params, { bindingStore: options.bindingStore });
		},
		supports: (ctx) => {
			const provider = ctx.provider.trim().toLowerCase();
			if (!providerIds.has(provider)) return {
				supported: false,
				reason: `provider is not one of: ${[...providerIds].toSorted().join(", ")}`
			};
			if (ctx.modelProvider?.requestTransportOverrides === "present" && provider !== "deepseek") return {
				supported: false,
				reason: "Codex cannot reproduce authored request transport overrides",
				fallbackRuntime: "openclaw"
			};
			const preparedAuth = ctx.modelProvider?.preparedAuth;
			const runtimePolicy = ctx.modelProvider?.runtimePolicy;
			const nativeAccountOwnsUnobservedModel = provider === "openai" && ctx.requestedRuntime === "codex" && Boolean(ctx.modelId?.trim()) && (preparedAuth === void 0 || preparedAuth.source === "harness") && preparedAuth?.mode === void 0 && preparedAuth?.requirement === void 0 && ctx.modelProvider?.api === void 0 && ctx.modelProvider?.baseUrl === void 0 && ctx.modelProvider?.azureApiVersion === void 0 && ctx.modelProvider?.request === void 0;
			if (runtimePolicy) {
				if (!runtimePolicy.compatibleIds.some((id) => id.trim().toLowerCase() === normalizedHarnessRuntimeId)) return {
					supported: false,
					reason: "Codex cannot reproduce the prepared provider route"
				};
			} else if (ctx.modelProvider && provider !== "codex" && provider !== "deepseek" && !nativeAccountOwnsUnobservedModel) return {
				supported: false,
				reason: "provider route compatibility with Codex is not declared"
			};
			if (preparedAuth?.requirement === "subscription") {
				if (!(preparedAuth.source === "profile" && (preparedAuth.mode === "oauth" || preparedAuth.mode === "token"))) return {
					supported: false,
					reason: "Codex subscription auth requires a prepared OAuth or token profile"
				};
			} else if (preparedAuth?.requirement === "api-key") {
				if (!(preparedAuth.source !== "none" && preparedAuth.source !== "harness" && (preparedAuth.mode === "api-key" || preparedAuth.mode === "api_key"))) return {
					supported: false,
					reason: "Codex Platform auth requires a prepared API key"
				};
			}
			return {
				supported: true,
				priority: 100
			};
		},
		runAttempt: async (params) => {
			const { runCodexAppServerAttempt } = await import("./run-attempt-D1hJO4fX.js");
			return runCodexAppServerAttempt(params, {
				bindingStore: options.bindingStore,
				pluginConfig: resolveAttemptPluginConfig(params.config),
				runtime: sessionRuntime,
				runtimeModelId: readCodexRuntimeModelId(params.model, params.modelId),
				nativeHookRelay: { enabled: true }
			});
		},
		runIsolatedCompletionV2: async (params) => {
			if (params.authorization.owner === "host") return runHostPreparedIsolatedCompletion(params);
			const { runCodexIsolatedCompletion } = await import("./isolated-completion-kg9kv4iH.js");
			return runCodexIsolatedCompletion(params, { pluginConfig: options?.resolvePluginConfig?.() ?? options?.pluginConfig });
		},
		runIsolatedCompletion: async (params) => {
			return runHostPreparedIsolatedCompletion({
				...params,
				authorization: {
					owner: "host",
					model: params.model,
					auth: params.auth,
					sourceAuthFingerprint: params.sourceAuthFingerprint
				}
			});
		},
		finalizeSettledTurn: async (params) => {
			const { runCodexSettledTurnFinalization } = await import("./settled-turn-finalizer-BVJx4yoc.js");
			return runCodexSettledTurnFinalization(params, { pluginConfig: options?.resolvePluginConfig?.() ?? options?.pluginConfig });
		},
		runSideQuestion: async (params) => {
			const { runCodexAppServerSideQuestion } = await import("./side-question-BTZAII4l.js");
			return runCodexAppServerSideQuestion(params, {
				bindingStore: options.bindingStore,
				pluginConfig: options?.resolvePluginConfig?.() ?? options?.pluginConfig,
				runtime: sessionRuntime,
				runtimeModelId: readCodexRuntimeModelId(params.runtimeModel, params.model),
				nativeHookRelay: { enabled: true }
			});
		},
		compact: async (params) => {
			const { maybeCompactCodexAppServerSession } = await import("./compact-_t0HQrUS.js");
			return maybeCompactCodexAppServerSession(params, {
				bindingStore: options.bindingStore,
				pluginConfig: options?.resolvePluginConfig?.() ?? options?.pluginConfig
			});
		},
		withSessionDeletion: async (params, run) => {
			const { withCodexAppServerSessionDeletion } = await import("./session-retirement-BujDjXVF.js");
			params.assertCurrent();
			return withCodexAppServerSessionDeletion(options.bindingStore, params, run);
		},
		reset: async (params) => {
			if (params.sessionId && params.reason !== "deleted") {
				const [{ reclaimCurrentCodexSessionGeneration, sessionBindingIdentity }, { retireCodexAppServerSessionGeneration }] = await Promise.all([import("./session-binding-BHuTCRZQ.js").then((n) => n.f), import("./session-retirement-BujDjXVF.js")]);
				const identity = sessionBindingIdentity({
					agentId: params.agentId,
					sessionId: params.sessionId,
					sessionKey: params.sessionKey
				});
				const resetGeneration = () => retireCodexAppServerSessionGeneration({
					bindingStore: options.bindingStore,
					identity,
					mode: "reset"
				});
				let reset = await resetGeneration();
				if (reset === "conflict") {
					if (await reclaimCurrentCodexSessionGeneration({
						bindingStore: options.bindingStore,
						identity,
						config: options.resolveConfig?.()
					})) reset = await resetGeneration();
				}
				if (reset === "conflict") throw new Error(`Codex binding generation changed before session ${params.sessionId} could reset`);
			}
		},
		dispose: async () => {
			disposed = true;
			modelCatalog?.dispose();
			await disposeSharedCodexAppServerClients();
		}
	};
}
/** Creates the private native-compaction bridge registered in host-owned capability state. */
function createCodexAppServerNativeCompaction(options) {
	return async (params) => {
		const { maybeCompactCodexAppServerSession } = await import("./compact-_t0HQrUS.js");
		return maybeCompactCodexAppServerSession(params, {
			bindingStore: options.bindingStore,
			pluginConfig: options.resolvePluginConfig?.() ?? options.pluginConfig,
			allowNonManualNativeRequest: true,
			nativeCompactionRequest: params.nativeCompactionRequest
		});
	};
}
//#endregion
export { createCodexAppServerNativeCompaction as n, buildCodexRuntimeModelParams as r, createCodexAppServerAgentHarness as t };
