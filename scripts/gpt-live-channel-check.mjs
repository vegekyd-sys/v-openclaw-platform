// Exclusive shared VLab window for GPT Live compatibility. Never production.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
const unit='openclaw-vlab-production-mirror-v8.service';
const owner='01a074fd-0a5f-7c02-b86a-10dbed7c4eb4';
assert.equal(execFileSync('hostname',{encoding:'utf8'}).trim(),'VM-0-4-ubuntu');
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,owner);
const pid=execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();
assert(Number(pid)>1);
for(const item of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0')){
 const i=item.indexOf('=');if(i>0)process.env[item.slice(0,i)]=item.slice(i+1);
}
assert.equal(process.env.OPENCLAW_CONFIG_PATH,`${root}/state/openclaw.json`);
const cfg=JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH));
assert.equal(cfg.gateway.port,24993);
const {GatewayClient}=await import(`${root}/runtime/npm-global/lib/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js`);
let client;
await new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(Error('connect deadline')),20000);
 client=new GatewayClient({url:'ws://127.0.0.1:24993',token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.admin','operator.read','operator.write'],onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:e=>{clearTimeout(timer);reject(e);}});client.start();
});
try {
 const s=await client.request('vlab.workers.status',{});
 console.log(JSON.stringify({gatewayPid:pid,generation:s.generation,closing:s.closing,pending:s.pending,workers:s.workers.map(w=>({pid:w.pid,ready:w.ready,activeCount:w.activeCount,queued:w.queued})),stats:s.integration?.nativeHarnessStats}));
 if(process.argv[2]==='inspect'){
  const all=await client.request('sessions.list',{limit:1000});
  assert(!all.hasMore,'Uninspected session page');
  console.log(JSON.stringify({activeSessions:(all.sessions??[]).filter(s=>s.hasActiveRun===true||['running','queued','busy','active'].includes(s.status)).map(s=>({key:s.key,status:s.status}))}));
  const sessions=await client.request('sessions.list',{search:'ou_775a78b0aaae67da5e15eeaf102e3cd9',limit:20});
  console.log(JSON.stringify({sessions:(sessions.sessions??[]).map(s=>({key:s.key,sessionId:s.sessionId,model:s.model,modelProvider:s.modelProvider,agentRuntime:s.agentRuntime,status:s.status,updatedAt:s.updatedAt}))}));
 }
 if(process.argv[2]==='catalog'){
  const c=await client.request('talk.catalog',{});
  console.log(JSON.stringify({ready:c.ready,activeProvider:c.activeProvider,providers:c.providers?.map(p=>({id:p.id,configured:p.configured,ready:p.ready}))}));
 }
 if(process.argv[2]==='history'){
  const key=process.argv[3];assert(key.includes('ou_775a78b0aaae67da5e15eeaf102e3cd9'));
  const h=await client.request('chat.history',{agentId:'makaron',sessionKey:key,limit:20});
  const relevant=(h.messages??[]).filter(m=>JSON.stringify(m.content).includes('VLAB_HOT_RELOAD_'));
  console.log(JSON.stringify({sessionKey:key,runtime:h.sessionInfo?.agentRuntime,status:h.sessionInfo?.status,messages:relevant}));
 }
} finally {client.stop();}
