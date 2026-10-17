import assert from 'node:assert/strict';

// Feishu ingress catch-up: pull messages Feishu failed to push, instead of waiting for its re-push.
//
// V 2026-10-12, 10-15 and 10-16 (firsttext records): messages that reached V more than a minute
// late came in two shapes. One is a chat held behind its own lane (receivedAtMs is stamped after
// the per-chat queue); this patch does not touch that. The other is a window in which Feishu's
// push did not get through to anyone, and every message from it, in every chat, arrived a FIXED
// time after it was sent rather than all together at a reconnect:
//   10/12 17:22–17:27 sent → +530 s each   (forced restart drain)
//   10/12 17:53:41–17:56 → +710–720 s      (forced restart, 100 s exit)
//   10/15 22:10–22:12   → +300–330 s
//   10/16 16:52–16:56   → +577–596 s       (Gateway GC freeze storm 16:38–16:57, #402)
//   10/16 16:38–16:51   → +4158–4239 s     (second re-push; the first one fell in the storm too)
// A per-message constant lag is Feishu's re-push timer ("长连接模式下 … 需要在 3 秒内处理完成，否则会
// 触发超时重推"), not our reconnect: Feishu does not replay those events when the socket comes
// back, so even a short outage costs 5–12 minutes per message, and 70 minutes when the re-push
// fails too. On 10/16 this window alone produced the day's P99 (4190 s).
//
// After the WebSocket reconnects, or after the event loop was stalled for STALL_MS (the socket can
// stay up while pushes go unacknowledged), list each recently active chat's messages over the gap
// with im/v1/messages and feed the ones V never received through the same durable ingress as a
// pushed event (event_id v-catchup-<message_id>). Feishu's later re-push of such a message is
// acknowledged and dropped: a persistent marker v-catchup:<message_id> sits in the Feishu dedupe
// store (24 h), because the text dedupe key hashes the raw content string and a listed message's
// content need not be byte-identical to the pushed one.
//
// What a message does once inside is unchanged: same handler, same dedupe, same mention gating,
// same agent turn. Only messages from users are pulled; group messages only when they mention the
// bot or the chat is one where Feishu pushes every message. Chats are those seen since this
// process started (p2p chats cannot be listed); topic replies are not pulled.
// OPENCLAW_FEISHU_INGRESS_CATCHUP=0 turns it off.

export const MARKER = 'v-feishu-ingress-catchup-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export const CATCHUP_MODULE = `// ${MARKER}: pull messages Feishu failed to push (see lab/patch-feishu-ingress-catchup.mjs)
const VFEISHU_INGRESS_CATCHUP_ENABLED = process.env.OPENCLAW_FEISHU_INGRESS_CATCHUP !== "0";
const VFEISHU_CATCHUP_TICK_MS = 1e3;
const VFEISHU_CATCHUP_STALL_MS = 15e3;
const VFEISHU_CATCHUP_SETTLE_MS = 5e3;
const VFEISHU_CATCHUP_FOLLOWUP_MS = 60e3;
const VFEISHU_CATCHUP_MARGIN_MS = 60e3;
const VFEISHU_CATCHUP_MAX_WINDOW_MS = 2 * 60 * 60e3;
const VFEISHU_CATCHUP_CHAT_TTL_MS = 24 * 60 * 60e3;
const VFEISHU_CATCHUP_MAX_CHATS = 200;
const VFEISHU_CATCHUP_MAX_PAGES = 10;
const VFEISHU_CATCHUP_CONCURRENCY = 4;
const VFEISHU_CATCHUP_SEEN_MAX = 5e3;
const vFeishuIngressCatchups = /* @__PURE__ */ new Map();
function vFeishuCatchupMarkerKey(messageId) {
	return \`v-catchup:\${messageId}\`;
}
function vFeishuCatchupReadPushed(data, encryptKey) {
	try {
		const envelope = decryptEnvelope(isRecord$1(data) ? data : parseRawEnvelope(String(data)), encryptKey);
		const header = isRecord$1(envelope.header) ? envelope.header : {};
		if ((normalizeNullableString(header.event_type) ?? normalizeNullableString(envelope.event_type)) !== "im.message.receive_v1") return null;
		const event = isRecord$1(envelope.event) ? envelope.event : envelope;
		const message = isRecord$1(event.message) ? event.message : null;
		const messageId = normalizeNullableString(message?.message_id);
		const chatId = normalizeNullableString(message?.chat_id);
		if (!messageId || !chatId) return null;
		const mentions = Array.isArray(message.mentions) ? message.mentions : [];
		return {
			messageId,
			chatId,
			chatType: normalizeNullableString(message.chat_type) ?? "group",
			createdAt: Number(message.create_time),
			mentionOpenIds: mentions.map((mention) => normalizeNullableString(mention?.id?.open_id)).filter(Boolean)
		};
	} catch {
		return null;
	}
}
function vFeishuCatchupEnvelope(item, chat, appId) {
	const idOf = (id, idType) => ({ [normalizeNullableString(idType) ?? "open_id"]: id });
	const mentions = (Array.isArray(item.mentions) ? item.mentions : []).filter((mention) => normalizeNullableString(mention?.id)).map((mention) => ({
		key: mention.key,
		id: idOf(mention.id, mention.id_type),
		name: mention.name,
		...mention.tenant_key ? { tenant_key: mention.tenant_key } : {}
	}));
	return {
		schema: "2.0",
		header: {
			event_id: \`v-catchup-\${item.message_id}\`,
			event_type: "im.message.receive_v1",
			create_time: String(item.create_time),
			token: "",
			app_id: appId ?? "",
			tenant_key: item.sender?.tenant_key ?? ""
		},
		event: {
			sender: {
				sender_id: idOf(item.sender.id, item.sender.id_type),
				sender_type: item.sender.sender_type,
				...item.sender.tenant_key ? { tenant_key: item.sender.tenant_key } : {}
			},
			message: {
				message_id: item.message_id,
				...item.root_id ? { root_id: item.root_id } : {},
				...item.parent_id ? { parent_id: item.parent_id } : {},
				...item.thread_id ? { thread_id: item.thread_id } : {},
				create_time: String(item.create_time),
				...item.update_time ? { update_time: String(item.update_time) } : {},
				chat_id: item.chat_id ?? chat.chatId,
				chat_type: chat.chatType,
				message_type: item.msg_type,
				content: item.body.content,
				...mentions.length > 0 ? { mentions } : {}
			}
		}
	};
}
function createVFeishuIngressCatchup({ account, accountId, runtime, invoke, listMessages, now = () => Date.now() }) {
	const log = runtime?.log ?? console.log;
	const error = runtime?.error ?? console.error;
	const chats = /* @__PURE__ */ new Map();
	const seen = /* @__PURE__ */ new Map();
	const injected = /* @__PURE__ */ new Set();
	let tickTimer;
	let lastTick = now();
	let downSince = null;
	let pendingFrom = null;
	let pendingReason = "";
	let passTimer;
	let followupTimer;
	let running = null;
	let stopped = false;
	const list = listMessages ?? (async (params) => await createFeishuClient(account).im.message.list({ params }));
	const remember = (messageId) => {
		seen.set(messageId, now());
		if (seen.size > VFEISHU_CATCHUP_SEEN_MAX) for (const key of seen.keys()) {
			seen.delete(key);
			if (seen.size <= VFEISHU_CATCHUP_SEEN_MAX) break;
		}
	};
	const noteChat = (facts) => {
		const botOpenId = botOpenIds.get(accountId)?.trim();
		const previous = chats.get(facts.chatId);
		chats.delete(facts.chatId);
		chats.set(facts.chatId, {
			chatId: facts.chatId,
			chatType: facts.chatType,
			lastSeenAt: now(),
			pushesAll: Boolean(previous?.pushesAll) || facts.chatType !== "p2p" && Boolean(botOpenId) && !facts.mentionOpenIds.includes(botOpenId)
		});
	};
	const schedule = (from, reason, delayMs = VFEISHU_CATCHUP_SETTLE_MS) => {
		if (stopped) return;
		pendingFrom = pendingFrom === null ? from : Math.min(pendingFrom, from);
		pendingReason = pendingReason ? pendingReason : reason;
		if (passTimer) clearTimeout(passTimer);
		passTimer = setTimeout(() => {
			passTimer = void 0;
			runPass();
		}, delayMs);
		passTimer.unref?.();
	};
	const runPass = () => {
		if (stopped || pendingFrom === null) return;
		if (running) {
			running.finally(() => schedule(pendingFrom ?? now(), pendingReason || "queued", 0));
			return;
		}
		const until = now();
		const from = Math.max(pendingFrom, until - VFEISHU_CATCHUP_MAX_WINDOW_MS);
		const reason = pendingReason;
		pendingFrom = null;
		pendingReason = "";
		running = pass(from, until, reason).catch((err) => {
			error(\`feishu[\${accountId}]: ingress catch-up failed: \${String(err)}\`);
		}).finally(() => {
			running = null;
		});
		if (!reason.startsWith("follow-up")) {
			if (followupTimer) clearTimeout(followupTimer);
			followupTimer = setTimeout(() => {
				followupTimer = void 0;
				schedule(from, \`follow-up of \${reason}\`, 0);
			}, VFEISHU_CATCHUP_FOLLOWUP_MS);
			followupTimer.unref?.();
		}
		return running;
	};
	const shouldPull = (item, chat, from, until) => {
		const createdAt = Number(item?.create_time);
		if (!item?.message_id || !Number.isFinite(createdAt) || createdAt < from || createdAt > until) return false;
		if (item.deleted || item.sender?.sender_type !== "user" || !item.sender?.id || item.msg_type === "system" || typeof item.body?.content !== "string") return false;
		if (chat.chatType === "p2p" || chat.pushesAll) return true;
		const botOpenId = botOpenIds.get(accountId)?.trim();
		return Boolean(botOpenId) && (item.mentions ?? []).some((mention) => mention?.id === botOpenId);
	};
	const inject = async (item, chat) => {
		const messageId = item.message_id;
		if (seen.has(messageId) || injected.has(messageId)) return "seen";
		injected.add(messageId);
		const envelope = vFeishuCatchupEnvelope(item, chat, account.appId);
		const marker = vFeishuCatchupMarkerKey(messageId);
		try {
			if (await hasProcessedFeishuMessage(marker, accountId, log) || await hasProcessedFeishuMessage(resolveFeishuMessageDedupeKey(envelope.event), accountId, log)) return "seen";
			await finalizeFeishuMessageProcessing({
				messageId: marker,
				namespace: accountId,
				log
			});
			await invoke(envelope, { needCheck: false });
		} catch (err) {
			injected.delete(messageId);
			await forgetProcessedFeishuMessage(marker, accountId, log).catch(() => {});
			throw err;
		}
		log(\`feishu[\${accountId}]: ingress catch-up injected message \${messageId} in \${chat.chatId}, sent \${new Date(Number(item.create_time)).toISOString()}, \${Math.round((now() - Number(item.create_time)) / 1e3)}s ago\`);
		return "injected";
	};
	const pullChat = async (chat, from, until, counts) => {
		let pageToken;
		for (let page = 0; page < VFEISHU_CATCHUP_MAX_PAGES; page += 1) {
			const response = await list({
				container_id_type: "chat",
				container_id: chat.chatId,
				start_time: String(Math.floor(from / 1e3)),
				end_time: String(Math.ceil(until / 1e3)),
				sort_type: "ByCreateTimeAsc",
				page_size: 50,
				...pageToken ? { page_token: pageToken } : {}
			});
			if (response?.code !== 0) throw new Error(\`list \${chat.chatId}: code=\${response?.code} msg=\${response?.msg ?? "unknown"}\`);
			for (const item of response.data?.items ?? []) {
				counts.listed += 1;
				if (!shouldPull(item, chat, from, until)) continue;
				const outcome = await inject(item, chat);
				counts[outcome] += 1;
			}
			const next = response.data?.has_more === true ? normalizeNullableString(response.data.page_token) : null;
			if (!next || next === pageToken) return;
			pageToken = next;
		}
	};
	const pass = async (from, until, reason) => {
		const cutoff = until - VFEISHU_CATCHUP_CHAT_TTL_MS;
		const targets = [...chats.values()].filter((chat) => chat.lastSeenAt >= cutoff).slice(-VFEISHU_CATCHUP_MAX_CHATS);
		const counts = {
			listed: 0,
			injected: 0,
			seen: 0,
			errors: 0
		};
		let next = 0;
		const worker = async () => {
			while (!stopped && next < targets.length) {
				const chat = targets[next++];
				try {
					await pullChat(chat, from, until, counts);
				} catch (err) {
					counts.errors += 1;
					error(\`feishu[\${accountId}]: ingress catch-up \${String(err?.message ?? err)}\`);
				}
			}
		};
		await Promise.all(Array.from({ length: Math.min(VFEISHU_CATCHUP_CONCURRENCY, targets.length) }, worker));
		log(\`feishu[\${accountId}]: ingress catch-up (\${reason}): window \${Math.round((until - from) / 1e3)}s, chats \${targets.length}, listed \${counts.listed}, injected \${counts.injected}, already received \${counts.seen}, errors \${counts.errors}\`);
		return counts;
	};
	const api = {
		wrapInvoke: (target) => async (data, params) => {
			const facts = vFeishuCatchupReadPushed(data, account.encryptKey);
			if (facts) {
				noteChat(facts);
				if (injected.has(facts.messageId)) {
					log(\`feishu[\${accountId}]: dropping Feishu re-push of message \${facts.messageId}: already pulled by ingress catch-up\`);
					return;
				}
				remember(facts.messageId);
				// only a late push can be the re-push of a pulled message; on-time pushes skip the lookup
				if (!(now() - facts.createdAt < VFEISHU_CATCHUP_MARGIN_MS) && await hasProcessedFeishuMessage(vFeishuCatchupMarkerKey(facts.messageId), accountId, log)) {
					log(\`feishu[\${accountId}]: dropping Feishu re-push of message \${facts.messageId}: already pulled by ingress catch-up\`);
					return;
				}
			}
			return await target(data, params);
		},
		connectionDown: () => {
			if (downSince === null) downSince = now();
		},
		connectionUp: () => {
			if (downSince === null) return;
			const since = downSince;
			downSince = null;
			schedule(since - VFEISHU_CATCHUP_MARGIN_MS, \`WebSocket reconnected after \${Math.round((now() - since) / 1e3)}s\`);
		},
		start: () => {
			vFeishuIngressCatchups.set(accountId, api);
			lastTick = now();
			tickTimer = setInterval(() => {
				const at = now();
				const gap = at - lastTick;
				const stalledFrom = lastTick;
				lastTick = at;
				if (gap > VFEISHU_CATCHUP_STALL_MS) schedule(stalledFrom - VFEISHU_CATCHUP_MARGIN_MS, \`event loop stalled \${Math.round(gap / 1e3)}s\`);
			}, VFEISHU_CATCHUP_TICK_MS);
			tickTimer.unref?.();
		},
		stop: () => {
			stopped = true;
			if (vFeishuIngressCatchups.get(accountId) === api) vFeishuIngressCatchups.delete(accountId);
			for (const timer of [passTimer, followupTimer]) if (timer) clearTimeout(timer);
			if (tickTimer) clearInterval(tickTimer);
		},
		runPendingPass: () => runPass(),
		chats
	};
	return api;
}
`;

export function patchFeishuMonitor(source) {
  assert(!source.includes(MARKER), 'already patched');
  let out = source;

  out = replaceExactlyOnce(out,
    'async function monitorSingleAccount(params) {\n',
    `${CATCHUP_MODULE}async function monitorSingleAccount(params) {\n`,
    'monitorSingleAccount');

  // WebSocket lifecycle → catch-up: a socket that went away and came back opens a pull over the gap.
  out = replaceExactlyOnce(out,
    `			const publishWsConnected = () => {
				const connectedAt = Date.now();`,
    `			const publishWsConnected = () => {
				vFeishuIngressCatchups.get(accountId)?.connectionUp();
				const connectedAt = Date.now();`,
    'publishWsConnected');
  out = replaceExactlyOnce(out,
    `			const publishWsReconnecting = () => {
				statusSink?.({`,
    `			const publishWsReconnecting = () => {
				vFeishuIngressCatchups.get(accountId)?.connectionDown();
				statusSink?.({`,
    'publishWsReconnecting');
  out = replaceExactlyOnce(out,
    `			error(\`feishu[\${accountId}]: WebSocket connection ended, recreating client in \${delayMs}ms: \${formatFeishuWsErrorForLog(cycleEnd)}\`);`,
    `			vFeishuIngressCatchups.get(accountId)?.connectionDown();
			error(\`feishu[\${accountId}]: WebSocket connection ended, recreating client in \${delayMs}ms: \${formatFeishuWsErrorForLog(cycleEnd)}\`);`,
    'connection ended');
  out = replaceExactlyOnce(out,
    `			error(\`feishu[\${accountId}]: WebSocket start failed, retrying in \${delayMs}ms: \${formatFeishuWsErrorForLog(err)}\`);`,
    `			vFeishuIngressCatchups.get(accountId)?.connectionDown();
			error(\`feishu[\${accountId}]: WebSocket start failed, retrying in \${delayMs}ms: \${formatFeishuWsErrorForLog(err)}\`);`,
    'start failed');

  // monitorSingleAccount: wrap the durable ingress (WebSocket mode only) and run the stall watch.
  out = replaceExactlyOnce(out,
    `		const durableEventDispatcher = durableIngress ? Object.assign(Object.create(eventDispatcher), { invoke: durableIngress.invoke }) : eventDispatcher;`,
    `		// ${MARKER}
		const vIngressCatchup = durableIngress && connectionMode !== "webhook" && VFEISHU_INGRESS_CATCHUP_ENABLED ? createVFeishuIngressCatchup({
			account,
			accountId,
			runtime,
			invoke: durableIngress.invoke
		}) : void 0;
		const durableEventDispatcher = durableIngress ? Object.assign(Object.create(eventDispatcher), { invoke: vIngressCatchup ? vIngressCatchup.wrapInvoke(durableIngress.invoke) : durableIngress.invoke }) : eventDispatcher;`,
    'durableEventDispatcher');
  out = replaceExactlyOnce(out,
    `			durableIngress?.start();\n`,
    `			durableIngress?.start();\n			vIngressCatchup?.start();\n`,
    'durableIngress start');
  out = replaceExactlyOnce(out,
    `			await durableIngress?.stop();\n`,
    `			vIngressCatchup?.stop();\n			await durableIngress?.stop();\n`,
    'durableIngress stop');
  return out;
}
