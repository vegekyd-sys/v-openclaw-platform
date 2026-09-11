import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {processReferences} from '/usr/local/lib/v-storage-governance/core.mjs';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
assert(fs.readFileSync('/proc/self/cgroup','utf8').includes('memory-repair-fixture-cleanup-20260911'));
const root='/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1/core/dist';const {t:load}=await import(root+'/sqlite-vec-Dt5GyplB.js');
const primary='/home/openclaw/.openclaw/agents/makaron/agent/openclaw-agent.sqlite';const live=new DatabaseSync(primary,{readOnly:true,allowExtension:true});assert((await load({db:live})).ok);
assert.equal(live.prepare('SELECT max(size) AS n FROM memory_index_chunks_vec_chunks').get().n,64);
assert(live.prepare("SELECT 1 FROM sqlite_master WHERE name='memory_repair_rollback_vec_20260911'").get());live.close();
const targets=['/home/openclaw/.openclaw/memory-repair-probe-20260911/compact-vector-v2.sqlite','/srv/openclaw-data/disk1/openclaw/memory-repair-probe-20260911/compact-vector.sqlite','/srv/openclaw-data/disk1/openclaw/memory-repair-probe-20260911/compact-vector-v2.sqlite'];
const report={at:new Date().toISOString(),reason:'Private rehearsal copies only; production layout accepted and original live vector storage retained',files:[]};
for(const target of targets){
 assert.equal(fs.realpathSync(target),target);assert.notEqual(fs.statSync(target).ino,fs.statSync(primary).ino);
 assert.equal(processReferences([target]).length,0);
 const db=new DatabaseSync(target,{readOnly:true,allowExtension:true});assert((await load({db})).ok);
 const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);assert(names.every(x=>x.startsWith('memory_')||x.startsWith('sqlite_')));assert(names.includes('memory_index_chunks'));
 db.close();
 for(const suffix of ['','-wal','-shm','-journal','.generation-lock.sqlite','.generation-writer.sqlite']){
  const file=target+suffix;if(!fs.existsSync(file))continue;const s=fs.lstatSync(file);assert(s.isFile()&&s.nlink===1);assert(s.mtimeMs>Date.parse('2026-09-11T00:00:00Z'));report.files.push({path:file,bytes:s.size,allocatedBytes:s.blocks*512,ino:s.ino,dev:s.dev});
 }
}
assert.equal(processReferences(report.files.map(x=>x.path)).length,0);
fs.writeFileSync('/var/lib/v-storage-governance/memory-repair-fixture-cleanup-20260911.json',JSON.stringify(report),{flag:'wx',mode:0o600});
for(const item of report.files){const s=fs.lstatSync(item.path);assert.equal(s.ino,item.ino);assert.equal(s.dev,item.dev);assert.equal(s.size,item.bytes);fs.unlinkSync(item.path);console.log(JSON.stringify({event:'removed-own-fixture',path:item.path,allocatedBytes:item.allocatedBytes}));}
console.log(JSON.stringify({event:'fixture-cleanup-complete',files:report.files.length,allocatedBytes:report.files.reduce((n,x)=>n+x.allocatedBytes,0)}));
