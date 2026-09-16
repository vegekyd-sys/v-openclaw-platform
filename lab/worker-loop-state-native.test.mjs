import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {fork} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const dist = path.join(process.env.VLAB_CANDIDATE_RUNTIME, 'openclaw/dist');
const state = await import(pathToFileURL(path.join(dist, 'plugin-state-store-PhQA2Nhh.js')));
const memory = await import(pathToFileURL(path.join(dist, 'dreaming-state-B0qd2W7q.js')));
const store = (namespace, options={}) => state.n('worker-loop-tests', {namespace, maxEntries:100, ...options});
const databasePath=path.join(process.env.OPENCLAW_STATE_DIR,'state/openclaw.sqlite');
const hasSnapshot=fs.existsSync(databasePath);
function unrelatedRowsFingerprint(){
  const db=new DatabaseSync(databasePath,{readOnly:true}),hash=createHash('sha256');let count=0;
  for(const row of db.prepare("SELECT * FROM plugin_state_entries WHERE plugin_id NOT LIKE 'worker-loop-%' ORDER BY plugin_id,namespace,entry_key").iterate()){hash.update(JSON.stringify(row));count++;}
  db.close();return {count,sha256:hash.digest('hex')};
}
const snapshotBefore=hasSnapshot?unrelatedRowsFingerprint():null;

test('native bounded writes preserve values, updates, namespace isolation and timer progress', async () => {
  const s = store('values'), other = store('other');
  await other.register('a',{untouched:true});
  let yielded = false; setImmediate(() => {yielded = true;});
  await s.registerMany(Array.from({length:70},(_,i)=>({key:'key-'+i,value:{i,nested:[null,true,'text']}})));
  assert(yielded); assert.equal((await s.entries()).length,70);
  await s.registerMany([{key:'key-1',value:{updated:true}}]);
  assert.deepEqual(await s.lookup('key-1'),{updated:true});
  assert.deepEqual(await other.lookup('a'),{untouched:true});
});
test('invalid JSON is rejected before transaction and a failed batch does not poison scheduling', async () => {
  const s=store('invalid');
  await assert.rejects(s.registerMany([{key:'a',value:1},{key:'b',value:BigInt(1)}]));
  assert.deepEqual(await s.entries(),[]);
  await s.registerMany([{key:'ok',value:2}]); assert.equal(await s.lookup('ok'),2);
  const sync=state.r('worker-loop-tests',{namespace:'bounds',maxEntries:100});
  assert.throws(()=>sync.registerMany(Array.from({length:33},(_,i)=>({key:String(i),value:i}))));
  assert.throws(()=>sync.registerMany(null)); await s.registerMany([]);
});
test('reject-new rolls back the whole chunk including earlier updates', async () => {
  const s=store('reject',{maxEntries:2,overflowPolicy:'reject-new'});
  await s.registerMany([{key:'a',value:1},{key:'b',value:2}]);
  await assert.rejects(s.registerMany([{key:'a',value:99},{key:'c',value:3}]));
  assert.equal(await s.lookup('a'),1); assert.equal(await s.lookup('c'),undefined);
  assert.equal((await s.entries()).length,2);
});
test('eviction retains quota and expiration accounting across batches', async () => {
  const s=store('evict',{maxEntries:3});
  await s.registerMany([{key:'a',value:1},{key:'b',value:2},{key:'c',value:3},{key:'d',value:4}]);
  assert.equal((await s.entries()).length,3); assert.equal(await s.lookup('d'),4);
  const ttl=store('ttl',{maxEntries:2,overflowPolicy:'reject-new'});
  await ttl.registerMany([{key:'expires',value:1,options:{ttlMs:1}},{key:'kept',value:2}]);
  await new Promise(r=>setTimeout(r,20));
  await ttl.registerMany([{key:'new',value:3}]);
  assert.equal(await ttl.lookup('expires'),undefined); assert.equal(await ttl.lookup('kept'),2);
  assert.equal((await ttl.entries()).length,2);
});
test('memory replacement preserves another workspace and removes obsolete keys', async () => {
  memory.p(options=>state.n('worker-loop-memory-tests',options));
  const write=(workspaceDir,entries)=>memory.b({namespace:'replacement',workspaceDir,entries});
  await write('/synthetic/a',[{key:'old',value:0},{key:'keep',value:1}]);
  await write('/synthetic/b',[{key:'other',value:2}]);
  await write('/synthetic/a',[{key:'keep',value:3},{key:'new',value:4}]);
  assert.deepEqual((await memory.y({namespace:'replacement',workspaceDir:'/synthetic/a'})).sort((a,b)=>a.key.localeCompare(b.key)),[{key:'keep',value:3},{key:'new',value:4}]);
  assert.deepEqual(await memory.y({namespace:'replacement',workspaceDir:'/synthetic/b'}),[{key:'other',value:2}]);
  await write('/synthetic/a',[]);
  assert.deepEqual(await memory.y({namespace:'replacement',workspaceDir:'/synthetic/a'}),[]);
});
test('memory works with the existing keyed-store interface and yields on fallback', async () => {
  const rows=new Map(); let yielded=false;
  memory.p(()=>({register:async(k,v)=>{rows.set(k,v);},entries:async()=>[...rows].map(([key,value])=>({key,value})),delete:async k=>rows.delete(k)}));
  setImmediate(()=>{yielded=true;});
  await memory.b({namespace:'fallback',workspaceDir:'/synthetic/fallback',entries:Array.from({length:64},(_,i)=>({key:'k'+i,value:i}))});
  assert(yielded); assert.equal(rows.size,64);
});
test('bounded range reads preserve plugin and namespace ownership and reject invalid bounds',async()=>{
  const s=store('range');await s.registerMany([{key:'a:1',value:1},{key:'a:2',value:2},{key:'b:1',value:3}]);
  const other=store('range-other');await other.register('a:1',99);
  assert.deepEqual((await s.entriesInKeyRange({keyStartInclusive:'a:',keyEndExclusive:'a;',limit:100})).map(x=>x.value),[1,2]);
  await assert.rejects(s.entriesInKeyRange({keyStartInclusive:'z',keyEndExclusive:'a',limit:100}));
  await assert.rejects(s.entriesInKeyRange({keyStartInclusive:'a',keyEndExclusive:'z',limit:101}));
  await assert.rejects(s.entriesInKeyRange({keyStartInclusive:'a',keyEndExclusive:'z',limit:Infinity}));
});
test('batch retention keeps the plugin-wide cap across namespaces',async()=>{
  const id='worker-loop-global-quota';
  const s=state.n(id,{namespace:'target',maxEntries:100});await s.register('old',0);
  const db=new DatabaseSync(path.join(process.env.OPENCLAW_STATE_DIR,'state/openclaw.sqlite'));
  db.exec('BEGIN IMMEDIATE');
  const insert=db.prepare('INSERT INTO plugin_state_entries(plugin_id,namespace,entry_key,value_json,created_at,expires_at) VALUES(?,?,?,?,?,NULL)');
  for(let i=0;i<49999;i++)insert.run(id,'other','ballast-'+i,'null',1);
  db.exec('COMMIT');db.close();
  await s.registerMany([{key:'new-1',value:1},{key:'new-2',value:2}]);
  assert.equal(await s.lookup('new-2'),2);assert.equal(await s.lookup('old'),undefined);
  assert.equal(state.h(id),50000);
});
test('five real native writers share one private database without lost writes or lock errors',{timeout:60000},async()=>{
  const results=await Promise.all(Array.from({length:5},(_,id)=>new Promise((resolve,reject)=>{
    const child=fork(new URL('./worker-loop-state-process.mjs',import.meta.url),[String(id)],{stdio:['ignore','ignore','pipe','ipc']});
    let result,errors='';child.stderr.on('data',b=>{errors+=b;});child.on('message',r=>{result=r;});
    child.on('error',reject);child.on('exit',code=>code===0&&result?resolve(result):reject(Error('Writer failed '+id+': '+errors)));
  })));
  assert.equal(results.reduce((n,r)=>n+r.persisted,0),320);
});
test('real VLab snapshot preserves all unrelated plugin-state rows byte-for-byte',{skip:!hasSnapshot},()=>{
  assert.deepEqual(unrelatedRowsFingerprint(),snapshotBefore);
});
test.after(()=>state.m());
