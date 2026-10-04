// What people and the two V's see. People see a small grey 「消息来自 …」 line (the
// content folded under it) and then V's normal reply, like Grok Bot's handoff
// divider. The model sees the request/result as a plain message plus a short
// system note about what the turn is.

const MAX_FOLDED = 2_800;

function clip(text, max = MAX_FOLDED) {
  const s = String(text ?? "").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function escapeMd(text) {
  return String(text ?? "").replace(/[*_`<>[\]]/gu, (c) => `\\${c}`);
}

/** Feishu card 2.0: one centred grey attribution line, the content folded under it. */
export function attributionCard({ label, folded, foldedTitle = "查看内容" }) {
  const elements = [
    {
      tag: "markdown",
      content: `<font color='grey'>消息来自 **${escapeMd(label)}**</font>`,
      text_align: "center",
      text_size: "notation",
    },
  ];
  if (folded && String(folded).trim()) {
    elements.push({
      tag: "collapsible_panel",
      expanded: false,
      header: {
        title: { tag: "markdown", content: `<font color='grey'>${foldedTitle}</font>` },
        vertical_align: "center",
        icon: { tag: "standard_icon", token: "down-small-ccm_outlined", size: "16px 16px" },
        icon_position: "right",
        icon_expanded_angle: -180,
      },
      elements: [{ tag: "markdown", content: clip(folded), text_size: "notation" }],
    });
  }
  return { schema: "2.0", config: { update_multi: true }, body: { elements } };
}

export function requestTurn({ id, from, message }) {
  return {
    message: `消息来自「${from.label}」：\n\n${message}`,
    extraSystemPrompt: [
      `This turn was relayed to this conversation from 「${from.label}」 by the owner through V's session relay (${id}). Treat it as the owner asking here.`,
      "Do the work in this conversation, with this conversation's context. People here see a small 「消息来自」 note above your reply.",
      `Your final reply in this turn is posted here and automatically returned to 「${from.label}」, so make it the result (what you did, what you found, what is still open), not a promise to do it later.`,
      "Do not relay this task to yet another conversation from this turn.",
    ].join("\n"),
  };
}

export function resultTurn({ id, to, message, reply }) {
  return {
    message: `「${to.label}」回复了：\n\n${reply}`,
    extraSystemPrompt: [
      `This turn carries the result of work you relayed to 「${to.label}」 (${id}). What you asked: ${clip(message, 600)}`,
      "People here already see 「消息来自」 with the raw result folded under it. Continue what you were doing before you relayed it: use the result, take the next step, or tell the user what came back and what it means. Do not paste the result again verbatim.",
    ].join("\n"),
  };
}

export function failureTurn({ id, to, message, reason }) {
  return {
    message: `「${to.label}」没能完成你交给它的事（${reason}）。`,
    extraSystemPrompt: `Work you relayed to 「${to.label}」 (${id}) did not come back: ${reason}. What you asked: ${clip(message, 600)}. Tell the user briefly and decide whether to retry, do it here, or ask them.`,
  };
}

export function sentInstruction(label) {
  return `已交给「${label}」。用一句很短的话告诉用户（例如：已经让「${label}」去做了），然后结束本轮。「${label}」做完后结果会作为一条新消息回到这里并唤醒你，那时再继续。不要等待、轮询，也不要自己再做一遍。`;
}

/** Text of the last assistant message in a sessions.get message list. */
export function lastAssistantText(messages, { after = 0 } = {}) {
  for (const msg of [...(Array.isArray(messages) ? messages : [])].reverse()) {
    if (!msg || typeof msg !== "object" || msg.role !== "assistant") {
      continue;
    }
    const at = Number(msg.timestamp ?? msg.createdAt ?? msg.ts ?? 0);
    if (after && at && at < after) {
      return null;
    }
    const content = msg.content;
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.filter((p) => p && p.type === "text" && typeof p.text === "string").map((p) => p.text).join("\n")
          : "";
    if (text.trim()) {
      return text.trim();
    }
  }
  return null;
}
