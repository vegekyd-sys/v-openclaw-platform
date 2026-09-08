// User-requested resource adjustment, scoped to this owned instance only.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {parityResources} from '../lab/parity-resource-profile.mjs';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const control='/srv/vlab-production-mirror/labs/control';
const m=JSON.parse(fs.readFileSync(control+'/db91-parity.json'));
const properties=parityResources(m,JSON.parse(fs.readFileSync(control+'/integration.json')));
assert.equal(execFileSync('systemctl',['show',m.unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
assert(os.totalmem()>=15*1024**3,'Requires the verified 15 GiB or larger VLab host');
const file=control+'/parity-resource-profile.mjs',before=fs.readFileSync(file,'utf8');
const after=fs.readFileSync(new URL('../lab/parity-resource-profile.mjs',import.meta.url),'utf8');
assert.equal(after.replace("['MemoryHigh=12G','MemoryMax=14G','CPUQuota=400%']","['MemoryHigh=10G','MemoryMax=12G','CPUQuota=400%']"),before,'Unexpected profile drift');
const backup=m.root+'/tmp/parity-resource-profile-before-12g.mjs';fs.writeFileSync(backup,before,{mode:0o600,flag:'wx'});
fs.writeFileSync(file,after,{mode:0o644});
execFileSync(process.execPath,['--check',file]);
console.log(JSON.stringify({instance:m.name,properties,backup,otherInstanceDefaultsUnchanged:true,nextLabctlStartUsesNewProfile:true}));
