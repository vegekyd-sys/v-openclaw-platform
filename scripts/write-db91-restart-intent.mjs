import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),fs.statSync('/home/openclaw/.openclaw').uid);assert(process.getuid()>0);
const [core,rawPid]=process.argv.slice(2),pid=Number(rawPid);
assert(['/opt/openclaw-2026.9.1-v/openclaw','/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1/core'].includes(core));
const get=k=>execFileSync('systemctl',['show','openclaw-gateway.service','-p',k,'--value'],{encoding:'utf8'}).trim();
assert(pid>1&&Number(get('MainPID'))===pid);assert.equal(get('KillMode'),'mixed');
const {a:writeIntent}=await import(core+'/dist/restart-intent-BYVo1227.js');
assert(writeIntent({targetPid:pid,reason:'db91-production-controlled-restart',intent:{waitMs:30000},env:process.env}));
console.log(JSON.stringify({nativeRestartIntentWritten:true,targetPid:pid,nativeDrainMs:30000,serviceUser:true}));
