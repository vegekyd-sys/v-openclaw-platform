// The text of the turns the bridge starts in the session that brought V into the meeting.
// Accepted in the 2026-11-18 live test (V｜会议体验打通｜1117): no wake word, full V decides,
// NO_REPLY for everything not worth saying. Progress and screenshots are V's own tools.

export const SILENT_REPLIES = new Set(["NO_REPLY", "NO_REPLY.", "NO_REPLY。"]);

export function isSilent(text) {
  const t = String(text ?? "").trim();
  return t === "" || SILENT_REPLIES.has(t);
}

export function turnPrompt({ meetingId, lines }) {
  return `[会议桥接 · meeting_id=${meetingId}] 你（V）正以参会者身份在飞书会议里，只能在会议聊天区打字，没有语音。
下面是会议里刚出现的新内容（字幕常把 V 识别成 B、微、薇、威、维等同音字）。不需要别人喊名字：
- 有人在问你、跟你说话、让你做事，或者你能对正在讨论的问题给出有价值的信息 → 直接回复要发到会议聊天区的内容，口语、简短（一般 1–3 句）。需要查资料或用工具就直接去做，做完给结论。
- 要做的事超过几秒（查资料、跑命令、看文件），先调用 meeting_say 说一句你在做什么（如"我去翻一下最近合入的 PR"），再去做；做完的结论仍然作为本轮回复。
- 别人提到屏幕、共享、白板、"你看这个"时，可以调用 meeting_screenshot 看会议画面，再回答。
- 人和人之间的正常讨论、闲聊、已经有人回答、你给不出实质内容 → 只回复 NO_REPLY。拿不准时 NO_REPLY。
你的回复会由桥接同时发到会议聊天区和本群；不要自己调用会议发消息命令，也不要在回复里加"【会中】"之类前缀。

新内容：
${lines}`;
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
