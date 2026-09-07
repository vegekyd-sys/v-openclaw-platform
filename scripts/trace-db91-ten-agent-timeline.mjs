// Explicitly scoped Lab / authorized production acceptance; only synthetic chats.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const production=process.argv.includes('--production');
assert.equal(os.hostname(),production?'VM-8-2-ubuntu':'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const privateLab=process.argv.includes('--private');
assert(!(production&&privateLab));
const privateMeta=privateLab?JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/db91-fix.json')):null;
const root=production?'/home/openclaw/.openclaw':privateLab?privateMeta.root:'/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902',unit=production?'openclaw-gateway.service':privateLab?privateMeta.unit:'openclaw-vlab-production-mirror-v8.service';
const owner='codex-db91-contention-20260907';
const count=Number(process.env.DB91_CASES??15);assert(Number.isInteger(count)&&count>=1&&count<=15);
if(privateLab){assert.equal(privateMeta.owner,owner);assert(count<=2);}
const labels=(process.env.DB91_ROUNDS??'initial,warm').split(',');
const read=p=>JSON.parse(fs.readFileSync(p));
const guard=()=>{
 if(!production)return assert.equal(read('/srv/vlab-production-mirror/labs/control/'+(privateLab?'db91-fix':'integration')+'.json').owner,owner);
 const manifest=read(root+'/backups/db91-firstword-20260907/manifest.json');
 const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const userTurnRelease=process.env.DB91_PRODUCTION_USER_TURN==='1'?read(root+'/backups/db91-persisted-user-turn-20260908/manifest.json'):null;
 const overridden=new Set(userTurnRelease?.files.map(f=>f.filename)??[]);
 if(userTurnRelease){
  assert.equal(hash(root+'/backups/db91-firstword-20260907/manifest.json'),userTurnRelease.previousManifestSha);
  execFileSync(process.execPath,['/opt/openclaw-experiments/db91-persisted-user-turn-20260908/source/scripts/release-db91-persisted-user-turn.mjs','verify'],{stdio:'pipe'});
  for(const f of userTurnRelease.files)assert.equal(hash(f.filename),f.afterSha,'user turn release not active');
 }
 for(const f of manifest.files)if(!overridden.has(f.filename))assert.equal(hash(f.filename),f.afterSha,'release not active');
 for(const [f,sha] of Object.entries(manifest.protectedFiles))assert.equal(hash(f),sha,'protected production file drift');
 assert.equal(process.env.DB91_REQUIRE_STREAM,'1');
};guard();
const pid=execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();assert(Number(pid)>1);
for(const v of fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0')){const i=v.indexOf('=');if(i>0)process.env[v.slice(0,i)]=v.slice(i+1);}
assert.equal(process.env.OPENCLAW_CONFIG_PATH,root+(production?'/openclaw.json':'/state/openclaw.json'));
const cfg=read(process.env.OPENCLAW_CONFIG_PATH);assert.equal(cfg.gateway.port,production?22793:privateLab?26300:24993);
assert(fs.statfsSync(root).bavail*fs.statfsSync(root).bsize>(production?8:3)*1024**3);
if(production)for(const flag of ['INTEGRITY','PROVENANCE','MEMORY_SCHEMA','MAINTENANCE'])assert.equal(process.env['OPENCLAW_DB91_'+flag+'_ENABLE'],'1');
const core=production?'/opt/openclaw-2026.9.1-v/openclaw':root+(privateLab?'/runtime/openclaw':'/runtime/npm-global/lib/node_modules/openclaw');
const {GatewayClient}=await import(core+'/dist/plugin-sdk/gateway-runtime.js');
const tracked=new Map();let client;
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{client?.stop();reject(Error('connection deadline'));},20000);
 client=new GatewayClient({url:'ws://127.0.0.1:'+cfg.gateway.port,token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',caps:['tool-events'],scopes:['operator.read','operator.write','operator.admin'],onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:e=>{clearTimeout(timer);reject(e);},onEvent:event=>{
  const p=event.payload,j=tracked.get(p?.runId)??[...tracked.values()].find(j=>p?.sessionKey===j.sessionKey);if(!j)return;
  const key=[event.event,p.stream??'',p.data?.phase??p.state??''].join('/'),at=Date.now()-j.start;
  const record=j.events[key]??={firstMs:at,lastMs:at,count:0};record.lastMs=at;record.count++;
  const visibleText=event.event==='agent'&&p.stream==='assistant'?p.data?.text:
   event.event==='chat'&&['delta','final'].includes(p.state)?
    (p.message?.content??[]).filter(c=>c.type==='text').map(c=>c.text).join(''):'';
  if(typeof visibleText==='string'&&visibleText.trim()&&j.firstTextMs===undefined){
   j.firstTextMs=at;j.firstTextEvent=key;j.firstTextChars=visibleText.length;
   console.log(JSON.stringify({phase:'first-text',runId:j.runId,elapsedMs:at,event:key}));
  }
  if(event.event==='chat'&&p.state==='final'){j.finalEventMs=at;j.finalPayloadKeys=Object.keys(p);}
  if(event.event==='chat'&&['error','aborted'].includes(p.state))j.terminalError=p.state;
 }});client.start();
});
const call=(method,params={},timeoutMs=20000)=>client.request(method,params,{timeoutMs});
let historyReaders=0;const historyQueue=[];
const readHistory=async params=>{
 if(historyReaders>=3)await new Promise(resolve=>historyQueue.push(resolve));
 else historyReaders++;
 try{return await call('chat.history',params);}
 finally{const next=historyQueue.shift();if(next)next();else historyReaders--;}
};
if(process.env.DB91_INSPECT==='1'){const w=await call('vlab.workers.status');console.log(JSON.stringify(w.integration?.nativeHarnessEventParity));client.stop();process.exit(0);}
const workerSnapshot=async()=>{const w=await call('vlab.workers.status');return {at:Date.now(),pending:w.pending,parity:w.integration?.nativeHarnessEventParity,workers:w.workers.map(v=>({slot:v.slot,pid:v.pid,ready:v.ready,active:v.active?.map(a=>({runId:a.runId,sessionKey:a.sessionKey}))??[],activeCount:v.activeCount,queued:v.queued}))};};
const idle=async()=>{
 const until=Date.now()+30000;
 do{const w=await workerSnapshot();let active=false,offset=0;
  for(let page=0;page<10;page++){
   const s=await call('sessions.list',{limit:1000,offset});active||=(s.sessions??[]).some(v=>v.hasActiveRun);
   if(!s.hasMore)break;assert(page<9&&s.nextOffset>offset,'incomplete session inventory');offset=s.nextOffset;
  }
  if(!w.pending&&w.workers.every(v=>v.ready&&!v.activeCount&&!v.queued)&&!active)return w;
  await new Promise(r=>setTimeout(r,1000));
 }while(Date.now()<until);throw Error('runtime not idle');
};
const stamp=Date.now(),report={owner,gatewayPid:pid,startedAt:new Date().toISOString(),variant:process.env.DB91_VARIANT??'candidate',count,configUnchanged:true,rounds:[]};
const outputDir=root+(production?'/db91-acceptance-20260907':privateLab?'/workspace':'/state/db91-c5-release-20260907');
if(production)fs.mkdirSync(outputDir,{recursive:true,mode:0o700});
const output=outputDir+'/timeline-'+stamp+'.json';
const counters=p=>Object.fromEntries(fs.readFileSync(p,'utf8').trim().split('\n').map(s=>{const [k,v]=s.split(/\s+/);return [k,Number(v)];}));
const cgroup='/sys/fs/cgroup/system.slice/openclaw-gateway.service';
const resources=()=>{
 const stats=counters(cgroup+'/memory.stat'),events=counters(cgroup+'/memory.events');
 return {current:Number(fs.readFileSync(cgroup+'/memory.current','utf8')),anon:stats.anon,file:stats.file,oomKill:events.oom_kill,available:Number(fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)?.[1])*1024};
};
const resourceBefore=production?resources():null;if(resourceBefore){assert(resourceBefore.available>8*1024**3);report.resourceBefore=resourceBefore;}
const persist=()=>fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});
try{
 for(const label of labels){
  guard();const before=await idle();console.log(JSON.stringify({phase:'round-start',label,before:{at:before.at,pending:before.pending,workers:before.workers}}));
  const round={label,before,startedAt:Date.now(),samples:[],jobs:[]};report.rounds.push(round);persist();
  let sampling=true;
  let resourceFailure,healthFailures=0;
  const resourceMonitor=(async()=>{if(!production)return;round.resourceSamples=[];
   while(sampling){const sample={at:Date.now()};try{
    sample.resources=resources();const r=sample.resources;
    if(r.available<4*1024**3||r.anon>26*1024**3||r.oomKill>resourceBefore.oomKill)resourceFailure='production resource reserve crossed';
    try{const h=await fetch('http://127.0.0.1:22793/healthz',{signal:AbortSignal.timeout(2500)});if(!h.ok)throw Error('health');healthFailures=0;sample.health=true;}catch{healthFailures++;sample.health=false;if(healthFailures>=3)resourceFailure='three production health failures';}
   }catch(e){resourceFailure='resource monitor unavailable';sample.error=String(e);}
   round.resourceSamples.push(sample);await new Promise(r=>setTimeout(r,500));
  }})();
  const sampler=(async()=>{while(sampling){const at=Date.now();try{
   const snapshot=await workerSnapshot();round.samples.push({...snapshot,rpcMs:Date.now()-at});
  }catch(e){round.samples.push({at,error:String(e)});}await new Promise(r=>setTimeout(r,500));}})();
  const outcomes=await Promise.allSettled(Array.from({length:count},async(_,i)=>{
   const runId='DB91_TIMELINE_'+stamp+'_'+label+'_'+i,key='agent:makaron:explicit:db91-timeline-'+stamp+'-'+label+'-'+i;
   const j={runId,sessionKey:key,start:Date.now(),events:{},historyRetries:0};round.jobs.push(j);tracked.set(runId,j);
   let done=false,sent=false;
   try{
    assert.equal((await call('sessions.messages.subscribe',{agentId:'makaron',key})).subscribed,true);
    j.start=Date.now();
    sent=true; // Even an uncertain admission timeout must abort this unique test run.
    const r=await call('chat.send',{agentId:'makaron',sessionKey:key,deliver:false,idempotencyKey:runId,timeoutMs:150000,message:`VLab内部真实Agent并发验收。不要读写业务文件、记忆或配置，不访问网络或浏览器，不委托，不发外部消息。首先直接输出一句可见中文“收到，我现在开始检查本次测试。”，然后只调用exec执行 printf '${runId}_TOOL\\n'。看到真实工具结果后只回复 ${runId}_FINAL。`});
    sent=true;assert.equal(r.runId,runId);j.admittedMs=Date.now()-j.start;
    while(Date.now()-j.start<150000){
     if(resourceFailure)throw Error(resourceFailure);
     if(j.terminalError)throw Error('native terminal '+j.terminalError);
     // Live timing comes from events. Do not create 15 polling readers while
     // the model and tools are actively writing the same agent database.
     if(j.finalEventMs===undefined){await new Promise(r=>setTimeout(r,200));continue;}
     let h;
     try{h=await readHistory({agentId:'makaron',sessionKey:key,limit:30});}catch(e){if(e.retryable||e.code==='UNAVAILABLE'||e.name==='GatewayClientRequestTimeoutError'){j.historyRetries++;await new Promise(r=>setTimeout(r,500));continue;}throw e;}
     const messages=h.messages??[];
     const a=messages.find(m=>m.role==='assistant'&&(m.content??[]).some(c=>c.type==='text'&&c.text.includes(runId+'_FINAL')));
     if(!a){await new Promise(r=>setTimeout(r,500));continue;}
     assert.equal(a.model,'deepseek-v4-pro');assert.equal(h.sessionInfo?.agentRuntime?.id,'vlab-worker');
     assert(messages.some(m=>/tool/i.test(m.role)&&!m.isError&&JSON.stringify(m).includes(runId+'_TOOL')));
     j.replyVisibleMs=Date.now()-j.start;j.realToolResult=true;j.model=a.model;done=true;
     console.log(JSON.stringify({phase:'reply',label,index:i,elapsedMs:j.replyVisibleMs,events:j.events}));return;
    }throw Error('150s deadline');
   }catch(error){j.error=String(error);throw error;}
   finally{if(sent&&!done)await call('chat.abort',{sessionKey:key,runId}).catch(()=>{});}
  }));
  sampling=false;await Promise.all([sampler,resourceMonitor]);round.after=await idle();round.finishedAt=Date.now();persist();
  assert(outcomes.every(o=>o.status==='fulfilled'),'real agent round failure');
  if(process.env.DB91_REQUIRE_STREAM==='1'){
   assert(round.jobs.every(j=>Number.isFinite(j.firstTextMs)),'missing user-visible first text');
   for(const name of ['onAssistantMessageStart','onExecutionPhase','onToolOutcome']){
    assert((round.after.parity?.eventsByCallback?.[name]??0)-(round.before.parity?.eventsByCallback?.[name]??0)>=count,'missing native callback '+name);
   }
   if(production)assert(Math.max(...round.samples.map(s=>(s.workers??[]).flatMap(w=>w.active??[]).filter(a=>round.jobs.some(j=>j.runId===a.runId)).length))>=count,'did not observe all requested production sessions running concurrently');
  }
 }
 report.completed=true;persist();console.log(JSON.stringify({phase:'timeline-complete',output}));
}finally{persist();client.stop();}
