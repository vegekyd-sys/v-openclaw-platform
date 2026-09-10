import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {shareColdConfigPreparation} from './release-files/cold-config-singleflight.mjs';

const barrier=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('only overlapping identical preparation is shared; settled state is not cached',async()=>{
  const config={}, generation={}, runtime={}, gate=barrier(); let calls=0;
  const prepare=()=>{calls++;return gate.promise;};
  const jobs=Array.from({length:15},()=>shareColdConfigPreparation(config,generation,runtime,prepare));
  await Promise.resolve(); assert.equal(calls,1);
  gate.resolve(config); assert.ok((await Promise.all(jobs)).every(v=>v===config));
  await shareColdConfigPreparation(config,generation,runtime,prepare); assert.equal(calls,2);
});
test('config, generation and runtime identities are independent',async()=>{
  const config={}, generation={}, runtime={}, gate=barrier(); let calls=0;
  const prepare=()=>{calls++;return gate.promise;};
  const jobs=[
    shareColdConfigPreparation(config,generation,runtime,prepare),
    shareColdConfigPreparation({},generation,runtime,prepare),
    shareColdConfigPreparation(config,{},runtime,prepare),
    shareColdConfigPreparation(config,generation,{},prepare),
  ];
  await Promise.resolve(); assert.equal(calls,4); gate.resolve(); await Promise.all(jobs);
});
test('rejection is shared without poisoning retries or causing detached rejection',async()=>{
  const config={}, generation={}, runtime={}, gate=barrier(); const failure=Error('expected');
  let calls=0; const prepare=()=>{calls++;return gate.promise;};
  const jobs=[1,2,3].map(()=>shareColdConfigPreparation(config,generation,runtime,prepare));
  const settled=Promise.allSettled(jobs); gate.reject(failure);
  assert.ok((await settled).every(v=>v.status==='rejected'&&v.reason===failure));
  assert.equal(calls,1);
  assert.equal(await shareColdConfigPreparation(config,generation,runtime,()=>42),42);
});

// Execute the actual native config resolver body with deterministic dependencies.
// Imports are replaced only in this test; production uses unchanged native APIs.
const native=fs.readFileSync(new URL('./release-files/agent-command-DPfawBbr.js',import.meta.url),'utf8');
const region=native.slice(native.indexOf('async function resolveAgentRuntimeConfig('),native.indexOf('function hasNestedSecretRef('));
function fixture({refs=false,active=false,fail=false}={}) {
  let config={revision:1}, snapshot=active?{sourceConfig:{}}:null;
  const gate=barrier(), counters={read:0,prepare:0,activate:0,resolveRefs:0};
  const secrets={
    async prepareSecretsRuntimeSnapshot(){counters.prepare++;return {sourceConfig:config};},
    activateSecretsRuntimeSnapshot(value){counters.activate++;snapshot=value;},
  };
  const deps={
    shareColdConfigPreparation,
    getRuntimeConfig:()=>config,
    getActiveSecretsRuntimeConfigSnapshot:()=>snapshot,
    hasAgentRuntimeSecretRefs:()=>refs,
    measureAgentStartup:(_stage,run)=>run(),
    async readConfigFileSnapshotForWrite(){counters.read++;await gate.promise;if(fail) throw Error('read failed');return {snapshot:{valid:true,resolved:config},writeOptions:{basePluginMetadataSnapshot:{}}};},
    resolvePluginMetadataSnapshot:()=>({}),
    resolveAgentRuntimeSecretTargets:()=>({targetIds:[],optionalActivePaths:new Set()}),
    setRuntimeConfigSnapshot:()=>{},
    async loadSecrets(){return secrets;},
    async loadCommand(){return {async resolveCommandConfigWithSecrets({config}){counters.resolveRefs++;return {resolvedConfig:config};}};},
  };
  const code=region.replace('import("./runtime-BA_TxOCt.js")','loadSecrets()')
    .replace('import("./command-config-resolution.runtime.js")','loadCommand()');
  const resolve=new Function(...Object.keys(deps),code+';return resolveAgentRuntimeConfig;')(...Object.values(deps));
  return {resolve,gate,counters,setConfig:value=>{config=value;}};
}
test('native resolver cold C3 reads source and activates secrets snapshot once',async()=>{
  const f=fixture(), runtime={}, context={pluginGeneration:{}};
  const jobs=Array.from({length:3},()=>f.resolve(runtime,{},context));
  await Promise.resolve(); assert.equal(f.counters.read,1);
  f.gate.resolve(); const configs=await Promise.all(jobs);
  assert.equal(f.counters.prepare,1); assert.equal(f.counters.activate,1);
  assert.ok(configs.every(v=>v===configs[0]));
  await f.resolve(runtime,{},context); assert.equal(f.counters.read,1,'hot native snapshot still applies');
});
test('delivery, scoped channel, SecretRefs and absent generation remain unshared',async()=>{
  for(const scenario of [
    {params:{runtimeTargetsChannelSecrets:true}},
    {params:{runtimeChannelSecretScope:{channel:'feishu',accountId:'test'}}},
    {refs:true}, {context:{}},
  ]) {
    const f=fixture(scenario),runtime={},context=scenario.context??{pluginGeneration:{}};
    const jobs=[1,2,3].map(()=>f.resolve(runtime,scenario.params??{},context));
    await Promise.resolve(); assert.equal(f.counters.read,3);
    f.gate.resolve(); await Promise.all(jobs);
    if(scenario.refs) assert.equal(f.counters.resolveRefs,3);
  }
});
test('native config identity replacement does not join old in-flight preparation',async()=>{
  const f=fixture(),runtime={},context={pluginGeneration:{}};
  const first=f.resolve(runtime,{},context); await Promise.resolve();
  f.setConfig({revision:2}); const second=f.resolve(runtime,{},context); await Promise.resolve();
  assert.equal(f.counters.read,2); f.gate.resolve(); await Promise.all([first,second]);
});
test('native source-read fallback still prepares and activates snapshot',async()=>{
  const f=fixture({fail:true}); const job=f.resolve({}, {}, {pluginGeneration:{}});
  f.gate.resolve(); assert.equal((await job).revision,1); assert.equal(f.counters.activate,1);
});
