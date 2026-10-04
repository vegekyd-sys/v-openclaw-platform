// No provider session: verify dynamic PCM source through original processed getUserMedia.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {createPrivatePulseMicrophone} from './private-pulse.mjs';
assert(process.env.VLAB_CANDIDATE_ID,'Candidate required');
const scratch=path.join(process.env.OPENCLAW_STATE_DIR,'tmp/feed-probe');fs.mkdirSync(scratch,{recursive:true,mode:0o700});
const evidence=process.env.GPT_LIVE_H5_EVIDENCE_DIR;assert(path.isAbsolute(evidence));fs.mkdirSync(evidence,{recursive:true,mode:0o700});
let pulse,chrome,chromeTemp,ws,server;const pending=new Map();let nextId=1;
async function request(method,params={}) {const id=nextId++;return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout'))},20000);pending.set(id,{resolve,reject,timeout});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression) {const r=await request('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result?.value;}
try {
  pulse=await createPrivatePulseMicrophone(path.join(scratch,'pulse'));
  server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync('lab/gpt-live-h5/microphone-capture.mjs'));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/';
  const profile=path.join(scratch,'profile');
  chromeTemp=fs.mkdtempSync('/tmp/gpt-live-feed-chrome-');fs.chmodSync(chromeTemp,0o700);
  chrome=spawn('/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-features=AudioServiceSandbox','--remote-debugging-port=0','--user-data-dir='+profile,'--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required','about:blank'],{env:{...pulse.environment,TMPDIR:chromeTemp,TMP:chromeTemp,TEMP:chromeTemp},stdio:['ignore','ignore','pipe']});
  const devtools=path.join(profile,'DevToolsActivePort');for(const deadline=Date.now()+15000;Date.now()<deadline&&!fs.existsSync(devtools);)await sleep(100);
  assert(fs.existsSync(devtools),'Private Chrome debugger unavailable');
  const port=fs.readFileSync(devtools,'utf8').split('\n')[0];const targets=await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json());
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',event=>{const r=JSON.parse(String(event.data)),p=pending.get(r.id);if(!p)return;pending.delete(r.id);clearTimeout(p.timeout);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);});
  await request('Page.enable');await request('Runtime.enable');await request('Page.navigate',{url});await sleep(300);
  const started=await evaluate(`(async()=>{const module=await import(location.href),capture=await module.captureDuplexMicrophone();const context=new AudioContext();await context.resume();const analyser=context.createAnalyser();analyser.fftSize=1024;context.createMediaStreamSource(capture.stream).connect(analyser);const pc=new RTCPeerConnection();pc.addTrack(capture.track,capture.stream);const p=globalThis.__feedProbe={capture,context,pc,analyser,initialTrackId:capture.track.id,frames:[]};const samples=new Float32Array(1024);p.timer=setInterval(()=>{analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((s,x)=>s+x*x,0)/samples.length);p.frames.push({at:Date.now(),rms,trackId:capture.track.id,senderTrackId:pc.getSenders()[0].track.id});},50);return {processing:capture.diagnostics,sourceTrackId:capture.track.id,senderTrackId:pc.getSenders()[0].track.id}})()`);
  await sleep(700);
  const first=pulse.play(path.join(process.env.GPT_LIVE_H5_USER_CLIPS_DIR,'new-greeting.wav'),'first-clip');await first.done;await sleep(800);
  const second=pulse.play(path.join(process.env.GPT_LIVE_H5_USER_CLIPS_DIR,'barge.wav'),'second-clip');await second.done;await sleep(800);
  const result=await evaluate(`(()=>{const p=globalThis.__feedProbe;return {frames:p.frames,trackId:p.capture.track.id,senderTrackId:p.pc.getSenders()[0].track.id,processing:p.capture.snapshot()}})()`);
  const windows=pulse.plays.map(play=>({label:play.label,frames:result.frames.filter(f=>f.at>=play.startedAt&&f.at<=play.completedAt&&f.rms>.005).length,peak:Math.max(0,...result.frames.filter(f=>f.at>=play.startedAt&&f.at<=play.completedAt).map(f=>f.rms))}));
  const sameTrack=result.frames.every(f=>f.trackId===started.sourceTrackId&&f.senderTrackId===started.sourceTrackId);
  const receipt={candidateId:process.env.VLAB_CANDIDATE_ID,privatePulseSocket:true,dynamicSourceSwitching:true,continuousProcessedCaptureTrack:sameTrack,sourceTrackId:started.sourceTrackId,settings:result.processing,clipWindows:windows,plays:pulse.plays,frames:result.frames,actualProviderSession:false,physicalEchoAcceptance:false};
  fs.writeFileSync(path.join(evidence,'microphone-feed-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({microphoneFeedProbe:{...receipt,frames:undefined,sourceTrackId:undefined}}));
  assert(sameTrack&&windows.every(w=>w.frames>=3&&w.peak>.005),'Dynamic original processed microphone feed not observed');
} finally {
  if(ws?.readyState===1) {await evaluate(`(async()=>{const p=globalThis.__feedProbe;if(p){clearInterval(p.timer);p.pc.close();p.capture.dispose();await p.context.close()}})()`).catch(()=>{});ws.close();}
  for(const p of pending.values()){clearTimeout(p.timeout);p.reject(Error('Probe closed'));}
  if(chrome?.exitCode===null&&chrome?.signalCode===null)chrome.kill('SIGTERM');
  if(chrome)await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),sleep(2000)]);
  if(chromeTemp)fs.rmSync(chromeTemp,{recursive:true,force:true});
  server?.close();const cleanup=await pulse?.dispose();
  if(cleanup)fs.writeFileSync(path.join(evidence,'cleanup.json'),JSON.stringify(cleanup)+'\n',{mode:0o600});
}
