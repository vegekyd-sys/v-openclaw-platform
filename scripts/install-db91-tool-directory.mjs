import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {toolDirectoryConfig} from './db91-tool-directory-plan.mjs';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const shared=process.argv.includes('--shared'),restore=process.argv.includes('--restore'),dry=process.argv.includes('--dry-run');
const root=shared?'/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902':'/srv/vlab-production-mirror/labs/instances/db91-fix';
const m=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/'+(shared?'integration':'db91-fix')+'.json'));assert.equal(m.owner,'codex-db91-contention-20260907');
assert.equal(execFileSync('systemctl',['show',shared?'openclaw-vlab-production-mirror-v8.service':m.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const commit=process.argv.find(a=>/^[a-f0-9]{40}$/.test(a));assert(commit);
const source=shared?'/srv/vlab-production-mirror/labs/control/db91-hi-integration-20260908':root+'/source';
const git=args=>execFileSync(shared?'git':'runuser',shared?['-C',source,...args]:['-u',m.user,'--','git','-C',source,...args],{encoding:'utf8'}).trim();assert.equal(git(['rev-parse','HEAD']),commit);assert.equal(git(['status','--porcelain']),'');
const backup=root+'/state/db91-tool-directory-20260908';const hash=b=>createHash('sha256').update(b).digest('hex');
const configPaths=[root+'/state/openclaw.json',root+(shared?'/experiments/agent-worker-isolation-v1/worker-openclaw.json':'/state/worker-openclaw.json')];
const plans=configPaths.map((file,i)=>{assert(fs.existsSync(file),'required Gateway and Worker configs must both exist');const copy=backup+'/'+i+'.original',current=fs.readFileSync(file,'utf8'),original=fs.existsSync(copy)?fs.readFileSync(copy,'utf8'):current,patched=toolDirectoryConfig(original),stat=fs.statSync(file);assert(current===original||current===patched,'config drift');return {file,copy,original,patched,uid:stat.uid,gid:stat.gid,mode:stat.mode&0o777};});assert.equal(plans.length,2);
if(shared&&!restore){const proof=process.argv.find(a=>/^hi-\d+\.json$/.test(a));assert(proof,'private real-Agent directory proof required');const r=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/instances/db91-fix/workspace/'+proof));assert(r.completed&&r.jobs.every(j=>j.lastUserIdempotencyVerified));}
if(!dry){fs.mkdirSync(backup,{recursive:true,mode:0o700});for(const p of plans){if(!fs.existsSync(p.copy))fs.writeFileSync(p.copy,p.original,{flag:'wx',mode:0o600});fs.writeFileSync(p.file,restore?p.original:p.patched);fs.chownSync(p.file,p.uid,p.gid);fs.chmodSync(p.file,p.mode);}fs.writeFileSync(backup+'/manifest.json',JSON.stringify({commit,restore,at:new Date().toISOString(),files:plans.map(p=>({file:p.file,before:hash(p.original),after:hash(p.patched)}))},null,2),{mode:0o600});}
console.log(JSON.stringify({commit,shared,dry,restore,changedField:'tools.toolSearch',files:plans.length}));
