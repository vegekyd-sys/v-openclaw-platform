export const VOLC_RTC_AGENT_IMPORT =
  'import { buildVolcengineRtcAgentProvider } from "./volcengine-rtc-agent-provider.mjs";';
export const VOLC_RTC_AGENT_REGISTER =
  "    api.registerRealtimeVoiceProvider(buildVolcengineRtcAgentProvider());";

const IMPORT_ANCHOR = 'import { WorkerPool } from "./worker-pool.mjs";';
const REGISTER_ANCHOR = "  register(api) {";

function occurrences(source, value) {
  return source.split(value).length - 1;
}

export function patchProductionWorkerForVolcengineRtcAgent(source) {
  const hasImport = occurrences(source, VOLC_RTC_AGENT_IMPORT);
  const hasRegister = occurrences(source, VOLC_RTC_AGENT_REGISTER);
  if (hasImport === 1 && hasRegister === 1) return source;
  if (hasImport || hasRegister) {
    throw new Error("VolcEngine RTC Agent provider is partially patched");
  }
  if (occurrences(source, IMPORT_ANCHOR) !== 1 || occurrences(source, REGISTER_ANCHOR) !== 1) {
    throw new Error("VolcEngine RTC Agent provider patch refuses runtime drift");
  }
  return source
    .replace(IMPORT_ANCHOR, `${VOLC_RTC_AGENT_IMPORT}\n${IMPORT_ANCHOR}`)
    .replace(REGISTER_ANCHOR, `${REGISTER_ANCHOR}\n${VOLC_RTC_AGENT_REGISTER}`);
}
