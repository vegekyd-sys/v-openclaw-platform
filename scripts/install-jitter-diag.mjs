// Private instance only. Explicit version, clean candidate, stopped writes, atomic files.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {instrumentPrompt,instrumentWorker,version} from './jitter-diag-plan.mjs';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const mode=process.argv[2];assert(['check','apply','verify','rollback'].includes(mode));
const root='/srv/vlab-production-mirror/labs/instances/db91-fix';
const owner='codex-db91-contention-20260907';
const m=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/db91-fix.json'));
assert.equal(m.owner,owner);assert.equal(m.root,root);
const source=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');assert.equal(source,root+'/source');
const git=a=>execFileSync('git',['-c','safe.directory='+source,'-C',source,...a],{encoding:'utf8'}).trim();
const commit=git(['rev-parse','HEAD']);assert.equal(git(['status','--porcelain']),'');
const hash=b=>createHash('sha256').update(b).digest('hex');
const dir=root+'/backups/'+version;const mf=dir+'/manifest.json';
const saved=fs.existsSync(mf)?JSON.parse(fs.readFileSync(mf)):null;
if(saved){assert.equal(saved.owner,owner);assert.equal(saved.version,version);}
const plans=[['runtime/openclaw/dist/builtin-openclaw-zQV8Wwjr.js',instrumentPrompt],['runtime/worker/worker.mjs',instrumentWorker]].map(([rel,fn],i)=>{
 const file=root+'/'+rel;assert.equal(fs.realpathSync(file),file);
 const current=fs.readFileSync(file,'utf8');const before=saved?fs.readFileSync(dir+'/'+i+'.before','utf8'):current;
 const after=fn(before),stat=fs.statSync(file);
 if(saved){assert.equal(saved.files[i].file,file);assert.equal(saved.files[i].before,hash(before));assert.equal(saved.files[i].after,hash(after));}
 assert(current===before||current===after,'runtime drift: '+rel);
 execFileSync(process.execPath,['--check','--input-type=module'],{input:after,stdio:['pipe','pipe','pipe']});
 return {file,current,before,after,uid:stat.uid,gid:stat.gid,mode:stat.mode&0o777};
});
const manifest={version,commit,owner,at:new Date().toISOString(),files:plans.map(p=>({file:p.file,before:hash(p.before),after:hash(p.after)}))};
if(mode==='verify')assert(plans.every(p=>p.current===p.after));
if(['apply','rollback'].includes(mode)){
 assert.equal(execFileSync('systemctl',['show',m.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
 assert(mode!=='rollback'||saved,'missing backup');
 if(!saved){fs.mkdirSync(dir,{recursive:true,mode:0o700});plans.forEach((p,i)=>fs.writeFileSync(dir+'/'+i+'.before',p.before,{flag:'wx',mode:0o600}));fs.writeFileSync(mf,JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});}
 for(const p of plans){const temp=p.file+'.jitter-'+process.pid;fs.writeFileSync(temp,mode==='apply'?p.after:p.before,{flag:'wx',mode:p.mode});fs.chownSync(temp,p.uid,p.gid);fs.chmodSync(temp,p.mode);fs.renameSync(temp,p.file);}
}
console.log(JSON.stringify({mode,...manifest}));
