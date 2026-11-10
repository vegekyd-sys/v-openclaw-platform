import { n as createLoggerFromConfig } from "./logger-mZ9OSbmD.mjs";
import { t as dingtalkHttp } from "./http-client-8_Hh4c4N.mjs";
import { i as getOapiAccessToken, r as getAccessToken, t as DINGTALK_API } from "./token-xUW84QQ8.mjs";
import { n as finishAICard, t as createAICardForTarget } from "./card-CVsxDMw1.mjs";
import { r as MEDIA_MSG_TYPES } from "./session-CS6KnVQ8.mjs";
import "./utils-D0ALDrCn.mjs";
import { n as uploadMediaToDingTalk } from "./media-nyjwj7nU.mjs";
//#region src/services/messaging/mentions.ts
/**
* 从全局 cfg 里构建「bot 别名 → chatbotUserId」的解析表。
*
* 会同时扫描：
* - `channels.dingtalk-connector.accounts.*`：accountId + name + chatbotUserId
* - `bindings[]`：根据 `match.accountId` 反查 agentId
*/
function buildBotMentionTable(cfg, options = {}) {
	const accountsMap = (cfg?.channels?.["dingtalk-connector"])?.accounts || {};
	const byAccountId = /* @__PURE__ */ new Map();
	for (const [accountId, acct] of Object.entries(accountsMap)) {
		if (!acct) continue;
		byAccountId.set(accountId, {
			accountId,
			chatbotUserId: acct.chatbotUserId?.trim?.() || void 0,
			name: acct.name?.trim?.() || void 0,
			agentIds: [],
			aliases: []
		});
	}
	const bindings = cfg?.bindings;
	if (Array.isArray(bindings)) for (const b of bindings) {
		const match = b?.match;
		if (!match) continue;
		if (match.channel && match.channel !== "dingtalk-connector") continue;
		const accountId = match.accountId;
		const agentId = b.agentId;
		if (typeof accountId !== "string" || typeof agentId !== "string") continue;
		const entry = byAccountId.get(accountId);
		if (!entry) continue;
		if (!entry.agentIds.includes(agentId)) entry.agentIds.push(agentId);
	}
	const extraMap = /* @__PURE__ */ new Map();
	if (options.extraAliases) {
		for (const [alias, accountId] of Object.entries(options.extraAliases)) if (alias && accountId) extraMap.set(alias.toLowerCase(), accountId);
	}
	for (const entry of byAccountId.values()) {
		const aliasSet = /* @__PURE__ */ new Set();
		aliasSet.add(entry.accountId);
		if (entry.name) aliasSet.add(entry.name);
		for (const aid of entry.agentIds) aliasSet.add(aid);
		for (const [alias, accountId] of extraMap.entries()) if (accountId === entry.accountId) aliasSet.add(alias);
		entry.aliases = Array.from(aliasSet);
	}
	return Array.from(byAccountId.values());
}
/** chatbotUserId 加密 ID 的正则（用于检测文本里已经写成加密形式的 @） */
const CHATBOT_ID_PATTERN = /\$:LWCP_v1:\$[A-Za-z0-9+/=]+/g;
/**
* 把一批 accountId 解析成对应的 chatbotUserId 数组。
* 找不到 chatbotUserId 的账号会被跳过，并通过 `missing` 报告，方便上层 log 警告。
*/
function resolveAtAccountIdsToChatbotUserIds(cfg, atAccountIds) {
	if (!atAccountIds || atAccountIds.length === 0) return {
		resolved: [],
		missing: []
	};
	const table = buildBotMentionTable(cfg);
	const byAccountId = new Map(table.map((e) => [e.accountId, e]));
	const resolved = [];
	const missing = [];
	for (const id of atAccountIds) {
		if (!id) continue;
		const entry = byAccountId.get(id);
		if (entry?.chatbotUserId) resolved.push(entry.chatbotUserId);
		else missing.push(id);
	}
	return {
		resolved,
		missing
	};
}
/**
* 对文本中的 @ 别名做自动替换：
* 1. `@<alias>` → `@<chatbotUserId>`（alias 命中某个 bot 时）
* 2. 已经是 `@$:LWCP_v1:$xxx` 形式的 @ 原样保留
*
* 返回：
* - `text`：替换后的文本
* - `injectedChatbotUserIds`：本次替换中涉及到的 chatbotUserId 列表（调用方可合并到 atDingtalkIds）
*/
function substituteBotMentions(text, cfg, options = {}) {
	if (!text || typeof text !== "string") return {
		text: text ?? "",
		injectedChatbotUserIds: []
	};
	const table = buildBotMentionTable(cfg, options);
	const aliasToChatbotUserId = /* @__PURE__ */ new Map();
	for (const entry of table) {
		if (!entry.chatbotUserId) continue;
		for (const alias of entry.aliases) {
			const key = alias.toLowerCase();
			if (!aliasToChatbotUserId.has(key)) aliasToChatbotUserId.set(key, entry.chatbotUserId);
		}
	}
	if (aliasToChatbotUserId.size === 0) return {
		text,
		injectedChatbotUserIds: []
	};
	const aliases = Array.from(aliasToChatbotUserId.keys()).sort((a, b) => b.length - a.length);
	const injected = /* @__PURE__ */ new Set();
	let out = text;
	for (const alias of aliases) {
		const chatbotUserId = aliasToChatbotUserId.get(alias);
		const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const pattern = new RegExp(`@(${escaped})(?![A-Za-z0-9_\\u4e00-\\u9fff\\-])`, "gi");
		out = out.replace(pattern, (match, _matched, offset) => {
			if (out.slice(Math.max(0, offset - 1), offset) === "$") return match;
			injected.add(chatbotUserId);
			return `@${chatbotUserId}`;
		});
	}
	if (options.detectBareAliases) for (const alias of aliases) {
		const chatbotUserId = aliasToChatbotUserId.get(alias);
		const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		if (new RegExp(`(?<![@A-Za-z0-9_\\u4e00-\\u9fff\\-])(${escaped})(?![A-Za-z0-9_\\u4e00-\\u9fff\\-])`, "gi").test(out)) injected.add(chatbotUserId);
	}
	const rawIds = out.match(CHATBOT_ID_PATTERN) || [];
	for (const id of rawIds) injected.add(id);
	return {
		text: out,
		injectedChatbotUserIds: Array.from(injected)
	};
}
/**
* 高层入口：同时处理显式 `atAccountIds` 与文本里的自然语言 @。
*
* 用于 `dingtalk-connector.send*` 系列 Gateway 方法，在调 `sendProactive` 前把最终
* 的 `content / atDingtalkIds` 准备好。
*/
function prepareMultiBotMentions(params) {
	const { cfg, content, atAccountIds, atDingtalkIds = [], extraAliases } = params;
	const explicit = resolveAtAccountIdsToChatbotUserIds(cfg, atAccountIds);
	const substituted = substituteBotMentions(content, cfg, { extraAliases });
	const merged = /* @__PURE__ */ new Set();
	for (const id of atDingtalkIds) if (id) merged.add(id);
	for (const id of explicit.resolved) merged.add(id);
	for (const id of substituted.injectedChatbotUserIds) merged.add(id);
	let finalContent = substituted.text;
	for (const id of explicit.resolved) if (!finalContent.includes(`@${id}`)) finalContent = `${finalContent} @${id}`;
	return {
		content: finalContent,
		atDingtalkIds: Array.from(merged),
		missingAccountIds: explicit.missing
	};
}
//#endregion
//#region src/services/messaging.ts
/**
* 发送 Markdown 消息
* 支持 @用户（atUserId）和 @机器人（atDingtalkIds）
*/
async function sendMarkdownMessage(config, sessionWebhook, title, markdown, options = {}) {
	const token = await getAccessToken(config);
	let text = markdown;
	let mergedAtDingtalkIds = Array.isArray(options.atDingtalkIds) ? [...options.atDingtalkIds] : [];
	if (options.cfg) {
		const substituted = substituteBotMentions(text, options.cfg, { detectBareAliases: Boolean(options.detectBareAliases) });
		text = substituted.text;
		for (const id of substituted.injectedChatbotUserIds) if (!mergedAtDingtalkIds.includes(id)) mergedAtDingtalkIds.push(id);
	}
	if (options.atUserId) text = `${text} @${options.atUserId}`;
	if (mergedAtDingtalkIds.length) {
		for (const id of mergedAtDingtalkIds) if (!text.includes(`@${id}`)) text = `${text} @${id}`;
	}
	const body = {
		msgtype: "markdown",
		markdown: {
			title: title || "Message",
			text
		}
	};
	const atUserIds = options.atUserId ? [options.atUserId] : [];
	const atDingtalkIds = mergedAtDingtalkIds;
	if (atUserIds.length > 0 || atDingtalkIds.length > 0) body.at = {
		...atUserIds.length > 0 ? { atUserIds } : {},
		...atDingtalkIds.length > 0 ? { atDingtalkIds } : {},
		isAtAll: false
	};
	return (await dingtalkHttp.post(sessionWebhook, body, { headers: {
		"x-acs-dingtalk-access-token": token,
		"Content-Type": "application/json"
	} })).data;
}
/**
* 发送文本消息
* 支持 @用户（atUserId）和 @机器人（atDingtalkIds）
*/
async function sendTextMessage(config, sessionWebhook, text, options = {}) {
	const token = await getAccessToken(config);
	let content = text;
	let mergedAtDingtalkIds = Array.isArray(options.atDingtalkIds) ? [...options.atDingtalkIds] : [];
	if (options.cfg) {
		const substituted = substituteBotMentions(content, options.cfg, { detectBareAliases: Boolean(options.detectBareAliases) });
		content = substituted.text;
		for (const id of substituted.injectedChatbotUserIds) if (!mergedAtDingtalkIds.includes(id)) mergedAtDingtalkIds.push(id);
	}
	if (mergedAtDingtalkIds.length) {
		for (const id of mergedAtDingtalkIds) if (!content.includes(`@${id}`)) content = `${content} @${id}`;
	}
	const body = {
		msgtype: "text",
		text: { content }
	};
	const atUserIds = options.atUserId ? [options.atUserId] : [];
	const atDingtalkIds = mergedAtDingtalkIds;
	if (atUserIds.length > 0 || atDingtalkIds.length > 0) body.at = {
		...atUserIds.length > 0 ? { atUserIds } : {},
		...atDingtalkIds.length > 0 ? { atDingtalkIds } : {},
		isAtAll: false
	};
	return (await dingtalkHttp.post(sessionWebhook, body, { headers: {
		"x-acs-dingtalk-access-token": token,
		"Content-Type": "application/json"
	} })).data;
}
/**
* 智能选择 text / markdown
*/
async function sendMessage(config, sessionWebhook, text, options = {}) {
	const mergedOptions = { ...options };
	let workingText = text;
	if (options.cfg && typeof workingText === "string" && workingText.length > 0) {
		const substituted = substituteBotMentions(workingText, options.cfg, { detectBareAliases: Boolean(options.detectBareAliases) });
		workingText = substituted.text;
		if (substituted.injectedChatbotUserIds.length > 0) {
			const existing = Array.isArray(mergedOptions.atDingtalkIds) ? mergedOptions.atDingtalkIds : [];
			mergedOptions.atDingtalkIds = Array.from(new Set([...existing, ...substituted.injectedChatbotUserIds]));
		}
	}
	if (typeof workingText === "string" && workingText.length > 0) {
		const found = Array.from(new Set(workingText.match(/\$:LWCP_v1:\$[A-Za-z0-9+/=]+/g) || []));
		if (found.length > 0) {
			const existing = Array.isArray(mergedOptions.atDingtalkIds) ? mergedOptions.atDingtalkIds : [];
			mergedOptions.atDingtalkIds = Array.from(new Set([...existing, ...found]));
		}
	}
	const hasMarkdown = /^[#*>-]|[*_`#\[\]]/.test(workingText) || workingText && typeof workingText === "string" && workingText.includes("\n");
	const useMarkdown = mergedOptions.useMarkdown !== false && (mergedOptions.useMarkdown || hasMarkdown);
	const downstreamOptions = { ...mergedOptions };
	delete downstreamOptions.cfg;
	if (useMarkdown) return sendMarkdownMessage(config, sessionWebhook, downstreamOptions.title || workingText.split("\n")[0].replace(/^[#*\s\->]+/, "").slice(0, 20) || "Message", workingText, downstreamOptions);
	return sendTextMessage(config, sessionWebhook, workingText, downstreamOptions);
}
/**
* 构建普通消息的 msgKey 和 msgParam
*
* 第四个参数可携带 at 信息：
* - atDingtalkIds：对方加密 dingtalkId / chatbotUserId（多机器人协作时使用）
* - atUserIds：普通成员 staffId
* 这些 ID 会以 `@${id}` 文本附加到 content 末尾（钉钉客户端会尝试将其渲染成 @ 标签）。
*/
function buildMsgPayload(msgType, content, title, atOptions) {
	const appendAtMentions = (raw) => {
		if (!atOptions) return raw;
		let out = raw ?? "";
		const ids = [...atOptions.atDingtalkIds || [], ...atOptions.atUserIds || []];
		for (const id of ids) if (id && !out.includes(`@${id}`)) out = `${out} @${id}`;
		if (atOptions.atAll && !out.includes("@all")) out = `${out} @all`;
		return out;
	};
	switch (msgType) {
		case "markdown": {
			const text = appendAtMentions(content);
			return {
				msgKey: "sampleMarkdown",
				msgParam: {
					title: title || content.split("\n")[0].replace(/^[#*\s\->]+/, "").slice(0, 20) || "Message",
					text
				}
			};
		}
		case "link": try {
			return {
				msgKey: "sampleLink",
				msgParam: typeof content === "string" ? JSON.parse(content) : content
			};
		} catch {
			return { error: "Invalid link message format, expected JSON" };
		}
		case "actionCard": try {
			return {
				msgKey: "sampleActionCard",
				msgParam: typeof content === "string" ? JSON.parse(content) : content
			};
		} catch {
			return { error: "Invalid actionCard message format, expected JSON" };
		}
		case "image": return {
			msgKey: "sampleImageMsg",
			msgParam: { photoURL: content }
		};
		default: return {
			msgKey: "sampleText",
			msgParam: { content: appendAtMentions(content) }
		};
	}
}
/**
* 发送文本消息（用于 outbound 接口）
*/
async function sendTextToDingTalk(params) {
	const { config, target, text, replyToId } = params;
	const log = createLoggerFromConfig(config, "sendTextToDingTalk");
	if (!target || typeof target !== "string") {
		log.error("target 参数无效:", target);
		return {
			ok: false,
			error: "Invalid target parameter",
			usedAICard: false
		};
	}
	let targetParam;
	if (target.startsWith("group:")) targetParam = {
		type: "group",
		openConversationId: target.slice(6)
	};
	else if (target.startsWith("user:")) targetParam = {
		type: "user",
		userId: target.slice(5)
	};
	else if (target.startsWith("cid")) targetParam = {
		type: "group",
		openConversationId: target
	};
	else targetParam = {
		type: "user",
		userId: target
	};
	return sendProactive(config, targetParam, text, {
		msgType: "text",
		replyToId
	});
}
/**
* 发送媒体消息（用于 outbound 接口）
*/
async function sendMediaToDingTalk(params) {
	const log = createLoggerFromConfig(params.config, "sendMediaToDingTalk");
	log.info("开始处理，params:", JSON.stringify({
		target: params.target,
		text: params.text,
		mediaUrl: params.mediaUrl,
		replyToId: params.replyToId,
		hasConfig: !!params.config
	}));
	const { config, target, text, mediaUrl, replyToId, mediaLocalRoots } = params;
	if (!target || typeof target !== "string") {
		log.error("target 参数无效:", target);
		return {
			ok: false,
			error: "Invalid target parameter",
			usedAICard: false
		};
	}
	let targetParam;
	if (target.startsWith("group:")) targetParam = {
		type: "group",
		openConversationId: target.slice(6)
	};
	else if (target.startsWith("user:")) targetParam = {
		type: "user",
		userId: target.slice(5)
	};
	else if (target.startsWith("cid")) targetParam = {
		type: "group",
		openConversationId: target
	};
	else targetParam = {
		type: "user",
		userId: target
	};
	log.info("参数解析完成，mediaUrl:", mediaUrl, "type:", typeof mediaUrl);
	if (!mediaUrl) {
		log.info("mediaUrl 为空，返回错误提示");
		return sendProactive(config, targetParam, text ?? "⚠️ 缺少媒体文件 URL", {
			msgType: "text",
			replyToId
		});
	}
	if (text && text.trim().length > 0) {
		log.info("先发送文本消息:", text);
		await sendProactive(config, targetParam, text, {
			msgType: "text",
			replyToId
		});
	}
	try {
		log.info("开始获取 oapiToken");
		const oapiToken = await getOapiAccessToken(config);
		log.info("oapiToken 获取成功");
		log.info("开始解析文件扩展名，mediaUrl:", mediaUrl);
		const ext = mediaUrl.toLowerCase().split(".").pop() || "";
		log.info("文件扩展名:", ext);
		let mediaType = "file";
		if ([
			"jpg",
			"jpeg",
			"png",
			"gif",
			"bmp",
			"webp"
		].includes(ext)) mediaType = "image";
		else if ([
			"mp4",
			"avi",
			"mov",
			"mkv",
			"flv",
			"wmv",
			"webm"
		].includes(ext)) mediaType = "video";
		else if ([
			"mp3",
			"wav",
			"aac",
			"ogg",
			"m4a",
			"flac",
			"wma",
			"amr"
		].includes(ext)) mediaType = "voice";
		log.info("媒体类型判断完成:", mediaType);
		let maxSize;
		switch (mediaType) {
			case "image":
				maxSize = 10 * 1024 * 1024;
				break;
			case "voice":
				maxSize = 2 * 1024 * 1024;
				break;
			case "video":
			case "file":
				maxSize = 20 * 1024 * 1024;
				break;
			default: maxSize = 20 * 1024 * 1024;
		}
		log.info("准备调用 uploadMediaToDingTalk，参数:", {
			mediaUrl,
			mediaType,
			maxSizeMB: (maxSize / (1024 * 1024)).toFixed(0)
		});
		if (!oapiToken) {
			log.error("oapiToken 为空，无法上传媒体文件");
			return sendProactive(config, targetParam, "⚠️ 媒体文件处理失败：缺少 oapiToken", {
				msgType: "text",
				replyToId
			});
		}
		let resolvedMediaUrl = mediaUrl;
		const { toLocalPath } = await import("./media-nyjwj7nU.mjs").then((n) => n.t);
		const _fs = await import("fs");
		const _path = await import("path");
		const directPath = toLocalPath(mediaUrl);
		if (!_fs.existsSync(directPath) && mediaLocalRoots?.length && !_path.isAbsolute(directPath)) for (const root of mediaLocalRoots) {
			const candidate = _path.resolve(root, directPath);
			if (_fs.existsSync(candidate)) {
				log.info(`相对路径解析成功：${mediaUrl} → ${candidate}（基于 mediaLocalRoots）`);
				resolvedMediaUrl = candidate;
				break;
			}
		}
		const uploadResult = await uploadMediaToDingTalk(resolvedMediaUrl, mediaType, oapiToken, maxSize, log);
		log.info("uploadMediaToDingTalk 返回结果:", uploadResult);
		if (!uploadResult) {
			log.error("上传失败，返回错误提示");
			return sendProactive(config, targetParam, "⚠️ 媒体文件上传失败", {
				msgType: "text",
				replyToId
			});
		}
		log.info("提取 media_id:", uploadResult.mediaId);
		const fileName = mediaUrl.split("/").pop() || "file";
		if (mediaType === "image") {
			const result = await sendProactive(config, targetParam, uploadResult.mediaId, {
				msgType: "image",
				replyToId
			});
			return {
				...result,
				processQueryKey: result.processQueryKey || "image-message-sent"
			};
		}
		if (mediaType === "video") {
			const videoMarker = `[DINGTALK_VIDEO]{"path":"${mediaUrl}"}[/DINGTALK_VIDEO]`;
			const { processVideoMarkers } = await import("./media-nyjwj7nU.mjs").then((n) => n.t);
			await processVideoMarkers(videoMarker, "", config, oapiToken, console, true, targetParam);
			if (text?.trim()) {
				const result = await sendProactive(config, targetParam, text, {
					msgType: "text",
					replyToId
				});
				return {
					...result,
					processQueryKey: result.processQueryKey || "video-text-sent"
				};
			}
			return {
				ok: true,
				usedAICard: false,
				processQueryKey: "video-message-sent"
			};
		}
		(await import("fs")).statSync(mediaUrl);
		const fileInfo = {
			path: mediaUrl,
			fileName,
			fileType: ext || "file"
		};
		const { sendFileProactive } = await import("./media-nyjwj7nU.mjs").then((n) => n.t);
		await sendFileProactive(config, targetParam, fileInfo, uploadResult.mediaId, log);
		return {
			ok: true,
			usedAICard: false,
			processQueryKey: "file-message-sent"
		};
	} catch (err) {
		log.error("发送媒体消息失败:", err.message);
		return sendProactive(config, targetParam, `⚠️ 媒体文件处理失败: ${err.message}`, {
			msgType: "text",
			replyToId
		});
	}
}
/**
* 智能发送消息
*/
async function sendProactive(config, target, content, options = {}) {
	const log = createLoggerFromConfig(config, "sendProactive");
	log.info("开始处理，参数:", JSON.stringify({
		target,
		contentLength: content?.length,
		hasOptions: !!options
	}));
	if (!options.msgType) {
		if (/^[#*>-]|[*_`#\[\]]/.test(content) || content && typeof content === "string" && content.includes("\n")) options.msgType = "markdown";
	}
	if (target.userId || target.userIds) {
		const userId = (target.userIds || [target.userId])[0];
		log.info("发送给用户，userId:", userId);
		return sendProactiveInternal(config, {
			type: "user",
			userId
		}, content, options);
	}
	if (target.openConversationId) {
		log.info("发送给群聊，openConversationId:", target.openConversationId);
		return sendProactiveInternal(config, {
			type: "group",
			openConversationId: target.openConversationId
		}, content, options);
	}
	log.error("target 参数缺少必要字段:", target);
	return {
		ok: false,
		error: "Must specify userId, userIds, or openConversationId",
		usedAICard: false
	};
}
/**
* 内部发送实现
*/
async function sendProactiveInternal(config, target, content, options) {
	const log = createLoggerFromConfig(config, "sendProactiveInternal");
	log.info("开始处理，参数:", JSON.stringify({
		target,
		contentLength: content?.length,
		msgType: options.msgType,
		useAICard: options.useAICard,
		targetType: target?.type,
		hasTarget: !!target
	}));
	if (!target || typeof target !== "object") {
		log.error("target 参数无效:", target);
		return {
			ok: false,
			error: "Invalid target parameter",
			usedAICard: false
		};
	}
	const { msgType = "text", useAICard = true, fallbackToNormal = true, log: externalLog } = options;
	const isMediaMessage = MEDIA_MSG_TYPES.has(msgType);
	if (useAICard && !isMediaMessage) try {
		const card = await createAICardForTarget(config, target, externalLog);
		if (card) {
			await finishAICard(card, content, config, externalLog);
			return {
				ok: true,
				cardInstanceId: card.cardInstanceId,
				usedAICard: true
			};
		}
		if (!fallbackToNormal) return {
			ok: false,
			error: "Failed to create AI Card",
			usedAICard: false
		};
	} catch (err) {
		externalLog?.error?.(`AI Card 发送失败: ${err.message}`);
		if (!fallbackToNormal) return {
			ok: false,
			error: err.message,
			usedAICard: false
		};
	}
	try {
		log.info("准备发送普通消息，target.type:", target.type);
		const token = await getAccessToken(config);
		const isUser = target.type === "user";
		log.info("isUser:", isUser, "target:", JSON.stringify(target));
		const targetId = isUser ? target.userId : target.openConversationId;
		log.info("targetId:", targetId);
		const webhookUrl = isUser ? `${DINGTALK_API}/v1.0/robot/oToMessages/batchSend` : `${DINGTALK_API}/v1.0/robot/groupMessages/send`;
		const payload = buildMsgPayload(msgType, content, options.title, {
			atDingtalkIds: options.atDingtalkIds,
			atUserIds: options.atUserIds,
			atAll: options.atAll
		});
		if ("error" in payload) {
			log.error("构建消息失败:", payload.error);
			return {
				ok: false,
				error: payload.error,
				usedAICard: false
			};
		}
		const body = {
			robotCode: String(config.clientId),
			msgKey: payload.msgKey,
			msgParam: JSON.stringify(payload.msgParam)
		};
		if (isUser) body.userIds = [targetId];
		else body.openConversationId = targetId;
		externalLog?.info?.(`发送${isUser ? "单聊" : "群聊"}消息：${isUser ? "userIds=" : "openConversationId="}${targetId}`);
		const resp = await dingtalkHttp.post(webhookUrl, body, { headers: {
			"x-acs-dingtalk-access-token": token,
			"Content-Type": "application/json"
		} });
		try {
			const dataPreview = JSON.stringify(resp.data ?? {});
			const truncated = dataPreview.length > 2e3 ? `${dataPreview.slice(0, 2e3)}...(truncated)` : dataPreview;
			const msg = `发送${isUser ? "单聊" : "群聊"}消息响应：status=${resp.status}, processQueryKey=${resp.data?.processQueryKey ?? ""}, data=${truncated}`;
			log.info(msg);
			externalLog?.info?.(msg);
		} catch {
			const msg = `发送${isUser ? "单聊" : "群聊"}消息响应：status=${resp.status}, processQueryKey=${resp.data?.processQueryKey ?? ""}`;
			log.info(msg);
			externalLog?.info?.(msg);
		}
		return {
			ok: true,
			processQueryKey: resp.data?.processQueryKey,
			usedAICard: false
		};
	} catch (err) {
		const status = err?.response?.status;
		const respData = err?.response?.data;
		let respPreview = "";
		try {
			const raw = JSON.stringify(respData ?? {});
			respPreview = raw.length > 2e3 ? `${raw.slice(0, 2e3)}...(truncated)` : raw;
		} catch {
			respPreview = String(respData ?? "");
		}
		const baseMsg = err?.message ? String(err.message) : String(err);
		const extra = typeof status === "number" ? ` status=${status}${respPreview ? `, data=${respPreview}` : ""}` : respPreview ? ` data=${respPreview}` : "";
		const msg = `发送${target.type === "user" ? "单聊" : "群聊"}消息失败：${baseMsg}${extra}`;
		log.error(msg);
		externalLog?.error?.(msg);
		return {
			ok: false,
			error: baseMsg,
			usedAICard: false
		};
	}
}
//#endregion
export { sendTextMessage as a, prepareMultiBotMentions as c, sendProactive as i, sendMediaToDingTalk as n, sendTextToDingTalk as o, sendMessage as r, buildBotMentionTable as s, sendMarkdownMessage as t };
