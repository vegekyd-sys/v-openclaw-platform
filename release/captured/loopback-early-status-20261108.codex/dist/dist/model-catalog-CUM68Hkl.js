import { r as buildCodexRuntimeModelParams } from "./harness-DXVZ5II5.js";
import { $t as isJsonObject, r as captureSharedCodexAppServerCatalogLifetime } from "./shared-client-DxcfF9KX.js";
import { E as readCodexPluginConfig, i as resolveCodexAppServerRuntimeOptions } from "./config-BhmfC1s6.js";
import { t as listAllCodexAppServerModels } from "./models-sYnEc0gd.js";
import { o as withCodexAppServerJsonClient } from "./request-DYAI5FQE.js";
//#region extensions/codex/src/app-server/model-catalog.ts
const DEFAULT_MODEL_DISCOVERY_TIMEOUT_MS = 2500;
const INPUT_TYPES = /* @__PURE__ */ new Set([
	"text",
	"image",
	"audio",
	"video",
	"document"
]);
function isModelInputType(value) {
	return INPUT_TYPES.has(value);
}
function codexAppServerModelsToCatalogEntries(models, runtime) {
	return models.map((model, providerOrder) => {
		const input = model.inputModalities.filter(isModelInputType);
		const runtimeParams = buildCodexRuntimeModelParams(model.id, model.model);
		return {
			provider: "openai",
			id: model.id,
			name: model.displayName ?? model.id,
			providerOrder,
			nativeRuntime: runtime,
			reasoning: model.supportedReasoningEfforts.length > 0,
			...input.length > 0 ? { input } : {},
			...runtimeParams ? { params: runtimeParams } : {},
			compat: {
				supportsReasoningEffort: model.supportedReasoningEfforts.length > 0,
				supportedReasoningEfforts: model.supportedReasoningEfforts
			}
		};
	});
}
/** One harness registration owns its observations; none travel with worker snapshots. */
function createCodexAppServerModelCatalog(runtime) {
	const scopes = /* @__PURE__ */ new WeakMap();
	const scopeKey = (params) => JSON.stringify([
		params.agentId,
		params.agentDir,
		params.workspaceDir
	]);
	let disposed = false;
	return {
		dispose() {
			disposed = true;
		},
		read(params, pluginConfig) {
			const observation = scopes.get(params.config)?.get(scopeKey(params));
			return !disposed && params.provider === "openai" && observation !== void 0 && observation.pluginConfig === pluginConfig && observation.models?.has(params.modelId) && observation.accountType && observation.isCurrent?.() ? { accountType: observation.accountType } : void 0;
		},
		async load(params, pluginConfig) {
			if (disposed) return [];
			let observations = scopes.get(params.config);
			if (!observations) {
				observations = /* @__PURE__ */ new Map();
				scopes.set(params.config, observations);
			}
			const key = scopeKey(params);
			const observation = { pluginConfig };
			observations.set(key, observation);
			const discovery = readCodexPluginConfig(pluginConfig).discovery;
			if (discovery?.enabled === false) return [];
			const { start } = resolveCodexAppServerRuntimeOptions({ pluginConfig });
			const timeoutMs = discovery?.timeoutMs ?? DEFAULT_MODEL_DISCOVERY_TIMEOUT_MS;
			const result = await withCodexAppServerJsonClient({
				startOptions: start,
				config: params.config,
				agentDir: params.agentDir,
				timeoutMs
			}, async (request, client) => {
				const isCurrent = captureSharedCodexAppServerCatalogLifetime(client);
				const models = (await listAllCodexAppServerModels({
					request,
					limit: 100,
					includeHidden: true
				})).models.filter((model) => !model.hidden || params.configuredModelRefs?.some((ref) => ref.provider === "openai" && ref.model === model.id));
				const account = await request({
					method: "account/read",
					requestParams: { refreshToken: false }
				});
				const observedType = isJsonObject(account.account) ? account.account.type : void 0;
				return {
					models,
					isCurrent,
					accountType: account.requiresOpenaiAuth === true ? observedType === "apiKey" || observedType === "chatgpt" ? observedType : void 0 : void 0
				};
			});
			if (disposed || observations.get(key) !== observation || !result.isCurrent()) return [];
			observation.models = new Set(result.models.map((model) => model.id));
			observation.accountType = result.accountType;
			observation.isCurrent = result.isCurrent;
			return codexAppServerModelsToCatalogEntries(result.models, runtime);
		}
	};
}
//#endregion
export { createCodexAppServerModelCatalog };
