import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createTaskPresentationAccount} from './feishu-task-presentation-native.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const capture='release/captured/v2026.9.1-db91.6-release-batch-20261028';
const feishu='npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/';
const out='lab/release-files/desktop-handback-progress';
const sha=s=>createHash('sha256').update(s).digest('hex');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
export function buildHandbackPresentation({write=true}={}){
 const files=[];
 function add(name,content){
  const before=read(capture+'.feishu/dist/dist/'+name),source=out+'/'+name;
  files.push({source,target:feishu+name,before:sha(before),sha256:sha(content)});
  if(write){fs.mkdirSync(path.dirname(path.join(root,source)),{recursive:true});fs.writeFileSync(path.join(root,source),content);}
 }
 add('v-feishu-task-presentation.mjs',read('lab/feishu-task-presentation.mjs'));
 let monitor=read(capture+'.feishu/dist/dist/monitor.account-WFdlCDhR.js');
 const guard="['cron-continuation','subagent-announce','queued-followup']";
 if(monitor.split(guard).length!==2)throw Error('Native lifecycle guard drift');
 monitor=monitor.replace(guard,"['cron-continuation','subagent-announce','queued-followup','desktop-handback']");
 const start=monitor.indexOf('function createTaskPresentationAccount(');
 if(start<0||monitor.slice(start).includes('\nexport ',1))throw Error('Native adapter tail drift');
 add('monitor.account-WFdlCDhR.js',monitor.slice(0,start)+createTaskPresentationAccount.toString()+'\n');
 const pluginFiles=['index.js','core/task-presentation.js'].map(name=>({source:'apps/v-desktop-handoff/plugin/'+name,target:'/opt/v-desktop-handoff/plugin/'+name,sha256:sha(read('apps/v-desktop-handoff/plugin/'+name))}));
 const plan={files:files.map(({sha256,...f})=>f)};
 if(write){
  fs.writeFileSync(path.join(root,out,'manifest.json'),JSON.stringify({capture,files,pluginFiles},null,2)+'\n');
  fs.writeFileSync(path.join(root,'lab/desktop-handback-progress.plan.json'),JSON.stringify(plan,null,2)+'\n');
  const base=JSON.parse(read('lab/feishu-continuation-progress.vds.plan.json'));
  const pluginRoot=path.join(root,'apps/v-desktop-handoff/plugin');
  const pluginSources=['index.js','package.json','openclaw.plugin.json',...fs.readdirSync(path.join(pluginRoot,'core')).filter(n=>n.endsWith('.js')).map(n=>'core/'+n)];
  fs.writeFileSync(path.join(root,'lab/desktop-handback-progress.candidate.plan.json'),JSON.stringify({...base,
   files:[...plan.files,...base.files.filter(f=>f.target.startsWith('extensions/bound-task-candidate/')),...pluginSources.map(n=>({source:'apps/v-desktop-handoff/plugin/'+n,target:'extensions/v-desktop-handoff/'+n}))],
   tests:['lab/candidate/desktop-handback-progress.mjs'],env:{BOUND_TASK_HARNESS:'vds'},timeoutSeconds:600},null,2)+'\n');
 }
 return {files,pluginFiles};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(buildHandbackPresentation().files.map(f=>({target:f.target,sha256:f.sha256}))));
