import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {patchVoiceNativeTools} from './patch-voice-native-tools.mjs';
const original=fs.readFileSync(new URL('./fixtures/voice-native-tools/tools-invoke-shared-CjpflNGO.js',import.meta.url),'utf8');
const patched=patchVoiceNativeTools(original);
function policy(senderIsOwner,clientCaps,toolName){const block=patched.slice(patched.indexOf('const directCodingTool'),patched.indexOf('\tconst resolveTools'));return vm.runInNewContext(block+'\ndirectCodingTool',{params:{senderIsOwner,clientCaps},toolName});}
test('only explicit privileged voice coding calls get native mediation',()=>{
 for(const tool of ['exec','read','write','edit','process','apply_patch'])assert.equal(policy(true,['voice-direct-tools'],tool),true);
 assert.equal(policy(false,['voice-direct-tools'],'exec'),false);assert.equal(policy(true,[],'exec'),false);assert.equal(policy(true,undefined,'exec'),false);
 for(const tool of ['web_search','memory_search','message','automations','sessions_send'])assert.equal(policy(true,['voice-direct-tools'],tool),false);
});
test('patch preserves native authorization, hook, runtime policy and failure behavior',()=>{
 assert.equal(patchVoiceNativeTools(patched),patched);
 for(const anchor of ['authorizeResolvedSessionMutation','runBeforeToolCallHook','approvalMode: params.approvalMode','gatewayTool.execute','signal: params.signal'])assert(patched.includes(anchor));
 assert(patched.includes('surface: directCodingTool ? "loopback" : "http"'));
 assert.throws(()=>patchVoiceNativeTools('unknown source'));
});
