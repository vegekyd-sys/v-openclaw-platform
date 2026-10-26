const KEY=Symbol.for('openclaw.v.boundTaskPresentation.v1');
const bare=x=>String(x??'').replace(/^(?:chat|user):/u,'');
// Runs after core route validation, policy, transforms and media deduplication.
// It substitutes only the final transport and returns its actual native ACK.
export async function deliverPresentedBatch(context,batch,fallback){
 const m=globalThis[KEY];
 const h=m?.runs.get(context.runId)??[...m?.tasks.values()??[]].find(h=>h.record.runIds.includes(context.runId));
 if(!h)return fallback(batch);
 if(h.record.activeRunId&&h.record.activeRunId!==context.runId||batch.channel!=='feishu'||batch.accountId!==h.record.route.accountId||bare(batch.to)!==bare(h.record.route.to)||!m.current(h.record))
  return {status:'failed',results:[],error:Error('Task presentation delivery ownership changed')};
 if(context.yielded)return {status:'suppressed',reason:'pending_continuation',results:[]};
 h.captureDelivery(batch.payloads);
 await h.finish({payloads:batch.payloads,meta:{yielded:false}});
 if(!h.record.delivered)return {status:'failed',results:[],error:Error(h.record.error??'Native final delivery has no ACK')};
 const receipts=h.record.sinkState?.receipts??[];
 // No fabricated message receipt: durable task delivery needs a per-payload ACK.
 if(!receipts.length||receipts.some(r=>r.visibleReplySent!==true))return {status:'failed',results:[],error:Error('Native final receipt is incomplete')};
 return {status:'sent',results:receipts.map(r=>({channel:'feishu',messageId:r.messageId})),payloads:h.record.executionOutcome.result.payloads,payloadOutcomes:[]};
}
export function hasPresentedRun(runId){const m=globalThis[KEY];return Boolean(m?.runs.has(runId));}
// Native completion retries reuse the original announce idempotency key. A later
// card ACK must supersede its cached transport failure without re-running work.
export function reconcilePresentedResult(runId,result){
 const m=globalThis[KEY],h=[...m?.tasks.values()??[]].find(h=>h.record.activeRunId===runId);
 const receipts=h?.record.sinkState?.receipts;
 if(!h?.record.delivered||!m.current(h.record)||!receipts?.length||receipts.some(r=>!r.visibleReplySent))return result;
 return {...result,payloads:h.record.executionOutcome.result.payloads,deliverySucceeded:true,
  deliveryStatus:{requested:true,attempted:true,status:'sent',succeeded:true,resultCount:receipts.length}};
}
