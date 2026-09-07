// Read-only scoped status and synthetic-user multiplicity, never message text.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const production=process.argv.includes('--production'),privateLab=process.argv.includes('--private');
assert(!(production&&privateLab));assert.equal(os.hostname(),production?'VM-8-2-ubuntu':'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root=production?'/home/openclaw/.openclaw':privateLab?'/srv/vlab-production-mirror/labs/instances/db91-fix':'/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const unit=production?'openclaw-gateway.service':privateLab?'openclaw-lab-db91-fix.service':'openclaw-vlab-production-mirror-v8.service';
const pid=execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();assert(Number(pid)>1);
for(const v of fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0')){const i=v.indexOf('=');if(i>0)process.env[v.slice(0,i)]=v.slice(i+1);}
assert.equal(process.env.OPENCLAW_CONFIG_PATH,root+(production?'/openclaw.json':'/state/openclaw.json'));
const cfg=JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH));
const core=production?'/opt/openclaw-2026.9.1-v/openclaw':root+(privateLab?'/runtime/openclaw':'/runtime/npm-global/lib/node_modules/openclaw');
const {GatewayClient}=await import(core+'/dist/plugin-sdk/gateway-runtime.js');
let client;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{client?.stop();reject(Error('connect timeout'));},20000);client=new GatewayClient({url:'ws://127.0.0.1:'+cfg.gateway.port,token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.admin'],onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:e=>{clearTimeout(timer);reject(e);}});client.start();});
try {
 const status=await client.request('vlab.workers.status',{}, {timeoutMs:20000});
 console.log(JSON.stringify({pid,port:cfg.gateway.port,pending:status.pending,workers:status.workers.map(w=>({pid:w.pid,ready:w.ready,activeCount:w.activeCount,queued:w.queued}))}));
 const path=process.argv.slice(2).find(a=>!a.startsWith('--'));
 if(path){assert(path.startsWith(root+'/'));const timeline=JSON.parse(fs.readFileSync(path));
  for(const round of timeline.rounds)for(const j of round.jobs){assert(j.sessionKey.includes('db91-timeline-'));
   const h=await client.request('chat.history',{agentId:'makaron',sessionKey:j.sessionKey,limit:30},{timeoutMs:20000});
   const users=(h.messages??[]).filter(m=>m.role==='user');
   console.log(JSON.stringify({runId:j.runId,userCount:users.length,idempotencyPresent:users.map(m=>typeof m.idempotencyKey==='string')}));
   assert.equal(users.length,1,'duplicate or missing user turn');
  }
 }
} finally {client.stop();}
