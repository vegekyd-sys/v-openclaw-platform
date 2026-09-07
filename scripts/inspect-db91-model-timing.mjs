// Read only the synthetic timeline sessions; emit timestamps/usage, never text.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';
assert.equal(os.hostname(),'VM-0-4-ubuntu');
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const cfg=JSON.parse(fs.readFileSync(root+'/state/openclaw.json'));
const dir=root+'/state/db91-c5-release-20260907';
const name=fs.readdirSync(dir).filter(n=>/^timeline-\d+\.json$/.test(n)).sort().at(-1);
const source=JSON.parse(fs.readFileSync(dir+'/'+name));
const {GatewayClient}=await import(root+'/runtime/npm-global/lib/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js');
let client;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{client?.stop();reject(Error('connect timeout'));},20000);client=new GatewayClient({url:'ws://127.0.0.1:24993',token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.admin'],onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:e=>{clearTimeout(timer);reject(e);}});client.start();});
const result=[];
try{for(const round of source.rounds){for(const [index,j] of round.jobs.entries()){
 assert(j.sessionKey.includes('db91-timeline-'));
 const h=await client.request('chat.history',{agentId:'makaron',sessionKey:j.sessionKey,limit:30},{timeoutMs:20000});
 result.push({round:round.label,index,messages:(h.messages??[]).filter(m=>m.role!=='user').map(m=>({role:m.role,atMs:(typeof m.timestamp==='number'?m.timestamp:Date.parse(m.timestamp))-j.start,stopReason:m.stopReason,types:(m.content??[]).map(c=>c.type),tools:(m.content??[]).filter(c=>c.type==='toolCall').map(c=>c.name),usage:m.usage?{input:m.usage.input,output:m.usage.output,cacheRead:m.usage.cacheRead,totalTokens:m.usage.totalTokens}:undefined}))});
 }}console.log(JSON.stringify({source:name,jobs:result},null,2));}finally{client.stop();}
