// Exercise the native file-watcher/plugin replacement, not a Gateway restart.
// Changes one harmless Worker timeout by 1 ms, then restores its exact bytes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {target,readJson,service,record,sourceCommit,treeHash,digest,run,NODE} from './lab-instance.mjs';

const [name,owner,expectedCore]=process.argv.slice(2),m=target(name,owner),root=m.root;
assert(['2026.9.1','2026.9.2'].includes(expectedCore));
const core=`${root}/runtime/openclaw`;
assert.equal(readJson(`${core}/package.json`).version,expectedCore);
const commit=sourceCommit(m),workerArtifact=treeHash(`${root}/runtime/worker`);
const before=service(m.unit),integration=service('openclaw-vlab-production-mirror-v8.service');
assert(Number(before.MainPID)>1);
for(const entry of fs.readFileSync(`/proc/${before.MainPID}/environ`,'utf8').split('\0').filter(Boolean)) {
  const n=entry.indexOf('=');process.env[entry.slice(0,n)]=entry.slice(n+1);
}
const path=`${root}/state/openclaw.json`,original=fs.readFileSync(path),cfg=JSON.parse(original),stat=fs.statSync(path);
const workerCfg=cfg.plugins.entries['vlab-agent-worker-isolation'].config;
const oldTimeout=workerCfg.requestTimeoutMs??600000;
assert(Number.isInteger(oldTimeout)&&oldTimeout>=10);
workerCfg.requestTimeoutMs=oldTimeout+1;
const changed=Buffer.from(JSON.stringify(cfg,null,2)+'\n');
const staged=`${root}/state/reload-probe-${Date.now()}.json`;
let client,modified=false;
const rounds=[];
const atomicWrite=(bytes,expected)=>{
  assert.equal(digest(fs.readFileSync(path)),digest(expected),'Concurrent owned config change; refusing overwrite');
  fs.writeFileSync(staged,bytes,{flag:'wx',mode:stat.mode&0o777});
  fs.chownSync(staged,stat.uid,stat.gid);fs.chmodSync(staged,stat.mode&0o777);
  fs.renameSync(staged,path);
};
const unchanged=()=>{
  assert.deepEqual(service(m.unit),before,'Gateway restarted instead of hot reload');
  assert.deepEqual(service('openclaw-vlab-production-mirror-v8.service'),integration,'Shared Gateway changed');
};
try {
  const {GatewayClient}=await import(`${core}/dist/plugin-sdk/gateway-runtime.js`);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{client?.stop();reject(Error('Connect deadline'));},20000);
    client=new GatewayClient({url:`ws://127.0.0.1:${m.port}`,token:cfg.gateway.auth.token,deviceIdentity:null,
      clientName:'cli',mode:'cli',scopes:['operator.read'],
      onHelloOk:()=>{clearTimeout(timer);resolve();},
      onConnectError:e=>{clearTimeout(timer);reject(e);}});client.start();
  });
  const status=()=>client.request('vlab.workers.status',{}, {timeoutMs:10000});
  const prove=()=>run(NODE,[`${root}/source/platform/lab-probe.mjs`,name,owner,expectedCore],{timeout:240000});
  prove();
  for (const restore of [false,true]) {
    const old=await status();
    assert.equal(old.pending,0);
    assert(old.workers.every(w=>w.activeCount===0&&w.queued===0),'Owned probe must be idle before reload');
    const oldPids=old.workers.map(w=>w.pid);
    assert(oldPids.length>0);
    atomicWrite(restore?original:changed,restore?changed:original);modified=!restore;
    const started=Date.now();let next,lastError;
    while(Date.now()-started<120000) {
      unchanged();
      try {
        const s=await status();
        if(!s.closing&&s.workers.length>0&&s.workers.every(w=>w.ready&&!oldPids.includes(w.pid))){next=s;break;}
      } catch(error) {lastError=error.message;}
      await new Promise(r=>setTimeout(r,1500));
    }
    assert(next,`Native hot reload did not produce a fresh ready pool: ${lastError??'deadline'}`);
    for(const pid of oldPids) assert(!fs.existsSync(`/proc/${pid}`),'Old Worker process still exists');
    const proof=prove();unchanged();
    rounds.push({restored:restore,oldPids,newPids:next.workers.map(w=>w.pid),elapsedMs:Date.now()-started,
      actualModelToolFinalPassed:true,evidence:JSON.parse(proof).out});
    console.log(JSON.stringify({phase:'hot-reload-round',...rounds.at(-1)}));
  }
  assert.equal(digest(fs.readFileSync(path)),digest(original));
  assert.equal(fs.statSync(path).uid,stat.uid);assert.equal(fs.statSync(path).mode,stat.mode);
  record(m,'hot-reload-probe',{commit,workerArtifact,expectedCore,rounds,gatewayUnchanged:true,
    sharedGatewayUnchanged:true,configRestored:true,passed:true});
} catch(error) {
  record(m,'hot-reload-probe-failed',{commit,workerArtifact,expectedCore,rounds,error:String(error.message).slice(0,300),passed:false});
  process.exitCode=1;
} finally {
  // Never overwrite somebody else's changes even on failure.
  if(modified) atomicWrite(original,changed);
  client?.stop();
}
