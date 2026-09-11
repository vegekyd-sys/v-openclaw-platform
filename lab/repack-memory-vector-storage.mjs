// Data-layout repair only. The source vector table remains selected until verified publication.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';

const runtime='/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1/core/dist';
const primary='/home/openclaw/.openclaw/agents/makaron/agent/openclaw-agent.sqlite';
const smallChunks=process.argv.includes('--small-chunks');
const resumeStaged=process.argv.includes('--resume-staged');
assert(!resumeStaged||smallChunks,'Only native small-chunk staging can be resumed');
const fixture=smallChunks?'/srv/openclaw-data/disk1/openclaw/memory-repair-probe-20260911/compact-vector-v2.sqlite':'/home/openclaw/.openclaw/memory-repair-probe-20260911/compact-vector-v2.sqlite';
const current='memory_index_chunks_vec';
const candidate='memory_repair_candidate_vec_20260911';
const rollback='memory_repair_rollback_vec_20260911';
const production=process.argv.includes('--production-apply');
assert(production||process.argv.includes('--fixture'));
assert(!production||smallChunks,'Production requires bounded small-chunk transactions');
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
assert(fs.readFileSync('/proc/self/cgroup','utf8').includes(production?'memory-vector-repack-production-20260911':'memory-vector-repack-fixture-20260911'));
const databasePath=production?primary:fixture;
const owner=fs.statSync(databasePath);
let workspace;
if(production){
 const pid=Number(execFileSync('systemctl',['show','openclaw-gateway','-p','MainPID','--value'],{encoding:'utf8'}));assert(pid>1);
 const env=Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
 Object.assign(process.env,env);
 const cfg=JSON.parse(fs.readFileSync('/home/openclaw/.openclaw/openclaw.json','utf8').replace(/\$\{([^}]+)\}/g,(all,key)=>env[key]===undefined?all:JSON.stringify(env[key]).slice(1,-1)));
 assert.equal(cfg.gateway.port,22793);
 const {m:resolveWorkspace}=await import(runtime+'/agent-scope-config-CUiGBd59.js');workspace=resolveWorkspace(cfg,'makaron');
}
process.setgroups([]);process.setgid(owner.gid);process.setuid(owner.uid);
const {t:load}=await import(runtime+'/sqlite-vec-Dt5GyplB.js');
const {n:runKnn}=await import(runtime+'/manager-search-knn-NiSMMJUM.js');
const helpers=await import(runtime+'/manager-vector-warning-BHH19jrh.js');
const {l:withWorkspaceLock}=await import(runtime+'/dreaming-dreams-file-DkDa0rC_.js');
if(production){
 const {p:configure}=await import(runtime+'/dreaming-state-B0qd2W7q.js');
 const {n:createStore}=await import(runtime+'/plugin-state-store-PhQA2Nhh.js');
 const {o:statePath}=await import(runtime+'/openclaw-state-db.paths-Dwj4ZWNN.js');
 assert(statePath(process.env).startsWith('/home/openclaw/.openclaw/'));
 configure(options=>createStore('memory-core',{...options,env:process.env}));
 // Validate the native lock provider before starting any costly staging work.
 await withWorkspaceLock(workspace,async()=>{});
 if(process.argv.includes('--verify-locks-only')){
  const probeLock=await helpers._(databasePath);
  try{await withWorkspaceLock(workspace,()=>helpers.y(databasePath,async()=>{}));console.log(JSON.stringify({event:'native-reindex-workspace-generation-locks-verified'}));}finally{probeLock.release();}
  process.exit(0);
 }
}
const db=new DatabaseSync(databasePath,{allowExtension:true});assert((await load({db})).ok);
if(smallChunks&&!production)db.exec('PRAGMA journal_mode=WAL');
db.exec('PRAGMA busy_timeout=1000; PRAGMA cache_size=-8192; PRAGMA wal_autocheckpoint=0');
const journal=db.prepare('PRAGMA journal_mode').get().journal_mode;
if(production)assert.equal(journal,'wal');
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const blobDigest=value=>createHash('sha256').update(value).digest('hex');
const started=performance.now();
const report={production,databasePath,startedAt:new Date().toISOString(),phases:[]};
const receipt='/srv/openclaw-data/disk1/openclaw/memory-repair-probe-20260911/'+(production?'production':'fixture')+(smallChunks?'-small':'')+'-repack-receipt-'+Date.now()+'.json';
assert(!fs.existsSync(receipt));
function log(event){const item={elapsedMs:Math.round(performance.now()-started),...event};report.phases.push(item);console.log(JSON.stringify(item));fs.writeFileSync(receipt,JSON.stringify(report,null,2),{mode:0o600});}
function immediate(run){const at=performance.now();db.exec('BEGIN IMMEDIATE');const heldAt=performance.now();try{const value=run();db.exec('COMMIT');return {value,ms:Math.round(performance.now()-at),holdMs:Math.round(performance.now()-heldAt)};}catch(error){db.exec('ROLLBACK');throw error;}}
function checkpoint(quiet=false){if(journal!=='wal')return;const at=performance.now();const state=db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get();if(!quiet)log({event:'checkpoint',ms:Math.round(performance.now()-at),state});}
const tableExists=name=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
function renameVectorTable(from,to){
 db.exec(`ALTER TABLE ${from} RENAME TO ${to}`);
 // This sqlite-vec build does not rename shadow storage in xRename.
 for(const suffix of ['_info','_chunks','_rowids','_vector_chunks00'])db.exec(`ALTER TABLE ${from}${suffix} RENAME TO ${to}${suffix}`);
}
const nativeRequest=table=>{
 const entry=db.prepare(`SELECT v.embedding,c.model FROM ${table} v JOIN memory_index_chunks c ON c.id=v.id LIMIT 1`).get();assert(entry);
 const bytes=Buffer.from(entry.embedding);assert.equal(bytes.byteLength,3072*4);
 return {vectorTable:table,providerModels:[entry.model],queryVec:Array.from(new Float32Array(bytes.buffer,bytes.byteOffset,3072)),limit:12,snippetMaxChars:700,sourceFilter:{sql:'',params:[]}};
};
let lock;
let published=false;
let expectedRevision;
try{
 if(production)lock=await helpers._(databasePath);
 assert(!tableExists(rollback),'Rollback table already exists; inspect instead of overwriting');
 assert.equal(tableExists(candidate),resumeStaged,'Candidate presence does not match explicit resume mode');
 const revision=production?helpers.p(db):null;
 expectedRevision=revision;
 const sourceCount=db.prepare(`SELECT count(*) AS n FROM ${current}_rowids`).get().n;
 assert(sourceCount>30000&&sourceCount<40000);
 const sourceSql=db.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(current).sql;
 assert(sourceSql.includes('embedding FLOAT[3072]'));assert.equal(sourceSql.split(current).length,2);
 const request=nativeRequest(current);
 log({event:'source-verified',revision,sourceCount,journal});
 assert(!sourceSql.includes('chunk_size'),'Source has already been assigned an explicit vector chunk layout');
 if(!resumeStaged)immediate(()=>db.exec(sourceSql.replace(current,candidate).replace('embedding FLOAT[3072]',smallChunks?'embedding FLOAT[3072],\n chunk_size=64':'embedding FLOAT[3072]')));
 const suffixes=['_info','_chunks','_rowids'];const metaDigests={};
 let copiedBytes=0;
 if(smallChunks){
  for(const suffix of suffixes)metaDigests[suffix]=digest(db.prepare('SELECT * FROM '+current+suffix+' ORDER BY 1').all());
  const mapping=db.prepare(`SELECT rowid,id,chunk_id,chunk_offset FROM ${current}_rowids ORDER BY chunk_id,chunk_offset`).all();
  assert.equal(mapping.length,sourceCount);
  const groups=new Map();for(const row of mapping){if(!groups.has(row.chunk_id))groups.set(row.chunk_id,[]);groups.get(row.chunk_id).push(row);}
  const hashes=new Map(),insert=db.prepare(`INSERT INTO ${candidate}(id,embedding) VALUES(?,?)`);
  const previousHashes=new Map(),remove=db.prepare(`DELETE FROM ${candidate} WHERE id=?`);
  if(resumeStaged){
   assert(db.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(candidate).sql.includes('chunk_size=64'));
   const previousRows=db.prepare(`SELECT id,chunk_id,chunk_offset FROM ${candidate}_rowids ORDER BY chunk_id,chunk_offset`).all();
   const previousGroups=new Map();for(const row of previousRows){if(!previousGroups.has(row.chunk_id))previousGroups.set(row.chunk_id,[]);previousGroups.get(row.chunk_id).push(row);}
   for(const [chunkId,rows] of previousGroups){const blob=db.prepare(`SELECT vectors FROM ${candidate}_vector_chunks00 WHERE _rowid_=?`).get(chunkId).vectors;assert.equal(blob.byteLength,64*12288);for(const row of rows)previousHashes.set(row.id,blobDigest(Buffer.from(blob.buffer,blob.byteOffset+row.chunk_offset*12288,12288)));}
   log({event:'staged-vectors-loaded',count:previousHashes.size});
  }
  let completed=0,maxHoldMs=0,groupNumber=0;
  for(const [chunkId,rows] of groups){
   const blob=db.prepare(`SELECT vectors FROM ${current}_vector_chunks00 WHERE _rowid_=?`).get(chunkId).vectors;
   const info=db.prepare(`SELECT size,validity,rowids FROM ${current}_chunks WHERE chunk_id=?`).get(chunkId);
   const rowids=Buffer.from(info.rowids);
   const vectors=rows.map(row=>{
    assert(row.chunk_offset>=0&&row.chunk_offset<info.size);
    assert((info.validity[row.chunk_offset>>3]>>(row.chunk_offset&7))&1);
    assert.equal(rowids.readBigInt64LE(row.chunk_offset*8),BigInt(row.rowid));
    const bytes=Buffer.from(blob.buffer,blob.byteOffset+row.chunk_offset*12288,12288);hashes.set(row.id,blobDigest(bytes));return {id:row.id,bytes};
   });
   for(let index=0;index<vectors.length;index+=16){
    const batch=vectors.slice(index,index+16),changed=batch.filter(item=>previousHashes.get(item.id)!==hashes.get(item.id));
    const result=changed.length?immediate(()=>{for(const item of changed){if(previousHashes.has(item.id))remove.run(item.id);insert.run(item.id,item.bytes);}}):{ms:0,holdMs:0};
    for(const item of batch)previousHashes.delete(item.id);
    maxHoldMs=Math.max(maxHoldMs,result.holdMs);completed+=batch.length;copiedBytes+=batch.length*12288;
    if(index%64===0)checkpoint(true);
    if(production)assert(result.holdMs<1500,'Stopping staging after an excessive shared write hold');
    await new Promise(resolve=>setTimeout(resolve,15));
   }
   checkpoint(true);log({event:'small-chunk-copy-progress',block:++groupNumber,total:groups.size,completed,maxWriteHoldMs:maxHoldMs});
  }
  if(previousHashes.size){const stale=[...previousHashes.keys()];for(let index=0;index<stale.length;index+=16){const result=immediate(()=>{for(const id of stale.slice(index,index+16))remove.run(id);});maxHoldMs=Math.max(maxHoldMs,result.holdMs);if(production)assert(result.holdMs<1500,'Stopping after excessive stale-entry write hold');checkpoint(true);}log({event:'stale-staged-entries-removed',count:stale.length});}
  const targetMapping=db.prepare(`SELECT id,chunk_id,chunk_offset FROM ${candidate}_rowids ORDER BY chunk_id,chunk_offset`).all();
  assert.equal(targetMapping.length,sourceCount);const targetGroups=new Map();for(const row of targetMapping){if(!targetGroups.has(row.chunk_id))targetGroups.set(row.chunk_id,[]);targetGroups.get(row.chunk_id).push(row);}
  for(const [chunkId,rows] of targetGroups){
   const blob=db.prepare(`SELECT vectors FROM ${candidate}_vector_chunks00 WHERE _rowid_=?`).get(chunkId).vectors;
   assert.equal(blob.byteLength,64*12288);
   for(const row of rows){assert.equal(blobDigest(Buffer.from(blob.buffer,blob.byteOffset+row.chunk_offset*12288,12288)),hashes.get(row.id),'Vector SHA256 mismatch');hashes.delete(row.id);}
  }
  assert.equal(hashes.size,0);log({event:'all-vector-bytes-verified',sourceCount,copiedBytes,targetChunks:targetGroups.size,chunkSize:64,maxWriteHoldMs:maxHoldMs});
 }else{
 for(const suffix of suffixes){
  const source=current+suffix,target=candidate+suffix;
  const columns=db.prepare('PRAGMA table_info('+source+')').all().map(c=>c.name);assert(columns.every(c=>/^[a-z_0-9]+$/.test(c)));
  const rows=db.prepare('SELECT '+columns.join(',')+' FROM '+source+' ORDER BY 1').all();metaDigests[suffix]=digest(rows);
  immediate(()=>db.exec('DELETE FROM '+target));
  const insert=db.prepare('INSERT INTO '+target+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')');
  let maxCommitMs=0;
  for(let index=0;index<rows.length;index+=512){const result=immediate(()=>{for(const row of rows.slice(index,index+512))insert.run(...columns.map(c=>row[c]));});maxCommitMs=Math.max(maxCommitMs,result.ms);await new Promise(resolve=>setTimeout(resolve,15));}
  assert.equal(digest(db.prepare('SELECT '+columns.join(',')+' FROM '+target+' ORDER BY 1').all()),metaDigests[suffix],'Metadata copy mismatch: '+suffix);
  log({event:'metadata-copied',suffix,rows:rows.length,maxCommitMs});checkpoint();
 }
 const sourceBlob=current+'_vector_chunks00',targetBlob=candidate+'_vector_chunks00';
 const physicalRows=db.prepare(`SELECT _rowid_ AS physical,rowid AS declared,length(vectors) AS bytes FROM ${sourceBlob} ORDER BY _rowid_`).all();assert(physicalRows.length<100);
 const readSource=db.prepare(`SELECT vectors FROM ${sourceBlob} WHERE _rowid_=?`),readTarget=db.prepare(`SELECT vectors FROM ${targetBlob} WHERE _rowid_=?`);
 const insertBlob=db.prepare(`INSERT INTO ${targetBlob}(_rowid_,rowid,vectors) VALUES(?,?,?)`);
 for(let index=0;index<physicalRows.length;index++){
  const row=physicalRows[index],data=readSource.get(row.physical).vectors;assert.equal(data.byteLength,row.bytes);
  const sha256=blobDigest(data);const result=immediate(()=>insertBlob.run(row.physical,row.declared,data));
  assert.equal(blobDigest(readTarget.get(row.physical).vectors),sha256,'Vector bytes differ');copiedBytes+=row.bytes;
  log({event:'vector-block-verified',block:index+1,total:physicalRows.length,bytes:row.bytes,commitMs:result.ms});checkpoint();await new Promise(resolve=>setTimeout(resolve,30));
 }
 assert.equal(digest(db.prepare(`SELECT _rowid_ AS physical,rowid AS declared,length(vectors) AS bytes FROM ${targetBlob} ORDER BY _rowid_`).all()),digest(physicalRows));
 }
 if(production)assert.equal(helpers.p(db),revision,'Source changed during staging; publication refused');
 for(const suffix of suffixes)assert.equal(digest(db.prepare('SELECT * FROM '+current+suffix+' ORDER BY 1').all()),metaDigests[suffix],'Source metadata changed');
 const beforeStart=performance.now(),before=runKnn(db,request),beforeMs=Math.round(performance.now()-beforeStart);
 const afterStart=performance.now(),after=runKnn(db,{...request,vectorTable:candidate}),afterMs=Math.round(performance.now()-afterStart);
 assert.equal(before.fallbackScanRequired,false);assert.equal(after.fallbackScanRequired,false);assert.equal(before.rows.length,12);
 assert.equal(digest(before.rows),digest(after.rows),'Native cosine ranking changed');
 log({event:'parity-passed',rows:before.rows.length,copiedBytes,beforeMs,afterMs});
 const publish=async()=>{
  if(production)assert.equal(helpers.p(db),revision,'Source changed before publication');
  const result=immediate(()=>{
   renameVectorTable(current,rollback);
   renameVectorTable(candidate,current);
   assert.equal(db.prepare(`SELECT count(*) AS n FROM ${current}_rowids`).get().n,sourceCount);
  });published=true;log({event:'published',commitMs:result.ms,rollbackTable:rollback,revision});
 };
 if(production)await withWorkspaceLock(workspace,()=>helpers.y(databasePath,publish));else await publish();
 checkpoint();
 const fresh=new DatabaseSync(databasePath,{allowExtension:true,readOnly:true});
 try{assert((await load({db:fresh})).ok);const verification=runKnn(fresh,request);assert.equal(digest(verification.rows),digest(before.rows),'Post-publication parity failed');
  assert.equal(fresh.prepare(`SELECT min(size) AS lo,max(size) AS hi FROM ${current}_chunks`).get().hi,smallChunks?64:1024);
 }finally{fresh.close();}
 log({event:'verified-complete',sourceCount,unchangedRevision:production?helpers.p(db):null});
}catch(error){
 log({event:'failed',error:error.message});
 if(published&&tableExists(rollback)){
  const restore=async()=>{
   if(production)assert.equal(helpers.p(db),expectedRevision,'Cannot roll back over newer index changes');
   immediate(()=>{renameVectorTable(current,'memory_repair_failed_vec_20260911');renameVectorTable(rollback,current);});
   log({event:'automatically-restored-original-vector-table'});
  };
  if(production)await withWorkspaceLock(workspace,()=>helpers.y(databasePath,restore));else await restore();
 }
 throw error;
}finally{lock?.release();db.close();}
