// Timing-only observer. No payload/schema/URL/error-message capture; no policy changes.
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';

const round=n=>Math.round(n*10)/10;
const opaque=value=>createHash('sha256').update(String(value??'')).digest('hex').slice(0,16);
const servers=new Set(['universal-memory','voice-memory','figma']);
const defaultSink=row=>{
  if(process.stderr.writableLength>262144)return;
  process.stderr.write('[bundle-prep-observer] '+JSON.stringify(row)+'\n');
};
export function createBundlePrepObserver({sink=defaultSink}={}){
  const storage=new AsyncLocalStorage();let sequence=0;
  const emit=row=>{try{sink(row);}catch{/* Observability must never fail a turn. */}};
  const mark=(stage,fields={})=>{
    try{
      const s=storage.getStore();if(!s||s.done)return;
      if(s.events.length>=96){s.dropped++;return;}
      const row={stage,ms:round(performance.now()-s.start)};
      // Explicit field allowlist. Never spread caller-supplied objects into logs.
      if(typeof fields.server==='string')row.server=servers.has(fields.server)?fields.server:'hash:'+opaque(fields.server);
      for(const key of ['cached','inFlight','retryDue','reused','connected','retry','aborted'])if(typeof fields[key]==='boolean')row[key]=fields[key];
      for(const key of ['count','connectionTimeoutMs','requestTimeoutMs','generation'])if(Number.isFinite(fields[key]))row[key]=fields[key];
      s.events.push(row);
    }catch{/* No effect on the observed call. */}
  };
  return {
    mark,
    async run(attempt,body){
      const start=performance.now(),cpu=process.cpuUsage(),elu=performance.eventLoopUtilization();
      const raw=typeof attempt?.runId==='string'?attempt.runId:'';
      const s={id:process.pid+':'+(++sequence),runId:/^[\w:-]{1,128}$/.test(raw)?raw:'hash:'+opaque(raw),sessionHash:opaque(attempt?.sessionId??attempt?.sessionKey),start,events:[],dropped:0,done:false};
      let tickAt=start,lagMax=0,outcome='ok';
      const tick=()=>{const now=performance.now();lagMax=Math.max(lagMax,now-tickAt-100);tickAt=now;};
      const timer=setInterval(tick,100);timer.unref();
      emit({v:1,kind:'start',id:s.id,runId:s.runId,sessionHash:s.sessionHash,pid:process.pid,at:new Date().toISOString()});
      try{return await storage.run(s,body);}
      catch(error){outcome=error?.name==='AbortError'?'aborted':'error';throw error;}
      finally{
        clearInterval(timer);tick();s.done=true;
        const used=process.cpuUsage(cpu),loop=performance.eventLoopUtilization(elu);
        emit({v:1,kind:'end',id:s.id,runId:s.runId,sessionHash:s.sessionHash,pid:process.pid,at:new Date().toISOString(),
          totalMs:round(performance.now()-start),outcome,cpuUserMs:round(used.user/1000),cpuSystemMs:round(used.system/1000),
          eventLoopLagMaxMs:round(Math.max(0,lagMax)),eventLoopUtilization:round(loop.utilization*1000)/1000,
          processMetricsSharedAcrossConcurrentRuns:true,dropped:s.dropped,events:s.events});
      }
    },
    async wait(stage,fields,body){
      mark(stage+'-start',fields);
      try{const result=await body();mark(stage+'-end',fields);return result;}
      catch(error){mark(stage+'-error',{...fields,aborted:error?.name==='AbortError'});throw error;}
    }
  };
}
export const bundlePrepObserver=createBundlePrepObserver();
