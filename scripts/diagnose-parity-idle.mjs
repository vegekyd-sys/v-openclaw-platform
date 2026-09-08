import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
assert.equal(os.hostname(),'VM-0-4-ubuntu');const root='/srv/vlab-production-mirror/labs/instances/db91-parity';
const [tag]=process.argv.slice(2);assert(/^[A-Za-z0-9-]{1,40}$/.test(tag));
const report=JSON.parse(fs.readFileSync(root+'/tmp/parity-results/background-'+tag+'.json'));
const cfg=JSON.parse(fs.readFileSync(root+'/state/openclaw.json'));
const {GatewayClient}=await import(root+'/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js');let client;
await new Promise((resolve,reject)=>{client=new GatewayClient({url:'ws://127.0.0.1:26340',token:cfg.gateway.auth.token,clientName:'cli',mode:'cli',scopes:['operator.read','operator.write','operator.admin'],onHelloOk:resolve,onConnectError:reject});client.start();});
try{const broad=await client.request('sessions.list',{limit:100});for(const [index,session]of report.sessions.entries()){
 const scoped=await client.request('sessions.list',{agentId:session.agentId,search:session.key,limit:10,archived:'all'});
 const before=broad.sessions.find(s=>s.key===session.key),after=scoped.sessions.find(s=>s.key===session.key),normalized=scoped.sessions.find(s=>s.key===session.key.toLowerCase());
 console.log(JSON.stringify({index,agentId:session.agentId,broadCount:broad.sessions.length,scopedCount:scoped.sessions.length,broadFound:!!before,scopedFound:!!after,broadActive:before?.hasActiveRun,scopedActive:after?.hasActiveRun,normalizedFound:!!normalized,normalizedActive:normalized?.hasActiveRun,normalizedKey:normalized?.key}));
}}finally{client.stop();}
