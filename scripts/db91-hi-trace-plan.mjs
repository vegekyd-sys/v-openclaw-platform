import assert from 'node:assert/strict';
import {instrumentWorker} from './db91-prompt-trace-plan.mjs';
function once(source,anchor,replacement){assert.equal(source.split(anchor).length,2,'unique hi trace anchor: '+anchor);return source.replace(anchor,replacement);}
const helper='import {db91HiTrace} from "./db91-hi-trace.mjs";\n';
export function instrumentHiWorker(source){
  assert(!source.includes('runDb91HiAgentBody'));
  source=helper+once(source,'async function runAgent(message, abortSignal) {',
    'async function runAgent(message, abortSignal) {\n  return db91HiTrace.run(message, () => runDb91HiAgentBody(message, abortSignal));\n}\nasync function runDb91HiAgentBody(message, abortSignal) {');
  const anchor='        result = await nativeAttemptBridge.withPluginGeneration(';
  return instrumentWorker(once(source,anchor,'        db91HiTrace.mark(message.runId,"worker-before-agent-command");\n'+anchor));
}
export function instrumentHiIndex(source){
  source=helper+once(source,'    async function dispatchNativeHarnessAttempt(params) {',
    '    async function dispatchNativeHarnessAttempt(params) {\n      db91HiTrace.mark(params.runId,"gateway-harness-enter");');
  const anchor='            const submitted = await pool.submit(';
  return once(source,anchor,'            db91HiTrace.mark(params.runId,"gateway-session-preflight-end");\n'+anchor);
}
export function instrumentHiPool(source){
  source=helper+once(source,'  async submit(sessionKey, request, options = {}) {',
    '  async submit(sessionKey, request, options = {}) {\n    db91HiTrace.mark(request.runId,"pool-submit-enter");');
  source=once(source,'      this.requestPump();\n    });\n    return { requestId, promise };',
    '      db91HiTrace.mark(request.runId,"pool-enqueued");\n      this.requestPump();\n    });\n    return { requestId, promise };');
  const anchor='      worker.child.send({\n        id: job.id,';
  return once(source,anchor,'      db91HiTrace.mark(job.request.runId,"worker-ipc-send");\n'+anchor);
}
export function instrumentHiTransport(source){
  const start='const streamOpenAICompletions = (model, context, options) => {';
  source=once(source,start,start+'\n const db91Call=globalThis[Symbol.for("db91.hi.trace")]?.beginModel(model,context,options);');
  source=once(source,'createClient(model, context, apiKey, options?.headers, cacheSessionId, compat);',
    'createClient(model, context, apiKey, options?.headers, cacheSessionId, compat, db91Call);');
  const stages=[
    ['\t\t\tlet params = buildParams(model, context, options, compat, cacheRetention);','provider-client-ready'],
    ['\t\t\tconst nextParams = await options?.onPayload?.(params, model);','provider-params-built'],
    ['\t\t\tfirstEventAbort = createFirstStreamEventAbortController(options?.signal);','provider-payload-hooks-end'],
    ['\t\t\tconst { data: openaiStream, response } = await client.chat.completions.create(params, requestOptions).withResponse();','provider-sdk-call'],
    ['\t\t\tconst hookedOpenAIStream = withProviderResponseHook({','provider-sdk-response'],
    ['\t\t\tstream.end();\n\t\t} catch (error) {','provider-complete'],
  ];
  for(const [anchor,stage]of stages)source=once(source,anchor,'\t\t\tdb91Call?.mark("'+stage+'");\n'+anchor);
  source=once(source,'\t\t\tconst directEventStream = { push(event) {','\t\t\tconst directEventStream = { push(event) {\n        db91Call?.event(event);');
  source=once(source,'\t\t\tconst terminal = assignTransportErrorDetails(output, error, options?.signal);',
    '\t\t\tdb91Call?.error(error);\n\t\t\tconst terminal = assignTransportErrorDetails(output, error, options?.signal);');
  source=once(source,'function createClient(model, context, apiKey, optionsHeaders, sessionId, compat = resolveOpenAICompletionsCompat(model)) {',
    'function createClient(model, context, apiKey, optionsHeaders, sessionId, compat = resolveOpenAICompletionsCompat(model), db91Call) {');
  return once(source,'\t\tfetch: getAiTransportHost().buildModelFetch(model)',
    '\t\tfetch: db91Call ? db91Call.wrapFetch(getAiTransportHost().buildModelFetch(model)) : getAiTransportHost().buildModelFetch(model)');
}
export function instrumentHiGateway(source){
  source='import {db91HiTrace} from "../../worker/db91-hi-trace.mjs";\n'+source;
  const anchor='async function handleChatSendWithOptions({ params, respond, context, client, sessionMutationAuthorization, sessionMutationCommitGuard }, onAdmissionOwned, externalAuthorityAdmission, options) {';
  const at=source.indexOf(anchor),end=source.indexOf('async function handleChatSend(options,',at);assert(at>=0&&end>at);
  let body=source.slice(at,end);
  body=once(body,anchor,anchor+'\n const db91HiMark=stage=>db91HiTrace.mark(params.idempotencyKey,stage);\n db91HiMark("gateway-chat-received");');
  for(const [text,stage]of [
    ['\tif (!setup) return;','gateway-admission-end'],
    ['\tif (!preparedAttachments.ok) return;','gateway-attachments-end'],
    ['\t\t\tconst persistedUserTurn = await persistGatewayUserTurnTranscript();','gateway-user-persist-start'],
    ['\t\t\tconst goalOperation = normalizedRequest.value.goalOperation;','gateway-user-persist-end'],
    ['\t\trespond(true, ackPayload, void 0, { runId: clientRunId });','gateway-ack'],
    ['\t\tstartChatDispatch({','gateway-dispatch-start'],
  ])body=once(body,text,'\t\tdb91HiMark("'+stage+'");\n'+text);
  return source.slice(0,at)+body+source.slice(end);
}

export function instrumentHiNativeTransport(source){
  const start='function createOpenAICompletionsTransportStreamFn() {';
  const at=source.indexOf(start),end=source.indexOf('//#endregion',at);assert(at>=0&&end>at);
  let body=source.slice(at,end);
  const entry='\treturn (model, context, options) => {';
  body=once(body,entry,entry+'\n const db91Call=globalThis[Symbol.for("db91.hi.trace")]?.beginModel(model,context,{...options,reasoningEffort:resolveOpenAICompletionsReasoningEffort(options)});\n let db91FirstBody=false;');
  body=once(body,'\t\t\t\t\t\t\tdoneDetector.observe(chunk);',
    '\t\t\t\t\t\t\tif(db91Call&&!db91FirstBody&&chunk.byteLength){db91FirstBody=true;db91Call.mark("http-first-native-body-chunk");}\n\t\t\t\t\t\t\tdoneDetector.observe(chunk);');
  body=once(body,'{ fetch: doneDetectingFetch });','{ fetch: db91Call ? db91Call.wrapFetch(doneDetectingFetch) : doneDetectingFetch });');
  for(const [anchor,stage]of [
    ['\t\t\t\tlet params = buildOpenAICompletionsParams(model, context, options);','provider-client-ready'],
    ['\t\t\t\tconst nextParams = await options?.onPayload?.(params, model);','provider-params-built'],
    ['\t\t\t\tconst emitReasoning = shouldEmitOpenAICompletionsReasoning(model, options);','provider-payload-hooks-end'],
    ['\t\t\t\tconst { data: responseStream, response } = await client.chat.completions.create(params, buildOpenAISdkRequestOptions(model, firstEventAbort.signal, { timeoutMs: options?.timeoutMs })).withResponse();','provider-sdk-call'],
    ['\t\t\t\tconst hookedResponseStream = withProviderResponseHook({','provider-sdk-response'],
    ['\t\t\t\tfinalizeTransportStream({','provider-complete'],
  ])body=once(body,anchor,'\t\t\t\tdb91Call?.mark("'+stage+'");\n'+anchor);
  const process='\t\t\t\tawait processCompletionsStream(hookedResponseStream, output, model, stream, {';
  body=once(body,process,'\t\t\t\tconst db91ObservedStream=db91Call?{push(event){db91Call.event(event);return stream.push(event);}}:stream;\n'+process.replace('model, stream,','model, db91ObservedStream,'));
  body=once(body,'\t\t\t} catch (error) {\n\t\t\t\tfailTransportStream({','\t\t\t} catch (error) {\n        db91Call?.error(error);\n\t\t\t\tfailTransportStream({');
  return source.slice(0,at)+body+source.slice(end);
}
