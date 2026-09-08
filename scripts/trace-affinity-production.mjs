// Native production A/B, no Worker kills, holds, pool resizing or channel messages.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import{execFileSync}from'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const root='/home/openclaw/.openclaw',core='/opt/openclaw-2026.9.1-v/openclaw',dir=root+'/backups/worker-affinity-production-20260908';
const arm=process.argv[2];assert(['A','B','smokeA','smokeB'].includes(arm));
const serialOnly=process.argv.includes('--serial-only');
const pid=execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();assert(Number(pid)>1);
for(const e of fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0')){const i=e.indexOf('=');if(i>0)process.env[e.slice(0,i)]=e.slice(i+1);}
assert.equal(process.env.OPENCLAW_WORKER_SESSION_AFFINITY_ENABLE==='1',arm.endsWith('B'));
const cfg=JSON.parse(fs.readFileSync(root+'/openclaw.json'));assert.equal(cfg.gateway.port,22793);const wc=cfg.plugins.entries['vlab-agent-worker-isolation'].config;
assert.equal(cfg.mcp.servers['universal-memory'].enabled,false);assert.equal(JSON.parse(fs.readFileSync(wc.workerConfigPath)).mcp.servers['universal-memory'].enabled,false);
const stamp=Date.now(),report={version:'worker-affinity.production.1',arm,startedAt:new Date().toISOString(),gatewayPid:pid,umDisabled:true,workerLimits:{min:wc.minWorkers,max:wc.maxWorkers,slots:wc.sessionsPerWorker},databaseBytes:fs.statSync(root+'/agents/makaron/agent/openclaw-agent.sqlite').size,jobs:[],maxOwnActive:0,maxObservedTotalActive:0};
report.serialOnly=serialOnly;
const output=dir+'/affinity-'+arm+'-'+stamp+'.json',persist=()=>fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});
const tracked=new Map();let client;
const{GatewayClient}=await import(core+'/dist/plugin-sdk/gateway-runtime.js');
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{client?.stop();reject(Error('connect deadline'));},25000);client=new GatewayClient({url:'ws://127.0.0.1:22793',token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',caps:['tool-events'],scopes:['operator.read','operator.write','operator.admin'],onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:e=>{clearTimeout(timer);reject(e);},onEvent:e=>{const p=e.payload,j=tracked.get(p?.runId);if(!j)return;const elapsed=Date.now()-j.start;if(e.event==='agent'&&p.stream==='assistant'&&typeof p.data?.text==='string'&&p.data.text.trim())j.firstTextMs??=elapsed;if(e.event==='chat'&&p.state==='final')j.finalMs=elapsed;if(e.event==='chat'&&['error','aborted'].includes(p.state))j.error=p.state;}});client.start();});
const call=(name,params={},timeoutMs=30000)=>client.request(name,params,{timeoutMs});
async function status(){const s=await call('vlab.workers.status');const n=s.workers.reduce((a,w)=>a+w.activeCount,0);report.maxObservedTotalActive=Math.max(report.maxObservedTotalActive,n);return{totalActive:n,pending:s.pending,workers:s.workers.length};}
async function run(label,key,tool=false){
 const j={label,sessionKey:key,runId:'AFF_PROD_'+stamp+'_'+report.jobs.length,start:Date.now(),tool};report.jobs.push(j);tracked.set(j.runId,j);report.maxOwnActive=Math.max(report.maxOwnActive,tracked.size);assert(tracked.size<=5);persist();
 j.loadBefore=await status();await call('sessions.messages.subscribe',{agentId:'makaron',key});j.start=Date.now();
 const command='date -u "+%s '+j.runId+'"';
 const message=tool?'本次独立验收编号 '+j.runId+'。请现在重新调用本机 exec 工具执行这条只读命令：'+command+' 。必须执行本轮命令，不能复用上轮结果，也不能只口头说完成。不要读写其他文件或调用网络工具。最终只回复命令的实际输出。':'hi';
 const ack=await call('chat.send',{agentId:'makaron',sessionKey:key,message,thinking:'low',deliver:false,idempotencyKey:j.runId,timeoutMs:180000});j.ack={runId:ack.runId,status:ack.status,queued:ack.queued};persist();
 while(Date.now()-j.start<180000){if(j.error)throw Error(j.error);if(j.firstTextMs!==undefined&&j.finalMs!==undefined)break;await new Promise(r=>setTimeout(r,250));}
 assert(Number.isFinite(j.firstTextMs)&&Number.isFinite(j.finalMs),'native visible final deadline');
 const h=await call('chat.history',{agentId:'makaron',sessionKey:key,limit:50});assert.equal(h.sessionInfo?.agentRuntime?.id,'vlab-worker');const users=h.messages.filter(x=>x.role==='user');assert.equal(users.at(-1).idempotencyKey,j.runId+':user');const last=h.messages.filter(x=>x.role==='assistant').at(-1);assert.equal(last.model,'deepseek-v4-pro');assert.notEqual(last.stopReason,'error');
 if(tool){const turn=h.messages.slice(h.messages.findLastIndex(x=>x.role==='user')+1),calls=turn.flatMap(x=>Array.isArray(x.content)?x.content.filter(c=>c.type==='toolCall'):[]).filter(c=>(c.name==='exec'||c.name==='tool_call')&&JSON.stringify(c.arguments??{}).includes(j.runId));assert.equal(calls.length,1,'fresh native exec required');const result=turn.find(x=>x.role==='toolResult'&&x.toolCallId===calls[0].id);assert(result&&result.isError!==true);assert(!turn.some(x=>x.role==='toolResult'&&x.isError===true));assert(JSON.stringify(result).includes(j.runId)&&/\d{10}/.test(JSON.stringify(result)));j.toolVerified=true;}
 // A visible final can precede the native session's idle boundary. Do not
 // accidentally exercise queued-turn routing in the sequential comparison.
 const idleStart=Date.now();let idle=false;while(Date.now()-idleStart<60000){const s=await call('sessions.list',{limit:100});const row=s.sessions.find(x=>x.key===key);if(row&&row.hasActiveRun===false){idle=true;break;}await new Promise(r=>setTimeout(r,500));}j.idleWaitMs=Date.now()-idleStart;assert(idle,'own session did not reach native idle');
 j.verified=true;j.slow=j.firstTextMs>=80000;tracked.delete(j.runId);persist();console.log(JSON.stringify({phase:j.slow?'slow-reply':'reply',arm,label,runId:j.runId,firstTextMs:j.firstTextMs,finalMs:j.finalMs,toolVerified:j.toolVerified,idleWaitMs:j.idleWaitMs,loadBefore:j.loadBefore}));
}
try{
 for(let i=0;i<(arm.startsWith('smoke')?1:5);i++){const key='agent:makaron:explicit:affinity-prod-'+stamp+'-'+i;await run('new-session-'+i,key);await run('revisit-'+i,key,true);}
 if(!arm.startsWith('smoke')){const key='agent:makaron:explicit:affinity-prod-'+stamp+'-4';for(let i=0;i<30;i++)await run('serial-warm-'+i,key,i%5===0);if(!serialOnly)for(let i=0;i<10;i++)await Promise.all([0,1,2,3,4].map(n=>run('c5-'+i+'-'+n,'agent:makaron:explicit:affinity-prod-'+stamp+'-c5-'+n,i%2===0)));}
 report.completed=true;
}finally{for(const j of tracked.values())await call('chat.abort',{sessionKey:j.sessionKey,runId:j.runId}).catch(()=>{});report.finishedAt=new Date().toISOString();persist();client.stop();}
console.log(JSON.stringify({phase:'completed',arm,output,jobs:report.jobs.length,completed:report.completed,maxOwnActive:report.maxOwnActive,maxObservedTotalActive:report.maxObservedTotalActive}));
