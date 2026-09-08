import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {deepWorker,deepPrepared,deepBundle,deepTransport,deepPluginLoader,deepMcp} from './db91-hi-deep-plan.mjs';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const shared=process.argv.includes('--shared');
const root=shared?'/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902':'/srv/vlab-production-mirror/labs/instances/db91-fix';
const m=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/'+(shared?'integration':'db91-fix')+'.json'));assert.equal(m.owner,'codex-db91-contention-20260907');if(!shared)assert.equal(m.root,root);
const unit=shared?'openclaw-vlab-production-mirror-v8.service':m.unit;
assert.equal(execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const commit=process.argv.find(a=>/^[a-f0-9]{40}$/.test(a));assert(commit);
const source=shared?'/srv/vlab-production-mirror/labs/control/db91-hi-integration-20260908':root+'/source';
const git=args=>execFileSync(shared?'git':'runuser',shared?['-C',source,...args]:['-u',m.user,'--','git','-C',source,...args],{encoding:'utf8'}).trim();assert.equal(git(['rev-parse','HEAD']),commit);assert.equal(git(['status','--porcelain']),'');
const hash=b=>createHash('sha256').update(b).digest('hex'),restore=process.argv.includes('--restore'),dry=process.argv.includes('--dry-run');
const worker=shared?'runtime/plugins/worker-v-platform-0.1.0-integration.1':'runtime/worker',core=shared?'runtime/npm-global/lib/node_modules/openclaw':'runtime/openclaw';
const paths=[[worker+'/worker.mjs',deepWorker],[core+'/dist/prepared-model-runtime-C1N_aVhw.js',deepPrepared],[core+'/dist/builtin-openclaw-zQV8Wwjr.js',deepBundle],[core+'/node_modules/@openclaw/ai/dist/transports.mjs',deepTransport],[core+'/dist/loader-UHuBXZwI.js',deepPluginLoader],[core+'/dist/agents/agent-bundle-mcp-runtime.js',deepMcp]];
const backup=root+'/state/db91-hi-deep-20260908';
const plans=paths.map(([path,fn],i)=>{const file=root+'/'+path,copy=backup+'/'+i+'.original',current=fs.readFileSync(file,'utf8'),original=fs.existsSync(copy)?fs.readFileSync(copy,'utf8'):current,patched=fn(original);assert(current===original||current===patched,'runtime drift '+path);execFileSync(process.execPath,['--check','--input-type=module'],{input:restore?original:patched});const stat=fs.statSync(file);return {file,copy,original,patched,uid:stat.uid,gid:stat.gid,mode:stat.mode&0o777};});
if(shared){const proof=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/instances/db91-fix/workspace/hi-1788836459434.json'));assert(proof.completed&&proof.jobs.every(j=>j.lastUserIdempotencyVerified&&Number.isFinite(j.firstTextMs)));}
if(!dry){fs.mkdirSync(backup,{recursive:true,mode:0o700});fs.copyFileSync(new URL('./db91-hi-deep.mjs',import.meta.url),root+'/'+worker+'/db91-hi-deep.mjs');fs.chmodSync(root+'/'+worker+'/db91-hi-deep.mjs',0o644);
for(const p of plans){if(!fs.existsSync(p.copy))fs.writeFileSync(p.copy,p.original,{flag:'wx',mode:0o600});fs.writeFileSync(p.file,restore?p.original:p.patched);fs.chownSync(p.file,p.uid,p.gid);fs.chmodSync(p.file,p.mode);}
fs.writeFileSync(backup+'/manifest.json',JSON.stringify({commit,restore,at:new Date().toISOString(),files:plans.map(p=>({file:p.file,before:hash(p.original),after:hash(p.patched)}))},null,2),{mode:0o600});}
console.log(JSON.stringify({commit,dry,restore,files:plans.length}));
