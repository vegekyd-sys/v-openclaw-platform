import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/labs/instances/astra',control='/srv/vlab-production-mirror/labs/control/astra.json';
const owner='01a06fbe-7654-7331-8d6e-73a8cd2dcd7e';
const m=JSON.parse(fs.readFileSync(control));
assert.equal(m.owner,'01a06fb6-6216-7c63-aadf-18a0101567bc');
assert.equal(execFileSync('systemctl',['show',m.unit,'-p','ActiveState','--value'],{encoding:'utf8'}).trim(),'inactive');
const backup=`${root}/backups/browser-routing-handoff-20260905`;fs.mkdirSync(backup,{mode:0o700});
fs.copyFileSync(control,backup+'/manifest.json');
for(const name of ['openclaw.json','worker-openclaw.json'])fs.copyFileSync(`${root}/state/${name}`,backup+'/'+name);
m.owner=owner;m.handoff={from:'01a06fb6-6216-7c63-aadf-18a0101567bc',at:new Date().toISOString(),reason:'Explicit owner handoff; preserve Astra evidence, test Browser routing'};
fs.writeFileSync(control,JSON.stringify(m,null,2)+'\n');
const dir=`${root}/source/scripts/lab-browser-routing-probe`;
fs.mkdirSync(dir+'/node_modules',{recursive:true});fs.symlinkSync(`${root}/runtime/openclaw`,dir+'/node_modules/openclaw');
for(const name of ['openclaw.json','worker-openclaw.json']){
 const p=`${root}/state/${name}`,c=JSON.parse(fs.readFileSync(p));
 c.plugins.allow=[...new Set([...c.plugins.allow,'browser','lab-browser-routing-probe'])];
 c.plugins.load.paths.push(dir);c.plugins.entries['lab-browser-routing-probe']={enabled:true};
 c.tools??={};c.tools.alsoAllow=[...new Set([...(c.tools.alsoAllow??[]),'browser','lab_browser_mark'])];
 // Browser stays disabled; the hook should block before any real browser launch.
 assert.equal(c.browser.enabled,false);assert.equal(Object.keys(c.channels??{}).length,0);
 fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');
}
execFileSync('chown',['-R',`${m.user}:${m.user}`,dir]);
console.log(JSON.stringify({instance:'astra',owner,backup,productionChanged:false}));
