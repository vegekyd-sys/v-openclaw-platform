// Exact reversible delta; scoped Lab runtime only. Production needs its own gate.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const shared=process.argv.includes('--shared'),restore=process.argv.includes('--restore');
const owner='codex-db91-contention-20260907';
const m=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/'+(shared?'integration':'db91-fix')+'.json'));assert.equal(m.owner,owner);
const root=shared?'/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902':m.root;
const unit=shared?'openclaw-vlab-production-mirror-v8.service':m.unit;
assert.equal(execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const plugin=root+(shared?'/runtime/plugins/worker-v-platform-0.1.0-integration.1':'/runtime/worker');
const file=plugin+'/index.mjs',backup=root+'/state/db91-public-stream.original.mjs',helper=plugin+'/gateway-public-stream.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const original=fs.readFileSync(fs.existsSync(backup)?backup:file,'utf8');
assert.equal(hash(original),shared?'2afe33c82de8dbabe0a2c48a70bb27c74a07d602a6836336a3c48fa4e86149c8':'392b6473f02fe94123d8d654cad48066a6a2afd68ec39d3baa78c8240de78bb8');
const anchor="import { gatewayOwnedEventArgs } from './gateway-owned-terminal.mjs';";
const callback='                    await callback(...gatewayOwnedEventArgs(event.name, event.args));';
for(const a of [anchor,callback])assert.equal(original.split(a).length,2);
const patched=original.replace(anchor,anchor+"\nimport { publishWorkerPublicStream } from './gateway-public-stream.mjs';")
 .replace(callback,callback+'\n                    publishWorkerPublicStream(params, event.name, event.args,\n                      (await agentHarnessActiveRunRuntimePromise).emitAgentEvent);');
assert([original,patched].includes(fs.readFileSync(file,'utf8')),'unrelated plugin edit');
const helperSource=fs.readFileSync(new URL('../experiments/agent-worker-isolation-v1/gateway-public-stream.mjs',import.meta.url),'utf8');
if(fs.existsSync(helper))assert.equal(fs.readFileSync(helper,'utf8'),helperSource,'unrelated helper');
if(!fs.existsSync(backup))fs.writeFileSync(backup,original,{mode:0o600,flag:'wx'});
const stat=fs.statSync(file);
function put(path,value){const tmp=path+'.stream-'+process.pid+'.tmp';fs.writeFileSync(tmp,value,{mode:stat.mode&0o777,flag:'wx'});fs.chmodSync(tmp,stat.mode&0o777);fs.chownSync(tmp,stat.uid,stat.gid);fs.renameSync(tmp,path);}
if(!restore)put(helper,helperSource);
put(file,restore?original:patched);
console.log(JSON.stringify({shared,restored:restore,file,originalSha:hash(original),afterSha:hash(restore?original:patched),helperSha:hash(helperSource)}));
