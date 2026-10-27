import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {patchCronExecution,patchCronDelivery} from './patch-feishu-continuation-progress.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const capture='release/captured/v2026.9.1-db91.6-unified-session-20261027';
const feishu='npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/';
const dir='lab/release-files/feishu-continuation-progress';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
export function buildCronPresentation({write=true}={}){
 const files=[];
 function add(name,target,after,before=null){
  const source=dir+'/'+name;files.push({source,target,before:before===null?null:sha(before),sha256:sha(after)});
  if(write){fs.mkdirSync(path.dirname(path.join(root,source)),{recursive:true});fs.writeFileSync(path.join(root,source),after);}
 }
 for(const [name,patch] of [['isolated-agent-BxeXdw5A.js',patchCronExecution],['run-delivery.runtime-falxHVAy.js',patchCronDelivery]]){
  const before=read('lab/fixtures/feishu-continuation-progress/'+name);add(name,'openclaw/dist/'+name,patch(before),before);
 }
 add('v-feishu-task-presentation-cron.mjs','openclaw/dist/v-feishu-task-presentation-cron.mjs',read('lab/feishu-task-presentation-cron.mjs').replace("'./feishu-task-presentation-delivery.mjs'","'./v-feishu-task-presentation-delivery.mjs'"));
 add('v-feishu-task-presentation.mjs',feishu+'v-feishu-task-presentation.mjs',read('lab/feishu-task-presentation.mjs'),read(capture+'.feishu/dist/dist/v-feishu-task-presentation.mjs'));
 // Shared VLab additionally fixed the p2p entry-event envelope. Preserve the
 // observed bytes; before hashes deliberately reject a concurrent deployment.
 const monitor=read('lab/fixtures/feishu-continuation-progress/monitor.account-WFdlCDhR.js');
 const title="const title=record.source==='queued-followup'?";
 if(monitor.split(title).length!==2)throw Error('Native task title anchor drift');
 let patchedMonitor=monitor.replace(title,"const title=record.source==='cron-continuation'?'↩️ 自动续接':record.source==='queued-followup'?");
 const state='const taskState={state,runId:',attach='vTaskStatusAttach(params.sessionKey, session,';
 for(const anchor of [state,attach])if(patchedMonitor.split(anchor).length!==2)throw Error('Cron renderer anchor drift: '+anchor);
 patchedMonitor=patchedMonitor.replace(state,'const taskState={state,source:record.source,runId:').replace(attach,"if (params.boundTaskPresentation?.source !== 'cron-continuation') vTaskStatusAttach(params.sessionKey, session,");
 // The conversation-wide background summary is a single slot and can say
 // 'ended' when another turn settles. A cron card's own streaming lifecycle
 // already shows its execution state; never attach that unrelated summary.
 add('monitor.account-WFdlCDhR.js',feishu+'monitor.account-WFdlCDhR.js',patchedMonitor,monitor);
 const plan={files:files.map(({sha256,...f})=>f)};
 if(write){
  fs.writeFileSync(path.join(root,dir,'manifest.json'),JSON.stringify({capture,files},null,2)+'\n');
  fs.writeFileSync(path.join(root,'lab/feishu-continuation-progress.plan.json'),JSON.stringify(plan,null,2)+'\n');
  const base=JSON.parse(read('lab/feishu-task-presentation.vds.plan.json'));
  for(const harness of ['vds','worker'])fs.writeFileSync(path.join(root,`lab/feishu-continuation-progress.${harness}.plan.json`),JSON.stringify({...base,
   files:[...plan.files,...base.files.filter(f=>f.target.startsWith('extensions/bound-task-candidate/'))],
   tests:['lab/candidate/feishu-continuation-progress.mjs'],env:{...base.env,BOUND_TASK_HARNESS:harness},timeoutSeconds:600},null,2)+'\n');
 }
 return {files,plan};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify({files:buildCronPresentation().files.length}));
