import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,'01a06fbe-7654-7331-8d6e-73a8cd2dcd7e');
const unit='openclaw-vlab-production-mirror-v8.service';
const pid=execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);
const core=root+'/runtime/npm-global/lib/node_modules/openclaw';
const {callGatewayFromCli}=await import(core+'/dist/plugin-sdk/gateway-runtime.js');
const status=await callGatewayFromCli('vlab.workers.status',{timeout:'15000',json:true},{});
assert.equal(status.pending??0,0);
assert((status.workers??[]).every(w=>!(w.activeCount>0)),'Active Worker; no writes');
const paths=[root+'/state/openclaw.json',JSON.parse(fs.readFileSync(root+'/state/openclaw.json')).plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath];
const backup=root+'/backups/astra-codex-alias-20260905';
fs.mkdirSync(backup,{mode:0o700});
execFileSync('systemctl',['cat',unit],{stdio:['ignore',fs.openSync(backup+'/unit.before.txt','wx',0o600),'inherit']});
// Existing VLab-only unexpired access token; never copy or refresh production credentials.
const db=new DatabaseSync('/srv/vlab-production-mirror/labs/instances/astra/state/agents/v-codex/agent/openclaw-agent.sqlite',{readOnly:true});
const all=db.prepare('SELECT store_json FROM auth_profile_store').all().flatMap(r=>Object.values(JSON.parse(r.store_json).profiles??{}));db.close();
const profile=structuredClone(all.find(p=>p.provider==='openai'&&p.type==='oauth'&&p.access&&p.expires>Date.now()+3600000));
assert(profile,'No usable Lab access token');assert(!profile.refresh,'Refuse refresh credentials');
const profileId='openai:lab-astra-access-only';
const {ensureAuthProfileStore,saveAuthProfileStore}=await import(core+'/dist/plugin-sdk/agent-runtime.js');
for(const id of ['makaron','v-codex']) {
 const c=JSON.parse(fs.readFileSync(paths[0]));const dir=c.agents.entries[id].agentDir??root+'/state/agents/'+id+'/agent';
 const store=ensureAuthProfileStore(dir,{allowKeychainPrompt:false});
 store.profiles[profileId]=profile;store.order={...store.order,openai:[profileId]};
 saveAuthProfileStore(store,dir);
}
for(const [i,p] of paths.entries()) {
 fs.copyFileSync(p,backup+'/'+i+'.before.json',fs.constants.COPYFILE_EXCL);
 const c=JSON.parse(fs.readFileSync(p));
 for(const id of ['makaron','v-codex']) {
  const a=c.agents.entries[id];a.models??={};
  const old=a.models['openai/gpt-6-astra']??{};
  a.models['openai/gpt-6-astra']={...old,alias:'astra',params:{...old.params,thinking:'high'},agentRuntime:{id:'codex'}};
 }
 c.auth.profiles[profileId]={provider:'openai',mode:'oauth'};
 c.auth.order.openai=[profileId];
 fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');
}
console.log(JSON.stringify({ok:true,alias:'astra',model:'openai/gpt-6-astra',runtime:'codex',thinking:'high',scope:'Makaron and v-codex model metadata only; primary defaults unchanged',auth:'Lab access-only profile',backup}));
