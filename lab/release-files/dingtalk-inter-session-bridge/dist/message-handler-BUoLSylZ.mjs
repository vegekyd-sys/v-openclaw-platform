import { d as normalizeAccountId, i as resolveDingtalkAccount } from "./accounts-Dkl7e4kk.mjs";
import { r as CHANNEL_ID, t as getDingtalkRuntime } from "./runtime-C81EKBS1.mjs";
import { n as createLoggerFromConfig } from "./logger-mZ9OSbmD.mjs";
import { t as dingtalkHttp } from "./http-client-8_Hh4c4N.mjs";
import { i as getOapiAccessToken } from "./token-xUW84QQ8.mjs";
import { i as streamAICard, n as finishAICard, r as isQpsLimitError, t as createAICardForTarget } from "./card-CVsxDMw1.mjs";
import { a as sendTextMessage, i as sendProactive, r as sendMessage, t as sendMarkdownMessage } from "./messaging-JY5zinFJ.mjs";
import { n as normalizeSlashCommand, t as buildSessionContext } from "./session-CS6KnVQ8.mjs";
import { n as groupChatLacksVisibleRepliesAutomatic, r as pickEmptyReplyFallbackText, t as emptyGroupReplyLogHint } from "./utils-D0ALDrCn.mjs";
import { n as uploadMediaToDingTalk } from "./media-nyjwj7nU.mjs";
import { a as getOapiAccessToken$1, i as getAccessToken, n as addEmotionReply, s as recallEmotionReply, t as DINGTALK_API } from "./utils-legacy-CRYCK3kF.mjs";
import "./chunk-upload-aMOJxVgv.mjs";
import { i as VIDEO_MARKER_PATTERN, n as FILE_MARKER_PATTERN, o as toLocalPath, r as LOCAL_IMAGE_RE, s as uploadMediaToDingTalk$1, t as AUDIO_MARKER_PATTERN } from "./common-jKYMZkAB.mjs";
import * as fs from "fs";
import * as path from "path";
import { resolveAgentConfig } from "openclaw/plugin-sdk/agent-scope-runtime";
import { createReplyPrefixOptions } from "openclaw/plugin-sdk/channel-outbound";
// v-experience-dingtalk-v1
import * as vExperience from "./v-experience.mjs";
import { callGatewayFromCli as vCallGateway } from "openclaw/plugin-sdk/gateway-runtime";
import { formatChannelProgressDraftLineForEntry as vFormatProgressLine } from "openclaw/plugin-sdk/channel-outbound";
// v-dingtalk-inter-session-bridge-v1
import { a as vInterWebhookSendTextMessage, r as vInterWebhookSendMessage, t as vInterWebhookSendMarkdownMessage } from "./messaging-JY5zinFJ.mjs";
// A sessions_send turn (params.vInterSession, built by the connection chunk's inbound bridge,
// docs/inter-session/design.md §3.8) has no sessionWebhook: whatever the reply dispatcher would
// post through one goes to the same chat as a proactive robot message instead, so a failed AI
// card never drops the answer.
async function vInterProactive(vInter, config, text, msgType, title) {
	const result = await sendProactive(config, vInter.target, text, {
		...msgType ? { msgType } : {},
		...title ? { title } : {},
		useAICard: false,
		fallbackToNormal: true
	});
	if (!result?.ok) throw new Error(`DingTalk proactive send failed: ${result?.error || "unknown error"}`);
	return result;
}
/** The dispatcher's three webhook senders; unchanged for a person's message. */
function vInterReplySenders(vInter) {
	if (!vInter) return {
		sendMessage: vInterWebhookSendMessage,
		sendMarkdownMessage: vInterWebhookSendMarkdownMessage,
		sendTextMessage: vInterWebhookSendTextMessage
	};
	return {
		sendMessage: (config, _sessionWebhook, text, options = {}) => vInterProactive(vInter, config, text, options.useMarkdown === true ? "markdown" : options.useMarkdown === false ? "text" : void 0),
		sendMarkdownMessage: (config, _sessionWebhook, title, markdown) => vInterProactive(vInter, config, markdown, "markdown", title),
		sendTextMessage: (config, _sessionWebhook, text) => vInterProactive(vInter, config, text, "text")
	};
}
/** A final reply of a sessions_send turn, as the result handed back (ask_user question payloads never count). */
function vInterCaptureFinal(vInter, payload) {
	if (vInter.closed) return;
	vInter.finalCount += 1;
	const text = typeof payload?.text === "string" ? payload.text : "";
	if (payload?.isError === true) {
		if (text.trim()) vInter.errorText = text.trim();
		return;
	}
	if (payload?.isReasoning === true) return;
	const mediaUrls = [...new Set([...Array.isArray(payload?.mediaUrls) ? payload.mediaUrls : [], ...payload?.mediaUrl ? [payload.mediaUrl] : []].filter((url) => typeof url === "string" && url))];
	if (!text.trim() && !mediaUrls.length) return;
	vInter.finals.push({
		...text.trim() ? { text } : {},
		...mediaUrls.length ? { mediaUrls } : {}
	});
}
/**
 * Questions an inter-session turn asks in a direct chat are tracked under this chat key: the
 * synthetic turn knows the person's userId, not the DingTalk conversationId of that chat.
 */
const vInterDmChatKey = (accountId, peerId) => `${accountId ?? "default"}:dm:${peerId}`;
/** prepareDingTalkMessage for a sessions_send turn: no allowlists, no routing, the target session is the route. */
function vInterPrepared(params) {
	const vInter = params.vInterSession;
	const data = params.data;
	const isDirect = data.conversationType === "1";
	return {
		content: {
			text: String(data.text?.content ?? ""),
			messageType: "text",
			imageUrls: [],
			downloadCodes: [],
			fileNames: [],
			atDingtalkIds: [],
			atMobiles: []
		},
		sessionContext: buildSessionContext({
			accountId: params.accountId,
			senderId: data.senderStaffId || data.senderId,
			senderName: data.senderNick,
			conversationType: data.conversationType,
			conversationId: isDirect ? void 0 : data.conversationId,
			groupSubject: data.conversationTitle,
			separateSessionByConversation: params.config?.separateSessionByConversation,
			groupSessionScope: params.config?.groupSessionScope,
			sharedMemoryAcrossConversations: params.config?.sharedMemoryAcrossConversations
		}),
		agentId: vInter.req.agentId,
		sessionKey: vInter.req.sessionKey,
		agentWorkspaceDir: getDingtalkRuntime().agent.resolveAgentWorkspaceDir(params.cfg, vInter.req.agentId)
	};
}
//#region src/services/media/image.ts
/**
* 扫描内容中的本地图片路径，上传到钉钉并替换为标准 Markdown 图片语法
*
* 上传本地文件到钉钉媒体服务，获取 mediaId 后，
* 使用 ![文案](mediaId) 格式替换原始本地路径。
*/
async function processLocalImages(content, oapiToken, log) {
	if (!oapiToken) {
		log?.warn?.(`[DingTalk][Media] 无 oapiToken，跳过图片后处理`);
		return content;
	}
	let result = content;
	const mdMatches = [...content.matchAll(LOCAL_IMAGE_RE)];
	if (mdMatches.length > 0) {
		log?.info?.(`[DingTalk][Media] 检测到 ${mdMatches.length} 个 markdown 图片，开始上传...`);
		for (const match of mdMatches) {
			const [fullMatch, alt, rawPath] = match;
			const mediaId = (await uploadMediaToDingTalk(rawPath.replace(/\\ /g, " "), "image", oapiToken, 20 * 1024 * 1024, log))?.mediaId;
			if (mediaId) {
				const replacement = `![${alt}](${mediaId})`;
				result = result.replace(fullMatch, replacement);
				log?.info?.(`[DingTalk][Media] 图片已替换为 Markdown 格式: ${replacement}`);
			}
		}
	}
	return result;
}
//#endregion
//#region src/services/media/video.ts
/**
* 提取视频标记并发送视频消息
*/
async function processVideoMarkers(content, sessionWebhook, config, oapiToken, log, useProactiveApi = false, target) {
	const logPrefix = useProactiveApi ? "[DingTalk][Video][Proactive]" : "[DingTalk][Video]";
	if (!oapiToken) {
		log?.warn?.(`${logPrefix} 无 oapiToken，跳过视频处理`);
		return content;
	}
	const matches = [...content.matchAll(VIDEO_MARKER_PATTERN)];
	if (matches.length === 0) {
		log?.info?.(`${logPrefix} 未检测到视频标记，跳过处理`);
		return content;
	}
	const videoInfos = [];
	const invalidVideos = [];
	for (const match of matches) try {
		const rawPath = JSON.parse(match[1]).path;
		const absPath = toLocalPath(rawPath);
		videoInfos.push({ path: absPath });
	} catch (err) {
		log?.warn?.(`${logPrefix} 解析视频标记失败：${match[1]}`);
		invalidVideos.push(match[1]);
	}
	if (videoInfos.length === 0) {
		if (invalidVideos.length > 0) {
			log?.warn?.(`${logPrefix} 检测到无效视频标记，已忽略并移除`);
			return content.replaceAll(VIDEO_MARKER_PATTERN, "").trim();
		}
		return content;
	}
	log?.info?.(`${logPrefix} 检测到 ${videoInfos.length} 个视频，开始上传...`);
	let result = content;
	for (const match of matches) {
		const full = match[0];
		try {
			const absPath = toLocalPath(JSON.parse(match[1]).path);
			if (!fs.existsSync(absPath)) {
				log?.warn?.(`${logPrefix} 视频文件不存在：${absPath}`);
				result = result.replace(full, "⚠️ 视频文件不存在");
				continue;
			}
			const mediaId = await uploadMediaToDingTalk$1(absPath, "video", oapiToken, 20 * 1024 * 1024, log);
			result = result.replace(full, mediaId ? `[视频已上传：${mediaId}]` : "⚠️ 视频上传失败");
		} catch {
			log?.warn?.(`${logPrefix} 解析视频标记失败：${match[1]}`);
			result = result.replace(full, "");
		}
	}
	return result;
}
//#endregion
//#region src/services/media/audio.ts
/**
* 提取音频标记并发送音频消息
*/
async function processAudioMarkers(content, sessionWebhook, config, oapiToken, log, useProactiveApi = false, target) {
	const logPrefix = useProactiveApi ? "[DingTalk][Audio][Proactive]" : "[DingTalk][Audio]";
	if (!oapiToken) {
		log?.warn?.(`${logPrefix} 无 oapiToken，跳过音频处理`);
		return content;
	}
	const matches = [...content.matchAll(AUDIO_MARKER_PATTERN)];
	if (matches.length === 0) return content;
	log?.info?.(`${logPrefix} 检测到 ${matches.length} 个音频，开始上传...`);
	let result = content;
	for (const match of matches) {
		const full = match[0];
		try {
			const absPath = toLocalPath(JSON.parse(match[1]).path);
			if (!fs.existsSync(absPath)) {
				log?.warn?.(`${logPrefix} 音频文件不存在：${absPath}`);
				result = result.replace(full, "⚠️ 音频文件不存在");
				continue;
			}
			const uploadResult = await uploadMediaToDingTalk$1(absPath, "voice", oapiToken, 20 * 1024 * 1024, log);
			result = result.replace(full, uploadResult ? `[音频已上传：${uploadResult}]` : "⚠️ 音频上传失败");
		} catch {
			log?.warn?.(`${logPrefix} 解析音频标记失败：${match[1]}`);
			result = result.replace(full, "");
		}
	}
	return result.trim();
}
//#endregion
//#region src/services/media/file.ts
/**
* 提取文件标记，上传文件到钉钉，并用文本替换标记。
* 
* 注意：此函数只做「上传 + 文本替换」，不会发送独立的文件消息。
* 如果需要上传后再发送独立文件消息，请使用 media.ts 中的 processFileMarkers。
* 
* 调用方：reply-dispatcher.ts、message-handler.ts（通过 media/index.ts 导入）
*/
async function uploadAndReplaceFileMarkers(content, sessionWebhook, config, oapiToken, log, useProactiveApi = false, target) {
	const logPrefix = useProactiveApi ? "[DingTalk][File][Proactive]" : "[DingTalk][File]";
	if (!oapiToken) {
		log?.warn?.(`${logPrefix} 无 oapiToken，跳过文件处理`);
		return content;
	}
	const matches = [...content.matchAll(FILE_MARKER_PATTERN)];
	if (matches.length === 0) return content;
	log?.info?.(`${logPrefix} 检测到 ${matches.length} 个文件，开始上传...`);
	let result = content;
	for (const match of matches) {
		const full = match[0];
		try {
			const uploadResult = await uploadMediaToDingTalk$1(toLocalPath(JSON.parse(match[1]).path), "file", oapiToken, 20 * 1024 * 1024, log);
			result = result.replace(full, uploadResult ? `[文件已上传：${uploadResult}]` : "⚠️ 文件上传失败");
		} catch {
			log?.warn?.(`${logPrefix} 解析文件标记失败：${match[1]}`);
			result = result.replace(full, "");
		}
	}
	return result;
}
//#endregion
//#region src/reply-dispatcher.ts
function createDingtalkReplyDispatcher(params) {
	// inter-session bridge: a sessions_send turn sends proactively, never through a sessionWebhook.
	const vInter = params.vInterSession;
	const { sendMessage, sendMarkdownMessage, sendTextMessage } = vInterReplySenders(vInter);
	let vInterCleaned = false;
	const core = getDingtalkRuntime();
	const { cfg, agentId, conversationId, senderId, isDirect, accountId, sessionWebhook, asyncMode = false, preCreatedCard } = params;
	const account = resolveDingtalkAccount({
		cfg,
		accountId
	});
	const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
		cfg,
		agentId,
		channel: CHANNEL_ID,
		accountId
	});
	const log = createLoggerFromConfig(account.config, `DingTalk:${accountId}`);
	let currentCardTarget = null;
	// v-experience-dingtalk-v1: what the agent is doing, shown under the streaming answer.
	let vAnswerText = "";
	let vRefreshTimer = null;
	let vFinalClosedCard = false;
	const vScheduleRefresh = () => {
		if (vRefreshTimer) return;
		vRefreshTimer = setTimeout(() => {
			vRefreshTimer = null;
			void vRefreshCard();
		}, Math.max(50, updateInterval - (Date.now() - lastUpdateTime)));
		vRefreshTimer.unref?.();
	};
	// Same tool line as Feishu ("🛠️ Exec"); options are links that send the
	// choice as the person's message.
	const vWork = vExperience.createWorkView({
		sessionKey: params.vSessionKey,
		onChange: () => vScheduleRefresh(),
		log: (message) => log.info(message),
		formatTool: (name, phase) => vFormatProgressLine(account.config, { event: "tool", name, phase }, { detailMode: "status", commandText: "status" }),
		optionLink: (text) => `dtmd://dingtalkclient/sendMessage?content=${encodeURIComponent(text)}`
	});
	let accumulatedText = "";
	const deliveredFinalTexts = /* @__PURE__ */ new Set();
	/** 本轮是否已向用户发出过可见回复（final / 流式更新 / 错误兜底等） */
	let outboundUserVisibleThisTurn = false;
	if (vInter) vInter.readVisible = () => outboundUserVisibleThisTurn;
	/** 防止 onIdle / onError 重复发送 visibleReplies 配置指引 */
	let idleConfigNudgeSent = false;
	let asyncModeFullResponse = "";
	const detectedDwsProducts = /* @__PURE__ */ new Set();
	const DWS_PRODUCT_PATTERN = /\bdws\s+(aitable|calendar|chat|contact|todo|approval|attendance|report|ding|workbench|devdoc)\b/;
	let lastUpdateTime = 0;
	const updateInterval = 300;
	const deliveredErrorTypes = /* @__PURE__ */ new Set();
	let lastErrorTime = 0;
	const ERROR_COOLDOWN = 6e4;
	/**
	* 发送兜底错误消息，确保用户始终能收到反馈
	*/
	const sendFallbackErrorMessage = async (errorType, originalError, forceSend = false) => {
		const now = Date.now();
		const errorKey = `${errorType}:${conversationId}:${senderId}`;
		if (!forceSend && deliveredErrorTypes.has(errorKey)) {
			log.debug(`[DingTalk][Fallback] 跳过重复错误消息：${errorType}`);
			return;
		}
		if (!forceSend && now - lastErrorTime < ERROR_COOLDOWN) {
			log.debug(`[DingTalk][Fallback] 冷却时间内，跳过错误消息`);
			return;
		}
		const errorMessage = {
			mediaProcess: "⚠️ 媒体文件处理失败，已发送文字回复",
			sendMessage: "⚠️ 消息发送失败，请稍后重试",
			unknown: "⚠️ 抱歉，处理您的请求时出错，请稍后重试"
		}[errorType];
		log.warn(`[DingTalk][Fallback] ${errorMessage}, error: ${originalError}`);
		try {
			await sendMessage(account.config, sessionWebhook, errorMessage, {
				useMarkdown: false,
				log: params.runtime.log
			});
			deliveredErrorTypes.add(errorKey);
			lastErrorTime = now;
			outboundUserVisibleThisTurn = true;
			log.info(`[DingTalk][Fallback] ✅ 错误消息发送成功`);
		} catch (fallbackErr) {
			log.error(`[DingTalk][Fallback] ❌ 错误消息发送失败：${fallbackErr.message}`);
		}
	};
	const textChunkLimit = core.channel.text.resolveTextChunkLimit(cfg, CHANNEL_ID, accountId, { fallbackLimit: 4e3 });
	const chunkMode = core.channel.text.resolveChunkMode(cfg, CHANNEL_ID);
	const groupReplyMode = account.config?.groupReplyMode || "aicard";
	const isTextMode = !isDirect && (groupReplyMode === "text" || groupReplyMode === "markdown");
	if (isTextMode) log.info(`[DingTalk] 群聊回复模式: ${groupReplyMode}，禁用 AI Card，使用 ${groupReplyMode} 发送`);
	const streamingEnabled = !isTextMode && account.config?.streaming !== false;
	let cardCreationPromise = null;
	let streamingSealed = false;
	const CARD_WATCHDOG_TIMEOUT_MS = 600 * 1e3;
	let cardWatchdogTimer = null;
	let watchdogCard = null;
	let finishInFlight = null;
	const finishedCardIds = /* @__PURE__ */ new Set();
	const clearCardWatchdog = () => {
		if (cardWatchdogTimer) {
			clearTimeout(cardWatchdogTimer);
			cardWatchdogTimer = null;
		}
		watchdogCard = null;
	};
	const finishCardOnce = async (card, text) => {
		const id = card.cardInstanceId;
		if (id && finishedCardIds.has(id)) {
			log.info(`[DingTalk][finishCardOnce] 卡片已收口，跳过重复 finish`);
			return;
		}
		if (finishInFlight) {
			log.info(`[DingTalk][finishCardOnce] 收口进行中，等待进行中的 finish`);
			await finishInFlight;
			return;
		}
		const run = (async () => {
			await finishAICard(card, text, account.config, log);
			if (id) finishedCardIds.add(id);
		})();
		finishInFlight = run;
		try {
			await run;
		} finally {
			if (finishInFlight === run) finishInFlight = null;
		}
	};
	const forceFinishStaleCard = async () => {
		const staleCard = watchdogCard;
		cardWatchdogTimer = null;
		watchdogCard = null;
		if (!staleCard) return;
		streamingSealed = true;
		if (currentCardTarget === staleCard) currentCardTarget = null;
		const timeoutText = accumulatedText.trim() || pickEmptyReplyFallbackText(!isDirect);
		log.warn(`[DingTalk][cardWatchdog] 卡片超过 ${CARD_WATCHDOG_TIMEOUT_MS / 6e4} 分钟未收口（settle 未到达），强制结束以避免永久转圈`);
		try {
			await finishCardOnce(staleCard, timeoutText);
			outboundUserVisibleThisTurn = true;
			log.info(`[DingTalk][cardWatchdog] ✅ 强制收口成功`);
		} catch (err) {
			log.error(`[DingTalk][cardWatchdog] ❌ 强制收口失败：${err?.message || String(err)}`);
		} finally {
			accumulatedText = "";
		}
	};
	const armCardWatchdog = () => {
		if (cardWatchdogTimer) clearTimeout(cardWatchdogTimer);
		cardWatchdogTimer = setTimeout(() => {
			forceFinishStaleCard();
		}, CARD_WATCHDOG_TIMEOUT_MS);
		cardWatchdogTimer.unref?.();
	};
	const startStreaming = () => {
		if (!currentCardTarget && !cardCreationPromise && vWork.waitingForAnswer()) return Promise.resolve();
		if (vInter && !vInter.runStarted) return Promise.resolve();
		if (streamingSealed) {
			log.debug(`[DingTalk][startStreaming] 回合已 settle（sealed），跳过 AI Card 创建`);
			return Promise.resolve();
		}
		if (cardCreationPromise) return cardCreationPromise;
		if (currentCardTarget) return Promise.resolve();
		const creation = (async () => {
			if (asyncMode) {
				log.info(`[DingTalk][startStreaming] 异步模式，跳过 AI Card 创建`);
				return;
			}
			if (!streamingEnabled) {
				log.info(`[DingTalk][startStreaming] 流式功能被禁用，跳过 AI Card 创建`);
				return;
			}
			if (preCreatedCard) {
				log.info(`[DingTalk][startStreaming] 复用预创建 AI Card，cardInstanceId=${preCreatedCard.cardInstanceId}`);
				currentCardTarget = preCreatedCard;
				accumulatedText = "";
				outboundUserVisibleThisTurn = true;
				watchdogCard = preCreatedCard;
				armCardWatchdog();
				return;
			}
			log.info(`[DingTalk][startStreaming] 开始创建 AI Card...`);
			try {
				const target = isDirect ? {
					type: "user",
					userId: senderId
				} : {
					type: "group",
					openConversationId: conversationId
				};
				log.info(`[DingTalk][startStreaming] 目标：${JSON.stringify(target)}`);
				const card = await createAICardForTarget(account.config, target, log);
				currentCardTarget = card;
				accumulatedText = "";
				if (card) {
					watchdogCard = card;
					armCardWatchdog();
					log.info(`[DingTalk][startStreaming] ✅ AI Card 创建成功`);
				} else log.warn(`[DingTalk][startStreaming] AI Card 创建返回 null，静默降级到普通消息模式`);
			} catch (error) {
				log.error(`[DingTalk][startStreaming] ❌ AI Card 创建失败：${error?.message || String(error)}，静默降级到普通消息模式`);
				currentCardTarget = null;
			}
		})();
		cardCreationPromise = creation;
		const clearCreationGate = () => {
			if (cardCreationPromise === creation) cardCreationPromise = null;
		};
		creation.then(clearCreationGate, clearCreationGate);
		return creation;
	};
	const closeStreaming = async () => {
		clearCardWatchdog();
		if (cardCreationPromise) try {
			await cardCreationPromise;
		} catch {}
		const cardSnapshot = currentCardTarget;
		if (!cardSnapshot) {
			log.info(`[DingTalk][closeStreaming] 无 AI Card，跳过关闭`);
			return;
		}
		currentCardTarget = null;
		log.info(`[DingTalk][closeStreaming] 开始关闭 AI Card...`);
		try {
			let finalText = accumulatedText;
			if (!finalText.trim()) {
				const isGroup = !isDirect;
				finalText = pickEmptyReplyFallbackText(isGroup);
				log.info(`[DingTalk][closeStreaming] 累积文本为空，使用默认提示文案 (isGroup=${isGroup})`);
				if (isGroup) log.warn?.(`[DingTalk][closeStreaming] ${emptyGroupReplyLogHint()}`);
			}
			const oapiToken = await getOapiAccessToken(account.config);
			const target = isDirect ? {
				type: "user",
				userId: senderId
			} : {
				type: "group",
				openConversationId: conversationId
			};
			log.info(`[DingTalk][closeStreaming] 开始处理媒体文件，target=${JSON.stringify(target)}`);
			if (oapiToken) {
				finalText = await processLocalImages(finalText, oapiToken, log);
				finalText = await processVideoMarkers(finalText, "", account.config, oapiToken, log, true, target);
				finalText = await processAudioMarkers(finalText, "", account.config, oapiToken, log, true, target);
				finalText = await uploadAndReplaceFileMarkers(finalText, "", account.config, oapiToken, log, true, target);
				log.info(`[DingTalk][closeStreaming] 准备调用 processRawMediaPaths`);
				const { processRawMediaPaths } = await import("./media-nyjwj7nU.mjs").then((n) => n.t);
				finalText = await processRawMediaPaths(finalText, account.config, oapiToken, log, target);
				log.info(`[DingTalk][closeStreaming] processRawMediaPaths 处理完成`);
			} else log.warn(`[DingTalk][closeStreaming] oapiToken 为空，跳过媒体处理`);
			try {
				const productsToProcess = new Set(detectedDwsProducts);
				if (productsToProcess.size === 0) {
					const dwsProductMatch = finalText.match(/(?:^|\n)\s*(?:>?\s*)?(?:`\s*)?dws\s+(aitable|calendar|chat|contact|todo|approval|attendance|report|ding|workbench|devdoc)\b/m);
					if (dwsProductMatch && !finalText.includes("command not found: dws") && !finalText.includes("请先执行 dws login")) {
						productsToProcess.add(dwsProductMatch[1]);
						log.info(`[DingTalk][closeStreaming] 养成系统：正则兜底匹配到产品=${dwsProductMatch[1]}`);
					}
				} else log.info(`[DingTalk][closeStreaming] 养成系统：onCommandOutput 监听到 ${productsToProcess.size} 个 dws 产品: ${[...productsToProcess].join(", ")}`);
				if (productsToProcess.size > 0) {
					const { GamificationEngine } = await import("./game-xiyou-c3iooNRR.mjs");
					const engine = GamificationEngine.getInstanceForUser(senderId);
					if (engine.isEnabled()) {
						const primaryProduct = [...productsToProcess][0];
						const allProducts = [...productsToProcess].join("+");
						const gamificationBlock = engine.onDwsCommandResult(primaryProduct, true, `dws ${allProducts}`);
						if (gamificationBlock) {
							finalText += "\n" + gamificationBlock;
							log.info(`[DingTalk][closeStreaming] ✅ 养成系统渲染已追加，主产品=${primaryProduct}，涉及产品=${allProducts}`);
						}
					}
				}
				detectedDwsProducts.clear();
			} catch (gamErr) {
				log.warn(`[DingTalk][closeStreaming] 养成系统处理失败（不影响主流程）: ${gamErr?.message || gamErr}`);
			}
			log.info(`[DingTalk][closeStreaming] 准备调用 finishAICard，文本长度=${finalText.length}`);
			log.debug(`[DingTalk][closeStreaming] 最终发送内容长度=${finalText.length}`);
			finalText = vWork.finalText(finalText);
			await finishCardOnce(cardSnapshot, finalText);
			vStartBackground(cardSnapshot, finalText);
			outboundUserVisibleThisTurn = true;
			log.info(`[DingTalk][closeStreaming] ✅ AI Card 关闭成功`);
		} catch (error) {
			log.error(`[DingTalk][closeStreaming] ❌ AI Card 关闭失败：${error?.message || String(error)}`);
			await sendFallbackErrorMessage("mediaProcess", error?.message || String(error));
			if (accumulatedText.trim()) try {
				log.info(`[DingTalk][closeStreaming] 降级发送普通消息`);
				await sendMessage(account.config, sessionWebhook, accumulatedText, {
					useMarkdown: true,
					log: params.runtime.log
				});
				outboundUserVisibleThisTurn = true;
				log.info(`[DingTalk][closeStreaming] ✅ 降级发送成功`);
			} catch (sendErr) {
				log.error(`[DingTalk][closeStreaming] ❌ 降级发送失败：${sendErr.message}`);
			}
		} finally {
			clearCardWatchdog();
			accumulatedText = "";
		}
	};
	/**
	* 群聊且 OpenClaw 未配置 `messages.groupChat.visibleReplies=automatic` 时，
	* 若本轮结束时仍没有任何用户可见输出（上游可能未调用空 final 的 deliver），
	* 补发与空 final 一致的配置指引，避免只有「思考中」却无声。
	*/
	const maybeSendGroupVisibleRepliesIdleNudge = async () => {
		if (isDirect) return;
		if (!groupChatLacksVisibleRepliesAutomatic(cfg)) return;
		if (vInter && !vInter.runStarted) return;
		if (asyncMode) return;
		if (outboundUserVisibleThisTurn) return;
		if (idleConfigNudgeSent) return;
		idleConfigNudgeSent = true;
		log.info(`[DingTalk][idleNudge] 本轮无用户可见回复且群聊未启用 visibleReplies=automatic，发送配置指引`);
		try {
			const text = pickEmptyReplyFallbackText(true);
			log.warn(`[DingTalk][idleNudge] ${emptyGroupReplyLogHint()}`);
			for (const chunk of core.channel.text.chunkTextWithMode(text, textChunkLimit, chunkMode)) if (isTextMode) if (groupReplyMode === "markdown") await sendMarkdownMessage(account.config, sessionWebhook, chunk.split("\n")[0]?.replace(/^[#*\s\->]+/, "").slice(0, 20) || "Message", chunk, {
				cfg,
				detectBareAliases: true
			});
			else await sendTextMessage(account.config, sessionWebhook, chunk, {
				cfg,
				detectBareAliases: true
			});
			else await sendMessage(account.config, sessionWebhook, chunk, {
				useMarkdown: true,
				log: params.runtime.log,
				cfg,
				detectBareAliases: true
			});
			outboundUserVisibleThisTurn = true;
			log.info(`[DingTalk][idleNudge] ✅ 配置指引已发送`);
		} catch (e) {
			log.error(`[DingTalk][idleNudge] 发送失败: ${e?.message || e}`);
		}
	};
	// v-experience-dingtalk-v1: rewrite the card with the answer so far and the work under it.
	const vRefreshCard = async () => {
		if (streamingSealed || asyncMode || !streamingEnabled || (!vWork.hasContent() && !vAnswerText)) return;
		if (vFinalClosedCard && !currentCardTarget && !cardCreationPromise) return;
		await startStreaming();
		if (!currentCardTarget || streamingSealed) return;
		if (Date.now() - lastUpdateTime < updateInterval) {
			vScheduleRefresh();
			return;
		}
		lastUpdateTime = Date.now();
		try {
			await streamAICard(currentCardTarget, vWork.compose(vAnswerText), false, account.config, log);
			outboundUserVisibleThisTurn = true;
			if (watchdogCard) armCardWatchdog();
		} catch (err) {
			log.warn(`[DingTalk][v-experience] work refresh failed: ${err?.message || err}`);
		}
	};
	// v-experience-dingtalk-v1: the question card template (real buttons); without it options
	// are links inside the reply card.
	const vQuestionTemplate = process.env.V_DINGTALK_QUESTION_CARD_TEMPLATE?.trim() || "";
	// v-experience-dingtalk-v1: finish the current card with what it shows now; the next update
	// (after the answer) opens a new one below the question.
	const vSplitCard = async () => {
		if (cardCreationPromise) await cardCreationPromise.catch(() => {});
		const card = currentCardTarget;
		if (!card) return;
		currentCardTarget = null;
		clearCardWatchdog();
		const shown = vWork.compose(vAnswerText);
		vAnswerText = "";
		accumulatedText = "";
		try {
			await finishCardOnce(card, shown || "…");
		} catch (err) {
			log.warn(`[DingTalk][v-experience] card split failed: ${err?.message || err}`);
		}
	};
	// v-experience-dingtalk-v1: questions go into the reply card, as in Feishu. Worker runs
	// announce them on the Gateway question listener; other runtimes also send
	// a payload, which the connector used to drop. Either way: shown once.
	const vSend = async (markdown) => {
		await sendMessage(account.config, sessionWebhook, markdown, { useMarkdown: true, log: params.runtime.log, cfg });
		outboundUserVisibleThisTurn = true;
	};
	// v-experience-dingtalk-v1: a link card (credential link) as an actionCard with one button.
	const vSendCard = async (card) => {
		if (vInter) {
			await vInterProactive(vInter, account.config, JSON.stringify(vExperience.dingtalkActionCard(card)), "actionCard");
			outboundUserVisibleThisTurn = true;
			return;
		}
		const resp = await dingtalkHttp.post(sessionWebhook, { msgtype: "actionCard", actionCard: vExperience.dingtalkActionCard(card) }, { headers: { "x-acs-dingtalk-access-token": await getAccessToken(account.config), "Content-Type": "application/json" } });
		if (resp?.data?.errcode) throw new Error(`actionCard not sent: ${JSON.stringify(resp.data).slice(0, 200)}`);
		outboundUserVisibleThisTurn = true;
	};
	const vDeliverQuestionRecord = async (question) => {
		if (!question?.id) return false;
		const secret = question.questions?.some((q) => q.isSecret || q.secretStore);
		if (!secret && !vExperience.isRenderableAsk(question)) return false;
		if (!vExperience.claimQuestionDelivery(question.id)) return true;
		try {
			let vSecretHow = "";
			if (secret) {
				// A one-time entry link, only in the asker's direct chat; a group
				// gets it through the robot's 1:1 message. Else notice + cancel.
				vSecretHow = await vExperience.deliverSecretQuestion({
					record: question, channel: "dingtalk", askerId: senderId, direct: isDirect, markdown: true,
					sendHere: (text, card) => vExperience.sendCardOrText({ card, text, sendCard: vSendCard, sendText: vSend, log: (message) => log.warn(message) }),
					sendPrivate: senderId ? async (text, card) => {
						const batchSend = async (msgKey, msgParam) => {
							const resp = await dingtalkHttp.post(`${DINGTALK_API}/v1.0/robot/oToMessages/batchSend`, {
								robotCode: String(account.config.clientId ?? ""), userIds: [String(senderId)],
								msgKey, msgParam: JSON.stringify(msgParam)
							}, { headers: { "x-acs-dingtalk-access-token": await getAccessToken(account.config), "Content-Type": "application/json" } });
							const data = resp?.data ?? {};
							if (!data.processQueryKey || data.invalidStaffIdList?.length || data.flowControlledStaffIdList?.length) throw new Error(`private message not sent: ${JSON.stringify(data).slice(0, 200)}`);
						};
						await vExperience.sendCardOrText({
							card, text, log: (message) => log.warn(message),
							sendCard: (c) => batchSend("sampleActionCard", vExperience.dingtalkActionCard(c)),
							sendText: (t) => batchSend("sampleMarkdown", { title: "V 需要凭据", text: t })
						});
					} : void 0,
					cancel: () => vCallGateway("question.resolve", { config: cfg }, { id: question.id, cancel: true, resolvedBy: "dingtalk:credential-unsupported" }, { scopes: ["operator.questions"], progress: false, timeoutMs: 5000 }),
					log: (message) => log.info(message)
				});
			} else if (vQuestionTemplate && streamingEnabled && !asyncMode && !streamingSealed) {
				// Real buttons: the question gets its own interactive card below this
				// reply; the reply closes here and the answer opens a new one below.
				vWork.questionElsewhere();
				await vSplitCard();
				const outTrackId = `vq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
				const robotCode = String(account.config.clientId ?? "");
				const space = isDirect
					? { openSpaceId: `dtv1.card//IM_ROBOT.${senderId}`, imRobotOpenDeliverModel: { spaceType: "IM_ROBOT", robotCode } }
					: { openSpaceId: `dtv1.card//IM_GROUP.${conversationId}`, imGroupOpenDeliverModel: { robotCode } };
				const headers = async () => ({ "x-acs-dingtalk-access-token": await getAccessToken(account.config), "Content-Type": "application/json" });
				const resp = await dingtalkHttp.post(`${DINGTALK_API}/v1.0/card/instances/createAndDeliver`, {
					cardTemplateId: vQuestionTemplate, outTrackId, callbackType: "STREAM", userIdType: 1,
					cardData: { cardParamMap: vExperience.dingtalkQuestionCardData(question) },
					imGroupOpenSpaceModel: { supportForward: false }, imRobotOpenSpaceModel: { supportForward: false },
					...space
				}, { headers: await headers() });
				if (resp?.data?.success === false) throw new Error(`question card not delivered: ${JSON.stringify(resp.data).slice(0, 300)}`);
				outboundUserVisibleThisTurn = true;
				const resolve = (answers, resolvedBy) => vCallGateway("question.resolve", { config: cfg }, { id: question.id, answers, resolvedBy }, { scopes: ["operator.questions"], progress: false, timeoutMs: 5000 });
				vExperience.trackDingtalkQuestionCard({
					outTrackId, record: question, asker: senderId, resolve,
					onAnswered: (answers) => { vExperience.untrackChatQuestion(question.id); vWork.questionAnswered(answers); },
					log: (message) => log.info(message)
				});
				// A typed answer works too; the card then shows it.
				vExperience.trackChatQuestion({
					channel: "dingtalk", chatKey: `${accountId ?? "default"}:${conversationId}`, senderId, record: question, inline: true,
					onAnswered: (answers) => {
						vWork.questionAnswered(answers);
						const data = vExperience.closeDingtalkQuestionCard(outTrackId, "answered", answers);
						if (data) headers().then((h) => dingtalkHttp.put(`${DINGTALK_API}/v1.0/card/instances`, { outTrackId, cardData: { cardParamMap: data }, cardUpdateOptions: { updateCardDataByKey: true } }, { headers: h })).catch((err) => log.warn(`[DingTalk][v-experience] question card update failed: ${err?.message || err}`));
					}
				});
			} else if (streamingEnabled && !asyncMode && !streamingSealed) {
				// Inside the card: what was written so far stays above the question,
				// the answer continues below it.
				vWork.showQuestion(question, { prefix: vAnswerText });
				vAnswerText = "";
				accumulatedText = "";
				vExperience.trackChatQuestion({
					channel: "dingtalk", chatKey: `${accountId ?? "default"}:${conversationId}`, senderId, record: question, inline: true,
					onStaged: (staged) => vWork.stageQuestion(staged),
					onAnswered: (answers) => vWork.questionAnswered(answers)
				});
				await vRefreshCard();
			} else {
				await vSend(vExperience.askPromptMarkdown(question));
				vExperience.trackChatQuestion({ channel: "dingtalk", chatKey: `${accountId ?? "default"}:${conversationId}`, senderId, record: question });
			}
			log.info(`[DingTalk][v-experience] delivered question ${question.id}${secret ? ` (credential, ${vSecretHow})` : ""}`);
		} catch (err) {
			log.error(`[DingTalk][v-experience] question delivery failed: ${err?.message || err}`);
		}
		return true;
	};
	const vDeliverToolPayload = async (payload) => {
		const questionId = payload?.channelData?.askUser?.questionId;
		if (questionId) {
			try {
				const { question } = await vCallGateway("question.get", { config: cfg }, { id: questionId }, { scopes: ["operator.questions"], progress: false, timeoutMs: 3000 });
				if (question?.status && question.status !== "pending") return true;
				if (await vDeliverQuestionRecord(question)) return true;
			} catch (err) {
				log.warn(`[DingTalk][v-experience] question.get failed: ${err?.message || err}`);
			}
			if (!vExperience.claimQuestionDelivery(questionId)) return true;
		} else if (!payload?.channelData?.vSecretEntry && !/^\s*🔑/u.test(String(payload?.text ?? ""))) return false;
		if (String(payload?.text ?? "").trim()) await vSend(payload.text).catch((err) => log.error(`[DingTalk][v-experience] tool payload delivery failed: ${err?.message || err}`));
		return true;
	};
	let vUnrouteQuestions = vInter ? () => {} : vExperience.onQuestionRequested(params.vSessionKey, (record) => vDeliverQuestionRecord(record));
	// inter-session bridge: the run started; the AI card is created now (moved from onReplyStart).
	// Runs inside the core's run-start notification: nothing here may throw into the run.
	const vInterOnAgentRunStart = (...args) => {
		// only the call that starts this request's run: not a second one, nothing after the handler returned
		if (!vInter.onRunStart(args[0])) return;
		try {
			if (!vInterCleaned) vUnrouteQuestions = vExperience.onQuestionRequested(params.vSessionKey, (record) => vDeliverQuestionRecord(record));
			if (streamingEnabled) startStreaming().catch((err) => log.error(`[DingTalk][inter-session] startStreaming error: ${err?.message || err}`));
		} catch (err) {
			log.error(`[DingTalk][inter-session] run start handling failed: ${err?.message || err}`);
		}
	};
	// A BUSY or GATED attempt (no run) never gets onCleanup: the core calls it only once typing started.
	if (vInter) vInter.releaseUnstarted = () => {
		if (vInter.runStarted || vInterCleaned) return;
		vInterCleaned = true;
		vWork.dispose();
		vUnrouteQuestions();
	};
	// v-experience-dingtalk-v1: after the answer, one line for the session's background work.
	const vStartBackground = (card, finalText) => {
		vWork.dispose();
		if (!params.vSessionKey || !card?.cardInstanceId) return;
		// A finished AI card shows what its last finalize wrote, so the line is
		// written the same way the connector finishes a card.
		const put = async (text) => {
			await finishAICard({ ...card, tokenExpireTime: 0 }, text, account.config, log);
			log.info(`[DingTalk][v-experience] background line written to ${card.cardInstanceId}`);
		};
		vExperience.watchBackground({
			channel: `dingtalk:${accountId ?? "default"}`,
			sessionKey: params.vSessionKey,
			show: (line) => put(`${finalText}\n\n---\n\n${line}`),
			retire: () => put(finalText),
			log: (message) => log.warn(message)
		});
	};
	const delayDefaults = cfg.agents?.defaults?.humanDelay;
	const delayOverrides = resolveAgentConfig(cfg, agentId)?.humanDelay;
	return {
		dispatcherOptions: {
			...prefixOptions,
			humanDelay: delayDefaults || delayOverrides ? {
				mode: delayOverrides?.mode ?? delayDefaults?.mode,
				minMs: delayOverrides?.minMs ?? delayDefaults?.minMs,
				maxMs: delayOverrides?.maxMs ?? delayDefaults?.maxMs
			} : void 0,
			onReplyStart: () => {
				log.info(`[DingTalk][onReplyStart] 开始回复，流式 enabled=${streamingEnabled}`);
				deliveredFinalTexts.clear();
				outboundUserVisibleThisTurn = false;
				idleConfigNudgeSent = false;
				if (streamingEnabled) startStreaming().catch((err) => log.error(`[DingTalk][onReplyStart] startStreaming error: ${err?.message || err}`));
			},
			deliver: async (payload, info) => {
				if (vInter && info?.kind === "final" && !payload?.channelData?.askUser) vInterCaptureFinal(vInter, payload);
				if (info?.kind === "tool" || payload?.channelData?.askUser) {
					if (await vDeliverToolPayload(payload) || info?.kind === "tool") return;
				}
				let text = payload.text ?? "";
				log.info(`[DingTalk][deliver] 被调用：kind=${info?.kind}, textLength=${text.length}, hasText=${Boolean(text.trim())}`);
				log.debug(`[DingTalk][deliver] payload keys=${Object.keys(payload).join(",")}, info.kind=${info?.kind}`);
				if (info?.kind === "final" && text.trim()) {
					const target = isDirect ? {
						type: "user",
						userId: senderId
					} : {
						type: "group",
						openConversationId: conversationId
					};
					try {
						const oapiToken = await getOapiAccessToken(account.config);
						if (oapiToken) {
							log.info(`[DingTalk][deliver] 检测到 final 响应，准备处理裸露文件路径`);
							const { processRawMediaPaths } = await import("./media-nyjwj7nU.mjs").then((n) => n.t);
							text = await processRawMediaPaths(text, account.config, oapiToken, log, target);
							log.info(`[DingTalk][deliver] 裸露文件路径处理完成`);
						}
					} catch (err) {
						log.error(`[DingTalk][deliver] 处理裸露文件路径失败：${err.message}`);
					}
				}
				const hasText = Boolean(text.trim());
				const skipTextForDuplicateFinal = info?.kind === "final" && hasText && deliveredFinalTexts.has(text);
				if (info?.kind === "final" && !hasText) {
					const isGroup = !isDirect;
					text = pickEmptyReplyFallbackText(isGroup);
					log.info(`[DingTalk][deliver] final 响应无文本，使用默认提示文案 (isGroup=${isGroup})`);
					if (isGroup) log.warn?.(`[DingTalk][deliver] ${emptyGroupReplyLogHint()}`);
				}
				if (!(Boolean(text.trim()) && !skipTextForDuplicateFinal)) {
					log.info(`[DingTalk][deliver] 跳过发送：hasText=${hasText}, skipTextForDuplicateFinal=${skipTextForDuplicateFinal}`);
					return;
				}
				if (asyncMode) {
					log.info(`[DingTalk][deliver] 异步模式，累积响应`);
					asyncModeFullResponse = text;
					return;
				}
				if (info?.kind === "block") {
					if (!streamingEnabled) {
						log.info(`[DingTalk][deliver] block 消息，流式未启用，丢弃`);
						return;
					}
					if (streamingSealed) {
						log.info(`[DingTalk][deliver] block 晚于 settle 到达，降级为普通消息发送，文本长度=${text.length}`);
						try {
							for (const chunk of core.channel.text.chunkTextWithMode(text, textChunkLimit, chunkMode)) await sendMessage(account.config, sessionWebhook, chunk, {
								useMarkdown: true,
								log: params.runtime.log,
								cfg,
								detectBareAliases: true
							});
							outboundUserVisibleThisTurn = true;
							log.info(`[DingTalk][deliver] ✅ 迟到 block 降级发送成功`);
						} catch (lateErr) {
							log.error(`[DingTalk][deliver] ❌ 迟到 block 降级发送失败：${lateErr.message}`);
						}
						return;
					}
					log.info(`[DingTalk][deliver] block 消息，追加到流式 AI Card，文本长度=${text.length}`);
					await startStreaming();
					if (currentCardTarget) {
						const now = Date.now();
						if (now - lastUpdateTime >= updateInterval) {
							lastUpdateTime = now;
							try {
								await streamAICard(currentCardTarget, text, false, account.config, log);
								outboundUserVisibleThisTurn = true;
								if (watchdogCard) armCardWatchdog();
								log.info(`[DingTalk][deliver] ✅ block 更新到 AI Card 成功`);
							} catch (streamErr) {
								log.error(`[DingTalk][deliver] ❌ block 更新 AI Card 失败：${streamErr.message}`);
							}
						}
					} else log.warn(`[DingTalk][deliver] block 消息：AI Card 创建失败，丢弃该 block`);
					return;
				}
				if (info?.kind === "final" && streamingEnabled) {
					log.info(`[DingTalk][deliver] final 响应，流式模式`);
					await startStreaming();
					if (currentCardTarget) {
						accumulatedText = text;
						log.info(`[DingTalk][deliver] 调用 closeStreaming 完成 AI Card`);
						vFinalClosedCard = true;
						if (vRefreshTimer) {
							clearTimeout(vRefreshTimer);
							vRefreshTimer = null;
						}
						await closeStreaming();
						deliveredFinalTexts.add(text);
						return;
					} else log.warn(`[DingTalk][deliver] ⚠️ AI Card 创建失败，降级到非流式发送`);
				}
				if (info?.kind === "final") {
					log.info(`[DingTalk][deliver] 降级到非流式发送，文本长度=${text.length}, isTextMode=${isTextMode}, groupReplyMode=${groupReplyMode}`);
					try {
						for (const chunk of core.channel.text.chunkTextWithMode(text, textChunkLimit, chunkMode)) if (isTextMode) if (groupReplyMode === "markdown") await sendMarkdownMessage(account.config, sessionWebhook, chunk.split("\n")[0]?.replace(/^[#*\s\->]+/, "").slice(0, 20) || "Message", chunk, {
							cfg,
							detectBareAliases: true
						});
						else await sendTextMessage(account.config, sessionWebhook, chunk, {
							cfg,
							detectBareAliases: true
						});
						else await sendMessage(account.config, sessionWebhook, chunk, {
							useMarkdown: true,
							log: params.runtime.log,
							cfg,
							detectBareAliases: true
						});
						outboundUserVisibleThisTurn = true;
						log.info(`[DingTalk][deliver] ✅ 非流式发送成功`);
						deliveredFinalTexts.add(text);
					} catch (error) {
						log.error(`[DingTalk][deliver] ❌ 非流式发送失败：${error.message}`);
						params.runtime.error?.(`dingtalk[${account.accountId}]: non-streaming delivery failed: ${String(error)}`);
						await sendFallbackErrorMessage("sendMessage", error.message);
					}
					return;
				}
			},
			onError: async (error, info) => {
				log.error(`[DingTalk][onError] ${info.kind} reply failed: ${String(error)}`);
				params.runtime.error?.(`dingtalk[${account.accountId}] ${info.kind} reply failed: ${String(error)}`);
				streamingSealed = true;
				await closeStreaming();
				await maybeSendGroupVisibleRepliesIdleNudge();
			},
			onIdle: async () => {
				log.info(`[DingTalk][onIdle] 回复空闲，关闭 AI Card`);
				streamingSealed = true;
				await closeStreaming();
				await maybeSendGroupVisibleRepliesIdleNudge();
			},
			onCleanup: () => {
				log.info(`[DingTalk][onCleanup] 清理回调`);
				vInterCleaned = true;
				vWork.dispose();
				vUnrouteQuestions();
			}
		},
		replyOptions: {
			onModelSelected,
			...vInter && {
				runId: vInter.req.runId,
				vInterSession: vInter.seam,
				onAgentRunStart: vInterOnAgentRunStart,
				onAgentRunTerminalOutcome: (outcome) => {
					if (!vInter.closed && (outcome === "failed" || !vInter.terminal)) vInter.terminal = outcome;
				}
			},
			...streamingEnabled && { onPartialReply: async (payload) => {
				log.info(`[DingTalk][onPartialReply] 被调用，payload.text=${payload.text ? payload.text.length : "null"}`);
				log.debug(`[DingTalk][onPartialReply] textLength=${payload.text?.length ?? 0}`);
				if (!payload.text) {
					log.debug(`[DingTalk][onPartialReply] 空文本，跳过`);
					return;
				}
				log.debug(`[DingTalk][onPartialReply] 收到部分响应，文本长度=${payload.text.length}`);
				if (asyncMode) {
					log.debug(`[DingTalk][onPartialReply] 异步模式，累积响应`);
					asyncModeFullResponse = payload.text;
					return;
				}
				await startStreaming();
				if (currentCardTarget) {
					accumulatedText = payload.text;
					vAnswerText = payload.text;
					const now = Date.now();
					if (now - lastUpdateTime >= updateInterval) {
						const { FILE_MARKER_PATTERN, VIDEO_MARKER_PATTERN, AUDIO_MARKER_PATTERN } = await import("./common-jKYMZkAB.mjs").then((n) => n.a);
						const displayContent = accumulatedText.replace(FILE_MARKER_PATTERN, "").replace(VIDEO_MARKER_PATTERN, "").replace(AUDIO_MARKER_PATTERN, "").trim();
						log.debug(`[DingTalk][onPartialReply] 更新 AI Card，显示文本长度=${displayContent.length}`);
						lastUpdateTime = now;
						try {
							vAnswerText = displayContent;
							await streamAICard(currentCardTarget, vWork.compose(displayContent), false, account.config, log);
							outboundUserVisibleThisTurn = true;
							if (watchdogCard) armCardWatchdog();
							log.debug(`[DingTalk][onPartialReply] ✅ AI Card 更新成功`);
						} catch (err) {
							if (isQpsLimitError(err)) log.warn(`[DingTalk][onPartialReply] AI Card 流式更新遇到 QPS 限流，已在内部退避重试；本次跳过，等待下一次 partial 更新补齐内容`);
							else {
								log.error(`[DingTalk][onPartialReply] ❌ AI Card 更新失败：${err.message}`);
								await sendFallbackErrorMessage("sendMessage", err.message);
							}
						}
					} else {
						log.debug(`[DingTalk][onPartialReply] 节流控制，跳过本次更新（距离上次更新 ${now - lastUpdateTime}ms）`);
						vScheduleRefresh();
					}
				} else log.warn(`[DingTalk][onPartialReply] ⚠️ AI Card 不存在，跳过更新`);
			} },
			allowToolLifecycleWhenProgressHidden: true,
			commentaryProgressEnabled: true,
			suppressDefaultToolProgressMessages: true,
			onToolStart: (payload) => {
				if (watchdogCard) armCardWatchdog();
				vWork.toolStart(payload);
			},
			onItemEvent: (payload) => {
				vWork.itemEvent(payload);
			},
			onPlanUpdate: (payload) => {
				vWork.planUpdate(payload);
			},
			onCompactionStart: () => {
				vWork.compaction(true);
			},
			onCompactionEnd: () => {
				vWork.compaction(false);
			},
			onCommandOutput: (payload) => {
				if (watchdogCard) armCardWatchdog();
				const dwsMatch = (payload.title || payload.name || "").match(DWS_PRODUCT_PATTERN) || payload.output?.match(DWS_PRODUCT_PATTERN);
				if (dwsMatch) {
					const product = dwsMatch[1];
					if (!(payload.phase === "end" && payload.exitCode !== null && payload.exitCode !== 0)) {
						detectedDwsProducts.add(product);
						log.info(`[DingTalk][onCommandOutput] 检测到 dws 产品: ${product}，phase=${payload.phase}, exitCode=${payload.exitCode}`);
					} else log.info(`[DingTalk][onCommandOutput] dws 命令执行失败，跳过: ${product}，exitCode=${payload.exitCode}`);
				}
			}
		},
		getAsyncModeResponse: () => asyncModeFullResponse
	};
}
//#endregion
//#region src/core/message-handler.ts
/**
* 解析 data.content 字段：可能是对象，也可能是 JSON 字符串（钉钉部分 API 版本会将 content 序列化为字符串）。
* 返回解析后的对象，或 null（字段不存在 / 无法解析）。
*/
function resolveContent(data) {
	const raw = data?.content;
	if (raw == null) return null;
	if (typeof raw === "object") return raw;
	if (typeof raw === "string") try {
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object") return parsed;
	} catch {}
	return null;
}
/**
* 从消息的内容容器（data.text 或 data.content）中提取引用消息文本，最多递归 maxDepth 层。
* 对齐 Rust chatbot.rs 的 extract_quoted_msg_text 逻辑。
*
* 钉钉引用消息结构：
* { isReplyMsg: true, repliedMsg: { msgType, content, msgId, senderId } }
*/
function extractQuotedMsgText(container, maxDepth) {
	if (maxDepth <= 0 || !container) return null;
	if (!container.isReplyMsg) return null;
	const repliedMsg = container.repliedMsg;
	if (!repliedMsg) return null;
	const msgType = repliedMsg.msgType || "text";
	let contentObj = null;
	const rawContent = repliedMsg.content;
	if (rawContent && typeof rawContent === "object") contentObj = rawContent;
	else if (typeof rawContent === "string") try {
		const parsed = JSON.parse(rawContent);
		if (parsed && typeof parsed === "object") contentObj = parsed;
	} catch {}
	let bodyText = "";
	switch (msgType) {
		case "text":
			bodyText = contentObj?.text?.trim() || repliedMsg.text?.trim() || "";
			if (contentObj?.isReplyMsg) {
				const nested = extractQuotedMsgText(contentObj, maxDepth - 1);
				if (nested) bodyText = bodyText ? `${bodyText}\n${nested}` : nested;
			}
			break;
		case "richText":
			bodyText = (contentObj?.richText || []).filter((item) => item.text && item.msgType !== "skill" && !item.skillData).map((item) => item.text).join("");
			break;
		case "picture":
			bodyText = "[图片]";
			break;
		case "video":
			bodyText = "[视频]";
			break;
		case "audio":
			bodyText = contentObj?.recognition || "[语音消息]";
			break;
		case "file":
			bodyText = `[文件: ${contentObj?.fileName || "unknown"}]`;
			break;
		case "markdown":
			bodyText = contentObj?.text?.trim() || "[markdown消息]";
			break;
		case "interactiveCard": {
			const cardUrl = contentObj?.biz_custom_action_url || repliedMsg.biz_custom_action_url || "";
			bodyText = cardUrl ? `收到交互式卡片链接：${cardUrl}` : "[interactiveCard消息]";
			break;
		}
		default: bodyText = `[${msgType}消息]`;
	}
	if (!bodyText) return null;
	return `[引用] ${bodyText}`;
}
/**
* 从 richText 列表中提取媒体附件（图片 downloadCode）。
* 兼容新结构（content.richText）和旧结构（richText.richTextList）。
*/
function extractRichTextMediaAttachments(data, content) {
	const imageUrls = [];
	const downloadCodes = [];
	const fileNames = [];
	const richList = content?.richText || data?.richText?.richTextList || [];
	for (const item of richList) {
		if (item.pictureUrl) imageUrls.push(item.pictureUrl);
		if (item.downloadCode) {
			const itemType = item.type || "";
			if (itemType === "picture" || !itemType) imageUrls.push(`downloadCode:${item.downloadCode}`);
			else if (itemType === "video") {
				downloadCodes.push(item.downloadCode);
				fileNames.push(item.fileName || "video.mp4");
			} else if (itemType === "audio") {
				downloadCodes.push(item.downloadCode);
				fileNames.push(item.fileName || "audio.amr");
			} else if (itemType === "file") {
				downloadCodes.push(item.downloadCode);
				fileNames.push(item.fileName || "文件");
			}
		}
	}
	return {
		imageUrls,
		downloadCodes,
		fileNames
	};
}
/**
* 从 repliedMsg 中提取媒体附件（用于 reply 类型消息）。
*/
function extractRepliedMsgMediaAttachments(repliedMsg) {
	const imageUrls = [];
	const downloadCodes = [];
	const fileNames = [];
	if (!repliedMsg) return {
		imageUrls,
		downloadCodes,
		fileNames
	};
	const msgType = repliedMsg.msgType || "text";
	let contentObj = null;
	const rawContent = repliedMsg.content;
	if (rawContent && typeof rawContent === "object") contentObj = rawContent;
	else if (typeof rawContent === "string") try {
		const parsed = JSON.parse(rawContent);
		if (parsed && typeof parsed === "object") contentObj = parsed;
	} catch {}
	switch (msgType) {
		case "picture":
		case "video":
		case "audio": {
			const code = contentObj?.downloadCode;
			if (code) if (msgType === "picture") imageUrls.push(`downloadCode:${code}`);
			else {
				downloadCodes.push(code);
				fileNames.push(contentObj?.fileName || (msgType === "video" ? "video.mp4" : "audio.amr"));
			}
			break;
		}
		case "file": {
			const code = contentObj?.downloadCode;
			if (code) {
				downloadCodes.push(code);
				fileNames.push(contentObj?.fileName || "文件");
			}
			break;
		}
		case "richText": {
			const richList = contentObj?.richText || [];
			for (const item of richList) if (item.downloadCode) imageUrls.push(`downloadCode:${item.downloadCode}`);
			break;
		}
		default: break;
	}
	return {
		imageUrls,
		downloadCodes,
		fileNames
	};
}
function extractMessageContent(data) {
	const msgtype = data.msgtype || "text";
	switch (msgtype) {
		case "text": {
			const atDingtalkIds = data.text?.at?.atDingtalkIds || [];
			const atMobiles = data.text?.at?.atMobiles || [];
			const bodyText = data.text?.content?.trim() || "";
			const hasReply = !!data.text?.isReplyMsg;
			const quotedText = extractQuotedMsgText(data.text, 3);
			const text = quotedText ? `${bodyText}\n${quotedText}` : bodyText;
			const repliedMsgInText = data.text?.repliedMsg;
			const { imageUrls, downloadCodes, fileNames } = extractRepliedMsgMediaAttachments(repliedMsgInText);
			let interactiveCardUrl;
			if (hasReply && repliedMsgInText) {
				const extractedUrl = extractFirstUrlFromText((typeof repliedMsgInText.content === "object" ? repliedMsgInText.content : (() => {
					try {
						return JSON.parse(repliedMsgInText.content);
					} catch {
						return null;
					}
				})())?.text || repliedMsgInText.text || "");
				if (extractedUrl) interactiveCardUrl = extractedUrl;
			}
			return {
				text,
				messageType: hasReply ? "reply" : "text",
				imageUrls,
				downloadCodes,
				fileNames,
				atDingtalkIds,
				atMobiles,
				interactiveCardUrl
			};
		}
		case "richText": {
			const content = resolveContent(data);
			const textParts = [];
			const richList = content?.richText || data?.richText?.richTextList || [];
			for (const item of richList) {
				const isSkillItem = item.type === "skill" || !!item.skillData;
				if (item.text && !isSkillItem) textParts.push(item.text);
				if (isSkillItem && item.skillData) {
					const skillId = item.skillData.skillId || "";
					const displayName = item.skillData.displayName || "";
					const iconUrl = item.skillData.iconUrl || "";
					const skillTag = iconUrl ? `<skill data-id="${skillId}" data-name="${displayName}" icon="${iconUrl}">` : `<skill data-id="${skillId}" data-name="${displayName}">`;
					textParts.push(skillTag);
				}
				if (item.pictureUrl) {}
			}
			const hasReply = !!content?.isReplyMsg;
			const quotedText = extractQuotedMsgText(content, 3);
			if (quotedText) textParts.push(quotedText);
			const richTextMedia = extractRichTextMediaAttachments(data, content);
			const repliedMsgInRichText = content?.repliedMsg;
			const repliedMedia = extractRepliedMsgMediaAttachments(repliedMsgInRichText);
			const imageUrls = [...richTextMedia.imageUrls, ...repliedMedia.imageUrls];
			const downloadCodes = [...richTextMedia.downloadCodes, ...repliedMedia.downloadCodes];
			const fileNames = [...richTextMedia.fileNames, ...repliedMedia.fileNames];
			return {
				text: textParts.join("") || (imageUrls.length > 0 ? "[图片]" : downloadCodes.length > 0 ? "[媒体文件]" : "[富文本消息]"),
				messageType: hasReply ? "reply" : "richText",
				imageUrls,
				downloadCodes,
				fileNames,
				atDingtalkIds: [],
				atMobiles: []
			};
		}
		case "picture": {
			const content = resolveContent(data);
			const downloadCode = content?.downloadCode || "";
			const pictureUrl = content?.pictureUrl || "";
			const imageUrls = [];
			const downloadCodes = [];
			if (pictureUrl) imageUrls.push(pictureUrl);
			if (downloadCode) downloadCodes.push(downloadCode);
			return {
				text: "[图片]",
				messageType: "picture",
				imageUrls,
				downloadCodes,
				fileNames: [],
				atDingtalkIds: [],
				atMobiles: []
			};
		}
		case "audio": {
			const content = resolveContent(data);
			const recognition = content?.recognition || data?.audio?.recognition || "[语音消息]";
			const audioDownloadCode = content?.downloadCode || "";
			const audioFileName = content?.fileName || "audio.amr";
			const downloadCodes = [];
			const fileNames = [];
			if (audioDownloadCode) {
				downloadCodes.push(audioDownloadCode);
				fileNames.push(audioFileName);
			}
			return {
				text: recognition,
				messageType: "audio",
				imageUrls: [],
				downloadCodes,
				fileNames,
				atDingtalkIds: [],
				atMobiles: []
			};
		}
		case "video": {
			const content = resolveContent(data);
			const videoDownloadCode = content?.downloadCode || "";
			const videoFileName = content?.fileName || "video.mp4";
			const downloadCodes = [];
			const fileNames = [];
			if (videoDownloadCode) {
				downloadCodes.push(videoDownloadCode);
				fileNames.push(videoFileName);
			}
			return {
				text: "[视频]",
				messageType: "video",
				imageUrls: [],
				downloadCodes,
				fileNames,
				atDingtalkIds: [],
				atMobiles: []
			};
		}
		case "file": {
			const content = resolveContent(data);
			const fileName = content?.fileName || data?.file?.fileName || "文件";
			const downloadCode = content?.downloadCode || "";
			const downloadCodes = [];
			const fileNames = [];
			if (downloadCode) {
				downloadCodes.push(downloadCode);
				fileNames.push(fileName);
			}
			return {
				text: `[文件: ${fileName}]`,
				messageType: "file",
				imageUrls: [],
				downloadCodes,
				fileNames,
				atDingtalkIds: [],
				atMobiles: []
			};
		}
		case "markdown": return {
			text: data.text?.content?.trim() || resolveContent(data)?.text?.trim() || "[markdown消息]",
			messageType: "markdown",
			imageUrls: [],
			downloadCodes: [],
			fileNames: [],
			atDingtalkIds: [],
			atMobiles: []
		};
		case "actionCard": {
			const content = resolveContent(data);
			const title = content?.title?.trim() || "";
			const body = content?.text?.trim() || "";
			const actionUrls = (content?.actionUrlItemList || []).map((item) => item.actionUrl?.trim()).filter((url) => !!url);
			const sections = [];
			if (title) sections.push(title);
			if (body) sections.push(body);
			if (actionUrls.length > 0) {
				const linkSection = actionUrls.length === 1 ? `操作链接：${actionUrls[0]}` : `操作链接：\n- ${actionUrls.join("\n- ")}`;
				sections.push(linkSection);
			}
			return {
				text: sections.length > 0 ? sections.join("\n\n") : "[actionCard消息]",
				messageType: "actionCard",
				imageUrls: [],
				downloadCodes: [],
				fileNames: [],
				atDingtalkIds: [],
				atMobiles: [],
				actionCardUrl: actionUrls.length === 1 ? actionUrls[0] : void 0
			};
		}
		case "interactiveCard": {
			const interactiveCardUrl = (resolveContent(data)?.biz_custom_action_url || data?.biz_custom_action_url || "").trim() || void 0;
			if (interactiveCardUrl) return {
				text: `收到交互式卡片链接：${interactiveCardUrl}`,
				messageType: "interactiveCard",
				imageUrls: [],
				downloadCodes: [],
				fileNames: [],
				atDingtalkIds: [],
				atMobiles: [],
				interactiveCardUrl
			};
			return {
				text: "[interactiveCard消息]",
				messageType: "interactiveCard",
				imageUrls: [],
				downloadCodes: [],
				fileNames: [],
				atDingtalkIds: [],
				atMobiles: []
			};
		}
		case "reply": {
			const replyContainer = data.text || resolveContent(data);
			const bodyText = data.text?.content?.trim() || "";
			const quotedText = extractQuotedMsgText(replyContainer, 3);
			const text = quotedText ? `${bodyText}\n${quotedText}` : bodyText || "[引用消息]";
			const { imageUrls, downloadCodes, fileNames } = extractRepliedMsgMediaAttachments(data.text?.repliedMsg || resolveContent(data)?.repliedMsg);
			return {
				text,
				messageType: "reply",
				imageUrls,
				downloadCodes,
				fileNames,
				atDingtalkIds: [],
				atMobiles: []
			};
		}
		default: return {
			text: data.text?.content?.trim() || `[${msgtype}消息]`,
			messageType: msgtype,
			imageUrls: [],
			downloadCodes: [],
			fileNames: [],
			atDingtalkIds: [],
			atMobiles: []
		};
	}
}
/**
* 从文本内容中提取第一个 HTTP/HTTPS URL。
* 用于处理引用消息文本里直接粘贴链接的场景（如引用一条含 alidocs 链接的文本消息）。
*/
function extractFirstUrlFromText(text) {
	const urlMatch = text.match(/https?:\/\/[^\s\u3000\u3001\uff0c\u3002\uff01\uff1f"'<>]+/);
	return urlMatch ? urlMatch[0].trim() : null;
}
/**
* 根据消息中的 interactiveCardUrl / actionCardUrl 构建链接路由 system prompt。
* 对齐 Rust agent_support.rs 的 build_link_routing_prompt 逻辑：
* - alidocs.dingtalk.com → 使用 dws skill 的 doc 能力读取
* - 其他 URL → 使用 read_url 读取
* 返回 null 表示无需注入额外 prompt。
*/
function buildLinkRoutingPrompt(content) {
	const interactiveCardUrl = content.interactiveCardUrl?.trim();
	const actionCardUrl = content.actionCardUrl?.trim();
	const linkUrl = interactiveCardUrl || actionCardUrl;
	if (!linkUrl) return null;
	const cardKind = interactiveCardUrl ? "interactive card" : "action card";
	let host = null;
	try {
		host = new URL(linkUrl).hostname;
	} catch {}
	if (host === "alidocs.dingtalk.com") return [
		`The inbound DingTalk message is an ${cardKind} with a document link.`,
		`Linked URL: ${linkUrl}`,
		`This URL is hosted on \`alidocs.dingtalk.com\`.`,
		`You MUST inspect and summarize it via the \`dws\` skill using its \`doc\` product capability.`,
		`If \`dws\` is not already visible in the skill snapshot, call \`search_skills\` to locate it, then call \`use_skill\` with the exact id.`,
		`Never switch to browser-based reading for this link. Browser incompatibility or markdown export limitations are not final answers.`,
		`Do not use \`read_url\` for this link.`,
		`Reply to the DingTalk user with a concise summary of the linked document content.`
	].join("\n");
	return [
		`The inbound DingTalk message is an ${cardKind} with a link.`,
		`Linked URL: ${linkUrl}`,
		`For this URL, you MUST use \`read_url\` to inspect the linked content before answering.`,
		`Do not use the \`dws\` skill for this link.`,
		`Reply to the DingTalk user with a concise summary of the linked content.`
	].join("\n");
}
async function downloadImageToFile(downloadUrl, agentWorkspaceDir, log) {
	try {
		log?.info?.(`开始下载图片: ${downloadUrl.slice(0, 100)}...`);
		const resp = await dingtalkHttp.get(downloadUrl, {
			proxy: false,
			headers: { "Content-Type": void 0 },
			responseType: "arraybuffer",
			timeout: 3e4
		});
		const buffer = Buffer.from(resp.data);
		const contentType = resp.headers["content-type"] || "image/jpeg";
		const ext = contentType.includes("png") ? ".png" : contentType.includes("gif") ? ".gif" : contentType.includes("webp") ? ".webp" : ".jpg";
		const mediaDir = path.join(agentWorkspaceDir, "media", "inbound");
		fs.mkdirSync(mediaDir, { recursive: true });
		const tmpFile = path.join(mediaDir, `openclaw-media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
		fs.writeFileSync(tmpFile, buffer);
		log?.info?.(`图片下载成功: size=${buffer.length} bytes, type=${contentType}, path=${tmpFile}`);
		return tmpFile;
	} catch (err) {
		log?.error?.(`图片下载失败: ${err.message}`);
		return null;
	}
}
async function downloadMediaByCode(downloadCode, config, agentWorkspaceDir, log) {
	try {
		const token = await getAccessToken(config);
		log?.info?.(`通过 downloadCode 下载媒体: ${downloadCode.slice(0, 30)}...`);
		const resp = await dingtalkHttp.post(`${DINGTALK_API}/v1.0/robot/messageFiles/download`, {
			downloadCode,
			robotCode: String(config.clientId)
		}, {
			headers: {
				"x-acs-dingtalk-access-token": token,
				"Content-Type": "application/json"
			},
			timeout: 3e4
		});
		const downloadUrl = resp.data?.downloadUrl;
		if (!downloadUrl) {
			log?.warn?.(`downloadCode 换取 downloadUrl 失败: ${JSON.stringify(resp.data)}`);
			return null;
		}
		return downloadImageToFile(downloadUrl, agentWorkspaceDir, log);
	} catch (err) {
		log?.error?.(`downloadCode 下载失败: ${err.message}`);
		return null;
	}
}
async function getFileDownloadUrl(downloadCode, fileName, config, log) {
	try {
		const token = await getAccessToken(config);
		log?.info?.(`获取文件下载链接: ${fileName}`);
		const resp = await dingtalkHttp.post(`${DINGTALK_API}/v1.0/robot/messageFiles/download`, {
			downloadCode,
			robotCode: String(config.clientId)
		}, {
			headers: {
				"x-acs-dingtalk-access-token": token,
				"Content-Type": "application/json"
			},
			timeout: 3e4
		});
		const downloadUrl = resp.data?.downloadUrl;
		if (!downloadUrl) {
			log?.warn?.(`downloadCode 换取 downloadUrl 失败: ${JSON.stringify(resp.data)}`);
			return null;
		}
		log?.info?.(`获取下载链接成功: ${fileName}`);
		return downloadUrl;
	} catch (err) {
		log?.error?.(`获取下载链接失败: ${err.message}`);
		return null;
	}
}
/**
* 下载文件到本地
*/
async function downloadFileToLocal(downloadUrl, fileName, agentWorkspaceDir, log) {
	try {
		log?.info?.(`开始下载文件: ${fileName}`);
		const resp = await dingtalkHttp.get(downloadUrl, {
			proxy: false,
			headers: { "Content-Type": void 0 },
			responseType: "arraybuffer",
			timeout: 6e4
		});
		const buffer = Buffer.from(resp.data);
		const mediaDir = path.join(agentWorkspaceDir, "media", "inbound");
		fs.mkdirSync(mediaDir, { recursive: true });
		const sanitizeFileName = (name) => {
			let safe = name.replace(/[/\\]/g, "_");
			safe = safe.replace(/[<>:"|?*\x00-\x1f]/g, "_");
			safe = safe.replace(/^\.+/, "");
			if (safe.length > 200) {
				const ext = path.extname(safe);
				safe = path.basename(safe, ext).substring(0, 200 - ext.length) + ext;
			}
			if (!safe) safe = "unnamed_file";
			return safe;
		};
		const ext = path.extname(fileName);
		const baseName = path.basename(fileName, ext);
		const timestamp = Date.now();
		const safeFileName = `${sanitizeFileName(baseName)}-${timestamp}${ext}`;
		const localPath = path.join(mediaDir, safeFileName);
		fs.writeFileSync(localPath, buffer);
		log?.info?.(`文件下载成功: ${fileName}, size=${buffer.length} bytes, path=${localPath}`);
		return localPath;
	} catch (err) {
		log?.error?.(`downloadFileToLocal 异常: ${err.message}\n${err.stack}`);
		return null;
	}
}
/**
* 解析 Word 文档 (.docx)
*/
async function parseDocxFile(filePath, log) {
	try {
		log?.info?.(`开始解析 Word 文档: ${filePath}`);
		let mammoth;
		try {
			mammoth = (await import("mammoth")).default;
		} catch {
			log?.warn?.("mammoth 库未安装，无法解析 .docx 文件。请运行: npm install mammoth");
			return null;
		}
		const buffer = fs.readFileSync(filePath);
		const text = (await mammoth.extractRawText({ buffer })).value.trim();
		if (text) {
			log?.info?.(`Word 文档解析成功: ${filePath}, 文本长度=${text.length}`);
			return text;
		} else {
			log?.warn?.(`Word 文档解析结果为空: ${filePath}`);
			return null;
		}
	} catch (err) {
		log?.error?.(`Word 文档解析失败: ${filePath}, error=${err.message}`);
		return null;
	}
}
/**
* 解析 PDF 文档
*/
async function parsePdfFile(filePath, log) {
	try {
		log?.info?.(`开始解析 PDF 文档: ${filePath}`);
		let pdfParseV1;
		let pdfParseV2;
		try {
			const mod = await import("pdf-parse");
			if (mod.PDFParse) pdfParseV2 = mod.PDFParse;
			else if (mod.default) pdfParseV1 = mod.default;
			else throw new Error("pdf-parse module format not recognized");
		} catch {
			log?.warn?.("pdf-parse 库未安装，无法解析 .pdf 文件。请运行: npm install pdf-parse");
			return null;
		}
		const buffer = fs.readFileSync(filePath);
		let text;
		let numPages;
		if (pdfParseV2) {
			const parser = new pdfParseV2({ data: buffer });
			const result = await parser.getText();
			text = (result.text ?? "").trim();
			numPages = result.total;
			parser.destroy?.();
		} else {
			const data = await pdfParseV1(buffer);
			text = (data.text ?? "").trim();
			numPages = data.numpages;
		}
		if (text) {
			log?.info?.(`PDF 文档解析成功: ${filePath}, 文本长度=${text.length}, 页数=${numPages}`);
			return text;
		} else {
			log?.warn?.(`PDF 文档解析结果为空: ${filePath}`);
			return null;
		}
	} catch (err) {
		log?.error?.(`PDF 文档解析失败: ${filePath}, error=${err.message}`);
		return null;
	}
}
/**
* 读取纯文本文件
*/
async function readTextFile(filePath, log) {
	try {
		log?.info?.(`开始读取文本文件: ${filePath}`);
		const text = fs.readFileSync(filePath, "utf-8").trim();
		if (text) {
			log?.info?.(`文本文件读取成功: ${filePath}, 文本长度=${text.length}`);
			return text;
		} else {
			log?.warn?.(`文本文件内容为空: ${filePath}`);
			return null;
		}
	} catch (err) {
		log?.error?.(`文本文件读取失败: ${filePath}, error=${err.message}`);
		return null;
	}
}
/**
* 根据文件类型解析文件内容
*/
async function parseFileContent(filePath, fileName, log) {
	const ext = path.extname(fileName).toLowerCase();
	if ([".docx", ".doc"].includes(ext)) return {
		content: await parseDocxFile(filePath, log),
		type: "text"
	};
	if (ext === ".pdf") return {
		content: await parsePdfFile(filePath, log),
		type: "text"
	};
	if ([
		".txt",
		".md",
		".json",
		".xml",
		".yaml",
		".yml",
		".csv",
		".log",
		".js",
		".ts",
		".py",
		".java",
		".c",
		".cpp",
		".h",
		".sh",
		".bat"
	].includes(ext)) return {
		content: await readTextFile(filePath, log),
		type: "text"
	};
	return {
		content: null,
		type: "binary"
	};
}
/**
* 内部消息处理函数（实际执行消息处理逻辑）
*/
// v-experience-dingtalk-v1: CommandAuthorized from the core's helpers instead of always true.
function vCommandAuthorized({ core, cfg, config, senderId, text }) {
	if (!core.channel.commands.shouldComputeCommandAuthorized(text, cfg)) return false;
	const allowFrom = config.dmPolicy === "allowlist" ? (config.allowFrom || []).map(String) : ["*"];
	return core.channel.commands.resolveCommandAuthorizedFromAuthorizers({
		useAccessGroups: cfg.commands?.useAccessGroups !== false,
		authorizers: [{ configured: allowFrom.length > 0, allowed: allowFrom.includes("*") || allowFrom.includes(String(senderId)) }]
	});
}
async function prepareDingTalkMessage(params) {
	const { accountId, config, data, cfg } = params;
	const log = createLoggerFromConfig(config, `DingTalk:${accountId}`);
	const content = extractMessageContent(data);
	if (!content.text && content.imageUrls.length === 0 && content.downloadCodes.length === 0) return;
	const isDirect = data.conversationType === "1";
	const senderId = data.senderStaffId || data.senderId;
	const senderName = data.senderNick || "Unknown";
	if (isDirect) {
		const dmPolicy = config.dmPolicy || "open";
		const allowFrom = config.allowFrom || [];
		if (dmPolicy === "pairing") log?.warn?.(`dmPolicy="pairing" 暂不支持，将按 "open" 策略处理`);
		if (dmPolicy === "allowlist") {
			if (!senderId) {
				log?.warn?.(`DM 被拦截: senderId 为空`);
				return;
			}
			const normalizedSenderId = String(senderId);
			const normalizedAllowFrom = allowFrom.map((id) => String(id));
			if (normalizedAllowFrom.length === 0) {
				log?.warn?.(`[DingTalk] DM 被拦截: allowFrom 白名单为空，拒绝所有请求`);
				try {
					await sendProactive(config, { userId: senderId }, "抱歉，此机器人的访问白名单配置有误。请联系管理员检查配置。", {
						msgType: "text",
						useAICard: false,
						fallbackToNormal: true,
						log
					});
				} catch (err) {
					log?.error?.(`[DingTalk] 发送 DM 配置错误提示失败: ${err.message}`);
				}
				return;
			}
			if (!normalizedAllowFrom.includes(normalizedSenderId)) {
				log?.warn?.(`DM 被拦截: senderId=${senderId} (${senderName}) 不在白名单中`);
				try {
					await sendProactive(config, { userId: senderId }, "抱歉，您暂无权限使用此机器人。如需开通权限，请联系管理员。", {
						msgType: "text",
						useAICard: false,
						fallbackToNormal: true,
						log
					});
				} catch (err) {
					log?.error?.(`发送 DM 拦截提示失败: ${err.message}`);
				}
				return;
			}
		}
	}
	if (!isDirect) {
		const groupPolicy = config.groupPolicy || "open";
		const conversationId = data.conversationId;
		const groupAllowFrom = config.groupAllowFrom || [];
		if (groupPolicy === "disabled") {
			log?.warn?.(`群聊被拦截: groupPolicy=disabled`);
			try {
				await sendProactive(config, { openConversationId: conversationId }, "抱歉，此机器人暂不支持群聊功能。", {
					msgType: "text",
					useAICard: false,
					fallbackToNormal: true,
					log
				});
			} catch (err) {
				log?.error?.(`发送群聊 disabled 提示失败: ${err.message}`);
			}
			return;
		}
		if (groupPolicy === "allowlist") {
			if (!conversationId) {
				log?.warn?.(`群聊被拦截: conversationId 为空`);
				return;
			}
			const normalizedConversationId = String(conversationId);
			const normalizedGroupAllowFrom = groupAllowFrom.map((id) => String(id));
			if (normalizedGroupAllowFrom.length === 0) {
				log?.warn?.(`群聊被拦截: groupAllowFrom 白名单为空，拒绝所有请求`);
				try {
					await sendProactive(config, { openConversationId: conversationId }, "抱歉，此机器人的群组访问白名单配置有误。请联系管理员检查配置。", {
						msgType: "text",
						useAICard: false,
						fallbackToNormal: true,
						log
					});
				} catch (err) {
					log?.error?.(`发送群聊配置错误提示失败: ${err.message}`);
				}
				return;
			}
			if (!normalizedGroupAllowFrom.includes(normalizedConversationId)) {
				log?.warn?.(`群聊被拦截: conversationId=${conversationId} 不在 groupAllowFrom 白名单中`);
				try {
					await sendProactive(config, { openConversationId: conversationId }, "抱歉，此群组暂无权限使用此机器人。如需开通权限，请联系管理员。", {
						msgType: "text",
						useAICard: false,
						fallbackToNormal: true,
						log
					});
				} catch (err) {
					log?.error?.(`发送群聊 allowlist 提示失败: ${err.message}`);
				}
				return;
			}
		}
	}
	const sessionContext = buildSessionContext({
		accountId,
		senderId,
		senderName,
		conversationType: data.conversationType,
		conversationId: data.conversationId,
		groupSubject: data.conversationTitle,
		separateSessionByConversation: config.separateSessionByConversation,
		groupSessionScope: config.groupSessionScope,
		sharedMemoryAcrossConversations: config.sharedMemoryAcrossConversations
	});
	try {
		const core = getDingtalkRuntime();
		const normalizedAccountId = normalizeAccountId(accountId);
		const routingAccountId = normalizedAccountId === "__default__" ? "default" : "dingtalk-account";
		const bindings = cfg.bindings?.flatMap((binding) => {
			if (binding.match.channel.trim().toLowerCase() !== "dingtalk-connector") return [];
			const selector = binding.match.accountId?.trim();
			if (!selector || selector === "*") return [binding];
			if (normalizeAccountId(selector) !== normalizedAccountId) return [];
			return [{
				...binding,
				match: {
					...binding.match,
					accountId: routingAccountId
				}
			}];
		});
		const route = core.channel.routing.resolveAgentRoute({
			cfg: {
				...cfg,
				bindings
			},
			channel: "dingtalk-connector",
			accountId: routingAccountId,
			peer: {
				kind: sessionContext.chatType,
				id: sessionContext.peerId
			}
		});
		const sessionKey = core.channel.routing.buildAgentSessionKey({
			agentId: route.agentId,
			channel: "dingtalk-connector",
			accountId,
			peer: {
				kind: sessionContext.chatType,
				id: sessionContext.sessionPeerId
			},
			dmScope: cfg.session?.dmScope ?? "per-channel-peer"
		});
		const agentWorkspaceDir = core.agent.resolveAgentWorkspaceDir(cfg, route.agentId);
		log?.info?.(`路由解析完成: agentId=${route.agentId}, sessionKey=${sessionKey}, matchedBy=${route.matchedBy}`);
		return {
			content,
			sessionContext,
			agentId: route.agentId,
			sessionKey,
			agentWorkspaceDir
		};
	} catch (error) {
		log?.error?.(`Agent routing failed: ${String(error)}`);
		await sendProactive(config, isDirect ? { userId: senderId } : { openConversationId: data.conversationId }, "无法选择处理此消息的智能体，请管理员检查此机器人的 OpenClaw bindings 配置。", {
			msgType: "text",
			useAICard: false,
			fallbackToNormal: true,
			log
		}).catch((sendError) => log?.error?.(`Routing error notification failed: ${String(sendError)}`));
	}
}
async function handleDingTalkMessageInternal(params, prepared) {
	const { accountId, config, data, sessionWebhook, runtime, cfg } = params;
	const { content, sessionContext, agentId: matchedAgentId, sessionKey, agentWorkspaceDir } = prepared;
	const log = createLoggerFromConfig(config, `DingTalk:${accountId}`);
	const isDirect = data.conversationType === "1";
	const senderId = data.senderStaffId || data.senderId;
	const senderName = data.senderNick || "Unknown";
	const rawText = content.text || "";
	let userContent = (params.vInterSession ? rawText : normalizeSlashCommand(rawText)) || (content.imageUrls.length > 0 ? "请描述这张图片" : "");
	try {
		const { GamificationEngine, isGamificationCommand } = await import("./game-xiyou-c3iooNRR.mjs");
		if (!params.vInterSession && isGamificationCommand(rawText)) {
			const engine = GamificationEngine.getInstanceForUser(senderId);
			if (rawText.trim().startsWith("/西游") || engine.isEnabled()) {
				const response = engine.handleCommand(rawText);
				if (response) {
					log?.info?.(`[DingTalk][Gamification] 处理养成系统命令: ${rawText.slice(0, 20)}`);
					await sendProactive(config, isDirect ? { userId: senderId } : { openConversationId: data.conversationId }, response, {
						useAICard: true,
						fallbackToNormal: true,
						log
					});
					return;
				}
			}
		}
	} catch (gamErr) {
		log?.warn?.(`[DingTalk][Gamification] 命令处理失败: ${gamErr?.message || gamErr}`);
	}
	const imageLocalPaths = [];
	log?.info?.(`处理消息: accountId=${accountId}, data= ${JSON.stringify(data, null, 2)}, sender=${senderName}, text=${content.text.slice(0, 50)}...`);
	for (let i = 0; i < content.imageUrls.length; i++) {
		const url = content.imageUrls[i];
		try {
			log?.info?.(`处理图片 ${i + 1}/${content.imageUrls.length}: ${url.slice(0, 50)}...`);
			if (url.startsWith("downloadCode:")) {
				const localPath = await downloadMediaByCode(url.slice(13), config, agentWorkspaceDir, log);
				if (localPath) {
					imageLocalPaths.push(localPath);
					log?.info?.(`图片下载成功 ${i + 1}/${content.imageUrls.length}`);
				} else log?.warn?.(`图片下载失败 ${i + 1}/${content.imageUrls.length}`);
			} else {
				const localPath = await downloadImageToFile(url, agentWorkspaceDir, log);
				if (localPath) {
					imageLocalPaths.push(localPath);
					log?.info?.(`图片下载成功 ${i + 1}/${content.imageUrls.length}`);
				} else log?.warn?.(`图片下载失败 ${i + 1}/${content.imageUrls.length}`);
			}
		} catch (err) {
			log?.error?.(`图片下载异常 ${i + 1}/${content.imageUrls.length}: ${err.message}`);
		}
	}
	for (let i = 0; i < content.downloadCodes.length; i++) {
		const code = content.downloadCodes[i];
		if (!content.fileNames[i]) try {
			log?.info?.(`处理 downloadCode 图片 ${i + 1}/${content.downloadCodes.length}`);
			const localPath = await downloadMediaByCode(code, config, agentWorkspaceDir, log);
			if (localPath) {
				imageLocalPaths.push(localPath);
				log?.info?.(`downloadCode 图片下载成功 ${i + 1}/${content.downloadCodes.length}`);
			} else log?.warn?.(`downloadCode 图片下载失败 ${i + 1}/${content.downloadCodes.length}`);
		} catch (err) {
			log?.error?.(`downloadCode 图片下载异常 ${i + 1}/${content.downloadCodes.length}: ${err.message}`);
		}
	}
	log?.info?.(`图片下载完成: 成功=${imageLocalPaths.length}, 总数=${content.imageUrls.length + content.downloadCodes.filter((_, i) => !content.fileNames[i]).length}`);
	const fileContentParts = [];
	for (let i = 0; i < content.downloadCodes.length; i++) {
		const code = content.downloadCodes[i];
		const fileName = content.fileNames[i];
		if (!fileName) continue;
		try {
			log?.info?.(`处理文件附件 ${i + 1}/${content.downloadCodes.length}: ${fileName}`);
			const downloadUrl = await getFileDownloadUrl(code, fileName, config, log);
			if (!downloadUrl) {
				fileContentParts.push(`⚠️ 文件获取失败: ${fileName}`);
				continue;
			}
			const localPath = await downloadFileToLocal(downloadUrl, fileName, agentWorkspaceDir, log);
			if (!localPath) {
				fileContentParts.push(`⚠️ 文件下载失败: ${fileName}\n🔗 [点击下载](${downloadUrl})`);
				continue;
			}
			const ext = path.extname(fileName).toLowerCase();
			let fileType = "文件";
			if ([
				".mp4",
				".avi",
				".mov",
				".mkv",
				".flv",
				".wmv",
				".webm"
			].includes(ext)) fileType = "视频";
			else if ([
				".mp3",
				".wav",
				".aac",
				".ogg",
				".m4a",
				".flac",
				".wma"
			].includes(ext)) fileType = "音频";
			else if ([
				".jpg",
				".jpeg",
				".png",
				".gif",
				".bmp",
				".webp"
			].includes(ext)) fileType = "图片";
			else if ([
				".txt",
				".md",
				".json",
				".xml",
				".yaml",
				".yml",
				".csv",
				".log",
				".js",
				".ts",
				".py",
				".java",
				".c",
				".cpp",
				".h",
				".sh",
				".bat"
			].includes(ext)) fileType = "文本文件";
			else if ([".docx", ".doc"].includes(ext)) fileType = "Word 文档";
			else if (ext === ".pdf") fileType = "PDF 文档";
			else if ([".xlsx", ".xls"].includes(ext)) fileType = "Excel 表格";
			else if ([".pptx", ".ppt"].includes(ext)) fileType = "PPT 演示文稿";
			else if ([
				".zip",
				".rar",
				".7z",
				".tar",
				".gz"
			].includes(ext)) fileType = "压缩包";
			const parseResult = await parseFileContent(localPath, fileName, log);
			if (parseResult.type === "text" && parseResult.content) {
				const contentPreview = parseResult.content.length > 200 ? parseResult.content.slice(0, 200) + "..." : parseResult.content;
				fileContentParts.push(`📄 **${fileType}**: ${fileName}\n✅ 已解析文件内容（${parseResult.content.length} 字符）\n💾 已保存到本地: ${localPath}\n📝 内容预览:\n\`\`\`\n${contentPreview}\n\`\`\`\n\n📋 完整内容:\n${parseResult.content}`);
				log?.info?.(`文件解析成功: ${fileName}, 内容长度=${parseResult.content.length}`);
			} else if (parseResult.type === "text" && !parseResult.content) {
				fileContentParts.push(`📄 **${fileType}**: ${fileName}\n⚠️ 文件解析失败，已保存到本地\n💾 本地路径: ${localPath}\n🔗 [点击下载](${downloadUrl})`);
				log?.warn?.(`文件解析失败: ${fileName}`);
			} else {
				if (fileType === "音频" && content.text && content.text !== "[语音消息]") fileContentParts.push(`🎤 **${fileType}**: ${fileName}\n📝 语音识别: ${content.text}\n💾 已保存到本地: ${localPath}\n🔗 [点击下载](${downloadUrl})`);
				else fileContentParts.push(`📎 **${fileType}**: ${fileName}\n💾 已保存到本地: ${localPath}\n🔗 [点击下载](${downloadUrl})`);
				log?.info?.(`二进制文件已保存: ${fileName}, path=${localPath}`);
			}
		} catch (err) {
			log?.error?.(`文件处理异常: ${fileName}, error=${err.message}`);
			fileContentParts.push(`⚠️ 文件处理失败: ${fileName}`);
		}
	}
	if (fileContentParts.length > 0) {
		const fileText = fileContentParts.join("\n\n");
		userContent = userContent ? `${userContent}\n\n${fileText}` : fileText;
	}
	if (!userContent && imageLocalPaths.length === 0) return;
	if (!params.vInterSession) addEmotionReply(config, data, log).catch((err) => {
		log?.warn?.(`贴表情失败: ${err.message}`);
	});
	const asyncMode = config.asyncMode === true && !params.vInterSession;
	log?.info?.(`asyncMode 检测: config.asyncMode=${config.asyncMode}, asyncMode=${asyncMode}`);
	const proactiveTarget = isDirect ? { userId: senderId } : { openConversationId: data.conversationId };
	if (asyncMode) {
		log?.info?.(`进入异步模式分支`);
		const ackText = config.ackText || "🫡 任务已接收，处理中...";
		try {
			await sendProactive(config, proactiveTarget, ackText, {
				msgType: "text",
				useAICard: false,
				fallbackToNormal: true,
				log
			});
		} catch (ackErr) {
			log?.warn?.(`Failed to send acknowledgment: ${ackErr?.message || ackErr}`);
		}
	}
	try {
		const core = getDingtalkRuntime();
		let finalContent = userContent;
		if (imageLocalPaths.length > 0) {
			const imageMarkdown = imageLocalPaths.map((p) => `![image](file://${p})`).join("\n");
			finalContent = finalContent ? `${finalContent}\n\n${imageMarkdown}` : imageMarkdown;
		}
		const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);
		const envelopeFrom = isDirect ? senderId : `${data.conversationId}:${senderId}`;
		const body = core.channel.reply.formatAgentEnvelope({
			channel: "DingTalk",
			from: envelopeFrom,
			timestamp: /* @__PURE__ */ new Date(),
			envelope: envelopeOptions,
			body: finalContent
		});
		log?.info?.(`开始构建 inbound context...`);
		const toField = isDirect ? senderId : data.conversationId;
		log?.info?.(`构建 inbound context: isDirect=${isDirect}, senderId=${senderId}, conversationId=${data.conversationId}, To=${toField}`);
		const ctxPayload = {
			Body: body,
			BodyForAgent: finalContent,
			rawText: userContent,
			CommandBody: userContent,
			From: senderId,
			To: toField,
			SessionKey: sessionKey,
			AccountId: accountId,
			ChatType: sessionContext.chatType,
			GroupSubject: isDirect ? void 0 : data.conversationTitle,
			SenderName: senderName,
			SenderId: senderId,
			Provider: "dingtalk-connector",
			Surface: "dingtalk-connector",
			MessageSid: data.msgId,
			Timestamp: Date.now(),
			CommandAuthorized: vCommandAuthorized({ core, cfg, config, senderId, text: userContent }),
			OriginatingChannel: "dingtalk-connector",
			OriginatingTo: toField,
			BotChatbotUserId: data.chatbotUserId,
			BotChatbotCorpId: data.chatbotCorpId
		};
		// inter-session bridge (design §2.a): provenance and channel prompt context of the request; its
		// permission identity (chain-root rule, also as From, which the core takes as a direct chat's
		// sender when no SenderId matches); never a command. 9.1 takes ChannelPromptContext as a list
		// of entries (appendChannelPromptContext drops anything that is not an array).
		if (params.vInterSession) {
			const vReq = params.vInterSession.req;
			Object.assign(ctxPayload, {
				InputProvenance: vReq.provenance,
				ChannelPromptContext: typeof vReq.channelPromptContext === "string" && vReq.channelPromptContext.trim() ? [vReq.channelPromptContext] : void 0,
				CommandInterpretationSuppressed: true,
				CommandAuthorized: false,
				SenderId: vReq.sender.id,
				SenderName: vReq.sender.name,
				From: vReq.sender.id,
				MessageSid: vReq.messageSid,
				VInterSession: params.vInterSession.seam
			});
		}
		const { dispatcherOptions, replyOptions, getAsyncModeResponse } = createDingtalkReplyDispatcher({
			cfg,
			agentId: matchedAgentId,
			runtime,
			conversationId: data.conversationId,
			senderId: params.vInterSession && !isDirect ? params.vInterSession.req.askUserAnswererId : senderId,
			isDirect,
			accountId,
			messageCreateTimeMs: Date.now(),
			sessionWebhook: data.sessionWebhook,
			asyncMode,
			vSessionKey: sessionKey,
			vInterSession: params.vInterSession
		});
		if (config.clientId) {
			const botIdentityHint = `[DingTalk Bot Context] Current bot clientId: ${String(config.clientId)}. When executing \`dws chat message send-by-bot\`, always pass \`--client-id ${String(config.clientId)}\` to ensure messages are sent from the correct bot.`;
			finalContent = finalContent ? `${finalContent}\n\n${botIdentityHint}` : botIdentityHint;
		}
		const linkRoutingPrompt = buildLinkRoutingPrompt(content);
		if (linkRoutingPrompt) {
			finalContent = finalContent ? `${finalContent}\n\n${linkRoutingPrompt}` : linkRoutingPrompt;
			log?.info?.(`注入卡片链接路由指令: ${linkRoutingPrompt.slice(0, 100)}...`);
		}
		const { queuedFinal, counts } = await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
			ctx: {
				...ctxPayload,
				BodyForAgent: finalContent
			},
			cfg,
			dispatcherOptions,
			dispatchReplyFromConfig: core.channel.reply.dispatchReplyFromConfig,
			replyOptions
		});
		log.info?.(`[DingTalk][dispatch] dispatchReplyFromConfig 完成: queuedFinal=${queuedFinal}, counts=${JSON.stringify(counts)}`);
		params.vInterSession?.dispatched({
			queuedFinal,
			counts
		});
		if (asyncMode) try {
			const fullResponse = getAsyncModeResponse();
			const oapiToken = await getOapiAccessToken$1(config);
			let finalText = fullResponse;
			if (oapiToken) {
				finalText = await processLocalImages(finalText, oapiToken, log);
				const mediaTarget = isDirect ? {
					type: "user",
					userId: senderId
				} : {
					type: "group",
					openConversationId: data.conversationId
				};
				finalText = await processVideoMarkers(finalText, "", config, oapiToken, log, true, mediaTarget);
				finalText = await processAudioMarkers(finalText, "", config, oapiToken, log, true, mediaTarget);
				finalText = await uploadAndReplaceFileMarkers(finalText, "", config, oapiToken, log, true, mediaTarget);
				const { processRawMediaPaths } = await import("./media-nyjwj7nU.mjs").then((n) => n.t);
				finalText = await processRawMediaPaths(finalText, config, oapiToken, log, mediaTarget);
			}
			let textToSend = finalText.trim();
			if (!textToSend) {
				const isGroup = !isDirect;
				textToSend = pickEmptyReplyFallbackText(isGroup);
				if (isGroup) log?.warn?.(`[DingTalk][asyncMode] ${emptyGroupReplyLogHint()}`);
			}
			const title = textToSend.split("\n")[0]?.replace(/^[#*\s\->]+/, "").trim() || "消息";
			await sendProactive(config, proactiveTarget, textToSend, {
				msgType: "markdown",
				title,
				useAICard: false,
				fallbackToNormal: true,
				log
			});
		} catch (asyncErr) {
			const errMsg = `⚠️ 任务执行失败: ${asyncErr?.message || asyncErr}`;
			try {
				await sendProactive(config, proactiveTarget, errMsg, {
					msgType: "text",
					useAICard: false,
					fallbackToNormal: true,
					log
				});
			} catch (sendErr) {
				log?.error?.(`错误通知发送失败: ${sendErr?.message || sendErr}`);
			}
		}
	} catch (err) {
		log?.error?.(`SDK dispatch 失败: ${err.message}`);
		if (params.vInterSession) throw err;
		try {
			const token = await getAccessToken(config);
			const body = {
				msgtype: "text",
				text: { content: `抱歉，处理请求时出错: ${err.message}` }
			};
			if (!isDirect) body.at = {
				atUserIds: [senderId],
				isAtAll: false
			};
			await dingtalkHttp.post(sessionWebhook, body, { headers: {
				"x-acs-dingtalk-access-token": token,
				"Content-Type": "application/json"
			} });
		} catch (fallbackErr) {
			log?.error?.(`错误消息发送也失败: ${fallbackErr.message}`);
		}
	}
	if (!params.vInterSession) try {
		await recallEmotionReply(config, data, log);
	} catch (err) {
		log?.warn?.(`撤回表情异常: ${err.message}`);
	}
}
/** Message entry point. OpenClaw owns per-session queue and interrupt semantics. */
async function handleDingTalkMessage(params) {
	if (params.vInterSession) return handleDingTalkMessageInternal(params, vInterPrepared(params));
	const prepared = await prepareDingTalkMessage(params);
	if (!prepared) return;
	// v-experience-dingtalk-v1
	const vData = params.data ?? {};
	let vChatKey = `${params.accountId ?? "default"}:${vData.conversationId}`;
	const vSender = vData.senderStaffId || vData.senderId;
	if (vData.conversationType === "1" && vSender && !vExperience.hasTrackedQuestion({ channel: "dingtalk", chatKey: vChatKey, senderId: vSender }) && vExperience.hasTrackedQuestion({ channel: "dingtalk", chatKey: vInterDmChatKey(params.accountId, vSender), senderId: vSender })) vChatKey = vInterDmChatKey(params.accountId, vSender);
	if (vExperience.hasTrackedQuestion({ channel: "dingtalk", chatKey: vChatKey, senderId: vSender })) {
		const vAnswer = await vExperience.answerTrackedQuestion({
			channel: "dingtalk",
			chatKey: vChatKey,
			senderId: vSender,
			text: prepared.content?.text,
			resolvedBy: `dingtalk:chat:${vSender}:${vData.msgId}`,
			resolve: (id, answers, resolvedBy) => vCallGateway("question.resolve", { config: params.cfg }, { id, answers, resolvedBy }, { scopes: ["operator.questions"], progress: false, timeoutMs: 5000 }),
			log: (message) => params.runtime?.log?.(message)
		});
		if (vAnswer.handled) {
			if (vExperience.shouldSendAnswerNotice(vAnswer)) await sendMessage(params.config, vData.sessionWebhook, vAnswer.notice, { useMarkdown: false }).catch(() => {});
			await recallEmotionReply(params.config, vData).catch(() => {});
			return;
		}
	}
	await handleDingTalkMessageInternal(params, prepared);
}
//#endregion
export { downloadFileToLocal, downloadImageToFile, downloadMediaByCode, extractMessageContent, getFileDownloadUrl, handleDingTalkMessage };
