// The background-work line of a Feishu reply card.
//
// A session's background work (subagents of any runtime, background commands,
// media generation, automation runs) lives in the OpenClaw task registry, and
// usually outlives the reply that started it. `patch-feishu-task-status.mjs`
// exposes that registry to the Feishu monitor; this module turns a session's
// active tasks into one line under the card footer, so a reader can see that
// work is still going on and how much, without its content.
//
// Pure functions only (no imports): the patcher inlines this file into the
// Feishu monitor bundle, so it must stay self-contained.

const V_TASK_STATUS_KIND_ORDER = ["子 agent", "后台命令", "生图", "生成视频", "生成音乐", "自动化", "后台任务"];

/** What a task is, in the words the card uses. */
export function feishuTaskStatusKind(task) {
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

/**
 * The session's background work among its active tasks. A run of the session
 * itself (an `openclaw agent` turn is registered as a cli task without a kind,
 * whose child is the session) is foreground, not background.
 */
export function feishuBackgroundTasks(tasks, sessionKey) {
  const key = typeof sessionKey === "string" ? sessionKey.trim().toLowerCase() : "";
  return (Array.isArray(tasks) ? tasks : []).filter((task) => {
    const child = typeof task?.childSessionKey === "string" ? task.childSessionKey.trim().toLowerCase() : "";
    return !(task?.runtime === "cli" && !task.taskKind && child === key);
  });
}

/**
 * The line for a session's active tasks. "" when nothing is running and the
 * card never showed running work; a closing line once work it showed is done.
 */
export function renderFeishuTaskStatusLine(tasks, { shownActive = false } = {}) {
  const active = Array.isArray(tasks) ? tasks : [];
  if (active.length === 0) return shownActive ? "☑️ 后台任务已结束" : "";
  const counts = new Map();
  for (const task of active) {
    const kind = feishuTaskStatusKind(task);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const kinds = V_TASK_STATUS_KIND_ORDER.filter((kind) => counts.has(kind));
  const detail = kinds.length === 1 ? kinds[0] : kinds.map((kind) => `${kind} ${counts.get(kind)}`).join("、");
  return `⏳ 后台 ${active.length} 个任务进行中：${detail}`;
}

/** The card footer with the background-work line under it. */
export function composeFeishuTaskStatusNote(baseNote, line) {
  const base = typeof baseNote === "string" ? baseNote : "";
  if (!line) return base;
  return base ? `${base}\n${line}` : line;
}
