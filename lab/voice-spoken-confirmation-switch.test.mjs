import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { patchGptLiveClientVoiceConfirmation } from "./patch-gpt-live-voice-confirmation.mjs";
import { patchVoiceSpokenConfirmationSwitch, VOICE_SPOKEN_CONFIRMATION_SWITCH_MARKER } from "./patch-voice-spoken-confirmation-switch.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const fixture = read("./fixtures/gpt-live-voice-confirmation/agent-tools.before-tool-call-g2OT63u5.js");
const production = read("../release/captured/v2026.9.1-db91.6-gpt-live-voice-20261005/dist/agent-tools.before-tool-call-g2OT63u5.js");
const mutationSource = read("./fixtures/gpt-live-voice-confirmation/tool-mutation-7Z6dWuA8.js");
const released = read("./release-files/gpt-live-call/agent-tools.before-tool-call-g2OT63u5.js");
const patched = patchVoiceSpokenConfirmationSwitch(production);

const mutation = new Function("deps", `with(deps) { ${mutationSource.replace(/^import .*;$/gm, "").replace(/^export .*;$/gm, "")}; return {buildToolMutationState}; }`)({
  asOptionalObjectRecord: (value) => value && typeof value === "object" && !Array.isArray(value) ? value : undefined,
  normalizeOptionalLowercaseString: (value) => typeof value === "string" ? value.trim().toLowerCase() || undefined : undefined,
  normalizeLowercaseStringOrEmpty: (value) => typeof value === "string" ? value.trim().toLowerCase() : "",
  isAutomationsToolName: (name) => name === "automations", isComputerObservationAction: (action) => action === "observe",
});

// Evaluate the real confirmation region of a source with the real classifier.
function policy(source, env) {
  const from = "//#region src/talk/client-voice-confirmation.ts";
  const start = source.indexOf(from), end = source.indexOf("//#endregion", start);
  assert(start >= 0 && end > start, "confirmation region present");
  const core = new Function("deps", `with(deps) { ${source.slice(start, end)}; return { checkClientVoiceToolConfirmationPolicy, consumeClientVoiceToolConfirmationPolicy, resetClientVoiceConfirmationStateForTest }; }`)({
    createHash, randomUUID, buildToolMutationState: mutation.buildToolMutationState,
    process: { env, stderr: { write() {} } }, readVoiceSessionRecord: () => undefined,
  });
  const scope = { agentId: "makaron", voiceSessionId: "voice-1", runId: "talk-realtime-consult:1:run", isConfirmable: () => true };
  return {
    check: (toolName, toolParams) => core.checkClientVoiceToolConfirmationPolicy({ ...scope, toolName, toolParams }),
    consume: (toolName, toolParams) => core.consumeClientVoiceToolConfirmationPolicy({ ...scope, toolName, toolParams }),
    reset: () => core.resetClientVoiceConfirmationStateForTest(),
  };
}

// The exact calls GPT Live voice turns made on V (2026-10-04/05), all refused.
const calendar = { command: "lark-cli calendar +agenda --start 2026-10-05 --end 2026-10-06 --format pretty", timeoutSeconds: 60 };
const shellDate = { command: "date '+%Y-%m-%d %H:%M:%S %Z'" };

test("baseline: the fixture plus the GPT Live patch reproduces V's live bytes", () => {
  assert.equal(hash(production), "f410f20cb9f52448bdf239cde73ff3fee89843b91ff1e1f250a6d57f7c4a29d8");
  assert.equal(patchGptLiveClientVoiceConfirmation(fixture), production);
});

test("release file is the production bytes plus this switch, nothing else", () => {
  assert.equal(released, patched);
  assert(released.startsWith(VOICE_SPOKEN_CONFIRMATION_SWITCH_MARKER + "\n"));
  const added = released.split("\n").filter((line, i, lines) => !production.includes(line));
  assert.deepEqual(added, [VOICE_SPOKEN_CONFIRMATION_SWITCH_MARKER,
    "\tif (process.env.OPENCLAW_VOICE_SPOKEN_CONFIRMATION !== \"1\") return { allowed: true };"]);
});

test("patch is idempotent and refuses a drifted anchor", () => {
  assert.equal(patchVoiceSpokenConfirmationSwitch(patched), patched);
  assert.throws(() => patchVoiceSpokenConfirmationSwitch("drifted"), /anchor drifted/);
  assert.throws(() => patchVoiceSpokenConfirmationSwitch(production + "\n" + production), /anchor drifted/);
});

test("unpatched production refuses the calendar lookup (the fault this fixes)", () => {
  const p = policy(production, {});
  const result = p.check("exec", calendar);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /^VOICE_CONFIRMATION_REQUIRED:[0-9a-f-]+ The high-impact voice action "exec" was not executed/);
  assert.equal(p.check("exec", shellDate).allowed, false);
  p.reset();
});

test("patched: voice turns run exec, message and computer without a spoken challenge", () => {
  const p = policy(patched, {});
  for (const [tool, params] of [["exec", calendar], ["exec", shellDate], ["message", { action: "send", text: "hi" }], ["computer", { action: "click" }]]) {
    assert.deepEqual(p.check(tool, params), { allowed: true }, tool);
    assert.deepEqual(p.consume(tool, params), { allowed: true }, tool);
  }
  p.reset();
});

test("patched: OPENCLAW_VOICE_SPOKEN_CONFIRMATION=1 restores the upstream gate exactly", () => {
  const p = policy(patched, { OPENCLAW_VOICE_SPOKEN_CONFIRMATION: "1" });
  const result = p.check("exec", calendar);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /^VOICE_CONFIRMATION_REQUIRED:/);
  assert.deepEqual(p.check("exec", { command: "pwd" }), { allowed: true }, "read-only classification unchanged");
  p.reset();
  assert.equal(policy(patched, { OPENCLAW_VOICE_SPOKEN_CONFIRMATION: "true" }).check("exec", calendar).allowed, true, "only the exact value 1 enables it");
});
