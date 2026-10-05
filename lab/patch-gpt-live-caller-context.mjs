import assert from "node:assert/strict";

const marker = "// gpt-live-caller-context-v1";
export function patchGptLiveCallerContextTalk(source) {
  if (source.includes(marker)) return source;
  const replace = (before, after) => {
    assert.equal(source.split(before).length - 1, 1, `Expected one caller context anchor: ${before}`);
    source = source.replace(before, after);
  };
  replace('import { resolveGptLiveCallInstructions } from "./gpt-live-call-lifecycle.mjs";',
    'import { resolveGptLiveCallInstructions, resolveGptLiveCallerSurface } from "./gpt-live-call-lifecycle.mjs";');
  replace('brain: "agent-consult", capabilities: providerCapabilities\n',
    'brain: "agent-consult", capabilities: providerCapabilities,\n\t\t\t\tsessionKey: target.canonicalKey, configuredInstructions: realtimeConfig.instructions\n');
  replace('surface: params.surface ?? "a browser Talk session",',
    'surface: resolveGptLiveCallerSurface(params.surface ?? "a browser Talk session", canonicalKey),');
  return `${marker}\n${source}`;
}
