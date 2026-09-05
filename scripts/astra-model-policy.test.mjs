import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('./astra-model-policy.mjs',import.meta.url));
function fixture() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'astra-policy-test-'));
  const config={agents:{defaults:{model:{primary:'deepseek/deepseek-v4-pro'},models:{}},entries:{'v-codex':{model:{primary:'openai/gpt-5.6-sol'},models:{}}}},channels:{feishu:{enabled:true}}};
  const files=['main','overlay'].map(x=>path.join(dir,x+'.json'));
  for(const f of files)fs.writeFileSync(f,JSON.stringify(config));
  return {dir,config,files,backup:path.join(dir,'backup')};
}
test('additive policy and scoped rollback preserve defaults and unrelated edits',()=>{
  const {config,files,backup}=fixture();
  const run=a=>spawnSync(process.execPath,[script,a,...files,backup],{encoding:'utf8'});
  assert.equal(run('apply').status,0);
  for(const [i,f] of files.entries()) {
    const after=JSON.parse(fs.readFileSync(f));
    assert.deepEqual(after.agents.defaults.model,config.agents.defaults.model);
    assert.equal(after.agents.defaults.models['openai/gpt-6-astra'].agentRuntime.id,i?'openclaw':'vlab-worker');
    assert.equal(after.agents.entries['v-codex'].models['openai/gpt-6-astra'].agentRuntime.id,'codex');
    after.unrelatedChange=true;fs.writeFileSync(f,JSON.stringify(after));
  }
  assert.equal(run('rollback').status,0);
  for(const f of files)assert.deepEqual(JSON.parse(fs.readFileSync(f)),{...config,unrelatedChange:true});
});
test('rollback refuses to overwrite concurrent Astra policy change',()=>{
  const {files,backup}=fixture();
  const run=a=>spawnSync(process.execPath,[script,a,...files,backup],{encoding:'utf8'});
  assert.equal(run('apply').status,0);
  const changed=JSON.parse(fs.readFileSync(files[0]));
  changed.agents.defaults.models['openai/gpt-6-astra'].alias='changed-by-user';
  fs.writeFileSync(files[0],JSON.stringify(changed));
  assert.notEqual(run('rollback').status,0);
  assert.equal(JSON.parse(fs.readFileSync(files[0])).agents.defaults.models['openai/gpt-6-astra'].alias,'changed-by-user');
});
