#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const root=process.argv[2];
if(!root?.startsWith('/srv/vlab-control-ui-qa-'))throw Error('QA only');
const require=createRequire(root+'/runtime/node_modules/openclaw/package.json');
const WebSocket=require('ws');
const config=JSON.parse(fs.readFileSync(root+'/state/openclaw.json','utf8'));
const token=config.gateway.auth.token;
let failed=0;
async function httpTest(name, headers, expected, endpoint='/control-ui-qa/', method='GET'){
 const status=await new Promise((resolve,reject)=>{const request=http.request({hostname:'127.0.0.1',port:25994,path:endpoint,method,headers:{Host:'openclaw.tianyi.live',...headers,...(method==='POST'?{'Content-Type':'application/json'}:{})}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});request.on('error',reject);request.setTimeout(8000,()=>request.destroy(Error('HTTP timeout')));request.end(method==='POST'?JSON.stringify({tool:'sessions_list',args:{}}):undefined);});
 const pass=status===expected; if(!pass)failed++;console.log(JSON.stringify({name,status,expected,pass}));
}
await httpTest('missing Cloudflare attribution',{},403);
await httpTest('malformed Cloudflare IP',{'CF-Connecting-IP':'not-an-ip'},403);
await httpTest('loopback spoof rejected',{'CF-Connecting-IP':'127.0.0.1'},403);
await httpTest('valid attribution app shell',{'CF-Connecting-IP':'203.0.113.10'},200);
await httpTest('attacker XFF overwritten',{'CF-Connecting-IP':'203.0.113.10','X-Forwarded-For':'127.0.0.1','Forwarded':'for=127.0.0.1'},200);
await httpTest('unauthenticated tools blocked',{'CF-Connecting-IP':'203.0.113.10'},401,'/tools/invoke','POST');
async function wsTest(name,auth,origin,expect){
 const keys=crypto.generateKeyPairSync('ed25519');
 const rawKey=keys.publicKey.export({format:'der',type:'spki'}).subarray(-32);
 const deviceId=crypto.createHash('sha256').update(rawKey).digest('hex');
 await new Promise(resolve=>{
  const ws=new WebSocket('ws://127.0.0.1:25994/control-ui-qa',{headers:{Host:'openclaw.tianyi.live','CF-Connecting-IP':'203.0.113.10',Origin:origin}});
  const timer=setTimeout(()=>finish({error:'timeout',pass:false}),8000);
  let ended=false;
  function finish(result){if(ended)return;ended=true;clearTimeout(timer);if(!result.pass)failed++;console.log(JSON.stringify({name,...result}));ws.terminate();resolve();}
  ws.on('error',error=>finish({error:error.message,pass:false}));
  ws.on('message',data=>{const j=JSON.parse(data.toString());if(j.event==='connect.challenge') {
   const signedAt=Date.now(),nonce=j.payload.nonce;
   const payload=['v3',deviceId,'openclaw-control-ui','webchat','operator','operator.admin',String(signedAt),auth.token??'',nonce,'browser',''].join('|');
   const device={id:deviceId,publicKey:rawKey.toString('base64url'),signature:crypto.sign(null,Buffer.from(payload),keys.privateKey).toString('base64url'),signedAt,nonce};
   ws.send(JSON.stringify({type:'req',id:'qa-connect',method:'connect',params:{minProtocol:4,maxProtocol:4,client:{id:'openclaw-control-ui',version:'2026.9.1',platform:'browser',mode:'webchat'},role:'operator',scopes:['operator.admin'],auth,device}}));
  } else if(j.id==='qa-connect'){const reason=j.error?.details?.code??j.error?.code;const message=j.error?.message??'';finish({ok:j.ok,reason,message,pass:j.ok===false&&expect.test(message+' '+reason)});}});
 });
}
await wsTest('no token cannot connect',{},'http://127.0.0.1:25995',/token|unauthorized|auth/i);
await wsTest('wrong token cannot connect',{token:'intentionally-invalid-qa-token'},'http://127.0.0.1:25995',/token|unauthorized|auth/i);
await wsTest('correct token does not bypass device identity',{token},'http://127.0.0.1:25995',/device|pair/i);
await wsTest('foreign origin rejected',{token},'https://attacker.invalid',/origin/i);
console.log(JSON.stringify({failed,productionWrites:false}));process.exitCode=failed?1:0;
