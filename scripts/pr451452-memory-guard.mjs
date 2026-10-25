// Read-only gate for the user-authorized deferred V rollout. No cron payloads are printed.
import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const required=[['b2033e9e-7f42-45f7-a544-83758ccc7b1d','Memory 10/21批准断点补编译'],['8f64d341-a9ef-4e6d-ae06-736991d77167','Memory 10/21批准补跑 · 完成后独立质检']];
const notBefore=1792596697672;
const pid=execFileSync('systemctl',['show','openclaw-gateway','-p','MainPID','--value'],{encoding:'utf8'}).trim();
const env=Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean).map(s=>[s.slice(0,s.indexOf('=')),s.slice(s.indexOf('=')+1)]));Object.assign(process.env,env);
const cfg=JSON.parse(fs.readFileSync('/home/openclaw/.openclaw/openclaw.json'));const token=cfg.gateway.auth.token.replace(/\$\{([^}]+)\}/g,(_,k)=>env[k]);const {GatewayClient}=await import('/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist/plugin-sdk/gateway-runtime.js');let c;
await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('connect timeout')),20000);c=new GatewayClient({url:'ws://127.0.0.1:22793',token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read'],onHelloOk:()=>{clearTimeout(t);resolve()},onConnectError:reject});c.start()});
const call=(m,p)=>c.request(m,p,{timeoutMs:20000});
try{
 let jobs=[],offset=0;for(let i=0;i<50;i++){const r=await call('cron.list',{includeDisabled:true,limit:200,offset});jobs.push(...r.jobs??[]);if(!r.hasMore)break;offset=r.nextOffset??offset+200;}
 const result={at:new Date().toISOString(),gatewayPid:Number(pid),state:'waiting',jobs:[]};
 for(const[id,name]of required){const j=jobs.find(j=>j.id===id);const r=await call('cron.runs',{id,limit:5});const entries=(r.entries??[]).filter(e=>Number(e.runAtMs??e.ts??0)>=notBefore&&(!e.action||e.action==='finished')).sort((a,b)=>Number(b.runAtMs??b.ts)-Number(a.runAtMs??a.ts));const e=entries[0];const s=j?.state??{};
 const runningAtMs=s.runningAtMs??null;const lastRunAtMs=s.lastRunAtMs??e?.runAtMs??null;const status=e?.status??s.lastRunStatus??s.lastStatus??null;
 result.jobs.push({id,name,present:!!j,enabled:j?.enabled??null,kind:j?.schedule?.kind??null,nextRunAtMs:s.nextRunAtMs??null,runningAtMs,lastRunAtMs,status,finishedReceipt:!!e,completed:!runningAtMs&&!!e&&['ok','success'].includes(status),error:typeof e?.error==='string'?e.error.slice(0,200):null});}
 const runningMemory=jobs.filter(j=>j.state?.runningAtMs&&/memory|记忆/i.test(j.name??''));result.otherRunningMemory=runningMemory.filter(j=>!required.some(([id])=>id===j.id)).map(j=>({id:j.id,name:j.name,runningAtMs:j.state.runningAtMs}));
 const qa=result.jobs[1];const qaSoon=qa.enabled&&!qa.completed&&qa.nextRunAtMs&&qa.nextRunAtMs<=Date.now()+15*60*1000;result.upcomingQaWithin15Minutes=!!qaSoon;if(result.jobs[0].completed&&!runningMemory.length&&!qaSoon)result.state='ready';else if(result.jobs.some(j=>j.finishedReceipt&&!j.runningAtMs&&!['ok','success'].includes(j.status)))result.state='failed';
 fs.writeFileSync('/var/lib/v-upgrade-maintenance/20261021/pr451452-memory-guard.json',JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));
}finally{c.stop()}
