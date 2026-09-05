import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const mode=process.argv[2];assert(['prepare','apply','rollback','status'].includes(mode));
const unit='openclaw-gateway.service',main='/home/openclaw/.openclaw/openclaw.json';
const core='/opt/openclaw-2026.9.1-v/openclaw';
const backup='/home/openclaw/.openclaw/backups/astra-browser-nativehooks-20260905';
const oldWorker='/opt/openclaw-experiments/agent-worker-isolation-v1/releases/bb69480-transcript-v1';
const newWorker='/opt/openclaw-experiments/agent-worker-isolation-v1/releases/bb69480-nativehooks-v1';
const oldBrowser='/opt/v-browser/releases/0.4.5/openclaw-plugin',newBrowser='/opt/v-browser/releases/0.4.6/openclaw-plugin';
const digest=x=>createHash('sha256').update(x).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p));
const files=()=>[main,read(main).plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath];
const alias=c=>{
 for(const id of ['makaron','v-codex']) {
  const a=c.agents.entries[id];a.models??={};const old=a.models['openai/gpt-6-astra']??{};
  a.models['openai/gpt-6-astra']={...old,alias:'astra',params:{...old.params,thinking:'high'},agentRuntime:{id:'codex'}};
 }
};
const projection=c=>({paths:c.plugins.load.paths,entries:Object.fromEntries(['makaron','v-codex'].map(id=>[id,c.agents.entries[id].models?.['openai/gpt-6-astra']??null]))});
const pid=execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);
process.env.OPENCLAW_CONFIG_PATH=main;
const {callGatewayFromCli}=await import(core+'/dist/plugin-sdk/gateway-runtime.js');
const call=(m,p={})=>callGatewayFromCli(m,{timeout:'20000',json:true},p);
async function idle() {
 const w=await call('vlab.workers.status'),h=await call('health');assert(h.ok);
 let offset=0,active=[];
 for(let page=0;page<10;page++) {
  const s=await call('sessions.list',{limit:1000,offset});
  active.push(...s.sessions.filter(x=>x.hasActiveRun===true).map(x=>x.key));
  if(!s.hasMore)break;
  assert(Number.isInteger(s.nextOffset)&&s.nextOffset>offset,'Cannot safely paginate active sessions');offset=s.nextOffset;
  assert(page<9,'Too many sessions to confirm safe window');
 }
 const ready=w.pending===0&&w.workers.every(x=>x.activeCount===0&&(!x.queued||x.queued===0))&&active.length===0;
 console.log(JSON.stringify({at:new Date().toISOString(),ready,pending:w.pending,activeCount:active.length,workerActive:w.workers.reduce((n,w)=>n+w.activeCount,0)}));
 return ready;
}
if(mode==='status'){await idle();process.exit(0);}
if(mode==='prepare') {
 assert(!fs.existsSync(backup));assert(!fs.existsSync(newWorker));assert(!fs.existsSync(newBrowser));
 assert.equal(digest(fs.readFileSync('/tmp/v-browser-plugin-0.4.6-final.tar.gz')),'a6fb73f3ed3f6b806273c64b28739ee3bd65eb2695c03a4ae4334fb33b97fa1e');
 assert.equal(execFileSync(read(main).plugins.entries.codex.config.appServer.command,['--version'],{encoding:'utf8'}).trim(),'codex-cli 0.153.4');
 fs.mkdirSync(backup,{mode:0o700});fs.cpSync(oldWorker,newWorker,{recursive:true,verbatimSymlinks:true});
 const p=newWorker+'/worker.mjs',text=fs.readFileSync(p,'utf8'),anchor='      const externalTaskContext = { acceptedSessionSpawns: [] };';
 assert.equal(text.split(anchor).length,2);assert(!text.includes('initializeWorkerNativeHooks'));
 fs.copyFileSync('/tmp/native-hook-runtime.mjs',newWorker+'/native-hook-runtime.mjs',fs.constants.COPYFILE_EXCL);
 fs.writeFileSync(p,'import { initializeWorkerNativeHooks } from "./native-hook-runtime.mjs";\n'+text.replace(anchor,'      await initializeWorkerNativeHooks({ pluginGeneration: preparedRuntimeLease.pluginGeneration, agentRuntimePath: configuredAgentRuntimePath() });\n'+anchor));
 fs.mkdirSync('/opt/v-browser/releases/0.4.6',{mode:0o755});
 execFileSync('tar',['-xzf','/tmp/v-browser-plugin-0.4.6-final.tar.gz','-C','/opt/v-browser/releases/0.4.6']);
 fs.cpSync(oldBrowser+'/node_modules',newBrowser+'/node_modules',{recursive:true,verbatimSymlinks:true});
 assert.equal(read(newBrowser+'/package.json').version,'0.4.6');
 // Copy no Lab configuration, workspace, authentication or Worker candidate bundle.
 execFileSync('chown',['-R','root:openclaw',newWorker,newBrowser]);
 execFileSync('chmod',['-R','g+rX',newWorker,newBrowser]);
 for(const [i,file] of files().entries())fs.copyFileSync(file,backup+'/'+i+'.prepare.json');
 fs.writeFileSync(backup+'/release.json',JSON.stringify({workerBefore:digest(text),workerAfter:digest(fs.readFileSync(p)),helper:digest(fs.readFileSync(newWorker+'/native-hook-runtime.mjs')),browserEntry:digest(fs.readFileSync(newBrowser+'/index.js')),oldWorker,newWorker,oldBrowser,newBrowser},null,2),{mode:0o600});
 console.log(JSON.stringify({prepared:true,liveConfigChanged:false,backup}));process.exit(0);
}
assert(fs.existsSync(backup+'/release.json'));
if(!await idle()){console.log(JSON.stringify({changed:false,reason:'active work; waiting'}));process.exit(2);}
const pending=[];
for(const [i,file] of files().entries()) {
 const raw=fs.readFileSync(file,'utf8'),c=JSON.parse(raw),before=projection(c);
 if(mode==='apply') {
  assert(c.plugins.load.paths.includes(oldWorker)&&c.plugins.load.paths.includes(oldBrowser));
  c.plugins.load.paths=c.plugins.load.paths.map(p=>p===oldWorker?newWorker:p===oldBrowser?newBrowser:p);alias(c);
 } else {
  const saved=read(backup+'/'+i+'.delta.json');const now=projection(c);
  for(const id of ['makaron','v-codex']) {
   assert.deepEqual(now.entries[id],saved.after.entries[id],'Alias changed after deployment; refuse blind rollback');
   if(saved.before.entries[id]===null)delete c.agents.entries[id].models['openai/gpt-6-astra'];
   else c.agents.entries[id].models['openai/gpt-6-astra']=saved.before.entries[id];
  }
  assert(c.plugins.load.paths.includes(newWorker)&&c.plugins.load.paths.includes(newBrowser));
  c.plugins.load.paths=c.plugins.load.paths.map(p=>p===newWorker?oldWorker:p===newBrowser?oldBrowser:p);
 }
 const candidate=backup+'/'+i+'.'+mode+'.candidate.json';fs.writeFileSync(candidate,JSON.stringify(c,null,2)+'\n',{mode:0o600});
 execFileSync(process.execPath,[core+'/dist/index.js','config','validate','--json'],{env:{...process.env,OPENCLAW_CONFIG_PATH:candidate},stdio:['ignore','pipe','pipe'],timeout:30000});
 pending.push({file,raw,c,before,after:projection(c),i});
}
if(!await idle()){console.log(JSON.stringify({changed:false,reason:'work arrived during validation'}));process.exit(2);}
for(const item of pending)assert.equal(fs.readFileSync(item.file,'utf8'),item.raw,'Concurrent config change; retry from latest');
for(const {file,raw,c,before,after,i} of pending) {
 if(mode==='apply') {
  fs.writeFileSync(backup+'/'+i+'.before.json',raw,{mode:0o600,flag:'wx'});
  fs.writeFileSync(backup+'/'+i+'.delta.json',JSON.stringify({before,after},null,2),{mode:0o600,flag:'wx'});
 }
 fs.writeFileSync(file,JSON.stringify(c,null,2)+'\n');
}
console.log(JSON.stringify({at:new Date().toISOString(),mode,configUpdated:true,backup}));
execFileSync('systemctl',['restart',unit],{timeout:60000});
console.log(JSON.stringify({at:new Date().toISOString(),mode,restartIssued:true,backup}));
