import { n as dingtalkOapiHttp, t as dingtalkHttp } from "./http-client-8_Hh4c4N.mjs";
//#region src/utils/token.ts
const DINGTALK_API = "https://api.dingtalk.com";
const DINGTALK_OAPI = "https://oapi.dingtalk.com";
/**
* 按 clientId 分桶缓存，避免多账号串 token。
*/
const apiTokenCache = /* @__PURE__ */ new Map();
const oapiTokenCache = /* @__PURE__ */ new Map();
function cacheKey(config) {
	const clientId = String(config?.clientId ?? "").trim();
	if (!clientId) throw new Error("Invalid DingtalkConfig: clientId is required for token caching. Please ensure your configuration includes a valid clientId.");
	return clientId;
}
/**
* 获取钉钉 Access Token（新版 API）
*/
async function getAccessToken(config) {
	const now = Date.now();
	const key = cacheKey(config);
	const cached = apiTokenCache.get(key);
	if (cached && cached.expiryMs > now + 6e4) return cached.token;
	const response = await dingtalkHttp.post(`${DINGTALK_API}/v1.0/oauth2/accessToken`, {
		appKey: config.clientId,
		appSecret: config.clientSecret
	});
	const token = response.data.accessToken;
	const expireInSec = Number(response.data.expireIn ?? 0);
	apiTokenCache.set(key, {
		token,
		expiryMs: now + expireInSec * 1e3
	});
	return token;
}
/**
* 获取钉钉 OAPI Access Token（旧版 API，用于媒体上传等）
*/
async function getOapiAccessToken(config) {
	try {
		const now = Date.now();
		const key = cacheKey(config);
		const cached = oapiTokenCache.get(key);
		if (cached && cached.expiryMs > now + 6e4) return cached.token;
		const resp = await dingtalkOapiHttp.get(`${DINGTALK_OAPI}/gettoken`, { params: {
			appkey: config.clientId,
			appsecret: config.clientSecret
		} });
		if (resp.data?.errcode === 0 && resp.data?.access_token) {
			const token = String(resp.data.access_token);
			const expiresInSec = Number(resp.data.expires_in ?? 7200);
			oapiTokenCache.set(key, {
				token,
				expiryMs: now + expiresInSec * 1e3
			});
			return token;
		}
		return null;
	} catch {
		return null;
	}
}
//#endregion
export { getOapiAccessToken as i, DINGTALK_OAPI as n, getAccessToken as r, DINGTALK_API as t };
