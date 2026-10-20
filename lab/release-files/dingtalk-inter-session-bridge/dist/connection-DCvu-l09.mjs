import { r as checkAndMarkDingtalkMessage } from "./utils-legacy-CRYCK3kF.mjs";
import * as fs from "fs";
// v-experience-dingtalk-v1
import * as vExperience from "./v-experience.mjs";
// v-dingtalk-inter-session-bridge-v1
import { i as vInterSendProactive } from "./messaging-JY5zinFJ.mjs";
// The DingTalk inbound bridge for sessions_send (docs/inter-session/design.md §2.a, §3.8). A
// request from another V session is posted in the target chat as a normal robot message (post)
// and then runs as a synthetic inbound turn of the target session (start): the same handler, AI
// card, work view and background line a person's message gets. The literals below equal
// apps/v-session-relay/plugin/core/contracts.js (tests/patch-dingtalk-inter-session-bridge.test.mjs).
const V_INTER_BRIDGES = Symbol.for("openclaw.v.interSessionInboundBridges");
const V_INTER_CHANNEL = "dingtalk";
const V_INTER_CAPS = Object.freeze({ streaming: true, replyAnchor: false, idempotentPost: false, editPost: false, maxVisibleChars: 1500, askUser: true, media: true });
const V_INTER_BUSY_REASONS = ["active_run", "pending_queue", "recovery_owner"];
const V_INTER_RESTART_WEDGE_RE = /restart recovery claim changed/u;
/** The connector's own name for its default account (accounts chunk: DEFAULT_ACCOUNT_ID). */
const V_INTER_CONNECTOR_DEFAULT_ACCOUNT = "__default__";
const V_INTER_ECHO_TTL_MS = 10 * 60 * 1e3;
const vInterAnchors = new Map(); // echo key -> expiresAt (request anchors this process posted)
function vInterRegistry() {
	globalThis[V_INTER_BRIDGES] ??= { v: 1, bridges: new Map(), listeners: new Set() };
	return globalThis[V_INTER_BRIDGES];
}
/** Same result as the core's normalizeAccountId: empty or unusable -> "default". */
function vInterAccountId(value) {
	const trimmed = String(value ?? "").trim();
	if (!trimmed) return "default";
	const lower = trimmed.toLowerCase();
	const canonical = /^[a-z0-9][a-z0-9_-]{0,63}$/iu.test(trimmed) ? lower : lower.replace(/[^a-z0-9_-]+/gu, "-").replace(/^-+/u, "").replace(/-+$/u, "").slice(0, 64);
	return !canonical || canonical === "__proto__" || canonical === "prototype" || canonical === "constructor" ? "default" : canonical;
}
function vInterNotify(reg, key, bridge) {
	for (const listener of [...reg.listeners]) try {
		listener(key, bridge);
	} catch {}
}
function vInterRegister(bridges) {
	const reg = vInterRegistry();
	for (const bridge of bridges) {
		const key = `${bridge.channel}:${vInterAccountId(bridge.accountId)}`;
		reg.bridges.set(key, bridge);
		vInterNotify(reg, key, bridge);
	}
}
function vInterUnregister(bridges) {
	const reg = vInterRegistry();
	for (const bridge of bridges ?? []) {
		const key = `${bridge.channel}:${vInterAccountId(bridge.accountId)}`;
		if (reg.bridges.get(key) !== bridge) continue;
		reg.bridges.delete(key);
		vInterNotify(reg, key, null);
	}
}
function vInterBridgeError(code, message, transient) {
	const err = new Error(message);
	err.name = "BridgeError";
	err.code = code;
	err.transient = Boolean(transient);
	return err;
}
/** A delivery address in any spelling (bare id, user:, group:, dingtalk-connector:group:...) -> { id, chatType }. */
function vInterParseTo(to, sessionKey) {
	let id = String(to ?? "").trim();
	let chatType;
	for (;;) {
		const m = /^(dingtalk-connector|dingtalk|group|chat|conversation|user|direct|dm):/iu.exec(id);
		if (!m) break;
		const prefix = m[1].toLowerCase();
		if (prefix === "group" || prefix === "chat" || prefix === "conversation") chatType = "group";
		else if (prefix === "user" || prefix === "direct" || prefix === "dm") chatType = "direct";
		id = id.slice(m[0].length).trim();
	}
	if (!id) return null;
	chatType ??= /^cid/u.test(id) ? "group" : /:group:/u.test(String(sessionKey ?? "")) ? "group" : "direct";
	return { id, chatType };
}
/** Robot API target of a route: openConversationId for a group, userId for a direct chat. */
function vInterTargetOf(route) {
	if (!route) return null;
	const parsed = vInterParseTo(route.chatType === "group" ? route.chatId || route.to : route.peerId || route.chatId || route.to);
	if (!parsed) return null;
	return route.chatType === "group" ? { openConversationId: parsed.id } : { userId: parsed.id };
}
/** What a message looks like once markdown is gone, for recognising V's own anchors if they come back. */
function vInterEchoKey(text) {
	const key = String(text ?? "").replace(/[\\*_#>`~|<>[\]]/gu, "").replace(/\s+/gu, " ").trim().slice(0, 400);
	return key.length >= 8 ? key : "";
}
function vInterRemember(key, now = Date.now()) {
	if (!key) return;
	vInterAnchors.set(key, now + V_INTER_ECHO_TTL_MS);
	if (vInterAnchors.size > 200) {
		for (const [k, until] of vInterAnchors) if (until < now) vInterAnchors.delete(k);
	}
}
/** A Stream callback that is the robot's own message: its sender is the robot, or it is an anchor this process just posted (A11). */
function vInterIsSelfEcho(data) {
	if (!data || typeof data !== "object") return false;
	const bot = data.chatbotUserId;
	if (bot && (data.senderId === bot || data.senderStaffId === bot)) return true;
	const now = Date.now();
	const seen = (key) => {
		const until = key ? vInterAnchors.get(key) : void 0;
		return until !== void 0 && until >= now;
	};
	if (data.msgId && seen(`msg:${data.msgId}`)) return true;
	let content = data.content;
	if (typeof content === "string") try {
		content = JSON.parse(content);
	} catch {
		content = void 0;
	}
	for (const text of [data.text?.content, data.markdown?.text, content?.text, content?.markdown?.text]) if (typeof text === "string" && seen(vInterEchoKey(text))) return true;
	return false;
}
/** Markdown title (notification preview): the anchor's first line, 20 characters, no emphasis marks. */
function vInterTitle(text) {
	const line = String(text ?? "").split("\n")[0].replace(/[\\*_`~|]/gu, "").replace(/^[\s#>-]+/u, "");
	return Array.from(line).slice(0, 20).join("").trim() || "V";
}
/**
 * The bridge objects for one connector account: its own key, plus "dingtalk:default" for the
 * connector's default account ("__default__" here, "default" for the core when a session has
 * no account id; the connector treats the two as the same account).
 */
function createVInterSessionBridges({ account, cfg, runtime, log, messageHandler, isStopped, processing }) {
	const accountId = vInterAccountId(account.accountId);
	const isDefault = String(account.accountId ?? "").trim() === V_INTER_CONNECTOR_DEFAULT_ACCOUNT;
	const accepts = new Set([accountId, ...isDefault ? ["default"] : []]);
	const sendConfig = () => ({
		...account.config,
		...account.clientId != null ? { clientId: account.clientId } : {},
		...account.clientSecret != null ? { clientSecret: account.clientSecret } : {}
	});
	const bridge = {
		v: 1,
		channel: V_INTER_CHANNEL,
		accountId,
		caps: V_INTER_CAPS,
		/** Only the stored delivery address: the cid in a DingTalk session key is lower-cased and cannot be used (§2.a). */
		async resolveRoute(query) {
			const delivery = query?.delivery ?? {};
			if (delivery.channel && !/^dingtalk(?:-connector)?$/iu.test(String(delivery.channel))) return { ok: false, code: "NO_ROUTE", reason: `last delivery went to ${delivery.channel}, not DingTalk` };
			if (delivery.accountId && !accepts.has(vInterAccountId(delivery.accountId))) return { ok: false, code: "NO_ROUTE", reason: `delivery account ${delivery.accountId} is not this DingTalk account` };
			const parsed = vInterParseTo(delivery.to, query?.sessionKey);
			if (!parsed) return { ok: false, code: "NO_ROUTE", reason: "the DingTalk session has no stored delivery address" };
			const ownerIds = (query?.ownerIds ?? []).map(String);
			const direct = parsed.chatType === "direct";
			return { ok: true, route: {
				channel: V_INTER_CHANNEL,
				accountId,
				to: parsed.id,
				chatId: parsed.id,
				chatType: parsed.chatType,
				...direct ? { peerId: parsed.id } : {},
				humans: !direct ? "shared" : ownerIds.includes(parsed.id) ? "owner_only" : "single_peer"
			} };
		},
		/** A markdown robot message (no AI card); at least once, so a retry repeats the same #code. */
		async post(request) {
			const target = vInterTargetOf(request?.route);
			if (!target) throw vInterBridgeError("POST_FAILED", "the route has no DingTalk target", false);
			const text = String(request?.text ?? "");
			vInterRemember(vInterEchoKey(text));
			let result;
			try {
				result = await vInterSendProactive(sendConfig(), target, text, { msgType: "markdown", title: vInterTitle(text), useAICard: false, fallbackToNormal: true });
			} catch (err) {
				throw vInterBridgeError("CHANNEL_DOWN", `DingTalk send failed: ${err?.message || err}`, true);
			}
			if (!result?.ok) {
				const message = String(result?.error || "unknown error");
				const status = Number(/status code (\d{3})/u.exec(message)?.[1] ?? 0);
				throw vInterBridgeError("POST_FAILED", `DingTalk send failed: ${message}`, !status || status >= 500 || status === 429);
			}
			if (!result.processQueryKey) throw vInterBridgeError("POST_FAILED", "DingTalk accepted the message without a processQueryKey", false);
			vInterRemember(`msg:${result.processQueryKey}`);
			return { messageId: String(result.processQueryKey) };
		},
		/**
		 * Runs the request as an inbound turn of the route's chat with the target session as its
		 * route. Resolves "started" at onAgentRunStart, "busy" when the core's exclusive admission
		 * found the session busy (nothing shown, nothing written), else "rejected".
		 */
		async start(request) {
			const reject = (code, message) => ({ status: "rejected", code, message, started: false });
			if (isStopped()) return reject("CHANNEL_DOWN", "the DingTalk connection of this account is stopped");
			const route = request?.route;
			if (!route || route.channel !== V_INTER_CHANNEL || !accepts.has(vInterAccountId(route.accountId))) return reject("ROUTE_MISMATCH", `route ${route?.channel}:${route?.accountId} is not DingTalk account ${accountId}`);
			const target = vInterTargetOf(route);
			if (!target) return reject("NO_ROUTE", "the route has no DingTalk target");
			const isGroup = route.chatType === "group";
			const routeSender = isGroup ? request.routePeerId || request.sender?.id : target.userId;
			const data = {
				msgtype: "text",
				text: { content: String(request.promptText ?? "") },
				msgId: request.syntheticMessageId,
				conversationType: isGroup ? "2" : "1",
				conversationId: isGroup ? target.openConversationId : `dm:${target.userId}`,
				...isGroup && route.label ? { conversationTitle: route.label } : {},
				senderStaffId: routeSender,
				senderId: routeSender,
				senderNick: request.sender?.name || "V",
				robotCode: String(account.clientId ?? account.config?.clientId ?? ""),
				isInAtList: true,
				createAt: Date.now()
			};
			return await new Promise((resolve) => {
				let settled = false;
				let resolveDone;
				const done = new Promise((r) => {
					resolveDone = r;
				});
				const settle = (outcome) => {
					if (settled) return;
					settled = true;
					resolve(outcome);
				};
				// What the message handler and the reply dispatcher see as params.vInterSession.
				const control = {
					req: request,
					target,
					runStarted: false,
					runId: null,
					finals: [],
					finalCount: 0,
					errorText: void 0,
					terminal: void 0,
					dispatchResult: void 0,
					readVisible: () => false,
					// replyOptions.vInterSession and ctx.VInterSession (design §2.a): read by the core's exclusive admission guard.
					seam: {
						exclusive: true,
						id: request.id,
						kind: request.kind,
						onBusy: (info) => {
							if (control.runStarted) return;
							settle({ status: "busy", reason: V_INTER_BUSY_REASONS.includes(info?.reason) ? info.reason : "active_run" });
						}
					},
					onRunStart: (runId) => {
						if (control.runStarted) return;
						control.runStarted = true;
						control.runId = String(runId || request.runId);
						settle({ status: "started", runId: control.runId, done });
					},
					dispatched: (result) => {
						control.dispatchResult = result;
					}
				};
				const runOutcome = (status, error) => ({
					status,
					finals: control.finals.map((f) => ({ ...f, ...f.mediaUrls ? { mediaUrls: [...f.mediaUrls] } : {} })),
					visibleReplySent: Boolean(control.readVisible()),
					finalCount: control.finalCount,
					...error ? { error } : {}
				});
				processing?.start?.();
				Promise.resolve().then(() => messageHandler({
					accountId: account.accountId,
					config: account.config,
					data,
					sessionWebhook: void 0,
					runtime,
					log,
					cfg,
					vInterSession: control
				})).then(() => {
					// A run that reported neither completed nor failed was aborted (agent-runner executeAgentTurn).
					if (control.runStarted) resolveDone(control.terminal === "failed" ? runOutcome("error", control.errorText || "the agent run failed") : runOutcome(control.terminal === "completed" ? "ok" : "aborted"));
					else settle(reject("GATED", "the DingTalk handler returned without starting a run"));
				}, (err) => {
					const message = String(err?.message || err);
					if (control.runStarted) resolveDone(runOutcome("error", message));
					else settle(reject(V_INTER_RESTART_WEDGE_RE.test(message) ? "RESTART_WEDGE" : isStopped() ? "CHANNEL_DOWN" : "INTERNAL", message));
				}).finally(() => processing?.end?.());
			});
		}
	};
	return isDefault && accountId !== "default" ? [bridge, { ...bridge, accountId: "default" }] : [bridge];
}
//#region src/core/connection.ts
/**
* 钉钉 WebSocket 连接层
*
* 职责：
* - 管理单个钉钉账号的 WebSocket 连接
* - 实现应用层心跳检测（10 秒间隔，20 秒超时）
* - 处理连接重连逻辑，带指数退避
* - 消息去重（内置 Map，5 分钟 TTL）
*
* 核心特性：
* - 关闭 SDK 内置 keepAlive，使用自定义心跳
* - 详细的消息接收日志（三阶段：接收、解析、处理）
* - 连接统计和监控（每分钟输出）
*/
/** 心跳间隔（毫秒） */
const HEARTBEAT_INTERVAL = 10 * 1e3;
/** 超时阈值（毫秒） */
const TIMEOUT_THRESHOLD = 20 * 1e3;
/** 基础退避时间（毫秒） */
const BASE_BACKOFF_DELAY = 1e3;
/** 最大退避时间（毫秒） */
const MAX_BACKOFF_DELAY = 30 * 1e3;
let _streamNoiseSilenced = false;
function silenceDingtalkStreamConsoleNoise() {
	if (_streamNoiseSilenced) return;
	_streamNoiseSilenced = true;
	const origConsoleInfo = console.info.bind(console);
	console.info = (...args) => {
		const first = args[0];
		if (typeof first === "string") {
			if (first === "Disconnecting.") return;
			if (/^\[[^\]]+\] connect success$/.test(first)) return;
		}
		return origConsoleInfo(...args);
	};
}
let _connectionNoticePrinted = false;
function printConnectionNoticeOnce() {
	if (_connectionNoticePrinted) return;
	_connectionNoticePrinted = true;
	console.log("[dingtalk-connector] ℹ️  上游 dingtalk-stream SDK 的 `Disconnecting.` / `connect success` 日志已由本插件过滤；真实重连（网络抖动、服务端推 disconnect 等）由 connector 自动处理。正常运行下不应看到高频（≤30s）周期性重连，如有请提 issue。");
}
async function monitorSingleAccount(opts) {
	const { cfg, account, runtime, abortSignal, messageHandler, onStatusChange } = opts;
	const { accountId } = account;
	silenceDingtalkStreamConsoleNoise();
	const clawdbotConfig = cfg;
	const log = runtime?.log;
	const { createLoggerFromConfig } = await import("./logger-BmJkQkm1.mjs");
	const logger = createLoggerFromConfig(account.config, `DingTalk:${accountId}`);
	if (!account.clientId || !account.clientSecret) throw new Error(`[DingTalk][${accountId}] Missing credentials: clientId=${account.clientId ? "present" : "MISSING"}, clientSecret=${account.clientSecret ? "present" : "MISSING"}. Please check your configuration in channels.dingtalk-connector.`);
	const clientIdStr = String(account.clientId);
	const clientSecretStr = String(account.clientSecret);
	if (clientIdStr.length < 10 || clientSecretStr.length < 10) throw new Error(`[DingTalk][${accountId}] Invalid credentials format: clientId length=${clientIdStr.length}, clientSecret length=${clientSecretStr.length}. Credentials appear to be too short or invalid.`);
	if (process.platform === "darwin") for (const stdioFd of [
		0,
		1,
		2
	]) try {
		fs.fstatSync(stdioFd);
	} catch (fdError) {
		if (fdError.code === "EBADF") {
			logger.warn(`[LaunchAgent] 检测到 fd ${stdioFd} 无效（EBADF），重定向到 /dev/null 以防止 TCP socket 创建失败`);
			try {
				fs.openSync("/dev/null", stdioFd === 0 ? "r" : "w");
			} catch (openError) {
				logger.warn(`[LaunchAgent] 无法修复 fd ${stdioFd}: ${openError.message}`);
			}
		}
	}
	logger.info(`Starting DingTalk Stream client...`);
	logger.info(`Initializing with clientId: ${clientIdStr.substring(0, 8)}...`);
	logger.info(`WebSocket keepAlive: false (using application-layer heartbeat)`);
	const dingtalkStreamModule = await import("dingtalk-stream");
	const DWClient = dingtalkStreamModule.DWClient;
	const { TOPIC_ROBOT } = dingtalkStreamModule;
	if (!DWClient) throw new Error("Failed to import DWClient from dingtalk-stream module");
	const client = new DWClient({
		clientId: account.clientId,
		clientSecret: account.clientSecret,
		debug: account.config.debug,
		endpoint: account.config.endpoint || "https://api.dingtalk.com",
		autoReconnect: false,
		keepAlive: false
	});
	let lastSocketAvailableTime = Date.now();
	let connectionEstablishedTime = Date.now();
	let isReconnecting = false;
	let reconnectAttempts = 0;
	let keepAliveTimer = null;
	let isStopped = false;
	let activeMessageProcessingCount = 0;
	let messageProcessingKeepAliveTimer = null;
	/**
	* 标记消息处理开始，启动定期更新机制
	* 在消息处理期间，定时刷新 lastSocketAvailableTime
	* 防止长时间处理（如复杂的 AI 任务）触发心跳超时
	*/
	function markMessageProcessingStart() {
		activeMessageProcessingCount += 1;
		lastSocketAvailableTime = Date.now();
		if (messageProcessingKeepAliveTimer) return;
		messageProcessingKeepAliveTimer = setInterval(() => {
			if (activeMessageProcessingCount > 0) {
				lastSocketAvailableTime = Date.now();
				logger.debug(`📝 消息处理中，更新 socket 可用时间`);
			}
		}, 15 * 1e3);
		logger.debug(`📝 消息处理开始，启动活跃标记定时器`);
	}
	/**
	* 标记消息处理结束，停止定期更新机制
	*/
	function markMessageProcessingEnd() {
		activeMessageProcessingCount = Math.max(0, activeMessageProcessingCount - 1);
		if (activeMessageProcessingCount > 0) {
			lastSocketAvailableTime = Date.now();
			return;
		}
		if (messageProcessingKeepAliveTimer) {
			clearInterval(messageProcessingKeepAliveTimer);
			messageProcessingKeepAliveTimer = null;
		}
		lastSocketAvailableTime = Date.now();
		logger.debug(`✅ 消息处理结束，清理活跃标记定时器`);
	}
	/** 计算指数退避延迟（带抖动） */
	function calculateBackoffDelay(attempt) {
		const exponentialDelay = BASE_BACKOFF_DELAY * Math.pow(2, attempt);
		const jitter = Math.random() * 1e3;
		return Math.min(exponentialDelay + jitter, MAX_BACKOFF_DELAY);
	}
	/** 统一重连函数，带指数退避（无限重连） */
	async function doReconnect(immediate = false) {
		if (isReconnecting || isStopped) {
			logger.debug(`正在重连中或已停止，跳过`);
			return;
		}
		isReconnecting = true;
		if (!immediate && reconnectAttempts > 0) {
			const delay = calculateBackoffDelay(reconnectAttempts);
			logger.info(`⏳ 等待 ${Math.round(delay / 1e3)} 秒后重连 (尝试 ${reconnectAttempts + 1})`);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
		try {
			if (client.socket?.readyState === 1 || client.socket?.readyState === 3) {
				await client.disconnect();
				logger.info(`已断开旧连接`);
			}
			await client.connect();
			setupPongListener();
			setupMessageListener();
			setupCloseListener();
			if (!await new Promise((resolve) => {
				const timeout = setTimeout(() => {
					resolve(false);
				}, 1e4);
				if (client.socket?.readyState === 1) {
					clearTimeout(timeout);
					resolve(true);
					return;
				}
				const onOpen = () => {
					clearTimeout(timeout);
					client.socket?.removeListener("open", onOpen);
					client.socket?.removeListener("error", onError);
					resolve(true);
				};
				const onError = (err) => {
					clearTimeout(timeout);
					client.socket?.removeListener("open", onOpen);
					client.socket?.removeListener("error", onError);
					logger.warn(`连接建立失败: ${err.message}`);
					resolve(false);
				};
				client.socket?.once("open", onOpen);
				client.socket?.once("error", onError);
			})) throw new Error(`连接建立超时或失败`);
			lastSocketAvailableTime = Date.now();
			connectionEstablishedTime = Date.now();
			reconnectAttempts = 0;
			onStatusChange?.({
				connected: true,
				lastConnectedAt: Date.now()
			});
			logger.info(`✅ 重连成功 (socket 状态=${client.socket?.readyState})`);
		} catch (err) {
			reconnectAttempts++;
			logger.error(`重连失败：${err.message} (尝试 ${reconnectAttempts})`);
			throw err;
		} finally {
			isReconnecting = false;
		}
	}
	/** 监听 pong 响应（更新 socket 可用时间） */
	function setupPongListener() {
		client.socket?.on("pong", () => {
			lastSocketAvailableTime = Date.now();
			logger.debug(`收到 PONG 响应`);
		});
	}
	/** 监听 WebSocket message 事件，收到 disconnect 消息时立即触发重连 */
	function setupMessageListener() {
		client.socket?.on("message", (data) => {
			try {
				const msg = JSON.parse(data);
				if (msg.type === "SYSTEM" && msg.headers?.topic === "disconnect") {
					logger.debug(`收到服务端 disconnect topic，即将重连`);
					if (!isStopped && !isReconnecting) doReconnect(true).catch((err) => {
						logger.error(`[${accountId}] 重连失败：${err.message}`);
					});
				}
			} catch (e) {}
		});
	}
	/** 监听 WebSocket close 事件，服务端主动断开时立即触发重连 */
	function setupCloseListener() {
		client.socket?.on("close", (code, reason) => {
			logger.info(`WebSocket close: code=${code}, reason=${reason || "未知"}, isStopped=${isStopped}`);
			onStatusChange?.({ connected: false });
			if (isStopped) return;
			setTimeout(() => {
				doReconnect(true).catch((err) => {
					logger.error(`重连失败：${err.message}`);
				});
			}, 0);
		});
	}
	/**
	* 启动 keepAlive 机制（单定时器 + 指数退避）
	*
	* 业界最佳实践：
	* - 单定时器：每 10 秒检查一次，同时完成心跳和超时检测
	* - 使用 WebSocket 原生 Ping
	* - 指数退避重连：避免雪崩效应
	*/
	function startKeepAlive() {
		logger.debug(`🚀 启动 keepAlive 定时器，间隔=${HEARTBEAT_INTERVAL / 1e3}秒`);
		keepAliveTimer = setInterval(async () => {
			if (isStopped) {
				if (keepAliveTimer) clearInterval(keepAliveTimer);
				return;
			}
			try {
				const elapsed = Date.now() - lastSocketAvailableTime;
				if (elapsed > TIMEOUT_THRESHOLD) {
					logger.info(`⚠️ 超时检测：已 ${Math.round(elapsed / 1e3)} 秒未确认 socket 可用，触发重连...`);
					await doReconnect();
					return;
				}
				const socketState = client.socket?.readyState;
				const timeSinceConnection = Date.now() - connectionEstablishedTime;
				logger.debug(`心跳检测：socket 状态=${socketState}, elapsed=${Math.round(elapsed / 1e3)}s, 连接已建立=${Math.round(timeSinceConnection / 1e3)}s`);
				if (socketState !== 1) {
					if (timeSinceConnection < 15e3) {
						logger.debug(`⏳ 连接建立中（已 ${Math.round(timeSinceConnection / 1e3)}s），跳过状态检查`);
						return;
					}
					logger.info(`⚠️ 心跳检测：socket 状态=${socketState}，触发重连...`);
					await doReconnect(true);
					return;
				}
				try {
					client.socket?.ping();
					logger.debug(`💓 发送 PING 心跳成功`);
				} catch (err) {
					logger.warn(`发送 PING 失败：${err.message}`);
				}
			} catch (err) {
				logger.error(`keepAlive 检测失败：${err.message}`);
			}
		}, HEARTBEAT_INTERVAL);
		logger.debug(`✅ keepAlive 定时器已启动`);
		return () => {
			if (keepAliveTimer) clearInterval(keepAliveTimer);
			keepAliveTimer = null;
			logger.debug(`keepAlive 定时器已清理`);
		};
	}
	// inter-session bridge: registered below, removed in stop().
	let vInterBridges = [];
	/** 停止并清理所有资源 */
	function stop() {
		isStopped = true;
		vInterUnregister(vInterBridges);
		vInterBridges = [];
		if (keepAliveTimer) clearInterval(keepAliveTimer);
		keepAliveTimer = null;
		if (messageProcessingKeepAliveTimer) {
			clearInterval(messageProcessingKeepAliveTimer);
			messageProcessingKeepAliveTimer = null;
		}
		if (client.socket) client.socket.removeAllListeners();
		logger.debug(`Connection 已停止`);
	}
	return new Promise(async (resolve, reject) => {
		if (abortSignal) {
			const onAbort = async () => {
				logger.info(`Abort signal received, stopping...`);
				stop();
				try {
					if (client.socket && client.socket.readyState === 1) await client.disconnect();
				} catch (err) {
					logger.warn(`断开连接时出错：${err.message}`);
				}
				resolve();
			};
			abortSignal.addEventListener("abort", onAbort, { once: true });
		}
		let receivedCount = 0;
		let processedCount = 0;
		let lastMessageTime = Date.now();
		const statsInterval = setInterval(() => {
			const timeSinceLastMessage = Math.round((Date.now() - lastMessageTime) / 1e3);
			logger.info(`统计：收到=${receivedCount}, 处理=${processedCount}, 丢失=${receivedCount - processedCount}, 距上次消息=${timeSinceLastMessage}s`);
		}, 6e4);
		// v-experience-dingtalk-v1: question card buttons.
		client.registerCallbackListener("/v1.0/card/instances/callback", async (res) => {
			let reply;
			try {
				reply = await vExperience.handleDingtalkCardCallback(JSON.parse(res.data ?? "{}"));
			} catch (err) {
				logger.warn(`[DingTalk][v-experience] card callback failed: ${err?.message || err}`);
			}
			client.socketCallBackResponse(res.headers?.messageId, reply ?? {});
		});
		// inter-session bridge: this account's sessions_send requests run through messageHandler
		// (an abort that came before this point never calls stop(), so it is checked here).
		if (!isStopped && !abortSignal?.aborted) {
			vInterBridges = createVInterSessionBridges({
				account,
				cfg: clawdbotConfig,
				runtime,
				log,
				messageHandler,
				isStopped: () => isStopped,
				processing: {
					start: markMessageProcessingStart,
					end: markMessageProcessingEnd
				}
			});
			vInterRegister(vInterBridges);
			logger.info(`[DingTalk][inter-session] bridge registered: ${vInterBridges.map((b) => `${b.channel}:${b.accountId}`).join(", ")}`);
		}
		client.registerCallbackListener(TOPIC_ROBOT, async (res) => {
			receivedCount++;
			lastMessageTime = Date.now();
			onStatusChange?.({ lastInboundAt: Date.now() });
			const messageId = res.headers?.messageId;
			const timestamp = (/* @__PURE__ */ new Date()).toISOString();
			logger.info(`\n========== 收到新消息 ==========`);
			logger.info(`时间：${timestamp}`);
			logger.info(`MessageId: ${messageId || "N/A"}`);
			logger.info(`Headers: ${JSON.stringify(res.headers || {})}`);
			logger.info(`Data 长度：${res.data?.length || 0} 字符`);
			if (messageId) {
				client.socketCallBackResponse(messageId, { success: true });
				logger.info(`✅ 已立即确认回调：messageId=${messageId}`);
			} else logger.warn(`⚠️ 警告：消息没有 messageId`);
			if (messageId && checkAndMarkDingtalkMessage(accountId, messageId, void 0)) {
				processedCount++;
				logger.warn(`⚠️ 检测到重复消息（协议层），跳过处理：messageId=${messageId} (${processedCount}/${receivedCount})`);
				logger.info(`========== 消息处理结束（重复） ==========\n`);
				return;
			}
			markMessageProcessingStart();
			try {
				let data;
				try {
					data = JSON.parse(res.data);
				} catch (parseError) {
					logger.error("Failed to parse response data as JSON:", {
						error: parseError instanceof Error ? parseError.message : String(parseError),
						rawData: typeof res.data === "string" ? res.data.substring(0, 500) : res.data,
						dataType: typeof res.data
					});
					throw new Error(`Invalid JSON response from DingTalk API. Error: ${parseError instanceof Error ? parseError.message : String(parseError)}. Raw data (first 100 chars): ${String(res.data).substring(0, 100)}`);
				}
				if (vInterIsSelfEcho(data)) {
					processedCount++;
					logger.warn(`[DingTalk][inter-session] 丢弃机器人自己发出的消息回调：msgId=${data.msgId || "N/A"}`);
					return;
				}
				logger.info(`\n----- 消息详情 -----`);
				logger.info(`消息类型：${data.msgtype || "unknown"}`);
				logger.info(`会话类型：${data.conversationType === "1" ? "DM (单聊)" : data.conversationType === "2" ? "Group (群聊)" : data.conversationType}`);
				logger.info(`发送者：${data.senderNick || "unknown"} (${data.senderStaffId || data.senderId || "unknown"})`);
				logger.info(`会话 ID: ${data.conversationId || "N/A"}`);
				logger.info(`消息 ID: ${data.msgId || "N/A"}`);
				logger.info(`SessionWebhook: ${data.sessionWebhook ? "已提供" : "未提供"}`);
				logger.info(`RobotCode: ${data.robotCode || account.config?.clientId || "N/A"}`);
				if (data.chatbotUserId || data.chatbotCorpId) console.log(`[DingTalk:${accountId}] [BotIdentity] accountId=${accountId} chatbotUserId=${data.chatbotUserId || "N/A"} chatbotCorpId=${data.chatbotCorpId || "N/A"}`);
				data.msgId;
				let contentPreview = "N/A";
				if (data.text?.content) contentPreview = data.text.content.length > 100 ? data.text.content.substring(0, 100) + "..." : data.text.content;
				else if (data.content) contentPreview = JSON.stringify(data.content).substring(0, 100) + "...";
				logger.info(`消息内容预览：${contentPreview}`);
				logger.info(`完整数据字段：${Object.keys(data).join(", ")}`);
				logger.info(`----- 消息详情结束 -----\n`);
				logger.info(`🚀 开始处理消息...`);
				await messageHandler({
					accountId,
					config: account.config,
					data,
					sessionWebhook: data.sessionWebhook,
					runtime,
					log,
					cfg: clawdbotConfig
				});
				processedCount++;
				logger.info(`✅ 消息处理完成 (${processedCount}/${receivedCount})`);
				logger.info(`========== 消息处理结束（成功） ==========\n`);
			} catch (error) {
				processedCount++;
				const errorMsg = `❌ 处理消息异常 (${processedCount}/${receivedCount}): ${error?.message || "未知错误"}`;
				const errorStack = error?.stack || "无堆栈信息";
				logger.error(errorMsg);
				logger.error(`错误堆栈:\n${errorStack}`);
				logger.info(`========== 消息处理结束（失败） ==========\n`);
			} finally {
				markMessageProcessingEnd();
			}
		});
		const cleanup = () => {
			clearInterval(statsInterval);
			stop();
		};
		try {
			await client.connect();
			setupPongListener();
			setupMessageListener();
			setupCloseListener();
			logger.info(`Connected to DingTalk Stream successfully`);
			logger.info(`PID: ${process.pid}`);
			logger.info(`✅ 自定义 keepAlive: true (10 秒心跳，20 秒超时), 指数退避重连`);
			printConnectionNoticeOnce();
			onStatusChange?.({
				connected: true,
				lastConnectedAt: Date.now()
			});
			const cleanupKeepAlive = startKeepAlive();
			const enhancedCleanup = () => {
				cleanupKeepAlive();
				clearInterval(statsInterval);
				stop();
			};
			process.once("exit", enhancedCleanup);
			process.once("SIGINT", enhancedCleanup);
			process.once("SIGTERM", enhancedCleanup);
		} catch (error) {
			cleanup();
			logger.info(`连接失败，错误详情：`);
			logger.info(`  - error.message: ${error.message}`);
			logger.info(`  - error.response?.status: ${error.response?.status}`);
			logger.info(`  - error.response?.data: ${JSON.stringify(error.response?.data || {})}`);
			logger.info(`  - error.code: ${error.code}`);
			logger.info(`  - error.stack: ${error.stack?.split("\n").slice(0, 3).join("\n")}`);
			if (error.response?.status === 400 || error.message?.includes("status code 400") || error.message?.includes("400")) {
				reject(/* @__PURE__ */ new Error(`[DingTalk][${accountId}] Bad Request (400):\n  - clientId or clientSecret format is invalid\n  - clientId: ${clientIdStr} (type: ${typeof account.clientId}, length: ${clientIdStr.length})\n  - clientSecret: ****** (type: ${typeof account.clientSecret}, length: ${clientSecretStr.length})\n  - Common issues:\n    1. clientId/clientSecret must be strings, not numbers\n    2. Remove any quotes or special characters\n    3. Ensure credentials are from the correct DingTalk app\n    4. Check if clientId starts with 'ding' prefix\n  - Error details: ${error.message}\n  - Response data: ${JSON.stringify(error.response?.data || {})}`));
				return;
			}
			if (error.response?.status === 401 || error.message?.includes("401")) {
				reject(/* @__PURE__ */ new Error(`[DingTalk][${accountId}] Authentication failed (401 Unauthorized):\n  - Your clientId or clientSecret is invalid, expired, or revoked\n  - clientId: ${clientIdStr.substring(0, 8)}...\n  - Please verify your credentials at DingTalk Developer Console\n  - Error details: ${error.message}`));
				return;
			}
			reject(/* @__PURE__ */ new Error(`[DingTalk][${accountId}] Failed to connect to DingTalk Stream: ${error.message}`));
			return;
		}
		client.on("error", (err) => {
			logger.error(`Connection error: ${err.message}`);
		});
		client.on("reconnect", () => {
			logger.info(`SDK reconnecting...`);
		});
		client.on("reconnected", () => {
			logger.info(`✅ SDK reconnected successfully`);
		});
	});
}
function resolveReactionSyntheticEvent(event) {
	return null;
}
//#endregion
export { monitorSingleAccount, resolveReactionSyntheticEvent };
