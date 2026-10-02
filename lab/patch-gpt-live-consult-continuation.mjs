import assert from "node:assert/strict";
import { createGptLiveConsultContinuationRegistry } from "./gpt-live-consult-continuation.mjs";
import { createGptLiveConsultProgressObserver } from "./gpt-live-consult-progress.mjs";

const MODULE = "./gpt-live-consult-continuation.js";
function patch(source, replacements, label) {
  const marker = `// gpt-live-consult-continuation-v1: ${label}`;
  if (source.includes(marker)) return source;
  let result = source;
  for (const [before, after] of replacements) {
    assert.equal(result.split(before).length - 1, 1, `${label} continuation anchor drifted: ${before.slice(0, 100)}`);
    result = result.replace(before, after);
  }
  return `${marker}\n${result}`;
}

export function createGptLiveContinuationRuntimeSource() {
  return `// gpt-live-consult-continuation-v1: process-local causal capabilities only\n` +
    `import { f as onAgentEventForRun, c as getAgentEventLifecycleGeneration, l as isAgentEventLifecycleGenerationCurrent, m as registerAgentEventLifecycleRotationHandler } from "./agent-events-Con5xUCM.js";\n` +
    `${createGptLiveConsultProgressObserver.toString()}\n${createGptLiveConsultContinuationRegistry.toString()}\n` +
    `const registry = createGptLiveConsultContinuationRegistry({\n` +
    ` subscribeRun: onAgentEventForRun, createProgressObserver: createGptLiveConsultProgressObserver,\n` +
    ` getLifecycleGeneration: getAgentEventLifecycleGeneration, isLifecycleCurrent: isAgentEventLifecycleGenerationCurrent,\n` +
    ` onLifecycleRotation: (callback) => registerAgentEventLifecycleRotationHandler("gpt-live-consult-continuation", callback),\n` +
    `});\nexport const { createOwner: createGptLiveConsultContinuationOwner, attachAcceptedChild: attachGptLiveConsultAcceptedChild, bindYieldBatch: bindGptLiveConsultYieldBatch, resolveWake: resolveGptLiveConsultRequesterWake, bindHarnessSpawns: bindGptLiveHarnessVoiceSpawns, resolveHarnessCompletion: resolveGptLiveHarnessVoiceCompletion } = registry;\n`;
}

export function patchGptLiveContinuationHarness(source) {
  if (source.includes("// gpt-live-consult-continuation-v1: harness")) return source;
  return patch(source, [
    ["async function consultRealtimeVoiceAgent(params) {", `async function consultRealtimeVoiceAgent(params) {`],
    ["\t\t\"When finished, return only the concise result the realtime voice agent should speak back.\",", `\t\t"For a multi-step task, after receiving a real, verified intermediate result, report it in a short, complete public assistant sentence or public preamble before starting the next slow step or delegating further work.",\n\t\t"Ground public progress in results you have actually received. Distinguish a plan or request receipt from a verified fact, and distinguish an intermediate result from task completion. Do not guess missing facts or announce success before verification.",\n\t\t"If you yield while background work continues, include any already confirmed public stage results in the public yield acknowledgment so the live voice conversation can report them while waiting. Keep all public progress concise and speakable; never expose raw tool output, tool logs, or private reasoning.",\n\t\t"When finished, return only the concise result the realtime voice agent should speak back.",`],
    ["\ttry {\n\t\treturn await sessionWorkAdmission.run(async () => {", "\ttry {\n\t\tconst consultResult = await sessionWorkAdmission.run(async () => {"],
    ["\t\t\tconst progressObserver = createGptLiveConsultProgressObserver({ onProgress: params.onProgress, abortSignal, logger: params.logger, runId });", `\t\t\tconst continuationOwner = createGptLiveConsultContinuationOwner({\n\t\t\t\tcontinuationContext: params.continuationContext, runId, sessionId, sessionKey: params.sessionKey, agentId,\n\t\t\t\tisSessionCurrent: () => params.agentRuntime.session.getSessionEntry({ agentId, storePath, sessionKey: params.sessionKey, readConsistency: "latest" })?.sessionId === sessionId,\n\t\t\t\tabortSignal: params.abortSignal ? AbortSignal.any([abortSignal, params.abortSignal]) : abortSignal, timeoutMs, runRegistration, onProgress: params.onProgress,\n\t\t\t\tonResumeRunStarted: params.onResumeRunStarted, collectVisibleText: collectRealtimeVoiceAgentConsultVisibleText, logger: params.logger\n\t\t\t});\n\t\t\tconst executionAbortSignal = continuationOwner ? AbortSignal.any([abortSignal, continuationOwner.signal]) : abortSignal;\n\t\t\tconst progressObserver = createGptLiveConsultProgressObserver({ onProgress: continuationOwner ? continuationOwner.onProgress : params.onProgress, abortSignal: executionAbortSignal, logger: params.logger, runId });`],
    ["\t\t\t\tabortSignal,\n\t\t\t\tonPartialReply: progressObserver.onPartialReply,", "\t\t\t\tabortSignal: executionAbortSignal,\n\t\t\t\tonPartialReply: progressObserver.onPartialReply,"],
    ["\t\t\t}).finally(() => {\n\t\t\t\tprogressObserver.close();\n\t\t\t\trunRegistration?.cleanup?.();\n\t\t\t});\n\t\t\tconst text = collectRealtimeVoiceAgentConsultVisibleText(result.payloads ?? []);", `\t\t\t}).catch((error) => {\n\t\t\t\tcontinuationOwner?.abort(error);\n\t\t\t\tthrow error;\n\t\t\t}).finally(() => {\n\t\t\t\tprogressObserver.close();\n\t\t\t\tif (!continuationOwner) runRegistration?.cleanup?.();\n\t\t\t});\n\t\t\tif (continuationOwner) {\n\t\t\t\tcontinuationOwner.finishInitial(result);\n\t\t\t\treturn { continuationOwner };\n\t\t\t}\n\t\t\tconst text = collectRealtimeVoiceAgentConsultVisibleText(result.payloads ?? []);`],
    ["\t\t\treturn { text };\n\t\t});\n\t} finally {\n\t\tparams.abortSignal?.removeEventListener", `\t\t\treturn { text };\n\t\t});\n\t\t// Return the promise without awaiting here: turn admission must release after yield.\n\t\treturn consultResult.continuationOwner ? consultResult.continuationOwner.wait() : consultResult;\n\t} finally {\n\t\tparams.abortSignal?.removeEventListener`],
  ], "harness").replace("// gpt-live-consult-continuation-v1: harness\n", `// gpt-live-consult-continuation-v1: harness\nimport { createGptLiveConsultContinuationOwner } from "${MODULE}";\n`);
}

export function patchGptLiveContinuationTalk(source) {
  return patch(source, [
    ["\tconst runArgs = async (args, signal, onProgress) => {", "\tconst runArgs = async (args, signal, onProgress, continuationContext) => {"],
    ["\t\t\tonProgress,\n\t\t\tonRunStarted: ({ runId, sessionId, timeoutMs }) => {", `\t\t\tonProgress,\n\t\t\tcontinuationContext,\n\t\t\tonResumeRunStarted: ({ runId, sessionId, timeoutMs }) => {\n\t\t\t\tif (params.registerRun) params.registerRun({ runId });\n\t\t\t\telse registerClientVoiceConsultRun({ agentId, sessionKey, voiceSessionId, runId, config: params.config });\n\t\t\t\tif (!params.ownerConnId) return;\n\t\t\t\tconst registration = registerChatAbortController({\n\t\t\t\t\tchatAbortControllers: params.context.chatAbortControllers, runId, sessionId, sessionKey: canonicalKey,\n\t\t\t\t\tagentId, timeoutMs, ownerConnId: params.ownerConnId, controlUiVisible: false, kind: "chat-send"\n\t\t\t\t});\n\t\t\t\treturn { abortSignal: registration.controller.signal, cleanup: registration.cleanup };\n\t\t\t},\n\t\t\tonRunStarted: ({ runId, sessionId, timeoutMs }) => {`],
    ["\t\trunPrompt: async ({ prompt, signal, onProgress }) => await runArgs({ question: prompt }, signal, onProgress)", "\t\trunPrompt: async ({ prompt, signal, onProgress, continuationContext }) => await runArgs({ question: prompt }, signal, onProgress, continuationContext)"],
    ["\t\trunAgentConsult: async ({ prompt, signal: consultSignal = new AbortController().signal, onProgress }) => {", "\t\trunAgentConsult: async ({ prompt, signal: consultSignal = new AbortController().signal, onProgress, continuationIdentity }) => {"],
    ["\t\t\treturn await params.runAgentConsult({ question: prompt }, consultSignal, onProgress);", `\t\t\tconst continuationContext = continuationIdentity ? {\n\t\t\t\tidentity: continuationIdentity, ownerConnId: params.connId, voiceSessionId: params.voiceSessionId, ownerGeneration: entryPrefix,\n\t\t\t\tisCurrent: () => { owner.assertOpen(); return owners.get(params.voiceSessionId) === owner; }\n\t\t\t} : void 0;\n\t\t\treturn await params.runAgentConsult({ question: prompt }, AbortSignal.any([consultSignal, signal]), onProgress, continuationContext);`],
  ], "Talk");
}

export function patchGptLiveContinuationRegistry(source) {
  if (source.includes("// gpt-live-consult-continuation-v1: registry")) return source;
  return patch(source, [
    ["\tif (rearmGeneration !== void 0 && entries.every((entry) => typeof entry.execution.endedAt === \"number\")) params.schedule(firstEntry.runId, firstEntry);", `\tbindGptLiveConsultYieldBatch({ requesterSessionKey, requesterAgentId: params.requesterAgentId ?? firstEntry.requesterAgentId,\n\t\trequesterTurnRunId, batchRunIds, rearmGeneration, requesterYielded: params.requesterYielded });\n\tif (rearmGeneration !== void 0 && entries.every((entry) => typeof entry.execution.endedAt === "number")) params.schedule(firstEntry.runId, firstEntry);`],
    ["\t\t\t\tsubagentRuns.commitOwnership(entry);\n\t\t\t\tthis.options.ensureListener();", `\t\t\t\tsubagentRuns.commitOwnership(entry);\n\t\t\t\tattachGptLiveConsultAcceptedChild({ entry, getCurrentEntry: (id) => this.options.runs.get(id) });\n\t\t\t\tthis.options.ensureListener();`],
    ["\t\t\tbindGatewayContextResolver(entry, gatewayContextResolver);\n\t\t\tconst cfg = this.options.getRuntimeConfig();", `\t\t\tbindGatewayContextResolver(entry, gatewayContextResolver);\n\t\t\tattachGptLiveConsultAcceptedChild({ entry, getCurrentEntry: (id) => this.options.runs.get(id) });\n\t\t\tconst cfg = this.options.getRuntimeConfig();`],
  ], "registry").replace("// gpt-live-consult-continuation-v1: registry\n", `// gpt-live-consult-continuation-v1: registry\nimport { attachGptLiveConsultAcceptedChild, bindGptLiveConsultYieldBatch } from "${MODULE}";\n`);
}

export function patchGptLiveContinuationWake(source) {
  if (source.includes("// gpt-live-consult-continuation-v1: wake")) return source;
  return patch(source, [
    ["\t\tlet delivery;\n\t\ttry {\n\t\t\tdelivery = await deliverSubagentAnnouncement({", `\t\tconst voiceContinuation = resolveGptLiveConsultRequesterWake({ requesterSessionKey, requesterAgentId, batchRunIds, rearmGeneration: state.rearmGeneration });\n\t\tlet delivery;\n\t\ttry {\n\t\t\tdelivery = await deliverSubagentAnnouncement({\n\t\t\t\tvoiceContinuation,`],
  ], "wake").replace("// gpt-live-consult-continuation-v1: wake\n", `// gpt-live-consult-continuation-v1: wake\nimport { resolveGptLiveConsultRequesterWake } from "${MODULE}";\n`);
}

export function patchGptLiveContinuationDelivery(source) {
  return patch(source, [
    ["async function runAnnounceAgentCall(params) {\n\tconst deadline = new AbortController();\n\tconst signal = params.signal ? AbortSignal.any([params.signal, deadline.signal]) : deadline.signal;", `async function runAnnounceAgentCall(params) {\n\tconst voice = params.voiceContinuation;\n\tconst assertVoiceCurrent = () => voice?.assertCurrent({ sessionKey: params.agentParams.sessionKey, sessionId: params.getRequesterSessionId?.() });\n\tassertVoiceCurrent();\n\tconst deadline = new AbortController();\n\tconst signal = AbortSignal.any([deadline.signal, ...params.signal ? [params.signal] : [], ...voice ? [voice.signal] : []]);`],
    ["\t\treturn await dispatchSubagentAnnounceAgent(params.agentParams, {\n\t\t\tcancelOnDeadline: true,", "\t\tconst response = await dispatchSubagentAnnounceAgent(params.agentParams, {\n\t\t\tcancelOnDeadline: true,"],
    ["\t\t\tonAccepted: () => {\n\t\t\t\tif (!executionStarted) clearTimeout(timer);", "\t\t\tonAccepted: (accepted) => {\n\t\t\t\tassertVoiceCurrent();\n\t\t\t\tvoice?.onAccepted(accepted);\n\t\t\t\tif (!executionStarted) clearTimeout(timer);"],
    ["\t\t\tonExecutionStarted: () => {\n\t\t\t\tsignal.throwIfAborted();", "\t\t\tonExecutionStarted: () => {\n\t\t\t\tassertVoiceCurrent();\n\t\t\t\tsignal.throwIfAborted();"],
    ["\t\t\tresolveGatewayContext: params.resolveGatewayContext\n\t\t});\n\t} finally {\n\t\tclearTimeout(timer);", "\t\t\tresolveGatewayContext: params.resolveGatewayContext\n\t\t});\n\t\tvoice?.finish(getGatewayAgentResult(response));\n\t\treturn response;\n\t} finally {\n\t\tclearTimeout(timer);"],
    ["\t\t\t\t\t\tagentParams: directAgentParams,", "\t\t\t\t\t\tagentParams: directAgentParams,\n\t\t\t\t\t\tvoiceContinuation: params.voiceContinuation,\n\t\t\t\t\t\tgetRequesterSessionId: () => loadRequesterSessionEntry(params.targetRequesterSessionKey, params.requesterAgentId).entry?.sessionId,"],
    ["\t\t\treturn await sendSubagentAnnounceDirectly({\n\t\t\t\trequesterSessionKey: params.requesterSessionKey,", "\t\t\treturn await sendSubagentAnnounceDirectly({\n\t\t\t\tvoiceContinuation: params.voiceContinuation,\n\t\t\t\trequesterSessionKey: params.requesterSessionKey,"],
  ], "delivery");
}

export function patchGptLiveContinuationTaskSdk(source) {
  if (source.includes("// gpt-live-consult-continuation-v1: task-sdk")) return source;
  return patch(source, [
    ["async function deliverAgentHarnessTaskCompletion(params) {\n\tconst scope = assertAgentHarnessTaskRuntimeScope(params.scope);", `async function deliverAgentHarnessTaskCompletion(params) {\n\tconst scope = assertAgentHarnessTaskRuntimeScope(params.scope);\n\tconst voiceContinuation = resolveGptLiveHarnessVoiceCompletion({\n\t\tscope, requesterSessionKey: scope.requesterSessionKey, requesterTurnRunId: params.requesterTurnRunId, childRunId: params.childRunId,\n\t\trequesterSessionId: loadRequesterSessionEntry(scope.requesterSessionKey).entry?.sessionId,\n\t\tchildSessionKey: params.childSessionKey.trim(), childSessionId: params.childSessionId.trim()\n\t});`],
    ["\tconst deliver = () => deliverSubagentAnnouncement({\n\t\trequesterSessionKey,", `\tconst deliver = () => deliverSubagentAnnouncement({\n\t\tvoiceContinuation,\n\t\t// Bound voice continuations require a captured accepted run, so direct execution owns the final.\n\t\t...voiceContinuation ? { requireDirectDelivery: true, requireVisibleReply: true } : {},\n\t\trequesterSessionKey,`],
    ["\t\texpectsCompletionMessage: true,\n\t\tbestEffortDeliver: true,", "\t\texpectsCompletionMessage: voiceContinuation ? false : true,\n\t\tbestEffortDeliver: true,"],
    ["export { createAgentHarnessTaskRuntime, deliverAgentHarnessTaskCompletion, isDurableAgentHarnessCompletionDelivery };", `/** Only the host-issued scope and trusted accepted tool receipts may bind a voice child batch. */\nfunction bindGptLiveAgentHarnessVoiceSpawns(params) {\n\tconst scope = assertAgentHarnessTaskRuntimeScope(params.scope);\n\treturn bindGptLiveHarnessVoiceSpawns({ scope, requesterSessionKey: scope.requesterSessionKey, requesterTurnRunId: params.requesterTurnRunId,\n\t\trequesterSessionId: loadRequesterSessionEntry(scope.requesterSessionKey).entry?.sessionId,\n\t\tacceptedSessionSpawns: params.acceptedSessionSpawns, requesterYielded: params.requesterYielded,\n\t\tgetChildSessionId: (sessionKey) => loadRequesterSessionEntry(sessionKey).entry?.sessionId\n\t});\n}\nexport { createAgentHarnessTaskRuntime, deliverAgentHarnessTaskCompletion, isDurableAgentHarnessCompletionDelivery, bindGptLiveAgentHarnessVoiceSpawns };`],
  ], "task-sdk").replace("// gpt-live-consult-continuation-v1: task-sdk\n", `// gpt-live-consult-continuation-v1: task-sdk\nimport { bindGptLiveHarnessVoiceSpawns, resolveGptLiveHarnessVoiceCompletion } from "../gpt-live-consult-continuation.js";\n`);
}
