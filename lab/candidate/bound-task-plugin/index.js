// Candidate-only RPCs. This plugin is never in the release plan.
import path from 'node:path';
export default {id:'bound-task-candidate',register(api){
 api.registerGatewayMethod('candidate.boundTask',async({params:p,respond})=>{
  try {
   const dist=path.join(process.env.VLAB_CANDIDATE_RUNTIME,'openclaw/dist');
   const m=globalThis[Symbol.for('openclaw.v.boundTaskPresentation.v1')];
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
