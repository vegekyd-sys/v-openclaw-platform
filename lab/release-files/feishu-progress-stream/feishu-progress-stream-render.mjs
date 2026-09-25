// Feishu streaming-card rendering of an OpenClaw session progress card.
//
// Every agent runtime (codex, claude-cli, the V worker, the built-in runtime)
// reaches the same Gateway method when it maintains its progress card:
// `progressCard.put`. `patch-feishu-progress-stream.mjs` makes that method tell
// in-process listeners about each change, and this module turns the card's plan
// into the work checklist the Feishu reply card shows under the streaming
// commentary. One renderer, whatever runtime wrote the card.
//
// Only the plan is shown: finished steps struck through, the live step marked,
// the rest pending. The card's markdown note is not shown — agents use it to
// restate progress, which made the reply read like a status report and
// duplicated the checklist.
//
// Pure functions only (no imports): the patcher inlines this file into the
// Feishu monitor bundle, so it must stay self-contained.

const V_PROGRESS_MAX_VISIBLE_STEPS = 12;
const V_PROGRESS_MAX_STEP_CHARS = 120;

// Card markdown renders <font>, <at>, emphasis and strikethrough. Step text is
// plain agent text, so it must not be able to open any of them.
function vProgressEscapeStep(text) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  const clipped = clean.length > V_PROGRESS_MAX_STEP_CHARS ? `${clean.slice(0, V_PROGRESS_MAX_STEP_CHARS - 1)}…` : clean;
  return clipped.replace(/[<>*~]/g, (char) => `&#${char.charCodeAt(0)};`);
}

function vProgressStepLine(step) {
  const text = vProgressEscapeStep(step.step);
  if (step.status === "completed") return `☑️ <font color='grey'>~~${text}~~</font>`;
  if (step.status === "in_progress") return `▶️ **${text}**　<font color='blue'>进行中</font>`;
  return `◻️ <font color='grey'>${text}</font>`;
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

/** The work checklist for a streaming reply card; "" when the card has no plan. */
export function renderFeishuProgressMarkdown(card) {
  if (!card || typeof card !== "object") return "";
  const steps = vProgressNormalizeSteps(card.steps);
  if (steps.length === 0) return "";
  const view = vProgressVisibleSteps(steps);
  const lines = [];
  if (view.folded > 0) lines.push(`☑️ <font color='grey'>已完成 ${view.folded} 步</font>`);
  for (const step of view.steps) lines.push(vProgressStepLine(step));
  if (view.hidden > 0) lines.push(`<font color='grey'>…还有 ${view.hidden} 步</font>`);
  return lines.join("\n");
}

/** Tool names a progress-card write arrives under: native, MCP-bridged, namespaced. */
export function isFeishuProgressCardToolName(name) {
  return typeof name === "string" && /(?:^|__|\.)progress_card$/i.test(name.trim());
}
