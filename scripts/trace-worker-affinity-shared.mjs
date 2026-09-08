// Shared existing full Agent DB, leased integration A/B/A, maximum C5. Metadata only.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import{execFileSync}from'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902',meta='/srv/vlab-production-mirror/labs/control/integration.json',owner='codex-db91-contention-20260907';
const m=JSON.parse(fs.readFileSync(meta));assert.equal(m.owner,owner);const unit='openclaw-vlab-production-mirror-v8.service';
const arm=process.argv[2];assert(['A','B','A2','smoke'].includes(arm));
const pid=execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();assert(Number(pid)>1);
for(const s of fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0')){const i=s.indexOf('=');if(i>0)process.env[s.slice(0,i)]=s.slice(i+1);}
assert.equal(process.env.OPENCLAW_WORKER_SESSION_AFFINITY_ENABLE==='1',arm==='B');
const cfg=JSON.parse(fs.readFileSync(root+'/state/openclaw.json'));assert.equal(cfg.gateway.port,24993);assert.equal(cfg.gateway.reload.mode,'off');
const poolCfg=cfg.plugins.entries['vlab-agent-worker-isolation'].config;assert.equal(poolCfg.minWorkers,2);assert.equal(poolCfg.maxWorkers,2);assert.equal(poolCfg.sessionsPerWorker,3);assert.equal(cfg.agents.defaults.maxConcurrent,5);
assert(fs.statfsSync(root).bavail*fs.statfsSync(root).bsize>3*1024**3);
const stamp=Date.now(),report={version:'worker-affinity.1',arm,startedAt:new Date().toISOString(),gatewayPid:pid,commit:execFileSync('git',['-c','safe.directory='+process.cwd(),'-C',process.cwd(),'rev-parse','HEAD'],{encoding:'utf8'}).trim(),databaseBytes:fs.statSync(root+'/state/agents/makaron/agent/openclaw-agent.sqlite').size,jobs:[],maxActive:0};
const output=root+'/state/worker-affinity-shared-20260908/affinity-'+arm+'-'+stamp+'.json',persist=()=>fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});
const tracked=new Map();let client,holds=[];
const {GatewayClient}=await import(root+'/runtime/npm-global/lib/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js');
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('connect deadline')),25000);client=new GatewayClient({url:'ws://127.0.0.1:24993',token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',caps:['tool-events'],scopes:['operator.read','operator.write','operator.admin'],onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:e=>{clearTimeout(timer);reject(e);},onEvent:e=>{
 const p=e.payload,j=tracked.get(p?.runId);if(!j)return;const elapsed=Date.now()-j.start;
 if(e.event==='agent'&&p.stream==='assistant'&&typeof p.data?.text==='string'&&p.data.text.trim())j.firstTextMs??=elapsed;
 if(e.event==='agent'&&p.stream==='status'&&p.data?.phase==='starting-model')j.startingModelMs??=elapsed;
 if(e.event==='chat'&&p.state==='final')j.finalMs=elapsed;
 if(e.event==='chat'&&['error','aborted'].includes(p.state))j.error=p.state;
}});client.start();});
const call=(name,params={},timeoutMs=30000)=>client.request(name,params,{timeoutMs});
const status=async()=>{const s=await call('vlab.workers.status');const active=s.workers.reduce((n,w)=>n+w.activeCount,0);report.maxActive=Math.max(report.maxActive,active);assert(active<=5);assert.equal(JSON.parse(fs.readFileSync(meta)).owner,owner);return s;};
const idle=async()=>{const end=Date.now()+30000;while(Date.now()<end){const s=await status();if(s.pending===0&&s.workers.length===2&&s.workers.every(w=>w.ready&&!w.activeCount&&!w.queued))return s;await new Promise(r=>setTimeout(r,250));}throw Error('private instance not idle');};
async function run(label,key,tool=false){
 const j={label,sessionKey:key,runId:'AFF_'+stamp+'_'+report.jobs.length,start:Date.now(),tool};report.jobs.push(j);tracked.set(j.runId,j);persist();
 await call('sessions.messages.subscribe',{agentId:'makaron',key});j.start=Date.now();
 const message=tool?'请实际调用 Universal Memory 的只读 MCP 工具 umemory_search_index_health。如果它在工具目录中，先查找和获取工具定义，再执行。不要调用写入/修复/同步工具，不修改任何文件，不发送外部消息。拿到真实结果后只回复“检查完成”。':'hi';
 await call('chat.send',{agentId:'makaron',sessionKey:key,message,thinking:'low',deliver:false,idempotencyKey:j.runId,timeoutMs:180000});
 while(Date.now()-j.start<180000){if(j.error)throw Error(j.error);if(j.finalMs!==undefined)break;await status();await new Promise(r=>setTimeout(r,250));}
 assert(Number.isFinite(j.firstTextMs)&&Number.isFinite(j.finalMs),'native visible final deadline');
 const h=await call('chat.history',{agentId:'makaron',sessionKey:key,limit:50});
 assert.equal(h.sessionInfo?.agentRuntime?.id,'vlab-worker');const users=(h.messages??[]).filter(x=>x.role==='user');assert.equal(users.at(-1).idempotencyKey,j.runId+':user');
 const last=(h.messages??[]).filter(x=>x.role==='assistant').at(-1);assert.equal(last.model,'deepseek-v4-pro');assert.notEqual(last.stopReason,'error');
 if(tool){const messages=h.messages??[],u=messages.findLastIndex(x=>x.role==='user');const turn=messages.slice(u+1);const calls=turn.flatMap(x=>Array.isArray(x.content)?x.content.filter(c=>c.type==='toolCall'):[]).filter(c=>/umemory_search_index_health/.test(c.name)||(c.name==='tool_call'&&JSON.stringify(c.arguments??{}).includes('umemory_search_index_health')));assert.equal(calls.length,1,'exact real Universal Memory health call required');const result=turn.find(x=>x.role==='toolResult'&&x.toolCallId===calls[0].id);assert(result&&result.isError!==true);assert(!turn.some(x=>x.role==='toolResult'&&x.isError===true));const payload=JSON.stringify(result);assert(payload.includes('total_documents')&&payload.includes('indexed_documents')&&payload.includes('healthy'),'real health aggregate payload required');j.toolName=calls[0].name;j.toolVerified=true;}
 j.verified=true;tracked.delete(j.runId);persist();console.log(JSON.stringify({phase:'reply',arm,label,runId:j.runId,firstTextMs:j.firstTextMs,finalMs:j.finalMs,toolVerified:j.toolVerified}));return j;
}
try{
 await idle();
 const cycles=arm==='smoke'?1:5;
 for(let i=0;i<cycles;i++){
  {const s=await idle();for(const w of s.workers)await call('vlab.workers.kill',{slot:w.slot});await idle();}
  const key='agent:makaron:explicit:db91-affinity-'+stamp+'-'+i;
  await run('worker-cold-'+i,key+'-warmup');
  for(let h=0;h<3;h++){const hold=(await call('vlab.workers.start',{idempotencyKey:'hold-'+stamp+'-'+i+'-'+h,sessionKey:'agent:makaron:explicit:vlab-worker-affinity-'+stamp+'-'+i+'-'+h,kind:'hold',durationMs:180000})).operation;assert(hold?.operationId);holds.push(hold);}
  const held=await status();assert.equal(held.workers.filter(w=>w.activeCount===3).length,1);
  await run('prime-second-'+i,key,true);
  for(const hold of holds)await call('vlab.workers.cancel',{operationId:hold.operationId});holds=[];await idle();
  await run('revisit-'+i,key,true);await idle();
 }
 if(arm!=='smoke'){
  const key='agent:makaron:explicit:db91-affinity-'+stamp+'-4';
  for(let i=0;i<30;i++){await run('serial-warm-'+i,key,i%5===0);await idle();}
  for(let i=0;i<10;i++){await Promise.all([0,1,2,3,4].map(n=>run('c5-'+i+'-'+n,'agent:makaron:explicit:db91-affinity-'+stamp+'-c5-'+n,i%2===0)));await idle();}
 }
 report.completed=true;
}finally{
 for(const hold of holds)await call('vlab.workers.cancel',{operationId:hold.operationId}).catch(()=>{});
 for(const j of tracked.values())await call('chat.abort',{sessionKey:j.sessionKey,runId:j.runId}).catch(()=>{});
 report.finishedAt=new Date().toISOString();persist();client.stop();
}
console.log(JSON.stringify({phase:'completed',arm,output,jobs:report.jobs.length,completed:report.completed,maxActive:report.maxActive}));
