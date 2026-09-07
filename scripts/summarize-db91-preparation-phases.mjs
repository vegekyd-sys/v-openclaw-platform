import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const dir='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902/state/db91-c5-release-20260907';
const file=process.argv[2]??fs.readdirSync(dir).filter(n=>/^timeline-\d+\.json$/.test(n)).sort().at(-1);
assert(/^timeline-\d+\.json$/.test(file));const r=JSON.parse(fs.readFileSync(dir+'/'+file));assert(r.completed);
const jobs=new Map(r.rounds.flatMap(round=>round.jobs.map((j,index)=>[j.runId,{round:round.label,index,runId:j.runId,replyMs:j.replyVisibleMs,phases:{}}])));
const since=new Date(r.startedAt).toISOString().replace('T',' ').replace(/\.\d+Z$/,' UTC');
const logs=execFileSync('journalctl',['-u','openclaw-vlab-production-mirror-v8.service','--since',since,'--no-pager','-o','json'],{encoding:'utf8',maxBuffer:32*1024**2});
for(const line of logs.split('\n').filter(Boolean)){
 const row=JSON.parse(line),text=String(row.MESSAGE??'');
 for(const m of text.matchAll(/\[db91-(worker|attempt|prompt)-phase\] (\{[^\n]+\})/g)){
  let p;try{p=JSON.parse(m[2]);}catch{continue;}const j=jobs.get(p.runId);if(!j)continue;
  const key=m[1]+'/'+(p.phase??p.stage);(j.phases[key]??=[]).push(p.elapsedMs);
 }
}
const rows=[...jobs.values()].map(j=>({...j,preparationMs:Math.round(Object.entries(j.phases).filter(([k])=>k.startsWith('attempt/')||k.startsWith('worker/')).flatMap(([,v])=>v).reduce((a,b)=>a+b,0))}));
console.log(JSON.stringify({source:file,jobs:rows},null,2));
