import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {patchTaskPresentationEntry,patchTaskPresentationMonitor,patchTaskPresentationEmbedded,patchTaskPresentationAgent,patchTaskPresentationConsult,patchTaskPresentationSessionsSend} from './patch-feishu-task-presentation.mjs';
export const CAPTURE='release/captured/v2026.9.1-db91.6-sessions-search-20261026';
export const FEISHU='npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=b=>createHash('sha256').update(b).digest('hex');
export function buildTaskPresentation({write=true}={}){
 const output='lab/release-files/feishu-task-presentation',files=[];
 const add=(name,target,content,before=null)=>{
  const source=output+'/'+name;files.push({source,target,before,sha256:sha(content)});
  if(write){fs.mkdirSync(path.dirname(path.join(root,source)),{recursive:true});fs.writeFileSync(path.join(root,source),content);}
 };
 const input=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
 for(const [name,patch,base,target] of [
  ['index.js',patchTaskPresentationEntry,CAPTURE+'.feishu/dist/dist/',FEISHU],
  ['monitor.account-WFdlCDhR.js',patchTaskPresentationMonitor,CAPTURE+'.feishu/dist/dist/',FEISHU],
  ['embedded-agent-DaSvA-Yk.js',patchTaskPresentationEmbedded,CAPTURE+'/dist/','openclaw/dist/'],
  ['agent-command-DPfawBbr.js',patchTaskPresentationAgent,CAPTURE+'/dist/','openclaw/dist/'],
  ['realtime-session-harness-CEO5kVAJ.js',patchTaskPresentationConsult,CAPTURE+'/dist/','openclaw/dist/'],
  ['sessions-spawn-tool-1FQMTkIo.js',patchTaskPresentationSessionsSend,CAPTURE+'/dist/','openclaw/dist/'],
 ]){const before=input(base+name);add(name,target+name,patch(before),sha(before));}
 add('v-feishu-task-presentation.mjs',FEISHU+'v-feishu-task-presentation.mjs',input('lab/feishu-task-presentation.mjs'));
 add('session-task-lifecycle.mjs','openclaw/dist/session-task-lifecycle.mjs',input('lab/session-task-lifecycle.mjs'));
 add('v-feishu-task-presentation-runtime.mjs','openclaw/dist/v-feishu-task-presentation-runtime.mjs',input('lab/feishu-task-presentation-runtime.mjs'));
 const actor=input(CAPTURE+'/dist/v-feishu-voice-actor.mjs');
 if(!actor.includes("'voice.product.task.lookup'")||!actor.includes("['runId','taskId','voiceSessionId','clientSecret']"))throw Error('Voice actor presentation anchor drift');
 add('v-feishu-voice-actor.mjs','openclaw/dist/v-feishu-voice-actor.mjs',actor.replace("'voice.product.task.lookup'","'v.feishu.taskPresentation','voice.product.task.lookup'").replace("['runId','taskId','voiceSessionId','clientSecret']","['runId','taskId','voiceSessionId','clientSecret','presentationId']"),sha(actor));
 const plan={files:files.map(({sha256,...f})=>f)};
 if(write){fs.writeFileSync(path.join(root,output,'candidate-files.json'),JSON.stringify({files},null,2)+'\n');fs.writeFileSync(path.join(root,'lab/feishu-task-presentation.plan.json'),JSON.stringify(plan,null,2)+'\n');
  fs.writeFileSync(path.join(root,output,'voice-source-manifest.json'),JSON.stringify({files:[{source:'lab/realtime-direct-tools/backend.mjs',target:'realtime-direct-tools/backend.mjs',sha256:sha(input('lab/realtime-direct-tools/backend.mjs'))}],note:'Voice source artifact, separate from the Gateway files; no Voice service deployed.'},null,2)+'\n');
  const support=['lab/candidate/bound-task-support.mjs','lab/candidate/feishu-fake-open-api.mjs','lab/candidate/feishu-no-live.cjs',
    'lab/realtime-direct-tools/backend.mjs','lab/realtime-direct-tools/tools.mjs','lab/realtime-direct-tools/lark-readonly.mjs',
    'lab/gpt-live-consult-progress.mjs','lab/gpt-live-h5/result-presentation.mjs','lab/gpt-live-h5/media-references.mjs'];
  for(const harness of ['worker','vds']){
   const candidate={...plan,files:[...plan.files,...['index.js','openclaw.plugin.json','package.json'].map(name=>({source:'lab/candidate/bound-task-plugin/'+name,target:'extensions/bound-task-candidate/'+name}))],
    tests:['lab/candidate/bound-task-smoke.mjs'],support,user:'lab-db91-parity',env:{BOUND_TASK_HARNESS:harness},timeoutSeconds:600};
   fs.writeFileSync(path.join(root,'lab/feishu-task-presentation.'+harness+'.plan.json'),JSON.stringify(candidate,null,2)+'\n');
  }
 }
 return {files,plan};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify({files:buildTaskPresentation().files.length}));
