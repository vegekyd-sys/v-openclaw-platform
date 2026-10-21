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
//   dispatch-from-config (dispatch level, before get-reply):
//     - when dispatch itself finds the session busy before get-reply runs (the pre-dispatch or the
//       dispatch reply-operation acquisition), an exclusive turn calls onBusy({ reason: "active_run" })
//       too, so the bridge sees BUSY instead of GATED; dispatch's busy exit posts nothing.
//
// Turns without vInterSession.exclusive === true are unaffected by the above.
//
// Literal text (same marker; Telegram review of WP6). A turn whose text must be taken literally, that
// is an inter-session turn (replyOptions.vInterSession or ctx.VInterSession present) or any turn with
// ctx.CommandInterpretationSuppressed === true, never has its text interpreted as a command or trigger,
// in particular not before the admission guard. V configures commands.allowFrom with "*" for its
// channels, so CommandAuthorized:false alone does not make such a turn's sender unauthorized
// (resolveCommandSenderAuthorization ignores commandAuthorized when an allowFrom list applies), and
// CommandInterpretationSuppressed was read only by directives, handleCommands and the run context:
//   dispatch-from-config:
//     - fast abort ("停止", "stop", "/stop", ...) does not abort the target's run or post "Agent was aborted";
//     - fast approve ("/approve <id> ...") does not resolve a pending approval;
//     - the dispatch reset admission ("/new", "/reset") does not mark the turn as a reset;
//     - the turn is never an explicit command turn (no active-run-safe command resolution).
//   get-reply:
//     - "/new", "/reset" and soft-reset triggers do not reset the session (initSessionState);
//     - the native/authorized text slash fast path and the explicit "/steer" / "/tell" retarget do not run;
//     - directives, skill slash commands ("/<skill> ..."), explicit skill references, inline simple
//       commands and the command handlers are not interpreted (the native CommandInterpretationSuppressed
//       gates now also cover a vInterSession turn), and neither is a native command turn's directive;
//     - a leading think-level word ("high", "think", "on", ...) neither sets the turn's thinking level nor
//       is cut from the request (prepareReplyRunAdmission, before the guard);
//     - an abort word does not exempt the turn from the abort cutoff bookkeeping a plain message gets.
// The upstream semantics are the same: chat.send treats suppressed text as literal
// (chat-send-request.ts: stopCommand = !commandInterpretationSuppressed && ...; commands-core.ts:
// "Literal Gateway input must bypass commands as well as directive parsing").
//
// Generated from the exact bytes V runs (release/captured/v2026.9.1-db91.6-subagent-index-20261020,
// tests/fixtures/inter-session-v-bytes.json), never from an upstream copy (release-artifact-rebase-trap).
// dispatch-from-config-DOJq_7CI.js on V is already a V patch (feishu-secret-entry); its captured bytes
// are the input. Ship the three files together: each is safe alone, but G without D leaves the dispatch
// fast paths open and D without G leaves get-reply's.
// The literals below are shared with apps/v-session-relay/plugin/core/contracts.js; the test asserts
// that both sides agree.
import fs from "node:fs";
import path from "node:path";

export const MARKER = "v-inter-session-exclusive-v1";
export const FILES = Object.freeze({
  getReply: "get-reply-CqW1y05D.js",
  agentRunnerRuntime: "agent-runner.runtime-CAdsMsQt.js",
  dispatchFromConfig: "dispatch-from-config-DOJq_7CI.js",
});
/** contracts.SYMBOL_KEYS.deferredMemoryFlush */
export const DEFERRED_MEMORY_FLUSH_KEY = "openclaw.v.deferredMemoryFlush";
/** contracts.BUSY_REASONS */
export const BUSY_REASONS = Object.freeze(["active_run", "pending_queue", "recovery_owner"]);

// ---------------------------------------------------------------- get-reply

const G_ADMISSION_START = "//#region src/auto-reply/reply/get-reply-run-admission.ts\nasync function prepareReplyRunAdmission(context) {\n";

const G_HELPERS = `//#region src/auto-reply/reply/get-reply-run-admission.ts
import { d as vInterSessionEmbeddedHandleActive } from "./runs-5WnDPZ0V.js";
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
/**
* True when the turn's text must be taken literally: an inter-session turn (replyOptions.vInterSession or
* ctx.VInterSession present) or any turn whose sender suppressed command interpretation. Such text never
* resets the session, runs a slash/skill/inline command or fast path, sets a directive or retargets a steer.
*/
function vInterSessionLiteralText(ctx, opts) {
	return ctx?.CommandInterpretationSuppressed === true || ctx?.VInterSession != null || opts?.vInterSession != null;
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

// A queued dispatch operation is only a placeholder. Its session id can also name a
// different embedded RPC that bypassed dispatch; exclusive requests must still see it.
// The generic isEmbeddedAgentRunActive includes the queued placeholder itself; use the
// raw execution-handle registry so an idle placeholder cannot keep returning BUSY.
const G_OWN_QUEUED = `\t\tif (!recoveryOwnerRelease && isOwnPreDispatchOperationSession(activeSessionId)) return {
`;
const G_OWN_QUEUED_EXCLUSIVE = `\t\tconst vCompetingEmbeddedRun = vInterSessionExclusive(opts, ctx) && embeddedActiveSessionId != null && vInterSessionEmbeddedHandleActive(embeddedActiveSessionId);
\t\tif (!recoveryOwnerRelease && isOwnPreDispatchOperationSession(activeSessionId) && !vCompetingEmbeddedRun) return {
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

// Literal text: every place get-reply interprets the turn's text (or a text-derived command turn) as a
// command or trigger. The native CommandInterpretationSuppressed gates (directives, run context) now go
// through vInterSessionLiteralText, so a vInterSession turn is literal even without that flag.

// resolveReplyDirectives: think/verbose/fast/reasoning/elevated/exec/model/queue/status directives.
const G_DIRECTIVES = `\tconst canInterpretTextDirectives = allowTextCommands && command.isAuthorizedSender && ctx.CommandInterpretationSuppressed !== true;
`;
const G_DIRECTIVES_LITERAL = `\tconst canInterpretTextDirectives = allowTextCommands && command.isAuthorizedSender && !vInterSessionLiteralText(ctx, opts);
`;

// handleInlineActions: an abort word skips the abort-cutoff bookkeeping; literal text gets the
// bookkeeping of any plain message.
const G_INLINE_CUTOFF = `\tconst targetSessionEntry = sessionStore?.[sessionKey] ?? sessionEntry;
\tif (!isAbortRequestText(command.rawBodyNormalized) && targetSessionEntry) {
`;
const G_INLINE_CUTOFF_LITERAL = `\tconst targetSessionEntry = sessionStore?.[sessionKey] ?? sessionEntry;
\tconst vLiteralText = vInterSessionLiteralText(ctx, opts);
\tif ((vLiteralText || !isAbortRequestText(command.rawBodyNormalized)) && targetSessionEntry) {
`;

// handleInlineActions: "/<skill> args" (a tool-dispatch skill runs its tool right here, before
// admission) and explicit skill references. Only command.isAuthorizedSender gated them.
const G_INLINE_SKILLS = `\tconst hasSkillReferences = command.isAuthorizedSender && hasSkillReferenceCandidate(explicitSkillReferenceBody);
\tconst hasSkillSlashCandidate = command.isAuthorizedSender && slashCommandName !== null && (slashCommandName === "skill" || !getBuiltinSlashCommands().has(slashCommandName));
`;
const G_INLINE_SKILLS_LITERAL = `\tconst hasSkillReferences = !vLiteralText && command.isAuthorizedSender && hasSkillReferenceCandidate(explicitSkillReferenceBody);
\tconst hasSkillSlashCandidate = !vLiteralText && command.isAuthorizedSender && slashCommandName !== null && (slashCommandName === "skill" || !getBuiltinSlashCommands().has(slashCommandName));
`;

// handleInlineActions: inline simple commands are cut out of the body and run.
const G_INLINE_COMMAND = `\tconst inlineCommand = allowTextCommands && command.isAuthorizedSender && !hasExplicitSkillReferences ? extractInlineSimpleCommand(cleanedBody) : null;
`;
const G_INLINE_COMMAND_LITERAL = `\tconst inlineCommand = !vLiteralText && allowTextCommands && command.isAuthorizedSender && !hasExplicitSkillReferences ? extractInlineSimpleCommand(cleanedBody) : null;
`;

// handleInlineActions: a body that starts with "/" goes to the command handlers (handleCommands checks
// only ctx.CommandInterpretationSuppressed); literal text continues as a message.
const G_INLINE_RUN_COMMANDS = `\tif (!(!hasExplicitSkillReferences && (inlineCommand !== null || directiveAck !== void 0 || inlineStatusRequested || command.commandBodyNormalized.trim().startsWith("/")))) return {
`;
const G_INLINE_RUN_COMMANDS_LITERAL = `\tif (vLiteralText || !(!hasExplicitSkillReferences && (inlineCommand !== null || directiveAck !== void 0 || inlineStatusRequested || command.commandBodyNormalized.trim().startsWith("/")))) return {
`;

// The native / authorized text slash command fast path at the top of getReplyFromConfig.
const G_NATIVE_SLASH = `\tif (!shouldRunNativeSlashCommandFastPath(params.ctx)) return { handled: false };
`;
const G_NATIVE_SLASH_LITERAL = `\tif (vInterSessionLiteralText(params.ctx, params.opts) || !shouldRunNativeSlashCommandFastPath(params.ctx)) return { handled: false };
`;

// prepareReplyRunContext: the unauthorized whole-message command exit and the bare /new or /reset prompt.
const G_RUN_CONTEXT = `\tconst canInterpretCommands = ctx.CommandInterpretationSuppressed !== true;
`;
const G_RUN_CONTEXT_LITERAL = `\tconst canInterpretCommands = !vInterSessionLiteralText(ctx, opts);
`;

// initSessionState: "/new", "/reset" (and their payload) and the soft-reset trigger.
const G_SESSION_RESET = `\tconst { matchedResetTriggerLower, softResetMatched, triggerBodyNormalized } = resetCommand;
`;
const G_SESSION_RESET_LITERAL = `\tconst vLiteralText = vInterSessionLiteralText(ctx);
\tconst { matchedResetTriggerLower, softResetMatched, triggerBodyNormalized } = vLiteralText ? {
\t\t...resetCommand,
\t\tmatchedResetTriggerLower: void 0,
\t\tsoftResetMatched: false
\t} : resetCommand;
`;

// getReplyFromConfig: an explicit "/steer" or "/tell" retargets the turn to the session it names.
const G_EXPLICIT_STEER = `\tif (explicitSteerTargetSessionKey) finalized.CommandTargetSessionKey = explicitSteerTargetSessionKey;
`;
const G_EXPLICIT_STEER_LITERAL = `\tif (explicitSteerTargetSessionKey && !vInterSessionLiteralText(finalized, opts)) finalized.CommandTargetSessionKey = explicitSteerTargetSessionKey;
`;

// resolveReplyDirectives: a native command turn's directive (a native /think, /model, ...) reads its
// arguments from the text even where text directives are off.
const G_NATIVE_DIRECTIVE = `\tconst nativeDirectiveCommand = command.isAuthorizedSender && isNativeCommandTurn(commandTurn) && commandTurn.commandName ? resolveNativeReplyDirectiveCommand((await loadCommandsRegistry()).findCommandByNativeName(commandTurn.commandName, command.channel, { includeBundledChannelFallback: false })?.key) : void 0;
`;
const G_NATIVE_DIRECTIVE_LITERAL = `\tconst nativeDirectiveCommand = !vInterSessionLiteralText(ctx, opts) && command.isAuthorizedSender && isNativeCommandTurn(commandTurn) && commandTurn.commandName ? resolveNativeReplyDirectiveCommand((await loadCommandsRegistry()).findCommandByNativeName(commandTurn.commandName, command.channel, { includeBundledChannelFallback: false })?.key) : void 0;
`;

// prepareReplyRunAdmission, before the guard: with no thinking level resolved for the turn, a leading
// "high" / "low" / "think" / "on" / "off" / "max" / "auto" ... word sets it and is cut from the body.
const G_THINK_SHORTHAND = `\tif (!resolvedThinkLevel && prefixedBodyBase) {
`;
const G_THINK_SHORTHAND_LITERAL = `\tif (!resolvedThinkLevel && prefixedBodyBase && !vInterSessionLiteralText(ctx, opts)) {
`;

// ---------------------------------------------------------------- dispatch-from-config

const D_OPERATION_START = "//#region src/auto-reply/reply/dispatch-from-config.prepare-operation.ts\nasync function prepareDispatchOperation(state) {\n";

const D_HELPERS = `//#region src/auto-reply/reply/dispatch-from-config.prepare-operation.ts
// ${MARKER}: a turn whose text must be taken literally (an inter-session turn started by a channel
// inbound bridge for v-session-relay, or any turn whose sender suppressed command interpretation) never
// triggers a native fast path here: an abort word does not abort the target's run, "/approve" does not
// resolve an approval, "/new" or "/reset" does not make the turn a reset, and it is never an explicit
// command turn. An exclusive inter-session turn that dispatch finds busy before get-reply tells the
// bridge (onBusy) instead of ending as if a gate had dropped it.
function vInterSessionLiteralText(ctx, replyOptions) {
\treturn ctx?.CommandInterpretationSuppressed === true || ctx?.VInterSession != null || replyOptions?.vInterSession != null;
}
function vInterSessionDispatchBusy(ctx, replyOptions) {
\tconst vInter = replyOptions?.vInterSession ?? ctx?.VInterSession;
\tif (vInter?.exclusive !== true) return;
\ttry {
\t\tvInter.onBusy?.({ reason: "${BUSY_REASONS[0]}" });
\t} catch {}
}
async function prepareDispatchOperation(state) {
`;

// resolveDispatchResetAdmission: reset triggers decide admitReplyTurn's resetTriggered. (Inter-session
// provenance already classifies as an agent actor; a suppressed turn without provenance did not.)
const D_RESET_ADMISSION = `\tif (params.hasPluginOwnedBinding || entry?.pluginOwnerId !== void 0 || ctx.InboundAccessAuthorized !== true || ctx.InboundEventKind === "room_event" || nativeCommandTarget !== void 0 && nativeCommandTarget !== params.sessionKey || actorType !== "human") return {
`;
const D_RESET_ADMISSION_LITERAL = `\tif (params.hasPluginOwnedBinding || entry?.pluginOwnerId !== void 0 || ctx.InboundAccessAuthorized !== true || ctx.InboundEventKind === "room_event" || nativeCommandTarget !== void 0 && nativeCommandTarget !== params.sessionKey || actorType !== "human" || vInterSessionLiteralText(ctx)) return {
`;

// prepareDispatchOperationContext: explicit command turns get active-run-safe command resolution.
const D_EXPLICIT_COMMAND = `\tconst explicitCommandTurnCtx = isExplicitSourceReplyCommand(ctx, cfg);
`;
const D_EXPLICIT_COMMAND_LITERAL = `\tconst explicitCommandTurnCtx = !vInterSessionLiteralText(ctx, params.replyOptions) && isExplicitSourceReplyCommand(ctx, cfg);
`;

// prepareDispatchOperation: fast abort and fast approve run before the admission ticket, the
// reply-operation admission and get-reply's guard.
const D_FAST_ABORT = `\tconst fastAbort = await fastAbortResolver({
\t\tctx,
\t\tcfg
\t});
`;
const D_FAST_ABORT_LITERAL = `\tconst vLiteralText = vInterSessionLiteralText(ctx, params.replyOptions);
\tconst fastAbort = vLiteralText ? {
\t\thandled: false,
\t\taborted: false
\t} : await fastAbortResolver({
\t\tctx,
\t\tcfg
\t});
`;
const D_FAST_APPROVE = `\tif (/^\\s*\\/approve(?:@[^\\s]+)?(?:\\s|$)/i.test(ctx.commandText)) {
`;
const D_FAST_APPROVE_LITERAL = `\tif (!vLiteralText && /^\\s*\\/approve(?:@[^\\s]+)?(?:\\s|$)/i.test(ctx.commandText)) {
`;

// The two dispatch-level busy exits before get-reply (pre_dispatch, then dispatch acquisition).
const D_PRE_DISPATCH_BUSY = `\tif (preDispatchAcquisition.status === "busy") return {
\t\tstatus: "complete",
\t\tresult: state.finishReplyOperationBusyDispatch({ dedupeDisposition: "release" })
\t};
`;
const D_PRE_DISPATCH_BUSY_EXCLUSIVE = `\tif (preDispatchAcquisition.status === "busy") {
\t\tconst vBusyResult = state.finishReplyOperationBusyDispatch({ dedupeDisposition: "release" });
\t\tvInterSessionDispatchBusy(ctx, params.replyOptions);
\t\treturn {
\t\t\tstatus: "complete",
\t\t\tresult: vBusyResult
\t\t};
\t}
`;
const D_DISPATCH_BUSY = `\tif (dispatchAcquisition.status === "busy") return {
\t\tstatus: "complete",
\t\tresult: state.finishReplyOperationBusyDispatch({ dedupeDisposition: "release" })
\t};
`;
const D_DISPATCH_BUSY_EXCLUSIVE = `\tif (dispatchAcquisition.status === "busy") {
\t\tconst vBusyResult = state.finishReplyOperationBusyDispatch({ dedupeDisposition: "release" });
\t\tvInterSessionDispatchBusy(ctx, params.replyOptions);
\t\treturn {
\t\t\tstatus: "complete",
\t\t\tresult: vBusyResult
\t\t};
\t}
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
  getReply: Object.freeze([
    G_ADMISSION_START, G_HEARTBEAT_TIMEOUT, G_INTERRUPT_CLEAR, G_OWN_QUEUED, G_QUEUE_ADMISSION, G_RUN_NOW_REPLY,
    G_DIRECTIVES, G_INLINE_CUTOFF, G_INLINE_SKILLS, G_INLINE_COMMAND, G_INLINE_RUN_COMMANDS,
    G_NATIVE_SLASH, G_RUN_CONTEXT, G_SESSION_RESET, G_EXPLICIT_STEER, G_NATIVE_DIRECTIVE, G_THINK_SHORTHAND,
  ]),
  agentRunnerRuntime: Object.freeze([R_FLUSH_YIELD, R_STEER]),
  dispatchFromConfig: Object.freeze([
    D_OPERATION_START, D_RESET_ADMISSION, D_EXPLICIT_COMMAND, D_FAST_ABORT, D_FAST_APPROVE,
    D_PRE_DISPATCH_BUSY, D_DISPATCH_BUSY,
  ]),
});

/** Patched get-reply-CqW1y05D.js, from the exact bytes V runs. */
export function patchGetReply(source) {
  refuseTwice(source, FILES.getReply);
  let out = replaceOnce(source, G_ADMISSION_START, G_HELPERS, "prepareReplyRunAdmission start");
  out = replaceOnce(out, G_HEARTBEAT_TIMEOUT, G_HEARTBEAT_TIMEOUT_EXCLUSIVE, "heartbeat preemption timeout");
  out = replaceOnce(out, G_INTERRUPT_CLEAR, G_INTERRUPT_CLEAR_EXCLUSIVE, "interrupt-mode lane clear");
  out = replaceOnce(out, G_OWN_QUEUED, G_OWN_QUEUED_EXCLUSIVE, "queued placeholder over competing RPC");
  out = replaceOnce(out, G_QUEUE_ADMISSION, G_QUEUE_ADMISSION_GUARDED, "queue admission state");
  out = replaceOnce(out, G_RUN_NOW_REPLY, G_RUN_NOW_REPLY_EXCLUSIVE, "run-now wait still active");
  out = replaceOnce(out, G_DIRECTIVES, G_DIRECTIVES_LITERAL, "directive interpretation gate");
  out = replaceOnce(out, G_INLINE_CUTOFF, G_INLINE_CUTOFF_LITERAL, "inline actions abort cutoff");
  out = replaceOnce(out, G_INLINE_SKILLS, G_INLINE_SKILLS_LITERAL, "inline actions skill commands");
  out = replaceOnce(out, G_INLINE_COMMAND, G_INLINE_COMMAND_LITERAL, "inline actions inline command");
  out = replaceOnce(out, G_INLINE_RUN_COMMANDS, G_INLINE_RUN_COMMANDS_LITERAL, "inline actions command handlers");
  out = replaceOnce(out, G_NATIVE_SLASH, G_NATIVE_SLASH_LITERAL, "native slash command fast path");
  out = replaceOnce(out, G_RUN_CONTEXT, G_RUN_CONTEXT_LITERAL, "run context command interpretation gate");
  out = replaceOnce(out, G_SESSION_RESET, G_SESSION_RESET_LITERAL, "session reset triggers");
  out = replaceOnce(out, G_EXPLICIT_STEER, G_EXPLICIT_STEER_LITERAL, "explicit steer retarget");
  out = replaceOnce(out, G_NATIVE_DIRECTIVE, G_NATIVE_DIRECTIVE_LITERAL, "native command directive");
  out = replaceOnce(out, G_THINK_SHORTHAND, G_THINK_SHORTHAND_LITERAL, "leading think-level word");
  return out;
}

/** Patched agent-runner.runtime-CAdsMsQt.js, from the exact bytes V runs. */
export function patchAgentRunnerRuntime(source) {
  refuseTwice(source, FILES.agentRunnerRuntime);
  let out = replaceOnce(source, R_FLUSH_YIELD, `${R_FLUSH_YIELD}${R_FLUSH_SEAM}`, "resolveReplyActiveAfterDeferredFlushYield");
  out = replaceOnce(out, R_STEER, R_STEER_EXCLUSIVE, "runReplyAgent steer/followup decision");
  return out;
}

/** Patched dispatch-from-config-DOJq_7CI.js, from the exact bytes V runs. */
export function patchDispatchFromConfig(source) {
  refuseTwice(source, FILES.dispatchFromConfig);
  let out = replaceOnce(source, D_OPERATION_START, D_HELPERS, "prepareDispatchOperation start");
  out = replaceOnce(out, D_RESET_ADMISSION, D_RESET_ADMISSION_LITERAL, "dispatch reset admission");
  out = replaceOnce(out, D_EXPLICIT_COMMAND, D_EXPLICIT_COMMAND_LITERAL, "explicit command turn");
  out = replaceOnce(out, D_FAST_ABORT, D_FAST_ABORT_LITERAL, "fast abort");
  out = replaceOnce(out, D_FAST_APPROVE, D_FAST_APPROVE_LITERAL, "fast approve");
  out = replaceOnce(out, D_PRE_DISPATCH_BUSY, D_PRE_DISPATCH_BUSY_EXCLUSIVE, "pre-dispatch busy exit");
  out = replaceOnce(out, D_DISPATCH_BUSY, D_DISPATCH_BUSY_EXCLUSIVE, "dispatch busy exit");
  return out;
}

export const PATCHERS = Object.freeze({
  [FILES.getReply]: patchGetReply,
  [FILES.agentRunnerRuntime]: patchAgentRunnerRuntime,
  [FILES.dispatchFromConfig]: patchDispatchFromConfig,
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
