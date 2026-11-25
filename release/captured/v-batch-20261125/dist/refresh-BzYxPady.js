import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { c as resolveUserPath } from "./home-dir-BPhrG-aM.js";
import { r as isPathInside } from "./path-guards-Cp-mGr3-.js";
import { t as CONFIG_DIR } from "./utils-D3A1hGii.js";
import { o as isDefaultStateDir } from "./paths-Dx1CjxA5.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { n as resolveAllowedSkillSymlinkTargetRealPaths, r as tryRealpath } from "./symlink-targets-HB25TMHt.js";
import { a as resetSkillsRefreshStateForTest, n as clearSkillsSnapshotVersionForWorkspace, o as setSkillsChangeListenerErrorHandler, t as bumpSkillsSnapshotVersion } from "./refresh-state-DHnXO3IV.js";
import { n as resolvePluginSkillRootsFromMetadata, t as resolvePluginSkillRoots } from "./plugin-skills-Cq7Uj02-.js";
import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import os from "node:os";
import chokidar from "chokidar";
//#region src/skills/runtime/refresh-watch-path.ts
function toWatchRoot(raw) {
	const normalized = raw.replaceAll("\\", "/");
	const root = path.parse(normalized).root;
	const trimmed = normalized.replace(/\/+$/, "");
	return trimmed.length < root.length ? root : trimmed;
}
function resolveSkillsWatchPath(raw) {
	if (process.platform !== "win32") return raw;
	const absolute = path.resolve(raw);
	const root = path.parse(absolute).root;
	const parts = absolute.slice(root.length).split(path.sep);
	let cursor = root;
	let index = 0;
	for (const part of parts) {
		const next = path.join(cursor, part);
		try {
			if (fs.lstatSync(next).isSymbolicLink()) break;
		} catch {
			break;
		}
		cursor = next;
		index += 1;
	}
	try {
		return path.join(fs.realpathSync.native(cursor), ...parts.slice(index));
	} catch {
		return raw;
	}
}
//#endregion
//#region src/skills/runtime/refresh.ts
const log = createSubsystemLogger("gateway/skills");
const runInSkillsWatcherContext = AsyncLocalStorage.snapshot();
const GROUPED_SKILLS_WATCH_DEPTH = 6;
const CONFIGURED_ROOT_WATCH_DEPTH = 2;
const MAX_SYMLINK_WATCH_TARGETS_PER_ROOT = 100;
const MAX_SYMLINK_WATCH_DIRECTORY_SCANS_PER_ROOT = 200;
const MAX_SYMLINK_WATCH_RAW_ENTRIES_PER_ROOT = 2e3;
const RAW_SKILL_FILE_POLL_INTERVAL_MS = 100;
const SKILLS_WATCH_DEBOUNCE_MS = 250;
const pathWatchers = /* @__PURE__ */ new Map();
const workspaceWatchTargets = /* @__PURE__ */ new Map();
const workspaceWatchOwnerDirs = /* @__PURE__ */ new Map();
const workspaceWatchTargetCache = /* @__PURE__ */ new Map();
const workspaceWatchLastEnsuredAt = /* @__PURE__ */ new Map();
const SKILLS_WORKSPACE_WATCH_IDLE_TTL_MS = 36e5;
setSkillsChangeListenerErrorHandler((err) => {
	log.warn(`skills change listener failed: ${String(err)}`);
});
const DEFAULT_SKILLS_WATCH_IGNORED = [
	/(^|[\\/])\.git([\\/]|$)/,
	/(^|[\\/])node_modules([\\/]|$)/,
	/(^|[\\/])dist([\\/]|$)/,
	/(^|[\\/])\.venv([\\/]|$)/,
	/(^|[\\/])venv([\\/]|$)/,
	/(^|[\\/])__pycache__([\\/]|$)/,
	/(^|[\\/])\.mypy_cache([\\/]|$)/,
	/(^|[\\/])\.pytest_cache([\\/]|$)/,
	/(^|[\\/])build([\\/]|$)/,
	/(^|[\\/])\.cache([\\/]|$)/
];
function resolveWatchTargets(workspaceDir, config, executionSkillsDir, watcherKey, pluginMetadataSnapshot) {
	const baseRoots = [];
	if (workspaceDir.trim()) {
		baseRoots.push({
			path: path.join(workspaceDir, "skills"),
			source: "openclaw-workspace"
		});
		baseRoots.push({
			path: path.join(workspaceDir, ".agents", "skills"),
			source: "agents-skills-project"
		});
	}
	if (executionSkillsDir) baseRoots.push({
		path: executionSkillsDir,
		source: "openclaw-workspace"
	});
	baseRoots.push({
		path: path.join(CONFIG_DIR, "skills"),
		source: "openclaw-managed"
	});
	if (isDefaultStateDir()) baseRoots.push({
		path: path.join(os.homedir(), ".agents", "skills"),
		source: "agents-skills-personal"
	});
	const extraDirs = (config?.skills?.load?.extraDirs ?? []).map((d) => normalizeOptionalString(d) ?? "").filter(Boolean).map((dir) => resolveUserPath(dir));
	const pluginSkillDirs = (pluginMetadataSnapshot ? resolvePluginSkillRootsFromMetadata({
		workspaceDir,
		config,
		metadataSnapshot: pluginMetadataSnapshot
	}) : resolvePluginSkillRoots({
		workspaceDir,
		config
	})).map((root) => root.dir);
	const allowedSymlinkTargetRealPaths = resolveAllowedSkillSymlinkTargetRealPaths(config);
	const signature = JSON.stringify({
		basePaths: baseRoots.map((root) => toWatchRoot(root.path)),
		extraDirs: extraDirs.map(toWatchRoot),
		pluginSkillDirs: pluginSkillDirs.map(toWatchRoot),
		allowSymlinkTargets: allowedSymlinkTargetRealPaths
	});
	const cached = workspaceWatchTargetCache.get(watcherKey);
	if (cached?.signature === signature) return cached.targets;
	const targets = /* @__PURE__ */ new Map();
	for (const root of baseRoots) {
		addSkillRootWatchTargets(targets, root.path, GROUPED_SKILLS_WATCH_DEPTH);
		addTrustedSymlinkSkillWatchTargets(targets, root.path, root.source, allowedSymlinkTargetRealPaths, GROUPED_SKILLS_WATCH_DEPTH, root.path);
		addTrustedSymlinkSkillWatchTargets(targets, path.join(root.path, "skills"), root.source, allowedSymlinkTargetRealPaths, GROUPED_SKILLS_WATCH_DEPTH, root.path);
	}
	for (const resolved of extraDirs) {
		const rootDepth = path.basename(resolved) === "skills" ? GROUPED_SKILLS_WATCH_DEPTH : CONFIGURED_ROOT_WATCH_DEPTH;
		addSkillRootWatchTargets(targets, resolved, rootDepth);
		addTrustedSymlinkSkillWatchTargets(targets, resolved, "openclaw-extra", allowedSymlinkTargetRealPaths, rootDepth, resolved);
		addTrustedSymlinkSkillWatchTargets(targets, path.join(resolved, "skills"), "openclaw-extra", allowedSymlinkTargetRealPaths, GROUPED_SKILLS_WATCH_DEPTH, resolved);
	}
	for (const dir of pluginSkillDirs) {
		const rootDepth = path.basename(dir) === "skills" ? GROUPED_SKILLS_WATCH_DEPTH : CONFIGURED_ROOT_WATCH_DEPTH;
		addSkillRootWatchTargets(targets, dir, rootDepth);
		addTrustedSymlinkSkillWatchTargets(targets, dir, "openclaw-plugin", allowedSymlinkTargetRealPaths, rootDepth, dir);
		addTrustedSymlinkSkillWatchTargets(targets, path.join(dir, "skills"), "openclaw-plugin", allowedSymlinkTargetRealPaths, GROUPED_SKILLS_WATCH_DEPTH, dir);
	}
	const sortedTargets = Array.from(targets.values()).toSorted((a, b) => a.path.localeCompare(b.path));
	workspaceWatchTargetCache.set(watcherKey, {
		signature,
		targets: sortedTargets
	});
	return sortedTargets;
}
function makeWatchTarget(raw, depth) {
	const watchPath = toWatchRoot(resolveSkillsWatchPath(raw));
	let watchRoot = watchPath;
	while (!fs.existsSync(watchRoot)) {
		const parent = path.dirname(watchRoot);
		if (parent === watchRoot) break;
		watchRoot = parent;
	}
	return {
		path: watchPath,
		watchRoot: toWatchRoot(watchRoot),
		depth
	};
}
function addWatchTarget(targets, raw, depth) {
	const target = makeWatchTarget(raw, depth);
	target.depth = Math.max(target.depth, targets.get(target.path)?.depth ?? 0);
	targets.set(target.path, target);
}
function addSkillRootWatchTargets(targets, root, rootDepth) {
	addWatchTarget(targets, root, rootDepth);
	addWatchTarget(targets, path.join(root, "skills"), GROUPED_SKILLS_WATCH_DEPTH);
}
function addTrustedSymlinkSkillWatchTargets(targets, root, source, allowedSymlinkTargetRealPaths, maxDepth, containmentRoot) {
	const containmentRootRealPath = tryRealpath(containmentRoot) ?? path.resolve(containmentRoot);
	const rootRealPath = tryRealpath(root) ?? path.resolve(root);
	try {
		if (fs.lstatSync(root).isSymbolicLink() && isTrustedSymlinkSkillTarget(source, containmentRootRealPath, rootRealPath, allowedSymlinkTargetRealPaths)) addSkillRootWatchTargets(targets, rootRealPath, maxDepth);
	} catch {
		return;
	}
	const queue = [{
		dir: root,
		depth: 0
	}];
	let watched = 0;
	let directoryScans = 0;
	let rawEntries = 0;
	for (const queued of queue) {
		if (watched >= MAX_SYMLINK_WATCH_TARGETS_PER_ROOT || directoryScans >= MAX_SYMLINK_WATCH_DIRECTORY_SCANS_PER_ROOT || rawEntries >= MAX_SYMLINK_WATCH_RAW_ENTRIES_PER_ROOT) break;
		const current = queued;
		if (!current) continue;
		const scan = readBudgetedDirEntries(current.dir, MAX_SYMLINK_WATCH_RAW_ENTRIES_PER_ROOT - rawEntries);
		directoryScans += 1;
		rawEntries += scan.scannedEntryCount;
		if (!scan.ok) continue;
		for (const entry of scan.entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
			if (watched >= MAX_SYMLINK_WATCH_TARGETS_PER_ROOT) break;
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			const childPath = path.join(current.dir, entry.name);
			if (DEFAULT_SKILLS_WATCH_IGNORED.some((re) => re.test(childPath))) continue;
			if (entry.isSymbolicLink()) {
				const targetRealPath = tryRealpath(childPath);
				if (targetRealPath && isTrustedSymlinkSkillTarget(source, containmentRootRealPath, targetRealPath, allowedSymlinkTargetRealPaths)) {
					addSkillRootWatchTargets(targets, targetRealPath, GROUPED_SKILLS_WATCH_DEPTH);
					watched += 1;
				}
				continue;
			}
			if (entry.isDirectory() && current.depth < maxDepth) queue.push({
				dir: childPath,
				depth: current.depth + 1
			});
		}
	}
}
function readBudgetedDirEntries(dir, maxEntries) {
	const entries = [];
	const limit = Math.max(0, maxEntries);
	let handle;
	try {
		handle = fs.opendirSync(dir);
		for (let scanned = 0; scanned < limit; scanned += 1) {
			const entry = handle.readSync();
			if (!entry) return {
				ok: true,
				entries,
				scannedEntryCount: scanned
			};
			entries.push(entry);
		}
		return {
			ok: true,
			entries,
			scannedEntryCount: limit
		};
	} catch {
		return {
			ok: false,
			scannedEntryCount: 0
		};
	} finally {
		handle?.closeSync();
	}
}
function isTrustedSymlinkSkillTarget(source, rootRealPath, targetRealPath, allowedSymlinkTargetRealPaths) {
	if (source === "openclaw-managed" || source === "agents-skills-personal") return true;
	return isPathInside(rootRealPath, targetRealPath) || allowedSymlinkTargetRealPaths.some((root) => isPathInside(root, targetRealPath));
}
function shouldIgnoreSkillsWatchPath(watchPath, stats, options = {}) {
	if (DEFAULT_SKILLS_WATCH_IGNORED.some((re) => re.test(watchPath))) return true;
	if (stats?.isDirectory?.() || stats?.isSymbolicLink?.()) return false;
	if (!stats) return false;
	if (options.usePolling && isSkillFileWatchPath(watchPath)) return false;
	return true;
}
function isSkillFileWatchPath(watchPath) {
	if (DEFAULT_SKILLS_WATCH_IGNORED.some((re) => re.test(watchPath))) return false;
	const normalized = watchPath.replaceAll("\\", "/");
	return path.posix.basename(normalized) === "SKILL.md";
}
function getRawWatchedPath(details) {
	return typeof details === "object" && details !== null && typeof details.watchedPath === "string" ? details.watchedPath : void 0;
}
function rawPathToString(rawPath) {
	if (typeof rawPath === "string") return rawPath || void 0;
	if (Buffer.isBuffer(rawPath)) return rawPath.toString() || void 0;
}
function resolveRawSkillsWatchPath(rawPath, details) {
	if (path.isAbsolute(rawPath)) return rawPath;
	const watchedPath = getRawWatchedPath(details);
	return watchedPath ? path.join(watchedPath, rawPath) : void 0;
}
function readFileStabilitySnapshot(filePath) {
	try {
		const stat = fs.statSync(filePath);
		return stat.isFile() ? {
			size: stat.size,
			mtimeMs: stat.mtimeMs
		} : void 0;
	} catch {
		return;
	}
}
async function waitForStableSkillFile(filePath, stabilityMs) {
	if (stabilityMs <= 0) return;
	let previous = readFileStabilitySnapshot(filePath);
	if (!previous) return;
	let stableForMs = 0;
	while (stableForMs < stabilityMs) {
		const delayMs = Math.min(RAW_SKILL_FILE_POLL_INTERVAL_MS, stabilityMs - stableForMs);
		await new Promise((resolve) => {
			setTimeout(resolve, delayMs);
		});
		const next = readFileStabilitySnapshot(filePath);
		if (!next) return;
		if (next.size === previous.size && next.mtimeMs === previous.mtimeMs) {
			stableForMs += delayMs;
			continue;
		}
		previous = next;
		stableForMs = 0;
	}
}
function resolveSkillsWatcherUsePolling() {
	const envPolling = process.env.CHOKIDAR_USEPOLLING;
	if (envPolling === void 0) return process.platform === "os400";
	const normalized = envPolling.toLowerCase();
	if (normalized === "false" || normalized === "0") return false;
	if (normalized === "true" || normalized === "1") return true;
	return Boolean(normalized);
}
function sameWatchTargets(a, b) {
	return a.length === b.length && a.every((target, index) => target.path === b[index]?.path && target.watchRoot === b[index]?.watchRoot && target.depth === b[index]?.depth);
}
function createSkillsPathWatcher(target) {
	const usePolling = resolveSkillsWatcherUsePolling();
	const watcher = runInSkillsWatcherContext(() => chokidar.watch(target.watchRoot, {
		ignoreInitial: true,
		followSymlinks: false,
		usePolling,
		depth: target.depth + path.relative(target.watchRoot, target.path).split(path.sep).filter(Boolean).length,
		awaitWriteFinish: {
			stabilityThreshold: SKILLS_WATCH_DEBOUNCE_MS,
			pollInterval: 100
		},
		ignored: (watchPath, stats) => !isPathInside(target.path, watchPath) && !isPathInside(watchPath, target.path) || shouldIgnoreSkillsWatchPath(watchPath, stats, { usePolling })
	}));
	const state = {
		watcher,
		watchRoot: target.watchRoot,
		depth: target.depth,
		subscribers: /* @__PURE__ */ new Set(),
		ready: process.env.OPENCLAW_SKILLS_WATCH_INITIAL_EVENTS === "1"
	};
	/* OPENCLAW_SKILLS_WATCH_READY_V1 */
	watcher.on("ready", () => {
		state.ready = true;
	});
	const schedule = (changedPath) => {
		if (watcher.closed) return;
		if (!state.ready) return;
		state.pendingPath = changedPath ?? state.pendingPath;
		if (state.timer) clearTimeout(state.timer);
		state.timer = setTimeout(() => {
			const pendingPath = state.pendingPath;
			state.pendingPath = void 0;
			state.timer = void 0;
			for (const watcherKey of state.subscribers) {
				workspaceWatchTargetCache.delete(watcherKey);
				bumpSkillsSnapshotVersion({
					workspaceDir: workspaceWatchOwnerDirs.get(watcherKey) ?? watcherKey,
					reason: "watch",
					changedPath: pendingPath
				});
			}
		}, SKILLS_WATCH_DEBOUNCE_MS);
	};
	const scheduleRawSkillFile = (changedPath) => {
		waitForStableSkillFile(changedPath, SKILLS_WATCH_DEBOUNCE_MS).catch((err) => {
			log.warn(`skills watcher stability check failed (${changedPath}): ${String(err)}`);
		}).then(() => schedule(changedPath));
	};
	watcher.on("all", (_event, changedPath) => {
		if (isPathInside(target.path, changedPath) || isPathInside(changedPath, target.path)) schedule(changedPath);
	});
	watcher.on("raw", (_eventName, rawPath, details) => {
		const rawPathText = rawPathToString(rawPath);
		if (!rawPathText) {
			const watchedPath = getRawWatchedPath(details);
			if (watchedPath && isPathInside(target.path, watchedPath)) schedule(watchedPath);
			return;
		}
		const changedPath = resolveRawSkillsWatchPath(rawPathText, details);
		if (changedPath && isPathInside(target.path, changedPath) && isSkillFileWatchPath(changedPath)) {
			if (usePolling) return;
			scheduleRawSkillFile(changedPath);
		}
	});
	watcher.on("error", (err) => {
		log.warn(`skills watcher error (${target.path}): ${String(err)}`);
	});
	return state;
}
function teardownSkillsPathWatcher(state) {
	if (state.timer) clearTimeout(state.timer);
	state.watcher.close().catch(() => {});
}
function subscribeWorkspaceToPath(workspaceDir, watchTarget) {
	const existing = pathWatchers.get(watchTarget.path);
	if (existing && existing.watchRoot === watchTarget.watchRoot && existing.depth >= watchTarget.depth) {
		existing.subscribers.add(workspaceDir);
		return;
	}
	if (existing) {
		const next = createSkillsPathWatcher({
			...watchTarget,
			depth: Math.max(existing.depth, watchTarget.depth)
		});
		for (const subscriber of existing.subscribers) next.subscribers.add(subscriber);
		next.subscribers.add(workspaceDir);
		teardownSkillsPathWatcher(existing);
		pathWatchers.set(watchTarget.path, next);
		return;
	}
	const state = createSkillsPathWatcher(watchTarget);
	state.subscribers.add(workspaceDir);
	pathWatchers.set(watchTarget.path, state);
}
function unsubscribeWorkspaceFromPath(workspaceDir, watchTarget) {
	const state = pathWatchers.get(watchTarget.path);
	if (!state) return;
	state.subscribers.delete(workspaceDir);
	if (state.subscribers.size === 0) {
		teardownSkillsPathWatcher(state);
		pathWatchers.delete(watchTarget.path);
	}
}
function disposeWorkspaceWatchState(watcherKey, watchTargets = workspaceWatchTargets.get(watcherKey) ?? []) {
	const workspaceDir = workspaceWatchOwnerDirs.get(watcherKey) ?? watcherKey;
	const hadWatchTargets = watchTargets.length > 0;
	for (const watchTarget of watchTargets) unsubscribeWorkspaceFromPath(watcherKey, watchTarget);
	workspaceWatchTargets.delete(watcherKey);
	workspaceWatchOwnerDirs.delete(watcherKey);
	workspaceWatchTargetCache.delete(watcherKey);
	workspaceWatchLastEnsuredAt.delete(watcherKey);
	if (hadWatchTargets) bumpSkillsSnapshotVersion({
		workspaceDir,
		reason: "watch-targets"
	});
	clearSkillsSnapshotVersionForWorkspace(workspaceDir);
}
function evictIdleWorkspaceWatchStates(now) {
	const cutoff = now - SKILLS_WORKSPACE_WATCH_IDLE_TTL_MS;
	for (const [workspaceDir, lastEnsuredAt] of workspaceWatchLastEnsuredAt) if (lastEnsuredAt < cutoff) disposeWorkspaceWatchState(workspaceDir);
}
function ensureSkillsWatcher(params) {
	const workspaceDir = params.workspaceDir.trim();
	if (!workspaceDir) return;
	const watcherKey = params.executionSkillsDir ? JSON.stringify([workspaceDir, params.executionSkillsDir]) : workspaceDir;
	workspaceWatchOwnerDirs.set(watcherKey, workspaceDir);
	const now = Date.now();
	const watchEnabled = params.config?.skills?.load?.watch !== false;
	const previousTargets = workspaceWatchTargets.get(watcherKey) ?? [];
	if (!watchEnabled) {
		disposeWorkspaceWatchState(watcherKey, previousTargets);
		evictIdleWorkspaceWatchStates(now);
		return;
	}
	workspaceWatchLastEnsuredAt.set(watcherKey, now);
	const watchTargets = resolveWatchTargets(workspaceDir, params.config, params.executionSkillsDir, watcherKey, params.pluginMetadataSnapshot);
	const targetsUnchanged = sameWatchTargets(previousTargets, watchTargets);
	const watcherDepthsCoverTargets = watchTargets.every((watchTarget) => (pathWatchers.get(watchTarget.path)?.depth ?? -1) >= watchTarget.depth);
	if (targetsUnchanged && watcherDepthsCoverTargets) {
		evictIdleWorkspaceWatchStates(now);
		return;
	}
	const watchTargetsChanged = previousTargets.length > 0 && !targetsUnchanged;
	const nextTargetKeys = new Set(watchTargets.map((target) => target.path));
	for (const watchTarget of previousTargets) if (!nextTargetKeys.has(watchTarget.path)) unsubscribeWorkspaceFromPath(watcherKey, watchTarget);
	for (const watchTarget of watchTargets) subscribeWorkspaceToPath(watcherKey, watchTarget);
	workspaceWatchTargets.set(watcherKey, watchTargets);
	if (watchTargetsChanged) bumpSkillsSnapshotVersion({
		workspaceDir,
		reason: "watch-targets",
		changedPath: watchTargets.map((target) => target.path).join("|")
	});
	evictIdleWorkspaceWatchStates(now);
}
async function closeSkillsWatchers(resetState = false) {
	if (resetState) resetSkillsRefreshStateForTest();
	const active = Array.from(pathWatchers.values());
	pathWatchers.clear();
	workspaceWatchTargets.clear();
	workspaceWatchOwnerDirs.clear();
	workspaceWatchTargetCache.clear();
	workspaceWatchLastEnsuredAt.clear();
	await Promise.all(active.map(async (state) => {
		if (state.timer) clearTimeout(state.timer);
		try {
			await state.watcher.close();
		} catch {}
	}));
}
if (process.env.VITEST || false) globalThis[Symbol.for("openclaw.skillsRefreshTestApi")] = { resetSkillsRefreshForTest: () => closeSkillsWatchers(true) };
//#endregion
export { ensureSkillsWatcher as n, closeSkillsWatchers as t };
