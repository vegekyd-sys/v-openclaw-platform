import fs from 'node:fs';
import {createGptLiveContinuationRuntimeSource} from './patch-gpt-live-consult-continuation.mjs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PATCHED,pluginFiles,PLUGIN_SOURCE,PLUGIN_TARGET} from './build-inter-session-plan.mjs';
import {CAPTURE,buildTaskPresentation} from './build-feishu-task-presentation.mjs';
import {patchTaskPresentationMonitor,patchTaskPresentationSessionsSend} from './patch-feishu-task-presentation.mjs';
import {patchFollowupPresentation} from './patch-feishu-task-followup.mjs';
import {patchProgressToolIdentity,patchProgressProtocolIdentity,patchProgressEventIdentity,patchProgressRendererIdentity} from './patch-task-progress-identity.mjs';
import {patchPresentedCommandDelivery,patchPresentedAnnounceReceipt} from './patch-task-command-delivery.mjs';
import {patchSuppressedPromptContext,patchSuppressedPromptAttempt,patchPrePersistedPromptMirror,patchSettledFinalizerRoute,patchBoundedDeepSeekCatalog} from './patch-codex-suppressed-prompt-finalization.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=b=>createHash('sha256').update(b).digest('hex');
// One deterministic composition per runtime target. Never overlay two release
// plans: doing so silently removes either relay admission or native rendering.
export async function buildUnifiedPresentation({write=true}={}){
 const dir='lab/release-files/unified-session-presentation',byTarget=new Map();
 for(const f of buildTaskPresentation({write:false}).files)byTarget.set(f.target,{...f});
 const continuationName='gpt-live-consult-continuation.js',continuationSource=dir+'/core/'+continuationName;
 const continuationBefore=fs.readFileSync(path.join(root,CAPTURE,'dist',continuationName),'utf8'),continuationAfter=createGptLiveContinuationRuntimeSource();
 if(write){fs.mkdirSync(path.dirname(path.join(root,continuationSource)),{recursive:true});fs.writeFileSync(path.join(root,continuationSource),continuationAfter);}
 byTarget.set('openclaw/dist/'+continuationName,{source:continuationSource,target:'openclaw/dist/'+continuationName,before:sha(continuationBefore),sha256:sha(continuationAfter)});
 const commandTarget='openclaw/dist/agent-command-DPfawBbr.js';
 const command=byTarget.get(commandTarget),commandSource=dir+'/core/agent-command-DPfawBbr.js';
 const commandBytes=fs.readFileSync(path.join(root,command.source),'utf8').replaceAll('presentInterSessionTask','presentUnifiedAgentTask').replace('from "./v-feishu-task-presentation-runtime.mjs"','from "./v-feishu-task-presentation-command.mjs"');
 if(write){fs.mkdirSync(path.dirname(path.join(root,commandSource)),{recursive:true});fs.writeFileSync(path.join(root,commandSource),commandBytes);}
 byTarget.set(commandTarget,{...command,source:commandSource,sha256:sha(commandBytes)});
 for(const r of PATCHED.filter(r=>r.component==='feishu'||r.component==='core'&&r.pkg!=='telegram-inter-session-bridge')){
  const captured=CAPTURE+(r.component==='feishu'?'.feishu/dist/dist/':'/dist/')+r.file;
  const before=fs.readFileSync(path.join(root,captured),'utf8');
  const m=await import(path.join(root,r.module));let after=m[r.fn](before);
  if(r.component==='feishu')after=patchProgressRendererIdentity(patchTaskPresentationMonitor(after));
  if(r.file==='openclaw-tools-BODVdJQD.js')after=patchProgressToolIdentity(after);
  if(r.file==='sessions-spawn-tool-1FQMTkIo.js')after=patchTaskPresentationSessionsSend(after);
  if(r.file==='agent-runner.runtime-CAdsMsQt.js')after=patchFollowupPresentation(after);
  const source=dir+'/'+r.component+'/'+r.file;
  if(write){fs.mkdirSync(path.dirname(path.join(root,source)),{recursive:true});fs.writeFileSync(path.join(root,source),after);}
  byTarget.set(r.target,{source,target:r.target,before:sha(before),sha256:sha(after)});
 }
 for(const [name,patch] of [['src-B9mb84px.js',patchProgressProtocolIdentity],['progress-card-CciYmFS8.js',patchProgressEventIdentity],['subagent-announce-delivery-Dosep7Zr.js',patchPresentedAnnounceReceipt]]){
  const before=fs.readFileSync(path.join(root,CAPTURE,'dist',name),'utf8'),after=patch(before),source=dir+'/core/'+name,target='openclaw/dist/'+name;
  if(write){fs.mkdirSync(path.dirname(path.join(root,source)),{recursive:true});fs.writeFileSync(path.join(root,source),after);}
  byTarget.set(target,{source,target,before:sha(before),sha256:sha(after)});
 }
 const adapter='lab/feishu-task-presentation-followup.mjs',adapterTarget='openclaw/dist/v-feishu-task-presentation-followup.mjs';
 byTarget.set(adapterTarget,{source:adapter,target:adapterTarget,before:null,sha256:sha(fs.readFileSync(path.join(root,adapter)))});
 for(const suffix of ['delivery','command','core-bridge']){
  const source='lab/feishu-task-presentation-'+suffix+'.mjs',target='openclaw/dist/v-feishu-task-presentation-'+suffix+'.mjs';
  byTarget.set(target,{source,target,before:null,sha256:sha(fs.readFileSync(path.join(root,source)))});
 }
 const deliveryName='delivery.runtime-CAsclR-9.js',deliverySource=dir+'/core/'+deliveryName,deliveryTarget='openclaw/dist/'+deliveryName;
 const deliveryBefore=fs.readFileSync(path.join(root,'lab/fixtures/unified-session-presentation',deliveryName),'utf8'),deliveryAfter=patchPresentedCommandDelivery(deliveryBefore);
 if(write)fs.writeFileSync(path.join(root,deliverySource),deliveryAfter);
 byTarget.set(deliveryTarget,{source:deliverySource,target:deliveryTarget,before:sha(deliveryBefore),sha256:sha(deliveryAfter)});
 for(const rel of pluginFiles(root)){
  const source=PLUGIN_SOURCE+'/'+rel,target=PLUGIN_TARGET+'/'+rel;
  byTarget.set(target,{source,target,before:null,sha256:sha(fs.readFileSync(path.join(root,source)))});
 }
 for(const [name,patch] of [['settled-turn-context-D3SNWtUn.js',patchSuppressedPromptContext],['run-attempt-D1hJO4fX.js',patchSuppressedPromptAttempt],['transcript-mirror-DTUxFWa_.js',patchPrePersistedPromptMirror],['settled-turn-finalizer-BVJx4yoc.js',patchSettledFinalizerRoute],['bounded-turn-wzJrwKKe.js',patchBoundedDeepSeekCatalog]]){
  const before=fs.readFileSync(path.join(root,CAPTURE+'.codex/dist/dist',name),'utf8'),after=patch(before),source=dir+'/codex/'+name;
  const target='npm/projects/openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2/node_modules/@openclaw/codex/dist/'+name;
  if(write){fs.mkdirSync(path.dirname(path.join(root,source)),{recursive:true});fs.writeFileSync(path.join(root,source),after);}
  byTarget.set(target,{source,target,before:sha(before),sha256:sha(after)});
 }
 const files=[...byTarget.values()].sort((a,b)=>a.target.localeCompare(b.target));
 const plan={files:files.map(({sha256,...r})=>r)};
 if(write){
  fs.writeFileSync(path.join(root,dir,'manifest.json'),JSON.stringify({capture:CAPTURE,scope:'Feishu relay plus task presentation; other channel bridges unchanged',files},null,2)+'\n');
  fs.writeFileSync(path.join(root,'lab/unified-session-presentation.plan.json'),JSON.stringify(plan,null,2)+'\n');
  const base=JSON.parse(fs.readFileSync(path.join(root,'lab/candidate/inter-session-feishu-v-env.plan.json'),'utf8'));
  base.env.ISC_CODEX_RUNTIME_FILES=plan.files.filter(f=>f.target.includes('/@openclaw/codex/dist/')).map(f=>f.target).join(',');
  const savePlan=(name,p)=>fs.writeFileSync(path.join(root,'lab/unified-session-presentation.'+name+'.plan.json'),JSON.stringify(p,null,2)+'\n');
  for(const harness of ['worker','vds']){
   savePlan('core.'+harness,{...base,files:plan.files,env:{...base.env,RELAY_HARNESS:harness,V_FEISHU_TASK_PRESENTATION:'1',ISC_FEISHU_MODE:'mock',RUN_TAG:'UNIFIED',ISC_SCENARIOS:'F1i,F2,F3b-rpc,F3c,F5,F7,F10,F13,F15'}});
   const voice=JSON.parse(fs.readFileSync(path.join(root,'lab/feishu-task-presentation.'+harness+'.plan.json'),'utf8'));
   savePlan('voice.'+harness,{...voice,env:{...voice.env,ISC_CODEX_RUNTIME_FILES:base.env.ISC_CODEX_RUNTIME_FILES},files:[...plan.files,...voice.files.filter(f=>f.target.startsWith('extensions/bound-task-candidate/'))]});
   savePlan('relay-consult.'+harness,{...voice,tests:['lab/candidate/relay-consult-smoke.mjs'],env:{...voice.env,BOUND_TASK_RELAY:'1',ISC_CODEX_RUNTIME_FILES:base.env.ISC_CODEX_RUNTIME_FILES},files:[...plan.files,...voice.files.filter(f=>f.target.startsWith('extensions/bound-task-candidate/'))]});
  }
  for(const [name,env] of [['joint',{ISC_ANNOUNCE_FOLLOWUP:'1'}],['announce-fault',{ISC_ANNOUNCE_EMPTY_RETRY:'1'}],['finalizer-fault',{ISC_FINALIZER_SUPPRESSED:'1',ISC_ANNOUNCE_FOLLOWUP:'1'}]])
   savePlan(name,{...base,files:plan.files,support:[...base.support,'lab/candidate/unified-announce.mjs'],command:['/opt/vlab/node-v22.23.1-linux-x64/bin/node','lab/candidate/unified-announce.mjs'],timeoutSeconds:720,
    env:{...base.env,RELAY_HARNESS:'vds',V_FEISHU_TASK_PRESENTATION:'1',ISC_FEISHU_MODE:'mock',RUN_TAG:'UNIFIED',...env}});
 }
 return{files,plan};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify({files:(await buildUnifiedPresentation()).files.length}));
