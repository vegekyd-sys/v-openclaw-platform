import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNativeHarnessData,applyNativeHarnessData,cloneWireData} from './native-harness-data.mjs';
import {WorkerPool} from './worker-pool.mjs';
import {fileURLToPath} from 'node:url';
test('new native data reaches native attempt without adding an ingress parameter mapping',()=>{
 const future={futureVoiceRouting:{enabled:true,formats:['ogg'],future:{mode:'native'}},thinkLevel:'high'};
 const data=buildNativeHarnessData({...future,sessionId:'s',config:{apiKey:'not-for-wire'},abortSignal:new AbortController().signal,onPartialReply(){}});
 assert.deepEqual(data,future);assert.notEqual(data.futureVoiceRouting,future.futureVoiceRouting);
 const local={sessionId:'worker-owned',config:{local:true},model:{id:'native'}};
 assert.deepEqual(applyNativeHarnessData(local,data),{...local,...future});
});
test('opaque handles and new callbacks fail visibly instead of being silently dropped',()=>{
 for(const value of [()=>{},new Map(),Symbol('authority'),{nested:()=>{}},new Date()])
  assert.throws(()=>buildNativeHarnessData({future:value}),/Unreviewed/);
 assert.throws(()=>buildNativeHarnessData({onFutureEvent(){}}),/contract needs review/);
 const cycle={};cycle.self=cycle;assert.throws(()=>cloneWireData(cycle),/Unreviewed/);
 const getter={get sideEffect(){throw new Error('must not execute');}};
 assert.throws(()=>cloneWireData(getter),/Unreviewed accessor/);
 assert.throws(()=>buildNativeHarnessData(getter),/Unreviewed accessor/);
 assert.throws(()=>buildNativeHarnessData(JSON.parse('{"__proto__":{"bad":true}}')),/Unsafe Worker field/);
 assert.throws(()=>buildNativeHarnessData({[Symbol('hidden')]:true}),/Unreviewed symbol/);
 assert.throws(()=>applyNativeHarnessData({},{sessionId:'forged'}),/local owner override/);
 assert.throws(()=>cloneWireData(JSON.parse('{"__proto__":{"bad":true}}')),/Unsafe Worker field/);
});
test('per-media metadata retains distinct intents and future fields through wire cloning',()=>{
 const result={media:[{mediaUrl:'voice.mp3',audioAsVoice:true,ttsSupplement:{visibleTextAlreadyDelivered:true}},
  {mediaUrl:'original.mp3',audioAsVoice:false,caption:'original file',futureMetadata:{kind:'file'}}]};
 assert.deepEqual(cloneWireData(result),result);
});
test('real child-process IPC carries future native data and reply metadata without adding mappings',async()=>{
 const pool=new WorkerPool({minWorkers:1,maxWorkers:1,sessionsPerWorker:3,requestTimeoutMs:5000,
  workerEnv:{...process.env,VLAB_OPENCLAW_AGENT_RUNTIME:fileURLToPath(new URL('./fake-agent-runtime.mjs',import.meta.url)),VLAB_REQUIRE_OPENCLAW_AGENT_RUNTIME:'1'}});
 try {
  await Promise.all([0,1,2].map(async i=>{
   const futureNativeOption={session:i,nested:{enabled:true,values:[false,null,'new field']}};
   const result=await pool.dispatch(`agent:fixture:future-${i}`,{kind:'agent',nativeAttempt91:true,
    agentId:'fixture',sessionId:`future-${i}`,runId:`future-${i}`,message:'native-data-envelope',
    nativeHarnessData:buildNativeHarnessData({futureNativeOption})});
   assert.deepEqual(JSON.parse(result.payloads[0].text),futureNativeOption);
   assert.deepEqual(result.payloads[0].futureMetadata,{preserved:true});
  }));
 } finally {await pool.close();}
});
