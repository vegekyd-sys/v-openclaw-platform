import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
assert.equal(os.hostname(), 'VM-0-4-ubuntu');
const base='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const before='/opt/vlab/experiments/worker-openclaw91-8750ef7';
const after='/opt/vlab/experiments/worker-openclaw91-395c9d9';
assert(fs.existsSync(after+'/harness-channel.mjs'));
const files=[base+'/state/openclaw.json',base+'/experiments/agent-worker-isolation-v1/worker-openclaw.json'];
const plans=files.map(file=>{
  const raw=fs.readFileSync(file,'utf8');
  const config=JSON.parse(raw);
  const changed=raw.split(before).join(after);
  assert.notEqual(raw,changed, 'Expected old release reference: '+file);
  JSON.parse(changed);
  if(file===files[0]) assert.equal(config.channels.feishu.appId,'${VLAB_FEISHU_APP_ID}');
  const backup=file+'.pre-395c9d9';
  assert(!fs.existsSync(backup));
  return {file,raw,changed,backup,stat:fs.statSync(file)};
});
for(const p of plans) {
  fs.writeFileSync(p.backup,p.raw,{flag:'wx',mode:0o600});
  fs.chownSync(p.backup,p.stat.uid,p.stat.gid);
}
for(const p of plans) {
  const tmp=p.file+'.395c9d9.tmp';
  fs.writeFileSync(tmp,p.changed,{flag:'wx',mode:p.stat.mode&0o777});
  fs.chownSync(tmp,p.stat.uid,p.stat.gid);
  fs.renameSync(tmp,p.file);
}
console.log(JSON.stringify({candidateOnly:true,release:after,configs:plans.length}));
