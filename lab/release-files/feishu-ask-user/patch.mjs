import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
export const MARKER = "v-feishu-ask-user-v2";
const inline = (name) => readFileSync(new URL(name, import.meta.url), "utf8").replace(/^export /gm, "");
export function patchFeishuAskUser(source) {
  if (source.includes(`// ${MARKER}\n`)) return source;
  if (!source.includes("v-feishu-secret-entry-runtime-v2")) throw new Error("Requires runtime-agnostic question lifecycle v2");
  if (source.includes("// v-feishu-ask-user-v1\n")) throw new Error("Rebuild v2 from the unpatched runtime baseline");
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
    });
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
  return `// ${MARKER}\n${inline("card.mjs")}\n${inline("runtime.mjs")}\n${inline("stream.mjs")}\n${source}\n${glue}`;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , input, output] = process.argv;
  if (!input || !output || input === output) throw new Error("Usage: node patch.mjs INPUT OUTPUT (separate candidate file)");
  writeFileSync(output, patchFeishuAskUser(readFileSync(input, "utf8")));
}
