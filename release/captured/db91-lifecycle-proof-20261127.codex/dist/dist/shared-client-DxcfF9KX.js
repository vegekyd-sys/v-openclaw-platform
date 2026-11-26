import { t as __exportAll } from "./rolldown-runtime-8H4AJuhK.js";
import { t as isCodexAppServerProxyLaunch } from "./launch-args-RXQwn8zV.js";
import { F as resolveCodexAppServerHomeDir, I as resolveCodexAppServerLocalHomeDir, L as resolveCodexAppServerUserHomeDir, R as withEphemeralCodexAuthStore, a as resolveCodexAppServerStartOptionsForAgent, i as resolveCodexAppServerRuntimeOptions, o as resolveCodexComputerUseConfig, t as codexAppServerStartOptionsKey } from "./config-BhmfC1s6.js";
import { c as resolveFirstExistingMacOSDesktopCodexBundledMarketplacePath, d as resolveMacOSDesktopCodexComputerUseServiceAppCandidates, l as resolveMacOSDesktopCodexAppPathCandidates, n as resolveManagedCodexAppServerStartOptions, o as CODEX_APP_SERVER_VERSION, r as resolveManagedCodexNativeCommand, s as MIN_SUPPORTED_CODEX_APP_SERVER_VERSION, t as isManagedCodexDesktopCommand, u as resolveMacOSDesktopCodexBundledMarketplaceCandidates } from "./managed-binary-4-Vjz5GH.js";
import { o as isCodexAppServerNativeAuthProfile } from "./session-binding-BHuTCRZQ.js";
import { a as hasCodexAppServerNaturalExit, i as closeCodexAppServerTransportAndWait, n as resolveCodexAppServerSpawnEnv, r as closeCodexAppServerTransport, t as createStdioTransport } from "./transport-stdio-CyPldczm.js";
import { isRecord, normalizeOptionalString } from "openclaw/plugin-sdk/string-coerce-runtime";
import fs from "node:fs/promises";
import path from "node:path";
import { createDeferred } from "openclaw/plugin-sdk/extension-shared";
import { addTimerTimeoutGraceMs, parseStrictNonNegativeInteger, resolveTimerTimeoutMs } from "openclaw/plugin-sdk/number-runtime";
import { AgentHarnessPreflightError, OPENCLAW_VERSION, embeddedAgentLog, formatErrorMessage, formatToolExecutionErrorMessage, normalizeQuestionTimeoutSeconds, resolveToolExecutionErrorKind } from "openclaw/plugin-sdk/agent-harness-runtime";
import { pruneMapToMaxSize } from "openclaw/plugin-sdk/collection-runtime";
import { createZstdDecompress } from "node:zlib";
import { root } from "openclaw/plugin-sdk/file-access-runtime";
import { createHash, randomUUID } from "node:crypto";
import fsSync, { constants as constants$1, existsSync, watch } from "node:fs";
import os from "node:os";
import { isDeepStrictEqual } from "node:util";
import { ensureAuthProfileStore, findPersistedAuthProfileCredential, loadAuthProfileStoreForSecretsRuntime, refreshOAuthCredentialForRuntime, resolveApiKeyForProfile, resolveDefaultAgentDir, resolvePersistedAuthProfileOwnerAgentDir, resolveProviderIdForAuth } from "openclaw/plugin-sdk/agent-runtime";
import { hasUsableOAuthCredential, resolveAuthProfileOrder, resolveOpenAICodexAuthIdentity } from "openclaw/plugin-sdk/provider-auth";
import { readSecretFile } from "openclaw/plugin-sdk/secret-file";
import { assertNoSymlinkParents, withTimeout } from "openclaw/plugin-sdk/security-runtime";
import { runExec } from "openclaw/plugin-sdk/process-runtime";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";
import { coerceErrorMessage, toStringifiedError } from "openclaw/plugin-sdk/error-runtime";
import { sliceUtf16Safe, truncateUtf16Safe } from "openclaw/plugin-sdk/text-utility-runtime";
import { parse } from "semver";
import { hasPendingInternalDiagnosticEvent } from "openclaw/plugin-sdk/diagnostic-runtime";
import { Compile } from "typebox/compile";
import net from "node:net";
import { PassThrough, Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import WebSocket from "ws";
//#region extensions/codex/src/app-server/protocol.ts
/** Namespace Codex keeps directly model-visible without exposing it to Code Mode guests. */
const CODEX_OPENCLAW_DIRECT_DYNAMIC_TOOL_NAMESPACE = "openclaw_direct";
function flattenCodexDynamicToolFunctions(tools) {
	return (tools ?? []).flatMap((tool) => tool.type === "namespace" ? tool.tools : [tool]);
}
const CODEX_INTERACTIVE_THREAD_SOURCE_KINDS = ["cli", "vscode"];
const CODEX_INTERACTIVE_CUSTOM_THREAD_SOURCES = ["atlas", "chatgpt"];
function isJsonObject(value) {
	return isRecord(value);
}
function isRpcResponse(message) {
	return "id" in message && !("method" in message);
}
//#endregion
//#region extensions/codex/src/session-catalog-provenance.ts
const MAX_SESSION_META_BYTES = 1048576;
const SESSION_META_READ_CHUNK_BYTES = 65536;
const MAX_PROVENANCE_CACHE_ENTRIES = 2e4;
const provenanceByPath = /* @__PURE__ */ new Map();
function cacheProvenance(key, value) {
	provenanceByPath.delete(key);
	provenanceByPath.set(key, value);
	while (provenanceByPath.size > MAX_PROVENANCE_CACHE_ENTRIES) {
		const oldest = provenanceByPath.keys().next().value;
		if (oldest === void 0) break;
		provenanceByPath.delete(oldest);
	}
}
/** Undefined means the metadata line is not durable enough to cache yet. */
async function readCodexSessionMeta(sessionsRoot, rolloutPath, threadId) {
	let safeRoot;
	try {
		safeRoot = await root(sessionsRoot, {
			hardlinks: "reject",
			maxBytes: Number.MAX_SAFE_INTEGER,
			symlinks: "reject"
		});
	} catch {
		return;
	}
	const candidates = rolloutPath.endsWith(".zst") ? [rolloutPath, rolloutPath.slice(0, -4)] : [rolloutPath, `${rolloutPath}.zst`];
	for (const candidate of candidates) {
		let opened;
		try {
			opened = await safeRoot.open(path.relative(sessionsRoot, candidate));
		} catch {
			continue;
		}
		const input = opened.handle.createReadStream({
			autoClose: false,
			highWaterMark: SESSION_META_READ_CHUNK_BYTES
		});
		const reader = candidate.endsWith(".zst") ? input.pipe(createZstdDecompress()) : input;
		try {
			const chunks = [];
			let bytesReadTotal = 0;
			let line;
			for await (const value of reader) {
				const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
				const remaining = MAX_SESSION_META_BYTES - bytesReadTotal;
				if (remaining <= 0) break;
				const bounded = chunk.subarray(0, remaining);
				bytesReadTotal += bounded.length;
				const newline = bounded.indexOf(10);
				chunks.push(newline >= 0 ? bounded.subarray(0, newline) : bounded);
				if (newline >= 0) {
					line = Buffer.concat(chunks).toString("utf8");
					break;
				}
			}
			if (!line) continue;
			let parsed;
			try {
				parsed = JSON.parse(line);
			} catch {
				continue;
			}
			if (!isJsonObject(parsed) || parsed.type !== "session_meta" || !isJsonObject(parsed.payload)) return null;
			const payload = parsed.payload;
			return payload.id === threadId ? payload : null;
		} catch {
			continue;
		} finally {
			reader.destroy();
			input.destroy();
			await opened.handle.close().catch(() => void 0);
		}
	}
}
/**
* Codex 0.147 reports OpenClaw app-server rollouts as `vscode`, so the rollout's
* immutable session metadata is the authoritative historical provenance.
*/
async function isOpenClawManagedCodexThread(thread, localSessionsRoot) {
	const rolloutPath = typeof thread.path === "string" ? thread.path.trim() : "";
	if (!localSessionsRoot || !rolloutPath) return false;
	const cacheKey = `${localSessionsRoot}\0${rolloutPath}`;
	const cached = provenanceByPath.get(cacheKey);
	if (cached !== void 0) return cached;
	const metadata = await readCodexSessionMeta(localSessionsRoot, rolloutPath, thread.id);
	const managed = metadata === void 0 ? void 0 : metadata?.originator === "openclaw";
	if (managed !== void 0) cacheProvenance(cacheKey, managed);
	return managed ?? false;
}
//#endregion
//#region extensions/codex/src/app-server/computer-use-service-path.ts
/** Filesystem ownership guards for isolated Computer Use service provisioning. */
async function assertOwnedServicePath(params) {
	await assertOwnedCodexHomePath({
		ownershipRoot: params.ownershipRoot,
		codexHome: params.codexHome,
		allowMissing: true
	});
	assertPathAtOrInside(params.ownershipRoot, params.targetParent, "Computer Use service parent");
	await assertNoSymlinkParents({
		rootDir: params.ownershipRoot,
		targetPath: params.targetParent,
		allowMissing: true,
		requireDirectories: true,
		messagePrefix: "Computer Use service path"
	});
	await assertNotSymlink(params.targetPath, "Computer Use service target");
}
async function ensureOwnedCodexHome(codexHomeInput, ownershipRootInput = path.dirname(path.resolve(codexHomeInput))) {
	const codexHome = path.resolve(codexHomeInput);
	const ownershipRoot = path.resolve(ownershipRootInput);
	await fs.mkdir(ownershipRoot, {
		recursive: true,
		mode: 448
	});
	await assertOwnedCodexHomePath({
		ownershipRoot,
		codexHome,
		allowMissing: true
	});
	await ensureRealDirectoryTree(ownershipRoot, codexHome, "isolated Codex home");
	await assertOwnedCodexHomePath({
		ownershipRoot,
		codexHome,
		allowMissing: false
	});
}
async function prepareOwnedServiceParent(params) {
	await ensureOwnedCodexHome(params.codexHome, params.ownershipRoot);
	await ensureRealDirectoryTree(params.ownershipRoot, params.targetParent, "Computer Use service parent");
	await assertNoSymlinkParents({
		rootDir: params.ownershipRoot,
		targetPath: params.targetParent,
		allowMissing: false,
		requireDirectories: true,
		messagePrefix: "Computer Use service path"
	});
	const [rootIdentity, parentIdentity] = await Promise.all([readRealDirectoryIdentity(params.ownershipRoot, "Computer Use ownership root"), readRealDirectoryIdentity(params.targetParent, "Computer Use service parent")]);
	assertPathAtOrInside(rootIdentity.realPath, parentIdentity.realPath, "canonical Computer Use service parent");
	return parentIdentity;
}
async function assertOwnedCodexHomePath(params) {
	await readRealDirectoryIdentity(params.ownershipRoot, "Computer Use ownership root");
	assertPathAtOrInside(params.ownershipRoot, params.codexHome, "isolated Codex home");
	await assertNoSymlinkParents({
		rootDir: params.ownershipRoot,
		targetPath: params.codexHome,
		allowMissing: params.allowMissing,
		requireDirectories: true,
		messagePrefix: "Computer Use service path"
	});
}
async function readRealDirectoryIdentity(directoryPath, label) {
	const logicalPath = path.resolve(directoryPath);
	const before = await fs.lstat(logicalPath);
	if (before.isSymbolicLink() || !before.isDirectory()) throw new Error(`${label} must be a real directory: ${logicalPath}`);
	const realPath = await fs.realpath(logicalPath);
	const [after, resolved] = await Promise.all([fs.lstat(logicalPath), fs.lstat(realPath)]);
	if (after.isSymbolicLink() || !after.isDirectory() || !resolved.isDirectory() || before.dev !== after.dev || before.ino !== after.ino || after.dev !== resolved.dev || after.ino !== resolved.ino) throw new Error(`${label} changed while its ownership boundary was being established.`);
	return {
		logicalPath,
		realPath,
		dev: after.dev,
		ino: after.ino
	};
}
async function assertOwnedServiceParentStable(parent) {
	await assertDirectoryIdentityStable(parent, "Computer Use service parent");
}
async function assertDirectoryIdentityStable(expected, label) {
	if (!await directoryIdentityIsStable(expected)) throw new Error(`${label} changed during refresh; refusing to mutate the replacement path.`);
}
async function ownedServiceParentIsStable(parent) {
	return await directoryIdentityIsStable(parent);
}
async function directoryIdentityIsStable(expected) {
	try {
		const current = await fs.lstat(expected.logicalPath);
		if (current.isSymbolicLink() || !current.isDirectory() || current.dev !== expected.dev || current.ino !== expected.ino) return false;
		return await fs.realpath(expected.logicalPath) === expected.realPath;
	} catch {
		return false;
	}
}
async function assertNotSymlink(filePath, label) {
	try {
		if ((await fs.lstat(filePath)).isSymbolicLink()) throw new Error(`${label} must not be a symbolic link: ${filePath}`);
	} catch (error) {
		if (hasNodeErrorCode$1(error, "ENOENT")) return;
		throw error;
	}
}
async function ensureRealDirectoryTree(ownershipRoot, directoryPath, label) {
	const root = path.resolve(ownershipRoot);
	const target = path.resolve(directoryPath);
	assertPathAtOrInside(root, target, label);
	const relative = path.relative(root, target);
	let current = root;
	for (const segment of relative.split(path.sep).filter(Boolean)) {
		current = path.join(current, segment);
		const existing = await fs.lstat(current).catch((error) => {
			if (hasNodeErrorCode$1(error, "ENOENT")) return;
			throw error;
		});
		if (!existing) {
			try {
				await fs.mkdir(current, { mode: 448 });
			} catch (error) {
				if (!hasNodeErrorCode$1(error, "EEXIST")) throw error;
			}
			const created = await fs.lstat(current);
			if (created.isSymbolicLink() || !created.isDirectory()) throw new Error(`${label} changed while its directory tree was being created: ${current}`);
		} else if (existing.isSymbolicLink() || !existing.isDirectory()) throw new Error(`${label} must traverse real directories: ${current}`);
	}
	await assertNoSymlinkParents({
		rootDir: root,
		targetPath: target,
		allowMissing: false,
		requireDirectories: true,
		messagePrefix: "Computer Use service path"
	});
	await readRealDirectoryIdentity(target, label);
}
function assertPathAtOrInside(rootPath, candidatePath, label) {
	const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
	if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`${label} must remain inside ${path.resolve(rootPath)}.`);
}
function hasNodeErrorCode$1(error, code) {
	return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
//#endregion
//#region extensions/codex/src/app-server/computer-use-cache.ts
/** Shared Computer Use plugin cache reconciliation for isolated Codex homes. */
const DEFAULT_CODEX_COMPUTER_USE_BUNDLED_MARKETPLACE_PATH = resolveMacOSDesktopCodexBundledMarketplaceCandidates("darwin")[0] ?? "";
const DEFAULT_BUNDLED_MARKETPLACE_NAME = "openai-bundled";
async function ensureCodexComputerUseSharedPluginCache(params) {
	if (!params.config.enabled) return skippedCacheResult("disabled", "Computer Use cache sharing skipped because it is disabled.");
	if (params.config.pluginCacheMode === "independent") return skippedCacheResult("independent", "Computer Use cache sharing skipped because pluginCacheMode is independent.");
	if (params.config.marketplaceName || params.config.marketplacePath) return skippedCacheResult("explicit_marketplace", "Computer Use cache sharing skipped because an explicit marketplace is configured.");
	const bundledMarketplacePath = resolveComputerUseBundledMarketplacePath(params);
	const sourcePluginRoot = path.join(bundledMarketplacePath, "plugins", params.config.pluginName);
	const version = await readBundledPluginVersion(sourcePluginRoot);
	if (!version) return skippedCacheResult("source_missing", `Computer Use bundled plugin source was not found at ${sourcePluginRoot}.`);
	const marketplaceName = params.config.marketplaceName ?? DEFAULT_BUNDLED_MARKETPLACE_NAME;
	const cacheRoot = path.join(params.codexHome, "plugins", "cache", marketplaceName, params.config.pluginName);
	const cachePath = path.join(cacheRoot, version);
	return {
		status: "shared",
		changed: await ensureRealDirectoryCopy(cachePath, sourcePluginRoot, version, {
			codexHome: params.codexHome,
			ownershipRoot: params.ownershipRoot,
			assertCurrent: params.assertCurrent,
			forceRefresh: params.forceRefresh
		}),
		cachePath,
		targetPath: sourcePluginRoot,
		version,
		removedStaleVersions: [],
		warnings: [],
		message: `Computer Use plugin cache ${cachePath} contains bundled plugin ${sourcePluginRoot}.`
	};
}
function resolveComputerUseBundledMarketplacePath(params) {
	return params.bundledMarketplacePath ?? resolveFirstExistingMacOSDesktopCodexBundledMarketplacePath({ candidates: params.bundledMarketplacePathCandidates }) ?? params.bundledMarketplacePathCandidates?.[0] ?? DEFAULT_CODEX_COMPUTER_USE_BUNDLED_MARKETPLACE_PATH;
}
async function readBundledPluginVersion(sourcePluginRoot) {
	const pluginJsonPath = path.join(sourcePluginRoot, ".codex-plugin", "plugin.json");
	let raw;
	try {
		raw = await fs.readFile(pluginJsonPath, "utf8");
	} catch {
		return;
	}
	try {
		const parsed = JSON.parse(raw);
		return typeof parsed.version === "string" && parsed.version.trim() ? parsed.version.trim() : void 0;
	} catch {
		return;
	}
}
async function ensureRealDirectoryCopy(cachePath, sourcePluginRoot, version, boundary) {
	const cacheRoot = path.dirname(cachePath);
	const ownedParent = boundary.ownershipRoot ? await prepareOwnedServiceParent({
		ownershipRoot: boundary.ownershipRoot,
		codexHome: boundary.codexHome,
		targetParent: cacheRoot
	}) : void 0;
	if (!ownedParent) await fs.mkdir(cacheRoot, { recursive: true });
	const physicalCachePath = ownedParent ? path.join(ownedParent.realPath, path.basename(cachePath)) : cachePath;
	const stat = await fs.lstat(physicalCachePath).catch(() => void 0);
	if (stat?.isDirectory() && !stat.isSymbolicLink()) {
		if (await readBundledPluginVersion(physicalCachePath) === version && !boundary.forceRefresh) return false;
	}
	const cacheName = path.basename(cachePath);
	const physicalCacheRoot = path.dirname(physicalCachePath);
	const stagingRoot = await fs.mkdtemp(path.join(physicalCacheRoot, `.${cacheName}.staging-`));
	const stagedPath = path.join(stagingRoot, cacheName);
	const backupPath = path.join(physicalCacheRoot, `.${cacheName}.backup-${process.pid}-${Date.now()}`);
	let backupCreated = false;
	try {
		await fs.cp(sourcePluginRoot, stagedPath, { recursive: true });
		if (ownedParent) await assertDirectoryIdentityStable(ownedParent, "Computer Use plugin cache parent");
		if (stat) {
			boundary.assertCurrent?.();
			await fs.rename(physicalCachePath, backupPath);
			backupCreated = true;
		}
		try {
			if (ownedParent) await assertDirectoryIdentityStable(ownedParent, "Computer Use plugin cache parent");
			boundary.assertCurrent?.();
			await fs.rename(stagedPath, physicalCachePath);
		} catch (error) {
			if (backupCreated) try {
				if (ownedParent) await assertDirectoryIdentityStable(ownedParent, "Computer Use plugin cache parent");
				await fs.rename(backupPath, physicalCachePath);
				backupCreated = false;
			} catch (restoreError) {
				throw new Error(`Failed to install Computer Use cache ${cachePath} and restore its prior copy: ${String(error)}`, { cause: restoreError });
			}
			throw error;
		}
		if (backupCreated) {
			if (ownedParent) await assertDirectoryIdentityStable(ownedParent, "Computer Use plugin cache parent");
			await fs.rm(backupPath, {
				recursive: true,
				force: true
			});
		}
		return true;
	} finally {
		if (!ownedParent || await directoryIdentityIsStable(ownedParent)) await fs.rm(stagingRoot, {
			recursive: true,
			force: true
		});
	}
}
function skippedCacheResult(status, message) {
	return {
		status,
		changed: false,
		message,
		removedStaleVersions: [],
		warnings: status === "source_missing" ? [message] : []
	};
}
//#endregion
//#region extensions/codex/src/app-server/computer-use-marketplace.ts
/** Managed local wrapper for Codex's reserved bundled marketplace. */
const MARKETPLACE_NAME = "openai-bundled";
const activeInstalls$1 = /* @__PURE__ */ new Map();
function resolveCodexManagedBundledMarketplacePath(codexHome) {
	return path.join(codexHome, ".tmp", "bundled-marketplaces", MARKETPLACE_NAME);
}
async function ensureCodexManagedBundledMarketplace(params) {
	const candidates = params.candidates ?? resolveMacOSDesktopCodexAppPathCandidates();
	const source = await resolveCodexManagedBundledMarketplaceSource({
		...params,
		candidates
	});
	if (!source) return;
	const parentPath = path.dirname(resolveCodexManagedBundledMarketplacePath(params.codexHome));
	const targetPath = path.join(parentPath, MARKETPLACE_NAME);
	const parent = await prepareOwnedServiceParent({
		ownershipRoot: params.ownershipRoot,
		codexHome: params.codexHome,
		targetParent: parentPath
	});
	const physicalTargetPath = path.join(parent.realPath, MARKETPLACE_NAME);
	await assertNotSymlink(physicalTargetPath, "managed bundled marketplace");
	const active = activeInstalls$1.get(physicalTargetPath);
	if (active) {
		if (active.sourcePath === source.bundledMarketplacePath) return await active.promise;
		await active.promise.catch(() => void 0);
		return await ensureCodexManagedBundledMarketplace(params);
	}
	const install = reconcileManagedWrapper({
		parent,
		physicalTargetPath,
		targetPath,
		source,
		ownershipCandidates: params.ownershipCandidates ?? candidates,
		assertCurrent: params.assertCurrent
	});
	const activeEntry = {
		sourcePath: source.bundledMarketplacePath,
		promise: install
	};
	activeInstalls$1.set(physicalTargetPath, activeEntry);
	const clearActive = () => {
		if (activeInstalls$1.get(physicalTargetPath) === activeEntry) activeInstalls$1.delete(physicalTargetPath);
	};
	install.then(clearActive, clearActive);
	return await install;
}
async function reconcileManagedWrapper(params) {
	if (await wrapperMatches(params.physicalTargetPath, params.source.bundledMarketplacePath)) return params.targetPath;
	return await publishManagedWrapper(params);
}
async function publishManagedWrapper(params) {
	const { parent, physicalTargetPath, targetPath, source, ownershipCandidates, assertCurrent } = params;
	const stagingPath = await fs.mkdtemp(path.join(parent.realPath, `.${MARKETPLACE_NAME}.staging-`));
	const backupPath = path.join(parent.realPath, `.${MARKETPLACE_NAME}.backup-${process.pid}-${Date.now()}`);
	let backupCreated = false;
	try {
		const manifestParent = path.join(stagingPath, ".agents", "plugins");
		await fs.mkdir(manifestParent, {
			recursive: true,
			mode: 448
		});
		await Promise.all([fs.symlink(path.join(source.bundledMarketplacePath, ".agents", "plugins", "marketplace.json"), path.join(manifestParent, "marketplace.json")), fs.symlink(path.join(source.bundledMarketplacePath, "plugins"), path.join(stagingPath, "plugins"))]);
		await assertDirectoryIdentityStable(parent, "managed bundled marketplace parent");
		const existing = await fs.lstat(physicalTargetPath).catch((error) => {
			if (hasNodeErrorCode(error, "ENOENT")) return;
			throw error;
		});
		if (existing && !existing.isDirectory()) throw new Error(`Managed bundled marketplace must be a real directory: ${targetPath}`);
		if (existing && !await wrapperMatchesAnySource(physicalTargetPath, ownershipCandidates)) throw new Error(`Refusing to replace an unowned bundled marketplace directory: ${targetPath}`);
		if (existing) {
			assertCurrent?.();
			await fs.rename(physicalTargetPath, backupPath);
			backupCreated = true;
			await assertDirectoryIdentityStable(parent, "managed bundled marketplace parent");
		}
		assertCurrent?.();
		await fs.rename(stagingPath, physicalTargetPath);
		await assertDirectoryIdentityStable(parent, "managed bundled marketplace parent");
		if (backupCreated) {
			await fs.rm(backupPath, { recursive: true });
			backupCreated = false;
		}
		return targetPath;
	} catch (error) {
		if (backupCreated) try {
			await assertDirectoryIdentityStable(parent, "managed bundled marketplace parent");
			if (await fs.lstat(physicalTargetPath).catch(() => void 0)) {
				if (!await wrapperMatches(physicalTargetPath, source.bundledMarketplacePath)) throw new Error("managed bundled marketplace replacement is no longer owned", { cause: error });
				await fs.rm(physicalTargetPath, { recursive: true });
			}
			await fs.rename(backupPath, physicalTargetPath);
			backupCreated = false;
		} catch (restoreError) {
			throw new Error(`Failed to restore the prior managed bundled marketplace: ${String(error)}`, { cause: restoreError });
		}
		throw error;
	} finally {
		if (await directoryIdentityIsStable(parent)) await fs.rm(stagingPath, {
			recursive: true,
			force: true
		});
	}
}
async function resolveCodexManagedBundledMarketplaceSource(params) {
	const candidates = params.candidates ?? resolveMacOSDesktopCodexAppPathCandidates();
	const command = params.appServerCommand && path.resolve(params.appServerCommand);
	const ordered = command ? candidates.filter((candidate) => path.resolve(candidate.appServerCommandPath) === command) : candidates;
	for (const candidate of ordered) if (await isExpectedMarketplace(candidate.bundledMarketplacePath)) return candidate;
}
async function isExpectedMarketplace(root) {
	try {
		const manifest = JSON.parse(await fs.readFile(path.join(root, ".agents", "plugins", "marketplace.json"), "utf8"));
		await fs.access(path.join(root, "plugins", "computer-use", ".codex-plugin", "plugin.json"));
		return isRecord(manifest) && manifest.name === MARKETPLACE_NAME && Array.isArray(manifest.plugins) && manifest.plugins.some((plugin) => isRecord(plugin) && plugin.name === "computer-use");
	} catch {
		return false;
	}
}
async function wrapperMatches(targetPath, sourcePath) {
	try {
		const target = await fs.lstat(targetPath);
		if (!target.isDirectory() || target.isSymbolicLink()) return false;
		const [manifest, plugins] = await Promise.all([fs.readlink(path.join(targetPath, ".agents", "plugins", "marketplace.json")), fs.readlink(path.join(targetPath, "plugins"))]);
		return manifest === path.join(sourcePath, ".agents", "plugins", "marketplace.json") && plugins === path.join(sourcePath, "plugins");
	} catch {
		return false;
	}
}
async function wrapperMatchesAnySource(targetPath, candidates) {
	for (const candidate of candidates) if (await wrapperMatches(targetPath, candidate.bundledMarketplacePath)) return true;
	return false;
}
function hasNodeErrorCode(error, code) {
	return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
//#endregion
//#region extensions/codex/src/app-server/computer-use-service.ts
/** Native Computer Use service provisioning for isolated Codex homes. */
const SERVICE_APP_NAME = "Codex Computer Use.app";
const SERVICE_BUNDLE_ID = "com.openai.sky.CUAService";
const CLIENT_BUNDLE_ID = "com.openai.sky.CUAService.cli";
const OPENAI_TEAM_ID = "2DC432GLL2";
const CLIENT_APP_RELATIVE_PATH = path.join("Contents", "SharedSupport", "SkyComputerUseClient.app");
const CLIENT_RELATIVE_PATH = path.join(CLIENT_APP_RELATIVE_PATH, "Contents", "MacOS", "SkyComputerUseClient");
const COPY_TIMEOUT_MS = 12e4;
const INSPECT_TIMEOUT_MS = 3e4;
const activeInstalls = /* @__PURE__ */ new Map();
/** Finds the first signed native service from one ordered desktop owner set. */
async function resolveCodexComputerUseServiceAppSourcePath(params) {
	const platform = params.platform ?? process.platform;
	if (platform !== "darwin") return;
	return (await findUsableServiceApp(params.sourceAppCandidates ?? resolveMacOSDesktopCodexComputerUseServiceAppCandidates(platform, params.appServerCommand), params.inspectServiceApp ?? inspectTrustedServiceApp))?.path;
}
/** Synchronizes the CODEX_HOME native client with the selected signed desktop distribution. */
async function ensureCodexComputerUseServiceApp(params) {
	const platform = params.platform ?? process.platform;
	if (platform !== "darwin") return {
		status: "unsupported",
		changed: false
	};
	const codexHome = path.resolve(params.codexHome);
	const ownershipRoot = path.resolve(params.ownershipRoot ?? path.dirname(codexHome));
	const targetParent = path.join(codexHome, "computer-use");
	const targetPath = path.join(targetParent, SERVICE_APP_NAME);
	await ensureOwnedCodexHome(codexHome, ownershipRoot);
	await assertOwnedServicePath({
		ownershipRoot,
		codexHome,
		targetParent,
		targetPath
	});
	const candidates = params.sourceAppCandidates ?? resolveMacOSDesktopCodexComputerUseServiceAppCandidates(platform, params.appServerCommand);
	const syncKey = [targetPath, ...candidates].join("\0");
	const active = activeInstalls.get(targetPath);
	if (active) {
		if (active.syncKey === syncKey) return await active.promise;
		await active.promise.catch(() => void 0);
		return await ensureCodexComputerUseServiceApp(params);
	}
	const install = ensureCodexComputerUseServiceAppOnce({
		...params,
		codexHome,
		ownershipRoot,
		targetParent,
		targetPath,
		platform,
		sourceAppCandidates: candidates
	});
	const activeEntry = {
		syncKey,
		promise: install
	};
	activeInstalls.set(targetPath, activeEntry);
	const clearActive = () => {
		if (activeInstalls.get(targetPath) === activeEntry) activeInstalls.delete(targetPath);
	};
	install.then(clearActive, clearActive);
	return await install;
}
async function ensureCodexComputerUseServiceAppOnce(params) {
	const inspectServiceApp = params.inspectServiceApp ?? inspectTrustedServiceApp;
	const source = await findUsableServiceApp(params.sourceAppCandidates ?? [], inspectServiceApp);
	if (!source) return {
		status: "source_missing",
		changed: false,
		targetPath: params.targetPath
	};
	const { path: sourcePath, identity: sourceIdentity } = source;
	const ownedParent = await prepareOwnedServiceParent({
		ownershipRoot: params.ownershipRoot,
		codexHome: params.codexHome,
		targetParent: params.targetParent
	});
	const operationTargetPath = path.join(ownedParent.realPath, SERVICE_APP_NAME);
	await assertNotSymlink(operationTargetPath, "Computer Use service target");
	const initialTarget = await readServiceAppSnapshot(operationTargetPath, inspectServiceApp);
	if (initialTarget.identity && identitiesMatch(initialTarget.identity, sourceIdentity)) return {
		status: "already_current",
		changed: false,
		targetPath: params.targetPath,
		sourcePath,
		sourceBuild: sourceIdentity.build
	};
	await assertOwnedServiceParentStable(ownedParent);
	const stagingRoot = await fs.mkdtemp(path.join(ownedParent.realPath, ".service-app.staging-"));
	const stagingRootIdentity = await readRealDirectoryIdentity(stagingRoot, "Computer Use service staging directory");
	const stagedPath = path.join(stagingRoot, SERVICE_APP_NAME);
	const backupPath = path.join(ownedParent.realPath, `.service-app.backup-${process.pid}-${Date.now()}`);
	let backupCreated = false;
	try {
		await (params.copyServiceApp ?? copyServiceAppWithDitto)(sourcePath, stagedPath);
		await assertOwnedServiceParentStable(ownedParent);
		await assertDirectoryIdentityStable(stagingRootIdentity, "Computer Use service staging directory");
		await assertNotSymlink(stagedPath, "Copied Computer Use service app");
		const stagedIdentity = await inspectServiceApp(stagedPath);
		if (!stagedIdentity || !identitiesMatch(stagedIdentity, sourceIdentity)) throw new Error(`Copied Computer Use service app at ${stagedPath} does not match its selected signed source.`);
		const stagedSnapshot = await readServiceAppSnapshot(stagedPath, inspectServiceApp);
		const currentSourceIdentity = await inspectServiceApp(sourcePath);
		await assertOwnedServiceParentStable(ownedParent);
		if (!currentSourceIdentity || !identitiesMatch(currentSourceIdentity, sourceIdentity)) throw new Error("Selected Computer Use service source changed during refresh.");
		await assertNotSymlink(operationTargetPath, "Computer Use service target");
		if (await pathExists$1(operationTargetPath)) {
			await assertOwnedServiceParentStable(ownedParent);
			params.assertCurrent?.();
			await fs.rename(operationTargetPath, backupPath);
			await assertOwnedServiceParentStable(ownedParent);
			backupCreated = true;
			const movedTarget = await readServiceAppSnapshot(backupPath, inspectServiceApp);
			if (movedTarget.identity && identitiesMatch(movedTarget.identity, sourceIdentity)) {
				await assertOwnedServiceParentStable(ownedParent);
				await fs.rename(backupPath, operationTargetPath);
				await assertOwnedServiceParentStable(ownedParent);
				backupCreated = false;
				return {
					status: "already_current",
					changed: false,
					targetPath: params.targetPath,
					sourcePath,
					sourceBuild: sourceIdentity.build
				};
			}
			if (!snapshotsMatch(initialTarget, movedTarget)) {
				await assertOwnedServiceParentStable(ownedParent);
				await fs.rename(backupPath, operationTargetPath);
				await assertOwnedServiceParentStable(ownedParent);
				backupCreated = false;
				throw new Error("Computer Use service target changed to an unexpected generation during refresh.");
			}
		}
		try {
			await assertOwnedServiceParentStable(ownedParent);
			params.assertCurrent?.();
			await fs.rename(stagedPath, operationTargetPath);
			await assertOwnedServiceParentStable(ownedParent);
		} catch (error) {
			await assertOwnedServiceParentStable(ownedParent);
			await assertNotSymlink(operationTargetPath, "Computer Use service target");
			const winnerIdentity = await inspectServiceApp(operationTargetPath);
			if (!winnerIdentity || !identitiesMatch(winnerIdentity, sourceIdentity)) {
				if (backupCreated) {
					if (!await pathExists$1(operationTargetPath)) {
						await assertOwnedServiceParentStable(ownedParent);
						await fs.rename(backupPath, operationTargetPath);
						await assertOwnedServiceParentStable(ownedParent);
						backupCreated = false;
					}
				}
				throw error;
			}
			if (backupCreated) {
				await assertOwnedServiceParentStable(ownedParent);
				await assertNotSymlink(backupPath, "Computer Use service backup");
				await fs.rm(backupPath, {
					recursive: true,
					force: true
				});
				await assertOwnedServiceParentStable(ownedParent);
				backupCreated = false;
			}
			return {
				status: "already_current",
				changed: false,
				targetPath: params.targetPath,
				sourcePath,
				sourceBuild: sourceIdentity.build
			};
		}
		await assertNotSymlink(operationTargetPath, "Installed Computer Use service app");
		const installedSnapshot = await readServiceAppSnapshot(operationTargetPath, inspectServiceApp);
		if (!installedSnapshot.identity || !identitiesMatch(installedSnapshot.identity, sourceIdentity)) {
			if (filesystemSnapshotsMatch(installedSnapshot, stagedSnapshot)) {
				await assertOwnedServiceParentStable(ownedParent);
				await fs.rm(operationTargetPath, {
					recursive: true,
					force: true
				});
				await assertOwnedServiceParentStable(ownedParent);
				if (backupCreated) {
					await fs.rename(backupPath, operationTargetPath);
					await assertOwnedServiceParentStable(ownedParent);
					backupCreated = false;
				}
			}
			throw new Error("Installed Computer Use service app failed post-install identity verification.");
		}
		if (backupCreated) {
			await assertOwnedServiceParentStable(ownedParent);
			await assertNotSymlink(backupPath, "Computer Use service backup");
			await fs.rm(backupPath, {
				recursive: true,
				force: true
			});
			await assertOwnedServiceParentStable(ownedParent);
			backupCreated = false;
		}
		return {
			status: initialTarget.exists ? "refreshed" : "installed",
			changed: true,
			targetPath: params.targetPath,
			sourcePath,
			sourceBuild: sourceIdentity.build,
			...initialTarget.identity ? { previousBuild: initialTarget.identity.build } : {}
		};
	} catch (error) {
		if (backupCreated && await ownedServiceParentIsStable(ownedParent) && !await pathExists$1(operationTargetPath)) {
			await assertOwnedServiceParentStable(ownedParent);
			await fs.rename(backupPath, operationTargetPath);
			backupCreated = false;
		}
		throw error;
	} finally {
		if (await ownedServiceParentIsStable(ownedParent) && await directoryIdentityIsStable(stagingRootIdentity)) await fs.rm(stagingRoot, {
			recursive: true,
			force: true
		});
	}
}
async function pathExists$1(filePath) {
	return await fs.lstat(filePath).then(() => true, () => false);
}
async function findUsableServiceApp(candidates, inspectServiceApp) {
	for (const candidate of candidates) {
		const identity = await inspectServiceApp(candidate);
		if (identity) return {
			path: candidate,
			identity
		};
	}
}
async function readServiceAppSnapshot(appPath, inspectServiceApp) {
	if (!await pathExists$1(appPath)) return { exists: false };
	return {
		exists: true,
		identity: await inspectServiceApp(appPath),
		filesystemKey: await readServiceAppFilesystemKey(appPath)
	};
}
async function readServiceAppFilesystemKey(appPath) {
	const paths = [
		appPath,
		path.join(appPath, "Contents", "Info.plist"),
		path.join(appPath, CLIENT_RELATIVE_PATH)
	];
	return (await Promise.all(paths.map(async (entryPath) => await fs.stat(entryPath).then((stat) => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`, () => "missing")))).join("|");
}
function snapshotsMatch(left, right) {
	if (left.exists !== right.exists) return false;
	if (!left.exists) return true;
	if (left.filesystemKey && right.filesystemKey && left.filesystemKey !== right.filesystemKey) return false;
	if (left.identity || right.identity) return Boolean(left.identity && right.identity && identitiesMatch(left.identity, right.identity));
	return left.filesystemKey !== void 0 && left.filesystemKey === right.filesystemKey;
}
function filesystemSnapshotsMatch(left, right) {
	return Boolean(left.exists && right.exists && left.filesystemKey && right.filesystemKey && left.filesystemKey === right.filesystemKey);
}
function identitiesMatch(left, right) {
	return left.bundleId === right.bundleId && left.version === right.version && left.build === right.build && left.cdHash === right.cdHash && left.teamId === right.teamId && left.clientBundleId === right.clientBundleId && left.clientCdHash === right.clientCdHash && left.clientTeamId === right.clientTeamId;
}
async function hasExecutableClient(appPath) {
	try {
		await fs.access(path.join(appPath, CLIENT_RELATIVE_PATH), constants$1.X_OK);
		return true;
	} catch {
		return false;
	}
}
async function inspectTrustedServiceApp(appPath) {
	if (!await hasExecutableClient(appPath)) return;
	const clientAppPath = path.join(appPath, CLIENT_APP_RELATIVE_PATH);
	try {
		await verifyTrustedBundle(appPath, SERVICE_BUNDLE_ID, true);
		await verifyTrustedBundle(clientAppPath, CLIENT_BUNDLE_ID, false);
		const [info, serviceSignature, clientSignature] = await Promise.all([
			readBundleInfo(appPath),
			readCodeSignature(appPath),
			readCodeSignature(clientAppPath)
		]);
		if (!info || serviceSignature.identifier !== SERVICE_BUNDLE_ID || serviceSignature.teamId !== OPENAI_TEAM_ID || clientSignature.identifier !== CLIENT_BUNDLE_ID || clientSignature.teamId !== OPENAI_TEAM_ID) return;
		return {
			bundleId: serviceSignature.identifier,
			version: info.version,
			build: info.build,
			cdHash: serviceSignature.cdHash,
			teamId: serviceSignature.teamId,
			clientBundleId: clientSignature.identifier,
			clientCdHash: clientSignature.cdHash,
			clientTeamId: clientSignature.teamId
		};
	} catch {
		return;
	}
}
async function verifyTrustedBundle(appPath, bundleId, deep) {
	const requirement = `anchor apple generic and certificate leaf[subject.OU] = "${OPENAI_TEAM_ID}" and identifier "${bundleId}"`;
	await runExec("/usr/bin/codesign", [
		"--verify",
		"--strict",
		...deep ? ["--deep"] : [],
		`-R=${requirement}`,
		appPath
	], {
		logOutput: false,
		timeoutMs: INSPECT_TIMEOUT_MS
	});
}
async function readBundleInfo(appPath) {
	const result = await runExec("/usr/bin/plutil", [
		"-convert",
		"json",
		"-o",
		"-",
		"--",
		path.join(appPath, "Contents", "Info.plist")
	], {
		logOutput: false,
		timeoutMs: INSPECT_TIMEOUT_MS
	});
	const parsed = JSON.parse(result.stdout);
	if (!isRecord(parsed)) return;
	const version = parsed.CFBundleShortVersionString;
	const build = parsed.CFBundleVersion;
	return typeof version === "string" && version && typeof build === "string" && build ? {
		version,
		build
	} : void 0;
}
async function readCodeSignature(appPath) {
	const result = await runExec("/usr/bin/codesign", [
		"-d",
		"--verbose=4",
		appPath
	], {
		logOutput: false,
		timeoutMs: INSPECT_TIMEOUT_MS
	});
	const output = `${result.stdout}\n${result.stderr}`;
	const identifier = readCodeSignField(output, "Identifier");
	const teamId = readCodeSignField(output, "TeamIdentifier");
	const cdHash = readCodeSignField(output, "CDHash").toLowerCase();
	if (!identifier || !teamId || !/^[a-f0-9]+$/.test(cdHash)) throw new Error(`Could not inspect the signed identity at ${appPath}.`);
	return {
		identifier,
		teamId,
		cdHash
	};
}
function readCodeSignField(output, field) {
	const prefix = `${field}=`;
	return output.split(/\r?\n/u).find((candidate) => candidate.startsWith(prefix))?.slice(prefix.length).trim() ?? "";
}
async function copyServiceAppWithDitto(sourcePath, targetPath) {
	await runExec("/usr/bin/ditto", [
		"--noqtn",
		sourcePath,
		targetPath
	], {
		logOutput: false,
		timeoutMs: COPY_TIMEOUT_MS
	});
}
//#endregion
//#region extensions/codex/src/app-server/auth-bridge.ts
const CODEX_APP_SERVER_AUTH_PROVIDER = "openai";
const CODEX_APP_SERVER_EXTERNAL_CLI_PROVIDER_IDS = [CODEX_APP_SERVER_AUTH_PROVIDER];
const OPENAI_CODEX_DEFAULT_PROFILE_ID = "openai:default";
const CODEX_HOME_ENV_VAR = "CODEX_HOME";
const HOME_ENV_VAR = "HOME";
const CODEX_API_KEY_ENV_VAR = "CODEX_API_KEY";
const OPENAI_API_KEY_ENV_VAR = "OPENAI_API_KEY";
const CODEX_ACCESS_TOKEN_ENV_VAR = "CODEX_ACCESS_TOKEN";
const CODEX_APP_SERVER_API_KEY_ENV_VARS = [CODEX_API_KEY_ENV_VAR, OPENAI_API_KEY_ENV_VAR];
const CODEX_APP_SERVER_PREPARED_AUTH_ENV_VARS = [
	CODEX_API_KEY_ENV_VAR,
	OPENAI_API_KEY_ENV_VAR,
	CODEX_ACCESS_TOKEN_ENV_VAR
];
const CODEX_APP_SERVER_HOME_ENV_VARS = [CODEX_HOME_ENV_VAR, HOME_ENV_VAR];
const CODEX_AUTH_JSON_FILENAME = "auth.json";
const CODEX_HOME_DIRNAME = ".codex";
const MAX_COMPUTER_USE_ARTIFACT_OWNERS = 128;
const activeComputerUseArtifactReconciliations = /* @__PURE__ */ new Map();
const scopedOAuthRefreshQueues = /* @__PURE__ */ new WeakMap();
async function bridgeCodexAppServerStartOptions(params) {
	if (params.startOptions.transport !== "stdio") return params.startOptions;
	const scopeStartOptions = () => withCodexHomeEnvironment(withEphemeralCodexAuthStore(params), params.agentDir);
	if (params.preparedAuth) return withClearedEnvironmentVariables(await scopeStartOptions(), CODEX_APP_SERVER_PREPARED_AUTH_ENV_VARS);
	if (params.authProfileId === null) return scopeStartOptions();
	const store = resolveCodexAppServerAuthProfileStore({
		agentDir: params.agentDir,
		authProfileId: params.authProfileId,
		authProfileStore: params.authProfileStore,
		config: params.config
	});
	const authProfileId = resolveCodexAppServerAuthProfileId({
		authProfileId: params.authProfileId,
		store,
		config: params.config
	});
	if (!authProfileId) assertNoUnimportedAgentCodexAuthFile(params);
	const scopedStartOptions = await scopeStartOptions();
	return shouldClearOpenAiApiKeyForCodexAuthProfile({
		store,
		authProfileId
	}) ? withClearedEnvironmentVariables(scopedStartOptions, CODEX_APP_SERVER_API_KEY_ENV_VARS) : scopedStartOptions;
}
function assertNoUnimportedAgentCodexAuthFile(params) {
	if (params.authRequirement === "api-key" && resolveCodexAppServerFallbackApiKeyCacheKey({ startOptions: params.startOptions })) return;
	const message = resolveUnimportedAgentCodexAuthMessage(params);
	if (message) throw new AgentHarnessPreflightError(message);
}
function resolveUnimportedAgentCodexAuthMessage(params) {
	if (params.startOptions.transport !== "stdio" || params.startOptions.homeScope === "user") return;
	const codexHome = resolveCodexAppServerHomeDir(params.agentDir);
	const authPath = path.join(codexHome, CODEX_AUTH_JSON_FILENAME);
	if (!fsSync.existsSync(authPath)) return;
	const targetAgentId = params.agentId?.trim() || "<agent-id>";
	return `A Codex auth file exists at ${authPath}, but agent-scoped Codex runs use OpenClaw's auth store and do not read that file. Preview only that credential import with \`openclaw migrate plan codex --from <codex-home> --agent ${targetAgentId} --include-secrets --item auth:openai\`, then run \`openclaw migrate apply codex --from <codex-home> --agent ${targetAgentId} --include-secrets --item auth:openai --yes\`. If the plan finds no credentials, remove the stale auth file.`;
}
function resolveCodexAppServerAuthProfileId(params) {
	const requested = params.authProfileId?.trim();
	if (requested) return requested;
	return resolveAuthProfileOrder({
		cfg: params.config,
		store: params.store,
		provider: CODEX_APP_SERVER_AUTH_PROVIDER
	})[0]?.trim();
}
function resolveCodexAppServerAuthProfileIdForAgent(params) {
	const store = resolveCodexAppServerAuthProfileStore({
		agentDir: params.agentDir?.trim() || resolveDefaultAgentDir(params.config ?? {}),
		authProfileId: params.authProfileId,
		authProfileStore: params.authProfileStore,
		config: params.config
	});
	return resolveCodexAppServerAuthProfileId({
		authProfileId: params.authProfileId,
		store,
		config: params.config
	});
}
function ensureCodexAppServerAuthProfileStore(params) {
	return ensureAuthProfileStore(params.agentDir, {
		allowKeychainPrompt: false,
		config: params.config,
		externalCliProviderIds: CODEX_APP_SERVER_EXTERNAL_CLI_PROVIDER_IDS,
		...params.authProfileId ? { externalCliProfileIds: [params.authProfileId] } : {}
	});
}
function resolveCodexAppServerAuthProfileStore(params) {
	if (params.authProfileStore) return params.authProfileStore;
	return ensureCodexAppServerAuthProfileStore({
		agentDir: params.agentDir,
		authProfileId: params.authProfileId,
		config: params.config
	});
}
/** Resolves prepared profile login material once so cache identity and RPC login cannot drift. */
async function resolveCodexAppServerPreparedAuthProfileSnapshot(params) {
	const agentDir = params.agentDir?.trim() || resolveDefaultAgentDir(params.config ?? {});
	const store = resolveCodexAppServerAuthProfileStore({
		agentDir,
		authProfileId: params.authProfileId,
		authProfileStore: params.authProfileStore,
		config: params.config
	});
	const profileId = resolveCodexAppServerAuthProfileId({
		authProfileId: params.authProfileId,
		store,
		config: params.config
	});
	if (!profileId) return;
	const credential = store.profiles[profileId];
	if (!credential || !isCodexAppServerAuthProfileCredential(credential)) return;
	const loginParams = await resolveCodexAppServerAuthProfileLoginParamsInternal({
		agentDir,
		authProfileId: profileId,
		authProfileStore: store,
		config: params.config
	});
	if (!loginParams) return;
	const accountId = loginParams.type === "chatgptAuthTokens" ? loginParams.chatgptAccountId : resolveChatgptAccountId(profileId, credential);
	const stableChatgptAccountId = resolveStableChatgptAccountId(credential);
	const secretFreeCacheKey = credential.type === "api_key" && loginParams.type === "apiKey" ? `${accountId}:${fingerprintApiKeyAuthProfileCacheKey(loginParams.apiKey)}` : loginParams.type === "chatgptAuthTokens" && (credential.type === "token" || !stableChatgptAccountId) ? `${accountId}:${fingerprintTokenAuthProfileCacheKey(loginParams.accessToken)}` : accountId;
	const chatgptAccountId = loginParams.type === "chatgptAuthTokens" ? loginParams.chatgptAccountId : void 0;
	return {
		loginParams,
		secretFreeCacheKey,
		...chatgptAccountId ? { chatgptAccountId } : {}
	};
}
/** Maps one prepared route to one mutually exclusive app-server auth handoff. */
async function resolveCodexAppServerPreparedAuthHandoff(params) {
	const usesNativeHome = params.homeScope === "user";
	if (params.requirePreparedAuth && usesNativeHome) throw createCodexAppServerAuthError("Codex remote-exec cloud placement requires prepared OpenAI auth. Configure an OpenAI API-key, OAuth, or token profile and use appServer.homeScope=\"agent\"; ambient credentials and native Codex auth are not allowed.");
	if (usesNativeHome) return { nativeAuthProfile: true };
	if (params.authRequirement === "api-key") {
		const apiKey = params.resolvedApiKey?.trim();
		if (!apiKey) throw new Error("Prepared Codex API-key route is missing its resolved API key.");
		return {
			nativeAuthProfile: false,
			preparedAuth: {
				kind: "api-key",
				apiKey
			}
		};
	}
	const authProfileId = params.authProfileId?.trim() || void 0;
	const nativeAuthProfile = isCodexAppServerNativeAuthProfile({
		authProfileId,
		authProfileStore: params.authProfileStore,
		agentDir: params.agentDir,
		config: params.config
	});
	if (params.authRequirement !== "subscription" && !params.requirePreparedAuth) return {
		authProfileId,
		nativeAuthProfile
	};
	if (!authProfileId || params.authRequirement === "subscription" && !nativeAuthProfile) throw createCodexAppServerAuthError(params.requirePreparedAuth ? "Codex remote-exec cloud placement requires prepared OpenAI auth. Configure an OpenAI API-key, OAuth, or token profile; ambient CODEX_API_KEY, OPENAI_API_KEY, and native Codex auth are not allowed." : params.subscriptionProfileRequiredError);
	const snapshot = await resolveCodexAppServerPreparedAuthProfileSnapshot({
		authProfileId,
		authProfileStore: params.authProfileStore,
		agentDir: params.agentDir,
		config: params.config
	});
	if (!snapshot) throw createCodexAppServerAuthError(params.requirePreparedAuth ? "Codex remote-exec cloud placement could not prepare the selected OpenAI auth profile. Repair or replace the profile, then retry." : params.subscriptionProfileUnusableError);
	return {
		authProfileId,
		nativeAuthProfile,
		preparedAuth: {
			kind: "profile",
			profileId: authProfileId,
			store: params.authProfileStore,
			snapshot
		}
	};
}
async function resolveCodexAppServerAuthAccountCacheKey(params) {
	const agentDir = params.agentDir?.trim() || resolveDefaultAgentDir(params.config ?? {});
	const store = resolveCodexAppServerAuthProfileStore({
		agentDir,
		authProfileId: params.authProfileId,
		authProfileStore: params.authProfileStore,
		config: params.config
	});
	const profileId = resolveCodexAppServerAuthProfileId({
		authProfileId: params.authProfileId,
		store,
		config: params.config
	});
	if (!profileId) return;
	const credential = store.profiles[profileId];
	if (!credential || !isCodexAppServerAuthProfileCredential(credential)) return;
	if (credential.type === "api_key") {
		const apiKey = (await resolveApiKeyForProfile({
			store,
			profileId,
			agentDir
		}))?.apiKey?.trim();
		return apiKey ? `${resolveChatgptAccountId(profileId, credential)}:${fingerprintApiKeyAuthProfileCacheKey(apiKey)}` : resolveChatgptAccountId(profileId, credential);
	}
	if (credential.type === "token") {
		const accessToken = (await resolveApiKeyForProfile({
			store,
			profileId,
			agentDir
		}))?.apiKey?.trim();
		return accessToken ? `${resolveChatgptAccountId(profileId, credential)}:${fingerprintTokenAuthProfileCacheKey(accessToken)}` : resolveChatgptAccountId(profileId, credential);
	}
	return resolveChatgptAccountId(profileId, credential);
}
function resolveCodexAppServerEnvApiKeyCacheKey(params) {
	if (params.startOptions.transport !== "stdio") return;
	const apiKey = readFirstNonEmptyEnvEntry(resolveCodexAppServerSpawnEnv(params.startOptions, params.baseEnv ?? process.env, params.platform ?? process.platform), CODEX_APP_SERVER_API_KEY_ENV_VARS);
	if (!apiKey) return;
	const hash = createHash("sha256");
	hash.update("openclaw:codex:app-server-env-api-key:v1");
	hash.update("\0");
	hash.update(apiKey.key);
	hash.update("\0");
	hash.update(apiKey.value);
	return `${apiKey.key}:sha256:${hash.digest("hex")}`;
}
function resolveCodexAppServerFallbackApiKeyCacheKey(params) {
	if (params.startOptions.transport !== "stdio") return;
	return resolveCodexAppServerEnvApiKeyCacheKey(params) ?? resolveCodexCliAuthFileApiKeyCacheKey(params.baseEnv ?? process.env);
}
/** Secret-free cache identity for an API key already resolved by the runtime plan. */
function resolveCodexAppServerPreparedApiKeyCacheKey(apiKey) {
	const resolved = apiKey?.trim();
	return resolved ? fingerprintApiKeyAuthProfileCacheKey(resolved) : void 0;
}
function fingerprintApiKeyAuthProfileCacheKey(apiKey) {
	const hash = createHash("sha256");
	hash.update("openclaw:codex:app-server-auth-profile-api-key:v1");
	hash.update("\0");
	hash.update(apiKey);
	return `api_key:sha256:${hash.digest("hex")}`;
}
function fingerprintTokenAuthProfileCacheKey(accessToken) {
	const hash = createHash("sha256");
	hash.update("openclaw:codex:app-server-auth-profile-token:v1");
	hash.update("\0");
	hash.update(accessToken);
	return `token:sha256:${hash.digest("hex")}`;
}
function fingerprintCodexCliAuthFileApiKeyCacheKey(apiKey) {
	const hash = createHash("sha256");
	hash.update("openclaw:codex:app-server-cli-auth-json-api-key:v1");
	hash.update("\0");
	hash.update(apiKey);
	return `CODEX_AUTH_JSON:sha256:${hash.digest("hex")}`;
}
async function withCodexHomeEnvironment(startOptions, agentDir) {
	const codexHome = resolveCodexAppServerLocalHomeDir(startOptions, agentDir);
	const nativeHome = startOptions.env?.[HOME_ENV_VAR]?.trim() ? startOptions.env[HOME_ENV_VAR] : void 0;
	await fs.mkdir(codexHome, { recursive: true });
	if (nativeHome) await fs.mkdir(nativeHome, { recursive: true });
	const nextStartOptions = {
		...startOptions,
		env: {
			...startOptions.env,
			[CODEX_HOME_ENV_VAR]: codexHome,
			...nativeHome ? { [HOME_ENV_VAR]: nativeHome } : {}
		}
	};
	const clearEnv = withoutClearedCodexHomeEnv(startOptions.clearEnv);
	if (clearEnv) nextStartOptions.clearEnv = clearEnv;
	else delete nextStartOptions.clearEnv;
	return nextStartOptions;
}
/** Reconciles Computer Use artifacts for the exact managed command about to start. */
async function reconcileCodexComputerUseStartArtifacts(params) {
	if (params.startOptions.transport !== "stdio") return;
	const codexHome = resolveCodexAppServerLocalHomeDir(params.startOptions, params.agentDir);
	const key = path.resolve(codexHome);
	let owner = activeComputerUseArtifactReconciliations.get(key);
	if (!owner) {
		owner = {
			active: 0,
			tail: Promise.resolve()
		};
		activeComputerUseArtifactReconciliations.set(key, owner);
	} else {
		activeComputerUseArtifactReconciliations.delete(key);
		activeComputerUseArtifactReconciliations.set(key, owner);
	}
	owner.active += 1;
	const epoch = params.desktopGeneration?.epoch;
	if (epoch !== void 0 && (owner.latestEpoch === void 0 || epoch > owner.latestEpoch)) owner.latestEpoch = epoch;
	const assertCurrent = () => {
		params.assertCurrent?.();
		if (epoch !== void 0 && owner.latestEpoch !== epoch) throw new Error("Codex Computer Use artifact reconciliation was superseded.");
	};
	const operation = owner.tail.catch(() => void 0).then(async () => {
		assertCurrent();
		const appliedCacheBinding = await reconcileCodexComputerUseStartArtifactsOnce({
			...params,
			codexHome,
			assertCurrent,
			previousCacheBinding: owner.appliedCacheBinding
		});
		assertCurrent();
		owner.appliedCacheBinding = appliedCacheBinding;
	});
	const settled = operation.then(() => void 0, () => void 0);
	owner.tail = settled;
	try {
		await operation;
	} finally {
		owner.active = Math.max(0, owner.active - 1);
		if (owner.active === 0 && owner.latestEpoch === void 0 && activeComputerUseArtifactReconciliations.get(key) === owner && owner.tail === settled) activeComputerUseArtifactReconciliations.delete(key);
		pruneComputerUseArtifactOwners();
	}
}
async function reconcileCodexComputerUseStartArtifactsOnce(params) {
	const codexHome = params.codexHome;
	const computerUseConfig = resolveCodexComputerUseConfig({ pluginConfig: params.pluginConfig });
	const ownsIsolatedCodexHome = params.ownsIsolatedCodexHome ?? (params.startOptions.homeScope !== "user" && !params.startOptions.env?.[CODEX_HOME_ENV_VAR]?.trim());
	const shouldProvisionComputerUse = computerUseConfig.enabled && computerUseConfig.autoInstall && ownsIsolatedCodexHome;
	if (shouldProvisionComputerUse) await ensureOwnedCodexHome(codexHome, params.agentDir);
	else await fs.mkdir(codexHome, { recursive: true });
	const desktopCandidates = resolveMacOSDesktopCodexAppPathCandidates();
	const exactDesktopCandidate = desktopCandidates.find((candidate) => path.resolve(candidate.appServerCommandPath) === path.resolve(params.startOptions.command));
	const usesManagedBundledMarketplace = !computerUseConfig.marketplaceSource && !computerUseConfig.marketplacePath && !computerUseConfig.marketplaceName;
	const needsBundledMarketplace = usesManagedBundledMarketplace || computerUseConfig.pluginCacheMode === "shared" && !computerUseConfig.marketplaceName && !computerUseConfig.marketplacePath;
	const artifactCandidate = shouldProvisionComputerUse ? await resolveCompleteComputerUseArtifactCandidate({
		candidates: exactDesktopCandidate ? [exactDesktopCandidate] : desktopCandidates,
		needsBundledMarketplace
	}) : exactDesktopCandidate;
	params.assertCurrent();
	if (shouldProvisionComputerUse) {
		if (desktopCandidates.length > 0 && !artifactCandidate) throw new CodexComputerUseCandidateArtifactsUnavailableError();
		try {
			const marketplacePath = usesManagedBundledMarketplace ? await ensureCodexManagedBundledMarketplace({
				codexHome,
				ownershipRoot: params.agentDir,
				...artifactCandidate ? {
					appServerCommand: artifactCandidate.appServerCommandPath,
					candidates: [artifactCandidate],
					ownershipCandidates: desktopCandidates
				} : {},
				assertCurrent: params.assertCurrent
			}) : void 0;
			params.assertCurrent();
			if (usesManagedBundledMarketplace && desktopCandidates.length > 0 && !marketplacePath) throw new CodexComputerUseCandidateArtifactsUnavailableError();
			const service = await ensureCodexComputerUseServiceApp({
				codexHome,
				ownershipRoot: params.agentDir,
				...artifactCandidate ? {
					appServerCommand: artifactCandidate.appServerCommandPath,
					sourceAppCandidates: artifactCandidate.computerUseServiceAppPaths
				} : {},
				assertCurrent: params.assertCurrent
			});
			params.assertCurrent();
			if (desktopCandidates.length > 0 && service.status === "source_missing") throw new CodexComputerUseCandidateArtifactsUnavailableError();
		} catch (error) {
			params.assertCurrent();
			if (error instanceof CodexComputerUseCandidateArtifactsUnavailableError) throw error;
			throw new AgentHarnessPreflightError("Codex Computer Use client provisioning failed.", {
				cause: error,
				scope: "harness"
			});
		}
	}
	params.assertCurrent();
	const cacheBinding = [
		params.desktopGeneration?.epoch ?? "manual",
		artifactCandidate?.bundledMarketplacePath ?? "default",
		computerUseConfig.pluginName
	].join("\0");
	const cache = await ensureCodexComputerUseSharedPluginCache({
		codexHome,
		config: computerUseConfig,
		...ownsIsolatedCodexHome ? { ownershipRoot: params.agentDir } : {},
		...artifactCandidate ? { bundledMarketplacePath: artifactCandidate.bundledMarketplacePath } : {},
		assertCurrent: params.assertCurrent,
		forceRefresh: params.forceCacheRefresh === true || params.previousCacheBinding !== cacheBinding
	});
	params.assertCurrent();
	return cache.status === "shared" ? cacheBinding : void 0;
}
async function resolveCompleteComputerUseArtifactCandidate(params) {
	for (const candidate of params.candidates) {
		if (params.needsBundledMarketplace && !await resolveCodexManagedBundledMarketplaceSource({ candidates: [candidate] })) continue;
		if (await resolveCodexComputerUseServiceAppSourcePath({ sourceAppCandidates: candidate.computerUseServiceAppPaths })) return candidate;
	}
}
function pruneComputerUseArtifactOwners() {
	while (activeComputerUseArtifactReconciliations.size > MAX_COMPUTER_USE_ARTIFACT_OWNERS) {
		const inactive = [...activeComputerUseArtifactReconciliations].find(([, owner]) => owner.active === 0);
		if (!inactive) return;
		activeComputerUseArtifactReconciliations.delete(inactive[0]);
	}
}
var CodexComputerUseCandidateArtifactsUnavailableError = class extends Error {
	constructor() {
		super("The selected Codex desktop app does not contain complete Computer Use artifacts.");
		this.code = "CODEX_COMPUTER_USE_CANDIDATE_ARTIFACTS_UNAVAILABLE";
		this.name = "CodexComputerUseCandidateArtifactsUnavailableError";
	}
};
function withoutClearedCodexHomeEnv(clearEnv) {
	if (!clearEnv) return;
	const reserved = new Set(CODEX_APP_SERVER_HOME_ENV_VARS);
	const filtered = clearEnv.filter((envVar) => !reserved.has(envVar.trim().toUpperCase()));
	return filtered.length === clearEnv.length ? clearEnv : filtered;
}
async function applyCodexAppServerAuthProfile(params) {
	if (!params.preparedAuth && params.authProfileId === null) {
		await assertNativeCodexAccountMatchesRoute(params.client, params.authRequirement);
		return;
	}
	const loginParams = params.preparedAuth?.kind === "profile" ? params.preparedAuth.snapshot.loginParams : params.preparedAuth?.kind === "api-key" ? {
		type: "apiKey",
		apiKey: params.preparedAuth.apiKey
	} : await resolveCodexAppServerAuthProfileLoginParams({
		agentDir: params.agentDir,
		authProfileId: params.authProfileId ?? void 0,
		authProfileStore: params.authProfileStore,
		config: params.config
	});
	if (params.authRequirement === "subscription" && loginParams?.type !== "chatgptAuthTokens") throw createCodexAppServerAuthError("Codex subscription auth profile could not produce login credentials. Sign in with `openclaw models auth login --provider openai`, select that profile, then retry.");
	if (!loginParams) {
		if (params.authRequirement !== "api-key" || params.startOptions?.transport !== "stdio") return;
		const env = resolveCodexAppServerSpawnEnv(params.startOptions, process.env);
		const fallbackLoginParams = await resolveCodexAppServerFallbackApiKeyLoginParams({
			client: params.client,
			env,
			codexCliAuthEnv: process.env
		});
		if (fallbackLoginParams) await params.client.request("account/login/start", fallbackLoginParams);
		return;
	}
	await params.client.request("account/login/start", loginParams);
}
/**
* Native-home connections are verified, never logged into. Both directions of the
* check protect the same billing boundary: a subscription route cannot run without
* ChatGPT tokens, and a Platform route must not silently spend the operator's
* ChatGPT plan. An absent account is left alone because the native home may serve a
* custom model provider that reports no OpenAI account at all.
*/
async function assertNativeCodexAccountMatchesRoute(client, authRequirement) {
	if (!authRequirement) return;
	const response = await client.request("account/read", { refreshToken: false });
	const accountType = isJsonObject(response.account) ? response.account.type : void 0;
	if (authRequirement === "subscription") {
		if (accountType !== "chatgpt") throw createCodexAppServerAuthError("Codex subscription route requires ChatGPT auth in the native Codex home. Run `codex login` for that home, or use appServer.homeScope=\"agent\" with an OpenClaw OAuth profile, then retry.");
		return;
	}
	if (accountType === "chatgpt") throw createCodexAppServerAuthError("Codex Platform route requires an API-key account, but the native Codex home is signed in with a ChatGPT subscription. Sign that home in with `codex login --with-api-key`, or set appServer.homeScope=\"agent\" so OpenClaw can inject its own key.");
}
function createCodexAppServerAuthError(message, cause) {
	const error = cause === void 0 ? new Error(message) : new Error(message, { cause });
	return Object.assign(error, { status: 401 });
}
var CodexAppServerAuthProfileUnavailableError = class extends Error {
	constructor(..._args) {
		super(..._args);
		this.status = 401;
		this.code = "selected_auth_profile_unavailable";
	}
};
async function resolveCodexAppServerAuthProfileLoginParams(params) {
	const store = resolveCodexAppServerAuthProfileStore(params);
	const profileId = resolveCodexAppServerAuthProfileId({
		authProfileId: params.authProfileId,
		store,
		config: params.config
	});
	const profile = profileId ? store.profiles[profileId] : void 0;
	if (profileId && !profile) throw new CodexAppServerAuthProfileUnavailableError(`Codex app-server auth profile "${profileId}" was not found. Select an existing OpenAI profile or sign in again with OpenClaw, then retry.`);
	if (profileId && profile && !isCodexAppServerAuthProfileCredential(profile)) throw new CodexAppServerAuthProfileUnavailableError(`Codex app-server auth profile "${profileId}" must use the canonical OpenAI auth provider; run "openclaw doctor --fix" to migrate legacy provider IDs.`);
	return await resolveCodexAppServerAuthProfileLoginParamsInternal({
		...params,
		authProfileStore: store
	});
}
async function refreshCodexAppServerAuthTokens(params) {
	const previousAccountId = params.previousAccountId?.trim();
	if (previousAccountId) {
		const store = resolveCodexAppServerAuthProfileStore(params);
		const profileId = resolveCodexAppServerAuthProfileId({
			authProfileId: params.authProfileId,
			store,
			config: params.config
		});
		const credential = profileId ? store.profiles[profileId] : void 0;
		const selectedAccountId = credential ? resolveExplicitChatgptAccountId(credential) ?? (credential.type === "oauth" ? resolveOpenAICodexAuthIdentity({ access: credential.access }).accountId : void 0) : void 0;
		if (selectedAccountId && selectedAccountId !== previousAccountId) throw new Error("ChatGPT workspace changed before Codex token refresh. Retry to start a client for the selected workspace.");
	}
	const loginParams = await resolveCodexAppServerAuthProfileLoginParamsInternal({
		...params,
		forceOAuthRefresh: true
	});
	if (!loginParams || loginParams.type !== "chatgptAuthTokens") throw new Error("Codex app-server ChatGPT token refresh requires an OAuth auth profile. Sign in with `openclaw models auth login --provider openai`, select that profile, then retry.");
	if (previousAccountId && loginParams.chatgptAccountId !== previousAccountId) throw new Error("ChatGPT workspace changed during Codex token refresh. Retry to start a client for the selected workspace.");
	return {
		accessToken: loginParams.accessToken,
		chatgptAccountId: loginParams.chatgptAccountId,
		chatgptPlanType: loginParams.chatgptPlanType ?? null
	};
}
async function resolveCodexAppServerAuthProfileLoginParamsInternal(params) {
	const store = resolveCodexAppServerAuthProfileStore({
		agentDir: params.agentDir,
		authProfileId: params.authProfileId,
		authProfileStore: params.authProfileStore,
		config: params.config
	});
	const profileId = resolveCodexAppServerAuthProfileId({
		authProfileId: params.authProfileId,
		store,
		config: params.config
	});
	if (!profileId) return;
	const credential = store.profiles[profileId];
	if (!credential) throw new CodexAppServerAuthProfileUnavailableError(`Codex app-server auth profile "${profileId}" was not found. Select an existing OpenAI profile or sign in again with OpenClaw, then retry.`);
	if (!isCodexAppServerAuthProfileCredential(credential)) throw new CodexAppServerAuthProfileUnavailableError(`Codex app-server auth profile "${profileId}" must use the canonical OpenAI auth provider; run "openclaw doctor --fix" to migrate legacy provider IDs.`);
	const loginParams = await resolveLoginParamsForCredential(profileId, credential, {
		agentDir: params.agentDir,
		store,
		preferStoreCredential: Boolean(params.authProfileStore?.profiles[profileId]),
		forceOAuthRefresh: params.forceOAuthRefresh === true,
		config: params.config
	});
	if (!loginParams) throw new CodexAppServerAuthProfileUnavailableError(`Codex app-server auth profile "${profileId}" does not contain usable credentials. Repair or replace the selected OpenAI credential, then retry.`);
	return loginParams;
}
async function resolveCodexAppServerFallbackApiKeyLoginParams(params) {
	const apiKey = readFirstNonEmptyEnv(params.env, CODEX_APP_SERVER_API_KEY_ENV_VARS) ?? await readCodexCliAuthFileApiKey(params.codexCliAuthEnv);
	if (!apiKey) return;
	if ((await params.client.request("account/read", { refreshToken: false })).account) return;
	return {
		type: "apiKey",
		apiKey
	};
}
function resolveCodexCliAuthFilePath(env) {
	const configuredCodexHome = env[CODEX_HOME_ENV_VAR]?.trim();
	if (configuredCodexHome) return path.join(resolveHomeRelativePath(configuredCodexHome, env), CODEX_AUTH_JSON_FILENAME);
	const home = env[HOME_ENV_VAR]?.trim() || env.USERPROFILE?.trim() || os.homedir();
	return path.join(home, CODEX_HOME_DIRNAME, CODEX_AUTH_JSON_FILENAME);
}
function resolveHomeRelativePath(value, env) {
	if (value === "~" || value.startsWith("~/") || value.startsWith("~\\")) {
		const home = env[HOME_ENV_VAR]?.trim() || env.USERPROFILE?.trim() || os.homedir();
		return path.join(home, value.slice(value === "~" ? 1 : 2));
	}
	return value;
}
function parseCodexCliAuthFileApiKey(raw) {
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return;
	}
	if (!parsed || typeof parsed !== "object") return;
	const apiKey = parsed.OPENAI_API_KEY;
	return typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : void 0;
}
async function readCodexCliAuthFileApiKey(env) {
	try {
		return parseCodexCliAuthFileApiKey(await readSecretFile(resolveCodexCliAuthFilePath(env), "Codex CLI auth file"));
	} catch {
		return;
	}
}
function resolveCodexCliAuthFileApiKeyCacheKey(env) {
	try {
		const apiKey = parseCodexCliAuthFileApiKey(fsSync.readFileSync(resolveCodexCliAuthFilePath(env), "utf8"));
		return apiKey ? fingerprintCodexCliAuthFileApiKeyCacheKey(apiKey) : void 0;
	} catch {
		return;
	}
}
async function resolveLoginParamsForCredential(profileId, credential, params) {
	if (credential.type === "api_key") {
		const apiKey = (await resolveApiKeyForProfile({
			store: params.preferStoreCredential ? params.store : ensureAuthProfileStore(params.agentDir, { allowKeychainPrompt: false }),
			profileId,
			agentDir: params.agentDir
		}))?.apiKey?.trim();
		return apiKey ? {
			type: "apiKey",
			apiKey
		} : void 0;
	}
	if (credential.type === "token") {
		const accessToken = (await resolveApiKeyForProfile({
			store: params.preferStoreCredential ? params.store : ensureAuthProfileStore(params.agentDir, { allowKeychainPrompt: false }),
			profileId,
			agentDir: params.agentDir
		}))?.apiKey?.trim();
		return accessToken ? buildChatgptAuthTokensParams(profileId, credential, accessToken) : void 0;
	}
	if (credential.type !== "oauth") return;
	const resolvedCredential = await resolveOAuthCredentialForCodexAppServer(profileId, credential, {
		agentDir: params.agentDir,
		store: params.store,
		preferStoreCredential: params.preferStoreCredential,
		forceRefresh: params.forceOAuthRefresh,
		config: params.config
	});
	const accessToken = resolvedCredential.access?.trim();
	return accessToken ? buildChatgptAuthTokensParams(profileId, resolvedCredential, accessToken) : void 0;
}
async function resolveOAuthCredentialForCodexAppServer(profileId, credential, params) {
	const ownerAgentDir = resolvePersistedAuthProfileOwnerAgentDir({
		agentDir: params.agentDir,
		profileId
	});
	const persistedCredential = findPersistedAuthProfileCredential({
		agentDir: ownerAgentDir,
		profileId
	});
	const useScopedCredential = params.preferStoreCredential && shouldUseScopedOAuthCredential({
		store: params.store,
		profileId,
		persistedCredential,
		suppliedCredential: credential,
		config: params.config
	});
	const store = useScopedCredential ? params.store : ensureCodexAppServerAuthProfileStore({
		agentDir: ownerAgentDir,
		authProfileId: profileId,
		config: params.config
	});
	const persistedOAuthCredential = !useScopedCredential && persistedCredential?.type === "oauth" && isCodexAppServerAuthProvider(persistedCredential.provider) ? persistedCredential : void 0;
	const ownerCredential = store.profiles[profileId];
	const overlaidOAuthCredential = ownerCredential?.type === "oauth" && isCodexAppServerAuthProvider(ownerCredential.provider) ? ownerCredential : void 0;
	if (useScopedCredential && overlaidOAuthCredential) return await resolveScopedOAuthCredential({
		store,
		profileId,
		credential: overlaidOAuthCredential,
		forceRefresh: params.forceRefresh
	});
	if (params.forceRefresh && !persistedOAuthCredential && overlaidOAuthCredential) {
		const refreshedRuntimeCredential = await refreshOAuthCredentialForRuntime({ credential: overlaidOAuthCredential });
		if (!refreshedRuntimeCredential?.access?.trim()) throw new Error(`Codex app-server auth profile "${profileId}" could not refresh. Sign in again with OpenClaw, then retry.`);
		store.profiles[profileId] = refreshedRuntimeCredential;
		return refreshedRuntimeCredential;
	}
	const resolved = await resolveApiKeyForProfile({
		store,
		profileId,
		agentDir: ownerAgentDir,
		forceRefresh: params.forceRefresh && Boolean(persistedOAuthCredential)
	});
	const refreshed = useScopedCredential ? void 0 : loadAuthProfileStoreForSecretsRuntime(ownerAgentDir).profiles[profileId];
	const refreshedOAuthCredential = refreshed?.type === "oauth" && isCodexAppServerAuthProvider(refreshed.provider) ? refreshed : void 0;
	if (refreshedOAuthCredential && isDeepStrictEqual(params.store.profiles[profileId], credential)) params.store.profiles[profileId] = refreshedOAuthCredential;
	const storedCredential = store.profiles[profileId];
	const candidate = refreshedOAuthCredential ? refreshedOAuthCredential : storedCredential?.type === "oauth" && isCodexAppServerAuthProvider(storedCredential.provider) ? storedCredential : credential;
	return resolved?.apiKey ? {
		...candidate,
		access: resolved.apiKey
	} : candidate;
}
function shouldUseScopedOAuthCredential(params) {
	if (!params.store.runtimePersistedProfileIds?.includes(params.profileId)) return true;
	const persisted = params.persistedCredential;
	if (persisted?.type !== "oauth") return true;
	if (resolveProviderIdForAuth(persisted.provider, { config: params.config }) !== resolveProviderIdForAuth(params.suppliedCredential.provider, { config: params.config })) return true;
	return !isDeepStrictEqual(persisted, params.suppliedCredential) && !hasMatchingOAuthIdentity(persisted, params.suppliedCredential);
}
function hasMatchingOAuthIdentity(persisted, supplied) {
	const persistedAccountId = resolveOpenAICodexAuthIdentity(persisted).accountId?.trim();
	const suppliedAccountId = resolveOpenAICodexAuthIdentity(supplied).accountId?.trim();
	if (persistedAccountId && suppliedAccountId) return persistedAccountId === suppliedAccountId;
	const persistedEmail = persisted.email?.trim().toLowerCase();
	const suppliedEmail = supplied.email?.trim().toLowerCase();
	return Boolean(persistedEmail && suppliedEmail && persistedEmail === suppliedEmail);
}
async function resolveScopedOAuthCredential(params) {
	const existingRefresh = scopedOAuthRefreshQueues.get(params.store)?.get(params.profileId);
	if (existingRefresh) return await existingRefresh;
	if (!params.forceRefresh && hasUsableOAuthCredential(params.credential)) return params.credential;
	const storeRefreshes = scopedOAuthRefreshQueues.get(params.store) ?? /* @__PURE__ */ new Map();
	scopedOAuthRefreshQueues.set(params.store, storeRefreshes);
	const refresh = (async () => {
		const current = params.store.profiles[params.profileId];
		const credential = current?.type === "oauth" ? current : params.credential;
		if (!params.forceRefresh && hasUsableOAuthCredential(credential)) return credential;
		const refreshed = await refreshOAuthCredentialForRuntime({ credential });
		if (!refreshed?.access?.trim()) throw new Error(`Codex app-server auth profile "${params.profileId}" could not refresh. Sign in again with OpenClaw, then retry.`);
		if (!isDeepStrictEqual(params.store.profiles[params.profileId], credential)) throw new Error(`Codex app-server auth profile "${params.profileId}" changed while refreshing. Retry with the newly selected OpenAI profile.`);
		params.store.profiles[params.profileId] = refreshed;
		return refreshed;
	})();
	storeRefreshes.set(params.profileId, refresh);
	try {
		return await refresh;
	} finally {
		if (storeRefreshes.get(params.profileId) === refresh) storeRefreshes.delete(params.profileId);
	}
}
function isCodexAppServerAuthProvider(provider) {
	return provider.trim().toLowerCase() === CODEX_APP_SERVER_AUTH_PROVIDER;
}
function isCodexAppServerAuthProfileCredential(credential) {
	return isCodexAppServerAuthProvider(credential.provider);
}
function shouldClearOpenAiApiKeyForCodexAuthProfile(params) {
	const profileId = params.authProfileId?.trim();
	return isCodexSubscriptionCredential(profileId ? params.store.profiles[profileId] : params.store.profiles[OPENAI_CODEX_DEFAULT_PROFILE_ID]);
}
function isCodexSubscriptionCredential(credential) {
	if (!credential || !isCodexAppServerAuthProvider(credential.provider)) return false;
	return credential.type === "oauth" || credential.type === "token";
}
function withClearedEnvironmentVariables(startOptions, envVars) {
	const clearEnv = startOptions.clearEnv ?? [];
	const missingEnvVars = envVars.filter((envVar) => !clearEnv.includes(envVar));
	if (missingEnvVars.length === 0) return startOptions;
	return {
		...startOptions,
		clearEnv: [...clearEnv, ...missingEnvVars]
	};
}
function readFirstNonEmptyEnv(env, keys) {
	return readFirstNonEmptyEnvEntry(env, keys)?.value;
}
function readFirstNonEmptyEnvEntry(env, keys) {
	for (const key of keys) {
		const value = env[key]?.trim();
		if (value) return {
			key,
			value
		};
	}
}
function buildChatgptAuthTokensParams(profileId, credential, accessToken) {
	const storedAccountId = resolveExplicitChatgptAccountId(credential);
	const tokenAccountId = resolveOpenAICodexAuthIdentity({ access: accessToken }).accountId;
	if (storedAccountId && tokenAccountId && storedAccountId !== tokenAccountId) throw new CodexAppServerAuthProfileUnavailableError(`Codex app-server auth profile "${profileId}" has a different ChatGPT account ID than its access token. Sign in again before retrying.`);
	const chatgptAccountId = storedAccountId ?? tokenAccountId;
	if (!chatgptAccountId) throw new CodexAppServerAuthProfileUnavailableError(`Codex app-server auth profile "${profileId}" is missing its ChatGPT account ID. Sign in again before retrying.`);
	return {
		type: "chatgptAuthTokens",
		accessToken,
		chatgptAccountId,
		chatgptPlanType: resolveChatgptPlanType(credential)
	};
}
function resolveChatgptPlanType(credential) {
	const record = credential;
	const planType = record.chatgptPlanType ?? record.planType;
	return typeof planType === "string" && planType.trim() ? planType.trim() : null;
}
function resolveChatgptAccountId(profileId, credential) {
	return resolveStableChatgptAccountId(credential) ?? profileId;
}
function resolveStableChatgptAccountId(credential) {
	return resolveExplicitChatgptAccountId(credential) ?? (credential.email?.trim() || void 0);
}
function resolveExplicitChatgptAccountId(credential) {
	if ("accountId" in credential && typeof credential.accountId === "string") {
		const accountId = credential.accountId.trim();
		if (accountId) return accountId;
	}
}
//#endregion
//#region extensions/codex/src/app-server/rate-limit-cache.ts
const DEFAULT_CODEX_RATE_LIMIT_CACHE_MAX_AGE_MS = 6e5;
const SPARSE_ACCOUNT_METADATA_KEYS = [
	"credits",
	"individualLimit",
	"planType"
];
const rateLimitsByClient = /* @__PURE__ */ new WeakMap();
/** Replaces one physical client's cache with an authoritative rate-limit read response. */
function rememberCodexRateLimitsRead(client, value, nowMs = Date.now()) {
	if (value !== void 0) {
		const revisionsByLimitId = { ...rateLimitsByClient.get(client)?.revisionsByLimitId };
		for (const limitId of readRateLimitIds(value)) revisionsByLimitId[limitId] = (revisionsByLimitId[limitId] ?? 0) + 1;
		rateLimitsByClient.set(client, {
			value,
			updatedAtMs: nowMs,
			revisionsByLimitId
		});
	}
}
/** Merges a sparse rolling notification into one physical client's latest read response. */
function mergeCodexRateLimitsUpdate(client, value, nowMs = Date.now()) {
	const update = isJsonObject(value) && isJsonObject(value.rateLimits) ? value.rateLimits : void 0;
	if (!update) return;
	const currentState = rateLimitsByClient.get(client);
	const current = currentState?.value;
	const limitId = readLimitId(update);
	rateLimitsByClient.set(client, {
		value: mergeRateLimitUpdate(current, update),
		updatedAtMs: nowMs,
		revisionsByLimitId: {
			...currentState?.revisionsByLimitId,
			[limitId]: (currentState?.revisionsByLimitId[limitId] ?? 0) + 1
		}
	});
}
/** Per-limit marker used to trust only primary Codex updates from one turn startup. */
function readCodexRateLimitsRevision(client, limitId = "codex") {
	return rateLimitsByClient.get(client)?.revisionsByLimitId[limitId] ?? 0;
}
/** Reads one physical client's cached rate-limit payload within the max-age window. */
function readRecentCodexRateLimits(client, options) {
	const state = rateLimitsByClient.get(client);
	if (!state) return;
	const nowMs = options?.nowMs ?? Date.now();
	const maxAgeMs = options?.maxAgeMs ?? DEFAULT_CODEX_RATE_LIMIT_CACHE_MAX_AGE_MS;
	return maxAgeMs >= 0 && nowMs - state.updatedAtMs > maxAgeMs ? void 0 : state.value;
}
function mergeRateLimitUpdate(current, update) {
	const currentEnvelope = isJsonObject(current) ? current : void 0;
	const currentPrimary = currentEnvelope && isJsonObject(currentEnvelope.rateLimits) ? currentEnvelope.rateLimits : void 0;
	const currentByLimitId = currentEnvelope && isJsonObject(currentEnvelope.rateLimitsByLimitId) ? currentEnvelope.rateLimitsByLimitId : void 0;
	const limitId = readLimitId(update);
	const currentPrimaryLimitId = currentPrimary ? readLimitId(currentPrimary) : void 0;
	const currentForLimit = (currentByLimitId && isJsonObject(currentByLimitId[limitId]) ? currentByLimitId[limitId] : void 0) ?? (currentPrimaryLimitId === limitId ? currentPrimary : void 0);
	const merged = mergeSparseSnapshot(isJsonObject(currentForLimit) ? currentForLimit : void 0, currentPrimary, update, limitId);
	const nextPrimary = !currentPrimary || currentPrimaryLimitId === limitId ? merged : currentPrimary;
	let nextByLimitId;
	if (currentByLimitId) nextByLimitId = {
		...currentByLimitId,
		[limitId]: merged
	};
	else if (currentPrimary && currentPrimaryLimitId && currentPrimaryLimitId !== limitId) nextByLimitId = {
		[currentPrimaryLimitId]: currentPrimary,
		[limitId]: merged
	};
	return {
		...currentEnvelope,
		rateLimits: nextPrimary,
		...nextByLimitId ? { rateLimitsByLimitId: nextByLimitId } : {}
	};
}
function readRateLimitIds(value) {
	if (!isJsonObject(value)) return [];
	const ids = /* @__PURE__ */ new Set();
	if (isJsonObject(value.rateLimits)) ids.add(readLimitId(value.rateLimits));
	if (isJsonObject(value.rateLimitsByLimitId)) for (const [key, snapshot] of Object.entries(value.rateLimitsByLimitId)) {
		const snapshotLimitId = isJsonObject(snapshot) && typeof snapshot.limitId === "string" ? snapshot.limitId.trim() : "";
		ids.add(snapshotLimitId || key);
	}
	return [...ids];
}
function mergeSparseSnapshot(current, accountFallback, update, limitId) {
	const merged = {
		...update,
		limitId
	};
	for (const key of SPARSE_ACCOUNT_METADATA_KEYS) {
		const previous = current?.[key] ?? accountFallback?.[key];
		if (merged[key] == null && previous != null) merged[key] = previous;
	}
	return merged;
}
function readLimitId(snapshot) {
	const value = snapshot.limitId;
	return typeof value === "string" && value.trim() ? value.trim() : "codex";
}
//#endregion
//#region extensions/codex/src/app-server/timeout.ts
/**
* Thin Codex app-server timeout adapter around OpenClaw's shared security
* runtime timeout helper.
*/
function resolveAbortError(signal) {
	return signal.reason instanceof Error ? signal.reason : new Error("Codex app-server operation aborted", { cause: signal.reason });
}
/** Awaits a promise with a Codex-specific timeout error message. */
async function withTimeout$1(promise, timeoutMs, timeoutMessage, createError) {
	return await withTimeout(promise, timeoutMs, {
		message: timeoutMessage,
		...createError ? { createError } : {}
	});
}
/** Bounds an operation by both its owner lifecycle and one total wall-clock budget. */
async function withAbortableTimeout(params) {
	const signal = params.signal;
	if (signal?.aborted) throw resolveAbortError(signal);
	let removeAbortListener;
	const operation = signal ? Promise.race([params.promise, new Promise((_, reject) => {
		const onAbort = () => reject(resolveAbortError(signal));
		signal.addEventListener("abort", onAbort, { once: true });
		removeAbortListener = () => signal.removeEventListener("abort", onAbort);
	})]) : params.promise;
	try {
		return await withTimeout$1(operation, params.timeoutMs, params.timeoutMessage, params.createTimeoutError);
	} finally {
		removeAbortListener?.();
	}
}
//#endregion
//#region extensions/codex/src/app-server/client-runtime.ts
/** Client-scoped Codex auth and account observers. */
/** Match Codex's native grace window without retaining inactive conversations indefinitely. */
const CODEX_APP_SERVER_LIVE_THREAD_IDLE_TIMEOUT_MS = 18e5;
/** Native-child parents are active ownership, so only otherwise-idle threads count against this cap. */
const CODEX_APP_SERVER_LIVE_THREAD_MAX_IDLE = 64;
/** Return a deterministic error before Codex cancels its ten-second external-auth request. */
const CODEX_EXTERNAL_AUTH_REFRESH_TIMEOUT_MS = 9e3;
const configuredClients = /* @__PURE__ */ new WeakMap();
const physicalThreadReleases = /* @__PURE__ */ new WeakMap();
const claimedThreadReleaseTokens = /* @__PURE__ */ new WeakMap();
/** Only an initialized, still-open physical client can own retained native subscriptions. */
function isCodexAppServerClientRuntimeLive(client) {
	const runtime = configuredClients.get(client);
	return runtime !== void 0 && !runtime.closed;
}
/** Immutable declarations are data owned by this physical client, never retained executors. */
async function readCodexClientSessionMeta(client, sessionsRoot, boundRolloutPath, threadId) {
	let rolloutPath = boundRolloutPath;
	const runtime = configuredClients.get(client);
	if (!runtime || runtime.closed) throw new Error("Codex native metadata requires a live selected client");
	const cached = runtime.sessionMetadata.get(threadId);
	if (cached && cached.sessionsRoot === sessionsRoot && (!rolloutPath || cached.rolloutPath === rolloutPath)) return structuredClone(cached.metadata);
	if (!rolloutPath) {
		const { thread } = await client.request("thread/read", {
			threadId,
			includeTurns: false
		});
		if (thread.id !== threadId || !thread.path) throw new Error("Codex native metadata has no verified thread path");
		rolloutPath = thread.path;
	}
	const metadata = await readCodexSessionMeta(sessionsRoot, rolloutPath, threadId);
	if (runtime.closed || !metadata) throw new Error("Codex native metadata is unavailable on the selected client");
	runtime.sessionMetadata.delete(threadId);
	runtime.sessionMetadata.set(threadId, {
		sessionsRoot,
		rolloutPath,
		metadata
	});
	pruneMapToMaxSize(runtime.sessionMetadata, CODEX_APP_SERVER_LIVE_THREAD_MAX_IDLE);
	return structuredClone(metadata);
}
/** Installs one auth-refresh handler and one rate-limit observer per physical client. */
function ensureCodexAppServerClientRuntime(client, context) {
	const existing = configuredClients.get(client);
	if (existing) {
		if (existing.closed) return;
		existing.context = {
			...existing.context,
			config: context.config
		};
		return;
	}
	const runtime = {
		context,
		closed: false,
		retainedThreads: /* @__PURE__ */ new Map(),
		claimedThreads: /* @__PURE__ */ new Map(),
		releasingThreads: /* @__PURE__ */ new Map(),
		protectedThreads: /* @__PURE__ */ new Map(),
		sessionMetadata: /* @__PURE__ */ new Map()
	};
	configuredClients.set(client, runtime);
	client.addCloseHandler(() => {
		runtime.closed = true;
		if (runtime.evictionTimer) {
			clearTimeout(runtime.evictionTimer);
			runtime.evictionTimer = void 0;
		}
		runtime.retainedThreads.clear();
		runtime.claimedThreads.clear();
		runtime.protectedThreads.clear();
		runtime.sessionMetadata.clear();
	});
	client.addRequestHandler(async (request) => {
		if (request.method !== "account/chatgptAuthTokens/refresh") return;
		if (runtime.context.authMode === "prepared-api-key") throw new Error("ChatGPT token refresh is unavailable for prepared Codex API-key auth.");
		const previousAccountId = isJsonObject(request.params) && typeof request.params.previousAccountId === "string" ? request.params.previousAccountId.trim() || void 0 : void 0;
		try {
			const tokens = await withTimeout$1(refreshCodexAppServerAuthTokens({
				agentDir: runtime.context.agentDir,
				authProfileId: runtime.context.authProfileId,
				...previousAccountId ? { previousAccountId } : {},
				...runtime.context.authProfileStore ? { authProfileStore: runtime.context.authProfileStore } : {},
				config: runtime.context.config
			}), CODEX_EXTERNAL_AUTH_REFRESH_TIMEOUT_MS, "Codex app-server ChatGPT token refresh timed out before its external-auth deadline. Retry the request; if it persists, sign in again with OpenClaw.");
			if (previousAccountId && tokens.chatgptAccountId !== previousAccountId) throw new Error("ChatGPT workspace changed during Codex token refresh. Retry to start a client for the selected workspace.");
			return { ...tokens };
		} catch (error) {
			runtime.context.onAuthRefreshFailure?.();
			throw error;
		}
	});
	client.addNotificationHandler((notification) => {
		if (notification.method === "account/rateLimits/updated") {
			mergeCodexRateLimitsUpdate(client, notification.params);
			return;
		}
		if (notification.method === "thread/archived" || notification.method === "thread/deleted" || notification.method === "thread/closed") {
			const threadId = notification.params?.threadId;
			if (typeof threadId === "string") {
				const releasing = runtime.releasingThreads.get(threadId);
				if (releasing) releasing.invalidated = true;
				runtime.retainedThreads.delete(threadId);
				runtime.claimedThreads.delete(threadId);
				runtime.sessionMetadata.delete(threadId);
				scheduleRetainedThreadEviction(client, runtime);
			}
		}
	});
}
function scheduleRetainedThreadEviction(client, runtime) {
	if (runtime.evictionTimer) {
		clearTimeout(runtime.evictionTimer);
		runtime.evictionTimer = void 0;
	}
	if (runtime.closed) return;
	let expiresAt = Number.POSITIVE_INFINITY;
	for (const [threadId, thread] of runtime.retainedThreads) if (!runtime.protectedThreads.has(threadId)) expiresAt = Math.min(expiresAt, thread.expiresAt);
	if (!Number.isFinite(expiresAt)) return;
	runtime.evictionTimer = setTimeout(() => {
		runtime.evictionTimer = void 0;
		evictExpiredRetainedThreads(client, runtime).catch((error) => {
			embeddedAgentLog.warn("codex retained thread expiry failed", { reason: formatErrorMessage(error) });
		});
	}, Math.max(0, expiresAt - Date.now()));
	runtime.evictionTimer.unref?.();
}
async function releaseRetainedThread(client, runtime, threadId, assertCurrent) {
	const pendingRelease = runtime.releasingThreads.get(threadId);
	if (pendingRelease) {
		await pendingRelease.completion;
		assertCurrent?.();
		return false;
	}
	const retained = runtime.retainedThreads.get(threadId);
	if (!retained) return false;
	const olderThreadIds = /* @__PURE__ */ new Set();
	for (const candidateThreadId of runtime.retainedThreads.keys()) {
		if (candidateThreadId === threadId) break;
		olderThreadIds.add(candidateThreadId);
	}
	runtime.retainedThreads.delete(threadId);
	scheduleRetainedThreadEviction(client, runtime);
	const transition = { completion: Promise.resolve().then(() => {
		assertCurrent?.();
		return assertCurrent ? retained.release(threadId, assertCurrent) : retained.release(threadId);
	}) };
	runtime.releasingThreads.set(threadId, transition);
	try {
		await transition.completion;
		return true;
	} catch (error) {
		if (!runtime.closed && !transition.invalidated && runtime.releasingThreads.get(threadId) === transition && !runtime.retainedThreads.has(threadId) && !runtime.claimedThreads.has(threadId)) {
			if (retained.ephemeralPolicy === void 0) retained.expiresAt = Date.now() + CODEX_APP_SERVER_LIVE_THREAD_IDLE_TIMEOUT_MS;
			const newerThreads = [...runtime.retainedThreads.entries()].filter(([candidateThreadId]) => !olderThreadIds.has(candidateThreadId));
			for (const [candidateThreadId] of newerThreads) runtime.retainedThreads.delete(candidateThreadId);
			runtime.retainedThreads.set(threadId, retained);
			for (const [candidateThreadId, newerThread] of newerThreads) runtime.retainedThreads.set(candidateThreadId, newerThread);
		}
		throw error;
	} finally {
		if (runtime.releasingThreads.get(threadId) === transition) runtime.releasingThreads.delete(threadId);
		scheduleRetainedThreadEviction(client, runtime);
	}
}
async function evictExpiredRetainedThreads(client, runtime) {
	const now = Date.now();
	for (const [threadId, thread] of runtime.retainedThreads) if (thread.expiresAt <= now && !runtime.protectedThreads.has(threadId)) await releaseRetainedThread(client, runtime, threadId);
	scheduleRetainedThreadEviction(client, runtime);
}
async function evictExcessIdleThreads(client, runtime) {
	const idleThreads = () => [...runtime.retainedThreads].filter(([threadId, thread]) => thread.ephemeralPolicy === void 0 && !runtime.protectedThreads.has(threadId));
	let idleThreadIds = idleThreads();
	while (idleThreadIds.length > CODEX_APP_SERVER_LIVE_THREAD_MAX_IDLE) {
		await releaseRetainedThread(client, runtime, idleThreadIds[0][0]);
		idleThreadIds = idleThreads();
	}
}
/** Retain separately owned Codex subscriptions; completing B must never cold-restart A. */
async function retainCodexAppServerLiveThread(client, threadId, releaseThread, configFingerprint, serviceTier, ephemeralPolicy) {
	const runtime = configuredClients.get(client);
	if (!runtime || runtime.closed) return false;
	const claimed = runtime.claimedThreads.get(threadId);
	if (claimed !== void 0 && (releaseThread === void 0 || claimedThreadReleaseTokens.get(releaseThread) !== claimed)) return false;
	const pendingRelease = runtime.releasingThreads.get(threadId);
	if (pendingRelease) {
		await pendingRelease.completion;
		return false;
	}
	runtime.retainedThreads.delete(threadId);
	const retained = {
		configFingerprint,
		ephemeralPolicy,
		serviceTier,
		expiresAt: ephemeralPolicy === void 0 ? Date.now() + CODEX_APP_SERVER_LIVE_THREAD_IDLE_TIMEOUT_MS : Number.POSITIVE_INFINITY,
		release: (releaseThread ? physicalThreadReleases.get(releaseThread) ?? releaseThread : void 0) ?? (async (releasedThreadId, assertCurrent) => {
			await unsubscribeCodexAppServerLiveThread(client, releasedThreadId, 5e3, assertCurrent);
		})
	};
	runtime.retainedThreads.set(threadId, retained);
	try {
		await evictExcessIdleThreads(client, runtime);
	} catch (error) {
		if (runtime.retainedThreads.get(threadId) === retained) runtime.retainedThreads.delete(threadId);
		scheduleRetainedThreadEviction(client, runtime);
		embeddedAgentLog.warn("codex retained thread capacity eviction failed", {
			threadId,
			reason: formatErrorMessage(error)
		});
		return false;
	}
	if (runtime.closed) return false;
	if (claimed !== void 0 && runtime.claimedThreads.get(threadId) === claimed) runtime.claimedThreads.delete(threadId);
	scheduleRetainedThreadEviction(client, runtime);
	return true;
}
/** Transfer one idle subscription to its next turn or compaction without touching sibling threads. */
async function consumeCodexAppServerLiveThread(client, threadId, configFingerprint) {
	const runtime = configuredClients.get(client);
	if (!runtime || runtime.closed) return;
	const pendingRelease = runtime.releasingThreads.get(threadId);
	if (pendingRelease) {
		await pendingRelease.completion;
		return;
	}
	const retained = runtime.retainedThreads.get(threadId);
	if (!retained || configFingerprint !== void 0 && retained.configFingerprint !== configFingerprint) return;
	return claimCodexAppServerThreadOwnership(client, runtime, threadId, retained);
}
/** Claims an observed Codex auto-subscription without exposing a temporarily idle owner. */
async function claimCodexAppServerLiveThread(client, threadId) {
	const runtime = configuredClients.get(client);
	if (!runtime || runtime.closed || runtime.claimedThreads.has(threadId)) return;
	const pendingRelease = runtime.releasingThreads.get(threadId);
	if (pendingRelease) {
		await pendingRelease.completion;
		return;
	}
	return claimCodexAppServerThreadOwnership(client, runtime, threadId, runtime.retainedThreads.get(threadId) ?? {
		expiresAt: Date.now() + CODEX_APP_SERVER_LIVE_THREAD_IDLE_TIMEOUT_MS,
		release: async (releasedThreadId, assertCurrent) => {
			await unsubscribeCodexAppServerLiveThread(client, releasedThreadId, 5e3, assertCurrent);
		}
	});
}
function claimCodexAppServerThreadOwnership(client, runtime, threadId, retained) {
	runtime.retainedThreads.delete(threadId);
	const claimed = Symbol(threadId);
	runtime.claimedThreads.set(threadId, claimed);
	scheduleRetainedThreadEviction(client, runtime);
	const assertCurrent = () => {
		if (runtime.closed || runtime.claimedThreads.get(threadId) !== claimed) throw new Error(`Codex thread subscription ownership changed: ${threadId}`);
	};
	const release = async (releasedThreadId, assertReleaseCurrent) => {
		if (releasedThreadId !== threadId || runtime.claimedThreads.get(threadId) !== claimed) {
			assertReleaseCurrent?.();
			return;
		}
		const pendingRelease = runtime.releasingThreads.get(threadId);
		if (pendingRelease) {
			await pendingRelease.completion;
			return;
		}
		const transition = { completion: Promise.resolve().then(async () => {
			if (runtime.closed || runtime.claimedThreads.get(threadId) !== claimed) {
				assertReleaseCurrent?.();
				return;
			}
			assertReleaseCurrent?.();
			await (assertReleaseCurrent ? retained.release(releasedThreadId, assertReleaseCurrent) : retained.release(releasedThreadId));
		}) };
		runtime.releasingThreads.set(threadId, transition);
		try {
			await transition.completion;
			if (runtime.claimedThreads.get(threadId) === claimed) runtime.claimedThreads.delete(threadId);
		} finally {
			if (runtime.releasingThreads.get(threadId) === transition) runtime.releasingThreads.delete(threadId);
		}
	};
	physicalThreadReleases.set(release, retained.release);
	claimedThreadReleaseTokens.set(release, claimed);
	return {
		assertCurrent,
		configFingerprint: retained.configFingerprint,
		ephemeralPolicy: retained.ephemeralPolicy,
		serviceTier: retained.serviceTier,
		release
	};
}
/** Distinguish active claimed ownership from an already-evicted idle subscription. */
function hasCodexAppServerLiveThread(client, threadId) {
	const runtime = configuredClients.get(client);
	return runtime !== void 0 && !runtime.closed && (runtime.retainedThreads.has(threadId) || runtime.releasingThreads.has(threadId) || runtime.claimedThreads.has(threadId));
}
function isCodexAppServerLiveThreadClaimed(client, threadId) {
	const runtime = configuredClients.get(client);
	return runtime !== void 0 && !runtime.closed && runtime.claimedThreads.has(threadId);
}
/** Release the exact physical subscription and finish only its observed ownership generation. */
async function unsubscribeCodexAppServerLiveThread(client, threadId, timeoutMs, assertCurrent) {
	const runtime = configuredClients.get(client);
	const claimed = runtime?.claimedThreads.get(threadId);
	const retained = runtime?.retainedThreads.get(threadId);
	let transition = runtime?.releasingThreads.get(threadId);
	if (transition?.physicalRelease) {
		await transition.physicalRelease;
		assertCurrent?.();
		return;
	}
	const physicalRelease = Promise.resolve().then(async () => {
		if (claimed !== void 0 && runtime?.claimedThreads.get(threadId) !== claimed || retained !== void 0 && runtime?.retainedThreads.get(threadId) !== retained) {
			assertCurrent?.();
			return;
		}
		assertCurrent?.();
		await client.request("thread/unsubscribe", { threadId }, {
			timeoutMs,
			assertCurrent
		});
		assertCurrent?.();
	});
	const ownsTransition = runtime !== void 0 && transition === void 0;
	if (transition) transition.physicalRelease = physicalRelease;
	else if (runtime) {
		transition = {
			completion: physicalRelease,
			physicalRelease
		};
		runtime.releasingThreads.set(threadId, transition);
	}
	try {
		await physicalRelease;
		if (retained !== void 0 && runtime?.retainedThreads.get(threadId) === retained) {
			runtime.retainedThreads.delete(threadId);
			scheduleRetainedThreadEviction(client, runtime);
		}
		if (claimed !== void 0 && runtime?.claimedThreads.get(threadId) === claimed) runtime.claimedThreads.delete(threadId);
	} finally {
		if (ownsTransition && runtime.releasingThreads.get(threadId) === transition) runtime.releasingThreads.delete(threadId);
	}
}
/** Reset/end owns the exact thread; failed generation retirement must never release its successor. */
async function releaseCodexAppServerLiveThread(client, threadId, assertCurrent) {
	const runtime = configuredClients.get(client);
	return runtime ? await releaseRetainedThread(client, runtime, threadId, assertCurrent) : false;
}
/** Native child work pins its parent's subscription even after the foreground parent turn ends. */
function protectCodexAppServerLiveThread(client, threadId) {
	const runtime = configuredClients.get(client);
	if (!runtime || runtime.closed) return () => void 0;
	runtime.protectedThreads.set(threadId, (runtime.protectedThreads.get(threadId) ?? 0) + 1);
	scheduleRetainedThreadEviction(client, runtime);
	let protectedThread = true;
	return () => {
		if (!protectedThread) return;
		protectedThread = false;
		if (runtime.closed) return;
		const count = runtime.protectedThreads.get(threadId) ?? 0;
		if (count <= 1) {
			runtime.protectedThreads.delete(threadId);
			const retained = runtime.retainedThreads.get(threadId);
			if (retained) {
				if (retained.ephemeralPolicy === void 0) retained.expiresAt = Date.now() + CODEX_APP_SERVER_LIVE_THREAD_IDLE_TIMEOUT_MS;
				runtime.retainedThreads.delete(threadId);
				runtime.retainedThreads.set(threadId, retained);
			}
		} else runtime.protectedThreads.set(threadId, count - 1);
		scheduleRetainedThreadEviction(client, runtime);
		evictExcessIdleThreads(client, runtime).catch((error) => {
			embeddedAgentLog.warn("codex retained thread unpin eviction failed", {
				threadId,
				reason: formatErrorMessage(error)
			});
		});
	};
}
//#endregion
//#region extensions/codex/src/app-server/dynamic-tool-response-state.ts
/** Retains the host-owned app preview without adding it to Codex's response payload. */
function withDynamicToolTranscriptDetails(response, details) {
	if (details === void 0) return response;
	Object.defineProperty(response, "transcriptDetails", {
		configurable: true,
		enumerable: false,
		value: details
	});
	return response;
}
function withDynamicToolTerminalResolution(response, terminalResolution) {
	if (terminalResolution) {
		Object.defineProperties(response, {
			terminalResolution: {
				configurable: true,
				enumerable: false,
				value: terminalResolution
			},
			executionStarted: {
				configurable: true,
				enumerable: false,
				value: terminalResolution.executionStarted
			},
			...terminalResolution.executedArguments ? { executedArguments: {
				configurable: true,
				enumerable: false,
				value: terminalResolution.executedArguments
			} } : {}
		});
		withDynamicToolSideEffectEvidence(response, terminalResolution.sideEffectEvidence);
	}
	return response;
}
function withDynamicToolExecutionState(response, state) {
	Object.defineProperties(response, {
		executedArguments: {
			configurable: true,
			enumerable: false,
			value: state.executedArguments
		},
		executionStarted: {
			configurable: true,
			enumerable: false,
			value: state.executionStarted
		}
	});
	return withDynamicToolSideEffectEvidence(response, state.sideEffectEvidence === true);
}
function withDynamicToolSideEffectEvidence(response, sideEffectEvidence) {
	if (!sideEffectEvidence) {
		delete response.sideEffectEvidence;
		return response;
	}
	Object.defineProperty(response, "sideEffectEvidence", {
		configurable: true,
		enumerable: false,
		value: true
	});
	return response;
}
function createFailedDynamicToolResponse(message, options) {
	const response = {
		contentItems: [{
			type: "inputText",
			text: message
		}],
		success: false
	};
	Object.defineProperties(response, {
		diagnosticTerminalReason: {
			configurable: true,
			enumerable: false,
			value: options?.terminalReason ?? "failed"
		},
		diagnosticTerminalType: {
			configurable: true,
			enumerable: false,
			value: "error"
		}
	});
	if (options?.executionStarted !== void 0) Object.defineProperty(response, "executionStarted", {
		configurable: true,
		enumerable: false,
		value: options.executionStarted
	});
	if (options?.executedArguments !== void 0) Object.defineProperty(response, "executedArguments", {
		configurable: true,
		enumerable: false,
		value: options.executedArguments
	});
	return withDynamicToolSideEffectEvidence(response, options?.sideEffectEvidence === true);
}
//#endregion
//#region extensions/codex/src/app-server/tool-abort-terminal-reason.ts
/** Leaf helper shared by native and dynamic tool diagnostics. */
const CODEX_TIMEOUT_ABORT_REASONS = /* @__PURE__ */ new Set([
	"codex_startup_timeout",
	"turn_completion_idle_timeout",
	"turn_progress_idle_timeout",
	"turn_terminal_idle_timeout"
]);
/** Preserves timeout provenance when an enclosing run aborts an active tool. */
function resolveCodexToolAbortTerminalReason(signal) {
	try {
		const reason = signal.reason;
		if (typeof reason === "string") {
			if (CODEX_TIMEOUT_ABORT_REASONS.has(reason)) return "timed_out";
			return reason === "client_closed" ? "failed" : "cancelled";
		}
		if (reason && typeof reason === "object") {
			const record = reason;
			if (record.name === "TimeoutError" || record.reason === "timeout") return "timed_out";
		}
	} catch {
		return "cancelled";
	}
	return "cancelled";
}
//#endregion
//#region extensions/codex/src/app-server/dynamic-tool-execution.ts
/**
* Timeout, terminal-release, and diagnostic helpers for Codex dynamic tool
* calls.
*/
/** Default timeout for Codex dynamic tool calls. */
const CODEX_DYNAMIC_TOOL_TIMEOUT_MS = 9e4;
/** Hard cap for per-call Codex dynamic tool timeout overrides. */
const CODEX_DYNAMIC_TOOL_MAX_TIMEOUT_MS = 6e5;
const CODEX_DYNAMIC_TOOL_TIMEOUT_SECONDS_GRACE_MS = 3e4;
const CODEX_DYNAMIC_IMAGE_GENERATION_TOOL_TIMEOUT_MS = 12e4;
const CODEX_DYNAMIC_COMPUTER_GATEWAY_TIMEOUT_MS = 3e4;
const CODEX_DYNAMIC_COMPUTER_COMPLETION_GRACE_MS = 3e4;
/** Timeout for image-understanding style dynamic tool calls. */
const CODEX_DYNAMIC_IMAGE_TOOL_TIMEOUT_MS = 6e4;
/** Timeout for message-delivery dynamic tool calls. */
const CODEX_DYNAMIC_MESSAGE_TOOL_TIMEOUT_MS = 6e5;
/** Outer default for collector waits: full swarm budget plus completion grace. */
const CODEX_DYNAMIC_AGENTS_WAIT_TOOL_TIMEOUT_MS = 63e4;
const LOG_FIELD_MAX_LENGTH = 160;
function normalizeLogField(value) {
	if (typeof value !== "string") return;
	const normalized = value.replaceAll(String.fromCharCode(27), " ").replaceAll("\r", " ").replaceAll("\n", " ").replaceAll("	", " ").trim();
	if (!normalized) return;
	return normalized.length > LOG_FIELD_MAX_LENGTH ? `${truncateUtf16Safe(normalized, 157)}...` : normalized;
}
function readNumericTimeoutMs(value) {
	if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
	if (typeof value === "string") {
		const parsed = parseStrictNonNegativeInteger(value);
		if (parsed !== void 0) return Math.max(0, Math.floor(parsed));
	}
}
function formatDynamicToolTimeoutDetails(params) {
	const tool = normalizeLogField(params.call.tool) ?? "unknown";
	const baseMeta = {
		tool: params.call.tool,
		toolCallId: params.call.callId,
		threadId: params.call.threadId,
		turnId: params.call.turnId,
		timeoutMs: params.timeoutMs,
		timeoutKind: "codex_dynamic_tool_rpc"
	};
	if (tool !== "process" || !isJsonObject(params.call.arguments)) return {
		responseMessage: `OpenClaw dynamic tool call timed out after ${params.timeoutMs}ms while running tool ${tool}.`,
		consoleMessage: `codex dynamic tool timeout: tool=${tool} toolTimeoutMs=${params.timeoutMs}; per-tool-call watchdog, not session idle`,
		meta: baseMeta
	};
	const action = normalizeLogField(params.call.arguments.action);
	const sessionId = normalizeLogField(params.call.arguments.sessionId);
	const requestedTimeoutMs = readNumericTimeoutMs(params.call.arguments.timeout);
	const actionPart = action ? ` action=${action}` : "";
	const sessionPart = sessionId ? ` sessionId=${sessionId}` : "";
	const requestedPart = requestedTimeoutMs === void 0 ? "" : ` requestedWaitMs=${requestedTimeoutMs}`;
	const retryHint = action === "poll" ? "; repeated lines usually mean process-poll retry churn, not model progress" : "";
	const responseTarget = action || sessionId ? ` while waiting for process${actionPart}${sessionPart}` : " while waiting for the process tool";
	return {
		responseMessage: `OpenClaw dynamic tool call timed out after ${params.timeoutMs}ms${responseTarget}. This is a tool RPC timeout, not a session idle timeout.`,
		consoleMessage: `codex process tool timeout:${actionPart}${sessionPart} toolTimeoutMs=${params.timeoutMs}${requestedPart}; per-tool-call watchdog, not session idle${retryHint}`,
		meta: {
			...baseMeta,
			processAction: action,
			processSessionId: sessionId,
			processRequestedTimeoutMs: requestedTimeoutMs
		}
	};
}
/**
* Runs a dynamic tool call with run-abort and the budget prepared by
* resolveDynamicToolCallTimeoutMs, preserving tool-specific completion grace.
*/
async function handleDynamicToolCallWithTimeout(params) {
	let didNotifyAgentToolResult = false;
	const conservativeRaceResponses = /* @__PURE__ */ new WeakSet();
	const finalizeTerminal = (response) => {
		const executionSnapshot = params.toolBridge.consumeToolExecutionSnapshot?.(params.call.callId);
		const ownerKey = params.toolBridge.sideEffectOwnerKeyForTool?.(params.call.tool);
		const observedExecutionStarted = executionSnapshot?.executionStarted ?? (conservativeRaceResponses.has(response) ? void 0 : response.executionStarted);
		const terminalResolution = params.observeToolTerminal?.({
			toolCallId: params.call.callId,
			toolName: params.call.tool,
			arguments: response.executedArguments ?? executionSnapshot?.executedArguments ?? params.call.arguments,
			...params.toolMeta ? { meta: params.toolMeta } : {},
			...ownerKey ? { ownerMutation: { ownerKey } } : {},
			...observedExecutionStarted !== void 0 ? { executionStarted: observedExecutionStarted } : {},
			outcome: response.success ? "success" : "failure",
			...!response.success ? { failure: { error: readDynamicToolResponseText(response) } } : {}
		});
		return withDynamicToolTerminalResolution(response, terminalResolution);
	};
	const createFailedAfterPossibleDispatch = (message, terminalReason) => {
		const response = createFailedDynamicToolResponse(message, {
			executionStarted: true,
			sideEffectEvidence: true,
			terminalReason
		});
		conservativeRaceResponses.add(response);
		return response;
	};
	const notifyAgentToolResult = (event) => {
		if (didNotifyAgentToolResult) return;
		didNotifyAgentToolResult = true;
		try {
			params.onAgentToolResult?.(event);
		} catch (error) {
			embeddedAgentLog.warn(`onAgentToolResult handler failed: tool=${params.call.tool} error=${String(error)}`);
		}
	};
	const notifyFailedToolResult = (message, terminalReason = "failed") => {
		notifyAgentToolResult({
			toolName: params.call.tool,
			result: {
				content: [{
					type: "text",
					text: message
				}],
				details: {
					status: terminalReason,
					error: message
				}
			},
			isError: true
		});
	};
	if (params.signal.aborted) {
		const message = "OpenClaw dynamic tool call aborted before execution.";
		const terminalReason = resolveCodexToolAbortTerminalReason(params.signal);
		params.onFallbackSelected?.();
		notifyFailedToolResult(message, terminalReason);
		return finalizeTerminal(createFailedDynamicToolResponse(message, {
			executionStarted: false,
			terminalReason
		}));
	}
	const controller = new AbortController();
	let timeout;
	let timedOut = false;
	let resolveAbort;
	const abortFromRun = () => {
		const message = "OpenClaw dynamic tool call aborted.";
		const terminalReason = resolveCodexToolAbortTerminalReason(params.signal);
		params.onFallbackSelected?.();
		controller.abort(params.signal.reason ?? /* @__PURE__ */ new Error(message));
		notifyFailedToolResult(message, terminalReason);
		resolveAbort?.(createFailedAfterPossibleDispatch(message, terminalReason));
	};
	const abortPromise = new Promise((resolve) => {
		resolveAbort = resolve;
	});
	const timeoutPromise = new Promise((resolve) => {
		const { timeoutMs } = params;
		timeout = setTimeout(() => {
			timedOut = true;
			const timeoutDetails = formatDynamicToolTimeoutDetails({
				call: params.call,
				timeoutMs
			});
			params.onFallbackSelected?.();
			controller.abort(new Error(timeoutDetails.responseMessage));
			params.onTimeout?.();
			embeddedAgentLog.warn("codex dynamic tool call timed out", {
				...timeoutDetails.meta,
				consoleMessage: timeoutDetails.consoleMessage
			});
			notifyFailedToolResult(timeoutDetails.responseMessage, "timed_out");
			resolve(createFailedAfterPossibleDispatch(timeoutDetails.responseMessage, "timed_out"));
		}, timeoutMs);
		timeout.unref?.();
	});
	try {
		params.signal.addEventListener("abort", abortFromRun, { once: true });
		if (params.signal.aborted) abortFromRun();
		const response = await Promise.race([
			params.toolBridge.handleToolCall(params.call, {
				signal: controller.signal,
				onAgentToolResult: notifyAgentToolResult,
				toolCallOrdinal: params.toolCallOrdinal,
				retainExecutionSnapshot: true
			}),
			abortPromise,
			timeoutPromise
		]);
		if (!response.success && !didNotifyAgentToolResult) notifyFailedToolResult(readDynamicToolResponseText(response), response.diagnosticTerminalReason ?? "failed");
		return finalizeTerminal(response);
	} catch (error) {
		const terminalReason = params.signal.aborted ? resolveCodexToolAbortTerminalReason(params.signal) : resolveToolExecutionErrorKind(error);
		const message = formatToolExecutionErrorMessage(error, "OpenClaw dynamic tool call failed.");
		notifyFailedToolResult(message, terminalReason);
		return finalizeTerminal(createFailedAfterPossibleDispatch(message, terminalReason));
	} finally {
		if (timeout) clearTimeout(timeout);
		params.signal.removeEventListener("abort", abortFromRun);
		resolveAbort = void 0;
		if (!timedOut && !controller.signal.aborted) controller.abort(/* @__PURE__ */ new Error("OpenClaw dynamic tool call finished."));
	}
}
function readDynamicToolResponseText(response) {
	return response.contentItems.flatMap((item) => item.type === "inputText" && typeof item.text === "string" ? [item.text] : []).join("\n").trim() || "OpenClaw dynamic tool call failed.";
}
/** Strips OpenClaw-only metadata before sending a dynamic tool response to Codex. */
function toCodexDynamicToolProtocolResponse(response) {
	return {
		contentItems: response.contentItems,
		success: response.success
	};
}
/** Adds async-started progress details when a tool result continues out of band. */
function toCodexDynamicToolProgressResponse(response, protocolResponse) {
	const transcriptDetails = isJsonObject(response.transcriptDetails) ? response.transcriptDetails : void 0;
	const mcpAppPreview = isJsonObject(transcriptDetails?.mcpAppPreview) ? transcriptDetails.mcpAppPreview : void 0;
	const progressDetails = mcpAppPreview ? { mcpAppPreview } : void 0;
	if (response.asyncStarted !== true && progressDetails === void 0) return protocolResponse;
	return {
		...protocolResponse,
		...progressDetails ? { details: progressDetails } : {},
		...response.asyncStarted === true ? { details: {
			...progressDetails,
			async: true,
			status: "started"
		} } : {}
	};
}
/** Decides whether a terminal dynamic tool response can release the Codex turn. */
function shouldReleaseTurnAfterTerminalDynamicTool(state) {
	return !state.completed && !state.aborted && state.responseSuccess && !state.currentTurnHadNonTerminalDynamicToolResult && state.activeAppServerTurnRequests === 0 && state.activeTurnItemIdsCount === 0 && state.pendingOpenClawDynamicToolCompletionIdsCount === 0;
}
/** Returns true when a non-async result should block terminal-release shortcuts. */
function shouldBlockTerminalReleaseForNonTerminalDynamicToolResult(response) {
	return response.asyncStarted !== true;
}
/** Resolves whether terminal diagnostic state should release, wait, or stay idle. */
function resolveTerminalDynamicToolBatchAction(state) {
	if (state.activeAppServerTurnRequests > 0 || state.activeTurnItemIdsCount > 0 || state.pendingOpenClawDynamicToolCompletionIdsCount > 0) return "wait";
	if (state.currentTurnHadNonTerminalDynamicToolResult) return "clear-nonterminal-batch";
	if (state.hasPendingTerminalDynamicToolRelease) return "release-pending-terminal";
	return "idle";
}
/** Returns true for diagnostic events that terminate a dynamic tool call. */
function isDynamicToolTerminalDiagnosticEvent(event) {
	return event.type === "tool.execution.completed" || event.type === "tool.execution.error" || event.type === "tool.execution.blocked";
}
/** Matches terminal diagnostics to a specific dynamic tool call id/name. */
function isMatchingDynamicToolTerminalDiagnostic(params) {
	if (params.event.toolCallId !== params.call.callId || params.event.toolName !== params.call.tool) return false;
	if (params.runId !== void 0) return params.event.runId === params.runId;
	if (params.sessionId !== void 0) return params.event.sessionId === params.sessionId;
	if (params.sessionKey !== void 0) return params.event.sessionKey === params.sessionKey;
	return params.event.runId === void 0 && params.event.sessionId === void 0 && params.event.sessionKey === void 0;
}
/** Checks pending diagnostics for a terminal event matching a tool call. */
function hasPendingDynamicToolTerminalDiagnostic(params) {
	return hasPendingInternalDiagnosticEvent((event) => {
		if (!isDynamicToolTerminalDiagnosticEvent(event)) return false;
		return isMatchingDynamicToolTerminalDiagnostic({
			event,
			call: params.call,
			runId: params.runId,
			sessionId: params.sessionId,
			sessionKey: params.sessionKey
		});
	});
}
/** Resolves per-tool timeout, applying media/message defaults and hard caps. */
function resolveDynamicToolCallTimeoutMs(params) {
	const args = isJsonObject(params.call.arguments) ? params.call.arguments : void 0;
	if (params.call.tool === "ask_user" || params.call.tool === "secrets" && args?.action === "request") try {
		return normalizeQuestionTimeoutSeconds(args?.timeoutSeconds) * 1e3 + CODEX_DYNAMIC_TOOL_TIMEOUT_SECONDS_GRACE_MS;
	} catch {
		return CODEX_DYNAMIC_TOOL_TIMEOUT_MS;
	}
	if (params.call.tool === "computer") return clampDynamicToolTimeoutMs(readComputerToolTimeoutMs(params.call.arguments));
	if (params.call.tool === "message") return CODEX_DYNAMIC_MESSAGE_TOOL_TIMEOUT_MS;
	if (params.call.tool === "agents_wait") {
		const requestedMs = readDynamicToolCallTimeoutMs(params.call.arguments) ?? readConfiguredDynamicToolTimeoutMs(params.call.tool, params.config) ?? CODEX_DYNAMIC_AGENTS_WAIT_TOOL_TIMEOUT_MS;
		return Math.max(1, Math.min(63e4, Math.floor(requestedMs)));
	}
	return clampDynamicToolTimeoutMs(readDynamicToolCallTimeoutMs(params.call.arguments) ?? readConfiguredDynamicToolTimeoutMs(params.call.tool, params.config) ?? CODEX_DYNAMIC_TOOL_TIMEOUT_MS);
}
/** Transport guard stays outside the handler's bounded tool wait and completion grace. */
function resolveDynamicToolServerRequestTimeoutMs(call) {
	return Math.max(63e4, call ? resolveDynamicToolCallTimeoutMs({
		call,
		config: void 0
	}) : 0) + CODEX_DYNAMIC_TOOL_TIMEOUT_SECONDS_GRACE_MS;
}
function readComputerToolTimeoutMs(value) {
	const args = isJsonObject(value) ? value : void 0;
	const action = typeof args?.action === "string" ? args.action : void 0;
	const gatewayTimeoutMs = readPositiveFiniteTimeoutMs(args?.timeoutMs) ?? CODEX_DYNAMIC_COMPUTER_GATEWAY_TIMEOUT_MS;
	const gatewayCallCount = action === "screenshot" || action === "wait" ? 3 : 4;
	return (action === "wait" || action === "hold_key" ? Math.max(0, Number(args?.duration) || 0) * 1e3 : 0) + gatewayCallCount * gatewayTimeoutMs + CODEX_DYNAMIC_COMPUTER_COMPLETION_GRACE_MS;
}
function readDynamicToolCallTimeoutMs(value) {
	if (!isJsonObject(value)) return;
	const timeoutMs = readPositiveFiniteTimeoutMs(value.timeoutMs);
	if (timeoutMs !== void 0) return timeoutMs;
	const timeoutSecondsMs = readDynamicToolTimeoutSecondsAsMs(value.timeoutSeconds);
	return timeoutSecondsMs === void 0 ? void 0 : addTimerTimeoutGraceMs(timeoutSecondsMs, CODEX_DYNAMIC_TOOL_TIMEOUT_SECONDS_GRACE_MS);
}
function readConfiguredDynamicToolTimeoutMs(toolName, config) {
	if (toolName === "image_generate") {
		const imageModel = config?.agents?.defaults?.mediaModels?.image;
		if (!imageModel || typeof imageModel !== "object") return CODEX_DYNAMIC_IMAGE_GENERATION_TOOL_TIMEOUT_MS;
		return readPositiveFiniteTimeoutMs(imageModel.timeoutMs) ?? CODEX_DYNAMIC_IMAGE_GENERATION_TOOL_TIMEOUT_MS;
	}
	if (toolName === "view_image") {
		const candidates = (config?.tools?.media?.models ?? []).filter((entry) => !entry.capabilities || entry.capabilities.includes("image"));
		const capabilityTimeoutMs = readTimeoutSecondsAsMs(config?.tools?.media?.image?.timeoutSeconds);
		return Math.max(capabilityTimeoutMs ?? CODEX_DYNAMIC_IMAGE_TOOL_TIMEOUT_MS, ...candidates.map((entry) => readTimeoutSecondsAsMs(entry.timeoutSeconds) ?? capabilityTimeoutMs ?? CODEX_DYNAMIC_IMAGE_TOOL_TIMEOUT_MS));
	}
	if (toolName === "message") return CODEX_DYNAMIC_MESSAGE_TOOL_TIMEOUT_MS;
}
function readTimeoutSecondsAsMs(value) {
	const seconds = readPositiveFiniteTimeoutMs(value);
	return seconds === void 0 ? void 0 : seconds * 1e3;
}
function readDynamicToolTimeoutSecondsAsMs(value) {
	if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return;
	return value * 1e3;
}
function readPositiveFiniteTimeoutMs(value) {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : void 0;
}
function clampDynamicToolTimeoutMs(timeoutMs) {
	return Math.max(1, Math.min(CODEX_DYNAMIC_TOOL_MAX_TIMEOUT_MS, Math.floor(timeoutMs)));
}
//#endregion
//#region extensions/codex/src/app-server/elicitation-response.ts
function createCodexElicitationResponse(action, content = null, meta = null) {
	return {
		action,
		content,
		_meta: meta
	};
}
//#endregion
//#region extensions/codex/src/app-server/protocol-generated/json/DynamicToolCallParams.json
var DynamicToolCallParams_default = {
	$schema: "http://json-schema.org/draft-07/schema#",
	properties: {
		"arguments": true,
		"callId": { "type": "string" },
		"namespace": { "type": ["string", "null"] },
		"threadId": { "type": "string" },
		"tool": { "type": "string" },
		"turnId": { "type": "string" }
	},
	required: [
		"arguments",
		"callId",
		"threadId",
		"tool",
		"turnId"
	],
	title: "DynamicToolCallParams",
	type: "object"
};
//#endregion
//#region extensions/codex/src/app-server/protocol-generated/json/v2/CodexAppServerProtocolDefinitions.json
var definitions = {
	"AbsolutePathBuf": {
		"description": "A path that is guaranteed to be absolute and normalized (though it is not guaranteed to be canonicalized or exist on the filesystem).\n\nIMPORTANT: When deserializing an `AbsolutePathBuf`, a base path must be set using [AbsolutePathBufGuard::new]. If no base path is set, the deserialization will fail unless the path being deserialized is already absolute.",
		"type": "string"
	},
	"Account": { "oneOf": [
		{
			"properties": { "type": {
				"enum": ["apiKey"],
				"title": "ApiKeyAccountType",
				"type": "string"
			} },
			"required": ["type"],
			"title": "ApiKeyAccount",
			"type": "object"
		},
		{
			"properties": {
				"email": { "type": ["string", "null"] },
				"planType": { "$ref": "#/definitions/PlanType" },
				"type": {
					"enum": ["chatgpt"],
					"title": "ChatgptAccountType",
					"type": "string"
				}
			},
			"required": [
				"email",
				"planType",
				"type"
			],
			"title": "ChatgptAccount",
			"type": "object"
		},
		{
			"properties": {
				"type": {
					"enum": ["amazonBedrock"],
					"title": "AmazonBedrockAccountType",
					"type": "string"
				},
				"usesCodexManagedCredentials": {
					"default": false,
					"type": "boolean"
				}
			},
			"required": ["type"],
			"title": "AmazonBedrockAccount",
			"type": "object"
		}
	] },
	"ActivePermissionProfile": {
		"properties": {
			"extends": {
				"default": null,
				"description": "Parent profile identifier from the selected permissions profile's `extends` setting, when present.",
				"type": ["string", "null"]
			},
			"id": {
				"description": "Identifier from `default_permissions` or the implicit built-in default, such as `:workspace` or a user-defined `[permissions.<id>]` profile.",
				"type": "string"
			}
		},
		"required": ["id"],
		"type": "object"
	},
	"AgentMessageDelivery": {
		"enum": ["async"],
		"type": "string"
	},
	"AgentPath": { "type": "string" },
	"ApprovalsReviewer": {
		"description": "Configures who approval requests are routed to for review. Examples include sandbox escapes, blocked network access, MCP approval prompts, and ARC escalations. Defaults to `user`. `auto_review` uses a carefully prompted subagent to gather relevant context and apply a risk-based decision framework before approving or denying the request. The legacy value `guardian_subagent` is accepted for compatibility.",
		"enum": [
			"user",
			"auto_review",
			"guardian_subagent"
		],
		"type": "string"
	},
	"AskForApproval": { "oneOf": [{
		"additionalProperties": false,
		"properties": { "granular": {
			"properties": {
				"mcp_elicitations": { "type": "boolean" },
				"request_permissions": {
					"default": false,
					"type": "boolean"
				},
				"rules": { "type": "boolean" },
				"sandbox_approval": { "type": "boolean" },
				"skill_approval": {
					"default": false,
					"type": "boolean"
				}
			},
			"required": [
				"mcp_elicitations",
				"rules",
				"sandbox_approval"
			],
			"type": "object"
		} },
		"required": ["granular"],
		"title": "GranularAskForApproval",
		"type": "object"
	}, {
		"enum": [
			"untrusted",
			"on-request",
			"never"
		],
		"type": "string"
	}] },
	"ByteRange": {
		"properties": {
			"end": {
				"format": "uint",
				"minimum": 0,
				"type": "integer"
			},
			"start": {
				"format": "uint",
				"minimum": 0,
				"type": "integer"
			}
		},
		"required": ["end", "start"],
		"type": "object"
	},
	"CodexErrorInfo": {
		"description": "This translation layer make sure that we expose codex error code in camel case.\n\nWhen an upstream HTTP status is available (for example, from the Responses API or a provider), it is forwarded in `httpStatusCode` on the relevant `codexErrorInfo` variant.",
		"oneOf": [
			{
				"additionalProperties": false,
				"properties": { "httpConnectionFailed": {
					"properties": { "httpStatusCode": {
						"format": "uint16",
						"minimum": 0,
						"type": ["integer", "null"]
					} },
					"type": "object"
				} },
				"required": ["httpConnectionFailed"],
				"title": "HttpConnectionFailedCodexErrorInfo",
				"type": "object"
			},
			{
				"additionalProperties": false,
				"description": "Failed to connect to the response SSE stream.",
				"properties": { "responseStreamConnectionFailed": {
					"properties": { "httpStatusCode": {
						"format": "uint16",
						"minimum": 0,
						"type": ["integer", "null"]
					} },
					"type": "object"
				} },
				"required": ["responseStreamConnectionFailed"],
				"title": "ResponseStreamConnectionFailedCodexErrorInfo",
				"type": "object"
			},
			{
				"additionalProperties": false,
				"description": "The response SSE stream disconnected in the middle of a turn before completion.",
				"properties": { "responseStreamDisconnected": {
					"properties": { "httpStatusCode": {
						"format": "uint16",
						"minimum": 0,
						"type": ["integer", "null"]
					} },
					"type": "object"
				} },
				"required": ["responseStreamDisconnected"],
				"title": "ResponseStreamDisconnectedCodexErrorInfo",
				"type": "object"
			},
			{
				"additionalProperties": false,
				"description": "Reached the retry limit for responses.",
				"properties": { "responseTooManyFailedAttempts": {
					"properties": { "httpStatusCode": {
						"format": "uint16",
						"minimum": 0,
						"type": ["integer", "null"]
					} },
					"type": "object"
				} },
				"required": ["responseTooManyFailedAttempts"],
				"title": "ResponseTooManyFailedAttemptsCodexErrorInfo",
				"type": "object"
			},
			{
				"additionalProperties": false,
				"description": "Returned when `turn/start` or `turn/steer` is submitted while the current active turn cannot accept same-turn steering, for example `/review` or manual `/compact`.",
				"properties": { "activeTurnNotSteerable": {
					"properties": { "turnKind": { "$ref": "#/definitions/NonSteerableTurnKind" } },
					"required": ["turnKind"],
					"type": "object"
				} },
				"required": ["activeTurnNotSteerable"],
				"title": "ActiveTurnNotSteerableCodexErrorInfo",
				"type": "object"
			},
			{
				"enum": [
					"contextWindowExceeded",
					"sessionBudgetExceeded",
					"usageLimitExceeded",
					"rateLimitExceeded",
					"serverOverloaded",
					"cyberPolicy",
					"misalignmentPolicyViolation",
					"internalServerError",
					"unauthorized",
					"badRequest",
					"threadRollbackFailed",
					"sandboxError",
					"other"
				],
				"type": "string"
			}
		]
	},
	"CollabAgentState": {
		"properties": {
			"message": { "type": ["string", "null"] },
			"status": { "$ref": "#/definitions/CollabAgentStatus" }
		},
		"required": ["status"],
		"type": "object"
	},
	"CollabAgentStatus": {
		"enum": [
			"pendingInit",
			"running",
			"interrupted",
			"completed",
			"errored",
			"shutdown",
			"notFound"
		],
		"type": "string"
	},
	"CollabAgentTool": {
		"enum": [
			"spawnAgent",
			"sendInput",
			"resumeAgent",
			"wait",
			"closeAgent",
			"sendMessage",
			"followupTask",
			"interruptAgent",
			"listAgents"
		],
		"type": "string"
	},
	"CollabAgentToolCallStatus": {
		"enum": [
			"inProgress",
			"completed",
			"failed",
			"interrupted"
		],
		"type": "string"
	},
	"CommandAction": { "oneOf": [
		{
			"properties": {
				"command": { "type": "string" },
				"name": { "type": "string" },
				"path": { "$ref": "#/definitions/LegacyAppPathString" },
				"type": {
					"enum": ["read"],
					"title": "ReadCommandActionType",
					"type": "string"
				}
			},
			"required": [
				"command",
				"name",
				"path",
				"type"
			],
			"title": "ReadCommandAction",
			"type": "object"
		},
		{
			"properties": {
				"command": { "type": "string" },
				"path": { "type": ["string", "null"] },
				"type": {
					"enum": ["listFiles"],
					"title": "ListFilesCommandActionType",
					"type": "string"
				}
			},
			"required": ["command", "type"],
			"title": "ListFilesCommandAction",
			"type": "object"
		},
		{
			"properties": {
				"command": { "type": "string" },
				"path": { "type": ["string", "null"] },
				"query": { "type": ["string", "null"] },
				"type": {
					"enum": ["search"],
					"title": "SearchCommandActionType",
					"type": "string"
				}
			},
			"required": ["command", "type"],
			"title": "SearchCommandAction",
			"type": "object"
		},
		{
			"properties": {
				"command": { "type": "string" },
				"type": {
					"enum": ["unknown"],
					"title": "UnknownCommandActionType",
					"type": "string"
				}
			},
			"required": ["command", "type"],
			"title": "UnknownCommandAction",
			"type": "object"
		}
	] },
	"CommandExecutionSource": {
		"enum": [
			"agent",
			"userShell",
			"unifiedExecStartup",
			"unifiedExecInteraction"
		],
		"type": "string"
	},
	"CommandExecutionStatus": {
		"enum": [
			"inProgress",
			"completed",
			"failed",
			"declined"
		],
		"type": "string"
	},
	"DynamicToolCallOutputContentItem": { "oneOf": [
		{
			"properties": {
				"text": { "type": "string" },
				"type": {
					"enum": ["inputText"],
					"title": "InputTextDynamicToolCallOutputContentItemType",
					"type": "string"
				}
			},
			"required": ["text", "type"],
			"title": "InputTextDynamicToolCallOutputContentItem",
			"type": "object"
		},
		{
			"properties": {
				"imageUrl": { "type": "string" },
				"type": {
					"enum": ["inputImage"],
					"title": "InputImageDynamicToolCallOutputContentItemType",
					"type": "string"
				}
			},
			"required": ["imageUrl", "type"],
			"title": "InputImageDynamicToolCallOutputContentItem",
			"type": "object"
		},
		{
			"properties": {
				"audioUrl": { "type": "string" },
				"type": {
					"enum": ["inputAudio"],
					"title": "InputAudioDynamicToolCallOutputContentItemType",
					"type": "string"
				}
			},
			"required": ["audioUrl", "type"],
			"title": "InputAudioDynamicToolCallOutputContentItem",
			"type": "object"
		}
	] },
	"DynamicToolCallStatus": {
		"enum": [
			"inProgress",
			"completed",
			"failed"
		],
		"type": "string"
	},
	"FileUpdateChange": {
		"properties": {
			"diff": { "type": "string" },
			"kind": { "$ref": "#/definitions/PatchChangeKind" },
			"path": { "type": "string" }
		},
		"required": [
			"diff",
			"kind",
			"path"
		],
		"type": "object"
	},
	"FunctionCallOutputBody": { "anyOf": [{
		"items": { "$ref": "#/definitions/FunctionCallOutputContentItem" },
		"type": "array"
	}, { "type": "string" }] },
	"FunctionCallOutputContentItem": {
		"description": "Responses API compatible content items that can be returned by a tool call. This is a subset of ContentItem with the types we support as function call outputs.",
		"oneOf": [
			{
				"properties": {
					"text": { "type": "string" },
					"type": {
						"enum": ["input_text"],
						"title": "InputTextFunctionCallOutputContentItemType",
						"type": "string"
					}
				},
				"required": ["text", "type"],
				"title": "InputTextFunctionCallOutputContentItem",
				"type": "object"
			},
			{
				"properties": {
					"detail": { "anyOf": [{ "$ref": "#/definitions/ImageDetail" }, { "type": "null" }] },
					"image_url": { "type": "string" },
					"type": {
						"enum": ["input_image"],
						"title": "InputImageFunctionCallOutputContentItemType",
						"type": "string"
					}
				},
				"required": ["image_url", "type"],
				"title": "InputImageFunctionCallOutputContentItem",
				"type": "object"
			},
			{
				"properties": {
					"audio_url": { "type": "string" },
					"type": {
						"enum": ["input_audio"],
						"title": "InputAudioFunctionCallOutputContentItemType",
						"type": "string"
					}
				},
				"required": ["audio_url", "type"],
				"title": "InputAudioFunctionCallOutputContentItem",
				"type": "object"
			},
			{
				"properties": {
					"encrypted_content": { "type": "string" },
					"type": {
						"enum": ["encrypted_content"],
						"title": "EncryptedContentFunctionCallOutputContentItemType",
						"type": "string"
					}
				},
				"required": ["encrypted_content", "type"],
				"title": "EncryptedContentFunctionCallOutputContentItem",
				"type": "object"
			}
		]
	},
	"GitInfo": {
		"properties": {
			"branch": { "type": ["string", "null"] },
			"originUrl": { "type": ["string", "null"] },
			"sha": { "type": ["string", "null"] }
		},
		"type": "object"
	},
	"HookPromptFragment": {
		"properties": {
			"hookRunId": { "type": "string" },
			"text": { "type": "string" }
		},
		"required": ["hookRunId", "text"],
		"type": "object"
	},
	"ImageDetail": {
		"enum": [
			"auto",
			"low",
			"high",
			"original"
		],
		"type": "string"
	},
	"ImageGenerationFailure": { "oneOf": [{
		"properties": {
			"limitId": { "type": "string" },
			"resetsAt": {
				"format": "int64",
				"type": ["integer", "null"]
			},
			"type": {
				"enum": ["usageLimitExceeded"],
				"title": "UsageLimitExceededImageGenerationFailureType",
				"type": "string"
			}
		},
		"required": ["limitId", "type"],
		"title": "UsageLimitExceededImageGenerationFailure",
		"type": "object"
	}] },
	"InputModality": {
		"description": "Canonical user-input modality tags advertised by a model.",
		"oneOf": [
			{
				"description": "Plain text turns and tool payloads.",
				"enum": ["text"],
				"type": "string"
			},
			{
				"description": "Image attachments included in user turns.",
				"enum": ["image"],
				"type": "string"
			},
			{
				"description": "Audio attachments included in user turns.",
				"enum": ["audio"],
				"type": "string"
			}
		]
	},
	"LegacyAppPathString": { "type": "string" },
	"McpToolCallAppContext": {
		"properties": {
			"actionName": { "type": ["string", "null"] },
			"appName": { "type": ["string", "null"] },
			"connectorId": { "type": "string" },
			"linkId": { "type": ["string", "null"] },
			"resourceUri": { "type": ["string", "null"] }
		},
		"required": ["connectorId"],
		"type": "object"
	},
	"McpToolCallError": {
		"properties": { "message": { "type": "string" } },
		"required": ["message"],
		"type": "object"
	},
	"McpToolCallResult": {
		"properties": {
			"_meta": true,
			"content": {
				"items": true,
				"type": "array"
			},
			"structuredContent": true
		},
		"required": ["content"],
		"type": "object"
	},
	"McpToolCallStatus": {
		"enum": [
			"inProgress",
			"completed",
			"failed"
		],
		"type": "string"
	},
	"MemoryCitation": {
		"properties": {
			"entries": {
				"items": { "$ref": "#/definitions/MemoryCitationEntry" },
				"type": "array"
			},
			"threadIds": {
				"items": { "type": "string" },
				"type": "array"
			}
		},
		"required": ["entries", "threadIds"],
		"type": "object"
	},
	"MemoryCitationEntry": {
		"properties": {
			"lineEnd": {
				"format": "uint32",
				"minimum": 0,
				"type": "integer"
			},
			"lineStart": {
				"format": "uint32",
				"minimum": 0,
				"type": "integer"
			},
			"note": { "type": "string" },
			"path": { "type": "string" }
		},
		"required": [
			"lineEnd",
			"lineStart",
			"note",
			"path"
		],
		"type": "object"
	},
	"MessagePhase": {
		"description": "Classifies an assistant message as interim commentary or final answer text.\n\nProviders do not emit this consistently, so callers must treat `None` as \"phase unknown\" and keep compatibility behavior for legacy models.",
		"oneOf": [{
			"description": "Mid-turn assistant text (for example preamble/progress narration).\n\nAdditional tool calls or assistant output may follow before turn completion.",
			"enum": ["commentary"],
			"type": "string"
		}, {
			"description": "The assistant's terminal answer text for the current turn.",
			"enum": ["final_answer"],
			"type": "string"
		}]
	},
	"MisalignmentErrorDetails": {
		"properties": {
			"detailedExplanation": {
				"description": "A substantive localized explanation is required before offering continuation.",
				"type": ["string", "null"]
			},
			"errorType": {
				"description": "Open-ended classification; clients must accept categories added by Responses.",
				"type": ["string", "null"]
			},
			"steer": {
				"anyOf": [{ "$ref": "#/definitions/MisalignmentSteer" }, { "type": "null" }],
				"description": "Instruction to submit as the next turn's user input if continuation is confirmed."
			}
		},
		"type": "object"
	},
	"MisalignmentSteer": {
		"properties": { "message": { "type": "string" } },
		"required": ["message"],
		"type": "object"
	},
	"Model": {
		"properties": {
			"additionalSpeedTiers": {
				"default": [],
				"description": "Deprecated: use `serviceTiers` instead.",
				"items": { "type": "string" },
				"type": "array"
			},
			"availabilityNux": { "anyOf": [{ "$ref": "#/definitions/ModelAvailabilityNux" }, { "type": "null" }] },
			"defaultReasoningEffort": { "$ref": "#/definitions/ReasoningEffort" },
			"defaultServiceTier": {
				"default": null,
				"description": "Catalog default service tier id for this model, when one is configured.",
				"type": ["string", "null"]
			},
			"description": { "type": "string" },
			"displayName": { "type": "string" },
			"hidden": { "type": "boolean" },
			"id": { "type": "string" },
			"inputModalities": {
				"default": ["text", "image"],
				"items": { "$ref": "#/definitions/InputModality" },
				"type": "array"
			},
			"isDefault": { "type": "boolean" },
			"model": { "type": "string" },
			"modelSpecialty": {
				"default": null,
				"type": ["string", "null"]
			},
			"multiAgentVersion": {
				"anyOf": [{ "$ref": "#/definitions/MultiAgentVersion" }, { "type": "null" }],
				"description": "Multi-agent runtime declared by this model, when available."
			},
			"serviceTiers": {
				"default": [],
				"items": { "$ref": "#/definitions/ModelServiceTier" },
				"type": "array"
			},
			"supportedReasoningEfforts": {
				"items": { "$ref": "#/definitions/ReasoningEffortOption" },
				"type": "array"
			},
			"supportsPersonality": {
				"default": false,
				"type": "boolean"
			},
			"upgrade": { "type": ["string", "null"] },
			"upgradeInfo": { "anyOf": [{ "$ref": "#/definitions/ModelUpgradeInfo" }, { "type": "null" }] }
		},
		"required": [
			"defaultReasoningEffort",
			"description",
			"displayName",
			"hidden",
			"id",
			"isDefault",
			"model",
			"supportedReasoningEfforts"
		],
		"type": "object"
	},
	"ModelAvailabilityNux": {
		"properties": { "message": { "type": "string" } },
		"required": ["message"],
		"type": "object"
	},
	"ModelServiceTier": {
		"properties": {
			"description": { "type": "string" },
			"id": { "type": "string" },
			"name": { "type": "string" }
		},
		"required": [
			"description",
			"id",
			"name"
		],
		"type": "object"
	},
	"ModelUpgradeInfo": {
		"properties": {
			"migrationMarkdown": { "type": ["string", "null"] },
			"model": { "type": "string" },
			"modelLink": { "type": ["string", "null"] },
			"retirementAt": {
				"description": "Informational Unix timestamp for this upgrade's scheduled retirement, if known.",
				"format": "int64",
				"type": ["integer", "null"]
			},
			"upgradeCopy": { "type": ["string", "null"] }
		},
		"required": ["model"],
		"type": "object"
	},
	"MultiAgentMode": {
		"description": "Controls the effective multi-agent delegation instructions for a turn. `custom` means the configured mode hint defines the policy instead of a built-in policy.",
		"oneOf": [{
			"additionalProperties": false,
			"properties": { "custom": { "type": "string" } },
			"required": ["custom"],
			"title": "CustomMultiAgentMode",
			"type": "object"
		}, {
			"enum": ["explicitRequestOnly", "proactive"],
			"type": "string"
		}]
	},
	"MultiAgentVersion": {
		"description": "Multi-agent runtime supported by a model.",
		"enum": [
			"disabled",
			"v1",
			"v2"
		],
		"type": "string"
	},
	"NetworkAccess": {
		"enum": ["restricted", "enabled"],
		"type": "string"
	},
	"NonSteerableTurnKind": {
		"enum": ["review", "compact"],
		"type": "string"
	},
	"PatchApplyStatus": {
		"enum": [
			"inProgress",
			"completed",
			"failed",
			"declined"
		],
		"type": "string"
	},
	"PatchChangeKind": { "oneOf": [
		{
			"properties": { "type": {
				"enum": ["add"],
				"title": "AddPatchChangeKindType",
				"type": "string"
			} },
			"required": ["type"],
			"title": "AddPatchChangeKind",
			"type": "object"
		},
		{
			"properties": { "type": {
				"enum": ["delete"],
				"title": "DeletePatchChangeKindType",
				"type": "string"
			} },
			"required": ["type"],
			"title": "DeletePatchChangeKind",
			"type": "object"
		},
		{
			"properties": {
				"move_path": { "type": ["string", "null"] },
				"type": {
					"enum": ["update"],
					"title": "UpdatePatchChangeKindType",
					"type": "string"
				}
			},
			"required": ["type"],
			"title": "UpdatePatchChangeKind",
			"type": "object"
		}
	] },
	"PlanType": {
		"enum": [
			"free",
			"go",
			"plus",
			"pro",
			"prolite",
			"team",
			"self_serve_business_prolite",
			"self_serve_business_usage_based",
			"business",
			"ent26",
			"enterprise_cbp_automation",
			"enterprise_cbp_usage_based",
			"enterprise",
			"edu",
			"edu_plus",
			"edu_pro",
			"unknown"
		],
		"type": "string"
	},
	"ReasoningEffort": {
		"description": "A non-empty reasoning effort value advertised by the model.",
		"minLength": 1,
		"type": "string"
	},
	"ReasoningEffortOption": {
		"properties": {
			"description": { "type": "string" },
			"reasoningEffort": { "$ref": "#/definitions/ReasoningEffort" }
		},
		"required": ["description", "reasoningEffort"],
		"type": "object"
	},
	"SandboxPolicy": { "oneOf": [
		{
			"properties": { "type": {
				"enum": ["dangerFullAccess"],
				"title": "DangerFullAccessSandboxPolicyType",
				"type": "string"
			} },
			"required": ["type"],
			"title": "DangerFullAccessSandboxPolicy",
			"type": "object"
		},
		{
			"properties": {
				"networkAccess": {
					"default": false,
					"type": "boolean"
				},
				"type": {
					"enum": ["readOnly"],
					"title": "ReadOnlySandboxPolicyType",
					"type": "string"
				}
			},
			"required": ["type"],
			"title": "ReadOnlySandboxPolicy",
			"type": "object"
		},
		{
			"properties": {
				"networkAccess": {
					"allOf": [{ "$ref": "#/definitions/NetworkAccess" }],
					"default": "restricted"
				},
				"type": {
					"enum": ["externalSandbox"],
					"title": "ExternalSandboxSandboxPolicyType",
					"type": "string"
				}
			},
			"required": ["type"],
			"title": "ExternalSandboxSandboxPolicy",
			"type": "object"
		},
		{
			"properties": {
				"excludeSlashTmp": {
					"default": false,
					"type": "boolean"
				},
				"excludeTmpdirEnvVar": {
					"default": false,
					"type": "boolean"
				},
				"networkAccess": {
					"default": false,
					"type": "boolean"
				},
				"type": {
					"enum": ["workspaceWrite"],
					"title": "WorkspaceWriteSandboxPolicyType",
					"type": "string"
				},
				"writableRoots": {
					"default": [],
					"items": { "$ref": "#/definitions/AbsolutePathBuf" },
					"type": "array"
				}
			},
			"required": ["type"],
			"title": "WorkspaceWriteSandboxPolicy",
			"type": "object"
		}
	] },
	"SessionSource": { "oneOf": [
		{
			"additionalProperties": false,
			"properties": { "custom": { "type": "string" } },
			"required": ["custom"],
			"title": "CustomSessionSource",
			"type": "object"
		},
		{
			"additionalProperties": false,
			"properties": { "subAgent": { "$ref": "#/definitions/SubAgentSource" } },
			"required": ["subAgent"],
			"title": "SubAgentSessionSource",
			"type": "object"
		},
		{
			"enum": [
				"cli",
				"vscode",
				"exec",
				"appServer",
				"unknown"
			],
			"type": "string"
		}
	] },
	"SubAgentActivityKind": {
		"enum": [
			"started",
			"interacted",
			"interrupted",
			"completed"
		],
		"type": "string"
	},
	"SubAgentSource": { "oneOf": [
		{
			"additionalProperties": false,
			"properties": { "thread_spawn": {
				"properties": {
					"agent_nickname": {
						"default": null,
						"type": ["string", "null"]
					},
					"agent_path": {
						"anyOf": [{ "$ref": "#/definitions/AgentPath" }, { "type": "null" }],
						"default": null
					},
					"agent_role": {
						"default": null,
						"type": ["string", "null"]
					},
					"depth": {
						"format": "int32",
						"type": "integer"
					},
					"parent_thread_id": { "$ref": "#/definitions/ThreadId" }
				},
				"required": ["depth", "parent_thread_id"],
				"type": "object"
			} },
			"required": ["thread_spawn"],
			"title": "ThreadSpawnSubAgentSource",
			"type": "object"
		},
		{
			"additionalProperties": false,
			"properties": { "other": { "type": "string" } },
			"required": ["other"],
			"title": "OtherSubAgentSource",
			"type": "object"
		},
		{
			"enum": [
				"review",
				"compact",
				"memory_consolidation"
			],
			"type": "string"
		}
	] },
	"TextElement": {
		"properties": {
			"byteRange": {
				"allOf": [{ "$ref": "#/definitions/ByteRange" }],
				"description": "Byte range in the parent `text` buffer that this element occupies."
			},
			"placeholder": {
				"description": "Optional human-readable placeholder for the element, displayed in the UI.",
				"type": ["string", "null"]
			}
		},
		"required": ["byteRange"],
		"type": "object"
	},
	"Thread": {
		"properties": {
			"agentNickname": {
				"description": "Optional random unique nickname assigned to an AgentControl-spawned sub-agent.",
				"type": ["string", "null"]
			},
			"agentRole": {
				"description": "Optional role (agent_role) assigned to an AgentControl-spawned sub-agent.",
				"type": ["string", "null"]
			},
			"canAcceptDirectInput": {
				"description": "Whether the app server accepts direct turn input for this loaded thread. `None` means the capability is unavailable, such as for an unloaded stored thread.",
				"type": ["boolean", "null"]
			},
			"cliVersion": {
				"description": "Version of the CLI that created the thread.",
				"type": "string"
			},
			"createdAt": {
				"description": "Unix timestamp (in seconds) when the thread was created.",
				"format": "int64",
				"type": "integer"
			},
			"cwd": {
				"allOf": [{ "$ref": "#/definitions/AbsolutePathBuf" }],
				"description": "Working directory captured for the thread."
			},
			"ephemeral": {
				"description": "Whether the thread is ephemeral and should not be materialized on disk.",
				"type": "boolean"
			},
			"extra": {
				"anyOf": [{ "$ref": "#/definitions/ThreadExtra" }, { "type": "null" }],
				"description": "Optional implementation-specific thread data."
			},
			"forkedFromId": {
				"description": "Source thread id when this thread was created by forking another thread.",
				"type": ["string", "null"]
			},
			"gitInfo": {
				"anyOf": [{ "$ref": "#/definitions/GitInfo" }, { "type": "null" }],
				"description": "Optional Git metadata captured when the thread was created."
			},
			"historyMode": {
				"allOf": [{ "$ref": "#/definitions/ThreadHistoryMode" }],
				"default": "legacy",
				"description": "Persisted thread history contract selected when this thread was created."
			},
			"id": {
				"description": "Identifier for this thread. Codex-generated thread IDs are UUIDv7.",
				"type": "string"
			},
			"modelProvider": {
				"description": "Model provider used for this thread (for example, 'openai').",
				"type": "string"
			},
			"name": {
				"description": "Optional user-facing thread title.",
				"type": ["string", "null"]
			},
			"parentThreadId": {
				"description": "The ID of the parent thread. This will only be set if this thread is a subagent.",
				"type": ["string", "null"]
			},
			"path": {
				"description": "[UNSTABLE] Path to the thread on disk.",
				"type": ["string", "null"]
			},
			"preview": {
				"description": "Usually the first user message in the thread, if available.",
				"type": "string"
			},
			"projectId": {
				"description": "Canonical project assignment owned by app-server, if any.",
				"type": ["string", "null"]
			},
			"recencyAt": {
				"description": "Unix timestamp (in seconds) used for thread recency ordering.",
				"format": "int64",
				"type": ["integer", "null"]
			},
			"section": {
				"anyOf": [{ "$ref": "#/definitions/ThreadSection" }, { "type": "null" }],
				"default": null,
				"description": "The independently persisted section selected for this thread, if any."
			},
			"sectionEnteredAt": {
				"default": null,
				"description": "Unix timestamp in seconds when the thread entered its current section.",
				"format": "int64",
				"type": ["integer", "null"]
			},
			"sessionId": {
				"description": "Session id shared by threads that belong to the same session tree.",
				"type": "string"
			},
			"source": {
				"allOf": [{ "$ref": "#/definitions/SessionSource" }],
				"description": "Origin of the thread (CLI, VSCode, codex exec, codex app-server, etc.)."
			},
			"status": {
				"allOf": [{ "$ref": "#/definitions/ThreadStatus" }],
				"description": "Current runtime status for the thread."
			},
			"threadSource": {
				"anyOf": [{ "$ref": "#/definitions/ThreadSource" }, { "type": "null" }],
				"description": "Optional analytics source classification for this thread."
			},
			"turns": {
				"description": "Only populated on `thread/resume`, `thread/rollback`, `thread/fork`, and `thread/read` (when `includeTurns` is true) responses. For all other responses and notifications returning a Thread, the turns field will be an empty list.",
				"items": { "$ref": "#/definitions/Turn" },
				"type": "array"
			},
			"updatedAt": {
				"description": "Unix timestamp (in seconds) when the thread was last updated.",
				"format": "int64",
				"type": "integer"
			}
		},
		"required": [
			"cliVersion",
			"createdAt",
			"cwd",
			"ephemeral",
			"id",
			"modelProvider",
			"preview",
			"projectId",
			"sessionId",
			"source",
			"status",
			"turns",
			"updatedAt"
		],
		"type": "object"
	},
	"ThreadActiveFlag": {
		"enum": ["waitingOnApproval", "waitingOnUserInput"],
		"type": "string"
	},
	"ThreadExtra": {
		"description": "Extra app-server data for a thread.",
		"type": "object"
	},
	"ThreadHistoryMode": {
		"enum": ["legacy", "paginated"],
		"type": "string"
	},
	"ThreadId": { "type": "string" },
	"ThreadItem": { "oneOf": [
		{
			"properties": {
				"clientId": { "type": ["string", "null"] },
				"content": {
					"items": { "$ref": "#/definitions/UserInput" },
					"type": "array"
				},
				"id": { "type": "string" },
				"type": {
					"enum": ["userMessage"],
					"title": "UserMessageThreadItemType",
					"type": "string"
				}
			},
			"required": [
				"content",
				"id",
				"type"
			],
			"title": "UserMessageThreadItem",
			"type": "object"
		},
		{
			"properties": {
				"fragments": {
					"items": { "$ref": "#/definitions/HookPromptFragment" },
					"type": "array"
				},
				"id": { "type": "string" },
				"type": {
					"enum": ["hookPrompt"],
					"title": "HookPromptThreadItemType",
					"type": "string"
				}
			},
			"required": [
				"fragments",
				"id",
				"type"
			],
			"title": "HookPromptThreadItem",
			"type": "object"
		},
		{
			"properties": {
				"delivery": {
					"anyOf": [{ "$ref": "#/definitions/AgentMessageDelivery" }, { "type": "null" }],
					"default": null
				},
				"id": { "type": "string" },
				"memoryCitation": {
					"anyOf": [{ "$ref": "#/definitions/MemoryCitation" }, { "type": "null" }],
					"default": null
				},
				"phase": {
					"anyOf": [{ "$ref": "#/definitions/MessagePhase" }, { "type": "null" }],
					"default": null
				},
				"text": { "type": "string" },
				"type": {
					"enum": ["agentMessage"],
					"title": "AgentMessageThreadItemType",
					"type": "string"
				}
			},
			"required": [
				"id",
				"text",
				"type"
			],
			"title": "AgentMessageThreadItem",
			"type": "object"
		},
		{
			"properties": {
				"id": { "type": "string" },
				"name": { "type": "string" },
				"namespace": { "type": ["string", "null"] },
				"output": { "$ref": "#/definitions/FunctionCallOutputBody" },
				"type": {
					"enum": ["functionCallOutput"],
					"title": "FunctionCallOutputThreadItemType",
					"type": "string"
				}
			},
			"required": [
				"id",
				"name",
				"output",
				"type"
			],
			"title": "FunctionCallOutputThreadItem",
			"type": "object"
		},
		{
			"description": "EXPERIMENTAL - proposed plan item content. The completed plan item is authoritative and may not match the concatenation of `PlanDelta` text.",
			"properties": {
				"id": { "type": "string" },
				"text": { "type": "string" },
				"type": {
					"enum": ["plan"],
					"title": "PlanThreadItemType",
					"type": "string"
				}
			},
			"required": [
				"id",
				"text",
				"type"
			],
			"title": "PlanThreadItem",
			"type": "object"
		},
		{
			"properties": {
				"content": {
					"default": [],
					"items": { "type": "string" },
					"type": "array"
				},
				"id": { "type": "string" },
				"summary": {
					"default": [],
					"items": { "type": "string" },
					"type": "array"
				},
				"type": {
					"enum": ["reasoning"],
					"title": "ReasoningThreadItemType",
					"type": "string"
				}
			},
			"required": ["id", "type"],
			"title": "ReasoningThreadItem",
			"type": "object"
		},
		{
			"properties": {
				"aggregatedOutput": {
					"description": "The command's output, aggregated from stdout and stderr.",
					"type": ["string", "null"]
				},
				"command": {
					"description": "The command to be executed.",
					"type": "string"
				},
				"commandActions": {
					"description": "A best-effort parsing of the command to understand the action(s) it will perform. This returns a list of CommandAction objects because a single shell command may be composed of many commands piped together.",
					"items": { "$ref": "#/definitions/CommandAction" },
					"type": "array"
				},
				"cwd": {
					"allOf": [{ "$ref": "#/definitions/LegacyAppPathString" }],
					"description": "The command's working directory."
				},
				"durationMs": {
					"description": "The duration of the command execution in milliseconds.",
					"format": "int64",
					"type": ["integer", "null"]
				},
				"exitCode": {
					"description": "The command's exit code.",
					"format": "int32",
					"type": ["integer", "null"]
				},
				"id": { "type": "string" },
				"pluginId": {
					"default": null,
					"description": "Trusted first-party plugin id when this command resolves to one plugin script.",
					"type": ["string", "null"]
				},
				"processId": {
					"description": "Identifier for the underlying PTY process (when available).",
					"type": ["string", "null"]
				},
				"scriptPath": {
					"default": null,
					"description": "Safe plugin-relative path when this command resolves to one plugin script.",
					"type": ["string", "null"]
				},
				"source": {
					"allOf": [{ "$ref": "#/definitions/CommandExecutionSource" }],
					"default": "agent"
				},
				"status": { "$ref": "#/definitions/CommandExecutionStatus" },
				"type": {
					"enum": ["commandExecution"],
					"title": "CommandExecutionThreadItemType",
					"type": "string"
				}
			},
			"required": [
				"command",
				"commandActions",
				"cwd",
				"id",
				"status",
				"type"
			],
			"title": "CommandExecutionThreadItem",
			"type": "object"
		},
		{
			"properties": {
				"changes": {
					"items": { "$ref": "#/definitions/FileUpdateChange" },
					"type": "array"
				},
				"id": { "type": "string" },
				"status": { "$ref": "#/definitions/PatchApplyStatus" },
				"type": {
					"enum": ["fileChange"],
					"title": "FileChangeThreadItemType",
					"type": "string"
				}
			},
			"required": [
				"changes",
				"id",
				"status",
				"type"
			],
			"title": "FileChangeThreadItem",
			"type": "object"
		},
		{
			"properties": {
				"appContext": { "anyOf": [{ "$ref": "#/definitions/McpToolCallAppContext" }, { "type": "null" }] },
				"arguments": true,
				"durationMs": {
					"description": "The duration of the MCP tool call in milliseconds.",
					"format": "int64",
					"type": ["integer", "null"]
				},
				"error": { "anyOf": [{ "$ref": "#/definitions/McpToolCallError" }, { "type": "null" }] },
				"id": { "type": "string" },
				"mcpAppResourceUri": {
					"description": "Deprecated: use `appContext.resourceUri` instead.",
					"type": ["string", "null"]
				},
				"pluginId": { "type": ["string", "null"] },
				"readOnlyHint": { "type": ["boolean", "null"] },
				"result": { "anyOf": [{ "$ref": "#/definitions/McpToolCallResult" }, { "type": "null" }] },
				"server": { "type": "string" },
				"status": { "$ref": "#/definitions/McpToolCallStatus" },
				"tool": { "type": "string" },
				"type": {
					"enum": ["mcpToolCall"],
					"title": "McpToolCallThreadItemType",
					"type": "string"
				}
			},
			"required": [
				"arguments",
				"id",
				"server",
				"status",
				"tool",
				"type"
			],
			"title": "McpToolCallThreadItem",
			"type": "object"
		},
		{
			"properties": {
				"arguments": true,
				"contentItems": {
					"items": { "$ref": "#/definitions/DynamicToolCallOutputContentItem" },
					"type": ["array", "null"]
				},
				"durationMs": {
					"description": "The duration of the dynamic tool call in milliseconds.",
					"format": "int64",
					"type": ["integer", "null"]
				},
				"id": { "type": "string" },
				"namespace": { "type": ["string", "null"] },
				"status": { "$ref": "#/definitions/DynamicToolCallStatus" },
				"success": { "type": ["boolean", "null"] },
				"tool": { "type": "string" },
				"type": {
					"enum": ["dynamicToolCall"],
					"title": "DynamicToolCallThreadItemType",
					"type": "string"
				}
			},
			"required": [
				"arguments",
				"id",
				"status",
				"tool",
				"type"
			],
			"title": "DynamicToolCallThreadItem",
			"type": "object"
		},
		{
			"properties": {
				"agentsStates": {
					"additionalProperties": { "$ref": "#/definitions/CollabAgentState" },
					"description": "Last known status of the target agents, when available.",
					"type": "object"
				},
				"id": {
					"description": "Unique identifier for this collab tool call.",
					"type": "string"
				},
				"model": {
					"description": "Model requested for the spawned agent, when applicable.",
					"type": ["string", "null"]
				},
				"prompt": {
					"description": "Prompt text sent as part of the collab tool call, when available.",
					"type": ["string", "null"]
				},
				"reasoningEffort": {
					"anyOf": [{ "$ref": "#/definitions/ReasoningEffort" }, { "type": "null" }],
					"description": "Reasoning effort requested for the spawned agent, when applicable."
				},
				"receiverThreadIds": {
					"description": "Thread ID of the receiving agent, when applicable. In case of spawn operation, this corresponds to the newly spawned agent.",
					"items": { "type": "string" },
					"type": "array"
				},
				"senderThreadId": {
					"description": "Thread ID of the agent issuing the collab request.",
					"type": "string"
				},
				"status": {
					"allOf": [{ "$ref": "#/definitions/CollabAgentToolCallStatus" }],
					"description": "Current status of the collab tool call."
				},
				"tool": {
					"allOf": [{ "$ref": "#/definitions/CollabAgentTool" }],
					"description": "Name of the collab tool that was invoked."
				},
				"type": {
					"enum": ["collabAgentToolCall"],
					"title": "CollabAgentToolCallThreadItemType",
					"type": "string"
				}
			},
			"required": [
				"agentsStates",
				"id",
				"receiverThreadIds",
				"senderThreadId",
				"status",
				"tool",
				"type"
			],
			"title": "CollabAgentToolCallThreadItem",
			"type": "object"
		},
		{
			"properties": {
				"agentPath": { "type": "string" },
				"agentThreadId": { "type": "string" },
				"id": { "type": "string" },
				"kind": { "$ref": "#/definitions/SubAgentActivityKind" },
				"type": {
					"enum": ["subAgentActivity"],
					"title": "SubAgentActivityThreadItemType",
					"type": "string"
				}
			},
			"required": [
				"agentPath",
				"agentThreadId",
				"id",
				"kind",
				"type"
			],
			"title": "SubAgentActivityThreadItem",
			"type": "object"
		},
		{
			"properties": {
				"action": { "anyOf": [{ "$ref": "#/definitions/WebSearchAction" }, { "type": "null" }] },
				"id": { "type": "string" },
				"query": { "type": "string" },
				"results": {
					"default": null,
					"description": "Structured search results returned out-of-band by standalone web search.\n\nThese stay as opaque JSON at the extension/app-server boundary so new result fields and result types can pass through without a Codex release.",
					"items": true,
					"type": ["array", "null"]
				},
				"type": {
					"enum": ["webSearch"],
					"title": "WebSearchThreadItemType",
					"type": "string"
				}
			},
			"required": [
				"id",
				"query",
				"type"
			],
			"title": "WebSearchThreadItem",
			"type": "object"
		},
		{
			"properties": {
				"id": { "type": "string" },
				"path": { "$ref": "#/definitions/LegacyAppPathString" },
				"type": {
					"enum": ["imageView"],
					"title": "ImageViewThreadItemType",
					"type": "string"
				}
			},
			"required": [
				"id",
				"path",
				"type"
			],
			"title": "ImageViewThreadItem",
			"type": "object"
		},
		{
			"description": "Display item emitted by the interruptible `clock.sleep` tool.",
			"properties": {
				"durationMs": {
					"format": "uint64",
					"minimum": 0,
					"type": "integer"
				},
				"id": { "type": "string" },
				"type": {
					"enum": ["sleep"],
					"title": "SleepThreadItemType",
					"type": "string"
				}
			},
			"required": [
				"durationMs",
				"id",
				"type"
			],
			"title": "SleepThreadItem",
			"type": "object"
		},
		{
			"properties": {
				"failure": {
					"anyOf": [{ "$ref": "#/definitions/ImageGenerationFailure" }, { "type": "null" }],
					"default": null
				},
				"id": { "type": "string" },
				"result": { "type": "string" },
				"revisedPrompt": { "type": ["string", "null"] },
				"savedPath": { "anyOf": [{ "$ref": "#/definitions/AbsolutePathBuf" }, { "type": "null" }] },
				"status": { "type": "string" },
				"transparentBackground": {
					"default": null,
					"type": ["boolean", "null"]
				},
				"type": {
					"enum": ["imageGeneration"],
					"title": "ImageGenerationThreadItemType",
					"type": "string"
				}
			},
			"required": [
				"id",
				"result",
				"status",
				"type"
			],
			"title": "ImageGenerationThreadItem",
			"type": "object"
		},
		{
			"properties": {
				"id": { "type": "string" },
				"review": { "type": "string" },
				"type": {
					"enum": ["enteredReviewMode"],
					"title": "EnteredReviewModeThreadItemType",
					"type": "string"
				}
			},
			"required": [
				"id",
				"review",
				"type"
			],
			"title": "EnteredReviewModeThreadItem",
			"type": "object"
		},
		{
			"properties": {
				"id": { "type": "string" },
				"review": { "type": "string" },
				"type": {
					"enum": ["exitedReviewMode"],
					"title": "ExitedReviewModeThreadItemType",
					"type": "string"
				}
			},
			"required": [
				"id",
				"review",
				"type"
			],
			"title": "ExitedReviewModeThreadItem",
			"type": "object"
		},
		{
			"properties": {
				"id": { "type": "string" },
				"type": {
					"enum": ["contextCompaction"],
					"title": "ContextCompactionThreadItemType",
					"type": "string"
				}
			},
			"required": ["id", "type"],
			"title": "ContextCompactionThreadItem",
			"type": "object"
		}
	] },
	"ThreadSection": {
		"description": "An independently persisted, user-visible thread section.",
		"properties": {
			"appearance": {
				"anyOf": [{ "$ref": "#/definitions/ThreadSectionAppearance" }, { "type": "null" }],
				"default": null,
				"description": "Optional appearance synchronized across clients."
			},
			"id": {
				"description": "Opaque UUIDv7 identity that remains stable when the section is renamed.",
				"type": "string"
			},
			"name": {
				"description": "The current user-visible section name.",
				"type": "string"
			}
		},
		"required": ["id", "name"],
		"type": "object"
	},
	"ThreadSectionAppearance": {
		"description": "Extensible visual presentation for a custom thread section.",
		"properties": {
			"color": { "type": ["string", "null"] },
			"icon": { "type": ["string", "null"] }
		},
		"type": "object"
	},
	"ThreadSource": { "type": "string" },
	"ThreadStatus": { "oneOf": [
		{
			"properties": { "type": {
				"enum": ["notLoaded"],
				"title": "NotLoadedThreadStatusType",
				"type": "string"
			} },
			"required": ["type"],
			"title": "NotLoadedThreadStatus",
			"type": "object"
		},
		{
			"properties": { "type": {
				"enum": ["idle"],
				"title": "IdleThreadStatusType",
				"type": "string"
			} },
			"required": ["type"],
			"title": "IdleThreadStatus",
			"type": "object"
		},
		{
			"properties": { "type": {
				"enum": ["systemError"],
				"title": "SystemErrorThreadStatusType",
				"type": "string"
			} },
			"required": ["type"],
			"title": "SystemErrorThreadStatus",
			"type": "object"
		},
		{
			"properties": {
				"activeFlags": {
					"items": { "$ref": "#/definitions/ThreadActiveFlag" },
					"type": "array"
				},
				"type": {
					"enum": ["active"],
					"title": "ActiveThreadStatusType",
					"type": "string"
				}
			},
			"required": ["activeFlags", "type"],
			"title": "ActiveThreadStatus",
			"type": "object"
		}
	] },
	"Turn": {
		"properties": {
			"completedAt": {
				"description": "Unix timestamp (in seconds) when the turn completed.",
				"format": "int64",
				"type": ["integer", "null"]
			},
			"durationMs": {
				"description": "Duration between turn start and completion in milliseconds, if known.",
				"format": "int64",
				"type": ["integer", "null"]
			},
			"error": {
				"anyOf": [{ "$ref": "#/definitions/TurnError" }, { "type": "null" }],
				"description": "Only populated when the Turn's status is failed."
			},
			"id": {
				"description": "Identifier for this turn. Codex-generated turn IDs are UUIDv7.",
				"type": "string"
			},
			"items": {
				"description": "Thread items currently included in this turn payload.",
				"items": { "$ref": "#/definitions/ThreadItem" },
				"type": "array"
			},
			"itemsView": {
				"allOf": [{ "$ref": "#/definitions/TurnItemsView" }],
				"default": "full",
				"description": "Describes how much of `items` has been loaded for this turn."
			},
			"startedAt": {
				"description": "Unix timestamp (in seconds) when the turn started.",
				"format": "int64",
				"type": ["integer", "null"]
			},
			"status": { "$ref": "#/definitions/TurnStatus" }
		},
		"required": [
			"id",
			"items",
			"status"
		],
		"type": "object"
	},
	"TurnError": {
		"properties": {
			"additionalDetails": {
				"default": null,
				"type": ["string", "null"]
			},
			"codexErrorInfo": { "anyOf": [{ "$ref": "#/definitions/CodexErrorInfo" }, { "type": "null" }] },
			"message": { "type": "string" },
			"misalignment": {
				"anyOf": [{ "$ref": "#/definitions/MisalignmentErrorDetails" }, { "type": "null" }],
				"default": null,
				"description": "Optional public explanation and continuation instruction for a misalignment block."
			}
		},
		"required": ["message"],
		"type": "object"
	},
	"TurnItemsView": { "oneOf": [
		{
			"description": "`items` was not loaded for this turn. The field is intentionally empty.",
			"enum": ["notLoaded"],
			"type": "string"
		},
		{
			"description": "`items` contains only a display summary for this turn.",
			"enum": ["summary"],
			"type": "string"
		},
		{
			"description": "`items` contains every ThreadItem available from persisted app-server history for this turn.",
			"enum": ["full"],
			"type": "string"
		}
	] },
	"TurnStatus": {
		"enum": [
			"completed",
			"interrupted",
			"failed",
			"inProgress"
		],
		"type": "string"
	},
	"TurnsPage": {
		"properties": {
			"backwardsCursor": { "type": ["string", "null"] },
			"data": {
				"items": { "$ref": "#/definitions/Turn" },
				"type": "array"
			},
			"nextCursor": { "type": ["string", "null"] }
		},
		"required": ["data"],
		"type": "object"
	},
	"UserInput": { "oneOf": [
		{
			"properties": {
				"text": { "type": "string" },
				"text_elements": {
					"default": [],
					"description": "UI-defined spans within `text` used to render or persist special elements.",
					"items": { "$ref": "#/definitions/TextElement" },
					"type": "array"
				},
				"type": {
					"enum": ["text"],
					"title": "TextUserInputType",
					"type": "string"
				}
			},
			"required": ["text", "type"],
			"title": "TextUserInput",
			"type": "object"
		},
		{
			"properties": {
				"detail": {
					"anyOf": [{ "$ref": "#/definitions/ImageDetail" }, { "type": "null" }],
					"default": null
				},
				"type": {
					"enum": ["image"],
					"title": "ImageUserInputType",
					"type": "string"
				},
				"url": { "type": "string" }
			},
			"required": ["type", "url"],
			"title": "ImageUserInput",
			"type": "object"
		},
		{
			"properties": {
				"detail": {
					"anyOf": [{ "$ref": "#/definitions/ImageDetail" }, { "type": "null" }],
					"default": null
				},
				"path": { "type": "string" },
				"type": {
					"enum": ["localImage"],
					"title": "LocalImageUserInputType",
					"type": "string"
				}
			},
			"required": ["path", "type"],
			"title": "LocalImageUserInput",
			"type": "object"
		},
		{
			"properties": {
				"type": {
					"enum": ["audio"],
					"title": "AudioUserInputType",
					"type": "string"
				},
				"url": { "type": "string" }
			},
			"required": ["type", "url"],
			"title": "AudioUserInput",
			"type": "object"
		},
		{
			"properties": {
				"path": { "type": "string" },
				"type": {
					"enum": ["localAudio"],
					"title": "LocalAudioUserInputType",
					"type": "string"
				}
			},
			"required": ["path", "type"],
			"title": "LocalAudioUserInput",
			"type": "object"
		},
		{
			"properties": {
				"name": { "type": "string" },
				"path": { "type": "string" },
				"type": {
					"enum": ["skill"],
					"title": "SkillUserInputType",
					"type": "string"
				}
			},
			"required": [
				"name",
				"path",
				"type"
			],
			"title": "SkillUserInput",
			"type": "object"
		},
		{
			"properties": {
				"name": { "type": "string" },
				"path": { "type": "string" },
				"type": {
					"enum": ["mention"],
					"title": "MentionUserInputType",
					"type": "string"
				}
			},
			"required": [
				"name",
				"path",
				"type"
			],
			"title": "MentionUserInput",
			"type": "object"
		}
	] },
	"WebSearchAction": { "oneOf": [
		{
			"properties": {
				"queries": {
					"items": { "type": "string" },
					"type": ["array", "null"]
				},
				"query": { "type": ["string", "null"] },
				"type": {
					"enum": ["search"],
					"title": "SearchWebSearchActionType",
					"type": "string"
				}
			},
			"required": ["type"],
			"title": "SearchWebSearchAction",
			"type": "object"
		},
		{
			"properties": {
				"type": {
					"enum": ["openPage"],
					"title": "OpenPageWebSearchActionType",
					"type": "string"
				},
				"url": { "type": ["string", "null"] }
			},
			"required": ["type"],
			"title": "OpenPageWebSearchAction",
			"type": "object"
		},
		{
			"properties": {
				"pattern": { "type": ["string", "null"] },
				"type": {
					"enum": ["findInPage"],
					"title": "FindInPageWebSearchActionType",
					"type": "string"
				},
				"url": { "type": ["string", "null"] }
			},
			"required": ["type"],
			"title": "FindInPageWebSearchAction",
			"type": "object"
		},
		{
			"properties": { "type": {
				"enum": ["other"],
				"title": "OtherWebSearchActionType",
				"type": "string"
			} },
			"required": ["type"],
			"title": "OtherWebSearchAction",
			"type": "object"
		}
	] }
};
//#endregion
//#region extensions/codex/src/app-server/protocol-generated/json/v2/ErrorNotification.json
var ErrorNotification_default = {
	$schema: "http://json-schema.org/draft-07/schema#",
	properties: {
		"error": { "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/TurnError" },
		"threadId": { "type": "string" },
		"turnId": { "type": "string" },
		"willRetry": { "type": "boolean" }
	},
	required: [
		"error",
		"threadId",
		"turnId",
		"willRetry"
	],
	title: "ErrorNotification",
	type: "object"
};
//#endregion
//#region extensions/codex/src/app-server/protocol-generated/json/v2/ModelListResponse.json
var ModelListResponse_default = {
	$schema: "http://json-schema.org/draft-07/schema#",
	properties: {
		"data": {
			"items": { "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/Model" },
			"type": "array"
		},
		"nextCursor": {
			"description": "Opaque cursor to pass to the next call to continue after the last item. If None, there are no more items to return.",
			"type": ["string", "null"]
		}
	},
	required: ["data"],
	title: "ModelListResponse",
	type: "object"
};
//#endregion
//#region extensions/codex/src/app-server/protocol-generated/json/v2/ThreadResumeResponse.json
var ThreadResumeResponse_default = {
	$schema: "http://json-schema.org/draft-07/schema#",
	properties: {
		"activePermissionProfile": {
			"anyOf": [{ "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/ActivePermissionProfile" }, { "type": "null" }],
			"default": null,
			"description": "Named or implicit built-in profile that produced the active permissions, when known."
		},
		"approvalPolicy": { "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/AskForApproval" },
		"approvalsReviewer": {
			"allOf": [{ "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/ApprovalsReviewer" }],
			"description": "Reviewer currently used for approval requests on this thread."
		},
		"cwd": { "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/AbsolutePathBuf" },
		"initialTurnsPage": {
			"anyOf": [{ "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/TurnsPage" }, { "type": "null" }],
			"default": null,
			"description": "`thread/turns/list` page returned when requested by `initialTurnsPage`."
		},
		"instructionSources": {
			"default": [],
			"description": "Environment-native paths to instruction source files currently loaded for this thread.",
			"items": { "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/LegacyAppPathString" },
			"type": "array"
		},
		"itemsBackwardsCursor": {
			"default": null,
			"description": "Opaque cursor for hydrating paginated items backwards.\n\nPass this as `cursor` to `thread/items/list` with `sortDirection: \"desc\"`. The first page includes the item identified by the cursor.",
			"type": ["string", "null"]
		},
		"model": { "type": "string" },
		"modelProvider": { "type": "string" },
		"multiAgentMode": {
			"allOf": [{ "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/MultiAgentMode" }],
			"default": "explicitRequestOnly",
			"description": "@deprecated Always `explicitRequestOnly`. Use `reasoningEffort` for Ultra behavior."
		},
		"reasoningEffort": { "anyOf": [{ "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/ReasoningEffort" }, { "type": "null" }] },
		"runtimeWorkspaceRoots": {
			"default": [],
			"description": "Thread-scoped runtime workspace roots used to materialize `:workspace_roots`.",
			"items": { "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/AbsolutePathBuf" },
			"type": "array"
		},
		"sandbox": {
			"allOf": [{ "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/SandboxPolicy" }],
			"description": "Legacy sandbox policy retained for compatibility. Experimental clients should prefer `activePermissionProfile` for profile provenance."
		},
		"serviceTier": { "type": ["string", "null"] },
		"thread": { "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/Thread" },
		"turnsBackwardsCursor": {
			"default": null,
			"description": "Opaque cursor for hydrating paginated turns backwards.\n\nPass this as `cursor` to `thread/turns/list` with `sortDirection: \"desc\"`. The first page includes the turn identified by the cursor.",
			"type": ["string", "null"]
		}
	},
	required: [
		"approvalPolicy",
		"approvalsReviewer",
		"cwd",
		"model",
		"modelProvider",
		"sandbox",
		"thread"
	],
	title: "ThreadResumeResponse",
	type: "object"
};
//#endregion
//#region extensions/codex/src/app-server/protocol-generated/json/v2/ThreadStartResponse.json
var ThreadStartResponse_default = {
	$schema: "http://json-schema.org/draft-07/schema#",
	properties: {
		"activePermissionProfile": {
			"anyOf": [{ "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/ActivePermissionProfile" }, { "type": "null" }],
			"default": null,
			"description": "Named or implicit built-in profile that produced the active permissions, when known."
		},
		"approvalPolicy": { "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/AskForApproval" },
		"approvalsReviewer": {
			"allOf": [{ "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/ApprovalsReviewer" }],
			"description": "Reviewer currently used for approval requests on this thread."
		},
		"cwd": { "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/AbsolutePathBuf" },
		"instructionSources": {
			"default": [],
			"description": "Environment-native paths to instruction source files currently loaded for this thread.",
			"items": { "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/LegacyAppPathString" },
			"type": "array"
		},
		"model": { "type": "string" },
		"modelProvider": { "type": "string" },
		"multiAgentMode": {
			"allOf": [{ "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/MultiAgentMode" }],
			"default": "explicitRequestOnly",
			"description": "@deprecated Always `explicitRequestOnly`. Use `reasoningEffort` for Ultra behavior."
		},
		"reasoningEffort": { "anyOf": [{ "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/ReasoningEffort" }, { "type": "null" }] },
		"runtimeWorkspaceRoots": {
			"default": [],
			"description": "Thread-scoped runtime workspace roots used to materialize `:workspace_roots`.",
			"items": { "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/AbsolutePathBuf" },
			"type": "array"
		},
		"sandbox": {
			"allOf": [{ "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/SandboxPolicy" }],
			"description": "Legacy sandbox policy retained for compatibility. Experimental clients should prefer `activePermissionProfile` for profile provenance."
		},
		"serviceTier": { "type": ["string", "null"] },
		"thread": { "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/Thread" }
	},
	required: [
		"approvalPolicy",
		"approvalsReviewer",
		"cwd",
		"model",
		"modelProvider",
		"sandbox",
		"thread"
	],
	title: "ThreadStartResponse",
	type: "object"
};
//#endregion
//#region extensions/codex/src/app-server/protocol-generated/json/v2/TurnCompletedNotification.json
var TurnCompletedNotification_default = {
	$schema: "http://json-schema.org/draft-07/schema#",
	properties: {
		"threadId": { "type": "string" },
		"turn": { "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/Turn" }
	},
	required: ["threadId", "turn"],
	title: "TurnCompletedNotification",
	type: "object"
};
//#endregion
//#region extensions/codex/src/app-server/protocol-generated/json/v2/TurnStartResponse.json
var TurnStartResponse_default = {
	$schema: "http://json-schema.org/draft-07/schema#",
	properties: { "turn": { "$ref": "./CodexAppServerProtocolDefinitions.json#/definitions/Turn" } },
	required: ["turn"],
	title: "TurnStartResponse",
	type: "object"
};
//#endregion
//#region extensions/codex/src/app-server/protocol-validators.ts
/**
* Runtime validators for Codex app-server protocol payloads, including schema
* normalization for generated JSON Schema before TypeBox compilation.
*/
const externalDefinitionRefPrefix = "./CodexAppServerProtocolDefinitions.json#/definitions/";
const rootExternalDefinitionRefPrefix = "./v2/CodexAppServerProtocolDefinitions.json#/definitions/";
const localDefinitionRefPrefix = "#/definitions/";
function materializeCodexSchema(schema, externalRefPrefix = externalDefinitionRefPrefix) {
	const sharedDefinitions = definitions;
	if (!isRecord(schema) || !isRecord(sharedDefinitions)) return schema;
	const reachable = collectDefinitionRefs(schema, externalRefPrefix);
	const pending = [...reachable];
	while (pending.length > 0) {
		const name = pending.pop();
		if (name === void 0) continue;
		const definition = sharedDefinitions[name];
		if (definition === void 0) throw new Error(`Missing generated Codex schema definition: ${name}`);
		for (const dependency of collectDefinitionRefs(definition, localDefinitionRefPrefix)) if (!reachable.has(dependency)) {
			reachable.add(dependency);
			pending.push(dependency);
		}
	}
	if (reachable.size === 0) return schema;
	const definitions$1 = Object.fromEntries(Object.entries(sharedDefinitions).filter(([name]) => reachable.has(name)));
	return rewriteDefinitionRefs({
		...schema,
		definitions: definitions$1
	}, externalRefPrefix);
}
function collectDefinitionRefs(value, prefix, names = /* @__PURE__ */ new Set()) {
	if (Array.isArray(value)) for (const entry of value) collectDefinitionRefs(entry, prefix, names);
	else if (isRecord(value)) {
		if (typeof value.$ref === "string" && value.$ref.startsWith(prefix)) {
			const name = value.$ref.slice(prefix.length).split("/", 1)[0];
			if (name) names.add(name.replaceAll("~1", "/").replaceAll("~0", "~"));
		}
		for (const entry of Object.values(value)) collectDefinitionRefs(entry, prefix, names);
	}
	return names;
}
function rewriteDefinitionRefs(value, externalRefPrefix) {
	if (Array.isArray(value)) return value.map((entry) => rewriteDefinitionRefs(entry, externalRefPrefix));
	if (!isRecord(value)) return value;
	return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, key === "$ref" && typeof entry === "string" && entry.startsWith(externalRefPrefix) ? `${localDefinitionRefPrefix}${entry.slice(externalRefPrefix.length)}` : rewriteDefinitionRefs(entry, externalRefPrefix)]));
}
const dynamicToolCallParamsSchema = materializeCodexSchema(DynamicToolCallParams_default, rootExternalDefinitionRefPrefix);
const errorNotificationSchema = materializeCodexSchema(ErrorNotification_default);
const modelListResponseSchema = materializeCodexSchema(ModelListResponse_default);
const threadResumeResponseSchema = materializeCodexSchema(ThreadResumeResponse_default);
const threadStartResponseSchema = materializeCodexSchema(ThreadStartResponse_default);
const turnCompletedNotificationSchema = materializeCodexSchema(TurnCompletedNotification_default);
const turnStartResponseSchema = materializeCodexSchema(TurnStartResponse_default);
function compileCodexSchema(schema) {
	const validator = Compile(normalizeJsonSchemaNode(schema));
	return {
		check: (value) => validator.Check(value),
		errors: (value) => [...validator.Errors(value)]
	};
}
const schemaMapKeywords = /* @__PURE__ */ new Set([
	"$defs",
	"definitions",
	"dependentSchemas",
	"patternProperties",
	"properties"
]);
const schemaValueKeywords = /* @__PURE__ */ new Set([
	"additionalItems",
	"additionalProperties",
	"contains",
	"else",
	"if",
	"items",
	"not",
	"propertyNames",
	"then",
	"unevaluatedItems",
	"unevaluatedProperties"
]);
const schemaArrayKeywords = /* @__PURE__ */ new Set([
	"allOf",
	"anyOf",
	"oneOf",
	"prefixItems"
]);
function schemaTypeIncludes(schema, type) {
	return schema.type === type || Array.isArray(schema.type) && schema.type.includes(type);
}
function normalizeSchemaMap(value) {
	if (!isRecord(value)) return value;
	return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeJsonSchemaNode(entry)]));
}
function expandJsonSchemaTypeArray(schema) {
	const { type, ...rest } = schema;
	if (!Array.isArray(type)) return schema;
	return { anyOf: type.map((entry) => Object.assign({}, rest, { type: entry })) };
}
function normalizeJsonSchemaNode(schema) {
	if (Array.isArray(schema)) return schema.map((entry) => normalizeJsonSchemaNode(entry));
	if (!isRecord(schema)) return schema;
	const normalizedSchema = expandJsonSchemaTypeArray(schema);
	return Object.fromEntries(Object.entries(normalizedSchema).map(([key, value]) => {
		if (schemaMapKeywords.has(key)) return [key, normalizeSchemaMap(value)];
		if (schemaValueKeywords.has(key) || schemaArrayKeywords.has(key)) return [key, normalizeJsonSchemaNode(value)];
		return [key, value];
	}));
}
function readDefault(schema) {
	if (!isRecord(schema) || !Object.hasOwn(schema, "default")) return;
	return structuredClone(schema.default);
}
function decodePointerSegment(segment) {
	return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}
function resolveLocalRef(root, ref) {
	if (ref === "#") return root;
	if (!ref.startsWith("#/")) return;
	let current = root;
	for (const segment of ref.slice(2).split("/").map(decodePointerSegment)) {
		if (!isRecord(current)) return;
		current = current[segment];
	}
	return current;
}
function applySchemaDefaults(schema, value, root = schema, resolvingRefs = /* @__PURE__ */ new Set()) {
	if (value === void 0) {
		const defaultValue = readDefault(schema);
		if (defaultValue !== void 0) return defaultValue;
	}
	if (!isRecord(schema)) return value;
	let nextValue = value;
	if (typeof schema.$ref === "string" && !resolvingRefs.has(schema.$ref)) {
		const target = resolveLocalRef(root, schema.$ref);
		if (target !== void 0) {
			resolvingRefs.add(schema.$ref);
			nextValue = applySchemaDefaults(target, nextValue, root, resolvingRefs);
			resolvingRefs.delete(schema.$ref);
		}
	}
	for (const key of ["allOf"]) {
		const branches = schema[key];
		if (Array.isArray(branches)) for (const branch of branches) nextValue = applySchemaDefaults(branch, nextValue, root, resolvingRefs);
	}
	if (schemaTypeIncludes(schema, "object") && isRecord(nextValue) && isRecord(schema.properties)) {
		for (const [key, propertySchema] of Object.entries(schema.properties)) {
			const currentValue = nextValue[key];
			const defaultedValue = applySchemaDefaults(propertySchema, currentValue, root, resolvingRefs);
			if (defaultedValue !== void 0 && defaultedValue !== currentValue) nextValue[key] = defaultedValue;
		}
		if (isRecord(schema.additionalProperties)) for (const key of Object.keys(nextValue)) {
			if (Object.hasOwn(schema.properties, key)) continue;
			nextValue[key] = applySchemaDefaults(schema.additionalProperties, nextValue[key], root, resolvingRefs);
		}
	}
	if (schemaTypeIncludes(schema, "array") && Array.isArray(nextValue) && isRecord(schema.items)) return nextValue.map((entry) => applySchemaDefaults(schema.items, entry, root, resolvingRefs));
	return nextValue;
}
function normalizeWithDefaults(schema, value) {
	if (value === void 0 || value === null) return value;
	return applySchemaDefaults(schema, structuredClone(value));
}
const validateDynamicToolCallParams = compileCodexSchema(dynamicToolCallParamsSchema);
const validateErrorNotification = compileCodexSchema(errorNotificationSchema);
const validateModelListResponse = compileCodexSchema(modelListResponseSchema);
const validateThreadResumeResponse = compileCodexSchema(threadResumeResponseSchema);
const validateThreadStartResponse = compileCodexSchema(threadStartResponseSchema);
const validateTurnCompletedNotification = compileCodexSchema(turnCompletedNotificationSchema);
const validateTurnStartResponse = compileCodexSchema(turnStartResponseSchema);
/** Asserts and normalizes a Codex thread/start response. */
function assertCodexThreadStartResponse(value) {
	const normalized = normalizeWithDefaults(threadStartResponseSchema, value);
	return assertCodexShape(validateThreadStartResponse, normalized, "thread/start response");
}
/** Asserts and normalizes a Codex thread/fork response. */
function assertCodexThreadForkResponse(value) {
	const normalized = normalizeWithDefaults(threadStartResponseSchema, value);
	return assertCodexShape(validateThreadStartResponse, normalized, "thread/fork response");
}
/** Asserts the experimental beforeTurnId request field before it crosses the app-server boundary. */
function assertCodexThreadForkParams(value) {
	if (!isRecord(value) || typeof value.threadId !== "string" || !value.threadId.trim() || value.beforeTurnId !== void 0 && value.beforeTurnId !== null && typeof value.beforeTurnId !== "string") throw new Error("Invalid Codex app-server thread/fork params");
	return value;
}
/** Asserts and normalizes a Codex thread/resume response. */
function assertCodexThreadResumeResponse(value) {
	const normalized = normalizeWithDefaults(threadResumeResponseSchema, value);
	return assertCodexShape(validateThreadResumeResponse, normalized, "thread/resume response");
}
var CodexThreadDirectInputError = class extends Error {
	constructor(threadId) {
		super(`Codex thread ${threadId} is controlled by its parent and cannot accept direct input. Continue its parent thread, or use /new for a separate OpenClaw session.`);
		this.name = "CodexThreadDirectInputError";
	}
};
/** Native V2 children allow observation, but only their parent may supply turn input. */
function assertCodexThreadAcceptsDirectInput(thread) {
	if (thread.canAcceptDirectInput === false) throw new CodexThreadDirectInputError(thread.id);
}
/** Asserts and normalizes a Codex turn/start response. */
function assertCodexTurnStartResponse(value) {
	const normalized = normalizeWithDefaults(turnStartResponseSchema, normalizeTurnStartResponse(value));
	return assertCodexShape(validateTurnStartResponse, normalized, "turn/start response");
}
/** Reads Codex dynamic-tool call params, returning undefined for invalid payloads. */
function readCodexDynamicToolCallParams(value) {
	return readCodexShape(validateDynamicToolCallParams, normalizeWithDefaults(dynamicToolCallParamsSchema, value));
}
/** Reads a Codex error notification payload if it matches the protocol schema. */
function readCodexErrorNotification(value) {
	return readCodexShape(validateErrorNotification, normalizeWithDefaults(errorNotificationSchema, value));
}
/** Asserts and normalizes a Codex model/list response. */
function assertCodexModelListResponse(value) {
	return assertCodexShape(validateModelListResponse, normalizeWithDefaults(modelListResponseSchema, value), "model/list response");
}
/** Reads and normalizes a Codex turn object. */
function readCodexTurn(value) {
	return readCodexShape(validateTurnStartResponse, normalizeWithDefaults(turnStartResponseSchema, { turn: normalizeTurn(value) }))?.turn;
}
/** Reads a Codex turn/completed notification payload if it matches the protocol schema. */
function readCodexTurnCompletedNotification(value) {
	return readCodexShape(validateTurnCompletedNotification, normalizeWithDefaults(turnCompletedNotificationSchema, normalizeTurnCompletedNotification(value)));
}
function assertCodexShape(validate, value, label) {
	if (validate.check(value)) return value;
	throw new Error(`Invalid Codex app-server ${label}: ${formatValidationErrors(validate, value)}`);
}
function readCodexShape(validate, value) {
	return validate.check(value) ? value : void 0;
}
function normalizeTurn(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return value;
	return {
		error: null,
		startedAt: null,
		completedAt: null,
		durationMs: null,
		...value,
		items: Array.isArray(value.items) ? value.items.map(normalizeThreadItem) : []
	};
}
function normalizeThreadItem(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return value;
	switch (value.type) {
		case "agentMessage": return {
			phase: null,
			delivery: null,
			memoryCitation: null,
			...value
		};
		case "plan": return {
			text: "",
			...value
		};
		case "reasoning": return {
			summary: [],
			content: [],
			...value
		};
		case "dynamicToolCall": return {
			namespace: null,
			arguments: null,
			status: "completed",
			contentItems: null,
			success: null,
			durationMs: null,
			...value
		};
		default: return value;
	}
}
function normalizeTurnStartResponse(value) {
	if (!value || typeof value !== "object" || Array.isArray(value) || !("turn" in value)) return value;
	return {
		...value,
		turn: normalizeTurn(value.turn)
	};
}
function normalizeTurnCompletedNotification(value) {
	if (!value || typeof value !== "object" || Array.isArray(value) || !("turn" in value)) return value;
	return {
		...value,
		turn: normalizeTurn(value.turn)
	};
}
function formatValidationErrors(validate, value) {
	const errors = validate.errors(value);
	if (!errors || errors.length === 0) return "schema validation failed";
	return errors.map((error) => {
		const message = error.message?.trim() || "schema validation failed";
		return error.instancePath ? `${error.instancePath} ${message}` : message;
	}).join("; ");
}
//#endregion
//#region extensions/codex/src/app-server/rpc-error.ts
/** RPC error wrapper that preserves app-server error code and data. */
var CodexAppServerRpcError = class extends Error {
	constructor(error, method) {
		super(formatCodexAppServerRpcErrorMessage(error, method));
		this.name = "CodexAppServerRpcError";
		this.code = error.code;
		this.data = error.data;
		this.method = method;
	}
};
function formatCodexAppServerRpcErrorMessage(error, method) {
	const message = error.message || `${method} failed`;
	const detail = readCodexAppServerRpcReloginDetail(error.data);
	return detail && !message.includes(detail) ? `${message}: ${detail}` : message;
}
function readCodexAppServerRpcReloginDetail(data) {
	const record = isJsonObject(data) ? data : void 0;
	const nested = isJsonObject(record?.error) ? record.error : record;
	if (!nested) return;
	const isRelogin = nested.action === "relogin" || nested.reason === "cloudRequirements" && nested.errorCode === "Auth";
	const detail = typeof nested.detail === "string" ? nested.detail.trim() : "";
	return isRelogin && detail ? detail : void 0;
}
//#endregion
//#region extensions/codex/src/app-server/transport-websocket.ts
/**
* Adapts a remote Codex app-server WebSocket endpoint to the shared stdio-like
* transport interface.
*/
const WEBSOCKET_HANDSHAKE_TIMEOUT_MS = 1e4;
const WEBSOCKET_PING_INTERVAL_MS = 2e4;
const WEBSOCKET_PONG_TIMEOUT_MS = 2e4;
const MAX_CONSECUTIVE_MISSED_WEBSOCKET_PONGS = 5;
/** Opens a WebSocket app-server transport and maps newline-delimited frames to stdout/stdin. */
function createWebSocketTransport(options) {
	if (!options.url) throw new Error("codex app-server websocket transport requires plugins.entries.codex.config.appServer.url");
	const events = new EventEmitter();
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const websocketOptions = {
		headers: {
			...options.headers,
			...options.authToken ? { Authorization: `Bearer ${options.authToken}` } : {}
		},
		perMessageDeflate: false,
		...options.transport === "websocket" ? { handshakeTimeout: WEBSOCKET_HANDSHAKE_TIMEOUT_MS } : {}
	};
	const unixSocketPath = resolveCodexAppServerUnixSocketPath(options);
	const socket = unixSocketPath ? new WebSocket("ws://localhost/", {
		...websocketOptions,
		createConnection: () => connectCodexAppServerUnixSocket(unixSocketPath)
	}) : new WebSocket(options.url, websocketOptions);
	const pendingFrames = [];
	const stdinDecoder = new StringDecoder("utf8");
	let pendingLine = "";
	let killed = false;
	let pingTimeout;
	let pongTimeout;
	let expectedPong;
	let consecutiveMissedPongs = 0;
	let heartbeatSequence = 0;
	const clearConnectionHealthTimers = () => {
		if (pingTimeout) {
			clearTimeout(pingTimeout);
			pingTimeout = void 0;
		}
		if (pongTimeout) {
			clearTimeout(pongTimeout);
			pongTimeout = void 0;
		}
		expectedPong = void 0;
	};
	const sendHeartbeatPing = () => {
		if (socket.readyState !== WebSocket.OPEN || pongTimeout) return;
		const payload = Buffer.from(`openclaw-codex-${++heartbeatSequence}`);
		expectedPong = payload;
		pongTimeout = setTimeout(() => {
			pongTimeout = void 0;
			expectedPong = void 0;
			consecutiveMissedPongs += 1;
			if (consecutiveMissedPongs >= MAX_CONSECUTIVE_MISSED_WEBSOCKET_PONGS) {
				socket.terminate();
				return;
			}
			sendHeartbeatPing();
		}, WEBSOCKET_PONG_TIMEOUT_MS);
		pongTimeout.unref();
		socket.ping(payload, void 0, (error) => {
			if (error) socket.terminate();
		});
	};
	const scheduleHeartbeatPing = () => {
		if (options.transport !== "websocket" || socket.readyState !== WebSocket.OPEN || pingTimeout || pongTimeout) return;
		pingTimeout = setTimeout(() => {
			pingTimeout = void 0;
			sendHeartbeatPing();
		}, WEBSOCKET_PING_INTERVAL_MS);
		pingTimeout.unref();
	};
	const recordConnectionActivity = () => {
		consecutiveMissedPongs = 0;
		if (pongTimeout) {
			clearTimeout(pongTimeout);
			pongTimeout = void 0;
		}
		expectedPong = void 0;
		scheduleHeartbeatPing();
	};
	const sendFrame = (frame) => {
		const trimmed = frame.trim();
		if (!trimmed) return;
		if (socket.readyState === WebSocket.OPEN) {
			socket.send(trimmed);
			return;
		}
		pendingFrames.push(trimmed);
	};
	socket.once("open", () => {
		for (const frame of pendingFrames.splice(0)) socket.send(frame);
		scheduleHeartbeatPing();
	});
	socket.on("pong", (payload) => {
		if (expectedPong?.equals(payload)) recordConnectionActivity();
	});
	socket.once("error", (error) => {
		clearConnectionHealthTimers();
		events.emit("error", error);
	});
	socket.once("close", (code, reason) => {
		clearConnectionHealthTimers();
		killed = true;
		events.emit("exit", code, reason.toString("utf8"));
	});
	socket.on("message", (data) => {
		if (options.transport === "websocket") recordConnectionActivity();
		const text = websocketFrameToText(data);
		stdout.write(text.endsWith("\n") ? text : `${text}\n`);
	});
	const stdin = new Writable({
		write(chunk, _encoding, callback) {
			pendingLine += stdinDecoder.write(chunk);
			const lines = pendingLine.split("\n");
			pendingLine = lines.pop() ?? "";
			for (const frame of lines) sendFrame(frame);
			callback();
		},
		final(callback) {
			pendingLine += stdinDecoder.end();
			if (pendingLine) sendFrame(pendingLine);
			pendingLine = "";
			callback();
		}
	});
	const closeSocket = () => {
		if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) return;
		socket.close();
	};
	stdin.once("finish", closeSocket);
	stdin.once("close", closeSocket);
	return {
		stdin,
		stdout,
		stderr,
		get killed() {
			return killed;
		},
		kill: () => {
			killed = true;
			clearConnectionHealthTimers();
			socket.close();
		},
		once: (event, listener) => events.once(event, listener)
	};
}
/** Opens the owner-scoped Codex control socket used by the WebSocket upgrade. */
function connectCodexAppServerUnixSocket(socketPath) {
	return net.createConnection(socketPath);
}
/** Resolves the canonical or explicitly configured Codex control socket. */
function resolveCodexAppServerUnixSocketPath(options) {
	if (options.transport !== "unix") {
		if (options.url?.startsWith("unix://")) throw new Error("codex app-server unix URL requires unix transport");
		return;
	}
	const url = options.url ?? "unix://";
	if (!url.startsWith("unix://")) throw new Error("codex app-server unix transport requires a unix:// URL");
	return url.slice(7) || path.join(resolveCodexAppServerUserHomeDir(options.env ?? process.env), "app-server-control", "app-server-control.sock");
}
function websocketFrameToText(data) {
	if (typeof data === "string") return data;
	if (Buffer.isBuffer(data)) return data.toString("utf8");
	if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
	return Buffer.from(data).toString("utf8");
}
//#endregion
//#region extensions/codex/src/app-server/client.ts
/**
* JSON-RPC client for Codex app-server transports, including request/response
* routing, notification fanout, server request handlers, and version checks.
*/
const CODEX_APP_SERVER_PARSE_LOG_MAX = 500;
const CODEX_APP_SERVER_PARSE_BUFFER_MAX = 8388608;
const CODEX_APP_SERVER_PARSE_BUFFER_MAX_LINES = 1e3;
const CODEX_APP_SERVER_STDERR_TAIL_MAX = 2e3;
const CODEX_APP_SERVER_OVERLOADED_ERROR_CODE = -32001;
const CODEX_APP_SERVER_OVERLOAD_MAX_RETRIES = 3;
const CODEX_APP_SERVER_OVERLOAD_RETRY_BASE_MS = 50;
const CODEX_APP_SERVER_PENDING_STARTUP_WARNINGS_MAX = 32;
const CODEX_APP_SERVER_CLIENT_INSTANCE_IDS = /* @__PURE__ */ new WeakMap();
const UNPAIRED_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
/** Process-local generation fence for bindings tied to one app-server client instance. */
function getCodexAppServerClientInstanceId(client) {
	const current = CODEX_APP_SERVER_CLIENT_INSTANCE_IDS.get(client);
	if (current) return current;
	const created = randomUUID();
	CODEX_APP_SERVER_CLIENT_INSTANCE_IDS.set(client, created);
	return created;
}
function resolveCodexAppServerClientInstanceId(client) {
	return client.getInstanceId?.call(client) ?? getCodexAppServerClientInstanceId(client);
}
/** Codex rejects this exact code before enqueueing, including mutating requests. */
function isCodexAppServerOverloadError(error) {
	return error instanceof CodexAppServerRpcError && error.code === CODEX_APP_SERVER_OVERLOADED_ERROR_CODE;
}
var CodexAppServerLocalRequestCancellationError = class extends Error {
	constructor(method, reason, mayHaveWritten) {
		super(`${method} ${reason}`);
		this.reason = reason;
		this.mayHaveWritten = mayHaveWritten;
		this.code = "CODEX_APP_SERVER_LOCAL_REQUEST_CANCELLED";
		this.name = "CodexAppServerLocalRequestCancellationError";
	}
};
function isCodexAppServerRequestTimeoutError(error) {
	return error instanceof Error && "code" in error && error.code === "CODEX_APP_SERVER_LOCAL_REQUEST_CANCELLED" && "reason" in error && error.reason === "timed out";
}
function isCodexAppServerBrokenPipeError(error) {
	const seen = /* @__PURE__ */ new Set();
	let current = error;
	while (current && typeof current === "object" && !seen.has(current)) {
		seen.add(current);
		if ("code" in current && current.code === "EPIPE") return true;
		current = "cause" in current ? current.cause : void 0;
	}
	return false;
}
var CodexAppServerIndeterminateTransportError = class extends Error {
	constructor(method, cause) {
		super(`${method} transport failed after request write: ${cause.message}`, { cause });
		this.code = "CODEX_APP_SERVER_REQUEST_TRANSPORT_INDETERMINATE";
		this.mayHaveWritten = true;
		this.name = "CodexAppServerIndeterminateTransportError";
	}
};
/** True when a local cancellation can leave an app-server request in flight. */
function isCodexAppServerIndeterminateRequestCancellationError(error) {
	return error instanceof Error && "code" in error && error.code === "CODEX_APP_SERVER_LOCAL_REQUEST_CANCELLED" && "mayHaveWritten" in error && error.mayHaveWritten === true;
}
/** True when local cancellation happened before a request write was attempted. */
function isCodexAppServerPrewriteRequestCancellationError(error) {
	return error instanceof Error && "code" in error && error.code === "CODEX_APP_SERVER_LOCAL_REQUEST_CANCELLED" && "mayHaveWritten" in error && error.mayHaveWritten === false;
}
/** True when transport failure cannot prove a written request stopped running. */
function isCodexAppServerIndeterminateTransportError(error) {
	return error instanceof Error && "code" in error && error.code === "CODEX_APP_SERVER_REQUEST_TRANSPORT_INDETERMINATE" && "mayHaveWritten" in error && error.mayHaveWritten === true;
}
/** Returns true for errors that mean the app-server transport is closed. */
function isCodexAppServerConnectionClosedError(error) {
	if (!(error instanceof Error)) return false;
	if (isCodexAppServerIndeterminateTransportError(error)) return true;
	return error.message === "codex app-server client is closed" || error.message.startsWith("codex app-server exited:");
}
/** Stateful app-server JSON-RPC client over stdio or websocket transport. */
var CodexAppServerClient = class CodexAppServerClient {
	constructor(child) {
		this.instanceId = randomUUID();
		this.pending = /* @__PURE__ */ new Map();
		this.requestHandlers = /* @__PURE__ */ new Set();
		this.notificationHandlers = /* @__PURE__ */ new Set();
		this.pendingStartupWarnings = [];
		this.closeHandlers = /* @__PURE__ */ new Set();
		this.nextId = 1;
		this.initialized = false;
		this.modelCatalogRevision = 0;
		this.closed = false;
		this.transportExited = false;
		this.stderrTail = "";
		this.child = child;
		this.lines = createInterface({ input: child.stdout });
		this.lines.on("line", (line) => this.handleLine(line));
		this.lines.on("error", (error) => this.closeWithError(toStringifiedError(error)));
		child.stdout.on("error", (error) => this.closeWithError(toStringifiedError(error)));
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (text) => {
			this.stderrTail = appendBoundedTail(this.stderrTail, text, CODEX_APP_SERVER_STDERR_TAIL_MAX);
			const trimmed = text.trim();
			if (trimmed) embeddedAgentLog.debug(`codex app-server stderr: ${trimmed}`);
		});
		child.stderr.on("error", (error) => {
			embeddedAgentLog.warn("codex app-server stderr stream failed", { error });
		});
		child.once("error", (error) => this.closeWithError(toStringifiedError(error)));
		child.once("exit", (code, signal) => {
			this.transportExited = true;
			this.closeWithError(buildCodexAppServerExitError(code, signal, this.stderrTail));
		});
		child.stdin.on?.("error", (error) => this.closeWithError(toStringifiedError(error)));
	}
	/** Starts a new app-server client using resolved runtime start options. */
	static async start(options, assertCurrent) {
		const defaults = resolveCodexAppServerRuntimeOptions().start;
		const startOptions = {
			...defaults,
			...options,
			headers: options?.headers ?? defaults.headers
		};
		if (startOptions.transport === "stdio" && startOptions.commandSource === "managed") throw new Error("Managed Codex app-server start options must be resolved before spawn.");
		if (startOptions.transport === "websocket" || startOptions.transport === "unix") return new CodexAppServerClient(createWebSocketTransport(startOptions));
		let client;
		try {
			await createStdioTransport(startOptions, process.env, assertCurrent, (child) => {
				client = new CodexAppServerClient(child);
			});
			return client;
		} catch (error) {
			assertCurrent?.();
			if (client?.transportExited && hasCodexAppServerNaturalExit(client.child)) throw buildCodexAppServerExitError(client.child.exitCode, client.child.signalCode, client.stderrTail);
			const stderr = client?.getStderrDiagnostic();
			throw stderr ? new Error(`${coerceErrorMessage(error)}; stderr=${JSON.stringify(stderr)}`, { cause: error }) : error;
		}
	}
	/** Builds a client around a fake transport for tests. */
	static fromTransportForTests(child) {
		return new CodexAppServerClient(child);
	}
	/** Performs the app-server initialize handshake and validates protocol version. */
	async initialize() {
		if (this.initialized) return;
		const response = await this.request("initialize", {
			clientInfo: {
				name: "openclaw",
				title: "OpenClaw",
				version: OPENCLAW_VERSION
			},
			capabilities: {
				experimentalApi: true,
				extensions: {
					"openai/standard-form-input": {},
					"openai/form": {},
					"io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] }
				}
			}
		});
		this.serverVersion = assertSupportedCodexAppServerVersion(response);
		this.runtimeIdentity = buildCodexAppServerRuntimeIdentity(response, this.serverVersion);
		this.notify("initialized");
		this.initialized = true;
	}
	/** Returns the version detected during initialize. */
	getServerVersion() {
		return this.serverVersion;
	}
	/** Returns runtime metadata detected during initialize. */
	getRuntimeIdentity() {
		return this.runtimeIdentity ? { ...this.runtimeIdentity } : void 0;
	}
	/** Returns a bounded, redacted stderr diagnostic from the app-server process. */
	getStderrDiagnostic() {
		return redactCodexAppServerLinePreview(this.stderrTail) || void 0;
	}
	/** Returns the terminal transport error that closed this physical client. */
	getCloseError() {
		return this.closeError;
	}
	/** Stable generation id for this exact physical client instance. */
	getInstanceId() {
		return this.instanceId;
	}
	/** Account/config observations become stale before a mutation can enter the wire. */
	getModelCatalogRevision() {
		return this.modelCatalogRevision;
	}
	/** Installs the spawn-owner check run before config-loading thread requests. */
	setThreadSessionRequestGuard(guard) {
		this.threadSessionRequestGuard = guard;
	}
	/** Returns the local transport PID for scoped child-process cleanup, when available. */
	getTransportPid() {
		return this.child.pid;
	}
	request(method, params, optionsInput) {
		const options = optionsInput ?? {};
		if (this.closed) return Promise.reject(this.closeError ?? /* @__PURE__ */ new Error("codex app-server client is closed"));
		if (options.signal?.aborted) return Promise.reject(new CodexAppServerLocalRequestCancellationError(method, "aborted", false));
		const guard = method === "thread/start" || method === "thread/resume" || method === "thread/fork" ? this.threadSessionRequestGuard : void 0;
		if (guard) {
			if (!options.signal && !(options.timeoutMs !== void 0 && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0)) return Promise.reject(/* @__PURE__ */ new TypeError(`${method} requires a positive finite timeout or abort signal`));
			return (async () => {
				const guardStartedAt = Date.now();
				const timeoutMessage = `${method} timed out`;
				const abortMessage = `${method} aborted`;
				let releaseGuard;
				try {
					releaseGuard = await guard({
						signal: options.signal,
						timeoutMs: options.timeoutMs,
						timeoutMessage,
						abortMessage
					});
				} catch (error) {
					if (error instanceof Error && error.message === timeoutMessage) throw new CodexAppServerLocalRequestCancellationError(method, "timed out", false);
					if (error instanceof Error && error.message === abortMessage) throw new CodexAppServerLocalRequestCancellationError(method, "aborted", false);
					throw error;
				}
				let released = false;
				const release = () => {
					if (released) return;
					released = true;
					releaseGuard();
				};
				let releaseWhenRequestSettles = true;
				let requestMayHaveWritten = false;
				try {
					const elapsedMs = Date.now() - guardStartedAt;
					const remainingTimeoutMs = options.timeoutMs === void 0 ? void 0 : options.timeoutMs - elapsedMs;
					if (remainingTimeoutMs !== void 0 && remainingTimeoutMs <= 0) throw new CodexAppServerLocalRequestCancellationError(method, "timed out", false);
					return await this.requestWithOverloadRetry(method, params, {
						...options,
						...remainingTimeoutMs !== void 0 ? { timeoutMs: remainingTimeoutMs } : {}
					}, (mayHaveWritten) => {
						requestMayHaveWritten = mayHaveWritten;
					});
				} catch (error) {
					if (requestMayHaveWritten && !(error instanceof CodexAppServerRpcError)) {
						releaseWhenRequestSettles = false;
						await this.closeAndRunAfterExit(release, method);
					}
					throw error;
				} finally {
					if (releaseWhenRequestSettles) release();
				}
			})();
		}
		return this.requestWithOverloadRetry(method, params, options);
	}
	async requestWithOverloadRetry(method, params, options, onWriteStateChange) {
		const deadline = options.timeoutMs !== void 0 && Number.isFinite(options.timeoutMs) ? Date.now() + options.timeoutMs : void 0;
		for (let retry = 0;; retry += 1) {
			if (options.signal?.aborted) throw new CodexAppServerLocalRequestCancellationError(method, "aborted", false);
			const remainingTimeoutMs = deadline === void 0 ? void 0 : deadline - Date.now();
			if (remainingTimeoutMs !== void 0 && remainingTimeoutMs <= 0) throw new CodexAppServerLocalRequestCancellationError(method, "timed out", false);
			try {
				return await this.requestOnce(method, params, {
					...options,
					...remainingTimeoutMs !== void 0 ? { timeoutMs: remainingTimeoutMs } : {}
				}, onWriteStateChange);
			} catch (error) {
				if (!isCodexAppServerOverloadError(error) || retry >= CODEX_APP_SERVER_OVERLOAD_MAX_RETRIES) throw error;
				onWriteStateChange?.(false);
				const backoffMs = Math.round(CODEX_APP_SERVER_OVERLOAD_RETRY_BASE_MS * 2 ** retry * (.75 + Math.random() * .5));
				await this.waitForOverloadRetry(method, backoffMs, deadline, options.signal);
			}
		}
	}
	async waitForOverloadRetry(method, backoffMs, deadline, signal) {
		if (signal?.aborted) throw new CodexAppServerLocalRequestCancellationError(method, "aborted", false);
		const remainingMs = deadline === void 0 ? void 0 : deadline - Date.now();
		if (remainingMs !== void 0 && remainingMs <= 0) throw new CodexAppServerLocalRequestCancellationError(method, "timed out", false);
		const delayMs = remainingMs === void 0 ? backoffMs : Math.min(backoffMs, remainingMs);
		await new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				cleanup();
				resolve();
			}, delayMs);
			timer.unref?.();
			const abortListener = () => {
				cleanup();
				reject(new CodexAppServerLocalRequestCancellationError(method, "aborted", false));
			};
			const cleanup = () => {
				clearTimeout(timer);
				signal?.removeEventListener("abort", abortListener);
			};
			signal?.addEventListener("abort", abortListener, { once: true });
			if (signal?.aborted) abortListener();
		});
	}
	requestOnce(method, params, options, onWriteStateChange) {
		if (this.closed) return Promise.reject(this.closeError ?? /* @__PURE__ */ new Error("codex app-server client is closed"));
		if (options.signal?.aborted) return Promise.reject(new CodexAppServerLocalRequestCancellationError(method, "aborted", false));
		const id = this.nextId++;
		if (method === "account/login/start" || method === "account/logout" || method === "config/value/write" || method === "config/batchWrite") this.modelCatalogRevision += 1;
		const message = {
			id,
			method,
			params
		};
		return new Promise((resolve, reject) => {
			let timeout;
			let cleanupAbort;
			let mayHaveWritten = false;
			const cleanup = () => {
				if (timeout) {
					clearTimeout(timeout);
					timeout = void 0;
				}
				cleanupAbort?.();
				cleanupAbort = void 0;
			};
			const rejectPending = (error) => {
				if (!this.pending.has(id)) return;
				this.pending.delete(id);
				cleanup();
				reject(mayHaveWritten && !(error instanceof CodexAppServerRpcError) && !isCodexAppServerIndeterminateRequestCancellationError(error) && !isCodexAppServerIndeterminateTransportError(error) ? new CodexAppServerIndeterminateTransportError(method, error) : error);
			};
			if (options.timeoutMs && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
				timeout = setTimeout(() => rejectPending(new CodexAppServerLocalRequestCancellationError(method, "timed out", mayHaveWritten)), Math.max(100, options.timeoutMs));
				timeout.unref?.();
			}
			if (options.signal) {
				const abortListener = () => rejectPending(new CodexAppServerLocalRequestCancellationError(method, "aborted", mayHaveWritten));
				options.signal.addEventListener("abort", abortListener, { once: true });
				cleanupAbort = () => options.signal?.removeEventListener("abort", abortListener);
			}
			this.pending.set(id, {
				method,
				resolve: (value) => {
					cleanup();
					resolve(value);
				},
				reject: (error) => {
					cleanup();
					reject(mayHaveWritten && !(error instanceof CodexAppServerRpcError) && !isCodexAppServerIndeterminateRequestCancellationError(error) && !isCodexAppServerIndeterminateTransportError(error) ? new CodexAppServerIndeterminateTransportError(method, error) : error);
				},
				cleanup
			});
			if (options.signal?.aborted) {
				rejectPending(new CodexAppServerLocalRequestCancellationError(method, "aborted", false));
				return;
			}
			try {
				options.assertCurrent?.();
				mayHaveWritten = true;
				onWriteStateChange?.(true);
				this.writeMessage(message, (error) => rejectPending(error));
			} catch (error) {
				rejectPending(toStringifiedError(error));
			}
		});
	}
	/** Sends a fire-and-forget JSON-RPC notification to the app-server. */
	notify(method, params) {
		this.writeMessage({
			method,
			params
		});
	}
	/** Registers a handler for app-server requests sent back to OpenClaw. */
	addRequestHandler(handler) {
		this.requestHandlers.add(handler);
		return () => this.requestHandlers.delete(handler);
	}
	/** Registers a notification handler and returns its disposer. */
	addNotificationHandler(handler) {
		this.notificationHandlers.add(handler);
		for (const notification of this.pendingStartupWarnings.splice(0)) this.handleNotification(notification);
		return () => this.notificationHandlers.delete(handler);
	}
	/** Registers a close handler and returns its disposer. */
	addCloseHandler(handler) {
		this.closeHandlers.add(handler);
		return () => this.closeHandlers.delete(handler);
	}
	/** Registers a handler for physical transport exit and returns its disposer. */
	addTransportExitHandler(handler) {
		if (this.transportExited) {
			handler(this);
			return () => void 0;
		}
		const onExit = () => handler(this);
		this.child.once("exit", onExit);
		return () => this.child.off?.("exit", onExit);
	}
	/** Closes the transport without waiting for process/socket shutdown. */
	close() {
		if (!this.markClosed(/* @__PURE__ */ new Error("codex app-server client is closed"))) return;
		closeCodexAppServerTransport(this.child);
	}
	/** Closes the transport and waits for shutdown according to transport policy. */
	async closeAndWait(options) {
		this.markClosed(/* @__PURE__ */ new Error("codex app-server client is closed"));
		return await closeCodexAppServerTransportAndWait(this.child, options);
	}
	/** Closes this transport and runs cleanup only after physical process exit. */
	async closeAndRunAfterExit(onExit, operation) {
		let settled = false;
		const runOnExit = () => {
			if (settled) return;
			settled = true;
			onExit();
		};
		if (this.transportExited) {
			runOnExit();
			return;
		}
		this.child.once("exit", runOnExit);
		try {
			if (await this.closeAndWait()) {
				this.child.off?.("exit", runOnExit);
				runOnExit();
			}
		} catch (closeError) {
			embeddedAgentLog.warn("codex app-server shutdown after indeterminate request failed", {
				closeError,
				operation
			});
		}
	}
	writeMessage(message, onError) {
		if (this.closed) return;
		const id = "id" in message ? message.id : void 0;
		const method = "method" in message ? message.method : void 0;
		this.child.stdin.write(`${stringifyCodexAppServerMessage(message)}\n`, (error) => {
			if (error) {
				embeddedAgentLog.warn("codex app-server write failed", {
					error,
					id,
					method
				});
				onError?.(error);
			}
		});
	}
	handleLine(line) {
		const rawLine = line.endsWith("\r") ? line.slice(0, -1) : line;
		if (this.pendingParse) {
			this.handlePendingParseLine(rawLine);
			return;
		}
		const trimmed = rawLine.trim();
		if (!trimmed) return;
		let parsed;
		try {
			parsed = JSON.parse(trimmed);
		} catch (error) {
			if (shouldBufferCodexAppServerParseFailure(trimmed, error)) {
				this.pendingParse = {
					text: trimmed,
					lineCount: 1,
					firstError: error
				};
				return;
			}
			logCodexAppServerParseFailure(trimmed, error, 1);
			return;
		}
		this.handleParsedMessage(parsed);
	}
	handlePendingParseLine(line) {
		const pending = this.pendingParse;
		if (!pending) return;
		const candidate = `${pending.text}\\n${line}`;
		let parsed;
		try {
			parsed = JSON.parse(candidate);
		} catch (error) {
			const lineCount = pending.lineCount + 1;
			if (shouldBufferCodexAppServerParseFailure(candidate.trim(), error) && candidate.length <= CODEX_APP_SERVER_PARSE_BUFFER_MAX && lineCount <= CODEX_APP_SERVER_PARSE_BUFFER_MAX_LINES) {
				this.pendingParse = {
					text: candidate,
					lineCount,
					firstError: pending.firstError
				};
				return;
			}
			this.pendingParse = void 0;
			logCodexAppServerParseFailure(candidate, error, lineCount);
			return;
		}
		this.pendingParse = void 0;
		this.handleParsedMessage(parsed);
	}
	handleParsedMessage(parsed) {
		if (!parsed || typeof parsed !== "object") return;
		const message = parsed;
		if (isRpcResponse(message)) {
			this.handleResponse(message);
			return;
		}
		if (!("method" in message)) return;
		if ("id" in message && message.id !== void 0) {
			this.handleServerRequest({
				id: message.id,
				method: message.method,
				params: message.params
			});
			return;
		}
		this.handleNotification({
			method: message.method,
			params: message.params
		});
	}
	handleResponse(response) {
		const pending = this.pending.get(response.id);
		if (!pending) return;
		this.pending.delete(response.id);
		if (response.error) {
			pending.reject(new CodexAppServerRpcError(response.error, pending.method));
			return;
		}
		pending.resolve(response.result);
	}
	async handleServerRequest(request) {
		try {
			const result = await this.runServerRequestHandlers(request);
			if (result !== void 0) {
				this.writeMessage({
					id: request.id,
					result
				});
				return;
			}
			this.writeMessage({
				id: request.id,
				result: defaultServerRequestResponse(request)
			});
		} catch (error) {
			const message = coerceErrorMessage(error);
			embeddedAgentLog.warn("codex app-server server request handler failed", {
				id: request.id,
				method: request.method,
				error
			});
			this.writeMessage({
				id: request.id,
				error: {
					code: -32603,
					message
				}
			});
		}
	}
	async runServerRequestHandlers(request) {
		const controller = new AbortController();
		if (request.method !== "item/tool/call") return await this.runServerRequestHandlersWithoutTimeout(request, controller.signal);
		const timeoutMs = resolveDynamicToolServerRequestTimeoutMs(readCodexDynamicToolCallParams(request.params));
		const timeoutResponse = timeoutServerRequestResponse(timeoutMs);
		let timeout;
		try {
			return await Promise.race([this.runServerRequestHandlersWithoutTimeout(request, controller.signal), new Promise((resolve) => {
				timeout = setTimeout(() => {
					embeddedAgentLog.warn("codex app-server server request timed out", {
						id: request.id,
						method: request.method,
						timeoutMs
					});
					controller.abort(/* @__PURE__ */ new Error("codex app-server server request timed out"));
					resolve(timeoutResponse);
				}, timeoutMs);
				timeout.unref?.();
			})]);
		} finally {
			if (timeout) clearTimeout(timeout);
		}
	}
	async runServerRequestHandlersWithoutTimeout(request, signal) {
		for (const handler of this.requestHandlers) {
			if (signal.aborted) return;
			const result = await handler(request, signal);
			if (result !== void 0) return result;
		}
	}
	handleNotification(notification) {
		if (notification.method === "account/updated") this.modelCatalogRevision += 1;
		if (this.notificationHandlers.size === 0 && notification.method === "configWarning") {
			if (this.pendingStartupWarnings.length === CODEX_APP_SERVER_PENDING_STARTUP_WARNINGS_MAX) this.pendingStartupWarnings.shift();
			this.pendingStartupWarnings.push(notification);
			return;
		}
		for (const handler of this.notificationHandlers) try {
			Promise.resolve(handler(notification)).catch((error) => {
				embeddedAgentLog.warn("codex app-server notification handler failed", { error });
			});
		} catch (error) {
			embeddedAgentLog.warn("codex app-server notification handler failed", { error });
		}
	}
	closeWithError(error) {
		if (this.markClosed(error)) closeCodexAppServerTransport(this.child);
	}
	markClosed(error) {
		if (this.closed) return false;
		this.closed = true;
		this.closeError = error;
		this.lines.close();
		this.rejectPendingRequests(error);
		return true;
	}
	rejectPendingRequests(error) {
		for (const pending of this.pending.values()) {
			pending.cleanup();
			pending.reject(error);
		}
		this.pending.clear();
		for (const handler of this.closeHandlers) handler(this);
	}
};
function defaultServerRequestResponse(request) {
	if (request.method === "item/tool/call") return {
		contentItems: [{
			type: "inputText",
			text: "OpenClaw did not register a handler for this app-server tool call."
		}],
		success: false
	};
	if (request.method === "item/commandExecution/requestApproval" || request.method === "item/fileChange/requestApproval") return { decision: "decline" };
	if (request.method === "item/permissions/requestApproval") return {
		permissions: {},
		scope: "turn"
	};
	if (request.method === "item/tool/requestUserInput") return { answers: {} };
	if (request.method === "mcpServer/elicitation/request") return createCodexElicitationResponse("decline", null, { message: "OpenClaw has no interactive handler for this elicitation." });
	return {};
}
function stringifyCodexAppServerMessage(message) {
	return JSON.stringify(message, (_key, value) => typeof value === "string" ? value.replace(UNPAIRED_SURROGATE_RE, "") : value) ?? "null";
}
function timeoutServerRequestResponse(timeoutMs) {
	return {
		contentItems: [{
			type: "inputText",
			text: `OpenClaw dynamic tool call timed out after ${timeoutMs}ms before sending a response to Codex.`
		}],
		success: false
	};
}
/** Raised when the initialize handshake detects an unsupported app-server version. */
var CodexAppServerVersionError = class extends Error {
	constructor(detectedVersion) {
		const detected = detectedVersion ? `detected ${detectedVersion}` : "OpenClaw could not determine the running Codex version";
		super(`Codex app-server ${MIN_SUPPORTED_CODEX_APP_SERVER_VERSION} or newer is required, but ${detected}. Update the configured Codex app-server binary, or remove custom command overrides to use the managed binary.`);
		this.name = "CodexAppServerVersionError";
		this.detectedVersion = detectedVersion;
	}
};
function assertSupportedCodexAppServerVersion(response) {
	const detectedVersion = readCodexVersionFromUserAgent(response.userAgent);
	if (!detectedVersion) throw new CodexAppServerVersionError(detectedVersion);
	const detected = parse(detectedVersion);
	if (!detected || detected.compare("0.149.0") < 0) throw new CodexAppServerVersionError(detectedVersion);
	if (detected.compare("0.152.1") > 0) embeddedAgentLog.warn("codex app-server is newer than OpenClaw's managed runtime; continuing with normal startup validation", {
		detectedVersion,
		validatedVersion: CODEX_APP_SERVER_VERSION
	});
	return detectedVersion;
}
function isUnsupportedCodexAppServerVersionError(error) {
	return error instanceof CodexAppServerVersionError;
}
function buildCodexAppServerRuntimeIdentity(response, serverVersion) {
	const userAgent = normalizeOptionalString(response.userAgent);
	const codexHome = normalizeOptionalString(response.codexHome);
	const platformFamily = normalizeOptionalString(response.platformFamily);
	const platformOs = normalizeOptionalString(response.platformOs);
	return {
		serverVersion,
		...userAgent ? { userAgent } : {},
		...codexHome ? { codexHome } : {},
		...platformFamily ? { platformFamily } : {},
		...platformOs ? { platformOs } : {}
	};
}
/** Extracts the Codex version from the app-server initialize user-agent field. */
function readCodexVersionFromUserAgent(userAgent) {
	return (userAgent?.match(/^[^/]+\/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)(?:[\s(]|$)/))?.[1];
}
function redactCodexAppServerLinePreview(value) {
	const redacted = value.replace(/\s+/g, " ").trim().replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+/gi, "$1<redacted>").replace(/("(?:api_?key|authorization|token|access_token|refresh_token)"\s*:\s*")([^"]+)(")/gi, "$1<redacted>$3").replace(/\b([a-z0-9_]*(?:api_?key|authorization|access_token|refresh_token|token))(\s*=\s*)(["']?)[^\s"']+(\3)/gi, "$1$2$3<redacted>$4");
	return redacted.length > CODEX_APP_SERVER_PARSE_LOG_MAX ? `${truncateUtf16Safe(redacted, CODEX_APP_SERVER_PARSE_LOG_MAX)}...` : redacted;
}
function appendBoundedTail(current, next, maxLength) {
	const combined = `${current}${next}`;
	return combined.length > maxLength ? sliceUtf16Safe(combined, -maxLength) : combined;
}
function buildCodexAppServerExitError(code, signal, stderrTail) {
	const stderrPreview = redactCodexAppServerLinePreview(stderrTail);
	const suffix = stderrPreview ? ` stderr=${JSON.stringify(stderrPreview)}` : "";
	return /* @__PURE__ */ new Error(`codex app-server exited: code=${formatExitValue(code)} signal=${formatExitValue(signal)}${suffix}`);
}
function shouldBufferCodexAppServerParseFailure(value, error) {
	if (!value.startsWith("{") && !value.startsWith("[")) return false;
	const message = coerceErrorMessage(error);
	return message.includes("Unterminated string") || message.includes("Unexpected end of JSON input");
}
function logCodexAppServerParseFailure(value, error, fragmentCount) {
	const linePreview = redactCodexAppServerLinePreview(value);
	const suffix = fragmentCount > 1 ? ` fragments=${fragmentCount}` : "";
	embeddedAgentLog.warn("failed to parse codex app-server message", {
		error,
		errorMessage: coerceErrorMessage(error),
		fragmentCount,
		linePreview,
		consoleMessage: `failed to parse codex app-server message${suffix}: preview=${JSON.stringify(linePreview)}`
	});
}
const CODEX_APP_SERVER_APPROVAL_REQUEST_METHODS = /* @__PURE__ */ new Set([
	"item/commandExecution/requestApproval",
	"item/fileChange/requestApproval",
	"item/permissions/requestApproval"
]);
/** Returns true for app-server approval request methods OpenClaw can answer. */
function isCodexAppServerApprovalRequest(method) {
	return CODEX_APP_SERVER_APPROVAL_REQUEST_METHODS.has(method);
}
function formatExitValue(value) {
	if (value === null || value === void 0) return "null";
	if (typeof value === "string" || typeof value === "number") return String(value);
	return "unknown";
}
//#endregion
//#region extensions/codex/src/app-server/attempt-timeouts.ts
/**
* Timeout defaults and normalizers for Codex app-server startup and turn
* liveness watches.
*/
/** Minimum startup timeout accepted by the Codex app-server harness. */
const CODEX_APP_SERVER_STARTUP_TIMEOUT_FLOOR_MS = 100;
const TURN_TERMINAL_SETTLEMENT_TIMEOUT_MS = 12e4;
const TURN_FINALIZE_DRAIN_ABORT_GRACE_MS = 5e3;
var CodexAppServerStartupError = class extends Error {
	constructor(reason, message = reason === "timed_out" ? "codex app-server startup timed out" : "codex app-server startup aborted") {
		super(message);
		this.reason = reason;
		this.code = "CODEX_APP_SERVER_STARTUP_CANCELLED";
		this.name = "CodexAppServerStartupError";
	}
};
function isCodexAppServerStartupError(error, reason) {
	return error instanceof Error && "code" in error && error.code === "CODEX_APP_SERVER_STARTUP_CANCELLED" && "reason" in error && (error.reason === "aborted" || error.reason === "timed_out") && (reason === void 0 || error.reason === reason);
}
function resolvePositiveIntegerTimeoutMs(value, fallbackMs) {
	const fallback = resolveTimerTimeoutMs(fallbackMs, 1);
	return resolveTimerTimeoutMs(value, fallback);
}
/** Runs startup work with abort and timeout handling plus optional cleanup. */
async function withCodexStartupTimeout(params) {
	if (params.signal.aborted) throw new CodexAppServerStartupError("aborted");
	let timeout;
	let abortCleanup;
	let timeoutError;
	let timeoutCleanup;
	try {
		return await Promise.race([params.operation(), new Promise((_, reject) => {
			const rejectOnce = (error) => {
				if (timeout) {
					clearTimeout(timeout);
					timeout = void 0;
				}
				reject(error);
			};
			timeout = setTimeout(() => {
				timeoutError = new CodexAppServerStartupError("timed_out");
				timeoutCleanup = Promise.resolve(params.onTimeout?.()).then(() => void 0, () => void 0);
				timeoutCleanup.finally(() => {
					rejectOnce(timeoutError);
				});
			}, params.timeoutMs);
			const abortListener = () => rejectOnce(new CodexAppServerStartupError("aborted"));
			params.signal.addEventListener("abort", abortListener, { once: true });
			abortCleanup = () => params.signal.removeEventListener("abort", abortListener);
		})]);
	} catch (error) {
		if (timeoutError) {
			await timeoutCleanup;
			throw timeoutError;
		}
		throw error;
	} finally {
		if (timeout) clearTimeout(timeout);
		abortCleanup?.();
	}
}
/** Resolves startup timeout while honoring the configured floor. */
function resolveCodexStartupTimeoutMs(params) {
	const timeoutFloorMs = resolvePositiveIntegerTimeoutMs(params.timeoutFloorMs, CODEX_APP_SERVER_STARTUP_TIMEOUT_FLOOR_MS);
	const timeoutMs = resolvePositiveIntegerTimeoutMs(params.timeoutMs, timeoutFloorMs);
	return Math.max(timeoutFloorMs, timeoutMs);
}
/** Adds gateway grace time to a caller timeout without overflowing invalid values. */
function resolveCodexGatewayTimeoutWithGraceMs(timeoutMs, graceMs = 1e4) {
	const timeout = resolvePositiveIntegerTimeoutMs(timeoutMs, 1);
	const grace = resolveTimerTimeoutMs(graceMs, 0, 0);
	return addTimerTimeoutGraceMs(timeout, grace) ?? timeout;
}
//#endregion
//#region extensions/codex/src/app-server/desktop-generation-fingerprint.ts
const MAX_COMPUTER_USE_PLUGIN_TREE_ENTRIES = 4096;
/** Fingerprints every desktop candidate that can own a managed fallback artifact. */
async function readMacOSDesktopGenerationFingerprint(candidates = resolveMacOSDesktopCodexAppPathCandidates("darwin")) {
	const entries = [];
	for (const candidate of candidates) {
		const command = await statFingerprint(candidate.appServerCommandPath);
		entries.push(`candidate:${candidate.appName}:${candidate.appServerCommandPath}:${command}`);
		for (const artifactPath of resolveMacOSDesktopGenerationPaths(candidate)) entries.push(`${artifactPath}\0${await statFingerprint(artifactPath)}`);
		const pluginRoot = resolveComputerUsePluginRoot(candidate);
		entries.push(`${pluginRoot}\0${await directoryTreeFingerprint(pluginRoot)}`);
	}
	return createHash("sha256").update(entries.join("\0")).digest("hex");
}
function resolveMacOSDesktopGenerationPaths(candidate) {
	return [
		candidate.appBundlePath,
		path.join(candidate.bundledMarketplacePath, ".agents", "plugins", "marketplace.json"),
		...candidate.computerUseServiceAppPaths.flatMap((servicePath) => [
			servicePath,
			path.join(servicePath, "Contents", "Info.plist"),
			path.join(servicePath, "Contents", "SharedSupport", "SkyComputerUseClient.app", "Contents", "MacOS", "SkyComputerUseClient")
		])
	];
}
function resolveComputerUsePluginRoot(candidate) {
	return path.join(candidate.bundledMarketplacePath, "plugins", "computer-use");
}
/** Stable roots that cover bundle replacement and recursive artifact updates. */
function resolveMacOSDesktopGenerationWatchPaths(candidates = resolveMacOSDesktopCodexAppPathCandidates("darwin")) {
	const watched = /* @__PURE__ */ new Set(["/Applications"]);
	for (const candidate of candidates) watched.add(candidate.appBundlePath);
	return [...watched];
}
async function directoryTreeFingerprint(root) {
	let rootStat;
	try {
		rootStat = await fs.lstat(root, { bigint: true });
	} catch (error) {
		if (isNodeError(error, "ENOENT") || isNodeError(error, "ENOTDIR")) return "missing";
		throw error;
	}
	if (!rootStat.isDirectory()) return statFingerprint(root);
	let entryCount = 0;
	const hash = createHash("sha256");
	hash.update("openclaw-codex-computer-use-plugin-tree-v1\0");
	const visit = async (directory, relativeDirectory, before) => {
		hash.update(`directory\0${relativeDirectory}\0${statTuple(before)}\0`);
		const entries = (await fs.readdir(directory, { withFileTypes: true })).toSorted((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
		for (const entry of entries) {
			entryCount += 1;
			if (entryCount > MAX_COMPUTER_USE_PLUGIN_TREE_ENTRIES) throw new Error("Codex Computer Use plugin exceeds the bounded tree size");
			const entryPath = path.join(directory, entry.name);
			const relativePath = path.join(relativeDirectory, entry.name);
			const entryStat = await fs.lstat(entryPath, { bigint: true });
			if (entryStat.isDirectory()) await visit(entryPath, relativePath, entryStat);
			else hash.update(`entry\0${relativePath}\0${await statFingerprint(entryPath)}\0`);
		}
		if (!sameStat(before, await fs.lstat(directory, { bigint: true }))) throw new Error(`Codex desktop artifact changed while fingerprinting: ${directory}`);
	};
	await visit(root, ".", rootStat);
	return hash.digest("hex");
}
async function statFingerprint(filePath) {
	try {
		const entry = await fs.lstat(filePath, { bigint: true });
		const type = entry.isSymbolicLink() ? "link" : entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other";
		const own = statTuple(entry);
		if (!entry.isSymbolicLink()) return `${type}:${own}:${entry.isFile() ? await readFileFingerprint(filePath, entry, false) : ""}`;
		const [link, realPath, target] = await Promise.all([
			fs.readlink(filePath),
			fs.realpath(filePath),
			fs.stat(filePath, { bigint: true })
		]);
		const content = target.isFile() ? await readFileFingerprint(filePath, target, true) : "";
		return `${type}:${own}:${link}:${realPath}:${statTuple(target)}:${content}`;
	} catch (error) {
		if (isNodeError(error, "ENOENT") || isNodeError(error, "ENOTDIR")) return "missing";
		throw error;
	}
}
async function readFileFingerprint(filePath, expected, followsSymlink) {
	const noFollow = followsSymlink ? 0 : constants$1.O_NOFOLLOW ?? 0;
	const handle = await fs.open(filePath, constants$1.O_RDONLY | noFollow);
	try {
		const before = await handle.stat({ bigint: true });
		if (!sameStat(before, expected)) throw new Error(`Codex desktop artifact changed while fingerprinting: ${filePath}`);
		const hash = createHash("sha256");
		for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
		if (!sameStat(before, await handle.stat({ bigint: true }))) throw new Error(`Codex desktop artifact changed while fingerprinting: ${filePath}`);
		return hash.digest("hex");
	} finally {
		await handle.close();
	}
}
function sameStat(left, right) {
	return statTuple(left) === statTuple(right);
}
function statTuple(stat) {
	return [
		stat.dev,
		stat.ino,
		stat.mode,
		stat.size,
		stat.mtimeNs,
		stat.ctimeNs
	].join(":");
}
function isNodeError(error, code) {
	return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
//#endregion
//#region extensions/codex/src/app-server/desktop-generation-owner.ts
const SETTLE_DELAY_MS = 1e3;
/** Coalesces filesystem invalidations into one stable desktop generation. */
function createCodexDesktopGenerationOwner(params) {
	let generation = params.initialGeneration;
	let invalidation = 0;
	let dirty = false;
	let refresh;
	let stopped = false;
	const markDirty = () => {
		invalidation += 1;
		dirty = true;
	};
	const reconcile = () => {
		if (refresh) return refresh;
		refresh = (async () => {
			for (;;) {
				if (stopped) throw new Error("Codex desktop generation owner stopped");
				const observedInvalidation = invalidation;
				const first = await params.readFingerprint();
				await delay(SETTLE_DELAY_MS);
				if (stopped) throw new Error("Codex desktop generation owner stopped");
				const second = await params.readFingerprint();
				if (stopped) throw new Error("Codex desktop generation owner stopped");
				if (observedInvalidation !== invalidation || first !== second) continue;
				const previous = generation;
				generation = previous?.fingerprint === second ? previous : {
					epoch: (previous?.epoch ?? 0) + 1,
					fingerprint: second
				};
				dirty = false;
				if (previous && generation !== previous) params.onGenerationChange?.(generation);
				return generation;
			}
		})().finally(() => {
			refresh = void 0;
		});
		return refresh;
	};
	return {
		read: () => generation,
		markDirty,
		wait: () => dirty ? reconcile() : Promise.resolve(generation),
		refresh: () => {
			markDirty();
			return reconcile();
		},
		isCurrent: (candidate) => Boolean(candidate && !dirty && generation && candidate.epoch === generation.epoch && candidate.fingerprint === generation.fingerprint),
		stop: () => {
			stopped = true;
		}
	};
}
function delay(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
//#endregion
//#region extensions/codex/src/app-server/desktop-generation.ts
/** Lifecycle-owned generation for managed macOS Codex desktop artifacts. */
const APPLICATIONS_PATH = "/Applications";
const REARM_INITIAL_DELAY_MS = 100;
const REARM_MAX_DELAY_MS = 3e4;
const DESKTOP_GENERATION_STATE = Symbol.for("openclaw.codexDesktopGenerationState");
function state() {
	const globalState = globalThis;
	return globalState[DESKTOP_GENERATION_STATE] ??= {};
}
function waitForCodexDesktopGeneration() {
	return state().owner?.wait() ?? Promise.resolve(void 0);
}
function isCodexDesktopGenerationCurrent(generation) {
	return state().owner?.isCurrent(generation) ?? false;
}
function createCodexDesktopGenerationService(params, runtime = {
	platform: process.platform,
	readFingerprint: readMacOSDesktopGenerationFingerprint,
	resolveWatchPaths: resolveMacOSDesktopGenerationWatchPaths,
	pathExists: existsSync,
	watchPath: (watchedPath, options, listener) => watch(watchedPath, options, listener)
}) {
	return {
		id: "codex-desktop-generation",
		async start(ctx) {
			if (runtime.platform !== "darwin") return;
			const current = state();
			current.context = ctx;
			current.readFingerprint = runtime.readFingerprint;
			current.resolveWatchPaths = runtime.resolveWatchPaths;
			current.pathExists = runtime.pathExists;
			current.watchPath = runtime.watchPath;
			current.owner = createCodexDesktopGenerationOwner({
				readFingerprint: current.readFingerprint,
				onGenerationChange: params.onGenerationChange,
				initialGeneration: current.lastGeneration
			});
			armWatchers(current);
			refreshGeneration(current, current.owner, current.owner.refresh());
		},
		async stop() {
			const current = state();
			current.lastGeneration = current.owner?.read() ?? current.lastGeneration;
			current.owner?.stop();
			current.owner = void 0;
			current.armEpoch = (current.armEpoch ?? 0) + 1;
			current.context = void 0;
			current.readFingerprint = void 0;
			current.resolveWatchPaths = void 0;
			current.pathExists = void 0;
			current.watchPath = void 0;
			current.watchHealthy = void 0;
			current.rearmDelayMs = void 0;
			if (current.rearmTimer) {
				clearTimeout(current.rearmTimer);
				current.rearmTimer = void 0;
			}
			closeWatchers(current);
		}
	};
}
function armWatchers(current) {
	const owner = current.owner;
	if (!owner || current.watchers) return false;
	const armEpoch = (current.armEpoch ?? 0) + 1;
	current.armEpoch = armEpoch;
	const watchers = /* @__PURE__ */ new Set();
	current.watchers = watchers;
	const candidateNames = new Set(resolveMacOSDesktopCodexAppPathCandidates("darwin").map((candidate) => candidate.appName));
	let complete = true;
	for (const watchedPath of current.resolveWatchPaths?.() ?? []) {
		if (!current.pathExists?.(watchedPath)) continue;
		try {
			const watcher = current.watchPath?.(watchedPath, { recursive: watchedPath !== APPLICATIONS_PATH }, (_eventType, filename) => {
				if (!isCurrentArm(current, owner, watchers, armEpoch)) return;
				if (watchedPath === APPLICATIONS_PATH && filename && !candidateNames.has(filename.toString().split(path.sep)[0] ?? "")) return;
				owner.markDirty();
				scheduleRearm(current, owner);
			});
			if (!watcher) {
				complete = false;
				reportWatcherFailure(current, owner, /* @__PURE__ */ new Error(`Could not watch ${watchedPath}`));
				scheduleRearm(current, owner);
				continue;
			}
			watchers.add(watcher);
			watcher.on("error", (error) => {
				if (!isCurrentArm(current, owner, watchers, armEpoch)) return;
				reportWatcherFailure(current, owner, error);
				scheduleRearm(current, owner);
			});
		} catch (error) {
			complete = false;
			reportWatcherFailure(current, owner, error);
			scheduleRearm(current, owner);
		}
	}
	current.watchHealthy = complete;
	if (complete) current.rearmDelayMs = REARM_INITIAL_DELAY_MS;
	return complete;
}
function reportWatcherFailure(current, owner, error) {
	if (current.watchHealthy === false) return;
	current.watchHealthy = false;
	owner.markDirty();
	current.context?.serviceHealth?.reportFailure(error);
	current.context?.logger.warn(`codex desktop generation watcher failed: ${String(error)}`);
}
function isCurrentArm(current, owner, watchers, armEpoch) {
	return current.owner === owner && current.watchers === watchers && current.armEpoch === armEpoch;
}
function scheduleRearm(current, owner) {
	if (current.rearmTimer) {
		if (current.watchHealthy === false) return;
		clearTimeout(current.rearmTimer);
	}
	const delayMs = current.watchHealthy === false ? current.rearmDelayMs ?? REARM_INITIAL_DELAY_MS : REARM_INITIAL_DELAY_MS;
	if (current.watchHealthy === false) current.rearmDelayMs = Math.min(delayMs * 2, REARM_MAX_DELAY_MS);
	current.rearmTimer = setTimeout(() => {
		current.rearmTimer = void 0;
		if (current.owner !== owner) return;
		const wasUnhealthy = current.watchHealthy === false;
		closeWatchers(current);
		if (!armWatchers(current) || wasUnhealthy) owner.markDirty();
		refreshGeneration(current, owner, owner.wait());
	}, delayMs);
	current.rearmTimer.unref();
}
function logRefreshFailure(current, owner) {
	return (error) => {
		if (current.owner !== owner) return;
		current.context?.serviceHealth?.reportFailure(error);
		current.context?.logger.warn(`codex desktop generation refresh failed: ${String(error)}`);
	};
}
function refreshGeneration(current, owner, refresh) {
	refresh.then(() => {
		if (current.owner === owner && current.watchHealthy) current.context?.serviceHealth?.clearFailure();
	}).catch(logRefreshFailure(current, owner));
}
function closeWatchers(current) {
	const watchers = current.watchers;
	current.watchers = void 0;
	for (const watcher of watchers ?? []) watcher.close();
}
//#endregion
//#region extensions/codex/src/app-server/native-config-fence.ts
const CODEX_NATIVE_CONFIG_FENCE_STATE = Symbol.for("openclaw.codexNativeConfigFenceState");
function getFenceState() {
	const globalState = globalThis;
	globalState[CODEX_NATIVE_CONFIG_FENCE_STATE] ??= /* @__PURE__ */ new Map();
	return globalState[CODEX_NATIVE_CONFIG_FENCE_STATE];
}
/** Acquires the per-CODEX_HOME fence and returns an idempotent release. */
async function acquireCodexNativeConfigFence(key, options = {}) {
	const state = getFenceState();
	const previous = state.get(key) ?? Promise.resolve();
	let resolveCurrent = () => void 0;
	const current = new Promise((resolve) => {
		resolveCurrent = resolve;
	});
	state.set(key, current);
	try {
		await waitForPreviousFence(previous, options);
	} catch (error) {
		previous.then(() => {
			resolveCurrent();
			if (state.get(key) === current) state.delete(key);
		});
		throw error;
	}
	let released = false;
	return () => {
		if (released) return;
		released = true;
		resolveCurrent();
		if (state.get(key) === current) state.delete(key);
	};
}
async function waitForPreviousFence(previous, options) {
	if (options.signal?.aborted) throw new Error(options.abortMessage ?? "Codex native config fence aborted");
	if (options.timeoutMs === void 0 && !options.signal) {
		await previous;
		return;
	}
	await new Promise((resolve, reject) => {
		let timeout;
		const cleanup = () => {
			if (timeout) {
				clearTimeout(timeout);
				timeout = void 0;
			}
			options.signal?.removeEventListener("abort", onAbort);
		};
		const settle = (run) => {
			cleanup();
			run();
		};
		const onAbort = () => settle(() => reject(new Error(options.abortMessage ?? "Codex native config fence aborted")));
		previous.then(() => settle(resolve));
		if (options.signal) options.signal.addEventListener("abort", onAbort, { once: true });
		if (options.timeoutMs !== void 0) {
			timeout = setTimeout(() => settle(() => reject(new Error(options.timeoutMessage ?? "Codex native config fence timed out"))), Math.max(1, options.timeoutMs));
			timeout.unref?.();
		}
	});
}
//#endregion
//#region extensions/codex/src/app-server/thread-lifecycle-errors.ts
var CodexThreadStartRequestError = class extends Error {
	constructor(cause) {
		super(`thread/start: ${formatErrorMessage(cause)}`, { cause });
		this.name = "CodexThreadStartRequestError";
	}
};
var CodexThreadBindingConflictError = class extends Error {
	constructor(threadId, operation) {
		super(`Codex thread binding changed while ${operation}: ${threadId}`);
		this.name = "CodexThreadBindingConflictError";
	}
};
var CodexAdoptedThreadActiveError = class extends AgentHarnessPreflightError {
	constructor(message = "Codex session became active in another runner; wait for it to finish before continuing") {
		super(message);
		this.name = "CodexAdoptedThreadActiveError";
	}
};
//#endregion
//#region extensions/codex/src/app-server/shared-client.ts
/**
* Owns shared and isolated Codex app-server client startup, auth application,
* lease tracking, and teardown.
*/
var shared_client_exports = /* @__PURE__ */ __exportAll({
	assertCodexAppServerClientStartSelectionCurrent: () => assertCodexAppServerClientStartSelectionCurrent,
	captureCodexAppServerClientLifetime: () => captureCodexAppServerClientLifetime,
	captureSharedCodexAppServerCatalogLifetime: () => captureSharedCodexAppServerCatalogLifetime,
	clearSharedCodexAppServerClientAndWait: () => clearSharedCodexAppServerClientAndWait,
	clearSharedCodexAppServerClientIfCurrent: () => clearSharedCodexAppServerClientIfCurrent,
	clearSharedCodexAppServerClientIfCurrentAndUnclaimed: () => clearSharedCodexAppServerClientIfCurrentAndUnclaimed,
	clearSharedCodexAppServerClientIfCurrentAndWait: () => clearSharedCodexAppServerClientIfCurrentAndWait,
	createIsolatedCodexAppServerClient: () => createIsolatedCodexAppServerClient,
	getLeasedSharedCodexAppServerClient: () => getLeasedSharedCodexAppServerClient,
	getSharedCodexAppServerClient: () => getSharedCodexAppServerClient,
	isCodexAppServerStartSelectionChangedError: () => isCodexAppServerStartSelectionChangedError,
	readCodexAppServerClientDesktopGeneration: () => readCodexAppServerClientDesktopGeneration,
	readCodexAppServerClientDesktopGenerationFingerprint: () => readCodexAppServerClientDesktopGenerationFingerprint,
	readCodexAppServerClientProcessIdentity: () => readCodexAppServerClientProcessIdentity,
	releaseCodexAppServerClientLease: () => releaseCodexAppServerClientLease,
	releaseLeasedSharedCodexAppServerClient: () => releaseLeasedSharedCodexAppServerClient,
	resolveCodexAppServerSpawnIdentity: () => resolveCodexAppServerSpawnIdentity,
	resolveCodexNativeConfigFenceKey: () => resolveCodexNativeConfigFenceKey,
	retainSharedCodexAppServerClientByInstanceId: () => retainSharedCodexAppServerClientByInstanceId,
	retainSharedCodexAppServerClientIfCurrent: () => retainSharedCodexAppServerClientIfCurrent,
	retireSharedCodexAppServerClientIfCurrent: () => retireSharedCodexAppServerClientIfCurrent,
	retireSharedCodexAppServerClientsBeforeDesktopGeneration: () => retireSharedCodexAppServerClientsBeforeDesktopGeneration,
	waitForCodexAppServerClientDesktopGenerationDrain: () => waitForCodexAppServerClientDesktopGenerationDrain,
	withLeasedCodexAppServerClientStartSelectionRetry: () => withLeasedCodexAppServerClientStartSelectionRetry
});
const CODEX_APP_SERVER_INITIALIZE_TIMEOUT_MESSAGE = "codex app-server initialize timed out";
const SHARED_CODEX_APP_SERVER_CLIENT_STATE = Symbol.for("openclaw.codexAppServerClientState");
const SHARED_CODEX_APP_SERVER_CLIENT_DISPOSER = Symbol.for("openclaw.codexAppServerClientDisposer");
const CODEX_APP_SERVER_CLIENT_START_METADATA = Symbol.for("openclaw.codexAppServerClientStartMetadata");
function getSharedCodexAppServerClientState() {
	const globalState = globalThis;
	globalState[SHARED_CODEX_APP_SERVER_CLIENT_STATE] ??= {
		clients: /* @__PURE__ */ new Map(),
		liveClients: /* @__PURE__ */ new Set(),
		isolatedClients: /* @__PURE__ */ new Set(),
		entriesByClient: /* @__PURE__ */ new WeakMap(),
		leasedReleases: /* @__PURE__ */ new WeakMap(),
		desktopGenerationDrainChecks: /* @__PURE__ */ new Set()
	};
	return globalState[SHARED_CODEX_APP_SERVER_CLIENT_STATE];
}
function getCodexAppServerClientStartMetadata() {
	const globalState = globalThis;
	globalState[CODEX_APP_SERVER_CLIENT_START_METADATA] ??= /* @__PURE__ */ new WeakMap();
	return globalState[CODEX_APP_SERVER_CLIENT_START_METADATA];
}
/** Reads the exact successful spawn selection plus its initialized runtime identity. */
function readCodexAppServerClientProcessIdentity(client) {
	const metadata = getCodexAppServerClientStartMetadata().get(client);
	if (!metadata) return;
	const runtimeIdentity = client.getRuntimeIdentity();
	return {
		clientId: client.getInstanceId(),
		...resolveCodexAppServerSpawnIdentity(metadata.startOptions, metadata.nativeCommand),
		...runtimeIdentity?.serverVersion ? { serverVersion: runtimeIdentity.serverVersion } : {},
		...runtimeIdentity?.userAgent ? { userAgent: runtimeIdentity.userAgent } : {}
	};
}
/** Returns the lifecycle fingerprint that owns a managed desktop client. */
function readCodexAppServerClientDesktopGenerationFingerprint(client) {
	return readCodexAppServerClientDesktopGeneration(client)?.fingerprint;
}
/** Returns the lifecycle generation that owns a managed desktop client. */
function readCodexAppServerClientDesktopGeneration(client) {
	return getCodexAppServerClientStartMetadata().get(client)?.desktopGeneration;
}
/** Waits until older physical desktop clients for this client's Codex home exit. */
async function waitForCodexAppServerClientDesktopGenerationDrain(params) {
	const metadata = getCodexAppServerClientStartMetadata().get(params.client);
	if (!metadata?.desktopGeneration) return;
	const drain = createOlderDesktopGenerationDrainWait({
		generation: metadata.desktopGeneration,
		startOptions: metadata.startOptions,
		agentDir: metadata.agentDir
	});
	try {
		await withCodexAppServerAcquireDeadline(params.timeoutMs ?? 0, drain.promise, params.signal, "Codex Computer Use install timed out waiting for older desktop clients");
	} finally {
		drain.cancel();
	}
}
/** Resolves non-secret spawn identity before startup; argv is represented only by its hash. */
function resolveCodexAppServerSpawnIdentity(startOptions, resolvedNativeCommand) {
	const nativeCommand = resolvedNativeCommand ?? (startOptions.commandSource === "resolved-managed" ? resolveManagedCodexNativeCommand(startOptions.command) : void 0);
	return {
		command: startOptions.command,
		argsFingerprint: createHash("sha256").update(JSON.stringify(startOptions.args)).digest("hex"),
		...startOptions.commandSource ? { commandSource: startOptions.commandSource } : {},
		...startOptions.managedCommandOrder ? { managedCommandOrder: startOptions.managedCommandOrder } : {},
		...nativeCommand ? { nativeCommand } : {}
	};
}
var CodexAppServerStartSelectionChangedError = class extends Error {
	constructor() {
		super("Codex app-server managed executable selection changed during startup");
		this.code = "CODEX_APP_SERVER_START_SELECTION_CHANGED";
		this.name = "CodexAppServerStartSelectionChangedError";
	}
};
/** Cross-bundle-safe check for a managed executable selection retry. */
function isCodexAppServerStartSelectionChangedError(error) {
	return error instanceof Error && "code" in error && error.code === "CODEX_APP_SERVER_START_SELECTION_CHANGED";
}
/**
* Rechecks mutable Codex-owned plugin state immediately before thread start/resume.
* The synchronous check prevents another gateway task from installing Computer
* Use between the check and the JSON-RPC write on the same event loop turn.
*/
function assertCodexAppServerClientStartSelectionCurrent(params) {
	const metadata = getCodexAppServerClientStartMetadata().get(params.client);
	if (!metadata) return;
	if (metadata.desktopGeneration && !isCodexDesktopGenerationCurrent(metadata.desktopGeneration)) throw new CodexAppServerStartSelectionChangedError();
	const requestedStartOptions = params.startOptions ?? metadata.requestedStartOptions;
	if (requestedStartOptions.commandSource !== "managed") return;
	const current = resolveCodexAppServerStartOptionsForAgent({
		startOptions: requestedStartOptions,
		agentDir: params.agentDir ?? metadata.agentDir
	});
	if ((metadata.startOptions.managedCommandOrder ?? "package-first") !== (current.managedCommandOrder ?? "package-first")) throw new CodexAppServerStartSelectionChangedError();
}
/** Resolves the per-CODEX_HOME key used to serialize native config loading. */
function resolveCodexNativeConfigFenceKey(params) {
	const metadata = params.client ? getCodexAppServerClientStartMetadata().get(params.client) : void 0;
	const startOptions = metadata?.startOptions ?? params.startOptions;
	if (!startOptions || startOptions.transport !== "stdio") return;
	const configuredHome = startOptions.env?.CODEX_HOME?.trim();
	const agentDir = params.agentDir ?? metadata?.agentDir ?? resolveDefaultAgentDir(params.config ?? {});
	const codexHome = configuredHome ? configuredHome : startOptions.homeScope === "user" ? resolveCodexAppServerUserHomeDir() : agentDir ? resolveCodexAppServerHomeDir(agentDir) : void 0;
	return codexHome ? `codex-home:${path.resolve(codexHome)}` : void 0;
}
function inferAuthRequirement(preparedAuth) {
	if (preparedAuth?.kind === "api-key") return "api-key";
	return preparedAuth?.kind === "profile" ? "subscription" : void 0;
}
async function resolveCodexAppServerClientStartContext(options) {
	const agentDir = options?.agentDir ?? resolveDefaultAgentDir(options?.config ?? {});
	const requestedStartOptions = options?.startOptions ?? resolveCodexAppServerRuntimeOptions().start;
	const desktopGeneration = shouldTrackDesktopGeneration(requestedStartOptions, options?.pluginConfig) ? await waitForCodexDesktopGeneration() : void 0;
	const preparedAuth = options?.preparedAuth;
	const preparedApiKey = preparedAuth?.kind === "api-key" ? preparedAuth.apiKey.trim() : void 0;
	if (preparedAuth && options?.authProfileId !== void 0) throw new Error("Prepared Codex auth cannot also select a legacy auth profile.");
	if (preparedAuth?.kind === "profile" && !preparedAuth.store.profiles[preparedAuth.profileId]) throw new Error(`Prepared Codex auth profile "${preparedAuth.profileId}" was not found. Select an existing OpenAI profile or sign in again with OpenClaw, then retry.`);
	if (preparedAuth?.kind === "api-key" && !preparedApiKey) throw new Error("Prepared Codex API-key auth is missing its resolved key.");
	if (preparedAuth && requestedStartOptions.homeScope === "user") throw new Error("Prepared Codex auth requires an isolated app-server home.");
	const preparedAuthRequirement = inferAuthRequirement(preparedAuth);
	if (options?.authRequirement && preparedAuthRequirement && options.authRequirement !== preparedAuthRequirement) throw new Error("Prepared Codex auth does not satisfy the requested auth requirement.");
	const authRequirement = options?.authRequirement ?? preparedAuthRequirement;
	const usesNativeAuth = !preparedAuth && (options?.authProfileId === null || requestedStartOptions.homeScope === "user");
	const requestedAuthProfileId = preparedAuth?.kind === "profile" ? preparedAuth.profileId : options?.authProfileId ?? void 0;
	const authProfileStore = preparedAuth?.kind === "profile" ? preparedAuth.store : !usesNativeAuth && preparedAuth?.kind !== "api-key" ? resolveCodexAppServerAuthProfileStore({
		agentDir,
		authProfileId: requestedAuthProfileId,
		authProfileStore: options?.authProfileStore,
		config: options?.config
	}) : options?.authProfileStore;
	const authProfileId = preparedAuth?.kind === "profile" ? preparedAuth.profileId : usesNativeAuth || preparedAuth?.kind === "api-key" ? void 0 : resolveCodexAppServerAuthProfileIdForAgent({
		authProfileId: requestedAuthProfileId,
		agentDir,
		config: options?.config,
		...authProfileStore ? { authProfileStore } : {}
	});
	const preparedAuthProfileSnapshot = !usesNativeAuth && authProfileId ? (preparedAuth?.kind === "profile" ? preparedAuth.snapshot : void 0) ?? await resolveCodexAppServerPreparedAuthProfileSnapshot({
		authProfileId,
		authProfileStore,
		agentDir,
		config: options?.config
	}) : void 0;
	if (preparedAuth?.kind === "profile" && !preparedAuthProfileSnapshot) throw new Error(`Prepared Codex auth profile "${preparedAuth.profileId}" is unusable. Repair or replace the selected OpenAI profile, then retry.`);
	const resolvedPreparedAuth = preparedAuth?.kind === "api-key" ? {
		kind: "api-key",
		apiKey: preparedApiKey
	} : preparedAuthProfileSnapshot && authProfileId && authProfileStore ? {
		kind: "profile",
		profileId: authProfileId,
		store: authProfileStore,
		snapshot: preparedAuthProfileSnapshot
	} : void 0;
	const agentStartOptions = resolveCodexAppServerStartOptionsForAgent({
		startOptions: requestedStartOptions,
		agentDir
	});
	return {
		agentDir,
		usesNativeAuth,
		authProfileId,
		authProfileStore,
		requestedStartOptions,
		preparedAuth: resolvedPreparedAuth,
		authRequirement,
		startOptions: await bridgeCodexAppServerStartOptions({
			startOptions: await resolveManagedCodexAppServerStartOptions(agentStartOptions),
			agentId: options?.agentId,
			agentDir,
			authProfileId: usesNativeAuth || preparedAuth?.kind === "api-key" ? null : authProfileId,
			...preparedAuth && resolvedPreparedAuth ? { preparedAuth: resolvedPreparedAuth } : {},
			authRequirement,
			config: options?.config,
			pluginConfig: options?.pluginConfig,
			...authProfileStore ? { authProfileStore } : {}
		}),
		...options?.pluginConfig !== void 0 ? { pluginConfig: options.pluginConfig } : {},
		...desktopGeneration ? { desktopGeneration } : {}
	};
}
function shouldTrackDesktopGeneration(startOptions, pluginConfig) {
	if (startOptions.transport !== "stdio") return false;
	if (resolveCodexComputerUseConfig({ pluginConfig }).enabled && (startOptions.commandSource === "managed" || startOptions.commandSource === "resolved-managed")) return true;
	return startOptions.commandSource === "managed" && (startOptions.managedCommandOrder ?? "package-first") === "desktop-first";
}
/** Gets or starts a shared Codex app-server client without retaining a lease. */
async function getSharedCodexAppServerClient(options) {
	return (await acquireSharedCodexAppServerClient(options)).client;
}
/** Gets or starts a shared Codex app-server client and records a release lease. */
async function getLeasedSharedCodexAppServerClient(options) {
	const acquired = await acquireSharedCodexAppServerClient(options, { leased: true });
	const state = getSharedCodexAppServerClientState();
	const releases = state.leasedReleases.get(acquired.client) ?? [];
	releases.push(acquired.release);
	state.leasedReleases.set(acquired.client, releases);
	return acquired.client;
}
/** Releases one outstanding lease for a shared Codex app-server client. */
function releaseLeasedSharedCodexAppServerClient(client) {
	const state = getSharedCodexAppServerClientState();
	const releases = state.leasedReleases.get(client);
	if (!releases) return false;
	const release = releases.pop();
	if (!release) return false;
	if (releases.length === 0) state.leasedReleases.delete(client);
	release();
	return true;
}
/** Releases the currently owned client exactly once. */
function releaseCodexAppServerClientLease(lease) {
	const client = lease.client;
	lease.client = void 0;
	return client ? releaseLeasedSharedCodexAppServerClient(client) : false;
}
/** Retries one config-loading operation with a shared deadline and current client lease. */
async function withLeasedCodexAppServerClientStartSelectionRetry(params) {
	let client = params.lease.client;
	if (!client) throw new Error("Codex app-server selection retry requires an active client lease");
	const timeoutMs = params.options?.timeoutMs ?? 6e4;
	const deadline = Date.now() + timeoutMs;
	const signal = params.signal ?? params.options?.abandonSignal;
	const requestOptions = () => {
		if (signal?.aborted) throw new CodexAppServerStartupError("aborted", "Codex app-server selection retry aborted");
		const remainingTimeoutMs = deadline - Date.now();
		if (remainingTimeoutMs <= 0) throw new CodexAppServerStartupError("timed_out", "Codex app-server selection retry timed out");
		return {
			timeoutMs: remainingTimeoutMs,
			...signal ? { signal } : {}
		};
	};
	for (let attempt = 0; attempt < 2; attempt += 1) {
		const attemptClient = client;
		let scopeActive = true;
		const assertCurrent = () => {
			if (!scopeActive || params.lease.client !== attemptClient) throw new CodexAppServerStartupError("aborted", "Codex app-server request scope is closed");
		};
		try {
			requestOptions();
			return await params.run(client, () => {
				assertCurrent();
				return {
					...requestOptions(),
					assertCurrent
				};
			});
		} catch (error) {
			if (!isCodexAppServerStartSelectionChangedError(error) || attempt > 0) throw error;
			retireSharedCodexAppServerClientIfCurrent(client);
			params.lease.client = void 0;
			if (!releaseLeasedSharedCodexAppServerClient(client)) {
				client.close();
				throw new Error("Codex app-server selection retry requires a leased shared client", { cause: error });
			}
			const replacementOptions = requestOptions();
			client = await getLeasedSharedCodexAppServerClient({
				...params.options,
				timeoutMs: replacementOptions.timeoutMs,
				...signal ? { abandonSignal: signal } : {}
			});
			params.lease.client = client;
			params.onClientChange?.(client);
		} finally {
			scopeActive = false;
		}
	}
	throw new Error("Codex app-server selection retry loop exited unexpectedly");
}
async function acquireSharedCodexAppServerClient(options, leaseOptions) {
	if (options?.abandonSignal?.aborted) throw new CodexAppServerStartupError("aborted", "codex app-server initialize aborted");
	const acquireStartedAt = Date.now();
	const timeoutMs = options?.timeoutMs ?? 0;
	const state = getSharedCodexAppServerClientState();
	const { agentDir, usesNativeAuth, authProfileId, authProfileStore, preparedAuth, authRequirement, requestedStartOptions, startOptions, desktopGeneration, pluginConfig } = await withCodexAppServerAcquireDeadline(timeoutMs, resolveCodexAppServerClientStartContext(options), options?.abandonSignal);
	const remainingTimeoutMs = resolveRemainingAcquireTimeout(timeoutMs, acquireStartedAt);
	const authIdentityCacheKey = preparedAuth?.kind === "api-key" ? resolveCodexAppServerPreparedApiKeyCacheKey(preparedAuth.apiKey) : preparedAuth?.snapshot.secretFreeCacheKey ?? (authRequirement === "api-key" && !authProfileId ? resolveCodexAppServerFallbackApiKeyCacheKey({ startOptions }) : void 0);
	const baseKey = `${codexAppServerStartOptionsKey(startOptions, {
		authProfileId,
		authBindingFingerprint: options?.authBindingFingerprint,
		agentDir: usesNativeAuth ? void 0 : agentDir,
		fallbackApiKeyCacheKey: authIdentityCacheKey
	})}\0auth-requirement:${authRequirement ?? "native"}${desktopGeneration ? `\0desktop-generation:${desktopGeneration.epoch}` : ""}`;
	const runtimeArtifactMode = options?.runtimeArtifactMode ?? (options?.expectedRuntimeArtifact ? "capture" : void 0);
	const expectedRuntimeArtifactKey = options?.expectedRuntimeArtifact ? createHash("sha256").update(options.expectedRuntimeArtifact.id).update("\0").update(options.expectedRuntimeArtifact.fingerprint).digest("hex") : "mint";
	const key = runtimeArtifactMode ? `${baseKey}\0runtime-artifact:capture-v1:${expectedRuntimeArtifactKey}` : baseKey;
	let entry = getOrCreateSharedClientEntry(state, key);
	const existingClient = entry.client;
	const existingGeneration = existingClient ? getCodexAppServerClientStartMetadata().get(existingClient)?.desktopGeneration : void 0;
	if (existingClient && existingGeneration && !isCodexDesktopGenerationCurrent(existingGeneration)) {
		retireSharedCodexAppServerClientIfCurrent(existingClient);
		entry = getOrCreateSharedClientEntry(state, key);
	}
	entry.startupAbort ??= new AbortController();
	entry.closeWhenIdle = false;
	const releasePendingAcquire = retainPendingSharedClientAcquire(entry);
	const startedCallback = options?.onStartedClient;
	if (startedCallback) {
		entry.onStartedClientCallbacks.add(startedCallback);
		if (entry.client) startedCallback(entry.client);
	}
	const stopStartedClientNotifications = () => {
		if (startedCallback) entry.onStartedClientCallbacks.delete(startedCallback);
	};
	let cleanupAbandonSignal;
	if (options?.abandonSignal) {
		const abandon = () => {
			stopStartedClientNotifications();
			releasePendingAcquire();
			retirePendingSharedClientEntryIfUnclaimed(key, entry);
		};
		options.abandonSignal.addEventListener("abort", abandon, { once: true });
		cleanupAbandonSignal = () => options.abandonSignal?.removeEventListener("abort", abandon);
		if (options.abandonSignal.aborted) abandon();
	}
	const startup = entry.startup ?? (entry.startup = createSharedCodexAppServerClientStartup({
		entry,
		key,
		requestedStartOptions,
		startOptions,
		desktopGeneration,
		...pluginConfig !== void 0 ? { pluginConfig } : {},
		agentDir,
		authProfileId: usesNativeAuth || preparedAuth?.kind === "api-key" ? null : authProfileId,
		authProfileStore,
		preparedAuth,
		authRequirement,
		runtimeArtifactMode,
		...options?.expectedRuntimeArtifact ? { expectedRuntimeArtifact: options.expectedRuntimeArtifact } : {},
		runtimeArtifactSignal: entry.startupAbort.signal,
		abandonSignal: entry.startupAbort.signal,
		config: options?.config
	}));
	try {
		await withCodexAppServerAcquireDeadline(remainingTimeoutMs, startup.initialized, options?.abandonSignal, CODEX_APP_SERVER_INITIALIZE_TIMEOUT_MESSAGE, () => buildCodexAppServerInitializeTimeoutError(entry.client));
		const client = await withCodexAppServerAcquireDeadline(timeoutMs, startup.ready, options?.abandonSignal, "codex app-server authentication timed out");
		if (entry.closeError) throw entry.closeError;
		ensureCodexAppServerClientRuntime(client, {
			agentDir,
			authProfileId: usesNativeAuth ? void 0 : authProfileId,
			...authProfileStore ? { authProfileStore } : {},
			authMode: preparedAuth?.kind === "api-key" ? "prepared-api-key" : "profile",
			config: options?.config
		});
		const release = leaseOptions?.leased ? retainSharedClientEntry(entry) : void 0;
		return release ? {
			client,
			release
		} : { client };
	} catch (error) {
		releasePendingAcquire();
		retirePendingSharedClientEntryIfUnclaimed(key, entry);
		throw error;
	} finally {
		cleanupAbandonSignal?.();
		stopStartedClientNotifications();
		releasePendingAcquire();
	}
}
async function withCodexAppServerAcquireDeadline(timeoutMs, promise, signal, timeoutMessage = CODEX_APP_SERVER_INITIALIZE_TIMEOUT_MESSAGE, timeoutErrorFactory) {
	if (signal?.aborted) throw new CodexAppServerStartupError("aborted", "codex app-server initialize aborted");
	const timed = withTimeout$1(promise, timeoutMs, timeoutMessage, () => timeoutErrorFactory?.() ?? new CodexAppServerStartupError("timed_out", timeoutMessage));
	if (!signal) return await timed;
	return await new Promise((resolve, reject) => {
		const onAbort = () => reject(new CodexAppServerStartupError("aborted", "codex app-server initialize aborted"));
		signal.addEventListener("abort", onAbort, { once: true });
		timed.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
	});
}
function buildCodexAppServerInitializeTimeoutError(client) {
	const stderr = client?.getStderrDiagnostic();
	return new CodexAppServerStartupError("timed_out", stderr ? `${CODEX_APP_SERVER_INITIALIZE_TIMEOUT_MESSAGE}; stderr=${JSON.stringify(stderr)}` : CODEX_APP_SERVER_INITIALIZE_TIMEOUT_MESSAGE);
}
function resolveRemainingAcquireTimeout(timeoutMs, startedAt) {
	if (!(timeoutMs > 0)) return timeoutMs;
	const remaining = timeoutMs - (Date.now() - startedAt);
	if (remaining <= 0) throw new CodexAppServerStartupError("timed_out", "codex app-server initialize timed out");
	return remaining;
}
function createSharedCodexAppServerClientStartup(params) {
	const initialized = createDeferred();
	const ready = startInitializedCodexAppServerClient({
		requestedStartOptions: params.requestedStartOptions,
		startOptions: params.startOptions,
		...params.desktopGeneration ? { desktopGeneration: params.desktopGeneration } : {},
		...params.pluginConfig !== void 0 ? { pluginConfig: params.pluginConfig } : {},
		agentDir: params.agentDir,
		authProfileId: params.authProfileId,
		authProfileStore: params.authProfileStore,
		preparedAuth: params.preparedAuth,
		authRequirement: params.authRequirement,
		runtimeArtifactMode: params.runtimeArtifactMode,
		...params.expectedRuntimeArtifact ? { expectedRuntimeArtifact: params.expectedRuntimeArtifact } : {},
		runtimeArtifactSignal: params.runtimeArtifactSignal,
		abandonSignal: params.abandonSignal,
		config: params.config,
		onStartedClient: (startedClient) => {
			const state = getSharedCodexAppServerClientState();
			params.entry.client = startedClient;
			state.liveClients.add(startedClient);
			startedClient.addTransportExitHandler((exitedClient) => {
				state.liveClients.delete(exitedClient);
				notifyDesktopGenerationDrainChecks(state);
			});
			startedClient.addCloseHandler((closedClient) => {
				if (state.entriesByClient.get(closedClient) === params.entry) clearSharedClientEntryIfCurrent(params.key, closedClient);
			});
			for (const callback of params.entry.onStartedClientCallbacks) callback(startedClient);
			retirePendingSharedClientEntryIfUnclaimed(params.key, params.entry);
		},
		onInitializedClient: () => initialized.resolve()
	}).then((client) => {
		const state = getSharedCodexAppServerClientState();
		params.entry.client = client;
		state.entriesByClient.set(client, params.entry);
		return client;
	}, (error) => {
		initialized.reject(error);
		throw error;
	});
	initialized.promise.catch(() => void 0);
	ready.catch(() => void 0);
	return {
		initialized: initialized.promise,
		ready
	};
}
/** Starts a non-shared Codex app-server client owned entirely by the caller. */
async function createIsolatedCodexAppServerClient(options) {
	if (options?.abandonSignal?.aborted) throw new CodexAppServerStartupError("aborted", "codex app-server initialize aborted");
	const acquireStartedAt = Date.now();
	const timeoutMs = options?.timeoutMs ?? 0;
	const { agentDir, usesNativeAuth, authProfileId, authProfileStore, preparedAuth, authRequirement, requestedStartOptions, startOptions, desktopGeneration, pluginConfig } = await withCodexAppServerAcquireDeadline(timeoutMs, resolveCodexAppServerClientStartContext(options), options?.abandonSignal);
	return await startInitializedCodexAppServerClient({
		requestedStartOptions,
		startOptions,
		...desktopGeneration ? { desktopGeneration } : {},
		...pluginConfig !== void 0 ? { pluginConfig } : {},
		agentDir,
		authProfileId: usesNativeAuth || preparedAuth?.kind === "api-key" ? null : authProfileId,
		authProfileStore,
		preparedAuth,
		authRequirement,
		runtimeArtifactMode: options?.runtimeArtifactMode ?? (options?.expectedRuntimeArtifact ? "capture" : void 0),
		...options?.expectedRuntimeArtifact ? { expectedRuntimeArtifact: options.expectedRuntimeArtifact } : {},
		runtimeArtifactSignal: options?.abandonSignal,
		config: options?.config,
		timeoutMs: resolveRemainingAcquireTimeout(timeoutMs, acquireStartedAt),
		abandonSignal: options?.abandonSignal,
		onStartedClient: (client) => {
			trackIsolatedCodexAppServerClient(client);
			options?.onStartedClient?.(client);
		}
	});
}
function trackIsolatedCodexAppServerClient(client) {
	const state = getSharedCodexAppServerClientState();
	state.isolatedClients.add(client);
	client.addTransportExitHandler((exitedClient) => {
		state.isolatedClients.delete(exitedClient);
		notifyDesktopGenerationDrainChecks(state);
	});
}
async function startInitializedCodexAppServerClient(params) {
	const acquireStartedAt = Date.now();
	const timeoutMs = params.timeoutMs ?? 0;
	const startOptionsCandidates = resolveManagedFallbackStartOptions(params.startOptions);
	for (const [index, startOptions] of startOptionsCandidates.entries()) {
		const desktopGeneration = params.desktopGeneration ?? (isManagedCodexDesktopCommand(startOptions.command) ? await withCodexAppServerAcquireDeadline(resolveRemainingAcquireTimeout(timeoutMs, acquireStartedAt), waitForCodexDesktopGeneration(), params.abandonSignal) : void 0);
		const assertDesktopGenerationCurrent = () => {
			if (params.abandonSignal?.aborted) throw new CodexAppServerStartupError("aborted", "codex app-server initialize aborted");
			if (desktopGeneration && !isCodexDesktopGenerationCurrent(desktopGeneration)) throw new CodexAppServerStartSelectionChangedError();
		};
		const computerUseConfig = resolveCodexComputerUseConfig({ pluginConfig: params.pluginConfig });
		const ownsIsolatedCodexHome = params.requestedStartOptions.homeScope !== "user" && !params.requestedStartOptions.env?.CODEX_HOME?.trim();
		const artifactDrain = desktopGeneration && ownsIsolatedCodexHome && computerUseConfig.enabled && (computerUseConfig.autoInstall || computerUseConfig.pluginCacheMode === "shared") ? createOlderDesktopGenerationDrainWait({
			generation: desktopGeneration,
			startOptions,
			agentDir: params.agentDir
		}) : void 0;
		try {
			if (artifactDrain) await withCodexAppServerAcquireDeadline(resolveRemainingAcquireTimeout(timeoutMs, acquireStartedAt), artifactDrain.promise, params.abandonSignal);
			await reconcileCodexComputerUseStartArtifacts({
				startOptions,
				agentDir: params.agentDir,
				pluginConfig: params.pluginConfig,
				...desktopGeneration ? { desktopGeneration } : {},
				assertCurrent: assertDesktopGenerationCurrent,
				ownsIsolatedCodexHome
			});
		} catch (error) {
			if (isCodexComputerUseCandidateArtifactsUnavailableError(error)) {
				if (index + 1 < startOptionsCandidates.length) continue;
				throw new AgentHarnessPreflightError("Codex Computer Use artifacts are unavailable from the installed desktop apps.", {
					cause: error,
					scope: "harness"
				});
			}
			throw error;
		} finally {
			artifactDrain?.cancel();
		}
		const runtimeArtifactModule = params.runtimeArtifactMode ? await import("./runtime-artifact-C3jVimFn.js") : void 0;
		const runtimeArtifactBeforeStart = runtimeArtifactModule ? await runtimeArtifactModule.captureCodexAppServerRuntimeArtifactBeforeStart({
			startOptions,
			spawnIdentity: resolveCodexAppServerSpawnIdentity(startOptions),
			signal: params.runtimeArtifactSignal
		}) : void 0;
		if (runtimeArtifactModule && runtimeArtifactBeforeStart && params.expectedRuntimeArtifact && !runtimeArtifactModule.validateCodexAppServerRuntimeArtifactCapture(params.expectedRuntimeArtifact, runtimeArtifactBeforeStart)) {
			if (index + 1 < startOptionsCandidates.length) continue;
			throw new Error("Codex app-server runtime artifact does not match verified inference");
		}
		assertDesktopGenerationCurrent();
		let starting;
		let client;
		try {
			client = await withCodexAppServerAcquireDeadline(resolveRemainingAcquireTimeout(timeoutMs, acquireStartedAt), starting = CodexAppServerClient.start(startOptions, () => {
				assertDesktopGenerationCurrent();
				resolveRemainingAcquireTimeout(timeoutMs, acquireStartedAt);
			}), params.abandonSignal);
		} catch (error) {
			starting?.then((lateClient) => lateClient.close(), () => {});
			throw error;
		}
		const nativeCommandAtStart = startOptions.commandSource === "resolved-managed" ? resolveManagedCodexNativeCommand(startOptions.command) : void 0;
		getCodexAppServerClientStartMetadata().set(client, {
			requestedStartOptions: params.requestedStartOptions,
			startOptions,
			agentDir: params.agentDir,
			...nativeCommandAtStart ? { nativeCommand: nativeCommandAtStart } : {},
			...desktopGeneration ? { desktopGeneration } : {}
		});
		params.onStartedClient?.(client);
		let initialize;
		try {
			await withCodexAppServerAcquireDeadline(resolveRemainingAcquireTimeout(timeoutMs, acquireStartedAt), initialize = client.initialize(), params.abandonSignal, CODEX_APP_SERVER_INITIALIZE_TIMEOUT_MESSAGE, () => buildCodexAppServerInitializeTimeoutError(client));
		} catch (error) {
			client.close();
			initialize?.catch(() => void 0);
			if (shouldTryManagedFallbackStartOption(error, startOptions, index, startOptionsCandidates)) continue;
			throw error;
		}
		try {
			assertDesktopGenerationCurrent();
		} catch (error) {
			client.close();
			throw error;
		}
		params.onInitializedClient?.();
		let runtimeArtifact;
		try {
			if (runtimeArtifactModule && runtimeArtifactBeforeStart) {
				runtimeArtifact = await runtimeArtifactModule.finalizeCodexAppServerRuntimeArtifact({
					before: runtimeArtifactBeforeStart,
					startOptions,
					spawnIdentity: resolveCodexAppServerSpawnIdentity(startOptions),
					runtimeIdentity: client.getRuntimeIdentity(),
					signal: params.runtimeArtifactSignal
				});
				if (params.expectedRuntimeArtifact && (runtimeArtifact.id !== params.expectedRuntimeArtifact.id || runtimeArtifact.fingerprint !== params.expectedRuntimeArtifact.fingerprint)) throw new Error("Codex app-server runtime artifact does not match verified inference");
			}
		} catch (error) {
			client.close();
			throw error;
		}
		ensureCodexAppServerClientRuntime(client, {
			agentDir: params.agentDir,
			authProfileId: params.authProfileId ?? void 0,
			authMode: params.preparedAuth?.kind === "api-key" ? "prepared-api-key" : "profile",
			...params.authProfileStore ? { authProfileStore: params.authProfileStore } : {},
			config: params.config,
			onAuthRefreshFailure: () => retireSharedCodexAppServerClientIfCurrent(client)
		});
		try {
			assertDesktopGenerationCurrent();
			await withCodexAppServerAcquireDeadline(resolveRemainingAcquireTimeout(timeoutMs, acquireStartedAt), applyCodexAppServerAuthProfile({
				client,
				agentDir: params.agentDir,
				authProfileId: params.authProfileId,
				preparedAuth: params.preparedAuth,
				authRequirement: params.authRequirement,
				startOptions,
				config: params.config,
				...params.authProfileStore ? { authProfileStore: params.authProfileStore } : {}
			}), params.abandonSignal);
			if (runtimeArtifactModule && runtimeArtifact) runtimeArtifactModule.bindCodexAppServerRuntimeArtifact(client, runtimeArtifact);
			assertDesktopGenerationCurrent();
			const fenceKey = resolveCodexNativeConfigFenceKey({ client });
			if (fenceKey) client.setThreadSessionRequestGuard(async (options) => {
				const release = await acquireCodexNativeConfigFence(fenceKey, options);
				try {
					assertCodexAppServerClientStartSelectionCurrent({ client });
					return release;
				} catch (error) {
					release();
					throw error;
				}
			});
			return client;
		} catch (error) {
			client.close();
			throw error;
		}
	}
	throw new Error("Managed Codex app-server fallback candidates were exhausted.");
}
function isCodexComputerUseCandidateArtifactsUnavailableError(error) {
	return error !== null && typeof error === "object" && "code" in error && error.code === "CODEX_COMPUTER_USE_CANDIDATE_ARTIFACTS_UNAVAILABLE";
}
function resolveManagedFallbackStartOptions(startOptions) {
	const commands = [startOptions.command, ...startOptions.managedFallbackCommandPaths ?? []];
	const candidates = [];
	for (const [index, command] of commands.entries()) {
		const managedFallbackCommandPaths = commands.slice(index + 1);
		const candidate = {
			...startOptions,
			command
		};
		if (managedFallbackCommandPaths.length === 0) delete candidate.managedFallbackCommandPaths;
		else candidate.managedFallbackCommandPaths = managedFallbackCommandPaths;
		candidates.push(candidate);
	}
	return candidates;
}
function shouldTryManagedFallbackStartOption(error, startOptions, index, startOptionsCandidates) {
	return startOptions.commandSource === "resolved-managed" && index < startOptionsCandidates.length - 1 && isUnsupportedCodexAppServerVersionError(error);
}
/** Clears and closes the shared entry only if it still owns the supplied client. */
function clearSharedCodexAppServerClientIfCurrent(client) {
	if (!client) return false;
	const state = getSharedCodexAppServerClientState();
	for (const [key, entry] of state.clients) if (entry.client === client) {
		state.clients.delete(key);
		client.close();
		return true;
	}
	return false;
}
/** Captures a revocable observation of the exact shared client and native account/config. */
function captureSharedCodexAppServerCatalogLifetime(client) {
	const isCurrent = captureSharedClientRegistration(client);
	const revision = client.getModelCatalogRevision();
	return () => isCurrent() && client.getModelCatalogRevision() === revision;
}
/** Registration ends on retirement even when sibling leases keep the process alive. */
function captureSharedClientRegistration(client) {
	const state = getSharedCodexAppServerClientState();
	const entry = state.entriesByClient.get(client);
	const key = [...state.clients].find(([, candidate]) => candidate === entry)?.[0];
	const generation = readCodexAppServerClientDesktopGeneration(client);
	return () => key !== void 0 && state.clients.get(key) === entry && entry?.client === client && !entry.closeWhenIdle && !entry.closeError && !client.getCloseError() && (!generation || isCodexDesktopGenerationCurrent(generation));
}
/** Retains the matching shared client and returns a release callback. */
function retainSharedCodexAppServerClientIfCurrent(client) {
	if (!client) return;
	const state = getSharedCodexAppServerClientState();
	for (const entry of state.clients.values()) if (entry.client === client) return retainSharedClientEntry(entry);
}
/** Retains the live shared client whose initialized instance id matches a thread binding. */
function retainSharedCodexAppServerClientByInstanceId(clientId) {
	const normalizedClientId = clientId?.trim();
	if (!normalizedClientId) return;
	for (const entry of getSharedCodexAppServerClientState().clients.values()) {
		const client = entry.client;
		if (client?.getInstanceId() !== normalizedClientId || entry.closeWhenIdle || entry.closeError) continue;
		return {
			client,
			release: retainSharedClientEntry(entry)
		};
	}
}
/** Captures physical ownership, independently of unrelated thread and reader leases. */
function captureCodexAppServerClientLifetime(client, requiredOwnership) {
	const state = getSharedCodexAppServerClientState();
	const start = getCodexAppServerClientStartMetadata().get(client)?.startOptions;
	if (requiredOwnership === "native-process" && (start?.transport !== "stdio" || isCodexAppServerProxyLaunch(start.args))) throw new AgentHarnessPreflightError("Codex ordinary configuration refresh requires an OpenClaw-managed local stdio process, not an external socket or app-server proxy. No turn was sent; reconnect through managed local stdio before continuing.");
	const isCurrent = requiredOwnership === "native-process" && state.isolatedClients.has(client) ? () => state.isolatedClients.has(client) && !client.getCloseError() : captureSharedClientRegistration(client);
	const assertCurrent = () => {
		if (!isCurrent()) throw new CodexAdoptedThreadActiveError("Codex app-server connection changed during thread preparation; reconnect before continuing");
		assertCodexAppServerClientStartSelectionCurrent({ client });
	};
	assertCurrent();
	return assertCurrent;
}
/**
* Retires a matching shared client. Default is graceful: detach from the map
* (future acquisitions get a fresh client) and close once leases drain.
* `failActiveLeases` is for suspect clients only (timed-out turns): it closes
* the physical connection immediately so co-leased attempts hit the normal
* client-closed retry path, and pending acquires reject instead of leasing
* the poisoned process. Routine cleanup must NOT use it — it would abort
* healthy sibling turns on a working client.
*/
function retireSharedCodexAppServerClientIfCurrent(client, opts) {
	if (!client) return;
	const state = getSharedCodexAppServerClientState();
	for (const [key, entry] of state.clients) if (entry.client === client) {
		state.clients.delete(key);
		entry.closeWhenIdle = true;
		if (opts?.failActiveLeases) {
			entry.closeError = /* @__PURE__ */ new Error("codex app-server client is closed");
			return {
				activeLeases: entry.activeLeases,
				closed: closeRetiredSharedClientEntry(entry)
			};
		}
		const closed = closeRetiredSharedClientEntryIfIdle(entry);
		return {
			activeLeases: entry.activeLeases,
			closed
		};
	}
	const detachedEntry = state.entriesByClient.get(client);
	if (detachedEntry && (detachedEntry.client === client || detachedEntry.closeError)) {
		if (opts?.failActiveLeases && !detachedEntry.closeError) {
			detachedEntry.closeError = /* @__PURE__ */ new Error("codex app-server client is closed");
			return {
				activeLeases: detachedEntry.activeLeases,
				closed: closeRetiredSharedClientEntry(detachedEntry)
			};
		}
		return {
			activeLeases: detachedEntry.activeLeases,
			closed: false
		};
	}
}
/** Gracefully retires exact clients attached to an older desktop generation. */
function retireSharedCodexAppServerClientsBeforeDesktopGeneration(generation) {
	const state = getSharedCodexAppServerClientState();
	for (const entry of state.clients.values()) {
		const client = entry.client;
		const attached = client ? getCodexAppServerClientStartMetadata().get(client) : void 0;
		if (client && attached?.desktopGeneration && attached.desktopGeneration.epoch < generation.epoch) retireSharedCodexAppServerClientIfCurrent(client);
	}
}
function createOlderDesktopGenerationDrainWait(params) {
	const targetHome = resolveCodexNativeConfigFenceKey({
		startOptions: params.startOptions,
		agentDir: params.agentDir
	});
	if (!targetHome) return {
		promise: Promise.resolve(),
		cancel: () => void 0
	};
	const state = getSharedCodexAppServerClientState();
	let settled = false;
	let resolveWait;
	const promise = new Promise((resolve) => {
		resolveWait = resolve;
	});
	const cancel = () => {
		if (settled) return;
		settled = true;
		state.desktopGenerationDrainChecks.delete(check);
		resolveWait();
	};
	const check = () => {
		if (!hasLiveOlderDesktopGenerationClient({
			state,
			generation: params.generation,
			targetHome
		})) cancel();
	};
	state.desktopGenerationDrainChecks.add(check);
	check();
	return {
		promise,
		cancel
	};
}
function hasLiveOlderDesktopGenerationClient(params) {
	for (const client of params.state.liveClients) if (isOlderDesktopGenerationClientForHome(client, params.generation, params.targetHome)) return true;
	for (const client of params.state.isolatedClients) if (isOlderDesktopGenerationClientForHome(client, params.generation, params.targetHome)) return true;
	return false;
}
function isOlderDesktopGenerationClientForHome(client, generation, targetHome) {
	const metadata = getCodexAppServerClientStartMetadata().get(client);
	return Boolean(metadata?.desktopGeneration && metadata.desktopGeneration.epoch < generation.epoch && resolveCodexNativeConfigFenceKey({ client }) === targetHome);
}
function notifyDesktopGenerationDrainChecks(state) {
	for (const check of state.desktopGenerationDrainChecks) check();
}
/** Clears a matching shared client and waits for its process to exit. */
async function clearSharedCodexAppServerClientIfCurrentAndWait(client, options) {
	if (!client) return false;
	const state = getSharedCodexAppServerClientState();
	for (const [key, entry] of state.clients) if (entry.client === client) {
		state.clients.delete(key);
		await client.closeAndWait(options);
		return true;
	}
	return false;
}
/** Clears all shared clients and waits for their processes to exit. */
async function clearSharedCodexAppServerClientAndWait(options) {
	const state = getSharedCodexAppServerClientState();
	const clients = collectSharedClients(state);
	state.clients.clear();
	await Promise.all(clients.map((client) => client.closeAndWait(options)));
}
globalThis[SHARED_CODEX_APP_SERVER_CLIENT_DISPOSER] = clearSharedCodexAppServerClientAndWait;
function getOrCreateSharedClientEntry(state, key) {
	let entry = state.clients.get(key);
	if (!entry) {
		entry = {
			activeLeases: 0,
			pendingAcquires: 0,
			closeWhenIdle: false,
			onStartedClientCallbacks: /* @__PURE__ */ new Set()
		};
		state.clients.set(key, entry);
	}
	return entry;
}
function clearSharedClientEntryIfCurrent(key, client) {
	const state = getSharedCodexAppServerClientState();
	if (state.clients.get(key)?.client === client) state.clients.delete(key);
}
/** Clears a matching shared client only when no lease or acquire currently claims it. */
function clearSharedCodexAppServerClientIfCurrentAndUnclaimed(client) {
	if (!client) return {
		found: false,
		closed: false,
		activeLeases: 0,
		pendingAcquires: 0
	};
	const state = getSharedCodexAppServerClientState();
	for (const [key, entry] of state.clients) if (entry.client === client) return {
		found: true,
		closed: closeSharedClientEntryIfUnclaimed(key, entry),
		activeLeases: entry.activeLeases,
		pendingAcquires: entry.pendingAcquires
	};
	return {
		found: false,
		closed: false,
		activeLeases: 0,
		pendingAcquires: 0
	};
}
function retainPendingSharedClientAcquire(entry) {
	let released = false;
	entry.pendingAcquires += 1;
	return () => {
		if (released) return;
		released = true;
		entry.pendingAcquires = Math.max(0, entry.pendingAcquires - 1);
		closeRetiredSharedClientEntryIfIdle(entry);
		notifyDesktopGenerationDrainChecks(getSharedCodexAppServerClientState());
	};
}
function retainSharedClientEntry(entry) {
	let released = false;
	entry.activeLeases += 1;
	return () => {
		if (released) return;
		released = true;
		entry.activeLeases = Math.max(0, entry.activeLeases - 1);
		closeRetiredSharedClientEntryIfIdle(entry);
		notifyDesktopGenerationDrainChecks(getSharedCodexAppServerClientState());
	};
}
function closeRetiredSharedClientEntryIfIdle(entry) {
	if (!entry.closeWhenIdle || entry.activeLeases > 0 || entry.pendingAcquires > 0 || !entry.client) return false;
	const client = entry.client;
	entry.closeWhenIdle = false;
	entry.client = void 0;
	client.close();
	return true;
}
function closeRetiredSharedClientEntry(entry) {
	const client = entry.client;
	if (!client) return false;
	entry.client = void 0;
	client.close();
	return true;
}
function closeSharedClientEntryIfUnclaimed(key, entry) {
	if (entry.activeLeases > 0 || entry.pendingAcquires > 0) return false;
	const state = getSharedCodexAppServerClientState();
	if (state.clients.get(key) !== entry) return false;
	state.clients.delete(key);
	entry.client?.close();
	return Boolean(entry.client);
}
function retirePendingSharedClientEntryIfUnclaimed(key, entry) {
	if (entry.activeLeases > 0 || entry.pendingAcquires > 0) return;
	entry.startupAbort?.abort(/* @__PURE__ */ new Error("Codex app-server startup was abandoned"));
	entry.closeWhenIdle = true;
	const state = getSharedCodexAppServerClientState();
	if (state.clients.get(key) === entry) state.clients.delete(key);
	if (!entry.client) return;
	closeRetiredSharedClientEntry(entry);
}
function collectSharedClients(state) {
	return [...state.liveClients];
}
//#endregion
export { assertCodexThreadResumeResponse as $, isJsonObject as $t, TURN_FINALIZE_DRAIN_ABORT_GRACE_MS as A, retainCodexAppServerLiveThread as At, isCodexAppServerIndeterminateRequestCancellationError as B, resolveCodexAppServerAuthProfileIdForAgent as Bt, withLeasedCodexAppServerClientStartSelectionRetry as C, ensureCodexAppServerClientRuntime as Ct, acquireCodexNativeConfigFence as D, protectCodexAppServerLiveThread as Dt, CodexThreadStartRequestError as E, isCodexAppServerLiveThreadClaimed as Et, withCodexStartupTimeout as F, readRecentCodexRateLimits as Ft, isUnsupportedCodexAppServerVersionError as G, resolveCodexManagedBundledMarketplacePath as Gt, isCodexAppServerOverloadError as H, resolveCodexAppServerFallbackApiKeyCacheKey as Ht, getCodexAppServerClientInstanceId as I, rememberCodexRateLimitsRead as It, CodexThreadDirectInputError as J, readCodexSessionMeta as Jt, resolveCodexAppServerClientInstanceId as K, assertNotSymlink as Kt, isCodexAppServerApprovalRequest as L, reconcileCodexComputerUseStartArtifacts as Lt, isCodexAppServerStartupError as M, withAbortableTimeout as Mt, resolveCodexGatewayTimeoutWithGraceMs as N, withTimeout$1 as Nt, createCodexDesktopGenerationService as O, readCodexClientSessionMeta as Ot, resolveCodexStartupTimeoutMs as P, readCodexRateLimitsRevision as Pt, assertCodexThreadForkResponse as Q, flattenCodexDynamicToolFunctions as Qt, isCodexAppServerBrokenPipeError as R, resolveCodexAppServerAuthAccountCacheKey as Rt, waitForCodexAppServerClientDesktopGenerationDrain as S, consumeCodexAppServerLiveThread as St, CodexThreadBindingConflictError as T, isCodexAppServerClientRuntimeLive as Tt, isCodexAppServerPrewriteRequestCancellationError as U, resolveCodexAppServerPreparedApiKeyCacheKey as Ut, isCodexAppServerIndeterminateTransportError as V, resolveCodexAppServerAuthProfileStore as Vt, isCodexAppServerRequestTimeoutError as W, resolveCodexAppServerPreparedAuthHandoff as Wt, assertCodexThreadAcceptsDirectInput as X, CODEX_INTERACTIVE_THREAD_SOURCE_KINDS as Xt, assertCodexModelListResponse as Y, CODEX_INTERACTIVE_CUSTOM_THREAD_SOURCES as Yt, assertCodexThreadForkParams as Z, CODEX_OPENCLAW_DIRECT_DYNAMIC_TOOL_NAMESPACE as Zt, retainSharedCodexAppServerClientByInstanceId as _, resolveCodexToolAbortTerminalReason as _t, clearSharedCodexAppServerClientIfCurrentAndUnclaimed as a, readCodexTurnCompletedNotification as at, retireSharedCodexAppServerClientsBeforeDesktopGeneration as b, withDynamicToolTranscriptDetails as bt, getLeasedSharedCodexAppServerClient as c, hasPendingDynamicToolTerminalDiagnostic as ct, readCodexAppServerClientDesktopGeneration as d, resolveDynamicToolCallTimeoutMs as dt, assertCodexThreadStartResponse as et, readCodexAppServerClientDesktopGenerationFingerprint as f, resolveTerminalDynamicToolBatchAction as ft, resolveCodexNativeConfigFenceKey as g, toCodexDynamicToolProtocolResponse as gt, releaseLeasedSharedCodexAppServerClient as h, toCodexDynamicToolProgressResponse as ht, clearSharedCodexAppServerClientIfCurrent as i, readCodexTurn as it, TURN_TERMINAL_SETTLEMENT_TIMEOUT_MS as j, unsubscribeCodexAppServerLiveThread as jt, CodexAppServerStartupError as k, releaseCodexAppServerLiveThread as kt, getSharedCodexAppServerClient as l, isDynamicToolTerminalDiagnosticEvent as lt, releaseCodexAppServerClientLease as m, shouldReleaseTurnAfterTerminalDynamicTool as mt, captureCodexAppServerClientLifetime as n, readCodexDynamicToolCallParams as nt, clearSharedCodexAppServerClientIfCurrentAndWait as o, createCodexElicitationResponse as ot, readCodexAppServerClientProcessIdentity as p, shouldBlockTerminalReleaseForNonTerminalDynamicToolResult as pt, CodexAppServerRpcError as q, isOpenClawManagedCodexThread as qt, captureSharedCodexAppServerCatalogLifetime as r, readCodexErrorNotification as rt, createIsolatedCodexAppServerClient as s, handleDynamicToolCallWithTimeout as st, assertCodexAppServerClientStartSelectionCurrent as t, assertCodexTurnStartResponse as tt, isCodexAppServerStartSelectionChangedError as u, isMatchingDynamicToolTerminalDiagnostic as ut, retainSharedCodexAppServerClientIfCurrent as v, createFailedDynamicToolResponse as vt, CodexAdoptedThreadActiveError as w, hasCodexAppServerLiveThread as wt, shared_client_exports as x, claimCodexAppServerLiveThread as xt, retireSharedCodexAppServerClientIfCurrent as y, withDynamicToolExecutionState as yt, isCodexAppServerConnectionClosedError as z, resolveCodexAppServerAuthProfileId as zt };
