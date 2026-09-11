// Fix only our disposable copy: sqlite-vec blob_open uses hidden rowids, not the declared rowid column.
import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
const boundedDigest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sourcePath='/home/openclaw/.openclaw/agents/makaron/agent/openclaw-agent.sqlite';
const targetPath='/srv/openclaw-data/disk1/openclaw/memory-repair-probe-20260911/compact-vector.sqlite';
assert.notEqual(fs.statSync(sourcePath).dev,fs.statSync(targetPath).dev);
const source=new DatabaseSync(sourcePath,{readOnly:true});const target=new DatabaseSync(targetPath);
const table='memory_index_chunks_vec_vector_chunks00';
try{
 source.exec('PRAGMA query_only=ON; BEGIN');
 for(const name of ['memory_index_chunks_vec_info','memory_index_chunks_vec_rowids']){
  assert.equal(boundedDigest(source.prepare('SELECT * FROM '+name+' ORDER BY 1').all()),boundedDigest(target.prepare('SELECT * FROM '+name+' ORDER BY 1').all()),'Source generation changed: '+name);
 }
 const expected=source.prepare('SELECT _rowid_ AS physical,rowid AS logical,length(vectors) AS bytes FROM '+table+' ORDER BY _rowid_').all();
 const actual=target.prepare('SELECT _rowid_ AS physical,rowid AS logical,length(vectors) AS bytes FROM '+table+' ORDER BY _rowid_').all();
 assert.equal(expected.length,35);assert.equal(actual.length,35);
 for(let i=0;i<35;i++){assert.equal(expected[i].logical,actual[i].logical);assert.equal(expected[i].bytes,actual[i].bytes);}
 source.exec('COMMIT');
 target.exec('BEGIN IMMEDIATE');target.exec('UPDATE '+table+' SET _rowid_=_rowid_+1000000');
 const update=target.prepare('UPDATE '+table+' SET _rowid_=? WHERE _rowid_=?');
 for(let i=0;i<35;i++)update.run(expected[i].physical,actual[i].physical+1000000);
 target.exec('COMMIT');
 assert.equal(JSON.stringify(target.prepare('SELECT _rowid_ AS physical,rowid AS logical,length(vectors) AS bytes FROM '+table+' ORDER BY _rowid_').all()),JSON.stringify(expected));
 console.log(JSON.stringify({event:'private-copy-rowids-corrected',rows:expected.length,lastPhysical:expected.at(-1).physical}));
}finally{source.close();target.close();}
