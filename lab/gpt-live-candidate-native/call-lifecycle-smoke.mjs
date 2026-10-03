// Dedicated real native call lifecycle workflow. Only synthetic USER PCM is
// fed to the original getUserMedia track; no assistant, tool or wire is forged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {createPrivatePulseMicrophone} from './private-pulse.mjs';
import {BROWSER_PROBE,SNAPSHOT_EXPRESSION} from './browser-probe.mjs';
import {assessDecodedPlaybackWindow,assessCompletePlaybackWindow,assessIndependentInputConvergence} from './evidence.mjs';
import {resolveEndCallToolWitness,resolveLifecycleUserTurn,assessLifecycleSpeech,hasLifecyclePlaybackTail,assessLifecycleFarewell,assessProactiveGreeting,assessAutomaticEnd,
  resolveLifecycleMemoryUser,resolveLifecycleMemoryWeb,resolveLifecycleConsultResult} from './call-lifecycle-evidence.mjs';
import {inspectLifecycleValidationTarget,readLifecycleVoiceOwner,preflightLifecycleMedia} from './call-lifecycle-target.mjs';

const validationTarget=process.env.GPT_LIVE_H5_VALIDATION_TARGET??'candidate';
assert(['candidate','shared','v'].includes(validationTarget)&&process.env.GPT_LIVE_H5_CASE==='call-lifecycle','Explicit lifecycle workflow target required');
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
const checks=[],owners=new Map(),speechWindows=[],gatewayEvents=[],subscribed=new Set(),coreCheckNames=new Set();
let pulse,chrome,chromeTemp,cdp,gateway,lastState,cleanup,browserTimeOrigin;
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
async function snapshot(full=false){const state=await evaluate(full?SNAPSHOT_EXPRESSION:SNAPSHOT_EXPRESSION.replace('audioFrames:p.audioFrames,micFrames:p.micFrames','audioFrames:p.audioFrames.slice(-80),micFrames:p.micFrames.slice(-80)').replace('duplex:globalThis.__gptLiveDuplexDiagnostics??null','duplex:null'));
 if(state)state.browserTimeOrigin=browserTimeOrigin;return lastState=state;}
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
async function waitSpeech(pcIndex,after,label,before=Infinity){
 // Polling uses tails, so an earlier speech onset is not discarded. Once a
 // candidate terminal/quiet exists, take full raw before evaluating its window.
 const proof=await waitFor(async s=>{
  if(!hasLifecyclePlaybackTail(s,{pcIndex,after,before}))return null;
  const full=await snapshot(true);return assessLifecycleSpeech(full,{pcIndex,after,before,requireCreatedAfter:true});
 },label,45000);
 return proof;
}
function recordSpeech(name,proof){check(name,proof?.playback?.passed===true&&proof?.strictTailPassed!==false,{proof,strictCompletePlayback:true});if(proof)speechWindows.push({name,window:proof.window});}
async function greeting(pcIndex){
 const owner=owners.get(pcIndex);const ready=await waitFor(s=>s.api.find(a=>a.route==='/api/ready'&&a.status===200&&a.at>=owner.createdAt),'Original ready host operation',15000);
 const proof=await waitSpeech(pcIndex,ready.requestedAt,'Proactive native greeting with complete audible playback');
 const state=await snapshot(true),g=assessProactiveGreeting(state,{pcIndex,owner,readyAt:ready.requestedAt});
 coreCheck('proactive-greeting-before-any-USER-'+pcIndex,g?.passed&&pulse.plays.length===(pcIndex===0?0:3),{ready,greeting:g,USERClipsFed:pulse.plays.length,greetingContentManualReviewRequired:true});
 recordSpeech('proactive-greeting-complete-digital-playback-'+pcIndex,proof);save('greeting-'+pcIndex+'-evidence.json',{owner,ready,greeting:g});return proof;
}
function ownedGatewayEvents() {
 const keys=new Set([...owners.values()].map(owner=>owner.sessionKey)),voices=new Set([...owners.values()].map(owner=>owner.voiceSessionId));
 return gatewayEvents.filter(e=>keys.has(e.payload?.sessionKey??e.payload?.session?.key)||voices.has(e.payload?.voiceSessionId));
}
async function inputConverged(pcIndex,input,label) {
 const proof=await waitFor(async()=>{const s=await snapshot(true),lastSpeechAt=s.micFrames.filter(f=>f.pcIndex===pcIndex&&f.at>=input.startedAt&&f.at<=input.completedAt&&f.rms>.02).at(-1)?.at;
   if(!Number.isFinite(lastSpeechAt))return null;
   return assessIndependentInputConvergence({events:s.events,micFrames:s.micFrames,pcIndex,input,lastSpeechAt,observedAt:Date.now()});
 },label,15000);check(label,true,{proof});return proof;
}
async function basicTools(pcIndex) {
 const owner=owners.get(pcIndex),input=play('memory-web');await input.done;assert.equal(input.row.exitCode,0);
 const user=await waitFor(s=>resolveLifecycleMemoryUser(s.events,{pcIndex,after:input.row.startedAt,memoryQuery}),'Complete ordered Memory/Web USER transcript',20000);
 let nextHistoryAt=0,lastHistory;
 const chain=await waitFor(async()=>{
  if(Date.now()<nextHistoryAt)return null;nextHistoryAt=Date.now()+2000;
  lastHistory=await gateway.request('chat.history',{sessionKey:owner.sessionKey,limit:120},{timeoutMs:20000});
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
 const speech=await waitSpeech(pcIndex,chain.webResult.at,'Native spoken Memory/Web result after actual backend completion');
 coreCheck('actual-memory-web-backend-result-returned-in-native-speech',Boolean(host&&speech),{host,speech,semanticResultIndependentReviewRequired:true});
 recordSpeech('memory-web-result-complete-digital-playback',speech);
 save('memory-web-evidence.json',{input:input.row,user,owner,chain,host,speech,semanticResultIndependentReviewRequired:true,
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
 await basicTools(pcIndex);
 const end=play('end-call');await end.done;assert.equal(end.row.exitCode,0);
 const endUser=await waitFor(s=>resolveLifecycleUserTurn(s.events,{pcIndex,after:end.row.startedAt,intent:'end'}),'Complete explicit hang-up USER native transcript',15000);
 const tool=await waitFor(s=>resolveEndCallToolWitness({events:s.events,tools:s.tools,pcIndex,voiceSessionId:owner.voiceSessionId,after:end.row.startedAt}),'Actual native delegation and exact host end-call call/result',20000);
 coreCheck('model-real-end-call-tool-after-complete-USER',tool.userTurnId===endUser.turnId,{endUser,tool,inputCompletedAt:end.row.completedAt,
   causalBinding:'Actual delegation user_bidi_turn_id equals the complete original USER turn; reception timestamps are retained, not treated as cross-stream execution order'});
 const closed=await waitFor(s=>s.pcStates[pcIndex]==='closed'&&s.api.some(a=>a.route==='/api/close'&&a.status===200&&a.request?.voiceSessionId===owner.voiceSessionId),'Original H5 automatic model-requested close',25000);
 const state=await snapshot(true),close=state.api.find(a=>a.route==='/api/close'&&a.status===200&&a.request?.voiceSessionId===owner.voiceSessionId);
 const farewell=assessLifecycleFarewell(state,{pcIndex,tool,before:close.requestedAt});
 const automatic=assessAutomaticEnd(state,{pcIndex,owner,tool,farewell}),capture=await readCaptureClosed(pcIndex);
 coreCheck('automatic-close-after-real-farewell-and750ms-tail',automatic?.passed&&capture.captureEnded&&capture.pcClosed,{automatic,capture,closed:true,manualButtonUsed:false,farewellContentManualReviewRequired:true});
 check('independent-farewell750ms-RTP-tail',automatic?.strictTailPassed===true,{quiet:farewell?.quiet??null,appDrain:automatic?.appDrain??null,
  originalAppDrainIsNotIndependentRTPProof:true});
 recordSpeech('farewell-complete-digital-playback',farewell);save('model-end-call-evidence.json',{input:end.row,endUser,tool,farewell,automatic,capture,appDiagnostics:state.duplex});
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
 const profile=path.join(scratch,'profile');let chromeError='';
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
  const recordings=await evaluate(`(async()=>{const p=globalThis.__candidateLiveProbe,rows=[];for(const recording of p.recordings){const blob=new Blob(recording.chunks,{type:'audio/webm;codecs=opus'}),bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let at=0;at<bytes.length;at+=16384)binary+=String.fromCharCode(...bytes.subarray(at,at+16384));rows.push({pcIndex:recording.pcIndex,startedAt:recording.startedAt,blobBytes:blob.size,base64:btoa(binary),error:recording.error??null});}return rows})()`).catch(()=>[]);
  const decoded=[];
  for(const row of recordings){const prefix='native-'+row.pcIndex,webm=path.join(base,prefix+'.webm');fs.writeFileSync(webm,Buffer.from(row.base64,'base64'),{mode:0o600});
   const ff=spawnSync(media.executables.ffmpeg,['-v','error','-i',webm,'-f','s16le','-ar','48000','-ac','1','pipe:1'],{maxBuffer:80*1024**2});
   if(ff.status===0)fs.writeFileSync(path.join(base,prefix+'.pcm'),ff.stdout,{mode:0o600});
   decoded.push({pcIndex:row.pcIndex,startedAt:row.startedAt,blobBytes:row.blobBytes,decodeSuccess:ff.status===0,pcmBytes:ff.stdout?.length??0,pcmSha256:ff.status===0?hash(ff.stdout):null,durationSeconds:(ff.stdout?.length??0)/96000});
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
  check('default-Chrome-autoplay-no-play-rejection',Array.isArray(lastState?.playRejections)&&lastState.playRejections.length===0,{playRejections:lastState?.playRejections});
 }
 cdp?.close();gateway?.stop();if(chrome?.exitCode===null&&chrome.signalCode===null)chrome.kill('SIGTERM');if(chrome)await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),sleep(2000)]);
 if(chrome?.exitCode===null&&chrome.signalCode===null){chrome.kill('SIGKILL');await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),sleep(1000)]);}
 cleanup={...(await pulse?.dispose()),chromeExited:Boolean(chrome&&(chrome.exitCode!==null||chrome.signalCode!==null))};
 if(chromeTemp){fs.rmSync(chromeTemp,{recursive:true,force:true});cleanup.chromePrivateTempRemoved=!fs.existsSync(chromeTemp);}
 // Entire scratch is unique and owned by this observer; profiles are never reused.
 fs.rmSync(scratch,{recursive:true,force:true});cleanup.privateScratchRemoved=!fs.existsSync(scratch);
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
 const summary={case:'call-lifecycle',validationTarget,validationId:targetInspection?.proof.validationId??null,candidateId:validationTarget==='candidate'?process.env.VLAB_CANDIDATE_ID:null,
  sourceCommit:process.env.GPT_LIVE_H5_SOURCE_COMMIT??targetInspection?.proof.sourceCommit??null,h5AppSha256:process.env.GPT_LIVE_H5_APP_SHA,model:'gpt-live-1-codex',checks,passed:checks.length>0&&checks.every(c=>c.passed),functionalCore,
  coreLifecycleEvidenceComplete:functionalCore.every(c=>c.passed)&&lifecycleDecoded.length===4&&lifecycleDecoded.every(c=>c.segment?.passed===true),
  coreMemoryWebEvidenceComplete:checks.find(c=>c.name==='actual-owned-memory-result-before-web-call')?.passed===true&&checks.find(c=>c.name==='actual-memory-web-backend-result-returned-in-native-speech')?.passed===true&&toolSpeech?.segment?.passed===true,
  strictCompleteDigitalPlayback:wholeDecoded.length===5&&wholeDecoded.every(c=>c.passed)&&checks.find(c=>c.name==='independent-farewell750ms-RTP-tail')?.passed===true,
  continuousMicrophoneStrictPassed:checks.find(c=>c.name==='continuous-original-processed-microphone-through-close')?.passed===true,
  contentIndependentReviewRequired:true,productAccepted:false,owners:[...owners].map(([pcIndex,owner])=>({pcIndex,...owner})),syntheticUSERPCM:true,syntheticAssistantEvents:false,syntheticBackendResults:false,digitalPlaybackAcceptanceOnly:true,physicalEchoAccepted:false,humanListeningAccepted:false,cleanup,evidenceDir:base};
 save('receipt.json',summary);console.log(JSON.stringify({nativeCallLifecycle:{candidateId:summary.candidateId,passed:summary.passed,checks:checks.map(({name,passed})=>({name,passed})),evidenceDir:base}}));if(!summary.passed)process.exitCode=1;
}
