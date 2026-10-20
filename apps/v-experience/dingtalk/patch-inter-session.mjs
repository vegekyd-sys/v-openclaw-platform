// The DingTalk inbound bridge for sessions_send (docs/inter-session/design.md §2.a, §3.8, §13),
// patched onto the DingTalk connector bytes V runs (@dingtalk-real-ai/dingtalk-connector 0.8.26
// with v-experience-dingtalk-v1, captured 2026-10-20).
//
//   patchConnectionChunk(source)       connection-*.mjs: the bridge (resolveRoute / post / start),
//                                      registered per account in monitorSingleAccount, removed in
//                                      stop(); drops callbacks that are V's own messages
//   patchMessageHandlerChunk(source)   message-handler-*.mjs: a sessions_send turn
//                                      (params.vInterSession) skips prepare and the question
//                                      interception, runs with the target session as its route,
//                                      creates its AI card only once the run started, never
//                                      posts through a sessionWebhook, and reports its finals
//
// The original applyAll (patch.mjs) skips a whole file once it sees its own marker, so this is a
// separate module with its own marker. Every anchor must occur exactly once; a file that already
// carries MARKER is refused ("already patched"); a file without V's v-experience-dingtalk-v1 is
// refused too (this stacks on V's live bytes, never on the npm original).
//
//   node apps/v-experience/dingtalk/patch-inter-session.mjs          regenerate the release files
//   node apps/v-experience/dingtalk/patch-inter-session.mjs --check  verify them, write nothing
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MARKER = "v-dingtalk-inter-session-bridge-v1";
export const EXPERIENCE_MARKER = "v-experience-dingtalk-v1";
export const CAPTURE = "v2026.9.1-db91.6-subagent-index-20261020";
export const CAPTURE_DIR = `release/captured/${CAPTURE}.dingtalk/dist`;
export const RELEASE_DIR = "lab/release-files/dingtalk-inter-session-bridge";
export const CONNECTION_FILE = "dist/connection-DCvu-l09.mjs";
export const MESSAGE_HANDLER_FILE = "dist/message-handler-BUoLSylZ.mjs";
/** Exports `sendProactive as i`, `sendTextMessage as a`, `sendMessage as r`, `sendMarkdownMessage as t` (0.8.26). */
export const MESSAGING_CHUNK = "messaging-JY5zinFJ.mjs";

// ---------------------------------------------------------------- connection chunk

const CONNECTION_HELPERS = `// ${MARKER}
import { i as vInterSendProactive } from "./${MESSAGING_CHUNK}";
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
		const key = \`\${bridge.channel}:\${vInterAccountId(bridge.accountId)}\`;
		reg.bridges.set(key, bridge);
		vInterNotify(reg, key, bridge);
	}
}
function vInterUnregister(bridges) {
	const reg = vInterRegistry();
	for (const bridge of bridges ?? []) {
		const key = \`\${bridge.channel}:\${vInterAccountId(bridge.accountId)}\`;
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
	const key = String(text ?? "").replace(/[\\\\*_#>\`~|<>[\\]]/gu, "").replace(/\\s+/gu, " ").trim().slice(0, 400);
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
	if (data.msgId && seen(\`msg:\${data.msgId}\`)) return true;
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
	const line = String(text ?? "").split("\\n")[0].replace(/[\\\\*_\`~|]/gu, "").replace(/^[\\s#>-]+/u, "");
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
			if (delivery.channel && !/^dingtalk(?:-connector)?$/iu.test(String(delivery.channel))) return { ok: false, code: "NO_ROUTE", reason: \`last delivery went to \${delivery.channel}, not DingTalk\` };
			if (delivery.accountId && !accepts.has(vInterAccountId(delivery.accountId))) return { ok: false, code: "NO_ROUTE", reason: \`delivery account \${delivery.accountId} is not this DingTalk account\` };
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
				throw vInterBridgeError("CHANNEL_DOWN", \`DingTalk send failed: \${err?.message || err}\`, true);
			}
			if (!result?.ok) {
				const message = String(result?.error || "unknown error");
				const status = Number(/status code (\\d{3})/u.exec(message)?.[1] ?? 0);
				throw vInterBridgeError("POST_FAILED", \`DingTalk send failed: \${message}\`, !status || status >= 500 || status === 429);
			}
			if (!result.processQueryKey) throw vInterBridgeError("POST_FAILED", "DingTalk accepted the message without a processQueryKey", false);
			vInterRemember(\`msg:\${result.processQueryKey}\`);
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
			if (!route || route.channel !== V_INTER_CHANNEL || !accepts.has(vInterAccountId(route.accountId))) return reject("ROUTE_MISMATCH", \`route \${route?.channel}:\${route?.accountId} is not DingTalk account \${accountId}\`);
			const target = vInterTargetOf(route);
			if (!target) return reject("NO_ROUTE", "the route has no DingTalk target");
			const isGroup = route.chatType === "group";
			const routeSender = isGroup ? request.routePeerId || request.sender?.id : target.userId;
			const data = {
				msgtype: "text",
				text: { content: String(request.promptText ?? "") },
				msgId: request.syntheticMessageId,
				conversationType: isGroup ? "2" : "1",
				conversationId: isGroup ? target.openConversationId : \`dm:\${target.userId}\`,
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
`;

const connectionEdits = [
  {
    name: "helpers",
    anchor: 'import * as vExperience from "./v-experience.mjs";\n//#region src/core/connection.ts\n',
    replace: `import * as vExperience from "./v-experience.mjs";\n${CONNECTION_HELPERS}//#region src/core/connection.ts\n`,
  },
  {
    // Removed whenever the connection stops (abort, failed connect, process exit).
    name: "unregister",
    anchor: "\t/** 停止并清理所有资源 */\n\tfunction stop() {\n\t\tisStopped = true;\n",
    replace: "\t// inter-session bridge: registered below, removed in stop().\n\tlet vInterBridges = [];\n\t/** 停止并清理所有资源 */\n\tfunction stop() {\n\t\tisStopped = true;\n\t\tvInterUnregister(vInterBridges);\n\t\tvInterBridges = [];\n",
  },
  {
    // The closure has cfg, account, runtime and the message handler (design §3.8).
    name: "register",
    anchor: "\t\tclient.registerCallbackListener(TOPIC_ROBOT, async (res) => {\n",
    before: `\t\t// inter-session bridge: this account's sessions_send requests run through messageHandler
\t\t// (an abort that came before this point never calls stop(), so it is checked here).
\t\t// A failure here never stops the connection; sessions_send then uses the agent transport.
\t\tif (!isStopped && !abortSignal?.aborted) try {
\t\t\tvInterBridges = createVInterSessionBridges({
\t\t\t\taccount,
\t\t\t\tcfg: clawdbotConfig,
\t\t\t\truntime,
\t\t\t\tlog,
\t\t\t\tmessageHandler,
\t\t\t\tisStopped: () => isStopped,
\t\t\t\tprocessing: {
\t\t\t\t\tstart: markMessageProcessingStart,
\t\t\t\t\tend: markMessageProcessingEnd
\t\t\t\t}
\t\t\t});
\t\t\tvInterRegister(vInterBridges);
\t\t\tlogger.info(\`[DingTalk][inter-session] bridge registered: \${vInterBridges.map((b) => \`\${b.channel}:\${b.accountId}\`).join(", ")}\`);
\t\t} catch (err) {
\t\t\tlogger.error(\`[DingTalk][inter-session] bridge not registered: \${err?.message || err}\`);
\t\t}
`,
  },
  {
    // Self-echo defence (A11): a callback that is the robot's own message never becomes input.
    name: "self-echo",
    anchor: "\t\t\t\tlogger.info(`\\n----- 消息详情 -----`);\n",
    before: `\t\t\t\tif (vInterIsSelfEcho(data)) {
\t\t\t\t\tprocessedCount++;
\t\t\t\t\tlogger.warn(\`[DingTalk][inter-session] 丢弃机器人自己发出的消息回调：msgId=\${data.msgId || "N/A"}\`);
\t\t\t\t\treturn;
\t\t\t\t}
`,
  },
];

// ---------------------------------------------------------------- message-handler chunk

const HANDLER_HELPERS = `// ${MARKER}
import { a as vInterWebhookSendTextMessage, r as vInterWebhookSendMessage, t as vInterWebhookSendMarkdownMessage } from "./${MESSAGING_CHUNK}";
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
	if (!result?.ok) throw new Error(\`DingTalk proactive send failed: \${result?.error || "unknown error"}\`);
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
const vInterDmChatKey = (accountId, peerId) => \`\${accountId ?? "default"}:dm:\${peerId}\`;
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
`;

const handlerEdits = [
  {
    name: "helpers",
    anchor: 'import { formatChannelProgressDraftLineForEntry as vFormatProgressLine } from "openclaw/plugin-sdk/channel-outbound";\n//#region src/services/media/image.ts\n',
    replace: `import { formatChannelProgressDraftLineForEntry as vFormatProgressLine } from "openclaw/plugin-sdk/channel-outbound";\n${HANDLER_HELPERS}//#region src/services/media/image.ts\n`,
  },
  {
    // Every sessionWebhook send of the dispatcher (error fallback, card-close fallback, idle
    // nudge, questions, late blocks, non-streaming finals) resolves to these names.
    name: "dispatcher-senders",
    anchor: "function createDingtalkReplyDispatcher(params) {\n\tconst core = getDingtalkRuntime();\n",
    replace: `function createDingtalkReplyDispatcher(params) {
\t// inter-session bridge: a sessions_send turn sends proactively, never through a sessionWebhook.
\tconst vInter = params.vInterSession;
\tconst { sendMessage, sendMarkdownMessage, sendTextMessage } = vInterReplySenders(vInter);
\tlet vInterCleaned = false;
\tconst core = getDingtalkRuntime();
`,
  },
  {
    name: "visible-flag",
    anchor: "\tlet outboundUserVisibleThisTurn = false;\n",
    after: "\tif (vInter) vInter.readVisible = () => outboundUserVisibleThisTurn;\n",
  },
  {
    // No AI card before the run started: a BUSY attempt leaves nothing in the chat.
    name: "card-after-run-start",
    anchor: "\t\tif (!currentCardTarget && !cardCreationPromise && vWork.waitingForAnswer()) return Promise.resolve();\n",
    after: "\t\tif (vInter && !vInter.runStarted) return Promise.resolve();\n",
  },
  {
    name: "idle-nudge",
    anchor: "\t\tif (!groupChatLacksVisibleRepliesAutomatic(cfg)) return;\n",
    after: "\t\tif (vInter && !vInter.runStarted) return;\n",
  },
  {
    name: "action-card",
    anchor: "\tconst vSendCard = async (card) => {\n",
    after: "\t\tif (vInter) {\n\t\t\tawait vInterProactive(vInter, account.config, JSON.stringify(vExperience.dingtalkActionCard(card)), \"actionCard\");\n\t\t\toutboundUserVisibleThisTurn = true;\n\t\t\treturn;\n\t\t}\n",
  },
  {
    // The session's questions are taken only once this turn's run started: a BUSY attempt must
    // not take over the running turn's questions (newest route wins in v-experience).
    name: "question-route",
    anchor: "\tconst vUnrouteQuestions = vExperience.onQuestionRequested(params.vSessionKey, (record) => vDeliverQuestionRecord(record));\n",
    replace: `\tlet vUnrouteQuestions = vInter ? () => {} : vExperience.onQuestionRequested(params.vSessionKey, (record) => vDeliverQuestionRecord(record));
\t// inter-session bridge: the run started; the AI card is created now (moved from onReplyStart).
\tconst vInterOnAgentRunStart = (...args) => {
\t\tconst first = !vInter.runStarted;
\t\tvInter.onRunStart(args[0]);
\t\tif (!first) return;
\t\tif (!vInterCleaned) vUnrouteQuestions = vExperience.onQuestionRequested(params.vSessionKey, (record) => vDeliverQuestionRecord(record));
\t\tif (streamingEnabled) startStreaming().catch((err) => log.error(\`[DingTalk][inter-session] startStreaming error: \${err?.message || err}\`));
\t};
`,
  },
  {
    name: "finals",
    anchor: "\t\t\tdeliver: async (payload, info) => {\n\t\t\t\tif (info?.kind === \"tool\" || payload?.channelData?.askUser) {\n",
    replace: "\t\t\tdeliver: async (payload, info) => {\n\t\t\t\tif (vInter && info?.kind === \"final\" && !payload?.channelData?.askUser) vInterCaptureFinal(vInter, payload);\n\t\t\t\tif (info?.kind === \"tool\" || payload?.channelData?.askUser) {\n",
  },
  {
    name: "cleanup",
    anchor: "\t\t\t\tvWork.dispose();\n\t\t\t\tvUnrouteQuestions();\n",
    replace: "\t\t\t\tvInterCleaned = true;\n\t\t\t\tvWork.dispose();\n\t\t\t\tvUnrouteQuestions();\n",
  },
  {
    // Design §2.a core seam: preset runId, the exclusive admission object, run start and outcome.
    name: "reply-options",
    anchor: "\t\treplyOptions: {\n\t\t\tonModelSelected,\n",
    after: `\t\t\t...vInter && {
\t\t\t\trunId: vInter.req.runId,
\t\t\t\tvInterSession: vInter.seam,
\t\t\t\tonAgentRunStart: vInterOnAgentRunStart,
\t\t\t\tonAgentRunTerminalOutcome: (outcome) => {
\t\t\t\t\tif (outcome === "failed" || !vInter.terminal) vInter.terminal = outcome;
\t\t\t\t}
\t\t\t},
`,
  },
  {
    // The request text is the model's input, never a slash command (CommandInterpretationSuppressed).
    name: "no-slash-normalize",
    anchor: "\tlet userContent = normalizeSlashCommand(rawText) || (content.imageUrls.length > 0 ? \"请描述这张图片\" : \"\");\n",
    replace: "\tlet userContent = (params.vInterSession ? rawText : normalizeSlashCommand(rawText)) || (content.imageUrls.length > 0 ? \"请描述这张图片\" : \"\");\n",
  },
  {
    name: "no-gamification-command",
    anchor: "\t\tif (isGamificationCommand(rawText)) {\n",
    replace: "\t\tif (!params.vInterSession && isGamificationCommand(rawText)) {\n",
  },
  {
    // No emotion on a synthetic msgId (design §3.8 :1932).
    name: "no-emotion",
    anchor: "\taddEmotionReply(config, data, log).catch((err) => {\n",
    replace: "\tif (!params.vInterSession) addEmotionReply(config, data, log).catch((err) => {\n",
  },
  {
    // asyncMode sends an acknowledgement before dispatch and a fallback text after it; neither may
    // appear for a BUSY attempt. A sessions_send turn always streams into its AI card.
    name: "no-async-mode",
    anchor: "\tconst asyncMode = config.asyncMode === true;\n",
    replace: "\tconst asyncMode = config.asyncMode === true && !params.vInterSession;\n",
  },
  {
    name: "ctx",
    anchor: "\t\t\tBotChatbotUserId: data.chatbotUserId,\n\t\t\tBotChatbotCorpId: data.chatbotCorpId\n\t\t};\n",
    after: `\t\t// inter-session bridge (design §2.a): provenance and channel prompt context of the request; its
\t\t// permission identity (chain-root rule, also as From, which the core takes as a direct chat's
\t\t// sender when no SenderId matches); never a command.
\t\tif (params.vInterSession) {
\t\t\tconst vReq = params.vInterSession.req;
\t\t\tObject.assign(ctxPayload, {
\t\t\t\tInputProvenance: vReq.provenance,
\t\t\t\tChannelPromptContext: vReq.channelPromptContext,
\t\t\t\tCommandInterpretationSuppressed: true,
\t\t\t\tCommandAuthorized: false,
\t\t\t\tSenderId: vReq.sender.id,
\t\t\t\tSenderName: vReq.sender.name,
\t\t\t\tFrom: vReq.sender.id,
\t\t\t\tMessageSid: vReq.messageSid,
\t\t\t\tVInterSession: params.vInterSession.seam
\t\t\t});
\t\t}
`,
  },
  {
    // In a group the dispatcher's sender is who may answer ask_user (askUserAnswererId, a real
    // person or nobody in particular); in a direct chat it is the chat's person, the card target.
    name: "dispatcher-sender",
    anchor: "\t\t\tconversationId: data.conversationId,\n\t\t\tsenderId,\n\t\t\tisDirect,\n",
    replace: "\t\t\tconversationId: data.conversationId,\n\t\t\tsenderId: params.vInterSession && !isDirect ? params.vInterSession.req.askUserAnswererId : senderId,\n\t\t\tisDirect,\n",
  },
  {
    name: "dispatcher-inter-session",
    anchor: "\t\t\tasyncMode,\n\t\t\tvSessionKey: sessionKey\n\t\t});\n",
    replace: "\t\t\tasyncMode,\n\t\t\tvSessionKey: sessionKey,\n\t\t\tvInterSession: params.vInterSession\n\t\t});\n",
  },
  {
    name: "dispatched",
    anchor: "\t\tlog.info?.(`[DingTalk][dispatch] dispatchReplyFromConfig 完成: queuedFinal=${queuedFinal}, counts=${JSON.stringify(counts)}`);\n",
    after: "\t\tparams.vInterSession?.dispatched({\n\t\t\tqueuedFinal,\n\t\t\tcounts\n\t\t});\n",
  },
  {
    // The bridge classifies the error (RESTART_WEDGE, CHANNEL_DOWN, a failed run); the sessionWebhook error reply is not sent.
    name: "dispatch-error",
    anchor: "\t} catch (err) {\n\t\tlog?.error?.(`SDK dispatch 失败: ${err.message}`);\n",
    after: "\t\tif (params.vInterSession) throw err;\n",
  },
  {
    name: "no-emotion-recall",
    anchor: "\ttry {\n\t\tawait recallEmotionReply(config, data, log);\n\t} catch (err) {\n",
    replace: "\tif (!params.vInterSession) try {\n\t\tawait recallEmotionReply(config, data, log);\n\t} catch (err) {\n",
  },
  {
    // Design §3.8 :2100: no prepare (allowlists, routing) and no question interception.
    name: "entry",
    anchor: "async function handleDingTalkMessage(params) {\n\tconst prepared = await prepareDingTalkMessage(params);\n",
    replace: "async function handleDingTalkMessage(params) {\n\tif (params.vInterSession) return handleDingTalkMessageInternal(params, vInterPrepared(params));\n\tconst prepared = await prepareDingTalkMessage(params);\n",
  },
  {
    // A person's answer, in a direct chat, to a question a sessions_send turn asked there.
    name: "dm-question-answer",
    anchor: "\tconst vChatKey = `${params.accountId ?? \"default\"}:${vData.conversationId}`;\n\tconst vSender = vData.senderStaffId || vData.senderId;\n",
    replace: "\tlet vChatKey = `${params.accountId ?? \"default\"}:${vData.conversationId}`;\n\tconst vSender = vData.senderStaffId || vData.senderId;\n\tif (vData.conversationType === \"1\" && vSender && !vExperience.hasTrackedQuestion({ channel: \"dingtalk\", chatKey: vChatKey, senderId: vSender }) && vExperience.hasTrackedQuestion({ channel: \"dingtalk\", chatKey: vInterDmChatKey(params.accountId, vSender), senderId: vSender })) vChatKey = vInterDmChatKey(params.accountId, vSender);\n",
  },
];

// ---------------------------------------------------------------- engine

const count = (haystack, needle) => haystack.split(needle).length - 1;

function apply(source, edits, label) {
  if (typeof source !== "string") throw new TypeError(`${label}: source must be a string`);
  if (source.includes(MARKER)) throw new Error(`${label}: already patched`);
  if (!source.includes(EXPERIENCE_MARKER)) throw new Error(`${label}: not V's bytes (no ${EXPERIENCE_MARKER})`);
  let out = source;
  for (const edit of edits) {
    const n = count(out, edit.anchor);
    if (n !== 1) throw new Error(`${label}: anchor "${edit.name}" expected exactly once, found ${n}`);
    const next = edit.replace ?? (edit.after !== undefined ? edit.anchor + edit.after : edit.before + edit.anchor);
    out = out.replace(edit.anchor, () => next);
  }
  if (count(out, MARKER) !== 1) throw new Error(`${label}: marker must appear exactly once`);
  return out;
}

/** connection-*.mjs patched. */
export const patchConnectionChunk = (source) => apply(source, connectionEdits, "dingtalk connection");
/** message-handler-*.mjs patched. */
export const patchMessageHandlerChunk = (source) => apply(source, handlerEdits, "dingtalk message-handler");

/** Anchors per chunk, for tests (each must occur exactly once in V's bytes). */
export const ANCHORS = Object.freeze({
  connection: connectionEdits.map((e) => ({ name: e.name, anchor: e.anchor })),
  messageHandler: handlerEdits.map((e) => ({ name: e.name, anchor: e.anchor })),
});

/** The files this release replaces, relative to the connector package root (`dist/...`). */
export const FILES = Object.freeze([
  Object.freeze({ path: CONNECTION_FILE, patch: patchConnectionChunk }),
  Object.freeze({ path: MESSAGE_HANDLER_FILE, patch: patchMessageHandlerChunk }),
]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/** Generated bytes and the manifest, from the capture of V's live connector. */
export function buildRelease({ repo = REPO } = {}) {
  // Where each file lives on V (tests/fixtures/inter-session-v-bytes.json, verified on V 2026-10-20).
  const vBytes = JSON.parse(fs.readFileSync(path.join(repo, "tests/fixtures/inter-session-v-bytes.json"), "utf8"));
  const entries = FILES.map(({ path: rel, patch }) => {
    const captured = path.join(repo, CAPTURE_DIR, rel);
    const before = fs.readFileSync(captured, "utf8");
    const after = patch(before);
    const onV = vBytes.files.find((f) => f.component === "dingtalk" && f.captured === path.relative(repo, captured));
    if (!onV) throw new Error(`${rel}: not in tests/fixtures/inter-session-v-bytes.json`);
    if (sha256(before) !== onV.sha256) throw new Error(`${rel}: the capture is not the bytes recorded on V`);
    return { path: rel, captured: path.relative(repo, captured), hostPath: onV.hostPath, source: before, generated: after };
  });
  const manifest = {
    schemaVersion: 1,
    marker: MARKER,
    component: "dingtalk",
    package: "@dingtalk-real-ai/dingtalk-connector@0.8.26",
    stacksOn: [EXPERIENCE_MARKER],
    capture: CAPTURE,
    generator: "apps/v-experience/dingtalk/patch-inter-session.mjs",
    files: entries.map((e) => ({
      component: "dingtalk",
      path: e.path,
      captured: e.captured,
      generated: `${RELEASE_DIR}/${e.path}`,
      hostPath: e.hostPath,
      before: sha256(e.source),
      after: sha256(e.generated),
    })),
  };
  return { entries, manifest };
}

/** Writes (or with `check`, only compares) the generated files and manifest; returns the stale paths. */
export function writeRelease({ repo = REPO, check = false } = {}) {
  const { entries, manifest } = buildRelease({ repo });
  const outputs = [
    ...entries.map((e) => [path.join(repo, RELEASE_DIR, e.path), e.generated]),
    [path.join(repo, RELEASE_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`],
  ];
  const stale = [];
  for (const [file, content] of outputs) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    if (current === content) continue;
    stale.push(path.relative(repo, file));
    if (!check) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
  }
  return { manifest, stale };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const { manifest, stale } = writeRelease({ check });
  console.log(JSON.stringify({ check, stale, files: manifest.files }, null, 2));
  if (check && stale.length) process.exit(1);
}
