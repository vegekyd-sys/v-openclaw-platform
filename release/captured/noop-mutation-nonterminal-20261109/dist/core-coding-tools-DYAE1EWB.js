import { c as normalizeOptionalLowercaseString, o as normalizeLowercaseStringOrEmpty } from "./string-coerce-CIXf7egm.js";
import { t as createLazyImportLoader } from "./lazy-promise-DGqyc4Y4.js";
import { o as openRootFileFollowingParents } from "./boundary-file-read-uaJcf6X6.js";
import { a as canonicalPathFromExistingAncestor, t as FsSafeError, w as root } from "./fs-safe-Cdu9fYG_.js";
import { t as createAbortError } from "./abort-signal-D2k14JsD.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { o as PROCESS_TOOL_DISPLAY_SUMMARY } from "./tool-description-presets-C6exCTZo.js";
import { l as rewrapToolWithBeforeToolCallHook, u as wrapToolWithBeforeToolCallHook } from "./agent-tools.before-tool-call-g2OT63u5.js";
import { G as withFileMutationQueueKeyResolution, K as withFileMutationQueueKeysResolution, U as resolveFileMutationQueueKey, j as createReadTool, q as decodeUtf8File } from "./sessions-CHgQo4vL.js";
import { t as PATH_ALIAS_POLICIES } from "./path-alias-guards-BjQDysBY.js";
import { n as assertSandboxPath } from "./sandbox-paths-CjFMgmon.js";
import { n as resolvePathFromInput, r as toRelativeSandboxPath, t as preserveAtPrefixedRelativePath } from "./path-policy-De3jml1i.js";
import { a as resolveToolResultBudget } from "./tool-result-limits-DdMvF_Ec.js";
import { r as resolveApplyPatchInputPath } from "./apply-patch-paths-YyTqOxC_.js";
import { r as copyAgentToolMetadata, t as bindAgentToolActionDescriptor, v as isToolWrappedWithBeforeToolCallHook } from "./agent-tool-metadata-CkrU8K-F.js";
import { s as resolveReadOnlyWorkspaceSkillMounts } from "./workspace-mounts-BtgYry-w.js";
import { r as resolveSandboxFileMutationQueueKey } from "./file-mutation-identity-dqR8BH1r.js";
import { t as buildSandboxFsMounts } from "./fs-paths-xXLqJ6IV.js";
import { i as processSchema } from "./bash-tools.schemas-BuCKC47D.js";
import { n as wrapToolWithAbortSignal } from "./agent-tools.abort-D_hMKwN4.js";
import { n as describeProcessTool } from "./bash-tools.descriptions-BzKcEMBW.js";
import { t as applyToolAvailabilityDescriptions } from "./agent-tools.deferred-followup-BRdzMl01.js";
import { a as createSandboxedEditTool, f as wrapToolWorkspaceRootGuardWithOptions, h as writeHostFile, i as createOpenClawReadTool, l as resolveAdaptiveReadMaxBytes, m as withMemoryWriteProvenance, n as createHostWorkspaceEditTool, o as createSandboxedReadTool, r as createHostWorkspaceWriteTool, s as createSandboxedWriteTool, u as wrapReadToolWithSkillContent } from "./tool-loop-detection-config-Dftl-DTD.js";
import { t as createLazyExecTool } from "./lazy-exec-tool-CxVBaAvd.js";
import fs from "node:fs";
import path from "node:path";
import fs$1 from "node:fs/promises";
import { Type } from "typebox";
import { normalizeToolParameterSchema } from "@openclaw/ai/internal/openai";
//#region src/agents/agent-tools.schema.ts
/**
* Tool schema normalization wrappers.
* Applies provider-compatible parameter schema cleanup while preserving
* identity-backed metadata on normalized tools.
*/
function isObjectSchemaWithNoRequiredParams(schema) {
	if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;
	const record = schema;
	const type = record.type;
	if (!(type === "object" || Array.isArray(type) && type.some((entry) => entry === "object"))) return false;
	return !schemaHasRequiredParams(record);
}
function schemaHasRequiredParams(schema) {
	if (Array.isArray(schema.required) && schema.required.length > 0) return true;
	for (const key of [
		"allOf",
		"anyOf",
		"oneOf"
	]) {
		const variants = schema[key];
		if (!Array.isArray(variants)) continue;
		if (variants.some((variant) => variant !== null && typeof variant === "object" && !Array.isArray(variant) && schemaHasRequiredParams(variant))) return true;
	}
	return false;
}
/** Normalize a tool's parameter schema for the selected provider/model. */
function normalizeToolParameters(tool, options) {
	const schema = tool.parameters && typeof tool.parameters === "object" ? tool.parameters : void 0;
	if (!schema) return tool;
	const parameters = normalizeToolParameterSchema(schema, options);
	const normalized = {
		...tool,
		parameters
	};
	if (isObjectSchemaWithNoRequiredParams(parameters)) normalized.prepareArguments = (args) => {
		const prepared = tool.prepareArguments ? tool.prepareArguments(args) : args;
		return prepared === null || prepared === void 0 ? {} : prepared;
	};
	return copyAgentToolMetadata(tool, normalized);
}
//#endregion
//#region src/agents/agent-tools.finalize.ts
/** Apply the shared schema, hook, abort, and description wrappers to an authorized tool set. */
function finalizeAgentTools(options) {
	const normalized = options.tools.map((tool) => normalizeToolParameters(tool, {
		modelProvider: options.modelProvider,
		modelId: options.modelId,
		modelCompat: options.modelCompat
	}));
	options.recordToolPrepStage?.("schema-normalization");
	const hookOptions = {
		emitDiagnostics: options.emitBeforeToolCallDiagnostics,
		...options.approvalMode ? { approvalMode: options.approvalMode } : {}
	};
	const withHooks = options.wrapBeforeToolCallHook === false ? normalized : normalized.map((tool) => isToolWrappedWithBeforeToolCallHook(tool) ? rewrapToolWithBeforeToolCallHook(tool, options.hookContext, hookOptions) : wrapToolWithBeforeToolCallHook(tool, options.hookContext, hookOptions));
	options.recordToolPrepStage?.("tool-hooks");
	const abortSignal = options.abortSignal;
	const withAbort = abortSignal ? withHooks.map((tool) => wrapToolWithAbortSignal(tool, abortSignal)) : withHooks;
	options.recordToolPrepStage?.("abort-wrappers");
	const finalized = applyToolAvailabilityDescriptions(withAbort, { agentId: options.agentId });
	options.recordToolPrepStage?.("deferred-followup-descriptions");
	return finalized;
}
//#endregion
//#region src/agents/apply-patch-model-policy.ts
function isApplyPatchAllowedForModel(params) {
	const allowModels = Array.isArray(params.allowModels) ? params.allowModels : [];
	if (allowModels.length === 0) return true;
	const modelId = params.modelId?.trim();
	if (!modelId) return false;
	const normalizedModelId = normalizeLowercaseStringOrEmpty(modelId);
	const provider = normalizeOptionalLowercaseString(params.modelProvider);
	const normalizedFull = provider && !normalizedModelId.includes("/") ? `${provider}/${normalizedModelId}` : normalizedModelId;
	return allowModels.some((entry) => {
		const normalized = normalizeOptionalLowercaseString(entry);
		return Boolean(normalized && (normalized === normalizedModelId || normalized === normalizedFull));
	});
}
//#endregion
//#region src/agents/apply-patch-file-ops.ts
async function createPatchTarget(params) {
	if (await params.ops.createFileExclusive(params.target.resolved, params.contents) === "exists") throw new Error(`Cannot create ${params.target.display}: the file already exists. ${params.hint}`);
}
async function resolvePatchFileOps(options) {
	if (options.sandbox) {
		const { root, bridge } = options.sandbox;
		return withPatchMemoryWriteProvenance({
			observer: options.memoryWriteProvenance,
			operations: {
				readFile: async (filePath) => {
					const buf = await bridge.readFile({
						filePath,
						cwd: root
					});
					return decodeUtf8File(buf, filePath);
				},
				writeFile: (filePath, content) => {
					options.signal?.throwIfAborted();
					return bridge.writeFile({
						filePath,
						cwd: root,
						data: content,
						signal: options.signal
					});
				},
				createFileExclusive: (filePath, content) => {
					if (!bridge.createFileExclusive) throw new Error("Sandbox filesystem bridge does not support atomic file creation; refusing to overwrite an existing path.");
					options.signal?.throwIfAborted();
					return bridge.createFileExclusive({
						filePath,
						cwd: root,
						data: content,
						signal: options.signal
					});
				},
				remove: (filePath) => {
					options.signal?.throwIfAborted();
					return bridge.remove({
						filePath,
						cwd: root,
						force: false,
						signal: options.signal
					});
				},
				mkdirp: (dir) => {
					options.signal?.throwIfAborted();
					return bridge.mkdirp({
						filePath: dir,
						cwd: root,
						signal: options.signal
					});
				}
			}
		});
	}
	if (options.workspaceOnly === false) return withPatchMemoryWriteProvenance({
		observer: options.memoryWriteProvenance,
		operations: {
			readFile: async (filePath) => decodeUtf8File(await fs$1.readFile(filePath), filePath),
			writeFile: async (filePath, content) => {
				await writeHostFile(filePath, content, options.signal);
			},
			createFileExclusive: async (filePath, content) => {
				try {
					options.signal?.throwIfAborted();
					await fs$1.writeFile(filePath, content, {
						encoding: "utf8",
						flag: "wx"
					});
					return "created";
				} catch (error) {
					if (error.code === "EEXIST") return "exists";
					throw error;
				}
			},
			remove: (filePath) => {
				options.signal?.throwIfAborted();
				return fs$1.rm(filePath);
			},
			mkdirp: async (dir) => {
				options.signal?.throwIfAborted();
				await fs$1.mkdir(dir, { recursive: true });
			}
		}
	});
	const containmentRoot = options.root ?? options.cwd;
	const root$1 = await root(containmentRoot);
	const toCanonicalMutationRelative = async (filePath, pathOptions) => {
		const absolute = path.resolve(options.cwd, filePath);
		let canonicalAbsolute = absolute;
		try {
			const canonicalParent = await canonicalPathFromExistingAncestor(path.dirname(absolute));
			canonicalAbsolute = path.join(canonicalParent, path.basename(absolute));
		} catch {}
		const canonicalRoot = await fs$1.realpath(containmentRoot).catch(() => containmentRoot);
		return toRelativeSandboxPath(canonicalRoot, canonicalAbsolute, pathOptions);
	};
	return withPatchMemoryWriteProvenance({
		observer: options.memoryWriteProvenance,
		operations: {
			readFile: async (filePath) => {
				const opened = await openRootFileFollowingParents({
					absolutePath: filePath,
					rootPath: containmentRoot,
					boundaryLabel: "workspace root"
				});
				assertBoundaryRead(opened, filePath);
				try {
					return decodeUtf8File(fs.readFileSync(opened.fd), filePath);
				} finally {
					fs.closeSync(opened.fd);
				}
			},
			writeFile: async (filePath, content) => {
				const relative = await toCanonicalMutationRelative(filePath);
				options.signal?.throwIfAborted();
				await root$1.write(relative, content, { encoding: "utf8" });
			},
			createFileExclusive: async (filePath, content) => {
				const relative = await toCanonicalMutationRelative(filePath);
				try {
					options.signal?.throwIfAborted();
					await root$1.create(relative, content, { encoding: "utf8" });
					return "created";
				} catch (error) {
					if (error instanceof FsSafeError && (error.code === "already-exists" || error.code === "symlink")) return "exists";
					throw error;
				}
			},
			remove: async (filePath) => {
				const relative = await toCanonicalMutationRelative(filePath);
				options.signal?.throwIfAborted();
				await root$1.remove(relative);
			},
			mkdirp: async (dir) => {
				const relative = await toCanonicalMutationRelative(dir, { allowRoot: true });
				options.signal?.throwIfAborted();
				if (relative === "" || relative === ".") {
					await root$1.ensureRoot();
					return;
				}
				await root$1.mkdir(relative);
			}
		}
	});
}
var PatchCreateExistsSignal = class extends Error {};
function withPatchMemoryWriteProvenance(params) {
	const observer = params.observer;
	const operations = withMemoryWriteProvenance(params.operations, observer);
	if (!observer) return operations;
	return {
		...operations,
		createFileExclusive: async (filePath, content) => {
			if (!await observer.classifies(filePath)) return params.operations.createFileExclusive(filePath, content);
			try {
				await observer.write({
					absolutePath: filePath,
					contentBefore: "",
					contentAfter: content,
					commit: async () => {
						if (await params.operations.createFileExclusive(filePath, content) === "exists") throw new PatchCreateExistsSignal();
					}
				});
				return "created";
			} catch (error) {
				if (error instanceof PatchCreateExistsSignal) return "exists";
				throw error;
			}
		}
	};
}
function assertBoundaryRead(opened, targetPath) {
	if (opened.ok) return;
	const reason = opened.reason === "validation" ? "unsafe path" : "path not found";
	const error = /* @__PURE__ */ new Error(`Failed boundary read for ${targetPath} (${reason})`);
	const sourceCode = opened.error && typeof opened.error === "object" && "code" in opened.error ? opened.error.code : void 0;
	if (sourceCode === "ENOENT" || sourceCode === "ENOTDIR") error.code = sourceCode;
	throw error;
}
//#endregion
//#region src/agents/apply-patch-update.ts
/**
* Update-hunk application for the apply_patch parser.
* Locates expected old lines with tolerant matching, applies chunks in order,
* and retains source bytes that the patch does not change.
*/
const DASH_PUNCTUATION = /[\u2010-\u2015\u2212]/g;
const SINGLE_QUOTE_PUNCTUATION = /[\u2018-\u201B]/g;
const DOUBLE_QUOTE_PUNCTUATION = /[\u201C-\u201F]/g;
const SPACE_PUNCTUATION = /[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g;
async function defaultReadFile(filePath) {
	return fs$1.readFile(filePath, "utf8");
}
/** Apply parsed update chunks to one file and return the new file contents. */
async function applyUpdateHunk(filePath, chunks, options) {
	const source = parseSourceFile(await (options?.readFile ?? defaultReadFile)(filePath).catch((err) => {
		throw new Error(`Failed to read file to update ${filePath}: ${formatErrorMessage(err)}`);
	}));
	const replacements = computeReplacements(source, filePath, chunks);
	const newLines = applyReplacements(source.lines, replacements);
	ensureInteriorEndings(newLines, source.preferredEnding);
	return source.bom + newLines.map((line) => line.text + line.ending).join("");
}
function computeReplacements(source, filePath, chunks) {
	const originalLines = source.lines.map((line) => line.text);
	const replacements = [];
	let lineIndex = 0;
	for (const chunk of chunks) {
		if (chunk.changeContext) {
			const contextSearch = seekSequence(originalLines, [chunk.changeContext], lineIndex, false);
			if (contextSearch.kind === "ambiguous") throw new Error(`Found ${contextSearch.occurrences} occurrences of context '${chunk.changeContext}' in ${filePath}. The context must be unique; use a more specific @@ context line.`);
			if (contextSearch.kind === "missing") throw new Error(`Failed to find context '${chunk.changeContext}' in ${filePath}`);
			lineIndex = contextSearch.index + 1;
		}
		if (chunk.oldLines.length === 0) {
			const insertionIndex = chunk.changeContext && !chunk.isEndOfFile ? lineIndex : source.lines.length;
			const insertedLines = buildChangedLines({
				sourceLines: source.lines,
				startIndex: insertionIndex,
				oldCount: 0,
				newLines: chunk.newLines,
				preferredEnding: source.preferredEnding
			});
			const finalInsertedLine = insertedLines.at(-1);
			if (source.missingFinalEnding && insertionIndex === source.lines.length && finalInsertedLine) finalInsertedLine.ending = "";
			replacements.push([
				insertionIndex,
				0,
				insertedLines
			]);
			lineIndex = insertionIndex;
			continue;
		}
		let pattern = chunk.oldLines;
		let newSlice = chunk.newLines;
		let search = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);
		if (search.kind === "missing" && pattern[pattern.length - 1] === "") {
			pattern = pattern.slice(0, -1);
			if (newSlice.length > 0 && newSlice[newSlice.length - 1] === "") newSlice = newSlice.slice(0, -1);
			search = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);
		}
		if (search.kind === "ambiguous") throw new Error(`Found ${search.occurrences} occurrences of these lines in ${filePath}. The lines must be unique; include more surrounding lines in the hunk:\n${chunk.oldLines.join("\n")}`);
		if (search.kind === "missing") throw new Error(`Failed to find expected lines in ${filePath}:\n${chunk.oldLines.join("\n")}`);
		const found = search.index;
		replacements.push([
			found,
			pattern.length,
			buildChunkLines({
				source,
				matchIndex: found,
				pattern,
				newSlice,
				contextOldIndexes: chunk.contextOldIndexes
			})
		]);
		lineIndex = found + pattern.length;
	}
	replacements.sort((a, b) => a[0] - b[0]);
	return replacements;
}
function buildChunkLines(params) {
	const { source, matchIndex, pattern, newSlice, contextOldIndexes } = params;
	const lines = [];
	let oldStart = 0;
	let newStart = 0;
	for (const [newContext, oldContext] of contextOldIndexes.entries()) {
		if (oldContext === void 0 || oldContext >= pattern.length || newContext >= newSlice.length) continue;
		lines.push(...buildChangedLines({
			sourceLines: source.lines,
			startIndex: matchIndex + oldStart,
			oldCount: oldContext - oldStart,
			newLines: newSlice.slice(newStart, newContext),
			preferredEnding: source.preferredEnding
		}), source.lines[matchIndex + oldContext]);
		oldStart = oldContext + 1;
		newStart = newContext + 1;
	}
	lines.push(...buildChangedLines({
		sourceLines: source.lines,
		startIndex: matchIndex + oldStart,
		oldCount: pattern.length - oldStart,
		newLines: newSlice.slice(newStart),
		preferredEnding: source.preferredEnding
	}));
	return lines;
}
function buildChangedLines(params) {
	const { sourceLines, startIndex, oldCount, newLines, preferredEnding } = params;
	const replacedLines = sourceLines.slice(startIndex, startIndex + oldCount);
	const nearbyEnding = replacedLines.find((line) => line.ending)?.ending || sourceLines.at(startIndex)?.ending || sourceLines.at(startIndex - 1)?.ending || preferredEnding;
	return newLines.map((text, index) => {
		let ending = nearbyEnding;
		if (replacedLines.length === newLines.length) ending = replacedLines.at(index)?.ending ?? nearbyEnding;
		else if (index === newLines.length - 1 && replacedLines.length > 0) ending = replacedLines.at(-1)?.ending ?? nearbyEnding;
		else if (index < replacedLines.length - 1) ending = replacedLines.at(index)?.ending ?? nearbyEnding;
		return {
			text,
			ending
		};
	});
}
function applyReplacements(lines, replacements) {
	const result = [...lines];
	for (const [startIndex, oldLen, newLines] of [...replacements].toReversed()) result.splice(startIndex, oldLen, ...newLines);
	return result;
}
function parseSourceFile(contents) {
	const bom = contents.startsWith("﻿") ? "﻿" : "";
	const lines = ((bom ? contents.slice(1) : contents).match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+/g) ?? []).map(splitLineEnding);
	return {
		bom,
		lines,
		preferredEnding: lines.find((line) => line.ending)?.ending || "\n",
		missingFinalEnding: lines.length > 0 && lines.at(-1)?.ending === ""
	};
}
function splitLineEnding(line) {
	if (line.endsWith("\r\n")) return {
		text: line.slice(0, -2),
		ending: "\r\n"
	};
	if (line.endsWith("\r")) return {
		text: line.slice(0, -1),
		ending: "\r"
	};
	if (line.endsWith("\n")) return {
		text: line.slice(0, -1),
		ending: "\n"
	};
	return {
		text: line,
		ending: ""
	};
}
function ensureInteriorEndings(lines, preferredEnding) {
	for (const line of lines.slice(0, -1)) line.ending ||= preferredEnding;
}
function seekSequence(lines, pattern, start, eof) {
	if (pattern.length === 0) return {
		kind: "found",
		index: start
	};
	if (pattern.length > lines.length) return { kind: "missing" };
	const maxStart = lines.length - pattern.length;
	const searchStart = eof ? Math.max(start, maxStart) : start;
	if (searchStart > maxStart) return { kind: "missing" };
	const normalizers = [
		(value) => value,
		(value) => value.trimEnd(),
		(value) => value.trim(),
		(value) => normalizePunctuation(value.trim())
	];
	for (const normalize of normalizers) {
		let index = null;
		let occurrences = 0;
		for (let i = searchStart; i <= maxStart; i += 1) if (linesMatch(lines, pattern, i, normalize)) {
			index ??= i;
			occurrences += 1;
		}
		if (index !== null) return occurrences === 1 ? {
			kind: "found",
			index
		} : {
			kind: "ambiguous",
			occurrences
		};
	}
	return { kind: "missing" };
}
function linesMatch(lines, pattern, start, normalize) {
	for (let idx = 0; idx < pattern.length; idx += 1) {
		const line = lines.at(start + idx);
		const expected = pattern.at(idx);
		if (line === void 0 || expected === void 0 || normalize(line) !== normalize(expected)) return false;
	}
	return true;
}
function normalizePunctuation(value) {
	return value.replace(DASH_PUNCTUATION, "-").replace(SINGLE_QUOTE_PUNCTUATION, "'").replace(DOUBLE_QUOTE_PUNCTUATION, "\"").replace(SPACE_PUNCTUATION, " ");
}
//#endregion
//#region src/agents/apply-patch.ts
/**
* Runtime apply_patch tool and parser.
* Parses OpenAI-style patch envelopes and applies add/update/delete/move hunks
* through guarded host or sandbox filesystem operations.
*/
const BEGIN_PATCH_MARKER = "*** Begin Patch";
const END_PATCH_MARKER = "*** End Patch";
const ADD_FILE_MARKER = "*** Add File: ";
const DELETE_FILE_MARKER = "*** Delete File: ";
const UPDATE_FILE_MARKER = "*** Update File: ";
const MOVE_TO_MARKER = "*** Move to: ";
const EOF_MARKER = "*** End of File";
const CHANGE_CONTEXT_MARKER = "@@ ";
const EMPTY_CHANGE_CONTEXT_MARKER = "@@";
function normalizeUpdateComparison(content) {
	const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	if (normalized.length === 0 || normalized.endsWith("\n")) return normalized;
	return `${normalized}\n`;
}
const applyPatchSchema = Type.Object({ input: Type.String({ description: "Patch content using the *** Begin Patch/End Patch format." }) });
const ApplyPatchToolOutputSchema = Type.Object({ summary: Type.Object({
	added: Type.Array(Type.String()),
	modified: Type.Array(Type.String()),
	deleted: Type.Array(Type.String())
}, { additionalProperties: false }) }, { additionalProperties: false });
/** Create the agent tool wrapper for applying patch-envelope input. */
function createApplyPatchTool(options = {}) {
	const cwd = options.cwd ?? process.cwd();
	const root = options.root ?? cwd;
	const sandbox = options.sandbox;
	const workspaceOnly = options.workspaceOnly !== false;
	return {
		name: "apply_patch",
		label: "apply_patch",
		description: "Patch one/many files. Input requires *** Begin Patch and *** End Patch.",
		parameters: applyPatchSchema,
		outputSchema: ApplyPatchToolOutputSchema,
		execute: async (_toolCallId, args, signal) => {
			const executionSignal = options.abortSignal ? AbortSignal.any(signal ? [signal, options.abortSignal] : [options.abortSignal]) : signal;
			const params = args;
			const input = typeof params.input === "string" ? params.input : "";
			if (!input.trim()) throw new Error("Provide a patch input.");
			if (executionSignal?.aborted) throw createAbortError("Aborted");
			const result = await applyPatch(input, {
				cwd,
				root,
				sandbox,
				workspaceOnly,
				memoryWriteProvenance: options.memoryWriteProvenance,
				signal: executionSignal
			});
			return {
				content: [{
					type: "text",
					text: result.text
				}],
				details: { summary: result.summary }
			};
		}
	};
}
/** Parse and apply a patch envelope to the configured filesystem target. */
async function applyPatch(input, options) {
	const parsed = parsePatchText(input);
	if (parsed.hunks.length === 0) throw new Error("No files were modified.");
	const patchOptions = {
		...options,
		patchInputPaths: await resolvePatchInputPaths(parsed.hunks, options)
	};
	const summary = {
		added: [],
		modified: [],
		deleted: []
	};
	const seen = {
		added: /* @__PURE__ */ new Set(),
		modified: /* @__PURE__ */ new Set(),
		deleted: /* @__PURE__ */ new Set()
	};
	const noOpPaths = /* @__PURE__ */ new Set();
	let fileOpsPromise;
	const getFileOps = () => fileOpsPromise ??= resolvePatchFileOps(patchOptions);
	for (const hunk of parsed.hunks) {
		if (patchOptions.signal?.aborted) throw createAbortError("Aborted");
		if (hunk.kind === "add") {
			const targetResolution = resolvePatchPath(hunk.path, patchOptions);
			await withFileMutationQueueKeyResolution(targetResolution.then((target) => target.queueKey), async () => {
				const target = await targetResolution;
				const fileOps = await getFileOps();
				await assertPatchParentPath(hunk.path, patchOptions);
				await ensureDir(target.resolved, fileOps);
				await createPatchTarget({
					target,
					contents: hunk.contents,
					ops: fileOps,
					hint: `Use "*** Update File: ${target.display}" to change it, or delete it earlier in the same patch.`
				});
			});
			recordSummary(summary, seen, "added", (await targetResolution).display);
			continue;
		}
		if (hunk.kind === "delete") {
			const targetResolution = resolvePatchPath(hunk.path, patchOptions, PATH_ALIAS_POLICIES.unlinkTarget);
			await withFileMutationQueueKeyResolution(targetResolution.then((target) => target.queueKey), async () => {
				const target = await targetResolution;
				await (await getFileOps()).remove(target.resolved);
			});
			recordSummary(summary, seen, "deleted", (await targetResolution).display);
			continue;
		}
		const targetResolution = resolvePatchPath(hunk.path, patchOptions);
		const moveTargetResolution = hunk.movePath ? resolvePatchPath(hunk.movePath, patchOptions) : void 0;
		await withFileMutationQueueKeysResolution(Promise.all([targetResolution.then((target) => target.queueKey), ...moveTargetResolution ? [moveTargetResolution.then((moveTarget) => moveTarget.queueKey)] : []]), async () => {
			const target = await targetResolution;
			const moveTarget = moveTargetResolution ? await moveTargetResolution : void 0;
			const fileOps = await getFileOps();
			const applied = await applyUpdateHunk(target.resolved, hunk.chunks, fileOps);
			if (hunk.movePath && moveTarget) {
				await assertPatchParentPath(hunk.movePath, patchOptions);
				await ensureDir(moveTarget.resolved, fileOps);
				const moveResolvesToSource = path.resolve(moveTarget.resolved) === path.resolve(target.resolved);
				if (moveResolvesToSource) {
					if (normalizeUpdateComparison(await fileOps.readFile(target.resolved)) === normalizeUpdateComparison(applied)) noOpPaths.add(target.display);
					else {
						noOpPaths.delete(target.display);
						await fileOps.writeFile(target.resolved, applied);
					}
				} else {
					noOpPaths.delete(target.display);
					await createPatchTarget({
						target: moveTarget,
						contents: applied,
						ops: fileOps,
						hint: "Delete it earlier in the same patch to replace it."
					});
					await fileOps.remove(target.resolved);
				}
				if (!noOpPaths.has(target.display)) recordSummary(summary, seen, "modified", moveResolvesToSource ? target.display : moveTarget.display);
				return;
			}
			if (normalizeUpdateComparison(await fileOps.readFile(target.resolved)) === normalizeUpdateComparison(applied)) noOpPaths.add(target.display);
			else {
				noOpPaths.delete(target.display);
				await fileOps.writeFile(target.resolved, applied);
				recordSummary(summary, seen, "modified", target.display);
			}
		});
	}
	const noOp = noOpPaths.size > 0 && Object.values(summary).every((paths) => paths.length === 0);
	return {
		summary,
		text: noOp ? `No changes made to ${Array.from(noOpPaths).join(", ")}.` : formatSummary(summary),
		...noOp ? { noOp: true } : {}
	};
}
async function resolvePatchInputPaths(hunks, options) {
	const rawPaths = /* @__PURE__ */ new Set();
	for (const hunk of hunks) {
		rawPaths.add(hunk.path);
		if (hunk.kind === "update" && hunk.movePath) rawPaths.add(hunk.movePath);
	}
	const resolved = /* @__PURE__ */ new Map();
	for (const rawPath of rawPaths) resolved.set(rawPath, options.sandbox ? await resolveApplyPatchInputPath(rawPath, options) : preserveAtPrefixedRelativePath(rawPath, options.cwd));
	return resolved;
}
function recordSummary(summary, seen, bucket, value) {
	if (seen[bucket].has(value)) return;
	seen[bucket].add(value);
	summary[bucket].push(value);
}
function formatSummary(summary) {
	const lines = ["Success. Updated the following files:"];
	for (const file of summary.added) lines.push(`A ${file}`);
	for (const file of summary.modified) lines.push(`M ${file}`);
	for (const file of summary.deleted) lines.push(`D ${file}`);
	return lines.join("\n");
}
async function ensureDir(filePath, ops) {
	const parent = path.dirname(filePath);
	if (!parent || parent === ".") return;
	await ops.mkdirp(parent);
}
async function assertPatchParentPath(rawFilePath, options) {
	if (options.workspaceOnly === false || options.sandbox) return;
	const filePath = preserveAtPrefixedRelativePath(rawFilePath, options.cwd);
	const parent = path.dirname(filePath);
	if (!parent || parent === ".") return;
	await assertNoExistingParentAliases({
		parentPath: (await assertSandboxPath({
			filePath: parent,
			cwd: options.cwd,
			root: options.root ?? options.cwd
		})).resolved,
		rootPath: options.root ?? options.cwd
	});
}
async function assertNoExistingParentAliases(params) {
	const rootPath = path.resolve(params.rootPath);
	const parentPath = path.resolve(params.parentPath);
	const relative = path.relative(rootPath, parentPath);
	if (!relative || relative === "" || relativePathEscapesRoot(relative)) return;
	let current = rootPath;
	for (const segment of relative.split(path.sep)) {
		if (!segment) continue;
		current = path.join(current, segment);
		const stat = await fs$1.lstat(current).catch((error) => {
			if (error.code === "ENOENT") return null;
			throw error;
		});
		if (!stat) return;
		if (stat.isSymbolicLink()) throw new Error(`Path alias under sandbox root: ${path.relative(rootPath, current)}`);
	}
}
async function resolvePatchPath(rawFilePath, options, aliasPolicy = PATH_ALIAS_POLICIES.strict) {
	if (options.sandbox) {
		const filePath = options.patchInputPaths?.get(rawFilePath) ?? await resolveApplyPatchInputPath(rawFilePath, options);
		const resolved = options.sandbox.bridge.resolvePath({
			filePath,
			cwd: options.cwd
		});
		if (options.workspaceOnly !== false && resolved.hostPath) await assertSandboxPath({
			filePath: resolved.hostPath,
			cwd: options.cwd,
			root: options.root ?? options.cwd,
			allowFinalSymlinkForUnlink: aliasPolicy.allowFinalSymlinkForUnlink,
			allowFinalHardlinkForUnlink: aliasPolicy.allowFinalHardlinkForUnlink
		});
		return {
			resolved: resolved.hostPath ?? resolved.containerPath,
			queueKey: await resolveSandboxFileMutationQueueKey({
				bridge: options.sandbox.bridge,
				root: options.sandbox.root,
				filePath,
				cwd: options.cwd,
				signal: options.signal
			}),
			display: resolved.relativePath || resolved.containerPath
		};
	}
	const filePath = options.patchInputPaths?.get(rawFilePath) ?? preserveAtPrefixedRelativePath(rawFilePath, options.cwd);
	const resolved = options.workspaceOnly !== false ? (await assertSandboxPath({
		filePath,
		cwd: options.cwd,
		root: options.root ?? options.cwd,
		allowFinalSymlinkForUnlink: aliasPolicy.allowFinalSymlinkForUnlink,
		allowFinalHardlinkForUnlink: aliasPolicy.allowFinalHardlinkForUnlink
	})).resolved : resolvePathFromInput(filePath, options.cwd);
	return {
		resolved,
		queueKey: await resolveFileMutationQueueKey(resolved),
		display: toDisplayPath(resolved, options.cwd)
	};
}
function toDisplayPath(resolved, cwd) {
	const relative = path.relative(cwd, resolved);
	if (!relative || relative === "") return path.basename(resolved);
	if (relativePathEscapesRoot(relative)) return resolved;
	return relative;
}
function relativePathEscapesRoot(relativePath) {
	return relativePath === ".." || relativePath.startsWith("../") || relativePath.startsWith("..\\") || path.isAbsolute(relativePath);
}
function parsePatchText(input) {
	const trimmed = input.trim();
	if (!trimmed) throw new Error("Invalid patch: input is empty.");
	const validated = checkPatchBoundariesLenient(trimmed.split(/\r?\n/));
	const hunks = [];
	const lastLineIndex = validated.length - 1;
	let remaining = validated.slice(1, lastLineIndex);
	let lineNumber = 2;
	while (remaining.length > 0) {
		const { hunk, consumed } = parseOneHunk(remaining, lineNumber);
		hunks.push(hunk);
		lineNumber += consumed;
		remaining = remaining.slice(consumed);
	}
	return {
		hunks,
		patch: validated.join("\n")
	};
}
function checkPatchBoundariesLenient(lines) {
	const strictError = checkPatchBoundariesStrict(lines);
	if (!strictError) return lines;
	if (lines.length < 4) throw new Error(strictError);
	const first = lines[0];
	const last = lines.at(-1);
	if (last && (first === "<<EOF" || first === "<<'EOF'" || first === "<<\"EOF\"") && last.endsWith("EOF")) {
		const inner = lines.slice(1, -1);
		const innerError = checkPatchBoundariesStrict(inner);
		if (!innerError) return inner;
		throw new Error(innerError);
	}
	throw new Error(strictError);
}
function checkPatchBoundariesStrict(lines) {
	const firstLine = lines[0]?.trim();
	const lastLine = lines[lines.length - 1]?.trim();
	if (firstLine === BEGIN_PATCH_MARKER && lastLine === END_PATCH_MARKER) return null;
	if (firstLine !== BEGIN_PATCH_MARKER) return "The first line of the patch must be '*** Begin Patch'";
	return "The last line of the patch must be '*** End Patch'";
}
function parseOneHunk(lines, lineNumber) {
	if (lines.length === 0) throw new Error(`Invalid patch hunk at line ${lineNumber}: empty hunk`);
	const firstLine = lines.at(0)?.trim();
	if (firstLine === void 0) throw new Error(`Invalid patch hunk at line ${lineNumber}: empty hunk`);
	if (firstLine.startsWith(ADD_FILE_MARKER)) {
		const targetPath = firstLine.slice(14);
		let contents = "";
		let consumed = 1;
		for (const addLine of lines.slice(1)) if (addLine.startsWith("+")) {
			contents += `${addLine.slice(1)}\n`;
			consumed += 1;
		} else break;
		return {
			hunk: {
				kind: "add",
				path: targetPath,
				contents
			},
			consumed
		};
	}
	if (firstLine.startsWith(DELETE_FILE_MARKER)) return {
		hunk: {
			kind: "delete",
			path: firstLine.slice(17)
		},
		consumed: 1
	};
	if (firstLine.startsWith(UPDATE_FILE_MARKER)) {
		const targetPath = firstLine.slice(17);
		let remaining = lines.slice(1);
		let consumed = 1;
		let movePath;
		const moveCandidate = remaining[0]?.trim();
		if (moveCandidate?.startsWith(MOVE_TO_MARKER)) {
			movePath = moveCandidate.slice(13);
			remaining = remaining.slice(1);
			consumed += 1;
		}
		const chunks = [];
		while (remaining.length > 0) {
			const firstRemaining = remaining.at(0);
			if (firstRemaining === void 0) break;
			if (firstRemaining.trim() === "") {
				remaining = remaining.slice(1);
				consumed += 1;
				continue;
			}
			if (firstRemaining.startsWith("***")) break;
			const { chunk, consumed: chunkLines } = parseUpdateFileChunk(remaining, lineNumber + consumed, chunks.length === 0);
			chunks.push(chunk);
			remaining = remaining.slice(chunkLines);
			consumed += chunkLines;
		}
		if (chunks.length === 0) throw new Error(`Invalid patch hunk at line ${lineNumber}: Update file hunk for path '${targetPath}' is empty`);
		return {
			hunk: {
				kind: "update",
				path: targetPath,
				movePath,
				chunks
			},
			consumed
		};
	}
	throw new Error(`Invalid patch hunk at line ${lineNumber}: '${lines[0]}' is not a valid hunk header. Valid hunk headers: '*** Add File: {path}', '*** Delete File: {path}', '*** Update File: {path}'`);
}
function parseUpdateFileChunk(lines, lineNumber, allowMissingContext) {
	if (lines.length === 0) throw new Error(`Invalid patch hunk at line ${lineNumber}: Update hunk does not contain any lines`);
	let changeContext;
	let startIndex = 0;
	const firstLine = lines.at(0);
	if (firstLine === EMPTY_CHANGE_CONTEXT_MARKER) startIndex = 1;
	else if (firstLine?.startsWith(CHANGE_CONTEXT_MARKER)) {
		changeContext = firstLine.slice(3);
		startIndex = 1;
	} else if (!allowMissingContext) throw new Error(`Invalid patch hunk at line ${lineNumber}: Expected update hunk to start with a @@ context marker, got: '${firstLine}'`);
	if (startIndex >= lines.length) throw new Error(`Invalid patch hunk at line ${lineNumber + 1}: Update hunk does not contain any lines`);
	const chunk = {
		changeContext,
		oldLines: [],
		newLines: [],
		contextOldIndexes: [],
		isEndOfFile: false
	};
	let parsedLines = 0;
	for (const line of lines.slice(startIndex)) {
		if (line === EOF_MARKER) {
			if (parsedLines === 0) throw new Error(`Invalid patch hunk at line ${lineNumber + 1}: Update hunk does not contain any lines`);
			chunk.isEndOfFile = true;
			parsedLines += 1;
			break;
		}
		const marker = line[0];
		if (!marker) {
			chunk.contextOldIndexes.push(chunk.oldLines.length);
			chunk.oldLines.push("");
			chunk.newLines.push("");
			parsedLines += 1;
			continue;
		}
		if (marker === " ") {
			const content = line.slice(1);
			chunk.contextOldIndexes.push(chunk.oldLines.length);
			chunk.oldLines.push(content);
			chunk.newLines.push(content);
			parsedLines += 1;
			continue;
		}
		if (marker === "+") {
			chunk.contextOldIndexes.push(void 0);
			chunk.newLines.push(line.slice(1));
			parsedLines += 1;
			continue;
		}
		if (marker === "-") {
			chunk.oldLines.push(line.slice(1));
			parsedLines += 1;
			continue;
		}
		if (parsedLines === 0) throw new Error(`Invalid patch hunk at line ${lineNumber + 1}: Unexpected line found in update hunk: '${line}'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)`);
		break;
	}
	return {
		chunk,
		consumed: parsedLines + startIndex
	};
}
if (process.env.VITEST || false) globalThis[Symbol.for("openclaw.applyPatchTestApi")] = { applyPatch };
//#endregion
//#region src/agents/lazy-process-tool.ts
const bashToolsModuleLoader = createLazyImportLoader(() => import("./bash-tools-qWZ0fCIb.js"));
/** Build process lazily so tool discovery does not load the shell runtime. */
function createLazyProcessTool(defaults) {
	let loadedTool;
	const loadTool = async () => {
		if (!loadedTool) {
			const { createProcessTool } = await bashToolsModuleLoader.load();
			loadedTool = createProcessTool(defaults);
		}
		return loadedTool;
	};
	return {
		name: "process",
		label: "process",
		displaySummary: PROCESS_TOOL_DISPLAY_SUMMARY,
		description: describeProcessTool({ hasCronTool: defaults?.hasCronTool === true }),
		parameters: processSchema,
		execute: async (toolCallId, params, signal, onUpdate) => (await loadTool()).execute(toolCallId, params, signal, onUpdate)
	};
}
//#endregion
//#region src/agents/core-coding-tools.ts
function sandboxReadMounts(sandbox) {
	const mounts = buildSandboxFsMounts(sandbox).filter((mount) => mount.source !== "workspace").map((mount) => ({
		containerRoot: mount.containerRoot,
		hostRoot: mount.hostRoot
	}));
	return mounts.length > 0 ? mounts : void 0;
}
function resolveSkillReadRoots(skillsSnapshot) {
	const roots = /* @__PURE__ */ new Set();
	for (const skill of skillsSnapshot?.resolvedSkills ?? []) {
		const baseDir = typeof skill.baseDir === "string" ? skill.baseDir.trim() : "";
		const filePath = typeof skill.filePath === "string" ? skill.filePath.trim() : "";
		const root = baseDir || (filePath ? path.dirname(filePath) : "");
		if (!root || !path.isAbsolute(root)) continue;
		roots.add(path.resolve(root));
	}
	return roots.size > 0 ? Array.from(roots) : void 0;
}
function guardHostWorkspaceTool(tool, options) {
	return wrapToolWorkspaceRootGuardWithOptions(tool, options.containmentRoot, {
		resolutionCwd: options.codingRoot,
		normalizeGuardedPathParams: true
	});
}
/** Materialize only the core file and shell families selected by the runtime owner. */
function createCoreCodingTools(options) {
	const sandbox = options.sandbox;
	const sandboxRoot = sandbox?.workspaceDir;
	const sandboxFsBridge = sandbox?.fsBridge;
	const allowWorkspaceWrites = sandbox?.workspaceAccess !== "ro";
	if (sandboxRoot && !sandboxFsBridge && (options.includeBaseCodingTools || options.includeShellTools)) throw new Error("Sandbox filesystem bridge is unavailable.");
	const skillReadRoots = sandboxRoot ? void 0 : resolveSkillReadRoots(options.skillsSnapshot);
	const needsReadOnlyWorkspaceSkillMounts = options.includeShellTools || options.includeBaseCodingTools && options.workspaceOnly;
	const readOnlyWorkspaceSkillMounts = sandbox && needsReadOnlyWorkspaceSkillMounts ? resolveReadOnlyWorkspaceSkillMounts({
		workspaceDir: sandbox.workspaceDir,
		agentWorkspaceDir: sandbox.agentWorkspaceDir,
		skillsWorkspaceDir: sandbox.skillsWorkspaceDir,
		workdir: sandbox.containerWorkdir,
		workspaceAccess: sandbox.workspaceAccess
	}) : [];
	const base = [];
	if (options.includeBaseCodingTools) {
		const read = sandboxRoot ? createSandboxedReadTool({
			root: sandboxRoot,
			bridge: sandboxFsBridge,
			modelContextWindowTokens: options.modelContextWindowTokens,
			imageSanitization: options.imageSanitization,
			modelHasVision: options.modelHasVision
		}) : createReadTool(options.codingRoot, {
			maxBytes: resolveAdaptiveReadMaxBytes(options),
			modelBudget: resolveToolResultBudget(options.modelContextWindowTokens),
			modelHasVision: options.modelHasVision
		});
		const guarded = options.workspaceOnly ? wrapToolWorkspaceRootGuardWithOptions(read, sandboxRoot ?? options.containmentRoot, sandboxRoot ? {
			additionalContainerMounts: sandboxReadMounts(sandbox),
			containerWorkdir: sandbox.containerWorkdir,
			bridge: sandboxFsBridge
		} : {
			additionalRoots: skillReadRoots,
			resolutionCwd: options.codingRoot,
			normalizeGuardedPathParams: true
		}) : read;
		const wrapped = sandboxRoot ? guarded : createOpenClawReadTool(guarded, {
			modelContextWindowTokens: options.modelContextWindowTokens,
			imageSanitization: options.imageSanitization,
			cwd: options.codingRoot
		});
		base.push(wrapReadToolWithSkillContent(wrapped, options.skillsSnapshot?.resolvedSkills, {
			modelContextWindowTokens: options.modelContextWindowTokens,
			imageSanitization: options.imageSanitization,
			cwd: options.codingRoot,
			containerWorkdir: sandbox?.containerWorkdir,
			instructionPaths: options.skillInstructionPaths,
			instructionDeliveryCache: options.skillInstructionDeliveryCache
		}));
		if (!options.readOnly && !sandboxRoot) {
			const edit = createHostWorkspaceEditTool(options.codingRoot, {
				containmentRoot: options.containmentRoot,
				workspaceOnly: options.workspaceOnly,
				memoryWriteProvenance: options.memoryWriteProvenance,
				abortSignal: options.abortSignal
			});
			base.push(options.workspaceOnly ? guardHostWorkspaceTool(edit, options) : edit);
			const write = createHostWorkspaceWriteTool(options.codingRoot, {
				containmentRoot: options.containmentRoot,
				workspaceOnly: options.workspaceOnly,
				memoryWriteProvenance: options.memoryWriteProvenance,
				abortSignal: options.abortSignal
			});
			base.push(options.workspaceOnly ? guardHostWorkspaceTool(write, options) : write);
		}
	}
	if (options.includeBaseCodingTools && !options.readOnly && sandboxRoot && allowWorkspaceWrites) {
		const toolOptions = {
			root: sandboxRoot,
			bridge: sandboxFsBridge,
			memoryWriteProvenance: options.memoryWriteProvenance,
			abortSignal: options.abortSignal
		};
		const edit = createSandboxedEditTool(toolOptions);
		const write = createSandboxedWriteTool(toolOptions);
		base.push(options.workspaceOnly ? wrapToolWorkspaceRootGuardWithOptions(edit, sandboxRoot, {
			containerWorkdir: sandbox.containerWorkdir,
			bridge: sandboxFsBridge
		}) : edit, options.workspaceOnly ? wrapToolWorkspaceRootGuardWithOptions(write, sandboxRoot, {
			containerWorkdir: sandbox.containerWorkdir,
			bridge: sandboxFsBridge
		}) : write);
	}
	options.recordToolPrepStage?.("base-coding-tools");
	const shell = [];
	if (options.includeShellTools) {
		if (options.applyPatchEnabled && (!sandboxRoot || allowWorkspaceWrites)) shell.push(createApplyPatchTool({
			cwd: options.codingRoot,
			root: options.containmentRoot,
			sandbox: sandboxRoot && allowWorkspaceWrites ? {
				root: sandboxRoot,
				bridge: sandboxFsBridge
			} : void 0,
			workspaceOnly: options.applyPatchWorkspaceOnly,
			memoryWriteProvenance: options.memoryWriteProvenance,
			abortSignal: options.abortSignal
		}));
		shell.push(createLazyExecTool({
			...options.execDefaults,
			...sandbox?.required ? { sandboxRequired: true } : {},
			cwd: options.codingRoot,
			sandbox: sandbox ? {
				containerName: sandbox.containerName,
				workspaceDir: sandbox.workspaceDir,
				containerWorkdir: sandbox.containerWorkdir,
				workdirValidation: sandbox.backend?.workdirValidation,
				validateWorkdir: sandbox.backend?.validateWorkdir?.bind(sandbox.backend),
				discardPreparedWorkdir: sandbox.backend?.discardPreparedWorkdir?.bind(sandbox.backend),
				workdirRoots: sandbox.backend?.workdirRoots,
				readOnlyWorkspaceSkillMounts,
				env: sandbox.backend?.env ?? sandbox.docker.env,
				buildExecSpec: sandbox.backend?.buildExecSpec.bind(sandbox.backend),
				finalizeExec: sandbox.backend?.finalizeExec?.bind(sandbox.backend)
			} : void 0
		}), createLazyProcessTool(options.processDefaults));
	}
	options.recordToolPrepStage?.("shell-tools");
	base.forEach((tool) => bindAgentToolActionDescriptor(tool, {
		family: "data",
		operation: "filesystem"
	}));
	shell.forEach((tool) => bindAgentToolActionDescriptor(tool, {
		family: "tool",
		operation: "process"
	}));
	return [...base, ...shell];
}
//#endregion
export { isApplyPatchAllowedForModel as n, finalizeAgentTools as r, createCoreCodingTools as t };
