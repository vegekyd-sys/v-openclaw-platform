import {deliverPresentedBatch} from './v-feishu-task-presentation-delivery.mjs';
const KEY=Symbol.for('openclaw.v.boundTaskPresentation.v1');
const bare=x=>String(x??'').replace(/^(?:chat|user):/u,'');
// Called only after cron admission, source generation and delivery resolution.
// Execution retains its detached session; presentation belongs to the source.
export async function openCronPresentation(context){
 const m=globalThis[KEY],job=context.input.job,d=context.resolvedDelivery;
 if(!m||job.sessionTarget!=='current'||!context.sourceSessionKey||!context.deliveryRequested||d?.ok!==true||d.channel!=='feishu')return null;
 try{
  const entry=m.entry(context.sourceSessionKey,context.agentId),route=entry?.delivery?.context,g=context.sourceSessionGeneration;
  if(!g||entry?.sessionId!==g.sessionId||entry.lifecycleRevision!==g.lifecycleRevision||route?.channel!=='feishu'||route.accountId!==d.accountId||bare(route.to)!==bare(d.to)||String(route.threadId??'')!==String(d.threadId??''))return null;
  return await m.open({source:'cron-continuation',agentId:context.agentId,sessionKey:context.sourceSessionKey,sessionId:g.sessionId,
   executionSessionKey:context.runSessionKey,runId:context.cronSession.sessionEntry.sessionId,taskId:context.cronSession.sessionEntry.sessionId,
   text:'自动续接已受理，正在准备继续处理本会话的任务。'},{trusted:true});
 }catch{return null;}
}
export function startCronPresentation(handle,info){
 // Start is emitted by the executor, not by a future schedule or a queued job.
 if(handle)void handle.start(info).catch(()=>{});
}
export async function deliverCronPresentation(params,batch,fallback){
 const m=globalThis[KEY],h=m?.runs.get(params.sessionId)??[...m?.tasks.values()??[]].find(h=>h.record.runIds.includes(params.sessionId));
 if(!h||h.record.source!=='cron-continuation')return fallback(batch);
 const result=await deliverPresentedBatch({runId:params.sessionId},batch,fallback);
 if(result.status==='sent'){
  for(const payload of batch.payloads)batch.onPayload?.(payload);
  await batch.onDeliveryResult?.();
 }
 return result;
}
export async function settleCronPresentation(handle,result,error){
 if(!handle||handle.record.delivered||handle.record.executionOutcome)return;
 // A body already sent by the message tool must not be published a second time.
 // Silent or failed runs still close the progress card with their actual state.
 await handle.finish({payloads:[{text:result?.delivered===true?'本次续接已结束，结果已发送。':'本次续接已结束，本轮没有自动回复内容。'}]},error??(result?.status==='error'?result.error??'execution failed':result?.deliveryError));
}
