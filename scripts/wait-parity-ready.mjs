// Read-only startup barrier for the owned instance; no relaxed native deadline.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/labs/instances/db91-parity',unit='openclaw-lab-db91-parity.service';
assert.equal(JSON.parse(fs.readFileSync(root+'/../../control/db91-parity.json')).owner,'codex-db91-production-equivalent-20260908');
const started=Date.now();let firstPid,reported=started;
while(Date.now()-started<360000){
 const info=Object.fromEntries(execFileSync('systemctl',['show',unit,'-p','MainPID','-p','ActiveState','-p','NRestarts'],{encoding:'utf8'}).trim().split('\n').map(line=>line.split('=')));
 assert.notEqual(info.ActiveState,'failed');assert.equal(Number(info.NRestarts),0,'Unexpected automatic restart');
 const pid=Number(info.MainPID);
 if(pid>1){firstPid??=pid;assert.equal(pid,firstPid,'Gateway changed during startup');const log=execFileSync('journalctl',['-q','-u',unit,'_PID='+pid,'-n','500','-o','cat','--no-pager'],{encoding:'utf8',maxBuffer:8*1024*1024});
  if(log.includes('[gateway] ready')){console.log(JSON.stringify({ready:true,pid,barrierWaitMs:Date.now()-started}));process.exit(0);}}
 if(Date.now()-reported>=30000){reported=Date.now();console.log(JSON.stringify({waitingForNativeReady:true,elapsedMs:Date.now()-started,pid}));}
 await new Promise(resolve=>setTimeout(resolve,1000));
}
throw Error('Native ready barrier exceeded 360 seconds; native integrity deadline remains 300 seconds');
