import { $t as isJsonObject, Qt as flattenCodexDynamicToolFunctions } from "./shared-client-DxcfF9KX.js";
import { ct as isMessageOnlyCodexSourceReply, et as areCodexDynamicToolFingerprintsCompatible, mt as isContextEngineBindingCompatible } from "./thread-lifecycle-DAcEJ_Om.js";
import { n as readCodexMirroredSessionHistoryMessages } from "./session-history-C5J1AKzG.js";
import { readNonBlankString } from "openclaw/plugin-sdk/string-coerce-runtime";
import path from "node:path";
import { buildBootstrapContextForFiles, buildWatchedSessionsHarnessContext, embeddedAgentLog, resolveBootstrapFilesForRun } from "openclaw/plugin-sdk/agent-harness-runtime";
import { createHash } from "node:crypto";
import { resolveAgentWorkspaceDir } from "openclaw/plugin-sdk/agent-runtime";
import { resolveBootstrapFilesForPreparation } from "openclaw/plugin-sdk/codex-mcp-projection";
import { prepareMemorySystemPromptAddition } from "openclaw/plugin-sdk/core";
import { MESSAGE_TOOL_DELIVERY_HINTS } from "openclaw/plugin-sdk/message-tool-delivery-hints";
//#region extensions/codex/src/app-server/attempt-context.ts
/**
* Builds Codex app-server prompt context, workspace bootstrap injections,
* system-prompt reports, and context-engine projection decisions.
*/
const CODEX_NATIVE_PROJECT_DOC_BASENAMES = /* @__PURE__ */ new Set(["agents.md"]);
const CODEX_TURN_SCOPED_WORKSPACE_DEVELOPER_CONTEXT_BASENAMES = /* @__PURE__ */ new Set([
	"identity.md",
	"soul.md",
	"user.md"
]);
const CODEX_WORKSPACE_DEVELOPER_CONTEXT_BASENAMES = new Set(CODEX_TURN_SCOPED_WORKSPACE_DEVELOPER_CONTEXT_BASENAMES);
const CODEX_MEMORY_CONTEXT_BASENAME = "memory.md";
const CODEX_MEMORY_TOOL_NAMES = /* @__PURE__ */ new Set(["memory_search", "memory_get"]);
const CODEX_BOOTSTRAP_CONTEXT_ORDER = /* @__PURE__ */ new Map([
	["soul.md", 10],
	["identity.md", 20],
	["user.md", 30],
	["bootstrap.md", 50],
	["memory.md", 60]
]);
/** Reads mirrored Codex session history for harness hooks. */
async function readMirroredSessionHistoryMessages(params) {
	const { admission, contextTokenBudget, ...target } = params; // v-codex-bounded-history-v1
	const messages = await readCodexMirroredSessionHistoryMessages(target, admission, "model-context", contextTokenBudget);
	if (!messages) embeddedAgentLog.warn("failed to read mirrored session history for codex harness hooks", { sessionFile: params.sessionFile });
	return messages;
}
/** Reads a valid thread-bootstrap projection request from context-engine output. */
function readContextEngineThreadBootstrapProjection(projection) {
	if (projection?.mode !== "thread_bootstrap") return;
	const epoch = projection.epoch?.trim();
	if (!epoch) {
		embeddedAgentLog.warn("context engine requested Codex thread-bootstrap projection without an epoch; using per-turn projection");
		return;
	}
	const fingerprint = projection.fingerprint?.trim();
	return {
		mode: "thread_bootstrap",
		epoch,
		...fingerprint ? { fingerprint } : {}
	};
}
/**
* Decides whether an existing Codex thread can reuse its context-engine
* bootstrap projection or must be reprojected.
*/
function resolveContextEngineBootstrapProjectionDecision(params) {
	const bindingProjection = params.startupBinding?.contextEngine?.projection;
	if (!params.startupBinding?.threadId || !bindingProjection) return {
		project: true,
		reason: !params.startupBinding?.threadId ? "missing-thread-binding" : "missing-projection-binding"
	};
	if (!params.expectedBinding || !isContextEngineBindingCompatible(params.startupBinding.contextEngine, params.expectedBinding)) return {
		project: true,
		reason: "context-engine-binding-mismatch"
	};
	if (!areCodexDynamicToolFingerprintsCompatible({
		previous: params.startupBinding.dynamicToolsFingerprint,
		next: params.dynamicToolsFingerprint,
		nextLegacy: params.legacyDynamicToolsFingerprint
	})) return {
		project: true,
		reason: "dynamic-tools-mismatch"
	};
	return bindingProjection.mode !== "thread_bootstrap" || bindingProjection.epoch !== params.projection.epoch || bindingProjection.fingerprint !== params.projection.fingerprint ? {
		project: true,
		reason: "projection-mismatch"
	} : {
		project: false,
		reason: "matching-thread-bootstrap-binding"
	};
}
/**
* Loads workspace bootstrap files and partitions them into Codex-native prompt,
* developer-instruction, heartbeat, and memory-tool contexts.
*/
/** A child baseline reads the bounded workspace snapshot without invoking admission hooks. */
async function prepareCodexWorkspaceDeveloperInstructions(params) {
	if (isSameCodexWorkspacePath(params.workspaceDir, params.cwd)) return;
	const files = await resolveBootstrapFilesForPreparation(params);
	return renderCodexWorkspaceDeveloperInstructions({
		files: selectCodexWorkspaceAgentProjectInstructionFiles(buildBootstrapContextForFiles(files, {
			config: params.config,
			agentId: params.agentId
		}), params.workspaceDir),
		header: "## OpenClaw Agent Workspace Instructions",
		preamble: "OpenClaw loaded this bounded snapshot from the configured agent workspace."
	});
}
async function buildCodexWorkspaceBootstrapContext(params) {
	try {
		const inheritsAgentWorkspace = (params.executionWorkspace ?? params.resolvedWorkspace) !== params.resolvedWorkspace;
		const promptWorkspace = inheritsAgentWorkspace ? params.resolvedWorkspace : params.effectiveWorkspace;
		const memoryToolsAvailable = params.memoryToolNames.length > 0 && canRouteCodexWorkspaceMemoryThroughTools({
			config: params.params.config,
			agentId: params.params.agentId ?? params.sessionAgentId,
			workspaceDir: inheritsAgentWorkspace ? params.resolvedWorkspace : params.effectiveWorkspace
		});
		const bootstrapFiles = await resolveBootstrapFilesForRun({
			workspaceDir: params.resolvedWorkspace,
			config: params.params.config,
			sessionKey: params.sessionKey,
			sessionId: params.params.sessionId,
			chatType: params.params.chatType,
			agentId: params.params.agentId ?? params.sessionAgentId,
			warn: (message) => embeddedAgentLog.warn(message),
			contextMode: params.params.bootstrapContextMode,
			runKind: params.params.bootstrapContextRunKind
		});
		const memoryToolRoutedBootstrapFiles = memoryToolsAvailable ? selectCodexWorkspaceMemoryReferenceFiles({
			bootstrapFiles,
			workspaceDir: params.resolvedWorkspace
		}) : [];
		const memoryReferenceFiles = memoryToolRoutedBootstrapFiles.map((file) => remapCodexContextFilePath({
			file: toCodexEmbeddedContextFile(file),
			sourceWorkspaceDir: params.resolvedWorkspace,
			targetWorkspaceDir: promptWorkspace
		}));
		const contextFiles = buildBootstrapContextForFiles(memoryToolsAvailable ? bootstrapFiles.filter((file) => !isCodexWorkspaceRootMemoryBootstrapFile({
			file,
			workspaceDir: params.resolvedWorkspace
		})) : bootstrapFiles, {
			config: params.params.config,
			agentId: params.params.agentId ?? params.sessionAgentId,
			warn: (message) => embeddedAgentLog.warn(message)
		}).map((file) => remapCodexContextFilePath({
			file,
			sourceWorkspaceDir: params.resolvedWorkspace,
			targetWorkspaceDir: promptWorkspace
		}));
		const promptContextFiles = selectCodexWorkspacePromptContextFiles(contextFiles, {
			excludeMemory: memoryToolsAvailable,
			memoryWorkspaceDir: params.effectiveWorkspace
		});
		const injectOpenClawContext = shouldInjectCodexOpenClawPromptContext(params.params);
		const restrictedProjectDocNeedsOpenClawCarrier = params.params.pluginHarnessToolPolicyRestricted === true && !params.params.disableTools && !isMessageOnlyCodexSourceReply(params.params) && params.params.bootstrapContextMode !== "lightweight";
		const threadDeveloperInstructionFiles = injectOpenClawContext && !params.ringZeroActive && (inheritsAgentWorkspace || restrictedProjectDocNeedsOpenClawCarrier) ? selectCodexWorkspaceAgentProjectInstructionFiles(contextFiles, params.resolvedWorkspace) : [];
		const turnScopedDeveloperInstructionFiles = injectOpenClawContext ? selectCodexWorkspaceTurnScopedDeveloperInstructionFiles(contextFiles) : [];
		return {
			bootstrapFiles,
			contextFiles,
			inheritsAgentWorkspace,
			promptContextFiles,
			threadDeveloperInstructionFiles,
			turnScopedDeveloperInstructionFiles,
			memoryReferenceFiles,
			memoryToolRoutedBootstrapFiles,
			memoryToolNames: [...params.memoryToolNames],
			memoryToolRouted: memoryToolsAvailable,
			promptContext: renderCodexWorkspaceBootstrapPromptContext(promptContextFiles),
			threadDeveloperInstructions: renderCodexWorkspaceDeveloperInstructions({
				files: threadDeveloperInstructionFiles,
				header: "## OpenClaw Agent Workspace Instructions",
				preamble: "OpenClaw loaded this bounded snapshot from the configured agent workspace."
			}),
			turnScopedDeveloperInstructions: renderCodexWorkspaceCollaborationDeveloperInstructions(turnScopedDeveloperInstructionFiles),
			memoryCollaborationInstructions: shouldInjectCodexOpenClawPromptContext(params.params) ? await renderCodexWorkspaceMemoryCollaborationInstructions({
				files: memoryReferenceFiles,
				toolNames: params.memoryToolNames,
				memoryToolRouted: memoryToolsAvailable,
				citationsMode: params.params.config?.memory?.citations,
				agentId: params.params.agentId ?? params.sessionAgentId,
				agentSessionKey: params.sessionKey,
				sandboxed: params.sandboxed
			}) : void 0
		};
	} catch (error) {
		embeddedAgentLog.warn("failed to load codex workspace bootstrap instructions", { error });
		return {
			bootstrapFiles: [],
			contextFiles: [],
			inheritsAgentWorkspace: false
		};
	}
}
/**
* Builds the prompt-size, bootstrap-file, skill, and tool-schema accounting
* report for a Codex run.
*/
function buildCodexSystemPromptReport(params) {
	const toolEntries = flattenCodexDynamicToolFunctions(params.tools).map(buildCodexToolReportEntry);
	const schemaChars = toolEntries.reduce((sum, tool) => sum + tool.schemaChars, 0);
	const skillsPrompt = params.skillsPrompt.trim();
	const bootstrapMaxChars = readPositiveNumber(params.attempt.config?.agents?.defaults?.bootstrapMaxChars);
	const bootstrapTotalMaxChars = readPositiveNumber(params.attempt.config?.agents?.defaults?.bootstrapTotalMaxChars);
	return {
		source: "run",
		generatedAt: Date.now(),
		sessionId: params.attempt.sessionId,
		sessionKey: params.sessionKey,
		provider: params.attempt.provider,
		model: params.attempt.modelId,
		workspaceDir: params.workspaceDir,
		...bootstrapMaxChars ? { bootstrapMaxChars } : {},
		...bootstrapTotalMaxChars ? { bootstrapTotalMaxChars } : {},
		systemPrompt: {
			chars: params.developerInstructions.length,
			projectContextChars: 0,
			nonProjectContextChars: params.developerInstructions.length,
			hash: sha256Text(params.developerInstructions)
		},
		injectedWorkspaceFiles: buildCodexBootstrapInjectionStats({
			bootstrapFiles: params.workspaceBootstrapContext.bootstrapFiles,
			injectedFiles: params.workspaceBootstrapContext.promptContextFiles ?? [],
			developerInstructionFiles: [...params.workspaceBootstrapContext.threadDeveloperInstructionFiles ?? [], ...params.workspaceBootstrapContext.turnScopedDeveloperInstructionFiles ?? []],
			memoryToolRoutedBootstrapFiles: params.workspaceBootstrapContext.memoryToolRoutedBootstrapFiles ?? [],
			memoryToolRouted: params.workspaceBootstrapContext.memoryToolRouted === true
		}),
		skills: {
			promptChars: skillsPrompt.length,
			hash: sha256Text(skillsPrompt),
			entries: buildCodexSkillReportEntries(skillsPrompt)
		},
		tools: {
			listChars: 0,
			schemaChars,
			entries: toolEntries
		}
	};
}
function buildCodexSkillReportEntries(skillsPrompt) {
	if (!skillsPrompt) return [];
	return Array.from(skillsPrompt.matchAll(/<skill>[\s\S]*?<\/skill>/gi)).map((match) => match[0] ?? "").map((block) => ({
		name: block.match(/<name>\s*([^<]+?)\s*<\/name>/i)?.[1]?.trim() || "(unknown)",
		blockChars: block.length
	})).filter((entry) => entry.blockChars > 0);
}
function buildCodexToolReportEntry(tool) {
	const summary = tool.description.trim();
	if (tool.deferLoading === true) return {
		name: tool.name,
		summaryChars: summary.length,
		summaryHash: sha256Text(summary),
		schemaChars: 0,
		schemaHash: stableJsonHash(null),
		propertiesCount: null
	};
	return {
		name: tool.name,
		summaryChars: summary.length,
		summaryHash: sha256Text(summary),
		...buildCodexToolSchemaStats(tool.inputSchema)
	};
}
function buildCodexToolSchemaStats(schema) {
	const schemaChars = (() => {
		try {
			return JSON.stringify(schema).length;
		} catch {
			return 0;
		}
	})();
	const properties = isJsonObject(schema) && isJsonObject(schema.properties) ? schema.properties : null;
	return {
		schemaChars,
		schemaHash: stableJsonHash(schema),
		propertiesCount: properties ? Object.keys(properties).length : null
	};
}
function sha256Text(value) {
	return createHash("sha256").update(value).digest("hex");
}
function normalizeForStableHash(value) {
	if (Array.isArray(value)) return value.map((entry) => normalizeForStableHash(entry));
	if (value && typeof value === "object") {
		const record = value;
		return Object.fromEntries(Object.keys(record).toSorted((left, right) => left.localeCompare(right)).map((key) => [key, normalizeForStableHash(record[key])]));
	}
	return value;
}
function stableJsonHash(value) {
	return sha256Text(JSON.stringify(normalizeForStableHash(value)) ?? "null");
}
function buildCodexBootstrapInjectionStats(params) {
	const injectedIndex = indexCodexContextFileContent(params.injectedFiles);
	const developerInstructionIndex = indexCodexContextFileContent(params.developerInstructionFiles ?? []);
	const memoryToolRoutedPaths = new Set((params.memoryToolRoutedBootstrapFiles ?? []).map((file) => readNonBlankString(file.path)).filter(isNonEmptyString).map(normalizeCodexContextFilePath));
	return params.bootstrapFiles.map((file) => {
		const fileName = readNonBlankString(file.name);
		const pathValue = readNonBlankString(file.path) ?? fileName ?? "";
		const displayName = (fileName ?? getCodexContextFileDisplayBasename(pathValue)) || pathValue;
		const baseName = getCodexContextFileBasename(pathValue || fileName || "");
		const rawChars = file.missing ? 0 : (file.content ?? "").trimEnd().length;
		const memoryToolRoutedFile = baseName === CODEX_MEMORY_CONTEXT_BASENAME && params.memoryToolRouted === true && memoryToolRoutedPaths.has(normalizeCodexContextFilePath(pathValue));
		const injected = memoryToolRoutedFile ? void 0 : readCodexIndexedContextFileContent(injectedIndex, pathValue, fileName) ?? readCodexIndexedContextFileContent(developerInstructionIndex, pathValue, fileName);
		if (!file.missing && injected === void 0 && CODEX_NATIVE_PROJECT_DOC_BASENAMES.has(baseName)) return {
			name: displayName,
			path: pathValue,
			missing: false,
			rawChars,
			injectionStatus: "native_unverified",
			injectedChars: null,
			truncated: null
		};
		const injectedChars = memoryToolRoutedFile ? 0 : injected?.length ?? 0;
		const truncated = memoryToolRoutedFile ? false : !file.missing && injectedChars < rawChars;
		return {
			name: displayName,
			path: pathValue,
			missing: file.missing,
			rawChars,
			injectedChars,
			truncated
		};
	});
}
function indexCodexContextFileContent(files) {
	const byPath = /* @__PURE__ */ new Map();
	const byBaseName = /* @__PURE__ */ new Map();
	for (const file of files) {
		const pathValue = readNonBlankString(file.path);
		if (!pathValue) continue;
		if (!byPath.has(pathValue)) byPath.set(pathValue, file.content);
		const baseName = getCodexContextFileBasename(pathValue);
		if (baseName && !byBaseName.has(baseName)) byBaseName.set(baseName, file.content);
	}
	return {
		byPath,
		byBaseName
	};
}
function readCodexIndexedContextFileContent(index, pathValue, fileName) {
	const pathContent = index.byPath.get(pathValue);
	if (pathContent !== void 0) return pathContent;
	if (fileName) {
		const nameContent = index.byPath.get(fileName);
		if (nameContent !== void 0) return nameContent;
	}
	const baseName = getCodexContextFileBasename(fileName ?? pathValue);
	return baseName ? index.byBaseName.get(baseName) : void 0;
}
function readPositiveNumber(value) {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : void 0;
}
/**
* Builds OpenClaw-provided workspace prompt context for the current Codex turn.
*/
function buildCodexOpenClawPromptContext(params) {
	if (!shouldInjectCodexOpenClawPromptContext(params.params)) return;
	const sections = [params.workspacePromptContext?.trim() ? [
		"## OpenClaw Workspace Context",
		"",
		params.workspacePromptContext.trim()
	].join("\n") : void 0, params.watchedSessionsContext?.trim() || void 0].filter(isNonEmptyString);
	if (sections.length === 0) return;
	return [
		"OpenClaw runtime context for this turn:",
		"Treat this OpenClaw-provided context as supporting project/user reference for the current request.",
		"",
		...sections
	].join("\n");
}
/**
* Renders the watched-sessions block for the Codex per-turn runtime context.
* Codex builds its own instruction layers, so the embedded prompt's Watched
* Sessions section must be re-surfaced here or Codex-backed main sessions
* keep refusing cross-session questions (openclaw#114797).
*/
function buildCodexWatchedSessionsContext(params) {
	if (!shouldInjectCodexOpenClawPromptContext(params.attempt)) return;
	return buildWatchedSessionsHarnessContext({
		config: params.attempt.config,
		sessionKey: params.sessionKey,
		sandboxed: params.sandboxed,
		toolNames: flattenCodexDynamicToolFunctions(params.dynamicTools).map((tool) => normalizeCodexDynamicToolName(tool.name))
	});
}
function shouldInjectCodexOpenClawPromptContext(params) {
	return !(params.bootstrapContextMode === "lightweight" && params.bootstrapContextRunKind === "cron");
}
/** Renders loaded OpenClaw skill prompts as Codex collaboration instructions. */
function renderCodexSkillsCollaborationInstructions(params) {
	if (!shouldInjectCodexOpenClawPromptContext(params.attempt)) return;
	return params.skillsPrompt?.trim() ? [
		"## OpenClaw Skills",
		"",
		params.skillsPrompt.trim()
	].join("\n") : void 0;
}
/**
* Prepends OpenClaw context while preserving leading delivery metadata as
* routing guidance instead of user request text.
*/
function prependCodexOpenClawPromptContext(prompt, context, options = {}) {
	const { deliveryHint, prompt: promptWithoutDeliveryHint } = splitLeadingCodexDeliveryHint(prompt);
	if (!context?.trim() && (!deliveryHint || options.preservePromptWithoutContext)) return prompt;
	const promptSection = promptWithoutDeliveryHint.startsWith("OpenClaw assembled context for this turn:") ? promptWithoutDeliveryHint : ["Current user request:", promptWithoutDeliveryHint].join("\n");
	const deliverySection = deliveryHint ? [
		"OpenClaw delivery metadata:",
		"This delivery metadata is runtime routing guidance, not the user's request.",
		deliveryHint
	].join("\n") : void 0;
	return [
		context?.trim(),
		deliverySection,
		promptSection
	].filter(Boolean).join("\n\n");
}
/**
* Maps the surviving user-request portion of an input range after delivery
* metadata has been relocated before the request.
*/
function resolveCodexDeliveryHintPreservedInputRange(params) {
	const { prompt, promptInputRange, decoratedPrompt } = params;
	const { deliveryHint, prompt: promptWithoutDeliveryHint } = splitLeadingCodexDeliveryHint(prompt);
	if (!deliveryHint || !promptInputRange || promptInputRange.start < 0 || promptInputRange.end < promptInputRange.start || promptInputRange.end > prompt.length || !decoratedPrompt.endsWith(promptWithoutDeliveryHint)) return;
	const promptWithoutDeliveryHintStart = prompt.length - promptWithoutDeliveryHint.length;
	const inputStart = Math.max(promptInputRange.start, promptWithoutDeliveryHintStart);
	const inputEnd = Math.max(inputStart, Math.min(promptInputRange.end, promptWithoutDeliveryHint.length + promptWithoutDeliveryHintStart));
	const decoratedPromptSuffixStart = decoratedPrompt.length - promptWithoutDeliveryHint.length;
	const requestHeader = "Current user request:\n";
	const requestHeaderStart = decoratedPromptSuffixStart - 22;
	return {
		start: inputStart === promptWithoutDeliveryHintStart && decoratedPrompt.slice(requestHeaderStart, decoratedPromptSuffixStart) === requestHeader ? requestHeaderStart : decoratedPromptSuffixStart + inputStart - promptWithoutDeliveryHintStart,
		end: decoratedPromptSuffixStart + inputEnd - promptWithoutDeliveryHintStart
	};
}
function splitLeadingCodexDeliveryHint(prompt) {
	const trimmedStart = prompt.trimStart();
	const matchedHint = MESSAGE_TOOL_DELIVERY_HINTS.find((hint) => trimmedStart.startsWith(hint));
	if (!matchedHint) return { prompt };
	return {
		deliveryHint: matchedHint,
		prompt: trimmedStart.slice(matchedHint.length).replace(/^\s*\n/, "").trimStart()
	};
}
function renderCodexWorkspaceBootstrapPromptContext(contextFiles) {
	const files = contextFiles;
	if (files.length === 0) return;
	const lines = [
		"OpenClaw loaded these user-editable workspace files for the current turn. Codex loads project-local AGENTS.md natively. When execution uses another folder, OpenClaw supplies the agent workspace AGENTS.md as thread-level developer instructions. SOUL.md, IDENTITY.md, and USER.md remain turn-scoped collaboration instructions. Those files are not repeated here.",
		"",
		"# Project Context",
		"",
		"The following project context files have been loaded:"
	];
	lines.push("");
	for (const file of files) lines.push(`## ${file.path}`, "", file.content, "");
	return lines.join("\n").trim();
}
function selectCodexWorkspacePromptContextFiles(contextFiles, options = {}) {
	const excludeMemory = options.excludeMemory ?? true;
	return contextFiles.filter((file) => {
		const baseName = getCodexContextFileBasename(file.path);
		return baseName && !CODEX_NATIVE_PROJECT_DOC_BASENAMES.has(baseName) && !CODEX_WORKSPACE_DEVELOPER_CONTEXT_BASENAMES.has(baseName) && (!excludeMemory || !isCodexWorkspaceRootMemoryContextFile({
			file,
			workspaceDir: options.memoryWorkspaceDir
		})) && !isMissingCodexBootstrapContextFile(file);
	}).toSorted(compareCodexContextFiles);
}
function selectCodexWorkspaceTurnScopedDeveloperInstructionFiles(contextFiles) {
	return selectCodexWorkspaceDeveloperInstructionFiles(contextFiles, CODEX_TURN_SCOPED_WORKSPACE_DEVELOPER_CONTEXT_BASENAMES);
}
function selectCodexWorkspaceAgentProjectInstructionFiles(contextFiles, agentWorkspaceDir) {
	const agentProjectDocPath = path.join(path.resolve(agentWorkspaceDir), "AGENTS.md");
	return selectCodexWorkspaceDeveloperInstructionFiles(contextFiles, CODEX_NATIVE_PROJECT_DOC_BASENAMES).filter((file) => path.resolve(file.path) === agentProjectDocPath);
}
function selectCodexWorkspaceDeveloperInstructionFiles(contextFiles, basenames) {
	return contextFiles.filter((file) => {
		const baseName = getCodexContextFileBasename(file.path);
		return baseName && basenames.has(baseName) && !isMissingCodexBootstrapContextFile(file) && file.content.trim().length > 0;
	}).toSorted(compareCodexContextFiles);
}
function renderCodexWorkspaceCollaborationDeveloperInstructions(files) {
	return renderCodexWorkspaceDeveloperInstructions({
		files,
		header: "## OpenClaw Agent Soul",
		preamble: "OpenClaw loaded these workspace instruction files from the active agent workspace. They are the canonical definitions of who you are, how you think and work, and the human you work alongside. Internalize and follow them accordingly.",
		wrapperTag: "AGENT_SOUL"
	});
}
function renderCodexWorkspaceDeveloperInstructions(params) {
	const { files, header, preamble, wrapperTag } = params;
	if (files.length === 0) return;
	const lines = [
		header,
		"",
		preamble,
		""
	];
	if (wrapperTag) lines.push(`<${wrapperTag}>`, "");
	for (const file of files) lines.push(`### ${file.path}`, "", file.content, "");
	if (wrapperTag) lines.push(`</${wrapperTag}>`);
	return lines.join("\n").trim();
}
function selectCodexWorkspaceMemoryReferenceFiles(params) {
	return params.bootstrapFiles.filter((file) => {
		return isCodexWorkspaceRootMemoryBootstrapFile({
			file,
			workspaceDir: params.workspaceDir
		}) && !file.missing && (file.content ?? "").trim().length > 0;
	}).toSorted(compareCodexBootstrapFiles);
}
/**
* Renders a memory-file reference that points Codex at memory tools instead of
* embedding MEMORY.md contents.
*/
function renderCodexWorkspaceMemoryReference(params) {
	if (params.files.length === 0) return;
	const lines = [
		"## OpenClaw Workspace Memory",
		"",
		`MEMORY.md exists in the active agent workspace as a memory file, not an instruction file. OpenClaw does not paste its contents into native Codex turns; use ${(params.toolNames?.length ? params.toolNames : Array.from(CODEX_MEMORY_TOOL_NAMES)).join(" or ")} when durable memory is relevant and the tools are available.`,
		""
	];
	for (const file of params.files) lines.push(`- ${file.path}`);
	return lines.join("\n").trim();
}
async function renderCodexWorkspaceMemoryCollaborationInstructions(params) {
	const sections = [params.memoryToolRouted ? await renderCodexMemoryRecallInstructions({
		toolNames: params.toolNames,
		citationsMode: params.citationsMode,
		agentId: params.agentId,
		agentSessionKey: params.agentSessionKey,
		sandboxed: params.sandboxed
	}) : void 0, renderCodexWorkspaceMemoryReference({
		files: params.files,
		toolNames: params.toolNames
	})].filter(isNonEmptyString);
	return sections.length > 0 ? sections.join("\n\n") : void 0;
}
async function renderCodexMemoryRecallInstructions(params) {
	const availableTools = new Set(params.toolNames);
	const memoryPrompt = await prepareMemorySystemPromptAddition({
		availableTools,
		citationsMode: params.citationsMode,
		agentId: params.agentId,
		agentSessionKey: params.agentSessionKey,
		sandboxed: params.sandboxed
	});
	if (!memoryPrompt) return;
	return [memoryPrompt, renderCodexMemoryToolSearchBridge(params.toolNames)].filter(isNonEmptyString).join("\n").trim();
}
function renderCodexMemoryToolSearchBridge(toolNames) {
	const memoryToolNames = toolNames.map((name) => normalizeCodexDynamicToolName(name)).filter((name) => CODEX_MEMORY_TOOL_NAMES.has(name)).toSorted();
	if (memoryToolNames.length === 0) return;
	return `Codex may expose ${memoryToolNames.join(" and ")} as deferred tools. When the memory guidance above calls for memory recall, use an already-loaded memory tool directly. If the needed memory tool is deferred and not currently callable, use \`tool_search\` to load it, then call that memory tool.`;
}
/** Lists available memory tool names understood by Codex workspace memory routing. */
function getCodexWorkspaceMemoryToolNames(tools) {
	const availableToolNames = new Set(flattenCodexDynamicToolFunctions(tools).map((tool) => normalizeCodexDynamicToolName(tool.name)));
	return Array.from(CODEX_MEMORY_TOOL_NAMES).filter((name) => availableToolNames.has(name));
}
function canRouteCodexWorkspaceMemoryThroughTools(params) {
	if (!params.config) return false;
	return isSameCodexWorkspacePath(resolveAgentWorkspaceDir(params.config, params.agentId), params.workspaceDir);
}
function isMissingCodexBootstrapContextFile(file) {
	return file.content.trimStart().startsWith("[MISSING] Expected at:");
}
function toCodexEmbeddedContextFile(file) {
	return {
		path: readNonBlankString(file.path) ?? readNonBlankString(file.name) ?? "",
		content: file.content ?? ""
	};
}
function isCodexWorkspaceRootMemoryBootstrapFile(params) {
	return isCodexWorkspaceRootMemoryPath({
		filePath: readNonBlankString(params.file.path) ?? readNonBlankString(params.file.name) ?? "",
		workspaceDir: params.workspaceDir
	});
}
function isCodexWorkspaceRootMemoryContextFile(params) {
	if (!params.workspaceDir) return false;
	return isCodexWorkspaceRootMemoryPath({
		filePath: params.file.path,
		workspaceDir: params.workspaceDir
	});
}
function isCodexWorkspaceRootMemoryPath(params) {
	const filePath = params.filePath.trim();
	if (!filePath) return false;
	return (path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(params.workspaceDir, filePath)) === path.join(path.resolve(params.workspaceDir), "MEMORY.md");
}
function isSameCodexWorkspacePath(left, right) {
	return path.resolve(left) === path.resolve(right);
}
/**
* Remaps bootstrap file paths from the resolved workspace to the effective Codex
* workspace while preserving platform path separators.
*/
function remapCodexContextFilePath(params) {
	const relativePath = path.relative(params.sourceWorkspaceDir, params.file.path);
	if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath) || params.sourceWorkspaceDir === params.targetWorkspaceDir) return params.file;
	const targetUsesPosixSeparators = params.targetWorkspaceDir.includes("/") && !params.targetWorkspaceDir.includes("\\");
	const normalizedRelativePath = targetUsesPosixSeparators ? relativePath.replaceAll("\\", "/") : relativePath.replaceAll("/", "\\");
	return {
		...params.file,
		path: targetUsesPosixSeparators ? path.posix.join(params.targetWorkspaceDir, normalizedRelativePath) : path.win32.join(params.targetWorkspaceDir, normalizedRelativePath)
	};
}
function compareCodexContextFiles(left, right) {
	const leftPath = normalizeCodexContextFilePath(left.path);
	const rightPath = normalizeCodexContextFilePath(right.path);
	const leftBase = getCodexContextFileBasename(left.path);
	const rightBase = getCodexContextFileBasename(right.path);
	const leftOrder = CODEX_BOOTSTRAP_CONTEXT_ORDER.get(leftBase) ?? Number.MAX_SAFE_INTEGER;
	const rightOrder = CODEX_BOOTSTRAP_CONTEXT_ORDER.get(rightBase) ?? Number.MAX_SAFE_INTEGER;
	if (leftOrder !== rightOrder) return leftOrder - rightOrder;
	if (leftBase !== rightBase) return leftBase.localeCompare(rightBase);
	return leftPath.localeCompare(rightPath);
}
function compareCodexBootstrapFiles(left, right) {
	return compareCodexContextFiles(toCodexEmbeddedContextFile(left), toCodexEmbeddedContextFile(right));
}
function normalizeCodexContextFilePath(filePath) {
	return filePath.trim().replaceAll("\\", "/").toLowerCase();
}
function getCodexContextFileDisplayBasename(filePath) {
	return filePath.trim().replaceAll("\\", "/").split("/").pop()?.trim() ?? "";
}
function getCodexContextFileBasename(filePath) {
	return normalizeCodexContextFilePath(filePath).split("/").pop() ?? "";
}
function normalizeCodexDynamicToolName(name) {
	return name.trim().toLowerCase();
}
function isNonEmptyString(value) {
	return typeof value === "string" && value.length > 0;
}
//#endregion
export { getCodexWorkspaceMemoryToolNames as a, readContextEngineThreadBootstrapProjection as c, resolveCodexDeliveryHintPreservedInputRange as d, resolveContextEngineBootstrapProjectionDecision as f, buildCodexWorkspaceBootstrapContext as i, readMirroredSessionHistoryMessages as l, buildCodexSystemPromptReport as n, prepareCodexWorkspaceDeveloperInstructions as o, buildCodexWatchedSessionsContext as r, prependCodexOpenClawPromptContext as s, buildCodexOpenClawPromptContext as t, renderCodexSkillsCollaborationInstructions as u };
