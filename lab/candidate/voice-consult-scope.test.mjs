import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {pathToFileURL} from 'node:url';
const root=process.env.VLAB_CANDIDATE_RUNTIME;assert(root?.includes('/candidate-tests/runs/'));
const talk=path.join(root,'openclaw/dist/talk-DkFuKRod.js'),harness=path.join(root,'openclaw/dist/realtime-session-harness-CEO5kVAJ.js');
test('installed scoped Talk and harness import with actual Candidate dependencies',async()=>{
 await import(pathToFileURL(talk).href);await import(pathToFileURL(harness).href);
});
test('installed prompt preserves current input and skips repeated historical task prompts',()=>{
 const source=fs.readFileSync(harness,'utf8');assert(source.includes('voice-consult-scope-v1'));
 const start=source.indexOf('function buildScopedVoiceConsultPrompt('),end=source.indexOf('function buildRealtimeVoiceAgentConsultPrompt(',start);
 const build=vm.runInNewContext(source.slice(start,end)+';buildScopedVoiceConsultPrompt;',{parseRealtimeVoiceAgentConsultArgs:v=>v});
 const question='当前合作有哪些？保留具体例子和未完成项。';const prompt=build({surface:'browser',args:{question},transcript:[{role:'user',text:'OLD_CANCELLED_TASK'}]});
 assert(prompt.endsWith('User request:\n'+question));assert(!prompt.includes('OLD_CANCELLED_TASK'));assert(prompt.length<2500);
 const runtimeTalk=fs.readFileSync(talk,'utf8');assert(runtimeTalk.includes('voiceTaskMode: resolution.provider.id === "v-voice-gpt-live"'));
});
