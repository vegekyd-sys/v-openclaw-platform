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
  if (["queued", "delivering", "running", "replying"].includes(last.status)) return "进行中";
  if (last.status === "failed" || last.status === "interrupted") return "中断";
  return "已完成";
}

/** Chat names on the one-line title are cut so the line does not wrap on a phone. */
function shortName(label, max = 10) {
  const chars = [...String(label ?? "")];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
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
 * Feishu card 2.0: one collapsed line 「A ⇄ B · 已完成 · 4 条」 with the chat names;
 * opening it shows the two V's talking, each message headed 「V · 群名」. Patched in place.
 */
export function threadCard(records) {
  const first = records[0];
  const chats = [...new Set(records.flatMap((r) => [r.from.label, r.to.label]))];
  const entries = threadEntries(records);
  const title = `**${chats.map((c) => escapeMd(shortName(c))).join("** ⇄ **")}** · ${threadStatus(records)}${entries.length ? ` · ${entries.length} 条` : ""}`;
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
    config: { update_multi: true, summary: { content: `${chats.join(" ⇄ ")} · ${threadStatus(records)}` } },
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

// Guidance added to the native sessions_send turns (before_prompt_build). The two V's
// take turns: whatever the target replies goes back to the requester; the requester
// either answers (another sessions_send to the same session, same thread) or, when the
// target delivered, finishes with the people it works for. Anyone may start a thread;
// the receiving V decides, under its redlines, whether to do it here.
export function requestGuidance({ from, requester, chainId, id }) {
  const followUp = chainId && chainId !== id;
  const who = requester ? `${requester} (in 「${from.label}」)` : `the V in 「${from.label}」 on its own initiative`;
  return [
    followUp
      ? `The V in 「${from.label}」 is answering you in an exchange that started earlier. Pick up where you left off.`
      : `The V in 「${from.label}」 sent this to your conversation through sessions_send. It was asked for by ${who}.`,
    "Decide as you would if that person asked here: use this conversation's own context, follow your redlines, and remember your reply goes back to the other chat and its members. If it should not be done, or not shared there, say so briefly instead.",
    `Your final reply in this turn goes back to 「${from.label}」 automatically: you are talking with the V over there. People in both chats see the exchange folded in one card, not as separate messages.`,
    `If you need information or a decision from 「${from.label}」 to do this well, ask for it in your reply, short and specific, and end the turn; the answer will come back here. Do not guess what only they know.`,
    "When the work is done, reply with the result: what you did, what you found, what is still open.",
  ].join("\n");
}

export function resultGuidance({ to, message }) {
  return [
    `This is the reply of the V in 「${to.label}」 to what you sent it with sessions_send. You had sent: ${clip(message, 600)}`,
    "People here see your exchange with it folded in one card; your own text in this turn is only posted here when you do not send to it again.",
    `If it asks you something or needs input you or this conversation can provide, answer it: call sessions_send with sessionKey ${JSON.stringify(to.sessionKey)} and your answer, and end with one short line. You are coordinating with it, not reporting every step.`,
    "If it needs a decision only the people here can make, ask them here instead of guessing.",
    "If it delivered the result, finish the task for the people here: write what they should read (the result and what it means, or the next step). Do not mention sessions_send or the relay.",
  ].join("\n");
}

/** Same words as the core patch, for the wake the plugin issues itself (after a restart, or a steered send). */
export const RESULT_EXTRA_SYSTEM_PROMPT =
  "Another session returned the result of your earlier sessions_send request. Continue the work it was for. This result is delivered once; your response will not be sent back to the target session.";

export function failureTurn({ id, to, message, reason }) {
  return {
    message: `${speaker(to)} 没能完成你交给它的事（${reason}）。`,
    extraSystemPrompt: `What you sent to 「${to.label}」 with sessions_send (${id}) did not come back: ${reason}. What you sent: ${clip(message, 600)}. Tell the people here briefly and decide whether to retry, do it here, or ask them.`,
  };
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
