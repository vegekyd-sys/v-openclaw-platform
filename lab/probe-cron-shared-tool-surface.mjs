// Full native tool factory, fresh synthetic state, no Gateway/model/network access.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import vm from 'node:vm';import {pathToFileURL}from'node:url';
const [candidate]=process.argv.slice(2);assert(candidate?.startsWith('/tmp/'));assert.equal(os.hostname(),'VM-0-4-ubuntu');
const root=fs.mkdtempSync('/tmp/cron-surface-native-'),dist='/srv/vlab-production-mirror/labs/instances/db91-parity/runtime/openclaw/dist';
process.env.HOME=root;process.env.OPENCLAW_STATE_DIR=root+'/state';process.env.OPENCLAW_CONFIG_PATH=root+'/openclaw.json';process.env.OPENCLAW_CRON_SHARED_POLICY=root+'/policy.json';process.env.OPENCLAW_SKIP_CRON='1';
fs.mkdirSync(root+'/workspace');const cfg={agents:{defaults:{workspace:root+'/workspace'},entries:{makaron:{workspace:root+'/workspace'}}},tools:{profile:'full'},plugins:{enabled:false},cron:{enabled:false}};
fs.writeFileSync(process.env.OPENCLAW_CONFIG_PATH,JSON.stringify(cfg));const policy=enabled=>fs.writeFileSync(process.env.OPENCLAW_CRON_SHARED_POLICY,JSON.stringify({version:1,agents:{makaron:{mode:'shared',enabled}}}));policy(true);
const options={config:cfg,workspaceDir:root+'/workspace',agentId:'makaron',sessionKey:'agent:makaron:feishu:group:synthetic-A',messageChannel:'feishu',messageProvider:'feishu',agentAccountId:'default',senderId:'employee-a',senderIsOwner:false};
const native=await import(dist+'/agent-tools-djVuP1H1.js');
const modules=new Map();async function linked(specifier){const url=new URL(specifier,pathToFileURL(dist+'/agent-tools-djVuP1H1.js')).href;if(modules.has(url))return modules.get(url);const values=await import(url);const m=new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{identifier:url});modules.set(url,m);return m;}
const fixed=new vm.SourceTextModule(fs.readFileSync(candidate,'utf8'),{identifier:dist+'/agent-tools-djVuP1H1.js',importModuleDynamically:async s=>{const m=await linked(s);if(m.status==='unlinked')await m.link(()=>{});if(m.status==='linked')await m.evaluate();return m;}});await fixed.link(linked);await fixed.evaluate();
const names=fn=>fn(options).map(t=>t.name).sort();
try{const before=names(native.t),after=names(fixed.namespace.t);assert(!before.includes('automations'));assert(after.includes('automations'));assert.deepEqual(after.filter(n=>n!=='automations'),before);console.log(JSON.stringify({test:'real-native-factory-nonowner',before:before.length,after:after.length,onlyAdded:'automations'}));
policy(false);assert.deepEqual(names(fixed.namespace.t),before);policy(true);assert(!fixed.namespace.t({...options,senderId:undefined}).some(t=>t.name==='automations'));console.log(JSON.stringify({test:'real-native-disabled-or-missing-sender',passed:true}));
console.log(JSON.stringify({ok:true,modelsCalled:0,gatewayTouched:false,businessStateTouched:false}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
