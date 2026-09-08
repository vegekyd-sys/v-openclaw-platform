// Staged, hash-guarded production delta applied only by systemd ExecStartPre.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import{execFileSync,spawn}from'node:child_process';import{createHash}from'node:crypto';
import{planAffinity}from'./worker-affinity-production-plan.mjs';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const root='/home/openclaw/.openclaw',core='/opt/openclaw-2026.9.1-v/openclaw',unit='openclaw-gateway.service',source=path.dirname(path.dirname(new URL(import.meta.url).pathname));
assert.equal(source,'/opt/openclaw-experiments/worker-affinity-20260908/source');
const dir=root+'/backups/worker-affinity-production-20260908',drop='/etc/systemd/system/'+unit+'.d/zzz-worker-affinity-prestart.conf',flag='/etc/systemd/system/'+unit+'.d/zzz-worker-affinity-enabled.conf';
const hook='[Service]\nExecStartPre=+/opt/node-v22.23.1/bin/node '+source+'/scripts/release-affinity-production.mjs prestart\n';
const enabled='[Service]\nEnvironment=OPENCLAW_WORKER_SESSION_AFFINITY_ENABLE=1\n';
const run=(c,a,opts={})=>execFileSync(c,a,{encoding:'utf8',timeout:30000,...opts}).trim(),hash=b=>createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p));
const pid=()=>Number(run('systemctl',['show',unit,'-p','MainPID','--value']));
const commit=run('git',['-c','safe.directory='+source,'-C',source,'rev-parse','HEAD']);assert.equal(run('git',['-c','safe.directory='+source,'-C',source,'status','--porcelain']),'');
const pool='/opt/openclaw-experiments/agent-worker-isolation-v1/releases/0.2.11-steer91/worker-pool.mjs';
const cfgFiles=[root+'/openclaw.json',root+'/experiments/agent-worker-isolation-v1/worker-openclaw.json'];
const atomic=(p,b)=>{const st=fs.statSync(p),tmp=p+'.affinity-'+process.pid;fs.writeFileSync(tmp,b,{mode:st.mode&0o777,flag:'wx'});fs.chownSync(tmp,st.uid,st.gid);fs.renameSync(tmp,p);};
const mode=process.argv[2],arm=process.argv[3];assert(['inspect','stage','prestart','restart','verify'].includes(mode));
const record=(phase,data={})=>{const r={at:new Date().toISOString(),phase,commit,...data};fs.writeFileSync(dir+'/'+Date.now()+'-'+phase+'.json',JSON.stringify(r,null,2),{mode:0o600,flag:'wx'});console.log(JSON.stringify(r));};
if(mode==='prestart'){
 assert.equal(pid(),0);const s=read(dir+'/pending.json');assert.equal(s.commit,commit);assert.equal(fs.readFileSync(drop,'utf8'),hook);
 for(const f of s.files)assert.equal(hash(fs.readFileSync(f.after)),f.afterSha,'staged bytes drift');
 for(const f of s.protectedFiles)assert.equal(hash(fs.readFileSync(f.path)),f.sha,'protected runtime drift');
 // Repeated prestart after a failed boot is idempotent; refuse unrelated drift.
 for(const f of s.files)assert([f.beforeSha,f.afterSha].includes(hash(fs.readFileSync(f.path))),'prestart file drift');
 try{for(const f of s.files)atomic(f.path,fs.readFileSync(f.after));record('applied',{arm:s.arm,files:s.files.map(f=>({path:f.path,sha:hash(fs.readFileSync(f.path))}))});}
 catch(e){for(const f of s.files)if(hash(fs.readFileSync(f.path))===f.afterSha)atomic(f.path,fs.readFileSync(f.before));record('apply-rolled-back',{arm:s.arm,error:e.name});throw e;}
 process.exit(0);
}
const beforePid=pid();assert(beforePid>1);
for(const e of fs.readFileSync('/proc/'+beforePid+'/environ','utf8').split('\0')){const i=e.indexOf('=');if(i>0)process.env[e.slice(0,i)]=e.slice(i+1);}
const cfg=read(cfgFiles[0]);assert.equal(cfg.gateway.port,22793);assert.equal(cfg.plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath,cfgFiles[1]);assert(cfg.plugins.load.paths.includes(path.dirname(pool)));
const originalPool=fs.readFileSync(pool,'utf8'),accepted=fs.readFileSync(source+'/experiments/agent-worker-isolation-v1/worker-pool.mjs','utf8');
assert.equal(hash(accepted),'a4a3bfd547074b5d851a0c000cb8a9ff4975e16e5d02cc8918c017aa1882b94c');
const baselinePath=dir+'/pool.original';
const original=fs.existsSync(baselinePath)?fs.readFileSync(baselinePath,'utf8'):originalPool;
assert.equal(hash(original),'f4afe29c5ee7876b98f17fb28df55fff597802401c999c25ec5fbc40f3a29e64');
const patched=planAffinity(original,accepted);assert([hash(original),hash(patched)].includes(hash(originalPool)));
run(process.execPath,['--check','--input-type=module'],{input:patched});
if(mode==='inspect'){console.log(JSON.stringify({phase:'plan',commit,pid:beforePid,baselineSha:hash(original),candidateSha:hash(patched),configHashes:cfgFiles.map(p=>({path:p,sha:hash(fs.readFileSync(p))})),productionUnchanged:true}));process.exit(0);}
fs.mkdirSync(dir,{recursive:true,mode:0o700});
if(mode==='stage'){
 assert(['A','B','rollback'].includes(arm));assert(!fs.existsSync(drop),'pending restart hook exists');
 if(!fs.existsSync(baselinePath))fs.writeFileSync(baselinePath,original,{mode:0o600,flag:'wx'});
 const validationGid=Number(run('/usr/bin/id',['-g','openclaw']));assert(Number.isInteger(validationGid));fs.chownSync(dir,0,validationGid);fs.chmodSync(dir,0o750);
 const stamp=Date.now(),files=[];
 for(const [i,p]of cfgFiles.entries()){
  const bytes=fs.readFileSync(p),c=JSON.parse(bytes);assert(c.mcp.servers['universal-memory']);c.mcp.servers['universal-memory'].enabled=false;
  const after=Buffer.from(JSON.stringify(c,null,2)+'\n'),base=dir+'/'+stamp+'-cfg-'+i;
  fs.writeFileSync(base+'.before',bytes,{mode:0o600,flag:'wx'});fs.writeFileSync(base+'.after',after,{mode:0o600,flag:'wx'});
  fs.chownSync(base+'.after',0,validationGid);fs.chmodSync(base+'.after',0o640);
  try{run('/usr/sbin/runuser',['-u','openclaw','--',process.execPath,core+'/openclaw.mjs','config','validate','--json'],{env:{...process.env,OPENCLAW_CONFIG_PATH:base+'.after'},timeout:60000});}catch{throw Error('staged configuration schema validation failed');}
  files.push({path:p,before:base+'.before',after:base+'.after',beforeSha:hash(bytes),afterSha:hash(after)});
 }
 const poolAfter=arm==='B'?patched:original,base=dir+'/'+stamp+'-pool';fs.writeFileSync(base+'.before',originalPool,{mode:0o600,flag:'wx'});fs.writeFileSync(base+'.after',poolAfter,{mode:0o600,flag:'wx'});
 files.push({path:pool,before:base+'.before',after:base+'.after',beforeSha:hash(originalPool),afterSha:hash(poolAfter)});
 const protectedFiles=[core+'/dist/builtin-openclaw-zQV8Wwjr.js',core+'/dist/agents/agent-bundle-mcp-runtime.js',core+'/dist/agent-bundle-mcp-materialize-DlD9AJQW.js',core+'/dist/bundle-prep-observer.mjs',path.dirname(pool)+'/worker.mjs',path.dirname(pool)+'/index.mjs'].map(p=>({path:p,sha:hash(fs.readFileSync(p))}));
 const pending={arm,commit,beforePid,at:new Date().toISOString(),files,protectedFiles};fs.writeFileSync(dir+'/pending.json',JSON.stringify(pending,null,2),{mode:0o600});
 if(arm==='B'){if(fs.existsSync(flag))assert.equal(fs.readFileSync(flag,'utf8'),enabled);else fs.writeFileSync(flag,enabled,{mode:0o644,flag:'wx'});}else if(fs.existsSync(flag)){assert.equal(fs.readFileSync(flag,'utf8'),enabled);fs.unlinkSync(flag);}
 fs.writeFileSync(drop,hook,{mode:0o644,flag:'wx'});run('systemctl',['daemon-reload']);record('staged',{arm,beforePid,files:files.map(f=>({path:f.path,beforeSha:f.beforeSha,afterSha:f.afterSha})),activeRuntimeUnchanged:true});
}else if(mode==='restart'){
 const s=read(dir+'/pending.json');assert.equal(s.beforePid,beforePid);assert.equal(fs.readFileSync(drop,'utf8'),hook);for(const f of s.files)assert.equal(hash(fs.readFileSync(f.path)),f.beforeSha);
 record('official-restart-request',{arm:s.arm,beforePid,command:'openclaw gateway restart --preserve-definition --wait 30s --json'});
 const child=spawn(process.execPath,[core+'/openclaw.mjs','gateway','restart','--preserve-definition','--wait','30s','--json'],{env:process.env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>{output+=b;if(output.length>200000)output=output.slice(-200000);});child.stderr.on('data',()=>{});
 const code=await new Promise(resolve=>child.once('exit',resolve));fs.writeFileSync(dir+'/'+Date.now()+'-official-restart-output.txt',output,{mode:0o600,flag:'wx'});record('official-restart-return',{arm:s.arm,code,pid:pid()});process.exitCode=code??1;
}else if(mode==='verify'){
 const s=read(dir+'/pending.json');assert.notEqual(beforePid,s.beforePid,'Gateway did not restart');for(const f of s.files)assert.equal(hash(fs.readFileSync(f.path)),f.afterSha);
 for(const f of s.protectedFiles)assert.equal(hash(fs.readFileSync(f.path)),f.sha,'protected runtime drift');
 assert.equal(process.env.OPENCLAW_WORKER_SESSION_AFFINITY_ENABLE==='1',s.arm==='B');
 if(fs.existsSync(drop)){assert.equal(fs.readFileSync(drop,'utf8'),hook);fs.unlinkSync(drop);run('systemctl',['daemon-reload']);}
 record('verified',{arm:s.arm,pid:beforePid,umDisabled:true,poolSha:hash(fs.readFileSync(pool)),configHashes:cfgFiles.map(p=>({path:p,sha:hash(fs.readFileSync(p))}))});
}
