import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,'01a06fbe-7654-7331-8d6e-73a8cd2dcd7e');
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const source='/srv/vlab-production-mirror/labs/instances/astra/runtime/codex-0.153.4';
const target=root+'/runtime/codex-0.153.4';assert(!fs.existsSync(target));
fs.cpSync(source,target,{recursive:true,errorOnExist:true,force:false});
const binary=target+'/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex';
assert.equal(execFileSync(binary,['--version'],{encoding:'utf8'}).trim(),'codex-cli 0.153.4');
const main=root+'/state/openclaw.json';
for(const [i,p] of [main,JSON.parse(fs.readFileSync(main)).plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath].entries()) {
 fs.copyFileSync(p,root+'/backups/astra-codex-alias-20260905/'+i+'.before-codex-binary.json',fs.constants.COPYFILE_EXCL);
 const c=JSON.parse(fs.readFileSync(p));c.plugins.entries.codex.config.appServer.command=binary;
 fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');
}
console.log(JSON.stringify({binary,version:'0.153.4',sha256:createHash('sha256').update(fs.readFileSync(binary)).digest('hex'),productionChanged:false}));
