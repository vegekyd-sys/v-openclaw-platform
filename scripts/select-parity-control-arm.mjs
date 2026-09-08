import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/labs/instances/db91-parity';const [arm]=process.argv.slice(2);
const choices={control:[1,0,0],candidate:[1,1,1],'cold-baseline':[0,0,0]};assert(Object.hasOwn(choices,arm));
const m=JSON.parse(fs.readFileSync(root+'/../../control/db91-parity.json'));assert.equal(m.owner,'codex-db91-production-equivalent-20260908');
assert.equal(execFileSync('systemctl',['show',m.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const keys=['OPENCLAW_DB91_READ_AHEAD_ENABLE','OPENCLAW_DB91_STATE_READ_AHEAD_ENABLE','OPENCLAW_DB91_TRAJECTORY_SWEEP_ENABLE'];
const file=root+'/secrets.env';let content=fs.readFileSync(file,'utf8');const before={},after={};
for(const [index,key]of keys.entries()){const re=new RegExp('^'+key+'=([01])$','gm'),found=[...content.matchAll(re)];assert.equal(found.length,1);before[key]=Number(found[0][1]);after[key]=choices[arm][index];content=content.replace(re,key+'='+choices[arm][index]);}
fs.writeFileSync(file,content,{mode:0o600});
const report={at:new Date().toISOString(),arm,before,after,allOtherConfigurationUnchanged:true};
fs.writeFileSync(root+'/tmp/control-arm-'+Date.now()+'.json',JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});console.log(JSON.stringify(report));
