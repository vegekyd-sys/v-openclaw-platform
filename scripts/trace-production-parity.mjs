// The same real Agent + fresh exec protocol as production affinity acceptance.
// No business channel delivery, historic task replay, or production endpoints.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const root='/srv/vlab-production-mirror/labs/instances/db91-parity';
assert.equal(process.env.OPENCLAW_STATE_DIR,root+'/state');
const [arm='A',mode='smoke']=process.argv.slice(2);
assert(['A','B','A2'].includes(arm));assert(['smoke','serial','full'].includes(mode));
const cfg=JSON.parse(fs.readFileSync(root+'/state/openclaw.json'));
assert.equal(cfg.gateway.port,26340);assert.equal(cfg.mcp.servers['universal-memory'].enabled,false);
const wc=cfg.plugins.entries['vlab-agent-worker-isolation'].config;
assert.equal(wc.minWorkers,1);assert.equal(wc.maxWorkers,15);assert.equal(wc.sessionsPerWorker,3);
assert.equal(cfg.agents.defaults.maxConcurrent,45);assert.equal(cfg.agents.defaults.subagents.maxConcurrent,45);
const pid=execFileSync('systemctl',['show','openclaw-lab-db91-parity.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();
assert(Number(pid)>1);
const env=fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0');
assert(env.includes('OPENCLAW_WORKER_SESSION_AFFINITY_ENABLE=1'));
const stamp=Date.now(),directory=root+'/tmp/parity-results';fs.mkdirSync(directory,{recursive:true,mode:0o700});
const output=directory+'/'+arm+'-'+mode+'-'+stamp+'.json';
const report={arm,mode,stamp,startedAt:new Date().toISOString(),gatewayPid:pid,workerLimits:wc,
  databaseBytes:fs.statSync(root+'/state/agents/makaron/agent/openclaw-agent.sqlite').size,
  jobs:[],samples:[],statusErrors:[],maxOwnActive:0,maxObservedTotalActive:0,completed:false};
const persist=()=>fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});
const tracked=new Map();let client;
const {GatewayClient}=await import(root+'/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');
await new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{client?.stop();reject(Error('connect deadline'));},25000);
 client=new GatewayClient({url:'ws://127.0.0.1:26340',token:cfg.gateway.auth.token,deviceIdentity:null,
 clientName:'cli',mode:'cli',caps:['tool-events'],scopes:['operator.read','operator.write','operator.admin'],
 onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:e=>{clearTimeout(timer);reject(e);},
 onEvent:e=>{const p=e.payload,j=tracked.get(p?.runId);if(!j)return;const elapsed=Date.now()-j.start;
 if(e.event==='agent'&&p.stream==='assistant'&&typeof p.data?.text==='string'&&p.data.text.trim())j.firstTextMs??=elapsed;
 if(e.event==='chat'&&p.state==='final')j.finalMs=elapsed;
 if(e.event==='chat'&&['error','aborted'].includes(p.state))j.error=p.state;
 }});client.start();
});
const call=(method,params={},timeoutMs=30000)=>client.request(method,params,{timeoutMs});
async function status(){const s=await call('vlab.workers.status');const totalActive=s.workers.reduce((n,w)=>n+w.activeCount,0);report.maxObservedTotalActive=Math.max(report.maxObservedTotalActive,totalActive);return {totalActive,pending:s.pending,workers:s.workers.length};}
let monitoring=true;
const monitor=(async()=>{while(monitoring){try{report.samples.push({at:Date.now(),ownSubmitted:tracked.size,...await status()});}catch(e){report.statusErrors.push({at:Date.now(),error:String(e)});}if(monitoring)await new Promise(r=>setTimeout(r,1000));}})();
async function run(label,key,tool=false,agentId='makaron'){
 const j={label,agentId,sessionKey:key,runId:'PARITY_'+stamp+'_'+report.jobs.length,start:Date.now(),tool};
 report.jobs.push(j);tracked.set(j.runId,j);report.maxOwnActive=Math.max(report.maxOwnActive,tracked.size);assert(tracked.size<=5);persist();
 try{
  j.loadBefore=await status();await call('sessions.messages.subscribe',{agentId,key});j.start=Date.now();
  const command='date -u "+%s '+j.runId+'"';
  const message=tool?'本次独立验收编号 '+j.runId+'。请现在重新调用本机 exec 工具执行这条只读命令：'+command+' 。必须执行本轮命令，不能复用上轮结果，也不能只口头说完成。不要读写其他文件或调用网络工具。最终只回复命令的实际输出。':'hi';
  const ack=await call('chat.send',{agentId,sessionKey:key,message,thinking:'low',deliver:false,idempotencyKey:j.runId,timeoutMs:180000});
  j.ack={runId:ack.runId,status:ack.status,queued:ack.queued};persist();
  while(Date.now()-j.start<180000){if(j.error)throw Error(j.error);if(j.firstTextMs!==undefined&&j.finalMs!==undefined)break;await new Promise(r=>setTimeout(r,250));}
  assert(Number.isFinite(j.firstTextMs)&&Number.isFinite(j.finalMs),'native visible final deadline');
  const h=await call('chat.history',{agentId,sessionKey:key,limit:50});
  assert.equal(h.sessionInfo?.agentRuntime?.id,'vlab-worker');
  const users=h.messages.filter(x=>x.role==='user');assert.equal(users.at(-1).idempotencyKey,j.runId+':user');
  const last=h.messages.filter(x=>x.role==='assistant').at(-1);assert.equal(last.model,'deepseek-v4-pro');assert.notEqual(last.stopReason,'error');
  j.usage=last.usage??null;
  if(tool){
   const turn=h.messages.slice(h.messages.findLastIndex(x=>x.role==='user')+1);
   const calls=turn.flatMap(x=>Array.isArray(x.content)?x.content.filter(c=>c.type==='toolCall'):[]).filter(c=>(c.name==='exec'||c.name==='tool_call')&&JSON.stringify(c.arguments??{}).includes(j.runId));
   assert.equal(calls.length,1,'fresh native exec required');
   const result=turn.find(x=>x.role==='toolResult'&&x.toolCallId===calls[0].id);
   assert(result&&result.isError!==true);assert(!turn.some(x=>x.role==='toolResult'&&x.isError===true));
   assert(JSON.stringify(result).includes(j.runId)&&/\d{10}/.test(JSON.stringify(result)));j.toolVerified=true;
  }
  const idleStart=Date.now();let idle=false;
  while(Date.now()-idleStart<60000){const s=await call('sessions.list',{limit:100});const row=s.sessions.find(x=>x.key===key);if(row&&row.hasActiveRun===false){idle=true;break;}await new Promise(r=>setTimeout(r,500));}
  j.idleWaitMs=Date.now()-idleStart;assert(idle,'own session did not reach native idle');j.verified=true;j.slow=j.firstTextMs>=80000;
  console.log(JSON.stringify({phase:j.slow?'slow-reply':'reply',arm,label,runId:j.runId,firstTextMs:j.firstTextMs,finalMs:j.finalMs,toolVerified:j.toolVerified,idleWaitMs:j.idleWaitMs,loadBefore:j.loadBefore}));
 }catch(e){j.failure=String(e);throw e;}finally{tracked.delete(j.runId);persist();}
}
try{
 for(let i=0;i<(mode==='smoke'?1:5);i++){const key='agent:makaron:explicit:parity-'+stamp+'-'+i;await run('new-session-'+i,key);await run('revisit-'+i,key,true);}
 if(mode!=='smoke'){
  const key='agent:makaron:explicit:parity-'+stamp+'-4';for(let i=0;i<30;i++)await run('serial-warm-'+i,key,i%5===0);
  if(mode==='full')for(let i=0;i<10;i++){
   const results=await Promise.allSettled([0,1,2,3,4].map(n=>run('c5-'+i+'-'+n,'agent:makaron:explicit:parity-'+stamp+'-c5-'+n,i%2===0)));
   if(results.some(r=>r.status==='rejected'))throw new AggregateError(results.filter(r=>r.status==='rejected').map(r=>r.reason),'C5 batch failed; every sibling result retained');
  }
 }
 report.completed=true;
}finally{
 for(const j of report.jobs.filter(x=>!x.verified))await call('chat.abort',{sessionKey:j.sessionKey,runId:j.runId}).catch(()=>{});
 monitoring=false;await monitor;
 report.finishedAt=new Date().toISOString();persist();client.stop();
}
console.log(JSON.stringify({phase:'completed',arm,output,jobs:report.jobs.length,completed:report.completed,maxOwnActive:report.maxOwnActive,maxObservedTotalActive:report.maxObservedTotalActive}));
