// Read-only authorized tab diagnostics. Never navigates, closes, or edits a page.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
assert.equal(os.hostname(),'VM-8-2-ubuntu');
const pid=execFileSync('systemctl',['show','openclaw-gateway.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();
for(const s of fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').filter(Boolean))process.env[s.slice(0,s.indexOf('='))]=s.slice(s.indexOf('=')+1);
process.env.OPENCLAW_CONFIG_PATH='/home/openclaw/.openclaw/openclaw.json';
const actor='feishu:ou_cb133fd4414f0607e8b46a3195c7b9d8';
const headers={authorization:'Bearer '+fs.readFileSync('/srv/vlab-browser/state/broker-admin-token','utf8').trim(),'content-type':'application/json'};
async function api(path,method='GET',body){const r=await fetch('http://127.0.0.1:23891'+path,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const j=await r.json();assert(r.ok,`Broker status ${r.status}`);return j;}
function describe(v,depth=0){if(depth>5)return typeof v;if(typeof v==='string')return {type:'string',length:v.length,...(v.length<200&&(/^(Error:|Playwright |extension |\/.*\.(png|jpg))/.test(v))?{value:v}:{})};if(Array.isArray(v))return {type:'array',length:v.length,first:describe(v[0],depth+1)};if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!/(token|secret|base64)/i.test(k)).map(([k,x])=>[k,k==='refs'?{count:Object.keys(x??{}).length}:describe(x,depth+1)]));return v;}
const {callGatewayFromCli}=await import('/opt/openclaw-2026.9.1-v/openclaw/dist/plugin-sdk/gateway-runtime.js');
const health=await api('/health');assert.equal(health.activeRoutes,0,'Another browser lease is active');
const d=(await api('/v1/devices?actorUserId='+actor)).devices.find(x=>x.online&&x.deviceId==='16e50650-adf3-4c15-b1ef-32c1e7f9d28b');assert(d,'User Chrome offline');
const tab=(await api(`/v1/devices/${d.deviceId}/tabs?actorUserId=${actor}`)).tabs.find(t=>t.url==='http://192.168.1.50/home/overview');assert(tab,'Authorized HA overview absent');
let lease,targetId;
try{
 lease=await api('/v1/leases','POST',{actorUserId:actor,deviceId:d.deviceId,tabId:tab.tabId,taskId:'browser-native-roundtrip-20260905',ttlMs:180000});
 for(let round=0;round<2;round++)for(const path of ['/tabs','/snapshot','/screenshot']){
  const started=Date.now();
  try{if(path!=='/tabs')assert(targetId,'No verified native target; refusing implicit tab creation');const result=await callGatewayFromCli('browser.request',{timeout:'40000',json:true},{method:path==='/screenshot'?'POST':'GET',path,query:{profile:lease.profile,...(path==='/snapshot'?{format:'ai',targetId}:{})},...(path==='/screenshot'?{body:{type:'png',fullPage:false,targetId}}:{}),timeoutMs:30000});if(path==='/tabs'){const selected=result.tabs?.find(t=>t.url===tab.url);assert(selected?.targetId&&!selected.targetId.startsWith('tab-'),'No verified native target');targetId=selected.targetId;}console.log(JSON.stringify({at:new Date().toISOString(),round,path,ms:Date.now()-started,result:describe(result)}));}
  catch(e){console.log(JSON.stringify({round,path,ms:Date.now()-started,error:String(e).replace(/https?:\/\/\S+/g,'<url>').slice(0,350)}));}
  const h=await api('/health');console.log(JSON.stringify({round,path,transport:h.transport,pending:h.pendingCommands,errors:h.extensionErrors}));
 }
}finally{if(lease){const result=await api('/v1/leases/'+lease.leaseId,'DELETE',{actorUserId:actor});console.log(JSON.stringify({release:describe(result)}));}}
