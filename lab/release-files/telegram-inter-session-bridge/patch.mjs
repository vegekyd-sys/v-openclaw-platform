// Telegram channel inbound bridge for sessions_send (docs/inter-session/design.md §2.a, §3.7, §4,
// §7, §13; plugin apps/v-session-relay 2.0). R2, work package WP6.
//
// The plugin hands a request, question, wake-up or collect turn for a Telegram session to this
// bridge instead of running it over the Gateway "agent" RPC, so the target chat gets an ordinary
// Telegram turn: V's progress draft and work view, questions with buttons, images and files, and
// the background line, exactly as if a person had written there.
//
//   ingress chunk  telegram-ingress-drain-factory-DJM2Jqrc.js
//     - registerTelegramHandlers: right after the message pipeline is created, a bridge object is
//       registered under `telegram:<accountId>` in globalThis[Symbol.for(
//       "openclaw.v.interSessionInboundBridges")] (§2.a); the bot's stop wrapper removes it again
//       (only if it is still the registered object).
//     - post(): bot.api.sendMessage(chat, text) as plain text (no parse_mode), optionally replying
//       to an anchor; Bot API errors become BridgeError { code, transient }.
//     - start(): a synthetic text message based on the anchor message, sent by the request's
//       routePeerId, carrying `update.vInterSession` (the turn record) and no update_id (an
//       update_id would move the ingress watermark), checked by the account's own access rules
//       (silently: never a pairing challenge), then run through
//       message.processMessageWithReplyChain({ forceWasMentioned, messageIdOverride: messageSid }).
//       The StartOutcome settles on onAgentRunStart (started), on the exclusive-admission guard's
//       onBusy (busy), or when the handler returns without either (rejected).
//
//   dispatch chunk bot-message-DC6p8sB3.js
//     - the inbound context gets InputProvenance, ChannelPromptContext,
//       CommandInterpretationSuppressed, CommandAuthorized:false, SenderId/SenderName (the
//       chain-root permission identity, not the routing peer), MessageSid and VInterSession
//       through the context builder's `extra` (spread last);
//     - runTelegramDispatchTurn refuses a turn Telegram routed to another session
//       (ROUTE_MISMATCH, nothing runs) and adds runId, vInterSession and onAgentRunStart to the
//       reply options;
//     - deliverReply hands every final payload (not ask_user questions) to the turn record;
//       questions may be answered by askUserAnswererId (a real person), never by the synthetic id;
//     - a turn that never started (BUSY, gated, failed before the run) leaves no trace in the chat:
//       no ack or status reaction, no typing cue, no group-history entry, no "Something went wrong"
//       or empty-response fallback (BM:4053/4068), no background line.
//
// Both chunks are V's live bytes with V's own Telegram experience patch (v-experience-telegram-v1)
// already applied; this patch is stacked on top and needs those anchors. v-experience.js (the
// "会话请求" background kind) is changed by WP3, not here (§13 item 12).
//
// The literals shared with the plugin (registry symbol, Telegram caps, BUSY reasons, the
// restart-wedge text) are inlined; tests/patch-telegram-inter-session-bridge.test.mjs asserts that
// they equal apps/v-session-relay/plugin/core/contracts.js.
//
//   node patch.mjs <captured dist dir> <output dir>
import fs from "node:fs";
import path from "node:path";

export const MARKER = "v-telegram-inter-session-bridge-v1";
/** V's own Telegram experience patch; this patch must find it in both chunks (stacked, §3.7). */
export const BASE_MARKER = "v-experience-telegram-v1";
export const FILES = Object.freeze({
  ingress: "telegram-ingress-drain-factory-DJM2Jqrc.js",
  dispatch: "bot-message-DC6p8sB3.js",
});

/** Inlined in the generated code; the test compares each with contracts.js. */
export const INLINED = Object.freeze({
  bridgesSymbolKey: "openclaw.v.interSessionInboundBridges",
  channel: "telegram",
  caps: Object.freeze({ streaming: true, replyAnchor: true, idempotentPost: false, editPost: false, maxVisibleChars: 3500, askUser: true, media: true }),
  busyReasons: Object.freeze(["active_run", "pending_queue", "recovery_owner"]),
  restartWedgeSource: "restart recovery claim changed",
  /** Telegram's own hard limit for one text message; the plugin already trims to caps.maxVisibleChars. */
  telegramMessageMax: 4096,
  /** getChat cache (labels, chat objects for synthetic messages). */
  chatTtlMs: 600_000,
});

// Block delimiters (the test evaluates the code between them).
export const INGRESS_BLOCK_START = `// ${MARKER}: bridge`;
export const INGRESS_BLOCK_END = `// ${MARKER}: bridge end`;
export const DISPATCH_BLOCK_START = `// ${MARKER}: turn helpers`;
export const DISPATCH_BLOCK_END = `// ${MARKER}: turn helpers end`;

/** The generated code is written with two-space indentation here and emitted with tabs, like the bundle. */
const tabs = (code) => code.replace(/^((?: {2})+)/gmu, (lead) => "\t".repeat(lead.length / 2));

/** `{ a: 1, b: true }` / `["x", "y"]`, the bundle's literal style. */
const objectLiteral = (obj) => `{ ${Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")} }`;
const arrayLiteral = (list) => `[${list.map((v) => JSON.stringify(v)).join(", ")}]`;

// ---------------------------------------------------------------- ingress chunk

const INGRESS_BLOCK = tabs(String.raw`${INGRESS_BLOCK_START}
// Telegram channel inbound bridge for sessions_send (docs/inter-session/design.md §2.a, §3.7).
const V_TELEGRAM_INTER_SESSION_BRIDGES = "${INLINED.bridgesSymbolKey}";
const V_TELEGRAM_INTER_SESSION_CAPS = Object.freeze(${objectLiteral(INLINED.caps)});
const V_TELEGRAM_INTER_SESSION_BUSY_REASONS = ${arrayLiteral(INLINED.busyReasons)};
const V_TELEGRAM_INTER_SESSION_RESTART_WEDGE_RE = /${INLINED.restartWedgeSource}/u;
const V_TELEGRAM_INTER_SESSION_MESSAGE_MAX = ${INLINED.telegramMessageMax};
const V_TELEGRAM_INTER_SESSION_CHAT_TTL_MS = ${INLINED.chatTtlMs};
const vTelegramInterSessionByBot = /* @__PURE__ */ new WeakMap();
function vTelegramInterSessionRegistry() {
  const key = Symbol.for(V_TELEGRAM_INTER_SESSION_BRIDGES);
  globalThis[key] ??= { v: 1, bridges: new Map(), listeners: new Set() };
  return globalThis[key];
}
function vTelegramInterSessionNotify(reg, key, bridge) {
  for (const listener of [...reg.listeners]) try {
    listener(key, bridge);
  } catch {}
}
function vTelegramBridgeError(code, message, transient) {
  const error = new Error(message);
  error.name = "BridgeError";
  error.code = code;
  error.transient = transient === true;
  return error;
}
/** A grammY GrammyError (error_code, description) or HttpError (no error_code) as a BridgeError (§2.a). */
function vTelegramBridgeErrorFrom(err) {
  const status = typeof err?.error_code === "number" ? err.error_code : void 0;
  const description = String(err?.description ?? err?.message ?? err);
  if (status === void 0) return vTelegramBridgeError("CHANNEL_DOWN", "Telegram unreachable: " + description, true);
  if (status === 429 || status >= 500) return vTelegramBridgeError("CHANNEL_DOWN", "Telegram " + status + ": " + description, true);
  if (status === 403) return vTelegramBridgeError("NOT_MEMBER", "Telegram 403: " + description, false);
  if (/chat not found|peer_id_invalid|group chat was (?:deleted|upgraded)|chat was deactivated/iu.test(description)) return vTelegramBridgeError("CHAT_GONE", "Telegram " + status + ": " + description, false);
  return vTelegramBridgeError("POST_FAILED", "Telegram " + status + ": " + description, false);
}
/** Clip to Telegram's per-message limit without splitting a surrogate pair. */
function vTelegramInterSessionClip(text) {
  if (text.length <= V_TELEGRAM_INTER_SESSION_MESSAGE_MAX) return text;
  let end = V_TELEGRAM_INTER_SESSION_MESSAGE_MAX - 1;
  const code = text.charCodeAt(end - 1);
  if (code >= 55296 && code <= 56319) end -= 1;
  return text.slice(0, end) + "…";
}
/** A chat from a stored delivery target: "telegram:<chat>", "telegram:<chat>:topic:<n>" or a bare id. */
function vTelegramTargetFromDelivery(to, threadId) {
  const m = /^(?:(?:telegram|tg):)?(-?\d+)(?::topic:(\d+))?$/iu.exec(String(to ?? "").trim());
  if (!m) return void 0;
  const thread = m[2] ?? (threadId != null && /^\d+$/u.test(String(threadId)) ? String(threadId) : void 0);
  return { chatId: m[1], ...thread ? { threadId: thread } : {} };
}
/** A chat from a session key: "agent:<a>:telegram[:<account>]:(direct|group):<id>[:topic:<n>]" (§2.a). */
function vTelegramTargetFromSessionKey(sessionKey) {
  const m = /:telegram:(?:[a-z0-9_-]+:)?(?:direct|group):(-?\d+)(?::topic:(\d+))?$/u.exec(String(sessionKey ?? ""));
  return m ? { chatId: m[1], ...m[2] ? { threadId: m[2] } : {} } : void 0;
}
/**
* The turn record a synthetic message carries in update.vInterSession; the dispatch chunk reports
* into it. outcome settles once: started (onAgentRunStart), busy (onBusy) or rejected (the handler
* returned without either); done settles once a started turn's handler returns.
*/
function vCreateTelegramInterSessionTurn(req) {
  let settleOutcome;
  const outcome = new Promise((resolve) => {
    settleOutcome = resolve;
  });
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });
  let outcomeSettled = false;
  let doneSettled = false;
  const settle = (value) => {
    if (outcomeSettled) return;
    outcomeSettled = true;
    settleOutcome(value);
  };
  const rejected = (code, message) => settle({ status: "rejected", code, message, started: false });
  const errorText = (error) => error == null ? void 0 : String(error?.message ?? error);
  const turn = {
    v: 1,
    req,
    started: false,
    runId: void 0,
    busyReason: void 0,
    rejection: void 0,
    error: void 0,
    end: void 0,
    finals: [],
    vInter: void 0,
    onAgentRunStart(runId) {
      if (turn.started || outcomeSettled) return;
      turn.started = true;
      turn.runId = typeof runId === "string" && runId ? runId : req.runId;
      settle({ status: "started", runId: turn.runId, done });
    },
    onBusy(info) {
      if (turn.started || outcomeSettled) return;
      turn.busyReason = V_TELEGRAM_INTER_SESSION_BUSY_REASONS.includes(info?.reason) ? info.reason : "active_run";
      settle({ status: "busy", reason: turn.busyReason });
    },
    reject(code, message) {
      if (!turn.started && !turn.rejection) turn.rejection = { code, message: String(message ?? code) };
    },
    /** A final reply payload of the turn (deliver kind "final"); ask_user questions and reasoning are not results. */
    captureFinal(payload) {
      if (!turn.started || !payload || payload.channelData?.askUser || payload.isReasoning === true) return;
      const text = typeof payload.text === "string" && payload.text.trim() ? payload.text : void 0;
      const media = [...Array.isArray(payload.mediaUrls) ? payload.mediaUrls : [], ...typeof payload.mediaUrl === "string" ? [payload.mediaUrl] : []].filter((url) => typeof url === "string" && url);
      if (!text && media.length === 0) return;
      turn.finals.push({ ...text ? { text } : {}, ...media.length ? { mediaUrls: [...new Set(media)] } : {} });
    },
    noteNotStarted(error) {
      if (error != null && turn.error == null) turn.error = error;
    },
    noteDispatchEnd(summary) {
      turn.end = summary;
    },
    /** The handler (processMessageWithReplyChain) returned or threw. */
    finish(result, thrown) {
      const message = errorText(thrown) ?? (result?.kind === "failed-retryable" ? errorText(result.error) ?? "telegram processing failed" : void 0) ?? errorText(turn.error);
      if (!turn.started) {
        if (outcomeSettled) return;
        if (turn.rejection) return rejected(turn.rejection.code, turn.rejection.message);
        if (message !== void 0) return rejected(V_TELEGRAM_INTER_SESSION_RESTART_WEDGE_RE.test(message) ? "RESTART_WEDGE" : "INTERNAL", message);
        return rejected("GATED", result?.kind === "skipped" ? "Telegram dropped the synthetic message (access, mention or binding rules)" : "the turn ended without starting a run or reporting busy");
      }
      if (doneSettled) return;
      doneSettled = true;
      const end = turn.end ?? {};
      const failure = message ?? errorText(end.dispatchError) ?? (end.agentRunFailed === true ? "the agent run failed" : void 0);
      resolveDone({
        status: failure === void 0 ? "ok" : "error",
        finals: turn.finals,
        visibleReplySent: end.visibleReplySent === true,
        finalCount: turn.finals.length,
        ...failure === void 0 ? {} : { error: failure }
      });
    }
  };
  turn.vInter = {
    exclusive: true,
    id: req.id,
    kind: req.kind,
    onBusy: (info) => turn.onBusy(info)
  };
  return { turn, outcome };
}
/** The InterSessionBridge of one Telegram account (§2.a). */
function vCreateTelegramInterSessionBridge({ accountId, bot, botInfo, message, authorization, normalizeAccountId, log }) {
  const chats = /* @__PURE__ */ new Map();
  const rememberChat = (chat) => {
    if (chat && chat.id != null) chats.set(String(chat.id), { chat, at: Date.now() });
  };
  const cachedChat = (chatId) => {
    const hit = chats.get(String(chatId));
    return hit && Date.now() - hit.at < V_TELEGRAM_INTER_SESSION_CHAT_TTL_MS ? hit.chat : void 0;
  };
  const me = () => {
    try {
      return bot.botInfo ?? botInfo;
    } catch {
      return botInfo;
    }
  };
  const threadParams = (route) => route?.chatType === "group" && /^\d+$/u.test(String(route.threadId ?? "")) ? { message_thread_id: Number(route.threadId) } : {};
  const ownRoute = (route) => route?.channel === "telegram" && normalizeAccountId(route.accountId) === accountId && /^-?\d+$/u.test(String(route.chatId ?? ""));
  const rejected = (code, message) => ({ status: "rejected", code, message, started: false });
  return {
    v: 1,
    channel: "telegram",
    accountId,
    caps: V_TELEGRAM_INTER_SESSION_CAPS,
    async resolveRoute(q) {
      const delivery = q?.delivery && (q.delivery.channel == null || q.delivery.channel === "telegram") ? q.delivery : void 0;
      if (delivery?.accountId && normalizeAccountId(delivery.accountId) !== accountId) return { ok: false, code: "NO_ROUTE", reason: "the session is delivered by Telegram account " + normalizeAccountId(delivery.accountId) + ", not " + accountId };
      const target = (delivery?.to ? vTelegramTargetFromDelivery(delivery.to, delivery.threadId) : void 0) ?? vTelegramTargetFromSessionKey(q?.sessionKey);
      if (!target) return { ok: false, code: "NO_ROUTE", reason: "no Telegram chat id in the session's delivery address or key" };
      const direct = !target.chatId.startsWith("-");
      let chat = cachedChat(target.chatId);
      if (!chat) try {
        chat = await bot.api.getChat(Number(target.chatId));
        rememberChat(chat);
      } catch (err) {
        const failure = vTelegramBridgeErrorFrom(err);
        if (failure.code === "CHAT_GONE" || failure.code === "NOT_MEMBER") return { ok: false, code: failure.code, reason: failure.message };
        log?.("telegram inter-session: getChat " + target.chatId + " failed; routing without it: " + failure.message);
      }
      const owners = (Array.isArray(q?.ownerIds) ? q.ownerIds : []).map((id) => String(id).replace(/^(?:telegram|tg):/iu, "").trim());
      const label = !direct && typeof chat?.title === "string" && chat.title.trim() ? chat.title.trim() : void 0;
      return { ok: true, route: {
        channel: "telegram",
        accountId,
        to: target.chatId,
        chatId: target.chatId,
        chatType: direct ? "direct" : "group",
        ...direct ? { peerId: target.chatId } : {},
        humans: direct ? owners.includes(target.chatId) ? "owner_only" : "single_peer" : "shared",
        ...label ? { label } : {},
        ...!direct && target.threadId ? { threadId: target.threadId } : {}
      } };
    },
    async post(p) {
      const route = p?.route;
      if (!ownRoute(route)) throw vTelegramBridgeError("POST_FAILED", "not a route of Telegram account " + accountId, false);
      const text = vTelegramInterSessionClip(String(p.text ?? ""));
      if (!text.trim()) throw vTelegramBridgeError("POST_FAILED", "nothing to post", false);
      const replyTo = /^\d+$/u.test(String(p.replyToMessageId ?? "")) ? Number(p.replyToMessageId) : void 0;
      let sent;
      try {
        sent = await bot.api.sendMessage(Number(route.chatId), text, {
          ...threadParams(route),
          ...replyTo === void 0 ? {} : { reply_parameters: {
            message_id: replyTo,
            allow_sending_without_reply: true
          } },
          link_preview_options: { is_disabled: true }
        });
      } catch (err) {
        throw vTelegramBridgeErrorFrom(err);
      }
      rememberChat(sent?.chat);
      return { messageId: sent?.message_id == null ? null : String(sent.message_id) };
    },
    async start(req) {
      const route = req?.route;
      if (!ownRoute(route)) return rejected("ROUTE_MISMATCH", "not a route of Telegram account " + accountId);
      if (typeof req.promptText !== "string" || !req.promptText.trim()) return rejected("INTERNAL", "empty promptText");
      const peer = /^\d+$/u.test(String(req.routePeerId ?? "")) ? Number(req.routePeerId) : void 0;
      if (peer === void 0) return rejected("NO_ROUTE", "no Telegram user to carry the request into chat " + route.chatId);
      const self = me();
      if (self?.id == null) return rejected("CHANNEL_DOWN", "the Telegram bot has not finished starting");
      try {
        const chatId = String(route.chatId);
        const isGroup = route.chatType === "group";
        const name = String(req.sender?.name || "V");
        const chat = cachedChat(chatId) ?? (isGroup ? {
          id: Number(chatId),
          type: chatId.startsWith("-100") ? "supergroup" : "group",
          ...typeof route.label === "string" && route.label ? { title: route.label } : {}
        } : {
          id: Number(chatId),
          type: "private",
          first_name: name
        });
        const thread = threadParams(route);
        const anchorId = /^\d+$/u.test(String(req.anchorMessageId ?? "")) ? Number(req.anchorMessageId) : void 0;
        const msg = message.buildSyntheticTextMessage({
          base: {
            ...anchorId === void 0 ? {} : { message_id: anchorId },
            date: Math.floor(Date.now() / 1e3),
            chat,
            ...thread.message_thread_id === void 0 ? {} : {
              message_thread_id: thread.message_thread_id,
              is_topic_message: true
            }
          },
          from: {
            id: peer,
            is_bot: false,
            first_name: name
          },
          text: req.promptText
        });
        const gate = await authorization.authorizeInboundMessage({
          msg,
          chatId: Number(chatId),
          isGroup,
          isForum: chat.is_forum === true,
          senderId: String(peer),
          senderUsername: "",
          dmAccess: "silent"
        });
        if (!gate?.allowed) return rejected("GATED", "Telegram access rules refused sender " + peer + " in chat " + chatId);
        const { turn, outcome } = vCreateTelegramInterSessionTurn(req);
        const ctx = {
          message: msg,
          update: { vInterSession: turn },
          me: self,
          getFile: async () => {
            throw new Error("a synthetic inter-session message has no file");
          }
        };
        Promise.resolve().then(() => message.processMessageWithReplyChain({
          ctx,
          msg,
          allMedia: [],
          storeAllowFrom: gate.context?.storeAllowFrom ?? [],
          options: {
            forceWasMentioned: true,
            messageIdOverride: req.messageSid,
            receivedAtMs: Date.now(),
            ...gate.context?.threadSpec ? { threadSpec: gate.context.threadSpec } : {},
            ...typeof gate.resolveChannelIngress === "function" ? { channelIngressResolvers: [gate.resolveChannelIngress] } : {}
          }
        })).then((result) => turn.finish(result), (error) => turn.finish(void 0, error));
        return await outcome;
      } catch (error) {
        const text = String(error?.message ?? error);
        return rejected(V_TELEGRAM_INTER_SESSION_RESTART_WEDGE_RE.test(text) ? "RESTART_WEDGE" : "INTERNAL", text);
      }
    }
  };
}
function vRegisterTelegramInterSessionBridge(params, message, authorization) {
  try {
    const accountId = normalizeAccountId(params.accountId);
    const bridge = vCreateTelegramInterSessionBridge({
      accountId,
      bot: params.bot,
      botInfo: params.opts?.botInfo,
      message,
      authorization,
      normalizeAccountId,
      log: (line) => logVerbose(line)
    });
    const reg = vTelegramInterSessionRegistry();
    const key = "telegram:" + accountId;
    vTelegramInterSessionByBot.set(params.bot, bridge);
    reg.bridges.set(key, bridge);
    vTelegramInterSessionNotify(reg, key, bridge);
    logVerbose("telegram: inter-session bridge registered as " + key);
  } catch (err) {
    params.runtime?.error?.("telegram: inter-session bridge not registered: " + String(err?.message ?? err));
  }
}
function vUnregisterTelegramInterSessionBridge(bot) {
  const bridge = vTelegramInterSessionByBot.get(bot);
  if (!bridge) return;
  vTelegramInterSessionByBot.delete(bot);
  const reg = vTelegramInterSessionRegistry();
  const key = "telegram:" + bridge.accountId;
  if (reg.bridges.get(key) !== bridge) return;
  reg.bridges.delete(key);
  vTelegramInterSessionNotify(reg, key, null);
}
${INGRESS_BLOCK_END}
`);

const REGISTER_ANCHOR = "//#region extensions/telegram/src/bot-handlers.runtime.ts\nconst registerTelegramHandlers = (params) => {\n\tconst message = createTelegramMessagePipeline(params);\n\tconst authorization = createTelegramHandlerAuthorization(params);\n";
const STOP_ANCHOR = "\tconst originalStop = bot.stop.bind(bot);\n\tbot.stop = ((...args) => {\n\t\tthreadBindingManager?.stop();\n";

const ingressReplacements = [
  {
    // The bridge lives next to the pipeline it drives; it is registered as soon as the
    // account's message pipeline exists (TG:4046).
    name: "register",
    anchor: REGISTER_ANCHOR,
    replace: `${INGRESS_BLOCK}${REGISTER_ANCHOR}\tvRegisterTelegramInterSessionBridge(params, message, authorization); // ${MARKER}\n`,
  },
  {
    // A stopped bot (a polling cycle ending, the account stopping) takes its bridge with it (TG:5008).
    name: "unregister",
    anchor: STOP_ANCHOR,
    replace: `${STOP_ANCHOR}\t\tvUnregisterTelegramInterSessionBridge(bot); // ${MARKER}\n`,
  },
];

// ---------------------------------------------------------------- dispatch chunk

const DISPATCH_BLOCK = tabs(String.raw`${DISPATCH_BLOCK_START}
// A sessions_send turn (docs/inter-session/design.md §3.7) arrives as a synthetic message whose
// update.vInterSession is the turn record created by the bridge in the ingress chunk.
function vTelegramInterSessionFromCtx(ctx) {
  const turn = ctx?.update?.vInterSession;
  return turn && turn.v === 1 && turn.req ? turn : void 0;
}
function vTelegramInterSessionOf(context) {
  return vTelegramInterSessionFromCtx(context?.primaryCtx);
}
/** Inbound context fields of the turn (§2.a); spread last into the context builder's extra. */
function vTelegramInterSessionCtxFields(primaryCtx) {
  const turn = vTelegramInterSessionFromCtx(primaryCtx);
  if (!turn) return {};
  const req = turn.req;
  return {
    InputProvenance: req.provenance,
    ChannelPromptContext: req.channelPromptContext,
    CommandInterpretationSuppressed: true,
    CommandAuthorized: false,
    SenderId: req.sender.id,
    SenderName: req.sender.name,
    MessageSid: req.messageSid,
    VInterSession: turn.vInter
  };
}
/** The turn must run in the session it was sent to; otherwise nothing runs (ROUTE_MISMATCH). */
function vTelegramInterSessionAdmit(context) {
  const turn = vTelegramInterSessionOf(context);
  if (!turn) return true;
  const routed = context.route?.sessionKey;
  const sessionKey = context.ctxPayload?.SessionKey ?? routed;
  if (routed === turn.req.sessionKey && sessionKey === turn.req.sessionKey) return true;
  turn.reject("ROUTE_MISMATCH", "Telegram routed the turn to " + (sessionKey ?? "no session") + ", not " + turn.req.sessionKey);
  return false;
}
/** Reply options of the turn (§2.a core seam): the preset runId, the exclusive-admission request, run start. */
function vTelegramInterSessionReplyOptions(context) {
  const turn = vTelegramInterSessionOf(context);
  if (!turn) return {};
  return {
    runId: turn.req.runId,
    vInterSession: turn.vInter,
    onAgentRunStart: (runId) => {
      turn.onAgentRunStart(runId);
    }
  };
}
/** Who may answer the turn's ask_user questions: a real person, never the synthetic sender. */
function vTelegramInterSessionAnswerer(context) {
  const turn = vTelegramInterSessionOf(context);
  return turn ? turn.req.askUserAnswererId : context?.ctxPayload?.SenderId;
}
function vTelegramInterSessionCaptureFinal(context, payload, info) {
  if (info?.kind === "final") vTelegramInterSessionOf(context)?.captureFinal(payload);
}
${DISPATCH_BLOCK_END}
`);

const VRESUME_ANCHOR = "const vResume = (turn) => { if (turn.vQuestionPause) turn.vQuestionPause = false; };\n//#region extensions/telegram/src/forum-service-message.ts\n";
const EXTRA_END_ANCHOR = "\t\t\tIsForum: isForum,\n\t\t\tTopicName: isForum && topicName ? topicName : void 0\n\t\t}\n\t});\n\tif (isGroup && historyKey) recordTelegramGroupHistoryEntry({\n";
const DELIVER_ANCHOR = "async function deliverReply(turn, payload, info) {\n\tif (turn.isSuperseded()) return await settleTerminalNoVisibleDelivery(turn, info, { abandonBufferedFinal: true });\n";
const DISPATCH_TURN_ANCHOR = "async function runTelegramDispatchTurn(turn) {\n\tconst { context } = turn;\n";
const NOT_STARTED_ANCHOR = "\t} finally {\n\t\tdispatchWasSuperseded = isDispatchSuperseded();\n\t}\n\tif (turnDispatched === false) return { kind: \"completed\" };\n";
const VISIBLE_ANCHOR = "\tconst hasVisibleResponse = deliverySummary.delivered || sentFallback || turn.suppressSilentReplyFallback || turn.queuedFinal;\n";

const dispatchReplacements = [
  {
    name: "helpers",
    anchor: VRESUME_ANCHOR,
    replace: VRESUME_ANCHOR.replace("//#region", `${DISPATCH_BLOCK}//#region`),
  },
  {
    // Context fields go last into extra (context.ts spreads extra after its own fields), and the
    // synthetic message is not a chat message: no group-history entry (a BUSY retry would add one each time).
    name: "context-extra",
    anchor: EXTRA_END_ANCHOR,
    replace: `\t\t\tIsForum: isForum,\n\t\t\tTopicName: isForum && topicName ? topicName : void 0,\n\t\t\t...vTelegramInterSessionCtxFields(primaryCtx) // ${MARKER}\n\t\t}\n\t});\n\tif (isGroup && historyKey && !vTelegramInterSessionFromCtx(primaryCtx)) recordTelegramGroupHistoryEntry({\n`,
  },
  {
    // No early typing cue: a BUSY attempt must leave nothing in the chat; a started run gets the
    // reply pipeline's own typing.
    name: "early-typing",
    anchor: "\tif (bodyResult.inboundEventKind !== \"room_event\") {\n\t\tinitialTypingCueSent = true;\n",
    replace: `\tif (bodyResult.inboundEventKind !== "room_event" && !vTelegramInterSessionFromCtx(primaryCtx)) { // ${MARKER}\n\t\tinitialTypingCueSent = true;\n`,
  },
  {
    // No ack and no status reactions on the anchor (statusReactionController stays null).
    name: "ack-reaction",
    anchor: "\tconst shouldSendAckReaction = Boolean(ackReaction && shouldAckReaction({\n",
    replace: `\tconst shouldSendAckReaction = !vTelegramInterSessionFromCtx(primaryCtx) && Boolean(ackReaction && shouldAckReaction({ // ${MARKER}\n`,
  },
  {
    name: "processor-typing",
    anchor: "\t\tif (context.ctxPayload.InboundEventKind !== \"room_event\" && context.initialTypingCueSent !== true) context.sendTyping().catch((err) => {\n",
    replace: `\t\tif (context.ctxPayload.InboundEventKind !== "room_event" && context.initialTypingCueSent !== true && !vTelegramInterSessionOf(context)) context.sendTyping().catch((err) => { // ${MARKER}\n`,
  },
  {
    // The processor's last-resort notice only for a turn that actually ran.
    name: "processor-failure-notice",
    anchor: "\t\t\t\tif (!spooledReplay) try {\n\t\t\t\t\tawait bot.api.sendMessage(context.chatId, \"Something went wrong while processing your request. Please try again.\", buildTelegramThreadParams(context.threadSpec));\n",
    replace: `\t\t\t\tif (!spooledReplay && vTelegramInterSessionOf(context)?.started !== false) try { // ${MARKER}\n\t\t\t\t\tawait bot.api.sendMessage(context.chatId, "Something went wrong while processing your request. Please try again.", buildTelegramThreadParams(context.threadSpec));\n`,
  },
  {
    name: "deliver-final",
    anchor: DELIVER_ANCHOR,
    replace: `${DELIVER_ANCHOR}\tvTelegramInterSessionCaptureFinal(turn.context, payload, info); // ${MARKER}\n`,
  },
  {
    name: "deliver-question-answerer",
    anchor: "senderId: turn.context.ctxPayload.SenderId, record: question, beforeSend: () => vMakeRoomForQuestion(turn) })) return await settleTerminalNoVisibleDelivery(turn, info);\n",
    replace: `senderId: vTelegramInterSessionAnswerer(turn.context), record: question, beforeSend: () => vMakeRoomForQuestion(turn) })) return await settleTerminalNoVisibleDelivery(turn, info); // ${MARKER}\n`,
  },
  {
    name: "turn-route",
    anchor: DISPATCH_TURN_ANCHOR,
    replace: `${DISPATCH_TURN_ANCHOR}\tif (!vTelegramInterSessionAdmit(context)) return false; // ${MARKER}\n`,
  },
  {
    name: "turn-question-answerer",
    anchor: "senderId: context.ctxPayload.SenderId, record, beforeSend: () => vMakeRoomForQuestion(turn) }));\n",
    replace: `senderId: vTelegramInterSessionAnswerer(context), record, beforeSend: () => vMakeRoomForQuestion(turn) })); // ${MARKER}\n`,
  },
  {
    // Spread last: runId, vInterSession, onAgentRunStart (Telegram has no onAgentRunStart of its own).
    name: "reply-options",
    anchor: "\t\t\t\t\t\tonModelSelected\n\t\t\t\t\t}\n\t\t\t\t})\n\t\t\t}\n\t\t});\n\t\tif (!turnResult.dispatched) return false;\n",
    replace: `\t\t\t\t\t\tonModelSelected,\n\t\t\t\t\t\t...vTelegramInterSessionReplyOptions(context) // ${MARKER}\n\t\t\t\t\t}\n\t\t\t\t})\n\t\t\t}\n\t\t});\n\t\tif (!turnResult.dispatched) return false;\n`,
  },
  {
    // A turn that never started does not touch the chat's background line.
    name: "background-line",
    anchor: "\t\tlet vLineMessageId;\n\t\tvExperience.watchBackground({\n",
    replace: `\t\tlet vLineMessageId;\n\t\tif (vTelegramInterSessionOf(context)?.started !== false) vExperience.watchBackground({ // ${MARKER}\n`,
  },
  {
    // BUSY / gated / failed before the run: no failure or empty-response fallback (BM:4053/4055),
    // no status finalize (BM:4068); the bridge classifies what happened.
    name: "not-started",
    anchor: NOT_STARTED_ANCHOR,
    replace: NOT_STARTED_ANCHOR.replace("\tif (turnDispatched === false)", `\t// ${MARKER}\n\tconst vInterSessionTurn = vTelegramInterSessionOf(dispatchContext);\n\tif (vInterSessionTurn && !vInterSessionTurn.started) {\n\t\tvInterSessionTurn.noteNotStarted(turn.dispatchError);\n\t\treturn { kind: "completed" };\n\t}\n\tif (turnDispatched === false)`),
  },
  {
    name: "dispatch-end",
    anchor: VISIBLE_ANCHOR,
    replace: `${VISIBLE_ANCHOR}\tvInterSessionTurn?.noteDispatchEnd({ agentRunFailed: turn.agentRunFailed === true, dispatchError: turn.dispatchError, visibleReplySent: Boolean(deliverySummary.delivered || sentFallback) }); // ${MARKER}\n`,
  },
];

// ---------------------------------------------------------------- apply

function apply(source, replacements, label) {
  if (typeof source !== "string") throw new TypeError(`${label}: source must be a string`);
  if (source.includes(MARKER)) throw new Error(`${label}: already patched`);
  if (!source.includes(BASE_MARKER)) throw new Error(`${label}: ${BASE_MARKER} not found; this patch stacks on V's Telegram experience bytes`);
  let out = source;
  for (const r of replacements) {
    const count = out.split(r.anchor).length - 1;
    if (count !== 1) throw new Error(`${label}: anchor "${r.name}": expected exactly one anchor, found ${count}`);
    out = out.replace(r.anchor, () => r.replace);
  }
  return out;
}

/** The anchors each chunk needs, by name (the test checks each occurs exactly once in V's bytes). */
export const ANCHORS = Object.freeze({
  ingress: Object.freeze(Object.fromEntries(ingressReplacements.map((r) => [r.name, r.anchor]))),
  dispatch: Object.freeze(Object.fromEntries(dispatchReplacements.map((r) => [r.name, r.anchor]))),
});

/** Patched telegram-ingress-drain-factory-DJM2Jqrc.js from the exact bytes V runs. */
export const patchTelegramIngress = (source) => apply(source, ingressReplacements, "telegram ingress");
/** Patched bot-message-DC6p8sB3.js from the exact bytes V runs. */
export const patchTelegramDispatch = (source) => apply(source, dispatchReplacements, "telegram dispatch");

/** Writes both generated files from a captured dist directory. */
export function generate(capturedDistDir, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const written = {};
  for (const [kind, fn] of [["ingress", patchTelegramIngress], ["dispatch", patchTelegramDispatch]]) {
    const file = FILES[kind];
    const out = path.join(outDir, file);
    fs.writeFileSync(out, fn(fs.readFileSync(path.join(capturedDistDir, file), "utf8")));
    written[kind] = out;
  }
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [capturedDistDir, outDir] = process.argv.slice(2);
  if (!capturedDistDir || !outDir) throw new Error("usage: node patch.mjs <captured dist dir> <output dir>");
  console.log(JSON.stringify(generate(capturedDistDir, outDir)));
}
