// Fixed owned full-data lab. Timing-only changes; no configuration/prompt changes.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {instrumentHiIndex,instrumentHiPool,instrumentHiGateway,instrumentHiNativeTransport} from './db91-hi-trace-plan.mjs';
import {deepWorker,deepPrepared,deepTransport} from './db91-hi-deep-plan.mjs';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/labs/instances/db91-parity',owner='codex-db91-production-equivalent-20260908';
const m=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/db91-parity.json'));
assert.equal(m.owner,owner);assert.equal(m.root,root);
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,owner);
assert.equal(execFileSync('systemctl',['show',m.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const git=args=>execFileSync('runuser',['-u',m.user,'--','git','-C',root+'/source',...args],{encoding:'utf8'}).trim();
const commit=process.argv.find(a=>/^[a-f0-9]{40}$/.test(a));assert(commit);assert.equal(git(['rev-parse','HEAD']),commit);assert.equal(git(['status','--porcelain']),'');
const dry=process.argv.includes('--dry-run'),restore=process.argv.includes('--restore');
const dir=root+'/state/firsttext-observer-20260909';
function observeWorker(s){
 const once=(a,b)=>{assert.equal(s.split(a).length,2,'unique accepted Worker anchor: '+a);s=s.replace(a,b);};
 s='import {db91HiTrace} from "./db91-hi-trace.mjs";\n'+s;
 once('async function runAgent(message, abortSignal) {','async function runAgent(message, abortSignal) {\n return db91HiTrace.run(message, () => runDb91HiAgentBody(message, abortSignal));\n}\nasync function runDb91HiAgentBody(message, abortSignal) {');
 for(const [a,stage] of [
  ['  const startedAt = performance.now();','worker-agent-runtime-loaded'],
  ['    const config = configRuntime.loadConfig();','worker-compaction-runtime-loaded'],
  ['      const externalTaskContext = { acceptedSessionSpawns: [] };','worker-prepared-runtime-ready'],
  ['        result = await commandRuntime.agentCommandFromGatewayIngress({','worker-before-agent-command'],
 ])once(a,' db91HiTrace.mark(message.runId,"'+stage+'");\n'+a);
 return deepWorker(s);
}
const items=[
 ['runtime/worker/worker.mjs',observeWorker],
 ['runtime/worker/index.mjs',instrumentHiIndex],['runtime/worker/worker-pool.mjs',instrumentHiPool],
 ['runtime/openclaw/dist/chat-send-handler-DBjXcn_1.js',instrumentHiGateway],
 ['runtime/openclaw/node_modules/@openclaw/ai/dist/transports.mjs',s=>deepTransport(instrumentHiNativeTransport(s))],
 ['runtime/openclaw/dist/prepared-model-runtime-C1N_aVhw.js',deepPrepared],
];
const hash=s=>createHash('sha256').update(s).digest('hex');
const plans=items.map(([p,fn],i)=>{
 const file=root+'/'+p,backup=dir+'/'+i+'.original',current=fs.readFileSync(file,'utf8');
 const original=fs.existsSync(backup)?fs.readFileSync(backup,'utf8'):current,patched=fn(original);
 assert(current===original||current===patched,'runtime drift '+p);
 execFileSync(process.execPath,['--check','--input-type=module'],{input:patched});
 return {file,backup,original,patched,stat:fs.statSync(file)};
});
if(!dry){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 for(const name of ['db91-hi-trace.mjs','db91-hi-deep.mjs']){
  const file=root+'/runtime/worker/'+name,data=fs.readFileSync(new URL('./'+name,import.meta.url));
  if(fs.existsSync(file))assert.equal(hash(fs.readFileSync(file)),hash(data));
  else fs.writeFileSync(file,data,{flag:'wx',mode:0o644});
 }
 for(const p of plans){if(!fs.existsSync(p.backup))fs.writeFileSync(p.backup,p.original,{flag:'wx',mode:0o600});fs.writeFileSync(p.file,restore?p.original:p.patched);fs.chownSync(p.file,p.stat.uid,p.stat.gid);fs.chmodSync(p.file,p.stat.mode&0o777);}
 fs.writeFileSync(dir+'/manifest.json',JSON.stringify({commit,restore,at:new Date().toISOString(),files:plans.map(p=>({file:p.file,before:hash(p.original),after:hash(p.patched)}))},null,2),{mode:0o600});
}
console.log(JSON.stringify({dry,restore,commit,files:plans.length}));
