import { GPT_LIVE_CALL_INSTRUCTIONS } from "./gpt-live-h5/instructions.mjs";

/** This is a code profile for the native browser client, not global Talk config. */
export function isGptLiveCallProfile({ providerId, model, transport, brain, capabilities } = {}) {
  return providerId === "openai" && model === "gpt-live-1-codex" &&
    (transport ?? "webrtc") === "webrtc" && brain === "agent-consult" &&
    capabilities?.handlesAgentConsult === true && capabilities?.supportsToolCalls === false;
}

export function resolveGptLiveCallInstructions(original, profile) {
  if (!isGptLiveCallProfile(profile)) return original;
  // The exact native client profile owns this contract. Appending older global
  // instructions could reintroduce conflicting delegation or final policies.
  return GPT_LIVE_CALL_INSTRUCTIONS;
}

/** Native delegation is the supported client tool surface. Never parse USER text. */
export function parseGptLiveEndCallDelegation(prompt) {
  if (typeof prompt !== "string" || prompt.length > 1024) return false;
  let value;
  try { value = JSON.parse(prompt); } catch { return false; }
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === 2 && value.name === "openclaw_end_call" &&
    Object.hasOwn(value, "arguments") && value.arguments !== null &&
    typeof value.arguments === "object" && !Array.isArray(value.arguments) &&
    Object.keys(value.arguments).length === 0;
}

/** All callbacks are session-local host closures. No ownership comes from JSON. */
export function createGptLiveCallLifecycle(options) {
  let started = false, greetingRequested = false, closed = false;
  const endedRequestIds = new Set();
  const assertCurrent = () => {
    if (closed || options.signal?.aborted || options.isCurrent?.() !== true) throw new Error("GPT Live call is no longer active");
  };
  const emit = (type, requestId, payload, originUserTurnId) => {
    assertCurrent();
    options.onToolEvent({ type, callId: requestId, payload: { name: "openclaw_end_call", requestId,
      ...(originUserTurnId ? { originUserTurnId } : {}), ...payload } });
  };
  return {
    started() { if (!closed && !options.signal?.aborted) started = true; },
    ready() {
      assertCurrent();
      if (!started) throw new Error("GPT Live native session is not ready");
      if (!greetingRequested) {
        // Same supported frame as the native bridge's triggerGreeting method.
        const sent = options.sendSessionContext("通话音频已经就绪。现在用一句简短中文主动问候用户并邀请他说话，然后安静听；不要委托后台，不重复问候。");
        if (sent !== true) throw new Error("GPT Live greeting could not be requested");
        greetingRequested = true;
      }
      return { ok: true, greetingRequested: true };
    },
    handleDelegation(id, prompt, userBidiTurnId) {
      if (!parseGptLiveEndCallDelegation(prompt)) return false;
      assertCurrent();
      if (!started || typeof id !== "string" || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(id)) throw new Error("Invalid GPT Live end-call delegation");
      if (endedRequestIds.has(id)) return true;
      endedRequestIds.add(id);
      if (endedRequestIds.size > 256) endedRequestIds.delete(endedRequestIds.values().next().value);
      // Observed native envelope identity only; never take a turn id from the
      // tool's JSON arguments or manufacture one when the provider omits it.
      const originUserTurnId = typeof userBidiTurnId === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(userBidiTurnId) ? userBidiTurnId : undefined;
      try {
        emit("tool.call", id, { args: {} }, originUserTurnId);
        // Acceptance reaches the browser before goodbye can start. It is not a
        // claim that audio drained or the transport has closed.
        emit("tool.result", id, { status: "accepted", closeAfterPlayback: true }, originUserTurnId);
        assertCurrent();
        if (options.sendDelegationContext(id, "openclaw_end_call 已被当前通话接受。现在用一句简短中文向用户告别，不委托后台、不继续旧话题；客户端会在这句语音实际播完后结束通话。") !== true) throw new Error("GPT Live goodbye could not be requested");
      } catch (error) {
        // Best effort failure notice clears browser ending; never close here.
        try { emit("tool.error", id, { message: "GPT Live goodbye could not be requested" }, originUserTurnId); } catch {}
        options.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
      return true;
    },
    close() { closed = true; endedRequestIds.clear(); },
  };
}

export function createGptLiveCallLifecycleRuntimeSource() {
  return `// gpt-live-call-lifecycle-v1: native browser call controls\nconst GPT_LIVE_CALL_INSTRUCTIONS = ${JSON.stringify(GPT_LIVE_CALL_INSTRUCTIONS)};\n` +
    [isGptLiveCallProfile, resolveGptLiveCallInstructions, parseGptLiveEndCallDelegation, createGptLiveCallLifecycle]
      .map((fn) => "export " + fn.toString()).join("\n\n") + "\n";
}
