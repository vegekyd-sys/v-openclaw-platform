import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CANCEL_DRAIN_TIMEOUT_AFTER,
  CANCEL_SUPPRESSION_RESET_AFTER,
  DIRECT_CONSULT_LIFECYCLE_SETUP_AFTER,
  DIRECT_CONSULT_RUN_STARTED_AFTER,
  DIRECT_CONSULT_TERMINAL_AFTER,
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
  assert.equal(patched.includes(DIRECT_CONSULT_LIFECYCLE_SETUP_AFTER), true);
  assert.equal(patched.includes(DIRECT_CONSULT_RUN_STARTED_AFTER), true);
  assert.equal(patched.includes(DIRECT_CONSULT_TERMINAL_AFTER), true);
  assert.equal(patched.includes(OUTPUT_OWNERSHIP_FINISH_AFTER), true);
  assert.equal(patched.includes(OUTPUT_OWNERSHIP_CONTINUITY_AFTER), true);
  assert.match(patched, /providerConfig\?\.agentModel/u);
  assert.match(patched, /playbackOnlyCancellation/u);
  assert.equal(patchRealtimeTalkConsultModel(patched), patched);
});

test("direct provider consults report exact owner-scoped start and terminal events", async () => {
  const patched = patchRealtimeTalkConsultModel(fixture);
  const start = patched.indexOf("function createTalkClientAgentConsultRunner");
  const end = patched.indexOf("function createTalkClientGatewayControlOwner", start);
  const functionSource = patched.slice(start, end);
  let finishConsult;
  const consult = new Promise((resolve) => { finishConsult = resolve; });
  const deliveries = [];
  const createRunner = Function(
    "resolveTalkAgentConsultAuthority",
    "parseRealtimeVoiceAgentConsultArgs",
    "assertClientVoiceSessionOpen",
    "authorizeClientVoiceConfirmation",
    "createTalkClientAgentRuntime",
    "normalizeTalkSection",
    "runOutsideGatewayRootWorkAdmission",
    "tryBeginGatewayRootWorkAdmission",
    "GatewayDrainingError",
    "consultRealtimeVoiceAgent",
    "registerClientVoiceConsultRun",
    "bindAuthorizedClientVoiceConfirmation",
    "registerChatAbortController",
    "REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME",
    `${functionSource}; return createTalkClientAgentConsultRunner;`,
  )(
    () => ({}),
    (args) => args,
    () => {},
    () => undefined,
    () => ({}),
    () => ({}),
    () => ({ run: (fn) => fn(), release: () => {} }),
    () => true,
    class extends Error {},
    (options) => {
      options.onRunStarted({ runId: "run-exact", sessionId: "session-exact", timeoutMs: 60_000 });
      return consult;
    },
    () => {},
    () => {},
    () => ({ controller: new AbortController(), cleanup: () => {} }),
    "openclaw_agent_consult",
  );
  const runner = createRunner({
    config: {},
    context: {
      chatAbortControllers: new Map(),
      logGateway: {},
      broadcastToConnIds: (event, payload, connIds, options) =>
        deliveries.push({ event, payload, connIds: [...connIds], options }),
    },
    sessionTarget: {
      agentId: "makaron",
      sessionKey: "voice:test",
      canonicalKey: "agent:makaron:voice:test",
      storePath: "/tmp/test",
    },
    ownerConnId: "speaker-connection",
    getVoiceSessionId: () => "voice-exact",
    initialItems: [],
  });
  const pending = runner.runArgs({ question: "test" }, new AbortController().signal);
  await Promise.resolve();
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].event, "talk.event");
  assert.deepEqual(deliveries[0].connIds, ["speaker-connection"]);
  assert.equal(deliveries[0].payload.voiceSessionId, "voice-exact");
  assert.equal(deliveries[0].payload.talkEvent.type, "tool.call");
  assert.equal(deliveries[0].payload.talkEvent.callId, "run-exact");
  finishConsult({ text: "done" });
  assert.deepEqual(await pending, { text: "done" });
  assert.equal(deliveries.length, 2);
  assert.equal(deliveries[1].payload.talkEvent.type, "tool.result");
  assert.equal(deliveries[1].payload.talkEvent.callId, "run-exact");
  assert.equal(deliveries[1].payload.talkEvent.final, true);
  assert.equal(deliveries[1].options.dropIfSlow, false);
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
  // The playback-only branch itself calls cancelTurn, which clears
  // activeTurnId. Audio still streaming would then resolve against no active
  // turn - the same ownership failure by another route - so an overflow must
  // skip that call and only broadcast the clear.
  const branchStart = patched.indexOf("if (playbackOnlyCancellation)", fnStart);
  assert.ok(branchStart > 0, "the playback-only branch is missing");
  const branch = patched.slice(branchStart, branchStart + 1200);
  assert.match(
    branch,
    /const cancelled = playbackOverflowCancellation \? void 0 : session\.harness\.talk\.cancelTurn/u,
    "an overflow still cancels the Gateway turn",
  );
  assert.match(branch, /talkEvent: cancelled\?\.ok/u, "the clear broadcast assumes a cancelTurn result");
  // Clearing drops audio the user has not heard, which is what turned a full
  // buffer into a missing middle section of the reply.
  assert.match(
    branch,
    /if \(!playbackOverflowCancellation\) broadcastToOwner\$1/u,
    "an overflow still clears the queued audio",
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
