import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import{execFileSync}from'node:child_process';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902',unit='openclaw-vlab-production-mirror-v8.service';
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,'codex-db91-contention-20260907');
const pid=Number(execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}));assert(pid>1);
const cfg=JSON.parse(fs.readFileSync(root+'/state/openclaw.json'));const{GatewayClient}=await import(root+'/runtime/npm-global/lib/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js');let client;
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{client?.stop();reject(Error('connection deadline'));},20000);client=new GatewayClient({url:'ws://127.0.0.1:24993',token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.write'],onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:e=>{clearTimeout(timer);client?.stop();reject(e);}});client.start();});
try{const s=await client.request('vlab.workers.status',{}, {timeoutMs:20000});assert.equal(s.pending,0);assert(s.workers.length&&s.workers.every(w=>w.ready&&!w.activeCount&&!w.queued));
const inventory=await client.request('sessions.list',{limit:1000},{timeoutMs:20000});assert(!inventory.hasMore);assert(!(inventory.sessions??[]).some(s=>s.hasActiveRun||['running','queued','busy','active'].includes(s.status)));
console.log(JSON.stringify({pid,pending:0,activeSessions:0,sessionsInspected:inventory.sessions.length,workers:s.workers.map(w=>({pid:w.pid,activeCount:w.activeCount,queued:w.queued,ready:w.ready}))}));
}finally{client.stop();}
