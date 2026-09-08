import {execFileSync} from 'node:child_process';
import os from 'node:os';
import assert from 'node:assert/strict';
assert.equal(os.hostname(),'VM-8-2-ubuntu');
assert.equal(process.getuid(),0);
const source='/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1/source/scripts/';
const control=mode=>execFileSync(process.execPath,[source+'control-db91-production.mjs',mode],{stdio:'inherit',timeout:600000});
control('stop');
try {
 execFileSync('python3',[source+'snapshot-db91-release.py','final'],{stdio:'inherit',timeout:1200000});
 control('apply');
 control('start');
 control('verify');
} catch(error) {
 const pid=Number(execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim());
 if(pid>1)control('stop');
 control('rollback');
 throw error;
}
