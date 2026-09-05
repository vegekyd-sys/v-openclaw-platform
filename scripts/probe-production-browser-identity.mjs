import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');
const pid=execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);
process.env.OPENCLAW_CONFIG_PATH='/home/openclaw/.openclaw/openclaw.json';
const actor='feishu:ou_cb133fd4414f0607e8b46a3195c7b9d8',headers={authorization:'Bearer '+fs.readFileSync('/srv/vlab-browser/state/broker-admin-token','utf8').trim(),'content-type':'application/json'};
const api=async(p,method='GET',body)=>{const r=await fetch('http://127.0.0.1:23891'+p,{method,headers,body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok)throw Error(JSON.stringify({status:r.status,reason:j.error??j.code}));return j;};
const d=(await api('/v1/devices?actorUserId='+actor)).devices.find(x=>x.online);assert(d);
const tab=(await api(`/v1/devices/${d.deviceId}/tabs?actorUserId=${actor}`)).tabs.find(t=>t.url==='http://192.168.1.50/home/overview');assert(tab,'Authorized HA overview not present');
let lease,connection;
try{
 lease=await api('/v1/leases','POST',{actorUserId:actor,deviceId:d.deviceId,tabId:tab.tabId,taskId:'browser-identity-diagnostic-20260905',ttlMs:180000});
 const config=JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH));
 const profile=config.browser?.profiles?.[lease.profile];
 console.log(JSON.stringify({profile:lease.profile,profilePresent:!!profile,profileKeys:Object.keys(profile??{})}));
 assert(profile?.cdpUrl,'No main native profile URL');
 const core='/opt/openclaw-2026.9.1-v/openclaw/dist';
 const pw=await import(core+'/pw-session-Bp2ZghGj.js');
 const cdpUrl=profile.cdpUrl.replace(/\$\{([A-Z0-9_]+)\}/g,(_,key)=>{assert(process.env[key],'Missing referenced environment');return process.env[key];});
 connection=await pw.b(cdpUrl,config.browser.ssrfPolicy);
 console.log(JSON.stringify({stage:'native-enumeration',pages:(await pw.c({cdpUrl,ssrfPolicy:config.browser.ssrfPolicy,requireCompleteTargetList:true})).map(x=>({targetId:x.targetId}))}));
 const b=connection.browser,root=await b.newBrowserCDPSession();
 try{const targets=await root.send('Target.getTargets');console.log(JSON.stringify({stage:'targets',targets:targets.targetInfos.map(x=>({targetId:x.targetId,type:x.type}))}));}finally{await root.detach();}
 for(const context of b.contexts())for(const page of context.pages()){
  let s;const at=Date.now();
  try{s=await context.newCDPSession(page);console.log(JSON.stringify({stage:'attached',ms:Date.now()-at}));const info=await s.send('Target.getTargetInfo');console.log(JSON.stringify({stage:'targetInfo',ms:Date.now()-at,info:info.targetInfo}));}
  catch(e){console.log(JSON.stringify({stage:'targetInfoError',ms:Date.now()-at,error:String(e).slice(0,500)}));}
  finally{await s?.detach().catch(()=>{});}
 }
 const {callGatewayFromCli}=await import(core+'/plugin-sdk/gateway-runtime.js');
 try {const r=await callGatewayFromCli('browser.request',{timeout:'40000',json:true},{method:'GET',path:'/snapshot',query:{profile:lease.profile,format:'ai'},timeoutMs:35000});console.log(JSON.stringify({stage:'gateway-snapshot',ok:r.ok,keys:Object.keys(r),resultKeys:Object.keys(r.result??r.payload??r.body??{}),hasSnapshot:!!(r.snapshot??r.result?.snapshot??r.body?.snapshot)}));}catch(e){console.log(JSON.stringify({stage:'gateway-snapshot-error',error:String(e).slice(0,400)}));}
}finally{if(connection)await connection.browser.close().catch(()=>{});if(lease)await api('/v1/leases/'+lease.leaseId,'DELETE',{actorUserId:actor});console.log(JSON.stringify({released:!!lease}));}
