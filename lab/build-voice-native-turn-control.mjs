import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';import {createHash} from 'node:crypto';
import {patchVoiceHostInstructionSchema,patchVoiceHostInstructionTalk} from './patch-voice-host-instructions.mjs';
import {patchGptLiveControlLaneController,patchGptLiveControlLaneTalk,patchGptLiveControlLaneRegistry} from './patch-gpt-live-control-lane.mjs';
import {createGptLiveCallLifecycleRuntimeSource} from './gpt-live-call-lifecycle.mjs';
import {createVoiceHostInstructionsRuntimeSource} from './voice-host-instructions.mjs';
const root=resolve(import.meta.dirname,'..'),sha=x=>createHash('sha256').update(x).digest('hex');
export function build(){
 const specs=[
 ['lab/fixtures/voice-host-instructions/src-B9mb84px.js','src-B9mb84px.js',patchVoiceHostInstructionSchema],
 ['lab/fixtures/voice-host-instructions/talk-DkFuKRod.js','talk-DkFuKRod.js',x=>patchGptLiveControlLaneTalk(patchVoiceHostInstructionTalk(x))],
 ['lab/release-files/gpt-live-call/realtime-quicksilver-delegation-controller-B0yPpiHp.js','realtime-quicksilver-delegation-controller-B0yPpiHp.js',patchGptLiveControlLaneController],
 ['lab/release-files/gpt-live-call/gpt-live-consult-continuation.js','gpt-live-consult-continuation.js',patchGptLiveControlLaneRegistry],
 ];const files=[];
 for(const [baseline,name,transform] of specs){const before=readFileSync(resolve(root,baseline),'utf8'),after=transform(before),source='lab/release-files/voice-native-turn-control/'+name;mkdirSync(dirname(resolve(root,source)),{recursive:true});writeFileSync(resolve(root,source),after);files.push({source,target:'openclaw/dist/'+name,before:sha(before)});}
 for(const [name,code] of [['gpt-live-call-lifecycle.mjs',createGptLiveCallLifecycleRuntimeSource()],['voice-host-instructions.mjs',createVoiceHostInstructionsRuntimeSource()]]){const source='lab/release-files/voice-native-turn-control/'+name;writeFileSync(resolve(root,source),code);files.push({source,target:'openclaw/dist/'+name});}
 writeFileSync(resolve(root,'lab/voice-native-turn-control.plan.json'),JSON.stringify({files},null,2)+'\n');return {files};
}
if(process.argv[1]===new URL(import.meta.url).pathname)console.log(JSON.stringify(build(),null,2));
