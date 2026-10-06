// OPENCLAW_FIRSTTEXT_GAP_MARKS_V1: diagnostic stage marks between worker-command-enter and prompt prep.
// Emits only timing/identity fields. loopBusyPct is this process's event-loop utilization since the
// previous mark of the same run: near 100 means the loop was busy (CPU contention), near 0 means the
// run was waiting on something asynchronous (a queue, a lock, I/O).
import { performance } from "node:perf_hooks";

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^DB91_HI_[0-9]+_[a-z0-9_]+$/i;
const STAGE = /^[a-z0-9:._-]{1,64}$/;
const previousByRun = new Map();

export function firsttextGapMark(stage, runId) {
  try {
    if (process.env.OPENCLAW_FIRSTTEXT_WORKER_PHASES !== "1" || process.env.OPENCLAW_FIRSTTEXT_GAP_MARKS === "0") return;
    if (typeof runId !== "string" || !RUN_ID.test(runId) || typeof stage !== "string" || !STAGE.test(stage)) return;
    const monoMs = performance.now();
    const elu = performance.eventLoopUtilization();
    const row = { v: 1, stage, runId, pid: process.pid, atMs: Date.now(), monoMs: Math.round(monoMs) };
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
