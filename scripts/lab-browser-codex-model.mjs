import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,'01a06fbe-7654-7331-8d6e-73a8cd2dcd7e');
const pid=execFileSync('systemctl',['show','openclaw-vlab-production-mirror-v8.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);
const main=root+'/state/openclaw.json';const overlay=JSON.parse(fs.readFileSync(main)).plugins.entries['vlab-agent-worker-isolation'].config.workerConfigPath;
for(const [i,p] of [main,overlay].entries()){
 const c=JSON.parse(fs.readFileSync(p));const before=JSON.parse(fs.readFileSync(root+`/backups/browser-session-runtime-0.4.6/${i===0?'main':'worker'}.json.before`));
 assert(['deepseek/deepseek-v4-pro','openai/gpt-6-astra','openai/gpt-5.6-sol'].includes(c.agents.entries.makaron.model.primary));
 c.agents.entries.makaron.model=before.agents.entries.makaron.model;
 fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');
}
const {callGatewayFromCli}=await import(root+'/runtime/npm-global/lib/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js');
const mode=process.argv[2]??'codex';assert(['codex','restore'].includes(mode));
const r=await callGatewayFromCli('sessions.patch',{timeout:'20000',json:true},{key:'agent:makaron:feishu:direct:ou_775a78b0aaae67da5e15eeaf102e3cd9',expectedSessionId:'b0d6da6b-9cb2-4591-84f5-8adbe6be3404',model:mode==='codex'?'openai/gpt-5.6-sol':'deepseek/deepseek-v4-pro',thinkingLevel:mode==='codex'?'low':'high'});
console.log(JSON.stringify({ok:r.ok,mode,labDefaultModelRestored:true,productionChanged:false}));
