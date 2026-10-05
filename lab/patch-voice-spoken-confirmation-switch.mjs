import assert from "node:assert/strict";

// Upstream Talk asks for a spoken "yes" before any tool call it classifies as
// mutating. For exec only cat/grep/head/ls/pwd/rg/stat/tail/wc count as read
// only, so every `lark-cli` lookup in a call was refused. Before the GPT Live
// release that gate never fired on V: consult runs execute in vlab-worker,
// whose process has no voice-run binding. GPT Live moved voice exec back to
// the Gateway, where the binding exists, and the gate started refusing.
// V keeps text and voice on the same tool authority (its own red lines and
// approvals), so the gate is off unless OPENCLAW_VOICE_SPOKEN_CONFIRMATION=1.
export const VOICE_SPOKEN_CONFIRMATION_SWITCH_MARKER =
  "// v-voice-spoken-confirmation-switch-v1: off unless OPENCLAW_VOICE_SPOKEN_CONFIRMATION=1";

export function patchVoiceSpokenConfirmationSwitch(source) {
  if (source.includes(VOICE_SPOKEN_CONFIRMATION_SWITCH_MARKER)) return source;
  const before = "function resolveClientVoiceToolConfirmationPolicy(params, consume) {\n" +
    "\tif (!params.agentId || !params.voiceSessionId) return { allowed: true };\n";
  assert.equal(source.split(before).length - 1, 1, "voice spoken confirmation policy anchor drifted");
  const after = before +
    "\tif (process.env.OPENCLAW_VOICE_SPOKEN_CONFIRMATION !== \"1\") return { allowed: true };\n";
  return `${VOICE_SPOKEN_CONFIRMATION_SWITCH_MARKER}\n${source.replace(before, after)}`;
}
