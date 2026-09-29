import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
export const MARKER = "v-feishu-ask-user-v1";
const inline = (name) => readFileSync(new URL(name, import.meta.url), "utf8").replace(/^export /gm, "");
export function patchFeishuAskUser(source) {
  if (source.includes(`// ${MARKER}\n`)) return source;
  if (!source.includes("v-feishu-secret-entry-runtime-v2")) throw new Error("Requires runtime-agnostic question lifecycle v2");
  const sites = [
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
const vFeishuAsk = createFeishuAskRuntime({
  send: sendCardFeishu,
  patch: vSecretEntryPatchCard,
  route: vSecretEntryRouteFromQuestion,
  register: (params) => vSecretEntryQuestionRuntime.registerChannelDelivery(params),
  call: (method, cfg, params) => vSecretEntryCallGateway(method, { config: cfg }, params, { scopes: ["operator.questions"], progress: false, timeoutMs: 2000 })
});
`;
  return `// ${MARKER}\n${inline("card.mjs")}\n${inline("runtime.mjs")}\n${source}\n${glue}`;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , input, output] = process.argv;
  if (!input || !output || input === output) throw new Error("Usage: node patch.mjs INPUT OUTPUT (separate candidate file)");
  writeFileSync(output, patchFeishuAskUser(readFileSync(input, "utf8")));
}
