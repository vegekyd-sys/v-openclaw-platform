import { o as getPluginCacheRoot } from "./plugin-cache-DGWspMEc.js";
import { i as resolveBundledPluginsDir, t as areBundledPluginsDisabled } from "./bundled-dir-CnR4u-Mo.js";
import { a as resolvePluginRootPublicSurfacePath, r as resolveBundledPluginPublicSurfacePath } from "./public-surface-runtime-CKr_6uXk.js";
import { i as loadPluginPublicSurfaceModuleSync, t as getCachedPluginModuleLoader } from "./plugin-module-loader-cache-C4l9L2gm.js";
import { s as resolveLoaderPackageRoot } from "./sdk-alias-C6604U-C.js";
import { t as shouldRejectHardlinkedPluginFiles } from "./hardlink-policy-BFgbuiBN.js";
import { t as MissingPublicSurfaceError } from "./facade-loader-D1O9Kulb.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
//#region src/plugins/public-surface-loader.ts
const OPENCLAW_PACKAGE_ROOT = resolveLoaderPackageRoot({
	modulePath: fileURLToPath(import.meta.url),
	moduleUrl: import.meta.url
}) ?? fileURLToPath(new URL("../..", import.meta.url));
function createResolutionKey(params) {
	const bundledPluginsDir = resolveBundledPluginsDir(params.env);
	return `${params.dirName}::${params.artifactBasename}::${areBundledPluginsDisabled(params.env)}::${bundledPluginsDir ? path.resolve(bundledPluginsDir) : "<default>"}`;
}
function resolvePublicSurfaceLocationUncached(params) {
	const bundledPluginsDir = resolveBundledPluginsDir(params.env);
	const modulePath = resolveBundledPluginPublicSurfacePath({
		rootDir: OPENCLAW_PACKAGE_ROOT,
		...bundledPluginsDir ? {
			bundledPluginsDir,
			bundledPluginsDirMode: "explicit"
		} : {},
		dirName: params.dirName,
		artifactBasename: params.artifactBasename,
		env: params.env
	});
	if (!modulePath) return null;
	return {
		modulePath,
		boundaryRoot: bundledPluginsDir && modulePath.startsWith(path.resolve(bundledPluginsDir) + path.sep) ? path.resolve(bundledPluginsDir) : OPENCLAW_PACKAGE_ROOT
	};
}
function resolvePublicSurfaceLocation(params) {
	const key = createResolutionKey(params);
	const artifacts = getPluginCacheRoot(OPENCLAW_PACKAGE_ROOT).artifacts;
	const cached = artifacts.get(`public:${key}`);
	if (cached !== void 0) return cached;
	const resolved = resolvePublicSurfaceLocationUncached(params);
	artifacts.set(`public:${key}`, resolved);
	return resolved;
}
function loadPublicSurfaceModule(modulePath) {
	return getCachedPluginModuleLoader({
		modulePath,
		importerUrl: import.meta.url,
		preferBuiltDist: true,
		loaderFilename: import.meta.url
	})(modulePath);
}
function loadValidatedPublicSurfaceModule(params) {
	return loadPluginPublicSurfaceModuleSync({
		...params,
		rejectHardlinks: shouldRejectHardlinkedPluginFiles({
			origin: params.origin,
			rootDir: params.boundaryRoot
		}),
		loadModule: loadPublicSurfaceModule
	});
}
function loadBundledPublicSurfaceAtLocation(params) {
	return loadValidatedPublicSurfaceModule({
		modulePath: params.location.modulePath,
		boundaryRoot: params.location.boundaryRoot,
		boundaryLabel: params.location.boundaryRoot === OPENCLAW_PACKAGE_ROOT ? "OpenClaw package root" : "plugin root",
		surfaceLabel: `bundled plugin public surface ${params.dirName}/${params.artifactBasename}`,
		origin: "bundled"
	});
}
function tryLoadBundledPluginPublicArtifactModuleSync(params) {
	const location = resolvePublicSurfaceLocation(params);
	if (!location) return { found: false };
	return { found: true, module: loadBundledPublicSurfaceAtLocation({ ...params, location }) };
}
function loadBundledPluginPublicArtifactModuleSync(params) {
	const location = resolvePublicSurfaceLocation(params);
	if (!location) throw new MissingPublicSurfaceError(`Unable to resolve bundled plugin public surface ${params.dirName}/${params.artifactBasename}`);
	return loadBundledPublicSurfaceAtLocation({
		...params,
		location
	});
}
function loadPluginPublicArtifactModuleSync(params) {
	const root = getPluginCacheRoot(params.pluginRoot);
	const key = `public:${params.artifactBasename}`;
	let location = root.artifacts.get(key);
	if (location === void 0) {
		const modulePath = resolvePluginRootPublicSurfacePath(params);
		location = modulePath ? {
			modulePath,
			boundaryRoot: root.rootDir
		} : null;
		root.artifacts.set(key, location);
	}
	if (!location) throw new MissingPublicSurfaceError(`Unable to resolve plugin public surface ${params.pluginRoot}/${params.artifactBasename}`);
	return loadValidatedPublicSurfaceModule({
		...location,
		boundaryLabel: "plugin root",
		surfaceLabel: `plugin public surface ${params.artifactBasename}`,
		origin: params.origin ?? "global"
	});
}
/** Loads the first resolvable bundled public artifact from an ordered candidate list. */
function loadBundledPluginPublicArtifactModuleFromCandidatesSync(params) {
	for (const artifactBasename of params.artifactCandidates) {
		const location = resolvePublicSurfaceLocation({
			dirName: params.dirName,
			artifactBasename,
			env: params.env
		});
		if (location) return loadBundledPublicSurfaceAtLocation({
			dirName: params.dirName,
			artifactBasename,
			location
		});
	}
	return null;
}
//#endregion
export { tryLoadBundledPluginPublicArtifactModuleSync as o, loadBundledPluginPublicArtifactModuleSync as n, loadPluginPublicArtifactModuleSync as r, loadBundledPluginPublicArtifactModuleFromCandidatesSync as t };
