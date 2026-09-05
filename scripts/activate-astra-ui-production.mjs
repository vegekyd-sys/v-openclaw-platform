import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const node='/opt/node-v22.23.1/bin/node',source='/tmp/astra-a9b8c72/scripts';
const core='/opt/openclaw-2026.9.1-v/openclaw';
const worker='/opt/openclaw-experiments/agent-worker-isolation-v1/releases/bb69480-transcript-v1';
const main='/home/openclaw/.openclaw/openclaw.json';
const overlay='/home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json';
const binary='/opt/codex-0.153.4-v/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex';
const backup='/home/openclaw/.openclaw/backups/astra-ui-20260905';
const script=(file,...args)=>execFileSync(node,[source+'/'+file,...args],{stdio:'inherit'});
const ui=(action)=>execFileSync(node,['/tmp/deploy-control-ui-https.mjs',action],{stdio:'inherit'});
assert(!fs.existsSync(backup));fs.mkdirSync(backup,{mode:0o700});
script('astra-hash-gate.mjs','before',core,worker);
// Refuse active/pending Workers; retain native graceful shutdown for races.
const status=execFileSync('sudo',['-u','openclaw','env','HOME=/home/openclaw','OPENCLAW_STATE_DIR=/home/openclaw/.openclaw','OPENCLAW_CONFIG_PATH='+main,node,'--input-type=module','-e',`const {callGatewayFromCli}=await import('${core}/dist/plugin-sdk/gateway-runtime.js');console.log(JSON.stringify(await callGatewayFromCli('vlab.workers.status',{timeout:'20000',json:true},{})));`],{encoding:'utf8'});
const state=JSON.parse(status);assert.equal(state.pending,0);assert(state.workers.every(w=>!w.activeCount&&!w.queued),'Active Workers: wait');
fs.copyFileSync(main,backup+'/main.before.json');fs.copyFileSync(overlay,backup+'/overlay.before.json');
const defaults=[main,overlay].map(p=>{const c=JSON.parse(fs.readFileSync(p));return {file:p,model:c.agents.defaults.model,entries:Object.fromEntries(Object.entries(c.agents.entries??{}).map(([id,a])=>[id,a.model]))};});
fs.writeFileSync(backup+'/default-models.before.json',JSON.stringify(defaults));
execFileSync('systemctl',['stop','openclaw-gateway.service'],{stdio:'inherit',timeout:60000});
const done=[];
try {
 script('patch-openclaw91-astra.mjs','apply',core,worker,backup+'/code');done.push('code');
 script('astra-model-policy.mjs','apply',main,overlay,backup+'/models');done.push('models');
 script('astra-codex-cli-policy.mjs','apply',main,overlay,binary,backup+'/cli');done.push('cli');
 ui('apply-config');done.push('ui');
 script('astra-hash-gate.mjs','after',core,worker);
 execFileSync('sudo',['-u','openclaw','env','HOME=/home/openclaw','OPENCLAW_STATE_DIR=/home/openclaw/.openclaw','OPENCLAW_CONFIG_PATH='+main,node,core+'/dist/index.js','config','validate','--json'],{stdio:'inherit',timeout:60000});
 for(const before of defaults){const c=JSON.parse(fs.readFileSync(before.file));assert.deepEqual(c.agents.defaults.model,before.model);for(const [id,m] of Object.entries(before.entries))assert.deepEqual(c.agents.entries[id].model,m);}
 fs.writeFileSync(backup+'/applied.json',JSON.stringify({at:new Date().toISOString(),done}));
} catch(e){
 console.error('Activation failed; reverting only this release:',e.message);
 if(done.includes('ui'))ui('rollback');
 if(done.includes('cli'))script('astra-codex-cli-policy.mjs','rollback',main,overlay,binary,backup+'/cli');
 if(done.includes('models'))script('astra-model-policy.mjs','rollback',main,overlay,backup+'/models');
 if(done.includes('code'))script('patch-openclaw91-astra.mjs','rollback',core,worker,backup+'/code');
 execFileSync('systemctl',['start','openclaw-gateway.service'],{stdio:'inherit'});throw e;
}
execFileSync('systemctl',['start','openclaw-gateway.service'],{stdio:'inherit'});
console.log(JSON.stringify({started:true,backup,defaultModelsUnchanged:true,credentialsChanged:false,healthStillRequired:true}));
