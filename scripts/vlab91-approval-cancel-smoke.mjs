import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import os from 'node:os';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const {callGatewayFromCli}=await import(pathToFileURL(root+'/runtime/npm-global/lib/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js').href);
const call=async(method,params)=>{
 for(let n=0;;n++)try{return await callGatewayFromCli(method,{timeout:'60000',json:true},params);}
 catch(e){if(method!=='chat.history'||e.retryable!==true||n>=8)throw e;await new Promise(r=>setTimeout(r,500));}
};
const suffix=Date.now().toString(36),key=`agent:makaron:explicit:vlab91-approval-${suffix}`;
const runId=`vlab91-approval-${suffix}`;
const log=(stage,details={})=>console.log(JSON.stringify({at:new Date().toISOString(),stage,...details}));
const history=()=>call('chat.history',{sessionKey:key,limit:15});
await call('sessions.patch',{key,agentId:'makaron',permissionMode:'guarded'});
await call('chat.send',{sessionKey:key,agentId:'makaron',deliver:false,idempotencyKey:runId,
 message:`VLab 独立审批取消测试，不处理业务、不改配置。请调用 exec 执行 python3 -u -c 'import time; print("VLAB91_APPROVAL_STARTED",flush=True); time.sleep(120)'，设置 ask=always、yieldMs=10000。等待人工审批，不要自行批准或改权限。`});
log('admitted',{key,runId});
let paused=false,active;
for(let n=0;n<45;n++){
 const status=await call('vlab.workers.status',{});
 active=status.workers.flatMap(w=>w.active.map(a=>({...a,pid:w.pid,slot:w.slot}))).find(a=>a.runId===runId);
 if(active?.nativeDeadline?.kind==='unlimited'){paused=true;break;}
 await new Promise(r=>setTimeout(r,2000));
}
log('approval-deadline',{paused,active});
const aborted=await call('chat.abort',{sessionKey:key,agentId:'makaron',runId});
log('abort',{aborted:aborted.aborted,runIds:aborted.runIds});
await call('agent.wait',{runId,timeoutMs:30000});
// Resume this exact conversation; an abandoned owner must not block it.
const next=runId+'-resume';
await call('chat.send',{sessionKey:key,agentId:'makaron',deliver:false,idempotencyKey:next,
 message:'这是取消后的恢复验收。不要调用工具，不处理旧任务，不写任何文件或记忆，只回复 VLAB91_CANCEL_RECOVERED_OK。'});
await call('agent.wait',{runId:next,timeoutMs:60000});
const h=await history();
const final=h.messages.filter(m=>m.role==='assistant').at(-1);
const text=typeof final?.content==='string'?final.content:final?.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n');
log('recovery',{text,runtime:h.sessionInfo?.agentRuntime?.id});
assert.match(text??'',/VLAB91_CANCEL_RECOVERED_OK/);
assert.equal(paused,true,'Native approval did not suspend the Worker business deadline');
const s=await call('vlab.workers.status',{});
log('final',{pending:s.pending,workers:s.workers.map(w=>({slot:w.slot,pid:w.pid,active:w.activeCount,queued:w.queued})),blocked:s.integration.productionPromotionBlocked,events:s.integration.nativeHarnessEventParity.eventsByCallback,relayFailures:s.integration.nativeHarnessEventParity.eventRelayFailures});
