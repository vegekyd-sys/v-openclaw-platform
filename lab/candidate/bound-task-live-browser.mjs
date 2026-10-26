// Existing native-audio acceptance method: private Pulse microphone -> original
// H5 getUserMedia -> real model connection. Only user PCM is synthetic.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import {spawn} from 'node:child_process';import {setTimeout as sleep} from 'node:timers/promises';
import {createPrivatePulseMicrophone} from '../gpt-live-candidate-native/private-pulse.mjs';
const root=process.env.BOUND_TASK_EVIDENCE_DIR;if(!path.isAbsolute(root??''))throw Error('Explicit evidence directory required');
const ready=JSON.parse(fs.readFileSync(root+'/ready.private.json'));
process.env.VLAB_CANDIDATE_ID=ready.candidate;process.env.OPENCLAW_STATE_DIR=ready.state;
const scratch=path.join(ready.state,'bound-live-browser');fs.mkdirSync(scratch,{recursive:true,mode:0o700});
const pulse=await createPrivatePulseMicrophone(path.join(scratch,'pulse'));
let stderr='',next=1,ending=false;const pending=new Map(),events=[];
const chromeTemp=fs.mkdtempSync('/tmp/v-bound-chrome-');
const chrome=spawn('/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-features=AudioServiceSandbox','--remote-debugging-port=0','--user-data-dir='+path.join(scratch,'profile'),'--use-fake-ui-for-media-stream','about:blank'],{env:{...pulse.environment,TMPDIR:chromeTemp,TMP:chromeTemp,TEMP:chromeTemp},stdio:['ignore','ignore','pipe']});
chrome.stderr.on('data',b=>stderr=(stderr+String(b)).slice(-15000));
for(let i=0;i<100&&!stderr.includes('DevTools listening on ');i++)await sleep(100);
const browserUrl=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];if(!browserUrl){chrome.kill('SIGTERM');await pulse.dispose();throw Error('Owned Chrome did not start: '+stderr.slice(-1800));}
const port=new URL(browserUrl).port;
const pages=await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json());
const ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
ws.addEventListener('message',e=>{const p=JSON.parse(String(e.data));if(p.id){const row=pending.get(p.id);if(row){pending.delete(p.id);clearTimeout(row.timer);p.error?row.reject(Error(p.error.message)):row.resolve(p.result);}}else if(p.method==='Runtime.consoleAPICalled')events.push(p.params);});
const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=next++,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},30000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result?.value;};
await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Page.navigate',{url:`http://127.0.0.1:${ready.voicePort}/?phone=bound-task-test`});
const server=http.createServer(async(req,res)=>{
 if(req.headers.authorization!==ready.controlKey){res.writeHead(403);res.end();return;}
 let body='';for await(const b of req)body+=b;
 try{const p=JSON.parse(body||'{}');let result;
  if(p.op==='snapshot')result=await evaluate(`({text:document.body.innerText,models:[...document.getElementById('voiceModel').options].map(o=>({value:o.value,disabled:o.disabled})),buttons:[...document.querySelectorAll('button')].map(b=>({id:b.id,text:b.innerText,disabled:b.disabled,hidden:b.hidden}))})`);
  else if(p.op==='model')result=await evaluate(`(()=>{const e=document.getElementById('voiceModel');e.value=${JSON.stringify(p.model)};e.dispatchEvent(new Event('change',{bubbles:true}));return e.value;})()`);
  else if(p.op==='click'){
   const r=await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(p.id)});if(!e||e.disabled||e.hidden)throw Error('Original control unavailable');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
   await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...r,button:'left',clickCount:1});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...r,button:'left',clickCount:1});result={clicked:p.id};
  }else if(p.op==='play'){
   if(!['direct','chat','cancel','native'].includes(p.clip))throw Error('Unknown synthetic user clip');
   result=await pulse.play(path.join(process.env.BOUND_TASK_USER_CLIPS,p.clip+'.wav'),p.clip).done;
  }else if(p.op==='screenshot'){
   const img=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(root+'/voice-screen.png',Buffer.from(img.data,'base64'));result={saved:true};
  }else if(p.op==='close'){ending=true;result={closing:true};}
  else throw Error('Unknown browser operation');
  fs.writeFileSync(root+'/browser-events.json',JSON.stringify(events),{mode:0o600});res.end(JSON.stringify({ok:true,result}));
 }catch(error){res.end(JSON.stringify({ok:false,error:error.message}));}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
fs.writeFileSync(root+'/browser.private.json',JSON.stringify({port:server.address().port,pid:process.pid,chromePid:chrome.pid,source:'private-user-pcm-real-rtc'}),{mode:0o600});
process.once('SIGTERM',()=>ending=true);process.once('SIGINT',()=>ending=true);
while(!ending)await sleep(300);
server.close();ws.close();chrome.kill('SIGTERM');await pulse.dispose();
