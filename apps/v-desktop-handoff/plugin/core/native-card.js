// The handoff card as a native Feishu card (schema 2.0): header 「电脑」 with a
// status tag, the reason, a picture (V's cover or a desktop screenshot), and
// 接管 / 我完成了 / 跳过. The same card is patched as the state changes, so the
// buttons on screen are always the ones that make sense now.

const plain = (content) => ({ tag: "plain_text", content });

/** Callback envelope understood by OpenClaw's Feishu channel: posts `command` as the clicking user. */
export function quickCommand(command, { userOpenId, expiresAt } = {}) {
  const c = {};
  if (userOpenId) c.u = userOpenId;
  if (Number.isFinite(expiresAt)) c.e = expiresAt;
  return { oc: "ocf1", k: "quick", a: "feishu.payload.button", q: command, ...(Object.keys(c).length ? { c } : {}) };
}

const STATES = {
  pending: { tag: "需要操作", color: "orange" },
  active: { tag: "操作中", color: "blue" },
  done: { tag: "已完成", color: "green" },
  skipped: { tag: "已跳过", color: "neutral" },
  ended: { tag: "已结束", color: "neutral" },
  watch: { tag: "可观看", color: "blue" },
};

function button(label, type, { url, command, owner } = {}) {
  const behaviors = [];
  if (url) behaviors.push({ type: "open_url", default_url: url });
  if (command) behaviors.push({ type: "callback", value: quickCommand(command, owner) });
  return { tag: "button", text: plain(label), type, size: "medium", behaviors };
}

function row(left, right) {
  const columns = left.map((b) => ({ tag: "column", width: "auto", vertical_align: "center", elements: [b] }));
  columns.push({ tag: "column", width: "weighted", weight: 1, horizontal_align: "right", vertical_align: "center", elements: right ? [right] : [] });
  return { tag: "column_set", flex_mode: "none", horizontal_spacing: "8px", columns };
}

/**
 * @param state pending | active | done | skipped | ended
 * @param kind control | watch
 * @param purpose login | payment
 */
export function nativeHandoffCard({ state = "pending", kind = "control", purpose = "login", reason, url, imageKey, qrImageKey, handoffId, payment, owner, note }) {
  const status = STATES[kind === "watch" && state === "pending" ? "watch" : state] ?? STATES.pending;
  const elements = [];
  const lines = [];
  if (reason) lines.push(String(reason).slice(0, 300));
  if (purpose === "payment" && payment) {
    const parts = [payment.item, payment.amount && `**${payment.amount}${payment.currency ? ` ${payment.currency}` : ""}**`, payment.merchant].filter(Boolean);
    if (parts.length) lines.push(parts.join(" · "));
  }
  const notes =
    purpose === "payment"
      ? {
          pending: qrImageKey ? "用支付宝 / 微信扫下面的码付款，或点「付款」在 V 的电脑上付。付完点「我完成了」，V 去核对订单。" : "点「付款」在 V 的电脑上完成支付（V 不会替你输入卡号或密码）。付完点「我完成了」，V 去核对订单。",
          active: "你在 V 的电脑上付款。付完点「我完成了」，V 去核对订单。",
          done: "你已付款，V 去核对订单。",
          skipped: "这单不付了，V 不会再继续支付。",
          ended: "这次付款已经结束。",
        }
      : {
          active: "你在操作 V 的电脑。做完点「我完成了」，V 接着做。",
          done: "已交还给 V，V 接着做。",
          skipped: "你跳过了这一步，V 会换个办法或告诉你卡在哪。",
          ended: "这次接管已经结束。",
        };
  if (note ?? notes[state]) lines.push(`<font color='grey'>${note ?? notes[state]}</font>`);
  elements.push({ tag: "markdown", content: lines.join("\n") || "V 需要你接管电脑。" });
  // A payment QR replaces the screenshot while the card waits: big enough to scan from a phone.
  if (purpose === "payment" && qrImageKey && (state === "pending" || state === "active")) {
    elements.push({ tag: "img", img_key: qrImageKey, alt: plain("付款二维码"), scale_type: "fit_horizontal", corner_radius: "8px", preview: true });
  } else if (imageKey) {
    const img = { tag: "img", img_key: imageKey, alt: plain("V 的电脑"), scale_type: "fit_horizontal", corner_radius: "8px", preview: false };
    const open = url && (state === "pending" || state === "active");
    // Tapping the picture opens the desktop, like 接管.
    elements.push(open ? { tag: "interactive_container", width: "fill", corner_radius: "8px", has_border: false, padding: "0px", behaviors: [{ type: "open_url", default_url: url }], elements: [img] } : img);
  }
  const takeLabel = kind === "watch" ? "观看" : purpose === "payment" ? "付款" : "接管";
  if (kind === "watch" && (state === "pending" || state === "active")) {
    elements.push(row([button(takeLabel, "primary_filled", { url })]));
  } else if (state === "pending") {
    elements.push(
      row(
        [
          // Link only: Feishu mobile runs just the callback of a button that has both, so the
          // desktop never opened. The card turns 操作中 from the plugin's watcher instead.
          button(takeLabel, "primary_filled", { url }),
          button("我完成了", "default", { command: `/v-handback ${handoffId}`, owner }),
        ],
        button("跳过", "text", { command: `/v-skip ${handoffId}`, owner }),
      ),
    );
  } else if (state === "active") {
    elements.push(
      row([button("我完成了", "primary_filled", { command: `/v-handback ${handoffId}`, owner }), button("回到电脑", "default", { url })]),
    );
  }
  return {
    schema: "2.0",
    config: { update_multi: true },
    header: {
      title: plain(purpose === "payment" ? "付款" : "电脑"),
      text_tag_list: [{ tag: "text_tag", text: plain(status.tag), color: status.color }],
      template: "default",
    },
    body: { elements },
  };
}
