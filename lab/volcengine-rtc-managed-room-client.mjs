export const VOLC_RTC_SDK_ASSET = "./volcengine-rtc-4.68.1.esm.js";

const MAX_BINARY_MESSAGE_BYTES = 64 * 1024;
const TALK_TOOL_NAMES = new Set(["openclaw_agent_consult", "openclaw_agent_control"]);
const DEFAULT_STAGE_TIMEOUTS_MS = Object.freeze({
  sdk: 120_000,
  support: 15_000,
  join: 30_000,
  devices: 30_000,
  capture: 30_000,
});

function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredString(value, name) {
  const normalized = optionalString(value);
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

export function parseManagedRoomUrl(roomUrl) {
  const url = new URL(roomUrl);
  if (url.protocol !== "vertc:" || url.hostname !== "managed-room" || url.pathname !== "/join") {
    throw new Error("Invalid VolcEngine managed-room URL");
  }
  return {
    appId: requiredString(url.searchParams.get("appId"), "RTC appId"),
    roomId: requiredString(url.searchParams.get("roomId"), "RTC roomId"),
    userId: requiredString(url.searchParams.get("userId"), "RTC userId"),
    agentUserId: requiredString(url.searchParams.get("agentUserId"), "RTC agentUserId"),
    taskId: requiredString(url.searchParams.get("taskId"), "RTC taskId"),
    businessId: optionalString(url.searchParams.get("businessId")),
  };
}

export function encodeRtcTlv(type, value) {
  if (typeof type !== "string" || type.length !== 4) {
    throw new Error("RTC TLV type must contain exactly four characters");
  }
  const valueBytes = new TextEncoder().encode(value);
  if (valueBytes.length > MAX_BINARY_MESSAGE_BYTES - 8) {
    throw new Error("RTC binary message is too large");
  }
  const result = new Uint8Array(valueBytes.length + 8);
  for (let index = 0; index < 4; index += 1) result[index] = type.charCodeAt(index);
  new DataView(result.buffer).setUint32(4, valueBytes.length, false);
  result.set(valueBytes, 8);
  return result.buffer;
}

export function decodeRtcTlv(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 8) {
    throw new Error("Invalid RTC binary message");
  }
  const bytes = new Uint8Array(buffer);
  const type = new TextDecoder().decode(bytes.subarray(0, 4));
  const length = new DataView(buffer).getUint32(4, false);
  if (length > MAX_BINARY_MESSAGE_BYTES - 8 || buffer.byteLength !== length + 8) {
    throw new Error("Invalid RTC binary message length");
  }
  return { type, value: new TextDecoder().decode(bytes.subarray(8)) };
}

function normalizeSdk(module) {
  const sdk = module?.default ?? module;
  if (!sdk || typeof sdk.createEngine !== "function" || typeof sdk.destroyEngine !== "function") {
    throw new Error("VolcEngine RTC SDK failed to load");
  }
  return sdk;
}

async function loadDefaultSdk() {
  return normalizeSdk(await import(VOLC_RTC_SDK_ASSET));
}

function stageTimeoutMs(options, stage) {
  const value = Number(options.stageTimeoutsMs?.[stage] ?? DEFAULT_STAGE_TIMEOUTS_MS[stage]);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_STAGE_TIMEOUTS_MS[stage];
}

async function withStageTimeout(stage, timeoutMs, operation) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`VolcEngine RTC ${stage} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function parseToolArguments(value) {
  if (value === undefined || value === null || value === "") return {};
  if (typeof value === "object") return value;
  if (typeof value !== "string") throw new Error("Invalid RTC tool arguments");
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("RTC tool arguments must be an object");
  }
  return parsed;
}

function toolResultContent(result) {
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    if (typeof result.result === "string") return result.result;
    if (typeof result.text === "string") return result.text;
    if (typeof result.error === "string") return `OpenClaw Agent 没有完成：${result.error}`;
  }
  return JSON.stringify(result ?? null);
}

function stageStatus(code) {
  switch (Number(code)) {
    case 1:
    case 5:
      return "listening";
    case 2:
      return "thinking";
    case 3:
      return "speaking";
    case 4:
      return "listening";
    default:
      return undefined;
  }
}

/**
 * Browser-owned RTC transport. Audio never traverses the OpenClaw Gateway:
 * the official SDK captures/publishes microphone media and plays subscribed
 * agent audio, while this adapter only forwards transcripts and tool control.
 */
export class VolcengineRtcManagedRoomClient {
  constructor(session, context, options = {}) {
    this.session = session;
    this.context = context;
    this.options = options;
    this.room = parseManagedRoomUrl(session.roomUrl);
    this.sdk = null;
    this.engine = null;
    this.closed = false;
    this.activated = false;
    this.toolControllers = new Map();
    this.completedToolCalls = new Set();
    this.pendingEvents = [];
    this.eventBindings = [];
    this.onBinaryMessage = (event) => this.handleBinaryMessage(event);
    this.onError = (event) => {
      const code = event?.errorCode ?? event?.code;
      const message = optionalString(event?.message);
      console.error("[OpenClaw RTC] SDK error", code ?? "unknown", message ?? "");
      this.fail(message ? `${code ?? "RTC error"}: ${message}` : (code ?? event));
    };
  }

  async start() {
    if (!this.session.token) throw new Error("VolcEngine managed-room token is missing");
    this.closed = false;
    // The 9.1 host opens one permission-gated MediaStream before creating a
    // Talk session. RTC owns capture after this point, so release that probe
    // stream instead of keeping a second microphone track alive.
    this.context.input?.stop?.();
    try {
      console.info("[OpenClaw RTC] loading SDK");
      this.sdk = normalizeSdk(
        await withStageTimeout("SDK load", stageTimeoutMs(this.options, "sdk"), () =>
          this.options.loadSdk?.() ?? loadDefaultSdk(),
        ),
      );
      console.info("[OpenClaw RTC] SDK loaded");
      if (this.closed) return "cancelled";
      if (typeof this.sdk.isSupported === "function") {
        const supported = await withStageTimeout(
          "browser support check",
          stageTimeoutMs(this.options, "support"),
          () => this.sdk.isSupported(),
        );
        if (!supported) throw new Error("VolcEngine RTC is not supported by this browser");
      }
      this.engine = this.sdk.createEngine(this.room.appId);
      if (this.room.businessId && typeof this.engine.setBusinessId === "function") {
        this.engine.setBusinessId(this.room.businessId);
      }
      this.registerEngineEvents();
      console.info("[OpenClaw RTC] joining room");
      await withStageTimeout("room join", stageTimeoutMs(this.options, "join"), () =>
        this.engine.joinRoom(
          this.session.token,
          this.room.roomId,
          {
            userId: this.room.userId,
            extraInfo: JSON.stringify({
              call_scene: "OpenClaw-Talk",
              user_name: this.room.userId,
              user_id: this.room.userId,
            }),
          },
          {
            isAutoPublish: true,
            isAutoSubscribeAudio: true,
            roomProfileType: this.sdk.RoomProfileType?.chat ?? 0,
          },
        ),
      );
      console.info("[OpenClaw RTC] room joined");
      if (this.closed) return "cancelled";
      const inputDeviceId = await this.resolveInputDeviceId();
      console.info("[OpenClaw RTC] starting audio capture");
      await withStageTimeout("audio capture", stageTimeoutMs(this.options, "capture"), () =>
        this.engine.startAudioCapture(inputDeviceId),
      );
      console.info("[OpenClaw RTC] audio capture started");
      if (this.closed) return "cancelled";
      this.context.callbacks.onStatus?.("listening");
      return "ready";
    } catch (error) {
      if (this.closed) return "cancelled";
      const message = error instanceof Error ? error.message : String(error);
      console.error("[OpenClaw RTC] startup failed", message);
      this.context.callbacks.onStatus?.("error", message);
      this.stop({ emitIdle: false });
      throw error;
    }
  }

  registerEngineEvents() {
    const events = this.sdk.events ?? {};
    const bind = (eventName, listener) => {
      if (!eventName || typeof this.engine.on !== "function") return;
      this.engine.on(eventName, listener);
      this.eventBindings.push([eventName, listener]);
    };
    bind(events.onRoomBinaryMessageReceived ?? "onRoomBinaryMessageReceived", this.onBinaryMessage);
    bind(events.onError ?? "onError", this.onError);
    bind(events.onConnectionStateChanged, (event) => {
      console.info(
        "[OpenClaw RTC] connection state",
        event?.state ?? event?.connectionState ?? "unknown",
      );
    });
    bind(events.onUserJoined, () => console.info("[OpenClaw RTC] remote user joined"));
    bind(events.onUserPublishStream, () => console.info("[OpenClaw RTC] remote audio published"));
    bind(events.onAutoplayFailed, () => {
      console.warn("[OpenClaw RTC] autoplay failed");
      this.context.callbacks.onStatus?.(
        "error",
        "浏览器阻止了小何语音播放，请点击页面后重试语音输入",
      );
    });
  }

  async resolveInputDeviceId() {
    if (this.options.inputDeviceId) return this.options.inputDeviceId;
    if (typeof this.sdk.enableDevices === "function") {
      const permissions = await withStageTimeout(
        "microphone permission",
        stageTimeoutMs(this.options, "devices"),
        () => this.sdk.enableDevices({ audio: true, video: false }),
      );
      if (permissions?.audio === false) {
        throw new Error("Microphone permission was not granted to VolcEngine RTC");
      }
    }
    if (typeof this.sdk.enumerateAudioCaptureDevices !== "function") return undefined;
    const devices = await withStageTimeout(
      "microphone enumeration",
      stageTimeoutMs(this.options, "devices"),
      () => this.sdk.enumerateAudioCaptureDevices(),
    );
    const inputDeviceId = devices?.find((device) => device?.deviceId)?.deviceId;
    if (!inputDeviceId) throw new Error("No microphone device is available to VolcEngine RTC");
    return inputDeviceId;
  }

  activate() {
    if (this.closed || this.activated) return;
    this.activated = true;
    const events = this.pendingEvents;
    this.pendingEvents = [];
    for (const event of events) this.dispatchBinaryMessage(event);
  }

  stop(options = {}) {
    if (this.closed) return;
    this.closed = true;
    for (const controller of this.toolControllers.values()) controller.abort();
    this.toolControllers.clear();
    const engine = this.engine;
    this.engine = null;
    if (engine) {
      try {
        for (const [eventName, listener] of this.eventBindings) {
          engine.off?.(eventName, listener);
        }
        this.eventBindings = [];
        Promise.resolve(engine.stopAudioCapture?.()).catch(() => undefined);
        Promise.resolve(engine.leaveRoom?.()).catch(() => undefined);
      } finally {
        this.sdk?.destroyEngine(engine);
      }
    }
    if (options.emitIdle !== false) this.context.callbacks.onStatus?.("idle");
  }

  handleBinaryMessage(event) {
    if (this.closed || event?.userId !== this.room.agentUserId) return;
    if (!this.activated) {
      if (this.pendingEvents.length >= 64) return this.fail("RTC startup event buffer overflow");
      this.pendingEvents.push(event);
      return;
    }
    this.dispatchBinaryMessage(event);
  }

  dispatchBinaryMessage(event) {
    try {
      const { type, value } = decodeRtcTlv(event.message);
      const payload = JSON.parse(value);
      if (type === "conv") return this.handleStage(payload);
      if (type === "subv") return this.handleSubtitle(payload);
      if (type === "info") return this.handleToolNotice(payload);
      if (type === "tool") return void this.handleToolCalls(payload);
    } catch (error) {
      this.fail(error);
    }
  }

  handleStage(payload) {
    const status = stageStatus(payload?.Stage?.Code);
    if (status) this.context.callbacks.onStatus?.(status);
  }

  handleSubtitle(payload) {
    const data = payload?.data?.[0];
    const text = optionalString(data?.text);
    if (!text) return;
    const role = data.userId === this.room.userId ? "user" : "assistant";
    const final = Boolean(data.definite);
    this.context.callbacks.onTranscript?.({ role, text, final });
    this.context.callbacks.onTalkEvent?.({
      type: final ? "transcript.done" : "transcript.delta",
      payload: { role, text },
      final,
    });
  }

  handleToolNotice(payload) {
    this.context.callbacks.onTalkEvent?.({
      type: "tool.progress",
      callId: optionalString(payload?.tool_call_id),
      payload: { name: optionalString(payload?.function), phase: "provider-selected" },
      final: false,
    });
  }

  async handleToolCalls(payload) {
    const calls = Array.isArray(payload?.tool_calls) ? payload.tool_calls : [];
    for (const item of calls) {
      const callId = optionalString(item?.id);
      const name = optionalString(item?.function?.name);
      if (!callId || !name || this.completedToolCalls.has(callId) || this.toolControllers.has(callId)) {
        continue;
      }
      const controller = new AbortController();
      this.toolControllers.set(callId, controller);
      const submit = async (_callId, result) => this.submitToolResult(callId, result);
      try {
        if (!TALK_TOOL_NAMES.has(name)) {
          await submit(callId, { error: `Tool "${name}" is not available in OpenClaw Talk` });
          continue;
        }
        if (typeof this.context.executeToolCall !== "function") {
          await submit(callId, { error: "OpenClaw Talk tool bridge is unavailable" });
          continue;
        }
        await this.context.executeToolCall({
          callId,
          name,
          args: parseToolArguments(item.function.arguments),
          signal: controller.signal,
          submit,
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          await submit(callId, { error: error instanceof Error ? error.message : String(error) });
        }
      } finally {
        this.toolControllers.delete(callId);
      }
    }
  }

  async submitToolResult(callId, result) {
    if (this.closed || this.completedToolCalls.has(callId)) return;
    const content = toolResultContent(result);
    await Promise.resolve(
      this.engine.sendUserBinaryMessage(
        this.room.agentUserId,
        encodeRtcTlv("func", JSON.stringify({ ToolCallID: callId, Content: content })),
      ),
    );
    this.completedToolCalls.add(callId);
    this.context.callbacks.onTalkEvent?.({
      type: result?.error ? "tool.error" : "tool.result",
      callId,
      payload: result,
      final: true,
    });
  }

  fail(error) {
    if (this.closed) return;
    const message = error instanceof Error ? error.message : String(error);
    this.context.callbacks.onStatus?.("error", message);
    this.stop({ emitIdle: false });
  }
}
