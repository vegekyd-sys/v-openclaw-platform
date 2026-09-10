#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {sha,read,save,replace,name,target,hashFile,validateFiles,assertVersion,installFiles,fingerprint} from './files.mjs';
const LAB='/srv/vlab-production-mirror/labs';
const HOME=LAB+'/shared-workflow';
const UNIT='openclaw-vlab-production-mirror-v8.service';
const NODE='/opt/vlab/node-v22.23.1-linux-x64/bin/node';
const RUNTIME=LAB+'/instances/db91-parity/runtime';
const run=(bin,args)=>execFileSync(bin,args,{encoding:'utf8',timeout:60000,maxBuffer:8*1024**2}).trim();
const pid=()=>Number(run('systemctl',['show',UNIT,'-p','MainPID','--value']));
function live() {
  const p=pid();assert(p>1,'Shared Gateway is not running');
  const env=Object.fromEntries(fs.readFileSync(`/proc/${p}/environ`,'utf8').split('\0').filter(Boolean).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
  assert(env.OPENCLAW_STATE_DIR?.startsWith(LAB+'/instances/db91-parity/state'));
  assert(env.OPENCLAW_CONFIG_PATH?.startsWith(env.OPENCLAW_STATE_DIR+'/'));
  const cfg=read(env.OPENCLAW_CONFIG_PATH);assert.equal(cfg.gateway.port,24993);assert.equal(cfg.gateway.reload?.mode,'off');
  assert(fs.readFileSync(`/proc/${p}/cmdline`,'utf8').includes(RUNTIME+'/openclaw/dist/index.js'));
  return {pid:p,env,cfg,configSha:hashFile(env.OPENCLAW_CONFIG_PATH)};
}
function lease(owner) {
  assert(owner && read(LAB+'/control/integration.json').owner===owner,'Integration lease belongs to another task');
}
function current() {return read(HOME+'/current.json');}
function free() {const s=fs.statfsSync(HOME);return s.bavail*s.bsize;}
async function lock(fn) {
  const dir=LAB+'/control/operation.lock';fs.mkdirSync(dir,{mode:0o700});
  try {fs.writeFileSync(dir+'/pid',String(process.pid));return await fn();}
  finally {fs.unlinkSync(dir+'/pid');fs.rmdirSync(dir);}
}
async function connect() {
  const l=live();Object.assign(process.env,l.env);
  const token=l.cfg.gateway.auth.token.replace(/\$\{([^}]+)\}/g,(_,k)=>{assert(l.env[k]);return l.env[k];});
  const {GatewayClient}=await import(RUNTIME+'/openclaw/dist/plugin-sdk/gateway-runtime.js');let c;
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Gateway connect deadline')),20000);
      c=new GatewayClient({url:'ws://127.0.0.1:24993',token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.write','operator.admin'],
        onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:e=>{clearTimeout(timer);reject(e);}});c.start();
    });
    return {c,l,call:(m,p={})=>c.request(m,p,{timeoutMs:30000})};
  } catch(e) {c?.stop();throw e;}
}
async function rpc(method,params) {const x=await connect();try{return await x.call(method,params);}finally{x.c.stop();}}
function publicStatus() {
  const l=live();return {service:UNIT,pid:l.pid,port:24993,configSha:l.configSha,state:l.env.OPENCLAW_STATE_DIR,
    agents:Object.keys(l.cfg.agents.entries??{}),plugins:l.cfg.plugins?.load?.paths??[],reload:l.cfg.gateway.reload.mode,
    current:fs.existsSync(HOME+'/current.json')?current():null,
    pending:fs.existsSync(HOME+'/pending.json')?read(HOME+'/pending.json'):null,
    lease:fs.existsSync(LAB+'/control/integration.json')?read(LAB+'/control/integration.json'):null,freeBytes:free()};
}
async function archiveRuntime(dest,limit) {
  // Do not dereference links or include runtime-adjacent state. Upstream test .env files are omitted too.
  const child=spawn('tar',['-czf','-','--exclude=.env','--exclude=.env.*','--exclude=.npmrc','--exclude=*.sqlite','--exclude=*.jsonl','-C',RUNTIME,'.']);
  const out=fs.createWriteStream(dest,{flags:'wx',mode:0o600});let bytes=0,error;
  child.stdout.on('data',b=>{bytes+=b.length;if(bytes>limit){error=Error('Baseline archive would violate disk reserve');child.kill('SIGTERM');}});
  child.stdout.pipe(out);child.stderr.resume();
  await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>{if(code!==0||error)reject(error??Error('Baseline archive failed'));else resolve();});});
  await new Promise((resolve,reject)=>{if(out.writableFinished)resolve();else{out.on('finish',resolve);out.on('error',reject);}});
  return bytes;
}
async function cutover(req,rollback=false) {
  lease(req.owner);assert(!fs.existsSync(HOME+'/pending.json'),'Unresolved deployment: inspect pending.json before retry');
  const before=current();const id=name(req.id);const dir=HOME+'/releases/'+id;const m=read(dir+'/manifest.json');
  assert.equal(sha(fs.readFileSync(dir+'/artifact.json')),m.artifactSha);
  if(rollback)assert.equal(before.release,id,'Only current release can roll back');
  else assert.equal(before.release,m.baseRelease,'Candidate based on another release');
  assert.equal(live().configSha,m.configSha,'Configuration changed since staging; restage');
  assert.equal(fingerprint(RUNTIME).sha256,before.runtimeSha,'Runtime changed outside workflow; reconcile before deploying');
  const from=rollback?'after':'before',to=rollback?'before':'after';assertVersion(RUNTIME,m.files,from);
  const x=await connect();let suspension,stopped=false,installed=false;
  try {
    suspension=await x.call('gateway.suspend.prepare',{requestId:'vlab-workflow-'+Date.now(),drain:true,terminalPolicy:'preserve'});
    assert(suspension.suspensionId);
    const deadline=Date.now()+45000;let s;
    for(;;) {
      s=await x.call('gateway.suspend.status',{suspensionId:suspension.suspensionId});
      assert(s.status!=='running'&&s.expiresAtMs>Date.now()+5000,'Admission fence expired');
      if(s.activeCount===0)break;
      if(Date.now()>deadline)throw Error('Shared VLab has active work; release deferred without touching code');
      await delay(1000);
    }
    const w=await x.call('vlab.workers.status',{});assert.equal(w.pending,0);assert(w.workers.every(w=>!w.activeCount&&!w.queued),'Workers still active');
    assert.equal(pid(),x.l.pid);lease(req.owner);assert.equal(live().configSha,m.configSha);assertVersion(RUNTIME,m.files,from);
    save(HOME+'/pending.json',{id,rollback,before,at:new Date().toISOString(),owner:req.owner});
    run('systemctl',['stop',UNIT]);stopped=true;assert.equal(pid(),0);
    try {installFiles(RUNTIME,m.files,dir,to);installed=true;}
    catch(e) {installFiles(RUNTIME,m.files,dir,from);throw e;}
    finally {run('systemctl',['start',UNIT]);stopped=false;}
    x.c.stop();
    const until=Date.now()+90000;let ready=false;
    while(Date.now()<until){try{await rpc('health',{});ready=true;break;}catch{await delay(2000);}}
    assert(ready,'Installed but Gateway not ready; pending journal retained for recovery');
    assertVersion(RUNTIME,m.files,to);assert.equal(live().configSha,m.configSha);
    const runtimeSha=fingerprint(RUNTIME).sha256;
    if(rollback)assert.equal(runtimeSha,m.parent.runtimeSha,'Rollback fingerprint mismatch');
    const next=rollback?m.parent:{release:id,sourceCommit:m.sourceCommit,baseline:before.baseline,runtimeSha,accepted:false};
    replace(HOME+'/current.json',next);
    const receipt={id,rollback,at:new Date().toISOString(),beforePid:x.l.pid,afterPid:pid(),current:next,configSha:m.configSha,
      artifactSha:m.artifactSha,statePreserved:true,acceptance:'Gateway readiness only; functional evidence required'};
    save(HOME+'/receipts/'+Date.now()+'-'+id+'.json',receipt);fs.unlinkSync(HOME+'/pending.json');return receipt;
  } finally {
    if(stopped)run('systemctl',['start',UNIT]);
    if(!installed&&suspension?.suspensionId)await x.call('gateway.suspend.resume',{suspensionId:suspension.suspensionId}).catch(()=>{});
    x.c.stop();
  }
}
async function main(req) {
  assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
  fs.mkdirSync(HOME,{recursive:true,mode:0o700});
  if(req.command==='status')return publicStatus();
  if(req.command==='rpc') {
    const readMethods=['health','vlab.workers.status','sessions.list','chat.history','agent.wait'];
    assert(readMethods.includes(req.method),'Use the explicit test command for writes');return rpc(req.method,req.params??{});
  }
  if(req.command==='test') {
    lease(req.owner);assert(/^[\w-]+$/.test(req.agent??'makaron'));
    const key=req.sessionKey??`agent:${req.agent??'makaron'}:explicit:vlab-dev-${name(req.task)}-${Date.now()}`;
    assert(key.startsWith(`agent:${req.agent??'makaron'}:explicit:vlab-dev-`),'Tests use dedicated sessions; existing conversations remain read-only here');
    assert(typeof req.message==='string'&&req.message.length<16000);
    const result=await rpc('chat.send',{agentId:req.agent??'makaron',sessionKey:key,message:req.message,deliver:false,thinking:'low',timeoutMs:180000,idempotencyKey:req.idempotencyKey??`vlab-dev-${Date.now()}`});
    return {sessionKey:key,...result};
  }
  if(req.command==='read-code') {
    const p=target(RUNTIME,req.target);return {target:req.target,sha256:hashFile(p),content:fs.existsSync(p)?fs.readFileSync(p).toString('base64'):null,current:current()};
  }
  lease(req.owner);
  return lock(async()=>{
    lease(req.owner);
    if(req.command==='baseline') {
      assert(!fs.existsSync(HOME+'/current.json'),'Baseline already registered');
      const id=name(req.id),dir=HOME+'/baselines/'+id;fs.mkdirSync(dir,{recursive:true,mode:0o700});
      const l=live(),archive=dir+'/runtime.tar.gz',inventory=fingerprint(RUNTIME);
      assert(free()>3*1024**3+64*1024**2,'Insufficient baseline headroom');
      const bytes=await archiveRuntime(archive,free()-3*1024**3-16*1024**2);
      assert.equal(live().configSha,l.configSha);assert.equal(pid(),l.pid);assert.equal(fingerprint(RUNTIME).sha256,inventory.sha256,'Runtime changed during baseline capture');
      // The imported binary baseline is explicit. Source SHA alone did not describe old hot patches.
      const m={id,at:new Date().toISOString(),archiveSha256:hashFile(archive),bytes,runtime:RUNTIME,configSha:l.configSha,
        sourceCommit:req.sourceCommit,runtimeSha:inventory.sha256,files:inventory.files,provenance:'Imported live code artifact, not a clean upstream source build',
        excluded:['.env','.env.*','.npmrc','*.sqlite','*.jsonl'],stateCopied:false};
      save(dir+'/manifest.json',m);save(HOME+'/current.json',{release:id,baseline:id,sourceCommit:req.sourceCommit,runtimeSha:inventory.sha256,accepted:false});return m;
    }
    if(req.command==='stage') {
      assert(!fs.existsSync(HOME+'/pending.json'),'Unresolved deployment');
      const id=name(req.id);assert(/^[0-9a-f]{40}$/.test(req.sourceCommit));assert.equal(req.branch,'dev','Only merged dev artifacts may deploy');
      assert.equal(req.baseRelease,current().release,'Stale base release');assert.equal(fingerprint(RUNTIME).sha256,current().runtimeSha,'Runtime drift since last release');validateFiles(RUNTIME,req.files);assertVersion(RUNTIME,req.files,'before');
      assert(free()>3*1024**3+2*Buffer.byteLength(JSON.stringify(req)),'Disk reserve');
      const dir=HOME+'/releases/'+id;assert(!fs.existsSync(dir),'Release ID is immutable; use a new ID');
      fs.mkdirSync(dir,{mode:0o700,recursive:true});fs.mkdirSync(dir+'/before');fs.mkdirSync(dir+'/after');
      for(const [i,f] of req.files.entries()) {
        if(f.before!==null)fs.copyFileSync(target(RUNTIME,f.target),dir+'/before/'+i,fs.constants.COPYFILE_EXCL);
        fs.writeFileSync(dir+'/after/'+i,Buffer.from(f.content,'base64'),{flag:'wx',mode:0o600});
        if(/\.[cm]?js$/.test(f.target))execFileSync(NODE,['--check','--input-type='+ (f.target.endsWith('.cjs')?'commonjs':'module')],{input:Buffer.from(f.content,'base64'),timeout:30000});
      }
      save(dir+'/artifact.json',req);
      const m={id,baseRelease:req.baseRelease,parent:current(),sourceCommit:req.sourceCommit,branch:req.branch,
        artifactSha:hashFile(dir+'/artifact.json'),configSha:live().configSha,files:req.files.map(({content,...f})=>f),at:new Date().toISOString()};
      save(dir+'/manifest.json',m);return m;
    }
    if(req.command==='deploy'||req.command==='rollback')return cutover(req,req.command==='rollback');
    if(req.command==='accept') {
      const c=current();assert.equal(c.release,name(req.id));assert.equal(req.artifactSha,read(HOME+'/releases/'+c.release+'/manifest.json').artifactSha);
      assert(typeof req.evidence==='string'&&req.evidence.length>=20,'Provide functional evidence reference and result');
      const m=read(HOME+'/releases/'+c.release+'/manifest.json');assertVersion(RUNTIME,m.files,'after');assert.equal(live().configSha,m.configSha);
      const accepted={...c,accepted:true,evidence:req.evidence,artifactSha:req.artifactSha,at:new Date().toISOString()};
      save(HOME+'/receipts/'+Date.now()+'-accept.json',accepted);replace(HOME+'/current.json',accepted);return accepted;
    }
    throw Error('Unknown command');
  });
}
try {let input='';for await(const chunk of process.stdin){input+=chunk;assert(input.length<96*1024**2);}console.log(JSON.stringify(await main(JSON.parse(input))));}
catch(e){console.error(JSON.stringify({error:e.message}));process.exitCode=1;}
