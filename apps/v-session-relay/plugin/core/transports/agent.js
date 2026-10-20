// Agent transport (design §3.10, §9.2): for a chat without an inbound bridge (R1 Telegram,
// DingTalk, WeCom), a session without a chat (main, webchat), or when a bridge cannot place the
// session. The visible request goes out through the channel's outbound adapter; the turn is a
// Gateway "agent" run with deliver:true (v2 semantics: only the final reply is sent).
//
// There is no admission guard on this path: the run queues on the session lane behind a busy
// session. The engine's pre-check keeps most of those collisions away.

import { RESTART_WEDGE_RE } from "../contracts.js";

const WAIT_SLICE_MS = 60_000;
const ABORT_RE = /\babort(ed)?\b/iu;

function outcomeFromWait(w) {
  const reply = w?.terminalReply;
  const text = reply?.disposition === "visible" && typeof reply.text === "string" ? reply.text : "";
  const finals = text ? [{ text }] : [];
  const base = { finals, visibleReplySent: finals.length > 0, finalCount: finals.length };
  if (w?.status === "ok") {
    if (w.stopReason === "aborted") return { ...base, status: "aborted" };
    return { ...base, status: "ok" };
  }
  const error = String(w?.error ?? w?.status ?? "error");
  if (w?.stopReason === "aborted" || ABORT_RE.test(error)) return { ...base, status: "aborted", error };
  return { ...base, status: "error", error };
}

/**
 * `callGateway(method, params, { scopes, timeoutMs })` is the plugin's Gateway client
 * (callGatewayFromCli with the current config). `loadOutboundAdapter(channel)` is
 * `api.runtime.channel.outbound.loadAdapter`.
 */
export function createAgentTransport({ callGateway, loadOutboundAdapter, getConfig = () => ({}), logger, runTimeoutMs = 43_200_000, waitSliceMs = WAIT_SLICE_MS } = {}) {
  async function post({ route, text }) {
    if (!route?.to) return { messageId: null, skipped: true };
    if (typeof loadOutboundAdapter !== "function") throw Object.assign(new Error("no outbound adapter loader"), { code: "CHANNEL_DOWN", transient: true });
    const adapter = await loadOutboundAdapter(route.channel);
    if (typeof adapter?.sendText !== "function") throw Object.assign(new Error(`${route.channel} has no sendText`), { code: "CHANNEL_DOWN", transient: false });
    const res = await adapter.sendText({ cfg: getConfig() ?? {}, to: route.to, text, accountId: route.accountId, ...(route.threadId ? { threadId: route.threadId } : {}) });
    return { messageId: res?.messageId ?? res?.id ?? null };
  }

  async function callAgent(params, isOwner) {
    const scopes = isOwner ? ["operator.admin"] : ["operator.write"];
    try {
      return await callGateway("agent", params, { scopes, timeoutMs: 30_000 });
    } catch (err) {
      // A5 unverified: the plugin client may not get operator.admin; run as non-owner then.
      if (isOwner && /missing scope|scope|forbidden|not allowed/iu.test(String(err?.message ?? err))) {
        logger?.warn?.("v-session-relay: agent transport could not run with operator.admin; running as non-owner");
        return await callGateway("agent", params, { scopes: ["operator.write"], timeoutMs: 30_000 });
      }
      throw err;
    }
  }

  async function waitRun(runId) {
    const deadline = Date.now() + runTimeoutMs;
    for (;;) {
      const slice = Math.max(1_000, Math.min(waitSliceMs, deadline - Date.now()));
      let w;
      try {
        w = await callGateway("agent.wait", { runId, timeoutMs: slice }, { scopes: ["operator.write"], timeoutMs: slice + 15_000 });
      } catch (err) {
        if (Date.now() >= deadline) return { status: "error", error: String(err?.message ?? err), finals: [], visibleReplySent: false, finalCount: 0 };
        await new Promise((r) => setTimeout(r, 2_000).unref?.());
        continue;
      }
      if (w?.status === "ok" || w?.status === "error") return outcomeFromWait(w);
      if (w?.status === "timeout" && w?.endedAt) return outcomeFromWait({ ...w, status: "error", error: w.error ?? "run timed out" });
      if (Date.now() >= deadline) return { status: "error", error: "timeout", finals: [], visibleReplySent: false, finalCount: 0 };
    }
  }

  /** StartRequest (§2.a) → StartOutcome. `principal.isOwner` picks the RPC scope. */
  async function start(req, { principal } = {}) {
    const route = req.route;
    const params = {
      message: req.promptText,
      sessionKey: req.sessionKey,
      ...(req.agentId ? { agentId: req.agentId } : {}),
      idempotencyKey: req.runId,
      deliver: true,
      bestEffortDeliver: true,
      sourceReplyDeliveryMode: "automatic",
      inputProvenance: req.provenance,
      ...(req.channelPromptContext ? { extraSystemPrompt: req.channelPromptContext } : {}),
      ...(route?.to ? { channel: route.channel, to: route.to, ...(route.accountId ? { accountId: route.accountId } : {}) } : {}),
    };
    let res;
    try {
      res = await callAgent(params, principal?.isOwner === true);
    } catch (err) {
      const message = String(err?.message ?? err);
      if (RESTART_WEDGE_RE.test(message)) return { status: "rejected", code: "RESTART_WEDGE", message, started: false };
      return { status: "rejected", code: "CHANNEL_DOWN", message, started: false };
    }
    const runId = typeof res?.runId === "string" && res.runId ? res.runId : req.runId;
    return { status: "started", runId, done: waitRun(runId) };
  }

  return { kind: "agent", post, start, waitRun };
}
