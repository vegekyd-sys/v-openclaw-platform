import test from 'node:test';import assert from 'node:assert/strict';
import {isGatewayOwnedInferenceProbe,createGatewayNativeProbe} from './gateway-native-probe.mjs';
const probe=()=>({sessionKey:'agent:makaron:setup-inference:incognito-probe-setup-inference-test',sessionPersistence:'detached',modelRun:true,disableTools:true,sessionManager:{getSessionTarget:()=>undefined}});
test('only the tool-free caller-owned native setup probe remains with its owner',()=>{
 assert(isGatewayOwnedInferenceProbe(probe()));
 for(const delta of [{sessionPersistence:undefined},{modelRun:false},{disableTools:false},{sessionKey:'agent:makaron:feishu:direct:u'},{sessionManager:{getSessionTarget:()=>({sessionId:'durable'})}},{sessionManager:undefined}])assert(!isGatewayOwnedInferenceProbe({...probe(),...delta}));
});
test('native probe retains original object identity and never retries execution',async()=>{
 let seen,loads=0,runs=0;const original={...probe(),abortSignal:new AbortController().signal,onSuccessfulAuthBinding(){},hostCapabilities:{original:true}};
 const run=createGatewayNativeProbe({loadHarness:async()=>{loads++;return {runAttempt:p=>{runs++;seen=p;return {ok:true};}};}});
 assert.deepEqual(await run(original),{ok:true});assert.equal(seen,original);assert.equal(seen.sessionManager,original.sessionManager);assert.equal(loads,1);assert.equal(runs,1);
 await assert.rejects(()=>run({...original,disableTools:false}),/Not a caller-owned/);assert.equal(runs,1);
 const error=new Error('native failed');const failing=createGatewayNativeProbe({loadHarness:async()=>({runAttempt(){throw error;}})});
 await assert.rejects(()=>failing(original),e=>e===error);
});
