// Collect the original review after its client deadline; never submit it again.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');assert.equal(process.getuid(),0);
const root='/home/openclaw/.openclaw',file=root+'/backups/v2026.9.1-db91.1/v-review.json',report=JSON.parse(fs.readFileSync(file));
assert(!report.completed);const pid=execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const e of fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0')){const i=e.indexOf('=');if(i>0)process.env[e.slice(0,i)]=e.slice(i+1);}
const cfg=JSON.parse(fs.readFileSync(root+'/openclaw.json')),{GatewayClient}=await import('/opt/openclaw-2026.9.1-v/openclaw/dist/plugin-sdk/gateway-runtime.js');let client;
await new Promise((resolve,reject)=>{client=new GatewayClient({url:'ws://127.0.0.1:22793',token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read'],onHelloOk:resolve,onConnectError:reject});client.start()});
try{
 const h=await client.request('chat.history',{agentId:'makaron',sessionKey:report.key,limit:100},{timeoutMs:30000});
 assert.equal(h.messages.filter(m=>m.role==='user').length,1);assert.equal(h.messages.find(m=>m.role==='user').idempotencyKey,report.id+':user');
 const last=h.messages.filter(m=>m.role==='assistant').at(-1);assert.equal(last.stopReason,'stop');
 report.text=(last.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('');assert(report.text.includes(report.id));
 assert(report.text.includes('结论：接受本次有限修复发布口径'),'Review verdict must be inspected before continuing');
 const s=await client.request('sessions.list',{agentId:'makaron',search:report.key,limit:5},{timeoutMs:30000});assert.equal(s.sessions.find(x=>x.key===report.key)?.hasActiveRun,false);
 report.completed=true;report.model=last.model;report.finishedAt=last.timestamp;report.collectedAt=Date.now();report.clientDeadlineExpiredBeforeFinal=true;
 fs.writeFileSync(file,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({reviewAccepted:true,noResend:true,model:report.model,finalAt:last.timestamp}));
}finally{client.stop();}
