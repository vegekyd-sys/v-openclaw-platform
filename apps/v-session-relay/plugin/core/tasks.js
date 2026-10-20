// Background-line rows for sends in flight (design §3.5, §7.9): the requester's card shows
// 「⏳ 后台 n 项进行中 · 会话请求」 while its sends are out. Rows go through the WP3 hook
// `globalThis[TASK_REGISTRY_BRIDGE].extraSources`; changes are announced on its listeners in
// the same `{ kind, sessionKeys }` shape the task registry uses.

import { TASK_REGISTRY_BRIDGE } from "./contracts.js";

const QUEUED = new Set(["accepted", "posting", "posted", "queued"]);
const RUNNING = new Set(["starting", "running", "target_done", "awaiting_children", "awaiting_background"]);

/**
 * Task rows of the sends `sessionKey` has out (not yet settled). This is the extraSources function:
 * synchronous, memory only, and it never calls listActive (it runs inside it, review-core-tasks).
 * Keys arrive trimmed, not lower-cased, and DingTalk's are lower-cased already: compare without case.
 * A send leaves the rows at result_ready / failure_ready, before its hand-back: the wake turn's card
 * must not show the request it is reporting as still running.
 */
export function taskRowsFor(ledger, sessionKey) {
  const key = typeof sessionKey === "string" ? sessionKey.trim().toLowerCase() : "";
  if (!key) return [];
  const rows = [];
  for (const rec of ledger.sends.values()) {
    if (String(rec.requester?.sessionKey ?? "").trim().toLowerCase() !== key) continue;
    if (!QUEUED.has(rec.phase) && !RUNNING.has(rec.phase)) continue;
    rows.push({
      taskId: `v-a2a:${rec.sendId}`,
      runtime: "session",
      taskKind: "sessions_send",
      label: `「${rec.target.label}」#${rec.code}`,
      status: QUEUED.has(rec.phase) ? "queued" : "running",
      runId: rec.targetRun?.runId ?? null,
      childSessionKey: rec.target.sessionKey,
      createdAt: rec.createdAt,
    });
  }
  return rows;
}

export function createTaskSource({ ledger, target = globalThis, logger } = {}) {
  const source = (sessionKey) => taskRowsFor(ledger, sessionKey);
  const lastPhase = new Map();
  let installed = false;

  function bridge() {
    const tb = (target[TASK_REGISTRY_BRIDGE] ??= { listeners: new Set() });
    if (!(tb.listeners instanceof Set)) tb.listeners = new Set();
    if (!(tb.extraSources instanceof Set)) tb.extraSources = new Set();
    return tb;
  }

  function notify(sessionKeys) {
    const keys = [...new Set(sessionKeys.filter((k) => typeof k === "string" && k))];
    if (!keys.length) return;
    const tb = target[TASK_REGISTRY_BRIDGE];
    for (const listener of tb?.listeners ?? []) {
      queueMicrotask(() => {
        try { listener({ kind: "v-a2a", sessionKeys: keys }); } catch (err) { logger?.debug?.(`v-session-relay: task listener: ${err?.message ?? err}`); }
      });
    }
  }

  return {
    source,
    install() { bridge().extraSources.add(source); installed = true; },
    uninstall() { target[TASK_REGISTRY_BRIDGE]?.extraSources?.delete(source); installed = false; },
    get installed() { return installed; },
    notify,
    /** Engine hook: announce when a send enters or leaves the rows, or its status changes. */
    changed(rec) {
      if (!rec?.sendId) return;
      const prev = lastPhase.get(rec.sendId);
      if (prev === rec.phase) return;
      lastPhase.set(rec.sendId, rec.phase);
      if (lastPhase.size > 5000) lastPhase.delete(lastPhase.keys().next().value);
      const was = prev === undefined ? null : QUEUED.has(prev) ? "queued" : RUNNING.has(prev) ? "running" : "off";
      const now = QUEUED.has(rec.phase) ? "queued" : RUNNING.has(rec.phase) ? "running" : "off";
      if (was !== now) notify([rec.requester?.sessionKey]);
    },
  };
}
