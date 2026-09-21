import assert from "node:assert/strict";
import test from "node:test";
import {
  VolcengineRtcManagedRoomClient,
  decodeRtcTlv,
  encodeRtcTlv,
} from "./volcengine-rtc-managed-room-client.mjs";

class FakeRtcEngine {
  listeners = new Map();
  joined = [];
  sent = [];
  offCalls = [];
  on(name, listener) {
    this.listeners.set(name, listener);
  }
  off(name, listener) {
    this.offCalls.push([name, listener]);
    this.listeners.delete(name);
  }
  emit(name, event) {
    this.listeners.get(name)?.(event);
  }
  async joinRoom(...args) {
    this.joined.push(args);
  }
  async startAudioCapture(deviceId) {
    this.inputDeviceId = deviceId;
  }
  async stopAudioCapture() {
    this.captureStopped = true;
  }
  async leaveRoom() {
    this.left = true;
  }
  async sendUserBinaryMessage(userId, message) {
    this.sent.push({ userId, message });
  }
}

function makeSession() {
  return {
    token: "browser-room-token",
    roomUrl:
      "vertc://managed-room/join?appId=app&roomId=room&userId=user&agentUserId=xiaohe&taskId=task&businessId=v",
  };
}

function makeHarness() {
  const engine = new FakeRtcEngine();
  const statuses = [];
  const transcripts = [];
  const events = [];
  const toolCalls = [];
  let inputStops = 0;
  let destroyed;
  const sdk = {
    events: {
      onRoomBinaryMessageReceived: "binary",
      onError: "error",
    },
    RoomProfileType: { chat: 12 },
    createEngine: (appId) => {
      assert.equal(appId, "app");
      return engine;
    },
    destroyEngine: (value) => {
      destroyed = value;
    },
  };
  const context = {
    input: { stop: () => inputStops++ },
    callbacks: {
      onStatus: (...args) => statuses.push(args),
      onTranscript: (value) => transcripts.push(value),
      onTalkEvent: (value) => events.push(value),
    },
    executeToolCall: async (call) => {
      toolCalls.push(call);
      await call.submit(call.callId, { result: "V 已经完成网络搜索。" });
    },
  };
  return {
    engine,
    sdk,
    context,
    statuses,
    transcripts,
    events,
    toolCalls,
    inputStops: () => inputStops,
    destroyed: () => destroyed,
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("TLV framing is deterministic and rejects malformed messages", () => {
  const encoded = encodeRtcTlv("func", JSON.stringify({ ok: true }));
  assert.deepEqual(decodeRtcTlv(encoded), { type: "func", value: '{"ok":true}' });
  assert.throws(() => encodeRtcTlv("tool-long", "x"), /exactly four/u);
  assert.throws(() => decodeRtcTlv(new ArrayBuffer(7)), /Invalid/u);
});

test("managed-room uses RTC for audio and forwards only control data to V", async () => {
  const harness = makeHarness();
  const client = new VolcengineRtcManagedRoomClient(makeSession(), harness.context, {
    loadSdk: async () => harness.sdk,
    inputDeviceId: "mic-1",
  });
  assert.equal(await client.start(), "ready");
  assert.equal(harness.inputStops(), 1, "the host microphone probe must be released");
  assert.equal(harness.engine.joined[0][0], "browser-room-token");
  assert.equal(harness.engine.joined[0][1], "room");
  assert.equal(harness.engine.joined[0][3].isAutoPublish, true);
  assert.equal(harness.engine.joined[0][3].isAutoSubscribeAudio, true);
  assert.equal(harness.engine.inputDeviceId, "mic-1");

  harness.engine.emit("binary", {
    userId: "xiaohe",
    message: encodeRtcTlv(
      "subv",
      JSON.stringify({ data: [{ userId: "user", text: "帮我查天气", definite: true }] }),
    ),
  });
  assert.equal(harness.transcripts.length, 0, "provider events wait until UI activation");
  client.activate();
  assert.deepEqual(harness.transcripts[0], {
    role: "user",
    text: "帮我查天气",
    final: true,
  });

  harness.engine.emit("binary", {
    userId: "xiaohe",
    message: encodeRtcTlv(
      "tool",
      JSON.stringify({
        tool_calls: [
          {
            id: "call-1",
            function: {
              name: "openclaw_agent_consult",
              arguments: JSON.stringify({ question: "帮我查天气" }),
            },
          },
        ],
      }),
    ),
  });
  await tick();
  await tick();
  assert.equal(harness.toolCalls.length, 1);
  assert.equal(harness.toolCalls[0].args.question, "帮我查天气");
  assert.equal(harness.engine.sent.length, 1);
  assert.equal(harness.engine.sent[0].userId, "xiaohe");
  assert.deepEqual(JSON.parse(decodeRtcTlv(harness.engine.sent[0].message).value), {
    ToolCallID: "call-1",
    Content: "V 已经完成网络搜索。",
  });
  assert.equal(
    harness.events.some((event) => event.type === "tool.result" && event.callId === "call-1"),
    true,
  );

  client.stop();
  await tick();
  assert.equal(harness.engine.captureStopped, true);
  assert.equal(harness.engine.left, true);
  assert.equal(harness.destroyed(), harness.engine);
});

test("duplicate and unknown RTC tool calls cannot execute V twice", async () => {
  const harness = makeHarness();
  const client = new VolcengineRtcManagedRoomClient(makeSession(), harness.context, {
    loadSdk: async () => harness.sdk,
  });
  await client.start();
  client.activate();
  const toolPayload = (id, name) => ({
    userId: "xiaohe",
    message: encodeRtcTlv(
      "tool",
      JSON.stringify({ tool_calls: [{ id, function: { name, arguments: "{}" } }] }),
    ),
  });
  harness.engine.emit("binary", toolPayload("same", "openclaw_agent_control"));
  harness.engine.emit("binary", toolPayload("same", "openclaw_agent_control"));
  harness.engine.emit("binary", toolPayload("unknown", "delete_everything"));
  await tick();
  await tick();
  assert.equal(harness.toolCalls.length, 1);
  assert.equal(harness.engine.sent.length, 2);
  const unknown = JSON.parse(decodeRtcTlv(harness.engine.sent[1].message).value);
  assert.match(unknown.Content, /not available/u);
  client.stop();
});

test("RTC errors stay visible instead of being overwritten by idle", async () => {
  const harness = makeHarness();
  const client = new VolcengineRtcManagedRoomClient(makeSession(), harness.context, {
    loadSdk: async () => harness.sdk,
  });
  await client.start();
  harness.engine.emit("error", { errorCode: 1001 });
  assert.deepEqual(harness.statuses.at(-1), ["error", "1001"]);
});
