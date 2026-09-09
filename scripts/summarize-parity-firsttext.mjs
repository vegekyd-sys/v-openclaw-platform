import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/labs/instances/db91-parity',file=process.argv[2];assert(/^[a-z0-9_-]+-\d+\.json$/.test(file));
const r=JSON.parse(fs.readFileSync(root+'/tmp/firsttext-results/'+file));
const since=new Date(r.startedAt).toISOString().replace('T',' ').replace(/\.\d+Z$/,' UTC');
const logs=execFileSync('journalctl',['-u','openclaw-lab-db91-parity.service','--since',since,'--no-pager','-o','json'],{encoding:'utf8',maxBuffer:40*1024**2});
const jobs=new Map(r.jobs.map(j=>[j.runId,{...j,stages:[],bundle:[],prompt:[],db:[]}]));
for(const line of logs.split('\n').filter(Boolean)){
 const message=String(JSON.parse(line).MESSAGE??'');
 for(const m of message.matchAll(/\[(db91-hi-stage|bundle-prep-observer|prompt-prep-observer\.1|db91-session-phase)\] (\{[^\n]+\})/g)){
  let p;try{p=JSON.parse(m[2]);}catch{continue;}const j=jobs.get(p.runId);if(!j)continue;
  j[m[1]==='db91-hi-stage'?'stages':m[1]==='bundle-prep-observer'?'bundle':m[1]==='db91-session-phase'?'db':'prompt'].push(p);
 }
}
console.log(JSON.stringify({source:file,completed:r.completed,scope:r.scope,thinking:r.thinking,jobs:[...jobs.values()].map(j=>({
 mode:j.mode,runId:j.runId,firstTextMs:j.firstTextMs,chatFirstTextMs:j.chatFirstTextMs,finalMs:j.finalMs,verified:j.verified,failure:j.failure,assistants:j.assistants,
 stages:j.stages.map(({runId,monoMs,atMs,...s})=>({...s,atMs:atMs-j.start})),
 bundle:j.bundle,prompt:j.prompt,db:j.db,
}))},null,2));
