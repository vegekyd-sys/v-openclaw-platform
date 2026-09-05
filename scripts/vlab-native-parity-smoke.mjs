import assert from 'node:assert/strict';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const g='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const {callGatewayFromCli}=await import(pathToFileURL(g+'/runtime/npm-global/lib/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js'));
const call=(method,params)=>callGatewayFromCli(method,{timeout:'60000',json:true},params);
const log=(stage,details={})=>console.log(JSON.stringify({at:new Date().toISOString(),stage,...details}));
const suffix=Date.now(),runs=[];
for(let i=0;i<3;i++) {
 const id=`native-parity-${suffix}-${i}`,key=`agent:makaron:explicit:${id}`;
 const result=await call('chat.send',{agentId:'makaron',sessionKey:key,deliver:false,idempotencyKey:id,
  message:`VLab 自动验收，不改配置、不写记忆，不处理业务。用 exec 执行 python3 -u -c 'import time; print("PARITY_START_${i}",flush=True); time.sleep(35); print("PARITY_TOOL_${i}",flush=True)'。若工具返回进程 session 就用 process 等它真正结束。最后只回复 PARITY_DONE_${i}，失败则如实报告，不重试、不委派。`});
 runs.push({key,id:result.runId??id,i});log('admitted',{key,runId:result.runId??id});
}
let peak=0;
for(let n=0;n<28;n++) {
 const s=await call('vlab.workers.status',{});
 const active=s.workers.reduce((a,w)=>a+w.active.filter(r=>runs.some(x=>x.key===r.sessionKey)).length,0);
 peak=Math.max(peak,active);
 log('sample',{active,totalActive:s.workers.reduce((a,w)=>a+w.activeCount,0),pending:s.pending});
 const results=await Promise.all(runs.map(r=>call('agent.wait',{runId:r.id,timeoutMs:1})));
 if(results.every(r=>r.status==='ok'))break;
 if(results.some(r=>r.status==='error'))throw new Error('Parity task failed');
 await new Promise(r=>setTimeout(r,5000));
}
for(const r of runs) {
 const h=await call('chat.history',{agentId:'makaron',sessionKey:r.key,limit:16});
 const messages=h.messages??[];
 const text=JSON.stringify(messages.filter(m=>m.role==='assistant'));
 const tool=JSON.stringify(messages.filter(m=>m.role==='toolResult'));
 assert.match(text,new RegExp(`PARITY_DONE_${r.i}`));assert.match(tool,new RegExp(`PARITY_TOOL_${r.i}`));
 assert.equal(h.sessionInfo?.agentRuntime?.id,'vlab-worker');
 log('passed',{key:r.key,runtime:h.sessionInfo.agentRuntime.id,tool:true,completion:true});
}
assert(peak>=3,`Need actual 3 concurrent Worker sessions, got ${peak}`);
log('concurrent-passed',{peak});
