import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/labs/instances/db91-parity',owner='codex-db91-production-equivalent-20260908';
for(const f of ['db91-parity','integration'])assert.equal(JSON.parse(fs.readFileSync(root+'/../../control/'+f+'.json')).owner,owner);
assert.equal(execFileSync('systemctl',['show','openclaw-lab-db91-parity.service','-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const git=args=>execFileSync('runuser',['-u','lab-db91-parity','--','git','-C',root+'/source',...args],{encoding:'utf8'}).trim();
const commit=process.argv.find(a=>/^[a-f0-9]{40}$/.test(a));assert(commit);assert.equal(git(['rev-parse','HEAD']),commit);assert.equal(git(['status','--porcelain']),'');
const restore=process.argv.includes('--restore'),dry=process.argv.includes('--dry-run'),dir=root+'/state/runtime-prewarm-20260909';
const file=root+'/runtime/production-worker/worker.mjs',backup=dir+'/worker.original',original=fs.readFileSync(fs.existsSync(backup)?backup:file,'utf8');
const anchor='if (process.env.VLAB_REQUIRE_OPENCLAW_AGENT_RUNTIME === "1") {\n  await loadAgentRuntime();\n}';assert.equal(original.split(anchor).length,2);
const addition=`\nif (process.env.OPENCLAW_WORKER_EAGER_PREPARE === "1") {
 const prewarmAbort = new AbortController();
 const prewarmTimer = setTimeout(() => prewarmAbort.abort(), 15000); prewarmTimer.unref();
 try {
  const prewarm = await prewarmWorkerRuntime({enabled:true,agentId:"makaron",loadAgentRuntime,loadCompactionRuntime,
   signal:prewarmAbort.signal,preloadBuiltin:()=>import(new URL("../builtin-openclaw-zQV8Wwjr.js",pathToFileURL(configuredAgentRuntimePath())).href)});
  console.error("[worker-runtime-prewarm.1] "+JSON.stringify({pid:process.pid,...prewarm}));
 } finally { clearTimeout(prewarmTimer); }
}\n`;
const patched='import {prewarmWorkerRuntime} from "./runtime-prewarm.mjs";\n'+original.replace(anchor,anchor+addition);
assert([original,patched].includes(fs.readFileSync(file,'utf8')),'Worker drift');
assert(fs.existsSync(root+'/runtime/openclaw/dist/builtin-openclaw-zQV8Wwjr.js'));
execFileSync(process.execPath,['--check','--input-type=module'],{input:patched});
const envFile=root+'/secrets.env',envOriginal=fs.readFileSync(fs.existsSync(dir+'/env.original')?dir+'/env.original':envFile,'utf8');
assert(!envOriginal.includes('OPENCLAW_WORKER_EAGER_PREPARE'));assert(!envOriginal.includes('OPENCLAW_DEEPSEEK_LATE_RUNTIME_CONTEXT=1'),'failed layout candidate must be restored first');
const envPatched=envOriginal+'\nOPENCLAW_WORKER_EAGER_PREPARE=1\n';assert([envOriginal,envPatched].includes(fs.readFileSync(envFile,'utf8')),'env drift');
const hash=s=>createHash('sha256').update(s).digest('hex');
if(!dry){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});if(!fs.existsSync(backup)){fs.writeFileSync(backup,original,{mode:0o600,flag:'wx'});fs.writeFileSync(dir+'/env.original',envOriginal,{mode:0o600,flag:'wx'});}
 const helper=root+'/runtime/production-worker/runtime-prewarm.mjs',data=fs.readFileSync(new URL('../experiments/agent-worker-isolation-v1/runtime-prewarm.mjs',import.meta.url));
 if(fs.existsSync(helper))assert.equal(hash(fs.readFileSync(helper)),hash(data));else fs.writeFileSync(helper,data,{mode:0o644,flag:'wx'});
 for(const [p,data]of [[file,restore?original:patched],[envFile,restore?envOriginal:envPatched]]){const st=fs.statSync(p);fs.writeFileSync(p,data);fs.chmodSync(p,st.mode&0o777);fs.chownSync(p,st.uid,st.gid);}
 fs.writeFileSync(dir+'/manifest.json',JSON.stringify({commit,restore,at:new Date().toISOString(),original:hash(original),patched:hash(patched),noPromptOrModelRequest:true},null,2),{mode:0o600});
}
console.log(JSON.stringify({dry,restore,commit,original:hash(original),patched:hash(patched)}));
