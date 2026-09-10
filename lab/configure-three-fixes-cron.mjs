// Operator-owned opt-in only. The release cutover performs the coordinated restart.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const [scope,owner,mode='install']=process.argv.slice(2);
assert(['lab','production'].includes(scope));assert(['install','rollback','verify'].includes(mode));assert.equal(process.getuid(),0);
assert.equal(os.hostname(),scope==='lab'?'VM-0-4-ubuntu':'VM-8-2-ubuntu');
if(scope==='lab')assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,owner);
const unit=scope==='lab'?'openclaw-vlab-production-mirror-v8.service':'openclaw-gateway.service';
const dir='/etc/openclaw-cron-shared-20260910',policy=dir+'/policy.json',drop='/etc/systemd/system/'+unit+'.d/93-cron-shared-management-20260910.conf';
const policyBody=JSON.stringify({version:1,agents:{makaron:{mode:'shared',enabled:true}}},null,2)+'\n';
const dropBody='[Service]\nEnvironment=OPENCLAW_CRON_SHARED_POLICY='+policy+'\n';
function exact(file,body){const s=fs.lstatSync(file);assert(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o022)===0);assert.equal(fs.readFileSync(file,'utf8'),body);}
function verify(){const s=fs.lstatSync(dir);assert(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o022)===0);exact(policy,policyBody);exact(drop,dropBody);}
if(mode==='install'){
  if(fs.existsSync(dir)||fs.existsSync(drop)){verify();}
  else {
    const parent=fs.lstatSync('/etc/systemd/system/'+unit+'.d');assert(parent.isDirectory()&&parent.uid===0&&(parent.mode&0o022)===0);
    fs.mkdirSync(dir,{mode:0o755});fs.chmodSync(dir,0o755);
    fs.writeFileSync(policy,policyBody,{flag:'wx',mode:0o644});fs.chmodSync(policy,0o644);
    fs.writeFileSync(drop,dropBody,{flag:'wx',mode:0o644});fs.chmodSync(drop,0o644);verify();
  }
}else if(mode==='rollback'){
  verify();fs.unlinkSync(drop);fs.unlinkSync(policy);fs.rmdirSync(dir);
}else verify();
if(mode!=='verify')execFileSync('systemctl',['daemon-reload']);
console.log(JSON.stringify({scope,mode,unit,policy,agent:'makaron',individualAllowlist:false,restartPerformed:false}));
