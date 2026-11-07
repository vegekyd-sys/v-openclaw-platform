import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {assertMappings,assertExtraSnapshotRoot,pruneSnapshots,diskUsage,pressure,writeJsonAtomic} from './core.mjs';
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
  const serviceUid=Number(execFileSync('id',['-u',policy.serviceUser],{encoding:'utf8'}).trim());
  const roots=[{dir:cache.original,alternate:cache.destination}];
  for(const dir of policy.extraSnapshotRoots??[]){
    if(!fs.existsSync(dir))continue;
    assertExtraSnapshotRoot(dir,{uid:serviceUid});roots.push({dir});
  }
  const pidExists=pid=>fs.existsSync('/proc/'+pid);
  const record=entry=>fs.appendFileSync(path.join(policy.stateRoot,'deletions.jsonl'),JSON.stringify(entry)+'\n',{mode:0o600});
  const snapshots=pruneSnapshots(roots,{apply,ageHours,maxDeletes:policy.maxDeletesPerRun,pidExists,record,beforeDelete:()=>assertMappings(policy,{allowReadOnlyDiskRoot:true})});
  status.actions.push(...snapshots.actions);status.skipped.push(...snapshots.skipped);
  status.packageCaches=prunePackageCaches(policy,{apply,rootPressure:status.before.root.availableBytes<policy.minimumRootFreeGiB*1024**3||status.before.root.percent>=policy.warningPercent});
  status.after={root:diskUsage('/'),data:diskUsage(policy.diskRoot)};
  status.level=pressure(policy,status.after.root,status.after.data);
  status.mountsHealthy=true;
  status.note='Backups and OpenClaw cache use persistent data-disk bind mounts. No live database, session, memory, workspace, browser profile, business media or rollback backup is deleted.';
}catch(e){status.level='critical';status.mountsHealthy??=false;status.error=e.message;}
if(apply){fs.mkdirSync(policy.stateRoot,{recursive:true,mode:0o700});writeJsonAtomic(path.join(policy.stateRoot,'status-latest.json'),status);}
console.log(JSON.stringify(status));
// Disk pressure is reported in `level` and alerted by v-sentinel. Failing the unit
// for it made v-storage-governance.service show failed every day since 2026-09-28,
// which hid the real failures (a run that could not verify the mounts).
if(status.error)process.exitCode=2;
