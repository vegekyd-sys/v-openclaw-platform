import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const prod=process.argv.includes('--production');assert.equal(os.hostname(),prod?'VM-8-2-ubuntu':'VM-0-4-ubuntu');
const file=process.argv[2];assert(/^timeline-\d+\.json$/.test(file));
const dir=prod?'/home/openclaw/.openclaw/db91-acceptance-20260907':'/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902/state/db91-c5-release-20260907';
const report=JSON.parse(fs.readFileSync(dir+'/'+file));
const jobs=new Map(report.rounds.flatMap(r=>r.jobs.map(j=>[j.runId,{...j,phases:{}}])));
const since=new Date(report.startedAt).toISOString().replace('T',' ').replace(/\.\d+Z$/,' UTC');
const logs=execFileSync('journalctl',['-u',prod?'openclaw-gateway.service':'openclaw-vlab-production-mirror-v8.service','--since',since,'--no-pager','-o','json'],{encoding:'utf8',maxBuffer:64*1024**2});
for(const line of logs.split('\n').filter(Boolean)){
 const row=JSON.parse(line),text=String(row.MESSAGE??'');
 for(const m of text.matchAll(/\[db91-(worker|attempt|prompt)-phase\] (\{[^\n]+\})/g)){
  let p;try{p=JSON.parse(m[2]);}catch{continue;}const j=jobs.get(p.runId);if(!j)continue;
  const key=m[1]+'/'+(p.phase??p.stage);(j.phases[key]??=[]).push(p.elapsedMs);
  if(key==='worker/agent-runtime')j.workerEntryMs??=p.atMs-p.elapsedMs-j.start;
 }
 for(const m of text.matchAll(/\[db91-native-first-text\] (\{[^\n]+\})/g)){
  let p;try{p=JSON.parse(m[1]);}catch{continue;}const j=jobs.get(p.runId);if(j)j.nativeFirstTextMs??=p.atMs-j.start;
 }
}
const stats=values=>{
 const v=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!v.length)return {n:0};
 const q=p=>Math.round(v[Math.max(0,Math.ceil(p*v.length)-1)]);
 return {n:v.length,min:Math.round(v[0]),p50:q(.5),p95:q(.95),max:Math.round(v.at(-1)),mean:Math.round(v.reduce((a,b)=>a+b,0)/v.length)};
};
const rounds=report.rounds.map(r=>{
 const rows=r.jobs.map(raw=>{const j=jobs.get(raw.runId),ev=j.events;
  const dispatch=r.samples.find(s=>s.workers?.some(w=>w.active?.some(a=>a.runId===j.runId)));
  const firstTool=ev['agent/tool/start']?.firstMs,toolEnd=ev['agent/tool/result']?.lastMs??ev['agent/tool/end']?.lastMs;
  const modelStart=ev['agent/run_status/starting_model']?.firstMs;
  return {runId:j.runId,error:j.error,admissionMs:j.admittedMs,workerEntryMs:j.workerEntryMs,observedDispatchMs:dispatch?dispatch.at-j.start:undefined,
   nativeFirstTextMs:j.nativeFirstTextMs,firstTextMs:j.firstTextMs,relayMs:Number.isFinite(j.firstTextMs)&&Number.isFinite(j.nativeFirstTextMs)?j.firstTextMs-j.nativeFirstTextMs:undefined,
   modelPhaseStartMs:modelStart,modelPhaseToTextMs:Number.isFinite(modelStart)&&Number.isFinite(j.firstTextMs)?j.firstTextMs-modelStart:undefined,
   toolWindowMs:Number.isFinite(firstTool)&&Number.isFinite(toolEnd)?toolEnd-firstTool:undefined,finalEventMs:j.finalEventMs,historyVerifiedMs:j.replyVisibleMs,historyRetries:j.historyRetries};
 });
 const metrics=Object.fromEntries(['admissionMs','workerEntryMs','observedDispatchMs','nativeFirstTextMs','firstTextMs','relayMs','modelPhaseStartMs','modelPhaseToTextMs','toolWindowMs','finalEventMs','historyVerifiedMs'].map(k=>[k,stats(rows.map(j=>j[k]))]));
 const phaseNames=[...new Set(r.jobs.flatMap(j=>Object.keys(jobs.get(j.runId).phases)))];
 const phases=Object.fromEntries(phaseNames.map(k=>[k,stats(r.jobs.flatMap(j=>jobs.get(j.runId).phases[k]??[]))]));
 const ids=new Set(r.jobs.map(j=>j.runId));
 const peak=Math.max(0,...r.samples.map(s=>(s.workers??[]).flatMap(w=>w.active??[]).filter(a=>ids.has(a.runId)).length));
 const blocked=r.samples.filter(s=>s.pending>0&&s.workers?.some(w=>w.ready&&w.activeCount<3&&!w.queued)&&s.workers?.some(w=>!w.ready));
 const callbackDelta=Object.fromEntries(Object.entries(r.after?.parity?.eventsByCallback??{}).map(([k,v])=>[k,v-(r.before.parity?.eventsByCallback?.[k]??0)]));
 const resources=r.resourceSamples??[];
 return {label:r.label,success:r.jobs.filter(j=>j.realToolResult).length,failed:r.jobs.filter(j=>j.error).length,peakOwnActive:peak,initialWorkers:r.before.workers.length,
  idleCapacityBlockedSamples:blocked.length,historyRetries:rows.reduce((a,j)=>a+j.historyRetries,0),metrics,phases,callbackDelta,
  resources:prod?{samples:resources.length,healthFailures:resources.filter(s=>s.health===false).length,maxAnon:Math.max(0,...resources.map(s=>s.resources?.anon??0)),maxCurrent:Math.max(0,...resources.map(s=>s.resources?.current??0)),minAvailable:Math.min(...resources.map(s=>s.resources?.available??Infinity)),oomKillMax:Math.max(0,...resources.map(s=>s.resources?.oomKill??0))}:undefined,
  jobs:rows};
});
console.log(JSON.stringify({source:file,variant:report.variant,completed:report.completed??false,gatewayPid:report.gatewayPid,units:'milliseconds except resource bytes',notes:['Observed dispatch is an upper bound from sampled Worker status.','Model-phase-to-text can include tool execution and multiple model calls.','Preparation phases may overlap; do not sum every phase as wall time.','First text excludes status/reasoning. Baseline absent delivery is not a zero-millisecond TTFT.'],rounds}));
