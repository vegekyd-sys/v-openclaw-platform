// Feishu streaming-card rendering of an OpenClaw session progress card.
//
// Every agent runtime (codex, claude-cli, the V worker, the built-in runtime)
// reaches the same Gateway method when it maintains its progress card:
// `progressCard.put`. `patch-feishu-progress-stream.mjs` makes that method tell
// in-process listeners about each change, and this module turns the stored card
// ({ markdown?, steps? }) into the markdown block the Feishu reply card streams
// under the agent's commentary. One renderer, whatever runtime wrote the card.
//
// Pure functions only (no imports): the patcher inlines this file into the
// Feishu monitor bundle, so it must stay self-contained.

const V_PROGRESS_MAX_VISIBLE_STEPS = 12;
const V_PROGRESS_MAX_STEP_CHARS = 120;
const V_PROGRESS_MAX_MARKDOWN_CHARS = 1500;
const V_PROGRESS_BAR_CELLS = 10;

// Card markdown renders <font>, <at>, emphasis and strikethrough. Step text is
// plain agent text, so it must not be able to open any of them.
function vProgressEscapeStep(text) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  const clipped = clean.length > V_PROGRESS_MAX_STEP_CHARS ? `${clean.slice(0, V_PROGRESS_MAX_STEP_CHARS - 1)}…` : clean;
  return clipped.replace(/[<>*~]/g, (char) => `&#${char.charCodeAt(0)};`);
}

function vProgressAttr(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

function vProgressCells(ratio) {
  const filled = Math.round(Math.min(1, Math.max(0, ratio)) * V_PROGRESS_BAR_CELLS);
  return "▰".repeat(filled) + "▱".repeat(V_PROGRESS_BAR_CELLS - filled);
}

/** `<progress value max aria-label>` has no Feishu equivalent; draw it as a text bar. */
function vProgressBar(tag) {
  const value = Number(vProgressAttr(tag, "value"));
  const max = Number(vProgressAttr(tag, "max") ?? 1);
  const label = vProgressAttr(tag, "aria-label");
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return label ? vProgressEscapeStep(label) : "";
  const ratio = Math.min(1, Math.max(0, value / max));
  const bar = vProgressCells(ratio);
  return label ? `${bar} ${vProgressEscapeStep(label)}` : `${bar} ${Math.round(ratio * 100)}%`;
}

/**
 * The card's markdown note. Upstream keeps one <progress> bar and strips every
 * other tag; do the same here, which also keeps agent text from forging
 * mentions or colours in the Feishu card.
 */
function vProgressNote(markdown) {
  if (typeof markdown !== "string") return "";
  let text = markdown
    .replace(/<progress\b[^>]*>(?:\s*<\/progress>)?/gi, (tag) => vProgressBar(tag))
    .replace(/<\/?[A-Za-z][^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length > V_PROGRESS_MAX_MARKDOWN_CHARS) text = `${text.slice(0, V_PROGRESS_MAX_MARKDOWN_CHARS - 1)}…`;
  return text;
}

function vProgressStepLine(step) {
  const text = vProgressEscapeStep(step.step);
  if (step.status === "completed") return `✅ <font color='grey'>${text}</font>`;
  if (step.status === "in_progress") return `🔄 **${text}**`;
  return `⬜ <font color='grey'>${text}</font>`;
}

/** Long plans: fold the finished head into one line and keep the live window. */
function vProgressVisibleSteps(steps) {
  if (steps.length <= V_PROGRESS_MAX_VISIBLE_STEPS) return { folded: 0, steps, hidden: 0 };
  const firstOpen = steps.findIndex((step) => step.status !== "completed");
  const leadingDone = firstOpen === -1 ? steps.length : firstOpen;
  // Keep the last finished step visible so the reader sees what just happened.
  const folded = Math.max(0, Math.min(leadingDone - 1, steps.length - (V_PROGRESS_MAX_VISIBLE_STEPS - 1)));
  const room = V_PROGRESS_MAX_VISIBLE_STEPS - (folded > 0 ? 1 : 0);
  const visible = steps.slice(folded, folded + room);
  return { folded, steps: visible, hidden: steps.length - folded - visible.length };
}

function vProgressNormalizeSteps(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const step = typeof entry.step === "string" ? entry.step.trim() : "";
    if (!step) return [];
    const status = entry.status === "completed" || entry.status === "in_progress" ? entry.status : "pending";
    return [{ step, status }];
  });
}

/** Markdown for the progress block of a streaming reply card; "" clears it. */
export function renderFeishuProgressMarkdown(card) {
  if (!card || typeof card !== "object") return "";
  const steps = vProgressNormalizeSteps(card.steps);
  const note = vProgressNote(card.markdown);
  if (steps.length === 0 && !note) return "";
  const lines = [];
  if (steps.length > 0) {
    const done = steps.filter((step) => step.status === "completed").length;
    lines.push(`**📋 进度** ${vProgressCells(done / steps.length)} ${done}/${steps.length}`);
    const view = vProgressVisibleSteps(steps);
    if (view.folded > 0) lines.push(`✅ <font color='grey'>已完成 ${view.folded} 步</font>`);
    for (const step of view.steps) lines.push(vProgressStepLine(step));
    if (view.hidden > 0) lines.push(`<font color='grey'>…还有 ${view.hidden} 步</font>`);
  } else {
    lines.push("**📋 进度**");
  }
  if (note) lines.push(steps.length > 0 ? `\n${note}` : note);
  return lines.join("\n");
}

/** Tool names a progress-card write arrives under: native, MCP-bridged, namespaced. */
export function isFeishuProgressCardToolName(name) {
  return typeof name === "string" && /(?:^|__|\.)progress_card$/i.test(name.trim());
}

