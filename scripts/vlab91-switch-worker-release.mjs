import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const [before,after]=process.argv.slice(2);
for(const p of [before,after])assert.match(p??'',/^\/opt\/vlab\/experiments\/worker-openclaw91-[a-z0-9-]+$/);
assert.notEqual(before,after);assert(fs.existsSync(after+'/native-attempt-bridge.mjs'));
const base='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const files=[base+'/state/openclaw.json',base+'/experiments/agent-worker-isolation-v1/worker-openclaw.json'];
const plans=files.map(file=>{
 const raw=fs.readFileSync(file,'utf8'), changed=raw.split(before).join(after),st=fs.statSync(file);
 assert.notEqual(raw,changed);JSON.parse(changed);
 const backup=file+'.before-'+after.split('/').at(-1);assert(!fs.existsSync(backup));
 return {file,raw,changed,st,backup};
});
for(const p of plans){fs.writeFileSync(p.backup,p.raw,{mode:0o600,flag:'wx'});fs.chownSync(p.backup,p.st.uid,p.st.gid);}
for(const p of plans){const tmp=p.file+'.switch-'+process.pid;fs.writeFileSync(tmp,p.changed,{flag:'wx',mode:p.st.mode&0o777});fs.chownSync(tmp,p.st.uid,p.st.gid);fs.renameSync(tmp,p.file);}
console.log(JSON.stringify({candidateOnly:true,before,after}));
