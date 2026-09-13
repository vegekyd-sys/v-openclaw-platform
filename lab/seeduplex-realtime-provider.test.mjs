import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  Pcm24To16Resampler,
  SEEDUPLEX_MODEL,
  SEEDUPLEX_RESOURCE_ID,
  SEEDUPLEX_VOICES,
  buildSeeduplexRealtimeVoiceProvider,
  buildSeeduplexSession,
  decodeSeeduplexFloat32Pcm,
  resolveSeeduplexApiKey,
  resolveSeeduplexVoice,
} from "./seeduplex-realtime-provider.mjs";

class FakeSocket extends EventEmitter {
  readyState = 0;
  sent = [];
  send(value) {
    this.sent.push(JSON.parse(value));
  }
  open() {
    this.readyState = 1;
    this.emit("open");
  }
  message(value) {
    this.emit("message", Buffer.from(JSON.stringify(value)), false);
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit("close");
  }
}

function audio24k(samples) {
  const value = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => value.writeInt16LE(sample, index * 2));
  return value;
}

function floatAudio(samples) {
  const value = Buffer.alloc(samples.length * 4);
  samples.forEach((sample, index) => value.writeFloatLE(sample, index * 4));
  return value.toString("base64");
}

test("provider exposes one model and the two named voice profiles", () => {
  const provider = buildSeeduplexRealtimeVoiceProvider({
    env: { VOLCENGINE_REALTIME_API_KEY: "configured" },
  });
  assert.equal(provider.id, "seeduplex");
  assert.deepEqual(provider.models, [SEEDUPLEX_MODEL]);
  assert.deepEqual(provider.voices, ["xiaohe", "companion"]);
  assert.deepEqual(provider.capabilities.transports, ["gateway-relay"]);
  assert.equal(provider.capabilities.supportsToolCalls, true);
  assert.equal(provider.isConfigured({ providerConfig: {} }), true);
  assert.equal(
    buildSeeduplexRealtimeVoiceProvider({ env: {} }).isConfigured({ providerConfig: {} }),
    false,
  );
});

test("credential resolution is explicit and voice aliases map to pinned speakers", () => {
  assert.equal(resolveSeeduplexApiKey({ apiKey: " direct " }, {}), "direct");
  assert.equal(
    resolveSeeduplexApiKey({}, { DOUBAO_SPEECH_API_KEY: " fallback " }),
    "fallback",
  );
  assert.deepEqual(resolveSeeduplexVoice("companion"), {
    id: "companion",
    speaker: SEEDUPLEX_VOICES.companion,
  });
  assert.throws(() => resolveSeeduplexVoice("unknown"), /Unsupported/);
});

test("session request preserves Talk instructions and native tools", () => {
  const session = buildSeeduplexSession(
    { model: SEEDUPLEX_MODEL, voice: "companion" },
    {
      instructions: "Use the full V agent when needed.",
      tools: [
        {
          type: "function",
          name: "openclaw_agent_consult",
          description: "Delegate to V",
          parameters: { type: "object", properties: {} },
        },
      ],
    },
  );
  assert.equal(session.session.audio.input.format.rate, 16_000);
  assert.equal(session.session.audio.output.format.rate, 24_000);
  assert.equal(session.session.audio.output.voice, SEEDUPLEX_VOICES.companion);
  assert.equal(session.session.tools[0].name, "openclaw_agent_consult");
  assert.match(session.session.instructions, /full V agent/);
});

test("24 kHz PCM16 input is statefully converted to 16 kHz", () => {
  const resampler = new Pcm24To16Resampler();
  assert.deepEqual([...resampler.push(audio24k([0, 3]))], []);
  const first = resampler.push(audio24k([6, 9, 12, 15]));
  assert.equal(first.length, 8);
  assert.deepEqual(
    [first.readInt16LE(0), first.readInt16LE(2), first.readInt16LE(4), first.readInt16LE(6)],
    [0, 5, 9, 14],
  );
});

test("float32 upstream output becomes bounded 24 kHz PCM16", () => {
  const decoded = decodeSeeduplexFloat32Pcm(floatAudio([-2, -1, -0.5, 0, 0.5, 1, 2]));
  assert.deepEqual(
    Array.from({ length: 7 }, (_, index) => decoded.readInt16LE(index * 2)),
    [-32768, -32768, -16384, 0, 16384, 32767, 32767],
  );
  assert.throws(() => decodeSeeduplexFloat32Pcm(Buffer.alloc(3).toString("base64")), /Invalid/);
});

test("bridge owns auth, audio conversion, transcripts and exactly-once tool results", async () => {
  const socket = new FakeSocket();
  let socketOptions;
  const events = [];
  const audio = [];
  const calls = [];
  const responses = [];
  const provider = buildSeeduplexRealtimeVoiceProvider({
    env: { VOLCENGINE_REALTIME_API_KEY: "secret-value" },
    createWebSocket: async (_url, options) => {
      socketOptions = options;
      return socket;
    },
  });
  const bridge = provider.createBridge({
    providerConfig: { voice: "xiaohe" },
    instructions: "Talk naturally.",
    tools: [
      {
        type: "function",
        name: "openclaw_agent_consult",
        description: "Delegate",
        parameters: { type: "object", properties: {} },
      },
    ],
    onAudio: (value) => audio.push(value),
    onClearAudio: (reason) => events.push(["clear", reason]),
    onTranscript: (...args) => events.push(["transcript", ...args]),
    onToolCall: (call) => calls.push(call),
    onResponseDone: (outcome) => responses.push(outcome),
    onReady: () => events.push(["ready"]),
    onError: (error) => events.push(["error", error.message]),
    onClose: (reason) => events.push(["close", reason]),
  });

  const connecting = bridge.connect();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(socketOptions.headers["X-Api-Key"], "secret-value");
  assert.equal(socketOptions.headers["X-Api-Resource-Id"], SEEDUPLEX_RESOURCE_ID);
  socket.open();
  assert.equal(socket.sent[0].type, "session.create");
  assert.equal(socket.sent[0].session.audio.output.voice, SEEDUPLEX_VOICES.xiaohe);
  socket.message({ type: "session.created" });
  await connecting;
  assert.equal(bridge.isConnected(), true);

  bridge.sendAudio(Buffer.alloc(960));
  assert.equal(socket.sent[1].type, "input_audio_buffer.append");
  assert.equal(Buffer.from(socket.sent[1].audio, "base64").length, 640);
  socket.message({
    type: "conversation.item.input_audio_transcription.completed",
    text: "帮我看看项目",
  });
  socket.message({ type: "response.output_audio.delta", delta: floatAudio([0.25, -0.25]) });
  assert.deepEqual(events.find((event) => event[0] === "transcript"), [
    "transcript",
    "user",
    "帮我看看项目",
    true,
  ]);
  assert.deepEqual([audio[0].readInt16LE(0), audio[0].readInt16LE(2)], [8192, -8192]);
  socket.message({ type: "response.output_audio.done", response_id: "response-1" });
  socket.message({ type: "response.done", response_id: "response-1" });
  assert.deepEqual(responses, [{ status: "completed", responseId: "response-1" }]);

  socket.message({
    type: "response.function_call_arguments.done",
    items: [
      {
        call_id: "call-1",
        name: "openclaw_agent_consult",
        arguments: JSON.stringify({ request: "检查项目" }),
      },
    ],
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.request, "检查项目");
  bridge.submitToolResult("call-1", { text: "项目正常" });
  bridge.submitToolResult("call-1", { text: "duplicate ignored" });
  assert.equal(
    socket.sent.filter((event) => event.type === "conversation.item.create").length,
    1,
  );
  assert.equal(socket.sent.at(-1).items[0].content[0].text, '{"text":"项目正常"}');

  bridge.close();
  assert.equal(socket.sent.at(-1).type, "session.close");
  socket.close();
  assert.equal(events.filter((event) => event[0] === "close").length, 1);
});

test("upstream rejection never relays vendor diagnostics or credentials", async () => {
  const socket = new FakeSocket();
  const errors = [];
  const provider = buildSeeduplexRealtimeVoiceProvider({
    env: { VOLCENGINE_REALTIME_API_KEY: "do-not-leak" },
    createWebSocket: async () => socket,
  });
  const bridge = provider.createBridge({
    providerConfig: {},
    onAudio() {},
    onClearAudio() {},
    onError: (error) => errors.push(error.message),
    onClose() {},
  });
  const connecting = bridge.connect();
  await new Promise((resolve) => setImmediate(resolve));
  socket.emit("unexpected-response", {}, { statusCode: 403, resume() {} });
  await assert.rejects(connecting, /not enabled/);
  assert.equal(errors.join(" ").includes("do-not-leak"), false);
});
