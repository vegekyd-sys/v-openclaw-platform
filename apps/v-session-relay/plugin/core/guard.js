// before_tool_call poll guard (design §8.7). Only active for a run that has handed work off
// asynchronously (the core writes `globalThis[SESSIONS_SEND_ACCEPTED]` in the process where
// sessions_send ran). It only blocks; it never rewrites parameters (Codex refuses rewritten
// parameters, memory codex-refuses-hook-param-rewrite).

import { SESSIONS_SEND_ACCEPTED } from "./contracts.js";
import { pollGuardText } from "./copy.js";

export const EXEC_TOOLS = Object.freeze(["exec", "bash", "process", "shell", "exec_command", "local_shell"]);
export const HISTORY_TOOLS = Object.freeze(["sessions_history", "session_status"]);
export const MIN_SLEEP_SECONDS = 15;
// GNU sleep takes s / m / h / d suffixes: "sleep 5m" is 300 s of waiting.
const SLEEP_RE = /\bsleep\s+(\d+(?:\.\d+)?)([smhd]?)(?![\w.])/gu;
const SLEEP_UNIT_S = Object.freeze({ "": 1, s: 1, m: 60, h: 3600, d: 86_400 });
const TIMEOUT_RE = /\btimeout\s+\d{2,}/u;
const WHILE_SLEEP_RE = /while\b[^;]*;\s*do\b[\s\S]*\bsleep\b/u;
const ENTRY_MAX_AGE_MS = 6 * 3600_000;
const SEEN_MAX = 500;
const DUP_WINDOW_MS = 1_000;

/** The shell text of an exec-like call (string or argv). */
export function commandText(params) {
  const p = params && typeof params === "object" ? params : {};
  const parts = [];
  for (const key of ["command", "cmd", "script", "input", "commandLine"]) {
    const v = p[key];
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) parts.push(v.filter((x) => typeof x === "string").join(" "));
  }
  return parts.join("\n");
}

/** True for `sleep ≥ 15 s` (units allowed), `timeout NN…`, or a `while …; do … sleep` loop. */
export function isPollingCommand(cmd) {
  const text = String(cmd ?? "");
  if (!text) return false;
  for (const m of text.matchAll(SLEEP_RE)) if (Number(m[1]) * SLEEP_UNIT_S[m[2] ?? ""] >= MIN_SLEEP_SECONDS) return true;
  return TIMEOUT_RE.test(text) || WHILE_SLEEP_RE.test(text);
}

function targetsOf(entry) {
  const t = entry?.targets;
  if (t instanceof Map) return t;
  if (t && typeof t === "object") return new Map(Object.entries(t));
  return new Map();
}

function matchTarget(targets, wanted) {
  if (typeof wanted !== "string" || !wanted.trim()) return null;
  const w = wanted.trim();
  if (targets.has(w)) return [w, targets.get(w)];
  const lw = w.toLowerCase();
  for (const [key, value] of targets) {
    const lk = key.toLowerCase();
    if (lk === lw || lk.endsWith(`:${lw}`) || (value?.label && value.label === w)) return [key, value];
  }
  return null;
}

/**
 * The hook. `target` holds the accepted table (globalThis by default). Repeated calls for the
 * same toolCallId (register() runs three times, F-b) return the first verdict without counting
 * a history read twice.
 */
export function createPollGuard({ target = globalThis, now = Date.now } = {}) {
  const seen = new Map();

  function prune(table) {
    if (!(table instanceof Map) || table.size < 200) return;
    const cutoff = now() - ENTRY_MAX_AGE_MS;
    for (const [runId, entry] of table) if ((entry?.at ?? 0) < cutoff) table.delete(runId);
  }

  function decide(event, ctx) {
    const table = target[SESSIONS_SEND_ACCEPTED];
    if (!(table instanceof Map) || table.size === 0) return undefined;
    const runId = ctx?.runId ?? event?.runId;
    if (!runId) return undefined;
    const entry = table.get(runId);
    if (!entry) { prune(table); return undefined; }
    const tool = String(event?.toolName ?? ctx?.toolName ?? "").toLowerCase();
    const targets = targetsOf(entry);
    if (targets.size === 0) return undefined;
    if (EXEC_TOOLS.includes(tool)) {
      if (!isPollingCommand(commandText(event?.params))) return undefined;
      const [, last] = [...targets].at(-1);
      return { block: true, blockReason: pollGuardText({ code: last?.code ?? "?", to: last?.label ?? "对方" }) };
    }
    if (HISTORY_TOOLS.includes(tool)) {
      const hit = matchTarget(targets, event?.params?.sessionKey);
      if (!hit) return undefined;
      const [, info] = hit;
      if (info && typeof info === "object") info.historyReads = (Number(info.historyReads) || 0) + 1;
      if ((info?.historyReads ?? 1) < 2) return undefined;
      return { block: true, blockReason: pollGuardText({ code: info?.code ?? "?", to: info?.label ?? "对方" }) };
    }
    return undefined;
  }

  /**
   * One key per tool call. The host passes toolCallId only when it has one; without it the
   * duplicate invocations of one call (three registrations) arrive back to back, so the run, tool
   * and parameters within DUP_WINDOW_MS identify the call — a model's next call comes much later.
   */
  function keyOf(event, ctx) {
    const callId = ctx?.toolCallId ?? event?.toolCallId;
    if (callId) return { key: `id:${callId}`, at: 0 };
    const runId = ctx?.runId ?? event?.runId;
    if (!runId) return null;
    let params = "";
    try { params = JSON.stringify(event?.params ?? null); } catch { params = String(event?.params); }
    return { key: `run:${runId}|${event?.toolName ?? ctx?.toolName ?? ""}|${params}`, at: now() };
  }

  return function beforeToolCall(event, ctx) {
    const k = keyOf(event, ctx);
    const hit = k ? seen.get(k.key) : undefined;
    if (hit && (!k.at || k.at - hit.at <= DUP_WINDOW_MS)) return hit.verdict;
    let verdict;
    try { verdict = decide(event, ctx); } catch { verdict = undefined; }
    if (k) {
      seen.delete(k.key);
      seen.set(k.key, { verdict, at: k.at });
      if (seen.size > SEEN_MAX) seen.delete(seen.keys().next().value);
    }
    return verdict;
  };
}
