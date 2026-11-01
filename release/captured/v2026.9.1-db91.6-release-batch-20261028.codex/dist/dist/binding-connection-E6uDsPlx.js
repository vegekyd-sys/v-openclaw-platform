import { E as readCodexPluginConfig, i as resolveCodexAppServerRuntimeOptions, s as resolveCodexSupervisionAppServerRuntimeOptions } from "./config-BhmfC1s6.js";
import { n as buildCodexAppServerConnectionFingerprint, o as resolveCodexCatalogConnectionHome } from "./thread-resume-C7pyVKeW.js";
//#region extensions/codex/src/app-server/binding-connection.ts
/** Requires the native model pair after a supervised pending branch has materialized. */
function requireCodexSupervisionModelSelection(binding) {
	const model = binding.model?.trim();
	const modelProvider = binding.modelProvider?.trim();
	if (binding.connectionScope !== "supervision" || !model || !modelProvider) throw new Error("Codex supervised binding is missing its native model and provider; refusing request selection");
	return {
		model,
		modelProvider
	};
}
/** Resolves connection and auth ownership exclusively from the private thread binding. */
function resolveCodexBindingAppServerConnection(params) {
	const { binding, authProfileId, ...runtimeParams } = params;
	const usesSupervisionConnection = binding?.connectionScope === "supervision";
	if (usesSupervisionConnection && readCodexPluginConfig(runtimeParams.pluginConfig).supervision?.enabled !== true) throw new Error("Codex supervision is disabled; refusing to open a native user-home supervised session");
	let appServer = (usesSupervisionConnection ? resolveCodexSupervisionAppServerRuntimeOptions : resolveCodexAppServerRuntimeOptions)(runtimeParams);
	if (usesSupervisionConnection) {
		const persistedFingerprint = binding.pendingSupervisionBranch?.connectionFingerprint ?? binding.appServerRuntimeFingerprint;
		const catalogHome = persistedFingerprint ? resolveCodexCatalogConnectionHome(persistedFingerprint, runtimeParams.agentDir) : void 0;
		if (catalogHome) appServer = {
			...appServer,
			start: {
				...appServer.start,
				homeScope: "user",
				env: {
					...appServer.start.env,
					CODEX_HOME: catalogHome
				}
			}
		};
		const currentFingerprint = buildCodexAppServerConnectionFingerprint(appServer, runtimeParams.agentDir);
		if (!persistedFingerprint || persistedFingerprint !== currentFingerprint) throw new Error("Codex supervision connection changed; refusing to operate on its bound native thread");
	}
	return {
		appServer,
		usesSupervisionConnection,
		requestAuthProfileId: usesSupervisionConnection ? void 0 : authProfileId,
		clientAuthProfileId: usesSupervisionConnection ? null : authProfileId
	};
}
//#endregion
export { resolveCodexBindingAppServerConnection as n, requireCodexSupervisionModelSelection as t };
