import test from 'node:test';import assert from 'node:assert/strict';
import {prewarmWorkerRuntime} from './runtime-prewarm.mjs';
const fixture=()=>{
 const calls=[],config={unchanged:true},signal=new AbortController().signal;
 return {calls,config,options:{enabled:true,agentId:'makaron',signal,
  loadAgentRuntime:async()=>{calls.push('loadAgentRuntime');return {resolveAgentDir:(c,id)=>{assert.equal(c,config);return '/agent/'+id;},resolveAgentWorkspaceDir:(c,id)=>{assert.equal(c,config);return '/workspace/'+id;}};},
  loadCompactionRuntime:async()=>{calls.push('loadCompactionRuntime');return {configRuntime:{loadConfig:()=>config},preparedRuntime:{acquireAgentRunPreparedModelRuntime:async(p,o)=>{
   calls.push('acquire');assert.deepEqual(p,{config,agentId:'makaron',agentDir:'/agent/makaron',allowGatewaySubagentBinding:true,workspaceDir:'/workspace/makaron'});assert.deepEqual(o,{abortSignal:signal,catalogMode:'static'});
   return {release:()=>calls.push('release')};}}};},
  preloadBuiltin:async()=>{calls.push('preloadBuiltin');}
 }};
};
test('disabled: no work at all',async()=>{const f=fixture();assert.deepEqual(await prewarmWorkerRuntime({...f.options,enabled:false}),{status:'disabled'});assert.deepEqual(f.calls,[]);});
test('prepares static runtime then releases lease without invoking Agent or model',async()=>{const f=fixture(),r=await prewarmWorkerRuntime(f.options);assert.equal(r.status,'ready');assert.deepEqual(f.calls,['loadAgentRuntime','loadCompactionRuntime','acquire','preloadBuiltin','release']);assert.deepEqual(f.config,{unchanged:true});});
test('preload completion is optional when the command runtime import is already complete',async()=>{const f=fixture();delete f.options.preloadBuiltin;const r=await prewarmWorkerRuntime(f.options);assert.equal(r.status,'ready');assert.deepEqual(f.calls,['loadAgentRuntime','loadCompactionRuntime','acquire','release']);});
test('import failure releases lease and leaves normal turn as fallback',async()=>{const f=fixture();f.options.preloadBuiltin=async()=>{throw Error('private error text');};const r=await prewarmWorkerRuntime(f.options);assert.equal(r.status,'deferred-to-normal-turn');assert.equal(f.calls.at(-1),'release');assert(!JSON.stringify(r).includes('private'));});
test('abort is passed through the native prepared-runtime boundary',async()=>{const f=fixture();f.options.loadCompactionRuntime=async()=>({configRuntime:{loadConfig:()=>f.config},preparedRuntime:{acquireAgentRunPreparedModelRuntime:async(p,o)=>{assert.equal(o.abortSignal,f.options.signal);throw new DOMException('aborted','AbortError');}}});const r=await prewarmWorkerRuntime(f.options);assert.equal(r.errorCategory,'abort');});
