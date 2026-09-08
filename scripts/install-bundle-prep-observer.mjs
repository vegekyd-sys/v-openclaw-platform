// Exact-path, stopped-instance installer with byte-for-byte rollback.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {observeBundle,observeMcp,observeMaterialize} from './bundle-prep-observer-plan.mjs';
const [mode,target]=process.argv.slice(2);
assert(['check','apply','rollback','verify'].includes(mode));
const owner='codex-db91-contention-20260907';
const targets={
 private:{host:'VM-0-4-ubuntu',root:'/srv/vlab-production-mirror/labs/instances/db91-fix',core:'/srv/vlab-production-mirror/labs/instances/db91-fix/runtime/openclaw',control:'/srv/vlab-production-mirror/labs/control/db91-fix.json'},
 shared:{host:'VM-0-4-ubuntu',root:'/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902',core:'/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902/runtime/npm-global/lib/node_modules/openclaw',control:'/srv/vlab-production-mirror/labs/control/integration.json',unit:'openclaw-vlab-production-mirror-v8.service'},
 production:{host:'VM-8-2-ubuntu',root:'/home/openclaw/.openclaw',core:'/opt/openclaw-2026.9.1-v/openclaw',unit:'openclaw-gateway.service'}
};
const t=targets[target];assert(t);assert.equal(os.hostname(),t.host);assert.equal(process.getuid(),0);
if(t.control){const m=JSON.parse(fs.readFileSync(t.control));assert.equal(m.owner,owner);t.unit??=m.unit;}
assert.equal(fs.realpathSync(t.core),t.core);assert.equal(JSON.parse(fs.readFileSync(t.core+'/package.json')).version,'2026.9.1');
const hash=s=>createHash('sha256').update(s).digest('hex');
const source=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const gitArgs=['-C',source];
// A private checkout is owned by its dedicated UID; never change global Git trust.
const git=a=>execFileSync('git',['-c','safe.directory='+source,...gitArgs,...a],{encoding:'utf8'}).trim();
const commit=git(['rev-parse','HEAD']);assert.equal(git(['status','--porcelain']),'');
const dir=t.root+'/backups/bundle-prep-observer-20260908',manifestFile=dir+'/manifest.json';
const files=[['dist/builtin-openclaw-zQV8Wwjr.js',observeBundle],['dist/agents/agent-bundle-mcp-runtime.js',observeMcp],['dist/agent-bundle-mcp-materialize-DlD9AJQW.js',observeMaterialize],['dist/bundle-prep-observer.mjs',null]];
const helper=fs.readFileSync(new URL('./bundle-prep-observer.mjs',import.meta.url),'utf8');
const saved=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile)):null;
if(saved){assert.equal(saved.target,target);assert.equal(saved.owner,owner);}
const plans=files.map(([relative,fn],i)=>{
 const file=t.core+'/'+relative,exists=fs.existsSync(file),current=exists?fs.readFileSync(file,'utf8'):null;
 const old=saved?.files[i];if(old)assert.equal(old.file,file);
 const original=old?(old.before===null?null:fs.readFileSync(dir+'/'+i+'.before','utf8')):current;
 const after=fn?fn(original):helper;
 if(old){assert.equal(hash(after),old.after,'candidate helper/patch drift');assert.equal(original===null?null:hash(original),old.before);}
 assert(current===original||current===after,'unexpected live code drift '+relative);
 execFileSync(process.execPath,['--check','--input-type=module'],{input:mode==='rollback'?(original??''):after,stdio:['pipe','pipe','pipe']});
 const stat=exists?fs.statSync(file):fs.statSync(t.core+'/dist');
 return {file,original,after,current,uid:old?.uid??stat.uid,gid:old?.gid??stat.gid,mode:old?.mode??(fn?stat.mode&0o777:0o644)};
});
if(mode==='verify'){assert(plans.every(p=>p.current===p.after),'not installed');}
if(['apply','rollback'].includes(mode)){
 assert.equal(execFileSync('systemctl',['show',t.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0','refuse to patch a running Gateway');
 if(mode==='apply'&&!saved){
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  for(const [i,p]of plans.entries())if(p.original!==null)fs.writeFileSync(dir+'/'+i+'.before',p.original,{mode:0o600,flag:'wx'});
  fs.writeFileSync(manifestFile,JSON.stringify({at:new Date().toISOString(),owner,target,commit,files:plans.map(p=>({file:p.file,before:p.original===null?null:hash(p.original),after:hash(p.after),uid:p.uid,gid:p.gid,mode:p.mode}))},null,2),{mode:0o600,flag:'wx'});
 }
 assert(mode!=='rollback'||saved,'missing rollback manifest');
 // Add helper first; rollback restores consumers first. All targets are stopped.
 const ordered=mode==='apply'?[...plans].reverse():plans;
 for(const p of ordered){
  const bytes=mode==='apply'?p.after:p.original;
  // On rollback leave an unused helper as a recoverable artifact; no import remains.
  if(bytes===null)continue;
  const temp=p.file+'.bundle-observer-'+process.pid;
  fs.writeFileSync(temp,bytes,{mode:p.mode,flag:'wx'});fs.chownSync(temp,p.uid,p.gid);fs.chmodSync(temp,p.mode);fs.renameSync(temp,p.file);
 }
}
console.log(JSON.stringify({mode,target,commit,manifest:manifestFile,files:plans.map(p=>({file:p.file,before:p.original===null?null:hash(p.original),after:hash(p.after)}))}));
