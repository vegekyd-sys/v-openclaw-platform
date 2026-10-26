// Adapter at the existing queued-turn admission and resolved-delivery boundaries.
// It never schedules a model, replays a user message, or resolves source policy.
const KEY=Symbol.for('openclaw.v.boundTaskPresentation.v1');
const bare=x=>String(x??'').replace(/^(?:chat|user):/u,'');
const failureOf=operation=>['aborted','failed'].includes(operation?.result?.kind)?operation.result.code??'execution failed':undefined;
export async function openFollowupPresentation(turn,defaults){
 const m=globalThis[KEY],q=turn.queued,r=q.run;
 if(!m||turn.sendPolicy!=='allow'||q.currentInboundEventKind==='room_event'||defaults.opts?.isHeartbeat||
   (r.sourceReplyDeliveryMode??defaults.opts?.sourceReplyDeliveryMode)==='message_tool_only'||
   q.queuedFollowupReplyDisposition?.kind==='drop'||q.originatingChannel!=='feishu'||
   r.inputProvenance?.kind&&r.inputProvenance.kind!=='external_user')return null;
 const key=turn.session.kind==='session'?turn.session.key:r.sessionKey;
 const entry=m.entry(key,r.agentId),route=entry?.delivery?.context;
 if(route?.channel!=='feishu'||route.accountId!==(q.originatingAccountId??r.agentAccountId)||bare(route.to)!==bare(q.originatingTo))return null;
 // The original human request is already visible in Feishu. Reuse its verified
 // message anchor; never publish the composed follow-up execution prompt.
 return m.open({source:'queued-followup',agentId:r.agentId,sessionKey:key,sessionId:r.sessionId,
  runId:turn.runId,taskId:q.messageId??turn.runId,anchorId:q.messageId,text:'继续处理此前排队的请求。'},{trusted:true});
}
export function followupPresentationOptions(turn,sourceOpts){
 const h=globalThis[KEY]?.runs.get(turn.runId);if(!h||h.record.source!=='queued-followup')return sourceOpts;
 // Those callbacks belong to the closed inbound dispatcher. The current
 // renderer observes this admitted run through the shared event/embedded path.
 return {...sourceOpts,onAgentRunStart:()=>{},onToolStart:undefined,onCommandOutput:undefined,onItemEvent:undefined,onToolResult:undefined,
  onPartialReply:undefined,onBlockReply:undefined,onAssistantMessageStart:undefined,
  onModelSelected:m=>h.start(m)};
}
export async function deliverFollowupPresentation(params,payloads){
 const h=globalThis[KEY]?.runs.get(params.runId);
 if(!h||h.record.source!=='queued-followup'||!h.ownsRun(params.runId))return false;
 if((params.kind??'final')!=='final'){
  for(const p of payloads)if(p.text&&!p.isReasoning)await h.partial(p);
  return true;
 }
 if(h.record.yielded)return true;
 h.captureDelivery(payloads);
 // Called only after native source policy, payload suppression, and drop
 // disposition. A failed delivery stays owned and retryable, never reruns work.
 // Native failure replies can be suppressed into NO_REPLY. The execution
 // outcome is still authoritative: never turn a failed queued run into a
 // successful empty result before the finally handler can observe it.
 await h.finish({payloads},failureOf(params.turn?.operation));
 if(h.record.phase==='waiting')return true;
 if(!h.record.delivered)throw Error('Queued reply has no confirmed native delivery');
 await params.defaults.opts?.onObservedReplyDelivery?.();
 return true;
}
export async function settleFollowupPresentation(runId,disposition,operation){
 const h=globalThis[KEY]?.runs.get(runId);
 if(!h||h.record.source!=='queued-followup'||disposition?.kind!=='consumed'||h.record.delivered||h.record.executionOutcome||h.record.yielded)return;
 const failure=failureOf(operation);
 await h.finish(failure?null:{payloads:[{text:'本轮没有可展示的自动回复。'}]},failure);
}
