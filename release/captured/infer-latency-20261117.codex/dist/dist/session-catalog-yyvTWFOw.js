import { $t as isJsonObject, Jt as readCodexSessionMeta, K as resolveCodexAppServerClientInstanceId, Nt as withTimeout, Vt as resolveCodexAppServerAuthProfileStore, Wt as resolveCodexAppServerPreparedAuthHandoff, Xt as CODEX_INTERACTIVE_THREAD_SOURCE_KINDS, Yt as CODEX_INTERACTIVE_CUSTOM_THREAD_SOURCES, Z as assertCodexThreadForkParams, c as getLeasedSharedCodexAppServerClient, h as releaseLeasedSharedCodexAppServerClient, q as CodexAppServerRpcError, qt as isOpenClawManagedCodexThread, y as retireSharedCodexAppServerClientIfCurrent, zt as resolveCodexAppServerAuthProfileId } from "./shared-client-DxcfF9KX.js";
import { E as readCodexPluginConfig, F as resolveCodexAppServerHomeDir, I as resolveCodexAppServerLocalHomeDir, L as resolveCodexAppServerUserHomeDir, i as resolveCodexAppServerRuntimeOptions, s as resolveCodexSupervisionAppServerRuntimeOptions } from "./config-BhmfC1s6.js";
import { c as reclaimCurrentCodexSessionGeneration, d as sessionBindingIdentity } from "./session-binding-BHuTCRZQ.js";
import { a as closeCodexStartupClientBestEffort } from "./attempt-client-cleanup-DYHcRQAa.js";
import { n as listCodexAppServerModels } from "./models-sYnEc0gd.js";
import { a as replaceCodexCatalogConnectionHomes, n as buildCodexAppServerConnectionFingerprint, t as resumeCodexAppServerThread } from "./thread-resume-C7pyVKeW.js";
import { g as codexCatalogHomeId, h as canonicalCodexCatalogHome, m as projectCodexUserItemText, r as importCodexThreadHistoryToTranscript } from "./transcript-mirror-DTUxFWa_.js";
import { i as requestCodexAppServerJson, o as withCodexAppServerJsonClient, r as requestCodexAppServerClientJson } from "./request-DYAI5FQE.js";
import { n as describeControlFailure, t as CODEX_CONTROL_METHODS } from "./capabilities-dIjNVCYH.js";
import { a as formatCodexDisplayText } from "./command-formatters-CLHhEB1Q.js";
import { n as createCodexCliNodeConversationBindingData } from "./conversation-binding-data-BiodpIzq.js";
import { n as prepareCodexAppServerAuthBinding } from "./auth-binding-Ds_QVm-X.js";
import { i as createImportedCodexSession, n as codexUpstreamBaseline, r as codexUpstreamContinueResult, t as codexLastTerminalTurnId } from "./session-upstream-marker-C351-5Qw.js";
import { asFiniteNumber, isRecord, normalizeBoundedOptionalString } from "openclaw/plugin-sdk/string-coerce-runtime";
import fs from "node:fs/promises";
import path from "node:path";
import { timestampMsToIsoString } from "openclaw/plugin-sdk/number-runtime";
import { resolvePreferredOpenClawTmpDir } from "openclaw/plugin-sdk/temp-path";
import { prepareAgentRuntimeAuth } from "openclaw/plugin-sdk/agent-harness-runtime";
import { pruneMapToMaxSize } from "openclaw/plugin-sdk/collection-runtime";
import fsSync from "node:fs";
import os from "node:os";
import { listAgentIds, resolveAgentDir as resolveAgentDir$1, resolveAgentWorkspaceDir, resolveAllowedModelRef, resolveDefaultAgentDir, resolveDefaultAgentId, resolveDefaultModelForAgent } from "openclaw/plugin-sdk/agent-runtime";
import { runCommandBuffered } from "openclaw/plugin-sdk/process-runtime";
import { resolveSessionAgentIdsStrict } from "openclaw/plugin-sdk/agent-scope-runtime";
import { materializeWindowsSpawnProgram, resolveWindowsSpawnProgram } from "openclaw/plugin-sdk/windows-spawn";
import { getSessionEntry, resolveStorePath } from "openclaw/plugin-sdk/session-store-runtime";
import { truncateUtf16Safe } from "openclaw/plugin-sdk/text-utility-runtime";
import { expectDefined } from "openclaw/plugin-sdk/expect-runtime";
import { sanitizeTerminalText } from "openclaw/plugin-sdk/text-chunking";
import { parseAgentSessionKey } from "openclaw/plugin-sdk/routing";
import process$1 from "node:process";
import { resolveSessionModelRef } from "openclaw/plugin-sdk/model-session-runtime";
import { resolveApiKeyForProvider } from "openclaw/plugin-sdk/provider-auth-runtime";
import { createSessionCatalogAdoptionCoordinator, listSessionCatalogEntries, sessionCatalogAdoptedSessionKey, sessionCatalogAdoptedSourceKey } from "openclaw/plugin-sdk/session-catalog";
import { decodeNodePtyResumeParams, decodeNodePtyStartParams, resolveNodeHostExecutable, runNodePtyCommand } from "openclaw/plugin-sdk/node-host";
//#region extensions/codex/src/jsonl-lines.ts
const JSONL_STREAM_THRESHOLD_BYTES = 4194304;
const JSONL_READ_CHUNK_BYTES = 1048576;
async function visitJsonlLines(file, visitor, chunkBytes = JSONL_READ_CHUNK_BYTES) {
	let size;
	try {
		size = (await fs.stat(file)).size;
	} catch {
		return {
			ok: false,
			lineCount: 0
		};
	}
	if (size <= JSONL_STREAM_THRESHOLD_BYTES) {
		let content;
		try {
			content = await fs.readFile(file, "utf8");
		} catch {
			return {
				ok: false,
				lineCount: 0
			};
		}
		if (content.length === 0) return {
			ok: true,
			lineCount: 0
		};
		let lineCount = 0;
		for (const line of content.split(/\r?\n/u)) {
			lineCount += 1;
			if (visitor(line) === false) break;
		}
		return {
			ok: true,
			lineCount
		};
	}
	let handle;
	try {
		handle = await fs.open(file, "r");
	} catch {
		return {
			ok: false,
			lineCount: 0
		};
	}
	const buffer = Buffer.allocUnsafe(chunkBytes);
	const decoder = new TextDecoder();
	let pendingFragments = [];
	let lineCount = 0;
	try {
		while (true) {
			const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
			if (bytesRead === 0) break;
			const content = decoder.decode(buffer.subarray(0, bytesRead), { stream: true });
			let lineStart = 0;
			while (true) {
				const newline = content.indexOf("\n", lineStart);
				if (newline === -1) break;
				let rawLine = content.slice(lineStart, newline);
				if (pendingFragments.length > 0) {
					pendingFragments.push(rawLine);
					rawLine = pendingFragments.join("");
					pendingFragments = [];
				}
				const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
				lineCount += 1;
				if (visitor(line) === false) return {
					ok: true,
					lineCount
				};
				lineStart = newline + 1;
			}
			if (lineStart < content.length) pendingFragments.push(content.slice(lineStart));
		}
		const decoderTail = decoder.decode();
		if (decoderTail.length > 0) pendingFragments.push(decoderTail);
		if (pendingFragments.length > 0) {
			const rawLine = pendingFragments.join("");
			const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
			lineCount += 1;
			visitor(line);
		}
		return {
			ok: true,
			lineCount
		};
	} catch {
		return {
			ok: false,
			lineCount: 0
		};
	} finally {
		await handle.close().catch(() => void 0);
	}
}
//#endregion
//#region extensions/codex/src/node-cli-sessions.ts
const CODEX_CLI_SESSIONS_LIST_COMMAND = "codex.cli.sessions.list";
const CODEX_CLI_SESSION_RESUME_COMMAND = "codex.cli.session.resume";
const DEFAULT_SESSION_LIMIT = 10;
const MAX_SESSION_LIMIT = 50;
const DEFAULT_RESUME_TIMEOUT_MS = 12e5;
const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const activeResumeSessions = /* @__PURE__ */ new Set();
function createCodexCliSessionNodeHostCommands() {
	return [{
		command: CODEX_CLI_SESSIONS_LIST_COMMAND,
		cap: "codex-cli-sessions",
		handle: listLocalCodexCliSessions
	}, {
		command: CODEX_CLI_SESSION_RESUME_COMMAND,
		cap: "codex-cli-sessions",
		dangerous: true,
		handle: resumeLocalCodexCliSession
	}];
}
function createCodexCliSessionNodeInvokePolicies() {
	return [{
		commands: [CODEX_CLI_SESSIONS_LIST_COMMAND],
		defaultPlatforms: [
			"macos",
			"linux",
			"windows"
		],
		handle: (ctx) => ctx.invokeNode()
	}, {
		commands: [CODEX_CLI_SESSION_RESUME_COMMAND],
		dangerous: true,
		handle: (ctx) => ctx.invokeNode()
	}];
}
async function listCodexCliSessionsOnNode(params) {
	const node = await resolveCodexCliNode({
		runtime: params.runtime,
		requestedNode: params.requestedNode,
		command: CODEX_CLI_SESSIONS_LIST_COMMAND
	});
	return {
		node,
		result: parseCodexCliSessionsListResult(await params.runtime.nodes.invoke({
			nodeId: readNodeId(node),
			command: CODEX_CLI_SESSIONS_LIST_COMMAND,
			params: {
				limit: params.limit,
				filter: params.filter
			},
			timeoutMs: 15e3,
			scopes: ["operator.write"]
		}))
	};
}
async function resolveCodexCliSessionForBindingOnNode(params) {
	const listing = await listCodexCliSessionsOnNode({
		runtime: params.runtime,
		requestedNode: params.requestedNode,
		filter: params.sessionId,
		limit: MAX_SESSION_LIMIT
	});
	if (!listing.node.commands?.includes("codex.cli.session.resume")) throw new Error(`Node ${formatNodeLabel(listing.node)} does not expose ${CODEX_CLI_SESSION_RESUME_COMMAND}.`);
	return {
		node: listing.node,
		session: listing.result.sessions.find((session) => session.sessionId === params.sessionId)
	};
}
async function resumeCodexCliSessionOnNode(params) {
	const payload = unwrapNodeInvokePayload$1(await params.runtime.nodes.invoke({
		nodeId: params.nodeId,
		command: CODEX_CLI_SESSION_RESUME_COMMAND,
		params: {
			sessionId: params.sessionId,
			prompt: params.prompt,
			cwd: params.cwd,
			timeoutMs: params.timeoutMs
		},
		timeoutMs: (params.timeoutMs ?? DEFAULT_RESUME_TIMEOUT_MS) + 5e3,
		scopes: ["operator.write"]
	}));
	if (!isRecord(payload) || payload.ok !== true || typeof payload.text !== "string") throw new Error("Codex CLI resume returned an invalid payload.");
	return {
		ok: true,
		sessionId: typeof payload.sessionId === "string" ? payload.sessionId : params.sessionId,
		text: payload.text
	};
}
function formatCodexCliSessions(params) {
	if (params.result.sessions.length === 0) return `No Codex CLI sessions returned from ${formatCodexDisplayText(formatNodeLabel(params.node))}.`;
	return [`Codex CLI sessions on ${formatCodexDisplayText(formatNodeLabel(params.node))}:`, ...params.result.sessions.map((session) => {
		const details = [session.cwd, session.updatedAt].filter((value) => Boolean(value));
		return `- ${formatCodexDisplayText(session.sessionId)}${session.lastMessage ? ` - ${formatCodexDisplayText(session.lastMessage)}` : ""}${details.length > 0 ? ` (${details.map(formatCodexDisplayText).join(", ")})` : ""}\n  Bind: /codex resume ${formatCodexDisplayText(session.sessionId)} --host ${formatCodexDisplayText(readNodeId(params.node))} --bind here`;
	})].join("\n");
}
async function listLocalCodexCliSessions(paramsJSON) {
	const params = readRecordParam(paramsJSON);
	const limit = normalizeLimit$1(params.limit);
	const filter = typeof params.filter === "string" ? params.filter.trim().toLowerCase() : "";
	const codexHome = resolveCodexHome();
	const summaries = await readHistorySessions(codexHome);
	await hydrateSessionFiles(codexHome, summaries);
	await hydrateSessionsFromSessionFiles(codexHome, summaries);
	const sessions = [...summaries.values()].filter((session) => {
		if (!filter) return true;
		return [
			session.sessionId,
			session.cwd,
			session.lastMessage
		].some((value) => value?.toLowerCase().includes(filter));
	}).toSorted((a, b) => compareOptionalStringsDesc(a.updatedAt, b.updatedAt)).slice(0, limit);
	return JSON.stringify({
		sessions,
		codexHome
	});
}
async function resumeLocalCodexCliSession(paramsJSON) {
	const params = readRecordParam(paramsJSON);
	const sessionId = typeof params.sessionId === "string" ? params.sessionId.trim() : "";
	const prompt = typeof params.prompt === "string" ? params.prompt.trim() : "";
	if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) throw new Error("Missing or invalid Codex CLI session id.");
	if (!prompt) throw new Error("Missing Codex CLI prompt.");
	if (activeResumeSessions.has(sessionId)) throw new Error(`Codex CLI session ${sessionId} already has an active resume turn.`);
	activeResumeSessions.add(sessionId);
	try {
		const text = await runCodexExecResume({
			sessionId,
			prompt,
			cwd: typeof params.cwd === "string" && params.cwd.trim() ? params.cwd.trim() : void 0,
			timeoutMs: normalizeTimeoutMs(params.timeoutMs)
		});
		return JSON.stringify({
			ok: true,
			sessionId,
			text: text.trim() || "Codex completed without a text reply."
		});
	} finally {
		activeResumeSessions.delete(sessionId);
	}
}
async function runCodexExecResume(params) {
	const outputPath = path.join(await fs.mkdtemp(path.join(resolvePreferredOpenClawTmpDir(), "openclaw-codex-cli-")), "last-message.txt");
	try {
		const args = [
			"exec",
			"resume",
			"--skip-git-repo-check",
			"--output-last-message",
			outputPath,
			params.sessionId,
			"-"
		];
		const invocation = materializeWindowsSpawnProgram(resolveWindowsSpawnProgram({
			command: "codex",
			platform: process$1.platform,
			env: process$1.env,
			execPath: process$1.execPath,
			packageName: "@openai/codex"
		}), args);
		const result = await runCommandBuffered([invocation.command, ...invocation.argv], {
			cwd: params.cwd || process$1.cwd(),
			input: params.prompt,
			env: process$1.env,
			killGraceMs: 2e3,
			killProcessTree: false,
			terminateOnOutputError: true,
			timeoutMs: params.timeoutMs
		});
		if (result.termination === "timeout") throw new Error(`codex exec resume timed out after ${String(params.timeoutMs)}ms`);
		if (result.termination === "error" && result.error) throw result.error;
		if (result.code !== 0) {
			const message = result.stderr.toString("utf8").trim() || result.stdout.toString("utf8").trim() || `codex exec resume exited with code ${String(result.code)}`;
			throw new Error(message);
		}
		return await fs.readFile(outputPath, "utf8");
	} finally {
		await fs.rm(path.dirname(outputPath), {
			recursive: true,
			force: true
		});
	}
}
async function readHistorySessions(codexHome) {
	const summaries = /* @__PURE__ */ new Map();
	if (!(await visitJsonlLines(path.join(codexHome, "history.jsonl"), (line) => {
		const trimmed = line.trim();
		if (!trimmed) return;
		let parsed;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			return;
		}
		if (!isRecord(parsed) || typeof parsed.session_id !== "string") return;
		const sessionId = parsed.session_id.trim();
		if (!sessionId) return;
		const entry = summaries.get(sessionId) ?? {
			sessionId,
			messageCount: 0
		};
		entry.messageCount += 1;
		if (typeof parsed.text === "string" && parsed.text.trim()) entry.lastMessage = truncateText(parsed.text.trim(), 140);
		if (typeof parsed.ts === "number") entry.updatedAt = timestampMsToIsoString(parsed.ts * 1e3) ?? entry.updatedAt;
		summaries.set(sessionId, entry);
	})).ok) return /* @__PURE__ */ new Map();
	return summaries;
}
async function hydrateSessionFiles(codexHome, summaries) {
	if (summaries.size === 0) return;
	const files = await findSessionFiles(path.join(codexHome, "sessions"), 4);
	const pending = new Set(summaries.keys());
	for (const file of files) {
		const basename = path.basename(file);
		const sessionId = [...pending].find((id) => basename.includes(id));
		if (!sessionId) continue;
		const entry = summaries.get(sessionId);
		if (!entry) continue;
		entry.sessionFile = file;
		const cwd = readSessionMetaCwd(await readFirstLine(file) ?? "");
		if (cwd) entry.cwd = cwd;
		pending.delete(sessionId);
		if (pending.size === 0) return;
	}
}
async function hydrateSessionsFromSessionFiles(codexHome, summaries) {
	const files = await findSessionFiles(path.join(codexHome, "sessions"), 4);
	for (const file of files) {
		const summary = await readSessionFileSummary(file);
		if (!summary) continue;
		const existing = summaries.get(summary.sessionId);
		summaries.set(summary.sessionId, {
			...summary,
			...existing,
			cwd: existing?.cwd ?? summary.cwd,
			sessionFile: existing?.sessionFile ?? summary.sessionFile,
			updatedAt: existing?.updatedAt ?? summary.updatedAt,
			lastMessage: existing?.lastMessage ?? summary.lastMessage,
			messageCount: existing?.messageCount ?? summary.messageCount
		});
	}
}
async function readSessionFileSummary(file) {
	let sessionId = "";
	let cwd;
	let updatedAt;
	let lastMessage;
	let messageCount = 0;
	const result = await visitJsonlLines(file, (line) => {
		const trimmed = line.trim();
		if (!trimmed) return;
		let parsed;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			return;
		}
		if (!isRecord(parsed)) return;
		if (typeof parsed.timestamp === "string" && parsed.timestamp.trim()) updatedAt = parsed.timestamp.trim();
		if (parsed.type === "session_meta" && isRecord(parsed.payload)) {
			if (typeof parsed.payload.id === "string" && parsed.payload.id.trim()) sessionId = parsed.payload.id.trim();
			if (typeof parsed.payload.cwd === "string" && parsed.payload.cwd.trim()) cwd = parsed.payload.cwd.trim();
			return;
		}
		const messageText = readResponseItemMessageText(parsed);
		if (messageText) {
			messageCount += 1;
			lastMessage = truncateText(messageText, 140);
		}
	});
	if (!result.ok) return null;
	if (result.lineCount === 0) return null;
	if (!sessionId) sessionId = readSessionIdFromFilename(file) ?? "";
	if (!sessionId) return null;
	return {
		sessionId,
		updatedAt: updatedAt ?? await readFileMtimeIso(file),
		lastMessage,
		cwd,
		sessionFile: file,
		messageCount
	};
}
async function findSessionFiles(dir, maxDepth) {
	if (maxDepth < 0) return [];
	let entries;
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	const files = [];
	for (const entry of entries) {
		const entryPath = path.join(dir, entry.name);
		if (entry.isDirectory()) files.push(...await findSessionFiles(entryPath, maxDepth - 1));
		else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(entryPath);
	}
	return files;
}
function readSessionMetaCwd(line) {
	try {
		const parsed = JSON.parse(line);
		if (!isRecord(parsed) || parsed.type !== "session_meta" || !isRecord(parsed.payload)) return;
		return typeof parsed.payload.cwd === "string" && parsed.payload.cwd.trim() ? parsed.payload.cwd.trim() : void 0;
	} catch {
		return;
	}
}
function readResponseItemMessageText(parsed) {
	if (parsed.type !== "response_item" || !isRecord(parsed.payload)) return;
	if (parsed.payload.type !== "message") return;
	if ((typeof parsed.payload.role === "string" ? parsed.payload.role : "") !== "user") return;
	const parts = (Array.isArray(parsed.payload.content) ? parsed.payload.content : []).flatMap((entry) => {
		if (!isRecord(entry)) return [];
		const text = typeof entry.text === "string" ? entry.text : typeof entry.input_text === "string" ? entry.input_text : void 0;
		return text?.trim() ? [text.trim()] : [];
	});
	return parts.length > 0 ? parts.join(" ") : void 0;
}
function readSessionIdFromFilename(file) {
	return path.basename(file).match(/[0-9a-f]{8}-[0-9a-f-]{27,}/iu)?.[0];
}
async function resolveCodexCliNode(params) {
	const list = await params.runtime.nodes.list(params.requestedNode ? void 0 : { connected: true });
	const requested = params.requestedNode?.trim();
	const candidates = list.nodes.filter((node) => {
		if (requested) return [
			node.nodeId,
			node.displayName,
			node.remoteIp
		].some((value) => value === requested);
		return node.connected === true && node.commands?.includes(params.command);
	});
	if (candidates.length === 0) throw new Error(requested ? `Codex CLI node ${requested} was not found.` : "No connected node exposes Codex CLI session commands.");
	const usable = candidates.filter((node) => node.commands?.includes(params.command));
	if (usable.length === 0) throw new Error(`Node ${requested ?? "candidate"} does not expose ${params.command}.`);
	if (usable.length > 1) throw new Error("Multiple Codex CLI-capable nodes connected. Pass --host <node-id>.");
	return expectDefined(usable[0], "single usable Codex CLI node");
}
function parseCodexCliSessionsListResult(raw) {
	const payload = unwrapNodeInvokePayload$1(raw);
	if (!isRecord(payload) || !Array.isArray(payload.sessions)) throw new Error("Codex CLI session list returned an invalid payload.");
	return {
		codexHome: typeof payload.codexHome === "string" ? payload.codexHome : "",
		sessions: payload.sessions.flatMap((entry) => {
			if (!isRecord(entry) || typeof entry.sessionId !== "string") return [];
			return [{
				sessionId: entry.sessionId,
				updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : void 0,
				lastMessage: typeof entry.lastMessage === "string" ? entry.lastMessage : void 0,
				cwd: typeof entry.cwd === "string" ? entry.cwd : void 0,
				sessionFile: typeof entry.sessionFile === "string" ? entry.sessionFile : void 0,
				messageCount: typeof entry.messageCount === "number" && Number.isFinite(entry.messageCount) ? entry.messageCount : 0
			}];
		})
	};
}
function unwrapNodeInvokePayload$1(raw) {
	const record = isRecord(raw) ? raw : {};
	if (typeof record.payloadJSON === "string" && record.payloadJSON.trim()) try {
		return JSON.parse(record.payloadJSON);
	} catch (error) {
		throw new Error("Codex CLI node command returned malformed payloadJSON.", { cause: error });
	}
	if ("payload" in record) return record.payload;
	return raw;
}
function readRecordParam(paramsJSON) {
	if (!paramsJSON?.trim()) return {};
	try {
		const parsed = JSON.parse(paramsJSON);
		return isRecord(parsed) ? parsed : {};
	} catch {
		return {};
	}
}
function resolveCodexHome() {
	return process$1.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
}
async function readFirstLine(file) {
	let firstLine;
	return (await visitJsonlLines(file, (line) => {
		firstLine = line;
		return false;
	}, 65536)).ok ? firstLine : void 0;
}
async function readFileMtimeIso(file) {
	try {
		return (await fs.stat(file)).mtime.toISOString();
	} catch {
		return;
	}
}
function normalizeLimit$1(value) {
	return typeof value === "number" && Number.isFinite(value) ? Math.min(MAX_SESSION_LIMIT, Math.max(1, Math.floor(value))) : DEFAULT_SESSION_LIMIT;
}
function normalizeTimeoutMs(value) {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(36e5, Math.floor(value)) : DEFAULT_RESUME_TIMEOUT_MS;
}
function truncateText(value, max) {
	if (value.length <= max) return value;
	return `${truncateUtf16Safe(value, Math.max(0, max - 3))}...`;
}
function compareOptionalStringsDesc(a, b) {
	return (b ?? "").localeCompare(a ?? "");
}
function readNodeId(node) {
	if (!node.nodeId) throw new Error("Codex CLI node did not include a node id.");
	return node.nodeId;
}
function formatNodeLabel(node) {
	return [
		node.displayName,
		node.nodeId,
		node.remoteIp
	].filter(Boolean).join(" / ") || "node";
}
//#endregion
//#region extensions/codex/src/command-rpc.ts
async function prepareControlAuth(options, startOptions) {
	if (!options.onResponse || !options.config || !options.sessionKey || options.authProfileId === null || startOptions.homeScope === "user") return {
		authProfileId: options.authProfileId ?? void 0,
		clientOptions: { authProfileId: options.authProfileId }
	};
	const config = options.config;
	const { sessionAgentId } = resolveSessionAgentIdsStrict({
		config,
		sessionKey: options.sessionKey,
		agentId: options.agentId
	});
	const agentDir = options.agentDir ?? resolveAgentDir$1(config, sessionAgentId);
	const workspaceDir = resolveAgentWorkspaceDir(config, sessionAgentId);
	const entry = getSessionEntry({
		agentId: sessionAgentId,
		storePath: resolveStorePath(config.session?.store, { agentId: sessionAgentId }),
		sessionKey: options.sessionKey,
		hydrateSkillPromptRefs: false,
		readConsistency: "latest"
	});
	const model = resolveSessionModelRef(config, entry, sessionAgentId);
	const store = resolveCodexAppServerAuthProfileStore({
		agentDir,
		config
	});
	const { plan, attempts } = prepareAgentRuntimeAuth({
		provider: model.provider,
		modelId: model.model,
		config,
		agentDir,
		workspaceDir,
		authProfileStore: store,
		sessionAuthProfileId: entry?.authProfileOverride ?? options.authProfileId,
		sessionAuthProfileSource: entry?.authProfileOverrideSource,
		harnessId: "codex",
		harnessAuthBootstrap: "harness"
	});
	const route = plan.modelRoute;
	const resolvedAuth = route ? await resolveApiKeyForProvider({
		provider: route.provider,
		modelId: route.modelId,
		modelApi: route.api,
		cfg: config,
		agentDir,
		workspaceDir,
		store,
		profileId: attempts[0]?.profileId,
		lockedProfile: plan.forwardedAuthProfileSource === "user",
		allowAuthProfileFallback: attempts[0]?.allowAuthProfileFallback,
		skipSetupProviderFallback: true
	}) : void 0;
	const handoff = await resolveCodexAppServerPreparedAuthHandoff({
		authRequirement: route?.authRequirement,
		resolvedApiKey: resolvedAuth?.apiKey,
		authProfileId: route ? plan.forwardedAuthProfileId : resolveCodexAppServerAuthProfileId({
			authProfileId: plan.forwardedAuthProfileId,
			store,
			config
		}),
		authProfileStore: store,
		agentDir,
		homeScope: startOptions.homeScope ?? "agent",
		config,
		subscriptionProfileRequiredError: "Prepared Codex subscription route requires a forwarded OpenAI OAuth or token profile.",
		subscriptionProfileUnusableError: "Prepared Codex subscription auth profile is unusable."
	});
	const binding = handoff.authProfileId ? await prepareCodexAppServerAuthBinding({
		authProfileId: handoff.authProfileId,
		authProfileStore: store,
		agentDir,
		config
	}) : void 0;
	return {
		authProfileId: handoff.authProfileId,
		clientOptions: {
			...handoff.preparedAuth ? { preparedAuth: handoff.preparedAuth } : { authProfileId: handoff.authProfileId },
			authRequirement: route?.authRequirement,
			authProfileStore: binding?.authProfileStore ?? store,
			authBindingFingerprint: binding?.fingerprint,
			agentDir
		}
	};
}
function requestOptions(pluginConfig, limit, config, agentDir) {
	const runtime = resolveCodexAppServerRuntimeOptions({ pluginConfig });
	return {
		limit,
		timeoutMs: runtime.requestTimeoutMs,
		startOptions: runtime.start,
		config,
		agentDir
	};
}
async function codexControlRequest(pluginConfig, method, requestParams, options = {}) {
	const runtime = options.startOptions ? resolveCodexSupervisionAppServerRuntimeOptions({ pluginConfig }) : resolveCodexAppServerRuntimeOptions({ pluginConfig });
	const startOptions = options.startOptions ?? runtime.start;
	const auth = await prepareControlAuth(options, startOptions);
	const controlRequestOptions = {
		timeoutMs: options.timeoutMs ?? runtime.requestTimeoutMs,
		assertCurrent: options.assertCurrent,
		startOptions,
		config: options.config,
		sessionKey: options.sessionKey,
		sessionId: options.sessionId,
		agentDir: options.agentDir,
		isolated: options.isolated,
		...auth.clientOptions
	};
	if (options.onResponse || options.beforeRequest) return await withCodexAppServerJsonClient(controlRequestOptions, async (request, client, scope) => {
		await options.beforeRequest?.(request, client, scope);
		scope.assertCurrent();
		let response;
		if (method === "thread/resume") {
			if (!isJsonObject(requestParams) || typeof requestParams.threadId !== "string") throw new Error("Codex thread/resume requires a thread id.");
			response = await resumeCodexAppServerThread({
				client,
				request: {
					...requestParams,
					threadId: requestParams.threadId
				},
				requestResume: () => request({
					method,
					requestParams
				}),
				abandonClient: () => closeCodexStartupClientBestEffort(client)
			});
		} else response = await request({
			method,
			requestParams
		});
		await options.onResponse?.(response, client, {
			authProfileId: auth.authProfileId,
			assertCurrent: scope.assertCurrent
		});
		scope.assertCurrent();
		return response;
	});
	return await requestCodexAppServerJson({
		method,
		requestParams,
		...controlRequestOptions
	});
}
async function safeCodexControlRequest(pluginConfig, method, requestParams, options = {}) {
	return await safeValue(async () => await codexControlRequest(pluginConfig, method, requestParams, options));
}
async function safeCodexModelList(pluginConfig, limit, config, agentDir) {
	return await safeValue(async () => await listCodexAppServerModels(requestOptions(pluginConfig, limit, config, agentDir)));
}
async function readCodexStatusProbes(pluginConfig, config, agentDir) {
	const [models, account, limits, mcps, skills] = await Promise.all([
		safeCodexModelList(pluginConfig, 20, config, agentDir),
		safeCodexControlRequest(pluginConfig, CODEX_CONTROL_METHODS.account, { refreshToken: false }, {
			config,
			agentDir
		}),
		safeCodexControlRequest(pluginConfig, CODEX_CONTROL_METHODS.rateLimits, void 0, {
			config,
			agentDir
		}),
		safeCodexControlRequest(pluginConfig, CODEX_CONTROL_METHODS.listMcpServers, { limit: 100 }, {
			config,
			agentDir
		}),
		safeCodexControlRequest(pluginConfig, CODEX_CONTROL_METHODS.listSkills, {}, {
			config,
			agentDir
		})
	]);
	return {
		models,
		account,
		limits,
		mcps,
		skills
	};
}
async function safeValue(read) {
	try {
		return {
			ok: true,
			value: await read()
		};
	} catch (error) {
		return {
			ok: false,
			error: describeControlFailure(error)
		};
	}
}
//#endregion
//#region extensions/codex/src/app-server/thread-archive-guard.ts
const DESCENDANT_PAGE_LIMIT = 100;
const MAX_DESCENDANT_PAGES = 100;
const MAX_THREAD_ID_LENGTH = 256;
const MAX_CURSOR_LENGTH$1 = 4096;
function readNextCursor(value) {
	if (value === void 0 || value === null) return;
	if (typeof value !== "string" || !value.trim() || value.length > MAX_CURSOR_LENGTH$1) throw new Error("Codex app-server returned an invalid descendant-list cursor");
	return value;
}
/**
* Native archive includes the spawned subtree. Enumerate that same subtree first so an
* OpenClaw-owned descendant cannot be stopped as an undocumented side effect.
*/
async function assertCodexArchiveDescendantsUnowned(params) {
	const ancestorThreadId = normalizeBoundedOptionalString(params.threadId, MAX_THREAD_ID_LENGTH);
	if (!ancestorThreadId) throw new Error("cannot verify Codex archive descendants for an invalid thread id");
	const seenCursors = /* @__PURE__ */ new Set();
	const seenThreadIds = /* @__PURE__ */ new Set([ancestorThreadId]);
	let cursor;
	for (let pageIndex = 0; pageIndex < MAX_DESCENDANT_PAGES; pageIndex += 1) {
		const response = await params.listPage({
			ancestorThreadId,
			archived: false,
			limit: DESCENDANT_PAGE_LIMIT,
			sortKey: "created_at",
			sortDirection: "desc",
			useStateDbOnly: true,
			...cursor ? { cursor } : {}
		});
		if (!isJsonObject(response) || !Array.isArray(response.data)) throw new Error("Codex app-server returned an invalid descendant-list response");
		if (response.data.length > DESCENDANT_PAGE_LIMIT) throw new Error("Codex app-server exceeded the descendant-list page limit");
		for (const value of response.data) {
			if (!isJsonObject(value)) throw new Error("Codex app-server returned an invalid descendant thread");
			const descendantThreadId = normalizeBoundedOptionalString(value.id, MAX_THREAD_ID_LENGTH);
			if (!descendantThreadId) throw new Error("Codex app-server returned a descendant without a valid thread id");
			if (seenThreadIds.has(descendantThreadId)) throw new Error("Codex app-server returned a cyclic descendant thread list");
			seenThreadIds.add(descendantThreadId);
			await params.assertDescendantIdle(descendantThreadId);
			if (await params.bindingStore.hasOtherThreadOwner(descendantThreadId)) throw new Error("cannot archive a Codex thread while a spawned descendant is owned by an OpenClaw session");
		}
		const nextCursor = readNextCursor(response.nextCursor);
		if (!nextCursor) return;
		if (seenCursors.has(nextCursor)) throw new Error("Codex app-server returned a repeated descendant-list cursor");
		seenCursors.add(nextCursor);
		cursor = nextCursor;
	}
	throw new Error("Codex descendant enumeration exceeded its safety limit");
}
//#endregion
//#region extensions/codex/src/session-catalog-parsing.ts
const DEFAULT_PAGE_LIMIT = 50;
const CODEX_APP_SERVER_THREADS_CAPABILITY = "codex-app-server-threads";
const CODEX_APP_SERVER_THREADS_LIST_COMMAND = "codex.appServer.threads.list.v1";
const CODEX_APP_SERVER_THREAD_TURNS_LIST_COMMAND = "codex.appServer.thread.turns.list.v1";
const CODEX_LOCAL_SESSION_HOST_ID = "gateway:local";
const NODE_INVOKE_TIMEOUT_MS = 65e3;
const MAX_SEARCH_LENGTH = 500;
const MAX_CURSOR_LENGTH = 4096;
const MAX_CURSOR_COUNT = 100;
const MAX_HOST_ID_LENGTH = 256;
const MAX_CWD_LENGTH = 4096;
const MAX_SESSION_NAME_LENGTH = 500;
const MAX_SESSION_PREVIEW_LENGTH = 500;
const MAX_SESSION_KEY_LENGTH = 1024;
const MAX_METADATA_LENGTH = 500;
const MAX_ACTIVE_FLAGS = 16;
const MAX_TRANSCRIPT_PAGE_BYTES = 20971520;
var CatalogParamsError = class extends Error {};
function readControlCursor(value, label) {
	if (value === void 0 || value === null) return;
	if (typeof value !== "string" || !value.trim() || value.length > 4096) throw new CatalogParamsError(`invalid Codex session catalog ${label} cursor`);
	return value;
}
function boundedCatalogString(value, maxLength, overflow = "omit") {
	if (typeof value !== "string") return;
	const normalized = value.trim();
	if (!normalized) return;
	if (normalized.length <= maxLength) return normalized;
	return overflow === "truncate" ? truncateUtf16Safe(normalized, maxLength) : void 0;
}
function catalogPreview(value) {
	if (typeof value !== "string") return;
	return boundedCatalogString(sanitizeTerminalText(value.replace(/\s+/g, " ")), MAX_SESSION_PREVIEW_LENGTH, "truncate");
}
function normalizeInteractiveThreadSource(source) {
	if (CODEX_INTERACTIVE_THREAD_SOURCE_KINDS.some((kind) => kind === source) || CODEX_INTERACTIVE_CUSTOM_THREAD_SOURCES.some((kind) => kind === source)) return source;
	if (isRecord(source) && CODEX_INTERACTIVE_CUSTOM_THREAD_SOURCES.some((kind) => kind === source.custom)) return source.custom;
}
function isInteractiveThreadSource(source) {
	return normalizeInteractiveThreadSource(source) !== void 0;
}
function toCatalogSession(thread, archived) {
	const source = normalizeInteractiveThreadSource(thread.source);
	if (!source) return;
	const record = thread;
	const threadId = boundedCatalogString(thread.id, 256);
	if (!threadId) return;
	const activeFlags = thread.status?.type === "active" ? thread.status.activeFlags?.flatMap((flag) => {
		const normalized = boundedCatalogString(flag, 128);
		return normalized ? [normalized] : [];
	}).slice(0, MAX_ACTIVE_FLAGS) : void 0;
	const gitInfo = isRecord(record.gitInfo) ? record.gitInfo : void 0;
	const sessionId = boundedCatalogString(thread.sessionId, 256);
	const name = boundedCatalogString(thread.name, MAX_SESSION_NAME_LENGTH, "truncate");
	const fallbackName = name ? void 0 : catalogPreview(thread.preview);
	const cwd = boundedCatalogString(thread.cwd, MAX_CWD_LENGTH);
	const modelProvider = boundedCatalogString(record.modelProvider, MAX_METADATA_LENGTH, "truncate");
	const cliVersion = boundedCatalogString(record.cliVersion, MAX_METADATA_LENGTH, "truncate");
	const gitBranch = boundedCatalogString(gitInfo?.branch, MAX_METADATA_LENGTH, "truncate");
	return {
		threadId,
		status: thread.status?.type ?? "notLoaded",
		archived,
		...sessionId ? { sessionId } : {},
		...thread.name === null ? { name: null } : name ? { name } : {},
		...fallbackName ? { fallbackName } : {},
		...cwd ? { cwd } : {},
		...activeFlags?.length ? { activeFlags } : {},
		...typeof thread.createdAt === "number" && Number.isFinite(thread.createdAt) ? { createdAt: thread.createdAt } : {},
		...typeof thread.updatedAt === "number" && Number.isFinite(thread.updatedAt) ? { updatedAt: thread.updatedAt } : {},
		...typeof record.recencyAt === "number" && Number.isFinite(record.recencyAt) ? { recencyAt: record.recencyAt } : record.recencyAt === null ? { recencyAt: null } : {},
		source,
		...modelProvider ? { modelProvider } : {},
		...cliVersion ? { cliVersion } : {},
		...gitBranch ? { gitBranch } : {}
	};
}
function normalizeLimit(value, key) {
	if (value === void 0) return DEFAULT_PAGE_LIMIT;
	if (!Number.isInteger(value) || value < 1 || value > 100) throw new CatalogParamsError(`${key} must be an integer from 1 to 100`);
	return value;
}
function readBoundedOptionalString(params, key, maxLength) {
	const value = params[key];
	if (value === void 0) return;
	if (typeof value !== "string") throw new CatalogParamsError(`${key} must be a string`);
	const trimmed = value.trim();
	if (!trimmed) return;
	if (trimmed.length > maxLength) throw new CatalogParamsError(`${key} must be at most ${maxLength} characters`);
	return trimmed;
}
function requireOnlyKeys(params, allowed) {
	const unknown = Object.keys(params).find((key) => !allowed.has(key));
	if (unknown) throw new CatalogParamsError(`unknown Codex session catalog parameter: ${unknown}`);
}
function readPageParams(value) {
	if (!isRecord(value)) throw new CatalogParamsError("Codex session catalog parameters must be an object");
	const params = value;
	requireOnlyKeys(params, /* @__PURE__ */ new Set([
		"cursor",
		"limit",
		"searchTerm",
		"cwd"
	]));
	const cursor = readBoundedOptionalString(params, "cursor", MAX_CURSOR_LENGTH);
	const searchTerm = readBoundedOptionalString(params, "searchTerm", MAX_SEARCH_LENGTH);
	const cwd = readBoundedOptionalString(params, "cwd", MAX_CWD_LENGTH);
	return {
		limit: normalizeLimit(params.limit, "limit"),
		...cursor ? { cursor } : {},
		...searchTerm ? { searchTerm } : {},
		...cwd ? { cwd } : {}
	};
}
function readGatewayParams(value) {
	if (value !== void 0 && !isRecord(value)) throw new CatalogParamsError("Codex session catalog parameters must be an object");
	const params = isRecord(value) ? value : {};
	requireOnlyKeys(params, /* @__PURE__ */ new Set([
		"search",
		"limitPerHost",
		"hostIds",
		"cursors"
	]));
	const search = readBoundedOptionalString(params, "search", MAX_SEARCH_LENGTH);
	let hostIds;
	if (params.hostIds !== void 0) {
		if (!Array.isArray(params.hostIds) || params.hostIds.length > 100) throw new CatalogParamsError(`hostIds must contain at most 100 host ids`);
		hostIds = [...new Set(params.hostIds.map((hostId) => readHostId(hostId)))];
	}
	let cursors;
	if (params.cursors !== void 0) {
		if (!isRecord(params.cursors)) throw new CatalogParamsError("cursors must be an object");
		const entries = Object.entries(params.cursors);
		if (entries.length > MAX_CURSOR_COUNT) throw new CatalogParamsError(`cursors may contain at most ${MAX_CURSOR_COUNT} hosts`);
		cursors = {};
		for (const [hostId, cursor] of entries) {
			const normalizedHostId = hostId.trim();
			if (normalizedHostId.length === 0 || normalizedHostId.length > MAX_HOST_ID_LENGTH || !normalizedHostId.startsWith("gateway:") && !normalizedHostId.startsWith("node:")) throw new CatalogParamsError(`invalid Codex session catalog host id: ${hostId}`);
			if (typeof cursor !== "string" || !cursor.trim() || cursor.trim().length > 4096) throw new CatalogParamsError(`invalid cursor for Codex session catalog host: ${hostId}`);
			cursors[normalizedHostId] = cursor.trim();
		}
	}
	return {
		limitPerHost: normalizeLimit(params.limitPerHost, "limitPerHost"),
		...search ? { search } : {},
		...hostIds && hostIds.length > 0 ? { hostIds } : {},
		...cursors && Object.keys(cursors).length > 0 ? { cursors } : {}
	};
}
function readHostId(value) {
	if (typeof value !== "string") throw new CatalogParamsError("Codex session catalog host ids must be strings");
	const hostId = value.trim();
	if (hostId.length === 0 || hostId.length > MAX_HOST_ID_LENGTH || !hostId.startsWith("gateway:") && !hostId.startsWith("node:")) throw new CatalogParamsError(`invalid Codex session catalog host id: ${value}`);
	return hostId;
}
function parseJsonParams(paramsJSON) {
	if (!paramsJSON?.trim()) return {};
	try {
		return JSON.parse(paramsJSON);
	} catch (error) {
		throw new Error("Codex session catalog parameters must be valid JSON", { cause: error });
	}
}
function parseOptionalCatalogString(value, field, maxLength) {
	if (value === void 0) return;
	if (typeof value !== "string" || value.length > maxLength) throw new Error(`Codex session catalog returned an invalid ${field}`);
	return value;
}
function parseCatalogSession(value, options = {}) {
	if (!isRecord(value) || typeof value.threadId !== "string" || !value.threadId.trim() || value.threadId.length > 256 || value.archived !== false) throw new Error("Codex session catalog returned an invalid session");
	const status = parseOptionalCatalogString(value.status, "status", 64);
	if (!status?.trim()) throw new Error("Codex session catalog returned an invalid status");
	if (value.activeFlags !== void 0 && !Array.isArray(value.activeFlags)) throw new Error("Codex session catalog returned invalid active flags");
	if (Array.isArray(value.activeFlags) && value.activeFlags.length > MAX_ACTIVE_FLAGS) throw new Error("Codex session catalog returned too many active flags");
	const activeFlags = Array.isArray(value.activeFlags) ? value.activeFlags.map((entry) => {
		const flag = parseOptionalCatalogString(entry, "active flag", 128);
		if (flag === void 0) throw new Error("Codex session catalog returned an invalid active flag");
		return flag;
	}) : void 0;
	const sessionId = parseOptionalCatalogString(value.sessionId, "session id", 256);
	const name = value.name === null ? null : parseOptionalCatalogString(value.name, "session name", MAX_SESSION_NAME_LENGTH);
	const fallbackName = parseOptionalCatalogString(value.fallbackName, "session fallback name", MAX_SESSION_PREVIEW_LENGTH);
	const cwd = parseOptionalCatalogString(value.cwd, "cwd", MAX_CWD_LENGTH);
	const source = parseOptionalCatalogString(value.source, "source", MAX_METADATA_LENGTH);
	const modelProvider = parseOptionalCatalogString(value.modelProvider, "model provider", MAX_METADATA_LENGTH);
	const cliVersion = parseOptionalCatalogString(value.cliVersion, "CLI version", MAX_METADATA_LENGTH);
	const gitBranch = parseOptionalCatalogString(value.gitBranch, "Git branch", MAX_METADATA_LENGTH);
	const sessionKey = options.allowSessionKey ? parseOptionalCatalogString(value.sessionKey, "OpenClaw session key", MAX_SESSION_KEY_LENGTH) : void 0;
	const createdAt = asFiniteNumber(value.createdAt);
	const updatedAt = asFiniteNumber(value.updatedAt);
	const recencyAt = value.recencyAt === null ? null : asFiniteNumber(value.recencyAt);
	return {
		threadId: value.threadId,
		status,
		archived: value.archived,
		...sessionId !== void 0 ? { sessionId } : {},
		...name !== void 0 ? { name } : {},
		...fallbackName !== void 0 ? { fallbackName } : {},
		...cwd !== void 0 ? { cwd } : {},
		...activeFlags && activeFlags.length > 0 ? { activeFlags } : {},
		...createdAt !== void 0 ? { createdAt } : {},
		...updatedAt !== void 0 ? { updatedAt } : {},
		...recencyAt !== void 0 ? { recencyAt } : {},
		...source !== void 0 ? { source } : {},
		...modelProvider !== void 0 ? { modelProvider } : {},
		...cliVersion !== void 0 ? { cliVersion } : {},
		...gitBranch !== void 0 ? { gitBranch } : {},
		...sessionKey !== void 0 ? { sessionKey } : {}
	};
}
function parseCatalogPage(value, options = {}) {
	if (!isRecord(value) || !Array.isArray(value.sessions) || value.sessions.length > 100) throw new Error("Codex session catalog returned an invalid page");
	const nextCursor = parseOptionalCatalogString(value.nextCursor, "next cursor", MAX_CURSOR_LENGTH);
	const backwardsCursor = parseOptionalCatalogString(value.backwardsCursor, "backwards cursor", MAX_CURSOR_LENGTH);
	return {
		sessions: value.sessions.map((session) => parseCatalogSession(session, options)),
		...nextCursor ? { nextCursor } : {},
		...backwardsCursor ? { backwardsCursor } : {}
	};
}
function filterCatalogPageByTitle(page, searchTerm) {
	if (!searchTerm) return page;
	return {
		...page,
		sessions: page.sessions.filter((session) => (session.name ?? session.fallbackName)?.toLocaleLowerCase().includes(searchTerm.toLocaleLowerCase()))
	};
}
function unwrapNodeInvokePayload(value) {
	if (!isRecord(value)) return value;
	if (typeof value.payloadJSON === "string" && value.payloadJSON.trim()) try {
		return JSON.parse(value.payloadJSON);
	} catch (error) {
		throw new Error("Codex node returned malformed session catalog JSON", { cause: error });
	}
	return "payload" in value ? value.payload : value;
}
function catalogErrorDetail(error) {
	if (error instanceof Error) return error.message.trim();
	if (typeof error === "string") return error.trim();
	if (error && typeof error === "object" && "message" in error) {
		const message = error.message;
		return typeof message === "string" ? message.trim() : "";
	}
	return "";
}
function catalogError(code, error) {
	const summary = {
		APP_SERVER_UNAVAILABLE: "Codex app-server is unavailable on this host",
		NODE_INVOKE_FAILED: "The paired node could not return its Codex session catalog",
		NODE_LIST_FAILED: "Paired nodes could not be listed"
	}[code] ?? "Codex session catalog request failed";
	const detail = code === "NODE_LIST_FAILED" ? catalogErrorDetail(error) : "";
	return {
		code,
		message: detail && detail !== summary ? `${summary}: ${detail}` : summary
	};
}
function parseTranscriptPage(value) {
	if (!isRecord(value) || !Array.isArray(value.data) || value.data.length > 50 || value.data.some((turn) => !isRecord(turn) || !Array.isArray(turn.items) || turn.items.some((item) => !isRecord(item)))) throw new Error("Codex app-server returned an invalid transcript page");
	const nextCursor = readControlCursor(value.nextCursor, "transcript next response");
	const backwardsCursor = readControlCursor(value.backwardsCursor, "transcript backwards response");
	const page = {
		data: value.data,
		...nextCursor ? { nextCursor } : {},
		...backwardsCursor ? { backwardsCursor } : {}
	};
	if (Buffer.byteLength(JSON.stringify(page), "utf8") > MAX_TRANSCRIPT_PAGE_BYTES) throw new Error("Codex app-server transcript page exceeds the safe response size");
	return page;
}
function requireBoundThread(entry) {
	if (!entry.boundThreadId) throw new CatalogParamsError("Codex adoption is missing its bound thread. Retry.");
	return entry.boundThreadId;
}
//#endregion
//#region extensions/codex/src/session-catalog-node-adoption.ts
const CODEX_NODE_SESSION_KEY_PREFIX = "harness:codex:node-session:";
const continueOperations = /* @__PURE__ */ new Map();
const sessionActionTails = /* @__PURE__ */ new Map();
async function runSessionActionExclusive(threadId, run) {
	const operation = (sessionActionTails.get(threadId) ?? Promise.resolve()).then(run);
	const tail = operation.then(() => void 0, () => void 0);
	sessionActionTails.set(threadId, tail);
	try {
		return await operation;
	} finally {
		if (sessionActionTails.get(threadId) === tail) sessionActionTails.delete(threadId);
	}
}
function adoptionSessionKeyRest(sessionKey) {
	const trimmed = sessionKey.trim();
	return parseAgentSessionKey(trimmed)?.rest ?? trimmed;
}
function nodeAdoptionSessionKey(hostId, threadId) {
	const source = JSON.stringify([hostId, threadId]);
	return sessionCatalogAdoptedSessionKey(CODEX_NODE_SESSION_KEY_PREFIX, source);
}
function readNodeSessionMarker(entry) {
	const codex = isRecord(entry.pluginExtensions?.codex) ? entry.pluginExtensions.codex : void 0;
	const marker = codex && isRecord(codex.sessionCatalog) ? codex.sessionCatalog : void 0;
	if (!marker || typeof marker.sourceHostId !== "string" || !marker.sourceHostId.startsWith("node:") || typeof marker.sourceThreadId !== "string" || !marker.sourceThreadId.trim() || typeof marker.nodeId !== "string" || !marker.nodeId.trim()) return;
	return {
		sourceHostId: marker.sourceHostId,
		sourceThreadId: marker.sourceThreadId,
		nodeId: marker.nodeId,
		...marker.initializing === true ? { initializing: true } : {}
	};
}
function listNodeAdoptedSessionEntries(params) {
	const adopted = /* @__PURE__ */ new Map();
	for (const { agentId, entry, sessionKey } of listSessionCatalogEntries({
		...params.agentId ? { agentId: params.agentId } : {},
		config: params.config ?? {},
		runtime: params.runtime,
		sessionEntries: params.sessionEntries
	})) {
		const marker = readNodeSessionMarker(entry);
		const sessionId = entry.sessionId?.trim();
		if (!marker || marker.initializing === true && params.includeInitializing !== true || entry.initializationPending === true || entry.agentHarnessId !== "codex" || entry.modelSelectionLocked !== true || !sessionId || adoptionSessionKeyRest(sessionKey) !== nodeAdoptionSessionKey(marker.sourceHostId, marker.sourceThreadId) || marker.sourceHostId !== `node:${marker.nodeId}`) continue;
		const sourceKey = sessionCatalogAdoptedSourceKey(marker.sourceHostId, marker.sourceThreadId);
		if (adopted.has(sourceKey)) throw new Error(`multiple OpenClaw sessions adopt Codex thread ${marker.sourceThreadId} on ${marker.sourceHostId}`);
		adopted.set(sourceKey, {
			key: sessionKey,
			sessionId,
			agentId,
			...marker.initializing === true ? { initializing: true } : {}
		});
	}
	return adopted;
}
function findNodeAdoptedSessionEntry(params) {
	return listNodeAdoptedSessionEntries(params).get(sessionCatalogAdoptedSourceKey(params.hostId, params.threadId));
}
function nodeSessionMarker(params) {
	return {
		sourceHostId: params.hostId,
		sourceThreadId: params.threadId,
		nodeId: params.nodeId,
		...params.initializing === true ? { initializing: true } : {}
	};
}
async function finalizeNodeAdoptedSession(params) {
	const changedError = () => new CatalogParamsError("Codex OpenClaw session changed before it could be bound. Retry.");
	let finalized;
	try {
		finalized = await params.api.runtime.agent.session.patchSessionEntry({
			sessionKey: params.adopted.key,
			readConsistency: "latest",
			preserveActivity: true,
			update: (entry) => {
				const current = readNodeSessionMarker(entry);
				if (entry.sessionId?.trim() !== params.adopted.sessionId || entry.initializationPending === true || entry.agentHarnessId !== "codex" || entry.modelSelectionLocked !== true || !current || current.sourceHostId !== params.marker.sourceHostId || current.sourceThreadId !== params.marker.sourceThreadId || current.nodeId !== params.marker.nodeId) throw changedError();
				if (current.initializing !== true) return { archivedAt: void 0 };
				const codex = isRecord(entry.pluginExtensions?.codex) ? entry.pluginExtensions.codex : {};
				return {
					archivedAt: void 0,
					pluginExtensions: {
						...entry.pluginExtensions,
						codex: {
							...codex,
							sessionCatalog: params.marker
						}
					}
				};
			}
		});
	} catch (error) {
		const currentEntry = params.api.runtime.agent.session.getSessionEntry({
			sessionKey: params.adopted.key,
			readConsistency: "latest"
		});
		const current = currentEntry ? readNodeSessionMarker(currentEntry) : void 0;
		if (currentEntry?.sessionId?.trim() === params.adopted.sessionId && current?.initializing !== true && current?.sourceHostId === params.marker.sourceHostId && current.sourceThreadId === params.marker.sourceThreadId && current.nodeId === params.marker.nodeId) return;
		throw error;
	}
	if (!finalized) throw changedError();
}
async function createOrReuseNodeAdoptedSession(params) {
	const existing = findNodeAdoptedSessionEntry({
		agentId: params.agentId,
		config: params.config,
		runtime: params.api.runtime,
		hostId: params.hostId,
		threadId: params.record.threadId,
		includeInitializing: true
	});
	if (existing) return existing;
	const initializingMarker = {
		...nodeSessionMarker({
			hostId: params.hostId,
			threadId: params.record.threadId,
			nodeId: params.nodeId
		}),
		initializing: true
	};
	try {
		const created = await params.api.runtime.agent.session.createSessionEntry({
			cfg: params.config,
			key: nodeAdoptionSessionKey(params.hostId, params.record.threadId),
			agentId: params.agentId,
			recoverMatchingInitialEntry: true,
			displayName: params.record.name ?? void 0,
			...params.record.cwd?.trim() ? { spawnedCwd: params.record.cwd.trim() } : {},
			initialEntry: {
				agentHarnessId: "codex",
				modelSelectionLocked: true,
				pluginExtensions: { codex: { sessionCatalog: initializingMarker } }
			},
			afterCreate: async (entry) => {
				const storePath = resolveStorePath(params.config.session?.store, { agentId: entry.agentId });
				await importCodexThreadHistoryToTranscript({
					thread: params.history.thread,
					throughTurnId: params.history.throughTurnId,
					storePath,
					sessionId: entry.sessionId,
					sessionKey: entry.key,
					agentId: entry.agentId,
					...params.record.cwd?.trim() ? { cwd: params.record.cwd.trim() } : {},
					modelProvider: params.record.modelProvider,
					config: params.config
				});
				return { pluginExtensions: { codex: { sessionCatalog: initializingMarker } } };
			}
		});
		return {
			key: created.key,
			sessionId: created.sessionId,
			agentId: created.agentId,
			initializing: true
		};
	} catch (error) {
		const raced = findNodeAdoptedSessionEntry({
			agentId: params.agentId,
			config: params.config,
			runtime: params.api.runtime,
			hostId: params.hostId,
			threadId: params.record.threadId,
			includeInitializing: true
		});
		if (raced) return raced;
		throw error;
	}
}
//#endregion
//#region extensions/codex/src/session-catalog-adoption.ts
const CODEX_SUPERVISION_SESSION_KEY_PREFIX = "harness:codex:supervision:";
const boundCatalogSessionId = (value) => boundedCatalogString(value, 256);
function requireIdleThread(thread, action) {
	if (thread.status?.type === "idle" || action === "archive" && thread.status?.type === "notLoaded") return;
	if (thread.status?.type === "active") throw new CatalogParamsError(`Codex session is active in this App Server; wait for it to finish before ${action === "continue" ? "starting a branch" : "archiving"}`);
	throw new CatalogParamsError(action === "archive" ? "Codex session cannot be archived in its current state" : "Codex session cannot start a branch in its current state");
}
function adoptionSessionKey(threadId, sourceHomeId) {
	const source = sourceHomeId ? JSON.stringify([sourceHomeId, threadId]) : threadId;
	return sessionCatalogAdoptedSessionKey(CODEX_SUPERVISION_SESSION_KEY_PREFIX, source);
}
function isAdoptionSessionKeyForThread(sessionKey, threadId, sourceHomeId) {
	return adoptionSessionKeyRest(sessionKey) === adoptionSessionKey(threadId, sourceHomeId);
}
function readCodexSupervisionMarker(entry) {
	const codex = isRecord(entry.pluginExtensions?.codex) ? entry.pluginExtensions.codex : void 0;
	const marker = codex && isRecord(codex.supervision) ? codex.supervision : void 0;
	const sourceThreadId = marker?.sourceThreadId;
	const sourceHomeId = marker?.sourceHomeId;
	if (typeof sourceThreadId !== "string" || !sourceThreadId.trim() || sourceHomeId !== void 0 && (typeof sourceHomeId !== "string" || !sourceHomeId.trim())) return;
	return {
		sourceThreadId: sourceThreadId.trim(),
		...typeof sourceHomeId === "string" ? { sourceHomeId: sourceHomeId.trim() } : {}
	};
}
async function listAdoptedSessionEntries(params) {
	const adopted = /* @__PURE__ */ new Map();
	for (const { agentId, entry, sessionKey } of listSessionCatalogEntries({
		...params.agentId ? { agentId: params.agentId } : {},
		config: params.config ?? {},
		runtime: params.runtime,
		sessionEntries: params.sessionEntries
	})) {
		const sessionKeyRest = adoptionSessionKeyRest(sessionKey);
		const marker = readCodexSupervisionMarker(entry);
		if (!sessionKeyRest.startsWith(CODEX_SUPERVISION_SESSION_KEY_PREFIX) || !marker || entry.initializationPending === true || entry.agentHarnessId !== "codex" || entry.modelSelectionLocked !== true) continue;
		const sessionId = entry.sessionId?.trim();
		if (!sessionId) continue;
		const binding = await params.bindingStore.read(sessionBindingIdentity({
			sessionId,
			sessionKey,
			config: params.config
		}));
		const sourceThreadId = binding?.supervisionSourceThreadId?.trim();
		const boundThreadId = binding?.threadId.trim();
		if (binding?.connectionScope !== "supervision" || !sourceThreadId || !boundThreadId || sessionKeyRest !== adoptionSessionKey(sourceThreadId, marker.sourceHomeId)) continue;
		const sourceKey = sessionCatalogAdoptedSourceKey(marker.sourceHomeId ?? "gateway:local", sourceThreadId);
		if (adopted.has(sourceKey)) throw new Error(`multiple OpenClaw sessions adopt Codex thread ${sourceThreadId} from the same home`);
		adopted.set(sourceKey, {
			key: sessionKey,
			sessionId,
			agentId,
			boundThreadId
		});
	}
	return adopted;
}
async function findAdoptedSessionEntry(params) {
	const adopted = await listAdoptedSessionEntries(params);
	return adopted.get(sessionCatalogAdoptedSourceKey(params.sourceHomeId ?? "gateway:local", params.threadId)) ?? (params.sourceHomeId && params.allowLegacy === true ? adopted.get(sessionCatalogAdoptedSourceKey("gateway:local", params.threadId)) : void 0);
}
function matchesPendingAdoptionBinding(binding, expected) {
	const historyCoveredThrough = binding?.historyCoveredThrough;
	return binding?.threadId === expected.sourceThreadId && binding.connectionScope === "supervision" && binding.supervisionSourceThreadId === expected.sourceThreadId && binding.cwd === expected.cwd && binding.conversationSourceTransferComplete === true && binding.preserveNativeModel === true && binding.pendingSupervisionBranch?.sourceThreadId === expected.sourceThreadId && binding.pendingSupervisionBranch.connectionFingerprint === expected.connectionFingerprint && binding.pendingSupervisionBranch.lastTurnId === expected.lastTurnId && (binding.pendingSupervisionBranch.cleanupThreadIds?.length ?? 0) === 0 && typeof historyCoveredThrough === "string" && Number.isFinite(Date.parse(historyCoveredThrough));
}
async function ensurePendingAdoptionBinding(params) {
	const pending = {
		sourceThreadId: params.sourceThreadId,
		connectionFingerprint: params.connectionFingerprint,
		...params.lastTurnId ? { lastTurnId: params.lastTurnId } : {}
	};
	const ownsGeneration = await reclaimCurrentCodexSessionGeneration({
		assertCurrent: params.initialization.assertCurrent,
		bindingStore: params.bindingStore,
		identity: params.identity,
		config: params.config
	});
	params.initialization.assertCurrent();
	if (!ownsGeneration) throw new Error(`failed to claim the OpenClaw session generation for ${params.sourceThreadId}`);
	const existing = await params.bindingStore.read(params.identity);
	params.initialization.assertCurrent();
	if (existing) {
		if (matchesPendingAdoptionBinding(existing, params)) return;
		throw new Error(`OpenClaw session is already bound to Codex thread ${existing.threadId}`);
	}
	const binding = {
		threadId: params.sourceThreadId,
		connectionScope: "supervision",
		supervisionSourceThreadId: params.sourceThreadId,
		cwd: params.cwd,
		historyCoveredThrough: (/* @__PURE__ */ new Date()).toISOString(),
		conversationSourceTransferComplete: true,
		preserveNativeModel: true,
		pendingSupervisionBranch: pending
	};
	await params.initialization.bind(binding);
}
async function createOrReuseAdoptedSession(params) {
	const runtime = params.api.runtime;
	const lookup = {
		...params,
		runtime,
		threadId: params.sourceThread.id
	};
	const existing = await findAdoptedSessionEntry(lookup);
	if (existing) return existing;
	try {
		const spawnedCwd = params.sourceThread.cwd?.trim() || void 0;
		const pendingLastTurnId = codexLastTerminalTurnId(params.sourceThread, boundCatalogSessionId);
		const marker = {
			sourceThreadId: params.sourceThread.id,
			...params.sourceHomeId ? { sourceHomeId: params.sourceHomeId } : {}
		};
		const created = await createImportedCodexSession({
			runtime: params.api.runtime,
			bindingStore: params.bindingStore,
			config: params.config,
			key: adoptionSessionKey(params.sourceThread.id, params.sourceHomeId),
			agentId: params.agentId,
			displayName: params.sourceThread.name ?? void 0,
			thread: params.sourceThread,
			throughTurnId: pendingLastTurnId ?? null,
			recoverMatchingInitialEntry: true,
			initialEntry: {
				agentHarnessId: "codex",
				modelSelectionLocked: true,
				pluginExtensions: { codex: { supervision: {
					...marker,
					initializing: true,
					modelLocked: true
				} } }
			},
			afterImport: async (entry, initialization) => {
				const identity = sessionBindingIdentity({
					sessionId: entry.sessionId,
					sessionKey: entry.key,
					config: params.config
				});
				await ensurePendingAdoptionBinding({
					bindingStore: params.bindingStore,
					config: params.config,
					identity,
					initialization,
					sourceThreadId: params.sourceThread.id,
					connectionFingerprint: params.connectionFingerprint,
					cwd: spawnedCwd ?? "",
					...pendingLastTurnId ? { lastTurnId: pendingLastTurnId } : {}
				});
				return { pluginExtensions: { codex: { supervision: {
					...marker,
					modelLocked: true
				} } } };
			}
		});
		return {
			key: created.key,
			sessionId: created.sessionId,
			agentId: created.agentId,
			boundThreadId: params.sourceThread.id
		};
	} catch (error) {
		const raced = await findAdoptedSessionEntry(lookup);
		if (raced) return raced;
		throw error;
	}
}
async function continueLocalCodexSessionInner(params) {
	await params.control.requireEligibleThread(params.threadId);
	const existing = await findAdoptedSessionEntry({
		...params,
		runtime: params.api.runtime
	});
	if (existing) {
		const boundThreadId = requireBoundThread(existing);
		const boundThread = await params.control.readThread(boundThreadId, true);
		if (boundThread.id !== boundThreadId) throw new Error("Codex app-server returned a different thread than requested");
		const changedError = () => new CatalogParamsError("Codex OpenClaw session changed before it could be opened. Retry.");
		if (!await params.api.runtime.agent.session.patchSessionEntry({
			sessionKey: existing.key,
			readConsistency: "latest",
			preserveActivity: true,
			update: (entry) => {
				if (entry.sessionId?.trim() !== existing.sessionId || entry.initializationPending === true || entry.agentHarnessId !== "codex" || entry.modelSelectionLocked !== true) throw changedError();
				return { archivedAt: void 0 };
			}
		})) throw changedError();
		const connectionFingerprint = params.control.connectionFingerprint;
		if (connectionFingerprint) params.onContinued?.({
			connectionFingerprint,
			...codexUpstreamBaseline(boundThread, boundCatalogSessionId)
		});
		return {
			sessionKey: existing.key,
			disposition: "existing"
		};
	}
	const sourceThread = await params.control.readThread(params.threadId, true);
	if (sourceThread.id !== params.threadId) throw new Error("Codex app-server returned a different thread than requested");
	if (sourceThread.status?.type !== "notLoaded") requireIdleThread(sourceThread, "continue");
	const connectionFingerprint = params.control.connectionFingerprint;
	if (!connectionFingerprint) throw new Error("Codex Continue requires a pinned app-server connection");
	const adopted = await createOrReuseAdoptedSession({
		...params,
		sourceThread,
		connectionFingerprint
	});
	const boundThreadId = requireBoundThread(adopted);
	const baselineThread = boundThreadId === sourceThread.id ? sourceThread : await params.control.readThread(boundThreadId, true);
	if (baselineThread.id !== boundThreadId) throw new Error("Codex app-server returned a different thread than requested");
	params.onContinued?.({
		connectionFingerprint,
		...codexUpstreamBaseline(baselineThread, boundCatalogSessionId)
	});
	return {
		sessionKey: adopted.key,
		disposition: "forked"
	};
}
/** Creates one locked OpenClaw branch whose first harness run forks the Codex source. */
async function continueLocalCodexSession(params) {
	const sourceKey = sessionCatalogAdoptedSourceKey(params.hostId ?? "gateway:local", params.threadId);
	const operationKey = sessionCatalogAdoptedSourceKey(params.agentId, sourceKey);
	const current = continueOperations.get(operationKey);
	if (current) return await current;
	const run = async (control) => await continueLocalCodexSessionInner({
		...params,
		control
	});
	const operation = runSessionActionExclusive(sourceKey, async () => params.control.withPinnedConnection(run));
	continueOperations.set(operationKey, operation);
	try {
		return await operation;
	} finally {
		if (continueOperations.get(operationKey) === operation) continueOperations.delete(operationKey);
	}
}
//#endregion
//#region extensions/codex/src/session-catalog-archive.ts
async function assertNoPendingSupervisionBranch(params) {
	const adoptedEntries = [params.agentId, ...listAgentIds(params.config).filter((agentId) => agentId !== params.agentId)].flatMap((agentId) => params.runtime.agent.session.listSessionEntries({
		agentId,
		readOnly: true
	})).filter((candidate) => isAdoptionSessionKeyForThread(candidate.sessionKey, params.threadId, params.sourceHomeId) || params.sourceHomeId !== void 0 && params.allowLegacy === true && isAdoptionSessionKeyForThread(candidate.sessionKey, params.threadId));
	for (const adopted of adoptedEntries) {
		if (adopted.entry.initializationPending === true) throw new CatalogParamsError("Codex session cannot be archived while its OpenClaw branch is initializing");
		const sessionId = adopted.entry.sessionId?.trim();
		if (!sessionId) continue;
		const binding = await params.bindingStore.read(sessionBindingIdentity({
			sessionId,
			sessionKey: adopted.sessionKey,
			config: params.config
		}));
		if (binding?.connectionScope === "supervision" && binding.supervisionSourceThreadId === params.threadId && binding.pendingSupervisionBranch?.sourceThreadId === params.threadId) throw new CatalogParamsError("Codex session cannot be archived until its OpenClaw branch starts");
	}
}
/** Archives one inactive Gateway-local Codex thread after a fresh status read. */
async function archiveLocalCodexSession(params) {
	return await runSessionActionExclusive(sessionCatalogAdoptedSourceKey(params.hostId ?? "gateway:local", params.threadId), async () => {
		return await params.bindingStore.withThreadArchiveFence(async () => {
			const run = async (control) => {
				await assertNoPendingSupervisionBranch(params);
				await control.requireEligibleThread(params.threadId);
				const thread = await control.readThread(params.threadId, false);
				if (thread.id !== params.threadId) throw new Error("Codex app-server returned a different thread than requested");
				requireIdleThread(thread, "archive");
				if (await params.bindingStore.hasOtherThreadOwner(params.threadId)) throw new CatalogParamsError("Codex session cannot be archived while it is attached to an OpenClaw session");
				await assertCodexArchiveDescendantsUnowned({
					bindingStore: params.bindingStore,
					threadId: params.threadId,
					listPage: (request) => control.listDescendantPage(request),
					assertDescendantIdle: async (descendantThreadId) => {
						const descendant = await control.readThread(descendantThreadId, false);
						if (descendant.id !== descendantThreadId) throw new Error("Codex app-server returned a different descendant than requested");
						requireIdleThread(descendant, "archive");
					}
				});
				await control.archiveThread(params.threadId);
				return { archived: true };
			};
			return await params.control.withPinnedConnection(run);
		});
	});
}
//#endregion
//#region extensions/codex/src/session-catalog-create.ts
const CODEX_AGENT_RUNTIME_ID = "codex";
const CODEX_CATALOG_DEFAULT_MODEL_REF = "openai/gpt-5.6-sol";
function resolveCodexCatalogCreateSession(config, requestedAgentId) {
	if (!config) return;
	const agentId = requestedAgentId ?? resolveDefaultAgentId(config);
	const defaultModel = resolveDefaultModelForAgent({
		cfg: config,
		agentId
	});
	return "error" in resolveAllowedModelRef({
		cfg: config,
		catalog: [],
		raw: CODEX_CATALOG_DEFAULT_MODEL_REF,
		defaultProvider: defaultModel.provider,
		defaultModel: defaultModel.model,
		agentId
	}) ? void 0 : {
		model: CODEX_CATALOG_DEFAULT_MODEL_REF,
		agentRuntime: CODEX_AGENT_RUNTIME_ID
	};
}
//#endregion
//#region extensions/codex/src/session-catalog-node-continue.ts
const CODEX_NODE_CONTINUE_COMMANDS = [
	CODEX_APP_SERVER_THREADS_LIST_COMMAND,
	CODEX_APP_SERVER_THREAD_TURNS_LIST_COMMAND,
	CODEX_CLI_SESSION_RESUME_COMMAND
];
const NODE_CATALOG_LIST_RESPONSE_TIMEOUT_MS = 8e3;
const continueNodeAdoption = createSessionCatalogAdoptionCoordinator();
function nodeLabel(node) {
	return node.displayName?.trim() || node.remoteIp?.trim() || node.nodeId;
}
function compareNodeLabels(left, right) {
	const leftLabel = nodeLabel(left);
	const rightLabel = nodeLabel(right);
	if (leftLabel < rightLabel) return -1;
	if (leftLabel > rightLabel) return 1;
	return 0;
}
function canContinueCodexOnNode(node) {
	return node.connected === true && CODEX_NODE_CONTINUE_COMMANDS.every((command) => node.commands?.includes(command) === true && node.invocableCommands?.includes(command) === true);
}
async function listPairedNode(params) {
	const hostId = `node:${params.node.nodeId}`;
	const common = {
		hostId,
		label: nodeLabel(params.node),
		kind: "node",
		nodeId: params.node.nodeId,
		canContinueCodex: canContinueCodexOnNode(params.node),
		...params.terminalCapabilities
	};
	if (params.node.connected !== true) {
		const host = {
			...common,
			connected: false,
			sessions: [],
			error: {
				code: "NODE_OFFLINE",
				message: "Paired node is offline"
			}
		};
		params.onHost?.(host);
		return host;
	}
	if (!params.node.commands?.includes("codex.appServer.threads.list.v1")) {
		const host = {
			...common,
			connected: true,
			sessions: []
		};
		params.onHost?.(host);
		return host;
	}
	const eventualHost = Promise.resolve().then(async () => {
		const page = filterCatalogPageByTitle(parseCatalogPage(unwrapNodeInvokePayload(await params.runtime.nodes.invoke({
			nodeId: params.node.nodeId,
			command: CODEX_APP_SERVER_THREADS_LIST_COMMAND,
			params: {
				agentId: params.agentId,
				cursor: params.query.cursors?.[hostId],
				limit: params.query.limitPerHost,
				searchTerm: params.query.search
			},
			timeoutMs: NODE_INVOKE_TIMEOUT_MS,
			scopes: ["operator.write"]
		}))), params.query.search);
		return {
			...common,
			connected: true,
			...page,
			sessions: page.sessions.map((session) => {
				const adopted = params.adoptedSessions.get(sessionCatalogAdoptedSourceKey(hostId, session.threadId));
				return adopted ? Object.assign({}, session, { sessionKey: adopted.key }) : session;
			})
		};
	}).catch((error) => ({
		...common,
		connected: true,
		sessions: [],
		error: catalogError("NODE_INVOKE_FAILED", error)
	}));
	if (params.onHost) eventualHost.then(params.onHost).catch(() => void 0);
	try {
		return await withTimeout(eventualHost, NODE_CATALOG_LIST_RESPONSE_TIMEOUT_MS, "paired node Codex session catalog timed out");
	} catch (error) {
		return {
			...common,
			connected: true,
			sessions: [],
			error: catalogError("NODE_INVOKE_FAILED", error)
		};
	}
}
async function requireNodeForCodexContinue(params) {
	const nodeId = params.hostId.slice(5).trim();
	if (!nodeId || params.hostId !== `node:${nodeId}`) throw new CatalogParamsError("Codex session catalog hostId is invalid");
	const node = (await params.runtime.nodes.list()).nodes.find((candidate) => candidate.nodeId === nodeId);
	if (!node || !canContinueCodexOnNode(node)) throw new CatalogParamsError("paired node does not permit Codex session continuation");
	return {
		node,
		nodeId
	};
}
async function resolveNodeCodexRecord(params) {
	let cursor;
	const seenCursors = /* @__PURE__ */ new Set();
	for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
		const page = parseCatalogPage(unwrapNodeInvokePayload(await params.runtime.nodes.invoke({
			nodeId: params.nodeId,
			command: CODEX_APP_SERVER_THREADS_LIST_COMMAND,
			params: {
				agentId: params.agentId,
				limit: 100,
				...cursor ? { cursor } : {}
			},
			timeoutMs: NODE_INVOKE_TIMEOUT_MS,
			scopes: ["operator.write"]
		})));
		const record = page.sessions.find((candidate) => candidate.threadId === params.threadId);
		if (record) return record;
		const nextCursor = page.nextCursor?.trim();
		if (!nextCursor) break;
		if (seenCursors.has(nextCursor)) throw new CatalogParamsError("Codex session eligibility could not be verified");
		seenCursors.add(nextCursor);
		cursor = nextCursor;
	}
	throw new CatalogParamsError("Codex session is unavailable on the paired node");
}
function requireContinuableNodeRecord(record) {
	if (record.archived) throw new CatalogParamsError("Codex session is archived on the paired node");
	if (!isInteractiveThreadSource(record.source)) throw new CatalogParamsError("Codex session is not a non-archived interactive Codex session");
	if (record.status === "idle" || record.status === "notLoaded") return;
	if (record.status === "active") throw new CatalogParamsError("Codex session is active on the paired node; wait for it to finish before continuing");
	throw new CatalogParamsError("Codex session cannot be continued in its current state");
}
async function readNodeCodexHistory(params) {
	const page = parseTranscriptPage(unwrapNodeInvokePayload(await params.runtime.nodes.invoke({
		nodeId: params.nodeId,
		command: CODEX_APP_SERVER_THREAD_TURNS_LIST_COMMAND,
		params: {
			agentId: params.agentId,
			threadId: params.record.threadId,
			limit: 50
		},
		timeoutMs: NODE_INVOKE_TIMEOUT_MS,
		scopes: ["operator.write"]
	})));
	const thread = {
		id: params.record.threadId,
		createdAt: params.record.createdAt ?? 0,
		modelProvider: params.record.modelProvider ?? "openai",
		projectId: null,
		turns: page.data.toReversed()
	};
	return {
		thread,
		throughTurnId: codexLastTerminalTurnId(thread, (value) => boundedCatalogString(value, 256)) ?? null
	};
}
async function continueNodeCodexSessionInner(params) {
	const { nodeId } = await requireNodeForCodexContinue({
		runtime: params.api.runtime,
		hostId: params.hostId
	});
	const record = await resolveNodeCodexRecord({
		agentId: params.agentId,
		runtime: params.api.runtime,
		nodeId,
		threadId: params.threadId
	});
	requireContinuableNodeRecord(record);
	const existing = findNodeAdoptedSessionEntry({
		agentId: params.agentId,
		config: params.config,
		runtime: params.api.runtime,
		hostId: params.hostId,
		threadId: params.threadId,
		includeInitializing: true
	});
	let adopted;
	let disposition;
	if (existing) {
		adopted = existing;
		disposition = "existing";
	} else {
		const history = await readNodeCodexHistory({
			agentId: params.agentId,
			runtime: params.api.runtime,
			nodeId,
			record
		});
		adopted = await createOrReuseNodeAdoptedSession({
			agentId: params.agentId,
			api: params.api,
			config: params.config,
			hostId: params.hostId,
			nodeId,
			record,
			history
		});
		disposition = "forked";
	}
	const marker = nodeSessionMarker({
		hostId: params.hostId,
		threadId: params.threadId,
		nodeId
	});
	return {
		sessionKey: adopted.key,
		disposition,
		conversationBinding: {
			summary: "Continue this Codex session on its paired node.",
			detachHint: "Start a new chat to leave the paired-node Codex session.",
			data: createCodexCliNodeConversationBindingData({
				nodeId,
				sessionId: params.threadId,
				agentId: adopted.agentId,
				cwd: record.cwd
			})
		},
		afterConversationBound: async () => await finalizeNodeAdoptedSession({
			api: params.api,
			adopted,
			marker
		})
	};
}
async function continueNodeCodexSession(params) {
	if (params.clientScopes?.includes("operator.admin") !== true) throw new CatalogParamsError("continuing a paired-node Codex session requires operator.admin");
	const nodeId = params.hostId.slice(5).trim();
	if (!nodeId || params.hostId !== `node:${nodeId}`) throw new CatalogParamsError("Codex session catalog hostId is invalid");
	const agentId = resolveSessionAgentIdsStrict({
		config: params.config,
		agentId: params.agentId
	}).sessionAgentId;
	const sourceKey = sessionCatalogAdoptedSourceKey(`node:${nodeId}`, params.threadId);
	const operationKey = sessionCatalogAdoptedSourceKey(agentId, sourceKey);
	return await continueNodeAdoption({
		sourceKey: operationKey,
		findExisting: () => void 0,
		create: () => runSessionActionExclusive(sourceKey, async () => continueNodeCodexSessionInner({
			...params,
			agentId
		})),
		complete: async (continued) => continued
	});
}
//#endregion
//#region extensions/codex/src/session-catalog-terminal.ts
const CODEX_TERMINAL_RESUME_COMMAND = "codex.terminal.resume.v1";
const CODEX_TERMINAL_START_COMMAND = "codex.terminal.start.v1";
function createCodexTerminalStartNodeHostCommand() {
	return {
		command: CODEX_TERMINAL_START_COMMAND,
		cap: CODEX_APP_SERVER_THREADS_CAPABILITY,
		dangerous: false,
		duplex: true,
		isAvailable: ({ env }) => Boolean(resolveNodeHostExecutable("codex", {
			env,
			strategy: "direct"
		})),
		handle: async (paramsJSON, io) => {
			if (!io) throw new Error("Codex terminal command requires duplex transport");
			const params = decodeNodePtyStartParams(paramsJSON);
			const resolution = resolveNodeHostExecutable("codex", { strategy: "direct" });
			if (!resolution) throw new Error("Codex CLI is unavailable; install codex on this node and reconnect");
			return JSON.stringify(await runNodePtyCommand({
				file: resolution.executable,
				args: params.initialMessage !== void 0 ? ["--", params.initialMessage] : [],
				cwd: params.cwd,
				requiredCwd: true,
				cols: params.cols,
				rows: params.rows
			}, io));
		}
	};
}
function resolveCodexCatalogTerminalHome(sources) {
	const runtimeConfig = sources.getRuntimeConfig();
	if (!runtimeConfig) throw new Error("OpenClaw runtime config is unavailable");
	const agentDir = sources.source?.agentDir ?? (sources.agentId ? resolveAgentDir$1(runtimeConfig, sources.agentId) : resolveDefaultAgentDir(runtimeConfig));
	const startOptions = sources.source?.appServer.start ?? resolveCodexSupervisionAppServerRuntimeOptions({ pluginConfig: sources.getPluginConfig() }).start;
	return resolveCodexAppServerLocalHomeDir(startOptions, agentDir);
}
function resolveLocalCodexTerminalExecutable(env = process.env) {
	return resolveLocalCodexTerminalResolution(env)?.executable;
}
function resolveLocalCodexTerminalResolution(env = process.env) {
	return resolveNodeHostExecutable("codex", {
		env,
		pathEnv: env.PATH ?? env.Path ?? "",
		strategy: "fallback"
	});
}
function codexNodeTerminalCapability(node) {
	const commands = node.invocableCommands ?? node.commands;
	return {
		canOpenTerminalCodex: node.connected === true && commands?.includes("codex.terminal.resume.v1") === true,
		canStartTerminal: node.connected === true && node.invocableCommands?.includes("codex.terminal.start.v1") === true
	};
}
function createCodexTerminalNodeHostCommand(bindRequest, configSources) {
	return {
		command: CODEX_TERMINAL_RESUME_COMMAND,
		cap: CODEX_APP_SERVER_THREADS_CAPABILITY,
		dangerous: false,
		duplex: true,
		isAvailable: ({ env }) => Boolean(resolveNodeHostExecutable("codex", {
			env,
			pathEnv: env.PATH ?? env.Path ?? "",
			strategy: "direct"
		})),
		handle: async (paramsJSON, io) => {
			if (!io) throw new Error("Codex terminal command requires duplex transport");
			const request = bindRequest(paramsJSON);
			const resume = decodeNodePtyResumeParams(request.paramsJSON, (value) => {
				if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) throw new CatalogParamsError("threadId must be a UUID");
				return value;
			});
			const record = await request.control.requireEligibleThread(resume.threadId);
			const resolution = resolveNodeHostExecutable("codex", {
				env: process.env,
				pathEnv: process.env.PATH ?? process.env.Path ?? "",
				strategy: "direct"
			});
			if (!resolution) throw new Error("Codex CLI is unavailable");
			return JSON.stringify(await runNodePtyCommand({
				file: resolution.executable,
				args: ["resume", resume.threadId],
				...record.cwd ? { cwd: record.cwd } : {},
				env: { CODEX_HOME: resolveCodexCatalogTerminalHome({
					...configSources,
					agentId: request.agentId
				}) },
				cols: resume.cols,
				rows: resume.rows
			}, io));
		}
	};
}
async function resolveNodeCatalogEligibleThread(params) {
	let cursor;
	const seenCursors = /* @__PURE__ */ new Set();
	for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
		const raw = await params.runtime.nodes.invoke({
			nodeId: params.nodeId,
			command: CODEX_APP_SERVER_THREADS_LIST_COMMAND,
			params: {
				agentId: params.agentId,
				limit: 100,
				...cursor ? { cursor } : {}
			},
			timeoutMs: NODE_INVOKE_TIMEOUT_MS,
			scopes: ["operator.write"]
		});
		const page = params.parseCatalogPage(unwrapNodeInvokePayload(raw));
		const record = page.sessions.find((candidate) => candidate.threadId === params.threadId);
		if (record) {
			if (isInteractiveThreadSource(record.source)) return record;
			break;
		}
		const nextCursor = page.nextCursor?.trim();
		if (!nextCursor || seenCursors.has(nextCursor)) break;
		seenCursors.add(nextCursor);
		cursor = nextCursor;
	}
	throw new CatalogParamsError("Codex session is not a non-archived interactive Codex session");
}
async function openCodexCatalogTerminal(params) {
	const title = `codex resume ${params.threadId.slice(0, 8)}…`;
	if (params.hostId === "gateway:local" || params.hostId.startsWith(`gateway:local:`)) {
		const record = await params.control.requireEligibleThread(params.threadId);
		const resolution = resolveLocalCodexTerminalResolution();
		if (!resolution) throw new CatalogParamsError("Codex CLI is unavailable");
		return {
			kind: "local",
			argv: [
				resolution.executable,
				"resume",
				params.threadId
			],
			...record.cwd ? { cwd: record.cwd } : {},
			env: { CODEX_HOME: resolveCodexCatalogTerminalHome(params) },
			...resolution.pathEnv ? { pathEnv: resolution.pathEnv } : {},
			title
		};
	}
	if (!params.hostId.startsWith("node:")) throw new CatalogParamsError("hostId is invalid");
	const nodeId = params.hostId.slice(5);
	if (!(await params.api.runtime.nodes.list()).nodes.find((candidate) => {
		const commands = candidate.invocableCommands ?? candidate.commands;
		return candidate.nodeId === nodeId && candidate.connected === true && commands?.includes("codex.appServer.threads.list.v1") === true && commands.includes("codex.terminal.resume.v1");
	})) throw new CatalogParamsError("paired-node Codex terminal is unavailable");
	const record = await resolveNodeCatalogEligibleThread({
		agentId: params.agentId,
		runtime: params.api.runtime,
		nodeId,
		threadId: params.threadId,
		parseCatalogPage: params.parseCatalogPage
	});
	return {
		kind: "node",
		nodeId,
		command: CODEX_TERMINAL_RESUME_COMMAND,
		paramsJSON: JSON.stringify({
			agentId: params.agentId,
			threadId: params.threadId
		}),
		...record.cwd ? { cwd: record.cwd } : {},
		title
	};
}
async function startCodexCatalogTerminal(params) {
	if (params.nodeId) return {
		kind: "node",
		nodeId: params.nodeId,
		command: CODEX_TERMINAL_START_COMMAND,
		paramsJSON: JSON.stringify({
			cwd: params.cwd,
			initialMessage: params.initialMessage
		}),
		cwd: params.cwd,
		title: "codex"
	};
	const resolution = resolveLocalCodexTerminalResolution();
	if (!resolution) throw new CatalogParamsError("Codex CLI is unavailable; install Codex or add codex to PATH, then try again");
	return {
		kind: "local",
		argv: [resolution.executable, ...params.initialMessage !== void 0 ? ["--", params.initialMessage] : []],
		cwd: params.cwd,
		env: { CODEX_HOME: resolveCodexCatalogTerminalHome(params) },
		...resolution.pathEnv ? { pathEnv: resolution.pathEnv } : {},
		title: "codex"
	};
}
//#endregion
//#region extensions/codex/src/session-catalog-listing.ts
async function listVisiblePage(params) {
	const excluded = params.excludedThreadIds;
	const sessions = [];
	let cursor = params.cursor;
	let nextCursor;
	let backwardsCursor;
	const seenCursors = /* @__PURE__ */ new Set();
	for (let pageIndex = 0; pageIndex < 20; pageIndex += 1) {
		let excludedFromPage = false;
		const rawPage = await params.control.listPage({
			limit: params.limit - sessions.length,
			...cursor ? { cursor } : {},
			...params.searchTerm ? { searchTerm: params.searchTerm } : {},
			...params.cwd ? { cwd: params.cwd } : {}
		});
		const page = filterCatalogPageByTitle(parseCatalogPage(rawPage), params.searchTerm);
		if (pageIndex === 0) backwardsCursor = page.backwardsCursor;
		for (const managed of rawPage.managedThreads ?? []) {
			excludedFromPage = true;
			await params.onExcludedThread?.(managed);
		}
		for (const session of page.sessions) {
			if (!excluded?.has(session.threadId)) {
				sessions.push(session);
				continue;
			}
			excludedFromPage = true;
			await params.onExcludedThread?.({ threadId: session.threadId });
		}
		nextCursor = page.nextCursor;
		if (!nextCursor || sessions.length >= params.limit || !excludedFromPage) break;
		if (seenCursors.has(nextCursor)) throw new Error("Codex session catalog returned a repeated exclusion cursor");
		seenCursors.add(nextCursor);
		cursor = nextCursor;
	}
	return {
		sessions: sessions.slice(0, params.limit),
		...nextCursor ? { nextCursor } : {},
		...backwardsCursor ? { backwardsCursor } : {}
	};
}
async function listGatewayHost(params) {
	const hostId = params.source?.hostId ?? "gateway:local";
	const label = params.source?.label ?? "Local Codex";
	const sourceHomeId = params.source?.sourceHomeId ?? "gateway:local";
	try {
		const page = await listVisiblePage({
			control: params.control,
			cursor: params.query.cursors?.[hostId],
			excludedThreadIds: params.excludedThreadIds,
			limit: params.query.limitPerHost,
			onExcludedThread: params.onExcludedThread,
			searchTerm: params.query.search
		});
		const adoptedSessions = await listAdoptedSessionEntries({
			agentId: params.agentId,
			bindingStore: params.bindingStore,
			config: params.config,
			runtime: params.runtime,
			sessionEntries: params.sessionEntries
		});
		return {
			hostId,
			label,
			kind: "gateway",
			connected: true,
			...page,
			sessions: page.sessions.map((session) => {
				const adopted = adoptedSessions.get(sessionCatalogAdoptedSourceKey(sourceHomeId, session.threadId)) ?? (hostId === "gateway:local" ? adoptedSessions.get(sessionCatalogAdoptedSourceKey("gateway:local", session.threadId)) : void 0);
				const sourced = params.source ? Object.assign({}, session, { sourceHomeId: params.source.sourceHomeId }) : session;
				return adopted ? Object.assign({}, sourced, { sessionKey: adopted.key }) : sourced;
			})
		};
	} catch (error) {
		return {
			hostId,
			label,
			kind: "gateway",
			connected: false,
			sessions: [],
			error: catalogError("APP_SERVER_UNAVAILABLE", error)
		};
	}
}
/** Lists Gateway-local and paired-node Codex sessions with per-host failures. */
async function listCodexSessionCatalog(params) {
	const agentId = resolveSessionAgentIdsStrict({
		config: params.config ?? {},
		agentId: params.agentId
	}).sessionAgentId;
	const query = readGatewayParams(params.query);
	const requestedHostIds = query.hostIds ? new Set(query.hostIds) : void 0;
	const localSources = params.localHomes?.filter((source) => !requestedHostIds || requestedHostIds.has(source.hostId)) ?? (params.includeLocal !== false && (!requestedHostIds || requestedHostIds.has("gateway:local")) ? [void 0] : []);
	const managedThreads = await params.bindingStore.managedThreads?.snapshot();
	const fallbackSource = params.control.homesForAgent(agentId)[0];
	const localHosts = localSources.map((source) => (() => {
		const ownershipSource = source ?? fallbackSource;
		const managedThreadIds = ownershipSource ? managedThreads?.get(ownershipSource.sourceHomeId) : void 0;
		return listGatewayHost({
			agentId,
			bindingStore: params.bindingStore,
			config: params.config,
			control: params.control.forRequest(agentId, ownershipSource),
			query,
			runtime: params.runtime,
			sessionEntries: params.sessionEntries,
			excludedThreadIds: managedThreadIds,
			...ownershipSource && params.bindingStore.managedThreads ? { onExcludedThread: async ({ threadId, rolloutPath }) => {
				if (!managedThreadIds?.has(threadId)) await params.bindingStore.managedThreads?.mark({
					sourceHomeId: ownershipSource.sourceHomeId,
					threadId,
					...rolloutPath ? { rolloutPath } : {}
				});
			} } : {},
			...source ? { source } : {}
		});
	})());
	for (const host of localHosts) if (params.onHost) host.then(params.onHost).catch(() => void 0);
	if (!(!requestedHostIds || query.hostIds?.some((hostId) => hostId.startsWith("node:")))) return { hosts: await Promise.all(localHosts) };
	let nodes;
	try {
		nodes = (await (params.listNodes?.() ?? params.runtime.nodes.list())).nodes.filter((node) => node.gatewayLocal !== true && (node.commands?.includes("codex.appServer.threads.list.v1") || codexNodeTerminalCapability(node).canStartTerminal) && (!requestedHostIds || requestedHostIds.has(`node:${node.nodeId}`))).slice(0, 100 - localHosts.length);
	} catch (error) {
		const registryHost = {
			hostId: "node:registry",
			label: "Paired nodes",
			kind: "node",
			connected: false,
			canStartTerminal: false,
			sessions: [],
			error: catalogError("NODE_LIST_FAILED", error)
		};
		params.onHost?.(registryHost);
		return { hosts: [...await Promise.all(localHosts), registryHost] };
	}
	const adoptedNodeSessions = listNodeAdoptedSessionEntries({
		agentId,
		config: params.config,
		runtime: params.runtime,
		sessionEntries: params.sessionEntries
	});
	const nodeHosts = nodes.toSorted(compareNodeLabels).map((node) => listPairedNode({
		agentId,
		runtime: params.runtime,
		node,
		query,
		adoptedSessions: adoptedNodeSessions,
		terminalCapabilities: codexNodeTerminalCapability(node),
		...params.onHost ? { onHost: params.onHost } : {}
	}));
	return { hosts: await Promise.all([...localHosts, ...nodeHosts]) };
}
/** Builds the node-local read-only Codex app-server catalog command. */
function createCodexSessionCatalogNodeHostCommands(controlFactory, configSources, bindingStore) {
	const bindRequest = (paramsJSON) => {
		const parsed = parseJsonParams(paramsJSON);
		if (!isRecord(parsed)) throw new CatalogParamsError("Codex session catalog parameters must be an object");
		const requestedAgentId = readBoundedOptionalString(parsed, "agentId", 256);
		const config = configSources.getRuntimeConfig() ?? {};
		const agentId = resolveSessionAgentIdsStrict({
			config,
			agentId: requestedAgentId
		}).sessionAgentId;
		if (!listAgentIds(config).includes(agentId)) throw new CatalogParamsError(`unknown Codex session catalog agent: ${agentId}`);
		const request = { ...parsed };
		delete request.agentId;
		const source = controlFactory.homesForAgent(agentId)[0];
		return {
			agentId,
			control: controlFactory.forRequest(agentId, source),
			sourceHomeId: source?.sourceHomeId,
			params: request,
			paramsJSON: JSON.stringify(request)
		};
	};
	return [
		{
			command: CODEX_APP_SERVER_THREADS_LIST_COMMAND,
			cap: CODEX_APP_SERVER_THREADS_CAPABILITY,
			dangerous: false,
			handle: async (paramsJSON) => {
				const request = bindRequest(paramsJSON);
				const pageParams = readPageParams(request.params);
				try {
					const managedThreads = await bindingStore?.managedThreads?.snapshot();
					const sourceHomeId = request.sourceHomeId;
					const managedThreadIds = sourceHomeId ? managedThreads?.get(sourceHomeId) : void 0;
					const page = await listVisiblePage({
						control: request.control,
						cursor: pageParams.cursor,
						cwd: pageParams.cwd,
						excludedThreadIds: managedThreadIds,
						limit: pageParams.limit,
						...sourceHomeId && bindingStore?.managedThreads ? { onExcludedThread: async ({ threadId, rolloutPath }) => {
							if (!managedThreadIds?.has(threadId)) await bindingStore.managedThreads?.mark({
								sourceHomeId,
								threadId,
								...rolloutPath ? { rolloutPath } : {}
							});
						} } : {},
						searchTerm: pageParams.searchTerm
					});
					return JSON.stringify(page);
				} catch {
					throw new Error("Codex app-server catalog is unavailable");
				}
			}
		},
		{
			command: CODEX_APP_SERVER_THREAD_TURNS_LIST_COMMAND,
			cap: CODEX_APP_SERVER_THREADS_CAPABILITY,
			dangerous: false,
			handle: async (paramsJSON) => {
				const request = bindRequest(paramsJSON);
				const action = readNodeTranscriptParams(request.params);
				try {
					await request.control.requireEligibleThread(action.threadId);
					const page = parseTranscriptPage(await request.control.listTurnPage({
						threadId: action.threadId,
						limit: action.limit,
						sortDirection: "desc",
						itemsView: "full",
						...action.cursor ? { cursor: action.cursor } : {}
					}));
					return JSON.stringify(page);
				} catch (error) {
					if (error instanceof CatalogParamsError) throw error;
					throw new Error("Codex app-server transcript is unavailable", { cause: error });
				}
			}
		},
		createCodexTerminalNodeHostCommand(bindRequest, configSources),
		createCodexTerminalStartNodeHostCommand()
	];
}
function readNodeTranscriptParams(value) {
	if (!isRecord(value)) throw new CatalogParamsError("Codex session read parameters must be an object");
	requireOnlyKeys(value, /* @__PURE__ */ new Set([
		"threadId",
		"cursor",
		"limit"
	]));
	const threadId = readBoundedOptionalString(value, "threadId", 256);
	if (!threadId) throw new CatalogParamsError("threadId is required");
	const cursor = readBoundedOptionalString(value, "cursor", MAX_CURSOR_LENGTH);
	return {
		threadId,
		limit: readBoundedLimit(value.limit, "limit", 20, 50),
		...cursor ? { cursor } : {}
	};
}
function readBoundedLimit(value, key, fallback, max) {
	if (value === void 0) return fallback;
	if (!Number.isInteger(value) || value < 1 || value > max) throw new CatalogParamsError(`${key} must be an integer from 1 to ${max}`);
	return value;
}
function flattenTranscriptPageDesc(page) {
	return page.data.flatMap((turn) => turn.items.toReversed());
}
/** Reads the persisted transcript for a Gateway-local or paired-node Codex session. */
async function readCodexSessionTranscript(params) {
	if (params.source || params.hostId === "gateway:local") {
		await params.control.requireEligibleThread(params.threadId);
		const listParams = {
			threadId: params.threadId,
			limit: params.limit,
			sortDirection: "desc",
			itemsView: "full",
			...params.cursor ? { cursor: params.cursor } : {}
		};
		const page = parseTranscriptPage(await params.control.listTurnPage(listParams));
		return {
			hostId: params.hostId,
			label: params.source?.label ?? "Local Codex",
			threadId: params.threadId,
			items: flattenTranscriptPageDesc(page),
			...page.nextCursor ? { nextCursor: page.nextCursor } : {},
			...page.backwardsCursor ? { backwardsCursor: page.backwardsCursor } : {}
		};
	}
	const nodeId = params.hostId.slice(5);
	const node = (await params.runtime.nodes.list()).nodes.find((candidate) => candidate.nodeId === nodeId && candidate.connected === true && candidate.commands?.includes("codex.appServer.thread.turns.list.v1"));
	if (!node) throw new CatalogParamsError("paired-node Codex session host is offline or unavailable");
	const page = parseTranscriptPage(unwrapNodeInvokePayload(await params.runtime.nodes.invoke({
		nodeId,
		command: CODEX_APP_SERVER_THREAD_TURNS_LIST_COMMAND,
		params: {
			agentId: params.agentId,
			threadId: params.threadId,
			limit: params.limit,
			...params.cursor ? { cursor: params.cursor } : {}
		},
		timeoutMs: NODE_INVOKE_TIMEOUT_MS,
		scopes: ["operator.write"]
	})));
	return {
		hostId: params.hostId,
		label: nodeLabel(node),
		threadId: params.threadId,
		items: flattenTranscriptPageDesc(page),
		...page.nextCursor ? { nextCursor: page.nextCursor } : {},
		...page.backwardsCursor ? { backwardsCursor: page.backwardsCursor } : {}
	};
}
//#endregion
//#region extensions/codex/src/session-catalog-transcript-item.ts
const CODEX_MESSAGE_TYPES = /* @__PURE__ */ new Map([
	["userMessage", "userMessage"],
	["agentMessage", "agentMessage"],
	["reasoning", "reasoning"]
]);
const CODEX_TOOL_TYPES = /* @__PURE__ */ new Set([
	"commandExecution",
	"fileChange",
	"mcpToolCall",
	"dynamicToolCall",
	"collabAgentToolCall",
	"webSearch",
	"imageView",
	"imageGeneration"
]);
function toGenericTranscriptItem(item) {
	let type = CODEX_MESSAGE_TYPES.get(item.type);
	if (!type && CODEX_TOOL_TYPES.has(item.type)) type = item.result !== void 0 || Boolean(item.aggregatedOutput) ? "toolResult" : "toolCall";
	type ??= "other";
	const fallback = item.title ?? item.name ?? item.tool ?? item.command ?? item.query ?? void 0;
	const resultText = item.aggregatedOutput || (item.result === void 0 ? void 0 : JSON.stringify(item.result, null, 2));
	const changesText = Array.isArray(item.changes) ? item.changes.map((change) => `${change.kind}: ${change.path}`).join("\n") || void 0 : void 0;
	const text = item.type === "userMessage" ? projectCodexUserItemText(item) : item.text || resultText || changesText || fallback;
	return {
		id: item.id,
		type,
		...text ? { text } : {},
		raw: item
	};
}
//#endregion
//#region extensions/codex/src/session-upstream-activity.ts
const CODEX_UPSTREAM_TURN_LIMIT = 100;
const CODEX_APP_SERVER_INVALID_REQUEST_CODE = -32600;
const CODEX_THREAD_NOT_LOADED_MESSAGE_PREFIX = "thread not loaded:";
function isCodexThreadGoneError(error) {
	return error instanceof CodexAppServerRpcError && error.code === CODEX_APP_SERVER_INVALID_REQUEST_CODE && error.message.startsWith(CODEX_THREAD_NOT_LOADED_MESSAGE_PREFIX);
}
function readMarker(probe) {
	if (!isRecord(probe.marker)) return;
	const turnId = probe.marker.turnId;
	if (turnId !== null && typeof turnId !== "string") return;
	const count = probe.marker.userMessageCount;
	if (count !== void 0 && (!Number.isSafeInteger(count) || count < 0)) return;
	return {
		turnId,
		...count === void 0 ? {} : { userMessageCount: count }
	};
}
function upstreamConnectionFingerprint(probe) {
	return isRecord(probe.upstreamRef) && typeof probe.upstreamRef.connectionFingerprint === "string" ? probe.upstreamRef.connectionFingerprint : void 0;
}
function classifyCodexUpstreamTurns(params) {
	const marker = readMarker(params.probe);
	if (!marker) return;
	const newest = params.turns[0];
	if (!newest?.id) return;
	const markerIndex = marker.turnId === null ? -1 : params.turns.findIndex((turn) => turn.id === marker.turnId);
	const candidateTurns = markerIndex < 0 ? params.turns : params.turns.slice(0, markerIndex + 1);
	const newestUserMessageCount = countUserMessages(newest);
	if (!(marker.turnId !== newest.id || marker.userMessageCount === void 0 || newestUserMessageCount > marker.userMessageCount)) return;
	const ownTexts = new Set(params.probe.ownRecentUserTexts);
	let humanTurns = 0;
	let occurredAt;
	for (const turn of candidateTurns) {
		const userMessages = turn.items.filter((item) => item.type === "userMessage");
		const alreadySeen = turn.id === marker.turnId ? marker.userMessageCount ?? userMessages.length : 0;
		for (const item of userMessages.slice(alreadySeen)) {
			const texts = normalizeUserMessageTexts(item);
			if (ownTexts.has(texts.join(" ")) || texts.length > 1 && texts.every((text) => ownTexts.has(text))) continue;
			humanTurns += 1;
			if (occurredAt === void 0) {
				const timestampSeconds = turn.completedAt ?? turn.startedAt;
				occurredAt = typeof timestampSeconds === "number" && Number.isFinite(timestampSeconds) ? timestampSeconds * 1e3 : params.now ?? Date.now();
			}
		}
	}
	const activityId = `${newest.id}:${newestUserMessageCount}`;
	return {
		kind: "activity",
		sessionKey: params.probe.sessionKey,
		humanTurns,
		nextMarker: {
			turnId: newest.id,
			userMessageCount: newestUserMessageCount
		},
		...humanTurns > 0 ? {
			occurredAt: occurredAt ?? params.now ?? Date.now(),
			dedupeId: activityId
		} : {}
	};
}
function countUserMessages(turn) {
	return turn.items.filter((item) => item.type === "userMessage").length;
}
function normalizeUserMessageTexts(item) {
	const typed = item;
	const contentTexts = typed.content?.filter((input) => input.type === "text").map((input) => input.text.trim().replace(/\s+/g, " ")).filter(Boolean);
	return contentTexts?.length ? contentTexts : [(typed.text ?? "").trim().replace(/\s+/g, " ")];
}
async function checkCodexUpstreamActivity(probes, control, resolveThreadId = async (probe) => probe.threadId) {
	return await control.withPinnedConnection(async (pinned) => {
		const activities = [];
		for (const probe of probes) {
			const fingerprint = upstreamConnectionFingerprint(probe);
			if (probe.upstreamKind !== "codex-app-server" || !fingerprint || fingerprint !== pinned.connectionFingerprint) continue;
			try {
				const threadId = await resolveThreadId(probe);
				const page = await pinned.listTurnPage({
					threadId,
					limit: CODEX_UPSTREAM_TURN_LIMIT,
					sortDirection: "desc",
					itemsView: "full"
				});
				const marker = readMarker(probe);
				if (page.data.length === 0 && marker) {
					try {
						await pinned.readThread(threadId, false);
					} catch (error) {
						if (isCodexThreadGoneError(error)) activities.push({
							kind: "missing",
							sessionKey: probe.sessionKey
						});
					}
					continue;
				}
				const activity = classifyCodexUpstreamTurns({
					probe,
					turns: page.data
				});
				if (activity) activities.push(activity);
			} catch {}
		}
		return activities;
	});
}
function createChecker(params) {
	const resolveThreadId = async (probe) => {
		const config = params.getRuntimeConfig();
		const sessionId = params.api.runtime.agent.session.getSessionEntry({
			agentId: probe.agentId,
			sessionKey: probe.sessionKey,
			readConsistency: "latest"
		})?.sessionId?.trim();
		if (!sessionId) return probe.threadId;
		const binding = await params.bindingStore.read(sessionBindingIdentity({
			sessionId,
			sessionKey: probe.sessionKey,
			config
		}));
		return binding?.connectionScope === "supervision" && binding.supervisionSourceThreadId === probe.threadId ? binding.threadId : probe.threadId;
	};
	return async (probes) => {
		const groups = /* @__PURE__ */ new Map();
		for (const probe of probes) {
			const fingerprint = upstreamConnectionFingerprint(probe);
			if (!fingerprint) continue;
			const control = params.control.forUpstream(probe.agentId, fingerprint);
			if (!control) continue;
			const key = `${probe.agentId}\0${fingerprint}`;
			const group = groups.get(key) ?? {
				control,
				probes: []
			};
			group.probes.push(probe);
			groups.set(key, group);
		}
		return (await Promise.all([...groups.values()].map((group) => checkCodexUpstreamActivity(group.probes, group.control, resolveThreadId)))).flat();
	};
}
//#endregion
//#region extensions/codex/src/session-catalog-homes.ts
function existingCatalogHomeCandidates(value, label) {
	const codexHome = canonicalCodexCatalogHome(value);
	try {
		if (!fsSync.statSync(codexHome).isDirectory()) return [];
	} catch {
		return [];
	}
	return [{
		codexHome,
		label: `Local Codex · ${label ?? path.basename(codexHome)}`
	}];
}
/** Resolves every local Codex store the operator already owns, without path disclosure. */
function resolveCodexCatalogHomes(params) {
	const { config, env, ownerAgentId, pluginConfig } = params;
	const ownerAgentDir = resolveAgentDir$1(config, ownerAgentId, env);
	const configuredHomes = readCodexPluginConfig(pluginConfig).sessionCatalog?.homes ?? [];
	const base = resolveCodexSupervisionAppServerRuntimeOptions({
		pluginConfig,
		env,
		agentDir: ownerAgentDir,
		config
	});
	const primaryCodexHome = canonicalCodexCatalogHome(resolveCodexAppServerLocalHomeDir(base.start, ownerAgentDir, env));
	const processUserHome = canonicalCodexCatalogHome(resolveCodexAppServerUserHomeDir(env));
	const processHomeConfigured = Boolean(env.CODEX_HOME?.trim());
	const candidates = [{
		codexHome: primaryCodexHome,
		label: "Local Codex",
		usesProcessHomeFallback: base.start.transport === "stdio" && base.start.homeScope === "user" && !processHomeConfigured
	}];
	if (base.start.transport === "stdio") {
		candidates.push({
			codexHome: processUserHome,
			label: "Local Codex · user",
			usesProcessHomeFallback: !processHomeConfigured
		});
		const agentIds = listAgentIds(config).toSorted((left, right) => left === ownerAgentId ? -1 : right === ownerAgentId ? 1 : left.localeCompare(right));
		candidates.push(...agentIds.flatMap((agentId) => existingCatalogHomeCandidates(resolveCodexAppServerHomeDir(resolveAgentDir$1(config, agentId, env)), agentId)), ...configuredHomes.flatMap((entry) => {
			const { path: home, label } = typeof entry === "string" ? { path: entry } : entry;
			return existingCatalogHomeCandidates(home, label);
		}));
	}
	const seen = /* @__PURE__ */ new Set();
	const homes = [];
	for (const candidate of candidates) {
		if (seen.has(candidate.codexHome)) continue;
		seen.add(candidate.codexHome);
		const sourceHomeId = codexCatalogHomeId(candidate.codexHome);
		const primary = homes.length === 0;
		homes.push({
			sourceHomeId,
			hostId: primary ? CODEX_LOCAL_SESSION_HOST_ID : `${CODEX_LOCAL_SESSION_HOST_ID}:${sourceHomeId}`,
			label: candidate.label,
			agentDir: ownerAgentDir,
			appServer: primary ? base : {
				...base,
				start: {
					...base.start,
					homeScope: "user",
					env: {
						...base.start.env,
						CODEX_HOME: candidate.codexHome
					}
				}
			},
			...base.connectionClass === "remote" ? {} : { localSessionsRoot: path.join(candidate.codexHome, "sessions") },
			usesProcessHomeFallback: candidate.usesProcessHomeFallback ?? false
		});
		if (homes.length >= 100) break;
	}
	return homes;
}
/** Discovers Codex homes once per immutable Gateway config generation. */
function createCodexCatalogHomeResolver(params) {
	const env = params.env ?? process.env;
	const homesByConfig = /* @__PURE__ */ new WeakMap();
	const buildSnapshot = (config) => {
		const pluginConfig = params.getPluginConfig();
		const homesByAgent = new Map(listAgentIds(config).map((agentId) => [agentId, resolveCodexCatalogHomes({
			config,
			pluginConfig,
			ownerAgentId: agentId,
			env
		})]));
		replaceCodexCatalogConnectionHomes([...homesByAgent.values()].flatMap((homes) => homes.filter((home) => home.appServer.start.transport === "stdio").map((home) => ({
			agentDir: home.agentDir,
			fingerprint: buildCodexAppServerConnectionFingerprint(home.appServer, home.agentDir),
			codexHome: resolveCodexAppServerLocalHomeDir(home.appServer.start, home.agentDir, env)
		}))));
		homesByConfig.set(config, homesByAgent);
		return homesByAgent;
	};
	let lastSnapshot = buildSnapshot(params.config);
	return { forAgent(agentId) {
		const config = params.getRuntimeConfig();
		if (!config) return lastSnapshot.get(agentId) ?? [];
		const cached = homesByConfig.get(config);
		if (cached) return cached.get(agentId) ?? [];
		lastSnapshot = buildSnapshot(config);
		return lastSnapshot.get(agentId) ?? [];
	} };
}
//#endregion
//#region extensions/codex/src/session-catalog-control.ts
const CODEX_SESSION_CATALOG_LIST_TTL_MS = 32e3;
const CODEX_SESSION_CATALOG_LIST_CACHE_MAX_ENTRIES = 32;
function codexCatalogPageCacheKey(params, agentId, source) {
	return JSON.stringify([
		agentId,
		source?.sourceHomeId ?? null,
		params.cursor ?? null,
		params.limit ?? null,
		params.searchTerm?.trim().toLocaleLowerCase() || null,
		params.cwd?.trim() || null
	]);
}
function createCodexCatalogRequestSnapshot(requestTimeoutMs, request) {
	return {
		requestTimeoutMs,
		listThreads: (params, timeoutMs) => request(CODEX_CONTROL_METHODS.listThreads, params, timeoutMs),
		listThreadTurns: (params) => request(CODEX_CONTROL_METHODS.listThreadTurns, params),
		forkThread: (params, assertCurrent) => request(CODEX_CONTROL_METHODS.forkThread, assertCodexThreadForkParams(params), void 0, assertCurrent),
		readThread: async (threadId, includeTurns, timeoutMs) => (await request(CODEX_CONTROL_METHODS.readThread, {
			threadId,
			includeTurns
		}, timeoutMs)).thread,
		archiveThread: async (threadId, assertCurrent) => {
			await request(CODEX_CONTROL_METHODS.archiveThread, { threadId }, void 0, assertCurrent);
		}
	};
}
function createCodexSessionCatalogControlFromRequests(params) {
	return {
		forkContext: params.forkContext,
		...params.clientId ? { clientId: params.clientId } : {},
		...params.connectionFingerprint ? { connectionFingerprint: params.connectionFingerprint } : {},
		withPinnedConnection: params.withPinnedConnection,
		async requireEligibleThread(threadId) {
			const requests = params.createRequestSnapshot();
			const deadline = params.now() + requests.requestTimeoutMs;
			const unverified = () => new CatalogParamsError("Codex session eligibility could not be verified. Refresh the catalog and verify the session in its native Codex home before retrying.");
			const remaining = () => {
				const timeoutMs = Math.ceil(deadline - params.now());
				if (timeoutMs <= 0) throw unverified();
				return timeoutMs;
			};
			const verify = async () => {
				if (params.sourceHomeId && await params.managedThreads?.has(params.sourceHomeId, threadId)) throw unverified();
				const root = params.localSessionsRoot;
				const thread = root ? await requests.readThread(threadId, false, remaining()) : void 0;
				if (root && (!thread || thread.id !== threadId || !isInteractiveThreadSource(thread.source))) throw unverified();
				let cursor;
				const seenCursors = /* @__PURE__ */ new Set();
				for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
					const page = await requests.listThreads({
						archived: false,
						limit: 100,
						modelProviders: [],
						sortKey: root ? "recency_at" : "updated_at",
						sortDirection: "desc",
						...root ? {
							useStateDbOnly: true,
							...thread?.cwd ? { cwd: thread.cwd } : {}
						} : {},
						...cursor ? { cursor } : {}
					}, remaining());
					remaining();
					const candidate = page.data.find((value) => value.id === threadId);
					if (candidate) {
						if (!isInteractiveThreadSource(candidate.source)) throw unverified();
						if (root && thread) {
							const rolloutPath = thread.path;
							if (!rolloutPath || !candidate.path || rolloutPath.replace(/\.zst$/u, "") !== candidate.path.replace(/\.zst$/u, "")) throw unverified();
							const metadata = await readCodexSessionMeta(root, rolloutPath, threadId);
							remaining();
							if (!metadata || !isInteractiveThreadSource(metadata.source) || metadata.originator === "openclaw") throw unverified();
							return thread;
						}
						return candidate;
					}
					const nextCursor = readControlCursor(page.nextCursor, "next response");
					if (!nextCursor || seenCursors.has(nextCursor)) throw unverified();
					seenCursors.add(nextCursor);
					cursor = nextCursor;
				}
				throw unverified();
			};
			return await withTimeout(verify(), requests.requestTimeoutMs, "Codex session eligibility could not be verified", unverified);
		},
		retireConnection: params.retireConnection,
		async listPage(pageParams) {
			const limit = normalizeLimit(pageParams.limit, "limit");
			const search = pageParams.searchTerm?.trim().toLocaleLowerCase() || void 0;
			const cwd = pageParams.cwd?.trim() || void 0;
			const maxPages = search ? 20 : 1;
			const sessions = [];
			const managedThreads = [];
			let cursor = readControlCursor(pageParams.cursor, "request");
			let nextCursor;
			let backwardsCursor;
			const seenCursors = new Set(cursor ? [cursor] : []);
			const requests = params.createRequestSnapshot();
			const deadline = params.now() + requests.requestTimeoutMs;
			for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
				const remainingTimeoutMs = Math.ceil(deadline - params.now());
				if (remainingTimeoutMs <= 0) throw new Error("Codex session catalog listing timed out");
				const response = await requests.listThreads({
					archived: false,
					limit: limit - sessions.length,
					modelProviders: [],
					sortKey: "updated_at",
					sortDirection: "desc",
					...cwd ? { cwd } : {},
					...cursor ? { cursor } : {}
				}, remainingTimeoutMs);
				if (pageIndex === 0) backwardsCursor = readControlCursor(response.backwardsCursor, "backwards response");
				for (const thread of response.data) {
					if (await isOpenClawManagedCodexThread(thread, params.localSessionsRoot)) {
						const rolloutPath = typeof thread.path === "string" ? thread.path.trim() : "";
						managedThreads.push({
							threadId: thread.id,
							...rolloutPath ? { rolloutPath } : {}
						});
						continue;
					}
					const session = toCatalogSession(thread, false);
					if (session && (!search || (session.name ?? session.fallbackName)?.toLocaleLowerCase().includes(search))) sessions.push(session);
				}
				nextCursor = readControlCursor(response.nextCursor, "next response");
				if (!nextCursor || sessions.length >= limit) break;
				if (seenCursors.has(nextCursor)) throw new Error("Codex session catalog returned a repeated search cursor");
				seenCursors.add(nextCursor);
				cursor = nextCursor;
			}
			return {
				sessions,
				...managedThreads.length > 0 ? { managedThreads } : {},
				...nextCursor ? { nextCursor } : {},
				...backwardsCursor ? { backwardsCursor } : {}
			};
		},
		async listDescendantPage(listParams) {
			const requests = params.createRequestSnapshot();
			return await requests.listThreads(listParams, requests.requestTimeoutMs);
		},
		async readThread(threadId, includeTurns = false) {
			return await params.createRequestSnapshot().readThread(threadId, includeTurns);
		},
		async listTurnPage(listParams) {
			return await params.createRequestSnapshot().listThreadTurns(listParams);
		},
		async forkThread(forkParams, assertCurrent) {
			return await params.createRequestSnapshot().forkThread(forkParams, assertCurrent);
		},
		async archiveThread(threadId, assertCurrent) {
			await params.createRequestSnapshot().archiveThread(threadId, assertCurrent);
		}
	};
}
/** Builds the passive catalog over the Codex plugin's canonical shared client. */
function createCodexSessionCatalogControl(params) {
	const now = params.now ?? Date.now;
	const getPluginConfig = () => params.getPluginConfig();
	const homeResolver = createCodexCatalogHomeResolver({
		config: params.getRuntimeConfig() ?? params.config ?? {},
		getRuntimeConfig: params.getRuntimeConfig,
		getPluginConfig: params.getPluginConfig,
		...params.env ? { env: params.env } : {}
	});
	const requestOptionsByConfig = /* @__PURE__ */ new WeakMap();
	const catalogPagesByConfig = /* @__PURE__ */ new WeakMap();
	const resolveRequestOptions = (startOptions, agentId, source) => {
		const runtimeConfig = params.getRuntimeConfig();
		const agentDir = source?.agentDir ?? resolveAgentDir$1(runtimeConfig ?? {}, agentId);
		const resolvedStartOptions = source?.appServer.start ?? startOptions;
		if (!runtimeConfig) return {
			agentDir,
			config: void 0,
			startOptions: structuredClone(resolvedStartOptions)
		};
		let byAgent = requestOptionsByConfig.get(runtimeConfig);
		const cacheKey = `${agentId ?? ""}\0${source?.sourceHomeId ?? ""}`;
		const cached = byAgent?.get(cacheKey);
		if (cached) return cached;
		const resolved = {
			agentDir,
			config: structuredClone(runtimeConfig),
			startOptions: structuredClone(resolvedStartOptions)
		};
		if (!byAgent) {
			byAgent = /* @__PURE__ */ new Map();
			requestOptionsByConfig.set(runtimeConfig, byAgent);
		}
		byAgent.set(cacheKey, resolved);
		return resolved;
	};
	const createRequestSnapshot = (agentId, source) => {
		const pluginConfig = getPluginConfig();
		const runtime = source?.appServer ?? resolveCodexSupervisionAppServerRuntimeOptions({ pluginConfig });
		const requestOptions = resolveRequestOptions(runtime.start, agentId, source);
		return createCodexCatalogRequestSnapshot(runtime.requestTimeoutMs, async (method, requestParams, timeoutMs, assertCurrent) => await codexControlRequest(pluginConfig, method, requestParams, {
			...requestOptions,
			assertCurrent,
			...timeoutMs === void 0 ? {} : { timeoutMs }
		}));
	};
	const forRequest = (agentId, source) => {
		const withPinnedConnection = async (run) => {
			const pluginConfig = getPluginConfig();
			const runtime = source?.appServer ?? resolveCodexSupervisionAppServerRuntimeOptions({ pluginConfig });
			const { agentDir, config: runtimeConfig, startOptions } = resolveRequestOptions(runtime.start, agentId, source);
			const client = await getLeasedSharedCodexAppServerClient({
				agentDir,
				config: runtimeConfig,
				startOptions,
				timeoutMs: runtime.requestTimeoutMs
			});
			try {
				const requests = createCodexCatalogRequestSnapshot(runtime.requestTimeoutMs, async (method, requestParams, timeoutMs, assertCurrent) => await requestCodexAppServerClientJson({
					client,
					method,
					requestParams,
					config: runtimeConfig,
					timeoutMs: timeoutMs ?? runtime.requestTimeoutMs,
					assertCurrent
				}));
				const pinnedControl = createCodexSessionCatalogControlFromRequests({
					forkContext: {
						client,
						appServer: runtime,
						pluginConfig,
						agentDir,
						localSessionsRoot: source?.localSessionsRoot
					},
					clientId: resolveCodexAppServerClientInstanceId(client),
					retireConnection: () => {
						retireSharedCodexAppServerClientIfCurrent(client);
					},
					connectionFingerprint: buildCodexAppServerConnectionFingerprint(runtime, agentDir),
					createRequestSnapshot: () => requests,
					...source?.localSessionsRoot ? { localSessionsRoot: source.localSessionsRoot } : {},
					sourceHomeId: source?.sourceHomeId,
					managedThreads: params.managedThreads,
					now,
					withPinnedConnection: async (nestedRun) => await nestedRun(pinnedControl)
				});
				return await run(pinnedControl);
			} finally {
				releaseLeasedSharedCodexAppServerClient(client);
			}
		};
		const control = createCodexSessionCatalogControlFromRequests({
			createRequestSnapshot: () => createRequestSnapshot(agentId, source),
			...source?.localSessionsRoot ? { localSessionsRoot: source.localSessionsRoot } : {},
			now,
			withPinnedConnection
		});
		return {
			...control,
			requireEligibleThread: (threadId) => withPinnedConnection((pinned) => pinned.requireEligibleThread(threadId)),
			async listPage(pageParams) {
				const runtimeConfig = params.getRuntimeConfig();
				if (!runtimeConfig) return await control.listPage(pageParams);
				let cache = catalogPagesByConfig.get(runtimeConfig);
				if (!cache) {
					cache = /* @__PURE__ */ new Map();
					catalogPagesByConfig.set(runtimeConfig, cache);
				}
				const key = codexCatalogPageCacheKey(pageParams, agentId, source);
				const cached = cache.get(key);
				if (cached) {
					cache.delete(key);
					cache.set(key, cached);
					if (cached.expiresAt > now()) return cached.value ?? await cached.page;
				}
				if (cached) cache.delete(key);
				const page = control.listPage(pageParams);
				const staleValue = cached?.value;
				const entry = {
					expiresAt: Number.POSITIVE_INFINITY,
					page,
					...staleValue ? { value: staleValue } : {}
				};
				cache.set(key, entry);
				pruneMapToMaxSize(cache, CODEX_SESSION_CATALOG_LIST_CACHE_MAX_ENTRIES);
				const settle = (value) => {
					if (cache.get(key) === entry) {
						entry.value = value;
						entry.expiresAt = now() + CODEX_SESSION_CATALOG_LIST_TTL_MS;
					}
					return value;
				};
				const restore = () => {
					if (cache.get(key) !== entry) return;
					if (staleValue) cache.set(key, {
						expiresAt: now(),
						page: Promise.resolve(staleValue),
						value: staleValue
					});
					else cache.delete(key);
				};
				if (staleValue) {
					page.then(settle, restore);
					return staleValue;
				}
				try {
					return settle(await page);
				} catch (error) {
					restore();
					throw error;
				}
			}
		};
	};
	const homesForAgent = (agentId) => homeResolver.forAgent(agentId);
	const forUpstream = (agentId, connectionFingerprint) => {
		const source = homesForAgent(agentId).find((home) => buildCodexAppServerConnectionFingerprint(home.appServer, home.agentDir) === connectionFingerprint);
		return source ? forRequest(agentId, source) : void 0;
	};
	return {
		forRequest,
		forUpstream,
		homesForAgent
	};
}
//#endregion
//#region extensions/codex/src/session-catalog.ts
/** Allows read-only catalog and transcript commands on supported paired-node platforms. */
function createCodexSessionCatalogNodeInvokePolicies() {
	return [{
		commands: [
			CODEX_APP_SERVER_THREADS_LIST_COMMAND,
			CODEX_APP_SERVER_THREAD_TURNS_LIST_COMMAND,
			CODEX_TERMINAL_RESUME_COMMAND,
			CODEX_TERMINAL_START_COMMAND
		],
		defaultPlatforms: [
			"macos",
			"linux",
			"windows"
		],
		handle: (context) => {
			if (context.command === "codex.terminal.start.v1") return context.client?.scopes?.includes("operator.admin") && context.config.gateway?.cliAgents?.enabled === true && context.config.gateway?.terminal?.enabled !== false ? { ok: true } : {
				ok: false,
				message: "Native terminal start requires operator.admin and enabled CLI agents and terminals"
			};
			return context.command === "codex.terminal.resume.v1" ? { ok: true } : context.invokeNode();
		}
	}];
}
function toGenericCatalogHost(host, localTerminalAvailable) {
	const local = isLocalCodexCatalogHost(host.hostId);
	return {
		hostId: host.hostId,
		label: host.label,
		kind: host.kind,
		connected: host.connected,
		...host.nodeId ? { nodeId: host.nodeId } : {},
		sessions: host.sessions.map((session) => {
			const continuableStatus = !session.archived && (session.status === "idle" || session.status === "notLoaded");
			const canContinue = (local || host.canContinueCodex === true) && continuableStatus && isInteractiveThreadSource(session.source);
			const canArchive = local && continuableStatus && isInteractiveThreadSource(session.source);
			const canOpenTerminal = isInteractiveThreadSource(session.source) && (local ? localTerminalAvailable : host.canOpenTerminalCodex === true);
			const name = session.name ?? session.fallbackName;
			return {
				threadId: session.threadId,
				...session.sourceHomeId ? { sourceHomeId: session.sourceHomeId } : {},
				...name ? { name } : {},
				...session.cwd ? { cwd: session.cwd } : {},
				status: session.status,
				...session.createdAt != null ? { createdAt: session.createdAt } : {},
				...session.updatedAt != null ? { updatedAt: session.updatedAt } : {},
				...session.recencyAt != null ? { recencyAt: session.recencyAt } : {},
				...session.source ? { source: session.source } : {},
				...session.modelProvider ? { modelProvider: session.modelProvider } : {},
				...session.cliVersion ? { cliVersion: session.cliVersion } : {},
				...session.gitBranch ? { gitBranch: session.gitBranch } : {},
				archived: session.archived,
				...session.sessionKey ? { sessionKey: session.sessionKey } : {},
				canContinue,
				canArchive,
				canOpenTerminal
			};
		}),
		...host.nextCursor ? { nextCursor: host.nextCursor } : {},
		...host.error ? { error: host.error } : {}
	};
}
function isLocalCodexCatalogHost(hostId) {
	return hostId === "gateway:local" || hostId.startsWith(`gateway:local:`);
}
function resolveLocalCatalogHomeForThread(params) {
	if (params.homes.length === 0) throw new CatalogParamsError("local Codex sessions are unavailable in isolated state");
	const exact = params.sourceHomeId ? params.homes.filter((home) => home.sourceHomeId === params.sourceHomeId) : params.homes.filter((home) => home.hostId === params.hostId);
	if (exact.length === 0 || params.sourceHomeId && exact[0]?.hostId !== params.hostId) throw new CatalogParamsError("Codex session source home is unavailable");
	return exact[0];
}
function registerCodexSessionCatalog(params) {
	const catalogHomes = (agentId, allowProcessHomeFallback) => {
		const homes = params.control.homesForAgent(agentId);
		return allowProcessHomeFallback === false ? homes.filter((home) => !home.usesProcessHomeFallback) : homes;
	};
	const resolveRequestAgentId = (agentId) => resolveSessionAgentIdsStrict({
		config: params.getRuntimeConfig() ?? params.api.config,
		agentId
	}).sessionAgentId;
	const bindRequest = (request) => {
		const agentId = resolveRequestAgentId(request.agentId);
		const source = isLocalCodexCatalogHost(request.hostId) ? resolveLocalCatalogHomeForThread({
			homes: [...catalogHomes(agentId, request.allowProcessHomeFallback)],
			hostId: request.hostId,
			...request.sourceHomeId ? { sourceHomeId: request.sourceHomeId } : {}
		}) : void 0;
		return {
			agentId,
			source,
			control: params.control.forRequest(agentId, source)
		};
	};
	const bindLocalRequest = (request) => {
		const bound = bindRequest(request);
		if (!bound.source) throw new CatalogParamsError("Codex session catalog hostId is invalid");
		return {
			...bound,
			source: bound.source
		};
	};
	const checkUpstreamActivity = createChecker(params);
	params.api.registerSessionCatalog({
		id: "codex",
		label: "Codex",
		supportsProcessHomeIsolation: true,
		resolveCreateSession: ({ agentId }) => resolveCodexCatalogCreateSession(params.getRuntimeConfig() ?? params.api.config, agentId),
		list: async (query) => {
			const localTerminalAvailable = resolveLocalCodexTerminalExecutable() !== void 0;
			const { agentId: requestedAgentId, allowProcessHomeFallback, listNodes, onHost, sessionEntries, ...gatewayQuery } = query;
			const agentId = resolveRequestAgentId(requestedAgentId);
			const localHomes = [...catalogHomes(agentId, allowProcessHomeFallback)];
			const mapHost = (host) => ({
				...toGenericCatalogHost(host, localTerminalAvailable),
				canStartTerminal: host.kind === "gateway" ? localTerminalAvailable && localHomes.some((home) => home.hostId === host.hostId && home.appServer.start.transport === "stdio") : host.canStartTerminal === true
			});
			return (await listCodexSessionCatalog({
				agentId,
				bindingStore: params.bindingStore,
				config: params.getRuntimeConfig(),
				runtime: params.api.runtime,
				control: params.control,
				query: gatewayQuery,
				listNodes,
				sessionEntries,
				localHomes,
				...onHost ? { onHost: (host) => onHost(mapHost(host)) } : {}
			})).hosts.map(mapHost);
		},
		read: async (request) => {
			const { agentId, source, control } = bindRequest(request);
			const page = await readCodexSessionTranscript({
				agentId,
				runtime: params.api.runtime,
				control,
				hostId: request.hostId,
				threadId: request.threadId,
				cursor: request.cursor,
				limit: request.limit ?? 20,
				...source ? { source } : {}
			});
			return {
				...page,
				items: page.items.map(toGenericTranscriptItem)
			};
		},
		continueSession: async (request) => {
			const config = params.getRuntimeConfig();
			if (!config) throw new Error("OpenClaw runtime config is unavailable");
			if (request.hostId.startsWith("node:")) return await continueNodeCodexSession({
				agentId: resolveRequestAgentId(request.agentId),
				api: params.api,
				config,
				hostId: request.hostId,
				threadId: request.threadId,
				clientScopes: request.clientScopes
			});
			if (!isLocalCodexCatalogHost(request.hostId)) throw new CatalogParamsError("Codex session catalog hostId is invalid");
			const { agentId, source, control } = bindLocalRequest(request);
			let upstreamBaseline;
			const continued = await continueLocalCodexSession({
				agentId,
				api: params.api,
				bindingStore: params.bindingStore,
				config,
				control,
				threadId: request.threadId,
				hostId: source.hostId,
				sourceHomeId: source.sourceHomeId,
				...source.hostId === "gateway:local" ? { allowLegacy: true } : {},
				onContinued: (baseline) => {
					upstreamBaseline = baseline;
				}
			});
			return codexUpstreamContinueResult(continued.sessionKey, request.threadId, upstreamBaseline);
		},
		checkUpstreamActivity: (probes, policy) => checkUpstreamActivity(probes.filter((probe) => !isLocalCodexCatalogHost(probe.hostId) || policy?.allowProcessHomeFallback !== false || catalogHomes(probe.agentId, false).some((home) => home.hostId === probe.hostId))),
		archive: async (request) => {
			if (request.confirmNoOtherRunner !== true) throw new CatalogParamsError("archive requires confirmation that no other runner is active");
			if (!isLocalCodexCatalogHost(request.hostId)) throw new CatalogParamsError("paired-node Codex sessions are view-only");
			const config = params.getRuntimeConfig();
			if (!config) throw new Error("OpenClaw runtime config is unavailable");
			const { agentId, source, control } = bindLocalRequest(request);
			await archiveLocalCodexSession({
				agentId,
				bindingStore: params.bindingStore,
				config,
				control,
				runtime: params.api.runtime,
				threadId: request.threadId,
				hostId: source.hostId,
				sourceHomeId: source.sourceHomeId,
				...source.hostId === "gateway:local" ? { allowLegacy: true } : {}
			});
			return { ok: true };
		},
		openTerminal: async (request) => {
			const { agentId, source, control } = bindRequest(request);
			return await openCodexCatalogTerminal({
				api: params.api,
				control,
				getPluginConfig: params.getPluginConfig,
				getRuntimeConfig: params.getRuntimeConfig,
				parseCatalogPage,
				...source ? { source } : {},
				...request,
				agentId
			});
		},
		startTerminalSession: async (request) => {
			const source = request.nodeId ? void 0 : resolveLocalCatalogHomeForThread({
				homes: [...catalogHomes(request.agentId, request.allowProcessHomeFallback)],
				hostId: request.hostId ?? "gateway:local"
			});
			if (source && source.appServer.start.transport !== "stdio") throw new CatalogParamsError("Native terminal start requires a local Codex source");
			return await startCodexCatalogTerminal({
				getPluginConfig: params.getPluginConfig,
				getRuntimeConfig: params.getRuntimeConfig,
				...request,
				source
			});
		}
	});
}
const codexSessionCatalogRuntime = {
	register: registerCodexSessionCatalog,
	list: listCodexSessionCatalog,
	readTranscript: readCodexSessionTranscript,
	continueLocal: continueLocalCodexSession,
	continueNode: continueNodeCodexSession,
	archiveLocal: archiveLocalCodexSession
};
//#endregion
export { CODEX_LOCAL_SESSION_HOST_ID as a, readCodexStatusProbes as c, createCodexCliSessionNodeHostCommands as d, createCodexCliSessionNodeInvokePolicies as f, resumeCodexCliSessionOnNode as g, resolveCodexCliSessionForBindingOnNode as h, createCodexSessionCatalogNodeHostCommands as i, requestOptions as l, listCodexCliSessionsOnNode as m, createCodexSessionCatalogNodeInvokePolicies as n, assertCodexArchiveDescendantsUnowned as o, formatCodexCliSessions as p, createCodexSessionCatalogControl as r, codexControlRequest as s, codexSessionCatalogRuntime as t, safeCodexControlRequest as u };
