import assert from "node:assert/strict";

export const RUNNER_FORWARD_BEFORE =
  '\t\t\tthinkLevel: talkConfig?.consultThinkingLevel,\n\t\t\tfastMode: talkConfig?.consultFastMode,\n\t\t\t...authority,';
export const RUNNER_FORWARD_AFTER =
  '\t\t\tthinkLevel: talkConfig?.consultThinkingLevel,\n\t\t\tfastMode: talkConfig?.consultFastMode,\n' +
  '\t\t\tprovider: params.provider,\n\t\t\tmodel: params.model,\n\t\t\t...authority,';

export const RELAY_MODEL_BEFORE =
  '\tconst { agentId: relayAgentId, canonicalKey } = params.sessionTarget;\n' +
  '\tconst consultRunner = createTalkClientAgentConsultRunner({\n' +
  '\t\tconfig: params.cfg ?? params.context.getRuntimeConfig(),';
export const RELAY_MODEL_AFTER =
  '\tconst { agentId: relayAgentId, canonicalKey } = params.sessionTarget;\n' +
  '\tconst configuredAgentModel = typeof params.providerConfig?.agentModel === "string" ? params.providerConfig.agentModel.trim() : "";\n' +
  '\tconst configuredAgentModelSeparator = configuredAgentModel.indexOf("/");\n' +
  '\tconst configuredAgentProvider = configuredAgentModelSeparator > 0 ? configuredAgentModel.slice(0, configuredAgentModelSeparator) : void 0;\n' +
  '\tconst configuredAgentModelId = configuredAgentModelSeparator > 0 && configuredAgentModelSeparator < configuredAgentModel.length - 1 ? configuredAgentModel.slice(configuredAgentModelSeparator + 1) : void 0;\n' +
  '\tconst consultRunner = createTalkClientAgentConsultRunner({\n' +
  '\t\tconfig: params.cfg ?? params.context.getRuntimeConfig(),\n' +
  '\t\tprovider: configuredAgentProvider,\n\t\tmodel: configuredAgentModelId,';

export const DIRECT_CONSULT_LIFECYCLE_SETUP_BEFORE =
  '\t\tconst admission = runOutsideGatewayRootWorkAdmission(tryBeginGatewayRootWorkAdmission);\n' +
  '\t\tif (!admission) throw new GatewayDrainingError();\n' +
  '\t\treturn await admission.run(() => consultRealtimeVoiceAgent({';
export const DIRECT_CONSULT_LIFECYCLE_SETUP_AFTER =
  '\t\tconst admission = runOutsideGatewayRootWorkAdmission(tryBeginGatewayRootWorkAdmission);\n' +
  '\t\tif (!admission) throw new GatewayDrainingError();\n' +
  '\t\tlet activeRunId;\n' +
  '\t\tconst emitAgentLifecycle = (type, runId, final = false) => {\n' +
  '\t\t\tif (!params.ownerConnId) return;\n' +
  '\t\t\tparams.context.broadcastToConnIds("talk.event", {\n' +
  '\t\t\t\tvoiceSessionId,\n' +
  '\t\t\t\ttalkEvent: {\n' +
  '\t\t\t\t\ttype,\n' +
  '\t\t\t\t\tcallId: runId,\n' +
  '\t\t\t\t\tpayload: { name: REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME },\n' +
  '\t\t\t\t\t...final ? { final: true } : {}\n' +
  '\t\t\t\t}\n' +
  '\t\t\t}, /* @__PURE__ */ new Set([params.ownerConnId]), { dropIfSlow: false });\n' +
  '\t\t};\n' +
  '\t\treturn await admission.run(() => consultRealtimeVoiceAgent({';

export const DIRECT_CONSULT_RUN_STARTED_BEFORE =
  '\t\t\tonRunStarted: ({ runId, sessionId, timeoutMs }) => {\n' +
  '\t\t\t\tif (params.registerRun) params.registerRun({ runId });';
export const DIRECT_CONSULT_RUN_STARTED_AFTER =
  '\t\t\tonRunStarted: ({ runId, sessionId, timeoutMs }) => {\n' +
  '\t\t\t\tactiveRunId = runId;\n' +
  '\t\t\t\temitAgentLifecycle("tool.call", runId);\n' +
  '\t\t\t\tif (params.registerRun) params.registerRun({ runId });';

export const DIRECT_CONSULT_TERMINAL_BEFORE =
  '\t\t})).finally(admission.release);';
export const DIRECT_CONSULT_TERMINAL_AFTER =
  '\t\t})).then((result) => {\n' +
  '\t\t\tif (activeRunId) emitAgentLifecycle("tool.result", activeRunId, true);\n' +
  '\t\t\treturn result;\n' +
  '\t\t}, (error) => {\n' +
  '\t\t\tif (activeRunId) emitAgentLifecycle("tool.error", activeRunId, true);\n' +
  '\t\t\tthrow error;\n' +
  '\t\t}).finally(admission.release);';

export const PLAYBACK_ONLY_CANCEL_BEFORE =
  '\tconst rootCallIds = /* @__PURE__ */ new Set([...session.activeAgentToolCalls.keys(), ...forcedConsults.map(({ handle }) => handle.id)]);\n' +
  '\tconst terminalEpoch = ++session.toolResultEpoch;';
// A playback-overflow cancellation is the browser saying its output queue is
// full, not the user interrupting. Classifying it as a real turn cancellation
// aborts the running Agent and moves output ownership to "cancelling", after
// which every further audio frame reports "no live response owner" and playback
// stops a second in. Treat it as playback-only: drop what is queued, keep the
// turn. The GPT Live One bridge makes the same distinction.
export const PLAYBACK_ONLY_CANCEL_AFTER =
  '\tconst rootCallIds = /* @__PURE__ */ new Set([...session.activeAgentToolCalls.keys(), ...forcedConsults.map(({ handle }) => handle.id)]);\n' +
  '\tconst playbackOverflowCancellation = (params.reason ?? "client-cancelled") === "playback-overflow";\n' +
  '\tconst playbackOnlyCancellation = playbackOverflowCancellation || (session.outputOwnership.phase === "unowned" && rootCallIds.size === 0);\n' +
  '\tconst terminalEpoch = ++session.toolResultEpoch;';

export const PLAYBACK_ONLY_CLEAR_BEFORE =
  '\tconst reason = params.reason ?? "client-cancelled";\n' +
  '\tif (!session.toolCalls.markCancelled([...rootCallIds, ...forcedConsults.flatMap(({ nativeCallIds }) => nativeCallIds)], turnId)) throw new Error("Realtime relay cancellation could not record tool state");';
export const PLAYBACK_ONLY_CLEAR_AFTER =
  '\tconst reason = params.reason ?? "client-cancelled";\n' +
  '\tif (playbackOnlyCancellation) {\n' +
  '\t\t// A full playback queue must not end the turn. cancelTurn clears\n' +
  '\t\t// activeTurnId, and the audio still streaming then resolves against no\n' +
  '\t\t// active turn, which is the same "no live response owner" failure by a\n' +
  '\t\t// different route. Overflow only needs the client to drop what it has\n' +
  '\t\t// queued, and it must not lose what is already queued either.\n' +
  '\t\tconst cancelled = playbackOverflowCancellation ? void 0 : session.harness.talk.cancelTurn({\n' +
  '\t\t\tturnId,\n' +
  '\t\t\tpayload: { reason }\n' +
  '\t\t});\n' +
  '\t\t// Clearing tells the client to drop everything already queued. On an\n' +
  '\t\t// overflow that queue is exactly the audio the user has not heard yet,\n' +
  '\t\t// so clearing turns a full buffer into a hole in the middle of the\n' +
  '\t\t// reply. The frame that overflowed is already refused by the client.\n' +
  '\t\tif (!playbackOverflowCancellation) broadcastToOwner$1(session.context, session.connId, {\n' +
  '\t\t\trelaySessionId: session.id,\n' +
  '\t\t\ttype: "clear",\n' +
  '\t\t\ttalkEvent: cancelled?.ok ? cancelled.event : void 0\n' +
  '\t\t});\n' +
  '\t\treturn {\n' +
  '\t\t\tstatus: "applied",\n' +
  '\t\t\tturnId\n' +
  '\t\t};\n' +
  '\t}\n' +
  '\tif (!session.toolCalls.markCancelled([...rootCallIds, ...forcedConsults.flatMap(({ nativeCallIds }) => nativeCallIds)], turnId)) throw new Error("Realtime relay cancellation could not record tool state");';

export const CANCEL_DRAIN_TIMEOUT_BEFORE =
  '\tconst closeAfterCancellation = () => {\n' +
  '\t\tif (relaySessions.get(session.id) === session && session.toolResultEpoch === terminalEpoch && session.outputOwnership.phase === "cancelling") {\n' +
  '\t\t\tsession.outputOwnership.drain?.resolve();\n' +
  '\t\t\tcloseRelaySession(session, "completed");\n' +
  '\t\t}\n' +
  '\t};\n' +
  '\tsetTimeout(closeAfterCancellation, TURN_BOUND_CANCELLATION_DRAIN_MS).unref?.();';
export const CANCEL_DRAIN_TIMEOUT_AFTER =
  '\tconst finishCancellationAfterProviderTimeout = () => {\n' +
  '\t\tif (relaySessions.get(session.id) === session && session.toolResultEpoch === terminalEpoch && session.outputOwnership.phase === "cancelling") {\n' +
  '\t\t\t// Retire the cancelled generation before releasing queued input. Leaving\n' +
  '\t\t\t// phase=cancelling with an already-resolved drain recursively requeues\n' +
  '\t\t\t// every audio frame and eventually exhausts the Gateway heap.\n' +
  '\t\t\tsession.outputOwnership.finish(session.outputOwnership.responseId, true);\n' +
  '\t\t}\n' +
  '\t};\n' +
  '\tsetTimeout(finishCancellationAfterProviderTimeout, TURN_BOUND_CANCELLATION_DRAIN_MS).unref?.();';

export const CANCEL_SUPPRESSION_RESET_BEFORE =
  '\t\tonTranscript: (role, text, final) => {\n' +
  '\t\t\tconst relay = getActiveRelay();\n' +
  '\t\t\tif (!relay) return;\n' +
  '\t\t\tif (role === "assistant" && outputOwnership.phase === "cancelling") return;';
export const CANCEL_SUPPRESSION_RESET_AFTER =
  '\t\tonTranscript: (role, text, final) => {\n' +
  '\t\t\tconst relay = getActiveRelay();\n' +
  '\t\t\tif (!relay) return;\n' +
  '\t\t\tif (role === "user" && final && outputOwnership.phase === "cancelling") outputOwnership.finish(outputOwnership.responseId, true);\n' +
  '\t\t\tif (role === "assistant" && outputOwnership.phase === "cancelling") return;';

export const OUTPUT_OWNERSHIP_FINISH_BEFORE =
  '\t\tObject.assign(this, {\n' +
  '\t\t\tphase: "unowned",\n' +
  '\t\t\tturnId: void 0,\n' +
  '\t\t\tresponseId: void 0\n' +
  '\t\t});';
export const OUTPUT_OWNERSHIP_FINISH_AFTER =
  '\t\tObject.assign(this, {\n' +
  '\t\t\tmode: "turn-bound",\n' +
  '\t\t\tphase: "unowned",\n' +
  '\t\t\tturnId: void 0,\n' +
  '\t\t\tresponseId: void 0\n' +
  '\t\t});';

export const OUTPUT_OWNERSHIP_CONTINUITY_BEFORE =
  '\t\t\t\toutputOwnership.drain?.resolve();\n' +
  '\t\t\t\toutputOwnership.phase = "unowned";\n' +
  '\t\t\t\toutputOwnership.turnId = outputOwnership.responseId = void 0;';
export const OUTPUT_OWNERSHIP_CONTINUITY_AFTER =
  '\t\t\t\toutputOwnership.drain?.resolve();\n' +
  '\t\t\t\toutputOwnership.mode = "turn-bound";\n' +
  '\t\t\t\toutputOwnership.phase = "unowned";\n' +
  '\t\t\t\toutputOwnership.turnId = outputOwnership.responseId = void 0;';

const count = (source, needle) => source.split(needle).length - 1;
function replaceExactlyOnce(source, before, after, label) {
  if (source.includes(after)) {
    assert.equal(count(source, after), 1, `${label} patched anchor is ambiguous`);
    assert.equal(count(source, before), 0, `${label} is partially patched`);
    return source;
  }
  assert.equal(count(source, before), 1, `${label} anchor drifted`);
  return source.replace(before, after);
}

export function patchRealtimeTalkConsultModel(source) {
  assert.equal(typeof source, "string", "Talk runtime must be text");
  let patched = replaceExactlyOnce(
    source,
    RUNNER_FORWARD_BEFORE,
    RUNNER_FORWARD_AFTER,
    "Talk consult runner model forwarding",
  );
  patched = replaceExactlyOnce(
    patched,
    RELAY_MODEL_BEFORE,
    RELAY_MODEL_AFTER,
    "Talk relay provider agent model",
  );
  patched = replaceExactlyOnce(
    patched,
    DIRECT_CONSULT_LIFECYCLE_SETUP_BEFORE,
    DIRECT_CONSULT_LIFECYCLE_SETUP_AFTER,
    "Talk direct consult lifecycle setup",
  );
  patched = replaceExactlyOnce(
    patched,
    DIRECT_CONSULT_RUN_STARTED_BEFORE,
    DIRECT_CONSULT_RUN_STARTED_AFTER,
    "Talk direct consult start event",
  );
  patched = replaceExactlyOnce(
    patched,
    DIRECT_CONSULT_TERMINAL_BEFORE,
    DIRECT_CONSULT_TERMINAL_AFTER,
    "Talk direct consult terminal event",
  );
  patched = replaceExactlyOnce(
    patched,
    PLAYBACK_ONLY_CANCEL_BEFORE,
    PLAYBACK_ONLY_CANCEL_AFTER,
    "Talk playback-only cancellation classification",
  );
  patched = replaceExactlyOnce(
    patched,
    PLAYBACK_ONLY_CLEAR_BEFORE,
    PLAYBACK_ONLY_CLEAR_AFTER,
    "Talk playback-only cancellation handling",
  );
  patched = replaceExactlyOnce(
    patched,
    CANCEL_DRAIN_TIMEOUT_BEFORE,
    CANCEL_DRAIN_TIMEOUT_AFTER,
    "Talk cancellation drain timeout",
  );
  patched = replaceExactlyOnce(
    patched,
    CANCEL_SUPPRESSION_RESET_BEFORE,
    CANCEL_SUPPRESSION_RESET_AFTER,
    "Talk cancellation suppression reset",
  );
  patched = replaceExactlyOnce(
    patched,
    OUTPUT_OWNERSHIP_FINISH_BEFORE,
    OUTPUT_OWNERSHIP_FINISH_AFTER,
    "Talk completed output ownership reset",
  );
  patched = replaceExactlyOnce(
    patched,
    OUTPUT_OWNERSHIP_CONTINUITY_BEFORE,
    OUTPUT_OWNERSHIP_CONTINUITY_AFTER,
    "Talk continuity output ownership reset",
  );
  return patched;
}
