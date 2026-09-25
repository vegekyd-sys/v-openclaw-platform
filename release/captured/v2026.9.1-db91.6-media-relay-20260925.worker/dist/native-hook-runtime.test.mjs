import test from 'node:test';import assert from 'node:assert/strict';
import { initializeWorkerNativeHooks } from './native-hook-runtime.mjs';
test('uses native initializer with the exact prepared plugin registry',async()=>{
 const registry={hooks:[],typedHooks:[{hookName:'before_tool_call'}]};let calls=0;
 assert.equal(await initializeWorkerNativeHooks({pluginGeneration:{pluginRegistry:registry},agentRuntimePath:'/fixture/dist/plugin-sdk/agent-runtime.js'},async path=>{
  assert.equal(path,'file:///fixture/dist/plugin-sdk/hook-runtime.js');
  return {initializeGlobalHookRunner(received){calls++;assert.equal(received,registry);}};
 }),true);assert.equal(calls,1);
});
test('legacy generation does not guess a registry or SDK',async()=>{
 assert.equal(await initializeWorkerNativeHooks({},()=>{throw new Error('unexpected import');}),false);
});
test('incompatible SDK fails instead of silently skipping native policies',async()=>{
 await assert.rejects(initializeWorkerNativeHooks({pluginGeneration:{pluginRegistry:{}},agentRuntimePath:'/fixture/agent-runtime.js'},async()=>({})),/initializer is unavailable/);
});
