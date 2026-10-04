import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {captureOwnedBrowserDirectory,removeOwnedBrowserDirectory} from './private-pulse.mjs';
import {BROWSER_PROBE,SNAPSHOT_ARRAY_FIELDS,SNAPSHOT_PAGED_HEADER_EXPRESSION,SNAPSHOT_CLOCK_LEDGER_LIMIT,SNAPSHOT_SLOW_CLOCK_LEDGER_LIMIT,readBoundedProbeSnapshot} from './browser-probe.mjs';
import {assessDecodedPlaybackWindow,assessIndependentInputConvergence,resolveNativeControlOwner,resolveCanonicalFinalTrace} from './evidence.mjs';
import {resolveEndCallToolWitness,assessEndCallConsultTerminal,resolveLifecycleUserTurn,assessLifecycleSpeech,hasLifecyclePlaybackTail,assessLifecycleFarewell,assessProactiveGreeting,assessLifecyclePostTerminalRtp,assessAutomaticEnd,
  extractLifecycleToolPairs,resolveLifecycleMemoryUser,resolveLifecycleMemoryWeb,resolveLifecycleConsultResult,resolveLifecycleCanonicalBody,normalizeLifecycleFinalBody,
  resolveLifecycleFinalSpeechTurns,hasLifecycleFinalPlaybackTail,assessLifecycleFinalSpeech,readLifecycleHistoryOrRetry,resolveLifecycleValidationProfile,
  selectLifecycleFinalHistoryBinding,assessLifecycleFinalHistory} from './call-lifecycle-evidence.mjs';

test('a narrow end diagnostic never grants combined release evidence or a shared/production test scope',()=>{
 for(const target of ['candidate','shared','v'])assert.deepEqual(resolveLifecycleValidationProfile(undefined,target),{
  name:'full',memoryWebRequired:true,combinedReleaseEvidenceEligible:true});
 assert.deepEqual(resolveLifecycleValidationProfile('end-only','candidate'),{
  name:'end-only',memoryWebRequired:false,combinedReleaseEvidenceEligible:false});
 for(const target of ['shared','v'])assert.throws(()=>resolveLifecycleValidationProfile('end-only',target),/Candidate-only/u);
 for(const value of ['',null,'partial','end','all'])assert.throws(()=>resolveLifecycleValidationProfile(value,'candidate'),/Unknown/u);
 assert.throws(()=>resolveLifecycleValidationProfile('full','production'),/Unknown/u);
});

function cleanupFixture() {
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'gpt-live-cleanup-test-'))),directory=path.join(root,'scratch-owned');
 fs.mkdirSync(directory,{mode:0o700});fs.writeFileSync(path.join(directory,'actual-profile-write'),'owned');
 const identity=captureOwnedBrowserDirectory(directory,{parent:root,prefix:'scratch-'});
 return {root,directory,identity,inspectChrome:()=>({aliveProcesses:[]}),dispose:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('owned cleanup retries only ENOTEMPTY asynchronously after exact Chrome exit',async()=>{
 const f=cleanupFixture(),original=Object.assign(Error('directory not empty'),{code:'ENOTEMPTY'}),waits=[];let calls=0;
 try {
  const result=await removeOwnedBrowserDirectory(f.directory,{identity:f.identity,chromeExited:true,inspectChrome:f.inspectChrome},
   {remove:async(target,options)=>{assert.equal(target,f.directory);assert.equal(options.maxRetries,0);if(++calls===1)throw original;await fs.promises.rm(target,options);},
    wait:async ms=>{waits.push(ms);await Promise.resolve();}});
  assert.deepEqual(result,{removed:true,attempts:2});assert.deepEqual(waits,[100]);assert.equal(fs.existsSync(f.directory),false);
 } finally {f.dispose();}
});
test('owned cleanup preserves every other removal error without retry',async()=>{
 for(const code of ['EACCES','EPERM','EBUSY','EIO','ENOENT']) {
  const f=cleanupFixture(),original=Object.assign(Error('original '+code),{code});let calls=0,waits=0;
  try {
   await assert.rejects(removeOwnedBrowserDirectory(f.directory,{identity:f.identity,chromeExited:true,inspectChrome:f.inspectChrome},
    {remove:async()=>{calls++;throw original;},wait:async()=>{waits++;}}),error=>error===original);
   assert.equal(calls,1);assert.equal(waits,0);assert.equal(fs.existsSync(f.directory),true);
  } finally {f.dispose();}
 }
});
test('ENOTEMPTY retry has an exact bound and retains the actual final error',async()=>{
 const f=cleanupFixture(),errors=[],waits=[];
 try {
  await assert.rejects(removeOwnedBrowserDirectory(f.directory,{identity:f.identity,chromeExited:true,inspectChrome:f.inspectChrome,maxAttempts:3},
   {remove:async()=>{const error=Object.assign(Error('still busy '+errors.length),{code:'ENOTEMPTY'});errors.push(error);throw error;},wait:async ms=>waits.push(ms)}),error=>error===errors[2]);
  assert.equal(errors.length,3);assert.deepEqual(waits,[100,100]);assert.equal(fs.existsSync(f.directory),true);
 } finally {f.dispose();}
});
test('cleanup rejects live Chrome, failed process inspection and neighboring scope before deleting',async()=>{
 const f=cleanupFixture(),neighbor=path.join(f.root,'scratch-neighbor');fs.mkdirSync(neighbor);let removes=0;
 const remove=async()=>{removes++;};
 try {
  await assert.rejects(removeOwnedBrowserDirectory(f.directory,{identity:f.identity,chromeExited:false,inspectChrome:f.inspectChrome},{remove}));
  await assert.rejects(removeOwnedBrowserDirectory(f.directory,{identity:f.identity,chromeExited:true,inspectChrome:()=>({aliveProcesses:[{pid:123,startTicks:'10'}]})},{remove}));
  const inspection=Object.assign(Error('cannot inspect owned process'),{code:'EACCES'});
  await assert.rejects(removeOwnedBrowserDirectory(f.directory,{identity:f.identity,chromeExited:true,inspectChrome:()=>{throw inspection}},{remove}),error=>error===inspection);
  await assert.rejects(removeOwnedBrowserDirectory(neighbor,{identity:f.identity,chromeExited:true,inspectChrome:f.inspectChrome},{remove}));
  await assert.rejects(removeOwnedBrowserDirectory(f.directory,{identity:f.identity,chromeExited:true,inspectChrome:f.inspectChrome,maxAttempts:11},{remove}));
  await assert.rejects(removeOwnedBrowserDirectory(f.directory,{identity:f.identity,chromeExited:true,inspectChrome:f.inspectChrome,retryDelayMs:101},{remove}));
  assert.equal(removes,0);assert(fs.existsSync(f.directory)&&fs.existsSync(neighbor));
 } finally {f.dispose();}
});
test('retry rechecks Chrome exit and exact inode, never follows a replaced directory',async()=>{
 for(const replacement of ['live','inode','symlink']) {
  const f=cleanupFixture(),old=path.join(f.root,'retained-original'),neighbor=path.join(f.root,'untouched-neighbor');fs.mkdirSync(neighbor);
  let removes=0,probes=0;
  try {
   await assert.rejects(removeOwnedBrowserDirectory(f.directory,{identity:f.identity,chromeExited:true,
    inspectChrome:()=>({aliveProcesses:++probes>1&&replacement==='live'?[{pid:123,startTicks:'20'}]:[]})},
    {remove:async()=>{removes++;throw Object.assign(Error('actual ENOTEMPTY'),{code:'ENOTEMPTY'});},wait:async()=>{
     if(replacement==='live')return;
     fs.renameSync(f.directory,old);
     if(replacement==='symlink')fs.symlinkSync(neighbor,f.directory);else fs.mkdirSync(f.directory);
    }}));
   assert.equal(removes,1);assert(fs.existsSync(neighbor));if(replacement!=='live')assert(fs.existsSync(path.join(old,'actual-profile-write')));
  } finally {f.dispose();}
 }
});
test('actual owned Chrome observer retains reparented descendants and refuses PID-reuse ownership',()=>{
 const source=readFileSync(new URL('./private-pulse.mjs',import.meta.url),'utf8');
 const functionSource=source.slice(source.indexOf('export function observeOwnedChromeProcesses'),source.indexOf('export async function removeOwnedBrowserDirectory')).replace('export function','function');
 const files=new Map(),profile='/tmp/unique-owned/profile';
 const put=(pid,startTicks,{parent=1,state='S',args=[],children=[]}={})=>{
  const fields=Array(20).fill('0');fields[0]=state;fields[1]=String(parent);fields[19]=startTicks;
  files.set('/proc/'+pid+'/stat',pid+' (chrome process) '+fields.join(' '));files.set('/proc/'+pid+'/cmdline',args.join('\0'));
  files.set('/proc/'+pid+'/task/'+pid+'/children',children.join(' '));
 };
 put(10,'100',{args:['chrome','--user-data-dir='+profile],children:[11]});put(11,'110',{parent:10,args:['chrome','--type=renderer']});
 put(90,'900',{args:['chrome','--user-data-dir='+profile+'-neighbor']});
 const view={readFileSync:file=>{if(!files.has(file))throw Object.assign(Error('exited'),{code:'ENOENT'});return files.get(file);},
  readdirSync:()=>[...files.keys()].filter(k=>k.endsWith('/stat')).map(k=>k.split('/')[2])};
 const observe=vm.runInNewContext(functionSource+';observeOwnedChromeProcesses',{fs:view,assert,path,Date});
 const original=observe({profile,rootPid:10});assert.deepEqual(Array.from(original.aliveProcesses,row=>row.pid),[10,11]);
 for(const key of [...files.keys()])if(key.startsWith('/proc/10/'))files.delete(key);
 const reparented=observe({profile,rootPid:10,knownProcesses:original.knownProcesses});assert.deepEqual(Array.from(reparented.aliveProcesses,row=>row.pid),[11]);
 put(11,'111',{args:['unrelated-process']});
 const reused=observe({profile,rootPid:10,knownProcesses:original.knownProcesses});assert.equal(reused.aliveProcesses.length,0);
 put(10,'101',{args:['unrelated-process']});assert.throws(()=>observe({profile,rootPid:10}),/PID\/profile mismatch/u);
});
test('actual lifecycle cleanup records a nonretryable filesystem FAIL without masking the original test failure',async()=>{
 const f=cleanupFixture(),chromeTemp=path.join(f.root,'gpt-live-chrome-owned');fs.mkdirSync(chromeTemp,{mode:0o700});
 const chromeTempIdentity=captureOwnedBrowserDirectory(chromeTemp,{parent:f.root,prefix:'gpt-live-chrome-'});
 const source=readFileSync(new URL('./call-lifecycle-smoke.mjs',import.meta.url),'utf8');
 const block=source.slice(source.indexOf(' if(chromeTemp){try {cleanup.chromeTempRemoval='),source.indexOf(" check('actual-'+validationTarget+'-config-unchanged'"));
 assert(block.includes('await removeOwnedBrowserDirectory')&&!block.includes('rmSync'));
 const original={name:'test-exception',passed:false,message:'SessionTranscriptProjectionUnavailableError'},checks=[original],cleanup={chromeExited:true,chromeProcessesExited:true};
 const failure=Object.assign(Error('original permission error'),{code:'EACCES'});let waitCalls=0;
 try {
  const run=vm.runInNewContext('(async()=>{'+block+'})',{chromeTemp,chromeTempIdentity,scratch:f.directory,scratchIdentity:f.identity,cleanup,fs,finalHistoryCaptureError:null,
   inspectChrome:f.inspectChrome,check:(name,passed,details={})=>checks.push({name,passed,...details}),
   removeOwnedBrowserDirectory:(directory,options)=>removeOwnedBrowserDirectory(directory,options,{remove:async(target,flags)=>{
    if(target===chromeTemp)throw failure;await fs.promises.rm(target,flags);},wait:async()=>{waitCalls++;}})});
  await run();assert.equal(checks[0],original);assert.equal(waitCalls,0);
  assert.equal(checks.find(c=>c.name==='private-browser-temp-cleanup').code,'EACCES');
  assert.equal(checks.find(c=>c.name==='owned-browser-and-scratch-cleanup').passed,false);
  assert.equal(fs.existsSync(chromeTemp),true);assert.equal(fs.existsSync(f.directory),false);
 } finally {f.dispose();}
});

test('the exact temporary rebuilding failure yields a retry without inventing or replacing history',async()=>{
 const history={messages:[{role:'assistant',content:'Actual stored result'}]},observed=[];
 let latest=await readLifecycleHistoryOrRetry(async()=>history,error=>observed.push(error));
 assert.equal(latest,history);assert.deepEqual(observed,[]);
 const failure=Error('session history is rebuilding; retry shortly');
 const rebuilding=await readLifecycleHistoryOrRetry(async()=>{throw failure},error=>observed.push(error));
 if(rebuilding!==null)latest=rebuilding;
 assert.equal(rebuilding,null);assert.equal(latest,history);assert.deepEqual(observed,[failure]);
 const newer={messages:[{role:'toolResult',content:'Actual completed tool result'}]};
 assert.equal(await readLifecycleHistoryOrRetry(async()=>newer),newer);
});

test('history rebuilding retry matches only the exact error message and propagates every other failure',async()=>{
 for(const message of ['chat.history timeout','session history is rebuilding; retry shortly later',
   'Error: session history is rebuilding; retry shortly','session history is rebuilding; retry shortly\n',
   'session history is unavailable; retry shortly']) {
  const failure=Error(message);let observed=false;
  await assert.rejects(readLifecycleHistoryOrRetry(async()=>{throw failure},()=>{observed=true}),error=>error===failure);
  assert.equal(observed,false);
 }
 const raw='session history is rebuilding; retry shortly';
 await assert.rejects(readLifecycleHistoryOrRetry(async()=>{throw raw}),error=>error===raw);
});

const delegation=(text='{"name":"openclaw_end_call","arguments":{}}')=>({pcIndex:0,at:1000,type:'delegation.created',raw:{item:{id:'item-1',type:'delegation',target:'client',user_bidi_turn_id:'user-1',content:[{type:'input_text',text}]}}});
const tool=(type,at)=>({at,raw:{voiceSessionId:'voice-1',type,name:'openclaw_end_call',callId:'item-1',requestId:'item-1',...(type==='tool.result'?{closeAfterPlayback:true}:{})}});
const witness=()=>({events:[delegation()],tools:[tool('tool.call',1100),tool('tool.result',1200)],pcIndex:0,voiceSessionId:'voice-1'});
const frame=(at,rms=.02)=>({at,pcIndex:0,rms,digitalAudible:rms>.005,muted:false,paused:false,volume:1,contextState:'running',receiverAttachedToPlayback:true,trackState:'live',connected:'connected',rtp:[{id:'receiver-own',timestamp:at,packetsReceived:at,bytesReceived:at*10}]});
function speechState() {
 return {events:[{pcIndex:0,at:1250,type:'turn.created',role:'assistant',turnId:'bye-1'},
   {pcIndex:0,at:1300,type:'output_transcript.added',text:'再见。',turnId:'bye-1'},
   {pcIndex:0,at:1500,type:'turn.done',role:'assistant',text:'再见。',turnId:'bye-1'}],
   audioFrames:Array.from({length:23},(_,i)=>frame(1200+i*50,i<7?.02:0)),
   micFrames:Array.from({length:30},(_,i)=>({at:1000+i*50,pcIndex:0,rms:0,trackState:'live',trackEnabled:true,trackId:'mic',senderTrackId:'mic'})),
   browserTimeOrigin:1000,duplex:{transitions:[{type:'model-end-call-playback-drained',at:1300,requestId:'item-1',originUserTurnId:'user-1',turnId:'bye-1'}]},
   api:[],pcStates:['connected'],remoteAudio:{attached:true}};
}
test('strict native delegation and exact same-owner host call/result are required',()=>{
 const w=resolveEndCallToolWitness(witness());assert.equal(w.requestId,'item-1');assert.equal(w.userTurnId,'user-1');
 for(const mutate of [v=>v.events[0].type='turn.done',v=>v.tools[1].raw.voiceSessionId='neighbor',v=>v.tools[1].raw.requestId='other',
   v=>v.tools[1].raw.closeAfterPlayback=false,v=>v.tools.push(tool('tool.error',1300)),v=>v.events.push(delegation())]){
  const input=witness();mutate(input);assert.equal(resolveEndCallToolWitness(input),null);
 }
});
test('USER caption, partial or extended JSON is never a tool invocation',()=>{
 for(const text of ['帮我挂电话','{"name":"openclaw_end_call","arguments":',
   '{"name":"openclaw_end_call","arguments":{"voiceSessionId":"neighbor"}}',
   '{"name":"openclaw_end_call","arguments":{},"owner":"voice-1"}',
   '{"name":"other_tool","arguments":{}}']){
  const input=witness();input.events=[delegation(text)];assert.equal(resolveEndCallToolWitness(input),null);
 }
});
test('same request host SSE may arrive before native data-channel declaration without changing identity',()=>{
 const input=witness();input.after=800;input.tools=[tool('tool.call',900),tool('tool.result',950)];
 const proof=resolveEndCallToolWitness(input);assert(proof);assert.equal(proof.receiptClockOrder.SSEBeforeNativeFrame,true);
 assert.equal(proof.delegation.at,1000);assert.equal(proof.call.at,900);
 input.tools[1].raw.voiceSessionId='neighbor';assert.equal(resolveEndCallToolWitness(input),null);
});
test('complete keep and explicit hang-up USER turns remain distinct',()=>{
 const e=(text,at=2000)=>({pcIndex:0,at,type:'turn.done',role:'user',turnId:'user-1',text});
 assert(resolveLifecycleUserTurn([e('今天先聊到这里，不过先别挂，我还想问你一件事。')],{pcIndex:0,after:1000,intent:'keep'}));
 assert.equal(resolveLifecycleUserTurn([e('今天先聊到这里')],{pcIndex:0,after:1000,intent:'keep'}),null);
 assert(resolveLifecycleUserTurn([e('今天就先这样，你帮我把电话挂掉吧。')],{pcIndex:0,after:1000,intent:'end'}));
 assert.equal(resolveLifecycleUserTurn([e('今天先聊到这里，不过先别挂，我还想问你一件事。')],{pcIndex:0,after:1000,intent:'end'}),null);
});
test('natural goodbye fixture is verified as complete input, not used to fabricate an end tool',()=>{
 const e=text=>({pcIndex:0,at:2000,type:'turn.done',role:'user',turnId:'user-1',text});
 const params={pcIndex:0,after:1000,intent:'end',expectedText:'今天就先这样，谢谢你，拜拜。'};
 assert(resolveLifecycleUserTurn([e('今天就先这样,谢谢你,拜拜。')],params));
 assert.equal(resolveLifecycleUserTurn([e('今天就先这样')],params),null);
 assert.equal(resolveEndCallToolWitness({events:[e(params.expectedText)],tools:[],pcIndex:0,voiceSessionId:'voice-1'}),null);
});

// Actual client-tool adapter contract: jsonResult stores the same pending
// object in details and a text block; the live global result also has terminate.
function backendEndFixture() {
 const sessionKey='agent:makaron:explicit:gpt-live-h5-experiment-own',backendRunId='talk-realtime-consult:actual-end',
   backendToolCallId='call_00_actualEnd',nativeDelegationId='item_actualEnd',userTurnId='turn_actualEnd';
 const marker={status:'pending',tool:'openclaw_end_call',message:'Tool execution delegated to client'};
 const receipt={voiceSessionId:'voice-1',name:'openclaw_end_call',source:'backend_model_client_tool',
   callId:backendToolCallId,backendToolCallId,backendRunId,requestId:nativeDelegationId,nativeDelegationId,
   originUserTurnId:userTurnId,delegationGeneration:1,status:'accepted'};
 const native=delegation('今天就先这样，谢谢你，拜拜。');native.raw.item.id=nativeDelegationId;native.raw.item.user_bidi_turn_id=userTurnId;
 const toolEvent=(phase,ts,data)=>({event:'session.tool',at:ts+80,payload:{sessionKey,runId:backendRunId,stream:'tool',ts,seq:ts,
   data:{phase,name:'openclaw_end_call',toolCallId:backendToolCallId,...data}}});
 return {pcIndex:0,voiceSessionId:'voice-1',sessionKey,userTurnId,after:800,before:2350,
  events:[{pcIndex:0,at:900,type:'turn.created',role:'user',turnId:userTurnId},
    {pcIndex:0,at:980,type:'turn.done',role:'user',turnId:userTurnId,text:'今天就先这样，谢谢你，拜拜。'},native],
  tools:[{at:1030,raw:{voiceSessionId:'voice-1',type:'tool.call',callId:backendRunId}},
    {at:1170,raw:{...receipt,type:'tool.call'}},{at:1190,raw:{...receipt,type:'tool.result',closeAfterPlayback:true}}],
  backendEvents:[toolEvent('start',1070,{args:{}}),toolEvent('result',1150,{isError:false,
    result:{details:marker,content:[{type:'text',text:JSON.stringify(marker)}],terminate:true}})],
  backendHistory:{sessionKey,observedAt:1210,history:{sessionKey,messages:[{role:'assistant',timestamp:1,content:[
    {type:'toolCall',id:backendToolCallId,name:'openclaw_end_call',arguments:{}}]},
    {role:'toolResult',toolCallId:backendToolCallId,toolName:'openclaw_end_call',timestamp:2,isError:false,
      details:marker,content:[{type:'text',text:JSON.stringify(marker)}]}]}}};
}
test('plain native delegation closes only through real model tool start/result plus durable same-owner history',()=>{
 const input=backendEndFixture(),proof=resolveEndCallToolWitness(input);assert(proof);
 assert.equal(proof.requestId,'item_actualEnd');assert.equal(proof.backendToolCallId,'call_00_actualEnd');
 assert.equal(proof.backendRunId,'talk-realtime-consult:actual-end');assert.equal(proof.userTurnId,'turn_actualEnd');
 assert.equal(proof.backendResult.payload.ts,1150);assert.equal(proof.farewellAfter,1150);
 assert.equal(proof.historyObservedBeforeClose,true);assert.equal(proof.historyObservationPhase,'pre-close');
 // Both genuine subscribed channels can deliver exactly the same envelope.
 input.backendEvents.push({...structuredClone(input.backendEvents[1]),event:'agent'});
 assert(resolveEndCallToolWitness(input));
 // The persisted adapter marker can be its original JSON text if details were
 // not serialized. It remains a toolResult with the exact real toolCallId.
 delete input.backendHistory.history.messages[1].details;
 input.backendHistory.history.messages[0].content[0].arguments='{}';
 assert(resolveEndCallToolWitness(input));
});
test('a late durable history read may corroborate pre-close source events without inventing a later tool execution',()=>{
 const input=backendEndFixture();input.backendHistory.observedAt=3000;
 const proof=resolveEndCallToolWitness(input);assert(proof);
 assert.equal(proof.historyObservedBeforeClose,false);assert.equal(proof.historyObservationPhase,'post-close');
 assert.equal(proof.historyObservedAt,3000);assert.equal(proof.backendResult.payload.ts,1150);
 input.backendEvents[1].payload.ts=2400;assert.equal(resolveEndCallToolWitness(input),null);
});

function settledEndConsultFixture() {
 const input=backendEndFixture(),tool=resolveEndCallToolWitness(input),before=input.before;
 input.tools.push({at:1250,raw:{voiceSessionId:tool.voiceSessionId,type:'tool.result',callId:tool.backendRunId}});
 input.api=[{route:'/api/close',status:200,requestedAt:before,request:{voiceSessionId:tool.voiceSessionId}}];
 return {state:input,tool,before};
}
test('end acceptance and the original generic consult result are independent exact-owner evidence',()=>{
 const f=settledEndConsultFixture(),proof=assessEndCallConsultTerminal(f.state,f);
 assert.equal(proof.passed,true);assert.deepEqual(proof.issues,[]);
 assert.equal(proof.call,f.tool.consultCall);assert.equal(proof.result.raw.callId,f.tool.backendRunId);
 assert.equal(proof.result.raw.name,undefined);assert.notEqual(proof.result,f.tool.result);
 assert.equal(proof.terminals.length,1);assert.equal(proof.before,f.before);
 // A neighboring voice/run and a post-close event cannot change this owner.
 f.state.tools.push({at:1260,raw:{voiceSessionId:'neighbor',type:'tool.error',callId:f.tool.backendRunId}},
  {at:1260,raw:{voiceSessionId:f.tool.voiceSessionId,type:'tool.error',callId:'another-run'}},
  {at:f.before+1,raw:{voiceSessionId:f.tool.voiceSessionId,type:'tool.error',callId:f.tool.backendRunId}});
 assert.equal(assessEndCallConsultTerminal(f.state,f).passed,true);
});
test('missing, rejected, duplicate or causally invalid consult terminals cannot be hidden by end acceptance',()=>{
 const mutations=[
  ['no generic result',f=>f.state.tools.pop()],
  ['only named end receipt',f=>{f.state.tools.pop();f.state.tools.push(structuredClone(f.tool.result));}],
  ['wrong voice result',f=>f.state.tools.at(-1).raw.voiceSessionId='neighbor'],
  ['wrong run result',f=>f.state.tools.at(-1).raw.callId='another-run'],
  ['named generic result',f=>f.state.tools.at(-1).raw.name='openclaw_end_call'],
  ['generic error',f=>f.state.tools.at(-1).raw.type='tool.error'],
  ['error followed by success',f=>f.state.tools.push({at:1230,raw:{voiceSessionId:f.tool.voiceSessionId,type:'tool.error',callId:f.tool.backendRunId}})],
  ['duplicate result',f=>f.state.tools.push(structuredClone(f.state.tools.at(-1)))],
  ['duplicate original call',f=>f.state.tools.push(structuredClone(f.tool.consultCall))],
  ['result before accepted end receipt',f=>f.state.tools.at(-1).at=f.tool.result.at-1],
  ['result at original close',f=>f.state.tools.at(-1).at=f.before],
  ['result after original close',f=>f.state.tools.at(-1).at=f.before+1],
  ['unknown result clock',f=>delete f.state.tools.at(-1).at],
  ['unknown error clock',f=>f.state.tools.push({raw:{voiceSessionId:f.tool.voiceSessionId,type:'tool.error',callId:f.tool.backendRunId}})],
  ['error at close boundary',f=>f.state.tools.push({at:f.before,raw:{voiceSessionId:f.tool.voiceSessionId,type:'tool.error',callId:f.tool.backendRunId}})],
  ['wrong witness run',f=>f.tool={...f.tool,backendRunId:'another-run'}],
  ['wrong witness voice',f=>f.tool={...f.tool,voiceSessionId:'neighbor'}],
  ['changed original call clock',f=>f.tool={...f.tool,consultCall:{...f.tool.consultCall,at:1029}}],
  ['direct native JSON witness',f=>f.tool=resolveEndCallToolWitness(witness())],
  ['no end witness',f=>f.tool=null],
  ['unaccepted witness receipt',f=>f.tool={...f.tool,result:{...f.tool.result,raw:{...f.tool.result.raw,status:'pending'}}}],
  ['missing original close',f=>f.state.api=[]],
  ['foreign close owner',f=>f.state.api[0].request.voiceSessionId='neighbor'],
  ['unbounded cutoff',f=>f.before=Infinity],
 ];
 for(const [name,mutate] of mutations){const f=settledEndConsultFixture();mutate(f);assert.equal(assessEndCallConsultTerminal(f.state,f).passed,false,name);}
});
test('historical 0a8728f accepted end followed by its same-run 84ms tool.error remains FAIL under the new gate',()=>{
 // Scalar metadata copied from the immutable 0a8728f browser-native-evidence
 // and end-tool witness. No transcript, PCM, old receipt or check is rewritten.
 const voiceSessionId='8a24741b-55cf-43da-b48e-c321ef0f28bb',
  backendRunId='talk-realtime-consult:1791088531772:b91c26d9-2c42-4560-854f-ed378a25031c',
  requestId='item_EV8EdcbgpahyvPYBCiXnI',backendToolCallId='call_00_Z00eWpCNPyogPU0dZQ513819',userTurnId='turn_EV8EakUIjRaCxN3UaOxfL';
 const consultCall={at:1791088531783,raw:{voiceSessionId,type:'tool.call',callId:backendRunId}},
  error={at:1791088536912,raw:{voiceSessionId,type:'tool.error',callId:backendRunId}};
 const tool={voiceSessionId,backendRunId,requestId,backendToolCallId,userTurnId,consultCall,
  result:{at:1791088536828,raw:{voiceSessionId,backendRunId,requestId,backendToolCallId,originUserTurnId:userTurnId,
   type:'tool.result',name:'openclaw_end_call',source:'backend_model_client_tool',status:'accepted',closeAfterPlayback:true}},
  source:'exact-backend-model-tool-global-stream-and-durable-history-with-native-USER-and-host-owner'};
 const before=1791088540459,state={tools:[consultCall,tool.result,error],api:[{route:'/api/close',status:200,requestedAt:before,request:{voiceSessionId}}]};
 const proof=assessEndCallConsultTerminal(state,{tool,before});
 assert.equal(error.at-tool.result.at,84);assert.equal(proof.passed,false);
 assert.deepEqual(proof.errors,[error]);assert.equal(proof.results.length,0);
 assert(proof.issues.includes('owned-consult-tool-error'));assert(proof.issues.includes('normal-consult-result-not-unique'));
});

test('promises, quoted JSON, wrong run/child/session and missing full source cannot pass the backend path',()=>{
 const mutations=[
  ['ordinary spoken bye',f=>{f.tools=[];f.backendEvents=[];}],
  ['fabricated JSON declaration',f=>f.events[2].raw.item.content[0].text='{"name":"openclaw_end_call","arguments":{}}'],
  ['metadata-only hook',f=>delete f.backendEvents[1].payload.data.result],
  ['no global stream',f=>f.backendEvents=[]],
  ['child run',f=>f.backendEvents.forEach(e=>e.payload.runId='child-actual')],
  ['wrong canonical session',f=>f.backendEvents[1].payload.sessionKey='agent:makaron:subagent:child'],
  ['foreign persisted session',f=>f.backendHistory.sessionKey='neighbor'],
  ['history response session mismatch',f=>f.backendHistory.history.sessionKey='neighbor'],
  ['history response session missing',f=>delete f.backendHistory.history.sessionKey],
  ['no original consult run',f=>f.tools[0].raw.callId='another-parent'],
  ['wrong backend id',f=>f.tools[2].raw.backendToolCallId='call_other'],
  ['wrong native id',f=>f.tools[2].raw.nativeDelegationId='item_other'],
  ['wrong original USER',f=>f.tools[2].raw.originUserTurnId='turn_other'],
  ['foreign voice owner',f=>f.tools[2].raw.voiceSessionId='neighbor'],
  ['unaccepted host result',f=>f.tools[2].raw.status='pending'],
  ['no close-after-playback',f=>f.tools[2].raw.closeAfterPlayback=false],
  ['generation mismatch',f=>f.tools[2].raw.delegationGeneration=2],
  ['tool error',f=>f.tools.push({at:1200,raw:{...f.tools[2].raw,type:'tool.error'}})],
  ['only USER caption',f=>f.events.splice(2,1)],
  ['no complete original USER',f=>f.events.splice(1,1)],
 ];
 for(const [name,mutate] of mutations){const input=backendEndFixture();mutate(input);assert.equal(resolveEndCallToolWitness(input),null,name);}
});
test('adapter and history require strict empty arguments, nonerror pending marker and single exact invocation',()=>{
 const mutations=[
  ['source args extra',f=>f.backendEvents[0].payload.data.args={voiceSessionId:'voice-1'}],
  ['source args string',f=>f.backendEvents[0].payload.data.args='{}'],
  ['source args absent',f=>delete f.backendEvents[0].payload.data.args],
  ['source error',f=>f.backendEvents[1].payload.data.isError=true],
  ['source unknown error state',f=>delete f.backendEvents[1].payload.data.isError],
  ['missing terminate',f=>delete f.backendEvents[1].payload.data.result.terminate],
  ['nonpending result',f=>f.backendEvents[1].payload.data.result.details.status='success'],
  ['wrong tool marker',f=>f.backendEvents[1].payload.data.result.details.tool='web_fetch'],
  ['wrong adapter message',f=>f.backendEvents[1].payload.data.result.details.message='Assistant promised to hang up'],
  ['content-only source',f=>delete f.backendEvents[1].payload.data.result.details],
  ['no durable result',f=>f.backendHistory.history.messages.pop()],
  ['persisted error',f=>f.backendHistory.history.messages[1].isError=true],
  ['persisted unknown error state',f=>delete f.backendHistory.history.messages[1].isError],
  ['wrong persisted result id',f=>f.backendHistory.history.messages[1].toolCallId='call_other'],
  ['wrong persisted call name',f=>f.backendHistory.history.messages[0].content[0].name='web_fetch'],
  ['wrong persisted result name',f=>f.backendHistory.history.messages[1].toolName='web_fetch'],
  ['persisted arguments extra',f=>f.backendHistory.history.messages[0].content[0].arguments={requestId:'item_actualEnd'}],
  ['webpage mention',f=>f.backendHistory.history.messages[0].content=[{type:'text',text:'openclaw_end_call({})'}]],
  ['ordinary result text',f=>{delete f.backendHistory.history.messages[1].details;f.backendHistory.history.messages[1].content[0].text='再见。';}],
  ['conflicting result marker',f=>f.backendHistory.history.messages[1].details={status:'blocked'}],
  ['duplicate stored result',f=>f.backendHistory.history.messages.push(structuredClone(f.backendHistory.history.messages[1]))],
  ['distinct duplicate source result',f=>{const duplicate=structuredClone(f.backendEvents[1]);duplicate.payload.seq++;f.backendEvents.push(duplicate);}],
  ['source result before start',f=>f.backendEvents[1].payload.ts=1060],
  ['source result after host accepted',f=>f.backendEvents[1].payload.ts=1180],
  ['history observed before actual tool',f=>f.backendHistory.observedAt=1100],
 ];
 for(const [name,mutate] of mutations){const input=backendEndFixture();mutate(input);assert.equal(resolveEndCallToolWitness(input),null,name);}
});
test('a new USER invalidates a late old backend end request, including a new incomplete turn',()=>{
 for(const type of ['turn.created','turn.done']){
  const input=backendEndFixture();input.events.push({pcIndex:0,at:1100,type,role:'user',turnId:'turn_new',text:'先别挂'});
  assert.equal(resolveEndCallToolWitness(input),null);
 }
 const input=backendEndFixture();input.before=1180;assert.equal(resolveEndCallToolWitness(input),null,'Missing pre-close accepted result remains a failure');
});
test('backend farewell excludes an early consult acknowledgment and joins the exact model-tool drain',()=>{
 const input=backendEndFixture(),tool=resolveEndCallToolWitness(input),state=speechState();
 state.duplex.transitions[0]={...state.duplex.transitions[0],requestId:tool.requestId,originUserTurnId:tool.userTurnId,
   source:'backend_model_client_tool',backendToolCallId:tool.backendToolCallId,backendRunId:tool.backendRunId,nativeDelegationId:tool.requestId};
 state.events.unshift({pcIndex:0,at:1040,type:'turn.created',role:'assistant',turnId:'ack'},
   {pcIndex:0,at:1050,type:'output_transcript.added',turnId:'ack',text:'好的，我来处理。'},
   {pcIndex:0,at:1130,type:'turn.done',role:'assistant',turnId:'ack',text:'好的，我来处理。'});
 const farewell=assessLifecycleFarewell(state,{pcIndex:0,tool,before:2350});assert(farewell);
 assert.equal(farewell.terminal.turnId,'bye-1');assert(farewell.window.created.at>tool.farewellAfter);
 state.pcStates[0]='closed';state.remoteAudio.attached=false;
 state.api=[{route:'/api/close',status:200,requestedAt:2350,request:{voiceSessionId:'voice-1'}}];
 assert.equal(assessAutomaticEnd(state,{pcIndex:0,owner:{voiceSessionId:'voice-1'},tool,farewell}).passed,true);
 for(const mutate of [s=>s.duplex.transitions[0].backendToolCallId='call_other',s=>s.duplex.transitions[0].backendRunId='another-run',
   s=>s.duplex.transitions[0].source='assistant-promise',s=>s.duplex.transitions[0].nativeDelegationId='item_other']){
  const value=structuredClone(state);mutate(value);const proof=assessLifecycleFarewell(value,{pcIndex:0,tool,before:2350});
  assert.equal(assessAutomaticEnd(value,{pcIndex:0,owner:{voiceSessionId:'voice-1'},tool,farewell:proof}).passed,false);
 }
 const early=speechState();early.events[0].at=1040;early.events[1].at=1050;
 assert.equal(assessLifecycleFarewell(early,{pcIndex:0,tool,before:2350}),null,'A turn already speaking before the real end tool is not farewell');
});
test('farewell requires complete player state and post-terminal 750ms real RTP quiet',()=>{
 const state=speechState(),proof=assessLifecycleSpeech(state,{pcIndex:0,after:1200,requireCreatedAfter:true});assert(proof);
 assert(proof.window.to>proof.terminal.at);assert(proof.quiet.durationMs>=750);
 for(const mutate of [s=>s.audioFrames[3].paused=true,s=>s.audioFrames[4].volume=0,
   s=>s.audioFrames[5].contextState='suspended',s=>s.audioFrames[6].receiverAttachedToPlayback=false,
   s=>s.audioFrames=s.audioFrames.slice(0,-4),s=>s.audioFrames[21].rms=.02]){
  const input=speechState();mutate(input);assert.equal(assessLifecycleSpeech(input,{pcIndex:0,after:1200,requireCreatedAfter:true}),null);
 }
});
test('a required same-stream speech boundary cannot accept an earlier created turn',()=>{
 const state=speechState();state.events[0].at=1100;
 assert.equal(assessLifecycleSpeech(state,{pcIndex:0,after:1200,requireCreatedAfter:true}),null);
});
test('tail readiness retains strict quiet and cannot replace full caption/player validation',()=>{
 const state=speechState();assert.equal(hasLifecyclePlaybackTail(state,{pcIndex:0,after:1200}),true);
 for(const change of [s=>s.audioFrames=s.audioFrames.slice(0,-4),s=>s.audioFrames[21].rms=.02,
   s=>s.audioFrames=s.audioFrames.filter(f=>![1800,1850].includes(f.at)),s=>s.audioFrames[21].paused=true,
   s=>s.audioFrames=s.audioFrames.map(f=>({...f,rtp:[]}))]){
  const input=speechState();change(input);assert.equal(hasLifecyclePlaybackTail(input,{pcIndex:0,after:1200}),false);
 }
 state.events=state.events.filter(e=>e.type!=='output_transcript.added');
 assert.equal(hasLifecyclePlaybackTail(state,{pcIndex:0,after:1200}),true);
 assert.equal(assessLifecycleSpeech(state,{pcIndex:0,after:1200,requireCreatedAfter:true}),null);
});
test('input-start boundary preserves response prefix received before complete USER terminal',()=>{
 const state=speechState();state.events.push({pcIndex:0,at:1400,type:'turn.done',role:'user',turnId:'u',text:'今天先聊到这里，不过先别挂，我还想问你一件事。'});
 assert(resolveLifecycleUserTurn(state.events,{pcIndex:0,after:1200,intent:'keep'}));
 assert(assessLifecycleSpeech(state,{pcIndex:0,after:1200,requireCreatedAfter:true}));
 assert.equal(assessLifecycleSpeech(state,{pcIndex:0,after:1400,requireCreatedAfter:true}),null);
});
test('whole-speech sampling gaps remain strict FAIL while retaining actual functional speech and tail',()=>{
 const state=speechState();state.audioFrames=state.audioFrames.filter(f=>![1300,1350].includes(f.at));
 const proof=assessLifecycleSpeech(state,{pcIndex:0,after:1200,requireCreatedAfter:true});
 assert(proof);assert.equal(proof.strictCompletePlaybackPassed,false);assert.equal(proof.playback.passed,false);
 assert.equal(proof.playback.gaps.length,1);assert(proof.quiet.durationMs>=750);
});
test('a Memory stage and later Web final in one native turn retain the entire caption and playback window',()=>{
 const state=speechState(),after=1200,terminalAfter=1400;
 state.events[1].text='记忆结果已找到。';
 state.events.splice(2,0,{pcIndex:0,at:1450,type:'output_transcript.added',text:'官方网页结果也已确认。',turnId:'bye-1'});
 state.events.at(-1).text='记忆结果已找到。官方网页结果也已确认。';
 state.events.unshift({pcIndex:0,at:1210,type:'turn.created',role:'assistant',turnId:'early-ack'},
   {pcIndex:0,at:1220,type:'output_transcript.added',text:'我来查询。',turnId:'early-ack'},
   {pcIndex:0,at:1240,type:'turn.done',role:'assistant',text:'我来查询。',turnId:'early-ack'});
 assert.equal(assessLifecycleSpeech(state,{pcIndex:0,after:terminalAfter,requireCreatedAfter:true}),null,'The Web clock must not clip the Memory prefix');
 const proof=assessLifecycleSpeech(state,{pcIndex:0,after,terminalAfter,requireCreatedAfter:true});assert(proof);
 assert.equal(proof.terminal.turnId,'bye-1');assert.equal(proof.window.captions.length,2);
 assert.equal(proof.window.firstCaptionAt,1300);assert(proof.window.from<terminalAfter);
 assert.equal(proof.playback.passed,true);assert(proof.quiet.durationMs>=750);
 assert.equal(hasLifecyclePlaybackTail(state,{pcIndex:0,after,terminalAfter}),true);
 for(const terminalClock of [proof.terminal.at,proof.terminal.at+1]) {
  assert.equal(assessLifecycleSpeech(state,{pcIndex:0,after,terminalAfter:terminalClock,requireCreatedAfter:true}),null);
  assert.equal(hasLifecyclePlaybackTail(state,{pcIndex:0,after,terminalAfter:terminalClock}),false);
 }
 const earlyOnly=structuredClone(state);earlyOnly.events=earlyOnly.events.filter(e=>e.turnId==='early-ack');
 assert.equal(assessLifecycleSpeech(earlyOnly,{pcIndex:0,after,terminalAfter,requireCreatedAfter:true}),null,'An earlier acknowledgment cannot substitute for the completed result');
 assert.equal(hasLifecyclePlaybackTail(earlyOnly,{pcIndex:0,after,terminalAfter}),false);
 for(const mutate of [s=>s.audioFrames[3].paused=true,s=>s.audioFrames[4].volume=0,
   s=>s.audioFrames=s.audioFrames.slice(0,-4),s=>s.events.find(e=>e.turnId==='bye-1'&&e.type==='output_transcript.added').text='字幕前缀不完整']) {
  const input=structuredClone(state);mutate(input);
  assert.equal(assessLifecycleSpeech(input,{pcIndex:0,after,terminalAfter,requireCreatedAfter:true}),null);
 }
 const gap=structuredClone(state);gap.audioFrames=gap.audioFrames.filter(f=>![1300,1350].includes(f.at));
 assert.equal(assessLifecycleSpeech(gap,{pcIndex:0,after,terminalAfter,requireCreatedAfter:true}).playback.passed,false,'The complete pre-Web window still retains sampling FAIL');
});
test('actual smoke waitSpeech passes an independent terminal boundary without changing defaults or exceptions',async()=>{
 const source=readFileSync(new URL('./call-lifecycle-smoke.mjs',import.meta.url),'utf8');
 const from=source.indexOf('async function waitSpeech('),to=source.indexOf('\nfunction recordSpeech(',from);
 assert(from>=0&&to>from,'Execute the actual observer function');
 const state=speechState(),calls=[];
 const waitSpeech=vm.runInNewContext('('+source.slice(from,to)+')',{
  hasLifecyclePlaybackTail,assessLifecycleSpeech,snapshot:async full=>{assert.equal(full,true);return state;},
  waitFor:async(predicate,label,max)=>{calls.push({label,max});return predicate(state);},
 });
 const params=[0,1200,'actual complete native speech'];
 assert.equal((await waitSpeech(...params)).terminal.turnId,'bye-1');
 assert.equal((await waitSpeech(...params,Infinity,{terminalAfter:1400})).terminal.turnId,'bye-1');
 assert.equal(await waitSpeech(...params,Infinity,{terminalAfter:1500}),null);
 assert(calls.every(c=>c.max===45000),'The original timeout is unchanged');
 const failure=Error('Native spoken Memory/Web result after actual backend completion deadline');
 for(const error of [failure,Error('CDP Runtime.evaluate timeout')]) {
  const run=vm.runInNewContext('('+source.slice(from,to)+')',{
   hasLifecyclePlaybackTail,assessLifecycleSpeech,snapshot:async()=>state,waitFor:async()=>{throw error;},
  });
  await assert.rejects(run(...params,Infinity,{terminalAfter:1400}),e=>e===error,'No broad deadline or transport catch');
 }
});
test('proactive greeting requires silent original microphone and no USER/delegation',()=>{
 const state=speechState(),params={pcIndex:0,owner:{connectedAt:1200},readyAt:1200};
 assert.equal(assessProactiveGreeting(state,params).passed,true);
 state.micFrames[8].rms=.03;assert.equal(assessProactiveGreeting(state,params).passed,false);
 const input=speechState();input.events.push({pcIndex:0,at:1400,type:'turn.done',role:'user',turnId:'u',text:'你好'});
 assert.equal(assessProactiveGreeting(input,params).passed,false);
 const other=speechState();other.events.push({...delegation(),at:1400});assert.equal(assessProactiveGreeting(other,params).passed,false);
});
test('actual smoke greeting retains its completed strict window when a later full snapshot has a new gap',async()=>{
 const source=readFileSync(new URL('./call-lifecycle-smoke.mjs',import.meta.url),'utf8');
 const from=source.indexOf('async function greeting(pcIndex){'),to=source.indexOf('\nfunction ownedGatewayEvents()',from);
 assert(from>=0&&to>from,'Execute the actual smoke function, not a copied implementation');
 const run=async(state,proof,{pcIndex=0,profile='full',USERClipsFed=0}={})=>{
  const checks=[],records=[],owner={connectedAt:1200},ready={requestedAt:1200},greeting=vm.runInNewContext('('+source.slice(from,to)+')',{
   owners:new Map([[pcIndex,owner]]),waitFor:async()=>ready,waitSpeech:async()=>proof,snapshot:async()=>state,
   validationProfile:resolveLifecycleValidationProfile(profile,'candidate'),
   assessProactiveGreeting,pulse:{plays:Array.from({length:USERClipsFed},()=>({}))},coreCheck:(name,passed,details)=>checks.push({name,passed:Boolean(passed),details}),
   recordSpeech:(name,value)=>records.push({name,value}),save(){}});
  await greeting(pcIndex);return {check:checks[0],record:records[0]};
 };
 const original=speechState(),proof=assessLifecycleSpeech(original,{pcIndex:0,after:1200,requireCreatedAfter:true});
 assert(proof.playback.passed);assert(proof.quiet.durationMs>=750);
 const later=structuredClone(original);later.audioFrames.push(frame(proof.quiet.to+131,0));
 assert.equal(assessProactiveGreeting(later,{pcIndex:0,owner:{connectedAt:1200},readyAt:1200}),null);
 const observed=await run(later,proof);assert.equal(observed.check.passed,true);
 assert.equal(observed.check.details.greeting.speech.window.to,proof.quiet.to);
 assert.equal(observed.record.value,proof,'Keep the original actual full-window playback proof');
 const user=structuredClone(later);user.events.push({pcIndex:0,at:1400,type:'turn.done',role:'user',turnId:'u',text:'你好'});
 assert.equal((await run(user,proof)).check.passed,false,'A USER inside the proved greeting window remains disqualifying');
 const wrong=structuredClone(proof);wrong.terminal.turnId='another-turn';
 assert.equal((await run(later,wrong)).check.passed,false,'Never borrow the next complete terminal');
 const gap=structuredClone(later);gap.audioFrames=gap.audioFrames.filter(f=>![1850,1900].includes(f.at));
 assert.equal((await run(gap,proof)).check.passed,false,'A gap in the original 750ms quiet window cannot be repaired by bounding');
 const speechGap=speechState();speechGap.audioFrames=speechGap.audioFrames.filter(f=>![1300,1350].includes(f.at));
 const failedWhole=assessLifecycleSpeech(speechGap,{pcIndex:0,after:1200,requireCreatedAfter:true});
 assert.equal(failedWhole.playback.passed,false,'A whole-speech sampling gap retains its strict FAIL');
 const unchanged=await run(speechGap,failedWhole);assert.equal(unchanged.record.value.playback.passed,false);
 const redial=speechState();for(const rows of [redial.events,redial.audioFrames,redial.micFrames])for(const row of rows)row.pcIndex=1;
 const redialProof=assessLifecycleSpeech(redial,{pcIndex:1,after:1200,requireCreatedAfter:true});
 assert.equal((await run(redial,redialProof,{pcIndex:1,profile:'full',USERClipsFed:3})).check.passed,true,'Full redial retains all three prior USER clips');
 const narrow=await run(redial,redialProof,{pcIndex:1,profile:'end-only',USERClipsFed:2});
 assert.equal(narrow.check.passed,true);assert.equal(narrow.check.details.expectedUSERClipsFed,2,'End-only redial has only the keep and end clips');
 assert.equal((await run(redial,redialProof,{pcIndex:1,profile:'full',USERClipsFed:2})).check.passed,false,'Missing Memory/Web input cannot satisfy the full profile');
 assert.equal((await run(redial,redialProof,{pcIndex:1,profile:'end-only',USERClipsFed:3})).check.passed,false,'An extra clip cannot satisfy the narrow scope');
 const newUser=structuredClone(redial);newUser.events.push({pcIndex:1,at:1400,type:'turn.done',role:'user',turnId:'redial-user',text:'你好'});
 assert.equal((await run(newUser,redialProof,{pcIndex:1,profile:'end-only',USERClipsFed:2})).check.passed,false,'Correct profile count never replaces the independent no-USER gate');
 assert.equal((await run(original,proof,{profile:'end-only'})).check.passed,true,'The first call still requires zero fed USER clips');
 assert.equal((await run(original,proof,{profile:'end-only',USERClipsFed:1})).check.passed,false);
});
test('tool accepted alone does not mean closed; same owner must close after entire farewell drain',()=>{
 const state=speechState(),tool=resolveEndCallToolWitness(witness()),farewell=assessLifecycleFarewell(state,{pcIndex:0,tool,before:2350});
 const owner={voiceSessionId:'voice-1'};assert.equal(assessAutomaticEnd(state,{pcIndex:0,owner,tool,farewell}).passed,false);
 state.pcStates[0]='closed';state.remoteAudio.attached=false;state.api=[{route:'/api/close',status:200,requestedAt:2350,at:2400,request:{voiceSessionId:'voice-1'}}];
 assert.equal(assessAutomaticEnd(state,{pcIndex:0,owner,tool,farewell}).passed,true);
 state.api[0].requestedAt=2250;assert.equal(assessAutomaticEnd(state,{pcIndex:0,owner,tool,farewell}).passed,false);
 state.api[0].requestedAt=2350;state.api[0].request.voiceSessionId='neighbor';assert.equal(assessAutomaticEnd(state,{pcIndex:0,owner,tool,farewell}).passed,false);
});
test('farewell may be received before delayed host SSE, joined by the actual native request',()=>{
 const input=witness();input.tools[1].at=1700;
 const tool=resolveEndCallToolWitness(input),state=speechState();state.pcStates[0]='closed';state.remoteAudio.attached=false;
 state.api=[{route:'/api/close',status:200,requestedAt:2350,request:{voiceSessionId:'voice-1'}}];
 const farewell=assessLifecycleFarewell(state,{pcIndex:0,tool,before:2350});assert(farewell);assert(farewell.window.created.at<tool.result.at);
 assert.equal(assessAutomaticEnd(state,{pcIndex:0,owner:{voiceSessionId:'voice-1'},tool,farewell}).passed,true);
});
test('original app drain with a 700ms observer phase tail retains core but not strict750ms proof',()=>{
 const tool=resolveEndCallToolWitness(witness()),state=speechState();state.audioFrames.pop();state.duplex.transitions[0].at=1250;
 state.pcStates[0]='closed';state.remoteAudio.attached=false;state.api=[{route:'/api/close',status:200,requestedAt:2275,request:{voiceSessionId:'voice-1'}}];
 const farewell=assessLifecycleFarewell(state,{pcIndex:0,tool,before:2275});assert(farewell);assert.equal(farewell.strictTailPassed,false);
 const automatic=assessAutomaticEnd(state,{pcIndex:0,owner:{voiceSessionId:'voice-1'},tool,farewell});
 assert.equal(automatic.passed,true);assert.equal(automatic.strictTailPassed,false);assert.equal(farewell.quiet,null);
 for(const change of [s=>s.duplex.transitions[0].requestId='other',s=>s.duplex.transitions[0].turnId='old',
  s=>s.browserTimeOrigin=null,s=>s.audioFrames[4].paused=true]){
  const value=structuredClone(state);change(value);assert.equal(assessLifecycleFarewell(value,{pcIndex:0,tool,before:2275}),null);
 }
});

test('a real app farewell drain cannot convert stale or discontinuous receiver stats into independent750ms proof',()=>{
 const tool=resolveEndCallToolWitness(witness()),owner={voiceSessionId:'voice-1'};
 const make=()=>{const s=speechState();s.pcStates[0]='closed';s.remoteAudio.attached=false;
  s.api=[{route:'/api/close',status:200,requestedAt:2350,request:{voiceSessionId:'voice-1'}}];return s;};
 const valid=make(),farewell=assessLifecycleFarewell(valid,{pcIndex:0,tool,before:2350});
 assert.equal(assessAutomaticEnd(valid,{pcIndex:0,owner,tool,farewell}).strictTailPassed,true);
 for(const change of [
  s=>s.audioFrames=s.audioFrames.map(f=>({...f,rtp:[{id:'receiver-own',timestamp:1400,packetsReceived:1,bytesReceived:10}]})),
  s=>s.audioFrames=s.audioFrames.map(f=>({...f,rtp:[{id:'receiver-own',timestamp:f.at-101,packetsReceived:f.at,bytesReceived:f.at*10}]})),
  s=>s.audioFrames=s.audioFrames.map(f=>({...f,rtp:f.at>1800&&f.at<2250?[]:f.rtp})),
  s=>s.audioFrames=s.audioFrames.map(f=>({...f,rtp:f.rtp.map(r=>({...r,id:f.at%100===0?'odd':'even'}))})),
  s=>s.audioFrames=s.audioFrames.map(f=>({...f,rtp:f.rtp.map(r=>({...r,packetsReceived:3000-f.at,bytesReceived:(3000-f.at)*10}))}))
 ]){
  const s=make();change(s);const actual=assessLifecycleFarewell(s,{pcIndex:0,tool,before:2350});
  assert(actual,'Keep the real functional app witness');assert.equal(actual.strictTailPassed,false);
  const proof=assessAutomaticEnd(s,{pcIndex:0,owner,tool,farewell:actual});
  assert.equal(proof.passed,true,'Functional auto-close remains independent from missing RTP proof');
  assert.equal(proof.strictTailPassed,false);assert.equal(proof.independentRtp,null);
  const forged={...actual,strictTailPassed:true};
  assert.equal(assessAutomaticEnd(s,{pcIndex:0,owner,tool,farewell:forged}).strictTailPassed,false,'Recompute original receiver stats instead of trusting a boolean');
 }
});

test('genuine terminal and pre-release player boundary observations complete the same strict750ms tail',()=>{
 const state=speechState(),tool=resolveEndCallToolWitness(witness());
 // The timer phase begins 49 ms after terminal and ends 35 ms before release.
 state.audioFrames=state.audioFrames.filter(f=>f.at<1500);
 for(let at=1549;at<=2249;at+=50)state.audioFrames.push(frame(at,0));
 state.duplex.transitions[0].at=1284;
 state.pcStates[0]='closed';state.remoteAudio.attached=false;
 state.api=[{route:'/api/close',status:200,requestedAt:2310,request:{voiceSessionId:'voice-1'}}];
 const old=assessLifecycleFarewell(state,{pcIndex:0,tool,before:2310});
 assert(old);assert.equal(old.strictTailPassed,false,'A timer-only700ms phase remains FAIL');
 state.audioFrames.push({...frame(1500,0),sampleSource:'native-assistant-terminal'},
   {...frame(2284,0),sampleSource:'original-pc-close-before-release'});
 const proof=assessLifecycleFarewell(state,{pcIndex:0,tool,before:2310});
 assert.equal(proof.strictTailPassed,true);assert.equal(proof.quiet.durationMs,784);
 assert.equal(proof.quiet.from,1500);assert.equal(proof.window.to,2284);
 assert.equal(assessAutomaticEnd(state,{pcIndex:0,owner:{voiceSessionId:'voice-1'},tool,farewell:proof}).strictTailPassed,true);
 // The original encoded recording covers release, but not a later API call.
 // Neither silent padding nor changing the PCM coverage gate is necessary.
 const pcm=Buffer.alloc((2304-1000)*96);for(let at=0;at<pcm.length;at+=2)pcm.writeInt16LE(100,at);
 assert.equal(assessDecodedPlaybackWindow(pcm,{...old.window,recordingStartedAt:1000}),null);
 assert.equal(assessDecodedPlaybackWindow(pcm,{...proof.window,recordingStartedAt:1000}).coversWholeWindow,true);
 for(const change of [s=>s.audioFrames.at(-1).paused=true,s=>s.audioFrames.at(-1).connected='closed',
   s=>s.audioFrames.at(-1).trackState='ended',s=>s.audioFrames.at(-1).at=2249,
   s=>s.audioFrames=s.audioFrames.map(f=>({...f,rtp:[]}))]){
  const bad=structuredClone(state);change(bad);
  assert.equal(assessLifecycleFarewell(bad,{pcIndex:0,tool,before:2310})?.strictTailPassed===true,false);
 }
});

function browserProbeFixture() {
 let clock=1000,nextTimer=1,level=0;const timers=new Map(),statsRequests=[],closeArgs=[],stopArgs=[];
 class Track {
  constructor(id){this.id=id;this.kind='audio';this.readyState='live';this.enabled=true;this.muted=false;}
  stop(...args){stopArgs.push(args);this.readyState='ended';}
  getSettings(){return {sampleRate:48000,echoCancellation:true};}
 }
 class Stream {constructor(tracks){this.tracks=tracks;}getAudioTracks(){return this.tracks;}getTracks(){return this.tracks;}}
 class RTC extends EventTarget {
  constructor(){super();this.connectionState='connected';this.senderTrack=null;}
  getSenders(){return this.senderTrack?[{track:this.senderTrack}]:[];}
  getStats(){statsRequests.push({at:clock,state:this.connectionState});return Promise.resolve(new Map([['actual',{id:'actual',timestamp:clock,type:'inbound-rtp',kind:'audio',packetsReceived:clock}]]));}
  createDataChannel(){return new EventTarget();}
  close(...args){closeArgs.push(args);this.connectionState='closed';}
 }
 class Context {
  constructor(){this.state='running';}
  createMediaStreamSource(){return {connect(){}};}
  createAnalyser(){return {fftSize:2048,getFloatTimeDomainData(samples){samples.fill(level);}};}
  resume(){return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}
 }
 class Recorder extends EventTarget {constructor(){super();this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';this.dispatchEvent(new Event('stop'));}}
 const mic=new Track('original-mic'),receiver=new Track('original-receiver'),audio={muted:false,paused:false,volume:1,currentTime:1,srcObject:new Stream([receiver])};
 const context=vm.createContext({Event,EventTarget,MediaStreamTrack:Track,MediaStream:Stream,RTCPeerConnection:RTC,AudioContext:Context,MediaRecorder:Recorder,
  Date:class extends Date {static now(){return clock;}},navigator:{mediaDevices:{getUserMedia:async()=>new Stream([mic])}},
  setInterval:fn=>{const id=nextTimer++;timers.set(id,fn);return id;},clearInterval:id=>timers.delete(id),
  HTMLMediaElement:class {play(){return Promise.resolve();}},EventSource:class extends EventTarget {},fetch:async()=>({status:200}),
  document:{addEventListener(){},getElementById:id=>id==='remoteAudio'?audio:null},location:{href:'http://127.0.0.1:1/',origin:'http://127.0.0.1:1'},URL});
 vm.runInContext(BROWSER_PROBE,context);
 const pc=new context.RTCPeerConnection();pc.senderTrack=mic;
 const trackEvent=new Event('track');Object.defineProperty(trackEvent,'track',{value:receiver});pc.dispatchEvent(trackEvent);
 const channel=pc.createDataChannel();
 return {context,pc,mic,receiver,audio,timers,statsRequests,closeArgs,stopArgs,
  at(value){clock=value;},level(value){level=value;},tick(){for(const timer of [...timers.values()])timer();},
  wire(raw){const event=new Event('message');Object.defineProperty(event,'data',{value:JSON.stringify(raw)});channel.dispatchEvent(event);}};
}
test('actual additive browser probe samples terminal/PC/track release synchronously and never delays native release',async()=>{
 const f=browserProbeFixture();await f.context.navigator.mediaDevices.getUserMedia({audio:true});
 const p=f.context.__candidateLiveProbe;
 f.at(1500);f.wire({type:'turn.done',turn:{id:'actual',role:'assistant',transcript:'再见。'}});
 assert.equal(p.events.length,1);assert.equal(p.events[0].type,'turn.done');
 assert.equal(p.audioFrames.at(-1).at,1500);assert.equal(p.audioFrames.at(-1).sampleSource,'native-assistant-terminal');
 f.at(2250);f.tick();f.at(2284);f.mic.stop('real-stop');f.pc.close('real-close');
 assert.equal(f.pc.connectionState,'closed');assert.equal(f.mic.readyState,'ended');
 assert.deepEqual(f.closeArgs,[['real-close']]);assert.deepEqual(f.stopArgs,[['real-stop']]);
 assert.equal(p.audioFrames.at(-1).sampleSource,'original-pc-close-before-release');
 assert.equal(p.audioFrames.at(-1).trackState,'live');assert.equal(p.audioFrames.at(-1).connected,'connected');
 assert.equal(p.micFrames.at(-1).sampleSource,'original-microphone-stop-before-release');
 assert.equal(p.micFrames.at(-1).trackState,'live');assert.equal(p.micFrames.at(-1).senderTrackId,'original-mic');
 assert.equal(f.statsRequests.at(-1).state,'connected');assert.equal(f.timers.size,0);
 const last=p.audioFrames.length;f.at(2400);f.tick();assert.equal(p.audioFrames.length,last,'No closed-context timer frames substitute for live tail');
 await Promise.resolve();assert.equal(p.audioFrames.at(-1).rtp[0].id,'actual');
 assert.equal(p.audioFrames.at(-1).statsRequestedAt,2284);assert.equal(p.audioFrames.at(-1).statsObservedAt,2400,'Real delayed stats clock is retained');
 assert.equal(p.observerStops.length,2);assert.equal(p.observerErrors.length,0);
});
test('an observer sampling exception is recorded while the original track and PC still release',async()=>{
 const f=browserProbeFixture();await f.context.navigator.mediaDevices.getUserMedia({audio:true});
 for(const owned of f.context.__candidateLiveProbe.resources)owned.sample=()=>{throw Error('observer failed');};
 f.mic.stop();f.pc.close();assert.equal(f.pc.connectionState,'closed');assert.equal(f.mic.readyState,'ended');
 assert.equal(f.context.__candidateLiveProbe.observerErrors.length,2);
 assert.equal(f.timers.size,0);
});
test('full observer snapshots retrieve every frozen raw prefix in bounded pages while sampling can continue',async()=>{
 const arrays=Object.fromEntries(SNAPSHOT_ARRAY_FIELDS.map(key=>[key,Array.from({length:137},(_,i)=>({id:key+'-'+i,raw:'actual'+i}))]));
 const probe={...arrays,pcs:[]},duplex={events:Array.from({length:75},(_,id)=>({id})),transitions:[{type:'actual'}],closed:false};
 const context=vm.createContext({__candidateLiveProbe:probe,__gptLiveDuplexDiagnostics:duplex,
  performance:{timeOrigin:1000},
  document:{getElementById:id=>id==='badge'?{textContent:'通话中'}:{},body:{dataset:{callState:'connected'}}}});
 let reads=0,maxRows=0;
 const result=await readBoundedProbeSnapshot(async expression=>{
  const value=structuredClone(vm.runInContext(expression,context));
  if(Array.isArray(value?.rows)){maxRows=Math.max(maxRows,value.rows.length);reads++;probe.audioFrames.push({id:'sampled-during-page-'+reads});}
  return value;
 },{pageSize:32});
 assert.equal(maxRows,32);assert.equal(result.audioFrames.length,137);assert(probe.audioFrames.length>137);
 for(const field of SNAPSHOT_ARRAY_FIELDS)assert.deepEqual(result[field],arrays[field].slice(0,137));
 assert.deepEqual(result.duplex.events,duplex.events);assert.equal(result.duplex.closed,false);
 assert.equal(result.snapshotSource,'bounded-pages-of-frozen-original-observer-prefix');
 await assert.rejects(readBoundedProbeSnapshot(async()=>null,{pageSize:65}),/page size/);
 await assert.rejects(readBoundedProbeSnapshot(async expression=>expression.includes('arrayCounts:')?
  {arrayCounts:Object.fromEntries(SNAPSHOT_ARRAY_FIELDS.map(key=>[key,1])),duplex:null}:[]),/prefix changed|clock identity/);
});
test('incremental lifecycle polls bound every CDP page and refresh late fields; final full reads reobserve every raw row',async()=>{
 const arrays=Object.fromEntries(SNAPSHOT_ARRAY_FIELDS.map(key=>[key,Array.from({length:137},(_,id)=>({id}))]));
 const probe={...arrays,pcs:[]},performance={timeOrigin:1000},context=vm.createContext({__candidateLiveProbe:probe,performance,
  document:{getElementById:()=>({}),body:{dataset:{callState:'connected'}}}});
 let reads=0,maxRows=0;const evaluate=async expression=>{
  const value=structuredClone(vm.runInContext(expression,context));
  if(Array.isArray(value?.rows)){reads++;maxRows=Math.max(maxRows,value.rows.length);}return value;
 };
 const initial=await readBoundedProbeSnapshot(evaluate),fullReads=reads;reads=0;
 probe.audioFrames[136].rtp=[{id:'actual-late-stats'}];probe.audioFrames.push({id:137});
 const poll=await readBoundedProbeSnapshot(evaluate,{previous:initial});
 assert(reads<fullReads);assert.equal(maxRows,32);assert.equal(poll.audioFrames.length,138);
 assert.deepEqual(poll.audioFrames[136].rtp,[{id:'actual-late-stats'}]);
 // Even an unusually late mutation beyond the polling overlap is retrieved
 // by the mandatory fresh full proof, without borrowing a cached old row.
 probe.audioFrames[0].rtp=[{id:'actual-very-late-stats'}];
 const final=await readBoundedProbeSnapshot(evaluate);
 assert.deepEqual(final.audioFrames,probe.audioFrames);
 performance.timeOrigin=2000;probe.events[0].id='new-page';
 const newPage=await readBoundedProbeSnapshot(evaluate,{previous:poll});
 assert.equal(newPage.events[0].id,'new-page','A new browser page cannot reuse old observer evidence');
});
test('paged duplex evidence freezes original ring rows while both live rings keep rotating',async()=>{
 const arrays=Object.fromEntries(SNAPSHOT_ARRAY_FIELDS.map(key=>[key,Array.from({length:65},(_,id)=>({id:key+'-'+id}))]));
 const probe={...arrays,pcs:[]},duplex={events:Array.from({length:75},(_,id)=>({id:'event-'+id})),transitions:Array.from({length:45},(_,id)=>({id:'transition-'+id}))};
 const original={events:duplex.events.slice(),transitions:duplex.transitions.slice()};
 const context=vm.createContext({__candidateLiveProbe:probe,__gptLiveDuplexDiagnostics:duplex,performance:{timeOrigin:1000},
  document:{getElementById:()=>({}),body:{dataset:{callState:'connected'}}}});
 let reads=0,maxRows=0;
 const result=await readBoundedProbeSnapshot(async expression=>{
  const value=structuredClone(vm.runInContext(expression,context));
  if(Array.isArray(value?.rows)){
   reads++;maxRows=Math.max(maxRows,value.rows.length);
   for(const field of ['events','transitions']){duplex[field].shift();duplex[field].push({id:field+'-after-header-'+reads});}
   probe.micFrames.push({id:'live-mic-'+reads});
  }else{
   assert.notEqual(probe.frozenDuplexSnapshot.events,duplex.events);
   assert(probe.frozenDuplexSnapshot.events.every((row,i)=>row===original.events[i]),'The header retains original row references with a shallow copy');
  }
  return value;
 },{pageSize:32});
 assert.equal(maxRows,32);assert(probe.micFrames.length>65,'The original microphone sampler can continue appending');
 for(const field of SNAPSHOT_ARRAY_FIELDS)assert.deepEqual(result[field],arrays[field].slice(0,65));
 for(const field of ['events','transitions']){
  assert.deepEqual(result.duplex[field],original[field]);assert.notDeepEqual(result.duplex[field],duplex[field]);
  assert.equal(new Set(result.duplex[field].map(row=>row.id)).size,original[field].length);
 }
});
test('duplex polls re-read the complete new ring even when prior snapshot lengths and page origin match',async()=>{
 const probe={...Object.fromEntries(SNAPSHOT_ARRAY_FIELDS.map(key=>[key,[]])),pcs:[]};
 const duplex={events:Array.from({length:137},(_,id)=>({id:'event-'+id})),transitions:Array.from({length:128},(_,id)=>({id:'transition-'+id}))};
 const context=vm.createContext({__candidateLiveProbe:probe,__gptLiveDuplexDiagnostics:duplex,performance:{timeOrigin:1000},
  document:{getElementById:()=>({}),body:{dataset:{callState:'connected'}}}});
 let reads=0;const evaluate=async expression=>{const value=structuredClone(vm.runInContext(expression,context));if(Array.isArray(value?.rows))reads++;return value;};
 const initial=await readBoundedProbeSnapshot(evaluate),fullReads=reads;reads=0;
 for(const field of ['events','transitions'])for(let i=0;i<70;i++){duplex[field].shift();duplex[field].push({id:field+'-next-'+i});}
 const next=await readBoundedProbeSnapshot(evaluate,{previous:initial});
 assert.equal(reads,fullReads,'Rolling arrays cannot reuse a previous append-only prefix');
 assert(next.duplexSnapshotGeneration>initial.duplexSnapshotGeneration);
 for(const field of ['events','transitions'])assert.deepEqual(next.duplex[field],duplex[field]);
 assert.notDeepEqual(next.duplex.events,initial.duplex.events);
});
test('a superseding header rejects a paged duplex read instead of mixing different frozen rings',async()=>{
 const probe={...Object.fromEntries(SNAPSHOT_ARRAY_FIELDS.map(key=>[key,[]])),pcs:[]};probe.events.push({id:'actual'});
 const duplex={events:[{id:'original-ring'}],transitions:[]};
 const context=vm.createContext({__candidateLiveProbe:probe,__gptLiveDuplexDiagnostics:duplex,performance:{timeOrigin:1000},
  document:{getElementById:()=>({}),body:{dataset:{callState:'connected'}}}});
 let superseded=false;
 await assert.rejects(readBoundedProbeSnapshot(async expression=>{
  const value=structuredClone(vm.runInContext(expression,context));
  if(Array.isArray(value?.rows)&&!superseded){superseded=true;duplex.events[0]={id:'later-ring'};vm.runInContext(SNAPSHOT_PAGED_HEADER_EXPRESSION,context);}
  return value;
 }),/Frozen probe snapshot changed/);
});
test('raw-only paged snapshots reject a changed browser generation or header clock',async()=>{
 for(const change of [p=>p.frozenDuplexSnapshot.generation++,p=>p.frozenDuplexSnapshot.observedAt++,p=>p.frozenDuplexSnapshot.probeTimeOrigin++]){
  const probe={...Object.fromEntries(SNAPSHOT_ARRAY_FIELDS.map(key=>[key,[]])),pcs:[]};probe.audioFrames=Array.from({length:65},(_,id)=>({id}));
  const context=vm.createContext({__candidateLiveProbe:probe,performance:{timeOrigin:1000},
   document:{getElementById:()=>({}),body:{dataset:{callState:'connected'}}}});
  let changed=false;
  await assert.rejects(readBoundedProbeSnapshot(async expression=>{
   const value=structuredClone(vm.runInContext(expression,context));
   if(Array.isArray(value?.rows)&&!changed){changed=true;change(probe);}
   return value;
  }),/Frozen probe snapshot changed/);
 }
});
test('same-page incremental reads and actual full snapshot wrapper reject a reused old header',async()=>{
 const probe={...Object.fromEntries(SNAPSHOT_ARRAY_FIELDS.map(key=>[key,[]])),pcs:[]};
 const context=vm.createContext({__candidateLiveProbe:probe,performance:{timeOrigin:1000},
  document:{getElementById:()=>({}),body:{dataset:{callState:'connected'}}}});
 let header;
 const initial=await readBoundedProbeSnapshot(async expression=>{
  const value=structuredClone(vm.runInContext(expression,context));if(expression===SNAPSHOT_PAGED_HEADER_EXPRESSION)header=value;return value;
 });
 await assert.rejects(readBoundedProbeSnapshot(async expression=>expression===SNAPSHOT_PAGED_HEADER_EXPRESSION?header:
  structuredClone(vm.runInContext(expression,context)),{previous:initial}),/Fresh browser snapshot header required/);
 for(const runner of ['call-lifecycle-smoke.mjs','native-smoke.mjs']) {
  const source=readFileSync(new URL('./'+runner,import.meta.url),'utf8');
  const from=source.indexOf('async function snapshot(full=false){'),to=source.indexOf('\nasync function waitFor(',from);
  assert(from>=0&&to>from,'Execute the actual full snapshot wrapper');
  const run=vm.runInNewContext('('+source.slice(from,to)+')',{
   assert,readBoundedProbeSnapshot:async()=>initial,evaluate:()=>{},snapshotCache:initial,browserTimeOrigin:1000,lastState:null,
  });
  await assert.rejects(run(true),/Full snapshot cannot reuse an old browser header/);
 }
});

function snapshotClockFixture({rowCount=65,browserCostMs=20,collectorCostMs=400}={}) {
 let browserClock=5000,collectorClock=90000;
 const probe={...Object.fromEntries(SNAPSHOT_ARRAY_FIELDS.map(key=>[key,[]])),pcs:[]};
 probe.audioFrames=Array.from({length:rowCount},(_,id)=>({id,payload:'raw-row-payload-not-in-clock-ledger'}));
 probe.audioFrames.slice=function(...args){browserClock+=browserCostMs;return Array.prototype.slice.apply(this,args);};
 const performance={timeOrigin:1000,now:()=>browserClock-performance.timeOrigin};
 const context=vm.createContext({__candidateLiveProbe:probe,performance,Date:{now:()=>browserClock},
  document:{getElementById:()=>({}),body:{dataset:{callState:'connected'}}}});
 const read=vm.runInNewContext('('+readBoundedProbeSnapshot.toString()+')',{
  SNAPSHOT_PAGED_HEADER_EXPRESSION,SNAPSHOT_ARRAY_FIELDS,SNAPSHOT_CLOCK_LEDGER_LIMIT,SNAPSHOT_SLOW_CLOCK_LEDGER_LIMIT,
  snapshotClockLedgers:new WeakMap(),Date:{now:()=>collectorClock}});
 const evaluate=async expression=>{
  const value=structuredClone(vm.runInContext(expression,context));
  // These fixture clocks represent receipt time after browser execution has
  // already ended; transport delay must never become browser execution time.
  collectorClock+=collectorCostMs;browserClock+=collectorCostMs;return value;
 };
 return {probe,performance,context,read,evaluate};
}
test('actual header and page VM clocks bind frozen identity while separating collector receipt latency',async()=>{
 const f=snapshotClockFixture(),state=await f.read(f.evaluate),ledger=state.snapshotClockLedger;
 assert.equal(ledger.recent.length,4);assert.equal(ledger.recent[0].kind,'header');
 assert.equal(ledger.recent[0].browserStartedWallAt,state.snapshotObservedAt);
 assert(ledger.recent.every(row=>row.generation===state.duplexSnapshotGeneration&&row.probeTimeOrigin===state.probeTimeOrigin&&row.snapshotObservedAt===state.snapshotObservedAt));
 assert.deepEqual(Array.from(ledger.recent,row=>row.sequence),[0,1,2,3]);
 const pages=ledger.recent.filter(row=>row.kind==='page');
 assert.deepEqual(Array.from(pages,row=>[row.field,row.from,row.to]),[['audioFrames',0,32],['audioFrames',32,64],['audioFrames',64,65]]);
 assert(pages.every(row=>row.browserExecutionDurationMs===20&&row.collectorRoundTripMs===400&&row.clocksQualified));
 assert(pages.every(row=>row.browserStartedWallAt===row.probeTimeOrigin+row.browserStartedPerformanceAt&&row.browserEndedWallAt===row.probeTimeOrigin+row.browserEndedPerformanceAt));
 assert.equal(ledger.collectorRoundTripIsNotBrowserExecution,true);
 assert.equal(ledger.browserExecutionScope,'synchronous-header-or-page-function-before-CDP-return-serialization');
 assert.deepEqual(Array.from(state.audioFrames),Array.from(f.probe.audioFrames),'Original rows are preserved, with no clock data inserted into microphone/player rows');
 assert(!JSON.stringify(ledger).includes('raw-row-payload-not-in-clock-ledger'));
});
test('missing or mismatched browser clocks remain explicitly unqualified and cannot imply execution duration',async()=>{
 for(const change of [f=>delete f.performance.now,f=>f.performance.now=()=>50000]){
  const f=snapshotClockFixture();change(f);const state=await f.read(f.evaluate);
  assert.equal(state.audioFrames.length,65,'Diagnostics cannot manufacture or remove original evidence rows');
  assert(state.snapshotClockLedger.recent.every(row=>row.clocksQualified===false&&row.browserExecutionDurationMs===null));
  assert(state.snapshotClockLedger.recent.every(row=>row.clockIssues.length>0));assert.equal(state.snapshotClockLedger.slow.length,0);
 }
 for(const mutate of [c=>c.generation++,c=>c.probeTimeOrigin++,c=>c.snapshotObservedAt++,c=>c.sequence++,c=>c.field='micFrames',c=>c.from++]){
  const f=snapshotClockFixture();await assert.rejects(f.read(async expression=>{
   const value=await f.evaluate(expression);if(value?.snapshotPageClock)mutate(value.snapshotPageClock);return value;
  }),/execution clock identity changed/u);
 }
 const f=snapshotClockFixture();await assert.rejects(f.read(async expression=>{
  const value=await f.evaluate(expression);if(value?.snapshotPageClock)delete value.snapshotPageClock;return value;
 }),/execution clock identity changed/u);
 const malformed=snapshotClockFixture(),state=await malformed.read(async expression=>{
  const value=await malformed.evaluate(expression);if(value?.snapshotPageClock)value.snapshotPageClock.browserStartedPerformanceAt={payload:'invalid-clock-object-not-exported'};return value;
 });
 assert(state.snapshotClockLedger.recent.filter(row=>row.kind==='page').every(row=>row.browserStartedPerformanceAt===null&&!row.clocksQualified));
 assert(!JSON.stringify(state.snapshotClockLedger).includes('invalid-clock-object-not-exported'),'Malformed clock payload cannot enlarge the bounded ledger');
});
test('clock history is bounded, reports drops, survives full reads and never mixes page origins',async()=>{
 const f=snapshotClockFixture({rowCount:200}),evaluate=f.evaluate;let state;
 for(let i=0;i<30;i++)state=await f.read(evaluate);
 const ledger=state.snapshotClockLedger;
 assert.equal(ledger.recent.length,SNAPSHOT_CLOCK_LEDGER_LIMIT);assert.equal(ledger.slow.length,SNAPSHOT_SLOW_CLOCK_LEDGER_LIMIT);
 assert.equal(ledger.droppedRows,ledger.totalRows-SNAPSHOT_CLOCK_LEDGER_LIMIT);assert(ledger.slowDroppedRows>0);assert.equal(ledger.truncated,true);
 assert(JSON.stringify(ledger).length<131072,'Only bounded small clock rows are exported');
 assert(ledger.recent.some(row=>row.generation<state.duplexSnapshotGeneration),'A fresh full read retains preceding same-page timing evidence');
 assert.equal(state.audioFrames.length,200,'Clock truncation never truncates raw prefix data');
 f.performance.timeOrigin=2000;const next=await f.read(evaluate,{previous:state});
 assert.equal(next.snapshotClockLedger.previousOriginDiscarded,1000);assert.equal(next.snapshotClockLedger.totalRows,8);
 assert(next.snapshotClockLedger.recent.every(row=>row.probeTimeOrigin===2000));assert.equal(next.snapshotClockLedger.droppedRows,0);
 assert.equal(next.audioFrames.length,200);
});
test('validated fixed clock rows reach a synchronous append-only hook without raw payload and callback failures propagate',async()=>{
 const f=snapshotClockFixture(),rows=[],first=await f.read(f.evaluate,{onClockRow:row=>rows.push(row)});
 assert.equal(rows.length,4);assert.deepEqual(rows.map(row=>row.sequence),[0,1,2,3]);
 assert(rows.every(row=>Object.isFrozen(row)&&Object.isFrozen(row.clockIssues)&&row.clocksQualified));
 assert(rows.every(row=>!Object.hasOwn(row,'rows')&&!Object.hasOwn(row,'payload')));assert(!JSON.stringify(rows).includes('raw-row-payload-not-in-clock-ledger'));
 await f.read(f.evaluate,{previous:first,onClockRow:row=>rows.push(row)});
 assert(rows.some(row=>row.generation===first.duplexSnapshotGeneration)&&rows.some(row=>row.generation>first.duplexSnapshotGeneration));
 const missing=snapshotClockFixture();delete missing.performance.now;let invalidCalls=0;
 await missing.read(missing.evaluate,{onClockRow:()=>invalidCalls++});assert.equal(invalidCalls,0,'Missing browser clocks are diagnosed, never emitted as qualified execution evidence');
 const failure=Error('Clock ledger append failed');await assert.rejects(f.read(f.evaluate,{onClockRow:()=>{throw failure;}}),error=>error===failure);
 await assert.rejects(f.read(f.evaluate,{onClockRow:()=>Promise.resolve()}),/complete synchronously/u);
 await assert.rejects(f.read(f.evaluate,{onClockRow:[]}),/clock row hook required/u);
 const stale=snapshotClockFixture();let header,replay=false,emitted=0;
 const evaluate=async expression=>{if(replay&&expression===SNAPSHOT_PAGED_HEADER_EXPRESSION)return header;
  const value=await stale.evaluate(expression);if(expression===SNAPSHOT_PAGED_HEADER_EXPRESSION)header=structuredClone(value);return value;};
 await stale.read(evaluate,{onClockRow:()=>emitted++});const before=emitted;replay=true;
 await assert.rejects(stale.read(evaluate,{onClockRow:()=>emitted++}),/Fresh browser snapshot header/u);
 assert.equal(emitted,before,'A stale full header must be rejected before qualified hook delivery, even without previous raw state');
});
test('a failed first clock archive can recover only with a fresh browser header',async()=>{
 const f=snapshotClockFixture();let header,replay=false;
 const evaluate=async expression=>{if(replay&&expression===SNAPSHOT_PAGED_HEADER_EXPRESSION)return header;
  const value=await f.evaluate(expression);if(expression===SNAPSHOT_PAGED_HEADER_EXPRESSION)header=structuredClone(value);return value;};
 const failure=Error('First clock archive failed');
 await assert.rejects(f.read(evaluate,{onClockRow:()=>{throw failure;}}),error=>error===failure);
 replay=true;await assert.rejects(f.read(evaluate),/Fresh browser snapshot header/u);
 replay=false;const recovered=await f.read(evaluate);assert.equal(recovered.duplexSnapshotGeneration,2);assert.equal(recovered.audioFrames.length,65);
 const bad=snapshotClockFixture();let corrupt=true;
 const badEvaluate=async expression=>{const value=await bad.evaluate(expression);if(corrupt&&expression===SNAPSHOT_PAGED_HEADER_EXPRESSION)value.snapshotHeaderClock.generation++;return value;};
 await assert.rejects(bad.read(badEvaluate),/execution clock identity changed/u);
 corrupt=false;const valid=await bad.read(badEvaluate);assert.equal(valid.duplexSnapshotGeneration,2);assert.equal(valid.audioFrames.length,65);
});
test('both actual snapshot functions archive validated clock rows to private JSONL and propagate write failures',async()=>{
 for(const name of ['native-smoke.mjs','call-lifecycle-smoke.mjs']){
  const source=readFileSync(new URL('./'+name,import.meta.url),'utf8');
  const from=source.indexOf('async function snapshot(full=false){'),to=source.indexOf('\nasync function waitFor(',from);assert(from>=0&&to>from);
  const f=snapshotClockFixture(),writes=[],context=vm.createContext({assert,evaluate:f.evaluate,readBoundedProbeSnapshot:f.read,
   snapshotCache:null,browserTimeOrigin:1000,lastState:null,base:'/private/evidence',path:{join:(...parts)=>parts.join('/')},
   fs:{appendFileSync:(file,body,options)=>writes.push({file,body,options})}});
  const snapshot=vm.runInContext('('+source.slice(from,to)+')',context);const state=await snapshot(true);
  assert.equal(state.audioFrames.length,65);assert.equal(writes.length,4);
  for(const row of writes){assert.equal(row.file,'/private/evidence/browser-page-clocks.jsonl');assert.equal(row.options.mode,0o600);
   assert(row.body.endsWith('\n'));const clock=JSON.parse(row.body);assert.equal(clock.clocksQualified,true);assert.equal(clock.probeTimeOrigin,1000);
   assert(!row.body.includes('raw-row-payload-not-in-clock-ledger'));}
  const failure=Error('Private clock archive write failed');context.fs.appendFileSync=()=>{throw failure;};
  await assert.rejects(snapshot(),error=>error===failure,name+' must not silently lose timing evidence');
 }
});

test('actual native snapshot keeps every original raw row in its prefix cache while polling and full receipts use fresh bounded headers',async()=>{
 const source=readFileSync(new URL('./native-smoke.mjs',import.meta.url),'utf8');
 const from=source.indexOf('async function snapshot(full=false){'),to=source.indexOf('\nasync function waitFor(',from);
 assert(from>=0&&to>from);
 const probe={...Object.fromEntries(SNAPSHOT_ARRAY_FIELDS.map(key=>[key,[]])),pcs:[]};
 probe.micFrames=Array.from({length:137},(_,id)=>({id,at:1000+id*50}));
 probe.audioFrames=Array.from({length:137},(_,id)=>({id,at:1000+id*50}));
 const browser=vm.createContext({__candidateLiveProbe:probe,performance:{timeOrigin:1000},
  document:{getElementById:()=>({}),body:{dataset:{callState:'connected'}}}});
 const pages=[],reads=[];
 const evaluate=async expression=>{const value=structuredClone(vm.runInContext(expression,browser));
  if(Array.isArray(value?.rows)){pages.push(value.rows.length);assert(value.rows.length<=32,'No original array is returned as one large CDP object');}
  return value;};
 const context={assert,evaluate,snapshotCache:null,lastState:null,
  readBoundedProbeSnapshot:async(evaluate,options)=>{reads.push(options.previous);return readBoundedProbeSnapshot(evaluate,options);}};
 const snapshot=vm.runInNewContext('('+source.slice(from,to)+')',context);
 const first=await snapshot();assert.equal(first.micFrames.length,80);assert.equal(context.snapshotCache.micFrames.length,137);
 probe.micFrames.push({id:137,at:7850});probe.audioFrames.push({id:137,at:7850});
 const second=await snapshot();assert.equal(second.micFrames.at(-1).id,137);assert.equal(context.snapshotCache.micFrames.length,138);
 const full=await snapshot(true);assert.equal(full.micFrames.length,138);assert.equal(full.audioFrames.length,138);
 assert.deepEqual(full.micFrames.map(row=>row.id),Array.from({length:138},(_,id)=>id));
 assert(full.duplexSnapshotGeneration>second.duplexSnapshotGeneration&&second.duplexSnapshotGeneration>first.duplexSnapshotGeneration);
 assert.equal(reads[0],null);assert.equal(reads[1].micFrames.length,137);assert.equal(reads[2],null);
 assert.equal(Math.max(...pages),32);assert.equal(full.snapshotCompletedClock,'collector-wall');
});

function inputConvergenceFixture() {
 const input={startedAt:1000,completedAt:2000,exitCode:0};
 const events=[{pcIndex:0,type:'turn.done',role:'user',turnId:'actual-full-user',at:2100}];
 const micFrames=[{pcIndex:0,at:1900,rms:.1,trackState:'live',trackEnabled:true,trackId:'mic',senderTrackId:'mic'},
  ...Array.from({length:8},(_,i)=>({pcIndex:0,at:2000+i*50,rms:.001,trackState:'live',trackEnabled:true,trackId:'mic',senderTrackId:'mic'}))];
 return {input,state:{events,micFrames,snapshotObservedAt:2370,snapshotCompletedAt:60000,snapshotCompletedClock:'collector-wall'}};
}
async function actualInputConverged(state,input) {
 const source=readFileSync(new URL('./call-lifecycle-smoke.mjs',import.meta.url),'utf8');
 const from=source.indexOf('async function inputConverged(pcIndex,input,label) {'),to=source.indexOf('\nasync function basicTools(',from);
 assert(from>=0&&to>from,'Execute the actual input convergence observer');
 const checks=[];
 const run=vm.runInNewContext('('+source.slice(from,to)+')',{
  snapshot:async full=>{assert.equal(full,true);return state;},assessIndependentInputConvergence,
  Date:{now:()=>{throw Error('Collector clock cannot age a frozen browser prefix');}},
  check:(name,passed,details)=>checks.push({name,passed,details}),
 });
 const proof=await run(0,input,'actual-input-convergence');return {proof,check:checks[0]};
}
test('actual input convergence uses the browser header observation time despite slow pages and an unrelated collector clock',async()=>{
 const f=inputConvergenceFixture(),probe={...Object.fromEntries(SNAPSHOT_ARRAY_FIELDS.map(key=>[key,[]])),pcs:[]};
 probe.events=f.state.events;probe.micFrames=f.state.micFrames;probe.audioFrames=Array.from({length:137},(_,id)=>({id}));
 let browserClock=2370,collectorClock=60000,reads=0;
 const context=vm.createContext({__candidateLiveProbe:probe,performance:{timeOrigin:1000},Date:{now:()=>browserClock},
  document:{getElementById:()=>({}),body:{dataset:{callState:'connected'}}}});
 const boundedRead=vm.runInNewContext('('+readBoundedProbeSnapshot.toString()+')',{
  SNAPSHOT_PAGED_HEADER_EXPRESSION,SNAPSHOT_ARRAY_FIELDS,SNAPSHOT_CLOCK_LEDGER_LIMIT,SNAPSHOT_SLOW_CLOCK_LEDGER_LIMIT,snapshotClockLedgers:new WeakMap(),Date:{now:()=>collectorClock},
 });
 const state=await boundedRead(async expression=>{
  const value=structuredClone(vm.runInContext(expression,context));
  if(Array.isArray(value?.rows)){
   reads++;browserClock+=50;collectorClock+=50;
   probe.micFrames.push({...probe.micFrames.at(-1),at:browserClock});
  }
  return value;
 });
 assert(reads*50>100,'Bounded transfer can take longer than the unchanged 100ms freshness gate');
 assert.equal(state.snapshotObservedAt,2370);assert.equal(state.snapshotStartedAt,2370);
 assert.equal(state.micFrames.at(-1).at,2350,'No post-header microphone row is borrowed into the frozen proof');
 assert(probe.micFrames.at(-1).at>state.snapshotObservedAt);
 assert.equal(state.snapshotCompletedClock,'collector-wall');
 assert.equal(state.snapshotRequestedAt,60000);assert.equal(state.snapshotCompletedAt,collectorClock);
 assert.equal(state.snapshotCollectionLatencyMs,reads*50,'Receipt latency uses the collector clock only');
 const result=await actualInputConverged(state,f.input);
 assert.equal(result.proof.turnId,'actual-full-user');assert.equal(result.proof.quietTo,2350);
 assert.equal(result.check.passed,true);assert.equal(result.check.details.observation.observedAt,2370);
 assert.equal(result.check.details.observation.latestMicrophoneAgeMs,20);
 assert.equal(result.check.details.observation.collectorCompletedAt,state.snapshotCompletedAt);
 assert.equal(result.check.details.observation.collectionLatencyMs,reads*50);
 assert.equal(result.check.details.observation.scope,'validation-clip-before-next-USER-injection');
});
test('header-time input convergence keeps stale, future, missing, incomplete and discontinuous evidence as strict failure',async()=>{
 const changes=[
  f=>f.state.snapshotObservedAt=2500,
  f=>delete f.state.snapshotObservedAt,
  f=>f.state.micFrames.at(-1).at=2400,
  f=>f.state.events=[],
  f=>f.state.events.push({pcIndex:0,type:'input_transcript.added',at:2150,text:'unfinished remaining tail'}),
  f=>f.state.micFrames=f.state.micFrames.filter((_,i)=>i<4||i>6),
  f=>f.state.micFrames[5].trackEnabled=false,
  f=>f.state.micFrames=f.state.micFrames.slice(0,6),
 ];
 for(const change of changes){const f=inputConvergenceFixture();change(f);const result=await actualInputConverged(f.state,f.input);
  assert.equal(result.proof,null);assert.equal(result.check.passed,false);assert.equal(result.check.details.strictFailurePreserved,true);
  assert.equal(result.check.details.failureDoesNotSkipRemainingLifecycleObservations,true);
 }
});

async function actualNativeInputConverged(state,input) {
 const source=readFileSync(new URL('./native-smoke.mjs',import.meta.url),'utf8');
 const from=source.indexOf('async function convergeInputTurn(input,pcIndex,label) {'),to=source.indexOf('\nconst audible=',from);
 assert(from>=0&&to>from,'Execute the actual native USER convergence observer');
 const checks=[];
 const run=vm.runInNewContext('('+source.slice(from,to)+')',{
  assert,snapshot:async full=>{assert.equal(full,true);return state;},assessIndependentInputConvergence,
  waitFor:async(predicate,label,max)=>{assert.equal(max,15000);const proof=await predicate(state);if(!proof)throw Error(label+' deadline');return proof;},
  Date:{now:()=>{throw Error('Collector clock cannot age a frozen browser prefix');}},
  check:(name,passed,details)=>checks.push({name,passed,details}),
 });
 const proof=await run({done:Promise.resolve(),row:{...input,label:'original-clip'}},0,'actual-native-input-convergence');
 return {proof,check:checks[0]};
}
test('actual native USER convergence uses header-time freshness and records receipt latency without accepting later business input state',async()=>{
 const f=inputConvergenceFixture();f.state.snapshotCollectionLatencyMs=350;f.state.duplexSnapshotGeneration=9;
 const result=await actualNativeInputConverged(f.state,f.input);
 assert.equal(result.proof.turnId,'actual-full-user');assert.equal(result.proof.quietTo,2350);
 assert.equal(result.check.details.observation.latestMicrophoneAgeMs,20);
 assert.equal(result.check.details.observation.collectorCompletedAt,60000);
 assert.equal(result.check.details.observation.collectionLatencyMs,350);
 assert.equal(result.check.details.observation.snapshotGeneration,9);
 assert.equal(result.check.details.observation.scope,'validation-clip-before-next-USER-injection');
});
test('actual native USER convergence cannot accept stale or future clocks, missing USER, an unfinished suffix or discontinuous microphone evidence',async()=>{
 const changes=[
  f=>f.state.snapshotObservedAt=2500,
  f=>delete f.state.snapshotObservedAt,
  f=>f.state.micFrames.at(-1).at=2400,
  f=>f.state.events=[],
  f=>f.state.events.push({pcIndex:0,type:'input_transcript.added',at:2150,text:'unfinished remaining tail'}),
  f=>f.state.micFrames=f.state.micFrames.filter((_,i)=>i<4||i>6),
  f=>f.state.micFrames[5].trackEnabled=false,
  f=>f.state.micFrames=f.state.micFrames.slice(0,6),
 ];
 for(const change of changes){const f=inputConvergenceFixture();change(f);await assert.rejects(actualNativeInputConverged(f.state,f.input),/deadline/);}
});
test('actual native cleanup preserves the pre-close prefix and closes the original call before screenshot rendering or media export',async()=>{
 const source=readFileSync(new URL('./native-smoke.mjs',import.meta.url),'utf8');
 const from=source.indexOf('\n if(cdp){const preCloseFull='),to=source.indexOf('\n  const audio=await evaluate(',from);
 assert(from>=0&&to>from,'Execute the actual cleanup path before media export');
 const trace=[],owner={voiceSessionId:'original-voice'},checks=[];
 let snapshots=0,stopped=false;
 const run=vm.runInNewContext('(async()=>{'+source.slice(from,to)+'\n}})',{
  cdp:{request:async method=>{assert(stopped,'The original call must close before screenshot rendering');trace.push(method);return {data:'cG5n'};}},
  snapshot:async full=>{assert.equal(full,true);trace.push('snapshot-'+(++snapshots));return {api:snapshots===1?[]:[{route:'/api/close',status:200,request:{voiceSessionId:owner.voiceSessionId}}]};},
  save:name=>trace.push('save-'+name),callOwners:new Map([[0,owner]]),checks,
  stopCall:async index=>{assert.equal(index,0);assert(trace.includes('save-browser-pre-close-native-evidence.json'));trace.push('original-stop');stopped=true;},
  check:(name,passed,details)=>{checks.push({name,passed,...details});},testCase:'comprehensive-long',lastState:null,lastHistory:{},toolEvents:[],
  confirmationDiagnostics:()=>({}),diagnostics:()=>[],evaluate:async expression=>{assert(stopped);trace.push('dispose');},
  fs:{writeFileSync:()=>trace.push('write-screenshot')},path:{join:()=>'/unused/h5.png'},base:'/unused',Buffer,
 });
 await run();
 assert(trace.indexOf('original-stop')<trace.indexOf('Page.captureScreenshot'));
 assert(trace.indexOf('snapshot-2')<trace.indexOf('Page.captureScreenshot'));
 assert(trace.indexOf('save-browser-native-evidence.json')<trace.indexOf('Page.captureScreenshot'));
 assert.equal(checks.find(c=>c.name==='complete-observation-through-original-close').passed,true);
});

function toolsFixture() {
 const sessionKey='agent:makaron:explicit:gpt-live-h5-experiment-own',runId='talk-realtime-consult:actual-own',memoryQuery='某同事';
 const result=name=>name==='memory_search'?{results:[{snippet:'某同事负责项目设计。'}]}:{content:'OpenAI Realtime API official docs describe realtime audio.'};
 const event=(name,id,phase,ts)=>({event:'session.tool',at:ts+7000,payload:{runId,sessionKey,stream:'tool',ts,seq:ts,
  data:{phase,name,toolCallId:id,...(phase==='start'?{args:{query:name==='memory_search'?memoryQuery:'OpenAI Realtime API official docs'}}:
    {result:{content:[{type:'text',text:JSON.stringify(result(name))}]},isError:false})}}});
 const events=[event('memory_search','m1','start',200000),event('memory_search','m1','result',201000),
  event('web_search','w1','start',201100),event('web_search','w1','result',203000)];
 const history={messages:[{role:'assistant',timestamp:1,content:[
  {type:'toolCall',id:'m1',name:'memory_search',arguments:{query:memoryQuery}},
  {type:'toolCall',id:'w1',name:'web_search',arguments:{query:'OpenAI Realtime API official docs'}}]},
  ...['memory_search','web_search'].map((name,i)=>({role:'toolResult',toolCallId:i===0?'m1':'w1',toolName:name,timestamp:10+i,
    isError:false,content:[{type:'text',text:JSON.stringify(result(name))}]}))]};
 return {events,history,sessionKey,memoryQuery,after:199000};
}
// Offline contract fixtures below are not real model, speech or tool evidence.
function finalDeliveryFixture() {
 const f=toolsFixture(),owner={voiceSessionId:'voice-own',sessionKey:f.sessionKey},runId=f.events[0].payload.runId;
 const user={pcIndex:0,at:199900,role:'user',type:'turn.done',turnId:'u-tools',text:'先用 memory search 查某同事，再用 web search 查 OpenAI Realtime API，不要写入，也不要发消息。'};
 const state={events:[user,{pcIndex:0,at:200000,type:'delegation.created',raw:{item:{id:'native-owner',target:'client',user_bidi_turn_id:user.turnId}}}],
  tools:[{at:200050,raw:{voiceSessionId:owner.voiceSessionId,callId:runId,type:'tool.call'}},
   {at:204000,raw:{voiceSessionId:owner.voiceSessionId,callId:runId,type:'tool.result'}}]};
 const text='记忆检索结果:同事甲是你的同事;OpenAI Realtime API 文档建议浏览器一般使用 WebRTC。';
 const sha=x=>createHash('sha256').update(x).digest('hex'),sourceRunIdSha256=sha(runId),identity={traceId:'trace-tools',delegationId:'native-owner',generation:1,sourceRunIdSha256,ownerRunIdSha256:sourceRunIdSha256};
 const diagnostics=[{...identity,stage:'backend-run-started',at:200060},
  {...identity,stage:'backend-final-received',kind:'final',at:204100,textSha256:sha(text),provenance:{source:'canonical_final'}},
  {...identity,stage:'context-append-sent',kind:'final',role:'final_complete',appendId:1,chunkIndex:0,chunkCount:1,at:204200,provenance:{source:'canonical_final'}}];
 const events=[...f.events,{event:'agent',payload:{runId,sessionKey:f.sessionKey,stream:'assistant',ts:204090,data:{text}}}];
 state.events.push({pcIndex:0,at:204250,type:'turn.created',role:'assistant',turnId:'final-tools'},
  {pcIndex:0,at:204260,type:'output_transcript.added',turnId:'final-tools',text:text.replace('记忆检索结果:','')},
  {pcIndex:0,at:204500,type:'turn.done',role:'assistant',turnId:'final-tools',text:text.replace('记忆检索结果:','')});
 state.audioFrames=Array.from({length:25},(_,i)=>frame(204200+i*50,i<6?.02:0));
 const host=resolveLifecycleConsultResult(state,{pcIndex:0,voiceSessionId:owner.voiceSessionId,userTurnId:user.turnId,
  toolChain:resolveLifecycleMemoryWeb(f),after:f.after});
 const nativeOwner=resolveNativeControlOwner({diagnostics,events:state.events,tools:state.tools,backendRunId:runId,voiceSessionId:owner.voiceSessionId,pcIndex:0});
 const canonical=resolveCanonicalFinalTrace(diagnostics,nativeOwner);
 const body=resolveLifecycleCanonicalBody(events,{canonical,sessionKey:f.sessionKey,runId});
 return {f,owner,user,state,events,diagnostics,host,body,params:{pcIndex:0,body,host,userTurnId:user.turnId}};
}
function actualControlObserverFunction(name,nextName,dependencies) {
 const source=readFileSync(new URL('./native-smoke.mjs',import.meta.url),'utf8');
 const from=source.indexOf('async function '+name+'('),to=source.indexOf('\n'+nextName+'(',from);
 assert(from>=0&&to>from,'Execute the actual Candidate observer function');
 return vm.runInNewContext('('+source.slice(from,to)+')',dependencies);
}
test('independent control greeting waits for ready and exact complete original caption/player/fresh750ms RTP before USER',async()=>{
 for(const [pcIndex,count] of [[0,0],[1,2]]) {
  const state=speechState();for(const rows of [state.events,state.audioFrames,state.micFrames])for(const row of rows)row.pcIndex=pcIndex;
  const owner={createdAt:1000,connectedAt:1200},ready={route:'/api/ready',status:200,requestedAt:1200,at:1201};
  const polls=[],checks=[],windows=[],saved=[];let fullReads=0;
  const run=actualControlObserverFunction('waitControlGreeting','async function waitControlConfirmationReply',{
   assert,controlPath:'confirm-cancel',callOwners:new Map([[pcIndex,owner]]),pulse:{plays:Array.from({length:count},()=>({}))},
   hasLifecyclePlaybackTail,assessLifecycleSpeech,assessLifecyclePostTerminalRtp,assessProactiveGreeting,
   snapshot:async full=>{assert.equal(full,true);fullReads++;return state;},
   waitFor:async(predicate,label,max)=>{polls.push({label,max});const probe={...state,api:pcIndex===0?[ready]:[{...ready,at:900},ready]};const value=await predicate(probe);assert(value);return value;},
   check:(name,passed,details)=>checks.push({name,passed,details}),speechPlaybackWindows:windows,save:(name,value)=>saved.push({name,value}),
  });
  const proof=await run(pcIndex);assert.equal(fullReads,1,'No later slow snapshot replaces the finished proof');
  assert.equal(checks.length,1);assert.equal(checks[0].passed,true);assert.equal(proof.speech.playback.passed,true);
  assert(proof.independentRtp.durationMs>=750);assert.equal(proof.proofWindowEnd,proof.speech.quiet.to);
  assert.equal(windows[0].window,proof.speech.window);assert.equal(saved[0].value,proof);
  assert.deepEqual(polls.map(p=>p.max),[15000,45000]);
 }
});
test('independent control greeting rejects mute, incomplete caption, stale RTP, gap, prior USER and premature ready',async()=>{
 for(const mutate of [s=>s.audioFrames[4].muted=true,s=>s.events[1].text='缺失',
  s=>{for(const row of s.audioFrames)for(const stat of row.rtp)stat.timestamp=1000;},
  s=>{s.audioFrames=s.audioFrames.filter(f=>![1300,1350].includes(f.at));},
  s=>{s.audioFrames=s.audioFrames.slice(0,-3);},
  s=>s.events.push({pcIndex:0,at:1400,type:'turn.done',role:'user',turnId:'earlier-user',text:'你好'})]) {
  const state=speechState();mutate(state);const ready={route:'/api/ready',status:200,requestedAt:1200,at:1201};let saved=false;
  const run=actualControlObserverFunction('waitControlGreeting','async function waitControlConfirmationReply',{
   assert,controlPath:'confirm-cancel',callOwners:new Map([[0,{createdAt:1000,connectedAt:1200}]]),pulse:{plays:[]},
   hasLifecyclePlaybackTail,assessLifecycleSpeech,assessLifecyclePostTerminalRtp,assessProactiveGreeting,snapshot:async()=>state,
   waitFor:async(predicate)=>{const value=await predicate({...state,api:[ready]});if(!value)throw Error('strict greeting deadline');return value;},
   check(){throw Error('Rejected greeting cannot record a pass');},speechPlaybackWindows:[],save(){saved=true;},
  });
  await assert.rejects(run(0),/strict greeting deadline/u);assert.equal(saved,false);
 }
 const run=actualControlObserverFunction('waitControlGreeting','async function waitControlConfirmationReply',{
  assert,controlPath:'confirm-cancel',callOwners:new Map([[0,{createdAt:1000,connectedAt:1200}]]),pulse:{plays:[]},
  waitFor:async()=>({requestedAt:1199,at:1201}),
 });await assert.rejects(run(0),/Ready operation must belong/u);
});
test('independent control confirmation waits for the exact blocked owner complete canonical final and fresh native playback',async()=>{
 const f=finalDeliveryFixture(),sha=text=>createHash('sha256').update(text).digest('hex');
 const owner=resolveNativeControlOwner({diagnostics:f.diagnostics,events:f.state.events,tools:f.state.tools,
  backendRunId:f.f.events[0].payload.runId,voiceSessionId:f.owner.voiceSessionId,pcIndex:0});
 const challenge={pcIndex:0,sessionKey:f.owner.sessionKey,voiceSessionId:f.owner.voiceSessionId,runId:owner.backendRunId,owner,blockedAt:203000};
 const checks=[],windows=[],saves=[];let fullReads=0;
 const run=actualControlObserverFunction('waitControlConfirmationReply','function play',{
  assert,controlPath:'confirm-cancel',callOwners:new Map([[0,f.owner]]),pulse:{plays:[{}]},hash:sha,
  controlConfirmation:{originalRequestInput:{startedAt:f.f.after}},toolEvents:f.events,diagnostics:()=>f.diagnostics,
  resolveCanonicalFinalTrace,resolveLifecycleCanonicalBody,resolveLifecycleConsultResult,resolveLifecycleFinalSpeechTurns,
  hasLifecyclePlaybackTail,hasLifecycleFinalPlaybackTail,assessLifecycleFinalSpeech,
  snapshot:async full=>{assert.equal(full,true);fullReads++;return f.state;},
  waitFor:async(predicate,label,max)=>{assert.equal(max,45000);const value=await predicate(f.state);assert(value);return value;},
  check:(name,passed,details)=>checks.push({name,passed,details}),speechPlaybackWindows:windows,save:(name,value)=>saves.push({name,value}),
 });
 const proof=await run(0,challenge,f.user);assert.equal(fullReads,1);assert.equal(proof.canonical.ownerRunIdSha256,owner.sourceRunIdSha256);
 assert.equal(proof.body.text,f.body.text);assert.equal(proof.speech.completeBodyMatched,true);
 assert(proof.speech.independentRtp.durationMs>=750);assert.equal(proof.speech.playback.passed,true);
 assert.equal(proof.proofWindowEnd,proof.speech.quiet.to);assert.equal(checks[0].passed,true);assert.equal(windows[0].window,proof.speech.window);
 assert.equal(saves[0].value,proof);assert.equal(proof.confirmationPromptMeaningRequiresIndependentReview,true);
});
test('blocked metadata or an earlier preamble never substitutes for exact final confirmation speech',async()=>{
 for(const mutate of [f=>{f.diagnostics=f.diagnostics.slice(0,2);},
  f=>{f.events.at(-1).payload.runId='foreign-run';},f=>{f.events.at(-1).payload.sessionKey='foreign-session';},
  f=>{f.events.at(-1).payload.data.text='另一个最终答案';},
  f=>{f.state.events.at(-1).text='我去查一下。';f.state.events.at(-2).text='我去查一下。';},
  f=>{f.state.tools[1].at=202000;},
  f=>{f.fullState=structuredClone(f.state);f.fullState.tools.push({at:204100,raw:{
   voiceSessionId:f.owner.voiceSessionId,callId:f.f.events[0].payload.runId,type:'tool.error'}});},
  f=>{f.state.audioFrames[4].paused=true;},
  f=>{f.state.audioFrames=f.state.audioFrames.filter(row=>![204300,204350].includes(row.at));},
  f=>{for(const row of f.state.audioFrames)for(const stat of row.rtp)stat.timestamp=204000;},
  f=>{f.state.audioFrames=f.state.audioFrames.slice(0,-4);}]) {
  const f=finalDeliveryFixture(),owner=resolveNativeControlOwner({diagnostics:f.diagnostics,events:f.state.events,tools:f.state.tools,
   backendRunId:f.f.events[0].payload.runId,voiceSessionId:f.owner.voiceSessionId,pcIndex:0});
  const challenge={pcIndex:0,sessionKey:f.owner.sessionKey,voiceSessionId:f.owner.voiceSessionId,runId:owner.backendRunId,owner,blockedAt:203000};mutate(f);
  const run=actualControlObserverFunction('waitControlConfirmationReply','function play',{
   assert,controlPath:'confirm-cancel',callOwners:new Map([[0,f.owner]]),pulse:{plays:[{}]},hash:text=>createHash('sha256').update(text).digest('hex'),
   controlConfirmation:{originalRequestInput:{startedAt:f.f.after}},toolEvents:f.events,diagnostics:()=>f.diagnostics,
   resolveCanonicalFinalTrace,resolveLifecycleCanonicalBody,resolveLifecycleConsultResult,resolveLifecycleFinalSpeechTurns,
   hasLifecyclePlaybackTail,hasLifecycleFinalPlaybackTail,assessLifecycleFinalSpeech,snapshot:async()=>f.fullState??f.state,
   waitFor:async(predicate)=>{const value=await predicate(f.state);if(!value)throw Error('strict confirmation reply deadline');return value;},
   check(){throw Error('Rejected reply cannot record a pass');},speechPlaybackWindows:[],save(){throw Error('Rejected reply cannot be saved as ready');},
  });await assert.rejects(run(0,challenge,f.user),/strict confirmation reply deadline/u);
 }
});
test('actual controls schedules only independent initial USER after greeting and leaves combined overlap unchanged',async()=>{
 const source=readFileSync(new URL('./native-smoke.mjs',import.meta.url),'utf8'),from=source.indexOf('async function controls() {'),to=source.indexOf('\nasync function confirmCancelOnly(',from);
 assert(from>=0&&to>from);const done=Error('stop before the first real pending selector');
 for(const controlPath of ['confirm-cancel','combined']) {
  const calls=[],run=vm.runInNewContext('('+source.slice(from,to)+')',{
   controlPath,startCall:async()=>{calls.push('connected');return 0;},
   waitControlGreeting:async()=>{calls.push('complete proactive greeting');},play:name=>{calls.push(name);return {done:Promise.resolve()};},
   waitFor:async()=>{throw done;},
  });await assert.rejects(run(),error=>error===done);
  assert.deepEqual(calls,controlPath==='confirm-cancel'?['connected','complete proactive greeting','cancel-task']:['connected','cancel-task']);
 }
 const independent=source.slice(source.indexOf('async function confirmCancelOnly('),source.indexOf('\nasync function queuedSteer('));
 assert.match(independent,/const reopened=await startCall\(\);await waitControlGreeting\(reopened\);\s*const greeting=play\('new-greeting'\)/u);
 assert.match(source.slice(from,to),/if\(controlPath==='confirm-cancel'\)controlConfirmation.originalChallengeReply=await waitControlConfirmationReply\(pcIndex,challenge,originalTurn\);\s*assert\([\s\S]*?const input=play\('confirmation'\)/u);
 assert.match(source.slice(from,to),/const reopened=await startCall\(\),greeting=play\('new-greeting'\)/u,'Combined redial retains its intentionally overlapping path');
});
test('actual confirmation branch never feeds USER before its independent spoken-final wait and propagates failure',async()=>{
 const source=readFileSync(new URL('./native-smoke.mjs',import.meta.url),'utf8'),from=source.indexOf('async function controls() {'),to=source.indexOf('\nasync function confirmCancelOnly(',from);
 const user={pcIndex:0,type:'turn.done',role:'user',turnId:'original-user',text:'请先 sleep 60，再查 date 时间。',at:3000},state={events:[user],tools:[]};
 const stopped=Error('stop after exact blocked challenge observation'),replyFailure=Error('strict original spoken confirmation question deadline');
 for(const [controlPath,fail] of [['confirm-cancel',false],['confirm-cancel',true],['combined',false]]) {
  const order=[],inputs=[],challenge={pcIndex:0,owner:{backendRunId:'initial-run'}};
  const run=vm.runInNewContext('('+source.slice(from,to)+')',{
   assert,process:{env:{GPT_LIVE_H5_CONTROL_CONFIRMATION:'1'}},controlPath,
   startCall:async()=>0,waitControlGreeting:async()=>{order.push('greeting complete');},
   play:name=>{order.push('play '+name);inputs.push(name);return {row:{label:name,startedAt:1000,completedAt:2000,exitCode:0},done:Promise.resolve()};},
   waitFor:async predicate=>{assert.equal(await predicate(state),false);throw stopped;},readHistory:async()=>{},
   parentEvidencePairs:()=>[],lastHistory:{parent:{}},assessControlExecPending:()=>({pending:false}),
   currentSession:'owned-session',callOwners:new Map([[0,{voiceSessionId:'owned-voice'}]]),diagnostics:()=>[],
   resolveControlExecConfirmationChallenge:()=>challenge,controlConfirmation:undefined,save(){},
   convergeInputTurn:async input=>({turnId:input.row.label==='cancel-task'?user.turnId:'confirmation-user'}),
   snapshot:async()=>state,fs:{readFileSync:()=> '确认执行。'},path,clips:'/private/frozen-clips',
   waitControlConfirmationReply:async(pcIndex,actualChallenge,actualUser)=>{
    assert.equal(pcIndex,0);assert.equal(actualChallenge,challenge);assert.equal(actualUser,user);order.push('exact canonical final complete');
    if(fail)throw replyFailure;return {proofWindowEnd:7500};
   },resolveConfirmationUserTurn:()=>({turnId:'confirmation-user'}),
  });await assert.rejects(run(),error=>error===(fail?replyFailure:stopped));
  assert.deepEqual(inputs,fail?['cancel-task']:['cancel-task','confirmation']);
  assert.deepEqual(order,controlPath==='combined'?['play cancel-task','play confirmation']:
   fail?['greeting complete','play cancel-task','exact canonical final complete']:
   ['greeting complete','play cancel-task','exact canonical final complete','play confirmation']);
 }
});
test('complete final readiness preserves every qualifier and joins fragmented original turns',()=>{
 const f=finalDeliveryFixture(),proof=assessLifecycleFinalSpeech(f.state,f.params);assert(proof);
 assert.equal(proof.completeBodyMatched,true);assert(proof.quiet.durationMs>=750);assert(proof.playback.passed);
 const terminal=f.state.events.at(-1),caption=f.state.events.at(-2),first=f.state.events.at(-3);
 first.turnId=caption.turnId=terminal.turnId='part1';caption.text=terminal.text='同事甲是你的同事;';terminal.at=204350;
 f.state.events.push({pcIndex:0,at:204360,type:'turn.created',role:'assistant',turnId:'part2'},
  {pcIndex:0,at:204370,type:'output_transcript.added',turnId:'part2',text:'OpenAI Realtime API 文档建议浏览器一般使用 WebRTC。'},
  {pcIndex:0,at:204500,type:'turn.done',role:'assistant',turnId:'part2',text:'OpenAI Realtime API 文档建议浏览器一般使用 WebRTC。'});
 const joined=assessLifecycleFinalSpeech(f.state,f.params);assert(joined);assert.deepEqual(joined.window.turnIds,['part1','part2']);
 assert.equal(joined.window.from,proof.window.from);assert.equal(joined.window.to,proof.window.to);
});
test('progress, partial final, changed qualifiers, new USER and incomplete RTP cannot be final readiness',()=>{
 const changes=[
  f=>{f.state.events.at(-1).text='记忆已查到，我现在在看 OpenAI 的 Realtime API 文档。';},
  f=>{f.state.events.at(-1).text='同事甲是你的同事;';},
  f=>{f.state.events.at(-1).text=f.state.events.at(-1).text.replace('一般','只能');},
  f=>{f.state.events.push({pcIndex:0,at:204400,role:'user',type:'turn.created',turnId:'new-user'});},
  f=>{f.state.events.push({pcIndex:0,at:202000,role:'user',type:'turn.done',turnId:'new-user',text:'另一个问题'});},
  f=>{f.state.events.push({pcIndex:0,at:204600,role:'assistant',type:'turn.created',turnId:'still-speaking'});},
  f=>{f.state.events.at(-3).at=204000;},
  f=>{f.body.canonical.final.delegationId='other';},
  f=>{f.state.audioFrames=f.state.audioFrames.slice(0,-4);},
  f=>{f.state.audioFrames=f.state.audioFrames.filter(row=>![204250,204300].includes(row.at));},
  f=>{f.state.audioFrames[8].paused=true;},
  f=>{f.state.audioFrames=f.state.audioFrames.map(row=>({...row,rtp:[]}));},
  f=>{f.state.audioFrames=f.state.audioFrames.map(row=>({...row,rtp:[{id:'receiver-own',timestamp:204400,packetsReceived:1,bytesReceived:10}]}));},
  f=>{f.state.audioFrames=f.state.audioFrames.map(row=>({...row,rtp:[{...row.rtp[0],id:'receiver-'+row.at}]}));},
  f=>{f.state.audioFrames.at(-1).rtp[0].packetsReceived=0;},
 ];
 for(const mutate of changes){const f=finalDeliveryFixture();mutate(f);assert.equal(assessLifecycleFinalSpeech(f.state,f.params),null);}
 const f=finalDeliveryFixture();f.events.at(-1).payload.data.text+='额外断言';
 assert.equal(resolveLifecycleCanonicalBody(f.events,{canonical:f.body.canonical,sessionKey:f.owner.sessionKey,runId:f.f.events[0].payload.runId}),null);
});
test('strict date representation normalization never drops substantive qualifications or other values',()=>{
 const canonical='记忆检索结果:记录日期2021-11-12，浏览器一般使用 WebRTC。';
 assert.equal(normalizeLifecycleFinalBody(canonical),normalizeLifecycleFinalBody('记录日期二零二一年十一月十二日,浏览器一般使用 webrtc。'));
 assert.notEqual(normalizeLifecycleFinalBody(canonical),normalizeLifecycleFinalBody('记录日期二零二一年十一月十一日,浏览器一般使用 WebRTC。'));
 assert.notEqual(normalizeLifecycleFinalBody(canonical),normalizeLifecycleFinalBody('记录日期二零二一年十一月十二日,浏览器只能使用 WebRTC。'));
 assert.notEqual(normalizeLifecycleFinalBody('文档示例:模型甲'),normalizeLifecycleFinalBody('模型甲'));
 for(const [left,right] of [['2.5','25'],['-3','3'],['+3','3'],['1/2','12'],['30%','30']])
  assert.notEqual(normalizeLifecycleFinalBody(left),normalizeLifecycleFinalBody(right),'Never erase numeric punctuation or units');
 assert.notEqual(normalizeLifecycleFinalBody('2021-11-11'),normalizeLifecycleFinalBody('二零二一年十一月十一十日'));
 assert.notEqual(normalizeLifecycleFinalBody('2021-02-28'),normalizeLifecycleFinalBody('二零二一年二月三十一日'));
});
test('whole multi-turn final playback retains a caption prefix received before its turn.created summary',()=>{
 const f=finalDeliveryFixture();f.state.events.at(-2).at=204230;
 const proof=assessLifecycleFinalSpeech(f.state,f.params);assert(proof);
 assert.equal(proof.window.from,204130);assert.equal(proof.turns[0].window.created.at,204250);
});
test('actual 200ms stats cadence is separate from the unchanged 100ms player sampling boundary',()=>{
 const f=finalDeliveryFixture();f.state.audioFrames=f.state.audioFrames.map((row,index)=>({...row,rtp:index%4===0?row.rtp:[]}));
 const proof=assessLifecycleFinalSpeech(f.state,f.params);assert(proof);assert(proof.independentRtp.durationMs>=750);
 assert.equal(hasLifecycleFinalPlaybackTail(f.state,f.params),true);
 const stale=structuredClone(f.state);stale.audioFrames=stale.audioFrames.map(row=>({...row,rtp:[{id:'receiver-own',timestamp:204400,packetsReceived:1,bytesReceived:10}]}));
 assert.equal(hasLifecycleFinalPlaybackTail(stale,f.params),false,'Do not copy full evidence for one stale RTP row');
 f.state.audioFrames=f.state.audioFrames.filter(row=>![204650,204700].includes(row.at));
 assert.equal(assessLifecycleFinalSpeech(f.state,f.params),null,'Player sampling gaps remain strict failure');
});
test('actual basicTools waits for canonical complete body and strict native tail before the next USER',async()=>{
 const source=readFileSync(new URL('./call-lifecycle-smoke.mjs',import.meta.url),'utf8');
 const from=source.indexOf('async function basicTools(pcIndex) {'),to=source.indexOf('\nasync function runLifecycle()',from);
 assert(from>=0&&to>from,'Execute the actual Memory/Web runner');
 const fixture=finalDeliveryFixture(),{f,owner,state}=fixture;
 const input={row:{exitCode:0,startedAt:f.after,completedAt:199500},done:Promise.resolve()};
 const run=async fail=>{
  const checks=[],records=[],saved=new Map(),boundaries=[];
  const basicTools=vm.runInNewContext('('+source.slice(from,to)+')',{
   assert,owners:new Map([[0,owner]]),ownedBackendHistoryBindings:[],memoryQuery:f.memoryQuery,play:()=>input,
   process:{env:{GPT_LIVE_H5_TRACE_PATH:'/private/trace'}},fs:{readFileSync:()=>''},parsePublicProgressDiagnostics:()=>fixture.diagnostics,
   waitFor:async(predicate,label,max)=>{boundaries.push({label,max});if(fail&&label.startsWith('Complete canonical'))throw fail;
    const value=await predicate(state);assert(value,'All actual tool/host/canonical prerequisites remain required');return value;},
   snapshot:async full=>{assert.equal(full,true);return state;},hasLifecyclePlaybackTail,resolveNativeControlOwner,resolveCanonicalFinalTrace,
   resolveLifecycleMemoryUser,resolveLifecycleMemoryWeb,resolveLifecycleConsultResult,resolveLifecycleCanonicalBody,
   resolveLifecycleFinalSpeechTurns,hasLifecycleFinalPlaybackTail,assessLifecycleFinalSpeech,readLifecycleHistoryOrRetry,
   ownedGatewayEvents:()=>fixture.events,gateway:{request:async(method,params)=>{assert.equal(method,'chat.history');assert.equal(params.sessionKey,owner.sessionKey);return f.history;}},
   coreCheck:(name,passed,details)=>checks.push({name,passed:Boolean(passed),details}),
   check:(name,passed,details)=>checks.push({name,passed:Boolean(passed),details}),
   recordSpeech:(name,proof)=>records.push({name,proof}),save:(name,value)=>saved.set(name,value),inputConverged:async()=>{},
  });
  await basicTools(0);return {checks,records,saved,boundaries};
 };
 const result=await run();assert.equal(result.boundaries.at(-1).max,45000,'No longer final wait deadline');
 assert.equal(result.records[0].proof.completeBodyMatched,true);
 assert.equal(result.saved.get('memory-web-evidence.json').speech.completeBodyMatched,true);
 assert.equal(result.checks.find(c=>c.name==='actual-memory-web-backend-result-returned-in-native-speech').passed,true);
 for(const failure of [Error('Complete canonical Memory/Web body in native speech and actual playback tail deadline'),Error('CDP Runtime.evaluate timeout')])
  await assert.rejects(run(failure),error=>error===failure,'Selection fixes do not swallow failed observations');
});
test('Memory/Web tool chain uses actual native source clocks and current complete results',()=>{
 const f=toolsFixture(),p=resolveLifecycleMemoryWeb(f);assert(p);
 assert.equal(p.memoryResult.at,201000);assert.equal(p.web.calledAt,201100);
 assert.equal(p.memory.calledAt,200000);assert.equal(p.sequentialExecutionVerified,true);
 assert.equal(extractLifecycleToolPairs(f.history)[0].calledAt,1000,'Persisted generation clock is retained only as persisted evidence');
});
test('parallel, stale, foreign, empty, errored and missing native tool evidence cannot pass',()=>{
 const changes=[f=>f.events[2].payload.ts=200500,f=>f.after=202000,
  f=>f.events[3].payload.sessionKey='neighbor',f=>f.events[2].payload.runId='neighbor',
  f=>f.history.messages[1].content[0].text=JSON.stringify({results:[]}),
  f=>f.history.messages[2].isError=true,f=>f.events=[],
  f=>f.history.messages[2].content[0].text=JSON.stringify({status:'blocked',content:'OpenAI Realtime denied'})];
 for(const change of changes){const f=toolsFixture();change(f);assert.equal(resolveLifecycleMemoryWeb(f),null);}
});
test('Memory/Web input is a complete original USER request and exact consult owner is required',()=>{
 const f=toolsFixture(),chain=resolveLifecycleMemoryWeb(f);
 const user={pcIndex:0,at:199900,role:'user',type:'turn.done',turnId:'u-tools',text:'先用 memory search 查某同事，再用 web search 查 OpenAI Realtime API，不要写入，也不要发消息。'};
 assert(resolveLifecycleMemoryUser([user],{pcIndex:0,after:199000,memoryQuery:f.memoryQuery}));
 assert.equal(resolveLifecycleMemoryUser([{...user,text:'查某同事。'}],{pcIndex:0,after:199000,memoryQuery:f.memoryQuery}),null);
 const state={events:[{pcIndex:0,at:200000,type:'delegation.created',raw:{item:{id:'native-owner',target:'client',user_bidi_turn_id:'u-tools'}}}],
  tools:[{at:200050,raw:{voiceSessionId:'voice-own',callId:chain.runId,type:'tool.call'}},
    {at:204000,raw:{voiceSessionId:'voice-own',callId:chain.runId,type:'tool.result'}}]};
 const params={pcIndex:0,voiceSessionId:'voice-own',userTurnId:'u-tools',toolChain:chain,after:199000};
 assert(resolveLifecycleConsultResult(state,params));
 for(const mutate of [s=>s.tools[1].raw.voiceSessionId='neighbor',s=>s.tools[1].raw.callId='other',
  s=>s.events[0].raw.item.user_bidi_turn_id='other',s=>s.tools.push({at:204001,raw:{voiceSessionId:'voice-own',callId:chain.runId,type:'tool.error'}})]){
  const input=structuredClone(state);mutate(input);assert.equal(resolveLifecycleConsultResult(input,params),null);
 }
});

// Anonymous diagnostic contracts only: these are not provider/model evidence.
function finalHistoryFixture() {
 const at=1791100000000,binding={pcIndex:0,voiceSessionId:'voice-own',sessionKey:'session-own',sessionId:'sqlite-own',
   runId:'run-own',userTurnId:'user-own',inputStartedAt:at+100};
 const owner={voiceSessionId:binding.voiceSessionId,sessionKey:binding.sessionKey};
 const state={pcStates:['closed'],events:[{pcIndex:0,at:at+200,type:'delegation.created',raw:{item:{id:'native-own',target:'client',user_bidi_turn_id:binding.userTurnId}}}],
  tools:[{at:at+250,raw:{type:'tool.call',voiceSessionId:binding.voiceSessionId,callId:binding.runId}}],
  api:[{route:'/api/close',status:200,requestedAt:at+9000,at:at+9100,request:{voiceSessionId:binding.voiceSessionId}}]};
 const text='来源只对浏览器连接给出一般建议，不能据此保证每个终端都相同。';
 const message={role:'assistant',timestamp:at+4000,stopReason:'stop',api:'actual-api',provider:'actual-provider',model:'request-model',
  responseModel:'provider-actual-model',responseId:'provider-actual-response',modelCallId:'provider-actual-call',
  content:[{type:'text',text}],__openclaw:{runId:binding.runId}};
 const history={sessionKey:binding.sessionKey,sessionId:binding.sessionId,messages:[structuredClone(message)]};
 const transcript={canonicalSessionKey:binding.sessionKey,sessionId:binding.sessionId,runId:'requested-label-is-not-proof',queryOnly:true,
  source:'private-sqlite-active-transcript',rawEvents:[{seq:12,createdAt:at+5010,event:{message}}]};
 const body={text,event:{payload:{runId:binding.runId,sessionKey:binding.sessionKey,ts:at+5000}},canonical:{received:{at:at+5020}}};
 const selection=selectLifecycleFinalHistoryBinding({bindings:[binding],owners:new Map([[0,owner]]),state});
 return {binding,owner,state,selection,history,transcript,body,observedAt:at+10000};
}
test('final history is read only for one exact native USER/host run after its original owned close',()=>{
 const f=finalHistoryFixture();assert.equal(f.selection.status,'bound');
 const changes=[
  x=>x.bindings.push({...x.bindings[0]}),x=>x.bindings=[],x=>x.bindings[0].sessionId=null,
  x=>x.owners.set(0,{...x.owners.get(0),voiceSessionId:'foreign'}),
  x=>x.state.events.push(structuredClone(x.state.events[0])),x=>x.state.events[0].raw.item.user_bidi_turn_id='new-user',
  x=>x.state.tools[0].raw.callId='foreign-run',x=>x.state.tools.push(structuredClone(x.state.tools[0])),
  x=>x.state.pcStates[0]='connected',x=>x.state.api[0].request.voiceSessionId='foreign',x=>delete x.state.api[0].at,
 ];
 for(const change of changes){const g=finalHistoryFixture(),x={bindings:[g.binding],owners:new Map([[0,g.owner]]),state:g.state};
  change(x);assert.equal(selectLifecycleFinalHistoryBinding(x).status,'unavailable');}
});
test('the actual private transcript reader bounds only the explicit diagnostic read and propagates its child timeout',()=>{
 const source=readFileSync(new URL('./read-child-transcript.mjs',import.meta.url),'utf8'),from=source.indexOf('export function readPrivateChildTranscript('),
   to=source.indexOf('\nexport function activeTranscriptMessages(',from);assert(from>=0&&to>from);
 const requests=[],timeout=Object.assign(Error('Python transcript deadline'),{code:'ETIMEDOUT'});
 let fail=false;
 const read=vm.runInNewContext('('+source.slice(from,to).replace(/^export /u,'')+')',{assert,path,
  execFileSync:(program,args,options)=>{requests.push({program,args,options});if(fail)throw timeout;
   return JSON.stringify({canonicalSessionKey:'session-own',queryOnly:true,rawEvents:[],activeEvents:[]});}});
 const params={state:'/private/owned/state',candidateData:'/private/owned',sessionId:'sqlite-own',runId:'run-own',requestedSessionKey:'session-own'};
 read(params);assert.equal(Object.hasOwn(requests.at(-1).options,'timeout'),false,'Existing callers retain their contract');
 read({...params,timeoutMs:5000});assert.equal(requests.at(-1).program,'python3');
 assert.equal(requests.at(-1).options.timeout,5000);assert.equal(requests.at(-1).options.killSignal,'SIGKILL');
 assert(requests.at(-1).args[1].includes('PRAGMA query_only=ON'));assert(requests.at(-1).args[1].includes('mode=ro'));
 for(const timeoutMs of [0,-1,10001,1.5,NaN,null])assert.throws(()=>read({...params,timeoutMs}),/Bounded/u);
 fail=true;assert.throws(()=>read({...params,timeoutMs:5000}),error=>error===timeout,'No timeout is mislabeled as a transcript');
});
test('actual final provider metadata is bound to original raw run and canonical bytes, never request config',()=>{
 const f=finalHistoryFixture(),result=assessLifecycleFinalHistory(f);assert.equal(result.status,'captured');
 assert.equal(result.final.providerMetadata.responseModel.value,'provider-actual-model');
 assert.equal(result.final.providerMetadata.model.value,'request-model');
 assert.equal(result.final.providerMetadata.responseId.value,'provider-actual-response');
 assert.equal(result.final.providerMetadata.modelCallId.value,'provider-actual-call');
 assert.equal(result.final.messageAt,1791100004000);assert.equal(result.final.backendFinalSourceAt,1791100005000);
 assert.equal(result.final.timestampIsNotBackendCompletionClock,true);
 assert.equal(result.final.textSha256,createHash('sha256').update(f.body.text).digest('hex'));
 assert.equal(result.acceptanceGateChanged,false);
 const missing=finalHistoryFixture();delete missing.transcript.rawEvents[0].event.message.responseModel;
 delete missing.transcript.rawEvents[0].event.message.responseId;delete missing.transcript.rawEvents[0].event.message.modelCallId;
 missing.history.defaults={model:'must-not-fill-provider-fields',responseId:'must-not-fill-response'};
 const unavailable=assessLifecycleFinalHistory(missing);
 for(const key of ['responseModel','responseId','modelCallId'])assert.deepEqual(unavailable.final.providerMetadata[key],{status:'not-present'});
});
test('display-capped history retains full raw final bytes/hash and cannot abbreviate the raw run binding',()=>{
 const f=finalHistoryFixture(),text=('必要来源条件与结论须一起保留。').repeat(1000);
 f.body.text=text;f.transcript.rawEvents[0].event.message.content=[{type:'text',text:' '+text+'\n'}];
 f.history.messages[0].content=[{type:'text',text:text.slice(0,8000)}];
 f.history.messages[0].__openclaw={runId:'run-…',truncated:true,reason:'display-cap'};
 const result=assessLifecycleFinalHistory(f);assert.equal(result.status,'captured');
 assert.equal(result.historyDisplayTruncated,true);assert.deepEqual(result.historyFinalCandidates,[]);
 assert.equal(result.final.textSha256,createHash('sha256').update(text).digest('hex'));
 assert.equal(result.final.rawTextSha256,createHash('sha256').update(' '+text+'\n').digest('hex'));
 assert(result.final.rawTextBytes>8000);
 f.transcript.rawEvents[0].event.message.__openclaw.runId='run-…';f.transcript.runId=f.binding.runId;
 assert.equal(assessLifecycleFinalHistory(f).status,'unavailable','Caller label never repairs a truncated actual runId');
});
test('missing, ambiguous, foreign, early and changed final histories stay explicitly unavailable',()=>{
 const changes=[x=>x.history.sessionKey='foreign',x=>x.history.sessionId='rotated',x=>x.history=null,
  x=>x.transcript=null,x=>x.transcript.canonicalSessionKey='foreign',x=>x.transcript.sessionId='foreign',x=>x.transcript.queryOnly=false,
  x=>x.body=null,x=>x.body.event.payload.runId='foreign',x=>x.body.event.payload.sessionKey='foreign',
  x=>x.body.event.payload.ts=x.binding.inputStartedAt-1,
  x=>x.observedAt=x.selection.originalCloseReturnedAt-1,
  x=>x.transcript.rawEvents[0].event.message.content[0].text+='changed condition',
  x=>x.transcript.rawEvents.push(structuredClone(x.transcript.rawEvents[0])),
  x=>x.transcript.rawEvents[0].event.message.stopReason='toolUse',
  x=>x.transcript.rawEvents[0].event.runId='conflicting-actual-run',
  x=>x.transcript.rawEvents[0].event.message.timestamp=x.binding.inputStartedAt-1,
  x=>x.transcript.rawEvents[0].createdAt=x.observedAt+1,
  x=>x.transcript.rawEvents[0].event.message.timestamp=x.observedAt+1,
 ];
 for(const mutate of changes){const f=finalHistoryFixture();mutate(f);assert.equal(assessLifecycleFinalHistory(f).status,'unavailable');}
});
test('actual lifecycle finally preserves early history and cleans up after successful, failed or unwritable final readback',async()=>{
 const source=readFileSync(new URL('./call-lifecycle-smoke.mjs',import.meta.url),'utf8');
 const basicFrom=source.indexOf('async function basicTools(pcIndex) {'),basicTo=source.indexOf('\nasync function runLifecycle()',basicFrom);
 const captureFrom=source.indexOf('async function captureOwnedBackendFinalHistory() {'),captureTo=source.indexOf('\nasync function inputConverged(',captureFrom);
 const finallyFrom=source.indexOf('\nfinally {\n if(cdp){'),finallyTo=source.indexOf("\n check('actual-'+validationTarget+'-config-unchanged'",finallyFrom);
 assert(basicFrom>=0&&basicTo>basicFrom&&captureFrom>=0&&captureTo>captureFrom&&finallyFrom>=0&&finallyTo>finallyFrom);
 const canonicalFailure=Error('Complete canonical Memory/Web body in native speech and actual playback tail deadline');
 for(const mode of ['success','canonical-failure','history-failure','private-transcript-timeout','assessment-failure','final-save-failure','transcript-save-failure','receipt-save-failure']) {
  const failure=mode==='success'?null:canonicalFailure;
  const fixture=finalDeliveryFixture(),wall=1791100000000,seen=new WeakSet();
  const shift=value=>{if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);for(const [key,item] of Object.entries(value))
   if(['at','ts','timestamp','after','from','to'].includes(key)&&typeof item==='number')value[key]=wall+item;else shift(item);};shift(fixture);
  const {f,owner,state}=fixture;f.history.sessionKey=owner.sessionKey;f.history.sessionId='sqlite-own';state.pcStates=['connected'];state.api=[];
  const input={row:{exitCode:0,startedAt:f.after,completedAt:wall+199500},done:Promise.resolve()},trace=[],saved=new Map(),checks=[];
  const diagnostic=finalHistoryFixture(),finalMessage=diagnostic.transcript.rawEvents[0].event.message;
  finalMessage.content=[{type:'text',text:fixture.body.text}];finalMessage.__openclaw.runId=f.events[0].payload.runId;
  finalMessage.timestamp=wall+203500;diagnostic.transcript.rawEvents[0].createdAt=wall+204095;
  const finalHistory={sessionKey:owner.sessionKey,sessionId:'sqlite-own',messages:[finalMessage]};
  const finalTranscript={...diagnostic.transcript,canonicalSessionKey:owner.sessionKey,sessionId:'sqlite-own',observedAt:wall+210000};
  let historyReads=0,closed=false;
  const context=vm.createContext({assert,Buffer,checks,Date:{now:()=>wall+210000},owners:new Map([[0,owner]]),ownedBackendHistoryBindings:[],
   memoryQuery:f.memoryQuery,play:()=>input,validationTarget:'candidate',validationProfile:{memoryWebRequired:true},stateRoot:'/private/owned/state',
   process:{env:{GPT_LIVE_H5_TRACE_PATH:'/private/trace',VLAB_CANDIDATE_DATA:'/private/owned'}},
   fs:{readFileSync:()=>'',writeFileSync:()=>{},existsSync:()=>false},path:{join:()=>'/private/output'},base:'/private/output',
   parsePublicProgressDiagnostics:()=>fixture.diagnostics,resolveNativeControlOwner,resolveCanonicalFinalTrace,
   resolveLifecycleMemoryUser,resolveLifecycleMemoryWeb,resolveLifecycleConsultResult,resolveLifecycleCanonicalBody,
   resolveLifecycleFinalSpeechTurns,hasLifecycleFinalPlaybackTail,assessLifecycleFinalSpeech,readLifecycleHistoryOrRetry,
   selectLifecycleFinalHistoryBinding,assessLifecycleFinalHistory:args=>{if(mode==='assessment-failure')throw Error('actual final assessment exception');return assessLifecycleFinalHistory(args);},
   waitFor:async(predicate,label)=>{if(failure&&label.startsWith('Complete canonical'))throw failure;const value=await predicate(state);assert(value);return value;},
   snapshot:async()=>state,ownedGatewayEvents:()=>fixture.events,
   gateway:{request:async(method,params,options)=>{assert.equal(method,'chat.history');assert.equal(params.sessionKey,owner.sessionKey);assert.equal(params.limit,120);
    if(++historyReads===1)return f.history;assert(closed,'Read final only after original PC close');assert.equal(options.timeoutMs,10000);trace.push('final-history');
    if(mode==='history-failure')throw Error('chat.history timeout');return finalHistory;},stop:()=>trace.push('gateway-stop')},
   readPrivateChildTranscript:params=>{assert(closed);assert.equal(params.sessionId,'sqlite-own');assert.equal(params.runId,f.events[0].payload.runId);
    assert.equal(params.requestedSessionKey,owner.sessionKey);assert.equal(params.timeoutMs,5000);trace.push('final-raw-transcript');
    if(mode==='private-transcript-timeout')throw Object.assign(Error('Python transcript deadline'),{code:'ETIMEDOUT'});return finalTranscript;},
   cdp:{request:async()=>null,close:()=>trace.push('CDP-close')},manualCleanup:async()=>{trace.push('original-close');closed=true;state.pcStates[0]='closed';
    state.api.push({route:'/api/close',status:200,requestedAt:wall+209000,at:wall+209100,request:{voiceSessionId:owner.voiceSessionId}});},
   evaluate:async expression=>{assert(closed);if(expression.includes('dispose')){trace.push('dispose-after-close');return;}trace.push('media-export-after-close');return [];},
   coreCheck:(name,passed)=>checks.push({name,passed}),check:(name,passed,details)=>checks.push({name,passed,details}),
   recordSpeech:()=>{},save:(name,value)=>{trace.push('save-'+name);
    if(mode==='final-save-failure'&&name==='memory-web-owned-backend-final-history.json'||
       mode==='transcript-save-failure'&&name==='memory-web-owned-backend-final-transcript.json'||
       mode==='receipt-save-failure'&&name==='memory-web-owned-backend-final-history-receipt.json')throw Error('original final archive EIO');
    saved.set(name,structuredClone(value));},inputConverged:async()=>{},
   lastState:null,speechWindows:[],media:{executables:{}},spawnSync:()=>{throw Error('No decoded fixture audio');},hash:()=>'',
   cleanup:null,finalHistoryCaptureError:null,chrome:{pid:123,exitCode:0,signalCode:null,once:()=>{}},chromeProfile:'/private/owned/profile',
   chromeTemp:'/private/owned/chrome-temp',chromeTempIdentity:{},scratch:'/private/owned/scratch',scratchIdentity:{},
   observeOwnedChromeProcesses:()=>{trace.push('inspect-owned-Chrome');return {aliveProcesses:[],knownProcesses:[]};},sleep:async()=>{},
   pulse:{plays:[input.row],dispose:async()=>{trace.push('Pulse-dispose');return {disposed:true};}},
   removeOwnedBrowserDirectory:async directory=>{trace.push('remove-'+directory);return {removed:true};},
  });
  context.basicTools=vm.runInContext('('+source.slice(basicFrom,basicTo)+')',context);
  context.captureOwnedBackendFinalHistory=vm.runInContext('('+source.slice(captureFrom,captureTo)+')',context);
  const run=vm.runInContext('(async()=>{try {await basicTools(0);}catch(error){originalFailure=error;}'+source.slice(finallyFrom,finallyTo)+'\n}})',context);
  await run();assert.equal(context.originalFailure??null,failure,'Original readback failure remains unchanged');
  assert.equal(historyReads,2,'One early read and exactly one additional post-close final read');
  assert(trace.indexOf('original-close')<trace.indexOf('dispose-after-close'));
  assert(trace.indexOf('media-export-after-close')<trace.indexOf('final-history'));
  for(const marker of ['CDP-close','gateway-stop','inspect-owned-Chrome','Pulse-dispose','remove-/private/owned/chrome-temp','remove-/private/owned/scratch'])
   assert(trace.indexOf(marker)>trace.indexOf('final-history'),'Final diagnostics failure must not skip original cleanup: '+mode+' '+marker);
  assert.equal(checks.find(c=>c.name==='owned-browser-and-scratch-cleanup').passed,true);
  assert.equal(saved.get('memory-web-owned-backend-history.json').history.messages.length,f.history.messages.length,'Never replace early snapshot');
  if(['assessment-failure','final-save-failure','transcript-save-failure','receipt-save-failure'].includes(mode)) {
   const error=checks.find(c=>c.name==='owned-backend-final-history-observer-error');assert.equal(error.passed,false);
   assert(error.details.message.includes(mode==='assessment-failure'?'assessment exception':'archive EIO'));
  } else if(mode==='private-transcript-timeout') {
   const receipt=saved.get('memory-web-owned-backend-final-history-receipt.json');
   assert.equal(receipt.privateTranscriptRead.status,'unavailable');assert.equal(receipt.privateTranscriptRead.message,'Python transcript deadline');
   assert.equal(receipt.assessment.reason,'exact-private-final-transcript-unavailable');
   assert(!saved.has('memory-web-owned-backend-final-transcript.json'));
  } else if(mode==='history-failure') {
   assert.equal(saved.get('memory-web-owned-backend-final-history-receipt.json').historyRead.status,'unavailable');
   assert.equal(saved.get('memory-web-owned-backend-final-history-receipt.json').historyRead.message,'chat.history timeout');
   assert(!saved.has('memory-web-owned-backend-final-history.json'));assert(!saved.has('memory-web-owned-backend-final-transcript.json'));
   assert(!checks.some(c=>c.name==='owned-backend-final-history-observer-error'),'Unavailable diagnostic is recorded, not a new model gate');
  } else {
   assert.equal(saved.get('memory-web-owned-backend-final-history.json').history.messages.length,1);
   assert.equal(saved.get('memory-web-owned-backend-final-history-receipt.json').assessment.status,'captured');
   assert.equal(saved.get('memory-web-owned-backend-final-history-receipt.json').assessment.final.providerMetadata.responseModel.value,'provider-actual-model');
  }
  if(failure)assert(!checks.some(c=>c.name==='actual-memory-web-backend-result-returned-in-native-speech'));
 }
});
