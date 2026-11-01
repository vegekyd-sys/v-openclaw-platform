import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {patchNativeSetupProbeOwner}from'../../scripts/patch-native-setup-probe-owner.mjs';
const fixture=`function selectPreparedAgentHarness(params) {
\treturn selectAgentHarnessDecision({
\t\tagentHarnessId: params.agentHarnessId,
\t\tpreparedModelProvider: params.runtimePlan?.auth !== void 0
\t});
}
async function runAgentHarnessOperation() {}`;
const probe=()=>({agentHarnessId:'vlab-worker',sessionPersistence:'detached',modelRun:true,disableTools:true,sessionKey:'agent:makaron:setup-inference:incognito-probe-setup-inference-test',sessionManager:{getSessionTarget:()=>undefined}});
test('native selection preserves probe owner before plugin capability stripping',()=>{
 const calls=[];const scope={selectAgentHarnessDecision:p=>{calls.push(p);return {harness:{id:p.agentHarnessId},builtIn:p.agentHarnessId==='openclaw'};}};
 vm.createContext(scope);vm.runInContext(patchNativeSetupProbeOwner(fixture),scope);
 const p=probe();assert.equal(scope.selectPreparedAgentHarness(p).harness.id,'openclaw');assert.equal(p.agentHarnessId,'vlab-worker');assert.equal(calls.length,2);
 for(const delta of [{sessionPersistence:undefined},{disableTools:false},{modelRun:false},{sessionKey:'agent:makaron:feishu:group:x'},{sessionManager:undefined},{sessionManager:{getSessionTarget:()=>({sessionId:'durable'})}}])assert.equal(scope.selectPreparedAgentHarness({...probe(),...delta}).harness.id,'vlab-worker');
 assert.equal(scope.selectPreparedAgentHarness({...probe(),agentHarnessId:'codex'}).harness.id,'codex');
});
test('native probe patch is guarded, idempotent and does not retry failed work',()=>{
 const patched=patchNativeSetupProbeOwner(fixture);assert.equal(patchNativeSetupProbeOwner(patched),patched);assert.throws(()=>patchNativeSetupProbeOwner('changed upstream source'));
 assert(!patched.includes('catch'));assert(!patched.includes('runAttempt('));
});
