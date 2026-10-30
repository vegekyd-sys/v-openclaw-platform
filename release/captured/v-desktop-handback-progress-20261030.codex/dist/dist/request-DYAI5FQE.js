import { t as __exportAll } from "./rolldown-runtime-8H4AJuhK.js";
import { Nt as withTimeout, c as getLeasedSharedCodexAppServerClient, h as releaseLeasedSharedCodexAppServerClient, s as createIsolatedCodexAppServerClient, u as isCodexAppServerStartSelectionChangedError, y as retireSharedCodexAppServerClientIfCurrent } from "./shared-client-DxcfF9KX.js";
import { w as isCodexRemoteExecPlacementSandbox } from "./config-BhmfC1s6.js";
import { resolveAgentConfig, tryResolveDefaultAgentId } from "openclaw/plugin-sdk/agent-scope-runtime";
import { getSessionEntry } from "openclaw/plugin-sdk/session-store-runtime";
import { normalizeAgentId, parseAgentSessionKey } from "openclaw/plugin-sdk/routing";
import { resolveSandboxRuntimeStatus } from "openclaw/plugin-sdk/sandbox";
//#region extensions/codex/src/app-server/native-execution-policy.ts
/** Projects node execution ownership into the runtime tool factory options. */
function resolveCodexNodeExecToolOverrides(policy) {
	if (policy.effectiveExecHost !== "node") return;
	const node = policy.node?.trim();
	return {
		host: "node",
		...node ? { node } : {}
	};
}
/** Resolves node/gateway/sandbox execution ownership from overrides, session, agent, and config. */
function resolveCodexNativeExecutionPolicy(params) {
	const config = params.config ?? {};
	const sessionKey = params.sessionKey?.trim() || params.sessionId?.trim() || void 0;
	const agentId = resolvePolicyAgentId({
		config,
		sessionKey,
		agentId: params.agentId
	});
	const canReadSessionEntry = Boolean(agentId) && params.readRuntimeSessionEntry && shouldReadRuntimeSessionEntry({
		config,
		sessionKey,
		agentId
	});
	const sessionEntry = params.sessionEntry ?? (canReadSessionEntry && sessionKey && agentId ? readRuntimeSessionEntryBestEffort({
		sessionKey,
		agentId
	}) : void 0);
	const sandboxAgentId = parseAgentSessionKey(sessionKey)?.agentId ?? agentId;
	const sandboxAvailable = params.sandboxAvailable ?? (sessionKey && sandboxAgentId ? resolveSandboxRuntimeStatus({
		cfg: config,
		sessionKey,
		agentId: sandboxAgentId,
		classificationAgentId: sandboxAgentId
	}).sandboxed : false);
	const agentExec = agentId ? resolvePolicyAgentExec({
		config,
		agentId
	}) : void 0;
	const globalExec = config.tools?.exec;
	const requestedExecHost = normalizeExecTarget(params.execOverrides?.host) ?? normalizeExecTarget(sessionEntry?.execHost) ?? normalizeExecTarget(agentExec?.host) ?? normalizeExecTarget(globalExec?.host) ?? "auto";
	const effectiveExecHost = resolveEffectiveExecHost({
		requestedExecHost,
		sandboxAvailable
	});
	const node = params.execOverrides?.node ?? sessionEntry?.execNode ?? agentExec?.node ?? globalExec?.node;
	if (effectiveExecHost !== "node") return {
		nativeToolSurfaceAllowed: true,
		requestedExecHost,
		effectiveExecHost,
		node
	};
	return {
		nativeToolSurfaceAllowed: false,
		requestedExecHost,
		effectiveExecHost,
		node,
		blockReason: "OpenClaw exec host=node is active for this session. Codex app-server native execution cannot route shell, filesystem, MCP, or app-backed work through the selected OpenClaw node."
	};
}
/** Formats the user-facing explanation shown when native tools are blocked by exec host=node. */
function formatCodexNativeNodeExecBlock(params) {
	return [
		`Codex-native ${params.surface} is unavailable because OpenClaw exec host=node is active for this session.`,
		params.reason ?? "Codex app-server native execution cannot route execution through the selected OpenClaw node.",
		"Use a normal Codex harness turn so OpenClaw exec/process tools run on the node, or switch exec host to gateway for native Codex app-server execution."
	].join(" ");
}
function resolvePolicyAgentId(params) {
	const explicitAgentId = normalizeAgentIdOrDefault(params.agentId);
	if (explicitAgentId) return explicitAgentId;
	const sessionAgentId = parseAgentIdFromSessionKey(params.sessionKey);
	if (sessionAgentId) return sessionAgentId;
	return tryResolveDefaultAgentId(params.config);
}
function resolvePolicyAgentExec(params) {
	return resolveAgentConfig(params.config, params.agentId)?.tools?.exec;
}
function parseAgentIdFromSessionKey(sessionKey) {
	const raw = sessionKey?.trim();
	if (!raw) return;
	const parts = raw.toLowerCase().split(":").filter(Boolean);
	if (parts.length < 3 || parts[0] !== "agent" || !parts[2]) return;
	return normalizeAgentIdOrDefault(parts[1]);
}
function shouldReadRuntimeSessionEntry(params) {
	if (!params.sessionKey) return false;
	const explicitAgentId = normalizeAgentIdOrDefault(params.agentId);
	if (!explicitAgentId) return true;
	const sessionAgentId = parseAgentIdFromSessionKey(params.sessionKey);
	if (!sessionAgentId) return isDefaultAgentSessionKeyForAgent({
		config: params.config,
		agentId: explicitAgentId
	});
	return sessionAgentId === explicitAgentId;
}
function isDefaultAgentSessionKeyForAgent(params) {
	return normalizeAgentId(params.agentId) === tryResolveDefaultAgentId(params.config);
}
function normalizeAgentIdOrDefault(value) {
	const normalized = normalizeAgentId(value);
	return normalized === "main" && !(value ?? "").trim() ? void 0 : normalized;
}
function normalizeExecTarget(value) {
	const normalized = value?.trim().toLowerCase();
	if (normalized === "auto" || normalized === "sandbox" || normalized === "gateway" || normalized === "node") return normalized;
}
function resolveEffectiveExecHost(params) {
	if (params.requestedExecHost === "auto") return params.sandboxAvailable ? "sandbox" : "gateway";
	return params.requestedExecHost;
}
function readRuntimeSessionEntryBestEffort(params) {
	try {
		return getSessionEntry({
			sessionKey: params.sessionKey,
			agentId: params.agentId,
			hydrateSkillPromptRefs: false
		});
	} catch {
		return;
	}
}
//#endregion
//#region extensions/codex/src/app-server/sandbox-guard.ts
/**
* Blocks direct Codex app-server requests that would bypass OpenClaw sandbox or
* node-exec routing guarantees.
*/
const DIRECT_METHOD_POLICIES = /* @__PURE__ */ new Map([
	["account/rateLimits/read", "allowed-control-plane"],
	["account/read", "allowed-control-plane"],
	["app/installed", "allowed-control-plane"],
	["app/list", "allowed-control-plane"],
	["app/read", "allowed-control-plane"],
	["config/batchWrite", "allowed-control-plane"],
	["config/mcpServer/reload", "allowed-control-plane"],
	["config/read", "allowed-control-plane"],
	["config/value/write", "allowed-control-plane"],
	["environment/add", "allowed-control-plane"],
	["experimentalFeature/enablement/set", "allowed-control-plane"],
	["feedback/upload", "allowed-control-plane"],
	["hooks/list", "allowed-control-plane"],
	["initialize", "allowed-control-plane"],
	["marketplace/add", "allowed-control-plane"],
	["mcpServerStatus/list", "allowed-control-plane"],
	["model/list", "allowed-control-plane"],
	["plugin/install", "allowed-control-plane"],
	["plugin/installed", "allowed-control-plane"],
	["plugin/list", "allowed-control-plane"],
	["plugin/read", "allowed-control-plane"],
	["skills/list", "allowed-control-plane"],
	["thread/archive", "allowed-control-plane"],
	["thread/inject_items", "allowed-control-plane"],
	["thread/list", "allowed-control-plane"],
	["thread/metadata/update", "allowed-control-plane"],
	["thread/name/set", "allowed-control-plane"],
	["thread/read", "allowed-control-plane"],
	["thread/rollback", "allowed-control-plane"],
	["thread/start", "requires-openclaw-environment"],
	["thread/unarchive", "allowed-control-plane"],
	["thread/unsubscribe", "allowed-control-plane"],
	["turn/interrupt", "allowed-control-plane"],
	["turn/steer", "allowed-control-plane"],
	["command/exec", "blocked-native-bypass"],
	["command/resize", "blocked-native-bypass"],
	["command/terminate", "blocked-native-bypass"],
	["command/write", "blocked-native-bypass"],
	["fuzzyFileSearch", "blocked-native-bypass"],
	["mcpServer/resource/read", "blocked-native-bypass"],
	["mcpServer/tool/call", "blocked-native-bypass"],
	["process/kill", "blocked-native-bypass"],
	["process/resizePty", "blocked-native-bypass"],
	["process/spawn", "blocked-native-bypass"],
	["process/writeStdin", "blocked-native-bypass"],
	["review/start", "blocked-native-bypass"],
	["thread/compact/start", "blocked-native-bypass"],
	["thread/fork", "blocked-native-bypass"],
	["thread/resume", "blocked-native-bypass"],
	["thread/shellCommand", "blocked-native-bypass"],
	["turn/start", "blocked-native-bypass"]
]);
const BLOCKED_DIRECT_METHOD_PREFIXES = [
	"command/",
	"fs/",
	"windowsSandbox/"
];
const NODE_EXEC_BLOCKED_CONTROL_PLANE_METHODS = /* @__PURE__ */ new Set(["config/mcpServer/reload"]);
/** Returns a block message when a direct app-server method would bypass OpenClaw execution policy. */
function resolveCodexAppServerDirectSandboxBypassBlock(params) {
	const policy = resolveDirectMethodPolicy(params.method);
	if (NODE_EXEC_BLOCKED_CONTROL_PLANE_METHODS.has(params.method)) {
		const nodeExecBlock = resolveCodexNativeNodeExecBlock({
			config: params.config,
			sessionKey: params.sessionKey,
			sessionId: params.sessionId,
			surface: `app-server method \`${params.method}\``
		});
		if (nodeExecBlock) return nodeExecBlock;
	}
	if (policy === "allowed-control-plane") return;
	const nodeExecBlock = resolveCodexNativeNodeExecBlock({
		config: params.config,
		sessionKey: params.sessionKey,
		sessionId: params.sessionId,
		surface: `app-server method \`${params.method}\``
	});
	if (nodeExecBlock) return nodeExecBlock;
	const sessionKey = params.sessionKey?.trim() || params.sessionId?.trim();
	if (!sessionKey) return;
	const sandboxBlock = resolveCodexNativeSandboxBlock({
		config: params.config,
		sessionKey,
		sandbox: params.sandbox,
		surface: `app-server method \`${params.method}\``
	});
	if (!sandboxBlock) return;
	if (policy === "requires-openclaw-environment" && hasOpenClawSandboxEnvironmentSelection(params.requestParams)) return;
	return sandboxBlock;
}
/** Resolves the generic native-execution block for sandboxed or node-hosted sessions. */
function resolveCodexNativeExecutionBlock(params) {
	return resolveCodexNativeSandboxBlock(params) ?? resolveCodexNativeNodeExecBlock(params);
}
/** Returns a block message when native Codex execution cannot honor active sandboxing. */
function resolveCodexNativeSandboxBlock(params) {
	if (params.sandboxEnvironmentSelected) return;
	const sessionKey = params.sessionKey?.trim() || params.sessionId?.trim();
	if (!sessionKey) return;
	if (isCodexRemoteExecPlacementSandbox(params.sandbox) || params.sandbox?.enabled === true) return formatCodexNativeSandboxBlock({ surface: params.surface });
	const sandboxAgentId = parseAgentSessionKey(sessionKey)?.agentId ?? params.agentId ?? tryResolveDefaultAgentId(params.config ?? {});
	if (!sandboxAgentId) return;
	if (!resolveSandboxRuntimeStatus({
		cfg: params.config,
		sessionKey,
		agentId: sandboxAgentId,
		classificationAgentId: sandboxAgentId
	}).sandboxed) return;
	return formatCodexNativeSandboxBlock({ surface: params.surface });
}
function resolveDirectMethodPolicy(method) {
	const exact = DIRECT_METHOD_POLICIES.get(method);
	if (exact) return exact;
	if (BLOCKED_DIRECT_METHOD_PREFIXES.some((prefix) => method.startsWith(prefix))) return "blocked-native-bypass";
	return "blocked-native-bypass";
}
function hasOpenClawSandboxEnvironmentSelection(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const environments = value.environments;
	return Array.isArray(environments) && environments.length > 0 && environments.every((entry) => {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
		const environment = entry;
		return typeof environment.environmentId === "string" && environment.environmentId.startsWith("openclaw-sandbox-") && typeof environment.cwd === "string" && environment.cwd.trim().length > 0;
	});
}
function formatCodexNativeSandboxBlock(params) {
	return [
		`Codex-native ${params.surface} is unavailable because OpenClaw sandboxing is active for this session.`,
		"This mode cannot route execution through the OpenClaw sandbox backend.",
		"Use a normal Codex harness turn, or run an intentionally unsandboxed session."
	].join(" ");
}
function resolveCodexNativeNodeExecBlock(params) {
	const sessionKey = params.sessionKey?.trim() || params.sessionId?.trim();
	const policy = resolveCodexNativeExecutionPolicy({
		config: params.config,
		sessionKey,
		agentId: params.agentId,
		readRuntimeSessionEntry: Boolean(sessionKey)
	});
	if (policy.nativeToolSurfaceAllowed) return;
	return formatCodexNativeNodeExecBlock({
		surface: params.surface,
		reason: policy.blockReason
	});
}
//#endregion
//#region extensions/codex/src/app-server/request.ts
var request_exports = /* @__PURE__ */ __exportAll({
	CodexAppServerScopedRequestRejectedError: () => CodexAppServerScopedRequestRejectedError,
	readCodexAppServerUsage: () => readCodexAppServerUsage,
	requestCodexAppServerClientJson: () => requestCodexAppServerClientJson,
	requestCodexAppServerJson: () => requestCodexAppServerJson,
	withCodexAppServerJsonClient: () => withCodexAppServerJsonClient
});
/** Sends one guarded request over a client lease owned by the caller. */
async function requestCodexAppServerClientJson(params) {
	const sandboxBlock = resolveCodexAppServerDirectSandboxBypassBlock({
		method: params.method,
		requestParams: params.requestParams,
		config: params.config,
		sessionKey: params.sessionKey,
		sessionId: params.sessionId
	});
	if (sandboxBlock) throw new Error(sandboxBlock);
	const timeoutMs = params.timeoutMs ?? 6e4;
	return await withTimeout(params.client.request(params.method, params.requestParams, {
		timeoutMs,
		signal: params.signal,
		...params.assertCurrent ? { assertCurrent: () => assertRequestOwnerCurrent(params.assertCurrent) } : {}
	}), timeoutMs, `codex app-server ${params.method} timed out`);
}
async function requestCodexAppServerJson(params) {
	const sandboxBlock = resolveCodexAppServerDirectSandboxBypassBlock({
		method: params.method,
		requestParams: params.requestParams,
		config: params.config,
		sessionKey: params.sessionKey,
		sessionId: params.sessionId
	});
	if (sandboxBlock) throw new Error(sandboxBlock);
	return await withCodexAppServerJsonClient({
		...params,
		timeoutMessage: `codex app-server ${params.method} timed out`
	}, async (request) => await request({
		method: params.method,
		requestParams: params.requestParams
	}));
}
/** A scoped guard rejected the request before a physical write. */
var CodexAppServerScopedRequestRejectedError = class extends Error {
	constructor(message, options) {
		super(message, options);
		this.name = "CodexAppServerScopedRequestRejectedError";
	}
};
function assertRequestOwnerCurrent(assertCurrent) {
	try {
		assertCurrent?.();
	} catch (cause) {
		throw new CodexAppServerScopedRequestRejectedError(cause instanceof Error ? cause.message : String(cause), { cause });
	}
}
const CODEX_USAGE_ISOLATED_SHUTDOWN = {
	forceKillDelayMs: 200,
	exitTimeoutMs: 300
};
const CODEX_ACCOUNT_READ_MAX_TIMEOUT_MS = 4e3;
const CODEX_USAGE_DEADLINE_RESERVE_MS = CODEX_USAGE_ISOLATED_SHUTDOWN.forceKillDelayMs + CODEX_USAGE_ISOLATED_SHUTDOWN.exitTimeoutMs + 250;
/** Reads rate limits and best-effort account identity from one isolated app-server session. */
async function readCodexAppServerUsage(options) {
	const deadline = Date.now() + options.timeoutMs;
	return await withCodexAppServerJsonClient({
		timeoutMs: options.timeoutMs,
		timeoutMessage: "codex app-server usage read timed out",
		agentDir: options.agentDir,
		...options.authProfileId ? { authProfileId: options.authProfileId } : {},
		config: options.config,
		startOptions: options.startOptions,
		isolated: true,
		isolatedShutdown: CODEX_USAGE_ISOLATED_SHUTDOWN
	}, async (request) => {
		const rateLimits = await request({ method: "account/rateLimits/read" });
		const accountEmail = await readCodexAccountEmailBestEffort(request, deadline);
		return {
			rateLimits,
			...accountEmail ? { accountEmail } : {}
		};
	});
}
function extractCodexAccountEmail(value) {
	if (!value || typeof value !== "object") return;
	const record = value;
	const account = record.account && typeof record.account === "object" ? record.account : record;
	const email = account.email ?? account.accountEmail;
	return typeof email === "string" && email.trim() ? email.trim() : void 0;
}
async function readCodexAccountEmailBestEffort(request, deadline) {
	const boundMs = Math.min(CODEX_ACCOUNT_READ_MAX_TIMEOUT_MS, deadline - Date.now() - CODEX_USAGE_DEADLINE_RESERVE_MS);
	if (boundMs <= 0) return;
	const read = request({
		method: "account/read",
		requestParams: {}
	}).then((account) => extractCodexAccountEmail(account), () => void 0);
	let timer;
	const timeout = new Promise((resolve) => {
		timer = setTimeout(() => resolve(void 0), boundMs);
		timer.unref?.();
	});
	try {
		return await Promise.race([read, timeout]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}
/**
* Runs several guarded requests over one acquired client (shared lease or
* isolated child) so related reads see the same app-server session. The whole
* callback re-runs once when the client's start selection changed underneath it.
*/
async function withCodexAppServerJsonClient(params, run) {
	const timeoutMs = params.timeoutMs ?? 6e4;
	const timeoutMessage = params.timeoutMessage ?? "codex app-server request timed out";
	const timeoutController = new AbortController();
	const deadline = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Date.now() + timeoutMs : void 0;
	const isPastDeadline = () => deadline !== void 0 && Date.now() >= deadline;
	const throwIfAbandoned = () => {
		if (timeoutController.signal.aborted || isPastDeadline()) throw new CodexAppServerScopedRequestRejectedError(timeoutMessage);
	};
	const remainingTimeoutMs = () => {
		throwIfAbandoned();
		return deadline === void 0 ? timeoutMs : Math.max(1, deadline - Date.now());
	};
	try {
		return await withTimeout((async () => {
			for (let attempt = 0; attempt < 2; attempt += 1) {
				throwIfAbandoned();
				const client = await (params.isolated ? createIsolatedCodexAppServerClient : getLeasedSharedCodexAppServerClient)({
					startOptions: params.startOptions,
					pluginConfig: params.pluginConfig,
					timeoutMs: remainingTimeoutMs(),
					authProfileId: params.authProfileId,
					authProfileStore: params.authProfileStore,
					authBindingFingerprint: params.authBindingFingerprint,
					preparedAuth: params.preparedAuth,
					authRequirement: params.authRequirement,
					agentDir: params.agentDir,
					config: params.config,
					abandonSignal: timeoutController.signal
				});
				let scopeActive = true;
				const assertCurrent = () => {
					throwIfAbandoned();
					if (!scopeActive) throw new CodexAppServerScopedRequestRejectedError("Codex app-server request scope is closed");
					assertRequestOwnerCurrent(params.assertCurrent);
				};
				try {
					assertCurrent();
					const scopedRequest = async (request) => {
						const sandboxBlock = resolveCodexAppServerDirectSandboxBypassBlock({
							method: request.method,
							requestParams: request.requestParams,
							config: params.config,
							sessionKey: params.sessionKey,
							sessionId: params.sessionId
						});
						if (sandboxBlock) throw new CodexAppServerScopedRequestRejectedError(sandboxBlock);
						assertCurrent();
						return await client.request(request.method, request.requestParams, {
							timeoutMs: remainingTimeoutMs(),
							signal: timeoutController.signal,
							assertCurrent
						});
					};
					return await run(scopedRequest, client, { assertCurrent });
				} catch (error) {
					if (!isCodexAppServerStartSelectionChangedError(error) || attempt > 0) throw error;
					if (!params.isolated) retireSharedCodexAppServerClientIfCurrent(client);
					throwIfAbandoned();
				} finally {
					scopeActive = false;
					if (params.isolated) await client.closeAndWait({
						exitTimeoutMs: params.isolatedShutdown?.exitTimeoutMs ?? 2e3,
						forceKillDelayMs: params.isolatedShutdown?.forceKillDelayMs ?? 250
					});
					else releaseLeasedSharedCodexAppServerClient(client);
				}
			}
			throw new Error("Codex app-server selection retry loop exited unexpectedly");
		})(), timeoutMs, timeoutMessage);
	} catch (error) {
		if (isPastDeadline()) throw new Error(timeoutMessage, { cause: error });
		throw error;
	} finally {
		timeoutController.abort();
	}
}
//#endregion
export { request_exports as a, resolveCodexNativeSandboxBlock as c, requestCodexAppServerJson as i, resolveCodexNativeExecutionPolicy as l, readCodexAppServerUsage as n, withCodexAppServerJsonClient as o, requestCodexAppServerClientJson as r, resolveCodexNativeExecutionBlock as s, CodexAppServerScopedRequestRejectedError as t, resolveCodexNodeExecToolOverrides as u };
