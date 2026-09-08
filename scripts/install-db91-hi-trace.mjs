// Private db91-fix only. Does not accept a shared or production target.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {instrumentHiWorker,instrumentHiIndex,instrumentHiPool,instrumentHiTransport,instrumentHiGateway} from './db91-hi-trace-plan.mjs';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/labs/instances/db91-fix';
const m=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/db91-fix.json'));
assert.equal(m.owner,'codex-db91-contention-20260907');assert.equal(m.root,root);
assert.equal(execFileSync('systemctl',['show',m.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const source=root+'/source';
const git=args=>execFileSync('runuser',['-u',m.user,'--','git','-C',source,...args],{encoding:'utf8'}).trim();
assert.equal(git(['status','--porcelain']),'');
const restore=process.argv.includes('--restore'),dry=process.argv.includes('--dry-run');
const hash=s=>createHash('sha256').update(s).digest('hex');
const items=[
  ['runtime/worker/worker.mjs',instrumentHiWorker],['runtime/worker/index.mjs',instrumentHiIndex],
  ['runtime/worker/worker-pool.mjs',instrumentHiPool],
  ['runtime/openclaw/dist/chat-send-handler-DBjXcn_1.js',instrumentHiGateway],
  ['runtime/openclaw/node_modules/@openclaw/ai/dist/openai-completions-D0QZ0AyB.mjs',instrumentHiTransport],
];
const plans=items.map(([relative,fn],i)=>{
  const file=root+'/'+relative,backup=root+'/state/db91-hi-trace-'+i+'.original';
  const original=fs.readFileSync(fs.existsSync(backup)?backup:file,'utf8'),patched=fn(original),current=fs.readFileSync(file,'utf8');
  assert(current===original||current===patched,'unexpected runtime drift '+relative);
  execFileSync(process.execPath,['--check','--input-type=module'],{input:restore?original:patched,stdio:['pipe','pipe','pipe']});
  return {relative,file,backup,original,patched};
});
if(!dry){
  const helper=root+'/runtime/worker/db91-hi-trace.mjs';
  const helperSource=fs.readFileSync(new URL('./db91-hi-trace.mjs',import.meta.url));
  if(fs.existsSync(helper))assert.equal(hash(fs.readFileSync(helper)),hash(helperSource),'unexpected helper drift');
  else fs.writeFileSync(helper,helperSource,{mode:0o644,flag:'wx'});
  for(const p of plans){
    if(!fs.existsSync(p.backup))fs.writeFileSync(p.backup,p.original,{mode:0o600,flag:'wx'});
    fs.writeFileSync(p.file,restore?p.original:p.patched);
    execFileSync(process.execPath,['--check',p.file]);
  }
  fs.writeFileSync(root+'/state/db91-hi-trace-manifest.json',JSON.stringify({at:new Date().toISOString(),commit:git(['rev-parse','HEAD']),restored:restore,files:plans.map(p=>({file:p.file,before:hash(p.original),after:hash(p.patched)}))},null,2),{mode:0o600});
}
console.log(JSON.stringify({dry,restore,files:plans.map(p=>({file:p.relative,before:hash(p.original),after:hash(p.patched)}))}));
