import test from 'node:test';
import assert from 'node:assert/strict';
import {TaskPresentationManager,PRESENTATION_KEY} from './feishu-task-presentation.mjs';
import {openCronPresentation,startCronPresentation,deliverCronPresentation,settleCronPresentation} from './feishu-task-presentation-cron.mjs';
import {buildCronPresentation} from './build-feishu-continuation-progress.mjs';
import {patchCronExecution,patchCronDelivery} from './patch-feishu-continuation-progress.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
function fixture(t){
 const key='agent:test:feishu:group:oc_source';
 const entry={sessionId:'source-1',lifecycleRevision:4,delivery:{kind:'external',context:{channel:'feishu',accountId:'default',to:'chat:oc_source'}}};
 const calls=[];
 const m=new TaskPresentationManager({getEntry:({sessionKey})=>sessionKey===key?entry:undefined});
 m.registerAccount('default',{open:async(record,save)=>({start:async x=>calls.push(['start',x]),partial:async x=>calls.push(['partial',x]),tool:async x=>calls.push(['tool',x]),finish:async x=>{calls.push(['finish',x]);await save({receipts:x.map((p,i)=>({visibleReplySent:true,messageId:'om_ack_'+i}))});}})});
 globalThis[PRESENTATION_KEY]=m;t.after(async()=>{await m.close();delete globalThis[PRESENTATION_KEY];});
 const context={input:{job:{id:'job-1',sessionTarget:'current',payload:{message:'PRIVATE_COMPOSED_PROMPT'}}},agentId:'test',sourceSessionKey:key,sourceSessionGeneration:{sessionId:'source-1',lifecycleRevision:4},
  cronSession:{sessionEntry:{sessionId:'run-1'}},runSessionKey:'agent:test:cron:job-1:run:run-1',deliveryRequested:true,resolvedDelivery:{ok:true,channel:'feishu',accountId:'default',to:'oc_source'}};
 return {m,entry,calls,context};
}
test('detached cron uses source binding and exact execution identity without publishing its prompt',async t=>{
 const f=fixture(t),h=await openCronPresentation(f.context);assert(h);await h.flush();
 assert.equal(h.record.sessionKey,f.context.sourceSessionKey);assert.equal(h.record.executionSessionKey,f.context.runSessionKey);
 assert.equal(h.record.phase,'queued');assert.equal(f.calls.length,0);
 startCronPresentation(h,{provider:'test',model:'test'});
 f.m.onAgentEvent({runId:'run-1',sessionKey:f.context.runSessionKey,stream:'item',seq:1,data:{kind:'preamble',phase:'end',progressText:'已完成第一步'}});
 f.m.onAgentEvent({runId:'run-1',sessionKey:f.context.runSessionKey,stream:'tool',seq:2,data:{phase:'start',name:'exec',args:'PRIVATE_TOOL_ARGS'}});
 f.m.onAgentEvent({runId:'unrelated',sessionKey:f.context.runSessionKey,stream:'item',data:{kind:'preamble',progressText:'WRONG_RUN'}});
 f.m.onAgentEvent({runId:'run-1',sessionKey:f.context.sourceSessionKey,stream:'item',data:{kind:'preamble',progressText:'WRONG_SESSION'}});
 await h.flush();assert.equal(f.calls.filter(c=>c[0]==='partial').length,1);assert.equal(f.calls.filter(c=>c[0]==='tool').length,1);
 assert(!JSON.stringify([h.record,f.calls]).includes('PRIVATE'));assert(!JSON.stringify(f.calls).includes('WRONG'));
});
test('cron delivery keeps exact native ACK and callbacks without a second sender',async t=>{
 const f=fixture(t),h=await openCronPresentation(f.context);let fallback=0,mirrors=0,commit=0;
 const batch={...f.context.resolvedDelivery,payloads:[{text:'最终结果'},{mediaUrl:'https://example.test/report.pdf'}],onPayload:()=>mirrors++,onDeliveryResult:async()=>commit++};
 const send=()=>{fallback++;return {status:'sent',results:[]};};
 const result=await deliverCronPresentation({sessionId:'run-1'},batch,send);
 assert.equal(result.status,'sent');assert.equal(result.results.length,2);assert.equal(fallback,0);assert.equal(mirrors,2);assert.equal(commit,1);
 await deliverCronPresentation({sessionId:'run-1'},batch,send);assert.equal(f.calls.filter(c=>c[0]==='finish').length,1);
 await settleCronPresentation(h,{status:'ok',delivered:true});assert.equal(f.calls.filter(c=>c[0]==='finish').length,1);
 await deliverCronPresentation({sessionId:'not-owned'},batch,send);assert.equal(fallback,1);
});
test('native final failures retry the stored result without falling through to another sender',async t=>{
 const f=fixture(t),h=await openCronPresentation(f.context);let now=1000,attempts=0,fallback=0;f.m.now=()=>now;
 const factory=f.m.accounts.get('default'),open=factory.open;
 factory.open=async(...args)=>{const sink=await open(...args),finish=sink.finish;sink.finish=async p=>{if(++attempts===1)throw Error('429');return finish(p);};return sink;};
 // The initial sink may already have been queued; discard it before delivery.
 await h.flush();h.sink=null;
 const batch={...f.context.resolvedDelivery,payloads:[{text:'canonical final'}]};
 const failed=await deliverCronPresentation({sessionId:'run-1'},batch,()=>fallback++);assert.equal(failed.status,'failed');assert.equal(fallback,0);
 await settleCronPresentation(h,{status:'error',error:'delivery failed'});assert.equal(h.record.executionOutcome.result.payloads[0].text,'canonical final');
 now+=61000;await f.m.retryPending();assert(h.record.delivered);
 const retried=await deliverCronPresentation({sessionId:'run-1'},batch,()=>fallback++);assert.equal(retried.status,'sent');assert.equal(fallback,0);assert.equal(attempts,2);
});
test('timeout, cancellation, silence and verified direct message close without repeating output',async t=>{
 const f=fixture(t);
 for(const [i,result,error,pattern] of [[1,{status:'error',error:'job execution timed out'},undefined,/超时/],[2,undefined,'aborted by operator',/取消/],[3,{status:'ok',deliverySuppressionReason:'silent'},undefined,/没有自动回复/],[4,{status:'ok',delivered:true},undefined,/结果已发送/]]){
  const h=await openCronPresentation({...f.context,cronSession:{sessionEntry:{sessionId:'end-'+i}}});
  await settleCronPresentation(h,result,error);assert(h.record.delivered);assert.match(h.record.executionOutcome.result.payloads[0].text,pattern);
  assert.equal(h.record.phase,i<=2?'failed':'completed');
 }
});
test('runtime patch composition is deterministic, parsed and rejects anchor drift',()=>{
 const built=buildCronPresentation({write:false});assert.equal(built.files.length,8);
 for(const file of built.files){const source=fs.readFileSync(file.source,'utf8');assert.equal(createHash('sha256').update(source).digest('hex'),file.sha256,file.source);const check=spawnSync(process.execPath,['--check','--input-type=module'],{input:source,encoding:'utf8'});assert.equal(check.status,0,check.stderr);}
 const monitor=fs.readFileSync(built.files.find(f=>f.target.endsWith('monitor.account-WFdlCDhR.js')).source,'utf8');assert(monitor.includes('v-feishu-private-conversation-context-v1'));assert(monitor.includes('event:data.event??data'));
 for(const [name,patch] of [['isolated-agent-BxeXdw5A.js',patchCronExecution],['run-delivery.runtime-falxHVAy.js',patchCronDelivery]]){
  const before=fs.readFileSync('lab/fixtures/feishu-continuation-progress/'+name,'utf8');assert.throws(()=>patch(''),/drift/);assert.throws(()=>patch(patch(before)),/Already/);
 }
});
test('restart never publishes a cron raw terminal before native suppression and transformation',async t=>{
 const f=fixture(t),directory=fs.mkdtempSync(path.join(os.tmpdir(),'cron-presentation-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));f.m.directory=directory;
 const h=await openCronPresentation(f.context);await h.flush();h.capture({payloads:[{text:'RAW_NOT_YET_APPROVED_FOR_DELIVERY'}]});
 const recovered=new TaskPresentationManager({directory,getEntry:f.m.getEntry});recovered.registerAccount('default',f.m.accounts.get('default'));t.after(()=>recovered.close());
 await recovered.recover();assert.equal(recovered.tasks.get(h.record.id).record.phase,'interrupted');
 assert(!JSON.stringify(f.calls).includes('RAW_NOT_YET_APPROVED_FOR_DELIVERY'));assert(JSON.stringify(f.calls).includes('重启'));
});
test('presentation entry lookup failures do not block a scheduled execution',async t=>{
 const f=fixture(t);f.m.getEntry=()=>{throw Error('unavailable');};assert.equal(await openCronPresentation(f.context),null);
});
test('disabled delivery, other destinations and stale source generations never acquire a card',async t=>{
 const f=fixture(t);
 for(const patch of [{deliveryRequested:false},{resolvedDelivery:{...f.context.resolvedDelivery,to:'oc_else'}},{resolvedDelivery:{...f.context.resolvedDelivery,accountId:'other'}},{sourceSessionGeneration:{sessionId:'source-old',lifecycleRevision:4}},{sourceSessionGeneration:{sessionId:'source-1',lifecycleRevision:3}},{sourceSessionKey:'agent:test:internal'},{input:{job:{sessionTarget:'isolated'}}}])assert.equal(await openCronPresentation({...f.context,...patch}),null);
 assert.equal(f.m.tasks.size,0);
});
test('two continuations and a human turn retain independent card ownership',async t=>{
 const f=fixture(t),a=await openCronPresentation(f.context),b=await openCronPresentation({...f.context,cronSession:{sessionEntry:{sessionId:'run-2'}},runSessionKey:'agent:test:cron:job-1:run:run-2'});
 f.m.claimNative('human-turn',{sessionKey:f.context.sourceSessionKey});
 await a.finish({text:'第一轮完成'});assert(a.record.delivered);assert(!b.record.delivered);assert(b.ownsRun('run-2'));
 await b.finish(null,'job execution timed out');assert.equal(b.record.phase,'failed');
 assert.equal(f.calls.filter(c=>c[0]==='finish').length,2);
});
