import { l as toErrorObject } from "./error-coercion-CwcmpTBO.js";
import { i as asOptionalObjectRecord } from "./record-coerce-DItp3I4t.js";
import { r as isMissingPathError, t as hasErrnoCode } from "./errno-CkbDOfLk.js";
import { l as redactSecrets } from "./redact-Df68iObN.js";
import { a as canonicalPathFromExistingAncestor, t as FsSafeError, w as root } from "./fs-safe-Cdu9fYG_.js";
import { i as clampNumber } from "./utils-D3A1hGii.js";
import "./errors-u9zSVTak.js";
import { r as decodeWindowsTextFileBuffer } from "./windows-encoding-DvBW57G0.js";
import { c as resolveAgentConfig } from "./agent-scope-config-CUiGBd59.js";
import "./agent-scope-CSlN0kZb.js";
import { i as logWarn } from "./logger-dgyRJ-bX.js";
import { $ as ReadToolContinuationSchema, N as createBoundedReadTextPage, P as formatReadContinuationNotice, V as createEditTool, j as createReadTool, k as createWriteTool } from "./sessions-CHgQo4vL.js";
import { n as detectMime } from "./mime-BxTGWg2e.js";
import { t as isWindowsDrivePath } from "./archive-path-B4B2gRTa.js";
import { o as trySafeFileURLToPath, r as hasEncodedFileUrlSeparator } from "./local-file-access-B1HKoQAc.js";
import { n as assertSandboxPath } from "./sandbox-paths-CjFMgmon.js";
import { i as toRelativeWorkspacePath } from "./path-policy-De3jml1i.js";
import { a as resolveToCwd, t as expandOsHomePrefix } from "./path-utils-ZSJUke_V.js";
import { i as normalizeMediaReferenceSource, l as resolveMediaReferenceSandboxPath, r as classifyMediaReferenceSource } from "./media-reference-D2cwQT4h.js";
import { a as resolveToolResultBudget, s as toolResultFitsBudget } from "./tool-result-limits-DdMvF_Ec.js";
import { r as sanitizeToolResultImages } from "./tool-images-Bt1JUt6A.js";
import { a as assertRequiredParams, i as REQUIRED_PARAM_GROUPS, l as wrapToolParamValidation, o as normalizeFileToolPathParam, s as normalizeFileToolPathParamsFromKeys } from "./agent-tools.before-tool-call.decision-is7VdQQC.js";
import { r as resolveSandboxFileMutationQueueKey } from "./file-mutation-identity-dqR8BH1r.js";
import { t as sniffMimeFromBase64 } from "./sniff-mime-from-base64-I0AzClUi.js";
import { a as recordMemoryArtifactWriteProvenance, r as normalizeMemoryArtifactRelativePath, t as clearMemoryArtifactProvenance } from "./memory-artifact-provenance-BHfltDXk.js";
import { URL } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { Value } from "typebox/value";
//#region src/agents/host-file-write.ts
function resolveHostPath$1(filePath) {
	return path.resolve(expandOsHomePrefix(filePath));
}
async function writeHostFileRange(handle, payload, offset, length, position) {
	let written = 0;
	while (written < length) {
		const { bytesWritten } = await handle.write(payload, offset + written, length - written, position + written);
		if (bytesWritten <= 0) throw new Error(`host file write made no progress at byte ${position + written}`);
		written += bytesWritten;
	}
}
async function readHostFilePrefix(handle, length) {
	const prefix = Buffer.alloc(length);
	let read = 0;
	while (read < length) {
		const { bytesRead } = await handle.read(prefix, read, length - read, read);
		if (bytesRead <= 0) throw new Error(`host file read made no progress at byte ${read}`);
		read += bytesRead;
	}
	return prefix;
}
async function overwriteHostFileInPlace(handle, payload, currentSize, abortSignal) {
	const prefixLength = Math.min(payload.length, currentSize);
	const originalPrefix = await readHostFilePrefix(handle, prefixLength);
	abortSignal?.throwIfAborted();
	let prefixStarted = false;
	try {
		if (payload.length > currentSize) await writeHostFileRange(handle, payload, currentSize, payload.length - currentSize, currentSize);
		prefixStarted = true;
		await writeHostFileRange(handle, payload, 0, prefixLength, 0);
		if (payload.length < currentSize) await handle.truncate(payload.length);
	} catch (error) {
		if (prefixStarted) await writeHostFileRange(handle, originalPrefix, 0, prefixLength, 0).catch(() => void 0);
		await handle.truncate(currentSize).catch(() => void 0);
		throw error;
	}
}
async function openHostFileForUpdate(resolved) {
	try {
		return (await fs.stat(resolved)).isFile() ? await fs.open(resolved, "r+") : void 0;
	} catch (error) {
		if (hasErrnoCode(error, "ENOENT")) return;
		throw error;
	}
}
async function writeHostFile(absolutePath, content, abortSignal) {
	const resolved = resolveHostPath$1(absolutePath);
	abortSignal?.throwIfAborted();
	await fs.mkdir(path.dirname(resolved), { recursive: true });
	const handle = await openHostFileForUpdate(resolved);
	if (!handle) {
		abortSignal?.throwIfAborted();
		await fs.writeFile(resolved, content, "utf-8");
		return;
	}
	try {
		const stat = await handle.stat();
		await overwriteHostFileInPlace(handle, Buffer.from(content, "utf-8"), stat.size, abortSignal);
	} finally {
		await handle.close().catch(() => void 0);
	}
}
//#endregion
//#region src/agents/memory-write-provenance.ts
function withMemoryWriteProvenance(operations, observer) {
	if (!observer) return operations;
	const remove = operations.remove;
	return {
		...operations,
		writeFile: async (absolutePath, content) => {
			if (!await observer.classifies(absolutePath)) {
				await operations.writeFile(absolutePath, content);
				return;
			}
			const contentBefore = await operations.readFile(absolutePath).then((value) => Buffer.isBuffer(value) ? value.toString("utf8") : value).catch((error) => {
				if (!isMissingPathError(error)) throw error;
				return "";
			});
			await observer.write({
				absolutePath,
				contentBefore,
				contentAfter: content,
				commit: () => operations.writeFile(absolutePath, content)
			});
		},
		...remove ? { remove: async (absolutePath) => {
			const contentBefore = await observer.classifies(absolutePath) ? await operations.readFile(absolutePath).then((value) => Buffer.isBuffer(value) ? value.toString("utf8") : value).catch((error) => {
				if (!isMissingPathError(error)) throw error;
				return "";
			}) : "";
			await remove(absolutePath);
			await observer.clearAfterDelete(absolutePath, contentBefore);
		} } : {}
	};
}
function resolveMemoryRelativePath(root, absolutePath) {
	const relativePath = path.relative(root, absolutePath);
	if (!relativePath || path.isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${path.sep}`)) return;
	return normalizeMemoryArtifactRelativePath(relativePath.replaceAll(path.sep, "/"));
}
function createMemoryWriteProvenanceObserver(params) {
	const now = params.now ?? Date.now;
	const resolvePath = params.resolvePath ?? canonicalPathFromExistingAncestor;
	const resolveRelativePath = async (absolutePath) => {
		const [root, target] = await Promise.all([resolvePath(params.mutationRoot), resolvePath(absolutePath)]);
		return resolveMemoryRelativePath(root, target);
	};
	return {
		classifies: async (absolutePath) => await resolveRelativePath(absolutePath) !== void 0,
		write: async ({ absolutePath, contentBefore, contentAfter, commit }) => {
			const relativePath = await resolveRelativePath(absolutePath);
			if (!relativePath) {
				await commit();
				return;
			}
			const rollback = await recordMemoryArtifactWriteProvenance({
				workspaceDir: params.workspaceDir,
				relativePath,
				contentBefore,
				contentAfter,
				originClass: params.resolveOriginClass(),
				observedAt: now(),
				sessionId: params.sessionId,
				sessionKey: params.sessionKey
			});
			try {
				await commit();
			} catch (error) {
				try {
					await rollback?.();
				} catch (rollbackError) {
					throw new Error(`File write failed and memory provenance rollback also failed: ${String(error)}`, { cause: rollbackError });
				}
				throw error;
			}
		},
		clearAfterDelete: async (absolutePath, contentBefore) => {
			const relativePath = await resolveRelativePath(absolutePath);
			if (!relativePath) return;
			try {
				await clearMemoryArtifactProvenance({
					workspaceDir: params.workspaceDir,
					relativePath,
					contentBefore
				});
			} catch (error) {
				logWarn(`memory provenance cleanup failed for ${relativePath}: ${String(error)}`);
			}
		}
	};
}
//#endregion
//#region src/agents/agent-tools.read.ts
const DEFAULT_READ_PAGE_MAX_BYTES = 32768;
const MAX_ADAPTIVE_READ_MAX_BYTES = 131072;
const ADAPTIVE_READ_CONTEXT_SHARE = .1;
const CHARS_PER_TOKEN_ESTIMATE = 4;
const MAX_ADAPTIVE_READ_PAGES = 4;
const ENV_FILE_PATH_RE = /(?:^|[/\\])(?:\.env(?:\.[^/\\]+)?|[^/\\]+\.env)$/i;
function createSkillInstructionDeliveryCache() {
	return /* @__PURE__ */ new Map();
}
/** Erase a schema-specific session tool only after its input passes that owned schema. */
function eraseSessionFileTool(tool) {
	return {
		...tool,
		execute: async (toolCallId, params, signal, onUpdate) => {
			if (!Value.Check(tool.parameters, params)) throw new Error(`Invalid parameters for ${tool.name}`);
			const typedParams = params;
			return await tool.execute(toolCallId, typedParams, signal, onUpdate ? (update) => onUpdate(update) : void 0);
		}
	};
}
const READ_CONTINUATION_NOTICE_RE = /\n\n\[(?:Showing (?:lines|part of line) [^\]]*|Read output capped [^\]]*|\d+ more lines? in file\. [^\]]*)\]\s*$/;
function resolveAdaptiveReadMaxBytes(options) {
	const contextWindowTokens = options?.modelContextWindowTokens;
	if (typeof contextWindowTokens !== "number" || !Number.isFinite(contextWindowTokens) || contextWindowTokens <= 0) return DEFAULT_READ_PAGE_MAX_BYTES;
	const fromContext = Math.floor(contextWindowTokens * CHARS_PER_TOKEN_ESTIMATE * ADAPTIVE_READ_CONTEXT_SHARE);
	return clampNumber(fromContext, DEFAULT_READ_PAGE_MAX_BYTES, MAX_ADAPTIVE_READ_MAX_BYTES);
}
function malformedXmlArgValuePathError(key) {
	return /* @__PURE__ */ new Error(`Malformed path parameter: ${key}. Supply correct parameters before retrying.`);
}
function getToolResultText(result) {
	const textBlocks = (Array.isArray(result.content) ? result.content : []).map((block) => {
		if (block && typeof block === "object" && block.type === "text" && typeof block.text === "string") return block.text;
	}).filter((value) => typeof value === "string");
	if (textBlocks.length === 0) return;
	return textBlocks.join("\n");
}
function withToolResultText(result, text) {
	const content = Array.isArray(result.content) ? result.content : [];
	let replaced = false;
	const nextContent = content.map((block) => {
		if (!replaced && block && typeof block === "object" && block.type === "text") {
			replaced = true;
			return Object.assign({}, block, { text });
		}
		return block;
	});
	if (replaced) return {
		...result,
		content: nextContent
	};
	const textBlock = {
		type: "text",
		text
	};
	return {
		...result,
		content: [textBlock]
	};
}
function extractReadTruncationDetails(result) {
	const details = result.details;
	if (!details || typeof details !== "object") return null;
	const truncation = details.truncation;
	if (!truncation || typeof truncation !== "object") return null;
	const record = truncation;
	if (record.truncated !== true) return null;
	const outputLinesRaw = record.outputLines;
	const outputLines = typeof outputLinesRaw === "number" && Number.isFinite(outputLinesRaw) ? Math.max(0, Math.floor(outputLinesRaw)) : 0;
	const totalLinesRaw = record.totalLines;
	return {
		truncated: true,
		outputLines,
		totalLines: typeof totalLinesRaw === "number" && Number.isFinite(totalLinesRaw) ? Math.max(0, Math.floor(totalLinesRaw)) : 0,
		continuation: extractReadContinuation(details)
	};
}
function extractReadContinuation(details) {
	const candidate = "continuation" in details ? details.continuation : void 0;
	return Value.Check(ReadToolContinuationSchema, candidate) ? candidate : void 0;
}
function withReadContinuation(result, text, continuation, outputBytes, initialOffset, truncation) {
	const details = result.details && typeof result.details === "object" ? result.details : {};
	const authoritative = ("truncation" in details ? details.truncation : void 0) ?? truncation;
	if (!authoritative || typeof authoritative !== "object") return withToolResultText(result, text);
	return {
		...withToolResultText(result, text),
		details: {
			kind: "truncated",
			content: text,
			truncation: {
				...authoritative,
				outputLines: continuation.offset - initialOffset,
				outputBytes,
				lastLinePartial: continuation.kind === "cursor"
			},
			continuation
		}
	};
}
function stripReadContinuationNotice(text) {
	return text.replace(READ_CONTINUATION_NOTICE_RE, "");
}
function stripReadTruncationContentDetails(result) {
	const details = result.details;
	if (!details || typeof details !== "object") return result;
	const detailsRecord = details;
	const truncationRaw = detailsRecord.truncation;
	if (!truncationRaw || typeof truncationRaw !== "object") return result;
	const truncation = truncationRaw;
	if (!Object.hasOwn(truncation, "content")) return result;
	const { content: _content, ...restTruncation } = truncation;
	return {
		...result,
		details: {
			...detailsRecord,
			truncation: restTruncation
		}
	};
}
async function executeReadWithAdaptivePaging(params) {
	const userLimit = params.args.limit;
	const hasExplicitLimit = typeof userLimit === "number" && Number.isFinite(userLimit) && userLimit > 0;
	const offsetRaw = params.args.offset;
	const initialOffset = typeof offsetRaw === "number" && Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 1;
	const initialLimit = hasExplicitLimit ? { limit: Math.max(1, Math.floor(userLimit)) } : {};
	let next = typeof params.args.cursor === "number" ? {
		kind: "cursor",
		offset: initialOffset,
		cursor: params.args.cursor,
		...initialLimit
	} : {
		kind: "line",
		offset: initialOffset,
		...initialLimit
	};
	let firstResult;
	let aggregatedText = "";
	let aggregatedBytes = 0;
	let previousNotice = "";
	for (let page = 0; page < MAX_ADAPTIVE_READ_PAGES; page += 1) {
		const pageArgs = {
			...params.args,
			offset: next.offset,
			...next.kind === "cursor" ? { cursor: next.cursor } : {},
			...next.limit === void 0 ? {} : { limit: next.limit }
		};
		if (next.kind === "line") delete pageArgs.cursor;
		const pageResult = await params.base.execute(params.toolCallId, pageArgs, params.signal);
		firstResult ??= pageResult;
		const rawText = getToolResultText(pageResult);
		if (typeof rawText !== "string") return pageResult;
		const truncation = extractReadTruncationDetails(pageResult);
		const pageEndLine = next.offset - 1 + (truncation?.outputLines ?? 0);
		const reachedEof = Boolean(truncation?.truncated) && pageEndLine >= (truncation?.totalLines ?? 0);
		const pageContinuation = truncation?.continuation;
		const pageText = pageContinuation || reachedEof ? stripReadContinuationNotice(rawText) : rawText;
		const delimiter = aggregatedText && pageText && next.kind === "line" ? "\n" : "";
		const candidateBytes = aggregatedBytes + delimiter.length + Buffer.byteLength(pageText, "utf8");
		const continuationNotice = pageContinuation ? formatReadContinuationNotice(pageContinuation, params.maxBytes) : "";
		if (candidateBytes + Buffer.byteLength(continuationNotice, "utf8") > params.maxBytes || !toolResultFitsBudget(`${aggregatedText}${delimiter}${pageText}${continuationNotice}`, params.modelBudget)) {
			if (aggregatedText) return withReadContinuation(firstResult, `${aggregatedText}${previousNotice}`, next, aggregatedBytes, initialOffset);
			const lineCount = pageText.split("\n").length;
			const bounded = createBoundedReadTextPage({
				content: pageText,
				startLine: next.offset,
				endLine: next.offset + lineCount - 1,
				totalLines: truncation?.totalLines ?? next.offset + lineCount - 1,
				...next.kind === "cursor" ? { cursor: next.cursor } : {},
				limit: next.limit,
				maxBytes: params.maxBytes,
				modelBudget: params.modelBudget,
				adaptive: true
			});
			if (bounded.kind === "text") return withToolResultText(pageResult, bounded.content);
			return withReadContinuation(firstResult, bounded.content, bounded.continuation, bounded.truncation.outputBytes, initialOffset, bounded.truncation);
		}
		aggregatedText += `${delimiter}${pageText}`;
		aggregatedBytes = candidateBytes;
		if (!pageContinuation || reachedEof) return withToolResultText(pageResult, aggregatedText);
		if (hasExplicitLimit || page === 3) return withReadContinuation(firstResult, `${aggregatedText}${continuationNotice}`, pageContinuation, aggregatedBytes, initialOffset);
		previousNotice = continuationNotice;
		next = pageContinuation;
	}
	return firstResult;
}
function rewriteReadImageHeader(text, mimeType) {
	if (text.startsWith("Read image file [") && text.endsWith("]")) return `Read image file [${mimeType}]`;
	return text;
}
async function normalizeReadImageResult(result, filePath) {
	const content = Array.isArray(result.content) ? result.content : [];
	const image = content.find((b) => Boolean(b) && typeof b === "object" && b.type === "image" && typeof b.data === "string" && typeof b.mimeType === "string");
	if (!image) return result;
	if (!image.data.trim()) throw new Error(`read: image payload is empty (${filePath})`);
	const sniffed = await sniffMimeFromBase64(image.data);
	if (!sniffed) return result;
	if (!sniffed.startsWith("image/")) throw new Error(`read: file looks like ${sniffed} but was treated as ${image.mimeType} (${filePath})`);
	if (sniffed === image.mimeType) return result;
	const nextContent = content.map((block) => {
		if (block && typeof block === "object" && block.type === "image") return Object.assign({}, block, { mimeType: sniffed });
		if (block && typeof block === "object" && block.type === "text" && typeof block.text === "string") {
			const b = block;
			return Object.assign({}, b, { text: rewriteReadImageHeader(b.text, sniffed) });
		}
		return block;
	});
	return {
		...result,
		content: nextContent
	};
}
function normalizeReadResultDetails(result) {
	const currentDetails = result.details && typeof result.details === "object" ? result.details : void 0;
	if (currentDetails?.status === "not_found" && typeof currentDetails.path === "string" && currentDetails.optional === true) return {
		...result,
		details: {
			kind: "not_found",
			status: "not_found",
			path: currentDetails.path,
			optional: true
		}
	};
	const content = Array.isArray(result.content) ? result.content : [];
	const text = getToolResultText(result) ?? "";
	const image = content.find((block) => Boolean(block) && typeof block === "object" && block.type === "image" && typeof block.mimeType === "string");
	if (image) return {
		...result,
		details: {
			kind: "image",
			content: text,
			mimeType: image.mimeType
		}
	};
	const truncation = currentDetails?.truncation;
	if (currentDetails && truncation && typeof truncation === "object") {
		const continuation = extractReadContinuation(currentDetails);
		if (!continuation) return {
			...result,
			details: {
				kind: "text",
				content: text
			}
		};
		return {
			...result,
			details: {
				kind: "truncated",
				content: text,
				truncation,
				continuation
			}
		};
	}
	return {
		...result,
		details: {
			kind: "text",
			content: text
		}
	};
}
function mapContainerPathToWorkspaceRoot(params) {
	return mapContainerPathToRoot({
		filePath: params.filePath,
		root: params.root,
		containerRoot: params.containerWorkdir
	}).filePath;
}
function resolveContainerPathCandidate(filePath) {
	let candidate = filePath.startsWith("@") ? filePath.slice(1) : filePath;
	if (/^file:\/\//i.test(candidate)) {
		const localFilePath = trySafeFileURLToPath(candidate);
		if (localFilePath) candidate = localFilePath;
		else {
			let parsed;
			try {
				parsed = new URL(candidate);
			} catch {
				return filePath;
			}
			if (parsed.protocol !== "file:") return filePath;
			const host = parsed.hostname.trim().toLowerCase();
			if (host && host !== "localhost") return filePath;
			if (hasEncodedFileUrlSeparator(parsed.pathname)) return filePath;
			let normalizedPathname;
			try {
				normalizedPathname = decodeURIComponent(parsed.pathname).replace(/\\/g, "/");
			} catch {
				return filePath;
			}
			candidate = normalizedPathname;
		}
	}
	return candidate;
}
function mapContainerPathToRoot(params) {
	const containerRoot = params.containerRoot?.trim();
	if (!containerRoot) return {
		filePath: params.filePath,
		matched: false
	};
	const normalizedRoot = containerRoot.replace(/\\/g, "/").replace(/\/+$/, "");
	if (!normalizedRoot.startsWith("/") || !normalizedRoot) return {
		filePath: params.filePath,
		matched: false
	};
	const candidate = resolveContainerPathCandidate(params.filePath);
	if (candidate === null) return {
		filePath: params.filePath,
		matched: false
	};
	const normalizedCandidate = path.posix.normalize(candidate.replace(/\\/g, "/"));
	if (normalizedCandidate === normalizedRoot) return {
		filePath: path.resolve(params.root),
		matched: true
	};
	const prefix = `${normalizedRoot}/`;
	if (!normalizedCandidate.startsWith(prefix)) return {
		filePath: candidate,
		matched: false
	};
	const relative = normalizedCandidate.slice(prefix.length);
	if (!relative) return {
		filePath: path.resolve(params.root),
		matched: true
	};
	return {
		filePath: path.resolve(params.root, ...relative.split("/").filter(Boolean)),
		matched: true
	};
}
/** Resolve a model-supplied file path against the host workspace root. */
function resolveToolPathAgainstWorkspaceRoot(params) {
	const mapped = mapContainerPathToWorkspaceRoot(params);
	const candidate = mapped.startsWith("@") ? mapped.slice(1) : mapped;
	if (isWindowsDrivePath(candidate)) return path.win32.normalize(candidate);
	if (path.isAbsolute(candidate)) return path.resolve(candidate);
	return path.resolve(params.root, candidate || ".");
}
async function readOptionalUtf8File(params) {
	try {
		if (params.sandbox) {
			if (!await params.sandbox.bridge.stat({
				filePath: params.relativePath,
				cwd: params.sandbox.root,
				signal: params.signal
			})) return "";
			return (await params.sandbox.bridge.readFile({
				filePath: params.relativePath,
				cwd: params.sandbox.root,
				signal: params.signal
			})).toString("utf-8");
		}
		return await fs.readFile(params.absolutePath, "utf-8");
	} catch (error) {
		if (error?.code === "ENOENT") return "";
		throw error;
	}
}
async function appendMemoryFlushContent(params) {
	if (!params.sandbox) {
		await (await root(params.root)).append(params.relativePath, params.content, {
			mkdir: true,
			prependNewlineIfNeeded: true
		});
		return;
	}
	const existing = await readOptionalUtf8File({
		absolutePath: params.absolutePath,
		relativePath: params.relativePath,
		sandbox: params.sandbox,
		signal: params.signal
	});
	const next = `${existing}${existing.length > 0 && !existing.endsWith("\n") && !params.content.startsWith("\n") ? "\n" : ""}${params.content}`;
	if (params.sandbox) {
		const parent = path.posix.dirname(params.relativePath);
		if (parent && parent !== ".") await params.sandbox.bridge.mkdirp({
			filePath: parent,
			cwd: params.sandbox.root,
			signal: params.signal
		});
		await params.sandbox.bridge.writeFile({
			filePath: params.relativePath,
			cwd: params.sandbox.root,
			data: next,
			mkdir: true,
			signal: params.signal
		});
		return;
	}
	await fs.mkdir(path.dirname(params.absolutePath), { recursive: true });
	await fs.writeFile(params.absolutePath, next, "utf-8");
}
/** Restrict a write tool to appending memory-flush content to one path. */
function wrapToolMemoryFlushAppendOnlyWrite(tool, options) {
	const allowedAbsolutePath = path.resolve(options.root, options.relativePath);
	return {
		...tool,
		description: `${tool.description} During memory flush, this tool may only append to ${options.relativePath}.`,
		execute: async (toolCallId, args, signal, onUpdate) => {
			const record = asOptionalObjectRecord(args);
			const normalizedRecord = record ? await normalizeFileToolPathParamsFromKeys(record, ["path"], options.root, options.sandbox?.bridge) : void 0;
			assertRequiredParams(normalizedRecord, REQUIRED_PARAM_GROUPS.write, tool.name);
			const filePath = typeof normalizedRecord?.path === "string" && normalizedRecord.path.trim() ? normalizedRecord.path : void 0;
			const content = typeof record?.content === "string" ? record.content : void 0;
			if (!filePath || content === void 0) return tool.execute(toolCallId, args, signal, onUpdate);
			const resolvedPath = resolveToolPathAgainstWorkspaceRoot({
				filePath,
				root: options.root,
				containerWorkdir: options.containerWorkdir
			});
			if (filePath.startsWith("@") || resolvedPath !== allowedAbsolutePath) throw new Error(`Memory flush writes are restricted to ${options.relativePath}; use that path only.`);
			const contentBefore = await readOptionalUtf8File({
				absolutePath: allowedAbsolutePath,
				relativePath: options.relativePath,
				sandbox: options.sandbox,
				signal
			});
			const separator = contentBefore.length > 0 && !contentBefore.endsWith("\n") && !content.startsWith("\n") ? "\n" : "";
			const commit = () => appendMemoryFlushContent({
				absolutePath: allowedAbsolutePath,
				root: options.root,
				relativePath: options.relativePath,
				content,
				sandbox: options.sandbox,
				signal
			});
			const memoryWriteProvenance = options.memoryWriteProvenance;
			if (memoryWriteProvenance && await memoryWriteProvenance.classifies(allowedAbsolutePath)) await memoryWriteProvenance.write({
				absolutePath: allowedAbsolutePath,
				contentBefore,
				contentAfter: `${contentBefore}${separator}${content}`,
				commit
			});
			else await commit();
			return {
				content: [{
					type: "text",
					text: `Appended content to ${options.relativePath}.`
				}],
				details: { changed: true }
			};
		}
	};
}
function isSandboxRootEscapeError(error) {
	return error instanceof Error && /^Path escapes sandbox root \(/i.test(error.message);
}
function withWorkspaceSafeTempHint(error) {
	if (!isSandboxRootEscapeError(error)) return error;
	const message = error.message.includes(".openclaw/tmp/") ? error.message : `${error.message}. Use a relative path under \`.openclaw/tmp/\` inside the workspace for scratch/temp/meta files that file tools need to read or write later.`;
	return new Error(message, { cause: error });
}
async function assertSandboxPathWithinAnyRoot(params) {
	let firstRootEscapeError;
	const seen = /* @__PURE__ */ new Set();
	for (const [index, candidateRoot] of params.roots.entries()) {
		const trimmedRoot = candidateRoot.trim();
		if (!trimmedRoot) continue;
		const root = path.resolve(trimmedRoot);
		if (seen.has(root)) continue;
		seen.add(root);
		try {
			return await assertSandboxPath({
				filePath: params.filePath,
				cwd: index === 0 ? params.cwd ?? root : root,
				root
			});
		} catch (error) {
			if (!isSandboxRootEscapeError(error)) throw error;
			firstRootEscapeError ??= error;
		}
	}
	throw toErrorObject(firstRootEscapeError ?? /* @__PURE__ */ new Error("Path guard has no configured roots."), "Non-Error thrown");
}
/** Wrap a file tool with workspace guards and optional container path mapping. */
function wrapToolWorkspaceRootGuardWithOptions(tool, root, options) {
	const pathParamKeys = options?.pathParamKeys && options.pathParamKeys.length > 0 ? options.pathParamKeys : ["path"];
	return {
		...tool,
		execute: async (toolCallId, args, signal, onUpdate) => {
			const record = asOptionalObjectRecord(args);
			let normalizedRecord;
			for (const key of pathParamKeys) {
				const rawFilePath = record?.[key];
				if (typeof rawFilePath !== "string" || !rawFilePath.trim()) continue;
				const filePath = await normalizeFileToolPathParam(rawFilePath, options?.resolutionCwd ?? root, options?.bridge);
				if (!filePath.trim()) throw malformedXmlArgValuePathError(key);
				if (filePath !== rawFilePath && record) {
					normalizedRecord ??= { ...record };
					normalizedRecord[key] = filePath;
				}
				let guardedRoot = root;
				let workspaceMapping;
				let sandboxPath = filePath;
				for (const mount of [...options?.additionalContainerMounts ?? []].toSorted((a, b) => b.containerRoot.length - a.containerRoot.length)) {
					const mountMapping = mapContainerPathToRoot({
						filePath,
						root: mount.hostRoot,
						containerRoot: mount.containerRoot
					});
					if (mountMapping.matched) {
						guardedRoot = path.resolve(mount.hostRoot);
						sandboxPath = mountMapping.filePath;
						break;
					}
				}
				if (guardedRoot === root) {
					workspaceMapping = mapContainerPathToRoot({
						filePath,
						root,
						containerRoot: options?.containerWorkdir
					});
					sandboxPath = workspaceMapping.filePath;
				}
				const additionalRoots = guardedRoot === root && !workspaceMapping?.matched ? options?.additionalRoots ?? [] : [];
				let sandboxResult;
				try {
					sandboxResult = await assertSandboxPathWithinAnyRoot({
						cwd: guardedRoot === root && !workspaceMapping?.matched ? options?.resolutionCwd : void 0,
						filePath: sandboxPath,
						roots: [guardedRoot, ...additionalRoots]
					});
				} catch (error) {
					throw withWorkspaceSafeTempHint(error);
				}
				if (options?.normalizeGuardedPathParams && record) {
					normalizedRecord ??= { ...record };
					normalizedRecord[key] = sandboxResult.resolved;
				}
			}
			return tool.execute(toolCallId, normalizedRecord ?? args, signal, onUpdate);
		}
	};
}
/** Create a sandbox-backed read tool with OpenClaw result normalization. */
function createSandboxedReadTool(params) {
	return createOpenClawReadTool(eraseSessionFileTool(createReadTool(params.root, {
		operations: createSandboxReadOperations(params),
		maxBytes: resolveAdaptiveReadMaxBytes(params),
		modelBudget: resolveToolResultBudget(params.modelContextWindowTokens),
		modelHasVision: params.modelHasVision
	})), {
		modelContextWindowTokens: params.modelContextWindowTokens,
		imageSanitization: params.imageSanitization,
		cwd: params.root,
		bridge: params.bridge
	});
}
/** Create a sandbox-backed write tool with required-parameter validation. */
function createSandboxedWriteTool(params) {
	const base = eraseSessionFileTool(createWriteTool(params.root, { operations: createSandboxWriteOperations(params) }));
	return wrapToolParamValidation(base, REQUIRED_PARAM_GROUPS.write, params.root, params.bridge);
}
/** Create a sandbox-backed edit tool with required-parameter validation. */
function createSandboxedEditTool(params) {
	const base = eraseSessionFileTool(createEditTool(params.root, { operations: createSandboxEditOperations(params) }));
	return wrapToolParamValidation(base, REQUIRED_PARAM_GROUPS.edit, params.root, params.bridge);
}
/** Create a host workspace write tool using guarded filesystem operations. */
function createHostWorkspaceWriteTool(root, options) {
	const base = eraseSessionFileTool(createWriteTool(root, { operations: createHostWriteOperations(options?.containmentRoot ?? root, options) }));
	return wrapToolParamValidation(base, REQUIRED_PARAM_GROUPS.write, root);
}
/** Create a host workspace edit tool using guarded filesystem operations. */
function createHostWorkspaceEditTool(root, options) {
	const base = eraseSessionFileTool(createEditTool(root, { operations: createHostEditOperations(options?.containmentRoot ?? root, options) }));
	return wrapToolParamValidation(base, REQUIRED_PARAM_GROUPS.edit, root);
}
/** Wrap the base read tool with OpenClaw paging, MIME, and image handling. */
function createOpenClawReadTool(base, options) {
	const modelBudget = resolveToolResultBudget(options?.modelContextWindowTokens);
	return {
		...base,
		execute: async (toolCallId, params, signal) => {
			const record = asOptionalObjectRecord(params);
			const normalizedRecord = record ? await normalizeFileToolPathParamsFromKeys(record, ["path"], options?.cwd, options?.bridge) : void 0;
			assertRequiredParams(normalizedRecord, REQUIRED_PARAM_GROUPS.read, base.name);
			const filePath = typeof normalizedRecord?.path === "string" ? normalizedRecord.path : "<unknown>";
			const dailyMemoryPath = process.platform === "win32" ? filePath.replace(/\\/g, "/") : filePath;
			const normalizedResult = await normalizeReadImageResult(stripReadTruncationContentDetails(await executeReadWithAdaptivePaging({
				base,
				toolCallId,
				args: normalizedRecord?.optional === void 0 && /^(?:\.\/)*memory\/\d{4}-\d{2}-\d{2}\.md$/u.test(dailyMemoryPath) ? {
					...normalizedRecord,
					optional: true
				} : normalizedRecord ?? {},
				signal,
				maxBytes: resolveAdaptiveReadMaxBytes(options),
				modelBudget
			})), filePath);
			const sanitizedResult = await sanitizeToolResultImages(normalizedResult, `read:${filePath}`, options?.imageSanitization);
			return normalizeReadResultDetails(ENV_FILE_PATH_RE.test(filePath) ? {
				...sanitizedResult,
				content: redactSecrets(sanitizedResult.content)
			} : sanitizedResult);
		}
	};
}
/** Serve exact non-filesystem skill locators before workspace path guards run. */
function wrapReadToolWithSkillContent(tool, skills, options) {
	const cwd = options?.cwd ?? process.cwd();
	const resolveInstructionPath = (filePath) => {
		if (filePath.startsWith("node://")) return filePath;
		const mapped = mapContainerPathToWorkspaceRoot({
			filePath,
			root: cwd,
			containerWorkdir: options?.containerWorkdir
		});
		return resolveToCwd(mapped, cwd);
	};
	const instructionContent = new Map((options?.instructionPaths ?? []).map((filePath) => [resolveInstructionPath(filePath), void 0]));
	for (const skill of skills ?? []) instructionContent.set(resolveInstructionPath(skill.filePath), skill.filePath.startsWith("node://") ? skill.readContent : void 0);
	if (instructionContent.size === 0) return tool;
	const instructionDeliveryCache = options?.instructionDeliveryCache;
	const alreadyDeliveredResult = () => {
		const text = "Skill instructions were already served whole earlier in the current model context. Reuse that content; the full document will be served again if compaction removes it.";
		return {
			content: [{
				type: "text",
				text
			}],
			details: {
				kind: "text",
				content: text
			}
		};
	};
	const readContent = (filePath) => {
		const content = instructionContent.get(filePath);
		if (content === void 0) throw Object.assign(/* @__PURE__ */ new Error(`Virtual skill file not found: ${filePath}`), { code: "ENOENT" });
		return content;
	};
	let virtualRead;
	return {
		...tool,
		execute: async (toolCallId, args, signal, onUpdate) => {
			const record = asOptionalObjectRecord(args);
			const rawPath = record?.path;
			const normalizedPath = typeof rawPath === "string" ? normalizeFileToolPathParam(rawPath) : void 0;
			const instructionPath = normalizedPath ? resolveInstructionPath(normalizedPath) : void 0;
			if (!normalizedPath || !instructionPath || !instructionContent.has(instructionPath)) return tool.execute(toolCallId, args, signal, onUpdate);
			for (;;) {
				const priorDelivery = instructionDeliveryCache?.get(instructionPath);
				if (!priorDelivery) break;
				const delivered = await priorDelivery;
				if (instructionDeliveryCache?.get(instructionPath) !== priorDelivery) continue;
				if (delivered) return alreadyDeliveredResult();
				instructionDeliveryCache?.delete(instructionPath);
			}
			let settleDelivery = (_delivered) => void 0;
			let delivery;
			if (instructionDeliveryCache) {
				delivery = new Promise((resolve) => {
					settleDelivery = resolve;
				});
				instructionDeliveryCache.set(instructionPath, delivery);
			}
			const resetDelivery = () => {
				settleDelivery(false);
				if (delivery && instructionDeliveryCache?.get(instructionPath) === delivery) instructionDeliveryCache.delete(instructionPath);
			};
			const instructionTool = typeof instructionContent.get(instructionPath) === "string" ? virtualRead ??= createOpenClawReadTool(eraseSessionFileTool(createReadTool("/", {
				maxBytes: resolveAdaptiveReadMaxBytes(options),
				modelBudget: resolveToolResultBudget(options?.modelContextWindowTokens),
				operations: {
					resolvePath: (filePath) => filePath,
					access: async (filePath) => void readContent(filePath),
					readFile: async (filePath) => Buffer.from(readContent(filePath), "utf8")
				}
			})), options) : tool;
			const instructionArgs = {
				...record,
				path: normalizedPath
			};
			for (const key of [
				"offset",
				"limit",
				"cursor"
			]) delete instructionArgs[key];
			try {
				const result = await instructionTool.execute(toolCallId, instructionArgs, signal, onUpdate);
				const details = result.details;
				const detailsKind = details && typeof details === "object" && "kind" in details && typeof details.kind === "string" ? details.kind : void 0;
				if (detailsKind === "truncated") {
					resetDelivery();
					const text = "Skill instructions cannot be partially served: the whole document exceeds this call's read or model-context budget. Ask the operator to reduce the document or increase the model context.";
					return {
						content: [{
							type: "text",
							text
						}],
						details: {
							kind: "text",
							content: text
						}
					};
				}
				if (detailsKind !== "text") {
					resetDelivery();
					return result;
				}
				settleDelivery(true);
				return result;
			} catch (error) {
				resetDelivery();
				throw error;
			}
		}
	};
}
function createSandboxReadOperations(params) {
	return {
		resolveQueueKey: (absolutePath, signal) => resolveSandboxFileQueueKey(params, absolutePath, signal),
		resolvePath: (filePath) => {
			const normalizedMediaSource = normalizeMediaReferenceSource(filePath);
			if (classifyMediaReferenceSource(normalizedMediaSource).isMediaStoreUrl) return resolveMediaReferenceSandboxPath(normalizedMediaSource, "media/inbound").resolved;
			return resolveContainerPathCandidate(filePath) ?? filePath;
		},
		decodeText: ({ buffer, absolutePath }) => params.bridge.resolvePath({
			filePath: absolutePath,
			cwd: params.root
		}).hostPath ? decodeWindowsTextFileBuffer({ buffer }) : buffer.toString("utf8"),
		readFile: (absolutePath) => params.bridge.readFile({
			filePath: absolutePath,
			cwd: params.root
		}),
		access: (absolutePath) => assertSandboxFileExists(params, absolutePath),
		detectImageMimeType: async (absolutePath, buffer) => {
			const mime = await detectMime({
				buffer,
				filePath: absolutePath
			});
			return mime?.startsWith("image/") ? mime : void 0;
		}
	};
}
function createSandboxWriteOperations(params) {
	return withMemoryWriteProvenance({
		resolveQueueKey: (absolutePath, signal) => resolveSandboxFileQueueKey(params, absolutePath, signal),
		mkdir: async (dir) => {
			await params.bridge.mkdirp({
				filePath: dir,
				cwd: params.root,
				signal: params.abortSignal
			});
		},
		writeFile: async (absolutePath, content) => {
			await params.bridge.writeFile({
				filePath: absolutePath,
				cwd: params.root,
				data: content,
				signal: params.abortSignal
			});
		},
		readFile: (absolutePath) => params.bridge.readFile({
			filePath: absolutePath,
			cwd: params.root
		}),
		statFile: (absolutePath) => params.bridge.stat({
			filePath: absolutePath,
			cwd: params.root
		})
	}, params.memoryWriteProvenance);
}
function createSandboxEditOperations(params) {
	return withMemoryWriteProvenance({
		resolveQueueKey: (absolutePath, signal) => resolveSandboxFileQueueKey(params, absolutePath, signal),
		readFile: (absolutePath) => params.bridge.readFile({
			filePath: absolutePath,
			cwd: params.root
		}),
		writeFile: (absolutePath, content) => params.bridge.writeFile({
			filePath: absolutePath,
			cwd: params.root,
			data: content,
			signal: params.abortSignal
		}),
		statFile: (absolutePath) => params.bridge.stat({
			filePath: absolutePath,
			cwd: params.root
		}),
		access: (absolutePath) => assertSandboxFileExists(params, absolutePath)
	}, params.memoryWriteProvenance);
}
async function resolveSandboxFileQueueKey(params, absolutePath, signal) {
	return await resolveSandboxFileMutationQueueKey({
		bridge: params.bridge,
		root: params.root,
		filePath: absolutePath,
		cwd: params.root,
		signal
	});
}
async function assertSandboxFileExists(params, absolutePath) {
	const stat = await params.bridge.stat({
		filePath: absolutePath,
		cwd: params.root
	});
	if (!stat) throw createFsAccessError("ENOENT", absolutePath);
	if (stat.type === "directory") throw createFsAccessError("EISDIR", absolutePath);
}
function resolveHostPath(filePath) {
	return path.resolve(expandOsHomePrefix(filePath));
}
async function statHostFile(absolutePath) {
	try {
		const stat = await fs.stat(absolutePath);
		return {
			type: stat.isFile() ? "file" : stat.isDirectory() ? "directory" : "other",
			size: stat.size,
			mtimeMs: stat.mtimeMs
		};
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
		throw error;
	}
}
async function writeWorkspaceFile(root, getRoot, absolutePath, content, abortSignal) {
	const relative = await toCanonicalRelativeWorkspacePath(root, absolutePath);
	const rootReal = await fs.realpath(root);
	if ((await fs.lstat(path.resolve(rootReal, relative)).catch(() => void 0))?.isSymbolicLink()) throw new FsSafeError("symlink", `refusing to write to symlink: ${absolutePath}`);
	const rootHandle = await getRoot();
	abortSignal?.throwIfAborted();
	await rootHandle.write(relative, content, { mkdir: true });
}
function createHostWriteOperations(root$1, options) {
	if (!(options?.workspaceOnly ?? false)) return withMemoryWriteProvenance({
		mkdir: async (dir) => {
			const resolved = resolveHostPath(dir);
			options?.abortSignal?.throwIfAborted();
			await fs.mkdir(resolved, { recursive: true });
		},
		writeFile: (filePath, content) => writeHostFile(filePath, content, options?.abortSignal),
		readFile: async (absolutePath) => fs.readFile(path.resolve(expandOsHomePrefix(absolutePath))),
		statFile: (absolutePath) => statHostFile(path.resolve(expandOsHomePrefix(absolutePath)))
	}, options?.memoryWriteProvenance);
	let rootPromise;
	const getRoot = () => rootPromise ??= root(root$1);
	return withMemoryWriteProvenance({
		mkdir: async (dir) => {
			const relative = toRelativeWorkspacePath(root$1, dir, { allowRoot: true });
			const resolved = relative ? path.resolve(root$1, relative) : path.resolve(root$1);
			await assertSandboxPath({
				filePath: resolved,
				cwd: root$1,
				root: root$1
			});
			options?.abortSignal?.throwIfAborted();
			await fs.mkdir(resolved, { recursive: true });
		},
		writeFile: (absolutePath, content) => writeWorkspaceFile(root$1, getRoot, absolutePath, content, options?.abortSignal),
		readFile: async (absolutePath) => {
			const relative = await toCanonicalRelativeWorkspacePath(root$1, absolutePath);
			return (await (await getRoot()).read(relative)).buffer;
		},
		statFile: async (absolutePath) => {
			const relative = toRelativeWorkspacePath(root$1, absolutePath);
			return statHostFile(path.resolve(root$1, relative));
		}
	}, options?.memoryWriteProvenance);
}
function createHostEditOperations(root$2, options) {
	if (!(options?.workspaceOnly ?? false)) return withMemoryWriteProvenance({
		readFile: async (absolutePath) => {
			return await fs.readFile(resolveHostPath(absolutePath));
		},
		writeFile: (filePath, content) => writeHostFile(filePath, content, options?.abortSignal),
		statFile: (absolutePath) => statHostFile(resolveHostPath(absolutePath)),
		access: async (absolutePath) => {
			await fs.access(resolveHostPath(absolutePath));
		}
	}, options?.memoryWriteProvenance);
	let rootPromise;
	const getRoot = () => rootPromise ??= root(root$2);
	return withMemoryWriteProvenance({
		readFile: async (absolutePath) => {
			const relative = await toCanonicalRelativeWorkspacePath(root$2, absolutePath);
			return (await (await getRoot()).read(relative)).buffer;
		},
		writeFile: (absolutePath, content) => writeWorkspaceFile(root$2, getRoot, absolutePath, content, options?.abortSignal),
		statFile: async (absolutePath) => {
			const relative = toRelativeWorkspacePath(root$2, absolutePath);
			return statHostFile(path.resolve(root$2, relative));
		},
		access: async (absolutePath) => {
			let relative;
			try {
				relative = await toCanonicalRelativeWorkspacePath(root$2, absolutePath);
			} catch {
				return;
			}
			try {
				await (await (await getRoot()).open(relative)).handle.close().catch(() => {});
			} catch (error) {
				if (error instanceof FsSafeError && error.code === "not-found") throw createFsAccessError("ENOENT", absolutePath);
				if (error instanceof FsSafeError && error.code === "outside-workspace") return;
				throw error;
			}
		}
	}, options?.memoryWriteProvenance);
}
async function toCanonicalRelativeWorkspacePath(root, absolutePath) {
	const lexicalRelative = toRelativeWorkspacePath(root, absolutePath);
	const lexicalPath = path.resolve(root, lexicalRelative);
	const parentPath = path.dirname(lexicalPath);
	const [rootReal, canonicalParentPath] = await Promise.all([fs.realpath(root), canonicalPathFromExistingAncestor(parentPath)]);
	const canonicalPath = path.join(canonicalParentPath, path.basename(lexicalPath));
	return toRelativeWorkspacePath(rootReal, canonicalPath);
}
function createFsAccessError(code, filePath) {
	const error = /* @__PURE__ */ new Error(`Sandbox FS error (${code}): ${filePath}`);
	error.code = code;
	return error;
}
//#endregion
//#region src/agents/tool-loop-detection-config.ts
/** Resolves effective tool loop-detection config by overlaying agent settings on globals. */
function resolveToolLoopDetectionConfig(params) {
	const global = params.cfg?.tools?.loopDetection;
	const agent = params.agentId && params.cfg ? resolveAgentConfig(params.cfg, params.agentId)?.tools?.loopDetection : void 0;
	if (!agent) return global;
	if (!global) return agent;
	return { enabled: agent.enabled ?? global.enabled };
}
//#endregion
export { createSandboxedEditTool as a, createSkillInstructionDeliveryCache as c, wrapToolMemoryFlushAppendOnlyWrite as d, wrapToolWorkspaceRootGuardWithOptions as f, writeHostFile as h, createOpenClawReadTool as i, resolveAdaptiveReadMaxBytes as l, withMemoryWriteProvenance as m, createHostWorkspaceEditTool as n, createSandboxedReadTool as o, createMemoryWriteProvenanceObserver as p, createHostWorkspaceWriteTool as r, createSandboxedWriteTool as s, resolveToolLoopDetectionConfig as t, wrapReadToolWithSkillContent as u };
