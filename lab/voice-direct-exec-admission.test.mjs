import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {createVoiceDirectExecAdmission,voiceDirectExecAdmissionRuntimeSource} from './voice-direct-exec-admission.mjs';
import {patchVoiceDirectInvoke,patchVoiceDirectResolution,patchVoiceDirectExec} from './patch-voice-direct-exec-admission.mjs';

function harness() {
  const admissions=[];
  const withAdmission=createVoiceDirectExecAdmission({
    createOperationalRunInstanceRef:runId=>Object.freeze({runId,instanceId:'internal'}),
    prepareAgentRunAdmission:params=>{
      const state={params,active:false,closed:false};admissions.push(state);
      return {admit:async()=>{state.active=true;return {operationalRunInstance:params.operationalRunInstance};},close:()=>{state.active=false;state.closed=true;}};
    }});
  return {withAdmission,admissions};
}
test('ordinary tools do not create an admission or alter the callback context',async()=>{
  const h=harness();let context='unset';
  assert.equal(await h.withAdmission({enabled:false},async c=>{context=c;return 42;}),42);
  assert.equal(context,undefined);assert.equal(h.admissions.length,0);
});
test('voice admission retains an internal identity across awaits and closes on success/failure',async()=>{
  const h=harness();let first;
  await h.withAdmission({enabled:true,cfg:{},agentId:'makaron'},async c=>{
    first=c;assert(h.admissions[0].active);await Promise.resolve();assert(h.admissions[0].active);
    assert.equal(c.operationalRunInstance,h.admissions[0].params.operationalRunInstance);
  });
  assert(h.admissions[0].closed);
  await assert.rejects(h.withAdmission({enabled:true,cfg:{},agentId:'makaron'},async c=>{
    assert.notEqual(c.runId,first.runId);throw Error('tool failed');
  }),/tool failed/);assert(h.admissions[1].closed);
});
test('aborted invocations do not mint identities; in-flight abort retires the identity',async()=>{
  const h=harness(),abort=new AbortController();abort.abort();
  await assert.rejects(h.withAdmission({enabled:true,signal:abort.signal},()=>assert.fail()));
  assert.equal(h.admissions.length,0);
  const active=new AbortController();
  await h.withAdmission({enabled:true,signal:active.signal},async()=>{
    assert(h.admissions[0].active);active.abort();assert(h.admissions[0].closed);
  });assert(h.admissions[0].closed);
});
const root=new URL('../release/captured/v-voice-content-product-20261011/dist/',import.meta.url);
const invoke=fs.readFileSync(new URL('tools-invoke-shared-CjpflNGO.js',root),'utf8');
const resolution=fs.readFileSync(new URL('tool-resolution-Con11qMn.js',root),'utf8');
test('native routing only admits owner voice exec; preserves authorization and hooks',()=>{
  const patched=patchVoiceDirectInvoke(invoke);
  const gate=patched.slice(patched.indexOf('const directCodingTool'),patched.indexOf('\tconst resolveTools'));
  const enabled=(senderIsOwner,clientCaps,toolName)=>vm.runInNewContext(gate.replace('return await withVoiceDirectExecAdmission','withVoiceDirectExecAdmission').split('}, async (voiceExecution)')[0]+'});',{
    params:{senderIsOwner,clientCaps,cfg:{}},toolName,selectedAgentId:'makaron',withVoiceDirectExecAdmission:p=>p.enabled});
  assert.equal(enabled(true,['voice-direct-tools'],'exec'),true);
  assert.equal(enabled(false,['voice-direct-tools'],'exec'),false);
  assert.equal(enabled(true,[],'exec'),false);
  for(const name of ['process','read','web_search','memory_search','message'])assert.equal(enabled(true,['voice-direct-tools'],name),false);
  assert(patched.indexOf('authorizeResolvedSessionMutation')<patched.indexOf('return await withVoiceDirectExecAdmission'));
  for(const anchor of ['runBeforeToolCallHook','approvalMode: params.approvalMode','withOperatorToolGatewayAuthority','gatewayTool.execute','surface: directCodingTool ? "loopback" : "http"'])assert(patched.includes(anchor));
  assert.equal(patchVoiceDirectInvoke(patched),patched);
  assert.throws(()=>patchVoiceDirectInvoke('foreign source'));
});
test('resolver forwards server identity only to mediated coding tools; background cannot outlive admission',()=>{
  const patched=patchVoiceDirectResolution(resolution);
  assert(patched.includes('operationalRunInstance: params.voiceDirectExecution?.operationalRunInstance'));
  assert(patched.includes('params.voiceDirectExecution ? {voiceDirectForeground: true} : {}'));
  assert.equal(patchVoiceDirectResolution(patched),patched);
  for(const src of [patchVoiceDirectInvoke(invoke),patched,voiceDirectExecAdmissionRuntimeSource()])
    execFileSync(process.execPath,['--check','--input-type=module'],{input:src});
});
test('host foreground binding wins over process availability; ordinary exec behavior and secret guard stay intact',()=>{
  const original=fs.readFileSync(new URL('bash-tools-DiAfkLAC.js',root),'utf8');
  const patched=patchVoiceDirectExec(original);
  const expression=patched.match(/const configuredAllowBackground = (.*);/)[1];
  const allow=defaults=>vm.runInNewContext(expression,{defaults});
  assert.equal(allow({voiceDirectForeground:true,processToolAvailabilityRef:{value:true}}),false);
  assert.equal(allow({processToolAvailabilityRef:{value:true}}),true);
  assert.equal(allow({processToolAvailabilityRef:{value:false}}),false);
  assert.equal(allow({}),true);
  assert(patched.includes('Secret egress proxy requires an admitted agent run instance'));
  assert.equal(patchVoiceDirectExec(patched),patched);
  execFileSync(process.execPath,['--check','--input-type=module'],{input:patched});
});
