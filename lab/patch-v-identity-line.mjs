import assert from 'node:assert/strict';

// System prompts open as V, not as OpenClaw's generic assistant (Tianyi 2026-11-28).
//
// 2026.9.1 opens every PI and CLI system prompt (full, minimal and none modes)
// with "You are a personal assistant running inside OpenClaw." V is the product
// the model speaks as; OpenClaw is the runtime under it (docs/v-de-openclaw-review.md,
// item S1). The same sentence is also the one Google's account endpoint rejects
// with a fake 429 RESOURCE_EXHAUSTED, which blocks /neon
// (docs/gemini-neon-account-bridge-20261119.md).
//
// A plugin text transform (registerTextTransforms) is the lighter mechanism, but
// it reads the process-wide active plugin registry, which vlab-worker processes
// never install (they run on the prepared generation), so it reached the
// Gateway's turns and not the Worker's. Hence a core change.
//
// v-identity-line-v1 (source: vegekyd-sys/openclaw-versa
// versa/port-v-identity-line-20261128 52d03a420dd): both sites use one constant.

export const MARKER = 'v-identity-line-v1';
export const UPSTREAM_LINE = 'You are a personal assistant running inside OpenClaw.';
export const IDENTITY_LINE = "You are V, Tianyi's personal agent.";

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchSystemPromptParams(source) {
  if (source.includes(MARKER)) throw new Error(`${MARKER} already applied to system-prompt-params-B645JcX8.js`);
  let out = replaceExactlyOnce(source,
    'const MODEL_IDENTITY_PREFIX = "Current model identity:";\n',
    `const MODEL_IDENTITY_PREFIX = "Current model identity:";\n/** ${MARKER}: opening line of every agent system prompt; V is the product, OpenClaw the runtime. */\nconst AGENT_IDENTITY_LINE = ${JSON.stringify(IDENTITY_LINE)};\n`,
    'MODEL_IDENTITY_PREFIX');
  out = replaceExactlyOnce(out,
    `	if (promptMode === "none") return [${JSON.stringify(UPSTREAM_LINE)}, modelIdentityLine]`,
    '	if (promptMode === "none") return [AGENT_IDENTITY_LINE, modelIdentityLine]',
    'none-mode identity line');
  out = replaceExactlyOnce(out,
    `			${JSON.stringify(UPSTREAM_LINE)},\n`,
    '			AGENT_IDENTITY_LINE,\n',
    'stable-prefix identity line');
  assert(!out.includes(UPSTREAM_LINE), 'upstream identity line still present');
  return out;
}

export const FILES = [
  {
    name: 'system-prompt-params-B645JcX8.js',
    base: 'lab/release-files/v-identity-line/base',
    target: 'openclaw/dist',
    before: '24d196636e47b585231ef18de8a4dbbafa8701aefb06c04b70b3c114f3fa1ec9',
    patch: patchSystemPromptParams,
  },
];
