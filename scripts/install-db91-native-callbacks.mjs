// Reversible, exact native-callback delta on an owned/stopped Lab runtime.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const shared=process.argv.includes('--shared'),restore=process.argv.includes('--restore');
const meta=JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/'+(shared?'integration':'db91-fix')+'.json'));
assert.equal(meta.owner,'codex-db91-contention-20260907');
const root=shared?'/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902':meta.root;
const unit=shared?'openclaw-vlab-production-mirror-v8.service':meta.unit;
assert.equal(execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const plugin=root+(shared?'/runtime/plugins/worker-v-platform-0.1.0-integration.1':'/runtime/worker');
const hash=s=>createHash('sha256').update(s).digest('hex');
const bridgeSource=fs.readFileSync(new URL('../experiments/agent-worker-isolation-v1/native-attempt-bridge.mjs',import.meta.url),'utf8');
const from=bridgeSource.indexOf('      const callbacks = {};'),to=bridgeSource.indexOf('      c.prepared = true;',from);assert(from>0&&to>from);
const callbackBlock=bridgeSource.slice(from,to);
function replace(source,anchor,value){assert.equal(source.split(anchor).length,2,'unique anchor: '+anchor);return source.replace(anchor,value);}
const plans=['worker.mjs','native-attempt-bridge.mjs'].map(name=>{
 const file=plugin+'/'+name,backup=root+'/state/db91-callback-'+name+'.original';
 const original=fs.readFileSync(fs.existsSync(backup)?backup:file,'utf8');
 assert.equal(hash(original),name==='worker.mjs'?'921c637a82ade948febe2670c5487b5f9505863bb0c07f8ef9cd6c68523a749c':shared?'11ae504776c6bc589baf3a638b6e03a033dcd3fae1a567e7dc1b1cc0b2b2d99a':'9708da5aa2cbc45518ba190ef5a3c3004c09816011ff4e4207aa9e3ff6abf41e');
 let patched=original;
 if(name==='worker.mjs'){
  patched=replace(patched,'      }, executeToolInGateway)','      }, executeToolInGateway, () => buildStreamCallbacks(\n        message.id, message, abortSignal, streamState, globallyBridgedNames))');
  patched=replace(patched,'      ...buildStreamCallbacks(','      ...(message.nativeAttempt91 === true ? {} : buildStreamCallbacks(');
  patched=replace(patched,'        globallyBridgedNames,\n      ),','        globallyBridgedNames,\n      )),');
 }else{
  const imp="import { applyNativeHarnessData } from './native-harness-data.mjs';";
  patched=replace(patched,imp,imp+"\nimport { isBridgedHarnessEventCallback } from './harness-event-contract.mjs';");
  patched=replace(patched,'    register(message, signal, onDeadline, executeMessage) {','    register(message, signal, onDeadline, executeMessage, getStreamCallbacks = () => ({})) {');
  patched=replace(patched,'      const context = { message, signal, onDeadline, executeMessage };','      const context = { message, signal, onDeadline, executeMessage, getStreamCallbacks };');
  patched=replace(patched,'      c.prepared = true;',callbackBlock+'      c.prepared = true;');
  patched=replace(patched,'        conversationRoutePeerId:','        ...callbacks,\n        conversationRoutePeerId:');
 }
 assert([original,patched].includes(fs.readFileSync(file,'utf8')),'unrelated runtime edit');
 return {file,backup,original,patched};
});
for(const {file,backup,original,patched} of plans){
 if(!fs.existsSync(backup))fs.writeFileSync(backup,original,{mode:0o600,flag:'wx'});
 const stat=fs.statSync(file),tmp=file+'.callbacks-'+process.pid+'.tmp',value=restore?original:patched;
 fs.writeFileSync(tmp,value,{flag:'wx',mode:stat.mode&0o777});fs.chmodSync(tmp,stat.mode&0o777);fs.chownSync(tmp,stat.uid,stat.gid);fs.renameSync(tmp,file);
 console.log(JSON.stringify({shared,restored:restore,file,originalSha:hash(original),afterSha:hash(value)}));
}
