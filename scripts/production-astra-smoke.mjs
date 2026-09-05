// Review-first: no RPC unless --execute is explicitly present.
// No production config writes, no auth writes, no automatic scope escalation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const [core,main,overlay,...flags]=process.argv.slice(2);
assert(core&&main&&overlay,'Usage: node production-astra-smoke.mjs CORE MAIN OVERLAY [--execute] [--lab]');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const agents=flags.includes('--lab')?['lab','v-codex']:['makaron','v-codex'];
if(flags.includes('--lab'))assert(main.startsWith('/srv/vlab-production-mirror/labs/instances/astra/'));
const scopes=['operator.read','operator.write'];
const project=c=>({defaults:c.agents?.defaults?.model,agents:Object.fromEntries(Object.entries(c.agents?.entries??{}).map(([id,a])=>[id,a.model]))});
const initial=[main,overlay].map(p=>project(read(p)));
const checkDefaults=()=>[main,overlay].forEach((p,i)=>assert.deepEqual(project(read(p)),initial[i],`Defaults changed during smoke: ${p}. Stop and review concurrent activity; this script never restores or overwrites config.`));
const log=(stage,data={})=>console.log(JSON.stringify({at:new Date().toISOString(),stage,...data}));
for(const id of agents)assert(read(main).agents?.entries?.[id],`Existing agent ${id} is required`);
if(!flags.includes('--execute')) {
  log('plan-only',{agents,scopes,sessionsToCreate:2,configWrites:false,requiresExplicitExecute:true});
  process.exit(0);
}
assert.equal(path.resolve(process.env.OPENCLAW_CONFIG_PATH??''),path.resolve(main),'Set canonical production OPENCLAW_CONFIG_PATH before executing');
assert.equal(read(`${core}/package.json`).version,'2026.9.1');
const {callGatewayFromCli}=await import(pathToFileURL(`${core}/dist/plugin-sdk/gateway-runtime.js`));
// Explicit scopes use callGatewayWithScopes, not its scope-escalating CLI path.
// useStoredDeviceAuth:false prevents a cached admin device token selecting scopes.
const call=async(method,params)=>{
  checkDefaults();
  const result=await callGatewayFromCli(method,{timeout:'35000',json:true},params,{scopes,useStoredDeviceAuth:false});
  checkDefaults();return result;
};
const results=[];
try {
  for(const agentId of agents) {
    const id=`astra-prod-smoke-${Date.now()}-${randomUUID().slice(0,8)}`;
    const key=`agent:${agentId}:explicit:${id}`;
    // Deliberately only write-scope fields. thinkingLevel/permissionMode=full
    // in this patch would require operator.admin and MUST NOT be added.
    await call('sessions.patch',{key,agentId,model:'openai/gpt-6-astra',label:id});
    const sent=await call('chat.send',{agentId,sessionKey:key,idempotencyKey:id,deliver:false,thinking:'low',timeoutMs:90000,
      message:'Production release smoke in this NEW temporary session only. Do not process business, delegate, change config, memory, files, or send external messages. Execute exactly printf ASTRA_PROD_TOOL_OK once with a shell/exec tool. After receiving its actual output, reply exactly ASTRA_PROD_REPLY_OK. On failure report it; do not retry or claim success.'});
    const runId=sent.runId??id;log('started',{agentId,key,runId});
    let status;
    for(let i=0;i<3;i++) {
      const done=await call('agent.wait',{runId,timeoutMs:30000});status=done.status;
      log('wait',{agentId,runId,status});
      if(!['timeout','running'].includes(status))break;
    }
    const history=await call('chat.history',{agentId,sessionKey:key,limit:12});
    assert.equal(status,'ok','Run failed or timed out; do not touch business sessions');
    assert.equal(history.sessionInfo?.model,'gpt-6-astra');
    assert.equal(history.sessionInfo?.modelProvider,'openai');
    assert.equal(history.sessionInfo?.agentRuntime?.id,agentId==='v-codex'?'codex':'vlab-worker');
    const messages=history.messages??[];
    assert(messages.some(m=>m.role==='toolResult'&&JSON.stringify(m.content).includes('ASTRA_PROD_TOOL_OK')),'Missing real tool result');
    assert(messages.some(m=>m.role==='assistant'&&JSON.stringify(m.content).includes('ASTRA_PROD_REPLY_OK')),'Missing final reply');
    const result={agentId,key,runId,runtime:history.sessionInfo.agentRuntime.id,model:'openai/gpt-6-astra',toolResult:true,reply:true};
    results.push(result);log('passed',result);
  }
  checkDefaults();log('all-passed',{results,defaultsUnchanged:true,configWrites:false});
} catch(e) {log('failed',{error:e.message,completed:results,configWrites:false});process.exitCode=1;}
finally {checkDefaults();}
