import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {patchPersistedUserTurnFile} from './db91-persisted-user-turn-plan.mjs';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const lease=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json'));
assert.equal(lease.owner,'codex-db91-contention-20260907');
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const verify=process.argv.includes('--verify'),restore=process.argv.includes('--restore'),dry=process.argv.includes('--dry-run');
if(!verify&&!dry)assert.equal(execFileSync('systemctl',['show','openclaw-vlab-production-mirror-v8.service','-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const hash=s=>createHash('sha256').update(s).digest('hex');
const before={
 'index.mjs':'640c4a3219184080b9124b2ec94ee8dd26baaf8f361b8729c7b47f4f2280fe27',
 'native-attempt-bridge.mjs':'476cb500f0b30754f8df7921d831e9fac99de6b705866143a0de23d4484e0431',
 'user-turn-ownership.mjs':'5fb8913ebaf328b95ee35093598bf0ad31c261d896117adb8ce7ad1a725dc99f',
};
const helper=fs.readFileSync(new URL('../experiments/agent-worker-isolation-v1/user-turn-ownership.mjs',import.meta.url),'utf8');
const plans=Object.entries(before).map(([name,sha])=>{
 const file=root+'/runtime/plugins/worker-v-platform-0.1.0-integration.1/'+name;
 const backup=root+'/state/db91-persisted-user-turn.'+name;
 const original=fs.readFileSync(fs.existsSync(backup)?backup:file,'utf8');assert.equal(hash(original),sha,'baseline drift '+name);
 const after=patchPersistedUserTurnFile(name,original,helper),current=fs.readFileSync(file,'utf8');
 assert(current===original||current===after,'concurrent native modification '+name);
 if(verify)assert.equal(current,restore?original:after);
 return {file,backup,original,after};
});
for(const p of plans){
 if(!verify&&!dry){if(!fs.existsSync(p.backup))fs.writeFileSync(p.backup,p.original,{mode:0o600,flag:'wx'});fs.writeFileSync(p.file,restore?p.original:p.after);}
 console.log(JSON.stringify({file:p.file,beforeSha:hash(p.original),afterSha:hash(p.after),verify,dry,restore}));
}
