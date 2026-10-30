import test from 'node:test';
import assert from 'node:assert/strict';
import {TaskPresentationManager,PRESENTATION_KEY} from './feishu-task-presentation.mjs';
import {observeEmbeddedTask} from './feishu-task-presentation-runtime.mjs';
import {deliverPresentedBatch} from './feishu-task-presentation-delivery.mjs';
import {runHandbackWithPresentation} from '../apps/v-desktop-handoff/plugin/core/task-presentation.js';

const sessionKey='agent:test:feishu:group:oc_handoff';
const handoff={id:'h_test',sessionKey,pageHandBackAt:100};
const runId='v-desktop-handoff-wake-h_test-100';
function fixture(t){
 let entry={sessionId:'s1',lifecycleRevision:'g1',delivery:{kind:'external',context:{channel:'feishu',accountId:'work',to:'chat:oc_handoff'}}};
 let now=1000,fail=false;
 const calls=[],manager=new TaskPresentationManager({getEntry:({sessionKey:k})=>k===sessionKey?entry:null,now:()=>now});
 manager.registerAccount('work',{authorize:async()=>{},open:async(r,save)=>{
  calls.push(['open',r.id]);r.anchorId='om_anchor';
  return {start:async()=>calls.push(['start']),partial:async p=>calls.push(['partial',p]),tool:async p=>calls.push(['tool',p]),
   finish:async payloads=>{if(fail)throw Error('delivery unavailable');calls.push(['final',payloads]);await save({receipts:[{visibleReplySent:true,messageId:'om_final'}]});}};
 }});
 globalThis[PRESENTATION_KEY]=manager;t.after(async()=>{await manager.close();delete globalThis[PRESENTATION_KEY];});
 return {manager,calls,entry:()=>entry,setEntry:x=>entry=x,setFail:x=>fail=x,advance:()=>now+=61000,handle:()=>manager.runs.get(runId)??[...manager.tasks.values()][0]};
}
const batch={channel:'feishu',accountId:'work',to:'chat:oc_handoff',payloads:[{text:'FINAL'}]};

test('handback attaches before the existing run; native progress, tools and terminal share one owner',async t=>{
 const f=fixture(t);let executions=0;
 const reply=await runHandbackWithPresentation(handoff,async p=>{
  executions++;assert.equal(p.deliver,true);assert.equal(p.idempotencyKey,runId);assert.equal(p.sessionKey,sessionKey);
  const h=f.handle();assert(h);assert.equal(h.record.source,'desktop-handback');await h.flush();
  assert.equal(h.record.phase,'queued');assert(f.calls.some(c=>c[0]==='partial'&&/排队/.test(c[1].text)));
  await observeEmbeddedTask({agentId:'test',sessionKey,sessionId:'s1',runId,provider:'test',model:'model'},async params=>{
   params.onExecutionStarted?.({});params.onAgentEvent?.({stream:'item',data:{kind:'preamble',progressText:'PUBLIC_PROGRESS'}});
   params.onAgentEvent?.({stream:'tool',data:{phase:'start',name:'browser'}});
   params.onPartialReply?.({text:'PRIVATE_REASONING',isReasoning:true});
   await h.flush();assert(f.calls.some(c=>c[0]==='partial'&&c[1].text==='PUBLIC_PROGRESS'));
   assert(f.calls.some(c=>c[0]==='tool'));assert(!f.calls.some(c=>c[0]==='final'));
   return {payloads:[{text:'FINAL'}]};
  });
  const sent=await deliverPresentedBatch({runId},batch,()=>{throw Error('duplicate transport');});
  assert.equal(sent.status,'sent');assert.equal(sent.results[0].messageId,'om_final');return {runId};
 });
 assert.equal(reply.runId,runId);assert.equal(executions,1);assert.equal(f.calls.filter(c=>c[0]==='open').length,1);
 assert.equal(f.calls.filter(c=>c[0]==='final').length,1);assert(!JSON.stringify(f.calls).includes('PRIVATE_REASONING'));
});

test('duplicate acceptance and duplicate terminal reuse the same task and ACK',async t=>{
 const f=fixture(t),admitted=new Set();let executions=0;
 const run=async p=>{if(!admitted.has(p.idempotencyKey)){admitted.add(p.idempotencyKey);executions++;}return {runId:p.idempotencyKey};};
 await Promise.all([runHandbackWithPresentation(handoff,run),runHandbackWithPresentation(handoff,run)]);
 await deliverPresentedBatch({runId},batch,()=>assert.fail('fallback'));
 await runHandbackWithPresentation(handoff,run);
 await deliverPresentedBatch({runId},batch,()=>assert.fail('fallback'));
 assert.equal(executions,1);assert.equal(f.manager.tasks.size,1);assert.equal(f.calls.filter(c=>c[0]==='final').length,1);
 await runHandbackWithPresentation({...handoff,pageHandBackAt:101},run);assert.equal(executions,2);assert.equal(f.manager.tasks.size,2);
});

test('another session or run cannot write to the handback card',async t=>{
 const f=fixture(t);await runHandbackWithPresentation(handoff,async()=>({runId}));const h=f.handle();await h.flush();
 for(const event of [{runId:'other',sessionKey},{runId,sessionKey:'agent:test:feishu:group:oc_other'}])f.manager.onAgentEvent({...event,stream:'item',data:{kind:'preamble',progressText:'FOREIGN'}});
 await h.flush();assert(!JSON.stringify(f.calls).includes('FOREIGN'));
 assert.equal((await deliverPresentedBatch({runId},{...batch,to:'chat:oc_other'},()=>assert.fail('fallback'))).status,'failed');
 assert(!f.calls.some(c=>c[0]==='final'));
});

for(const variant of ['unbound','archived','non-feishu','native-owned','manager-absent'])test(`handback keeps native execution without extra presentation: ${variant}`,async t=>{
 const f=fixture(t);
 if(variant==='unbound')f.setEntry({...f.entry(),delivery:{kind:'internal'}});
 if(variant==='archived')f.setEntry({...f.entry(),archivedAt:1});
 if(variant==='non-feishu')f.setEntry({...f.entry(),delivery:{kind:'external',context:{channel:'telegram',accountId:'work',to:'123'}}});
 if(variant==='native-owned')f.manager.claimNative(runId,{sessionKey});
 let called=0;await runHandbackWithPresentation(handoff,async p=>{called++;assert(p.deliver);return {runId};},{manager:variant==='manager-absent'?null:f.manager});
 assert.equal(called,1);assert.equal(f.manager.tasks.size,0);assert.equal(f.calls.length,0);
});

test('rejected admission displays failure while execution acceptance alone never completes a task',async t=>{
 const f=fixture(t);await assert.rejects(runHandbackWithPresentation(handoff,async()=>{throw Error('admission rejected');}),/admission rejected/);
 const h=f.handle();assert.equal(h.record.phase,'failed');assert(h.record.delivered);assert.match(f.calls.find(c=>c[0]==='final')[1][0].text,/任务未完成/);
 await runHandbackWithPresentation({...handoff,pageHandBackAt:101},async p=>({runId:p.idempotencyKey}));
 const next=[...f.manager.tasks.values()].at(-1);assert.equal(next.record.delivered,false);assert.equal(next.record.phase,'queued');
});

test('delivery retry keeps the result and does not call the model again',async t=>{
 const f=fixture(t);let runs=0;await runHandbackWithPresentation(handoff,async()=>{runs++;return {runId};});await f.handle().flush();f.setFail(true);
 assert.equal((await deliverPresentedBatch({runId},batch,()=>assert.fail('fallback'))).status,'failed');
 f.setFail(false);f.advance();await f.manager.retryPending();
 assert(f.handle().record.delivered);assert.equal(runs,1);assert.equal(f.calls.filter(c=>c[0]==='final').length,1);
});

test('session reset retires the previous handback instead of publishing into a replacement conversation',async t=>{
 const f=fixture(t);await runHandbackWithPresentation(handoff,async()=>({runId}));await f.handle().flush();
 f.setEntry({...f.entry(),sessionId:'s2'});
 assert.equal((await deliverPresentedBatch({runId},batch,()=>assert.fail('fallback'))).status,'failed');assert(!f.calls.some(c=>c[0]==='final'));
});

import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildHandbackPresentation} from './build-desktop-handback-progress.mjs';
test('release bytes match source and handback renderer owns its run lifecycle',()=>{
 const {files,pluginFiles}=buildHandbackPresentation({write:false});
 for(const f of [...files,...pluginFiles])assert.equal(createHash('sha256').update(fs.readFileSync(f.source)).digest('hex'),f.sha256,f.source);
 const manifest=JSON.parse(fs.readFileSync('lab/release-files/desktop-handback-progress/manifest.json'));
 assert.deepEqual(manifest.files,files);assert.deepEqual(manifest.pluginFiles,pluginFiles);
 const monitor=fs.readFileSync(files.find(f=>f.target.endsWith('monitor.account-WFdlCDhR.js')).source,'utf8');
 const line=monitor.split('\n').find(s=>s.includes('vTaskStatusAttach(params.sessionKey, session,'));
 let attached=0;const invoke=new Function('params','session','vTaskStatusAttach',line);
 invoke({sessionKey,runtime:{},boundTaskPresentation:{source:'desktop-handback'}},{},()=>attached++);
 assert.equal(attached,0,'a completed sibling task cannot label the handback as ended');
 invoke({sessionKey,runtime:{}},{},()=>attached++);assert.equal(attached,1);
});
