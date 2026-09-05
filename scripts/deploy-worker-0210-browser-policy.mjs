import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {patchChannelRegistry,marker} from './patch-worker-channel-registry.mjs';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const mode=process.argv[2];assert(['prepare','apply','rollback','status'].includes(mode));
const root='/home/openclaw/.openclaw',main=root+'/openclaw.json',core='/opt/openclaw-2026.9.1-v/openclaw',unit='openclaw-gateway.service';
const backup=root+'/backups/worker-0.2.10-browser-policy-20260905';
const old='/opt/openclaw-experiments/agent-worker-isolation-v1/releases/bb69480-nativehooks-v1';
const dest='/opt/openclaw-experiments/agent-worker-isolation-v1/releases/0.2.10-86493d1';
const archive='/tmp/worker-0210-86493d1.tar.gz';
const read=p=>JSON.parse(fs.readFileSync(p));const hash=b=>createHash('sha256').update(b).digest('hex');
const configFiles=()=>[main,read(main).plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath];
const project=c=>({workerPaths:c.plugins.load.paths.filter(p=>p===old||p===dest),policy:c.browser?.ssrfPolicy??null});
function atomic(p,text){const st=fs.statSync(p),t=p+'.0210-'+process.pid;fs.writeFileSync(t,text,{flag:'wx',mode:st.mode});fs.chownSync(t,st.uid,st.gid);fs.renameSync(t,p);}
const pid=execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);
process.env.OPENCLAW_CONFIG_PATH=main;
const {callGatewayFromCli}=await import(core+'/dist/plugin-sdk/gateway-runtime.js');
const call=(m,p={})=>callGatewayFromCli(m,{timeout:'20000',json:true},p);
async function idle(){
 const h=await call('health'),w=await call('vlab.workers.status');assert(h.ok);
 let offset=0,active=0;
 for(let page=0;page<10;page++) {const s=await call('sessions.list',{limit:1000,offset});active+=s.sessions.filter(x=>x.hasActiveRun===true).length;if(!s.hasMore)break;assert(s.nextOffset>offset&&page<9);offset=s.nextOffset;}
 const workerActive=w.workers.reduce((n,x)=>n+x.activeCount,0),ready=w.pending===0&&workerActive===0&&w.workers.every(x=>!x.queued)&&active===0;
 console.log(JSON.stringify({at:new Date().toISOString(),ready,pending:w.pending,workerActive,active}));return ready;
}
if(mode==='status'){await idle();process.exit(0);}
assert.equal(read(core+'/package.json').version,'2026.9.1');
if(mode==='prepare') {
 assert(!fs.existsSync(backup));assert(!fs.existsSync(dest));
 assert.match(process.argv[3]??'',/^[a-f0-9]{64}$/);assert.equal(hash(fs.readFileSync(archive)),process.argv[3]);
 const previous=read(root+'/backups/astra-browser-nativehooks-20260905/release.json');
 assert.equal(hash(fs.readFileSync(old+'/worker.mjs')),previous.workerAfter,'Production Worker drift');
 assert.equal(hash(fs.readFileSync(old+'/native-hook-runtime.mjs')),previous.helper);
 for(const [name,expected] of Object.entries({'index.mjs':'31ceb3330e48534706e7a6d2ce301ca9c928c72a564e7a06304d90220aa0b3aa','native-attempt-bridge.mjs':'cdce99efe8264b0495ad0f7688ec46788512154242b301b0690e77748d53282d','package.json':'e7bc739dabb7daf924834e88dde40fe76ea713138cda44c8c42bf8958712ee5b'}))assert.equal(hash(fs.readFileSync(old+'/'+name)),expected,'Production source drift: '+name);
 // V already has the same onAgentHarnesses declaration, formatted differently.
 assert.deepEqual(read(old+'/openclaw.plugin.json'),JSON.parse(execFileSync('tar',['-xOf',archive,'experiments/agent-worker-isolation-v1/openclaw.plugin.json'],{encoding:'utf8'})),'Production manifest semantics changed');
 for(const name of ['native-harness-data.mjs','gateway-owned-terminal.mjs'])assert(!fs.existsSync(old+'/'+name));
 for(const p of configFiles())assert(read(p).plugins.load.paths.includes(old));
 fs.mkdirSync(backup,{mode:0o700});fs.cpSync(old,dest,{recursive:true,verbatimSymlinks:true});
 execFileSync('tar',['-xzf',archive,'--strip-components=2','-C',dest]);
 execFileSync('chown',['-R','root:openclaw',dest]);execFileSync('chmod',['-R','g+rX',dest]);
 assert.equal(read(dest+'/package.json').version,'0.2.10');
 const files=fs.readdirSync(core+'/dist').filter(n=>/^registry-lookup-.*\.js$/.test(n)).map(n=>core+'/dist/'+n).filter(p=>fs.readFileSync(p,'utf8').includes('function getActivePluginChannelRegistrySnapshotFromState()'));
 assert.equal(files.length,1);const file=files[0],before=fs.readFileSync(file,'utf8');assert(!before.includes(marker));const after=patchChannelRegistry(before);
 fs.writeFileSync(backup+'/registry.before.js',before,{mode:0o600,flag:'wx'});fs.writeFileSync(backup+'/registry.after.js',after,{mode:0o600,flag:'wx'});
 fs.writeFileSync(backup+'/release.json',JSON.stringify({file,before:hash(before),after:hash(after),archiveSha:process.argv[3],commit:'86493d1',dest,old,entrySha:hash(fs.readFileSync(dest+'/index.mjs'))}),{mode:0o600});
 console.log(JSON.stringify({prepared:true,liveConfigChanged:false,backup}));process.exit(0);
}
const release=read(backup+'/release.json');assert.equal(hash(fs.readFileSync(dest+'/index.mjs')),release.entrySha);
if(!await idle())process.exit(2);
const pending=[];
for(const [i,p] of configFiles().entries()) {
 const raw=fs.readFileSync(p,'utf8'),c=JSON.parse(raw),before=project(c);
 if(mode==='apply') {
  assert(c.plugins.load.paths.includes(old));c.plugins.load.paths=c.plugins.load.paths.map(x=>x===old?dest:x);
  c.browser??={};c.browser.ssrfPolicy={...c.browser.ssrfPolicy,allowedHostnames:[...new Set([...(c.browser.ssrfPolicy?.allowedHostnames??[]),'localhost','192.168.1.50'])]};
 } else {
  const delta=read(backup+'/'+i+'.delta.json');assert.deepEqual(before,delta.after,'Owned configuration drift; refuse blind rollback');
  c.plugins.load.paths=c.plugins.load.paths.map(x=>x===dest?old:x);
  if(delta.before.policy===null)delete c.browser.ssrfPolicy;else c.browser.ssrfPolicy=delta.before.policy;
 }
 const owner=fs.statSync(p);fs.chownSync(backup,owner.uid,owner.gid);
 const candidate=backup+'/'+i+'.'+mode+'.candidate.json';fs.writeFileSync(candidate,JSON.stringify(c,null,2)+'\n',{mode:0o600});fs.chownSync(candidate,owner.uid,owner.gid);
 try{execFileSync(process.execPath,[core+'/dist/index.js','config','validate','--json'],{uid:owner.uid,gid:owner.gid,env:{...process.env,OPENCLAW_CONFIG_PATH:candidate},stdio:['ignore','pipe','pipe'],timeout:30000});}
 catch{throw new Error('Native candidate config validation failed; live files untouched');}
 pending.push({i,p,raw,c,before,after:project(c)});
}
const expectedCore=mode==='apply'?release.before:release.after;
assert.equal(hash(fs.readFileSync(release.file)),expectedCore,'Core registry drift');
if(!await idle())process.exit(2);
for(const x of pending)assert.equal(fs.readFileSync(x.p,'utf8'),x.raw,'Concurrent config mutation');
for(const x of pending){if(mode==='apply'){fs.writeFileSync(backup+'/'+x.i+'.before.json',x.raw,{flag:'wx',mode:0o600});fs.writeFileSync(backup+'/'+x.i+'.delta.json',JSON.stringify({before:x.before,after:x.after}),{flag:'wx',mode:0o600});}atomic(x.p,JSON.stringify(x.c,null,2)+'\n');}
atomic(release.file,fs.readFileSync(backup+'/registry.'+(mode==='apply'?'after':'before')+'.js','utf8'));
console.log(JSON.stringify({at:new Date().toISOString(),mode,configAndCoreUpdated:true,backup}));
execFileSync('systemctl',['restart',unit],{timeout:60000});
console.log(JSON.stringify({at:new Date().toISOString(),mode,restartIssued:true}));
