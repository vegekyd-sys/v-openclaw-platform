// Bound automatic best-effort sweeps, not user writes or explicit maintenance.
// The native owner keeps accumulating all active keys while this timer waits.
import {performance} from 'node:perf_hooks';
export function createMaintenanceThrottle({intervalMs=1000,now=()=>performance.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),jitterMs=process.pid%197}={}) {
  const next=new WeakMap();
  return async database=>{
    const at=now(),due=Math.max(next.get(database)??at+intervalMs+jitterMs,at);
    next.set(database,due+intervalMs+jitterMs);
    if(due>at)await sleep(due-at);
  };
}
export const waitAutomaticMaintenanceWindow=createMaintenanceThrottle();
