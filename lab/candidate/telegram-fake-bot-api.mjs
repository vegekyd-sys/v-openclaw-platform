// A loopback stand-in for the Telegram Bot API, for candidate tests.
//
// The OpenClaw Telegram channel honours `channels.telegram.apiRoot`, so a
// private Gateway can run its real Telegram code against this server: it
// polls getUpdates, sends and edits messages, answers callback queries. The
// test injects user messages and button presses as updates and reads back
// every message the bot produced, including each edit, as a timeline.
//
// For the inter-session bridge (lab/release-files/telegram-inter-session-bridge)
// it also knows group titles (getChat, the chat of every message), records
// reactions and chat actions as calls (so "nothing visible while BUSY" can be
// asserted), and can fail the next call of a method with a given Bot API error
// (failNext), the way Telegram answers a kicked bot or a deleted chat.
//
// Nothing here talks to Telegram. The bot token is a fixed fake value.
import http from "node:http";

export const FAKE_BOT_TOKEN = "100000001:candidate-fake-telegram-token";

export function createFakeTelegramBotApi({ botId = 100000001, botUsername = "v_candidate_bot" } = {}) {
  let nextMessageId = 1000;
  let nextUpdateId = 1;
  const updates = [];
  const waiters = [];
  const messages = new Map(); // `${chatId}:${messageId}` -> message state
  const calls = []; // every API call, in order
  const callbackAnswers = [];
  const listeners = new Set();
  const chats = new Map(); // chatId -> { title, type, isForum }
  const failures = new Map(); // method -> [{ status, description }]

  const now = () => Math.floor(Date.now() / 1000);
  const key = (chatId, messageId) => `${chatId}:${messageId}`;
  const emit = (event) => { for (const fn of listeners) fn(event); };
  /** The Bot API chat object of a chat id: private for positive ids, a supergroup (with a title) for negative ones. */
  const chatFor = (chatId, firstName = "Tianyi") => {
    const id = Number(chatId);
    const meta = chats.get(String(chatId)) ?? {};
    if (id >= 0 && meta.type !== "supergroup" && meta.type !== "group") return { id, type: "private", first_name: meta.firstName ?? firstName };
    return { id, type: meta.type ?? "supergroup", title: meta.title ?? "VLab candidate group", ...(meta.isForum ? { is_forum: true } : {}) };
  };

  const wakePollers = () => {
    while (waiters.length && updates.length) waiters.shift()();
  };

  const recordMessage = (chatId, params, kind) => {
    const messageId = nextMessageId++;
    const state = {
      chatId: String(chatId), messageId, kind,
      text: params.text ?? params.caption ?? "",
      parseMode: params.parse_mode,
      replyMarkup: params.reply_markup ? parseMaybeJson(params.reply_markup) : undefined,
      replyTo: params.reply_parameters ? parseMaybeJson(params.reply_parameters)?.message_id : params.reply_to_message_id,
      history: [],
      deleted: false,
      createdAt: Date.now(),
    };
    state.history.push({ at: Date.now(), op: "send", text: state.text, replyMarkup: state.replyMarkup });
    messages.set(key(chatId, messageId), state);
    emit({ type: "send", message: state });
    return state;
  };

  const asTelegramMessage = (state, from) => ({
    message_id: state.messageId,
    date: now(),
    chat: chatFor(state.chatId),
    from: from ?? { id: botId, is_bot: true, first_name: "V candidate", username: botUsername },
    // A photo message carries its text as the caption.
    ...(state.kind === "photo" ? { caption: state.text, photo: [{ file_id: `photo-${state.messageId}`, file_unique_id: `p${state.messageId}`, width: 640, height: 400 }] } : { text: state.text }),
    ...(state.replyMarkup ? { reply_markup: state.replyMarkup } : {}),
  });

  const handlers = {
    getMe: () => ({ id: botId, is_bot: true, first_name: "V candidate", username: botUsername, can_join_groups: true, can_read_all_group_messages: true, supports_inline_queries: false }),
    getUpdates: async (params) => {
      const offset = Number(params.offset ?? 0);
      while (updates.length && updates[0].update_id < offset) updates.shift();
      if (!updates.length) {
        const timeout = Math.min(Number(params.timeout ?? 0), 25) * 1000;
        if (timeout > 0) await new Promise((resolve) => { const t = setTimeout(resolve, timeout); waiters.push(() => { clearTimeout(t); resolve(); }); });
      }
      while (updates.length && updates[0].update_id < offset) updates.shift();
      return updates.slice(0, Number(params.limit ?? 100));
    },
    sendMessage: (params) => {
      refuseInvalidUrlButtons(params.reply_markup);
      return asTelegramMessage(recordMessage(params.chat_id, params, "text"));
    },
    sendPhoto: (params) => {
      refuseInvalidUrlButtons(params.reply_markup);
      const state = recordMessage(params.chat_id, params, "photo");
      state.photo = params.photo;
      state.threadId = params.message_thread_id;
      return asTelegramMessage(state);
    },
    editMessageMedia: (params) => {
      const state = messages.get(key(params.chat_id, params.message_id));
      if (!state) throw apiError(400, "Bad Request: message to edit not found");
      const media = parseMaybeJson(params.media) ?? {};
      state.text = media.caption ?? "";
      state.photo = typeof media.media === "string" && media.media.startsWith("attach://") ? params[media.media.slice("attach://".length)] : media.media;
      if (params.reply_markup !== undefined) state.replyMarkup = parseMaybeJson(params.reply_markup);
      state.history.push({ at: Date.now(), op: "edit-media", text: state.text, replyMarkup: state.replyMarkup, photo: state.photo });
      emit({ type: "edit", message: state });
      return asTelegramMessage(state);
    },
    sendDocument: (params) => asTelegramMessage(recordMessage(params.chat_id, params, "document")),
    sendAnimation: (params) => asTelegramMessage(recordMessage(params.chat_id, params, "animation")),
    sendVideo: (params) => asTelegramMessage(recordMessage(params.chat_id, params, "video")),
    editMessageText: (params) => {
      const state = messages.get(key(params.chat_id, params.message_id));
      if (!state) throw apiError(400, "Bad Request: message to edit not found");
      if (state.text === params.text && JSON.stringify(state.replyMarkup) === JSON.stringify(parseMaybeJson(params.reply_markup))) {
        throw apiError(400, "Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message");
      }
      state.text = params.text;
      state.parseMode = params.parse_mode;
      if (params.reply_markup !== undefined) state.replyMarkup = parseMaybeJson(params.reply_markup);
      else state.replyMarkup = undefined;
      state.history.push({ at: Date.now(), op: "edit", text: state.text, replyMarkup: state.replyMarkup });
      emit({ type: "edit", message: state });
      return asTelegramMessage(state);
    },
    editMessageCaption: (params) => {
      const state = messages.get(key(params.chat_id, params.message_id));
      if (!state) throw apiError(400, "Bad Request: message to edit not found");
      state.text = params.caption ?? "";
      if (params.reply_markup !== undefined) state.replyMarkup = parseMaybeJson(params.reply_markup);
      state.history.push({ at: Date.now(), op: "edit-caption", text: state.text, replyMarkup: state.replyMarkup });
      emit({ type: "edit", message: state });
      return asTelegramMessage(state);
    },
    editMessageReplyMarkup: (params) => {
      const state = messages.get(key(params.chat_id, params.message_id));
      if (!state) throw apiError(400, "Bad Request: message to edit not found");
      state.replyMarkup = params.reply_markup ? parseMaybeJson(params.reply_markup) : undefined;
      state.history.push({ at: Date.now(), op: "edit-markup", text: state.text, replyMarkup: state.replyMarkup });
      emit({ type: "edit", message: state });
      return asTelegramMessage(state);
    },
    deleteMessage: (params) => {
      const state = messages.get(key(params.chat_id, params.message_id));
      if (state) {
        state.deleted = true;
        state.history.push({ at: Date.now(), op: "delete" });
        emit({ type: "delete", message: state });
      }
      return true;
    },
    answerCallbackQuery: (params) => { callbackAnswers.push({ at: Date.now(), ...params }); return true; },
    getChat: (params) => chatFor(params.chat_id),
    setMessageReaction: () => true,
    sendChatAction: () => true,
    getChatMember: (params) => ({ status: "member", user: { id: Number(params.user_id), is_bot: false, first_name: "Tianyi" } }),
    getMyCommands: () => [],
    getWebhookInfo: () => ({ url: "", has_custom_certificate: false, pending_update_count: 0 }),
    getFile: (params) => ({ file_id: params.file_id, file_unique_id: params.file_id, file_size: 0 }),
  };

  const server = http.createServer(async (req, res) => {
    const match = /^\/bot([^/]+)\/([A-Za-z]+)$/u.exec(new URL(req.url, "http://x").pathname);
    if (!match) { res.writeHead(404).end(JSON.stringify({ ok: false, error_code: 404, description: "Not Found" })); return; }
    const [, token, method] = match;
    const params = await readParams(req);
    const call = { at: Date.now(), method, params: summarize(params) };
    if (method !== "getUpdates") calls.push(call);
    const reply = (status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (token !== FAKE_BOT_TOKEN) { reply(401, { ok: false, error_code: 401, description: "Unauthorized" }); return; }
    try {
      const failure = failures.get(method)?.shift();
      if (failure) throw apiError(failure.status, failure.description);
      const handler = handlers[method];
      const result = handler ? await handler(params) : true;
      reply(200, { ok: true, result });
    } catch (error) {
      call.error = error.description ?? String(error);
      reply(error.status ?? 500, { ok: false, error_code: error.status ?? 500, description: error.description ?? String(error) });
    }
  });

  const pushUpdate = (update) => {
    const full = { update_id: nextUpdateId++, ...update };
    updates.push(full);
    wakePollers();
    return full;
  };

  return {
    server,
    listen: () => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port))),
    close: () => new Promise((resolve) => {
      while (waiters.length) waiters.shift()();
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
    calls,
    callbackAnswers,
    messages: () => [...messages.values()],
    /** Calls of one Bot API method, in order (getUpdates is never recorded). */
    callsOf: (method) => calls.filter((c) => c.method === method),
    /** Title, type ("supergroup" | "group" | "private") or forum flag of a chat, for getChat and message chats. */
    setChat: ({ chatId, title, type, isForum, firstName }) => { chats.set(String(chatId), { title, type, isForum, firstName }); },
    /**
     * The next `times` calls of `method` fail with this Bot API error, e.g.
     * { status: 403, description: "Forbidden: bot was kicked from the supergroup chat" } or
     * { status: 400, description: "Bad Request: chat not found" }.
     */
    failNext: (method, { status = 400, description = "Bad Request", times = 1 } = {}) => {
      const queue = failures.get(method) ?? [];
      for (let i = 0; i < times; i += 1) queue.push({ status, description });
      failures.set(method, queue);
    },
    onEvent: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    /** A user writes a text message to the bot. */
    sendUserText: ({ chatId, userId, text, firstName = "Tianyi", replyToMessageId }) => {
      const messageId = nextMessageId++;
      const chat = chatFor(chatId, firstName);
      const message = {
        message_id: messageId, date: now(), chat,
        from: { id: Number(userId), is_bot: false, first_name: firstName, language_code: "zh-hans" },
        text,
        ...(text.startsWith("/") ? { entities: [{ type: "bot_command", offset: 0, length: text.split(/\s/u)[0].length }] } : {}),
        ...(replyToMessageId ? { reply_to_message: asTelegramMessage(messages.get(key(chatId, replyToMessageId))) } : {}),
      };
      pushUpdate({ message });
      return messageId;
    },
    /** A user presses an inline keyboard button on a bot message. */
    pressButton: ({ chatId, userId, messageId, data, firstName = "Tianyi" }) => {
      const state = messages.get(key(chatId, messageId));
      if (!state) throw new Error(`no message ${chatId}:${messageId}`);
      const id = `cbq-${nextUpdateId}`;
      pushUpdate({ callback_query: {
        id, chat_instance: `ci-${chatId}`, data,
        from: { id: Number(userId), is_bot: false, first_name: firstName },
        message: asTelegramMessage(state),
      } });
      return id;
    },
  };
}

/** All inline buttons on a message as [{text, data, url}] in reading order. */
export function inlineButtons(message) {
  const rows = message?.replyMarkup?.inline_keyboard ?? [];
  return rows.flat().map((b) => ({ text: b.text, data: b.callback_data, url: b.url, webApp: b.web_app?.url }));
}

/**
 * Telegram refuses URL buttons whose address is not a public http(s) URL
 * (VLab live test: BUTTON_URL_INVALID for http://[fd7a:…]:23950/…). Approximated
 * here as: not http(s), or an IP literal or localhost host.
 */
function refuseInvalidUrlButtons(markup) {
  const rows = parseMaybeJson(markup)?.inline_keyboard ?? [];
  for (const button of rows.flat()) {
    if (typeof button?.url !== "string") continue;
    let url;
    try { url = new URL(button.url); } catch { throw apiError(400, "Bad Request: BUTTON_URL_INVALID"); }
    const host = url.hostname.replace(/^\[|\]$/gu, "");
    if (!/^https?:$/u.test(url.protocol) || host === "localhost" || /^[\d.]+$/u.test(host) || host.includes(":")) throw apiError(400, "Bad Request: BUTTON_URL_INVALID");
  }
}

function apiError(status, description) {
  const error = new Error(description);
  error.status = status;
  error.description = description;
  return error;
}

function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function summarize(params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) out[k] = typeof v === "string" && v.length > 4000 ? `${v.slice(0, 4000)}…` : v;
  return out;
}

async function readParams(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const url = new URL(req.url, "http://x");
  const params = Object.fromEntries(url.searchParams);
  const type = req.headers["content-type"] ?? "";
  if (!body.length) return params;
  if (type.includes("application/json")) return { ...params, ...JSON.parse(body.toString("utf8")) };
  if (type.includes("application/x-www-form-urlencoded")) return { ...params, ...Object.fromEntries(new URLSearchParams(body.toString("utf8"))) };
  if (type.includes("multipart/form-data")) {
    const boundary = /boundary=(?:"([^"]+)"|([^;]+))/u.exec(type);
    const sep = `--${boundary?.[1] ?? boundary?.[2]}`;
    for (const part of body.toString("latin1").split(sep)) {
      const name = /name="([^"]+)"/u.exec(part)?.[1];
      if (!name) continue;
      const value = part.split("\r\n\r\n").slice(1).join("\r\n\r\n").replace(/\r\n$/u, "");
      const file = /filename="([^"]*)"/u.exec(part)?.[1];
      // An uploaded file is kept as its name, type and size (and whether it is a JPEG).
      if (file !== undefined) params[name] = { filename: file, type: /content-type:\s*([^\r\n]+)/iu.exec(part)?.[1], bytes: value.length, jpeg: value.startsWith("\xff\xd8\xff") };
      else params[name] = Buffer.from(value, "latin1").toString("utf8");
    }
  }
  return params;
}
