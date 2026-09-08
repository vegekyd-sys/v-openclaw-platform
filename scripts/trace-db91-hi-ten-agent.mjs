// Ten concurrent real Agent hi requests. Shared VLab only, never production.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const source='/srv/vlab-production-mirror/labs/control/db91-hi-integration-20260908';
const owner='codex-db91-contention-20260907',unit='openclaw-vlab-production-mirror-v8.service';
const read=p=>JSON.parse(fs.readFileSync(p)),hash=b=>createHash('sha256').update(b).digest('hex');
const guard=()=>assert.equal(read('/srv/vlab-production-mirror/labs/control/integration.json').owner,owner);guard();
const variant=process.argv.find(a=>['before','after'].includes(a));assert(variant);
const configPaths=[root+'/state/openclaw.json',root+'/experiments/agent-worker-isolation-v1/worker-openclaw.json'];
const configHashes=configPaths.map(p=>hash(fs.readFileSync(p)));
const cfg=read(configPaths[0]),workerCfg=read(configPaths[1]);assert.equal(cfg.gateway.port,24993);
for(const c of [cfg,workerCfg])assert.equal(c.tools?.toolSearch?.enabled===true&&c.tools?.toolSearch?.mode==='directory',variant==='after');
const pid=execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();assert(Number(pid)>1);
for(const v of fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0')){const i=v.indexOf('=');if(i>0)process.env[v.slice(0,i)]=v.slice(i+1);}
assert.equal(process.env.OPENCLAW_CONFIG_PATH,configPaths[0]);
const db=root+'/state/agents/makaron/agent/openclaw-agent.sqlite';assert(fs.statSync(db).size>=2_500_000_000);
assert(fs.statfsSync(root).bavail*fs.statfsSync(root).bsize>3*1024**3);
const fixtureName='hi-fixtures-1788835158729.json',fixtures=read(root+'/state/db91-c5-release-20260907/'+fixtureName);
assert(fixtures.dm?.key&&fixtures.group?.key);
const stamp=Date.now(),output=root+'/state/db91-c5-release-20260907/hi-'+stamp+'.json';
const report={startedAt:new Date().toISOString(),variant,message:'hi',thinkingRequested:'low',count:10,scope:'shared-real-agent-concurrent-10-history-no-channel-delivery',
 gatewayPid:pid,databaseBytes:fs.statSync(db).size,historyFixture:fixtureName,configHashes,
 controllerCommit:execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),jobs:[],samples:[]};
const persist=()=>fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});
const counters=p=>Object.fromEntries(fs.readFileSync(p,'utf8').trim().split('\n').map(l=>{const [k,v]=l.split(/\s+/);return [k,Number(v)];}));
const cg='/sys/fs/cgroup/system.slice/'+unit;
report.resourceLimits=Object.fromEntries(['cpu.max','memory.high','memory.max'].map(n=>[n,fs.readFileSync(cg+'/'+n,'utf8').trim()]));
assert.equal(report.resourceLimits['cpu.max'],'400000 100000');
const resources=()=>({atMs:Date.now(),memoryCurrent:Number(fs.readFileSync(cg+'/memory.current')),memoryEvents:counters(cg+'/memory.events'),cpu:counters(cg+'/cpu.stat'),
 available:Number(fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)?.[1])*1024});
const {GatewayClient}=await import(root+'/runtime/npm-global/lib/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js');
const jobs=new Map();let client,running=false,sampler;
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{client?.stop();reject(Error('connection deadline'));},20000);
 client=new GatewayClient({url:'ws://127.0.0.1:24993',token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',caps:['tool-events'],scopes:['operator.read','operator.write','operator.admin'],
 onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:e=>{clearTimeout(timer);reject(e);},
 onEvent:event=>{const p=event.payload,j=jobs.get(p?.runId)??report.jobs.find(j=>j.sessionKey===p?.sessionKey);if(!j||!j.start)return;
  const at=Date.now()-j.start,key=[event.event,p.stream??'',p.data?.phase??p.state??''].join('/');const e=j.events[key]??={firstMs:at,lastMs:at,count:0};e.lastMs=at;e.count++;
  const text=event.event==='agent'&&p.stream==='assistant'?p.data?.text:event.event==='chat'&&['delta','final'].includes(p.state)?(p.message?.content??[]).filter(c=>c.type==='text').map(c=>c.text).join(''):'';
  if(typeof text==='string'&&text.trim()&&j.firstTextMs===undefined){j.firstTextMs=at;j.firstTextChars=text.length;persist();console.log(JSON.stringify({phase:'first-text',case:j.case,runId:j.runId,elapsedMs:at}));}
  if(event.event==='chat'&&p.state==='final')j.finalEventMs=at;
  if(event.event==='chat'&&['error','aborted'].includes(p.state))j.terminalError=p.state;
 }});client.start();});
const call=(method,params={},timeoutMs=20000)=>client.request(method,params,{timeoutMs});
const status=async()=>{const s=await call('vlab.workers.status');return {pending:s.pending,workers:s.workers.map(w=>({pid:w.pid,ready:w.ready,activeCount:w.activeCount,queued:w.queued}))};};
const idle=async()=>{const s=await status();assert.equal(s.pending,0);assert(s.workers.every(w=>w.ready&&!w.activeCount&&!w.queued));return s;};
try{
 report.before=await idle();report.forkSetupStartedAt=Date.now();persist();
 for(let i=0;i<10;i++){
  guard();const kind=i%2===0?'dm':'group',parent=fixtures[kind],name=kind+'_'+Math.floor(i/2);
  const sessionKey=(kind==='group'?'agent:makaron:feishu:group:':'agent:makaron:explicit:')+'db91-hi-ten-'+stamp+'-'+name;
  const j={case:name,mode:name,kind,runId:'DB91_HI_'+stamp+'_low_'+name,sessionKey,events:{},parentKeyHash:hash(parent.key).slice(0,12)};
  await call('sessions.create',{key:sessionKey,agentId:'makaron',parentSessionKey:parent.key,fork:true,forkFrom:'last-completed',emitCommandHooks:false,thinkingLevel:'low'},120000);
  assert.equal((await call('sessions.messages.subscribe',{agentId:'makaron',key:sessionKey})).subscribed,true);
  report.jobs.push(j);jobs.set(j.runId,j);persist();
 }
 const inventory=await call('sessions.list',{limit:1000});
 for(const j of report.jobs){const e=(inventory.sessions??[]).find(e=>(e.key??e.sessionKey)===j.sessionKey);assert(e);j.nativeKind=e.kind;j.nativeChatType=e.chatType;if(j.kind==='group')assert.equal(e.kind,'group');}
 report.forkSetupMs=Date.now()-report.forkSetupStartedAt;await idle();report.resourceBefore=resources();report.batchStartedAt=Date.now();running=true;
 sampler=(async()=>{while(running){const s={atMs:Date.now(),resources:resources()};
   if(s.resources.available<2*1024**3||s.resources.memoryCurrent>12*1024**3||s.resources.memoryEvents.oom_kill>report.resourceBefore.memoryEvents.oom_kill)report.resourceFailure='resource reserve crossed';
   try{s.status=await status();}catch{s.statusUnavailable=true;}
   report.samples.push(s);persist();await new Promise(r=>setTimeout(r,750));
 }})();
 const outcomes=await Promise.allSettled(report.jobs.map(async j=>{
  j.start=Date.now();j.sent=true;persist();
  try{guard();const ack=await call('chat.send',{agentId:'makaron',sessionKey:j.sessionKey,message:'hi',thinking:'low',deliver:false,idempotencyKey:j.runId,timeoutMs:240000});assert.equal(ack.runId,j.runId);j.admittedMs=Date.now()-j.start;
   while(Date.now()-j.start<240000){if(report.resourceFailure)throw Error(report.resourceFailure);if(j.terminalError)throw Error(j.terminalError);if(j.finalEventMs!==undefined)break;await new Promise(r=>setTimeout(r,100));}
   assert(Number.isFinite(j.firstTextMs)&&Number.isFinite(j.finalEventMs),'no final visible reply');
   // Verification is after final, not a polling reader competing with live writes.
   const h=await call('chat.history',{agentId:'makaron',sessionKey:j.sessionKey,limit:50});assert.equal(h.sessionInfo?.agentRuntime?.id,'vlab-worker');
   const users=(h.messages??[]).filter(m=>m.role==='user');assert.equal(users.filter(m=>m.idempotencyKey===j.runId+':user').length,1);assert.equal(users.at(-1)?.idempotencyKey,j.runId+':user');
   const assistants=(h.messages??[]).filter(m=>m.role==='assistant'),last=assistants.at(-1);assert.equal(last?.model,'deepseek-v4-pro');assert.notEqual(last.stopReason,'error');
   j.lastUserIdempotencyVerified=true;j.userCount=users.length;j.model=last.model;j.assistantMetadata=assistants.map(a=>({model:a.model,stopReason:a.stopReason,usage:a.usage?{input:a.usage.input,cacheRead:a.usage.cacheRead,output:a.usage.output}:undefined}));
   j.replyTextSha256=hash(JSON.stringify(last.content??null));j.verified=true;persist();console.log(JSON.stringify({phase:'reply',case:j.case,firstTextMs:j.firstTextMs,finalEventMs:j.finalEventMs}));
  }catch(e){j.error=String(e);persist();throw e;}
  finally{if(!j.verified)await call('chat.abort',{sessionKey:j.sessionKey,runId:j.runId}).catch(()=>{});}
 }));
 running=false;await sampler;report.resourceAfter=resources();
 assert(outcomes.every(o=>o.status==='fulfilled'),'real Agent cohort failed');
 for(let i=0;i<40;i++){try{report.after=await idle();break;}catch{await new Promise(r=>setTimeout(r,500));}}assert(report.after,'not idle after cohort');
 report.maxObservedActive=Math.max(...report.samples.map(s=>(s.status?.workers??[]).reduce((n,w)=>n+w.activeCount,0)));
 assert(report.maxObservedActive>=10,'did not observe ten concurrent active sessions');
 assert.deepEqual(configPaths.map(p=>hash(fs.readFileSync(p))),configHashes,'configuration changed during run');
 report.completed=true;persist();console.log(JSON.stringify({phase:'ten-complete',variant,output,maxObservedActive:report.maxObservedActive}));
}finally{running=false;if(sampler)await sampler;for(const j of report.jobs)if(j.sent&&!j.verified)await call('chat.abort',{sessionKey:j.sessionKey,runId:j.runId}).catch(()=>{});persist();client.stop();}
