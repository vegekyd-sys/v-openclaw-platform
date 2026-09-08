// Read existing VLab session metadata and save private fixture references.
// No message contents, titles, user identities or session keys in stdout.
import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
assert.equal(os.hostname(),'VM-0-4-ubuntu');assert.equal(process.getuid(),0);
const root='/srv/vlab-production-mirror/generations/candidate-official-update-final-20260902';
assert.equal(JSON.parse(fs.readFileSync('/srv/vlab-production-mirror/labs/control/integration.json')).owner,'codex-db91-contention-20260907');
const pid=execFileSync('systemctl',['show','openclaw-vlab-production-mirror-v8.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();assert(Number(pid)>1);
for(const v of fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0')){const i=v.indexOf('=');if(i>0)process.env[v.slice(0,i)]=v.slice(i+1);}
const cfg=JSON.parse(fs.readFileSync(root+'/state/openclaw.json'));
const {GatewayClient}=await import(root+'/runtime/npm-global/lib/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js');let client;
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{client?.stop();reject(Error('connect deadline'));},20000);client=new GatewayClient({url:'ws://127.0.0.1:24993',token:cfg.gateway.auth.token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.admin'],onHelloOk:()=>{clearTimeout(timer);resolve();},onConnectError:e=>{clearTimeout(timer);reject(e);}});client.start();});
try{
  const rows=[];let offset=0;
  for(let page=0;page<20;page++){
    const s=await client.request('sessions.list',{limit:1000,offset},{timeoutMs:20000});rows.push(...s.sessions??[]);
    if(!s.hasMore)break;assert(page<19&&s.nextOffset>offset);offset=s.nextOffset;
  }
  const key=r=>r.key??r.sessionKey??'';
  const eligible=rows.filter(r=>key(r).startsWith('agent:makaron:')&&!/db91|acceptance|smoke|benchmark|vlab-/i.test(key(r))&&!r.hasActiveRun);
  const group=eligible.filter(r=>key(r).includes(':group:')||r.chatType==='group'||r.kind==='group');
  const dm=eligible.filter(r=>key(r)==='agent:makaron:main'||key(r).includes(':direct:')||r.chatType==='direct'||r.kind==='direct');
  const choose=items=>items.sort((a,b)=>(b.totalTokens??0)-(a.totalTokens??0)||(b.updatedAt??0)-(a.updatedAt??0))[0];
  const main=eligible.find(r=>key(r)==='agent:makaron:main')??choose(dm);
  // Recent delivery-mirror-only sessions are not historical group fixtures.
  const candidates=group.sort((a,b)=>(b.updatedAt??0)-(a.updatedAt??0)).slice(0,20),scored=[];
  for(const entry of candidates){
    const h=await client.request('chat.history',{agentId:'makaron',sessionKey:key(entry),limit:50},{timeoutMs:20000});
    const messages=h.messages??[];
    const userCount=messages.filter(m=>m.role==='user').length;
    const modelReplyCount=messages.filter(m=>m.role==='assistant'&&m.model==='deepseek-v4-pro').length;
    scored.push({entry,userCount,modelReplyCount,messageCount:messages.length});
  }
  const best=scored.filter(s=>s.userCount&&s.modelReplyCount).sort((a,b)=>b.userCount-a.userCount||b.messageCount-a.messageCount)[0];
  assert(best,'no genuine user/model group history among bounded candidates');
  const room=best.entry;
  const compact=r=>r?{key:key(r),sessionId:r.sessionId,kind:r.kind,chatType:r.chatType,channel:r.channel??r.lastChannel,
    totalTokens:r.totalTokens,updatedAt:r.updatedAt,thinkingLevel:r.thinkingLevel,agentRuntime:r.agentRuntime?.id}:null;
  const selected={createdAt:new Date().toISOString(),dm:compact(main),group:{...compact(room),historyProof:{userCount:best.userCount,modelReplyCount:best.modelReplyCount,messageCount:best.messageCount}}};
  const file=root+'/state/db91-c5-release-20260907/hi-fixtures-'+Date.now()+'.json';
  fs.writeFileSync(file,JSON.stringify(selected,null,2),{mode:0o600,flag:'wx'});
  const sanitize=r=>r?{...r,key:undefined,sessionId:undefined,keyHash:createHash('sha256').update(r.key).digest('hex').slice(0,12)}:null;
  console.log(JSON.stringify({count:rows.length,eligible:eligible.length,groupCount:group.length,dmCount:dm.length,
    metadataFields:[...new Set(rows.flatMap(r=>Object.keys(r)))],selected:{dm:sanitize(selected.dm),group:sanitize(selected.group)},file}));
}finally{client.stop();}
