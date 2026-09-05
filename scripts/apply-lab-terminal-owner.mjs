import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,'01a06fbe-7654-7331-8d6e-73a8cd2dcd7e');
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902',main=root+'/state/openclaw.json';
const old=root+'/runtime/plugins/worker-native-hooks-20260905',dest=root+'/runtime/plugins/worker-terminal-6a93939';
assert.equal(createHash('sha256').update(fs.readFileSync(old+'/index.mjs')).digest('hex'),'9a77778db7b1e2cffc2439cc4f2d83cf6923aef979dd1df4f42f577790af67bf');
assert(!fs.existsSync(dest));
const config=JSON.parse(fs.readFileSync(main)),paths=[main,config.plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath];
for(const p of paths)assert(JSON.parse(fs.readFileSync(p)).plugins.load.paths.includes(old));
const backup=root+'/backups/worker-terminal-6a93939';fs.mkdirSync(backup,{mode:0o700});
fs.cpSync(old,dest,{recursive:true,verbatimSymlinks:true});
fs.copyFileSync('/tmp/terminal-owner-index.mjs',dest+'/index.mjs');
fs.copyFileSync('/tmp/gateway-owned-terminal.mjs',dest+'/gateway-owned-terminal.mjs');
execFileSync('chown',['-R','vlab:vlab',dest]);
for(const [i,p] of paths.entries()) {
 const raw=fs.readFileSync(p),c=JSON.parse(raw),st=fs.statSync(p);fs.writeFileSync(backup+'/'+i+'.before.json',raw,{flag:'wx',mode:0o600});
 c.plugins.load.paths=c.plugins.load.paths.map(x=>x===old?dest:x);
 const temp=p+'.terminal-owner-'+process.pid;fs.writeFileSync(temp,JSON.stringify(c,null,2)+'\n',{mode:st.mode});fs.chownSync(temp,st.uid,st.gid);fs.renameSync(temp,p);
}
console.log(JSON.stringify({labOnly:true,commit:'6a9393930676963f2338d8de006cccd0da0d761c',dest,backup}));
