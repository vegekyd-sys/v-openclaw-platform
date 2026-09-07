import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {isMemoryProvenanceBackfillComplete as ready} from './fast-path.mjs';
import {patchProvenance} from '../../scripts/patch-db91-memory-provenance.mjs';
const native=fs.readFileSync('/private/tmp/db91-memory-schema-BSs9MQgq.js','utf8');
const region=native.slice(native.indexOf('const MEMORY_INDEX_CHUNK_PROVENANCE_TABLE'),native.indexOf('//#endregion'));
const nativeFactory=new Function('db91ProvenanceComplete','runSqliteImmediateTransactionSync',region+'\nreturn {ensure:ensureMemoryChunkProvenance,schema:MEMORY_INDEX_CHUNK_PROVENANCE_SCHEMA_SQL};');
const on={OPENCLAW_DB91_PROVENANCE_ENABLE:'1'};
function fixture(patched=false) {
  const db=new DatabaseSync(':memory:');db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE memory_index_sources(path TEXT,source TEXT,hash TEXT);
    CREATE TABLE memory_index_chunks(id TEXT PRIMARY KEY,path TEXT,source TEXT,updated_at INTEGER,body TEXT);
    INSERT INTO memory_index_sources VALUES('a',NULL,'hash-a'),('b','sessions','hash-b');
    INSERT INTO memory_index_chunks VALUES('a','a',NULL,10,'payload-a'),('b','b','sessions',20,'payload-b');`);
  let transactions=0;
  const factory=patched?new Function('db91ProvenanceComplete','runSqliteImmediateTransactionSync',region.replace('function ensureMemoryChunkProvenance(db) {','function ensureMemoryChunkProvenance(db) {\n if (db91ProvenanceComplete(db, MEMORY_INDEX_CHUNK_PROVENANCE_SCHEMA_SQL)) return;')+'\nreturn {ensure:ensureMemoryChunkProvenance,schema:MEMORY_INDEX_CHUNK_PROVENANCE_SCHEMA_SQL};'):nativeFactory;
  const {ensure,schema}=factory((db,sql)=>ready(db,sql,on),(d,fn)=>{transactions++;d.exec('BEGIN IMMEDIATE');try{fn();d.exec('COMMIT');}catch(e){d.exec('ROLLBACK');throw e;}});
  return {db,ensure,schema,transactions:()=>transactions};
}
test('disabled fast path performs no queries',()=>assert.equal(ready({prepare(){throw Error('unexpected');}},'',{}),false));
test('patched native function skips only completed backfills and repairs later gaps',()=>{
  const f=fixture(true);f.ensure(f.db);assert.equal(f.transactions(),1);
  f.ensure(f.db);f.ensure(f.db);assert.equal(f.transactions(),1);
  f.db.exec("DELETE FROM memory_index_chunk_provenance WHERE chunk_id='b'");
  f.ensure(f.db);assert.equal(f.transactions(),2);assert.equal(ready(f.db,f.schema,on),true);f.db.close();
});
test('missing table and missing provenance must run native backfill',()=>{
  const f=fixture();assert.equal(ready(f.db,f.schema,on),false);f.ensure(f.db);
  assert.equal(ready(f.db,f.schema,on),true);
  assert.deepEqual(f.db.prepare('SELECT origin_class,session_kind FROM memory_index_chunk_provenance').all().map(r=>({...r})),[{origin_class:'untrusted',session_kind:'unknown'},{origin_class:'untrusted',session_kind:'unknown'}]);
  assert(f.db.prepare('SELECT hash FROM memory_index_sources').all().every(r=>r.hash===''));
  f.db.close();
});
test('complete native schema uses read-only fast check with covering indexes and no mutation',()=>{
  const f=fixture();f.ensure(f.db);const changes=f.db.prepare('SELECT total_changes() n').get().n;
  f.db.exec('PRAGMA query_only=ON');assert.equal(ready(f.db,f.schema,on),true);
  assert.equal(f.db.prepare('SELECT total_changes() n').get().n,changes);f.db.close();
});
test('later missing rows are detected, sources invalidated, trusted existing provenance preserved',()=>{
  const f=fixture();f.ensure(f.db);
  f.db.exec("UPDATE memory_index_chunk_provenance SET origin_class='owner',session_kind='interactive' WHERE chunk_id='a'; UPDATE memory_index_sources SET hash='current'; DELETE FROM memory_index_chunk_provenance WHERE chunk_id='b';");
  assert.equal(ready(f.db,f.schema,on),false);f.ensure(f.db);
  assert.equal(f.db.prepare("SELECT origin_class FROM memory_index_chunk_provenance WHERE chunk_id='a'").get().origin_class,'owner');
  assert.equal(f.db.prepare("SELECT hash FROM memory_index_sources WHERE path='a'").get().hash,'current');
  assert.equal(f.db.prepare("SELECT hash FROM memory_index_sources WHERE path='b'").get().hash,'');
  assert.equal(ready(f.db,f.schema,on),true);f.db.close();
});
test('legacy or unknown provenance triggers prevent skipping original semantics',()=>{
  const f=fixture();f.ensure(f.db);f.db.exec('CREATE TRIGGER memory_index_chunk_provenance_after_insert AFTER INSERT ON memory_index_chunks BEGIN SELECT 1; END;');
  assert.equal(ready(f.db,f.schema,on),false);f.ensure(f.db);assert.equal(ready(f.db,f.schema,on),true);
  f.db.exec('CREATE TRIGGER custom_p AFTER INSERT ON memory_index_chunk_provenance BEGIN SELECT 1; END;');
  assert.equal(ready(f.db,f.schema,on),false);f.db.close();
});
test('unexpected schema is never certified and foreign keys remain enforced',()=>{
  const f=fixture();f.ensure(f.db);assert.equal(ready(f.db,f.schema.replace('STRICT',''),on),false);
  assert.throws(()=>f.db.exec("INSERT INTO memory_index_chunk_provenance VALUES('absent','untrusted','unknown',1,NULL)"));f.db.close();
});
test('patch only adds a conditional no-op before the exact original implementation',()=>{
  const after=patchProvenance(native);assert(after.includes(region.replace('function ensureMemoryChunkProvenance(db) {','function ensureMemoryChunkProvenance(db) {\n\tif (db91ProvenanceComplete(db, MEMORY_INDEX_CHUNK_PROVENANCE_SCHEMA_SQL)) return;')));
  assert.throws(()=>patchProvenance(after));assert.throws(()=>patchProvenance(native.replace('function ensureMemoryChunkProvenance(db) {','function drift(db) {')));
});
test('FTS initialization acquires writer before schema reads and preserves native backfill and triggers',()=>{
  const source=patchProvenance(native).replace(/^import .*\n/gm,'').replace(/^export .*$/gm,'');
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE memory_index_sources(id INTEGER PRIMARY KEY,path TEXT,source TEXT);
    CREATE TABLE memory_index_chunks(id TEXT PRIMARY KEY,text TEXT,path TEXT,source TEXT,model TEXT,start_line INTEGER,end_line INTEGER);
    INSERT INTO memory_index_sources VALUES(1,'test-path','memory');
    INSERT INTO memory_index_chunks VALUES('a','hello search','test-path','memory','model',1,2);`);
  const scopes=[];
  const run=(d,fn,options)=>{scopes.push(options.operationLabel);d.exec('BEGIN IMMEDIATE');try{const value=fn();d.exec('COMMIT');return value;}catch(e){d.exec('ROLLBACK');throw e;}};
  const factory=new Function('runSqliteImmediateTransactionSync','db91ProvenanceComplete',source+'\nreturn {body:ensureMemoryChunkFtsSchema,path:ensureMemoryPathFtsSchema};');
  const methods=factory(run,()=>false),before=process.env.OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE;
  process.env.OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE='1';
  try {
    methods.body({db,ftsTable:'memory_index_chunks_fts',tokenizeClause:''});
    methods.path({db,tokenizeClause:''});
    assert.deepEqual(scopes,['memory.fts.ensure-body','memory.fts.ensure-path']);
    assert.equal(db.prepare("SELECT count(*) n FROM memory_index_chunks_fts WHERE memory_index_chunks_fts MATCH 'hello'").get().n,1);
    db.exec("INSERT INTO memory_index_sources VALUES(2,'later-path','memory')");
    assert.equal(db.prepare('SELECT count(*) n FROM memory_index_paths_fts').get().n,2);
    methods.body({db,ftsTable:'memory_index_chunks_fts',tokenizeClause:''});
    assert.equal(db.prepare('SELECT count(*) n FROM memory_index_chunks_fts').get().n,1);
    db.exec('BEGIN IMMEDIATE');methods.path({db,tokenizeClause:''});db.exec('COMMIT');
    assert.equal(scopes.length,3,'existing outer transaction must not acquire a second BEGIN');
  } finally {if(before===undefined)delete process.env.OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE;else process.env.OPENCLAW_DB91_MEMORY_SCHEMA_ENABLE=before;db.close();}
});
