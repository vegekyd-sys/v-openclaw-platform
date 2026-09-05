import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const root='/srv/vlab-production-mirror/labs/instances/steer91';
assert.equal(process.env.OPENCLAW_CONFIG_PATH,root+'/state/openclaw.json');
const {callGatewayFromCli}=await import(root+'/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');
const call=async(m,p)=>{
  for(let attempt=0;;attempt++){
    try{return await callGatewayFromCli(m,{timeout:'45000',json:true},p);}
    catch(error){
      if(m!=='chat.history'||error.retryable!==true||attempt>=8)throw error;
      await new Promise(r=>setTimeout(r,Math.max(250,error.retryAfterMs??250)));
    }
  }
};
const stamp=Date.now(),key=`agent:lab:explicit:steer91-${stamp}`;
const log=(phase,value={})=>console.log(JSON.stringify({at:new Date().toISOString(),phase,...value}));
const first=await call('chat.send',{agentId:'lab',sessionKey:key,deliver:false,idempotencyKey:`steer91-first-${stamp}`,timeoutMs:150000,
  message:'这是隔离环境的 Steer 验收，不处理业务、不发消息、不修改配置、不委托。请先用 exec 执行 sleep 30（前台等待，若返回进程ID则用 process 等它完成），完成后只回复 STEER91_ORIGINAL_DONE。若执行期间收到用户新指令，以新指令改变本轮最终回复。'});
log('first-admitted',{runId:first.runId,key});
let ready=false;
for(let i=0;i<60;i++){
  const h=await call('chat.history',{agentId:'lab',sessionKey:key,limit:20});
  if(h.messages?.some(m=>m.role==='assistant'&&m.content?.some(x=>x.type==='toolCall'||x.type==='tool_use'))){ready=true;break;}
  const s=await call('agent.wait',{runId:first.runId,timeoutMs:1});
  if(s.status!=='timeout'&&s.status!=='running'){log('early-terminal',{status:s.status});break;}
  await new Promise(r=>setTimeout(r,1000));
}
assert(ready,'No actual tool-call boundary reached');
log('tool-boundary');
const second=await call('chat.send',{agentId:'lab',sessionKey:key,deliver:false,idempotencyKey:`steer91-second-${stamp}`,queueMode:'steer',timeoutMs:150000,
  message:'【Steer 变更】立即改变正在执行的这一个任务：不要回复旧的 ORIGINAL 标记，也不要另外启动一轮任务。现有前台工具结束后，本轮最终只回复 STEER91_CHANGED_OK。'});
log('steer-admitted',{runId:second.runId,status:second.status,keys:Object.keys(second)});
for(let i=0;i<3;i++){
  const s=await call('agent.wait',{runId:first.runId,timeoutMs:40000});log('wait-first',{status:s.status});if(s.status!=='timeout'&&s.status!=='running')break;
}
const h=await call('chat.history',{agentId:'lab',sessionKey:key,limit:30});
const final=h.messages.filter(m=>m.role==='assistant').flatMap(m=>m.content?.filter(x=>x.type==='text').map(x=>x.text)??[]).join('\n');
const result={runtime:h.sessionInfo?.agentRuntime?.id,original:final.includes('STEER91_ORIGINAL_DONE'),changed:final.includes('STEER91_CHANGED_OK'),roles:h.messages.map(m=>m.role),firstRunId:first.runId,secondRunId:second.runId};
log('result',result);
fs.writeFileSync(root+'/workspace/steer91-last-result.json',JSON.stringify(result,null,2));
assert(!result.original && result.changed,'Active turn did not adopt the new target');
