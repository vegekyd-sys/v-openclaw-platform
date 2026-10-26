// sessions_send v3 (docs/inter-session/design.md §3.1, §3.2, §13): after the native allow,
// visibility and sandbox checks, sessions_send hands the send to the v-session-relay plugin's
// Gateway method `vrelay.send`. From there the plugin posts the request in the target's chat,
// queues it, runs it as an ordinary inbound turn of that chat, collects the result and wakes
// the requester once. The core only:
//   - skips the plugin for the cases it never supports (self-sends, isolated cron, exact-
//     incarnation sends, run-scoped / subagent targets, a requester that owns the target as a
//     background ACP or native subagent session, no requester session);
//   - hands off BEFORE the v2 baseline history read, so an inline send no longer reads the
//     target's (possibly huge) transcript;
//   - for an async send returns the plugin's note at once and records the send in the
//     process-wide accepted table (`Symbol.for("openclaw.v.sessionsSendAccepted")`) that the
//     before_tool_call polling guard reads;
//   - for an inline send long-polls `vrelay.wait` in ≤55 s slices (≤300 s in all) and maps the
//     answer to the tool result; a send that outlives the window, or whose requester run is
//     aborted (the abort signal execute now takes as its third argument), turns async (and is
//     recorded).
// Only "plugin absent" (an error text matching V_RELAY_FALLBACK_RE, cached 60 s per process)
// or a `fallback` answer lets the v2 path below run. Any other RPC failure is reported as an
// unknown state and never retried through v2: the plugin may already have accepted it.
//
// patchSessionsSendRelay applies v2 (../sessions-send-reply-once) first, so v2 stays the
// fallback, then v3. patchOpenclawTools wires the requester turn's runId / sender / route into
// createSessionsSendTool. Both are generated from the bytes V runs
// (release/captured/v2026.9.1-db91.6-subagent-index-20261020), never from an upstream copy.
import fs from "node:fs";

import { MARKER as REPLY_ONCE_MARKER, patchSessionsSendReplyOnce } from "../sessions-send-reply-once/patch.mjs";

export const MARKER = "v-sessions-send-relay-v3";
export const TOOLS_MARKER = "v-sessions-send-relay-tools-v1";
export { REPLY_ONCE_MARKER };
export const FILES = Object.freeze({
  sessionsSpawnTool: "sessions-spawn-tool-1FQMTkIo.js",
  openclawTools: "openclaw-tools-BODVdJQD.js",
});
export const CAPTURE_DIR = "release/captured/v2026.9.1-db91.6-subagent-index-20261020/dist";

/** English guidance appended to describeSessionsSendTool() (design §8.2; the presets join with " "). */
export const GUIDANCE =
  " On V the message is posted in the target's chat as a request from this conversation, and the target works on it there, visibly; write it for the people in that chat. To hand off work use timeoutSeconds=0, say in one sentence who got it, and END YOUR TURN: the result returns once as a new turn here, and all sends from one turn come back together in one turn. Never sleep, poll, or read the target's history to wait. To ask a question use timeoutSeconds=120; the answer is this tool's result. The session that gave you your current task can only be asked this way, and your final reply already goes back to it automatically, so do not send it back.";

// ---------------------------------------------------------------- anchors (each must occur exactly once)

const TOOL_START = "function createSessionsSendTool(opts) {\n";
// V's sessions_send execute drops the abort signal every harness passes as the third argument
// (pi-agent-core; the Codex dynamic-tool bridge when its 90 s / timeoutSeconds+30 s budget runs
// out; the MCP loopback), and openclaw-tools never sets opts.signal. v3 takes the argument, the
// way sessions_spawn does, so an inline wait stops when the requester's run is aborted.
export const EXECUTE = "\t\texecute: async (_toolCallId, args) => {\n";
export const EXECUTE_V3 = "\t\texecute: async (_toolCallId, args, vRelayToolSignal) => {\n";
const DESCRIPTION = "\t\tdescription: describeSessionsSendTool(),\n";
const DESCRIPTION_V3 = "\t\tdescription: describeSessionsSendTool() + V_SESSIONS_SEND_GUIDANCE,\n";
const SCHEMA_START = "const SessionsSendOutputSchema = Type.Union([\n";
const SCHEMA_END = "]);\nconst SESSIONS_SEND_REPLY_HISTORY_LIMIT = 50;\n";
const BRANCH_END = "\t\twatched: Type.Optional(Type.Boolean())\n\t}, { additionalProperties: false })";
export const HANDOFF_ANCHOR = "\t\t\t\t\tconst fallbackA2ASessionKey = timeoutSeconds === 0 && isIsolatedCronRequester";
export const HANDOFF_BEGIN = "\t\t\t\t\t// sessions_send v3 hand-off";
export const HELPERS_END = "// sessions_send v3 helpers end\n";

/**
 * Module-scope names and execute() locals the generated code relies on. A V build that renamed
 * or dropped one must fail the generator, not ship code that throws a ReferenceError at the
 * first send.
 */
const REQUIRED_SCOPE = [
  'import crypto, { randomUUID } from "node:crypto";',
  'import { t as formatErrorMessage } from "./errors-u9zSVTak.js";',
  'const log = createSubsystemLogger("agents/sessions-send");',
  'const NO_REPLY_MESSAGE = "No visible reply or pending announcement. Continue or retry if needed.";',
  " T as isSubagentSessionKey,",
  " o as loadSessionEntryByKey }",
  " r as readAcpSessionMeta }",
  " n as isRequesterParentOfBackgroundAcpSession }",
  "function isRequesterParentOfNativeSubagentSession(params) {",
  " o as recordSessionToolActionFact,",
  " t as recordSessionParticipantBestEffort }",
  " o as resolveSessionStorePathCore }",
  " t as jsonResult }",
  EXECUTE,
  "\t\t\tconst promptedAt = Date.now();\n",
  "\t\t\tconst gatewayCall = opts?.callGateway ?? callAgentToolGatewayRequest;\n",
  "\t\t\tconst requesterSessionKey = rawRequesterSessionKey;\n",
  "\t\t\tconst expectedSessionId = opts?.expectedTargetSessionId ?? access.expectedSessionId;\n",
  "\t\t\t\t\tif (visibleSession.missing) {\n",
  "\t\t\t\t\tconst requesterChannel = opts?.agentChannel;\n",
  "\t\t\t\t\tconst sameSessionA2A = requesterSessionKey === resolvedKey && targetAgentId === requesterAgentId;\n",
  "\t\t\t\t\tconst isIsolatedCronRequester = isCronRunSessionKey(requesterSessionKey);\n",
  "\t\t\t\t\tconst registerWatchIfRequested = (targetSessionKey) => {\n",
];

/** Identifiers v3 introduces; none may exist in the input. */
export const NEW_IDENTIFIERS = Object.freeze([
  "V_RELAY", "V_RELAY_FALLBACK_RE", "V_SESSIONS_SEND_GUIDANCE", "vRelayAbsentUntil", "vRelayStr",
  "vRelayIdempotencyKey", "vRelayLabel", "vRelayCode", "vRelayAsyncNote", "vRelayStillWorkingNote",
  "vRelayInterruptedNote", "vRelayFailedNote", "vRelayUnknownStateText", "vRelayErrorResult",
  "vSessionRelaySend", "vAcceptedResult", "vRecordAccepted", "vWaitInline", "vRelaySkip", "vRelay",
  "vTargetEntry", "vAcpMeta", "vWatch", "V_RELAY_ABORTED", "vRelayAbortable", "vRelayToolSignal",
]);

/** Two-space indented source → the tab indentation the dist uses, shifted by `base` tabs. */
function tabify(source, base = 0) {
  return source
    .split("\n")
    .map((line) => {
      if (!line) return line;
      const lead = /^( *)/u.exec(line)[1].length;
      if (lead % 2 !== 0) throw new Error(`odd indentation in generated code: ${JSON.stringify(line)}`);
      return "\t".repeat(base + lead / 2) + line.slice(lead);
    })
    .join("\n");
}

// The generated code uses no template literals, so these blocks are String.raw without `${`.
const HELPERS = tabify(String.raw`// v-sessions-send-relay-v3
// sessions_send v3 (design §3.1): hand a send to the v-session-relay plugin (vrelay.send) and,
// for an inline send, long-poll vrelay.wait. The literals below equal
// apps/v-session-relay/plugin/core/contracts.js (tests/sessions-send-relay.test.mjs checks).
const V_RELAY = {
  sendMethod: "vrelay.send",
  waitMethod: "vrelay.wait",
  scopes: ["operator.write"],
  sendRpcMs: 2e4,
  waitSliceMaxMs: 55e3,
  waitRpcGraceMs: 15e3,
  inlineMaxMs: 3e5,
  absentCacheMs: 6e4,
  idempotencyBucketMs: 6e5,
  acceptedKey: "openclaw.v.sessionsSendAccepted",
  acceptedTtlMs: 216e5
};
const V_RELAY_FALLBACK_RE = /unknown method: vrelay\.send|missing scope: operator\.admin/u;
const V_SESSIONS_SEND_GUIDANCE = GUIDANCE_JSON;
let vRelayAbsentUntil = 0;
function vRelayStr(value) {
  return value === void 0 || value === null || value === "" ? null : String(value);
}
function vRelayIdempotencyKey(requesterSessionKey, requesterRunId, toolCallId, now = Date.now()) {
  const run = requesterRunId ?? "nr:" + Math.floor(now / V_RELAY.idempotencyBucketMs);
  return "ss:" + crypto.createHash("sha256").update(requesterSessionKey + "|" + run + "|" + toolCallId).digest("hex").slice(0, 32);
}
function vRelayLabel(accepted, displayKey) {
  return typeof accepted?.label === "string" && accepted.label ? accepted.label : displayKey;
}
function vRelayCode(accepted) {
  return typeof accepted?.code === "string" ? accepted.code : "";
}
function vRelayAsyncNote(label, code) {
  return "已交给「" + label + "」" + (code ? "(#" + code + ")" : "") + "，对方聊天里能看到这条请求。结果会作为新的一轮自动回到这里；这一轮交出的几件会等齐后一起回来，只叫醒你一次。现在用一句话告诉这里的人交给了谁、做什么，然后结束本轮。不要 sleep，不要轮询 sessions_history / session_status。";
}
function vRelayStillWorkingNote(label, seconds) {
  return "「" + label + "」还在处理（已等 " + seconds + " 秒）。结果会作为新的一轮自动回到这里；现在先做别的或结束本轮，不要等待或轮询。";
}
function vRelayInterruptedNote(label, code) {
  return "和「" + label + "」之间的等待中断了，但请求" + (code ? " #" + code + " " : "") + "已受理，结果会作为新的一轮回来；现在结束本轮，不要重发。";
}
function vRelayFailedNote(label, code, reason) {
  return "「" + label + "」没能完成" + (code ? " #" + code : "") + "：" + reason + "。";
}
function vRelayUnknownStateText(error) {
  return "会话转交的状态未知（" + String(error).slice(0, 300) + "）。先不要重发：一分钟后对方聊天里还没有出现这条请求再发一次，相同内容会被识别为同一件事。";
}
function vRelayErrorResult(status, error, code, sessionKey) {
  return {
    runId: crypto.randomUUID(),
    status,
    error,
    ...typeof code === "string" && code ? { code } : {},
    ...sessionKey ? { sessionKey } : {}
  };
}
async function vSessionRelaySend(p) {
  if (Date.now() < vRelayAbsentUntil) return { kind: "fallback" };
  const mode = p.timeoutSeconds === 0 ? "async" : "inline";
  const inlineTimeoutMs = mode === "async" ? 0 : Math.min(p.timeoutSeconds * 1e3, V_RELAY.inlineMaxMs);
  const toolCallId = vRelayStr(p.toolCallId) ?? crypto.randomUUID();
  const requesterRunId = vRelayStr(p.requesterRunId);
  const params = {
    v: 1,
    idempotencyKey: vRelayIdempotencyKey(p.requesterSessionKey, requesterRunId, toolCallId),
    toolCallId,
    requester: {
      sessionKey: p.requesterSessionKey,
      replySessionKey: p.replyRequesterSessionKey || p.requesterSessionKey,
      agentId: p.requesterAgentId,
      runId: requesterRunId,
      channel: vRelayStr(p.requesterChannel),
      accountId: vRelayStr(p.requesterAccountId),
      to: vRelayStr(p.requesterTo),
      threadId: vRelayStr(p.requesterThreadId),
      senderId: vRelayStr(p.requesterSenderId),
      senderIsOwner: typeof p.senderIsOwner === "boolean" ? p.senderIsOwner : null
    },
    target: {
      sessionKey: p.targetSessionKey,
      agentId: p.targetAgentId,
      displayKey: p.displayKey,
      created: p.created === true
    },
    message: p.message,
    mode,
    inlineTimeoutMs
  };
  let r;
  try {
    r = await p.gatewayCall({
      method: V_RELAY.sendMethod,
      params,
      scopes: [...V_RELAY.scopes],
      timeoutMs: V_RELAY.sendRpcMs
    });
  } catch (err) {
    const error = formatErrorMessage(err);
    if (V_RELAY_FALLBACK_RE.test(error)) {
      vRelayAbsentUntil = Date.now() + V_RELAY.absentCacheMs;
      log.warn("vrelay absent; sessions_send uses v2", { error });
      return { kind: "fallback" };
    }
    log.warn("vrelay.send failed; outcome unknown", {
      error,
      idempotencyKey: params.idempotencyKey
    });
    return {
      kind: "result",
      result: vRelayErrorResult("error", vRelayUnknownStateText(error), void 0, p.displayKey)
    };
  }
  if (r?.status === "fallback") return { kind: "fallback" };
  if (r?.status === "forbidden" || r?.status === "error") return {
    kind: "result",
    result: vRelayErrorResult(r.status, typeof r.error === "string" && r.error ? r.error : "sessions_send " + r.status + (typeof r.code === "string" ? " (" + r.code + ")" : ""), r.code, p.displayKey)
  };
  if (r?.status === "accepted") return {
    kind: "accepted",
    mode,
    inlineTimeoutMs,
    accepted: r
  };
  log.warn("vrelay.send answered with an unknown status; outcome unknown", {
    status: typeof r?.status === "string" ? r.status : typeof r,
    idempotencyKey: params.idempotencyKey
  });
  return {
    kind: "result",
    result: vRelayErrorResult("error", vRelayUnknownStateText("vrelay.send status " + String(r?.status)), void 0, p.displayKey)
  };
}
const V_RELAY_ABORTED = Symbol("vrelay.wait abandoned");
function vRelayAbortable(signal, promise) {
  if (typeof signal?.addEventListener !== "function") return promise;
  return new Promise((resolve, reject) => {
    const onAbort = () => resolve(V_RELAY_ABORTED);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then((value) => {
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    }, (err) => {
      signal.removeEventListener("abort", onAbort);
      reject(err);
    });
  });
}
function vAcceptedResult(accepted, displayKey, watch, note) {
  const code = vRelayCode(accepted);
  return {
    runId: vRelayStr(accepted?.runId) ?? crypto.randomUUID(),
    status: "accepted",
    sessionKey: displayKey,
    targetDisposition: "queued",
    delivery: {
      status: "pending",
      mode: "announce"
    },
    ...code ? { requestCode: code } : {},
    note: note ?? (typeof accepted?.note === "string" && accepted.note ? accepted.note : vRelayAsyncNote(vRelayLabel(accepted, displayKey), code)),
    ...Number.isSafeInteger(accepted?.queuePosition) ? { queuePosition: accepted.queuePosition } : {},
    ...typeof accepted?.waitingBehindActiveRun === "boolean" ? { waitingBehindActiveRun: accepted.waitingBehindActiveRun } : {},
    ...watch
  };
}
function vRecordAccepted(requesterRunId, targetSessionKey, displayKey, accepted) {
  const runId = vRelayStr(requesterRunId);
  if (!runId || !targetSessionKey) return;
  try {
    const key = Symbol.for(V_RELAY.acceptedKey);
    const table = globalThis[key] instanceof Map ? globalThis[key] : globalThis[key] = new Map();
    const now = Date.now();
    for (const [id, row] of table) if (!(now - (row?.at ?? 0) < V_RELAY.acceptedTtlMs)) table.delete(id);
    const row = table.get(runId) ?? {
      at: now,
      targets: new Map()
    };
    row.at = now;
    const previous = row.targets.get(targetSessionKey);
    row.targets.set(targetSessionKey, {
      code: vRelayCode(accepted),
      label: vRelayLabel(accepted, displayKey),
      historyReads: previous?.historyReads ?? 0,
      sendId: vRelayStr(accepted?.sendId),
      displayKey
    });
    table.set(runId, row);
  } catch (err) {
    log.warn("sessions_send accepted table write failed", { error: formatErrorMessage(err) });
  }
}
async function vWaitInline(p) {
  const accepted = p.accepted;
  const code = vRelayCode(accepted);
  const label = vRelayLabel(accepted, p.displayKey);
  const runId = vRelayStr(accepted?.runId) ?? crypto.randomUUID();
  const codeField = code ? { requestCode: code } : {};
  const startedAt = Date.now();
  const deadline = startedAt + Math.max(0, Math.min(p.inlineTimeoutMs, V_RELAY.inlineMaxMs));
  const turnAsync = (note) => {
    vRecordAccepted(p.requesterRunId, p.targetSessionKey, p.displayKey, accepted);
    return vAcceptedResult(accepted, p.displayKey, p.watch, note);
  };
  const sendId = vRelayStr(accepted?.sendId);
  if (!sendId) return turnAsync(vRelayInterruptedNote(label, code));
  const abandoned = () => {
    log.warn("vrelay.wait abandoned: the requester run was aborted; the send stays accepted", { sendId });
    return turnAsync(vRelayInterruptedNote(label, code));
  };
  for (;;) {
    if (p.signal?.aborted) return abandoned();
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const sliceMs = Math.min(V_RELAY.waitSliceMaxMs, remaining);
    const sliceStartedAt = Date.now();
    let w;
    try {
      w = await vRelayAbortable(p.signal, p.gatewayCall({
        method: V_RELAY.waitMethod,
        params: {
          v: 1,
          sendId,
          timeoutMs: sliceMs
        },
        scopes: [...V_RELAY.scopes],
        timeoutMs: sliceMs + V_RELAY.waitRpcGraceMs
      }));
    } catch (err) {
      log.warn("vrelay.wait failed; the send stays accepted", {
        sendId,
        error: formatErrorMessage(err)
      });
      return turnAsync(vRelayInterruptedNote(label, code));
    }
    if (w === V_RELAY_ABORTED) return abandoned();
    const note = typeof w?.note === "string" && w.note ? w.note : void 0;
    if (w?.status === "ok") {
      const media = Array.isArray(w.media) ? w.media.filter((item) => typeof item === "string" && item) : [];
      return {
        runId,
        sessionKey: p.displayKey,
        status: "ok",
        delivery: {
          status: "skipped",
          mode: "announce"
        },
        reply: typeof w.reply === "string" ? w.reply : "",
        ...codeField,
        ...note ? { note } : {},
        ...media.length > 0 ? { media } : {},
        ...p.watch
      };
    }
    if (w?.status === "no_reply") return {
      runId,
      sessionKey: p.displayKey,
      status: "no_reply",
      message: NO_REPLY_MESSAGE,
      ...codeField,
      ...note ? { note } : {},
      ...p.watch
    };
    if (w?.status === "failed") return {
      runId,
      status: "error",
      error: note ?? vRelayFailedNote(label, code, typeof w.failure?.reason === "string" && w.failure.reason ? w.failure.reason : "failed"),
      sentBeforeError: true,
      sessionKey: p.displayKey,
      ...codeField,
      ...p.watch
    };
    if (w?.status === "expired") return turnAsync(note ?? vRelayStillWorkingNote(label, Math.round((Date.now() - startedAt) / 1e3)));
    if (w?.status !== "pending") {
      log.warn("vrelay.wait answered with an unknown status; the send stays accepted", {
        sendId,
        status: typeof w?.status === "string" ? w.status : typeof w
      });
      return turnAsync(vRelayInterruptedNote(label, code));
    }
    if (Date.now() - sliceStartedAt < 1e3) await new Promise((resolve) => setTimeout(resolve, 1e3));
  }
  return turnAsync(vRelayStillWorkingNote(label, Math.round((Date.now() - startedAt) / 1e3)));
}
// sessions_send v3 helpers end
`).replace("GUIDANCE_JSON", JSON.stringify(GUIDANCE));

const HANDOFF = tabify(String.raw`// sessions_send v3 hand-off (design §3.1): before the baseline history read, so an inline send no
// longer reads the target's transcript. Skipped sends, an absent plugin and a "fallback" answer
// continue with the v2 code below.
let vRelaySkip = !requesterSessionKey || sameSessionA2A || isIsolatedCronRequester || Boolean(expectedSessionId) || resolvedKey.includes(":run:") || isSubagentSessionKey(resolvedKey);
if (!vRelaySkip) {
  const vTargetEntry = loadSessionEntryByKey(resolvedKey, targetAgentId);
  const vAcpMeta = readAcpSessionMeta({
    sessionKey: resolvedKey,
    agentId: targetAgentId,
    cfg
  });
  vRelaySkip = isRequesterParentOfBackgroundAcpSession(vAcpMeta && vTargetEntry ? {
    ...vTargetEntry,
    acp: vAcpMeta
  } : vTargetEntry, effectiveRequesterKey) || isRequesterParentOfNativeSubagentSession({
    entry: vTargetEntry,
    acpMeta: vAcpMeta,
    requesterSessionKey: effectiveRequesterKey,
    targetSessionKey: resolvedKey
  });
}
if (!vRelaySkip) {
  const vRelay = await vSessionRelaySend({
    gatewayCall,
    toolCallId: _toolCallId,
    requesterSessionKey,
    replyRequesterSessionKey,
    requesterAgentId,
    requesterRunId: opts?.runId,
    requesterChannel,
    requesterAccountId: opts?.agentAccountId,
    requesterTo: opts?.agentTo,
    requesterThreadId: opts?.agentThreadId,
    requesterSenderId: opts?.requesterSenderId,
    senderIsOwner: opts?.senderIsOwner,
    targetSessionKey: resolvedKey,
    targetAgentId,
    displayKey,
    created: visibleSession.missing === true,
    message,
    timeoutSeconds
  });
  if (vRelay.kind === "result") return jsonResult(vRelay.result);
  if (vRelay.kind === "accepted") {
    recordSessionToolActionFact({
      operation: "send",
      fact: "committed",
      targetAgentId,
      targetSessionKey: resolvedKey
    });
    recordSessionParticipantBestEffort({
      identity: {
        type: "agent",
        id: requesterAgentId
      },
      promptedAt,
      agentId: targetAgentId,
      sessionKey: resolvedKey,
      storePath: resolveSessionStorePathCore(cfg.session?.store, { agentId: targetAgentId }),
      onError: (error) => log.warn("failed to record session participant", { error })
    });
    const vWatch = registerWatchIfRequested(resolvedKey);
    if (vRelay.mode === "async") {
      vRecordAccepted(opts?.runId, resolvedKey, displayKey, vRelay.accepted);
      return jsonResult(vAcceptedResult(vRelay.accepted, displayKey, vWatch));
    }
    return jsonResult(await vWaitInline({
      gatewayCall,
      accepted: vRelay.accepted,
      requesterRunId: opts?.runId,
      targetSessionKey: resolvedKey,
      displayKey,
      inlineTimeoutMs: vRelay.inlineTimeoutMs,
      signal: vRelayToolSignal ?? opts?.signal,
      watch: vWatch
    }));
  }
}
`, 5);

/** Optional fields each output branch gains (§3.1 (3)); every branch stays additionalProperties:false. */
export const SCHEMA_FIELDS = Object.freeze([
  ['\t\tstatus: Type.Union([Type.Literal("error"), Type.Literal("forbidden")]),\n', ["code: Type.Optional(Type.String())", "requestCode: Type.Optional(Type.String())"]],
  ['\t\tstatus: Type.Literal("accepted"),\n', ["requestCode: Type.Optional(Type.String())", "note: Type.Optional(Type.String())", "queuePosition: Type.Optional(Type.Integer())", "waitingBehindActiveRun: Type.Optional(Type.Boolean())"]],
  ['\t\tstatus: Type.Literal("no_reply"),\n', ["requestCode: Type.Optional(Type.String())", "note: Type.Optional(Type.String())"]],
  ['\t\tstatus: Type.Literal("ok"),\n', ["requestCode: Type.Optional(Type.String())", "note: Type.Optional(Type.String())", "media: Type.Optional(Type.Array(Type.String()))"]],
]);

function count(source, needle) {
  let n = 0;
  for (let at = source.indexOf(needle); at >= 0; at = source.indexOf(needle, at + needle.length)) n += 1;
  return n;
}

function once(source, anchor, label) {
  const parts = source.split(anchor);
  if (parts.length !== 2) {
    throw new Error(`${label}: expected exactly one anchor, found ${parts.length - 1}`);
  }
  return parts;
}

function patchOutputSchema(source) {
  const [head, rest] = once(source, SCHEMA_START, "sessions_send output schema start");
  const endAt = rest.indexOf(SCHEMA_END);
  if (endAt < 0) throw new Error("sessions_send output schema end anchor not found");
  let schema = rest.slice(0, endAt);
  for (const [statusLine, fields] of SCHEMA_FIELDS) {
    const [before, after] = once(schema, statusLine, `output schema branch ${statusLine.trim()}`);
    const branchEnd = after.indexOf(BRANCH_END);
    if (branchEnd < 0) throw new Error(`output schema branch ${statusLine.trim()}: watched/end not found`);
    const added = fields.map((field) => `\t\t${field},\n`).join("");
    schema = `${before}${statusLine}${after.slice(0, branchEnd)}${added}${after.slice(branchEnd)}`;
  }
  return `${head}${SCHEMA_START}${schema}${rest.slice(endAt)}`;
}

/** v3 on top of v2-patched bytes. */
function applyV3(source) {
  if (source.includes(MARKER)) throw new Error("already patched");
  if (!source.includes(REPLY_ONCE_MARKER)) throw new Error(`v3 must stack on v2 (${REPLY_ONCE_MARKER})`);
  for (const needle of REQUIRED_SCOPE) {
    if (count(source, needle) !== 1) throw new Error(`module scope changed: expected exactly one ${JSON.stringify(needle)}`);
  }
  for (const name of NEW_IDENTIFIERS) {
    if (new RegExp(`\\b${name}\\b`, "u").test(source)) throw new Error(`identifier ${name} already exists`);
  }
  const [beforeTool, afterTool] = once(source, TOOL_START, "createSessionsSendTool");
  let out = `${beforeTool}${HELPERS}${TOOL_START}${afterTool}`;
  const [beforeExecute, afterExecute] = once(out, EXECUTE, "sessions_send execute");
  if (!beforeExecute.includes(TOOL_START) || !afterExecute.includes(HANDOFF_ANCHOR)) throw new Error("sessions_send execute: not inside createSessionsSendTool");
  out = `${beforeExecute}${EXECUTE_V3}${afterExecute}`;
  const [beforeDescription, afterDescription] = once(out, DESCRIPTION, "sessions_send description");
  out = `${beforeDescription}${DESCRIPTION_V3}${afterDescription}`;
  out = patchOutputSchema(out);
  const [beforeHandoff, afterHandoff] = once(out, HANDOFF_ANCHOR, "sessions_send hand-off point");
  out = `${beforeHandoff}${HANDOFF}${HANDOFF_ANCHOR}${afterHandoff}`;
  if (count(out, MARKER) !== 1) throw new Error("marker must occur exactly once");
  return out;
}

/** Patched sessions-spawn-tool-1FQMTkIo.js, from the exact bytes V runs: v2, then v3. */
export function patchSessionsSendRelay(source) {
  if (source.includes(MARKER)) throw new Error("already patched");
  return applyV3(patchSessionsSendReplyOnce(source));
}

const TOOLS_CALL =
  "\t\t\tcreateSessionsSendTool({\n\t\t\t\tagentId: sessionAgentId,\n\t\t\t\tagentSessionKey: options?.agentSessionKey,\n\t\t\t\tagentChannel: options?.agentChannel,\n\t\t\t\tsandboxed: options?.sandboxed,\n\t\t\t\tconfig: sessionConfig\n\t\t\t})";
const TOOLS_CALL_V1 =
  "\t\t\tcreateSessionsSendTool({\n\t\t\t\tagentId: sessionAgentId,\n\t\t\t\tagentSessionKey: options?.agentSessionKey,\n\t\t\t\tagentChannel: options?.agentChannel,\n\t\t\t\tsandboxed: options?.sandboxed,\n\t\t\t\tconfig: sessionConfig,\n"
  + `\t\t\t\t// ${TOOLS_MARKER}: the requester turn's run, sender and route, for vrelay.send (design §3.2)\n`
  + "\t\t\t\trunId: options?.runId,\n\t\t\t\trequesterSenderId: options?.requesterSenderId ?? void 0,\n\t\t\t\tsenderIsOwner: options?.senderIsOwner,\n"
  + "\t\t\t\tagentAccountId: options?.agentAccountId,\n\t\t\t\tagentTo: options?.agentTo,\n\t\t\t\tagentThreadId: options?.agentThreadId\n\t\t\t})";

/** Patched openclaw-tools-BODVdJQD.js, from the exact bytes V runs. */
export function patchOpenclawTools(source) {
  if (source.includes(TOOLS_MARKER)) throw new Error("already patched");
  const [before, after] = once(source, TOOLS_CALL, "createSessionsSendTool call");
  return `${before}${TOOLS_CALL_V1}${after}`;
}

/** Regenerate both outputs from the capture: `node lab/release-files/sessions-send-relay/patch.mjs`. */
export function generate(repoRoot = new URL("../../../", import.meta.url)) {
  const read = (file) => fs.readFileSync(new URL(`${CAPTURE_DIR}/${file}`, repoRoot), "utf8");
  const out = new URL("generated/", import.meta.url);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(new URL(FILES.sessionsSpawnTool, out), patchSessionsSendRelay(read(FILES.sessionsSpawnTool)));
  fs.writeFileSync(new URL(FILES.openclawTools, out), patchOpenclawTools(read(FILES.openclawTools)));
}

if (import.meta.url === `file://${process.argv[1]}`) generate();
