const IMPORT_ANCHOR =
  'import { resolveHarnessMessageChannel } from "./harness-channel.mjs";\n';
const ROUTING_IMPORT =
  'import { withWorkerHarnessModelSelection } from "./worker-harness-model-routing.mjs";\n';
const CALL_ANCHOR =
  "agentCommandOptions: buildForwardedHarnessOptions(params),";
const ROUTED_CALL =
  "agentCommandOptions: buildForwardedHarnessOptions(withWorkerHarnessModelSelection(params)),";

export function patchWorkerHarnessModelRouting(source) {
  const hasImport = source.includes(ROUTING_IMPORT);
  const hasCall = source.includes(ROUTED_CALL);
  if (hasImport || hasCall) {
    if (hasImport && hasCall && !source.includes(CALL_ANCHOR)) return source;
    throw new Error("worker model routing patch is only partially applied");
  }
  if (source.split(IMPORT_ANCHOR).length - 1 !== 1) {
    throw new Error("worker model routing patch refuses import-anchor drift");
  }
  if (source.split(CALL_ANCHOR).length - 1 !== 1) {
    throw new Error("worker model routing patch refuses call-anchor drift");
  }
  return source
    .replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}${ROUTING_IMPORT}`)
    .replace(CALL_ANCHOR, ROUTED_CALL);
}

export { ROUTING_IMPORT, ROUTED_CALL };
