// Run the committed activation after promote-to-v installs the accepted bytes.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {acquireIdleFence} from '../../shared/lifecycle.mjs';
import {configureVcodex} from './config.mjs';

assert.equal(os.hostname(),'VM-8-2-ubuntu');
assert.equal(process.getuid(),0);
const unit='openclaw-gateway.service';
const core='/opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core';
const root='/home/openclaw/.openclaw';
const binary='/opt/codex-0.159.2-v/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex';
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',timeout:60000}).trim();
const pid=()=>Number(run('systemctl',['show',unit,'-p','MainPID','--value']));
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
assert.equal(run(binary,['--version']),'codex-cli 0.159.2');
assert.equal(hash(binary),'1748767b230ebfc3d4ab7e4e254920d0c0ad9691fd8c11f190e7d44511a4a92e');
for(const [name,sha] of [['model-route-contract-B2Q_03Gg.js','efb465d2bc7f474f7173bfbc6586d5a767e8970b7aa4031e6358543cb6f0384e'],['openai-chatgpt-provider-BApw3_oy.js','46bc8cc01badf720ab5d3443bf66cc2885b998f90a072b3588d6694566935df2']])assert.equal(hash(core+'/dist/'+name),sha,'Promoted artifact differs from shared VLab');
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
  const after=configureVcodex(before,{codexCommand:binary});
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
  held=await acquireIdleFence((method,params)=>client.request(method,params,{timeoutMs:30000}),'vcodex-sol61-production-'+Date.now());
  assert.equal(pid(),beforePid);
  for(const c of configs)assert.equal(fs.readFileSync(c.file,'utf8'),c.text,'Concurrent configuration change');
  console.log(JSON.stringify({phase:'idle-fence-ready',beforePid,suspensionId:held.suspensionId}));
  // Keep configuration writes out of the live watcher: stop only after idle.
  run('systemctl',['stop',unit]);stopped=true;assert.equal(pid(),0);client.stop();
  try{
    for(const c of configs){
      const output=run(process.execPath,[fileURLToPath(new URL('config.mjs',import.meta.url)),c.file,'--codex-bin',binary,'--apply']);
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
      const temp=c.file+'.sol61-restore-'+process.pid;
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
  assert(ready,'Gateway readiness timeout; inspect logs and preserve backups');
  assert.notEqual(pid(),beforePid);
  for(const c of configs)assert.deepEqual(JSON.parse(fs.readFileSync(c.file)),c.after);
  console.log(JSON.stringify({phase:'activated',beforePid,afterPid:pid(),ready:true,configurations:configs.map(c=>({file:c.file,sha256:hash(c.file)})),model:'openai/gpt-6.1-sol',runtime:'codex',codexVersion:'0.159.2',functionalAcceptance:'Real Feishu acceptance still required'}));
}finally{
  if(stopped)run('systemctl',['start',unit]);
  if(!applied&&held?.suspensionId&&pid()===beforePid)await client.request('gateway.suspend.resume',{suspensionId:held.suspensionId}).catch(()=>{});
  client.stop();
}
