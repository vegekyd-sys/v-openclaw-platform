// Dedicated acceptance sessions only. No channel sends or historical replay.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const root='/home/openclaw/.openclaw',release='/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1';
const pid=execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();
assert(Number(pid)>1);
for(const e of fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0')){const i=e.indexOf('=');if(i>0)process.env[e.slice(0,i)]=e.slice(i+1);}
assert.equal(process.env.V_RELEASE_VERSION,'v2026.9.1-db91.1');
const cfg=JSON.parse(fs.readFileSync(root+'/openclaw.json'));
const {GatewayClient}=await import(release+'/core/dist/plugin-sdk/gateway-runtime.js');
const stamp=Date.now(),report={stamp,pid,rows:[],completed:false},out=root+'/backups/v2026.9.1-db91.1/verification-'+stamp+'.json',tracked=new Map();
const save=()=>fs.writeFileSync(out,JSON.stringify(report,null,2),{mode:0o600});
let client;
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Connect deadline')),30000);client=new GatewayClient({url:'ws://127.0.0.1:22793',token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',caps:['tool-events'],scopes:['operator.read','operator.write','operator.admin'],onHelloOk:()=>{clearTimeout(timer);resolve()},onConnectError:reject,onEvent:e=>{const p=e.payload,j=tracked.get(p?.runId);if(!j)return;if(e.event==='agent'&&p.stream==='assistant'&&p.data?.text?.trim())j.firstTextMs??=Date.now()-j.start;if(e.event==='chat'&&p.state==='final')j.finalMs=Date.now()-j.start;}});client.start()});
const call=(m,p={})=>client.request(m,p,{timeoutMs:30000});
async function run(label,key){
 const id='DB91_PROD_'+stamp+'_'+label,j={id,key,start:Date.now()};report.rows.push(j);tracked.set(id,j);save();
 try{
  await call('sessions.messages.subscribe',{agentId:'makaron',key});
  await call('chat.send',{agentId:'makaron',sessionKey:key,message:'独立发布验收 '+id+'。仅调用一次 exec 执行只读命令 date -u "+%s '+id+'"。不要处理历史任务、读写其他文件或调用网络服务。最终只回复实际命令输出。',thinking:'low',deliver:false,idempotencyKey:id,timeoutMs:180000});
  while(Date.now()-j.start<210000){
   const h=await call('chat.history',{agentId:'makaron',sessionKey:key,limit:50}),at=h.messages.findLastIndex(m=>m.role==='user');
   if(at>=0&&h.messages[at].idempotencyKey===id+':user'){
    const turn=h.messages.slice(at+1),last=turn.filter(m=>m.role==='assistant').at(-1);
    if(last?.stopReason==='stop'){
     assert.equal(h.sessionInfo?.agentRuntime?.id,'vlab-worker');
     const calls=turn.flatMap(m=>(m.content??[]).filter(c=>c.type==='toolCall'&&c.name==='exec'&&JSON.stringify(c.arguments).includes(id)));
     assert.equal(calls.length,1);assert(turn.some(m=>m.role==='toolResult'&&m.toolCallId===calls[0].id&&!m.isError&&JSON.stringify(m).includes(id)));
     assert(JSON.stringify(last.content).includes(id));j.model=last.model;
     const s=await call('sessions.list',{agentId:'makaron',search:key,limit:5});
     if(s.sessions.find(s=>s.key===key)?.hasActiveRun===false){j.verified=true;j.totalMs=Date.now()-j.start;console.log(JSON.stringify(j));return;}
    }
   }
   await new Promise(r=>setTimeout(r,1000));
  }
  throw Error('Real tool/final/idle deadline');
 }catch(e){j.error=String(e);throw e;}finally{tracked.delete(id);save();}
}
try{
 const w=await call('vlab.workers.status');assert(w.workers.some(w=>w.ready));report.workersBefore=w.workers.map(w=>({slot:w.slot,active:w.activeCount}));
 for(let i=0;i<2;i++){const key='agent:makaron:explicit:db91-prod-'+stamp+'-'+i;await run('new'+i,key);await run('revisit'+i,key);}
 const results=await Promise.allSettled([0,1,2,3,4].map(i=>run('c5-'+i,'agent:makaron:explicit:db91-prod-'+stamp+'-c5-'+i)));
 assert(results.every(r=>r.status==='fulfilled'),'Concurrent acceptance failure; see retained rows');
 assert.equal(execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim(),pid);
 report.completed=true;
}finally{save();client.stop();}
console.log(JSON.stringify({completed:true,rows:report.rows.length,out}));
