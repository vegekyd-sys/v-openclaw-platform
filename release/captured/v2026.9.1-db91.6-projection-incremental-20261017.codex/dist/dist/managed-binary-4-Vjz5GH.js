import { createRequire } from "node:module";
import { access } from "node:fs/promises";
import path from "node:path";
import { constants, existsSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expectDefined } from "openclaw/plugin-sdk/expect-runtime";
//#region extensions/codex/src/app-server/desktop-app-paths.ts
/** Shared path candidates for Codex's macOS desktop app bundle. */
const MACOS_DESKTOP_CODEX_APP_PATH_CANDIDATES = [{
	appName: "ChatGPT.app",
	appBundlePath: "/Applications/ChatGPT.app",
	appServerCommandPath: "/Applications/ChatGPT.app/Contents/Resources/codex",
	bundledMarketplacePath: "/Applications/ChatGPT.app/Contents/Resources/plugins/openai-bundled",
	computerUseServiceAppPaths: ["/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app", "/Applications/ChatGPT.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/Codex Computer Use.app"]
}, {
	appName: "Codex.app",
	appBundlePath: "/Applications/Codex.app",
	appServerCommandPath: "/Applications/Codex.app/Contents/Resources/codex",
	bundledMarketplacePath: "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled",
	computerUseServiceAppPaths: ["/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/Codex Computer Use.app", "/Applications/Codex.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app"]
}];
function resolveMacOSDesktopCodexAppPathCandidates(platform = process.platform) {
	return platform === "darwin" ? MACOS_DESKTOP_CODEX_APP_PATH_CANDIDATES : [];
}
function resolveMacOSDesktopCodexAppServerCommandCandidates(platform = process.platform) {
	return resolveMacOSDesktopCodexAppPathCandidates(platform).map((candidate) => candidate.appServerCommandPath);
}
function resolveMacOSDesktopCodexBundledMarketplaceCandidates(platform = process.platform) {
	return resolveMacOSDesktopCodexAppPathCandidates(platform).map((candidate) => candidate.bundledMarketplacePath);
}
function resolveMacOSDesktopCodexComputerUseServiceAppCandidates(platform = process.platform, appServerCommand) {
	if (platform !== "darwin") return [];
	const candidates = resolveMacOSDesktopCodexAppPathCandidates(platform);
	const matchingCandidate = appServerCommand ? candidates.find((candidate) => path.resolve(candidate.appServerCommandPath) === path.resolve(appServerCommand)) : void 0;
	const orderedCandidates = matchingCandidate ? [matchingCandidate, ...candidates.filter((candidate) => candidate !== matchingCandidate)] : candidates;
	return [...new Set(orderedCandidates.flatMap((candidate) => candidate.computerUseServiceAppPaths))];
}
function resolveFirstExistingMacOSDesktopCodexBundledMarketplacePath(params = {}) {
	const candidates = params.candidates ?? resolveMacOSDesktopCodexBundledMarketplaceCandidates(params.platform);
	const pathExists = params.pathExists ?? existsSync;
	return candidates.find((candidate) => pathExists(candidate));
}
//#endregion
//#region extensions/codex/src/app-server/version.ts
/**
* Version and package pins for the managed Codex app-server runtime.
*/
/** Exact Codex app-server version shipped by the OpenClaw Codex bridge. */
const CODEX_APP_SERVER_VERSION = "0.152.1";
/** Inclusive runtime compatibility floor for external app-server binaries. */
const MIN_SUPPORTED_CODEX_APP_SERVER_VERSION = "0.149.0";
/** npm package name for the managed Codex app-server binary. */
const MANAGED_CODEX_APP_SERVER_PACKAGE = "@openai/codex";
//#endregion
//#region extensions/codex/src/app-server/managed-binary.ts
/**
* Resolves the managed Codex app-server binary shipped with or installed beside
* the Codex plugin before stdio startup.
*/
const CODEX_PLUGIN_ROOT = resolveDefaultCodexPluginRoot(path.dirname(fileURLToPath(import.meta.url)));
let registeredCodexPluginRoot;
/** Records the process-stable plugin root prepared by OpenClaw's plugin loader. */
function setManagedCodexPluginRoot(pluginRoot) {
	registeredCodexPluginRoot = pluginRoot;
}
/** Rewrites managed stdio start options to point at an executable Codex binary path. */
async function resolveManagedCodexAppServerStartOptions(startOptions, options = {}) {
	if (startOptions.transport !== "stdio" || startOptions.commandSource !== "managed") return startOptions;
	const platform = options.platform ?? process.platform;
	const commandPaths = await findManagedCodexAppServerCommandPaths({
		candidateCommandPaths: resolveManagedCodexAppServerCommandCandidates(options.pluginRoot ?? registeredCodexPluginRoot ?? CODEX_PLUGIN_ROOT, platform, startOptions.managedCommandOrder ?? "package-first"),
		pathExists: options.pathExists ?? commandPathExists,
		platform
	});
	const commandPath = expectDefined(commandPaths[0], "resolved managed Codex command path");
	const managedFallbackCommandPaths = commandPaths.slice(1);
	return {
		...startOptions,
		command: commandPath,
		commandSource: "resolved-managed",
		...managedFallbackCommandPaths.length > 0 ? { managedFallbackCommandPaths } : {}
	};
}
/** Resolves the native artifact behind a successful managed launcher selection. */
function resolveManagedCodexNativeCommand(command, options = {}) {
	const platform = options.platform ?? process.platform;
	if (isManagedCodexDesktopCommand(command, platform)) return command;
	const target = resolveCodexNativeTarget(platform, options.arch ?? process.arch);
	if (!target) return;
	const packageRoot = resolveManagedCodexPackageRootForCommand(command, platform);
	if (!packageRoot) return;
	const resolvePackageJson = options.resolvePackageJson ?? resolvePackageJsonFromRoot;
	const pathExists = options.pathExists ?? existsSync;
	const packageJsonPath = resolvePackageJson(target.packageName, packageRoot) ?? resolvePackageJson("@openai/codex", packageRoot);
	if (!packageJsonPath) return;
	const candidate = path.join(path.dirname(packageJsonPath), "vendor", target.triple, "bin", platform === "win32" ? "codex.exe" : "codex");
	return pathExists(candidate) ? candidate : void 0;
}
/** Recognizes only the official npm entrypoint, not arbitrary configured wrappers. */
function resolvePackagedCodexNativeCommand(entrypoint) {
	const packageRoot = path.dirname(path.dirname(entrypoint));
	if (path.basename(packageRoot) !== "codex" || path.basename(path.dirname(packageRoot)) !== "@openai" || path.relative(packageRoot, entrypoint) !== path.join("bin", "codex.js")) return;
	return resolveManagedCodexNativeCommand(entrypoint);
}
/** Returns whether a command is one of the standard macOS desktop app executables. */
function isManagedCodexDesktopCommand(command, platform = process.platform) {
	return platform === "darwin" && resolveMacOSDesktopCodexAppServerCommandCandidates(platform).some((candidate) => candidate === command);
}
function resolveManagedCodexPackageRootForCommand(command, platform) {
	const pathApi = pathForPlatform(platform);
	const commandPaths = [command];
	try {
		commandPaths.unshift(realpathSync(command));
	} catch {}
	for (const commandPath of commandPaths) {
		let current = pathApi.dirname(commandPath);
		while (true) {
			if (pathApi.basename(current) === "codex" && pathApi.basename(pathApi.dirname(current)) === "@openai") return current;
			if (pathApi.basename(current) === ".bin") return pathApi.join(pathApi.dirname(current), "@openai", "codex");
			const parent = pathApi.dirname(current);
			if (parent === current) break;
			current = parent;
		}
	}
}
function resolveCodexNativeTarget(platform, arch) {
	if ((platform === "linux" || platform === "android") && arch === "x64") return {
		packageName: "@openai/codex-linux-x64",
		triple: "x86_64-unknown-linux-musl"
	};
	if ((platform === "linux" || platform === "android") && arch === "arm64") return {
		packageName: "@openai/codex-linux-arm64",
		triple: "aarch64-unknown-linux-musl"
	};
	if (platform === "darwin" && arch === "x64") return {
		packageName: "@openai/codex-darwin-x64",
		triple: "x86_64-apple-darwin"
	};
	if (platform === "darwin" && arch === "arm64") return {
		packageName: "@openai/codex-darwin-arm64",
		triple: "aarch64-apple-darwin"
	};
	if (platform === "win32" && arch === "x64") return {
		packageName: "@openai/codex-win32-x64",
		triple: "x86_64-pc-windows-msvc"
	};
	if (platform === "win32" && arch === "arm64") return {
		packageName: "@openai/codex-win32-arm64",
		triple: "aarch64-pc-windows-msvc"
	};
}
function resolvePackageJsonFromRoot(packageName, root) {
	try {
		const manifestPath = realpathSync(path.join(root, "package.json"));
		return createRequire(manifestPath).resolve(`${packageName}/package.json`);
	} catch {
		return;
	}
}
function resolveManagedCodexAppServerCommandCandidates(pluginRoot, platform, managedCommandOrder) {
	const pathApi = pathForPlatform(platform);
	const commandName = platform === "win32" ? "codex.cmd" : "codex";
	const roots = resolveManagedCodexAppServerCandidateRoots(pluginRoot, platform);
	const packageCommandPaths = [...roots.map((root) => pathApi.join(root, "node_modules", ".bin", commandName)), ...resolveManagedCodexPackageBinCandidates(roots, platform)];
	const desktopCommandPaths = resolveDesktopCodexAppServerCommandCandidates(platform);
	const orderedCommandPaths = managedCommandOrder === "desktop-first" ? [...desktopCommandPaths, ...packageCommandPaths] : [...packageCommandPaths, ...desktopCommandPaths];
	return [...new Set(orderedCommandPaths)];
}
function resolveDesktopCodexAppServerCommandCandidates(platform) {
	return resolveMacOSDesktopCodexAppServerCommandCandidates(platform);
}
function resolveDefaultCodexPluginRoot(moduleDir) {
	const moduleBaseName = path.basename(moduleDir);
	if (moduleBaseName === "dist" || moduleBaseName === "dist-runtime") return path.dirname(moduleDir);
	return path.resolve(moduleDir, "..", "..");
}
function resolveManagedCodexAppServerCandidateRoots(pluginRoot, platform) {
	const pathApi = pathForPlatform(platform);
	const directRoots = [
		pluginRoot,
		pathApi.dirname(pluginRoot),
		pathApi.dirname(pathApi.dirname(pluginRoot)),
		isDistExtensionRoot(pluginRoot, platform) ? pathApi.dirname(pathApi.dirname(pathApi.dirname(pluginRoot))) : null
	].filter((root) => Boolean(root));
	return [.../* @__PURE__ */ new Set([...directRoots, ...resolveNearestNodeModulesProjectRoots(directRoots, platform)])];
}
function resolveNearestNodeModulesProjectRoots(roots, platform) {
	const pathApi = pathForPlatform(platform);
	const projectRoots = [];
	for (const root of roots) {
		let current = pathApi.resolve(root);
		while (true) {
			if (pathApi.basename(current) === "node_modules") {
				projectRoots.push(pathApi.dirname(current));
				break;
			}
			const parent = pathApi.dirname(current);
			if (parent === current) break;
			current = parent;
		}
	}
	return projectRoots;
}
function resolveManagedCodexPackageBinCandidates(roots, platform) {
	if (platform === "win32") return [];
	const candidates = [];
	for (const root of roots) {
		const candidate = resolveManagedCodexPackageBinCandidate(root);
		if (candidate) candidates.push(candidate);
	}
	return candidates;
}
function resolveManagedCodexPackageBinCandidate(root) {
	try {
		const packageJsonPath = createRequire(path.join(root, "package.json")).resolve(`${MANAGED_CODEX_APP_SERVER_PACKAGE}/package.json`);
		const packageRoot = path.dirname(packageJsonPath);
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
		const packageBin = packageJson.bin && typeof packageJson.bin === "object" ? packageJson.bin : void 0;
		const binPath = typeof packageJson.bin === "string" ? packageJson.bin : typeof packageBin?.codex === "string" ? packageBin.codex : null;
		return binPath ? path.resolve(packageRoot, binPath) : null;
	} catch {
		return null;
	}
}
function isDistExtensionRoot(pluginRoot, platform) {
	const pathApi = pathForPlatform(platform);
	const extensionsDir = pathApi.dirname(pluginRoot);
	const distDir = pathApi.dirname(extensionsDir);
	return pathApi.basename(extensionsDir) === "extensions" && (pathApi.basename(distDir) === "dist" || pathApi.basename(distDir) === "dist-runtime");
}
function pathForPlatform(platform) {
	return platform === "win32" ? path.win32 : path.posix;
}
async function findManagedCodexAppServerCommandPaths(params) {
	const commandPaths = [];
	for (const commandPath of params.candidateCommandPaths) if (await params.pathExists(commandPath, params.platform)) commandPaths.push(commandPath);
	if (commandPaths.length > 0) return commandPaths;
	throw new Error([
		`Managed Codex app-server binary was not found for ${MANAGED_CODEX_APP_SERVER_PACKAGE}.`,
		"Reinstall or update OpenClaw, or run pnpm install in a source checkout.",
		"Set plugins.entries.codex.config.appServer.command or OPENCLAW_CODEX_APP_SERVER_BIN to use a custom Codex binary."
	].join(" "));
}
async function commandPathExists(filePath, platform) {
	try {
		await access(filePath, platform === "win32" ? constants.F_OK : constants.X_OK);
		return true;
	} catch {
		return false;
	}
}
//#endregion
export { setManagedCodexPluginRoot as a, resolveFirstExistingMacOSDesktopCodexBundledMarketplacePath as c, resolveMacOSDesktopCodexComputerUseServiceAppCandidates as d, resolvePackagedCodexNativeCommand as i, resolveMacOSDesktopCodexAppPathCandidates as l, resolveManagedCodexAppServerStartOptions as n, CODEX_APP_SERVER_VERSION as o, resolveManagedCodexNativeCommand as r, MIN_SUPPORTED_CODEX_APP_SERVER_VERSION as s, isManagedCodexDesktopCommand as t, resolveMacOSDesktopCodexBundledMarketplaceCandidates as u };
