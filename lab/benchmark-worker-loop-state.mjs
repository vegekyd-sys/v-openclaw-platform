// Native SQLite + Memory Core in the coordinator, real child-process producers.
// Synthetic content isolates the measured hotspot; this is not model/Feishu acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fork} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {patchPluginState,patchDreamingState} from './patch-worker-loop-state.mjs';
const self=fileURLToPath(import.meta.url), mode=process.argv[2];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const sha=v=>createHash('sha256').update(v).digest('hex');
const dist=path.join(process.env.VLAB_CANDIDATE_RUNTIME,'openclaw/dist');
const load=n=>import(pathToFileURL(path.join(dist,n)));
const percentile=(a,p)=>a.length?[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.ceil(a.length*p/100)-1)]:null;

if(mode==='producer') {
  process.on('message',msg=>{
    if(msg.type==='prepare') for(const job of msg.jobs) process.send({type:'job',job});
    if(msg.type==='done') process.send({type:'ack',jobId:msg.jobId});
    if(msg.type==='stop') process.disconnect();
  });
} else if(mode==='probe') {
  const pending=new Set(), latency=[];let interval,stopped=false;
  const done=()=>{if(stopped&&pending.size===0){process.send({type:'probe-result',samples:latency.length,p50Ms:percentile(latency,50),p95Ms:percentile(latency,95),p99Ms:percentile(latency,99),maxMs:Math.max(...latency)});process.disconnect();}};
  process.on('message',m=>{
    if(m.type==='start'){interval=setInterval(()=>{const sent=performance.timeOrigin+performance.now();pending.add(sent);process.send({type:'ping',sent});},10);process.send({type:'armed'});}
    if(m.type==='pong'){pending.delete(m.sent);latency.push(performance.timeOrigin+performance.now()-m.sent);done();}
    if(m.type==='stop'){clearInterval(interval);stopped=true;done();}
  });
} else if(mode==='case') {
  const spec=JSON.parse(process.argv[3]);
  let sqlStats={};const statements=new WeakMap();
  const originalPrepare=DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare=function(sql,...args){const result=originalPrepare.call(this,sql,...args);statements.set(result,/plugin_state_entries/i.test(sql)?(/count\(/i.test(sql)?'stateCount':/^\s*delete/i.test(sql)?'stateDelete':/^\s*insert/i.test(sql)?'stateUpsert':'stateRead'):'other');return result;};
  const instrumentation=new DatabaseSync(':memory:');const statementPrototype=Object.getPrototypeOf(instrumentation.prepare('select 1'));
  for(const method of ['all','get','run','iterate']) {const original=statementPrototype[method];statementPrototype[method]=function(...args){const key=statements.get(this)??'other';sqlStats[key]=(sqlStats[key]??0)+1;return Reflect.apply(original,this,args);};}instrumentation.close();
  const state=await load('plugin-state-store-PhQA2Nhh.js');
  const memory=await load('dreaming-state-B0qd2W7q.js');
  const pluginId='worker-loop-benchmark', namespace='native-memory';
  memory.p(options=>state.n(pluginId,options));
  const store=state.n(pluginId,{namespace,maxEntries:50000});
  // Warm schema/ownership before measuring; initialization is not a steady-state cost.
  await store.register('initialize',{fixture:true}); state.m();
  const db=new DatabaseSync(path.join(process.env.OPENCLAW_STATE_DIR,'state/openclaw.sqlite'));
  db.exec('BEGIN IMMEDIATE');
  db.prepare('DELETE FROM plugin_state_entries WHERE plugin_id = ?').run(pluginId);
  const insert=db.prepare('INSERT INTO plugin_state_entries(plugin_id,namespace,entry_key,value_json,created_at,expires_at) VALUES(?,?,?,?,?,NULL)');
  const jobs=Array.from({length:spec.concurrency},(_,jobId)=>({jobId,workspaceDir:'/synthetic/worker-loop/'+jobId,entries:Array.from({length:128},(_,i)=>({key:'entry-'+i,value:{sequence:i,revision:1,content:'fixture-only-'+i}}))}));
  const now=Date.now();
  // Same total database size in every worker/concurrency case.
  for(let j=0;j<45;j++) for(let i=0;i<128;i++) {
    const workspaceDir='/synthetic/worker-loop/'+j, workspaceKey=sha(workspaceDir), key='entry-'+i;
    const value={version:1,workspaceKey,workspaceDir,key,value:{sequence:i,revision:0,content:'fixture-only-'+i}};
    insert.run(pluginId,namespace,workspaceKey+':'+sha(key),JSON.stringify(value),now);
  }
  for(let i=0;i<6240;i++) insert.run(pluginId,'ballast','ballast-'+i,JSON.stringify({fixture:true,i}),now);
  db.exec('COMMIT');db.close();
  // Reopen the native writable handle after fixture seeding; exclude connection
  // preflight from the hot-path comparison in both variants.
  await state.n(pluginId,{namespace:'ballast',maxEntries:50000}).register('ballast-0',{fixture:true,i:0});
  await store.lookup('warm');
  const children=[], requests=[], acks=new Set();
  let resolveReady,resolveDone;
  const ready=new Promise(r=>{resolveReady=r;});
  const delivered=new Promise(r=>{resolveDone=r;});
  for(let i=0;i<spec.workers;i++) {
    const child=fork(self,['producer'],{stdio:['ignore','ignore','inherit','ipc']}); children.push(child);
    child.on('message',m=>{
      if(m.type==='job') {requests.push({...m.job,child});if(requests.length===jobs.length)resolveReady();}
      if(m.type==='ack') {acks.add(m.jobId);if(acks.size===jobs.length)resolveDone();}
    });
    child.send({type:'prepare',jobs:jobs.filter(j=>j.jobId%spec.workers===i)});
  }
  await ready;
  const probe=fork(self,['probe'],{stdio:['ignore','ignore','inherit','ipc']});
  let armed,probeFinished;const probeReady=new Promise(r=>{armed=r;}),probeResult=new Promise(r=>{probeFinished=r;});
  probe.on('message',m=>{if(m.type==='ping')probe.send({type:'pong',sent:m.sent});if(m.type==='armed')armed();if(m.type==='probe-result')probeFinished(m);});
  probe.send({type:'start'});await probeReady;
  const lag=monitorEventLoopDelay({resolution:10});lag.enable();
  const intervals=[], completed=[];let last=performance.now();
  const timer=setInterval(()=>{const t=performance.now();intervals.push(t-last);last=t;},10);
  await pause(50);lag.reset();intervals.length=0;
  // Keep raw histogram output, plus an independent process heartbeat to expose
  // coordinated omission when the main loop cannot run its own monitor.
  await new Promise(resolve=>setImmediate(resolve));last=performance.now();
  sqlStats={};
  const cpu=process.cpuUsage(), elu=performance.eventLoopUtilization(), started=performance.now();
  let active=0,maxActive=0;
  await Promise.all(requests.map(async job=>{
    active++;maxActive=Math.max(maxActive,active);
    await memory.b({namespace,workspaceDir:job.workspaceDir,entries:job.entries});
    completed.push(performance.now()-started);active--;job.child.send({type:'done',jobId:job.jobId});
  }));
  await delivered;
  const durationMs=performance.now()-started, cpuUsed=process.cpuUsage(cpu), eluUsed=performance.eventLoopUtilization(elu);
  const measuredSql={...sqlStats};
  await pause(30);clearInterval(timer);lag.disable();
  probe.send({type:'stop'});const heartbeat=await probeResult;
  // Verify persisted rows with raw SQLite outside the measured window (no fake store).
  const verify=new DatabaseSync(path.join(process.env.OPENCLAW_STATE_DIR,'state/openclaw.sqlite'),{readOnly:true});
  const rows=verify.prepare('SELECT entry_key,value_json FROM plugin_state_entries WHERE plugin_id=? AND namespace=?').all(pluginId,namespace);
  const values=new Map(rows.map(r=>[r.entry_key,JSON.parse(r.value_json)]));
  for(const job of jobs) for(const entry of job.entries) assert.deepEqual(values.get(sha(job.workspaceDir)+':'+sha(entry.key)).value,entry.value);
  assert.equal(rows.length,5760,'Unrelated workspace rows must survive replacement');
  const total=verify.prepare('SELECT count(*) AS n FROM plugin_state_entries WHERE plugin_id=?').get(pluginId).n;
  assert.equal(total,12000);assert.equal(acks.size,spec.concurrency);verify.close();
  const result={...spec,durationMs,cpuMs:(cpuUsed.user+cpuUsed.system)/1000,elu:eluUsed.utilization,p50Ms:lag.percentile(50)/1e6,p95Ms:lag.percentile(95)/1e6,p99Ms:lag.percentile(99)/1e6,maxMs:lag.max/1e6,heartbeat,sql:measuredSql,timerSamples:intervals.length,timerP95Ms:percentile(intervals,95),timerMaxMs:Math.max(...intervals),completionP50Ms:percentile(completed,50),completionP95Ms:percentile(completed,95),completed:completed.length,persisted:completed.length,acked:acks.size,maxActive,seedRows:12000,rss:process.memoryUsage().rss};
  for(const child of children) child.send({type:'stop'});
  state.m();process.send({type:'result',result});
} else {
  const defs=[['plugin-state-store-PhQA2Nhh.js',patchPluginState],['dreaming-state-B0qd2W7q.js',patchDreamingState]];
  const sources=defs.map(([name,patch])=>({name,before:fs.readFileSync(path.join(dist,name),'utf8'),patch}));
  for(const s of sources) s.after=s.patch(s.before);
  const identity=sources.map(s=>({name:s.name,before:sha(s.before),after:sha(s.after)}));
  console.log(JSON.stringify({event:'identity',identity}));
  const specs=process.env.WORKER_LOOP_QUICK==='1'?[{workers:5,concurrency:15}]:[{workers:1,concurrency:15},{workers:3,concurrency:15},{workers:5,concurrency:15},{workers:5,concurrency:5},{workers:5,concurrency:45}];
  const results=[];
  try {
    for(const spec of specs) for(const [round,order] of (process.env.WORKER_LOOP_QUICK==='1'?['AB']:['AB','BA']).entries()) for(const variant of order) {
      for(const s of sources) fs.writeFileSync(path.join(dist,s.name),variant==='A'?s.before:s.after);
      const stateDir=path.join(process.env.VLAB_CANDIDATE_DATA,'benchmark',`${spec.workers}-${spec.concurrency}-${round}-${variant}`);
      fs.mkdirSync(stateDir,{recursive:true});
      const caseEnv=Object.fromEntries(Object.entries(process.env).map(([k,v])=>[k,v.replaceAll(process.env.OPENCLAW_STATE_DIR,stateDir)]));
      caseEnv.OPENCLAW_STATE_DIR=stateDir;
      fs.mkdirSync(path.dirname(caseEnv.OPENCLAW_CONFIG_PATH),{recursive:true});
      fs.writeFileSync(caseEnv.OPENCLAW_CONFIG_PATH,fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH,'utf8').replaceAll(process.env.OPENCLAW_STATE_DIR,stateDir));
      const result=await new Promise((resolve,reject)=>{
        const child=fork(self,['case',JSON.stringify({...spec,variant,round})],{env:caseEnv,stdio:['ignore','ignore','inherit','ipc']});
        let received; const timeout=setTimeout(()=>{child.kill('SIGTERM');reject(Error('Case exceeded 180 seconds'));},180000);
        child.on('message',m=>{if(m.type==='result')received=m.result;});
        child.on('error',reject);
        child.on('exit',code=>{clearTimeout(timeout);code===0&&received?resolve(received):reject(Error('Case failed: '+code));});
      });
      results.push(result);console.log(JSON.stringify({event:'case',result}));
      fs.rmSync(stateDir,{recursive:true,force:true});await pause(200);
    }
  } finally {for(const s of sources)fs.writeFileSync(path.join(dist,s.name),s.before);}
  const comparisons=specs.map(spec=>{
    const matching=variant=>results.filter(r=>r.variant===variant&&r.workers===spec.workers&&r.concurrency===spec.concurrency);
    const median=a=>{const s=[...a].sort((a,b)=>a-b);return (s[Math.floor((s.length-1)/2)]+s[Math.ceil((s.length-1)/2)])/2;};
    const metric=(v,k)=>median(matching(v).map(r=>r[k]));
    const hb=(v,k)=>median(matching(v).map(r=>r.heartbeat[k]));
    return {...spec,aDurationMs:metric('A','durationMs'),bDurationMs:metric('B','durationMs'),aP99Ms:metric('A','p99Ms'),bP99Ms:metric('B','p99Ms'),aHeartbeatP50Ms:hb('A','p50Ms'),bHeartbeatP50Ms:hb('B','p50Ms'),aHeartbeatP95Ms:hb('A','p95Ms'),bHeartbeatP95Ms:hb('B','p95Ms'),aHeartbeatP99Ms:hb('A','p99Ms'),bHeartbeatP99Ms:hb('B','p99Ms'),aMaxMs:metric('A','maxMs'),bMaxMs:metric('B','maxMs'),aTimerMaxMs:metric('A','timerMaxMs'),bTimerMaxMs:metric('B','timerMaxMs'),aCompletionP95Ms:metric('A','completionP95Ms'),bCompletionP95Ms:metric('B','completionP95Ms')};
  });
  console.log(JSON.stringify({event:'summary',identity,results,comparisons}));
  for(const c of comparisons) {
    assert(c.aTimerMaxMs>100,'A must reproduce a material native event-loop stall');
    assert(c.bTimerMaxMs<c.aTimerMaxMs*0.6,'B must reduce the independently timed worst stall by at least 40%');
    assert(c.bDurationMs<c.aDurationMs,'B must improve completed throughput');
    assert(c.bCompletionP95Ms<=c.aCompletionP95Ms,'B must not regress completion P95');
    assert(c.bHeartbeatP99Ms<c.aHeartbeatP99Ms*0.6,'Independent heartbeat P99 must improve by at least 40%');
  }
  for(const a of results.filter(r=>r.variant==='A')) {
    const b=results.find(r=>r.variant==='B'&&r.round===a.round&&r.workers===a.workers&&r.concurrency===a.concurrency);
    assert(b&&a.timerMaxMs>100&&b.timerMaxMs<a.timerMaxMs*0.6&&b.heartbeat.p99Ms<a.heartbeat.p99Ms*0.6&&b.durationMs<a.durationMs&&b.completionP95Ms<=a.completionP95Ms,'Every paired round must pass, not just an aggregate');
  }
}
