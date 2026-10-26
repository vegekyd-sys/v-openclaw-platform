// These wrappers observe the already authorized execution. No second model call.
const KEY=Symbol.for('openclaw.v.boundTaskPresentation.v1');
const optional=fn=>{try{return Promise.resolve(fn()).catch(()=>{});}catch{return Promise.resolve();}};
const open=async(m,...args)=>{try{return await m.open(...args);}catch{return null;}};
const model=p=>({provider:p.provider,model:p.model,agentRuntime:p.agentRuntime?.id??p.agentHarness?.id});

export function observeEmbeddedTask(params,execute) {
  const h=globalThis[KEY]?.runs.get(params.runId);
  if(!h)return execute(params);
  void optional(()=>h.start(model(params)));
  const wrapped={...params,onPartialReply:p=>{void optional(()=>h.partial(p));return params.onPartialReply?.(p);},onAgentEvent:e=>{void optional(()=>h.observe(e));return params.onAgentEvent?.(e);}};
  return Promise.resolve(execute(wrapped)).then(result=>{void optional(()=>h.capture(result));return result;});
}

export async function presentInterSessionTask(prepared,initialOpts,execute) {
  const m=globalThis[KEY],p=prepared.opts?.inputProvenance;
  if(!m||p?.kind!=='inter_session'||p.sourceTool!=='sessions_send'||prepared.opts?.sessionEffects==='internal'||prepared.opts?.transcriptMessage===''||prepared.opts?.suppressPromptPersistence===true||m.claims.has(prepared.runId))return execute(prepared,initialOpts);
  const h=await open(m,{source:'inter-session',agentId:prepared.sessionAgentId,sessionKey:prepared.sessionKey,sessionId:prepared.sessionId,runId:prepared.runId,taskId:prepared.runId,text:prepared.transcriptBody??prepared.opts.transcriptMessage??prepared.opts.message??prepared.body},{trusted:true});
  if(!h)return execute(prepared,initialOpts);
  try {
    // Presentation replaces only the old final-only transport, not the execution.
    const result=await execute({...prepared,opts:{...prepared.opts,deliver:false}},{...initialOpts,deliver:false});
    void optional(()=>h.finish(result));return result;
  } catch(error){void optional(()=>h.finish(null,error));throw error;}
}

export async function presentNativeVoiceTask(params,execute,question) {
  const m=globalThis[KEY];if(!m)return execute(params);
  const identity=params.continuationContext?.identity;
  const h=await open(m,{source:'voice-native',agentId:params.agentId??params.voiceActor?.agentId??/^agent:([^:]+):/u.exec(params.sessionKey??'')?.[1],sessionKey:params.sessionKey,
    taskId:identity?.delegationItemId??`${params.runIdPrefix}:${globalThis.crypto.randomUUID()}`,text:question},{trusted:true,actor:params.voiceActor});
  if(!h)return execute(params);
  const started=fn=>info=>{void optional(()=>h.bindRun(info.runId));return fn?.(info);};
  try {
    const result=await execute({...params,onRunStarted:started(params.onRunStarted),onResumeRunStarted:started(params.onResumeRunStarted)});
    void optional(()=>h.finish(result));return result;
  } catch(error){void optional(()=>h.finish(null,error));throw error;}
}
