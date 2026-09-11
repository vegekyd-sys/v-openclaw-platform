import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {setTimeout as sleep}from'node:timers/promises';
import {nativeExecutionConfig}from'./native-execution-config.mjs';
import {restoreMemoryToolPolicy}from'./native-memory-policy.mjs';
const variant=process.argv[2];assert(['native','worker','restore','recover-offline'].includes(variant));
const owner='01a07b32-72be-7fe0-85d4-00680ea01f4e',base='/srv/vlab-production-mirror/labs/instances/db91-parity',ctl='/srv/vlab-production-mirror/labs/control',dir=ctl+'/native-parity-validation-20260911',unit='openclaw-vlab-production-mirror-v8.service';
const read=p=>JSON.parse(fs.readFileSync(p)),hash=b=>createHash('sha256').update(b).digest('hex'),bytes=o=>Buffer.from(JSON.stringify(o,null,2)+'\n');
const run=(c,a)=>execFileSync(c,a,{encoding:'utf8',timeout:20000}).trim(),pidNow=()=>Number(run('systemctl',['show',unit,'-p','MainPID','--value']));
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
function guard(){assert.equal(read(ctl+'/integration.json').owner,owner);assert(!fs.existsSync('/srv/vlab-production-mirror/labs/shared-workflow/pending.json'));const st=fs.statfsSync(base);assert(st.bavail*st.bsize>=3*1024**3,'3 GiB reserve');}
guard();fs.mkdirSync(dir,{recursive:true,mode:0o700});const pid=pidNow();
if(!fs.existsSync(dir+'/manifest.json')){
 assert(pid>1);const env=Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
 const gp=env.OPENCLAW_CONFIG_PATH;assert(gp.startsWith(base+'/state/'));const current=fs.readFileSync(gp),old=read(ctl+'/native-execution-rollout-20260911/manifest.json'),source=fs.readFileSync(ctl+'/native-execution-rollout-20260911/original-config.json');assert.equal(hash(source),old.originalSha);assert.equal(hash(current),hash(bytes(nativeExecutionConfig(JSON.parse(source),base))),'Unexpected initial config');
 const wp=JSON.parse(source).plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath;assert(wp.startsWith(base+'/state/'));const wb=fs.readFileSync(wp);
 for(const[n,b]of[['gateway-original.json',current],['gateway-worker-base.json',source],['worker-original.json',wb]])fs.writeFileSync(dir+'/'+n,b,{flag:'wx',mode:0o600});
 fs.writeFileSync(dir+'/manifest.json',JSON.stringify({owner,gatewayPath:gp,workerPath:wp,gatewaySha:hash(current),workerSha:hash(wb),baseGatewaySha:hash(source),runtime:read('/srv/vlab-production-mirror/labs/shared-workflow/current.json'),at:new Date().toISOString()}),{flag:'wx',mode:0o600});
}
const m=read(dir+'/manifest.json');assert.equal(m.owner,owner);assert.deepEqual(read('/srv/vlab-production-mirror/labs/shared-workflow/current.json'),m.runtime);
const originalG=fs.readFileSync(dir+'/gateway-original.json'),originalW=fs.readFileSync(dir+'/worker-original.json'),baseG=fs.readFileSync(dir+'/gateway-worker-base.json');assert.equal(hash(originalG),m.gatewaySha);assert.equal(hash(originalW),m.workerSha);assert.equal(hash(baseG),m.baseGatewaySha);
const prior=fs.existsSync(dir+'/mode.json')?read(dir+'/mode.json'):{gatewaySha:m.gatewaySha,workerSha:m.workerSha};
const beforeG=fs.readFileSync(m.gatewayPath),beforeW=fs.readFileSync(m.workerPath);assert.equal(hash(beforeG),prior.gatewaySha);assert.equal(hash(beforeW),prior.workerSha);
let nextG=originalG,nextW=originalW;
if(['native','worker'].includes(variant)){let g=JSON.parse(baseG);if(variant==='native')g=nativeExecutionConfig(g,base);nextG=bytes(restoreMemoryToolPolicy(g));nextW=bytes(restoreMemoryToolPolicy(JSON.parse(originalW)));}
function replace(p,b){const st=fs.statSync(p),tmp=p+'.native-parity-tmp';fs.writeFileSync(tmp,b,{flag:'wx',mode:st.mode});fs.chownSync(tmp,st.uid,st.gid);fs.renameSync(tmp,p);}
function record(g,w,v){fs.writeFileSync(dir+'/mode.json',JSON.stringify({variant:v,gatewaySha:hash(g),workerSha:hash(w),at:new Date().toISOString()}),{mode:0o600});}
if(variant==='recover-offline'){assert.equal(pid,0,'Offline recovery refuses live Gateway');replace(m.gatewayPath,originalG);replace(m.workerPath,originalW);record(originalG,originalW,'restore');run('systemctl',['start',unit]);console.log(JSON.stringify({restored:true,readiness:'not verified'}));process.exit(0);}
assert(pid>1);const env=Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));Object.assign(process.env,env);const cfg=JSON.parse(beforeG);let client,held,stopped=false;
const {GatewayClient}=await import(base+'/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');
const call=(method,p={})=>client.request(method,p,{timeoutMs:20000});
try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('connect timeout')),20000);client=new GatewayClient({url:'ws://127.0.0.1:24993',token:cfg.gateway.auth.token.replace(/\$\{([^}]+)\}/g,(_,k)=>env[k]),deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.admin','operator.read','operator.write'],onHelloOk(){clearTimeout(timer);resolve();},onConnectError(e){clearTimeout(timer);reject(e);}});client.start();});
 held=await call('gateway.suspend.prepare',{requestId:'native-parity-'+Date.now(),drain:true,terminalPolicy:'preserve'});assert(held.suspensionId);let ready=false;const until=Date.now()+45000;while(Date.now()<until){const s=await call('gateway.suspend.status',{suspensionId:held.suspensionId});if(s.status==='ready'&&s.expiresAtMs>Date.now()){ready=true;break;}await sleep(1000);}assert(ready,'Drain failed; no cutover');guard();assert.equal(pidNow(),pid);run('systemctl',['stop',unit]);stopped=true;assert.equal(pidNow(),0);replace(m.gatewayPath,nextG);replace(m.workerPath,nextW);record(nextG,nextW,variant);run('systemctl',['start',unit]);stopped=false;console.log(JSON.stringify({variant,gatewaySha:hash(nextG),workerSha:hash(nextW),runtimeUnchanged:true,startedAt:Date.now(),readiness:'not verified'}));
}catch(e){if(stopped){replace(m.gatewayPath,beforeG);replace(m.workerPath,beforeW);record(beforeG,beforeW,prior.variant??'restore');run('systemctl',['start',unit]);stopped=false;}throw e;}finally{if(held&&pidNow()===pid)await call('gateway.suspend.resume',{suspensionId:held.suspensionId}).catch(()=>{});client?.stop();}
