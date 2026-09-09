// Fixed lab/owner only. Start/stop are exclusively through labctl, never here.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/labs/instances/db91-parity',owner='codex-db91-production-equivalent-20260908';
for(const f of ['db91-parity','integration'])assert.equal(JSON.parse(fs.readFileSync(root+'/../../control/'+f+'.json')).owner,owner);
assert.equal(execFileSync('systemctl',['show','openclaw-lab-db91-parity.service','-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const git=args=>execFileSync('runuser',['-u','lab-db91-parity','--','git','-C',root+'/source',...args],{encoding:'utf8'}).trim();
const commit=process.argv.find(a=>/^[a-f0-9]{40}$/.test(a));assert(commit);assert.equal(git(['rev-parse','HEAD']),commit);assert.equal(git(['status','--porcelain']),'');
const restore=process.argv.includes('--restore'),dry=process.argv.includes('--dry-run');
const folder=root+'/runtime/openclaw/node_modules/@openclaw/ai/dist',file=folder+'/transports.mjs';
const dir=root+'/state/late-runtime-context-20260909',backup=dir+'/transports.original',original=fs.readFileSync(fs.existsSync(backup)?backup:file,'utf8');
const anchor='\tapplyCompletionsReplay(messages, context, model, compat);';assert.equal(original.split(anchor).length,2);
const patched='import {placeDeepSeekRuntimeContext} from "./deepseek-late-runtime-context.mjs";\n'+original.replace(anchor,anchor+'\n\tmessages = placeDeepSeekRuntimeContext(messages, context, model);');
const current=fs.readFileSync(file,'utf8');assert(current===original||current===patched,'runtime drift');
execFileSync(process.execPath,['--check','--input-type=module'],{input:patched});
const envFile=root+'/secrets.env',envOriginal=fs.readFileSync(fs.existsSync(dir+'/env.original')?dir+'/env.original':envFile,'utf8');
assert(!envOriginal.includes('OPENCLAW_DEEPSEEK_LATE_RUNTIME_CONTEXT'));
const envPatched=envOriginal+'\nOPENCLAW_DEEPSEEK_LATE_RUNTIME_CONTEXT=1\n';
assert([envOriginal,envPatched].includes(fs.readFileSync(envFile,'utf8')),'env drift');
const hash=s=>createHash('sha256').update(s).digest('hex');
if(!dry){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 if(!fs.existsSync(backup)){fs.writeFileSync(backup,original,{flag:'wx',mode:0o600});fs.writeFileSync(dir+'/env.original',envOriginal,{flag:'wx',mode:0o600});}
 const helper=folder+'/deepseek-late-runtime-context.mjs',data=fs.readFileSync(new URL('./deepseek-late-runtime-context.mjs',import.meta.url));
 if(fs.existsSync(helper))assert.equal(hash(fs.readFileSync(helper)),hash(data));else fs.writeFileSync(helper,data,{flag:'wx',mode:0o644});
 for(const [p,data] of [[file,restore?original:patched],[envFile,restore?envOriginal:envPatched]]){const st=fs.statSync(p);fs.writeFileSync(p,data);fs.chmodSync(p,st.mode&0o777);fs.chownSync(p,st.uid,st.gid);}
 fs.writeFileSync(dir+'/manifest.json',JSON.stringify({at:new Date().toISOString(),commit,restore,original:hash(original),patched:hash(patched),corePromptUnmodified:true,historyUnmodified:true,thinkingUnmodified:true},null,2),{mode:0o600});
}
console.log(JSON.stringify({dry,restore,commit,original:hash(original),patched:hash(patched)}));
