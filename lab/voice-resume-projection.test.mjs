import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {patchVoiceResumeProjection} from './patch-voice-resume-projection.mjs';
const source=fs.readFileSync(new URL('./fixtures/voice-resume-projection/subagent-announce-delivery-Dosep7Zr.js',import.meta.url),'utf8');
function harness(patched,{voice=true,wait=async()=>{},loaded={entry:{sessionId:'parent'},agentId:'makaron',storePath:'/owned/store'},dispatchError}={}){
 const events=[];let active=true;const controller=new AbortController();
 const capability={signal:controller.signal,assertCurrent:x=>{assert.equal(x.sessionKey,'owned');assert.equal(x.sessionId,'parent');if(!active)throw Error('owner changed');},prepareResumeInput:x=>{events.push('prepare');return x;},onAccepted:()=>{},onExecutionStarted:()=>{},finish:()=>events.push('finish')};
 const params={voiceContinuation:voice?capability:undefined,agentParams:{sessionKey:'owned'},getRequesterSessionId:()=>active?'parent':'changed',isExecutionAllowed:()=>active,timeoutMs:10000};
 let fn=patched.slice(patched.indexOf('async function runAnnounceAgentCall('),patched.indexOf('\nasync function sendSubagentAnnounceDirectly('));
 fn=fn.replace('await import("./session-transcript-reconcile-DFsDtc9l.js")','await getReconciler()');
 const call=new Function('dispatchSubagentAnnounceAgent','loadRequesterSessionEntry','getReconciler','SourceOwnerChangedError','shouldPreserveUserFacingSessionStateForInputProvenance','getGatewayAgentResult',`return (${fn});`)(
  async(args,options)=>{events.push('dispatch');if(dispatchError)throw dispatchError;options.onAccepted({runId:'resumed'});options.onExecutionStarted();return {text:'real result'};},
  ()=>loaded,async()=>({waitForSessionTranscriptProjection:async(target,signal,options)=>{events.push('wait');assert.equal(target.sessionId,'parent');assert.equal(target.storePath,'/owned/store');options.assertActive();await wait({events,signal,options,retire:()=>active=false,controller});options.assertActive();}}),Error,()=>false,x=>x);
 return {call:()=>call(params),events};
}
test('dirty parent projection fails before the patch; patched path dispatches once after readiness',async()=>{
 const error=Error('Session transcript projection is rebuilding: parent');
 const before=harness(source,{dispatchError:error});await assert.rejects(before.call(),x=>x===error);assert.deepEqual(before.events,['prepare','dispatch']);
 const after=harness(patchVoiceResumeProjection(source),{wait:async({events})=>{assert(!events.includes('dispatch'));events.push('ready');}});await after.call();assert.deepEqual(after.events,['wait','ready','prepare','dispatch','finish']);
});
test('ordinary nonvoice announcement does not wait or load transcript',async()=>{
 const h=harness(patchVoiceResumeProjection(source),{voice:false,loaded:null});await h.call();assert.deepEqual(h.events,['dispatch']);
});
test('cancel, owner rotation and native rebuilding failure never dispatch or replay',async()=>{
 for(const wait of [async({controller,signal})=>{controller.abort(Error('cancel'));signal.throwIfAborted();},async({retire})=>retire(),async()=>{throw Error('projection stuck');}]){
  const h=harness(patchVoiceResumeProjection(source),{wait});await assert.rejects(h.call());assert(!h.events.includes('dispatch'));
 }
});
test('missing canonical target and an unrelated dispatch error fail closed',async()=>{
 const missing=harness(patchVoiceResumeProjection(source),{loaded:{entry:{sessionId:'parent'}}});await assert.rejects(missing.call(),/canonical/);assert(!missing.events.includes('dispatch'));
 const error=Error('tool failed');const h=harness(patchVoiceResumeProjection(source),{dispatchError:error});await assert.rejects(h.call(),x=>x===error);assert.equal(h.events.filter(x=>x==='dispatch').length,1);
});
test('patch is pinned, idempotent and matches packaged runtime',()=>{
 const out=patchVoiceResumeProjection(source);assert.equal(patchVoiceResumeProjection(out),out);assert.throws(()=>patchVoiceResumeProjection(source+'\n'),/baseline drifted/);
 assert.equal(fs.readFileSync(new URL('./release-files/voice-resume-projection/subagent-announce-delivery-Dosep7Zr.js',import.meta.url),'utf8'),out);
});
