import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync}from'node:child_process';import {createHash}from'node:crypto';
import {patchNativeSetupProbeOwner,marker}from'./patch-native-setup-probe-owner.mjs';
import {patchBrowserTargetDiagnostics}from'./patch-browser-target-diagnostics.mjs';
const lab=os.hostname()==='VM-0-4-ubuntu';assert(lab||os.hostname()==='VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const mode=process.argv[2];assert(['apply','rollback','status'].includes(mode));
const root=lab?'/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902':'/home/openclaw/.openclaw',main=root+(lab?'/state':'')+'/openclaw.json',unit=lab?'openclaw-vlab-production-mirror-v8.service':'openclaw-gateway.service';
const core=lab?root+'/runtime/npm-global/lib/node_modules/openclaw':'/opt/openclaw-2026.9.1-v/openclaw',backup=root+'/backups/native-probe-owner-3dc0d04';
const read=p=>JSON.parse(fs.readFileSync(p)),hash=b=>createHash('sha256').update(b).digest('hex');
if(lab)assert.equal(read('/srv/vlab-production-mirror/labs/control/integration.json').owner,'01a06fbe-7654-7331-8d6e-73a8cd2dcd7e');
const pid=execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);process.env.OPENCLAW_CONFIG_PATH=main;
const {callGatewayFromCli}=await import(core+'/dist/plugin-sdk/gateway-runtime.js');const call=(m,p={})=>callGatewayFromCli(m,{timeout:'20000',json:true},p);
async function idle(){const w=await call('vlab.workers.status'),h=await call('health');let active=0,offset=0;for(let i=0;i<10;i++){const s=await call('sessions.list',{limit:1000,offset});active+=s.sessions.filter(x=>x.hasActiveRun===true).length;if(!s.hasMore)break;assert(s.nextOffset>offset&&i<9);offset=s.nextOffset;}const ready=h.ok&&w.pending===0&&active===0&&w.workers.every(x=>x.activeCount===0&&!x.queued);console.log(JSON.stringify({lab,ready,active,pending:w.pending}));return ready;}
if(mode==='status'){await idle();process.exit(0);}assert(await idle(),'Active work: live unchanged');assert.equal(read(core+'/package.json').version,'2026.9.1');
const files=fs.readdirSync(core+'/dist').filter(n=>/^selection-.*\.js$/.test(n)).map(n=>core+'/dist/'+n).filter(p=>fs.readFileSync(p,'utf8').includes('function selectPreparedAgentHarness(params) {'));assert.equal(files.length,1);const file=files[0],raw=fs.readFileSync(file,'utf8');let next;
const browserFiles=fs.readdirSync(core+'/dist').filter(n=>/^pw-session-.*\.js$/.test(n)).map(n=>core+'/dist/'+n).filter(p=>fs.readFileSync(p,'utf8').includes('async function readPageTargetInfo(page) {'));assert.equal(browserFiles.length,1);const browserFile=browserFiles[0],browserRaw=fs.readFileSync(browserFile,'utf8');let browserNext;
function atomic(p,value){const s=fs.statSync(p),t=p+'.native-owner-'+process.pid;fs.writeFileSync(t,value,{mode:s.mode});fs.chownSync(t,s.uid,s.gid);fs.renameSync(t,p);}
if(mode==='apply'){
 assert(!fs.existsSync(backup));fs.mkdirSync(backup,{mode:0o700});fs.copyFileSync(import.meta.filename,backup+'/deploy.mjs');for(const name of ['patch-native-setup-probe-owner.mjs','patch-browser-target-diagnostics.mjs'])fs.copyFileSync(new URL('./'+name,import.meta.url),backup+'/'+name);
 const before=lab&&raw.includes(marker)?fs.readFileSync(file+'.before-native-setup-probe','utf8'):raw;assert(!before.includes(marker));next=patchNativeSetupProbeOwner(before);if(lab)assert.equal(raw,next);
 browserNext=patchBrowserTargetDiagnostics(browserRaw);assert.notEqual(browserRaw,browserNext);fs.writeFileSync(backup+'/browser.before.js',browserRaw,{mode:0o600});
 fs.writeFileSync(backup+'/selection.before.js',before,{mode:0o600});fs.writeFileSync(backup+'/release.json',JSON.stringify({file,before:hash(before),after:hash(next),browserFile,browserBefore:hash(browserRaw),browserAfter:hash(browserNext),commit:'3dc0d04'}),{mode:0o600});
}else{const r=read(backup+'/release.json');assert.equal(hash(raw),r.after,'Concurrent core modification');next=fs.readFileSync(backup+'/selection.before.js','utf8');assert.equal(hash(next),r.before);assert.equal(hash(browserRaw),r.browserAfter,'Concurrent browser modification');browserNext=fs.readFileSync(backup+'/browser.before.js','utf8');assert.equal(hash(browserNext),r.browserBefore);}
const pending=[];
if(lab&&mode==='apply')for(const [i,p]of [main,read(main).plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath].entries()){
 const original=fs.readFileSync(p,'utf8'),c=JSON.parse(original),old=root+'/runtime/plugins/worker-native-probe-511bb43',stable=root+'/runtime/plugins/worker-image-provenance-5f9e136';assert(c.plugins.load.paths.includes(old));c.plugins.load.paths=c.plugins.load.paths.map(x=>x===old?stable:x);fs.writeFileSync(backup+`/${i}.before.json`,original,{mode:0o600});pending.push({p,original,next:JSON.stringify(c,null,2)+'\n'});
}
assert(await idle(),'Active work: live unchanged');assert.equal(fs.readFileSync(file,'utf8'),raw,'Concurrent core change');assert.equal(fs.readFileSync(browserFile,'utf8'),browserRaw,'Concurrent browser change');for(const x of pending)assert.equal(fs.readFileSync(x.p,'utf8'),x.original);
atomic(file,next);atomic(browserFile,browserNext);for(const x of pending)atomic(x.p,x.next);
console.log(JSON.stringify({at:new Date().toISOString(),lab,mode,backup,coreUpdated:true,productionConfigChanged:false}));execFileSync('systemctl',['restart',unit],{timeout:60000});
