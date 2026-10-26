import assert from 'node:assert/strict';
import test from 'node:test';
import { DM, ROOM, X, createWorld, waitFor, sleep } from './fixtures/harness.mjs';
const ok = text => ({ status:'ok', finals:text?[{text}]:[], visibleReplySent:!!text, finalCount:text?1:0 });
const start = (w,kind,id) => waitFor(()=>w.starts(kind).find(c=>c.args.id===id));

test('SDK source terminal seals its parallel batch without a global lifecycle event; caller gets requester final, never target ACK',async()=>{
 const w=await createWorld({bridge:{holdRuns:true}});
 try {
  const a=await w.send(DM,X,'execute A',{runId:'sdk-native'}),b=await w.send(DM,ROOM(1),'execute B',{runId:'sdk-native'});
  const started=[];const observer=w.engine.watchRequesterRun('sdk-native',{sessionKey:DM,onRunStarted:i=>started.push(i.runId)});
  let finished=false;observer.promise.then(()=>finished=true,()=>{});
  await w.engine.finishExternalRun('sdk-native','ok');await w.engine.finishExternalRun('sdk-native','ok');
  assert.equal(w.batchOf(a.sendId).sealed,true);
  for(const send of[a,b]){const r=await start(w,'request',send.sendId);w.fake.finishRun(r.args.runId,ok(send===a?'9999':'323'));}
  const wake=await start(w,'wake',w.batchOf(a.sendId).batchId);
  await waitFor(()=>started.length===1);assert.equal(finished,false);
  w.fake.finishRun(wake.args.runId,ok('Both actual results verified: 9999 and 323'));
  const result=await observer.promise;assert.equal(result.runId,wake.args.runId);assert.deepEqual(result.payloads,[{text:'Both actual results verified: 9999 and 323'}]);
  assert.equal(w.starts('wake').length,1);
  const replay=w.engine.watchRequesterRun('sdk-native',{sessionKey:DM});assert.deepEqual(await replay.promise,result);
 } finally {await w.close();}
});

test('requester continuation follows another dispatch from its wake before returning a final',async()=>{
 const w=await createWorld({bridge:{holdRuns:true}});
 try {
  const a=await w.send(DM,X,'first',{runId:'sdk-nested'});
  const consumer=w.engine.watchRequesterRun('sdk-nested',{sessionKey:DM});let done=false;consumer.promise.then(()=>done=true,()=>{});
  await w.engine.finishExternalRun('sdk-nested','ok');
  w.fake.finishRun((await start(w,'request',a.sendId)).args.runId,ok('first result'));
  const wake1=await start(w,'wake',w.batchOf(a.sendId).batchId);
  const b=await w.send(DM,ROOM(2),'second',{runId:wake1.args.runId});
  w.fake.finishRun(wake1.args.runId,ok('Second request accepted; awaiting result'));
  await sleep(30);assert.equal(done,false);
  w.fake.finishRun((await start(w,'request',b.sendId)).args.runId,ok('second result'));
  const wake2=await start(w,'wake',w.batchOf(b.sendId).batchId);
  w.fake.finishRun(wake2.args.runId,ok('Final after both real steps'));
  assert.deepEqual((await consumer.promise).payloads,[{text:'Final after both real steps'}]);
 } finally {await w.close();}
});

test('cancelled caller detaches and cannot receive a late result; restart rejects pending caller',async()=>{
 const w=await createWorld({bridge:{holdRuns:true}});
 try{
  await w.send(DM,X,'work',{runId:'sdk-cancel'});const signal=new AbortController();
  const c=w.engine.watchRequesterRun('sdk-cancel',{sessionKey:DM,signal:signal.signal});
  signal.abort(Error('cancelled by caller'));await assert.rejects(c.promise,/cancelled by caller/);
  assert.equal(w.engine.continuations.byBatch.size,0);
  assert.throws(()=>w.engine.watchRequesterRun('sdk-cancel',{sessionKey:ROOM(1)}),/session mismatch/);
  const next=w.engine.watchRequesterRun('sdk-cancel',{sessionKey:DM});w.engine.continuations.stop();await assert.rejects(next.promise,/gateway stopped/);
 }finally{await w.close();}
});

test('empty or failed source continuation is a failure, never a completed ACK',async()=>{
 for(const outcome of[ok(''),{status:'error',finals:[],error:'model failed'}]){
  const w=await createWorld({bridge:{holdRuns:true}});
  try{
   const a=await w.send(DM,X,'work',{runId:'sdk-empty'});const consumer=w.engine.watchRequesterRun('sdk-empty',{sessionKey:DM});
   await w.engine.finishExternalRun('sdk-empty','ok');w.fake.finishRun((await start(w,'request',a.sendId)).args.runId,ok('9999'));
   const wake=await start(w,'wake',w.batchOf(a.sendId).batchId);w.fake.finishRun(wake.args.runId,outcome);
   await assert.rejects(consumer.promise,/no visible final|model failed/);
  }finally{await w.close();}
 }
});
