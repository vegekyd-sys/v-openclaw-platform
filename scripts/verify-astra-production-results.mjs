import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
assert.equal(os.hostname(),'VM-8-2-ubuntu');
const {callGatewayFromCli}=await import('/opt/openclaw-2026.9.1-v/openclaw/dist/plugin-sdk/gateway-runtime.js');
const cases=[
 ['makaron','astra-prod-smoke-1788590853514-d740eb61','vlab-worker'],
 ['v-codex','astra-prod-smoke-1788590882329-9d365f78','codex'],
];
for(const [agentId,id,runtime] of cases){
 const h=await callGatewayFromCli('chat.history',{timeout:'25000',json:true},{agentId,sessionKey:`agent:${agentId}:explicit:${id}`,limit:12},{scopes:['operator.read'],useStoredDeviceAuth:false});
 const msgs=h.messages??[];
 const result={agentId,model:h.sessionInfo?.model,provider:h.sessionInfo?.modelProvider,runtime:h.sessionInfo?.agentRuntime?.id,toolResult:msgs.some(m=>m.role==='toolResult'&&JSON.stringify(m.content).includes('ASTRA_PROD_TOOL_OK')),reply:msgs.some(m=>m.role==='assistant'&&JSON.stringify(m.content).includes('ASTRA_PROD_REPLY_OK'))};
 console.log(JSON.stringify(result));
 assert.equal(result.model,'gpt-6-astra');assert.equal(result.provider,'openai');assert.equal(result.runtime,runtime);assert(result.toolResult&&result.reply);
}
const main='/home/openclaw/.openclaw/openclaw.json';
const overlay='/home/openclaw/.openclaw/experiments/agent-worker-isolation-v1/worker-openclaw.json';
const backup='/home/openclaw/.openclaw/backups/astra-ui-20260905';
const project=c=>({defaults:c.agents?.defaults?.model,agents:Object.fromEntries(Object.entries(c.agents?.entries??{}).map(([id,a])=>[id,a.model]))});
for(const [file,before] of [[main,`${backup}/main.before.json`],[overlay,`${backup}/overlay.before.json`]])assert.deepEqual(project(JSON.parse(fs.readFileSync(file))),project(JSON.parse(fs.readFileSync(before))));
console.log(JSON.stringify({productionAstraPassed:true,defaultsUnchanged:true,productionWrites:false}));
