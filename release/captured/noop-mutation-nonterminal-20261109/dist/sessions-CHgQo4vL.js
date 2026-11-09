import { r as __exportAll } from "./rolldown-runtime-Dr7-SnC6.js";
import { C as parseStrictNonNegativeInteger, F as resolveTimerTimeoutMs, M as resolveNonNegativeIntegerOption, j as resolveIntegerOption, v as parseDateFirstTimestampMs } from "./number-coercion-CLj0HTDM.js";
import { i as resolveGlobalSingleton, n as resolveGlobalMap } from "./global-singleton-Dc_stLtU.js";
import { l as toErrorObject, t as coerceErrorMessage } from "./error-coercion-CwcmpTBO.js";
import { c as isRecord, i as asOptionalObjectRecord } from "./record-coerce-DItp3I4t.js";
import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.js";
import { n as sliceUtf16Safe, r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { n as getRuntimeConfig } from "./io.runtime-CKu7Rw0j.js";
import { t as resolveIdentityPathViaExistingAncestorSync } from "./boundary-path-DMNeww4q.js";
import { t as mergeDeep } from "./deep-merge-DhxZfAYh.js";
import { r as isMissingPathError, t as hasErrnoCode } from "./errno-CkbDOfLk.js";
import { r as isPathInside } from "./path-guards-Cp-mGr3-.js";
import { g as shortenPathWithHome } from "./utils-D3A1hGii.js";
import { t as sleep } from "./sleep-D7nua6TP.js";
import { t as getWorkerDeployHighlightJs } from "./worker-deploy-runtime-registry-ytJIJf-o.js";
import { o as isDefaultStateDir } from "./paths-Dx1CjxA5.js";
import "./errors-u9zSVTak.js";
import { i as readRegularFileSync, r as readRegularFile } from "./regular-file-Equ4rrfE.js";
import { t as createSubsystemLogger } from "./subsystem-bfHYmnCE.js";
import { s as installOpenClawInternalCorePackageNativeResolver } from "./plugin-module-loader-cache-C4l9L2gm.js";
import { n as buildPluginLoaderJitiOptions, t as buildPluginLoaderAliasMap } from "./sdk-alias-C6604U-C.js";
import { r as decodeWindowsTextFileBuffer, t as createWindowsOutputDecoder } from "./windows-encoding-DvBW57G0.js";
import { n as getCurrentPluginMetadataSnapshot } from "./current-plugin-metadata-snapshot-BqMIdsHK.js";
import { c as resolvePluginMetadataSnapshot } from "./plugin-metadata-snapshot-BuNx7zRZ.js";
import { m as resolveAgentWorkspaceDir, y as resolveDefaultAgentId } from "./agent-scope-config-CUiGBd59.js";
import "./defaults-CdX9UGcX.js";
import "./agent-scope-CSlN0kZb.js";
import { o as parseGitUrl } from "./zod-schema.cloud-workers-D_7bv0Z7.js";
import { s as withFileLock } from "./file-lock-BBkXFzlE.js";
import "./file-lock-D_h5coVv.js";
import "./config-Cv60gBux.js";
import { a as createCommandTerminationController, c as spawnCommand, h as releaseChildProcessOutputAfterExit } from "./exec-D7bZ8DC6.js";
import { n as truncateUtf8Suffix, t as truncateUtf8Prefix } from "./utf8-truncate-CwYSlvjM.js";
import { i as OAuthProviderRegistry, r as OAuthProviderConfiguredUnavailableError } from "./paths-C4SynZrk.js";
import { i as loginProviderOAuthWithPlugin, s as resolveProviderOAuthCredentialWithPlugin } from "./provider-runtime.runtime.js";
import { a as resolveOAuthRefreshLockPath } from "./path-resolve-DsQrdy7Z.js";
import { _ as runAuthProfileWriteTransaction, a as inspectPersistedAuthProfileStateRaw, h as resolveAuthProfileDatabasePath, o as inspectPersistedAuthProfileStoreRaw } from "./sqlite-B43NcCAq.js";
import { I as OAUTH_REFRESH_LOCK_OPTIONS, a as loadPersistedAuthProfileStore, f as loadPersistedAuthProfileState } from "./persisted-DzIu-muU.js";
import { i as assertAuthProfileMigrationReady, n as AuthProfileStoreUnreadableError, t as AuthProfileMigrationRequiredError } from "./legacy-source-diagnostic-BjEZkhfA.js";
import { c as getRuntimeAuthProfileStoreSnapshotCore } from "./runtime-snapshots-C1iF8uaR.js";
import { p as loadAuthProfileStoreForSecretsRuntime, x as saveAuthProfileStoreWithPreparedOwner } from "./store-CZzbMlii.js";
import { r as classifyRateLimitWindow, t as isRetryableAssistantError } from "./retry-D8sSkt2R.js";
import { l as llm_exports } from "./llm-Bnf7lhlE.js";
import { s as makeZeroUsageSnapshot } from "./usage-CtmV8Xxq.js";
import { a as DEFAULT_MAX_LINES, c as truncateLine, d as generateBranchSummary$1, f as prepareBranchEntries, g as uuidv7, h as runAgentLoop, i as DEFAULT_MAX_BYTES, l as truncateTail, m as substituteArgs, n as openClawAgentCoreRuntime, o as formatSize, p as parseCommandArgs, s as truncateHead, t as Agent, u as collectEntriesForBranchSummaryFromBranches } from "./agent-core-BxgCPa8O.js";
import { c as copyInternalToolExecutionPreparer } from "./internal-hooks-CiSltLvS.js";
import { F as COMPACTION_SUMMARY_PREFIX, I as COMPACTION_SUMMARY_SUFFIX, L as bashExecutionToText, N as BRANCH_SUMMARY_PREFIX, O as InvalidSummaryOutputError, P as BRANCH_SUMMARY_SUFFIX, R as convertToLlm, T as serializeConversation, _ as shouldCompact, c as capCompactionSummary, d as estimateTokens, f as findCutPoint, g as prepareCompaction$1, h as getLastAssistantUsage, k as buildSessionContext, l as compact$1, m as generateSummary$1, p as findTurnStartIndex, s as calculateContextTokens, t as DEFAULT_COMPACTION_SETTINGS, u as estimateContextTokens } from "./compaction-DlElLXrZ.js";
import { t as getAgentToolExecutionContext } from "./tool-execution-context-C6v2UVPI.js";
import { l as getStreamLlmRuntime, o as bindStreamLlmRuntime } from "./stream-BbY-2nPo.js";
import { o as convertImageToPng, s as createImageProcessor } from "./image-ops-CkENcywK.js";
import { f as parseSessionEntries, h as generateSessionEntryId, l as normalizeLoadedFileEntry, o as migrateSessionEntries, r as getLatestCompactionEntry, t as buildSessionContext$1 } from "./session-manager-codec-CaIkXyYs.js";
import { i as wrapUntrustedPromptDataBlock } from "./sanitize-for-prompt-C5q9LjmF.js";
import "./version-Bsehiavt.js";
import { n as attachRuntimePromptMediaFacts } from "./media-facts-CN7USs9i.js";
import { n as readRuntimePromptImageFactIndexes } from "./runtime-prompt-image-provenance-a6jbLyXX.js";
import { t as extractFrontmatterBlock } from "./frontmatter-CWJFi-rx.js";
import { t as applyAssistantDeliveryDirectives } from "./transcript-assistant-delivery-B70XwVDs.js";
import { r as copyCodeModeControlToolIdentity } from "./code-mode-control-tools-E097WPds.js";
import { K as prepareCodeModeSourceAppend, q as takeCodeModeResponseSource } from "./session-accessor.sqlite-transcript-store-DV0WFe1a.js";
import { c as getReadmePath, i as getAgentDir, l as isBunBinary, n as CONFIG_DIR_NAME, o as getDocsPath, r as PACKAGE_MANIFEST_VERSION, s as getExamplesPath } from "./config-Wv6IuErc.js";
import { a as getBashShellEnv, i as getBashShellConfig, n as createStreamingBinaryOutputSanitizer, s as sanitizeBinaryOutput, t as buildShellCommandInvocation } from "./shell-utils-We_VISCR.js";
import { t as parseModelCatalogJson } from "./model-catalog-json-CxUsDrkg.js";
import { i as isGeneratedPluginModelCatalog, o as loadPersistedPluginModelCatalogs, r as filterGeneratedPluginModelCatalogProviders } from "./plugin-model-catalog-55XYIoBQ.js";
import "./ai-transport-runtime-host-BCAHK6CH.js";
import { n as formatPathRelativeToCwdOrAbsolute, r as isLocalPath, t as canonicalizePath } from "./paths-CIwQeLl6.js";
import { t as SessionManager } from "./session-manager-CNTG_BAJ.js";
import { t as acquireFileLockSyncWithRetry } from "./file-lock-sync-DeZu8RlO.js";
import { a as createSourceInfo, i as resolveSkillDisplayName, o as createSyntheticSourceInfo } from "./skill-contract-6Z2EHE_Q.js";
import { i as formatDurationSeconds } from "./format-duration-Dhk0Yxqe.js";
import { t as decodeHtmlEntities } from "./html-entities-CvDVeY8C.js";
import { n as textResult } from "./tool-results-BCM3fdVS.js";
import "./common-BhOX6DcU.js";
import { t as levenshteinDistance } from "./levenshtein-distance-C0TL9gUO.js";
import { a as resolveToCwd, i as resolveLocalPathToCwd, n as getReadPathVariants, r as getReadQueuePaths } from "./path-utils-ZSJUke_V.js";
import { t as ensureTool } from "./tools-manager-DLRpy_9m.js";
import { i as normalizePositiveLimit, n as appendBoundedTextTail, r as formatStderrTail } from "./limits-CtWn0WBC.js";
import { i as normalizeMediaReferenceSource, r as classifyMediaReferenceSource, s as resolveMediaReferenceLocalPath } from "./media-reference-D2cwQT4h.js";
import { c as estimateToolResultTextChars, s as toolResultFitsBudget, u as sliceToolResultTextToBudget } from "./tool-result-limits-DdMvF_Ec.js";
import { n as resolveSkillInvocationPolicy, t as parseSkillFrontmatter } from "./frontmatter-D0rvP-g_.js";
import { t as formatSkillsForPromptBounded } from "./skill-prompt-limits-DPQc8PcJ.js";
import { createRequire } from "node:module";
import * as fs$2 from "node:fs";
import fs, { chmodSync, constants, createWriteStream, existsSync, globSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import * as path$1 from "node:path";
import path, { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { execSync, spawnSync } from "node:child_process";
import * as os$1 from "node:os";
import { homedir, tmpdir } from "node:os";
import { createHash, randomBytes } from "node:crypto";
import chalk from "chalk";
import * as bundledTypeboxFormat from "typebox/format";
import * as bundledTypebox from "typebox";
import { Type } from "typebox";
import { EventEmitter } from "node:events";
import * as bundledTypeboxCompile from "typebox/compile";
import { Compile } from "typebox/compile";
import * as bundledTypeboxValue from "typebox/value";
import { isCompactionReplayCheckpoint } from "@openclaw/ai/transports";
import { clampThinkingLevel, cleanupSessionResources, findEnvKeys, getEnvApiKey, getSupportedThinkingLevels, isContextOverflow, modelsAreEqual } from "@openclaw/ai/internal/runtime";
import { registerBuiltInApiProviders } from "@openclaw/ai/providers";
import { createApiRegistry, createLlmRuntime } from "@openclaw/ai";
import { parse as parse$1 } from "yaml";
import { finished } from "node:stream/promises";
import { minimatch } from "minimatch";
import ignore from "ignore";
import { Box, Container, Spacer, Text, getCapabilities, getImageDimensions, getKeybindings, imageFallback, truncateToWidth } from "@earendil-works/pi-tui";
import { FILE_HEADERS_ONLY, createPatch, diffWords, structuredPatch } from "diff";
import { createInterface } from "node:readline";
//#region src/agents/model-discovery-context.ts
/**
* Shared context resolvers for model discovery.
* Keeps callers from reaching into runtime config or plugin metadata snapshot
* plumbing directly.
*/
/** Resolve the workspace directory model discovery should use for agent scope. */
function resolveModelWorkspaceDir(cfg, explicitWorkspaceDir, agentId) {
	if (explicitWorkspaceDir !== void 0 || !cfg) return explicitWorkspaceDir;
	return resolveAgentWorkspaceDir(cfg, agentId ?? resolveDefaultAgentId(cfg));
}
/**
* Resolve the plugin metadata snapshot for model discovery.
*
* Explicit snapshots win for tests and prepared runtimes. Otherwise we prefer
* the current process snapshot, then fall back to resolving from config/env.
*/
function resolveModelPluginMetadataSnapshot(params) {
	if (params.pluginMetadataSnapshot) return params.pluginMetadataSnapshot;
	const env = params.env ?? process.env;
	try {
		const config = params.config ?? (params.useRuntimeConfig ? getRuntimeConfig() : void 0);
		return getCurrentPluginMetadataSnapshot({
			allowWorkspaceScopedSnapshot: true,
			env,
			...config ? { config } : {},
			...params.workspaceDir ? { workspaceDir: params.workspaceDir } : {}
		}) ?? resolvePluginMetadataSnapshot({
			config: config ?? {},
			env,
			...params.workspaceDir ? { workspaceDir: params.workspaceDir } : {},
			...params.allowWorkspaceScopedCurrent !== void 0 ? { allowWorkspaceScopedCurrent: params.allowWorkspaceScopedCurrent } : {}
		});
	} catch {
		return;
	}
}
//#endregion
//#region src/agents/compaction-usage.ts
function parseCompactionUsageTimestamp(value) {
	return parseDateFirstTimestampMs(value) ?? null;
}
function stripStaleAssistantUsageBeforeLatestCompaction(messages, options = {}) {
	const latestCompactionSummaryIndex = messages.findLastIndex((entry) => entry?.role === "compactionSummary");
	const hasCompactionSummary = latestCompactionSummaryIndex !== -1;
	if (!hasCompactionSummary && options.whenMissingCompactionSummary !== "zeroAssistantUsage") return messages;
	const latestCompactionTimestamp = parseCompactionUsageTimestamp(messages[latestCompactionSummaryIndex]?.timestamp);
	let out = messages;
	for (let i = 0; i < messages.length; i += 1) {
		const candidate = messages[i];
		if (candidate?.role !== "assistant" || !candidate.usage || typeof candidate.usage !== "object") continue;
		const messageTimestamp = parseCompactionUsageTimestamp(candidate.timestamp);
		if (!(!hasCompactionSummary || (latestCompactionTimestamp !== null && messageTimestamp !== null ? messageTimestamp <= latestCompactionTimestamp : i < latestCompactionSummaryIndex))) continue;
		if (out === messages && !options.mutate) out = [...messages];
		out[i] = {
			...candidate,
			usage: makeZeroUsageSnapshot()
		};
	}
	return out;
}
//#endregion
//#region src/agents/thinking-signatures.ts
function isAssistantMessageWithContent(message) {
	return Boolean(message) && typeof message === "object" && message.role === "assistant" && Array.isArray(message.content);
}
function isThinkingBlock(block) {
	return Boolean(block) && typeof block === "object" && (block.type === "thinking" || block.type === "redacted_thinking");
}
function stripSignatureFieldsFromThinkingBlock(block) {
	const stripped = { ...block };
	Reflect.deleteProperty(stripped, "thinkingSignature");
	Reflect.deleteProperty(stripped, "signature");
	Reflect.deleteProperty(stripped, "thought_signature");
	if (Reflect.get(block, "type") === "redacted_thinking") Reflect.deleteProperty(stripped, "data");
	return stripped;
}
function stripThinkingSignaturesFromMessage(message) {
	if (!isAssistantMessageWithContent(message)) return message;
	let changed = false;
	const newContent = [];
	for (const block of message.content) {
		if (!isThinkingBlock(block)) {
			newContent.push(block);
			continue;
		}
		const type = Reflect.get(block, "type");
		if (!(Reflect.get(block, "thinkingSignature") != null || Reflect.get(block, "signature") != null || Reflect.get(block, "thought_signature") != null || type === "redacted_thinking" && Reflect.get(block, "data") != null)) {
			newContent.push(block);
			continue;
		}
		newContent.push(stripSignatureFieldsFromThinkingBlock(block));
		changed = true;
	}
	return changed ? {
		...message,
		content: newContent
	} : message;
}
/**
* Strip signatures from assistant messages generated before the latest compaction.
* Their signatures are bound to the replaced prompt prefix and cannot be replayed.
*/
function stripStaleThinkingSignaturesForCompactionReplay(messages) {
	let latestCompactionTimestamp = null;
	for (const message of messages) {
		if (message.role !== "compactionSummary") continue;
		const timestamp = parseDateFirstTimestampMs(message.timestamp);
		if (timestamp !== void 0) latestCompactionTimestamp = latestCompactionTimestamp === null ? timestamp : Math.max(latestCompactionTimestamp, timestamp);
	}
	if (latestCompactionTimestamp === null) return messages;
	let touched = false;
	const out = messages.map((message) => {
		if (!isAssistantMessageWithContent(message)) return message;
		const timestamp = parseDateFirstTimestampMs(message.timestamp);
		if (timestamp === void 0 || timestamp >= latestCompactionTimestamp) return message;
		const stripped = stripThinkingSignaturesFromMessage(message);
		touched ||= stripped !== message;
		return stripped;
	});
	return touched ? out : messages;
}
//#endregion
//#region src/agents/compaction-replay.ts
/** Keep every transcript rebuild safe for the next provider request. */
function sanitizeCompactionReplayMessages(messages) {
	return stripStaleThinkingSignaturesForCompactionReplay(stripStaleAssistantUsageBeforeLatestCompaction(messages));
}
//#endregion
//#region src/agents/agent-hooks/compaction-instructions.ts
/**
* Compaction instruction utilities.
*
* Provides default language-preservation instructions and a precedence-based
* resolver for customInstructions used during context compaction summaries.
*/
/**
* Default instructions injected into every safeguard-mode compaction summary.
* Preserves conversation language and persona while keeping the SDK's required
* summary structure intact.
*/
const DEFAULT_COMPACTION_INSTRUCTIONS = "Write the summary body in the primary language used in the conversation.\nFocus on factual content: what was discussed, decisions made, and current state.\nKeep the required summary structure and section headers unchanged.\nDo not translate or alter code, file paths, identifiers, or error messages.";
/**
* Upper bound on custom instruction length to prevent prompt bloat.
* ~800 chars ≈ ~200 tokens — keeps summarization quality stable.
*/
const MAX_INSTRUCTION_LENGTH = 800;
/**
* Resolve compaction instructions with precedence:
*   event (SDK) → runtime (config) → DEFAULT constant.
*
* Each input is normalized first (trim + empty→undefined) so that blank
* strings don't short-circuit the fallback chain.
*/
function resolveCompactionInstructions(eventInstructions, runtimeInstructions) {
	const resolved = normalizeOptionalString(eventInstructions) ?? normalizeOptionalString(runtimeInstructions) ?? DEFAULT_COMPACTION_INSTRUCTIONS;
	return Array.from(resolved).slice(0, MAX_INSTRUCTION_LENGTH).join("");
}
//#endregion
//#region src/sessions/user-turn-transcript-runtime-context.ts
const RUNTIME_USER_TURN_TRANSCRIPT_CONTEXT = Symbol.for("openclaw.runtimeUserTurnTranscriptContext");
const RUNTIME_USER_TURN_TRANSCRIPT_RECORDER = Symbol.for("openclaw.runtimeUserTurnTranscriptRecorder");
/** Carries transcript-only fields with a queued runtime message without exposing them to the model. */
function attachRuntimeUserTurnTranscriptContext(runtimeMessage, context) {
	Object.defineProperty(runtimeMessage, RUNTIME_USER_TURN_TRANSCRIPT_CONTEXT, {
		configurable: true,
		value: context
	});
	return runtimeMessage;
}
/** Consumes the transient queued-turn context before the message is serialized. */
function takeRuntimeUserTurnTranscriptContext(runtimeMessage) {
	const context = Reflect.get(runtimeMessage, RUNTIME_USER_TURN_TRANSCRIPT_CONTEXT);
	if (context) Reflect.deleteProperty(runtimeMessage, RUNTIME_USER_TURN_TRANSCRIPT_CONTEXT);
	return context;
}
/** Keeps the queued recorder attached to the exact final message until persistence succeeds. */
function attachRuntimeUserTurnTranscriptRecorder(runtimeMessage, recorder) {
	Object.defineProperty(runtimeMessage, RUNTIME_USER_TURN_TRANSCRIPT_RECORDER, {
		configurable: true,
		value: recorder
	});
	return runtimeMessage;
}
function readRuntimeUserTurnTranscriptRecorder(runtimeMessage) {
	return Reflect.get(runtimeMessage, RUNTIME_USER_TURN_TRANSCRIPT_RECORDER);
}
/** A steered message retains its own live custody while another turn owns the runtime. */
function withRuntimeUserTurnTranscriptRecorder(runtimeMessage, append) {
	const recorder = readRuntimeUserTurnTranscriptRecorder(runtimeMessage);
	return recorder?.withPendingInput ? recorder.withPendingInput(append) : append();
}
function takeRuntimeUserTurnTranscriptRecorder(runtimeMessage) {
	const recorder = readRuntimeUserTurnTranscriptRecorder(runtimeMessage);
	if (recorder) Reflect.deleteProperty(runtimeMessage, RUNTIME_USER_TURN_TRANSCRIPT_RECORDER);
	return recorder;
}
//#endregion
//#region src/agents/utils/frontmatter.ts
/**
* YAML frontmatter parsing helpers.
*
* Agent docs/tools use this to split optional Markdown frontmatter from the
* body while preserving normal content when no complete frontmatter fence exists.
*/
const normalizeNewlines = (value) => value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
/** Parses optional YAML frontmatter from Markdown-like content. */
const parsePromptFrontmatter = (content) => {
	const normalized = normalizeNewlines(content);
	const extracted = extractFrontmatterBlock(normalized);
	if (!extracted) return {
		frontmatter: {},
		body: normalized
	};
	return {
		frontmatter: parse$1(extracted.block) ?? {},
		body: extracted.body.trim()
	};
};
/** Removes YAML frontmatter from content when a complete frontmatter block exists. */
const stripFrontmatter = (content) => parsePromptFrontmatter(content).body;
//#endregion
//#region src/agents/sessions/agent-session-utils.ts
function unwrapCoreResult(result) {
	if (result.ok) return result.value;
	throw result.error;
}
function normalizeBranchSummaryResult(result) {
	if (result.ok) return result.value;
	if (result.error.code === "aborted") return {
		aborted: true,
		error: result.error.message
	};
	return { error: result.error.message };
}
function hasPersistedAssistantContent(content) {
	return (typeof content === "string" || Array.isArray(content)) && content.length > 0;
}
function extractTextContent(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	let text = "";
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		const candidate = block;
		if (candidate.type === "text" && typeof candidate.text === "string") text += candidate.text;
	}
	return text;
}
function replaceAgentMessageInPlace(target, replacement) {
	if (target === replacement) return;
	for (const key of Object.keys(target)) Reflect.deleteProperty(target, key);
	Object.assign(target, replacement);
}
function estimateMessagesFromContent(messages) {
	return messages.reduce((total, message) => total + estimateTokens(message), 0);
}
//#endregion
//#region src/agents/sessions/auth-guidance.ts
/**
* Shared user-facing auth guidance for session/model selection failures.
*
* Uses docs paths instead of provider-specific instructions so guidance stays correct across OAuth/API-key providers.
*/
const UNKNOWN_PROVIDER = "unknown";
/** Returns the standard provider login help block. */
function getProviderLoginHelp() {
	return [
		"Use /login to log into a provider via OAuth or API key. See:",
		`  ${join(getDocsPath(), "providers.md")}`,
		`  ${join(getDocsPath(), "models.md")}`
	].join("\n");
}
/** Formats the message shown when no configured model can be used. */
function formatNoModelsAvailableMessage() {
	return `No models available. ${getProviderLoginHelp()}`;
}
/** Formats the message shown before a model is selected. */
function formatNoModelSelectedMessage() {
	return `No model selected.\n\n${getProviderLoginHelp()}\n\nThen use /model to select a model.`;
}
/** Formats the missing API key guidance for a provider or unknown selected model. */
function formatNoApiKeyFoundMessage(provider) {
	return `No API key found for ${provider === UNKNOWN_PROVIDER ? "the selected model" : provider}.\n\n${getProviderLoginHelp()}`;
}
//#endregion
//#region src/agents/sessions/event-bus.ts
/**
* Tiny event bus abstraction for session UI/runtime notifications.
*
* Isolates handler failures so one bad subscriber cannot break later listeners.
*/
/** Creates an in-process event bus with unsubscribe and clear support. */
function createEventBus() {
	const emitter = new EventEmitter();
	return {
		emit: (channel, data) => {
			emitter.emit(channel, data);
		},
		on: (channel, handler) => {
			const safeHandler = (data) => {
				try {
					handler(data);
				} catch (err) {
					console.error(`Event handler error (${channel}):`, err);
				}
			};
			emitter.on(channel, safeHandler);
			return () => emitter.off(channel, safeHandler);
		},
		clear: () => {
			emitter.removeAllListeners();
		}
	};
}
//#endregion
//#region src/agents/sessions/exec.ts
/**
* Shared command execution utilities for extensions and custom tools.
*/
const DEFAULT_OUTPUT_LIMIT_CHARS = 16777216;
const FORCE_KILL_GRACE_MS = 5e3;
function decodeCapturedOutput(decoder, chunk) {
	return Buffer.isBuffer(chunk) ? decoder.decode(chunk) : `${decoder.flush()}${chunk}`;
}
function clampMaxOutputChars(value) {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return DEFAULT_OUTPUT_LIMIT_CHARS;
	return Math.max(1, Math.floor(value));
}
function appendCapturedOutput(current, chunk, maxOutputChars, truncateTail) {
	const text = String(chunk);
	const combined = `${current.text}${text}`;
	const overflowChars = Math.max(0, combined.length - maxOutputChars);
	if (overflowChars === 0) return {
		text: combined,
		truncatedChars: current.truncatedChars
	};
	const nextText = truncateTail ? sliceUtf16Safe(combined, overflowChars) : sliceUtf16Safe(combined, 0, maxOutputChars);
	return {
		text: nextText,
		truncatedChars: current.truncatedChars + combined.length - nextText.length
	};
}
/**
* Execute a shell command and return stdout/stderr/code.
* Supports timeout and abort signal.
*/
async function execCommand(command, args, cwd, options) {
	return new Promise((resolve) => {
		const cancelController = new AbortController();
		const proc = spawnCommand([command, ...args], {
			buffer: false,
			cancelSignal: cancelController.signal,
			cwd,
			detached: process.platform !== "win32",
			forceKillAfterDelay: FORCE_KILL_GRACE_MS,
			reject: false,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		});
		const releaseOutput = releaseChildProcessOutputAfterExit(proc.nodeChildProcess);
		let childExited = false;
		proc.nodeChildProcess.once("exit", () => {
			childExited = true;
		});
		let commandSettled = false;
		const terminationController = createCommandTerminationController({
			child: proc.nodeChildProcess,
			cancelController,
			processTree: { mode: "graceful" },
			killGraceMs: FORCE_KILL_GRACE_MS,
			isChildExited: () => childExited,
			isCommandSettled: () => commandSettled
		});
		let stdout = {
			text: "",
			truncatedChars: 0
		};
		let stderr = {
			text: "",
			truncatedChars: 0
		};
		const stdoutDecoder = createWindowsOutputDecoder({ preserveUtf8Bom: true });
		const stderrDecoder = createWindowsOutputDecoder({ preserveUtf8Bom: true });
		let killed = false;
		let timeoutId;
		let settled = false;
		const maxOutputChars = clampMaxOutputChars(options?.maxOutputChars);
		const truncateOutput = options?.maxOutputChars !== void 0;
		let outputLimitExceeded;
		const markOutputLimitExceeded = (stream) => {
			if (!truncateOutput && !outputLimitExceeded) {
				outputLimitExceeded = stream;
				killProcess();
			}
		};
		const finish = async (code) => {
			if (settled) return;
			settled = true;
			commandSettled = true;
			if (timeoutId) clearTimeout(timeoutId);
			if (options?.signal) options.signal.removeEventListener("abort", killProcess);
			await terminationController.settle();
			const stdoutBeforeFlush = stdout.truncatedChars;
			stdout = appendCapturedOutput(stdout, stdoutDecoder.flush(), maxOutputChars, truncateOutput);
			if (!truncateOutput && stdout.truncatedChars > stdoutBeforeFlush && !outputLimitExceeded) outputLimitExceeded = "stdout";
			const stderrBeforeFlush = stderr.truncatedChars;
			stderr = appendCapturedOutput(stderr, stderrDecoder.flush(), maxOutputChars, truncateOutput);
			if (!truncateOutput && stderr.truncatedChars > stderrBeforeFlush && !outputLimitExceeded) outputLimitExceeded = "stderr";
			if (outputLimitExceeded) stderr = appendCapturedOutput(stderr, `${stderr.text ? "\n" : ""}exec ${outputLimitExceeded} exceeded output limit ${maxOutputChars} chars`, maxOutputChars, true);
			resolve({
				stdout: stdout.text,
				stderr: stderr.text,
				stdoutTruncatedChars: stdout.truncatedChars || void 0,
				stderrTruncatedChars: stderr.truncatedChars || void 0,
				outputLimitExceeded,
				code: outputLimitExceeded ? 1 : code,
				killed
			});
		};
		const killProcess = () => {
			if (!killed) {
				killed = true;
				if (!terminationController.terminate()) cancelController.abort();
			}
		};
		if (options?.signal) {
			if (options.signal.aborted) killProcess();
			else options.signal.addEventListener("abort", killProcess, { once: true });
		}
		if (options?.timeout && options.timeout > 0) timeoutId = setTimeout(() => {
			killProcess();
		}, options.timeout);
		const ignoreOutputStreamError = () => {};
		proc.stdout?.on("error", ignoreOutputStreamError);
		proc.stderr?.on("error", ignoreOutputStreamError);
		proc.stdout?.on("data", (data) => {
			const before = stdout.truncatedChars;
			stdout = appendCapturedOutput(stdout, decodeCapturedOutput(stdoutDecoder, data), maxOutputChars, truncateOutput);
			if (stdout.truncatedChars > before) markOutputLimitExceeded("stdout");
		});
		proc.stderr?.on("data", (data) => {
			const before = stderr.truncatedChars;
			stderr = appendCapturedOutput(stderr, decodeCapturedOutput(stderrDecoder, data), maxOutputChars, truncateOutput);
			if (stderr.truncatedChars > before) markOutputLimitExceeded("stderr");
		});
		proc.then((result) => finish(result.exitCode ?? (result.failed ? 1 : 0))).catch(() => finish(1)).finally(releaseOutput);
	});
}
//#endregion
//#region src/agents/sessions/auth-storage-oauth-registry.ts
const registries = /* @__PURE__ */ new WeakMap();
function getAuthStorageOAuthProviderRegistry(authStorage) {
	let registry = registries.get(authStorage);
	if (!registry) {
		registry = new OAuthProviderRegistry();
		registries.set(authStorage, registry);
	}
	return registry;
}
async function loginAuthStorageOAuthProvider(authStorage, providerId, callbacks) {
	const provider = getAuthStorageOAuthProviderRegistry(authStorage).get(providerId);
	if (provider) return await provider.login(callbacks);
	const resolved = await loginProviderOAuthWithPlugin({
		provider: providerId,
		context: callbacks
	});
	if (resolved.status === "unowned") throw new Error(`Unknown OAuth provider: ${providerId}`);
	if (resolved.status !== "available") throw new OAuthProviderConfiguredUnavailableError(providerId);
	return resolved.credentials;
}
async function resolveAuthStoragePluginOAuthCredential(providerId, credential, refresh) {
	const resolved = await resolveProviderOAuthCredentialWithPlugin({
		provider: providerId,
		credential: {
			...credential,
			type: "oauth",
			provider: providerId
		},
		refresh
	});
	if (resolved.status === "configured-unavailable") throw new OAuthProviderConfiguredUnavailableError(providerId);
	return resolved.status === "available" ? {
		apiKey: resolved.apiKey,
		newCredentials: resolved.credential
	} : null;
}
//#endregion
//#region src/agents/sessions/resolve-config-value.ts
/**
* Resolve configuration values that may be shell commands, environment variables, or literals.
* Used by auth-storage.ts and model-registry.ts.
*/
const commandResultCache = /* @__PURE__ */ new Map();
/**
* Resolve a config value (API key, header value, etc.) to an actual value.
* - If starts with "!", executes the rest as a shell command and uses stdout (cached)
* - Otherwise checks environment variable first, then treats as literal (not cached)
*/
function resolveConfigValue(config) {
	if (config.startsWith("!")) return executeCommand(config);
	return process.env[config] || config;
}
function executeWithConfiguredShell(command) {
	try {
		const shellConfig = getBashShellConfig();
		const invocation = buildShellCommandInvocation(command, shellConfig);
		const [shell, ...args] = invocation.argv;
		const result = spawnSync(shell, args, {
			encoding: "utf-8",
			...invocation.input === void 0 ? {} : { input: invocation.input },
			timeout: 1e4,
			stdio: [
				invocation.stdin,
				"pipe",
				"ignore"
			],
			shell: false,
			windowsHide: true,
			env: getBashShellEnv(shellConfig.shell)
		});
		if (result.error) {
			if (result.error.code === "ENOENT") return {
				executed: false,
				value: void 0
			};
			return {
				executed: true,
				value: void 0
			};
		}
		if (result.status !== 0) return {
			executed: true,
			value: void 0
		};
		return {
			executed: true,
			value: (result.stdout ?? "").trim() || void 0
		};
	} catch {
		return {
			executed: false,
			value: void 0
		};
	}
}
function executeWithDefaultShell(command) {
	try {
		return execSync(command, {
			encoding: "utf-8",
			timeout: 1e4,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			]
		}).trim() || void 0;
	} catch {
		return;
	}
}
function executeCommandUncached(commandConfig) {
	const command = commandConfig.slice(1);
	return process.platform === "win32" ? (() => {
		const configuredResult = executeWithConfiguredShell(command);
		return configuredResult.executed ? configuredResult.value : executeWithDefaultShell(command);
	})() : executeWithDefaultShell(command);
}
function executeCommand(commandConfig) {
	if (commandResultCache.has(commandConfig)) return commandResultCache.get(commandConfig);
	const result = executeCommandUncached(commandConfig);
	commandResultCache.set(commandConfig, result);
	return result;
}
/**
* Resolve all header values using the same resolution logic as API keys.
*/
function resolveConfigValueUncached(config) {
	if (config.startsWith("!")) return executeCommandUncached(config);
	return process.env[config] || config;
}
function resolveConfigValueOrThrow(config, description) {
	const resolvedValue = resolveConfigValueUncached(config);
	if (resolvedValue !== void 0) return resolvedValue;
	if (config.startsWith("!")) throw new Error(`Failed to resolve ${description} from shell command: ${config.slice(1)}`);
	throw new Error(`Failed to resolve ${description}`);
}
function resolveHeadersOrThrow(headers, description) {
	if (!headers) return;
	const resolved = {};
	for (const [key, value] of Object.entries(headers)) resolved[key] = resolveConfigValueOrThrow(value, `${description} header "${key}"`);
	return Object.keys(resolved).length > 0 ? resolved : void 0;
}
//#endregion
//#region src/agents/sessions/auth-storage.ts
/**
* Credential storage facade for API keys and OAuth tokens.
* Canonical persistence is the per-agent SQLite auth-profile store.
*
* The backend contract keeps the upstream session SDK shape while OpenClaw
* projects provider-default profiles into it.
*/
const AUTH_STORAGE_CREATE_DEPRECATION_CODE = "AUTH_STORAGE_CREATE_DEPRECATED";
const FILE_AUTH_STORAGE_BACKEND_DEPRECATION_CODE = "FILE_AUTH_STORAGE_BACKEND_DEPRECATED";
let authStorageCreateWarningEmitted = false;
let fileAuthStorageBackendWarningEmitted = false;
function emitAuthStorageDeprecationWarning(params) {
	process.emitWarning(params.message, {
		code: params.code,
		type: "DeprecationWarning"
	});
}
var AuthStoragePersistenceError = class extends Error {
	constructor(message, cause) {
		super(message, { cause });
		this.name = "AuthStoragePersistenceError";
	}
};
var AuthStorageLegacyPathMigrationRequiredError = class extends Error {
	constructor() {
		super("Deprecated AuthStorage path contains unmigrated credentials; run openclaw doctor --fix for standard agent auth.json or migrate plugin storage to AuthStorage.forAgent(agentDir).");
		this.code = "AUTH_PROFILE_MIGRATION_REQUIRED";
		this.action = "migrate to AuthStorage.forAgent(agentDir)";
		this.name = "AuthStorageLegacyPathMigrationRequiredError";
	}
};
function assertDeprecatedAuthStoragePathAbsent(authPath) {
	if (authPath && fs.existsSync(authPath)) throw new AuthStorageLegacyPathMigrationRequiredError();
}
function projectAuthStorageData(store) {
	const projected = {};
	for (const [profileId, credential] of Object.entries(store?.profiles ?? {})) {
		if (profileId !== `${credential.provider}:default`) continue;
		if (credential.type === "api_key" && credential.key) projected[credential.provider] = {
			type: "api_key",
			key: credential.key
		};
		else if (credential.type === "token" && credential.token) projected[credential.provider] = {
			type: "token",
			token: credential.token,
			...credential.expires !== void 0 ? { expires: credential.expires } : {}
		};
		else if (credential.type === "oauth") projected[credential.provider] = { ...credential };
	}
	return projected;
}
function assertAuthStorageSecretRefsMaterialized(store) {
	for (const [profileId, credential] of Object.entries(store.profiles)) {
		if (profileId !== `${credential.provider}:default`) continue;
		if (credential.type === "api_key" && credential.keyRef && !credential.key || credential.type === "token" && credential.tokenRef && !credential.token) throw new AuthStoragePersistenceError("AuthStorage.forAgent requires the active secrets runtime to materialize SecretRef credentials.", void 0);
	}
}
function projectAuthoritativeAuthStorageData(store, snapshots) {
	if (snapshots.length === 0) {
		assertAuthStorageSecretRefsMaterialized(store);
		return projectAuthStorageData(store);
	}
	const profiles = Object.fromEntries(Object.entries(store.profiles).map(([profileId, credential]) => {
		const runtimeCredential = snapshots.map((snapshot) => snapshot.profiles[profileId]).find((candidate) => credential.type === "api_key" && credential.keyRef ? candidate?.type === "api_key" && Boolean(candidate.key) && candidate.provider === credential.provider && isDeepStrictEqual(candidate.keyRef, credential.keyRef) : credential.type === "token" && credential.tokenRef ? candidate?.type === "token" && Boolean(candidate.token) && candidate.provider === credential.provider && isDeepStrictEqual(candidate.tokenRef, credential.tokenRef) : false);
		return [profileId, (credential.type === "api_key" && Boolean(credential.keyRef) || credential.type === "token" && Boolean(credential.tokenRef)) && runtimeCredential ? runtimeCredential : credential];
	}));
	const materialized = {
		...store,
		profiles
	};
	assertAuthStorageSecretRefsMaterialized(materialized);
	return projectAuthStorageData(materialized);
}
function applyAuthStorageData(store, data, materializedBaseline) {
	const profiles = { ...store.profiles };
	const projectedProviders = /* @__PURE__ */ new Set([...Object.keys(materializedBaseline), ...Object.entries(store.profiles).flatMap(([profileId, credential]) => profileId === `${credential.provider}:default` ? [credential.provider] : [])]);
	for (const provider of projectedProviders) if (!data[provider]) delete profiles[`${provider}:default`];
	for (const [provider, credential] of Object.entries(data)) {
		const profileId = `${provider}:default`;
		const existing = profiles[profileId];
		if (credential.type === "api_key" && existing?.type === "api_key" && existing.keyRef && materializedBaseline[provider]?.type === "api_key" && materializedBaseline[provider].key === credential.key) {
			profiles[profileId] = existing;
			continue;
		}
		if (credential.type === "token" && existing?.type === "token" && existing.tokenRef && materializedBaseline[provider]?.type === "token" && materializedBaseline[provider].token === credential.token) {
			profiles[profileId] = existing;
			continue;
		}
		profiles[profileId] = credential.type === "api_key" ? {
			type: "api_key",
			provider,
			key: credential.key
		} : credential.type === "token" ? {
			type: "token",
			provider,
			token: credential.token,
			expires: credential.expires
		} : {
			...credential,
			provider
		};
	}
	return {
		...store,
		profiles
	};
}
function collectStateOnlyAuthProfileIds(store) {
	return [.../* @__PURE__ */ new Set([
		...Object.values(store.order ?? {}).flat(),
		...Object.values(store.lastGood ?? {}),
		...Object.keys(store.usageStats ?? {})
	])].filter((profileId) => !store.profiles[profileId]);
}
function loadSqliteAuthStorageStore(agentDir, database) {
	const inspection = inspectPersistedAuthProfileStoreRaw(agentDir, database);
	if (inspection.status === "missing") {
		if (inspectPersistedAuthProfileStateRaw(agentDir, database).status === "unreadable") throw new AuthProfileStoreUnreadableError(database?.path ?? resolveAuthProfileDatabasePath(agentDir));
		return {
			version: 1,
			profiles: {},
			...loadPersistedAuthProfileState(agentDir, database)
		};
	}
	const store = loadPersistedAuthProfileStore(agentDir, database ? { database } : void 0);
	if (inspection.status === "unreadable" || !store) throw new AuthProfileStoreUnreadableError(database?.path ?? resolveAuthProfileDatabasePath(agentDir));
	return store;
}
var SqliteAuthStorageBackend = class {
	constructor(agentDir, preparedStore) {
		this.agentDir = agentDir;
		this.preparedStore = preparedStore;
	}
	resolveMaterializedRuntimeStores() {
		const current = getRuntimeAuthProfileStoreSnapshotCore(this.agentDir);
		return current ? [current] : this.preparedStore ? [this.preparedStore] : [];
	}
	readRaw() {
		assertAuthProfileMigrationReady(this.agentDir);
		return loadSqliteAuthStorageStore(this.agentDir);
	}
	withLock(fn) {
		assertAuthProfileMigrationReady(this.agentDir);
		const snapshots = this.resolveMaterializedRuntimeStores();
		assertAuthProfileMigrationReady(this.agentDir);
		return runAuthProfileWriteTransaction(this.agentDir, (database, owner) => {
			const store = loadSqliteAuthStorageStore(this.agentDir, database);
			const materializedData = projectAuthoritativeAuthStorageData(store, snapshots);
			const { result, next } = fn(JSON.stringify(materializedData));
			if (next !== void 0) saveAuthProfileStoreWithPreparedOwner(applyAuthStorageData(store, JSON.parse(next), materializedData), this.agentDir, {
				filterExternalAuthProfiles: false,
				preserveStateProfileIds: collectStateOnlyAuthProfileIds(store),
				syncExternalCli: false
			}, database, owner);
			return result;
		});
	}
	async withLockAsync(fn) {
		assertAuthProfileMigrationReady(this.agentDir);
		return await withFileLock(resolveAuthProfileDatabasePath(this.agentDir), OAUTH_REFRESH_LOCK_OPTIONS, async () => {
			const initialRaw = this.readRaw();
			const initialData = projectAuthoritativeAuthStorageData(initialRaw, this.resolveMaterializedRuntimeStores());
			const { result, next } = await fn(JSON.stringify(initialData));
			if (next === void 0) return result;
			assertAuthProfileMigrationReady(this.agentDir);
			runAuthProfileWriteTransaction(this.agentDir, (database, owner) => {
				const authoritative = loadSqliteAuthStorageStore(this.agentDir, database);
				if (!isDeepStrictEqual(authoritative.profiles, initialRaw.profiles)) throw new AuthStoragePersistenceError("Cannot update auth storage because its SQLite credentials changed concurrently.", void 0);
				saveAuthProfileStoreWithPreparedOwner(applyAuthStorageData(authoritative, JSON.parse(next), initialData), this.agentDir, {
					filterExternalAuthProfiles: false,
					preserveStateProfileIds: collectStateOnlyAuthProfileIds(authoritative),
					syncExternalCli: false
				}, database, owner);
			});
			return result;
		});
	}
};
/**
* @deprecated Use AuthStorage.forAgent(agentDir). This compatibility adapter
* derives the owning agent directory from the old path and persists only to SQLite.
* It is eligible for removal after 2026-10-01 and a clean published-plugin sweep.
*/
var FileAuthStorageBackend = class {
	constructor(authPath) {
		if (!fileAuthStorageBackendWarningEmitted) {
			fileAuthStorageBackendWarningEmitted = true;
			emitAuthStorageDeprecationWarning({
				code: FILE_AUTH_STORAGE_BACKEND_DEPRECATION_CODE,
				message: "FileAuthStorageBackend(path) is deprecated; use AuthStorage.forAgent(agentDir). The compatibility adapter persists to SQLite and never reads or writes auth.json."
			});
		}
		assertDeprecatedAuthStoragePathAbsent(authPath);
		this.migrationOwnerAgentDir = authPath ? dirname(authPath) : getAgentDir();
		this.delegate = new SqliteAuthStorageBackend(this.migrationOwnerAgentDir);
	}
	withLock(fn) {
		return this.delegate.withLock(fn);
	}
	async withLockAsync(fn) {
		return await this.delegate.withLockAsync(fn);
	}
};
var InMemoryAuthStorageBackend = class {
	withLock(fn) {
		const { result, next } = fn(this.value);
		if (next !== void 0) this.value = next;
		return result;
	}
	async withLockAsync(fn) {
		const { result, next } = await fn(this.value);
		if (next !== void 0) this.value = next;
		return result;
	}
};
/**
* Provider-keyed credential facade backed by the canonical auth-profile store.
*/
var AuthStorage = class AuthStorage {
	constructor(storage, migrationOwnerAgentDir) {
		this.data = {};
		this.runtimeOverrides = /* @__PURE__ */ new Map();
		this.loadError = null;
		this.errors = [];
		this.storage = storage;
		this.migrationOwnerAgentDir = migrationOwnerAgentDir ?? storage.migrationOwnerAgentDir;
		this.reload();
	}
	static forAgent(agentDir = getAgentDir()) {
		assertAuthProfileMigrationReady(agentDir);
		const preparedStore = getRuntimeAuthProfileStoreSnapshotCore(agentDir) ?? loadAuthProfileStoreForSecretsRuntime(agentDir);
		assertAuthStorageSecretRefsMaterialized(preparedStore);
		return new AuthStorage(new SqliteAuthStorageBackend(agentDir, preparedStore), agentDir);
	}
	/**
	* @deprecated Use AuthStorage.forAgent(agentDir). The path-taking compatibility
	* form is eligible for removal after 2026-10-01 and a clean published-plugin
	* reader sweep; it no longer reads or writes JSON.
	*/
	static create(authPath) {
		if (!authStorageCreateWarningEmitted) {
			authStorageCreateWarningEmitted = true;
			emitAuthStorageDeprecationWarning({
				code: AUTH_STORAGE_CREATE_DEPRECATION_CODE,
				message: "AuthStorage.create(path) is deprecated; use AuthStorage.forAgent(agentDir). The compatibility adapter persists to SQLite and never reads or writes auth.json."
			});
		}
		assertDeprecatedAuthStoragePathAbsent(authPath);
		return AuthStorage.forAgent(authPath ? dirname(authPath) : getAgentDir());
	}
	static fromStorage(storage) {
		return new AuthStorage(storage);
	}
	static inMemory(data = {}) {
		const storage = new InMemoryAuthStorageBackend();
		storage.withLock(() => ({
			result: void 0,
			next: JSON.stringify(data, null, 2)
		}));
		return AuthStorage.fromStorage(storage);
	}
	/**
	* Set a runtime API key override (not persisted to disk).
	* Used for CLI --api-key flag.
	*/
	setRuntimeApiKey(provider, apiKey) {
		this.runtimeOverrides.set(provider, apiKey);
	}
	/**
	* Remove a runtime API key override.
	*/
	removeRuntimeApiKey(provider) {
		this.runtimeOverrides.delete(provider);
	}
	/**
	* Set a fallback resolver for API keys not found in auth.json or env vars.
	* Used for custom provider keys from models.json.
	*/
	setFallbackResolver(resolver) {
		this.fallbackResolver = resolver;
	}
	recordError(error) {
		const normalizedError = error instanceof Error ? error : new Error(String(error));
		this.errors.push(normalizedError);
	}
	getCanonicalLoadError() {
		if (!this.loadError) return null;
		return this.migrationOwnerAgentDir || this.loadError instanceof AuthProfileMigrationRequiredError || this.loadError instanceof AuthProfileStoreUnreadableError ? this.loadError : null;
	}
	parseStorageData(content) {
		if (!content) return {};
		return JSON.parse(content);
	}
	/**
	* Reload credentials from storage.
	*/
	reload() {
		let content;
		try {
			this.storage.withLock((current) => {
				content = current;
				return { result: void 0 };
			});
			this.data = this.parseStorageData(content);
			this.loadError = null;
		} catch (error) {
			this.loadError = error;
			this.recordError(error);
		}
	}
	persistProviderChange(provider, credential) {
		if (this.loadError) this.reload();
		if (this.loadError) {
			const error = new AuthStoragePersistenceError(`Cannot update auth storage because it could not be loaded: ${this.loadError.message}`, this.loadError);
			this.recordError(error);
			throw error;
		}
		try {
			const persistedData = this.storage.withLock((current) => {
				const merged = { ...this.parseStorageData(current) };
				if (credential) merged[provider] = credential;
				else delete merged[provider];
				return {
					result: merged,
					next: JSON.stringify(merged, null, 2)
				};
			});
			this.loadError = null;
			this.data = persistedData;
		} catch (error) {
			const persistenceError = error instanceof AuthStoragePersistenceError ? error : new AuthStoragePersistenceError(`Failed to persist auth storage update for provider "${provider}": ${error instanceof Error ? error.message : String(error)}`, error);
			this.recordError(persistenceError);
			throw persistenceError;
		}
	}
	/**
	* Get credential for a provider.
	*/
	get(provider) {
		return this.data[provider] ?? void 0;
	}
	/**
	* Set credential for a provider.
	*/
	set(provider, credential) {
		this.persistProviderChange(provider, credential);
	}
	/**
	* Remove credential for a provider.
	*/
	remove(provider) {
		this.persistProviderChange(provider, void 0);
	}
	/**
	* List all providers with credentials.
	*/
	list() {
		return Object.keys(this.data);
	}
	/**
	* Check if credentials exist for a provider in auth.json.
	*/
	has(provider) {
		return provider in this.data;
	}
	/**
	* Check if any form of auth is configured for a provider.
	* Unlike getApiKey(), this doesn't refresh OAuth tokens.
	*/
	hasAuth(provider) {
		if (this.runtimeOverrides.has(provider)) return true;
		if (this.data[provider]) return true;
		if (getEnvApiKey(provider)) return true;
		if (this.fallbackResolver?.(provider)) return true;
		return false;
	}
	/**
	* Return auth status without exposing credential values or refreshing tokens.
	*/
	getAuthStatus(provider) {
		if (this.data[provider]) return {
			configured: true,
			source: "stored"
		};
		if (this.runtimeOverrides.has(provider)) return {
			configured: false,
			source: "runtime",
			label: "--api-key"
		};
		const envKeys = findEnvKeys(provider);
		if (envKeys?.[0]) return {
			configured: false,
			source: "environment",
			label: envKeys[0]
		};
		if (this.fallbackResolver?.(provider)) return {
			configured: false,
			source: "fallback",
			label: "custom provider config"
		};
		return { configured: false };
	}
	/**
	* Get all credentials (for passing to getOAuthApiKey).
	*/
	getAll() {
		return { ...this.data };
	}
	drainErrors() {
		const drained = [...this.errors];
		this.errors = [];
		return drained;
	}
	/**
	* Login to an OAuth provider.
	*/
	async login(providerId, callbacks) {
		const credentials = await loginAuthStorageOAuthProvider(this, providerId, callbacks);
		this.set(providerId, {
			type: "oauth",
			...credentials
		});
	}
	/**
	* Logout from a provider.
	*/
	logout(provider) {
		this.remove(provider);
	}
	/**
	* Refresh OAuth token with backend locking to prevent race conditions.
	* Multiple agent sessions may try to refresh simultaneously when tokens expire.
	*/
	async refreshOAuthTokenWithLock(providerId) {
		const provider = getAuthStorageOAuthProviderRegistry(this).get(providerId);
		const refresh = async () => await this.storage.withLockAsync(async (current) => {
			const currentData = this.parseStorageData(current);
			this.data = currentData;
			this.loadError = null;
			const cred = currentData[providerId];
			if (cred?.type !== "oauth") return { result: null };
			if (Date.now() < cred.expires) {
				if (provider) return { result: {
					apiKey: provider.getApiKey(cred),
					newCredentials: cred
				} };
				return { result: await resolveAuthStoragePluginOAuthCredential(providerId, cred, false) };
			}
			const oauthCreds = {};
			for (const [key, value] of Object.entries(currentData)) if (value.type === "oauth") oauthCreds[key] = value;
			const refreshed = provider ? await getAuthStorageOAuthProviderRegistry(this).getApiKey(providerId, oauthCreds) : await resolveAuthStoragePluginOAuthCredential(providerId, cred, true);
			if (!refreshed) return { result: null };
			const refreshedCredential = {
				type: "oauth",
				...refreshed.newCredentials
			};
			const merged = {
				...currentData,
				[providerId]: refreshedCredential
			};
			this.data = merged;
			this.loadError = null;
			return {
				result: refreshed,
				next: JSON.stringify(merged, null, 2)
			};
		});
		return this.migrationOwnerAgentDir ? await withFileLock(resolveOAuthRefreshLockPath(providerId, `${providerId}:default`), OAUTH_REFRESH_LOCK_OPTIONS, refresh) : await refresh();
	}
	/**
	* Get API key for a provider.
	* Priority:
	* 1. Runtime override (CLI --api-key)
	* 2. API key from auth.json
	* 3. OAuth token from auth.json (auto-refreshed with locking)
	* 4. Environment variable
	* 5. Fallback resolver (models.json custom providers)
	*/
	async getApiKey(providerId, options) {
		const runtimeKey = this.runtimeOverrides.get(providerId);
		if (runtimeKey) return runtimeKey;
		if (this.migrationOwnerAgentDir) assertAuthProfileMigrationReady(this.migrationOwnerAgentDir);
		const canonicalLoadError = this.getCanonicalLoadError();
		if (canonicalLoadError) throw canonicalLoadError;
		const cred = this.data[providerId];
		if (cred?.type === "api_key") return resolveConfigValue(cred.key);
		if (cred?.type === "token") {
			if (cred.expires === void 0 || Date.now() < cred.expires) return resolveConfigValue(cred.token);
		}
		if (cred?.type === "oauth") {
			const provider = getAuthStorageOAuthProviderRegistry(this).get(providerId);
			if (Date.now() >= cred.expires) try {
				const result = await this.refreshOAuthTokenWithLock(providerId);
				if (result) return result.apiKey;
			} catch (error) {
				if (error instanceof OAuthProviderConfiguredUnavailableError) throw error;
				this.recordError(error);
				this.reload();
				const canonicalStoreError = error instanceof AuthProfileMigrationRequiredError || error instanceof AuthProfileStoreUnreadableError ? error : this.getCanonicalLoadError();
				if (canonicalStoreError) throw canonicalStoreError;
				const updatedCred = this.data[providerId];
				if (updatedCred?.type === "oauth" && Date.now() < updatedCred.expires) {
					if (provider) return provider.getApiKey(updatedCred);
					return (await resolveAuthStoragePluginOAuthCredential(providerId, updatedCred, false))?.apiKey;
				}
				return;
			}
			else {
				if (provider) return provider.getApiKey(cred);
				return (await resolveAuthStoragePluginOAuthCredential(providerId, cred, false))?.apiKey;
			}
		}
		const envKey = getEnvApiKey(providerId);
		if (envKey) return envKey;
		if (options?.includeFallback !== false) return this.fallbackResolver?.(providerId) ?? void 0;
	}
	/**
	* Get all OAuth providers registered for this auth/session runtime.
	*/
	getOAuthProviders() {
		return getAuthStorageOAuthProviderRegistry(this).getAll();
	}
};
//#endregion
//#region src/agents/sessions/tools/private-temp-file.ts
/**
* Private temporary file helper for tool output spillover.
*
* Creates owner-only log files without reusing predictable names.
*/
/** Opens a unique write stream with owner-only permissions. */
function createPrivateTempWriteStream(prefix) {
	const filePath = createPrivateTempFilePath(prefix);
	return {
		path: filePath,
		stream: createWriteStream(filePath, {
			flags: "wx",
			mode: 384
		})
	};
}
async function writePrivateTempFile(prefix, content) {
	const filePath = createPrivateTempFilePath(prefix);
	await writeFile(filePath, content, {
		flag: "wx",
		mode: 384
	});
	return filePath;
}
function createPrivateTempFilePath(prefix) {
	const id = randomBytes(8).toString("hex");
	return join(tmpdir(), `${prefix}-${id}.log`);
}
//#endregion
//#region src/agents/sessions/tools/output-accumulator.ts
/**
* Streaming output accumulator for tool execution.
*
* Keeps bounded display tails in memory while spilling full output to private temp files when needed.
*/
function byteLength(text) {
	return Buffer.byteLength(text, "utf-8");
}
/**
* Incrementally tracks streaming output with bounded memory.
*
* Appends decode chunks with a streaming UTF-8 decoder, keeps only a decoded
* tail for display snapshots, and opens a temp file when the full output needs
* to be preserved.
*/
var OutputAccumulator = class {
	constructor(options = {}) {
		this.lanes = /* @__PURE__ */ new Map();
		this.spillChunks = [];
		this.tailText = "";
		this.tailBytes = 0;
		this.totalRawBytes = 0;
		this.totalDecodedBytes = 0;
		this.completedLines = 0;
		this.totalLines = 0;
		this.lastLineBytes = 0;
		this.hasOpenLine = false;
		this.finished = false;
		this.maxLines = options.maxLines ?? 2e3;
		this.maxBytes = options.maxBytes ?? 51200;
		this.maxRollingBytes = Math.max(this.maxBytes * 2, this.maxBytes + 5);
		this.tempFilePrefix = options.tempFilePrefix ?? "openclaw-output";
		this.createTextTransform = options.createTextTransform;
	}
	lane(stream) {
		let lane = this.lanes.get(stream);
		if (!lane) {
			lane = {
				decoder: new TextDecoder(),
				transform: this.createTextTransform?.(),
				spillDecoded: stream !== void 0 || this.createTextTransform !== void 0
			};
			this.lanes.set(stream, lane);
		}
		return lane;
	}
	append(data, stream) {
		if (this.finished) throw new Error("Cannot append to a finished output accumulator");
		this.totalRawBytes += data.length;
		const lane = this.lane(stream);
		const decodedText = lane.decoder.decode(data, { stream: true });
		const text = lane.transform?.(decodedText) ?? decodedText;
		this.appendDecodedText(text);
		const spillChunk = lane.spillDecoded ? Buffer.from(text, "utf-8") : data;
		if (this.tempFile || this.shouldUseTempFile()) this.ensureTempFile();
		this.appendSpillChunk(spillChunk);
		return text;
	}
	finish() {
		if (this.finished) return "";
		this.finished = true;
		let flushed = "";
		for (const lane of this.lanes.values()) {
			const decodedText = lane.decoder.decode();
			const text = lane.transform?.(decodedText) ?? decodedText;
			if (text.length === 0) continue;
			this.appendDecodedText(text);
			if (lane.spillDecoded) this.appendSpillChunk(Buffer.from(text, "utf-8"));
			flushed += text;
		}
		if (this.shouldUseTempFile()) this.ensureTempFile();
		return flushed;
	}
	snapshot(options = {}) {
		const tailTruncation = truncateTail(this.tailText, {
			maxLines: this.maxLines,
			maxBytes: this.maxBytes
		});
		const truncated = this.totalLines > this.maxLines || this.totalDecodedBytes > this.maxBytes;
		const truncatedBy = truncated ? tailTruncation.truncatedBy ?? (this.totalDecodedBytes > this.maxBytes ? "bytes" : "lines") : null;
		const truncation = {
			...tailTruncation,
			truncated,
			truncatedBy,
			totalLines: this.totalLines,
			totalBytes: this.totalDecodedBytes,
			maxLines: this.maxLines,
			maxBytes: this.maxBytes
		};
		if (options.persistIfTruncated && truncation.truncated) this.ensureTempFile();
		return {
			content: truncation.content,
			truncation,
			fullOutputPath: this.tempFile?.path
		};
	}
	async closeTempFile() {
		const tempFile = this.tempFile;
		if (!tempFile) return;
		tempFile.stream.end();
		await tempFile.completion;
	}
	getLastLineBytes() {
		return this.lastLineBytes;
	}
	appendDecodedText(text) {
		if (text.length === 0) return;
		const bytes = byteLength(text);
		this.totalDecodedBytes += bytes;
		this.tailText += text;
		this.tailBytes += bytes;
		if (this.tailBytes > this.maxRollingBytes * 2) {
			this.tailText = truncateUtf8Suffix(this.tailText, this.maxRollingBytes);
			this.tailBytes = byteLength(this.tailText);
		}
		for (let start = 0; start < text.length;) {
			const newline = text.indexOf("\n", start);
			const end = newline === -1 ? text.length : newline;
			this.lastLineBytes = (this.hasOpenLine ? this.lastLineBytes : 0) + byteLength(text.slice(start, end));
			this.hasOpenLine = newline === -1;
			if (!this.hasOpenLine) this.completedLines++;
			start = end + 1;
		}
		this.totalLines = this.completedLines + (this.hasOpenLine ? 1 : 0);
	}
	shouldUseTempFile() {
		return this.totalRawBytes > this.maxBytes || this.totalDecodedBytes > this.maxBytes || this.totalLines > this.maxLines;
	}
	appendSpillChunk(chunk) {
		if (chunk.length === 0) return;
		if (this.tempFile) this.tempFile.stream.write(chunk);
		else this.spillChunks.push(chunk);
	}
	ensureTempFile() {
		if (this.tempFile) return;
		const tempFile = createPrivateTempWriteStream(this.tempFilePrefix);
		const completion = finished(tempFile.stream);
		completion.catch(() => void 0);
		this.tempFile = {
			...tempFile,
			completion
		};
		for (const chunk of this.spillChunks) tempFile.stream.write(chunk);
		this.spillChunks = [];
	}
};
//#endregion
//#region src/agents/sessions/bash-executor.ts
/**
* Bash command execution with streaming support and cancellation.
*
* This module provides a unified bash execution implementation used by:
* - AgentSession.executeBash() for interactive and RPC modes
* - Direct calls from modes that need bash execution
*/
/**
* Execute a bash command using custom BashOperations.
* Used for remote execution (SSH, containers, etc.).
*/
async function executeBashWithOperations(command, cwd, operations, options) {
	const output = new OutputAccumulator({
		tempFilePrefix: "openclaw-bash",
		createTextTransform: () => {
			const sanitizeOutput = createStreamingBinaryOutputSanitizer();
			return (text) => sanitizeOutput(text).replace(/\r/g, "");
		}
	});
	const onData = (data, stream) => {
		const text = output.append(data, stream);
		options?.onChunk?.(text);
	};
	const finalizeOutput = async () => {
		const finalText = output.finish();
		const snapshot = output.snapshot({ persistIfTruncated: true });
		try {
			if (finalText) options?.onChunk?.(finalText);
			return snapshot;
		} finally {
			await output.closeTempFile();
		}
	};
	const buildResult = async (exitCode, cancelled) => {
		const snapshot = await finalizeOutput();
		return {
			output: snapshot.content,
			exitCode: cancelled ? void 0 : exitCode,
			cancelled,
			truncated: snapshot.truncation.truncated,
			fullOutputPath: snapshot.fullOutputPath
		};
	};
	let result;
	try {
		result = await operations.exec(command, cwd, {
			onData,
			signal: options?.signal
		});
	} catch (err) {
		if (options?.signal?.aborted) return await buildResult(void 0, true);
		await finalizeOutput();
		throw err;
	}
	const cancelled = options?.signal?.aborted ?? false;
	return await buildResult(result.exitCode ?? void 0, cancelled);
}
//#endregion
//#region src/agents/sessions/compaction/runtime.ts
/** Adds a private usage sink without changing public summary result shapes. */
function createCompactionRuntime(usageSink) {
	return usageSink ? {
		...openClawAgentCoreRuntime,
		internalUsageSink: usageSink
	} : openClawAgentCoreRuntime;
}
//#endregion
//#region src/agents/sessions/compaction/branch-summarization.ts
/** Collects entries that differ between two session branches for summarization. */
function collectEntriesForBranchSummary(session, oldLeafId, targetId) {
	if (!oldLeafId) return {
		entries: [],
		commonAncestorId: null
	};
	const oldBranch = session.getBranch(oldLeafId);
	const targetPath = session.getBranch(targetId);
	return collectEntriesForBranchSummaryFromBranches(oldBranch, targetPath);
}
/** Generates a human-readable branch summary through the shared agent-core runtime. */
async function generateBranchSummary(entries, options) {
	const { usageSink, ...summaryOptions } = options;
	const result = await generateBranchSummary$1(entries, {
		runtime: createCompactionRuntime(usageSink),
		...summaryOptions
	});
	if (result.ok) return result.value;
	if (result.error.code === "aborted") return {
		aborted: true,
		error: result.error.message
	};
	return { error: result.error.message };
}
//#endregion
//#region src/agents/sessions/compaction/compaction.ts
/** Converts agent-core Result values back to the legacy session compaction API shape. */
function unwrapCompactionResult(result) {
	if (result.ok) return result.value;
	throw result.error;
}
/** Prepares session entries for compaction using the shared agent-core planner. */
function prepareCompaction(pathEntries, settings) {
	return unwrapCompactionResult(prepareCompaction$1(pathEntries, settings));
}
/** Generates a compaction summary through the shared agent-core runtime. */
async function generateSummary(currentMessages, model, reserveTokens, apiKey, headers, signal, customInstructions, previousSummary, thinkingLevel, streamFn, usageSink) {
	return unwrapCompactionResult(await generateSummary$1(currentMessages, model, reserveTokens, apiKey, headers, signal, customInstructions, previousSummary, thinkingLevel, streamFn, createCompactionRuntime(usageSink)));
}
/** Runs full compaction through agent-core and returns the compacted conversation result. */
async function compact(preparation, model, apiKey, headers, customInstructions, signal, thinkingLevel, streamFn, usageSink) {
	return unwrapCompactionResult(await compact$1(preparation, model, apiKey, headers, customInstructions, signal, thinkingLevel, streamFn, createCompactionRuntime(usageSink)));
}
//#endregion
//#region src/agents/sessions/model-registry-runtime.ts
const modelRegistryRuntimes = /* @__PURE__ */ new WeakMap();
function resetApiRegistry(runtime) {
	runtime.apiRegistry.clearApiProviders();
	registerBuiltInApiProviders(runtime.apiRegistry);
}
/** Creates the runtime facts owned by one model-registry lifecycle. */
function initializeModelRegistryRuntime(owner) {
	const apiRegistry = createApiRegistry();
	const llmRuntime = createLlmRuntime(apiRegistry);
	const runtime = {
		apiRegistry,
		llmRuntime
	};
	bindStreamLlmRuntime(llmRuntime.streamSimple, llmRuntime);
	resetApiRegistry(runtime);
	modelRegistryRuntimes.set(owner, runtime);
}
/** Returns the prepared runtime facts for one model-registry lifecycle. */
function getModelRegistryRuntime(owner) {
	const runtime = modelRegistryRuntimes.get(owner);
	if (!runtime) throw new Error("Model registry runtime is not initialized");
	return runtime;
}
function resetModelRegistryRuntime(owner) {
	resetApiRegistry(getModelRegistryRuntime(owner));
}
//#endregion
//#region src/agents/sessions/provider-display-names.ts
/**
* Built-in provider labels shown in session/model UI when plugin metadata does
* not supply a display name.
*/
const BUILT_IN_PROVIDER_DISPLAY_NAMES = {
	anthropic: "Anthropic",
	"amazon-bedrock": "Amazon Bedrock",
	"azure-openai-responses": "Azure OpenAI Responses",
	cerebras: "Cerebras",
	"cloudflare-ai-gateway": "Cloudflare AI Gateway",
	"cloudflare-workers-ai": "Cloudflare Workers AI",
	deepseek: "DeepSeek",
	fireworks: "Fireworks",
	google: "Google Gemini",
	"google-vertex": "Google Vertex AI",
	groq: "Groq",
	huggingface: "Hugging Face",
	"kimi-coding": "Kimi For Coding",
	meta: "Meta",
	mistral: "Mistral",
	minimax: "MiniMax",
	"minimax-cn": "MiniMax (China)",
	moonshotai: "Moonshot AI",
	"moonshotai-cn": "Moonshot AI (China)",
	opencode: "OpenCode Zen",
	"opencode-go": "OpenCode Go",
	openai: "OpenAI",
	openrouter: "OpenRouter",
	together: "Together AI",
	"vercel-ai-gateway": "Vercel AI Gateway",
	xai: "xAI",
	zai: "ZAI",
	xiaomi: "Xiaomi MiMo",
	"xiaomi-token-plan-cn": "Xiaomi MiMo Token Plan (China)",
	"xiaomi-token-plan-ams": "Xiaomi MiMo Token Plan (Amsterdam)",
	"xiaomi-token-plan-sgp": "Xiaomi MiMo Token Plan (Singapore)"
};
//#endregion
//#region src/agents/sessions/model-registry.ts
/**
* Model registry - manages configured/provider-owned models and API key resolution.
*/
const log$1 = createSubsystemLogger("agents/model-registry");
const PercentileCutoffsSchema = Type.Object({
	p50: Type.Optional(Type.Number()),
	p75: Type.Optional(Type.Number()),
	p90: Type.Optional(Type.Number()),
	p99: Type.Optional(Type.Number())
});
const OpenRouterRoutingSchema = Type.Object({
	allow_fallbacks: Type.Optional(Type.Boolean()),
	require_parameters: Type.Optional(Type.Boolean()),
	data_collection: Type.Optional(Type.Union([Type.Literal("deny"), Type.Literal("allow")])),
	zdr: Type.Optional(Type.Boolean()),
	enforce_distillable_text: Type.Optional(Type.Boolean()),
	order: Type.Optional(Type.Array(Type.String())),
	only: Type.Optional(Type.Array(Type.String())),
	ignore: Type.Optional(Type.Array(Type.String())),
	quantizations: Type.Optional(Type.Array(Type.String())),
	sort: Type.Optional(Type.Union([Type.String(), Type.Object({
		by: Type.Optional(Type.String()),
		partition: Type.Optional(Type.Union([Type.String(), Type.Null()]))
	})])),
	max_price: Type.Optional(Type.Object({
		prompt: Type.Optional(Type.Union([Type.Number(), Type.String()])),
		completion: Type.Optional(Type.Union([Type.Number(), Type.String()])),
		image: Type.Optional(Type.Union([Type.Number(), Type.String()])),
		audio: Type.Optional(Type.Union([Type.Number(), Type.String()])),
		request: Type.Optional(Type.Union([Type.Number(), Type.String()]))
	})),
	preferred_min_throughput: Type.Optional(Type.Union([Type.Number(), PercentileCutoffsSchema])),
	preferred_max_latency: Type.Optional(Type.Union([Type.Number(), PercentileCutoffsSchema]))
});
const VercelGatewayRoutingSchema = Type.Object({
	only: Type.Optional(Type.Array(Type.String())),
	order: Type.Optional(Type.Array(Type.String()))
});
const ThinkingLevelMapValueSchema = Type.Union([Type.String(), Type.Null()]);
const ThinkingLevelMapSchema = Type.Object({
	off: Type.Optional(ThinkingLevelMapValueSchema),
	minimal: Type.Optional(ThinkingLevelMapValueSchema),
	low: Type.Optional(ThinkingLevelMapValueSchema),
	medium: Type.Optional(ThinkingLevelMapValueSchema),
	high: Type.Optional(ThinkingLevelMapValueSchema),
	xhigh: Type.Optional(ThinkingLevelMapValueSchema),
	max: Type.Optional(ThinkingLevelMapValueSchema)
});
const OpenAICompletionsCompatSchema = Type.Object({
	supportsStore: Type.Optional(Type.Boolean()),
	supportsDeveloperRole: Type.Optional(Type.Boolean()),
	supportsReasoningEffort: Type.Optional(Type.Boolean()),
	supportsUsageInStreaming: Type.Optional(Type.Boolean()),
	maxTokensField: Type.Optional(Type.Union([Type.Literal("max_completion_tokens"), Type.Literal("max_tokens")])),
	requiresToolResultName: Type.Optional(Type.Boolean()),
	requiresAssistantAfterToolResult: Type.Optional(Type.Boolean()),
	requiresThinkingAsText: Type.Optional(Type.Boolean()),
	requiresReasoningContentOnAssistantMessages: Type.Optional(Type.Boolean()),
	thinkingFormat: Type.Optional(Type.Union([
		Type.Literal("openai"),
		Type.Literal("openrouter"),
		Type.Literal("together"),
		Type.Literal("deepseek"),
		Type.Literal("zai"),
		Type.Literal("qwen"),
		Type.Literal("qwen-chat-template")
	])),
	cacheControlFormat: Type.Optional(Type.Literal("anthropic")),
	openRouterRouting: Type.Optional(OpenRouterRoutingSchema),
	vercelGatewayRouting: Type.Optional(VercelGatewayRoutingSchema),
	supportsStrictMode: Type.Optional(Type.Boolean()),
	supportsJsonSchemaResponseFormat: Type.Optional(Type.Boolean()),
	supportsLongCacheRetention: Type.Optional(Type.Boolean())
});
const OpenAIResponsesCompatSchema = Type.Object({
	supportsTemperature: Type.Optional(Type.Boolean()),
	supportsInstructions: Type.Optional(Type.Boolean()),
	sendSessionIdHeader: Type.Optional(Type.Boolean()),
	supportsLongCacheRetention: Type.Optional(Type.Boolean())
});
const AnthropicMessagesCompatSchema = Type.Object({
	supportsEagerToolInputStreaming: Type.Optional(Type.Boolean()),
	supportsLongCacheRetention: Type.Optional(Type.Boolean())
});
const ProviderCompatSchema = Type.Union([
	OpenAICompletionsCompatSchema,
	OpenAIResponsesCompatSchema,
	AnthropicMessagesCompatSchema
]);
const ProviderAuthModeSchema = Type.Union([
	Type.Literal("api-key"),
	Type.Literal("aws-sdk"),
	Type.Literal("oauth"),
	Type.Literal("token")
]);
const ModelDefinitionSchema = Type.Object({
	id: Type.String({ minLength: 1 }),
	name: Type.Optional(Type.String({ minLength: 1 })),
	api: Type.Optional(Type.String({ minLength: 1 })),
	baseUrl: Type.Optional(Type.String({ minLength: 1 })),
	reasoning: Type.Optional(Type.Boolean()),
	thinkingLevelMap: Type.Optional(ThinkingLevelMapSchema),
	input: Type.Optional(Type.Array(Type.Union([
		Type.Literal("text"),
		Type.Literal("image"),
		Type.Literal("audio"),
		Type.Literal("video")
	]))),
	cost: Type.Optional(Type.Object({
		input: Type.Number(),
		output: Type.Number(),
		cacheRead: Type.Number(),
		cacheWrite: Type.Number()
	})),
	contextWindow: Type.Optional(Type.Number()),
	maxTokens: Type.Optional(Type.Number()),
	params: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
	headers: Type.Optional(Type.Record(Type.String(), Type.String())),
	compat: Type.Optional(ProviderCompatSchema)
});
const ProviderConfigSchema = Type.Object({
	name: Type.Optional(Type.String({ minLength: 1 })),
	baseUrl: Type.Optional(Type.String({ minLength: 1 })),
	apiKey: Type.Optional(Type.String({ minLength: 1 })),
	auth: Type.Optional(ProviderAuthModeSchema),
	api: Type.Optional(Type.String({ minLength: 1 })),
	headers: Type.Optional(Type.Record(Type.String(), Type.String())),
	compat: Type.Optional(ProviderCompatSchema),
	authHeader: Type.Optional(Type.Boolean()),
	models: Type.Optional(Type.Array(ModelDefinitionSchema))
});
const ModelsConfigSchema = Type.Object({
	generatedBy: Type.Optional(Type.String()),
	providers: Type.Record(Type.String(), ProviderConfigSchema)
});
const validateModelsConfig = Compile(ModelsConfigSchema);
function formatValidationPath(error) {
	if (error.keyword === "required") {
		const requiredProperty = error.params.requiredProperties?.[0];
		if (requiredProperty) {
			const basePath = error.instancePath.replace(/^\//, "").replace(/\//g, ".");
			return basePath ? `${basePath}.${requiredProperty}` : requiredProperty;
		}
	}
	return error.instancePath.replace(/^\//, "").replace(/\//g, ".") || "root";
}
function emptyCustomModelsResult(error) {
	return {
		models: [],
		error
	};
}
function mergeCompat(baseCompat, overrideCompat) {
	if (!overrideCompat) return baseCompat;
	const base = baseCompat;
	const override = overrideCompat;
	const merged = {
		...base,
		...override
	};
	const baseCompletions = base;
	const overrideCompletions = override;
	const mergedCompletions = merged;
	if (baseCompletions?.openRouterRouting || overrideCompletions.openRouterRouting) mergedCompletions.openRouterRouting = {
		...baseCompletions?.openRouterRouting,
		...overrideCompletions.openRouterRouting
	};
	if (baseCompletions?.vercelGatewayRouting || overrideCompletions.vercelGatewayRouting) mergedCompletions.vercelGatewayRouting = {
		...baseCompletions?.vercelGatewayRouting,
		...overrideCompletions.vercelGatewayRouting
	};
	return merged;
}
/**
* Model registry - loads and manages models, resolves API keys via AuthStorage.
*/
var ModelRegistry = class ModelRegistry {
	constructor(authStorage, modelsJsonPath, options = {}) {
		this.models = [];
		this.providerRequestConfigs = /* @__PURE__ */ new Map();
		this.modelRequestHeaders = /* @__PURE__ */ new Map();
		this.registeredProviders = /* @__PURE__ */ new Map();
		this.loadError = void 0;
		this.includePluginCatalogs = true;
		this.authStorage = authStorage;
		this.includePluginCatalogs = options.includePluginCatalogs !== false;
		initializeModelRegistryRuntime(this);
		if (options.sourceSnapshot) {
			const source = options.sourceSnapshot;
			const sourceSnapshot = source.baseCatalogSnapshot ?? source.captureCatalogSnapshot();
			this.sourceSnapshot = sourceSnapshot;
			this.baseCatalogSnapshot = sourceSnapshot;
			this.restoreSourceCatalog(sourceSnapshot);
			this.registeredProviders = new Map([...source.registeredProviders].map(([provider, config]) => [provider, { ...config }]));
			getAuthStorageOAuthProviderRegistry(authStorage).reset();
			for (const oauthProvider of sourceSnapshot.oauthProviders) getAuthStorageOAuthProviderRegistry(authStorage).register(oauthProvider);
			for (const [providerName, config] of this.registeredProviders.entries()) this.applyProviderConfig(providerName, config);
			return;
		}
		this.modelsJsonPath = modelsJsonPath;
		this.modelsJsonContents = options.modelsJsonContents;
		this.pluginCatalogs = options.pluginCatalogs;
		this.pluginMetadataSnapshot = resolveModelPluginMetadataSnapshot({
			...options.pluginMetadataSnapshot ? { pluginMetadataSnapshot: options.pluginMetadataSnapshot } : {},
			...options.workspaceDir ? { workspaceDir: options.workspaceDir } : {},
			allowWorkspaceScopedCurrent: true,
			useRuntimeConfig: true
		});
		this.loadModels();
		this.baseCatalogSnapshot = this.captureCatalogSnapshot();
	}
	captureCatalogSnapshot() {
		return {
			models: structuredClone(this.models),
			providerRequestConfigs: new Map([...this.providerRequestConfigs].map(([provider, config]) => [provider, { ...config }])),
			modelRequestHeaders: new Map([...this.modelRequestHeaders].map(([key, headers]) => [key, { ...headers }])),
			loadError: this.loadError,
			pluginMetadataSnapshot: this.pluginMetadataSnapshot,
			oauthProviders: [...this.authStorage.getOAuthProviders()]
		};
	}
	restoreSourceCatalog(source) {
		this.models = structuredClone(source.models);
		this.providerRequestConfigs = new Map([...source.providerRequestConfigs].map(([provider, config]) => [provider, { ...config }]));
		this.modelRequestHeaders = new Map([...source.modelRequestHeaders].map(([key, headers]) => [key, { ...headers }]));
		this.loadError = source.loadError;
		this.pluginMetadataSnapshot = source.pluginMetadataSnapshot;
	}
	static create(authStorage, modelsJsonPath = join(getAgentDir(), "models.json"), options = {}) {
		return new ModelRegistry(authStorage, modelsJsonPath, options);
	}
	static inMemory(authStorage) {
		return new ModelRegistry(authStorage, void 0);
	}
	/** Creates a request-isolated registry from this lifecycle-owned catalog snapshot. */
	fork(authStorage) {
		return new ModelRegistry(authStorage, void 0, { sourceSnapshot: this });
	}
	/**
	* Reload models from disk (models.json).
	*/
	refresh() {
		this.providerRequestConfigs.clear();
		this.modelRequestHeaders.clear();
		this.loadError = void 0;
		resetModelRegistryRuntime(this);
		getAuthStorageOAuthProviderRegistry(this.authStorage).reset();
		if (this.sourceSnapshot) {
			this.restoreSourceCatalog(this.sourceSnapshot);
			for (const oauthProvider of this.sourceSnapshot.oauthProviders) getAuthStorageOAuthProviderRegistry(this.authStorage).register(oauthProvider);
		} else {
			this.loadModels();
			this.baseCatalogSnapshot = this.captureCatalogSnapshot();
		}
		for (const [providerName, config] of this.registeredProviders.entries()) this.applyProviderConfig(providerName, config);
	}
	/** Get any root or generated plugin catalog load error. */
	getError() {
		return this.loadError;
	}
	/** Returns the exact plugin metadata generation captured with this registry. */
	getProviderMetadataOwners() {
		return this.pluginMetadataSnapshot?.owners;
	}
	loadModels() {
		const customResult = this.modelsJsonPath && this.modelsJsonContents !== null ? this.loadCustomModels(this.modelsJsonPath, {
			...this.modelsJsonContents !== void 0 ? { contents: this.modelsJsonContents } : {},
			includePluginCatalogs: this.includePluginCatalogs && this.pluginCatalogs === void 0
		}) : emptyCustomModelsResult();
		const capturedPluginResult = this.includePluginCatalogs && this.pluginCatalogs !== void 0 ? this.loadCapturedPluginCatalogs(this.pluginCatalogs) : emptyCustomModelsResult();
		const errors = [customResult.error, capturedPluginResult.error].filter((error) => Boolean(error));
		if (errors.length > 0) {
			this.loadError = errors.join("\n\n");
			log$1.warn(`model catalog load issue: ${this.loadError}`);
		}
		let combined = [...customResult.models, ...capturedPluginResult.models];
		for (const oauthProvider of this.authStorage.getOAuthProviders()) {
			const cred = this.authStorage.get(oauthProvider.id);
			if (cred?.type === "oauth" && oauthProvider.modifyModels) combined = oauthProvider.modifyModels(combined, cred);
		}
		this.models = combined;
	}
	loadCapturedPluginCatalogs(pluginCatalogs) {
		const models = [];
		const errors = [];
		for (const pluginCatalog of pluginCatalogs) {
			const result = this.loadCustomModels(`sqlite:plugin-model-catalog/${pluginCatalog.pluginId}`, {
				catalogPluginId: pluginCatalog.pluginId,
				contents: pluginCatalog.contents,
				includePluginCatalogs: false,
				requireGeneratedCatalog: true
			});
			models.push(...result.models);
			if (result.error) errors.push(result.error);
		}
		return {
			models,
			error: errors.join("\n\n") || void 0
		};
	}
	loadCustomModels(modelsJsonPath, options = { includePluginCatalogs: true }) {
		if (options.contents === void 0 && !existsSync(modelsJsonPath)) return emptyCustomModelsResult();
		try {
			const content = options.contents ?? readFileSync(modelsJsonPath, "utf-8");
			const parsed = parseModelCatalogJson(content);
			if (options.requireGeneratedCatalog === true && !isGeneratedPluginModelCatalog(parsed)) return emptyCustomModelsResult();
			if (!validateModelsConfig.Check(parsed)) return emptyCustomModelsResult(`Invalid models.json schema:\n${validateModelsConfig.Errors(parsed).map((error) => `  - ${formatValidationPath(error)}: ${error.message}`).join("\n") || "Unknown schema error"}\n\nFile: ${modelsJsonPath}`);
			const config = parsed;
			const providers = options.requireGeneratedCatalog === true ? filterGeneratedPluginModelCatalogProviders({
				catalogPluginId: options.catalogPluginId,
				parsedCatalog: parsed,
				pluginMetadataSnapshot: this.pluginMetadataSnapshot,
				providers: config.providers
			}) : config.providers;
			const configForUse = {
				...config,
				providers
			};
			if (options.requireGeneratedCatalog === true && Object.keys(providers).length === 0) return emptyCustomModelsResult();
			this.validateConfig(configForUse);
			for (const [providerName, providerConfig] of Object.entries(configForUse.providers)) if ((providerConfig.models ?? []).length > 0) this.storeProviderRequestConfig(providerName, providerConfig);
			const models = this.parseModels(configForUse, options.requireGeneratedCatalog === true ? "discovered" : "configured");
			const pluginCatalogErrors = [];
			if (options.includePluginCatalogs !== false) {
				let pluginCatalogs = [];
				try {
					const loaded = loadPersistedPluginModelCatalogs(dirname(modelsJsonPath));
					pluginCatalogs = loaded.catalogs;
					pluginCatalogErrors.push(...loaded.warnings);
				} catch (error) {
					pluginCatalogErrors.push(`Failed to load generated plugin model catalogs: ${error instanceof Error ? error.message : String(error)}`);
				}
				const pluginResult = this.loadCapturedPluginCatalogs(pluginCatalogs);
				models.push(...pluginResult.models);
				if (pluginResult.error) pluginCatalogErrors.push(pluginResult.error);
			}
			return {
				models,
				error: pluginCatalogErrors.join("\n\n") || void 0
			};
		} catch (error) {
			if (error instanceof SyntaxError) {
				if (options.requireGeneratedCatalog === true) return emptyCustomModelsResult();
				return emptyCustomModelsResult(`Failed to parse models.json: ${error.message}\n\nFile: ${modelsJsonPath}`);
			}
			return emptyCustomModelsResult(`Failed to load models.json: ${error instanceof Error ? error.message : String(error)}\n\nFile: ${modelsJsonPath}`);
		}
	}
	validateConfig(config) {
		for (const [providerName, providerConfig] of Object.entries(config.providers)) {
			const hasProviderApi = Boolean(providerConfig.api);
			const models = providerConfig.models ?? [];
			if (models.length === 0) continue;
			if (!providerConfig.baseUrl) throw new Error(`Provider ${providerName}: "baseUrl" is required when defining custom models.`);
			for (const modelDef of models) {
				const hasModelApi = Boolean(modelDef.api);
				if (!hasProviderApi && !hasModelApi) throw new Error(`Provider ${providerName}, model ${modelDef.id}: no "api" specified. Set at provider or model level.`);
				if (!modelDef.id) throw new Error(`Provider ${providerName}: model missing "id"`);
				if (modelDef.contextWindow !== void 0 && modelDef.contextWindow <= 0) throw new Error(`Provider ${providerName}, model ${modelDef.id}: invalid contextWindow`);
				if (modelDef.maxTokens !== void 0 && modelDef.maxTokens <= 0) throw new Error(`Provider ${providerName}, model ${modelDef.id}: invalid maxTokens`);
			}
		}
	}
	parseModels(config, maxTokensSource) {
		const models = [];
		for (const [providerName, providerConfig] of Object.entries(config.providers)) {
			const modelDefs = providerConfig.models ?? [];
			if (modelDefs.length === 0) continue;
			for (const modelDef of modelDefs) {
				const api = modelDef.api ?? providerConfig.api;
				if (!api) continue;
				const baseUrl = modelDef.baseUrl ?? providerConfig.baseUrl;
				if (!baseUrl) continue;
				const runtimeInput = (modelDef.input ?? ["text"]).filter((input) => input === "text" || input === "image");
				if ((modelDef.input?.length ?? 0) > 0 && runtimeInput.length === 0) continue;
				const compat = mergeCompat(providerConfig.compat, modelDef.compat);
				this.storeModelHeaders(providerName, modelDef.id, modelDef.headers);
				models.push({
					id: modelDef.id,
					name: modelDef.name ?? modelDef.id,
					api,
					provider: providerName,
					baseUrl,
					reasoning: modelDef.reasoning ?? false,
					thinkingLevelMap: modelDef.thinkingLevelMap,
					input: runtimeInput,
					cost: modelDef.cost ?? {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0
					},
					contextWindow: modelDef.contextWindow ?? 128e3,
					maxTokens: modelDef.maxTokens ?? 16384,
					...modelDef.maxTokens !== void 0 ? { maxTokensSource } : {},
					params: modelDef.params,
					headers: void 0,
					compat
				});
			}
		}
		return models;
	}
	/**
	* Get all configured models.
	*/
	getAll() {
		return this.models;
	}
	/**
	* Get only models that have auth configured.
	* This is a fast check that doesn't refresh OAuth tokens.
	*/
	getAvailable() {
		return this.models.filter((m) => this.hasConfiguredAuth(m));
	}
	/**
	* Find a model by provider and ID.
	*/
	find(provider, modelId) {
		return this.models.find((m) => m.provider === provider && m.id === modelId);
	}
	/**
	* Get API key for a model.
	*/
	hasConfiguredAuth(model) {
		return this.authStorage.hasAuth(model.provider) || this.providerRequestConfigs.get(model.provider)?.auth === "aws-sdk" || this.providerRequestConfigs.get(model.provider)?.apiKey !== void 0;
	}
	getModelRequestKey(provider, modelId) {
		return `${provider}:${modelId}`;
	}
	storeProviderRequestConfig(providerName, config) {
		if (!config.apiKey && !config.auth && !config.headers && !config.authHeader) return;
		this.providerRequestConfigs.set(providerName, {
			apiKey: config.apiKey,
			auth: config.auth,
			headers: config.headers,
			authHeader: config.authHeader
		});
	}
	storeModelHeaders(providerName, modelId, headers) {
		const key = this.getModelRequestKey(providerName, modelId);
		if (!headers || Object.keys(headers).length === 0) {
			this.modelRequestHeaders.delete(key);
			return;
		}
		this.modelRequestHeaders.set(key, headers);
	}
	/**
	* Get API key and request headers for a model.
	*/
	async getApiKeyAndHeaders(model) {
		try {
			const providerConfig = this.providerRequestConfigs.get(model.provider);
			const usesAwsSdkAuth = providerConfig?.auth === "aws-sdk";
			const apiKey = (usesAwsSdkAuth ? void 0 : await this.authStorage.getApiKey(model.provider, { includeFallback: false })) ?? (!usesAwsSdkAuth && providerConfig?.apiKey ? resolveConfigValueOrThrow(providerConfig.apiKey, `API key for provider "${model.provider}"`) : void 0);
			const providerHeaders = resolveHeadersOrThrow(providerConfig?.headers, `provider "${model.provider}"`);
			const modelHeaders = resolveHeadersOrThrow(this.modelRequestHeaders.get(this.getModelRequestKey(model.provider, model.id)), `model "${model.provider}/${model.id}"`);
			let headers = model.headers || providerHeaders || modelHeaders ? {
				...model.headers,
				...providerHeaders,
				...modelHeaders
			} : void 0;
			if (providerConfig?.authHeader) {
				if (!apiKey) return {
					ok: false,
					error: `No API key found for "${model.provider}"`
				};
				headers = {
					...headers,
					Authorization: `Bearer ${apiKey}`
				};
			}
			return {
				ok: true,
				apiKey,
				headers: headers && Object.keys(headers).length > 0 ? headers : void 0
			};
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}
	/**
	* Return auth status for a provider, including request auth configured in models.json.
	* This intentionally does not execute command-backed config values.
	*/
	getProviderAuthStatus(provider) {
		const providerRequestConfig = this.providerRequestConfigs.get(provider);
		if (providerRequestConfig?.auth === "aws-sdk") return {
			configured: true,
			source: "models_json_key",
			label: providerRequestConfig.auth
		};
		const authStatus = this.authStorage.getAuthStatus(provider);
		if (authStatus.source) return authStatus;
		const providerApiKey = providerRequestConfig?.apiKey;
		if (!providerApiKey) return authStatus;
		if (providerApiKey.startsWith("!")) return {
			configured: true,
			source: "models_json_command"
		};
		if (process.env[providerApiKey]) return {
			configured: true,
			source: "environment",
			label: providerApiKey
		};
		return {
			configured: true,
			source: "models_json_key"
		};
	}
	/**
	* Get display name for a provider.
	*/
	getProviderDisplayName(provider) {
		const registeredProvider = this.registeredProviders.get(provider);
		const oauthProvider = this.authStorage.getOAuthProviders().find((p) => p.id === provider);
		return registeredProvider?.name ?? registeredProvider?.oauth?.name ?? oauthProvider?.name ?? BUILT_IN_PROVIDER_DISPLAY_NAMES[provider] ?? provider;
	}
	/**
	* Get API key for a provider.
	*/
	async getApiKeyForProvider(provider) {
		const apiKey = await this.authStorage.getApiKey(provider, { includeFallback: false });
		if (apiKey !== void 0) return apiKey;
		const providerApiKey = this.providerRequestConfigs.get(provider)?.apiKey;
		return providerApiKey ? resolveConfigValueUncached(providerApiKey) : void 0;
	}
	/**
	* Check if a model is using OAuth credentials (subscription).
	*/
	isUsingOAuth(model) {
		return this.authStorage.get(model.provider)?.type === "oauth";
	}
	/**
	* Register a provider dynamically (from extensions).
	*
	* If provider has models: replaces all existing models for this provider.
	* Provider-level request settings are stored for already-known models but
	* never create implicit model rows.
	* If provider has oauth: registers OAuth provider for /login support.
	*/
	registerProvider(providerName, config) {
		this.validateProviderConfig(providerName, config);
		this.applyProviderConfig(providerName, config);
		this.upsertRegisteredProvider(providerName, config);
	}
	/**
	* Unregister a previously registered provider.
	*
	* Removes the provider from the registry and reloads models from disk.
	* Also resets dynamic OAuth and API stream registrations before reapplying
	* remaining dynamic providers.
	* Has no effect if the provider was never registered.
	*/
	unregisterProvider(providerName) {
		if (!this.registeredProviders.has(providerName)) return;
		this.registeredProviders.delete(providerName);
		this.refresh();
	}
	/**
	* Upsert a provider config into registeredProviders.
	* If the provider is already registered, defined values in the incoming config
	* override existing ones; undefined values are preserved from the stored config.
	* If the provider is not registered, the incoming config is stored as-is.
	*/
	upsertRegisteredProvider(providerName, config) {
		const existing = this.registeredProviders.get(providerName);
		if (!existing) {
			this.registeredProviders.set(providerName, config);
			return;
		}
		for (const k of Object.keys(config)) if (config[k] !== void 0) existing[k] = config[k];
	}
	validateProviderConfig(providerName, config) {
		if (config.streamSimple && !config.api) throw new Error(`Provider ${providerName}: "api" is required when registering streamSimple.`);
		if (!config.models || config.models.length === 0) return;
		if (!config.baseUrl) throw new Error(`Provider ${providerName}: "baseUrl" is required when defining models.`);
		for (const modelDef of config.models) if (!(modelDef.api || config.api)) throw new Error(`Provider ${providerName}, model ${modelDef.id}: no "api" specified.`);
	}
	applyProviderConfig(providerName, config) {
		if (config.oauth) {
			const oauthProvider = {
				...config.oauth,
				id: providerName
			};
			getAuthStorageOAuthProviderRegistry(this.authStorage).register(oauthProvider);
		}
		if (config.streamSimple) {
			const streamSimple = config.streamSimple;
			getModelRegistryRuntime(this).apiRegistry.registerApiProvider({
				api: config.api,
				stream: (model, context, options) => streamSimple(model, context, options),
				streamSimple
			}, `provider:${providerName}`);
		}
		this.storeProviderRequestConfig(providerName, config);
		if (config.models && config.models.length > 0) {
			this.models = this.models.filter((m) => m.provider !== providerName);
			for (const modelDef of config.models) {
				const api = modelDef.api || config.api;
				this.storeModelHeaders(providerName, modelDef.id, modelDef.headers);
				this.models.push({
					id: modelDef.id,
					name: modelDef.name,
					api,
					provider: providerName,
					baseUrl: modelDef.baseUrl ?? config.baseUrl,
					reasoning: modelDef.reasoning,
					thinkingLevelMap: modelDef.thinkingLevelMap,
					input: modelDef.input,
					cost: modelDef.cost,
					contextWindow: modelDef.contextWindow,
					maxTokens: modelDef.maxTokens,
					params: modelDef.params,
					headers: void 0,
					compat: modelDef.compat
				});
			}
			if (config.oauth?.modifyModels) {
				const cred = this.authStorage.get(providerName);
				if (cred?.type === "oauth") this.models = config.oauth.modifyModels(this.models, cred);
			}
		}
	}
};
//#endregion
//#region src/agents/sessions/defaults.ts
/** Default thinking level for sessions that do not specify a model-specific override. */
const DEFAULT_THINKING_LEVEL = "medium";
//#endregion
//#region src/agents/sessions/model-resolver.ts
/**
* Model resolution, scoping, and initial selection
*/
const VALID_THINKING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
];
function isValidThinkingLevel(level) {
	return VALID_THINKING_LEVELS.includes(level);
}
/**
* Helper to check if a model ID looks like an alias (no date suffix)
* Dates are typically in format: -20241022 or -20250929
*/
function isAlias$1(id) {
	if (id.endsWith("-latest")) return true;
	return !/-\d{8}$/.test(id);
}
/**
* Find an exact model reference match.
* Supports either a bare model id or a canonical provider/modelId reference.
* When matching by bare id, ambiguous matches across providers are rejected.
*/
function findExactModelReferenceMatch(modelReference, availableModels) {
	const trimmedReference = modelReference.trim();
	if (!trimmedReference) return;
	const normalizedReference = trimmedReference.toLowerCase();
	const canonicalMatches = availableModels.filter((model) => `${model.provider}/${model.id}`.toLowerCase() === normalizedReference);
	if (canonicalMatches.length === 1) return canonicalMatches[0];
	if (canonicalMatches.length > 1) return;
	const slashIndex = trimmedReference.indexOf("/");
	if (slashIndex !== -1) {
		const provider = trimmedReference.slice(0, slashIndex).trim();
		const modelId = trimmedReference.slice(slashIndex + 1).trim();
		if (provider && modelId) {
			const providerMatches = availableModels.filter((model) => model.provider.toLowerCase() === provider.toLowerCase() && model.id.toLowerCase() === modelId.toLowerCase());
			if (providerMatches.length === 1) return providerMatches[0];
			if (providerMatches.length > 1) return;
		}
	}
	const idMatches = availableModels.filter((model) => model.id.toLowerCase() === normalizedReference);
	return idMatches.length === 1 ? idMatches[0] : void 0;
}
/**
* Try to match a pattern to a model from the available models list.
* Returns the matched model or undefined if no match found.
*/
function tryMatchModel(modelPattern, availableModels) {
	const exactMatch = findExactModelReferenceMatch(modelPattern, availableModels);
	if (exactMatch) return exactMatch;
	const matches = availableModels.filter((m) => m.id.toLowerCase().includes(modelPattern.toLowerCase()) || m.name?.toLowerCase().includes(modelPattern.toLowerCase()));
	if (matches.length === 0) return;
	const aliases = matches.filter((m) => isAlias$1(m.id));
	const datedVersions = matches.filter((m) => !isAlias$1(m.id));
	if (aliases.length > 0) {
		aliases.sort((a, b) => b.id.localeCompare(a.id, void 0, { numeric: true }));
		return aliases[0];
	}
	datedVersions.sort((a, b) => b.id.localeCompare(a.id, void 0, { numeric: true }));
	return datedVersions[0];
}
function buildFallbackModel(provider, modelId, availableModels) {
	const providerModels = availableModels.filter((m) => m.provider === provider);
	if (providerModels.length === 0) return;
	const baseModel = providerModels.at(0);
	if (!baseModel) return;
	return {
		...baseModel,
		id: modelId,
		name: modelId
	};
}
function selectAvailableFallbackModel(availableModels) {
	return availableModels.find((model) => model.provider === "openai" && model.id === "gpt-5.6-sol") ?? availableModels[0];
}
/**
* Parse a pattern to extract model and thinking level.
* Handles models with colons in their IDs (e.g., OpenRouter's :exacto suffix).
*
* Algorithm:
* 1. Try to match full pattern as a model
* 2. If found, return it with "off" thinking level
* 3. If not found and has colons, split on last colon:
*    - If suffix is valid thinking level, use it and recurse on prefix
*    - If suffix is invalid, warn and recurse on prefix with "off"
*
* @internal Exported for testing
*/
function parseModelPattern(pattern, availableModels, options) {
	const exactMatch = tryMatchModel(pattern, availableModels);
	if (exactMatch) return {
		model: exactMatch,
		thinkingLevel: void 0,
		warning: void 0
	};
	const lastColonIndex = pattern.lastIndexOf(":");
	if (lastColonIndex === -1) return {
		model: void 0,
		thinkingLevel: void 0,
		warning: void 0
	};
	const prefix = pattern.slice(0, lastColonIndex);
	const suffix = pattern.slice(lastColonIndex + 1);
	if (isValidThinkingLevel(suffix)) {
		const result = parseModelPattern(prefix, availableModels, options);
		if (result.model) return {
			model: result.model,
			thinkingLevel: result.warning ? void 0 : suffix,
			warning: result.warning
		};
		return result;
	}
	if (!(options?.allowInvalidThinkingLevelFallback ?? true)) return {
		model: void 0,
		thinkingLevel: void 0,
		warning: void 0
	};
	const result = parseModelPattern(prefix, availableModels, options);
	if (result.model) return {
		model: result.model,
		thinkingLevel: void 0,
		warning: `Invalid thinking level "${suffix}" in pattern "${pattern}". Using default instead.`
	};
	return result;
}
/**
* Resolve model patterns to actual Model objects with optional thinking levels
* Format: "pattern:level" where :level is optional
* For each pattern, finds all matching models and picks the best version:
* 1. Prefer alias (e.g., claude-sonnet-4-5) over dated versions (claude-sonnet-4-5-20250929)
* 2. If no alias, pick the latest dated version
*
* Supports models with colons in their IDs (e.g., OpenRouter's model:exacto).
* The algorithm tries to match the full pattern first, then progressively
* strips colon-suffixes to find a match.
*/
async function resolveModelScope(patterns, modelRegistry) {
	const availableModels = modelRegistry.getAvailable();
	const scopedModels = [];
	for (const pattern of patterns) {
		if (pattern.includes("*") || pattern.includes("?") || pattern.includes("[")) {
			const colonIdx = pattern.lastIndexOf(":");
			let globPattern = pattern;
			let thinkingLevel;
			if (colonIdx !== -1) {
				const suffix = pattern.slice(colonIdx + 1);
				if (isValidThinkingLevel(suffix)) {
					thinkingLevel = suffix;
					globPattern = pattern.slice(0, colonIdx);
				}
			}
			const matchingModels = availableModels.filter((m) => {
				const fullId = `${m.provider}/${m.id}`;
				return minimatch(fullId, globPattern, { nocase: true }) || minimatch(m.id, globPattern, { nocase: true });
			});
			if (matchingModels.length === 0) {
				console.warn(chalk.yellow(`Warning: No models match pattern "${pattern}"`));
				continue;
			}
			for (const model of matchingModels) if (!scopedModels.some((sm) => modelsAreEqual(sm.model, model))) scopedModels.push({
				model,
				thinkingLevel
			});
			continue;
		}
		const { model, thinkingLevel, warning } = parseModelPattern(pattern, availableModels);
		if (warning) console.warn(chalk.yellow(`Warning: ${warning}`));
		if (!model) {
			console.warn(chalk.yellow(`Warning: No models match pattern "${pattern}"`));
			continue;
		}
		if (!scopedModels.some((sm) => modelsAreEqual(sm.model, model))) scopedModels.push({
			model,
			thinkingLevel
		});
	}
	return scopedModels;
}
/**
* Resolve a single model from CLI flags.
*
* Supports:
* - --provider <provider> --model <pattern>
* - --model <provider>/<pattern>
* - Fuzzy matching (same rules as model scoping: exact id, then partial id/name)
*
* Note: This does not apply the thinking level by itself, but it may *parse* and
* return a thinking level from "<pattern>:<thinking>" so the caller can apply it.
*/
function resolveCliModel(options) {
	const { cliProvider, cliModel, cliThinking, modelRegistry } = options;
	if (!cliModel) return {
		model: void 0,
		warning: void 0,
		error: void 0
	};
	const availableModels = modelRegistry.getAll();
	if (availableModels.length === 0) return {
		model: void 0,
		warning: void 0,
		error: "No models available. Check your installation or add models to models.json."
	};
	const providerMap = /* @__PURE__ */ new Map();
	for (const m of availableModels) providerMap.set(m.provider.toLowerCase(), m.provider);
	let provider = cliProvider ? providerMap.get(cliProvider.toLowerCase()) : void 0;
	if (cliProvider && !provider) return {
		model: void 0,
		warning: void 0,
		error: `Unknown provider "${cliProvider}". Use --list-models to see available providers/models.`
	};
	let pattern = cliModel;
	let inferredProvider = false;
	if (!provider) {
		const slashIndex = cliModel.indexOf("/");
		if (slashIndex !== -1) {
			const maybeProvider = cliModel.slice(0, slashIndex);
			const canonical = providerMap.get(maybeProvider.toLowerCase());
			if (canonical) {
				provider = canonical;
				pattern = cliModel.slice(slashIndex + 1);
				inferredProvider = true;
			}
		}
	}
	if (!provider) {
		const lower = cliModel.toLowerCase();
		const exact = availableModels.find((m) => m.id.toLowerCase() === lower || `${m.provider}/${m.id}`.toLowerCase() === lower);
		if (exact) return {
			model: exact,
			warning: void 0,
			thinkingLevel: void 0,
			error: void 0
		};
	}
	if (cliProvider && provider) {
		const prefix = `${provider}/`;
		if (cliModel.toLowerCase().startsWith(prefix.toLowerCase())) pattern = cliModel.slice(prefix.length);
	}
	const candidates = provider ? availableModels.filter((m) => m.provider === provider) : availableModels;
	const { model, thinkingLevel, warning } = parseModelPattern(pattern, candidates, { allowInvalidThinkingLevelFallback: false });
	if (model) return {
		model,
		thinkingLevel,
		warning,
		error: void 0
	};
	if (inferredProvider) {
		const lower = cliModel.toLowerCase();
		const exact = availableModels.find((m) => m.id.toLowerCase() === lower || `${m.provider}/${m.id}`.toLowerCase() === lower);
		if (exact) return {
			model: exact,
			warning: void 0,
			thinkingLevel: void 0,
			error: void 0
		};
		const fallback = parseModelPattern(cliModel, availableModels, { allowInvalidThinkingLevelFallback: false });
		if (fallback.model) return {
			model: fallback.model,
			thinkingLevel: fallback.thinkingLevel,
			warning: fallback.warning,
			error: void 0
		};
	}
	if (provider) {
		let fallbackPattern = pattern;
		let fallbackThinking;
		if (!cliThinking) {
			const lastColon = pattern.lastIndexOf(":");
			if (lastColon !== -1) {
				const suffix = pattern.slice(lastColon + 1);
				if (isValidThinkingLevel(suffix)) {
					fallbackPattern = pattern.slice(0, lastColon);
					fallbackThinking = suffix;
				}
			}
		}
		const fallbackModel = buildFallbackModel(provider, fallbackPattern, availableModels);
		if (fallbackModel) {
			const requestedThinking = cliThinking ?? fallbackThinking;
			return {
				model: requestedThinking && requestedThinking !== "off" ? {
					...fallbackModel,
					reasoning: true
				} : fallbackModel,
				thinkingLevel: requestedThinking,
				warning: warning ? `${warning} Model "${fallbackPattern}" not found for provider "${provider}". Using custom model id.` : `Model "${fallbackPattern}" not found for provider "${provider}". Using custom model id.`,
				error: void 0
			};
		}
	}
	return {
		model: void 0,
		thinkingLevel: void 0,
		warning,
		error: `Model "${provider ? `${provider}/${pattern}` : cliModel}" not found. Use --list-models to see available models.`
	};
}
/**
* Find the initial model to use based on priority:
* 1. CLI args (provider + model)
* 2. First model from scoped models (if not continuing/resuming)
* 3. Restored from session (if continuing/resuming)
* 4. Saved default from settings
* 5. First available model with valid API key
*/
async function findInitialModel(options) {
	const { cliProvider, cliModel, scopedModels, isContinuing, defaultProvider, defaultModelId, defaultThinkingLevel, modelRegistry } = options;
	let model;
	let thinkingLevel = DEFAULT_THINKING_LEVEL;
	if (cliProvider && cliModel) {
		const resolved = resolveCliModel({
			cliProvider,
			cliModel,
			modelRegistry
		});
		if (resolved.error) {
			console.error(chalk.red(resolved.error));
			process.exit(1);
		}
		if (resolved.model) return {
			model: resolved.model,
			thinkingLevel: resolved.thinkingLevel ?? "medium",
			fallbackMessage: void 0
		};
	}
	if (scopedModels.length > 0 && !isContinuing) {
		const scopedModel = scopedModels.at(0);
		if (!scopedModel) throw new Error("Scoped model list became empty during selection");
		return {
			model: scopedModel.model,
			thinkingLevel: scopedModel.thinkingLevel ?? defaultThinkingLevel ?? "medium",
			fallbackMessage: void 0
		};
	}
	if (defaultProvider && defaultModelId) {
		const found = modelRegistry.find(defaultProvider, defaultModelId);
		if (found && modelRegistry.hasConfiguredAuth(found)) {
			model = found;
			if (defaultThinkingLevel) thinkingLevel = defaultThinkingLevel;
			return {
				model,
				thinkingLevel,
				fallbackMessage: void 0
			};
		}
	}
	const availableModels = modelRegistry.getAvailable();
	if (availableModels.length > 0) return {
		model: selectAvailableFallbackModel(availableModels),
		thinkingLevel: DEFAULT_THINKING_LEVEL,
		fallbackMessage: void 0
	};
	return {
		model: void 0,
		thinkingLevel: DEFAULT_THINKING_LEVEL,
		fallbackMessage: void 0
	};
}
/**
* Restore model from session, with fallback to available models
*/
async function restoreModelFromSession(savedProvider, savedModelId, currentModel, shouldPrintMessages, modelRegistry) {
	const restoredModel = modelRegistry.find(savedProvider, savedModelId);
	const hasConfiguredAuth = restoredModel ? modelRegistry.hasConfiguredAuth(restoredModel) : false;
	if (restoredModel && hasConfiguredAuth) {
		if (shouldPrintMessages) console.log(chalk.dim(`Restored model: ${savedProvider}/${savedModelId}`));
		return {
			model: restoredModel,
			fallbackMessage: void 0
		};
	}
	const reason = !restoredModel ? "model no longer exists" : "no auth configured";
	if (shouldPrintMessages) console.error(chalk.yellow(`Warning: Could not restore model ${savedProvider}/${savedModelId} (${reason}).`));
	if (currentModel) {
		if (shouldPrintMessages) console.log(chalk.dim(`Falling back to: ${currentModel.provider}/${currentModel.id}`));
		return {
			model: currentModel,
			fallbackMessage: `Could not restore model ${savedProvider}/${savedModelId} (${reason}). Using ${currentModel.provider}/${currentModel.id}.`
		};
	}
	const availableModels = modelRegistry.getAvailable();
	if (availableModels.length > 0) {
		const fallbackModel = selectAvailableFallbackModel(availableModels);
		if (!fallbackModel) return {
			model: void 0,
			fallbackMessage: `Could not restore model ${savedProvider}/${savedModelId} (${reason}). No models available.`
		};
		if (shouldPrintMessages) console.log(chalk.dim(`Falling back to: ${fallbackModel.provider}/${fallbackModel.id}`));
		return {
			model: fallbackModel,
			fallbackMessage: `Could not restore model ${savedProvider}/${savedModelId} (${reason}). Using ${fallbackModel.provider}/${fallbackModel.id}.`
		};
	}
	return {
		model: void 0,
		fallbackMessage: void 0
	};
}
//#endregion
//#region src/shared/ignore-rules.ts
const IGNORE_FILE_NAMES = [
	".gitignore",
	".ignore",
	".fdignore"
];
const IGNORE_FILE_MAX_BYTES = 4194304;
const IGNORE_MATCHER_MAX_PATTERNS = 2e4;
const IGNORE_PATTERN_MAX_CHARS = 16384;
const IGNORE_MATCHER_MAX_PATTERN_CHARS = IGNORE_FILE_MAX_BYTES;
const OVERSIZED_IGNORE_FILE = Symbol("oversizedIgnoreFile");
const COMPLEX_IGNORE_FILE = Symbol("complexIgnoreFile");
const ignoreMatcherStates = /* @__PURE__ */ new WeakMap();
function normalizeLiteralSubtreePath(pathname) {
	const posixPath = normalizeNativePathSeparators(pathname);
	return posixPath.endsWith("/") ? posixPath.slice(0, -1) : posixPath;
}
function setContainsLiteralSubtree(pathname, subtrees) {
	for (const subtree of subtrees) if (!subtree || pathname === subtree || pathname.startsWith(`${subtree}/`)) return true;
	return false;
}
function isInLiteralSubtree(pathname, state) {
	const normalized = normalizeLiteralSubtreePath(pathname);
	return setContainsLiteralSubtree(normalized, state.excludedSubtrees) || setContainsLiteralSubtree(normalized.toLowerCase(), state.caseFoldedExcludedSubtrees);
}
function getIgnoreMatcherState(matcher, caseFoldNewSubtrees) {
	const existing = ignoreMatcherStates.get(matcher);
	if (existing) {
		if (!existing.caseModeKnown && caseFoldNewSubtrees !== void 0) {
			existing.caseFoldNewSubtrees = caseFoldNewSubtrees;
			existing.caseModeKnown = true;
		}
		return existing;
	}
	const state = {
		excludedSubtrees: /* @__PURE__ */ new Set(),
		caseFoldedExcludedSubtrees: /* @__PURE__ */ new Set(),
		caseFoldNewSubtrees: caseFoldNewSubtrees ?? false,
		caseModeKnown: caseFoldNewSubtrees !== void 0,
		patternCount: 0,
		patternChars: 0
	};
	ignoreMatcherStates.set(matcher, state);
	const originalIgnores = matcher.ignores.bind(matcher);
	const originalTest = matcher.test.bind(matcher);
	const originalCheckIgnore = matcher.checkIgnore.bind(matcher);
	matcher.ignores = ((pathname) => {
		const ignored = originalIgnores(pathname);
		return isInLiteralSubtree(pathname, state) || ignored;
	});
	matcher.test = ((pathname) => {
		const result = originalTest(pathname);
		return isInLiteralSubtree(pathname, state) ? {
			ignored: true,
			unignored: false
		} : result;
	});
	matcher.checkIgnore = ((pathname) => {
		const result = originalCheckIgnore(pathname);
		return isInLiteralSubtree(pathname, state) ? {
			ignored: true,
			unignored: false
		} : result;
	});
	matcher.createFilter = (() => (pathname) => !matcher.ignores(pathname));
	matcher.filter = ((pathnames) => pathnames.filter(matcher.createFilter()));
	return state;
}
function inheritIgnoreMatcherState(receiver, pattern) {
	const candidates = Array.isArray(pattern) ? pattern : [pattern];
	for (const candidate of candidates) {
		if (typeof candidate !== "object" || candidate === null || candidate === receiver) continue;
		const inherited = ignoreMatcherStates.get(candidate);
		if (!inherited) continue;
		const state = getIgnoreMatcherState(receiver);
		for (const subtree of inherited.excludedSubtrees) state.excludedSubtrees.add(subtree);
		for (const subtree of inherited.caseFoldedExcludedSubtrees) state.caseFoldedExcludedSubtrees.add(subtree);
		state.patternCount = Math.min(IGNORE_MATCHER_MAX_PATTERNS, state.patternCount + inherited.patternCount);
		state.patternChars = Math.min(IGNORE_MATCHER_MAX_PATTERN_CHARS, state.patternChars + inherited.patternChars);
	}
}
const IGNORE_ADD_STATE_PATCHED = Symbol("ignoreAddStatePatched");
function installIgnoreAddStatePropagation() {
	const prototype = Object.getPrototypeOf(ignore());
	if (prototype[IGNORE_ADD_STATE_PATCHED]) return;
	const originalAdd = Reflect.get(prototype, "add");
	prototype.add = function(pattern) {
		const result = Reflect.apply(originalAdd, this, [pattern]);
		inheritIgnoreMatcherState(this, pattern);
		return result;
	};
	Object.defineProperty(prototype, IGNORE_ADD_STATE_PATCHED, { value: true });
}
installIgnoreAddStatePropagation();
function addFailClosedSubtree(matcher, prefix) {
	const state = getIgnoreMatcherState(matcher);
	const normalized = normalizeLiteralSubtreePath(prefix);
	if (state.caseFoldNewSubtrees) state.caseFoldedExcludedSubtrees.add(normalized.toLowerCase());
	else state.excludedSubtrees.add(normalized);
}
function parseIgnorePatterns(content, prefix, budget) {
	const patterns = [];
	let patternChars = 0;
	let lineStart = 0;
	while (lineStart <= content.length) {
		const newline = content.indexOf("\n", lineStart);
		const lineEnd = newline === -1 ? content.length : newline;
		const contentEnd = lineEnd > lineStart && content[lineEnd - 1] === "\r" ? lineEnd - 1 : lineEnd;
		const pattern = prefixIgnorePattern(content.slice(lineStart, contentEnd), prefix);
		if (pattern) {
			if (pattern.length > IGNORE_PATTERN_MAX_CHARS || patterns.length >= budget.patterns) return COMPLEX_IGNORE_FILE;
			patternChars += pattern.length;
			if (patternChars > budget.chars) return COMPLEX_IGNORE_FILE;
			patterns.push(pattern);
		}
		if (newline === -1) break;
		lineStart = newline + 1;
	}
	return {
		patterns,
		chars: patternChars
	};
}
const normalizeNativePathSeparators = (pathValue) => pathValue.split(sep).join("/");
function addIgnoreRules(dir, rootDir, ig, options) {
	if (ig && !options) throw new Error("addIgnoreRules requires ignoreCase when a matcher is supplied");
	const matcher = ig ?? ignore();
	const state = getIgnoreMatcherState(matcher, options?.ignoreCase ?? true);
	const relativeDir = relative(rootDir, dir);
	const prefix = relativeDir ? `${normalizeNativePathSeparators(relativeDir)}/` : "";
	for (const filename of IGNORE_FILE_NAMES) {
		const ignorePath = join(dir, filename);
		if (!existsSync(ignorePath)) continue;
		const content = readIgnoreFileContent(ignorePath);
		if (content === OVERSIZED_IGNORE_FILE) {
			addFailClosedSubtree(matcher, prefix);
			break;
		}
		if (content === null) continue;
		const parsed = parseIgnorePatterns(content, prefix, {
			patterns: IGNORE_MATCHER_MAX_PATTERNS - state.patternCount,
			chars: IGNORE_MATCHER_MAX_PATTERN_CHARS - state.patternChars
		});
		if (parsed === COMPLEX_IGNORE_FILE) {
			addFailClosedSubtree(matcher, prefix);
			break;
		}
		if (parsed.patterns.length > 0) {
			matcher.add(parsed.patterns);
			state.patternCount += parsed.patterns.length;
			state.patternChars += parsed.chars;
		}
	}
	return matcher;
}
function readIgnoreFileContent(ignorePath) {
	let resolvedPath;
	try {
		resolvedPath = realpathSync(ignorePath);
	} catch {
		return null;
	}
	try {
		const { buffer } = readRegularFileSync({
			filePath: resolvedPath,
			maxBytes: IGNORE_FILE_MAX_BYTES
		});
		return buffer.toString("utf-8");
	} catch (error) {
		if (error instanceof Error && error.message.startsWith(`File exceeds ${IGNORE_FILE_MAX_BYTES} bytes:`)) return OVERSIZED_IGNORE_FILE;
		return null;
	}
}
function prefixIgnorePattern(line, prefix) {
	const trimmed = line.trim();
	if (!trimmed || trimmed.startsWith("#") && !trimmed.startsWith("\\#")) return "";
	const negated = line.startsWith("!");
	const pattern = negated ? line.slice(1) : line;
	const anchored = pattern.startsWith("/");
	const normalized = anchored ? pattern.slice(1) : pattern;
	const matchPattern = normalized.replace(/ +$/, "");
	const prefixed = `${prefix}${prefix && !anchored && !matchPattern.slice(0, -1).includes("/") ? "**/" : ""}${normalized}`;
	return negated ? `!${prefixed}` : prefixed;
}
//#endregion
//#region src/agents/sessions/package-manager.ts
/**
* Session package/resource manager.
*
* Resolves extension, skill, prompt, and theme sources from npm, git, local paths, and project manifests.
*/
/**
* Compute a numeric precedence rank for a resource based on its metadata.
* Lower rank = higher precedence. Used to sort resolved resources so that
* name-collision resolution ("first wins") produces the correct outcome.
*
* Precedence (highest to lowest):
*   0  project + settings entry (source: "local", scope: "project")
*   1  project + auto-discovered (source: "auto", scope: "project")
*   2  user + settings entry (source: "local", scope: "user")
*   3  user + auto-discovered (source: "auto", scope: "user")
*   4  package resource (origin: "package")
*/
function resourcePrecedenceRank(m) {
	if (m.origin === "package") return 4;
	return (m.scope === "project" ? 0 : 2) + (m.source === "local" ? 0 : 1);
}
const RESOURCE_TYPES = [
	"extensions",
	"skills",
	"prompts",
	"themes"
];
const FILE_PATTERNS = {
	extensions: /\.(ts|js)$/,
	skills: /\.md$/,
	prompts: /\.md$/,
	themes: /\.json$/
};
function getHomeDir() {
	return process.env.HOME || homedir();
}
function getAgentResourceTempDir(agentDir) {
	const tempDir = join(agentDir, "tmp", "resources");
	mkdirSync(tempDir, {
		recursive: true,
		mode: 448
	});
	chmodSync(tempDir, 448);
	return tempDir;
}
function isPattern(s) {
	return s.startsWith("!") || s.startsWith("+") || s.startsWith("-") || s.includes("*") || s.includes("?");
}
function isOverridePattern(s) {
	return s.startsWith("!") || s.startsWith("+") || s.startsWith("-");
}
function hasGlobPattern(s) {
	return s.includes("*") || s.includes("?");
}
function splitPatterns(entries) {
	const plain = [];
	const patterns = [];
	for (const entry of entries) if (isPattern(entry)) patterns.push(entry);
	else plain.push(entry);
	return {
		plain,
		patterns
	};
}
function collectFiles(dir, filePattern, skipNodeModules = true, ignoreMatcher, rootDir) {
	const files = [];
	if (!existsSync(dir)) return files;
	const root = rootDir ?? dir;
	const ig = ignoreMatcher ? addIgnoreRules(dir, root, ignoreMatcher, { ignoreCase: true }) : addIgnoreRules(dir, root);
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			if (skipNodeModules && entry.name === "node_modules") continue;
			const fullPath = join(dir, entry.name);
			let isDir = entry.isDirectory();
			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) try {
				const stats = statSync(fullPath);
				isDir = stats.isDirectory();
				isFile = stats.isFile();
			} catch {
				continue;
			}
			const relPath = normalizeNativePathSeparators(relative(root, fullPath));
			const ignorePath = isDir ? `${relPath}/` : relPath;
			if (ig.ignores(ignorePath)) continue;
			if (isDir) files.push(...collectFiles(fullPath, filePattern, skipNodeModules, ig, root));
			else if (isFile && filePattern.test(entry.name)) files.push(fullPath);
		}
	} catch {}
	return files;
}
function collectSkillEntries(dir, mode, ignoreMatcher, rootDir) {
	const entries = [];
	if (!existsSync(dir)) return entries;
	const root = rootDir ?? dir;
	const ig = ignoreMatcher ? addIgnoreRules(dir, root, ignoreMatcher, { ignoreCase: true }) : addIgnoreRules(dir, root);
	try {
		const dirEntries = readdirSync(dir, { withFileTypes: true });
		for (const entry of dirEntries) {
			if (entry.name !== "SKILL.md") continue;
			const fullPath = join(dir, entry.name);
			if (!isRealPathWithinRoot(root, fullPath)) continue;
			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) try {
				isFile = statSync(fullPath).isFile();
			} catch {
				continue;
			}
			const relPath = normalizeNativePathSeparators(relative(root, fullPath));
			if (isFile && !ig.ignores(relPath)) {
				entries.push(fullPath);
				return entries;
			}
		}
		for (const entry of dirEntries) {
			if (entry.name.startsWith(".")) continue;
			if (entry.name === "node_modules") continue;
			const fullPath = join(dir, entry.name);
			if (!isRealPathWithinRoot(root, fullPath)) continue;
			let isDir = entry.isDirectory();
			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) try {
				const stats = statSync(fullPath);
				isDir = stats.isDirectory();
				isFile = stats.isFile();
			} catch {
				continue;
			}
			const relPath = normalizeNativePathSeparators(relative(root, fullPath));
			if (mode === "openclaw" && dir === root && isFile && entry.name.endsWith(".md") && !ig.ignores(relPath)) {
				entries.push(fullPath);
				continue;
			}
			if (!isDir) continue;
			if (ig.ignores(`${relPath}/`)) continue;
			entries.push(...collectSkillEntries(fullPath, mode, ig, root));
		}
	} catch {}
	return entries;
}
function collectAutoSkillEntries(dir, mode) {
	return collectSkillEntries(dir, mode);
}
function findGitRepoRoot(startDir) {
	let dir = resolve(startDir);
	while (true) {
		if (existsSync(join(dir, ".git"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}
function collectAncestorAgentsSkillDirs(startDir) {
	const skillDirs = [];
	const resolvedStartDir = resolve(startDir);
	const gitRepoRoot = findGitRepoRoot(resolvedStartDir);
	let dir = resolvedStartDir;
	while (true) {
		skillDirs.push(join(dir, ".agents", "skills"));
		if (gitRepoRoot && dir === gitRepoRoot) break;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return skillDirs;
}
function collectTopLevelAutoResourceEntries(dir, resourceType) {
	const entries = [];
	if (!existsSync(dir)) return entries;
	const ig = addIgnoreRules(dir, dir);
	try {
		const dirEntries = readdirSync(dir, { withFileTypes: true });
		for (const entry of dirEntries) {
			if (entry.name.startsWith(".")) continue;
			if (entry.name === "node_modules") continue;
			const fullPath = join(dir, entry.name);
			if (!isRealPathWithinRoot(dir, fullPath)) continue;
			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) try {
				isFile = statSync(fullPath).isFile();
			} catch {
				continue;
			}
			const relPath = normalizeNativePathSeparators(relative(dir, fullPath));
			if (ig.ignores(relPath)) continue;
			if (isFile && FILE_PATTERNS[resourceType].test(entry.name)) entries.push(fullPath);
		}
	} catch {}
	return entries;
}
function readResourceManifestFile(packageJsonPath) {
	try {
		const content = readFileSync(packageJsonPath, "utf-8");
		return JSON.parse(content).openclaw ?? null;
	} catch {
		return null;
	}
}
function resolveExtensionEntries(dir, rootDir = dir) {
	const packageJsonPath = join(dir, "package.json");
	if (existsSync(packageJsonPath)) {
		const manifest = readResourceManifestFile(packageJsonPath);
		if (manifest?.extensions?.length) {
			const entries = [];
			for (const extPath of manifest.extensions) {
				const resolvedExtPath = resolve(dir, extPath);
				if (existsSync(resolvedExtPath) && isRealPathWithinRoot(rootDir, resolvedExtPath)) entries.push(resolvedExtPath);
			}
			if (entries.length > 0) return entries;
		}
	}
	const indexTs = join(dir, "index.ts");
	const indexJs = join(dir, "index.js");
	if (existsSync(indexTs) && isRealPathWithinRoot(rootDir, indexTs)) return [indexTs];
	if (existsSync(indexJs) && isRealPathWithinRoot(rootDir, indexJs)) return [indexJs];
	return null;
}
function collectAutoExtensionEntries(dir) {
	const entries = [];
	if (!existsSync(dir)) return entries;
	const rootEntries = resolveExtensionEntries(dir);
	if (rootEntries) return rootEntries;
	const ig = addIgnoreRules(dir, dir);
	try {
		const dirEntries = readdirSync(dir, { withFileTypes: true });
		for (const entry of dirEntries) {
			if (entry.name.startsWith(".")) continue;
			if (entry.name === "node_modules") continue;
			const fullPath = join(dir, entry.name);
			if (!isRealPathWithinRoot(dir, fullPath)) continue;
			let isDir = entry.isDirectory();
			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) try {
				const stats = statSync(fullPath);
				isDir = stats.isDirectory();
				isFile = stats.isFile();
			} catch {
				continue;
			}
			const relPath = normalizeNativePathSeparators(relative(dir, fullPath));
			const ignorePath = isDir ? `${relPath}/` : relPath;
			if (ig.ignores(ignorePath)) continue;
			if (isFile && (entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) entries.push(fullPath);
			else if (isDir) {
				const resolvedEntries = resolveExtensionEntries(fullPath, dir);
				if (resolvedEntries) entries.push(...resolvedEntries);
			}
		}
	} catch {}
	return entries;
}
/**
* Collect resource files from a directory based on resource type.
* Extensions use smart discovery (index.ts in subdirs), others use recursive collection.
*/
function collectResourceFiles(dir, resourceType) {
	if (resourceType === "skills") return collectSkillEntries(dir, "openclaw");
	if (resourceType === "extensions") return collectAutoExtensionEntries(dir);
	return collectFiles(dir, FILE_PATTERNS[resourceType]);
}
const AUTO_RESOURCE_COLLECTORS = {
	extensions: collectAutoExtensionEntries,
	skills: (dir) => collectAutoSkillEntries(dir, "openclaw"),
	prompts: (dir) => collectTopLevelAutoResourceEntries(dir, "prompts"),
	themes: (dir) => collectTopLevelAutoResourceEntries(dir, "themes")
};
function resolveRealPathIfPossible(path) {
	try {
		return realpathSync.native(path);
	} catch {
		return resolve(path);
	}
}
function isRealPathWithinRoot(root, candidate) {
	return isPathInside(resolveRealPathIfPossible(resolve(root)), resolveRealPathIfPossible(candidate));
}
function getMatchCandidates(filePath, baseDir, includeNames) {
	const name = basename(filePath);
	const candidates = [normalizeNativePathSeparators(relative(baseDir, filePath)), normalizeNativePathSeparators(filePath)];
	if (includeNames) candidates.push(name);
	if (name === "SKILL.md") {
		const parentDir = dirname(filePath);
		candidates.push(normalizeNativePathSeparators(relative(baseDir, parentDir)), normalizeNativePathSeparators(parentDir));
		if (includeNames) candidates.push(basename(parentDir));
	}
	return candidates;
}
function matchesAnyPattern(filePath, patterns, baseDir) {
	const candidates = getMatchCandidates(filePath, baseDir, true);
	return patterns.some((pattern) => minimatch.match(candidates, normalizeNativePathSeparators(pattern)).length > 0);
}
function normalizeExactPattern(pattern) {
	const normalized = pattern.startsWith("./") || pattern.startsWith(".\\") ? pattern.slice(2) : pattern;
	return normalizeNativePathSeparators(normalized);
}
function matchesAnyExactPattern(filePath, patterns, baseDir) {
	const candidates = new Set(getMatchCandidates(filePath, baseDir, false));
	return patterns.some((pattern) => candidates.has(normalizeExactPattern(pattern)));
}
function isEnabledByOverrides(filePath, patterns, baseDir) {
	return applyPatterns([filePath], patterns.filter(isOverridePattern), baseDir).has(filePath);
}
/**
* Apply patterns to paths and return a Set of enabled paths.
* Pattern types:
* - Plain patterns: include matching paths
* - `!pattern`: exclude matching paths
* - `+path`: force-include exact path (overrides exclusions)
* - `-path`: force-exclude exact path (overrides force-includes)
*/
function applyPatterns(allPaths, patterns, baseDir) {
	const includes = [];
	const excludes = [];
	const forceIncludes = [];
	const forceExcludes = [];
	for (const p of patterns) if (p.startsWith("+")) forceIncludes.push(p.slice(1));
	else if (p.startsWith("-")) forceExcludes.push(p.slice(1));
	else if (p.startsWith("!")) excludes.push(p.slice(1));
	else includes.push(p);
	let result;
	if (includes.length === 0) result = [...allPaths];
	else result = allPaths.filter((filePath) => matchesAnyPattern(filePath, includes, baseDir));
	if (excludes.length > 0) result = result.filter((filePath) => !matchesAnyPattern(filePath, excludes, baseDir));
	if (forceIncludes.length > 0) {
		for (const filePath of allPaths) if (!result.includes(filePath) && matchesAnyExactPattern(filePath, forceIncludes, baseDir)) result.push(filePath);
	}
	if (forceExcludes.length > 0) result = result.filter((filePath) => !matchesAnyExactPattern(filePath, forceExcludes, baseDir));
	return new Set(result);
}
function getPackageFilter(pkg) {
	if (typeof pkg === "string") return;
	return RESOURCE_TYPES.some((resourceType) => pkg[resourceType] !== void 0) ? pkg : void 0;
}
var DefaultPackageManager = class {
	constructor(options) {
		this.cwd = options.cwd;
		this.agentDir = options.agentDir;
		this.settingsManager = options.settingsManager;
	}
	async resolve(onMissing) {
		const accumulator = this.createAccumulator();
		const globalSettings = this.settingsManager.getGlobalSettings();
		const projectSettings = this.settingsManager.getProjectSettings();
		const allPackages = [];
		for (const pkg of projectSettings.packages ?? []) allPackages.push({
			pkg,
			scope: "project"
		});
		for (const pkg of globalSettings.packages ?? []) allPackages.push({
			pkg,
			scope: "user"
		});
		const packageSources = this.dedupePackages(allPackages);
		await this.resolvePackageSources(packageSources, accumulator, onMissing);
		const globalBaseDir = this.agentDir;
		const projectBaseDir = join(this.cwd, CONFIG_DIR_NAME);
		const localScopes = [{
			scope: "project",
			settings: projectSettings,
			baseDir: projectBaseDir
		}, {
			scope: "user",
			settings: globalSettings,
			baseDir: globalBaseDir
		}];
		for (const resourceType of RESOURCE_TYPES) for (const { scope, settings, baseDir } of localScopes) this.resolveLocalEntries(settings[resourceType] ?? [], resourceType, accumulator[resourceType], {
			source: "local",
			scope,
			origin: "top-level"
		}, baseDir);
		this.addAutoDiscoveredResources(accumulator, globalSettings, projectSettings, globalBaseDir, projectBaseDir);
		return this.toResolvedPaths(accumulator);
	}
	async resolveExtensionSources(sources, options) {
		const accumulator = this.createAccumulator();
		const scope = options?.temporary ? "temporary" : options?.local ? "project" : "user";
		const packageSources = sources.map((source) => ({
			pkg: source,
			scope
		}));
		await this.resolvePackageSources(packageSources, accumulator);
		return this.toResolvedPaths(accumulator);
	}
	async resolvePackageSources(sources, accumulator, onMissing) {
		for (const { pkg, scope } of sources) {
			const sourceStr = typeof pkg === "string" ? pkg : pkg.source;
			const filter = getPackageFilter(pkg);
			const parsed = this.parseSource(sourceStr);
			const metadata = {
				source: sourceStr,
				scope,
				origin: "package"
			};
			const target = this.resolvePackageTarget(parsed, scope);
			if (!target) continue;
			if (target.kind === "missing") {
				if (onMissing && await onMissing(sourceStr) === "error") throw new Error(`Missing source: ${sourceStr}`);
				continue;
			}
			metadata.baseDir = target.baseDir;
			if (target.kind === "file") {
				this.addResource(accumulator.extensions, target.path, metadata, this.isExtensionEnabled(target.path, filter?.extensions, target.baseDir));
				continue;
			}
			const hasPackageLayout = this.collectPackageResources(target.path, accumulator, filter, metadata);
			if (parsed.type === "local" && !hasPackageLayout) this.addResource(accumulator.extensions, target.path, metadata, this.isExtensionEnabled(target.path, filter?.extensions, target.baseDir));
		}
	}
	resolvePackageTarget(source, scope) {
		if (source.type === "npm") {
			const path = this.getNpmInstallPath(source, scope);
			return !existsSync(path) || source.pinned && !this.installedNpmMatchesPinnedVersion(source, path) ? { kind: "missing" } : {
				kind: "directory",
				path,
				baseDir: path
			};
		}
		if (source.type === "git") {
			const path = this.getGitInstallPath(source, scope);
			return existsSync(path) ? {
				kind: "directory",
				path,
				baseDir: path
			} : { kind: "missing" };
		}
		const path = this.resolvePathFromBase(source.path, this.getBaseDirForScope(scope));
		if (!existsSync(path)) return { kind: "missing" };
		try {
			const stats = statSync(path);
			if (stats.isFile()) return {
				kind: "file",
				path,
				baseDir: dirname(path)
			};
			if (stats.isDirectory()) return {
				kind: "directory",
				path,
				baseDir: path
			};
		} catch {}
	}
	isExtensionEnabled(path, patterns, baseDir) {
		if (patterns === void 0) return true;
		return patterns.length > 0 && applyPatterns([path], patterns, baseDir).has(path);
	}
	parseSource(source) {
		if (source.startsWith("npm:")) {
			const spec = source.slice(4).trim();
			const { name, version } = this.parseNpmSpec(spec);
			return {
				type: "npm",
				spec,
				name,
				pinned: Boolean(version)
			};
		}
		if (isLocalPath(source)) return {
			type: "local",
			path: source
		};
		const gitParsed = parseGitUrl(source);
		if (gitParsed) return gitParsed;
		return {
			type: "local",
			path: source
		};
	}
	installedNpmMatchesPinnedVersion(source, installedPath) {
		const installedVersion = this.getInstalledNpmVersion(installedPath);
		if (!installedVersion) return false;
		const { version: pinnedVersion } = this.parseNpmSpec(source.spec);
		if (!pinnedVersion) return true;
		return installedVersion === pinnedVersion;
	}
	getInstalledNpmVersion(installedPath) {
		const packageJsonPath = join(installedPath, "package.json");
		if (!existsSync(packageJsonPath)) return;
		try {
			const content = readFileSync(packageJsonPath, "utf-8");
			return JSON.parse(content).version;
		} catch {
			return;
		}
	}
	/**
	* Get a unique identity for a package, ignoring version/ref.
	* Used to detect when the same package is in both global and project settings.
	* For git packages, uses normalized host/path to ensure SSH and HTTPS URLs
	* for the same repository are treated as identical.
	*/
	getPackageIdentity(source, scope) {
		const parsed = this.parseSource(source);
		if (parsed.type === "npm") return `npm:${parsed.name}`;
		if (parsed.type === "git") return `git:${parsed.host}/${parsed.path}`;
		if (scope) {
			const baseDir = this.getBaseDirForScope(scope);
			return `local:${this.resolvePathFromBase(parsed.path, baseDir)}`;
		}
		return `local:${this.resolvePath(parsed.path)}`;
	}
	/**
	* Dedupe packages: if same package identity appears in both global and project,
	* keep only the project one (project wins).
	*/
	dedupePackages(packages) {
		const seen = /* @__PURE__ */ new Map();
		for (const entry of packages) {
			const sourceStr = typeof entry.pkg === "string" ? entry.pkg : entry.pkg.source;
			const identity = this.getPackageIdentity(sourceStr, entry.scope);
			const existing = seen.get(identity);
			if (!existing) seen.set(identity, entry);
			else if (entry.scope === "project" && existing.scope === "user") seen.set(identity, entry);
		}
		return Array.from(seen.values());
	}
	parseNpmSpec(spec) {
		const match = spec.match(/^(@?[^@]+(?:\/[^@]+)?)(?:@(.+))?$/);
		if (!match) return { name: spec };
		return {
			name: match[1] ?? spec,
			version: match[2]
		};
	}
	getNpmInstallPath(source, scope) {
		if (scope === "temporary") return join(this.getTemporaryDir("npm"), "node_modules", source.name);
		if (scope === "project") return join(this.cwd, CONFIG_DIR_NAME, "npm", "node_modules", source.name);
		return join(this.agentDir, "npm", "node_modules", source.name);
	}
	getGitInstallPath(source, scope) {
		if (scope === "temporary") return this.getTemporaryDir(`git-${source.host}`, source.path);
		if (scope === "project") return join(this.cwd, CONFIG_DIR_NAME, "git", source.host, source.path);
		return join(this.agentDir, "git", source.host, source.path);
	}
	getTemporaryDir(prefix, suffix) {
		const hash = createHash("sha256").update(`${prefix}-${suffix ?? ""}`).digest("hex").slice(0, 8);
		return join(getAgentResourceTempDir(this.agentDir), prefix, hash, suffix ?? "");
	}
	getBaseDirForScope(scope) {
		if (scope === "project") return join(this.cwd, CONFIG_DIR_NAME);
		if (scope === "user") return this.agentDir;
		return this.cwd;
	}
	resolvePath(input) {
		const trimmed = input.trim();
		if (trimmed === "~") return getHomeDir();
		if (trimmed.startsWith("~/")) return join(getHomeDir(), trimmed.slice(2));
		if (trimmed.startsWith("~")) return join(getHomeDir(), trimmed.slice(1));
		return resolve(this.cwd, trimmed);
	}
	resolvePathFromBase(input, baseDir) {
		const trimmed = input.trim();
		if (trimmed === "~") return getHomeDir();
		if (trimmed.startsWith("~/")) return join(getHomeDir(), trimmed.slice(2));
		if (trimmed.startsWith("~")) return join(getHomeDir(), trimmed.slice(1));
		return resolve(baseDir, trimmed);
	}
	collectPackageResources(packageRoot, accumulator, filter, metadata) {
		const manifest = readResourceManifestFile(join(packageRoot, "package.json"));
		const hasPackageLayout = manifest !== null || RESOURCE_TYPES.some((type) => existsSync(join(packageRoot, type)));
		for (const resourceType of RESOURCE_TYPES) {
			const patterns = filter?.[resourceType];
			const target = accumulator[resourceType];
			if (patterns !== void 0) {
				this.applyPackageFilter(packageRoot, patterns, resourceType, target, metadata);
				continue;
			}
			const entries = manifest?.[resourceType];
			if (manifest !== null && (!filter || entries !== void 0)) {
				this.addManifestEntries(entries, packageRoot, resourceType, target, metadata);
				continue;
			}
			const dir = join(packageRoot, resourceType);
			if (existsSync(dir)) for (const path of this.collectConventionResourceFiles(packageRoot, resourceType)) this.addResource(target, path, metadata, true);
		}
		return hasPackageLayout;
	}
	applyPackageFilter(packageRoot, userPatterns, resourceType, target, metadata) {
		const allFiles = this.collectManifestFiles(packageRoot, resourceType);
		if (userPatterns.length === 0) {
			for (const f of allFiles) this.addResource(target, f, metadata, false);
			return;
		}
		const enabledByUser = applyPatterns(allFiles, userPatterns, packageRoot);
		for (const f of allFiles) {
			const enabled = enabledByUser.has(f);
			this.addResource(target, f, metadata, enabled);
		}
	}
	collectManifestFiles(packageRoot, resourceType) {
		const entries = readResourceManifestFile(join(packageRoot, "package.json"))?.[resourceType];
		if (entries && entries.length > 0) {
			const allFiles = this.collectFilesFromManifestEntries(entries, packageRoot, resourceType);
			const manifestPatterns = entries.filter(isOverridePattern);
			return Array.from(manifestPatterns.length > 0 ? applyPatterns(allFiles, manifestPatterns, packageRoot) : new Set(allFiles));
		}
		return this.collectConventionResourceFiles(packageRoot, resourceType);
	}
	collectConventionResourceFiles(packageRoot, resourceType) {
		const conventionDir = join(packageRoot, resourceType);
		if (!existsSync(conventionDir)) return [];
		return this.filterManifestResourcePaths(collectResourceFiles(conventionDir, resourceType), packageRoot);
	}
	addManifestEntries(entries, root, resourceType, target, metadata) {
		if (!entries) return;
		const allFiles = this.collectFilesFromManifestEntries(entries, root, resourceType);
		const enabledPaths = applyPatterns(allFiles, entries.filter(isOverridePattern), root);
		for (const f of allFiles) if (enabledPaths.has(f)) this.addResource(target, f, metadata, true);
	}
	collectFilesFromManifestEntries(entries, root, resourceType) {
		const resolved = entries.filter((entry) => !isOverridePattern(entry)).flatMap((entry) => {
			if (!hasGlobPattern(entry)) return [resolve(root, entry)];
			return globSync(entry, { cwd: root }).map((match) => resolve(root, match));
		});
		return this.collectFilesFromPaths(this.filterManifestResourcePaths(resolved, root), resourceType);
	}
	filterManifestResourcePaths(paths, root) {
		const resolvedRoot = resolve(root);
		const realRoot = resolveRealPathIfPossible(resolvedRoot);
		return paths.filter((path) => {
			const resolvedPath = resolve(path);
			if (!isPathInside(resolvedRoot, resolvedPath)) return false;
			return isPathInside(realRoot, resolveRealPathIfPossible(resolvedPath));
		});
	}
	resolveLocalEntries(entries, resourceType, target, metadata, baseDir) {
		if (entries.length === 0) return;
		const { plain, patterns } = splitPatterns(entries);
		const resolvedPlain = plain.map((p) => this.resolvePathFromBase(p, baseDir));
		const allFiles = this.collectFilesFromPaths(resolvedPlain, resourceType);
		const enabledPaths = applyPatterns(allFiles, patterns, baseDir);
		for (const f of allFiles) this.addResource(target, f, metadata, enabledPaths.has(f));
	}
	addAutoDiscoveredResources(accumulator, globalSettings, projectSettings, globalBaseDir, projectBaseDir) {
		const userAgentsSkillsDir = join(getHomeDir(), ".agents", "skills");
		const projectAgentsSkillDirs = collectAncestorAgentsSkillDirs(this.cwd).filter((dir) => resolve(dir) !== resolve(userAgentsSkillsDir));
		const addScopeResources = (options) => {
			const metadata = {
				source: "auto",
				scope: options.scope,
				origin: "top-level",
				baseDir: options.baseDir
			};
			const addResources = (resourceType, paths, resourceMetadata = metadata, patternBaseDir = options.baseDir) => {
				for (const path of paths) this.addResource(accumulator[resourceType], path, resourceMetadata, isEnabledByOverrides(path, options.settings[resourceType] ?? [], patternBaseDir));
			};
			for (const resourceType of RESOURCE_TYPES) {
				addResources(resourceType, AUTO_RESOURCE_COLLECTORS[resourceType](join(options.baseDir, resourceType)));
				if (resourceType !== "skills") continue;
				for (const skillsDir of options.agentsSkillDirs) {
					const agentsBaseDir = dirname(skillsDir);
					addResources("skills", collectAutoSkillEntries(skillsDir, "agents"), {
						...metadata,
						baseDir: agentsBaseDir
					}, agentsBaseDir);
				}
			}
		};
		addScopeResources({
			scope: "project",
			settings: projectSettings,
			baseDir: projectBaseDir,
			agentsSkillDirs: projectAgentsSkillDirs
		});
		addScopeResources({
			scope: "user",
			settings: globalSettings,
			baseDir: globalBaseDir,
			agentsSkillDirs: isDefaultStateDir() ? [userAgentsSkillsDir] : []
		});
	}
	collectFilesFromPaths(paths, resourceType) {
		const files = [];
		for (const p of paths) {
			if (!existsSync(p)) continue;
			try {
				const stats = statSync(p);
				if (stats.isFile()) files.push(p);
				else if (stats.isDirectory()) files.push(...collectResourceFiles(p, resourceType));
			} catch {}
		}
		return files;
	}
	addResource(map, path, metadata, enabled) {
		if (!path) return;
		if (!map.has(path)) map.set(path, {
			metadata,
			enabled
		});
	}
	createAccumulator() {
		return {
			extensions: /* @__PURE__ */ new Map(),
			skills: /* @__PURE__ */ new Map(),
			prompts: /* @__PURE__ */ new Map(),
			themes: /* @__PURE__ */ new Map()
		};
	}
	toResolvedPaths(accumulator) {
		const mapToResolved = (entries) => {
			const resolved = Array.from(entries.entries()).map(([path, { metadata, enabled }]) => ({
				path,
				enabled,
				metadata
			}));
			resolved.sort((a, b) => resourcePrecedenceRank(a.metadata) - resourcePrecedenceRank(b.metadata));
			const seen = /* @__PURE__ */ new Set();
			return resolved.filter((entry) => {
				const canonicalPath = canonicalizePath(entry.path);
				if (seen.has(canonicalPath)) return false;
				seen.add(canonicalPath);
				return true;
			});
		};
		return {
			extensions: mapToResolved(accumulator.extensions),
			skills: mapToResolved(accumulator.skills),
			prompts: mapToResolved(accumulator.prompts),
			themes: mapToResolved(accumulator.themes)
		};
	}
};
//#endregion
//#region src/agents/sessions/http-dispatcher.ts
/**
* HTTP session dispatcher config helpers.
*
* Parses idle-timeout values shared by server and config surfaces.
*/
const DEFAULT_HTTP_IDLE_TIMEOUT_MS = 3e5;
/** Parses idle timeout values, using `0` for the explicit disabled sentinel. */
function parseHttpIdleTimeoutMs(value) {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed.toLowerCase() === "disabled") return 0;
		if (trimmed.length === 0) return;
		return parseStrictNonNegativeInteger(trimmed);
	}
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return;
	return Math.floor(value);
}
//#endregion
//#region src/agents/sessions/settings-storage.ts
const SETTINGS_SCOPES = ["global", "project"];
var FileSettingsStorage = class {
	constructor(cwd, agentDir) {
		this.paths = {
			global: join(agentDir, "settings.json"),
			project: join(cwd, CONFIG_DIR_NAME, "settings.json")
		};
	}
	readSettingsScope(scope) {
		const path = this.paths[scope];
		if (!lstatSync(`${path}.lock`, { throwIfNoEntry: false }) && !lstatSync(`${path}.lock.reclaim`, { throwIfNoEntry: false }) && !existsSync(path)) return;
		let content;
		this.withLock(scope, (current) => {
			content = current;
		});
		return content;
	}
	withLock(scope, fn) {
		const path = this.paths[scope];
		const release = acquireFileLockSyncWithRetry(path);
		try {
			const next = fn(existsSync(path) ? readFileSync(path, "utf-8") : void 0);
			if (next !== void 0) writeFileSync(path, next, "utf-8");
		} finally {
			release();
		}
	}
};
var InMemorySettingsStorage = class {
	constructor() {
		this.values = {
			global: void 0,
			project: void 0
		};
	}
	withLock(scope, fn) {
		const next = fn(this.values[scope]);
		if (next !== void 0) this.values[scope] = next;
	}
};
//#endregion
//#region src/agents/sessions/settings-manager.ts
/**
* Session settings manager.
*
* Loads and persists user/session defaults for models, transports, retry policy, UI, packages, and telemetry.
*/
/** Deep merge settings: project/overrides take precedence, nested objects merge recursively */
function deepMergeSettings(base, overrides) {
	return mergeDeep(base, overrides);
}
var SettingsManager = class SettingsManager {
	constructor(storage, scopes) {
		this.storage = storage;
		this.scopes = scopes;
		this.settings = {};
		this.runtimeOverrides = {};
		this.writeQueue = Promise.resolve();
		this.errors = SETTINGS_SCOPES.flatMap((scope) => {
			const error = scopes[scope].loadError;
			return error ? [{
				scope,
				error
			}] : [];
		});
		this.recomputeSettings();
	}
	/** Create a SettingsManager that loads from files */
	static create(cwd, agentDir = getAgentDir()) {
		const storage = new FileSettingsStorage(cwd, agentDir);
		return SettingsManager.fromStorage(storage);
	}
	/** Create a SettingsManager from an arbitrary storage backend */
	static fromStorage(storage) {
		return new SettingsManager(storage, {
			global: SettingsManager.loadScope(storage, "global"),
			project: SettingsManager.loadScope(storage, "project")
		});
	}
	/** Create an in-memory SettingsManager (no file I/O) */
	static inMemory(settings = {}) {
		const storage = new InMemorySettingsStorage();
		const initialSettings = SettingsManager.migrateSettings(structuredClone(settings));
		storage.withLock("global", () => JSON.stringify(initialSettings, null, 2));
		return SettingsManager.fromStorage(storage);
	}
	static loadScope(storage, scope) {
		let content;
		try {
			if (storage.readSettingsScope) content = storage.readSettingsScope(scope);
			else storage.withLock(scope, (current) => {
				content = current;
			});
			const settings = content ? SettingsManager.migrateSettings(JSON.parse(content)) : {};
			return SettingsManager.createScopeState(settings);
		} catch (error) {
			return SettingsManager.createScopeState({}, error);
		}
	}
	static createScopeState(settings, loadError = null) {
		return {
			settings,
			modified: /* @__PURE__ */ new Map(),
			loadError
		};
	}
	/** Migrate old settings format to new format */
	static migrateSettings(settings) {
		if ("queueMode" in settings && !("steeringMode" in settings)) {
			settings.steeringMode = settings.queueMode;
			delete settings.queueMode;
		}
		if (!("transport" in settings) && typeof settings.websockets === "boolean") {
			settings.transport = settings.websockets ? "websocket" : "sse";
			delete settings.websockets;
		}
		if (isRecord(settings.skills)) {
			const skillsSettings = settings.skills;
			if (skillsSettings.enableSkillCommands !== void 0 && settings.enableSkillCommands === void 0) settings.enableSkillCommands = skillsSettings.enableSkillCommands;
			if (Array.isArray(skillsSettings.customDirectories) && skillsSettings.customDirectories.length > 0) settings.skills = skillsSettings.customDirectories;
			else delete settings.skills;
		}
		if (isRecord(settings.retry)) {
			const retrySettings = settings.retry;
			const providerSettings = asOptionalObjectRecord(retrySettings.provider);
			if (typeof retrySettings.maxDelayMs === "number" && providerSettings?.maxRetryDelayMs == null) retrySettings.provider = {
				...providerSettings,
				maxRetryDelayMs: retrySettings.maxDelayMs
			};
			delete retrySettings.maxDelayMs;
		}
		return settings;
	}
	getGlobalSettings() {
		return structuredClone(this.scopes.global.settings);
	}
	getProjectSettings() {
		return structuredClone(this.scopes.project.settings);
	}
	recomputeSettings() {
		this.settings = deepMergeSettings(deepMergeSettings(this.scopes.global.settings, this.scopes.project.settings), this.runtimeOverrides);
	}
	async reload() {
		await this.writeQueue;
		for (const scope of SETTINGS_SCOPES) {
			const state = this.scopes[scope];
			const loaded = SettingsManager.loadScope(this.storage, scope);
			if (loaded.loadError) {
				state.loadError = loaded.loadError;
				this.recordError(scope, loaded.loadError);
			} else {
				state.settings = loaded.settings;
				state.loadError = null;
			}
			state.modified.clear();
		}
		this.recomputeSettings();
	}
	/** Apply non-persisted overrides on top of global/project settings. */
	applyOverrides(overrides) {
		this.runtimeOverrides = deepMergeSettings(this.runtimeOverrides, overrides);
		this.recomputeSettings();
	}
	markModified(scope, field, nestedKey) {
		const state = this.scopes[scope];
		const existing = state.modified.get(field);
		if (!nestedKey || existing === null) {
			state.modified.set(field, null);
			return;
		}
		const nestedFields = existing ?? /* @__PURE__ */ new Set();
		nestedFields.add(nestedKey);
		state.modified.set(field, nestedFields);
	}
	recordError(scope, error) {
		const normalizedError = error instanceof Error ? error : new Error(String(error));
		this.errors.push({
			scope,
			error: normalizedError
		});
	}
	enqueueWrite(scope, task) {
		this.writeQueue = this.writeQueue.then(() => {
			task();
			this.scopes[scope].modified.clear();
		}).catch((error) => {
			this.recordError(scope, error);
		});
	}
	persistScopedSettings(scope, snapshotSettings, modified) {
		this.storage.withLock(scope, (current) => {
			const currentFileSettings = current ? SettingsManager.migrateSettings(JSON.parse(current)) : {};
			const mergedSettings = { ...currentFileSettings };
			for (const [field, nestedModified] of modified) {
				const value = snapshotSettings[field];
				if (nestedModified && typeof value === "object" && value !== null) {
					const baseNested = currentFileSettings[field] ?? {};
					const inMemoryNested = value;
					const mergedNested = { ...baseNested };
					for (const nestedKey of nestedModified) mergedNested[nestedKey] = inMemoryNested[nestedKey];
					mergedSettings[field] = mergedNested;
				} else mergedSettings[field] = value;
			}
			return JSON.stringify(mergedSettings, null, 2);
		});
	}
	save(scope) {
		this.recomputeSettings();
		const state = this.scopes[scope];
		if (state.loadError) return;
		const snapshotSettings = structuredClone(state.settings);
		const modified = new Map([...state.modified].map(([field, nested]) => [field, nested && new Set(nested)]));
		this.enqueueWrite(scope, () => {
			this.persistScopedSettings(scope, snapshotSettings, modified);
		});
	}
	setScopedSetting(scope, field, value) {
		this.scopes[scope].settings[field] = scope === "project" ? structuredClone(value) : value;
		this.markModified(scope, field);
		this.save(scope);
	}
	setGlobalNestedSetting(field, nestedField, value) {
		const current = this.scopes.global.settings[field];
		const nested = isRecord(current) ? { ...current } : {};
		nested[nestedField] = value;
		this.scopes.global.settings[field] = nested;
		this.markModified("global", field, nestedField);
		this.save("global");
	}
	async flush() {
		await this.writeQueue;
	}
	drainErrors() {
		const drained = [...this.errors];
		this.errors = [];
		return drained;
	}
	getLastChangelogVersion() {
		return this.settings.lastChangelogVersion;
	}
	setLastChangelogVersion(version) {
		this.setScopedSetting("global", "lastChangelogVersion", version);
	}
	getSessionDir() {
		const sessionDir = this.settings.sessionDir;
		if (!sessionDir) return sessionDir;
		return sessionDir === "~" ? homedir() : sessionDir.startsWith("~/") ? join(homedir(), sessionDir.slice(2)) : sessionDir;
	}
	getDefaultProvider() {
		return this.settings.defaultProvider;
	}
	getDefaultModel() {
		return this.settings.defaultModel;
	}
	setDefaultProvider(provider) {
		this.setScopedSetting("global", "defaultProvider", provider);
	}
	setDefaultModel(modelId) {
		this.setScopedSetting("global", "defaultModel", modelId);
	}
	setDefaultModelAndProvider(provider, modelId) {
		this.scopes.global.settings.defaultProvider = provider;
		this.scopes.global.settings.defaultModel = modelId;
		this.markModified("global", "defaultProvider");
		this.markModified("global", "defaultModel");
		this.save("global");
	}
	getSteeringMode() {
		return this.settings.steeringMode || "one-at-a-time";
	}
	setSteeringMode(mode) {
		this.setScopedSetting("global", "steeringMode", mode);
	}
	getFollowUpMode() {
		return this.settings.followUpMode || "one-at-a-time";
	}
	setFollowUpMode(mode) {
		this.setScopedSetting("global", "followUpMode", mode);
	}
	getTheme() {
		return this.settings.theme;
	}
	setTheme(theme) {
		this.setScopedSetting("global", "theme", theme);
	}
	getDefaultThinkingLevel() {
		return this.settings.defaultThinkingLevel;
	}
	setDefaultThinkingLevel(level) {
		this.setScopedSetting("global", "defaultThinkingLevel", level);
	}
	getTransport() {
		return this.settings.transport ?? "auto";
	}
	setTransport(transport) {
		this.setScopedSetting("global", "transport", transport);
	}
	getCompactionEnabled() {
		return this.settings.compaction?.enabled ?? true;
	}
	setCompactionEnabled(enabled) {
		this.setGlobalNestedSetting("compaction", "enabled", enabled);
	}
	getCompactionReserveTokens() {
		return this.settings.compaction?.reserveTokens ?? 16384;
	}
	getCompactionKeepRecentTokens() {
		return this.settings.compaction?.keepRecentTokens ?? 2e4;
	}
	getCompactionSettings() {
		return {
			enabled: this.getCompactionEnabled(),
			reserveTokens: this.getCompactionReserveTokens(),
			keepRecentTokens: this.getCompactionKeepRecentTokens()
		};
	}
	getBranchSummarySettings() {
		return {
			reserveTokens: this.settings.branchSummary?.reserveTokens ?? 16384,
			skipPrompt: this.settings.branchSummary?.skipPrompt ?? false
		};
	}
	getBranchSummarySkipPrompt() {
		return this.settings.branchSummary?.skipPrompt ?? false;
	}
	getRetryEnabled() {
		return this.settings.retry?.enabled ?? true;
	}
	setRetryEnabled(enabled) {
		this.setGlobalNestedSetting("retry", "enabled", enabled);
	}
	getRetrySettings() {
		return {
			enabled: this.getRetryEnabled(),
			maxRetries: this.settings.retry?.maxRetries ?? 3,
			baseDelayMs: this.settings.retry?.baseDelayMs ?? 2e3
		};
	}
	getHttpIdleTimeoutMs() {
		const value = this.settings.httpIdleTimeoutMs;
		const timeoutMs = parseHttpIdleTimeoutMs(value);
		if (timeoutMs !== void 0) return timeoutMs;
		if (value !== void 0) throw new Error(`Invalid httpIdleTimeoutMs setting: ${String(value)}`);
		return DEFAULT_HTTP_IDLE_TIMEOUT_MS;
	}
	setHttpIdleTimeoutMs(timeoutMs) {
		if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new Error(`Invalid httpIdleTimeoutMs setting: ${String(timeoutMs)}`);
		this.setScopedSetting("global", "httpIdleTimeoutMs", Math.floor(timeoutMs));
	}
	getProviderRetrySettings() {
		return {
			timeoutMs: this.settings.retry?.provider?.timeoutMs,
			maxRetries: this.settings.retry?.provider?.maxRetries,
			maxRetryDelayMs: this.settings.retry?.provider?.maxRetryDelayMs ?? 6e4
		};
	}
	getHideThinkingBlock() {
		return this.settings.hideThinkingBlock ?? false;
	}
	setHideThinkingBlock(hide) {
		this.setScopedSetting("global", "hideThinkingBlock", hide);
	}
	getShellPath() {
		return this.settings.shellPath;
	}
	setShellPath(path) {
		this.setScopedSetting("global", "shellPath", path);
	}
	getQuietStartup() {
		return this.settings.quietStartup ?? false;
	}
	setQuietStartup(quiet) {
		this.setScopedSetting("global", "quietStartup", quiet);
	}
	getShellCommandPrefix() {
		return this.settings.shellCommandPrefix;
	}
	setShellCommandPrefix(prefix) {
		this.setScopedSetting("global", "shellCommandPrefix", prefix);
	}
	getNpmCommand() {
		return this.settings.npmCommand ? [...this.settings.npmCommand] : void 0;
	}
	setNpmCommand(command) {
		this.setScopedSetting("global", "npmCommand", command ? [...command] : void 0);
	}
	getCollapseChangelog() {
		return this.settings.collapseChangelog ?? false;
	}
	setCollapseChangelog(collapse) {
		this.setScopedSetting("global", "collapseChangelog", collapse);
	}
	getEnableInstallTelemetry() {
		return this.settings.enableInstallTelemetry ?? true;
	}
	setEnableInstallTelemetry(enabled) {
		this.setScopedSetting("global", "enableInstallTelemetry", enabled);
	}
	getPackages() {
		return [...this.settings.packages ?? []];
	}
	setPackages(packages) {
		this.setScopedSetting("global", "packages", packages);
	}
	setProjectPackages(packages) {
		this.setScopedSetting("project", "packages", packages);
	}
	getExtensionPaths() {
		return [...this.settings.extensions ?? []];
	}
	setExtensionPaths(paths) {
		this.setScopedSetting("global", "extensions", paths);
	}
	setProjectExtensionPaths(paths) {
		this.setScopedSetting("project", "extensions", paths);
	}
	getSkillPaths() {
		return [...this.settings.skills ?? []];
	}
	setSkillPaths(paths) {
		this.setScopedSetting("global", "skills", paths);
	}
	setProjectSkillPaths(paths) {
		this.setScopedSetting("project", "skills", paths);
	}
	getPromptTemplatePaths() {
		return [...this.settings.prompts ?? []];
	}
	setPromptTemplatePaths(paths) {
		this.setScopedSetting("global", "prompts", paths);
	}
	setProjectPromptTemplatePaths(paths) {
		this.setScopedSetting("project", "prompts", paths);
	}
	getThemePaths() {
		return [...this.settings.themes ?? []];
	}
	setThemePaths(paths) {
		this.setScopedSetting("global", "themes", paths);
	}
	setProjectThemePaths(paths) {
		this.setScopedSetting("project", "themes", paths);
	}
	getEnableSkillCommands() {
		return this.settings.enableSkillCommands ?? true;
	}
	setEnableSkillCommands(enabled) {
		this.setScopedSetting("global", "enableSkillCommands", enabled);
	}
	getThinkingBudgets() {
		return this.settings.thinkingBudgets;
	}
	getShowImages() {
		return this.settings.terminal?.showImages ?? true;
	}
	setShowImages(show) {
		this.setGlobalNestedSetting("terminal", "showImages", show);
	}
	getImageWidthCells() {
		return resolveIntegerOption(this.settings.terminal?.imageWidthCells, 60, { min: 1 });
	}
	setImageWidthCells(width) {
		this.setGlobalNestedSetting("terminal", "imageWidthCells", Math.max(1, Math.floor(width)));
	}
	getClearOnShrink() {
		return this.settings.terminal?.clearOnShrink ?? false;
	}
	setClearOnShrink(enabled) {
		this.setGlobalNestedSetting("terminal", "clearOnShrink", enabled);
	}
	getShowTerminalProgress() {
		return this.settings.terminal?.showTerminalProgress ?? false;
	}
	setShowTerminalProgress(enabled) {
		this.setGlobalNestedSetting("terminal", "showTerminalProgress", enabled);
	}
	getImageAutoResize() {
		return this.settings.images?.autoResize ?? true;
	}
	setImageAutoResize(enabled) {
		this.setGlobalNestedSetting("images", "autoResize", enabled);
	}
	getBlockImages() {
		return this.settings.images?.blockImages ?? false;
	}
	setBlockImages(blocked) {
		this.setGlobalNestedSetting("images", "blockImages", blocked);
	}
	getEnabledModels() {
		return this.settings.enabledModels;
	}
	setEnabledModels(patterns) {
		this.setScopedSetting("global", "enabledModels", patterns);
	}
	getDoubleEscapeAction() {
		return this.settings.doubleEscapeAction ?? "tree";
	}
	setDoubleEscapeAction(action) {
		this.setScopedSetting("global", "doubleEscapeAction", action);
	}
	getTreeFilterMode() {
		const mode = this.settings.treeFilterMode;
		return mode && [
			"default",
			"no-tools",
			"user-only",
			"labeled-only",
			"all"
		].includes(mode) ? mode : "default";
	}
	setTreeFilterMode(mode) {
		this.setScopedSetting("global", "treeFilterMode", mode);
	}
	getShowHardwareCursor() {
		return this.settings.showHardwareCursor ?? false;
	}
	setShowHardwareCursor(enabled) {
		this.setScopedSetting("global", "showHardwareCursor", enabled);
	}
	getEditorPaddingX() {
		return this.settings.editorPaddingX ?? 0;
	}
	setEditorPaddingX(padding) {
		this.setScopedSetting("global", "editorPaddingX", Math.max(0, Math.min(3, Math.floor(padding))));
	}
	getAutocompleteMaxVisible() {
		return this.settings.autocompleteMaxVisible ?? 5;
	}
	setAutocompleteMaxVisible(maxVisible) {
		this.setScopedSetting("global", "autocompleteMaxVisible", Math.max(3, Math.min(20, Math.floor(maxVisible))));
	}
	getCodeBlockIndent() {
		return this.settings.markdown?.codeBlockIndent ?? "  ";
	}
	getWarnings() {
		return { ...this.settings.warnings };
	}
	setWarnings(warnings) {
		this.setScopedSetting("global", "warnings", { ...warnings });
	}
};
//#endregion
//#region src/agents/utils/syntax-highlight.ts
/**
* Syntax highlighting renderer for terminal-friendly formatted output.
*
* Highlight.js emits HTML spans; this module walks that small HTML subset and
* maps active scopes to caller-provided text formatters.
*/
let highlightJsRuntime;
function isHighlightJs(value) {
	return typeof value === "object" && value !== null && "getLanguage" in value && typeof value.getLanguage === "function" && "highlight" in value && typeof value.highlight === "function" && "highlightAuto" in value && typeof value.highlightAuto === "function";
}
function setHighlightJsRuntime(runtime) {
	if (!isHighlightJs(runtime)) throw new TypeError("highlight.js did not expose the expected Node API");
	highlightJsRuntime = runtime;
	return runtime;
}
function loadHighlightJsRuntime() {
	if (highlightJsRuntime) return highlightJsRuntime;
	const injected = getWorkerDeployHighlightJs();
	if (injected !== void 0) return setHighlightJsRuntime(injected);
	if (typeof WORKER_DEPLOY_BUILD === "boolean" && WORKER_DEPLOY_BUILD) throw new Error("worker highlight.js runtime was not registered before use");
	return setHighlightJsRuntime(createRequire(import.meta.url)("highlight.js"));
}
const SPAN_CLOSE = "</span>";
const HIGHLIGHT_CLASS_PREFIX = "hljs-";
function getScopeFromSpanTag(tag) {
	const match = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(tag);
	const classValue = match?.[1] ?? match?.[2];
	if (!classValue) return;
	for (const className of classValue.split(/\s+/)) if (className.startsWith(HIGHLIGHT_CLASS_PREFIX)) return className.slice(5);
}
function getScopeFormatter(scope, theme) {
	const exact = theme[scope];
	if (exact) return exact;
	const dotIndex = scope.indexOf(".");
	if (dotIndex !== -1) {
		const prefixFormatter = theme[scope.slice(0, dotIndex)];
		if (prefixFormatter) return prefixFormatter;
	}
	const dashIndex = scope.indexOf("-");
	if (dashIndex !== -1) {
		const prefixFormatter = theme[scope.slice(0, dashIndex)];
		if (prefixFormatter) return prefixFormatter;
	}
}
function getActiveFormatter(scopes, theme) {
	for (let i = scopes.length - 1; i >= 0; i--) {
		const scope = scopes[i];
		if (!scope) continue;
		const formatter = getScopeFormatter(scope, theme);
		if (formatter) return formatter;
	}
	return theme.default;
}
function isSpanOpenTagStart(html, index) {
	if (!html.startsWith("<span", index)) return false;
	const nextChar = html[index + 5];
	return nextChar === ">" || nextChar === " " || nextChar === "	" || nextChar === "\n" || nextChar === "\r";
}
/** Renders highlight.js span HTML into themed plain text. */
function renderHighlightedHtml(html, theme = {}) {
	let output = "";
	let textBuffer = "";
	const scopes = [];
	const flushText = () => {
		if (!textBuffer) return;
		const decodedText = decodeHtmlEntities(textBuffer);
		const formatter = getActiveFormatter(scopes, theme);
		output += formatter ? formatter(decodedText) : decodedText;
		textBuffer = "";
	};
	let index = 0;
	while (index < html.length) {
		if (isSpanOpenTagStart(html, index)) {
			const tagEndIndex = html.indexOf(">", index + 5);
			if (tagEndIndex !== -1) {
				flushText();
				const scope = getScopeFromSpanTag(html.slice(index, tagEndIndex + 1));
				scopes.push(scope);
				index = tagEndIndex + 1;
				continue;
			}
		}
		if (html.startsWith(SPAN_CLOSE, index)) {
			flushText();
			if (scopes.length > 0) scopes.pop();
			index += 7;
			continue;
		}
		textBuffer += html[index];
		index++;
	}
	flushText();
	return output;
}
/** Highlights code using an explicit language or highlight.js auto-detection. */
function highlight(code, options = {}) {
	const hljs = loadHighlightJsRuntime();
	return renderHighlightedHtml(options.language ? hljs.highlight(code, {
		language: options.language,
		ignoreIllegals: options.ignoreIllegals
	}).value : hljs.highlightAuto(code, options.languageSubset).value, options.theme);
}
/** Returns whether highlight.js has a registered language by this name. */
function supportsLanguage(name) {
	return loadHighlightJsRuntime().getLanguage(name) !== void 0;
}
//#endregion
//#region src/agents/modes/interactive/theme/theme.ts
/**
* Interactive terminal theme loader.
*
* Validates theme JSON, resolves color variables, watches custom theme files, and exposes terminal styling helpers.
*/
const ColorValueSchema = Type.Union([Type.String(), Type.Integer({
	minimum: 0,
	maximum: 255
})]);
const ThemeJsonSchema = Type.Object({
	$schema: Type.Optional(Type.String()),
	name: Type.String(),
	vars: Type.Optional(Type.Record(Type.String(), ColorValueSchema)),
	colors: Type.Object({
		accent: ColorValueSchema,
		border: ColorValueSchema,
		borderAccent: ColorValueSchema,
		borderMuted: ColorValueSchema,
		success: ColorValueSchema,
		error: ColorValueSchema,
		warning: ColorValueSchema,
		muted: ColorValueSchema,
		dim: ColorValueSchema,
		text: ColorValueSchema,
		thinkingText: ColorValueSchema,
		selectedBg: ColorValueSchema,
		userMessageBg: ColorValueSchema,
		userMessageText: ColorValueSchema,
		customMessageBg: ColorValueSchema,
		customMessageText: ColorValueSchema,
		customMessageLabel: ColorValueSchema,
		toolPendingBg: ColorValueSchema,
		toolSuccessBg: ColorValueSchema,
		toolErrorBg: ColorValueSchema,
		toolTitle: ColorValueSchema,
		toolOutput: ColorValueSchema,
		mdHeading: ColorValueSchema,
		mdLink: ColorValueSchema,
		mdLinkUrl: ColorValueSchema,
		mdCode: ColorValueSchema,
		mdCodeBlock: ColorValueSchema,
		mdCodeBlockBorder: ColorValueSchema,
		mdQuote: ColorValueSchema,
		mdQuoteBorder: ColorValueSchema,
		mdHr: ColorValueSchema,
		mdListBullet: ColorValueSchema,
		toolDiffAdded: ColorValueSchema,
		toolDiffRemoved: ColorValueSchema,
		toolDiffContext: ColorValueSchema,
		syntaxComment: ColorValueSchema,
		syntaxKeyword: ColorValueSchema,
		syntaxFunction: ColorValueSchema,
		syntaxVariable: ColorValueSchema,
		syntaxString: ColorValueSchema,
		syntaxNumber: ColorValueSchema,
		syntaxType: ColorValueSchema,
		syntaxOperator: ColorValueSchema,
		syntaxPunctuation: ColorValueSchema,
		thinkingOff: ColorValueSchema,
		thinkingMinimal: ColorValueSchema,
		thinkingLow: ColorValueSchema,
		thinkingMedium: ColorValueSchema,
		thinkingHigh: ColorValueSchema,
		thinkingXhigh: ColorValueSchema,
		bashMode: ColorValueSchema
	}),
	export: Type.Optional(Type.Object({
		pageBg: Type.Optional(ColorValueSchema),
		cardBg: Type.Optional(ColorValueSchema),
		infoBg: Type.Optional(ColorValueSchema)
	}))
});
const validateThemeJson = Compile(ThemeJsonSchema);
function hexToRgb(hex) {
	const cleaned = hex.replace("#", "");
	if (cleaned.length !== 6) throw new Error(`Invalid hex color: ${hex}`);
	const r = Number.parseInt(cleaned.slice(0, 2), 16);
	const g = Number.parseInt(cleaned.slice(2, 4), 16);
	const b = Number.parseInt(cleaned.slice(4, 6), 16);
	if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) throw new Error(`Invalid hex color: ${hex}`);
	return {
		r,
		g,
		b
	};
}
const CUBE_VALUES = [
	0,
	95,
	135,
	175,
	215,
	255
];
const GRAY_VALUES = Array.from({ length: 24 }, (_, i) => 8 + i * 10);
function findClosestCubeIndex(value) {
	let minDist = Infinity;
	let minIdx = 0;
	for (const [i, cubeValue] of CUBE_VALUES.entries()) {
		const dist = Math.abs(value - cubeValue);
		if (dist < minDist) {
			minDist = dist;
			minIdx = i;
		}
	}
	return minIdx;
}
function findClosestGrayIndex(gray) {
	let minDist = Infinity;
	let minIdx = 0;
	for (const [i, grayValue] of GRAY_VALUES.entries()) {
		const dist = Math.abs(gray - grayValue);
		if (dist < minDist) {
			minDist = dist;
			minIdx = i;
		}
	}
	return minIdx;
}
function colorDistance(r1, g1, b1, r2, g2, b2) {
	const dr = r1 - r2;
	const dg = g1 - g2;
	const db = b1 - b2;
	return dr * dr * .299 + dg * dg * .587 + db * db * .114;
}
function rgbTo256(r, g, b) {
	const rIdx = findClosestCubeIndex(r);
	const gIdx = findClosestCubeIndex(g);
	const bIdx = findClosestCubeIndex(b);
	const cubeR = CUBE_VALUES[rIdx];
	const cubeG = CUBE_VALUES[gIdx];
	const cubeB = CUBE_VALUES[bIdx];
	if (cubeR === void 0 || cubeG === void 0 || cubeB === void 0) throw new Error("Invalid 256-color cube index");
	const cubeIndex = 16 + 36 * rIdx + 6 * gIdx + bIdx;
	const cubeDist = colorDistance(r, g, b, cubeR, cubeG, cubeB);
	const grayIdx = findClosestGrayIndex(Math.round(.299 * r + .587 * g + .114 * b));
	const grayValue = GRAY_VALUES[grayIdx];
	if (grayValue === void 0) throw new Error("Invalid 256-color grayscale index");
	const grayIndex = 232 + grayIdx;
	const grayDist = colorDistance(r, g, b, grayValue, grayValue, grayValue);
	if (Math.max(r, g, b) - Math.min(r, g, b) < 10 && grayDist < cubeDist) return grayIndex;
	return cubeIndex;
}
function hexTo256(hex) {
	const { r, g, b } = hexToRgb(hex);
	return rgbTo256(r, g, b);
}
function fgAnsi(color, mode) {
	if (color === "") return "\x1B[39m";
	if (typeof color === "number") return `\x1b[38;5;${color}m`;
	if (color.startsWith("#")) {
		if (mode === "truecolor") {
			const { r, g, b } = hexToRgb(color);
			return `\x1b[38;2;${r};${g};${b}m`;
		}
		return `\x1b[38;5;${hexTo256(color)}m`;
	}
	throw new Error(`Invalid color value: ${color}`);
}
function bgAnsi(color, mode) {
	if (color === "") return "\x1B[49m";
	if (typeof color === "number") return `\x1b[48;5;${color}m`;
	if (color.startsWith("#")) {
		if (mode === "truecolor") {
			const { r, g, b } = hexToRgb(color);
			return `\x1b[48;2;${r};${g};${b}m`;
		}
		return `\x1b[48;5;${hexTo256(color)}m`;
	}
	throw new Error(`Invalid color value: ${color}`);
}
function resolveVarRefs(value, vars, visited = /* @__PURE__ */ new Set()) {
	if (typeof value === "number" || value === "" || value.startsWith("#")) return value;
	if (visited.has(value)) throw new Error(`Circular variable reference detected: ${value}`);
	if (!(value in vars)) throw new Error(`Variable reference not found: ${value}`);
	visited.add(value);
	const resolved = vars[value];
	if (resolved === void 0) throw new Error(`Variable reference not found: ${value}`);
	return resolveVarRefs(resolved, vars, visited);
}
function resolveThemeColors(colors, vars = {}) {
	const resolved = {};
	for (const [key, value] of Object.entries(colors)) resolved[key] = resolveVarRefs(value, vars);
	return resolved;
}
var Theme = class {
	constructor(fgColors, bgColors, mode, options = {}) {
		this.name = options.name;
		this.sourcePath = options.sourcePath;
		this.sourceInfo = options.sourceInfo;
		this.mode = mode;
		this.fgColors = /* @__PURE__ */ new Map();
		for (const [key, value] of Object.entries(fgColors)) this.fgColors.set(key, fgAnsi(value, mode));
		this.bgColors = /* @__PURE__ */ new Map();
		for (const [key, value] of Object.entries(bgColors)) this.bgColors.set(key, bgAnsi(value, mode));
	}
	fg(color, text) {
		const ansi = this.fgColors.get(color);
		if (!ansi) throw new Error(`Unknown theme color: ${color}`);
		return `${ansi}${text}\x1b[39m`;
	}
	bg(color, text) {
		const ansi = this.bgColors.get(color);
		if (!ansi) throw new Error(`Unknown theme background color: ${color}`);
		return `${ansi}${text}\x1b[49m`;
	}
	bold(text) {
		return chalk.bold(text);
	}
	italic(text) {
		return chalk.italic(text);
	}
	underline(text) {
		return chalk.underline(text);
	}
	inverse(text) {
		return chalk.inverse(text);
	}
	strikethrough(text) {
		return chalk.strikethrough(text);
	}
	getFgAnsi(color) {
		const ansi = this.fgColors.get(color);
		if (!ansi) throw new Error(`Unknown theme color: ${color}`);
		return ansi;
	}
	getBgAnsi(color) {
		const ansi = this.bgColors.get(color);
		if (!ansi) throw new Error(`Unknown theme background color: ${color}`);
		return ansi;
	}
	getColorMode() {
		return this.mode;
	}
	getThinkingBorderColor(level) {
		switch (level) {
			case "off": return (str) => this.fg("thinkingOff", str);
			case "minimal": return (str) => this.fg("thinkingMinimal", str);
			case "low": return (str) => this.fg("thinkingLow", str);
			case "medium": return (str) => this.fg("thinkingMedium", str);
			case "high": return (str) => this.fg("thinkingHigh", str);
			case "xhigh": return (str) => this.fg("thinkingXhigh", str);
			default: return (str) => this.fg("thinkingOff", str);
		}
	}
	getBashModeBorderColor() {
		return (str) => this.fg("bashMode", str);
	}
};
function parseThemeJson(label, json) {
	if (!validateThemeJson.Check(json)) {
		const errors = Array.from(validateThemeJson.Errors(json));
		const missingColors = /* @__PURE__ */ new Set();
		const otherErrors = [];
		for (const error of errors) {
			if (error.keyword === "required" && error.instancePath === "/colors") {
				const requiredProperties = error.params.requiredProperties;
				for (const requiredProperty of requiredProperties ?? []) missingColors.add(requiredProperty);
				continue;
			}
			const pathLocal = error.instancePath || "/";
			otherErrors.push(`  - ${pathLocal}: ${error.message}`);
		}
		let errorMessage = `Invalid theme "${label}":\n`;
		if (missingColors.size > 0) {
			errorMessage += "\nMissing required color tokens:\n";
			errorMessage += Array.from(missingColors).toSorted().map((color) => `  - ${color}`).join("\n");
			errorMessage += "\n\nPlease add these colors to your theme's \"colors\" object.";
			errorMessage += "\nSee the built-in themes (dark.json, light.json) for reference values.";
		}
		if (otherErrors.length > 0) errorMessage += `\n\nOther errors:\n${otherErrors.join("\n")}`;
		throw new Error(errorMessage);
	}
	return json;
}
function parseThemeJsonContent(label, content) {
	let json;
	try {
		json = JSON.parse(content);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to parse theme ${label}: ${message}`, { cause: error });
	}
	return parseThemeJson(label, json);
}
function createTheme(themeJson, mode, sourcePath) {
	const colorMode = mode ?? (getCapabilities().trueColor ? "truecolor" : "256color");
	const resolvedColors = resolveThemeColors(themeJson.colors, themeJson.vars);
	const fgColors = {};
	const bgColors = {};
	const bgColorKeys = /* @__PURE__ */ new Set([
		"selectedBg",
		"userMessageBg",
		"customMessageBg",
		"toolPendingBg",
		"toolSuccessBg",
		"toolErrorBg"
	]);
	for (const [key, value] of Object.entries(resolvedColors)) if (bgColorKeys.has(key)) bgColors[key] = value;
	else fgColors[key] = value;
	return new Theme(fgColors, bgColors, colorMode, {
		name: themeJson.name,
		sourcePath
	});
}
function loadThemeFromPath(themePath, mode) {
	return createTheme(parseThemeJsonContent(themePath, fs$2.readFileSync(themePath, "utf-8")), mode, themePath);
}
const THEME_KEY = Symbol.for("openclaw:agent-theme");
const interactiveAgentTheme = new Proxy({}, { get(_target, prop) {
	const t = globalThis[THEME_KEY];
	if (!t) throw new Error("Theme not initialized. Call setTheme() first.");
	return t[prop];
} });
let cachedHighlightThemeFor;
let cachedCliHighlightTheme;
function buildCliHighlightTheme(t) {
	return {
		keyword: (s) => t.fg("syntaxKeyword", s),
		built_in: (s) => t.fg("syntaxType", s),
		literal: (s) => t.fg("syntaxNumber", s),
		number: (s) => t.fg("syntaxNumber", s),
		string: (s) => t.fg("syntaxString", s),
		comment: (s) => t.fg("syntaxComment", s),
		function: (s) => t.fg("syntaxFunction", s),
		title: (s) => t.fg("syntaxFunction", s),
		class: (s) => t.fg("syntaxType", s),
		type: (s) => t.fg("syntaxType", s),
		attr: (s) => t.fg("syntaxVariable", s),
		variable: (s) => t.fg("syntaxVariable", s),
		params: (s) => t.fg("syntaxVariable", s),
		operator: (s) => t.fg("syntaxOperator", s),
		punctuation: (s) => t.fg("syntaxPunctuation", s)
	};
}
function getCliHighlightTheme(t) {
	if (cachedHighlightThemeFor !== t || !cachedCliHighlightTheme) {
		cachedHighlightThemeFor = t;
		cachedCliHighlightTheme = buildCliHighlightTheme(t);
	}
	return cachedCliHighlightTheme;
}
/**
* Highlight code with syntax coloring based on file extension or language.
* Returns array of highlighted lines.
*/
function highlightCode(code, lang) {
	const validLang = lang && supportsLanguage(lang) ? lang : void 0;
	if (!validLang) return code.split("\n").map((line) => interactiveAgentTheme.fg("mdCodeBlock", line));
	const opts = {
		language: validLang,
		ignoreIllegals: true,
		theme: getCliHighlightTheme(interactiveAgentTheme)
	};
	try {
		return highlight(code, opts).split("\n");
	} catch {
		return code.split("\n");
	}
}
/**
* Get language identifier from file path extension.
*/
function getLanguageFromPath(filePath) {
	const ext = filePath.split(".").pop()?.toLowerCase();
	if (!ext) return;
	return {
		ts: "typescript",
		tsx: "typescript",
		js: "javascript",
		jsx: "javascript",
		mjs: "javascript",
		cjs: "javascript",
		py: "python",
		rb: "ruby",
		rs: "rust",
		go: "go",
		java: "java",
		kt: "kotlin",
		swift: "swift",
		c: "c",
		h: "c",
		cpp: "cpp",
		cc: "cpp",
		cxx: "cpp",
		hpp: "cpp",
		cs: "csharp",
		php: "php",
		sh: "bash",
		bash: "bash",
		zsh: "bash",
		fish: "fish",
		ps1: "powershell",
		sql: "sql",
		html: "html",
		htm: "html",
		css: "css",
		scss: "scss",
		sass: "sass",
		less: "less",
		json: "json",
		yaml: "yaml",
		yml: "yaml",
		toml: "toml",
		xml: "xml",
		md: "markdown",
		markdown: "markdown",
		dockerfile: "dockerfile",
		makefile: "makefile",
		cmake: "cmake",
		lua: "lua",
		perl: "perl",
		r: "r",
		scala: "scala",
		clj: "clojure",
		ex: "elixir",
		exs: "elixir",
		erl: "erlang",
		hs: "haskell",
		ml: "ocaml",
		vim: "vim",
		graphql: "graphql",
		proto: "protobuf",
		tf: "hcl",
		hcl: "hcl"
	}[ext];
}
//#endregion
//#region src/agents/modes/interactive/components/keybinding-hints.ts
/**
* Utilities for formatting keybinding hints in the UI.
*/
function formatKeyPart(part) {
	return process.platform === "darwin" && part.toLowerCase() === "alt" ? "option" : part;
}
function formatKeyText(key) {
	return key.split("/").map((k) => k.split("+").map((part) => formatKeyPart(part)).join("+")).join("/");
}
function formatKeys(keys) {
	if (keys.length === 0) return "";
	return formatKeyText(keys.join("/"));
}
function keyText(keybinding) {
	return formatKeys(getKeybindings().getKeys(keybinding));
}
function keyHint(keybinding, description) {
	return interactiveAgentTheme.fg("dim", keyText(keybinding)) + interactiveAgentTheme.fg("muted", ` ${description}`);
}
//#endregion
//#region src/agents/modes/interactive/components/visual-truncate.ts
/**
* Shared utility for truncating text to visual lines (accounting for line wrapping).
* Used by both tool-execution.ts and bash-execution.ts for consistent behavior.
*/
/**
* Truncate text to a maximum number of visual lines (from the end).
* This accounts for line wrapping based on terminal width.
*
* @param text - The text content (may contain newlines)
* @param maxVisualLines - Maximum number of visual lines to show
* @param width - Terminal/render width
* @param paddingX - Horizontal padding for Text component (default 0).
*                   Use 0 when result will be placed in a Box (Box adds its own padding).
*                   Use 1 when result will be placed in a plain Container.
* @returns The truncated visual lines and count of skipped lines
*/
function truncateToVisualLines(text, maxVisualLines, width, paddingX = 0) {
	if (!text) return {
		visualLines: [],
		skippedCount: 0
	};
	const allVisualLines = new Text(text, paddingX, 0).render(width);
	if (allVisualLines.length <= maxVisualLines) return {
		visualLines: allVisualLines,
		skippedCount: 0
	};
	return {
		visualLines: allVisualLines.slice(-maxVisualLines),
		skippedCount: allVisualLines.length - maxVisualLines
	};
}
//#endregion
//#region src/agents/sessions/tools/render-utils.ts
/**
* Rendering helpers for session tool output in the TUI.
*
* Normalizes paths/text/image fallbacks before tool results are styled or truncated.
*/
/** Shortens paths under the current home directory for display. */
function shortenPath(path) {
	if (typeof path !== "string") return "";
	return shortenPathWithHome(path, {
		home: os$1.homedir(),
		prefix: "~"
	});
}
/** Returns a display string for string/nullish values, or null for unsupported values. */
function str(value) {
	if (typeof value === "string") return value;
	if (value == null) return "";
	return null;
}
/** Replaces tabs with stable spaces so terminal layout does not shift by tab stop. */
function replaceTabs$1(text) {
	return text.replace(/\t/g, "   ");
}
/** Normalizes raw terminal output before display. */
function normalizeDisplayText(text) {
	return text.replace(/\r/g, "");
}
function trimTrailingEmptyLines(lines) {
	return lines.slice(0, lines.findLastIndex((line) => line !== "") + 1);
}
function reuseTextComponent(lastComponent, content) {
	const text = lastComponent ?? new Text("", 0, 0);
	text.setText(content);
	return text;
}
/** Extracts text output and image placeholders from a tool result. */
function getTextOutput(result, showImages) {
	if (!result) return "";
	const textBlocks = result.content.filter((c) => c.type === "text");
	const imageBlocks = result.content.filter((c) => c.type === "image");
	let output = textBlocks.map((c) => sanitizeBinaryOutput(c.text || "", { ansiMode: "compat" }).replace(/\r/g, "")).join("\n");
	const caps = getCapabilities();
	if (imageBlocks.length > 0 && (!caps.images || !showImages)) {
		const imageIndicators = imageBlocks.map((img) => {
			const mimeType = img.mimeType ?? "image/unknown";
			const dims = img.data && img.mimeType ? getImageDimensions(img.data, img.mimeType) ?? void 0 : void 0;
			return imageFallback(mimeType, dims);
		}).join("\n");
		output = output ? `${output}\n${imageIndicators}` : imageIndicators;
	}
	return output;
}
/** Renders bounded text output with the shared TUI expansion hint. */
function formatSessionToolOutput(result, options, theme, showImages, collapsedLineLimit) {
	const output = getTextOutput(result, showImages).trim();
	if (!output) return "";
	const lines = output.split("\n");
	const maxLines = options.expanded ? lines.length : collapsedLineLimit;
	const displayLines = lines.slice(0, maxLines);
	const remaining = lines.length - maxLines;
	let text = `\n${displayLines.map((line) => theme.fg("toolOutput", line)).join("\n")}`;
	if (remaining > 0) text += `${theme.fg("muted", `\n... (${remaining} more lines,`)} ${keyHint("app.tools.expand", "to expand")})`;
	return text;
}
function appendSessionToolTruncationWarning(text, theme, options) {
	const warnings = [];
	if (options.limit) warnings.push(`${options.limit.count} ${options.limit.noun} limit`);
	if (options.truncation?.truncated) warnings.push(`${formatSize(options.truncation.maxBytes ?? 51200)} limit`);
	warnings.push(...options.additionalWarnings ?? []);
	if (warnings.length === 0) return text;
	return `${text}\n${theme.fg("warning", `[Truncated: ${warnings.join(", ")}]`)}`;
}
/** Formats the invalid-argument marker with the active theme. */
function invalidArgText(theme) {
	return theme.fg("error", "[invalid arg]");
}
//#endregion
//#region src/agents/sessions/tools/tool-contracts.ts
/**
* Shared built-in session tool input/detail contracts.
*
* Keeps tool factories, renderers, and callers aligned on typed payload and metadata shapes.
*/
function formatFullOutputFooter(path) {
	return `Full output: ${path}`;
}
const readContinuationFields = {
	offset: Type.Integer({
		minimum: 1,
		maximum: Number.MAX_SAFE_INTEGER
	}),
	limit: Type.Optional(Type.Integer({
		minimum: 1,
		maximum: Number.MAX_SAFE_INTEGER
	}))
};
const ReadToolContinuationSchema = Type.Union([Type.Object({
	kind: Type.Literal("line"),
	...readContinuationFields
}, { additionalProperties: false }), Type.Object({
	kind: Type.Literal("cursor"),
	...readContinuationFields,
	cursor: Type.Integer({
		minimum: 0,
		maximum: Number.MAX_SAFE_INTEGER
	})
}, { additionalProperties: false })]);
//#endregion
//#region src/agents/sessions/tools/tool-definition-wrapper.ts
/** Wrap a ToolDefinition into an AgentTool for the core runtime. */
function wrapToolDefinition(definition, ctxFactory) {
	const tool = {
		name: definition.name,
		label: definition.label,
		...definition.hideFromChannelProgress === true ? { hideFromChannelProgress: true } : {},
		...definition.resultContentSource ? { resultContentSource: definition.resultContentSource } : {},
		description: definition.description,
		parameters: definition.parameters,
		...definition.outputSchema ? { outputSchema: definition.outputSchema } : {},
		prepareArguments: definition.prepareArguments,
		executionMode: definition.executionMode,
		execute: (toolCallId, params, signal, onUpdate) => definition.execute(toolCallId, params, signal, onUpdate, ctxFactory?.())
	};
	copyCodeModeControlToolIdentity(definition, tool);
	return copyInternalToolExecutionPreparer(definition, tool);
}
/** Wrap multiple ToolDefinitions into AgentTools for the core runtime. */
function wrapToolDefinitions(definitions, ctxFactory) {
	return definitions.map((definition) => wrapToolDefinition(definition, ctxFactory));
}
/**
* Synthesize a minimal ToolDefinition from an AgentTool.
*
* This keeps AgentSession's internal registry definition-first even when a caller
* provides plain AgentTool overrides that do not include prompt metadata or renderers.
*/
function createToolDefinitionFromAgentTool(tool) {
	const definition = {
		name: tool.name,
		label: tool.label,
		...tool.hideFromChannelProgress === true ? { hideFromChannelProgress: true } : {},
		...tool.resultContentSource ? { resultContentSource: tool.resultContentSource } : {},
		description: tool.description,
		parameters: tool.parameters,
		...tool.outputSchema ? { outputSchema: tool.outputSchema } : {},
		prepareArguments: tool.prepareArguments,
		executionMode: tool.executionMode,
		execute: async (toolCallId, params, signal, onUpdate) => tool.execute(toolCallId, params, signal, onUpdate)
	};
	copyCodeModeControlToolIdentity(tool, definition);
	return copyInternalToolExecutionPreparer(tool, definition);
}
//#endregion
//#region src/agents/sessions/tools/bash.ts
/**
* Built-in bash session tool.
*
* Executes local shell commands with streaming output accumulation and TUI renderers.
*/
const bashSchema = Type.Object({
	command: Type.String({ description: "Bash command." }),
	timeout: Type.Optional(Type.Number({ description: "Optional timeout seconds; default none." }))
});
function resolveBashTimeoutMs(timeoutSeconds) {
	if (timeoutSeconds === void 0) return;
	if (typeof timeoutSeconds !== "number" || !Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) throw new Error("Invalid timeout: must be a positive finite number of seconds");
	return resolveTimerTimeoutMs(timeoutSeconds * 1e3, 1);
}
if (process.env.VITEST || false) globalThis[Symbol.for("openclaw.bashToolTestApi")] = { resolveBashTimeoutMs };
/**
* Create bash operations using OpenClaw runtime's built-in local shell execution backend.
*
* This is useful for extensions that intercept user_bash and still want OpenClaw runtime's
* standard local shell behavior while wrapping or rewriting commands.
*/
function createLocalBashOperations(options) {
	return { exec: (command, cwd, { onData, signal, timeout, env }) => {
		return new Promise((resolve, reject) => {
			const shellConfig = getBashShellConfig(options?.shellPath);
			const invocation = buildShellCommandInvocation(command, shellConfig);
			if (!existsSync(cwd)) {
				reject(/* @__PURE__ */ new Error(`Working directory does not exist: ${cwd}\nCannot execute bash commands.`));
				return;
			}
			const cancelController = new AbortController();
			const shellEnv = env ?? getBashShellEnv(shellConfig.shell);
			const child = spawnCommand(invocation.argv, {
				baseEnv: {},
				buffer: false,
				cancelSignal: cancelController.signal,
				cwd,
				detached: process.platform !== "win32",
				env: shellEnv,
				forceKillAfterDelay: 300,
				...invocation.input === void 0 ? {} : { input: invocation.input },
				reject: false,
				stdio: [
					invocation.stdin,
					"pipe",
					"pipe"
				]
			});
			const releaseOutput = releaseChildProcessOutputAfterExit(child.nodeChildProcess);
			let childExited = false;
			child.nodeChildProcess.once("exit", () => {
				childExited = true;
			});
			let commandSettled = false;
			const terminationController = createCommandTerminationController({
				child: child.nodeChildProcess,
				cancelController,
				baseEnv: {},
				env: shellEnv,
				processTree: { mode: "force" },
				killGraceMs: 300,
				isChildExited: () => childExited,
				isCommandSettled: () => commandSettled
			});
			let terminationStarted = false;
			const terminate = () => {
				if (terminationStarted) return;
				terminationStarted = true;
				if (!terminationController.terminate()) cancelController.abort();
			};
			let timedOut = false;
			let timeoutHandle;
			const timeoutMs = resolveBashTimeoutMs(timeout);
			if (timeoutMs !== void 0) timeoutHandle = setTimeout(() => {
				timedOut = true;
				terminate();
			}, timeoutMs);
			child.stdout?.on("data", (data) => onData(data, "stdout"));
			child.stderr?.on("data", (data) => onData(data, "stderr"));
			const onAbort = terminate;
			if (signal) {
				if (signal.aborted) onAbort();
				else signal.addEventListener("abort", onAbort, { once: true });
			}
			child.then(async (result) => {
				commandSettled = true;
				await terminationController.settle();
				if (result.failed && result.exitCode === void 0 && result.signal === void 0) {
					if (result instanceof Error) throw result;
					throw new Error(`Failed to launch shell: ${shellConfig.shell}`, { cause: result });
				}
				if (timeoutHandle) clearTimeout(timeoutHandle);
				if (signal) signal.removeEventListener("abort", onAbort);
				if (signal?.aborted) {
					reject(/* @__PURE__ */ new Error("aborted"));
					return;
				}
				if (timedOut) {
					reject(/* @__PURE__ */ new Error(`timeout:${timeout}`));
					return;
				}
				resolve({ exitCode: result.exitCode ?? (result.failed ? 1 : 0) });
			}).catch(async (err) => {
				commandSettled = true;
				await terminationController.settle();
				if (timeoutHandle) clearTimeout(timeoutHandle);
				if (signal) signal.removeEventListener("abort", onAbort);
				reject(toErrorObject(err, "Non-Error rejection"));
			}).finally(releaseOutput);
		});
	} };
}
function resolveSpawnContext(command, cwd, spawnHook, shellPath) {
	const baseContext = {
		command,
		cwd,
		env: getBashShellEnv(shellPath)
	};
	return spawnHook ? spawnHook(baseContext) : baseContext;
}
const BASH_PREVIEW_LINES = 5;
const BASH_UPDATE_THROTTLE_MS = 100;
var BashResultRenderComponent = class extends Container {
	constructor(..._args) {
		super(..._args);
		this.state = {
			cachedWidth: void 0,
			cachedLines: void 0,
			cachedSkipped: void 0
		};
	}
};
function formatBashCall(args) {
	const command = str(args?.command);
	const timeout = args?.timeout;
	const timeoutSuffix = timeout ? interactiveAgentTheme.fg("muted", ` (timeout ${timeout}s)`) : "";
	const commandDisplay = command === null ? invalidArgText(interactiveAgentTheme) : command ? command : interactiveAgentTheme.fg("toolOutput", "...");
	return interactiveAgentTheme.fg("toolTitle", interactiveAgentTheme.bold(`$ ${commandDisplay}`)) + timeoutSuffix;
}
function rebuildBashResultRenderComponent(component, result, options, showImages, startedAt, endedAt) {
	const state = component.state;
	component.clear();
	let output = getTextOutput(result, showImages).trim();
	const truncation = result.details?.truncation;
	const fullOutputPath = result.details?.fullOutputPath;
	if (!options.isPartial && truncation?.truncated && fullOutputPath && output.endsWith("]")) {
		const footerStart = output.lastIndexOf("\n\n[");
		if (footerStart !== -1 && output.slice(footerStart).includes(fullOutputPath)) output = output.slice(0, footerStart).trimEnd();
	}
	if (output) {
		const styledOutput = output.split("\n").map((line) => interactiveAgentTheme.fg("toolOutput", line)).join("\n");
		if (options.expanded) component.addChild(new Text(`\n${styledOutput}`, 0, 0));
		else component.addChild({
			render: (width) => {
				if (state.cachedLines === void 0 || state.cachedWidth !== width) {
					const preview = truncateToVisualLines(styledOutput, BASH_PREVIEW_LINES, width);
					state.cachedLines = preview.visualLines;
					state.cachedSkipped = preview.skippedCount;
					state.cachedWidth = width;
				}
				if (state.cachedSkipped && state.cachedSkipped > 0) {
					const hint = interactiveAgentTheme.fg("muted", `... (${state.cachedSkipped} earlier lines,`) + ` ${keyHint("app.tools.expand", "to expand")})`;
					return [
						"",
						truncateToWidth(hint, width, "..."),
						...state.cachedLines ?? []
					];
				}
				return ["", ...state.cachedLines ?? []];
			},
			invalidate: () => {
				state.cachedWidth = void 0;
				state.cachedLines = void 0;
				state.cachedSkipped = void 0;
			}
		});
	}
	if (truncation?.truncated || fullOutputPath) {
		const warnings = [];
		if (fullOutputPath) warnings.push(formatFullOutputFooter(fullOutputPath));
		if (truncation?.truncated) {
			if (truncation.truncatedBy === "lines") warnings.push(`Truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`);
			else warnings.push(`Truncated: ${truncation.outputLines} lines shown (${formatSize(truncation.maxBytes ?? 51200)} limit)`);
		}
		component.addChild(new Text(`\n${interactiveAgentTheme.fg("warning", `[${warnings.join(". ")}]`)}`, 0, 0));
	}
	if (startedAt !== void 0) {
		const label = options.isPartial ? "Elapsed" : "Took";
		const endTime = endedAt ?? Date.now();
		component.addChild(new Text(`\n${interactiveAgentTheme.fg("muted", `${label} ${formatDurationSeconds(endTime - startedAt)}`)}`, 0, 0));
	}
}
function createBashToolDefinition(cwd, options) {
	const ops = options?.operations ?? createLocalBashOperations({ shellPath: options?.shellPath });
	const commandPrefix = options?.commandPrefix;
	const spawnHook = options?.spawnHook;
	return {
		name: "bash",
		label: "bash",
		description: `Run bash in cwd; stdout+stderr. Returns last ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB; full truncated output saved temp. Optional timeout seconds.`,
		promptSnippet: "Execute bash commands (ls, grep, find, etc.)",
		parameters: bashSchema,
		async execute(toolCallId, { command, timeout }, signal, onUpdate, ctx) {
			resolveBashTimeoutMs(timeout);
			const spawnContext = resolveSpawnContext(commandPrefix ? `${commandPrefix}\n${command}` : command, cwd, spawnHook, options?.shellPath);
			const output = new OutputAccumulator({ tempFilePrefix: "openclaw-bash" });
			let acceptingOutput = true;
			let updateTimer;
			let updateDirty = false;
			let lastUpdateAt = 0;
			const emitOutputUpdate = () => {
				if (!onUpdate || !updateDirty) return;
				updateDirty = false;
				lastUpdateAt = Date.now();
				const snapshot = output.snapshot({ persistIfTruncated: true });
				onUpdate({
					content: [{
						type: "text",
						text: snapshot.content || ""
					}],
					details: {
						truncation: snapshot.truncation.truncated ? snapshot.truncation : void 0,
						fullOutputPath: snapshot.fullOutputPath
					}
				});
			};
			const clearUpdateTimer = () => {
				if (updateTimer) {
					clearTimeout(updateTimer);
					updateTimer = void 0;
				}
			};
			const scheduleOutputUpdate = () => {
				if (!onUpdate) return;
				updateDirty = true;
				const delay = BASH_UPDATE_THROTTLE_MS - (Date.now() - lastUpdateAt);
				if (delay <= 0) {
					clearUpdateTimer();
					emitOutputUpdate();
					return;
				}
				updateTimer ??= setTimeout(() => {
					updateTimer = void 0;
					emitOutputUpdate();
				}, delay);
			};
			if (onUpdate) onUpdate({
				content: [],
				details: void 0
			});
			const handleData = (data, stream) => {
				if (!acceptingOutput) return;
				output.append(data, stream);
				scheduleOutputUpdate();
			};
			const finishOutput = async () => {
				acceptingOutput = false;
				output.finish();
				clearUpdateTimer();
				emitOutputUpdate();
				const snapshot = output.snapshot({ persistIfTruncated: true });
				await output.closeTempFile();
				return snapshot;
			};
			const formatOutput = (snapshot, emptyText = "(no output)") => {
				const truncation = snapshot.truncation;
				let text = snapshot.content || emptyText;
				let details;
				if (truncation.truncated) {
					const fullOutputPath = snapshot.fullOutputPath;
					if (!fullOutputPath) throw new Error("Missing full output path for truncated bash output");
					details = {
						truncation,
						fullOutputPath
					};
					const startLine = truncation.totalLines - truncation.outputLines + 1;
					const endLine = truncation.totalLines;
					if (truncation.lastLinePartial) {
						const lastLineSize = formatSize(output.getLastLineBytes());
						text += `\n\n[Showing last ${formatSize(truncation.outputBytes)} of line ${endLine} (line is ${lastLineSize}). ${formatFullOutputFooter(fullOutputPath)}]`;
					} else if (truncation.truncatedBy === "lines") text += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines}. ${formatFullOutputFooter(fullOutputPath)}]`;
					else text += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). ${formatFullOutputFooter(fullOutputPath)}]`;
				}
				return {
					text,
					details
				};
			};
			const appendStatus = (text, status) => `${text ? `${text}\n\n` : ""}${status}`;
			try {
				let exitCode;
				try {
					exitCode = (await ops.exec(spawnContext.command, spawnContext.cwd, {
						onData: handleData,
						signal,
						timeout,
						env: spawnContext.env
					})).exitCode;
				} catch (err) {
					const { text } = formatOutput(await finishOutput(), "");
					if (err instanceof Error && err.message === "aborted") throw new Error(appendStatus(text, "Command aborted"), { cause: err });
					if (err instanceof Error && err.message.startsWith("timeout:")) {
						const timeoutSecs = err.message.split(":")[1];
						throw new Error(appendStatus(text, `Command timed out after ${timeoutSecs} seconds`), { cause: err });
					}
					throw err;
				}
				const { text: outputText, details } = formatOutput(await finishOutput());
				if (exitCode !== 0 && exitCode !== null) throw new Error(appendStatus(outputText, `Command exited with code ${exitCode}`));
				return {
					content: [{
						type: "text",
						text: outputText
					}],
					details
				};
			} finally {
				clearUpdateTimer();
			}
		},
		renderCall(args, themeValue, context) {
			const state = context.state;
			if (context.executionStarted && state.startedAt === void 0) {
				state.startedAt = Date.now();
				state.endedAt = void 0;
			}
			return reuseTextComponent(context.lastComponent, formatBashCall(args));
		},
		renderResult(result, optionsLocal, themeLocal, context) {
			const state = context.state;
			if (state.startedAt !== void 0 && optionsLocal.isPartial && !state.interval) state.interval = setInterval(() => context.invalidate(), 1e3);
			if (!optionsLocal.isPartial || context.isError) {
				state.endedAt ??= Date.now();
				if (state.interval) {
					clearInterval(state.interval);
					state.interval = void 0;
				}
			}
			const component = context.lastComponent ?? new BashResultRenderComponent();
			rebuildBashResultRenderComponent(component, result, optionsLocal, context.showImages, state.startedAt, state.endedAt);
			component.invalidate();
			return component;
		}
	};
}
function createBashTool(cwd, options) {
	return wrapToolDefinition(createBashToolDefinition(cwd, options));
}
//#endregion
//#region src/agents/line-endings.ts
/**
* Line-ending detection and restoration shared by the file-mutating agent tools.
*/
function detectLineEnding(content) {
	const crlfIdx = content.indexOf("\r\n");
	const lfIdx = content.indexOf("\n");
	if (lfIdx === -1) return "\n";
	if (crlfIdx === -1) return "\n";
	return crlfIdx < lfIdx ? "\r\n" : "\n";
}
function normalizeToLF(text) {
	return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
//#endregion
//#region src/agents/modes/interactive/components/diff.ts
/**
* Interactive terminal diff renderer.
*
* Produces colored line and intra-line highlights for the Pi TUI review surfaces.
*/
/**
* Parse diff line to extract prefix, line number, and content.
* Format: "+123 content" or "-123 content" or " 123 content" or "     ..."
*/
function parseDiffLine(line) {
	const match = line.match(/^([+-\s])(\s*\d*)\s(.*)$/);
	if (!match) return null;
	const [, prefix, lineNum, content] = match;
	return prefix !== void 0 && lineNum !== void 0 && content !== void 0 ? {
		prefix,
		lineNum,
		content
	} : null;
}
/**
* Replace tabs with spaces for consistent rendering.
*/
function replaceTabs(text) {
	return text.replace(/\t/g, "   ");
}
/**
* Compute word-level diff and render with inverse on changed parts.
* Uses diffWords which groups whitespace with adjacent words for cleaner highlighting.
* Strips leading whitespace from inverse to avoid highlighting indentation.
*/
function renderIntraLineDiff(oldContent, newContent) {
	let removedLine = "";
	let addedLine = "";
	const seen = {
		added: false,
		removed: false
	};
	for (const part of diffWords(oldContent, newContent)) {
		const kind = part.added ? "added" : part.removed ? "removed" : void 0;
		let value = part.value;
		if (kind) {
			const changed = seen[kind] ? value : value.trimStart();
			value = value.slice(0, value.length - changed.length) + (changed ? interactiveAgentTheme.inverse(changed) : "");
			seen[kind] = true;
		}
		if (!part.added) removedLine += value;
		if (!part.removed) addedLine += value;
	}
	return {
		removedLine,
		addedLine
	};
}
/**
* Render a diff string with colored lines and intra-line change highlighting.
* - Context lines: dim/gray
* - Removed lines: red, with inverse on changed tokens
* - Added lines: green, with inverse on changed tokens
*/
function renderDiff(diffText) {
	const lines = diffText.split("\n");
	const result = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines.at(i);
		if (line === void 0) break;
		const parsed = parseDiffLine(line);
		if (!parsed) {
			result.push(interactiveAgentTheme.fg("toolDiffContext", line));
			i++;
			continue;
		}
		if (parsed.prefix === "-") {
			const removedLines = [];
			while (i < lines.length) {
				const currentLine = lines.at(i);
				const p = currentLine === void 0 ? null : parseDiffLine(currentLine);
				if (!p || p.prefix !== "-") break;
				removedLines.push({
					lineNum: p.lineNum,
					content: p.content
				});
				i++;
			}
			const addedLines = [];
			while (i < lines.length) {
				const currentLine = lines.at(i);
				const p = currentLine === void 0 ? null : parseDiffLine(currentLine);
				if (!p || p.prefix !== "+") break;
				addedLines.push({
					lineNum: p.lineNum,
					content: p.content
				});
				i++;
			}
			if (removedLines.length === 1 && addedLines.length === 1) {
				const removed = removedLines[0];
				const added = addedLines[0];
				if (!removed || !added) continue;
				const { removedLine, addedLine } = renderIntraLineDiff(replaceTabs(removed.content), replaceTabs(added.content));
				result.push(interactiveAgentTheme.fg("toolDiffRemoved", `-${removed.lineNum} ${removedLine}`));
				result.push(interactiveAgentTheme.fg("toolDiffAdded", `+${added.lineNum} ${addedLine}`));
			} else {
				for (const removed of removedLines) result.push(interactiveAgentTheme.fg("toolDiffRemoved", `-${removed.lineNum} ${replaceTabs(removed.content)}`));
				for (const added of addedLines) result.push(interactiveAgentTheme.fg("toolDiffAdded", `+${added.lineNum} ${replaceTabs(added.content)}`));
			}
		} else if (parsed.prefix === "+") {
			result.push(interactiveAgentTheme.fg("toolDiffAdded", `+${parsed.lineNum} ${replaceTabs(parsed.content)}`));
			i++;
		} else {
			result.push(interactiveAgentTheme.fg("toolDiffContext", ` ${parsed.lineNum} ${replaceTabs(parsed.content)}`));
			i++;
		}
	}
	return result.join("\n");
}
//#endregion
//#region src/agents/utf8-file.ts
const strictUtf8FileDecoder = new TextDecoder("utf-8", {
	fatal: true,
	ignoreBOM: true
});
/** Reject invalid file bytes without stripping a valid leading UTF-8 BOM. */
function decodeUtf8File(contents, filePath) {
	try {
		return strictUtf8FileDecoder.decode(contents);
	} catch (error) {
		throw new Error(`File ${filePath} is not valid UTF-8 and cannot be edited safely.`, { cause: error });
	}
}
//#endregion
//#region src/agents/sessions/tools/edit-replacements.ts
function splitLinesWithEndings(content) {
	return content.match(/[^\n]*\n|[^\n]+/g) ?? [];
}
function getLineSpans(content) {
	let offset = 0;
	return splitLinesWithEndings(content).map((line) => {
		const span = {
			start: offset,
			end: offset + line.length
		};
		offset = span.end;
		return span;
	});
}
function getReplacementLineRange(lines, replacement) {
	const replacementStart = replacement.matchIndex;
	const replacementEnd = replacement.matchIndex + replacement.matchLength;
	const startLine = lines.findIndex((line) => replacementStart >= line.start && replacementStart < line.end);
	if (startLine === -1) throw new Error("Replacement range is outside the base content.");
	let endLine = startLine;
	while (endLine < lines.length) {
		const line = lines.at(endLine);
		if (!line || line.end >= replacementEnd) break;
		endLine++;
	}
	if (endLine >= lines.length) throw new Error("Replacement range is outside the base content.");
	return {
		startLine,
		endLine: endLine + 1
	};
}
function applyReplacements(content, replacements, offset = 0) {
	let result = content;
	for (const replacement of replacements.toReversed()) {
		const matchIndex = replacement.matchIndex - offset;
		result = result.slice(0, matchIndex) + replacement.newText + result.slice(matchIndex + replacement.matchLength);
	}
	return result;
}
function groupReplacementsByLine(baseContent, replacements) {
	const lines = getLineSpans(baseContent);
	const groups = [];
	const sortedReplacements = replacements.toSorted((a, b) => a.matchIndex - b.matchIndex);
	for (const replacement of sortedReplacements) {
		const range = getReplacementLineRange(lines, replacement);
		const current = groups.at(-1);
		if (current && range.startLine < current.endLine) {
			current.endLine = Math.max(current.endLine, range.endLine);
			current.replacements.push(replacement);
		} else groups.push({
			...range,
			replacements: [replacement]
		});
	}
	return {
		lines,
		groups
	};
}
function splitLinesWithTerminators(content) {
	return content.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+/g) ?? [];
}
function getLineTerminator(line) {
	if (line === void 0) return;
	if (line.endsWith("\r\n")) return "\r\n";
	if (line.endsWith("\n")) return "\n";
	return line.endsWith("\r") ? "\r" : void 0;
}
function restoreNormalizedLineEndings(normalizedContent, sourceLines, fallback) {
	let sourceIndex = 0;
	return normalizedContent.replace(/\n/g, () => {
		const source = sourceLines[sourceIndex] ?? sourceLines.at(-1);
		sourceIndex++;
		return getLineTerminator(source) ?? fallback;
	});
}
function countLineBreaks(content) {
	return content.match(/\n/g)?.length ?? 0;
}
function applyReplacementsPreservingLineEndings(originalContent, baseContent, replacements) {
	const originalLines = splitLinesWithTerminators(originalContent);
	const { lines: baseLines, groups } = groupReplacementsByLine(baseContent, replacements);
	if (originalLines.length !== baseLines.length) throw new Error("Cannot preserve original line endings because the base content has a different line count.");
	const fileFallback = detectLineEnding(originalContent);
	let originalIndex = 0;
	let result = "";
	for (const group of groups) {
		result += originalLines.slice(originalIndex, group.startLine).join("");
		const firstLine = baseLines.at(group.startLine);
		const lastLine = baseLines.at(group.endLine - 1);
		if (!firstLine || !lastLine) throw new Error("Replacement group is outside the base content.");
		const groupStartOffset = firstLine.start;
		const normalizedGroup = baseContent.slice(groupStartOffset, lastLine.end);
		const sourceGroup = originalLines.slice(group.startLine, group.endLine);
		const groupFallback = getLineTerminator(sourceGroup[0]) ?? getLineTerminator(originalLines[group.startLine - 1]) ?? fileFallback;
		const restoredGroup = restoreNormalizedLineEndings(normalizedGroup, sourceGroup, groupFallback);
		const restoredReplacements = group.replacements.map((replacement) => {
			const relativeStart = replacement.matchIndex - groupStartOffset;
			const relativeEnd = relativeStart + replacement.matchLength;
			const restoredStart = restoreNormalizedLineEndings(normalizedGroup.slice(0, relativeStart), sourceGroup, groupFallback).length;
			const restoredEnd = restoreNormalizedLineEndings(normalizedGroup.slice(0, relativeEnd), sourceGroup, groupFallback).length;
			const range = getReplacementLineRange(baseLines, replacement);
			const replacementSource = originalLines.slice(range.startLine, range.endLine);
			const replacementFallback = getLineTerminator(replacementSource[0]) ?? getLineTerminator(originalLines[range.startLine - 1]) ?? fileFallback;
			const consumedTerminatorCount = countLineBreaks(normalizedGroup.slice(relativeStart, relativeEnd));
			const replacementTerminatorCount = countLineBreaks(replacement.newText);
			const terminatorSources = consumedTerminatorCount > 0 ? replacementSource.slice(0, consumedTerminatorCount) : replacementSource.slice(0, 1);
			const sourceOffset = Math.max(0, terminatorSources.length - replacementTerminatorCount);
			return {
				matchIndex: restoredStart,
				matchLength: restoredEnd - restoredStart,
				newText: restoreNormalizedLineEndings(replacement.newText, terminatorSources.slice(sourceOffset), replacementFallback)
			};
		});
		result += applyReplacements(restoredGroup, restoredReplacements);
		originalIndex = group.endLine;
	}
	return result + originalLines.slice(originalIndex).join("");
}
//#endregion
//#region src/agents/sessions/tools/edit-diff.ts
/**
* Shared diff computation utilities for the edit tool.
* Used by both edit.ts (for execution) and tool-execution.ts (for preview rendering).
*/
const fuzzyGraphemeSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
function foldFuzzyCharacters(text) {
	return text.replace(/[\u2018\u2019\u201A\u201B]/g, "'").replace(/[\u201C\u201D\u201E\u201F]/g, "\"").replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-").replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ");
}
/**
* Normalize text for fuzzy matching. Applies progressive transformations:
* - Strip trailing whitespace from each line
* - Normalize smart quotes to ASCII equivalents
* - Normalize Unicode dashes/hyphens to ASCII hyphen
* - Normalize special Unicode spaces to regular space
*
*/
function normalizeForFuzzyMatch(text) {
	return foldFuzzyCharacters(text.normalize("NFKC").split("\n").map((line) => line.trimEnd()).join("\n"));
}
function buildNfkcBoundaries(text, authoritativeNfkc) {
	const boundaries = [];
	const normalizedSegments = [];
	let normalizedOffset = 0;
	for (const segment of fuzzyGraphemeSegmenter.segment(text)) {
		const sourceStart = segment.index;
		const sourceEnd = sourceStart + segment.segment.length;
		const normalizedSegment = segment.segment.normalize("NFKC");
		normalizedSegments.push(normalizedSegment);
		const boundary = boundaries[normalizedOffset] ?? {};
		if (normalizedSegment.length === 0) {
			boundaries[normalizedOffset] = {
				end: boundary.end ?? sourceStart,
				start: sourceEnd
			};
			continue;
		}
		boundaries[normalizedOffset] = {
			start: boundary.start ?? sourceStart,
			end: boundary.end ?? sourceStart
		};
		normalizedOffset += normalizedSegment.length;
		boundaries[normalizedOffset] = {
			start: sourceEnd,
			end: sourceEnd
		};
	}
	if (normalizedSegments.join("") !== authoritativeNfkc) return;
	return boundaries;
}
function buildFuzzyNormalizedFile(text) {
	const authoritativeNfkc = text.normalize("NFKC");
	const nfkcBoundaries = buildNfkcBoundaries(text, authoritativeNfkc);
	if (!nfkcBoundaries) return;
	const boundaries = [];
	let sourceLineStart = 0;
	let normalizedLineStart = 0;
	while (sourceLineStart <= authoritativeNfkc.length) {
		const newlineIndex = authoritativeNfkc.indexOf("\n", sourceLineStart);
		const sourceLineEnd = newlineIndex === -1 ? authoritativeNfkc.length : newlineIndex;
		const line = authoritativeNfkc.slice(sourceLineStart, sourceLineEnd);
		const keptLineEnd = sourceLineStart + line.trimEnd().length;
		for (let offset = sourceLineStart; offset <= keptLineEnd; offset++) {
			const boundary = nfkcBoundaries[offset];
			if (boundary) boundaries[normalizedLineStart + offset - sourceLineStart] = { ...boundary };
		}
		const normalizedLineEnd = normalizedLineStart + keptLineEnd - sourceLineStart;
		if (keptLineEnd < sourceLineEnd) {
			const beforeTrim = nfkcBoundaries[keptLineEnd];
			const afterTrim = nfkcBoundaries[sourceLineEnd];
			boundaries[normalizedLineEnd] = {
				end: beforeTrim?.end,
				start: afterTrim?.start
			};
		}
		if (newlineIndex === -1) break;
		const afterNewline = nfkcBoundaries[sourceLineEnd + 1];
		boundaries[normalizedLineEnd + 1] = afterNewline ? { ...afterNewline } : void 0;
		normalizedLineStart = normalizedLineEnd + 1;
		sourceLineStart = sourceLineEnd + 1;
	}
	const normalizedText = normalizeForFuzzyMatch(text);
	if (boundaries.length > normalizedText.length + 1) return;
	return {
		text: normalizedText,
		boundaries
	};
}
function translateFuzzySpan(normalized, fuzzyStart, fuzzyLength) {
	const fuzzyEnd = fuzzyStart + fuzzyLength;
	const originalStart = normalized.boundaries[fuzzyStart]?.start;
	const originalEnd = normalized.boundaries[fuzzyEnd]?.end;
	if (originalStart === void 0 || originalEnd === void 0) return;
	return {
		originalStart,
		originalLength: originalEnd - originalStart
	};
}
var EditNoChangeError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "EditNoChangeError";
	}
};
/**
* Find oldText in content, trying exact match first, then fuzzy match.
* When fuzzy matching is used and an offsetMap is provided, the returned
* index and matchLength are translated back to original-content coordinates
* so the caller can apply replacements against the un-normalized content.
*/
function fuzzyFindText(content, oldText, normalizedFile) {
	const exactIndex = content.indexOf(oldText);
	if (exactIndex !== -1) return {
		found: true,
		index: exactIndex,
		matchLength: oldText.length,
		usedFuzzyMatch: false
	};
	const fuzzyContent = normalizedFile?.text ?? normalizeForFuzzyMatch(content);
	const fuzzyOldText = normalizeForFuzzyMatch(oldText);
	if (!fuzzyOldText) return {
		found: false,
		index: -1,
		matchLength: 0,
		usedFuzzyMatch: true,
		unsafeBoundary: true
	};
	const fuzzyIndex = fuzzyContent.indexOf(fuzzyOldText);
	if (fuzzyIndex === -1) return {
		found: false,
		index: -1,
		matchLength: 0,
		usedFuzzyMatch: false
	};
	const translated = normalizedFile ? translateFuzzySpan(normalizedFile, fuzzyIndex, fuzzyOldText.length) : void 0;
	if (!translated) return {
		found: false,
		index: -1,
		matchLength: 0,
		usedFuzzyMatch: true,
		unsafeBoundary: true
	};
	return {
		found: true,
		index: translated.originalStart,
		matchLength: translated.originalLength,
		usedFuzzyMatch: true
	};
}
/** Strip UTF-8 BOM if present, return both the BOM (if any) and the text without it */
function stripBom(content) {
	return content.startsWith("﻿") ? {
		bom: "﻿",
		text: content.slice(1)
	} : {
		bom: "",
		text: content
	};
}
function countOccurrences(content, oldText) {
	const fuzzyContent = normalizeForFuzzyMatch(content);
	const fuzzyOldText = normalizeForFuzzyMatch(oldText);
	if (!fuzzyOldText) return 0;
	return fuzzyContent.split(fuzzyOldText).length - 1;
}
function countExactOccurrences(content, oldText) {
	return content.split(oldText).length - 1;
}
const EDIT_CANDIDATE_LIMIT = 3;
const EDIT_CANDIDATE_MAX_LINES = 1e3;
const EDIT_CANDIDATE_MAX_SCAN_CHARS = 131072;
const EDIT_CANDIDATE_MAX_LINE_CHARS = 120;
const EDIT_CANDIDATE_MIN_SCORE = .45;
function truncateCandidateText(text, maxChars) {
	if (text.length <= maxChars) return text;
	const cut = maxChars > 0 && /[\uD800-\uDBFF]/.test(text.charAt(maxChars - 1)) && /[\uDC00-\uDFFF]/.test(text.charAt(maxChars)) ? maxChars - 1 : maxChars;
	return text.slice(0, cut);
}
function getBoundedLines(text, maxLines, maxScanChars) {
	return truncateCandidateText(text, maxScanChars).split("\n", maxLines).map((line) => truncateCandidateText(line, EDIT_CANDIDATE_MAX_LINE_CHARS));
}
function scoreCandidate(expected, candidate) {
	const normalizedExpected = expected.trim();
	const normalizedCandidate = candidate.trim();
	const maxLength = Math.max(normalizedExpected.length, normalizedCandidate.length);
	if (maxLength === 0) return 0;
	if (Math.min(normalizedExpected.length, normalizedCandidate.length) / maxLength < EDIT_CANDIDATE_MIN_SCORE) return 0;
	return 1 - levenshteinDistance(normalizedExpected, normalizedCandidate) / maxLength;
}
function describeIndentation(line) {
	const indentation = line.match(/^[ \t]*/)?.[0] ?? "";
	if (!indentation) return "none";
	const tabs = indentation.match(/\t/g)?.length ?? 0;
	const spaces = indentation.length - tabs;
	return tabs === 0 ? `${spaces} spaces` : `${spaces} spaces and ${tabs} tabs`;
}
function firstDifferenceIndex(left, right) {
	const sharedLength = Math.min(left.length, right.length);
	for (let index = 0; index < sharedLength; index++) if (left.charAt(index) !== right.charAt(index)) return index;
	return left.length === right.length ? -1 : sharedLength;
}
function describeCandidateDifference(expected, found) {
	if ((expected.match(/^[ \t]*/)?.[0] ?? "") !== (found.match(/^[ \t]*/)?.[0] ?? "")) return `indentation differs (expected ${describeIndentation(expected)}, found ${describeIndentation(found)})`;
	const expectedBackslashes = expected.match(/\\/g)?.length ?? 0;
	const foundBackslashes = found.match(/\\/g)?.length ?? 0;
	if (expectedBackslashes !== foundBackslashes) return `escaping differs (expected ${expectedBackslashes} backslashes, found ${foundBackslashes})`;
	const differenceIndex = firstDifferenceIndex(expected, found);
	return differenceIndex === -1 ? "this line matches; surrounding lines differ" : `first difference at column ${differenceIndex + 1}`;
}
function getCandidateHint(content, oldText) {
	const expected = getBoundedLines(oldText, 32, 4096).reduce((best, line) => line.trim().length > best.trim().length ? line : best, "");
	if (!expected.trim()) return "";
	const candidates = getBoundedLines(content, EDIT_CANDIDATE_MAX_LINES, EDIT_CANDIDATE_MAX_SCAN_CHARS).map((line, index) => {
		const score = scoreCandidate(expected, line);
		return score >= EDIT_CANDIDATE_MIN_SCORE ? {
			lineNumber: index + 1,
			line,
			score
		} : void 0;
	}).filter((candidate) => candidate !== void 0).toSorted((left, right) => right.score - left.score || left.lineNumber - right.lineNumber).slice(0, EDIT_CANDIDATE_LIMIT);
	if (candidates.length === 0) return "";
	const expectedDisplay = JSON.stringify(expected);
	return "\nClosest matching lines:\n" + candidates.map((candidate) => {
		const foundDisplay = JSON.stringify(candidate.line);
		const differenceIndex = firstDifferenceIndex(expectedDisplay, foundDisplay);
		const markerIndex = differenceIndex === -1 ? Math.min(expectedDisplay.length, foundDisplay.length) : differenceIndex;
		const markerWidth = Math.max(1, Math.min(12, Math.max(expectedDisplay.length, foundDisplay.length) - markerIndex));
		return [
			`  near line ${candidate.lineNumber} (${Math.round(candidate.score * 100)}% match):`,
			`    expected: ${expectedDisplay}`,
			`    found:    ${foundDisplay}`,
			`              ${" ".repeat(markerIndex)}${"^".repeat(markerWidth)}`,
			`    hint: ${describeCandidateDifference(expected, candidate.line)}`
		].join("\n");
	}).join("\n");
}
function getNotFoundError(path, editIndex, totalEdits, content, oldText) {
	const prefix = totalEdits === 1 ? "Could not find the exact text" : `Could not find edits[${editIndex}]`;
	const hint = getCandidateHint(content, oldText);
	return /* @__PURE__ */ new Error(`${prefix} in ${path}. The old text must match exactly including all whitespace and newlines.${hint}`);
}
function getDuplicateError(path, editIndex, totalEdits, occurrences) {
	if (totalEdits === 1) return /* @__PURE__ */ new Error(`Found ${occurrences} occurrences of the text in ${path}. The text must be unique. Please provide more context to make it unique.`);
	return /* @__PURE__ */ new Error(`Found ${occurrences} occurrences of edits[${editIndex}] in ${path}. Each oldText must be unique. Please provide more context to make it unique.`);
}
function getEmptyOldTextError(path, editIndex, totalEdits) {
	if (totalEdits === 1) return /* @__PURE__ */ new Error(`oldText must not be empty in ${path}.`);
	return /* @__PURE__ */ new Error(`edits[${editIndex}].oldText must not be empty in ${path}.`);
}
function getNoChangeError(path, totalEdits) {
	if (totalEdits === 1) return new EditNoChangeError(`No changes made to ${path}. The replacement produced identical content. This might indicate an issue with special characters or the text not existing as expected.`);
	return new EditNoChangeError(`No changes made to ${path}. The replacements produced identical content.`);
}
function getUnsafeFuzzyBoundaryError(path, editIndex, totalEdits) {
	const target = totalEdits === 1 ? "The fuzzy match" : `The fuzzy match for edits[${editIndex}]`;
	return /* @__PURE__ */ new Error(`${target} in ${path} crosses an ambiguous Unicode-normalization or trimmed-whitespace boundary. Copy the exact source text or use a span whose normalized boundaries map cleanly.`);
}
/**
* Apply one or more exact-text replacements to LF-normalized content.
*
* All edits are matched against the same original content. Replacements are
* then applied in reverse order so offsets remain stable. Fuzzy matching is
* lookup-only: replacements always splice into the original content.
*/
function applyEdits(normalizedContent, edits, path) {
	const normalizedEdits = edits.map((edit) => ({
		oldText: normalizeToLF(edit.oldText),
		newText: normalizeToLF(edit.newText)
	}));
	for (const [i, edit] of normalizedEdits.entries()) if (edit.oldText.length === 0) throw getEmptyOldTextError(path, i, normalizedEdits.length);
	const fuzzyFile = normalizedEdits.some((edit) => !normalizedContent.includes(edit.oldText)) ? buildFuzzyNormalizedFile(normalizedContent) : void 0;
	const replacementBaseContent = normalizedContent;
	const matchedEdits = [];
	for (const [i, edit] of normalizedEdits.entries()) {
		const matchResult = fuzzyFindText(normalizedContent, edit.oldText, fuzzyFile);
		const occurrences = matchResult.usedFuzzyMatch ? countOccurrences(normalizedContent, edit.oldText) : countExactOccurrences(replacementBaseContent, edit.oldText);
		if (occurrences > 1) throw getDuplicateError(path, i, normalizedEdits.length, occurrences);
		if (matchResult.unsafeBoundary) throw getUnsafeFuzzyBoundaryError(path, i, normalizedEdits.length);
		if (!matchResult.found) throw getNotFoundError(path, i, normalizedEdits.length, normalizedContent, edit.oldText);
		matchedEdits.push({
			editIndex: i,
			matchIndex: matchResult.index,
			matchLength: matchResult.matchLength,
			newText: edit.newText
		});
	}
	matchedEdits.sort((a, b) => a.matchIndex - b.matchIndex);
	for (let i = 1; i < matchedEdits.length; i++) {
		const previous = matchedEdits.at(i - 1);
		const current = matchedEdits.at(i);
		if (!previous || !current) continue;
		if (previous.matchIndex + previous.matchLength > current.matchIndex) throw new Error(`edits[${previous.editIndex}] and edits[${current.editIndex}] overlap in ${path}. Merge them into one edit or target disjoint regions.`);
	}
	const baseContent = normalizedContent;
	const newContent = applyReplacements(replacementBaseContent, matchedEdits);
	if (baseContent === newContent) throw getNoChangeError(path, normalizedEdits.length);
	return {
		baseContent,
		newContent,
		replacementBaseContent,
		replacements: matchedEdits
	};
}
function applyEditsToNormalizedContent(normalizedContent, edits, path) {
	const { baseContent, newContent } = applyEdits(normalizedContent, edits, path);
	return {
		baseContent,
		newContent
	};
}
function applyEditsPreservingLineEndings(originalContent, edits, path) {
	const applied = applyEdits(normalizeToLF(originalContent), edits, path);
	const finalContent = applyReplacementsPreservingLineEndings(originalContent, applied.replacementBaseContent, applied.replacements);
	if (normalizeToLF(finalContent) !== applied.newContent) throw new Error("Line-ending restoration changed the normalized edit result.");
	return {
		baseContent: applied.baseContent,
		newContent: applied.newContent,
		finalContent
	};
}
/** Generate a standard unified patch. */
function generateUnifiedPatch(path, oldContent, newContent, contextLines = 4) {
	return createPatch(path, oldContent, newContent, void 0, void 0, {
		context: contextLines,
		headerOptions: FILE_HEADERS_ONLY
	});
}
/**
* Generate a display-oriented diff string with line numbers and context.
* Returns both the diff string and the first changed line number (in the new file).
*/
function generateDiffString(oldContent, newContent, contextLines = 4) {
	const hunks = structuredPatch("", "", oldContent, newContent, void 0, void 0, { context: contextLines }).hunks;
	const oldLineCount = oldContent.split("\n").length;
	const newLineCount = newContent.split("\n").length;
	const lastNewLine = newContent === "" ? 0 : newLineCount - Number(newContent.endsWith("\n"));
	const lineNumWidth = String(Math.max(oldLineCount, newLineCount)).length;
	const ellipsis = ` ${"".padStart(lineNumWidth, " ")} ...`;
	const output = [];
	let firstChangedLine;
	for (const [hunkIndex, hunk] of hunks.entries()) {
		if (hunkIndex > 0 || hunk.newStart > 1) output.push(ellipsis);
		let oldLineNum = hunk.oldStart;
		let newLineNum = hunk.newStart;
		for (const line of hunk.lines) {
			const prefix = line[0];
			if (prefix === "\\") continue;
			if (firstChangedLine === void 0 && prefix !== " ") firstChangedLine = newLineNum;
			const lineNum = prefix === "-" ? oldLineNum : newLineNum;
			output.push(`${prefix}${String(lineNum).padStart(lineNumWidth, " ")} ${line.slice(1)}`);
			oldLineNum += prefix === "+" ? 0 : 1;
			newLineNum += prefix === "-" ? 0 : 1;
		}
		if (hunkIndex === hunks.length - 1 && hunk.newStart + hunk.newLines <= lastNewLine) output.push(ellipsis);
	}
	return {
		diff: output.join("\n"),
		firstChangedLine
	};
}
function validateNoOpEditTargets(normalizedContent, noOpEdits, realEdits, path) {
	if (noOpEdits.length > 0) applyEditsToNormalizedContent(normalizedContent, noOpEdits.map((edit) => ({
		oldText: edit.oldText,
		newText: ""
	})), path);
	const exactNoOpEdits = noOpEdits.filter((edit) => normalizedContent.includes(normalizeToLF(edit.oldText)));
	if (exactNoOpEdits.length > 0 && realEdits.length > 0) applyEditsToNormalizedContent(normalizedContent, [...exactNoOpEdits, ...realEdits].map((edit) => ({
		oldText: edit.oldText,
		newText: ""
	})), path);
}
function splitNoOpEdits(normalizedContent, edits, path) {
	const noOpEdits = [];
	const realEdits = [];
	for (const edit of edits) if (edit.oldText === edit.newText) {
		applyEditsToNormalizedContent(normalizedContent, [{
			oldText: edit.oldText,
			newText: ""
		}], path);
		noOpEdits.push(edit);
	} else realEdits.push(edit);
	return {
		noOpEdits,
		realEdits
	};
}
/**
* Compute the diff for one or more edit operations without applying them.
* Used for preview rendering in the TUI before the tool executes.
*/
async function computeEditsDiff(path, edits, cwd, operations, resolvePath = operations ? resolveToCwd : resolveLocalPathToCwd) {
	const absolutePath = resolvePath(path, cwd);
	try {
		try {
			if (operations) await operations.access(absolutePath);
			else await access(absolutePath, constants.R_OK);
		} catch (error) {
			return { error: `Could not edit file: ${path}. ${error instanceof Error && "code" in error ? `Error code: ${String(error.code)}` : String(error)}.` };
		}
		const rawContentResult = operations ? await operations.readFile(absolutePath) : await readFile(absolutePath, "utf-8");
		const { text: content } = stripBom(typeof rawContentResult === "string" ? rawContentResult : rawContentResult.toString("utf-8"));
		const normalizedContent = normalizeToLF(content);
		const { noOpEdits, realEdits } = splitNoOpEdits(normalizedContent, edits, path);
		validateNoOpEditTargets(normalizedContent, noOpEdits, realEdits, path);
		if (realEdits.length === 0) return {
			diff: "",
			firstChangedLine: void 0
		};
		const { baseContent, newContent } = applyEditsToNormalizedContent(normalizedContent, realEdits, path);
		return generateDiffString(baseContent, newContent);
	} catch (err) {
		if (err instanceof EditNoChangeError) return {
			diff: "",
			firstChangedLine: void 0
		};
		return { error: err instanceof Error ? err.message : String(err) };
	}
}
//#endregion
//#region src/agents/sessions/tools/file-mutation-queue.ts
/**
* Per-file mutation queue.
*
* Serializes reads and mutations targeting the same real file while allowing independent files to run in parallel.
*/
const fileMutationTails = resolveGlobalMap(Symbol.for("openclaw.fileMutationTails"), "close-only");
const keyAdmissions = resolveGlobalSingleton(Symbol.for("openclaw.fileMutationKeyAdmissions"), () => ({
	fallbackScope: {},
	tails: /* @__PURE__ */ new WeakMap()
}));
function resolveLocalFileMutationQueueKey(filePath) {
	return resolveIdentityPathViaExistingAncestorSync(filePath);
}
async function resolveFileMutationQueueKey(filePath, resolveQueueKey, signal) {
	return await (resolveQueueKey?.(filePath, signal) ?? resolveLocalFileMutationQueueKey(filePath));
}
/**
* Preserve source-call admission while backend-owned physical identities resolve concurrently.
* Registration is ordered per assistant message; file operations still use only fileMutationTails.
*/
async function withFileMutationQueueKeyResolution(keyResolution, fn) {
	return await withFileMutationQueueKeysResolution(keyResolution.then((key) => [key]), fn);
}
async function withFileMutationQueueKeysResolution(keysResolution, fn) {
	const scope = getAgentToolExecutionContext()?.assistantMessage ?? keyAdmissions.fallbackScope;
	const previousAdmission = keyAdmissions.tails.get(scope) ?? Promise.resolve();
	keysResolution.catch(() => void 0);
	let operation;
	const admission = previousAdmission.then(async () => {
		operation = enqueueFileMutationQueueKeys(await keysResolution, fn);
	});
	const tail = admission.then(() => void 0, () => void 0);
	keyAdmissions.tails.set(scope, tail);
	const cleanup = () => {
		if (keyAdmissions.tails.get(scope) === tail) keyAdmissions.tails.delete(scope);
	};
	tail.then(cleanup, cleanup);
	await admission;
	return await operation;
}
/**
* Serialize file mutation operations targeting the same file.
* Operations for different files still run in parallel.
*/
async function withFileMutationQueue(filePath, fn) {
	return await withFileMutationQueues([filePath], fn);
}
async function withFileMutationQueues(filePaths, fn) {
	return await enqueueFileMutationQueueKeys(filePaths.map(resolveLocalFileMutationQueueKey), fn);
}
function enqueueFileMutationQueueKeys(queueKeys, fn) {
	const keys = [...new Set(queueKeys)].toSorted();
	const current = Promise.all(keys.map((key) => (fileMutationTails.get(key) ?? Promise.resolve()).catch(() => void 0))).then(fn);
	const tail = current.then(() => void 0, () => void 0);
	for (const key of keys) fileMutationTails.set(key, tail);
	const cleanup = () => {
		for (const key of keys) if (fileMutationTails.get(key) === tail) fileMutationTails.delete(key);
	};
	tail.then(cleanup, cleanup);
	return current;
}
//#endregion
//#region src/agents/sessions/tools/file-write-verification.ts
async function verifyPersistedUtf8File(absolutePath, content, operations) {
	const expectedContent = Buffer.from(content, "utf8");
	const stat = await operations.statFile(absolutePath).catch(() => null);
	if (!stat || stat.type !== "file" || stat.size !== expectedContent.byteLength) return false;
	const readback = await operations.readFile(absolutePath).catch(() => void 0);
	if (readback === void 0) return false;
	return (Buffer.isBuffer(readback) ? readback : Buffer.from(readback, "utf8")).equals(expectedContent);
}
//#endregion
//#region src/agents/sessions/tools/edit.ts
/**
* Built-in edit session tool.
*
* Applies exact targeted replacements with queued file mutation, diff previews, and TUI renderers.
*/
const replaceEditSchema = Type.Object({
	oldText: Type.String({ description: "Exact original text; unique and non-overlapping in this call." }),
	newText: Type.String({ description: "Replacement text." })
}, {});
const editSchema = Type.Object({
	path: Type.String({ description: "File path; relative/absolute." }),
	edits: Type.Array(replaceEditSchema, { description: "Targeted replacements against original file; no overlap/nesting. Merge nearby changes." })
}, {});
const EditToolOutputSchema = Type.Union([Type.Object({ changed: Type.Literal(false) }, { additionalProperties: false }), Type.Object({
	changed: Type.Literal(true),
	diff: Type.String(),
	patch: Type.String(),
	firstChangedLine: Type.Optional(Type.Integer({ minimum: 1 }))
}, { additionalProperties: false })]);
const EDIT_MISMATCH_MESSAGE = "Could not find the exact text in";
const EDIT_MISMATCH_HINT_LIMIT = 800;
const defaultEditOperations = {
	readFile: (path) => readFile(path),
	writeFile: (path, content) => writeFile(path, content, "utf-8"),
	statFile: async (path) => {
		try {
			const stat$3 = await stat(path);
			return {
				type: stat$3.isFile() ? "file" : stat$3.isDirectory() ? "directory" : "other",
				size: stat$3.size,
				mtimeMs: stat$3.mtimeMs
			};
		} catch (error) {
			if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
			throw error;
		}
	},
	access: (path) => access(path, constants.R_OK | constants.W_OK)
};
function prepareEditArguments(input) {
	if (!input || typeof input !== "object") return input;
	const args = { ...input };
	if (typeof args.edits === "string") try {
		const parsed = JSON.parse(args.edits);
		if (Array.isArray(parsed)) args.edits = parsed;
	} catch {}
	const legacy = args;
	if (typeof legacy.oldText === "string" && typeof legacy.newText === "string") {
		const edits = Array.isArray(legacy.edits) ? [...legacy.edits] : [];
		edits.push({
			oldText: legacy.oldText,
			newText: legacy.newText
		});
		args.edits = edits;
	}
	const edits = Array.isArray(args.edits) ? args.edits.map((edit) => {
		if (!edit || typeof edit !== "object" || Array.isArray(edit)) return edit;
		const candidate = edit;
		return {
			oldText: candidate.oldText,
			newText: candidate.newText
		};
	}) : args.edits;
	return {
		path: args.path,
		edits
	};
}
function validateEditInput(input) {
	if (!Array.isArray(input.edits) || input.edits.length === 0) throw new Error("Edit tool input is invalid. edits must contain at least one replacement.");
	return {
		path: input.path,
		edits: input.edits
	};
}
function appendMismatchHint(error, currentContent) {
	const snippet = currentContent.length <= EDIT_MISMATCH_HINT_LIMIT ? currentContent : `${truncateUtf16Safe(currentContent, EDIT_MISMATCH_HINT_LIMIT)}\n... (truncated)`;
	const enhanced = new Error(`${error.message}\nCurrent file contents:\n${snippet}`, { cause: error });
	enhanced.stack = error.stack;
	return enhanced;
}
function createEditCallRenderComponent() {
	return Object.assign(new Box(1, 1, (text) => text), {
		preview: void 0,
		previewArgsKey: void 0,
		previewPending: false,
		settledError: false
	});
}
function getEditCallRenderComponent(state, lastComponent) {
	if (lastComponent instanceof Box) {
		const component = lastComponent;
		state.callComponent = component;
		return component;
	}
	if (state.callComponent) return state.callComponent;
	const component = createEditCallRenderComponent();
	state.callComponent = component;
	return component;
}
function getRenderablePreviewInput(args) {
	if (!args) return null;
	const path = typeof args.path === "string" ? args.path : typeof args.file_path === "string" ? args.file_path : null;
	if (!path) return null;
	if (Array.isArray(args.edits) && args.edits.length > 0 && args.edits.every((edit) => typeof edit?.oldText === "string" && typeof edit?.newText === "string")) return {
		path,
		edits: args.edits
	};
	if (typeof args.oldText === "string" && typeof args.newText === "string") return {
		path,
		edits: [{
			oldText: args.oldText,
			newText: args.newText
		}]
	};
	return null;
}
function formatEditCall(args, theme) {
	const invalidArg = invalidArgText(theme);
	const rawPath = str(args?.file_path ?? args?.path);
	const path = rawPath !== null ? shortenPath(rawPath) : null;
	const pathDisplay = path === null ? invalidArg : path ? theme.fg("accent", path) : theme.fg("toolOutput", "...");
	return `${theme.fg("toolTitle", theme.bold("edit"))} ${pathDisplay}`;
}
function formatEditResult(preview, result, theme, isError) {
	const previewDiff = preview && !("error" in preview) ? preview.diff : void 0;
	const previewError = preview && "error" in preview ? preview.error : void 0;
	if (isError) {
		const errorText = result.content.filter((c) => c.type === "text").map((c) => c.text || "").join("\n");
		if (!errorText || errorText === previewError) return;
		return theme.fg("error", errorText);
	}
	const resultDiff = result.details?.changed === true ? result.details.diff : void 0;
	if (resultDiff && resultDiff !== previewDiff) return renderDiff(resultDiff);
}
function getEditHeaderBg(preview, settledError, theme) {
	if (preview) {
		if ("error" in preview) return (text) => theme.bg("toolErrorBg", text);
		return (text) => theme.bg("toolSuccessBg", text);
	}
	if (settledError) return (text) => theme.bg("toolErrorBg", text);
	return (text) => theme.bg("toolPendingBg", text);
}
function buildEditCallComponent(component, args, theme) {
	component.setBgFn(getEditHeaderBg(component.preview, component.settledError, theme));
	component.clear();
	component.addChild(new Text(formatEditCall(args, theme), 0, 0));
	if (!component.preview) return component;
	const body = "error" in component.preview ? theme.fg("error", component.preview.error) : renderDiff(component.preview.diff);
	component.addChild(new Spacer(1));
	component.addChild(new Text(body, 0, 0));
	return component;
}
function setEditPreview(component, preview, argsKey) {
	const current = component.preview;
	const changed = current === void 0 || ("error" in current && "error" in preview ? current.error !== preview.error : "error" in current !== "error" in preview) || !("error" in current) && !("error" in preview) && (current.diff !== preview.diff || current.firstChangedLine !== preview.firstChangedLine);
	component.preview = preview;
	component.previewArgsKey = argsKey;
	component.previewPending = false;
	return changed;
}
function createEditToolDefinition(cwd, options) {
	const ops = options?.operations ?? defaultEditOperations;
	const resolvePath = options?.operations ? resolveToCwd : resolveLocalPathToCwd;
	return {
		name: "edit",
		label: "edit",
		description: "Exact single-file replacements. oldText unique/non-overlapping against original. Merge nearby changes; omit large unchanged spans.",
		promptSnippet: "Exact file edits; multiple disjoint edits per call",
		promptGuidelines: [
			"oldText must match exactly",
			"Multiple disjoint locations: one call, multiple edits[]",
			"Match original file; no overlap/nesting; merge nearby",
			"oldText minimal but unique; no padding"
		],
		parameters: editSchema,
		outputSchema: EditToolOutputSchema,
		renderShell: "self",
		prepareArguments: prepareEditArguments,
		async execute(toolCallId, input, signal, onUpdate, ctx) {
			const { path, edits: originalEdits } = validateEditInput(input);
			const absolutePath = resolvePath(path, cwd);
			return withFileMutationQueueKeyResolution(resolveFileMutationQueueKey(absolutePath, ops.resolveQueueKey, signal), async () => {
				if (signal?.aborted) throw new Error("Operation aborted");
				let realEdits = [];
				let expectedContent;
				try {
					await ops.access(absolutePath);
				} catch (error) {
					const errorMessage = error instanceof Error && "code" in error ? `Error code: ${String(error.code)}` : String(error);
					throw new Error(`Could not edit file: ${path}. ${errorMessage}.`, { cause: error });
				}
				const rawContent = decodeUtf8File(await ops.readFile(absolutePath), absolutePath);
				try {
					if (signal?.aborted) throw new Error("Operation aborted");
					const { bom, text: content } = stripBom(rawContent);
					const normalizedContent = normalizeToLF(content);
					const editSets = splitNoOpEdits(normalizedContent, originalEdits, path);
					const noOpEdits = editSets.noOpEdits;
					realEdits = editSets.realEdits;
					validateNoOpEditTargets(normalizedContent, noOpEdits, realEdits, path);
					if (realEdits.length === 0) return textResult(`No changes made to ${path}. The replacement text is identical to the original.`, { changed: false });
					const { baseContent, newContent, finalContent } = applyEditsPreservingLineEndings(content, realEdits, path);
					expectedContent = bom + finalContent;
					await ops.writeFile(absolutePath, expectedContent);
					if (signal?.aborted) throw new Error("Operation aborted");
					if (!await verifyPersistedUtf8File(absolutePath, expectedContent, ops)) throw new Error(`Edit verification failed for ${path}: the persisted regular file does not match the requested content. Inspect the target and retry.`);
					const diffResult = generateDiffString(baseContent, newContent);
					const patch = generateUnifiedPatch(path, baseContent, newContent);
					return {
						content: [{
							type: "text",
							text: `Successfully replaced ${realEdits.length} block(s) in ${path}.`
						}],
						details: {
							changed: true,
							diff: diffResult.diff,
							patch,
							...diffResult.firstChangedLine === void 0 ? {} : { firstChangedLine: diffResult.firstChangedLine }
						}
					};
				} catch (error) {
					const normalizedError = error instanceof Error ? error : new Error(String(error));
					const currentContent = await ops.readFile(absolutePath).then((current) => current.toString("utf-8")).catch(() => rawContent);
					if (expectedContent !== void 0 && await verifyPersistedUtf8File(absolutePath, expectedContent, ops)) return {
						content: [{
							type: "text",
							text: `Successfully replaced ${realEdits.length} block(s) in ${path}.`
						}],
						details: {
							changed: true,
							diff: "",
							patch: ""
						}
					};
					if (normalizedError.message.includes(EDIT_MISMATCH_MESSAGE)) throw appendMismatchHint(normalizedError, currentContent);
					if (normalizedError instanceof EditNoChangeError) return textResult(`No changes made to ${path}. The replacement produced identical content.`, { changed: false });
					throw normalizedError;
				}
			});
		},
		renderCall(args, theme, context) {
			const component = getEditCallRenderComponent(context.state, context.lastComponent);
			const previewInput = getRenderablePreviewInput(args);
			const argsKey = previewInput ? JSON.stringify({
				path: previewInput.path,
				edits: previewInput.edits
			}) : void 0;
			if (component.previewArgsKey !== argsKey) {
				component.preview = void 0;
				component.previewArgsKey = argsKey;
				component.previewPending = false;
				component.settledError = false;
			}
			if (context.argsComplete && previewInput && !component.preview && !component.previewPending) {
				component.previewPending = true;
				const requestKey = argsKey;
				computeEditsDiff(previewInput.path, previewInput.edits, context.cwd, ops, resolvePath).then((preview) => {
					if (component.previewArgsKey === requestKey) {
						setEditPreview(component, preview, requestKey);
						context.invalidate();
					}
				});
			}
			return buildEditCallComponent(component, args, theme);
		},
		renderResult(result, optionsLocal, theme, context) {
			const callComponent = context.state.callComponent;
			const previewInput = getRenderablePreviewInput(context.args);
			const argsKey = previewInput ? JSON.stringify({
				path: previewInput.path,
				edits: previewInput.edits
			}) : void 0;
			const typedResult = result;
			const resultDiff = !context.isError && typedResult.details?.changed === true ? typedResult.details.diff : void 0;
			let changed = false;
			if (callComponent) {
				if (typeof resultDiff === "string") changed = setEditPreview(callComponent, {
					diff: resultDiff,
					firstChangedLine: typedResult.details?.changed === true ? typedResult.details.firstChangedLine : void 0
				}, argsKey) || changed;
				if (callComponent.settledError !== context.isError) {
					callComponent.settledError = context.isError;
					changed = true;
				}
				if (changed) buildEditCallComponent(callComponent, context.args, theme);
			}
			const output = formatEditResult(callComponent?.preview, typedResult, theme, context.isError);
			const component = context.lastComponent ?? new Container();
			component.clear();
			if (!output) return component;
			component.addChild(new Spacer(1));
			component.addChild(new Text(output, 1, 0));
			return component;
		}
	};
}
function createEditTool(cwd, options) {
	return wrapToolDefinition(createEditToolDefinition(cwd, options));
}
//#endregion
//#region src/agents/sessions/tools/find.ts
/**
* Built-in find session tool.
*
* Searches files by glob through fd/local operations and returns bounded, renderable results.
*/
function isInsideGitRepository(searchPath) {
	for (let current = searchPath;;) {
		if (existsSync(path.join(current, ".git"))) return true;
		const parent = path.dirname(current);
		if (parent === current) return false;
		current = parent;
	}
}
const findSchema = Type.Object({
	pattern: Type.String({ description: "File glob, e.g. **/*.ts." }),
	path: Type.Optional(Type.String({ description: "Search dir; default cwd." })),
	limit: Type.Optional(Type.Integer({ description: "Max results; default 1000." }))
});
const DEFAULT_LIMIT$2 = 1e3;
const defaultFindOperations = {
	exists: existsSync,
	glob: () => []
};
function formatFindCall(args, theme) {
	const pattern = str(args?.pattern);
	const rawPath = str(args?.path);
	const pathLocal = rawPath !== null ? shortenPath(rawPath || ".") : null;
	const limit = args?.limit;
	const invalidArg = invalidArgText(theme);
	let text = theme.fg("toolTitle", theme.bold("find")) + " " + (pattern === null ? invalidArg : theme.fg("accent", pattern || "")) + theme.fg("toolOutput", ` in ${pathLocal === null ? invalidArg : pathLocal}`);
	if (limit !== void 0) text += theme.fg("toolOutput", ` (limit ${limit})`);
	return text;
}
function formatFindResult(result, options, theme, showImages) {
	const resultLimit = result.details?.resultLimitReached;
	return appendSessionToolTruncationWarning(formatSessionToolOutput(result, options, theme, showImages, 20), theme, {
		limit: resultLimit ? {
			count: resultLimit,
			noun: "results"
		} : void 0,
		truncation: result.details?.truncation
	});
}
function buildFindResult(params) {
	const resultLimitReached = params.paths.length > params.effectiveLimit;
	const rawOutput = params.paths.slice(0, params.effectiveLimit).map((foundPath) => {
		const normalized = normalizeNativePathSeparators(foundPath);
		const relativePath = path.isAbsolute(foundPath) ? normalizeNativePathSeparators(path.relative(params.searchPath, foundPath) || ".") : normalized;
		return normalized.endsWith("/") && !relativePath.endsWith("/") ? `${relativePath}/` : relativePath;
	}).join("\n");
	const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER });
	let resultOutput = truncation.content;
	const details = {};
	const notices = [];
	if (resultLimitReached) {
		notices.push(params.limitNotice);
		details.resultLimitReached = params.effectiveLimit;
	}
	if (truncation.truncated) {
		notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
		details.truncation = truncation;
	}
	if (notices.length > 0) resultOutput += `\n\n[${notices.join(". ")}]`;
	return {
		content: [{
			type: "text",
			text: resultOutput
		}],
		details: Object.keys(details).length > 0 ? details : void 0
	};
}
function createFindToolDefinition(cwd, options) {
	const customOps = options?.operations;
	const resolvePath = customOps ? resolveToCwd : resolveLocalPathToCwd;
	return {
		name: "find",
		label: "find",
		description: `Find by glob; paths relative to search dir. Respects .gitignore. Caps ${DEFAULT_LIMIT$2} results/${DEFAULT_MAX_BYTES / 1024}KB.`,
		promptSnippet: "Find files by glob pattern (respects .gitignore)",
		parameters: findSchema,
		async execute(toolCallId, { pattern, path: searchDir, limit }, signal, onUpdate, ctx) {
			return new Promise((resolve, reject) => {
				if (signal?.aborted) {
					reject(/* @__PURE__ */ new Error("Operation aborted"));
					return;
				}
				let settled = false;
				let stopChild;
				const settle = (fn) => {
					if (settled) return;
					settled = true;
					signal?.removeEventListener("abort", onAbort);
					stopChild = void 0;
					fn();
				};
				const onAbort = () => {
					stopChild?.();
					settle(() => reject(/* @__PURE__ */ new Error("Operation aborted")));
				};
				signal?.addEventListener("abort", onAbort, { once: true });
				(async () => {
					try {
						if (Number.isFinite(limit) && !Number.isInteger(limit)) {
							settle(() => reject(/* @__PURE__ */ new Error("Limit must be an integer")));
							return;
						}
						const searchPath = resolvePath(searchDir || ".", cwd);
						const effectiveLimit = normalizePositiveLimit(limit, DEFAULT_LIMIT$2);
						const observationLimit = effectiveLimit + 1;
						const ops = customOps ?? defaultFindOperations;
						if (customOps?.glob) {
							if (!await ops.exists(searchPath)) {
								settle(() => reject(/* @__PURE__ */ new Error(`Path not found: ${searchPath}`)));
								return;
							}
							if (signal?.aborted) {
								settle(() => reject(/* @__PURE__ */ new Error("Operation aborted")));
								return;
							}
							const results = await ops.glob(pattern, searchPath, {
								ignore: ["**/node_modules/**", "**/.git/**"],
								limit: observationLimit
							});
							if (signal?.aborted) {
								settle(() => reject(/* @__PURE__ */ new Error("Operation aborted")));
								return;
							}
							if (results.length === 0) {
								settle(() => resolve({
									content: [{
										type: "text",
										text: "No files found matching pattern"
									}],
									details: void 0
								}));
								return;
							}
							settle(() => resolve(buildFindResult({
								paths: results,
								searchPath,
								effectiveLimit,
								limitNotice: `${effectiveLimit} results limit reached`
							})));
							return;
						}
						const fdPath = await ensureTool("fd", true);
						if (signal?.aborted) {
							settle(() => reject(/* @__PURE__ */ new Error("Operation aborted")));
							return;
						}
						if (!fdPath) {
							settle(() => reject(/* @__PURE__ */ new Error("fd is not available and could not be downloaded")));
							return;
						}
						const args = [
							"--glob",
							"--color=never",
							"--hidden"
						];
						if (!isInsideGitRepository(searchPath)) args.push("--no-require-git");
						args.push("--max-results", String(observationLimit));
						let effectivePattern = pattern;
						if (pattern.includes("/")) {
							args.push("--full-path");
							if (!pattern.startsWith("/") && !pattern.startsWith("**/") && pattern !== "**") effectivePattern = `**/${pattern}`;
						}
						args.push("--", effectivePattern, searchPath);
						const child = spawnCommand([fdPath, ...args], {
							buffer: false,
							reject: false,
							stdio: [
								"ignore",
								"pipe",
								"pipe"
							]
						});
						releaseChildProcessOutputAfterExit(child.nodeChildProcess);
						const rl = createInterface({ input: child.stdout });
						let stderr = "";
						let stderrDroppedBytes = 0;
						const lines = [];
						stopChild = () => {
							if (!child.nodeChildProcess.killed) child.kill();
						};
						const cleanup = () => {
							rl.close();
						};
						const onStreamError = (stream, error) => {
							if (settled) return;
							stopChild?.();
							cleanup();
							settle(() => reject(/* @__PURE__ */ new Error(`fd ${stream} error: ${error.message}`)));
						};
						child.stderr?.setEncoding("utf8");
						child.stderr?.on("data", (chunk) => {
							const appended = appendBoundedTextTail(stderr, chunk);
							stderr = appended.tail;
							stderrDroppedBytes += appended.droppedBytes;
						});
						rl.on("error", (error) => onStreamError("stdout", error));
						child.stdout?.on("error", (error) => onStreamError("stdout", error));
						child.stderr?.on("error", (error) => onStreamError("stderr", error));
						rl.on("line", (line) => {
							lines.push(line);
						});
						child.nodeChildProcess.on("error", (error) => {
							cleanup();
							settle(() => reject(/* @__PURE__ */ new Error(`Failed to run fd: ${error.message}`)));
						});
						child.nodeChildProcess.on("close", (code) => {
							cleanup();
							if (signal?.aborted) {
								settle(() => reject(/* @__PURE__ */ new Error("Operation aborted")));
								return;
							}
							const output = lines.join("\n");
							if (code !== 0) {
								const fallback = `fd exited with code ${code}`;
								const errorMsg = formatStderrTail(stderr, stderrDroppedBytes, fallback);
								settle(() => reject(new Error(errorMsg)));
								return;
							}
							if (!output) {
								settle(() => resolve({
									content: [{
										type: "text",
										text: "No files found matching pattern"
									}],
									details: void 0
								}));
								return;
							}
							settle(() => resolve(buildFindResult({
								paths: lines,
								searchPath,
								effectiveLimit,
								limitNotice: `${effectiveLimit} results limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`
							})));
						});
					} catch (e) {
						if (signal?.aborted) {
							settle(() => reject(/* @__PURE__ */ new Error("Operation aborted")));
							return;
						}
						const error = e instanceof Error ? e : new Error(String(e));
						settle(() => reject(error));
					}
				})();
			});
		},
		renderCall(args, theme, context) {
			return reuseTextComponent(context.lastComponent, formatFindCall(args, theme));
		},
		renderResult(result, optionsLocal, theme, context) {
			const content = formatFindResult(result, optionsLocal, theme, context.showImages);
			return reuseTextComponent(context.lastComponent, content);
		}
	};
}
function createFindTool(cwd, options) {
	return wrapToolDefinition(createFindToolDefinition(cwd, options));
}
//#endregion
//#region src/agents/sessions/tools/grep.ts
/**
* Built-in grep session tool.
*
* Searches files with ripgrep/local operations, optional context, and bounded output rendering.
*/
const grepSchema = Type.Object({
	pattern: Type.String({ description: "Regex/literal pattern." }),
	path: Type.Optional(Type.String({ description: "File/dir; default cwd." })),
	glob: Type.Optional(Type.String({ description: "File glob, e.g. *.ts." })),
	ignoreCase: Type.Optional(Type.Boolean({ description: "Ignore case; default false." })),
	literal: Type.Optional(Type.Boolean({ description: "Literal, not regex; default false." })),
	context: Type.Optional(Type.Number({ description: "Context lines each side; default 0." })),
	limit: Type.Optional(Type.Number({ description: "Max matches; default 100." }))
});
const DEFAULT_LIMIT$1 = 100;
function decodeRipgrepJsonText(value) {
	return value?.text ?? (value?.bytes === void 0 ? void 0 : Buffer.from(value.bytes, "base64").toString("utf8"));
}
function formatGrepCall(args, theme) {
	const pattern = str(args?.pattern);
	const rawPath = str(args?.path);
	const pathLocal = rawPath !== null ? shortenPath(rawPath || ".") : null;
	const glob = str(args?.glob);
	const limit = args?.limit;
	const invalidArg = invalidArgText(theme);
	let text = theme.fg("toolTitle", theme.bold("grep")) + " " + (pattern === null ? invalidArg : theme.fg("accent", `/${pattern || ""}/`)) + theme.fg("toolOutput", ` in ${pathLocal === null ? invalidArg : pathLocal}`);
	if (glob) text += theme.fg("toolOutput", ` (${glob})`);
	if (limit !== void 0) text += theme.fg("toolOutput", ` limit ${limit}`);
	return text;
}
function formatGrepResult(result, options, theme, showImages) {
	const matchLimit = result.details?.matchLimitReached;
	const linesTruncated = result.details?.linesTruncated;
	return appendSessionToolTruncationWarning(formatSessionToolOutput(result, options, theme, showImages, 15), theme, {
		limit: matchLimit ? {
			count: matchLimit,
			noun: "matches"
		} : void 0,
		truncation: result.details?.truncation,
		additionalWarnings: linesTruncated ? ["some lines truncated"] : void 0
	});
}
function createGrepToolDefinition(cwd, options) {
	const customOps = options?.operations;
	const resolvePath = customOps ? resolveToCwd : resolveLocalPathToCwd;
	return {
		name: "grep",
		label: "grep",
		description: `Search contents; returns path:line matches. Respects .gitignore. Caps ${DEFAULT_LIMIT$1} matches/${DEFAULT_MAX_BYTES / 1024}KB; lines cap 500 chars.`,
		promptSnippet: "Search file contents for patterns (respects .gitignore)",
		parameters: grepSchema,
		async execute(toolCallId, { pattern, path: searchDir, glob, ignoreCase, literal, context, limit }, signal, onUpdate, ctx) {
			return new Promise((resolve, reject) => {
				let settled = false;
				let child;
				let childClosed = false;
				let rl;
				let killedDueToLimit = false;
				const cleanup = () => {
					rl?.close();
					signal?.removeEventListener("abort", onAbort);
				};
				const settle = (fn) => {
					if (settled) return false;
					settled = true;
					cleanup();
					fn();
					return true;
				};
				const stopChild = (dueToLimit = false) => {
					if (child && !childClosed && !child.nodeChildProcess.killed) {
						killedDueToLimit = dueToLimit;
						child.kill();
					}
				};
				const onAbort = () => {
					if (settle(() => reject(/* @__PURE__ */ new Error("Operation aborted")))) stopChild();
				};
				signal?.addEventListener("abort", onAbort, { once: true });
				if (signal?.aborted) {
					onAbort();
					return;
				}
				(async () => {
					try {
						const rgPath = await ensureTool("rg", true);
						if (settled) return;
						if (!rgPath) {
							settle(() => reject(/* @__PURE__ */ new Error("ripgrep (rg) is not available and could not be downloaded")));
							return;
						}
						const searchPath = resolvePath(searchDir || ".", cwd);
						let isDirectory;
						try {
							isDirectory = await (customOps?.isDirectory(searchPath) ?? statSync(searchPath).isDirectory());
						} catch {
							settle(() => reject(/* @__PURE__ */ new Error(`Path not found: ${searchPath}`)));
							return;
						}
						if (settled) return;
						const contextValue = resolveNonNegativeIntegerOption(context, 0);
						const effectiveLimit = normalizePositiveLimit(limit, DEFAULT_LIMIT$1);
						const formatPath = (filePath) => {
							const relative = isDirectory ? path.relative(searchPath, filePath) : "";
							return relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) ? normalizeNativePathSeparators(relative) : path.basename(filePath);
						};
						const args = [
							"--json",
							"--line-number",
							"--color=never",
							"--hidden"
						];
						if (!customOps && contextValue > 0) args.push("--context", String(contextValue));
						if (ignoreCase) args.push("--ignore-case");
						if (literal) args.push("--fixed-strings");
						if (glob) args.push("--glob", glob);
						args.push("--", pattern, searchPath);
						if (settled) return;
						const spawnedChild = spawnCommand([rgPath, ...args], {
							buffer: false,
							reject: false,
							stdio: [
								"ignore",
								"pipe",
								"pipe"
							]
						});
						releaseChildProcessOutputAfterExit(spawnedChild.nodeChildProcess);
						child = spawnedChild;
						rl = createInterface({ input: spawnedChild.stdout });
						let stderr = "";
						let stderrDroppedBytes = 0;
						let matchCount = 0;
						let matchLimitReached = false;
						let linesTruncated = false;
						const outputLines = [];
						spawnedChild.stderr?.setEncoding("utf8");
						spawnedChild.stderr?.on("data", (chunk) => {
							const appended = appendBoundedTextTail(stderr, chunk);
							stderr = appended.tail;
							stderrDroppedBytes += appended.droppedBytes;
						});
						const onStreamError = (stream, error) => {
							if (settled) return;
							if (settle(() => reject(/* @__PURE__ */ new Error(`ripgrep ${stream} error: ${error.message}`)))) stopChild();
						};
						rl.on("error", (error) => onStreamError("stdout", error));
						spawnedChild.stdout?.on("error", (error) => onStreamError("stdout", error));
						spawnedChild.stderr?.on("error", (error) => onStreamError("stderr", error));
						const matches = [];
						const nativeFiles = /* @__PURE__ */ new Map();
						rl.on("line", (line) => {
							if (!line.trim() || settled || killedDueToLimit) return;
							let event;
							try {
								event = JSON.parse(line);
							} catch {
								return;
							}
							const filePath = decodeRipgrepJsonText(event.data?.path);
							const pathIdentity = JSON.stringify(event.data?.path);
							const lineNumber = event.data?.line_number;
							const lineText = event.data?.lines?.text;
							if (event.type === "match") {
								matchCount++;
								matchLimitReached = matchCount > effectiveLimit;
								if (!matchLimitReached && filePath && pathIdentity && typeof lineNumber === "number") matches.push({
									filePath,
									pathIdentity,
									lineNumber,
									lineText
								});
							}
							const lastMatch = matches.at(-1);
							const windowEnd = (lastMatch?.lineNumber ?? 0) + contextValue;
							const inLastWindow = pathIdentity === lastMatch?.pathIdentity && typeof lineNumber === "number" && lineNumber <= windowEnd;
							if (pathIdentity && typeof lineNumber === "number" && (matchCount < effectiveLimit || inLastWindow)) {
								const text = lineText ?? (!customOps ? decodeRipgrepJsonText(event.data?.lines) : void 0);
								if (text !== void 0) {
									const lines = nativeFiles.get(pathIdentity) ?? /* @__PURE__ */ new Map();
									lines.set(lineNumber, text);
									nativeFiles.set(pathIdentity, lines);
								}
							}
							if (matchLimitReached && (customOps || !inLastWindow || lineNumber === windowEnd)) stopChild(true);
						});
						spawnedChild.nodeChildProcess.on("error", (error) => {
							childClosed = true;
							settle(() => reject(/* @__PURE__ */ new Error(`Failed to run ripgrep: ${error.message}`)));
						});
						spawnedChild.nodeChildProcess.on("close", (code) => {
							childClosed = true;
							(async () => {
								if (settled) return;
								if (!killedDueToLimit && code !== 0 && code !== 1) {
									const fallback = `ripgrep exited with code ${code}`;
									const errorMsg = formatStderrTail(stderr, stderrDroppedBytes, fallback);
									settle(() => reject(new Error(errorMsg)));
									return;
								}
								if (matchCount === 0) {
									settle(() => resolve({
										content: [{
											type: "text",
											text: "No matches found"
										}],
										details: void 0
									}));
									return;
								}
								const fileCache = /* @__PURE__ */ new Map();
								for (const { filePath, pathIdentity, lineNumber, lineText: matchText } of matches) {
									const relativePath = formatPath(filePath);
									let customLines;
									if (customOps && (contextValue > 0 || matchText === void 0)) {
										customLines = fileCache.get(filePath);
										if (!customLines) {
											try {
												customLines = (await customOps.readFile(filePath)).replace(/\r\n?/g, "\n").split("\n");
											} catch {
												customLines = [];
											}
											fileCache.set(filePath, customLines);
										}
										if (settled) return;
										if (!customLines.length) {
											outputLines.push(`${relativePath}:${lineNumber}: (unable to read file)`);
											continue;
										}
									}
									const nativeLines = nativeFiles.get(pathIdentity);
									for (let current = Math.max(1, lineNumber - contextValue); current <= lineNumber + contextValue; current++) {
										const lineText = customLines ? customLines[current - 1] : nativeLines?.get(current);
										if (lineText === void 0) break;
										const { text, wasTruncated } = truncateLine(lineText.replace(/\r/g, "").replace(/\n$/, ""));
										linesTruncated ||= wasTruncated;
										const separator = current === lineNumber ? ":" : "-";
										outputLines.push(`${relativePath}${separator}${current}${separator} ${text}`);
									}
								}
								const rawOutput = outputLines.join("\n");
								const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER });
								let output = truncation.content;
								const details = {};
								const notices = [];
								if (matchLimitReached) {
									notices.push(`${effectiveLimit} matches limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`);
									details.matchLimitReached = effectiveLimit;
								}
								if (truncation.truncated) {
									notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
									details.truncation = truncation;
								}
								if (linesTruncated) {
									notices.push(`Some lines truncated to 500 chars. Use read tool to see full lines`);
									details.linesTruncated = true;
								}
								if (notices.length > 0) output += `\n\n[${notices.join(". ")}]`;
								settle(() => resolve({
									content: [{
										type: "text",
										text: output
									}],
									details: Object.keys(details).length > 0 ? details : void 0
								}));
							})().catch((err) => {
								settle(() => reject(err));
							});
						});
					} catch (err) {
						if (settle(() => reject(err))) stopChild();
					}
				})();
			});
		},
		renderCall(args, theme, context) {
			return reuseTextComponent(context.lastComponent, formatGrepCall(args, theme));
		},
		renderResult(result, optionsLocal, theme, context) {
			const content = formatGrepResult(result, optionsLocal, theme, context.showImages);
			return reuseTextComponent(context.lastComponent, content);
		}
	};
}
function createGrepTool(cwd, options) {
	return wrapToolDefinition(createGrepToolDefinition(cwd, options));
}
//#endregion
//#region src/agents/sessions/tools/ls.ts
/**
* Built-in ls session tool.
*
* Lists directory entries through local or injected operations with bounded output rendering.
*/
const lsSchema = Type.Object({
	path: Type.Optional(Type.String({ description: "Directory; default cwd." })),
	limit: Type.Optional(Type.Number({ description: "Max entries; default 500." }))
});
const DEFAULT_LIMIT = 500;
const defaultLsOperations = {
	exists: existsSync,
	stat: statSync,
	readdir: readdirSync
};
function formatLsCall(args, theme) {
	const rawPath = str(args?.path);
	const path = rawPath !== null ? shortenPath(rawPath || ".") : null;
	const limit = args?.limit;
	const invalidArg = invalidArgText(theme);
	let text = `${theme.fg("toolTitle", theme.bold("ls"))} ${path === null ? invalidArg : theme.fg("accent", path)}`;
	if (limit !== void 0) text += theme.fg("toolOutput", ` (limit ${limit})`);
	return text;
}
function formatLsResult(result, options, theme, showImages) {
	const entryLimit = result.details?.entryLimitReached;
	return appendSessionToolTruncationWarning(formatSessionToolOutput(result, options, theme, showImages, 20), theme, {
		limit: entryLimit ? {
			count: entryLimit,
			noun: "entries"
		} : void 0,
		truncation: result.details?.truncation
	});
}
function createLsToolDefinition(cwd, options) {
	const ops = options?.operations ?? defaultLsOperations;
	const resolvePath = options?.operations ? resolveToCwd : resolveLocalPathToCwd;
	return {
		name: "ls",
		label: "ls",
		description: `List dir alphabetically; / marks dirs; includes dotfiles. Caps ${DEFAULT_LIMIT} entries/${DEFAULT_MAX_BYTES / 1024}KB.`,
		promptSnippet: "List directory contents",
		parameters: lsSchema,
		async execute(toolCallId, { path: path$2, limit }, signal, onUpdate, ctx) {
			if (signal?.aborted) throw new Error("Operation aborted");
			const runListing = async () => {
				try {
					const dirPath = resolvePath(path$2 || ".", cwd);
					const effectiveLimit = normalizePositiveLimit(limit, DEFAULT_LIMIT);
					if (!await ops.exists(dirPath)) throw new Error(`Path not found: ${dirPath}`);
					if (!(await ops.stat(dirPath)).isDirectory()) throw new Error(`Not a directory: ${dirPath}`);
					let entries;
					try {
						entries = await ops.readdir(dirPath);
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						throw new Error(`Cannot read directory: ${message}`, { cause: error });
					}
					entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
					const results = [];
					let entryLimitReached = false;
					for (const entry of entries) {
						if (results.length >= effectiveLimit) {
							entryLimitReached = true;
							break;
						}
						const fullPath = path.join(dirPath, entry);
						let suffix = "";
						try {
							if ((await ops.stat(fullPath)).isDirectory()) suffix = "/";
						} catch {}
						results.push(entry + suffix);
					}
					if (results.length === 0) return {
						content: [{
							type: "text",
							text: "(empty directory)"
						}],
						details: void 0
					};
					const rawOutput = results.join("\n");
					const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER });
					let output = truncation.content;
					const details = {};
					const notices = [];
					if (entryLimitReached) {
						notices.push(`${effectiveLimit} entries limit reached. Use limit=${effectiveLimit * 2} for more`);
						details.entryLimitReached = effectiveLimit;
					}
					if (truncation.truncated) {
						notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
						details.truncation = truncation;
					}
					if (notices.length > 0) output += `\n\n[${notices.join(". ")}]`;
					return {
						content: [{
							type: "text",
							text: output
						}],
						details: Object.keys(details).length > 0 ? details : void 0
					};
				} catch (e) {
					throw toErrorObject(e, "Non-Error rejection");
				}
			};
			if (!signal) return await runListing();
			let onAbort;
			const abortPromise = new Promise((_resolve, reject) => {
				onAbort = () => reject(/* @__PURE__ */ new Error("Operation aborted"));
				signal.addEventListener("abort", onAbort, { once: true });
				if (signal.aborted) onAbort();
			});
			try {
				return await Promise.race([runListing(), abortPromise]);
			} finally {
				if (onAbort) signal.removeEventListener("abort", onAbort);
			}
		},
		renderCall(args, theme, context) {
			return reuseTextComponent(context.lastComponent, formatLsCall(args, theme));
		},
		renderResult(result, optionsLocal, theme, context) {
			const content = formatLsResult(result, optionsLocal, theme, context.showImages);
			return reuseTextComponent(context.lastComponent, content);
		}
	};
}
function createLsTool(cwd, options) {
	return wrapToolDefinition(createLsToolDefinition(cwd, options));
}
//#endregion
//#region src/agents/utils/image-resize.ts
const INLINE_IMAGE_MIME_TYPES = /* @__PURE__ */ new Set([
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp"
]);
function baseMimeType(mimeType) {
	const normalized = mimeType?.split(";")[0]?.trim().toLowerCase();
	return normalized === "image/jpg" ? "image/jpeg" : normalized ?? "";
}
async function normalizeImageForProvider(image) {
	const mimeType = baseMimeType(image.mimeType);
	if (INLINE_IMAGE_MIME_TYPES.has(mimeType)) return { image: {
		...image,
		mimeType
	} };
	try {
		return {
			image: {
				type: "image",
				data: (await convertImageToPng(Buffer.from(image.data, "base64"))).toString("base64"),
				mimeType: "image/png"
			},
			convertedFrom: mimeType || image.mimeType
		};
	} catch {
		return null;
	}
}
/** Normalize image formats for model input, then enforce inline size limits when enabled. */
async function processImage(image, options) {
	const normalized = await normalizeImageForProvider(image);
	if (!normalized) return {
		ok: false,
		message: "[Image omitted: could not be converted to a supported inline image format.]"
	};
	const hints = [];
	if (normalized.convertedFrom) hints.push(`[Image converted from ${normalized.convertedFrom} to image/png.]`);
	if (!options.autoResizeImages) return {
		ok: true,
		image: normalized.image,
		hints
	};
	const resized = await resizeImage(normalized.image);
	if (!resized) return {
		ok: false,
		message: "[Image omitted: could not be resized below the inline image size limit.]"
	};
	const dimensionNote = formatDimensionNote(resized);
	if (dimensionNote) hints.push(dimensionNote);
	return {
		ok: true,
		image: {
			type: "image",
			data: resized.data,
			mimeType: resized.mimeType
		},
		hints
	};
}
const MAX_IMAGE_WIDTH = 2e3;
const MAX_IMAGE_HEIGHT = 2e3;
const MAX_IMAGE_BASE64_BYTES = 4718592;
const JPEG_QUALITY = 80;
function orientedDimensions(probe) {
	return probe.orientation && probe.orientation >= 5 && probe.orientation <= 8 ? {
		width: probe.height,
		height: probe.width
	} : {
		width: probe.width,
		height: probe.height
	};
}
/**
* Resize an image to fit within the inline dimensions and base64 payload limit.
* Returns null if Rastermill cannot produce output within those limits.
*
* Uses Rastermill for image processing. If no Rastermill backend is available,
* returns null.
*
* Strategy for staying under the inline limits:
* 1. First resize to the maximum dimensions
* 2. Let Rastermill choose JPEG or PNG for the image transparency profile
* 3. If still too large, search decreasing quality/compression settings
* 4. If still too large, progressively reduce dimensions
*/
async function resizeImage(img) {
	const inputBuffer = Buffer.from(img.data, "base64");
	const inputBase64Size = Buffer.byteLength(img.data, "utf-8");
	const processor = createImageProcessor();
	try {
		const probe = await processor.probe(inputBuffer);
		if (!probe) return null;
		const { width: originalWidth, height: originalHeight } = orientedDimensions(probe);
		if (originalWidth <= MAX_IMAGE_WIDTH && originalHeight <= MAX_IMAGE_HEIGHT && inputBase64Size <= MAX_IMAGE_BASE64_BYTES) return {
			data: img.data,
			mimeType: img.mimeType,
			originalWidth,
			originalHeight,
			width: originalWidth,
			height: originalHeight,
			wasResized: false
		};
		const qualitySteps = [
			JPEG_QUALITY,
			85,
			70,
			55,
			40,
			35
		];
		const output = await processor.encode(inputBuffer, {
			format: "auto",
			limits: {
				maxWidth: MAX_IMAGE_WIDTH,
				maxHeight: MAX_IMAGE_HEIGHT
			},
			maxBase64Bytes: MAX_IMAGE_BASE64_BYTES,
			opaque: {
				format: "jpeg",
				quality: JPEG_QUALITY
			},
			transparent: { format: "png" },
			search: {
				quality: qualitySteps,
				compressionLevel: [6, 9]
			}
		});
		if (output.withinBudget !== true) return null;
		return {
			data: output.data.toString("base64"),
			mimeType: output.mimeType,
			originalWidth,
			originalHeight,
			width: output.width,
			height: output.height,
			wasResized: output.resized
		};
	} catch {
		return null;
	}
}
/**
* Format a dimension note for resized images.
* This helps the model understand the coordinate mapping.
*/
function formatDimensionNote(result) {
	if (!result.wasResized) return;
	const scale = result.originalWidth / result.width;
	return `[Image: original ${result.originalWidth}x${result.originalHeight}, displayed at ${result.width}x${result.height}. Multiply coordinates by ${scale.toFixed(2)} to map to original image.]`;
}
//#endregion
//#region src/agents/utils/mime.ts
/**
* Lightweight MIME sniffing helpers for agent image inputs.
*
* The checks here avoid trusting file extensions and reject unsupported image
* variants before provider upload paths try to process them.
*/
const PNG_SIGNATURE = [
	137,
	80,
	78,
	71,
	13,
	10,
	26,
	10
];
/** Detects supported image MIME types from leading file bytes. */
function detectSupportedImageMimeType(buffer) {
	if (startsWith(buffer, [
		255,
		216,
		255
	])) return buffer[3] === 247 ? null : "image/jpeg";
	if (startsWith(buffer, PNG_SIGNATURE)) return isPng(buffer) && !isAnimatedPng(buffer) ? "image/png" : null;
	if (startsWithAscii(buffer, 0, "GIF")) return "image/gif";
	if (startsWithAscii(buffer, 0, "RIFF") && startsWithAscii(buffer, 8, "WEBP")) return "image/webp";
	if (startsWithAscii(buffer, 0, "BM") && isBmp(buffer)) return "image/bmp";
	return null;
}
function isPng(buffer) {
	return buffer.length >= 16 && readUint32BE(buffer, PNG_SIGNATURE.length) === 13 && startsWithAscii(buffer, 12, "IHDR");
}
function isAnimatedPng(buffer) {
	let offset = PNG_SIGNATURE.length;
	while (offset + 8 <= buffer.length) {
		const chunkLength = readUint32BE(buffer, offset);
		const chunkTypeOffset = offset + 4;
		if (startsWithAscii(buffer, chunkTypeOffset, "acTL")) return true;
		if (startsWithAscii(buffer, chunkTypeOffset, "IDAT")) return false;
		const nextOffset = offset + 8 + chunkLength + 4;
		if (nextOffset <= offset || nextOffset > buffer.length) return false;
		offset = nextOffset;
	}
	return false;
}
function isBmp(buffer) {
	if (buffer.length < 26) return false;
	const declaredFileSize = readUint32LE(buffer, 2);
	const pixelDataOffset = readUint32LE(buffer, 10);
	const dibHeaderSize = readUint32LE(buffer, 14);
	if (declaredFileSize !== 0 && declaredFileSize < 26) return false;
	if (pixelDataOffset < 14 + dibHeaderSize) return false;
	if (declaredFileSize !== 0 && pixelDataOffset >= declaredFileSize) return false;
	let colorPlanes;
	let bitsPerPixel;
	if (dibHeaderSize === 12) {
		colorPlanes = readUint16LE(buffer, 22);
		bitsPerPixel = readUint16LE(buffer, 24);
	} else if (dibHeaderSize >= 40 && dibHeaderSize <= 124) {
		if (buffer.length < 30) return false;
		colorPlanes = readUint16LE(buffer, 26);
		bitsPerPixel = readUint16LE(buffer, 28);
	} else return false;
	return colorPlanes === 1 && [
		1,
		4,
		8,
		16,
		24,
		32
	].includes(bitsPerPixel);
}
function readUint16LE(buffer, offset) {
	return (buffer[offset] ?? 0) + ((buffer[offset + 1] ?? 0) << 8);
}
function readUint32BE(buffer, offset) {
	return (buffer[offset] ?? 0) * 16777216 + ((buffer[offset + 1] ?? 0) << 16) + ((buffer[offset + 2] ?? 0) << 8) + (buffer[offset + 3] ?? 0);
}
function readUint32LE(buffer, offset) {
	return (buffer[offset] ?? 0) + ((buffer[offset + 1] ?? 0) << 8) + ((buffer[offset + 2] ?? 0) << 16) + (buffer[offset + 3] ?? 0) * 16777216;
}
function startsWith(buffer, bytes) {
	if (buffer.length < bytes.length) return false;
	return bytes.every((byte, index) => buffer[index] === byte);
}
function startsWithAscii(buffer, offset, text) {
	if (buffer.length < offset + text.length) return false;
	for (let index = 0; index < text.length; index++) if (buffer[offset + index] !== text.charCodeAt(index)) return false;
	return true;
}
//#endregion
//#region src/agents/sessions/tools/read-page.ts
/** Format model-visible pagination guidance from its exact structured continuation. */
function formatReadContinuationNotice(continuation, maxBytes, range) {
	const cursor = continuation.kind === "cursor" ? `, cursor=${continuation.cursor}` : "";
	const limit = continuation.limit === void 0 ? "" : `, limit=${continuation.limit}`;
	if (!range) return `\n\n[Read output capped at ${formatSize(maxBytes).replace(/\.0(?=KB)/, "")} for this call. Use offset=${continuation.offset}${cursor}${limit} to continue.]`;
	const label = continuation.kind === "cursor" ? `part of line ${range.startLine}` : `lines ${range.startLine}-${continuation.offset - 1} of ${range.totalLines}`;
	const action = continuation.kind === "cursor" ? "Use read with" : "Use";
	return `\n\n[Showing ${label} (${formatSize(maxBytes)} limit). ${action} offset=${continuation.offset}${cursor}${limit} to continue.]`;
}
/** Bound a selected text page once; legacy injected readers reuse this owner decision. */
function createBoundedReadTextPage(params) {
	const maxBytes = params.pageMaxBytes ?? Math.min(51200, params.maxBytes);
	const remainingLines = params.totalLines - params.endLine;
	const limitNotice = params.limit !== void 0 && remainingLines > 0 ? `\n\n[${remainingLines} more lines in file. Use offset=${params.endLine + 1} to continue.]` : "";
	const contentBytes = Buffer.byteLength(params.content, "utf8");
	const resultPrefix = params.prefix ?? "";
	if (params.endLine - params.startLine < 2e3 && contentBytes + Buffer.byteLength(limitNotice, "utf8") <= maxBytes && toolResultFitsBudget(`${resultPrefix}${params.content}${limitNotice}`, params.modelBudget)) return {
		kind: "text",
		content: `${params.content}${limitNotice}`
	};
	const range = params.adaptive ? void 0 : {
		startLine: params.startLine,
		totalLines: params.totalLines
	};
	const boundedLimit = params.limit === void 0 ? {} : { limit: params.limit };
	const firstLine = params.content.split("\n", 1)[0] ?? "";
	const cursorEstimate = {
		kind: "cursor",
		offset: params.startLine,
		cursor: (params.cursor ?? 0) + firstLine.length,
		...boundedLimit
	};
	const lineEstimate = {
		kind: "line",
		offset: params.totalLines + 1,
		...boundedLimit
	};
	const reservedBytes = Math.max(Buffer.byteLength(formatReadContinuationNotice(cursorEstimate, params.maxBytes, range), "utf8"), Buffer.byteLength(formatReadContinuationNotice(lineEstimate, params.maxBytes, range), "utf8"));
	let prefix = truncateUtf8Prefix(params.content, Math.max(0, maxBytes - reservedBytes));
	if (params.modelBudget) {
		prefix = sliceToolResultTextToBudget(prefix, params.modelBudget.maxChars - reservedBytes - estimateToolResultTextChars(resultPrefix));
		prefix = sliceToolResultTextToBudget(prefix, params.modelBudget.maxContextChars - reservedBytes * 2 - estimateToolResultTextChars(resultPrefix, { minimumRawWeight: 2 }), { minimumRawWeight: 2 });
	}
	const contentBudgetBytes = Buffer.byteLength(prefix, "utf8");
	const truncation = truncateHead(params.content, { maxBytes: contentBudgetBytes });
	if (!truncation.truncated) return {
		kind: "text",
		content: `${truncation.content}${limitNotice}`
	};
	let continuation;
	let content = truncation.content;
	if (truncation.firstLineExceedsLimit) {
		content = truncateUtf8Prefix(firstLine, contentBudgetBytes);
		continuation = {
			kind: "cursor",
			offset: params.startLine,
			cursor: (params.cursor ?? 0) + content.length,
			...boundedLimit
		};
	} else {
		const nextOffset = params.startLine + truncation.outputLines;
		continuation = {
			kind: "line",
			offset: nextOffset,
			...params.limit === void 0 ? {} : { limit: Math.max(1, params.endLine - nextOffset + 1) }
		};
	}
	const { content: _content, ...truncationDetails } = truncation;
	return {
		kind: "truncated",
		content: `${content}${formatReadContinuationNotice(continuation, params.maxBytes, range)}`,
		truncation: {
			...truncationDetails,
			outputBytes: Buffer.byteLength(content, "utf8"),
			firstLineExceedsLimit: false,
			lastLinePartial: continuation.kind === "cursor",
			totalLines: params.totalLines
		},
		continuation
	};
}
//#endregion
//#region src/agents/sessions/tools/read-tool-contract.ts
const readToolInputSchema = Type.Object({
	path: Type.String({ description: "File path; relative/absolute." }),
	offset: Type.Optional(Type.Integer({
		minimum: 1,
		description: "Start line; 1-based."
	})),
	limit: Type.Optional(Type.Number({ description: "Max lines." })),
	cursor: Type.Optional(Type.Integer({
		minimum: 0,
		description: "Character position within the start line; 0-based."
	})),
	optional: Type.Optional(Type.Literal(true, { description: "Missing paths return structured not_found instead of failing." }))
});
const readTruncationOutputSchema = Type.Object({
	truncated: Type.Literal(true),
	truncatedBy: Type.Union([Type.Literal("lines"), Type.Literal("bytes")]),
	totalLines: Type.Integer({ minimum: 0 }),
	totalBytes: Type.Integer({ minimum: 0 }),
	outputLines: Type.Integer({ minimum: 0 }),
	outputBytes: Type.Integer({ minimum: 0 }),
	lastLinePartial: Type.Boolean(),
	firstLineExceedsLimit: Type.Boolean(),
	maxLines: Type.Integer({ minimum: 1 }),
	maxBytes: Type.Integer({ minimum: 1 })
}, { additionalProperties: false });
const readToolOutputSchema = Type.Union([
	Type.Object({
		kind: Type.Literal("text"),
		content: Type.String()
	}, { additionalProperties: false }),
	Type.Object({
		kind: Type.Literal("image"),
		content: Type.String(),
		mimeType: Type.String()
	}, { additionalProperties: false }),
	Type.Object({
		kind: Type.Literal("truncated"),
		content: Type.String(),
		truncation: readTruncationOutputSchema,
		continuation: ReadToolContinuationSchema
	}, { additionalProperties: false }),
	Type.Object({
		kind: Type.Literal("not_found"),
		status: Type.Literal("not_found"),
		path: Type.String(),
		optional: Type.Literal(true)
	}, { additionalProperties: false })
]);
function createReadToolDetails(content, truncated) {
	const text = content.find((part) => part.type === "text")?.text ?? "";
	const image = content.find((part) => part.type === "image");
	if (image) return {
		kind: "image",
		content: text,
		mimeType: image.mimeType
	};
	if (truncated) return {
		...truncated,
		content: text
	};
	return {
		kind: "text",
		content: text
	};
}
//#endregion
//#region src/agents/sessions/tools/read.ts
/**
* Built-in read session tool.
*
* Reads text and image files through local or injected operations with highlighting, resizing, and bounded output.
*/
function normalizeReadError(error, filePath) {
	if (hasErrnoCode(error, "EISDIR")) return /* @__PURE__ */ new Error(`Read requires a file path, but ${filePath} is a directory. List the directory, then read a specific file.`);
	return toErrorObject(error, "Non-Error rejection");
}
function regularFileReadError(filePath) {
	return /* @__PURE__ */ new Error(`Read only supports regular files; no read was attempted: ${filePath}`);
}
async function assertLocalReadableFile(filePath) {
	const stat$2 = await stat(filePath);
	if (stat$2.isDirectory()) throw Object.assign(/* @__PURE__ */ new Error(`Read requires a file: ${filePath}`), { code: "EISDIR" });
	if (!stat$2.isFile()) throw regularFileReadError(filePath);
	await access(filePath, constants.R_OK);
}
async function suggestLocalReadPaths(filePath) {
	let entries;
	try {
		entries = await readdir(dirname(filePath));
	} catch (error) {
		if (hasErrnoCode(error, "ENOENT") || hasErrnoCode(error, "ENOTDIR")) return [];
		throw error;
	}
	const requested = basename(filePath).toLowerCase();
	const maxDistance = Math.max(1, Math.floor(requested.length * .4));
	return entries.map((entry) => ({
		entry,
		distance: levenshteinDistance(requested, entry.toLowerCase())
	})).filter(({ entry, distance }) => entry !== basename(filePath) && distance <= maxDistance).toSorted((left, right) => left.distance - right.distance || left.entry.localeCompare(right.entry)).slice(0, 3).map(({ entry }) => entry);
}
const COMPACT_RESOURCE_FILE_NAMES = /* @__PURE__ */ new Set([
	"AGENTS.md",
	"AGENTS.MD",
	"CLAUDE.md",
	"CLAUDE.MD"
]);
const defaultReadOperations = {
	resolvePath: resolveLocalReadPath,
	decodeText: ({ buffer }) => decodeWindowsTextFileBuffer({ buffer }),
	readFile: async (filePath) => (await readRegularFile({ filePath })).buffer,
	access: assertLocalReadableFile
};
async function detectReadImageMimeType(ops, buffer, absolutePath) {
	if (ops.detectImageMimeType) return await ops.detectImageMimeType(absolutePath, buffer);
	return detectSupportedImageMimeType(buffer);
}
function formatReadLineRange(args, theme) {
	if (args?.offset === void 0 && args?.limit === void 0) return "";
	const startLine = args.offset ?? 1;
	const normalizedLimit = args.limit !== void 0 ? normalizePositiveLimit(args.limit, DEFAULT_MAX_LINES) : void 0;
	const endLine = normalizedLimit !== void 0 ? startLine + normalizedLimit - 1 : "";
	return theme.fg("warning", `:${startLine}${endLine ? `-${endLine}` : ""}`);
}
function formatReadCall(args, theme) {
	const rawPath = str(args?.file_path ?? args?.path);
	const path = rawPath !== null ? shortenPath(rawPath) : null;
	const invalidArg = invalidArgText(theme);
	const pathDisplay = path === null ? invalidArg : path ? theme.fg("accent", path) : theme.fg("toolOutput", "...");
	return `${theme.fg("toolTitle", theme.bold("read"))} ${pathDisplay}${formatReadLineRange(args, theme)}`;
}
function getOpenClawDocsClassification(absolutePath) {
	const packageRoot = dirname(getReadmePath());
	const relativePath = relative(resolve(packageRoot), resolve(absolutePath));
	if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) return;
	const label = normalizeNativePathSeparators(relativePath);
	if (label === "README.md" || label.startsWith("docs/") || label.startsWith("examples/")) return {
		kind: "docs",
		label
	};
}
function getCompactReadClassification(args, cwd) {
	const rawPath = str(args?.file_path ?? args?.path);
	if (!rawPath) return;
	const absolutePath = resolveToCwd(rawPath, cwd);
	const fileName = basename(absolutePath);
	if (fileName === "SKILL.md") return {
		kind: "skill",
		label: basename(dirname(absolutePath)) || fileName
	};
	const docsClassification = getOpenClawDocsClassification(absolutePath);
	if (docsClassification) return docsClassification;
	if (COMPACT_RESOURCE_FILE_NAMES.has(fileName)) return {
		kind: "resource",
		label: formatPathRelativeToCwdOrAbsolute(absolutePath, cwd)
	};
}
async function resolveLocalReadPath(filePath, cwd) {
	const normalizedMediaSource = normalizeMediaReferenceSource(filePath);
	if (classifyMediaReferenceSource(normalizedMediaSource).isMediaStoreUrl) return await resolveMediaReferenceLocalPath(normalizedMediaSource);
	return resolveLocalPathToCwd(filePath, cwd);
}
async function resolveReadToolInputPath(ops, filePath, cwd) {
	return await (ops.resolvePath?.(filePath, cwd) ?? resolveToCwd(filePath, cwd));
}
async function resolveReadToolPathFromAbsolute(ops, absolutePath) {
	try {
		await ops.access(absolutePath);
		return { absolutePath };
	} catch (error) {
		if (!hasErrnoCode(error, "ENOENT") && !hasErrnoCode(error, "ENOTDIR")) throw error;
		const matches = [];
		for (const candidate of getReadPathVariants(absolutePath)) try {
			await ops.access(candidate);
			matches.push(candidate);
		} catch (candidateError) {
			if (!hasErrnoCode(candidateError, "ENOENT") && !hasErrnoCode(candidateError, "ENOTDIR")) throw candidateError;
		}
		if (matches.length > 1) throw new Error(`Read path is ambiguous: ${basename(absolutePath)} matches ${matches.map((match) => basename(match)).join(", ")}.`, { cause: error });
		const match = matches[0];
		if (match !== void 0) return {
			absolutePath: match,
			note: `[Resolved filename: ${basename(absolutePath)} -> ${basename(match)}.]`
		};
		const suggestions = ops === defaultReadOperations ? await suggestLocalReadPaths(absolutePath) : [];
		const suggestion = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : "";
		throw Object.assign(new Error(`File not found: ${absolutePath}.${suggestion}`, { cause: error }), { code: "ENOENT" });
	}
}
function formatCompactReadCall(classification, args, theme) {
	const expandHint = theme.fg("dim", ` (${keyText("app.tools.expand")} to expand)`);
	if (classification.kind === "skill") return theme.fg("customMessageLabel", `\u001b[1m[skill]\u001b[22m `) + theme.fg("customMessageText", classification.label) + formatReadLineRange(args, theme) + expandHint;
	return theme.fg("toolTitle", theme.bold(`read ${classification.kind}`)) + " " + theme.fg("accent", classification.label) + formatReadLineRange(args, theme) + expandHint;
}
function formatReadResult(args, result, options, theme, showImages, cwd, isError) {
	if (!options.expanded && !isError && getCompactReadClassification(args, cwd)) return "";
	const rawPath = str(args?.file_path ?? args?.path);
	const output = getTextOutput(result, showImages);
	const lang = rawPath ? getLanguageFromPath(rawPath) : void 0;
	const lines = trimTrailingEmptyLines(lang ? highlightCode(replaceTabs$1(output), lang) : output.split("\n"));
	const maxLines = options.expanded ? lines.length : 10;
	const displayLines = lines.slice(0, maxLines);
	const remaining = lines.length - maxLines;
	let text = `\n${displayLines.map((line) => lang ? replaceTabs$1(line) : theme.fg("toolOutput", replaceTabs$1(line))).join("\n")}`;
	if (remaining > 0) text += `${theme.fg("muted", `\n... (${remaining} more lines,`)} ${keyHint("app.tools.expand", "to expand")})`;
	const truncation = result.details?.kind === "truncated" ? result.details.truncation : void 0;
	if (truncation?.truncated) {
		if (truncation.firstLineExceedsLimit) text += `\n${theme.fg("warning", `[First line exceeds ${formatSize(truncation.maxBytes ?? 51200)} limit]`)}`;
		else if (truncation.truncatedBy === "lines") text += `\n${theme.fg("warning", `[Truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${truncation.maxLines ?? 2e3} line limit)]`)}`;
		else text += `\n${theme.fg("warning", `[Truncated: ${truncation.outputLines} lines shown (${formatSize(truncation.maxBytes ?? 51200)} limit)]`)}`;
	}
	return text;
}
function createReadToolDefinition(cwd, options) {
	const autoResizeImages = options?.autoResizeImages ?? true;
	const ops = options?.operations ?? defaultReadOperations;
	const maxBytes = options?.maxBytes ?? 51200;
	return {
		name: "read",
		label: "read",
		description: `Read text/image file (jpg/png/gif/webp/bmp); images attach to model context. Text caps ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB. Continue with offset/limit, or cursor within a long line.`,
		promptSnippet: "Read file contents",
		promptGuidelines: ["Use read to examine files and its offset, limit, or cursor to continue."],
		parameters: readToolInputSchema,
		outputSchema: readToolOutputSchema,
		async execute(toolCallId, { path, offset, limit, cursor, optional }, signal, onUpdate, ctx) {
			if (offset !== void 0 && (!Number.isSafeInteger(offset) || offset < 1)) throw new Error("Offset must be an integer at least 1");
			if (cursor !== void 0 && (!Number.isSafeInteger(cursor) || cursor < 0)) throw new Error("Cursor must be an integer at least 0");
			return new Promise((resolve, reject) => {
				if (signal?.aborted) {
					reject(/* @__PURE__ */ new Error("Operation aborted"));
					return;
				}
				let aborted = false;
				const onAbort = () => {
					aborted = true;
					reject(/* @__PURE__ */ new Error("Operation aborted"));
				};
				signal?.addEventListener("abort", onAbort, { once: true });
				(async () => {
					try {
						let absolutePath;
						let note;
						let buffer;
						try {
							const inputPathResolution = resolveReadToolInputPath(ops, path, cwd);
							const snapshot = await withFileMutationQueueKeysResolution(inputPathResolution.then(async (absoluteInputPath) => await Promise.all(getReadQueuePaths(absoluteInputPath).map(async (candidate) => await resolveFileMutationQueueKey(candidate, ops.resolveQueueKey, signal)))), async () => {
								const absoluteInputPath = await inputPathResolution;
								const resolved = await resolveReadToolPathFromAbsolute(ops, absoluteInputPath);
								if (aborted) return;
								return {
									...resolved,
									buffer: await ops.readFile(resolved.absolutePath)
								};
							});
							if (!snapshot) return;
							({absolutePath, note, buffer} = snapshot);
						} catch (error) {
							if (aborted) return;
							if (optional !== true || !hasErrnoCode(error, "ENOENT") && !hasErrnoCode(error, "ENOTDIR")) throw error;
							signal?.removeEventListener("abort", onAbort);
							resolve({
								content: [{
									type: "text",
									text: `Optional file not found: ${path}.`
								}],
								details: {
									kind: "not_found",
									status: "not_found",
									path,
									optional: true
								}
							});
							return;
						}
						const mimeType = await detectReadImageMimeType(ops, buffer, absolutePath);
						let content;
						let truncated;
						const nonVisionImageNote = (options?.modelHasVision ?? ctx?.model?.input.includes("image")) === false ? "[Current model does not support images. The image will be omitted from this request.]" : void 0;
						if (mimeType) {
							const processed = await processImage({
								type: "image",
								data: buffer.toString("base64"),
								mimeType
							}, { autoResizeImages });
							if (!processed.ok) {
								let textNote = `Read image file [${mimeType}]\n${processed.message}`;
								if (nonVisionImageNote) textNote += `\n${nonVisionImageNote}`;
								content = [{
									type: "text",
									text: textNote
								}];
							} else {
								let textNote = `Read image file [${processed.image.mimeType}]`;
								if (processed.hints.length > 0) textNote += `\n${processed.hints.join("\n")}`;
								if (nonVisionImageNote) textNote += `\n${nonVisionImageNote}`;
								content = [{
									type: "text",
									text: textNote
								}];
								if (!nonVisionImageNote) content.push(processed.image);
							}
						} else {
							const decodedText = ops.decodeText?.({
								buffer,
								absolutePath
							}) ?? buffer.toString("utf8");
							const textContent = (decodedText.startsWith("﻿") ? decodedText.slice(1) : decodedText).replaceAll("\r\n", "\n");
							const allLines = textContent.split("\n");
							if (allLines.at(-1) === "") allLines.pop();
							const totalFileLines = allLines.length;
							const startLine = offset === void 0 ? 0 : offset - 1;
							const startLineDisplay = startLine + 1;
							let outputText;
							if (totalFileLines === 0) outputText = buffer.length === 0 ? "File is empty (0 bytes)." : `File contains no readable text (${buffer.length} bytes).`;
							else if (startLine >= totalFileLines) outputText = `Offset ${offset} is beyond end of file (${totalFileLines} lines total). Retry with offset <= ${totalFileLines}.`;
							else if (cursor !== void 0 && cursor >= allLines[startLine].length) {
								const nextLine = startLine + 1 < totalFileLines ? ` Use offset=${startLineDisplay + 1} to continue.` : "";
								outputText = `Cursor ${cursor} is at or beyond the end of line ${startLineDisplay} (${allLines[startLine].length} characters).${nextLine}`;
							} else {
								const firstLine = allLines[startLine];
								if (cursor !== void 0 && cursor > 0 && firstLine.codePointAt(cursor - 1) > 65535) throw new Error(`Cursor ${cursor} splits a UTF-16 surrogate pair; retry with cursor=${cursor - 1} or cursor=${cursor + 1}.`);
								const endLine = limit === void 0 ? totalFileLines : Math.min(startLine + normalizePositiveLimit(limit, DEFAULT_MAX_LINES), totalFileLines);
								const selectedLines = allLines.slice(startLine, endLine);
								if (cursor !== void 0) selectedLines[0] = firstLine.slice(cursor);
								const userLimitedLines = limit === void 0 ? void 0 : endLine - startLine;
								if (selectedLines.every((line) => line.length === 0)) {
									const selectedLineCount = selectedLines.length;
									outputText = `${startLine === 0 && endLine === totalFileLines ? "File" : "Selected range"} contains ${selectedLineCount} blank line${selectedLineCount === 1 ? "" : "s"}.`;
									if (userLimitedLines !== void 0 && endLine < totalFileLines) {
										const remaining = totalFileLines - endLine;
										outputText += `\n\n[${remaining} more line${remaining === 1 ? "" : "s"} in file. Use offset=${endLine + 1} to continue.]`;
									}
								} else {
									let selectedContent = selectedLines.join("\n");
									if (endLine === totalFileLines && textContent.endsWith("\n")) selectedContent += "\n";
									const noteBytes = note ? Buffer.byteLength(`${note}\n`, "utf8") : 0;
									const page = createBoundedReadTextPage({
										content: selectedContent,
										startLine: startLineDisplay,
										endLine,
										totalLines: totalFileLines,
										cursor,
										limit: userLimitedLines,
										maxBytes,
										modelBudget: options?.modelBudget,
										prefix: note ? `${note}\n` : void 0,
										pageMaxBytes: Math.min(DEFAULT_MAX_BYTES, maxBytes) - noteBytes,
										adaptive: options?.maxBytes !== void 0
									});
									outputText = page.content;
									if (page.kind === "truncated") truncated = page;
								}
							}
							content = [{
								type: "text",
								text: outputText
							}];
						}
						if (note && content[0]?.type === "text") content = [{
							...content[0],
							text: `${note}\n${content[0].text}`
						}, ...content.slice(1)];
						if (aborted) return;
						signal?.removeEventListener("abort", onAbort);
						resolve({
							content,
							details: createReadToolDetails(content, truncated)
						});
					} catch (error) {
						signal?.removeEventListener("abort", onAbort);
						if (!aborted) reject(normalizeReadError(error, path));
					}
				})();
			});
		},
		renderCall(args, theme, context) {
			const classification = !context.expanded ? getCompactReadClassification(args, context.cwd) : void 0;
			const content = classification ? formatCompactReadCall(classification, args, theme) : formatReadCall(args, theme);
			return reuseTextComponent(context.lastComponent, content);
		},
		renderResult(result, optionsLocal, theme, context) {
			const content = formatReadResult(context.args, result, optionsLocal, theme, context.showImages, context.cwd, context.isError);
			return reuseTextComponent(context.lastComponent, content);
		}
	};
}
function createReadTool(cwd, options) {
	return wrapToolDefinition(createReadToolDefinition(cwd, options));
}
//#endregion
//#region src/agents/sessions/tools/write.ts
/**
* Built-in write session tool.
*
* Writes files through queued local or injected operations with readback/idempotency metadata.
*/
const writeSchema = Type.Object({
	path: Type.String({ description: "File path; relative/absolute." }),
	content: Type.String({ description: "File content." })
});
const WriteToolOutputSchema = Type.Union([
	Type.Object({ changed: Type.Literal(false) }, { additionalProperties: false }),
	Type.Object({
		changed: Type.Literal(true),
		created: Type.Literal(true),
		diff: Type.String(),
		patch: Type.String(),
		firstChangedLine: Type.Optional(Type.Integer({ minimum: 1 }))
	}, { additionalProperties: false }),
	Type.Object({
		changed: Type.Literal(true),
		created: Type.Literal(false),
		diff: Type.String(),
		patch: Type.String(),
		firstChangedLine: Type.Optional(Type.Integer({ minimum: 1 }))
	}, { additionalProperties: false }),
	Type.Object({
		changed: Type.Literal(true),
		created: Type.Optional(Type.Boolean())
	}, { additionalProperties: false })
]);
const defaultWriteOperations = {
	writeFile: (path, content) => writeFile(path, content, "utf-8"),
	mkdir: (dir) => mkdir(dir, { recursive: true }).then(() => {}),
	readFile: (path) => readFile(path),
	statFile: async (path) => {
		try {
			const stat$1 = await stat(path);
			return {
				type: stat$1.isFile() ? "file" : stat$1.isDirectory() ? "directory" : "other",
				size: stat$1.size,
				mtimeMs: stat$1.mtimeMs
			};
		} catch (error) {
			if (isMissingPathError(error)) return null;
			throw error;
		}
	}
};
const WRITE_PRECHECK_READ_LIMIT_BYTES = 1048576;
const WRITE_DIFF_MAX_COMBINED_LINES = 2e4;
const WRITE_DIFF_MAX_EDIT_LENGTH = 2e3;
function withinWriteDiffBudget(oldContent, newContent) {
	return structuredPatch("", "", oldContent, newContent, void 0, void 0, {
		context: 0,
		maxEditLength: WRITE_DIFF_MAX_EDIT_LENGTH
	}) !== void 0;
}
function countNewlines(text) {
	let count = 0;
	for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) count += 1;
	return count;
}
var WriteCallRenderComponent = class extends Text {
	constructor() {
		super("", 0, 0);
	}
};
const WRITE_PARTIAL_FULL_HIGHLIGHT_LINES = 50;
function highlightSingleLine(line, lang) {
	return highlightCode(line, lang)[0] ?? "";
}
function refreshWriteHighlightPrefix(cache) {
	const prefixCount = Math.min(WRITE_PARTIAL_FULL_HIGHLIGHT_LINES, cache.normalizedLines.length);
	if (prefixCount === 0) return;
	const prefixHighlighted = highlightCode(cache.normalizedLines.slice(0, prefixCount).join("\n"), cache.lang);
	for (let i = 0; i < prefixCount; i++) cache.highlightedLines[i] = prefixHighlighted[i] ?? highlightSingleLine(cache.normalizedLines[i] ?? "", cache.lang);
}
function rebuildWriteHighlightCacheFull(rawPath, fileContent) {
	const lang = rawPath ? getLanguageFromPath(rawPath) : void 0;
	if (!lang) return;
	const normalized = replaceTabs$1(normalizeDisplayText(fileContent));
	return {
		rawPath,
		lang,
		rawContent: fileContent,
		normalizedLines: normalized.split("\n"),
		highlightedLines: highlightCode(normalized, lang)
	};
}
function updateWriteHighlightCacheIncremental(cache, rawPath, fileContent) {
	const lang = rawPath ? getLanguageFromPath(rawPath) : void 0;
	if (!lang) return;
	if (!cache) return rebuildWriteHighlightCacheFull(rawPath, fileContent);
	if (cache.lang !== lang || cache.rawPath !== rawPath) return rebuildWriteHighlightCacheFull(rawPath, fileContent);
	if (!fileContent.startsWith(cache.rawContent)) return rebuildWriteHighlightCacheFull(rawPath, fileContent);
	if (fileContent.length === cache.rawContent.length) return cache;
	const deltaNormalized = replaceTabs$1(normalizeDisplayText(fileContent.slice(cache.rawContent.length)));
	cache.rawContent = fileContent;
	if (cache.normalizedLines.length === 0) {
		cache.normalizedLines.push("");
		cache.highlightedLines.push("");
	}
	const segments = deltaNormalized.split("\n");
	const lastIndex = cache.normalizedLines.length - 1;
	const firstSegment = segments.at(0);
	const currentLastLine = cache.normalizedLines.at(lastIndex);
	if (firstSegment === void 0 || currentLastLine === void 0) return rebuildWriteHighlightCacheFull(rawPath, fileContent);
	cache.normalizedLines[lastIndex] = currentLastLine + firstSegment;
	cache.highlightedLines[lastIndex] = highlightSingleLine(cache.normalizedLines[lastIndex], cache.lang);
	for (const segment of segments.slice(1)) {
		cache.normalizedLines.push(segment);
		cache.highlightedLines.push(highlightSingleLine(segment, cache.lang));
	}
	refreshWriteHighlightPrefix(cache);
	return cache;
}
function formatWriteCall(args, options, theme, cache) {
	const rawPath = str(args?.file_path ?? args?.path);
	const fileContent = str(args?.content);
	const path = rawPath !== null ? shortenPath(rawPath) : null;
	const invalidArg = invalidArgText(theme);
	let text = `${theme.fg("toolTitle", theme.bold("write"))} ${path === null ? invalidArg : path ? theme.fg("accent", path) : theme.fg("toolOutput", "...")}`;
	if (fileContent === null) text += `\n\n${theme.fg("error", "[invalid content arg - expected string]")}`;
	else if (fileContent) {
		const lang = rawPath ? getLanguageFromPath(rawPath) : void 0;
		const lines = trimTrailingEmptyLines(lang ? cache?.highlightedLines ?? highlightCode(replaceTabs$1(normalizeDisplayText(fileContent)), lang) : normalizeDisplayText(fileContent).split("\n"));
		const totalLines = lines.length;
		const maxLines = options.expanded ? lines.length : 10;
		const displayLines = lines.slice(0, maxLines);
		const remaining = lines.length - maxLines;
		text += `\n\n${displayLines.map((line) => lang ? line : theme.fg("toolOutput", replaceTabs$1(line))).join("\n")}`;
		if (remaining > 0) text += `${theme.fg("muted", `\n... (${remaining} more lines, ${totalLines} total,`)} ${keyHint("app.tools.expand", "to expand")})`;
	}
	return text;
}
function formatWriteResult(result, theme) {
	if (!result.isError) return;
	const output = result.content.filter((c) => c.type === "text").map((c) => c.text || "").join("\n");
	if (!output) return;
	return `\n${theme.fg("error", output)}`;
}
function isMissingFileError(error) {
	if (isMissingPathError(error)) return true;
	return error instanceof Error && error.message.includes("No such file or directory");
}
async function readOriginalWriteState(absolutePath, content, ops) {
	let stat;
	try {
		stat = await ops.statFile(absolutePath);
	} catch (error) {
		return isMissingFileError(error) ? {
			state: "different",
			beforeStat: null
		} : { state: "unknown" };
	}
	if (!stat) return {
		state: "different",
		beforeStat: stat
	};
	if (stat.type !== "file") return {
		state: "unknown",
		beforeStat: stat
	};
	if (stat.size !== Buffer.byteLength(content, "utf8")) return {
		state: "different",
		beforeStat: stat
	};
	if (!ops.readFile || stat.size > WRITE_PRECHECK_READ_LIMIT_BYTES) return {
		state: "unknown",
		beforeStat: stat
	};
	try {
		const originalContent = await ops.readFile(absolutePath);
		const originalBytes = Buffer.isBuffer(originalContent) ? originalContent : Buffer.from(originalContent, "utf8");
		const originalText = originalBytes.toString("utf8");
		if (Buffer.byteLength(originalText, "utf8") > WRITE_PRECHECK_READ_LIMIT_BYTES) return {
			state: "unknown",
			beforeStat: stat,
			readAttempted: true
		};
		return {
			state: originalBytes.equals(Buffer.from(content, "utf8")) ? "same" : "different",
			beforeStat: stat,
			beforeText: originalText,
			readAttempted: true
		};
	} catch {
		return {
			state: "unknown",
			beforeStat: stat,
			readAttempted: true
		};
	}
}
async function resolveWriteDetails(params) {
	if (Buffer.byteLength(params.content, "utf8") > WRITE_PRECHECK_READ_LIMIT_BYTES) {
		if (params.precheck.beforeStat === null) return {
			changed: true,
			created: true
		};
		return params.precheck.beforeStat ? {
			changed: true,
			created: false
		} : { changed: true };
	}
	if (params.precheck.beforeStat === null) {
		if (countNewlines(params.content) > WRITE_DIFF_MAX_COMBINED_LINES) return {
			changed: true,
			created: true
		};
		const diffResult = generateDiffString("", params.content);
		return {
			changed: true,
			created: true,
			diff: diffResult.diff,
			patch: generateUnifiedPatch(params.path, "", params.content),
			...diffResult.firstChangedLine === void 0 ? {} : { firstChangedLine: diffResult.firstChangedLine }
		};
	}
	const beforeStat = params.precheck.beforeStat;
	let beforeText = params.precheck.beforeText;
	if (beforeText === void 0 && !params.precheck.readAttempted && beforeStat?.type === "file" && beforeStat.size <= WRITE_PRECHECK_READ_LIMIT_BYTES && params.ops.readFile) {
		const originalContent = await params.ops.readFile(params.absolutePath).catch(() => void 0);
		const candidate = Buffer.isBuffer(originalContent) ? originalContent.toString("utf8") : originalContent;
		if (candidate !== void 0 && Buffer.byteLength(candidate, "utf8") <= WRITE_PRECHECK_READ_LIMIT_BYTES) beforeText = candidate;
	}
	if (beforeText !== void 0 && (beforeText.includes("�") || beforeText.includes("\0"))) beforeText = void 0;
	if (beforeText !== void 0 && (Buffer.byteLength(beforeText, "utf8") + Buffer.byteLength(params.content, "utf8") > WRITE_PRECHECK_READ_LIMIT_BYTES || countNewlines(beforeText) + countNewlines(params.content) > WRITE_DIFF_MAX_COMBINED_LINES)) beforeText = void 0;
	if (beforeText !== void 0 && !withinWriteDiffBudget(beforeText, params.content)) beforeText = void 0;
	if (beforeText !== void 0) {
		const diffResult = generateDiffString(beforeText, params.content);
		return {
			changed: true,
			created: false,
			diff: diffResult.diff,
			patch: generateUnifiedPatch(params.path, beforeText, params.content),
			...diffResult.firstChangedLine === void 0 ? {} : { firstChangedLine: diffResult.firstChangedLine }
		};
	}
	return beforeStat ? {
		changed: true,
		created: false
	} : { changed: true };
}
async function didWriteMetadataChange(absolutePath, beforeStat, ops) {
	if (!beforeStat || !ops.statFile) return false;
	const afterStat = await ops.statFile(absolutePath).catch(() => null);
	if (!afterStat || afterStat.type !== "file") return false;
	return afterStat.size !== beforeStat.size || afterStat.mtimeMs !== beforeStat.mtimeMs;
}
function isWriteRecoveryCandidate(error, signal) {
	if (signal?.aborted) return true;
	if (!(error instanceof Error)) return false;
	const message = error.message.toLowerCase();
	return error.name === "AbortError" || error.name === "TimeoutError" || message.includes("timed out") || message.includes("timeout");
}
function successfulWriteResult(path, content, details) {
	return textResult(`Successfully wrote ${Buffer.byteLength(content, "utf8")} bytes to ${path}`, details);
}
async function recoverSuccessfulWrite(params) {
	if (!isWriteRecoveryCandidate(params.error, params.signal)) return null;
	const verified = await verifyPersistedUtf8File(params.absolutePath, params.content, params.ops);
	const changed = params.precheck.state === "different" || params.precheck.state === "unknown" && await didWriteMetadataChange(params.absolutePath, params.precheck.beforeStat, params.ops);
	if (!verified || !changed) return null;
	return successfulWriteResult(params.path, params.content, params.details);
}
function createWriteToolDefinition(cwd, options) {
	const ops = options?.operations ?? defaultWriteOperations;
	const resolvePath = options?.operations ? resolveToCwd : resolveLocalPathToCwd;
	return {
		name: "write",
		label: "write",
		description: "Write/overwrite file; creates parent directories.",
		promptSnippet: "Create/overwrite files",
		promptGuidelines: ["Use only new files/complete rewrites."],
		parameters: writeSchema,
		outputSchema: WriteToolOutputSchema,
		async execute(toolCallId, { path, content }, signal, onUpdate, ctx) {
			const absolutePath = resolvePath(path, cwd);
			const dir = dirname(absolutePath);
			return withFileMutationQueueKeyResolution(resolveFileMutationQueueKey(absolutePath, ops.resolveQueueKey, signal), async () => {
				const precheck = await readOriginalWriteState(absolutePath, content, ops);
				if (signal?.aborted) throw new Error("Operation aborted");
				if (precheck.state === "same") return textResult(`No changes made to ${path}. The file already has identical content.`, { changed: false });
				const details = await resolveWriteDetails({
					absolutePath,
					content,
					ops,
					path,
					precheck
				});
				try {
					await ops.mkdir(dir);
					if (signal?.aborted) throw new Error("Operation aborted");
					await ops.writeFile(absolutePath, content);
					if (signal?.aborted) throw new Error("Operation aborted");
					if (!await verifyPersistedUtf8File(absolutePath, content, ops)) throw new Error(`Write verification failed for ${path}: the persisted regular file does not match the requested content. Inspect the target and retry.`);
					return successfulWriteResult(path, content, details);
				} catch (error) {
					const recovered = await recoverSuccessfulWrite({
						absolutePath,
						content,
						error,
						ops,
						path,
						precheck,
						details,
						signal
					});
					if (recovered) return recovered;
					throw error;
				}
			});
		},
		renderCall(args, theme, context) {
			const renderArgs = args;
			const rawPath = str(renderArgs?.file_path ?? renderArgs?.path);
			const fileContent = str(renderArgs?.content);
			const component = context.lastComponent ?? new WriteCallRenderComponent();
			if (fileContent !== null) component.cache = context.argsComplete ? rebuildWriteHighlightCacheFull(rawPath, fileContent) : updateWriteHighlightCacheIncremental(component.cache, rawPath, fileContent);
			else component.cache = void 0;
			component.setText(formatWriteCall(renderArgs, {
				expanded: context.expanded,
				isPartial: context.isPartial
			}, theme, component.cache));
			return component;
		},
		renderResult(result, optionsLocal, theme, context) {
			const output = formatWriteResult({
				...result,
				isError: context.isError
			}, theme);
			if (!output) {
				const component = context.lastComponent ?? new Container();
				component.clear();
				return component;
			}
			return reuseTextComponent(context.lastComponent, output);
		}
	};
}
function createWriteTool(cwd, options) {
	return wrapToolDefinition(createWriteToolDefinition(cwd, options));
}
//#endregion
//#region src/agents/sessions/tools/index.ts
const allToolNames = /* @__PURE__ */ new Set([
	"read",
	"bash",
	"edit",
	"write",
	"grep",
	"find",
	"ls"
]);
/** Creates one tool definition by stable built-in tool name. */
function createToolDefinition(toolName, cwd, options) {
	switch (toolName) {
		case "read": return createReadToolDefinition(cwd, options?.read);
		case "bash": return createBashToolDefinition(cwd, options?.bash);
		case "edit": return createEditToolDefinition(cwd, options?.edit);
		case "write": return createWriteToolDefinition(cwd, options?.write);
		case "grep": return createGrepToolDefinition(cwd, options?.grep);
		case "find": return createFindToolDefinition(cwd, options?.find);
		case "ls": return createLsToolDefinition(cwd, options?.ls);
		default: throw new Error(`Unknown tool name: ${String(toolName)}`);
	}
}
/** Creates one executable built-in tool by stable tool name. */
function createTool(toolName, cwd, options) {
	return wrapToolDefinition(createToolDefinition(toolName, cwd, options));
}
/** Creates the mutable coding tool definitions used by agent coding sessions. */
function createCodingToolDefinitions(cwd, options) {
	return [
		createReadToolDefinition(cwd, options?.read),
		createBashToolDefinition(cwd, options?.bash),
		createEditToolDefinition(cwd, options?.edit),
		createWriteToolDefinition(cwd, options?.write)
	];
}
/** Creates read-only discovery tool definitions for restricted sessions. */
function createReadOnlyToolDefinitions(cwd, options) {
	return [
		createReadToolDefinition(cwd, options?.read),
		createGrepToolDefinition(cwd, options?.grep),
		createFindToolDefinition(cwd, options?.find),
		createLsToolDefinition(cwd, options?.ls)
	];
}
/** Creates all built-in tool definitions keyed by tool name. */
function createAllToolDefinitions(cwd, options) {
	return {
		read: createReadToolDefinition(cwd, options?.read),
		bash: createBashToolDefinition(cwd, options?.bash),
		edit: createEditToolDefinition(cwd, options?.edit),
		write: createWriteToolDefinition(cwd, options?.write),
		grep: createGrepToolDefinition(cwd, options?.grep),
		find: createFindToolDefinition(cwd, options?.find),
		ls: createLsToolDefinition(cwd, options?.ls)
	};
}
/** Creates the mutable coding tools used by local agent sessions. */
function createCodingTools(cwd, options) {
	return wrapToolDefinitions(createCodingToolDefinitions(cwd, options));
}
/** Creates read-only discovery tools for restricted sessions. */
function createReadOnlyTools(cwd, options) {
	return wrapToolDefinitions(createReadOnlyToolDefinitions(cwd, options));
}
/** Creates all built-in tools keyed by tool name. */
function createAllTools(cwd, options) {
	const definitions = createAllToolDefinitions(cwd, options);
	return {
		read: wrapToolDefinition(definitions.read),
		bash: wrapToolDefinition(definitions.bash),
		edit: wrapToolDefinition(definitions.edit),
		write: wrapToolDefinition(definitions.write),
		grep: wrapToolDefinition(definitions.grep),
		find: wrapToolDefinition(definitions.find),
		ls: wrapToolDefinition(definitions.ls)
	};
}
//#endregion
//#region src/agents/sessions/extensions/types.ts
/**
* Preserve parameter inference for standalone tool definitions.
*
* Use this when assigning a tool to a variable or passing it through arrays such
* as `customTools`, where contextual typing would otherwise widen params to
* `unknown`.
*/
function defineTool(tool) {
	return tool;
}
function isBashToolResult(e) {
	return e.toolName === "bash";
}
function isReadToolResult(e) {
	return e.toolName === "read";
}
function isEditToolResult(e) {
	return e.toolName === "edit";
}
function isWriteToolResult(e) {
	return e.toolName === "write";
}
function isGrepToolResult(e) {
	return e.toolName === "grep";
}
function isFindToolResult(e) {
	return e.toolName === "find";
}
function isLsToolResult(e) {
	return e.toolName === "ls";
}
function isToolCallEventType(toolName, event) {
	return event.toolName === toolName;
}
//#endregion
//#region src/agents/sessions/extensions/wrapper.ts
/**
* Wrap a RegisteredTool into an AgentTool.
* Uses the runner's createContext() for consistent context across tools and event handlers.
*/
function wrapRegisteredTool(registeredTool, runner) {
	return wrapToolDefinition(registeredTool.definition, () => runner.createContext());
}
/**
* Wrap all registered tools into AgentTools.
* Uses the runner's createContext() for consistent context across tools and event handlers.
*/
function wrapRegisteredTools(registeredTools, runner) {
	return wrapToolDefinitions(registeredTools.map((registeredTool) => registeredTool.definition), () => runner.createContext());
}
//#endregion
//#region src/agents/sessions/extension-sdk.ts
var extension_sdk_exports = /* @__PURE__ */ __exportAll({
	AUTH_STORAGE_CREATE_DEPRECATION_CODE: () => AUTH_STORAGE_CREATE_DEPRECATION_CODE,
	AuthStorage: () => AuthStorage,
	CURRENT_SESSION_VERSION: () => 3,
	DEFAULT_COMPACTION_SETTINGS: () => DEFAULT_COMPACTION_SETTINGS,
	DEFAULT_MAX_BYTES: () => DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES: () => DEFAULT_MAX_LINES,
	DefaultPackageManager: () => DefaultPackageManager,
	FILE_AUTH_STORAGE_BACKEND_DEPRECATION_CODE: () => FILE_AUTH_STORAGE_BACKEND_DEPRECATION_CODE,
	FileAuthStorageBackend: () => FileAuthStorageBackend,
	FileSettingsStorage: () => FileSettingsStorage,
	InMemoryAuthStorageBackend: () => InMemoryAuthStorageBackend,
	InMemorySettingsStorage: () => InMemorySettingsStorage,
	ModelRegistry: () => ModelRegistry,
	OAuthProviderConfiguredUnavailableError: () => OAuthProviderConfiguredUnavailableError,
	SessionManager: () => SessionManager,
	SettingsManager: () => SettingsManager,
	VERSION: () => PACKAGE_MANIFEST_VERSION,
	allToolNames: () => allToolNames,
	buildSessionContext: () => buildSessionContext$1,
	calculateContextTokens: () => calculateContextTokens,
	collectEntriesForBranchSummary: () => collectEntriesForBranchSummary,
	compact: () => compact,
	convertToLlm: () => convertToLlm,
	createAllToolDefinitions: () => createAllToolDefinitions,
	createAllTools: () => createAllTools,
	createBashTool: () => createBashTool,
	createBashToolDefinition: () => createBashToolDefinition,
	createCodingToolDefinitions: () => createCodingToolDefinitions,
	createCodingTools: () => createCodingTools,
	createEditTool: () => createEditTool,
	createEditToolDefinition: () => createEditToolDefinition,
	createEventBus: () => createEventBus,
	createFindTool: () => createFindTool,
	createFindToolDefinition: () => createFindToolDefinition,
	createGrepTool: () => createGrepTool,
	createGrepToolDefinition: () => createGrepToolDefinition,
	createLocalBashOperations: () => createLocalBashOperations,
	createLsTool: () => createLsTool,
	createLsToolDefinition: () => createLsToolDefinition,
	createReadOnlyToolDefinitions: () => createReadOnlyToolDefinitions,
	createReadOnlyTools: () => createReadOnlyTools,
	createReadTool: () => createReadTool,
	createReadToolDefinition: () => createReadToolDefinition,
	createSourceInfo: () => createSourceInfo,
	createSyntheticSourceInfo: () => createSyntheticSourceInfo,
	createTool: () => createTool,
	createToolDefinition: () => createToolDefinition,
	createWriteTool: () => createWriteTool,
	createWriteToolDefinition: () => createWriteToolDefinition,
	defineTool: () => defineTool,
	estimateContextTokens: () => estimateContextTokens,
	estimateTokens: () => estimateTokens,
	executeBashWithOperations: () => executeBashWithOperations,
	findCutPoint: () => findCutPoint,
	findExactModelReferenceMatch: () => findExactModelReferenceMatch,
	findInitialModel: () => findInitialModel,
	findTurnStartIndex: () => findTurnStartIndex,
	formatSize: () => formatSize,
	generateBranchSummary: () => generateBranchSummary,
	generateSummary: () => generateSummary,
	getAgentDir: () => getAgentDir,
	getLastAssistantUsage: () => getLastAssistantUsage,
	getLatestCompactionEntry: () => getLatestCompactionEntry,
	isBashToolResult: () => isBashToolResult,
	isEditToolResult: () => isEditToolResult,
	isFindToolResult: () => isFindToolResult,
	isGrepToolResult: () => isGrepToolResult,
	isLsToolResult: () => isLsToolResult,
	isReadToolResult: () => isReadToolResult,
	isToolCallEventType: () => isToolCallEventType,
	isWriteToolResult: () => isWriteToolResult,
	migrateSessionEntries: () => migrateSessionEntries,
	normalizeLoadedFileEntry: () => normalizeLoadedFileEntry,
	parseModelPattern: () => parseModelPattern,
	parseSessionEntries: () => parseSessionEntries,
	prepareBranchEntries: () => prepareBranchEntries,
	prepareCompaction: () => prepareCompaction,
	resolveCliModel: () => resolveCliModel,
	resolveModelScope: () => resolveModelScope,
	restoreModelFromSession: () => restoreModelFromSession,
	serializeConversation: () => serializeConversation,
	shouldCompact: () => shouldCompact,
	truncateHead: () => truncateHead,
	truncateLine: () => truncateLine,
	truncateTail: () => truncateTail,
	withFileMutationQueue: () => withFileMutationQueue,
	wrapRegisteredTool: () => wrapRegisteredTool,
	wrapRegisteredTools: () => wrapRegisteredTools
});
//#endregion
//#region src/agents/sessions/extensions/loader.ts
/**
* Extension loader - loads TypeScript extension modules using jiti.
*
*/
/** Modules available to extensions via virtualModules (for compiled Bun binary) */
const bundledAgentCore = {
	Agent,
	bashExecutionToText,
	buildSessionContext,
	calculateContextTokens,
	collectEntriesForBranchSummaryFromBranches,
	compact: compact$1,
	estimateContextTokens,
	estimateTokens,
	findCutPoint,
	findTurnStartIndex,
	generateBranchSummary: generateBranchSummary$1,
	generateSummary: generateSummary$1,
	getLastAssistantUsage,
	openClawAgentCoreRuntime,
	prepareBranchEntries,
	prepareCompaction: prepareCompaction$1,
	runAgentLoop,
	serializeConversation,
	shouldCompact,
	uuidv7,
	BRANCH_SUMMARY_PREFIX,
	BRANCH_SUMMARY_SUFFIX,
	COMPACTION_SUMMARY_PREFIX,
	COMPACTION_SUMMARY_SUFFIX,
	DEFAULT_COMPACTION_SETTINGS
};
const VIRTUAL_MODULES = {
	typebox: bundledTypebox,
	"typebox/compile": bundledTypeboxCompile,
	"typebox/format": bundledTypeboxFormat,
	"typebox/value": bundledTypeboxValue,
	"@sinclair/typebox": bundledTypebox,
	"@sinclair/typebox/compile": bundledTypeboxCompile,
	"@sinclair/typebox/format": bundledTypeboxFormat,
	"@sinclair/typebox/value": bundledTypeboxValue,
	"openclaw/plugin-sdk/agent-core": bundledAgentCore,
	"@openclaw/plugin-sdk/agent-core": bundledAgentCore,
	"openclaw/plugin-sdk/llm": llm_exports,
	"@openclaw/plugin-sdk/llm": llm_exports,
	"openclaw/plugin-sdk/agent-sessions": extension_sdk_exports,
	"@openclaw/plugin-sdk/agent-sessions": extension_sdk_exports
};
const require = createRequire(import.meta.url);
let aliases = null;
let createJitiLoaderFactory;
let nativeExtensionLoadCounter = 0;
let extensionCacheCwd;
let extensionCacheGeneration = 0;
const extensionFactoryCache = /* @__PURE__ */ new Map();
const EXTENSION_LOADER_ALIAS_IMPORT_PATTERN = /(?:@openclaw\/plugin-sdk|openclaw\/plugin-sdk|@sinclair\/typebox|typebox)(?:\/[A-Za-z0-9_-]+)?/u;
const RELATIVE_EXTENSION_IMPORT_PATTERN = /(?:import\s*(?:[^'"]*?\s*from\s*)?["']\.{1,2}\/|export\s*(?:[^'"]*?\s*from\s*)["']\.{1,2}\/|import\s*\(\s*["']\.{1,2}\/|require\s*\(\s*["']\.{1,2}\/)/u;
const COMMONJS_EXTENSION_EXPORT_PATTERN = /\b(?:module\.exports|exports\.)/u;
async function loadCreateJitiLoaderFactory() {
	if (createJitiLoaderFactory) return createJitiLoaderFactory;
	const loaded = await import("jiti/static");
	if (typeof loaded.createJiti !== "function") throw new Error("jiti/static module did not export createJiti");
	createJitiLoaderFactory = loaded.createJiti;
	return createJitiLoaderFactory;
}
function resolveExtensionSafeAgentSessionsEntry() {
	const currentDirname = path$1.dirname(fileURLToPath(import.meta.url));
	const jsEntry = path$1.resolve(currentDirname, "..", "extension-sdk.js");
	return fs$2.existsSync(jsEntry) ? jsEntry : path$1.resolve(currentDirname, "..", "extension-sdk.ts");
}
function getExtensionLoaderAliases() {
	if (aliases) return aliases;
	const agentSessionsEntry = resolveExtensionSafeAgentSessionsEntry();
	const typeboxEntry = require.resolve("typebox");
	const typeboxCompileEntry = require.resolve("typebox/compile");
	const typeboxFormatEntry = require.resolve("typebox/format");
	const typeboxValueEntry = require.resolve("typebox/value");
	const loaderModulePath = fileURLToPath(import.meta.url);
	aliases = {
		...buildPluginLoaderAliasMap(loaderModulePath, process.argv[1], import.meta.url),
		"openclaw/plugin-sdk/agent-sessions": agentSessionsEntry,
		"@openclaw/plugin-sdk/agent-sessions": agentSessionsEntry,
		typebox: typeboxEntry,
		"typebox/compile": typeboxCompileEntry,
		"typebox/format": typeboxFormatEntry,
		"typebox/value": typeboxValueEntry,
		"@sinclair/typebox": typeboxEntry,
		"@sinclair/typebox/compile": typeboxCompileEntry,
		"@sinclair/typebox/format": typeboxFormatEntry,
		"@sinclair/typebox/value": typeboxValueEntry
	};
	return aliases;
}
const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
function normalizeUnicodeSpaces(str) {
	return str.replace(UNICODE_SPACES, " ");
}
function expandPath(p) {
	const normalized = normalizeUnicodeSpaces(p);
	if (normalized.startsWith("~/")) return path$1.join(os$1.homedir(), normalized.slice(2));
	if (normalized.startsWith("~")) return path$1.join(os$1.homedir(), normalized.slice(1));
	return normalized;
}
function resolvePath(extPath, cwd) {
	const expanded = expandPath(extPath);
	if (path$1.isAbsolute(expanded)) return expanded;
	return path$1.resolve(cwd, expanded);
}
function clearExtensionCache() {
	extensionFactoryCache.clear();
	extensionCacheCwd = void 0;
	extensionCacheGeneration++;
}
function useExtensionCacheCwd(cwd) {
	const resolvedCwd = path$1.resolve(expandPath(cwd));
	if (extensionCacheCwd !== void 0 && extensionCacheCwd !== resolvedCwd) clearExtensionCache();
	extensionCacheCwd = resolvedCwd;
	return {
		cwd: resolvedCwd,
		generation: extensionCacheGeneration
	};
}
function isCurrentCacheScope(scope) {
	return scope !== void 0 && extensionCacheCwd === scope.cwd && extensionCacheGeneration === scope.generation;
}
/**
* Create a runtime with throwing stubs for action methods.
* Runner.bindCore() replaces these with real implementations.
*/
function createExtensionRuntime() {
	const notInitialized = () => {
		throw new Error("Extension runtime not initialized. Action methods cannot be called during extension loading.");
	};
	const state = {};
	const assertActive = () => {
		if (state.staleMessage) throw new Error(state.staleMessage);
	};
	const runtime = {
		sendMessage: notInitialized,
		sendUserMessage: notInitialized,
		appendEntry: notInitialized,
		setSessionName: notInitialized,
		getSessionName: notInitialized,
		setLabel: notInitialized,
		getActiveTools: notInitialized,
		getAllTools: notInitialized,
		setActiveTools: notInitialized,
		refreshTools: () => {},
		getCommands: notInitialized,
		setModel: () => Promise.reject(/* @__PURE__ */ new Error("Extension runtime not initialized")),
		getThinkingLevel: notInitialized,
		setThinkingLevel: notInitialized,
		flagValues: /* @__PURE__ */ new Map(),
		pendingProviderRegistrations: [],
		assertActive,
		invalidate: (message) => {
			state.staleMessage ??= message ?? "This extension ctx is stale after session replacement or reload. Do not use a captured api or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().";
		},
		registerProvider: (name, config, extensionPath = "<unknown>") => {
			runtime.pendingProviderRegistrations.push({
				name,
				config,
				extensionPath
			});
		},
		unregisterProvider: (name) => {
			runtime.pendingProviderRegistrations = runtime.pendingProviderRegistrations.filter((r) => r.name !== name);
		}
	};
	return runtime;
}
/**
* Create the ExtensionAPI for an extension.
* Registration methods write to the extension object.
* Action methods delegate to the shared runtime.
*/
function createExtensionAPI(extension, runtime, cwd, eventBus) {
	return {
		on(event, handler) {
			runtime.assertActive();
			const list = extension.handlers.get(event) ?? [];
			list.push(handler);
			extension.handlers.set(event, list);
		},
		registerTool(tool) {
			runtime.assertActive();
			extension.tools.set(tool.name, {
				definition: tool,
				sourceInfo: extension.sourceInfo
			});
			runtime.refreshTools();
		},
		registerCommand(name, options) {
			runtime.assertActive();
			extension.commands.set(name, {
				name,
				sourceInfo: extension.sourceInfo,
				...options
			});
		},
		registerShortcut(shortcut, options) {
			runtime.assertActive();
			extension.shortcuts.set(shortcut, {
				shortcut,
				extensionPath: extension.path,
				...options
			});
		},
		registerFlag(name, options) {
			runtime.assertActive();
			extension.flags.set(name, {
				name,
				extensionPath: extension.path,
				...options
			});
			if (options.default !== void 0 && !runtime.flagValues.has(name)) runtime.flagValues.set(name, options.default);
		},
		registerMessageRenderer(customType, renderer) {
			runtime.assertActive();
			extension.messageRenderers.set(customType, renderer);
		},
		getFlag(name) {
			runtime.assertActive();
			if (!extension.flags.has(name)) return;
			return runtime.flagValues.get(name);
		},
		sendMessage(message, options) {
			runtime.assertActive();
			runtime.sendMessage(message, options);
		},
		sendUserMessage(content, options) {
			runtime.assertActive();
			runtime.sendUserMessage(content, options);
		},
		appendEntry(customType, data) {
			runtime.assertActive();
			runtime.appendEntry(customType, data);
		},
		setSessionName(name) {
			runtime.assertActive();
			runtime.setSessionName(name);
		},
		getSessionName() {
			runtime.assertActive();
			return runtime.getSessionName();
		},
		setLabel(entryId, label) {
			runtime.assertActive();
			runtime.setLabel(entryId, label);
		},
		exec(command, args, options) {
			runtime.assertActive();
			return execCommand(command, args, options?.cwd ?? cwd, options);
		},
		getActiveTools() {
			runtime.assertActive();
			return runtime.getActiveTools();
		},
		getAllTools() {
			runtime.assertActive();
			return runtime.getAllTools();
		},
		setActiveTools(toolNames) {
			runtime.assertActive();
			runtime.setActiveTools(toolNames);
		},
		getCommands() {
			runtime.assertActive();
			return runtime.getCommands();
		},
		setModel(model) {
			runtime.assertActive();
			return runtime.setModel(model);
		},
		getThinkingLevel() {
			runtime.assertActive();
			return runtime.getThinkingLevel();
		},
		setThinkingLevel(level) {
			runtime.assertActive();
			runtime.setThinkingLevel(level);
		},
		registerProvider(name, config) {
			runtime.assertActive();
			runtime.registerProvider(name, config, extension.path);
		},
		unregisterProvider(name) {
			runtime.assertActive();
			runtime.unregisterProvider(name, extension.path);
		},
		events: eventBus
	};
}
function resolveExtensionFactory(module) {
	const candidate = typeof module === "object" && module !== null && "default" in module ? module.default : module;
	if (typeof candidate === "function") return candidate;
	const nestedCandidate = typeof candidate === "object" && candidate !== null && "default" in candidate ? candidate.default : void 0;
	return typeof nestedCandidate === "function" ? nestedCandidate : void 0;
}
function isJavaScriptExtensionPath(extensionPath) {
	switch (path$1.extname(extensionPath).toLowerCase()) {
		case ".cjs":
		case ".mjs": return true;
		default: return false;
	}
}
function extensionSourceNeedsJitiAliasResolution(extensionPath) {
	try {
		const source = fs$2.readFileSync(extensionPath, "utf8");
		return EXTENSION_LOADER_ALIAS_IMPORT_PATTERN.test(source) || RELATIVE_EXTENSION_IMPORT_PATTERN.test(source) || path$1.extname(extensionPath).toLowerCase() === ".js" && COMMONJS_EXTENSION_EXPORT_PATTERN.test(source);
	} catch {
		return true;
	}
}
function shouldLoadExtensionWithNativeImport(extensionPath) {
	return !isBunBinary && isJavaScriptExtensionPath(extensionPath) && !extensionSourceNeedsJitiAliasResolution(extensionPath);
}
async function loadNativeExtensionModule(extensionPath) {
	const url = pathToFileURL(extensionPath);
	url.searchParams.set("v", String(++nativeExtensionLoadCounter));
	try {
		const cachedPath = require.resolve(extensionPath);
		delete require.cache[cachedPath];
	} catch {}
	return resolveExtensionFactory(await import(url.href));
}
async function loadExtensionSourceTransformModule(extensionPath, context) {
	if (!context.sourceTransformLoader) {
		installOpenClawInternalCorePackageNativeResolver({ moduleUrl: import.meta.url });
		context.sourceTransformLoader = (await loadCreateJitiLoaderFactory())(import.meta.url, {
			...isBunBinary ? {
				...buildPluginLoaderJitiOptions({}),
				virtualModules: VIRTUAL_MODULES
			} : buildPluginLoaderJitiOptions(getExtensionLoaderAliases()),
			tryNative: false,
			moduleCache: false
		});
	}
	return resolveExtensionFactory(await context.sourceTransformLoader.import(extensionPath, { default: true }));
}
async function loadExtensionModule(extensionPath, context) {
	if (isCurrentCacheScope(context.cacheScope)) {
		const cachedFactory = extensionFactoryCache.get(extensionPath);
		if (cachedFactory) return cachedFactory;
	}
	const factory = shouldLoadExtensionWithNativeImport(extensionPath) ? await loadNativeExtensionModule(extensionPath) : await loadExtensionSourceTransformModule(extensionPath, context);
	if (factory && isCurrentCacheScope(context.cacheScope)) extensionFactoryCache.set(extensionPath, factory);
	return factory;
}
/**
* Create an Extension object with empty collections.
*/
function createExtension(extensionPath, resolvedPath) {
	const source = extensionPath.startsWith("<") && extensionPath.endsWith(">") ? extensionPath.slice(1, -1).split(":")[0] || "temporary" : "local";
	const baseDir = extensionPath.startsWith("<") ? void 0 : path$1.dirname(resolvedPath);
	return {
		path: extensionPath,
		resolvedPath,
		sourceInfo: createSyntheticSourceInfo(extensionPath, {
			source,
			baseDir
		}),
		handlers: /* @__PURE__ */ new Map(),
		tools: /* @__PURE__ */ new Map(),
		messageRenderers: /* @__PURE__ */ new Map(),
		commands: /* @__PURE__ */ new Map(),
		flags: /* @__PURE__ */ new Map(),
		shortcuts: /* @__PURE__ */ new Map()
	};
}
async function loadExtension(extensionPath, cwd, eventBus, runtime, context) {
	const resolvedPath = resolvePath(extensionPath, cwd);
	try {
		const factory = await loadExtensionModule(resolvedPath, context);
		if (!factory) return {
			extension: null,
			error: `Extension does not export a valid factory function: ${extensionPath}`
		};
		const extension = createExtension(extensionPath, resolvedPath);
		await factory(createExtensionAPI(extension, runtime, cwd, eventBus));
		return {
			extension,
			error: null
		};
	} catch (err) {
		return {
			extension: null,
			error: `Failed to load extension: ${err instanceof Error ? err.message : String(err)}`
		};
	}
}
/**
* Create an Extension from an inline factory function.
*/
async function loadExtensionFromFactory(factory, cwd, eventBus, runtime, extensionPath = "<inline>") {
	const extension = createExtension(extensionPath, extensionPath);
	await factory(createExtensionAPI(extension, runtime, cwd, eventBus));
	return extension;
}
/**
* Load extensions from paths.
*/
async function loadExtensionsCached(paths, cwd, eventBus) {
	const extensions = [];
	const errors = [];
	const resolvedEventBus = eventBus ?? createEventBus();
	const runtime = createExtensionRuntime();
	const cacheScope = useExtensionCacheCwd(cwd);
	const resolvedCwd = cacheScope.cwd;
	const context = { cacheScope };
	for (const extPath of paths) {
		const { extension, error } = await loadExtension(extPath, resolvedCwd, resolvedEventBus, runtime, context);
		if (error) {
			errors.push({
				path: extPath,
				error
			});
			continue;
		}
		if (extension) extensions.push(extension);
	}
	return {
		extensions,
		errors,
		runtime
	};
}
//#endregion
//#region src/agents/sessions/extensions/runner.ts
const RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS = [
	"app.interrupt",
	"app.clear",
	"app.exit",
	"app.suspend",
	"app.thinking.cycle",
	"app.model.cycleForward",
	"app.model.cycleBackward",
	"app.model.select",
	"app.tools.expand",
	"app.thinking.toggle",
	"app.editor.external",
	"app.message.followUp",
	"tui.input.submit",
	"tui.select.confirm",
	"tui.select.cancel",
	"tui.input.copy",
	"tui.editor.deleteToLineEnd"
];
const buildBuiltinKeybindings = (resolvedKeybindings) => {
	const builtinKeybindings = {};
	for (const [keybinding, keys] of Object.entries(resolvedKeybindings)) {
		if (keys === void 0) continue;
		const keyList = Array.isArray(keys) ? keys : [keys];
		const restrictOverride = RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS.includes(keybinding);
		for (const key of keyList) {
			const normalizedKey = key.toLowerCase();
			if (builtinKeybindings[normalizedKey]?.restrictOverride && !restrictOverride) continue;
			builtinKeybindings[normalizedKey] = {
				keybinding,
				restrictOverride
			};
		}
	}
	return builtinKeybindings;
};
/**
* Helper function to emit session_shutdown event to extensions.
* Returns true if the event was emitted, false if there were no handlers.
*/
async function emitSessionShutdownEvent(extensionRunner, event) {
	if (extensionRunner.hasHandlers("session_shutdown")) {
		await extensionRunner.emit(event);
		return true;
	}
	return false;
}
const noOpUIContext = {
	select: async () => void 0,
	confirm: async () => false,
	input: async () => void 0,
	notify: () => {},
	onTerminalInput: () => () => {},
	setStatus: () => {},
	setWorkingMessage: () => {},
	setWorkingVisible: () => {},
	setWorkingIndicator: () => {},
	setHiddenThinkingLabel: () => {},
	setWidget: () => {},
	setFooter: () => {},
	setHeader: () => {},
	setTitle: () => {},
	custom: async () => void 0,
	pasteToEditor: () => {},
	setEditorText: () => {},
	getEditorText: () => "",
	editor: async () => void 0,
	addAutocompleteProvider: () => {},
	setEditorComponent: () => {},
	getEditorComponent: () => void 0,
	get theme() {
		return interactiveAgentTheme;
	},
	getAllThemes: () => [],
	getTheme: () => void 0,
	setTheme: (nextTheme) => {
		return {
			success: false,
			error: "UI not available"
		};
	},
	getToolsExpanded: () => false,
	setToolsExpanded: () => {}
};
var ExtensionRunner = class {
	constructor(extensions, runtime, cwd, sessionManager, modelRegistry) {
		this.errorListeners = /* @__PURE__ */ new Set();
		this.getModel = () => void 0;
		this.isIdleFn = () => true;
		this.getSignalFn = () => void 0;
		this.waitForIdleFn = async () => {};
		this.abortFn = () => {};
		this.hasPendingMessagesFn = () => false;
		this.getContextUsageFn = () => void 0;
		this.compactFn = () => {};
		this.getSystemPromptFn = () => "";
		this.newSessionHandler = async () => ({ cancelled: false });
		this.forkHandler = async () => ({ cancelled: false });
		this.navigateTreeHandler = async () => ({ cancelled: false });
		this.switchSessionHandler = async () => ({ cancelled: false });
		this.reloadHandler = async () => {};
		this.shutdownHandler = () => {};
		this.shortcutDiagnostics = [];
		this.commandDiagnostics = [];
		this.extensions = extensions;
		this.runtime = runtime;
		this.uiContext = noOpUIContext;
		this.cwd = cwd;
		this.sessionManager = sessionManager;
		this.modelRegistry = modelRegistry;
	}
	bindCore(actions, contextActions, providerActions) {
		this.runtime.sendMessage = actions.sendMessage;
		this.runtime.sendUserMessage = actions.sendUserMessage;
		this.runtime.appendEntry = actions.appendEntry;
		this.runtime.setSessionName = actions.setSessionName;
		this.runtime.getSessionName = actions.getSessionName;
		this.runtime.setLabel = actions.setLabel;
		this.runtime.getActiveTools = actions.getActiveTools;
		this.runtime.getAllTools = actions.getAllTools;
		this.runtime.setActiveTools = actions.setActiveTools;
		this.runtime.refreshTools = actions.refreshTools;
		this.runtime.getCommands = actions.getCommands;
		this.runtime.setModel = actions.setModel;
		this.runtime.getThinkingLevel = actions.getThinkingLevel;
		this.runtime.setThinkingLevel = actions.setThinkingLevel;
		this.getModel = contextActions.getModel;
		this.isIdleFn = contextActions.isIdle;
		this.getSignalFn = contextActions.getSignal;
		this.abortFn = contextActions.abort;
		this.hasPendingMessagesFn = contextActions.hasPendingMessages;
		this.shutdownHandler = contextActions.shutdown;
		this.getContextUsageFn = contextActions.getContextUsage;
		this.compactFn = contextActions.compact;
		this.getSystemPromptFn = contextActions.getSystemPrompt;
		for (const { name, config, extensionPath } of this.runtime.pendingProviderRegistrations) try {
			if (providerActions?.registerProvider) providerActions.registerProvider(name, config);
			else this.modelRegistry.registerProvider(name, config);
		} catch (err) {
			this.emitError({
				extensionPath,
				event: "register_provider",
				error: coerceErrorMessage(err),
				stack: err instanceof Error ? err.stack : void 0
			});
		}
		this.runtime.pendingProviderRegistrations = [];
		this.runtime.registerProvider = (name, config) => {
			if (providerActions?.registerProvider) {
				providerActions.registerProvider(name, config);
				return;
			}
			this.modelRegistry.registerProvider(name, config);
		};
		this.runtime.unregisterProvider = (name) => {
			if (providerActions?.unregisterProvider) {
				providerActions.unregisterProvider(name);
				return;
			}
			this.modelRegistry.unregisterProvider(name);
		};
	}
	bindCommandContext(actions) {
		if (actions) {
			this.waitForIdleFn = actions.waitForIdle;
			this.newSessionHandler = actions.newSession;
			this.forkHandler = actions.fork;
			this.navigateTreeHandler = actions.navigateTree;
			this.switchSessionHandler = actions.switchSession;
			this.reloadHandler = actions.reload;
			return;
		}
		this.waitForIdleFn = async () => {};
		this.newSessionHandler = async () => ({ cancelled: false });
		this.forkHandler = async () => ({ cancelled: false });
		this.navigateTreeHandler = async () => ({ cancelled: false });
		this.switchSessionHandler = async () => ({ cancelled: false });
		this.reloadHandler = async () => {};
	}
	setUIContext(uiContext) {
		this.uiContext = uiContext ?? noOpUIContext;
	}
	getUIContext() {
		return this.uiContext;
	}
	hasUI() {
		return this.uiContext !== noOpUIContext;
	}
	getExtensionPaths() {
		return this.extensions.map((e) => e.path);
	}
	/** Get all registered tools from all extensions (first registration per name wins). */
	getAllRegisteredTools() {
		const toolsByName = /* @__PURE__ */ new Map();
		for (const ext of this.extensions) for (const tool of ext.tools.values()) if (!toolsByName.has(tool.definition.name)) toolsByName.set(tool.definition.name, tool);
		return Array.from(toolsByName.values());
	}
	/** Get a tool definition by name. Returns undefined if not found. */
	getToolDefinition(toolName) {
		for (const ext of this.extensions) {
			const tool = ext.tools.get(toolName);
			if (tool) return tool.definition;
		}
	}
	getFlags() {
		const allFlags = /* @__PURE__ */ new Map();
		for (const ext of this.extensions) for (const [name, flag] of ext.flags) if (!allFlags.has(name)) allFlags.set(name, flag);
		return allFlags;
	}
	setFlagValue(name, value) {
		this.runtime.flagValues.set(name, value);
	}
	getFlagValues() {
		return new Map(this.runtime.flagValues);
	}
	getShortcuts(resolvedKeybindings) {
		this.shortcutDiagnostics = [];
		const builtinKeybindings = buildBuiltinKeybindings(resolvedKeybindings);
		const extensionShortcuts = /* @__PURE__ */ new Map();
		const addDiagnostic = (message, extensionPath) => {
			this.shortcutDiagnostics.push({
				type: "warning",
				message,
				path: extensionPath
			});
			if (!this.hasUI()) console.warn(message);
		};
		for (const ext of this.extensions) for (const [key, shortcut] of ext.shortcuts) {
			const normalizedKey = key.toLowerCase();
			const builtInKeybinding = builtinKeybindings[normalizedKey];
			if (builtInKeybinding?.restrictOverride === true) {
				addDiagnostic(`Extension shortcut '${key}' from ${shortcut.extensionPath} conflicts with built-in shortcut. Skipping.`, shortcut.extensionPath);
				continue;
			}
			if (builtInKeybinding?.restrictOverride === false) addDiagnostic(`Extension shortcut conflict: '${key}' is built-in shortcut for ${builtInKeybinding.keybinding} and ${shortcut.extensionPath}. Using ${shortcut.extensionPath}.`, shortcut.extensionPath);
			const existingExtensionShortcut = extensionShortcuts.get(normalizedKey);
			if (existingExtensionShortcut) addDiagnostic(`Extension shortcut conflict: '${key}' registered by both ${existingExtensionShortcut.extensionPath} and ${shortcut.extensionPath}. Using ${shortcut.extensionPath}.`, shortcut.extensionPath);
			extensionShortcuts.set(normalizedKey, shortcut);
		}
		return extensionShortcuts;
	}
	getShortcutDiagnostics() {
		return this.shortcutDiagnostics;
	}
	invalidate(message = "This extension ctx is stale after session replacement or reload. Do not use a captured api or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().") {
		if (!this.staleMessage) {
			this.staleMessage = message;
			this.runtime.invalidate(message);
		}
	}
	assertActive() {
		if (this.staleMessage) throw new Error(this.staleMessage);
	}
	onError(listener) {
		this.errorListeners.add(listener);
		return () => this.errorListeners.delete(listener);
	}
	emitError(error) {
		for (const listener of this.errorListeners) listener(error);
	}
	hasHandlers(eventType) {
		for (const ext of this.extensions) {
			const handlers = ext.handlers.get(eventType);
			if (handlers && handlers.length > 0) return true;
		}
		return false;
	}
	getMessageRenderer(customType) {
		for (const ext of this.extensions) {
			const renderer = ext.messageRenderers.get(customType);
			if (renderer) return renderer;
		}
	}
	resolveRegisteredCommands() {
		const commands = [];
		const counts = /* @__PURE__ */ new Map();
		for (const ext of this.extensions) for (const command of ext.commands.values()) {
			commands.push(command);
			counts.set(command.name, (counts.get(command.name) ?? 0) + 1);
		}
		const seen = /* @__PURE__ */ new Map();
		const takenInvocationNames = /* @__PURE__ */ new Set();
		return commands.map((command) => {
			const occurrence = (seen.get(command.name) ?? 0) + 1;
			seen.set(command.name, occurrence);
			let invocationName = (counts.get(command.name) ?? 0) > 1 ? `${command.name}:${occurrence}` : command.name;
			if (takenInvocationNames.has(invocationName)) {
				let suffix = occurrence;
				do {
					suffix++;
					invocationName = `${command.name}:${suffix}`;
				} while (takenInvocationNames.has(invocationName));
			}
			takenInvocationNames.add(invocationName);
			return Object.assign({}, command, { invocationName });
		});
	}
	getRegisteredCommands() {
		this.commandDiagnostics = [];
		return this.resolveRegisteredCommands();
	}
	getCommandDiagnostics() {
		return this.commandDiagnostics;
	}
	getCommand(name) {
		return this.resolveRegisteredCommands().find((command) => command.invocationName === name);
	}
	/**
	* Request a graceful shutdown. Called by extension tools and event handlers.
	* The actual shutdown behavior is provided by the mode via bindExtensions().
	*/
	shutdown() {
		this.shutdownHandler();
	}
	/**
	* Create an ExtensionContext for use in event handlers and tool execution.
	* Context values are resolved at call time, so changes via bindCore/bindUI are reflected.
	*/
	createContext() {
		const requireActiveRunner = () => {
			this.assertActive();
			return this;
		};
		const getModel = this.getModel;
		return {
			get ui() {
				return requireActiveRunner().uiContext;
			},
			get hasUI() {
				return requireActiveRunner().hasUI();
			},
			get cwd() {
				return requireActiveRunner().cwd;
			},
			get sessionManager() {
				return requireActiveRunner().sessionManager;
			},
			get modelRegistry() {
				return requireActiveRunner().modelRegistry;
			},
			get model() {
				requireActiveRunner();
				return getModel();
			},
			isIdle: () => requireActiveRunner().isIdleFn(),
			get signal() {
				return requireActiveRunner().getSignalFn();
			},
			abort: () => requireActiveRunner().abortFn(),
			hasPendingMessages: () => requireActiveRunner().hasPendingMessagesFn(),
			shutdown: () => requireActiveRunner().shutdownHandler(),
			getContextUsage: () => requireActiveRunner().getContextUsageFn(),
			compact: (options) => requireActiveRunner().compactFn(options),
			getSystemPrompt: () => requireActiveRunner().getSystemPromptFn()
		};
	}
	createCommandContext() {
		const context = Object.defineProperties({}, Object.getOwnPropertyDescriptors(this.createContext()));
		context.waitForIdle = () => {
			this.assertActive();
			return this.waitForIdleFn();
		};
		context.newSession = (options) => {
			this.assertActive();
			return this.newSessionHandler(options);
		};
		context.fork = (entryId, options) => {
			this.assertActive();
			return this.forkHandler(entryId, options);
		};
		context.navigateTree = (targetId, options) => {
			this.assertActive();
			return this.navigateTreeHandler(targetId, options);
		};
		context.switchSession = (sessionPath, options) => {
			this.assertActive();
			return this.switchSessionHandler(sessionPath, options);
		};
		context.reload = () => {
			this.assertActive();
			return this.reloadHandler();
		};
		return context;
	}
	isSessionBeforeEvent(event) {
		return event.type === "session_before_switch" || event.type === "session_before_fork" || event.type === "session_before_compact" || event.type === "session_before_tree";
	}
	async dispatchHandlers(eventType, invoke, ctx) {
		let handlerContext = ctx;
		for (const ext of this.extensions) for (const handler of ext.handlers.get(eventType) ?? []) {
			handlerContext ??= this.createContext();
			try {
				const result = await invoke(handler, handlerContext, ext.path);
				if (result !== void 0) return result;
			} catch (err) {
				this.emitError({
					extensionPath: ext.path,
					event: eventType,
					error: coerceErrorMessage(err),
					stack: err instanceof Error ? err.stack : void 0
				});
			}
		}
	}
	async emit(event) {
		let result;
		return await this.dispatchHandlers(event.type, async (handler, ctx) => {
			const handlerResult = await handler(event, ctx);
			if (this.isSessionBeforeEvent(event) && handlerResult) {
				result = handlerResult;
				if (result.cancel) return result;
			}
		}) ?? result;
	}
	async emitMessageEnd(event) {
		let currentMessage = event.message;
		let modified = false;
		await this.dispatchHandlers("message_end", async (handler, ctx, extensionPath) => {
			const handlerResult = await handler({
				...event,
				message: currentMessage
			}, ctx);
			if (handlerResult?.message) {
				if (handlerResult.message.role !== currentMessage.role) this.emitError({
					extensionPath,
					event: "message_end",
					error: "message_end handlers must return a message with the same role"
				});
				else {
					currentMessage = handlerResult.message;
					modified = true;
				}
			}
		});
		return modified ? currentMessage : void 0;
	}
	async emitToolResult(event) {
		const currentEvent = { ...event };
		let modified = false;
		await this.dispatchHandlers("tool_result", async (handler, ctx) => {
			const handlerResult = await handler(currentEvent, ctx);
			if (handlerResult?.content !== void 0) {
				currentEvent.content = handlerResult.content;
				modified = true;
			}
			if (handlerResult?.details !== void 0) {
				currentEvent.details = handlerResult.details;
				modified = true;
			}
			if (handlerResult?.isError !== void 0) {
				currentEvent.isError = handlerResult.isError;
				modified = true;
			}
			if (handlerResult?.terminate !== void 0) {
				currentEvent.terminate = handlerResult.terminate;
				modified = true;
			}
		});
		if (!modified) return;
		return {
			content: currentEvent.content,
			details: currentEvent.details,
			isError: currentEvent.isError,
			terminate: currentEvent.terminate
		};
	}
	async emitToolCall(event) {
		let ctx;
		let result;
		for (const ext of this.extensions) {
			const handlers = ext.handlers.get("tool_call");
			if (!handlers || handlers.length === 0) continue;
			for (const handler of handlers) {
				ctx ??= this.createContext();
				const handlerResult = await handler(event, ctx);
				if (handlerResult) {
					result = handlerResult;
					if (result.block) return result;
				}
			}
		}
		return result;
	}
	async emitUserBash(event) {
		return await this.dispatchHandlers("user_bash", async (handler, ctx) => {
			const handlerResult = await handler(event, ctx);
			return handlerResult ? handlerResult : void 0;
		});
	}
	async emitContext(messages) {
		if (!this.hasHandlers("context")) return messages;
		let currentMessages = structuredClone(messages);
		await this.dispatchHandlers("context", async (handler, ctx) => {
			const handlerResult = await handler({
				type: "context",
				messages: currentMessages
			}, ctx);
			if (handlerResult?.messages) currentMessages = handlerResult.messages;
		});
		return currentMessages;
	}
	async emitBeforeProviderRequest(payload) {
		let currentPayload = payload;
		await this.dispatchHandlers("before_provider_request", async (handler, ctx) => {
			const handlerResult = await handler({
				type: "before_provider_request",
				payload: currentPayload
			}, ctx);
			if (handlerResult !== void 0) currentPayload = handlerResult;
		});
		return currentPayload;
	}
	async emitBeforeAgentStart(prompt, images, systemPrompt, systemPromptOptions) {
		let currentSystemPrompt = systemPrompt;
		const ctx = Object.defineProperties({}, Object.getOwnPropertyDescriptors(this.createContext()));
		ctx.getSystemPrompt = () => {
			this.assertActive();
			return currentSystemPrompt;
		};
		const messages = [];
		let systemPromptModified = false;
		await this.dispatchHandlers("before_agent_start", async (handler, handlerCtx) => {
			const handlerResult = await handler({
				type: "before_agent_start",
				prompt,
				images,
				systemPrompt: currentSystemPrompt,
				systemPromptOptions
			}, handlerCtx);
			if (handlerResult?.message) messages.push(handlerResult.message);
			if (handlerResult?.systemPrompt !== void 0) {
				currentSystemPrompt = handlerResult.systemPrompt;
				systemPromptModified = true;
			}
		}, ctx);
		if (messages.length > 0 || systemPromptModified) return {
			messages: messages.length > 0 ? messages : void 0,
			systemPrompt: systemPromptModified ? currentSystemPrompt : void 0
		};
	}
	async emitResourcesDiscover(cwd, reason) {
		const skillPaths = [];
		const promptPaths = [];
		const themePaths = [];
		await this.dispatchHandlers("resources_discover", async (handler, ctx, extensionPath) => {
			const result = await handler({
				type: "resources_discover",
				cwd,
				reason
			}, ctx);
			if (result?.skillPaths?.length) skillPaths.push(...result.skillPaths.map((path) => ({
				path,
				extensionPath
			})));
			if (result?.promptPaths?.length) promptPaths.push(...result.promptPaths.map((path) => ({
				path,
				extensionPath
			})));
			if (result?.themePaths?.length) themePaths.push(...result.themePaths.map((path) => ({
				path,
				extensionPath
			})));
		});
		return {
			skillPaths,
			promptPaths,
			themePaths
		};
	}
	/** Emit input event. Transforms chain, "handled" short-circuits. */
	async emitInput(text, images, source) {
		let currentText = text;
		let currentImages = images;
		const handled = await this.dispatchHandlers("input", async (handler, ctx) => {
			const result = await handler({
				type: "input",
				text: currentText,
				images: currentImages,
				source
			}, ctx);
			if (result?.action === "handled") return result;
			if (result?.action === "transform") {
				currentText = result.text;
				currentImages = result.images ?? currentImages;
			}
		});
		if (handled) return handled;
		return currentText !== text || currentImages !== images ? {
			action: "transform",
			text: currentText,
			images: currentImages
		} : { action: "continue" };
	}
};
//#endregion
//#region src/agents/sessions/queued-user-message-retirement.ts
const queuedUserMessageRetirements = /* @__PURE__ */ new WeakMap();
/** Binds one runtime message to the exact display entry created for it. */
function registerQueuedUserMessageRetirement(message, retire) {
	queuedUserMessageRetirements.set(message, retire);
}
/** Consumes the display retirement owned by this exact runtime message. */
function retireQueuedUserMessage(message) {
	const retire = queuedUserMessageRetirements.get(message);
	if (!retire) return false;
	queuedUserMessageRetirements.delete(message);
	return retire();
}
//#endregion
//#region src/agents/sessions/steering-message-identity.ts
const STEERING_MESSAGE_IDENTITY = Symbol.for("openclaw.steeringMessageIdentity");
const steeringMessagePersistenceFailureListeners = /* @__PURE__ */ new Map();
function setSteeringMessageIdentity(message, identity) {
	if (identity) Object.defineProperty(message, STEERING_MESSAGE_IDENTITY, {
		configurable: true,
		value: identity
	});
}
function getSteeringMessageIdentity(message) {
	return message && typeof message === "object" ? message[STEERING_MESSAGE_IDENTITY] : void 0;
}
/** Keeps persistence failures private to the exact in-flight steering identity. */
function subscribeSteeringMessagePersistenceFailure(identity, listener) {
	const listeners = steeringMessagePersistenceFailureListeners.get(identity) ?? /* @__PURE__ */ new Set();
	listeners.add(listener);
	steeringMessagePersistenceFailureListeners.set(identity, listeners);
	return () => {
		listeners.delete(listener);
		if (listeners.size === 0 && steeringMessagePersistenceFailureListeners.get(identity) === listeners) steeringMessagePersistenceFailureListeners.delete(identity);
	};
}
/** Rejects a queued receipt before a failed append can strand or acknowledge its source. */
function reportSteeringMessagePersistenceFailure(message, error) {
	const identity = getSteeringMessageIdentity(message);
	if (identity) steeringMessagePersistenceFailureListeners.get(identity)?.forEach((listener) => listener(error));
}
//#endregion
//#region src/shared/tilde-path.ts
/**
* Expands a leading `~` against the OS home dir, keeping relative inputs
* relative so callers can resolve them against their own base dir. Unlike
* `resolveHomeRelativePath`, `~name` is treated as `<home>/name` (shipped
* loader behavior for prompt/skill path lists).
*/
function expandTildePath(input) {
	const trimmed = input.trim();
	if (trimmed === "~") return homedir();
	if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
	if (trimmed.startsWith("~")) return join(homedir(), trimmed.slice(1));
	return trimmed;
}
//#endregion
//#region src/skills/loading/session.ts
/** Max name length per spec */
const MAX_NAME_LENGTH = 64;
/** Max description length per spec */
const MAX_DESCRIPTION_LENGTH = 1024;
/**
* Validate skill name per Agent Skills spec.
* Returns array of validation error messages (empty if valid).
*/
function validateName(name) {
	const errors = [];
	if (name.length > MAX_NAME_LENGTH) errors.push(`name exceeds ${MAX_NAME_LENGTH} characters (${name.length})`);
	if (!/^[a-z0-9-]+$/.test(name)) errors.push(`name contains invalid characters (must be lowercase a-z, 0-9, hyphens only)`);
	if (name.startsWith("-") || name.endsWith("-")) errors.push(`name must not start or end with a hyphen`);
	if (name.includes("--")) errors.push(`name must not contain consecutive hyphens`);
	return errors;
}
/**
* Validate description per Agent Skills spec.
*/
function validateDescription(description) {
	const errors = [];
	if (!description || description.trim() === "") errors.push("description is required");
	else if (description.length > MAX_DESCRIPTION_LENGTH) errors.push(`description exceeds ${MAX_DESCRIPTION_LENGTH} characters (${description.length})`);
	return errors;
}
function createSkillSourceInfo(filePath, baseDir, source) {
	switch (source) {
		case "user": return createSyntheticSourceInfo(filePath, {
			source: "local",
			scope: "user",
			baseDir
		});
		case "project": return createSyntheticSourceInfo(filePath, {
			source: "local",
			scope: "project",
			baseDir
		});
		case "path": return createSyntheticSourceInfo(filePath, {
			source: "local",
			baseDir
		});
		default: return createSyntheticSourceInfo(filePath, {
			source,
			baseDir
		});
	}
}
function loadSkillsFromDirInternal(dir, source, includeRootFiles, ignoreMatcher, rootDir) {
	const skills = [];
	const diagnostics = [];
	if (!existsSync(dir)) return {
		skills,
		diagnostics
	};
	const root = rootDir ?? dir;
	const ig = ignoreMatcher ? addIgnoreRules(dir, root, ignoreMatcher, { ignoreCase: true }) : addIgnoreRules(dir, root);
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name !== "SKILL.md") continue;
			const fullPath = join(dir, entry.name);
			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) try {
				isFile = statSync(fullPath).isFile();
			} catch {
				continue;
			}
			const relPath = normalizeNativePathSeparators(relative(root, fullPath));
			if (!isFile || ig.ignores(relPath)) continue;
			const result = loadSkillFromFile(fullPath, source);
			if (result.skill) skills.push(result.skill);
			diagnostics.push(...result.diagnostics);
			return {
				skills,
				diagnostics
			};
		}
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			if (entry.name === "node_modules") continue;
			const fullPath = join(dir, entry.name);
			let isDirectory = entry.isDirectory();
			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) try {
				const stats = statSync(fullPath);
				isDirectory = stats.isDirectory();
				isFile = stats.isFile();
			} catch {
				continue;
			}
			const relPath = normalizeNativePathSeparators(relative(root, fullPath));
			const ignorePath = isDirectory ? `${relPath}/` : relPath;
			if (ig.ignores(ignorePath)) continue;
			if (isDirectory) {
				const subResult = loadSkillsFromDirInternal(fullPath, source, false, ig, root);
				skills.push(...subResult.skills);
				diagnostics.push(...subResult.diagnostics);
				continue;
			}
			if (!isFile || !includeRootFiles || !entry.name.endsWith(".md")) continue;
			const result = loadSkillFromFile(fullPath, source);
			if (result.skill) skills.push(result.skill);
			diagnostics.push(...result.diagnostics);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "failed to scan skill directory";
		diagnostics.push({
			type: "warning",
			message,
			path: dir
		});
	}
	return {
		skills,
		diagnostics
	};
}
function loadSkillFromFile(filePath, source) {
	const diagnostics = [];
	try {
		const rawContent = readFileSync(filePath, "utf-8");
		const frontmatter = parseSkillFrontmatter(rawContent);
		const invocation = resolveSkillInvocationPolicy(frontmatter);
		const skillDir = dirname(filePath);
		const parentDirName = basename(skillDir);
		const descErrors = validateDescription(frontmatter.description);
		for (const error of descErrors) diagnostics.push({
			type: "warning",
			message: error,
			path: filePath
		});
		const name = frontmatter.name || parentDirName;
		const nameErrors = validateName(name);
		for (const error of nameErrors) diagnostics.push({
			type: "warning",
			message: error,
			path: filePath
		});
		if (!frontmatter.description || frontmatter.description.trim() === "") return {
			skill: null,
			diagnostics
		};
		return {
			skill: {
				name,
				displayName: resolveSkillDisplayName(rawContent, name),
				description: frontmatter.description,
				filePath,
				baseDir: skillDir,
				source,
				sourceInfo: createSkillSourceInfo(filePath, skillDir, source),
				disableModelInvocation: invocation.disableModelInvocation
			},
			diagnostics
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "failed to parse skill file";
		diagnostics.push({
			type: "warning",
			message,
			path: filePath
		});
		return {
			skill: null,
			diagnostics
		};
	}
}
/**
* Format skills for inclusion in a system prompt.
* Uses XML format per Agent Skills standard.
* See: https://agentskills.io/integrate-skills
*
* Skills with disableModelInvocation=true are excluded from the prompt
* (they can only be invoked explicitly via /skill:name commands).
*/
function formatSkillsForPrompt(skills) {
	const visibleSkills = skills.filter((s) => !s.disableModelInvocation);
	return formatSkillsForPromptBounded({ skills: visibleSkills });
}
function resolveSkillPath(p, cwd) {
	const normalized = expandTildePath(p);
	return isAbsolute(normalized) ? normalized : resolve(cwd, normalized);
}
/**
* Load skills from all configured locations.
* Returns skills and any validation diagnostics.
*/
function loadSkills(options) {
	const { cwd, agentDir, skillPaths, includeDefaults } = options;
	const resolvedAgentDir = agentDir ?? getAgentDir();
	const skillMap = /* @__PURE__ */ new Map();
	const realPathSet = /* @__PURE__ */ new Set();
	const allDiagnostics = [];
	const collisionDiagnostics = [];
	function addSkills(result) {
		allDiagnostics.push(...result.diagnostics);
		for (const skill of result.skills) {
			const realPath = canonicalizePath(skill.filePath);
			if (realPathSet.has(realPath)) continue;
			const existing = skillMap.get(skill.name);
			if (existing) collisionDiagnostics.push({
				type: "collision",
				message: `name "${skill.name}" collision`,
				path: skill.filePath,
				collision: {
					resourceType: "skill",
					name: skill.name,
					winnerPath: existing.filePath,
					loserPath: skill.filePath
				}
			});
			else {
				skillMap.set(skill.name, skill);
				realPathSet.add(realPath);
			}
		}
	}
	if (includeDefaults) {
		addSkills(loadSkillsFromDirInternal(join(resolvedAgentDir, "skills"), "user", true));
		addSkills(loadSkillsFromDirInternal(resolve(cwd, CONFIG_DIR_NAME, "skills"), "project", true));
	}
	const userSkillsDir = join(resolvedAgentDir, "skills");
	const projectSkillsDir = resolve(cwd, CONFIG_DIR_NAME, "skills");
	const getSource = (resolvedPath) => {
		if (!includeDefaults) {
			if (isPathInside(userSkillsDir, resolvedPath)) return "user";
			if (isPathInside(projectSkillsDir, resolvedPath)) return "project";
		}
		return "path";
	};
	for (const rawPath of skillPaths) {
		const resolvedPath = resolveSkillPath(rawPath, cwd);
		if (!existsSync(resolvedPath)) {
			allDiagnostics.push({
				type: "warning",
				message: "skill path does not exist",
				path: resolvedPath
			});
			continue;
		}
		try {
			const stats = statSync(resolvedPath);
			const source = getSource(resolvedPath);
			if (stats.isDirectory()) addSkills(loadSkillsFromDirInternal(resolvedPath, source, true));
			else if (stats.isFile() && resolvedPath.endsWith(".md")) {
				const result = loadSkillFromFile(resolvedPath, source);
				if (result.skill) addSkills({
					skills: [result.skill],
					diagnostics: result.diagnostics
				});
				else allDiagnostics.push(...result.diagnostics);
			} else allDiagnostics.push({
				type: "warning",
				message: "skill path is not a markdown file",
				path: resolvedPath
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "failed to read skill path";
			allDiagnostics.push({
				type: "warning",
				message,
				path: resolvedPath
			});
		}
	}
	return {
		skills: Array.from(skillMap.values()),
		diagnostics: [...allDiagnostics, ...collisionDiagnostics]
	};
}
//#endregion
//#region src/agents/promised-work-prompt.ts
/** Shared prompt policy for commitments that outlive the current turn. */
function buildPromisedWorkPromptSection() {
	return [
		"## Promised Work",
		"- Promising future, background, delegated, or continued work creates follow-through ownership.",
		"- Before ending a turn, arrange an available completion or watch path; keep the originating request and any existing goal or task open.",
		"- Proactively return with the result, link, proof, or a concrete blocker; do not wait for the requester to ask.",
		"- If no completion path exists, do not promise later; stay in the turn or state the blocker.",
		"- Progress such as `running` is not completion.",
		""
	];
}
//#endregion
//#region src/agents/sessions/system-prompt.ts
/**
* System prompt construction and project context loading
*/
/** Build the system prompt with tools, guidelines, and context */
function buildSystemPrompt(options) {
	const { customPrompt, selectedTools, toolSnippets, promptGuidelines, appendSystemPrompt, cwd, contextFiles: providedContextFiles, skills: providedSkills } = options;
	const promptCwd = cwd.replace(/\\/g, "/");
	const now = /* @__PURE__ */ new Date();
	const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
	const appendSection = appendSystemPrompt ? `\n\n${appendSystemPrompt}` : "";
	const contextFiles = providedContextFiles ?? [];
	const skills = providedSkills ?? [];
	if (customPrompt) {
		let prompt = customPrompt;
		if (appendSection) prompt += appendSection;
		if (contextFiles.length > 0) {
			prompt += "\n\n<project_context>\n\n";
			prompt += "Project-specific instructions and guidelines:\n\n";
			for (const { path: filePath, content } of contextFiles) prompt += `<project_instructions path="${filePath}">\n${content}\n</project_instructions>\n\n`;
			prompt += "</project_context>\n";
		}
		if ((!selectedTools || selectedTools.includes("read")) && skills.length > 0) prompt += formatSkillsForPrompt(skills);
		prompt += `\nCurrent date: ${date}`;
		prompt += `\nCurrent working directory: ${promptCwd}`;
		return prompt;
	}
	const readmePath = getReadmePath();
	const docsPath = getDocsPath();
	const examplesPath = getExamplesPath();
	const tools = selectedTools || [
		"read",
		"bash",
		"edit",
		"write"
	];
	const visibleTools = tools.filter((name) => Boolean(toolSnippets?.[name]));
	const toolsList = visibleTools.length > 0 ? visibleTools.map((name) => `- ${name}: ${toolSnippets[name]}`).join("\n") : "(none)";
	const guidelinesList = [];
	const guidelinesSet = /* @__PURE__ */ new Set();
	const addGuideline = (guideline) => {
		if (guidelinesSet.has(guideline)) return;
		guidelinesSet.add(guideline);
		guidelinesList.push(guideline);
	};
	const hasBash = tools.includes("bash");
	const hasGrep = tools.includes("grep");
	const hasFind = tools.includes("find");
	const hasLs = tools.includes("ls");
	const hasRead = tools.includes("read");
	if (hasBash && !hasGrep && !hasFind && !hasLs) addGuideline("Use bash for file operations like ls, rg, find");
	else if (hasBash && (hasGrep || hasFind || hasLs)) addGuideline("Prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)");
	for (const guideline of promptGuidelines ?? []) {
		const normalized = guideline.trim();
		if (normalized.length > 0) addGuideline(normalized);
	}
	addGuideline("Be concise in your responses");
	addGuideline("Show file paths clearly when working with files");
	let prompt = `You are an expert coding assistant operating inside OpenClaw's embedded coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
${toolsList}

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
${guidelinesList.map((g) => `- ${g}`).join("\n")}

${buildPromisedWorkPromptSection().join("\n")}

Embedded agent documentation (read only when the user asks about the embedded agent SDK, extensions, themes, skills, or TUI):
- Main documentation: ${readmePath}
- Additional docs: ${docsPath}
- Examples: ${examplesPath} (extensions, custom tools, SDK)
- When reading embedded agent docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), runtime packages (docs/packages.md)
- When working on embedded agent topics, read the docs and examples, and follow .md cross-references before implementing
- Always read embedded agent .md files completely and follow links to related docs (e.g., tui.md for TUI API details)`;
	if (appendSection) prompt += appendSection;
	if (contextFiles.length > 0) {
		prompt += "\n\n<project_context>\n\n";
		prompt += "Project-specific instructions and guidelines:\n\n";
		for (const { path: filePath, content } of contextFiles) prompt += `<project_instructions path="${filePath}">\n${content}\n</project_instructions>\n\n`;
		prompt += "</project_context>\n";
	}
	if (hasRead && skills.length > 0) prompt += formatSkillsForPrompt(skills);
	prompt += `\nCurrent date: ${date}`;
	prompt += `\nCurrent working directory: ${promptCwd}`;
	return prompt;
}
//#endregion
//#region src/agents/sessions/agent-session-base.ts
const log = createSubsystemLogger("agents/session");
var AgentSessionBase = class {
	constructor(config) {
		this.eventListeners = [];
		this.steeringMessages = [];
		this.followUpMessages = [];
		this.pendingNextTurnMessages = [];
		this.compactionAbortController = void 0;
		this.autoCompactionAbortController = void 0;
		this.overflowRecoveryAttempts = 0;
		this.branchSummaryAbortController = void 0;
		this.extensionModifiedToolResultIds = /* @__PURE__ */ new Set();
		this.retryAbortController = void 0;
		this.retryCount = 0;
		this.bashAbortController = void 0;
		this.pendingBashMessages = [];
		this.turnIndex = 0;
		this.baseToolDefinitions = /* @__PURE__ */ new Map();
		this.toolRegistry = /* @__PURE__ */ new Map();
		this.toolDefinitions = /* @__PURE__ */ new Map();
		this.toolPromptSnippets = /* @__PURE__ */ new Map();
		this.toolPromptGuidelines = /* @__PURE__ */ new Map();
		this.baseSystemPrompt = "";
		this.lastAssistantMessage = void 0;
		this.lastRunEndedForTurnHandoff = false;
		this.handleAgentEvent = async (event, signal) => {
			if (event.type === "agent_end") {
				const reason = signal?.reason;
				this.lastRunEndedForTurnHandoff = signal?.aborted === true && typeof reason === "object" && reason !== null && reason.turnHandoff === true;
			}
			if (this.eventMayWriteSession(event)) {
				await this.runWithSessionWriteSettlement(async () => await this.handleAgentEventUnlocked(event));
				return;
			}
			await this.handleAgentEventUnlocked(event);
		};
		this.agent = config.agent;
		this.sessionManager = config.sessionManager;
		this.settingsManager = config.settingsManager;
		this.scopedModelEntries = config.scopedModels ?? [];
		this.sessionResourceLoader = config.resourceLoader;
		this.customTools = config.customTools ?? [];
		this.cwd = config.cwd;
		this.sessionModelRegistry = config.modelRegistry;
		this.extensionRunnerRef = config.extensionRunnerRef;
		this.initialActiveToolNames = config.initialActiveToolNames;
		this.allowedToolNames = config.allowedToolNames ? new Set(config.allowedToolNames) : void 0;
		this.disableBuiltInTools = config.disableBuiltInTools === true;
		this.baseToolsOverride = config.baseToolsOverride;
		this.sessionStartEvent = config.sessionStartEvent ?? {
			type: "session_start",
			reason: "startup"
		};
		this.withExternalSessionWriteSettlement = config.withSessionWriteSettlement;
		this.contextOverflowRecoveryOwner = config.contextOverflowRecoveryOwner ?? "session";
		this.cleanupProviderSessionResourcesOnDispose = config.cleanupProviderSessionResourcesOnDispose ?? true;
	}
	/** Model registry for API key resolution and model discovery */
	get modelRegistry() {
		return this.sessionModelRegistry;
	}
	async getRequiredRequestAuth(model) {
		const result = await this.sessionModelRegistry.getApiKeyAndHeaders(model);
		if (!result.ok) {
			if (result.error.startsWith("No API key found")) throw new Error(formatNoApiKeyFoundMessage(model.provider));
			throw new Error(result.error);
		}
		if (result.apiKey) return {
			apiKey: result.apiKey,
			headers: result.headers
		};
		if (this.sessionModelRegistry.isUsingOAuth(model)) throw new Error(`Authentication failed for "${model.provider}". Credentials may have expired or network is unavailable. Run '/login ${model.provider}' to re-authenticate.`);
		throw new Error(formatNoApiKeyFoundMessage(model.provider));
	}
	async getCompactionRequestAuth(model) {
		if (getStreamLlmRuntime(this.agent.streamFn) === getModelRegistryRuntime(this.sessionModelRegistry).llmRuntime) return this.getRequiredRequestAuth(model);
		const result = await this.sessionModelRegistry.getApiKeyAndHeaders(model);
		return result.ok ? {
			apiKey: result.apiKey,
			headers: result.headers
		} : {};
	}
	async runWithSessionWriteSettlement(run) {
		return this.withExternalSessionWriteSettlement ? await this.withExternalSessionWriteSettlement(run) : await run();
	}
	eventMayWriteSession(event) {
		return event.type === "message_end" || this.currentExtensionRunner.hasHandlers(event.type);
	}
	/**
	* Install tool hooks once on the Agent instance.
	*
	* The callbacks read `this.currentExtensionRunner` at execution time, so extension reload swaps in the
	* new runner without reinstalling hooks. Extension-specific tool wrappers are still used to adapt
	* registered tool execution to the extension context. Tool call and tool result interception now
	* happens here instead of in wrappers.
	*/
	installAgentToolHooks() {
		this.agent.beforeToolCall = async ({ toolCall, args }) => {
			const runner = this.currentExtensionRunner;
			return await this.runWithSessionWriteSettlement(async () => {
				if (!runner.hasHandlers("tool_call")) return;
				try {
					return await runner.emitToolCall({
						type: "tool_call",
						toolName: toolCall.name,
						toolCallId: toolCall.id,
						input: args
					});
				} catch (err) {
					if (err instanceof Error) throw err;
					throw new Error(`Extension failed, blocking execution: ${String(err)}`, { cause: err });
				}
			});
		};
		this.agent.afterToolCall = async ({ toolCall, args, result, isError }) => {
			const runner = this.currentExtensionRunner;
			if (!runner.hasHandlers("tool_result")) return;
			const hookResult = await this.runWithSessionWriteSettlement(async () => await runner.emitToolResult({
				type: "tool_result",
				toolName: toolCall.name,
				toolCallId: toolCall.id,
				input: args,
				content: result.content,
				details: result.details,
				isError,
				...result.terminate !== void 0 ? { terminate: result.terminate } : {}
			}));
			if (!hookResult) return;
			this.extensionModifiedToolResultIds.add(toolCall.id);
			return {
				...hookResult,
				isError: hookResult.isError ?? isError
			};
		};
	}
	/** Copy-on-write listener registration keeps dispatch stable without per-event snapshots. */
	emit(event) {
		for (const l of this.eventListeners) l(event);
	}
	/** Terminal listeners form a barrier before retry, compaction, or queue draining. */
	async emitTerminal(event) {
		const listeners = this.eventListeners;
		for (const listener of listeners) try {
			await listener(event);
		} catch (error) {
			log.warn(`agent_end listener failed: ${String(error)}`);
		}
	}
	emitQueueUpdate() {
		this.emit({
			type: "queue_update",
			steering: this.steeringMessages.map((entry) => entry.text),
			followUp: this.followUpMessages.map((entry) => entry.text)
		});
	}
	trackQueuedUserMessage(message, owner, text) {
		const queue = owner === "steering" ? this.steeringMessages : this.followUpMessages;
		const entry = { text };
		queue.push(entry);
		registerQueuedUserMessageRetirement(message, () => {
			if (queue !== this.steeringMessages && queue !== this.followUpMessages) return false;
			const queueIndex = queue.indexOf(entry);
			if (queueIndex === -1) return false;
			queue.splice(queueIndex, 1);
			this.emitQueueUpdate();
			return true;
		});
		this.emitQueueUpdate();
	}
	async handleAgentEventUnlocked(event) {
		if (event.type === "agent_start") this.lastAssistantEntryId = void 0;
		if (event.type === "message_start" && event.message.role === "user") {
			this.overflowRecoveryAttempts = 0;
			retireQueuedUserMessage(event.message);
		}
		const sourceSlots = event.type === "message_end" ? takeCodeModeResponseSource(event.message) : void 0;
		const messageChanged = await this.emitExtensionEvent(event);
		const publishAfterPersistence = event.type === "message_end" && event.message.role === "user";
		if (event.type === "agent_end") await this.emitTerminal({
			...event,
			willRetry: this.willRetryAfterAgentEnd(event),
			...this.lastAssistantEntryId ? { assistantEntryId: this.lastAssistantEntryId } : {}
		});
		else if (!publishAfterPersistence) this.emit(event);
		if (event.type === "message_end") {
			if (event.message.role === "custom") this.sessionManager.appendCustomMessageEntry(event.message.customType, event.message.content, event.message.display, event.message.details);
			else if (event.message.role === "user" || event.message.role === "assistant" || event.message.role === "toolResult") {
				const toolResultChangedByExtension = event.message.role === "toolResult" && this.extensionModifiedToolResultIds.delete(event.message.toolCallId);
				let entryId;
				try {
					applyAssistantDeliveryDirectives(event.message);
					const appendOptions = { invalidateSerializedPrefixCache: messageChanged || toolResultChangedByExtension };
					prepareCodeModeSourceAppend(appendOptions, event.message, sourceSlots);
					entryId = this.sessionManager.appendMessage(event.message, appendOptions);
				} catch (error) {
					if (event.message.role === "user") reportSteeringMessagePersistenceFailure(event.message, error);
					throw error;
				}
				if (event.message.role === "assistant") this.lastAssistantEntryId = entryId;
				else if (event.message.role === "user") this.emit(event);
			}
			if (event.message.role === "assistant") {
				this.lastAssistantMessage = event.message;
				const assistantMsg = event.message;
				if (assistantMsg.stopReason !== "error" && assistantMsg.stopReason !== "length") this.overflowRecoveryAttempts = 0;
				if (assistantMsg.stopReason !== "error" && this.retryCount > 0) {
					this.emit({
						type: "auto_retry_end",
						success: true,
						attempt: this.retryCount
					});
					this.retryCount = 0;
				}
			}
		}
	}
	willRetryAfterAgentEnd(event) {
		const settings = this.settingsManager.getRetrySettings();
		if (!settings.enabled || this.retryCount >= settings.maxRetries) return false;
		for (const message of event.messages.toReversed()) if (message.role === "assistant") return this.isRetryableError(message);
		return false;
	}
	/** Find the last assistant message in agent state (including aborted ones) */
	findLastAssistantMessage() {
		const messages = this.agent.state.messages;
		for (const msg of messages.toReversed()) if (msg.role === "assistant") return msg;
	}
	/** Emit extension events based on agent events */
	async emitExtensionEvent(event) {
		if (event.type === "agent_start") {
			this.turnIndex = 0;
			await this.currentExtensionRunner.emit({ type: "agent_start" });
		} else if (event.type === "agent_end") await this.currentExtensionRunner.emit({
			type: "agent_end",
			messages: event.messages
		});
		else if (event.type === "turn_start") {
			const extensionEvent = {
				type: "turn_start",
				turnIndex: this.turnIndex,
				timestamp: Date.now()
			};
			await this.currentExtensionRunner.emit(extensionEvent);
		} else if (event.type === "turn_end") {
			const extensionEvent = {
				type: "turn_end",
				turnIndex: this.turnIndex,
				message: event.message,
				toolResults: event.toolResults
			};
			await this.currentExtensionRunner.emit(extensionEvent);
			this.turnIndex++;
		} else if (event.type === "message_start") {
			const extensionEvent = {
				type: "message_start",
				message: event.message
			};
			await this.currentExtensionRunner.emit(extensionEvent);
		} else if (event.type === "message_update") {
			const extensionEvent = {
				type: "message_update",
				message: event.message,
				assistantMessageEvent: event.assistantMessageEvent
			};
			await this.currentExtensionRunner.emit(extensionEvent);
		} else if (event.type === "message_end") {
			const extensionEvent = {
				type: "message_end",
				message: event.message
			};
			const replacement = await this.currentExtensionRunner.emitMessageEnd(extensionEvent);
			if (replacement) {
				replaceAgentMessageInPlace(event.message, replacement);
				return true;
			}
		} else if (event.type === "tool_execution_start") {
			const extensionEvent = {
				type: "tool_execution_start",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				args: event.args
			};
			await this.currentExtensionRunner.emit(extensionEvent);
		} else if (event.type === "tool_execution_update") {
			const extensionEvent = {
				type: "tool_execution_update",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				args: event.args,
				partialResult: event.partialResult
			};
			await this.currentExtensionRunner.emit(extensionEvent);
		} else if (event.type === "tool_execution_end") {
			const extensionEvent = {
				type: "tool_execution_end",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				result: event.result,
				isError: event.isError
			};
			await this.currentExtensionRunner.emit(extensionEvent);
		}
		return false;
	}
	/**
	* Subscribe to agent events.
	* Session persistence is handled internally (saves messages on message_end).
	* Multiple listeners can be added. Returns unsubscribe function for this listener.
	*/
	subscribe(listener) {
		this.eventListeners = [...this.eventListeners, listener];
		return () => {
			const index = this.eventListeners.indexOf(listener);
			if (index !== -1) this.eventListeners = this.eventListeners.toSpliced(index, 1);
		};
	}
	/**
	* Temporarily disconnect from agent events.
	* User listeners are preserved and will receive events again after resubscribe().
	* Used internally during operations that need to pause event processing.
	*/
	disconnectFromAgent() {
		if (this.unsubscribeAgent) {
			this.unsubscribeAgent();
			this.unsubscribeAgent = void 0;
		}
	}
	/**
	* Reconnect to agent events after disconnectFromAgent().
	* Preserves all existing listeners.
	*/
	reconnectToAgent() {
		if (this.unsubscribeAgent) return;
		this.unsubscribeAgent = this.agent.subscribe(this.handleAgentEvent);
	}
	/**
	* Remove all listeners and disconnect from agent.
	* Call this when completely done with the session.
	*/
	dispose() {
		const abortOperations = [
			() => this.abortRetry(),
			() => this.abortCompaction(),
			() => this.abortBranchSummary(),
			() => this.abortBash(),
			() => this.agent.abort()
		];
		for (const abortOperation of abortOperations) try {
			abortOperation();
		} catch {}
		this.currentExtensionRunner.invalidate("This extension ctx is stale after session replacement or reload. Do not use a captured api or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().");
		this.disconnectFromAgent();
		this.eventListeners = [];
		if (this.cleanupProviderSessionResourcesOnDispose) cleanupSessionResources(this.sessionId);
	}
	/** Full agent state */
	get state() {
		return this.agent.state;
	}
	/** Current model (may be undefined if not yet selected) */
	get model() {
		return this.agent.state.model;
	}
	/** Current thinking level */
	get thinkingLevel() {
		return this.agent.state.thinkingLevel;
	}
	/** Whether agent is currently streaming a response */
	get isStreaming() {
		return this.agent.state.isStreaming;
	}
	/** Current effective system prompt (includes any per-turn extension modifications) */
	get systemPrompt() {
		return this.agent.state.systemPrompt;
	}
	/** Current retry attempt (0 if not retrying) */
	get retryAttempt() {
		return this.retryCount;
	}
	/**
	* Get the names of currently active tools.
	* Returns the names of tools currently set on the agent.
	*/
	getActiveToolNames() {
		return this.agent.state.tools.map((t) => t.name);
	}
	/**
	* Get all configured tools with name, description, parameter schema, and source metadata.
	*/
	getAllTools() {
		return Array.from(this.toolDefinitions.values()).map(({ definition, sourceInfo }) => ({
			name: definition.name,
			description: definition.description,
			parameters: definition.parameters,
			sourceInfo
		}));
	}
	getToolDefinition(name) {
		return this.toolDefinitions.get(name)?.definition;
	}
	/**
	* Set active tools by name.
	* Only tools in the registry can be enabled. Unknown tool names are ignored.
	* Also rebuilds the system prompt to reflect the new tool set.
	* Changes take effect on the next agent turn.
	*/
	setActiveToolsByName(toolNames) {
		const tools = [];
		const validToolNames = [];
		for (const name of toolNames) {
			const tool = this.toolRegistry.get(name);
			if (tool) {
				tools.push(tool);
				validToolNames.push(name);
			}
		}
		this.agent.state.tools = tools;
		this.baseSystemPrompt = this.rebuildSystemPrompt(validToolNames);
		this.agent.state.systemPrompt = this.systemPromptOverride ?? this.baseSystemPrompt;
	}
	/** Set an exact base prompt owned by the current runtime. */
	setBaseSystemPrompt(systemPrompt) {
		const { validToolNames, toolSnippets, promptGuidelines } = this.collectActiveToolPromptMetadata(this.getActiveToolNames());
		this.exactBaseSystemPrompt = systemPrompt;
		this.baseSystemPrompt = systemPrompt;
		this.baseSystemPromptOptions = {
			cwd: this.cwd,
			selectedTools: validToolNames,
			toolSnippets,
			promptGuidelines,
			customPrompt: systemPrompt
		};
		this.agent.state.systemPrompt = systemPrompt;
	}
	/** Whether compaction or branch summarization is currently running */
	get isCompacting() {
		return this.autoCompactionAbortController !== void 0 || this.compactionAbortController !== void 0 || this.branchSummaryAbortController !== void 0;
	}
	/** All messages including custom types like BashExecutionMessage */
	get messages() {
		return this.agent.state.messages;
	}
	/** Current steering mode */
	get steeringMode() {
		return this.agent.steeringMode;
	}
	/** Current follow-up mode */
	get followUpMode() {
		return this.agent.followUpMode;
	}
	/** Current persisted transcript target, or undefined for in-memory sessions. */
	get sessionTarget() {
		return this.sessionManager.getSessionTarget();
	}
	/** Current persisted session key, or undefined for in-memory sessions. */
	get sessionKey() {
		return this.sessionTarget?.sessionKey;
	}
	/** @deprecated Compatibility token; returns the session key, not a file path. */
	get sessionFile() {
		return this.sessionKey;
	}
	/** Current session ID */
	get sessionId() {
		return this.sessionManager.getSessionId();
	}
	/** Current session display name, if set */
	get sessionName() {
		return this.sessionManager.getSessionName();
	}
	/** Scoped models for cycling (from --models flag) */
	get scopedModels() {
		return this.scopedModelEntries;
	}
	/** Update scoped models for cycling */
	setScopedModels(scopedModels) {
		this.scopedModelEntries = scopedModels;
	}
	/** File-based prompt templates */
	get promptTemplates() {
		return this.sessionResourceLoader.getPrompts().prompts;
	}
	normalizePromptSnippet(text) {
		if (!text) return;
		const oneLine = text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
		return oneLine.length > 0 ? oneLine : void 0;
	}
	normalizePromptGuidelines(guidelines) {
		if (!guidelines || guidelines.length === 0) return [];
		const unique = /* @__PURE__ */ new Set();
		for (const guideline of guidelines) {
			const normalized = guideline.trim();
			if (normalized.length > 0) unique.add(normalized);
		}
		return Array.from(unique);
	}
	collectActiveToolPromptMetadata(toolNames) {
		const validToolNames = toolNames.filter((name) => this.toolRegistry.has(name));
		const toolSnippets = {};
		const promptGuidelines = [];
		for (const name of validToolNames) {
			const snippet = this.toolPromptSnippets.get(name);
			if (snippet) toolSnippets[name] = snippet;
			const toolGuidelines = this.toolPromptGuidelines.get(name);
			if (toolGuidelines) promptGuidelines.push(...toolGuidelines);
		}
		return {
			validToolNames,
			toolSnippets,
			promptGuidelines
		};
	}
	rebuildSystemPrompt(toolNames) {
		const { validToolNames, toolSnippets, promptGuidelines } = this.collectActiveToolPromptMetadata(toolNames);
		if (this.exactBaseSystemPrompt !== void 0) {
			this.baseSystemPromptOptions = {
				...this.baseSystemPromptOptions,
				cwd: this.cwd,
				customPrompt: this.exactBaseSystemPrompt,
				selectedTools: validToolNames,
				toolSnippets,
				promptGuidelines
			};
			return this.exactBaseSystemPrompt;
		}
		const loaderSystemPrompt = this.sessionResourceLoader.getSystemPrompt();
		const loaderAppendSystemPrompt = this.sessionResourceLoader.getAppendSystemPrompt();
		const appendSystemPrompt = loaderAppendSystemPrompt.length > 0 ? loaderAppendSystemPrompt.join("\n\n") : void 0;
		const loadedSkills = this.sessionResourceLoader.getSkills().skills;
		const loadedContextFiles = this.sessionResourceLoader.getAgentsFiles().agentsFiles;
		this.baseSystemPromptOptions = {
			cwd: this.cwd,
			skills: loadedSkills,
			contextFiles: loadedContextFiles,
			customPrompt: loaderSystemPrompt,
			appendSystemPrompt,
			selectedTools: validToolNames,
			toolSnippets,
			promptGuidelines
		};
		return buildSystemPrompt(this.baseSystemPromptOptions);
	}
};
//#endregion
//#region src/agents/sessions/prompt-templates.ts
/**
* Prompt template discovery and loading.
*
* Reads markdown prompt templates from user, project, and package sources with frontmatter metadata.
*/
function loadTemplateFromFile(filePath, sourceInfo) {
	try {
		const rawContent = readFileSync(filePath, "utf-8");
		const { frontmatter, body } = parsePromptFrontmatter(rawContent);
		const name = basename(filePath).replace(/\.md$/, "");
		let description = frontmatter.description || "";
		if (!description) {
			const firstLine = body.split("\n").find((line) => line.trim());
			if (firstLine) {
				description = truncateUtf16Safe(firstLine, 60);
				if (firstLine.length > 60) description += "...";
			}
		}
		return {
			name,
			description,
			...frontmatter["argument-hint"] && { argumentHint: frontmatter["argument-hint"] },
			content: body,
			sourceInfo,
			filePath
		};
	} catch {
		return null;
	}
}
/**
* Scan a directory for .md files (non-recursive) and load them as prompt templates.
*/
function loadTemplatesFromDir(dir, getSourceInfo) {
	const templates = [];
	if (!existsSync(dir)) return templates;
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) try {
				isFile = statSync(fullPath).isFile();
			} catch {
				continue;
			}
			if (isFile && entry.name.endsWith(".md")) {
				const template = loadTemplateFromFile(fullPath, getSourceInfo(fullPath));
				if (template) templates.push(template);
			}
		}
	} catch {
		return templates;
	}
	return templates;
}
function resolvePromptPath(p, cwd) {
	const normalized = expandTildePath(p);
	return isAbsolute(normalized) ? normalized : resolve(cwd, normalized);
}
/**
* Load all prompt templates from:
* 1. Global: agentDir/prompts/
* 2. Project: cwd/{CONFIG_DIR_NAME}/prompts/
* 3. Explicit prompt paths
*/
function loadPromptTemplates(options) {
	const resolvedCwd = options.cwd;
	const resolvedAgentDir = options.agentDir;
	const promptPaths = options.promptPaths;
	const includeDefaults = options.includeDefaults;
	const templates = [];
	const globalPromptsDir = options.agentDir ? join(options.agentDir, "prompts") : resolvedAgentDir;
	const projectPromptsDir = resolve(resolvedCwd, CONFIG_DIR_NAME, "prompts");
	const getSourceInfo = (resolvedPath) => {
		if (isPathInside(globalPromptsDir, resolvedPath)) return createSyntheticSourceInfo(resolvedPath, {
			source: "local",
			scope: "user",
			baseDir: globalPromptsDir
		});
		if (isPathInside(projectPromptsDir, resolvedPath)) return createSyntheticSourceInfo(resolvedPath, {
			source: "local",
			scope: "project",
			baseDir: projectPromptsDir
		});
		return createSyntheticSourceInfo(resolvedPath, {
			source: "local",
			baseDir: statSync(resolvedPath).isDirectory() ? resolvedPath : dirname(resolvedPath)
		});
	};
	if (includeDefaults) {
		templates.push(...loadTemplatesFromDir(globalPromptsDir, getSourceInfo));
		templates.push(...loadTemplatesFromDir(projectPromptsDir, getSourceInfo));
	}
	for (const rawPath of promptPaths) {
		const resolvedPath = resolvePromptPath(rawPath, resolvedCwd);
		if (!existsSync(resolvedPath)) continue;
		try {
			const stats = statSync(resolvedPath);
			if (stats.isDirectory()) templates.push(...loadTemplatesFromDir(resolvedPath, getSourceInfo));
			else if (stats.isFile() && resolvedPath.endsWith(".md")) {
				const template = loadTemplateFromFile(resolvedPath, getSourceInfo(resolvedPath));
				if (template) templates.push(template);
			}
		} catch {}
	}
	return templates;
}
/**
* Expand a prompt template if it matches a template name.
* Returns the expanded content or the original text if not a template.
*/
function expandPromptTemplate(text, templates) {
	if (!text.startsWith("/")) return text;
	const match = text.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
	if (!match) return text;
	const templateName = match[1];
	const argsString = match[2] ?? "";
	const template = templates.find((t) => t.name === templateName);
	if (template) {
		const args = parseCommandArgs(argsString);
		return substituteArgs(template.content, args);
	}
	return text;
}
//#endregion
//#region src/agents/sessions/agent-session-prompting.ts
function rethrowPromptFinalizationFailure(failed, error) {
	if (failed) throw error;
}
/** @internal Host preparation runs after SDK prompt hooks and owns its run cancellation. */
const agentSessionSetPromptPreparation = Symbol.for("openclaw.agent-session.set-prompt-preparation");
var AgentSessionPrompting = class extends AgentSessionBase {
	constructor(..._args) {
		super(..._args);
		this.logicalPromptActive = false;
	}
	[agentSessionSetPromptPreparation](prepare) {
		this.promptPreparation = prepare;
	}
	dispose() {
		this.promptPreparation = void 0;
		super.dispose();
	}
	async runAgentPrompt(messages) {
		if (this.logicalPromptActive) throw new Error("Agent is already processing a prompt. Use steer() or followUp() to queue messages, or wait for completion.");
		this.logicalPromptActive = true;
		let endedForTurnHandoff = false;
		try {
			await this.runPreparedAgentLoop(() => this.agent.prompt(messages));
			while (true) {
				const action = await this.handlePostAgentRun();
				if (action !== "continue") {
					endedForTurnHandoff = action === "handoff";
					break;
				}
				await this.runPreparedAgentLoop(() => this.agent.continue());
			}
		} finally {
			this.systemPromptOverride = void 0;
			let flushFailed = false;
			let flushError;
			try {
				this.flushPendingBashMessages();
			} catch (error) {
				flushFailed = true;
				flushError = error;
			}
			this.logicalPromptActive = false;
			let terminalFailed = false;
			let terminalError;
			try {
				endedForTurnHandoff ||= this.lastRunEndedForTurnHandoff;
				this.lastRunEndedForTurnHandoff = false;
				if (endedForTurnHandoff) this.emit({ type: "agent_handoff" });
				else {
					this.emit({ type: "agent_settled" });
					await this.currentExtensionRunner.emit({ type: "agent_settled" });
				}
			} catch (error) {
				terminalFailed = true;
				terminalError = error;
			}
			rethrowPromptFinalizationFailure(flushFailed, flushError);
			rethrowPromptFinalizationFailure(terminalFailed, terminalError);
		}
	}
	async runPreparedAgentLoop(run) {
		const prepare = this.promptPreparation;
		if (prepare) {
			await prepare();
			if (prepare !== this.promptPreparation) throw new Error("Session prompt preparation is stale after replacement or disposal.");
		}
		return run();
	}
	async handlePostAgentRun() {
		const msg = this.lastAssistantMessage;
		this.lastAssistantMessage = void 0;
		const endedForTurnHandoff = this.lastRunEndedForTurnHandoff;
		this.lastRunEndedForTurnHandoff = false;
		if (endedForTurnHandoff) return "handoff";
		if (!msg || msg.stopReason === "aborted") return "settled";
		if (this.isRetryableError(msg) && await this.prepareRetry(msg)) return "continue";
		if (msg.stopReason === "error" && this.retryCount > 0) {
			this.emit({
				type: "auto_retry_end",
				success: false,
				attempt: this.retryCount,
				finalError: msg.errorMessage
			});
			this.retryCount = 0;
		}
		if (await this.checkCompaction(msg)) return "continue";
		return this.agent.hasQueuedMessages() ? "continue" : "settled";
	}
	createUserContent(text, images) {
		return [{
			type: "text",
			text
		}, ...images ?? []];
	}
	createUserMessage(text, images) {
		const message = {
			role: "user",
			content: this.createUserContent(text, images),
			timestamp: Date.now()
		};
		const imageFactIndexes = readRuntimePromptImageFactIndexes(images);
		return imageFactIndexes ? Object.assign({}, message, {
			...message,
			__openclaw: { mediaImageBlockFactIndexes: imageFactIndexes }
		}) : message;
	}
	/**
	* Send a prompt to the agent.
	* - Handles extension commands immediately, even during streaming
	* - Expands file-based prompt templates by default
	* - During streaming, queues via steer() or followUp() based on streamingBehavior option
	* - Validates model and API key before sending (when not streaming)
	* @throws Error if streaming and no streamingBehavior specified
	* @throws Error if no model selected or no API key available (when not streaming)
	*/
	async prompt(text, options) {
		const expandPromptTemplates = options?.expandPromptTemplates ?? true;
		const preflightResult = options?.preflightResult;
		let messages;
		try {
			if (expandPromptTemplates && text.startsWith("/")) {
				if (await this.tryExecuteExtensionCommand(text)) {
					preflightResult?.(true);
					return;
				}
			}
			let currentText = text;
			let currentImages = options?.images;
			if (this.currentExtensionRunner.hasHandlers("input")) {
				const inputResult = await this.currentExtensionRunner.emitInput(currentText, currentImages, options?.source ?? "interactive");
				if (inputResult.action === "handled") {
					preflightResult?.(true);
					return;
				}
				if (inputResult.action === "transform") {
					currentText = inputResult.text;
					currentImages = inputResult.images ?? currentImages;
				}
			}
			let expandedText = currentText;
			if (expandPromptTemplates) {
				expandedText = this.expandSkillCommand(expandedText);
				expandedText = expandPromptTemplate(expandedText, [...this.promptTemplates]);
			}
			if (this.isStreaming || this.logicalPromptActive) {
				if (!options?.streamingBehavior) throw new Error("Agent is already processing. Specify streamingBehavior ('steer' or 'followUp') to queue the message.");
				if (options.streamingBehavior === "followUp") await this.queueFollowUp(expandedText, currentImages);
				else await this.queueSteer(expandedText, currentImages);
				preflightResult?.(true);
				return;
			}
			this.flushPendingBashMessages();
			if (!this.model) throw new Error(formatNoModelSelectedMessage());
			if (!this.sessionModelRegistry.hasConfiguredAuth(this.model)) {
				if (this.sessionModelRegistry.isUsingOAuth(this.model)) throw new Error(`Authentication failed for "${this.model.provider}". Credentials may have expired or network is unavailable. Run '/login ${this.model.provider}' to re-authenticate.`);
				throw new Error(formatNoApiKeyFoundMessage(this.model.provider));
			}
			const lastAssistant = this.findLastAssistantMessage();
			if (lastAssistant) await this.checkCompaction(lastAssistant, false);
			const persistedUserIdempotencyKey = options?.persistedUserIdempotencyKey;
			const activeTail = this.agent.state.messages.at(-1);
			if (persistedUserIdempotencyKey && activeTail?.role === "user" && "idempotencyKey" in activeTail && activeTail.idempotencyKey === persistedUserIdempotencyKey) this.agent.state.messages = this.agent.state.messages.slice(0, -1);
			messages = [];
			messages.push(this.createUserMessage(expandedText, currentImages));
			for (const msg of this.pendingNextTurnMessages) messages.push(msg);
			this.pendingNextTurnMessages = [];
			const result = await this.currentExtensionRunner.emitBeforeAgentStart(expandedText, currentImages, this.baseSystemPrompt, this.baseSystemPromptOptions);
			if (result?.messages) for (const msg of result.messages) messages.push({
				role: "custom",
				customType: msg.customType,
				content: msg.content,
				display: msg.display,
				details: msg.details,
				timestamp: Date.now()
			});
			if (result?.systemPrompt !== void 0) {
				this.systemPromptOverride = result.systemPrompt;
				this.agent.state.systemPrompt = result.systemPrompt;
			} else {
				this.systemPromptOverride = void 0;
				this.agent.state.systemPrompt = this.baseSystemPrompt;
			}
		} catch (error) {
			preflightResult?.(false);
			throw error;
		}
		if (!messages) return;
		preflightResult?.(true);
		await this.runAgentPrompt(messages);
	}
	/**
	* Try to execute an extension command. Returns true if command was found and executed.
	*/
	async tryExecuteExtensionCommand(text) {
		const spaceIndex = text.indexOf(" ");
		const commandName = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
		const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1);
		const command = this.currentExtensionRunner.getCommand(commandName);
		if (!command) return false;
		const ctx = this.currentExtensionRunner.createCommandContext();
		try {
			await command.handler(args, ctx);
			return true;
		} catch (err) {
			this.currentExtensionRunner.emitError({
				extensionPath: `command:${commandName}`,
				event: "command",
				error: err instanceof Error ? err.message : String(err)
			});
			return true;
		}
	}
	/**
	* Expand skill commands (/skill:name args) to their full content.
	* Returns the expanded text, or the original text if not a skill command or skill not found.
	* Emits errors via extension runner if file read fails.
	*/
	expandSkillCommand(text) {
		if (!text.startsWith("/skill:")) return text;
		const spaceIndex = text.indexOf(" ");
		const skillName = spaceIndex === -1 ? text.slice(7) : text.slice(7, spaceIndex);
		const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1).trim();
		const skill = this.sessionResourceLoader.getSkills().skills.find((s) => s.name === skillName);
		if (!skill) return text;
		try {
			const content = readFileSync(skill.filePath, "utf-8");
			const body = stripFrontmatter(content).trim();
			const skillBlock = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
			return args ? `${skillBlock}\n\n${args}` : skillBlock;
		} catch (err) {
			this.currentExtensionRunner.emitError({
				extensionPath: skill.filePath,
				event: "skill_expansion",
				error: err instanceof Error ? err.message : String(err)
			});
			return text;
		}
	}
	/**
	* Queue a steering message while the agent is running.
	* Delivered before the next unstarted tool launch or model call. Running tools
	* continue; suppressed calls receive paired synthetic results.
	* Expands skill commands and prompt templates. Errors on extension commands.
	* @param images Optional image attachments to include with the message
	* @param userTurnTranscriptRecorder Prepared channel fields for transcript-only persistence
	* @throws Error if text is an extension command
	*/
	async steer(text, images, userTurnTranscriptRecorder, media, imageOrder, queueIdentity, canInject) {
		if (text.startsWith("/")) this.throwIfExtensionCommand(text);
		let expandedText = this.expandSkillCommand(text);
		expandedText = expandPromptTemplate(expandedText, [...this.promptTemplates]);
		const preparedMessage = await userTurnTranscriptRecorder?.resolveMessage();
		if (canInject && !canInject()) throw new Error("active session is finalizing");
		await this.queueSteer(expandedText, images, preparedMessage && userTurnTranscriptRecorder ? {
			message: preparedMessage,
			recorder: userTurnTranscriptRecorder
		} : void 0, media, imageOrder, queueIdentity);
	}
	/**
	* Queue a follow-up message to be processed after the agent finishes.
	* Delivered only when agent has no more tool calls or steering messages.
	* Expands skill commands and prompt templates. Errors on extension commands.
	* @param images Optional image attachments to include with the message
	* @throws Error if text is an extension command
	*/
	async followUp(text, images) {
		if (text.startsWith("/")) this.throwIfExtensionCommand(text);
		let expandedText = this.expandSkillCommand(text);
		expandedText = expandPromptTemplate(expandedText, [...this.promptTemplates]);
		await this.queueFollowUp(expandedText, images);
	}
	/**
	* Internal: Queue a steering message (already expanded, no extension command check).
	*/
	async queueSteer(text, images, transcriptContext, media, imageOrder, queueIdentity) {
		const runtimeMessage = this.createUserMessage(text, images);
		const promptMessage = media?.length ? attachRuntimePromptMediaFacts(runtimeMessage, media, imageOrder) : runtimeMessage;
		setSteeringMessageIdentity(promptMessage, queueIdentity);
		this.trackQueuedUserMessage(promptMessage, "steering", text);
		this.agent.steer(transcriptContext ? attachRuntimeUserTurnTranscriptContext(promptMessage, transcriptContext) : promptMessage);
	}
	/**
	* Internal: Queue a follow-up message (already expanded, no extension command check).
	*/
	async queueFollowUp(text, images) {
		const message = this.createUserMessage(text, images);
		this.trackQueuedUserMessage(message, "followUp", text);
		this.agent.followUp(message);
	}
	/**
	* Throw an error if the text is an extension command.
	*/
	throwIfExtensionCommand(text) {
		const spaceIndex = text.indexOf(" ");
		const commandName = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
		if (this.currentExtensionRunner.getCommand(commandName)) throw new Error(`Extension command "/${commandName}" cannot be queued. Use prompt() or execute the command when not streaming.`);
	}
	/**
	* Send a custom message to the session. Creates a CustomMessageEntry.
	*
	* Handles three cases:
	* - Streaming: queues message, processed when loop pulls from queue
	* - Not streaming + triggerTurn: appends to state/session, starts new turn
	* - Not streaming + no trigger: appends to state/session, no turn
	*
	* @param message Custom message with customType, content, display, details
	* @param options.triggerTurn If true and not streaming, triggers a new LLM turn
	* @param options.deliverAs Delivery mode: "steer", "followUp", or "nextTurn"
	*/
	async sendCustomMessage(message, options) {
		const appMessage = {
			role: "custom",
			customType: message.customType,
			content: message.content,
			display: message.display,
			details: message.details,
			timestamp: Date.now()
		};
		if (options?.deliverAs === "nextTurn") this.pendingNextTurnMessages.push(appMessage);
		else if (this.isStreaming) {
			if (options?.deliverAs === "followUp") this.agent.followUp(appMessage);
			else this.agent.steer(appMessage);
		} else if (options?.triggerTurn) await this.runAgentPrompt(appMessage);
		else {
			this.agent.state.messages.push(appMessage);
			this.sessionManager.appendCustomMessageEntry(message.customType, message.content, message.display, message.details);
			this.emit({
				type: "message_start",
				message: appMessage
			});
			this.emit({
				type: "message_end",
				message: appMessage
			});
		}
	}
	/**
	* Send a user message to the agent. Always triggers a turn.
	* When the agent is streaming, use deliverAs to specify how to queue the message.
	*
	* @param content User message content (string or content array)
	* @param options.deliverAs Delivery mode when streaming: "steer" or "followUp"
	*/
	async sendUserMessage(content, options) {
		let text;
		let images;
		if (typeof content === "string") text = content;
		else {
			const textParts = [];
			images = [];
			for (const part of content) if (part.type === "text") textParts.push(part.text);
			else images.push(part);
			text = textParts.join("\n");
			if (images.length === 0) images = void 0;
		}
		await this.prompt(text, {
			expandPromptTemplates: false,
			streamingBehavior: options?.deliverAs,
			images,
			source: "extension"
		});
	}
	/**
	* Clear all queued messages and return them.
	* Useful for restoring to editor when user aborts.
	* @returns Object with steering and followUp arrays
	*/
	clearQueue() {
		const steering = this.steeringMessages.map((entry) => entry.text);
		const followUp = this.followUpMessages.map((entry) => entry.text);
		this.steeringMessages = [];
		this.followUpMessages = [];
		this.agent.clearAllQueues();
		this.emitQueueUpdate();
		return {
			steering,
			followUp
		};
	}
	/** Number of pending messages (includes both steering and follow-up) */
	get pendingMessageCount() {
		return this.steeringMessages.length + this.followUpMessages.length;
	}
	/** Get pending steering messages (read-only) */
	getSteeringMessages() {
		return this.steeringMessages.map((entry) => entry.text);
	}
	/** Get pending follow-up messages (read-only) */
	getFollowUpMessages() {
		return this.followUpMessages.map((entry) => entry.text);
	}
	get resourceLoader() {
		return this.sessionResourceLoader;
	}
	/** Abort the current run; yield callers pass a turnHandoff reason to skip interruption guidance. */
	async abort(reason) {
		this.abortRetry();
		this.agent.abort(reason);
		await this.agent.waitForIdle();
	}
};
//#endregion
//#region src/agents/sessions/agent-session-models.ts
const THINKING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high"
];
var AgentSessionModels = class extends AgentSessionPrompting {
	async emitModelSelect(nextModel, previousModel, source) {
		if (modelsAreEqual(previousModel, nextModel)) return;
		await this.currentExtensionRunner.emit({
			type: "model_select",
			model: nextModel,
			previousModel,
			source
		});
	}
	async applyModelSwitch(model, thinkingLevel, source) {
		const previousModel = this.model;
		this.agent.state.model = model;
		this.sessionManager.appendModelChange(model.provider, model.id);
		this.settingsManager.setDefaultModelAndProvider(model.provider, model.id);
		this.setThinkingLevel(thinkingLevel);
		await this.emitModelSelect(model, previousModel, source);
	}
	/**
	* Set model directly.
	* Validates that auth is configured, saves to session and settings.
	* @throws Error if no auth is configured for the model
	*/
	async setModel(model) {
		if (!this.sessionModelRegistry.hasConfiguredAuth(model)) throw new Error(`No API key for ${model.provider}/${model.id}`);
		const thinkingLevel = this.getThinkingLevelForModelSwitch();
		await this.applyModelSwitch(model, thinkingLevel, "set");
	}
	/**
	* Cycle to next/previous model.
	* Uses scoped models (from --models flag) if available, otherwise all available models.
	* @param direction - "forward" (default) or "backward"
	* @returns The new model info, or undefined if only one model available
	*/
	async cycleModel(direction = "forward") {
		if (this.scopedModelEntries.length > 0) return this.cycleScopedModel(direction);
		return this.cycleAvailableModel(direction);
	}
	async cycleScopedModel(direction) {
		const scopedModels = this.scopedModelEntries.filter((scoped) => this.sessionModelRegistry.hasConfiguredAuth(scoped.model));
		if (scopedModels.length <= 1) return;
		const currentModel = this.model;
		let currentIndex = scopedModels.findIndex((sm) => modelsAreEqual(sm.model, currentModel));
		if (currentIndex === -1) currentIndex = 0;
		const len = scopedModels.length;
		const nextIndex = direction === "forward" ? (currentIndex + 1) % len : (currentIndex - 1 + len) % len;
		const next = scopedModels.at(nextIndex);
		if (!next) throw new Error("Scoped model cycle produced an invalid index");
		const thinkingLevel = this.getThinkingLevelForModelSwitch(next.thinkingLevel);
		await this.applyModelSwitch(next.model, thinkingLevel, "cycle");
		return {
			model: next.model,
			thinkingLevel: this.thinkingLevel,
			isScoped: true
		};
	}
	async cycleAvailableModel(direction) {
		const availableModels = this.sessionModelRegistry.getAvailable();
		if (availableModels.length <= 1) return;
		const currentModel = this.model;
		let currentIndex = availableModels.findIndex((m) => modelsAreEqual(m, currentModel));
		if (currentIndex === -1) currentIndex = 0;
		const len = availableModels.length;
		const nextIndex = direction === "forward" ? (currentIndex + 1) % len : (currentIndex - 1 + len) % len;
		const nextModel = availableModels.at(nextIndex);
		if (!nextModel) throw new Error("Available model cycle produced an invalid index");
		const thinkingLevel = this.getThinkingLevelForModelSwitch();
		await this.applyModelSwitch(nextModel, thinkingLevel, "cycle");
		return {
			model: nextModel,
			thinkingLevel: this.thinkingLevel,
			isScoped: false
		};
	}
	/**
	* Set thinking level.
	* Clamps to model capabilities based on available thinking levels.
	* Saves to session and settings only if the level actually changes.
	*/
	setThinkingLevel(level) {
		const effectiveLevel = this.getAvailableThinkingLevels().includes(level) ? level : this.clampThinkingLevel(level);
		const previousLevel = this.agent.state.thinkingLevel;
		const isChanging = effectiveLevel !== previousLevel;
		this.agent.state.thinkingLevel = effectiveLevel;
		if (isChanging) {
			this.sessionManager.appendThinkingLevelChange(effectiveLevel);
			if (this.supportsThinking() || effectiveLevel !== "off") this.settingsManager.setDefaultThinkingLevel(effectiveLevel);
			this.emit({
				type: "thinking_level_changed",
				level: effectiveLevel
			});
			this.currentExtensionRunner.emit({
				type: "thinking_level_select",
				level: effectiveLevel,
				previousLevel
			});
		}
	}
	/**
	* Cycle to next thinking level.
	* @returns New level, or undefined if model doesn't support thinking
	*/
	cycleThinkingLevel() {
		if (!this.supportsThinking()) return;
		const levels = this.getAvailableThinkingLevels();
		const nextIndex = (levels.indexOf(this.thinkingLevel) + 1) % levels.length;
		const nextLevel = levels.at(nextIndex);
		if (!nextLevel) return;
		this.setThinkingLevel(nextLevel);
		return nextLevel;
	}
	/**
	* Get available thinking levels for current model.
	* The provider will clamp to what the specific model supports internally.
	*/
	getAvailableThinkingLevels() {
		if (!this.model) return THINKING_LEVELS;
		return getSupportedThinkingLevels(this.model);
	}
	/**
	* Check if current model supports thinking/reasoning.
	*/
	supportsThinking() {
		return Boolean(this.model?.reasoning);
	}
	getThinkingLevelForModelSwitch(explicitLevel) {
		if (explicitLevel !== void 0) return explicitLevel;
		if (!this.supportsThinking()) return this.settingsManager.getDefaultThinkingLevel() ?? "medium";
		return this.thinkingLevel;
	}
	clampThinkingLevel(level) {
		return this.model ? clampThinkingLevel(this.model, level) : "off";
	}
	/**
	* Set steering message mode.
	* Saves to settings.
	*/
	setSteeringMode(mode) {
		this.agent.steeringMode = mode;
		this.settingsManager.setSteeringMode(mode);
	}
	/**
	* Set follow-up message mode.
	* Saves to settings.
	*/
	setFollowUpMode(mode) {
		this.agent.followUpMode = mode;
		this.settingsManager.setFollowUpMode(mode);
	}
};
//#endregion
//#region src/agents/sessions/agent-session-inspection.ts
var AgentSessionInspection = class extends AgentSessionModels {
	/**
	* Set a display name for the current session.
	*/
	setSessionName(name) {
		this.sessionManager.appendSessionInfo(name);
		this.emit({
			type: "session_info_changed",
			name: this.sessionManager.getSessionName()
		});
	}
	/**
	* Get session statistics.
	*/
	getSessionStats() {
		const state = this.state;
		const userMessages = state.messages.filter((m) => m.role === "user").length;
		const assistantMessages = state.messages.filter((m) => m.role === "assistant").length;
		const toolResults = state.messages.filter((m) => m.role === "toolResult").length;
		let toolCalls = 0;
		let totalInput = 0;
		let totalOutput = 0;
		let totalCacheRead = 0;
		let totalCacheWrite = 0;
		let totalCost = 0;
		for (const message of state.messages) if (message.role === "assistant") {
			const assistantMsg = message;
			toolCalls += assistantMsg.content.filter((c) => c.type === "toolCall").length;
			totalInput += assistantMsg.usage.input;
			totalOutput += assistantMsg.usage.output;
			totalCacheRead += assistantMsg.usage.cacheRead;
			totalCacheWrite += assistantMsg.usage.cacheWrite;
			totalCost += assistantMsg.usage.cost.total;
		}
		return {
			sessionFile: this.sessionFile,
			sessionId: this.sessionId,
			userMessages,
			assistantMessages,
			toolCalls,
			toolResults,
			totalMessages: state.messages.length,
			tokens: {
				input: totalInput,
				output: totalOutput,
				cacheRead: totalCacheRead,
				cacheWrite: totalCacheWrite,
				total: totalInput + totalOutput + totalCacheRead + totalCacheWrite
			},
			cost: totalCost,
			contextUsage: this.getContextUsage()
		};
	}
	getContextUsage() {
		const model = this.model;
		if (!model) return;
		const contextWindow = model.contextWindow ?? 0;
		if (contextWindow <= 0) return;
		const branchEntries = this.sessionManager.getBranch();
		const latestCompaction = getLatestCompactionEntry(branchEntries);
		const providerCheckpointIndex = branchEntries.findLastIndex((entry) => entry.type === "message" && entry.message.role === "assistant" && isCompactionReplayCheckpoint(entry.message.providerReplay));
		const clientCompactionIndex = latestCompaction ? branchEntries.lastIndexOf(latestCompaction) : -1;
		const compactionIndex = Math.max(clientCompactionIndex, providerCheckpointIndex);
		const providerCheckpoint = providerCheckpointIndex > clientCompactionIndex;
		let estimateFromContent = false;
		if (compactionIndex >= 0) {
			let hasPostCompactionUsage = false;
			for (let index = branchEntries.length - 1; index > compactionIndex; index -= 1) {
				const entry = branchEntries[index];
				if (entry.type === "message" && entry.message.role === "assistant") {
					const assistant = entry.message;
					if (assistant.stopReason !== "aborted" && assistant.stopReason !== "error") {
						if (providerCheckpoint && assistant.usage.contextUsage?.state !== "available") continue;
						if (assistant.usage.contextUsage?.state === "unavailable") {
							estimateFromContent = true;
							continue;
						}
						if (calculateContextTokens(assistant.usage) > 0) {
							hasPostCompactionUsage = true;
							estimateFromContent = false;
							break;
						}
					}
				}
			}
			if (!hasPostCompactionUsage && (providerCheckpoint || !estimateFromContent)) return {
				tokens: null,
				contextWindow,
				percent: null
			};
		}
		const tokens = estimateFromContent ? estimateMessagesFromContent(this.messages) : estimateContextTokens(this.messages).tokens;
		return {
			tokens,
			contextWindow,
			percent: tokens / contextWindow * 100
		};
	}
	/**
	* Export the current session branch to a JSONL file.
	* Writes the session header followed by all entries on the current branch path.
	* @param outputPath Target file path. If omitted, generates a timestamped file in cwd.
	* @returns The resolved output file path.
	*/
	exportToJsonl(outputPath) {
		const filePath = resolve(outputPath ?? `session-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.jsonl`);
		const dir = dirname(filePath);
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		const header = {
			type: "session",
			version: 3,
			id: this.sessionManager.getSessionId(),
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			cwd: this.sessionManager.getCwd()
		};
		const branchEntries = this.sessionManager.getBranch();
		const lines = [JSON.stringify(header)];
		let prevId = null;
		for (const entry of branchEntries) {
			const linear = {
				...entry,
				parentId: prevId
			};
			lines.push(JSON.stringify(linear));
			prevId = entry.id;
		}
		writeFileSync(filePath, `${lines.join("\n")}\n`);
		return filePath;
	}
	/**
	* Get text content of last assistant message.
	* Useful for /copy command.
	* @returns Text content, or undefined if no assistant message exists
	*/
	getLastAssistantText() {
		const messages = this.messages;
		for (let index = messages.length - 1; index >= 0; index -= 1) {
			const message = messages[index];
			if (message.role !== "assistant") continue;
			const content = message.content;
			if (message.stopReason === "aborted" && !hasPersistedAssistantContent(content)) continue;
			return extractTextContent(content).trim() || void 0;
		}
	}
};
//#endregion
//#region src/agents/sessions/manual-compaction-preflight.ts
/** Plans manual compaction without aborting or otherwise mutating the active session. */
function preflightManualSessionCompaction(pathEntries, settings) {
	const initial = prepareCompaction$1(pathEntries, settings);
	if (!initial.ok) throw initial.error;
	let preparation = initial.value;
	if (!preparation) {
		const smallest = prepareCompaction$1(pathEntries, {
			...settings,
			keepRecentTokens: 0
		});
		if (!smallest.ok) throw smallest.error;
		preparation = smallest.value;
	}
	if (preparation) return {
		compactable: true,
		preparation
	};
	return {
		compactable: false,
		reason: pathEntries.at(-1)?.type === "compaction" ? "Already compacted" : "Nothing to compact (session too small)"
	};
}
//#endregion
//#region src/agents/agent-hooks/session-manager-runtime-registry.ts
/** Creates a WeakMap-backed runtime registry keyed by SessionManager object identity. */
function createSessionManagerRuntimeRegistry() {
	const registry = /* @__PURE__ */ new WeakMap();
	const set = (sessionManager, value) => {
		if (!sessionManager || typeof sessionManager !== "object") return;
		const key = sessionManager;
		if (value === null) {
			registry.delete(key);
			return;
		}
		registry.set(key, value);
	};
	const get = (sessionManager) => {
		if (!sessionManager || typeof sessionManager !== "object") return null;
		return registry.get(sessionManager) ?? null;
	};
	return {
		set,
		get
	};
}
//#endregion
//#region src/agents/sessions/session-model-usage.ts
const sinkBySessionManager = createSessionManagerRuntimeRegistry();
/** Records one auxiliary model completion at the session that owns the request. */
function recordSessionModelUsage(sessionManager, usage) {
	sinkBySessionManager.get(sessionManager)?.(usage);
}
/** Sets the active accounting owner for auxiliary model usage. */
function setSessionModelUsageSink(sessionManager, sink) {
	sinkBySessionManager.set(sessionManager, sink);
}
//#endregion
//#region src/agents/sessions/agent-session-compaction.ts
function compactionErrorMessage(error, fallback) {
	const message = error instanceof Error ? error.message : String(error);
	return message.trim() ? message : fallback;
}
/** @internal */
const agentSessionAutomaticCompaction = Symbol.for("openclaw.agent-session.automatic-compaction");
/** Installs a synchronous callback for model-context replacement during compaction. */
const agentSessionSetContextReplacementHook = Symbol.for("openclaw.agent-session.set-context-replacement-hook");
var AgentSessionCompaction = class extends AgentSessionInspection {
	[agentSessionSetContextReplacementHook](callback, assertActive) {
		this.onContextReplaced = callback;
		this.assertContextReplacementActive = assertActive;
	}
	/**
	* Manually compact the session context.
	* Aborts current agent operation first.
	* @param customInstructions Optional instructions for the compaction summary
	*/
	async compact(customInstructions) {
		return await this.compactWithPolicy(customInstructions, "none");
	}
	async [agentSessionAutomaticCompaction](customInstructions, requestState, summaryOutputPolicy = "retry-invalid-once") {
		return await this.compactWithPolicy(customInstructions, summaryOutputPolicy, requestState);
	}
	async compactWithPolicy(customInstructions, summaryOutputPolicy, requestState) {
		return await this.runWithSessionWriteSettlement(async () => await this.compactWithSessionWriteSettlement(customInstructions, summaryOutputPolicy, requestState));
	}
	async compactWithSessionWriteSettlement(customInstructions, summaryOutputPolicy = "none", requestState) {
		this.disconnectFromAgent();
		await this.abort();
		const abortController = new AbortController();
		this.compactionAbortController = abortController;
		const itemId = generateSessionEntryId();
		this.emit({
			type: "compaction_start",
			reason: "manual",
			itemId
		});
		try {
			const settings = this.settingsManager.getCompactionSettings();
			let outcome;
			try {
				outcome = await this.runCompactionWork({
					itemId,
					customInstructions,
					mode: "manual",
					summaryOutputPolicy,
					requestState,
					settings,
					signal: abortController.signal
				});
			} catch (error) {
				const message = compactionErrorMessage(error, "Compaction failed");
				const aborted = abortController.signal.aborted || error instanceof Error && error.name === "AbortError";
				this.emit({
					type: "compaction_end",
					reason: "manual",
					itemId,
					outcome: aborted ? { status: "aborted" } : {
						status: "failed",
						reason: `Compaction failed: ${message}`
					}
				});
				throw error;
			}
			if (outcome.status === "skipped") {
				this.emit({
					type: "compaction_end",
					reason: "manual",
					itemId,
					outcome
				});
				throw new Error(outcome.reason);
			}
			if (outcome.status === "aborted") {
				this.emit({
					type: "compaction_end",
					reason: "manual",
					itemId,
					outcome
				});
				throw new Error("Compaction cancelled");
			}
			this.emit({
				type: "compaction_end",
				reason: "manual",
				itemId,
				outcome: {
					status: "completed",
					tokensBefore: outcome.result.tokensBefore,
					tokensAfter: outcome.tokensAfter,
					willRetry: false
				}
			});
			return outcome.result;
		} finally {
			if (this.compactionAbortController === abortController) this.compactionAbortController = void 0;
			this.reconnectToAgent();
		}
	}
	/**
	* Cancel in-progress compaction (manual or auto).
	*/
	abortCompaction() {
		this.compactionAbortController?.abort();
		this.autoCompactionAbortController?.abort();
	}
	/**
	* Cancel in-progress branch summarization.
	*/
	abortBranchSummary() {
		this.branchSummaryAbortController?.abort();
	}
	async runCompactionWork(options) {
		const isManual = options.mode === "manual";
		if (!this.model) {
			if (isManual) throw new Error(formatNoModelSelectedMessage());
			return {
				status: "skipped",
				reason: formatNoModelSelectedMessage()
			};
		}
		const model = this.model;
		let auth;
		try {
			auth = await this.getCompactionRequestAuth(model);
		} catch (error) {
			if (isManual) throw error;
			return {
				status: "skipped",
				reason: compactionErrorMessage(error, "Compaction authentication failed")
			};
		}
		const pathEntries = this.sessionManager.getBranch();
		let preparation;
		if (isManual && !options.requestState) {
			const manualPreflight = preflightManualSessionCompaction(pathEntries, options.settings);
			if (!manualPreflight.compactable) throw new Error(manualPreflight.reason);
			preparation = manualPreflight.preparation;
		} else preparation = unwrapCoreResult(prepareCompaction$1(pathEntries, options.settings, options.requestState));
		if (!preparation) return {
			status: "skipped",
			reason: "Nothing to compact (session too small)"
		};
		let compactionResult;
		let fromExtension = false;
		if (this.currentExtensionRunner.hasHandlers("session_before_compact")) {
			const extensionResult = await this.currentExtensionRunner.emit({
				type: "session_before_compact",
				preparation,
				branchEntries: pathEntries,
				customInstructions: options.customInstructions,
				signal: options.signal,
				thinkingLevel: this.thinkingLevel,
				streamFn: this.agent.streamFn
			});
			if (extensionResult?.cancel) return { status: "aborted" };
			if (extensionResult?.compaction) {
				compactionResult = extensionResult.compaction;
				fromExtension = true;
			}
		}
		if (!compactionResult) {
			const focus = normalizeOptionalString(options.customInstructions);
			const boundedFocus = focus ? resolveCompactionInstructions(focus, void 0) : void 0;
			const coreInstructions = [boundedFocus ? wrapUntrustedPromptDataBlock({
				label: "Compaction focus",
				text: boundedFocus
			}) : "", preparation.latestUnresolvedUserRequest ? ["The run owner will resume this request after compaction. Preserve it as current work.", wrapUntrustedPromptDataBlock({
				label: "Latest unresolved user request",
				text: preparation.latestUnresolvedUserRequest
			})].join("\n") : ""].filter(Boolean).join("\n\n");
			const runCoreCompaction = () => compact$1(preparation, model, auth.apiKey, auth.headers, coreInstructions || void 0, options.signal, this.thinkingLevel, this.agent.streamFn, createCompactionRuntime((usage) => recordSessionModelUsage(this.sessionManager, usage)));
			let result = await runCoreCompaction();
			if (options.signal.aborted) return { status: "aborted" };
			if (options.summaryOutputPolicy === "retry-invalid-once" && !result.ok && result.error instanceof InvalidSummaryOutputError) {
				result = await runCoreCompaction();
				if (options.signal.aborted) return { status: "aborted" };
			}
			compactionResult = unwrapCoreResult(result);
		}
		if (options.signal.aborted) return { status: "aborted" };
		compactionResult = {
			...compactionResult,
			summary: capCompactionSummary(compactionResult.summary)
		};
		this.assertContextReplacementActive?.();
		const compactionEntryId = this.sessionManager.appendCompaction(compactionResult.summary, compactionResult.firstKeptEntryId, compactionResult.tokensBefore, compactionResult.details, fromExtension, { itemId: options.itemId });
		const sessionContext = this.sessionManager.buildSessionContext();
		this.agent.state.messages = sanitizeCompactionReplayMessages(sessionContext.messages);
		this.onContextReplaced?.(estimateContextTokens(this.agent.state.messages).tokens);
		const savedCompactionEntry = this.sessionManager.getEntry(compactionEntryId);
		if (this.currentExtensionRunner && savedCompactionEntry?.type === "compaction") await this.currentExtensionRunner.emit({
			type: "session_compact",
			compactionEntry: savedCompactionEntry,
			fromExtension
		});
		const tokensAfter = estimateContextTokens(this.agent.state.messages).tokens;
		return {
			status: "completed",
			result: compactionResult,
			tokensAfter
		};
	}
	/**
	* Check if compaction is needed and run it.
	* Called after agent_end and before prompt submission.
	*
	* Two cases:
	* 1. Overflow: LLM returned context overflow error, remove error message from agent state, compact, auto-retry
	* 2. Threshold: Context over threshold, compact, NO auto-retry (user continues manually)
	*
	* @param assistantMessage The assistant message to check
	* @param skipAbortedCheck If false, include aborted messages (for pre-prompt check). Default: true
	*/
	async checkCompaction(assistantMessage, skipAbortedCheck = true) {
		const settings = this.settingsManager.getCompactionSettings();
		if (!settings.enabled) return false;
		if (skipAbortedCheck && assistantMessage.stopReason === "aborted") return false;
		const contextWindow = this.model?.contextWindow ?? 0;
		const sameModel = this.model && assistantMessage.provider === this.model.provider && assistantMessage.model === this.model.id;
		const compactionEntry = getLatestCompactionEntry(this.sessionManager.getBranch());
		if (compactionEntry !== null && assistantMessage.timestamp <= new Date(compactionEntry.timestamp).getTime()) return false;
		if (sameModel && (assistantMessage.stopReason === "error" || assistantMessage.stopReason === "length") && isContextOverflow(assistantMessage, contextWindow)) {
			if (this.contextOverflowRecoveryOwner === "caller") return false;
			if (this.overflowRecoveryAttempts >= 3) {
				this.emit({
					type: "compaction_end",
					reason: "overflow",
					outcome: {
						status: "failed",
						reason: `Context overflow recovery failed after 3 compact-and-retry attempts. Try reducing context or switching to a larger-context model.`
					}
				});
				return false;
			}
			this.overflowRecoveryAttempts += 1;
			const messages = this.agent.state.messages;
			if (messages.at(-1)?.role === "assistant") this.agent.state.messages = messages.slice(0, -1);
			return await this.runAutoCompaction("overflow", true);
		}
		let contextTokens;
		if (assistantMessage.stopReason === "error") {
			const messages = this.agent.state.messages;
			const estimate = estimateContextTokens(messages);
			if (estimate.lastUsageIndex === null) return false;
			contextTokens = estimate.tokens;
		} else if (assistantMessage.usage.contextUsage?.state === "unavailable") {
			const estimatedContextTokens = this.getContextUsage()?.tokens;
			if (estimatedContextTokens == null) return false;
			contextTokens = estimatedContextTokens;
		} else contextTokens = calculateContextTokens(assistantMessage.usage);
		if (shouldCompact(contextTokens, contextWindow, settings)) return await this.runAutoCompaction("threshold", false);
		return false;
	}
	/**
	* Internal: Run auto-compaction with events.
	*/
	async runAutoCompaction(reason, willRetry) {
		const settings = this.settingsManager.getCompactionSettings();
		const itemId = generateSessionEntryId();
		this.emit({
			type: "compaction_start",
			reason,
			itemId
		});
		const abortController = new AbortController();
		this.autoCompactionAbortController = abortController;
		try {
			const outcome = await this.runCompactionWork({
				itemId,
				mode: "auto",
				...willRetry ? { requestState: "unresolved" } : {},
				summaryOutputPolicy: "retry-invalid-once",
				settings,
				signal: abortController.signal
			});
			if (outcome.status === "skipped") {
				this.emit({
					type: "compaction_end",
					reason,
					itemId,
					outcome
				});
				return false;
			}
			if (outcome.status === "aborted") {
				this.emit({
					type: "compaction_end",
					reason,
					itemId,
					outcome
				});
				return false;
			}
			this.emit({
				type: "compaction_end",
				reason,
				itemId,
				outcome: {
					status: "completed",
					tokensBefore: outcome.result.tokensBefore,
					tokensAfter: outcome.tokensAfter,
					willRetry
				}
			});
			if (willRetry) {
				const messages = this.agent.state.messages;
				const lastMsg = messages[messages.length - 1];
				if (lastMsg?.role === "assistant" && (lastMsg.stopReason === "error" || lastMsg.stopReason === "length")) this.agent.state.messages = messages.slice(0, -1);
				return true;
			}
			return this.agent.hasQueuedMessages();
		} catch (error) {
			if (abortController.signal.aborted) {
				this.emit({
					type: "compaction_end",
					reason,
					itemId,
					outcome: { status: "aborted" }
				});
				return false;
			}
			const errorMessage = compactionErrorMessage(error, "compaction failed");
			this.emit({
				type: "compaction_end",
				reason,
				itemId,
				outcome: {
					status: "failed",
					reason: reason === "overflow" ? `Context overflow recovery failed: ${errorMessage}` : `Auto-compaction failed: ${errorMessage}`
				}
			});
			return false;
		} finally {
			if (this.autoCompactionAbortController === abortController) this.autoCompactionAbortController = void 0;
		}
	}
	/**
	* Toggle auto-compaction setting.
	*/
	setAutoCompactionEnabled(enabled) {
		this.settingsManager.setCompactionEnabled(enabled);
	}
	/** Whether auto-compaction is enabled */
	get autoCompactionEnabled() {
		return this.settingsManager.getCompactionEnabled();
	}
};
//#endregion
//#region src/agents/sessions/agent-session-extensions.ts
var AgentSessionExtensions = class extends AgentSessionCompaction {
	async bindExtensions(bindings) {
		if (bindings.uiContext !== void 0) this.extensionUIContext = bindings.uiContext;
		if (bindings.commandContextActions !== void 0) this.extensionCommandContextActions = bindings.commandContextActions;
		if (bindings.abortHandler !== void 0) this.extensionAbortHandler = bindings.abortHandler;
		if (bindings.shutdownHandler !== void 0) this.extensionShutdownHandler = bindings.shutdownHandler;
		if (bindings.onError !== void 0) this.extensionErrorListener = bindings.onError;
		this.applyExtensionBindings(this.currentExtensionRunner);
		await this.currentExtensionRunner.emit(this.sessionStartEvent);
		await this.extendResourcesFromExtensions(this.sessionStartEvent.reason === "reload" ? "reload" : "startup");
	}
	async extendResourcesFromExtensions(reason) {
		if (!this.currentExtensionRunner.hasHandlers("resources_discover")) return;
		const { skillPaths, promptPaths, themePaths } = await this.currentExtensionRunner.emitResourcesDiscover(this.cwd, reason);
		if (skillPaths.length === 0 && promptPaths.length === 0 && themePaths.length === 0) return;
		const extensionPaths = {
			skillPaths: this.buildExtensionResourcePaths(skillPaths),
			promptPaths: this.buildExtensionResourcePaths(promptPaths),
			themePaths: this.buildExtensionResourcePaths(themePaths)
		};
		this.sessionResourceLoader.extendResources(extensionPaths);
		this.baseSystemPrompt = this.rebuildSystemPrompt(this.getActiveToolNames());
		this.agent.state.systemPrompt = this.baseSystemPrompt;
	}
	buildExtensionResourcePaths(entries) {
		return entries.map((entry) => {
			const source = this.getExtensionSourceLabel(entry.extensionPath);
			const baseDir = entry.extensionPath.startsWith("<") ? void 0 : dirname(entry.extensionPath);
			return {
				path: entry.path,
				metadata: {
					source,
					scope: "temporary",
					origin: "top-level",
					baseDir
				}
			};
		});
	}
	getExtensionSourceLabel(extensionPath) {
		if (extensionPath.startsWith("<")) return `extension:${extensionPath.replace(/[<>]/g, "")}`;
		return `extension:${basename(extensionPath).replace(/\.(ts|js)$/, "")}`;
	}
	applyExtensionBindings(runner) {
		runner.setUIContext(this.extensionUIContext);
		runner.bindCommandContext(this.extensionCommandContextActions);
		this.extensionErrorUnsubscriber?.();
		this.extensionErrorUnsubscriber = this.extensionErrorListener ? runner.onError(this.extensionErrorListener) : void 0;
	}
	refreshCurrentModelFromRegistry() {
		const currentModel = this.model;
		if (!currentModel) return;
		const refreshedModel = this.sessionModelRegistry.find(currentModel.provider, currentModel.id);
		if (!refreshedModel || refreshedModel === currentModel) return;
		this.agent.state.model = refreshedModel;
	}
	bindExtensionCore(runner) {
		const getCommands = () => {
			const extensionCommands = runner.getRegisteredCommands().map((command) => ({
				name: command.invocationName,
				description: command.description,
				source: "extension",
				sourceInfo: command.sourceInfo
			}));
			const templates = this.promptTemplates.map((template) => ({
				name: template.name,
				description: template.description,
				source: "prompt",
				sourceInfo: template.sourceInfo
			}));
			const skills = this.sessionResourceLoader.getSkills().skills.map((skill) => ({
				name: `skill:${skill.name}`,
				description: skill.description,
				source: "skill",
				sourceInfo: skill.sourceInfo
			}));
			return [
				...extensionCommands,
				...templates,
				...skills
			];
		};
		runner.bindCore({
			sendMessage: (message, options) => {
				this.sendCustomMessage(message, options).catch((err) => {
					runner.emitError({
						extensionPath: "<runtime>",
						event: "send_message",
						error: err instanceof Error ? err.message : String(err)
					});
				});
			},
			sendUserMessage: (content, options) => {
				this.sendUserMessage(content, options).catch((err) => {
					runner.emitError({
						extensionPath: "<runtime>",
						event: "send_user_message",
						error: err instanceof Error ? err.message : String(err)
					});
				});
			},
			appendEntry: (customType, data) => {
				this.sessionManager.appendCustomEntry(customType, data);
			},
			setSessionName: (name) => {
				this.setSessionName(name);
			},
			getSessionName: () => {
				return this.sessionManager.getSessionName();
			},
			setLabel: (entryId, label) => {
				this.sessionManager.appendLabelChange(entryId, label);
			},
			getActiveTools: () => this.getActiveToolNames(),
			getAllTools: () => this.getAllTools(),
			setActiveTools: (toolNames) => this.setActiveToolsByName(toolNames),
			refreshTools: () => this.refreshToolRegistry(),
			getCommands,
			setModel: async (model) => {
				if (!this.sessionModelRegistry.hasConfiguredAuth(model)) return false;
				await this.setModel(model);
				return true;
			},
			getThinkingLevel: () => this.thinkingLevel,
			setThinkingLevel: (level) => this.setThinkingLevel(level)
		}, {
			getModel: () => this.model,
			isIdle: () => !this.isStreaming,
			getSignal: () => this.agent.signal,
			abort: () => {
				if (this.extensionAbortHandler) {
					this.extensionAbortHandler();
					return;
				}
				this.abort();
			},
			hasPendingMessages: () => this.pendingMessageCount > 0,
			shutdown: () => {
				this.extensionShutdownHandler?.();
			},
			getContextUsage: () => this.getContextUsage(),
			compact: (options) => {
				(async () => {
					try {
						const result = await this.compact(options?.customInstructions);
						options?.onComplete?.(result);
					} catch (error) {
						const err = error instanceof Error ? error : new Error(String(error));
						options?.onError?.(err);
					}
				})();
			},
			getSystemPrompt: () => this.systemPrompt
		}, {
			registerProvider: (name, config) => {
				this.sessionModelRegistry.registerProvider(name, config);
				this.refreshCurrentModelFromRegistry();
			},
			unregisterProvider: (name) => {
				this.sessionModelRegistry.unregisterProvider(name);
				this.refreshCurrentModelFromRegistry();
			}
		});
	}
	/** Replace a runtime-owned tool surface without restarting its active agent loop. */
	replaceCustomTools(customTools, activeToolNames) {
		this.customTools = customTools;
		this.allowedToolNames = new Set(activeToolNames);
		this.refreshToolRegistry({ activeToolNames });
	}
	refreshToolRegistry(options) {
		const previousRegistryNames = new Set(this.toolRegistry.keys());
		const previousActiveToolNames = this.getActiveToolNames();
		const allowedToolNames = this.allowedToolNames;
		const isDisabledBuiltInToolName = (name) => this.disableBuiltInTools && this.baseToolDefinitions.has(name);
		const isAllowedTool = (name) => !isDisabledBuiltInToolName(name) && (!allowedToolNames || allowedToolNames.has(name));
		const allCustomTools = [...this.currentExtensionRunner.getAllRegisteredTools(), ...this.customTools.map((definition) => ({
			definition,
			sourceInfo: createSyntheticSourceInfo(`<sdk:${definition.name}>`, { source: "sdk" })
		}))].filter((tool) => isAllowedTool(tool.definition.name));
		const definitionRegistry = new Map(Array.from(this.baseToolDefinitions.entries()).filter(([name]) => isAllowedTool(name)).map(([name, definition]) => [name, {
			definition,
			sourceInfo: createSyntheticSourceInfo(`<builtin:${name}>`, { source: "builtin" })
		}]));
		for (const tool of allCustomTools) definitionRegistry.set(tool.definition.name, {
			definition: tool.definition,
			sourceInfo: tool.sourceInfo
		});
		this.toolDefinitions = definitionRegistry;
		this.toolPromptSnippets = new Map(Array.from(definitionRegistry.values()).map(({ definition }) => {
			const snippet = this.normalizePromptSnippet(definition.promptSnippet);
			return snippet ? [definition.name, snippet] : void 0;
		}).filter((entry) => entry !== void 0));
		this.toolPromptGuidelines = new Map(Array.from(definitionRegistry.values()).map(({ definition }) => {
			const guidelines = this.normalizePromptGuidelines(definition.promptGuidelines);
			return guidelines.length > 0 ? [definition.name, guidelines] : void 0;
		}).filter((entry) => entry !== void 0));
		const runner = this.currentExtensionRunner;
		const wrappedExtensionTools = wrapRegisteredTools(allCustomTools, runner);
		const wrappedBuiltInTools = wrapRegisteredTools(Array.from(this.baseToolDefinitions.values()).filter((definition) => isAllowedTool(definition.name)).map((definition) => ({
			definition,
			sourceInfo: createSyntheticSourceInfo(`<builtin:${definition.name}>`, { source: "builtin" })
		})), runner);
		const toolRegistry = new Map(wrappedBuiltInTools.map((tool) => [tool.name, tool]));
		for (const tool of wrappedExtensionTools) toolRegistry.set(tool.name, tool);
		this.toolRegistry = toolRegistry;
		const nextActiveToolNames = (options?.activeToolNames ? [...options.activeToolNames] : [...previousActiveToolNames]).filter((name) => isAllowedTool(name));
		if (allowedToolNames) {
			for (const toolName of this.toolRegistry.keys()) if (allowedToolNames.has(toolName)) nextActiveToolNames.push(toolName);
		} else if (options?.includeAllExtensionTools) for (const tool of wrappedExtensionTools) nextActiveToolNames.push(tool.name);
		else if (!options?.activeToolNames) {
			for (const toolName of this.toolRegistry.keys()) if (!previousRegistryNames.has(toolName)) nextActiveToolNames.push(toolName);
		}
		this.setActiveToolsByName([...new Set(nextActiveToolNames)]);
	}
	buildRuntime(options) {
		const autoResizeImages = this.settingsManager.getImageAutoResize();
		const shellCommandPrefix = this.settingsManager.getShellCommandPrefix();
		const shellPath = this.settingsManager.getShellPath();
		const baseToolDefinitions = this.baseToolsOverride ? Object.fromEntries(Object.entries(this.baseToolsOverride).map(([name, tool]) => [name, createToolDefinitionFromAgentTool(tool)])) : createAllToolDefinitions(this.cwd, {
			read: { autoResizeImages },
			bash: {
				commandPrefix: shellCommandPrefix,
				shellPath
			}
		});
		this.baseToolDefinitions = new Map(Object.entries(baseToolDefinitions).map(([name, tool]) => [name, tool]));
		const extensionsResult = this.sessionResourceLoader.getExtensions();
		if (options.flagValues) for (const [name, value] of options.flagValues) extensionsResult.runtime.flagValues.set(name, value);
		this.currentExtensionRunner = new ExtensionRunner(extensionsResult.extensions, extensionsResult.runtime, this.cwd, this.sessionManager, this.sessionModelRegistry);
		if (this.extensionRunnerRef) this.extensionRunnerRef.current = this.currentExtensionRunner;
		this.bindExtensionCore(this.currentExtensionRunner);
		this.applyExtensionBindings(this.currentExtensionRunner);
		const defaultActiveToolNames = this.baseToolsOverride ? Object.keys(this.baseToolsOverride) : [
			"read",
			"bash",
			"edit",
			"write"
		];
		const baseActiveToolNames = options.activeToolNames ?? defaultActiveToolNames;
		this.refreshToolRegistry({
			activeToolNames: baseActiveToolNames,
			includeAllExtensionTools: options.includeAllExtensionTools
		});
	}
	async reload() {
		const previousFlagValues = this.currentExtensionRunner.getFlagValues();
		await emitSessionShutdownEvent(this.currentExtensionRunner, {
			type: "session_shutdown",
			reason: "reload"
		});
		await this.settingsManager.reload();
		this.agent.steeringMode = this.settingsManager.getSteeringMode();
		this.agent.followUpMode = this.settingsManager.getFollowUpMode();
		await this.sessionResourceLoader.reload();
		this.sessionModelRegistry.refresh();
		this.buildRuntime({
			activeToolNames: this.getActiveToolNames(),
			flagValues: previousFlagValues,
			includeAllExtensionTools: true
		});
		if (this.extensionUIContext || this.extensionCommandContextActions || this.extensionShutdownHandler || this.extensionErrorListener) {
			await this.currentExtensionRunner.emit({
				type: "session_start",
				reason: "reload"
			});
			await this.extendResourcesFromExtensions("reload");
		}
	}
};
//#endregion
//#region src/agents/sessions/agent-session-execution.ts
var AgentSessionExecution = class extends AgentSessionExtensions {
	/**
	* Check if an error is retryable (overloaded, rate limit, server errors).
	* Context overflow errors are NOT retryable (handled by compaction instead).
	*/
	isRetryableError(message) {
		if (message.stopReason !== "error" || !message.errorMessage) return false;
		const contextWindow = this.model?.contextWindow ?? 0;
		if (isContextOverflow(message, contextWindow)) return false;
		return isRetryableAssistantError(message);
	}
	/**
	* Prepare a retryable error for continuation with exponential backoff.
	* @returns true if the caller should continue the agent, false otherwise
	*/
	async prepareRetry(message) {
		const settings = this.settingsManager.getRetrySettings();
		if (!settings.enabled) return false;
		this.retryCount++;
		if (this.retryCount > settings.maxRetries) {
			this.retryCount--;
			return false;
		}
		const backoffDelayMs = settings.baseDelayMs * 2 ** (this.retryCount - 1);
		const rateLimitWindow = classifyRateLimitWindow(message.errorMessage);
		const retryAfterDelayMs = rateLimitWindow.kind === "short" && rateLimitWindow.retryAfterSeconds !== void 0 ? Math.ceil(rateLimitWindow.retryAfterSeconds * 1e3) : 0;
		const delayMs = Math.max(backoffDelayMs, retryAfterDelayMs);
		this.emit({
			type: "auto_retry_start",
			attempt: this.retryCount,
			maxAttempts: settings.maxRetries,
			delayMs,
			errorMessage: message.errorMessage || "Unknown error"
		});
		const messages = this.agent.state.messages;
		if (messages.at(-1)?.role === "assistant") this.agent.state.messages = messages.slice(0, -1);
		this.retryAbortController = new AbortController();
		try {
			await sleep(delayMs, this.retryAbortController.signal);
		} catch {
			const attempt = this.retryCount;
			this.retryCount = 0;
			this.emit({
				type: "auto_retry_end",
				success: false,
				attempt,
				finalError: "Retry cancelled"
			});
			return false;
		} finally {
			this.retryAbortController = void 0;
		}
		return true;
	}
	/**
	* Cancel in-progress retry.
	*/
	abortRetry() {
		this.retryAbortController?.abort();
	}
	/** Whether auto-retry is currently in progress */
	get isRetrying() {
		return this.retryAbortController !== void 0;
	}
	/** Whether auto-retry is enabled */
	get autoRetryEnabled() {
		return this.settingsManager.getRetryEnabled();
	}
	/**
	* Toggle auto-retry setting.
	*/
	setAutoRetryEnabled(enabled) {
		this.settingsManager.setRetryEnabled(enabled);
	}
	/**
	* Execute a bash command.
	* Adds result to agent context and session.
	* @param command The bash command to execute
	* @param onChunk Optional streaming callback for output
	* @param options.excludeFromContext If true, command output won't be sent to LLM (!! prefix)
	* @param options.operations Custom BashOperations for remote execution
	*/
	async executeBash(command, onChunk, options) {
		this.bashAbortController = new AbortController();
		const prefix = this.settingsManager.getShellCommandPrefix();
		const shellPath = this.settingsManager.getShellPath();
		const resolvedCommand = prefix ? `${prefix}\n${command}` : command;
		try {
			const result = await executeBashWithOperations(resolvedCommand, this.sessionManager.getCwd(), options?.operations ?? createLocalBashOperations({ shellPath }), {
				onChunk,
				signal: this.bashAbortController.signal
			});
			this.recordBashResult(command, result, options);
			return result;
		} finally {
			this.bashAbortController = void 0;
		}
	}
	/**
	* Record a bash execution result in session history.
	* Used by executeBash and by extensions that handle bash execution themselves.
	*/
	recordBashResult(command, result, options) {
		const bashMessage = {
			role: "bashExecution",
			command,
			output: result.output,
			exitCode: result.exitCode,
			cancelled: result.cancelled,
			truncated: result.truncated,
			fullOutputPath: result.fullOutputPath,
			timestamp: Date.now(),
			excludeFromContext: options?.excludeFromContext
		};
		if (this.isStreaming) this.pendingBashMessages.push(bashMessage);
		else {
			this.agent.state.messages.push(bashMessage);
			this.sessionManager.appendMessage(bashMessage);
		}
	}
	/**
	* Cancel running bash command.
	*/
	abortBash() {
		this.bashAbortController?.abort();
	}
	/** Whether a bash command is currently running */
	get isBashRunning() {
		return this.bashAbortController !== void 0;
	}
	/** Whether there are pending bash messages waiting to be flushed */
	get hasPendingBashMessages() {
		return this.pendingBashMessages.length > 0;
	}
	/**
	* Flush pending bash messages to agent state and session.
	* Called after agent turn completes to maintain proper message ordering.
	*/
	flushPendingBashMessages() {
		if (this.pendingBashMessages.length === 0) return;
		for (const bashMessage of this.pendingBashMessages) {
			this.agent.state.messages.push(bashMessage);
			this.sessionManager.appendMessage(bashMessage);
		}
		this.pendingBashMessages = [];
	}
};
//#endregion
//#region src/agents/sessions/agent-session-tree.ts
var AgentSessionTree = class extends AgentSessionExecution {
	/**
	* Navigate to a different node in the session tree.
	* Unlike fork() which creates a new session file, this stays in the same file.
	*
	* @param targetId The entry ID to navigate to
	* @param options.summarize Whether user wants to summarize abandoned branch
	* @param options.customInstructions Custom instructions for summarizer
	* @param options.replaceInstructions If true, customInstructions replaces the default prompt
	* @param options.label Label to attach to the branch summary entry
	* @returns Result with editorText (if user message) and cancelled status
	*/
	async navigateTree(targetId, options = {}) {
		const oldLeafId = this.sessionManager.getLeafId();
		if (targetId === oldLeafId) return { cancelled: false };
		if (options.summarize && !this.model) throw new Error("No model available for summarization");
		const targetEntry = this.sessionManager.getEntry(targetId);
		if (!targetEntry) throw new Error(`Entry ${targetId} not found`);
		const { entries: entriesToSummarize, commonAncestorId } = oldLeafId ? collectEntriesForBranchSummaryFromBranches(this.sessionManager.getBranch(oldLeafId), this.sessionManager.getBranch(targetId)) : {
			entries: [],
			commonAncestorId: null
		};
		let customInstructions = options.customInstructions;
		let replaceInstructions = options.replaceInstructions;
		let label = options.label;
		const preparation = {
			targetId,
			oldLeafId,
			commonAncestorId,
			entriesToSummarize,
			userWantsSummary: options.summarize ?? false,
			customInstructions,
			replaceInstructions,
			label
		};
		this.branchSummaryAbortController = new AbortController();
		try {
			let extensionSummary;
			let fromExtension = false;
			if (this.currentExtensionRunner.hasHandlers("session_before_tree")) {
				const result = await this.currentExtensionRunner.emit({
					type: "session_before_tree",
					preparation,
					signal: this.branchSummaryAbortController.signal
				});
				if (result?.cancel) return { cancelled: true };
				if (result?.summary && options.summarize) {
					extensionSummary = result.summary;
					fromExtension = true;
				}
				if (result?.customInstructions !== void 0) customInstructions = result.customInstructions;
				if (result?.replaceInstructions !== void 0) replaceInstructions = result.replaceInstructions;
				if (result?.label !== void 0) label = result.label;
			}
			let summaryText;
			let summaryDetails;
			if (options.summarize && entriesToSummarize.length > 0 && !extensionSummary) {
				const model = this.model;
				const { apiKey, headers } = await this.getRequiredRequestAuth(model);
				const branchSummarySettings = this.settingsManager.getBranchSummarySettings();
				const result = normalizeBranchSummaryResult(await generateBranchSummary$1(entriesToSummarize, {
					model,
					apiKey,
					headers,
					signal: this.branchSummaryAbortController.signal,
					customInstructions,
					replaceInstructions,
					reserveTokens: branchSummarySettings.reserveTokens,
					streamFn: this.agent.streamFn,
					runtime: createCompactionRuntime((usage) => recordSessionModelUsage(this.sessionManager, usage))
				}));
				if (result.aborted) return {
					cancelled: true,
					aborted: true
				};
				if (result.error) throw new Error(result.error);
				summaryText = result.summary;
				summaryDetails = {
					readFiles: result.readFiles || [],
					modifiedFiles: result.modifiedFiles || []
				};
			} else if (extensionSummary) {
				summaryText = extensionSummary.summary;
				summaryDetails = extensionSummary.details;
			}
			let newLeafId;
			let editorText;
			if (targetEntry.type === "message" && targetEntry.message.role === "user") {
				newLeafId = targetEntry.parentId;
				editorText = extractTextContent(targetEntry.message.content);
			} else if (targetEntry.type === "custom_message") {
				newLeafId = targetEntry.parentId;
				editorText = extractTextContent(targetEntry.content);
			} else newLeafId = targetId;
			let summaryEntry;
			if (summaryText) {
				const summaryId = this.sessionManager.branchWithSummary(newLeafId, summaryText, summaryDetails, fromExtension);
				summaryEntry = this.sessionManager.getEntry(summaryId);
				if (label) this.sessionManager.appendLabelChange(summaryId, label);
			} else if (newLeafId === null) this.sessionManager.resetLeaf();
			else this.sessionManager.branch(newLeafId);
			if (label && !summaryText) this.sessionManager.appendLabelChange(targetId, label);
			const sessionContext = this.sessionManager.buildSessionContext();
			this.agent.state.messages = sanitizeCompactionReplayMessages(sessionContext.messages);
			await this.currentExtensionRunner.emit({
				type: "session_tree",
				newLeafId: this.sessionManager.getLeafId(),
				oldLeafId,
				summaryEntry,
				fromExtension: summaryText ? fromExtension : void 0
			});
			return {
				editorText,
				cancelled: false,
				summaryEntry
			};
		} finally {
			this.branchSummaryAbortController = void 0;
		}
	}
	/**
	* Get all user messages from session for fork selector.
	*/
	getUserMessagesForForking() {
		const entries = this.sessionManager.getEntries();
		const result = [];
		for (const entry of entries) {
			if (entry.type !== "message") continue;
			if (entry.message.role !== "user") continue;
			const text = extractTextContent(entry.message.content);
			if (text) result.push({
				entryId: entry.id,
				text
			});
		}
		return result;
	}
	createReplacedSessionContext() {
		const context = Object.defineProperties({}, Object.getOwnPropertyDescriptors(this.currentExtensionRunner.createCommandContext()));
		context.sendMessage = (message, options) => this.sendCustomMessage(message, options);
		context.sendUserMessage = (content, options) => this.sendUserMessage(content, options);
		return context;
	}
	/**
	* Check if extensions have handlers for a specific event type.
	*/
	hasExtensionHandlers(eventType) {
		return this.currentExtensionRunner.hasHandlers(eventType);
	}
	/**
	* Get the extension runner (for setting UI context and error handlers).
	*/
	get extensionRunner() {
		return this.currentExtensionRunner;
	}
};
//#endregion
//#region src/agents/sessions/agent-session.ts
/**
* Core abstraction for agent lifecycle and session management.
*
* Shared by interactive, print, and RPC modes. Mode-specific I/O stays above
* this class while the feature layers below own session behavior.
*/
var AgentSession = class extends AgentSessionTree {
	constructor(config) {
		super(config);
		this.unsubscribeAgent = this.agent.subscribe(this.handleAgentEvent);
		this.installAgentToolHooks();
		this.buildRuntime({
			activeToolNames: this.initialActiveToolNames,
			includeAllExtensionTools: true
		});
	}
};
//#endregion
//#region src/agents/sessions/resource-loader.ts
/**
* Session resource loader.
*
* Loads extensions, skills, prompts, themes, AGENTS files, and system prompt fragments for a cwd.
*/
const EMPTY_RESOLVED_PATHS = {
	extensions: [],
	skills: [],
	prompts: [],
	themes: []
};
function resolvePromptInput(input, description) {
	if (!input) return;
	if (existsSync(input)) try {
		return readFileSync(input, "utf-8");
	} catch (error) {
		console.error(chalk.yellow(`Warning: Could not read ${description} file ${input}: ${String(error)}`));
		return;
	}
	return input;
}
function loadContextFileFromDir(dir) {
	for (const filename of [
		"AGENTS.md",
		"AGENTS.MD",
		"CLAUDE.md",
		"CLAUDE.MD"
	]) {
		const filePath = join(dir, filename);
		if (existsSync(filePath)) try {
			return {
				path: filePath,
				content: readFileSync(filePath, "utf-8")
			};
		} catch (error) {
			console.error(chalk.yellow(`Warning: Could not read ${filePath}: ${String(error)}`));
		}
	}
	return null;
}
function loadProjectContextFiles(options) {
	const resolvedCwd = options.cwd;
	const resolvedAgentDir = options.agentDir;
	const contextFiles = [];
	const seenPaths = /* @__PURE__ */ new Set();
	const globalContext = loadContextFileFromDir(resolvedAgentDir);
	if (globalContext) {
		contextFiles.push(globalContext);
		seenPaths.add(globalContext.path);
	}
	const ancestorContextFiles = [];
	let currentDir = resolvedCwd;
	const root = resolve("/");
	while (true) {
		const contextFile = loadContextFileFromDir(currentDir);
		if (contextFile && !seenPaths.has(contextFile.path)) {
			ancestorContextFiles.unshift(contextFile);
			seenPaths.add(contextFile.path);
		}
		if (currentDir === root) break;
		const parentDir = resolve(currentDir, "..");
		if (parentDir === currentDir) break;
		currentDir = parentDir;
	}
	contextFiles.push(...ancestorContextFiles);
	return contextFiles;
}
var DefaultResourceLoader = class {
	constructor(options) {
		this.loaded = false;
		this.cwd = options.cwd;
		this.agentDir = options.agentDir;
		this.settingsManager = options.settingsManager ?? SettingsManager.create(this.cwd, this.agentDir);
		this.eventBus = options.eventBus ?? createEventBus();
		this.packageManager = new DefaultPackageManager({
			cwd: this.cwd,
			agentDir: this.agentDir,
			settingsManager: this.settingsManager
		});
		this.additionalExtensionPaths = options.additionalExtensionPaths ?? [];
		this.additionalSkillPaths = options.additionalSkillPaths ?? [];
		this.additionalPromptTemplatePaths = options.additionalPromptTemplatePaths ?? [];
		this.additionalThemePaths = options.additionalThemePaths ?? [];
		this.extensionFactories = options.extensionFactories ?? [];
		this.noExtensions = options.noExtensions ?? false;
		this.noSkills = options.noSkills ?? false;
		this.noPromptTemplates = options.noPromptTemplates ?? false;
		this.noThemes = options.noThemes ?? false;
		this.noContextFiles = options.noContextFiles ?? false;
		this.systemPromptSource = options.systemPrompt;
		this.appendSystemPromptSource = options.appendSystemPrompt;
		this.extensionsOverride = options.extensionsOverride;
		this.skillsOverride = options.skillsOverride;
		this.promptsOverride = options.promptsOverride;
		this.themesOverride = options.themesOverride;
		this.agentsFilesOverride = options.agentsFilesOverride;
		this.systemPromptTransform = options.systemPromptTransform;
		this.appendSystemPromptTransform = options.appendSystemPromptTransform;
		this.extensionsResult = {
			extensions: [],
			errors: [],
			runtime: createExtensionRuntime()
		};
		this.skills = [];
		this.skillDiagnostics = [];
		this.prompts = [];
		this.promptDiagnostics = [];
		this.themes = [];
		this.themeDiagnostics = [];
		this.agentsFiles = [];
		this.appendSystemPrompt = [];
		this.lastSkillPaths = [];
		this.extensionSkillSourceInfos = /* @__PURE__ */ new Map();
		this.extensionPromptSourceInfos = /* @__PURE__ */ new Map();
		this.extensionThemeSourceInfos = /* @__PURE__ */ new Map();
		this.lastPromptPaths = [];
		this.lastThemePaths = [];
	}
	getExtensions() {
		return this.extensionsResult;
	}
	getSkills() {
		return {
			skills: this.skills,
			diagnostics: this.skillDiagnostics
		};
	}
	getPrompts() {
		return {
			prompts: this.prompts,
			diagnostics: this.promptDiagnostics
		};
	}
	getThemes() {
		return {
			themes: this.themes,
			diagnostics: this.themeDiagnostics
		};
	}
	getAgentsFiles() {
		return { agentsFiles: this.agentsFiles };
	}
	getSystemPrompt() {
		return this.systemPrompt;
	}
	getAppendSystemPrompt() {
		return this.appendSystemPrompt;
	}
	extendResources(paths) {
		const skillPaths = this.normalizeExtensionPaths(paths.skillPaths ?? []);
		const promptPaths = this.normalizeExtensionPaths(paths.promptPaths ?? []);
		const themePaths = this.normalizeExtensionPaths(paths.themePaths ?? []);
		for (const entry of skillPaths) this.extensionSkillSourceInfos.set(entry.path, createSourceInfo(entry.path, entry.metadata));
		for (const entry of promptPaths) this.extensionPromptSourceInfos.set(entry.path, createSourceInfo(entry.path, entry.metadata));
		for (const entry of themePaths) this.extensionThemeSourceInfos.set(entry.path, createSourceInfo(entry.path, entry.metadata));
		if (skillPaths.length > 0) {
			this.lastSkillPaths = this.mergePaths(this.lastSkillPaths, skillPaths.map((entry) => entry.path));
			this.updateSkillsFromPaths(this.lastSkillPaths);
		}
		if (promptPaths.length > 0) {
			this.lastPromptPaths = this.mergePaths(this.lastPromptPaths, promptPaths.map((entry) => entry.path));
			this.updatePromptsFromPaths(this.lastPromptPaths);
		}
		if (themePaths.length > 0) {
			this.lastThemePaths = this.mergePaths(this.lastThemePaths, themePaths.map((entry) => entry.path));
			this.updateThemesFromPaths(this.lastThemePaths);
		}
	}
	async reload() {
		if (this.loaded) clearExtensionCache();
		await this.settingsManager.reload();
		const resolvedPaths = this.noExtensions && this.noSkills && this.noPromptTemplates && this.noThemes ? EMPTY_RESOLVED_PATHS : await this.packageManager.resolve();
		const cliExtensionPaths = await this.packageManager.resolveExtensionSources(this.additionalExtensionPaths, { temporary: true });
		const metadataByPath = /* @__PURE__ */ new Map();
		this.extensionSkillSourceInfos = /* @__PURE__ */ new Map();
		this.extensionPromptSourceInfos = /* @__PURE__ */ new Map();
		this.extensionThemeSourceInfos = /* @__PURE__ */ new Map();
		const getEnabledResources = (resources) => {
			for (const r of resources) if (!metadataByPath.has(r.path)) metadataByPath.set(r.path, r.metadata);
			return resources.filter((r) => r.enabled);
		};
		const getEnabledPaths = (resources) => getEnabledResources(resources).map((r) => r.path);
		const enabledExtensions = getEnabledPaths(resolvedPaths.extensions);
		const enabledSkillResources = getEnabledResources(resolvedPaths.skills);
		const enabledPrompts = getEnabledPaths(resolvedPaths.prompts);
		const enabledThemes = getEnabledPaths(resolvedPaths.themes);
		const mapSkillPath = (resource) => {
			if (resource.metadata.source !== "auto" && resource.metadata.origin !== "package") return resource.path;
			try {
				if (!statSync(resource.path).isDirectory()) return resource.path;
			} catch {
				return resource.path;
			}
			const skillFile = join(resource.path, "SKILL.md");
			if (existsSync(skillFile)) {
				if (!metadataByPath.has(skillFile)) metadataByPath.set(skillFile, resource.metadata);
				return skillFile;
			}
			return resource.path;
		};
		const enabledSkills = enabledSkillResources.map(mapSkillPath);
		for (const r of cliExtensionPaths.extensions) if (!metadataByPath.has(r.path)) metadataByPath.set(r.path, {
			source: "cli",
			scope: "temporary",
			origin: "top-level"
		});
		for (const r of cliExtensionPaths.skills) if (!metadataByPath.has(r.path)) metadataByPath.set(r.path, {
			source: "cli",
			scope: "temporary",
			origin: "top-level"
		});
		const cliEnabledExtensions = getEnabledPaths(cliExtensionPaths.extensions);
		const cliEnabledSkills = getEnabledPaths(cliExtensionPaths.skills);
		const cliEnabledPrompts = getEnabledPaths(cliExtensionPaths.prompts);
		const cliEnabledThemes = getEnabledPaths(cliExtensionPaths.themes);
		const extensionsResult = await loadExtensionsCached(this.noExtensions ? cliEnabledExtensions : this.mergePaths(cliEnabledExtensions, enabledExtensions), this.cwd, this.eventBus);
		const inlineExtensions = await this.loadExtensionFactories(extensionsResult.runtime);
		extensionsResult.extensions.push(...inlineExtensions.extensions);
		extensionsResult.errors.push(...inlineExtensions.errors);
		const conflicts = this.detectExtensionConflicts(extensionsResult.extensions);
		for (const conflict of conflicts) extensionsResult.errors.push({
			path: conflict.path,
			error: conflict.message
		});
		for (const p of this.additionalExtensionPaths) if (isLocalPath(p) && !existsSync(p)) extensionsResult.errors.push({
			path: p,
			error: `Extension path does not exist: ${p}`
		});
		this.extensionsResult = this.extensionsOverride ? this.extensionsOverride(extensionsResult) : extensionsResult;
		this.applyExtensionSourceInfo(this.extensionsResult.extensions, metadataByPath);
		const skillPaths = this.noSkills ? this.mergePaths(cliEnabledSkills, this.additionalSkillPaths) : this.mergePaths([...cliEnabledSkills, ...enabledSkills], this.additionalSkillPaths);
		this.lastSkillPaths = skillPaths;
		this.updateSkillsFromPaths(skillPaths, metadataByPath);
		for (const p of this.additionalSkillPaths) if (isLocalPath(p) && !existsSync(p) && !this.skillDiagnostics.some((d) => d.path === p)) this.skillDiagnostics.push({
			type: "error",
			message: "Skill path does not exist",
			path: p
		});
		const promptPaths = this.noPromptTemplates ? this.mergePaths(cliEnabledPrompts, this.additionalPromptTemplatePaths) : this.mergePaths([...cliEnabledPrompts, ...enabledPrompts], this.additionalPromptTemplatePaths);
		this.lastPromptPaths = promptPaths;
		this.updatePromptsFromPaths(promptPaths, metadataByPath);
		for (const p of this.additionalPromptTemplatePaths) if (isLocalPath(p) && !existsSync(p) && !this.promptDiagnostics.some((d) => d.path === p)) this.promptDiagnostics.push({
			type: "error",
			message: "Prompt template path does not exist",
			path: p
		});
		const themePaths = this.noThemes ? this.mergePaths(cliEnabledThemes, this.additionalThemePaths) : this.mergePaths([...cliEnabledThemes, ...enabledThemes], this.additionalThemePaths);
		this.lastThemePaths = themePaths;
		this.updateThemesFromPaths(themePaths, metadataByPath);
		for (const p of this.additionalThemePaths) if (!existsSync(p) && !this.themeDiagnostics.some((d) => d.path === p)) this.themeDiagnostics.push({
			type: "error",
			message: "Theme path does not exist",
			path: p
		});
		const agentsFiles = { agentsFiles: this.noContextFiles ? [] : loadProjectContextFiles({
			cwd: this.cwd,
			agentDir: this.agentDir
		}) };
		const resolvedAgentsFiles = this.agentsFilesOverride ? this.agentsFilesOverride(agentsFiles) : agentsFiles;
		this.agentsFiles = resolvedAgentsFiles.agentsFiles;
		const baseSystemPrompt = resolvePromptInput(this.systemPromptSource ?? this.discoverSystemPromptFile(), "system prompt");
		this.systemPrompt = this.systemPromptTransform ? this.systemPromptTransform(baseSystemPrompt) : baseSystemPrompt;
		const baseAppend = (this.appendSystemPromptSource ?? (this.discoverAppendSystemPromptFile() ? [this.discoverAppendSystemPromptFile()] : [])).map((s) => resolvePromptInput(s, "append system prompt")).filter((s) => s !== void 0);
		this.appendSystemPrompt = this.appendSystemPromptTransform ? this.appendSystemPromptTransform(baseAppend) : baseAppend;
		this.loaded = true;
	}
	normalizeExtensionPaths(entries) {
		return entries.map((entry) => ({
			path: this.resolveResourcePath(entry.path),
			metadata: entry.metadata
		}));
	}
	updateSkillsFromPaths(skillPaths, metadataByPath) {
		let skillsResult;
		if (this.noSkills && skillPaths.length === 0) skillsResult = {
			skills: [],
			diagnostics: []
		};
		else skillsResult = loadSkills({
			cwd: this.cwd,
			agentDir: this.agentDir,
			skillPaths,
			includeDefaults: false
		});
		const resolvedSkills = this.skillsOverride ? this.skillsOverride(skillsResult) : skillsResult;
		this.skills = resolvedSkills.skills.map((skill) => ({
			...skill,
			sourceInfo: this.findSourceInfoForPath(skill.filePath, this.extensionSkillSourceInfos, metadataByPath) ?? skill.sourceInfo ?? this.getDefaultSourceInfoForPath(skill.filePath)
		}));
		this.skillDiagnostics = resolvedSkills.diagnostics;
	}
	updatePromptsFromPaths(promptPaths, metadataByPath) {
		let promptsResult;
		if (this.noPromptTemplates && promptPaths.length === 0) promptsResult = {
			prompts: [],
			diagnostics: []
		};
		else {
			const allPrompts = loadPromptTemplates({
				cwd: this.cwd,
				agentDir: this.agentDir,
				promptPaths,
				includeDefaults: false
			});
			promptsResult = this.dedupePrompts(allPrompts);
		}
		const resolvedPrompts = this.promptsOverride ? this.promptsOverride(promptsResult) : promptsResult;
		this.prompts = resolvedPrompts.prompts.map((prompt) => ({
			...prompt,
			sourceInfo: this.findSourceInfoForPath(prompt.filePath, this.extensionPromptSourceInfos, metadataByPath) ?? prompt.sourceInfo ?? this.getDefaultSourceInfoForPath(prompt.filePath)
		}));
		this.promptDiagnostics = resolvedPrompts.diagnostics;
	}
	updateThemesFromPaths(themePaths, metadataByPath) {
		let themesResult;
		if (this.noThemes && themePaths.length === 0) themesResult = {
			themes: [],
			diagnostics: []
		};
		else {
			const loaded = this.loadThemes(themePaths, false);
			const deduped = this.dedupeThemes(loaded.themes);
			themesResult = {
				themes: deduped.themes,
				diagnostics: [...loaded.diagnostics, ...deduped.diagnostics]
			};
		}
		const resolvedThemes = this.themesOverride ? this.themesOverride(themesResult) : themesResult;
		this.themes = resolvedThemes.themes.map((theme) => {
			const sourcePath = theme.sourcePath;
			theme.sourceInfo = sourcePath ? this.findSourceInfoForPath(sourcePath, this.extensionThemeSourceInfos, metadataByPath) ?? theme.sourceInfo ?? this.getDefaultSourceInfoForPath(sourcePath) : theme.sourceInfo;
			return theme;
		});
		this.themeDiagnostics = resolvedThemes.diagnostics;
	}
	applyExtensionSourceInfo(extensions, metadataByPath) {
		for (const extension of extensions) {
			extension.sourceInfo = this.findSourceInfoForPath(extension.path, void 0, metadataByPath) ?? this.getDefaultSourceInfoForPath(extension.path);
			for (const command of extension.commands.values()) command.sourceInfo = extension.sourceInfo;
			for (const tool of extension.tools.values()) tool.sourceInfo = extension.sourceInfo;
		}
	}
	findSourceInfoForPath(resourcePath, extraSourceInfos, metadataByPath) {
		if (!resourcePath) return;
		if (resourcePath.startsWith("<")) return this.getDefaultSourceInfoForPath(resourcePath);
		const normalizedResourcePath = resolve(resourcePath);
		if (extraSourceInfos) for (const [sourcePath, sourceInfo] of extraSourceInfos.entries()) {
			const normalizedSourcePath = resolve(sourcePath);
			if (isPathInside(normalizedSourcePath, normalizedResourcePath)) return {
				...sourceInfo,
				path: resourcePath
			};
		}
		if (metadataByPath) {
			const exact = metadataByPath.get(normalizedResourcePath) ?? metadataByPath.get(resourcePath);
			if (exact) return createSourceInfo(resourcePath, exact);
			for (const [sourcePath, metadata] of metadataByPath.entries()) {
				const normalizedSourcePath = resolve(sourcePath);
				if (isPathInside(normalizedSourcePath, normalizedResourcePath)) return createSourceInfo(resourcePath, metadata);
			}
		}
	}
	getDefaultSourceInfoForPath(filePath) {
		if (filePath.startsWith("<") && filePath.endsWith(">")) return {
			path: filePath,
			source: filePath.slice(1, -1).split(":")[0] || "temporary",
			scope: "temporary",
			origin: "top-level"
		};
		const normalizedPath = resolve(filePath);
		const agentRoots = [
			join(this.agentDir, "skills"),
			join(this.agentDir, "prompts"),
			join(this.agentDir, "themes"),
			join(this.agentDir, "extensions")
		];
		const projectRoots = [
			join(this.cwd, CONFIG_DIR_NAME, "skills"),
			join(this.cwd, CONFIG_DIR_NAME, "prompts"),
			join(this.cwd, CONFIG_DIR_NAME, "themes"),
			join(this.cwd, CONFIG_DIR_NAME, "extensions")
		];
		for (const root of agentRoots) if (isPathInside(root, normalizedPath)) return {
			path: filePath,
			source: "local",
			scope: "user",
			origin: "top-level",
			baseDir: root
		};
		for (const root of projectRoots) if (isPathInside(root, normalizedPath)) return {
			path: filePath,
			source: "local",
			scope: "project",
			origin: "top-level",
			baseDir: root
		};
		return {
			path: filePath,
			source: "local",
			scope: "temporary",
			origin: "top-level",
			baseDir: statSync(normalizedPath).isDirectory() ? normalizedPath : resolve(normalizedPath, "..")
		};
	}
	mergePaths(primary, additional) {
		const merged = [];
		const seen = /* @__PURE__ */ new Set();
		for (const p of [...primary, ...additional]) {
			const resolved = this.resolveResourcePath(p);
			const canonicalPath = canonicalizePath(resolved);
			if (seen.has(canonicalPath)) continue;
			seen.add(canonicalPath);
			merged.push(resolved);
		}
		return merged;
	}
	resolveResourcePath(p) {
		const trimmed = p.trim();
		let expanded = trimmed;
		if (trimmed === "~") expanded = homedir();
		else if (trimmed.startsWith("~/")) expanded = join(homedir(), trimmed.slice(2));
		else if (trimmed.startsWith("~")) expanded = join(homedir(), trimmed.slice(1));
		return resolve(this.cwd, expanded);
	}
	loadThemes(paths, includeDefaults = true) {
		const themes = [];
		const diagnostics = [];
		if (includeDefaults) {
			const defaultDirs = [join(this.agentDir, "themes"), join(this.cwd, CONFIG_DIR_NAME, "themes")];
			for (const dir of defaultDirs) this.loadThemesFromDir(dir, themes, diagnostics);
		}
		for (const p of paths) {
			const resolved = resolve(this.cwd, p);
			if (!existsSync(resolved)) {
				diagnostics.push({
					type: "warning",
					message: "theme path does not exist",
					path: resolved
				});
				continue;
			}
			try {
				const stats = statSync(resolved);
				if (stats.isDirectory()) this.loadThemesFromDir(resolved, themes, diagnostics);
				else if (stats.isFile() && resolved.endsWith(".json")) this.loadThemeFromFile(resolved, themes, diagnostics);
				else diagnostics.push({
					type: "warning",
					message: "theme path is not a json file",
					path: resolved
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : "failed to read theme path";
				diagnostics.push({
					type: "warning",
					message,
					path: resolved
				});
			}
		}
		return {
			themes,
			diagnostics
		};
	}
	loadThemesFromDir(dir, themes, diagnostics) {
		if (!existsSync(dir)) return;
		try {
			const entries = readdirSync(dir, { withFileTypes: true });
			for (const entry of entries) {
				let isFile = entry.isFile();
				if (entry.isSymbolicLink()) try {
					isFile = statSync(join(dir, entry.name)).isFile();
				} catch {
					continue;
				}
				if (!isFile) continue;
				if (!entry.name.endsWith(".json")) continue;
				this.loadThemeFromFile(join(dir, entry.name), themes, diagnostics);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "failed to read theme directory";
			diagnostics.push({
				type: "warning",
				message,
				path: dir
			});
		}
	}
	loadThemeFromFile(filePath, themes, diagnostics) {
		try {
			themes.push(loadThemeFromPath(filePath));
		} catch (error) {
			const message = error instanceof Error ? error.message : "failed to load theme";
			diagnostics.push({
				type: "warning",
				message,
				path: filePath
			});
		}
	}
	async loadExtensionFactories(runtime) {
		const extensions = [];
		const errors = [];
		for (const [index, factory] of this.extensionFactories.entries()) {
			const extensionPath = `<inline:${index + 1}>`;
			try {
				const extension = await loadExtensionFromFactory(factory, this.cwd, this.eventBus, runtime, extensionPath);
				extensions.push(extension);
			} catch (error) {
				const message = error instanceof Error ? error.message : "failed to load extension";
				errors.push({
					path: extensionPath,
					error: message
				});
			}
		}
		return {
			extensions,
			errors
		};
	}
	dedupePrompts(prompts) {
		const seen = /* @__PURE__ */ new Map();
		const diagnostics = [];
		for (const prompt of prompts) {
			const existing = seen.get(prompt.name);
			if (existing) diagnostics.push({
				type: "collision",
				message: `name "/${prompt.name}" collision`,
				path: prompt.filePath,
				collision: {
					resourceType: "prompt",
					name: prompt.name,
					winnerPath: existing.filePath,
					loserPath: prompt.filePath
				}
			});
			else seen.set(prompt.name, prompt);
		}
		return {
			prompts: Array.from(seen.values()),
			diagnostics
		};
	}
	dedupeThemes(themes) {
		const seen = /* @__PURE__ */ new Map();
		const diagnostics = [];
		for (const t of themes) {
			const name = t.name ?? "unnamed";
			const existing = seen.get(name);
			if (existing) diagnostics.push({
				type: "collision",
				message: `name "${name}" collision`,
				path: t.sourcePath,
				collision: {
					resourceType: "theme",
					name,
					winnerPath: existing.sourcePath ?? "<builtin>",
					loserPath: t.sourcePath ?? "<builtin>"
				}
			});
			else seen.set(name, t);
		}
		return {
			themes: Array.from(seen.values()),
			diagnostics
		};
	}
	discoverSystemPromptFile() {
		const projectPath = join(this.cwd, CONFIG_DIR_NAME, "SYSTEM.md");
		if (existsSync(projectPath)) return projectPath;
		const globalPath = join(this.agentDir, "SYSTEM.md");
		if (existsSync(globalPath)) return globalPath;
	}
	discoverAppendSystemPromptFile() {
		const projectPath = join(this.cwd, CONFIG_DIR_NAME, "APPEND_SYSTEM.md");
		if (existsSync(projectPath)) return projectPath;
		const globalPath = join(this.agentDir, "APPEND_SYSTEM.md");
		if (existsSync(globalPath)) return globalPath;
	}
	detectExtensionConflicts(extensions) {
		const conflicts = [];
		const toolOwners = /* @__PURE__ */ new Map();
		const flagOwners = /* @__PURE__ */ new Map();
		for (const ext of extensions) {
			for (const toolName of ext.tools.keys()) {
				const existingOwner = toolOwners.get(toolName);
				if (existingOwner && existingOwner !== ext.path) conflicts.push({
					path: ext.path,
					message: `Tool "${toolName}" conflicts with ${existingOwner}`
				});
				else toolOwners.set(toolName, ext.path);
			}
			for (const flagName of ext.flags.keys()) {
				const existingOwner = flagOwners.get(flagName);
				if (existingOwner && existingOwner !== ext.path) conflicts.push({
					path: ext.path,
					message: `Flag "--${flagName}" conflicts with ${existingOwner}`
				});
				else flagOwners.set(flagName, ext.path);
			}
		}
		return conflicts;
	}
};
//#endregion
export { ReadToolContinuationSchema as $, createWriteToolDefinition as A, resolveCompactionInstructions as At, createFindToolDefinition as B, createCodingToolDefinitions as C, InMemoryAuthStorageBackend as Ct, createTool as D, takeRuntimeUserTurnTranscriptContext as Dt, createReadOnlyTools as E, attachRuntimeUserTurnTranscriptRecorder as Et, createLsTool as F, stripStaleAssistantUsageBeforeLatestCompaction as Ft, withFileMutationQueueKeyResolution as G, createEditToolDefinition as H, createLsToolDefinition as I, resolveModelPluginMetadataSnapshot as It, createBashTool as J, withFileMutationQueueKeysResolution as K, createGrepTool as L, resolveModelWorkspaceDir as Lt, createReadToolDefinition as M, isAssistantMessageWithContent as Mt, createBoundedReadTextPage as N, isThinkingBlock as Nt, createToolDefinition as O, takeRuntimeUserTurnTranscriptRecorder as Ot, formatReadContinuationNotice as P, stripStaleThinkingSignaturesForCompactionReplay as Pt, wrapToolDefinition as Q, createGrepToolDefinition as R, createAllTools as S, FileAuthStorageBackend as St, createReadOnlyToolDefinitions as T, formatNoModelsAvailableMessage as Tt, resolveFileMutationQueueKey as U, createEditTool as V, withFileMutationQueue as W, createLocalBashOperations as X, createBashToolDefinition as Y, createToolDefinitionFromAgentTool as Z, createExtensionRuntime as _, executeBashWithOperations as _t, recordSessionModelUsage as a, parseModelPattern as at, allToolNames as b, AuthStorage as bt, preflightManualSessionCompaction as c, restoreModelFromSession as ct, formatSkillsForPrompt as d, getModelRegistryRuntime as dt, formatFullOutputFooter as et, loadSkills as f, compact as ft, ExtensionRunner as g, generateBranchSummary as gt, retireQueuedUserMessage as h, collectEntriesForBranchSummary as ht, agentSessionSetContextReplacementHook as i, findInitialModel as it, createReadTool as j, sanitizeCompactionReplayMessages as jt, createWriteTool as k, withRuntimeUserTurnTranscriptRecorder as kt, agentSessionSetPromptPreparation as l, DEFAULT_THINKING_LEVEL as lt, subscribeSteeringMessagePersistenceFailure as m, prepareCompaction as mt, AgentSession as n, DefaultPackageManager as nt, setSessionModelUsageSink as o, resolveCliModel as ot, getSteeringMessageIdentity as p, generateSummary as pt, decodeUtf8File as q, agentSessionAutomaticCompaction as r, findExactModelReferenceMatch as rt, createSessionManagerRuntimeRegistry as s, resolveModelScope as st, DefaultResourceLoader as t, SettingsManager as tt, buildPromisedWorkPromptSection as u, ModelRegistry as ut, loadExtensionFromFactory as v, writePrivateTempFile as vt, createCodingTools as w, createEventBus as wt, createAllToolDefinitions as x, FILE_AUTH_STORAGE_BACKEND_DEPRECATION_CODE as xt, wrapRegisteredTools as y, AUTH_STORAGE_CREATE_DEPRECATION_CODE as yt, createFindTool as z };
