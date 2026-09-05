// Read-only scoped production canary observer. Never prints credentials or reasoning.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');
const pid=execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const x of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[x.slice(0,x.indexOf('='))]=x.slice(x.indexOf('=')+1);
const {callGatewayFromCli}=await import('/opt/openclaw-2026.9.1-v/openclaw/dist/plugin-sdk/gateway-runtime.js');
const call=async(m,p={})=>{
 for(let attempt=0;;attempt++){
  try{return await callGatewayFromCli(m,{timeout:'20000',json:true},p);}
  catch(error){if(m!=='chat.history'||error.retryable!==true||attempt>=8)throw error;await new Promise(r=>setTimeout(r,error.retryAfterMs??250));}
 }
};
const chat='oc_ede0fdc8e94dc40d7424691ddf80d948';
let result;
if(process.argv[2]==='history'){
 const key=process.argv[3];assert(key.includes(chat)&&key.startsWith('agent:makaron:'));
 const h=await call('chat.history',{agentId:'makaron',sessionKey:key,limit:6});
 result={sessionId:h.sessionId,active:h.sessionInfo.hasActiveRun,runtime:h.sessionInfo.agentRuntime,model:h.sessionInfo.model,
  messages:h.messages.map(m=>({role:m.role,timestamp:m.timestamp,content:Array.isArray(m.content)?m.content.filter(c=>c.type!=='thinking'):m.content}))};
}else{
 const s=await call('sessions.list',{agentId:'makaron',search:chat,limit:10});
 const w=await call('vlab.workers.status');
 result={sessions:s.sessions.map(x=>({key:x.key,sessionId:x.sessionId,active:x.hasActiveRun,runtime:x.agentRuntime,model:x.model})),pending:w.pending,workers:w.workers.map(x=>({slot:x.slot,activeCount:x.activeCount,ready:x.ready})),stats:w.integration.nativeHarnessStats};
}
await new Promise(resolve=>process.stdout.write(JSON.stringify(result)+'\n',resolve));
