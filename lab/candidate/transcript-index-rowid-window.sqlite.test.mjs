import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {setImmediate as yieldTurn, setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';

const data = process.env.VLAB_CANDIDATE_DATA;
const dist = path.join(process.env.VLAB_CANDIDATE_RUNTIME ?? '', 'openclaw/dist');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const tableDigest = (db, sql) => {const hash=createHash('sha256');for(const row of db.prepare(sql).iterate()) hash.update(JSON.stringify(row)+'\n');return hash.digest('hex');};
const percentile = (values, fraction) => [...values].sort((a,b)=>a-b)[Math.min(values.length-1, Math.floor(values.length*fraction))];

async function startReaders(file, db, target) {
  const control=new Int32Array(new SharedArrayBuffer(4));
  const owners=db.prepare('SELECT session_id FROM session_transcript_index_state WHERE session_id<>? LIMIT 12').all(target).map(r=>r.session_id);
  const ids=db.prepare('SELECT rowid AS id FROM session_transcript_fts LIMIT 12').all().map(r=>r.id);
  const workers=Array.from({length:12},(_,i)=>new Worker(`
    const {parentPort,workerData}=require('node:worker_threads');
    const {DatabaseSync}=require('node:sqlite');
    const db=new DatabaseSync(workerData.file,{readOnly:true});
    const control=new Int32Array(workerData.control);
    const active=db.prepare('SELECT event_seq FROM session_transcript_active_events WHERE session_id=? ORDER BY active_position LIMIT 64');
    const fts=db.prepare('SELECT text FROM session_transcript_fts WHERE rowid=?');
    let reads=0; parentPort.postMessage({ready:true});
    while(Atomics.load(control,0)===0) Atomics.wait(control,0,0);
    while(Atomics.load(control,0)===1) {
      active.all(workerData.owner); fts.get(workerData.id); reads+=2;
      Atomics.wait(control,0,1,10);
    }
    db.close();parentPort.postMessage({reads});
  `,{eval:true,workerData:{file,control:control.buffer,owner:owners[i%owners.length],id:ids[i%ids.length]},execArgv:['--no-warnings']}));
  const exits=workers.map(w=>once(w,'exit'));
  await Promise.all(workers.map(w=>once(w,'message')));
  const started=performance.now();
  Atomics.store(control,0,1);Atomics.notify(control,0);
  return async()=>{
    const done=workers.map(async (w,i)=>{const [message]=await once(w,'message');await exits[i];return message.reads;});
    Atomics.store(control,0,2);Atomics.notify(control,0);
    const reads=(await Promise.all(done)).reduce((a,b)=>a+b,0);
    return {concurrentReaders:12,backgroundReads:reads,backgroundReadsPerSecond:Math.round(reads*1000/(performance.now()-started))};
  };
}

test('actual complete FTS projection: bounded scan keeps native deletion results and reduces main-thread stalls', {timeout: 170000}, async () => {
  assert(data && dist.startsWith(process.env.VLAB_CANDIDATE_RUNTIME));
  console.log(execFileSync('python3', [new URL('./transcript-index-rowid-snapshot.py', import.meta.url).pathname], {encoding:'utf8',timeout:125000}));
  const meta = JSON.parse(fs.readFileSync(path.join(data,'transcript-index.metadata.json')));
  const baselinePath = path.join(dist,'transcript-index-rowid-baseline.mjs');
  fs.copyFileSync(new URL('../release-files/transcript-index-prepare/session-transcript-index-9itOio9h.js', import.meta.url), baselinePath);
  const baseline = await import(pathToFileURL(baselinePath));
  const candidate = await import(pathToFileURL(path.join(dist,'session-transcript-index-9itOio9h.js')));
  const claim = -987654;
  const results = [];
  const checksums = [];
  // Each run starts from identical real FTS segments and commits each bounded
  // chunk, as the reconciler does. Never hold one write transaction across yields.
  let db;
  try {
    for (const [name, implementation, cursorMode] of [['before', baseline, false], ['after', candidate, true], ['before-repeat',baseline,false],['after-repeat',candidate,true],['before-readers12',baseline,false],['after-readers12',candidate,true]]) {
      const runFile=path.join(data,'projection-run.sqlite');
      fs.copyFileSync(meta.file,runFile);
      db=new DatabaseSync(runFile);
      db.exec('PRAGMA foreign_keys=OFF; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000');
      db.prepare('UPDATE session_transcript_index_state SET needs_rebuild=1,updated_at=? WHERE session_id=?').run(claim,meta.sessionId);
      const stopReaders=name.includes('readers12')?await startReaders(runFile,db,meta.sessionId):undefined;
      let result = {hasMore:true,owned:true,ftsAfterRowid:null}, batches=0;
      const batchMs=[], callbackMs=[];
      const start=performance.now();
      while(result.hasMore && result.owned) {
        const at=performance.now();
        const foreground=new Promise(resolve=>setTimeout(()=>{db.prepare('SELECT session_id FROM session_transcript_index_state WHERE session_id=?').get(meta.sessionId);resolve(performance.now()-at);},0));
        db.exec('BEGIN IMMEDIATE');
        result=implementation.p(db,{sessionId:meta.sessionId,claimId:claim,maxRowsPerTable:512,...cursorMode?{ftsAfterRowid:result.ftsAfterRowid}:{}});
        db.exec('COMMIT');
        batchMs.push(performance.now()-at);batches++;
        await yieldTurn();callbackMs.push(await foreground);
        assert(batches < 100000, 'cursor must advance and terminate');
      }
      const totalMs=performance.now()-start;
      // Equal-duration load windows avoid making reader throughput depend on
      // the much shorter deletion phase or worker shutdown overhead.
      if(stopReaders) await delay(Math.max(0,2000-(performance.now()-start)));
      const background=stopReaders?await stopReaders():{concurrentReaders:0};
      assert.equal(result.owned,true);
      assert.equal(db.prepare('SELECT count(*) AS n FROM session_transcript_fts WHERE session_id=?').get(meta.sessionId).n,0);
      assert.equal(db.prepare('SELECT count(*) AS n FROM session_transcript_active_events WHERE session_id=?').get(meta.sessionId).n,0);
      checksums.push(digest({fts:tableDigest(db,'SELECT rowid AS id,* FROM session_transcript_fts ORDER BY rowid'),active:tableDigest(db,'SELECT * FROM session_transcript_active_events ORDER BY session_id,active_position'),state:tableDigest(db,'SELECT * FROM session_transcript_index_state ORDER BY session_id')}));
      results.push({name,...background,batches,totalMs:Math.round(totalMs),maxBatchMs:Math.round(Math.max(...batchMs)),p95BatchMs:Math.round(percentile(batchMs,.95)),maxForegroundReadMs:Math.round(Math.max(...callbackMs)),rowsPerSecond:Math.round(meta.targetFtsRows*1000/totalMs)});
      db.close(); db=undefined;
      for(const suffix of ['', '-wal', '-shm']) fs.rmSync(runFile+suffix,{force:true});
    }
    assert(checksums.every(x=>x===checksums[0]),'full FTS/active/state output must be identical');
    // Generation/claim fences are still the first operation, including after a
    // cursor has already advanced. No later claim's rows may be deleted.
    db=new DatabaseSync(meta.file);
    const old=candidate.p(db,{sessionId:meta.sessionId,claimId:claim,maxRowsPerTable:512,ftsAfterRowid:null});
    assert.deepEqual(old,{hasMore:false,owned:false});
    console.log(JSON.stringify({kind:'real-fts-rowid-window',ftsRows:meta.ftsRows,targetFtsRows:meta.targetFtsRows,snapshotBytes:meta.snapshotBytes,allOutputChecksumsEqual:true,results,modelCalls:0,toolCalls:0,sharedGatewayTested:false}));
    const before=results.filter(r=>r.name.startsWith('before')&&r.concurrentReaders===0),after=results.filter(r=>r.name.startsWith('after')&&r.concurrentReaders===0);
    assert(Math.max(...after.map(r=>r.p95BatchMs)) < Math.min(...before.map(r=>r.p95BatchMs))/3, 'must improve typical main-thread blocking');
    assert(after.reduce((n,r)=>n+r.totalMs,0)<before.reduce((n,r)=>n+r.totalMs,0),'must not trade bounded scans for lower rebuild throughput');
  } finally {if(db?.isTransaction) db.exec('ROLLBACK');db?.close();}
});


test('native cursor preserves signed 64-bit rowids, ownership loss, and the legacy caller contract', async () => {
  const native=await import(pathToFileURL(path.join(dist,'session-transcript-index-9itOio9h.js')));
  const file=path.join(data,'rowid-corners.sqlite'),db=new DatabaseSync(file);
  try {
    db.exec(`CREATE TABLE session_transcript_index_state(session_id TEXT PRIMARY KEY,needs_rebuild INTEGER,updated_at INTEGER);
      CREATE TABLE session_transcript_active_events(session_id TEXT,active_position INTEGER,PRIMARY KEY(session_id,active_position));
      CREATE VIRTUAL TABLE session_transcript_fts USING fts5(text,session_id UNINDEXED,message_id UNINDEXED,role UNINDEXED,timestamp UNINDEXED);
      INSERT INTO session_transcript_index_state VALUES('target',1,-7);`);
    const insert=db.prepare('INSERT INTO session_transcript_fts(rowid,text,session_id,message_id,role,timestamp) VALUES(?,?,?,?,?,?)');
    insert.setReadBigInts(true);
    for(const [id,owner] of [[-9n,'other'],[-4n,'target'],[0n,'target'],[2n,'other'],[3n,'other'],[9007199254740992n,'target'],[9223372036854775806n,'target']]) insert.run(id,'actual native fts',owner,String(id),'user',1);
    let result={hasMore:true,owned:true,ftsAfterRowid:null},calls=0;
    while(result.hasMore) {
      const previous=result.ftsAfterRowid;
      db.exec('BEGIN IMMEDIATE');
      result=native.p(db,{sessionId:'target',claimId:-7,maxRowsPerTable:2,ftsAfterRowid:previous});
      db.exec('COMMIT');
      assert(result.ftsAfterRowid===previous || previous===null || result.ftsAfterRowid>previous);
      assert(++calls<10);
    }
    assert.equal(db.prepare("SELECT count(*) AS n FROM session_transcript_fts WHERE session_id='target'").get().n,0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM session_transcript_fts WHERE session_id='other'").get().n,3);
    db.exec("INSERT INTO session_transcript_fts(text,session_id) VALUES('new','target'); UPDATE session_transcript_index_state SET updated_at=-8 WHERE session_id='target'");
    assert.deepEqual(native.p(db,{sessionId:'target',claimId:-7,maxRowsPerTable:2,ftsAfterRowid:null}),{hasMore:false,owned:false});
    assert.equal(db.prepare("SELECT count(*) AS n FROM session_transcript_fts WHERE session_id='target'").get().n,1);
    const first=native.p(db,{sessionId:'target',claimId:-8,maxRowsPerTable:1,ftsAfterRowid:null});
    assert.equal(first.hasMore,true);
    db.exec("UPDATE session_transcript_index_state SET updated_at=-9 WHERE session_id='target'");
    assert.deepEqual(native.p(db,{sessionId:'target',claimId:-8,maxRowsPerTable:1,ftsAfterRowid:first.ftsAfterRowid}),{hasMore:false,owned:false});
    assert.equal(db.prepare("SELECT count(*) AS n FROM session_transcript_fts WHERE session_id='target'").get().n,1);
    // A caller that has not opted into the cursor keeps deleting matching rows
    // per call, without having to carry the new continuation field.
    const legacy=native.p(db,{sessionId:'target',claimId:-9,maxRowsPerTable:2});
    assert.deepEqual(legacy,{hasMore:false,owned:true});
    db.exec("INSERT INTO session_transcript_fts(session_transcript_fts) VALUES('integrity-check')");
  } finally {db.close();}
});
