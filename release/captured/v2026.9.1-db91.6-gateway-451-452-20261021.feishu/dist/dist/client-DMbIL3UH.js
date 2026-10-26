import { t as __exportAll } from "./rolldown-runtime-8H4AJuhK.js";
import { createRequire } from "node:module";
import { parseStrictPositiveInteger } from "openclaw/plugin-sdk/number-runtime";
import * as Lark from "@larksuiteoapi/node-sdk";
import { bufferToBlobPart } from "openclaw/plugin-sdk/blob-runtime";
import { isRecord } from "openclaw/plugin-sdk/channel-secret-basic-runtime";
import { readPluginPackageVersion, resolveAmbientNodeProxyAgent } from "openclaw/plugin-sdk/extension-shared";
//#region extensions/feishu/src/client-timeout.ts
/** Default HTTP timeout for Feishu API requests (30 seconds). */
const FEISHU_HTTP_TIMEOUT_MS = 3e4;
const FEISHU_HTTP_TIMEOUT_MAX_MS = 3e5;
const FEISHU_HTTP_TIMEOUT_ENV_VAR = "OPENCLAW_FEISHU_HTTP_TIMEOUT_MS";
function resolveConfiguredHttpTimeoutMs(creds) {
	const clampTimeout = (value) => {
		return Math.min(Math.max(Math.floor(value), 1), FEISHU_HTTP_TIMEOUT_MAX_MS);
	};
	const fromDirectField = creds.httpTimeoutMs;
	if (typeof fromDirectField === "number" && Number.isFinite(fromDirectField) && fromDirectField > 0) return clampTimeout(fromDirectField);
	const envRaw = process.env[FEISHU_HTTP_TIMEOUT_ENV_VAR];
	if (envRaw) {
		const envValue = parseStrictPositiveInteger(envRaw);
		if (envValue !== void 0) return clampTimeout(envValue);
	}
	const timeout = creds.config?.httpTimeoutMs;
	if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0) return FEISHU_HTTP_TIMEOUT_MS;
	return clampTimeout(timeout);
}
//#endregion
//#region extensions/feishu/src/client.ts
var client_exports = /* @__PURE__ */ __exportAll({
	createEventDispatcher: () => createEventDispatcher,
	createFeishuClient: () => createFeishuClient,
	createFeishuWSClient: () => createFeishuWSClient,
	getFeishuUserAgent: () => getFeishuUserAgent
});
const require = createRequire(import.meta.url);
const FEISHU_USER_AGENT = `openclaw-feishu-builtin/${readPluginPackageVersion({ require })}/${process.platform}`;
const FEISHU_SDK_ORIGIN = "https://open.feishu.cn";
const FEISHU_WS_CONFIG = { pingTimeout: 3 };
/** User-Agent header value for all Feishu API requests. */
function getFeishuUserAgent() {
	return FEISHU_USER_AGENT;
}
const feishuClientSdk = {
	AppType: Lark.AppType,
	Client: Lark.Client,
	defaultHttpInstance: Lark.defaultHttpInstance,
	Domain: Lark.Domain,
	EventDispatcher: Lark.EventDispatcher,
	LoggerLevel: Lark.LoggerLevel,
	WSClient: Lark.WSClient
};
function setRequestUserAgent(req) {
	const request = req;
	const headers = request.headers;
	if (!headers) {
		request.headers = { "User-Agent": getFeishuUserAgent() };
		return req;
	}
	const maybeAxiosHeaders = headers;
	if (typeof maybeAxiosHeaders.set === "function") {
		maybeAxiosHeaders.set("User-Agent", getFeishuUserAgent());
		return req;
	}
	headers["User-Agent"] = getFeishuUserAgent();
	return req;
}
Lark.defaultHttpInstance.interceptors.request.use(setRequestUserAgent);
function readHeader(headers, name) {
	if (!isRecord(headers)) return;
	const normalizedName = name.toLowerCase();
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() !== normalizedName) continue;
		if (typeof value === "string") return value;
		if (Array.isArray(value)) {
			const first = value.find((entry) => typeof entry === "string");
			return typeof first === "string" ? first : void 0;
		}
	}
}
function isMultipartFormRequest(opts) {
	return /^multipart\/form-data(?:;|$)/i.test(readHeader(opts.headers, "content-type") ?? "");
}
const FEISHU_MESSAGE_MEDIA_UPLOAD_PATHS = /* @__PURE__ */ new Set(["/open-apis/im/v1/files", "/open-apis/im/v1/images"]);
function isFeishuMessageMediaUploadRequest(opts, data) {
	if (typeof opts.url !== "string" || opts.method?.toUpperCase() !== "POST") return false;
	let pathname;
	try {
		pathname = new URL(opts.url).pathname;
	} catch {
		return false;
	}
	return FEISHU_MESSAGE_MEDIA_UPLOAD_PATHS.has(pathname) && (Buffer.isBuffer(data.file) || Buffer.isBuffer(data.image));
}
function stringifyMultipartFieldValue(value) {
	switch (typeof value) {
		case "string": return value;
		case "number":
		case "boolean":
		case "bigint": return String(value);
		default: return;
	}
}
function normalizeMultipartUploadData(opts) {
	if (!isMultipartFormRequest(opts) || !isRecord(opts.data) || !isFeishuMessageMediaUploadRequest(opts, opts.data)) return opts;
	const form = new FormData();
	const fileName = typeof opts.data.file_name === "string" && opts.data.file_name ? opts.data.file_name : void 0;
	for (const [key, value] of Object.entries(opts.data)) {
		if (value === void 0 || value === null) continue;
		if (Buffer.isBuffer(value)) {
			form.append(key, new Blob([bufferToBlobPart(value)]), key === "file" && fileName ? fileName : `${key}.bin`);
			continue;
		}
		const fieldValue = stringifyMultipartFieldValue(value);
		if (fieldValue !== void 0) form.append(key, fieldValue);
	}
	return {
		...opts,
		data: form
	};
}
function isManagedProxyActive() {
	return process.env["OPENCLAW_PROXY_ACTIVE"] === "1";
}
let cachedFeishuProxyAgent;
let pendingFeishuProxyAgent;
async function getFeishuProxyAgent() {
	if (cachedFeishuProxyAgent) return cachedFeishuProxyAgent;
	if (pendingFeishuProxyAgent) return pendingFeishuProxyAgent;
	let resolutionError;
	const pending = resolveAmbientNodeProxyAgent({ onError: (error) => {
		resolutionError = error;
	} }).then((agent) => {
		if (!agent && isManagedProxyActive()) throw new Error("Feishu managed proxy is active but no proxy agent could be created", { cause: resolutionError });
		cachedFeishuProxyAgent = agent;
		return agent;
	});
	pendingFeishuProxyAgent = pending;
	try {
		return await pending;
	} finally {
		if (pendingFeishuProxyAgent === pending) pendingFeishuProxyAgent = void 0;
	}
}
const clientCache = /* @__PURE__ */ new Map();
function resolveSdkDomain(domain) {
	return domain === "lark" ? feishuClientSdk.Domain.Lark : feishuClientSdk.Domain.Feishu;
}
/**
* Create an HTTP instance that delegates to the Lark SDK's default instance
* but injects a default request timeout and User-Agent header to prevent
* indefinite hangs, set a standardized User-Agent per OAPI best practices, and
* keep axios from taking a separate ambient proxy path for HTTPS requests.
*/
function createFeishuHttpInstance(defaultTimeoutMs, configuredDomain) {
	const base = feishuClientSdk.defaultHttpInstance;
	const customDomain = configuredDomain && configuredDomain !== "feishu" && configuredDomain !== "lark" ? new URL(configuredDomain) : void 0;
	function resolveRequestUrl(url) {
		if (!customDomain) return url;
		const requestUrl = new URL(url);
		if (requestUrl.origin !== FEISHU_SDK_ORIGIN) return url;
		const destination = new URL(customDomain);
		destination.pathname = `${destination.pathname.replace(/\/+$/, "")}${requestUrl.pathname}`;
		destination.search = requestUrl.search;
		destination.hash = requestUrl.hash;
		return destination.toString();
	}
	async function injectRequestOptions(opts) {
		const next = {
			timeout: defaultTimeoutMs,
			...opts
		};
		if (typeof next.url === "string") next.url = resolveRequestUrl(next.url);
		const agent = await getFeishuProxyAgent();
		if (agent) {
			if (isManagedProxyActive()) {
				next.httpAgent = agent;
				next.httpsAgent = agent;
			} else {
				next.httpAgent ??= agent;
				next.httpsAgent ??= agent;
			}
			next.proxy = false;
		}
		return next;
	}
	return {
		request: async (opts) => base.request(await injectRequestOptions(normalizeMultipartUploadData(opts))),
		get: async (url, opts) => base.get(resolveRequestUrl(url), await injectRequestOptions(opts)),
		post: async (url, data, opts) => base.post(resolveRequestUrl(url), data, await injectRequestOptions(opts)),
		put: async (url, data, opts) => base.put(resolveRequestUrl(url), data, await injectRequestOptions(opts)),
		patch: async (url, data, opts) => base.patch(resolveRequestUrl(url), data, await injectRequestOptions(opts)),
		delete: async (url, opts) => base.delete(resolveRequestUrl(url), await injectRequestOptions(opts)),
		head: async (url, opts) => base.head(resolveRequestUrl(url), await injectRequestOptions(opts)),
		options: async (url, opts) => base.options(resolveRequestUrl(url), await injectRequestOptions(opts))
	};
}
/**
* Create or get a cached Feishu client for an account.
* Accepts any object with appId, appSecret, and optional domain/accountId.
*/
function createFeishuClient(creds) {
	const { accountId = "default", appId, appSecret, domain } = creds;
	const defaultHttpTimeoutMs = resolveConfiguredHttpTimeoutMs(creds);
	if (!appId || !appSecret) throw new Error(`Feishu credentials not configured for account "${accountId}"`);
	const cached = clientCache.get(accountId);
	if (cached && cached.config.appId === appId && cached.config.appSecret === appSecret && cached.config.domain === domain && cached.config.httpTimeoutMs === defaultHttpTimeoutMs) return cached.client;
	const client = new feishuClientSdk.Client({
		appId,
		appSecret,
		appType: feishuClientSdk.AppType.SelfBuild,
		domain: resolveSdkDomain(domain),
		httpInstance: createFeishuHttpInstance(defaultHttpTimeoutMs, domain)
	});
	clientCache.set(accountId, {
		client,
		config: {
			appId,
			appSecret,
			domain,
			httpTimeoutMs: defaultHttpTimeoutMs
		}
	});
	return client;
}
/**
* Create a Feishu WebSocket client for an account.
* Note: WSClient is not cached since each call creates a new connection.
*/
async function createFeishuWSClient(account, callbacks = {}) {
	const { accountId, appId, appSecret, domain } = account;
	if (!appId || !appSecret) throw new Error(`Feishu credentials not configured for account "${accountId}"`);
	const agent = await getFeishuProxyAgent();
	const defaultHttpTimeoutMs = resolveConfiguredHttpTimeoutMs(account);
	return new feishuClientSdk.WSClient({
		appId,
		appSecret,
		domain: resolveSdkDomain(domain),
		httpInstance: createFeishuHttpInstance(defaultHttpTimeoutMs, domain),
		...callbacks,
		loggerLevel: feishuClientSdk.LoggerLevel.info,
		wsConfig: FEISHU_WS_CONFIG,
		...agent ? { agent } : {}
	});
}
/**
* Create an event dispatcher for an account.
*/
function createEventDispatcher(account) {
	return new feishuClientSdk.EventDispatcher({
		encryptKey: account.encryptKey,
		verificationToken: account.verificationToken
	});
}
//#endregion
export { getFeishuUserAgent as a, createFeishuWSClient as i, createEventDispatcher as n, FEISHU_HTTP_TIMEOUT_MS as o, createFeishuClient as r, resolveConfiguredHttpTimeoutMs as s, client_exports as t };
