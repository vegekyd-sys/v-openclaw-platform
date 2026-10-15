import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {patchVoiceConsultScope,patchVoiceConsultScopeHarness} from './patch-voice-consult-scope.mjs';

const base=readFileSync(new URL('./release-files/voice-task-lifetime-20261014/talk-DkFuKRod.js',import.meta.url),'utf8');
const patched=patchVoiceConsultScope(base);
test('actual browser runner stops replaying old task prompts only for standalone Voice',()=>{
  const start=patched.indexOf('function voiceConsultInitialItems('),end=patched.indexOf('function createTalkClientAgentConsultRunner(',start);
  const select=vm.runInNewContext(patched.slice(start,end)+';voiceConsultInitialItems;');
  const history=[{role:'user',text:'cancelled historical task'},{role:'assistant',text:'completed report'}];
  assert.equal(select('v-voice-gpt-live',history).length,0);
  assert.equal(select('openai',history),history);
  assert.equal(select('other',history),history);
  assert(patched.includes('initialItems: voiceConsultInitialItems(resolution.provider.id, initialItems)'));
  // The provider's own initialItems and durable session target stay intact.
  assert.equal(patched.split('initialItems: voiceConsultInitialItems').length,2);
  assert(patched.includes('transcript: params.initialItems'));
  assert(patched.includes('sessionKey: canonicalKey'));
});
test('patch is idempotent and rejects ambiguous/drifted browser entry',()=>{
  assert.equal(patchVoiceConsultScope(patched),patched);
  assert.throws(()=>patchVoiceConsultScope(base.replace('const gatewayControlOwner =','const changedOwner =')),/anchor drifted/);
});
test('actual scoped prompt preserves the entire current request and constraints without replaying old tasks',()=>{
  const harness=readFileSync(new URL('./release-files/gpt-live-call/realtime-session-harness-CEO5kVAJ.js',import.meta.url),'utf8');
  const updated=patchVoiceConsultScopeHarness(harness);
  const start=updated.indexOf('function buildScopedVoiceConsultPrompt('),end=updated.indexOf('function buildRealtimeVoiceAgentConsultPrompt(',start);
  const build=vm.runInNewContext(updated.slice(start,end)+';buildScopedVoiceConsultPrompt;',{parseRealtimeVoiceAgentConsultArgs:v=>v});
  const request='请同一子任务先等待30秒，再运行指定命令，金额保留100 CNY，不发送。';
  const prompt=build({surface:'a browser Talk session',args:{question:request,context:'已有结果与最新修正',responseStyle:'中文'},transcript:[{role:'user',text:'UNRELATED_CANCELLED_GOAL'}]});
  assert(prompt.endsWith('User request:\n'+request));assert(prompt.includes('已有结果与最新修正'));assert(!prompt.includes('UNRELATED_CANCELLED_GOAL'));
  assert(prompt.length<2500);assert.match(prompt,/一手来源|支持段落/);assert.match(prompt,/原值/);assert.match(prompt,/VOICE_CONFIRMATION_REQUIRED/);assert.match(prompt,/公开 commentary/);
  assert.equal(patchVoiceConsultScopeHarness(updated),updated);
  assert(updated.includes('if(params.voiceTaskMode)return buildScopedVoiceConsultPrompt(params);'));
  assert(updated.includes('voiceTaskMode: params.voiceTaskMode'));
});
