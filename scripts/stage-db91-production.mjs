// Prepare an immutable release alongside live V. No live config/unit/DB writes.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const release='/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1';
const source=path.dirname(path.dirname(new URL(import.meta.url).pathname));assert.equal(source,release+'/source');
const state='/home/openclaw/.openclaw',backup=state+'/backups/v2026.9.1-db91.1';
const oldCore='/opt/openclaw-2026.9.1-v/openclaw',oldWorker='/opt/openclaw-experiments/agent-worker-isolation-v1/releases/0.2.11-steer91';
const manifest=JSON.parse(fs.readFileSync(release+'/artifact/manifest.json'));
const hash=b=>createHash('sha256').update(b).digest('hex'),sha=p=>hash(fs.readFileSync(p));
assert.equal(sha(release+'/artifact/manifest.json'),'d59cf9f17f4784315915d94ac78b97d1969507937157f4b453d937c18af9308b');
assert.equal(manifest.releaseId,'v2026.9.1-db91.1');assert.equal(manifest.files.length,9);
const run=(cmd,args,options={})=>execFileSync(cmd,args,{encoding:'utf8',timeout:30000,...options}).trim();
const pid=run('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value']);assert(Number(pid)>1);
const cfgFiles=[state+'/openclaw.json',state+'/experiments/agent-worker-isolation-v1/worker-openclaw.json'];
const configs=cfgFiles.map(file=>({file,bytes:fs.readFileSync(file),sha256:sha(file)}));
assert.equal(JSON.parse(configs[0].bytes).gateway.port,22793);
assert.equal(JSON.parse(fs.readFileSync(oldCore+'/package.json')).version,'2026.9.1');
const protectedFiles=manifest.files.map(f=>{
 assert(/^(core|worker)\/[a-zA-Z0-9_./-]+$/.test(f.path)&&!f.path.includes('..'));
 assert.equal(sha(release+'/artifact/'+f.path),f.sha256);
 const live=(f.path.startsWith('core/')?oldCore:oldWorker)+'/'+f.path.split('/').slice(1).join('/');
 if(f.beforeSha256===null)assert(!fs.existsSync(live),'Unexpected helper already installed');
 else assert.equal(sha(live),f.beforeSha256,'Live runtime has changed: '+f.path);
 return {...f,live};
});
assert(!fs.existsSync(release+'/core')&&!fs.existsSync(release+'/worker'),'Stage already exists');
fs.mkdirSync(backup,{recursive:true,mode:0o700});
run('cp',['-a',oldCore,release+'/core'],{timeout:180000});
run('cp',['-a',oldWorker,release+'/worker'],{timeout:60000});
for(const f of protectedFiles){
 const destination=release+'/'+f.path;fs.copyFileSync(release+'/artifact/'+f.path,destination);
 fs.chownSync(destination,0,0);fs.chmodSync(destination,0o644);
 run(process.execPath,['--check',destination]);
 run('/usr/sbin/runuser',['-u','openclaw','--','/usr/bin/test','-r',destination]);
}
for(const c of configs){
 assert.equal(sha(c.file),c.sha256,'Live config changed during stage');
 const index=configs.indexOf(c);fs.writeFileSync(backup+'/config-'+index+'.before',c.bytes,{mode:0o600,flag:'wx'});
}
const unit=run('systemctl',['cat','openclaw-gateway.service']);
fs.writeFileSync(backup+'/service.before',unit,{mode:0o600,flag:'wx'});
const commands=run('systemctl',['show','openclaw-gateway.service','-p','ExecStart','-p','ExecStartPre','-p','KillMode','-p','TimeoutStopUSec']);
fs.writeFileSync(backup+'/service-properties.before',commands,{mode:0o600,flag:'wx'});
const plan={releaseId:manifest.releaseId,sourceCommit:run('git',['-c','safe.directory='+source,'-C',source,'rev-parse','HEAD']),at:new Date().toISOString(),beforePid:Number(pid),oldCore,oldWorker,newCore:release+'/core',newWorker:release+'/worker',manifestSha256:sha(release+'/artifact/manifest.json'),files:protectedFiles,configs:configs.map(({file,sha256})=>({file,sha256})),liveUnchanged:true};
for(const f of protectedFiles)if(f.beforeSha256)assert.equal(sha(f.live),f.beforeSha256);
fs.writeFileSync(backup+'/staged.json',JSON.stringify(plan,null,2),{mode:0o600,flag:'wx'});
console.log(JSON.stringify({staged:true,releaseId:plan.releaseId,files:9,livePid:Number(pid),liveRuntimeConfigUnchanged:true}));
