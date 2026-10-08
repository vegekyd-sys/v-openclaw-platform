import "./src-vebZIeLe.js";
import { t as expectDefined } from "./expect-CyE8FADM.js";
import { o as normalizeLowercaseStringOrEmpty, s as normalizeNullableString } from "./string-coerce-CIXf7egm.js";
import { d as normalizeStringEntries } from "./string-normalization-DiSb4JeN.js";
import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import { r as createLazyRuntimeModule } from "./lazy-runtime-CgCh8H_K.js";
import { t as hasErrnoCode } from "./errno-CkbDOfLk.js";
import { A as writeExternalFileWithinRoot, P as readFileHandleBounded, t as FsSafeError, u as openLocalFileSafely } from "./fs-safe-Cdu9fYG_.js";
import { n as isAbortError } from "./abort-signal-D2k14JsD.js";
import { w as resolveStateDir } from "./paths-Dx1CjxA5.js";
import "./errors-u9zSVTak.js";
import { n as resolvePreferredOpenClawTmpDir } from "./tmp-openclaw-dir-DnyL0lW9.js";
import { n as findNormalizedProviderValue } from "./provider-id-DMd-TDFp.js";
import { m as listOfficialExternalProviderCatalogEntries, o as getOfficialExternalPluginCatalogManifest } from "./official-external-plugin-catalog-BPnH2jsJ.js";
import { t as buildRandomTempFilePath } from "./temp-download-Jb1OAmCx.js";
import { t as formatCliCommand } from "./command-format-C7YfyMTd.js";
import { n as ok } from "./result-BQGgYouL.js";
import { i as shouldLogVerbose, r as logVerbose } from "./globals-Dl0PaL2u.js";
import { n as runExec } from "./exec-D7bZ8DC6.js";
import { r as assertSecretOwnerAvailable } from "./runtime-degraded-state-D5EZZ925.js";
import { i as resolveOfficialExternalPluginRepairHint } from "./official-external-plugin-repair-hints-CmeYRvhu.js";
import { c as mergeModelProviderRequestOverrides, m as sanitizeConfiguredProviderRequest, p as sanitizeConfiguredModelProviderRequest } from "./provider-request-config-BsyiChYr.js";
import { n as CUSTOM_LOCAL_AUTH_MARKER } from "./model-auth-markers-BQVHEZ6S.js";
import { d as normalizeMimeType } from "./mime-BxTGWg2e.js";
import { r as readRemoteMediaBuffer, t as MediaFetchError } from "./fetch-DLi8QLoe.js";
import { i as normalizeMediaReferenceSource, o as resolveInboundMediaReference, r as classifyMediaReferenceSource } from "./media-reference-D2cwQT4h.js";
import { o as runFfmpeg } from "./media-probe-C-WRFuuN.js";
import "./media-services-BySSkTCE.js";
import { r as mergeInboundPathRoots, t as isInboundPathAllowed } from "./inbound-path-policy-DQ5Rksw7.js";
import { i as getDefaultMediaLocalRoots } from "./local-roots-BUVPtC1p.js";
import { n as normalizeMediaProviderId, t as normalizeMediaExecutionProviderId } from "./provider-id-DSbuCFIb.js";
import { a as DEFAULT_TIMEOUT_SECONDS, n as DEFAULT_MAX_BYTES, o as DEFAULT_VIDEO_MAX_BASE64_BYTES, s as MIN_AUDIO_FILE_BYTES, t as CLI_OUTPUT_MAX_BUFFER } from "./defaults.constants-Cof2g8lZ.js";
import { t as assertRuntimeMediaRequestSecretOwnerAvailable } from "./runtime-media-secret-owner-hrrxUKqA.js";
import { t as describeImageWithModel } from "./image-runtime-1GRAm0ii.js";
import { r as getMediaUnderstandingProvider } from "./pdf-extract-BCcTz1iE.js";
import { c as resolveTimeoutMs, n as resolveMaxBytes, o as resolvePrompt, r as resolveMaxChars } from "./resolve-CLfoDrOg.js";
import { r as providerOperationRetryConfig } from "./operation-retry--dX9yBi2.js";
import { n as resolveOpenAiAudioAuthModelApi } from "./openai-audio-api-CZK5TvIV.js";
import { t as applyTemplate } from "./templating-DocmBuN3.js";
import { n as classifyAttachmentBytes } from "./attachment-classify-1K-kUuWK.js";
import { o as extractImageContentFromSource } from "./input-files-By3sauQm.js";
import { i as normalizeAttachmentPath, n as isImageAttachment, r as isVideoAttachment, t as isAudioAttachment } from "./attachments.normalize-6tB9DF6-.js";
import "./temp-path-BdePNnXG.js";
import { a as resolveRequestedLocalAudioBackend, i as recordLocalAudioBackendObservation } from "./local-audio-C_bA4648.js";
import { n as executeWithApiKeyRotation, t as collectProviderApiKeysForExecution } from "./api-key-rotation-BFBOH5Pc.js";
import { i as resolveProxyFetchFromEnv } from "./proxy-fetch-DXaEFuyI.js";
import { realpathSync, statSync } from "node:fs";
import path from "node:path";
import fs$1 from "node:fs/promises";
//#region src/media-understanding/attachments.select.ts
const DEFAULT_MAX_ATTACHMENTS = 1;
function orderAttachments(attachments, prefer) {
	const list = Array.isArray(attachments) ? attachments.filter(isAttachmentRecord) : [];
	if (!prefer || prefer === "first") return list;
	if (prefer === "last") return [...list].toReversed();
	if (prefer === "path") {
		const withPath = list.filter((item) => item.path);
		const withoutPath = list.filter((item) => !item.path);
		return [...withPath, ...withoutPath];
	}
	if (prefer === "url") {
		const withUrl = list.filter((item) => item.url);
		const withoutUrl = list.filter((item) => !item.url);
		return [...withUrl, ...withoutUrl];
	}
	return list;
}
function isAttachmentRecord(value) {
	if (!value || typeof value !== "object") return false;
	const entry = value;
	if (typeof entry.index !== "number") return false;
	if (entry.path !== void 0 && typeof entry.path !== "string") return false;
	if (entry.url !== void 0 && typeof entry.url !== "string") return false;
	if (entry.mime !== void 0 && typeof entry.mime !== "string") return false;
	if (entry.alreadyTranscribed !== void 0 && typeof entry.alreadyTranscribed !== "boolean") return false;
	return true;
}
/** Selects attachments for a media-understanding capability under configured ordering limits. */
function selectAttachments(params) {
	const { capability, attachments, policy } = params;
	const matches = (Array.isArray(attachments) ? attachments.filter(isAttachmentRecord) : []).filter((item) => {
		if (capability === "audio" && item.alreadyTranscribed) return false;
		if (capability === "image") return isImageAttachment(item);
		if (capability === "audio") return isAudioAttachment(item);
		return isVideoAttachment(item);
	});
	if (matches.length === 0) return {
		selected: [],
		droppedAttachmentIndexes: []
	};
	const ordered = orderAttachments(matches, policy?.prefer);
	const mode = policy?.mode ?? "first";
	const maxAttachments = policy?.maxAttachments ?? DEFAULT_MAX_ATTACHMENTS;
	const limit = mode === "all" ? Math.max(1, maxAttachments) : 1;
	return {
		selected: ordered.slice(0, limit),
		droppedAttachmentIndexes: ordered.slice(limit).map((attachment) => attachment.index)
	};
}
//#endregion
//#region packages/media-understanding-common/src/errors.ts
/** Error used when a media attachment should be skipped without failing the whole request. */
var MediaUnderstandingSkipError = class extends Error {
	constructor(reason, message) {
		super(message);
		this.reason = reason;
		this.name = "MediaUnderstandingSkipError";
	}
};
/** Narrow unknown errors to media-understanding skip errors. */
function isMediaUnderstandingSkipError(err) {
	return err instanceof MediaUnderstandingSkipError;
}
//#endregion
//#region src/media-understanding/attachments.cache.ts
const REMOTE_MEDIA_FETCH_RETRY = {
	attempts: 3,
	minDelayMs: 500,
	maxDelayMs: 3e3,
	jitter: .2
};
let defaultLocalPathRoots;
function inboundStoreRef(url) {
	const value = normalizeMediaReferenceSource(url ?? "");
	return value && classifyMediaReferenceSource(value).isMediaStoreUrl ? value : void 0;
}
/** Returns the attachment URL only when it is an HTTP(S) remote source. */
function remoteFetchUrl(url) {
	const value = normalizeMediaReferenceSource(url ?? "");
	return value && classifyMediaReferenceSource(value).isHttpUrl ? value : void 0;
}
function concreteMime(mime) {
	const normalized = mime?.trim();
	if (!normalized || normalized.endsWith("/*") || normalized === "application/octet-stream") return;
	return normalized;
}
function getDefaultLocalPathRoots() {
	defaultLocalPathRoots ??= mergeInboundPathRoots(getDefaultMediaLocalRoots());
	return defaultLocalPathRoots;
}
function resolveUsableLocalCandidate(candidate, roots) {
	try {
		const realPath = realpathSync(candidate);
		const canonicalRoots = roots.map((root) => {
			if (root.includes("*")) return root;
			try {
				return realpathSync(root);
			} catch {
				return root;
			}
		});
		return statSync(realPath).isFile() && isInboundPathAllowed({
			filePath: realPath,
			roots: canonicalRoots
		}) ? candidate : void 0;
	} catch {
		return;
	}
}
/**
* Lazy resolver for media-understanding attachments.
*
* The cache prefers allowed local paths, falls back to remote URLs when a local path is blocked
* or missing, and owns any temporary files created for providers that require a filesystem path.
*/
var MediaAttachmentCache = class {
	constructor(attachments, options) {
		this.entries = /* @__PURE__ */ new Map();
		this.attachments = attachments;
		this.ssrfPolicy = options?.ssrfPolicy;
		this.localPathRoots = options?.includeDefaultLocalPathRoots === false ? mergeInboundPathRoots(options.localPathRoots) : mergeInboundPathRoots(options?.localPathRoots, getDefaultLocalPathRoots());
		this.fallbackWorkspaceDir = options?.workspaceDir;
		for (const attachment of attachments) this.entries.set(attachment.index, { attachment });
	}
	/** Returns attachment bytes, MIME hint, filename, and size within the requested byte limit. */
	async getBuffer(params) {
		const entry = await this.ensureEntry(params.attachmentIndex);
		const url = remoteFetchUrl(entry.attachment.url);
		if (entry.bufferResult) {
			if (entry.bufferResult.size > params.maxBytes) throw new MediaUnderstandingSkipError("maxBytes", `Attachment ${params.attachmentIndex + 1} exceeds maxBytes ${params.maxBytes}`);
			return entry.bufferResult;
		}
		if (entry.resolvedPath) try {
			const local = await this.readEntryLocalBuffer(entry, params);
			if (local) return local;
		} catch (err) {
			if (!this.recordRecoverableLocalError(entry, err)) throw err;
		}
		if (await this.activateStoreAlias(entry)) try {
			const local = await this.readEntryLocalBuffer(entry, params);
			if (local) return local;
		} catch (err) {
			if (!this.recordRecoverableLocalError(entry, err)) throw err;
		}
		if (!url) throw entry.lastLocalError ?? new MediaUnderstandingSkipError("empty", `Attachment ${params.attachmentIndex + 1} has no path or URL.`);
		try {
			const fetched = await readRemoteMediaBuffer({
				url,
				timeoutMs: params.timeoutMs,
				maxBytes: params.maxBytes,
				ssrfPolicy: this.ssrfPolicy,
				retry: REMOTE_MEDIA_FETCH_RETRY
			});
			const classification = await classifyAttachmentBytes({
				buffer: fetched.buffer,
				name: fetched.fileName ?? url,
				declaredMime: concreteMime(entry.attachment.mime),
				additionalMimeHints: [fetched.contentType]
			});
			entry.bufferResult = {
				buffer: fetched.buffer,
				classification,
				mime: classification.mime,
				fileName: fetched.fileName ?? `media-${params.attachmentIndex + 1}`,
				size: fetched.buffer.length
			};
			return entry.bufferResult;
		} catch (err) {
			if (err instanceof MediaFetchError && err.code === "max_bytes") throw new MediaUnderstandingSkipError("maxBytes", `Attachment ${params.attachmentIndex + 1} exceeds maxBytes ${params.maxBytes}`);
			if (isAbortError(err)) throw new MediaUnderstandingSkipError("timeout", `Attachment ${params.attachmentIndex + 1} timed out while fetching.`);
			throw err;
		}
	}
	/** Reads the entry's currently resolved local file, or undefined once it is ruled out. */
	async readEntryLocalBuffer(entry, params) {
		const size = await this.ensureLocalStat(entry);
		if (!entry.resolvedPath) return;
		if (size !== void 0 && size > params.maxBytes) throw new MediaUnderstandingSkipError("maxBytes", `Attachment ${params.attachmentIndex + 1} exceeds maxBytes ${params.maxBytes}`);
		const { buffer, filePath } = await this.readLocalBuffer({
			attachmentIndex: params.attachmentIndex,
			filePath: entry.resolvedPath,
			maxBytes: params.maxBytes
		});
		entry.resolvedPath = filePath;
		const classification = await classifyAttachmentBytes({
			buffer,
			name: filePath,
			declaredMime: concreteMime(entry.attachment.mime)
		});
		entry.bufferResult = {
			buffer,
			classification,
			mime: classification.mime,
			fileName: path.basename(filePath) || `media-${params.attachmentIndex + 1}`,
			size: buffer.length,
			localPath: filePath
		};
		return entry.bufferResult;
	}
	recordRecoverableLocalError(entry, err) {
		if (!(err instanceof MediaUnderstandingSkipError) || err.reason !== "blocked" && err.reason !== "empty") return false;
		entry.lastLocalError = err;
		return true;
	}
	async activateStoreAlias(entry) {
		if (entry.storeAliasAttempted) return false;
		entry.storeAliasAttempted = true;
		const storeRef = inboundStoreRef(entry.attachment.url);
		if (!storeRef) return false;
		const inboundReference = await resolveInboundMediaReference(storeRef).catch(() => null);
		if (!inboundReference || inboundReference.physicalPath === entry.resolvedPath) return false;
		entry.resolvedPath = inboundReference.physicalPath;
		entry.statSize = void 0;
		return true;
	}
	/** Returns a local path for providers that cannot accept buffers, creating a temp file if needed. */
	async getPath(params) {
		const entry = await this.ensureEntry(params.attachmentIndex);
		if (entry.resolvedPath) {
			try {
				const size = await this.ensureLocalStat(entry);
				if (entry.resolvedPath && size !== void 0 && size > params.maxBytes) throw new MediaUnderstandingSkipError("maxBytes", `Attachment ${params.attachmentIndex + 1} exceeds maxBytes ${params.maxBytes}`);
			} catch (err) {
				if (!this.recordRecoverableLocalError(entry, err)) throw err;
			}
			if (entry.resolvedPath) return { path: entry.resolvedPath };
		}
		if (await this.activateStoreAlias(entry)) try {
			const size = await this.ensureLocalStat(entry);
			if (entry.resolvedPath) {
				if (size !== void 0 && size > params.maxBytes) throw new MediaUnderstandingSkipError("maxBytes", `Attachment ${params.attachmentIndex + 1} exceeds maxBytes ${params.maxBytes}`);
				return { path: entry.resolvedPath };
			}
		} catch (err) {
			if (!this.recordRecoverableLocalError(entry, err)) throw err;
		}
		if (entry.tempPath) {
			if (entry.bufferResult && entry.bufferResult.size > params.maxBytes) throw new MediaUnderstandingSkipError("maxBytes", `Attachment ${params.attachmentIndex + 1} exceeds maxBytes ${params.maxBytes}`);
			return {
				path: entry.tempPath,
				cleanup: entry.tempCleanup
			};
		}
		const bufferResult = await this.getBuffer(params);
		const extension = path.extname(bufferResult.fileName || "") || "";
		const tmpPath = buildRandomTempFilePath({
			prefix: "openclaw-media",
			extension
		});
		const previousCleanup = entry.tempCleanup;
		entry.tempCleanup = async () => {
			if (entry.tempPath === tmpPath) entry.tempPath = void 0;
			await previousCleanup?.();
			await fs$1.unlink(tmpPath).catch(() => {});
		};
		await fs$1.writeFile(tmpPath, bufferResult.buffer).catch(async (error) => {
			await entry.tempCleanup?.();
			throw error;
		});
		entry.tempPath = tmpPath;
		return {
			path: tmpPath,
			cleanup: entry.tempCleanup
		};
	}
	/** Removes temporary files created by `getPath`; callers should run this after provider use. */
	async cleanup() {
		const cleanups = [];
		for (const entry of this.entries.values()) if (entry.tempCleanup) {
			cleanups.push(entry.tempCleanup());
			entry.tempCleanup = void 0;
		}
		await Promise.all(cleanups);
	}
	async ensureEntry(attachmentIndex) {
		const existing = this.entries.get(attachmentIndex);
		if (existing) {
			if (!existing.localResolutionAttempted) {
				existing.resolvedPath = await this.resolveLocalPath(existing.attachment);
				existing.localResolutionAttempted = true;
			}
			return existing;
		}
		const attachment = this.attachments.find((item) => item.index === attachmentIndex) ?? { index: attachmentIndex };
		const entry = {
			attachment,
			resolvedPath: await this.resolveLocalPath(attachment),
			localResolutionAttempted: true
		};
		this.entries.set(attachmentIndex, entry);
		return entry;
	}
	async resolveLocalPath(attachment) {
		const rawPath = normalizeAttachmentPath(attachment.path);
		if (!rawPath) return;
		const inboundReference = await resolveInboundMediaReference(rawPath).catch(() => null);
		if (inboundReference) return inboundReference.physicalPath;
		const workspaceDir = attachment.workspaceDir ?? this.fallbackWorkspaceDir;
		if (workspaceDir) return path.resolve(workspaceDir, rawPath);
		if (!path.isAbsolute(rawPath)) {
			const usableCwdCandidate = resolveUsableLocalCandidate(path.resolve(rawPath), this.localPathRoots);
			if (usableCwdCandidate) return usableCwdCandidate;
			const usableStateCandidate = resolveUsableLocalCandidate(path.resolve(resolveStateDir(), rawPath), this.localPathRoots);
			if (usableStateCandidate) return usableStateCandidate;
		}
		return path.resolve(rawPath);
	}
	async ensureLocalStat(entry) {
		if (!entry.resolvedPath) return;
		if (!isInboundPathAllowed({
			filePath: entry.resolvedPath,
			roots: this.localPathRoots
		})) {
			const canonicalRoots = await this.getCanonicalLocalPathRoots();
			if (!isInboundPathAllowed({
				filePath: entry.resolvedPath,
				roots: canonicalRoots
			})) {
				entry.resolvedPath = void 0;
				if (shouldLogVerbose()) logVerbose(`Blocked attachment path outside allowed roots: ${entry.attachment.path ?? entry.attachment.url ?? "(unknown)"}`);
				throw new MediaUnderstandingSkipError("blocked", `Attachment ${entry.attachment.index + 1} path is outside allowed roots.`);
			}
		}
		if (entry.statSize !== void 0) return entry.statSize;
		try {
			const currentPath = entry.resolvedPath;
			const opened = await openLocalFileSafely({ filePath: currentPath });
			let canonicalRoots;
			try {
				canonicalRoots = await this.getCanonicalLocalPathRoots();
			} finally {
				await opened.handle.close().catch(() => {});
			}
			if (!isInboundPathAllowed({
				filePath: opened.realPath,
				roots: canonicalRoots
			})) {
				entry.resolvedPath = void 0;
				if (shouldLogVerbose()) logVerbose(`Blocked canonicalized attachment path outside allowed roots: ${opened.realPath}`);
				throw new MediaUnderstandingSkipError("blocked", `Attachment ${entry.attachment.index + 1} path is outside allowed roots.`);
			}
			entry.resolvedPath = opened.realPath;
			entry.statSize = opened.stat.size;
			return opened.stat.size;
		} catch (err) {
			if (err instanceof MediaUnderstandingSkipError) throw err;
			if (err instanceof FsSafeError) {
				entry.resolvedPath = void 0;
				if (err.code === "not-file") throw new MediaUnderstandingSkipError("empty", `Attachment ${entry.attachment.index + 1} path is not a regular file.`);
				if (err.code !== "not-found") throw new MediaUnderstandingSkipError("blocked", `Attachment ${entry.attachment.index + 1} path is outside allowed roots.`);
			} else throw new MediaUnderstandingSkipError("blocked", `Attachment ${entry.attachment.index + 1} could not be canonicalized.`);
			entry.resolvedPath = void 0;
			if (shouldLogVerbose()) logVerbose(`Failed to read attachment ${entry.attachment.index + 1}: ${String(err)}`);
			return;
		}
	}
	async getCanonicalLocalPathRoots() {
		if (this.canonicalLocalPathRoots) return await this.canonicalLocalPathRoots;
		this.canonicalLocalPathRoots = (async () => mergeInboundPathRoots(this.localPathRoots, await Promise.all(this.localPathRoots.map(async (root) => {
			if (root.includes("*")) return root;
			return await fs$1.realpath(root).catch(() => root);
		}))))();
		return await this.canonicalLocalPathRoots;
	}
	async readLocalBuffer(params) {
		let opened;
		try {
			opened = await openLocalFileSafely({ filePath: params.filePath });
			if (opened.stat.size > params.maxBytes) throw new MediaUnderstandingSkipError("maxBytes", `Attachment ${params.attachmentIndex + 1} exceeds maxBytes ${params.maxBytes}`);
			const canonicalRoots = await this.getCanonicalLocalPathRoots();
			if (!isInboundPathAllowed({
				filePath: opened.realPath,
				roots: canonicalRoots
			})) throw new MediaUnderstandingSkipError("blocked", `Attachment ${params.attachmentIndex + 1} path is outside allowed roots.`);
			return {
				buffer: await readFileHandleBounded(opened.handle, params.maxBytes),
				filePath: opened.realPath
			};
		} catch (err) {
			if (err instanceof FsSafeError) {
				if (err.code === "too-large") throw new MediaUnderstandingSkipError("maxBytes", `Attachment ${params.attachmentIndex + 1} exceeds maxBytes ${params.maxBytes}`);
				if (err.code === "not-file" || err.code === "not-found") throw new MediaUnderstandingSkipError("empty", `Attachment ${params.attachmentIndex + 1} path is not a regular file.`);
				throw new MediaUnderstandingSkipError("blocked", `Attachment ${params.attachmentIndex + 1} path is outside allowed roots.`);
			}
			throw err;
		} finally {
			await opened?.handle.close().catch(() => {});
		}
	}
};
//#endregion
//#region packages/media-understanding-common/src/output-extract.ts
/** Parse the last JSON object in a noisy provider output string. */
function extractLastJsonObject(raw) {
	const trimmed = raw.trim();
	const ranges = [];
	const starts = [];
	let inString = false;
	let escaped = false;
	let preambleQuote;
	let preambleEscaped = false;
	let previousSignificant;
	let lineHasNonWhitespace = false;
	let arrayDepth = 0;
	let candidateHasContent = false;
	for (let index = 0; index < trimmed.length; index += 1) {
		const character = trimmed.charAt(index);
		if (inString) {
			if (character === "\n" || character === "\r") {
				starts.length = 0;
				inString = false;
				escaped = false;
			} else if (escaped) escaped = false;
			else if (character === "\\") escaped = true;
			else if (character === "\"") inString = false;
			continue;
		}
		if (starts.length === 0) {
			if (preambleQuote !== void 0) {
				if (character === "\n" || character === "\r") {
					preambleQuote = void 0;
					preambleEscaped = false;
				} else if (preambleEscaped) preambleEscaped = false;
				else if (character === "\\") preambleEscaped = true;
				else if (character === preambleQuote) preambleQuote = void 0;
				continue;
			}
			if (character === "\"" || character === "'" || character === "`") {
				const previous = trimmed[index - 1];
				if (previous === void 0 || /[\s:([{]/.test(previous)) {
					preambleQuote = character;
					preambleEscaped = false;
					continue;
				}
			}
			if (character === "{") {
				arrayDepth = 0;
				candidateHasContent = false;
				starts.push(index);
			}
			if (!/\s/.test(character)) {
				previousSignificant = character;
				lineHasNonWhitespace = true;
			} else if (character === "\n" || character === "\r") lineHasNonWhitespace = false;
			continue;
		}
		const hadCandidateContent = candidateHasContent;
		if (character === "\"") inString = true;
		else if (character === "{") {
			if (previousSignificant === ":" || previousSignificant === "[" || previousSignificant === "\"" || previousSignificant === "," && (lineHasNonWhitespace || arrayDepth > 0)) starts.push(index);
			else if (!lineHasNonWhitespace && !hadCandidateContent) {
				starts.length = 1;
				starts[0] = index;
				arrayDepth = 0;
				candidateHasContent = false;
			}
		} else if (character === "}" && starts.length > 0) {
			const start = starts.pop();
			if (start !== void 0 && starts.length === 0) ranges.push({
				start,
				end: index
			});
		} else if (character === "[") arrayDepth += 1;
		else if (character === "]" && arrayDepth > 0) arrayDepth -= 1;
		if (!/\s/.test(character)) {
			candidateHasContent = true;
			previousSignificant = character;
			lineHasNonWhitespace = true;
		} else if (character === "\n" || character === "\r") lineHasNonWhitespace = false;
	}
	for (const range of ranges.toReversed()) try {
		return JSON.parse(trimmed.slice(range.start, range.end + 1));
	} catch {}
	return null;
}
/** Extract Gemini CLI-style response text from the last JSON object in output. */
function extractGeminiResponse(raw) {
	const payload = extractLastJsonObject(raw);
	if (!payload || typeof payload !== "object") return null;
	const response = payload.response;
	if (typeof response !== "string") return null;
	return response.trim() || null;
}
//#endregion
//#region packages/media-understanding-common/src/video.ts
/** Estimate base64 size for a byte count. */
function estimateBase64Size(bytes) {
	return Math.ceil(bytes / 3) * 4;
}
/** Resolve video base64 byte limit from raw byte limit and global cap. */
function resolveVideoMaxBase64Bytes(maxBytes) {
	const expanded = estimateBase64Size(maxBytes);
	return Math.min(expanded, DEFAULT_VIDEO_MAX_BASE64_BYTES);
}
//#endregion
//#region src/media-understanding/image-input-normalize.ts
const HEIC_MIME_RE = /^image\/hei[cf](?:-sequence)?$/i;
const HEIC_EXT_RE = /\.(heic|heif)$/i;
function isHeicInput(params) {
	const mime = normalizeMimeType(params.mime);
	if (mime && HEIC_MIME_RE.test(mime)) return true;
	const fileName = params.fileName?.trim();
	return Boolean(fileName && HEIC_EXT_RE.test(fileName));
}
/** Normalizes image bytes before provider execution, converting HEIC/HEIF inputs to JPEG. */
async function normalizeImageDescriptionInput(params) {
	if (!isHeicInput(params)) return {
		buffer: params.buffer,
		mime: params.mime
	};
	const sourceMime = normalizeMimeType(params.mime) ?? "image/heic";
	const image = await extractImageContentFromSource({
		type: "base64",
		data: params.buffer.toString("base64"),
		mediaType: sourceMime
	}, {
		allowUrl: false,
		allowedMimes: /* @__PURE__ */ new Set([
			sourceMime.toLowerCase(),
			"image/heic",
			"image/heif",
			"image/jpeg"
		]),
		maxBytes: params.maxBytes ?? DEFAULT_MAX_BYTES.image,
		maxRedirects: 0,
		timeoutMs: 0
	});
	return {
		buffer: Buffer.from(image.data, "base64"),
		mime: image.mimeType
	};
}
//#endregion
//#region src/media-understanding/runner.entries.ts
const loadModelAuth = createLazyRuntimeModule(async () => await import("./model-auth-CzJDkWhF.js"));
function resolveLiteralProviderApiKey(params) {
	return normalizeNullableString(params.cfg.models?.providers?.[params.providerId]?.apiKey);
}
function sanitizeProviderHeaders(headers) {
	if (!headers) return;
	const next = {};
	for (const [key, value] of Object.entries(headers)) {
		if (typeof value !== "string") continue;
		next[key] = value;
	}
	return Object.keys(next).length > 0 ? next : void 0;
}
function trimOutput(text, maxChars) {
	const trimmed = text.trim();
	if (!maxChars || trimmed.length <= maxChars) return trimmed;
	return truncateUtf16Safe(trimmed, maxChars).trim();
}
function extractSherpaOnnxText(raw) {
	const noMatch = {
		matched: false,
		text: ""
	};
	const tryParse = (value) => {
		const trimmed = value.trim();
		if (!trimmed) return noMatch;
		const head = trimmed[0];
		if (head !== "{" && head !== "\"") return noMatch;
		try {
			const parsed = JSON.parse(trimmed);
			if (typeof parsed === "string") return tryParse(parsed);
			if (parsed && typeof parsed === "object") {
				const text = parsed.text;
				if (typeof text === "string") return {
					matched: true,
					text: text.trim()
				};
			}
		} catch {}
		return noMatch;
	};
	const direct = tryParse(raw);
	if (direct.matched) return direct;
	const lines = normalizeStringEntries(raw.split("\n"));
	for (let i = lines.length - 1; i >= 0; i -= 1) {
		const parsed = tryParse(lines[i] ?? "");
		if (parsed.matched) return parsed;
	}
	return noMatch;
}
function commandBase(command) {
	return path.parse(command).name;
}
function isAntigravityCliCommand(command) {
	const commandId = commandBase(command);
	return commandId === "agy" || commandId === "antigravity";
}
function findArgValue(args, keys) {
	for (const [index, arg] of args.entries()) {
		if (keys.includes(arg)) {
			const value = args[index + 1];
			if (value) return value;
		}
		for (const key of keys) {
			const prefix = `${key}=`;
			if (arg.startsWith(prefix)) {
				const value = arg.slice(prefix.length);
				if (value) return value;
			}
		}
	}
}
function hasArg(args, keys) {
	return args.some((arg) => keys.includes(arg));
}
function resolveWhisperOutputPath(args, mediaPath) {
	const outputDir = findArgValue(args, ["--output_dir", "-o"]);
	if (!outputDir) return null;
	const outputFormat = findArgValue(args, ["--output_format", "-f"]) ?? "all";
	if (outputFormat !== "txt" && outputFormat !== "all") return null;
	return path.join(outputDir, `${path.parse(mediaPath).name}.txt`);
}
function resolveWhisperCppOutputPath(args) {
	if (!hasArg(args, ["-otxt", "--output-txt"])) return null;
	const outputBase = findArgValue(args, ["-of", "--output-file"]);
	if (!outputBase) return null;
	return `${outputBase}.txt`;
}
function resolveParakeetOutputPath(args, mediaPath) {
	const outputDir = findArgValue(args, ["--output-dir"]);
	const outputFormat = findArgValue(args, ["--output-format"]) ?? (process.env.PARAKEET_OUTPUT_FORMAT || "srt");
	const outputTemplate = findArgValue(args, ["--output-template"]) ?? (process.env.PARAKEET_OUTPUT_TEMPLATE || "{filename}");
	if (!outputDir || outputFormat !== "txt" && outputFormat !== "all" || outputTemplate !== "{filename}") return null;
	return path.join(outputDir, `${path.parse(mediaPath).name}.txt`);
}
async function readCliTranscriptFile(filePath) {
	try {
		return (await fs$1.readFile(filePath, "utf8")).trim();
	} catch (error) {
		if (hasErrnoCode(error, "ENOENT")) return "";
		throw error;
	}
}
async function resolveCliOutput(params) {
	const commandId = commandBase(params.command);
	const fileOutput = commandId === "whisper-cli" ? resolveWhisperCppOutputPath(params.args) : commandId === "whisper" ? resolveWhisperOutputPath(params.args, params.mediaPath) : commandId === "parakeet-mlx" ? resolveParakeetOutputPath(params.args, params.mediaPath) : null;
	if (fileOutput) return await readCliTranscriptFile(fileOutput);
	if (commandId === "gemini") {
		const response = extractGeminiResponse(params.stdout);
		if (response) return response;
	}
	if (commandId === "sherpa-onnx-offline") {
		const response = extractSherpaOnnxText(params.stdout);
		if (response.matched) return response.text;
	}
	return params.stdout.trim();
}
async function resolveCliMediaPath(params) {
	const commandId = commandBase(params.command);
	if (params.capability !== "audio" || commandId !== "whisper-cli") return params.mediaPath;
	if (normalizeLowercaseStringOrEmpty(path.extname(params.mediaPath)) === ".wav") return params.mediaPath;
	const wavPath = path.join(params.outputDir, `${path.parse(params.mediaPath).name}.wav`);
	await fs$1.mkdir(params.outputDir, { recursive: true });
	await writeExternalFileWithinRoot({
		rootDir: params.outputDir,
		path: path.basename(wavPath),
		write: async (outputPath) => {
			await runFfmpeg([
				"-y",
				"-i",
				params.mediaPath,
				"-ac",
				"1",
				"-ar",
				"16000",
				"-c:a",
				"pcm_s16le",
				"-f",
				"wav",
				outputPath
			]);
		}
	});
	return wavPath;
}
function normalizeProviderQuery(options) {
	if (!options) return;
	const query = {};
	for (const [key, value] of Object.entries(options)) {
		if (value === void 0) continue;
		query[key] = value;
	}
	return Object.keys(query).length > 0 ? query : void 0;
}
function normalizeDeepgramQueryKeys(query) {
	const normalized = { ...query };
	if ("detectLanguage" in normalized) {
		normalized.detect_language = normalized.detectLanguage;
		delete normalized.detectLanguage;
	}
	if ("smartFormat" in normalized) {
		normalized.smart_format = normalized.smartFormat;
		delete normalized.smartFormat;
	}
	return normalized;
}
function resolveProviderQuery(params) {
	const { providerId, config, entry } = params;
	const mergedOptions = normalizeProviderQuery({
		...config?.providerOptions?.[providerId],
		...entry.providerOptions?.[providerId]
	});
	if (providerId !== "deepgram") return mergedOptions;
	const query = normalizeDeepgramQueryKeys(mergedOptions ?? {});
	return Object.keys(query).length > 0 ? query : void 0;
}
/** Builds the normalized decision record for one provider or CLI model attempt. */
function buildModelDecision(params) {
	if (params.entryType === "cli") {
		const command = params.entry.command?.trim();
		const requestedBackend = command ? resolveRequestedLocalAudioBackend({
			command,
			args: params.entry.args ?? []
		}) : void 0;
		return {
			type: "cli",
			provider: command ?? "cli",
			model: params.entry.model ?? command,
			...requestedBackend ? { requestedBackend } : {},
			outcome: params.outcome,
			reason: params.reason
		};
	}
	const providerIdRaw = params.entry.provider?.trim();
	return {
		type: "provider",
		provider: (providerIdRaw ? normalizeMediaProviderId(providerIdRaw) : void 0) ?? providerIdRaw,
		model: params.entry.model,
		outcome: params.outcome,
		reason: params.reason
	};
}
function resolveEntryRunOptions(params) {
	const { capability, entry, cfg } = params;
	const maxBytes = resolveMaxBytes({
		capability,
		entry,
		cfg,
		config: params.config
	});
	const maxChars = resolveMaxChars({
		capability,
		entry,
		cfg,
		config: params.config
	});
	const timeoutMs = resolveTimeoutMs(entry.timeoutSeconds ?? params.config?.timeoutSeconds ?? cfg.tools?.media?.[capability]?.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS[capability]);
	const configuredPrompt = entry.prompt ?? params.config?.prompt ?? cfg.tools?.media?.[capability]?.prompt;
	return {
		maxBytes,
		maxChars,
		timeoutMs,
		prompt: resolvePrompt(capability, configuredPrompt, maxChars),
		hasConfiguredPrompt: Boolean(configuredPrompt?.trim())
	};
}
function resolveMediaRequestOverrides(config) {
	const overrides = config ?? {};
	return {
		prompt: overrides["_requestPromptOverride"],
		language: overrides["_requestLanguageOverride"]
	};
}
function resolveAudioProviderPrompt(params) {
	const language = normalizeLowercaseStringOrEmpty(params.language);
	const isExplicitEnglish = language === "en" || language === "eng" || language === "english" || language.startsWith("en-") || language.startsWith("en_");
	if (params.hasConfiguredPrompt || isExplicitEnglish) return params.prompt;
}
async function resolveProviderExecutionAuth(params) {
	const providerConfig = findNormalizedProviderValue(params.cfg.models?.providers, params.providerId);
	const literalApiKey = resolveLiteralProviderApiKey({
		cfg: params.cfg,
		providerId: params.providerId
	});
	if (literalApiKey) return {
		kind: "api-key",
		apiKeys: collectProviderApiKeysForExecution({
			provider: params.providerId,
			primaryApiKey: literalApiKey
		}),
		source: `models.providers.${params.providerId}.apiKey`
	};
	const resolveMediaProviderAuth = () => {
		const context = {
			config: params.cfg,
			provider: params.providerId,
			providerConfig
		};
		const providerAuth = params.provider?.resolveAuth?.(context);
		if (!providerAuth) {
			const syntheticAuth = params.provider?.resolveSyntheticAuth?.(context);
			const syntheticApiKey = syntheticAuth?.apiKey.trim();
			const syntheticSource = syntheticAuth?.source;
			return syntheticApiKey ? {
				kind: "api-key",
				apiKeys: collectProviderApiKeysForExecution({
					provider: params.providerId,
					primaryApiKey: syntheticApiKey
				}),
				source: syntheticSource
			} : void 0;
		}
		if (providerAuth.kind === "none") return {
			kind: "none",
			source: providerAuth.source
		};
		const apiKey = providerAuth.apiKey.trim();
		if (!apiKey) return;
		return {
			kind: "api-key",
			apiKeys: collectProviderApiKeysForExecution({
				provider: params.providerId,
				primaryApiKey: apiKey
			}),
			source: providerAuth.source
		};
	};
	const { isProviderAuthError, requireApiKey, resolveApiKeyForProviderCore } = await loadModelAuth();
	try {
		const auth = await resolveApiKeyForProviderCore({
			provider: params.providerId,
			cfg: params.cfg,
			profileId: params.entry.profile,
			preferredProfile: params.entry.preferredProfile,
			agentDir: params.agentDir,
			workspaceDir: params.workspaceDir,
			modelApi: resolveOpenAiAudioAuthModelApi({
				capability: params.capability,
				providerId: params.providerId
			})
		});
		const apiKey = requireApiKey(auth, params.providerId);
		return {
			kind: "api-key",
			apiKeys: collectProviderApiKeysForExecution({
				provider: params.providerId,
				primaryApiKey: apiKey
			}),
			source: auth.source
		};
	} catch (err) {
		if (!isProviderAuthError(err, "missing-provider-auth") && !isProviderAuthError(err, "missing-api-key")) throw err;
		const mediaAuth = resolveMediaProviderAuth();
		if (mediaAuth) return mediaAuth;
		throw err;
	}
}
function resolveProviderRequestContext(params) {
	const providerConfig = findNormalizedProviderValue(params.cfg.models?.providers, params.providerId);
	const baseUrl = params.entry.baseUrl ?? params.config?.baseUrl ?? providerConfig?.baseUrl;
	const mergedHeaders = {
		...sanitizeProviderHeaders(providerConfig?.headers),
		...sanitizeProviderHeaders(params.config?.headers),
		...sanitizeProviderHeaders(params.entry.headers)
	};
	return {
		baseUrl,
		headers: Object.keys(mergedHeaders).length > 0 ? mergedHeaders : void 0,
		request: mergeModelProviderRequestOverrides(sanitizeConfiguredModelProviderRequest(providerConfig?.request), sanitizeConfiguredProviderRequest(params.config?.request), sanitizeConfiguredProviderRequest(params.entry.request))
	};
}
/** Formats a compact operator-facing summary of a media-understanding decision. */
function formatDecisionSummary(decision) {
	const attachments = Array.isArray(decision.attachments) ? decision.attachments : [];
	const total = attachments.length;
	const success = attachments.filter((entry) => entry?.chosen?.outcome === "success").length;
	const chosen = attachments.find((entry) => entry?.chosen)?.chosen;
	const provider = typeof chosen?.provider === "string" ? chosen.provider.trim() : void 0;
	const model = typeof chosen?.model === "string" ? chosen.model.trim() : void 0;
	const modelLabel = provider ? model && model !== provider ? `${provider}/${model}` : provider : void 0;
	const backendLabel = chosen?.observedBackend ? ` observed=${chosen.observedBackend}` : chosen?.requestedBackend ? ` requested=${chosen.requestedBackend}` : "";
	const shortReason = summarizeDecisionReason(findDecisionReason(decision, decision.outcome === "failed" ? "failed" : void 0));
	const countLabel = total > 0 ? ` (${success}/${total})` : "";
	const viaLabel = modelLabel ? ` via ${modelLabel}${backendLabel}` : "";
	const reasonLabel = shortReason ? ` reason=${shortReason}` : "";
	return `${decision.capability}: ${decision.outcome}${countLabel}${viaLabel}${reasonLabel}`;
}
/** Returns the first non-empty attempt reason, optionally filtered by outcome. */
function findDecisionReason(decision, outcome) {
	const attachments = Array.isArray(decision.attachments) ? decision.attachments : [];
	for (const attachment of attachments) {
		const attempts = Array.isArray(attachment?.attempts) ? attachment.attempts : [];
		for (const attempt of attempts) {
			if (outcome && attempt.outcome !== outcome) continue;
			if (typeof attempt.reason !== "string" || attempt.reason.trim().length === 0) continue;
			return attempt.reason;
		}
	}
}
/** Trims provider/runtime error prefixes into a stable human-readable reason. */
function normalizeDecisionReason(reason) {
	const trimmed = typeof reason === "string" ? reason.trim() : "";
	if (!trimmed) return;
	return trimmed.replace(/^Error:\s*/i, "").trim() || void 0;
}
/** Produces the short reason token used in status and decision summary output. */
function summarizeDecisionReason(reason) {
	const normalized = normalizeDecisionReason(reason);
	if (!normalized) return;
	return normalized.split(":")[0]?.trim() || void 0;
}
function assertMinAudioSize(params) {
	if (params.size >= 1024) return;
	throw new MediaUnderstandingSkipError("tooSmall", `Audio attachment ${params.attachmentIndex + 1} is too small (${params.size} bytes, minimum ${MIN_AUDIO_FILE_BYTES})`);
}
/**
* Build an actionable hint suffix for "provider not available" errors.
*
* Restricts the hint to ids that are owned by the official external
* provider catalog — NOT the combined channel/plugin catalog — so a media
* provider id like `feishu` (an official channel, not a media provider)
* never emits a misleading install hint from a media-provider error.
*
* Tier 1: provider id is owned by an official external provider entry that
*   declares a `contracts.mediaUnderstandingProviders` block listing the
*   id — emit the catalog-backed install + registry refresh + doctor fix
*   commands.
* Tier 2: empty string — keeps the legacy message verbatim for ids that
*   are not in the provider catalog (channel ids, plugin ids, unknown
*   ids, internal ids, etc.). Newly externalized media providers must
*   register with the official external provider catalog to receive the
*   actionable hint.
*/
function formatMissingProviderHint(providerId) {
	const trimmed = providerId.trim();
	if (!trimmed) return "";
	if (!listOfficialExternalProviderCatalogEntries().find((entry) => {
		return (getOfficialExternalPluginCatalogManifest(entry)?.contracts?.mediaUnderstandingProviders ?? []).some((mediaId) => mediaId === trimmed);
	})) return "";
	const catalogHint = resolveOfficialExternalPluginRepairHint(trimmed);
	if (!catalogHint) return "";
	return ` Install the official external plugin with: ${formatCliCommand(catalogHint.installCommand)}, then run ${formatCliCommand("openclaw plugins registry --refresh")} and stop and start the gateway service, or run ${formatCliCommand(catalogHint.doctorFixCommand)} to repair automatically.`;
}
/** Executes one provider-backed media-understanding entry for one attachment. */
async function runProviderEntry(params) {
	// media-prefetch-v1: provider (API) entries run in the reply lane only, never twice
	if (mediaCliPrefetchState().als.getStore()?.prefetch) throw new Error("media prefetch: provider entries run in the reply lane only");
	const { entry, capability, cfg } = params;
	const providerIdRaw = entry.provider?.trim();
	if (!providerIdRaw) throw new Error(`Provider entry missing provider for ${capability}`);
	const providerId = normalizeMediaProviderId(providerIdRaw);
	const requestProviderId = normalizeMediaExecutionProviderId(providerIdRaw);
	assertRuntimeMediaRequestSecretOwnerAvailable({
		capability,
		entry
	});
	if (params.secretOwnerId) assertSecretOwnerAvailable("capability", params.secretOwnerId);
	const { maxBytes, maxChars, timeoutMs, prompt, hasConfiguredPrompt } = resolveEntryRunOptions({
		capability,
		entry,
		cfg,
		config: params.config
	});
	if (capability === "image") {
		if (!params.agentDir) throw new Error("Image understanding requires agentDir");
		const modelId = entry.model?.trim();
		if (!modelId) throw new Error("Image understanding requires model id");
		const media = await params.cache.getBuffer({
			attachmentIndex: params.attachmentIndex,
			maxBytes,
			timeoutMs
		});
		const normalizedMedia = await normalizeImageDescriptionInput({
			buffer: media.buffer,
			fileName: media.fileName,
			mime: media.mime,
			maxBytes
		});
		const requestOverrides = resolveMediaRequestOverrides(params.config);
		const provider = getMediaUnderstandingProvider(requestProviderId, params.providerRegistry);
		const imageInput = {
			buffer: normalizedMedia.buffer,
			fileName: media.fileName,
			mime: normalizedMedia.mime,
			model: modelId,
			provider: requestProviderId,
			prompt: requestOverrides.prompt ?? prompt,
			timeoutMs,
			profile: entry.profile,
			preferredProfile: entry.preferredProfile,
			agentId: params.agentId,
			agentDir: params.agentDir,
			workspaceDir: params.workspaceDir,
			cfg: params.cfg
		};
		const result = await (provider?.describeImage ?? describeImageWithModel)(imageInput);
		return ok({
			kind: "image.description",
			attachmentIndex: params.attachmentIndex,
			text: trimOutput(result.text, maxChars),
			provider: requestProviderId,
			model: result.model ?? modelId
		});
	}
	const provider = getMediaUnderstandingProvider(providerId, params.providerRegistry);
	if (!provider) throw new Error(`Media provider not available: ${providerId}${formatMissingProviderHint(providerId)}`);
	const fetchFn = resolveProxyFetchFromEnv();
	if (capability === "audio") {
		if (!provider.transcribeAudio && !provider.transcribeAudioWithContext) throw new Error(`Audio transcription provider "${providerId}" not available.`);
		const requestOverrides = resolveMediaRequestOverrides(params.config);
		const media = await params.cache.getBuffer({
			attachmentIndex: params.attachmentIndex,
			maxBytes,
			timeoutMs
		});
		assertMinAudioSize({
			size: media.size,
			attachmentIndex: params.attachmentIndex
		});
		const audioLanguage = requestOverrides.language ?? entry.language ?? params.config?.language;
		const audioPrompt = requestOverrides.prompt ?? resolveAudioProviderPrompt({
			prompt,
			hasConfiguredPrompt,
			language: audioLanguage
		});
		const transport = resolveProviderRequestContext({
			providerId,
			cfg,
			entry,
			config: params.config
		});
		const providerQuery = resolveProviderQuery({
			providerId,
			config: params.config,
			entry
		});
		const model = entry.model?.trim() || (await import("./defaults-C3EWiTge.js")).resolveDefaultMediaModel({
			cfg,
			providerId,
			capability: "audio",
			workspaceDir: params.workspaceDir
		}) || entry.model;
		const input = {
			buffer: media.buffer,
			fileName: media.fileName,
			mime: media.mime,
			...transport,
			model,
			language: audioLanguage,
			prompt: audioPrompt,
			query: providerQuery,
			timeoutMs,
			fetchFn
		};
		let result;
		if (provider.transcribeAudioWithContext) {
			const attempt = await provider.transcribeAudioWithContext({
				...input,
				cfg,
				agentDir: params.agentDir,
				workspaceDir: params.workspaceDir,
				profile: entry.profile,
				preferredProfile: entry.preferredProfile
			});
			if (!attempt.ok) return attempt;
			result = attempt.value;
		} else {
			const transcribeAudio = expectDefined(provider.transcribeAudio, "audio transcription callback");
			const auth = await resolveProviderExecutionAuth({
				capability,
				providerId,
				provider,
				cfg,
				entry,
				agentDir: params.agentDir,
				workspaceDir: params.workspaceDir
			});
			const buildRequest = (requestAuth) => ({
				...input,
				apiKey: requestAuth.kind === "api-key" ? requestAuth.apiKey : CUSTOM_LOCAL_AUTH_MARKER,
				auth: requestAuth.kind === "api-key" ? {
					kind: "api-key",
					apiKey: requestAuth.apiKey,
					source: auth.source
				} : {
					kind: "none",
					source: auth.source ?? `provider:${providerId}`
				}
			});
			result = auth.kind === "api-key" ? await executeWithApiKeyRotation({
				provider: providerId,
				apiKeys: auth.apiKeys,
				transientRetry: providerOperationRetryConfig("read"),
				execute: async (apiKey) => transcribeAudio(buildRequest({
					kind: "api-key",
					apiKey
				}))
			}) : await transcribeAudio(buildRequest({ kind: "none" }));
		}
		return ok({
			kind: "audio.transcription",
			attachmentIndex: params.attachmentIndex,
			text: trimOutput(result.text, maxChars),
			provider: providerId,
			model: result.model ?? model
		});
	}
	if (!provider.describeVideo) throw new Error(`Video understanding provider "${providerId}" not available.`);
	const describeVideo = provider.describeVideo;
	const media = await params.cache.getBuffer({
		attachmentIndex: params.attachmentIndex,
		maxBytes,
		timeoutMs
	});
	const estimatedBase64Bytes = estimateBase64Size(media.size);
	const maxBase64Bytes = resolveVideoMaxBase64Bytes(maxBytes);
	if (estimatedBase64Bytes > maxBase64Bytes) throw new MediaUnderstandingSkipError("maxBytes", `Video attachment ${params.attachmentIndex + 1} base64 payload ${estimatedBase64Bytes} exceeds ${maxBase64Bytes}`);
	const auth = await resolveProviderExecutionAuth({
		capability,
		providerId,
		provider,
		cfg,
		entry,
		agentDir: params.agentDir,
		workspaceDir: params.workspaceDir
	});
	const { baseUrl, headers, request } = resolveProviderRequestContext({
		providerId,
		cfg,
		entry,
		config: params.config
	});
	const authSource = auth.source ?? `provider:${providerId}`;
	const model = entry.model?.trim() || (await import("./defaults-C3EWiTge.js")).resolveDefaultMediaModel({
		cfg,
		providerId,
		capability: "video",
		workspaceDir: params.workspaceDir,
		providerRegistry: params.providerRegistry
	}) || entry.model;
	const buildRequest = (requestAuth) => ({
		buffer: media.buffer,
		fileName: media.fileName,
		mime: media.mime,
		apiKey: requestAuth.kind === "api-key" ? requestAuth.apiKey : CUSTOM_LOCAL_AUTH_MARKER,
		auth: requestAuth.kind === "api-key" ? {
			kind: "api-key",
			apiKey: requestAuth.apiKey,
			source: auth.source
		} : {
			kind: "none",
			source: authSource
		},
		baseUrl,
		headers,
		request,
		model,
		prompt,
		timeoutMs,
		fetchFn
	});
	const result = auth.kind === "api-key" ? await executeWithApiKeyRotation({
		provider: providerId,
		apiKeys: auth.apiKeys,
		transientRetry: providerOperationRetryConfig("read"),
		execute: (apiKey) => describeVideo(buildRequest({
			kind: "api-key",
			apiKey
		}))
	}) : await describeVideo(buildRequest({ kind: "none" }));
	return ok({
		kind: "video.description",
		attachmentIndex: params.attachmentIndex,
		text: trimOutput(result.text, maxChars),
		provider: providerId,
		model: result.model ?? model
	});
}
/** Executes one CLI-backed media-understanding entry for one attachment. */
//#region media-prefetch-v1 shared state
function mediaCliPrefetchState() {
	const stateKey = Symbol.for("openclaw.mediaCliPrefetch.v1");
	let state = globalThis[stateKey];
	if (!state) {
		const { AsyncLocalStorage } = process.getBuiltinModule("node:async_hooks");
		state = {
			als: new AsyncLocalStorage(),
			entries: /* @__PURE__ */ new Map(),
			pending: /* @__PURE__ */ new Map(),
			active: 0,
			queue: [],
			log: void 0
		};
		globalThis[stateKey] = state;
	}
	return state;
}
/** Media of an inbound context: portable media facts (what media understanding reads) plus legacy fields. */
function mediaCliPrefetchMedia(ctx) {
	const facts = Array.isArray(ctx?.media) ? ctx.media : [];
	const paths = [...facts.map((fact) => fact?.path ?? fact?.url), ...Array.isArray(ctx?.MediaPaths) ? ctx.MediaPaths : [], ctx?.MediaPath].filter((p) => typeof p === "string" && p !== "");
	const types = [...facts.flatMap((fact) => [fact?.contentType, fact?.kind]), ...Array.isArray(ctx?.MediaTypes) ? ctx.MediaTypes : [], ctx?.MediaType].filter((t) => typeof t === "string" && t !== "");
	return { paths: [...new Set(paths)].sort(), types };
}
function mediaCliPrefetchMessageKey(ctx) {
	return JSON.stringify([ctx?.SessionKey ?? "", ctx?.MessageSid ?? "", mediaCliPrefetchMedia(ctx).paths]);
}
//#endregion media-prefetch-v1 shared state
//#region media-prefetch-v1 runner
const MEDIA_CLI_PREFETCH_TTL_MS = 600000;
const MEDIA_CLI_PREFETCH_LANE_WAIT_MS = 3000;
function mediaCliPrefetchEnabled(env = process.env) {
	return env.OPENCLAW_MEDIA_PREFETCH !== "0";
}
function mediaCliPrefetchConcurrency(env = process.env) {
	const value = Number(env.OPENCLAW_MEDIA_PREFETCH_CONCURRENCY);
	return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 3;
}
/** Runs at most mediaCliPrefetchConcurrency() prefetched CLI runs at once, the rest wait in order. */
function mediaCliPrefetchLimit(state, run) {
	return new Promise((resolve, reject) => {
		const start = () => {
			state.active += 1;
			Promise.resolve().then(run).then(resolve, reject).finally(() => {
				state.active -= 1;
				state.queue.shift()?.();
			});
		};
		if (state.active < mediaCliPrefetchConcurrency()) start();
		else state.queue.push(start);
	});
}
/** Same CLI, same arguments (temp output dir normalised), same limits, same file bytes, same media config. */
function mediaCliPrefetchKey(params) {
	const argv = params.argv.map((part) => params.outputDir ? String(part).split(params.outputDir).join("{{OutputDir}}") : String(part));
	return process.getBuiltinModule("node:crypto").createHash("sha256").update(JSON.stringify({
		capability: params.capability,
		argv,
		timeoutMs: params.timeoutMs,
		maxChars: params.maxChars,
		size: params.size,
		mtimeMs: params.mtimeMs,
		media: params.mediaConfig ?? null
	})).digest("hex");
}
function mediaCliPrefetchPurge(state, now = Date.now()) {
	for (const [key, entry] of state.entries) if (now - entry.at > MEDIA_CLI_PREFETCH_TTL_MS) state.entries.delete(key);
}
function mediaCliPrefetchLog(state, fields) {
	state.log?.info(`[media-prefetch.1] ${JSON.stringify(fields)}`);
}
/**
* runCliEntry, after the argv is resolved. Prefetch scope: start (or join) the identical call and
* return its result. Reply lane: use a prefetched result for this exact call if there is one,
* waiting briefly for a prefetch of the same message that has not registered yet. undefined: run.
*/
async function mediaCliPrefetchLookup(params) {
	const state = mediaCliPrefetchState();
	const store = state.als.getStore();
	if (store?.bypass || !mediaCliPrefetchEnabled()) return { handled: false };
	let key;
	try {
		const stat = await fs$1.stat(params.mediaPath);
		key = mediaCliPrefetchKey({
			capability: params.capability,
			argv: params.argv,
			outputDir: params.outputDir,
			timeoutMs: params.timeoutMs,
			maxChars: params.maxChars,
			size: stat.size,
			mtimeMs: stat.mtimeMs,
			mediaConfig: params.cfg?.tools?.media
		});
	} catch {
		key = void 0;
	}
	if (store?.prefetch) {
		if (!key || params.capability === "image") throw new Error("media prefetch: entry is not prefetched");
		mediaCliPrefetchPurge(state);
		let entry = state.entries.get(key);
		if (!entry) {
			entry = {
				at: Date.now(),
				promise: mediaCliPrefetchLimit(state, () => state.als.run({ bypass: true }, () => runCliEntry(params.entryParams)))
			};
			entry.promise.catch(() => {});
			state.entries.set(key, entry);
			store.keys?.add(key);
			mediaCliPrefetchLog(state, { phase: "started", capability: params.capability });
		}
		store.onRegistered?.(params.capability);
		return { handled: true, value: await entry.promise };
	}
	if (!key) return { handled: false };
	let entry = state.entries.get(key);
	if (!entry) {
		const pending = state.pending.get(mediaCliPrefetchMessageKey(params.ctx));
		const registered = pending?.registered?.get(params.capability);
		if (registered) {
			await Promise.race([registered, new Promise((resolve) => setTimeout(resolve, MEDIA_CLI_PREFETCH_LANE_WAIT_MS).unref?.())]);
			entry = state.entries.get(key);
		}
	}
	if (!entry) return { handled: false };
	state.entries.delete(key);
	const lookupAt = Date.now();
	try {
		const value = await entry.promise;
		mediaCliPrefetchLog(state, { phase: "hit", capability: params.capability, aheadMs: lookupAt - entry.at, waitedMs: Date.now() - lookupAt });
		return { handled: true, value };
	} catch (error) {
		mediaCliPrefetchLog(state, { phase: "fallback", capability: params.capability, error: error instanceof Error ? error.name : typeof error });
		return { handled: false };
	}
}
//#endregion media-prefetch-v1 runner
async function runCliEntry(params) {
	const { entry, capability, cfg, ctx } = params;
	const attachmentIndex = params.attachment.index;
	const command = entry.command?.trim();
	const args = entry.args ?? [];
	if (!command) throw new Error(`CLI entry missing command for ${capability}`);
	const requestOverrides = resolveMediaRequestOverrides(params.config);
	const language = requestOverrides.language ?? entry.language ?? params.config?.language;
	const { maxBytes, maxChars, timeoutMs, prompt } = resolveEntryRunOptions({
		capability,
		entry,
		cfg,
		config: params.config
	});
	const pathResult = await params.cache.getPath({
		attachmentIndex,
		maxBytes,
		timeoutMs
	});
	if (capability === "audio") assertMinAudioSize({
		size: (await fs$1.stat(pathResult.path)).size,
		attachmentIndex
	});
	const outputDir = await fs$1.mkdtemp(path.join(resolvePreferredOpenClawTmpDir(), "openclaw-media-cli-"));
	try {
		const mediaPath = await resolveCliMediaPath({
			capability,
			command,
			mediaPath: pathResult.path,
			outputDir
		});
		const outputBase = path.join(outputDir, path.parse(mediaPath).name);
		const templCtx = {
			...ctx,
			AttachmentPath: mediaPath,
			AttachmentUrl: params.attachment.url ?? params.attachment.path ?? mediaPath,
			AttachmentContentType: params.attachment.mime,
			AttachmentDir: path.dirname(mediaPath),
			AttachmentIndex: params.attachment.index,
			MediaPath: mediaPath,
			MediaUrl: params.attachment.url ?? params.attachment.path ?? mediaPath,
			MediaType: params.attachment.mime,
			MediaDir: path.dirname(mediaPath),
			OutputDir: outputDir,
			OutputBase: outputBase,
			Prompt: requestOverrides.prompt ?? prompt,
			...capability === "audio" && language ? { Language: language } : {},
			MaxChars: maxChars
		};
		for (const key of [
			"MediaPaths",
			"MediaUrls",
			"MediaTypes",
			"MediaWorkspaceDir",
			"MediaTranscribedIndexes",
			"MediaStaged"
		]) delete templCtx[key];
		const argv = [command, ...args].map((part, index) => index === 0 ? part : applyTemplate(part, templCtx));
		// media-prefetch-v1: a prefetched run of this exact call, or start one in a prefetch scope
		const mediaPrefetch = await mediaCliPrefetchLookup({
			entryParams: params,
			ctx,
			cfg,
			capability,
			argv,
			outputDir,
			mediaPath,
			timeoutMs,
			maxChars
		});
		if (mediaPrefetch.handled) return mediaPrefetch.value;
		if (shouldLogVerbose()) logVerbose(`Media understanding via CLI: ${argv.join(" ")}`);
		const { stdout, stderr } = await runExec(expectDefined(argv[0], "argv entry at 0"), argv.slice(1), {
			timeoutMs,
			maxBuffer: CLI_OUTPUT_MAX_BUFFER,
			cwd: isAntigravityCliCommand(command) ? path.dirname(mediaPath) : void 0
		});
		const requestedBackend = capability === "audio" ? resolveRequestedLocalAudioBackend({
			command,
			args: argv.slice(1)
		}) : void 0;
		const observedBackend = capability === "audio" ? recordLocalAudioBackendObservation({
			command,
			args: argv.slice(1),
			output: `${stderr ?? ""}\n${stdout}`
		}) : void 0;
		const text = trimOutput(await resolveCliOutput({
			command,
			args: argv.slice(1),
			stdout,
			mediaPath
		}), maxChars);
		if (!text) return null;
		return {
			kind: capability === "audio" ? "audio.transcription" : `${capability}.description`,
			attachmentIndex,
			text,
			provider: capability === "audio" ? commandBase(command) : "cli",
			model: command,
			...requestedBackend ? { requestedBackend } : {},
			...observedBackend ? { observedBackend } : {}
		};
	} finally {
		await fs$1.rm(outputDir, {
			recursive: true,
			force: true
		}).catch(() => {});
	}
}
//#endregion
export { runCliEntry as a, normalizeImageDescriptionInput as c, selectAttachments as d, normalizeDecisionReason as i, MediaAttachmentCache as l, findDecisionReason as n, runProviderEntry as o, formatDecisionSummary as r, summarizeDecisionReason as s, buildModelDecision as t, isMediaUnderstandingSkipError as u };
