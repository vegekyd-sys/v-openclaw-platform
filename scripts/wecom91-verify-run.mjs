import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync}from'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');
const key=process.argv[2];assert(key?.startsWith('agent:makaron:explicit:wecom91-worker-regression-'));
const pid=execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);
process.env.OPENCLAW_CONFIG_PATH='/home/openclaw/.openclaw/openclaw.json';
const{callGatewayFromCli}=await import('/opt/openclaw-2026.9.1-v/openclaw/dist/plugin-sdk/gateway-runtime.js');
const h=await callGatewayFromCli('chat.history',{timeout:'30000',json:true},{agentId:'makaron',sessionKey:key,limit:30});
assert.equal(h.sessionInfo?.agentRuntime?.id,'vlab-worker');
const results=h.messages.filter(x=>x.role==='toolResult'&&x.toolName==='wecom-cli');
assert.equal(results.length,2);
for(const m of results){
 assert(!m.isError,'Worker tool result failed');
 const text=m.content.find(x=>x.type==='text')?.text;
 const data=JSON.parse(text);
 assert(!data.error,'Business API error');
 if(data.errcode!==undefined)assert.equal(data.errcode,0);
 console.log(JSON.stringify({verified:true,keys:Object.keys(data),counts:Object.fromEntries(Object.entries(data).filter(([k,v])=>Array.isArray(v)||/_count$/.test(k)).map(([k,v])=>[k,Array.isArray(v)?v.length:v]))}));
}
assert(h.messages.filter(x=>x.role==='assistant').some(x=>x.content?.some(y=>y.type==='text'&&y.text.includes('WECOM91_WORKER_OK'))));
console.log(JSON.stringify({runtime:'vlab-worker',model:h.sessionInfo.model,realToolResults:results.length,finalOk:true}));
