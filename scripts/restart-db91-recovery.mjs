import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {db91SignalPolicy} from './db91-production-plan.mjs';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const [tag]=process.argv.slice(2);assert(/^[a-z0-9-]{1,32}$/.test(tag));
const root='/home/openclaw/.openclaw',source='/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1/source/scripts/';
const report=JSON.parse(fs.readFileSync(root+'/backups/v2026.9.1-db91.1/recovery-'+tag+'.json'));
assert(report.readyForRestart&&!report.completed);assert.equal(fs.readFileSync(report.marker,'utf8'),report.runId+'\n');
assert.equal(Number(execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim()),report.beforePid);
const timer='openclaw-gateway-memory-snapshot.timer',active=execFileSync('systemctl',['show',timer,'-p','ActiveState','--value'],{encoding:'utf8'}).trim()==='active';
if(active)execFileSync('systemctl',['stop',timer]);
try{
 execFileSync(process.execPath,[source+'control-db91-production.mjs','stop'],{stdio:'inherit',timeout:90000});
 execFileSync(process.execPath,[source+'control-db91-production.mjs','start'],{stdio:'inherit',timeout:90000});
 const file='/etc/systemd/system/openclaw-gateway.service.d/zzzz-db91-stop-policy.conf';assert.equal(fs.readFileSync(file,'utf8'),db91SignalPolicy);fs.unlinkSync(file);execFileSync('systemctl',['daemon-reload']);
}finally{if(active)execFileSync('systemctl',['start',timer]);}
