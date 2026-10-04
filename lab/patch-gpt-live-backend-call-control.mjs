import assert from "node:assert/strict";

function once(source, before, after, label) {
  assert.equal(source.split(before).length - 1, 1, `${label} must occur exactly once`);
  return source.replace(before, after);
}

/** Called only with the broker's process-local callbacks after durable USER flush. */
export function bindGptLiveBackendCallControl({ callControl, continuationIdentity, assertCurrent }) {
  if (callControl === undefined) return;
  const validId = value => typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value);
  if (!callControl || !validId(callControl.nativeDelegationId) || !validId(callControl.originUserTurnId) ||
      !Number.isSafeInteger(callControl.delegationGeneration) || callControl.delegationGeneration < 1 ||
      callControl.nativeDelegationId !== continuationIdentity?.delegationItemId ||
      callControl.delegationGeneration !== continuationIdentity?.delegationGeneration ||
      typeof callControl.userTurnText !== "string" || !callControl.userTurnText.trim() || callControl.userTurnText.length > 32768 ||
      typeof callControl.isCurrent !== "function" || typeof callControl.accept !== "function" ||
      typeof assertCurrent !== "function" || callControl.tool?.type !== "function" ||
      callControl.tool.function?.name !== "openclaw_end_call" ||
      callControl.tool.function.parameters?.type !== "object" ||
      !callControl.tool.function.parameters.properties ||
      Object.keys(callControl.tool.function.parameters.properties).length !== 0 ||
      callControl.tool.function.parameters.additionalProperties !== false ||
      callControl.tool.function.parameters.required?.length > 0) {
    throw new Error("Invalid host-owned GPT Live call control");
  }
  const original = { nativeDelegationId: callControl.nativeDelegationId, originUserTurnId: callControl.originUserTurnId,
    delegationGeneration: callControl.delegationGeneration, userTurnText: callControl.userTurnText };
  const check = () => {
    assertCurrent();
    if (Object.keys(original).some(key => callControl[key] !== original[key]) || callControl.isCurrent() !== true) {
      throw new Error("GPT Live call control native source is no longer current");
    }
  };
  check();
  // Only JSON schema is sent to Worker. These owner callbacks remain in Talk.
  const tool = Object.freeze({ type: "function", function: Object.freeze({ name: "openclaw_end_call",
    description: typeof callControl.tool.function.description === "string" ? callControl.tool.function.description : "End the current voice call only when the user has clearly requested it. Do not use for a negated, unfinished, or ambiguous request.",
    parameters: Object.freeze({ type: "object", properties: Object.freeze({}), additionalProperties: false }),
  }) });
  return Object.freeze({ ...original, tool,
    isCurrent: () => { try { check(); return true; } catch { return false; } },
    accept: proof => { check(); const receipt = callControl.accept(proof); check(); return receipt; },
  });
}

/** Preserve the finalized source as model input; only the model may choose the tool. */
export function buildGptLiveBackendCallControlQuestion(prompt, callControl) {
  if (!callControl) return prompt;
  if (callControl.isCurrent() !== true) throw new Error("GPT Live call control source changed before prompt submission");
  return [
    prompt,
    "Original complete latest USER turn, finalized by the current voice host (JSON string):",
    JSON.stringify(callControl.userTurnText),
    "Use this complete utterance to interpret the live request. The available openclaw_end_call client tool takes no arguments and asks the current host to end this call after its farewell plays. Use it only if this complete latest utterance clearly requests ending this call. Do not use it for a negated, unfinished, ambiguous, quoted or hypothetical request; answer the actual request normally in those cases. Do not claim that the call has closed just because you called the tool.",
  ].join("\n\n");
}

/** Apply after continuation, native-confirmation and lifecycle Talk patches. */
export function patchGptLiveBackendCallControlTalk(source) {
  const marker = "// gpt-live-backend-call-control-v1: Talk";
  if (source.includes(marker)) return source;
  source = once(source,
    "runAgentConsult: async ({ prompt, signal: consultSignal = new AbortController().signal, onProgress, continuationIdentity, onCanceled, onRunStarted, callerInputAcceptedAt }) => {",
    "runAgentConsult: async ({ prompt, signal: consultSignal = new AbortController().signal, onProgress, continuationIdentity, onCanceled, onRunStarted, callerInputAcceptedAt, callControl }) => {",
    "backend call-control broker parameter");
  source = once(source,
    "\t\t\tconst spokenGrant = authorizeGptLiveClientVoicePendingConfirmation({",
    `\t\t\tconst boundCallControl = bindGptLiveBackendCallControl({ callControl, continuationIdentity,
\t\t\t\tassertCurrent: () => {
\t\t\t\t\towner.assertOpen(); consultSignal.throwIfAborted();
\t\t\t\t\tif (!callLifecycle || owners.get(params.voiceSessionId) !== owner) throw new Error("GPT Live call control owner changed");
\t\t\t\t}
\t\t\t});
\t\t\tif (boundCallControl) {
\t\t\t\tif (!continuationContext) throw new Error("GPT Live call control requires the native delegation owner");
\t\t\t\tcontinuationContext.callControl = boundCallControl;
\t\t\t}
\t\t\tconst spokenGrant = authorizeGptLiveClientVoicePendingConfirmation({`,
    "backend call-control durable USER binding");
  source = once(source,
    "return await params.runAgentConsult({ question: prompt,",
    "return await params.runAgentConsult({ question: buildGptLiveBackendCallControlQuestion(prompt, boundCallControl),",
    "backend call-control full source prompt");
  return marker + "\n" + bindGptLiveBackendCallControl.toString() + "\n" +
    buildGptLiveBackendCallControlQuestion.toString() + "\n" + source;
}

/** Only the initial run receives schema; registry owns actual tool event acceptance. */
export function patchGptLiveBackendCallControlHarness(source) {
  const marker = "// gpt-live-backend-call-control-v1: harness";
  if (source.includes(marker)) return source;
  source = once(source,
    "\t\t\t\ttoolsAllow: params.toolsAllow,\n\t\t\t\ttimeoutMs,",
    `\t\t\t\ttoolsAllow: params.toolsAllow,
\t\t\t\t// No schema is inherited by child/resume dispatches. Its callbacks are
\t\t\t\t// process-local in the exact continuation owner, never IPC tool args.
\t\t\t\t...(continuationOwner && params.continuationContext?.callControl ? {
\t\t\t\t\tclientTools: [params.continuationContext.callControl.tool],
\t\t\t\t} : {}),
\t\t\t\ttimeoutMs,`,
    "initial voice parent client-tool schema");
  return marker + "\n" + source;
}
