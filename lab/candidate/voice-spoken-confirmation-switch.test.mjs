// Candidate test for the voice spoken-confirmation switch, against the real
// runtime chunk: a transcript-capable client voice session with a bound consult
// run must be able to run `lark-cli` through exec. The same call with
// OPENCLAW_VOICE_SPOKEN_CONFIRMATION=1 must hit the upstream gate, which proves
// the test reaches the gate rather than passing because no binding exists.
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime environment is required");
const dist = path.join(runtime, "openclaw", "dist");
const chunk = "agent-tools.before-tool-call-g2OT63u5.js";
const source = fs.readFileSync(path.join(dist, chunk), "utf8");
const patched = source.includes("v-voice-spoken-confirmation-switch-v1");

// The voice record goes to the candidate run's private writable state.
delete process.env.OPENCLAW_VOICE_SPOKEN_CONFIRMATION;
const mod = await import(path.join(dist, chunk));
const { k: createOrResumeClientVoiceSession, M: registerClientVoiceConsultRun, x: runBeforeToolCallHook } = mod;
for (const fn of [createOrResumeClientVoiceSession, registerClientVoiceConsultRun, runBeforeToolCallHook]) assert.equal(typeof fn, "function");

const agentId = "makaron";
const sessionKey = "agent:makaron:explicit:gpt-live-h5-experiment-candidate";
const voiceSessionId = createOrResumeClientVoiceSession({ agentId, sessionKey, provider: "openai", origin: "client", transcriptCapable: true });
let sequence = 0;
async function voiceExec(command) {
  const runId = `talk-realtime-consult:${Date.now()}:candidate-${++sequence}`;
  registerClientVoiceConsultRun({ agentId, sessionKey, voiceSessionId, runId });
  return await runBeforeToolCallHook({ toolName: "exec", params: { command, timeoutSeconds: 60 },
    toolCallId: `call-${sequence}`, ctx: { runId, agentId, sessionKey } });
}
const calendar = "lark-cli calendar +agenda --start 2026-10-05 --end 2026-10-06 --format pretty";

test(`patched chunk present: ${patched}`, () => {
  assert.equal(patched, process.env.VOICE_CONFIRMATION_SWITCH_EXPECT !== "absent", "patch state does not match the expectation");
});

test("voice-bound exec of lark-cli is not challenged", async () => {
  const outcome = await voiceExec(calendar);
  if (patched) assert.equal(outcome.blocked, false, JSON.stringify(outcome));
  else assert.match(outcome.reason ?? "", /^VOICE_CONFIRMATION_REQUIRED:/);
});

test("voice-bound exec of a shell date is not challenged", async () => {
  const outcome = await voiceExec("date '+%Y-%m-%d %H:%M:%S %Z'");
  assert.equal(outcome.blocked, !patched, JSON.stringify(outcome));
});

test("OPENCLAW_VOICE_SPOKEN_CONFIRMATION=1 reaches the upstream gate on the same binding", async () => {
  process.env.OPENCLAW_VOICE_SPOKEN_CONFIRMATION = "1";
  try {
    const outcome = await voiceExec(calendar);
    assert.equal(outcome.blocked, true);
    assert.equal(outcome.deniedReason, "client-voice-confirmation");
    assert.match(outcome.reason, /^VOICE_CONFIRMATION_REQUIRED:[0-9a-f-]+ The high-impact voice action "exec" was not executed/);
  } finally {
    delete process.env.OPENCLAW_VOICE_SPOKEN_CONFIRMATION;
  }
});

test("read-only exec stays allowed either way", async () => {
  const outcome = await voiceExec("pwd");
  assert.equal(outcome.blocked, false);
});
