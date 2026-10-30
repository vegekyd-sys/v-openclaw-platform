// v-experience: V's conversation experience, independent of the chat channel.
//
// Feishu got these first, as logic baked into its monitor bundle. This module
// holds the same rules once, so every channel shows the same things:
//
//   progress   the agent's progress card (`progress_card`, any runtime) as a
//              work checklist while the reply is being written
//   background the session's background work after the reply ends
//              ("⏳ 后台 2 项进行中 · 子 agent 1 · 后台命令 1" → "☑️ 后台任务已结束")
//   ask        ask_user questions the stock channels cannot render: several
//              questions, or multiple choice, answered with buttons or in chat
//
// Channels supply the transport (send, edit, Gateway calls); this module keeps
// the state and decides what to show. It reads only Gateway hooks that exist
// in V's 2026.9.1 core (see docs/v-experience.md) and has no imports, so a
// patcher can drop it next to any dist chunk as `v-experience.js`.

export const V_EXPERIENCE_VERSION = "0.1.0";

const PROGRESS_LISTENERS = Symbol.for("openclaw.v.progressCardChangedListeners");
const TASK_BRIDGE = Symbol.for("openclaw.v.taskRegistryBridge");
const lower = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");

// ---------------------------------------------------------------- progress

/** The plan of a progress card as `{step, status}` with known statuses only. */
export function normalizePlanSteps(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const step = typeof entry.step === "string" ? entry.step.replace(/\s+/g, " ").trim() : "";
    if (!step) return [];
    const status = entry.status === "completed" || entry.status === "in_progress" ? entry.status : "pending";
    return [{ step: step.length > 120 ? `${step.slice(0, 119)}…` : step, status }];
  });
}

/** Tool names a progress-card write arrives under: native, MCP-bridged, namespaced. */
export function isProgressCardToolName(name) {
  return typeof name === "string" && /(?:^|__|\.)progress_card$/i.test(name.trim());
}

/**
 * Calls `onSteps(steps)` whenever the session's progress card changes, until
 * the returned function is called. Without V's core hook this is a no-op.
 */
export function subscribeProgressCard(sessionKey, onSteps) {
  const key = lower(sessionKey);
  const listeners = globalThis[PROGRESS_LISTENERS];
  if (!key || !(listeners instanceof Set)) return () => {};
  const listener = ({ sessionKey: changed, card } = {}) => {
    if (lower(changed) !== key) return;
    return onSteps(normalizePlanSteps(card?.steps));
  };
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ------------------------------------------------------------ work view
//
// The reply while it is being written, laid out like V's Feishu card:
//
//   text written before a question          (kept)
//   the question, or "✓ 已选择：…" once answered  (kept)
//   the agent's commentary, replaced by the answer once it starts
//   the current tool, e.g. "🛠️ Exec"         (working state)
//   ---
//   ☑️ / ▶️ / ◻️ plan from the progress card    (working state)
//
// Channels whose reply is one rewritable message (DingTalk AI card, WeCom
// stream) render compose(answer) while working and finalText(answer) at the end.

const TOOL_LABELS = [
  [/^(exec|bash|shell|process|run_command)$/i, "运行命令"],
  [/^(read|read_file|view)$/i, "读取文件"],
  [/^(write|edit|apply_patch|multi_edit|str_replace)/i, "修改文件"],
  [/^(web_search|search)$/i, "搜索网页"],
  [/^(web_fetch|fetch|read_url)$/i, "读取网页"],
  [/^(browser|v_browser|computer|desktop)/i, "操作浏览器/电脑"],
  [/^memory_(search|get)$/i, "查记忆"],
  [/^(sessions_spawn|spawn_agent|agent|task)$/i, "启动子 agent"],
  [/^(image_generate|image|makaron)/i, "生成图片"],
  [/^(video_generate)/i, "生成视频"],
  [/^(ask_user|question)$/i, "向你提问"],
  [/^(message|send_message)$/i, "发送消息"],
  [/^(cron|schedule)/i, "设置定时任务"],
  [/^secrets?$/i, "索取凭据"],
];

/** "运行命令" for exec, the bare name for anything unknown. */
export function toolActivityLabel(name) {
  const bare = String(name ?? "").trim().replace(/^.*(?:__|\.)/, "");
  if (!bare) return "";
  for (const [re, label] of TOOL_LABELS) if (re.test(bare)) return label;
  return bare;
}

/** The plan as Feishu shows it, without colour (☑️ done, ▶️ live, ◻️ pending). */
export function planMarkdown(steps) {
  if (!steps.length) return "";
  const done = steps.filter((s) => s.status === "completed").length;
  const fold = steps.length > 12 ? Math.max(0, Math.min(done - 1, steps.length - 11)) : 0;
  const lines = [];
  if (fold) lines.push(`☑️ 已完成 ${fold} 步`);
  const visible = steps.slice(fold, fold + (fold ? 11 : 12));
  for (const s of visible) {
    const text = escapeMarkdown(s.step);
    lines.push(s.status === "completed" ? `☑️ ${text}` : s.status === "in_progress" ? `▶️ **${text}**　进行中` : `◻️ ${text}`);
  }
  const hidden = steps.length - fold - visible.length;
  if (hidden > 0) lines.push(`…还有 ${hidden} 步`);
  return lines.join("\n");
}

/**
 * A question inside the reply. `optionLink(text)` makes an option a link that
 * sends `text` as the person's message (DingTalk); without it options are
 * numbered for typing.
 */
export function questionMarkdown(record, { staged = {}, optionLink } = {}) {
  const numbered = record.questions.length > 1;
  const multi = numbered || record.questions.some((q) => q.multiSelect);
  const blocks = record.questions.map((q, i) => {
    const head = `**${numbered ? `${i + 1}. ` : ""}${escapeMarkdown(q.question)}**${q.multiSelect ? "（可多选）" : ""}`;
    const picked = new Set(staged[i] ?? []);
    const rows = q.options.map((o, j) => {
      const label = escapeMarkdown(o.label);
      const send = numbered ? `${i + 1}. ${o.label}` : o.label;
      const shown = optionLink ? `[${label}](${optionLink(send)})` : `${j + 1}. ${label}`;
      return `${picked.has(o.label) ? "✅" : "▫️"} ${shown}${o.description ? ` — ${escapeMarkdown(o.description)}` : ""}`;
    });
    return [head, ...rows].join("\n");
  });
  const confirm = multi ? (optionLink ? `选好后点 [确认](${optionLink("确认")})` : "选好后回复「确认」") : "";
  const hint = optionLink ? "也可以直接在聊天中回复答案" : (numbered ? "按题号逐行回复，例如「1. 你的回答」" : "回复选项序号或文字即可");
  return [blocks.join("\n\n"), [confirm, hint].filter(Boolean).join("　")].join("\n\n");
}

/** "✓ 已选择：饺子" — what a question collapses to. */
export function questionRecordLine(record, state, answers) {
  if (state === "expired") return "问题已过期";
  if (state === "cancelled") return "问题已取消";
  const summary = askSummary(record, answers);
  return summary ? `✓ 已选择：${escapeMarkdown(summary)}` : "✓ 已收到回答";
}

export function createWorkView({ sessionKey, onChange = () => {}, log, formatTool, optionLink, maxCommentary = 12 } = {}) {
  let steps = [];
  let statusLine = "";
  let statusAnswerLength = 0; // answer length when the status line was set
  let lastAnswerLength = 0;
  let q = null; // { record, prefix, staged, answers, state }
  let elsewhere = false; // question shown in its own card below
  const commentary = new Map(); // itemId -> text
  const seen = { card: 0, tool: 0, item: 0, plan: 0 };
  let disposed = false;
  const changed = () => { if (!disposed) try { onChange(); } catch {} };
  const unsubscribe = subscribeProgressCard(sessionKey, (next) => { seen.card += 1; steps = next; changed(); });
  const toolLine = (name, phase) => {
    try { const line = formatTool?.(name, phase); if (line) return line; } catch {}
    const label = toolActivityLabel(name);
    return label ? `🛠️ ${label}` : "";
  };
  const setStatus = (line) => { statusLine = line; statusAnswerLength = lastAnswerLength; changed(); };
  const head = () => {
    if (!q) return "";
    // A question already shown in a closed message is not repeated while it waits.
    if (q.closed && q.state === "pending") return "";
    const block = q.state === "pending" ? questionMarkdown(q.record, { staged: q.staged, optionLink }) : questionRecordLine(q.record, q.state, q.answers);
    return [q.prefix, block].filter((part) => part && part.trim()).join("\n\n");
  };
  return {
    toolStart(payload) {
      seen.tool += 1;
      const name = payload?.name;
      if (!name || isProgressCardToolName(name)) return false;
      if (payload.phase && payload.phase !== "start") return false;
      const line = toolLine(name, payload.phase ?? "start");
      if (!line || line === statusLine) return false;
      setStatus(line);
      return true;
    },
    itemEvent(payload) {
      seen.item += 1;
      if (payload?.kind !== "preamble") return false;
      const text = String(payload.progressText ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(-8000);
      if (!text) return false;
      const id = payload.itemId ?? "unkeyed";
      if (commentary.get(id) === text) return false;
      commentary.set(id, text);
      while (commentary.size > maxCommentary) commentary.delete(commentary.keys().next().value);
      changed();
      return true;
    },
    planUpdate(payload) {
      seen.plan += 1;
      if (payload?.phase && payload.phase !== "update") return false;
      const next = normalizePlanSteps(payload?.steps);
      if (!next.length) return false;
      steps = next;
      changed();
      return true;
    },
    compaction(active) { setStatus(active ? "📦 正在整理上下文" : ""); },
    /** Show a question inside the reply; `prefix` is the text written before it. */
    showQuestion(record, { prefix = "" } = {}) {
      // A second question keeps the first one's record above it.
      const before = [head(), String(prefix ?? "").trimEnd()].filter((part) => part && part.trim()).join("\n\n");
      q = { record, prefix: before, staged: {}, answers: undefined, state: "pending" };
      commentary.clear();
      statusLine = "";
      changed();
    },
    /** Choices made so far, by question index: {0: ["爬山"]}. */
    stageQuestion(staged) { if (q?.state === "pending") { q.staged = staged ?? {}; changed(); } },
    questionAnswered(answers) {
      elsewhere = false;
      if (q) { q.answers = answers; q.state = "answered"; }
      changed();
    },
    /** The question has its own card below this reply; wait for it. */
    questionElsewhere() { elsewhere = true; commentary.clear(); statusLine = ""; changed(); },
    questionClosed(state) { if (q && q.state === "pending") { q.state = state; changed(); } },
    /** The working message went away (a question was sent below it); start the next one fresh, plan kept. */
    clearWorking() { commentary.clear(); statusLine = ""; },
    /** The reply up to and including the question was sent and closed; what follows starts after it. */
    closedAtQuestion() { if (q) { q.prefix = ""; q.closed = true; } commentary.clear(); statusLine = ""; },
    /** What the view shows right now as data, for channels that draw their own layout (the V app). */
    snapshot() {
      return {
        question: q ? { record: q.record, state: q.state, staged: q.staged, answers: q.answers } : null,
        commentary: [...commentary.values()],
        status: statusLine,
        plan: steps.map((s) => ({ step: s.step, status: s.status })),
        waitingElsewhere: elsewhere,
      };
    },
    waitingForAnswer: () => elsewhere || q?.state === "pending",
    hasContent: () => steps.length > 0 || Boolean(statusLine) || commentary.size > 0 || Boolean(q) || elsewhere,
    /** The reply while working. */
    compose(answer) {
      const text = String(answer ?? "").trimEnd();
      lastAnswerLength = text.length;
      // The answer moving on means the tool it waited for is done.
      if (statusLine && text.length > statusAnswerLength) statusLine = "";
      const body = text || [...commentary.values()].join("\n\n");
      const plan = planMarkdown(steps);
      const top = [head(), body, elsewhere ? "❓ 请在下方卡片中回答" : statusLine].filter((part) => part && part.trim()).join("\n\n");
      return plan ? (top ? `${top}\n\n---\n\n${plan}` : plan) : top;
    },
    /** The finished reply: what came before a question, its record, the answer. */
    finalText(answer) {
      return [head(), String(answer ?? "").trim()].filter((part) => part && part.trim()).join("\n\n");
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      log?.(`v-experience: work view ${sessionKey} events card=${seen.card} tool=${seen.tool} item=${seen.item} plan=${seen.plan}`);
    },
  };
}

function escapeMarkdown(text) {
  return String(text).replace(/([\\`*_[\]<>#|~])/g, "\\$1");
}

// -------------------------------------------------------------- background

// v-card-v1: cards for channels that draw Feishu card JSON 2.0 themselves (the V app).
// The subset and the callback shapes are in apps/v-experience/schema/README.md.
export const V_CARD_VERSION = 1;

const cardMarkdown = (content, size) => ({ tag: "markdown", content, ...(size ? { text_size: size } : {}) });
const vCard = (elements, header) => ({ schema: "2.0", v_card: V_CARD_VERSION, ...(header ? { header } : {}), body: { elements } });
const cardHeader = (title, template) => ({ title: { tag: "plain_text", content: title }, template });

/**
 * V's reply as a card: the answer so far, then a rule and the work view
 * (💬 commentary, status, ☑️/▶️/◻️ plan, background line) while V works;
 * only the answer and a quiet footer once the run is over — the Feishu layout.
 * `view` is `createWorkView().snapshot()`.
 */
export function workCard({ answer = "", view = null, phase = "working", background = "", footer = "" } = {}) {
  const text = String(answer ?? "").trim();
  const active = phase === "thinking" || phase === "working" || phase === "waiting";
  const elements = [];
  if (active) {
    const commentary = view?.commentary ?? [];
    const body = text || commentary.join("\n\n");
    if (body) elements.push(cardMarkdown(body));
    const status = view?.waitingElsewhere ? "❓ 请在下方卡片中回答" : view?.status || (phase === "thinking" && !body ? "💭 正在思考" : "");
    const plan = planMarkdown(view?.plan ?? []);
    if ((status || plan || background) && elements.length) elements.push({ tag: "hr" });
    if (status) elements.push(cardMarkdown(status, "notation"));
    if (plan) elements.push(cardMarkdown(plan));
    if (background) elements.push(cardMarkdown(background, "notation"));
  } else {
    const ending = phase === "aborted" ? "这一轮已停止。" : phase === "failed" ? "这一轮没有完成。" : "";
    if (text) elements.push(cardMarkdown(text));
    else if (ending) elements.push(cardMarkdown(ending, "notation"));
    if (background) elements.push(cardMarkdown(background, "notation"));
    if (footer) elements.push(cardMarkdown(footer, "notation"));
  }
  return vCard(elements);
}

/**
 * An `ask_user` record as a card with tappable options. Buttons post
 * `{kind: "question", id, question, option}`; several choices or several
 * questions add a 确认 button posting `{kind: "question", id, submit: true}`.
 * Answered, expired or cancelled questions collapse to their record line.
 */
export function questionCard(record, { state = "pending", staged = {}, answers } = {}) {
  if (state !== "pending") {
    return vCard([cardMarkdown(questionRecordLine(record, state, answers))], cardHeader("V 的问题", "grey"));
  }
  const numbered = record.questions.length > 1;
  const staging = numbered || record.questions.some((q) => q.multiSelect);
  const elements = [];
  record.questions.forEach((q, i) => {
    const picked = new Set(staged[i] ?? []);
    elements.push(cardMarkdown(`**${numbered ? `${i + 1}. ` : ""}${escapeMarkdown(q.question)}**${q.multiSelect ? "（可多选）" : ""}`));
    for (const o of q.options) {
      elements.push({
        tag: "button",
        text: { tag: "plain_text", content: o.label },
        type: picked.has(o.label) ? "primary_filled" : "default",
        width: "fill",
        behaviors: [{ type: "callback", value: { kind: "question", id: record.id, question: i, option: o.label } }],
      });
      if (o.description) elements.push(cardMarkdown(escapeMarkdown(o.description), "notation"));
    }
  });
  if (staging) {
    elements.push({
      tag: "button",
      text: { tag: "plain_text", content: "确认" },
      type: "primary_filled",
      width: "fill",
      behaviors: [{ type: "callback", value: { kind: "question", id: record.id, submit: true } }],
    });
  }
  elements.push(cardMarkdown("也可以直接在聊天中回复答案", "notation"));
  return vCard(elements, cardHeader("V 想问你", "blue"));
}

/**
 * A link card (`{title, lines, buttons, image?}`: the credential link, V's
 * 「电脑」 handoff card) as a V card. URL buttons open the link; command
 * buttons post `{kind: "command", command}`, which the channel sends as the
 * tapper's message, as DingTalk and WeCom do.
 */
export function linkVCard(card, { template = "blue" } = {}) {
  const elements = [];
  if (card.image?.ref) elements.push({ tag: "img", img_key: card.image.ref, alt: { tag: "plain_text", content: card.image.alt ?? "" } });
  if (card.lines?.length) elements.push(cardMarkdown(card.lines.join("\n")));
  for (const [i, b] of (card.buttons ?? []).entries()) {
    const behavior = b.url ? { type: "open_url", default_url: b.url } : b.command ? { type: "callback", value: { kind: "command", command: b.command } } : undefined;
    if (!behavior) continue;
    elements.push({ tag: "button", text: { tag: "plain_text", content: b.label }, type: i === 0 ? "primary_filled" : "default", width: "fill", behaviors: [behavior] });
  }
  return vCard(elements, card.title ? cardHeader(card.title, template) : undefined);
}

const SECRET_CARD_STATES = {
  saved: { title: "凭据已保存", template: "green", line: "✅ 已安全保存，V 会继续刚才的任务。" },
  expired: { title: "凭据请求已过期", template: "grey", line: "没有在时限内录入，V 已跳过这一步。还需要的话，让 V 重新发起。" },
  cancelled: { title: "凭据请求已取消", template: "grey", line: "这次请求已取消，没有保存任何值。" },
};

export const SECRET_FIELD = "secret_value";

/**
 * A credential request as a V card with a masked input, the Feishu layout.
 * Terminal states drop the form so nothing stays submittable. The value goes
 * from the form straight to `question.resolve`, never through the chat.
 */
export function secretEntryCard(record, state = "pending") {
  const q = record?.questions?.[0] ?? {};
  const name = q.secretStore?.name ?? q.header ?? "凭据";
  const terminal = SECRET_CARD_STATES[state];
  if (terminal) return vCard([cardMarkdown(terminal.line)], cardHeader(terminal.title, terminal.template));
  return vCard([
    cardMarkdown(q.question ?? `V 需要凭据 ${name}。`),
    {
      tag: "form",
      name: "v_secret_entry_form",
      elements: [
        { tag: "input", name: SECRET_FIELD, input_type: "password", required: true, max_length: 1000, width: "fill", placeholder: { tag: "plain_text", content: "粘贴密钥，提交后不会出现在聊天里" } },
        { tag: "button", name: "v_secret_entry_submit", text: { tag: "plain_text", content: "安全保存" }, type: "primary_filled", width: "fill", form_action_type: "submit", behaviors: [{ type: "callback", value: { kind: "secret", id: record?.id } }] },
      ],
    },
    cardMarkdown("🔒 值直接存进 V 的凭据库，不进聊天记录，也不经过模型。", "notation"),
  ], cardHeader(`🔑 V 需要凭据 ${name}`, "blue"));
}

// v-experience-session-kind-v1: 「会话请求」 is a sessions_send request another session is working on.
const KIND_ORDER = ["会话请求", "子 agent", "后台命令", "生图", "生成视频", "生成音乐", "自动化", "后台任务"];

/** What a task is, in the words V uses. */
export function backgroundKind(task) {
  const runtime = task?.runtime;
  const kind = typeof task?.taskKind === "string" ? task.taskKind : "";
  if (kind === "sessions_send") return "会话请求";
  if (runtime === "subagent" || runtime === "acp") return "子 agent";
  if (runtime === "cron") return "自动化";
  if (kind === "exec") return "后台命令";
  if (kind === "image_generation") return "生图";
  if (kind === "video_generation") return "生成视频";
  if (kind === "music_generation") return "生成音乐";
  return "后台任务";
}

/** Active tasks minus the session's own foreground run (a cli task without a kind). */
export function backgroundTasks(tasks, sessionKey) {
  const key = lower(sessionKey);
  return (Array.isArray(tasks) ? tasks : []).filter((task) => !(task?.runtime === "cli" && !task.taskKind && lower(task.childSessionKey) === key));
}

/** One line for the work; "" when nothing runs and nothing was shown. */
export function backgroundLine(tasks, { shownActive = false } = {}) {
  const active = Array.isArray(tasks) ? tasks : [];
  if (active.length === 0) return shownActive ? "☑️ 后台任务已结束" : "";
  const counts = new Map();
  for (const task of active) {
    const kind = backgroundKind(task);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const kinds = KIND_ORDER.filter((kind) => counts.has(kind));
  const detail = kinds.length === 1 ? kinds[0] : kinds.map((kind) => `${kind} ${counts.get(kind)}`).join(" · ");
  return `⏳ 后台 ${active.length} 项进行中 · ${detail}`;
}

/** The background line for a session right now; "" when nothing runs. */
export function currentBackgroundLine(sessionKey) {
  const bridge = globalThis[TASK_BRIDGE];
  if (!lower(sessionKey) || typeof bridge?.listActive !== "function") return "";
  try { return backgroundLine(backgroundTasks(bridge.listActive(sessionKey), sessionKey)); } catch { return ""; }
}

const watchers = new Map(); // `${channel}:${sessionKey}` -> watcher

/**
 * After a reply, keeps one background line per session up to date.
 *
 * `show(line)` creates or updates the line and `retire()` removes it when a
 * newer reply in the same session takes over. Worker-owned work raises no
 * Gateway event, so the bridge is also polled. A watcher that never saw work
 * shows nothing; once work it showed ends it shows the closing line and stops.
 */
export function watchBackground({ channel, sessionKey, show, retire, pollMs = 5000, debounceMs = 800, maxAgeMs = 24 * 3600 * 1000, log }) {
  const key = lower(sessionKey);
  const bridge = globalThis[TASK_BRIDGE];
  if (!key || !bridge || typeof bridge.listActive !== "function") return { stop() {} };
  const id = `${channel}:${key}`;
  watchers.get(id)?.supersede();
  let shownActive = false;
  let lastLine = "";
  let stopped = false;
  let timer;
  let debounce;
  let painting = Promise.resolve();
  const startedAt = Date.now();
  const paint = (line) => {
    painting = painting.then(() => show(line)).catch((error) => log?.(`v-experience: background line failed ${channel}: ${String(error?.message ?? error)}`));
    return painting;
  };
  const check = () => {
    if (stopped) return;
    let active;
    try { active = backgroundTasks(bridge.listActive(sessionKey), sessionKey); } catch { return; }
    const line = backgroundLine(active, { shownActive });
    if (active.length > 0) shownActive = true;
    if (line && line !== lastLine) {
      lastLine = line;
      paint(line);
    }
    if ((active.length === 0) || Date.now() - startedAt > maxAgeMs) stop();
  };
  const listener = (notice) => {
    if (!(notice?.sessionKeys ?? []).some((k) => lower(k) === key)) return;
    clearTimeout(debounce);
    debounce = setTimeout(check, debounceMs);
    debounce.unref?.();
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    clearTimeout(debounce);
    bridge.listeners?.delete?.(listener);
    if (watchers.get(id) === watcher) watchers.delete(id);
  };
  const watcher = {
    stop,
    supersede() {
      const hadLine = Boolean(lastLine);
      stop();
      if (hadLine && retire) painting = painting.then(() => retire()).catch(() => {});
    },
    settled: () => painting,
  };
  watchers.set(id, watcher);
  bridge.listeners?.add?.(listener);
  timer = setInterval(check, pollMs);
  timer.unref?.();
  check();
  return watcher;
}

// --------------------------------------------------------------------- ask

const ASK_ID = /^ask_[a-f0-9]{32}$/;

/** A pending ask_user record this module can render with buttons. */
export function isRenderableAsk(record) {
  return ASK_ID.test(record?.id ?? "") && Array.isArray(record.questions) &&
    record.questions.length >= 1 && record.questions.length <= 3 &&
    record.questions.every((q) => !q.isSecret && !q.secretStore && typeof q.questionId === "string" &&
      typeof q.question === "string" && Array.isArray(q.options) && q.options.length <= 8 &&
      q.options.every((o) => typeof o?.label === "string" && o.label.trim()));
}

/** Stock 9.1 renders one single-choice question itself; these need V. */
export function needsStagedAsk(record) {
  return isRenderableAsk(record) && (record.questions.length > 1 || record.questions[0].multiSelect === true || record.questions[0].options.length === 0);
}

/** Answers for `question.resolve` from staged choices and chat answers. */
export function askAnswers(record, choices = {}, chatAnswers = {}) {
  const answers = Object.create(null);
  record.questions.forEach((q, i) => {
    const picked = [...new Set(choices[i] ?? [])].filter((j) => Number.isInteger(j) && q.options[j]).map((j) => q.options[j].label);
    if (!q.multiSelect && picked.length > 1) throw new Error("这道题只能选一个。");
    const values = picked.length ? picked : chatAnswers[q.questionId];
    if (!values?.length) throw new Error(`请先回答「${q.header ?? q.question}」。`);
    answers[q.questionId] = values;
  });
  return { answers };
}

/** "爬山、读书；周末" — the answered state, one segment per question. */
export function askSummary(record, answers) {
  return record.questions.map((q) => (answers?.answers?.[q.questionId] ?? []).join("、")).filter(Boolean).join("；");
}

/**
 * A question as a chat message for channels without buttons: numbered
 * options and how to answer by typing. Markdown, Chinese, one block per
 * question.
 */
export function askPromptMarkdown(record) {
  const numbered = record.questions.length > 1;
  const blocks = record.questions.map((q, i) => {
    const lines = [`**${numbered ? `${i + 1}. ` : ""}${escapeMarkdown(q.question)}**${q.multiSelect ? "（可多选）" : ""}`];
    q.options.forEach((o, j) => lines.push(`${j + 1}. ${escapeMarkdown(o.label)}${o.description ? ` — ${escapeMarkdown(o.description)}` : ""}`));
    return lines.join("\n");
  });
  const q0 = record.questions[0];
  const hint = numbered
    ? "请按题号逐行回复，例如：\n1. 你的回答\n2. 你的回答"
    : !q0.options.length ? "直接回复你的回答即可。"
      : q0.multiSelect ? "回复选项序号即可，多个用顿号隔开，例如「1、3」；也可以直接写你的想法。"
        : `回复选项序号（1–${q0.options.length}）或选项文字即可${q0.isOther ? "，也可以直接写你的想法" : ""}。`;
  return `❓ V 想确认一下\n\n${blocks.join("\n\n")}\n\n> ${hint.replace(/\n/g, "\n> ")}`;
}

/**
 * A chat message as answers to a pending question (same rules as Feishu):
 * exact label, 1–8 or A–H, a list for multiple choice, "1. …" lines for
 * several questions; anything else is kept as the person's own words.
 */
export function readAskChatAnswers(record, text, staged = {}) {
  const answer = String(text ?? "").trim();
  if (!answer || answer.length > 3000) throw new Error("回答为空或太长，请重新回复。");
  const valuesFor = (q, value) => {
    const option = (s) => {
      const exact = q.options.find((o) => o.label === s);
      if (exact) return exact.label;
      const index = /^[1-8]$/.test(s) ? Number(s) - 1 : /^[A-Ha-h]$/.test(s) ? s.toUpperCase().charCodeAt(0) - 65 : -1;
      return q.options[index]?.label;
    };
    const exact = option(value);
    if (exact) return [exact];
    if (q.multiSelect) {
      const parts = value.split(/[、，,；;\s]+/).map((s) => s.trim()).filter(Boolean);
      const selected = parts.map(option);
      if (selected.length && selected.every(Boolean)) return [...new Set(selected)];
    }
    return [value];
  };
  const answers = Object.assign(Object.create(null), staged);
  const updated = [];
  if (record.questions.length === 1) {
    answers[record.questions[0].questionId] = valuesFor(record.questions[0], answer);
    updated.push(record.questions[0].questionId);
  } else {
    const numbered = [...answer.matchAll(/(?:^|\n)\s*([1-3])[.、．:)）]\s*([^\n]+)/g)];
    if (numbered.length) {
      if (numbered.length !== answer.split(/\n/).filter((s) => s.trim()).length || new Set(numbered.map((m) => m[1])).size !== numbered.length) {
        throw new Error("请按问题编号逐行回复，或先回复当前未回答的问题。");
      }
      for (const [, number, value] of numbered) {
        const q = record.questions[Number(number) - 1];
        if (!q || !value.trim()) throw new Error("问题编号或回答无效，请重新回复。");
        answers[q.questionId] = valuesFor(q, value.trim());
        updated.push(q.questionId);
      }
    } else {
      const q = record.questions.find((x) => !answers[x.questionId]?.length) ?? record.questions[0];
      answers[q.questionId] = valuesFor(q, answer);
      updated.push(q.questionId);
    }
  }
  return { answers, updated, remaining: record.questions.filter((q) => !answers[q.questionId]?.length) };
}

/**
 * Keeps per-person choices for staged questions until they confirm.
 * `resolve(id, answers, resolvedBy)` calls the Gateway's `question.resolve`.
 */
export function createAskRuntime({ getQuestion, resolve, log }) {
  const entries = new Map(); // question id -> entry

  const entryFor = async (id) => {
    const existing = entries.get(id);
    if (existing) return existing;
    const record = await getQuestion(id);
    if (!isRenderableAsk(record)) return undefined;
    const entry = { record, state: record.status === "pending" ? "pending" : record.status, choices: new Map(), chatAnswers: new Map(), submitting: false };
    entries.set(id, entry);
    const ttl = setTimeout(() => entries.delete(id), Math.max(0, (record.expiresAtMs ?? Date.now()) - Date.now()) + 3600_000);
    ttl.unref?.();
    return entry;
  };

  const submit = async (entry, answers, resolvedBy) => {
    entry.submitting = true;
    try {
      await resolve(entry.record.id, answers, resolvedBy);
      entry.state = "answered";
      entry.answers = answers;
      return "answered";
    } catch (error) {
      const reason = error?.details?.reason;
      if (reason !== "QUESTION_ALREADY_TERMINAL" && reason !== "QUESTION_NOT_FOUND") throw error;
      try {
        const fresh = await getQuestion(entry.record.id);
        entry.state = ["answered", "expired", "cancelled"].includes(fresh?.status) ? fresh.status : "expired";
        if (fresh?.answers) entry.answers = fresh.answers;
      } catch { entry.state = "expired"; }
      return "terminal";
    } finally {
      entry.submitting = false;
    }
  };

  return {
    entryFor,
    peek: (id) => entries.get(id),
    /** Toggle (multiple choice) or set (single choice) one option for one person. */
    async choose(id, sender, questionIndex, optionIndex) {
      const entry = await entryFor(id);
      if (!entry) return { kind: "invalid" };
      if (entry.state !== "pending") return { kind: "closed", entry };
      const q = entry.record.questions[questionIndex];
      if (!q?.options[optionIndex]) return { kind: "invalid" };
      const draft = { ...(entry.choices.get(sender) ?? {}) };
      const current = draft[questionIndex] ?? [];
      draft[questionIndex] = q.multiSelect
        ? current.includes(optionIndex) ? current.filter((j) => j !== optionIndex) : [...current, optionIndex]
        : [optionIndex];
      entry.choices.set(sender, draft);
      const chat = { ...(entry.chatAnswers.get(sender) ?? {}) };
      delete chat[q.questionId];
      entry.chatAnswers.set(sender, chat);
      return { kind: "staged", entry, choices: draft };
    },
    async confirm(id, sender, resolvedBy) {
      const entry = await entryFor(id);
      if (!entry) return { kind: "invalid" };
      if (entry.state !== "pending") return { kind: "closed", entry };
      if (entry.submitting) return { kind: "busy", entry };
      let answers;
      try { answers = askAnswers(entry.record, entry.choices.get(sender), entry.chatAnswers.get(sender)); }
      catch (error) { return { kind: "incomplete", entry, message: error.message }; }
      const state = await submit(entry, answers, resolvedBy);
      return state === "answered" ? { kind: "answered", entry, answers } : { kind: "closed", entry };
    },
    async answerFromChat(id, sender, text, resolvedBy) {
      const entry = entries.get(id);
      if (!entry || entry.state !== "pending") return { handled: false };
      if (entry.submitting) return { handled: true, notice: "正在提交当前问题的回答，请稍候。" };
      const staged = { ...(entry.chatAnswers.get(sender) ?? {}) };
      const choices = entry.choices.get(sender) ?? {};
      entry.record.questions.forEach((q, i) => {
        if (choices[i]?.length) staged[q.questionId] = choices[i].map((j) => q.options[j].label);
      });
      let result;
      try { result = readAskChatAnswers(entry.record, text, staged); }
      catch (error) { return { handled: true, notice: error.message }; }
      if (result.remaining.length) {
        entry.chatAnswers.set(sender, result.answers);
        return { handled: true, entry, notice: `已记下。请继续回答「${result.remaining[0].question}」。` };
      }
      try {
        const state = await submit(entry, { answers: result.answers }, resolvedBy);
        log?.(`v-experience: ask chat answer id=${id} state=${state}`);
        return { handled: true, entry, ...(state === "terminal" ? { notice: "这个问题已经结束了。" } : {}) };
      } catch {
        return { handled: true, entry, notice: "回答提交失败，请再回复一次。" };
      }
    },
    /** Pending staged questions in a conversation, newest first. */
    pendingFor(match) {
      return [...entries.values()].filter((entry) => entry.state === "pending" && match(entry)).reverse();
    },
    finalize(id, status) {
      const entry = entries.get(id);
      if (!entry) return undefined;
      entry.state = /^answered/i.test(status) ? "answered" : /^expired/i.test(status) ? "expired" : /^cancel/i.test(status) ? "cancelled" : entry.state;
      return entry;
    },
  };
}

// ------------------------------------------------- question delivery
//
// A Worker run registers its question with the Gateway (`question.request`);
// no reply payload carries it to the channel. V's core announces every new
// question on a global listener set (secret-entry runtime v2), which Feishu
// already uses. A reply that is in progress claims its session's questions
// here; the payload path (`channelData.askUser`) stays as a fallback, and a
// question is shown once whichever path sees it first.

const QUESTION_LISTENERS = Symbol.for("openclaw.questionChannelRequestedListeners");
const questionRoutes = new Map(); // lower(sessionKey) -> [{deliver}], newest last
const deliveredQuestions = new Map(); // question id -> at
let questionListener;

function ensureQuestionListener() {
  // The core creates this set lazily, on its first question; create it first
  // so the core's own lookup (Object.hasOwn on globalThis) reuses it.
  if (!Object.hasOwn(globalThis, QUESTION_LISTENERS)) globalThis[QUESTION_LISTENERS] = new Set();
  const listeners = globalThis[QUESTION_LISTENERS];
  if (!(listeners instanceof Set)) return false;
  questionListener ??= (record) => {
    if (record?.status && record.status !== "pending") return;
    const routes = questionRoutes.get(lower(record?.sessionKey));
    const route = routes?.at(-1);
    if (route) return route.deliver(record);
  };
  // The core clears this set when it restarts in process; join again.
  if (!listeners.has(questionListener)) listeners.add(questionListener);
  return true;
}

/** While a reply runs, new questions of its session are handed to `deliver`. */
export function onQuestionRequested(sessionKey, deliver) {
  const key = lower(sessionKey);
  if (!key) return () => {};
  ensureQuestionListener();
  const route = { deliver };
  questionRoutes.set(key, [...(questionRoutes.get(key) ?? []), route]);
  return () => {
    const left = (questionRoutes.get(key) ?? []).filter((r) => r !== route);
    if (left.length) questionRoutes.set(key, left);
    else questionRoutes.delete(key);
  };
}

/** True the first time a question id is claimed for showing; false after. */
export function claimQuestionDelivery(id) {
  if (!id || deliveredQuestions.has(id)) return false;
  deliveredQuestions.set(id, Date.now());
  if (deliveredQuestions.size > 500) for (const [k, at] of deliveredQuestions) if (Date.now() - at > 24 * 3600_000) deliveredQuestions.delete(k);
  return true;
}

/** Text for a question this channel cannot take (a credential). */
export function secretQuestionNotice(record) {
  const name = record?.questions?.[0]?.secretStore?.name ?? record?.questions?.[0]?.header ?? "凭据";
  return `🔑 V 需要一个凭据（${name}）。这个聊天渠道不能安全地输入凭据，请在飞书私聊里让 V 重新索取。`;
}

// ------------------------------------------------- credentials by link
//
// Channels without a masked input send the asker a one-time link to the
// v-secret-entry service (apps/v-secret-entry); the page stores the value with
// `question.resolve`, so it never enters the chat. Configured on the Gateway's
// environment; without it, or when anything fails, the old notice + cancel.

/** The service's admin endpoint, or undefined when links are not set up. */
export function secretLinkConfig(env = process.env) {
  const url = env.V_SECRET_ENTRY_ADMIN_URL?.trim();
  const tokenFile = env.V_SECRET_ENTRY_ADMIN_TOKEN_FILE?.trim();
  return url && tokenFile ? { url: url.replace(/\/+$/u, ""), tokenFile } : undefined;
}

/** A one-time link for a credential question: `{id, url, expiresAtMs}`, or undefined. */
export async function requestSecretLink({ record, channel, askerId, env = process.env, fetchImpl = globalThis.fetch }) {
  const config = secretLinkConfig(env);
  const question = record?.questions?.[0];
  const binding = question?.secretStore;
  if (!config || !record?.id || !binding?.name || !askerId) return undefined;
  const token = process.getBuiltinModule("node:fs").readFileSync(config.tokenFile, "utf8").split(/\r?\n/u)[0].trim();
  const res = await fetchImpl(`${config.url}/v1/links`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      questionId: record.id,
      answerKey: question.questionId,
      name: binding.name,
      ...(typeof binding.reason === "string" && binding.reason ? { reason: binding.reason } : {}),
      allowedHosts: Array.isArray(binding.allowedHosts) ? binding.allowedHosts : [],
      channel,
      askerId: String(askerId),
      ...(Number.isFinite(record.expiresAtMs) ? { expiresAtMs: record.expiresAtMs } : {}),
    }),
    signal: AbortSignal.timeout(5000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || typeof body.url !== "string") throw new Error(`secret link not issued: ${res.status} ${String(body.error ?? "").slice(0, 120)}`);
  return { id: body.id, url: body.url, expiresAtMs: body.expiresAtMs, config, adminToken: token };
}

/**
 * The message that carries the link: plain text with the link as its last
 * line, or (`markdown`) a markdown link, since a bare token with "_" in it
 * could be read as emphasis.
 */
export function secretLinkMessage(record, link, { markdown = false, now = Date.now() } = {}) {
  const name = record?.questions?.[0]?.secretStore?.name ?? "凭据";
  const minutes = Math.max(1, Math.round((link.expiresAtMs - now) / 60_000));
  const text = `🔑 V 需要凭据 ${name}：请点开这个一次性链接填写，链接只能用一次、${minutes} 分钟内有效；值不会出现在聊天记录里。`;
  return markdown ? `${text}\n\n[点这里填写](${link.url})` : `${text}\n${link.url}`;
}

/** Said in a group when the link went to the asker's direct chat. */
export function secretLinkSentPrivately(record) {
  const name = record?.questions?.[0]?.secretStore?.name ?? "凭据";
  return `🔑 V 需要凭据 ${name}，录入链接已私信发给你。`;
}

/** The same link as a card: title, reason, allowed hosts, validity, one 填写凭据 button. */
export function secretLinkCard(record, link, { now = Date.now() } = {}) {
  const binding = record?.questions?.[0]?.secretStore ?? {};
  const minutes = Math.max(1, Math.round((link.expiresAtMs - now) / 60_000));
  const hosts = (Array.isArray(binding.allowedHosts) ? binding.allowedHosts : []).filter((h) => typeof h === "string" && h.trim());
  const lines = [];
  if (typeof binding.reason === "string" && binding.reason.trim()) lines.push(binding.reason.trim());
  if (hosts.length) lines.push(`只用于：${hosts.join("、")}`);
  lines.push(`链接只能用一次、${minutes} 分钟内有效；值不会出现在聊天记录里。`);
  return { title: `🔑 V 需要凭据 ${binding.name ?? "凭据"}`, lines, buttons: [{ label: "填写凭据", url: link.url }] };
}

// ------------------------------------------------------------ link cards
//
// A card the way V's Feishu cards look: a title, a few short lines and link
// buttons. `{title, lines, buttons: [{label, url}]}`; each channel renders it
// natively (DingTalk actionCard, WeCom text_notice, Telegram inline keyboard)
// and falls back to the plain text when the platform refuses the card.

const linkOf = (button) => {
  const url = button?.url ?? (button?.action?.type === "url" ? button.action.url : undefined);
  return typeof url === "string" && /^https?:\/\/\S+$/iu.test(url.trim()) ? url.trim() : undefined;
};
const plainLine = (text) => String(text ?? "").replace(/\*\*|__|`/gu, "").trim();

/** A slash command a card button may post as the person who taps it, e.g. `/v-handback h_1a2b`. */
const commandOf = (button) => {
  const value = typeof button?.value === "string" ? button.value.trim() : "";
  return /^\/[a-z][\w-]{0,31}(?: [\w-]{1,48})?$/u.test(value) ? value : undefined;
};
// A picture line in a presentation text block: `![alt](https://…)` or a local
// `file:///…/v-desktop-handoff-….jpg` the channel uploads itself.
const IMAGE_LINE = /^!\[([^\]\n]{0,60})\]\(((?:https:\/\/|file:\/\/\/)\S+)\)$/u;

/**
 * A link card from a portable presentation (`openclaw message send
 * --presentation`): title, the message text and text/context blocks as lines,
 * URL buttons. With `commands`, callback buttons whose value is a slash
 * command stay as `{label, command}` (DingTalk posts them through a
 * send-message link, WeCom through card events); otherwise they are dropped.
 * A text block that is only `![alt](url)` becomes the card's picture.
 * Undefined when no button is left (unless `allowEmpty`, for state updates).
 */
export function linkCardFromPresentation(presentation, text, { commands = false, allowEmpty = false } = {}) {
  if (!presentation || !Array.isArray(presentation.blocks)) return undefined;
  const title = String(presentation.title ?? "").trim();
  const lines = [];
  let image;
  const body = String(text ?? "").trim();
  if (body && body !== title) lines.push(body);
  const buttons = [];
  for (const block of presentation.blocks) {
    if ((block?.type === "text" || block?.type === "context") && String(block.text ?? "").trim()) {
      const line = String(block.text).trim();
      const picture = IMAGE_LINE.exec(line);
      if (picture) image ??= { alt: picture[1], ref: picture[2] };
      else lines.push(line);
    }
    if (block?.type === "buttons") {
      for (const b of block.buttons ?? []) {
        const label = String(b.label ?? "").trim();
        if (!label) continue;
        const url = linkOf(b);
        const command = commands && !url ? commandOf(b) : undefined;
        if (url) buttons.push({ label, url });
        else if (command) buttons.push({ label, command });
      }
    }
  }
  if (!buttons.length && !allowEmpty) return undefined;
  return { title: title || buttons[0]?.label || "", lines, buttons, ...(image ? { image } : {}) };
}

/** The card as plain text, links spelled out. */
export function linkCardText(card) {
  return [card.title, ...card.lines.map(plainLine), ...card.buttons.map((b) => (b.url ? `${b.label}：${b.url}` : `${b.label}：回复 ${b.command}`))].filter(Boolean).join("\n");
}

/** `{title, desc}` from a card title like 「电脑 · 需要操作」. */
const splitTitle = (title) => {
  const at = String(title ?? "").indexOf(" · ");
  return at > 0 ? { title: title.slice(0, at), desc: title.slice(at + 3) } : { title: String(title ?? "") };
};

/**
 * The bytes of a card picture the plugin left on this host for the channel to
 * upload (`file:///…/v-desktop-handoff-<id>.jpg`). Only that file name
 * pattern, a regular file, a JPEG/PNG of at most 5 MB: a presentation cannot
 * make a channel upload anything else.
 */
export function localCardImage(ref) {
  const fs = globalThis.process?.getBuiltinModule?.("node:fs");
  if (!fs || typeof ref !== "string" || !ref.startsWith("file:///")) return undefined;
  let file;
  try { file = decodeURIComponent(new URL(ref).pathname); } catch { return undefined; }
  const name = file.split("/").pop() ?? "";
  if (!/^v-desktop-handoff-[\w-]{1,80}\.(?:jpg|png)$/u.test(name)) return undefined;
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > 5 * 1024 * 1024) return undefined;
    const bytes = fs.readFileSync(file);
    const type = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg" : bytes.subarray(0, 4).toString("latin1") === "\x89PNG" ? "image/png" : undefined;
    return type ? { bytes, type, filename: name } : undefined;
  } catch {
    return undefined;
  }
}

// ------------------------------------------------- card button actions
//
// A card button that posts a slash command as the person who tapped it
// (/v-handback, /v-skip of V's desktop handoff). The command is handled by its
// plugin in the Gateway; when it changes what the card should show, the
// plugin asks the channel to update the card through this process-wide
// bridge. WeCom can only update a template card in reply to the tap's event,
// within 5 s, so the channel parks the event here until the plugin answers.

const CARD_ACTION_BRIDGE = Symbol.for("openclaw.v.cardActionBridge");

export function cardActionBridge() {
  globalThis[CARD_ACTION_BRIDGE] ??= {
    version: 1,
    pending: new Map(), // `${channel}:${ref}` -> {update(payload), until}
    /** The channel received a tap for `ref` (a handoff id); `update({presentation, text})` rewrites that card. */
    hold(channel, ref, update, windowMs = 4500) {
      const key = `${channel}:${ref}`;
      this.pending.set(key, { update, until: Date.now() + windowMs });
      const timer = setTimeout(() => { if (this.pending.get(key)?.update === update) this.pending.delete(key); }, windowMs + 100);
      timer.unref?.();
    },
    /** The plugin's new card for `ref`; true when the channel rewrote it. */
    async update(channel, ref, payload) {
      const key = `${channel}:${ref}`;
      const entry = this.pending.get(key);
      this.pending.delete(key);
      if (!entry || Date.now() > entry.until) return false;
      await entry.update(payload);
      return true;
    },
  };
  return globalThis[CARD_ACTION_BRIDGE];
}

/** Sends the card; when the platform refuses it, the text instead. */
export async function sendCardOrText({ card, text, sendCard, sendText, log }) {
  if (card && sendCard) {
    try {
      return await sendCard(card);
    } catch (error) {
      log?.(`v-experience: card refused, sending text instead: ${String(error?.description ?? error?.message ?? error).slice(0, 200)}`);
    }
  }
  return sendText(text);
}

/**
 * A DingTalk link that the PC client opens in the system browser
 * (`pc_slide=false`; true would open the side panel). Phones open it in
 * DingTalk's own browser.
 */
export function dingtalkOpenUrl(url) {
  return `dingtalk://dingtalkclient/page/link?url=${encodeURIComponent(url)}&pc_slide=false`;
}

/**
 * A DingTalk link that sends `command` into the conversation as the person who
 * taps it (DingTalk's `dtmd://dingtalkclient/sendMessage`, the same link V's
 * reply cards use for question options).
 */
export function dingtalkSendMessageUrl(command) {
  return `dtmd://dingtalkclient/sendMessage?content=${encodeURIComponent(command)}`;
}

const dingtalkButtonUrl = (b) => (b.url ? dingtalkOpenUrl(b.url) : dingtalkSendMessageUrl(b.command));
const hasCommands = (card) => card.buttons.some((b) => b.command);
/** The card's picture as DingTalk markdown: a media id (`@lAD…`) from the robot media upload, or an https url. */
const dingtalkImage = (card) => {
  const ref = card.image?.ref;
  return typeof ref === "string" && (/^@[\w-]+$/u.test(ref) || ref.startsWith("https://")) ? [`![${card.image.alt || "图片"}](${ref})`] : [];
};

/**
 * DingTalk robot `actionCard` for the session webhook (`msgtype: "actionCard"`).
 * A card of links: {title, text, singleTitle, singleURL}, the first link is
 * the button, any others become links in the text. A card with command
 * buttons (or a picture): every button as `btns`, side by side; the picture
 * under the lines.
 */
export function dingtalkActionCard(card) {
  if (hasCommands(card) || card.image) {
    const text = [`### ${card.title}`, ...card.lines, ...dingtalkImage(card)].join("\n\n");
    return { title: card.title, text, btnOrientation: "1", btns: card.buttons.map((b) => ({ title: b.label, actionURL: dingtalkButtonUrl(b) })) };
  }
  const [first, ...more] = card.buttons;
  const text = [`### ${card.title}`, ...card.lines, ...more.map((b) => `[${b.label}](${dingtalkOpenUrl(b.url)})`)].join("\n\n");
  return { title: card.title, text, singleTitle: first.label, singleURL: dingtalkOpenUrl(first.url) };
}

/**
 * The same card for the robot OpenAPI (batchSend / groupMessages): its message
 * templates fix the number of buttons — `sampleActionCard` one,
 * `sampleActionCard6` two side by side, `sampleActionCard3`…`5` three to five
 * stacked. Returns {msgKey, msgParam}.
 */
export function dingtalkRobotActionCard(card) {
  const ac = dingtalkActionCard(card);
  if (!ac.btns) return { msgKey: "sampleActionCard", msgParam: ac };
  const btns = ac.btns.slice(0, 5);
  const base = { title: ac.title, text: ac.text };
  if (btns.length === 1) return { msgKey: "sampleActionCard", msgParam: { ...base, singleTitle: btns[0].title, singleURL: btns[0].actionURL } };
  if (btns.length === 2) return { msgKey: "sampleActionCard6", msgParam: { ...base, buttonTitle1: btns[0].title, buttonUrl1: btns[0].actionURL, buttonTitle2: btns[1].title, buttonUrl2: btns[1].actionURL } };
  const msgParam = { ...base };
  btns.forEach((b, i) => { msgParam[`actionTitle${i + 1}`] = b.title; msgParam[`actionURL${i + 1}`] = b.actionURL; });
  return { msgKey: `sampleActionCard${btns.length}`, msgParam };
}

/** WeCom template card event key for a command button, and back. `vnoop` marks a button that does nothing. */
export function wecomCardKey(command) {
  return `vcmd:${command.slice(1).replace(/ /gu, ":")}`;
}
/** undefined: not a V card key; null: a V button that does nothing; else {command, ref} (ref = the command's argument). */
export function parseWecomCardKey(key) {
  if (key === "vnoop") return null;
  const m = /^vcmd:([a-z][\w-]{0,31})(?::([\w-]{1,48}))?$/u.exec(String(key ?? ""));
  if (!m) return undefined;
  return { command: m[2] ? `/${m[1]} ${m[2]}` : `/${m[1]}`, ref: m[2] ?? m[1] };
}

const taskIdFor = (taskId) => taskId ?? `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * WeCom `button_interaction` template card: the title (with its state as the
 * title's desc), the lines, then the buttons as on Feishu: links first as
 * jump buttons (`type: 1`), then command buttons whose taps come back as
 * template_card_event. The card type has no picture. A card without command
 * buttons (a finished state) keeps one inert button showing that state.
 */
export function wecomButtonCard(card, { taskId } = {}) {
  const head = splitTitle(card.title);
  const text = card.lines.map(plainLine).filter(Boolean).join("\n");
  const links = card.buttons.filter((b) => b.url);
  const commands = card.buttons.filter((b) => b.command);
  const buttons = [
    ...links.map((b) => ({ text: b.label.slice(0, 10), style: 1, type: 1, url: b.url })),
    ...commands.map((b, i) => ({ text: b.label.slice(0, 10), style: links.length || i > 0 ? (i === 0 ? 4 : 2) : 1, key: wecomCardKey(b.command) })),
  ].slice(0, 6);
  return {
    card_type: "button_interaction",
    main_title: { title: head.title, ...(head.desc ? { desc: head.desc } : {}) },
    ...(text ? { sub_title_text: text.slice(0, 500) } : {}),
    button_list: commands.length ? buttons : [{ text: (head.desc || "已结束").slice(0, 10), style: 2, key: "vnoop" }],
    task_id: taskIdFor(taskId),
  };
}

/**
 * WeCom `news_notice` template card: the picture (a url WeCom can fetch), the
 * title, and the first link on the picture and in the jump list.
 */
export function wecomNewsCard(card, { taskId } = {}) {
  const head = splitTitle(card.title);
  const link = card.buttons.find((b) => b.url);
  const [first] = card.lines.map(plainLine).filter(Boolean);
  return {
    card_type: "news_notice",
    main_title: { title: head.title, ...(first || head.desc ? { desc: (first ?? head.desc).slice(0, 60) } : {}) },
    card_image: { url: card.image.ref, aspect_ratio: 1.6 },
    card_action: { type: 1, url: link.url },
    jump_list: [{ type: 1, title: link.label, url: link.url }],
    task_id: taskIdFor(taskId),
  };
}

/**
 * The WeCom messages for a card, in order. A card of links: one text_notice.
 * A card with command buttons: its picture first — a news_notice when the
 * picture is an https url, or `{image}` (a local file the channel uploads
 * and sends as an image message) — then the button card. WeCom has no card
 * type with both a picture and callback buttons.
 */
export function wecomCardMessages(card, { taskId } = {}) {
  if (!hasCommands(card)) return [{ templateCard: wecomTextNotice(card, { taskId }) }];
  const out = [];
  const ref = card.image?.ref;
  if (ref?.startsWith("https://") && card.buttons.some((b) => b.url)) out.push({ templateCard: wecomNewsCard(card) });
  else if (ref?.startsWith("file:///")) out.push({ image: ref });
  out.push({ templateCard: wecomButtonCard(card, { taskId }) });
  return out;
}

/**
 * WeCom smart-robot template card, `card_type: "text_notice"`: the first line
 * under the title, the rest as the sub title, links in the jump list, and the
 * card itself opens the first link.
 */
export function wecomTextNotice(card, { taskId } = {}) {
  const [desc, ...rest] = card.lines.map(plainLine).filter(Boolean);
  return {
    card_type: "text_notice",
    main_title: { title: card.title, ...(desc ? { desc } : {}) },
    ...(rest.length ? { sub_title_text: rest.join("\n") } : {}),
    jump_list: card.buttons.slice(0, 3).map((b) => ({ type: 1, title: b.label, url: b.url })),
    card_action: { type: 1, url: card.buttons[0].url },
    task_id: taskId ?? `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

/** Telegram message text (HTML) and options with one URL button per row. */
export function telegramLinkCard(card) {
  return {
    text: [`<b>${escapeHtml(card.title)}</b>`, ...card.lines.map((l) => escapeHtml(plainLine(l)))].join("\n\n"),
    options: { parse_mode: "HTML", reply_markup: { inline_keyboard: card.buttons.map((b) => [{ text: b.label, url: b.url }]) } },
  };
}

async function revokeSecretLink(link, fetchImpl) {
  await fetchImpl(`${link.config.url}/v1/links/${link.id}`, { method: "DELETE", headers: { authorization: `Bearer ${link.adminToken}` }, signal: AbortSignal.timeout(5000) }).catch(() => {});
}

/**
 * A credential question on a channel without a masked input. The link goes to
 * the asker's direct chat only: here when `direct`, else through
 * `sendPrivate` (a group then hears it was sent privately). Otherwise the
 * notice is shown and `cancel()` ends the question so V carries on.
 * `sendHere(text, card)` / `sendPrivate(text, card)` get the link as text and,
 * for channels that render one, as a link card (`secretLinkCard`).
 * Returns "link", "link-private" or "cancelled".
 */
export async function deliverSecretQuestion({ record, channel, askerId, direct, markdown = false, sendHere, sendPrivate, cancel, log, env, fetchImpl = globalThis.fetch }) {
  let link;
  try {
    link = await requestSecretLink({ record, channel, askerId, env, fetchImpl });
  } catch (error) {
    log?.(`v-experience: ${channel} secret link for ${record?.id} failed: ${String(error?.message ?? error)}`);
  }
  if (link) {
    try {
      const card = secretLinkCard(record, link);
      if (direct) {
        await sendHere(secretLinkMessage(record, link, { markdown }), card);
        return "link";
      }
      if (sendPrivate) {
        await sendPrivate(secretLinkMessage(record, link, { markdown }), card);
        await Promise.resolve(sendHere(secretLinkSentPrivately(record))).catch(() => {});
        return "link-private";
      }
    } catch (error) {
      log?.(`v-experience: ${channel} secret link for ${record?.id} not delivered: ${String(error?.message ?? error)}`);
    }
    await revokeSecretLink(link, fetchImpl);
  }
  await sendHere(secretQuestionNotice(record));
  await Promise.resolve(cancel()).catch(() => {});
  return "cancelled";
}

// ------------------------------------------------- questions asked in chat
//
// Channels without buttons show a question as a chat message and take the
// next message in that chat as the answer. Answering goes straight to the
// Gateway's `question.resolve`, before the channel queues the message: a
// channel that runs one turn per chat at a time would otherwise park the
// answer behind the very turn that is waiting for it (Feishu #162).

const chatQuestions = new Map(); // `${channel}|${chatKey}` -> entries, newest last

/**
 * Remembers a question shown in a chat until it is answered or expires.
 * `inline`: the question is part of the reply, which shows staged choices
 * (`onStaged`) and the answer (`onAnswered`), so no acknowledgement message is
 * needed.
 */
export function trackChatQuestion({ channel, chatKey, senderId, record, inline = false, onStaged, onAnswered }) {
  if (!isRenderableAsk(record)) return false;
  const key = `${channel}|${chatKey}`;
  const entries = (chatQuestions.get(key) ?? []).filter((e) => e.record.id !== record.id && !expired(e));
  entries.push({ record, senderId: senderId ? String(senderId) : undefined, staged: {}, toggles: new Set(), inline, onStaged, onAnswered, at: Date.now() });
  chatQuestions.set(key, entries);
  return true;
}

const expired = (entry) => (entry.record.expiresAtMs ?? entry.at + 30 * 60_000) <= Date.now();
const CONFIRM = /^(确认|确定|好了|就这些|ok|OK)$/u;

/** True when a message in this chat would be taken as an answer. */
export function hasTrackedQuestion({ channel, chatKey, senderId }) {
  return (chatQuestions.get(`${channel}|${chatKey}`) ?? []).some((e) => !expired(e) && (!e.senderId || !senderId || e.senderId === String(senderId)));
}

/** Staged answers by question index, labels only. */
const stagedByIndex = (entry) => {
  const out = {};
  entry.record.questions.forEach((q, i) => {
    const values = i === 0 && entry.toggles.size ? [...entry.toggles] : entry.staged[q.questionId];
    if (values?.length) out[i] = values;
  });
  return out;
};

/**
 * Takes a chat message as (part of) the answer to the newest waiting question.
 * Multiple choice: an option label toggles it and 确认 submits. Returns
 * {handled:false} when there is no question (or it already ended elsewhere),
 * so the message goes on as a normal message.
 */
export async function answerTrackedQuestion({ channel, chatKey, senderId, text, resolve, resolvedBy, log }) {
  const key = `${channel}|${chatKey}`;
  const entries = (chatQuestions.get(key) ?? []).filter((e) => !expired(e));
  chatQuestions.set(key, entries);
  const entry = [...entries].reverse().find((e) => !e.senderId || !senderId || e.senderId === String(senderId));
  const message = typeof text === "string" ? text.trim() : "";
  if (!entry || !message) return { handled: false };
  const inline = entry.inline;
  const drop = () => chatQuestions.set(key, (chatQuestions.get(key) ?? []).filter((e) => e !== entry));
  const record = entry.record;
  const single = record.questions.length === 1 ? record.questions[0] : undefined;
  let answers;
  if (single?.multiSelect && (single.options.some((o) => o.label === message) || CONFIRM.test(message))) {
    if (!CONFIRM.test(message)) {
      if (entry.toggles.has(message)) entry.toggles.delete(message); else entry.toggles.add(message);
      entry.onStaged?.(stagedByIndex(entry));
      return { handled: true, inline, quiet: true, notice: `已选：${[...entry.toggles].join("、") || "（无）"}。选好后点「确认」。` };
    }
    if (!entry.toggles.size) return { handled: true, inline, notice: "还没有选择，请先点选项。" };
    answers = { [single.questionId]: [...entry.toggles] };
  } else if (record.questions.length > 1 && CONFIRM.test(message)) {
    const missing = record.questions.find((q) => !entry.staged[q.questionId]?.length);
    if (missing) return { handled: true, inline, notice: `请先回答「${missing.question}」。` };
    answers = { ...entry.staged };
  } else {
    let result;
    try { result = readAskChatAnswers(record, message, entry.staged); }
    catch (error) { return { handled: true, inline, notice: error.message }; }
    if (result.remaining.length) {
      entry.staged = result.answers;
      entry.onStaged?.(stagedByIndex(entry));
      return { handled: true, inline, quiet: true, notice: `已记下。请继续回答「${result.remaining[0].question}」。` };
    }
    answers = result.answers;
  }
  try {
    await resolve(record.id, { answers }, resolvedBy ?? `${channel}:chat:${senderId ?? "unknown"}`);
    drop();
    entry.onAnswered?.({ answers });
    log?.(`v-experience: ${channel} chat answer resolved ${record.id}`);
    return { handled: true, inline, answered: true, notice: `✓ 已收到：${askSummary(record, { answers })}` };
  } catch (error) {
    const reason = error?.details?.reason;
    if (reason === "QUESTION_ALREADY_TERMINAL" || reason === "QUESTION_NOT_FOUND" || /terminal|not.?found/i.test(String(error?.message ?? ""))) {
      drop();
      return { handled: false };
    }
    log?.(`v-experience: ${channel} chat answer failed ${record.id}: ${String(error?.message ?? error)}`);
    return { handled: true, inline, notice: "回答提交失败，请再回复一次。" };
  }
}

/** Whether a channel should send `result.notice` as a chat message. */
export function shouldSendAnswerNotice(result) {
  if (!result?.notice) return false;
  return !(result.inline && (result.answered || result.quiet));
}

// ------------------------------------------------- DingTalk question card
//
// Real buttons in DingTalk need a card template with callbacks. The template
// is DingTalk's open-source "循环渲染容器之交互组件的使用与服务端更新" form
// (variables title, form_fields, form_status, button_text, err_msg): each
// question is a clickable option list (CHECKBOX_LIST / _MULTI), optional free
// text, and one button. Clicks come back over the Stream TOPIC_CARD callback.

/** DingTalk's published sample of that template, for tests only. */
export const DINGTALK_SAMPLE_QUESTION_TEMPLATE = "9f86e003-e65e-4680-bf4b-8df5958d9f17.schema";

const dtJson = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));

/** Card data for a question; `checked` by question index, `text` free text by index. */
export function dingtalkQuestionCardData(record, { checked = {}, text = {}, state = "pending", answers, errMsg = "" } = {}) {
  const single = record.questions.length === 1 ? record.questions[0] : undefined;
  const fields = [];
  record.questions.forEach((q, i) => {
    const label = record.questions.length > 1 ? `${i + 1}. ${q.question}${q.multiSelect ? "（可多选）" : ""}` : (q.multiSelect ? "可多选" : "");
    if (q.options.length) {
      const type = q.multiSelect ? "CHECKBOX_LIST_MULTI" : "CHECKBOX_LIST";
      const picked = new Set(checked[i] ?? []);
      fields.push({
        type, name: `q${i}`, label, required: false,
        checkbox_items: q.options.map((o, j) => ({ value: j, text: o.description ? `${o.label} — ${o.description}` : o.label, checked: picked.has(j), name: `q${i}`, type })),
      });
    }
    if (q.isOther || !q.options.length) {
      fields.push({ type: "TEXT", name: `q${i}_text`, label: q.options.length ? "我有其他想法" : (record.questions.length > 1 ? label : ""), placeholder: "说说你的想法", default_string: text[i] ?? "" });
    }
  });
  const done = state !== "pending";
  return dtJson({
    title: single ? single.question : "V 想确认几件事",
    form_fields: fields,
    form_status: done ? "disabled" : "normal",
    button_text: done ? questionRecordLine(record, state, answers) : "按这些选择继续",
    err_msg: errMsg,
  });
}

/** Answers from a submitted form (params.submit_form_fields) or the staged state. */
export function dingtalkQuestionAnswers(record, { checked = {}, text = {} }) {
  const answers = Object.create(null);
  for (const [i, q] of record.questions.entries()) {
    const picked = (checked[i] ?? []).filter((j) => q.options[j]).map((j) => q.options[j].label);
    const own = String(text[i] ?? "").trim();
    const values = own ? (q.multiSelect ? [...picked, own] : [own]) : picked;
    if (!values.length) throw new Error(`请先回答「${record.questions.length > 1 ? `${i + 1}. ` : ""}${q.question}」。`);
    answers[q.questionId] = values;
  }
  return { answers };
}

const dingtalkCards = new Map(); // outTrackId -> entry

/**
 * Remember a delivered question card. `resolve(answers, by)` answers the
 * Gateway question; `onAnswered(answers)` lets the reply continue.
 */
export function trackDingtalkQuestionCard({ outTrackId, record, asker, resolve, onAnswered, log }) {
  dingtalkCards.set(outTrackId, { record, asker: asker ? String(asker) : undefined, resolve, onAnswered, log, checked: {}, text: {}, state: "pending", at: Date.now() });
  const ttl = setTimeout(() => dingtalkCards.delete(outTrackId), Math.max(60_000, (record.expiresAtMs ?? Date.now() + 30 * 60_000) - Date.now()) + 3600_000);
  ttl.unref?.();
}

/** Mark a question card answered some other way (typed answer); returns card data to write. */
export function closeDingtalkQuestionCard(outTrackId, state, answers) {
  const entry = dingtalkCards.get(outTrackId);
  if (!entry || entry.state !== "pending") return undefined;
  entry.state = state;
  entry.answers = answers;
  return dingtalkQuestionCardData(entry.record, { checked: entry.checked, text: entry.text, state, answers });
}

/**
 * The TOPIC_CARD callback: returns the card update to send back with the ack.
 * Single question, single choice: one tap answers. Otherwise taps stage and
 * the button submits.
 */
export async function handleDingtalkCardCallback(message) {
  const outTrackId = message?.outTrackId;
  const entry = dingtalkCards.get(outTrackId);
  if (!entry) return undefined;
  const update = (data) => ({ cardUpdateOptions: { updateCardDataByKey: true, updatePrivateDataByKey: true }, cardData: { cardParamMap: data } });
  const fail = (errMsg) => update(dingtalkQuestionCardData(entry.record, { checked: entry.checked, text: entry.text, state: entry.state, answers: entry.answers, errMsg }));
  if (entry.state !== "pending") return fail("");
  const userId = message.userId ? String(message.userId) : undefined;
  if (entry.asker && userId && userId !== entry.asker) return fail("这个问题在问别人。");
  let params = {};
  try { params = JSON.parse(message.content ?? "{}")?.cardPrivateData?.params ?? {}; } catch {}
  const record = entry.record;
  const submitted = Array.isArray(params.submit_form_fields) ? params.submit_form_fields : undefined;
  if (submitted) {
    for (const field of submitted) {
      const i = Number(String(field?.name ?? "").replace(/^q(\d+).*$/, "$1"));
      if (!Number.isInteger(i) || !record.questions[i]) continue;
      if (field.type === "TEXT") entry.text[i] = field.default_string ?? "";
      else if (Array.isArray(field.checkbox_items)) entry.checked[i] = field.checkbox_items.filter((x) => x.checked).map((x) => Number(x.value));
    }
  } else {
    const i = Number(String(params.name ?? "").replace(/^q(\d+).*$/, "$1"));
    const q = record.questions[i];
    if (!q) return fail("");
    const j = Number(params.value);
    if (!q.options[j]) return fail("选项无效，请重新选择。");
    const current = entry.checked[i] ?? [];
    entry.checked[i] = q.multiSelect ? (current.includes(j) ? current.filter((x) => x !== j) : [...current, j]) : [j];
    const immediate = record.questions.length === 1 && !q.multiSelect;
    if (!immediate) return update(dingtalkQuestionCardData(record, { checked: entry.checked, text: entry.text }));
  }
  let answers;
  try { answers = dingtalkQuestionAnswers(record, entry); }
  catch (error) { return fail(error.message); }
  try {
    await entry.resolve(answers, `dingtalk:card:${userId ?? "unknown"}`);
    entry.state = "answered";
    entry.answers = answers;
  } catch (error) {
    const reason = error?.details?.reason;
    if (reason === "QUESTION_ALREADY_TERMINAL" || reason === "QUESTION_NOT_FOUND") entry.state = "expired";
    else { entry.log?.(`v-experience: dingtalk card answer failed ${record.id}: ${String(error?.message ?? error)}`); return fail("提交失败，请再试一次。"); }
  }
  if (entry.state === "answered") try { entry.onAnswered?.(answers); } catch {}
  entry.log?.(`v-experience: dingtalk card ${outTrackId} ${entry.state} ${record.id}`);
  return update(dingtalkQuestionCardData(record, { checked: entry.checked, text: entry.text, state: entry.state, answers }));
}

// ------------------------------------------------- sends outside the reply

// What the agent sent to a chat through the channel's outbound (the message
// tool, a file, the 「电脑」 card) instead of in its reply. A channel that
// pre-creates a reply card asks this before filling an empty card with a
// placeholder: when the turn already showed its content, the card only says so.
const CHANNEL_SENDS = Symbol.for("openclaw.v.channelSends");
const SEND_MEMORY_MS = 6 * 60 * 60 * 1000;

/** The bare chat id: `group:cid…`, `user:abc`, `dingtalk-connector:group:cid…` → `cid…` / `abc`. */
export function channelTargetId(to) {
  let id = String(to ?? "").trim();
  for (;;) {
    const next = id.replace(/^(?:dingtalk-connector|dingtalk|wecom|group|user|chat|channel|conversation|direct|dm):/iu, "");
    if (next === id) return id;
    id = next;
  }
}

/** Records that `channel` delivered something to the chat `to` (any target spelling). */
export function noteChannelSend(channel, to, at = Date.now()) {
  const id = channelTargetId(to);
  if (!channel || !id) return;
  const sends = (globalThis[CHANNEL_SENDS] ??= new Map());
  sends.set(`${channel}\u0000${id}`, at);
  if (sends.size > 500) for (const [key, when] of sends) if (at - when > SEND_MEMORY_MS) sends.delete(key);
}

/** Whether `channel` delivered something to any of `ids` (chat or user ids) at or after `since`. */
export function channelSentSince(channel, ids, since) {
  const sends = globalThis[CHANNEL_SENDS];
  if (!sends) return false;
  return ids.some((to) => {
    const id = channelTargetId(to);
    return Boolean(id) && (sends.get(`${channel}\u0000${id}`) ?? -Infinity) >= since;
  });
}

/** An empty reply card closes with this when the turn's content went out on its own. */
export const SENT_SEPARATELY_TEXT = "✅ 已发送";

// ------------------------------------------------- DingTalk conversation ids
//
// The core folds the peer id of a DingTalk group to lower case in the session
// key, and a delivery target derived from the session carries the folded id.
// DingTalk's openConversationId is case-sensitive base64: the robot message
// API rejects the folded spelling (400 invalid.openConversationId). The
// session keys stay as they are; outbound sends put the original spelling
// back. Originals come from inbound group messages (kept in a small file under
// the state dir, shared by the Gateway and its workers and kept across
// restarts) and, for a group that has not written since, from the delivery
// fields of its session entry.
const DINGTALK_IDS = Symbol.for("openclaw.v.dingtalkConversationIds");
export const DINGTALK_IDS_FILE = "v-conversation-ids.json";
const DINGTALK_LOOKUP_RETRY_MS = 10 * 60 * 1000;
const DINGTALK_IDS_MAX = 2000;

const dingtalkIdsState = () => (globalThis[DINGTALK_IDS] ??= { file: "", mtimeMs: -1, ids: new Map(), lookedUp: new Map(), logged: new Set() });
const dingtalkIdsPath = (stateDir) => (stateDir ? `${String(stateDir).replace(/\/+$/u, "")}/dingtalk-connector/${DINGTALK_IDS_FILE}` : "");
/** An openConversationId (`cid…`) that may have lost its case. */
const isDingtalkConversationId = (id) => /^cid[\w+/=-]{8,}$/iu.test(id);

function loadDingtalkIds(file) {
  const state = dingtalkIdsState();
  const fs = globalThis.process?.getBuiltinModule?.("node:fs");
  if (!fs || !file) return state;
  let mtimeMs;
  try { mtimeMs = fs.statSync(file).mtimeMs; } catch { mtimeMs = 0; }
  if (state.file === file && state.mtimeMs === mtimeMs) return state;
  state.file = file;
  state.mtimeMs = mtimeMs;
  if (!mtimeMs) return state;
  try {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"))?.ids ?? {};
    for (const [folded, originals] of Object.entries(saved)) {
      const known = state.ids.get(folded) ?? new Set();
      for (const original of Array.isArray(originals) ? originals : []) if (typeof original === "string" && original.toLowerCase() === folded) known.add(original);
      if (known.size) state.ids.set(folded, known);
    }
  } catch {}
  return state;
}

function saveDingtalkIds(file, log) {
  const fs = globalThis.process?.getBuiltinModule?.("node:fs");
  if (!fs || !file) return;
  // Merge with what other processes wrote since this one last read the file.
  const state = loadDingtalkIds(file);
  const ids = {};
  for (const [folded, originals] of [...state.ids].slice(-DINGTALK_IDS_MAX)) ids[folded] = [...originals].sort();
  try {
    fs.mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${globalThis.process?.pid ?? 0}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify({ version: 1, ids }, null, 1)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, file);
    state.mtimeMs = fs.statSync(file).mtimeMs;
  } catch (err) {
    log?.(`v-experience: dingtalk conversation ids not saved: ${String(err?.message ?? err)}`);
  }
}

/** Learns the original spelling of a DingTalk conversation id; returns whether it was new. */
export function rememberDingtalkConversationId(id, { stateDir, log } = {}) {
  const original = String(id ?? "").trim();
  if (!isDingtalkConversationId(original) || original === original.toLowerCase()) return false;
  const file = dingtalkIdsPath(stateDir);
  const state = file ? loadDingtalkIds(file) : dingtalkIdsState();
  const folded = original.toLowerCase();
  const known = state.ids.get(folded) ?? new Set();
  if (known.has(original)) return false;
  known.add(original);
  state.ids.set(folded, known);
  state.lookedUp.delete(folded);
  saveDingtalkIds(file, log);
  return true;
}

/** Original spellings of `folded` found among the strings of a session entry. */
export function dingtalkIdsInEntry(entry, folded) {
  const found = new Set();
  const visit = (value, depth) => {
    if (typeof value === "string") {
      if (value.length > 200) return;
      const id = channelTargetId(value);
      if (id !== folded && id.toLowerCase() === folded) found.add(id);
    } else if (value && typeof value === "object" && depth < 6) {
      for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child, depth + 1);
    }
  };
  visit(entry, 0);
  return [...found];
}

/**
 * `to` with the original spelling of its DingTalk conversation id. Only an
 * all-lower-case `cid…` id is changed, and only when exactly one original is
 * known; `lookup(folded)` (the session entry's delivery fields) is asked at
 * most once per id every ten minutes when neither the memory nor the file
 * knows it. Any target prefix (`group:`, `channel:`) is kept.
 */
export function restoreDingtalkTarget(to, { stateDir, lookup, log } = {}) {
  const raw = String(to ?? "").trim();
  const id = channelTargetId(raw);
  if (!isDingtalkConversationId(id) || id !== id.toLowerCase()) return to;
  const file = dingtalkIdsPath(stateDir);
  const state = file ? loadDingtalkIds(file) : dingtalkIdsState();
  let known = state.ids.get(id);
  let fromSession = false;
  if (!known?.size && lookup && Date.now() - (state.lookedUp.get(id) ?? -Infinity) >= DINGTALK_LOOKUP_RETRY_MS) {
    state.lookedUp.set(id, Date.now());
    let found = [];
    try { found = lookup(id) ?? []; } catch (err) { log?.(`v-experience: dingtalk session lookup failed for ${id}: ${String(err?.message ?? err)}`); }
    for (const original of found) rememberDingtalkConversationId(original, { stateDir, log });
    known = state.ids.get(id);
    fromSession = Boolean(known?.size);
  }
  if (!known?.size) return to;
  if (known.size > 1) {
    if (!state.logged.has(`ambiguous:${id}`)) {
      state.logged.add(`ambiguous:${id}`);
      log?.(`v-experience: dingtalk target ${id} left as is: ${known.size} conversations fold to it (${[...known].join(", ")})`);
    }
    return to;
  }
  const [original] = known;
  if (!state.logged.has(`restored:${id}`)) {
    state.logged.add(`restored:${id}`);
    log?.(`v-experience: dingtalk target ${id} sent as ${original}${fromSession ? " (from its session)" : ""}`);
  }
  return raw.slice(0, raw.length - id.length) + original;
}

// ---------------------------------------------------------------- telegram

/** Callback data prefix owned by v-experience; Telegram allows 64 bytes. */
export const TELEGRAM_CALLBACK_PREFIX = "tgv1:";

export function isTelegramExperienceCallback(data) {
  return typeof data === "string" && data.trim().startsWith(TELEGRAM_CALLBACK_PREFIX);
}

export function parseTelegramExperienceCallback(data) {
  const m = /^tgv1:(t|c):([a-f0-9]{32})(?::([0-2]):([0-7]))?$/.exec(String(data ?? "").trim());
  if (!m) return undefined;
  const id = `ask_${m[2]}`;
  if (m[1] === "c") return m[3] === undefined ? { kind: "confirm", id } : undefined;
  return m[3] === undefined ? undefined : { kind: "toggle", id, questionIndex: Number(m[3]), optionIndex: Number(m[4]) };
}

const escapeHtml = (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A staged question as Telegram HTML, laid out like V's Feishu question card:
 * the question in bold, the options as buttons (listed only when they carry a
 * description), a short hint; once closed, the question and "✓ 已选择：…".
 */
export function telegramAskHtml(record, state = "pending", { answers, immediate = false } = {}) {
  const numbered = record.questions.length > 1;
  const title = (q, i) => `<b>${numbered ? `${i + 1}. ` : ""}${escapeHtml(q.question)}</b>`;
  if (state !== "pending") {
    const summary = askSummary(record, answers);
    const head = state === "answered" ? summary ? `✓ 已选择：${escapeHtml(summary)}` : "✓ 已收到回答" : state === "expired" ? "问题已过期" : "问题已取消";
    return [record.questions.map(title).join("\n"), head].join("\n\n");
  }
  const blocks = record.questions.map((q, i) => {
    const lines = [`${title(q, i)}${q.multiSelect ? "（可多选）" : ""}`];
    if (q.options.some((o) => o.description)) for (const o of q.options) lines.push(`• ${escapeHtml(o.label)}${o.description ? ` — ${escapeHtml(o.description)}` : ""}`);
    if (!q.options.length) lines.push("直接回复你的回答");
    return lines.join("\n");
  });
  const hint = immediate ? "点一个选项，或直接回复答案。" : numbered ? "选好后点「确认」；也可以直接回复，例如「1. 爬山」逐行回答。" : "选好后点「确认」，或直接回复答案。";
  return [blocks.join("\n\n"), `<i>${hint}</i>`].join("\n\n");
}

/** Inline keyboard rows for a staged question. */
export function telegramAskKeyboard(record, { choices = {} } = {}) {
  const hex = record.id.slice(4);
  const numbered = record.questions.length > 1;
  const rows = [];
  record.questions.forEach((q, i) => {
    let row = [];
    q.options.forEach((o, j) => {
      const picked = (choices[i] ?? []).includes(j);
      const label = `${picked ? "✅ " : ""}${numbered ? `${i + 1}·` : ""}${o.label}`;
      row.push({ text: label.length > 60 ? `${label.slice(0, 59)}…` : label, callback_data: `tgv1:t:${hex}:${i}:${j}` });
      if (row.length === 2 || o.label.length > 14) { rows.push(row); row = []; }
    });
    if (row.length) rows.push(row);
  });
  rows.push([{ text: "确认", callback_data: `tgv1:c:${hex}` }]);
  return rows;
}

/** Forget a tracked chat question (answered some other way). */
export function untrackChatQuestion(id) {
  for (const [key, entries] of chatQuestions) {
    const left = entries.filter((e) => e.record.id !== id);
    if (left.length !== entries.length) chatQuestions.set(key, left);
  }
}

/**
 * Telegram: questions as a message with option buttons (single choice: one
 * tap answers; multiple choice or several questions: toggle, then 确认), plus
 * typed answers. Runs before Telegram's per-chat queue, which would otherwise
 * hold an answer behind the turn that is waiting for it.
 *
 * `call(method, params)` is a Gateway call with operator.questions scope.
 */
export function createTelegramExperience({ call, log }) {
  const asks = createAskRuntime({
    getQuestion: async (id) => (await call("question.get", { id }))?.question,
    resolve: (id, answers, resolvedBy) => call("question.resolve", { id, answers, resolvedBy }),
    log,
  });
  const askers = new Map(); // question id -> asker user id (string) or undefined
  const immediate = (record) => record.questions.length === 1 && !record.questions[0].multiSelect;

  const keyboard = (record, choices) => {
    const rows = telegramAskKeyboard(record, { choices });
    return immediate(record) ? rows.slice(0, -1) : rows;
  };

  /** `beforeSend` runs once the question is ours to show, before its message (the turn moves its working message out of the way). */
  async function deliverQuestion({ api, chatId, extra = {}, senderId, record, beforeSend }) {
    if (!record?.id) return false;
    const secret = record.questions?.some((q) => q.isSecret || q.secretStore);
    if (!secret && !isRenderableAsk(record)) return false;
    if (!claimQuestionDelivery(record.id)) return true;
    try { await beforeSend?.(); } catch (error) { log?.(`v-experience: telegram question ${record.id} beforeSend failed: ${String(error?.message ?? error)}`); }
    if (secret) {
      // A private chat's id is the user's id; a group hears the link went to the asker's DM.
      const noPreview = { link_preview_options: { is_disabled: true } };
      // The link behind a 填写凭据 button; Telegram refuses buttons whose url is
      // not a public http(s) address (BUTTON_URL_INVALID), then it is a text link.
      const send = (to, options) => (text, card) => sendCardOrText({
        card, text, log,
        sendCard: (c) => { const tg = telegramLinkCard(c); return api.sendMessage(to, tg.text, { ...options, ...noPreview, ...tg.options }); },
        sendText: (t) => api.sendMessage(to, t, { ...options, ...noPreview }),
      });
      const how = await deliverSecretQuestion({
        record, channel: "telegram", askerId: senderId, log,
        direct: senderId != null && String(chatId) === String(senderId),
        sendHere: send(chatId, extra),
        sendPrivate: senderId != null ? send(senderId, {}) : undefined,
        cancel: () => call("question.resolve", { id: record.id, cancel: true, resolvedBy: "telegram:credential-unsupported" }),
      });
      log?.(`v-experience: telegram credential question ${record.id} ${how}`);
      return true;
    }
    askers.set(record.id, senderId ? String(senderId) : undefined);
    await api.sendMessage(chatId, telegramAskHtml(record, "pending", { immediate: immediate(record) }), { ...extra, parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard(record, {}) } });
    trackChatQuestion({ channel: "telegram", chatKey: String(chatId), senderId, record });
    log?.(`v-experience: telegram question ${record.id} delivered`);
    return true;
  }

  async function onCallback(ctx) {
    const cb = ctx.callbackQuery;
    const parsed = parseTelegramExperienceCallback(cb?.data);
    if (!parsed) return false;
    const toast = (text) => ctx.api.answerCallbackQuery(cb.id, { text }).catch(() => {});
    const asker = askers.get(parsed.id);
    const sender = String(cb.from?.id ?? "");
    if (asker && asker !== sender) { await toast("这个问题在问别人。"); return true; }
    const chatId = cb.message?.chat?.id;
    const messageId = cb.message?.message_id;
    const repaint = async (entry, state, extra = {}) => {
      const done = state !== "pending";
      const html = telegramAskHtml(entry.record, state, { answers: entry.answers ?? extra.answers, immediate: immediate(entry.record) });
      await ctx.api.editMessageText(chatId, messageId, html,
        done ? { parse_mode: "HTML" } : { parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard(entry.record, extra.choices ?? {}) } }).catch(() => {});
    };
    try {
      if (parsed.kind === "toggle") {
        const staged = await asks.choose(parsed.id, sender, parsed.questionIndex, parsed.optionIndex);
        if (staged.kind === "invalid") { await toast("这个选项已失效。"); return true; }
        if (staged.kind === "closed") { await toast("这个问题已经结束了。"); await repaint(staged.entry, staged.entry.state); return true; }
        if (!immediate(staged.entry.record)) { await toast("已选择，选好后按「确认」。"); await repaint(staged.entry, "pending", { choices: staged.choices }); return true; }
      }
      const result = await asks.confirm(parsed.id, sender, `telegram:${sender}`);
      if (result.kind === "incomplete") { await toast(result.message); return true; }
      if (result.kind === "busy") { await toast("正在提交，请稍候。"); return true; }
      if (result.kind === "invalid") { await toast("这个问题已失效。"); return true; }
      untrackChatQuestion(parsed.id);
      await toast(result.kind === "answered" ? "已收到，V 会继续。" : "这个问题已经结束了。");
      await repaint(result.entry, result.entry.state, { answers: result.answers });
    } catch (error) {
      log?.(`v-experience: telegram question callback failed ${parsed.id}: ${String(error?.message ?? error)}`);
      await toast("提交失败，请再试一次。");
    }
    return true;
  }

  async function onMessage(ctx) {
    const msg = ctx.message;
    const text = msg?.text;
    if (!msg || typeof text !== "string" || text.trim().startsWith("/")) return false;
    const chatKey = String(msg.chat?.id);
    const sender = msg.from?.id != null ? String(msg.from.id) : undefined;
    if (!hasTrackedQuestion({ channel: "telegram", chatKey, senderId: sender })) return false;
    const result = await answerTrackedQuestion({
      channel: "telegram", chatKey, senderId: sender, text,
      resolvedBy: `telegram:chat:${sender}:${msg.message_id}`,
      resolve: (id, answers, resolvedBy) => call("question.resolve", { id, answers, resolvedBy }),
      log,
    });
    if (!result.handled) return false;
    if (result.notice) await ctx.api.sendMessage(msg.chat.id, result.notice, { reply_parameters: { message_id: msg.message_id } }).catch(() => {});
    return true;
  }

  /** grammY middleware, installed before the per-chat sequencer. */
  const middleware = async (ctx, next) => {
    try {
      if (ctx.callbackQuery && isTelegramExperienceCallback(ctx.callbackQuery.data)) { await onCallback(ctx); return; }
      if (ctx.message && await onMessage(ctx)) return;
    } catch (error) {
      log?.(`v-experience: telegram middleware failed: ${String(error?.message ?? error)}`);
    }
    await next();
  };

  return { deliverQuestion, middleware };
}

/** One Telegram experience per process, shared by the dispatch and ingress chunks. */
export function telegramExperience(options) {
  const key = Symbol.for("openclaw.v.experience.telegram");
  globalThis[key] ??= createTelegramExperience(options);
  return globalThis[key];
}

export function installVExperience() {
  const key = Symbol.for("openclaw.v.experience");
  const existing = globalThis[key];
  if (existing?.version === V_EXPERIENCE_VERSION) return existing;
  const api = { version: V_EXPERIENCE_VERSION };
  globalThis[key] = api;
  return api;
}
