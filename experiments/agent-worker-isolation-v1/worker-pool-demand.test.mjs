import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {WorkerPool} from './worker-pool.mjs';

const workerPath = fileURLToPath(new URL('./fake-delayed-ready-worker.mjs', import.meta.url));
function pool(options = {}) {
  return new WorkerPool({minWorkers:1, maxWorkers:8, sessionsPerWorker:3,
    maxConcurrentStarts:4, warmSpareWorkers:0, startupTimeoutMs:3000,
    requestTimeoutMs:5000, workerPath,
    workerEnv:{...process.env,VLAB_FAKE_WORKER_READY_DELAY_MS:'250'}, ...options});
}
async function submit(p, keys) {
  const jobs=[];
  for(const key of keys) {
    const job=await p.submit(key,{kind:'hold',durationMs:400});
    job.promise.catch(()=>{}); jobs.push(job);
  }
  return jobs;
}
test('C15 projects four additional processes immediately, not one boot per wave', async()=>{
  const p=pool();
  try {
    await p.start();
    const jobs=await submit(p,Array.from({length:15},(_,i)=>'agent:demand:'+i));
    assert.equal(p.workers.size,5);
    assert.equal(p.startingWorkerCount(),4);
    for(let i=0;i<20;i++) await p.pump();
    assert.equal(p.workers.size,5,'repeated pump must not overcount starting capacity');
    await Promise.all(jobs.map(j=>j.promise));
  } finally {await p.close();}
});
test('boot concurrency limit includes speculative warm spare',async()=>{
  const p=pool({maxConcurrentStarts:2,warmSpareWorkers:1});
  try {
    await p.start();
    const jobs=await submit(p,Array.from({length:21},(_,i)=>'agent:bounded:'+i));
    assert.equal(p.startingWorkerCount(),2);
    assert.equal(p.workers.size,3);
    const monitor=setInterval(()=>assert.ok(p.startingWorkerCount()<=2),5);
    try {await Promise.all(jobs.map(j=>j.promise));} finally {clearInterval(monitor);}
    assert.ok(p.workers.size<=8);
  } finally {await p.close();}
});
test('many queued turns for one new session reserve only one slot',async()=>{
  const p=pool({sessionsPerWorker:1});
  try {
    await p.start();
    const first=await submit(p,['agent:existing']);
    const jobs=await submit(p,Array(5).fill('agent:same'));
    assert.equal(p.workers.size,2);
    assert.equal(p.startingWorkerCount(),1);
    await Promise.all([...first,...jobs].map(j=>j.promise));
  } finally {await p.close();}
});
test('invalid boot limits fail before starting processes',()=>{
  for(const maxConcurrentStarts of [0,-1,1.5,9,NaN])
    assert.throws(()=>pool({maxConcurrentStarts}),/maxConcurrentStarts/);
});
test('closing during multi-boot burst settles every pending job and child',async()=>{
  const p=pool();
  await p.start();
  const jobs=await submit(p,Array.from({length:15},(_,i)=>'agent:close:'+i));
  assert.equal(p.startingWorkerCount(),4);
  const settled=Promise.allSettled(jobs.map(j=>j.promise));
  await p.close();
  assert.ok((await settled).every(row=>row.status==='rejected'));
  assert.equal(p.workers.size,0); assert.equal(p.pending.length,0);
  assert.equal(p.reapTimer,null);
});
test('failed demand boot does not abort work already admitted to a healthy worker',async()=>{
  const p=pool({maxWorkers:2,maxConcurrentStarts:1,sessionsPerWorker:1});
  try {
    await p.start();
    const active=await p.submit('agent:healthy',{kind:'hold',durationMs:100});
    const original=p.spawn.bind(p);
    p.spawn=async slot=>{if(slot===1)throw Error('fixture boot failure');return original(slot);};
    const pending=await p.submit('agent:pending',{kind:'hold',durationMs:1});
    await assert.rejects(pending.promise,/fixture boot failure/);
    await active.promise;
    assert.equal(p.workers.size,1);
    p.spawn=original;
    const next=await p.dispatch('agent:after-failure',{kind:'ping'});
    assert.ok(next.workerPid);
  } finally {await p.close();}
});

test('transient EAGAIN demand spawn keeps Gateway alive and drains on healthy capacity',async()=>{
    const p=new WorkerPool({minWorkers:1,maxWorkers:2,maxConcurrentStarts:1,
      sessionsPerWorker:1,warmSpareWorkers:0,startupTimeoutMs:3000,
      requestTimeoutMs:5000,workerPath,
      workerEnv:{...process.env,VLAB_FAKE_WORKER_READY_DELAY_MS:'250'},
      spawnRetryBaseMs:1000,spawnRetryMaxMs:1000});
    try {
      await p.start();
      const active=await p.submit('agent:eagain:active',{kind:'hold',durationMs:100});
      p.forkWorker=()=>{
        const child=new EventEmitter();
        child.pid=undefined; child.exitCode=null; child.signalCode=null;
        child.stderr=new EventEmitter(); child.kill=()=>true; child.send=()=>{};
        process.nextTick(()=>{
          const error=Object.assign(new Error('spawn node EAGAIN'),{code:'EAGAIN'});
          child.emit('error',error);
        });
        return child;
      };
      const pending=await p.submit('agent:eagain:pending',{kind:'hold',durationMs:1});
      const [first,second]=await Promise.all([active.promise,pending.promise]);
      assert.equal(second.workerPid,first.workerPid);
      assert.equal(p.workers.size,1);
      assert.equal(p.status().spawnFailureCount,1);
      assert.equal(p.status().spawnRetryPending,true);
    } finally {await p.close();}
});
