import assert from 'node:assert/strict';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const {callGatewayFromCli}=await import(pathToFileURL(root+'/runtime/npm-global/lib/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js'));
const call=(method,params)=>callGatewayFromCli(method,{timeout:'60000',json:true},params);
const agentId=process.argv[2];
assert(['makaron','v-codex'].includes(agentId));
const id=`astra-probe-${agentId}-${Date.now()}`;
const key=`agent:${agentId}:explicit:${id}`;
const log=(stage,x={})=>console.log(JSON.stringify({at:new Date().toISOString(),stage,...x}));
const catalog=await call('models.list',{agentId,view:'all'});
log('catalog',{models:catalog.models.filter(x=>x.provider==='openai'&&x.id==='gpt-6-astra')});
try {
  await call('sessions.patch',{key,agentId,model:'openai/gpt-6-astra',thinkingLevel:'low',label:id});
  const admitted=await call('chat.send',{
    agentId,sessionKey:key,idempotencyKey:id,
    thinking:'low',deliver:false,timeoutMs:150000,
    message:'Isolated Astra compatibility test. Do not change files, configs, memory, or process business. Use a shell/exec tool to execute exactly: printf ASTRA_TOOL_OK. Then respond ASTRA_REPLY_OK. If any tool or model fails, report the error and do not claim success. Do not delegate or retry.'
  });
  log('admitted',{key,...admitted});
  const runId=admitted.runId??id;
  let finalStatus;
  for(let i=0;i<3;i++) {
    const done=await call('agent.wait',{runId,timeoutMs:55000});
    finalStatus=done.status;
    log('wait',{runId,...done});
    if(done.status!=='timeout'&&done.status!=='running')break;
  }
  const history=await call('chat.history',{agentId,sessionKey:key,limit:14});
  const info=history.sessionInfo??{};
  log('history',{sessionInfo:{agentRuntime:info.agentRuntime,model:info.model,modelProvider:info.modelProvider},messages:history.messages?.map(m=>({role:m.role,model:m.model,provider:m.provider,stopReason:m.stopReason,errorMessage:m.errorMessage,content:typeof m.content==='string'?m.content.slice(0,1500):m.content?.map(b=>({type:b.type,name:b.name,text:b.text?.slice(0,1500),arguments:b.arguments}))}))});
  assert.equal(finalStatus,'ok','Run did not complete successfully');
  assert.equal(info.model,'gpt-6-astra','Fallback must not count as Astra acceptance');
  assert.equal(info.agentRuntime?.id,agentId==='v-codex'?'codex':'vlab-worker');
  const assistants=history.messages?.filter(m=>m.role==='assistant')??[];
  const text=assistants.map(m=>typeof m.content==='string'?m.content:m.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n')).join('\n');
  assert.match(text,/ASTRA_REPLY_OK/);
  const encoded=JSON.stringify(history.messages?.filter(m=>m.role!=='user'));
  assert.match(encoded,/ASTRA_TOOL_OK/,'Tool evidence missing');
  log('passed',{key,runtime:info.agentRuntime.id});
} catch(e) {
  log('failed',{key,message:e.message});
  process.exitCode=1;
}
