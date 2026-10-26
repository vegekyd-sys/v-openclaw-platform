const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Presented command delivery anchor drift: '+a.slice(0,80));return s.replace(a,()=>b);};
export function patchPresentedCommandDelivery(s){
 s=once(s,'send = await sendDurableMessageBatchCore({','send = await sendPresentedBatch({');
 // Retain original core validation and onDeliveryResult bookkeeping. The local
 // closure changes only transport, so final evidence reaches the task registry.
 s=once(s,'\tconst deliveryPayloads = projectOutboundPayloadPlanForOutbound(outboundPayloadPlan);',`\tconst deliveryPayloads = projectOutboundPayloadPlanForOutbound(outboundPayloadPlan);
  const sendPresentedBatch = batch => deliverPresentedBatch({runId:opts.runId,yielded:result.meta?.yielded===true},batch,sendDurableMessageBatchCore);
  if(deliveryPayloads.length===0 && deliver && !deliveryStatus && deliveryTarget && deliveryChannel==='feishu' && hasPresentedRun(opts.runId) && replyNormalization.reason!=='channel_transform') {
    const send=await sendPresentedBatch({channel:deliveryChannel,to:deliveryTarget,accountId:resolvedAccountId,payloads:[]});
    const status=deliveryStatusFromDurableSend(send);
    return captureDeliveryResult(buildDeliveryResult({payloads:send.payloads??normalizedPayloads,meta:result.meta,result,deliverySucceeded:send.status==='sent'||send.status==='suppressed',deliveryStatus:status}));
  }`);
 return '// v-task-command-native-delivery-v1\nimport "./v-feishu-task-presentation-core-bridge.mjs";\nimport {deliverPresentedBatch,hasPresentedRun} from "./v-feishu-task-presentation-delivery.mjs";\n'+s;
}
export function patchPresentedAnnounceReceipt(s){
 return '// v-task-announce-receipt-v1\nimport {reconcilePresentedResult} from "./v-feishu-task-presentation-delivery.mjs";\n'+once(s,
  'const directAnnounceResult = getGatewayAgentResult(directAnnounceResponse);',
  'const directAnnounceResult = reconcilePresentedResult(directAgentParams.idempotencyKey, getGatewayAgentResult(directAnnounceResponse));');
}
