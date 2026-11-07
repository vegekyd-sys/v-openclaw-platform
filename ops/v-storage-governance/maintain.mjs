import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {assertMappings,inspectTree,processReferences,eligibleSnapshot,unlinkTreeExact,diskUsage,pressure,writeJsonAtomic} from './core.mjs';
import {prunePackageCaches} from './package-cache.mjs';

const policy=JSON.parse(fs.readFileSync(new URL('./policy.json',import.meta.url),'utf8'));
assert.equal(os.hostname(),policy.host);assert.equal(process.getuid(),0);
assert(['--audit','--apply'].includes(process.argv[2]));
const apply=process.argv[2]==='--apply';
// Lock ownership is enforced by the systemd flock wrapper for --apply.
if(apply)assert.equal(process.env.V_STORAGE_LOCK_HELD,'1','Apply requires the installed locking service');
const status={version:1,checkedAt:new Date().toISOString(),mode:apply?'apply':'audit',actions:[],skipped:[]};
try{
  assertMappings(policy,{allowReadOnlyDiskRoot:true});status.mountsHealthy=true;
  status.before={root:diskUsage('/'),data:diskUsage(policy.diskRoot)};
  status.level=pressure(policy,status.before.root,status.before.data);
  const ageHours=status.before.data.percent>=policy.warningPercent?policy.cachePressureAgeHours:policy.cacheMaxAgeHours;
  const cache=policy.mappings.find(m=>m.name==='cache');
  const entries=fs.readdirSync(cache.original).filter(n=>/^openclaw-sqlite-readonly-/.test(n)).sort();
  let deleted=0;
  for(const name of entries){
    const p=path.join(cache.original,name);let tree;
    try{tree=inspectTree(p);}catch(e){if(e.code==='ENOENT')continue;status.skipped.push({name,reason:'unsafe-or-changing-tree'});continue;}
    const verdict=eligibleSnapshot(name,tree,{ageHours,pidExists:pid=>fs.existsSync('/proc/'+pid)});
    if(!verdict.eligible){status.skipped.push({name,reason:verdict.reason});continue;}
    const alternate=path.join(cache.destination,name);
    const busy=processReferences([p,alternate]);
    if(busy.length){status.skipped.push({name,reason:'in-use',processes:busy});continue;}
    if(deleted>=policy.maxDeletesPerRun){status.skipped.push({name,reason:'per-run-limit'});continue;}
    if(apply){
      assertMappings(policy,{allowReadOnlyDiskRoot:true});
      assert.equal(processReferences([p,alternate]).length,0,'Snapshot acquired by a process');
      assert(!fs.existsSync('/proc/'+name.split('-')[3]),'Creator PID reappeared');
      unlinkTreeExact(p,tree);
      fs.appendFileSync(path.join(policy.stateRoot,'deletions.jsonl'),JSON.stringify({at:new Date().toISOString(),name,reason:verdict.reason,allocatedBytes:tree.reduce((n,e)=>n+e.blocks*512,0)})+'\n',{mode:0o600});
    }
    deleted++;
    status.actions.push({name,action:apply?'removed-expired-snapshot':'would-remove-expired-snapshot',bytes:tree.reduce((n,e)=>n+e.blocks*512,0)});
  }
  status.packageCaches=prunePackageCaches(policy,{apply,rootPressure:status.before.root.availableBytes<policy.minimumRootFreeGiB*1024**3||status.before.root.percent>=policy.warningPercent});
  status.after={root:diskUsage('/'),data:diskUsage(policy.diskRoot)};
  status.level=pressure(policy,status.after.root,status.after.data);
  status.mountsHealthy=true;
  status.note='Backups and OpenClaw cache use persistent data-disk bind mounts. No live database, session, memory, workspace, browser profile, business media or rollback backup is deleted.';
}catch(e){status.level='critical';status.mountsHealthy??=false;status.error=e.message;}
if(apply){fs.mkdirSync(policy.stateRoot,{recursive:true,mode:0o700});writeJsonAtomic(path.join(policy.stateRoot,'status-latest.json'),status);}
console.log(JSON.stringify(status));
if(status.level!=='normal')process.exitCode=2;
