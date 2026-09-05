import test from 'node:test';
import assert from 'node:assert/strict';
import {buildConfig,assertSafeConfig,validateName,requireOwner} from './config.mjs';
test('instances have distinct credentials, paths and private worker overlays',()=>{
  const a=buildConfig('/lab/a',26100),b=buildConfig('/lab/b',26120);
  assert.notEqual(a.config.gateway.auth.token,b.config.gateway.auth.token);
  assert.equal(a.overlay.agents.defaults.models['deepseek/deepseek-v4-pro'].agentRuntime.id,'openclaw');
  assert.equal(a.config.agents.defaults.models['deepseek/deepseek-v4-pro'].agentRuntime.id,'vlab-worker');
  assertSafeConfig(a.config,'/lab/a',26100);
  assert.throws(()=>assertSafeConfig(a.config,'/lab/b',26120));
});
test('channel attachment and shared mutable plugin paths fail closed',()=>{
  const {config}=buildConfig('/lab/a',26100);
  config.channels.feishu={enabled:true};
  assert.throws(()=>assertSafeConfig(config,'/lab/a',26100));
  config.channels={};config.plugins.load.paths=['/shared/worker'];
  assert.throws(()=>assertSafeConfig(config,'/lab/a',26100));
});
test('explicit ownership and safe names are mandatory',()=>{
  assert.throws(()=>requireOwner({owner:'worker'},'astra'));
  assert.throws(()=>requireOwner({owner:'worker'},undefined));
  assert.throws(()=>validateName('../shared'));
  assert.throws(()=>validateName(''));
  assert.equal(validateName('astra'),'astra');
});
test('base profile disables unattended jobs and limits concurrency',()=>{
  const {config}=buildConfig('/lab/a',26100);
  assert.deepEqual(config.channels,{});
  assert.equal(config.cron.enabled,false);
  assert.equal(config.agents.defaults.maxConcurrent,2);
  assert.equal(config.plugins.entries['vlab-agent-worker-isolation'].config.maxWorkers,1);
  assert.equal(config.plugins.entries['vlab-agent-worker-isolation'].config.warmSpareWorkers,0);
});
test('both native and worker configs pin the same private provider code',()=>{
  const providerPluginPath='/lab/a/runtime/npm/projects/p/node_modules/@openclaw/deepseek-provider';
  const {config,overlay}=buildConfig('/lab/a',26100,{providerPluginPath});
  assert(config.plugins.load.paths.includes(providerPluginPath));
  assert.deepEqual(overlay.plugins.load.paths,[providerPluginPath]);
  assertSafeConfig(config,'/lab/a',26100);
  config.plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath='/shared/overlay.json';
  assert.throws(()=>assertSafeConfig(config,'/lab/a',26100));
});
