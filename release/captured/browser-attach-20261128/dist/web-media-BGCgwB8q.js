import { b as uniqueValues } from "./string-normalization-DiSb4JeN.js";
import { c as resolveUserPath } from "./home-dir-BPhrG-aM.js";
import { t as FsSafeError } from "./fs-safe-Cdu9fYG_.js";
import { n as isNotFoundPathError, r as isPathInside } from "./path-guards-Cp-mGr3-.js";
import "./utils-D3A1hGii.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { n as resolvePreferredOpenClawTmpDir } from "./tmp-openclaw-dir-DnyL0lW9.js";
import { i as getNodeSqliteKysely, n as executeSqliteQuerySync, r as executeSqliteQueryTakeFirstSync } from "./kysely-sync-DKYGT267.js";
import { i as openOpenClawStateDatabase, s as runOpenClawStateWriteTransaction } from "./openclaw-state-db-Bh3Bq87y.js";
import { t as hasHttpUrlPrefix } from "./url-protocol-OU3K-ySz.js";
import { i as shouldLogVerbose, r as logVerbose } from "./globals-Dl0PaL2u.js";
import { l as getActivePluginHttpRouteRegistry } from "./runtime-MupoouIC.js";
import { a as maxBytesForKind } from "./constants-DUxuqQz8.js";
import { n as extnameFromAnyPath, t as basenameFromAnyPath } from "./file-name-CKnWacTs.js";
import { d as normalizeMimeType, i as getFileExtension, l as kindFromMime, n as detectMime, r as extensionForMime, u as mimeTypeFromFilePath } from "./mime-BxTGWg2e.js";
import { d as readImageMetadataFromHeader, f as readImageProbeFromHeader, s as createImageProcessor } from "./image-ops-CkENcywK.js";
import { o as extractOriginalFilename, s as getMediaDir } from "./store-D1sR82up.js";
import { r as readRemoteMediaBuffer } from "./fetch-DLi8QLoe.js";
import { t as chunkItems } from "./chunk-items-2QWieLm-.js";
import { a as safeFileURLToPath, t as assertNoWindowsNetworkPath } from "./local-file-access-B1HKoQAc.js";
import { o as resolveInboundMediaReference, t as MediaReferenceError } from "./media-reference-D2cwQT4h.js";
import "./media-services-BySSkTCE.js";
import { n as readOutboundMediaFile } from "./bounded-read-file-BXBH3Nms.js";
import { a as readLocalMediaFile, n as LocalMediaAccessError, r as assertLocalMediaAllowed, t as HostReadMediaTypeError } from "./local-media-access-CQzkadzN.js";
import { i as resolveCanvasHttpPathToLocalPath } from "./documents-CKeE42FS.js";
import path from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
//#region src/media/web-media.ts
async function resolveMediaStoreUriToPath(mediaUrl) {
	if (!/^media:\/\//i.test(mediaUrl)) return null;
	try {
		return (await resolveInboundMediaReference(mediaUrl))?.physicalPath ?? null;
	} catch (err) {
		if (err instanceof MediaReferenceError) throw new LocalMediaAccessError(err.code, err.message, { cause: err });
		throw err;
	}
}
async function resolveHostedPluginMediaUrl(mediaUrl) {
	const registry = getActivePluginHttpRouteRegistry();
	for (const entry of registry?.hostedMediaResolvers ?? []) try {
		const resolved = await entry.resolver(mediaUrl);
		if (typeof resolved === "string" && resolved.trim()) return resolved;
	} catch (err) {
		if (shouldLogVerbose()) logVerbose(`Hosted media resolver failed (${entry.pluginId ?? "unknown"}): ${formatErrorMessage(err)}`);
	}
	return null;
}
function resolveWebMediaOptions(params) {
	if (typeof params.maxBytesOrOptions === "number" || params.maxBytesOrOptions === void 0) return {
		maxBytes: params.maxBytesOrOptions,
		optimizeImages: params.optimizeImages,
		ssrfPolicy: params.options?.ssrfPolicy,
		localRoots: params.options?.localRoots
	};
	return {
		...params.maxBytesOrOptions,
		optimizeImages: params.optimizeImages ? params.maxBytesOrOptions.optimizeImages ?? true : false
	};
}
const IMAGE_OPTIMIZE_HEADROOM_FACTOR = 4;
const HEIC_MIME_RE = /^image\/hei[cf]$/i;
const HEIC_EXT_RE = /\.(heic|heif)$/i;
const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/;
const HOST_READ_ALLOWED_DOCUMENT_MIMES = /* @__PURE__ */ new Set([
	"application/msword",
	"application/pdf",
	"application/vnd.ms-excel",
	"application/vnd.ms-powerpoint",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/gzip",
	"application/x-7z-compressed",
	"application/x-tar",
	"application/zip",
	"text/csv",
	"text/markdown",
	"text/plain",
	"application/json",
	"application/yaml"
]);
const HOST_READ_TEXT_PLAIN_ALIASES = /* @__PURE__ */ new Set([
	"text/csv",
	"text/markdown",
	"text/plain",
	"application/json",
	"application/yaml"
]);
const HOST_READ_DECLARED_TEXT_MIMES = /* @__PURE__ */ new Set([...HOST_READ_TEXT_PLAIN_ALIASES, "text/html"]);
const HOST_READ_DECLARED_TEXT_ERROR = "hostReadCapability permits only validated plain-text documents and trusted generated HTML reports for local reads";
const HOST_READ_TEXT_PLAIN_EXTENSION_BY_MIME = { "text/plain": [".txt"] };
const MB = 1048576;
function stripLegacyMediaDirectivePrefix(mediaUrl) {
	if (/^\s*media:\/\//i.test(mediaUrl)) return mediaUrl;
	return mediaUrl.replace(/^\s*MEDIA\s*:\s*/i, "");
}
function getTextStats(text) {
	if (!text) return { printableRatio: 0 };
	let printable = 0;
	let control = 0;
	for (const char of text) {
		const code = char.codePointAt(0) ?? 0;
		if (code === 9 || code === 10 || code === 13 || code === 32) {
			printable += 1;
			continue;
		}
		if (code < 32 || code >= 127 && code <= 159) {
			control += 1;
			continue;
		}
		printable += 1;
	}
	const total = printable + control;
	if (total === 0) return { printableRatio: 0 };
	return { printableRatio: printable / total };
}
function hasSingleByteTextShape(buffer) {
	if (buffer.length === 0) return true;
	let asciiText = 0;
	let control = 0;
	for (const byte of buffer) {
		if (byte === 9 || byte === 10 || byte === 13 || byte >= 32 && byte <= 126) {
			asciiText += 1;
			continue;
		}
		if (byte < 32 || byte === 127) control += 1;
	}
	const total = buffer.length;
	const highBytes = total - asciiText - control;
	return control === 0 && asciiText / total >= .7 && highBytes / total <= .3;
}
function decodeHostReadText(buffer) {
	if (buffer.length === 0) return "";
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
	} catch {
		if (!hasSingleByteTextShape(buffer)) return;
		return new TextDecoder("latin1").decode(buffer);
	}
}
function isValidatedHostReadText(buffer) {
	return getValidatedHostReadText(buffer) !== void 0;
}
function getValidatedHostReadText(buffer) {
	if (!buffer) return;
	if (buffer.length === 0) return "";
	const text = decodeHostReadText(buffer);
	if (text === void 0) return;
	const { printableRatio } = getTextStats(text);
	return printableRatio > .95 ? text : void 0;
}
function resolveLocalMediaFileName(filePath) {
	const fileName = basenameFromAnyPath(filePath) || void 0;
	return fileName && isPathInside(getMediaDir(), filePath) ? extractOriginalFilename(fileName) : fileName;
}
function hasHtmlDocumentShape(text) {
	const sample = text.trimStart().slice(0, 8192);
	return /^(?:<!doctype\s+html\b|<html\b)/iu.test(sample) || /<\/(?:html|body)>/iu.test(sample);
}
const TRUSTED_GENERATED_HTML_MARKER_VERSION = 1;
const TRUSTED_GENERATED_HTML_MARKER_KIND = "trusted-generated-html";
async function getTrustedGeneratedHtmlMarker(resolvedFilePath) {
	try {
		const { db } = openOpenClawStateDatabase();
		const row = executeSqliteQueryTakeFirstSync(db, getNodeSqliteKysely(db).selectFrom("outbound_media_provenance").select([
			"kind",
			"version",
			"sha256",
			"size_bytes"
		]).where("realpath", "=", resolvedFilePath));
		return row?.kind === TRUSTED_GENERATED_HTML_MARKER_KIND && row.version === TRUSTED_GENERATED_HTML_MARKER_VERSION ? {
			sha256: row.sha256,
			size: row.size_bytes
		} : void 0;
	} catch (error) {
		logVerbose(`trusted-html marker lookup failed (${resolvedFilePath}): ${formatErrorMessage(error)}`);
		return;
	}
}
/** workspace-html-attach-v1: the agent workspace as a trusted HTML root, unless it is the filesystem root or contains the OpenClaw config dir. */
async function resolveTrustedHtmlWorkspaceRoot(workspaceDir) {
	if (!workspaceDir || !path.isAbsolute(workspaceDir)) return;
	const [workspaceRoot, configDir] = await Promise.all([realpath(workspaceDir).catch(() => void 0), realpath(path.dirname(getMediaDir())).catch(() => path.resolve(path.dirname(getMediaDir())))]);
	if (!workspaceRoot || workspaceRoot === path.parse(workspaceRoot).root) return;
	if (isPathInside(workspaceRoot, configDir)) return;
	return workspaceRoot;
}
async function resolveTrustedGeneratedHostReadHtml(filePath, workspaceDir) {
	if (!filePath) return;
	const info = await lstat(filePath).catch(() => void 0);
	if (!info?.isFile() || info.isSymbolicLink() || info.nlink !== 1) return;
	const [resolvedFilePath, tmpRoot, outboundRoot, workspaceRoot] = await Promise.all([
		realpath(filePath).catch(() => void 0),
		realpath(resolvePreferredOpenClawTmpDir()).catch(() => void 0),
		realpath(path.join(getMediaDir(), "outbound")).catch(() => void 0),
		resolveTrustedHtmlWorkspaceRoot(workspaceDir)
	]);
	if (!resolvedFilePath) return;
	if (outboundRoot && isPathInside(outboundRoot, resolvedFilePath)) {
		const marker = await getTrustedGeneratedHtmlMarker(resolvedFilePath);
		return marker ? {
			source: "outbound",
			expectedSha256: marker.sha256,
			expectedSize: marker.size
		} : void 0;
	}
	if (tmpRoot && isPathInside(tmpRoot, resolvedFilePath)) return { source: "temp-root" };
	// workspace-html-attach-v1: HTML the agent wrote into its own workspace (decks, reports) is as trusted as temp-root output.
	return workspaceRoot && isPathInside(workspaceRoot, resolvedFilePath) ? { source: "workspace" } : void 0;
}
/** Records exact-byte provenance for a trusted generated HTML staged outbound. */
async function markTrustedGeneratedHtmlPath(filePath, contents) {
	const resolvedFilePath = await realpath(filePath);
	const outboundRoot = await realpath(path.join(getMediaDir(), "outbound")).catch(() => void 0);
	if (!outboundRoot || !isPathInside(outboundRoot, resolvedFilePath)) throw new Error(`markTrustedGeneratedHtmlPath: refusing path outside outbound staging: ${resolvedFilePath}`);
	const sha256 = createHash("sha256").update(contents).digest("hex");
	const sizeBytes = contents.length;
	const createdAtMs = Date.now();
	runOpenClawStateWriteTransaction(({ db }) => {
		executeSqliteQuerySync(db, getNodeSqliteKysely(db).insertInto("outbound_media_provenance").values({
			realpath: resolvedFilePath,
			kind: TRUSTED_GENERATED_HTML_MARKER_KIND,
			version: TRUSTED_GENERATED_HTML_MARKER_VERSION,
			sha256,
			size_bytes: sizeBytes,
			created_at_ms: createdAtMs
		}).onConflict((conflict) => conflict.column("realpath").doUpdateSet({
			kind: TRUSTED_GENERATED_HTML_MARKER_KIND,
			version: TRUSTED_GENERATED_HTML_MARKER_VERSION,
			sha256,
			size_bytes: sizeBytes,
			created_at_ms: createdAtMs
		})));
	});
}
/** Removes provenance whose staged regular file no longer exists. */
async function pruneStaleTrustedGeneratedHtmlMarkers() {
	const { db } = openOpenClawStateDatabase();
	const rows = executeSqliteQuerySync(db, getNodeSqliteKysely(db).selectFrom("outbound_media_provenance").select("realpath")).rows;
	const stale = [];
	for (const row of rows) {
		let info;
		try {
			info = await lstat(row.realpath);
		} catch (error) {
			if (isNotFoundPathError(error)) stale.push(row.realpath);
			else logVerbose(`trusted-html prune kept uninspectable marker (${row.realpath}): ${formatErrorMessage(error)}`);
			continue;
		}
		if (!info?.isFile() || info.isSymbolicLink() || info.nlink !== 1) stale.push(row.realpath);
	}
	if (stale.length === 0) return;
	runOpenClawStateWriteTransaction(({ db: writeDb }) => {
		for (const batch of chunkItems(stale, 500)) executeSqliteQuerySync(writeDb, getNodeSqliteKysely(writeDb).deleteFrom("outbound_media_provenance").where("realpath", "in", batch));
	});
	logVerbose(`trusted-html prune removed ${stale.length} stale marker(s)`);
}
function isTrustedGeneratedHostReadHtml(params) {
	const sniffedMime = normalizeMimeType(params.sniffedContentType);
	if (sniffedMime && sniffedMime !== "text/html") return false;
	if (!params.trustedGeneratedHtmlPath) return false;
	const text = getValidatedHostReadText(params.buffer);
	if (text === void 0 || !hasHtmlDocumentShape(text)) return false;
	if (params.trustedGeneratedHtmlPath.source === "temp-root" || params.trustedGeneratedHtmlPath.source === "workspace") return true;
	return params.buffer?.length === params.trustedGeneratedHtmlPath.expectedSize && createHash("sha256").update(params.buffer).digest("hex") === params.trustedGeneratedHtmlPath.expectedSha256;
}
function isAllowedHostReadTextAlias(mime, filePath) {
	if (!mime || !HOST_READ_TEXT_PLAIN_ALIASES.has(mime)) return false;
	const allowedExtensions = HOST_READ_TEXT_PLAIN_EXTENSION_BY_MIME[mime];
	if (!allowedExtensions) return true;
	const ext = getFileExtension(filePath);
	return ext !== void 0 && allowedExtensions.includes(ext);
}
function formatMb(bytes, digits = 2) {
	return (bytes / MB).toFixed(digits);
}
function formatCapLimit(label, cap, size) {
	return `${label} exceeds ${formatMb(cap, 0)}MB limit (got ${formatMb(size)}MB)`;
}
function formatCapReduce(label, cap, size) {
	return `${label} could not be reduced below ${formatMb(cap, 0)}MB (got ${formatMb(size)}MB)`;
}
function isHeicSource(opts) {
	if (opts.contentType && HEIC_MIME_RE.test(opts.contentType.trim())) return true;
	if (opts.fileName && HEIC_EXT_RE.test(opts.fileName.trim())) return true;
	return false;
}
function assertHostReadMediaAllowed(params) {
	const declaredMime = normalizeMimeType(mimeTypeFromFilePath(params.filePath));
	const normalizedMime = normalizeMimeType(params.contentType);
	if (declaredMime && HOST_READ_DECLARED_TEXT_MIMES.has(declaredMime)) {
		if (declaredMime === "text/html" && isTrustedGeneratedHostReadHtml({
			filePath: params.filePath,
			sniffedContentType: params.sniffedContentType,
			buffer: params.buffer,
			trustedGeneratedHtmlPath: params.trustedGeneratedHtmlPath
		})) return;
		if (isAllowedHostReadTextAlias(declaredMime, params.filePath) && !params.sniffedContentType && params.buffer && isValidatedHostReadText(params.buffer)) return;
		throw new HostReadMediaTypeError(HOST_READ_DECLARED_TEXT_ERROR);
	}
	const sniffedKind = kindFromMime(params.sniffedContentType);
	if (sniffedKind === "image" || sniffedKind === "audio" || sniffedKind === "video") return;
	const sniffedMime = normalizeMimeType(params.sniffedContentType);
	if (sniffedKind === "document" && sniffedMime && HOST_READ_ALLOWED_DOCUMENT_MIMES.has(sniffedMime)) return;
	if (sniffedMime === "application/x-cfb" && [
		".doc",
		".ppt",
		".xls"
	].includes(getFileExtension(params.filePath) ?? "")) return;
	if (!sniffedMime && normalizedMime && isAllowedHostReadTextAlias(normalizedMime, params.filePath) && params.buffer && isValidatedHostReadText(params.buffer)) return;
	if (params.kind === "document" && normalizedMime && HOST_READ_ALLOWED_DOCUMENT_MIMES.has(normalizedMime)) throw new HostReadMediaTypeError(`Host-local media sends require buffer-verified media/document types (got fallback ${normalizedMime}).`);
	throw new HostReadMediaTypeError(`Host-local media sends only allow buffer-verified images, audio, video, PDF, Office documents, archives, and validated plain-text documents (got ${sniffedMime ?? normalizedMime ?? "unknown"}).`);
}
function toImageFileName(fileName, mimeType) {
	if (!fileName) return;
	const trimmed = basenameFromAnyPath(fileName.trim());
	if (!trimmed) return fileName;
	const parsed = path.parse(trimmed);
	const ext = extensionForMime(mimeType);
	return mimeType !== "image/jpeg" && parsed.ext.toLowerCase() === ext ? fileName : path.format({
		dir: parsed.dir,
		name: parsed.name || trimmed,
		ext
	});
}
const DEFAULT_JPEG_SIDES = [
	2048,
	1536,
	1280,
	1024,
	800
];
const DEFAULT_JPEG_QUALITIES = [
	80,
	70,
	60,
	50,
	40
];
const DEFAULT_VISION_MAX_SIDE = 2048;
const LOW_IMAGE_SIDE_FALLBACKS = [
	640,
	512,
	384,
	256,
	192,
	128
];
function normalizeImageQualityPreference(value) {
	switch (value) {
		case "efficient":
		case "balanced":
		case "high": return value;
		default: return "auto";
	}
}
function squareLongSideForPixelBudget(pixelBudget) {
	return Math.floor(Math.sqrt(pixelBudget));
}
function positiveInteger(value) {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : void 0;
}
function effectiveImageQualityPreference(policy) {
	const preference = normalizeImageQualityPreference(policy?.quality);
	if (preference !== "auto") return preference;
	if (Math.max(1, Math.floor(policy?.imageCount ?? 1)) >= 6) return "efficient";
	return "balanced";
}
function maxSideForModel(model) {
	const maxSide = positiveInteger(model?.maxSidePx);
	const maxPixels = positiveInteger(model?.maxPixels);
	const hardLimits = [maxSide, maxPixels ? squareLongSideForPixelBudget(maxPixels) : void 0].filter((value) => value !== void 0);
	if (hardLimits.length > 0) return Math.min(...hardLimits);
	return positiveInteger(model?.preferredSidePx) ?? DEFAULT_VISION_MAX_SIDE;
}
function preferredSideForModel(model) {
	return positiveInteger(model?.preferredSidePx) ?? Math.min(maxSideForModel(model), DEFAULT_VISION_MAX_SIDE);
}
function policyModelSides(policy) {
	const models = policy?.models?.length ? policy.models : [void 0];
	const maxSide = Math.min(...models.map((model) => maxSideForModel(model)));
	const preferredSide = Math.min(...models.map((model) => preferredSideForModel(model)));
	return {
		maxSide,
		preferredSide: Math.min(preferredSide, maxSide)
	};
}
function sideForPreference(preference, policy) {
	const { maxSide, preferredSide } = policyModelSides(policy);
	switch (preference) {
		case "efficient": return Math.min(preferredSide, maxSide, 1280);
		case "balanced": return Math.min(preferredSide, maxSide);
		case "high": return maxSide;
	}
	return Math.min(preferredSide, maxSide);
}
function imageMaxBytesForPolicy(policy) {
	const maxBytes = policy?.models?.map((model) => positiveInteger(model.maxBytes)).filter((value) => value !== void 0);
	return maxBytes?.length ? Math.min(...maxBytes) : void 0;
}
function imageSatisfiesHardDimensionPolicy(buffer, policy) {
	const models = policy?.models ?? [];
	const hardMaxSides = models.map((model) => positiveInteger(model.maxSidePx)).filter((value) => value !== void 0);
	const hardMaxPixels = models.map((model) => positiveInteger(model.maxPixels)).filter((value) => value !== void 0);
	if (hardMaxSides.length === 0 && hardMaxPixels.length === 0) return true;
	const meta = readImageMetadataFromHeader(buffer);
	if (!meta) return false;
	const maxSide = Math.max(meta.width, meta.height);
	const pixels = meta.width * meta.height;
	return (hardMaxSides.length === 0 || maxSide <= Math.min(...hardMaxSides)) && (hardMaxPixels.length === 0 || pixels <= Math.min(...hardMaxPixels));
}
function assertImageSatisfiesHardDimensionPolicy(buffer, policy) {
	if (imageSatisfiesHardDimensionPolicy(buffer, policy)) return;
	const meta = readImageMetadataFromHeader(buffer);
	const detail = meta ? `: ${meta.width}x${meta.height}` : "";
	throw new Error(`Image dimensions exceed model image limits${detail}`);
}
function resolvePreservableOriginalImageContentType(params) {
	if (params.buffer.length > params.cap) return null;
	const declaredContentType = normalizeMimeType(params.contentType);
	const actualContentType = detectPreservableImageMime(params.buffer);
	if (!actualContentType) return null;
	const declaredPreservableContentType = isPreservableImageMime(declaredContentType) ? declaredContentType : void 0;
	if (declaredPreservableContentType && declaredPreservableContentType !== actualContentType) return null;
	if (declaredContentType?.startsWith("image/") && !declaredPreservableContentType) return null;
	const resolvedContentType = declaredPreservableContentType ?? actualContentType;
	if (isHeicSource({
		contentType: resolvedContentType,
		fileName: params.fileName
	})) return null;
	const meta = readImageMetadataFromHeader(params.buffer);
	if (!meta) return null;
	const preferredSide = resolveImageCompressionGrid(params.policy).sides[0] ?? DEFAULT_VISION_MAX_SIDE;
	if (Math.max(meta.width, meta.height) > preferredSide || !imageSatisfiesHardDimensionPolicy(params.buffer, params.policy)) return null;
	return resolvedContentType;
}
function detectPreservableImageMime(buffer) {
	const format = readImageProbeFromHeader(buffer)?.format;
	return format === "png" ? "image/png" : format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : null;
}
function isPreservableImageMime(contentType) {
	return contentType === "image/png" || contentType === "image/jpeg" || contentType === "image/webp";
}
/** Returns the stricter byte cap between caller limits and image compression policy limits. */
function effectiveImageBytesCap(baseCap, policy) {
	const policyCap = imageMaxBytesForPolicy(policy);
	if (baseCap === void 0) return policyCap;
	return policyCap === void 0 ? baseCap : Math.min(baseCap, policyCap);
}
function buildDescendingLadder(maxSide, values) {
	const normalizedMax = Math.max(1, Math.floor(maxSide));
	const ladder = uniqueValues([
		normalizedMax,
		...values,
		...LOW_IMAGE_SIDE_FALLBACKS
	].map((value) => Math.min(normalizedMax, value)).filter((value) => value > 0)).toSorted((a, b) => b - a);
	if (ladder.length > 1 || normalizedMax <= 1) return ladder;
	const fallbackLadder = [
		normalizedMax,
		Math.floor(normalizedMax * .75),
		Math.floor(normalizedMax * .5),
		Math.floor(normalizedMax * .25)
	];
	return uniqueValues(fallbackLadder.filter((value) => value > 0)).toSorted((a, b) => b - a);
}
/** Resolves the ordered max-side and JPEG quality search grid for an image compression policy. */
function resolveImageCompressionGrid(policy) {
	const preference = effectiveImageQualityPreference(policy);
	const side = sideForPreference(preference, policy);
	switch (preference) {
		case "efficient": return {
			sides: buildDescendingLadder(side, [1024, 800]),
			qualities: [
				70,
				60,
				50,
				40
			]
		};
		case "high": return {
			sides: buildDescendingLadder(side, [
				3072,
				2576,
				2048,
				1800,
				1536,
				1280,
				1024,
				800
			]),
			qualities: [
				92,
				85,
				78,
				70,
				62,
				52,
				42
			]
		};
		case "balanced": return {
			sides: buildDescendingLadder(side, [...DEFAULT_JPEG_SIDES]),
			qualities: [...DEFAULT_JPEG_QUALITIES]
		};
	}
	return {
		sides: buildDescendingLadder(side, [...DEFAULT_JPEG_SIDES]),
		qualities: [...DEFAULT_JPEG_QUALITIES]
	};
}
function logOptimizedImage(params) {
	if (!shouldLogVerbose()) return;
	if (params.optimized.optimizedSize >= params.originalSize) return;
	if (params.optimized.format === "png") {
		logVerbose(`Optimized PNG (preserving alpha) from ${formatMb(params.originalSize)}MB to ${formatMb(params.optimized.optimizedSize)}MB (side<=${params.optimized.resizeSide}px)`);
		return;
	}
	logVerbose(`Optimized media from ${formatMb(params.originalSize)}MB to ${formatMb(params.optimized.optimizedSize)}MB (side<=${params.optimized.resizeSide}px, q=${params.optimized.quality})`);
}
async function optimizeImageWithFallback(params) {
	const { buffer, cap } = params;
	const grid = resolveImageCompressionGrid(params.imageCompression);
	const optimized = await createImageProcessor().encode(buffer, {
		format: "auto",
		maxBytes: cap,
		opaque: { format: "jpeg" },
		transparent: { format: "png" },
		search: {
			maxSide: grid.sides,
			quality: grid.qualities
		},
		transparency: "auto"
	});
	if (optimized.chosen.transparency === "flattened" && shouldLogVerbose()) logVerbose(`Image transparency flattened to fit ${formatMb(cap, 0)}MB optimization budget`);
	return {
		buffer: optimized.data,
		optimizedSize: optimized.bytes,
		resizeSide: optimized.chosen.maxSide ?? Math.max(optimized.width, optimized.height),
		format: optimized.format,
		mimeType: optimized.mimeType,
		...optimized.chosen.quality === void 0 ? {} : { quality: optimized.chosen.quality },
		...optimized.chosen.compressionLevel === void 0 ? {} : { compressionLevel: optimized.chosen.compressionLevel }
	};
}
/** Optimizes image bytes for web-media delivery while preserving accepted original formats when possible. */
async function optimizeImageBufferForWebMedia(params) {
	const baseCap = params.maxBytes ?? maxBytesForKind("image");
	const cap = effectiveImageBytesCap(baseCap, params.imageCompression) ?? baseCap;
	if (params.contentType === "image/gif") {
		if (params.buffer.length > cap) throw new Error(formatCapLimit("GIF", cap, params.buffer.length));
		assertImageSatisfiesHardDimensionPolicy(params.buffer, params.imageCompression);
		return {
			buffer: params.buffer,
			contentType: params.contentType,
			kind: "image",
			fileName: params.fileName
		};
	}
	const meta = {
		contentType: params.contentType,
		fileName: params.fileName
	};
	const originalContentType = resolvePreservableOriginalImageContentType({
		buffer: params.buffer,
		cap,
		contentType: params.contentType,
		fileName: params.fileName,
		policy: params.imageCompression
	});
	if (originalContentType) return {
		buffer: params.buffer,
		contentType: originalContentType,
		kind: "image",
		fileName: params.fileName
	};
	const optimized = await optimizeImageWithFallback({
		buffer: params.buffer,
		cap,
		meta,
		imageCompression: params.imageCompression
	});
	logOptimizedImage({
		originalSize: params.buffer.length,
		optimized
	});
	if (optimized.buffer.length > cap) throw new Error(formatCapReduce("Media", cap, optimized.buffer.length));
	return {
		buffer: optimized.buffer,
		contentType: optimized.mimeType,
		kind: "image",
		fileName: toImageFileName(params.fileName, optimized.mimeType)
	};
}
async function loadWebMediaInternal(mediaUrlInput, options = {}) {
	let mediaUrl = mediaUrlInput;
	const { maxBytes, optimizeImages = true, ssrfPolicy, proxyUrl, fetchImpl, requestInit, readIdleTimeoutMs, trustExplicitProxyDns, workspaceDir, localRoots, inboundRoots, sandboxValidated = false, readFile: readFileOverride, hostReadCapability = false, imageCompression } = options;
	mediaUrl = stripLegacyMediaDirectivePrefix(mediaUrl);
	mediaUrl = await resolveMediaStoreUriToPath(mediaUrl) ?? mediaUrl;
	if (/^file:/iu.test(mediaUrl)) try {
		mediaUrl = safeFileURLToPath(mediaUrl);
	} catch (err) {
		throw new LocalMediaAccessError("invalid-file-url", err.message, { cause: err });
	}
	mediaUrl = resolveCanvasHttpPathToLocalPath(mediaUrl) ?? await resolveHostedPluginMediaUrl(mediaUrl) ?? mediaUrl;
	mediaUrl = stripLegacyMediaDirectivePrefix(mediaUrl);
	const optimizeAndClampImage = async (buffer, cap, meta) => {
		const originalSize = buffer.length;
		const optimized = await optimizeImageWithFallback({
			buffer,
			cap,
			meta,
			...imageCompression ? { imageCompression } : {}
		});
		logOptimizedImage({
			originalSize,
			optimized
		});
		if (optimized.buffer.length > cap) throw new Error(formatCapReduce("Media", cap, optimized.buffer.length));
		const fileName = toImageFileName(meta?.fileName, optimized.mimeType);
		return {
			buffer: optimized.buffer,
			contentType: optimized.mimeType,
			kind: "image",
			fileName
		};
	};
	const clampAndFinalize = async (params) => {
		const cap = maxBytes !== void 0 ? maxBytes : maxBytesForKind(params.kind ?? "document");
		if (params.kind === "image") {
			const imageCap = effectiveImageBytesCap(cap, imageCompression) ?? cap;
			const isGif = params.contentType === "image/gif";
			if (isGif || !optimizeImages) {
				if (params.buffer.length > imageCap) throw new Error(formatCapLimit(isGif ? "GIF" : "Media", imageCap, params.buffer.length));
				assertImageSatisfiesHardDimensionPolicy(params.buffer, imageCompression);
				return {
					buffer: params.buffer,
					contentType: params.contentType,
					kind: params.kind,
					fileName: params.fileName
				};
			}
			const originalContentType = resolvePreservableOriginalImageContentType({
				buffer: params.buffer,
				cap: imageCap,
				contentType: params.contentType,
				fileName: params.fileName,
				policy: imageCompression
			});
			if (originalContentType) return {
				buffer: params.buffer,
				contentType: originalContentType,
				kind: params.kind,
				fileName: params.fileName
			};
			return { ...await optimizeAndClampImage(params.buffer, imageCap, {
				contentType: params.contentType,
				fileName: params.fileName
			}) };
		}
		if (params.buffer.length > cap) throw new Error(formatCapLimit("Media", cap, params.buffer.length));
		return {
			buffer: params.buffer,
			contentType: params.contentType ?? void 0,
			kind: params.kind,
			fileName: params.fileName,
			...params.trustedGeneratedHtmlSource ? { trustedGeneratedHtmlSource: true } : {}
		};
	};
	const defaultSourceReadCap = maxBytesForKind("document");
	const imageOptimizeHeadroom = IMAGE_OPTIMIZE_HEADROOM_FACTOR * maxBytesForKind("image");
	const sourceReadCap = maxBytes === void 0 ? defaultSourceReadCap : optimizeImages ? Math.max(maxBytes, imageOptimizeHeadroom) : maxBytes;
	if (hasHttpUrlPrefix(mediaUrl)) {
		const { buffer, contentType, fileName } = await readRemoteMediaBuffer({
			url: mediaUrl,
			fetchImpl,
			requestInit,
			readIdleTimeoutMs,
			maxBytes: sourceReadCap,
			ssrfPolicy,
			dispatcherPolicy: proxyUrl ? {
				mode: "explicit-proxy",
				proxyUrl,
				allowPrivateProxy: true
			} : void 0,
			trustExplicitProxyDns
		});
		return await clampAndFinalize({
			buffer,
			contentType,
			kind: kindFromMime(contentType),
			fileName
		});
	}
	if (mediaUrl.startsWith("~")) mediaUrl = resolveUserPath(mediaUrl);
	if (workspaceDir && !path.isAbsolute(mediaUrl) && !WINDOWS_DRIVE_RE.test(mediaUrl)) mediaUrl = path.resolve(workspaceDir, mediaUrl);
	try {
		assertNoWindowsNetworkPath(mediaUrl, "Local media path");
	} catch (err) {
		throw new LocalMediaAccessError("network-path-not-allowed", err.message, { cause: err });
	}
	if ((sandboxValidated || localRoots === "any") && !readFileOverride) throw new LocalMediaAccessError("unsafe-bypass", "Refusing localRoots bypass without readFile override. Use sandboxValidated with readFile, or pass explicit localRoots.");
	if (readFileOverride && !(sandboxValidated || localRoots === "any")) await assertLocalMediaAllowed(mediaUrl, localRoots, { inboundRoots });
	const hostReadDeclaredMime = hostReadCapability ? normalizeMimeType(mimeTypeFromFilePath(mediaUrl)) : void 0;
	const htmlTrust = hostReadDeclaredMime === "text/html" ? await resolveTrustedGeneratedHostReadHtml(mediaUrl, workspaceDir) : void 0;
	if (hostReadDeclaredMime === "text/html" && !htmlTrust) throw new LocalMediaAccessError("path-not-allowed", HOST_READ_DECLARED_TEXT_ERROR);
	let data;
	if (readFileOverride) data = await readOutboundMediaFile(readFileOverride, mediaUrl, { maxBytes: sourceReadCap });
	else try {
		data = await readLocalMediaFile(mediaUrl, localRoots, {
			...inboundRoots ? { inboundRoots } : {},
			maxBytes: sourceReadCap
		});
	} catch (err) {
		if (err instanceof FsSafeError) {
			if (err.code === "too-large") throw new Error(`Media exceeds ${formatMb(sourceReadCap, 0)}MB limit`, { cause: err });
			if (err.code === "not-found") throw new LocalMediaAccessError("not-found", `Local media file not found: ${mediaUrl}`, { cause: err });
			if (err.code === "not-file") throw new LocalMediaAccessError("not-file", `Local media path is not a file: ${mediaUrl}`, { cause: err });
			if (err.code === "path-mismatch") throw new LocalMediaAccessError("path-not-allowed", `Local media path is not under an allowed directory: ${mediaUrl}`, { cause: err });
			throw new LocalMediaAccessError("invalid-path", `Local media path is not safe to read: ${mediaUrl}`, { cause: err });
		}
		throw err;
	}
	const sniffedMime = hostReadCapability ? await detectMime({ buffer: data }) : void 0;
	const mime = await detectMime({
		buffer: data,
		filePath: mediaUrl
	});
	const kind = kindFromMime(mime);
	if (hostReadCapability) assertHostReadMediaAllowed({
		sniffedContentType: sniffedMime,
		contentType: mime,
		filePath: mediaUrl,
		kind,
		buffer: data,
		trustedGeneratedHtmlPath: htmlTrust
	});
	let fileName = resolveLocalMediaFileName(mediaUrl);
	if (fileName && !extnameFromAnyPath(fileName) && mime) {
		const ext = extensionForMime(mime);
		if (ext) fileName = `${fileName}${ext}`;
	}
	return await clampAndFinalize({
		buffer: data,
		contentType: mime,
		kind,
		fileName,
		trustedGeneratedHtmlSource: Boolean(htmlTrust && hostReadDeclaredMime === "text/html")
	});
}
/** Loads local, remote, hosted, or media-store media and optimizes images by default. */
async function loadWebMedia(mediaUrl, maxBytesOrOptions, options) {
	return await loadWebMediaInternal(mediaUrl, resolveWebMediaOptions({
		maxBytesOrOptions,
		options,
		optimizeImages: true
	}));
}
/** Loads local, remote, hosted, or media-store media without image optimization. */
async function loadWebMediaRaw(mediaUrl, maxBytesOrOptions, options) {
	return await loadWebMediaInternal(mediaUrl, resolveWebMediaOptions({
		maxBytesOrOptions,
		options,
		optimizeImages: false
	}));
}
/** Optimizes image bytes to JPEG under a target byte cap using the shared compression grid. */
async function optimizeImageToJpeg(buffer, maxBytes, opts = {}) {
	const { sides, qualities } = resolveImageCompressionGrid(opts.imageCompression);
	const optimized = await createImageProcessor().encode(buffer, {
		format: "auto",
		maxBytes,
		opaque: { format: "jpeg" },
		search: {
			maxSide: sides,
			quality: qualities
		},
		transparency: "flatten"
	});
	return {
		buffer: optimized.data,
		optimizedSize: optimized.bytes,
		resizeSide: optimized.chosen.maxSide ?? Math.max(optimized.width, optimized.height),
		quality: optimized.chosen.quality ?? qualities.at(-1) ?? 85
	};
}
//#endregion
export { optimizeImageBufferForWebMedia as a, resolveImageCompressionGrid as c, markTrustedGeneratedHtmlPath as i, loadWebMedia as n, optimizeImageToJpeg as o, loadWebMediaRaw as r, pruneStaleTrustedGeneratedHtmlMarkers as s, effectiveImageBytesCap as t };
