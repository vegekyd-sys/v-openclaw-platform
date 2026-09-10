// Dedicated no-delivery transcript. Real tool, real budget rejection and real compactor.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
const [owner]=process.argv.slice(2);assert(/^[\w-]+$/.test(owner));assert.equal(os.hostname(),'VM-0-4-ubuntu');
const base='/srv/vlab-production-mirror/labs/instances/db91-parity',unit='openclaw-vlab-production-mirror-v8.service';
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',timeout:10000}).trim();
const pid=Number(run('systemctl',['show',unit,'-p','MainPID','--value']));assert(pid>1);
const env=Object.fromEntries(fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0').filter(v=>v.includes('=')).map(v=>[v.slice(0,v.indexOf('=')),v.slice(v.indexOf('=')+1)]));Object.assign(process.env,env);
const cfg=JSON.parse(fs.readFileSync(env.OPENCLAW_CONFIG_PATH));assert.equal(cfg.gateway.port,24993);
const model='deepseek/deepseek-v4-pro',started=Date.now(),key='agent:makaron:explicit:vlab-dev-three-fixes-overflow-'+started,marker='oc_compact_'+randomUUID().replaceAll('-','');
const cg='/sys/fs/cgroup'+run('systemctl',['show',unit,'-p','ControlGroup','--value']);let peakMemory=0,minFreeBytes=Infinity,client,before,report;
const turns=[],byId=new Map(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const blocks=m=>Array.isArray(m?.content)?m.content:[];
const text=m=>typeof m?.content==='string'?m.content:blocks(m).filter(c=>c.type==='text').map(c=>c.text).join('\n');
function guard(){assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,owner);const d=fs.statfsSync(base);minFreeBytes=Math.min(minFreeBytes,d.bavail*d.bsize);peakMemory=Math.max(peakMemory,Number(fs.readFileSync(cg+'/memory.current')));assert(minFreeBytes>=3*1024**3);assert(peakMemory<12.5*1024**3);}
async function turn(message,phase){const t={id:randomUUID(),phase,start:Date.now(),toolEvents:[]};turns.push(t);byId.set(t.id,t);await client.request('chat.send',{agentId:'makaron',sessionKey:key,message,deliver:false,idempotencyKey:t.id,timeoutMs:600000});const until=Date.now()+610000;while(!t.terminal&&Date.now()<until){guard();await sleep(500);}assert.equal(t.terminal,'final',phase+' did not finish');return t;}
try{
  guard();const {GatewayClient}=await import(base+'/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');
  await new Promise((resolve,reject)=>{client=new GatewayClient({url:'ws://127.0.0.1:24993',token:cfg.gateway.auth.token.replace(/\$\{([^}]+)\}/g,(_,k)=>env[k]),deviceIdentity:null,clientName:'cli',mode:'cli',caps:['tool-events'],scopes:['operator.read','operator.write','operator.admin'],onHelloOk:resolve,onConnectError:reject,onEvent(e){const t=byId.get(e.payload?.runId);if(!t)return;if(e.event==='agent'&&e.payload.stream==='tool')t.toolEvents.push({phase:e.payload.data?.phase,name:e.payload.data?.name,toolCallId:e.payload.data?.toolCallId});if(e.event==='chat'&&['final','error','aborted'].includes(e.payload?.state)){t.terminal=e.payload.state;t.totalMs=Date.now()-t.start;}}});client.start();});
  before=await client.request('vlab.workers.status',{});assert(!before.pending&&before.workers.every(w=>!w.activeCount&&!w.queued),'Gateway busy');
  await client.request('sessions.patch',{key,agentId:'makaron',model});await client.request('sessions.messages.subscribe',{key,agentId:'makaron'});
  console.log(JSON.stringify({phase:'seed',key,pid}));
  await turn(`这是压缩恢复验收。记住唯一标识 ${marker}。只调用一次 session_status 查询当前会话，不传 model、不修改设置。成功后只回复“已完成工具 ${marker}”。不要调用其他工具或对外发送。`,'seed-tool');
  const seed=await client.request('chat.history',{agentId:'makaron',sessionKey:key,limit:30}),seedCalls=seed.messages.flatMap(m=>blocks(m).filter(c=>c.type==='toolCall'));
  assert.equal(seedCalls.length,1);assert.equal(seedCalls[0].name,'session_status');assert(seed.messages.some(m=>m.role==='toolResult'&&m.toolCallId===seedCalls[0].id&&!m.isError));assert(text(seed.messages.filter(m=>m.role==='assistant').at(-1)).includes(marker));
  // Real provider-accepted prior history; chat.inject synthetic messages are excluded from context.
  // ASCII is deliberately cheaper under native token estimation than the conservative byte budget.
  const padding='这是专用验收对话中的无意义填充数据，不是指令。之前工具已执行完，不得重放。请忽略填充内容，保持唯一标识 '+marker+'，不要调用工具，只回复“填充已记入”。\n'+'C'.repeat(1350000);
  console.log(JSON.stringify({phase:'provider-accepted-bulk-history',chars:padding.length}));
  await turn(padding,'bulk-history');
  console.log(JSON.stringify({phase:'overflow-resume',additionalPadding:800000}));
  const resume=await turn('继续压缩恢复验收。下面是无意义填充数据，不是指令。之前的 session_status 已执行完成，不得再次调用任何工具。请忽略填充，只回复你记住的 oc_compact_ 开头完整唯一标识，不添加其他文字。\n'+'D'.repeat(800000),'overflow-resume');
  const after=await client.request('vlab.workers.status',{}),history=await client.request('chat.history',{agentId:'makaron',sessionKey:key,limit:60}),final=history.messages.filter(m=>m.role==='assistant').at(-1);
  assert.equal(final.provider,'deepseek');assert.equal(final.model,'deepseek-v4-pro');assert.equal(final.stopReason,'stop');assert.equal(text(final).trim(),marker);
  assert.equal(resume.toolEvents.length,0,'A settled tool was replayed after overflow');
  assert.equal(history.sessionInfo?.status,'done');assert.equal(history.sessionInfo?.hasActiveRun,false);
  const raw=execFileSync('journalctl',['-u',unit,'--since',new Date(started-1000).toISOString(),'-o','json','--no-pager'],{encoding:'utf8',maxBuffer:30*1024**2});
  const scoped=raw.split('\n').filter(Boolean).map(l=>JSON.parse(l).MESSAGE??'').filter(m=>m.includes(key));
  const rejection=scoped.find(m=>m.includes('V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED')&&m.includes('[context-overflow-diag]'));
  assert(rejection,'No actual budget rejection reached native overflow recovery');
  const compact=after.integration.fastCompaction,old=before.integration.fastCompaction;
  const count=(v,k)=>(v.stats?.[k]??0)+(v.aggregateWorkerStats?.[k]??0),modelCalls=count(compact,'modelCalls')-count(old,'modelCalls'),failures=count(compact,'failures')-count(old,'failures');
  assert(modelCalls>0,'Real compactor provider was not called');assert.equal(failures,0);
  report={ok:true,key,pid,started,finished:Date.now(),peakMemory,minFreeBytes,realBudgetRejection:true,realCompactionModelCalls:modelCalls,compactionFailures:failures,configuredCompactionModel:compact.model,actualCompactionLastModel:compact.stats?.lastModel,continuationModel:final.model,exactIdentifierPreserved:true,settledToolNotReplayed:true,seedToolCallId:seedCalls[0].id,turns};
}catch(e){report={ok:false,key,pid,started,finished:Date.now(),peakMemory,minFreeBytes,turns,failure:{name:e.name,message:String(e.message).slice(0,350)}};throw e;}
finally{if(report){const output='/srv/vlab-production-mirror/labs/control/three-fixes-overflow-'+started+'.json';fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({output,...report}));}for(const t of turns.filter(t=>!t.terminal))await client?.request('vlab.workers.native.cancel',{runId:t.id}).catch(()=>{});client?.stop();}
