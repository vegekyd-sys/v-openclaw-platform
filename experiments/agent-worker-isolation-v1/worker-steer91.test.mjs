import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkerPool} from './worker-pool.mjs';
import {createNativeAttemptBridge} from './native-attempt-bridge.mjs';
import {createWorkerActiveRunProxy} from './worker-active-run-proxy.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
 const pool=new WorkerPool(),sent=[];
 const worker={slot:0,pid:123,active:new Map([['a',{request:{nativeAttempt91:true}}]]),child:{send:m=>sent.push(m)}};
 pool.workers.set(0,worker);return {pool,worker,sent};
}
test('native proxy preserves the real transcript settlement outcome',async()=>{
 const outcome={transcriptCommit:'unconfirmed',errorMessage:'fixture'};
 const proxy=createWorkerActiveRunProxy({nativeSteer:true,toolAuthorityFingerprint:'owner',taskSuggestionDeliveryMode:'gateway',pool:{steer:async()=>({steered:true,result:outcome})}});
 assert.equal(proxy.handle.supportsTranscriptCommitWait,true);
 assert.equal(proxy.handle.toolAuthorityFingerprint,'owner');
 assert.equal(await proxy.handle.queueMessage('x',{waitForTranscriptCommit:true}),outcome);
});
test('native bridge awaits real queue promise and denies wrong authority/retired/compacting runs',async()=>{
 const b=createNativeAttemptBridge(),controller=new AbortController();
 const request={id:'a',runId:'r',agentId:'lab',sessionId:'s'};
 b.register(request,controller.signal,()=>{},()=>{});
 await assert.rejects(b.steer('r','x',{}),/not ready/);
 let current=true,compacting=false,release;
 b.bind(request,{toolAuthorityFingerprint:'owner',isCompacting:()=>compacting,queueMessage:()=>new Promise(r=>release=r)},()=>current,()=>{});
 await assert.rejects(b.steer('r','x',{isInboundUserMessage:true,toolAuthorityFingerprint:'other'}),/authority mismatch/);
 let done=false;const p=b.steer('r','x',{isInboundUserMessage:true,toolAuthorityFingerprint:'owner'}).then(x=>(done=true,x));
 await tick();assert.equal(done,false);release({transcriptCommit:'confirmed'});assert.deepEqual(await p,{transcriptCommit:'confirmed'});
 compacting=true;await assert.rejects(b.steer('r','x',{}),/not ready/);
 compacting=false;current=false;await assert.rejects(b.steer('r','x',{}),/not ready/);
 controller.abort();await assert.rejects(b.steer('r','x',{}),/no longer active/);
});
test('native IPC keeps recorder/callbacks local and fences acceptance/receipt by Worker/request',async()=>{
 const {pool,worker,sent}=fixture();let accepted=0,persisted=0;
 const p=pool.steer('a','change',{waitForTranscriptCommit:true,onQueueAccepted:ok=>accepted+=Number(ok),
  userTurnTranscriptRecorder:{resolveMessage:async()=>({role:'user',content:'prepared'}),markRuntimePersisted:()=>persisted++},
  toolAuthorityFingerprint:'owner'});
 await tick();const m=sent[0];
 assert.equal(m.options.onQueueAccepted,undefined);assert.equal(m.options.userTurnTranscriptRecorder,undefined);
 assert.equal(m.options.toolAuthorityFingerprint,'owner');assert.equal(m.preparedMessage.content,'prepared');
 pool.onMessage({}, {...m,type:'steer-accepted',accepted:true});assert.equal(accepted,0);
 pool.onMessage(worker,{...m,requestId:'other',type:'steer-persisted'});assert.equal(persisted,0);
 pool.onMessage(worker,{...m,type:'steer-accepted',accepted:true});assert.equal(accepted,1);
 pool.onMessage(worker,{...m,type:'steer-persisted',message:{},receipt:{}});assert.equal(persisted,1);
 pool.onMessage(worker,{...m,type:'steer-ack',ok:true,result:{transcriptCommit:'confirmed'}});
 assert.equal((await p).result.transcriptCommit,'confirmed');assert.equal(pool.pendingSteers.size,0);
 pool.onMessage(worker,{...m,type:'steer-persisted'});assert.equal(persisted,1);
});
test('accepted then lost acknowledgement reports unconfirmed, never rejection/replay',async()=>{
 const {pool,worker,sent}=fixture();const p=pool.steer('a','x',{});await tick();const m=sent[0];
 pool.onMessage(worker,{...m,type:'steer-accepted',accepted:true});
 pool.onMessage(worker,{...m,type:'steer-ack',ok:false,error:{message:'worker exited'}});
 assert.deepEqual(await p,{steered:true,result:{transcriptCommit:'unconfirmed',errorMessage:'worker exited'}});
});
test('native IPC fails closed for unreviewed function or accessor fields',async()=>{
 const {pool,sent}=fixture();
 await assert.rejects(pool.steer('a','x',{newCallback:()=>{}}),/Unreviewed/);
 assert.equal(sent.length,0);
});
