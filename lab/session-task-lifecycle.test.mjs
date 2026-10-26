import assert from 'node:assert/strict';
import test from 'node:test';
import {executeSessionTaskConsult} from './session-task-lifecycle.mjs';
import {observeEmbeddedTask,presentNativeVoiceTask} from './feishu-task-presentation-runtime.mjs';
const HOST=Symbol.for('openclaw.v.sessionRelay.host');
test('direct SDK source closes batches and returns real continuation even with Feishu presentation disabled',async()=>{
 let resolve;const promise=new Promise(ok=>resolve=ok);const ended=[];let watched;
 globalThis[HOST]={engine:{finishExternalRun:async(...p)=>ended.push(p),watchRequesterRun:(runId,o)=>{watched={runId,o};return{promise};}}};
 try {
  let done=false;
  const result=presentNativeVoiceTask({sessionKey:'source',onRunStarted:()=>{}},async p=>{
   p.onRunStarted({runId:'source-run',sessionId:'session-id'});
   await observeEmbeddedTask({runId:'source-run'},async()=>({meta:{},payloads:[{text:'accepted'}]}));
   return{text:'accepted'};
  },'work');result.then(()=>done=true);
  await new Promise(r=>setImmediate(r));assert.equal(done,false);assert.deepEqual(ended,[['source-run','ok']]);
  assert.equal(watched.runId,'source-run');assert.equal(watched.o.sessionId,'session-id');
  resolve({runId:'wake-run',payloads:[{text:'Actual command output 9999'}]});
  assert.equal((await result).text,'Actual command output 9999');
 }finally{delete globalThis[HOST];}
});
test('failure and aborted embedded results retain terminal classification without a presentation',async()=>{
 const ended=[];globalThis[HOST]={engine:{finishExternalRun:async(...p)=>ended.push(p)}};
 try{
  await observeEmbeddedTask({runId:'aborted'},async()=>({meta:{aborted:true}}));
  await assert.rejects(observeEmbeddedTask({runId:'error'},async()=>{throw Error('model error');}),/model error/);
  assert.deepEqual(ended,[['aborted','aborted'],['error','error']]);
  assert.deepEqual(await executeSessionTaskConsult({},async()=>({text:'ordinary'})),{text:'ordinary'});
 }finally{delete globalThis[HOST];}
});
