import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {patchFeishuActiveRunSteeringBundle} from './patch-feishu-active-run-steering.mjs';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const mode=process.argv[2];assert(['status','prepare','apply','rollback'].includes(mode));
const state='/home/openclaw/.openclaw',main=state+'/openclaw.json',core='/opt/openclaw-2026.9.1-v/openclaw';
const unit='openclaw-gateway.service',old='/opt/openclaw-experiments/agent-worker-isolation-v1/releases/0.2.10-5f9e136';
const dest='/opt/openclaw-experiments/agent-worker-isolation-v1/releases/0.2.11-steer91';
const backup=state+'/backups/steer91-0.2.11-20260906',release=state+'/releases/steer91-0.2.11';
const drop='/etc/systemd/system/openclaw-gateway.service.d/zz-steer91-prestart.conf';
const dropText='[Service]\nExecStartPre=-+/opt/node-v22.23.1/bin/node '+release+'/apply-feishu-steer91-prestart.mjs '+state+'\n';
const monitor=state+'/npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/monitor.account-WFdlCDhR.js';
const archive='/tmp/worker-steer91-release.tgz';
const read=p=>JSON.parse(fs.readFileSync(p));const hash=x=>createHash('sha256').update(x).digest('hex');
const run=(cmd,args,options={})=>execFileSync(cmd,args,{encoding:'utf8',timeout:60000,...options}).trim();
function atomic(p,raw){const st=fs.statSync(p),t=p+'.steer91-'+process.pid;fs.writeFileSync(t,raw,{flag:'wx',mode:st.mode});fs.chownSync(t,st.uid,st.gid);fs.renameSync(t,p);}
const pid=run('systemctl',['show',unit,'-p','MainPID','--value']);
if(Number(pid)>0)for(const x of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[x.slice(0,x.indexOf('='))]=x.slice(x.indexOf('=')+1);
process.env.OPENCLAW_CONFIG_PATH=main;process.env.OPENCLAW_STATE_DIR=state;process.env.HOME='/home/openclaw';
const {callGatewayFromCli}=await import(core+'/dist/plugin-sdk/gateway-runtime.js');
const call=(m,p={})=>callGatewayFromCli(m,{timeout:'20000',json:true},p);
async function status(){
 const h=await call('health'),w=await call('vlab.workers.status');let offset=0,active=[];
 for(let page=0;page<20;page++){
  const s=await call('sessions.list',{limit:500,offset});active.push(...s.sessions.filter(x=>x.hasActiveRun===true));
  if(!s.hasMore)break;assert(page<19&&s.nextOffset>offset);offset=s.nextOffset;
 }
 const result={at:new Date().toISOString(),ok:h.ok,pid,version:w.integration?.workerIsolationVersion,pending:w.pending,
  workerActive:w.workers.reduce((n,x)=>n+x.activeCount,0),queued:w.workers.reduce((n,x)=>n+(x.queued??0),0),
  active:active.map(x=>({key:x.key,runtime:x.agentRuntime?.id})),eventLoop:h.eventLoop,
  channels:Object.fromEntries(Object.entries(h.channels??{}).map(([k,v])=>[k,{configured:v.configured,connected:v.connected,running:v.running,lastError:v.lastError}])),
  steer:w.integration?.activeRunSteer};
 console.log(JSON.stringify(result));return result;
}
async function idle(){const s=await status();assert(s.ok&&s.pending===0&&s.workerActive===0&&s.active.length===0&&s.queued===0,'Production has active work; do not restart');}
if(mode==='status'){await status();process.exit(0);}
const configs=[main,read(main).plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath];
assert.equal(read(core+'/package.json').version,'2026.9.1');
if(mode==='prepare'){
 assert(!fs.existsSync(backup)&&!fs.existsSync(dest)&&!fs.existsSync(release)&&!fs.existsSync(drop));
 assert.match(process.argv[3]??'',/^[a-f0-9]{64}$/);assert.match(process.argv[4]??'',/^[a-f0-9]{40}$/);
 assert.equal(hash(fs.readFileSync(archive)),process.argv[3]);
 const expected={'index.mjs':'1781be047a398732b217db3174706ba73fcb08e1f341f98330754ccf7567d36f','worker.mjs':'5ee6e9d7b9bfb7c8e9efe14dfca06bc501f3c8a572ec184661e7d5cec5478847','worker-pool.mjs':'afc7b95e8d6f6f57b6e1592fe269a4cd79f08e3d16cddd238ae11908b0159b12','native-attempt-bridge.mjs':'a7076200961df832e805b36da17fcfd54b379d23c488fa269db0325dce970bbc','worker-active-run-proxy.mjs':'dd3434389304ef0552e149b36285a35a6c12ead8de93f34a44df1188771f9a2a'};
 for(const [name,sha] of Object.entries(expected))assert.equal(hash(fs.readFileSync(old+'/'+name)),sha,'Production Worker drift: '+name);
 for(const p of configs)assert(read(p).plugins.load.paths.includes(old));
 const members=run('tar',['-tzf',archive]).split('\n');assert(members.every(x=>x==='experiments/'||x.startsWith('experiments/agent-worker-isolation-v1/')));assert(members.every(x=>!x.split('/').includes('..')));
 fs.mkdirSync(backup,{recursive:true,mode:0o700});const st=fs.statSync(main);fs.chownSync(backup,st.uid,st.gid);
 fs.mkdirSync(dest);run('tar',['-xzf',archive,'--strip-components=2','-C',dest]);run('chown',['-R','root:openclaw',dest]);run('chmod',['-R','g+rX',dest]);
 assert.equal(read(dest+'/package.json').version,'0.2.11');
 assert.deepEqual(read(dest+'/openclaw.plugin.json'),read(old+'/openclaw.plugin.json'),'Do not change plugin capabilities');
 fs.mkdirSync(release,{recursive:true,mode:0o755});
 for(const name of ['apply-feishu-steer91-prestart.mjs','patch-feishu-active-run-steering.mjs'])fs.copyFileSync(new URL('./'+name,import.meta.url),release+'/'+name);
 fs.copyFileSync(import.meta.filename,backup+'/deploy.mjs');fs.copyFileSync(new URL('./patch-feishu-active-run-steering.mjs',import.meta.url),backup+'/patch-feishu-active-run-steering.mjs');
 const before=fs.readFileSync(monitor,'utf8'),patched=patchFeishuActiveRunSteeringBundle(before);assert(patched.changed);
 fs.writeFileSync(backup+'/feishu.before.js',before,{flag:'wx',mode:0o600});fs.writeFileSync(backup+'/feishu.after.js',patched.source,{flag:'wx',mode:0o600});
 fs.writeFileSync(backup+'/release.json',JSON.stringify({commit:process.argv[4],archiveSha:process.argv[3],old,dest,entry:hash(fs.readFileSync(dest+'/index.mjs')),feishuBefore:hash(before),feishuAfter:hash(patched.source)}),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({prepared:true,liveConfigChanged:false,backup}));process.exit(0);
}
const manifest=read(backup+'/release.json');assert.equal(hash(fs.readFileSync(dest+'/index.mjs')),manifest.entry);
if(mode==='apply'||Number(pid)>0)await idle();
assert.equal(hash(fs.readFileSync(monitor)),mode==='apply'?manifest.feishuBefore:manifest.feishuAfter,'Feishu drift; refuse overwrite');
if(mode==='rollback')assert.equal(fs.readFileSync(drop,'utf8'),dropText);
const plans=configs.map((p,i)=>{
 const before=fs.readFileSync(p,'utf8'),c=JSON.parse(before),from=mode==='apply'?old:dest,to=mode==='apply'?dest:old;
 assert(c.plugins.load.paths.includes(from)&&!c.plugins.load.paths.includes(to),'Worker path changed');
 c.plugins.load.paths=c.plugins.load.paths.map(x=>x===from?to:x);
 const after=JSON.stringify(c,null,2)+'\n';
 const candidate=backup+'/'+i+'.'+mode+'.candidate.json',st=fs.statSync(p);
 fs.writeFileSync(candidate,after,{mode:0o600});fs.chownSync(candidate,st.uid,st.gid);
 try{run(process.execPath,[core+'/dist/index.js','config','validate','--json'],{uid:st.uid,gid:st.gid,env:{...process.env,OPENCLAW_CONFIG_PATH:candidate},stdio:['ignore','pipe','pipe']});}
 catch{throw Error('Candidate validation failed; live configuration untouched');}
 return {p,i,before,after};
});
if(mode==='apply'||Number(pid)>0)await idle();
for(const p of plans)assert.equal(fs.readFileSync(p.p,'utf8'),p.before,'Concurrent config mutation');
for(const p of plans){if(mode==='apply')fs.writeFileSync(backup+'/'+p.i+'.before.json',p.before,{flag:'wx',mode:0o600});atomic(p.p,p.after);}
atomic(monitor,fs.readFileSync(backup+'/feishu.'+(mode==='apply'?'after':'before')+'.js','utf8'));
if(mode==='apply')fs.writeFileSync(drop,dropText,{flag:'wx',mode:0o644});else fs.unlinkSync(drop);
run('systemctl',['daemon-reload']);run('systemctl',['restart',unit]);
console.log(JSON.stringify({at:new Date().toISOString(),mode,restartIssued:true,backup}));
