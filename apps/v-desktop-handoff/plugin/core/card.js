// Feishu card for a handoff link: the link sits behind a button instead of
// being pasted as a bare url. Rendered by `openclaw message send --presentation`
// (the same path Night Shift uses for its completion cards).

const text = (value, max = 200) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Purchase details the agent reports for a payment handoff. All optional; shown only when present. */
export function normalizePayment(payment) {
  if (!payment || typeof payment !== "object") {
    return null;
  }
  const out = {
    item: text(payment.item, 120),
    amount: text(payment.amount, 40),
    currency: text(payment.currency, 12),
    merchant: text(payment.merchant, 80),
  };
  return out.item || out.amount || out.merchant ? out : null;
}

/**
 * `callbacks: false` for channels that cannot post a button back (DingTalk,
 * WeCom): no 交还给 V button, the steps ask for a 好了 in the chat instead.
 */
export function handoffCard({ purpose = "login", kind = "control", reason, url, openWithinMinutes, sessionMinutes, payment, handoffId, callbacks = true }) {
  const pay = purpose === "payment" ? normalizePayment(payment) : null;
  const watch = kind === "watch";
  const title = watch
    ? "V 的桌面 · 只看"
    : purpose === "payment"
      ? `付款确认${pay?.merchant ? ` · ${pay.merchant}` : ""}`
      : "需要你接管 V 的电脑";
  // The Feishu channel renders the message text as the card body, above the
  // blocks. So the body carries the reason and purchase details, the blocks
  // carry the steps and the button, and the raw url appears only in `fallback`.
  const body = [];
  const why = text(reason, 300);
  if (why) {
    body.push(`**${why}**`);
  }
  if (pay) {
    if (pay.item) body.push(`商品：${pay.item}`);
    if (pay.amount) body.push(`金额：**${pay.amount}${pay.currency ? ` ${pay.currency}` : ""}**`);
    if (pay.merchant) body.push(`商户：${pay.merchant}`);
  }
  const done = callbacks ? "点「交还给 V」" : "在聊天里回复「好了」";
  const steps = watch
    ? `${openWithinMinutes} 分钟内打开，只能观看，不能点击或输入。`
    : purpose === "payment"
      ? `点「付款」打开 V 的电脑，核对金额后自己填写支付信息并确认付款，V 不会替你输入卡号。付完${done}，V 接着做。${openWithinMinutes} 分钟内打开有效，接管最长 ${sessionMinutes} 分钟。`
      : `点「接管电脑」打开 V 的电脑直接操作，做完${done}，V 接着做。${openWithinMinutes} 分钟内打开有效，接管最长 ${sessionMinutes} 分钟。`;
  const buttons = [{ label: watch ? "观看桌面" : purpose === "payment" ? "付款" : "接管电脑", style: "primary", url }];
  if (!watch && handoffId && callbacks) {
    // A Feishu callback button: posts /v-handback as the clicking user, handled by this plugin.
    buttons.push({ label: "交还给 V", value: `/v-handback ${handoffId}` });
  }
  const blocks = [
    { type: "context", text: steps },
    { type: "buttons", buttons },
  ];
  const cardText = body.length ? body.join("\n") : title;
  const fallback = [title, ...body, url, steps].join("\n");
  return { presentation: { title, tone: purpose === "payment" ? "warning" : "info", blocks }, text: cardText, fallback };
}

/**
 * Channels that render the plain card: Feishu and Telegram (URL button +
 * callback button), DingTalk (actionCard) and WeCom (text_notice template
 * card) through V's v-experience channel patches, link button only.
 */
export const DEFAULT_CARD_CHANNELS = ["feishu", "telegram", "dingtalk-connector", "wecom"];

/** Channels whose cards can carry the 交还给 V callback button. */
export const CALLBACK_CARD_CHANNELS = ["feishu", "telegram"];

/**
 * Channels whose robot connection lives in the Gateway (outbound deliveryMode
 * "gateway"): `openclaw message send` flattens a card to text on its way
 * there, so the card goes through the Gateway's message.action instead.
 */
export const GATEWAY_ACTION_CHANNELS = ["wecom"];

/**
 * Where to post the card in place: the conversation the request came from.
 * Returns null when there is no channel conversation (CLI, webchat) or the
 * channel does not render cards.
 */
export function inPlaceTarget(context = {}, config = {}) {
  const channel = typeof context.messageChannel === "string" ? context.messageChannel.trim() : "";
  const to = typeof context.deliveryContext?.to === "string" ? context.deliveryContext.to.trim() : "";
  const channels = Array.isArray(config.cardChannels) ? config.cardChannels : DEFAULT_CARD_CHANNELS;
  if (!channel || !to || !channels.includes(channel)) {
    return null;
  }
  const accountId = typeof context.deliveryContext?.accountId === "string" ? context.deliveryContext.accountId : undefined;
  const thread = context.deliveryContext?.threadId;
  const threadId = typeof thread === "number" || (typeof thread === "string" && /^\d+$/u.test(thread)) ? Number(thread) : undefined;
  return { channel, target: to, accountId, ...(threadId ? { threadId } : {}) };
}
