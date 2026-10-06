import test from 'node:test';import assert from 'node:assert/strict';
import {createVoiceProcessOwner} from './worker-process-owner.mjs';
import {patchVoiceWorker,patchVoicePool,patchVoiceIndex} from '../patch-voice-worker-process-owner.mjs';
import fs from 'node:fs';
test('only exact-run native exec IDs enter cleanup; terminal poll follows kill and is idempotent',async()=>{
 const calls=[];const owner=createVoiceProcessOwner({runId:'own',sessionKey:'personal',loadProcessTool:async()=>({execute:async(id,args)=>{calls.push(args);return {details:{status:args.action==='kill'?'running':'failed',sessionId:args.sessionId,exitSignal:'SIGTERM'}};}})});
 owner.observe({runId:'foreign',stream:'tool',data:{name:'exec',phase:'result',result:{details:{status:'running',sessionId:'foreign'}}}});
 owner.observe({runId:'own',sessionKey:'personal',stream:'tool',data:{name:'exec',phase:'result',result:{details:{status:'running',sessionId:'owned'}}}});
 const result=await owner.cancel();assert(result.confirmed);assert.deepEqual(result.processes.map(p=>p.sessionId),['owned']);await owner.cancel();assert.deepEqual(calls.map(c=>c.action),['kill','poll']);assert.equal(owner.snapshot().processes.length,0);
});
test('registry misses and unfinished exec results retain ownership and allow retry',async()=>{
 let done=false;const owner=createVoiceProcessOwner({runId:'own',sessionKey:'p',attempts:1,wait:async()=>{},loadProcessTool:async()=>({execute:async()=>done?{details:{status:'completed'}}:{isError:true,details:{status:'failed'}}})});
 const event=(phase,result)=>owner.observe({runId:'own',stream:'tool',data:{name:'exec',toolCallId:'late',phase,result}});event('start');await assert.rejects(owner.cancel(),/pending/);event('result',{details:{status:'running',sessionId:'owned'}});await assert.rejects(owner.cancel(),/unconfirmed/);assert.deepEqual(owner.snapshot().processes,['owned']);done=true;assert((await owner.cancel()).confirmed);
});
test('patches preserve current Worker code, apply once, and reject changed anchors',()=>{
 for(const [file,patch] of [['worker.mjs',patchVoiceWorker],['worker-pool.mjs',patchVoicePool],['index.mjs',patchVoiceIndex]]){const original=fs.readFileSync(new URL('../../experiments/agent-worker-isolation-v1/'+file,import.meta.url),'utf8'),next=patch(original);assert.equal(patch(next),next);assert(next.includes('voice-'));assert.throws(()=>patch('changed runtime'));}
});
async function patchedPool(){
 const root=new URL('../../experiments/agent-worker-isolation-v1/',import.meta.url);
 let source=patchVoicePool(fs.readFileSync(new URL('worker-pool.mjs',root),'utf8'));
 source=source.replace('"./native-harness-data.mjs"',JSON.stringify(new URL('native-harness-data.mjs',root).href));
 source=source.replace('fileURLToPath(new URL("./worker.mjs", import.meta.url))',JSON.stringify(new URL('worker.mjs',root).pathname));
 return (await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).WorkerPool;
}
test('Worker control selects the exact active run/session and rejects foreign acknowledgements',async()=>{
 const Pool=await patchedPool(),pool=new Pool(),sent=[];
 const active={id:'request-own',sessionKey:'personal',request:{runId:'voice-own'}},worker={active:new Map([[active.id,active]]),child:{send:m=>sent.push(m)}};
 pool.workers.set('own',worker);
 await assert.rejects(pool.cancelVoiceProcesses('voice-foreign','personal'),/no longer active/);
 await assert.rejects(pool.cancelVoiceProcesses('voice-own','foreign-session'),/no longer active/);
 assert.equal(sent.length,0);
 const pending=pool.cancelVoiceProcesses('voice-own','personal'),control=sent[0];
 const ack={...control,type:'voice-process-cancel-ack',ok:true,result:{runId:'voice-own',sessionKey:'personal',confirmed:true,processes:[],pendingExecs:0}};
 pool.onMessage({active:new Map()},ack);assert.equal(pool.pendingControls.size,1);
 pool.onMessage(worker,{...ack,requestId:'foreign-request'});assert.equal(pool.pendingControls.size,1);
 pool.onMessage(worker,ack);assert.equal((await pending).confirmed,true);assert.equal(pool.pendingControls.size,0);
});
test('Worker terminal acknowledgement cannot substitute another run or unconfirmed exit',async()=>{
 const Pool=await patchedPool(),pool=new Pool();let control;
 const active={id:'own',sessionKey:'p',request:{runId:'voice-own'}},worker={active:new Map([['own',active]]),child:{send:m=>control=m}};pool.workers.set('own',worker);
 for(const result of [{runId:'foreign',sessionKey:'p',confirmed:true},{runId:'voice-own',sessionKey:'p',confirmed:false}]){
  const promise=pool.cancelVoiceProcesses('voice-own','p');
  const rejected=assert.rejects(promise,/identity mismatch/);
  pool.onMessage(worker,{...control,type:'voice-process-cancel-ack',ok:true,result});await rejected;
  assert.equal(pool.pendingControls.size,0);
 }
});
