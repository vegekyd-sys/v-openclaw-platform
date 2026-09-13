import { randomUUID } from "node:crypto";

export const SEEDUPLEX_MODEL = "1.2.6.1";
export const SEEDUPLEX_UPSTREAM =
  "wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue";
export const SEEDUPLEX_RESOURCE_ID = "volc.speech.dialog";
export const SEEDUPLEX_VOICES = Object.freeze({
  xiaohe: "zh_female_xiaohe_uranus_bigtts",
  companion: "zh_female_jiaochuannv_uranus_bigtts",
});

const INPUT_FRAME_BYTES = 640;
const MAX_PENDING_INPUT_BYTES = 16_000 * 2 * 10;
const MAX_TOOL_CALLS = 100;
const MAX_TOOL_RESULT_BYTES = 32_000;
const MAX_CONSULT_RESULT_CHARS = 8_000;
const MAX_UPSTREAM_MESSAGE_BYTES = 1_048_576;

function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function resolveSeeduplexApiKey(providerConfig = {}, env = process.env) {
  return (
    optionalString(providerConfig.apiKey) ??
    optionalString(env.VOLCENGINE_REALTIME_API_KEY) ??
    optionalString(env.DOUBAO_SPEECH_API_KEY) ??
    optionalString(env.VOLCENGINE_TTS_API_KEY)
  );
}

export function resolveSeeduplexVoice(value) {
  const normalized = optionalString(value)?.toLowerCase() ?? "xiaohe";
  const speaker = SEEDUPLEX_VOICES[normalized];
  if (!speaker) {
    throw new Error(`Unsupported Seeduplex voice: ${normalized}`);
  }
  return { id: normalized, speaker };
}

export function buildSeeduplexSession(providerConfig, request) {
  const model = optionalString(providerConfig.model) ?? SEEDUPLEX_MODEL;
  if (model !== SEEDUPLEX_MODEL) {
    throw new Error(`Unsupported Seeduplex model: ${model}`);
  }
  const voice = resolveSeeduplexVoice(providerConfig.voice);
  const tools = (request.tools ?? []).map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
  return {
    type: "session.create",
    session: {
      model,
      instructions: request.instructions,
      audio: {
        input: { format: { type: "pcm", rate: 16_000 } },
        output: {
          format: { type: "pcm", rate: 24_000 },
          voice: voice.speaker,
          speed: 0,
          loudness: 0,
        },
      },
      tools,
    },
  };
}

/** Downsample signed PCM16LE from 24 kHz to 16 kHz while preserving chunk state. */
export class Pcm24To16Resampler {
  #pending = [];

  push(audio) {
    if (!Buffer.isBuffer(audio) || audio.length % 2 !== 0) {
      throw new Error("Seeduplex input must be PCM16LE");
    }
    for (let offset = 0; offset < audio.length; offset += 2) {
      this.#pending.push(audio.readInt16LE(offset));
    }
    const groups = Math.floor(this.#pending.length / 3);
    const output = Buffer.allocUnsafe(groups * 4);
    for (let group = 0; group < groups; group += 1) {
      const base = group * 3;
      output.writeInt16LE(this.#pending[base], group * 4);
      output.writeInt16LE(
        Math.round((this.#pending[base + 1] + this.#pending[base + 2]) / 2),
        group * 4 + 2,
      );
    }
    if (groups) this.#pending.splice(0, groups * 3);
    return output;
  }
}

/** The pinned service labels output as PCM but sends float32 little-endian. */
export function decodeSeeduplexFloat32Pcm(encoded) {
  if (typeof encoded !== "string") throw new Error("Invalid Seeduplex audio frame");
  const input = Buffer.from(encoded, "base64");
  if (!input.length || input.length % 4 !== 0 || input.length > 480_000) {
    throw new Error("Invalid Seeduplex audio frame");
  }
  const output = Buffer.allocUnsafe(input.length / 2);
  for (let offset = 0; offset < input.length; offset += 4) {
    const sample = input.readFloatLE(offset);
    if (!Number.isFinite(sample)) throw new Error("Invalid Seeduplex audio sample");
    const bounded = Math.max(-1, Math.min(1, sample));
    output.writeInt16LE(
      bounded < 0 ? Math.round(bounded * 32768) : Math.round(bounded * 32767),
      offset / 2,
    );
  }
  return output;
}

async function createDefaultWebSocket(url, options) {
  // production-worker is a sibling of the pinned OpenClaw runtime. Keeping the
  // dependency inside that runtime avoids a second, independently drifting ws.
  const { WebSocket } = await import("../openclaw/node_modules/ws/wrapper.mjs");
  return new WebSocket(url, options);
}

function serializeToolResult(result) {
  const text = typeof result === "string" ? result : JSON.stringify(result);
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_TOOL_RESULT_BYTES) {
    throw new Error("Seeduplex tool result is too large");
  }
  return text;
}

export function buildSeeduplexAgentConsultPrompt(args = {}) {
  const question =
    optionalString(args.question) ??
    optionalString(args.prompt) ??
    optionalString(args.query) ??
    optionalString(args.task) ??
    optionalString(args.request);
  if (!question) throw new Error("Seeduplex agent consult requires a question");
  const context = optionalString(args.context);
  const responseStyle = optionalString(args.responseStyle);
  const confirmationId = optionalString(args.confirmationId);
  return [
    "Live voice request during a Gateway-relay Talk session.",
    "Act as the configured OpenClaw agent for this user. Use available tools when the request asks you to do work.",
    "Return only the concise terminal result that the realtime voice agent should speak. Preserve failures, limits, numbers, and pending approvals.",
    responseStyle ? `Spoken style: ${responseStyle}` : undefined,
    context ? `Additional realtime context:\n${context}` : undefined,
    confirmationId ? `Server-issued voice confirmation id: ${confirmationId}` : undefined,
    `User request:\n${question}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildAgentConsultProviderResult(result) {
  const text = optionalString(result?.text);
  if (!text) {
    return {
      error: "The OpenClaw agent consult ended without a confirmed result. Do not claim success.",
    };
  }
  return { result: text.slice(0, MAX_CONSULT_RESULT_CHARS) };
}

function spokenToolResult(result) {
  if (typeof result === "string") return optionalString(result);
  if (!result || typeof result !== "object" || Array.isArray(result)) return undefined;
  return (
    optionalString(result.result) ??
    optionalString(result.text) ??
    (optionalString(result.error)
      ? `OpenClaw Agent 没有完成：${optionalString(result.error)}`
      : undefined)
  );
}

export class SeeduplexRealtimeVoiceBridge {
  constructor(request, options = {}) {
    this.request = request;
    this.options = options;
    this.socket = null;
    this.connected = false;
    this.ready = false;
    this.terminal = false;
    this.closeNotified = false;
    this.resampler = new Pcm24To16Resampler();
    this.pendingInput = Buffer.alloc(0);
    this.toolBatches = [];
    this.seenToolCalls = new Set();
    this.pendingToolCalls = new Map();
    this.completedResponses = new Set();
    this.connectPromise = null;
    this.connectResolve = null;
    this.connectReject = null;
    this.connectTimer = null;
    this.abortController = new AbortController();
    this.skipNextResponseDone = false;
    this.supportsToolResultContinuation = true;
    this.supportsToolResultSuppression = false;
  }

  connect() {
    if (this.terminal) return Promise.reject(new Error("Seeduplex session is closed"));
    if (this.ready) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = new Promise((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
    });
    void this.#open();
    return this.connectPromise;
  }

  async #open() {
    const apiKey = resolveSeeduplexApiKey(this.request.providerConfig, this.options.env);
    if (!apiKey) return this.#fail(new Error("Seeduplex API key missing"));
    try {
      const createWebSocket = this.options.createWebSocket ?? createDefaultWebSocket;
      const socket = await createWebSocket(
        this.options.upstream ?? SEEDUPLEX_UPSTREAM,
        {
          headers: {
            "X-Api-Key": apiKey,
            "X-Api-Resource-Id": SEEDUPLEX_RESOURCE_ID,
            "X-Api-Connect-Id": randomUUID(),
          },
          handshakeTimeout: 15_000,
          maxPayload: MAX_UPSTREAM_MESSAGE_BYTES,
          perMessageDeflate: false,
        },
      );
      if (this.terminal) {
        socket.close();
        return;
      }
      this.socket = socket;
      this.connectTimer = setTimeout(
        () => this.#fail(new Error("Seeduplex session setup timed out")),
        this.options.connectTimeoutMs ?? 20_000,
      );
      socket.on("open", () => {
        if (this.terminal) return;
        this.connected = true;
        try {
          this.#send(buildSeeduplexSession(this.request.providerConfig, this.request));
        } catch (error) {
          this.#fail(error instanceof Error ? error : new Error("Invalid Seeduplex session"));
        }
      });
      socket.on("message", (data, binary) => this.#onMessage(data, binary));
      socket.on("unexpected-response", (_request, response) => {
        response.resume?.();
        const status = Number(response.statusCode);
        this.#fail(
          new Error(
            status === 401 || status === 403
              ? "Seeduplex credential is not enabled for volc.speech.dialog"
              : status === 429
                ? "Seeduplex rate limit exceeded"
                : "Seeduplex upstream rejected the session",
          ),
        );
      });
      socket.on("error", () => this.#fail(new Error("Seeduplex upstream connection failed")));
      socket.on("close", () => {
        if (!this.terminal) this.#fail(new Error("Seeduplex upstream connection closed"));
        else this.#notifyClose("completed");
      });
    } catch {
      this.#fail(new Error("Seeduplex upstream connection failed"));
    }
  }

  sendAudio(audio) {
    if (this.terminal) return;
    const converted = this.resampler.push(audio);
    if (!converted.length) return;
    this.pendingInput = Buffer.concat([this.pendingInput, converted]);
    if (this.pendingInput.length > MAX_PENDING_INPUT_BYTES) {
      this.#fail(new Error("Seeduplex pending input audio overflow"));
      return;
    }
    while (this.ready && this.pendingInput.length >= INPUT_FRAME_BYTES) {
      const frame = this.pendingInput.subarray(0, INPUT_FRAME_BYTES);
      this.pendingInput = this.pendingInput.subarray(INPUT_FRAME_BYTES);
      this.#send({ type: "input_audio_buffer.append", audio: frame.toString("base64") });
    }
  }

  setMediaTimestamp(_timestamp) {}

  sendUserMessage(text) {
    const normalized = optionalString(text);
    if (!normalized || !this.ready) return;
    this.#send({
      type: "conversation.item.create",
      items: [{ role: "user", content: [{ type: "input_text", text: normalized }] }],
    });
  }

  triggerGreeting(instructions) {
    this.sendUserMessage(
      optionalString(instructions) ?? "Start the call now. Greet the caller naturally and briefly.",
    );
  }

  handleBargeIn() {
    if (this.ready) this.#send({ type: "response.cancel" });
  }

  submitToolResult(callId, result, options = {}) {
    if (options.suppressResponse) {
      throw new Error("Seeduplex does not support suppressed tool results");
    }
    const batch = this.pendingToolCalls.get(callId);
    if (!batch) {
      const continuing = this.toolBatches.find(
        (candidate) => candidate.continuing && candidate.ids.includes(callId),
      );
      if (continuing) {
        if (options.willContinue || continuing.finalResults.has(callId)) return;
        const text = spokenToolResult(result);
        continuing.finalResults.set(
          callId,
          text ?? "OpenClaw Agent 没有返回可以播报的结果。",
        );
        this.#dispatchContinuedResult(continuing);
        return;
      }
      if (this.seenToolCalls.has(callId)) return;
      throw new Error(`Unknown Seeduplex tool call: ${callId}`);
    }
    if (batch.results.has(callId)) return;
    batch.results.set(callId, {
      call_id: callId,
      role: "tool",
      content: [{ type: "input_text", text: serializeToolResult(result) }],
    });
    if (batch.results.size !== batch.ids.length) return;
    batch.continuing = options.willContinue === true;
    this.#send({
      type: "conversation.item.create",
      event_id: `event_${randomUUID()}`,
      items: batch.ids.map((id) => batch.results.get(id)),
    });
    for (const id of batch.ids) this.pendingToolCalls.delete(id);
    if (batch.continuing) {
      batch.finalResults = new Map();
      batch.phase = "waiting-working-audio";
    } else {
      this.toolBatches.splice(this.toolBatches.indexOf(batch), 1);
    }
  }

  #dispatchContinuedResult(batch) {
    if (
      batch.phase !== "waiting-finals" ||
      batch.finalResults.size !== batch.ids.length
    ) {
      return;
    }
    const text = batch.ids
      .map((id) => batch.finalResults.get(id))
      .filter(Boolean)
      .join("\n")
      .slice(0, MAX_CONSULT_RESULT_CHARS);
    batch.phase = "waiting-final-audio";
    batch.spokenText = text;
    this.request.onTranscript?.("assistant", text, true);
    this.#send({
      type: "speech_text_buffer.commit",
      event_id: `event_${randomUUID()}`,
      text,
    });
  }

  acknowledgeMark(_markName) {}

  close() {
    if (this.terminal) return;
    this.terminal = true;
    this.ready = false;
    this.abortController.abort(new Error("Seeduplex session closed"));
    clearTimeout(this.connectTimer);
    if (this.socket?.readyState === 1) {
      this.#send({ type: "session.close" });
      setTimeout(() => this.socket?.close(), 1_000).unref?.();
    } else {
      this.socket?.close();
      this.#notifyClose("completed");
    }
    this.connectResolve?.();
  }

  isConnected() {
    return this.connected && this.ready && !this.terminal;
  }

  #send(event) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(event));
  }

  #onMessage(data, binary) {
    if (this.terminal) return;
    if (binary) return this.#fail(new Error("Invalid Seeduplex upstream event"));
    let event;
    try {
      event = JSON.parse(data.toString());
    } catch {
      return this.#fail(new Error("Invalid Seeduplex upstream event"));
    }
    const type = event?.type;
    if (type === "error") return this.#fail(new Error("Seeduplex upstream session failed"));
    if (type === "session.created") {
      this.ready = true;
      clearTimeout(this.connectTimer);
      this.connectResolve?.();
      this.request.onReady?.();
      while (this.pendingInput.length >= INPUT_FRAME_BYTES) {
        const frame = this.pendingInput.subarray(0, INPUT_FRAME_BYTES);
        this.pendingInput = this.pendingInput.subarray(INPUT_FRAME_BYTES);
        this.#send({ type: "input_audio_buffer.append", audio: frame.toString("base64") });
      }
      return;
    }
    if (type === "session.closed") {
      this.terminal = true;
      this.ready = false;
      this.socket?.close();
      this.#notifyClose("completed");
      return;
    }
    if (
      type === "conversation.item.input_audio_transcription.started" ||
      type === "response.canceled"
    ) {
      this.request.onClearAudio?.("barge-in");
    }
    if (type === "conversation.item.input_audio_transcription.completed") {
      const text = optionalString(event.transcript) ?? optionalString(event.text);
      if (text) this.request.onTranscript?.("user", text, true);
    }
    if (type === "response.output_text.delta" && typeof event.delta === "string") {
      this.request.onTranscript?.("assistant", event.delta, false);
    }
    if (type === "response.output_text.done" && typeof event.text === "string") {
      this.request.onTranscript?.("assistant", event.text, true);
    }
    if (type === "response.output_audio.delta" && typeof event.delta === "string") {
      try {
        const audio = decodeSeeduplexFloat32Pcm(event.delta);
        this.request.onAudio(audio);
        this.request.onMark?.(`seeduplex-audio-${randomUUID()}`);
      } catch {
        return this.#fail(new Error("Invalid Seeduplex audio output"));
      }
    }
    if (type === "response.output_audio.done") {
      const continuing = this.toolBatches.find(
        (batch) =>
          batch.continuing &&
          (batch.phase === "waiting-working-audio" || batch.phase === "waiting-final-audio"),
      );
      if (continuing?.phase === "waiting-working-audio") {
        continuing.phase = "waiting-finals";
        this.#dispatchContinuedResult(continuing);
      } else if (continuing?.phase === "waiting-final-audio") {
        continuing.phase = "completed";
        this.toolBatches.splice(this.toolBatches.indexOf(continuing), 1);
        this.skipNextResponseDone = true;
        this.#onResponseDone({ status: "completed", responseId: event.response_id });
      } else {
        this.#onResponseDone({ status: "completed", responseId: event.response_id });
      }
    } else if (type === "response.done") {
      if (this.skipNextResponseDone) {
        this.skipNextResponseDone = false;
      } else {
        const hasOpenContinuation = this.toolBatches.some(
          (batch) => batch.continuing && batch.phase !== "completed",
        );
        if (!hasOpenContinuation) {
          this.#onResponseDone({
            status: "completed",
            responseId: event.response_id ?? optionalString(event.response?.id),
          });
        }
      }
    } else if (type === "response.canceled") {
      this.#onResponseDone({
        status: "cancelled",
        responseId: event.response_id,
        reason: "barge-in",
      });
    }
    if (type === "response.function_call_arguments.done") this.#onToolCalls(event.items);
    // Completion is emitted only through the typed onResponseDone callback.
    // Forwarding the same raw events activates OpenClaw's legacy completion
    // fallback and would end a continued Agent turn after the working audio.
    if (type !== "response.done" && type !== "response.output_audio.done") {
      this.request.onEvent?.({
        direction: "server",
        type: typeof type === "string" ? type : "unknown",
        responseId: optionalString(event.response_id),
      });
    }
  }

  #onToolCalls(items) {
    if (!Array.isArray(items) || !items.length) return;
    const allowed = new Set((this.request.tools ?? []).map((tool) => tool.name));
    const calls = [];
    for (const item of items) {
      const callId = optionalString(item?.call_id);
      const name = optionalString(item?.name);
      if (!callId || !name || !allowed.has(name) || this.seenToolCalls.has(callId)) {
        return this.#fail(new Error("Invalid Seeduplex tool call"));
      }
      let args;
      try {
        args = JSON.parse(item.arguments);
      } catch {
        return this.#fail(new Error("Invalid Seeduplex tool call"));
      }
      calls.push({ callId, name, args });
    }
    if (this.seenToolCalls.size + calls.length > MAX_TOOL_CALLS) {
      return this.#fail(new Error("Seeduplex tool-call session limit exceeded"));
    }
    const batch = {
      ids: calls.map((call) => call.callId),
      results: new Map(),
      continuing: false,
      finalResults: new Map(),
      phase: "collecting",
    };
    this.toolBatches.push(batch);
    for (const call of calls) {
      this.seenToolCalls.add(call.callId);
      this.pendingToolCalls.set(call.callId, batch);
      this.request.onToolCall?.({
        itemId: call.callId,
        callId: call.callId,
        name: call.name,
        args: call.args,
      });
      if (
        call.name === "openclaw_agent_consult" &&
        typeof this.request.runAgentConsult === "function"
      ) {
        void this.#runAgentConsult(call);
      }
    }
  }

  async #runAgentConsult(call) {
    try {
      const result = await this.request.runAgentConsult({
        prompt: buildSeeduplexAgentConsultPrompt(call.args),
        signal: this.abortController.signal,
      });
      if (this.terminal || this.abortController.signal.aborted) return;
      this.submitToolResult(call.callId, buildAgentConsultProviderResult(result));
    } catch {
      if (this.terminal || this.abortController.signal.aborted) return;
      this.submitToolResult(call.callId, {
        error: "The OpenClaw agent consult failed. Tell the user it did not complete.",
      });
    }
  }

  #onResponseDone(outcome) {
    const key = optionalString(outcome.responseId) ?? "active-response";
    if (this.completedResponses.has(key)) return;
    if (this.completedResponses.size >= MAX_TOOL_CALLS) {
      this.completedResponses.delete(this.completedResponses.values().next().value);
    }
    this.completedResponses.add(key);
    this.request.onResponseDone?.(outcome);
  }

  #fail(error) {
    if (this.terminal) return;
    this.terminal = true;
    this.ready = false;
    this.abortController.abort(error);
    clearTimeout(this.connectTimer);
    this.connectReject?.(error);
    try {
      this.request.onError?.(error);
    } finally {
      this.#notifyClose("error");
      this.socket?.close();
    }
  }

  #notifyClose(reason) {
    if (this.closeNotified) return;
    this.closeNotified = true;
    this.request.onClose?.(reason);
  }
}

export function buildSeeduplexRealtimeVoiceProvider(options = {}) {
  return {
    id: "seeduplex",
    label: "Volcengine Seeduplex 3.0",
    aliases: ["volcengine", "doubao"],
    defaultModel: SEEDUPLEX_MODEL,
    models: [SEEDUPLEX_MODEL],
    voices: Object.keys(SEEDUPLEX_VOICES),
    autoSelectOrder: 30,
    capabilities: {
      transports: ["gateway-relay"],
      inputAudioFormats: [{ encoding: "pcm16", sampleRateHz: 24_000, channels: 1 }],
      outputAudioFormats: [{ encoding: "pcm16", sampleRateHz: 24_000, channels: 1 }],
      supportsBrowserSession: false,
      supportsBargeIn: true,
      handlesInputAudioBargeIn: true,
      supportsToolCalls: true,
      supportsVideoFrames: false,
      supportsSessionResumption: false,
    },
    resolveConfig: ({ rawConfig }) => ({
      ...rawConfig,
      model: optionalString(rawConfig.model) ?? SEEDUPLEX_MODEL,
      voice: optionalString(rawConfig.voice) ?? "xiaohe",
    }),
    isConfigured: ({ providerConfig }) =>
      Boolean(resolveSeeduplexApiKey(providerConfig, options.env)),
    createBridge: (request) => new SeeduplexRealtimeVoiceBridge(request, options),
  };
}
