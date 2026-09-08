// Read-only on production, only stage/identity metadata leaves the host.
import {execFileSync} from 'node:child_process';
const ssh=['-S','none','-o','ProxyCommand=/usr/local/bin/tailscale nc 100.82.39.107 22','-o','HostKeyAlias=100.82.39.107','-i','/Users/tianyicai/.ssh/v-zkda-20260719','-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','ConnectTimeout=10','ubuntu@100.82.39.107'];
const source=String.raw`
import fs from 'node:fs';import readline from 'node:readline';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';
const hash=s=>s?createHash('sha256').update(s).digest('hex').slice(0,16):undefined;
const start=Date.parse('2026-09-08T07:42:40Z'),oldStart=Date.parse('2026-09-08T01:00:00Z');
const prep=[],lifecycle=[],delivery=[],oldSlow=[];
for await(const line of readline.createInterface({input:fs.createReadStream('/tmp/openclaw/openclaw-2026-09-08.log')})){
 let d;try{d=JSON.parse(line)}catch{continue}const at=d.time,t=Date.parse(at);if(t<oldStart)continue;
 const s=[d['0'],d['1'],d['2'],d['3']].filter(x=>typeof x==='string').join(' ');
 const field=k=>s.match(new RegExp('(?:^|[ \\n])'+k+'=([^ ,]+)'))?.[1];
 if(s.includes('prep stages:')){const stages=Object.fromEntries([...s.matchAll(/([\w-]+):(\d+)ms@(\d+)ms/g)].map(m=>[m[1],{ms:+m[2],endMs:+m[3]}]));const r={at,trace:d.traceId,runId:field('runId'),sessionId:field('sessionId'),totalMs:Number(field('totalMs')),phase:field('phase'),stages};if(t>=start)prep.push(r);else if(r.totalMs>=30000)oldSlow.push(r);}
 if(t<start)continue;
 const event=s.match(/embedded run (?:start|done|prompt start|prompt end|agent start|agent end):/);
 if(event)lifecycle.push({at,event:event[0],trace:d.traceId,runId:field('runId'),sessionId:field('sessionId'),durationMs:Number(field('durationMs'))||undefined,aborted:field('aborted'),isError:field('isError')});
 if(s.includes('message processed:')||s.includes('message dispatch completed:'))delivery.push({at,event:s.includes('message processed:')?'processed':'dispatched',trace:d.traceId,sessionHash:hash(field('sessionKey')),sessionId:field('sessionId'),messageId:field('messageId'),outcome:field('outcome'),durationMs:Number(s.match(/duration=(\d+)ms/)?.[1]),recoveryConflict:s.includes('restart recovery claim changed')});
}
const journal=execFileSync('journalctl',['-u','openclaw-gateway.service','--since','2026-09-08 15:42:40','--no-pager','-o','cat'],{encoding:'utf8',maxBuffer:64e6});
const bundles=[],prompts=[];
for(const s of journal.split('\n'))for(const [prefix,out]of[['[bundle-prep-observer] ',bundles],['[prompt-prep-observer.1] ',prompts]]){const i=s.indexOf(prefix);if(i>=0)try{out.push(JSON.parse(s.slice(i+prefix.length)))}catch{}}
const stats=a=>{a=a.filter(Number.isFinite).sort((a,b)=>a-b);const n=a.length;return{n,min:a[0],median:n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2,p95:a[Math.ceil(n*.95)-1],max:a.at(-1)}};
const totals=prompts.filter(p=>p.stage==='total'),ends=bundles.filter(p=>p.kind==='end');
console.log(JSON.stringify({at:new Date().toISOString(),stats:{prompt:stats(totals.map(p=>p.elapsedMs)),bundle:stats(ends.map(p=>p.totalMs)),prepThresholded:stats(prep.map(p=>p.totalMs))},oldSlow,prep,lifecycle,delivery,
 bundles:ends.map(b=>({runId:b.runId,sessionHash:b.sessionHash,pid:b.pid,at:b.at,totalMs:b.totalMs,outcome:b.outcome,eventLoopLagMaxMs:b.eventLoopLagMaxMs,catalogGet:b.events.filter(e=>e.stage==='catalog-get'),serverTimings:b.events.filter(e=>/^server-(connect|list)-(start|end|error)$/.test(e.stage))})),
 prompts:totals.map(p=>({runId:p.runId,pid:p.pid,atMs:p.atMs,totalMs:p.elapsedMs,stages:prompts.filter(x=>x.runId===p.runId&&!['start','total'].includes(x.stage)).map(x=>({stage:x.stage,ms:x.elapsedMs,outcome:x.outcome}))}))}));
`;
process.stdout.write(execFileSync('ssh',[...ssh,'sudo /opt/node-v22.23.1/bin/node --input-type=module'],{input:source,encoding:'utf8',timeout:60000,maxBuffer:16e6}));
