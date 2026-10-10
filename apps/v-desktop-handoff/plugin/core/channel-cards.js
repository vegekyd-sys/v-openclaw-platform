// V's 「电脑」 handoff card on channels other than Feishu, laid out like the
// native Feishu card (native-card.js): title 「电脑」 with its state, the
// reason, a picture of V's desktop, and 接管 / 完成 / 跳过 — 完成 and 跳过
// post `/v-handback <id>` / `/v-skip <id>` as the person who taps them.
//
//   Telegram   a photo with the card as its caption and an inline keyboard;
//              the plugin sends and edits it through the Bot API itself.
//   DingTalk,  a portable presentation (`openclaw message send`), rendered by
//   WeCom      V's v-experience channel patches: the picture is a text block
//              `![V 的电脑](ref)` (a public url, or a local file the channel
//              uploads), the commands are callback buttons.
import { joinSubject } from "./native-card.js";
import { STATES, STATE_NOTES } from "./native-card.js";
import { normalizePayment } from "./card.js";

const LIVE = new Set(["pending", "active"]);

/** Channels that get the 「电脑」 card (picture + 接管 / 完成 / 跳过) instead of the plain link card. */
export const NATIVE_CARD_CHANNELS = ["feishu", "telegram", "dingtalk-connector", "wecom"];

/** Channels whose card the plugin can rewrite at any time (the others: see setCardState). */
export const EDITABLE_CARD_CHANNELS = ["feishu", "telegram"];

/**
 * Whether a chat platform's servers can fetch this picture url: https, a
 * hostname (not an IP literal), not localhost. VLab's tailnet address is not.
 */
export function isPublicImageUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.replace(/^\[|\]$/gu, "");
  return parsed.protocol === "https:" && host !== "localhost" && !host.endsWith(".localhost") && !/^[\d.]+$/u.test(host) && !host.includes(":");
}

function statusOf({ state, kind }) {
  return STATES[kind === "watch" && state === "pending" ? "watch" : state] ?? STATES.pending;
}

function paymentLine(view) {
  const pay = view.purpose === "payment" ? normalizePayment(view.payment) : null;
  if (!pay) return null;
  const parts = [pay.item, pay.amount && `${pay.amount}${pay.currency ? ` ${pay.currency}` : ""}`, pay.merchant].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

const subjectOf = (view) => view.subject ?? "V 的电脑";

function takeLabel(view) {
  return view.kind === "watch" ? "观看" : view.purpose === "payment" ? "付款" : "接管";
}

/** The note under the reason: what to do now (pending) or what happened. */
export function cardNote(view, state) {
  if (state === "pending") {
    const minutes = view.openWithinMinutes ? `${view.openWithinMinutes} 分钟内打开有效` : "";
    if (view.kind === "watch") return `点「观看」${joinSubject("看", subjectOf(view))}，只能看不能操作。${minutes ? `${minutes}。` : ""}`;
    const what = view.purpose === "payment" ? "核对金额后自己填写支付信息并确认付款" : "直接操作";
    return `点「${takeLabel(view)}」${joinSubject("打开", subjectOf(view))}${/[A-Za-z0-9]$/u.test(subjectOf(view)) ? " " : ""}${what}，做完点「完成」，V 接着做；不需要就点「跳过」。${minutes ? `${minutes}。` : ""}`;
  }
  // Feishu's note names its 「我完成了」 button; here the button is 「完成」.
  if (state === "active") return `${joinSubject("你在操作", subjectOf(view))}。做完点「完成」，V 接着做。`;
  return STATE_NOTES[state] ?? "";
}

/** What the agent is told after a card is posted; the hand-back button is 我完成了 on Feishu and 完成 elsewhere. */
export function nativeCardInstruction(channel, { cardTitle = "电脑", machine = "V's desktop" } = {}) {
  const done = channel === "feishu" ? "我完成了" : "完成";
  return `A card titled ${cardTitle} with three buttons has been posted in this conversation: 接管 (the user takes over ${machine}), ${done} (hands it back) and 跳过 (the user will not do this step). Do NOT repeat or paraphrase the url and do not say where the card is. Reply with one short sentence such as 卡片已发出，接管后完成登录，做完点「${done}」, then end your turn. When \`/v-handback <id>\` arrives, or a message saying the user pressed 交还给 V on the takeover page, the desktop is already back with you: continue the task right away without asking. When \`/v-skip <id>\` arrives, the user skipped this step: do not issue another handoff for it; say briefly what you can do instead or where the task is blocked. If the user instead says in the chat that they are done (e.g. 好了), call desktop_handoff_status, then continue.`;
}

/** Buttons for a state: `{label, url}` opens the desktop, `{label, command}` posts the command. */
export function cardButtons(view, state) {
  const id = view.handoffId;
  if (view.kind === "watch") {
    return LIVE.has(state) && view.url ? [{ label: "观看", url: view.url }] : [];
  }
  if (state === "pending") {
    return [
      ...(view.url ? [{ label: takeLabel(view), url: view.url }] : []),
      { label: "完成", command: `/v-handback ${id}` },
      { label: "跳过", command: `/v-skip ${id}` },
    ];
  }
  if (state === "active") {
    return [{ label: "完成", command: `/v-handback ${id}` }, ...(view.url ? [{ label: "回到电脑", url: view.url }] : [])];
  }
  return [];
}

/**
 * The card as a presentation for `openclaw message send --presentation`
 * (DingTalk) or the Gateway's message.action (WeCom), and the message text
 * (the reason). `imageRef`: `https://…` or `file:///…/v-desktop-handoff-….jpg`.
 */
export function handoffPresentation(view, state = "pending", { imageRef } = {}) {
  const status = statusOf({ state, kind: view.kind });
  const title = `${view.purpose === "payment" ? "付款" : view.cardTitle ?? "电脑"} · ${status.tag}`;
  const reason = String(view.reason ?? "").trim().slice(0, 300) || `${joinSubject("V 需要你接管", subjectOf(view))}。`;
  const blocks = [];
  const pay = paymentLine(view);
  if (pay) blocks.push({ type: "text", text: pay });
  const note = cardNote(view, state);
  if (note) blocks.push({ type: "context", text: note });
  if (imageRef) blocks.push({ type: "text", text: `![${subjectOf(view)}](${imageRef})` });
  const buttons = cardButtons(view, state).map((b, i) => (b.url ? { label: b.label, url: b.url, ...(i === 0 ? { style: "primary" } : {}) } : { label: b.label, value: b.command }));
  if (buttons.length) blocks.push({ type: "buttons", buttons });
  return { presentation: { title, tone: view.purpose === "payment" ? "warning" : "info", blocks }, text: reason };
}

const escapeHtml = (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The Telegram card: caption (HTML, ≤ 1024 characters) and inline keyboard.
 * `urlButtons: false` when Telegram refuses the desktop link as a button
 * (BUTTON_URL_INVALID: not a public address, e.g. VLab's tailnet IP): the
 * link is then spelled out in the caption.
 */
export function telegramHandoffCard(view, state = "pending", { urlButtons = true } = {}) {
  const status = statusOf({ state, kind: view.kind });
  const parts = [`<b>${view.purpose === "payment" ? "付款" : escapeHtml(view.cardTitle ?? "电脑")}</b> · ${escapeHtml(status.tag)}`];
  const reason = String(view.reason ?? "").trim().slice(0, 300);
  if (reason) parts.push(escapeHtml(reason));
  const pay = paymentLine(view);
  if (pay) parts.push(`<b>${escapeHtml(pay)}</b>`);
  const note = cardNote(view, state);
  if (note) parts.push(`<i>${escapeHtml(note)}</i>`);
  const buttons = cardButtons(view, state);
  if (!urlButtons) {
    const link = buttons.find((b) => b.url);
    if (link) parts.push(`${escapeHtml(link.label)}：${escapeHtml(link.url)}`);
  }
  const row = buttons.filter((b) => urlButtons || !b.url).map((b) => (b.url ? { text: b.label, url: b.url } : { text: b.label, callback_data: b.command }));
  return { caption: parts.join("\n\n").slice(0, 1024), replyMarkup: { inline_keyboard: row.length ? [row] : [] } };
}
