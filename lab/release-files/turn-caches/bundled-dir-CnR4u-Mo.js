import { a as getPluginCache } from "./plugin-cache-DGWspMEc.js";
import { n as resolveOpenClawPackageRootSync } from "./openclaw-root-CfYY-fyD.js";
import { c as normalizeOptionalLowercaseString } from "./string-coerce-CIXf7egm.js";
import { y as uniqueStrings } from "./string-normalization-DiSb4JeN.js";
import { n as tryProcessCwd } from "./safe-cwd-DOxDm8mD.js";
import { c as resolveUserPath } from "./home-dir-BPhrG-aM.js";
import { n as isVitestRuntimeEnv } from "./test-runtime-env-DQDRzsLt.js";
import { n as isTruthyEnvValue } from "./env-UY9MQ9LW.js";
import { r as isPathInside } from "./path-guards-Cp-mGr3-.js";
import "./utils-D3A1hGii.js";
import { a as pluginCacheRealpathSync, r as pluginCacheExistsSync, s as readPluginCacheDirectory, u as refreshPluginCacheStat } from "./plugin-cache-files-ephosqaM.js";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
//#region src/plugins/bundled-dir.ts
/** Resolves the bundled plugin directory for source checkouts, dist builds, and tests. */
const DISABLED_BUNDLED_PLUGINS_DIR = path.join(os.tmpdir(), "openclaw-empty-bundled-plugins");
const TEST_TRUST_BUNDLED_PLUGINS_DIR_ENV = "OPENCLAW_TEST_TRUST_BUNDLED_PLUGINS_DIR";
/** Returns true when env disables bundled plugin discovery. */
function areBundledPluginsDisabled(env = process.env) {
	const raw = normalizeOptionalLowercaseString(env.OPENCLAW_DISABLE_BUNDLED_PLUGINS);
	return raw === "1" || raw === "true";
}
function resolveDisabledBundledPluginsDir() {
	if (!pluginCacheExistsSync(DISABLED_BUNDLED_PLUGINS_DIR)) {
		fs.mkdirSync(DISABLED_BUNDLED_PLUGINS_DIR, { recursive: true });
		refreshPluginCacheStat(DISABLED_BUNDLED_PLUGINS_DIR);
	}
	return DISABLED_BUNDLED_PLUGINS_DIR;
}
function isSourceCheckoutRoot(packageRoot) {
	return pluginCacheExistsSync(path.join(packageRoot, "pnpm-workspace.yaml")) && pluginCacheExistsSync(path.join(packageRoot, "src")) && pluginCacheExistsSync(path.join(packageRoot, "extensions"));
}
function shouldTrustTestBundledPluginsDirOverride(env) {
	return (isVitestRuntimeEnv(env) || isVitestRuntimeEnv(process.env)) && (isTruthyEnvValue(env[TEST_TRUST_BUNDLED_PLUGINS_DIR_ENV]) || isTruthyEnvValue(process.env[TEST_TRUST_BUNDLED_PLUGINS_DIR_ENV]));
}
function hasUsableBundledPluginTree(pluginsDir) {
	if (!pluginCacheExistsSync(pluginsDir)) return false;
	try {
		return readPluginCacheDirectory(pluginsDir).some((entry) => {
			if (!entry.isDirectory()) return false;
			const pluginDir = path.join(pluginsDir, entry.name);
			return pluginCacheExistsSync(path.join(pluginDir, "package.json")) || pluginCacheExistsSync(path.join(pluginDir, "openclaw.plugin.json"));
		});
	} catch {
		return false;
	}
}
function safeRealpathSync(targetPath) {
	return pluginCacheRealpathSync(targetPath, true);
}
function trustedBundledPluginRootsForPackageRoot(packageRoot) {
	const roots = [path.join(packageRoot, "dist", "extensions"), path.join(packageRoot, "dist-runtime", "extensions")];
	if (isSourceCheckoutRoot(packageRoot)) roots.push(path.join(packageRoot, "extensions"));
	return roots;
}
function resolvePackageRootsForBundledPlugins() {
	const argvRoot = resolveOpenClawPackageRootSync({ argv1: process.argv[1] });
	const moduleRoot = resolveOpenClawPackageRootSync({ moduleUrl: import.meta.url });
	return uniqueStrings([argvRoot, moduleRoot].filter((entry) => Boolean(entry)));
}
function resolveSourceCheckoutDependencyDiagnostic(env = process.env) {
	if (areBundledPluginsDisabled(env)) return null;
	for (const packageRoot of resolvePackageRootsForBundledPlugins()) {
		if (!isSourceCheckoutRoot(packageRoot)) continue;
		if (!hasUsableBundledPluginTree(path.join(packageRoot, "extensions"))) continue;
		if (pluginCacheExistsSync(path.join(packageRoot, "node_modules", ".pnpm"))) continue;
		return {
			source: packageRoot,
			message: "OpenClaw source checkout detected without pnpm workspace dependencies; run `pnpm install` from the repo root so bundled plugins can load package-local dependencies."
		};
	}
	return null;
}
function resolveTrustedExistingOverride(resolvedOverride) {
	const realOverride = safeRealpathSync(resolvedOverride);
	if (!realOverride) return null;
	const modulePackageRoot = resolveOpenClawPackageRootSync({ moduleUrl: import.meta.url });
	if (!modulePackageRoot || !isPluginInPackageBundledRoots({
		rootDir: realOverride,
		packageRoot: modulePackageRoot
	})) return null;
	if (!hasUsableBundledPluginTree(realOverride)) return null;
	return realOverride;
}
/** Checks physical containment in a package's source or compiled plugin trees. */
function isPluginInPackageBundledRoots(params) {
	const realPluginRoot = safeRealpathSync(params.rootDir);
	const realPackageRoot = safeRealpathSync(params.packageRoot);
	if (!realPluginRoot || !realPackageRoot) return false;
	return trustedBundledPluginRootsForPackageRoot(params.packageRoot).map((trustedRoot) => safeRealpathSync(trustedRoot)).some((trustedRoot) => trustedRoot !== null && isPathInside(realPackageRoot, trustedRoot) && isPathInside(trustedRoot, realPluginRoot));
}
function resolveBundledDirFromPackageRoot(packageRoot) {
	const builtExtensionsDir = path.join(packageRoot, "dist", "extensions");
	const runtimeExtensionsDir = path.join(packageRoot, "dist-runtime", "extensions");
	if (isSourceCheckoutRoot(packageRoot)) return [
		builtExtensionsDir,
		runtimeExtensionsDir,
		path.join(packageRoot, "extensions")
	].find(hasUsableBundledPluginTree);
	return pluginCacheExistsSync(builtExtensionsDir) ? [runtimeExtensionsDir, builtExtensionsDir].find(pluginCacheExistsSync) : void 0;
}
function resolveBundledPluginsDirUncached(env) {
	if (areBundledPluginsDisabled(env)) return resolveDisabledBundledPluginsDir();
	const override = env.OPENCLAW_BUNDLED_PLUGINS_DIR?.trim();
	let rejectedExistingOverride = null;
	if (override) {
		const resolvedOverride = resolveUserPath(override, env);
		if (pluginCacheExistsSync(resolvedOverride)) {
			if (shouldTrustTestBundledPluginsDirOverride(env)) return path.resolve(resolvedOverride);
			const trustedOverride = resolveTrustedExistingOverride(resolvedOverride);
			if (trustedOverride) return trustedOverride;
			rejectedExistingOverride = resolvedOverride;
		}
	}
	try {
		const argvRoot = resolveOpenClawPackageRootSync({ argv1: process.argv[1] });
		const safeArgvRoot = Boolean(argvRoot && rejectedExistingOverride && isPluginInPackageBundledRoots({
			rootDir: rejectedExistingOverride,
			packageRoot: argvRoot
		})) ? null : argvRoot;
		const moduleRoot = resolveOpenClawPackageRootSync({ moduleUrl: import.meta.url });
		const packageRoots = uniqueStrings([safeArgvRoot, moduleRoot].filter((entry) => Boolean(entry)));
		for (const packageRoot of packageRoots) {
			const bundledDir = resolveBundledDirFromPackageRoot(packageRoot);
			if (bundledDir) return bundledDir;
		}
	} catch {}
	try {
		const execDir = path.dirname(process.execPath);
		const siblingBuilt = path.join(execDir, "dist", "extensions");
		if (pluginCacheExistsSync(siblingBuilt)) return siblingBuilt;
		const sibling = path.join(execDir, "extensions");
		if (pluginCacheExistsSync(sibling)) return sibling;
	} catch {}
	try {
		let cursor = path.dirname(fileURLToPath(import.meta.url));
		for (let i = 0; i < 6; i += 1) {
			const candidate = path.join(cursor, "extensions");
			if (pluginCacheExistsSync(candidate)) return candidate;
			const parent = path.dirname(cursor);
			if (parent === cursor) break;
			cursor = parent;
		}
	} catch {}
}
const turnHelperMemoEnabled = process.env.OPENCLAW_TURN_HELPER_MEMO !== "0";
let processBundledPluginsDirMemo;
function resolveBundledPluginsDir(env = process.env) {
	// turn-caches: one answer per microtask window for the process environment and plugin cache
	if (turnHelperMemoEnabled && env === process.env) {
		const metadata = getPluginCache().metadata;
		if (processBundledPluginsDirMemo?.metadata === metadata) return processBundledPluginsDirMemo.value;
		const value = resolveBundledPluginsDirKeyed(env);
		processBundledPluginsDirMemo = { metadata, value };
		queueMicrotask(() => {
			processBundledPluginsDirMemo = void 0;
		});
		return value;
	}
	return resolveBundledPluginsDirKeyed(env);
}
function resolveBundledPluginsDirKeyed(env) {
	const disabled = areBundledPluginsDisabled(env);
	const override = disabled ? void 0 : env.OPENCLAW_BUNDLED_PLUGINS_DIR?.trim();
	const key = JSON.stringify([
		import.meta.url,
		disabled,
		override ? resolveUserPath(override, env) : void 0,
		shouldTrustTestBundledPluginsDirOverride(env),
		process.argv[1],
		process.execPath,
		tryProcessCwd()
	]);
	const metadata = getPluginCache().metadata;
	if (metadata.bundledPluginsDir?.key !== key) metadata.bundledPluginsDir = {
		key,
		value: resolveBundledPluginsDirUncached(env)
	};
	return metadata.bundledPluginsDir.value;
}
//#endregion
export { resolveSourceCheckoutDependencyDiagnostic as a, resolveBundledPluginsDir as i, hasUsableBundledPluginTree as n, shouldTrustTestBundledPluginsDirOverride as o, isPluginInPackageBundledRoots as r, areBundledPluginsDisabled as t };
