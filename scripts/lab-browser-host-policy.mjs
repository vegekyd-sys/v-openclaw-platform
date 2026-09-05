import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,'01a06fbe-7654-7331-8d6e-73a8cd2dcd7e');
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902',main=root+'/state/openclaw.json';
const backup=root+'/backups/browser-exact-hosts-20260905';fs.mkdirSync(backup,{mode:0o700});
for(const [i,p] of [main,JSON.parse(fs.readFileSync(main)).plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath].entries()){
 const raw=fs.readFileSync(p),c=JSON.parse(raw);fs.writeFileSync(backup+'/'+i+'.before.json',raw,{flag:'wx',mode:0o600});
 c.browser.ssrfPolicy={...c.browser.ssrfPolicy,allowedHostnames:[...new Set([...(c.browser.ssrfPolicy?.allowedHostnames??[]),'localhost','192.168.1.50'])]};
 const st=fs.statSync(p),temp=p+'.host-policy-'+process.pid;fs.writeFileSync(temp,JSON.stringify(c,null,2)+'\n',{mode:st.mode});fs.chownSync(temp,st.uid,st.gid);fs.renameSync(temp,p);
}
console.log(JSON.stringify({labOnly:true,exactHosts:['localhost','192.168.1.50'],privateNetworkBlanketAllow:false,backup}));
