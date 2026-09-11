// Read-only production source; isolated same-host diagnostic copy, never a live index.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
assert(fs.readFileSync('/proc/self/cgroup','utf8').includes('compact-vector-probe-20260911'));
const root='/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1/core/dist';
const primary='/home/openclaw/.openclaw/agents/makaron/agent/openclaw-agent.sqlite';
const folder='/srv/openclaw-data/disk1/openclaw/memory-repair-probe-20260911';
assert.equal(fs.statSync('/srv/openclaw-data/disk1').dev,fs.statSync('/dev/vdb').rdev);
const owner=fs.statSync(primary);fs.mkdirSync(folder,{mode:0o700,recursive:true});assert.equal(fs.realpathSync(folder),folder);fs.chownSync(folder,owner.uid,owner.gid);
process.setgroups([]);process.setgid(owner.gid);process.setuid(owner.uid);
const target=folder+'/compact-vector-v2.sqlite';assert(!fs.existsSync(target));
const source=new DatabaseSync(primary,{readOnly:true,allowExtension:true});
const output=new DatabaseSync(target,{allowExtension:true});
const {t:load}=await import(root+'/sqlite-vec-Dt5GyplB.js');assert((await load({db:source})).ok);assert((await load({db:output})).ok);
const log=x=>console.log(JSON.stringify({at:new Date().toISOString(),...x}));
try{
 source.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000; BEGIN');
 output.exec('PRAGMA cache_size=-8192; PRAGMA journal_mode=DELETE; BEGIN');
 output.exec(source.prepare("SELECT sql FROM sqlite_master WHERE name='memory_index_chunks_vec'").get().sql);
 for(const table of ['memory_index_chunks_vec_info','memory_index_chunks_vec_chunks','memory_index_chunks_vec_rowids','memory_index_chunks_vec_vector_chunks00']){
  output.exec('DELETE FROM '+table);
  const columns=source.prepare('PRAGMA table_info('+table+')').all().map(c=>c.name);assert(columns.every(c=>/^[a-z_0-9]+$/.test(c)));
  const physical=table==='memory_index_chunks_vec_vector_chunks00';
  const insertColumns=physical?['_rowid_',...columns]:columns;
  const insert=output.prepare('INSERT INTO '+table+'('+insertColumns.join(',')+') VALUES('+insertColumns.map(()=>'?').join(',')+')');
  let count=0;for(const row of source.prepare('SELECT '+(physical?'_rowid_ AS physical_rowid,':'')+columns.join(',')+' FROM '+table).iterate()){insert.run(...(physical?[row.physical_rowid]:[]),...columns.map(c=>row[c]));count++;}
  log({event:'copied-shadow',table,count});
 }
 output.exec('CREATE TABLE memory_index_chunks(id TEXT PRIMARY KEY,path TEXT,start_line INTEGER,end_line INTEGER,text TEXT,source TEXT,model TEXT)');
 const insert=output.prepare('INSERT INTO memory_index_chunks VALUES(?,?,?,?,?,?,?)');
 let chunks=0;for(const row of source.prepare('SELECT id,path,start_line,end_line,text,source,model FROM memory_index_chunks').iterate()){insert.run(row.id,row.path,row.start_line,row.end_line,row.text,row.source,row.model);chunks++;}
 source.exec('COMMIT');output.exec('COMMIT');log({event:'compact-copy-complete',chunks,bytes:fs.statSync(target).size,target});
}finally{source.close();output.close();fs.chmodSync(target,0o600);}
