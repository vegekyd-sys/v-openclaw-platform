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
// What the agent is doing while a reply is being written, for channels whose
// reply is one message that can be rewritten (DingTalk AI card, WeCom stream):
// the plan from the progress card, the current tool and the latest
// commentary. It is working state: the finished reply shows only the answer.

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

/**
 * Per-reply work state. `onChange()` is called whenever what should be shown
 * changes; `markdown()` renders it (standard markdown, no HTML).
 */
export function createWorkView({ sessionKey, onChange = () => {}, maxCommentary = 2, log } = {}) {
  let steps = [];
  const seen = { card: 0, tool: 0, item: 0, plan: 0 };
  let lastAnswerLength = 0;
  let tool = "";
  let compacting = false;
  let question = false;
  let answerLength = 0; // answer length when the status line was set
  const commentary = new Map(); // itemId -> text
  let disposed = false;
  const changed = () => { if (!disposed) try { onChange(); } catch {} };
  const unsubscribe = subscribeProgressCard(sessionKey, (next) => { seen.card += 1; steps = next; changed(); });
  return {
    toolStart(payload) {
      seen.tool += 1;
      question = false;
      const name = payload?.name;
      if (!name || isProgressCardToolName(name)) return false;
      if (payload.phase && payload.phase !== "start") return false;
      const label = toolActivityLabel(name);
      if (label === tool) return false;
      tool = label;
      answerLength = lastAnswerLength;
      changed();
      return true;
    },
    itemEvent(payload) {
      seen.item += 1;
      if (payload?.kind !== "preamble" && payload?.kind !== "commentary") return false;
      const text = String(payload.progressText ?? payload.text ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").replace(/\s+/g, " ").trim();
      if (!text) return false;
      const id = payload.itemId ?? `c${commentary.size}`;
      commentary.delete(id);
      commentary.set(id, text.length > 160 ? `${text.slice(0, 159)}…` : text);
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
    compaction(active) { compacting = active; changed(); },
    questionPending(active) { question = active; answerLength = lastAnswerLength; changed(); },
    hasContent: () => steps.length > 0 || Boolean(tool) || commentary.size > 0 || compacting || question,
    markdown() {
      const lines = [];
      for (const text of commentary.values()) lines.push(`💬 ${escapeMarkdown(text)}`);
      if (steps.length) {
        if (lines.length) lines.push("");
        const done = steps.filter((s) => s.status === "completed").length;
        const fold = steps.length > 12 ? Math.max(0, Math.min(done - 1, steps.length - 11)) : 0;
        if (fold) lines.push(`✅ 已完成 ${fold} 步`);
        for (const s of steps.slice(fold, fold + 12)) {
          const text = escapeMarkdown(s.step);
          lines.push(s.status === "completed" ? `✅ ${text}` : s.status === "in_progress" ? `▶️ **${text}**（进行中）` : `◻️ ${text}`);
        }
      }
      const status = question ? "❓ 等你回答上面的问题" : compacting ? "🗜️ 正在整理上下文" : tool ? `⚙️ 正在${tool}` : "";
      if (status) { if (lines.length) lines.push(""); lines.push(status); }
      return lines.join("\n");
    },
    /** The streaming content: the answer so far, then the work under a rule. */
    compose(answer) {
      const text = String(answer ?? "").trimEnd();
      // Once the answer moves on, the tool or question it was waiting for is over.
      lastAnswerLength = text.length;
      if ((tool || question) && text.length > answerLength) { tool = ""; question = false; }
      const work = this.markdown();
      if (!work) return text;
      return text ? `${text}\n\n---\n\n${work}` : work;
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

const KIND_ORDER = ["子 agent", "后台命令", "生图", "生成视频", "生成音乐", "自动化", "后台任务"];

/** What a task is, in the words V uses. */
export function backgroundKind(task) {
  const runtime = task?.runtime;
  const kind = typeof task?.taskKind === "string" ? task.taskKind : "";
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

// ------------------------------------------------- questions asked in chat
//
// Channels without buttons show a question as a chat message and take the
// next message in that chat as the answer. Answering goes straight to the
// Gateway's `question.resolve`, before the channel queues the message: a
// channel that runs one turn per chat at a time would otherwise park the
// answer behind the very turn that is waiting for it (Feishu #162).

const chatQuestions = new Map(); // `${channel}|${chatKey}` -> entries, newest last

/** Remembers a question shown in a chat until it is answered or expires. */
export function trackChatQuestion({ channel, chatKey, senderId, record }) {
  if (!isRenderableAsk(record)) return false;
  const key = `${channel}|${chatKey}`;
  const entries = (chatQuestions.get(key) ?? []).filter((e) => e.record.id !== record.id && !expired(e));
  entries.push({ record, senderId: senderId ? String(senderId) : undefined, staged: {}, at: Date.now() });
  chatQuestions.set(key, entries);
  return true;
}

const expired = (entry) => (entry.record.expiresAtMs ?? entry.at + 30 * 60_000) <= Date.now();

/** True when a message in this chat would be taken as an answer. */
export function hasTrackedQuestion({ channel, chatKey, senderId }) {
  return (chatQuestions.get(`${channel}|${chatKey}`) ?? []).some((e) => !expired(e) && (!e.senderId || !senderId || e.senderId === String(senderId)));
}

/**
 * Takes a chat message as the answer to the newest waiting question.
 * Returns {handled:false} when there is none (or it has already ended
 * elsewhere), so the message goes on as a normal message.
 */
export async function answerTrackedQuestion({ channel, chatKey, senderId, text, resolve, resolvedBy, log }) {
  const key = `${channel}|${chatKey}`;
  const entries = (chatQuestions.get(key) ?? []).filter((e) => !expired(e));
  chatQuestions.set(key, entries);
  const entry = [...entries].reverse().find((e) => !e.senderId || !senderId || e.senderId === String(senderId));
  if (!entry || typeof text !== "string" || !text.trim()) return { handled: false };
  let result;
  try { result = readAskChatAnswers(entry.record, text, entry.staged); }
  catch (error) { return { handled: true, notice: error.message }; }
  if (result.remaining.length) {
    entry.staged = result.answers;
    return { handled: true, notice: `已记下。请继续回答「${result.remaining[0].question}」。` };
  }
  const drop = () => chatQuestions.set(key, (chatQuestions.get(key) ?? []).filter((e) => e !== entry));
  try {
    await resolve(entry.record.id, { answers: result.answers }, resolvedBy ?? `${channel}:chat:${senderId ?? "unknown"}`);
    drop();
    log?.(`v-experience: ${channel} chat answer resolved ${entry.record.id}`);
    return { handled: true, notice: `✓ 已收到：${askSummary(entry.record, { answers: result.answers })}` };
  } catch (error) {
    const reason = error?.details?.reason;
    if (reason === "QUESTION_ALREADY_TERMINAL" || reason === "QUESTION_NOT_FOUND" || /terminal|not.?found/i.test(String(error?.message ?? ""))) {
      drop();
      return { handled: false };
    }
    log?.(`v-experience: ${channel} chat answer failed ${entry.record.id}: ${String(error?.message ?? error)}`);
    return { handled: true, notice: "回答提交失败，请再回复一次。" };
  }
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

/** The message text for a staged question (plain text, no markup). */
export function telegramAskText(record, state = "pending", { choices = {}, answers } = {}) {
  if (state !== "pending") {
    const summary = askSummary(record, answers);
    const head = state === "answered" ? summary ? `✓ 已选择：${summary}` : "✓ 已收到回答" : state === "expired" ? "问题已过期" : "问题已取消";
    return [...record.questions.map((q) => q.question), "", head].join("\n");
  }
  const lines = [];
  const numbered = record.questions.length > 1;
  record.questions.forEach((q, i) => {
    if (i > 0) lines.push("");
    lines.push(`${numbered ? `${i + 1}. ` : ""}${q.question}${q.multiSelect ? "（可多选）" : ""}`);
    q.options.forEach((o, j) => {
      const picked = (choices[i] ?? []).includes(j);
      lines.push(`${picked ? "✅" : "▫️"} ${o.label}${o.description ? ` — ${o.description}` : ""}`);
    });
    if (!q.options.length) lines.push("（直接回复你的回答）");
  });
  lines.push("", numbered ? "点选后按「确认」。也可以直接回复，例如「1. 爬山」逐行回答。" : "点选后按「确认」。也可以直接回复答案。");
  return lines.join("\n");
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

/** Plan steps for the stock Telegram progress draft (`pushPlanProgress`). */
export function telegramPlanSteps(steps) {
  return normalizePlanSteps(steps).map((s) => ({ step: s.step, status: s.status }));
}

export function installVExperience() {
  const key = Symbol.for("openclaw.v.experience");
  const existing = globalThis[key];
  if (existing?.version === V_EXPERIENCE_VERSION) return existing;
  const api = { version: V_EXPERIENCE_VERSION };
  globalThis[key] = api;
  return api;
}
