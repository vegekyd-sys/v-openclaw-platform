import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {patchNativeResultHeader} from './build-voice-native-turn-control.mjs';
const source=fs.readFileSync(new URL('./release-files/gpt-live-call/realtime-quicksilver-delegation-controller-B0yPpiHp.js',import.meta.url),'utf8');
const after=patchNativeResultHeader(source);
test('single delivery controller patch preserves admission, lifecycle and Agent dispatch',()=>{
 for(const name of ['prepareBackendCallControl','isCurrentDelegation','onCanceled','onRunStarted']){
  const re=new RegExp('\\\\b'+name+'\\\\b','g');assert.equal((after.match(re)||[]).length,(source.match(re)||[]).length);
 }
 const plan=JSON.parse(fs.readFileSync(new URL('./voice-native-turn-control.plan.json',import.meta.url)));assert.equal(plan.files.length,1);assert.match(plan.files[0].target,/delegation-controller/);
});
test('upgrade drift is rejected',()=>assert.throws(()=>patchNativeResultHeader('upgraded controller'),/drifted/));
function controller(){
 const text=after.replace(/^import .*;\n/gm,'').replace('export { OpenAIQuicksilverDelegationController as t };','globalThis.Controller=OpenAIQuicksilverDelegationController;');
 const context={setTimeout,clearTimeout,Buffer,Date,createHash:()=>{},formatErrorMessage:String};vm.runInNewContext(text,context);return context.Controller;
}
test('actual final delivery preserves document and honors quiet projection',async()=>{
 const C=controller(),frames=[],documents=[];const signal=new AbortController().signal;
 const c=Object.create(C.prototype);Object.assign(c,{userTranscriptRevision:2,options:{signal,logger:{warn(){}},runAgentConsult:async()=>({text:'full report'}),onBackendResult:r=>{documents.push(r.text);return {spokenText:'brief',channel:'commentary'};}},isCurrentDelegation:()=>true,retirePreDispatchUserTurnPrefix:()=>false,tracePublicProgress(){},formatCallerConditionEnvelope:r=>r.text,sendAppend:(id,text,channel)=>{frames.push({id,text,channel});return true;},nativeUserTurnText:new Map(),completedUserTurns:new Set()});
 await c.runDelegation({id:'actual',generation:1,userTranscriptRevision:2,prompt:'task'},signal);assert.deepEqual(documents,['full report']);assert.equal(frames.at(-1).channel,'commentary');assert.equal(frames.at(-1).text,'brief');
});
test('real progress and final for an interrupted caller become quiet context',async()=>{
 const C=controller(),frames=[];const signal=new AbortController().signal;const c=Object.create(C.prototype);
 Object.assign(c,{userTranscriptRevision:1,lastSpokenProgressAt:0,options:{signal,logger:{warn(){}},runAgentConsult:async p=>{c.userTranscriptRevision=2;p.onProgress({text:'已找到相关资料',provenance:{runId:'real'}});return {text:'full'};}},isCurrentDelegation:()=>true,retirePreDispatchUserTurnPrefix:()=>false,tracePublicProgress(){},formatCallerConditionEnvelope:r=>r.text,sendAppend:(id,text,channel)=>{frames.push({text,channel});return true;},nativeUserTurnText:new Map(),completedUserTurns:new Set()});
 await c.runDelegation({id:'actual',generation:1,userTranscriptRevision:1,prompt:'task'},signal);assert.ok(frames.length>=1);assert.ok(frames.every(f=>f.channel==='commentary'));
});
