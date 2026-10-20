// Feishu inbound bridge for V's cross-session collaboration (docs/inter-session/design.md §2.a, §3.6).
//
// The v-session-relay plugin (Gateway process) finds this bridge in
// globalThis[Symbol.for("openclaw.v.interSessionInboundBridges")].bridges under
// "feishu:<accountId>". post() shows a request / hand-back line in a chat;
// start() feeds a synthetic inbound message for the target session through this
// account's per-chat queue into handleFeishuMessage, so the target answers
// exactly as if a person had written there: streaming card, progress stream,
// checklist, background line, footer, ask_user, images, files.
//
// Inlined into the Feishu monitor bundle by patch.mjs: no imports or exports.
// It uses the bundle's own createFeishuClient, getChatInfo, normalizeAccountId,
// createHash and botOpenIds. Literals mirror apps/v-session-relay/plugin/core/contracts.js;
// tests/patch-feishu-inter-session-bridge.test.mjs asserts they agree.
const V_INTER_SESSION_BRIDGES = Symbol.for("openclaw.v.interSessionInboundBridges");
const V_INTER_SESSION_CAPS = Object.freeze({ streaming: true, replyAnchor: true, idempotentPost: true, editPost: true, maxVisibleChars: 1500, askUser: true, media: true });
const V_INTER_SESSION_KINDS = ["request", "ask", "wake", "collect"];
const V_INTER_SESSION_BUSY_REASONS = ["active_run", "pending_queue", "recovery_owner"];
const V_INTER_SESSION_RESTART_WEDGE_RE = /restart recovery claim changed/u;
const V_INTER_SESSION_ID_PREFIX = "v-a2a-";
const V_INTER_SESSION_SID_PREFIX = "v-a2a:";
const V_INTER_SESSION_CHAT_INFO_TTL_MS = 6e5;
// Feishu API codes (not yet seen live; the message text is checked too):
// bot not in the chat (send 230002, chat.get 232011), chat dissolved (232009),
// rate limited (as send-rate-limit.ts / typing-backoff.ts), reply target withdrawn (as send.ts).
const V_INTER_SESSION_NOT_MEMBER_CODES = new Set([230002, 232011]);
const V_INTER_SESSION_CHAT_GONE_CODES = new Set([232009]);
const V_INTER_SESSION_RATE_LIMIT_CODES = new Set([230020, 11232, 99991400, 99991403]);
const V_INTER_SESSION_WITHDRAWN_CODES = new Set([230011, 231003]);
const V_INTER_SESSION_OPEN_ID_RE = /^ou_[0-9a-f]+$/u;
const V_INTER_SESSION_CHAT_ID_RE = /^oc_[0-9a-f]+$/u;
// agent:<agentId>:feishu[:<accountId>]:<group|direct>:<oc_…|ou_…> (per-channel-peer / per-account-channel-peer keys)
const V_INTER_SESSION_KEY_RE = /^agent:[^:]+:feishu:(?:([a-z0-9][a-z0-9_-]*):)?(group|direct):((?:oc|ou)_[0-9a-f]+)$/u;
/** accountId (as the monitor names it) -> (event, attempt) => enqueue on that account's per-chat queue. */
const vFeishuInterSessionDispatch = /* @__PURE__ */ new Map();
/** `${accountId}:${chatId}` -> { at, info }: getChatInfo answers, kept 10 min. */
const vFeishuInterSessionChatInfo = /* @__PURE__ */ new Map();
/** `${accountId}:${ou_…}` -> oc_… of that person's direct chat, learned from post() results. */
const vFeishuInterSessionDirectChats = /* @__PURE__ */ new Map();
function vFeishuInterSessionRegistry() {
	globalThis[V_INTER_SESSION_BRIDGES] ??= {
		v: 1,
		bridges: /* @__PURE__ */ new Map(),
		listeners: /* @__PURE__ */ new Set()
	};
	return globalThis[V_INTER_SESSION_BRIDGES];
}
function vFeishuInterSessionNotify(reg, key, bridge) {
	for (const listener of [...reg.listeners]) try {
		listener(key, bridge);
	} catch {}
}
function vFeishuInterSessionErrorText(err) {
	return typeof err?.message === "string" && err.message ? err.message : String(err);
}
/** Same shape as contracts.BridgeError (name, code, transient), which isBridgeError() recognises. */
function vFeishuInterSessionBridgeError(code, message, transient, cause) {
	const err = new Error(message, cause === void 0 ? void 0 : { cause });
	err.name = "BridgeError";
	err.code = code;
	err.transient = transient === true;
	return err;
}
/** A Feishu API failure (thrown SDK error, or a response with code != 0) → bridge error class. */
function vFeishuInterSessionApiFailure(err) {
	const data = err?.response?.data;
	const rawCode = data?.code ?? err?.feishuCode;
	const code = typeof rawCode === "number" ? rawCode : void 0;
	const status = typeof err?.response?.status === "number" ? err.response.status : void 0;
	const msg = String(data?.msg ?? err?.message ?? err ?? "");
	if (code !== void 0 && V_INTER_SESSION_NOT_MEMBER_CODES.has(code) || /\bnot in (?:the )?(?:chat|group)\b|\bout(?:side)? (?:of )?the (?:chat|group)\b/iu.test(msg)) return {
		code: "NOT_MEMBER",
		transient: false,
		feishuCode: code,
		msg
	};
	if (code !== void 0 && V_INTER_SESSION_CHAT_GONE_CODES.has(code) || /\b(?:dissolved|disbanded)\b|\bchat (?:does not exist|not found)\b/iu.test(msg)) return {
		code: "CHAT_GONE",
		transient: false,
		feishuCode: code,
		msg
	};
	if (status === 429 || status !== void 0 && status >= 500 || code !== void 0 && V_INTER_SESSION_RATE_LIMIT_CODES.has(code) || typeof err?.code === "string" && /^(?:ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|UND_ERR)/u.test(err.code) || /\b(?:timeout|timed out|socket hang up|network|fetch failed)\b/iu.test(msg)) return {
		code: "CHANNEL_DOWN",
		transient: true,
		feishuCode: code,
		msg
	};
	return {
		code: "POST_FAILED",
		transient: false,
		feishuCode: code,
		msg
	};
}
function vFeishuInterSessionCheckResponse(res, what) {
	if (res && typeof res.code === "number" && res.code !== 0) {
		const err = new Error(`${what} failed: ${res.msg ?? res.code}`);
		err.feishuCode = res.code;
		throw err;
	}
	return res;
}
/** "chat:oc_…" / "user:ou_…" (optionally "feishu:"-prefixed) → { chatType, id }, else undefined. */
function vFeishuInterSessionParseTo(to) {
	const raw = typeof to === "string" ? to.trim().replace(/^(?:feishu|lark):/iu, "") : "";
	const m = /^(?:(chat|group|channel|user|dm|open_id):)?(.+)$/iu.exec(raw);
	if (!m) return;
	const id = m[2].trim();
	const prefix = m[1]?.toLowerCase();
	if (V_INTER_SESSION_CHAT_ID_RE.test(id) && (!prefix || prefix === "chat" || prefix === "group" || prefix === "channel")) return {
		chatType: "group",
		id
	};
	if (V_INTER_SESSION_OPEN_ID_RE.test(id) && (!prefix || prefix === "user" || prefix === "dm" || prefix === "open_id")) return {
		chatType: "direct",
		id
	};
}
/** The chat a Feishu session key names (§2.a): oc_/ou_ ids are lowercase hex, so the key gives them back exactly. */
function vFeishuInterSessionKeyTarget(sessionKey, accountId) {
	const m = V_INTER_SESSION_KEY_RE.exec(typeof sessionKey === "string" ? sessionKey.trim() : "");
	if (!m) return;
	if (m[1] !== void 0 && normalizeAccountId(m[1]) !== accountId) return;
	const chatType = m[2];
	const id = m[3];
	if (chatType === "group" ? !V_INTER_SESSION_CHAT_ID_RE.test(id) : !V_INTER_SESSION_OPEN_ID_RE.test(id)) return;
	return {
		chatType,
		id
	};
}
/** im.message.create/reply uuid (≤ 50 chars, deduped by Feishu for 1 h): contracts.feishuPostUuid output is used as is. */
function vFeishuInterSessionUuid(idempotencyKey) {
	if (typeof idempotencyKey !== "string" || !idempotencyKey) return;
	return /^[A-Za-z0-9_-]{1,50}$/u.test(idempotencyKey) ? idempotencyKey : `vax${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 40)}`;
}
/** Why the bridge cannot run this StartRequest (contracts.validateStartRequest is the full check, in the plugin). */
function vFeishuInterSessionStartProblem(req, accountId) {
	if (!req || typeof req !== "object") return "start request is not an object";
	const route = req.route;
	if (!route || route.channel !== "feishu") return "route.channel must be feishu";
	if (normalizeAccountId(route.accountId) !== accountId) return `route.accountId ${route.accountId} is not this bridge's account ${accountId}`;
	if (typeof req.sessionKey !== "string" || !req.sessionKey) return "sessionKey must be a non-empty string";
	if (!V_INTER_SESSION_KINDS.includes(req.kind)) return `kind must be one of ${V_INTER_SESSION_KINDS.join("|")}`;
	if (typeof req.id !== "string" || !req.id) return "id must be a non-empty string";
	if (!Number.isSafeInteger(req.attempt) || req.attempt < 0) return "attempt must be a non-negative integer";
	if (typeof req.runId !== "string" || !req.runId.startsWith(V_INTER_SESSION_ID_PREFIX)) return "runId must be a preset v-a2a- id";
	if (typeof req.syntheticMessageId !== "string" || !req.syntheticMessageId.startsWith(V_INTER_SESSION_ID_PREFIX)) return "syntheticMessageId must be a v-a2a- id";
	if (typeof req.messageSid !== "string" || !req.messageSid.startsWith(V_INTER_SESSION_SID_PREFIX)) return "messageSid must be a v-a2a: id";
	if (typeof req.promptText !== "string" || !req.promptText.trim()) return "promptText must be a non-empty string";
	if (!req.sender || typeof req.sender.id !== "string" || !req.sender.id || typeof req.sender.name !== "string") return "sender must carry an id and a name";
	if (route.chatType === "direct") {
		if (!V_INTER_SESSION_OPEN_ID_RE.test(route.peerId ?? "")) return "a direct route needs the peer's open_id (route.peerId)";
		if (req.routePeerId !== void 0 && req.routePeerId !== route.peerId) return "routePeerId of a direct chat must be its peer";
	} else if (route.chatType === "group") {
		if (!V_INTER_SESSION_CHAT_ID_RE.test(route.chatId ?? "")) return "a group route needs its oc_ chat id (route.chatId)";
	} else return "route.chatType must be direct|group";
}
/**
* The synthetic inbound event (as buildSyntheticMessageEvent$1 for card actions): no sender_type,
* because a bot sender turns the streaming card off (requiredMentionTargets) and arms the bot-loop guard.
*/
function vFeishuInterSessionEvent(req, params) {
	const route = req.route;
	const group = route.chatType === "group";
	const anchor = typeof req.anchorMessageId === "string" && req.anchorMessageId.trim() ? req.anchorMessageId.trim() : void 0;
	const botOpenId = group && typeof params.botOpenId === "string" ? params.botOpenId.trim() : "";
	return {
		sender: { sender_id: { open_id: group ? req.routePeerId ?? req.sender.id : route.peerId } },
		message: {
			message_id: req.syntheticMessageId,
			...anchor ? { reply_target_message_id: anchor } : { suppress_reply_target: true },
			chat_id: group ? route.chatId : params.directChatId ?? route.peerId,
			chat_type: group ? "group" : "p2p",
			message_type: "text",
			create_time: String(params.createTimeMs),
			content: JSON.stringify({ text: req.promptText }),
			...botOpenId ? { mentions: [{
				key: "mention_bot",
				id: { open_id: botOpenId },
				name: "bot"
			}] } : {}
		}
	};
}
/**
* One start() attempt, handed to handleFeishuMessage as `interSession`. It settles the StartOutcome
* at onAgentRunStart (started), at the core admission guard's onBusy (busy), or when the handler
* returns or throws without either (rejected), and resolves `done` when a started run's handler returns.
*/
function vFeishuInterSessionAttempt(req, attemptStartedAtMs, log) {
	let settleOutcome;
	const outcome = new Promise((resolve) => {
		settleOutcome = resolve;
	});
	let resolveDone;
	const done = new Promise((resolve) => {
		resolveDone = resolve;
	});
	let decided = false;
	const decide = (value) => {
		if (decided) return false;
		decided = true;
		settleOutcome(value);
		return true;
	};
	const attempt = {
		id: req.id,
		kind: req.kind,
		attempt: req.attempt,
		sessionKey: req.sessionKey,
		runId: req.runId,
		sender: req.sender,
		askUserAnswererId: typeof req.askUserAnswererId === "string" && req.askUserAnswererId ? req.askUserAnswererId : void 0,
		attemptStartedAtMs,
		startedRunId: void 0,
		busy: void 0,
		rejected: void 0,
		finished: false,
		visible: false,
		terminalOutcome: void 0,
		finals: [],
		errors: [],
		outcome,
		done,
		vInterSession: void 0,
		ctxExtra() {
			return {
				InputProvenance: req.provenance,
				ChannelPromptContext: req.channelPromptContext || void 0,
				CommandInterpretationSuppressed: true,
				SenderId: req.sender.id,
				SenderName: req.sender.name,
				MessageSid: req.messageSid,
				VInterSession: attempt.vInterSession
			};
		},
		replyOptions(base) {
			return {
				runId: req.runId,
				vInterSession: attempt.vInterSession,
				onAgentRunStart: (...args) => {
					const result = base?.onAgentRunStart?.(...args);
					attempt.markStarted(args[0]);
					return result;
				},
				onAgentRunTerminalOutcome: (value) => {
					if (value === "failed" || attempt.terminalOutcome === void 0) attempt.terminalOutcome = value;
					return base?.onAgentRunTerminalOutcome?.(value);
				}
			};
		},
		markStarted(runId) {
			if (attempt.startedRunId !== void 0 || attempt.busy || attempt.rejected) return;
			attempt.startedRunId = typeof runId === "string" && runId ? runId : req.runId;
			decide({
				status: "started",
				runId: attempt.startedRunId,
				done
			});
		},
		markBusy(info) {
			if (attempt.startedRunId !== void 0 || attempt.busy || attempt.rejected) return;
			const reason = V_INTER_SESSION_BUSY_REASONS.includes(info?.reason) ? info.reason : "active_run";
			attempt.busy = { reason };
			log(`feishu: inter-session ${req.kind} ${req.id} attempt ${req.attempt}: ${req.sessionKey} is busy (${reason}); nothing was posted`);
			decide({
				status: "busy",
				reason
			});
		},
		reject(code, message) {
			if (attempt.startedRunId !== void 0 || attempt.busy || attempt.rejected) return;
			attempt.rejected = { code };
			decide({
				status: "rejected",
				code,
				message,
				started: false
			});
		},
		noteVisible() {
			attempt.visible = true;
		},
		captureFinal(payload, reply) {
			if (!payload || payload.isReasoning === true) return;
			const text = reply?.hasText ? reply.text : void 0;
			const mediaUrls = reply?.hasMedia ? [...reply.mediaUrls] : void 0;
			if (payload.isError === true) {
				if (text !== void 0) attempt.errors.push(text);
				return;
			}
			if (text === void 0 && mediaUrls === void 0) return;
			attempt.finals.push({
				...text !== void 0 ? { text } : {},
				...mediaUrls ? { mediaUrls } : {}
			});
		},
		complete({ dispatchResult, visibleReplySent }) {
			if (visibleReplySent === true) attempt.visible = true;
			return {
				runId: attempt.startedRunId ?? null,
				dispatchResult,
				finals: attempt.finals.map((final) => ({ ...final })),
				visibleReplySent: attempt.visible
			};
		},
		runOutcome() {
			const error = attempt.errors.length > 0 ? attempt.errors.join("\n") : void 0;
			const status = attempt.terminalOutcome === "failed" ? "error" : attempt.terminalOutcome === "completed" || attempt.finals.length > 0 || attempt.visible ? "ok" : "aborted";
			return {
				status,
				finals: attempt.finals.map((final) => ({ ...final })),
				visibleReplySent: attempt.visible,
				finalCount: attempt.finals.length,
				...error !== void 0 ? { error } : {}
			};
		},
		/** A run that reported a terminal outcome or showed output without onAgentRunStart still ran: report it as started. */
		lateStart() {
			if (attempt.startedRunId !== void 0 || attempt.busy || attempt.rejected) return;
			if (attempt.terminalOutcome === void 0 && !attempt.visible && attempt.finals.length === 0 && attempt.errors.length === 0) return;
			attempt.markStarted(req.runId);
		},
		finish(result) {
			if (attempt.finished) return;
			attempt.finished = true;
			if (result?.visibleReplySent === true) attempt.visible = true;
			attempt.lateStart();
			if (attempt.startedRunId !== void 0) {
				resolveDone(attempt.runOutcome());
				return;
			}
			const deferred = result?.dispatchResult?.deferredToActiveRun;
			if (deferred) decide({
				status: "rejected",
				code: "INTERNAL",
				message: `the request was merged into the session's active run (${deferred}) instead of starting its own`,
				started: false
			});
			else decide({
				status: "rejected",
				code: "GATED",
				message: "the Feishu handler returned without starting a run (gated, deduplicated or not dispatched)",
				started: false
			});
		},
		fail(err) {
			if (attempt.finished) return;
			attempt.finished = true;
			const message = vFeishuInterSessionErrorText(err);
			const wedged = V_INTER_SESSION_RESTART_WEDGE_RE.test(message);
			if (!wedged) attempt.lateStart();
			if (attempt.startedRunId !== void 0) {
				resolveDone({
					...attempt.runOutcome(),
					status: "error",
					error: message
				});
				return;
			}
			if (attempt.busy) {
				log(`feishu: inter-session ${req.kind} ${req.id} attempt ${req.attempt} failed after BUSY: ${message}`);
				return;
			}
			decide({
				status: "rejected",
				code: wedged ? "RESTART_WEDGE" : "INTERNAL",
				message,
				started: false
			});
		},
		/** Runs the handler as the queue task; `done` follows the handler itself, never the queue's 10-minute cap. */
		runHandler(handler) {
			let task;
			try {
				task = Promise.resolve(handler());
			} catch (err) {
				task = Promise.reject(err);
			}
			task.then((result) => attempt.finish(result), (err) => attempt.fail(err));
			return task;
		}
	};
	attempt.vInterSession = {
		exclusive: true,
		id: req.id,
		kind: req.kind,
		onBusy: (info) => attempt.markBusy(info)
	};
	return attempt;
}
function vFeishuInterSessionCreateBridge({ account, accountId, runtime, dispatch }) {
	const log = runtime?.log ?? console.log;
	const bridgeAccountId = normalizeAccountId(accountId);
	let stopped = false;
	const client = () => createFeishuClient(account);
	const chatInfo = async (chatId) => {
		const key = `${bridgeAccountId}:${chatId}`;
		const cached = vFeishuInterSessionChatInfo.get(key);
		if (cached && Date.now() - cached.at < V_INTER_SESSION_CHAT_INFO_TTL_MS) return cached.info;
		const info = await getChatInfo(client(), chatId);
		vFeishuInterSessionChatInfo.set(key, {
			at: Date.now(),
			info
		});
		return info;
	};
	const bridge = {
		v: 1,
		channel: "feishu",
		accountId: bridgeAccountId,
		caps: V_INTER_SESSION_CAPS,
		async resolveRoute(q) {
			const ownerIds = Array.isArray(q?.ownerIds) ? q.ownerIds.map((id) => String(id).trim()).filter(Boolean) : [];
			const delivery = q?.delivery;
			let target;
			if (typeof delivery?.to === "string" && delivery.to.trim() && (!delivery.channel || delivery.channel === "feishu")) {
				if (delivery.accountId && normalizeAccountId(delivery.accountId) !== bridgeAccountId) return {
					ok: false,
					code: "NO_ROUTE",
					reason: `the chat belongs to Feishu account ${delivery.accountId}`
				};
				target = vFeishuInterSessionParseTo(delivery.to);
				if (!target) return {
					ok: false,
					code: "NO_ROUTE",
					reason: `unrecognised Feishu delivery address ${delivery.to}`
				};
			} else {
				target = vFeishuInterSessionKeyTarget(q?.sessionKey, bridgeAccountId);
				if (!target) return {
					ok: false,
					code: "NO_ROUTE",
					reason: "the session has no Feishu delivery address and its key names no Feishu chat"
				};
			}
			if (target.chatType === "direct") return {
				ok: true,
				route: {
					channel: "feishu",
					accountId: bridgeAccountId,
					to: `user:${target.id}`,
					chatId: target.id,
					chatType: "direct",
					peerId: target.id,
					humans: ownerIds.includes(target.id) ? "owner_only" : "single_peer"
				}
			};
			let info;
			try {
				info = await chatInfo(target.id);
			} catch (err) {
				const failure = vFeishuInterSessionApiFailure(err);
				if (failure.code === "NOT_MEMBER" || failure.code === "CHAT_GONE") return {
					ok: false,
					code: failure.code,
					reason: failure.msg
				};
				log(`feishu[${bridgeAccountId}]: inter-session chat info for ${target.id} unavailable: ${failure.msg}`);
			}
			const userCount = Number(info?.user_count);
			const ownerId = typeof info?.owner_id === "string" ? info.owner_id : "";
			const humans = !info || !Number.isFinite(userCount) || userCount < 1 ? "unknown" : userCount === 1 ? ownerId && ownerIds.includes(ownerId) ? "owner_only" : "single_peer" : "shared";
			return {
				ok: true,
				route: {
					channel: "feishu",
					accountId: bridgeAccountId,
					to: `chat:${target.id}`,
					chatId: target.id,
					chatType: "group",
					humans,
					...typeof info?.name === "string" && info.name ? { label: info.name } : {}
				}
			};
		},
		async post(p) {
			const target = vFeishuInterSessionParseTo(p?.route?.to);
			const text = typeof p?.text === "string" ? p.text : "";
			if (!target || !text.trim()) throw vFeishuInterSessionBridgeError("POST_FAILED", "post needs a Feishu route and a text", false);
			const uuid = vFeishuInterSessionUuid(p.idempotencyKey);
			const content = JSON.stringify({ text });
			let res;
			try {
				const api = client();
				const replyTo = typeof p.replyToMessageId === "string" && p.replyToMessageId.trim() ? p.replyToMessageId.trim() : void 0;
				if (replyTo) try {
					res = vFeishuInterSessionCheckResponse(await api.im.message.reply({
						path: { message_id: replyTo },
						data: {
							msg_type: "text",
							content,
							...uuid ? { uuid } : {}
						}
					}), "reply");
				} catch (err) {
					const code = err?.response?.data?.code ?? err?.feishuCode;
					if (!V_INTER_SESSION_WITHDRAWN_CODES.has(code)) throw err;
					log(`feishu[${bridgeAccountId}]: inter-session reply target ${replyTo} is gone; posting without it`);
					res = void 0;
				}
				res ??= vFeishuInterSessionCheckResponse(await api.im.message.create({
					params: { receive_id_type: target.chatType === "group" ? "chat_id" : "open_id" },
					data: {
						receive_id: target.id,
						msg_type: "text",
						content,
						...uuid ? { uuid } : {}
					}
				}), "send");
			} catch (err) {
				const failure = vFeishuInterSessionApiFailure(err);
				throw vFeishuInterSessionBridgeError(failure.code, `Feishu ${failure.code === "POST_FAILED" ? "rejected the message" : "could not deliver the message"}: ${failure.msg}`, failure.transient, err);
			}
			const messageId = typeof res?.data?.message_id === "string" && res.data.message_id ? res.data.message_id : null;
			const chatId = res?.data?.chat_id;
			if (target.chatType === "direct" && typeof chatId === "string" && V_INTER_SESSION_CHAT_ID_RE.test(chatId)) vFeishuInterSessionDirectChats.set(`${bridgeAccountId}:${target.id}`, chatId);
			return { messageId };
		},
		async edit(p) {
			if (typeof p?.messageId !== "string" || !p.messageId || typeof p.text !== "string" || !p.text.trim()) return;
			try {
				vFeishuInterSessionCheckResponse(await client().im.message.update({
					path: { message_id: p.messageId },
					data: {
						msg_type: "text",
						content: JSON.stringify({ text: p.text })
					}
				}), "edit");
			} catch (err) {
				log(`feishu[${bridgeAccountId}]: inter-session edit of ${p.messageId} failed (ignored): ${vFeishuInterSessionApiFailure(err).msg}`);
			}
		},
		async start(req) {
			const attemptStartedAtMs = Date.now();
			const problem = vFeishuInterSessionStartProblem(req, bridgeAccountId);
			if (problem) return {
				status: "rejected",
				code: "INTERNAL",
				message: problem,
				started: false
			};
			if (stopped || typeof dispatch !== "function") return {
				status: "rejected",
				code: "CHANNEL_DOWN",
				message: `Feishu account ${bridgeAccountId} is not running`,
				started: false
			};
			const attempt = vFeishuInterSessionAttempt(req, attemptStartedAtMs, log);
			const event = vFeishuInterSessionEvent(req, {
				botOpenId: botOpenIds.get(accountId),
				directChatId: req.route.chatType === "direct" ? vFeishuInterSessionDirectChats.get(`${bridgeAccountId}:${req.route.peerId}`) : void 0,
				createTimeMs: attemptStartedAtMs
			});
			try {
				Promise.resolve(dispatch(event, attempt)).catch(() => {});
			} catch (err) {
				attempt.fail(err);
			}
			return await attempt.outcome;
		},
		stop() {
			stopped = true;
		}
	};
	return bridge;
}
function vFeishuInterSessionRegisterBridge(params) {
	const log = params.runtime?.log ?? console.log;
	if (typeof params.dispatch !== "function") {
		log(`feishu[${params.accountId}]: inter-session bridge not registered (no message handler)`);
		return;
	}
	const bridge = vFeishuInterSessionCreateBridge(params);
	const reg = vFeishuInterSessionRegistry();
	const key = `feishu:${bridge.accountId}`;
	reg.bridges.set(key, bridge);
	vFeishuInterSessionNotify(reg, key, bridge);
	log(`feishu[${params.accountId}]: inter-session bridge registered as ${key}`);
	return {
		bridge,
		key,
		accountId: params.accountId,
		dispatch: params.dispatch
	};
}
function vFeishuInterSessionUnregisterBridge(registration) {
	if (!registration) return;
	registration.bridge.stop();
	if (vFeishuInterSessionDispatch.get(registration.accountId) === registration.dispatch) vFeishuInterSessionDispatch.delete(registration.accountId);
	const reg = vFeishuInterSessionRegistry();
	if (reg.bridges.get(registration.key) !== registration.bridge) return;
	reg.bridges.delete(registration.key);
	vFeishuInterSessionNotify(reg, registration.key, null);
}
