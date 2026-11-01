// Candidate: the patched Feishu monitor, the real durable ingress wrapper and
// the SDK's real long-connection frame handler, against v-link-preview reading
// the real VLab board. Feishu itself is the only thing not involved: the frame
// is handed in, so no second connection opens and no event is taken from the Gateway.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const runtime=process.env.VLAB_CANDIDATE_RUNTIME;
const pkg=runtime+'/npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/';
const dist=pkg+'dist/';
const source=fs.readFileSync(dist+'monitor.account-WFdlCDhR.js','utf8');
assert(source.includes('v-feishu-link-preview-v1'),'candidate must run the patched monitor');
const entry=dist+'link-preview-test-entry.mjs';
fs.writeFileSync(entry,source+'\nexport {registerEventHandlers as testRegister,createFeishuDurableIngress as testDurable};\n');
const native=await import(pathToFileURL(entry));
const {n:createDispatcher}=await import(pathToFileURL(dist+'client-DMbIL3UH.js'));
const {WSClient}=createRequire(pkg+'package.json')('@larksuiteoapi/node-sdk');
const {startServer}=await import(pathToFileURL(path.resolve('apps/v-link-preview/server.mjs')));
const account={appId:'cli_candidate',appSecret:'fixture',domain:'feishu',accountId:'default',config:{}};
const cfg={channels:{feishu:{appId:account.appId,appSecret:account.appSecret}}};
const log=[];
const runtimeLog={log:m=>log.push(m),error:m=>log.push(m)};
const dispatcher=createDispatcher(account);
native.testRegister(dispatcher,{cfg,accountId:'default',channelRuntime:{debounce:{resolveInboundDebounceMs:()=>0,createInboundDebouncer:()=>({enqueue:()=>{throw Error('no text dispatch here');}})}},runtime:runtimeLog,chatHistories:new Map(),fireAndForget:false,abortSignal:new AbortController().signal});
const durable=native.testDurable({accountId:'default',dispatcher,queue:()=>{throw Error('a preview must never reach the durable queue');}});
const client=Object.create(WSClient.prototype);
client.logger={debug(){},trace(){},info(){},warn(){},error(m,...a){log.push(a.join(' '));}};
client.eventDispatcher=Object.assign(Object.create(dispatcher),{invoke:durable.invoke});
client.dataCache={mergeData:({data})=>JSON.parse(new TextDecoder().decode(data))};
async function frame(url) {
 const payload=Buffer.from(JSON.stringify({schema:'2.0',header:{event_id:'e'+Math.random(),event_type:'url.preview.get',token:'',app_id:account.appId,tenant_key:'t',create_time:String(Date.now())},event:{operator:{open_id:'ou_x',tenant_key:'t'},host:'im_message',context:{url,preview_token:'tok-1',open_message_id:'om_x',open_chat_id:'oc_x'}}}));
 const sent=[];client.sendMessage=f=>sent.push(f);
 const started=performance.now();
 await client.handleEventData({headers:[['type','event'],['message_id','m'],['sum','1'],['seq','0'],['trace_id','t']].map(([key,value])=>({key,value})),payload});
 assert.equal(sent.length,1,'the SDK must answer exactly once');
 const body=JSON.parse(new TextDecoder().decode(sent[0].payload));
 return {ms:performance.now()-started,code:body.code,answer:body.data?JSON.parse(Buffer.from(body.data,'base64').toString()):undefined};
}
const BASE='https://lab.example/';
const instances=await (await fetch('http://127.0.0.1:24880/api/instances')).json();
const live=instances.instances.find(i=>i.status==='active'&&i.stageRuns?.length);assert(live,'VLab board has an active project with runs');
const started=await startServer({publicBaseUrl:BASE,boardApiBaseUrl:'http://127.0.0.1:24880',port:0},{log:()=>{}});
const endpoint=`http://127.0.0.1:${started.server.address().port}/v1/preview`;
test('a real board project comes back through the SDK frame as a card',async()=>{
 process.env.OPENCLAW_FEISHU_LINK_PREVIEW_URL=endpoint;
 const {code,answer,ms}=await frame(`${BASE}?project=${live.id}`);
 assert.equal(code,200);assert(answer.inline.title.includes(live.name),answer.inline.title);
 assert.equal(answer.card.type,'raw');assert.equal(answer.card.data.header.title.content,live.name);
 console.log(JSON.stringify({project:live.id,inline:answer.inline.title,ms:Math.round(ms)}));
 assert(ms<2000,`took ${ms} ms`);
});
test('a link that is not ours: the frame is still acknowledged, with nothing in it',async()=>{
 const {code,answer}=await frame(`${BASE}settings`);assert.equal(code,200);assert.equal(answer,undefined);
});
test('service stopped: the frame is acknowledged empty, quickly, and the failure is logged',async()=>{
 await new Promise(r=>{started.server.close(r);started.server.closeAllConnections();});
 const {code,answer,ms}=await frame(`${BASE}?project=${live.id}`);
 assert.equal(code,200);assert.equal(answer,undefined);assert(ms<2500,`took ${ms} ms`);
 assert(log.some(m=>String(m).includes('link preview unavailable')),'failure must be visible in the log');
 console.log(JSON.stringify({downMs:Math.round(ms)}));
});
test('feature off: same empty acknowledgement and no connection attempt',async()=>{
 delete process.env.OPENCLAW_FEISHU_LINK_PREVIEW_URL;const before=log.length;
 const {code,answer}=await frame(`${BASE}?project=${live.id}`);assert.equal(code,200);assert.equal(answer,undefined);assert.equal(log.length,before);
});
