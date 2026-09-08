// Explicit user approval 2026-09-09: enable V's existing allowBots setting.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const root='/home/openclaw/.openclaw',release='/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1';
const pid=execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();assert(Number(pid)>1);
for(const e of fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0')){const i=e.indexOf('=');if(i>0)process.env[e.slice(0,i)]=e.slice(i+1);}
const cfg=JSON.parse(fs.readFileSync(root+'/openclaw.json')),files=[root+'/openclaw.json',cfg.plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath];
const dir=root+'/backups/v2026.9.1-db91.1/allow-bots-'+Date.now();fs.mkdirSync(dir,{mode:0o750});const gid=fs.statSync(root).gid;fs.chownSync(dir,0,gid);fs.chmodSync(dir,0o750);
const staged=[];
for(const [i,file] of files.entries()){
 const before=fs.readFileSync(file),st=fs.statSync(file),value=JSON.parse(before);assert(value.channels.feishu);assert.notEqual(value.channels.feishu.allowBots,true);
 fs.writeFileSync(dir+'/'+i+'.before',before,{mode:0o600,flag:'wx'});
 const after=structuredClone(value);after.channels.feishu.allowBots=true;const check=structuredClone(after);if(Object.hasOwn(value.channels.feishu,'allowBots'))check.channels.feishu.allowBots=value.channels.feishu.allowBots;else delete check.channels.feishu.allowBots;assert.deepEqual(check,value);
 const bytes=JSON.stringify(after,null,2)+'\n',path=dir+'/'+i+'.after';fs.writeFileSync(path,bytes,{mode:0o640,flag:'wx'});fs.chownSync(path,0,gid);fs.chmodSync(path,0o640);
 try{execFileSync('/usr/sbin/runuser',['-u','openclaw','--',process.execPath,release+'/core/openclaw.mjs','config','validate','--json'],{env:{...process.env,OPENCLAW_CONFIG_PATH:path},timeout:60000,stdio:'pipe'});}catch{throw Error('Staged allowBots config validation failed');}
 staged.push({file,before,bytes,st});
}
for(const {file,before,bytes,st} of staged){assert(fs.readFileSync(file).equals(before),'Concurrent config change');const tmp=file+'.allow-bots-'+process.pid;fs.writeFileSync(tmp,bytes,{mode:st.mode&0o777,flag:'wx'});fs.chownSync(tmp,st.uid,st.gid);fs.chmodSync(tmp,st.mode&0o777);fs.renameSync(tmp,file);}
console.log(JSON.stringify({allowBots:true,scope:'Feishu account',configs:staged.length,otherFieldsUnchanged:true,beforePid:pid,backup:dir}));
