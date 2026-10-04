import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {configureCandidateOpenAIAuth,installCandidateOpenAIAuth} from './gpt-live-call-live-auth.mjs';
import {GPT_LIVE_CALL_INSTRUCTIONS} from './gpt-live-h5/instructions.mjs';
import {assessEarlyProgress,assessFinalTimestamp} from './gpt-live-call-live-evidence.mjs';

const runtime=process.env.VLAB_CANDIDATE_RUNTIME;
const configPath=process.env.OPENCLAW_CONFIG_PATH;
const stateDir=process.env.OPENCLAW_STATE_DIR;
assert(runtime&&configPath&&stateDir,'candidate environment required');
// The shared service's TMPDIR belongs to its own UID. Scratch files for this
// root-owned candidate must stay under the disposable private state instead.
const scratch=path.join(stateDir,'tmp');
fs.mkdirSync(scratch,{recursive:true,mode:0o700});
for(const key of ['TMPDIR','TMP','TEMP'])process.env[key]=scratch;
process.env.XDG_CACHE_HOME=path.join(stateDir,'cache');
fs.mkdirSync(process.env.XDG_CACHE_HOME,{recursive:true,mode:0o700});
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
config.logging={...(config.logging??{}),file:path.join(stateDir,'candidate-gateway.log')};
const port=Number(config.gateway?.port);
const token=config.gateway?.auth?.token;
assert(Number.isInteger(port)&&typeof token==='string');
config.talk={...(config.talk??{}),realtime:{...(config.talk?.realtime??{}),provider:'openai',model:'gpt-live-1-codex',mode:'realtime',transport:'webrtc',brain:'agent-consult',speakerVoice:'sol',
  providers:{...(config.talk?.realtime?.providers??{}),openai:{model:'gpt-live-1-codex',voice:'sol',speakerVoice:'sol'}}}};
config.talk.realtime.instructions=GPT_LIVE_CALL_INSTRUCTIONS;
configureCandidateOpenAIAuth(config);
config.channels={};
config.cron={...(config.cron??{}),enabled:false};
const allowed=new Set(['vlab-agent-worker-isolation','deepseek','openai','xai']);
if(config.plugins?.entries)config.plugins.entries=Object.fromEntries(Object.entries(config.plugins.entries).filter(([id])=>allowed.has(id)));
if(Array.isArray(config.plugins?.allow))config.plugins.allow=config.plugins.allow.filter(id=>allowed.has(id));
const worker=config.plugins?.entries?.['vlab-agent-worker-isolation']?.config;
assert(worker?.workerConfigPath,'worker config missing');
const relative=path.relative(stateDir,worker.workerConfigPath);
assert(!relative.startsWith('..'),'worker config outside candidate');
const source=path.join(process.env.VLAB_SHARED_STATE_DIR,relative);
const workerConfig=fs.readFileSync(source,'utf8')
  .replaceAll(process.env.VLAB_SHARED_STATE_DIR,stateDir)
  .replaceAll('/srv/vlab-production-mirror/labs/instances/db91-parity/runtime',runtime);
fs.mkdirSync(path.dirname(worker.workerConfigPath),{recursive:true});
fs.writeFileSync(worker.workerConfigPath,workerConfig,{mode:0o600});
worker.gatewayConfigPath=configPath;
fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n',{mode:0o600});

// Candidate-only instrumentation around actual native socket sends. The three
// delivered overlays remain unchanged in the worktree; no shared runtime writes.
const nativePath=path.join(runtime,'openclaw/dist/realtime-quicksilver-delegation-controller-B0yPpiHp.js');
let nativeText=fs.readFileSync(nativePath,'utf8');
const progressCall='this.sendAppend(delegation.id, progress.text.trim(), "speakable");';
const finalCall='this.sendAppend(delegation.id, text, "speakable");';
assert(nativeText.includes(progressCall)&&nativeText.includes(finalCall),'native progress overlay missing');
nativeText=nativeText.replace(progressCall,'this.sendAppend(delegation.id, progress.text.trim(), "speakable", "progress");')
 .replace(finalCall,'this.sendAppend(delegation.id, text, "speakable", "final");')
 .replace('sendAppend(delegationId, text, channel) {','sendAppend(delegationId, text, channel, phase = "other") {');
const sendAnchor='\t\tfor (const chunk of chunkOpenAIQuicksilverAppendText(text)) socket.send(JSON.stringify({';
assert(nativeText.includes(sendAnchor),'native socket send anchor missing');
nativeText=nativeText.replace(sendAnchor,'\t\tfor (const chunk of chunkOpenAIQuicksilverAppendText(text)) { socket.send(JSON.stringify({');
const endAnchor='\t\t}));\n\t}\n\tfail(error)';
assert(nativeText.includes(endAnchor),'native socket send end missing');
nativeText=nativeText.replace(endAnchor,'\t\t})); console.log("GPT_LIVE_APPEND_TRACE "+JSON.stringify({at:Date.now(),phase,delegationId,channel,chars:chunk.length,text:chunk.slice(0,400)})); }\n\t}\n\tfail(error)');
fs.writeFileSync(nativePath,nativeText);
const syntax=spawnSync(process.execPath,['--check',nativePath],{encoding:'utf8'});
assert.equal(syntax.status,0,syntax.stderr);
const harnessPath=path.join(runtime,'openclaw/dist/realtime-session-harness-CEO5kVAJ.js');
let harnessText=fs.readFileSync(harnessPath,'utf8');
assert(harnessText.includes('let lastPublicSnapshot = "";'),'cross-hook public snapshot overlay missing');
const observerAnchor='    const previousText = previousTextBySource.get(source) ?? "";';
assert(harnessText.includes(observerAnchor),'public observer anchor missing');
harnessText=harnessText.replace(observerAnchor,observerAnchor+'\n    console.log("GPT_LIVE_PUBLIC_SNAPSHOT_TRACE "+JSON.stringify({at:Date.now(),source,publicSnapshotType:source === "reply" ? "partial-reply" : "agent-preamble",itemId:source.startsWith("preamble:") ? source.slice(9) : null,textChars:text.length,sameSourceDuplicate:text === previousText,sameSnapshotDuplicate:text.replace(/\\s+/gu," ") === lastPublicSnapshot}));');
fs.writeFileSync(harnessPath,harnessText);
const harnessSyntax=spawnSync(process.execPath,['--check',harnessPath],{encoding:'utf8'});
assert.equal(harnessSyntax.status,0,harnessSyntax.stderr);
const appendTraces=[];
const publicSnapshotTraces=[];
const logs=[];
// Initialize one empty private agent DB with the baseline's native schema owner.
// Gateway boot/catalog reads do not create this DB in the current release.
const {g:openAgentDatabase,a:closeAgentDatabases}=await import(`${runtime}/openclaw/dist/openclaw-agent-db-CUTe8BX6.js`);
const privateAgentDb=path.join(stateDir,'agents/makaron/agent/openclaw-agent.sqlite');
fs.mkdirSync(path.dirname(privateAgentDb),{recursive:true,mode:0o700});
openAgentDatabase({agentId:'makaron',path:privateAgentDb,env:process.env});
closeAgentDatabases();
installCandidateOpenAIAuth();
function launchGateway(){
  const child=spawn(process.execPath,['--max-old-space-size=4096',`${runtime}/openclaw/dist/index.js`,'gateway','--port',String(port)],{
    env:{...process.env,OPENCLAW_GATEWAY_PORT:String(port)},stdio:['ignore','pipe','pipe'],
  });
  for(const stream of [child.stdout,child.stderr]){
    stream.setEncoding('utf8');
    let remainder='';
    stream.on('data',chunk=>{
      const lines=(remainder+chunk).split(/\r?\n/u);remainder=lines.pop()??'';
      for(const line of lines.filter(Boolean)){
        logs.push(line);
        const marker=line.indexOf('GPT_LIVE_APPEND_TRACE ');
        if(marker>=0){try{appendTraces.push(JSON.parse(line.slice(marker+'GPT_LIVE_APPEND_TRACE '.length)))}catch{}}
        const publicMarker=line.indexOf('GPT_LIVE_PUBLIC_SNAPSHOT_TRACE ');
        if(publicMarker>=0){try{publicSnapshotTraces.push(JSON.parse(line.slice(publicMarker+'GPT_LIVE_PUBLIC_SNAPSHOT_TRACE '.length)))}catch{}}
      }
      if(logs.length>100)logs.splice(0,logs.length-100);
    });
  }
  return child;
}
let gateway=launchGateway();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let client;
let chrome;
const chromeLogs=[];
let pageServer;
let cdp;
let reservation;
let sessionKey;
// Chromium's singleton Unix socket must fit the OS path limit. Candidate state
// paths are long; use a uniquely owned short scratch path for this browser only.
const browserDir=fs.mkdtempSync('/tmp/gpt-live-call-');
const gatewayEvents=[];
const agentEvents=[];
class CdpClient{
  constructor(url){this.url=url;this.pending=new Map();this.nextId=1}
  async connect(){
    this.socket=new WebSocket(this.url);
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('CDP connect timeout')),10000);
      this.socket.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true});
      this.socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('CDP connect error'))},{once:true});
    });
    this.socket.addEventListener('message',event=>{
      const message=JSON.parse(String(event.data));
      if(!message.id)return;
      const pending=this.pending.get(message.id);
      if(!pending)return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if(message.error)pending.reject(new Error(message.error.message));
      else pending.resolve(message.result??{});
    });
    this.socket.addEventListener('close',()=>this.rejectPending(new Error('CDP closed')));
    this.socket.addEventListener('error',()=>this.rejectPending(new Error('CDP socket error')));
  }
  request(method,params={},timeoutMs=20000){
    const id=this.nextId++;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`CDP ${method} timeout`))},timeoutMs);
      this.pending.set(id,{resolve,reject,timer});
      try{this.socket.send(JSON.stringify({id,method,params}))}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error)}
    });
  }
  rejectPending(error){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error)}this.pending.clear()}
  close(){this.rejectPending(new Error('CDP client closed'));this.socket?.close()}
}
async function evaluate(expression){
  const r=await cdp.request('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text??'browser evaluation failed');
  return r.result?.value;
}
async function waitForFile(file,ms){
  const deadline=Date.now()+ms;
  while(Date.now()<deadline){if(fs.existsSync(file))return;await sleep(100)}
  throw new Error(`missing ${path.basename(file)}`);
}
async function connectGateway(GatewayClient){
  const until=Date.now()+90000;
  let lastError;
  let migrationRestarted=false;
  const logStart=logs.length;
  while(Date.now()<until){
    try{
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{client?.stop();reject(new Error('candidate gateway hello timeout'))},5000);
        client=new GatewayClient({url:`ws://127.0.0.1:${port}`,token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.write','operator.admin'],onEvent:event=>{
          if(event?.event==='talk.event'&&event.payload)gatewayEvents.push({at:Date.now(),...event.payload});
          if(event?.event==='agent'&&event.payload){const p=event.payload,d=p.data??{};agentEvents.push({at:Date.now(),runId:p.runId,stream:p.stream,name:d.name,phase:d.phase,kind:d.kind,text:typeof d.progressText==='string'?d.progressText.slice(0,400):undefined});}
        },onHelloOk:()=>{clearTimeout(timer);resolve()},onConnectError:error=>{clearTimeout(timer);reject(error)}});
        client.start();
      });
      lastError=null;
      break;
    }catch(error){
      lastError=error;client?.stop();
      if(gateway.exitCode!==null){
        if(!migrationRestarted&&logs.slice(logStart).some(line=>line.includes('plugin migration inputs changed during startup convergence'))){
          gateway=launchGateway();migrationRestarted=true;await sleep(1000);continue;
        }
        break;
      }
      await sleep(500);
    }
  }
  if(lastError)throw lastError;
}
async function stopGateway(){
  if(gateway.exitCode!==null)return;
  const exited=new Promise(resolve=>gateway.once('exit',resolve));
  gateway.kill('SIGTERM');
  await Promise.race([exited,sleep(10000)]);
  if(gateway.exitCode===null)gateway.kill('SIGKILL');
}
async function stopChrome(){
  if(!chrome?.pid)return;
  // This browser owns a separate process group; stop its profile-writing
  // children as well as the parent before deleting the private scratch path.
  const signalGroup=signal=>{try{process.kill(-chrome.pid,signal)}catch(error){if(error.code!=='ESRCH')throw error}};
  const exited=chrome.exitCode!==null||chrome.signalCode!==null?Promise.resolve():new Promise(resolve=>chrome.once('exit',resolve));
  signalGroup('SIGTERM');
  await Promise.race([exited,sleep(5000)]);
  signalGroup('SIGKILL');
  await Promise.race([exited,sleep(2000)]);
  await sleep(100);
}
try{
  const {GatewayClient}=await import(`${runtime}/openclaw/dist/plugin-sdk/gateway-runtime.js`);
  await connectGateway(GatewayClient);
  const catalog=await client.request('talk.catalog',{}, {timeoutMs:15000});
  const providers=(catalog.realtime?.providers??[]).map(x=>({id:x.id,configured:Boolean(x.configured),transport:x.transport??null,models:(x.models??[]).map(m=>typeof m==='string'?m:m.id).filter(Boolean)}));
  assert(providers.some(x=>x.id==='openai'&&x.configured&&x.models.includes('gpt-live-1-codex')),'GPT Live provider unavailable');
  sessionKey=`agent:makaron:explicit:candidate-gpt-live-${Date.now()}`;
  const createdAt=Date.now();
  reservation=await client.request('talk.client.create',{sessionKey,mode:'realtime',transport:'webrtc',brain:'agent-consult',provider:'openai',model:'gpt-live-1-codex',voice:'sol',capabilities:['voice-transcript']},{timeoutMs:30000});
  assert.equal(reservation.transport,'webrtc');
  assert.equal(typeof reservation.offerUrl,'string');
  assert.equal(typeof reservation.clientSecret,'string');

  pageServer=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><title>candidate voice input</title>')});
  await new Promise(resolve=>pageServer.listen(0,'127.0.0.1',resolve));
  const webPort=pageServer.address().port;
  chrome=spawn('/usr/bin/google-chrome',[
    '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-features=AudioServiceSandbox',
    '--remote-debugging-port=0',`--user-data-dir=${path.join(browserDir,'profile')}`,
    '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${path.resolve(process.env.GPT_LIVE_CALL_AUDIO_FIXTURE)}`,
    '--autoplay-policy=no-user-gesture-required','about:blank',
  ],{env:{...process.env,TMPDIR:browserDir,TMP:browserDir,TEMP:browserDir},detached:true,stdio:['ignore','pipe','pipe']});
  for(const output of [chrome.stdout,chrome.stderr])output.on('data',chunk=>{
    chromeLogs.push(String(chunk).slice(-3000));
    if(chromeLogs.length>12)chromeLogs.shift();
  });
  await waitForFile(path.join(browserDir,'profile','DevToolsActivePort'),20000);
  const [debugPort]=fs.readFileSync(path.join(browserDir,'profile','DevToolsActivePort'),'utf8').split(/\r?\n/u);
  const targets=await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r=>r.json());
  const target=targets.find(x=>x.type==='page');
  assert(target?.webSocketDebuggerUrl,'Chrome page target missing');
  cdp=new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.request('Page.enable');
  await cdp.request('Runtime.enable');
  await cdp.request('Page.navigate',{url:`http://127.0.0.1:${webPort}/`});
  await sleep(500);
  const offer=await evaluate(`(async()=>{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    const pc=new RTCPeerConnection();
    globalThis.__candidate={pc,events:[],energyWindows:[],audioWindows:0,firstAudioAt:null,firstEventAt:null,trackAt:null,startedAt:Date.now()};
    for(const track of stream.getAudioTracks())pc.addTrack(track,stream);
    const channel=pc.createDataChannel('oai-events');
    globalThis.__candidate.channel=channel;
    channel.onmessage=e=>{try{
      const d=JSON.parse(e.data);
      const item=d.item&&typeof d.item==='object'?d.item:{};
      const delta=d.delta&&typeof d.delta==='object'?d.delta:{};
      const text=d.transcript||d.text||item.text||item.transcript||delta.text||d.turn?.transcript||d.turn?.text||'';
      globalThis.__candidate.events.push({at:Date.now(),type:d.type,keys:Object.keys(d),itemKeys:Object.keys(item),deltaKeys:Object.keys(delta),
        itemId:typeof item.id==='string'?item.id:null,turnId:typeof d.turn_id==='string'?d.turn_id:typeof d.turn?.id==='string'?d.turn.id:null,
        role:d.turn?.role||d.item?.role||null,startMs:d.start_ms??d.turn?.start_ms??null,endMs:d.end_ms??d.turn?.end_ms??null,
        deltaType:typeof d.delta,deltaLength:typeof d.delta==='string'?d.delta.length:Array.isArray(d.delta)?d.delta.length:null,
        sessionKeys:d.session&&typeof d.session==='object'?Object.keys(d.session):[],
        turnKeys:d.turn&&typeof d.turn==='object'?Object.keys(d.turn):[],text});
      globalThis.__candidate.firstEventAt??=Date.now();
    }catch{}};
    pc.ontrack=e=>{
      globalThis.__candidate.trackAt=Date.now();globalThis.__candidate.track=e.track;
      // Attach the actual remote stream to a playing sink, as the H5 user path
      // does; receiving RTP alone does not guarantee that Chromium pulls PCM.
      const audio=document.createElement('audio');audio.autoplay=true;
      audio.srcObject=new MediaStream([e.track]);document.body.append(audio);
      globalThis.__candidate.audioElement=audio;void audio.play().catch(()=>{});
      const recorder=new MediaRecorder(new MediaStream([e.track]),{mimeType:'audio/webm;codecs=opus'});
      globalThis.__candidate.recorder=recorder;globalThis.__candidate.recordedChunks=[];
      recorder.ondataavailable=event=>{if(event.data.size)globalThis.__candidate.recordedChunks.push(event.data)};
      recorder.onerror=event=>{globalThis.__candidate.recorderError=event.error?.message||'recorder error'};
      recorder.start(1000);
      const ctx=new AudioContext();globalThis.__candidate.audioCtx=ctx;
      const source=ctx.createMediaStreamSource(new MediaStream([e.track]));
      const analyser=ctx.createAnalyser();analyser.fftSize=2048;source.connect(analyser);
      const gain=ctx.createGain();gain.gain.value=0;analyser.connect(gain);gain.connect(ctx.destination);void ctx.resume();
      const buf=new Uint8Array(analyser.fftSize);
      setInterval(()=>{analyser.getByteTimeDomainData(buf);let sum=0;for(const v of buf)sum+=(v-128)*(v-128);
        const rms=Math.sqrt(sum/buf.length);
        if(rms>2){const c=globalThis.__candidate;c.audioWindows++;c.firstAudioAt??=Date.now();c.energyWindows.push({at:Date.now(),rms})}},100);
    };
    const offer=await pc.createOffer();await pc.setLocalDescription(offer);
    await new Promise(resolve=>{if(pc.iceGatheringState==='complete')return resolve();
      const t=setTimeout(resolve,10000);pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete'){clearTimeout(t);resolve()}})});
    return pc.localDescription.sdp;
  })()`);
  assert(offer?.startsWith('v=0'),'WebRTC offer missing');
  const answerResponse=await fetch(`http://127.0.0.1:${port}${reservation.offerUrl}`,{
    method:'POST',headers:{Authorization:`Bearer ${reservation.clientSecret}`,'Content-Type':'application/sdp'},body:offer,signal:AbortSignal.timeout(25000),
  });
  const answer=await answerResponse.text();
  assert(answerResponse.ok,`SDP answer status=${answerResponse.status}`);
  assert(answer.startsWith('v=0'),'SDP answer missing');
  await evaluate(`globalThis.__candidate.pc.setRemoteDescription({type:'answer',sdp:${JSON.stringify(answer)}})`);
  const mediaStartedAt=Date.now();
  const observeDeadline=Date.now()+90000;
  let state;
  while(Date.now()<observeDeadline){
    await sleep(1000);
    state=await evaluate(`(async()=>{const c=globalThis.__candidate;const stats=await c.pc.getStats();let inboundAudioBytes=0,outboundAudioBytes=0,totalAudioEnergy=0,totalSamplesReceived=0,packetsReceived=0,audioLevel=0;
      for(const s of stats.values()){if((s.kind||s.mediaType)==='audio'&&s.type==='inbound-rtp'){
          inboundAudioBytes+=s.bytesReceived||0;totalAudioEnergy+=s.totalAudioEnergy||0;totalSamplesReceived+=s.totalSamplesReceived||0;
          packetsReceived+=s.packetsReceived||0;audioLevel=Math.max(audioLevel,s.audioLevel||0)}
        if((s.kind||s.mediaType)==='audio'&&s.type==='outbound-rtp')outboundAudioBytes+=s.bytesSent||0}
      return {connectionState:c.pc.connectionState,iceConnectionState:c.pc.iceConnectionState,channelState:c.channel.readyState,audioWindows:c.audioWindows,
        firstAudioAt:c.firstAudioAt,firstEventAt:c.firstEventAt,trackAt:c.trackAt,trackMuted:c.track?.muted??null,trackState:c.track?.readyState??null,audioContextState:c.audioCtx?.state||null,
        recorderState:c.recorder?.state??null,recorderError:c.recorderError??null,audioPaused:c.audioElement?.paused??null,
        inboundAudioBytes,outboundAudioBytes,totalAudioEnergy,totalSamplesReceived,packetsReceived,audioLevel,events:c.events.slice(-1000),energyWindows:c.energyWindows.slice(-1000)}})()`);
    const finalTrace=appendTraces.find(x=>x.phase==='final');
    const finalVoiceTurnDone=finalTrace&&state.events.some(x=>x.type==='turn.done'&&x.role==='assistant'&&x.at>=finalTrace.at);
    if(finalVoiceTurnDone&&gatewayEvents.some(x=>x.talkEvent?.type==='tool.result')&&state.inboundAudioBytes>10000&&Date.now()-appendTraces.at(-1).at>2000)break;
  }
  const gatewayTypes=gatewayEvents.filter(x=>x.voiceSessionId===reservation.voiceSessionId).map(x=>x.talkEvent?.type??x.type).filter(Boolean);
  const eventTypes=state.events.map(x=>x.type);
  const assistantText=state.events.filter(x=>/output_transcript|output_audio_transcript|output_text/.test(x.type)).map(x=>x.text).join(' ').trim();
  let decoded;
  try{
    const recording=await evaluate(`(async()=>{const c=globalThis.__candidate;const r=c.recorder;
      if(!r)return {error:'recorder absent'};
      if(r.state!=='inactive')await new Promise(resolve=>{r.addEventListener('stop',resolve,{once:true});r.stop()});
      const blob=new Blob(c.recordedChunks,{type:'audio/webm;codecs=opus'});
      const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
      for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
      return {blobBytes:blob.size,base64:btoa(binary)};
    })()`);
    if(recording?.error)throw new Error(recording.error);
    const file=path.join(browserDir,'answer.webm');
    fs.writeFileSync(file,Buffer.from(recording.base64,'base64'),{mode:0o600});
    const ff=spawnSync('/usr/bin/ffmpeg',['-hide_banner','-loglevel','error','-i',file,'-f','s16le','-ar','48000','-ac','1','pipe:1'],{maxBuffer:16*1024*1024});
    if(ff.status!==0)throw new Error(`ffmpeg decode failed: blobBytes=${recording.blobBytes} head=${fs.readFileSync(file).subarray(0,16).toString('hex')} ${String(ff.stderr).slice(0,100)}`);
    const pcm=ff.stdout;let peak=0,energy=0;
    for(let i=0;i+1<pcm.length;i+=2){const v=pcm.readInt16LE(i);peak=Math.max(peak,Math.abs(v));energy+=v*v}
    const evidenceDir=path.join(process.env.GPT_LIVE_CALL_EVIDENCE_ROOT,process.env.VLAB_CANDIDATE_ID);
    fs.mkdirSync(evidenceDir,{recursive:true,mode:0o700});
    fs.copyFileSync(file,path.join(evidenceDir,'answer.webm'));
    fs.writeFileSync(path.join(evidenceDir,'answer.pcm'),pcm,{mode:0o600});
    const wav=spawnSync('/usr/bin/ffmpeg',['-hide_banner','-loglevel','error','-y','-f','s16le','-ar','48000','-ac','1','-i',path.join(evidenceDir,'answer.pcm'),path.join(evidenceDir,'answer.wav')],{encoding:'utf8'});
    assert.equal(wav.status,0,'PCM WAV materialization failed');
    decoded={blobBytes:recording.blobBytes,pcmBytes:pcm.length,pcmSha256:createHash('sha256').update(pcm).digest('hex'),peakPcm16:peak,rmsPcm16:Math.sqrt(energy/(pcm.length/2)),evidenceDir};
  }catch(error){decoded={error:error.message}}
  const progress=appendTraces.filter(x=>x.phase==='progress');
  const finals=appendTraces.filter(x=>x.phase==='final');
  const progressEnergyWindows=state.energyWindows.filter(x=>progress[0]&&finals[0]&&x.at>=progress[0].at&&x.at<finals[0].at);
  const earlyProgress=assessEarlyProgress(appendTraces,state.events,state.energyWindows);
  const finalTimestamp=assessFinalTimestamp(appendTraces,state.events);
  const progressMirrors=[];
  let accumulatedProgress='';
  for(const entry of progress){
    const compact=entry.text.replace(/\s+/gu,'');
    if(compact.length>20&&accumulatedProgress.endsWith(compact))progressMirrors.push({at:entry.at,chars:entry.chars});
    accumulatedProgress+=compact;
  }
  let execHistoryWitness=null;
  try{
    const history=await client.request('chat.history',{sessionKey,limit:30},{timeoutMs:10000});
    const messages=history.messages??[];
    for(const message of messages){
      for(const block of Array.isArray(message.content)?message.content:[]){
        const command=block.arguments?.command??block.args?.command;
        if(block.name==='exec'&&typeof command==='string'&&/^sleep\s+8\s*;\s*date\s*$/u.test(command)){
          const result=messages.find(m=>m.toolCallId===block.id||m.tool_call_id===block.id);
          const output=(Array.isArray(result?.content)?result.content:[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
          execHistoryWitness={command,callId:block.id,resultPresent:Boolean(result),dateOutput:/\b20[0-9]{2}\b/u.test(output)?output.slice(0,160):null};
        }
      }
    }
  }catch{}
  const summary={provider:'openai',model:'gpt-live-1-codex',webrtcState:state.connectionState,dataChannel:state.channelState,
    remoteTrackSeen:Boolean(state.trackAt),trackMuted:state.trackMuted,trackState:state.trackState,audioContextState:state.audioContextState,remoteAudioWindows:state.audioWindows,
    recorderState:state.recorderState,recorderError:state.recorderError,audioPaused:state.audioPaused,
    inboundAudioBytes:state.inboundAudioBytes,outboundAudioBytes:state.outboundAudioBytes,packetsReceived:state.packetsReceived,
    totalAudioEnergy:state.totalAudioEnergy,totalSamplesReceived:state.totalSamplesReceived,audioLevel:state.audioLevel,
    decodedAudio:decoded,
    createMs:mediaStartedAt-createdAt,firstAudioAfterOfferMs:state.firstAudioAt?state.firstAudioAt-mediaStartedAt:null,
    eventTypes:[...new Set(eventTypes)],eventShapes:[...new Set(state.events.map(x=>x.type+':'+x.keys.join(',')+':item='+x.itemKeys.join(',')+
      ':delta='+x.deltaType+'/'+x.deltaLength+'/'+x.deltaKeys.join(',')+':session='+x.sessionKeys.join(',')+':turn='+x.turnKeys.join(',')))].slice(0,15),
    gatewayTypes:[...new Set(gatewayTypes)],assistantChars:assistantText.length,
    assistantMentionsTime:/时间|2026|UTC|CST|[0-9]{2}:[0-9]{2}/.test(assistantText),
    nativeAppendTraces:appendTraces,
    publicSnapshotTraces,progressFullSnapshotMirrorCount:progressMirrors.length,progressFullSnapshotMirrors:progressMirrors,
    syntheticTranscriptEvents:state.events.filter(x=>/transcript|turn.done/u.test(x.type)).map(x=>({at:x.at,type:x.type,itemId:x.itemId,turnId:x.turnId,role:x.role,startMs:x.startMs,endMs:x.endMs,text:x.text})),
    progressOutputBeforeFinal:earlyProgress.status==='observed',earlyProgressEvidence:earlyProgress,finalTimestampAccuracy:finalTimestamp,
    progressRemoteEnergyWindows:progressEnergyWindows,execHistoryWitness,
    progressBeforeFinal:progress.length>0&&finals.length>0&&progress[0].at<finals[0].at,
    finalAppendCount:finals.length,agentEventSummary:agentEvents,
    actualConsultToolStarted:gatewayTypes.includes('tool.call'),actualConsultToolFinished:gatewayTypes.includes('tool.result'),
    transportEvidenceOnly:true,humanListeningAccepted:false,
  };
  process.stdout.write(JSON.stringify({gptLiveCallLive:summary})+'\n');
  assert.equal(state.connectionState,'connected');
  assert(state.inboundAudioBytes>1000&&decoded.rmsPcm16>30,'decoded remote audio energy not observed');
  assert(summary.actualConsultToolStarted&&summary.actualConsultToolFinished,'consult tool call/result pair not observed');
  assert(summary.progressBeforeFinal,'native public progress append before final not observed');
  assert(earlyProgress.status==='observed'&&progressEnergyWindows.length>0,'progress transcript prefix and remote PCM before final not observed');
  assert.equal(finalTimestamp.status,'match',finalTimestamp.status==='manual-required'?'final timestamp requires manual verification':'final spoken timestamp does not match backend final');
  assert(publicSnapshotTraces.length>0,'public observer diagnostic trace missing');
  assert.equal(progressMirrors.length,0,'public full snapshot mirror was appended twice');
  assert.equal(summary.finalAppendCount,1,'expected a single terminal native append');
}catch(error){
  process.stderr.write(`GPT Live call live candidate failed: ${error.message}\n`);
  process.stderr.write(`gateway exit=${gateway.exitCode} log lines=${logs.length}\n`);
  const safe=logs.slice(-20)
    .map(line=>line
      .replace(/(token|api.?key|authorization|secret|password)[=: ]+[^\s]+/giu,'$1=[redacted]')
      .replace(/(https?:\/\/)[^\s]+/giu,'$1[endpoint]')
      .slice(0,300));
  process.stderr.write(JSON.stringify({gatewayErrors:safe})+'\n');
  process.stderr.write(JSON.stringify({chromeExit:chrome?.exitCode??null,chromeErrors:chromeLogs.map(line=>line.replace(/(https?:\/\/)[^\s]+/giu,'$1[endpoint]').slice(-1200))})+'\n');
  process.exitCode=1;
}finally{
  if(client&&reservation?.voiceSessionId)await client.request('talk.client.close',{sessionKey,voiceSessionId:reservation.voiceSessionId},{timeoutMs:10000}).catch(()=>{});
  cdp?.close();
  try{
    await stopChrome();
    if(pageServer)await new Promise(resolve=>pageServer.close(resolve));
    fs.rmSync(browserDir,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }finally{client?.stop();await stopGateway()}
}
