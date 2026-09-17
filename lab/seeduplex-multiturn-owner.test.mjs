import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { buildSeeduplexRealtimeVoiceProvider } from "./seeduplex-realtime-provider.mjs";

class FakeSocket extends EventEmitter {
  readyState = 0;
  sent = [];
  send(value) { this.sent.push(JSON.parse(value)); }
  open() { this.readyState = 1; this.emit("open"); }
  message(value) { this.emit("message", Buffer.from(JSON.stringify(value)), false); }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.emit("close"); }
}

function floatAudio(samples) {
  const value = Buffer.alloc(samples.length * 4);
  samples.forEach((s, i) => value.writeFloatLE(s, i * 4));
  return value.toString("base64");
}

// Faithful port of TalkRealtimeRelayOutputOwnership from the deployed
// openclaw/dist/talk-DkFuKRod.js. Only the bridge's forwarded events drive it,
// so a failure here is the exact failure the Gateway reports.
class Ownership {
  constructor(activeTurnId, ensureTurn, fail) {
    this.activeTurnId = activeTurnId; this.ensureTurn = ensureTurn; this.fail = fail;
    this.mode = "turn-bound"; this.phase = "unowned"; this.outputGeneration = 0;
  }
  responseCreated(responseId) {
    const id = responseId?.trim();
    if (this.phase === "unowned") {
      Object.assign(this, { mode: id ? "exact-response" : "turn-bound", phase: "owned", turnId: this.ensureTurn(), responseId: id });
      return true;
    }
    if (this.phase === "owned" && this.mode === "exact-response" && id && id === this.responseId) return true;
    this.fail("Realtime provider output has no live response owner.");
    return false;
  }
  resolve(claim) {
    const activeTurnId = this.activeTurnId();
    if (this.phase !== "cancelling" && activeTurnId && this.mode === "turn-bound" && claim && this.phase === "unowned") {
      Object.assign(this, { phase: "owned", turnId: activeTurnId });
    }
    const turnId = this.phase === "owned" && this.turnId === activeTurnId ? activeTurnId : undefined;
    if (!turnId && (claim || this.phase === "owned")) this.fail("Realtime provider output has no live response owner.");
    return turnId;
  }
  finish(responseId, cancellationEvent = false) {
    const cancelled = this.phase === "cancelling";
    if ((cancellationEvent && !cancelled) || (this.mode === "exact-response" && (this.phase === "unowned" || this.responseId !== responseId))) return "ignore";
    Object.assign(this, { mode: "turn-bound", phase: "unowned", turnId: undefined, responseId: undefined });
    return cancelled ? "cancelled" : "completed";
  }
}

async function buildHarness() {
  const socket = new FakeSocket();
  const failures = [];
  let turn = 0;
  let turnOpen = false;
  const ownership = new Ownership(
    () => (turnOpen ? `turn-${turn}` : undefined),
    () => { turnOpen = true; return `turn-${turn}`; },
    (message) => failures.push(message),
  );
  const consults = [];
  const delivered = { audio: 0, transcripts: 0 };
  const provider = buildSeeduplexRealtimeVoiceProvider({
    env: { VOLCENGINE_REALTIME_API_KEY: "secret-value" },
    createWebSocket: async () => socket,
  });
  const bridge = provider.createBridge({
    providerConfig: { voice: "xiaohe" },
    instructions: "Use the agent.",
    language: "zh-CN",
    tools: [{ type: "function", name: "openclaw_agent_consult", description: "Delegate", parameters: { type: "object", properties: {} } }],
    runAgentConsult: async () => await new Promise((resolve) => consults.push(resolve)),
    onAudio: () => { delivered.audio += 1; ownership.resolve(true); },
    onClearAudio() {},
    onToolCall() {},
    // Only assistant output claims the Gateway output owner; a user
    // transcript is not provider output.
    onTranscript: (role) => { if (role === "assistant") { delivered.transcripts += 1; ownership.resolve(true); } },
    onResponseDone: (outcome) => ownership.finish(outcome.responseId),
    onEvent: (event) => {
      if (event.direction === "server" && event.type === "response.created") ownership.responseCreated(event.responseId);
    },
    onError(error) { failures.push(`bridge error: ${error.message}`); },
    onClose() {},
  });
  const connecting = bridge.connect();
  await new Promise((resolve) => setImmediate(resolve));
  socket.open();
  socket.message({ type: "session.created" });
  await connecting;
  // openTurn is Gateway-side bookkeeping only. Emitting the started event is
  // separate because Volcengine does not always send one.
  const openTurn = () => { turn += 1; turnOpen = true; };
  const startTurn = () => { openTurn(); socket.message({ type: "conversation.item.input_audio_transcription.started" }); };
  const endTurn = () => { turnOpen = false; };
  return { socket, bridge, failures, consults, delivered, openTurn, startTurn, endTurn };
}

// A plain turn: the provider speaks directly with no Agent delegation.
function plainTurn(socket, id) {
  socket.message({ type: "conversation.item.input_audio_transcription.completed", text: "听得见吗" });
  socket.message({ type: "response.created", response_id: id });
  socket.message({ type: "response.output_audio.delta", delta: floatAudio([0.1, -0.1]) });
  socket.message({ type: "response.output_text.done", text: "听得见，我在呢。" });
  socket.message({ type: "response.output_audio.done", response_id: id });
  socket.message({ type: "response.done", response_id: id });
}

test("a consult turn after two plain turns leaves no late output without an owner", async () => {
  const h = await buildHarness();

  h.startTurn(); plainTurn(h.socket, "resp-1"); h.endTurn();
  assert.deepEqual(h.failures, [], "plain turn 1 lost the output owner");

  h.startTurn(); plainTurn(h.socket, "resp-2"); h.endTurn();
  assert.deepEqual(h.failures, [], "plain turn 2 lost the output owner");

  // Turn 3 delegates to the Agent.
  h.startTurn();
  h.socket.message({ type: "conversation.item.input_audio_transcription.completed", text: "编一个故事" });
  h.socket.message({ type: "response.created", response_id: "resp-3" });
  h.socket.message({
    type: "response.function_call_arguments.done",
    items: [{ call_id: "call-1", name: "openclaw_agent_consult", arguments: JSON.stringify({ question: "编一个故事" }) }],
  });
  await new Promise((resolve) => setImmediate(resolve));

  // Seeduplex opens its own response for the working announcement.
  h.socket.message({ type: "response.created", response_id: "resp-3-working" });
  h.socket.message({ type: "response.output_audio.delta", delta: floatAudio([0.2]) });
  h.socket.message({ type: "response.output_audio.done", response_id: "resp-3-working" });
  h.socket.message({ type: "response.created", response_id: "resp-3-working-tts" });
  h.socket.message({ type: "response.output_audio.done", response_id: "resp-3-working-tts" });
  await new Promise((resolve) => setImmediate(resolve));

  h.consults[0]?.({ text: "风火轮小镇上，十二岁的小满有辆旧红车。" });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  // The final Agent result is spoken on yet another upstream response.
  h.socket.message({ type: "response.created", response_id: "resp-3-final" });
  h.socket.message({ type: "response.output_text.done", text: "风火轮小镇上，十二岁的小满有辆旧红车。" });
  h.socket.message({ type: "response.output_audio.delta", delta: floatAudio([0.3]) });
  h.socket.message({ type: "response.output_audio.done", response_id: "resp-3-final" });
  h.socket.message({ type: "response.done", response_id: "resp-3-final" });
  assert.deepEqual(h.failures, [], "the consult turn itself lost the output owner");

  // The Gateway turn is finished. Seeduplex still trails frames from its own
  // internal generation; none of them may reach the Gateway.
  h.endTurn();
  h.socket.message({ type: "response.output_text.done", text: "还有什么想听的吗？" });
  h.socket.message({ type: "response.output_audio.delta", delta: floatAudio([0.05]) });
  h.socket.message({ type: "response.done", response_id: "resp-3-final" });

  assert.deepEqual(h.failures, [], "late provider output escaped after the consult turn ended");
});

test("a second consult turn still owns its own output", async () => {
  const h = await buildHarness();

  for (const [id, consultIndex] of [["resp-a", 0], ["resp-b", 1]]) {
    h.startTurn();
    h.socket.message({ type: "conversation.item.input_audio_transcription.completed", text: "帮我查一下" });
    h.socket.message({ type: "response.created", response_id: id });
    h.socket.message({
      type: "response.function_call_arguments.done",
      items: [{ call_id: `call-${id}`, name: "openclaw_agent_consult", arguments: JSON.stringify({ question: "查一下" }) }],
    });
    await new Promise((resolve) => setImmediate(resolve));
    h.socket.message({ type: "response.created", response_id: `${id}-working` });
    h.socket.message({ type: "response.output_audio.done", response_id: `${id}-working` });
    h.socket.message({ type: "response.created", response_id: `${id}-working-tts` });
    h.socket.message({ type: "response.output_audio.done", response_id: `${id}-working-tts` });
    await new Promise((resolve) => setImmediate(resolve));
    h.consults[consultIndex]?.({ text: "查到了三条记录。" });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    h.socket.message({ type: "response.created", response_id: `${id}-final` });
    h.socket.message({ type: "response.output_text.done", text: "查到了三条记录。" });
    h.socket.message({ type: "response.output_audio.delta", delta: floatAudio([0.3]) });
    h.socket.message({ type: "response.output_audio.done", response_id: `${id}-final` });
    h.socket.message({ type: "response.done", response_id: `${id}-final` });
    h.endTurn();
    h.socket.message({ type: "response.output_audio.delta", delta: floatAudio([0.02]) });
    assert.deepEqual(h.failures, [], `consult turn ${id} lost the output owner`);
  }
});

test("a plain turn after a consult turn reopens the output owner", async () => {
  const h = await buildHarness();

  h.startTurn();
  h.socket.message({ type: "conversation.item.input_audio_transcription.completed", text: "编一个故事" });
  h.socket.message({ type: "response.created", response_id: "c1" });
  h.socket.message({
    type: "response.function_call_arguments.done",
    items: [{ call_id: "call-c1", name: "openclaw_agent_consult", arguments: JSON.stringify({ question: "故事" }) }],
  });
  await new Promise((resolve) => setImmediate(resolve));
  h.socket.message({ type: "response.created", response_id: "c1-working" });
  h.socket.message({ type: "response.output_audio.done", response_id: "c1-working" });
  h.socket.message({ type: "response.created", response_id: "c1-tts" });
  h.socket.message({ type: "response.output_audio.done", response_id: "c1-tts" });
  await new Promise((resolve) => setImmediate(resolve));
  h.consults[0]?.({ text: "从前有一辆小红车。" });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  h.socket.message({ type: "response.created", response_id: "c1-final" });
  h.socket.message({ type: "response.output_audio.done", response_id: "c1-final" });
  h.socket.message({ type: "response.done", response_id: "c1-final" });
  h.endTurn();

  // The user speaks again and the provider answers directly this time.
  h.startTurn();
  plainTurn(h.socket, "c2");
  h.endTurn();

  assert.deepEqual(h.failures, [], "the plain turn after a consult could not claim output");
});

// Volcengine does not always announce input_audio_transcription.started, so a
// turn can begin with only the completed transcription. Suppressing output
// until a Gateway-visible response.created arrives would drop that turn's reply
// silently, because the Gateway's turn-bound fallback never gets to claim it.
test("a turn that only reports a completed transcription still delivers output", async () => {
  const h = await buildHarness();

  h.startTurn();
  h.socket.message({ type: "conversation.item.input_audio_transcription.completed", text: "编一个故事" });
  h.socket.message({ type: "response.created", response_id: "t1" });
  h.socket.message({
    type: "response.function_call_arguments.done",
    items: [{ call_id: "call-t1", name: "openclaw_agent_consult", arguments: JSON.stringify({ question: "故事" }) }],
  });
  await new Promise((resolve) => setImmediate(resolve));
  h.socket.message({ type: "response.created", response_id: "t1-working" });
  h.socket.message({ type: "response.output_audio.done", response_id: "t1-working" });
  h.socket.message({ type: "response.created", response_id: "t1-tts" });
  h.socket.message({ type: "response.output_audio.done", response_id: "t1-tts" });
  await new Promise((resolve) => setImmediate(resolve));
  h.consults[0]?.({ text: "从前有一辆小红车。" });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  h.socket.message({ type: "response.created", response_id: "t1-final" });
  h.socket.message({ type: "response.output_audio.done", response_id: "t1-final" });
  h.socket.message({ type: "response.done", response_id: "t1-final" });
  h.endTurn();

  const afterFirstTurn = { ...h.delivered };

  // Second turn: no started event, and the provider reuses its internal
  // generation rather than announcing a new Gateway-visible response.
  h.openTurn();
  h.socket.message({ type: "conversation.item.input_audio_transcription.completed", text: "再讲一个" });
  h.socket.message({ type: "response.output_text.done", text: "好的，再讲一个。" });
  h.socket.message({ type: "response.output_audio.delta", delta: floatAudio([0.4, 0.2]) });
  h.socket.message({ type: "response.output_audio.done", response_id: "t2" });

  assert.ok(
    h.delivered.audio > afterFirstTurn.audio,
    "the second turn's audio was swallowed after the first turn closed output",
  );
  assert.ok(
    h.delivered.transcripts > afterFirstTurn.transcripts,
    "the second turn's transcript was swallowed after the first turn closed output",
  );
  assert.deepEqual(h.failures, [], "the second turn lost the output owner");
});

// The 2026-09-16 field failure: input VAD raises a barge-in while the Agent
// result is being spoken, with no user speech behind it. Playback stopped after
// about a second and the Gateway reported a lost output owner.
test("a spurious barge-in during the Agent reply does not stop playback", async () => {
  const h = await buildHarness();

  h.startTurn();
  h.socket.message({ type: "conversation.item.input_audio_transcription.completed", text: "编一个故事" });
  h.socket.message({ type: "response.created", response_id: "r1" });
  h.socket.message({
    type: "response.function_call_arguments.done",
    items: [{ call_id: "call-r1", name: "openclaw_agent_consult", arguments: JSON.stringify({ question: "故事" }) }],
  });
  await new Promise((resolve) => setImmediate(resolve));
  h.socket.message({ type: "response.created", response_id: "r1-working" });
  h.socket.message({ type: "response.output_audio.done", response_id: "r1-working" });
  h.socket.message({ type: "response.created", response_id: "r1-tts" });
  h.socket.message({ type: "response.output_audio.done", response_id: "r1-tts" });
  await new Promise((resolve) => setImmediate(resolve));
  h.consults[0]?.({ text: "风火轮小镇上，十二岁的小满有辆旧红车。" });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  // The Agent result starts playing.
  h.socket.message({ type: "response.created", response_id: "r1-final" });
  h.socket.message({ type: "response.output_audio.delta", delta: floatAudio([0.3]) });
  h.socket.message({ type: "response.output_audio.delta", delta: floatAudio([0.3]) });
  const playedBeforeBargeIn = h.delivered.audio;
  assert.ok(playedBeforeBargeIn > 0, "the Agent result never started playing");

  // Input VAD fires on silence. Nothing was said.
  const sentBefore = h.socket.sent.length;
  h.bridge.handleBargeIn();
  assert.equal(
    h.socket.sent.slice(sentBefore).filter((event) => event.type === "response.cancel").length,
    0,
    "a bare barge-in signal cancelled the upstream generation",
  );

  // The rest of the reply must still arrive and still belong to the same owner.
  h.socket.message({ type: "response.output_audio.delta", delta: floatAudio([0.3]) });
  h.socket.message({ type: "response.output_audio.delta", delta: floatAudio([0.3]) });
  h.socket.message({ type: "response.output_audio.done", response_id: "r1-final" });
  h.socket.message({ type: "response.done", response_id: "r1-final" });

  assert.ok(
    h.delivered.audio > playedBeforeBargeIn,
    "playback stopped after a spurious barge-in",
  );
  assert.deepEqual(h.failures, [], "the spurious barge-in lost the output owner");
});

test("a real interruption still cancels the upstream generation", async () => {
  const h = await buildHarness();

  h.startTurn();
  h.socket.message({ type: "response.created", response_id: "s1" });
  h.socket.message({ type: "response.output_audio.delta", delta: floatAudio([0.3]) });

  const sentBefore = h.socket.sent.length;
  h.bridge.handleBargeIn();
  h.socket.message({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "停一下，我改主意了",
  });
  assert.equal(
    h.socket.sent.slice(sentBefore).filter((event) => event.type === "response.cancel").length,
    1,
    "a confirmed user utterance did not cancel the upstream generation",
  );
});

// 2026-09-17 field regression: chit-chat played the first fragment and then went
// silent for the rest of the session. A spurious barge-in armed the cancellation
// suppression on the user transcription that STARTS the next turn, so the reply
// to that very utterance was swallowed. Suppression must cover the cancelled
// generation only, and end at the next one.
test("a confirmed interruption does not silence the turn it starts", async () => {
  const h = await buildHarness();

  // Turn 1 is speaking when the user cuts in.
  h.startTurn();
  h.socket.message({ type: "response.created", response_id: "gen-1" });
  h.socket.message({ type: "response.output_audio.delta", delta: floatAudio([0.3]) });
  const playedTurn1 = h.delivered.audio;
  assert.ok(playedTurn1 > 0, "turn 1 never started playing");

  h.bridge.handleBargeIn();
  h.socket.message({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "等一下，换个话题",
  });
  assert.equal(
    h.socket.sent.filter((event) => event.type === "response.cancel").length,
    1,
    "a confirmed interruption did not cancel the upstream generation",
  );

  // Tail of the cancelled generation must stay swallowed.
  h.socket.message({ type: "response.output_audio.delta", delta: floatAudio([0.9]) });
  assert.equal(h.delivered.audio, playedTurn1, "the cancelled generation kept playing");

  // The reply to the interrupting utterance is a NEW generation and must be heard.
  h.openTurn();
  h.socket.message({ type: "response.created", response_id: "gen-2" });
  h.socket.message({ type: "response.output_text.done", text: "好，我们换个话题。" });
  h.socket.message({ type: "response.output_audio.delta", delta: floatAudio([0.4]) });
  h.socket.message({ type: "response.output_audio.delta", delta: floatAudio([0.4]) });
  h.socket.message({ type: "response.output_audio.done", response_id: "gen-2" });

  assert.ok(
    h.delivered.audio > playedTurn1,
    "the reply to the interrupting utterance was silenced",
  );
  // Output ownership is deliberately not asserted here. A real interruption
  // reaches the Gateway as talk.session.cancelOutput, which moves ownership to
  // "cancelling" and releases it on the final user transcript or the drain
  // timeout. This harness drives the bridge directly, so that path never runs
  // and gen-1 stays owned. Asserting it here would test the harness, not the
  // product. The spurious-barge-in case above does assert ownership, because
  // there no Gateway cancellation is involved.
});

