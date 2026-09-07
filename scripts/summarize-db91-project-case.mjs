// Emit only benchmark metadata. Do not export snapshot messages or credentials.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
const root='/srv/vlab-production-mirror/labs/instances/db91-fix';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const plan=JSON.parse(fs.readFileSync(root+'/tmp/project-write-plan.json'));
const filename=root+'/workspace/project-write-case-'+plan.caseId+'.json';
const report=fs.existsSync(filename)?JSON.parse(fs.readFileSync(filename)):null;
const quantiles=values=>{
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b),p=q=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))];
  return {n:sorted.length,p50Ms:p(.5),p95Ms:p(.95),p99Ms:p(.99),maxMs:sorted.at(-1)};
};
const tools=plan.projects.map(p=>{
  const file=root+'/workspace/project-write-'+plan.caseId+'-'+p.index+'.json';
  return fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
}).filter(Boolean);
const traces=[...new Map(tools.flatMap(r=>r.nativeWriteTrace??[]).map(e=>[e.pid+':'+e.seq,e])).values()];
const pid=execFileSync('systemctl',['show','openclaw-lab-db91-fix.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();
const logFile='/proc/'+pid+'/root/tmp/openclaw/openclaw-2026-09-07.log';
const warnings=[];
if(fs.existsSync(logFile))for(const line of fs.readFileSync(logFile,'utf8').split('\n')) {
  let r;try{r=JSON.parse(line);}catch{continue;}
  if(new Date(r._meta?.date??0).getTime()<plan.expiresAt-240000)continue;
  const message=String(r.message??r['2']??r['1']??'');
  if(/SQLite transaction|SQLite session write failed|fts unavailable|slow SQLite session write/.test(message))
    warnings.push({at:r._meta?.date,message,...(typeof r['1']==='object'?r['1']:{})});
}
const result={caseId:plan.caseId,fullCasePassed:Boolean(report),projectCount:plan.projects.length,rounds:plan.rounds,
  workloadOverlapMs:report?.workloadOverlapMs,toolProcesses:tools.map(r=>({projectIndex:r.projectIndex,pid:r.pid,verifiedEvents:r.verifiedEvents,provenance:r.provenanceStats,traceDropped:r.nativeTraceDropped})),
  timings:{patch:quantiles(tools.flatMap(r=>r.measurements).filter(m=>m.op==='session-entry.patch').map(m=>m.totalMs)),
    append:quantiles(tools.flatMap(r=>r.measurements).filter(m=>m.op==='transcript.append').map(m=>m.totalMs)),
    nativeQueue:quantiles(traces.map(t=>t.queueMs)),nativeBody:quantiles(traces.map(t=>t.bodyMs)),
    chatMs:report?.outcomes.map(o=>o.endedAt-o.startedAt)},
  health:{...quantiles(report?.samples.map(s=>s.ms)??[]),failures:report?.samples.filter(s=>s.status!==200).length},
  warnings,
  resources:report?{samples:report.resourceSamples.length,minHostMemAvailable:Math.min(...report.resourceSamples.map(r=>r.hostMemAvailable)),
    minDiskFreeBytes:Math.min(...report.resourceSamples.map(r=>r.diskFreeBytes)),peakGroupMemoryBytes:Math.max(...report.resourceSamples.map(r=>Number(r.memoryCurrent)))}:null};
fs.writeFileSync(root+'/workspace/project-write-summary-'+plan.caseId+'.json',JSON.stringify(result,null,2),{mode:0o600});
console.log(JSON.stringify({...result,warnings:undefined,warningCounts:Object.fromEntries([...new Set(warnings.map(w=>w.message.startsWith('slow SQLite session write')?'slow SQLite session write':w.message))].map(message=>[message,warnings.filter(w=>w.message===message||message==='slow SQLite session write'&&w.message.startsWith(message)).length])),failures:warnings.filter(w=>/failed|unavailable/i.test(w.message))}));
