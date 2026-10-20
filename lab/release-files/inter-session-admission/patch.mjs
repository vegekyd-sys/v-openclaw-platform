// Exclusive admission for inter-session turns (docs/inter-session/design.md §3.3, §3.4; WP1).
//
// A turn that a channel inbound bridge starts for v-session-relay carries
// `replyOptions.vInterSession = { exclusive: true, id, kind, onBusy }` (the same object also
// rides on the inbound context as `ctx.VInterSession`). Such a turn must run on its own, as a
// separate run with its own reply card, or not at all:
//
//   get-reply (prepareReplyRunAdmission), right after the queue admission state is known and
//   before system events are drained or anything reaches the transcript:
//     - recovery owner holds the session  -> BUSY "recovery_owner"
//     - a followup queue already exists   -> BUSY "pending_queue"
//     - a run is active                   -> BUSY "active_run", unless the only thing running
//                                            is a deferred memory flush that yields to a new turn
//   BUSY calls vInterSession.onBusy({ reason, activeSessionId }) once, marks the turn as a
//   deliberate silent terminal reply (so neither core nor the channel posts a "no visible
//   reply" fallback), cleans up typing and returns { kind: "reply", reply: undefined }, the
//   same early exit core already uses for an unauthorized command. The two native exits that
//   would otherwise post REPLY_RUN_STILL_SHUTTING_DOWN_TEXT into the target chat are a BUSY
//   "active_run" as well: the heartbeat preemption timeout (before the guard), and the run-now
//   wait after the guard (reached only when a deferred memory flush alone kept the session active
//   in interrupt queue mode, and the interrupted flush has not let go after the settle timeout).
//   In interrupt queue mode an exclusive turn also does not clear the session's queued commands
//   before admission (three extensions of §3.3, see the test).
//
//   agent-runner.runtime:
//     - publishes the deferred-flush seam globalThis[Symbol.for("openclaw.v.deferredMemoryFlush")]
//       = { v: 1, activeAfterYield({ sessionKey, providedReplyOperation }) }, the same rule as
//       resolveReplyActiveAfterDeferredFlushYield without the log line;
//     - never steers an exclusive turn into the active run and never queues it as a followup:
//       if the session became active between the get-reply guard and runReplyAgent (an agent RPC
//       turn that holds no admission ticket), the turn runs now and the session lane orders it.
//
// Turns without vInterSession.exclusive === true are unaffected.
//
// Generated from the exact bytes V runs (release/captured/v2026.9.1-db91.6-subagent-index-20261020,
// tests/fixtures/inter-session-v-bytes.json), never from an upstream copy (release-artifact-rebase-trap).
// The literals below are shared with apps/v-session-relay/plugin/core/contracts.js; the test asserts
// that both sides agree.
import fs from "node:fs";
import path from "node:path";

export const MARKER = "v-inter-session-exclusive-v1";
export const FILES = Object.freeze({
  getReply: "get-reply-CqW1y05D.js",
  agentRunnerRuntime: "agent-runner.runtime-CAdsMsQt.js",
});
/** contracts.SYMBOL_KEYS.deferredMemoryFlush */
export const DEFERRED_MEMORY_FLUSH_KEY = "openclaw.v.deferredMemoryFlush";
/** contracts.BUSY_REASONS */
export const BUSY_REASONS = Object.freeze(["active_run", "pending_queue", "recovery_owner"]);

// ---------------------------------------------------------------- get-reply

const G_ADMISSION_START = "//#region src/auto-reply/reply/get-reply-run-admission.ts\nasync function prepareReplyRunAdmission(context) {\n";

const G_HELPERS = `//#region src/auto-reply/reply/get-reply-run-admission.ts
// ${MARKER}: a turn started by a channel inbound bridge for v-session-relay
// (replyOptions.vInterSession, mirrored on ctx.VInterSession) never steers into, queues behind or
// interrupts another turn. When the session is busy it tells the bridge and ends silently, before
// system events are drained and before anything reaches the transcript.
function vInterSessionExclusive(opts, ctx) {
	const vInter = opts?.vInterSession ?? ctx?.VInterSession;
	return vInter?.exclusive === true ? vInter : void 0;
}
/** True when only a deferred memory flush keeps the session active (it yields to a new turn). */
function vInterSessionFlushOnly(sessionKey, providedReplyOperation) {
	const vFlush = globalThis[Symbol.for("${DEFERRED_MEMORY_FLUSH_KEY}")];
	if (!sessionKey || typeof vFlush?.activeAfterYield !== "function") return false;
	try {
		return vFlush.activeAfterYield({
			sessionKey,
			providedReplyOperation
		}) === false;
	} catch {
		return false;
	}
}
function vInterSessionBusy(vInter, info, opts, typing) {
	try {
		vInter.onBusy?.(info);
	} catch {}
	opts?.onDeliberateSilentTerminalReply?.();
	typing.cleanup();
	return {
		kind: "reply",
		reply: void 0
	};
}
async function prepareReplyRunAdmission(context) {
`;

const G_HEARTBEAT_TIMEOUT = `\tif (heartbeatPreemption === "timed-out") {
\t\ttyping.cleanup();
\t\treturn {
\t\t\tkind: "reply",
\t\t\treply: { text: REPLY_RUN_STILL_SHUTTING_DOWN_TEXT }
\t\t};
\t}
`;

const G_HEARTBEAT_TIMEOUT_EXCLUSIVE = `\tif (heartbeatPreemption === "timed-out") {
\t\tconst vInterHeartbeat = vInterSessionExclusive(opts, ctx);
\t\tif (vInterHeartbeat) return vInterSessionBusy(vInterHeartbeat, {
\t\t\treason: "${BUSY_REASONS[0]}",
\t\t\tactiveSessionId: rawActiveSessionIdForInterrupt
\t\t}, opts, typing);
\t\ttyping.cleanup();
\t\treturn {
\t\t\tkind: "reply",
\t\t\treply: { text: REPLY_RUN_STILL_SHUTTING_DOWN_TEXT }
\t\t};
\t}
`;

// Interrupt queue mode (a session's `/queue interrupt`, or a channel default) clears the session's
// queued commands before admission is decided. An exclusive turn interrupts nothing, and a BUSY one
// must not have side effects, so it leaves the lane alone and waits its turn in it.
const G_INTERRUPT_CLEAR = `\tif (activeRunQueueMode === "interrupt" && !isRoomEvent && sessionLaneKey && (laneSize > 0 || activeSessionIdForInterrupt)) {
`;

const G_INTERRUPT_CLEAR_EXCLUSIVE = `\tif (activeRunQueueMode === "interrupt" && !isRoomEvent && sessionLaneKey && (laneSize > 0 || activeSessionIdForInterrupt) && !vInterSessionExclusive(opts, ctx)) {
`;

const G_QUEUE_ADMISSION = `\tconst queueAdmissionState = !pendingQueue ? "empty" : pendingQueue.items.some((item) => !item.steerPending) || pendingQueue.inFlight.size > 0 || pendingQueue.droppedCount > 0 ? "ready" : "steering";
\tconst activeRunAcceptsCurrentThread = resolveActiveRunAcceptsCurrentThread({ isActive });
`;

const G_QUEUE_ADMISSION_GUARDED = `\tconst queueAdmissionState = !pendingQueue ? "empty" : pendingQueue.items.some((item) => !item.steerPending) || pendingQueue.inFlight.size > 0 || pendingQueue.droppedCount > 0 ? "ready" : "steering";
\tconst vInter = vInterSessionExclusive(opts, ctx);
\tif (vInter) {
\t\tconst vFlushOnly = isActive && !recoveryOwnerActive && vInterSessionFlushOnly(sessionKey, providedReplyOperation);
\t\tconst vBusy = recoveryOwnerActive ? "${BUSY_REASONS[2]}" : queueAdmissionState !== "empty" ? "${BUSY_REASONS[1]}" : isActive && !vFlushOnly ? "${BUSY_REASONS[0]}" : void 0;
\t\tif (vBusy) return vInterSessionBusy(vInter, {
\t\t\treason: vBusy,
\t\t\tactiveSessionId
\t\t}, opts, typing);
\t}
\tconst activeRunAcceptsCurrentThread = resolveActiveRunAcceptsCurrentThread({ isActive });
`;

// The run-now wait after the guard. An exclusive turn reaches it only when the guard let it through
// because a deferred memory flush alone kept the session active (vInterSessionFlushOnly) and the
// queue mode does not queue it (interrupt mode: the flush is interrupted, as for a person's message).
// If the session still reads active after the settle timeout, V would post
// REPLY_RUN_STILL_SHUTTING_DOWN_TEXT; an exclusive turn ends BUSY instead. System events are drained
// only after this block, so nothing is lost.
const G_RUN_NOW_REPLY = `\t\tif (queueState.kind === "reply") {
\t\t\ttyping.cleanup();
\t\t\treturn {
\t\t\t\tkind: "reply",
\t\t\t\treply: queueState.reply
\t\t\t};
\t\t}
`;

const G_RUN_NOW_REPLY_EXCLUSIVE = `\t\tif (queueState.kind === "reply") {
\t\t\tconst vInterQueue = vInterSessionExclusive(opts, ctx);
\t\t\tif (vInterQueue) return vInterSessionBusy(vInterQueue, {
\t\t\t\treason: "${BUSY_REASONS[0]}",
\t\t\t\tactiveSessionId
\t\t\t}, opts, typing);
\t\t\ttyping.cleanup();
\t\t\treturn {
\t\t\t\tkind: "reply",
\t\t\t\treply: queueState.reply
\t\t\t};
\t\t}
`;

// ---------------------------------------------------------------- agent-runner.runtime

const R_FLUSH_YIELD = `function resolveReplyActiveAfterDeferredFlushYield(params) {
\tif (!params.isActive || params.isHeartbeat || !params.sessionKey) return params.isActive;
\tconst job = deferredMemoryFlushJobs.get(params.sessionKey);
\tif (!job || !(job.inFlight > 0)) return true;
\tconst operation = replyRunRegistry.get(params.sessionKey);
\tif (operation !== void 0 && operation !== params.providedReplyOperation) return true;
\tlogMemoryFlushDeferral({
\t\tphase: "turn-not-busy",
\t\tsession: hashMemoryFlushSessionKey(params.sessionKey),
\t\tflush: "in-flight"
\t});
\treturn false;
}
`;

const R_FLUSH_SEAM = `// ${MARKER}: the rule above for get-reply's inter-session admission guard, without the log
// line. false = only a deferred memory flush keeps the session active, and it yields to a new turn.
globalThis[Symbol.for("${DEFERRED_MEMORY_FLUSH_KEY}")] = {
\tv: 1,
\tactiveAfterYield: ({ sessionKey, providedReplyOperation }) => {
\t\tconst job = deferredMemoryFlushJobs.get(sessionKey);
\t\tif (!job || !(job.inFlight > 0)) return true;
\t\tconst operation = replyRunRegistry.get(sessionKey);
\t\treturn operation !== void 0 && operation !== providedReplyOperation;
\t}
};
`;

const R_STEER = `\tconst effectiveShouldSteer = !isHeartbeat && !effectiveResetTriggered && shouldSteer;
\tconst effectiveShouldFollowup = !effectiveResetTriggered && shouldFollowup;
`;

const R_STEER_EXCLUSIVE = `\tconst vExclusive = (opts?.vInterSession ?? sessionCtx?.VInterSession)?.exclusive === true;
\tconst effectiveShouldSteer = !vExclusive && !isHeartbeat && !effectiveResetTriggered && shouldSteer;
\tconst effectiveShouldFollowup = !vExclusive && !effectiveResetTriggered && shouldFollowup;
\tif (vExclusive && isActive) logVerbose("inter-session exclusive turn found the session active after admission; running after it");
`;

// ---------------------------------------------------------------- helpers

function count(source, needle) {
  let n = 0;
  for (let at = source.indexOf(needle); at >= 0; at = source.indexOf(needle, at + needle.length)) n += 1;
  return n;
}

function replaceOnce(source, anchor, replacement, label) {
  const found = count(source, anchor);
  if (found !== 1) throw new Error(`${label}: expected exactly one anchor, found ${found}`);
  return source.replace(anchor, () => replacement);
}

function refuseTwice(source, file) {
  if (source.includes(MARKER)) throw new Error(`${file}: already patched (${MARKER})`);
}

/** The anchors each patch needs, for the anchor-uniqueness test. */
export const ANCHORS = Object.freeze({
  getReply: Object.freeze([G_ADMISSION_START, G_HEARTBEAT_TIMEOUT, G_INTERRUPT_CLEAR, G_QUEUE_ADMISSION, G_RUN_NOW_REPLY]),
  agentRunnerRuntime: Object.freeze([R_FLUSH_YIELD, R_STEER]),
});

/** Patched get-reply-CqW1y05D.js, from the exact bytes V runs. */
export function patchGetReply(source) {
  refuseTwice(source, FILES.getReply);
  let out = replaceOnce(source, G_ADMISSION_START, G_HELPERS, "prepareReplyRunAdmission start");
  out = replaceOnce(out, G_HEARTBEAT_TIMEOUT, G_HEARTBEAT_TIMEOUT_EXCLUSIVE, "heartbeat preemption timeout");
  out = replaceOnce(out, G_INTERRUPT_CLEAR, G_INTERRUPT_CLEAR_EXCLUSIVE, "interrupt-mode lane clear");
  out = replaceOnce(out, G_QUEUE_ADMISSION, G_QUEUE_ADMISSION_GUARDED, "queue admission state");
  out = replaceOnce(out, G_RUN_NOW_REPLY, G_RUN_NOW_REPLY_EXCLUSIVE, "run-now wait still active");
  return out;
}

/** Patched agent-runner.runtime-CAdsMsQt.js, from the exact bytes V runs. */
export function patchAgentRunnerRuntime(source) {
  refuseTwice(source, FILES.agentRunnerRuntime);
  let out = replaceOnce(source, R_FLUSH_YIELD, `${R_FLUSH_YIELD}${R_FLUSH_SEAM}`, "resolveReplyActiveAfterDeferredFlushYield");
  out = replaceOnce(out, R_STEER, R_STEER_EXCLUSIVE, "runReplyAgent steer/followup decision");
  return out;
}

export const PATCHERS = Object.freeze({
  [FILES.getReply]: patchGetReply,
  [FILES.agentRunnerRuntime]: patchAgentRunnerRuntime,
});

// node patch.mjs <captured dist dir> <output dir>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [inputDir, outputDir] = process.argv.slice(2);
  if (!inputDir || !outputDir) {
    console.error("usage: node patch.mjs <captured dist dir> <output dir>");
    process.exit(2);
  }
  fs.mkdirSync(outputDir, { recursive: true });
  for (const [file, patch] of Object.entries(PATCHERS)) {
    fs.writeFileSync(path.join(outputDir, file), patch(fs.readFileSync(path.join(inputDir, file), "utf8")));
  }
}
