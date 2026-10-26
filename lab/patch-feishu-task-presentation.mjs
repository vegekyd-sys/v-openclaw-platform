import {createTaskPresentationAccount} from './feishu-task-presentation-native.mjs';
const KEY='openclaw.v.boundTaskPresentation.v1';
export const MARKER='feishu-bound-task-presentation-v1';
function once(source,from,to){const n=source.split(from).length-1;if(n!==1)throw Error('Task presentation anchor drift ('+n+'): '+from.slice(0,80));return source.replace(from,()=>to);}
const already=(source)=>{if(source.includes(MARKER))throw Error('Task presentation already patched');};

export function patchTaskPresentationEntry(source){already(source);
  source=once(source,'\tregisterFull(api) {','\tregisterFull(api) {\n\t\tregisterTaskPresentation(api, {onAgentEvent});');
  return `// ${MARKER}\nimport {registerTaskPresentation} from "./v-feishu-task-presentation.mjs";\nimport {onAgentEvent} from "openclaw/plugin-sdk/agent-harness-runtime";\n`+source;
}
export function patchTaskPresentationMonitor(source){already(source);
  source=once(source,'\t\t\t\t\t\tmediaUrl,\n\t\t\t\t\t\treplyToMessageId:',
    '\t\t\t\t\t\tmediaUrl,\n\t\t\t\t\t\t...(params.boundTaskPresentation ? {mediaLocalRoots:getAgentScopedMediaLocalRoots(cfg,agentId)} : {}),\n\t\t\t\t\t\treplyToMessageId:');
  source=once(source,'\tconst typingTargetMessageId = explicitTypingTargetMessageId?.trim() || replyToMessageId;',
    '\tconst typingTargetMessageId = params.boundTaskPresentation ? void 0 : explicitTypingTargetMessageId?.trim() || replyToMessageId;');
  const stateEnd='\t\t\thasNote: Boolean(options?.note)\n\t\t};';
  source=once(source,stateEnd,stateEnd+'\n\t\tawait options?.taskCheckpoint?.({...this.state});\n\t\tif (options?.resumeMessageId) { this.state.messageId = options.resumeMessageId; return; }');
  source=once(source,'\t\t\t\t...sendOptions.replyInThread ? { reply_in_thread: true } : {}','\t\t\t\t...sendOptions.replyInThread ? { reply_in_thread: true } : {},\n\t\t\t\t...sendOptions.taskUuid ? {uuid:sendOptions.taskUuid} : {}');
  source=once(source,'\t\t\t\t...sendMode === "root_create" ? { root_id: sendOptions.rootId } : {}','\t\t\t\t...sendMode === "root_create" ? { root_id: sendOptions.rootId } : {},\n\t\t\t\t...sendOptions.taskUuid ? {uuid:sendOptions.taskUuid} : {}');
  source=once(source,'\t\tif (messageId && this.state) this.state.messageId = messageId;','\t\tif (messageId && this.state) this.state.messageId = messageId;\n\t\tawait options?.taskCheckpoint?.({...this.state});');
  source=once(source,'\t\tif (!VFEISHU_CARD_PRECREATE_ENABLED || vPrecreateAttempted || !streamingEnabled',
    '\t\tif (params.boundTaskPresentation?.state?.stream?.cardId || !VFEISHU_CARD_PRECREATE_ENABLED || vPrecreateAttempted || !streamingEnabled');
  const precreated='\t\t\t\t...precreated ? { precreatedCardId: precreated.cardId, precreatedSequence: precreated.sequence } : {},';
  source=once(source,precreated,precreated+`
        ...params.boundTaskPresentation ? {
          taskUuid: params.boundTaskPresentation.uuid,
          taskCheckpoint: params.boundTaskPresentation.checkpoint,
          ...params.boundTaskPresentation.state?.stream?.cardId ? {
            precreatedCardId: params.boundTaskPresentation.state.stream.cardId,
            precreatedSequence: (params.boundTaskPresentation.state.stream.sequence ?? 1) + 10000,
            resumeMessageId: params.boundTaskPresentation.state.stream.messageId,
          } : {},
        } : {},`);
  const returned='\t\tgetVisibleReplyState: () => ({\n\t\t\tvisibleReplySent,';
  source=once(source,returned,`    flushTaskPresentation: async () => { await streamingStartPromise; await partialUpdateQueue; await streaming?.queue; },
    snapshotTaskPresentation: () => ({stream: streaming?.state ? {...streaming.state} : params.boundTaskPresentation?.state?.stream}),
${returned}`);
  const runStart='\t\t\tonAgentRunStart: (runId) => {\n\t\t\t\tif (typeof runId === "string"';
  source=once(source,runStart,`\t\t\tonAgentRunStart: (runId) => {
        if (!params.boundTaskPresentation) globalThis[Symbol.for("${KEY}")]?.claimNative(runId, {sessionKey:params.sessionKey});
\t\t\t\tif (typeof runId === "string"`);
  const handlers='\t\ttry {\n\t\t\tdurableIngress?.start();';
  source=once(source,handlers,`    const vTaskHost = globalThis[Symbol.for("${KEY}")];
    const vTaskRelease = vTaskHost?.registerAccount(accountId, createTaskPresentationAccount({cfg,accountId,runtime,
      createClient:createFeishuClient,createReplyDispatcher:createFeishuReplyDispatcher,
      resolveAccount:(cfg,accountId)=>resolveFeishuRuntimeAccount({cfg,accountId}),resolveProgressRuntimes:resolveVisibleProgressRuntimes}));
    void vTaskHost?.recover();
${handlers}`);
  source=once(source,'\t\t} finally {\n\t\t\tvIngressCatchup?.stop();','\t\t} finally {\n      vTaskRelease?.();\n\t\t\tvIngressCatchup?.stop();');
  return `// ${MARKER}\nimport {getAgentScopedMediaLocalRoots} from "openclaw/plugin-sdk/media-local-roots";\n`+source+'\n'+createTaskPresentationAccount.toString()+'\n';
}
export function patchTaskPresentationEmbedded(source){already(source);
  const resolved='\tconst initialResolvedRuntimeModel = resolveEffectiveModel(runtimeModel);';
  source=once(source,resolved,resolved+`\n  void Promise.resolve().then(()=>globalThis[Symbol.for("${KEY}")]?.runs.get(params.runId)?.start({provider,model:modelId,agentRuntime:agentHarness.id})).catch(()=>{});`);
  source=once(source,'function runEmbeddedAgent(paramsInput) {',`function runEmbeddedAgent(paramsInput) {
  return observeEmbeddedTask(paramsInput, runEmbeddedAgentWithoutTaskPresentation);
}
function runEmbeddedAgentWithoutTaskPresentation(paramsInput) {`);
  return `// ${MARKER}\nimport {observeEmbeddedTask} from "./v-feishu-task-presentation-runtime.mjs";\n`+source;
}
export function patchTaskPresentationAgent(source){already(source);
  const start='async function agentCommandInternal(prepared, initialOpts, admissionIngress, runtime = defaultRuntime, deps, watchSkills = false) {';
  source=once(source,start,`${start}
  return presentInterSessionTask(prepared, initialOpts, (p,o)=>agentCommandWithoutTaskPresentation(p,o,admissionIngress,runtime,deps,watchSkills));
}
async function agentCommandWithoutTaskPresentation(prepared, initialOpts, admissionIngress, runtime = defaultRuntime, deps, watchSkills = false) {`);
  return `// ${MARKER}\nimport {presentInterSessionTask} from "./v-feishu-task-presentation-runtime.mjs";\n`+source;
}
export function patchTaskPresentationConsult(source){already(source);
  source=once(source,'async function consultRealtimeVoiceAgent(params) {',`async function consultRealtimeVoiceAgent(params) {
  return presentNativeVoiceTask(params, consultRealtimeVoiceAgentWithoutTaskPresentation, parseRealtimeVoiceAgentConsultArgs(params.args).question);
}
async function consultRealtimeVoiceAgentWithoutTaskPresentation(params) {`);
  return `// ${MARKER}\nimport {presentNativeVoiceTask} from "./v-feishu-task-presentation-runtime.mjs";\n`+source;
}

export function patchTaskPresentationSessionsSend(source){already(source);
  const replyOnce=source.includes('v-sessions-send-reply-once-v2');
  const gateway='async function runSessionsSendA2AFlow(params) {\n'+(replyOnce?'\t// v-sessions-send-reply-once-v2\n':'')+'\tconst runContextId = params.waitRunId ?? "unknown";\n\tconst gatewayCall = params.callGateway ?? callAgentToolGatewayRequest;';
  source=once(source,gateway,gateway+`
  const nativeTaskPresented = async () => {
    if (process.env.V_FEISHU_TASK_PRESENTATION !== "1" || !params.waitRunId) return false;
    try {
      const receipt = await gatewayCall({method:"v.feishu.taskPresentation",params:{op:"owns",agentId:params.targetAgentId,sessionKey:params.targetSessionKey,runId:params.waitRunId}});
      return receipt?.owned === true;
    } catch { return false; }
  };`);
  if(replyOnce){
    // The relay fallback hands a completed result back to the requester. A
    // target card owns only target delivery; it must never swallow that wake.
    source=once(source,'\t\tif (sameSessionSourceReply) {','\t\tif (sameSessionSourceReply) {\n      if (await nativeTaskPresented()) return;');
    return `// ${MARKER}\n`+source;
  }
  const same='\t\tif (sameSessionSourceReply && canDirectDeliverSameSessionReply) {';
  source=once(source,same,same+'\n      if (await nativeTaskPresented()) return;');
  const announce='\t\tconst announcePrompt = buildAgentToAgentAnnounceContext({';
  source=once(source,announce,'    if (await nativeTaskPresented()) return;\n'+announce);
  return `// ${MARKER}\n`+source;
}
