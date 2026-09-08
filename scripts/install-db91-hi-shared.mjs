// Temporary observers for the exclusively leased integration instance only.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {instrumentHiWorker,instrumentHiIndex,instrumentHiPool,instrumentHiGateway,instrumentHiNativeTransport,instrumentHiTransport} from './db91-hi-trace-plan.mjs';
import {instrumentPrompt} from './db91-prompt-trace-plan.mjs';import {instrumentSessionTiming} from './db91-session-timing-plan.mjs';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const owner='codex-db91-contention-20260907';
const lease=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json'));assert.equal(lease.owner,owner);
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const unit='openclaw-vlab-production-mirror-v8.service';
const commit=process.argv.find(a=>/^[a-f0-9]{40}$/.test(a));assert(commit,'exact candidate commit required');
const source=fileURLToPath(new URL('../',import.meta.url));
assert.equal(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),commit);
assert.equal(execFileSync('git',['-C',source,'status','--porcelain'],{encoding:'utf8'}).trim(),'');
const dry=process.argv.includes('--dry-run'),restore=process.argv.includes('--restore'),verify=process.argv.includes('--verify');
if(!verify)assert.equal(execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0','stop idle integration instance before observer writes');
const proof=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/instances/db91-fix/workspace/hi-1788833646554.json'));
assert(proof.completed&&proof.jobs.length===3&&proof.jobs.every(j=>j.lastUserIdempotencyVerified&&Number.isFinite(j.firstTextMs)),'private real-Agent proof required');
const worker=root+'/runtime/plugins/worker-v-platform-0.1.0-integration.1';
const core=root+'/runtime/npm-global/lib/node_modules/openclaw';
const backup=root+'/state/db91-hi-observers-20260908',manifestFile=backup+'/manifest.json';
const hash=s=>createHash('sha256').update(s).digest('hex');
const helperImport=path.relative(core+'/dist',worker+'/db91-hi-trace.mjs');assert(helperImport.startsWith('../'));
const items=[
  [worker+'/worker.mjs',instrumentHiWorker],[worker+'/index.mjs',instrumentHiIndex],[worker+'/worker-pool.mjs',instrumentHiPool],
  [core+'/dist/chat-send-handler-DBjXcn_1.js',s=>instrumentHiGateway(s,helperImport)],
  [core+'/node_modules/@openclaw/ai/dist/openai-completions-D0QZ0AyB.mjs',instrumentHiTransport],
  [core+'/dist/builtin-openclaw-zQV8Wwjr.js',s=>instrumentPrompt(instrumentSessionTiming(s))],
  [core+'/node_modules/@openclaw/ai/dist/transports.mjs',instrumentHiNativeTransport],
];
const saved=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile)):null;
const protectedFiles=saved?.protectedFiles??Object.fromEntries(['openclaw.json','worker-openclaw.json'].map(n=>root+'/state/'+n).filter(f=>fs.existsSync(f)).map(f=>[f,hash(fs.readFileSync(f))]));
for(const [f,sha]of Object.entries(protectedFiles))assert.equal(hash(fs.readFileSync(f)),sha,'configuration drift');
const plans=items.map(([file,fn],i)=>{
  const copy=backup+'/'+i+'.original',original=fs.readFileSync(fs.existsSync(copy)?copy:file,'utf8'),patched=fn(original),current=fs.readFileSync(file,'utf8');
  assert(current===original||current===patched,'unexpected concurrent runtime edit '+file);
  if(verify)assert.equal(current,patched,'observer not active');
  execFileSync(process.execPath,['--check','--input-type=module'],{input:restore?original:patched,stdio:['pipe','pipe','pipe']});
  const stat=fs.statSync(file);return {file,copy,original,patched,mode:stat.mode&0o777,uid:stat.uid,gid:stat.gid};
});
if(!dry&&!verify){
  fs.mkdirSync(backup,{recursive:true,mode:0o700});
  for(const p of plans)if(!fs.existsSync(p.copy))fs.writeFileSync(p.copy,p.original,{mode:0o600,flag:'wx'});
  const helper=worker+'/db91-hi-trace.mjs',bytes=fs.readFileSync(new URL('./db91-hi-trace.mjs',import.meta.url));
  if(fs.existsSync(helper))assert.equal(hash(fs.readFileSync(helper)),hash(bytes),'helper drift');else fs.writeFileSync(helper,bytes,{mode:0o644,flag:'wx'});
  const manifest={commit,owner,at:new Date().toISOString(),restored:restore,protectedFiles,privateProof:'hi-1788833646554.json',
    files:plans.map(p=>({file:p.file,copy:p.copy,before:hash(p.original),after:hash(p.patched),mode:p.mode,uid:p.uid,gid:p.gid}))};
  fs.writeFileSync(manifestFile,JSON.stringify({...manifest,stage:'prepared'},null,2),{mode:0o600});
  for(const p of plans){fs.writeFileSync(p.file,restore?p.original:p.patched);fs.chmodSync(p.file,p.mode);fs.chownSync(p.file,p.uid,p.gid);}
  fs.writeFileSync(manifestFile,JSON.stringify({...manifest,stage:restore?'restored':'active'},null,2),{mode:0o600});
}
console.log(JSON.stringify({dry,restore,verify,commit,files:plans.length,configUnchanged:true,manifest:manifestFile}));
