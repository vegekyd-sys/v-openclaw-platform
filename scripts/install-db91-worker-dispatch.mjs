// Exact, reversible delta on the owned Lab / leased integration worker only.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const shared=process.argv.includes('--shared'),restore=process.argv.includes('--restore');
const owner='codex-db91-contention-20260907',read=p=>JSON.parse(fs.readFileSync(p));
const m=read('/srv/vlab-production-mirror/labs/control/'+(shared?'integration':'db91-fix')+'.json');assert.equal(m.owner,owner);
const root=shared?'/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902':m.root;
const unit=shared?'openclaw-vlab-production-mirror-v8.service':m.unit;
assert.equal(execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const file=root+(shared?'/runtime/plugins/worker-v-platform-0.1.0-integration.1':'/runtime/worker')+'/worker-pool.mjs';
const backup=root+'/state/db91-dispatch-pool.original.mjs';
const before=fs.readFileSync(fs.existsSync(backup)?backup:file,'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');
assert.equal(hash(before),shared?'e94a2e91916a63ddb1425ad97268e9d178c10f4743516d776cc134bfe59e7c5d':'7b61b6a859277ada60666d05709595b5feb09d83928e1e644c7310635c656748');
const anchor=`        if (!worker && this.workers.size < this.maxWorkers) {
          worker = await this.spawn(this.findAvailableSlot());
        }
        if (!worker) {
          break;
        }`;
assert.equal(before.split(anchor).length,2);
// Use the committed source's exact replacement; no overwrite of other deltas.
const source=new URL('../experiments/agent-worker-isolation-v1/worker-pool.mjs',import.meta.url);
const updated=fs.readFileSync(source,'utf8');
const from=updated.indexOf('        if (!worker) {\n          // Readiness is an event');
assert(from>=0);const to=updated.indexOf('\n\n        this.pending.shift();',from);assert(to>from);
const after=before.replace(anchor,updated.slice(from,to));
assert([before,after].includes(fs.readFileSync(file,'utf8')),'unrelated runtime edit');
if(!fs.existsSync(backup))fs.writeFileSync(backup,before,{mode:0o600,flag:'wx'});
const stat=fs.statSync(file),tmp=file+'.dispatch-'+process.pid+'.tmp',value=restore?before:after;
fs.writeFileSync(tmp,value,{flag:'wx',mode:stat.mode&0o777});fs.chmodSync(tmp,stat.mode&0o777);fs.chownSync(tmp,stat.uid,stat.gid);fs.renameSync(tmp,file);
console.log(JSON.stringify({shared,restored:restore,file,beforeSha:hash(before),afterSha:hash(value)}));
