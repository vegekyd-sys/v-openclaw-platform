import assert from 'node:assert/strict';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const {callGatewayFromCli}=await import(pathToFileURL(root+'/runtime/npm-global/lib/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js').href);
const call=async(method,params)=>{
 for(let n=0;;n++)try{return await callGatewayFromCli(method,{timeout:'60000',json:true},params);}
 catch(e){if(method!=='chat.history'||e.retryable!==true||n>=8)throw e;await new Promise(r=>setTimeout(r,500));}
};
const runId='vlab91-active-cancel-'+Date.now().toString(36),key='agent:makaron:explicit:'+runId;
const log=(stage,data={})=>console.log(JSON.stringify({at:new Date().toISOString(),stage,...data}));
await call('chat.send',{sessionKey:key,agentId:'makaron',deliver:false,idempotencyKey:runId,message:`VLab取消测试，不处理业务、不改配置。用 exec 执行 python3 -u -c 'import time; print("VLAB91_CANCEL_STARTED",flush=True); time.sleep(120)'，yieldMs=10000。`});
log('admitted',{key,runId});
let active,started=false;
for(let n=0;n<40;n++){
 const h=await call('chat.history',{sessionKey:key,limit:8});
 started=h.messages?.some(m=>m.role==='assistant'&&m.content?.some?.(b=>b.type==='toolCall'&&b.name==='exec'));
 const s=await call('vlab.workers.status',{});
 active=s.workers.flatMap(w=>w.active.map(a=>({...a,pid:w.pid}))).find(a=>a.runId===runId);
 if(started&&active)break;
 await new Promise(r=>setTimeout(r,1000));
}
assert(started&&active,'No active tool to cancel');log('active',{pid:active.pid});
const aborted=await call('chat.abort',{sessionKey:key,agentId:'makaron',runId});
assert.equal(aborted.aborted,true);log('aborted',{runIds:aborted.runIds});
await call('agent.wait',{runId,timeoutMs:30000});
const next=runId+'-resume';
await call('chat.send',{sessionKey:key,agentId:'makaron',deliver:false,idempotencyKey:next,message:'这是取消后恢复测试，不调用工具、不处理旧任务，只回复 VLAB91_ACTIVE_CANCEL_RECOVERED_OK。'});
await call('agent.wait',{runId:next,timeoutMs:60000});
const h=await call('chat.history',{sessionKey:key,limit:8});
const m=h.messages.filter(m=>m.role==='assistant').at(-1);
const text=typeof m?.content==='string'?m.content:m?.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n');
assert.match(text??'',/VLAB91_ACTIVE_CANCEL_RECOVERED_OK/);
const s=await call('vlab.workers.status',{});
assert(!s.workers.some(w=>w.active.some(a=>a.sessionKey===key)));
assert(s.workers.some(w=>w.pid===active.pid),'Worker was killed during per-session cancellation');
log('recovered',{text,workerPid:active.pid,pending:s.pending,relayFailures:s.integration.nativeHarnessEventParity.eventRelayFailures});
