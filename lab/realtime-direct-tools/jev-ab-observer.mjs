// Real original H5 + private physical browser audio graph. Synthetic USER input
// is fed into getUserMedia through a private PulseAudio source; replies and
// native function calls come only from the actual provider and Gateway.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {createPrivatePulseMicrophone} from '../gpt-live-candidate-native/private-pulse.mjs';
import {calendarOutcome} from './tools.mjs';
import {actualSpeakerIdle} from './playback-evidence.mjs';
import {measuredGatewayEvents,firstMeasuredToolStart} from './jev-benchmark-events.mjs';
const evidence=process.env.DIRECT_VOICE_EVIDENCE,ready=JSON.parse(fs.readFileSync(process.env.GPT_LIVE_H5_EXPERIENCE_READY));
assert(ready.candidateId===process.env.VLAB_CANDIDATE_ID&&ready.state==='ready'&&ready.reusable===true&&ready.expiresAt===null);
const identity=JSON.parse(fs.readFileSync(process.env.VOICE_BENCH_OWNER_PROOF));
assert(identity.owner===ready.owner&&identity.candidateId===ready.candidateId);
for(const service of identity.services){assert.equal(execFileSync('systemctl',['show',service.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),String(service.pid));assert.equal(fs.readFileSync('/proc/'+service.pid+'/stat','utf8').split(') ').at(-1).split(' ')[19],service.startTicks);assert(fs.readFileSync('/proc/'+service.pid+'/cgroup','utf8').includes('/'+service.unit));}
const clipManifest=JSON.parse(fs.readFileSync(process.env.DIRECT_VOICE_CLIPS+'/manifest.json'));
for(const c of clipManifest){assert.equal(createHash('sha256').update(fs.readFileSync(process.env.DIRECT_VOICE_CLIPS+'/'+c.name+'.wav')).digest('hex'),c.sha256);}

fs.mkdirSync(evidence,{mode:0o700});
const scratch=fs.mkdtempSync(path.join(process.env.OPENCLAW_STATE_DIR,'tmp/direct-smoke-'));
const clips=process.env.DIRECT_VOICE_CLIPS,auditPath=path.join(path.dirname(process.env.GPT_LIVE_H5_EXPERIENCE_READY),'direct-voice-audit.jsonl');
let chrome,chromeRoot,pulse,cdp,recorder,outputHandle,outputFile,gateway,ownedVoice;const gatewayEvents=[];const results=[],errors=[];
const save=(name,value)=>fs.writeFileSync(path.join(evidence,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
const audit=()=>fs.existsSync(auditPath)?fs.readFileSync(auditPath,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)):[];
class Cdp {
 constructor(url){this.url=url;this.next=1;this.pending=new Map();}
 async connect(){this.ws=new WebSocket(this.url);await new Promise((resolve,reject)=>{this.ws.addEventListener('open',resolve,{once:true});this.ws.addEventListener('error',reject,{once:true});});this.ws.addEventListener('message',event=>{const r=JSON.parse(event.data),p=this.pending.get(r.id);if(!p)return;this.pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);});}
 request(method,params={}){return new Promise((resolve,reject)=>{const id=this.next++,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout: '+method));},20000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
 close(){this.ws.close();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('observer closed'));}this.pending.clear();}
}
const evaluate=async expression=>{const r=await cdp.request('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
const state=()=>evaluate(`({state:document.body?.dataset.callState,badge:document.getElementById('badge')?.textContent,status:document.getElementById('status')?.textContent,transcript:document.getElementById('conversation')?.innerText,wire:globalThis.__directWire??[],native:globalThis.__nativeWire??[],sse:globalThis.__sseWire??[],sessions:globalThis.__sessions??[],duplex:globalThis.__gptLiveDuplexDiagnostics})`);
async function wait(predicate,label,ms=45000){const until=Date.now()+ms;while(Date.now()<until){const s=await state();if(await predicate(s))return s;await sleep(200);}throw Error(label+' deadline');}
async function click(id){const rect=await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});if(!e||e.disabled||e.hidden)throw Error('Button unavailable');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);for(const type of ['mousePressed','mouseReleased'])await cdp.request('Input.dispatchMouseEvent',{type,...rect,button:'left',clickCount:1});}
async function speak(name){const row={name,at:Date.now(),source:'private-real-getUserMedia-PCM'};results.push(row);await pulse.play(path.join(clips,name+'.wav'),name).done;row.completedAt=Date.now();}
function check(name,passed,details={}){const row={...details,name,passed:Boolean(passed),at:Date.now()};results.push(row);save('progress.json',{results,errors});console.log(JSON.stringify(row));}
function speakerTailRms(){if(!outputFile||!fs.existsSync(outputFile))return 1;const size=fs.statSync(outputFile).size;if(size<48000)return 1;const fd=fs.openSync(outputFile,'r'),b=Buffer.alloc(48000);try{fs.readSync(fd,b,0,b.length,size-b.length);}finally{fs.closeSync(fd);}let sum=0;for(let i=0;i<b.length;i+=2)sum+=(b.readInt16LE(i)/32768)**2;return Math.sqrt(sum/(b.length/2));}
async function quiet(id,ms=15000){return wait(()=>actualSpeakerIdle(audit().filter(x=>x.voiceSessionId===id),Date.now(),speakerTailRms()),'actual provider and FIFO-drained native speaker quiet',ms);}
async function stop(){const s=await state();if(s.state!=='idle'){assert(ownedVoice&&s.sessions.at(-1)?.voiceSessionId===ownedVoice,'Refuse closing a foreign/unowned call');await click('stop');}await wait(s=>s.state==='idle','original UI release',15000);ownedVoice=null;}
async function record(model){
 outputFile=path.join(evidence,model+'-speaker.pcm');outputHandle=fs.openSync(outputFile,'wx',0o600);
 recorder=spawn('/usr/bin/parec',['--device='+pulse.outputSink+'.monitor','--format=s16le','--rate=48000','--channels=1'],{env:pulse.environment,stdio:['ignore',outputHandle,'pipe']});
 recorder.stderr.on('data',b=>errors.push({kind:'recorder',text:String(b).slice(0,200)}));await sleep(250);
}
async function stopRecording(){if(recorder&&recorder.exitCode===null&&recorder.signalCode===null){const exited=new Promise(resolve=>recorder.once('exit',resolve));recorder.kill('SIGTERM');await Promise.race([exited,sleep(2000)]);assert(recorder.exitCode!==null||recorder.signalCode!==null,'Recorder did not exit');}if(outputHandle!==undefined)fs.closeSync(outputHandle);recorder=null;outputHandle=undefined;}

async function waitQuiet(model,id,after=0){
 if(model!=='gpt-live')return quiet(id,90000);
 return wait(s=>s.native.some(x=>x.type==='turn.done'&&x.turn?.role==='assistant'&&x.observedAt>after)&&speakerTailRms()<.003,'actual GPT speech and speaker quiet',90000);
}
async function runModel(model){
 await cdp.request('Page.navigate',{url:ready.publicOrigin+"/voice/?entry=tianyi#access="+encodeURIComponent(process.env.GPT_LIVE_H5_ACCESS_TOKEN)});await wait(s=>s.state==='idle'&&s.badge==='可以拨号','page idle');
 await evaluate(`document.getElementById('voiceModel').value=${JSON.stringify(model)}`);
 await record(model);const dialAt=Date.now();await click('start');await wait(s=>s.state==='connected','provider ready',45000);
 ownedVoice=(await state()).sessions.at(-1)?.voiceSessionId;assert(ownedVoice,'Actual owned session receipt absent');const id=ownedVoice;
 if(model==='gpt-live'){
  await wait(s=>s.duplex?.counts?.['greeting-ready-accepted']===1,'actual GPT host readiness',20000);
  // Host readiness is not the end of the actual greeting audio. Keep this
  // pre-input wait outside the measurement and never talk over active output.
  await sleep(10000);
  const g=await state();const greetingObserved=g.native.some(x=>x.type==='turn.done'&&x.turn?.role==='assistant');
  save(model+'-greeting-observation.json',{greetingObserved,wire:g});
  if(greetingObserved || speakerTailRms()>=.003)await waitQuiet(model,id,dialAt);
  else {assert(speakerTailRms()<.003,'Cannot inject USER over unknown playback');check(model+'/greeting-missing',false,{hostReady:true,scope:'greeting remains FAIL; independent first-USER benchmark continues'});}
 } else await waitQuiet(model,id,dialAt);
 await sleep(500);
 const utteranceStart=Date.now();await speak('simple');const inputEnd=Date.now();
 const events=()=>measuredGatewayEvents(gatewayEvents,{since:utteranceStart,sessionKey:'agent:makaron:feishu:group:oc_adda79fa3d492cca82869c0c72bc62ae'});
 const direct=()=>audit().filter(x=>x.voiceSessionId===id&&x.at>=utteranceStart);
 const jevRows=()=>process.env.GPT_LIVE_VOICE_JEV_AUDIT_PATH&&fs.existsSync(process.env.GPT_LIVE_VOICE_JEV_AUDIT_PATH)?fs.readFileSync(process.env.GPT_LIVE_VOICE_JEV_AUDIT_PATH,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)).filter(x=>x.voiceSessionId===id&&x.at>=utteranceStart):[];
 const memory=()=>model==='gpt-live'?(jevRows().find(x=>x.type==='tool.invoke'&&x.name==='memory_search')??firstMeasuredToolStart(events(),'memory_search')):direct().find(x=>x.type==='tool.invoke'&&x.name==='memory_search');
 await wait(()=>memory(),'actual memory tool start',90000);
 let delivered;
 if(model==='gpt-live'){
  const call=memory();
  if(call.callId){
   // Presentation may arrive through the real HTTP polling fallback, with no
   // SSE message. Require the actual tool return and the provider's matching
   // native delegation-context ACK rather than an invented UI event.
   const returned=()=>jevRows().find(x=>x.type==='tool.native-result'&&x.callId===call.callId);
   await wait(s=>returned()&&s.native.some(x=>x.type==='delegation.context.appended'&&x.delegation_item_id===call.callId&&x.observedAt>=returned().at),'actual GPT tool result and native context receipt',90000);
   delivered=(await state()).native.find(x=>x.type==='delegation.context.appended'&&x.delegation_item_id===call.callId&&x.observedAt>=returned().at).observedAt;
  }else{
   await wait(s=>s.sse.some(x=>x.type==='tool.result'&&x.observedAt>utteranceStart),'actual GPT consult result',90000);
   delivered=(await state()).sse.find(x=>x.type==='tool.result'&&x.observedAt>utteranceStart)?.observedAt;
  }
 }else{
  const call=memory();await wait(()=>direct().some(x=>x.type==='tool.delivered'&&x.callId===call.callId),'actual memory delivered',90000);
  delivered=direct().find(x=>x.type==='tool.delivered'&&x.callId===call.callId).at;
 }
 const audioStart=model==='gpt-live'?null:await wait(()=>direct().some(x=>x.type==='audio'&&!x.source&&x.at>delivered),'actual response PCM after result',30000);
 // PCM recording is independently retained. Native turn timestamps are not promoted into an audible onset.
 await waitQuiet(model,id,delivered);const beforeEnd=await state();save(model+'-memory-observation.json',{id,utteranceStart,inputEnd,tool:memory(),delivered,wire:beforeEnd,gatewayEvents:events(),direct:direct(),speakerPcm:outputFile,audioOnsetMeasured:false,turnObserved:Boolean(audioStart)});
 check(model+'/memory',true,{id,inputEnd,toolAt:memory().at,toolStartMs:memory().at-inputEnd,deliveredMs:delivered-inputEnd,audioOnsetMeasured:false});
 await sleep(500);const endStart=Date.now();await speak('end');const endInputEnd=Date.now();await wait(s=>s.state==='idle','actual semantic end and playback drain',90000);
 const after=await state();save(model+'-end-observation.json',{id,endStart,endInputEnd,closedAt:Date.now(),wire:after,direct:direct(),gatewayEvents:events(),speakerPcm:outputFile});
 check(model+'/end',true,{id,endInputEnd,closeMs:Date.now()-endInputEnd,playback:model==='gpt-live'?after.duplex:direct().filter(x=>x.type==='client.playback-stats').at(-1)?.stats});
 ownedVoice=null;await stopRecording();
}
try {
 const config=JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH));const token=String(config.gateway.auth.token).replace(/\$\{([^}]+)\}/gu,(_,key)=>{assert(process.env[key]);return process.env[key]});const {GatewayClient}=await import(process.env.VLAB_CANDIDATE_RUNTIME+'/openclaw/dist/plugin-sdk/gateway-runtime.js');
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Gateway observer timeout')),15000);gateway=new GatewayClient({url:'ws://127.0.0.1:'+config.gateway.port,token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.write'],caps:['tool-events'],onHelloOk:()=>{clearTimeout(timer);resolve()},onConnectError:reject,onEvent:event=>{if(['agent','talk.event','chat','session.tool'].includes(event.event))gatewayEvents.push({at:Date.now(),event:event.event,payload:event.payload});}});gateway.start();});
 await gateway.request('sessions.subscribe',{}, {timeoutMs:10000});
 pulse=await createPrivatePulseMicrophone(path.join(scratch,'pulse'));
 // Chromium ProcessSingleton sockets must fit Linux's 107-byte AF_UNIX path.
 // Its real profile belongs to this observer, in a short fresh /tmp directory.
 chromeRoot=fs.mkdtempSync('/tmp/voice-direct-chrome-');fs.chmodSync(chromeRoot,0o700);const profile=path.join(chromeRoot,'profile');chrome=spawn('/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-features=AudioServiceSandbox','--remote-debugging-port=0','--window-size=1280,900','--user-data-dir='+profile,'--use-fake-ui-for-media-stream','about:blank'],{env:{...pulse.environment,TMPDIR:chromeRoot,TMP:chromeRoot,TEMP:chromeRoot},stdio:['ignore','ignore','pipe']});
 chrome.stderr.on('data',b=>fs.appendFileSync(path.join(evidence,'chrome.log'),b,{mode:0o600}));for(const until=Date.now()+10000;Date.now()<until&&!fs.existsSync(path.join(profile,'DevToolsActivePort'))&&chrome.exitCode===null&&chrome.signalCode===null;)await sleep(100);
 const port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);const targets=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());cdp=new Cdp(targets.find(x=>x.type==='page').webSocketDebuggerUrl);await cdp.connect();await cdp.request('Page.enable');
 await cdp.request('Page.addScriptToEvaluateOnNewDocument',{source:"globalThis.__directWire=[];globalThis.__nativeWire=[];globalThis.__sseWire=[];globalThis.__sessions=[];globalThis.__directMicRequests=0;\nconst originalFetch=fetch;globalThis.fetch=async(...args)=>{const r=await originalFetch(...args);if(String(args[0]).includes('/api/session')&&r.ok){r.clone().json().then(v=>{globalThis.__sessions.push({voiceSessionId:v.voiceSessionId,model:v.model,at:Date.now()});});}return r;};\nconst getMic=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=(...args)=>{globalThis.__directMicRequests++;return getMic(...args)};\nconst Native=WebSocket;globalThis.WebSocket=class extends Native{constructor(...args){super(...args);if(String(args[0]).includes('/api/relay'))this.addEventListener('message',e=>{try{const v=JSON.parse(e.data);if(v.type==='audio')v.audioBytes=Math.floor(v.audio.length*3/4);delete v.audio;globalThis.__directWire.push({...v,observedAt:Date.now()});}catch{}});}};\nconst NativeEventSource=EventSource;globalThis.EventSource=class extends NativeEventSource{constructor(...args){super(...args);this.addEventListener('message',e=>{try{globalThis.__sseWire.push({...JSON.parse(e.data),observedAt:Date.now()});}catch{}});}};\nconst channel=RTCPeerConnection.prototype.createDataChannel;RTCPeerConnection.prototype.createDataChannel=function(...args){const c=channel.apply(this,args);c.addEventListener('message',e=>{try{globalThis.__nativeWire.push({...JSON.parse(e.data),observedAt:Date.now()});}catch{}});return c;};"});
 const defaultCase=process.env.DIRECT_VOICE_CASES,modelCases=JSON.parse(process.env.DIRECT_VOICE_CASE_BY_MODEL??'{}');
 for(const model of (process.env.DIRECT_VOICE_MODELS??'seeduplex,grok,gpt-live').split(',')){
  process.env.DIRECT_VOICE_CASES=modelCases[model]??defaultCase;
  try{await runModel(model);}catch(error){errors.push({model,message:error.message,at:Date.now()});check(model+'/workflow',false,{error:error.message});save(model+'-failure-state.json',await state().catch(()=>null));await stop().catch(()=>{});await stopRecording();}
 }
} catch(error){errors.push({kind:'harness',message:error.message});}
finally {
 if(cdp)await stop().catch(()=>{});
 await stopRecording();if(cdp){await cdp.request('Browser.close').catch(()=>{});cdp.close();}
 if(chrome){for(const until=Date.now()+5000;Date.now()<until&&chrome.exitCode===null&&chrome.signalCode===null;)await sleep(100);assert(chrome.exitCode!==null||chrome.signalCode!==null,'Own Chrome remains alive');}
 if(chromeRoot&&chrome&&(chrome.exitCode!==null||chrome.signalCode!==null))fs.rmSync(chromeRoot,{recursive:true,force:true});
 gateway?.stop();
 const cleanup=await pulse?.dispose();save('gateway-observer-events.json',gatewayEvents);save('summary.json',{results,errors,cleanup,productAccepted:false,humanAccepted:false});console.log(JSON.stringify({errors,checks:results.filter(x=>typeof x.passed==='boolean').map(x=>({name:x.name,passed:x.passed})),evidence}));
}
process.exitCode=errors.length||results.some(x=>x.passed===false)?1:0;
