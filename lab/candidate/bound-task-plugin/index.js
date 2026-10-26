// Candidate-only RPCs. This plugin is never in the release plan.
import path from 'node:path';
import fs from 'node:fs';
export default {id:'bound-task-candidate',register(api){
 api.registerGatewayMethod('candidate.boundTask',async({params:p,respond})=>{
  try {
   const dist=path.join(process.env.VLAB_CANDIDATE_RUNTIME,'openclaw/dist');
   const m=globalThis[Symbol.for('openclaw.v.boundTaskPresentation.v1')];
   if(p.op==='seed-live-sessions'){
    if(process.env.BOUND_TASK_OUTBOUND_ONLY!=='1')throw Error('Outbound live candidate required');
    const live=JSON.parse(fs.readFileSync(process.env.BOUND_TASK_LIVE_CONFIG));
    const storePath=path.join(api.config.agents.entries.makaron.agentDir,'openclaw-agent.sqlite');
    if(!storePath.startsWith(process.env.OPENCLAW_STATE_DIR+'/'))throw Error('Session fixture escaped private state');
    const {_:replaceEntry}=await import(path.join(dist,'session-accessor.sqlite-entry-BlklNPKQ.js'));
    for(const row of live.bindings??[]){
     if(!row.key.startsWith('agent:makaron:feishu:group:')||row.entry.delivery?.kind!=='external'||!row.entry.sessionId)throw Error('Real external session binding required');
     const entry=JSON.parse(JSON.stringify(row.entry).replaceAll(live.bindingSourceState??process.env.VLAB_SHARED_STATE_DIR,process.env.OPENCLAW_STATE_DIR).replaceAll(process.env.VLAB_SHARED_STATE_DIR,process.env.OPENCLAW_STATE_DIR));
     await replaceEntry({storePath,sessionKey:row.key},entry);
    }
    respond(true,{seeded:live.bindings?.map(r=>r.key)});return;
   }
   if(p.op==='attach-live-sender'){
    if(process.env.BOUND_TASK_OUTBOUND_ONLY!=='1'||process.env.OPENCLAW_SKIP_CHANNELS!=='1')throw Error('Outbound-only candidate mode required');
    const native=await import(path.join(process.env.VLAB_CANDIDATE_RUNTIME,'npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/monitor.account-WFdlCDhR.js'));
    m.registerAccount('default',native.createTaskPresentationAccount({cfg:api.config,accountId:'default',runtime:{log:()=>{},error:()=>{}},createClient:native.createFeishuClient,createReplyDispatcher:native.createFeishuReplyDispatcher,resolveAccount:(cfg,accountId)=>native.resolveFeishuRuntimeAccount({cfg,accountId}),resolveProgressRuntimes:native.resolveVisibleProgressRuntimes}));
    respond(true,{attached:true,channelsStarted:false});return;
   }
   if(p.op==='inspect'){
    await Promise.all([...m.tasks.values()].map(h=>h.flush()));
    respond(true,{accounts:[...m.accounts.keys()],tasks:[...m.tasks.values()].map(h=>h.record),entry:p.sessionKey?api.runtime.agent.session.getSessionEntry({agentId:'makaron',sessionKey:p.sessionKey,readConsistency:'latest'}):null});return;
   }
   if(p.op==='cross'){
    const {t:agentCommand}=await import(path.join(dist,'agent-command-DPfawBbr.js'));
    const result=await agentCommand({agentId:'makaron',sessionKey:p.sessionKey,runId:p.runId,message:p.text,deliver:true,
     inputProvenance:{kind:'inter_session',sourceTool:'sessions_send',sourceSessionKey:p.sourceSessionKey},senderIsOwner:true},
     {log(){},error(){},exit(code){throw Error('Unexpected exit '+code);}});
    respond(true,{result});return;
   }
   if(p.op==='native'){
    const {candidateConsult}=await import(path.join(dist,'realtime-session-harness-CEO5kVAJ.js'));
    const model=api.config.agents.entries.makaron.model.primary.split('/');
    const result=await candidateConsult({cfg:api.config,agentRuntime:api.runtime.agent,agentId:'makaron',sessionKey:p.sessionKey,
     runIdPrefix:'candidate-native',surface:'phone',userLabel:'用户',assistantLabel:'V',questionSourceLabel:'后台任务',
     args:{question:p.text},transcript:[{role:'user',text:'PRIVATE_TRANSCRIPT_NOT_FOR_CARD'}],
     provider:model[0],model:model.slice(1).join('/'),thinkLevel:'off',senderIsOwner:true,timeoutMs:120000,
     logger:api.logger});
    respond(true,{result});return;
   }
   throw Error('Unknown candidate operation');
  } catch(error){respond(false,undefined,{code:'INVALID_REQUEST',message:String(error?.message??error)});}
 });
}};
