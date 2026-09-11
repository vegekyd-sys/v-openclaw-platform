import test from 'node:test';import assert from 'node:assert/strict';
import {prewarmWorkerRuntime} from './runtime-prewarm.mjs';
const fixture=()=>{
 const calls=[],config={unchanged:true},signal=new AbortController().signal;
 return {calls,config,options:{enabled:true,agentId:'makaron',signal,
  loadAgentRuntime:async()=>{calls.push('loadAgentRuntime');return {resolveAgentDir:(c,id)=>{assert.equal(c,config);return '/agent/'+id;},resolveAgentWorkspaceDir:(c,id)=>{assert.equal(c,config);return '/workspace/'+id;}};},
  loadCompactionRuntime:async()=>{calls.push('loadCompactionRuntime');return {commandRuntime:{prewarmAgentCommandRuntimes:async(p)=>{calls.push('prewarmAgentCommandRuntimes');assert.deepEqual(p,{config,agentId:'makaron',workspaceDir:'/workspace/makaron',pluginMetadataSnapshot:['fixture-plugin']});return {skillSnapshotPrepared:true};}},configRuntime:{loadConfig:()=>config},preparedRuntime:{acquireAgentRunPreparedModelRuntime:async(p,o)=>{
   calls.push('acquire');assert.deepEqual(p,{config,agentId:'makaron',agentDir:'/agent/makaron',allowGatewaySubagentBinding:true,workspaceDir:'/workspace/makaron'});assert.deepEqual(o,{abortSignal:signal,catalogMode:'static'});
   return {pluginGeneration:{pluginMetadataSnapshot:['fixture-plugin']},release:()=>calls.push('release')};}}};},
  preloadBuiltin:async()=>{calls.push('preloadBuiltin');}
 }};
};
test('disabled: no work at all',async()=>{const f=fixture();assert.deepEqual(await prewarmWorkerRuntime({...f.options,enabled:false}),{status:'disabled'});assert.deepEqual(f.calls,[]);});
test('prepares static and first-command runtimes then releases lease without invoking Agent or model',async()=>{const f=fixture(),r=await prewarmWorkerRuntime(f.options);assert.equal(r.status,'ready');assert.equal(r.skillSnapshotPrepared,true);assert.deepEqual(f.calls,['loadAgentRuntime','loadCompactionRuntime','acquire','prewarmAgentCommandRuntimes','preloadBuiltin','release']);assert.deepEqual(f.config,{unchanged:true});});
test('builtin preload remains optional after command runtime preparation',async()=>{const f=fixture();delete f.options.preloadBuiltin;const r=await prewarmWorkerRuntime(f.options);assert.equal(r.status,'ready');assert.equal(r.skillSnapshotPrepared,true);assert.deepEqual(f.calls,['loadAgentRuntime','loadCompactionRuntime','acquire','prewarmAgentCommandRuntimes','release']);});
test('missing command prewarm contract fails open and releases the prepared lease',async()=>{const f=fixture(),load=f.options.loadCompactionRuntime;f.options.loadCompactionRuntime=async()=>({...await load(),commandRuntime:{}});const r=await prewarmWorkerRuntime(f.options);assert.equal(r.status,'deferred-to-normal-turn');assert.equal(f.calls.at(-1),'release');});
test('import failure releases lease and leaves normal turn as fallback',async()=>{const f=fixture();f.options.preloadBuiltin=async()=>{throw Error('private error text');};const r=await prewarmWorkerRuntime(f.options);assert.equal(r.status,'deferred-to-normal-turn');assert.equal(f.calls.at(-1),'release');assert(!JSON.stringify(r).includes('private'));});
test('abort is passed through the native prepared-runtime boundary',async()=>{const f=fixture();f.options.loadCompactionRuntime=async()=>({commandRuntime:{prewarmAgentCommandRuntimes:async()=>{}},configRuntime:{loadConfig:()=>f.config},preparedRuntime:{acquireAgentRunPreparedModelRuntime:async(p,o)=>{assert.equal(o.abortSignal,f.options.signal);throw new DOMException('aborted','AbortError');}}});const r=await prewarmWorkerRuntime(f.options);assert.equal(r.errorCategory,'abort');});
