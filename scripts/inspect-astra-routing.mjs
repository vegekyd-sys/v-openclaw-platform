import fs from 'node:fs';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
const roots = os.hostname()==='VM-0-4-ubuntu' ? [
 ['/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902/state','shared'],
 ['/srv/vlab-production-mirror/labs/instances/astra/state','private'],
] : [['/home/openclaw/.openclaw','production']];
for (const [root,label] of roots) {
 const c=JSON.parse(fs.readFileSync(root+'/openclaw.json'));
 const result={label,codexCommand:c.plugins?.entries?.codex?.config?.appServer?.command,defaultModel:c.agents?.defaults?.model,models:{},agents:{},authOrder:c.auth?.order,authProfiles:{},stores:[]};
 const modelInfo=m=>Object.fromEntries(Object.entries(m??{}).filter(([k,v])=>/astra|5\.6-sol/.test(k)||/astra|vcodex/.test(v.alias??'')).map(([k,v])=>[k,{alias:v.alias,params:v.params,agentRuntime:v.agentRuntime}]));
 result.models=modelInfo(c.agents?.defaults?.models);
 for(const [id,a] of Object.entries(c.agents?.entries??{})) if(['makaron','v-codex','vcodex'].includes(id)) result.agents[id]={model:a.model,models:modelInfo(a.models),agentRuntime:a.agentRuntime};
 for(const [id,p] of Object.entries(c.auth?.profiles??{})) result.authProfiles[id]={provider:p.provider,mode:p.mode};
 for(const id of ['makaron','v-codex','lab']) {
  const dir=c.agents?.entries?.[id]?.agentDir??root+'/agents/'+id+'/agent';
  const dbPath=dir+'/openclaw-agent.sqlite';
  if(fs.existsSync(dbPath)) {
   const db=new DatabaseSync(dbPath,{readOnly:true});
   try { for(const row of db.prepare('SELECT store_json FROM auth_profile_store').all()) {
    const a=JSON.parse(row.store_json);
    result.stores.push({agent:id,order:a.order,profiles:Object.entries(a.profiles??{}).map(([id,p])=>({id,provider:p.provider,type:p.type,expires:p.expires,hasAccess:!!p.access,hasRefresh:!!p.refresh,hasKey:!!p.key,hasToken:!!p.token}))});
   }} finally {db.close();}
  }
  const path=root+'/agents/'+id+'/agent/auth-profiles.json';
  if(!fs.existsSync(path)) continue;
  const a=JSON.parse(fs.readFileSync(path));
  result.stores.push({agent:id,order:a.order,profiles:Object.entries(a.profiles??{}).map(([id,p])=>({id,provider:p.provider,type:p.type,expires:p.expires,hasAccess:!!p.access,hasRefresh:!!p.refresh,hasKey:!!p.key,hasToken:!!p.token}))});
 }
 console.log(JSON.stringify(result));
}
