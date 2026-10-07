// Minimal Telegram Bot API client for the handoff card. OpenClaw's Telegram
// channel sends a presentation as text with buttons and cannot edit it later,
// so the plugin sends the card (a photo with caption and buttons) and edits it
// itself, as the same bot. Callback buttons whose data starts with "/" reach
// the plugin as that command from the person who tapped (Telegram core).
import fs from "node:fs";

const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** Bot token and API root of the Telegram account the conversation runs on, from the Gateway config. */
export function telegramCredentials(config, accountId, { env = process.env } = {}) {
  const channel = config?.channels?.telegram;
  if (!channel || typeof channel !== "object") {
    return null;
  }
  const account = accountId && channel.accounts && typeof channel.accounts === "object" ? channel.accounts[accountId] : null;
  const fromFile = (file) => {
    try {
      return text(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  };
  const token =
    text(account?.botToken) ??
    (account?.tokenFile ? fromFile(account.tokenFile) : null) ??
    text(channel.botToken) ??
    (channel.tokenFile ? fromFile(channel.tokenFile) : null) ??
    (!accountId || accountId === "default" ? text(env.TELEGRAM_BOT_TOKEN) : null);
  if (!token) {
    return null;
  }
  const apiRoot = (text(account?.apiRoot) ?? text(channel.apiRoot) ?? "https://api.telegram.org").replace(/\/+$/u, "");
  return { token, apiRoot };
}

/** "telegram:-100123:topic:7" | "tg:group:-100123" | "70000001" -> {chatId, threadId?}, or null. */
export function telegramChat(target) {
  let raw = String(target ?? "").trim();
  let prefixed = false;
  for (;;) {
    if (/^(telegram|tg):/iu.test(raw)) {
      raw = raw.replace(/^(telegram|tg):/iu, "").trim();
      prefixed = true;
    } else if (prefixed && /^group:/iu.test(raw)) {
      raw = raw.replace(/^group:/iu, "").trim();
    } else {
      break;
    }
  }
  raw = raw.replace(/^group:(?=-?\d)/iu, "");
  const m = /^(-?\d{1,20})(?::(?:topic:)?(\d{1,12}))?$/u.exec(raw);
  if (!m) {
    return null;
  }
  return { chatId: m[1], ...(m[2] ? { threadId: Number(m[2]) } : {}) };
}

export class TelegramApiError extends Error {
  constructor(method, status, description) {
    super(`telegram ${method} failed: ${status} ${description ?? ""}`.trim());
    this.description = description ?? "";
    this.status = status;
  }
}

export class TelegramApi {
  constructor({ token, apiRoot = "https://api.telegram.org", fetchImpl = globalThis.fetch }) {
    this.token = token;
    this.apiRoot = apiRoot.replace(/\/+$/u, "");
    this.fetch = fetchImpl;
  }

  /** JSON call, or multipart when `files` ({field: {bytes, filename}}) are given. */
  async call(method, params, files) {
    let body;
    let headers = {};
    if (files) {
      // Built by hand: FormData turns "\n" in text fields into "\r\n", which would reach the caption.
      const boundary = `----v-desktop-handoff-${Math.random().toString(16).slice(2)}`;
      const parts = [];
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined) continue;
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${typeof value === "string" ? value : JSON.stringify(value)}\r\n`));
      }
      for (const [field, file] of Object.entries(files)) {
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${file.filename ?? "desktop.jpg"}"\r\nContent-Type: ${file.type ?? "image/jpeg"}\r\n\r\n`), Buffer.from(file.bytes), Buffer.from("\r\n"));
      }
      parts.push(Buffer.from(`--${boundary}--\r\n`));
      body = Buffer.concat(parts);
      headers = { "content-type": `multipart/form-data; boundary=${boundary}` };
    } else {
      body = JSON.stringify(params);
      headers = { "content-type": "application/json" };
    }
    const res = await this.fetch(`${this.apiRoot}/bot${this.token}/${method}`, { method: "POST", headers, body, signal: AbortSignal.timeout(20_000) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok !== true) {
      throw new TelegramApiError(method, json.error_code ?? res.status, json.description);
    }
    return json.result;
  }

  /** The card as a photo (bytes) with caption and buttons; without a picture, a text message. Returns {messageId, kind}. */
  async sendCard({ chatId, threadId, photo, caption, replyMarkup }) {
    const common = { chat_id: chatId, ...(threadId ? { message_thread_id: threadId } : {}), parse_mode: "HTML", reply_markup: replyMarkup };
    if (photo) {
      const message = await this.call("sendPhoto", { ...common, caption }, { photo: { bytes: photo, filename: "desktop.jpg" } });
      return { messageId: message.message_id, kind: "photo" };
    }
    const message = await this.call("sendMessage", { ...common, text: caption, link_preview_options: { is_disabled: true } });
    return { messageId: message.message_id, kind: "text" };
  }

  /** Rewrites the card in place; a new picture replaces the photo too. "message is not modified" counts as done. */
  async editCard({ chatId, messageId, kind, photo, caption, replyMarkup }) {
    try {
      if (kind === "photo" && photo) {
        await this.call(
          "editMessageMedia",
          { chat_id: chatId, message_id: messageId, media: { type: "photo", media: "attach://photo", caption, parse_mode: "HTML" }, reply_markup: replyMarkup },
          { photo: { bytes: photo, filename: "desktop.jpg" } },
        );
      } else if (kind === "photo") {
        await this.call("editMessageCaption", { chat_id: chatId, message_id: messageId, caption, parse_mode: "HTML", reply_markup: replyMarkup });
      } else {
        await this.call("editMessageText", { chat_id: chatId, message_id: messageId, text: caption, parse_mode: "HTML", reply_markup: replyMarkup, link_preview_options: { is_disabled: true } });
      }
    } catch (error) {
      if (!/message is not modified/iu.test(error.description ?? "")) {
        throw error;
      }
    }
  }
}
