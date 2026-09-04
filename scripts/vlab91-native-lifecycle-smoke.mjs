import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const {callGatewayFromCli}=await import(pathToFileURL(root+'/runtime/npm-global/lib/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js').href);
const call=async(method,params)=>{
  for(let n=0;;n++)try{return await callGatewayFromCli(method,{timeout:'60000',json:true},params);}
  catch(e){if(method!=='chat.history'||e.retryable!==true||n>=8)throw e;await new Promise(r=>setTimeout(r,500));}
};
const suffix=Date.now().toString(36),key=`agent:makaron:explicit:vlab91-permission-${suffix}`;
const runId=`vlab91-permission-${suffix}`;
const log=(stage,details={})=>console.log(JSON.stringify({at:new Date().toISOString(),stage,...details}));
await call('chat.send',{sessionKey:key,agentId:'makaron',deliver:false,idempotencyKey:runId,
  message:`VLab 独立权限回归，不处理业务、不写配置或记忆。调用 exec，command 精确为：python3 -u -c 'import time; print("VLAB91_PERMISSION_STARTED", flush=True); time.sleep(90); print("VLAB91_PERMISSION_TOOL_DONE")'。yieldMs=10000。若工具被权限变更或取消中断，不要重试，最终回复 VLAB91_PERMISSION_INTERRUPTED_OK。其它错误请原样报告，不报成功。若正常完成则回复 VLAB91_PERMISSION_FINISHED_OK。`});
log('admitted',{key,runId});
let found=false;
for(let n=0;n<45;n++){
  const history=await call('chat.history',{sessionKey:key,limit:8});
  found=history.messages?.some(m=>m.role==='assistant' && m.content?.some?.(b=>b.type==='toolCall' && b.name==='exec'));
  if(found)break;
  await new Promise(r=>setTimeout(r,2000));
}
assert(found,'Native exec did not start');log('exec-observed');
const changed=await call('sessions.patch',{key,agentId:'makaron',permissionMode:'read-only'});
log('permission-patch',{ok:changed.ok,mode:changed.entry?.permissionMode??changed.session?.permissionMode});
assert.notEqual(changed.ok,false);
const settled=await call('agent.wait',{runId,timeoutMs:60000});log('settled',{status:settled.status,error:settled.error});
const history=await call('chat.history',{sessionKey:key,limit:12});
const texts=history.messages?.filter(m=>m.role==='assistant').map(m=>typeof m.content==='string'?m.content:m.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n')).join('\n');
log('final',{text:texts?.slice(-1600),runtime:history.sessionInfo?.agentRuntime?.id});
const toolTexts=history.messages?.filter(m=>m.role==='toolResult').flatMap(m=>m.content?.filter(b=>b.type==='text').map(b=>b.text)??[]).join('\n');
log('tool-results',{text:toolTexts?.slice(-2000)});
assert.equal(history.sessionInfo?.agentRuntime?.id,'vlab-worker');
assert.match(toolTexts??'',/abort|cancel|permission|权限|终止|interrupted/i);
assert.match(texts??'',/VLAB91_PERMISSION_INTERRUPTED_OK/);
const status=await call('vlab.workers.status',{});
log('workers',{pending:status.pending,workers:status.workers.map(w=>({slot:w.slot,pid:w.pid,active:w.activeCount,queued:w.queued})),events:status.integration?.nativeHarnessEventParity?.eventsByCallback,relayFailures:status.integration?.nativeHarnessEventParity?.eventRelayFailures});
