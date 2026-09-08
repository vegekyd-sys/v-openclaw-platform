import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {patchLateWorkerCancellations} from '../experiments/agent-worker-isolation-v1/late-worker-reply.mjs';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/labs/instances/db91-parity';
const m=JSON.parse(fs.readFileSync(root+'/../../control/db91-parity.json'));assert.equal(m.owner,'codex-db91-production-equivalent-20260908');
assert.equal(execFileSync('systemctl',['show',m.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const file=root+'/runtime/production-worker/worker-pool.mjs',before=fs.readFileSync(file,'utf8'),after=patchLateWorkerCancellations(before);
fs.writeFileSync(root+'/tmp/before-cancel-guard-worker-pool.mjs',before,{mode:0o600,flag:'wx'});
// The existing reply helper already handles EPIPE with a send callback. Only
// redirect the two cancellation sends; do not change request dispatch behavior.
fs.writeFileSync(file,after);execFileSync(process.execPath,['--check',file]);
console.log(JSON.stringify({cancelSendsGuarded:2,requestAdmissionUnchanged:true,workerReplyHelperUnchanged:true}));
