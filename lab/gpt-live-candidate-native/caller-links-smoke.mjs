// Scoped real native identity test. Synthetic USER audio only; the original
// browser mic, provider, backend delegation and received audio remain intact.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {createPrivatePulseMicrophone,captureOwnedBrowserDirectory,observeOwnedChromeProcesses,removeOwnedBrowserDirectory} from './private-pulse.mjs';
import {BROWSER_PROBE,readBoundedProbeSnapshot} from './browser-probe.mjs';
import {preflightLifecycleMedia} from './call-lifecycle-target.mjs';
import {readPrivateChildTranscript,activeTranscriptMessages} from './read-child-transcript.mjs';
import {resolveGptLivePersona,extractGptLivePersona} from '../gpt-live-call-lifecycle.mjs';

assert(process.env.VLAB_CANDIDATE_ID&&process.env.GPT_LIVE_H5_READY==='1');
const base=process.env.GPT_LIVE_H5_EVIDENCE_DIR,clips=process.env.GPT_LIVE_H5_USER_CLIPS_DIR;
const stateRoot=process.env.OPENCLAW_STATE_DIR,core=process.env.GPT_LIVE_H5_RUNTIME_ROOT,url=process.env.GPT_LIVE_H5_URL;
const hash=b=>createHash('sha256').update(b).digest('hex');
const config=JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH));
const persona=resolveGptLivePersona(config.talk?.realtime?.instructions);
assert(persona.includes('Identity:'),'Candidate must use the existing configured persona');
fs.mkdirSync(base,{recursive:true,mode:0o700});
const save=(name,value)=>fs.writeFileSync(path.join(base,name),JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
save('configured-persona-proof.json',{sha256:hash(persona),characters:persona.length,configuredInstructionsSha256:hash(config.talk.realtime.instructions),usesExistingPersona:true,source:extractGptLivePersona(config.talk.realtime.instructions)?'configured-persona':'frozen-original-V-persona'});
const media=preflightLifecycleMedia();
const scratch=fs.mkdtempSync(path.join(stateRoot,'tmp/caller-links-'));
const scratchId=captureOwnedBrowserDirectory(scratch,{parent:path.dirname(scratch),prefix:'caller-links-'});
// Chromium creates Unix sockets below TMPDIR. Candidate state paths exceed
// their length limit; reuse the lifecycle observer's short, separately owned temp.
const chromeTemp=fs.mkdtempSync('/tmp/gpt-live-caller-chrome-');fs.chmodSync(chromeTemp,0o700);
const chromeTempId=captureOwnedBrowserDirectory(chromeTemp,{parent:'/tmp',prefix:'gpt-live-caller-chrome-'}),profile=path.join(chromeTemp,'profile');
let pulse,chrome,cdp,gateway,cache,error=null,observed;
const results=[],gatewayEvents=[],owners=new Map();
let latestHistory,latestTranscript,currentEntry;
class CDP {
  constructor(url){this.url=url;this.pending=new Map();this.next=1;}
  async connect(){this.socket=new WebSocket(this.url);await new Promise((y,n)=>{this.socket.addEventListener('open',y,{once:true});this.socket.addEventListener('error',n,{once:true});});this.socket.addEventListener('message',e=>{const r=JSON.parse(e.data),p=this.pending.get(r.id);if(p){this.pending.delete(r.id);clearTimeout(p.timer);r.error?p.n(Error(r.error.message)):p.y(r.result);}});}
  request(method,params={}){return new Promise((y,n)=>{const id=this.next++,timer=setTimeout(()=>{this.pending.delete(id);n(Error('CDP timeout'));},15000);this.pending.set(id,{y,n,timer});this.socket.send(JSON.stringify({id,method,params}));});}
  close(){this.socket?.close();}
}
async function evaluate(expression){const r=await cdp.request('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!r.exceptionDetails,'Browser evaluation failed');return r.result.value;}
async function snap(){return cache=await readBoundedProbeSnapshot(evaluate,{previous:cache});}
async function wait(fn,label,ms=30000){const end=Date.now()+ms;while(Date.now()<end){const s=await snap();if(s){const r=await fn(s);if(r)return r;}await sleep(250);}throw Error(label+' deadline');}
async function click(id){const r=await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});if(!e||e.hidden||e.disabled)throw Error('Button unavailable');const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);for(const type of ['mousePressed','mouseReleased'])await cdp.request('Input.dispatchMouseEvent',{type,...r,button:'left',clickCount:1});}
const text=m=>typeof m.content==='string'?m.content:(m.content??[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
const audible=(s,after)=>s.audioFrames.some(f=>f.at>=after&&f.digitalAudible===true);
try {
  const token=String(config.gateway.auth.token).replace(/\$\{([^}]+)\}/gu,(_,k)=>{assert(process.env[k]);return process.env[k];});
  const {GatewayClient}=await import(core+'/dist/plugin-sdk/gateway-runtime.js');
  await new Promise((y,n)=>{const timer=setTimeout(()=>n(Error('Gateway connect deadline')),15000);gateway=new GatewayClient({url:'ws://127.0.0.1:'+config.gateway.port,token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.write'],caps:['tool-events'],onEvent(event){const key=event.payload?.sessionKey??event.payload?.session?.key;if([...owners.values()].some(o=>o.sessionKey===key))gatewayEvents.push({at:Date.now(),event:event.event,payload:event.payload});},onHelloOk(){clearTimeout(timer);y();},onConnectError:n});gateway.start();});
  assert.equal((await gateway.request('sessions.subscribe',{}, {timeoutMs:10000})).subscribed,true);
  pulse=await createPrivatePulseMicrophone(path.join(scratch,'pulse'),{executables:media.executables});
  chrome=spawn(media.executables.chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-features=AudioServiceSandbox','--remote-debugging-port=0','--window-size=1280,900','--user-data-dir='+profile,'--use-fake-ui-for-media-stream','about:blank'],{env:{...pulse.environment,TMPDIR:chromeTemp,TMP:chromeTemp,TEMP:chromeTemp},stdio:['ignore','ignore','pipe']});
  chrome.stderr.on('data',b=>fs.appendFileSync(path.join(base,'chrome.log'),b,{mode:0o600}));
  const debug=profile+'/DevToolsActivePort';for(let i=0;i<150&&!fs.existsSync(debug);i++)await sleep(100);assert(fs.existsSync(debug));
  const port=fs.readFileSync(debug,'utf8').split('\n')[0],tabs=await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json());
  cdp=new CDP(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await cdp.connect();
  await cdp.request('Page.enable');await cdp.request('Runtime.enable');await cdp.request('Page.addScriptToEvaluateOnNewDocument',{source:BROWSER_PROBE});
  for(const entry of ['visitor','tianyi']) {
    currentEntry=entry;latestHistory=null;latestTranscript=null;cache=null;await cdp.request('Page.navigate',{url:url+(entry==='tianyi'?'?entry=tianyi':'')});
    await wait(s=>s.callState==='idle'&&s.badge==='可以拨号','Entry ready');
    await click('start');await wait(s=>s.pcStates[0]==='connected','Original WebRTC connected');
    const created=await wait(s=>s.api.find(a=>a.route==='/api/session'&&a.status===200),'Owned native session');
    const owner=JSON.parse(fs.readFileSync(process.env.GPT_LIVE_H5_SESSION_PATH));
    owners.set(entry,owner);assert(owner.sessionKey.includes('gpt-live-h5-'+entry+'-'));save(entry+'-owner.json',owner);
    const greeting=await wait(s=>s.events.find(e=>e.type==='turn.done'&&e.role==='assistant'&&e.text?.trim()&&audible(s,created.at)),'Native proactive greeting');
    if(entry==='visitor')assert.match(greeting.text,/谁|怎么称呼|叫什么|名字|哪位/u);
    else assert.doesNotMatch(greeting.text,/你是谁|怎么称呼|叫什么|哪位/u);
    save(entry+'-greeting.json',greeting);
    // Wait for the original receiver to finish the greeting before USER input.
    await wait(s=>{const frames=s.audioFrames.filter(f=>f.at>Date.now()-1800);return frames.length>10&&frames.every(f=>!f.digitalAudible);},'Greeting playback quiet',20000);
    const clip=path.resolve(clips,entry+'.wav'),feed=pulse.play(clip,entry);await feed.done;assert.equal(feed.row.exitCode,0);
    save(entry+'-user-input.json',{...feed.row,clipSha256:hash(fs.readFileSync(clip)),syntheticUserOnly:true});
    let history,lastRead=0;
    const backend=await wait(async()=>{
      if(Date.now()-lastRead<1500)return;lastRead=Date.now();
      history=latestHistory=await gateway.request('chat.history',{sessionKey:owner.sessionKey,limit:80},{timeoutMs:15000});
      // chat.history bounds long messages, truncating the actual USER request
      // below the existing backend contract. Read this exact owner's SQLite
      // active transcript; never infer a missing name from the shortened view.
      const run=gatewayEvents.find(e=>e.payload?.sessionKey===owner.sessionKey&&e.payload?.runId);
      if(!run||!history.sessionId)return;
      latestTranscript=readPrivateChildTranscript({state:stateRoot,candidateData:process.env.VLAB_CANDIDATE_DATA,
        sessionId:history.sessionId,runId:run.payload.runId,requestedSessionKey:owner.sessionKey,timeoutMs:5000});
      const messages=activeTranscriptMessages(latestTranscript),request=messages.find(m=>m.role==='user'&&text(m).includes('Call-host entry context:'));
      if(!request)return;
      const final=messages.find(m=>m.role==='assistant'&&m.provider&&m.model!=='realtime-voice'&&m.stopReason==='stop'&&Number(m.timestamp)>=Number(request.timestamp)&&text(m).trim());
      return final?{request,final}:null;
    },'Same-owner real backend identity context',90000);
    save(entry+'-backend-transcript.json',latestTranscript);
    save(entry+'-gateway-events.json',gatewayEvents.filter(e=>e.payload?.sessionKey===owner.sessionKey));
    assert(text(backend.request).includes('"entry":"'+entry+'"'),'Host entry must reach actual backend');
    if(entry==='visitor')assert(text(backend.request).includes('小林'),'The full backend USER request must carry the self-identified name');
    save(entry+'-backend-history.json',{owner,history});
    const response=await wait(s=>s.events.find(e=>e.type==='turn.done'&&e.role==='assistant'&&e.at>=Number(backend.final.timestamp)&&/入口|小林|天意|Tianyi|本人|普通/u.test(e.text??'')&&audible(s,Number(backend.final.timestamp))),'Backend response through original Live audio',45000);
    save(entry+'-speech.json',response);
    await click('stop');await wait(s=>s.pcStates[0]==='closed','Original owned close');
    const s=await snap();save(entry+'-raw-browser.json',s);
    await evaluate('globalThis.__candidateLiveProbe.dispose()');
    const recordings=await evaluate(`(async()=>{const rows=[];for(const r of globalThis.__candidateLiveProbe.recordings){const blob=new Blob(r.chunks,{type:'audio/webm;codecs=opus'}),bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let at=0;at<bytes.length;at+=16384)binary+=String.fromCharCode(...bytes.subarray(at,at+16384));rows.push({pcIndex:r.pcIndex,base64:btoa(binary),lifecycle:r.lifecycle});}return rows;})()`);
    assert(recordings.length>0);
    for(const recording of recordings){const file=path.join(base,entry+'-native-'+recording.pcIndex+'.webm');fs.writeFileSync(file,Buffer.from(recording.base64,'base64'),{mode:0o600});const decoded=spawnSync(media.executables.ffmpeg,['-v','error','-i',file,'-f','s16le','-ar','48000','-ac','1','pipe:1'],{maxBuffer:32*1024**2});assert.equal(decoded.status,0);assert(decoded.stdout.length>0);fs.writeFileSync(file+'.pcm',decoded.stdout,{mode:0o600});}
    results.push({entry,sessionKey:owner.sessionKey,nativeGreeting:true,hostBackendIdentity:true,originalAudioDecoded:true,passed:true});
  }
} catch(e){error=e.message;
  if(latestHistory)save('failure-backend-history.json',latestHistory);
  if(latestTranscript)save('failure-backend-transcript.json',latestTranscript);
  save('failure-gateway-events.json',gatewayEvents);
  if(cdp)try{save('failure-raw-browser.json',await snap());}catch{}
}
finally {
  if(cdp){try{const s=await snap();if(s.pcStates[0]&&s.pcStates[0]!=='closed')await click('stop');}catch{}cdp.close();}
  gateway?.stop();
  const inspect=()=>observed=observeOwnedChromeProcesses({profile,rootPid:chrome?.pid,knownProcesses:observed?.knownProcesses??[]});
  if(chrome){inspect();if(chrome.exitCode===null&&chrome.signalCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(3000)]);}}
  await pulse?.dispose();
  for(let i=0;i<20&&inspect().aliveProcesses.length;i++)await sleep(100);
  if(inspect().aliveProcesses.length===0){
    await removeOwnedBrowserDirectory(chromeTemp,{identity:chromeTempId,chromeExited:true,inspectChrome:inspect});
    await removeOwnedBrowserDirectory(scratch,{identity:scratchId,chromeExited:true,inspectChrome:inspect});
  }
  save('result.json',{results,error,cleanup:{...observed,chromeExitCode:chrome?.exitCode,chromeSignal:chrome?.signalCode,privateChromeTempRemoved:!fs.existsSync(chromeTemp),privateScratchRemoved:!fs.existsSync(scratch)},productAccepted:false,pausedFidelityAndDuplexUntouched:true});
}
assert.equal(error,null,error??'');assert.equal(results.length,2);
