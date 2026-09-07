import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const hash=s=>createHash('sha256').update(s).digest('hex');
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const m=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/db91-fix.json','utf8'));
assert.equal(m.owner,'codex-db91-contention-20260907');
assert.equal(m.root,'/srv/vlab-production-mirror/labs/instances/db91-fix');
assert.equal(execFileSync('systemctl',['show',m.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const before={
 'index.mjs':'5da926bc2144bbea78d8ffe39644d9be589a77f927f6d93e3412b5cb9015e332',
 'native-attempt-bridge.mjs':'a5843b97d1e47aaa9f401691915274546fe85e647454a500e102016064b54c0f',
 'user-turn-ownership.mjs':'5fb8913ebaf328b95ee35093598bf0ad31c261d896117adb8ce7ad1a725dc99f',
};
const plans=Object.entries(before).map(([name,expected])=>{
 const file=m.root+'/runtime/worker/'+name,backup=m.root+'/state/db91-persisted-user-turn.'+name;
 const original=fs.readFileSync(fs.existsSync(backup)?backup:file);
 assert.equal(hash(original),expected,'unexpected baseline '+name);
 const after=fs.readFileSync(fileURLToPath(new URL('../experiments/agent-worker-isolation-v1/'+name,import.meta.url)));
 const current=fs.readFileSync(file);
 assert([hash(original),hash(after)].includes(hash(current)),'concurrent modification '+name);
 return {file,backup,original,after};
});
for(const p of plans){
 if(!fs.existsSync(p.backup))fs.writeFileSync(p.backup,p.original,{mode:0o600,flag:'wx'});
 const result=process.argv.includes('--restore')?p.original:p.after;
 fs.writeFileSync(p.file,result);
 console.log(JSON.stringify({file:p.file,sha256:hash(result),restored:process.argv.includes('--restore')}));
}
