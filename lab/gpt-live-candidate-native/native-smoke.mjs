// Real original H5/native RTC test. PCM is fed to a private microphone source;
// no assistant/data-channel/tool event is synthesized and no sender is replaced.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {createPrivatePulseMicrophone} from './private-pulse.mjs';
import {BROWSER_PROBE,readBoundedProbeSnapshot} from './browser-probe.mjs';
import {parsePublicProgressDiagnostics,assessH5ProgressProvenance} from '../gpt-live-h5-provenance-evidence.mjs';
import {parseCompleteTimestamps} from '../gpt-live-call-live-evidence.mjs';
import {indexNativeToolPairs,mergeExactToolBodies,mergeSessionToolEvidence,extractExecDateFromPairs,continuousPlaybackQuiet,explicitSpokenOffsets,resolveNativeControlOwner,resolveCanonicalFinalTrace,toolResultSucceeded,isExactTwoPlusTwoReply,nativeCountRequestsEighty,hasOrderedCountBeginning,resolveOwnedChildExecPending,resolveOwnedBargeTerminal,resolveNativeTurnTranscriptWindow,assessCompletePlaybackWindow,assessDecodedPlaybackWindow,assessEarlySpeechBoundary,resolveEarlyPlaybackTail,assessNativeResponseDrain,assessIndependentInputConvergence,matchesConsumedConditionBatch,extractQueuedConditionResume} from './evidence.mjs';
import {readPrivateChildTranscript,activeTranscriptMessages} from './read-child-transcript.mjs';
import {extractControlExecWitness,assessControlExecPending,matchesExactControlMarker} from '../gpt-live-h5-control-evidence.mjs';
import {resolveControlExecConfirmationChallenge,resolveConfirmationUserTurn,resolveConfirmedControlExec,
  confirmationArgsFingerprint,findDurableConfirmationUserMessage,parseVoiceConfirmationDiagnostics,
  assessControlConfirmationCoreReceipt,parseControlProcessWitness,assessControlProcessPending,
  assessControlProcessExit,assessConfirmedControlCancel} from './confirmation-evidence.mjs';
import {validateOwnedProcObserverBinding,validateOwnedProcObserverStart} from './os-observer-lifecycle.mjs';
assert(process.env.VLAB_CANDIDATE_ID&&process.env.GPT_LIVE_H5_READY==='1','Ready private Candidate H5 required');
const testCase=process.env.GPT_LIVE_H5_CASE;assert(['comprehensive-long','comprehensive-controls','comprehensive-queued-steer'].includes(testCase));
const controlPath=process.env.GPT_LIVE_H5_CONTROL_PATH??'combined';
assert(['combined','confirm-cancel'].includes(controlPath),'Unknown independent control path');
assert(controlPath==='combined'||testCase==='comprehensive-controls'&&process.env.GPT_LIVE_H5_CONTROL_CONFIRMATION==='1'&&
  process.env.GPT_LIVE_H5_OS_OBSERVER_CONFIG,'Independent confirm-cancel requires actual core confirmation and frozen OS observation');
const base=process.env.GPT_LIVE_H5_EVIDENCE_DIR;assert(path.isAbsolute(base));fs.mkdirSync(base,{recursive:true,mode:0o700});
const memoryQuery=process.env.GPT_LIVE_H5_MEMORY_QUERY?.trim();assert(memoryQuery,'Explicit private memory query required');
const childWaitSeconds=Number(process.env.GPT_LIVE_H5_CHILD_WAIT_SECONDS??45);
assert(Number.isSafeInteger(childWaitSeconds)&&childWaitSeconds>=45&&childWaitSeconds<=180,'Explicit child wait must preserve the 45-second minimum');
const configPath=process.env.OPENCLAW_CONFIG_PATH,stateRoot=process.env.OPENCLAW_STATE_DIR,candidateData=process.env.VLAB_CANDIDATE_DATA;
const config=JSON.parse(fs.readFileSync(configPath));const configHash=hash(fs.readFileSync(configPath));
const runtime=process.env.GPT_LIVE_H5_RUNTIME_ROOT,clips=process.env.GPT_LIVE_H5_USER_CLIPS_DIR,url=process.env.GPT_LIVE_H5_URL;
assert(path.isAbsolute(clips)&&url?.startsWith('http://127.0.0.1:'),'Candidate clip/H5 handoff required');
const app=await fetch(new URL('app.js',url)).then(r=>r.arrayBuffer());assert.equal(hash(Buffer.from(app)),process.env.GPT_LIVE_H5_APP_SHA,'Actual served app hash');
const deadline=Date.now()+Number(process.env.GPT_LIVE_H5_NATIVE_CASE_SECONDS??600)*1000;
const token=String(config.gateway.auth.token).replace(/\$\{([^}]+)\}/gu,(_,key)=>{assert(process.env[key]);return process.env[key]});
const scratch=fs.mkdtempSync(path.join(stateRoot,'tmp',testCase+'-'));fs.chmodSync(scratch,0o700);
let pulse,chrome,chromeTemp,chromeStderr='',cdp,gateway,lastState,snapshotCache,lastHistory={},currentSession,summary,cleanup,controlConfirmation;
const checks=[],sessionKeys=[],toolEvents=[],subscribedSessions=new Set(),callOwners=new Map(),speechPlaybackWindows=[];
function hash(value){return createHash('sha256').update(value).digest('hex')}
function save(name,value){fs.writeFileSync(path.join(base,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});}
const messageText=m=>typeof m?.content==='string'?m.content:(m?.content??[]).filter?.(v=>v?.type==='text').map(v=>v.text??'').join('\n')??'';
const timestamp=value=>typeof value==='number'?value<1e11?value*1000:value:Date.parse(value);
function extractToolPairs(history) {
 const messages=history?.messages??[],rows=[];
 for(const message of messages)if(message.role==='assistant'&&Array.isArray(message.content))for(const item of message.content)if(item.type==='toolCall') {
   const results=messages.filter(m=>m.role==='toolResult'&&m.toolCallId===item.id);let args=item.arguments;
   try{if(typeof args==='string')args=JSON.parse(args)}catch{}
   rows.push({id:item.id,name:item.name,args,calledAt:timestamp(message.timestamp??message.at??message._transcriptCreatedAt),results:results.map(result=>({at:timestamp(result.timestamp??result.at??result._transcriptCreatedAt),isError:result.isError===true,text:messageText(result),details:result.details,rawResult:result,source:'session-history'}))});
 }
 return rows;
}
function childSessions(history) {
 const sessions=new Set();
 for(const pair of extractToolPairs(history))if(pair.name==='sessions_spawn')for(const result of pair.results) {
  try {const value=JSON.parse(result.text);for(const key of ['childSessionKey','sessionKey'])if(typeof value[key]==='string'&&value[key].startsWith('agent:'))sessions.add(value[key]);}catch{}
  for(const match of result.text.matchAll(/agent:[A-Za-z0-9_:-]+:subagent:[A-Za-z0-9_-]+/gu))sessions.add(match[0]);
 }
 return [...sessions];
}
class CdpClient {
 constructor(url){this.url=url;this.pending=new Map();this.nextId=1;}
 async connect(){this.socket=new WebSocket(this.url);await new Promise((resolve,reject)=>{this.socket.addEventListener('open',resolve,{once:true});this.socket.addEventListener('error',reject,{once:true});});this.socket.addEventListener('message',event=>{const r=JSON.parse(String(event.data)),p=this.pending.get(r.id);if(!p)return;this.pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(r.error.message)):p.resolve(r.result??{});});}
 request(method,params={}) {const id=this.nextId++;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP '+method+' timeout'))},20000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));});}
 close(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('CDP closed'));}this.pending.clear();this.socket?.close();}
}
async function evaluate(expression){const result=await cdp.request('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result?.value;}
async function clickOriginalButton(id) {
 const rect=await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});if(!e||e.disabled||e.hidden)throw Error('Original button unavailable');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}})()`);
 assert(rect.width>0&&rect.height>0,'Original visible button required');
 await cdp.request('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',clickCount:1});
 await cdp.request('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x,y:rect.y,button:'left',clickCount:1});
}
async function snapshot(full=false){const state=await readBoundedProbeSnapshot(evaluate,{previous:full?null:snapshotCache});
 if(state&&state.probeTimeOrigin===snapshotCache?.probeTimeOrigin)assert(state.duplexSnapshotGeneration>snapshotCache.duplexSnapshotGeneration,'Full snapshot cannot reuse an old browser header');
 snapshotCache=state;
 return lastState=full||!state?state:{...state,audioFrames:state.audioFrames.slice(-80),micFrames:state.micFrames.slice(-80),duplex:null};}
async function waitFor(predicate,label,max=120000) {
 const until=Math.min(deadline,Date.now()+max);
 while(Date.now()<until){const state=await snapshot();const result=await predicate(state);if(result)return result;await sleep(250);}
 throw Error(label+' deadline');
}
async function subscribeSession(key){if(subscribedSessions.has(key))return;const result=await gateway.request('sessions.messages.subscribe',{key,agentId:'makaron'},{timeoutMs:10000});assert.equal(result.subscribed,true,'Real session-message tool subscription');subscribedSessions.add(key);}
async function readHistory() {
 assert(currentSession,'Actual H5 session key unavailable');
 await subscribeSession(currentSession);
 const parent=await gateway.request('chat.history',{sessionKey:currentSession,limit:120},{timeoutMs:20000});
 const children={},childTerminals={},childTranscripts={};for(const key of childSessions(parent)){await subscribeSession(key);children[key]=await gateway.request('chat.history',{sessionKey:key,limit:100},{timeoutMs:20000});}
 for(const pair of extractToolPairs(parent))if(pair.name==='sessions_spawn')for(const result of pair.results)try {
   const value=JSON.parse(result.text);if(typeof value.runId==='string'&&typeof value.childSessionKey==='string'){
     const observed=await gateway.request('agent.wait',{runId:value.runId,timeoutMs:1},{timeoutMs:10000}).catch(error=>({observerError:error.message}));
     childTerminals[value.childSessionKey]={runId:value.runId,childSessionKey:value.childSessionKey,observedAt:Date.now(),response:observed};
     if(observed.terminalReceipt?.runId===value.runId&&observed.terminalReceipt?.sessionId) {
       try {childTranscripts[value.childSessionKey]=readPrivateChildTranscript({state:stateRoot,candidateData,sessionId:observed.terminalReceipt.sessionId,runId:value.runId,requestedSessionKey:value.childSessionKey});}
       catch(error){childTranscripts[value.childSessionKey]={observerError:error.message,runId:value.runId,sessionId:observed.terminalReceipt.sessionId};}
     }
   }
 }catch{}
 return lastHistory={sessionKey:currentSession,parent,children,childTerminals,childTranscripts};
}
function childEvidencePairs(history=lastHistory) {
 const out=[];
 for(const [key,terminal] of Object.entries(history.childTerminals??{})) {
  const native=indexNativeToolPairs(toolEvents,{runId:terminal.runId,sessionKey:key});
  const transcript=history.childTranscripts?.[key];
  const stored=extractToolPairs({messages:activeTranscriptMessages(transcript)}).map(row=>({...row,runId:terminal.runId,sessionKey:key,source:'private-sqlite-active-transcript'}));
  const ordinary=extractToolPairs(history.children?.[key]).map(row=>({...row,runId:terminal.runId,sessionKey:key,source:'chat.history'}));
  const full=new Map();for(const row of [...ordinary,...stored])if(row.results.length)full.set(row.id,row);
  out.push(...mergeExactToolBodies(native,[...full.values()]));
 }
 return out;
}
function parentEvidencePairs(history=lastHistory.parent) {
 return mergeSessionToolEvidence(toolEvents,extractToolPairs(history),currentSession);
}
function diagnostics(){return parsePublicProgressDiagnostics(fs.readFileSync(process.env.GPT_LIVE_H5_TRACE_PATH,'utf8'));}
function confirmationDiagnostics(){return parseVoiceConfirmationDiagnostics(fs.readFileSync(process.env.GPT_LIVE_H5_TRACE_PATH,'utf8'));}
function loadControlProcessSource() {
 const frozen=JSON.parse(fs.readFileSync(process.env.GPT_LIVE_H5_OS_OBSERVER_CONFIG,'utf8'));
 const directory=path.dirname(frozen.outputPath),beneath=(parent,child)=>child===parent||child.startsWith(parent+path.sep);
 assert(path.isAbsolute(frozen.outputPath)&&path.isAbsolute(frozen.bindingPath)&&beneath(directory,base)&&
  beneath(directory,frozen.bindingPath),'OS witness must belong to this exact Candidate evidence run');
 const bindingBytes=fs.readFileSync(frozen.bindingPath),binding=JSON.parse(bindingBytes);
 validateOwnedProcObserverBinding(binding,{candidateId:process.env.VLAB_CANDIDATE_ID,unit:process.env.VLAB_CANDIDATE_UNIT,
  sourceCommit:process.env.GPT_LIVE_H5_SOURCE_COMMIT,expectedOwner:frozen.expectedOwner});
 const launch=JSON.parse(fs.readFileSync(path.join(directory,'owned-proc-observer-launch.json'),'utf8'));
 const expected={candidateId:binding.candidateId,unit:binding.unit,owner:binding.owner,sourceCommit:binding.sourceCommit,
  planSha256:binding.planSha256,freezeSha256:binding.freezeSha256,ownerBindingSha256:hash(bindingBytes),
  gatewayPid:Number(process.env.GPT_LIVE_H5_GATEWAY_PID),gatewayStartTimeTicks:launch.actualStart?.gatewayStartTimeTicks,
  observerSourceSha256:frozen.scriptSha256,pollMs:frozen.pollMs,durationSeconds:frozen.durationSeconds,
  user:frozen.expectedUser,uid:process.getuid()};
 validateOwnedProcObserverStart(launch.actualStart,expected);
 for(const name of ['bindingPath','outputPath']) {
  const filename=frozen[name],stat=fs.statSync(filename);
  assert(fs.realpathSync(filename)===filename&&stat.isFile()&&stat.uid===process.getuid()&&(stat.mode&0o777)===0o600,
   'OS source must be a canonical private actual run file');
 }
 return {expected,outputPath:frozen.outputPath,launch};
}
function readControlProcessWitness(source) {
 return parseControlProcessWitness(fs.readFileSync(source.outputPath,'utf8'));
}
async function startCall() {
 const pcIndex=(await snapshot()).pcStates.length;
 await clickOriginalButton('start');
 await waitFor(s=>s.pcStates[pcIndex]==='connected','Actual native H5 connection',45000);
 await waitFor(s=>s.api.filter(x=>x.route==='/api/session'&&x.status===200).length>pcIndex,'Native session handoff',15000);
 const meta=JSON.parse(fs.readFileSync(process.env.GPT_LIVE_H5_SESSION_PATH));const created=(await snapshot()).api.filter(x=>x.route==='/api/session'&&x.status===200).at(-1);
 assert.equal(meta.voiceSessionId,created.voiceSessionId,'Exact H5 session ownership');assert.equal(created.model,'gpt-live-1-codex');
 currentSession=meta.sessionKey;callOwners.set(pcIndex,{voiceSessionId:meta.voiceSessionId,sessionKey:meta.sessionKey,createdAt:created.at,connectedAt:(await snapshot()).pcTransitions.find(t=>t.pcIndex===pcIndex&&t.state==='connected')?.at??null});sessionKeys.push(meta.sessionKey);await subscribeSession(currentSession);const started={candidateId:process.env.VLAB_CANDIDATE_ID,testCase,pcIndex,paidVoiceStarted:true,sessionKey:meta.sessionKey,voiceSessionId:meta.voiceSessionId,apiStatus:created.status,connectedAt:callOwners.get(pcIndex).connectedAt,observedAt:Date.now()};save('native-voice-started-'+pcIndex+'.json',started);console.log(JSON.stringify({nativeVoiceStarted:started}));return pcIndex;
}
function play(name){
 const file=path.join(clips,name+'.wav');assert(fs.existsSync(file));const input=pulse.play(file,name);
 save('actual-input-clip-schedule.json',pulse.plays);
 input.done.then(()=>save('actual-input-clip-schedule.json',pulse.plays),()=>save('actual-input-clip-schedule.json',pulse.plays));
 return input;
}
// Independent requests start only after the preceding feed has really ended
// and its native user turn is complete. The live capture track stays enabled.
// The acknowledgement and deliberate barge-in retain their overlap paths.
async function convergeInputTurn(input,pcIndex,label) {
 await input.done;
 const complete=await snapshot(true),speech=complete.micFrames.filter(f=>f.pcIndex===pcIndex&&
   f.at>=input.row.startedAt&&f.at<=input.row.completedAt&&f.rms>.02);
 const lastSpeechAt=speech.at(-1)?.at;assert(Number.isFinite(lastSpeechAt),'Original input microphone speech witness required');
 let observation;
 const result=await waitFor(s=>{
  const observedAt=s?.snapshotObservedAt,microphone=(s?.micFrames??[]).filter(f=>f.pcIndex===pcIndex),latestMicAt=microphone.at(-1)?.at;
  // The caller waits for the completed clip before its next independent USER
  // injection. This proves the frozen browser prefix at its own header time;
  // a slow transfer does not certify arbitrary later business input state.
  const currentObservation={observedAt:observedAt??null,source:'browser-wall-at-frozen-prefix-header',scope:'validation-clip-before-next-USER-injection',
   latestMicrophoneAt:latestMicAt??null,latestMicrophoneAgeMs:Number.isFinite(observedAt)&&Number.isFinite(latestMicAt)?observedAt-latestMicAt:null,
   collectorCompletedAt:s?.snapshotCompletedAt??null,collectorCompletedClock:s?.snapshotCompletedClock??null,
   collectionLatencyMs:s?.snapshotCollectionLatencyMs??null,snapshotGeneration:s?.duplexSnapshotGeneration??null};
  if(!Number.isFinite(observedAt)||!Number.isFinite(currentObservation.latestMicrophoneAgeMs)||currentObservation.latestMicrophoneAgeMs<0)return null;
  const proof=assessIndependentInputConvergence({events:s.events,micFrames:microphone,pcIndex,input:input.row,lastSpeechAt,observedAt});
  if(proof)observation=currentObservation;return proof;
 },label+' native user completion and continuous microphone quiet',15000);
 check('independent-input-convergence-'+input.row.label,true,{proof:result,input:input.row,lastSpeechAt,observation});return result;
}
const audible=(s,from,to=Infinity,pcIndex=0)=>s.audioFrames.filter(f=>f.pcIndex===pcIndex&&f.at>=from&&f.at<=to&&f.digitalAudible);
function check(name,passed,details={}){checks.push({name,passed:Boolean(passed),...details});}
function checkCompleteSpeechPlayback(name,state,window,details={}) {
 const playback=window&&assessCompletePlaybackWindow(state.audioFrames,window);
 const requiresNativeSpeech=Object.hasOwn(details,'nativeSpeechWindow'),nativeSpeechPlayback=details.nativeSpeechWindow&&
   assessCompletePlaybackWindow(state.audioFrames,details.nativeSpeechWindow);
 check(name,playback?.passed===true&&(!requiresNativeSpeech||nativeSpeechPlayback?.passed===true),
   {...details,window:window??null,playback,nativeSpeechPlayback:requiresNativeSpeech?nativeSpeechPlayback??null:undefined});
 if(window)speechPlaybackWindows.push({name,window});
 if(details.nativeSpeechWindow)speechPlaybackWindows.push({name:name+'-terminal-speech',gateName:name,window:details.nativeSpeechWindow});
 return playback;
}
async function waitForPlaybackDrain(pcIndex,after,label) {
 const proof=await waitFor(s=>{const owner=callOwners.get(pcIndex),closed=s.api.find(a=>a.route==='/api/close'&&a.status===200&&a.request?.voiceSessionId===owner?.voiceSessionId);
  const frames=closed?s.audioFrames.filter(f=>f.at<closed.at):s.audioFrames;return continuousPlaybackQuiet(frames,{pcIndex,after,durationMs:750});},label,15000);
 check('actual-playback-drain-'+pcIndex,proof.rtp.length>0,{proof,after});return proof;
}
async function stopCall(pcIndex) {
 const owner=callOwners.get(pcIndex);assert(owner,'Actual H5 owner required');
 const closedProof=s=>s.pcStates[pcIndex]==='closed'&&!s.remoteAudio.attached&&s.api.some(a=>a.route==='/api/close'&&a.status===200&&a.at>=owner.createdAt&&a.request?.voiceSessionId===owner.voiceSessionId);
 const before=await snapshot();const alreadyClosed=closedProof(before);
 if(!alreadyClosed)await clickOriginalButton('stop');
 await waitFor(closedProof,'Original H5 exact-owner end-call cleanup',15000);
 const states=await evaluate(`(()=>{const p=globalThis.__candidateLiveProbe;return {captureEnded:p.streams[${pcIndex}]?.getTracks().every(t=>t.readyState==='ended'),pcClosed:p.pcs[${pcIndex}]?.connectionState==='closed'}})()`);
 check('end-call-'+pcIndex,states.captureEnded&&states.pcClosed,{states,owner,alreadyClosed});
}
async function longTask() {
 const pcIndex=await startCall(),input=play('long-task');await input.done;
 const initialAt=input.row.startedAt;
 let finished=false;
 for(const until=Math.min(deadline,Date.now()+420000);Date.now()<until;) {
  await sleep(2000);const s=await snapshot();await readHistory();
  const d=diagnostics().filter(row=>row.at>=initialAt);
  const final=d.filter(row=>row.stage==='context-append-sent'&&row.kind==='final'&&row.role==='final_complete').at(-1);
  const childPairs=childEvidencePairs();
  const slowDate=extractExecDateFromPairs(childPairs,childWaitSeconds);
  const finalTurn=final&&s.events.filter(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='assistant'&&e.at>final.at).at(-1);
  if(finalTurn&&continuousPlaybackQuiet(s.audioFrames,{pcIndex,after:finalTurn.at,durationMs:750})){finished=true;break;}
 }
 const s=await snapshot(true),pairs=parentEvidencePairs(),childPairs=childEvidencePairs(),d=diagnostics().filter(row=>row.at>=initialAt);
 const userTurns=s.events.filter(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='user'&&e.at>=initialAt);
 const memory=pairs.find(p=>p.name==='memory_search'&&JSON.stringify(p.args).includes(memoryQuery)&&p.results.some(r=>!r.isError&&r.text.length>40));
 const web=pairs.find(p=>p.name==='web_search'&&/openai|realtime/iu.test(JSON.stringify(p.args))&&p.results.some(r=>!r.isError&&/https:\/\/[^\s"<>]*openai\.com/iu.test(r.text)));
 const primary=pairs.find(p=>p.name==='web_fetch'&&/https:\/\/(?:developers|platform|help|www)\.openai\.com\//iu.test(JSON.stringify(p.args))&&p.results.some(r=>!r.isError&&r.text.length>500));
 const spawnPair=pairs.find(p=>p.name==='sessions_spawn'&&p.results.some(toolResultSucceeded)),yieldPair=pairs.find(p=>p.name==='sessions_yield'&&p.results.some(toolResultSucceeded));
 const acceptedSpawn=spawnPair?.results.filter(toolResultSucceeded).map(r=>{try{return JSON.parse(r.text)}catch{return null}}).find(v=>v?.status==='accepted'&&typeof v?.runId==='string'&&typeof v?.childSessionKey==='string');
 const chosenChildPairs=childPairs.filter(p=>p.runId===acceptedSpawn?.runId&&p.sessionKey===acceptedSpawn?.childSessionKey);
 const cwd=chosenChildPairs.find(p=>p.name==='exec'&&/\bpwd\b|process\.cwd/iu.test(JSON.stringify(p.args))&&p.results.some(r=>!r.isError&&r.text.includes(candidateData+'/workspace/')));
 const slowDate=extractExecDateFromPairs(chosenChildPairs,childWaitSeconds);
 const expected=slowDate?[slowDate.fields]:[];
 const owner=resolveNativeControlOwner({diagnostics:d,events:s.events,tools:s.tools,backendRunId:spawnPair?.runId,
   voiceSessionId:callOwners.get(pcIndex)?.voiceSessionId,pcIndex});
 const canonical=resolveCanonicalFinalTrace(d,owner);
 const final=canonical?.final;
 const nativeFinal=s.events.filter(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='assistant'&&e.at>=(final?.at??Infinity)).at(-1);
 const actual=parseCompleteTimestamps(nativeFinal?.text??'');
 const parentFinals=(lastHistory.parent.messages??[]).filter(m=>m.role==='assistant'&&messageText(m).trim()&&(m.stopReason==='stop'||m.stopReason==='end_turn'));
 const childMarkerPair=chosenChildPairs.find(p=>p.name==='exec'&&/randomInt|urandom|shuf|secrets|random/iu.test(JSON.stringify(p.args))&&p.results.some(r=>!r.isError&&/\b[1-9]\d{3}\b/u.test(r.text)));
 const marker=childMarkerPair?.results.map(r=>r.text).join('\n').match(/\b([1-9]\d{3})\b/u)?.[1];
 const publicTexts=[lastHistory.parent,...Object.values(lastHistory.children),...Object.values(lastHistory.childTranscripts??{}).map(t=>({messages:activeTranscriptMessages(t)}))].flatMap(history=>(history.messages??[]).filter(m=>m.role==='assistant').map(messageText));
 for(const terminal of Object.values(lastHistory.childTerminals??{}))if(terminal.response?.terminalReply?.disposition==='visible')publicTexts.push(terminal.response.terminalReply.text);
 const markerResultEvent=toolEvents.find(event=>event.payload?.runId===acceptedSpawn?.runId&&event.payload?.sessionKey===acceptedSpawn?.childSessionKey&&event.payload?.stream==='tool'&&['end','result'].includes(event.payload.data?.phase)&&
   (event.payload.data?.toolCallId??event.payload.data?.callId)===childMarkerPair?.id);
 const early=assessH5ProgressProvenance({diagnostics:d,events:s.events.filter(e=>e.pcIndex===pcIndex),
   energyWindows:s.audioFrames.filter(f=>f.pcIndex===pcIndex&&f.digitalAudible).map(f=>({at:f.at,rms:f.rms*32768})),
   backendPublicTexts:publicTexts,marker,initialUserText:userTurns[0]?.text??'',markerToolResultReceivedAt:markerResultEvent?.payload?.ts??null});
 check('single-complete-audio-input',userTurns.length===1&&(userTurns[0]?.text??'').includes(memoryQuery)&&/网络|搜索|OpenAI|Realtime/iu.test(userTurns[0]?.text??''),{userTurnCount:userTurns.length,turnIds:userTurns.map(t=>t.turnId)});
 check('memory-real-call-result',Boolean(memory),{callId:memory?.id,resultAt:memory?.results[0]?.at});
 check('web-primary-page-actually-fetched',Boolean(primary),{callId:primary?.id,url:primary?.args?.url??null,resultAt:primary?.results[0]?.at,independentOfficialConclusionReviewRequired:true});
 check('web-real-official-call-result',Boolean(web),{callId:web?.id,resultAt:web?.results[0]?.at});
 const memoryResult=memory?.results.find(toolResultSucceeded);
 const memoryBeforeWeb=memory?.sourceExecutionTimingVerified===true&&web?.sourceExecutionTimingVerified===true&&
   [memoryResult?.at,web?.calledAt].every(Number.isFinite)&&web.calledAt>=memoryResult.at;
 check('memory-source-result-before-web-start',memoryBeforeWeb,{memorySourceAt:memoryResult?.at,webSourceAt:web?.calledAt,
   memoryObservedAt:memoryResult?.observedAt,memoryPersistedAt:memoryResult?.persistedAt});
 check('memory-then-web-without-user-followup',memoryBeforeWeb&&userTurns.length===1,{memoryAt:memoryResult?.at,webAt:web?.calledAt,userTurnCount:userTurns.length});
 const realTerminals=Object.values(lastHistory.childTerminals??{}).filter(row=>row.runId===acceptedSpawn?.runId&&row.childSessionKey===acceptedSpawn?.childSessionKey&&row.response?.runId===acceptedSpawn?.runId&&row.response?.terminalReceipt?.runId===acceptedSpawn?.runId&&['ok','completed','complete','done'].includes(row.response?.status)&&
   Number.isFinite(row.response?.endedAt));
 const childFinalAt=Math.max(0,...realTerminals.map(row=>row.response.endedAt));
 const resumedFinal=canonical&&canonical.sourceRunIdSha256!==owner.sourceRunIdSha256&&
   canonical.started.at>=childFinalAt&&childFinalAt>=(yieldPair?.calledAt??Infinity)&&parentFinals.find(m=>
     hash(messageText(m).trim())===canonical.received.textSha256&&marker&&matchesExactControlMarker(messageText(m),marker)&&
     expected.length===1&&parseCompleteTimestamps(messageText(m)).some(value=>JSON.stringify(value)===JSON.stringify(expected[0])));
 check('actual-parent-spawn-yield-child-resume',spawnPair&&yieldPair&&realTerminals.length&&resumedFinal,
   {spawnCallId:spawnPair?.id,yieldCallId:yieldPair?.id,childSessions:Object.keys(lastHistory.children),childTerminals:lastHistory.childTerminals,
    childFinalAt,parentFinalAt:resumedFinal?canonical.received.at:null,canonicalFinal:canonical,
    source:'actual canonical terminal callback and complete body hash; history generation stamps are not execution clocks'});
 const cwdResultAt=cwd?.results.find(r=>!r.isError&&r.text.includes(candidateData+'/workspace/'))?.at;
 const markerResultAt=childMarkerPair?.results.find(r=>!r.isError&&/\b[1-9]\d{3}\b/u.test(r.text))?.at;
 const childDatePair=chosenChildPairs.find(p=>p.id===slowDate?.execCallId),childWaitPair=chosenChildPairs.find(p=>p.id===slowDate?.waitExecCallId);
 check('single-child-private-random-wait-date-in-requested-order',acceptedSpawn&&cwd?.sourceExecutionTimingVerified===true&&childMarkerPair?.sourceExecutionTimingVerified===true&&childDatePair?.sourceExecutionTimingVerified===true&&childWaitPair?.sourceExecutionTimingVerified===true&&[cwdResultAt,childMarkerPair?.calledAt,markerResultAt,slowDate?.waitCalledAt,slowDate?.waitResultAt,childDatePair?.calledAt,slowDate?.resultAt].every(Number.isFinite)&&cwdResultAt<=childMarkerPair.calledAt&&markerResultAt<=slowDate.waitCalledAt&&(slowDate.combinedCommand||slowDate.waitResultAt<=childDatePair.calledAt)&&realTerminals.some(t=>t.response.endedAt>=slowDate.resultAt),{acceptedSpawn,cwdCallId:cwd?.id,cwdResultAt,markerCallId:childMarkerPair?.id,markerResultAt,waitCallId:slowDate?.waitExecCallId,waitCalledAt:slowDate?.waitCalledAt,waitResultAt:slowDate?.waitResultAt,waitDurationMs:slowDate?.waitDurationMs,dateCallId:slowDate?.execCallId,dateCalledAt:childDatePair?.calledAt,dateResultAt:slowDate?.resultAt});
 check('actual-child-private-workspace',Boolean(cwd),{callId:cwd?.id});
 check('child-wait'+childWaitSeconds+'-then-exact-date',Boolean(slowDate)&&expected.length===1,{requiredWaitSeconds:childWaitSeconds,callId:slowDate?.execCallId,resultCallId:slowDate?.resultCallId,expected});
 const markerTurn=s.events.find(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='assistant'&&e.at===early.assistantTurnAt);
 const markerCaptionWindow=markerTurn&&resolveNativeTurnTranscriptWindow(s.events,{pcIndex,turnId:markerTurn.turnId,after:early.nativeAppendSentAt??initialAt});
 const markerWindow=markerCaptionWindow&&resolveEarlyPlaybackTail(s.audioFrames,s.events,
   {window:markerCaptionWindow,waitResultAt:slowDate?.waitResultAt,finalAppendAt:early.finalAppendSentAt});
 const markerPlayback=markerWindow&&assessCompletePlaybackWindow(s.audioFrames,markerWindow);
 const markerBeforeWaitEnd=assessEarlySpeechBoundary({window:markerWindow,markerResultAt:markerResultEvent?.payload?.ts,
   captionAt:early.progressTranscriptAt,waitResultAt:slowDate?.waitResultAt,finalAppendAt:early.finalAppendSentAt});
 check('early-speakable-fact-and-digital-audio-before-final',early.status==='observed'&&early.actualExecTimingVerified===true&&
   markerBeforeWaitEnd&&markerPlayback?.passed===true,
   {early,markerResultSourceAt:markerResultEvent?.payload?.ts??null,markerResultObservedAt:markerResultEvent?.at??null,
    markerSpeechWindow:markerWindow,markerTurnId:markerTurn?.turnId,markerCaptionWindow,markerPlayback,
    metadataTerminalAloneIsNotAudioEnd:true,
    actualMarkerAudibleFrames:markerPlayback?.audibleFrames??0,designatedChildWaitResultAt:slowDate?.waitResultAt??null,wholeSpeechBeforeWaitComplete:Boolean(markerBeforeWaitEnd)});
 check('long-task-completes-autonomously',finished&&nativeFinal&&userTurns.length===1&&memory&&web&&primary&&slowDate&&resumedFinal,{nativeFinalTurnId:nativeFinal?.turnId});
 check('final-designated-date-faithful',expected.length===1&&actual.length>0&&actual.every(value=>JSON.stringify(value)===JSON.stringify(expected[0])),{expected,actual});
 const explicitOffsets=explicitSpokenOffsets(nativeFinal?.text??'');
 check('final-designated-timezone-faithful',slowDate&&explicitOffsets.length>0&&explicitOffsets.every(offset=>offset===slowDate.offsetMinutes),{expectedOffsetMinutes:slowDate?.offsetMinutes??null,spokenExplicitOffsets:explicitOffsets});
 check('final-same-child-random-marker',marker&&matchesExactControlMarker(nativeFinal?.text??'',marker),{marker,execCallId:childMarkerPair?.id});
 const completeParts=final?d.filter(row=>row.stage==='context-append-sent'&&row.kind==='final'&&row.traceId===final.traceId&&row.delegationId===final.delegationId&&row.generation===final.generation&&row.appendId===final.appendId):[];
 check('complete-final-all-chunks-same-owner',final&&completeParts.length===final.chunkCount&&new Set(completeParts.map(row=>row.chunkIndex)).size===final.chunkCount&&completeParts.at(-1).role==='final_complete',{parts:completeParts.map(row=>({chunkIndex:row.chunkIndex,chunkCount:row.chunkCount,role:row.role})),owner:final?{traceId:final.traceId,delegationId:final.delegationId,generation:final.generation}:null});
 const memoryBody=memory?.results.map(r=>r.text).join('\n')??'';
 const relationshipTerms=[...memoryBody.matchAll(/高中同学|同学|朋友|同事|合伙人|创始人|投资人|董事长|董事|负责人|老板|上级|下属|合作伙伴|联合创始人|总经理|CEO|CTO|CFO|Versa|Makaron|美妆相机|相机|公司/giu)].map(m=>m[0]);
 const groundedMemory=Boolean(memory)&&(nativeFinal?.text??'').includes(memoryQuery)&&relationshipTerms.some(term=>String(nativeFinal?.text??'').toLowerCase().includes(term.toLowerCase()));
 const finalWeb=/OpenAI|Realtime|实时/iu.test(nativeFinal?.text??'')&&/打断|中断|interrupt|cancel|语音活动|VAD/iu.test(nativeFinal?.text??'')&&/官方|文档|官网|openai\.com/iu.test(nativeFinal?.text??'');
 check('final-requested-memory-relation-delivered',groundedMemory,{relationshipTerms:[...new Set(relationshipTerms)],independentFactReviewRequired:true,sourceCallId:memory?.id,nativeFinalTurnId:nativeFinal?.turnId});
 check('final-requested-web-conclusion-delivered',Boolean(web)&&Boolean(primary)&&finalWeb,{sourceCallId:web?.id,nativeFinalTurnId:nativeFinal?.turnId,independentOfficialConclusionReviewRequired:true});
 check('final-memory-web-exact-source-review',false,{status:'requires-independent-content-review',sourceCallIds:[memory?.id,web?.id,primary?.id],nativeFinalTurnId:nativeFinal?.turnId,reason:'Lexical delivery gates do not establish exact relation and official conclusion truth; full real sources retained'});
 const finalDrain=nativeFinal?await waitForPlaybackDrain(pcIndex,nativeFinal.at,'Full final actual native playback drain'):null;
 checkCompleteSpeechPlayback('native-answer-digital-audible',await snapshot(true),nativeFinal&&canonical&&finalDrain?
   {pcIndex,from:canonical.received.at,to:finalDrain.to}:null,
   {turnId:nativeFinal?.turnId,canonicalFinalReceivedAt:canonical?.received.at??null,includesPlaybackTail:Boolean(finalDrain),
    nativeSpeechWindow:nativeFinal&&canonical&&resolveNativeTurnTranscriptWindow(s.events,{pcIndex,turnId:nativeFinal.turnId,after:canonical.received.at})});
 await stopCall(pcIndex);
}
async function controls() {
 const pcIndex=await startCall(),cancelInput=play('cancel-task');await cancelInput.done;
 let confirmationAttempted=false;
 const accepted=await waitFor(async state=>{
  await readHistory();const pairs=parentEvidencePairs(),pending=assessControlExecPending(lastHistory.parent,60,{requireDateInCommand:false});
  const candidate=pending.pending&&pairs.find(p=>p.id===pending.execCallId&&p.sourceExecutionTimingVerified===true);
  if(candidate) {
   if(!confirmationAttempted)return candidate;
   const userTurn=resolveConfirmationUserTurn(state.events,{pcIndex,input:controlConfirmation.input,challenge:controlConfirmation.challenge});
   const owner=resolveNativeControlOwner({diagnostics:diagnostics(),events:state.events,tools:state.tools,
    backendRunId:candidate.runId,voiceSessionId:callOwners.get(pcIndex)?.voiceSessionId,pcIndex});
   const confirmed=resolveConfirmedControlExec(pairs,{challenge:controlConfirmation.challenge,userTurn,owner,input:controlConfirmation.input});
   if(confirmed?.id!==candidate.id)return false;
   controlConfirmation.userTurn=userTurn;controlConfirmation.newOwner=owner;
   controlConfirmation.actualNewExec={callId:confirmed.id,runId:confirmed.runId,sessionKey:confirmed.sessionKey,
    calledAt:confirmed.calledAt,args:confirmed.args,argsObservationSha256:confirmationArgsFingerprint(confirmed.args),rawStart:confirmed.rawEnvelopes.find(e=>e.payload.data.phase==='start')};
   controlConfirmation.newNativeDelegation=state.events.find(e=>e.pcIndex===pcIndex&&e.type==='delegation.created'&&e.raw?.item?.id===owner.delegationId);
   controlConfirmation.newBackendStarted=diagnostics().find(d=>d.stage==='backend-run-started'&&d.sourceRunIdSha256===owner.sourceRunIdSha256&&
    d.traceId===owner.traceId&&d.delegationId===owner.delegationId&&d.generation===owner.generation);
   save('control-confirmation-evidence.json',controlConfirmation);return confirmed;
  }
  if(confirmationAttempted)return false;
  if(process.env.GPT_LIVE_H5_CONTROL_CONFIRMATION!=='1')return false;
  const challenge=resolveControlExecConfirmationChallenge(pairs,{sessionKey:currentSession,
   voiceSessionId:callOwners.get(pcIndex)?.voiceSessionId,pcIndex,diagnostics:diagnostics(),events:state.events,tools:state.tools,
   initialInput:cancelInput.row,alreadyAttempted:confirmationAttempted});
  if(!challenge)return false;
  // Mark the one allowed attempt before awaiting anything. A later challenge,
  // timeout or unrelated tool failure can never replay this USER utterance.
  confirmationAttempted=true;controlConfirmation={attempted:true,playbackLimit:1,challenge,
   originalRequestInput:cancelInput.row,syntheticUserPCM:true,syntheticGrant:false,confirmationIdSentByObserver:false};
  save('control-confirmation-evidence.json',controlConfirmation);
  const original=await convergeInputTurn(cancelInput,pcIndex,'Original request before explicit action confirmation');
  const originalState=await snapshot(true),originalTurn=originalState.events.find(e=>e.pcIndex===pcIndex&&
   e.type==='turn.done'&&e.role==='user'&&e.turnId===original.turnId);
  assert(originalTurn&&/(?:六十|60)/u.test(originalTurn.text)&&/等待|等|睡眠|sleep/iu.test(originalTurn.text)&&
   /时间|日期|date/iu.test(originalTurn.text),'The actual original USER must request this sleep60/time task');
  controlConfirmation.originalRequestConvergence=original;controlConfirmation.originalRequestUserTurn=originalTurn;
  assert(fs.readFileSync(path.join(clips,'confirmation.txt'),'utf8').trim()==='确认执行。','Frozen explicit USER confirmation fixture required');
  const input=play('confirmation');controlConfirmation.input=input.row;save('control-confirmation-evidence.json',controlConfirmation);
  await input.done;controlConfirmation.confirmationInputConvergence=await convergeInputTurn(input,pcIndex,'Explicit action confirmation USER');
  controlConfirmation.userTurn=resolveConfirmationUserTurn((await snapshot(true)).events,{pcIndex,input:input.row,challenge});
  save('control-confirmation-evidence.json',controlConfirmation);
  return false;
 },'Actual pending backend sleep60 in the requested wait-then-date task, with at most one exact challenged USER confirmation',90000);
 if(controlConfirmation?.attempted) {
  let transcript;
  if(lastHistory.parent?.sessionId)try{transcript=readPrivateChildTranscript({state:stateRoot,candidateData,
   sessionId:lastHistory.parent.sessionId,runId:accepted.runId,requestedSessionKey:currentSession})}catch(error){transcript={observerError:error.message}}
  save('control-confirmation-actual-user-transcript.json',transcript??{status:'missing-actual-parent-session'});
  controlConfirmation.durableUserMessage=findDurableConfirmationUserMessage(transcript,
   {sessionKey:currentSession,userTurn:controlConfirmation.userTurn,input:controlConfirmation.input});
  controlConfirmation.durableTranscriptReadback={source:transcript?.source,canonicalSessionKey:transcript?.canonicalSessionKey,
   sessionId:transcript?.sessionId,queryOnly:transcript?.queryOnly,observerError:transcript?.observerError??null,
   runIdLabelIsNotSourceProof:true};
  controlConfirmation.coreDiagnostics=confirmationDiagnostics();
  controlConfirmation.coreReceipt=assessControlConfirmationCoreReceipt(controlConfirmation.coreDiagnostics,
   {challenge:controlConfirmation.challenge,userTurn:controlConfirmation.userTurn,input:controlConfirmation.input,
    owner:controlConfirmation.newOwner,execPair:accepted,durableUserMessage:controlConfirmation.durableUserMessage});
  check('control-confirmation-exact-blocked-challenge',Boolean(controlConfirmation.challenge),{challenge:controlConfirmation.challenge});
  check('control-confirmation-one-complete-user-input',Boolean(controlConfirmation.userTurn)&&
   pulse.plays.filter(p=>p.label==='confirmation').length===1,{input:controlConfirmation.input,userTurn:controlConfirmation.userTurn,
    source:'original native finalized USER event after one synthetic USER PCM; no model-supplied approval'});
  check('control-confirmation-user-durable-sqlite-message',Boolean(controlConfirmation.durableUserMessage),
   {message:controlConfirmation.durableUserMessage??null,readback:controlConfirmation.durableTranscriptReadback,
    reason:controlConfirmation.durableUserMessage?null:'No exact finalized USER message is present in the same private canonical transcript'});
  check('control-confirmation-new-native-run-and-exact-params',Boolean(controlConfirmation.newOwner)&&
   Boolean(controlConfirmation.newNativeDelegation)&&Boolean(controlConfirmation.newBackendStarted)&&
   confirmationArgsFingerprint(accepted.args)===controlConfirmation.challenge.argsObservationSha256,
   {newOwner:controlConfirmation.newOwner,newNativeDelegation:controlConfirmation.newNativeDelegation,
    newBackendStarted:controlConfirmation.newBackendStarted,actualNewExec:controlConfirmation.actualNewExec,
    argsFingerprintScope:'sorted original actual tool args; an observation fingerprint, not a grant'});
  check('control-confirmation-core-eligible-bind-consume',controlConfirmation.coreReceipt.identityValid,
   {coreReceipt:controlConfirmation.coreReceipt,source:'actual private Gateway core trace; no observer grant or provider-supplied confirmation id'});
  check('control-confirmation-core-durable-user-hash',controlConfirmation.coreReceipt.rawUserTextHashVerified,
   {coreReceipt:controlConfirmation.coreReceipt,rawUser:controlConfirmation.durableUserMessage??null,
    reason:controlConfirmation.coreReceipt.reason});
  save('control-confirmation-evidence.json',controlConfirmation);
 }else check('control-confirmation-not-injected-without-challenge',pulse.plays.every(p=>p.label!=='confirmation'),
  {status:'not-triggered',approvalPathAccepted:false});
 const execStartEvent=toolEvents.find(event=>['agent','session.tool'].includes(event.event)&&event.payload?.stream==='tool'&&
   event.payload?.runId===accepted.runId&&event.payload?.sessionKey===currentSession&&event.payload.data?.phase==='start'&&
   (event.payload.data?.toolCallId??event.payload.data?.callId)===accepted.id);
 const actualExecStartedAt=execStartEvent?.payload?.ts??null,backendRunId=execStartEvent?.payload?.runId??null;
 check('control-original-exec-start-witness',Boolean(execStartEvent)&&Number.isFinite(actualExecStartedAt),{callId:accepted.id,actualExecStartedAt,backendRunId,execSourceTs:execStartEvent?.payload?.ts??null,execObservedAt:execStartEvent?.at??null,sourceObserverDeltaMs:execStartEvent?execStartEvent.at-execStartEvent.payload.ts:null});
 const beforeControl=await snapshot();
 const originalOwner=resolveNativeControlOwner({diagnostics:diagnostics(),events:beforeControl.events,tools:beforeControl.tools,
   backendRunId,voiceSessionId:callOwners.get(pcIndex)?.voiceSessionId,pcIndex});
 if(controlPath==='confirm-cancel')return confirmCancelOnly({pcIndex,accepted,actualExecStartedAt,backendRunId,originalOwner});
 let pendingAfterBarge;
 try {
 if(!controlConfirmation?.input)await convergeInputTurn(cancelInput,pcIndex,'Original background request before the separate count input');
 const count=play('count');await count.done;
 const activeTurn=s=>s.events.filter(e=>e.pcIndex===pcIndex&&e.type==='turn.created'&&e.role==='assistant'&&e.at>=count.row.startedAt&&!s.events.some(done=>done.pcIndex===pcIndex&&done.type==='turn.done'&&done.turnId===e.turnId)).at(-1);
 await waitFor(s=>activeTurn(s)&&audible(s,Date.now()-300,Infinity,pcIndex).length>=2,'Native count actively speaking',60000);
 const ack=play('ack');await ack.done;await sleep(500);
 const beforeAck=await snapshot(),ackMuted=beforeAck.audioFrames.filter(f=>f.pcIndex===pcIndex&&f.at>=ack.row.startedAt&&f.at<=ack.row.completedAt+500&&f.muted);
 check('short-ack-no-client-mute-latch',ackMuted.length===0,{mutedFrames:ackMuted.length});
 // A brief acknowledgement can itself end a provider turn. Acquire a fresh
 // actual count turn if necessary; never call a completed historical turn barge.
 let replay=null,preBarge=await snapshot(),oldTurn=activeTurn(preBarge);
 if(!oldTurn||audible(preBarge,Date.now()-250,Infinity,pcIndex).length<2){await convergeInputTurn(ack,pcIndex,'Acknowledgement before a fresh count request');replay=play('count');await replay.done;oldTurn=await waitFor(s=>activeTurn(s)&&audible(s,Date.now()-250,Infinity,pcIndex).length>=2?activeTurn(s):false,'Fresh count after acknowledgement',45000);}
 preBarge=await snapshot();await readHistory();
 const beforePending=assessControlExecPending(lastHistory.parent,60,{requireDateInCommand:false});
 check('backend-pending-at-barge',beforePending.pending&&beforePending.execCallId===accepted.id,{pending:beforePending,backendRunId});
 const barge=play('barge');await barge.done;
 const newTurn=await waitFor(s=>s.events.find(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='assistant'&&e.turnId!==oldTurn?.turnId&&e.at>=barge.row.startedAt&&isExactTwoPlusTwoReply(e.text)),'Actual new-topic 2+2 answer',45000);
 const state=await snapshot(true),microphone=state.micFrames.filter(f=>f.pcIndex===pcIndex&&f.at>=barge.row.startedAt&&f.at<=barge.row.completedAt+200&&f.rms>.02);
 const attack=microphone[0]?.at??null;
 const oldActiveAtAttack=oldTurn&&attack!==null&&oldTurn.at<=attack&&!state.events.some(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.turnId===oldTurn.turnId&&e.at<attack);
 const overlap=attack!==null?microphone.filter(m=>m.at<=attack+500&&audible(state,m.at-100,m.at+100,pcIndex).length>0):[];
 const terminal=resolveOwnedBargeTerminal(state.events,{pcIndex,oldTurn,input:barge.row,attack,
   micFrames:state.micFrames,audioFrames:state.audioFrames});
 const activeCountInput=replay?.row??count.row;
 const oldCaptionWindow=terminal&&resolveNativeTurnTranscriptWindow(state.events,{pcIndex,turnId:terminal.turnId,after:activeCountInput.startedAt});
 const prefix=oldCaptionWindow?.captions.filter(e=>e.at<attack).map(e=>e.text).join('')??'';
 const countUser=state.events.find(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='user'&&
   e.at>=activeCountInput.startedAt&&e.at<=barge.row.startedAt&&nativeCountRequestsEighty(e.text));
 const actualCountingPrefix=hasOrderedCountBeginning(prefix)||hasOrderedCountBeginning(oldTurn?.text)||
   Boolean(oldCaptionWindow&&hasOrderedCountBeginning(terminal?.text));
 check('barge-native-count80-request-and-actual-count-turn',Boolean(countUser)&&actualCountingPrefix,
   {countInput:activeCountInput,countUserTurnId:countUser?.turnId??null,countUserText:countUser?.text??null,
    oldTurnId:oldTurn?.turnId,prefix,createdText:oldTurn?.text??null,oldCaptionWindow,
    terminalText:terminal?.text??null,requiresSeparateActualAttackOverlap:true});
 const interruptedReason=terminal&&/interrupt|cancel|barge|truncat/iu.test(JSON.stringify(terminal.raw));
 const truncated=terminal&&countUser&&actualCountingPrefix&&!/(?:七十九[、，,\s]*八十|79[、，,\s]*80|八十|\b80\b)/u.test(terminal.text);
 check('barge-actual-old-turn-overlap',Boolean(oldActiveAtAttack)&&overlap.length>0,{oldTurnId:oldTurn?.turnId,attack,strictOverlapFrames:overlap.length,replayedAfterAck:Boolean(replay)});
 check('barge-old-native-turn-terminal',Boolean(terminal)&&Boolean(interruptedReason||truncated),{oldTurnId:oldTurn?.turnId,terminalAt:terminal?.at??null,rawTerminal:terminal?.raw??null,explicitReason:Boolean(interruptedReason),countPrefix:prefix,truncatedDuringInput:Boolean(truncated)});
 const newCreated=state.events.find(e=>e.pcIndex===pcIndex&&e.type==='turn.created'&&e.role==='assistant'&&e.turnId===newTurn.turnId);
 // A sentence pause after new-topic playback cannot prove old-output drain.
 const drain=terminal&&assessNativeResponseDrain(state.audioFrames,state.events,{pcIndex,terminalAt:terminal.at,newTurnId:newTurn.turnId});
 const newCaptionWindow=drain?.response??(terminal&&resolveNativeTurnTranscriptWindow(state.events,{pcIndex,turnId:newTurn.turnId,after:terminal.at}));
 const firstPossibleNewPlayback=drain?.firstPossibleNewPlayback??null,firstNewTranscript=drain?.firstNewTranscript??null,
   drainUpperBound=drain?.drainUpperBound??null,quiet=drain?.quiet??null;
 const quietStart=quiet?.from??null,drainAt=quiet?.to??null;
 const rtpAtDrain=quiet?.rtp??null;
 check('barge-old-terminal-then-continuous250ms-rtp-drain',Boolean(drain),{terminalAt:terminal?.at??null,quietStart,drainAt,providerQuietLatencyMs:attack!==null&&quietStart!==null?quietStart-attack:null,rtpAtDrain,firstPossibleNewPlayback,firstNewTranscript,drainUpperBound,newCaptionWindow,quietThresholdFloatRms:.003,digitalAudibleThresholdFloatRms:.005,requiresIndependentTurnAudioAttribution:true,rtpAttribution:drain?.rtpAttribution??'Native turn attribution unproved; raw receiver samples retained'});
 const localMuted=attack===null?null:state.audioFrames.find(f=>f.pcIndex===pcIndex&&f.at>=attack&&f.at<=attack+100&&f.muted);
 check('barge-local-attenuation-within100ms',Boolean(localMuted),{microphoneAttackAt:attack,localMuteAt:localMuted?.at??null,gate:'Separate required client attenuation; provider-native default does not implement HTML mute'});
 check('barge-original-track-stays-live',microphone.length>0&&microphone.every(f=>f.trackState==='live'&&f.trackEnabled&&f.senderTrackId===f.trackId));
 const correctNewText=isExactTwoPlusTwoReply(newTurn.text);
 const newPlayback=newCaptionWindow&&assessCompletePlaybackWindow(state.audioFrames,newCaptionWindow);
 check('barge-correct-new-topic-after-drain-digital-audio',newTurn.turnId!==oldTurn?.turnId&&drainAt!==null&&correctNewText&&
   newCaptionWindow?.from>=drainAt&&newPlayback?.passed===true,
   {oldTurnId:oldTurn?.turnId,newTurnId:newTurn.turnId,newCreatedAt:newCreated?.at,drainAt,text:newTurn.text,newCaptionWindow,newPlayback});
 if(newCaptionWindow)speechPlaybackWindows.push({name:'barge-correct-new-topic-after-drain-digital-audio',window:newCaptionWindow});
 await readHistory();pendingAfterBarge=assessControlExecPending(lastHistory.parent,60,{requireDateInCommand:false});
 check('same-backend-remains-pending-after-barge',pendingAfterBarge.pending&&pendingAfterBarge.execCallId===accepted.id,{pending:pendingAfterBarge});
 }catch(error){check('barge-scenario-exception',false,{message:error.message});await readHistory();pendingAfterBarge=assessControlExecPending(lastHistory.parent,60,{requireDateInCommand:false});}
 // Only after the pending-task interruption do we cancel that exact owner.
 const cancelAt=Date.now();await clickOriginalButton('cancel');
 await waitFor(s=>s.api.some(a=>a.route==='/api/steer'&&a.at>=cancelAt&&a.status===200&&a.request?.mode==='cancel'),'Original H5 backend cancel API',15000);
 check('cancel-exact-original-owner',Boolean(originalOwner)&&Boolean(backendRunId)&&pendingAfterBarge.pending,{callId:accepted.id,cancelAt,backendRunId,owner:originalOwner?{traceId:originalOwner.traceId,delegationId:originalOwner.delegationId,generation:originalOwner.generation}:null});
 // The deadline derives from actual exec-start, never from PCM completion.
 const observeUntil=actualExecStartedAt===null?Date.now():Math.max(Date.now()+5000,actualExecStartedAt+65000);
 while(Date.now()<observeUntil){await sleep(Math.min(1000,observeUntil-Date.now()));}
 const ownerMatches=d=>Boolean(originalOwner)&&d.traceId===originalOwner.traceId&&d.delegationId===originalOwner.delegationId&&d.generation===originalOwner.generation;
 const afterDiagnostics=diagnostics().filter(d=>d.at>=cancelAt),lateAppends=afterDiagnostics.filter(d=>d.stage==='context-append-sent'&&ownerMatches(d));
 const voiceSessionId=JSON.parse(fs.readFileSync(process.env.GPT_LIVE_H5_SESSION_PATH)).voiceSessionId;
 const nativeCancel=(await snapshot()).tools.find(e=>e.at>=cancelAt&&e.raw?.type==='tool.error'&&e.raw.callId===originalOwner?.bridgeCallId&&e.raw.voiceSessionId===voiceSessionId);
 const trustedCancel=afterDiagnostics.find(d=>ownerMatches(d)&&d.at>=cancelAt&&d.stage==='backend-cancel-accepted'&&d.sourceRunIdSha256===originalOwner.sourceRunIdSha256);
 const droppedLate=afterDiagnostics.filter(d=>ownerMatches(d)&&d.stage==='stale-public-progress-dropped'&&d.sourceRunIdSha256===originalOwner.sourceRunIdSha256);
 check('real-cancel-terminal-and-observation-window',Boolean(originalOwner)&&Boolean(nativeCancel)&&Boolean(trustedCancel)&&Number.isFinite(actualExecStartedAt)&&Date.now()>=actualExecStartedAt+65000&&lateAppends.length===0,{observeUntil,checkedAt:Date.now(),nativeCancel:nativeCancel??null,trustedCancel:trustedCancel??null,lateAppends});
 check('cancelled-real-late-callback-isolation',Boolean(originalOwner)&&droppedLate.length>0&&lateAppends.length===0,{lateCallbackWitness:droppedLate,status:droppedLate.length?'witnessed':'missing-real-late-callback',reason:'Quiet observation alone does not prove a late callback was rejected'});
 await stopCall(pcIndex);
 const reopened=await startCall(),greeting=play('new-greeting');await greeting.done;
 const greetingReply=await waitFor(s=>s.events.find(e=>e.pcIndex===reopened&&e.type==='turn.done'&&e.role==='assistant'&&e.at>=greeting.row.startedAt&&/(听|清楚|重连|连接)/u.test(e.text)),'Reconnect spoken greeting',45000);
 check('new-session-on-reconnect',sessionKeys.at(-1)!==sessionKeys.at(-2),{sessionCount:sessionKeys.length});
 const reconnectDrain=await waitForPlaybackDrain(reopened,greetingReply.at,'Reconnected reply actual playback drain'),reconnectState=await snapshot(true);
 const reconnectCaptionWindow=resolveNativeTurnTranscriptWindow(reconnectState.events,{pcIndex:reopened,turnId:greetingReply.turnId,after:greeting.row.startedAt});
 checkCompleteSpeechPlayback('reconnect-original-h5-unmuted-native-audio',reconnectState,reconnectCaptionWindow?
   {...reconnectCaptionWindow,to:reconnectDrain.to}:null,{turnId:greetingReply.turnId,reconnectCaptionWindow,includesPlaybackTail:true});
 await stopCall(reopened);
}
async function confirmCancelOnly({pcIndex,accepted,actualExecStartedAt,backendRunId,originalOwner}) {
 // This independent case never spends the sleep60 window on count/ack/barge.
 // Every original combined gate remains on the default path above.
 const confirmationGates=checks.filter(c=>c.name.startsWith('control-confirmation-'));
 const coreConfirmed=controlConfirmation?.attempted===true&&controlConfirmation.coreReceipt?.identityValid===true&&
  controlConfirmation.coreReceipt.rawUserTextHashVerified===true&&confirmationGates.length===6&&confirmationGates.every(c=>c.passed)&&
  ['backendRunId','traceId','delegationId','generation','sourceRunIdSha256','voiceSessionId','bridgeCallId'].every(key=>
   originalOwner?.[key]===controlConfirmation.newOwner?.[key]);
 check('confirm-cancel-requires-complete-real-core-approval',coreConfirmed,{confirmationGates:confirmationGates.map(c=>({name:c.name,passed:c.passed})),
  exactChallengeRequired:true,originalFixtureSelectorUnchanged:true});
 assert(coreConfirmed,'Independent confirm-cancel cannot start without the exact actual challenged USER and core eligible/bind/consume receipt');
 assert(Number.isFinite(actualExecStartedAt)&&backendRunId===accepted.runId,'Exact actual source exec start required');
 const source=loadControlProcessSource();
 let pending,lastProcessPending;
 try {await waitFor(async()=>{
  // Read core pending first; the OS read afterwards must be fresh at cancel.
  await readHistory();pending=assessControlExecPending(lastHistory.parent,60,{requireDateInCommand:false});
  lastProcessPending=assessControlProcessPending(readControlProcessWitness(source),{execPair:accepted,expected:source.expected,now:Date.now()});
  return pending.pending&&pending.execCallId===accepted.id&&lastProcessPending.passed?lastProcessPending:false;
 },'Confirmed exact real exec60 core and OS pending before immediate cancellation',10000);
 }catch(error){
  save('confirm-cancel-os-pending.json',{caseVariant:controlPath,pending:lastProcessPending,corePending:pending,
   passed:false,exception:error.message,rawOsSourcePath:source.outputPath,observerLaunch:source.launch});
  throw Error(error.message+'; '+(lastProcessPending?.reason??'OS pending source absent'));
 }
 const cancelAt=Date.now();
 check('confirm-cancel-real-pending-before-immediate-original-button',pending.pending&&pending.execCallId===accepted.id&&
  lastProcessPending.passed&&cancelAt-lastProcessPending.observedAt<=250&&cancelAt<actualExecStartedAt+55000,
  {pending,processPending:lastProcessPending,cancelAt,elapsedFromActualExecStartMs:cancelAt-actualExecStartedAt,
   syntheticIndependentCountAckBarge:false});
 const noOtherInput=pulse.plays.length===2&&pulse.plays[0].label==='cancel-task'&&pulse.plays[1].label==='confirmation';
 check('confirm-cancel-no-count-ack-barge-in-sleep-window',noOtherInput,{inputs:pulse.plays.map(p=>p.label)});
 save('confirm-cancel-os-pending.json',{caseVariant:controlPath,pending:lastProcessPending,corePending:pending,cancelAt,
  rawOsSourcePath:source.outputPath,observerLaunch:source.launch});
 assert(noOtherInput&&checks.at(-2).passed,'Immediate cancellation must still precede natural completion with actual fresh pending');
 await clickOriginalButton('cancel');
 let cancellation;
 try {await waitFor(state=>{
  cancellation=assessConfirmedControlCancel({api:state.api,tools:state.tools,diagnostics:diagnostics(),owner:originalOwner,
   sessionKey:currentSession,cancelAt});return cancellation.passed?cancellation:false;
 },'Exact original cancel response, source run receipt, and native bridge terminal',15000);
 }catch(error){
  save('confirm-cancel-os-exit.json',{caseVariant:controlPath,cancelAt,cancellation,passed:false,
   exception:error.message,rawOsSourcePath:source.outputPath});throw Error(error.message+'; '+(cancellation?.reason??'Cancel source absent'));
 }
 check('confirm-cancel-exact-core-and-native-cancel-accepted',cancellation.passed,{cancellation,cancelAt,execCallId:accepted.id,backendRunId});
 let processExit;
 try {
  await waitFor(()=>{
   processExit=assessControlProcessExit(readControlProcessWitness(source),{pending:lastProcessPending,cancelAt:cancellation.response.requestedAt,
    trustedCancelAt:cancellation.trustedCancel.at,now:Date.now()});return processExit.passed?processExit:false;
  },'Exact cancelled real shell and every observed descendant OS extinction before sleep60 deadline',15000);
 }catch(error){processExit={...processExit,passed:false,exception:error.message};}
 check('confirm-cancel-real-os-process-subtree-extinct',processExit?.passed===true,{processExit,
  rawOsSourcePath:source.outputPath,observerSignalsSent:false,coreAckIsNotProcessExit:true});
 save('confirm-cancel-os-exit.json',{caseVariant:controlPath,cancelAt,cancellation,processExit,rawOsSourcePath:source.outputPath});
 const observeUntil=Math.max(Date.now()+5000,actualExecStartedAt+65000);
 while(Date.now()<observeUntil)await sleep(Math.min(1000,observeUntil-Date.now()));
 const owned=row=>row.traceId===originalOwner.traceId&&row.delegationId===originalOwner.delegationId&&
  row.generation===originalOwner.generation;
 const after=diagnostics().filter(row=>row.at>=cancelAt),lateAppends=after.filter(row=>row.stage==='context-append-sent'&&owned(row)),
  droppedLate=after.filter(row=>row.stage==='stale-public-progress-dropped'&&owned(row)&&row.sourceRunIdSha256===originalOwner.sourceRunIdSha256);
 check('real-cancel-terminal-and-observation-window',cancellation.passed&&Date.now()>=actualExecStartedAt+65000&&lateAppends.length===0,
  {caseVariant:controlPath,observeUntil,checkedAt:Date.now(),nativeCancel:cancellation.nativeCancel,trustedCancel:cancellation.trustedCancel,lateAppends});
 // Even this independently cancelled case cannot claim late-callback rejection
 // from silence or an API ack. A missing actual callback remains unaccepted.
 check('cancelled-real-late-callback-isolation',droppedLate.length>0&&lateAppends.length===0,
  {caseVariant:controlPath,lateCallbackWitness:droppedLate,status:droppedLate.length?'witnessed':'missing-real-late-callback',
   reason:'Quiet observation alone does not prove a late callback was rejected'});
 await stopCall(pcIndex);
 const reopened=await startCall(),greeting=play('new-greeting');await greeting.done;
 const greetingReply=await waitFor(state=>state.events.find(e=>e.pcIndex===reopened&&e.type==='turn.done'&&e.role==='assistant'&&
  e.at>=greeting.row.startedAt&&/(听|清楚|重连|连接)/u.test(e.text)),'Reconnect spoken greeting after independent cancellation',45000);
 check('new-session-on-reconnect',sessionKeys.at(-1)!==sessionKeys.at(-2),{caseVariant:controlPath,sessionCount:sessionKeys.length});
 const drain=await waitForPlaybackDrain(reopened,greetingReply.at,'Reconnected reply actual playback drain'),state=await snapshot(true),
  caption=resolveNativeTurnTranscriptWindow(state.events,{pcIndex:reopened,turnId:greetingReply.turnId,after:greeting.row.startedAt});
 checkCompleteSpeechPlayback('reconnect-original-h5-unmuted-native-audio',state,caption?{...caption,to:drain.to}:null,
  {turnId:greetingReply.turnId,reconnectCaptionWindow:caption,includesPlaybackTail:true,caseVariant:controlPath});
 await stopCall(reopened);
}
async function queuedSteer() {
 const marker=process.env.GPT_LIVE_H5_STEER_MARKER?.trim();assert(marker&&marker.length<=40,'Explicit supplemental output condition required');
 const condition=`最终只说一句话，包含子代理查到的完整日期时间和时区，并在末尾加上：${marker}。`;
 const pcIndex=await startCall(),input=play('queued-task');await input.done;
 let binding;
 await waitFor(async s=>{
  await readHistory();
  const exact=parentEvidencePairs();
  for(const spawn of exact.filter(p=>p.name==='sessions_spawn'))for(const result of spawn.results.filter(toolResultSucceeded)) {
   let accepted;try{accepted=JSON.parse(result.text)}catch{continue}
   if(accepted?.status!=='accepted'||!accepted.runId||!accepted.childSessionKey)continue;
   const yielded=exact.find(p=>p.runId===spawn.runId&&p.name==='sessions_yield'&&p.results.some(r=>toolResultSucceeded(r)&&JSON.parse(r.text)?.status==='yielded'));
   const child=indexNativeToolPairs(toolEvents,{runId:accepted.runId,sessionKey:accepted.childSessionKey});
   const pending=resolveOwnedChildExecPending(child,{runId:accepted.runId,sessionKey:accepted.childSessionKey,
     waitSeconds:childWaitSeconds,observedAt:Date.now(),agentWait:lastHistory.childTerminals?.[accepted.childSessionKey]});
   const wait=pending?.pair;
   const owner=resolveNativeControlOwner({diagnostics:diagnostics(),events:s.events,tools:s.tools,backendRunId:spawn.runId,voiceSessionId:callOwners.get(pcIndex).voiceSessionId,pcIndex});
   if(yielded&&wait&&owner) {
    binding={accepted,spawn,yielded,wait,owner,pendingStatus:pending.status,
      agentWaitWitness:pending.agentWait,observedPendingAt:pending.observedPendingAt};return true;
   }
  }
 },'Real yielded requester and same owned child still executing the slow step',90000);
 save('queued-steer-pending-binding.json',binding);
 check('queued-steer-real-child-pending-after-yield',Boolean(binding),{acceptedSpawn:binding.accepted,childWaitCallId:binding.wait.id,childWaitSourceAt:binding.wait.calledAt,pendingObservedAt:binding.observedPendingAt,owner:binding.owner});
 const submittedAt=Date.now();await clickOriginalButton('steerText');await cdp.request('Input.insertText',{text:condition});await clickOriginalButton('steer');
 const response=await waitFor(s=>s.api.find(a=>a.route==='/api/steer'&&a.requestedAt>=submittedAt&&a.request?.voiceSessionId===binding.owner.voiceSessionId&&a.request?.mode==='steer'&&a.request?.text===condition&&a.responseBody),'Original H5 supplemental input response body',15000);
 save('queued-steer-original-api-receipt.json',{submittedAt,condition,marker,response,owner:binding.owner});
 check('queued-steer-original-api-retained-not-applied',response.status===200&&response.responseBody.ok===true&&response.responseBody.queued===true&&response.responseBody.applied===false&&response.responseBody.target==='owned_continuation_checkpoint',{response,submittedAt,conditionSha256:hash(condition)});
 let finished=false;
 await waitFor(async s=>{
  await readHistory();const ds=diagnostics();
  const final=ds.filter(d=>d.stage==='context-append-sent'&&d.kind==='final'&&d.role==='final_complete'&&d.traceId===binding.owner.traceId&&d.delegationId===binding.owner.delegationId&&d.generation===binding.owner.generation).at(-1);
  const turn=final&&s.events.find(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='assistant'&&e.at>=final.at&&e.text.includes(marker));
  if(turn&&continuousPlaybackQuiet(s.audioFrames,{pcIndex,after:turn.at,durationMs:750})){finished=true;return true}
  return false;
 },'Same owner natural continuation delivers the newly submitted output condition',240000);
 const s=await snapshot(true),ds=diagnostics(),chosen=childEvidencePairs().filter(p=>p.runId===binding.accepted.runId&&p.sessionKey===binding.accepted.childSessionKey),date=extractExecDateFromPairs(chosen,childWaitSeconds);
 const terminal=lastHistory.childTerminals?.[binding.accepted.childSessionKey];
 const terminalOk=terminal?.response?.runId===binding.accepted.runId&&terminal?.response?.terminalReceipt?.runId===binding.accepted.runId&&['ok','completed','complete','done'].includes(terminal.response.status)&&Number.isFinite(terminal.response.endedAt);
 const owned=d=>d.traceId===binding.owner.traceId&&d.delegationId===binding.owner.delegationId&&d.generation===binding.owner.generation;
 const consumed=ds.filter(d=>owned(d)&&d.stage==='backend-steering-consumed'&&d.at>=response.at).at(-1);
 const resumed=consumed&&terminalOk&&ds.find(d=>owned(d)&&d.stage==='backend-run-started'&&d.sourceRunIdSha256===consumed.sourceRunIdSha256&&d.sourceRunIdSha256!==binding.owner.sourceRunIdSha256&&d.at>=terminal.response.endedAt&&d.at<=consumed.at);
 const actualResumeRun=consumed&&toolEvents.map(e=>e.payload?.runId).find(id=>id&&hash(id)===consumed.sourceRunIdSha256);
 let privateParentTranscript;
 if(actualResumeRun&&lastHistory.parent?.sessionId)try{privateParentTranscript=readPrivateChildTranscript({state:stateRoot,candidateData,sessionId:lastHistory.parent.sessionId,runId:actualResumeRun,requestedSessionKey:currentSession})}catch(error){privateParentTranscript={observerError:error.message}}
 save('queued-steer-actual-parent-transcript.json',privateParentTranscript??{status:'missing-actual-resume-run-or-session'});
 const rawCandidates=[...(lastHistory.parent.messages??[]).map(message=>({source:'chat.history',message})),...(privateParentTranscript?.rawEvents??[]).map(row=>({source:'private-sqlite-raw-transcript',...row}))];
 const rawResumeCandidates=rawCandidates.flatMap(row=>{const message=row.message??row.event?.message;
  const parsed=message?.role==='user'&&extractQueuedConditionResume(messageText(message),consumed?.steeringConsumed,terminal?.response?.terminalReply?.text);
  const rawAt=timestamp(message?.timestamp??row.createdAt);
  if(!parsed||!parsed.inputs.some(input=>input.mode==='steer'&&input.text===condition)||!Number.isFinite(rawAt)||rawAt<response.requestedAt)return [];
  const declaredRunIds=[message.runId,message.__openclaw?.runId,row.event?.runId,row.event?.data?.runId].filter(id=>typeof id==='string');
  return [{...row,parsedOriginalResume:parsed,declaredRunIds,actualSourceRunBound:declaredRunIds.includes(actualResumeRun)}];
 });
 const rawResume=rawResumeCandidates.find(row=>row.actualSourceRunBound);
 save('queued-steer-raw-resume-candidates.json',rawResumeCandidates);
 check('queued-steer-same-child-successful-wait-date-terminal',terminalOk&&date&&date.runId===binding.accepted.runId&&date.sessionKey===binding.accepted.childSessionKey&&terminal.response.endedAt>=date.resultAt,{terminal,date});
 check('queued-steer-trusted-condition-consumption',Boolean(resumed)&&Boolean(actualResumeRun)&&matchesConsumedConditionBatch(consumed,[condition],binding.owner,hash(actualResumeRun??'')),{consumed,resumed,actualResumeRun,status:consumed?'observed':'missing-real-consumption-callback'});
 check('queued-steer-actual-parent-resume-input',Boolean(rawResume)&&Boolean(consumed)&&Boolean(actualResumeRun),{rawResume:rawResume??null,actualResumeRun,unboundOriginalResumeCandidates:rawResumeCandidates.length,reason:rawResume?null:'No original requester input has the original child completion, exact condition JSON batch and an actual declared resume run identity; observer labels and metadata alone are not raw resume.message'});
 const canonical=resolveCanonicalFinalTrace(ds,binding.owner,consumed?.sourceRunIdSha256);
 const final=canonical?.final;
 check('queued-steer-trusted-canonical-final-source',Boolean(canonical)&&canonical.sourceRunIdSha256===consumed?.sourceRunIdSha256,
   {canonical,consumedSourceRunIdSha256:consumed?.sourceRunIdSha256??null});
 const nativeFinal=final&&s.events.find(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='assistant'&&e.at>=final.at&&e.text.includes(marker));
 const finalFields=parseCompleteTimestamps(nativeFinal?.text??''),offsets=explicitSpokenOffsets(nativeFinal?.text??'');
 const conditionDelivered=nativeFinal?.text.trim().replace(/[。.!！]$/u,'').endsWith(marker)&&nativeFinal.text.split(/[。!?！？]/u).filter(part=>part.trim()).length===1;
 check('queued-steer-same-owner-final-satisfies-condition',finished&&date&&nativeFinal&&finalFields.length===1&&JSON.stringify(finalFields[0])===JSON.stringify(date.fields)&&offsets.length>0&&offsets.every(x=>x===date.offsetMinutes)&&conditionDelivered,{nativeFinal,final,date});
 const finalDrain=nativeFinal?await waitForPlaybackDrain(pcIndex,nativeFinal.at,'Supplemental same-owner final actual playback drain'):null;
 checkCompleteSpeechPlayback('queued-steer-original-final-digital-audio',await snapshot(true),nativeFinal&&canonical&&finalDrain?
   {pcIndex,from:canonical.received.at,to:finalDrain.to}:null,{turnId:nativeFinal?.turnId,canonicalFinalReceivedAt:canonical?.received.at??null,includesPlaybackTail:Boolean(finalDrain),
    nativeSpeechWindow:nativeFinal&&canonical&&resolveNativeTurnTranscriptWindow(s.events,{pcIndex,turnId:nativeFinal.turnId,after:canonical.received.at})});
 await stopCall(pcIndex);
}
try {
 const {GatewayClient}=await import(path.join(runtime,'dist/plugin-sdk/gateway-runtime.js'));
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Private Gateway observer hello deadline')),15000);gateway=new GatewayClient({url:'ws://127.0.0.1:'+config.gateway.port,token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.write'],caps:['tool-events'],onHelloOk:()=>{clearTimeout(timeout);resolve()},onConnectError:reject,onEvent:event=>{if(['agent','session.tool','talk.event','chat'].includes(event.event))toolEvents.push({at:Date.now(),event:event.event,payload:event.payload});}});gateway.start();});
 const subscribed=await gateway.request('sessions.subscribe',{}, {timeoutMs:10000});assert.equal(subscribed.subscribed,true,'Real global session-tool subscription');
 pulse=await createPrivatePulseMicrophone(path.join(scratch,'pulse'));
 chromeTemp=fs.mkdtempSync('/tmp/gpt-live-chrome-');fs.chmodSync(chromeTemp,0o700);
 const profile=path.join(scratch,'profile');chrome=spawn('/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-features=AudioServiceSandbox','--remote-debugging-port=0','--user-data-dir='+profile,'--use-fake-ui-for-media-stream','about:blank'],{env:{...pulse.environment,TMPDIR:chromeTemp,TMP:chromeTemp,TEMP:chromeTemp},stdio:['ignore','ignore','pipe']});
 chrome.stderr.on('data',chunk=>{chromeStderr+=String(chunk);fs.appendFileSync(path.join(base,'chrome-stderr.log'),chunk,{mode:0o600});});
 const debugFile=path.join(profile,'DevToolsActivePort');for(const until=Date.now()+15000;Date.now()<until&&!fs.existsSync(debugFile);)await sleep(100);assert(fs.existsSync(debugFile),'Task-owned Chrome debugger unavailable: '+chromeStderr.slice(-1000));
 const port=fs.readFileSync(debugFile,'utf8').split('\n')[0];const targets=await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json());cdp=new CdpClient(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await cdp.connect();await cdp.request('Page.enable');await cdp.request('Runtime.enable');await cdp.request('Page.addScriptToEvaluateOnNewDocument',{source:BROWSER_PROBE});await cdp.request('Page.navigate',{url});
 await waitFor(s=>s?.callState==='idle'&&s.badge==='可以拨号','Ready original H5 rendered',10000);
 if(testCase==='comprehensive-long')await longTask();else if(testCase==='comprehensive-controls')await controls();else await queuedSteer();
} catch(error) {check('test-exception',false,{message:String(error.message).replace(/(token|secret|api.?key|authorization)[=: ]+[^\s]+/giu,'$1=[redacted]')});}
finally {
 if(cdp){const preCloseFull=await snapshot(true).catch(()=>null);
  if(preCloseFull)save('browser-pre-close-native-evidence.json',preCloseFull);
   for(const [pcIndex] of callOwners)if(!checks.some(c=>c.name==='end-call-'+pcIndex&&c.passed))await stopCall(pcIndex).catch(error=>check('finally-end-call-'+pcIndex,false,{message:error.message}));
  const postCloseFull=await snapshot(true).catch(()=>null);
  check('complete-observation-through-original-close',Boolean(postCloseFull)&&[...callOwners.values()].every(owner=>
    postCloseFull.api.some(a=>a.route==='/api/close'&&a.status===200&&a.request?.voiceSessionId===owner.voiceSessionId)),
   {preCloseFullAvailable:Boolean(preCloseFull),postCloseFullAvailable:Boolean(postCloseFull),
    reason:postCloseFull?null:'Post-close full capture unavailable; a lightweight polling tail cannot replace original raw evidence'});
  lastState=postCloseFull??preCloseFull;
  if(testCase==='comprehensive-controls')save('control-confirmation-evidence.json',controlConfirmation??
   {attempted:false,status:'no exact native exec60 confirmation challenge selected',syntheticGrant:false});
  save('voice-confirmation-core-diagnostics.json',confirmationDiagnostics());
  save('browser-native-evidence.json',lastState);save('backend-history.json',lastHistory);save('backend-tool-events.json',toolEvents);save('native-public-diagnostics.json',diagnostics());
  // Screenshot rendering must not hold a live microphone/receiver open after
  // their original pre-close evidence has been frozen. h5.png is the actual
  // page after the original cleanup attempt, not a connected-layout artifact.
  const screenshot=await cdp.request('Page.captureScreenshot',{format:'png'}).catch(()=>null);if(screenshot)fs.writeFileSync(path.join(base,'h5.png'),Buffer.from(screenshot.data,'base64'),{mode:0o600});
  await evaluate(`globalThis.__candidateLiveProbe.dispose()`).catch(()=>{});
  const audio=await evaluate(`(async()=>{const p=globalThis.__candidateLiveProbe,rows=[];for(const recording of p.recordings){const blob=new Blob(recording.chunks,{type:'audio/webm;codecs=opus'}),bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let at=0;at<bytes.length;at+=16384)binary+=String.fromCharCode(...bytes.subarray(at,at+16384));rows.push({pcIndex:recording.pcIndex,startedAt:recording.startedAt,blobBytes:blob.size,base64:btoa(binary),error:recording.error??null});}return rows})()`).catch(()=>[]);
  const decoded=[];for(const recording of audio){const prefix='native-'+recording.pcIndex,webm=path.join(base,prefix+'.webm');fs.writeFileSync(webm,Buffer.from(recording.base64,'base64'),{mode:0o600});const ff=spawnSync('/usr/bin/ffmpeg',['-v','error','-i',webm,'-f','s16le','-ar','48000','-ac','1','pipe:1'],{maxBuffer:80*1024**2});let rms=0,peak=0;if(ff.status===0){let sum=0;for(let at=0;at+1<ff.stdout.length;at+=2){const n=ff.stdout.readInt16LE(at);sum+=n*n;peak=Math.max(peak,Math.abs(n));}rms=Math.sqrt(sum/(ff.stdout.length/2));fs.writeFileSync(path.join(base,prefix+'.pcm'),ff.stdout,{mode:0o600});}decoded.push({pcIndex:recording.pcIndex,startedAt:recording.startedAt,blobBytes:recording.blobBytes,decodeSuccess:ff.status===0,pcmBytes:ff.stdout?.length??0,pcmSha256:ff.status===0?hash(ff.stdout):null,durationSeconds:(ff.stdout?.length??0)/96000,rms,peak});}
  check('recorded-real-native-pcm',decoded.length>0&&decoded.every(row=>row.decodeSuccess&&row.rms>30),{decoded});
  const markerGate=checks.find(c=>c.name==='early-speakable-fact-and-digital-audio-before-final');
  if(markerGate?.markerSpeechWindow)speechPlaybackWindows.push({name:markerGate.name,window:markerGate.markerSpeechWindow});
  for(const {name,window,gateName} of speechPlaybackWindows) {
    const recording=decoded.find(row=>row.pcIndex===window.pcIndex&&row.decodeSuccess),pcmPath=path.join(base,'native-'+window.pcIndex+'.pcm');
    const pcm=recording&&fs.existsSync(pcmPath)?fs.readFileSync(pcmPath):null;
    const segment=pcm&&assessDecodedPlaybackWindow(pcm,{recordingStartedAt:recording.startedAt,...window});
    const playback=assessCompletePlaybackWindow(lastState?.audioFrames??[],window),gate=checks.find(c=>c.name===(gateName??name));
    const decodedAudible=segment?.passed===true&&playback?.passed===true;
    if(segment)fs.writeFileSync(path.join(base,name+'-whole-window.pcm'),pcm.subarray(segment.fromByte,segment.toByte),{mode:0o600});
    check(name+'-decoded-complete-window',decodedAudible,{window,segment,playback,originalGatePassed:gate?.passed??false});
    if(gate&&!decodedAudible)gate.passed=false;
  }
  const digitalFrames=lastState?.audioFrames??[];const oldGate=checks.find(c=>c.name==='barge-old-native-turn-terminal'),drainGate=checks.find(c=>c.name==='barge-old-terminal-then-continuous250ms-rtp-drain');
  const allowedOldMute=f=>f.muted===true&&f.paused===false&&Number.isFinite(f.volume)&&f.volume>0&&
    f.contextState==='running'&&f.receiverAttachedToPlayback===true&&f.trackState==='live'&&
    oldGate?.passed&&drainGate?.passed&&f.at>=checks.find(c=>c.name==='barge-actual-old-turn-overlap')?.attack&&f.at<=drainGate.drainAt;
  const connectedFrames=digitalFrames.filter(f=>{const owner=callOwners.get(f.pcIndex),close=lastState?.api?.find(a=>a.route==='/api/close'&&a.status===200&&a.request?.voiceSessionId===owner?.voiceSessionId);
    return owner&&f.at>=owner.connectedAt&&f.at<(close?.requestedAt??Infinity);});
  const blockedFrames=connectedFrames.filter(f=>f.rms>.005&&
    (f.muted!==false||f.paused!==false||!Number.isFinite(f.volume)||f.volume<=0||f.contextState!=='running'||
      !f.receiverAttachedToPlayback||f.trackState!=='live')&& !allowedOldMute(f));
  check('playback-not-persistently-muted',connectedFrames.some(f=>f.digitalAudible)&&blockedFrames.length===0&&Array.isArray(lastState?.playRejections)&&lastState.playRejections.length===0,
    {audibleFrames:connectedFrames.filter(f=>f.digitalAudible).length,unexpectedBlockedFrames:blockedFrames,playRejections:lastState?.playRejections,
     excludedIntervals:'pre-connection and at/after original close request; whole-final state gaps are checked independently'});
  const captureWindows=[...callOwners].map(([pcIndex,owner])=>{const close=lastState?.api?.find(a=>a.route==='/api/close'&&a.status===200&&a.request?.voiceSessionId===owner.voiceSessionId),initial=lastState?.micDiagnostics?.find(d=>d.pcIndex===pcIndex),from=owner.connectedAt,to=close?.requestedAt??Date.now();
    const frames=(lastState?.micFrames??[]).filter(f=>f.pcIndex===pcIndex&&f.at>=from&&f.at<to),gaps=frames.slice(1).filter((f,i)=>f.at-frames[i].at>100);
    const valid=Number.isFinite(from)&&frames.length>0&&frames[0].at-from<=100&&to-frames.at(-1).at<=100&&gaps.length===0&&frames.every(f=>f.trackState==='live'&&f.trackEnabled===true&&f.trackId===initial?.trackId&&f.senderTrackId===initial?.trackId);
    return {pcIndex,from,to,initialTrackId:initial?.trackId,frameCount:frames.length,gaps:gaps.map(f=>f.at),valid};});
  check('original-processed-microphone-sender-identity',captureWindows.length>0&&captureWindows.every(w=>w.valid),{captureWindows,diagnostics:lastState?.micDiagnostics,excludedIntervals:'pre-connection and at/after original close request'});
 }
 cdp?.close();gateway?.stop();if(chrome?.exitCode===null&&chrome.signalCode===null)chrome.kill('SIGTERM');if(chrome)await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),sleep(2000)]);if(chrome?.exitCode===null&&chrome.signalCode===null){chrome.kill('SIGKILL');await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),sleep(1000)]);}
 cleanup={...(await pulse?.dispose()),chromeExited:Boolean(chrome&&(chrome.exitCode!==null||chrome.signalCode!==null))};
 if(chromeTemp){fs.rmSync(chromeTemp,{recursive:true,force:true});cleanup.chromePrivateTempRemoved=!fs.existsSync(chromeTemp);}
 check('private-config-unchanged',hash(fs.readFileSync(configPath))===configHash);
 summary={case:testCase,caseVariant:testCase==='comprehensive-controls'?controlPath:null,candidateId:process.env.VLAB_CANDIDATE_ID,h5AppSha256:process.env.GPT_LIVE_H5_APP_SHA,model:'gpt-live-1-codex',childWaitSeconds,checks,passed:checks.length>0&&checks.every(c=>c.passed),sessionKeys,syntheticUserPCM:true,syntheticAssistantEvents:false,syntheticBackendResults:false,continuousOriginalCaptureTrack:checks.find(c=>c.name==='original-processed-microphone-sender-identity')?.passed===true,digitalPlaybackAcceptanceOnly:true,physicalEchoAccepted:false,humanListeningAccepted:false,cleanup,evidenceDir:base};save('receipt.json',summary);console.log(JSON.stringify({nativeComprehensive:{case:testCase,caseVariant:summary.caseVariant,candidateId:summary.candidateId,passed:summary.passed,checks:checks.map(c=>({name:c.name,passed:c.passed})),evidenceDir:base,physicalEchoAccepted:false}}));if(!summary.passed)process.exitCode=1;
}
