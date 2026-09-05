import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const g='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const before='/opt/vlab/experiments/worker-openclaw91-transcript-v1';
const after='/opt/vlab/experiments/worker-native-parity-v1';
assert(fs.existsSync(after+'/native-harness-data.mjs'));
const files=[g+'/state/openclaw.json',g+'/experiments/agent-worker-isolation-v1/worker-openclaw.json'];
const plans=files.map(file=>{
 const raw=fs.readFileSync(file,'utf8'),cfg=JSON.parse(raw.replaceAll(before,after));
 assert.notEqual(raw,raw.replaceAll(before,after));
 // Stable Lab test model; do not use the unrelated unfinished Astra probe.
 cfg.agents.entries.makaron.model.primary='deepseek/deepseek-v4-pro';
 const backup=file+'.pre-native-parity-v1';assert(!fs.existsSync(backup));
 return {file,raw,changed:JSON.stringify(cfg,null,2)+'\n',backup,stat:fs.statSync(file)};
});
for(const p of plans) {fs.writeFileSync(p.backup,p.raw,{flag:'wx',mode:0o600});fs.chownSync(p.backup,p.stat.uid,p.stat.gid);}
for(const p of plans) {const tmp=p.file+'.parity-v1.tmp';fs.writeFileSync(tmp,p.changed,{flag:'wx',mode:p.stat.mode&0o777});fs.chownSync(tmp,p.stat.uid,p.stat.gid);fs.renameSync(tmp,p.file);}
console.log(JSON.stringify({vlabOnly:true,release:after,configs:plans.length,testModel:'deepseek/deepseek-v4-pro'}));
