import {DatabaseSync} from 'node:sqlite';
const {t:load}=await import('/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1/core/dist/sqlite-vec-Dt5GyplB.js');
const db=new DatabaseSync('/srv/openclaw-data/disk1/openclaw/memory-repair-probe-20260911/compact-vector-v2.sqlite',{allowExtension:true,readOnly:true});
await load({db});
console.log(JSON.stringify(db.prepare("SELECT name,sql FROM sqlite_master WHERE sql LIKE '%USING vec0%' OR sql LIKE '%using vec0%'").all()));
console.log(JSON.stringify(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%vec%'").all()));
for(const name of ['memory_index_chunks_vec','memory_repair_failed_vec_20260911']){
 try{console.log(name,JSON.stringify(db.prepare(`SELECT size,length(validity) AS bytes,count(*) AS n FROM ${name}_chunks GROUP BY 1,2`).all()));}catch(e){console.log(name,e.message);}
 try{const v=db.prepare(`SELECT embedding FROM ${name} LIMIT 1`).get();console.log(name,'read',v.embedding.length);}catch(e){console.log(name,e.message);}
}
db.close();
