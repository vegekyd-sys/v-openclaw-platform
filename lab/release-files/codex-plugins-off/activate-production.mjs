// Apply codex-plugins-off to production V's Gateway and Worker configs through a controlled
// restart: configuration is written only while the Gateway is stopped, so the live config
// watcher never hot-reloads it (a hot reload can close the Worker pool for good).
// Config-only change: no runtime bytes move. Night Shift holds and resumes itself across
// the restart (PR #125).
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {acquireIdleFence} from '../../shared/lifecycle.mjs';
import {disableCodexPlugins} from './config.mjs';

assert.equal(os.hostname(),'VM-8-2-ubuntu');
assert.equal(process.getuid(),0);
const preserveInflight=process.argv.includes('--preserve-inflight');
const unit='openclaw-gateway.service';
const stopDropin='/etc/systemd/system/'+unit+'.d/zzzzzzzzzzzzzz-codex-plugins-off-controlled-stop.conf';
const stopPolicy='[Service]\nKillMode=mixed\nKillSignal=SIGUSR1\nTimeoutStopSec=180\nSendSIGKILL=no\n';
let installedStopPolicy=false;
let timerWasActive=false,activationReady=false;
const companionTimer='openclaw-gateway-memory-snapshot.timer';
function cleanupStopPolicy(){if(!installedStopPolicy)return;assert.equal(fs.readFileSync(stopDropin,'utf8'),stopPolicy);fs.unlinkSync(stopDropin);run('systemctl',['daemon-reload']);installedStopPolicy=false;}
const core='/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core';
const root='/home/openclaw/.openclaw';
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',timeout:60000}).trim();
const pid=()=>Number(run('systemctl',['show',unit,'-p','MainPID','--value']));
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const beforePid=pid();assert(beforePid>1);
const env=Object.fromEntries(fs.readFileSync(`/proc/${beforePid}/environ`,'utf8').split('\0').filter(Boolean).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
assert.equal(env.OPENCLAW_CONFIG_PATH??root+'/openclaw.json',root+'/openclaw.json');
Object.assign(process.env,env);
const cfg=JSON.parse(fs.readFileSync(root+'/openclaw.json'));
assert.equal(cfg.gateway.port,22793);
const worker=cfg.plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath;
assert.equal(worker,root+'/experiments/agent-worker-isolation-v1/worker-openclaw.json');
const configs=[root+'/openclaw.json',worker].map(file=>{
  const text=fs.readFileSync(file,'utf8');const before=JSON.parse(text);
  const {config:after,changed,reason}=disableCodexPlugins(before);
  assert(changed,`${file}: nothing to change (${reason})`);
  return {file,text,after,stat:fs.statSync(file)};
});
const token=cfg.gateway.auth.token.replace(/\$\{([^}]+)\}/g,(_,key)=>{assert(env[key]);return env[key];});
const {GatewayClient}=await import(core+'/dist/plugin-sdk/gateway-runtime.js');
async function connect(){
  let client;
  try{
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Gateway connection deadline')),20000);
      client=new GatewayClient({url:'ws://127.0.0.1:22793',token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.write','operator.admin'],onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:error=>{clearTimeout(timer);reject(error);}});
      client.start();
    });
    return client;
  }catch(error){client?.stop();throw error;}
}
const client=await connect();let held,stopped=false,applied=false;
try{
  assert.equal((await client.request('health',{})).ok,true);
  if(preserveInflight){
    // Explicit operator authorization permits a native recoverable handoff.
    // Preserve all in-flight turns; never SIGKILL a Worker or clear its state.
    const workers=await client.request('vlab.workers.status',{});
    assert.equal(workers.pending,0);assert(workers.workers.every(w=>!w.queued));
    held=await client.request('gateway.suspend.prepare',{requestId:'codex-plugins-off-preserve-'+Date.now(),drain:true,terminalPolicy:'preserve'});
    assert(held.suspensionId);
    const status=await client.request('gateway.suspend.status',{suspensionId:held.suspensionId});
    assert(['ready','draining'].includes(status.status));assert(status.expiresAtMs>Date.now()+5000);assert.equal(status.queuedCount??0,0);
    console.log(JSON.stringify({phase:'preserve-inflight-handoff',active:workers.workers.reduce((n,w)=>n+w.activeCount,0),runs:workers.workers.flatMap(w=>w.active.map(x=>({runId:x.runId,sessionKey:x.sessionKey}))),suspensionStatus:status.status}));
  }else held=await acquireIdleFence((method,params)=>client.request(method,params,{timeoutMs:30000}),'codex-plugins-off-production-'+Date.now());
  assert.equal(pid(),beforePid);
  for(const c of configs)assert.equal(fs.readFileSync(c.file,'utf8'),c.text,'Concurrent configuration change');
  console.log(JSON.stringify({phase:preserveInflight?'native-preserve-fence-held':'idle-fence-ready',beforePid,suspensionId:held.suspensionId}));
  timerWasActive=run('systemctl',['show',companionTimer,'-p','ActiveState','--value'])==='active';
  if(timerWasActive)run('systemctl',['stop',companionTimer]);
  // Keep configuration writes out of the live watcher: stop after idle or the explicitly authorized native preserve handoff.
  if(preserveInflight){
    assert(!fs.existsSync(stopDropin),'Concurrent controlled stop policy');
    fs.writeFileSync(stopDropin,stopPolicy,{flag:'wx',mode:0o644});installedStopPolicy=true;
    run('systemctl',['daemon-reload']);assert.equal(run('systemctl',['show',unit,'-p','KillSignal','--value']),'10');
    console.log(run('/usr/sbin/runuser',['-u','openclaw','--',process.execPath,'--input-type=module','-e',fs.readFileSync(new URL('write-restart-intent.mjs',import.meta.url),'utf8'),String(beforePid)]));
  }
  execFileSync('systemctl',['stop',unit],{encoding:'utf8',timeout:190000});stopped=true;assert.equal(pid(),0);client.stop();cleanupStopPolicy();
  try{
    for(const c of configs){
      const output=run(process.execPath,[fileURLToPath(new URL('config.mjs',import.meta.url)),c.file,'--apply']);
      assert.deepEqual(JSON.parse(fs.readFileSync(c.file)),c.after);
      console.log(output);
    }
    applied=true;
  }catch(error){
    // Restore only the exact configurations this activation just wrote.
    for(const c of configs){
      const now=fs.readFileSync(c.file,'utf8');
      if(now===c.text)continue;
      assert.deepEqual(JSON.parse(now),c.after,'Foreign configuration change; refusing rollback overwrite');
      const temp=c.file+'.codex-plugins-off-restore-'+process.pid;
      fs.writeFileSync(temp,c.text,{flag:'wx',mode:c.stat.mode&0o777});fs.chownSync(temp,c.stat.uid,c.stat.gid);fs.renameSync(temp,c.file);
    }
    throw error;
  }finally{run('systemctl',['start',unit]);stopped=false;}
  let ready=false;
  const deadline=Date.now()+900000;
  while(Date.now()<deadline){
    let probe;
    try{probe=await connect();ready=(await probe.request('health',{})).ok===true;}catch{}finally{probe?.stop();}
    if(ready)break;
    assert(pid()>1,'Gateway exited during startup');await delay(2000);
  }
  assert(ready,'Gateway readiness timeout; inspect logs and preserve backups');activationReady=true;
  assert.notEqual(pid(),beforePid);
  for(const c of configs)assert.deepEqual(JSON.parse(fs.readFileSync(c.file)),c.after);
  console.log(JSON.stringify({phase:'activated',beforePid,afterPid:pid(),ready:true,configurations:configs.map(c=>({file:c.file,sha256:hash(c.file)})),codexPlugins:'disabled',functionalAcceptance:'Real /vcodex turn still required: no plugin/read before turn/start'}));
}finally{
  // A canceled systemd stop can still be shutting down. Keep the safe policy
  // until that process exits; restoring the old 45 s deadline here would kill it.
  const deactivating=run('systemctl',['show',unit,'-p','ActiveState','--value'])==='deactivating';
  if(!deactivating)cleanupStopPolicy();
  else if(installedStopPolicy)console.error(JSON.stringify({phase:'stop-still-in-progress',safeStopPolicyRetained:stopDropin,companionTimerPaused:timerWasActive}));
  if(stopped)run('systemctl',['start',unit]);
  if(!applied&&held?.suspensionId&&pid()===beforePid)await client.request('gateway.suspend.resume',{suspensionId:held.suspensionId}).catch(()=>{});
  client.stop();
  if(timerWasActive&&(activationReady||(!deactivating&&pid()===beforePid)))run('systemctl',['start',companionTimer]);
}
