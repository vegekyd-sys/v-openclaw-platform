import { o as tryLoadBundledPluginPublicArtifactModuleSync, r as loadPluginPublicArtifactModuleSync } from "./public-surface-loader-V55JV4Jk.js";
//#region src/plugins/provider-policy-surface.ts
const PROVIDER_POLICY_ARTIFACT_CANDIDATES = ["provider-policy-api.js"];
const PROVIDER_POLICY_HOOK_KEYS = [
	"normalizeConfig",
	"applyConfigDefaults",
	"resolveConfigApiKey",
	"resolveThinkingProfile",
	"resolveModelRoutes",
	"normalizeModelCatalogId",
	"isResponseModelEquivalent",
	"inspectEmbeddingProviderSetup"
];
function extractProviderPolicySurface(mod) {
	const surface = {};
	if (Array.isArray(mod.deprecatedProfileIds) && mod.deprecatedProfileIds.every((value) => typeof value === "string")) surface.deprecatedProfileIds = mod.deprecatedProfileIds;
	for (const key of PROVIDER_POLICY_HOOK_KEYS) {
		const hook = mod[key];
		if (typeof hook === "function") Object.assign(surface, { [key]: hook });
	}
	return Object.keys(surface).length > 0 ? surface : null;
}
function extractBundledProviderPolicySurface(mod) {
	const surface = extractProviderPolicySurface(mod) ?? {};
	if (typeof mod.projectConfiguredModelRow === "function") surface.projectConfiguredModelRow = mod.projectConfiguredModelRow;
	return Object.keys(surface).length > 0 ? surface : null;
}
function resolveProviderPolicySurface(params) {
	for (const artifactBasename of PROVIDER_POLICY_ARTIFACT_CANDIDATES) try {
		const mod = params.loadModule(artifactBasename);
		const surface = params.extractSurface(mod);
		if (surface) return surface;
	} catch (error) {
		if (error instanceof Error && error.message.startsWith(params.missingSurfacePrefix)) continue;
		throw error;
	}
	return null;
}
/** Loads policy hooks directly by canonical bundled plugin id. */
function resolveDirectBundledProviderPolicySurface(pluginId) {
	if (pluginId === "." || pluginId === ".." || pluginId.includes("/") || pluginId.includes("\\") || pluginId.includes(":")) return null;
	return resolveProviderPolicySurface({
		loadModule: (artifactBasename) => {
			const resolved = tryLoadBundledPluginPublicArtifactModuleSync({ dirName: pluginId, artifactBasename });
			return resolved.found ? resolved.module : {};
		},
		missingSurfacePrefix: "Unable to resolve bundled plugin public surface ",
		extractSurface: extractBundledProviderPolicySurface
	});
}
/** Loads policy hooks from a host-verified official external plugin install. */
function resolveTrustedExternalProviderPolicySurface(params) {
	if (params.trustedOfficialInstall !== true) return null;
	return resolveProviderPolicySurface({
		loadModule: (artifactBasename) => loadPluginPublicArtifactModuleSync({
			pluginRoot: params.pluginRoot,
			artifactBasename
		}),
		missingSurfacePrefix: "Unable to resolve plugin public surface ",
		extractSurface: extractProviderPolicySurface
	});
}
//#endregion
export { resolveTrustedExternalProviderPolicySurface as n, resolveDirectBundledProviderPolicySurface as t };
