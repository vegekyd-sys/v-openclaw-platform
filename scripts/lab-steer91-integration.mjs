import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {patchFeishuActiveRunSteeringBundle} from './patch-feishu-active-run-steering.mjs';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const owner='01a06fbe-7654-7331-8d6e-73a8cd2dcd7e';
const g='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const source='/srv/vlab-production-mirror/labs/instances/steer91/source';
const core=g+'/runtime/npm-global/lib/node_modules/openclaw';
const main=g+'/state/openclaw.json',unit='openclaw-vlab-production-mirror-v8.service';
const old=g+'/runtime/plugins/worker-image-provenance-5f9e136',dest=g+'/runtime/plugins/worker-steer91-rc1';
const backup=g+'/backups/steer91-rc1-20260906';
const dropDir='/run/systemd/system/'+unit+'.d',dropIn=dropDir+'/90-steer91-test.conf';
const dropText='[Service]\nEnvironment=VLAB_FEISHU_STEER_ENABLED=1\nEnvironment=VLAB_FEISHU_STEER_CHAT_IDS=*\n';
const monitor=g+'/state/npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/monitor.account-WFdlCDhR.js';
const read=p=>JSON.parse(fs.readFileSync(p));
const hash=x=>createHash('sha256').update(x).digest('hex');
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',timeout:60000}).trim();
const mode=process.argv[2];assert(['status','apply','rollback','rpc'].includes(mode));
const pid=run('systemctl',['show',unit,'-p','MainPID','--value']);assert(Number(pid)>0);
for(const x of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[x.slice(0,x.indexOf('='))]=x.slice(x.indexOf('=')+1);
process.env.OPENCLAW_CONFIG_PATH=main;
const {callGatewayFromCli}=await import(core+'/dist/plugin-sdk/gateway-runtime.js');
const call=(m,p={})=>callGatewayFromCli(m,{timeout:'45000',json:true},p);
async function status(){
 const h=await call('health'),w=await call('vlab.workers.status'),s=await call('sessions.list',{limit:1000});
 assert(!s.hasMore,'Uninspected session page');
 const active=s.sessions.filter(x=>x.hasActiveRun===true);
 const result={at:new Date().toISOString(),ok:h.ok,pid,version:w.integration?.workerIsolationVersion,pending:w.pending,
  workerActive:w.workers.reduce((n,x)=>n+x.activeCount,0),queued:w.workers.reduce((n,x)=>n+(x.queued??0),0),
  active:active.map(x=>({key:x.key,runtime:x.agentRuntime?.id})),channels:h.channels,
  steer:w.integration?.activeRunSteer,eventLoop:h.eventLoop};
 console.log(JSON.stringify(result));return result;
}
function lease(){assert.equal(read('/srv/vlab-production-mirror/labs/control/integration.json').owner,owner);}
function atomic(p,raw){const st=fs.statSync(p),t=p+'.steer91-'+process.pid;fs.writeFileSync(t,raw,{flag:'wx',mode:st.mode});fs.chownSync(t,st.uid,st.gid);fs.renameSync(t,p);}
if(mode==='status'){await status();process.exit(0);}
lease();
if(mode==='rpc'){
 const method=process.argv[3];assert(['chat.history','sessions.patch','agent.wait','vlab.workers.status'].includes(method));
 const params=JSON.parse(process.argv[4]??'{}');
 if(method==='sessions.patch')assert.equal(params.key,'agent:makaron:feishu:direct:ou_775a78b0aaae67da5e15eeaf102e3cd9');
 console.log(JSON.stringify(await call(method,params)));process.exit(0);
}
const s=await status();assert(s.ok&&s.pending===0&&s.workerActive===0&&s.active.length===0&&s.queued===0,'Integration not idle');
const configs=[main,read(main).plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath];
assert.equal(read(core+'/package.json').version,'2026.9.1');
let plans,feishu;
if(mode==='apply'){
 assert(!fs.existsSync(backup));assert(!fs.existsSync(dest));
 assert(!fs.existsSync(dropIn));
 assert.equal(read(source+'/experiments/agent-worker-isolation-v1/package.json').version,'0.2.11-rc.1');
 assert.equal(run('git',['-C',source,'status','--porcelain']),'');
 fs.mkdirSync(backup,{recursive:true,mode:0o700});
 const configOwner=fs.statSync(main);fs.chownSync(backup,configOwner.uid,configOwner.gid);
 fs.cpSync(source+'/experiments/agent-worker-isolation-v1',dest,{recursive:true});
 run('chmod',['-R','a+rX',dest]);
 plans=configs.map((p,i)=>{
   const before=fs.readFileSync(p,'utf8'),c=JSON.parse(before);
   assert(c.plugins.load.paths.includes(old));c.plugins.load.paths=c.plugins.load.paths.map(x=>x===old?dest:x);
   fs.writeFileSync(backup+'/'+i+'.before.json',before,{flag:'wx',mode:0o600});
   return {p,before,after:JSON.stringify(c,null,2)+'\n'};
 });
 const before=fs.readFileSync(monitor,'utf8'),p=patchFeishuActiveRunSteeringBundle(before);assert(p.changed);
 fs.writeFileSync(backup+'/feishu.before.js',before,{flag:'wx',mode:0o600});
 feishu={p:monitor,before,after:p.source};
 fs.writeFileSync(backup+'/release.json',JSON.stringify({commit:run('git',['-C',source,'rev-parse','HEAD']),old,dest,
  files:[...plans,feishu].map(x=>({path:x.p,before:hash(x.before),after:hash(x.after)}))}),{flag:'wx',mode:0o600});
} else {
 assert.equal(fs.readFileSync(dropIn,'utf8'),dropText,'Test environment override drift');
 const r=read(backup+'/release.json');
 plans=configs.map((p,i)=>({p,before:fs.readFileSync(p,'utf8'),after:fs.readFileSync(backup+'/'+i+'.before.json','utf8')}));
 feishu={p:monitor,before:fs.readFileSync(monitor,'utf8'),after:fs.readFileSync(backup+'/feishu.before.js','utf8')};
 for(const x of [...plans,feishu])assert.equal(hash(x.before),r.files.find(y=>y.path===x.p).after,'Concurrent changes; refuse blind rollback');
}
for(const p of plans){
 const candidate=backup+'/'+configs.indexOf(p.p)+'.'+mode+'.candidate.json';const st=fs.statSync(p.p);
 fs.writeFileSync(candidate,p.after,{mode:0o600});fs.chownSync(candidate,st.uid,st.gid);
 try{execFileSync(process.execPath,[core+'/dist/index.js','config','validate','--json'],{uid:st.uid,gid:st.gid,env:{...process.env,OPENCLAW_CONFIG_PATH:candidate},stdio:['ignore','pipe','pipe'],timeout:45000});}
 catch{throw Error('Candidate validation failed; live configuration untouched');}
}
lease();for(const x of [...plans,feishu])assert.equal(fs.readFileSync(x.p,'utf8'),x.before,'Concurrent mutation');
if(mode==='apply'){fs.mkdirSync(dropDir,{recursive:true});fs.writeFileSync(dropIn,dropText,{flag:'wx',mode:0o644});}
else fs.unlinkSync(dropIn);
run('systemctl',['daemon-reload']);
for(const x of [...plans,feishu])atomic(x.p,x.after);
run('systemctl',['restart',unit]);
console.log(JSON.stringify({at:new Date().toISOString(),mode,restartIssued:true,backup}));
