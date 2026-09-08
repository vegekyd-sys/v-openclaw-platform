// Metadata only, for this experiment's own session.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,'codex-db91-contention-20260907');
const key=process.argv[2];assert(/^agent:makaron:explicit:db91-affinity-\d+-\d+$/.test(key));
const cfg=JSON.parse(fs.readFileSync(root+'/state/openclaw.json'));
const{GatewayClient}=await import(root+'/runtime/npm-global/lib/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js');
let client;await new Promise((resolve,reject)=>{client=new GatewayClient({url:'ws://127.0.0.1:24993',token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read'],onHelloOk:resolve,onConnectError:reject});client.start();});
try{const h=await client.request('chat.history',{agentId:'makaron',sessionKey:key,limit:15},{timeoutMs:15000});
console.log(JSON.stringify({runtime:h.sessionInfo?.agentRuntime,messages:h.messages.map(m=>({role:m.role,stopReason:m.stopReason,idempotencyKey:m.idempotencyKey,toolName:m.toolName,isError:m.isError,content:(Array.isArray(m.content)?m.content:[]).map(c=>c.type==='toolCall'?{type:c.type,name:c.name}:c.type==='text'?{type:c.type,chars:c.text?.length,mentionsHealth:/umemory_search_index_health/.test(c.text??''),claimsComplete:/检查完成/.test(c.text??'')}: {type:c.type})}))}));}finally{client.stop();}
