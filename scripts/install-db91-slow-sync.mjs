import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,'codex-db91-contention-20260907');
assert.equal(execFileSync('systemctl',['show','openclaw-vlab-production-mirror-v8.service','-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const file=root+'/runtime/npm-global/lib/node_modules/openclaw/dist/index.js';
const helper=file.replace(/index.js$/,'db91-slow-sync-observer.mjs');
const backup=root+'/state/db91-slow-sync-index.original.js';
const original=fs.readFileSync(fs.existsSync(backup)?backup:file,'utf8');
const anchor='import ';const i=original.indexOf(anchor);assert(i>=0);
const patched=original.slice(0,i)+"import './db91-slow-sync-observer.mjs';\n"+original.slice(i);
assert([original,patched].includes(fs.readFileSync(file,'utf8')),'concurrent entry modification');
if(!fs.existsSync(backup))fs.writeFileSync(backup,original,{flag:'wx',mode:0o600});
if(!process.argv.includes('--restore')){
 const source=fs.readFileSync(new URL('./db91-slow-sync-observer.mjs',import.meta.url));
 if(fs.existsSync(helper)){const current=fs.readFileSync(helper);assert(current.equals(source)||createHash('sha256').update(current).digest('hex')==='1f09c8f830fe296e1576f4733046add346c6a249dd902eca351042eecc202a77','concurrent observer modification');}
 const stat=fs.statSync(file);fs.writeFileSync(helper,source,{mode:stat.mode&0o777});fs.chownSync(helper,stat.uid,stat.gid);
}
const content=process.argv.includes('--restore')?original:patched;fs.writeFileSync(file,content);
console.log(JSON.stringify({file,restored:process.argv.includes('--restore'),sha256:createHash('sha256').update(content).digest('hex')}));
