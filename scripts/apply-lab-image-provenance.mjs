import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,'01a06fbe-7654-7331-8d6e-73a8cd2dcd7e');
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902',main=root+'/state/openclaw.json';
const old=root+'/runtime/plugins/worker-terminal-6a93939',dest=root+'/runtime/plugins/worker-image-provenance-5f9e136',archive='/tmp/worker-0210-5f9e136.tar.gz',backup=root+'/backups/worker-image-provenance-5f9e136';
assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),process.argv[2]);assert(!fs.existsSync(dest));
const paths=[main,JSON.parse(fs.readFileSync(main)).plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath];
for(const p of paths)assert(JSON.parse(fs.readFileSync(p)).plugins.load.paths.includes(old));
fs.mkdirSync(backup,{mode:0o700});fs.cpSync(old,dest,{recursive:true,verbatimSymlinks:true});execFileSync('tar',['-xzf',archive,'--strip-components=2','-C',dest]);execFileSync('chown',['-R','vlab:vlab',dest]);
for(const [i,p] of paths.entries()) {const raw=fs.readFileSync(p),c=JSON.parse(raw),st=fs.statSync(p);fs.writeFileSync(backup+'/'+i+'.before.json',raw,{flag:'wx',mode:0o600});c.plugins.load.paths=c.plugins.load.paths.map(x=>x===old?dest:x);const t=p+'.image-provenance-'+process.pid;fs.writeFileSync(t,JSON.stringify(c,null,2)+'\n',{mode:st.mode});fs.chownSync(t,st.uid,st.gid);fs.renameSync(t,p);}
console.log(JSON.stringify({labOnly:true,dest,backup}));
