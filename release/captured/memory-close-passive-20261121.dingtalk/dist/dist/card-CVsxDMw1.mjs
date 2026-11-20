import { t as dingtalkHttp } from "./http-client-8_Hh4c4N.mjs";
import { r as getAccessToken, t as DINGTALK_API } from "./token-xUW84QQ8.mjs";
//#region src/services/messaging/card.ts
const AI_CARD_TEMPLATE_ID = "02fcf2f4-5e02-4a85-b672-46d1f715543e.schema";
/**
* 钉钉卡片 API 的最大 QPS（官方限制约 40 次/秒）。
* 保守取 20，为 createAICardForTarget / finishAICard 等非流式调用留余量。
*/
const CARD_API_MAX_QPS = 20;
/** QPS 限流退避时长（ms），遇到 403 QpsLimit 后暂停发送 */
const QPS_BACKOFF_DURATION_MS = 2e3;
/**
* 全局令牌桶限流器，所有 streamAICard 调用共享。
*
* 解决的问题：每个 reply-dispatcher 实例有独立的 500ms 节流间隔，
* 但多个会话并发时总 QPS 会叠加超过钉钉 API 限制（40 次/秒），
* 导致频繁触发 403 QpsLimit 错误。
*
* 工作原理：
* - 令牌桶以 CARD_API_MAX_QPS 的速率补充令牌
* - 每次 API 调用前消耗一个令牌，无令牌时等待
* - 遇到 QpsLimit 错误时触发退避，暂停所有调用
*/
const cardRateLimiter = {
	/** 当前可用令牌数 */
	tokens: CARD_API_MAX_QPS,
	/** 上次令牌补充时间 */
	lastRefillTime: Date.now(),
	/** QPS 退避截止时间（遇到限流错误后设置） */
	backoffUntil: 0,
	/**
	* 串行化锁：保证并发的 waitForToken 被一个一个处理。
	* 否则多个并发调用会同时通过 `tokens < 1` 检查并各自扣减，
	* 令牌桶会被并发击穿，导致实际 QPS 远超 CARD_API_MAX_QPS。
	*/
	_queueTail: Promise.resolve(),
	/**
	* 补充令牌：按时间流逝恢复令牌数
	*/
	refill() {
		const now = Date.now();
		const elapsedSeconds = (now - this.lastRefillTime) / 1e3;
		if (elapsedSeconds > 0) {
			this.tokens = Math.min(CARD_API_MAX_QPS, this.tokens + elapsedSeconds * CARD_API_MAX_QPS);
			this.lastRefillTime = now;
		}
	},
	/**
	* 等待直到有可用令牌，或退避期结束
	* @returns 等待的毫秒数（0 表示无需等待）
	*
	* 通过 `_queueTail` 将所有并发调用串行化，确保 token 扣减真正生效。
	*/
	async waitForToken() {
		const prev = this._queueTail;
		let release;
		this._queueTail = new Promise((resolve) => {
			release = resolve;
		});
		try {
			await prev;
		} catch {}
		try {
			let totalWaitMs = 0;
			const now = Date.now();
			if (now < this.backoffUntil) {
				const backoffWaitMs = this.backoffUntil - now;
				await sleep(backoffWaitMs);
				totalWaitMs += backoffWaitMs;
			}
			this.refill();
			if (this.tokens < 1) {
				const waitMs = Math.ceil((1 - this.tokens) / CARD_API_MAX_QPS * 1e3);
				await sleep(waitMs);
				totalWaitMs += waitMs;
				this.refill();
			}
			this.tokens -= 1;
			return totalWaitMs;
		} finally {
			release();
		}
	},
	/**
	* 触发退避：遇到 QpsLimit 错误时调用
	*/
	triggerBackoff() {
		const backoffEnd = Date.now() + QPS_BACKOFF_DURATION_MS;
		this.backoffUntil = backoffEnd;
		this.tokens = 0;
		this.lastRefillTime = backoffEnd;
	}
};
/** 简单的 sleep 工具函数 */
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
* 判断错误是否为钉钉 QPS 限流错误。
*
* 导出给上层调用（如 reply-dispatcher），用于在错误处理时区分
* 「瞬时可恢复错误」与「真正的发送失败」，避免把 QPS 限流这种
* 内部已自动退避重试、后续会自动恢复的错误展示为用户可见的
* 「消息发送失败」提示。
*/
function isQpsLimitError(err) {
	const errorCode = err?.response?.data?.code;
	return err?.response?.status === 403 && typeof errorCode === "string" && errorCode.includes("QpsLimit");
}
/** AI Card 状态 */
const AICardStatus = {
	PROCESSING: "1",
	INPUTING: "2",
	FINISHED: "3",
	EXECUTING: "4",
	FAILED: "5"
};
/**
* 统一换行符为 \n，避免 CRLF 干扰 Markdown 解析
*/
function normalizeLineEndings(text) {
	return text.replace(/\r\n?/g, "\n");
}
/**
* 确保 Markdown 表格前有空行，否则钉钉无法正确渲染表格
*/
function ensureTableBlankLines(text) {
	const lines = normalizeLineEndings(text).split("\n");
	const result = [];
	const tableDividerRegex = /^\s*\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?\s*$/;
	const tableRowRegex = /^\s*\|?.*\|.*\|?\s*$/;
	const isDivider = (line) => line && typeof line === "string" && line.includes("|") && tableDividerRegex.test(line);
	for (let i = 0; i < lines.length; i++) {
		const currentLine = lines[i];
		const nextLine = lines[i + 1] ?? "";
		if (tableRowRegex.test(currentLine) && isDivider(nextLine) && i > 0 && lines[i - 1].trim() !== "" && !tableRowRegex.test(lines[i - 1])) result.push("");
		result.push(currentLine);
	}
	return result.join("\n");
}
/**
* 将单个 \n 转换为 <br>，保留 \n\n 段落分隔。
*
* 钉钉 AI Card 渲染器的换行约定：
* - 普通文本：用 `<br>` 做换行，`\n` 不创建视觉换行
* - 代码块（```）：用 `\n` 做换行，`<br>` 会原样显示为文本
* - 列表（- / 1.）、表格（|）、标题（#）：用 `\n` 做语法行分隔
* - 引用块（>）：用 `<br>` + lazy continuation，续行不需要 `>`
* - 段落间距：`\n\n`
*
* 本函数按上述约定转换：
* - 代码块内：完全保留原始 `\n`
* - 连续引用行：合并为一行，`<br>` 连接，去掉续行 `>` 前缀
* - 其余：Markdown 块语法行前保留 `\n`，单 `\n` → `<br>`
*/
function fixNewlines(text) {
	const normalized = normalizeLineEndings(text);
	const markdownBlockStartPattern = /^(\s{0,3}(?:[-*+]|\d+[.)])[ ])|(\s{0,3}\|)|(\s{0,3}#{1,6}\s)|(\s{0,3}(?:[-*_])\s*(?:[-*_])\s*(?:[-*_]))/;
	const fencePattern = /^\s{0,3}```/;
	const quotePattern = /^\s{0,3}>\s?/;
	const mergedLines = [];
	let pendingQuoteLines = [];
	let inCodeBlock = false;
	const flushPendingQuoteLines = () => {
		if (pendingQuoteLines.length > 0) {
			mergedLines.push(pendingQuoteLines.join("<br>"));
			pendingQuoteLines = [];
		}
	};
	for (const line of normalized.split("\n")) {
		const isFence = fencePattern.test(line);
		if (inCodeBlock) {
			flushPendingQuoteLines();
			mergedLines.push(line);
			if (isFence) inCodeBlock = false;
			continue;
		}
		if (isFence) {
			flushPendingQuoteLines();
			mergedLines.push(line);
			inCodeBlock = true;
			continue;
		}
		if (quotePattern.test(line)) if (pendingQuoteLines.length === 0) pendingQuoteLines.push(line);
		else pendingQuoteLines.push(line.replace(quotePattern, ""));
		else {
			flushPendingQuoteLines();
			mergedLines.push(line);
		}
	}
	flushPendingQuoteLines();
	const lines = mergedLines;
	inCodeBlock = false;
	const parts = [];
	for (let i = 0; i < lines.length; i++) {
		const currentLine = lines[i];
		const nextInCodeBlock = fencePattern.test(currentLine) ? !inCodeBlock : inCodeBlock;
		if (i < lines.length - 1) {
			const nextLine = lines[i + 1];
			const keepNewline = nextInCodeBlock || currentLine === "" || nextLine === "" || fencePattern.test(nextLine) || markdownBlockStartPattern.test(nextLine);
			parts.push(currentLine + (keepNewline ? "\n" : "<br>"));
		} else parts.push(currentLine);
		inCodeBlock = nextInCodeBlock;
	}
	return parts.join("");
}
/**
* 标准化 AI Card 消息内容：先修复表格空行，再处理换行符。
* 用于 streamAICard 和 finishAICard 的所有路径，确保行为一致。
*/
function normalizeForCard(content) {
	return fixNewlines(ensureTableBlankLines(content));
}
/**
* 构建卡片投放请求体
*/
function buildDeliverBody(cardInstanceId, target, robotCode) {
	const base = {
		outTrackId: cardInstanceId,
		userIdType: 1
	};
	if (target.type === "group") return {
		...base,
		openSpaceId: `dtv1.card//IM_GROUP.${target.openConversationId}`,
		imGroupOpenDeliverModel: { robotCode }
	};
	return {
		...base,
		openSpaceId: `dtv1.card//IM_ROBOT.${target.userId}`,
		imRobotOpenDeliverModel: {
			spaceType: "IM_ROBOT",
			robotCode,
			extension: { dynamicSummary: "true" }
		}
	};
}
/**
* 通用 AI Card 创建函数
*/
async function createAICardForTarget(config, target, log) {
	const targetDesc = target.type === "group" ? `群聊 ${target.openConversationId}` : `用户 ${target.userId}`;
	try {
		const token = await getAccessToken(config);
		const cardInstanceId = `card_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
		log?.info?.(`[DingTalk][AICard] 开始创建卡片：${targetDesc}, outTrackId=${cardInstanceId}`);
		const createBody = {
			cardTemplateId: AI_CARD_TEMPLATE_ID,
			outTrackId: cardInstanceId,
			cardData: { cardParamMap: { config: JSON.stringify({ autoLayout: true }) } },
			callbackType: "STREAM",
			imGroupOpenSpaceModel: { supportForward: true },
			imRobotOpenSpaceModel: { supportForward: true }
		};
		await dingtalkHttp.post(`${DINGTALK_API}/v1.0/card/instances`, createBody, { headers: {
			"x-acs-dingtalk-access-token": token,
			"Content-Type": "application/json"
		} });
		const deliverBody = buildDeliverBody(cardInstanceId, target, String(config.clientId ?? ""));
		await dingtalkHttp.post(`${DINGTALK_API}/v1.0/card/instances/deliver`, deliverBody, { headers: {
			"x-acs-dingtalk-access-token": token,
			"Content-Type": "application/json"
		} });
		return {
			cardInstanceId,
			accessToken: token,
			tokenExpireTime: Date.now() + 7200 * 1e3,
			inputingStarted: false
		};
	} catch (err) {
		log?.error?.(`[DingTalk][AICard] 创建卡片失败 (${targetDesc}): ${err.message}`);
		if (err.response) log?.error?.(`[DingTalk][AICard] 错误响应：status=${err.response.status}`);
		return null;
	}
}
/**
* 确保 Token 有效（自动刷新过期的 Token）
*/
async function ensureValidToken(card, config) {
	if (Date.now() > card.tokenExpireTime - 300 * 1e3) {
		card.accessToken = await getAccessToken(config);
		card.tokenExpireTime = Date.now() + 7200 * 1e3;
	}
	return card.accessToken;
}
/**
* 流式更新 AI Card 内容
*
* 内置全局令牌桶限流：所有会话共享同一速率限制，
* 遇到 QpsLimit 错误时自动退避 2 秒后重试一次。
*/
async function streamAICard(card, content, finished = false, config, log) {
	if (!card) {
		log?.warn?.(`[DingTalk][AICard] streamAICard 收到 null card，跳过更新`);
		return;
	}
	if (config) await ensureValidToken(card, config);
	if (!card.inputingStarted) {
		const inputingWaitMs = await cardRateLimiter.waitForToken();
		if (inputingWaitMs > 0) log?.debug?.(`[DingTalk][AICard] INPUTING 等待限流令牌 ${inputingWaitMs}ms`);
		const statusBody = {
			outTrackId: card.cardInstanceId,
			cardData: { cardParamMap: {
				flowStatus: AICardStatus.INPUTING,
				msgContent: normalizeForCard(content),
				staticMsgContent: "",
				sys_full_json_obj: JSON.stringify({ order: ["msgContent"] }),
				config: JSON.stringify({ autoLayout: true })
			} }
		};
		const putInputing = () => dingtalkHttp.put(`${DINGTALK_API}/v1.0/card/instances`, statusBody, { headers: {
			"x-acs-dingtalk-access-token": card.accessToken,
			"Content-Type": "application/json"
		} });
		try {
			const statusResp = await putInputing();
			log?.info?.(`[DingTalk][AICard] INPUTING 响应：status=${statusResp.status}`);
		} catch (err) {
			if (isQpsLimitError(err)) {
				cardRateLimiter.triggerBackoff();
				log?.warn?.(`[DingTalk][AICard] INPUTING 触发 QPS 限流，退避 ${QPS_BACKOFF_DURATION_MS}ms 后重试`);
				await cardRateLimiter.waitForToken();
				try {
					const retryResp = await putInputing();
					log?.info?.(`[DingTalk][AICard] INPUTING 重试成功：status=${retryResp.status}`);
				} catch (retryErr) {
					log?.error?.(`[DingTalk][AICard] INPUTING 重试失败：${retryErr.message}`);
					throw retryErr;
				}
			} else {
				log?.error?.(`[DingTalk][AICard] INPUTING 切换失败：${err.message}`);
				throw err;
			}
		}
		card.inputingStarted = true;
	}
	const fixedContent = normalizeForCard(content);
	const streamContent = finished ? fixedContent : fixedContent.replace(/\n+$/, "");
	const body = {
		outTrackId: card.cardInstanceId,
		guid: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
		key: "msgContent",
		content: streamContent,
		isFull: true,
		isFinalize: finished,
		isError: false
	};
	const streamWaitMs = await cardRateLimiter.waitForToken();
	if (streamWaitMs > 0) log?.debug?.(`[DingTalk][AICard] streaming 等待限流令牌 ${streamWaitMs}ms`);
	log?.info?.(`[DingTalk][AICard] PUT /v1.0/card/streaming contentLen=${content.length} isFinalize=${finished}`);
	try {
		const streamResp = await dingtalkHttp.put(`${DINGTALK_API}/v1.0/card/streaming`, body, { headers: {
			"x-acs-dingtalk-access-token": card.accessToken,
			"Content-Type": "application/json"
		} });
		log?.info?.(`[DingTalk][AICard] streaming 响应：status=${streamResp.status}`);
	} catch (err) {
		if (isQpsLimitError(err)) {
			cardRateLimiter.triggerBackoff();
			log?.warn?.(`[DingTalk][AICard] streaming 触发 QPS 限流，退避 ${QPS_BACKOFF_DURATION_MS}ms 后重试`);
			await cardRateLimiter.waitForToken();
			try {
				body.guid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
				await dingtalkHttp.put(`${DINGTALK_API}/v1.0/card/streaming`, body, { headers: {
					"x-acs-dingtalk-access-token": card.accessToken,
					"Content-Type": "application/json"
				} });
				log?.info?.(`[DingTalk][AICard] streaming 重试成功`);
				return;
			} catch (retryErr) {
				log?.error?.(`[DingTalk][AICard] streaming 重试失败：${retryErr.message}`);
				throw retryErr;
			}
		}
		throw err;
	}
}
/**
* 完成 AI Card
*/
async function finishAICard(card, content, config, log) {
	if (config) await ensureValidToken(card, config);
	const fixedContent = normalizeForCard(content);
	log?.info?.(`[DingTalk][AICard] 开始 finish，最终内容长度=${fixedContent.length}`);
	await streamAICard(card, fixedContent, true, config, log);
	const body = {
		outTrackId: card.cardInstanceId,
		cardData: { cardParamMap: {
			flowStatus: AICardStatus.FINISHED,
			msgContent: fixedContent,
			staticMsgContent: "",
			sys_full_json_obj: JSON.stringify({ order: ["msgContent"] }),
			config: JSON.stringify({ autoLayout: true })
		} },
		cardUpdateOptions: { updateCardDataByKey: true }
	};
	const putFinished = () => dingtalkHttp.put(`${DINGTALK_API}/v1.0/card/instances`, body, { headers: {
		"x-acs-dingtalk-access-token": card.accessToken,
		"Content-Type": "application/json"
	} });
	try {
		await cardRateLimiter.waitForToken();
		const finishResp = await putFinished();
		log?.info?.(`[DingTalk][AICard] FINISHED 响应：status=${finishResp.status}`);
	} catch (err) {
		if (isQpsLimitError(err)) {
			cardRateLimiter.triggerBackoff();
			log?.warn?.(`[DingTalk][AICard] FINISHED 触发 QPS 限流，退避 ${QPS_BACKOFF_DURATION_MS}ms 后重试`);
			try {
				await cardRateLimiter.waitForToken();
				const retryResp = await putFinished();
				log?.info?.(`[DingTalk][AICard] FINISHED 重试成功：status=${retryResp.status}`);
				return;
			} catch (retryErr) {
				log?.error?.(`[DingTalk][AICard] FINISHED 重试失败：${retryErr.message}`);
			}
		} else log?.error?.(`[DingTalk][AICard] FINISHED 更新失败：${err.message}`);
	}
}
//#endregion
export { streamAICard as i, finishAICard as n, isQpsLimitError as r, createAICardForTarget as t };
