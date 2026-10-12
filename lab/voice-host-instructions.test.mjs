import test from 'node:test';import assert from 'node:assert/strict';
import {resolveVoiceHostInstructions} from './voice-host-instructions.mjs';
import {resolveGptLiveCallInstructions} from './gpt-live-call-lifecycle.mjs';
const profile={providerId:'openai',model:'gpt-live-1-codex',transport:'webrtc',brain:'agent-consult',capabilities:{handlesAgentConsult:true,supportsToolCalls:false}};
test('legacy client keeps its existing code profile',()=>assert.equal(resolveVoiceHostInstructions(undefined,{}),undefined));
test('only the native Voice host can supply product instructions',()=>{
 assert.equal(resolveVoiceHostInstructions('product policy',{profile,clientCaps:['voice-direct-tools']}),'product policy');
 for(const options of [{profile,clientCaps:[]},{profile:{...profile,model:'other'},clientCaps:['voice-direct-tools']},{profile:{...profile,transport:'gateway-relay'},clientCaps:['voice-direct-tools']}])assert.throws(()=>resolveVoiceHostInstructions('x',options));
 for(const s of ['',{},'x'.repeat(24001),'汉'.repeat(23000)])assert.throws(()=>resolveVoiceHostInstructions(s,{profile,clientCaps:['voice-direct-tools']}));
});
test('host policy is used without adding the old product prompt again',()=>{assert.equal(resolveGptLiveCallInstructions('config',{...profile,hostInstructions:'Voice policy'}),'Voice policy');assert.equal(resolveGptLiveCallInstructions('unchanged',{...profile,model:'other',hostInstructions:'Voice policy'}),'unchanged');});
