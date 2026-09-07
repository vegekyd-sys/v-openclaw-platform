import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotPersistedUserTurn, acknowledgeGatewayPersistedUserTurn } from './user-turn-ownership.mjs';
import { createNativeAttemptBridge } from './native-attempt-bridge.mjs';

const identity = {runId:'r', sessionId:'s', sessionKey:'agent:a:s', agentId:'a'};
const message = {role:'user', idempotencyKey:'user:admitted:r', content:[{type:'text',text:'synthetic'}], custom:{preserve:true}};
const snapshot = () => snapshotPersistedUserTurn({hasPersisted:()=>true,getPersistedMessage:()=>message}, identity);
function localRecorder() {
  let persisted, calls = 0;
  return {isBlocked:()=>true, hasPersisted:()=>Boolean(persisted), getPersistedMessage:()=>persisted,
    markRuntimePersisted:m=>{persisted=m;calls++;}, calls:()=>calls};
}
const request = () => ({...identity,suppressPromptPersistence:true,nativePersistedUserTurn:snapshot()});

test('durable message keeps idempotency and metadata but is detached from Gateway state', () => {
  const s = snapshot(); assert.deepEqual(s.message,message);assert.notEqual(s.message,message);
  s.message.custom.preserve=false;assert.equal(message.custom.preserve,true);
  assert.equal(snapshotPersistedUserTurn({hasPersisted:()=>false},identity),undefined);
  assert.equal(snapshotPersistedUserTurn({hasPersisted:()=>true,getPersistedMessage:()=>({role:'user'})},identity),undefined);
});
test('acknowledgement uses the native recorder without transferring a writer or duplicating callbacks', () => {
  const recorder=localRecorder(), input={...identity,userTurnTranscriptRecorder:recorder};
  assert.equal(acknowledgeGatewayPersistedUserTurn(input,request()),true);
  assert.equal(recorder.hasPersisted(),true);assert.deepEqual(recorder.getPersistedMessage(),message);
  acknowledgeGatewayPersistedUserTurn(input,request());assert.equal(recorder.calls(),1);
  assert.equal(input.userTurnTranscriptRecorder,recorder);
});
test('owner changes, unsuppressed writes, conflicts and invalid messages fail closed', () => {
  for(const key of Object.keys(identity)) assert.throws(()=>acknowledgeGatewayPersistedUserTurn(
    {...identity,[key]:'foreign',userTurnTranscriptRecorder:localRecorder()},request()),/owner mismatch/);
  assert.throws(()=>acknowledgeGatewayPersistedUserTurn({...identity,userTurnTranscriptRecorder:localRecorder()}, {...request(),suppressPromptPersistence:false}),/ownership/);
  const recorder=localRecorder();recorder.markRuntimePersisted({...message,idempotencyKey:'different'});
  assert.throws(()=>acknowledgeGatewayPersistedUserTurn({...identity,userTurnTranscriptRecorder:recorder},request()),/Conflicting/);
  const malformed=request();malformed.nativePersistedUserTurn.message.role='assistant';
  assert.throws(()=>acknowledgeGatewayPersistedUserTurn({...identity,userTurnTranscriptRecorder:localRecorder()},malformed),/Invalid/);
});
test('settled tool finalization and missing snapshots keep existing semantics', () => {
  assert.equal(acknowledgeGatewayPersistedUserTurn({...identity,operation:'settled-tool-finalization'},request()),false);
  assert.equal(acknowledgeGatewayPersistedUserTurn(identity,identity),false);
});
test('native bridge acknowledges only a current admitted run', () => {
  const bridge=createNativeAttemptBridge(),abort=new AbortController(),recorder=localRecorder();
  const close=bridge.register(request(),abort.signal,()=>{},()=>{});
  bridge.prepare({...identity,userTurnTranscriptRecorder:recorder});assert.equal(recorder.calls(),1);
  close();assert.throws(()=>bridge.prepare({...identity,userTurnTranscriptRecorder:recorder}),/no longer active/);
});
test('durable handoff suppresses replay append after ordinary option overlay', () => {
  const bridge=createNativeAttemptBridge(),abort=new AbortController(),recorder=localRecorder();
  bridge.register({...request(),nativeHarnessData:{suppressNextUserMessagePersistence:false}},abort.signal,()=>{},()=>{});
  const prepared=bridge.prepare({...identity,userTurnTranscriptRecorder:recorder});
  assert.equal(prepared.suppressNextUserMessagePersistence,true);
  assert.equal(prepared.userTurnTranscriptRecorder.getPersistedMessage().idempotencyKey,message.idempotencyKey);
});
