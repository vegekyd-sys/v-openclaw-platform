// Private/shared acceptance through the exact H5. Never launches a Gateway,
// edits shared configuration/auth/runtime, or calls talk.client.create directly.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parseCompleteTimestamps} from './gpt-live-call-live-evidence.mjs';
import {parsePublicProgressDiagnostics,extractGeneratedMarker,publicMessageText,extractH5WorkflowWitness,assessH5ProgressProvenance,assessH5FinalAndMirrors,matchesGeneratedMarker} from './gpt-live-h5-provenance-evidence.mjs';

assert.equal(process.env.GPT_LIVE_H5_READY,'1','Root deployment-ready handoff required');
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
 const p=globalThis.__sharedH5Smoke={events:[],tools:[],apis:[],ui:[],pcs:[],streams:[],energyWindows:[],microphoneEnergyWindows:[],chunks:[],startedAt:Date.now()};
 const capture=data=>{const item=data.item&&typeof data.item==='object'?data.item:{};p.events.push({at:Date.now(),type:data.type,itemId:item.id??null,turnId:data.turn_id??data.turn?.id??null,role:data.turn?.role??null,startMs:data.start_ms??data.turn?.start_ms??null,endMs:data.end_ms??data.turn?.end_ms??null,text:data.turn?.transcript??item.text??data.text??(typeof data.delta==='string'?data.delta:'')});if(p.events.length>1500)p.events.shift()};
 const NativeRTC=globalThis.RTCPeerConnection;
 globalThis.RTCPeerConnection=class extends NativeRTC{
  constructor(...args){super(...args);p.pcs.push(this);this.addEventListener('track',event=>{
   p.track=event.track;p.trackAt=Date.now();const stream=new MediaStream([event.track]);
   const recorder=new MediaRecorder(stream,{mimeType:'audio/webm;codecs=opus'});p.recorder=recorder;
   recorder.addEventListener('dataavailable',event=>{if(event.data.size)p.chunks.push(event.data)});recorder.addEventListener('error',event=>{p.recorderError=event.error?.message??'recorder error'});recorder.start(1000);
   const context=new AudioContext();p.context=context;const source=context.createMediaStreamSource(stream),analyser=context.createAnalyser(),gain=context.createGain();analyser.fftSize=2048;gain.gain.value=0;source.connect(analyser);analyser.connect(gain);gain.connect(context.destination);void context.resume();
   const samples=new Uint8Array(analyser.fftSize);p.energyTimer=setInterval(()=>{analyser.getByteTimeDomainData(samples);let sum=0;for(const sample of samples)sum+=(sample-128)**2;const rms=Math.sqrt(sum/samples.length);if(rms>2)p.energyWindows.push({at:Date.now(),rms})},100);
  })}
  createDataChannel(...args){const channel=super.createDataChannel(...args);p.channel=channel;channel.addEventListener('message',event=>{try{capture(JSON.parse(event.data))}catch{}});return channel}
 };
 const originalMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...args)=>{const stream=await originalMedia(...args);p.streams.push(stream);
  const context=new AudioContext();p.microphoneContext=context;const analyser=context.createAnalyser(),gain=context.createGain();gain.gain.value=0;analyser.fftSize=1024;context.createMediaStreamSource(stream).connect(analyser);analyser.connect(gain);gain.connect(context.destination);void context.resume();const samples=new Float32Array(analyser.fftSize);p.microphoneEnergyTimer=setInterval(()=>{analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,value)=>sum+value*value,0)/samples.length);if(rms>.005)p.microphoneEnergyWindows.push({at:Date.now(),rms})},100);return stream};
 const NativeEvents=globalThis.EventSource;globalThis.EventSource=class extends NativeEvents{constructor(...args){super(...args);this.addEventListener('message',event=>{try{const data=JSON.parse(event.data);p.tools.push({at:Date.now(),type:data.type,callId:data.callId,voiceSessionId:data.voiceSessionId})}catch{}})}};
 const originalFetch=globalThis.fetch.bind(globalThis);globalThis.fetch=async(...args)=>{const response=await originalFetch(...args);const target=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href);if(target.origin===location.origin&&target.pathname.startsWith('/api/')){const row={at:Date.now(),route:target.pathname,status:response.status};p.apis.push(row);if(target.pathname==='/api/session')void response.clone().json().then(data=>{row.model=data.model;row.voiceSessionId=data.voiceSessionId})}return response};
 document.addEventListener('DOMContentLoaded',()=>{let previous='';const observe=()=>{const value={at:Date.now(),badge:document.querySelector('#badge')?.textContent,status:document.querySelector('#status')?.textContent,conversation:document.querySelector('#conversation')?.innerText,taskStatus:document.querySelector('#taskStatus')?.textContent,voiceState:document.body.dataset.voiceState,avatarState:document.body.dataset.avatarState};const key=JSON.stringify({...value,at:0});if(key!==previous){previous=key;p.ui.push(value);if(p.ui.length>500)p.ui.shift()}};new MutationObserver(observe).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-voice-state','data-avatar-state']});observe()},{once:true});
})()`;

try{
  const {GatewayClient}=await import(path.join(core,'dist/plugin-sdk/gateway-runtime.js'));
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Read-only Gateway hello timeout')),15000);gateway=new GatewayClient({url:'ws://127.0.0.1:'+config.gateway.port,token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read'],onEvent:observeGateway,onHelloOk:()=>{clearTimeout(timeout);resolve()},onConnectError:error=>{clearTimeout(timeout);reject(error)}});gateway.start()});
  const existing=new Set(sessionKeys(await gateway.request('sessions.list',{agentId:'makaron',limit:200,includeLastMessage:false},{timeoutMs:15000})));
  chrome=spawn('/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-features=AudioServiceSandbox','--remote-debugging-port=0',`--user-data-dir=${path.join(browserDir,'profile')}`,'--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${audio}`,'--autoplay-policy=no-user-gesture-required','about:blank'],{env:{...process.env,TMPDIR:browserDir,TMP:browserDir,TEMP:browserDir},detached:true,stdio:['ignore','pipe','pipe']});
  for(const stream of [chrome.stdout,chrome.stderr])stream.on('data',chunk=>{chromeErrors.push(String(chunk).replace(/(https?:\/\/)[^\s]+/gu,'$1[endpoint]').slice(-1500));if(chromeErrors.length>10)chromeErrors.shift()});
  const debugFile=path.join(browserDir,'profile/DevToolsActivePort');const debugDeadline=Date.now()+20000;while(!fs.existsSync(debugFile)&&Date.now()<debugDeadline)await sleep(100);assert(fs.existsSync(debugFile),'Chrome debugger unavailable');
  const debugPort=fs.readFileSync(debugFile,'utf8').split(/\r?\n/u)[0];const targets=await fetch(`http://127.0.0.1:${debugPort}/json/list`,{signal:AbortSignal.timeout(10000)}).then(r=>r.json());const target=targets.find(item=>item.type==='page');assert(target?.webSocketDebuggerUrl);
  cdp=new CdpClient(target.webSocketDebuggerUrl);await cdp.connect();await cdp.request('Page.enable');await cdp.request('Runtime.enable');await cdp.request('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await cdp.request('Page.addScriptToEvaluateOnNewDocument',{source:probe});await cdp.request('Page.navigate',{url:String(url)});
  const readyDeadline=Date.now()+10000;let ready=false;while(Date.now()<readyDeadline){ready=await evaluate(`document.querySelector('#badge')?.textContent==='可以拨号' && document.body.dataset.callState==='idle'`);if(ready)break;await sleep(200)}assert(ready,'H5 is not connected to ready deployment');
  await evaluate(`document.getElementById('start').click()`);
  const deadline=Date.now()+180000;let state,workflow,diagnostics=[],early,finalProof;
  while(Date.now()<deadline){
   await sleep(1000);
   state=await evaluate(`(()=>{const p=globalThis.__sharedH5Smoke,a=document.querySelector('#remoteAudio');return {events:p.events,tools:p.tools,apis:p.apis,ui:p.ui,energyWindows:p.energyWindows,microphoneEnergyWindows:p.microphoneEnergyWindows,connectionState:p.pcs[0]?.connectionState,channelState:p.channel?.readyState,trackAt:p.trackAt,trackState:p.track?.readyState,trackMuted:p.track?.muted,recorderState:p.recorder?.state,recorderError:p.recorderError??null,audioContextState:p.context?.state,audioPaused:a?.paused,audioTime:a?.currentTime,badge:document.querySelector('#badge')?.textContent}})()`);
   if(state.apis.some(item=>item.route==='/api/session'&&item.status!==200))throw new Error('H5 session request failed');
   if(!sessionKey&&state.apis.some(item=>item.route==='/api/session'&&item.status===200)){
    const sessionPath=process.env.GPT_LIVE_H5_SESSION_PATH;
    if(sessionPath&&fs.existsSync(sessionPath)){
     const meta=JSON.parse(fs.readFileSync(sessionPath,'utf8'));
     const created=state.apis.find(item=>item.route==='/api/session'&&item.status===200);
     if(meta.voiceSessionId===created.voiceSessionId&&typeof meta.sessionKey==='string')sessionKey=meta.sessionKey;
    }
    if(!sessionKey){const sessions=sessionKeys(await gateway.request('sessions.list',{agentId:'makaron',limit:200,includeLastMessage:false},{timeoutMs:15000})).filter(key=>!existing.has(key));
     assert.equal(sessions.length,1,'Dedicated H5 session could not be identified');sessionKey=sessions[0]}
   }
   if(!sessionKey)continue;
   workflow=await readWorkflow();diagnostics=readDiagnostics();
   const markerResultHash=hash(workflow.witness.markerExecResult.trim());
   const ownedRunIds=new Set(diagnostics.filter(event=>event.stage==='public-progress-received').map(event=>event.provenance?.runId).filter(Boolean));
   const markerReceipt=toolCompletionReceipts.find(receipt=>ownedRunIds.has(receipt.runId)&&receipt.hashes.includes(markerResultHash));
   const initialUserText=state.events.find(event=>event.type==='turn.done'&&event.role==='user')?.text??'';
   early=assessH5ProgressProvenance({diagnostics,events:state.events,energyWindows:state.energyWindows,backendPublicTexts:workflow.witness.backendPublicTexts,marker:workflow.witness.marker,initialUserText,markerToolResultReceivedAt:markerReceipt?.at??null});
   finalProof=assessH5FinalAndMirrors(workflow.witness,diagnostics,state.events);
   if(workflow.witness.parentResumedWithResult&&early.status==='observed'&&finalProof.finalTimestampStatus==='match'&&finalProof.finalMarkerMatches)break;
  }
  const created=state.apis.find(item=>item.route==='/api/session'&&item.status===200);assert.equal(created?.model,'gpt-live-1-codex');
  fs.writeFileSync(path.join(evidenceDir,'workflow-history.json'),JSON.stringify(workflow,null,2)+'\n',{mode:0o600});
  const call=state.tools.find(item=>item.type==='tool.call');
  const initialUserText=state.events.find(event=>event.type==='turn.done'&&event.role==='user')?.text??'';
  const visible=state.ui.find(item=>item.at>=early?.progressTranscriptAt&&item.at<(early?.finalAppendSentAt??0)&&matchesGeneratedMarker(item.conversation??'',workflow.witness.marker??'not-a-marker'));
  const rtcStats=await evaluate(`(async()=>{const stats=await globalThis.__sharedH5Smoke.pcs[0]?.getStats();return [...(stats?.values()??[])].filter(row=>['inbound-rtp','outbound-rtp','codec'].includes(row.type)&&(!row.kind||row.kind==='audio')).map(row=>Object.fromEntries(['type','kind','bytesSent','bytesReceived','packetsSent','packetsReceived','totalSamplesReceived','totalAudioEnergy','audioLevel','mimeType','clockRate','channels'].filter(key=>row[key]!==undefined).map(key=>[key,row[key]])))})()`);
  const recording=await evaluate(`(async()=>{const p=globalThis.__sharedH5Smoke;if(!p.recorder)return {error:'No remote recorder'};if(p.recorder.state!=='inactive')await new Promise(resolve=>{p.recorder.addEventListener('stop',resolve,{once:true});p.recorder.stop()});clearInterval(p.energyTimer);clearInterval(p.microphoneEnergyTimer);await p.context?.close();await p.microphoneContext?.close();const blob=new Blob(p.chunks,{type:'audio/webm;codecs=opus'}),bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let at=0;at<bytes.length;at+=16384)binary+=String.fromCharCode(...bytes.subarray(at,at+16384));return {blobBytes:blob.size,base64:btoa(binary)}})()`);assert(!recording.error,recording.error);fs.writeFileSync(path.join(evidenceDir,'answer.webm'),Buffer.from(recording.base64,'base64'),{mode:0o600});
  const ff=spawnSync('/usr/bin/ffmpeg',['-v','error','-i',path.join(evidenceDir,'answer.webm'),'-f','s16le','-ar','48000','-ac','1','pipe:1'],{maxBuffer:20*1024*1024});assert.equal(ff.status,0,'Captured H5 audio failed to decode');const pcm=ff.stdout;let peak=0,energy=0;for(let at=0;at+1<pcm.length;at+=2){const sample=pcm.readInt16LE(at);peak=Math.max(peak,Math.abs(sample));energy+=sample**2}const rms=Math.sqrt(energy/(pcm.length/2));fs.writeFileSync(path.join(evidenceDir,'answer.pcm'),pcm,{mode:0o600});const wav=spawnSync('/usr/bin/ffmpeg',['-v','error','-y','-f','s16le','-ar','48000','-ac','1','-i',path.join(evidenceDir,'answer.pcm'),path.join(evidenceDir,'answer.wav')],{encoding:'utf8'});assert.equal(wav.status,0);
  const screenshot=await cdp.request('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(evidenceDir,'completed-h5.png'),Buffer.from(screenshot.data,'base64'),{mode:0o600});
  await evaluate(`document.getElementById('stop').click()`);const closeDeadline=Date.now()+10000;let closed;while(Date.now()<closeDeadline){await sleep(200);closed=await evaluate(`(()=>{const p=globalThis.__sharedH5Smoke;return {connectionState:p.pcs[0]?.connectionState,allMicrophoneTracksEnded:p.streams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended')),remoteAudioDetached:document.querySelector('#remoteAudio').srcObject===null,closeApi:p.apis.some(item=>item.route==='/api/close'&&item.status===200),badge:document.querySelector('#badge').textContent}})()`);if(closed.closeApi)break}
  summary={model:created.model,sessionKey,h5AppSha256:expectedAppHash,connectionState:state.connectionState,dataChannelState:state.channelState,audioPaused:state.audioPaused,trackMuted:state.trackMuted,recorderError:state.recorderError,consultToolCall:Boolean(call),workflowWitness:workflow.witness,earlyProgress:early,finalProof,initialUserText,visibleUiBeforeFinal:Boolean(visible),rtcStats,microphoneEnergyWindows:state.microphoneEnergyWindows,nativePublicDiagnostics:diagnostics,toolCompletionReceipts,decodedAudio:{blobBytes:recording.blobBytes,pcmBytes:pcm.length,pcmSha256:hash(pcm),rmsPcm16:rms,peakPcm16:peak,durationSeconds:pcm.length/96000,evidenceDir},closed,sharedBeforePid:beforePid,sharedAfterPid:pid(),sharedConfigUnchanged:hash(fs.readFileSync(configPath))===beforeConfigHash,sharedOverlaysUnchanged:JSON.stringify(overlayHashes())===JSON.stringify(beforeOverlayHashes),syntheticTranscriptEvents:state.events,energyWindows:state.energyWindows,uiSnapshots:state.ui,apiEvents:state.apis,toolEvents:state.tools,humanListeningAccepted:false,acceptanceCase:'fixed child spawn/yield/automatic parent resume with exec-generated marker'};
  fs.writeFileSync(path.join(evidenceDir,'receipt.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600});
  process.stdout.write(JSON.stringify({gptLiveH5:summary})+'\n');
  assert.equal(state.connectionState,'connected');assert.equal(state.channelState,'open');assert(!state.audioPaused&&rms>30,'H5 playback/decoded PCM missing');
  assert(state.microphoneEnergyWindows.length>0&&rtcStats.some(row=>row.type==='outbound-rtp'&&row.bytesSent>1000),'Actual synthetic microphone PCM/RTP missing');
  assert(workflow.witness.markerExecCallId&&workflow.witness.marker&&workflow.witness.markerGeneratedByExec,'Actual unpredictable exec-generated marker missing');
  assert(initialUserText.length>10,'Actual synthetic user transcript missing');
  assert(workflow.witness.spawnAccepted&&workflow.witness.yielded&&workflow.witness.childExecCallId&&workflow.witness.parentResumedWithResult,'Actual spawn → yield → child exec → parent resume path incomplete');
  assert.equal(early.status,'observed','Public callback → successful native append → early marker transcript/nonzero PCM missing');
  assert(visible,'Marker UI before backend final missing');
  assert.equal(finalProof.finalTimestampStatus,'match','Complete exec/backend/native date-time mismatch or manual check required');
  assert(finalProof.finalMarkerMatches,'Original marker missing from final native transcript');
  assert.equal(finalProof.finalAppendCount,1,'Backend yield/final appended more than once');
  assert.equal(finalProof.repeatedPublicAppends,0,'Mirrored public progress appended again');
  assert(closed.closeApi&&closed.connectionState==='closed'&&closed.allMicrophoneTracksEnded&&closed.remoteAudioDetached,'Actual H5 end-call cleanup incomplete');
  assert.equal(summary.sharedAfterPid,beforePid);assert(summary.sharedConfigUnchanged&&summary.sharedOverlaysUnchanged,'Gateway deployment changed during acceptance');

}catch(error){
  const message=error.message.replace(/(token|api.?key|authorization|secret|password)[=: ]+[^\s]+/giu,'$1=[redacted]').replace(/[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{10,}/gu,'[redacted JWT]');
  const partial=cdp?await evaluate(`(()=>{const p=globalThis.__sharedH5Smoke;return p?{events:p.events,tools:p.tools,apis:p.apis,ui:p.ui,energyWindows:p.energyWindows,microphoneEnergyWindows:p.microphoneEnergyWindows,connectionState:p.pcs[0]?.connectionState,channelState:p.channel?.readyState}:null})()`).catch(()=>null):null;
  const failure={error:message,chromeErrors,partial,summaryWritten:Boolean(summary),sharedBeforePid:beforePid,sharedAfterPid:pid()};
  fs.writeFileSync(path.join(evidenceDir,'failure.json'),JSON.stringify(failure,null,2)+'\n',{mode:0o600});
  process.stderr.write(JSON.stringify({error:message,failureEvidence:path.join(evidenceDir,'failure.json'),chromeErrors})+'\n');process.exitCode=1;
}
finally{
  if(cdp){await evaluate(`(async()=>{const p=globalThis.__sharedH5Smoke;document.getElementById('stop')?.click();if(p){clearInterval(p.energyTimer);clearInterval(p.microphoneEnergyTimer);if(p.recorder?.state==='recording')p.recorder.stop();await p.context?.close().catch(()=>{});await p.microphoneContext?.close().catch(()=>{})}})()`).catch(()=>{});const until=Date.now()+10000;while(Date.now()<until){const closed=await evaluate(`(()=>{const p=globalThis.__sharedH5Smoke;return !p?.apis.some(item=>item.route==='/api/session'&&item.status===200)||p.apis.some(item=>item.route==='/api/close'&&item.status===200)})()`).catch(()=>true);if(closed)break;await sleep(200)}}
  const cleanup=cdp?await evaluate(`(()=>{const p=globalThis.__sharedH5Smoke;return {pcStates:p?.pcs.map(pc=>pc.connectionState),microphoneEnded:p?.streams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended')),closeApi:p?.apis.some(item=>item.route==='/api/close'&&item.status===200),remoteAudioDetached:document.querySelector('#remoteAudio')?.srcObject===null}})()`).catch(()=>null):null;
  cdp?.close();await stopChrome();gateway?.stop();fs.rmSync(browserDir,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  fs.writeFileSync(path.join(evidenceDir,'cleanup.json'),JSON.stringify({cleanup,chromeExited:chrome?.exitCode!==null||chrome?.signalCode!==null,gatewayPidUnchanged:pid()===beforePid,configUnchanged:hash(fs.readFileSync(configPath))===beforeConfigHash,overlaysUnchanged:JSON.stringify(overlayHashes())===JSON.stringify(beforeOverlayHashes)},null,2)+'\n',{mode:0o600});
}
