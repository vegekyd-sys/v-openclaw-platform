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

const SHOW_INLINE = 600;

/**
 * Feishu card 2.0: a centred grey 「消息来自」 line, then what the other side said.
 * Short messages are shown as they are, so the exchange between the two V's can be
 * read in the chat; long ones show the opening and fold the rest.
 */
export function attributionCard({ label, folded, foldedTitle = "查看全文" }) {
  const elements = [
    {
      tag: "markdown",
      content: `<font color='grey'>消息来自 **${escapeMd(label)}**</font>`,
      text_align: "center",
      text_size: "notation",
    },
  ];
  const body = String(folded ?? "").trim();
  if (body && body.length <= SHOW_INLINE) {
    elements.push({ tag: "markdown", content: body });
  } else if (body) {
    elements.push({ tag: "markdown", content: `${body.slice(0, 160).trim()}…` });
    elements.push({
      tag: "collapsible_panel",
      expanded: false,
      header: {
        title: { tag: "markdown", content: `<font color='grey'>${foldedTitle}</font>`, text_align: "center" },
        width: "fill",
        vertical_align: "center",
        icon: { tag: "standard_icon", token: "down-small-ccm_outlined", size: "16px 16px" },
        icon_position: "follow_text",
        icon_expanded_angle: -180,
      },
      elements: [{ tag: "markdown", content: clip(body) }],
    });
  }
  return { schema: "2.0", config: { update_multi: true }, body: { elements } };
}

// The two V's take turns in one thread: whatever the target replies goes back to the
// origin; the origin either answers (another relay to the same target, same chain)
// or, when the target delivered, continues with the owner.
export function requestTurn({ id, from, message, chainId }) {
  const followUp = chainId && chainId !== id;
  return {
    message: `消息来自「${from.label}」：\n\n${message}`,
    extraSystemPrompt: [
      followUp
        ? `「${from.label}」 is answering you in a task the owner handed to this conversation earlier (thread ${chainId}). Pick up where you left off.`
        : `「${from.label}」 handed this task to this conversation on the owner's behalf (session relay thread ${chainId ?? id}). Treat it as the owner asking here and use this conversation's own context.`,
      `Everything you reply in this turn is posted here and sent back to 「${from.label}」 automatically, so you are talking with the V over there.`,
      `If you need information or a decision from 「${from.label}」 to do this well, ask for it in your reply, short and specific, and end the turn; the answer will arrive here as a new message. Do not guess what only they know.`,
      "When the work is done, reply with the result: what you did, what you found, what is still open.",
      "Do not relay to any other conversation from this turn.",
    ].join("\n"),
  };
}

export function resultTurn({ id, to, message, reply, chainId }) {
  return {
    message: `「${to.label}」回复了：\n\n${reply}`,
    extraSystemPrompt: [
      `You handed work to 「${to.label}」 (session relay thread ${chainId ?? id}); the message above is its reply. Your last message to it: ${clip(message, 600)}`,
      "People here already see its message in a 「消息来自」 card, so do not paste it again.",
      `If it asks you something or needs input you or this conversation can provide, answer it: call session_relay_send with target 「${to.label}」 and your answer, then say in one short line here what you told it. You are coordinating with it, not reporting every step.`,
      "If it needs a decision only the owner can make, ask the owner here instead of guessing.",
      "If it delivered the result, continue the owner's task: say what came back and what it means, or take the next step.",
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
