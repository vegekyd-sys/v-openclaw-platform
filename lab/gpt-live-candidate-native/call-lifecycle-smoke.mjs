// Dedicated real native call lifecycle workflow. Only synthetic USER PCM is
// fed to the original getUserMedia track; no assistant, tool or wire is forged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {createPrivatePulseMicrophone,captureOwnedBrowserDirectory,observeOwnedChromeProcesses,removeOwnedBrowserDirectory} from './private-pulse.mjs';
import {BROWSER_PROBE,readBoundedProbeSnapshot} from './browser-probe.mjs';
import {parsePublicProgressDiagnostics} from '../gpt-live-h5-provenance-evidence.mjs';
import {assessDecodedPlaybackWindow,assessCompletePlaybackWindow,assessIndependentInputConvergence,resolveNativeControlOwner,resolveCanonicalFinalTrace} from './evidence.mjs';
import {resolveEndCallToolWitness,assessEndCallConsultTerminal,resolveLifecycleUserTurn,assessLifecycleSpeech,hasLifecyclePlaybackTail,assessLifecycleFarewell,assessProactiveGreeting,assessAutomaticEnd,
  resolveLifecycleMemoryUser,resolveLifecycleMemoryWeb,resolveLifecycleConsultResult,resolveLifecycleCanonicalBody,
  resolveLifecycleFinalSpeechTurns,hasLifecycleFinalPlaybackTail,assessLifecycleFinalSpeech,readLifecycleHistoryOrRetry,resolveLifecycleValidationProfile} from './call-lifecycle-evidence.mjs';
import {inspectLifecycleValidationTarget,readLifecycleVoiceOwner,preflightLifecycleMedia} from './call-lifecycle-target.mjs';

const validationTarget=process.env.GPT_LIVE_H5_VALIDATION_TARGET??'candidate';
assert(['candidate','shared','v'].includes(validationTarget)&&process.env.GPT_LIVE_H5_CASE==='call-lifecycle','Explicit lifecycle workflow target required');
const validationProfile=resolveLifecycleValidationProfile(process.env.GPT_LIVE_H5_LIFECYCLE_PROFILE,validationTarget);
if(validationTarget==='candidate')assert(process.env.VLAB_CANDIDATE_ID&&process.env.GPT_LIVE_H5_READY==='1','Ready owned Candidate lifecycle workflow required');
else assert(!process.env.VLAB_CANDIDATE_ID,'Shared/V validation must not impersonate a Candidate');
const base=process.env.GPT_LIVE_H5_EVIDENCE_DIR,stateRoot=process.env.OPENCLAW_STATE_DIR;
const configPath=process.env.OPENCLAW_CONFIG_PATH,runtime=process.env.GPT_LIVE_H5_RUNTIME_ROOT;
const clips=process.env.GPT_LIVE_H5_USER_CLIPS_DIR,url=process.env.GPT_LIVE_H5_URL;
assert([base,stateRoot,configPath,runtime,clips].every(v=>typeof v==='string'&&path.isAbsolute(v))&&url?.startsWith('http://127.0.0.1:'),'Private absolute paths and loopback H5 required');
const budget=Number(process.env.GPT_LIVE_H5_NATIVE_CASE_SECONDS??300);
assert(Number.isSafeInteger(budget)&&budget>=120&&budget<=600,'Bounded lifecycle case budget required');
const deadline=Date.now()+budget*1000;
let targetInspection=null;
if(validationTarget!=='candidate')targetInspection=await inspectLifecycleValidationTarget({target:validationTarget,
  proofPath:process.env.GPT_LIVE_H5_TARGET_PROOF,configPath,corePath:runtime,stateRoot,url});
const config=targetInspection?.config??JSON.parse(fs.readFileSync(configPath)),configSha=hash(fs.readFileSync(configPath));
const gatewayEnvironment=targetInspection?.gatewayEnvironment??process.env;
const mediaConfig=validationTarget==='candidate'?{}:JSON.parse(fs.readFileSync(process.env.GPT_LIVE_H5_TARGET_PROOF)).media??{};
const media=preflightLifecycleMedia(mediaConfig);
const memoryQuery=process.env.GPT_LIVE_H5_MEMORY_QUERY;assert(typeof memoryQuery==='string'&&memoryQuery.trim(),'Private memory query for this actual USER clip required');
const clipManifest=JSON.parse(fs.readFileSync(path.join(clips,'manifest.json')));
assert.deepEqual([...clipManifest.clips.map(row=>row.name)].sort(),['end-call','keep-call','memory-web']);
for(const clip of clipManifest.clips){assert.equal(hash(fs.readFileSync(path.join(clips,clip.name+'.wav'))),clip.wavSha256,'Actual USER PCM differs from manifest');
  assert.equal(hash(fs.readFileSync(path.join(clips,clip.name+'.txt'))),clip.textSha256,'Actual USER clip text differs from manifest');}
if(validationTarget!=='candidate') {
 const expected=JSON.parse(fs.readFileSync(process.env.GPT_LIVE_H5_TARGET_PROOF));
 assert.equal(hash(fs.readFileSync(path.join(clips,'manifest.json'))),expected.userClipsManifestSha256,'Frozen validation USER clips changed');
 if(process.env.GPT_LIVE_H5_SOURCE_COMMIT)assert.equal(process.env.GPT_LIVE_H5_SOURCE_COMMIT,expected.sourceCommit);
}
const servedApp=await fetch(new URL('app.js',url)).then(r=>{assert.equal(r.status,200);return r.arrayBuffer()});
assert.equal(hash(Buffer.from(servedApp)),process.env.GPT_LIVE_H5_APP_SHA,'Actual served app source must match frozen handoff');
if(validationTarget==='candidate'){fs.mkdirSync(base,{recursive:true,mode:0o700});fs.mkdirSync(path.join(stateRoot,'tmp'),{recursive:true,mode:0o700});}
else {assert(!fs.existsSync(base),'Shared/V evidence directory must be fresh and validation-owned');fs.mkdirSync(base,{recursive:false,mode:0o700});}
const scratch=fs.mkdtempSync(validationTarget==='candidate'?path.join(stateRoot,'tmp/call-lifecycle-'):path.join(base,'scratch-'));fs.chmodSync(scratch,0o700);
const scratchIdentity=captureOwnedBrowserDirectory(scratch,{parent:path.dirname(scratch),prefix:validationTarget==='candidate'?'call-lifecycle-':'scratch-'});
const chromeProfile=path.join(scratch,'profile');
const checks=[],owners=new Map(),speechWindows=[],gatewayEvents=[],subscribed=new Set(),coreCheckNames=new Set();
let pulse,chrome,chromeTemp,chromeTempIdentity,cdp,gateway,lastState,snapshotCache,cleanup,browserTimeOrigin;
function hash(value){return createHash('sha256').update(value).digest('hex')}
function save(name,value){fs.writeFileSync(path.join(base,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});}
function check(name,passed,details={}){checks.push({name,passed:Boolean(passed),...details});}
function coreCheck(name,passed,details={}){coreCheckNames.add(name);check(name,passed,details);}
class CdpClient {
 constructor(url){this.url=url;this.pending=new Map();this.nextId=1;}
 async connect(){this.socket=new WebSocket(this.url);await new Promise((resolve,reject)=>{this.socket.addEventListener('open',resolve,{once:true});this.socket.addEventListener('error',reject,{once:true});});this.socket.addEventListener('message',event=>{const r=JSON.parse(String(event.data)),p=this.pending.get(r.id);if(!p)return;this.pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(r.error.message)):p.resolve(r.result??{});});}
 request(method,params={}){const id=this.nextId++;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP '+method+' timeout'))},20000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));});}
 close(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('CDP closed'));}this.pending.clear();this.socket?.close();}
}
async function evaluate(expression){const r=await cdp.request('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result?.value;}
async function snapshot(full=false){const state=await readBoundedProbeSnapshot(evaluate,{previous:full?null:snapshotCache,
 onClockRow:row=>{fs.appendFileSync(path.join(base,'browser-page-clocks.jsonl'),JSON.stringify(row)+'\n',{mode:0o600});}});
 if(state&&state.probeTimeOrigin===snapshotCache?.probeTimeOrigin)assert(state.duplexSnapshotGeneration>snapshotCache.duplexSnapshotGeneration,'Full snapshot cannot reuse an old browser header');
 snapshotCache=state;
 if(state)state.browserTimeOrigin=browserTimeOrigin;
 return lastState=full||!state?state:{...state,audioFrames:state.audioFrames.slice(-80),micFrames:state.micFrames.slice(-80),duplex:null};}
async function waitFor(predicate,label,max=45000){const until=Math.min(deadline,Date.now()+max);while(Date.now()<until){const s=await snapshot(),r=await predicate(s);if(r)return r;await sleep(200);}throw Error(label+' deadline');}
async function clickOriginalButton(id){const rect=await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});if(!e||e.disabled||e.hidden)throw Error('Original button unavailable');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}})()`);assert(rect.width>0&&rect.height>0);for(const type of ['mousePressed','mouseReleased'])await cdp.request('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,button:'left',clickCount:1});}
async function startCall(){
 const idle=await evaluate(`(async()=>{const r=await fetch('/api/status');if(!r.ok)throw Error('Original H5 status unavailable');return r.json()})()`);
 assert(idle.ready===true&&idle.activeCall===false&&idle.creatingSession===false,'H5 has an active/starting foreign call; do not replace it');
 save('pre-dial-idle-'+owners.size+'.json',{at:Date.now(),...idle,target:validationTarget});
 const pcIndex=(await snapshot()).pcStates.length;await clickOriginalButton('start');
 await waitFor(s=>s.pcStates[pcIndex]==='connected','Original native WebRTC connection');
 await waitFor(s=>s.api.filter(a=>a.route==='/api/session'&&a.status===200).length>pcIndex&&
   typeof s.api.filter(a=>a.route==='/api/session'&&a.status===200).at(-1)?.voiceSessionId==='string','Native browser session handoff',15000);
 const s=await snapshot(),created=s.api.filter(a=>a.route==='/api/session'&&a.status===200).at(-1);
 let meta;
 if(validationTarget==='candidate')meta=JSON.parse(fs.readFileSync(process.env.GPT_LIVE_H5_SESSION_PATH));
 else {
  let error;for(const until=Date.now()+15000;Date.now()<until;){
   try{meta=readLifecycleVoiceOwner({database:targetInspection.agentDatabasePath,stateRoot,voiceSessionId:created.voiceSessionId,python:media.executables.python});break;}
   catch(e){error=e;await sleep(250);}
  }
  assert(meta,'Exact native voice owner SQLite record unavailable: '+String(error?.message??'missing').slice(0,200));
  save('voice-owner-native-record-'+pcIndex+'.json',meta);
 }
 assert.equal(created.voiceSessionId,meta.voiceSessionId,'Exact original H5 owner');assert.equal(created.model,'gpt-live-1-codex');
 const owner={voiceSessionId:meta.voiceSessionId,sessionKey:meta.sessionKey,createdAt:created.at,
   connectedAt:s.pcTransitions.find(t=>t.pcIndex===pcIndex&&t.state==='connected')?.at??null};
 assert(Number.isFinite(owner.connectedAt));owners.set(pcIndex,owner);
 if(!subscribed.has(meta.sessionKey)){const r=await gateway.request('sessions.messages.subscribe',{key:meta.sessionKey,agentId:'makaron'},{timeoutMs:10000});assert.equal(r.subscribed,true);subscribed.add(meta.sessionKey);}
 const started={validationTarget,validationId:targetInspection?.proof.validationId??null,candidateId:validationTarget==='candidate'?process.env.VLAB_CANDIDATE_ID:null,case:'call-lifecycle',pcIndex,...owner,paidVoiceStarted:true,observedAt:Date.now()};
 save('native-voice-started-'+pcIndex+'.json',started);console.log(JSON.stringify({nativeVoiceStarted:started}));return pcIndex;
}
function play(name){const input=pulse.play(path.join(clips,name+'.wav'),name);save('actual-input-clip-schedule.json',pulse.plays);input.done.then(()=>save('actual-input-clip-schedule.json',pulse.plays),()=>save('actual-input-clip-schedule.json',pulse.plays));return input;}
async function readCaptureClosed(pcIndex){return evaluate(`(()=>{const p=globalThis.__candidateLiveProbe;return {captureEnded:p.streams[${pcIndex}]?.getTracks().length>0&&p.streams[${pcIndex}].getTracks().every(t=>t.readyState==='ended'),pcClosed:p.pcs[${pcIndex}]?.connectionState==='closed'}})()`);}
async function manualCleanup(pcIndex){const owner=owners.get(pcIndex);if(!owner)return;
 let s=await snapshot();if(s.pcStates[pcIndex]!=='closed')await clickOriginalButton('stop');
 await waitFor(s=>s.pcStates[pcIndex]==='closed'&&s.api.some(a=>a.route==='/api/close'&&a.status===200&&a.request?.voiceSessionId===owner.voiceSessionId),'Original exact-owner manual cleanup',15000);
 const capture=await readCaptureClosed(pcIndex);check('manual-cleanup-'+pcIndex,capture.captureEnded&&capture.pcClosed,{...capture,manual:true});
}
async function waitSpeech(pcIndex,after,label,before=Infinity,{terminalAfter=after}={}){
 // Polling uses tails, so an earlier speech onset is not discarded. Once a
 // candidate terminal/quiet exists, take full raw before evaluating its window.
 const proof=await waitFor(async s=>{
  if(!hasLifecyclePlaybackTail(s,{pcIndex,after,terminalAfter,before}))return null;
  const full=await snapshot(true);return assessLifecycleSpeech(full,{pcIndex,after,terminalAfter,before,requireCreatedAfter:true});
 },label,45000);
 return proof;
}
function recordSpeech(name,proof){check(name,proof?.playback?.passed===true&&proof?.strictTailPassed!==false,{proof,strictCompletePlayback:true});if(proof)speechWindows.push({name,window:proof.window});}
async function greeting(pcIndex){
 const owner=owners.get(pcIndex);const ready=await waitFor(s=>s.api.find(a=>a.route==='/api/ready'&&a.status===200&&a.at>=owner.createdAt),'Original ready host operation',15000);
 const proof=await waitSpeech(pcIndex,ready.requestedAt,'Proactive native greeting with complete audible playback');
 // The completed proof owns its full caption/player/750ms quiet window. A
 // later full snapshot may introduce a new sampling gap while copying it;
 // that cannot erase an already observed greeting or extend its proof window.
 const state=await snapshot(true),g=assessProactiveGreeting(state,{pcIndex,owner,readyAt:ready.requestedAt,before:proof.quiet.to+1});
 const sameSpeech=g?.speech?.terminal.turnId===proof.terminal.turnId&&g?.speech?.window.from===proof.window.from&&g?.speech?.window.to===proof.quiet.to;
 const expectedUSERClipsFed=pcIndex===0?0:validationProfile.memoryWebRequired?3:2;
 coreCheck('proactive-greeting-before-any-USER-'+pcIndex,g?.passed&&sameSpeech&&pulse.plays.length===expectedUSERClipsFed,{ready,greeting:g,USERClipsFed:pulse.plays.length,expectedUSERClipsFed,greetingContentManualReviewRequired:true});
 recordSpeech('proactive-greeting-complete-digital-playback-'+pcIndex,proof);save('greeting-'+pcIndex+'-evidence.json',{owner,ready,greeting:g});return proof;
}
function ownedGatewayEvents() {
 const keys=new Set([...owners.values()].map(owner=>owner.sessionKey)),voices=new Set([...owners.values()].map(owner=>owner.voiceSessionId));
 return gatewayEvents.filter(e=>keys.has(e.payload?.sessionKey??e.payload?.session?.key)||voices.has(e.payload?.voiceSessionId));
}
async function inputConverged(pcIndex,input,label) {
 // This runs after the complete USER and actual reply have been observed.
 // Missing historical input samples cannot be repaired by repeatedly copying
 // the recording. Keep this independent strict FAIL and still observe the
 // newly requested lifecycle features; the overall receipt remains failed.
 const s=await snapshot(true),microphone=(s?.micFrames??[]).filter(f=>f.pcIndex===pcIndex);
 const lastSpeechAt=microphone.filter(f=>f.at>=input.startedAt&&f.at<=input.completedAt&&f.rms>.02).at(-1)?.at;
 // Frozen rows and their freshness share the browser's header clock. Paged
 // transfer duration is recorded separately; it cannot age those same rows.
 const observedAt=s?.snapshotObservedAt,latestMicAt=microphone.at(-1)?.at;
 const observation={observedAt:observedAt??null,source:'browser-wall-at-frozen-prefix-header',scope:'validation-clip-before-next-USER-injection',
   latestMicrophoneAt:latestMicAt??null,latestMicrophoneAgeMs:Number.isFinite(observedAt)&&Number.isFinite(latestMicAt)?observedAt-latestMicAt:null,
   collectorCompletedAt:s?.snapshotCompletedAt??null,collectorCompletedClock:s?.snapshotCompletedClock??null,
   collectionLatencyMs:s?.snapshotCollectionLatencyMs??null,snapshotGeneration:s?.duplexSnapshotGeneration??null};
 const proof=Number.isFinite(lastSpeechAt)&&Number.isFinite(observedAt)&&Number.isFinite(observation.latestMicrophoneAgeMs)&&observation.latestMicrophoneAgeMs>=0?
   assessIndependentInputConvergence({events:s.events,micFrames:microphone,pcIndex,input,lastSpeechAt,observedAt}):null;
 check(label,Boolean(proof),{proof,input,lastSpeechAt:lastSpeechAt??null,observation,strictFailurePreserved:true,
   failureDoesNotSkipRemainingLifecycleObservations:true});return proof;
}
async function basicTools(pcIndex) {
 const owner=owners.get(pcIndex),input=play('memory-web');await input.done;assert.equal(input.row.exitCode,0);
 const user=await waitFor(s=>resolveLifecycleMemoryUser(s.events,{pcIndex,after:input.row.startedAt,memoryQuery}),'Complete ordered Memory/Web USER transcript',20000);
 let nextHistoryAt=0,lastHistory;const historyReads=[];
 const chain=await waitFor(async()=>{
  if(Date.now()<nextHistoryAt)return null;nextHistoryAt=Date.now()+2000;
  const attemptedAt=Date.now();
  const history=await readLifecycleHistoryOrRetry(
    ()=>gateway.request('chat.history',{sessionKey:owner.sessionKey,limit:120},{timeoutMs:20000}),
    error=>{
      historyReads.push({attemptedAt,completedAt:Date.now(),status:'temporary-rebuilding',message:error.message});
      save('memory-web-owned-backend-history-read-attempts.json',{sessionKey:owner.sessionKey,attempts:historyReads});
    });
  if(history===null)return null;
  historyReads.push({attemptedAt,completedAt:Date.now(),status:'success'});
  save('memory-web-owned-backend-history-read-attempts.json',{sessionKey:owner.sessionKey,attempts:historyReads});
  lastHistory=history;
  save('memory-web-owned-backend-history.json',{sessionKey:owner.sessionKey,observedAt:Date.now(),history:lastHistory});
  return resolveLifecycleMemoryWeb({events:ownedGatewayEvents(),history:lastHistory,sessionKey:owner.sessionKey,memoryQuery,after:input.row.startedAt});
 },'Actual nonempty memory result before owned web search and result',120000);
 coreCheck('actual-owned-memory-result-before-web-call',chain.sequentialExecutionVerified===true,{memoryCallId:chain.memory.id,webCallId:chain.web.id,
  runId:chain.runId,sessionKey:chain.sessionKey,memoryResultAt:chain.memoryResult.at,webCallAt:chain.web.calledAt,webResultAt:chain.webResult.at});
 const allowed=new Set(['memory_search','memory_get','web_search','web_fetch','read','read_file']);
 const unexpected=chain.pairs.filter(p=>p.runId===chain.runId&&!allowed.has(p.name));
 check('requested-read-only-memory-web-tool-scope',unexpected.length===0,{unexpectedTools:unexpected.map(p=>({name:p.name,id:p.id})),requestedWrites:false,requestedMessages:false});
 const host=await waitFor(s=>resolveLifecycleConsultResult(s,{pcIndex,voiceSessionId:owner.voiceSessionId,userTurnId:user.turnId,toolChain:chain,after:input.row.startedAt}),
  'Original native USER delegation and real owned consult result',30000);
 // The native protocol has no business-final event. A progress turn or one
 // fragmented final can end after Web returns. Bind the real complete backend
 // body and all its final chunks, then wait for that entire body in the original
 // native turn sequence plus the unchanged real 750ms playback tail before
 // injecting another USER. Correct paraphrases may remain unverified by this
 // conservative readiness gate; independent content review is still required.
 let finalBody;
 const speech=await waitFor(async s=>{
  const diagnostics=parsePublicProgressDiagnostics(fs.readFileSync(process.env.GPT_LIVE_H5_TRACE_PATH,'utf8'));
  const nativeOwner=resolveNativeControlOwner({diagnostics,events:s.events,tools:s.tools,backendRunId:chain.runId,
    voiceSessionId:owner.voiceSessionId,pcIndex});
  const canonical=resolveCanonicalFinalTrace(diagnostics,nativeOwner);
  finalBody=resolveLifecycleCanonicalBody(ownedGatewayEvents(),{canonical,sessionKey:owner.sessionKey,runId:chain.runId});
  const params={pcIndex,body:finalBody,host,userTurnId:user.turnId};
  const ready=resolveLifecycleFinalSpeechTurns(s,params);
  if(!ready||!hasLifecycleFinalPlaybackTail(s,params))return null;
  return assessLifecycleFinalSpeech(await snapshot(true),params);
 },'Complete canonical Memory/Web body in native speech and actual playback tail',45000);
 coreCheck('actual-memory-web-backend-result-returned-in-native-speech',Boolean(host&&speech?.completeBodyMatched),{host,finalBody,speech,
   readinessMatchesCompleteBodyConservatively:true,semanticResultIndependentReviewRequired:true});
 recordSpeech('memory-web-result-complete-digital-playback',speech);
 save('memory-web-evidence.json',{input:input.row,user,owner,chain,host,finalBody,speech,semanticResultIndependentReviewRequired:true,
  exactFactSource:{memoryResult:chain.memoryResult.completeRawResult,webResult:chain.webResult.completeRawResult},summaryIsNotSemanticAcceptance:true});
 await inputConverged(pcIndex,input.row,'memory-web-independent-USER-input-convergence');
}
async function runLifecycle(){
 const pcIndex=await startCall();await greeting(pcIndex);
 await cdp.request('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await sleep(300);
 const mobileShot=await cdp.request('Page.captureScreenshot',{format:'png'});
 fs.writeFileSync(path.join(base,'connected-mobile-390x844.png'),Buffer.from(mobileShot.data,'base64'),{mode:0o600});
 const mobileLayout=await evaluate(`(()=>{const box=e=>{if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,display:s.display,visibility:s.visibility}};return {at:Date.now(),width:innerWidth,height:innerHeight,callState:document.body.dataset.callState,badge:document.getElementById('badge').textContent,bodyScrollWidth:document.body.scrollWidth,voiceStage:box(document.querySelector('.voice-stage')),portrait:box(document.querySelector('.portrait-wrap')),conversation:box(document.querySelector('.conversation-panel')),taskStatus:box(document.getElementById('taskStatus')),stop:box(document.getElementById('stop'))}})()`);
 save('connected-mobile-layout.json',mobileLayout);
 await cdp.request('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 const keep=play('keep-call');await keep.done;assert.equal(keep.row.exitCode,0);
 const keepUser=await waitFor(s=>resolveLifecycleUserTurn(s.events,{pcIndex,after:keep.row.startedAt,intent:'keep'}),'Complete keep-call USER native transcript',15000);
 // Native USER terminal and assistant caption receipt clocks may overlap.
 // Keep the independently verified complete USER turn, and retain all reply
 // captions after this exact input started instead of cutting off its prefix.
 const keepReply=await waitSpeech(pcIndex,keep.row.startedAt,'Model replies while the same call stays connected');
 const keepState=await snapshot(true),owner=owners.get(pcIndex);
 const keepBadTools=keepState.tools.filter(e=>e.at>=keep.row.startedAt&&e.raw?.voiceSessionId===owner.voiceSessionId&&e.raw?.name==='openclaw_end_call');
 const keepBadClose=keepState.api.filter(e=>e.route==='/api/close'&&e.request?.voiceSessionId===owner.voiceSessionId&&e.requestedAt>=keep.row.startedAt);
 coreCheck('complete-negative-hangup-keeps-same-call',keepState.pcStates[pcIndex]==='connected'&&keepState.callState==='connected'&&keepBadTools.length===0&&keepBadClose.length===0,{keepUser,keepReply,keepBadTools,keepBadClose});
 recordSpeech('keep-call-model-reply-complete-digital-playback',keepReply);save('keep-call-evidence.json',{input:keep.row,keepUser,keepReply,keepState});
 await inputConverged(pcIndex,keep.row,'independent-full-USER-input-convergence');
 if(validationProfile.memoryWebRequired)await basicTools(pcIndex);
 else save('narrow-control-diagnostic-scope.json',{validationProfile,at:Date.now(),memoryWebExecuted:false,
  priorMemoryWebFAILPreserved:true,combinedReleaseAccepted:false});
 const end=play('end-call');await end.done;assert.equal(end.row.exitCode,0);
 const expectedEndText=fs.readFileSync(path.join(clips,'end-call.txt'),'utf8');
 const endUser=await waitFor(s=>resolveLifecycleUserTurn(s.events,{pcIndex,after:end.row.startedAt,intent:'end',expectedText:expectedEndText}),
   'Complete frozen goodbye USER native transcript',15000);
 let endHistory,nextEndHistoryAt=0;const endHistoryReads=[];
 const endClose=s=>s.api.find(a=>a.route==='/api/close'&&a.request?.voiceSessionId===owner.voiceSessionId&&Number.isFinite(a.requestedAt));
 const endWitness=s=>resolveEndCallToolWitness({events:s.events,tools:s.tools,backendEvents:ownedGatewayEvents(),backendHistory:endHistory,
   sessionKey:owner.sessionKey,userTurnId:endUser.turnId,pcIndex,voiceSessionId:owner.voiceSessionId,after:end.row.startedAt,
   before:endClose(s)?.requestedAt??Infinity});
 let tool=await waitFor(async s=>{
  const direct=endWitness(s);if(direct)return direct;
  const backendRequested=s.tools.some(e=>e.raw?.voiceSessionId===owner.voiceSessionId&&e.raw?.source==='backend_model_client_tool'&&
    e.raw.name==='openclaw_end_call'&&e.raw.type==='tool.result'&&e.raw.originUserTurnId===endUser.turnId);
  if(!backendRequested||Date.now()<nextEndHistoryAt)return null;
  nextEndHistoryAt=Date.now()+500;const attemptedAt=Date.now();
  const history=await readLifecycleHistoryOrRetry(
    ()=>gateway.request('chat.history',{sessionKey:owner.sessionKey,limit:120},{timeoutMs:10000}),
    error=>{endHistoryReads.push({attemptedAt,completedAt:Date.now(),status:'temporary-rebuilding',message:error.message});
      save('end-call-owned-backend-history-read-attempts.json',{sessionKey:owner.sessionKey,attempts:endHistoryReads});});
  if(history===null)return null;
  // Durable storage may settle after the original product has closed the call.
  // Read exactly that original session, without postponing close or inventing
  // a result. All actual tool/source clocks must still precede acceptance/close.
  const observedAt=Date.now(),current=await snapshot(),close=endClose(current);
  endHistory={sessionKey:owner.sessionKey,observedAt,history};
  const phase=close?observedAt<close.requestedAt?'pre-close':'post-close':'close-not-yet-observed';
  endHistoryReads.push({attemptedAt,completedAt:observedAt,status:'success',historyObservationPhase:phase,
    originalCloseRequestedAt:close?.requestedAt??null});
  save('end-call-owned-backend-history-read-attempts.json',{sessionKey:owner.sessionKey,attempts:endHistoryReads});
  save('end-call-owned-backend-history.json',{...endHistory,historyObservationPhase:phase,originalCloseRequestedAt:close?.requestedAt??null});
  return endWitness(current);
 },'Actual model end-call tool, exact owned host receipt and durable backend result',20000);
 save('model-end-call-tool-witness.json',{endUser,tool,backendHistoryObservedAt:endHistory?.observedAt??null,
   durableHistoryDoesNotReplaceActualPreCloseToolSource:true});
 coreCheck('model-real-end-call-tool-after-complete-USER',tool.userTurnId===endUser.turnId,{endUser,tool,inputCompletedAt:end.row.completedAt,
   causalBinding:'Actual delegation user_bidi_turn_id equals the complete original USER turn; reception timestamps are retained, not treated as cross-stream execution order'});
 const closed=await waitFor(s=>s.pcStates[pcIndex]==='closed'&&s.api.some(a=>a.route==='/api/close'&&a.status===200&&a.request?.voiceSessionId===owner.voiceSessionId),'Original H5 automatic model-requested close',25000);
 const state=await snapshot(true),close=state.api.find(a=>a.route==='/api/close'&&a.status===200&&a.request?.voiceSessionId===owner.voiceSessionId);
 const finalTool=endWitness(state);
 check('end-call-witness-current-through-original-close',Boolean(finalTool),{
   requestId:tool.requestId,backendRunId:tool.backendRunId??null,historyObservedAt:endHistory?.observedAt??null,
   originalCloseRequestedAt:close.requestedAt,newUSERMustInvalidateOldRequest:true});
 assert(finalTool,'End-call causal witness invalidated before the original close');tool=finalTool;
 const consultTerminal=assessEndCallConsultTerminal(state,{tool,before:close.requestedAt});
 save('model-end-call-consult-terminal-evidence.json',consultTerminal);
 coreCheck('end-call-owned-consult-settles-once-without-error-before-original-close',consultTerminal.passed,consultTerminal);
 const farewell=assessLifecycleFarewell(state,{pcIndex,tool,before:close.requestedAt});
 const automatic=assessAutomaticEnd(state,{pcIndex,owner,tool,farewell}),capture=await readCaptureClosed(pcIndex);
 coreCheck('automatic-close-after-real-farewell-and750ms-tail',automatic?.passed&&capture.captureEnded&&capture.pcClosed,{automatic,capture,closed:true,manualButtonUsed:false,farewellContentManualReviewRequired:true});
 check('independent-farewell750ms-RTP-tail',automatic?.strictTailPassed===true,{quiet:farewell?.quiet??null,appDrain:automatic?.appDrain??null,
  originalAppDrainIsNotIndependentRTPProof:true});
 recordSpeech('farewell-complete-digital-playback',farewell);save('model-end-call-evidence.json',{input:end.row,endUser,tool,consultTerminal,farewell,automatic,capture,appDiagnostics:state.duplex});
 // A failed close/farewell does not justify a third or replacement paid call.
 assert(automatic?.passed&&capture.captureEnded&&capture.pcClosed,'Automatic lifecycle core evidence missing; no replacement call');
 const reopened=await startCall();coreCheck('new-owner-redial-after-model-close',owners.get(reopened).voiceSessionId!==owner.voiceSessionId&&owners.get(reopened).sessionKey!==owner.sessionKey,{previousOwner:owner,newOwner:owners.get(reopened)});
 await greeting(reopened);await manualCleanup(reopened);
}

try {
 save('validation-target-before.json',targetInspection?.proof??{target:'candidate',candidateId:process.env.VLAB_CANDIDATE_ID,configSha256:configSha,corePath:runtime});
 save('media-dependency-preflight.json',media);
 save('actual-USER-clip-manifest.json',clipManifest);
 const token=String(config.gateway.auth.token).replace(/\$\{([^}]+)\}/gu,(_,key)=>{assert(gatewayEnvironment[key]);return gatewayEnvironment[key]});
 const {GatewayClient}=await import(path.join(runtime,'dist/plugin-sdk/gateway-runtime.js'));
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Private Gateway observer hello deadline')),15000);gateway=new GatewayClient({url:'ws://127.0.0.1:'+config.gateway.port,token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.write'],caps:['tool-events'],onHelloOk:()=>{clearTimeout(timeout);resolve()},onConnectError:reject,onEvent:event=>{
  const p=event.payload,key=p?.sessionKey??p?.session?.key;
  if(['agent','session.tool','talk.event','chat'].includes(event.event)&&[...owners.values()].some(o=>key===o.sessionKey||p?.voiceSessionId===o.voiceSessionId))
    gatewayEvents.push({at:Date.now(),event:event.event,payload:p});
 }});gateway.start();});
 const subscription=await gateway.request('sessions.subscribe',{},{timeoutMs:10000});assert.equal(subscription.subscribed,true);
 pulse=await createPrivatePulseMicrophone(path.join(scratch,'pulse'),{validationTarget,privateScratchRoot:scratch,
  executables:media.executables,moduleDirectory:media.moduleDirectory,libraryPath:media.libraryPath});
 chromeTemp=fs.mkdtempSync('/tmp/gpt-live-chrome-');fs.chmodSync(chromeTemp,0o700);
 chromeTempIdentity=captureOwnedBrowserDirectory(chromeTemp,{parent:'/tmp',prefix:'gpt-live-chrome-'});
 const profile=chromeProfile;let chromeError='';
 chrome=spawn(media.executables.chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-features=AudioServiceSandbox','--remote-debugging-port=0','--window-size=1280,900','--user-data-dir='+profile,'--use-fake-ui-for-media-stream','about:blank'],{env:{...pulse.environment,TMPDIR:chromeTemp,TMP:chromeTemp,TEMP:chromeTemp},stdio:['ignore','ignore','pipe']});
 chrome.stderr.on('data',chunk=>{chromeError=(chromeError+String(chunk)).slice(-2000);fs.appendFileSync(path.join(base,'chrome-stderr.log'),chunk,{mode:0o600});});
 const debugFile=path.join(profile,'DevToolsActivePort');for(const until=Date.now()+15000;Date.now()<until&&!fs.existsSync(debugFile)&&chrome.exitCode===null;)await sleep(100);assert(fs.existsSync(debugFile),'Owned Chrome debugger unavailable: '+chromeError);
 const port=fs.readFileSync(debugFile,'utf8').split('\n')[0],targets=await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json());
 cdp=new CdpClient(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await cdp.connect();await cdp.request('Page.enable');await cdp.request('Runtime.enable');await cdp.request('Page.addScriptToEvaluateOnNewDocument',{source:BROWSER_PROBE});await cdp.request('Page.navigate',{url});
 await waitFor(s=>s?.callState==='idle'&&s.badge==='可以拨号','Ready original H5 rendered',10000);
 browserTimeOrigin=await evaluate('performance.timeOrigin');assert(Number.isFinite(browserTimeOrigin));
 await runLifecycle();
} catch(error){check('test-exception',false,{message:String(error.message).replace(/(token|secret|api.?key|authorization)[=: ]+[^\s]+/giu,'$1=[redacted]')});}
finally {
 if(cdp){
  const preClose=await snapshot(true).catch(()=>null);if(preClose)save('browser-pre-close-native-evidence.json',preClose);
  const shot=await cdp.request('Page.captureScreenshot',{format:'png'}).catch(()=>null);if(shot)fs.writeFileSync(path.join(base,'h5.png'),Buffer.from(shot.data,'base64'),{mode:0o600});
  for(const [pcIndex] of owners)if((await snapshot()).pcStates[pcIndex]!=='closed')await manualCleanup(pcIndex).catch(error=>check('finally-manual-cleanup-'+pcIndex,false,{message:error.message}));
  const postClose=await snapshot(true).catch(()=>null);lastState=postClose??preClose;
  check('complete-raw-observation-through-original-close',Boolean(postClose)&&[...owners.values()].every(owner=>postClose.api.some(a=>a.route==='/api/close'&&a.status===200&&a.request?.voiceSessionId===owner.voiceSessionId)),{postCloseFullAvailable:Boolean(postClose)});
  save('browser-native-evidence.json',lastState);save('gateway-tool-events.json',ownedGatewayEvents());save('actual-input-clip-schedule.json',pulse?.plays??[]);
  await evaluate('globalThis.__candidateLiveProbe.dispose()').catch(()=>{});
  const recordings=await evaluate(`(async()=>{const p=globalThis.__candidateLiveProbe,rows=[];for(const recording of p.recordings){const blob=new Blob(recording.chunks,{type:'audio/webm;codecs=opus'}),bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let at=0;at<bytes.length;at+=16384)binary+=String.fromCharCode(...bytes.subarray(at,at+16384));rows.push({pcIndex:recording.pcIndex,startedAt:recording.startedAt,blobBytes:blob.size,base64:btoa(binary),error:recording.error??null,recorderLifecycle:recording.lifecycle??null});}return rows})()`).catch(()=>[]);
  const recordingMetadata=recordings.map(({base64,...metadata})=>metadata);save('native-recordings-metadata.json',{recordings:recordingMetadata,nominalPCMMappingUnchanged:true});
  check('original-native-receiver-recording-finalization',recordings.length===owners.size&&recordings.length>0&&recordings.every(row=>row.recorderLifecycle?.finalization?.passed===true&&!row.error),{recordings:recordingMetadata,requiresActualNativeStopAndFinalData:true});
  const decoded=[];
  for(const row of recordings){const prefix='native-'+row.pcIndex,webm=path.join(base,prefix+'.webm');fs.writeFileSync(webm,Buffer.from(row.base64,'base64'),{mode:0o600});
   const ff=spawnSync(media.executables.ffmpeg,['-v','error','-i',webm,'-f','s16le','-ar','48000','-ac','1','pipe:1'],{maxBuffer:80*1024**2});
   if(ff.status===0)fs.writeFileSync(path.join(base,prefix+'.pcm'),ff.stdout,{mode:0o600});
   decoded.push({pcIndex:row.pcIndex,startedAt:row.startedAt,blobBytes:row.blobBytes,error:row.error??null,recorderLifecycle:row.recorderLifecycle,decodeSuccess:ff.status===0,pcmBytes:ff.stdout?.length??0,pcmSha256:ff.status===0?hash(ff.stdout):null,durationSeconds:(ff.stdout?.length??0)/96000});
  }
  check('original-native-receiver-recorded-PCM',decoded.length===owners.size&&decoded.length>0&&decoded.every(d=>d.decodeSuccess&&d.pcmBytes>0),{decoded});
  for(const {name,window} of speechWindows){const recording=decoded.find(d=>d.pcIndex===window.pcIndex&&d.decodeSuccess),pcm=recording&&fs.readFileSync(path.join(base,'native-'+window.pcIndex+'.pcm'));
   const segment=pcm&&assessDecodedPlaybackWindow(pcm,{...window,recordingStartedAt:recording.startedAt}),playback=assessCompletePlaybackWindow(lastState?.audioFrames??[],window);
   if(segment)fs.writeFileSync(path.join(base,name+'-whole-window.pcm'),pcm.subarray(segment.fromByte,segment.toByte),{mode:0o600});
   check(name+'-whole-decoded-PCM',segment?.passed&&playback?.passed,{segment,playback,window});
  }
  const captureWindows=[...owners].map(([pcIndex,owner])=>{const close=lastState?.api?.find(a=>a.route==='/api/close'&&a.status===200&&a.request?.voiceSessionId===owner.voiceSessionId),initial=lastState?.micDiagnostics?.find(d=>d.pcIndex===pcIndex),from=owner.connectedAt,to=close?.requestedAt;
   const frames=(lastState?.micFrames??[]).filter(f=>f.pcIndex===pcIndex&&f.at>=from&&f.at<to),gaps=frames.slice(1).flatMap((f,i)=>f.at-frames[i].at>100?[{from:frames[i].at,to:f.at}]:[]);
   return {pcIndex,from,to,initialTrackId:initial?.trackId,frameCount:frames.length,gaps,passed:Number.isFinite(to)&&frames.length>0&&frames[0].at-from<=100&&to-frames.at(-1).at<=100&&gaps.length===0&&frames.every(f=>f.trackState==='live'&&f.trackEnabled===true&&f.trackId===initial?.trackId&&f.senderTrackId===initial?.trackId)};});
  check('continuous-original-processed-microphone-through-close',captureWindows.length>0&&captureWindows.every(w=>w.passed),{captureWindows});
  check('original-browser-observer-no-capture-errors',Array.isArray(lastState?.observerErrors)&&lastState.observerErrors.length===0,{observerErrors:lastState?.observerErrors??null});
  check('default-Chrome-autoplay-no-play-rejection',Array.isArray(lastState?.playRejections)&&lastState.playRejections.length===0,{playRejections:lastState?.playRejections});
 }
 cdp?.close();gateway?.stop();let chromeProcesses,chromeProcessError;
 const inspectChrome=()=>chromeProcesses=observeOwnedChromeProcesses({profile:chromeProfile,rootPid:chrome?.pid,knownProcesses:chromeProcesses?.knownProcesses??[]});
 try{inspectChrome();}catch(error){chromeProcessError=error;}
 if(chrome?.exitCode===null&&chrome.signalCode===null)chrome.kill('SIGTERM');if(chrome)await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),sleep(2000)]);
 if(chrome?.exitCode===null&&chrome.signalCode===null){chrome.kill('SIGKILL');await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),sleep(1000)]);}
 // Preserve the actual run outcome before asynchronous browser filesystem
 // cleanup. A transient profile write must not hide a failed native operation.
 save('run-observations-before-cleanup.json',{checks,owners:[...owners],speechWindows});
 cleanup={chromeExited:Boolean(chrome&&(chrome.exitCode!==null||chrome.signalCode!==null))};
 if(!chromeProcessError) {
  try{for(const until=Date.now()+2000;Date.now()<until;){if(inspectChrome().aliveProcesses.length===0)break;await sleep(100);}}
  catch(error){chromeProcessError=error;}
 }
 cleanup.chromeProcessesExited=!chromeProcessError&&chromeProcesses?.aliveProcesses.length===0&&(!chrome||cleanup.chromeExited);
 save('owned-browser-cleanup-process-observations.json',{...chromeProcesses,error:chromeProcessError?{code:chromeProcessError.code??null,message:chromeProcessError.message}:null,
  mainExited:cleanup.chromeExited,allOwnedChromeProcessesExited:cleanup.chromeProcessesExited});
 if(!cleanup.chromeProcessesExited)check('owned-browser-process-exit',false,{code:chromeProcessError?.code??null,message:chromeProcessError?.message??'Owned Chrome processes remain alive; keep private directories'});
 try {Object.assign(cleanup,await pulse?.dispose());}
 catch(error){check('private-media-cleanup',false,{code:error.code??null,message:error.message});}
 if(chromeTemp){try {cleanup.chromeTempRemoval=await removeOwnedBrowserDirectory(chromeTemp,{identity:chromeTempIdentity,chromeExited:cleanup.chromeProcessesExited,inspectChrome});}
  catch(error){check('private-browser-temp-cleanup',false,{code:error.code??null,message:error.message});}
  cleanup.chromePrivateTempRemoved=!fs.existsSync(chromeTemp);}
 // Entire scratch is unique and owned by this observer; profiles are never reused.
 try {cleanup.scratchRemoval=await removeOwnedBrowserDirectory(scratch,{identity:scratchIdentity,chromeExited:cleanup.chromeProcessesExited,inspectChrome});}
 catch(error){check('private-scratch-cleanup',false,{code:error.code??null,message:error.message});}
 cleanup.privateScratchRemoved=!fs.existsSync(scratch);
 check('owned-browser-and-scratch-cleanup',cleanup.chromeExited&&cleanup.chromeProcessesExited&&cleanup.chromePrivateTempRemoved&&cleanup.privateScratchRemoved);
 check('actual-'+validationTarget+'-config-unchanged',hash(fs.readFileSync(configPath))===configSha);
 if(validationTarget!=='candidate') {
  try {const after=await inspectLifecycleValidationTarget({target:validationTarget,proofPath:process.env.GPT_LIVE_H5_TARGET_PROOF,configPath,corePath:runtime,stateRoot,url});
    save('validation-target-after.json',after.proof);check('actual-target-service-runtime-H5-unchanged',true);}
  catch(error){check('actual-target-service-runtime-H5-unchanged',false,{message:error.message});}
 }
 const expectedCoreNames=['proactive-greeting-before-any-USER-0','complete-negative-hangup-keeps-same-call','model-real-end-call-tool-after-complete-USER','automatic-close-after-real-farewell-and750ms-tail','new-owner-redial-after-model-close','proactive-greeting-before-any-USER-1'];
 const functionalCore=expectedCoreNames.map(name=>({name,passed:checks.find(c=>c.name===name)?.passed===true,observed:coreCheckNames.has(name)}));
 const wholeDecoded=checks.filter(c=>c.name.endsWith('-whole-decoded-PCM'));
 const lifecycleNames=new Set(['proactive-greeting-complete-digital-playback-0','proactive-greeting-complete-digital-playback-1','keep-call-model-reply-complete-digital-playback','farewell-complete-digital-playback']);
 const lifecycleDecoded=wholeDecoded.filter(c=>lifecycleNames.has(c.name.replace(/-whole-decoded-PCM$/u,'')));
 const toolSpeech=wholeDecoded.find(c=>c.name==='memory-web-result-complete-digital-playback-whole-decoded-PCM');
 const summary={case:'call-lifecycle',validationTarget,validationProfile,validationId:targetInspection?.proof.validationId??null,candidateId:validationTarget==='candidate'?process.env.VLAB_CANDIDATE_ID:null,
  sourceCommit:process.env.GPT_LIVE_H5_SOURCE_COMMIT??targetInspection?.proof.sourceCommit??null,h5AppSha256:process.env.GPT_LIVE_H5_APP_SHA,model:'gpt-live-1-codex',checks,passed:checks.length>0&&checks.every(c=>c.passed),functionalCore,
  coreLifecycleEvidenceComplete:functionalCore.every(c=>c.passed)&&lifecycleDecoded.length===4&&lifecycleDecoded.every(c=>c.segment?.passed===true),
  coreMemoryWebEvidenceComplete:checks.find(c=>c.name==='actual-owned-memory-result-before-web-call')?.passed===true&&checks.find(c=>c.name==='actual-memory-web-backend-result-returned-in-native-speech')?.passed===true&&toolSpeech?.segment?.passed===true,
  strictCompleteDigitalPlayback:validationProfile.memoryWebRequired&&wholeDecoded.length===5&&wholeDecoded.every(c=>c.passed)&&checks.find(c=>c.name==='independent-farewell750ms-RTP-tail')?.passed===true,
  scopedLifecycleDigitalPlayback:lifecycleDecoded.length===4&&lifecycleDecoded.every(c=>c.passed)&&checks.find(c=>c.name==='independent-farewell750ms-RTP-tail')?.passed===true,
  coverage:{memoryWeb:{executed:validationProfile.memoryWebRequired&&checks.some(c=>c.name==='actual-owned-memory-result-before-web-call'),
   covered:validationProfile.memoryWebRequired&&checks.find(c=>c.name==='actual-memory-web-backend-result-returned-in-native-speech')?.passed===true&&toolSpeech?.segment?.passed===true,
   reason:validationProfile.memoryWebRequired?'combined lifecycle scenario':'end-only profile; prior Memory/Web failures remain'}},
  combinedReleaseAccepted:false,
  continuousMicrophoneStrictPassed:checks.find(c=>c.name==='continuous-original-processed-microphone-through-close')?.passed===true,
  contentIndependentReviewRequired:true,productAccepted:false,owners:[...owners].map(([pcIndex,owner])=>({pcIndex,...owner})),syntheticUSERPCM:true,syntheticAssistantEvents:false,syntheticBackendResults:false,digitalPlaybackAcceptanceOnly:true,physicalEchoAccepted:false,humanListeningAccepted:false,cleanup,evidenceDir:base};
 save('receipt.json',summary);console.log(JSON.stringify({nativeCallLifecycle:{candidateId:summary.candidateId,passed:summary.passed,checks:checks.map(({name,passed})=>({name,passed})),evidenceDir:base}}));if(!summary.passed)process.exitCode=1;
}
