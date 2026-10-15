import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {patchVoiceReplyOwnerAuthority} from './patch-voice-reply-owner-authority.mjs';
const before=fs.readFileSync(new URL('./fixtures/voice-reply-owner-authority/reply-run-registry.registry-DWAbDPHN.js',import.meta.url),'utf8'),after=fs.readFileSync(new URL('./release-files/voice-reply-owner-authority/reply-run-registry.registry-DWAbDPHN.js',import.meta.url),'utf8');
function fixture(source=after){
 const signal=new AbortController(),operation={key:'bound',sessionId:'exact-session',toolAuthorityFingerprint:'fallback',abortByUser:()=>true},backend={toolAuthorityFingerprint:'trusted-worker',sourceReplyDeliveryMode:'message_tool_only',taskSuggestionDeliveryMode:'none'},map=new Map([['bound',operation]]);
 const start=source.indexOf('function resolveActiveReplyRunOwnerForSignal(signal)'),end=source.indexOf('\n/** Keep terminal state',start);
 const owner=new Function('operationsByUpstreamAbortSignal','replyRunState','getAttachedBackend','normalizeOptionalString',source.slice(start,end)+';return resolveActiveReplyRunOwnerForSignal;')(new Map([[signal.signal,operation]]),{activeRunsByKey:map},()=>backend,v=>typeof v==='string'&&v.trim()?v.trim():undefined);
 const a=source.indexOf('function resolveReplyBackendQueueMessageMismatch('),b=source.indexOf('\nfunction resolveReplyBackendMessageInjection',a);
 const mismatch=new Function('normalizeOptionalString','hasPromptImageInput',source.slice(a,b)+';return resolveReplyBackendQueueMessageMismatch;')(v=>typeof v==='string'&&v.trim()?v.trim():undefined,()=>false);
 return {signal,operation,backend,map,owner,mismatch};
}
test('real SDK reply projection reproduces authority rejection before patch and accepts unchanged strict queue after patch',()=>{
 const old=fixture(before),oldOwner=old.owner(old.signal.signal);assert.equal(old.mismatch(old.backend,{isInboundUserMessage:true,toolAuthorityFingerprint:oldOwner.toolAuthorityFingerprint},old.operation),'tool_authority_mismatch');
 const f=fixture(),owner=f.owner(f.signal.signal);assert.equal(owner.toolAuthorityFingerprint,'trusted-worker');assert.equal(f.mismatch(f.backend,{isInboundUserMessage:true,...owner},f.operation),undefined);
 assert.equal(owner.sourceReplyDeliveryMode,'message_tool_only');assert.equal(owner.taskSuggestionDeliveryMode,'none');assert.equal(owner.abort(),true);
});
test('foreign, cancelled, completed, replaced and adopted owners never expose authority',()=>{
 for(const mutate of [f=>f.signal.abort(),f=>f.operation.result={kind:'success'},f=>f.map.set('bound',{}),f=>f.map.delete('bound')]){const f=fixture();mutate(f);assert.equal(f.owner(f.signal.signal),undefined);}
 const f=fixture();assert.equal(f.owner(new AbortController().signal),undefined);const o=f.owner(f.signal.signal);f.operation.key='other';assert.equal(o.abort(),false);
});
test('authority fallback is host operation data; missing or wrong incoming proof still rejects',()=>{
 const f=fixture();delete f.backend.toolAuthorityFingerprint;const o=f.owner(f.signal.signal);assert.equal(o.toolAuthorityFingerprint,'fallback');assert.equal(f.mismatch(f.backend,{isInboundUserMessage:true,toolAuthorityFingerprint:o.toolAuthorityFingerprint},f.operation),undefined);
 assert.equal(f.mismatch(f.backend,{isInboundUserMessage:true,toolAuthorityFingerprint:'caller'},f.operation),'tool_authority_mismatch');delete f.operation.toolAuthorityFingerprint;assert.equal(f.owner(f.signal.signal).toolAuthorityFingerprint,undefined);
 assert.equal(f.mismatch(f.backend,{isInboundUserMessage:true},f.operation),'tool_authority_mismatch');
});
test('strict frozen transform is reproducible and touches only the owner projection',()=>{
 assert.equal(patchVoiceReplyOwnerAuthority(before),after);assert.equal(patchVoiceReplyOwnerAuthority(after),after);assert.throws(()=>patchVoiceReplyOwnerAuthority(before+'\n'),/drifted/);
 const strip=s=>s.replace('// voice-reply-owner-authority-v1\n','').replace(/\t\ttoolAuthorityFingerprint: normalizeOptionalString\(getAttachedBackend\(operation\)\?\.toolAuthorityFingerprint \?\? operation.toolAuthorityFingerprint\),\n\t\tsourceReplyDeliveryMode: getAttachedBackend\(operation\)\?\.sourceReplyDeliveryMode,\n\t\ttaskSuggestionDeliveryMode: getAttachedBackend\(operation\)\?\.taskSuggestionDeliveryMode,\n/,'');assert.equal(strip(after),before);
});
