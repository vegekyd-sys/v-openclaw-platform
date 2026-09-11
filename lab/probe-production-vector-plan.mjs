// Isolated read-only SQLite diagnostic; no corpus text or embeddings leave the host.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
assert.equal(os.hostname(),'VM-8-2-ubuntu');
const root='/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1/core/dist';
const databasePath='/home/openclaw/.openclaw/agents/makaron/agent/openclaw-agent.sqlite';
const owner=fs.statSync(databasePath);
process.setgroups([]);process.setgid(owner.gid);process.setuid(owner.uid);
const started=performance.now();
const log=data=>console.log(JSON.stringify({elapsedMs:Math.round(performance.now()-started),...data}));
const db=new DatabaseSync(databasePath,{readOnly:true,allowExtension:true});
try {
  db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000');
  if(process.env.MEMORY_PROBE_MMAP==='1')log({event:'mmap',result:db.prepare('PRAGMA mmap_size=10737418240').get()});
  const {t:load}=await import(root+'/sqlite-vec-Dt5GyplB.js');
  const loaded=await load({db});assert(loaded.ok,loaded.error);log({event:'extension-ready'});
  log({event:'vector-schema',sql:db.prepare("SELECT sql FROM sqlite_master WHERE name='memory_index_chunks_vec'").get()?.sql});
  if(process.env.MEMORY_PROBE_SHADOW==='1')log({event:'shadow-schemas',tables:db.prepare("SELECT name,sql FROM sqlite_master WHERE name LIKE 'memory_index_chunks_vec_%' AND type='table'").all()});
  const row=db.prepare('SELECT model,embedding FROM memory_index_chunks LIMIT 1').get();
  const vector=JSON.parse(row.embedding);const blob=Buffer.from(new Float32Array(vector).buffer);
  const sql=join=>`SELECT c.id, c.path, c.start_line, c.end_line, c.text, c.source, vec_distance_cosine(v.embedding, ?) AS dist FROM memory_index_chunks_vec v ${join} memory_index_chunks c ON c.id=v.id WHERE v.embedding MATCH ? AND k=? AND c.model=? ORDER BY dist ASC LIMIT ?`;
  const bindings=[blob,blob,96,row.model,12];
  for(const join of ['JOIN','CROSS JOIN'])log({event:'plan',join,plan:db.prepare('EXPLAIN QUERY PLAN '+sql(join)).all(...bindings)});
  if(['chunk','compare'].includes(process.env.MEMORY_PROBE_RUN)){
    const candidate=sql('JOIN').replace('vec_distance_cosine(v.embedding, ?)','vec_distance_cosine(vec_f32(c.embedding), ?)');
    let at=performance.now();const changed=db.prepare(candidate).all(...bindings);
    log({event:'chunk-embedding-result',ms:Math.round(performance.now()-at),rows:changed.length,finite:changed.every(x=>Number.isFinite(x.dist))});
    if(process.env.MEMORY_PROBE_RUN==='compare'){
      at=performance.now();const before=db.prepare(sql('JOIN')).all(...bindings);
      log({event:'original-result',ms:Math.round(performance.now()-at),rows:before.length,sameIds:JSON.stringify(before.map(x=>x.id))===JSON.stringify(changed.map(x=>x.id)),maxDistanceDelta:Math.max(...before.map((x,i)=>Math.abs(x.dist-changed[i]?.dist)))});
    }
  }
  if(process.env.MEMORY_PROBE_RUN === 'raw') {
   for(let iteration=0;iteration<Number(process.env.MEMORY_PROBE_REPEAT||1);iteration++){
    const at=performance.now();
    const rows=db.prepare('SELECT id,distance FROM memory_index_chunks_vec WHERE embedding MATCH ? AND k=? ORDER BY distance').all(blob,12);
    log({event:'raw-knn-result',iteration,ms:Math.round(performance.now()-at),rows:rows.length});
   }
  }
  if(process.env.MEMORY_PROBE_RUN === '1') {
    const at=performance.now();
    const rows=db.prepare(sql('CROSS JOIN')).all(...bindings);
    log({event:'cross-join-result',ms:Math.round(performance.now()-at),rows:rows.length,finite:rows.every(x=>Number.isFinite(x.dist))});
  }
} finally {db.close();}
