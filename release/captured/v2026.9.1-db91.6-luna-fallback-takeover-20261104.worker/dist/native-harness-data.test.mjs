import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNativeHarnessData,applyNativeHarnessData,cloneWireData} from './native-harness-data.mjs';
import {WorkerPool} from './worker-pool.mjs';
import {fileURLToPath} from 'node:url';
test('native image provenance survives JSON IPC without broad Symbol permission',()=>{
 const symbol=Symbol.for('openclaw.runtimePromptImageFactIndexes'),images=[{type:'image',data:'test',mimeType:'image/png'}];
 Object.defineProperty(images,symbol,{value:[7],configurable:true});
 const encoded=JSON.parse(JSON.stringify(buildNativeHarnessData({images,nested:{futureImages:images}})));
 const decoded=applyNativeHarnessData({sessionId:'local'},encoded);
 assert.deepEqual(decoded.images[symbol],[7]);assert.deepEqual(decoded.nested.futureImages[symbol],[7]);
 assert.equal(Object.getOwnPropertyDescriptor(decoded.images,symbol).enumerable,false);
 assert.throws(()=>buildNativeHarnessData({images:Object.assign([],{[Symbol.for('unknown.authority')]:true})}),/Unreviewed symbol/);
 assert.throws(()=>applyNativeHarnessData({},{$vlabNativeImageFacts:[{path:['config'],factIndexes:[]}]}),/Invalid/);
 assert.throws(()=>applyNativeHarnessData({},{images:[], $vlabNativeImageFacts:[{path:['images'],factIndexes:[0]}]}),/Invalid/);
});
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
   const images=[{type:'image',data:'AA==',mimeType:'image/png'}];
   Object.defineProperty(images,Symbol.for('openclaw.runtimePromptImageFactIndexes'),{value:[i]});
   const result=await pool.dispatch(`agent:fixture:future-${i}`,{kind:'agent',nativeAttempt91:true,
    agentId:'fixture',sessionId:`future-${i}`,runId:`future-${i}`,message:'native-data-envelope',
    nativeHarnessData:buildNativeHarnessData({futureNativeOption,images})});
   assert.deepEqual(JSON.parse(result.payloads[0].text),futureNativeOption);
   assert.deepEqual(result.payloads[0].futureMetadata,{preserved:true});
   assert.deepEqual(result.payloads[0].imageFactIndexes,[i]);
  }));
 } finally {await pool.close();}
});
