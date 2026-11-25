// The text of the turns the bridge starts in the session that brought V into the meeting.
// Accepted in the 2026-11-18 live test (V｜会议体验打通｜1117): no wake word, full V decides,
// NO_REPLY for everything not worth saying. Progress and screenshots are V's own tools.

export const SILENT_REPLIES = new Set(["NO_REPLY", "NO_REPLY.", "NO_REPLY。"]);

export function isSilent(text) {
  const t = String(text ?? "").trim();
  return t === "" || SILENT_REPLIES.has(t);
}

// Where a reply stops being V talking: role tags, a forged next bridge turn, or the "turn limit"
// notice the model invented itself (2026-11-23/25, deepseek-flash: 52 such notices posted into
// a customer meeting). No real component of OpenClaw or this plugin ever emits any of these.
const LEAK_MARKERS = [
  /<\/?(?:system|user|assistant|tool)\b[^>]*>/iu,
  /<\|[a-z_]+\|>/iu,
  /\[会议桥接\s*·/u,
  /Meeting turn limit/iu,
];
const LEADING_SILENT = /^NO_REPLY\b/iu;
const TRAILING_SILENT = /(?:\s|^)NO_REPLY[.。]?\s*$/iu;

/**
 * The part of a model reply that may go into the meeting. Returns { text: null } when nothing should
 * be sent: empty, NO_REPLY (also when the model kept writing after it), or only leaked scaffolding.
 * `reason` says why text was cut, for v_turns.jsonl.
 */
export function cleanReply(raw) {
  let t = String(raw ?? "").trim();
  if (!t) return { text: null, reason: null };
  if (LEADING_SILENT.test(t)) return { text: null, reason: t.length > 12 ? "text-after-no-reply" : null };
  let reason = null;
  let cut = t.length;
  for (const re of LEAK_MARKERS) {
    const m = re.exec(t);
    if (m && m.index < cut) cut = m.index;
  }
  if (cut < t.length) { t = t.slice(0, cut).trim(); reason = "leaked-scaffolding"; }
  if (TRAILING_SILENT.test(t)) { t = t.replace(TRAILING_SILENT, "").trim(); reason ??= "trailing-no-reply"; }
  // What is left after a cut may be only an emoji or punctuation ("⚠️"): nothing worth sending.
  if (!t || isSilent(t) || !/[\p{L}\p{N}]/u.test(t)) return { text: null, reason };
  return { text: t, reason };
}

export function turnPrompt({ meetingId, lines, pace }) {
  return `[会议桥接 · meeting_id=${meetingId}] 你（V）正以参会者身份在飞书会议里，只能在会议聊天区打字，没有语音。
下面是会议里刚出现的新内容（字幕常把 V 识别成 B、微、薇、威、维等同音字）。不需要别人喊名字：
- 有人在问你、跟你说话、让你做事，或者你能对正在讨论的问题给出有价值的信息 → 直接回复要发到会议聊天区的内容，口语、简短（一般 1–3 句）。需要查资料或用工具就直接去做，做完给结论。
- 要做的事超过几秒（查资料、跑命令、看文件），先调用 meeting_say 说一句你在做什么（如"我去翻一下最近合入的 PR"），再去做；做完的结论仍然作为本轮回复。
- 别人提到屏幕、共享、白板、"你看这个"时，可以调用 meeting_screenshot 看会议画面，再回答。
- 人和人之间的正常讨论、闲聊、已经有人回答、你给不出实质内容 → 只回复 NO_REPLY。拿不准时 NO_REPLY。
你的回复会由桥接同时发到会议聊天区和本群；不要自己调用会议发消息命令，也不要在回复里加"【会中】"之类前缀。只输出这一轮要发的话（或 NO_REPLY），说完就停，不要续写后面的会议内容或任何系统提示。${paceLine(pace)}

新内容：
${lines}`;
}

/** Real numbers about how much V has said, so it can pace itself (instead of inventing a limit). */
function paceLine(pace) {
  if (!pace || !(pace.recentReplies > 0)) return "";
  const ago = pace.lastReplyAgoS < 60 ? `${pace.lastReplyAgoS} 秒前` : `${Math.round(pace.lastReplyAgoS / 60)} 分钟前`;
  const busy = pace.recentReplies >= 3 || pace.lastReplyAgoS < 90;
  return `\n节奏：你在这场会里最近一次发言是 ${ago}，过去 10 分钟发了 ${pace.recentReplies} 条。${busy ? "最近说得偏多：除非有人直接问你或点名要你做事，这一轮请 NO_REPLY，把话留给参会的人。" : ""}`;
}

export function briefPrompt({ meetingId, transcriptPath }) {
  return `[会议桥接 · meeting_id=${meetingId}] 会议已结束。完整逐字稿在 ${transcriptPath}。
请写一份会后短纪要，只输出纪要正文，会由桥接发到本群（飞书富文本，支持 **加粗** 和列表）。
格式：第一行 **会议纪要 · 主题（时间）**；然后 **结论**、**待办**、**未决问题** 三段，每段 3–6 条，用「- 」开头的列表；待办写成「负责人：事项」。中文简洁，不要表格和标题符号 #。`;
}

export const COPY = Object.freeze({
  groupPrefix: "【会中】",
  stillWorking: "还在弄，马上好。",
  briefHeader: "会议结束，V 的会后纪要：\n",
});
