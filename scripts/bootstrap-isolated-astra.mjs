import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const root=process.argv[2];
assert.equal(root,'/srv/vlab-production-mirror/labs/instances/astra');
assert.equal(process.getuid(),0,'Admin-only setup; never print credentials');
const source='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902/state/agents/v-codex/agent/openclaw-agent.sqlite';
const db=new DatabaseSync(source,{readOnly:true});
const profiles=db.prepare('SELECT store_json FROM auth_profile_store').all().flatMap(r=>Object.values(JSON.parse(r.store_json).profiles??{}));db.close();
const current=profiles.filter(p=>p.type==='oauth'&&p.provider==='openai'&&p.access&&p.expires>Date.now()+3600000).sort((a,b)=>b.expires-a.expires)[0];
assert(current,'No unexpired VLab OpenAI access token; use independent login, never refresh shared auth');
const profile=structuredClone(current);
profile.refresh='';delete profile.refreshToken;delete profile.refresh_token;
const profileId='openai:lab-astra-access-only';
const codexPlugin=`${root}/runtime/npm/projects/openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2/node_modules/@openclaw/codex`;
const binary=`${root}/runtime/codex-0.153.4/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex`;
assert(fs.existsSync(binary));assert(fs.existsSync(codexPlugin+'/openclaw.plugin.json'));
for(const f of ['openclaw.json','worker-openclaw.json']) {
  const p=`${root}/state/${f}`,c=JSON.parse(fs.readFileSync(p));
  c.agents.entries['v-codex']={name:'Isolated Codex',workspace:`${root}/workspace`,agentDir:`${root}/state/agents/v-codex/agent`,model:{primary:'openai/gpt-5.6-sol',fallbacks:[]},models:{'openai/gpt-5.6-sol':{agentRuntime:{id:'codex'}}}};
  c.plugins.allow=[...new Set([...c.plugins.allow,'openai','codex'])];
  // Codex owns a reserved native harness. Let OpenClaw's official bundled-plugin
  // installer register it; config.load would downgrade its ownership to custom.
  c.plugins.load.paths=c.plugins.load.paths.filter(p=>p!==codexPlugin);
  c.plugins.entries.openai={enabled:true};
  c.plugins.entries.codex={enabled:true,config:{appServer:{command:binary}}};
  c.auth??={};c.auth.profiles??={};c.auth.profiles[profileId]={provider:'openai',mode:'oauth'};
  c.auth.order={...(c.auth.order??{}),openai:[profileId]};
  fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');
}
Object.assign(process.env,{HOME:root,OPENCLAW_HOME:root,OPENCLAW_STATE_DIR:`${root}/state`,OPENCLAW_CONFIG_PATH:`${root}/state/openclaw.json`,OPENCLAW_WORKSPACE_DIR:`${root}/workspace`,CODEX_HOME:`${root}/codex`});
const {saveAuthProfileStore}=await import(pathToFileURL(`${root}/runtime/openclaw/dist/plugin-sdk/agent-runtime.js`));
for(const id of ['lab','v-codex']) {
  const dir=`${root}/state/agents/${id}/agent`;fs.mkdirSync(dir,{recursive:true,mode:0o700});
  saveAuthProfileStore({version:1,profiles:{[profileId]:profile},order:{openai:[profileId]}},dir);
}
console.log(JSON.stringify({instance:'astra',codexBinary:'0.153.4',auth:'VLab access-token-only private copy',refreshCopied:false,expiresAt:new Date(profile.expires).toISOString(),productionChanged:false}));
