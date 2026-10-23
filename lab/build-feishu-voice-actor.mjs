import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {patchActorCallerIdentity,patchActorCatalog,patchActorDispatcher,patchActorToolInvoke,patchActorToolResolver,patchActorTalk,patchActorConsult,patchActorFeishuPolicy,actorRuntimeModule} from './patch-feishu-voice-actor.mjs';
import {patchConversationPhoneTabs} from './patch-feishu-phone-tabs.mjs';
import {patchWebhookChallenge} from './patch-feishu-webhook-challenge.mjs';

const [baselinePath,outputPath]=process.argv.slice(2);
if(!baselinePath||!outputPath)throw Error('Usage: node build-feishu-voice-actor.mjs READ_ONLY_BASELINE OUTPUT');
const baseline=resolve(baselinePath),output=resolve(outputPath);
await mkdir(output,{recursive:true});
const feishu='npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/';
const files=[],hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function add(name,target,bytes,before=null){
  await writeFile(output+'/'+name,bytes);files.push({source:relative(process.cwd(),output+'/'+name),target,before,sha256:hash(bytes)});
}
for(const [name,patch] of [['tools-catalog-DGR0f9wo.js',patchActorCatalog],['server-methods-CLElG7qF.js',patchActorDispatcher],['tools-invoke-ev4-EXmh.js',patchActorToolInvoke],
  ['tools-invoke-shared-CjpflNGO.js',patchActorToolResolver],['talk-DkFuKRod.js',source=>patchActorCallerIdentity(patchActorTalk(source))],['realtime-session-harness-CEO5kVAJ.js',patchActorConsult]]){
  const source=await readFile(baseline+'/'+name,'utf8');await add(name,'openclaw/dist/'+name,patch(source),hash(source));
}
const monitor='monitor.account-WFdlCDhR.js';
const source=await readFile(new URL('./release-files/feishu-auto-phone-tab/'+monitor,import.meta.url),'utf8');
await add(monitor,feishu+monitor,patchWebhookChallenge(patchActorFeishuPolicy(patchConversationPhoneTabs(source))),hash(source));
for(const name of ['feishu-voice-actor','feishu-voice-policy'])await add('v-'+name+'.mjs','openclaw/dist/v-'+name+'.mjs',await readFile(new URL('./'+name+'.mjs',import.meta.url)));
await add('v-feishu-phone-tabs.mjs',feishu+'v-feishu-phone-tabs.mjs',await readFile(new URL('./feishu-phone-tabs.mjs',import.meta.url)),
  hash(await readFile(baseline+'/v-feishu-phone-tabs.mjs')));
await add('v-feishu-voice-runtime.mjs','openclaw/dist/v-feishu-voice-runtime.mjs',actorRuntimeModule({feishuMonitor:'../../'+feishu+monitor,
  feishuClient:'../../'+feishu+'client-DMbIL3UH.js',commandAuth:'./command-auth-DmNN2m2f.js'}));
await add('v-feishu-voice-tools.mjs','openclaw/dist/v-feishu-voice-tools.mjs',await readFile(new URL('./feishu-voice-tools.mjs',import.meta.url)));
await writeFile(output+'/candidate-files.json',JSON.stringify({files},null,2)+'\n');
console.log(JSON.stringify({files:files.length,output}));
