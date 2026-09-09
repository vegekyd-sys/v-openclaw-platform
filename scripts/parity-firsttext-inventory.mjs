// Read-only, bounded metadata. Never print config, prompts, transcripts, or secrets.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const root='/srv/vlab-production-mirror/labs/instances/db91-parity';
const c=JSON.parse(fs.readFileSync(root+'/state/openclaw.json'));
const hashes=[];
function walk(p,depth=0){
 if(depth>3)return;
 for(const e of fs.readdirSync(p,{withFileTypes:true})){
  if(e.name.startsWith('.')||e.name==='node_modules')continue;
  const f=p+'/'+e.name;
  if(e.isDirectory())walk(f,depth+1);
  else if(/^(AGENTS|SOUL|IDENTITY|USER|TOOLS|HEARTBEAT|BOOTSTRAP|CORE.*)\.md$/i.test(e.name))hashes.push({file:f.slice(root.length),sha256:createHash('sha256').update(fs.readFileSync(f)).digest('hex')});
 }
}
walk(root+'/workspace');
console.log(JSON.stringify({port:c.gateway.port,channels:Object.keys(c.channels??{}),cron:c.cron?.enabled,browser:c.browser?.enabled,
 defaults:{model:c.agents.defaults.model,thinkingDefault:c.agents.defaults.thinkingDefault,maxConcurrent:c.agents.defaults.maxConcurrent},
 agents:c.agents.list?.map(a=>({id:a.id,model:a.model,thinkingDefault:a.thinkingDefault})),
 worker:c.plugins.entries['vlab-agent-worker-isolation'].config,
 mcpEnabled:Object.fromEntries(Object.entries(c.mcp?.servers??{}).map(([k,v])=>[k,v.enabled!==false])),hashes},null,2));
