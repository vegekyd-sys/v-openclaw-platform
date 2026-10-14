import test from 'node:test';import assert from 'node:assert/strict';
import {createVoiceTaskLifetime} from './voice-task-lifetime.mjs';
import {patchVoiceTaskLifetime} from './patch-voice-task-lifetime.mjs';
import {readFile} from 'node:fs/promises';
for(const enabled of [false,true])test(`explicit task cancellation remains effective (${enabled})`,()=>{
 const call=new AbortController(),consult=new AbortController();let closing=false;
 const t=createVoiceTaskLifetime({enabled,callSignal:call.signal,consultSignal:consult.signal,isCallClosing:()=>closing});t.accepted();consult.abort(Error('explicit cancellation'));closing=true;call.abort();assert(t.signal.aborted);assert(!t.detached);t.dispose();
});
test('Voice task accepted by the host outlives media teardown',()=>{
 const call=new AbortController(),consult=new AbortController();let closing=false;
 const t=createVoiceTaskLifetime({enabled:true,callSignal:call.signal,consultSignal:consult.signal,isCallClosing:()=>closing});t.accepted();closing=true;call.abort();assert(!t.signal.aborted);assert(t.detached);t.dispose();
});
test('unaccepted work and unrelated providers retain cancellation',()=>{
 for(const [enabled,accepted] of [[true,false],[false,true]]){
  const call=new AbortController(),consult=new AbortController();let closing=false;
  const t=createVoiceTaskLifetime({enabled,callSignal:call.signal,consultSignal:consult.signal,isCallClosing:()=>closing});if(accepted)t.accepted();closing=true;call.abort();assert(t.signal.aborted);assert(!t.detached);t.dispose();
 }
});
test('unexpected connection loss still cancels rather than pretending to hand off',()=>{
 const call=new AbortController(),consult=new AbortController();
 const t=createVoiceTaskLifetime({enabled:true,callSignal:call.signal,consultSignal:consult.signal,isCallClosing:()=>false});t.accepted();consult.abort();assert(t.signal.aborted);t.dispose();
});
test('patch is narrow, anchored, idempotent and opt-in for Voice adapter',async()=>{
 const s=await readFile(new URL('./release-files/voice-content-product-20261010/talk-DkFuKRod.js',import.meta.url),'utf8');const p=patchVoiceTaskLifetime(s);
 assert.match(p,/params.providerId === "v-voice-gpt-live"/);assert.equal(patchVoiceTaskLifetime(p),p);assert.throws(()=>patchVoiceTaskLifetime(s.replace('const continuationContext = continuationIdentity ? {','drift')),/anchor drift/);
});

import vm from 'node:vm';import {randomUUID} from 'node:crypto';
async function realOwner(providerId='v-voice-gpt-live'){
 const source=patchVoiceTaskLifetime(await readFile(new URL('./release-files/voice-content-product-20261010/talk-DkFuKRod.js',import.meta.url),'utf8'));
 const body=source.slice(source.indexOf('function createTalkClientGatewayControlOwner(params) {'),source.indexOf('async function closeTalkClientGatewayControlSession(params) {'));
 const events=[];const context={AbortController,AbortSignal,createVoiceTaskLifetime,randomUUID,owners:new Map(),pendingOwners:new Set(),createRealtimeControlQueue:()=>({seal(){},flush:async()=>{}}),createRealtimeVoiceSessionHarness:()=>({close(){},ensureTurn(){return 'turn';},emit(e){events.push(e);}}),createTalkRealtimeRunControlOwner:()=>({close:async()=>{}}),registerTalkConnectionCleanup(){},bindGptLiveBackendCallControl:()=>undefined,authorizeGptLiveClientVoicePendingConfirmation:()=>undefined,buildGptLiveBackendCallControlQuestion:p=>p};
 vm.runInNewContext(body+';globalThis.createOwner=createTalkClientGatewayControlOwner;',context);
 let finish,executionSignal,continuation;const final=new Promise(r=>finish=r),ready=Promise.withResolvers();
 const owner=context.createOwner({providerId,voiceSessionId:'voice',sessionTarget:{agentId:'makaron',sessionKey:'exact'},connId:'host',context:{logGateway:{warn(){}}},flushTranscript:async()=>{},closeLogicalSession:async()=>{},runAgentConsult:async(args,signal,progress,c)=>{executionSignal=signal;continuation=c;c.onRunStarted({runId:'admitted'});ready.resolve();return final;}});owner.activate();
 const consult=new AbortController(),pending=owner.runAgentConsult({prompt:'actual work',signal:consult.signal,continuationIdentity:{delegationItemId:'actual-native'}});await ready.promise;
 return {owner,consult,pending,finish,events,get signal(){return executionSignal;},continuation};
}
test('actual patched Talk owner closes media promptly while accepted Voice work can complete',async()=>{
 const f=await realOwner();assert.equal(f.events.find(e=>e.payload?.name==='openclaw_background_task').payload.runId,'admitted');await f.owner.close();assert(!f.signal.aborted);assert.equal(f.continuation.isCurrent(),true);f.finish({text:'实际完成'});assert.equal((await f.pending).text,'实际完成');assert.throws(()=>f.owner.assertOpen());
});
test('actual Talk owner still cancels other providers and explicit Voice task cancellation',async()=>{
 const other=await realOwner('openai');await other.owner.close();assert(other.signal.aborted);other.finish({text:'other'});await other.pending;
 const f=await realOwner();f.consult.abort(Error('explicit task cancellation'));assert(f.signal.aborted);assert(!f.continuation.isCurrent()||f.signal.aborted);f.finish({text:'cancelled'});await f.pending;await f.owner.close();
});

test('explicit cancellation after detachment still retires the accepted task',()=>{
 const call=new AbortController(),consult=new AbortController();let closing=false;
 const t=createVoiceTaskLifetime({enabled:true,callSignal:call.signal,consultSignal:consult.signal,isCallClosing:()=>closing});t.accepted();closing=true;call.abort();assert(t.detached);consult.abort(Error('explicit cancel'));assert(t.signal.aborted);assert(!t.detached);t.dispose();
});
