import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,'01a06fbe-7654-7331-8d6e-73a8cd2dcd7e');
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const main=root+'/state/openclaw.json';
const paths=[main,JSON.parse(fs.readFileSync(main)).plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath];
for(const [i,p] of paths.entries()) {
 fs.copyFileSync(p,root+'/backups/astra-codex-alias-20260905/'+i+'.before-command-owner.json',fs.constants.COPYFILE_EXCL);
 const c=JSON.parse(fs.readFileSync(p));
 c.commands.ownerAllowFrom=[...new Set([...c.commands.ownerAllowFrom,'feishu:ou_775a78b0aaae67da5e15eeaf102e3cd9'])];
 fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');
}
console.log(JSON.stringify({labOwnerMappingCorrected:true,productionChanged:false}));
