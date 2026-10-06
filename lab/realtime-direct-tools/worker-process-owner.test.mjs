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
