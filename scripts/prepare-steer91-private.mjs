import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const root='/srv/vlab-production-mirror/labs/instances/steer91';
const m=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/steer91.json'));
assert.equal(m.owner,'01a06fbe-7654-7331-8d6e-73a8cd2dcd7e');
assert.equal(execFileSync('systemctl',['show',m.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
assert.equal(fs.realpathSync(root),root);
fs.cpSync(root+'/source/experiments/agent-worker-isolation-v1',root+'/runtime/worker',{recursive:true});
for(const name of ['openclaw.json','worker-openclaw.json']) {
  const p=root+'/state/'+name,c=JSON.parse(fs.readFileSync(p));
  assert.equal(Object.keys(c.channels).length,0);
  c.messages={...c.messages,queue:{mode:'steer'}};
  fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');
}
execFileSync('chown',['-R',m.user+':'+m.user,root+'/runtime/worker',root+'/state']);
console.log(JSON.stringify({prepared:true,privateOnly:true,worker:JSON.parse(fs.readFileSync(root+'/runtime/worker/package.json')).version}));
