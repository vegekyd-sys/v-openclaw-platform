import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CANCEL_DRAIN_TIMEOUT_AFTER,
  CANCEL_SUPPRESSION_RESET_AFTER,
  OUTPUT_OWNERSHIP_CONTINUITY_AFTER,
  OUTPUT_OWNERSHIP_FINISH_AFTER,
  PLAYBACK_ONLY_CANCEL_AFTER,
  PLAYBACK_ONLY_CLEAR_AFTER,
  RELAY_MODEL_AFTER,
  RUNNER_FORWARD_AFTER,
  patchRealtimeTalkConsultModel,
} from "./patch-realtime-talk-consult-model.mjs";

const fixture = readFileSync(
  new URL("./fixtures/realtime-talk-consult-model/talk-DkFuKRod.js", import.meta.url),
  "utf8",
);

test("gateway-relay Talk can use a provider-specific Agent model", () => {
  const patched = patchRealtimeTalkConsultModel(fixture);
  assert.equal(patched.includes(RUNNER_FORWARD_AFTER), true);
  assert.equal(patched.includes(RELAY_MODEL_AFTER), true);
  assert.equal(patched.includes(PLAYBACK_ONLY_CANCEL_AFTER), true);
  assert.equal(patched.includes(PLAYBACK_ONLY_CLEAR_AFTER), true);
  assert.equal(patched.includes(CANCEL_DRAIN_TIMEOUT_AFTER), true);
  assert.equal(patched.includes(CANCEL_SUPPRESSION_RESET_AFTER), true);
  assert.equal(patched.includes(OUTPUT_OWNERSHIP_FINISH_AFTER), true);
  assert.equal(patched.includes(OUTPUT_OWNERSHIP_CONTINUITY_AFTER), true);
  assert.match(patched, /providerConfig\?\.agentModel/u);
  assert.match(patched, /playbackOnlyCancellation/u);
  assert.equal(patchRealtimeTalkConsultModel(patched), patched);
});

test("a missing provider cancel acknowledgement retires ownership before queued audio resumes", () => {
  const patched = patchRealtimeTalkConsultModel(fixture);
  const timeoutBranch = patched.slice(
    patched.indexOf("const finishCancellationAfterProviderTimeout"),
    patched.indexOf("Promise.allSettled", patched.indexOf("const finishCancellationAfterProviderTimeout")),
  );
  assert.match(
    timeoutBranch,
    /outputOwnership\.finish\(session\.outputOwnership\.responseId, true\)/u,
  );
  assert.doesNotMatch(timeoutBranch, /outputOwnership\.drain\?\.resolve/u);
  assert.doesNotMatch(timeoutBranch, /closeRelaySession/u);
});

test("the next final user transcript releases cancelled-output suppression", () => {
  const patched = patchRealtimeTalkConsultModel(fixture);
  assert.match(
    patched,
    /role === "user" && final && outputOwnership\.phase === "cancelling"/u,
  );
});

test("completed and reset output generations return to claimable turn ownership", () => {
  const patched = patchRealtimeTalkConsultModel(fixture);
  assert.equal(patched.includes(OUTPUT_OWNERSHIP_FINISH_AFTER), true);
  assert.equal(patched.includes(OUTPUT_OWNERSHIP_CONTINUITY_AFTER), true);
  assert.match(
    OUTPUT_OWNERSHIP_FINISH_AFTER,
    /mode: "turn-bound"[\s\S]*phase: "unowned"/u,
  );
});

test("playback-only barge-in keeps the realtime relay open", () => {
  const patched = patchRealtimeTalkConsultModel(fixture);
  const playbackBranch = patched.slice(
    patched.indexOf("if (playbackOnlyCancellation)"),
    patched.indexOf("session.outputOwnership.phase = \"cancelling\""),
  );
  assert.match(playbackBranch, /session\.harness\.talk\.cancelTurn/u);
  assert.match(playbackBranch, /type: "clear"/u);
  assert.match(playbackBranch, /status: "applied"/u);
  assert.doesNotMatch(playbackBranch, /closeRelaySession|handleBargeIn/u);
});

test("Talk consult Agent model patch fails closed on runtime drift", () => {
  assert.throws(
    () => patchRealtimeTalkConsultModel("const unrelated = true;"),
    /anchor drifted/u,
  );
});

test("a playback-overflow cancellation keeps the turn instead of aborting the Agent", () => {
  const patched = readFileSync(
    new URL("./release-files/talk-consult-model/talk-DkFuKRod.js", import.meta.url),
    "utf8",
  );
  // The classification must consider the reason before the turn is torn down,
  // and it must sit above the branch that marks tool calls cancelled.
  const fnStart = patched.indexOf("async function cancelTalkRealtimeRelayTurn");
  assert.ok(fnStart > 0, "the relay cancellation entry point is missing");
  const classify = patched.indexOf("const playbackOverflowCancellation", fnStart);
  const teardown = patched.indexOf("session.toolCalls.markCancelled", fnStart);
  assert.ok(classify > 0, "playback-overflow classification is missing");
  assert.ok(classify < teardown, "playback-overflow is classified after the turn teardown");
  assert.equal(
    patched.split("const playbackOverflowCancellation").length - 1,
    1,
    "playback-overflow classification is duplicated",
  );
  assert.match(
    patched.slice(classify, classify + 320),
    /playbackOnlyCancellation = playbackOverflowCancellation \|\|/u,
    "playback-overflow does not reach the playback-only branch",
  );
  // The unpatched runtime must not already contain it, or the guard is inert.
  const fixture = readFileSync(
    new URL("./fixtures/realtime-talk-consult-model/talk-DkFuKRod.js", import.meta.url),
    "utf8",
  );
  assert.equal(fixture.includes("playbackOverflowCancellation"), false);
});

test("the playback-overflow patch fails closed when its anchor drifts", () => {
  assert.throws(
    () => patchRealtimeTalkConsultModel("unrelated source"),
    /anchor drifted/u,
  );
});

