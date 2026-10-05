// What people and the two V's see. People see one collapsed card per thread,
// 「V · A ⇄ V · B」, that opens to the two V's exchange (like Grok Bot's bot-to-bot
// handoffs). Each V sees the other's message headed 「V · 群名」 plus a short system
// note about what the turn is.

const MAX_FOLDED = 2_800;

function clip(text, max = MAX_FOLDED) {
  const s = String(text ?? "").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function escapeMd(text) {
  return String(text ?? "").replace(/[*_`<>[\]]/gu, (c) => `\\${c}`);
}

const ENTRY_MAX = 1_500;
const CARD_BUDGET = 24_000; // Feishu rejects cards near 30 KB

function shanghaiTime(ms) {
  return ms ? new Date(ms).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
}

/** Who speaks for a conversation: its V, named after the chat, like 「V · Chief of staff」. */
export function speaker(side) {
  return `${side?.name ?? "V"} · ${side?.label ?? "?"}`;
}

function threadStatus(records) {
  const last = records.at(-1);
  if (!last) {
    return "";
  }
  if (last.status === "queued" || last.status === "delivering") return `正在交给 ${speaker(last.to)}…`;
  if (last.status === "running") return `${speaker(last.to)} 正在处理…`;
  if (last.status === "replying") return `${speaker(last.from)} 正在处理…`;
  if (last.status === "failed" || last.status === "interrupted") return "中断";
  return "已完成";
}

/** What was said in a thread, in order: [{ label, text, at }]. */
export function threadEntries(records) {
  const entries = [];
  for (const r of [...records].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))) {
    entries.push({ label: speaker(r.from), text: r.message, at: r.createdAt });
    if (r.reply) entries.push({ label: speaker(r.to), text: r.reply, at: r.finishedAt });
    if (r.error) entries.push({ label: speaker(r.to), text: `（${r.error}）`, at: r.updatedAt });
  }
  return entries;
}

/**
 * Feishu card 2.0: one collapsed line 「A ⇄ B · 已完成 · 4 条」; opening it shows the
 * two V's talking, each message headed by its conversation's name. Patched in place.
 */
export function threadCard(records) {
  const first = records[0];
  const names = [...new Set(records.flatMap((r) => [speaker(r.from), speaker(r.to)]))];
  const entries = threadEntries(records);
  // Two lines: who is talking, then where the thread is.
  const title = `**${names.map(escapeMd).join("** ⇄ **")}**\n${threadStatus(records)}${entries.length ? ` · ${entries.length} 条` : ""}`;
  let budget = CARD_BUDGET;
  const rows = [];
  for (const entry of [...entries].reverse()) {
    const content = `<font color='grey'>${escapeMd(entry.label)} · ${shanghaiTime(entry.at)}</font>\n${clip(entry.text, ENTRY_MAX)}`;
    budget -= content.length * 3; // UTF-8 upper bound for CJK
    if (budget < 0) {
      rows.unshift({ tag: "markdown", content: "<font color='grey'>…更早的消息略</font>", text_size: "notation" });
      break;
    }
    rows.unshift({ tag: "markdown", content, margin: "12px 0px 0px 0px" });
  }
  return {
    schema: "2.0",
    config: { update_multi: true, summary: { content: `${names.join(" ⇄ ")} · ${threadStatus(records)}` } },
    body: {
      elements: [
        {
          tag: "collapsible_panel",
          element_id: `thread_${String(first?.chainId ?? "x").replace(/\W/gu, "").slice(0, 16)}`,
          expanded: false,
          header: {
            title: { tag: "markdown", content: `<font color='grey'>${title}</font>`, text_align: "center", text_size: "notation" },
            width: "fill",
            vertical_align: "center",
            icon: { tag: "standard_icon", token: "down-small-ccm_outlined", size: "16px 16px", color: "grey" },
            icon_position: "follow_text",
            icon_expanded_angle: -180,
          },
          elements: rows.length ? rows : [{ tag: "markdown", content: "<font color='grey'>还没有消息</font>" }],
        },
      ],
    },
  };
}

/** What the origin V says to the people there once a thread is over. */
export function finalMessageCard(text) {
  return { schema: "2.0", config: { update_multi: true }, body: { elements: [{ tag: "markdown", content: clip(text, 6_000) }] } };
}

// The two V's take turns in one thread: whatever the target replies goes back to the
// origin; the origin either answers (another relay to the same target, same chain)
// or, when the target delivered, continues with the owner.
export function requestTurn({ id, from, message, chainId }) {
  const followUp = chainId && chainId !== id;
  return {
    message: `${speaker(from)}：\n\n${message}`,
    extraSystemPrompt: [
      followUp
        ? `The V in 「${from.label}」 is answering you in a task the owner handed to this conversation earlier (thread ${chainId}). Pick up where you left off.`
        : `The V in 「${from.label}」 handed this task to this conversation on the owner's behalf (session relay thread ${chainId ?? id}). Treat it as the owner asking here and use this conversation's own context.`,
      `Everything you reply in this turn is sent back to 「${from.label}」 automatically: you are talking with the V over there. People in both chats see the exchange folded in one 「${from.label} ⇄ this conversation」 card, not as separate messages.`,
      `If you need information or a decision from 「${from.label}」 to do this well, ask for it in your reply, short and specific, and end the turn; the answer will arrive here as a new message. Do not guess what only they know.`,
      "When the work is done, reply with the result: what you did, what you found, what is still open.",
      "Do not relay to any other conversation from this turn.",
    ].join("\n"),
  };
}

export function resultTurn({ id, to, message, reply, chainId }) {
  return {
    message: `${speaker(to)}：\n\n${reply}`,
    extraSystemPrompt: [
      `You handed work to 「${to.label}」 (session relay thread ${chainId ?? id}); the message above is the reply of the V there. Your last message to it: ${clip(message, 600)}`,
      "People here see your exchange with it folded in one card; your own text in this turn is only posted here when you do not relay again.",
      `If it asks you something or needs input you or this conversation can provide, answer it: call session_relay_send with target 「${to.label}」 and your answer, and end with one short line. You are coordinating with it, not reporting every step.`,
      "If it needs a decision only the owner can make, ask the owner here instead of guessing (that text is posted here).",
      "If it delivered the result, finish the owner's task: write what you want the owner to read here (the result and what it means, or the next step). Do not mention the relay mechanics.",
    ].join("\n"),
  };
}

export function failureTurn({ id, to, message, reason }) {
  return {
    message: `${speaker(to)} 没能完成你交给它的事（${reason}）。`,
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
