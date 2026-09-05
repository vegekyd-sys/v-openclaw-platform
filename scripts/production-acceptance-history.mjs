import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');
const pid=execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);
process.env.OPENCLAW_CONFIG_PATH='/home/openclaw/.openclaw/openclaw.json';
const {callGatewayFromCli}=await import('/opt/openclaw-2026.9.1-v/openclaw/dist/plugin-sdk/gateway-runtime.js');
for(const group of ['oc_ede0fdc8e94dc40d7424691ddf80d948']) {
 const r=await callGatewayFromCli('chat.history',{timeout:'20000',json:true},{sessionKey:'agent:makaron:feishu:group:'+group,limit:20});
 const i=r.sessionInfo??{};
 console.log(JSON.stringify({group,info:Object.fromEntries(['sessionId','model','modelProvider','agentRuntime','thinkingLevel','status'].map(k=>[k,i[k]])),messages:(r.messages??[]).map(m=>({role:m.role,at:m.timestamp,tool:m.toolName,content:m.content?.filter?.(c=>c.type!=='thinking').map(c=>c.type==='toolCall'?{type:c.type,name:c.name}: {type:c.type,text:c.text?.slice(0,1800)})}))}));
}
