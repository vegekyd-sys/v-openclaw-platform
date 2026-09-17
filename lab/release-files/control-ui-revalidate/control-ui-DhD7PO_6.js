import { I as resolveTimestampMsToIsoString, o as asDateTimestampMs } from "./number-coercion-CLj0HTDM.js";
import { t as resolveOpenClawPackageRoot } from "./openclaw-root-CfYY-fyD.js";
import { o as normalizeLowercaseStringOrEmpty } from "./string-coerce-CIXf7egm.js";
import { c as resolveUserPath } from "./home-dir-BPhrG-aM.js";
import { i as getOrCreatePromise } from "./lazy-promise-DGqyc4Y4.js";
import { c as readFileDescriptorBounded, i as matchRootFileOpenFailure, s as openRootFileSync } from "./boundary-file-read-uaJcf6X6.js";
import { a as isWithinDir } from "./path-safety-Bi0ppMWC.js";
import { t as FsSafeError, u as openLocalFileSafely } from "./fs-safe-Cdu9fYG_.js";
import "./utils-D3A1hGii.js";
import { t as pruneMapToMaxSize } from "./map-size-CNcWiFKu.js";
import { t as readFileWindowFully } from "./file-read-DtMn74uz.js";
import { l as resolveRuntimeServiceVersion, s as resolveRuntimeServiceBuildId } from "./version-CAQhhGAu.js";
import { a as CONTROL_UI_BASE_PATH_ATTRIBUTE, c as CONTROL_UI_ENVIRONMENT_ATTRIBUTE, o as CONTROL_UI_BOOTSTRAP_CONFIG_PATH, u as CONTROL_UI_TERMINAL_ENABLED_ATTRIBUTE } from "./zod-schema-B8Isge8w.js";
import { c as resolveAvatarMime, l as AVATAR_MAX_BYTES } from "./avatar-policy-DrVRhyKM.js";
import { r as runCommandWithTimeout } from "./exec-D7bZ8DC6.js";
import { t as safeEqualSecret } from "./secret-equal-DRsL8lKD.js";
import { t as normalizeControlUiBasePath } from "./control-ui-shared-l0wakFAx.js";
import { l as kindFromMime, n as detectMime } from "./mime-BxTGWg2e.js";
import { o as extractOriginalFilename } from "./store-D1sR82up.js";
import { a as safeFileURLToPath } from "./local-file-access-B1HKoQAc.js";
import { c as resolveMediaReferenceLocalPathInfo, s as resolveMediaReferenceLocalPath } from "./media-reference-D2cwQT4h.js";
import { n as probePlaybackMediaFileDescriptor } from "./media-probe-C-WRFuuN.js";
import { n as getAgentScopedMediaLocalRoots } from "./local-roots-BUVPtC1p.js";
import { i as getDefaultLocalRootsCore, r as assertLocalMediaAllowed } from "./local-media-access-CQzkadzN.js";
import { a as parseControlUiResourcePath, r as buildControlUiResourcePath } from "./control-ui-contract-CgrOMhfo.js";
import { n as isControlUiApprovalDocumentPath, r as isControlUiFocusDocumentPath, t as classifyControlUiRequest } from "./control-ui-routing-BSMukCN-.js";
import { n as resolvePublicAgentAvatarSource } from "./identity-avatar-DhDMr_2Y.js";
import { r as authorizeControlUiReadRequestOrReply } from "./http-auth-utils-BfD1fgjS.js";
import { _ as isReadHttpMethod, v as respondNotFound, y as respondPlainText } from "./http-common-PerMKXgg.js";
import "./http-utils-C2R9nO53.js";
import { r as resolveAssistantIdentity, t as DEFAULT_ASSISTANT_IDENTITY } from "./assistant-identity-AcSLp8Kz.js";
import { a as replacePlaybackFileExtension, i as buildAssistantMediaContentDisposition, n as resolveByteResponse, o as resolvePlaybackModeForSource, r as writeByteHeaders, s as resolvePlaybackTranscode, t as createGatewayByteStream } from "./http-byte-range-RiFnuepe.js";
import { n as resolveGatewayAssistantAvatar, t as openGatewayAssistantAvatar } from "./assistant-avatar-BiYIc4pS.js";
import { t as isTerminalConfigEnabled } from "./enabled-BSjeiWpO.js";
import fs from "node:fs";
import path from "node:path";
import fs$1 from "node:fs/promises";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { brotliCompress, constants as constants$1, gzip } from "node:zlib";
//#region src/gateway/control-ui-root-assets.ts
/** Root files emitted by the Control UI build and served under any configured mount. */
const CONTROL_UI_ROOT_PUBLIC_ASSETS = [
	"apple-touch-icon.png",
	"favicon-32.png",
	"favicon.ico",
	"favicon.svg",
	"manifest.webmanifest",
	"sw.js"
];
function isControlUiRootPublicAsset(value) {
	return CONTROL_UI_ROOT_PUBLIC_ASSETS.some((asset) => asset === value);
}
function buildControlUiRootAssetPath(basePath, asset) {
	return `${normalizeControlUiBasePath(basePath)}/${asset}`;
}
//#endregion
//#region src/infra/dev-install-branch.ts
const GIT_TIMEOUT_MS = 3e3;
const HIDDEN_BRANCHES = /* @__PURE__ */ new Set([
	"main",
	"master",
	"HEAD"
]);
async function detectDevInstallGitBranch(params) {
	const run = params.runCommand ?? runCommandWithTimeout;
	const root = params.root ? path.resolve(params.root) : null;
	if (!root) return null;
	const topRes = await run([
		"git",
		"-C",
		root,
		"rev-parse",
		"--show-toplevel"
	], { timeoutMs: GIT_TIMEOUT_MS }).catch(() => null);
	if (!topRes || topRes.code !== 0) return null;
	const rootReal = await fs$1.realpath(root).catch(() => root);
	const top = topRes.stdout.trim();
	if (!top || path.resolve(top) !== path.resolve(rootReal)) return null;
	const branchRes = await run([
		"git",
		"-C",
		root,
		"rev-parse",
		"--abbrev-ref",
		"HEAD"
	], { timeoutMs: GIT_TIMEOUT_MS }).catch(() => null);
	if (!branchRes || branchRes.code !== 0) return null;
	const branch = branchRes.stdout.trim();
	return branch && !HIDDEN_BRANCHES.has(branch) ? branch : null;
}
let cached = null;
function resolveDevInstallGitBranch() {
	cached ??= resolveOpenClawPackageRoot({
		argv1: process.argv[1],
		cwd: process.cwd(),
		moduleUrl: import.meta.url
	}).then((root) => detectDevInstallGitBranch({ root })).catch(() => null);
	return cached;
}
//#endregion
//#region src/gateway/control-ui-csp.ts
const SCRIPT_ATTRIBUTE_NAME_RE = /\s([^\s=/>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g;
/**
* Compute SHA-256 CSP hashes for inline `<script>` blocks in an HTML string.
* Only scripts without a `src` attribute are considered inline.
*/
function computeInlineScriptHashes(html) {
	const hashes = [];
	const re = /<script(?:\s[^>]*)?>([^]*?)<\/script>/gi;
	let match;
	while ((match = re.exec(html)) !== null) {
		if (hasScriptSrcAttribute(match[0].slice(0, match[0].indexOf(">") + 1))) continue;
		const content = match[1];
		if (!content) continue;
		const hash = createHash("sha256").update(content, "utf8").digest("base64");
		hashes.push(`sha256-${hash}`);
	}
	return hashes;
}
function hasScriptSrcAttribute(openTag) {
	return Array.from(openTag.matchAll(SCRIPT_ATTRIBUTE_NAME_RE)).some((match) => normalizeLowercaseStringOrEmpty(match[1]) === "src");
}
/** Build the CSP header applied to Gateway-served Control UI HTML. */
function buildControlUiCspHeader(opts) {
	const hashes = opts?.inlineScriptHashes;
	const scriptTokens = ["'self'"];
	if (hashes?.length) scriptTokens.push(...hashes.map((h) => `'${h}'`));
	if (opts?.allowWasm) scriptTokens.push("'wasm-unsafe-eval'");
	const connectTokens = [
		"'self'",
		"ws:",
		"wss:",
		"data:",
		"https://api.openai.com",
		"https://tweakcn.com"
	];
	if (opts?.portalHost) try {
		const parsed = new URL(`http://${opts.portalHost}`);
		if (!parsed.username && !parsed.password && parsed.pathname === "/" && !parsed.search && !parsed.hash && parsed.hostname) connectTokens.push(`http://${parsed.hostname}:*`, `https://${parsed.hostname}:*`);
	} catch {}
	return [
		"default-src 'self'",
		"base-uri 'none'",
		"object-src 'none'",
		"frame-ancestors 'none'",
		"frame-src 'self' http: https:",
		`script-src ${scriptTokens.join(" ")}`,
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
		"img-src 'self' data: blob: https://gravatar.com https://avatars.githubusercontent.com",
		"media-src 'self' data: blob:",
		"font-src 'self' https://fonts.gstatic.com",
		"worker-src 'self'",
		`connect-src ${connectTokens.join(" ")}`
	].join("; ");
}
//#endregion
//#region src/gateway/control-ui-static.ts
const CONTROL_UI_IMMUTABLE_CACHE_CONTROL = "public, max-age=0, must-revalidate";
const CONTROL_UI_HTML_COMPRESSION_CACHE_MAX_ENTRIES = 4;
const CONTROL_UI_COMPRESSIBLE_EXTENSIONS = /* @__PURE__ */ new Set([
	".css",
	".html",
	".js",
	".json",
	".svg",
	".txt",
	".wasm",
	".webmanifest"
]);
const CONTROL_UI_PRECOMPRESSED_ASSET_EXTENSIONS = /* @__PURE__ */ new Set([".br", ".gz"]);
const CONTROL_UI_CONTENT_TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".ico": "image/x-icon",
	".txt": "text/plain; charset=utf-8",
	".wasm": "application/wasm",
	".webmanifest": "application/manifest+json; charset=utf-8",
	".woff2": "font/woff2"
};
function isControlUiStaticAssetExtension(extension) {
	return extension !== ".html" && Object.hasOwn(CONTROL_UI_CONTENT_TYPES, extension);
}
function isControlUiPrecompressedAssetExtension(extension) {
	return CONTROL_UI_PRECOMPRESSED_ASSET_EXTENSIONS.has(extension);
}
const CONTROL_UI_QVALUE_PATTERN = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/;
const controlUiHtmlCompressionCache = /* @__PURE__ */ new Map();
function normalizedAcceptEncoding(req) {
	const value = req.headers?.["accept-encoding"];
	return Array.isArray(value) ? value.join(",") : value ?? "";
}
function resolveControlUiContentEncodings(req, includeCompressed) {
	const acceptEncoding = normalizedAcceptEncoding(req);
	if (!acceptEncoding.trim()) return ["identity"];
	const qualities = /* @__PURE__ */ new Map();
	for (const entry of acceptEncoding.split(",")) {
		const [rawName, ...rawParams] = entry.split(";");
		const name = rawName?.trim().toLowerCase();
		if (!name) continue;
		const qualityText = rawParams.find((param) => param.trim().toLowerCase().startsWith("q="))?.trim().slice(2);
		const parsedQuality = qualityText === void 0 ? 1 : CONTROL_UI_QVALUE_PATTERN.test(qualityText) ? Number(qualityText) : NaN;
		const quality = Number.isFinite(parsedQuality) && parsedQuality >= 0 && parsedQuality <= 1 ? parsedQuality : 0;
		qualities.set(name, Math.max(qualities.get(name) ?? 0, quality));
	}
	const wildcardQuality = qualities.get("*");
	const identityQuality = qualities.get("identity") ?? (wildcardQuality === 0 ? 0 : 1);
	const qualityFor = (name) => name === "identity" ? identityQuality : qualities.get(name) ?? wildcardQuality ?? 0;
	return (includeCompressed ? [
		"br",
		"gzip",
		"identity"
	] : ["identity"]).filter((encoding) => qualityFor(encoding) > 0).toSorted((left, right) => qualityFor(right) - qualityFor(left));
}
function resolveControlUiHtmlEncoding(req) {
	return resolveControlUiContentEncodings(req, true)[0] ?? "not-acceptable";
}
function resolveOpenedControlUiRepresentation(params) {
	const { req, sourceFile, precompressed, openPrecompressedFile } = params;
	const extension = path.extname(params.contentPath).toLowerCase();
	const usePrecompressed = precompressed && CONTROL_UI_COMPRESSIBLE_EXTENSIONS.has(extension) && !params.contentPath.endsWith("assets/control-ui-boot-chat-DWTSrxxk.js");
	const encodings = resolveControlUiContentEncodings(req, usePrecompressed);
	for (const selected of encodings) {
		if (selected === "identity") return { bodyFile: sourceFile };
		const suffix = selected === "br" ? ".br" : ".gz";
		let compressedFile;
		try {
			compressedFile = openPrecompressedFile(`${sourceFile.path}${suffix}`);
		} catch (error) {
			fs.closeSync(sourceFile.fd);
			throw error;
		}
		if (compressedFile) {
			fs.closeSync(sourceFile.fd);
			return {
				bodyFile: compressedFile,
				encoding: selected
			};
		}
	}
	fs.closeSync(sourceFile.fd);
	return null;
}
function setControlUiEncodingHeaders(res, extension, encoding) {
	res.setHeader("Vary", "Accept-Encoding");
	if (!CONTROL_UI_COMPRESSIBLE_EXTENSIONS.has(extension)) return;
	if (encoding !== "identity") res.setHeader("Content-Encoding", encoding);
}
function setControlUiFileHeaders(res, filePath, options) {
	const extension = path.extname(filePath).toLowerCase();
	res.setHeader("Content-Type", CONTROL_UI_CONTENT_TYPES[extension] ?? "application/octet-stream");
	res.setHeader("Cache-Control", options?.immutable ? CONTROL_UI_IMMUTABLE_CACHE_CONTROL : "no-cache");
	if (options?.lastModifiedMs !== void 0) res.setHeader("Last-Modified", new Date(options.lastModifiedMs).toUTCString());
	setControlUiEncodingHeaders(res, extension, options?.encoding ?? "identity");
}
/** Revalidate no-cache static assets without generating entity tags. */
function isControlUiFileUnmodified(req, lastModifiedMs) {
	if (req.method !== "GET" && req.method !== "HEAD") return false;
	const ifNoneMatch = req.headers?.["if-none-match"];
	if (ifNoneMatch !== void 0) return ifNoneMatch.trim() === "*";
	const header = req.headers?.["if-modified-since"];
	const since = typeof header === "string" ? Date.parse(header) : NaN;
	return Number.isFinite(since) && Math.floor(lastModifiedMs / 1e3) * 1e3 <= since;
}
function respondControlUiNotModified(res, options) {
	res.statusCode = 304;
	res.setHeader("Cache-Control", options.immutable ? CONTROL_UI_IMMUTABLE_CACHE_CONTROL : "no-cache");
	res.setHeader("Last-Modified", new Date(options.lastModifiedMs).toUTCString());
	res.setHeader("Vary", "Accept-Encoding");
	res.end();
}
function respondHeadForControlUiFile(res, filePath, options) {
	res.statusCode = 200;
	setControlUiFileHeaders(res, filePath, options);
	if (options?.contentLength !== void 0) res.setHeader("Content-Length", String(options.contentLength));
	res.end();
}
function compressControlUiBody(body, encoding) {
	return new Promise((resolve, reject) => {
		const callback = (error, compressed) => {
			if (error) {
				reject(error);
				return;
			}
			resolve(compressed);
		};
		if (encoding === "br") {
			brotliCompress(body, { params: { [constants$1.BROTLI_PARAM_QUALITY]: 4 } }, callback);
			return;
		}
		gzip(body, { level: 6 }, callback);
	});
}
async function serveControlUiAsset(res, filePath, body, options) {
	setControlUiFileHeaders(res, filePath, options);
	res.end(body);
}
function cachedCompressedControlUiHtml(body, encoding) {
	const key = `${encoding}\0${body}`;
	const cached = controlUiHtmlCompressionCache.get(key);
	if (cached) {
		controlUiHtmlCompressionCache.delete(key);
		controlUiHtmlCompressionCache.set(key, cached);
		return cached;
	}
	const compression = getOrCreatePromise(controlUiHtmlCompressionCache, key, () => compressControlUiBody(Buffer.from(body), encoding), { cacheRejections: false });
	pruneMapToMaxSize(controlUiHtmlCompressionCache, CONTROL_UI_HTML_COMPRESSION_CACHE_MAX_ENTRIES);
	return compression;
}
function respondControlUiNotAcceptable(res) {
	res.setHeader("Cache-Control", "no-store");
	res.setHeader("Vary", "Accept-Encoding");
	respondPlainText(res, 406, "Not Acceptable");
}
async function sendControlUiHtmlBody(req, res, body) {
	const encoding = resolveControlUiHtmlEncoding(req);
	if (encoding === "not-acceptable") {
		respondControlUiNotAcceptable(res);
		return;
	}
	setControlUiEncodingHeaders(res, ".html", encoding);
	res.end(encoding === "identity" ? body : await cachedCompressedControlUiHtml(body, encoding));
}
async function readAndCloseControlUiFile(file) {
	try {
		if (file.size > 2 ** 31 - 1) throw Object.assign(/* @__PURE__ */ new RangeError("Control UI file exceeds the 2 GiB read limit"), { code: "ERR_FS_FILE_TOO_LARGE" });
		const buffer = Buffer.allocUnsafe(file.size);
		let offset = 0;
		while (offset < buffer.length) {
			const length = Math.min(524288, buffer.length - offset);
			const bytesRead = await new Promise((resolve, reject) => {
				fs.read(file.fd, buffer, offset, length, null, (error, count) => {
					if (error) reject(error);
					else resolve(count);
				});
			});
			if (bytesRead === 0) break;
			offset += bytesRead;
		}
		return buffer.subarray(0, offset);
	} finally {
		fs.closeSync(file.fd);
	}
}
//#endregion
//#region src/gateway/control-ui.ts
const ROOT_PREFIX = "/";
const CONTROL_UI_ASSISTANT_MEDIA_PREFIX = "/__openclaw__/assistant-media";
const CONTROL_UI_ASSISTANT_MEDIA_TICKET_SCOPE = "assistant-media";
const CONTROL_UI_ASSISTANT_MEDIA_TICKET_TTL_MS = 3e5;
const CONTROL_UI_ASSETS_MISSING_MESSAGE = "Control UI assets not found. Build them with `pnpm ui:build` (auto-installs UI deps), or run `pnpm ui:dev` during development.";
const controlUiAssistantMediaTicketSecret = randomBytes(32);
const CONTROL_UI_NAMESPACE_PREFIX = "/__openclaw__/";
/** Anchors bundled assets before deep-linked documents begin preloading. */
function rewriteControlUiIndexHtmlAssetHrefs(html, basePath) {
	const normalized = normalizeControlUiBasePath(basePath);
	let next = html.replaceAll("src=\"./assets/", `src="${normalized}/assets/`).replaceAll("href=\"./assets/", `href="${normalized}/assets/`);
	for (const asset of CONTROL_UI_ROOT_PUBLIC_ASSETS) {
		const assetHref = `href="${buildControlUiRootAssetPath(normalized, asset)}"`;
		next = next.replaceAll(`href="./${asset}"`, assetHref);
		if (normalized) next = next.replaceAll(`href="/${asset}"`, assetHref);
	}
	return next;
}
function escapeHtmlAttribute(value) {
	return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&#39;");
}
function controlUiAvatarResolutionMeta(resolved) {
	if (!resolved) return {
		avatarSource: null,
		avatarStatus: null,
		avatarReason: null
	};
	return {
		avatarSource: resolvePublicAgentAvatarSource(resolved) ?? null,
		avatarStatus: resolved.kind,
		avatarReason: resolved.kind === "none" ? resolved.reason : null
	};
}
function applyControlUiSecurityHeaders(res) {
	res.setHeader("X-Frame-Options", "DENY");
	res.setHeader("Content-Security-Policy", buildControlUiCspHeader());
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader("Referrer-Policy", "no-referrer");
	res.setHeader("Permissions-Policy", "camera=(self), microphone=*, geolocation=*, clipboard-write=*");
}
function sendJson(res, status, body) {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.setHeader("Cache-Control", "no-cache");
	res.end(JSON.stringify(body));
}
function respondControlUiAssetsUnavailable(res, options) {
	const message = options?.preparing ? "Control UI assets are being prepared. Try again shortly." : options?.failed ? "Control UI assets could not be prepared. Check the Gateway logs or run `openclaw doctor --fix`." : options?.configuredRootPath ? `Control UI assets not found at ${options.configuredRootPath}. Build them with \`pnpm ui:build\` (auto-installs UI deps), or update gateway.controlUi.root.` : CONTROL_UI_ASSETS_MISSING_MESSAGE;
	if (options?.preparing) {
		res.setHeader("Cache-Control", "no-store");
		res.setHeader("Retry-After", "1");
	}
	respondPlainText(res, 503, message);
}
function isValidAgentPathSegment(agentId) {
	return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(agentId);
}
function normalizeAssistantMediaSource(source) {
	const trimmed = source.trim();
	if (!trimmed) return null;
	if (/^file:/iu.test(trimmed)) try {
		return safeFileURLToPath(trimmed);
	} catch {
		return null;
	}
	if (trimmed.startsWith("~")) return resolveUserPath(trimmed);
	return trimmed;
}
function resolveAssistantMediaRoutePath(basePath) {
	return `${basePath && basePath !== "/" ? basePath.endsWith("/") ? basePath.slice(0, -1) : basePath : ""}${CONTROL_UI_ASSISTANT_MEDIA_PREFIX}`;
}
function signAssistantMediaTicketPayload(encodedPayload) {
	return createHmac("sha256", controlUiAssistantMediaTicketSecret).update(encodedPayload).digest("base64url");
}
function createAssistantMediaTicket(source, nowMs = Date.now()) {
	const now = asDateTimestampMs(nowMs);
	if (now === void 0) return {};
	const exp = asDateTimestampMs(now + CONTROL_UI_ASSISTANT_MEDIA_TICKET_TTL_MS);
	if (exp === void 0) return {};
	const payload = {
		scope: CONTROL_UI_ASSISTANT_MEDIA_TICKET_SCOPE,
		source,
		exp
	};
	const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
	return {
		mediaTicket: `v1.${encodedPayload}.${signAssistantMediaTicketPayload(encodedPayload)}`,
		mediaTicketExpiresAt: resolveTimestampMsToIsoString(exp)
	};
}
function verifyAssistantMediaTicket(ticket, source, nowMs = Date.now()) {
	const now = asDateTimestampMs(nowMs);
	if (now === void 0) return false;
	const parts = ticket?.split(".");
	if (!parts || parts.length !== 3 || parts[0] !== "v1") return false;
	const [, encodedPayload, sig] = parts;
	if (!encodedPayload || !sig) return false;
	const expectedSig = signAssistantMediaTicketPayload(encodedPayload);
	if (!safeEqualSecret(sig, expectedSig)) return false;
	try {
		const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
		return payload.scope === CONTROL_UI_ASSISTANT_MEDIA_TICKET_SCOPE && payload.source === source && typeof payload.exp === "number" && Number.isFinite(payload.exp) && payload.exp >= now;
	} catch {
		return false;
	}
}
function classifyAssistantMediaError(err) {
	if (err instanceof FsSafeError) switch (err.code) {
		case "not-found": return {
			available: false,
			code: "file-not-found",
			reason: "File not found"
		};
		case "not-file": return {
			available: false,
			code: "not-a-file",
			reason: "Not a file"
		};
		case "invalid-path":
		case "path-mismatch":
		case "symlink": return {
			available: false,
			code: "invalid-file",
			reason: "Invalid file"
		};
		default: return {
			available: false,
			code: "attachment-unavailable",
			reason: "Attachment unavailable"
		};
	}
	if (err instanceof Error && "code" in err) {
		const errorCode = err.code;
		switch (typeof errorCode === "string" ? errorCode : "") {
			case "path-not-allowed": return {
				available: false,
				code: "outside-allowed-folders",
				reason: "Outside allowed folders"
			};
			case "invalid-file-url":
			case "invalid-path":
			case "unsafe-bypass":
			case "network-path-not-allowed":
			case "invalid-root": return {
				available: false,
				code: "blocked-local-file",
				reason: "Blocked local file"
			};
			case "not-found": return {
				available: false,
				code: "file-not-found",
				reason: "File not found"
			};
			case "not-file": return {
				available: false,
				code: "not-a-file",
				reason: "Not a file"
			};
		}
	}
	return {
		available: false,
		code: "attachment-unavailable",
		reason: "Attachment unavailable"
	};
}
async function resolveAssistantMediaAvailability(source, localRoots) {
	try {
		const localPath = await resolveMediaReferenceLocalPath(source);
		await assertLocalMediaAllowed(localPath, localRoots);
		const opened = await openLocalFileSafely({ filePath: localPath });
		try {
			const sizeBytes = opened.stat.size;
			let mimeType;
			try {
				const sniffLength = Math.min(sizeBytes, 8192);
				const sniffBuffer = sniffLength > 0 ? Buffer.allocUnsafe(sniffLength) : void 0;
				const bytesRead = sniffBuffer ? await readFileWindowFully(opened.handle, sniffBuffer, 0) : 0;
				mimeType = await detectMime({
					buffer: sniffBuffer?.subarray(0, bytesRead),
					filePath: localPath
				}) ?? void 0;
			} catch {}
			const mediaKind = kindFromMime(mimeType);
			const playbackProbe = mediaKind === "audio" || mediaKind === "video" ? await probePlaybackMediaFileDescriptor(opened.handle.fd, mediaKind) : null;
			const probe = playbackProbe ? {
				...playbackProbe.durationMs ? { durationMs: playbackProbe.durationMs } : {},
				...playbackProbe.width && playbackProbe.height ? {
					width: playbackProbe.width,
					height: playbackProbe.height
				} : {}
			} : {};
			const playback = mimeType && (mediaKind === "audio" || mediaKind === "video") ? await resolvePlaybackModeForSource({
				sourcePath: opened.realPath,
				sourceStat: opened.stat,
				mimeType,
				kind: mediaKind,
				probe: playbackProbe
			}) : void 0;
			return {
				available: true,
				...mimeType ? { mimeType } : {},
				...playback ? { playback } : {},
				sizeBytes,
				...probe
			};
		} finally {
			await opened.handle.close().catch(() => {});
		}
	} catch (err) {
		return classifyAssistantMediaError(err);
	}
}
async function handleControlUiAssistantMediaRequest(req, res, opts) {
	const urlRaw = req.url;
	if (!urlRaw || !isReadHttpMethod(req.method)) return false;
	const url = new URL(urlRaw, "http://localhost");
	if (url.pathname !== resolveAssistantMediaRoutePath(opts?.basePath)) return false;
	applyControlUiSecurityHeaders(res);
	const source = normalizeAssistantMediaSource(url.searchParams.get("source") ?? "");
	if (!source) {
		respondNotFound(res);
		return true;
	}
	const isMetaRequest = url.searchParams.get("meta") === "1";
	if (!(!isMetaRequest && verifyAssistantMediaTicket(url.searchParams.get("mediaTicket"), source)) && !await authorizeControlUiReadRequestOrReply({
		req,
		res,
		auth: opts?.auth,
		trustedProxies: opts?.trustedProxies,
		allowRealIpFallback: opts?.allowRealIpFallback,
		rateLimiter: opts?.rateLimiter,
		allowQueryToken: true
	})) return true;
	const localRoots = opts?.config ? getAgentScopedMediaLocalRoots(opts.config, opts.agentId) : getDefaultLocalRootsCore();
	if (isMetaRequest) {
		const availability = await resolveAssistantMediaAvailability(source, localRoots);
		sendJson(res, 200, availability.available ? {
			...availability,
			...createAssistantMediaTicket(source)
		} : availability);
		return true;
	}
	let byteStream;
	try {
		const resolvedReference = await resolveMediaReferenceLocalPathInfo(source);
		const localPath = resolvedReference.path;
		await assertLocalMediaAllowed(localPath, localRoots);
		let opened = await openLocalFileSafely({ filePath: localPath });
		byteStream = createGatewayByteStream(res, opened.handle, () => respondNotFound(res));
		const sniffLength = Math.min(opened.stat.size, 8192);
		const sniffBuffer = sniffLength > 0 ? Buffer.allocUnsafe(sniffLength) : void 0;
		const bytesRead = sniffBuffer && sniffLength > 0 ? await readFileWindowFully(opened.handle, sniffBuffer, 0) : 0;
		let contentType = await detectMime({
			buffer: sniffBuffer?.subarray(0, bytesRead),
			filePath: localPath
		}) ?? "application/octet-stream";
		let filename = resolvedReference.kind === "inbound" ? extractOriginalFilename(localPath) : path.basename(localPath);
		const mediaKind = kindFromMime(contentType);
		if (url.searchParams.get("playback") === "1" && (mediaKind === "audio" || mediaKind === "video")) {
			const playback = await resolvePlaybackTranscode({
				sourcePath: opened.realPath,
				sourceStat: opened.stat,
				mimeType: contentType,
				kind: mediaKind
			});
			if (playback.kind === "preparing") {
				await byteStream.close();
				sendJson(res, 202, { status: "preparing" });
				return true;
			}
			if (playback.kind === "transcoded") {
				const transcoded = await openLocalFileSafely({ filePath: playback.path }).catch(() => null);
				if (transcoded) {
					await byteStream.close();
					opened = transcoded;
					byteStream = createGatewayByteStream(res, opened.handle, () => respondNotFound(res));
					contentType = playback.contentType;
					filename = replacePlaybackFileExtension(filename, playback.extension);
				}
			}
		}
		res.setHeader("Content-Type", contentType);
		res.setHeader("Content-Disposition", buildAssistantMediaContentDisposition(filename, contentType));
		res.setHeader("Cache-Control", "no-cache");
		const byteResponse = resolveByteResponse({
			file: opened.stat,
			method: req.method,
			request: req
		});
		writeByteHeaders(res, byteResponse);
		await byteStream.pipe(byteResponse, req.method);
		return true;
	} catch {
		await byteStream?.close();
		respondNotFound(res);
		return true;
	}
}
async function handleControlUiAvatarRequest(req, res, opts) {
	const urlRaw = req.url;
	if (!urlRaw) return false;
	if (!isReadHttpMethod(req.method)) return false;
	const url = new URL(urlRaw, "http://localhost");
	const basePath = normalizeControlUiBasePath(opts.basePath);
	const pathname = url.pathname;
	const parsed = parseControlUiResourcePath("agentAvatar", pathname, basePath);
	if (!parsed.matched) return false;
	applyControlUiSecurityHeaders(res);
	const agentId = parsed.value;
	if (!agentId || !isValidAgentPathSegment(agentId)) {
		respondNotFound(res);
		return true;
	}
	if (!await authorizeControlUiReadRequestOrReply({
		req,
		res,
		auth: opts.auth,
		trustedProxies: opts.trustedProxies,
		allowRealIpFallback: opts.allowRealIpFallback,
		rateLimiter: opts.rateLimiter
	})) return true;
	const identity = resolveAssistantIdentity({
		cfg: opts.config,
		agentId
	});
	const projection = openGatewayAssistantAvatar({
		cfg: opts.config,
		identity
	});
	const resolved = projection.resolution;
	if (url.searchParams.get("meta") === "1") {
		try {
			const meta = controlUiAvatarResolutionMeta(resolved);
			sendJson(res, 200, {
				avatarUrl: resolved?.kind === "local" ? buildControlUiResourcePath("agentAvatar", basePath, agentId) : resolved?.kind === "remote" || resolved?.kind === "data" ? resolved.url : null,
				avatarSource: meta.avatarSource,
				avatarStatus: meta.avatarStatus,
				avatarReason: meta.avatarReason
			});
		} finally {
			if (projection.openedFile) fs.closeSync(projection.openedFile.fd);
		}
		return true;
	}
	if (resolved?.kind !== "local" || !projection.openedFile) {
		respondNotFound(res);
		return true;
	}
	try {
		res.setHeader("Content-Type", resolveAvatarMime(projection.openedFile.path));
		res.setHeader("Cache-Control", "no-cache");
		if (req.method === "HEAD") {
			res.statusCode = 200;
			res.setHeader("Content-Length", String(projection.openedFile.stat.size));
			res.end();
			return true;
		}
		const body = await readFileDescriptorBounded(projection.openedFile.fd, AVATAR_MAX_BYTES);
		res.end(body);
		return true;
	} catch {
		respondNotFound(res);
		return true;
	} finally {
		fs.closeSync(projection.openedFile.fd);
	}
}
async function serveResolvedIndexHtml(req, res, body, basePath, allowWasm, environment) {
	const normalizedBasePath = normalizeControlUiBasePath(basePath);
	const withBasePath = rewriteControlUiIndexHtmlAssetHrefs(body, normalizedBasePath);
	const basePathAttribute = ` ${CONTROL_UI_BASE_PATH_ATTRIBUTE}="${escapeHtmlAttribute(normalizedBasePath)}"`;
	const environmentAttributes = environment ? ` ${CONTROL_UI_ENVIRONMENT_ATTRIBUTE}="${escapeHtmlAttribute(JSON.stringify(environment))}"` : "";
	const prepared = withBasePath.replace(/<html\b/i, `<html${basePathAttribute} ${CONTROL_UI_TERMINAL_ENABLED_ATTRIBUTE}="${allowWasm === true}"${environmentAttributes}`);
	const hashes = computeInlineScriptHashes(prepared);
	res.setHeader("Content-Security-Policy", buildControlUiCspHeader({
		inlineScriptHashes: hashes,
		allowWasm,
		portalHost: req.headers.host
	}));
	res.setHeader("Content-Type", "text/html; charset=utf-8");
	res.setHeader("Cache-Control", "no-cache");
	await sendControlUiHtmlBody(req, res, prepared);
}
function isExpectedSafePathError(error) {
	const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
	return code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP";
}
function resolveSafeControlUiFile(rootReal, filePath, rejectHardlinks) {
	const opened = openRootFileSync({
		absolutePath: filePath,
		rootPath: rootReal,
		rootRealPath: rootReal,
		boundaryLabel: "control ui root",
		skipLexicalRootCheck: true,
		rejectSymlinks: false,
		rejectHardlinks
	});
	if (!opened.ok) return matchRootFileOpenFailure(opened, {
		io: (failure) => {
			throw failure.error;
		},
		fallback: () => null
	});
	return {
		path: opened.path,
		fd: opened.fd,
		size: opened.stat.size,
		mtimeMs: opened.stat.mtimeMs
	};
}
function isSafeRelativePath(relPath) {
	if (!relPath) return false;
	const normalized = path.posix.normalize(relPath);
	if (path.posix.isAbsolute(normalized) || path.win32.isAbsolute(normalized)) return false;
	if (normalized.startsWith("../") || normalized === "..") return false;
	if (normalized.includes("\0")) return false;
	return true;
}
const CONTROL_UI_DEFAULT_NAMESPACE_BOOTSTRAP_CONFIG_PATH = `${CONTROL_UI_NAMESPACE_PREFIX.replace(/\/$/, "")}${CONTROL_UI_BOOTSTRAP_CONFIG_PATH}`;
const LEGACY_BOOTSTRAP_CONFIG_PATH = `/__openclaw${CONTROL_UI_BOOTSTRAP_CONFIG_PATH}`;
/**
* Whether `pathname` should be served the Control UI bootstrap config payload.
*
* The canonical endpoint is the configured base path joined with the shared
* bootstrap constant (or the bare constant when no base path is configured).
* For every base path (configured or empty) we additionally accept the legacy
* single-underscore suffix `${basePath}/__openclaw/control-ui-config.json` that
* current main and v2026.6.1 serve and document, so older bundles and clients
* that still request the pre-#66946 endpoint keep receiving config after an
* upgrade instead of 404ing. When no base path is configured we further accept
* the default-namespace alias `/__openclaw__/control-ui-config.json`, which is
* what the default `/__openclaw__/` entry requests after inferring its base path
* from the URL. All compatibility endpoints are preserved; no path is removed.
*/
function matchesControlUiBootstrapConfigPath(pathname, basePath) {
	if (pathname === `${basePath}/control-ui-config.json` || pathname === `${basePath}${LEGACY_BOOTSTRAP_CONFIG_PATH}`) return true;
	return basePath === "" && pathname === CONTROL_UI_DEFAULT_NAMESPACE_BOOTSTRAP_CONFIG_PATH;
}
async function handleControlUiHttpRequest(req, res, opts) {
	const urlRaw = req.url;
	if (!urlRaw) return false;
	const url = new URL(urlRaw, "http://localhost");
	const basePath = normalizeControlUiBasePath(opts?.basePath);
	const pathname = url.pathname;
	const terminalEnabled = opts?.terminalEnabled ?? isTerminalConfigEnabled(opts?.config);
	const route = classifyControlUiRequest({
		basePath,
		pathname,
		search: url.search,
		method: req.method,
		accept: req.headers?.accept
	});
	if (route.kind === "not-control-ui") return false;
	if (route.kind === "not-found") {
		applyControlUiSecurityHeaders(res);
		respondNotFound(res);
		return true;
	}
	if (route.kind === "redirect") {
		applyControlUiSecurityHeaders(res);
		res.statusCode = 302;
		res.setHeader("Location", route.location);
		res.end();
		return true;
	}
	applyControlUiSecurityHeaders(res);
	if (matchesControlUiBootstrapConfigPath(pathname, basePath)) {
		let pluginFrameGrants = [];
		if (!await authorizeControlUiReadRequestOrReply({
			req,
			res,
			auth: opts?.auth,
			trustedProxies: opts?.trustedProxies,
			allowRealIpFallback: opts?.allowRealIpFallback,
			rateLimiter: opts?.rateLimiter,
			onPluginFrameGrants: (grants) => {
				pluginFrameGrants = grants;
			}
		})) return true;
		if (req.method === "HEAD") {
			res.statusCode = 200;
			res.setHeader("Content-Type", "application/json; charset=utf-8");
			res.setHeader("Cache-Control", "no-cache");
			res.end();
			return true;
		}
		const config = opts?.config;
		const resolvedIdentity = config ? resolveAssistantIdentity({
			cfg: config,
			agentId: opts?.agentId
		}) : void 0;
		const identity = resolvedIdentity ?? DEFAULT_ASSISTANT_IDENTITY;
		const assistantAgentId = resolvedIdentity?.agentId;
		const avatarProjection = config && resolvedIdentity ? resolveGatewayAssistantAvatar({
			cfg: config,
			identity: resolvedIdentity,
			httpBasePath: basePath
		}) : {
			avatar: identity.avatar,
			resolution: null
		};
		const avatarMeta = controlUiAvatarResolutionMeta(avatarProjection.resolution);
		sendJson(res, 200, {
			basePath,
			assistantName: identity.name,
			assistantAvatar: avatarProjection.avatar,
			assistantAvatarSource: avatarMeta.avatarSource,
			assistantAvatarStatus: avatarMeta.avatarStatus,
			assistantAvatarReason: avatarMeta.avatarReason,
			...assistantAgentId ? { assistantAgentId } : {},
			serverVersion: resolveRuntimeServiceVersion(process.env),
			serverBuildId: config?.gateway?.controlUi?.root === void 0 ? resolveRuntimeServiceBuildId() ?? void 0 : void 0,
			devGitBranch: await resolveDevInstallGitBranch() ?? void 0,
			localMediaPreviewRoots: [...getAgentScopedMediaLocalRoots(config ?? {}, assistantAgentId)],
			embedSandbox: config?.gateway?.controlUi?.embedSandbox === "trusted" ? "trusted" : config?.gateway?.controlUi?.embedSandbox === "strict" ? "strict" : "scripts",
			allowExternalEmbedUrls: config?.gateway?.controlUi?.allowExternalEmbedUrls === true,
			automaticallyFetchFavicons: config?.gateway?.controlUi?.automaticallyFetchFavicons !== false,
			seamColor: config?.ui?.seamColor,
			environment: config?.gateway?.controlUi?.environment,
			terminalEnabled,
			cliAgentsEnabled: config?.gateway?.cliAgents?.enabled === true,
			pluginFrameGrants: pluginFrameGrants.map(({ pluginId, path: grantPath, match }) => ({
				pluginId,
				path: grantPath,
				match
			}))
		});
		return true;
	}
	const rootState = opts?.root;
	if (rootState?.kind === "invalid") {
		respondControlUiAssetsUnavailable(res, { configuredRootPath: rootState.path });
		return true;
	}
	if (rootState?.kind === "preparing") {
		respondControlUiAssetsUnavailable(res, { preparing: true });
		return true;
	}
	if (rootState?.kind === "failed") {
		respondControlUiAssetsUnavailable(res, { failed: true });
		return true;
	}
	if (!rootState || rootState.kind === "missing") {
		respondControlUiAssetsUnavailable(res);
		return true;
	}
	const root = rootState.path;
	const rootReal = (() => {
		if (rootState.realPath) return rootState.realPath;
		try {
			return fs.realpathSync(root);
		} catch (error) {
			if (isExpectedSafePathError(error)) return null;
			throw error;
		}
	})();
	if (!rootReal) {
		respondControlUiAssetsUnavailable(res);
		return true;
	}
	const uiPath = basePath && pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : pathname;
	const standaloneDocument = isControlUiApprovalDocumentPath({
		basePath,
		pathname
	}) || isControlUiFocusDocumentPath({
		basePath,
		pathname
	});
	const rel = (() => {
		if (uiPath === ROOT_PREFIX) return "";
		if (uiPath.startsWith(CONTROL_UI_NAMESPACE_PREFIX)) {
			const namespacedRel = uiPath.slice(14);
			if (isControlUiRootPublicAsset(namespacedRel)) return namespacedRel;
		}
		const assetsIndex = uiPath.indexOf("/assets/");
		if (assetsIndex >= 0) return uiPath.slice(assetsIndex + 1);
		return uiPath.slice(1);
	})();
	const requested = standaloneDocument ? "index.html" : rel && !rel.endsWith("/") ? rel : `${rel}index.html`;
	let fileRel;
	try {
		fileRel = decodeURIComponent(requested);
	} catch {
		respondNotFound(res);
		return true;
	}
	if (!isSafeRelativePath(fileRel)) {
		respondNotFound(res);
		return true;
	}
	const filePath = path.resolve(root, fileRel);
	if (!isWithinDir(root, filePath)) {
		respondNotFound(res);
		return true;
	}
	const isBundledRoot = rootState.kind === "bundled";
	if (isBundledRoot && isControlUiPrecompressedAssetExtension(path.extname(fileRel).toLowerCase())) {
		respondNotFound(res);
		return true;
	}
	const rejectHardlinks = !isBundledRoot;
	const immutableAsset = isBundledRoot && fileRel.startsWith("assets/");
	let servingRootReal = rootReal;
	let rejectRepresentationHardlinks = rejectHardlinks;
	let safeFile = resolveSafeControlUiFile(rootReal, filePath, rejectHardlinks);
	if (!safeFile && immutableAsset && rootState.kind === "bundled") {
		const retained = rootState.retainedAssets?.resolveAsset(fileRel);
		if (retained) {
			servingRootReal = retained.rootRealPath;
			rejectRepresentationHardlinks = true;
			safeFile = resolveSafeControlUiFile(retained.rootRealPath, retained.filePath, true);
		}
	}
	if (safeFile && path.basename(fileRel) !== "index.html" && path.basename(safeFile.path) !== "index.html") {
		const lastModifiedMs = Math.floor(Math.min(safeFile.mtimeMs, Date.now()) / 1e3) * 1e3;
		const representation = resolveOpenedControlUiRepresentation({
			req,
			sourceFile: safeFile,
			contentPath: fileRel,
			precompressed: immutableAsset,
			openPrecompressedFile: (compressedPath) => resolveSafeControlUiFile(servingRootReal, compressedPath, rejectRepresentationHardlinks)
		});
		if (!representation) {
			respondControlUiNotAcceptable(res);
			return true;
		}
		if (isControlUiFileUnmodified(req, lastModifiedMs)) {
			fs.closeSync(representation.bodyFile.fd);
			respondControlUiNotModified(res, {
				immutable: immutableAsset,
				lastModifiedMs
			});
			return true;
		}
		if (req.method === "HEAD") try {
			respondHeadForControlUiFile(res, fileRel, {
				immutable: immutableAsset,
				encoding: representation.encoding,
				contentLength: representation.bodyFile.size,
				lastModifiedMs
			});
			return true;
		} finally {
			fs.closeSync(representation.bodyFile.fd);
		}
		const body = await readAndCloseControlUiFile(representation.bodyFile);
		await serveControlUiAsset(res, fileRel, body, {
			immutable: immutableAsset,
			encoding: representation.encoding,
			lastModifiedMs
		});
		return true;
	}
	if (!safeFile) {
		if (isControlUiStaticAssetExtension(path.extname(fileRel).toLowerCase())) {
			respondNotFound(res);
			return true;
		}
		if (!route.spaFallback) return false;
		const indexPath = path.resolve(root, "index.html");
		if (filePath !== indexPath) safeFile = resolveSafeControlUiFile(rootReal, indexPath, rejectHardlinks);
	}
	if (safeFile) {
		if (req.method === "HEAD") try {
			const encoding = resolveControlUiHtmlEncoding(req);
			if (encoding === "not-acceptable") {
				respondControlUiNotAcceptable(res);
				return true;
			}
			respondHeadForControlUiFile(res, "index.html", { encoding: encoding === "identity" ? void 0 : encoding });
			return true;
		} finally {
			fs.closeSync(safeFile.fd);
		}
		await serveResolvedIndexHtml(req, res, (await readAndCloseControlUiFile(safeFile)).toString("utf8"), basePath, terminalEnabled, opts?.config?.gateway?.controlUi?.environment);
		return true;
	}
	respondNotFound(res);
	return true;
}
//#endregion
export { handleControlUiAssistantMediaRequest, handleControlUiAvatarRequest, handleControlUiHttpRequest };
