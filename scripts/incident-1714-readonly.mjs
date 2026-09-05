import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');
const file='/home/openclaw/.openclaw/openclaw.json',base='/home/openclaw/.openclaw/backups/astra-browser-nativehooks-20260905/0.apply.candidate.json';
function diff(a,b,p=''){if(JSON.stringify(a)===JSON.stringify(b))return [];if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)||Array.isArray(b))return [p];return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>diff(a[k],b[k],p?p+'.'+k:k));}
console.log(JSON.stringify({configChangedPathsSinceOurApply:diff(JSON.parse(fs.readFileSync(base)),JSON.parse(fs.readFileSync(file)))}));
const pid=execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);
process.env.OPENCLAW_CONFIG_PATH=file;
const {callGatewayFromCli}=await import('/opt/openclaw-2026.9.1-v/openclaw/dist/plugin-sdk/gateway-runtime.js');
const r=await callGatewayFromCli('chat.history',{timeout:'20000',json:true},{sessionKey:'agent:makaron:feishu:group:oc_3093c03dab8938387ebc87ad047ea773',limit:35});
console.log(JSON.stringify({status:r.sessionInfo?.status,recent:(r.messages??[]).filter(m=>m.role==='assistant').map(m=>({at:m.timestamp,parts:m.content?.filter?.(c=>c.type==='text'||c.type==='toolCall').map(c=>c.type==='text'?{text:c.text?.slice(0,900)}:{tool:c.name,containsGatewayRestart:/systemctl.*restart.*openclaw-gateway/.test(JSON.stringify(c.arguments)),mentionsConfig:/openclaw.json|config.*set/.test(JSON.stringify(c.arguments))})}))}));
const call=(method,params={})=>callGatewayFromCli(method,{timeout:'20000',json:true},params);
const h=await call('health'),w=await call('vlab.workers.status');
console.log(JSON.stringify({health:h.ok,eventLoop:h.eventLoop,feishu:h.channels?.feishu,worker:w}));
const dm=await call('chat.history',{sessionKey:'agent:makaron:feishu:direct:ou_cb133fd4414f0607e8b46a3195c7b9d8',limit:3});
console.log(JSON.stringify({dmStatus:dm.sessionInfo?.status,model:dm.sessionInfo?.model,runtime:dm.sessionInfo?.agentRuntime,messages:dm.messages?.map(m=>({role:m.role,at:m.timestamp,content:m.content?.filter?.(c=>c.type==='text').map(c=>c.text?.slice(0,900))}))}));
