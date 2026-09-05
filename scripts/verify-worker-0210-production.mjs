import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');
const pid=execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);
process.env.OPENCLAW_CONFIG_PATH='/home/openclaw/.openclaw/openclaw.json';
const {callGatewayFromCli}=await import('/opt/openclaw-2026.9.1-v/openclaw/dist/plugin-sdk/gateway-runtime.js');
const call=(m,p={})=>callGatewayFromCli(m,{timeout:'20000',json:true},p);
const w=await call('vlab.workers.status'),h=await call('health');
console.log(JSON.stringify({pid,health:h.ok,eventLoop:h.eventLoop,version:w.integration?.workerIsolationVersion,blocked:w.integration?.productionPromotionBlocked,concurrency:w.openClawConcurrency,pending:w.pending,workers:w.workers.map(x=>({ready:x.ready,activeCount:x.activeCount,queued:x.queued})),integrationKeys:Object.keys(w.integration??{})}));
for(const group of ['oc_ecabb6515bef5df53bf5fd1dbeca79db','oc_ede0fdc8e94dc40d7424691ddf80d948']){
 const r=await call('chat.history',{sessionKey:'agent:makaron:feishu:group:'+group,limit:8}),i=r.sessionInfo??{};
 console.log(JSON.stringify({group,status:i.status,active:i.hasActiveRun,model:i.model,runtime:i.agentRuntime?.id,messages:r.messages?.map(m=>({role:m.role,tool:m.toolName,at:m.timestamp,content:m.content?.filter?.(c=>c.type!=='thinking').map(c=>({type:c.type,name:c.name,text:(c.text??c.content)?.slice?.(0,1000)}))}))}));
}
