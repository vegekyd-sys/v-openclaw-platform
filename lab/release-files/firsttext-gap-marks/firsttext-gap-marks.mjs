// OPENCLAW_FIRSTTEXT_GAP_MARKS_V1: diagnostic stage marks between worker-command-enter and prompt prep.
// Emits only timing/identity fields. loopBusyPct is this process's event-loop utilization since the
// previous mark of the same run: near 100 means the loop was busy (CPU contention), near 0 means the
// run was waiting on something asynchronous (a queue, a lock, I/O).
import { performance } from "node:perf_hooks";

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^DB91_HI_[0-9]+_[a-z0-9_]+$/i;
const STAGE = /^[a-z0-9:._-]{1,64}$/;
const DETAIL = /^[A-Za-z0-9=,._:-]{1,200}$/;
const enabled = () => process.env.OPENCLAW_FIRSTTEXT_WORKER_PHASES === "1" && process.env.OPENCLAW_FIRSTTEXT_GAP_MARKS !== "0";
const previousByRun = new Map();

export function firsttextGapMark(stage, runId, detail) {
  try {
    if (!enabled()) return;
    if (typeof runId !== "string" || !RUN_ID.test(runId) || typeof stage !== "string" || !STAGE.test(stage)) return;
    const monoMs = performance.now();
    const elu = performance.eventLoopUtilization();
    const row = { v: 1, stage, runId, pid: process.pid, atMs: Date.now(), monoMs: Math.round(monoMs) };
    if (typeof detail === "string" && DETAIL.test(detail)) row.detail = detail;
    const previous = previousByRun.get(runId);
    if (previous) {
      row.sincePrevMs = Math.round(monoMs - previous.monoMs);
      row.loopBusyPct = Math.round(performance.eventLoopUtilization(elu, previous.elu).utilization * 100);
    }
    previousByRun.delete(runId);
    if (previousByRun.size >= 256) previousByRun.delete(previousByRun.keys().next().value);
    previousByRun.set(runId, { monoMs, elu });
    console.error("[firsttext-gap.1] " + JSON.stringify(row));
  } catch { /* Observation must not alter runtime control flow. */ }
}

// Why the skills snapshot resolve did or did not rebuild: new session, existing snapshot present,
// refresh decided, existing version older than the current one, current version's age relative to
// this process start (s; > a few s means a bump after startup), resolvedSkills hydration needed.
export function firsttextSkillDetail(isNewSession, existing, state) {
  try {
    const version = state?.snapshotVersion;
    const sinceStartS = typeof version === "number" ? Math.round((version - performance.timeOrigin) / 1000) : "na";
    return [
      `new=${isNewSession ? 1 : 0}`,
      `existing=${existing ? 1 : 0}`,
      `refresh=${state?.shouldRefresh ? 1 : 0}`,
      `older=${existing && typeof version === "number" && (existing.version ?? 0) < version ? 1 : 0}`,
      `prompt=${existing && existing.promptFormatVersion !== 4 ? 1 : 0}`,
      `hydrate=${existing && existing.resolvedSkills === undefined ? 1 : 0}`,
      `verSinceStartS=${sinceStartS}`,
    ].join(",");
  } catch {
    return undefined;
  }
}

// [firsttext-skills-bump.1]: every skills snapshot version bump in this process (watcher change,
// watch-target change), with the reason and changed path. Registered once per process.
const WATCH_KEY = Symbol.for("openclaw.firsttext.skills-bump-watch");
export function firsttextWatchSkillsBumps(register) {
  try {
    if (!enabled() || globalThis[WATCH_KEY] || typeof register !== "function") return;
    globalThis[WATCH_KEY] = true;
    register((event) => {
      try {
        const changedPath = typeof event?.changedPath === "string" ? event.changedPath.slice(-240) : undefined;
        console.error("[firsttext-skills-bump.1] " + JSON.stringify({ v: 1, pid: process.pid, atMs: Date.now(), reason: String(event?.reason ?? "").slice(0, 32), workspace: Boolean(event?.workspaceDir), changedPath }));
      } catch { /* Observation must not alter runtime control flow. */ }
    });
  } catch { /* Observation must not alter runtime control flow. */ }
}
