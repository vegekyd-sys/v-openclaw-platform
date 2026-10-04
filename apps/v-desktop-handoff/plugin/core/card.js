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

export function handoffCard({ purpose = "login", kind = "control", reason, url, openWithinMinutes, sessionMinutes, payment, handoffId }) {
  const pay = purpose === "payment" ? normalizePayment(payment) : null;
  const watch = kind === "watch";
  const title = watch
    ? "V 的桌面 · 只看"
    : purpose === "payment"
      ? `付款确认${pay?.merchant ? ` · ${pay.merchant}` : ""}`
      : "V 需要你接管浏览器";
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
  const steps = watch
    ? `${openWithinMinutes} 分钟内打开，只能观看，不能点击或输入。`
    : purpose === "payment"
      ? `点「付款」打开 V 的电脑，核对金额后自己填写支付信息并确认付款，V 不会替你输入卡号。付完点「交还给 V」，V 接着做。${openWithinMinutes} 分钟内有效，接管最长 ${sessionMinutes} 分钟。`
      : `点「接管电脑」打开 V 的电脑直接操作，做完点「交还给 V」，V 接着做。${openWithinMinutes} 分钟内有效，接管最长 ${sessionMinutes} 分钟。`;
  const buttons = [{ label: watch ? "观看桌面" : purpose === "payment" ? "付款" : "接管电脑", style: "primary", url }];
  if (!watch && handoffId) {
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
 * Channels that render the plain card's buttons: Feishu, and Telegram (URL
 * button + callback button). DingTalk and WeCom flatten it to text, so there
 * the link goes into V's reply instead.
 */
export const DEFAULT_CARD_CHANNELS = ["feishu", "telegram"];

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
  return { channel, target: to, accountId };
}
