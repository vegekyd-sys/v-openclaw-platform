import assert from 'node:assert/strict';import test from 'node:test';import{fileURLToPath}from'node:url';
import{WorkerPool}from'./worker-pool.mjs';
const workerPath=fileURLToPath(new URL('./fake-delayed-ready-worker.mjs',import.meta.url));
const make=extra=>new WorkerPool({minWorkers:2,maxWorkers:2,sessionsPerWorker:1,warmSpareWorkers:0,workerPath,idleTimeoutMs:60000,sessionAffinityEnabled:true,...extra});
const run=(p,key,ms=1,options)=>p.dispatch(key,{kind:'hold',durationMs:ms},options);
async function primeSecond(p,key='s'){
 const blocker=await p.submit('block-first',{kind:'hold',durationMs:100});
 const second=await run(p,key);await blocker.promise;
 assert.equal(p.sessionOwners.size,0);assert(p.status().workers.every(w=>w.activeCount===0));return second;
}
test('A/B/A scheduling reproduces avoidable migration without retaining ownership',async()=>{
 for(const enabled of [false,true,false]){const p=make({sessionAffinityEnabled:enabled});try{
  await p.start();const first=await primeSecond(p);const next=await run(p,'s');
  assert.equal(next.workerPid===first.workerPid,enabled);assert.equal(p.sessionOwners.size,0);
 }finally{await p.close();}}
});
test('busy preferred Worker never queues a different session behind it',async()=>{
 const p=make();try{await p.start();const s=await primeSecond(p);
  const hint=p.sessionAffinity.get('s');p.rememberSessionWorker('busy',hint.worker);
  const busy=await p.submit('busy',{kind:'hold',durationMs:200});const next=await run(p,'s');
  assert.notEqual(next.workerPid,s.workerPid);await busy.promise;
 }finally{await p.close();}
});
test('active same-owner work still serializes; affinity does not override owner',async()=>{
 const p=make();try{await p.start();const first=await p.submit('same',{kind:'hold',durationMs:80});
  const second=await p.submit('same',{kind:'hold',durationMs:1});
  const [a,b]=await Promise.all([first.promise,second.promise]);assert.equal(a.workerPid,b.workerPid);assert.equal(p.sessionOwners.size,0);
 }finally{await p.close();}
});
test('TTL, bounded LRU and slot reuse cannot pin stale Workers',async()=>{
 const p=make({sessionAffinityMaxEntries:2,sessionAffinityTtlMs:10});try{await p.start();const w=[...p.workers.values()][0];
  p.rememberSessionWorker('a',w);p.rememberSessionWorker('b',w);p.rememberSessionWorker('c',w);assert.equal(p.sessionAffinity.size,2);assert(!p.sessionAffinity.has('a'));
  p.sessionAffinity.get('b').at-=100;assert.equal(p.preferredSessionWorker('b'),undefined);
  p.sessionAffinity.set('stale',{worker:{...w},at:Date.now()});assert.equal(p.preferredSessionWorker('stale'),undefined);
  w.retiring=true;assert.equal(p.preferredSessionWorker('c'),undefined);w.retiring=false;
 }finally{await p.close();assert.equal(p.sessionAffinity.size,0);}
});
test('affinity uses explicit session owner identity, not display session key',async()=>{
 const p=make();try{await p.start();await run(p,'display',1,{sessionOwnerKey:'agent-A:session'});
  assert(p.sessionAffinity.has('agent-A:session'));assert(!p.sessionAffinity.has('display'));assert(!p.sessionAffinity.has('agent-B:session'));
 }finally{await p.close();}
});
test('disabled baseline keeps no affinity entries',async()=>{
 const p=make({sessionAffinityEnabled:false});try{await p.start();await run(p,'s');assert.equal(p.sessionAffinity.size,0);}finally{await p.close();}
});

test('ready Workers spread active sessions before packing siblings behind a busy process',async()=>{
 const p=make({minWorkers:4,maxWorkers:4,sessionsPerWorker:3});
 try{
  await p.start();
  const [firstWorker]=[...p.workers.values()].sort((a,b)=>a.slot-b.slot);
  p.rememberSessionWorker('slow-a',firstWorker);
  p.rememberSessionWorker('slow-b',firstWorker);
  const heartbeat=await p.submit('heartbeat',{kind:'hold',durationMs:160});
  const slowA=await p.submit('slow-a',{kind:'hold',durationMs:20});
  const slowB=await p.submit('slow-b',{kind:'hold',durationMs:20});
  const fast=await p.submit('fast',{kind:'hold',durationMs:20});
  const results=await Promise.all([heartbeat.promise,slowA.promise,slowB.promise,fast.promise]);
  assert.equal(new Set(results.map(row=>row.workerPid)).size,4);
  assert.equal(results[0].workerPid,firstWorker.pid);
  assert.ok(results.slice(1).every(row=>row.workerPid!==firstWorker.pid));
 }finally{await p.close();}
});

test('load spreading preserves every configured Session slot at saturation',async()=>{
 const p=make({minWorkers:4,maxWorkers:4,sessionsPerWorker:3});
 try{
  await p.start();
  const submitted=await Promise.all(Array.from({length:12},(_,i)=>p.submit(`session-${i}`,{kind:'hold',durationMs:80})));
  const results=await Promise.all(submitted.map(item=>item.promise));
  const counts=new Map();
  for(const row of results) counts.set(row.workerPid,(counts.get(row.workerPid)??0)+1);
  assert.deepEqual([...counts.values()].sort((a,b)=>a-b),[3,3,3,3]);
 }finally{await p.close();}
});
