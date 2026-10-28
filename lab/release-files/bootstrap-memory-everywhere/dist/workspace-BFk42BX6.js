import { t as resolveOpenClawPackageRoot } from "./openclaw-root-CfYY-fyD.js";
import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { c as resolveUserPath } from "./home-dir-BPhrG-aM.js";
import { i as getOrCreatePromise, n as createLazyPromise } from "./lazy-promise-DGqyc4Y4.js";
import { o as openRootFileFollowingParents, r as isRootFileMissingFailure } from "./boundary-file-read-uaJcf6X6.js";
import { I as sameFileIdentity, d as pathExists, t as FsSafeError, w as root } from "./fs-safe-Cdu9fYG_.js";
import { r as isPathInside } from "./path-guards-Cp-mGr3-.js";
import { l as pathExists$1 } from "./utils-D3A1hGii.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { t as retryAsync } from "./retry-DIUON3ys.js";
import { T as isSubagentSessionKey, w as isCronSessionKey } from "./session-key-CRjxKW0X.js";
import { t as DEFAULT_AGENT_WORKSPACE_DIR } from "./workspace-default-BBAjKO98.js";
import { r as runCommandWithTimeout } from "./exec-D7bZ8DC6.js";
import { t as deriveSessionChatTypeFromKey } from "./session-chat-type-shared-BKTfMJHj.js";
import { t as extractFrontmatterBlock } from "./frontmatter-CWJFi-rx.js";
import { r as exactWorkspaceEntryExists, t as CANONICAL_ROOT_MEMORY_FILENAME } from "./root-memory-files-IL5Gznz4.js";
import { n as readWorkspaceBootstrapFile, t as MAX_WORKSPACE_BOOTSTRAP_FILE_BYTES } from "./workspace-bootstrap-read-CUL2d6SJ.js";
import { _ as assertNoUnmigratedWorkspaceState, c as readWorkspaceStateSnapshot, o as mergeWorkspaceSetupState, r as clearExpiredWorkspaceStateForVanishedWorkspace, t as WORKSPACE_ATTESTATION_RECENT_MS, u as replaceWorkspaceAttestation } from "./workspace-state-store-CabVZBW2.js";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs$1 from "node:fs/promises";
import { createHash } from "node:crypto";
import { Minimatch } from "minimatch";
import { setTimeout } from "node:timers/promises";
//#region src/agents/workspace-templates.ts
/**
* Workspace template directory discovery.
* Resolves packaged documentation templates for source and installed runtimes.
*/
const FALLBACK_DOCS_TEMPLATE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/reference/templates");
/** Resolves existing packaged workspace-template directories without retired runtime paths. */
async function resolveWorkspaceTemplateSearchDirs(opts) {
	const moduleUrl = opts?.moduleUrl ?? import.meta.url;
	const argv1 = opts?.argv1 ?? process.argv[1];
	const cwd = opts?.cwd ?? process.cwd();
	const packageRoot = await resolveOpenClawPackageRoot({
		moduleUrl,
		argv1,
		cwd
	});
	const relativeDir = path.join("docs", "reference", "templates");
	const candidates = [
		packageRoot ? path.join(packageRoot, relativeDir) : void 0,
		path.resolve(cwd, relativeDir),
		FALLBACK_DOCS_TEMPLATE_DIR
	];
	const dirs = [];
	for (const candidate of candidates) if (candidate && !dirs.includes(candidate) && await pathExists$1(candidate)) dirs.push(candidate);
	return dirs;
}
//#endregion
//#region src/agents/workspace.ts
/**
* Workspace bootstrap, template, state, and attestation helpers. This module
* creates and reads AGENTS/SOUL/TOOLS-style bootstrap files while guarding
* filesystem boundaries and recently-attested workspaces.
*/
const DEFAULT_AGENTS_FILENAME = "AGENTS.md";
const DEFAULT_SOUL_FILENAME = "SOUL.md";
const DEFAULT_TOOLS_FILENAME = "TOOLS.md";
const DEFAULT_IDENTITY_FILENAME = "IDENTITY.md";
const DEFAULT_USER_FILENAME = "USER.md";
const DEFAULT_BOOTSTRAP_FILENAME = "BOOTSTRAP.md";
const DEFAULT_MEMORY_FILENAME = CANONICAL_ROOT_MEMORY_FILENAME;
const GENERATED_WORKSPACE_BOOTSTRAP_FILENAMES = [
	DEFAULT_AGENTS_FILENAME,
	DEFAULT_SOUL_FILENAME,
	DEFAULT_IDENTITY_FILENAME,
	DEFAULT_USER_FILENAME
];
const GENERATED_WORKSPACE_BOOTSTRAP_FILENAME_SET = new Set(GENERATED_WORKSPACE_BOOTSTRAP_FILENAMES);
const WORKSPACE_ONBOARDING_PROFILE_FILENAMES = [
	DEFAULT_SOUL_FILENAME,
	DEFAULT_IDENTITY_FILENAME,
	DEFAULT_USER_FILENAME
];
const TRANSIENT_WORKSPACE_READ_CODES = /* @__PURE__ */ new Set([
	"EAGAIN",
	"EWOULDBLOCK",
	"EINTR"
]);
const TRANSIENT_WORKSPACE_READ_ERRNOS = /* @__PURE__ */ new Set([-11, -4]);
const TRANSIENT_WORKSPACE_READ_MESSAGE = /Unknown system error -(?:11|4)\b/i;
const workspaceLogger = createSubsystemLogger("workspace");
const workspaceTemplateCache = /* @__PURE__ */ new Map();
const gitInitializationInFlight = /* @__PURE__ */ new Map();
const workspaceFileCache = /* @__PURE__ */ new Map();
const workspaceFileSourceIdentities = /* @__PURE__ */ new WeakMap();
function workspaceFileIdentity(stat, canonicalPath) {
	return `${canonicalPath}|${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
}
function setWorkspaceFileSourceIdentity(file, sourceIdentity) {
	workspaceFileSourceIdentities.set(file, sourceIdentity);
}
function getWorkspaceFileSourceIdentity(file) {
	return workspaceFileSourceIdentities.get(file);
}
function workspaceFileSourceIdentitiesMatch(left, right) {
	const leftIdentity = getWorkspaceFileSourceIdentity(left);
	const rightIdentity = getWorkspaceFileSourceIdentity(right);
	return leftIdentity?.[2] === rightIdentity?.[2];
}
function workspaceFilesShareSourceIdentity(left, right) {
	const leftIdentity = getWorkspaceFileSourceIdentity(left);
	const rightIdentity = getWorkspaceFileSourceIdentity(right);
	if (!leftIdentity || !rightIdentity) return false;
	return leftIdentity[0] === rightIdentity[0] || sameFileIdentity(leftIdentity[1], rightIdentity[1]);
}
async function readWorkspaceFileWithGuards(params) {
	try {
		return await retryAsync(async () => {
			const opened = await openRootFileFollowingParents({
				absolutePath: params.filePath,
				rootPath: params.workspaceDir,
				boundaryLabel: "workspace root"
			});
			if (!opened.ok) {
				if (isTransientWorkspaceReadError(opened.error)) throw opened.error;
				workspaceFileCache.delete(params.filePath);
				return opened;
			}
			const identity = workspaceFileIdentity(opened.stat, opened.path);
			const sourceIdentity = [
				opened.path,
				opened.stat,
				identity
			];
			const cached = params.useCache === false ? void 0 : workspaceFileCache.get(params.filePath);
			if (cached?.identity === identity) {
				fs.closeSync(opened.fd);
				return {
					ok: true,
					content: cached.content,
					sourceIdentity
				};
			}
			try {
				const content = await readWorkspaceBootstrapFile(opened.fd);
				if (params.useCache !== false) workspaceFileCache.set(params.filePath, {
					content,
					identity
				});
				return {
					ok: true,
					content,
					sourceIdentity
				};
			} finally {
				fs.closeSync(opened.fd);
			}
		}, {
			attempts: 3,
			minDelayMs: 50,
			maxDelayMs: 50,
			shouldRetry: (err) => isTransientWorkspaceReadError(err)
		});
	} catch (error) {
		workspaceFileCache.delete(params.filePath);
		return {
			ok: false,
			reason: error instanceof RangeError ? "validation" : "io",
			error
		};
	}
}
function stripFrontMatter(content) {
	return extractFrontmatterBlock(content)?.body.replace(/^\s+/, "") ?? content;
}
async function loadTemplate(name) {
	const cached = workspaceTemplateCache.get(name);
	if (cached) return cached;
	const pending = (async () => {
		const templateDirs = await resolveWorkspaceTemplateSearchDirs();
		const triedPaths = [];
		for (const templateDir of templateDirs) {
			const templatePath = path.join(templateDir, name);
			triedPaths.push(templatePath);
			try {
				return stripFrontMatter(await fs$1.readFile(templatePath, "utf-8"));
			} catch (error) {
				if (error?.code !== "ENOENT") throw error;
			}
		}
		throw new Error(`Missing workspace template: ${name} (${triedPaths.join(", ")}). Ensure workspace templates are packaged.`);
	})();
	workspaceTemplateCache.set(name, pending);
	try {
		return await pending;
	} catch (error) {
		workspaceTemplateCache.delete(name);
		throw error;
	}
}
/**
* Canonical bootstrap filenames in prompt order. Single source for the runtime
* validation set, the name union, and the Control UI core-files list; a private
* copy anywhere else silently drifts when a file is retired.
*/
const WORKSPACE_BOOTSTRAP_FILENAMES = [
	DEFAULT_AGENTS_FILENAME,
	DEFAULT_SOUL_FILENAME,
	DEFAULT_IDENTITY_FILENAME,
	DEFAULT_USER_FILENAME,
	DEFAULT_BOOTSTRAP_FILENAME,
	DEFAULT_MEMORY_FILENAME
];
/** Set of recognized bootstrap filenames for runtime validation */
const VALID_BOOTSTRAP_NAMES = new Set(WORKSPACE_BOOTSTRAP_FILENAMES);
const OPTIONAL_BOOTSTRAP_FILENAMES = /* @__PURE__ */ new Set([
	DEFAULT_SOUL_FILENAME,
	DEFAULT_IDENTITY_FILENAME,
	DEFAULT_USER_FILENAME
]);
/**
* Bootstrap files whose absence is a normal workspace state rather than a fault:
* the optional profile files, plus MEMORY.md which only appears once memory is
* written. Editors should offer these for creation instead of flagging them.
*/
function isExpectedAbsentBootstrapFile(name) {
	return OPTIONAL_BOOTSTRAP_FILENAMES.has(name) || name === DEFAULT_MEMORY_FILENAME;
}
const WORKSPACE_VANISHED_ERROR_CODE = "WORKSPACE_VANISHED";
var WorkspaceVanishedError = class extends Error {
	constructor(params) {
		super(`OpenClaw workspace appears to have disappeared after a recent initialization: ${params.workspaceDir}. Refusing to reseed BOOTSTRAP.md over a recently attested workspace. Restore the workspace or run a full OpenClaw reset if this reset was intentional.`);
		this.code = WORKSPACE_VANISHED_ERROR_CODE;
		this.name = "WorkspaceVanishedError";
		this.workspaceDir = params.workspaceDir;
	}
};
async function writeFileIfMissing(filePath, content, beforePersistentApply) {
	beforePersistentApply?.();
	try {
		await fs$1.writeFile(filePath, content, {
			encoding: "utf-8",
			flag: "wx"
		});
		return true;
	} catch (err) {
		if (err.code !== "EEXIST") throw err;
		return false;
	}
}
function isTransientWorkspaceReadError(error) {
	const fsError = error;
	if (fsError?.code && TRANSIENT_WORKSPACE_READ_CODES.has(fsError.code)) return true;
	if (typeof fsError?.errno === "number" && TRANSIENT_WORKSPACE_READ_ERRNOS.has(fsError.errno)) return true;
	return error instanceof Error && TRANSIENT_WORKSPACE_READ_MESSAGE.test(error.message);
}
async function fileContentDiffersFromTemplate(filePath, template) {
	try {
		return await retryAsync(async () => await fs$1.readFile(filePath, "utf-8") !== template, {
			attempts: 3,
			minDelayMs: 50,
			maxDelayMs: 50,
			shouldRetry: (err) => isTransientWorkspaceReadError(err)
		});
	} catch (err) {
		if (err.code === "ENOENT") return false;
		throw err;
	}
}
async function hasWorkspaceUserContentEvidence(dir, opts) {
	const indicators = [path.join(dir, "memory")];
	if (opts?.includeGit) indicators.push(path.join(dir, ".git"));
	for (const indicator of indicators) try {
		await fs$1.access(indicator);
		return true;
	} catch {}
	if (await exactWorkspaceEntryExists(dir, DEFAULT_MEMORY_FILENAME)) return true;
	return await hasWorkspaceSkillEvidence(dir);
}
async function hasWorkspaceSkillEvidence(dir) {
	try {
		const skillEntries = await fs$1.readdir(path.join(dir, "skills"), { withFileTypes: true });
		for (const entry of skillEntries) {
			if (!entry.isDirectory()) continue;
			try {
				await fs$1.access(path.join(dir, "skills", entry.name, "SKILL.md"));
				return true;
			} catch {}
		}
	} catch {}
	return false;
}
async function hasSkipBootstrapWorkspaceContentEvidence(dir) {
	try {
		const entries = await fs$1.readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name === ".DS_Store" || entry.name === ".openclaw" || entry.name === "openclaw-workspace-state.json") continue;
			if (entry.name === "skills" && entry.isDirectory()) {
				if (!await hasWorkspaceSkillEvidence(dir)) continue;
			}
			return true;
		}
	} catch (err) {
		if (err.code !== "ENOENT") throw err;
	}
	return false;
}
async function workspaceProfileLooksConfigured(params) {
	return (await Promise.all(WORKSPACE_ONBOARDING_PROFILE_FILENAMES.map(async (fileName) => fileContentDiffersFromTemplate(path.join(params.dir, fileName), await loadTemplate(fileName))))).some(Boolean) || await hasWorkspaceUserContentEvidence(params.dir, { includeGit: params.includeGitEvidence });
}
async function workspaceRequiredBootstrapLooksCustomized(dir, opts) {
	const fileNames = [DEFAULT_AGENTS_FILENAME];
	const generatedHashes = opts?.generatedHashes;
	if (generatedHashes && generatedHashes.size > 0) {
		for (const fileName of fileNames) {
			const filePath = path.join(dir, fileName);
			const generatedHash = generatedHashes.get(fileName);
			try {
				const content = await fs$1.readFile(filePath, "utf-8");
				if (createHash("sha256").update(content).digest("hex") !== generatedHash && content !== await loadTemplate(fileName)) return true;
			} catch {}
		}
		return false;
	}
	return (await Promise.all(fileNames.map(async (fileName) => fileContentDiffersFromTemplate(path.join(dir, fileName), await loadTemplate(fileName))))).some(Boolean);
}
async function workspaceAttestedGeneratedFilesIntact(dir, generatedHashes) {
	if (!generatedHashes.has("AGENTS.md")) return false;
	for (const [fileName, generatedHash] of generatedHashes) {
		if (!GENERATED_WORKSPACE_BOOTSTRAP_FILENAME_SET.has(fileName)) continue;
		try {
			const content = await fs$1.readFile(path.join(dir, fileName), "utf-8");
			if (createHash("sha256").update(content).digest("hex") !== generatedHash) return false;
		} catch {
			return false;
		}
	}
	return true;
}
async function workspaceHasBootstrapCompletionEvidence(params) {
	return await workspaceProfileLooksConfigured(params);
}
async function reconcileWorkspaceBootstrapCompletionState(params) {
	const bootstrapExists = params.bootstrapExists ?? await pathExists(params.bootstrapPath);
	if (typeof params.state.setupCompletedAt === "string" && params.state.setupCompletedAt.trim().length > 0) return {
		repaired: false,
		bootstrapExists,
		state: params.state
	};
	if (params.state.bootstrapSeededAt && !bootstrapExists) {
		const completedState = {
			...params.state,
			setupCompletedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		params.beforePersistentApply?.();
		return {
			repaired: true,
			bootstrapExists: false,
			state: mergeWorkspaceSetupState(params.dir, completedState)
		};
	}
	if (!bootstrapExists || !await workspaceHasBootstrapCompletionEvidence({ dir: params.dir })) return {
		repaired: false,
		bootstrapExists,
		state: params.state
	};
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const repairedState = {
		...params.state,
		bootstrapSeededAt: params.state.bootstrapSeededAt ?? now,
		setupCompletedAt: now
	};
	params.beforePersistentApply?.();
	const persistedState = mergeWorkspaceSetupState(params.dir, repairedState);
	params.beforePersistentApply?.();
	try {
		await fs$1.rm(params.bootstrapPath, { force: true });
		return {
			repaired: true,
			bootstrapExists: false,
			state: persistedState
		};
	} catch {
		return {
			repaired: true,
			bootstrapExists: true,
			state: persistedState
		};
	}
}
async function collectGeneratedBootstrapHashes(dir) {
	const hashes = /* @__PURE__ */ new Map();
	for (const fileName of GENERATED_WORKSPACE_BOOTSTRAP_FILENAMES) try {
		const content = await fs$1.readFile(path.join(dir, fileName), "utf-8");
		if (content === await loadTemplate(fileName)) hashes.set(fileName, createHash("sha256").update(content).digest("hex"));
	} catch {}
	return hashes;
}
function recentWorkspaceAttestation(attestation, nowMs = Date.now()) {
	if (!attestation) return;
	if (nowMs - attestation.attestedAtMs > 864e5) return;
	return attestation;
}
async function maybeWriteWorkspaceAttestation(dir, beforePersistentApply) {
	const attestedAtMs = Date.now();
	const generatedHashes = await collectGeneratedBootstrapHashes(dir);
	beforePersistentApply?.();
	try {
		replaceWorkspaceAttestation({
			workspaceDir: dir,
			attestedAtMs,
			generatedHashes
		});
	} catch {}
}
function hasWorkspaceSetupStateMarker(state) {
	return Boolean(state.bootstrapSeededAt || state.setupCompletedAt);
}
function hasRecentWorkspaceSetupState(snapshot, nowMs = Date.now()) {
	if (!hasWorkspaceSetupStateMarker(snapshot.setup) || snapshot.setupUpdatedAtMs === void 0) return false;
	return nowMs - snapshot.setupUpdatedAtMs <= WORKSPACE_ATTESTATION_RECENT_MS;
}
async function workspaceAttestationHasSurvivalEvidence(params) {
	if (await pathExists(params.bootstrapPath)) return true;
	if (await workspaceRequiredBootstrapLooksCustomized(params.dir, { generatedHashes: params.attestation.generatedHashes })) return true;
	if (await workspaceProfileLooksConfigured({ dir: params.dir })) return true;
	return hasWorkspaceSetupStateMarker(params.state) && await workspaceAttestedGeneratedFilesIntact(params.dir, params.attestation.generatedHashes);
}
async function workspaceSetupStateHasSurvivalEvidence(params) {
	if (await pathExists(params.bootstrapPath)) return true;
	if (await workspaceProfileLooksConfigured({ dir: params.dir })) return true;
	const currentState = readCanonicalWorkspaceStateSnapshot(params.dir);
	if (currentState.setup.bootstrapSeededAt !== params.initialState.setup.bootstrapSeededAt || currentState.setup.setupCompletedAt !== params.initialState.setup.setupCompletedAt) return true;
	const generatedHashes = await collectGeneratedBootstrapHashes(params.dir);
	return [
		DEFAULT_AGENTS_FILENAME,
		DEFAULT_SOUL_FILENAME,
		DEFAULT_IDENTITY_FILENAME,
		DEFAULT_USER_FILENAME
	].every((fileName) => generatedHashes.has(fileName));
}
function readCanonicalWorkspaceStateSnapshot(dir, options = {}) {
	const snapshot = readWorkspaceStateSnapshot(dir, options);
	assertNoUnmigratedWorkspaceState({ workspaceDir: dir });
	return snapshot;
}
async function isWorkspaceSetupCompleted(dir, options = {}) {
	const state = readCanonicalWorkspaceStateSnapshot(dir, options).setup;
	return typeof state.setupCompletedAt === "string" && state.setupCompletedAt.trim().length > 0;
}
async function resolveWorkspaceBootstrapStatus(dir, options = {}) {
	const resolvedDir = resolveUserPath(dir);
	const state = readCanonicalWorkspaceStateSnapshot(resolvedDir, options).setup;
	if (typeof state.setupCompletedAt === "string" && state.setupCompletedAt.trim().length > 0) return "complete";
	const bootstrapPath = path.join(resolvedDir, DEFAULT_BOOTSTRAP_FILENAME);
	if (!await pathExists(bootstrapPath)) return "complete";
	return "pending";
}
var WorkspaceBootstrapSeedConflictError = class extends Error {
	constructor(message, options) {
		super(message, options);
		this.name = "WorkspaceBootstrapSeedConflictError";
	}
};
async function seedWorkspaceBootstrap(params) {
	if (params.content.byteLength > 2097152) throw new WorkspaceBootstrapSeedConflictError(`BOOTSTRAP.md exceeds ${MAX_WORKSPACE_BOOTSTRAP_FILE_BYTES} bytes.`);
	let text;
	try {
		text = new TextDecoder("utf-8", { fatal: true }).decode(params.content);
	} catch {
		throw new WorkspaceBootstrapSeedConflictError("BOOTSTRAP.md must be valid UTF-8.");
	}
	if (text.trim().length === 0) throw new WorkspaceBootstrapSeedConflictError("BOOTSTRAP.md must not be empty.");
	const dir = resolveUserPath(params.dir);
	const bootstrapPath = path.join(dir, DEFAULT_BOOTSTRAP_FILENAME);
	const initialState = readCanonicalWorkspaceStateSnapshot(dir, params.stateOptions).setup;
	if (initialState.setupCompletedAt) return "consumed";
	const bootstrapExists = await pathExists(bootstrapPath);
	if (initialState.bootstrapSeededAt && !bootstrapExists) return "consumed";
	await fs$1.mkdir(dir, { recursive: true });
	const workspaceRoot = await root(dir, {
		hardlinks: "reject",
		maxBytes: MAX_WORKSPACE_BOOTSTRAP_FILE_BYTES,
		symlinks: "reject"
	});
	let created = false;
	if (!bootstrapExists) try {
		await workspaceRoot.write(DEFAULT_BOOTSTRAP_FILENAME, params.content, { overwrite: false });
		created = true;
	} catch (error) {
		if (!(error.code === "EEXIST" || error instanceof FsSafeError && error.code === "already-exists")) throw error;
	}
	if (!created) await retryAsync(async () => {
		let statBefore;
		try {
			statBefore = await fs$1.stat(bootstrapPath);
		} catch (error) {
			throw new WorkspaceBootstrapSeedConflictError("Existing BOOTSTRAP.md could not be read safely.", { cause: error });
		}
		const existing = await readWorkspaceFileWithGuards({
			filePath: bootstrapPath,
			workspaceDir: dir,
			useCache: false
		});
		if (!existing.ok) throw new WorkspaceBootstrapSeedConflictError("Existing BOOTSTRAP.md could not be read safely.");
		if (!Buffer.from(existing.content, "utf8").equals(params.content)) throw new WorkspaceBootstrapSeedConflictError("Existing BOOTSTRAP.md differs from the consented Claw bootstrap.");
		await setTimeout(20);
		let statAfter;
		try {
			statAfter = await fs$1.stat(bootstrapPath);
		} catch (error) {
			throw new WorkspaceBootstrapSeedConflictError("Existing BOOTSTRAP.md could not be read safely.", { cause: error });
		}
		if (statBefore.size !== statAfter.size || statBefore.mtimeMs !== statAfter.mtimeMs || statAfter.size !== params.content.byteLength) throw new WorkspaceBootstrapSeedConflictError("Existing BOOTSTRAP.md write has not stabilized.");
		const stable = await readWorkspaceFileWithGuards({
			filePath: bootstrapPath,
			workspaceDir: dir,
			useCache: false
		});
		if (!stable.ok || !Buffer.from(stable.content, "utf8").equals(params.content)) throw new WorkspaceBootstrapSeedConflictError("Existing BOOTSTRAP.md differs from the consented Claw bootstrap.");
	}, {
		attempts: 5,
		minDelayMs: 20,
		maxDelayMs: 80,
		shouldRetry: (error) => error instanceof WorkspaceBootstrapSeedConflictError
	});
	if (!initialState.bootstrapSeededAt) {
		const nowMs = params.nowMs ?? Date.now();
		mergeWorkspaceSetupState(dir, { bootstrapSeededAt: new Date(nowMs).toISOString() }, nowMs, params.stateOptions);
	}
	return created ? "seeded" : "already-seeded";
}
async function isWorkspaceBootstrapPending(dir) {
	return await resolveWorkspaceBootstrapStatus(dir) === "pending";
}
const isGitAvailable = createLazyPromise(async () => {
	try {
		return (await runCommandWithTimeout(["git", "--version"], { timeoutMs: 2e3 })).code === 0;
	} catch {
		return false;
	}
});
async function ensureGitRepo(dir, isBrandNewWorkspace, beforePersistentApply) {
	if (!isBrandNewWorkspace) return;
	beforePersistentApply?.();
	await getOrCreatePromise(gitInitializationInFlight, dir, async () => {
		if (await fs$1.stat(path.join(dir, ".git")).catch(() => void 0)) return;
		if (!await isGitAvailable()) return;
		beforePersistentApply?.();
		try {
			await runCommandWithTimeout(["git", "init"], {
				cwd: dir,
				timeoutMs: 1e4
			});
		} catch {}
	}, { evictOnSettled: true });
}
async function ensureAgentWorkspace(params) {
	const rawDir = params?.dir?.trim() ? params.dir.trim() : DEFAULT_AGENT_WORKSPACE_DIR;
	const dir = resolveUserPath(rawDir);
	const beforePersistentApply = params?.beforePersistentApply;
	if (params?.provisioning === "runtime-managed-implicit") {
		beforePersistentApply?.();
		await fs$1.mkdir(dir, { recursive: true });
		return {
			dir,
			bootstrapPending: false
		};
	}
	let initialState = readCanonicalWorkspaceStateSnapshot(dir);
	let reseedingExpiredWorkspaceState = false;
	const recentAttestation = recentWorkspaceAttestation(initialState.attestation);
	const recentSetupState = hasRecentWorkspaceSetupState(initialState);
	if (!await pathExists(dir)) {
		if (recentAttestation) throw new WorkspaceVanishedError({ workspaceDir: dir });
		beforePersistentApply?.();
		if (!clearExpiredWorkspaceStateForVanishedWorkspace(dir)) throw new WorkspaceVanishedError({ workspaceDir: dir });
	}
	beforePersistentApply?.();
	await fs$1.mkdir(dir, { recursive: true });
	const bootstrapPath = path.join(dir, DEFAULT_BOOTSTRAP_FILENAME);
	if (!params?.ensureBootstrapFiles) {
		const hasContentEvidence = await hasSkipBootstrapWorkspaceContentEvidence(dir);
		if (recentAttestation && !hasContentEvidence) throw new WorkspaceVanishedError({ workspaceDir: dir });
		if (hasWorkspaceSetupStateMarker(initialState.setup) && !initialState.attestation && !await workspaceSetupStateHasSurvivalEvidence({
			dir,
			bootstrapPath,
			initialState
		})) {
			if (recentSetupState) throw new WorkspaceVanishedError({ workspaceDir: dir });
			beforePersistentApply?.();
			if (!clearExpiredWorkspaceStateForVanishedWorkspace(dir)) throw new WorkspaceVanishedError({ workspaceDir: dir });
		}
		if (hasContentEvidence) await maybeWriteWorkspaceAttestation(dir, beforePersistentApply);
		return {
			dir,
			bootstrapPending: false
		};
	}
	const agentsPath = path.join(dir, DEFAULT_AGENTS_FILENAME);
	const soulPath = path.join(dir, DEFAULT_SOUL_FILENAME);
	const identityPath = path.join(dir, DEFAULT_IDENTITY_FILENAME);
	const userPath = path.join(dir, DEFAULT_USER_FILENAME);
	const isBrandNewWorkspace = await (async () => {
		const paths = [...[
			agentsPath,
			soulPath,
			identityPath,
			userPath
		], path.join(dir, "memory")];
		return (await Promise.all(paths.map(async (p) => {
			try {
				await fs$1.access(p);
				return true;
			} catch {
				return false;
			}
		}))).every((v) => !v) && !await hasWorkspaceUserContentEvidence(dir);
	})();
	if (isBrandNewWorkspace) {
		if (recentAttestation) throw new WorkspaceVanishedError({ workspaceDir: dir });
		reseedingExpiredWorkspaceState = initialState.setupExists || Boolean(initialState.attestation);
		beforePersistentApply?.();
		if (!clearExpiredWorkspaceStateForVanishedWorkspace(dir)) throw new WorkspaceVanishedError({ workspaceDir: dir });
	}
	if (initialState.attestation && !isBrandNewWorkspace) {
		if (!await workspaceAttestationHasSurvivalEvidence({
			dir,
			bootstrapPath,
			state: initialState.setup,
			attestation: initialState.attestation
		})) {
			if (recentAttestation) throw new WorkspaceVanishedError({ workspaceDir: dir });
			reseedingExpiredWorkspaceState = true;
			beforePersistentApply?.();
			if (!clearExpiredWorkspaceStateForVanishedWorkspace(dir)) throw new WorkspaceVanishedError({ workspaceDir: dir });
		}
	} else if (hasWorkspaceSetupStateMarker(initialState.setup) && !isBrandNewWorkspace && !await workspaceSetupStateHasSurvivalEvidence({
		dir,
		bootstrapPath,
		initialState
	})) {
		if (recentSetupState) throw new WorkspaceVanishedError({ workspaceDir: dir });
		reseedingExpiredWorkspaceState = true;
		beforePersistentApply?.();
		if (!clearExpiredWorkspaceStateForVanishedWorkspace(dir)) throw new WorkspaceVanishedError({ workspaceDir: dir });
	}
	const agentsTemplate = await loadTemplate(DEFAULT_AGENTS_FILENAME);
	const soulTemplate = await loadTemplate(DEFAULT_SOUL_FILENAME);
	const identityTemplate = await loadTemplate(DEFAULT_IDENTITY_FILENAME);
	const userTemplate = await loadTemplate(DEFAULT_USER_FILENAME);
	initialState = readCanonicalWorkspaceStateSnapshot(dir);
	const skipOptionalBootstrapFiles = new Set(params?.skipOptionalBootstrapFiles ?? []);
	if (initialState.setup.setupCompletedAt) for (const filename of OPTIONAL_BOOTSTRAP_FILENAMES) skipOptionalBootstrapFiles.add(filename);
	const shouldWriteBootstrapFile = (fileName) => !OPTIONAL_BOOTSTRAP_FILENAMES.has(fileName) || !skipOptionalBootstrapFiles.has(fileName);
	await writeFileIfMissing(agentsPath, agentsTemplate, beforePersistentApply);
	if (shouldWriteBootstrapFile("SOUL.md")) await writeFileIfMissing(soulPath, soulTemplate, beforePersistentApply);
	const identityPathCreated = shouldWriteBootstrapFile("IDENTITY.md") ? await writeFileIfMissing(identityPath, identityTemplate, beforePersistentApply) : false;
	if (shouldWriteBootstrapFile("USER.md")) await writeFileIfMissing(userPath, userTemplate, beforePersistentApply);
	let state = readCanonicalWorkspaceStateSnapshot(dir).setup;
	let stateDirty = false;
	const markState = (next) => {
		state = {
			...state,
			...next
		};
		stateDirty = true;
	};
	const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
	let bootstrapExists = await pathExists(bootstrapPath);
	if (!state.bootstrapSeededAt && bootstrapExists) markState({ bootstrapSeededAt: nowIso() });
	if (!state.setupCompletedAt) {
		const repair = await reconcileWorkspaceBootstrapCompletionState({
			dir,
			bootstrapPath,
			state,
			bootstrapExists,
			beforePersistentApply
		});
		if (repair.repaired) {
			state = repair.state;
			stateDirty = false;
			bootstrapExists = repair.bootstrapExists;
		}
	}
	if (!state.bootstrapSeededAt && !state.setupCompletedAt && !bootstrapExists) {
		if ((recentAttestation ? await workspaceRequiredBootstrapLooksCustomized(dir, { generatedHashes: recentAttestation.generatedHashes }) : false) || await workspaceProfileLooksConfigured({
			dir,
			includeGitEvidence: !reseedingExpiredWorkspaceState
		})) markState({ setupCompletedAt: nowIso() });
		else {
			if (!await writeFileIfMissing(bootstrapPath, await loadTemplate("BOOTSTRAP.md"), beforePersistentApply)) bootstrapExists = await pathExists(bootstrapPath);
			else bootstrapExists = true;
			if (bootstrapExists && !state.bootstrapSeededAt) markState({ bootstrapSeededAt: nowIso() });
		}
	}
	if (stateDirty) {
		beforePersistentApply?.();
		state = mergeWorkspaceSetupState(dir, state);
	}
	await ensureGitRepo(dir, isBrandNewWorkspace, beforePersistentApply);
	await maybeWriteWorkspaceAttestation(dir, beforePersistentApply);
	return {
		dir,
		agentsPath,
		soulPath,
		identityPath,
		userPath,
		bootstrapPath,
		bootstrapPending: !state.setupCompletedAt && bootstrapExists,
		identityPathCreated
	};
}
async function loadWorkspaceBootstrapFiles(dir) {
	const resolvedDir = resolveUserPath(dir);
	const entries = [
		{
			name: DEFAULT_AGENTS_FILENAME,
			filePath: path.join(resolvedDir, DEFAULT_AGENTS_FILENAME)
		},
		{
			name: DEFAULT_SOUL_FILENAME,
			filePath: path.join(resolvedDir, DEFAULT_SOUL_FILENAME)
		},
		{
			name: DEFAULT_IDENTITY_FILENAME,
			filePath: path.join(resolvedDir, DEFAULT_IDENTITY_FILENAME)
		},
		{
			name: DEFAULT_USER_FILENAME,
			filePath: path.join(resolvedDir, DEFAULT_USER_FILENAME)
		},
		{
			name: DEFAULT_BOOTSTRAP_FILENAME,
			filePath: path.join(resolvedDir, DEFAULT_BOOTSTRAP_FILENAME)
		},
		{
			name: DEFAULT_MEMORY_FILENAME,
			filePath: path.join(resolvedDir, DEFAULT_MEMORY_FILENAME)
		}
	];
	const result = [];
	for (const entry of entries) {
		if ((entry.name === DEFAULT_MEMORY_FILENAME || entry.name === "USER.md") && !await exactWorkspaceEntryExists(resolvedDir, entry.name)) continue;
		const loaded = await readWorkspaceFileWithGuards({
			filePath: entry.filePath,
			workspaceDir: resolvedDir
		});
		if (loaded.ok) {
			const file = {
				name: entry.name,
				path: entry.filePath,
				content: loaded.content,
				missing: false
			};
			setWorkspaceFileSourceIdentity(file, loaded.sourceIdentity);
			result.push(file);
		} else if (isRootFileMissingFailure(loaded)) result.push({
			name: entry.name,
			path: entry.filePath,
			missing: true
		});
		else {
			const fallbackReason = `workspace file could not be read (${loaded.reason})`;
			const rawReason = loaded.error instanceof Error ? loaded.error.message : fallbackReason;
			const reason = truncateUtf16Safe(rawReason.replaceAll(/\s+/gu, " ").trim() || fallbackReason, 300);
			workspaceLogger.warn("Workspace bootstrap file is unreadable.", {
				fileName: entry.name,
				filePath: entry.filePath,
				reason,
				consoleMessage: `Workspace bootstrap file is unreadable: file=${entry.filePath} reason=${reason}`
			});
			result.push({
				name: entry.name,
				path: entry.filePath,
				content: `[UNREADABLE: ${reason}]`,
				missing: false
			});
		}
	}
	return result;
}
const SUBAGENT_BOOTSTRAP_ALLOWLIST = /* @__PURE__ */ new Set([DEFAULT_AGENTS_FILENAME]);
const CRON_BOOTSTRAP_ALLOWLIST = /* @__PURE__ */ new Set([
	DEFAULT_AGENTS_FILENAME,
	DEFAULT_SOUL_FILENAME,
	DEFAULT_IDENTITY_FILENAME,
	DEFAULT_USER_FILENAME
]);
function resolveBootstrapSessionContext(session) {
	return typeof session === "string" ? { sessionKey: session } : session ?? {};
}
function filterRootMemoryBootstrapFiles(files, workspaceRoot) {
	if (!workspaceRoot) return files.filter((file) => file.name !== DEFAULT_MEMORY_FILENAME);
	const resolvedWorkspaceRoot = resolveUserPath(workspaceRoot);
	const rootMemoryPath = path.join(resolvedWorkspaceRoot, DEFAULT_MEMORY_FILENAME);
	return files.filter((file) => {
		if (typeof file.path !== "string") return true;
		const filePath = file.path.trim();
		if (!filePath) return true;
		return (path.isAbsolute(filePath) ? path.resolve(filePath) : filePath.startsWith("~") ? resolveUserPath(filePath) : path.resolve(resolvedWorkspaceRoot, filePath)) !== rootMemoryPath;
	});
}
function filterBootstrapFilesForSession(files, session) {
	const { sessionKey, chatType, workspaceDir } = resolveBootstrapSessionContext(session);
	const isSubagent = isSubagentSessionKey(sessionKey);
	const isCron = isCronSessionKey(sessionKey);
	const effectiveChatType = chatType ?? deriveSessionChatTypeFromKey(sessionKey);
	const privacyFilteredFiles = files; // v-bootstrap-memory-everywhere-v1: MEMORY.md in every session; memory_search reaches it anyway
	if (isSubagent) return privacyFilteredFiles.filter((file) => SUBAGENT_BOOTSTRAP_ALLOWLIST.has(file.name) || file.name === DEFAULT_MEMORY_FILENAME);
	if (isCron) return privacyFilteredFiles.filter((file) => CRON_BOOTSTRAP_ALLOWLIST.has(file.name) || file.name === DEFAULT_MEMORY_FILENAME);
	return privacyFilteredFiles;
}
function hasGlobPattern(pattern) {
	return /[?*{}]/u.test(pattern);
}
function normalizeWorkspacePatternPath(value) {
	return value.replaceAll(path.sep, "/").replaceAll("\\", "/").replace(/^\.\/+/u, "");
}
function resolveGlobWalkRoot(pattern) {
	const normalized = normalizeWorkspacePatternPath(pattern);
	const globIndex = normalized.search(/[?*{}]/u);
	if (globIndex === -1) return normalized;
	const slashIndex = normalized.lastIndexOf("/", globIndex);
	return slashIndex === -1 ? "." : normalized.slice(0, slashIndex) || ".";
}
async function* walkWorkspaceFiles(workspaceDir, initialRelativeDir, strictRead, matcher) {
	const stack = [initialRelativeDir === "." ? "" : initialRelativeDir];
	while (stack.length > 0) {
		const currentRelativeDir = stack.pop() ?? "";
		const currentDir = path.resolve(workspaceDir, currentRelativeDir);
		if (!isPathInside(workspaceDir, currentDir)) continue;
		let entries;
		try {
			entries = await fs$1.readdir(currentDir, { withFileTypes: true });
		} catch (error) {
			if (strictRead && error.code !== "ENOENT") throw error;
			continue;
		}
		for (const entry of entries) {
			const childRelativePath = currentRelativeDir ? path.join(currentRelativeDir, entry.name) : entry.name;
			const normalizedChildPath = normalizeWorkspacePatternPath(childRelativePath);
			if (entry.isDirectory()) {
				if (matcher.match(normalizedChildPath, true)) stack.push(childRelativePath);
				continue;
			}
			if ((entry.isFile() || entry.isSymbolicLink()) && matcher.match(normalizedChildPath)) yield normalizedChildPath;
		}
	}
}
async function resolveExtraBootstrapPatternPaths(workspaceDir, pattern, strictRead) {
	if (!strictRead && typeof fs$1.glob === "function") try {
		const matches = [];
		for await (const match of fs$1.glob(pattern, { cwd: workspaceDir })) matches.push(match);
		return matches;
	} catch {}
	if (typeof path.matchesGlob !== "function") return [pattern];
	const normalizedPattern = normalizeWorkspacePatternPath(pattern);
	const matcher = new Minimatch(normalizedPattern, {
		nocomment: true,
		nonegate: true,
		windowsPathsNoEscape: true
	});
	const matches = [];
	for await (const candidate of walkWorkspaceFiles(workspaceDir, resolveGlobWalkRoot(normalizedPattern), strictRead, matcher)) matches.push(candidate);
	return matches.length > 0 ? matches : [pattern];
}
function patternWalkRootStaysInWorkspace(workspaceDir, pattern) {
	const walkRoot = path.resolve(workspaceDir, resolveGlobWalkRoot(pattern));
	return isPathInside(workspaceDir, walkRoot);
}
async function loadWorkspacePatternFilesWithDiagnostics(dir, extraPatterns, options) {
	if (!extraPatterns.length) return {
		files: [],
		diagnostics: []
	};
	const resolvedDir = resolveUserPath(dir);
	const diagnostics = [];
	const resolvedPaths = /* @__PURE__ */ new Set();
	for (const pattern of extraPatterns) {
		if (!patternWalkRootStaysInWorkspace(resolvedDir, pattern)) {
			diagnostics.push({
				path: path.resolve(resolvedDir, pattern),
				reason: "security",
				detail: "pattern resolves outside the workspace"
			});
			continue;
		}
		try {
			if (hasGlobPattern(pattern)) {
				const matches = await resolveExtraBootstrapPatternPaths(resolvedDir, pattern, options.strictPatternRead === true);
				for (const match of matches) resolvedPaths.add(match);
			} else resolvedPaths.add(pattern);
		} catch (error) {
			diagnostics.push({
				path: path.resolve(resolvedDir, pattern),
				reason: "io",
				detail: error instanceof Error ? error.message : String(error)
			});
		}
	}
	const files = [];
	for (const relPath of resolvedPaths) {
		const filePath = path.resolve(resolvedDir, relPath);
		const baseName = path.basename(relPath);
		if (!(options.acceptedBasenames.has(baseName) || options.acceptedBasenamePrefixes?.some((prefix) => baseName.startsWith(prefix)) === true)) {
			if (options.reportUnsupportedBasenames !== false) diagnostics.push({
				path: filePath,
				reason: "invalid-bootstrap-filename",
				detail: `unsupported bootstrap basename: ${baseName}`
			});
			continue;
		}
		const loaded = await readWorkspaceFileWithGuards({
			filePath,
			workspaceDir: resolvedDir
		});
		if (loaded.ok) {
			const file = {
				name: baseName,
				path: filePath,
				content: loaded.content
			};
			setWorkspaceFileSourceIdentity(file, loaded.sourceIdentity);
			files.push(file);
			continue;
		}
		const missing = loaded.error?.code === "ENOENT";
		const reason = loaded.reason === "validation" || options.strictPatternRead === true && loaded.reason === "path" && !missing ? "security" : loaded.reason === "path" ? "missing" : "io";
		diagnostics.push({
			path: filePath,
			reason,
			detail: loaded.error instanceof Error ? loaded.error.message : typeof loaded.error === "string" ? loaded.error : reason
		});
	}
	return {
		files,
		diagnostics
	};
}
async function loadExtraBootstrapFilesWithDiagnostics(dir, extraPatterns) {
	const loaded = await loadWorkspacePatternFilesWithDiagnostics(dir, extraPatterns, { acceptedBasenames: VALID_BOOTSTRAP_NAMES });
	return {
		files: loaded.files.map((file) => {
			const bootstrapFile = {
				name: file.name,
				path: file.path,
				content: file.content,
				missing: false
			};
			const sourceIdentity = getWorkspaceFileSourceIdentity(file);
			if (sourceIdentity) setWorkspaceFileSourceIdentity(bootstrapFile, sourceIdentity);
			return bootstrapFile;
		}),
		diagnostics: loaded.diagnostics
	};
}
//#endregion
export { workspaceFileSourceIdentitiesMatch as C, seedWorkspaceBootstrap as S, resolveWorkspaceTemplateSearchDirs as T, isWorkspaceSetupCompleted as _, DEFAULT_SOUL_FILENAME as a, loadWorkspacePatternFilesWithDiagnostics as b, GENERATED_WORKSPACE_BOOTSTRAP_FILENAMES as c, WorkspaceBootstrapSeedConflictError as d, WorkspaceVanishedError as f, isWorkspaceBootstrapPending as g, isExpectedAbsentBootstrapFile as h, DEFAULT_MEMORY_FILENAME as i, WORKSPACE_BOOTSTRAP_FILENAMES as l, filterBootstrapFilesForSession as m, DEFAULT_BOOTSTRAP_FILENAME as n, DEFAULT_TOOLS_FILENAME as o, ensureAgentWorkspace as p, DEFAULT_IDENTITY_FILENAME as r, DEFAULT_USER_FILENAME as s, DEFAULT_AGENTS_FILENAME as t, WORKSPACE_VANISHED_ERROR_CODE as u, loadExtraBootstrapFilesWithDiagnostics as v, workspaceFilesShareSourceIdentity as w, resolveWorkspaceBootstrapStatus as x, loadWorkspaceBootstrapFiles as y };
