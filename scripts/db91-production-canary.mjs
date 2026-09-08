// Channel-free packaging smoke on V, using only an isolated copy of DealClaw DB.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';
import {trajectoryIndexSql,trajectoryIndexName} from '../experiments/db91-integrity-gate/trajectory-index.mjs';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const release='/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1',live='/home/openclaw/.openclaw';
const backupRoot=fs.realpathSync(live+'/backups/v2026.9.1-db91.1');
const root=backupRoot+'/canary',unit='v-db91-release-canary.service';
const [mode]=process.argv.slice(2);assert(['setup','start','verify','stop'].includes(mode));
const run=(command,args,options={})=>execFileSync(command,args,{encoding:'utf8',timeout:30000,...options}).trim();
const uid=Number(run('id',['-u','openclaw'])),gid=Number(run('id',['-g','openclaw']));assert(uid>0&&gid>0);
const cfgFile=root+'/state/openclaw.json',overlayFile=root+'/state/worker-openclaw.json';
if(mode==='setup'){
 assert(!fs.existsSync(root),'Canary state is immutable between runs');
 const backup=live+'/backups/v2026.9.1-db91.1/state-online';
 const meta=JSON.parse(fs.readFileSync(backup+'/manifest.json'));
 assert(meta.databases.some(x=>x.path==='agents/dealclaw/agent/openclaw-agent.sqlite'));
 const cfg=JSON.parse(fs.readFileSync(live+'/openclaw.json'));
 for(const directory of ['state/agents/dealclaw/agent','workspace','home','tmp'])fs.mkdirSync(root+'/'+directory,{recursive:true,mode:0o700});
 const dbFile=root+'/state/agents/dealclaw/agent/openclaw-agent.sqlite';
 fs.copyFileSync(backup+'/agents/dealclaw/agent/openclaw-agent.sqlite',dbFile);
 const db=new DatabaseSync(dbFile);
 try{
  db.exec('PRAGMA secure_delete=ON');
  const tables=new Set(db.prepare('SELECT name FROM sqlite_schema WHERE type=?').all('table').map(x=>x.name));
  for(const t of ['auth_profile_store','auth_profile_state'])if(tables.has(t))db.exec('DELETE FROM '+t);
  if(tables.has('session_pending_inputs'))db.exec("UPDATE session_pending_inputs SET state='cancelled' WHERE state!='cancelled'");
  for(const row of db.prepare('SELECT session_key,entry_json,status FROM session_nodes').all()){
   const entry=JSON.parse(row.entry_json);
   for(const key of Object.keys(entry))if(key.startsWith('restartRecovery')||['activeWriterRunId','pendingFinalDelivery','pendingDeliveryNotice','liveModelSwitchPending','subagentRecovery','cronRunContinuation','quotaSuspension'].includes(key))delete entry[key];
   if(['running','queued','pending','paused'].includes(entry.status)){entry.status='killed';entry.abortedLastRun=true;}
   db.prepare('UPDATE session_nodes SET entry_json=?,status=? WHERE session_key=?').run(JSON.stringify(entry),row.status==='running'?'killed':row.status,row.session_key);
  }
  assert(!db.prepare('SELECT name FROM sqlite_schema WHERE name=?').get(trajectoryIndexName));db.exec(trajectoryIndexSql);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
 }finally{db.close();}
 const main={gateway:{mode:'local',bind:'loopback',port:22894,auth:{mode:'token',token:randomBytes(32).toString('hex')},reload:{mode:'off'}},
  agents:{defaults:{workspace:root+'/workspace',model:{primary:'deepseek/deepseek-v4-pro',fallbacks:[]},maxConcurrent:3,subagents:{maxConcurrent:3}},entries:{dealclaw:{workspace:root+'/workspace',agentDir:root+'/state/agents/dealclaw/agent'}}},
  models:{mode:'merge',providers:{deepseek:cfg.models.providers.deepseek}},
  channels:{},cron:{enabled:false},browser:{enabled:false},mcp:{servers:{}},
  tools:{profile:'full',elevated:{enabled:false}},
  plugins:{allow:['deepseek','vlab-agent-worker-isolation'],load:{paths:[release+'/worker']},entries:{'vlab-agent-worker-isolation':{enabled:true,config:{...cfg.plugins.entries['vlab-agent-worker-isolation'].config,minWorkers:1,maxWorkers:1,sessionsPerWorker:3,workerConfigPath:overlayFile,gatewayConfigPath:cfgFile}}}}};
 const overlay=structuredClone(main);
 const native=value=>{if(value&&typeof value==='object'){if(value.agentRuntime?.id==='vlab-worker')value.agentRuntime.id='openclaw';for(const v of Object.values(value))native(v);}};native(overlay);
 overlay.plugins={allow:['deepseek'],entries:{},load:{paths:[]}};
 fs.writeFileSync(cfgFile,JSON.stringify(main,null,2),{mode:0o600,flag:'wx'});
 fs.writeFileSync(overlayFile,JSON.stringify(overlay,null,2),{mode:0o600,flag:'wx'});
 fs.writeFileSync(root+'/workspace/AGENTS.md','This is an isolated production-release smoke. Do not resume historical tasks, contact external services or send messages. Execute only the current numbered test. All writes must remain in this workspace.\n',{mode:0o600,flag:'wx'});
 run('chown',['-R','openclaw:openclaw',root]);
 console.log(JSON.stringify({canaryPrepared:true,copiedAgent:'dealclaw',channels:0,cron:false,browser:false,productionUntouched:true}));
}else if(mode==='start'){
 // Backup contents stay root-only; the service group can traverse to its own
 // canary directory, but cannot list or read the private backup files.
 fs.chownSync(backupRoot,0,gid);fs.chmodSync(backupRoot,0o710);
 const alias=live+'/backups/v2026.9.1-db91.1/canary';
 for(const file of [cfgFile,overlayFile]){
  const content=fs.readFileSync(file,'utf8');
  if(content.includes(alias))fs.writeFileSync(file,content.split(alias).join(root),{mode:0o600});
 }
 run('/usr/sbin/runuser',['-u','openclaw','--','/usr/bin/test','-x',root+'/workspace']);
 assert.equal(run('ss',['-H','-ltn','sport = :22894']),'','Canary port occupied');
 run('systemd-run',['--unit='+unit,'--property=Type=exec','--property=User=openclaw','--property=Group=openclaw','--property=UMask=0077','--property=CPUQuota=100%','--property=MemoryHigh=3G','--property=MemoryMax=4G','--property=KillMode=mixed','--property=TimeoutStopSec=45','--property=ProtectSystem=strict','--property=ProtectHome=read-only','--property=ReadWritePaths='+root,'--property=WorkingDirectory='+root+'/workspace',
  '--setenv=HOME='+root+'/home','--setenv=TMPDIR='+root+'/tmp','--setenv=OPENCLAW_STATE_DIR='+root+'/state','--setenv=OPENCLAW_CONFIG_PATH='+cfgFile,
  '--setenv=OPENCLAW_DB91_INTEGRITY_ENABLE=1','--setenv=OPENCLAW_DB91_INTEGRITY_STATE_ROOT='+root+'/state','--setenv=OPENCLAW_DB91_READ_AHEAD_ENABLE=1','--setenv=OPENCLAW_DB91_STATE_READ_AHEAD_ENABLE=1','--setenv=OPENCLAW_DB91_TRAJECTORY_SWEEP_ENABLE=1','--setenv=OPENCLAW_WORKER_SESSION_AFFINITY_ENABLE=1',
  '/opt/node-v22.23.1/bin/node','--max-old-space-size=3072',release+'/core/dist/index.js','gateway','--port','22894']);
 console.log(JSON.stringify({canaryStarted:true,unit,port:22894,liveGatewayNotRestarted:true}));
}else if(mode==='verify'){
 const cfg=JSON.parse(fs.readFileSync(cfgFile));assert.equal(cfg.gateway.port,22894);
 assert.equal(Object.keys(cfg.channels).length,0);const {GatewayClient}=await import(release+'/core/dist/plugin-sdk/gateway-runtime.js');let client;
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Canary connect deadline')),30000);client=new GatewayClient({url:'ws://127.0.0.1:22894',token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.write','operator.admin'],onHelloOk:()=>{clearTimeout(timer);resolve()},onConnectError:reject});client.start()});
 const stamp=Date.now(),key='agent:dealclaw:explicit:db91-package-'+stamp,report={startedAt:stamp,rows:[],completed:false};
 try{for(let n=0;n<2;n++){
  const id='DB91_PACKAGE_'+stamp+'_'+n,command='date -u "+%s '+id+'"',started=Date.now();
  await client.request('chat.send',{agentId:'dealclaw',sessionKey:key,message:'独立发布烟测 '+id+'。只执行一次 exec 命令 '+command+'，不要继续历史任务或访问外部服务，最终只回复命令实际输出。',thinking:'low',deliver:false,idempotencyKey:id,timeoutMs:180000},{timeoutMs:30000});
  let done=false;
  while(Date.now()-started<210000){
   const h=await client.request('chat.history',{agentId:'dealclaw',sessionKey:key,limit:50},{timeoutMs:30000});
   const at=h.messages.findLastIndex(m=>m.role==='user');
   if(at>=0&&h.messages[at].idempotencyKey===id+':user'){
    const turn=h.messages.slice(at+1),last=turn.filter(m=>m.role==='assistant').at(-1);
    if(last?.stopReason==='stop'){
     const calls=turn.flatMap(m=>Array.isArray(m.content)?m.content.filter(c=>c.type==='toolCall'):[]).filter(c=>c.name==='exec'&&JSON.stringify(c.arguments).includes(id));
     assert.equal(calls.length,1);assert(turn.some(m=>m.role==='toolResult'&&m.toolCallId===calls[0].id&&!m.isError&&JSON.stringify(m).includes(id)));
     assert.equal(last.model,'deepseek-v4-pro');assert(JSON.stringify(last.content).includes(id));
     const s=await client.request('sessions.list',{agentId:'dealclaw',search:key,limit:10},{timeoutMs:30000});
     if(s.sessions.find(x=>x.key===key)?.hasActiveRun===false){report.rows.push({id,ms:Date.now()-started,toolVerified:true});done=true;break;}
    }
   }
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert(done,'Canary real tool/final deadline');console.log(JSON.stringify(report.rows.at(-1)));
 }report.completed=true;}finally{report.finishedAt=Date.now();fs.writeFileSync(root+'/result.json',JSON.stringify(report,null,2),{mode:0o600});client.stop();}
 console.log(JSON.stringify({packagingCanaryPassed:true,realTools:report.rows.length}));
}else{
 run('systemctl',['stop',unit],{timeout:60000});console.log(JSON.stringify({stoppedOnly:unit}));
}
