import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {WorkerPool} from './worker-pool.mjs';
import {acquirePoolGeneration,createPoolServiceLease} from './shared-pool-lifecycle.mjs';

function generation(delay = 0) {
  return {pool: new WorkerPool({minWorkers:1,maxWorkers:1,sessionsPerWorker:1,
    warmSpareWorkers:0,startupTimeoutMs:2000,requestTimeoutMs:2000,
    workerPath:fileURLToPath(new URL('./fake-delayed-ready-worker.mjs',import.meta.url)),
    workerEnv:{...process.env,VLAB_FAKE_WORKER_READY_DELAY_MS:String(delay)}}), requests:new Map()};
}

test('hot reload creates a fresh usable pool; delayed old stop cannot close it', async () => {
  let current;
  let previousLease;
  const pids = new Set();
  for (let i=0;i<3;i++) {
    const old=current;
    current=acquirePoolGeneration(current,generation);
    assert.notEqual(current,old);
    const lease=createPoolServiceLease(current);
    try {
      await lease.start();
      if(previousLease) await previousLease.stop();
      const result=await current.pool.dispatch('agent:fixture:reload',{kind:'ping'});
      pids.add(result.workerPid);
      assert.equal(current.pool.closing,false);
      assert.equal(current.pool.status().workers.length,1);
      if(old) assert.equal(old.pool.status().workers.length,0);
    } finally { await lease.stop(); }
    previousLease=lease;
  }
  assert.equal(pids.size,3);
});

test('live registrations share a generation with independent idempotent service leases', async () => {
  const g=generation(50),same=acquirePoolGeneration(g,()=>assert.fail('must share'));
  const a=createPoolServiceLease(g),b=createPoolServiceLease(same);
  try {
    await Promise.all([a.start(),a.start(),b.start()]);
    assert.equal(g.pool.status().workers.length,1);
    await a.stop(); await a.stop();
    assert.equal(g.pool.closing,false);
    await g.pool.dispatch('agent:fixture:other-lease',{kind:'ping'});
    await assert.rejects(a.start(),/retired/);
  } finally {await a.stop();await b.stop();}
  assert.equal(g.pool.closing,true);
});

test('closed pools cannot silently report successful start or spawn new children',async()=>{
  const g=generation(); await g.pool.start(); await g.pool.close();
  await assert.rejects(g.pool.start(),/closing/);
  await assert.rejects(g.pool.spawn(0),/closing/);
  await assert.rejects(g.pool.submit('agent:fixture:closed',{kind:'ping'}),/closing/);
  assert.equal(g.pool.reapTimer,null);
});

test('stop during startup joins shutdown and never logs ready or leaves a sweep timer',async()=>{
  const g=generation(250);let ready=0;
  const lease=createPoolServiceLease(g,()=>ready++);
  const failure=assert.rejects(lease.start(),/exited|closing|stopped/);
  const close=lease.stop();assert.equal(lease.stop(),close);
  await Promise.all([failure,close]);
  assert.equal(ready,0);assert.equal(g.pool.reapTimer,null);
  assert.equal(g.pool.workers.size,0);
});

test('concurrent close callers wait for the same child shutdown',async()=>{
  const g=generation();await g.pool.start();
  const first=g.pool.close();assert.equal(g.pool.close(),first);
  await first;assert.equal(g.pool.workers.size,0);
});

test('closing settles active and pending old requests and replacement accepts new work',async()=>{
  const old=generation();await old.pool.start();
  const a=await old.pool.submit('agent:fixture:old-active',{kind:'hold',durationMs:1000});
  const b=await old.pool.submit('agent:fixture:old-pending',{kind:'hold',durationMs:1000});
  const outcomes=Promise.allSettled([a.promise,b.promise]);
  await old.pool.close();
  assert((await outcomes).every(x=>x.status==='rejected'));
  const next=acquirePoolGeneration(old,generation);
  try {await next.pool.dispatch('agent:fixture:new',{kind:'ping'});}
  finally {await next.pool.close();}
});

test('legacy closed global entry is replaced with isolated request state',async()=>{
  const old=generation();old.requests.set('request-1','old');await old.pool.close();
  const next=acquirePoolGeneration(old,generation);
  assert.notEqual(next,old);assert.equal(next.requests.size,0);
  await next.pool.close();
});

test('plugin progress callback and service are bound to the captured generation',()=>{
  const source=readFileSync(new URL('./index.mjs',import.meta.url),'utf8');
  assert(source.includes('sharedPool.nativeLaneProgressBridge;'));
  assert(!source.includes('globalThis[SHARED_POOL_KEY]?.nativeLaneProgressBridge'));
  assert(source.includes('createPoolServiceLease(sharedPool,'));
});
