import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {suspensionReady} from './files.mjs';
export async function acquireIdleFence(call, requestId, {now=Date.now,sleep=delay,timeoutMs=45000}={}) {
  // Plugin RPC is unavailable once suspended. Check Workers before closing admission;
  // native ready then covers chat/queued/cron/terminal work behind that fence.
  const workers=await call('vlab.workers.status',{});
  assert.equal(workers.pending,0,'Worker requests pending; retry later');
  assert(workers.workers.every(w=>!w.activeCount&&!w.queued),'Workers active; retry later');
  const held=await call('gateway.suspend.prepare',{requestId,drain:true,terminalPolicy:'preserve'});
  assert(held.suspensionId,'Native suspension was not acquired');
  try {
    const deadline=now()+timeoutMs;
    for(;;) {
      const s=await call('gateway.suspend.status',{suspensionId:held.suspensionId});
      if(suspensionReady(s,now()))return held;
      if(now()>=deadline)throw Error('Shared VLab drain deferred: '+JSON.stringify({status:s.status,activeCount:s.activeCount,blockers:s.blockers?.map(b=>({kind:b.kind,count:b.count}))}));
      await sleep(1000);
    }
  } catch(e) {await call('gateway.suspend.resume',{suspensionId:held.suspensionId}).catch(()=>{});throw e;}
}
