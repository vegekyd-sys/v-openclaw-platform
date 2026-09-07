// Private-instance acceptance: cancel one real executing tool, preserve its peer.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const meta=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/db91-fix.json'));
assert.equal(meta.owner,'codex-db91-contention-20260907');
const root=meta.root,pid=execFileSync('systemctl',['show',meta.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();assert(Number(pid)>1);
for(const s of fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0')){const n=s.indexOf('=');if(n>0)process.env[s.slice(0,n)]=s.slice(n+1);}
assert.equal(process.env.OPENCLAW_CONFIG_PATH,root+'/state/openclaw.json');
const cfg=JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH));assert.equal(cfg.gateway.port,26300);
const {GatewayClient}=await import(root+'/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');
const stamp=Date.now(),jobs=['cancel','peer'].map(label=>({label,runId:'DB91_STREAM_CANCEL_'+stamp+'_'+label,sessionKey:'agent:makaron:explicit:db91-stream-cancel-'+stamp+'-'+label,events:[]}));
let client;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('connect deadline')),15000);client=new GatewayClient({
 url:'ws://127.0.0.1:26300',token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',caps:['tool-events'],scopes:['operator.read','operator.write','operator.admin'],
 onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:e=>{clearTimeout(timer);reject(e);},onEvent:e=>{
  const p=e.payload,j=jobs.find(j=>j.runId===p?.runId||j.sessionKey===p?.sessionKey);if(!j)return;
  j.events.push({at:Date.now(),event:e.event,stream:p.stream,phase:p.data?.phase??p.state});
  if(e.event==='agent'&&p.stream==='tool'&&p.data?.phase==='start')j.toolStartedAt??=Date.now();
  if(e.event==='agent'&&p.stream==='assistant'&&p.data?.text?.trim())j.textAt??=Date.now();
 }});client.start();});
const call=(method,params={},timeoutMs=15000)=>client.request(method,params,{timeoutMs});
const output=root+'/workspace/stream-cancel-'+stamp+'.json',report={startedAt:stamp,jobs};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 const before=await call('vlab.workers.status');assert(!before.pending&&before.workers.every(w=>!w.activeCount&&!w.queued));
 await Promise.all(jobs.map(async(j,index)=>{
  await call('sessions.messages.subscribe',{agentId:'makaron',key:j.sessionKey});j.startedAt=Date.now();
  await call('chat.send',{agentId:'makaron',sessionKey:j.sessionKey,idempotencyKey:j.runId,deliver:false,timeoutMs:120000,
   message:`这是隔离VLab验收，不读写业务文件、不联网、不委托、不发外部消息。只调用exec执行 sleep ${index===0?35:8}; printf '${j.runId}_TOOL\\n'。必须等待真实工具结束，然后只回复 ${j.runId}_FINAL。`});
 }));
 const until=Date.now()+60000;while(!jobs[0].toolStartedAt&&Date.now()<until)await wait(200);
 assert(jobs[0].toolStartedAt,'cancelled job never reached real tool execution');
 report.abortAt=Date.now();report.abortResult=await call('chat.abort',{sessionKey:jobs[0].sessionKey,runId:jobs[0].runId});
 console.log(JSON.stringify({phase:'aborted-own-executing-job',afterMs:report.abortAt-jobs[0].startedAt}));
 const deadline=Date.now()+90000;
 while(Date.now()<deadline){
  const w=await call('vlab.workers.status');
  if(!w.pending&&w.workers.every(w=>!w.activeCount&&!w.queued)){report.after=w.integration.nativeHarnessEventParity;break;}
  await wait(500);
 }
 assert(report.after,'private jobs did not settle');
 for(const j of jobs){
  const h=await call('chat.history',{agentId:'makaron',sessionKey:j.sessionKey,limit:40});
  const final=h.messages.some(m=>m.role==='assistant'&&(m.content??[]).some(c=>c.type==='text'&&c.text.includes(j.runId+'_FINAL')));
  j.finalPresent=final;j.hasActiveRun=h.sessionInfo?.hasActiveRun;
  if(j.label==='cancel')assert.equal(final,false,'cancelled task published a success final');
  else {assert(final,'peer final absent');assert(h.messages.some(m=>/tool/i.test(m.role)&&!m.isError&&JSON.stringify(m).includes(j.runId+'_TOOL')));assert(j.textAt,'peer visible text absent');}
 }
 assert.equal(report.after.eventRelayFailures,before.integration.nativeHarnessEventParity.eventRelayFailures);
 report.completed=true;console.log(JSON.stringify({phase:'cancel-peer-passed',output,jobs:jobs.map(j=>({label:j.label,toolStartedAt:j.toolStartedAt,textAt:j.textAt,finalPresent:j.finalPresent}))}));
}finally{
 for(const j of jobs)await call('chat.abort',{sessionKey:j.sessionKey,runId:j.runId}).catch(()=>{});
 fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});client.stop();
}
