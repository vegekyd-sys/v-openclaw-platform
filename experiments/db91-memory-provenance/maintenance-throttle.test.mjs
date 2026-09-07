import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMaintenanceThrottle} from './maintenance-throttle.mjs';
import {patchAutomaticMaintenance} from '../../scripts/patch-db91-maintenance-throttle.mjs';
test('per-connection sweep windows are bounded and do not serialize different databases',async()=>{
  let now=0;const delays=[];
  const wait=createMaintenanceThrottle({intervalMs:1000,jitterMs:0,now:()=>now,sleep:async ms=>{delays.push(ms);now+=ms;}});
  const a={},b={};await wait(a);await wait(a);await wait(b);await wait(a);
  assert.deepEqual(delays,[1000,1000,1000]);assert.equal(now,3000);
});
test('native active-session accumulation is retained while one automatic sweep is deferred',async()=>{
  const native=fs.readFileSync(process.env.DB91_NATIVE_SESSION_ENTRY??'/private/tmp/db91-session-accessor.sqlite-entry-BlklNPKQ.js','utf8');
  const patched=patchAutomaticMaintenance(native),start=patched.indexOf('const maintenanceByStore ='),end=patched.indexOf('//#endregion',start);
  const jobs=[],sweeps=[],db={db:{isOpen:true}},waiters=[];
  const make=new Function('resolveOpenClawAgentSqlitePath','getOpenClawAgentDatabaseIfOpen','toDatabaseOptions','setImmediate','db91WaitAutomaticMaintenance','runExclusiveSqliteSessionWrite','runOpenClawAgentWriteTransaction','applySessionEntryMaintenance','finalizeSessionEntryMaintenancePlansAfterWriterReleaseBestEffort','getChildLogger',patched.slice(start,end)+'\nreturn {kick:kickSessionEntryMaintenanceAfterWrite,size:()=>maintenanceByStore.size};');
  const api=make(()=>'/one-db',()=>db,x=>x,fn=>jobs.push(fn),()=>new Promise(r=>waiters.push(r)),async(_scope,fn)=>fn(),fn=>fn(db),(_db,params)=>{sweeps.push(params.activeSessionKeys);return {};},async()=>{},()=>({warn(){throw Error('unexpected maintenance failure');}}));
  const previous=process.env.OPENCLAW_DB91_MAINTENANCE_ENABLE;process.env.OPENCLAW_DB91_MAINTENANCE_ENABLE='1';
  try{
    api.kick({scope:{},activeSessionKey:'first'});assert.equal(jobs.length,1);jobs[0]();
    for(let i=0;i<100;i++)api.kick({scope:{},activeSessionKey:'project-'+i});
    assert.equal(jobs.length,1);assert.equal(sweeps.length,0);assert.equal(waiters.length,1);
    waiters.shift()();for(let n=0;n<12;n++)await Promise.resolve();
    assert.equal(sweeps.length,1);assert.equal(sweeps[0].length,101);assert.equal(api.size(),0);
    api.kick({scope:{},activeSessionKey:'after'});jobs[1]();db.db.isOpen=false;waiters.shift()();for(let n=0;n<12;n++)await Promise.resolve();
    assert.equal(sweeps.length,1);assert.equal(api.size(),0);
    assert.throws(()=>patchAutomaticMaintenance(patched));
  }finally{if(previous===undefined)delete process.env.OPENCLAW_DB91_MAINTENANCE_ENABLE;else process.env.OPENCLAW_DB91_MAINTENANCE_ENABLE=previous;}
});
