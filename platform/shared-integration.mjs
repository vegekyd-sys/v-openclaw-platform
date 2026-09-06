// Explicitly authorized shared VLab integration only; no production target option.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const node='/opt/vlab/node-v22.23.1-linux-x64/bin/node';
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const unit='openclaw-vlab-production-mirror-v8.service',owner='codex-v-platform-20260906';
const source=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const release='v-platform-0.1.0-integration.1';
const beforeWorker=`${root}/runtime/plugins/worker-gpt-live-2368bdb`;
const afterWorker=`${root}/runtime/plugins/worker-${release}`;
const evidence=`${root}/state/${release}`;
const configPath=`${root}/state/openclaw.json`;
const core=`${root}/runtime/npm-global/lib/node_modules/openclaw`;
const read=p=>JSON.parse(fs.readFileSync(p));
const sha=x=>createHash('sha256').update(x).digest('hex');
const command=(bin,args,options={})=>execFileSync(bin,args,{encoding:'utf8',timeout:30000,...options});
assert.equal(command('hostname',[]).trim(),'VM-0-4-ubuntu');
const lease=()=>assert.equal(read('/srv/vlab-production-mirror/labs/control/integration.json').owner,owner);
lease();
assert.equal(read(`${core}/package.json`).version,'2026.9.1');
assert.equal(read(`${source}/platform/catalog.json`).releaseId,release);
const commit=command('git',['-C',source,'rev-parse','HEAD']).trim();
assert.equal(command('git',['-C',source,'status','--porcelain']).trim(),'');
const pid=()=>Number(command('systemctl',['show',unit,'-p','MainPID','--value']).trim());
const gatewayPid=pid();assert(gatewayPid>1);
for(const entry of fs.readFileSync(`/proc/${gatewayPid}/environ`,'utf8').split('\0')){
 const i=entry.indexOf('=');if(i>0)process.env[entry.slice(0,i)]=entry.slice(i+1);
}
assert.equal(process.env.OPENCLAW_CONFIG_PATH,configPath);
const original=fs.readFileSync(configPath),cfg=JSON.parse(original),st=fs.statSync(configPath);
assert.equal(cfg.gateway.port,24993);
const {GatewayClient}=await import(`${core}/dist/plugin-sdk/gateway-runtime.js`);
let client;
await new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{client?.stop();reject(Error('connect deadline'));},20000);
 client=new GatewayClient({url:'ws://127.0.0.1:24993',token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.write','operator.admin'],onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:e=>{clearTimeout(timer);reject(e);}});client.start();
});
const call=(method,params={})=>client.request(method,params,{timeoutMs:45000});
const status=async()=>{
 const s=await call('vlab.workers.status');
 return {generation:s.generation,closing:s.closing,pending:s.pending,workers:s.workers.map(w=>({pid:w.pid,ready:w.ready,activeCount:w.activeCount,queued:w.queued})),workerVersion:s.integration?.workerIsolationVersion};
};
const idle=async()=>{
 const s=await status();assert.equal(s.closing,false);assert.equal(s.pending,0);
 assert(s.workers.length>0&&s.workers.every(w=>w.ready&&w.activeCount===0&&w.queued===0));
 const sessions=await call('sessions.list',{limit:1000});assert(!sessions.hasMore,'Uninspected session page');
 assert(!(sessions.sessions??[]).some(x=>x.hasActiveRun===true||['running','queued','busy','active'].includes(x.status)),'Active business run');
 return s;
};
const record=(phase,value)=>{
 assert(fs.existsSync(evidence));const out=`${evidence}/${Date.now()}-${phase}.json`;
 fs.writeFileSync(out,JSON.stringify({release,commit,phase,gatewayPid,...value},null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({out,release,commit,phase,gatewayPid,...value}));
};
function writeConfig(value,expected){
 lease();assert.equal(sha(fs.readFileSync(configPath)),sha(expected),'Concurrent config change');
 const pending=`${evidence}/config-pending-${Date.now()}.json`;
 fs.writeFileSync(pending,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:st.mode&0o777});fs.chownSync(pending,st.uid,st.gid);
 command(node,[`${core}/dist/index.js`,'config','validate'],{timeout:120000,env:{...process.env,OPENCLAW_CONFIG_PATH:pending},stdio:['ignore','pipe','pipe']});
 assert.equal(sha(fs.readFileSync(configPath)),sha(expected));assert.equal(pid(),gatewayPid);lease();
 fs.renameSync(pending,configPath);
}
try{
 const mode=process.argv[2];
 if(mode==='inspect')console.log(JSON.stringify({release,commit,gatewayPid,reload:cfg.gateway.reload,workerPaths:cfg.plugins.load.paths.filter(p=>p.includes('worker-')),coreVersion:read(`${core}/package.json`).version,idle:await idle()}));
 else if(mode==='stage'){
  const before=await idle();assert.equal(cfg.gateway.reload?.mode,'off');
  assert.equal(cfg.plugins.load.paths.filter(p=>p===beforeWorker).length,1);assert(!fs.existsSync(afterWorker));assert(!fs.existsSync(evidence));
  const workerSource=`${source}/experiments/agent-worker-isolation-v1`;
  assert.equal(sha(fs.readFileSync(`${workerSource}/native-harness-data.mjs`)),sha(fs.readFileSync(`${beforeWorker}/native-harness-data.mjs`)));
  assert.equal(sha(fs.readFileSync(`${workerSource}/worker-runtime-lifecycle.mjs`)),sha(fs.readFileSync(`${beforeWorker}/worker-runtime-lifecycle.mjs`)),'Preserve GPT Live lifecycle');
  fs.mkdirSync(evidence,{mode:0o700});
  fs.writeFileSync(`${evidence}/original-openclaw.json`,original,{flag:'wx',mode:0o600});
  fs.writeFileSync(`${evidence}/unit.before.txt`,command('systemctl',['cat',unit]),{flag:'wx',mode:0o600});
  fs.cpSync(workerSource,afterWorker,{recursive:true,errorOnExist:true,force:false,dereference:false});
  const manifest=[];
  const walk=(dir,rel='')=>{for(const name of fs.readdirSync(dir).sort()){
   const p=`${dir}/${name}`,r=rel?`${rel}/${name}`:name,s=fs.lstatSync(p);assert(!s.isSymbolicLink(),'Worker symlink');
   fs.chownSync(p,st.uid,st.gid);if(s.isDirectory())walk(p,r);else{
    assert(s.isFile());const hash=sha(fs.readFileSync(p));assert.equal(hash,sha(fs.readFileSync(`${workerSource}/${r}`)));manifest.push({path:r,sha256:hash});
   }
  }};walk(afterWorker);fs.chownSync(afterWorker,st.uid,st.gid);
  await idle();cfg.plugins.load.paths=cfg.plugins.load.paths.map(p=>p===beforeWorker?afterWorker:p);
  writeConfig(cfg,original);
  record('staged',{before,beforeWorker,afterWorker,manifest,configChanges:['plugins.load.paths'],configSha:sha(fs.readFileSync(configPath)),originalConfigSha:sha(original)});
 }else if(mode==='probe'){
  await idle();assert(cfg.plugins.load.paths.includes(afterWorker));
  const stamp=Date.now(),key=`agent:makaron:explicit:vplatform-shared-${stamp}`;
  const tool=`VPLATFORM_SHARED_${stamp}_TOOL`,final=`VPLATFORM_SHARED_${stamp}_DONE`;
  await call('sessions.patch',{key,agentId:'makaron',model:'deepseek/deepseek-v4-pro'});
  let runId,terminal;
  try{
   const a=await call('chat.send',{agentId:'makaron',sessionKey:key,deliver:false,idempotencyKey:key,timeoutMs:180000,message:`这是用户授权的 VLab 内部集成验收。不得读写业务文件、记忆、配置，不访问网络、浏览器，不发外部消息，不委派子任务。只调用 exec 执行 printf '${tool}\\n'，核对真实工具结果后只回复 ${final}。不得伪造成功。`});runId=a.runId;
   for(let i=0;i<6;i++){const d=await call('agent.wait',{runId,timeoutMs:30000});if(!['timeout','running'].includes(d.status)){terminal=d.status;break;}}
   assert.equal(terminal,'ok');
   const h=await call('chat.history',{agentId:'makaron',sessionKey:key,limit:20}),m=h.messages??[];
   const txt=x=>typeof x.content==='string'?x.content:JSON.stringify((x.content??[]).filter(c=>c.type==='text'));
   const models=[...new Set(m.filter(x=>x.role==='assistant').map(x=>x.model).filter(Boolean))];
   assert.deepEqual(models,['deepseek-v4-pro']);assert.equal(h.sessionInfo?.agentRuntime?.id,'vlab-worker');
   assert(m.some(x=>x.role==='toolResult'&&txt(x).includes(tool)));
   assert(m.some(x=>x.role==='assistant'&&txt(x).includes(final)));assert(!m.some(x=>x.isError||x.stopReason==='error'));
   assert.equal(pid(),gatewayPid);record('probe',{key,runId,models,runtime:'vlab-worker',realTool:true,finalReply:true,deliver:false,passed:true,status:await status()});
  }finally{if(runId&&!terminal)await call('chat.abort',{sessionKey:key,runId}).catch(()=>{});}
 }else if(mode==='verify'){
  const saved=read(`${evidence}/original-openclaw.json`);saved.plugins.load.paths=saved.plugins.load.paths.map(p=>p===beforeWorker?afterWorker:p);
  assert.deepEqual(cfg,saved,'Unexpected configuration delta');
  const staging=fs.readdirSync(evidence).filter(x=>x.endsWith('-staged.json'));assert.equal(staging.length,1);
  for(const item of read(`${evidence}/${staging[0]}`).manifest)assert.equal(sha(fs.readFileSync(`${afterWorker}/${item.path}`)),item.sha256);
  record('verified',{configChanges:['plugins.load.paths'],coreVersion:'2026.9.1',workerPath:afterWorker,status:await idle(),passed:true});
 }else throw Error('Expected inspect, stage, probe or verify');
}finally{client.stop();}
