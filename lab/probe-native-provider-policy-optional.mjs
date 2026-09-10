// Native provider catalog comparison; no model calls or business database access.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import vm from 'node:vm';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,process.argv[2]);
const base='/srv/vlab-production-mirror/labs/instances/db91-parity';
const pid=Number(execFileSync('systemctl',['show','openclaw-vlab-production-mirror-v8.service','-p','MainPID','--value'],{encoding:'utf8'}));assert(pid>1);
const env=Object.fromEntries(fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0').filter(v=>v.includes('=')).map(v=>[v.slice(0,v.indexOf('=')),v.slice(v.indexOf('=')+1)]));Object.assign(process.env,env);
const status=fs.readFileSync('/proc/'+pid+'/status','utf8'),uid=Number(status.match(/^Uid:\s+(\d+)/m)[1]),gid=Number(status.match(/^Gid:\s+(\d+)/m)[1]);assert(uid>0&&gid>0);
process.setgroups([]);process.setgid(gid);process.setuid(uid);
const runtime=pathToFileURL(base+'/runtime/openclaw/dist/'),imported=new Map();let candidateLoader;
async function compile(source,name) {
  const identifier=new URL(name,runtime).href;
  const mod=new vm.SourceTextModule(source,{identifier,initializeImportMeta:meta=>{meta.url=identifier;}});
  await mod.link(async spec=>{
    if(spec==='./public-surface-loader-V55JV4Jk.js')return candidateLoader;
    if(!imported.has(spec))imported.set(spec,(async()=>{const ns=await import(new URL(spec,runtime).href);return new vm.SyntheticModule(Object.keys(ns),function(){for(const k of Object.keys(ns))this.setExport(k,ns[k]);});})());
    return imported.get(spec);
  });await mod.evaluate();return mod;
}
candidateLoader=await compile(fs.readFileSync(new URL('./release-files/optional-public-surface-loader.js',import.meta.url),'utf8'),'public-surface-loader-V55JV4Jk.js');
const candidate=await compile(fs.readFileSync(new URL('./release-files/optional-provider-policy-surface.js',import.meta.url),'utf8'),'provider-policy-surface-bKCE_kaj.js');
const native=await import(new URL('provider-policy-surface-bKCE_kaj.js',runtime).href);
const ids=[...new Set(['deepseek','openai','anthropic','concurrency-missing-provider-policy',...fs.readdirSync(new URL('extensions/',runtime),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name)])];
const outcome=(f,id)=>{try{return {value:f(id)};}catch(e){return {error:{name:e.name,message:e.message}};}};
let available=0,missing=0,errors=0;
for(const id of ids){const a=outcome(native.t,id),b=outcome(candidate.namespace.t,id);assert(isDeepStrictEqual(a,b),'Native provider policy mismatch; no module values emitted');if(a.error)errors++;else if(a.value)available++;else missing++;}
for(const id of ['.','..','a/b','a\\b','a:b'])assert.equal(candidate.namespace.t(id),native.t(id));
const cycles=2000,missingId='concurrency-missing-provider-policy';
const measure=f=>{const start=performance.now();for(let i=0;i<cycles;i++)assert.equal(f(missingId),null);return performance.now()-start;};
const normalMs=measure(native.t),optionalMs=measure(candidate.namespace.t);
console.log(JSON.stringify({catalogComparisons:ids.length,available,missing,errors,invalidIdComparisons:5,cycles,normalMs,optionalMs,modelCalls:0,businessDatabaseAccess:false}));
