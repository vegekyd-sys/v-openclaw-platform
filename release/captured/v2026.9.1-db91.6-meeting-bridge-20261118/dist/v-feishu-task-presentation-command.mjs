import {publicInterSessionText} from './v-feishu-task-presentation-runtime.mjs';
const KEY=Symbol.for('openclaw.v.boundTaskPresentation.v1');
export async function presentUnifiedAgentTask(prepared,initialOpts,execute){
 const m=globalThis[KEY],opts=prepared.opts??{},p=opts.inputProvenance;
 const completion=p?.kind==='inter_session'&&['subagent_announce','agent_harness_task'].includes(p.sourceTool)&&opts.deliver===true&&opts.sourceReplyDeliveryMode!=='message_tool_only';
 const cross=p?.kind==='inter_session'&&p.sourceTool==='sessions_send'&&opts.transcriptMessage!==''&&opts.suppressPromptPersistence!==true;
 if(!m||!completion&&!cross||opts.sessionEffects==='internal'||m.claims.has(prepared.runId))return execute(prepared,initialOpts);
 const input={source:completion?'subagent-announce':'inter-session',agentId:prepared.sessionAgentId,sessionKey:prepared.sessionKey,sessionId:prepared.sessionId,
  runId:prepared.runId,taskId:prepared.runId,text:completion?'子任务已返回，正在继续处理原任务。':publicInterSessionText(prepared.transcriptBody??opts.transcriptMessage??opts.message??prepared.body)};
 let h;try{h=await m.open(input,{trusted:true});}catch{}
 if(!h)return execute(prepared,initialOpts);
 try{
  // Core delivery keeps its normalization, generation checks and terminal
  // bookkeeping. Its transport adapter awaits the native card's own ACK.
  return await execute({...prepared,opts:{...opts,runId:prepared.runId,deliver:true}},{...initialOpts,runId:prepared.runId,deliver:true});
 }catch(error){await h.finish(null,error);throw error;}
}
