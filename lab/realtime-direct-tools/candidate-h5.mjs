// Reuse this task's isolated Gateway and memory snapshot while iterating H5.
// It cannot attach to shared VLab or production, and expires with its owner.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createLiveH5Server} from '../gpt-live-h5/server.mjs';
import {createDirectVoiceService} from './session.mjs';
const original=JSON.parse(fs.readFileSync(process.env.DIRECT_CANONICAL_READY));
assert(original.candidateId===process.env.VLAB_CANDIDATE_ID && original.state==='ready');
assert(original.unit===process.env.VLAB_CANDIDATE_UNIT && Date.parse(original.expiresAt)>Date.now()+600000);
const runtime=process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime.includes('/candidate-tests/runs/'+original.candidateId+'/runtime'));
assert(fs.readFileSync(`/proc/${original.gatewayPid}/cmdline`,'utf8').includes(runtime));
const config=JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH));
assert(config.gateway.port!==24993 && config.gateway.bind==='loopback');
const token=String(config.gateway.auth.token).replace(/\$\{([^}]+)\}/gu,(_,name)=>process.env[name]??'');
const {GatewayClient}=await import(pathToFileURL(path.join(runtime,'openclaw/dist/plugin-sdk/gateway-runtime.js')));
const wsModule=await import(pathToFileURL(path.join(runtime,'openclaw/node_modules/ws/wrapper.mjs')));
const evidence=process.env.GPT_LIVE_H5_EVIDENCE_DIR;
fs.mkdirSync(evidence,{mode:0o700});
let gateway,bridge,closing=false;
async function shutdown(){if(closing)return;closing=true;await bridge?.dispose();gateway?.stop();process.exit(0);}
await new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(Error('Own Candidate Gateway unavailable')),15000);
 gateway=new GatewayClient({url:`ws://127.0.0.1:${config.gateway.port}`,token,deviceIdentity:null,clientName:'cli',mode:'cli',scopes:['operator.read','operator.write','operator.admin'],caps:['voice-direct-tools','tool-events'],onHelloOk:()=>{clearTimeout(timer);resolve();},onEvent:e=>bridge?.emit(e),onConnectError:e=>{clearTimeout(timer);reject(e);if(bridge)void shutdown();}});gateway.start();
});
const credential=process.env.V_REALTIME_GROK_CREDENTIAL_FILE,st=fs.lstatSync(credential);
assert(st.isFile()&&(st.mode&0o077)===0);
const toolEnvironment=process.env.DIRECT_LARK_CLI_CONFIG_DIR?{LARKSUITE_CLI_CONFIG_DIR:process.env.DIRECT_LARK_CLI_CONFIG_DIR,LARKSUITE_CLI_DATA_DIR:process.env.DIRECT_LARK_CLI_DATA_DIR}:{};
const directVoice=createDirectVoiceService({gateway,wsModule,toolEnvironment,apiKeys:{seeduplex:process.env.VOLCENGINE_REALTIME_API_KEY,grok:JSON.parse(fs.readFileSync(credential)).apiKey},
 audit:value=>fs.appendFileSync(path.join(evidence,'direct-voice-audit.jsonl'),JSON.stringify({at:Date.now(),...value})+'\n',{mode:0o600}),
 onOutputAudio:(id,pcm)=>fs.appendFileSync(path.join(evidence,`provider-${id}.pcm`),pcm,{mode:0o600}),
 loadContext:async sessionKey=>{const r=await gateway.request('chat.history',{sessionKey,limit:6},{timeoutMs:10000});return JSON.stringify((r.messages??[]).map(m=>({role:m.role,content:m.content}))).slice(-12000);}});
bridge=createLiveH5Server({gateway,directVoice,
 basePath:process.env.GPT_LIVE_H5_BASE_PATH??'',publicOrigin:process.env.GPT_LIVE_H5_PUBLIC_ORIGIN??'',accessToken:process.env.GPT_LIVE_H5_ACCESS_TOKEN??'',
 offer:async(reservation,sdp)=>{
 const r=await fetch(`http://127.0.0.1:${config.gateway.port}${reservation.offerUrl}`,{method:'POST',headers:{authorization:`Bearer ${reservation.clientSecret}`,'content-type':'application/sdp'},body:sdp,signal:AbortSignal.timeout(25000)});assert(r.ok);return r.text();}});
await new Promise(resolve=>bridge.server.listen(0,'127.0.0.1',resolve));
const ready={...original,remotePort:bridge.server.address().port,sourceCommit:process.env.DIRECT_SOURCE_COMMIT,canonicalSourceCommit:original.sourceCommit,h5Unit:process.env.DIRECT_H5_UNIT,...(process.env.GPT_LIVE_H5_PUBLIC_ORIGIN?{publicOrigin:process.env.GPT_LIVE_H5_PUBLIC_ORIGIN,basePath:process.env.GPT_LIVE_H5_BASE_PATH}:{}),appSha:createHash('sha256').update(fs.readFileSync('lab/gpt-live-h5/app.js')).digest('hex'),readyAt:new Date().toISOString(),productAccepted:false,humanAccepted:false};
fs.writeFileSync(process.env.GPT_LIVE_H5_EXPERIENCE_READY,JSON.stringify(ready,null,2)+'\n',{mode:0o600,flag:'wx'});
setTimeout(()=>void shutdown(),Date.parse(original.expiresAt)-Date.now());
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void shutdown());
console.log(JSON.stringify({ready:true,candidateId:original.candidateId,port:ready.remotePort,expiresAt:ready.expiresAt}));
