// Versioned production cutover. Every mutation is bounded to this approved release.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';
import {db91Release as release,oldDb91Core,planDb91Config,db91SignalPolicy,db91ReleaseUnit} from './db91-production-plan.mjs';
import {trajectoryIndexName,trajectoryIndexSql,trajectoryBudgetSql} from '../experiments/db91-integrity-gate/trajectory-index.mjs';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const [mode]=process.argv.slice(2);assert(['prepare','stop','apply','start','verify','rollback'].includes(mode));
const root='/home/openclaw/.openclaw',backup=root+'/backups/v2026.9.1-db91.1',unit='openclaw-gateway.service';
const drop='/etc/systemd/system/'+unit+'.d/zzzz-db91-release-v1.conf',signalDrop='/etc/systemd/system/'+unit+'.d/zzzz-db91-stop-policy.conf';
const run=(c,a,o={})=>execFileSync(c,a,{encoding:'utf8',timeout:30000,...o}).trim();
const hash=b=>createHash('sha256').update(b).digest('hex'),sha=p=>hash(fs.readFileSync(p)),read=p=>JSON.parse(fs.readFileSync(p));
const staged=read(backup+'/staged.json'),manifest=read(release+'/artifact/manifest.json');
assert.equal(sha(release+'/artifact/manifest.json'),staged.manifestSha256);
const pid=()=>Number(run('systemctl',['show',unit,'-p','MainPID','--value']));
const atomic=(file,bytes)=>{const st=fs.statSync(file),tmp=file+'.db91-'+process.pid;fs.writeFileSync(tmp,bytes,{mode:st.mode&0o777,flag:'wx'});fs.chownSync(tmp,st.uid,st.gid);fs.chmodSync(tmp,st.mode&0o777);fs.renameSync(tmp,file);};
const record=(phase,data={})=>{const value={phase,at:new Date().toISOString(),releaseId:manifest.releaseId,...data};fs.writeFileSync(backup+'/'+Date.now()+'-'+phase+'.json',JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});console.log(JSON.stringify(value));};
const checkArtifact=()=>{for(const file of manifest.files)assert.equal(sha(release+'/'+file.path),file.sha256,'Immutable runtime drift');};
const loadLiveEnv=()=>{const p=pid();assert(p>1);for(const e of fs.readFileSync('/proc/'+p+'/environ','utf8').split('\0')){const i=e.indexOf('=');if(i>0)process.env[e.slice(0,i)]=e.slice(i+1);}return p;};
checkArtifact();
if(mode==='prepare'){
 const p=loadLiveEnv();assert(!fs.existsSync(drop)&&!fs.existsSync(signalDrop));
 assert.equal(run('systemctl',['cat',unit]),fs.readFileSync(backup+'/service.before','utf8'),'Service definition drift');
 assert(read(backup+'/state-online/manifest.json').complete,'Online backup incomplete');
 const canary=fs.realpathSync(backup)+'/canary/result.json';assert(read(canary).completed&&read(canary).rows.length===2,'Packaging smoke not passed');
 const review=read(backup+'/v-review.json');assert(review.completed,'V review not complete');
 const gid=Number(run('id',['-g','openclaw'])),files=[];
 for(const [i,c]of staged.configs.entries()){
  assert.equal(sha(c.file),c.sha256,'Live config drift');const after=planDb91Config(fs.readFileSync(c.file,'utf8'));
  const afterPath=backup+'/config-'+i+'.after';assert(!fs.existsSync(afterPath));fs.writeFileSync(afterPath,after,{mode:0o640,flag:'wx'});fs.chownSync(afterPath,0,gid);fs.chmodSync(afterPath,0o640);
  try{run('/usr/sbin/runuser',['-u','openclaw','--',process.execPath,release+'/core/openclaw.mjs','config','validate','--json'],{env:{...process.env,OPENCLAW_CONFIG_PATH:afterPath},timeout:60000});}catch{throw Error('Staged config validation failed');}
  files.push({file:c.file,before:backup+'/config-'+i+'.before',after:afterPath,beforeSha:c.sha256,afterSha:hash(after)});
 }
 fs.writeFileSync(backup+'/unit.after',db91ReleaseUnit(),{mode:0o600,flag:'wx'});
 fs.writeFileSync(backup+'/prepared.json',JSON.stringify({beforePid:p,files,unitSha:hash(db91ReleaseUnit()),preparedAt:Date.now()},null,2),{mode:0o600,flag:'wx'});
 record('prepared',{beforePid:p,liveUnchanged:true});
}else if(mode==='stop'){
 assert(fs.existsSync(backup+'/prepared.json'));const p=loadLiveEnv();
 if(fs.existsSync(signalDrop))assert.equal(fs.readFileSync(signalDrop,'utf8'),db91SignalPolicy);else fs.writeFileSync(signalDrop,db91SignalPolicy,{mode:0o644,flag:'wx'});
 run('systemctl',['daemon-reload']);assert.equal(run('systemctl',['show',unit,'-p','KillMode','--value']),'mixed');
 const entry=fs.readFileSync('/proc/'+p+'/cmdline','utf8').includes(release+'/core/')?release+'/core':oldDb91Core;
 const {a:writeIntent}=await import(entry+'/dist/restart-intent-BYVo1227.js');
 assert(writeIntent({targetPid:p,reason:'db91-production-controlled-restart',intent:{waitMs:30000},env:process.env}));
 record('native-stop-requested',{beforePid:p,nativeDrainMs:30000,killMode:'mixed'});
 run('systemctl',['stop',unit],{timeout:65000});assert.equal(pid(),0);record('stopped',{beforePid:p});
}else if(mode==='apply'){
 assert.equal(pid(),0);const prepared=read(backup+'/prepared.json');
 assert(read(backup+'/state-final/manifest.json').complete,'Final consistent backup missing');
 for(const f of prepared.files){assert.equal(sha(f.file),f.beforeSha);assert.equal(sha(f.after),f.afterSha);}
 assert(!fs.existsSync(drop));process.env.OPENCLAW_STATE_DIR=root;process.env.OPENCLAW_CONFIG_PATH=root+'/openclaw.json';
 const schema=await import(release+'/core/dist/openclaw-agent-db-maintenance-DYSkzMMg.js');
 const uid=Number(run('id',['-u','openclaw'])),gid=Number(run('id',['-g','openclaw']));const indexes=[];
 try{
  process.setegid(gid);process.seteuid(uid);
  try{for(const agent of ['openclaw','main','xiaoai','dealclaw','short-v','v-codex','makaron']){
   const file=root+'/agents/'+agent+'/agent/openclaw-agent.sqlite';assert.equal(fs.realpathSync(file),file);const db=new DatabaseSync(file),start=Date.now();
   try{schema.u(db,file,schema.F);assert(!db.prepare('SELECT name FROM sqlite_schema WHERE name=?').get(trajectoryIndexName));
    const before=db.prepare(trajectoryBudgetSql).all();db.exec('BEGIN IMMEDIATE');
    try{db.exec(trajectoryIndexSql);assert.deepEqual(db.prepare(trajectoryBudgetSql).all(),before);schema.u(db,file,schema.F);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');indexes.push({agent,ms:Date.now()-start});
   }finally{db.close();}
  }}finally{process.seteuid(0);process.setegid(0);}
  record('additive-indexes',{indexes});
  for(const f of prepared.files)atomic(f.file,fs.readFileSync(f.after));
  fs.writeFileSync(drop,db91ReleaseUnit(),{mode:0o644,flag:'wx'});
  if(fs.existsSync(signalDrop)){assert.equal(fs.readFileSync(signalDrop,'utf8'),db91SignalPolicy);fs.unlinkSync(signalDrop);}
  run('systemctl',['daemon-reload']);record('applied',{indexes:indexes.length,oldRuntimeRetained:true});
 }catch(error){record('apply-failed',{name:error.name,indexes});throw error;}
}else if(mode==='start'){
 assert.equal(pid(),0);assert.equal(fs.readFileSync(drop,'utf8'),db91ReleaseUnit());run('systemctl',['start',unit],{timeout:65000});record('started',{pid:pid(),nativeReadyStillRequired:true});
}else if(mode==='verify'){
 const p=loadLiveEnv(),prepared=read(backup+'/prepared.json');
 assert(fs.readFileSync('/proc/'+p+'/cmdline','utf8').includes(release+'/core/dist/index.js'));
 for(const f of prepared.files)assert.equal(sha(f.file),f.afterSha);
 for(const k of ['OPENCLAW_DB91_READ_AHEAD_ENABLE','OPENCLAW_DB91_STATE_READ_AHEAD_ENABLE','OPENCLAW_DB91_TRAJECTORY_SWEEP_ENABLE','OPENCLAW_WORKER_SESSION_AFFINITY_ENABLE'])assert.equal(process.env[k],'1');
 assert.equal(process.env.V_RELEASE_VERSION,manifest.releaseId);assert.equal(run('systemctl',['show',unit,'-p','KillMode','--value']),'mixed');
 record('installed-verified',{pid:p,realAgentAndChannelVerificationStillRequired:true});
}else{
 assert.equal(pid(),0,'Stop through native handoff before rollback');const prepared=read(backup+'/prepared.json');
 for(const f of prepared.files){assert([f.beforeSha,f.afterSha].includes(sha(f.file)));atomic(f.file,fs.readFileSync(f.before));}
 for(const [file,expected]of [[drop,db91ReleaseUnit()],[signalDrop,db91SignalPolicy]])if(fs.existsSync(file)){assert.equal(fs.readFileSync(file,'utf8'),expected);fs.unlinkSync(file);}
 run('systemctl',['daemon-reload']);run('systemctl',['start',unit],{timeout:65000});record('rolled-back',{pid:pid(),additiveIndexesRetained:true,businessDatabasesNotOverwritten:true});
}
