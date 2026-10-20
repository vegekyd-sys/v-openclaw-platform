// Building the turns the plugin starts (design §2.a StartRequest, §8.3, §8.4) and reading what
// a finished turn produced. Pure; the engine supplies records, routes and identities.

import { originSessionIdFor, startIds } from "./contracts.js";
import {
  askContext, collectAnchorText, collectContext, memberOutcome, reasonText, requestContext, wakeContext, wakePrompt,
} from "./copy.js";

/** Name of the chain's root person as the target-side text uses it. */
export function rootNameOf(principal, ownerName) {
  if (principal?.isOwner) return ownerName;
  return principal?.name || "发起这项任务的人";
}

/** RunOutcome.finals → `{ text, media, noReply }`. */
export function outputOf(outcome) {
  const finals = Array.isArray(outcome?.finals) ? outcome.finals : [];
  const text = finals.map((f) => (typeof f?.text === "string" ? f.text.trim() : "")).filter(Boolean).join("\n\n");
  const media = [...new Set(finals.flatMap((f) => (Array.isArray(f?.mediaUrls) ? f.mediaUrls.filter((u) => typeof u === "string" && u) : [])))];
  return { text, media, noReply: !text && media.length === 0 };
}

/** Failure class of a finished target turn that did not succeed. */
export function failureOfRun(outcome, restartWedgeRe) {
  if (outcome?.status === "aborted") return { class: "aborted", code: "aborted", reason: reasonText("aborted") };
  const err = String(outcome?.error ?? "error");
  if (restartWedgeRe?.test(err)) return { class: "interrupted", code: "restart_wedge", reason: reasonText("restart_wedge") };
  return { class: "started_failed", code: "error", reason: reasonText("error", { err }) };
}

function assemble({ kind, id, attempt, route, sessionKey, agentId, anchorMessageId, promptText, channelPromptContext, source, identity }) {
  const ids = startIds({ channel: route?.channel ?? "agent", kind, id, attempt });
  return {
    route: route ?? null,
    sessionKey,
    agentId,
    kind,
    id,
    attempt,
    ...ids,
    anchorMessageId: anchorMessageId ?? null,
    promptText,
    channelPromptContext,
    provenance: {
      kind: "inter_session",
      sourceSessionKey: source.sessionKey,
      ...(source.channel ? { sourceChannel: source.channel } : {}),
      sourceTool: "sessions_send",
      originSessionId: originSessionIdFor({ chainId: source.chainId, depth: source.depth, kind, id }),
    },
    sender: identity.sender,
    ...(identity.routePeerId ? { routePeerId: identity.routePeerId } : {}),
    ...(identity.askUserAnswererId ? { askUserAnswererId: identity.askUserAnswererId } : {}),
  };
}

/** StartRequest of a request / ask turn (target side), or of a collect turn for `rec`. */
export function sendStartRequest({ rec, kind, attempt, route, anchorMessageId, identity, ownerName, maxDepth }) {
  const from = rec.requester.label;
  const rootName = rootNameOf(rec.principal, ownerName);
  let promptText;
  let channelPromptContext;
  if (kind === "collect") {
    promptText = collectAnchorText({ code: rec.code, from });
    channelPromptContext = collectContext({ code: rec.code, from });
  } else if (kind === "ask") {
    promptText = rec.message.text;
    channelPromptContext = askContext({ code: rec.code, from });
  } else {
    promptText = rec.message.text;
    channelPromptContext = requestContext({ code: rec.code, from, fromKey: rec.requester.sessionKey, rootName, depth: rec.depth, maxDepth, via: from });
  }
  return assemble({
    kind, id: rec.sendId, attempt, route,
    sessionKey: rec.target.sessionKey, agentId: rec.target.agentId,
    anchorMessageId, promptText, channelPromptContext,
    source: { sessionKey: rec.requester.sessionKey, channel: rec.requester.channel, chainId: rec.chainId, depth: rec.depth },
    identity,
  });
}

/** One batch member as the hand-back line and the wake text describe it. */
export function memberItem(rec, { runTimeoutMs = 43_200_000 } = {}) {
  const outcome = memberOutcome(rec);
  const failure = rec.failure;
  const reason = outcome === "result" ? ""
    : failure?.reason ?? reasonText(failure?.class === "timeout" ? "timeout" : failure?.code ?? "error", { h: Math.round(runTimeoutMs / 3600_000) });
  return {
    to: rec.target.label,
    code: rec.code,
    kind: rec.kind,
    outcome,
    request: rec.message?.text ?? "",
    text: rec.result?.text ?? "",
    media: rec.result?.media ?? [],
    noReply: Boolean(rec.result?.noReply),
    incomplete: Boolean(rec.result?.incomplete),
    reason,
    failureClass: outcome === "cancelled" ? "cancelled" : failure?.class,
    wedge: failure?.code === "restart_wedge",
  };
}

/** StartRequest of a wake turn for `batch` (requester side). */
export function wakeStartRequest({ batch, members, attempt, route, anchorMessageId, identity, ownerName, principal, continuation, runTimeoutMs }) {
  const items = members.map((m) => memberItem(m, { runTimeoutMs }));
  const first = members[0];
  return assemble({
    kind: "wake", id: batch.batchId, attempt, route,
    sessionKey: batch.requester.sessionKey, agentId: batch.requester.agentId,
    anchorMessageId,
    promptText: wakePrompt({ at: batch.createdAt, items }),
    channelPromptContext: wakeContext({ rootName: rootNameOf(principal, ownerName), continuation }),
    source: { sessionKey: first?.target?.sessionKey ?? batch.requester.sessionKey, channel: first?.target?.route?.channel ?? first?.target?.channel, chainId: batch.chainId, depth: batch.depth },
    identity,
  });
}
