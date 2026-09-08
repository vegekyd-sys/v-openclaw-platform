// Called only by the owner/lease-checked labctl branch. Use native intent API.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const root='/srv/vlab-production-mirror/labs/instances/db91-parity';
assert.equal(process.env.OPENCLAW_STATE_DIR,root+'/state');assert.equal(process.getuid(),fs.statSync(root+'/state').uid);assert(process.getuid()>0);
const unit='openclaw-lab-db91-parity.service';
const read=key=>execFileSync('systemctl',['show',unit,'-p',key,'--value'],{encoding:'utf8'}).trim();
const pid=Number(read('MainPID'));assert(pid>1);assert.equal(read('KillMode'),'mixed','Start the new mixed-signal unit before testing native restart');
const {a:writeGatewayRestartIntentSync}=await import(pathToFileURL(root+'/runtime/openclaw/dist/restart-intent-BYVo1227.js'));
assert(writeGatewayRestartIntentSync({targetPid:pid,reason:'owned-vlab-restart-recovery',intent:{waitMs:0},env:process.env}),'Native restart intent write failed');
assert.equal(Number(read('MainPID')),pid,'Gateway changed while preparing intent');
console.log(JSON.stringify({nativeRestartIntentWritten:true,targetPid:pid,waitMs:0,signalPolicy:'mixed',noUserRequestReplay:true}));
