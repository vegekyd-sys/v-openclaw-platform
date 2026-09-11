import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {createHash} from 'node:crypto';
const file='/srv/openclaw-data/disk1/openclaw/memory-repair-probe-20260911/compact-vector-v2.sqlite';
assert.notEqual(fs.statSync(file).dev,fs.statSync('/home/openclaw/.openclaw/agents/makaron/agent/openclaw-agent.sqlite').dev);
const runtime='/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1/core/dist';
const {t:load}=await import(runtime+'/sqlite-vec-Dt5GyplB.js');const {n:knn}=await import(runtime+'/manager-search-knn-NiSMMJUM.js');
const open=async()=>{const d=new DatabaseSync(file,{allowExtension:true});assert((await load({db:d})).ok);d.exec('PRAGMA busy_timeout=1000');return d;};
const digest=x=>createHash('sha256').update(JSON.stringify(x.rows.map(row=>({id:row.id,dist:row.dist})))).digest('hex');
const suffixes=['_info','_chunks','_rowids','_vector_chunks00'];
function rename(d,from,to){
 d.exec(`ALTER TABLE ${from} RENAME TO ${to}`);
 for(const suffix of suffixes)d.exec(`ALTER TABLE ${from}${suffix} RENAME TO ${to}${suffix}`);
}
let a,b,c,swapped=false;
try{
 const repair=await open();
 if(repair.prepare("SELECT 1 FROM sqlite_master WHERE name='memory_repair_candidate_vec_20260911_chunks'").get()){
  repair.exec('BEGIN IMMEDIATE');for(const suffix of suffixes)repair.exec(`ALTER TABLE memory_repair_candidate_vec_20260911${suffix} RENAME TO memory_repair_failed_vec_20260911${suffix}`);repair.exec('COMMIT');
 }
 repair.close();
 a=await open();const entry=a.prepare('SELECT v.embedding,c.model FROM memory_index_chunks_vec v JOIN memory_index_chunks c ON c.id=v.id LIMIT 1').get();const blob=Buffer.from(entry.embedding);
 const request={vectorTable:'memory_index_chunks_vec',providerModels:[entry.model],queryVec:Array.from(new Float32Array(blob.buffer,blob.byteOffset,3072)),limit:12,snippetMaxChars:700,sourceFilter:{sql:'',params:[]}};
 const baseline=digest(knn(a,request));
 const count=a.prepare('SELECT count(*) AS n FROM memory_index_chunks_vec_rowids').get().n;
 const insert=a.prepare('INSERT INTO memory_index_chunks_vec(id,embedding) VALUES(?,?)');const remove=a.prepare('DELETE FROM memory_index_chunks_vec WHERE id=?');
 b=await open();b.exec('BEGIN IMMEDIATE');rename(b,'memory_index_chunks_vec','memory_repair_rollback_vec_20260911');rename(b,'memory_repair_failed_vec_20260911','memory_index_chunks_vec');b.exec('COMMIT');swapped=true;b.close();b=null;
 c=await open();assert.equal(digest(knn(c,request)),baseline,'Fresh connection rank mismatch');console.log(JSON.stringify({event:'fresh-connection-parity',rows:12}));
 assert.equal(digest(knn(a,request)),baseline,'Existing connection rank mismatch');console.log(JSON.stringify({event:'existing-connection-parity',rows:12}));
 insert.run('memory-repack-connection-canary',blob);
 assert.equal(c.prepare('SELECT count(*) AS n FROM memory_index_chunks_vec_rowids').get().n,count+1);
 const added=c.prepare("SELECT c.size FROM memory_index_chunks_vec_chunks c JOIN memory_index_chunks_vec_rowids r ON c.chunk_id=r.chunk_id WHERE r.id='memory-repack-connection-canary'").get();assert.equal(added.size,64);
 remove.run('memory-repack-connection-canary');assert.equal(c.prepare('SELECT count(*) AS n FROM memory_index_chunks_vec_rowids').get().n,count);
 console.log(JSON.stringify({event:'existing-prepared-writes-follow-new-table',count,chunkSize:64}));
}catch(error){
 console.log(JSON.stringify({event:'connection-test-failed',error:error.message}));
 if(swapped){const restore=await open();try{restore.exec('BEGIN IMMEDIATE');rename(restore,'memory_index_chunks_vec','memory_repair_failed_vec_20260911');rename(restore,'memory_repair_rollback_vec_20260911','memory_index_chunks_vec');restore.exec('COMMIT');}finally{restore.close();}}
 throw error;
}finally{a?.close();b?.close();c?.close();}
