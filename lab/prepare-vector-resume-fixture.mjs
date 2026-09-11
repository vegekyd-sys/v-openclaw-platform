import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('/srv/openclaw-data/disk1/openclaw/memory-repair-probe-20260911/compact-vector-v2.sqlite',{allowExtension:true});
const {t:load}=await import('/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1/core/dist/sqlite-vec-Dt5GyplB.js');assert((await load({db})).ok);
function rename(from,to){db.exec(`ALTER TABLE ${from} RENAME TO ${to}`);for(const s of ['_info','_chunks','_rowids','_vector_chunks00'])db.exec(`ALTER TABLE ${from}${s} RENAME TO ${to}${s}`);}
db.exec('BEGIN IMMEDIATE');
try{rename('memory_index_chunks_vec','memory_repair_candidate_vec_20260911');rename('memory_repair_rollback_vec_20260911','memory_index_chunks_vec');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
db.close();
const d=new DatabaseSync('/srv/openclaw-data/disk1/openclaw/memory-repair-probe-20260911/compact-vector-v2.sqlite',{allowExtension:true});assert((await load({db:d})).ok);
const rows=d.prepare('SELECT id,embedding FROM memory_repair_candidate_vec_20260911 LIMIT 2').all();assert.equal(rows.length,2);
const changed=Buffer.from(rows[0].embedding);changed.writeFloatLE(changed.readFloatLE(0)+0.1,0);
d.exec('BEGIN IMMEDIATE');d.prepare('DELETE FROM memory_repair_candidate_vec_20260911 WHERE id=?').run(rows[0].id);d.prepare('DELETE FROM memory_repair_candidate_vec_20260911 WHERE id=?').run(rows[1].id);
const insert=d.prepare('INSERT INTO memory_repair_candidate_vec_20260911(id,embedding) VALUES(?,?)');insert.run(rows[0].id,changed);insert.run('memory-resume-stale-canary',rows[1].embedding);d.exec('COMMIT');
console.log(JSON.stringify({event:'resume-fixture-prepared',changed:1,missing:1,stale:1}));d.close();
