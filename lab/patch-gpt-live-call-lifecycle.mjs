import assert from "node:assert/strict";

export const GPT_LIVE_CALL_BROKER_BEFORE = "0f98f3d3a6cf947106f9bc0ae589d34571f822b0407c57cf38bb08e4fa0379ee";

function once(source, before, after, label) {
  assert.equal(source.split(before).length - 1, 1, `${label} must occur exactly once`);
  return source.replace(before, after);
}

export function patchGptLiveCallLifecycleController(source) {
  const marker = "// gpt-live-call-lifecycle-controller-v1";
  if (source.includes(marker)) return source;
  source = once(source, "\t\tthis.stopped = false;", `\t\tthis.stopped = false;
\t\tthis.callLifecycle = options.callLifecycle === true ? createGptLiveCallLifecycle({
\t\t\tsignal: options.signal,
\t\t\tisCurrent: () => !this.stopped && !options.signal.aborted,
\t\t\tonToolEvent: (event) => options.onCallLifecycleEvent(event),
\t\t\tonError: (error) => options.onError?.(error),
\t\t\tsendSessionContext: (text) => {
\t\t\t\tconst socket = options.getSocket();
\t\t\t\tif (socket.readyState !== WEBSOCKET_OPEN) return false;
\t\t\t\tsocket.send(JSON.stringify({ type: "session.context.append", channel: "speakable", content: [{ type: "input_text", text }] }));
\t\t\t\treturn true;
\t\t\t},
\t\t\tsendDelegationContext: (id, text) => this.sendAppend(id, text, "speakable")
\t\t}) : void 0;`, "native lifecycle constructor");
  source = once(source, '\t\tif (event.kind === "session-started") {', '\t\tif (event.kind === "session-started") {\n\t\t\tthis.callLifecycle?.started();', "native session started");
  source = once(source, "\t\tthis.startDelegation(event.id, event.prompt, event.userBidiTurnId);", `\t\tif (this.callLifecycle?.handleDelegation(event.id, event.prompt, event.userBidiTurnId)) return;
\t\tthis.startDelegation(event.id, event.prompt, event.userBidiTurnId);`, "native actual delegation");
  source = once(source, "\t\tthis.stopped = true;", "\t\tthis.stopped = true;\n\t\tthis.callLifecycle?.close();", "native lifecycle stop");
  return `${marker}\nimport { createGptLiveCallLifecycle } from "./gpt-live-call-lifecycle.mjs";\n` + source;
}

export function patchGptLiveCallLifecycleBroker(source) {
  const marker = "// gpt-live-call-lifecycle-broker-v1";
  if (source.includes(marker)) return source;
  source = once(source, `\t\t\tconst delegations = new OpenAIQuicksilverDelegationController({
\t\t\t\tgetSocket: () => connected.socket,`, `\t\t\tconst delegations = new OpenAIQuicksilverDelegationController({
\t\t\t\tcallLifecycle: offer.request.model === "gpt-live-1-codex" && typeof offer.request.gatewayControl?.bindCallLifecycle === "function",
\t\t\t\tonCallLifecycleEvent: (event) => offer.request.gatewayControl?.onCallLifecycleEvent?.(event),
\t\t\t\tonTranscript: (role, text, final) => offer.request.gatewayControl?.onTranscript?.(role, text, final),
\t\t\t\tgetSocket: () => connected.socket,`, "native browser broker options");
  source = once(source, "\t\t\tsession = activeSessionLease.adopt(token, {", "\t\t\tif (delegations.callLifecycle) offer.request.gatewayControl.bindCallLifecycle(delegations.callLifecycle);\n\t\t\tsession = activeSessionLease.adopt(token, {", "native broker exact lifecycle binding");
  return marker + "\n" + source;
}

export function patchGptLiveCallLifecycleTalk(source) {
  const marker = "// gpt-live-call-lifecycle-talk-v1";
  if (source.includes(marker)) return source;
  source = once(source, "function createTalkClientGatewayControlOwner(params) {\n\tlet bridge;", "function createTalkClientGatewayControlOwner(params) {\n\tlet callLifecycle;\n\tlet bridge;", "Talk session lifecycle storage");
  source = once(source, "\t\tcontrol: {\n\t\t\tbindBridge: (nextBridge) => {", `\t\trequestCallReady: () => {
\t\t\towner.assertOpen();
\t\t\tif (owners.get(params.voiceSessionId) !== owner) throw new Error("Realtime voice session is not active");
\t\t\tif (!callLifecycle) throw new Error("GPT Live call lifecycle is not available");
\t\t\treturn callLifecycle.ready();
\t\t},
\t\tcontrol: {
\t\t\tbindCallLifecycle: (nextLifecycle) => {
\t\t\t\towner.assertOpen();
\t\t\t\tif (callLifecycle && callLifecycle !== nextLifecycle) throw new Error("GPT Live call lifecycle is already bound");
\t\t\t\tif (typeof nextLifecycle?.ready !== "function" || typeof nextLifecycle?.close !== "function") throw new Error("Invalid GPT Live call lifecycle");
\t\t\t\tcallLifecycle = nextLifecycle;
\t\t\t},
\t\t\tonCallLifecycleEvent: (event) => {
\t\t\t\towner.assertOpen();
\t\t\t\tif (owners.get(params.voiceSessionId) !== owner) throw new Error("Realtime voice session is not active");
\t\t\t\tif (!["tool.call", "tool.result", "tool.error"].includes(event.type) || event.payload?.name !== "openclaw_end_call") throw new Error("Unsupported native call lifecycle event");
\t\t\t\tharness.emit({ type: event.type, callId: event.callId, turnId: harness.ensureTurn(),
\t\t\t\t\tpayload: { ...event.payload, ...talkPayload() }, final: event.type !== "tool.call" });
\t\t\t},
\t\t\tbindBridge: (nextBridge) => {`, "Talk lifecycle owner methods");
  source = once(source, '\t\t\tlifetime.abort(/* @__PURE__ */ new Error("Realtime voice session closed"));', '\t\t\tcallLifecycle?.close();\n\t\t\tlifetime.abort(/* @__PURE__ */ new Error("Realtime voice session closed"));', "Talk lifecycle synchronous close");
  const originalInstructions = "const instructions = providerCapabilities?.handlesAgentConsult === true ? normalizeOptionalString(providerInstructions) : buildRealtimeInstructions(providerInstructions);";
  source = once(source, originalInstructions, `const instructions = resolveGptLiveCallInstructions(providerCapabilities?.handlesAgentConsult === true ? normalizeOptionalString(providerInstructions) : buildRealtimeInstructions(providerInstructions), {
\t\t\t\tproviderId: resolution.provider.id, model: launchOptions.model, transport, brain: "agent-consult", capabilities: providerCapabilities
\t\t\t});`, "exact native client code instructions");
  const toolCheck = '\t\tif (params.name !== "openclaw_agent_consult") {';
  source = once(source, toolCheck, `\t\tif (params.name === "openclaw_live_call_control") {
\t\t\ttry {
\t\t\t\tconst target = requirePreparedTalkSessionTarget(request.sessionMutationAuthorization?.talkSessionTarget);
\t\t\t\tif (typeof request.sessionMutationAuthorization?.assertCurrent !== "function") throw new Error("Talk session authorization is required");
\t\t\t\trequest.sessionMutationAuthorization.assertCurrent();
\t\t\t\tconst connId = normalizeOptionalString(request.client?.connId);
\t\t\t\tconst voiceSessionId = normalizeOptionalString(params.voiceSessionId);
\t\t\t\tif (!connId || !voiceSessionId || params.relaySessionId || !params.args || Array.isArray(params.args) || Object.keys(params.args).length !== 1 || params.args.action !== "ready") throw new Error("Invalid GPT Live call ready request");
\t\t\t\tconst owner = owners.get(voiceSessionId);
\t\t\t\tif (!owner || owner.connId !== connId || owner.sessionTarget.canonicalKey !== target.canonicalKey || owner.sessionTarget.agentId !== target.agentId || owner.sessionTarget.storePath !== target.storePath) throw new Error("GPT Live call is not owned by this client");
\t\t\t\trespond(true, owner.requestCallReady(), void 0);
\t\t\t} catch (error) {
\t\t\t\trespond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, formatErrorMessage(error)));
\t\t\t}
\t\t\treturn;
\t\t}
${toolCheck}`, "existing authorized Talk tool route");
  return `${marker}\nimport { resolveGptLiveCallInstructions } from "./gpt-live-call-lifecycle.mjs";\n` + source;
}
