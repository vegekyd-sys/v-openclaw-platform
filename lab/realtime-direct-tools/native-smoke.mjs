// Real original H5 + private physical browser audio graph. Synthetic USER input
// is fed into getUserMedia through a private PulseAudio source; replies and
// native function calls come only from the actual provider and Gateway.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {createPrivatePulseMicrophone} from '../gpt-live-candidate-native/private-pulse.mjs';
import {calendarOutcome} from './tools.mjs';
import {actualSpeakerIdle} from './playback-evidence.mjs';
const evidence=process.env.DIRECT_VOICE_EVIDENCE,ready=JSON.parse(fs.readFileSync(process.env.GPT_LIVE_H5_EXPERIENCE_READY));
assert(ready.candidateId===process.env.VLAB_CANDIDATE_ID&&ready.state==='ready'&&Date.parse(ready.expiresAt)>Date.now()+Number(process.env.DIRECT_VOICE_MIN_WINDOW_MS??600000));
fs.mkdirSync(evidence,{mode:0o700});
const scratch=fs.mkdtempSync(path.join(process.env.OPENCLAW_STATE_DIR,'tmp/direct-smoke-'));
const clips=process.env.DIRECT_VOICE_CLIPS,auditPath=path.join(path.dirname(process.env.GPT_LIVE_H5_EXPERIENCE_READY),'direct-voice-audit.jsonl');
let chrome,chromeRoot,pulse,cdp,recorder,outputHandle,outputFile;const results=[],errors=[];
const save=(name,value)=>fs.writeFileSync(path.join(evidence,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
const audit=()=>fs.readFileSync(auditPath,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l));
class Cdp {
 constructor(url){this.url=url;this.next=1;this.pending=new Map();}
 async connect(){this.ws=new WebSocket(this.url);await new Promise((resolve,reject)=>{this.ws.addEventListener('open',resolve,{once:true});this.ws.addEventListener('error',reject,{once:true});});this.ws.addEventListener('message',event=>{const r=JSON.parse(event.data),p=this.pending.get(r.id);if(!p)return;this.pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);});}
 request(method,params={}){return new Promise((resolve,reject)=>{const id=this.next++,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout: '+method));},20000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
 close(){this.ws.close();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('observer closed'));}this.pending.clear();}
}
const evaluate=async expression=>{const r=await cdp.request('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
const state=()=>evaluate(`({state:document.body?.dataset.callState,badge:document.getElementById('badge')?.textContent,status:document.getElementById('status')?.textContent,transcript:document.getElementById('conversation')?.innerText,wire:globalThis.__directWire??[]})`);
async function wait(predicate,label,ms=45000){const until=Date.now()+ms;while(Date.now()<until){const s=await state();if(await predicate(s))return s;await sleep(200);}throw Error(label+' deadline');}
async function click(id){const rect=await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});if(!e||e.disabled||e.hidden)throw Error('Button unavailable');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);for(const type of ['mousePressed','mouseReleased'])await cdp.request('Input.dispatchMouseEvent',{type,...rect,button:'left',clickCount:1});}
async function speak(name){const row={name,at:Date.now(),source:'private-real-getUserMedia-PCM'};results.push(row);await pulse.play(path.join(clips,name+'.wav'),name).done;row.completedAt=Date.now();}
function check(name,passed,details={}){const row={...details,name,passed:Boolean(passed),at:Date.now()};results.push(row);save('progress.json',{results,errors});console.log(JSON.stringify(row));}
function speakerTailRms(){if(!outputFile||!fs.existsSync(outputFile))return 1;const size=fs.statSync(outputFile).size;if(size<48000)return 1;const fd=fs.openSync(outputFile,'r'),b=Buffer.alloc(48000);try{fs.readSync(fd,b,0,b.length,size-b.length);}finally{fs.closeSync(fd);}let sum=0;for(let i=0;i<b.length;i+=2)sum+=(b.readInt16LE(i)/32768)**2;return Math.sqrt(sum/(b.length/2));}
async function quiet(id,ms=15000){return wait(()=>actualSpeakerIdle(audit().filter(x=>x.voiceSessionId===id),Date.now(),speakerTailRms()),'actual provider and FIFO-drained native speaker quiet',ms);}
async function stop(){const s=await state();if(s.state!=='idle')await click('stop');await wait(s=>s.state==='idle','original UI release',15000);}
async function record(model){
 outputFile=path.join(evidence,model+'-speaker.pcm');outputHandle=fs.openSync(outputFile,'wx',0o600);
 recorder=spawn('/usr/bin/parec',['--device='+pulse.outputSink+'.monitor','--format=s16le','--rate=48000','--channels=1'],{env:pulse.environment,stdio:['ignore',outputHandle,'pipe']});
 recorder.stderr.on('data',b=>errors.push({kind:'recorder',text:String(b).slice(0,200)}));await sleep(250);
}
async function stopRecording(){if(recorder&&recorder.exitCode===null&&recorder.signalCode===null){const exited=new Promise(resolve=>recorder.once('exit',resolve));recorder.kill('SIGTERM');await Promise.race([exited,sleep(2000)]);assert(recorder.exitCode!==null||recorder.signalCode!==null,'Recorder did not exit');}if(outputHandle!==undefined)fs.closeSync(outputHandle);recorder=null;outputHandle=undefined;}
async function runModel(model){
 await cdp.request('Page.navigate',{url:`http://127.0.0.1:${ready.remotePort}/`});await wait(s=>s.state==='idle'&&s.badge==='可以拨号','page ready and idle');
 await evaluate(`document.getElementById('voiceModel').value=${JSON.stringify(model)}`);
 await record(model);const start=Date.now();await click('start');await wait(s=>s.state==='connected','provider ready',45000);
 const id=(await state()).wire.find(x=>x.type==='ready')?.voiceSessionId;assert(id,'Original relay owner missing');
 const rows=()=>audit().filter(x=>x.voiceSessionId===id),wire=async()=> (await state()).wire;
 await wait(()=>(model==='seeduplex'||rows().some(x=>x.type==='transcript'&&x.role==='assistant'&&x.final))&&rows().some(x=>x.type==='audio'),'actual greeting',20000);
 check(model+'/greeting',true,{voiceSessionId:id,provider:model,greetingMode:model==='seeduplex'?'documented SayHello native TTS':'model response'});await quiet(id);
 if(process.env.DIRECT_VOICE_CASES==='calendar-playback'){
  const at=Date.now();await speak('calendar');const inputEnd=Date.now();
  const calendarResults=()=>rows().filter(x=>x.type==='tool.local-result'&&x.at>at&&x.name==='feishu_calendar');
  await wait(()=>calendarResults().some(x=>calendarOutcome(x.result).ok),'actual successful personal calendar business result',90000);
  const result=calendarResults().find(x=>calendarOutcome(x.result).ok);
  await wait(()=>rows().some(x=>x.type==='tool.delivered'&&x.callId===result.callId&&!x.result?.error),'actual calendar delivery',30000);
  const delivered=rows().find(x=>x.type==='tool.delivered'&&x.callId===result.callId);
  await wait(()=>rows().some(x=>x.type==='audio'&&!x.source&&x.at>delivered.at),'calendar answer PCM without a second USER',30000);await quiet(id,90000);
  const call=rows().find(x=>x.type==='tool.local-start'&&x.callId===result.callId);
  check(model+'/calendar-native-answer',calendarResults().every(x=>calendarOutcome(x.result).ok)&&!rows().some(x=>x.type==='backend.started'),{callId:result.callId,exitCode:result.result.details.exitCode,calendarOk:true,inputEnd,toolAt:call.at,latencyMs:call.at-inputEnd,secondUserUtteranceRequired:false});
  if(model==='grok'){
   const storyAt=Date.now();await speak('story');await wait(()=>rows().some(x=>x.type==='audio'&&!x.source&&x.at>storyAt),'actual long story PCM',30000);await quiet(id,120000);
   const playback=rows().filter(x=>x.type==='client.playback-stats').at(-1)?.stats;
   check(model+'/long-playback',Boolean(playback)&&playback.queuedOutputBytes===0&&playback.underflows===0&&playback.duplicateFrames===0&&(await state()).state==='connected',{playback,physicalSafariAccepted:false});
  }
  await stop();await stopRecording();save(model+'-wire.json',await wire());save(model+'-calendar-playback-result.json',{model,results:results.filter(x=>x.name?.startsWith(model+'/')),scope:'calendar and playback regression only',productAccepted:false});return;
 }
 if(['hybrid','hybrid-core','single-query','routing-controls'].includes(process.env.DIRECT_VOICE_CASES)){
  const firstInput=Date.now();await speak('simple');const firstInputEnd=Date.now();await wait(()=>rows().some(x=>x.type==='tool.invoke'&&x.name==='memory_search'),'simple native memory call',45000);
  await wait(()=>rows().some(x=>x.type==='tool.delivered'&&rows().some(c=>c.type==='tool.call'&&c.name==='memory_search'&&c.callId===x.callId)),'simple native tool actually delivered',60000);
  const firstDelivery=rows().find(x=>x.type==='tool.delivered'&&rows().some(c=>c.type==='tool.call'&&c.name==='memory_search'&&c.callId===x.callId));
  await wait(()=>rows().some(x=>x.type==='audio'&&!x.source&&x.at>firstDelivery.at),'first answer actual PCM without another USER utterance',30000);
  await quiet(id,90000);
  check(model+'/single-query-answer-audio',rows().some(x=>x.type==='audio'&&!x.source&&x.at>firstDelivery.at),{deliveryAt:firstDelivery.at,nextUserInputSent:false});
  const firstTool=rows().find(x=>x.type==='tool.call'&&x.name==='memory_search');check(model+'/single-utterance-query',firstTool.at>=firstInput&&firstTool.at-firstInputEnd<10000,{inputStart:firstInput,inputEnd:firstInputEnd,toolAt:firstTool.at,latencyMs:firstTool.at-firstInputEnd});
  check(model+'/simple-stays-native',!rows().some(x=>x.type==='backend.started')&&rows().some(x=>x.type==='tool.native-result'&&x.name==='memory_search'&&x.result.ok===true));
  if(process.env.DIRECT_VOICE_CASES==='routing-controls')return runControls();
  if(process.env.DIRECT_VOICE_CASES==='single-query'){await stop();await stopRecording();save(model+'-wire.json',await wire());save(model+'-single-query-result.json',{model,results:results.filter(x=>x.name?.startsWith(model+'/')),productAccepted:false});return;}
  if(process.env.DIRECT_VOICE_SIMPLE_EXTENDED==='1')for(const [clip,names] of [['calendar',['feishu_calendar']],['weather',['web_search']]]){
   const at=Date.now();await speak(clip);await wait(()=>rows().some(x=>x.type===(clip==='calendar'?'tool.local-result':'tool.native-result')&&x.at>at&&names.includes(x.name)),'simple '+clip+' native result',90000);
   const first=rows().find(x=>x.type===(clip==='calendar'?'tool.local-result':'tool.native-result')&&x.at>at&&names.includes(x.name));
   await wait(()=>rows().some(x=>x.type==='tool.delivered'&&x.callId===first.callId),'simple '+clip+' result delivery',100000);
   const delivered=rows().find(x=>x.type==='tool.delivered'&&x.callId===first.callId),result=rows().filter(x=>x.type===(clip==='calendar'?'tool.local-result':'tool.native-result')&&x.callId===first.callId).at(-1);
   await wait(()=>rows().some(x=>x.type==='audio'&&!x.source&&x.at>delivered.at),'simple '+clip+' actual answer PCM',30000);await quiet(id,90000);
   const output=clip==='calendar'?result.result:result.result.output,calendar=clip==='calendar'?calendarOutcome(output):null;
   const succeeded=(clip==='calendar'?calendar.ok:result.result.ok===true)&&output?.isError!==true&&!delivered.result?.error;
   check(model+'/simple-'+clip,succeeded&&!rows().some(x=>x.type==='backend.started'&&x.at>at),{toolName:result.name,callId:result.callId,exitCode:output?.details?.exitCode,calendarOk:calendar?.ok,deliveryAt:delivered.at,secondUserUtteranceRequired:false});
  }
  await speak('hybrid');await wait(()=>rows().some(x=>x.type==='backend.started'),'real V backend delegated',60000);
  const run=rows().find(x=>x.type==='backend.started');
  await wait(()=>rows().some(x=>x.type==='backend.event'&&x.runId===run.runId&&x.event.event==='agent'&&x.event.payload.stream==='tool'),'actual backend tool execution',90000);
  const chatAt=Date.now();await speak('chat');await wait(()=>rows().some(x=>x.type==='transcript'&&x.role==='assistant'&&x.final&&x.at>chatAt&&/小汽车|小车|卡车/.test(x.text)&&!x.source)&&!rows().some(x=>x.type==='backend.completed'&&x.runId===run.runId),'actual requested joke before backend completion',30000);
  check(model+'/hybrid-chat',true,{runId:run.runId,chatAt});
  await wait(()=>rows().some(x=>x.type==='backend.completed'&&x.runId===run.runId),'automatic complete multi-step V final',180000);
  await wait(()=>rows().some(x=>x.type==='tool.delivered'&&x.result.backend==='V'&&x.result.runId===run.runId),'actual provider final continuation',60000);
  const delivered=rows().find(x=>x.type==='tool.delivered'&&x.result.runId===run.runId);
  await wait(()=>rows().some(x=>x.type==='audio'&&!x.source&&x.at>delivered.at),'native final PCM after real backend delivery',30000);
  if(model==='grok')await wait(()=>rows().some(x=>x.type==='transcript'&&x.role==='assistant'&&x.final&&x.at>delivered.at&&/上海/.test(x.text)&&/风火轮|玩具/.test(x.text)&&/时间|点|14:|15:/.test(x.text)),'provider actual three-part final speech transcript',30000);
  await quiet(id,120000);
  const playback=rows().filter(x=>x.type==='client.playback-stats').at(-1)?.stats;check(model+'/render-receipts',Boolean(playback)&&playback.outputBytes>0,{playback,physicalSafariAccepted:false});
  const tools=rows().filter(x=>x.type==='backend.event'&&x.runId===run.runId&&x.event.payload.stream==='tool');
  check(model+'/hybrid-completion',rows().filter(x=>x.type==='backend.started').length===1&&tools.length>=2,{runId:run.runId,backendToolEvents:tools.length});
  check(model+'/hybrid-real-progress',rows().some(x=>x.type==='backend.progress-spoken'&&x.runId===run.runId)&&rows().some(x=>x.type==='audio'&&x.at>run.at),{runId:run.runId});
  if(process.env.DIRECT_VOICE_CASES==='hybrid-core'){await stop();await stopRecording();save(model+'-hybrid-core-result.json',{model,results:results.filter(x=>x.name?.startsWith(model+'/')),scope:'hybrid core only; cancellation not exercised',productAccepted:false});return;}
  const storyAt=Date.now();await speak('story');await wait(()=>rows().some(x=>x.type==='audio'&&x.at>storyAt),'native long story',30000);await quiet(id,120000);const afterStory=rows().filter(x=>x.type==='client.playback-stats').at(-1)?.stats;check(model+'/long-playback',Boolean(afterStory)&&afterStory.outputBytes>playback.outputBytes&&(await state()).state==='connected',{playback:afterStory,physicalSafariAccepted:false});
  return runControls();
 }
 async function runControls(){
  const previousRuns=rows().filter(x=>x.type==='backend.started').length;
  await speak(process.env.DIRECT_VOICE_BACKGROUND_CLIP??'backend-long');await wait(()=>rows().filter(x=>x.type==='backend.started').length===previousRuns+1,'new independent backend goal',60000);
  const second=rows().filter(x=>x.type==='backend.started').at(-1);
  const foreground=process.env.DIRECT_VOICE_FOREGROUND_CANCEL==='1';let owned;
  if(foreground){
   await wait(()=>rows().some(x=>x.type==='backend.event'&&x.runId===second.runId&&x.event.payload.stream==='tool'&&x.event.payload.data?.name==='exec'&&x.event.payload.data?.phase==='start'&&/sleep\s+60/.test(String(x.event.payload.data?.args?.command))),'actual foreground exec tool start',45000);
   // Independent OS witness only. These PIDs never enter cancellation requests.
   const witnesses=()=>fs.readdirSync('/proc').filter(n=>/^\d+$/.test(n)).flatMap(n=>{try{const args=fs.readFileSync('/proc/'+n+'/cmdline').toString().split('\0').filter(Boolean),cgroup=fs.readFileSync('/proc/'+n+'/cgroup','utf8');return cgroup.includes(process.env.VLAB_CANDIDATE_UNIT)&&args.length===2&&/(?:^|\/)sleep$/.test(args[0])&&args[1]==='60'?[{pid:Number(n),args}]:[];}catch{return [];}});
   await wait(()=>witnesses().length===1,'unique own-unit actual foreground sleep',10000);owned=witnesses()[0];assert(!rows().some(x=>x.type==='backend.event'&&x.runId===second.runId&&x.event.payload.data?.name==='exec'&&x.event.payload.data?.phase==='result'),'ordinary foreground result must still be absent');
  }else{
   await wait(()=>rows().some(x=>x.type==='backend.event'&&x.runId===second.runId&&x.event.payload.stream==='tool'&&x.event.payload.data?.name==='exec'&&x.event.payload.data?.result?.details?.status==='running'),'owned running backend exec result',45000);
   owned=rows().find(x=>x.type==='backend.event'&&x.runId===second.runId&&x.event.payload.data?.name==='exec'&&x.event.payload.data?.result?.details?.status==='running').event.payload.data.result.details;
  }
  const osBefore={pid:owned.pid,startTicks:fs.readFileSync(`/proc/${owned.pid}/stat`,'utf8').split(') ').at(-1).split(' ')[19],cgroup:fs.readFileSync(`/proc/${owned.pid}/cgroup`,'utf8')};
  assert(osBefore.cgroup.includes(process.env.VLAB_CANDIDATE_UNIT),'Backend exec must belong to own Candidate');
  save(model+'-backend-process-before.json',{runId:second.runId,sessionId:owned.sessionId,...osBefore});
  if(process.env.DIRECT_VOICE_CANCEL_AFTER_QUIET==='1')await quiet(id,30000);
  if(foreground)assert(!rows().some(x=>x.type==='backend.event'&&x.runId===second.runId&&x.event.payload.data?.name==='exec'&&x.event.payload.data?.phase==='result'),'cancel must precede the ordinary foreground result');
  await speak('cancel');await wait(()=>rows().some(x=>x.type==='backend.cancel-observed'&&x.runId===second.runId),'exact owned backend cancel terminal',45000);
  const terminal=rows().find(x=>x.type==='backend.cancel-observed'&&x.runId===second.runId);
  if(foreground)await wait(()=>rows().some(x=>x.type==='backend.worker-cleanup-confirmed'&&x.runId===second.runId&&x.registryScope===second.runId&&x.nativeExecScopeJoined===true),'actual exact-run hidden foreground lifecycle join',20000);
  else await wait(()=>rows().some(x=>x.type==='backend.process-cancel-observed'&&x.sessionId===owned.sessionId&&['completed','failed','killed','cancelled'].includes(x.result?.details?.status)),'backend owned process terminal poll',20000);
  const sameProcess=fs.existsSync(`/proc/${owned.pid}/stat`)&&fs.readFileSync(`/proc/${owned.pid}/stat`,'utf8').split(') ').at(-1).split(' ')[19]===osBefore.startTicks;
  check(model+'/hybrid-cancel',!sameProcess&&(terminal.observed.status==='error'||terminal.observed.aborted===true||terminal.observed.status==='ok'),{runId:second.runId,observed:terminal.observed,osBefore,sameProcessAfter:sameProcess,foregroundWithoutOrdinaryResult:foreground});
  await quiet(id,30000);await speak('end');await wait(s=>s.state==='idle','semantic end after cancellation',40000);
  check(model+'/semantic-hangup',rows().some(x=>x.type==='tool.call'&&x.name==='end_call')&&rows().some(x=>x.type==='call.closed'),{wireDrainObserved:(await wire()).some(x=>x.type==='end.after-playback')});
  await click('start');await wait(s=>s.state==='connected','redial after cancellation');const next=(await wire()).filter(x=>x.type==='ready').at(-1)?.voiceSessionId;
  await wait(()=>audit().some(x=>x.voiceSessionId===next&&x.type==='audio')&&(model==='seeduplex'||audit().some(x=>x.voiceSessionId===next&&x.type==='transcript'&&x.role==='assistant'&&x.final)),'fresh redial greeting',25000);
  const grants=await evaluate('globalThis.__directMicRequests');check(model+'/redial',next!==id,{old:id,next});check(model+'/same-page-microphone-reuse',grants===1,{getUserMediaRequests:grants,physicalSafariAccepted:false});
  await stop();await stopRecording();save(model+'-wire.json',await wire());save(model+'-controls-result.json',{model,results:results.filter(x=>x.name?.startsWith(model+'/')),productAccepted:false});return;
 }
 if(process.env.DIRECT_VOICE_CASES==='controls')return runControls();
 if(process.env.DIRECT_VOICE_CASES==='followup'){
  await speak('fetch');
  await wait(()=>rows().some(x=>x.type==='tool.invoke'&&x.name==='web_fetch'),'native webpage call',60000);
  await wait(()=>rows().some(x=>x.type==='tool.native-result'&&x.name==='web_fetch'),'native webpage result',60000);
  await quiet(id,60000);
  const fetched=rows().find(x=>x.type==='tool.native-result'&&x.name==='web_fetch');
  check(model+'/web-fetch',fetched.result.ok===true&&fetched.result.output?.isError!==true,{callId:fetched.callId});
  await stop();await click('start');await wait(s=>s.state==='connected','fresh redial ready');
  const next=(await wire()).filter(x=>x.type==='ready').at(-1)?.voiceSessionId;
  await wait(()=>audit().some(x=>x.voiceSessionId===next&&x.type==='audio')&&(model==='seeduplex'||audit().some(x=>x.voiceSessionId===next&&x.type==='transcript'&&x.role==='assistant'&&x.final)),'fresh native greeting',25000);
  check(model+'/redial',next!==id,{old:id,next,greetingMode:model==='seeduplex'?'documented SayHello native TTS':'model response'});
  await quiet(next);await stop();await stopRecording();
  save(model+'-wire.json',await wire());return;
 }
 await speak('tools');await wait(()=>rows().some(x=>x.type==='tool.invoke'&&x.name==='memory_search')&&rows().some(x=>x.type==='tool.invoke'&&x.name==='web_search')&&rows().some(x=>x.type==='tool.local-result'&&x.name==='feishu_calendar'&&calendarOutcome(x.result).ok),'actual memory/calendar/web direct calls',180000);
 await wait(()=>rows().some(x=>x.type==='tool.invoke'&&['read','exec'].includes(x.name)&&/agents\.md/i.test(JSON.stringify(x.args))),'generic native file tool',60000);
 await wait(()=>rows().filter(x=>x.type==='tool.native-result').length>=3&&rows().some(x=>x.type==='tool.local-result'&&x.name==='feishu_calendar'),'all core direct results',60000);
 await quiet(id,60000);
 const native=rows().filter(x=>x.type==='tool.native-result');
 check(model+'/direct-tools',native.length>=3&&rows().some(x=>x.type==='tool.local-result'&&x.name==='feishu_calendar'&&calendarOutcome(x.result).ok)&&native.every(x=>x.result.ok===true&&x.result.output?.isError!==true&&(x.name!=='exec'||x.result.output?.details?.status==='running'||x.result.output?.details?.exitCode===0)),{calls:rows().filter(x=>x.type==='tool.invoke').map(x=>({name:x.name,callId:x.callId})),gatewayNativeAndVoiceLocal:true,noBackendLLM:true});
 await speak('keep');await quiet(id,30000);check(model+'/discussion-does-not-hangup',(await state()).state==='connected'&&!rows().some(x=>x.type==='tool.call'&&x.name==='end_call'));
 await speak('count');await wait(()=>rows().filter(x=>x.type==='audio').at(-1)?.at>Date.now()-1000,'count audio',15000);
 const bargeAt=Date.now();await speak('barge');await quiet(id,30000);
 const oldTerminal=rows().some(x=>x.type==='response.done'&&x.at>=bargeAt&&['cancelled','interrupted'].includes(x.status));
 check(model+'/barge-new-topic',(await wire()).some(x=>x.type==='audio.clear'&&x.observedAt>=bargeAt)&&oldTerminal&&rows().some(x=>x.type==='transcript'&&x.role==='assistant'&&x.at>=bargeAt),{oldTerminalObserved:oldTerminal,requiresHumanListening:true,rtpNotApplicable:'PCM relay; native speaker recording retained'});
 await speak('long');await wait(()=>rows().some(x=>x.type==='tool.native-result'&&x.name==='exec'&&x.result?.output?.details?.status==='running'),'real running exec',30000);
 await speak('cancel');await wait(()=>rows().some(x=>x.type==='process.cancel-observed'),'real cancellation terminal poll',30000);
 const cancelled=rows().filter(x=>x.type==='process.cancel-observed');check(model+'/cancel-process',cancelled.some(x=>['completed','failed','killed','cancelled'].includes(x.result.output?.details?.status)),{terminal:cancelled.map(x=>x.result.output?.details)});
 await quiet(id,20000);await speak('end');await wait(s=>s.state==='idle','semantic end original host',40000);
 check(model+'/semantic-hangup',rows().some(x=>x.type==='tool.call'&&x.name==='end_call')&&rows().some(x=>x.type==='call.closed'),{wireDrainObserved:(await wire()).some(x=>x.type==='end.after-playback')});
 // Same canonical backend, fresh voice connection and no reuse of old audio.
 await click('start');await wait(s=>s.state==='connected','redial');const next=(await wire()).filter(x=>x.type==='ready').at(-1)?.voiceSessionId;
 await wait(()=>audit().some(x=>x.voiceSessionId===next&&x.type==='audio')&&(model==='seeduplex'||audit().some(x=>x.voiceSessionId===next&&x.type==='transcript'&&x.role==='assistant'&&x.final)),'fresh greeting',25000);
 check(model+'/redial',next!==id,{old:id,next});await stop();await stopRecording();
 const screenshot=await cdp.request('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(evidence,model+'-desktop.png'),Buffer.from(screenshot.data,'base64'),{mode:0o600});
 save(model+'-wire.json',await wire());save(model+'-result.json',{model,start,finishedAt:Date.now(),results:results.filter(x=>x.name?.startsWith(model+'/')),nativeAudio:true,productAccepted:false});
}
try {
 pulse=await createPrivatePulseMicrophone(path.join(scratch,'pulse'));
 // Chromium ProcessSingleton sockets must fit Linux's 107-byte AF_UNIX path.
 // Its real profile belongs to this observer, in a short fresh /tmp directory.
 chromeRoot=fs.mkdtempSync('/tmp/voice-direct-chrome-');fs.chmodSync(chromeRoot,0o700);const profile=path.join(chromeRoot,'profile');chrome=spawn('/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-features=AudioServiceSandbox','--remote-debugging-port=0','--window-size=1280,900','--user-data-dir='+profile,'--use-fake-ui-for-media-stream','about:blank'],{env:{...pulse.environment,TMPDIR:chromeRoot,TMP:chromeRoot,TEMP:chromeRoot},stdio:['ignore','ignore','pipe']});
 chrome.stderr.on('data',b=>fs.appendFileSync(path.join(evidence,'chrome.log'),b,{mode:0o600}));for(const until=Date.now()+10000;Date.now()<until&&!fs.existsSync(path.join(profile,'DevToolsActivePort'))&&chrome.exitCode===null&&chrome.signalCode===null;)await sleep(100);
 const port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);const targets=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());cdp=new Cdp(targets.find(x=>x.type==='page').webSocketDebuggerUrl);await cdp.connect();await cdp.request('Page.enable');
 await cdp.request('Page.addScriptToEvaluateOnNewDocument',{source:`globalThis.__directWire=[];globalThis.__directMicRequests=0;const getMic=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=(...args)=>{globalThis.__directMicRequests++;return getMic(...args)};const Native=WebSocket;globalThis.WebSocket=class extends Native{constructor(...args){super(...args);if(String(args[0]).includes('/api/relay'))this.addEventListener('message',e=>{try{const v=JSON.parse(e.data);if(v.type==='audio')v.audioBytes=Math.floor(v.audio.length*3/4);delete v.audio;globalThis.__directWire.push({...v,observedAt:Date.now()});}catch{}});}};`});
 const defaultCase=process.env.DIRECT_VOICE_CASES,modelCases=JSON.parse(process.env.DIRECT_VOICE_CASE_BY_MODEL??'{}');
 for(const model of (process.env.DIRECT_VOICE_MODELS??'seeduplex,grok').split(',')){
  process.env.DIRECT_VOICE_CASES=modelCases[model]??defaultCase;
  try{await runModel(model);}catch(error){errors.push({model,message:error.message,at:Date.now()});check(model+'/workflow',false,{error:error.message});save(model+'-failure-state.json',await state().catch(()=>null));await stop().catch(()=>{});await stopRecording();}
 }
} catch(error){errors.push({kind:'harness',message:error.message});}
finally {
 if(cdp)await stop().catch(()=>{});
 await stopRecording();if(cdp){await cdp.request('Browser.close').catch(()=>{});cdp.close();}
 if(chrome){for(const until=Date.now()+5000;Date.now()<until&&chrome.exitCode===null&&chrome.signalCode===null;)await sleep(100);assert(chrome.exitCode!==null||chrome.signalCode!==null,'Own Chrome remains alive');}
 if(chromeRoot&&chrome&&(chrome.exitCode!==null||chrome.signalCode!==null))fs.rmSync(chromeRoot,{recursive:true,force:true});
 const cleanup=await pulse?.dispose();save('summary.json',{results,errors,cleanup,productAccepted:false,humanAccepted:false});console.log(JSON.stringify({errors,checks:results.filter(x=>typeof x.passed==='boolean').map(x=>({name:x.name,passed:x.passed})),evidence}));
}
process.exitCode=errors.length||results.some(x=>x.passed===false)?1:0;
