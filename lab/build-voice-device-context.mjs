import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {createHash} from 'node:crypto';import {dirname,resolve} from 'node:path';import assert from 'node:assert/strict';
import {patchVoiceDeviceContextSdk,patchVoiceDeviceContextTalk} from './patch-voice-device-context.mjs';
const root=resolve(import.meta.dirname,'..'),folder='lab/release-files/voice-device-context-20261025',hash=x=>createHash('sha256').update(x).digest('hex');
const entries=[{name:'realtime-voice.js',target:'openclaw/dist/plugin-sdk/realtime-voice.js',before:'0140ae09dd6218cc41ca28606ca3c906426c84dd069ba0e903f3c32b5bddc626',patch:patchVoiceDeviceContextSdk},{name:'talk-DkFuKRod.js',target:'openclaw/dist/talk-DkFuKRod.js',before:'f01a6e7b16cea92da439d1bacda8b6f0159acbc55e9157d130893a3e204fff3c',patch:patchVoiceDeviceContextTalk}];
const files=[];
for(const entry of entries){const input=readFileSync(resolve(root,'lab/fixtures/voice-device-context',entry.name));assert.equal(hash(input),entry.before);const source=folder+'/'+entry.name;mkdirSync(dirname(resolve(root,source)),{recursive:true});writeFileSync(resolve(root,source),entry.patch(input.toString()));files.push({source,target:entry.target,before:entry.before});}
files.push({source:'lab/voice-device-context.mjs',target:'openclaw/dist/voice-device-context.mjs',before:null});
const plan={files,tests:['lab/candidate/voice-device-context.mjs'],support:['lab/voice-device-context.mjs'],timeoutSeconds:120};
writeFileSync(resolve(root,'lab/voice-device-context.plan.json'),JSON.stringify(plan,null,2)+'\n');console.log(JSON.stringify({files:files.length,plan:'lab/voice-device-context.plan.json'}));
