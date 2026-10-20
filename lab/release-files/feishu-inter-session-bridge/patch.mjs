// Feishu inbound bridge for cross-session collaboration (docs/inter-session/design.md §3.6, WP4).
//
// sessions_send hands a request to the v-session-relay plugin in the Gateway; for a Feishu
// target the plugin uses this bridge:
//   post()  posts the visible "📨 来自…的请求 #code" line (plain text, im.message uuid = idempotent);
//   start() feeds a synthetic inbound message for the target session through this account's
//           per-chat queue into handleFeishuMessage, so the target answers in its own chat with
//           the card, progress stream, checklist, background line, footer, ask_user and media a
//           person's message gets. It reports started (at onAgentRunStart), busy (the core
//           admission guard's onBusy: nothing at all is posted) or rejected, and `done` carries
//           the run's final texts and media.
// Changes to the monitor (V's bytes, every existing V marker kept):
//   - the bridge module (feishu-inter-session-bridge.inline.js), registered as "feishu:<accountId>"
//     in globalThis[Symbol.for("openclaw.v.interSessionInboundBridges")] after the event handlers
//     and unregistered in monitorSingleAccount's finally;
//   - createFeishuMessageReceiveHandler: a dispatch entry that enqueues on the chat's base lane
//     (never ":active-run", ":control" or ":btw");
//   - handleFeishuMessage `interSession` branch: sender name from the request, no pairing reply,
//     no broadcast, no dynamic agent, route asserted against the target key (ROUTE_MISMATCH),
//     no pending group history in the prompt and none cleared, no command authority, provenance
//     and prompt context through `extra`, ask_user answerer, preset runId + vInterSession in
//     replyOptions, BUSY returns before the no-visible-reply fallback (releasing the attempt's ask_user
//     stream, which the core never cleans up for a turn that did not start), firsttext origin/attempt,
//     errors rethrown for RESTART_WEDGE, result returned;
//   - createFeishuReplyDispatcher: no typing reaction, reply start (card precreate / streaming,
//     progress subscription, ask_user activity) deferred to onAgentRunStart, finals captured;
//   - the background line names sessions_send tasks "会话请求".
// Every anchor must occur exactly once; a marked or changed file is refused.
import fs from "node:fs";

export const MARKER = "v-feishu-inter-session-bridge-v1";
export const FILE = "monitor.account-WFdlCDhR.js";
/** The bytes V runs (captured 2026-10-20, verified on V 17:25 CST; tests/fixtures/inter-session-v-bytes.json). */
export const SOURCE = new URL(`../../../release/captured/v2026.9.1-db91.6-subagent-index-20261020.feishu/dist/dist/${FILE}`, import.meta.url);
export const GENERATED = new URL(`./generated/${FILE}`, import.meta.url);
export const INLINE = new URL("./feishu-inter-session-bridge.inline.js", import.meta.url);

/** Literals the monitor carries, mirrored from apps/v-session-relay/plugin/core/contracts.js (tests compare). */
export const CONTRACT_LITERALS = Object.freeze({
  bridgesSymbolKey: "openclaw.v.interSessionInboundBridges",
  caps: Object.freeze({ streaming: true, replyAnchor: true, idempotentPost: true, editPost: true, maxVisibleChars: 1500, askUser: true, media: true }),
  kinds: Object.freeze(["request", "ask", "wake", "collect"]),
  busyReasons: Object.freeze(["active_run", "pending_queue", "recovery_owner"]),
  restartWedgeSource: "restart recovery claim changed",
  idPrefix: "v-a2a-",
  sidPrefix: "v-a2a:",
  startRejectCodes: Object.freeze(["ROUTE_MISMATCH", "GATED", "CHANNEL_DOWN", "RESTART_WEDGE", "INTERNAL"]),
  routeErrorCodes: Object.freeze(["NO_ROUTE", "CHAT_GONE", "NOT_MEMBER"]),
  bridgeErrorCodes: Object.freeze(["POST_FAILED", "CHAT_GONE", "NOT_MEMBER", "CHANNEL_DOWN"]),
  sessionRequestKind: "会话请求",
});

const L = (indent, text) => `${"\t".repeat(indent)}${text}\n`;

/** The bridge module, checked to be inline-safe. */
export function inlineBridgeModule(source = fs.readFileSync(INLINE, "utf8")) {
  if (/^\s*(import|export)\s/mu.test(source)) throw new Error("feishu-inter-session-bridge.inline.js must stay free of imports/exports");
  if (source.includes(MARKER)) throw new Error("the inline module must not carry the marker (the patcher adds it once)");
  return source;
}

/** [name, anchor, replacement] in application order. Each anchor occurs exactly once in V's bytes. */
export function buildEdits(inline = inlineBridgeModule()) {
  return [
    // ---------------------------------------------------------------- createFeishuReplyDispatcher
    ["dispatcher: no typing reaction for an inter-session turn",
      L(2, "typing: {") + L(3, "start: async () => {") + L(4, "if (!(account.config.typingIndicator ?? true)) return;"),
      L(2, "typing: {") + L(3, "start: async () => {") + L(4, "if (params.vInterSession || !(account.config.typingIndicator ?? true)) return;")],
    ["dispatcher: run-start flag",
      L(1, "let replyLifecycleStateInitialized = false;"),
      L(1, "let replyLifecycleStateInitialized = false;") + L(1, "let vInterSessionRunStarted = false;")],
    ["dispatcher: visible output reaches the attempt",
      L(1, "const markVisibleReplySent = () => {") + L(2, "visibleReplySent = true;"),
      L(1, "const markVisibleReplySent = () => {") + L(2, "visibleReplySent = true;") + L(2, "params.vInterSession?.noteVisible();")],
    ["dispatcher: final texts and media captured (ask_user and secret-entry payloads returned earlier)",
      L(4, "const reply = resolveSendableOutboundReplyParts({") + L(5, "...payload,") + L(5, "text: payloadText") + L(4, "});"),
      L(4, "const reply = resolveSendableOutboundReplyParts({") + L(5, "...payload,") + L(5, "text: payloadText") + L(4, "});")
        + L(4, 'if (info?.kind === "final") params.vInterSession?.captureFinal(payload, reply);')],
    ["dispatcher: reply start waits for the run (a BUSY attempt never creates a card)",
      L(2, "onReplyStart: async () => {") + L(3, "if (!replyLifecycleStateInitialized) {"),
      L(2, "onReplyStart: async () => {") + L(3, "if (params.vInterSession && !vInterSessionRunStarted) return;") + L(3, "if (!replyLifecycleStateInitialized) {")],
    ["dispatcher: onAgentRunStart starts the deferred reply",
      L(4, 'if (typeof runId === "string" && vFirsttextE2e.runId === void 0) vFirsttextE2e.runId = runId;') + L(4, 'vFirsttextMark("runStartAtMs");') + L(3, "},"),
      L(4, 'if (typeof runId === "string" && vFirsttextE2e.runId === void 0) vFirsttextE2e.runId = runId;') + L(4, 'vFirsttextMark("runStartAtMs");')
        + L(4, "if (params.vInterSession && !vInterSessionRunStarted) {")
        + L(5, "vInterSessionRunStarted = true;")
        + L(5, "Promise.resolve(dispatcherOptions.onReplyStart()).catch((error) => params.runtime.error?.(`feishu[${account.accountId}] inter-session reply start failed: ${String(error)}`));")
        + L(4, "}")
        + L(3, "},")],
    // ---------------------------------------------------------------- handleFeishuMessage
    ["handler: interSession parameter",
      L(1, "const { cfg, event, botOpenId, botName, runtime, channelRuntime, chatHistories, accountId, processingClaim, messageDedupeKey: messageDedupeKeyOverride, turnAdoptionLifecycle } = params;"),
      L(1, "const { cfg, event, botOpenId, botName, runtime, channelRuntime, chatHistories, accountId, processingClaim, messageDedupeKey: messageDedupeKeyOverride, turnAdoptionLifecycle, interSession } = params;")],
    ["handler: sender name is the requesting session's label, no contact lookup",
      L(1, "let permissionErrorForAgent;") + L(1, "if (!params.askUserAnswerOnly && (feishuCfg?.resolveSenderNames ?? true)) {"),
      L(1, "let permissionErrorForAgent;") + L(1, "if (interSession) ctx = {") + L(2, "...ctx,") + L(2, "senderName: interSession.sender.name") + L(1, "};")
        + L(1, "else if (!params.askUserAnswerOnly && (feishuCfg?.resolveSenderNames ?? true)) {")],
    ["handler: an inter-session request is never broadcast",
      L(1, "const rawBroadcastAgents = isGroup ? resolveBroadcastAgents(cfg, ctx.chatId) : null;"),
      L(1, "const rawBroadcastAgents = isGroup && !interSession ? resolveBroadcastAgents(cfg, ctx.chatId) : null;")],
    ["handler: no pairing reply for a refused inter-session sender",
      L(2, "const rejectDirectAuthorization = async (authorization) => {"),
      L(2, "const rejectDirectAuthorization = async (authorization) => {")
        + L(3, "if (interSession) {")
        + L(4, "log(`feishu[${account.accountId}]: inter-session request ${interSession.id} not admitted for ${ctx.senderOpenId} (dmPolicy=${authorization.dmPolicy}); no pairing reply`);")
        + L(4, "return;")
        + L(3, "}")],
    ["handler: an inter-session request never creates a dynamic agent",
      L(2, 'if (!isGroup && route.matchedBy === "default") {'),
      L(2, 'if (!isGroup && route.matchedBy === "default" && !interSession) {')],
    ["handler: the route must be the target session (ROUTE_MISMATCH otherwise)",
      L(2, "if (configuredBinding) {") + L(3, "const ensured = await ensureConfiguredBindingRouteReady({"),
      L(2, 'if (interSession && String(route.sessionKey ?? "").toLowerCase() !== String(interSession.sessionKey).toLowerCase()) {')
        + L(3, "log(`feishu[${account.accountId}]: inter-session request ${interSession.id} routed to ${route.sessionKey}, not ${interSession.sessionKey}; rejected`);")
        + L(3, 'interSession.reject("ROUTE_MISMATCH", `Feishu routes this chat to ${route.sessionKey}, not ${interSession.sessionKey}`);')
        + L(3, "return;")
        + L(2, "}")
        + L(2, "if (configuredBinding) {") + L(3, "const ensured = await ensureConfiguredBindingRouteReady({")],
    ["handler: the group's pending chatter stays out of the request prompt",
      L(2, "if (isGroup && historyKey && chatHistories) combinedBody = createChannelHistoryWindow({ historyMap: chatHistories }).buildPendingContext({"),
      L(2, "if (isGroup && historyKey && chatHistories && !interSession) combinedBody = createChannelHistoryWindow({ historyMap: chatHistories }).buildPendingContext({")],
    ["handler: no command authority, commands never parsed",
      "\t\tconst commandAuthorized = (audioTranscript === void 0 ? ",
      "\t\tconst commandAuthorized = interSession ? false : (audioTranscript === void 0 ? "],
    ["handler: provenance, prompt context, sender and MessageSid through extra",
      L(5, "commands: { authorized: commandAuthorized === true }") + L(4, "},") + L(4, "extra: {") + L(5, "RootMessageId: ctx.rootId,") + L(5, "Transcript: audioTranscript,")
        + L(5, "GroupSubject: isGroup ? groupName || ctx.chatId : void 0") + L(4, "}"),
      L(5, "commands: { authorized: !interSession && commandAuthorized === true }") + L(4, "},") + L(4, "extra: {") + L(5, "RootMessageId: ctx.rootId,") + L(5, "Transcript: audioTranscript,")
        + L(5, "GroupSubject: isGroup ? groupName || ctx.chatId : void 0,") + L(5, "...interSession ? interSession.ctxExtra() : {}") + L(4, "}")],
    ["handler: dispatcher gets the attempt and the ask_user answerer",
      L(3, "const { dispatcherOptions, delivery, replyOptions, ensureNoVisibleReplyFallback, getFirsttextE2e } = createFeishuReplyDispatcher({")
        + L(4, "cfg: effectiveCfg,") + L(4, "agentId: route.agentId,") + L(4, "runtime,") + L(4, "chatId: ctx.chatId,") + L(4, "askUserSenderOpenId: ctx.senderOpenId,"),
      L(3, "const { dispatcherOptions, delivery, replyOptions, ensureNoVisibleReplyFallback, getFirsttextE2e, getVisibleReplyState } = createFeishuReplyDispatcher({")
        + L(4, "cfg: effectiveCfg,") + L(4, "agentId: route.agentId,") + L(4, "runtime,") + L(4, "chatId: ctx.chatId,")
        + L(4, "askUserSenderOpenId: interSession ? interSession.askUserAnswererId : ctx.senderOpenId,") + L(4, "vInterSession: interSession,")],
    ["handler: preset runId, vInterSession and run callbacks in replyOptions; group history untouched",
      L(6, "history: {") + L(7, "isGroup,") + L(7, "historyKey,") + L(7, "historyMap: chatHistories,") + L(7, "limit: historyLimit") + L(6, "},")
        + L(6, "dispatcherOptions,") + L(6, "delivery,") + L(6, "replyOptions: {") + L(7, "...replyOptions,")
        + L(7, "// Keep active Reply Operation admission available for Steer.") + L(7, "queuedFollowupLifecycle: replyOptions.queuedFollowupLifecycle ?? {},")
        + L(7, "...turnAdoptionLifecycle ? bindIngressLifecycleToReplyOptions(turnAdoptionLifecycle) : {}") + L(6, "}"),
      L(6, "history: {") + L(7, "isGroup: isGroup && !interSession,") + L(7, "historyKey,") + L(7, "historyMap: chatHistories,") + L(7, "limit: historyLimit") + L(6, "},")
        + L(6, "dispatcherOptions,") + L(6, "delivery,") + L(6, "replyOptions: {") + L(7, "...replyOptions,")
        + L(7, "// Keep active Reply Operation admission available for Steer.") + L(7, "queuedFollowupLifecycle: replyOptions.queuedFollowupLifecycle ?? {},")
        + L(7, "...turnAdoptionLifecycle ? bindIngressLifecycleToReplyOptions(turnAdoptionLifecycle) : {},")
        + L(7, "...interSession ? interSession.replyOptions(replyOptions) : {}") + L(6, "}")],
    ["handler: BUSY ends silently, firsttext origin/attempt, result returned, errors rethrown",
      L(3, "const { queuedFinal, counts } = dispatchResult;")
        + L(3, 'if (dispatchResult.deferredToActiveRun !== "steer" && shouldSendNoVisibleReplyFallback(dispatchResult)) await ensureNoVisibleReplyFallback("dispatch-complete-no-visible-reply");')
        + L(3, "log(`feishu[${account.accountId}]: dispatch complete (queuedFinal=${queuedFinal}, replies=${counts.final})`);")
        + L(3, "try {")
        + L(4, 'log("[firsttext-e2e.1] " + JSON.stringify({ ...getFirsttextE2e(), receivedAtMs: vFirsttextReceivedAtMs, endAtMs: Date.now(), queuedFinal, finalCount: counts.final }));')
        + L(3, "} catch {}")
        + L(2, "}")
        + L(1, "} catch (err) {")
        + L(2, "error(`feishu[${account.accountId}]: failed to dispatch message: ${String(err)}`);")
        + L(2, "if (turnAdoptionLifecycle || params.askUserAnswerOnly) throw err;"),
      L(3, "const { queuedFinal, counts } = dispatchResult;")
        // BUSY: the core never started typing, so it never runs the dispatcher's cleanup; release its
        // ask_user stream binding here (otherwise every BUSY retry leaves one registered for good).
        + L(3, "if (interSession?.busy) {")
        + L(4, "dispatcherOptions.onCleanup?.();")
        + L(4, "return interSession.complete({ dispatchResult });")
        + L(3, "}")
        + L(3, 'if (dispatchResult.deferredToActiveRun !== "steer" && shouldSendNoVisibleReplyFallback(dispatchResult)) await ensureNoVisibleReplyFallback("dispatch-complete-no-visible-reply");')
        + L(3, "log(`feishu[${account.accountId}]: dispatch complete (queuedFinal=${queuedFinal}, replies=${counts.final})`);")
        + L(3, "try {")
        + L(4, 'log("[firsttext-e2e.1] " + JSON.stringify({ ...getFirsttextE2e(), receivedAtMs: interSession ? interSession.attemptStartedAtMs : vFirsttextReceivedAtMs, endAtMs: Date.now(), queuedFinal, finalCount: counts.final, ...interSession ? { origin: "inter_session", attempt: interSession.attempt } : {} }));')
        + L(3, "} catch {}")
        + L(3, "if (interSession) return interSession.complete({")
        + L(4, "dispatchResult,")
        + L(4, "visibleReplySent: getVisibleReplyState().visibleReplySent")
        + L(3, "});")
        + L(2, "}")
        + L(1, "} catch (err) {")
        + L(2, "error(`feishu[${account.accountId}]: failed to dispatch message: ${String(err)}`);")
        + L(2, "if (turnAdoptionLifecycle || params.askUserAnswerOnly || interSession) throw err;")],
    // ---------------------------------------------------------------- createFeishuMessageReceiveHandler
    ["receive handler: dispatch entry on the chat's base lane",
      L(1, "const enqueue = createSequentialQueue({ onTaskTimeout: (key, timeoutMs) => {")
        + L(2, "log(`feishu[${accountId}]: per-chat task exceeded ${timeoutMs}ms cap (key=${key}); evicting from queue so later same-key messages can proceed (#70133)`);")
        + L(1, "} });"),
      L(1, "const enqueue = createSequentialQueue({ onTaskTimeout: (key, timeoutMs) => {")
        + L(2, "log(`feishu[${accountId}]: per-chat task exceeded ${timeoutMs}ms cap (key=${key}); evicting from queue so later same-key messages can proceed (#70133)`);")
        + L(1, "} });")
        + L(1, "// Inter-session requests queue behind the chat's earlier messages on its base lane, never the steer, control or btw lanes.")
        + L(1, "// Each attempt is deduplicated by its own synthetic message id, not by the text-retry key (same sender, chat and text).")
        + L(1, "vFeishuInterSessionDispatch.set(accountId, (event, interSession) => enqueue(`feishu:${accountId}:${event.message.chat_id?.trim() || \"unknown\"}`, () => interSession.runHandler(() => handleMessage({")
        + L(2, "cfg,") + L(2, "event,") + L(2, "botOpenId: getBotOpenId(accountId),") + L(2, "botName: getBotName(accountId),") + L(2, "runtime,") + L(2, "channelRuntime,")
        + L(2, "chatHistories,") + L(2, "accountId,") + L(2, "messageDedupeKey: event.message.message_id,") + L(2, "interSession")
        + L(1, "}))));")],
    // ---------------------------------------------------------------- bridge module + monitorSingleAccount
    ["bridge module",
      "async function monitorSingleAccount(params) {\n",
      `// ${MARKER}\n${inline}async function monitorSingleAccount(params) {\n`],
    ["monitor: bridge registration slot",
      L(1, "let threadBindingManager;") + L(1, "try {") + L(2, "const eventDispatcher = createEventDispatcher(account);"),
      L(1, "let threadBindingManager;") + L(1, "let vInterSessionBridge;") + L(1, "try {") + L(2, "const eventDispatcher = createEventDispatcher(account);")],
    ["monitor: register the bridge once the message handler exists",
      L(3, "...params.statusSink ? { statusSink: params.statusSink } : {}") + L(2, "});") + L(2, "try {") + L(3, "durableIngress?.start();"),
      L(3, "...params.statusSink ? { statusSink: params.statusSink } : {}") + L(2, "});")
        + L(2, "vInterSessionBridge = vFeishuInterSessionRegisterBridge({") + L(3, "account,") + L(3, "accountId,") + L(3, "runtime,")
        + L(3, "dispatch: vFeishuInterSessionDispatch.get(accountId)") + L(2, "});")
        + L(2, "try {") + L(3, "durableIngress?.start();")],
    ["monitor: unregister the bridge when the account stops",
      L(1, "} finally {") + L(2, "vSecretEntryUnsubscribe();") + L(2, "threadBindingManager?.stop();") + L(1, "}"),
      L(1, "} finally {") + L(2, "vSecretEntryUnsubscribe();") + L(2, "threadBindingManager?.stop();") + L(2, "vFeishuInterSessionUnregisterBridge(vInterSessionBridge);") + L(1, "}")],
    // ---------------------------------------------------------------- background line (v-feishu-task-status-v1)
    ["background line: kind order",
      'const V_TASK_STATUS_KIND_ORDER = ["子 agent", "后台命令", "生图", "生成视频", "生成音乐", "自动化", "后台任务"];\n',
      'const V_TASK_STATUS_KIND_ORDER = ["子 agent", "会话请求", "后台命令", "生图", "生成视频", "生成音乐", "自动化", "后台任务"];\n'],
    ["background line: sessions_send tasks are 会话请求",
      '  if (runtime === "subagent" || runtime === "acp") return "子 agent";\n',
      '  if (runtime === "subagent" || runtime === "acp") return "子 agent";\n  if (kind === "sessions_send") return "会话请求";\n'],
  ];
}

function countOf(haystack, needle) {
  let count = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) count += 1;
  return count;
}

/** Applies every edit to the monitor; throws on a marked file or an anchor that is missing or not unique. */
export function patchFeishuInterSessionBridge(source, { inline } = {}) {
  if (typeof source !== "string") throw new TypeError("source must be a string");
  if (source.includes(MARKER)) throw new Error(`${FILE}: already patched (${MARKER})`);
  let out = source;
  for (const [name, anchor, replacement] of buildEdits(inline === undefined ? inlineBridgeModule() : inline)) {
    const n = countOf(out, anchor);
    if (n !== 1) throw new Error(`${FILE}: expected exactly one anchor for "${name}", found ${n}`);
    out = out.replace(anchor, () => replacement);
  }
  return out;
}

/** Regenerates generated/<FILE> from V's bytes (node patch.mjs). */
export function writeGenerated() {
  const out = patchFeishuInterSessionBridge(fs.readFileSync(SOURCE, "utf8"));
  fs.mkdirSync(new URL("./generated/", import.meta.url), { recursive: true });
  fs.writeFileSync(GENERATED, out);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeGenerated();
  console.log(`wrote ${GENERATED.pathname}`);
}
