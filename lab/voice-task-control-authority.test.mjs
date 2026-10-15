import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {patchVoiceControlAuthority,patchVoiceRunOwnerAuthority} from './patch-voice-task-control-authority.mjs';
const dir=new URL('./release-files/voice-task-control-authority/',import.meta.url),control=fs.readFileSync(new URL('agent-run-control-BeeIeTBf.js',dir),'utf8'),runs=fs.readFileSync(new URL('runs-5WnDPZ0V.js',dir),'utf8');
function controller(source=control){
 const clean=source.replace(/^import .*;\n/gm,'').replace(/^export .*;\n/gm,'');
 return new Function('normalizeOptionalString','normalizeOptionalLowercaseString','asNonArrayRecord','isAbortError','formatErrorMessage',clean+'\nreturn controlRealtimeVoiceAgentRun;')(
  v=>typeof v==='string'&&v.trim()?v.trim():undefined,v=>typeof v==='string'?v.trim().toLowerCase():undefined,v=>v&&!Array.isArray(v)&&typeof v==='object'?v:undefined,()=>false,e=>String(e?.message??e));
}
const original=control.replace('// voice-task-control-authority-v1\n','').replace('\t\t// Authority comes from the exact resolved run, never caller tool arguments.\n\t\ttoolAuthorityFingerprint: exactOwner?.toolAuthorityFingerprint,\n\t\tsourceReplyDeliveryMode: exactOwner?.sourceReplyDeliveryMode,\n\t\ttaskSuggestionDeliveryMode: exactOwner?.taskSuggestionDeliveryMode','\t\ttaskSuggestionDeliveryMode: void 0');
function fixture(){
 const owner={sessionId:'session',sessionKey:'owned',toolAuthorityFingerprint:'trusted-authority',sourceReplyDeliveryMode:'message_tool_only',taskSuggestionDeliveryMode:'none'},queued=[];
 const deps={resolveActiveEmbeddedRunOwnerByRunId:()=>owner,getDiagnosticSessionActivitySnapshot:()=>({}),queueEmbeddedAgentMessageWithOutcomeAsync:async(id,text,options)=>{
  if(options.toolAuthorityFingerprint!==owner.toolAuthorityFingerprint)return {queued:false,sessionId:id,reason:'tool_authority_mismatch'};
  assert.equal(options.sourceReplyDeliveryMode,owner.sourceReplyDeliveryMode);assert.equal(options.taskSuggestionDeliveryMode,owner.taskSuggestionDeliveryMode);queued.push({id,text,options});return {queued:true,sessionId:id};
 }};
 const input={sessionKey:'owned',mode:'steer',text:'Corrected date',runTarget:{runId:'exact',signal:new AbortController().signal,isCurrent:()=>true,toolAuthorityFingerprint:'untrusted-caller-proof'}};
 return {owner,deps,input,queued};
}
test('captured baseline rejects the real authority requirement; same controller with trusted projection accepts',async()=>{
 const f=fixture();assert.equal((await controller(original)(f.input,f.deps)).reason,'tool_authority_mismatch');
 assert.equal((await controller()(f.input,f.deps)).queued,true);assert.equal(f.queued[0].options.toolAuthorityFingerprint,'trusted-authority');
 assert.equal(patchVoiceControlAuthority(original),control);
});
test('followup uses the original controller wrapping and retained reply policy',async()=>{
 const f=fixture();f.input.mode='followup';assert.equal((await controller()(f.input,f.deps)).queued,true);assert.match(f.queued[0].text,/Spoken follow-up/);
});
test('foreign or stale run cannot gain its authority from caller arguments',async()=>{
 for(const mutate of [f=>f.owner.sessionKey='other',f=>f.input.runTarget.isCurrent=()=>false,f=>f.input.runTarget.signal=AbortSignal.abort()]){
  const f=fixture();mutate(f);assert.equal((await controller()(f.input,f.deps)).ok,false);assert.equal(f.queued.length,0);
 }
 const f=fixture();delete f.owner.toolAuthorityFingerprint;f.deps.queueEmbeddedAgentMessageWithOutcomeAsync=async()=>({queued:false,reason:'tool_authority_mismatch'});assert.equal((await controller()(f.input,f.deps)).ok,false);
});
test('exact run projection mints only its current backend metadata and retains current-handle abort guard',()=>{
 const a=runs.indexOf('function projectActiveEmbeddedRunOwner('),b=runs.indexOf('\nfunction resolveActiveEmbeddedRunOwner(',a),code=runs.slice(a,b);
 const handle={runId:'exact',toolAuthorityFingerprint:'trusted',sourceReplyDeliveryMode:'message_tool_only',taskSuggestionDeliveryMode:'none',abort:()=>{}},registration={sessionId:'s',sessionKey:'owned'};
 const live=new Map([['s',handle]]),byId=new Map([['exact',handle]]);
 const project=new Function('normalizeOptionalString','isEmbeddedRunHandleInProgress','ACTIVE_EMBEDDED_RUNS','ACTIVE_EMBEDDED_RUNS_BY_RUN_ID','isEmbeddedRunHandleAbortable',code+';return projectActiveEmbeddedRunOwner;')(v=>v,()=>true,live,byId,()=>true);
 const p=project(registration,handle);assert.equal(p.toolAuthorityFingerprint,'trusted');assert.equal(p.abort(),true);live.set('s',{...handle});assert.equal(p.abort(),false);
 assert.equal(patchVoiceRunOwnerAuthority(runs),runs);assert.equal(patchVoiceControlAuthority(control),control);
 assert.throws(()=>patchVoiceControlAuthority('different upstream code'),/drifted/);
});
