import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const dir='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902/state/db91-c5-release-20260907';
const file=process.argv[2]??fs.readdirSync(dir).filter(n=>/^timeline-\d+\.json$/.test(n)).sort().at(-1);
assert(/^timeline-\d+\.json$/.test(file));const r=JSON.parse(fs.readFileSync(dir+'/'+file));
const rounds=r.rounds.map(round=>{
 const samples=round.samples.filter(s=>s.workers);
 const jobs=round.jobs.map((j,index)=>{
  const first=samples.find(s=>s.workers.some(w=>w.active.some(a=>a.runId===j.runId)));
  const worker=first?.workers.find(w=>w.active.some(a=>a.runId===j.runId));
  const ready=worker?samples.find(s=>s.workers.some(w=>w.pid===worker.pid&&w.ready)):null;
  const life=j.events['agent/lifecycle/end']?.firstMs;
  return {index,admittedMs:j.admittedMs,firstObservedDispatchMs:first?first.at-j.start:null,workerSlot:worker?.slot,workerReadyMs:ready?ready.at-j.start:null,finalEventMs:life??j.finalEventMs,replyVisibleMs:j.replyVisibleMs,postDispatchMs:first?j.replyVisibleMs-(first.at-j.start):null,historyRetries:j.historyRetries};
 });
 const blocked=samples.filter(s=>s.pending>0&&s.workers.some(w=>w.ready&&w.activeCount<3&&!w.queued)&&s.workers.some(w=>!w.ready));
 return {label:round.label,initialWorkers:round.before.workers.length,success:round.jobs.filter(j=>j.realToolResult).length,meanReplyMs:Math.round(jobs.reduce((s,j)=>s+j.replyVisibleMs,0)/jobs.length),maxReplyMs:Math.max(...jobs.map(j=>j.replyVisibleMs)),maxDispatchMs:Math.max(...jobs.map(j=>j.firstObservedDispatchMs??0)),readyCapacityWhilePendingSamples:blocked.map(s=>({atMs:s.at-round.startedAt,pending:s.pending,workers:s.workers.map(w=>({slot:w.slot,ready:w.ready,activeCount:w.activeCount}))})),jobs};
});
console.log(JSON.stringify({source:file,completed:r.completed,gatewayPid:r.gatewayPid,rounds},null,2));
