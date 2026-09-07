import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {instrumentPrompt,instrumentWorker} from './db91-prompt-trace-plan.mjs';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const shared=process.argv.includes('--shared'),restore=process.argv.includes('--restore');
const owner='codex-db91-contention-20260907';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const m=read('/srv/vlab-production-mirror/labs/control/'+(shared?'integration':'db91-fix')+'.json');
assert.equal(m.owner,owner);
const root=shared?'/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902':m.root;
const unit=shared?'openclaw-vlab-production-mirror-v8.service':m.unit;
assert.equal(execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0','stop scoped idle runtime first');
const file=root+(shared?'/runtime/npm-global/lib/node_modules/openclaw':'/runtime/openclaw')+'/dist/builtin-openclaw-zQV8Wwjr.js';
const backup=root+'/state/db91-prompt-trace.original.js';
const worker=root+(shared?'/runtime/plugins/worker-v-platform-0.1.0-integration.1':'/runtime/worker')+'/worker.mjs';
const workerBackup=root+'/state/db91-worker-trace'+(process.argv.includes('--callbacks')?'.callbacks':'')+'.original.mjs';
const plans=[[file,backup,instrumentPrompt],[worker,workerBackup,instrumentWorker]].map(([file,backup,instrument])=>{
 const original=fs.readFileSync(fs.existsSync(backup)?backup:file,'utf8');
 const patched=instrument(original),current=fs.readFileSync(file,'utf8');
 assert(current===original||current===patched,'unexpected concurrent native modification');
 return {file,backup,original,patched};
});
for(const {file,backup,original,patched} of plans){
 if(!fs.existsSync(backup))fs.writeFileSync(backup,original,{mode:0o600,flag:'wx'});
 fs.writeFileSync(file,restore?original:patched);
 console.log(JSON.stringify({shared,restored:restore,file,sha256:createHash('sha256').update(restore?original:patched).digest('hex')}));
}
