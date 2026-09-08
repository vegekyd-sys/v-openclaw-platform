// Production transaction: idle-only stop/apply/start, with rollback on failure.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const core='/opt/openclaw-2026.9.1-v/openclaw',root='/home/openclaw/.openclaw',unit='openclaw-gateway.service';
const source=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
assert.equal(source,'/opt/openclaw-experiments/bundle-prep-observer-20260908/source');
const evidence=root+'/backups/bundle-prep-observer-release-20260908';
const read=p=>JSON.parse(fs.readFileSync(p));
const run=(bin,args,options={})=>execFileSync(bin,args,{encoding:'utf8',timeout:30000,...options}).trim();
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const pid=()=>Number(run('systemctl',['show',unit,'-p','MainPID','--value']));
const installer=action=>JSON.parse(run(process.execPath,[source+'/scripts/install-bundle-prep-observer.mjs',action,'production']));
const commit=run('git',['-C',source,'rev-parse','HEAD']);assert.equal(run('git',['-C',source,'status','--porcelain']),'');
const mode=process.argv[2];assert(['inspect','stage','activate','verify','rollback'].includes(mode));
const initialPid=pid();assert(initialPid>1);
for(const e of fs.readFileSync('/proc/'+initialPid+'/environ','utf8').split('\0')){const i=e.indexOf('=');if(i>0)process.env[e.slice(0,i)]=e.slice(i+1);}
const cfg=read(root+'/openclaw.json');assert.equal(cfg.gateway.port,22793);
const worker=cfg.plugins.entries['vlab-agent-worker-isolation'].config;
const protectedPaths=[root+'/openclaw.json',worker.workerConfigPath,core+'/dist/agent-command-DPfawBbr.js',
 '/opt/openclaw-experiments/agent-worker-isolation-v1/releases/0.2.11-steer91/worker.mjs',
 '/opt/openclaw-experiments/agent-worker-isolation-v1/releases/0.2.11-steer91/index.mjs',
 '/opt/openclaw-experiments/agent-worker-isolation-v1/releases/0.2.11-steer91/worker-pool.mjs'];
const protectedFiles=protectedPaths.map(file=>({file,sha:hash(file)}));
const {GatewayClient}=await import(core+'/dist/plugin-sdk/gateway-runtime.js');let client;
async function connect(){
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{client?.stop();reject(Error('Gateway readiness deadline'));},25000);
  client=new GatewayClient({url:'ws://127.0.0.1:22793',token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read'],
   onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:error=>{clearTimeout(timer);client?.stop();reject(error);}});client.start();
 });
}
async function ready(){
 for(let i=0;i<4;i++){try{await connect();return;}catch(error){if(i===3)throw error;await new Promise(r=>setTimeout(r,1000));}}
}
async function activity(){
 const w=await client.request('vlab.workers.status',{}, {timeoutMs:30000});
 let active=0,offset=0,count=0;
 for(let page=0;page<10;page++){
  const s=await client.request('sessions.list',{limit:1000,offset},{timeoutMs:45000});count+=(s.sessions??[]).length;
  active+=(s.sessions??[]).filter(x=>typeof x.hasActiveRun==='boolean'?x.hasActiveRun:['running','queued','busy','active'].includes(x.status)).length;
  if(!s.hasMore)break;assert(page<9&&s.nextOffset>offset,'incomplete activity snapshot');offset=s.nextOffset;
 }
 return {pending:w.pending,activeSessions:active,sessionCount:count,workers:w.workers.map(x=>({pid:x.pid,ready:x.ready,activeCount:x.activeCount,queued:x.queued})),
  idle:!w.closing&&w.pending===0&&active===0&&w.workers.every(x=>x.ready&&x.activeCount===0&&!x.queued)};
}
const record=(phase,data={})=>{const row={phase,at:new Date().toISOString(),commit,...data};
 fs.mkdirSync(evidence,{recursive:true,mode:0o700});fs.writeFileSync(evidence+'/'+Date.now()+'-'+phase+'.json',JSON.stringify(row,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify(row));};
const validate=saved=>{assert.equal(saved.commit,commit);for(const p of saved.protectedFiles)assert.equal(hash(p.file),p.sha,'protected code/config changed');};
try{
 await ready();
 if(mode==='inspect'){console.log(JSON.stringify({commit,pid:pid(),activity:await activity(),plan:installer('check'),protectedFiles}));}
 else if(mode==='stage'){
  assert(!fs.existsSync(evidence+'/stage.json'),'already staged');const plan=installer('check');
  const saved={commit,initialPid,protectedFiles,plan,activity:await activity()};
  fs.mkdirSync(evidence,{recursive:true,mode:0o700});fs.writeFileSync(evidence+'/stage.json',JSON.stringify(saved,null,2),{flag:'wx',mode:0o600});record('staged',{pid:initialPid,activity:saved.activity,productionRuntimeUnchanged:true});
 }else if(mode==='verify'){
  const saved=read(evidence+'/stage.json');validate(saved);installer('verify');record('verified',{pid:pid(),activity:await activity(),protectedFilesUnchanged:true});
 }else{
  const saved=read(evidence+'/stage.json');validate(saved);
  if(mode==='activate')assert.deepEqual(installer('check').files,saved.plan.files);
  const before=await activity();assert(before.idle,'active business; no stop or patch performed');
  await new Promise(r=>setTimeout(r,1000));const second=await activity();assert(second.idle,'activity changed; no stop or patch performed');
  validate(saved);record('idle-confirmed',{pid:pid(),activity:second});client.stop();client=undefined;
  let stopped=false,applied=false;
  try{
   run('systemctl',['stop',unit],{timeout:120000});assert.equal(pid(),0);stopped=true;validate(saved);
   installer(mode==='activate'?'apply':'rollback');applied=true;
   run('systemctl',['start',unit],{timeout:120000});await ready();
   if(mode==='activate')installer('verify');validate(saved);
   record(mode==='activate'?'activated':'rolled-back',{beforePid:initialPid,pid:pid(),activity:await activity(),protectedFilesUnchanged:true,businessAcceptance:'pending'});
  }catch(error){
   client?.stop();client=undefined;
   if(stopped){
    run('systemctl',['stop',unit],{timeout:120000});assert.equal(pid(),0);
    if(applied||fs.existsSync(root+'/backups/bundle-prep-observer-20260908/manifest.json'))installer('rollback');
    run('systemctl',['start',unit],{timeout:120000});await ready();record('automatic-rollback',{pid:pid(),errorName:error?.name??'Error'});
   }
   throw error;
  }
 }
}finally{client?.stop();}
