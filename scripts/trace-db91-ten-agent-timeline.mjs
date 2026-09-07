// Full shared Lab only: two real 10-session rounds with read-only timing probes.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902',unit='openclaw-vlab-production-mirror-v8.service';
const owner='codex-db91-contention-20260907';
const count=Number(process.env.DB91_CASES??15);assert(Number.isInteger(count)&&count>=1&&count<=15);
const labels=(process.env.DB91_ROUNDS??'initial,warm').split(',');
const read=p=>JSON.parse(fs.readFileSync(p));
const guard=()=>assert.equal(read('/srv/vlab-production-mirror/labs/control/integration.json').owner,owner);guard();
const pid=execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();assert(Number(pid)>1);
for(const v of fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0')){const i=v.indexOf('=');if(i>0)process.env[v.slice(0,i)]=v.slice(i+1);}
assert.equal(process.env.OPENCLAW_CONFIG_PATH,root+'/state/openclaw.json');
const cfg=read(process.env.OPENCLAW_CONFIG_PATH);assert.equal(cfg.gateway.port,24993);
assert(fs.statfsSync(root).bavail*fs.statfsSync(root).bsize>3*1024**3);
const {GatewayClient}=await import(root+'/runtime/npm-global/lib/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js');
const tracked=new Map();let client;
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{client?.stop();reject(Error('connection deadline'));},20000);
 client=new GatewayClient({url:'ws://127.0.0.1:24993',token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.write','operator.admin'],onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:e=>{clearTimeout(timer);reject(e);},onEvent:event=>{
  const p=event.payload,j=tracked.get(p?.runId);if(!j)return;
  const key=[event.event,p.stream??'',p.data?.phase??p.state??''].join('/'),at=Date.now()-j.start;
  const record=j.events[key]??={firstMs:at,lastMs:at,count:0};record.lastMs=at;record.count++;
  const visibleText=event.event==='agent'&&p.stream==='assistant'?p.data?.text:
   event.event==='chat'&&['delta','final'].includes(p.state)?
    (p.message?.content??[]).filter(c=>c.type==='text').map(c=>c.text).join(''):'';
  if(typeof visibleText==='string'&&visibleText.trim()&&j.firstTextMs===undefined){
   j.firstTextMs=at;j.firstTextEvent=key;j.firstTextChars=visibleText.length;
   console.log(JSON.stringify({phase:'first-text',runId:j.runId,elapsedMs:at,event:key}));
  }
  if(event.event==='chat'&&p.state==='final')j.finalEventMs=at;
 }});client.start();
});
const call=(method,params={},timeoutMs=20000)=>client.request(method,params,{timeoutMs});
const workerSnapshot=async()=>{const w=await call('vlab.workers.status');return {at:Date.now(),pending:w.pending,workers:w.workers.map(v=>({slot:v.slot,pid:v.pid,ready:v.ready,active:v.active?.map(a=>({runId:a.runId,sessionKey:a.sessionKey}))??[],activeCount:v.activeCount,queued:v.queued}))};};
const idle=async()=>{
 const until=Date.now()+30000;
 do{const w=await workerSnapshot(),s=await call('sessions.list',{limit:1000});
  assert(!s.hasMore);if(!w.pending&&w.workers.every(v=>v.ready&&!v.activeCount&&!v.queued)&&!(s.sessions??[]).some(v=>v.hasActiveRun))return w;
  await new Promise(r=>setTimeout(r,1000));
 }while(Date.now()<until);throw Error('runtime not idle');
};
const stamp=Date.now(),report={owner,gatewayPid:pid,startedAt:new Date().toISOString(),variant:process.env.DB91_VARIANT??'candidate',count,configUnchanged:true,rounds:[]};
const output=root+'/state/db91-c5-release-20260907/timeline-'+stamp+'.json';
const persist=()=>fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});
try{
 for(const label of labels){
  guard();const before=await idle();console.log(JSON.stringify({phase:'round-start',label,before}));
  const round={label,before,startedAt:Date.now(),samples:[],jobs:[]};report.rounds.push(round);persist();
  let sampling=true;
  const sampler=(async()=>{while(sampling){const at=Date.now();try{const snapshot=await workerSnapshot();round.samples.push({...snapshot,rpcMs:Date.now()-at});}catch(e){round.samples.push({at,error:String(e)});}await new Promise(r=>setTimeout(r,500));}})();
  const outcomes=await Promise.allSettled(Array.from({length:count},async(_,i)=>{
   const runId='DB91_TIMELINE_'+stamp+'_'+label+'_'+i,key='agent:makaron:explicit:db91-timeline-'+stamp+'-'+label+'-'+i;
   const j={runId,sessionKey:key,start:Date.now(),events:{},historyRetries:0};round.jobs.push(j);tracked.set(runId,j);
   let done=false,sent=false;
   try{
    const r=await call('chat.send',{agentId:'makaron',sessionKey:key,deliver:false,idempotencyKey:runId,timeoutMs:150000,message:`VLab内部真实Agent并发验收。不要读写业务文件、记忆或配置，不访问网络或浏览器，不委托，不发外部消息。首先直接输出一句可见中文“收到，我现在开始检查本次测试。”，然后只调用exec执行 printf '${runId}_TOOL\\n'。看到真实工具结果后只回复 ${runId}_FINAL。`});
    sent=true;assert.equal(r.runId,runId);j.admittedMs=Date.now()-j.start;
    while(Date.now()-j.start<150000){
     await new Promise(r=>setTimeout(r,1500));let h;
     try{h=await call('chat.history',{agentId:'makaron',sessionKey:key,limit:30});}catch(e){if(e.retryable||e.code==='UNAVAILABLE'){j.historyRetries++;continue;}throw e;}
     const messages=h.messages??[];
     const a=messages.find(m=>m.role==='assistant'&&(m.content??[]).some(c=>c.type==='text'&&c.text.includes(runId+'_FINAL')));
     if(!a)continue;
     assert.equal(a.model,'deepseek-v4-pro');assert.equal(h.sessionInfo?.agentRuntime?.id,'vlab-worker');
     assert(messages.some(m=>/tool/i.test(m.role)&&!m.isError&&JSON.stringify(m).includes(runId+'_TOOL')));
     j.replyVisibleMs=Date.now()-j.start;j.realToolResult=true;j.model=a.model;done=true;
     console.log(JSON.stringify({phase:'reply',label,index:i,elapsedMs:j.replyVisibleMs,events:j.events}));return;
    }throw Error('150s deadline');
   }catch(error){j.error=String(error);throw error;}
   finally{if(sent&&!done)await call('chat.abort',{sessionKey:key,runId}).catch(()=>{});}
  }));
  sampling=false;await sampler;round.after=await idle();round.finishedAt=Date.now();persist();
  assert(outcomes.every(o=>o.status==='fulfilled'),'real agent round failure');
 }
 report.completed=true;persist();console.log(JSON.stringify({phase:'timeline-complete',output}));
}finally{persist();client.stop();}
