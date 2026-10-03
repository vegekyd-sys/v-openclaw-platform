import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
export const MARKER = "v-feishu-ask-user-v4";
const inline = (name) => readFileSync(new URL(name, import.meta.url), "utf8").replace(/^export /gm, "");
export function patchFeishuAskUser(source) {
  if (source.includes(`// ${MARKER}\n`)) return source;
  return installChatAnswers(patchV3(source));
}
function patchV3(source) {
  if (source.includes("// v-feishu-ask-user-v3\n")) return source;
  if (!source.includes("v-feishu-secret-entry-runtime-v2")) throw new Error("Requires runtime-agnostic question lifecycle v2");
  if (/\/\/ v-feishu-ask-user-v[12]\n/.test(source)) throw new Error("Rebuild v3 from the unpatched runtime baseline");
  const sites = [
    ['const resetStreamingState = () => {', `const vAskUnregister = vFeishuAsk.bindStream(params.sessionKey, accountId, async (card) => {
      if (!previewStreamingEnabled) return;
      startStreaming();
      if (streamingStartPromise) await streamingStartPromise;
      await partialUpdateQueue;
      const session = streaming;
      if (!session?.isActive()) return;
      statusLine = "";
      await session.update(buildCombinedStreamText(reasoningText, streamText) || "\\u200b");
      await session.flushPendingUpdate();
      const result = await session.vAskUpdate(card);
      markVisibleReplySent();
      return result;
    }, () => previewStreamingEnabled && !idleRequestedForReply && Boolean(replyLifecycleStateInitialized || streaming?.isActive() || streamingStartPromise));
    const resetStreamingState = () => {`],
    ['typingCallbacks?.onCleanup?.();', 'vAskUnregister();\n\t\t\ttypingCallbacks?.onCleanup?.();'],
    ['const payload = vSecretEntryPayloadFromQuestion(record);', `void vFeishuAsk.requested(record, params).catch(() => params.log?.("feishu: ask_user delivery cancellation failed"));\n\t\tconst payload = vSecretEntryPayloadFromQuestion(record);`],
    ['deliver: async (inputPayload, info) => {', `deliver: async (inputPayload, info) => {
        const vAskResult = await vFeishuAsk.payload(inputPayload, { cfg, to: sendTarget, replyToMessageId: sendReplyToMessageId, replyInThread: effectiveReplyInThread, allowTopLevelReplyFallback, accountId });
        if (vAskResult) {
          if (vAskResult.messageId) markVisibleReplySent();
          return createFeishuReplyDeliveryResult({ results: vAskResult.messageId ? [vAskResult] : [], visibleReplySent: Boolean(vAskResult.messageId), content: "", kind: "card" });
        }`],
    ['"card.action.trigger": async (data) => {', `"card.action.trigger": async (data) => {
      const vAskSubmission = await vFeishuAsk.submit(data, { cfg, accountId });
      if (vAskSubmission) return vAskSubmission;`],
  ];
  for (const [from] of sites) if (source.split(from).length !== 2) throw new Error(`Expected exactly one anchor: ${from}`);
  for (const [from, to] of sites) source = source.replace(from, () => to);
  const glue = `
async function vAskCardKitWrite(session, state, suffix, payload) {
  const apiBase = resolveApiBase(session.creds.domain);
  state.sequence += 1;
  const { response, release } = await fetchWithSsrFGuard({
    url: apiBase + "/cardkit/v1/cards/" + state.cardId + suffix,
    init: { method: "PUT", headers: {
      Authorization: "Bearer " + await getToken(session.creds, { fetchImpl: session.fetchImpl, lookupFn: session.lookupFn }),
      "Content-Type": "application/json", "User-Agent": getFeishuUserAgent()
    }, body: JSON.stringify({ ...payload, sequence: state.sequence,
      uuid: "ask_" + state.cardId + "_" + state.sequence }) },
    fetchImpl: session.fetchImpl, lookupFn: session.lookupFn,
    policy: { allowedHostnames: resolveAllowedHostnames(session.creds.domain) },
    auditContext: "feishu.ask-user.inline", timeoutMs: session.creds.httpTimeoutMs ?? 30000
  });
  try { await assertSuccessfulCardKitResponse(response, "feishu.ask-user.inline", "Update inline question"); }
  finally { await release(); }
}
installFeishuAskStream(FeishuStreamingSession,
  (session, state, card) => vAskCardKitWrite(session, state, "", { card: { type: "card_json", data: JSON.stringify(card) } }),
  (session, state, note) => vAskCardKitWrite(session, state, "/elements/note", { element: JSON.stringify({ tag: "markdown", element_id: "note", content: "<font color='grey'>" + note + "</font>" }) })
);
const vFeishuAsk = createFeishuAskRuntime({
  send: sendCardFeishu,
  patch: vSecretEntryPatchCard,
  route: vSecretEntryRouteFromQuestion,
  register: (params) => vSecretEntryQuestionRuntime.registerChannelDelivery(params),
  call: (method, cfg, params) => vSecretEntryCallGateway(method, { config: cfg }, params, { scopes: ["operator.questions"], progress: false, timeoutMs: 2000 })
});
`;
  return `// v-feishu-ask-user-v3\n${inline("card.mjs")}\n${inline("runtime.mjs")}\n${inline("stream.mjs")}\n${source}\n${glue}`;
}
function installChatAnswers(source) {
  const replaceOne = (from, to) => {
    if (source.split(from).length !== 2) throw new Error(`Expected exactly one chat-answer anchor: ${from}`);
    source = source.replace(from, () => to);
  };
  const cardStart = "// Inlined into the Feishu monitor. Keep this module dependency-free.";
  const runtimeStart = "// Dependency injection keeps the exact inlined lifecycle testable without a live bot.";
  const streamStart = "// Keep the same CardKit entity/message. Normal stream writes keep targeting";
  for (const anchor of [cardStart, runtimeStart, streamStart]) if (source.split(anchor).length !== 2) throw new Error(`Expected one module boundary: ${anchor}`);
  const start = source.indexOf(cardStart), end = source.indexOf(streamStart);
  if (start >= end) throw new Error("Invalid Ask User module boundaries");
  source = source.slice(0, start) + inline("card.mjs") + "\n" + inline("chat.mjs") + "\n" + inline("runtime.mjs") + "\n" + source.slice(end);
  replaceOne("// v-feishu-ask-user-v3\n", `// ${MARKER}\n`);
  replaceOne(
    '}, () => previewStreamingEnabled && !idleRequestedForReply && Boolean(replyLifecycleStateInitialized || streaming?.isActive() || streamingStartPromise));',
    `}, () => previewStreamingEnabled && !idleRequestedForReply && Boolean(replyLifecycleStateInitialized || streaming?.isActive() || streamingStartPromise), {
      chatId: params.chatId, senderOpenId: params.askUserSenderOpenId,
      isActive: () => !idleRequestedForReply && Boolean(replyLifecycleStateInitialized || streaming?.isActive() || streamingStartPromise)
    });`
  );
  for (const indent of ["\t\t\t\t", "\t\t\t\t\t\t\t\t"]) replaceOne(`runtime,\n${indent}chatId: ctx.chatId,`, `runtime,\n${indent}chatId: ctx.chatId,\n${indent}askUserSenderOpenId: ctx.senderOpenId,`);
  replaceOne("if (!turnAdoptionLifecycle && !await finalizeFeishuMessageProcessing({", "if (!params.askUserAnswerOnly && !turnAdoptionLifecycle && !await finalizeFeishuMessageProcessing({");
  replaceOne("if (feishuCfg?.resolveSenderNames ?? true) {", "if (!params.askUserAnswerOnly && (feishuCfg?.resolveSenderNames ?? true)) {");
  replaceOne("\t\t\tsenderUserId,\n\t\t\trequireMention,\n\t\t\tmentionedBot: ctx.mentionedBot", "\t\t\tsenderUserId,\n\t\t\trequireMention,\n\t\t\tmentionedBot: ctx.mentionedBot || params.askUserAnswerOnly === true");
  replaceOne('const preview = truncateUtf16Safe(ctx.content.replace(/\\s+/g, " "), 160);', `if (params.askUserAnswerOnly) {
      const outcome = await vFeishuAsk.answerFromChat({
        id: params.askUserQuestionId, sessionKey: route.sessionKey,
        chatId: ctx.chatId, senderOpenId: ctx.senderOpenId, messageId: ctx.messageId,
        parentId: ctx.parentId, timestamp: messageCreateTimeMs, text: commandProbeBody
      }, { cfg: effectiveCfg, accountId: account.accountId, log });
      if (outcome.handled && outcome.notice) await sendMessageFeishu({
        cfg: effectiveCfg, to: feishuReplyTarget, accountId: account.accountId,
        replyToMessageId: ctx.messageId, replyInThread, text: outcome.notice
      }).catch(() => log("feishu: question answer notice failed"));
      return outcome.handled;
    }
    const preview = truncateUtf16Safe(ctx.content.replace(/\\s+/g, " "), 160);`);
  replaceOne("if (turnAdoptionLifecycle) throw err;", "if (turnAdoptionLifecycle || params.askUserAnswerOnly) throw err;");
  replaceOne("fireAndForget, handleMessage, resolveDebounceText: resolveText,", "fireAndForget, handleMessage, tryQuestionAnswer, resolveDebounceText: resolveText,");
  replaceOne("\t\t\thandleMessage: handleFeishuMessage,\n\t\t\tresolveDebounceText:", "\t\t\thandleMessage: handleFeishuMessage,\n\t\t\ttryQuestionAnswer: vAskTryChatAnswer,\n\t\t\tresolveDebounceText:");
  replaceOne("const processMessage = async () => {\n\t\t\tawait inboundDebouncer.enqueue(debounceEntry);", `const processMessage = async () => {
      if (tryQuestionAnswer && !turnAdoptionLifecycle?.abortSignal.aborted && await tryQuestionAnswer({
        cfg, event, botOpenId: getBotOpenId(accountId), botName: getBotName(accountId),
        runtime, channelRuntime, chatHistories, accountId,
        processingClaim: debounceEntry.processingClaim, turnAdoptionLifecycle
      })) {
        if (claim.kind === "claimed") await claim.handle.commit();
        await completeSuppressedIngress();
        return;
      }
\t\t\tawait inboundDebouncer.enqueue(debounceEntry);`);
  return source + `\nconst vAskTryChatAnswer = createFeishuAskChatIngress({
    questionRuntime: vFeishuAsk, parse: parseFeishuMessageEvent, handleMessage: handleFeishuMessage
  });\n`;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , input, output] = process.argv;
  if (!input || !output || input === output) throw new Error("Usage: node patch.mjs INPUT OUTPUT (separate candidate file)");
  writeFileSync(output, patchFeishuAskUser(readFileSync(input, "utf8")));
}
