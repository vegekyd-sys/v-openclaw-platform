// Private/shared acceptance through the exact H5. Never launches a Gateway,
// edits shared configuration/auth/runtime, or calls talk.client.create directly.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parseCompleteTimestamps} from './gpt-live-call-live-evidence.mjs';
import {assessH5BargeInterruption,extractControlExecWitness,assessControlFinalFacts,assessControlExecPending,assessControlPendingProgress} from './gpt-live-h5-control-evidence.mjs';
import {parsePublicProgressDiagnostics,extractGeneratedMarker,publicMessageText,extractH5WorkflowWitness,assessH5ProgressProvenance,assessH5FinalAndMirrors,assessH5PendingProgress,matchesGeneratedMarker} from './gpt-live-h5-provenance-evidence.mjs';

assert.equal(process.env.GPT_LIVE_H5_READY,'1','Root deployment-ready handoff required');
const controlCase=process.env.GPT_LIVE_H5_CASE;assert(['cancel','close-reopen','barge-chat'].includes(controlCase),'Explicit bounded control case required');
const clipsDir=process.env.GPT_LIVE_H5_USER_CLIPS_DIR;assert(clipsDir?.startsWith('/'),'Synthetic user PCM clips directory required');
const url=new URL(process.env.GPT_LIVE_H5_URL??'http://127.0.0.1:26244/');
assert.equal(url.protocol,'http:');
assert(['127.0.0.1','localhost'].includes(url.hostname),'Only the root-provided loopback H5 is supported');
const audio=path.resolve(process.env.GPT_LIVE_CALL_AUDIO_FIXTURE??'');
assert(process.env.GPT_LIVE_CALL_AUDIO_FIXTURE&&fs.existsSync(audio),'Synthetic input WAV required');
const expectedAppHash=process.env.GPT_LIVE_H5_APP_SHA;
assert(/^[a-f0-9]{64}$/u.test(expectedAppHash??''),'Exact deployed app.js hash required');
const evidenceDir=path.resolve(process.env.GPT_LIVE_H5_EVIDENCE_DIR??'');
assert(process.env.GPT_LIVE_H5_EVIDENCE_DIR&&evidenceDir.startsWith('/tmp/'),'Task-owned evidence path under /tmp required');
fs.mkdirSync(evidenceDir,{recursive:true,mode:0o700});
const service=process.env.GPT_LIVE_H5_GATEWAY_SERVICE??'openclaw-vlab-production-mirror-v8.service';
const pid=()=>{if(process.env.GPT_LIVE_H5_GATEWAY_PID){const value=Number(process.env.GPT_LIVE_H5_GATEWAY_PID);return fs.existsSync('/proc/'+value)?value:0}return Number(execFileSync('systemctl',['show',service,'-p','MainPID','--value'],{encoding:'utf8'}).trim())};
const beforePid=pid();assert(beforePid>1);
const controlInputs=['long-request','long-child-request','chat','barge','new-greeting'];for(const name of controlInputs)assert(fs.existsSync(path.join(clipsDir,name+'.wav')),'Prepared synthetic clip missing');
const gatewayEnv=Object.fromEntries(fs.readFileSync(`/proc/${beforePid}/environ`,'utf8').split('\0').filter(Boolean).map(item=>{const at=item.indexOf('=');return [item.slice(0,at),item.slice(at+1)]}));
const configPath=gatewayEnv.OPENCLAW_CONFIG_PATH;
assert(configPath?.startsWith('/'),'Actual Gateway config path required');
const configBytes=fs.readFileSync(configPath),config=JSON.parse(configBytes);
const hash=value=>createHash('sha256').update(value).digest('hex');
const beforeConfigHash=hash(configBytes);
const core=process.env.GPT_LIVE_H5_RUNTIME_ROOT;
assert(core?.startsWith('/')&&fs.existsSync(path.join(core,'dist/plugin-sdk/gateway-runtime.js')),'Root-provided runtime required');
assert(Number.isInteger(config.gateway.port)&&config.gateway.port>0);
// The H5 explicitly requests OpenAI/native while unrelated default Talk
// settings can remain unchanged. Check the deployed factual instructions only.
assert(typeof config.talk?.realtime?.instructions==='string'&&config.talk.realtime.instructions.length>50,'Shared factual instructions handoff missing');
assert.equal(gatewayEnv.OPENCLAW_GPT_LIVE_PROGRESS_TRACE,'1','Opt-in callback/native append diagnostics are required');
const overlayNames=JSON.parse(process.env.GPT_LIVE_H5_OVERLAY_TARGETS??'["realtime-quicksilver-delegation-controller-B0yPpiHp.js","realtime-session-harness-CEO5kVAJ.js","talk-DkFuKRod.js"]');
assert(overlayNames.every(name=>typeof name==='string'&&!name.includes('..')&&!path.isAbsolute(name)));
const overlayHashes=()=>Object.fromEntries(overlayNames.map(name=>[name,hash(fs.readFileSync(path.join(core,'dist',name)))]));
const beforeOverlayHashes=overlayHashes();
const served=await fetch(new URL('app.js',url),{signal:AbortSignal.timeout(10000)});
assert(served.ok,'Deployed app.js unavailable');
assert.equal(hash(Buffer.from(await served.arrayBuffer())),expectedAppHash,'H5 app differs from root handoff');
const token=String(config.gateway.auth.token).replace(/\$\{([^}]+)\}/gu,(_,key)=>gatewayEnv[key]??'');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const browserDir=fs.mkdtempSync('/tmp/gpt-live-shared-');
let gateway,chrome,cdp,sessionKey,summary;
const chromeErrors=[];

class CdpClient{
  constructor(url){this.url=url;this.nextId=1;this.pending=new Map()}
  async connect(){
    this.socket=new WebSocket(this.url);
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('CDP connect timeout')),10000);this.socket.addEventListener('open',()=>{clearTimeout(timeout);resolve()},{once:true});this.socket.addEventListener('error',()=>{clearTimeout(timeout);reject(new Error('CDP connect error'))},{once:true})});
    this.socket.addEventListener('message',event=>{const message=JSON.parse(String(event.data));const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);clearTimeout(pending.timeout);message.error?pending.reject(new Error(message.error.message)):pending.resolve(message.result??{})});
    this.socket.addEventListener('close',()=>this.reject(new Error('CDP closed')));this.socket.addEventListener('error',()=>this.reject(new Error('CDP error')));
  }
  request(method,params={},timeoutMs=20000){return new Promise((resolve,reject)=>{const id=this.nextId++;const timeout=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP request timeout: '+method))},timeoutMs);this.pending.set(id,{resolve,reject,timeout});this.socket.send(JSON.stringify({id,method,params}))})}
  reject(error){for(const item of this.pending.values()){clearTimeout(item.timeout);item.reject(error)}this.pending.clear()}
  close(){this.reject(new Error('CDP closed'));this.socket?.close()}
}
async function evaluate(expression){const result=await cdp.request('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result?.value}
async function stopChrome(){if(!chrome?.pid)return;const signal=s=>{try{process.kill(-chrome.pid,s)}catch(error){if(error.code!=='ESRCH')throw error}};const exited=chrome.exitCode!==null||chrome.signalCode!==null?Promise.resolve():new Promise(resolve=>chrome.once('exit',resolve));signal('SIGTERM');await Promise.race([exited,sleep(5000)]);signal('SIGKILL');await Promise.race([exited,sleep(2000)]);await sleep(100)}
function sessionKeys(result){return (result.sessions??[]).map(row=>row.key??row.sessionKey).filter(key=>typeof key==='string'&&key.includes(':gpt-live-h5-experiment-'))}
function messageText(message){return typeof message.content==='string'?message.content:(Array.isArray(message.content)?message.content:[]).filter(part=>part.type==='text').map(part=>part.text??'').join('\n')}
const toolCompletionReceipts=[];
const startedAt=Date.now();
function readDiagnostics(){
 const file=process.env.GPT_LIVE_H5_TRACE_PATH;
 const log=file?fs.readFileSync(file,'utf8'):execFileSync('journalctl',['_PID='+beforePid,'--since=@'+Math.floor(startedAt/1000),'-o','cat','--no-pager','-n','3000'],{encoding:'utf8',maxBuffer:8*1024*1024});
 return parsePublicProgressDiagnostics(log).filter(event=>event.at>=startedAt);
}
function observeGateway(event){
 const payload=event?.payload,data=payload?.data;
 if(event?.event!=='agent'||payload?.stream!=='tool'||data?.phase!=='end'||!sessionKey)return;
 if(payload.sessionKey&&payload.sessionKey!==sessionKey)return;
 const candidates=[];
 for(const value of [data.result,data.output,data.text]){
  if(typeof value==='string')candidates.push(value);
  else if(value&&typeof value==='object'){candidates.push(JSON.stringify(value));if(Array.isArray(value.content))candidates.push(publicMessageText(value))}
 }
 // Agent event schema has runId, not always sessionKey. Store only hashes of
 // tagged synthetic marker results, then match the public observer's runId.
 const markerCandidates=candidates.filter(value=>extractGeneratedMarker(value));
 if(!markerCandidates.length)return;
 toolCompletionReceipts.push({at:Date.now(),runId:payload.runId??null,callId:data.toolCallId??data.callId??null,hashes:[...new Set(markerCandidates.flatMap(value=>[hash(value),hash(value.trim())]))]});
}
async function readWorkflow(){
 const parent=await gateway.request('chat.history',{sessionKey,limit:80},{timeoutMs:15000});
 const preliminary=extractH5WorkflowWitness(parent);
 const children={};if(preliminary.childKey)children[preliminary.childKey]=await gateway.request('chat.history',{sessionKey:preliminary.childKey,limit:50},{timeoutMs:15000});
 return {witness:extractH5WorkflowWitness(parent,children),parent,children};
}
// Observe the application's own objects with additive listeners. The H5 owns
// microphone, session/offer requests, RTC handlers, remoteAudio and controls.
const probe=String.raw`(()=>{
 const p=globalThis.__sharedH5Smoke={probeResources:[],recordings:[],allRemoteEnergyWindows:[],events:[],tools:[],apis:[],ui:[],pcs:[],streams:[],energyWindows:[],microphoneEnergyWindows:[],chunks:[],startedAt:Date.now()};
 const capture=(data,pcIndex)=>{const item=data.item&&typeof data.item==='object'?data.item:{};p.events.push({pcIndex,delegationId:data.delegation_item_id??data.item?.id??data.delegation?.id??null,at:Date.now(),type:data.type,itemId:item.id??null,turnId:data.turn_id??data.turn?.id??null,turnStatus:data.turn?.status??data.status??null,interruptReason:data.turn?.reason??data.reason??null,role:data.turn?.role??null,startMs:data.start_ms??data.turn?.start_ms??null,endMs:data.end_ms??data.turn?.end_ms??null,text:data.turn?.transcript??item.text??data.text??(typeof data.delta==='string'?data.delta:'')});if(p.events.length>1500)p.events.shift()};
 const NativeRTC=globalThis.RTCPeerConnection;
 globalThis.RTCPeerConnection=class extends NativeRTC{
  constructor(...args){super(...args);p.pcs.push(this);const pcIndex=p.pcs.length-1;this.addEventListener('track',event=>{
   p.track=event.track;p.trackAt=Date.now();const stream=new MediaStream([event.track]);
   const recorder=new MediaRecorder(stream,{mimeType:'audio/webm;codecs=opus'});p.recorder=recorder;const chunks=[];p.chunks=chunks;p.recordings.push({recorder,chunks,pcIndex});
   recorder.addEventListener('dataavailable',event=>{if(event.data.size)chunks.push(event.data)});recorder.addEventListener('error',event=>{p.recorderError=event.error?.message??'recorder error'});recorder.start(1000);
   const context=new AudioContext();p.context=context;const ownedProbe={context,pcIndex,timer:null,disposed:false};p.probeResources.push(ownedProbe);const source=context.createMediaStreamSource(stream),analyser=context.createAnalyser(),gain=context.createGain();analyser.fftSize=2048;gain.gain.value=0;source.connect(analyser);analyser.connect(gain);gain.connect(context.destination);void context.resume();
   const samples=new Uint8Array(analyser.fftSize);p.energyTimer=ownedProbe.timer=setInterval(()=>{analyser.getByteTimeDomainData(samples);let sum=0;for(const sample of samples)sum+=(sample-128)**2;const rms=Math.sqrt(sum/samples.length);p.allRemoteEnergyWindows.push({at:Date.now(),rms,pcIndex});if(rms>2)p.energyWindows.push({at:Date.now(),rms,pcIndex})},100);
  })}
  createDataChannel(...args){const channel=super.createDataChannel(...args);p.channel=channel;channel.addEventListener('message',event=>{try{capture(JSON.parse(event.data),p.pcs.indexOf(this))}catch{}});return channel}
 };
 const originalMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...args)=>{const stream=await originalMedia(...args);p.streams.push(stream);
  const context=new AudioContext();p.microphoneContext=context;const ownedProbe={context,pcIndex:p.pcs.length-1, timer:null,disposed:false};p.probeResources.push(ownedProbe);const analyser=context.createAnalyser(),gain=context.createGain();gain.gain.value=0;analyser.fftSize=1024;context.createMediaStreamSource(stream).connect(analyser);analyser.connect(gain);gain.connect(context.destination);void context.resume();const samples=new Float32Array(analyser.fftSize);p.microphoneEnergyTimer=ownedProbe.timer=setInterval(()=>{analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,value)=>sum+value*value,0)/samples.length);if(rms>.005)p.microphoneEnergyWindows.push({at:Date.now(),rms})},100);return stream};
 const NativeEvents=globalThis.EventSource;globalThis.EventSource=class extends NativeEvents{constructor(...args){super(...args);this.addEventListener('message',event=>{try{const data=JSON.parse(event.data);p.tools.push({at:Date.now(),type:data.type,callId:data.callId,voiceSessionId:data.voiceSessionId})}catch{}})}};
 const originalFetch=globalThis.fetch.bind(globalThis);globalThis.fetch=async(...args)=>{const response=await originalFetch(...args);const target=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href);if(target.origin===location.origin&&target.pathname.startsWith('/api/')){const row={at:Date.now(),route:target.pathname,status:response.status};p.apis.push(row);if(target.pathname==='/api/steer'){try{row.mode=JSON.parse(args[1]?.body??'{}').mode}catch{}void response.clone().json().then(data=>{row.ok=data.ok??null;row.accepted=data.accepted??null})}if(target.pathname==='/api/session')void response.clone().json().then(data=>{row.model=data.model;row.voiceSessionId=data.voiceSessionId})}return response};
 p.disposeProbeResources=async(pcIndex)=>{for(const owned of p.probeResources){if(pcIndex!==undefined&&owned.pcIndex!==pcIndex)continue;clearInterval(owned.timer);await owned.context.close().catch(()=>{});owned.disposed=true}};
 document.addEventListener('DOMContentLoaded',()=>{let previous='';const observe=()=>{const value={at:Date.now(),badge:document.querySelector('#badge')?.textContent,status:document.querySelector('#status')?.textContent,conversation:document.querySelector('#conversation')?.innerText,taskStatus:document.querySelector('#taskStatus')?.textContent,voiceState:document.body.dataset.voiceState,avatarState:document.body.dataset.avatarState};const key=JSON.stringify({...value,at:0});if(key!==previous){previous=key;p.ui.push(value);if(p.ui.length>500)p.ui.shift()}};new MutationObserver(observe).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-voice-state','data-avatar-state']});observe()},{once:true});
})()`;

import {USER_PCM_SOURCE} from './gpt-live-h5-user-pcm.mjs';

let control,firstSession,secondSession,firstPcIndex,secondPcIndex,originalTrace,originalWitness,lastState,lastWorkflow,lastPending,lastGate,lastDiagnostics;
async function browserState(){
 return evaluate(`(()=>{const p=globalThis.__sharedH5Smoke;if(!p)return null;return {events:p.events,tools:p.tools,apis:p.apis,ui:p.ui,energyWindows:p.energyWindows,allRemoteEnergyWindows:p.allRemoteEnergyWindows,userClips:p.userClips,syntheticMicrophoneEnergyWindows:p.syntheticMicrophoneEnergyWindows,pcStates:p.pcs.map(pc=>pc.connectionState),channelState:p.channel?.readyState,trackMuted:p.track?.muted,audioPaused:document.querySelector('#remoteAudio')?.paused,auxiliaryUserTracksEnded:p.syntheticMicrophoneSources.every(source=>!source.track||source.track.readyState==='ended'),auxiliaryUserContextsClosed:p.syntheticMicrophoneSources.every(source=>source.context.state==='closed'),probeResourcesDisposed:p.probeResources.every(owned=>owned.disposed&&owned.context.state==='closed')}})()`);
}
async function waitFor(predicate,ms,label){
 const deadline=Date.now()+ms;while(Date.now()<deadline){lastState=await browserState();if(!lastState){await sleep(100);continue}const value=await predicate(lastState);if(value)return value;await sleep(300)}throw Error(label+' deadline');
}
async function beginCall(){
 const oldLength=(await browserState()).pcStates.length;
 await evaluate(`document.querySelector('#start').click()`);
 await waitFor(state=>state.pcStates.length>oldLength&&state.pcStates.at(-1)==='connected'&&state.channelState==='open',30000,'Actual H5 RTC connection');
 await waitFor(state=>state.apis.filter(api=>api.route==='/api/session'&&api.status===200).at(-1)?.voiceSessionId,5000,'H5 session metadata');
 const meta=JSON.parse(fs.readFileSync(process.env.GPT_LIVE_H5_SESSION_PATH,'utf8'));
 const state=await browserState(),created=state.apis.filter(api=>api.route==='/api/session'&&api.status===200).at(-1);
 assert.equal(meta.voiceSessionId,created.voiceSessionId);assert.equal(created.model,'gpt-live-1-codex');
 return {sessionKey:meta.sessionKey,voiceSessionId:meta.voiceSessionId,pcIndex:oldLength};
}
async function play(name){
 const bytes=fs.readFileSync(path.join(clipsDir,name+'.wav'));
 const result=await evaluate('globalThis.__sharedH5Smoke.playUserPcm('+JSON.stringify(bytes.toString('base64'))+','+JSON.stringify(name)+')');
 assert(!result.error,result.error);return {...result,wavSha256:hash(bytes)};
}
async function workflowAt(key){
 const parent=await gateway.request('chat.history',{sessionKey:key,limit:100},{timeoutMs:15000});
 const preliminary=extractH5WorkflowWitness(parent),children={};
 if(preliminary.childKey)children[preliminary.childKey]=await gateway.request('chat.history',{sessionKey:preliminary.childKey,limit:80},{timeoutMs:15000});
 return {parent,children,witness:extractH5WorkflowWitness(parent,children)};
}
async function stopCall(){
 const prior=(await browserState()).apis.filter(api=>api.route==='/api/close'&&api.status===200).length;
 await evaluate(`document.querySelector('#stop').click()`);
 const result=await waitFor(state=>{const apis=state.apis.filter(row=>row.route==='/api/close'&&row.status===200);return apis.length>prior&&state.pcStates.at(-1)==='closed'?apis.at(-1):null},10000,'Actual H5 API close');
 await evaluate('globalThis.__sharedH5Smoke.disposeProbeResources(globalThis.__sharedH5Smoke.pcs.length-1)');return result;
}
async function screenshot(name){
 const image=await cdp.request('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(evidenceDir,name),Buffer.from(image.data,'base64'),{mode:0o600});
}
async function saveRecordings(){
 const count=await evaluate('globalThis.__sharedH5Smoke.recordings.length'),results=[];
 for(let index=0;index<count;index++){
  const recording=await evaluate(`(async()=>{const row=globalThis.__sharedH5Smoke.recordings[`+index+`];if(row.recorder.state!=='inactive')await new Promise(resolve=>{row.recorder.addEventListener('stop',resolve,{once:true});row.recorder.stop()});const blob=new Blob(row.chunks,{type:'audio/webm;codecs=opus'}),bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let at=0;at<bytes.length;at+=16384)binary+=String.fromCharCode(...bytes.subarray(at,at+16384));return {blobBytes:blob.size,base64:btoa(binary),pcIndex:row.pcIndex}})()`);
  const stem='call-'+recording.pcIndex;fs.writeFileSync(path.join(evidenceDir,stem+'.webm'),Buffer.from(recording.base64,'base64'),{mode:0o600});
  const ff=spawnSync('/usr/bin/ffmpeg',['-v','error','-i',path.join(evidenceDir,stem+'.webm'),'-f','s16le','-ar','48000','-ac','1','pipe:1'],{maxBuffer:30*1024*1024});
  assert.equal(ff.status,0,'Remote H5 recording failed to decode');const pcm=ff.stdout;let energy=0,peak=0;for(let at=0;at+1<pcm.length;at+=2){const sample=pcm.readInt16LE(at);energy+=sample*sample;peak=Math.max(peak,Math.abs(sample))}
  const pcmPath=path.join(evidenceDir,stem+'.pcm'),wavPath=path.join(evidenceDir,stem+'.wav');fs.writeFileSync(pcmPath,pcm,{mode:0o600});
  const wav=spawnSync('/usr/bin/ffmpeg',['-v','error','-y','-f','s16le','-ar','48000','-ac','1','-i',pcmPath,wavPath]);assert.equal(wav.status,0);
  results.push({pcIndex:recording.pcIndex,blobBytes:recording.blobBytes,pcmBytes:pcm.length,pcmSha256:hash(pcm),rmsPcm16:Math.sqrt(energy/(pcm.length/2)),peakPcm16:peak,wavPath});
 }
 return results;
}
try{
 const {GatewayClient}=await import(path.join(core,'dist/plugin-sdk/gateway-runtime.js'));
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Read-only Gateway hello timeout')),15000);gateway=new GatewayClient({url:'ws://127.0.0.1:'+config.gateway.port,token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read'],onEvent:observeGateway,onHelloOk:()=>{clearTimeout(timeout);resolve()},onConnectError:error=>{clearTimeout(timeout);reject(error)}});gateway.start()});
 chrome=spawn('/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-features=AudioServiceSandbox','--remote-debugging-port=0','--user-data-dir='+path.join(browserDir,'profile'),'--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+audio,'--autoplay-policy=no-user-gesture-required','about:blank'],{env:{...process.env,TMPDIR:browserDir,TMP:browserDir,TEMP:browserDir},detached:true,stdio:['ignore','pipe','pipe']});
 for(const stream of [chrome.stdout,chrome.stderr])stream.on('data',chunk=>{chromeErrors.push(String(chunk).replace(/(https?:\/\/)[^\s]+/gu,'$1[endpoint]').slice(-1500));if(chromeErrors.length>10)chromeErrors.shift()});
 const debugFile=path.join(browserDir,'profile/DevToolsActivePort'),until=Date.now()+20000;while(!fs.existsSync(debugFile)&&Date.now()<until)await sleep(100);assert(fs.existsSync(debugFile),'Chrome debugger unavailable');
 const debugPort=fs.readFileSync(debugFile,'utf8').split(/\r?\n/u)[0],targets=await fetch('http://127.0.0.1:'+debugPort+'/json/list',{signal:AbortSignal.timeout(10000)}).then(r=>r.json()),target=targets.find(item=>item.type==='page');
 cdp=new CdpClient(target.webSocketDebuggerUrl);await cdp.connect();await cdp.request('Page.enable');await cdp.request('Runtime.enable');await cdp.request('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await cdp.request('Page.addScriptToEvaluateOnNewDocument',{source:probe});await cdp.request('Page.addScriptToEvaluateOnNewDocument',{source:USER_PCM_SOURCE});await cdp.request('Page.navigate',{url:String(url)});
 await waitFor(async()=>evaluate(`document.querySelector('#badge')?.textContent==='可开始通话'`),10000,'Ready H5 page');
 firstSession=await beginCall();firstPcIndex=firstSession.pcIndex;sessionKey=firstSession.sessionKey;
 const firstClip=await play(controlCase==='close-reopen'?'long-child-request':'long-request');
 let pending,workflow,diagnostics;
 await waitFor(async state=>{
  workflow=await workflowAt(firstSession.sessionKey);diagnostics=readDiagnostics();
  const currentOwnerId=state.events.filter(event=>event.pcIndex===firstPcIndex&&event.type==='delegation.created').at(-1)?.delegationId;
  pending=assessControlPendingProgress({diagnostics,events:state.events,energyWindows:state.energyWindows,backendPublicTexts:workflow.witness.backendPublicTexts,marker:workflow.witness.marker,currentOwnerId,pcIndex:firstPcIndex});
  const targetHistory=controlCase==='close-reopen'?workflow.children[workflow.witness.childKey]:workflow.parent;
  const pendingExec=assessControlExecPending(targetHistory??{});
  lastWorkflow=workflow;lastPending=pending;lastDiagnostics=diagnostics;
  lastGate={at:Date.now(),currentOwnerId,marker:workflow.witness.marker,markerGeneratedByExec:workflow.witness.markerGeneratedByExec,
    progressStatus:pending.status,progressReason:pending.reason??null,pendingExec,spawnAccepted:workflow.witness.spawnAccepted,yielded:workflow.witness.yielded,
    ownerHasFinal:diagnostics.some(event=>event.delegationId===currentOwnerId&&event.kind==='final'&&event.stage==='context-append-sent')};
  return workflow.witness.markerGeneratedByExec&&pending.status==='observed-pending'&&pendingExec.pending&&(controlCase!=='close-reopen'||workflow.witness.spawnAccepted&&workflow.witness.yielded)?pendingExec:null;
 },100000,'Real long-running tool and grounded early speech');
 originalTrace={traceId:pending.traceId,delegationId:pending.delegationId,generation:pending.generation};originalWitness=workflow.witness;
 await screenshot('before-control.png');
 if(controlCase==='cancel'){
  await evaluate(`document.querySelector('#cancel').click()`);
  const accepted=await waitFor(state=>state.apis.find(api=>api.route==='/api/steer'&&api.mode==='cancel'&&api.status===200&&api.ok===true),10000,'Actual cancel API accepted');
  await sleep(50000);
  const after=await workflowAt(firstSession.sessionKey);const traces=readDiagnostics();
  const staleFinals=traces.filter(event=>event.stage==='context-append-sent'&&event.traceId===originalTrace.traceId&&event.delegationId===originalTrace.delegationId&&event.generation===originalTrace.generation&&event.at>accepted.at);
  control={case:controlCase,cancelAcceptedAt:accepted.at,cancelApiStatus:accepted.status,oldAppendCountAfterCancel:staleFinals.length,oldFinalAppendCountAfterCancel:staleFinals.filter(event=>event.kind==='final').length,oldProgressAppendCountAfterCancel:staleFinals.filter(event=>event.kind==='progress').length,backendAfterCancel:after.witness,taskCancellationBoundary:'voice owner cancellation accepted; no claim that all external child jobs were killed'};
 }else if(controlCase==='close-reopen'){
  const oldClose=await stopCall();await evaluate('globalThis.__sharedH5Smoke.stopUserPcm()');
  secondSession=await beginCall();secondPcIndex=secondSession.pcIndex;
  const newClip=await play('new-greeting');
  await waitFor(state=>state.events.some(event=>event.pcIndex===secondPcIndex&&event.type==='turn.done'&&event.role==='assistant'&&/你好|您好/u.test(event.text)),30000,'New call actual greeting');
  await sleep(55000);
  const after=await workflowAt(firstSession.sessionKey),traces=readDiagnostics();
  const oldChild=after.children[after.witness.childKey],oldChildExec=extractControlExecWitness(oldChild);
  const lateText=oldChildExec?.resultText??'',actualCommandTime=oldChildExec?.actualCommandTime??null;
  const state=await browserState(),newAssistant=state.events.filter(event=>event.pcIndex===secondPcIndex&&['output_transcript.added','turn.done'].includes(event.type)&&(event.role==='assistant'||event.type==='output_transcript.added')).map(event=>event.text).join('');
  const staleFinals=traces.filter(event=>event.stage==='context-append-sent'&&event.traceId===originalTrace.traceId&&event.delegationId===originalTrace.delegationId&&event.generation===originalTrace.generation&&event.at>oldClose.at);
  control={case:controlCase,oldCloseAt:oldClose.at,oldCloseApiStatus:oldClose.status,newClip,secondSession,newCallGreetingObserved:/你好|您好/u.test(newAssistant),oldAppendCountAfterClose:staleFinals.length,oldFinalAppendCountAfterClose:staleFinals.filter(event=>event.kind==='final').length,oldProgressAppendCountAfterClose:staleFinals.filter(event=>event.kind==='progress').length,oldMarkerInNewCall:matchesGeneratedMarker(newAssistant,originalWitness.marker),oldChildExecWitness:oldChildExec,oldChildToolResult:lateText,oldChildActualCommandTime:actualCommandTime,oldChildCompletedAfterClose:actualCommandTime!==null&&actualCommandTime>oldClose.at,backendAfterClose:after.witness};
 }else{
  const chat=await play('chat');
  await waitFor(state=>state.userClips.some(clip=>clip.label==='chat'&&clip.endedAt),20000,'Sidechat user PCM ended');
  await waitFor(state=>state.events.some(event=>event.pcIndex===firstPcIndex&&event.type==='output_transcript.added'&&event.at>chat.at&&/[一二三四五六七八九十1-9]/u.test(event.text))&&state.energyWindows.some(window=>window.pcIndex===firstPcIndex&&Date.now()-window.at<250),15000,'Real native counting speech');
  const barge=await play('barge');
  await waitFor(state=>state.events.some(event=>event.pcIndex===firstPcIndex&&event.type==='turn.done'&&event.role==='user'&&event.at>barge.at&&/先听|停一下|别取消/u.test(event.text)),20000,'Barge-in user transcript');
  // Exercise the actual supplementary-conditions form while keeping ownership.
  await evaluate(`(()=>{document.querySelector('#steerText').value='最终请保留真实时间和时区，继续原来的任务，不要取消。';document.querySelector('#steerForm').requestSubmit()})()`);
  const steering=await waitFor(state=>state.apis.find(api=>api.route==='/api/steer'&&api.mode==='steer'&&api.status===200&&api.ok===true),10000,'Actual steer API accepted');
  const completedWorkflow=await waitFor(async state=>{const parent=await workflowAt(firstSession.sessionKey),finals=readDiagnostics().filter(event=>event.kind==='final'&&event.stage==='context-append-sent'&&event.traceId===originalTrace.traceId);return finals.length&&state.events.some(event=>event.pcIndex===firstPcIndex&&event.type==='turn.done'&&event.role==='assistant'&&event.at>=finals[0].at&&parseCompleteTimestamps(event.text).length)?parent:null},65000,'Original task final after conversational interruption');
  const state=await browserState(),traces=readDiagnostics();
  const finalAppendAt=traces.find(event=>event.stage==='context-append-sent'&&event.kind==='final'&&event.traceId===originalTrace.traceId&&event.delegationId===originalTrace.delegationId&&event.generation===originalTrace.generation)?.at??null;
  const bargeEvidence=assessH5BargeInterruption({events:state.events,remoteWindows:state.allRemoteEnergyWindows,microphoneWindows:state.syntheticMicrophoneEnergyWindows,chatAt:chat.at,bargeAt:barge.at,pcIndex:firstPcIndex,finalAppendAt});
  const execWitness=extractControlExecWitness(completedWorkflow.parent),finalFacts=assessControlFinalFacts({events:state.events.filter(event=>event.pcIndex===firstPcIndex),marker:originalWitness.marker,execWitness,finalAppendAt});
  const superseded=state.events.filter(event=>event.pcIndex===firstPcIndex&&event.type==='delegation.created'&&event.at>chat.at);
  control={case:controlCase,chat,barge,steerApiStatus:steering.status,bargeEvidence,execWitness,finalFacts,additionalDelegationsAfterPureChat:superseded.length,originalFinalDelivered:traces.some(event=>event.stage==='context-append-sent'&&event.kind==='final'&&event.traceId===originalTrace.traceId&&event.delegationId===originalTrace.delegationId&&event.generation===originalTrace.generation),nativeBargeBoundary:'same-window user/output PCM + continuous quiet during user speech + interrupted native counting-turn boundary; human listening remains required'};
 }
 await screenshot('after-control.png');const beforeStopState=await browserState();const rtcStats=await evaluate(`(async()=>{const p=globalThis.__sharedH5Smoke,result=[];for(let pcIndex=0;pcIndex<p.pcs.length;pcIndex++){const stats=await p.pcs[pcIndex].getStats();for(const row of stats.values())if(['inbound-rtp','outbound-rtp'].includes(row.type)&&row.kind==='audio')result.push({pcIndex,type:row.type,bytesSent:row.bytesSent??null,bytesReceived:row.bytesReceived??null,totalSamplesReceived:row.totalSamplesReceived??null,totalAudioEnergy:row.totalAudioEnergy??null})}return result})()`);const recordings=await saveRecordings();
 await stopCall();await evaluate('globalThis.__sharedH5Smoke.stopUserPcm()');
 lastState=await browserState();
 summary={case:controlCase,model:'gpt-live-1-codex',h5AppSha256:expectedAppHash,firstSession,secondSession,firstClip,originalWitness,originalTrace,pendingProgress:pending,control,recordings,rtcStats,beforeStopState,state:lastState,diagnostics:readDiagnostics(),sharedBeforePid:beforePid,sharedAfterPid:pid(),configUnchanged:hash(fs.readFileSync(configPath))===beforeConfigHash,overlaysUnchanged:JSON.stringify(overlayHashes())===JSON.stringify(beforeOverlayHashes),humanListeningAccepted:false};
 fs.writeFileSync(path.join(evidenceDir,'receipt.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600});
 process.stdout.write(JSON.stringify({gptLiveH5Control:summary})+'\n');
 assert(recordings.some(recording=>recording.rmsPcm16>30),'Actual remote decoded PCM missing');
 assert(lastState.syntheticMicrophoneEnergyWindows.length>0&&rtcStats.some(row=>row.type==='outbound-rtp'&&row.bytesSent>1000),'Actual synthetic user PCM/RTP missing');
 if(controlCase==='cancel')assert(control.oldAppendCountAfterCancel===0,'Cancelled owner appended its old final');
 else if(controlCase==='close-reopen')assert(control.newCallGreetingObserved&&control.oldAppendCountAfterClose===0&&!control.oldMarkerInNewCall&&control.oldChildCompletedAfterClose&&recordings.some(recording=>recording.pcIndex===secondPcIndex&&recording.rmsPcm16>30)&&beforeStopState.energyWindows.some(window=>window.pcIndex===secondPcIndex)&&!beforeStopState.audioPaused,'Old late child result was not proven isolated from real new call');
 else assert(control.bargeEvidence.status==='observed'&&control.finalFacts.status==='match'&&control.additionalDelegationsAfterPureChat===0&&control.originalFinalDelivered,'Pure sidechat/barge did not retain owner and pause actual speech');
 assert(lastState.pcStates.every(value=>value==='closed')&&lastState.auxiliaryUserTracksEnded&&lastState.auxiliaryUserContextsClosed&&lastState.probeResourcesDisposed,'H5/temporary microphone cleanup incomplete');
 assert(pid()===beforePid&&summary.configUnchanged&&summary.overlaysUnchanged,'Gateway deployment changed during control case');
}catch(error){
 const message=error.message.replace(/(token|api.?key|authorization|secret|password)[=: ]+[^\s]+/giu,'$1=[redacted]').replace(/[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{10,}/gu,'[redacted JWT]');
 const partial=cdp?await browserState().catch(()=>null):null;
 fs.writeFileSync(path.join(evidenceDir,'workflow-history.json'),JSON.stringify({workflow:lastWorkflow,pending:lastPending,gate:lastGate,diagnostics:lastDiagnostics},null,2)+'\n',{mode:0o600});
 fs.writeFileSync(path.join(evidenceDir,'failure.json'),JSON.stringify({error:message,control,firstSession,secondSession,originalWitness,lastGate,lastPending,partial,summaryWritten:Boolean(summary),chromeErrors},null,2)+'\n',{mode:0o600});
 process.stderr.write(JSON.stringify({error:message,failureEvidence:path.join(evidenceDir,'failure.json')})+'\n');process.exitCode=1;
}finally{
 if(cdp){
  await evaluate(`(async()=>{const p=globalThis.__sharedH5Smoke;document.querySelector('#stop')?.click();await p?.stopUserPcm();await p?.disposeProbeResources();clearInterval(p?.energyTimer);clearInterval(p?.microphoneEnergyTimer);for(const row of p?.recordings??[])if(row.recorder.state==='recording')row.recorder.stop();await p?.context?.close().catch(()=>{});await p?.microphoneContext?.close().catch(()=>{})})()`).catch(()=>{});
  await waitFor(state=>state.pcStates.every(value=>value==='closed')&&state.apis.some(api=>api.route==='/api/close'&&api.status===200),10000,'Cleanup close').catch(()=>{});
 }
 const cleanup=cdp?await evaluate(`(()=>{const p=globalThis.__sharedH5Smoke;return {pcStates:p?.pcs.map(pc=>pc.connectionState),microphoneEnded:p?.streams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended')),closeApi:p?.apis.some(api=>api.route==='/api/close'&&api.status===200),remoteAudioDetached:document.querySelector('#remoteAudio')?.srcObject===null,auxiliaryUserTracksEnded:p?.syntheticMicrophoneSources.every(source=>!source.track||source.track.readyState==='ended'),auxiliaryUserContextsClosed:p?.syntheticMicrophoneSources.every(source=>source.context.state==='closed'),probeResourcesDisposed:p?.probeResources.every(owned=>owned.disposed&&owned.context.state==='closed')}})()`).catch(()=>null):null;
 cdp?.close();await stopChrome();gateway?.stop();fs.rmSync(browserDir,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 fs.writeFileSync(path.join(evidenceDir,'cleanup.json'),JSON.stringify({cleanup,chromeExited:chrome?.exitCode!==null||chrome?.signalCode!==null,gatewayPidUnchanged:pid()===beforePid,configUnchanged:hash(fs.readFileSync(configPath))===beforeConfigHash,overlaysUnchanged:JSON.stringify(overlayHashes())===JSON.stringify(beforeOverlayHashes)},null,2)+'\n',{mode:0o600});
}
