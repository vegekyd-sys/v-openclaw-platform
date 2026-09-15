import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';

const runtime=process.env.VLAB_CANDIDATE_RUNTIME;
const sharedState=process.env.VLAB_SHARED_STATE_DIR;
const sharedRuntime=path.dirname(sharedState)+'/runtime';
const parseEnv=pid=>Object.fromEntries(fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0').filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));

test('real incremental-vacuum shrink reuses a healthy full native verification without shared writes',{timeout:300000},async()=>{
 assert(runtime&&sharedState);
 const pid=Number(execFileSync('systemctl',['show','openclaw-vlab-production-mirror-v8.service','-p','MainPID','--value'],{encoding:'utf8'}));
 const child=execFileSync('ps',['-eo','pid,ppid,comm'],{encoding:'utf8'}).split('\n').slice(1).map(s=>s.trim().split(/\s+/)).find(s=>Number(s[1])===pid&&s[2]==='node'&&parseEnv(s[0]).VLAB_WORKER_CHILD==='1');
 assert(child);const env=parseEnv(child[0]);
 const before=await import(sharedRuntime+'/openclaw/dist/db91-integrity-gate.mjs');
 const after=await import(runtime+'/openclaw/dist/db91-integrity-gate.mjs');
 const {t:assertNativeIntegrity}=await import(runtime+'/openclaw/dist/sqlite-integrity-BBPyeEpy.js');
 const filename=sharedState+'/agents/makaron/agent/openclaw-agent.sqlite';
 const db=new DatabaseSync(filename,{readOnly:true});
 try{
  db.exec('PRAGMA query_only=ON; BEGIN DEFERRED');
  const mode=db.prepare('PRAGMA auto_vacuum').get().auto_vacuum;
  assert.equal(mode,2);
  const pageCount=db.prepare('PRAGMA page_count').get().page_count,pageSize=db.prepare('PRAGMA page_size').get().page_size,fileBytes=fs.statSync(filename).size;
  const totalBefore=db.prepare('SELECT total_changes() n').get().n;
  const baseline=before.readReusableVerification(db,filename,'makaron',{env});
  const at=performance.now();const candidate=after.readReusableVerification(db,filename,'makaron',{env});const cacheCheckMs=performance.now()-at;
  assert.equal(baseline,false,'must reproduce the observed live shrink invalidation');assert.equal(candidate,true);
  const fullAt=performance.now();assertNativeIntegrity(db,filename);const fullCheckMs=performance.now()-fullAt;
  assert.equal(after.readReusableVerification(db,filename,'makaron',{env}),true);
  assert.equal(db.prepare('SELECT total_changes() n').get().n,totalBefore);
  assert.equal(Number(execFileSync('systemctl',['show','openclaw-vlab-production-mirror-v8.service','-p','MainPID','--value'],{encoding:'utf8'})),pid);
  console.log(JSON.stringify({event:'native-integrity-shrink-real-history',mode,pageCount,pageSize,fileBytes,logicalBytes:pageCount*pageSize,baseline,candidate,cacheCheckMs,fullCheckMs,nativeIntegrityHealthy:true,sharedDatabaseWrites:0,gatewayPidUnchanged:true}));
 }finally{db.exec('ROLLBACK');db.close();}
});
