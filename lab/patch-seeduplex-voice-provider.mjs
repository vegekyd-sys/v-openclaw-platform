export const SEEDUPLEX_IMPORT =
  'import { buildSeeduplexRealtimeVoiceProvider } from "./seeduplex-realtime-provider.mjs";';
export const SEEDUPLEX_REGISTER =
  "    api.registerRealtimeVoiceProvider(buildSeeduplexRealtimeVoiceProvider());";

const IMPORT_ANCHOR = 'import { WorkerPool } from "./worker-pool.mjs";';
const REGISTER_ANCHOR = "  register(api) {";

function occurrences(source, value) {
  return source.split(value).length - 1;
}

export function patchProductionWorkerForSeeduplex(source) {
  const hasImport = occurrences(source, SEEDUPLEX_IMPORT);
  const hasRegister = occurrences(source, SEEDUPLEX_REGISTER);
  if (hasImport === 1 && hasRegister === 1) return source;
  if (hasImport || hasRegister) {
    throw new Error("Seeduplex provider is partially patched");
  }
  if (occurrences(source, IMPORT_ANCHOR) !== 1 || occurrences(source, REGISTER_ANCHOR) !== 1) {
    throw new Error("Seeduplex provider patch refuses runtime drift");
  }
  return source
    .replace(IMPORT_ANCHOR, `${SEEDUPLEX_IMPORT}\n${IMPORT_ANCHOR}`)
    .replace(REGISTER_ANCHOR, `${REGISTER_ANCHOR}\n${SEEDUPLEX_REGISTER}`);
}
