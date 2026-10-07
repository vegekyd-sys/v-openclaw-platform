// Reads what the native sessions_send tool did, so the relay layer can follow it.
// sessions_send returns JSON text: { runId, status, sessionKey, targetDisposition?, reply? }.

/** The JSON a tool returned, from the sanitized result after_tool_call receives. */
export function toolResultJson(result) {
  if (!result || typeof result !== "object") {
    return null;
  }
  if (result.details && typeof result.details === "object" && !Array.isArray(result.details)) {
    return result.details;
  }
  const text = Array.isArray(result.content)
    ? result.content.filter((p) => p && p.type === "text" && typeof p.text === "string").map((p) => p.text).join("")
    : typeof result.text === "string"
      ? result.text
      : null;
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** The run that wakes the requester with the reply (core patch v-sessions-send-reply-once-v1). */
export function resultRunId(targetRunId) {
  return `sessions-send-result:${targetRunId}`;
}

export function targetRunIdOf(runId) {
  const m = String(runId ?? "").match(/^sessions-send-result:(.+)$/u);
  return m ? m[1] : null;
}

/**
 * A ledger record for one accepted sessions_send, or null when the send did not start a
 * peer run (error, forbidden, self-send, no target).
 */
export function recordFromSend({ id, params, result, ctx, records, requester, now = Date.now() }) {
  const data = toolResultJson(result);
  if (!data || typeof data.runId !== "string" || !data.runId) {
    return null;
  }
  // A send that reached the target but whose run failed is still shown, as an interrupted
  // thread; the requester already has the error inline. A send whose inline wait timed out
  // after delivery is still running: the core follows it and wakes the requester later.
  const failed = data.status === "error" && data.sentBeforeError === true;
  const late = data.status === "timeout" && data.sentBeforeError === true;
  if (data.status !== "accepted" && data.status !== "ok" && !failed && !late) {
    return null;
  }
  const from = typeof ctx?.sessionKey === "string" ? ctx.sessionKey : null;
  const targetKey = [data.sessionKey, params?.sessionKey].find((k) => typeof k === "string" && k.startsWith("agent:")) ?? null;
  if (!from || !targetKey || targetKey === from) {
    return null;
  }
  // Same thread: this turn is the requester being woken by a reply, or it already sent
  // to the same target earlier in this turn.
  const wokenBy = records.find((r) => r.from?.sessionKey === from && ctx?.runId && resultRunId(r.runId) === ctx.runId);
  const sameTurn = records.filter((r) => r.from?.sessionKey === from && r.to?.sessionKey === targetKey && r.fromRunId && r.fromRunId === ctx?.runId).at(-1);
  const chainId = wokenBy?.chainId ?? sameTurn?.chainId ?? id;
  const inline = data.status === "ok" || failed;
  return {
    id,
    chainId,
    via: wokenBy ? "reply" : requester ? "person" : "agent",
    requester: wokenBy || sameTurn ? (records.find((r) => r.id === chainId)?.requester ?? null) : requester,
    status: failed ? "failed" : inline ? "done" : "running",
    inline,
    runId: data.runId,
    fromRunId: ctx?.runId ?? null,
    targetDisposition: data.targetDisposition ?? null,
    createdAt: now,
    updatedAt: now,
    ...(inline && !failed ? { reply: typeof data.reply === "string" ? data.reply : "", finishedAt: now } : {}),
    ...(failed ? { error: typeof data.error === "string" && data.error ? data.error : data.status, finishedAt: now } : {}),
    from: { sessionKey: from, label: null, name: null },
    to: { sessionKey: targetKey, label: null, name: null },
    message: typeof params?.message === "string" ? params.message : "",
  };
}
