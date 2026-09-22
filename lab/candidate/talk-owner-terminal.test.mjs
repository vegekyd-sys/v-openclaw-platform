import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";

test("candidate runtime sends direct consult lifecycle to its owning Talk connection", async () => {
  const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
  assert(runtime, "candidate runtime is required");
  const source = readFileSync(join(runtime, "openclaw/dist/talk-DkFuKRod.js"), "utf8");
  const start = source.indexOf("function createTalkClientAgentConsultRunner");
  const end = source.indexOf("function createTalkClientGatewayControlOwner", start);
  assert(start > 0 && end > start, "candidate Talk runner is missing");
  const functionSource = source.slice(start, end);
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
      options.onRunStarted({ runId: "run-vlab", sessionId: "session-vlab", timeoutMs: 60_000 });
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
    ownerConnId: "speaker-vlab",
    getVoiceSessionId: () => "voice-vlab",
    initialItems: [],
  });
  const pending = runner.runArgs({ question: "test" }, new AbortController().signal);
  await Promise.resolve();
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].event, "talk.event");
  assert.equal(deliveries[0].payload.voiceSessionId, "voice-vlab");
  assert.equal(deliveries[0].payload.talkEvent.type, "tool.call");
  assert.deepEqual(deliveries[0].connIds, ["speaker-vlab"]);
  finishConsult({ text: "done" });
  await pending;
  assert.equal(deliveries.length, 2);
  assert.equal(deliveries[1].payload.talkEvent.type, "tool.result");
  assert.equal(deliveries[1].payload.talkEvent.callId, "run-vlab");
  assert.equal(deliveries[1].payload.talkEvent.final, true);
  assert.equal(deliveries[1].options.dropIfSlow, false);
});
