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
\t\t\tisCurrent: () => !this.stopped && !options.signal.aborted &&
\t\t\t\toptions.isCallCurrent?.() === true && options.getSocket()?.readyState === WEBSOCKET_OPEN,
\t\t\tonToolEvent: (event) => options.onCallLifecycleEvent(event),
\t\t\tonError: (error) => options.onError?.(error),
\t\t\tsendSessionContext: (text) => {
\t\t\t\tconst socket = options.getSocket();
\t\t\t\tif (socket?.readyState !== WEBSOCKET_OPEN) return false;
\t\t\t\tsocket.send(JSON.stringify({ type: "session.context.append", channel: "speakable", content: [{ type: "input_text", text }] }));
\t\t\t\treturn true;
\t\t\t},
\t\t\tsendDelegationContext: (id, text) => this.sendAppend(id, text, "speakable")
\t\t}) : void 0;`, "native lifecycle constructor");
  source = once(source, "\t\tthis.delegationGeneration = 0;", `\t\tthis.callControlUserTurnWaiters = new Set();
\t\tthis.completedCallControlUserTurns = new Map();
\t\tthis.delegationGeneration = 0;`, "call control finalized turn storage");
  source = once(source, "\t\t\t\tevent.userClosingTranscriptUnchanged = this.observeNativeUserTurn(raw);", "\t\t\t\tthis.observeCallControlUserTurn(raw);\n\t\t\t\tevent.userClosingTranscriptUnchanged = this.observeNativeUserTurn(raw);", "call control genuine turn observation");
  source = once(source, '\t\tif (event.kind === "session-started") {', '\t\tif (event.kind === "session-started") {\n\t\t\tthis.callLifecycle?.started();', "native session started");
  source = once(source, "\t\tthis.stopped = true;", "\t\tthis.stopped = true;\n\t\tthis.callLifecycle?.close();\n\t\tthis.completedCallControlUserTurns.clear();\n\t\tfor (const notify of this.callControlUserTurnWaiters) notify();", "native lifecycle stop");
  source = once(source, "\tobserveNativeUserTurn(raw) {", `\tobserveCallControlUserTurn(raw) {
\t\tif (!this.callLifecycle || this.stopped) return;
\t\tconst turnId = raw.type === "turn.delta" ? raw.turn_id : raw.turn?.id;
\t\tif (typeof turnId !== "string" || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(turnId)) return;
\t\tif (raw.type === "turn.created" && raw.turn?.role === "user") {
\t\t\tthis.latestCallControlUserTurnId = turnId;
\t\t\tthis.completedCallControlUserTurns.delete(turnId);
\t\t} else if (raw.type === "turn.done" && raw.turn?.role === "user") {
\t\t\tif (!this.latestCallControlUserTurnId) this.latestCallControlUserTurnId = turnId;
\t\t\tconst text = raw.turn.transcript;
\t\t\tif (typeof text === "string" && text.trim() && Buffer.byteLength(text, "utf8") <= 16 * 1024) {
\t\t\t\tthis.completedCallControlUserTurns.set(turnId, text);
\t\t\t\tif (this.completedCallControlUserTurns.size > 256) this.completedCallControlUserTurns.delete(this.completedCallControlUserTurns.keys().next().value);
\t\t\t}
\t\t}
\t\tfor (const notify of this.callControlUserTurnWaiters) notify();
\t}
\tasync prepareBackendCallControl(delegation, signal) {
\t\tconst originUserTurnId = delegation.userBidiTurnId;
\t\tif (!this.callLifecycle || typeof originUserTurnId !== "string" || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(originUserTurnId)) return;
\t\tconst ownerCurrent = () => this.isCurrentDelegation(delegation, signal) && this.options.isCallCurrent?.() === true &&
\t\t\tthis.options.getSocket()?.readyState === WEBSOCKET_OPEN;
\t\tconst turnCurrent = () => ownerCurrent() && (!this.latestCallControlUserTurnId || this.latestCallControlUserTurnId === originUserTurnId);
\t\tif (!turnCurrent()) return;
\t\tlet userTurnText = this.completedCallControlUserTurns.get(originUserTurnId);
\t\tif (!userTurnText) userTurnText = await new Promise((resolve) => {
\t\t\tlet timer;
\t\t\tconst finish = (value) => { clearTimeout(timer); this.callControlUserTurnWaiters.delete(notify); signal.removeEventListener("abort", notify); resolve(value); };
\t\t\tconst notify = () => {
\t\t\t\tif (!turnCurrent()) return finish(void 0);
\t\t\t\tconst finalText = this.completedCallControlUserTurns.get(originUserTurnId);
\t\t\t\tif (finalText) finish(finalText);
\t\t\t};
\t\t\tthis.callControlUserTurnWaiters.add(notify);
\t\t\tsignal.addEventListener("abort", notify, { once: true });
\t\t\ttimer = setTimeout(() => finish(void 0), 15000);
\t\t\ttimer.unref?.();
\t\t\t// No completed USER means no model end tool, never a timed hangup.
\t\t\tnotify();
\t\t});
\t\tif (!userTurnText || !turnCurrent()) return;
\t\tconst isCurrent = () => ownerCurrent() && this.latestCallControlUserTurnId === originUserTurnId &&
\t\t\tthis.completedCallControlUserTurns.get(originUserTurnId) === userTurnText;
\t\treturn { nativeDelegationId: delegation.id, originUserTurnId, delegationGeneration: delegation.generation,
\t\t\tuserTurnText, tool: createGptLiveEndCallClientTool(), isCurrent,
\t\t\taccept: ({ backendRunId, backendToolCallId } = {}) => {
\t\t\t\tif (!isCurrent()) return false;
\t\t\t\tconst receipt = this.callLifecycle.acceptBackendTool({ nativeDelegationId: delegation.id, originUserTurnId,
\t\t\t\t\tdelegationGeneration: delegation.generation, backendRunId, backendToolCallId });
\t\t\t\tif (receipt) { delegation.callControlReceipt = receipt; this.cancelQueuedProgress?.(); }
\t\t\t\treturn receipt;
\t\t\t} };
\t}
\tretirePreDispatchUserTurnPrefix(delegation, signal, callControl) {
\t\t// Retire only a provably unfinished version, before host dispatch. A later
\t\t// provider item never cancels or rewrites a run already accepted by Talk.
\t\tif (!callControl || !this.isCurrentDelegation(delegation, signal) || delegation.backendDispatchStarted === true ||
\t\t\tcallControl.nativeDelegationId !== delegation.id || callControl.delegationGeneration !== delegation.generation ||
\t\t\tcallControl.originUserTurnId !== delegation.userBidiTurnId || callControl.isCurrent() !== true ||
\t\t\ttypeof delegation.rawInput !== "string" || !delegation.rawInput.trim()) return false;
\t\tconst proof = this.nativeUserTurnText.get(delegation.userBidiTurnId);
\t\tif (proof?.complete !== true || proof.text !== callControl.userTurnText || !Number.isFinite(proof.completedAt) ||
\t\t\t!this.completedUserTurns.has(delegation.userBidiTurnId) || !Number.isFinite(delegation.callerInputAcceptedAt)) return false;
\t\tconst revisions = this.pendingDelegations.filter(next => next.userBidiTurnId === delegation.userBidiTurnId &&
\t\t\tnext.generation > delegation.generation && next.backendDispatchStarted !== true && next.retiredBeforeDispatch !== true &&
\t\t\ttypeof next.rawInput === "string" && next.rawInput.length > delegation.rawInput.length &&
\t\t\tnext.rawInput.startsWith(delegation.rawInput) && next.rawInput === proof.text &&
\t\t\tNumber.isFinite(next.callerInputAcceptedAt) && next.callerInputAcceptedAt >= delegation.callerInputAcceptedAt &&
\t\t\tnext.callerInputAcceptedAt <= proof.completedAt);
\t\tif (revisions.length !== 1) return false;
\t\tdelegation.retiredBeforeDispatch = true;
\t\tthis.tracePublicProgress("delegation-coalesced-before-dispatch", delegation.id, "", {
\t\t\tkind: "progress", delegationGeneration: delegation.generation,
\t\t\tprovenance: { source: "complete_user_revision", itemId: revisions[0].id, emittedAt: proof.completedAt }
\t\t});
\t\t// The unchanged FIFO launches the real newer item with its own id and
\t\t// generation. No result, terminal event, grant or wire item is synthesized.
\t\treturn true;
\t}
\tobserveNativeUserTurn(raw) {`, "actual full caller call control capability");
  source = once(source, "\t\t\tconst result = await this.options.runAgentConsult({", "\t\t\tconst callControl = this.callLifecycle ? await this.prepareBackendCallControl(delegation, signal) : void 0;\n\t\t\tif (!this.isCurrentDelegation(delegation, signal)) return;\n\t\t\tif (this.retirePreDispatchUserTurnPrefix(delegation, signal, callControl)) return;\n\t\t\tdelegation.backendDispatchStarted = true;\n\t\t\tconst result = await this.options.runAgentConsult({\n\t\t\t\t...(callControl ? { callControl } : {}),", "host-only model call control context");
  source = once(source, '\t\t\tif (typeof result?.text !== "string" || !result.text.trim()) throw new Error("Backend returned no complete public result");', '\t\t\tif (delegation.callControlReceipt) {\n\t\t\t\tif (result?.callControl !== delegation.callControlReceipt) throw new Error("Backend call control returned an unowned receipt");\n\t\t\t\treturn;\n\t\t\t}\n\t\t\tif (typeof result?.text !== "string" || !result.text.trim()) throw new Error("Backend returned no complete public result");', "accepted call control is not a spoken final");
  source = once(source, '\t\t\tthis.options.logger.warn(`OpenAI GPT-Live delegation consult failed: ${shortFailureReason(error)}`);', '\t\t\tif (delegation.callControlReceipt) return;\n\t\t\tthis.options.logger.warn(`OpenAI GPT-Live delegation consult failed: ${shortFailureReason(error)}`);', "accepted farewell prevents duplicate failure speech");
  source = once(source, "\t\t\tif (finished || !this.isCurrentDelegation(delegation, signal)) {", "\t\t\tif (finished || delegation.callControlReceipt || !this.isCurrentDelegation(delegation, signal)) {", "accepted control stops ordinary progress");
  return `${marker}\nimport { createGptLiveCallLifecycle, createGptLiveEndCallClientTool } from "./gpt-live-call-lifecycle.mjs";\n` + source;
}

export function patchGptLiveCallLifecycleBroker(source) {
  const marker = "// gpt-live-call-lifecycle-broker-v1";
  if (source.includes(marker)) return source;
  source = once(source, `\t\t\tconst delegations = new OpenAIQuicksilverDelegationController({
\t\t\t\tgetSocket: () => connected.socket,`, `\t\t\tconst delegations = new OpenAIQuicksilverDelegationController({
\t\t\t\tcallLifecycle: offer.request.model === "gpt-live-1-codex" && typeof offer.request.gatewayControl?.bindCallLifecycle === "function",
\t\t\t\tisCallCurrent: () => Boolean(session) && activeSessions.get(token) === session &&
\t\t\t\t\t!session.closing && session.socket === connected.socket &&
\t\t\t\t\t!lifecycleSignal.aborted && !abortController.signal.aborted && connected.socket.readyState === WEBSOCKET_OPEN,
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
