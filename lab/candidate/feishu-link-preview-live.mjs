// Live acceptance on the V-Lab app: the patched monitor's real websocket path,
// real Feishu callbacks, real card rendering, a real batch_update. Refuses to
// start while the shared Gateway holds V-Lab's long connection, because Feishu
// would then give each event to only one of the two.
//
// Driven through files in LIVE_DIR so the test can change the world mid-run:
//   board.json   the project the fixture board reports (re-read per request)
//   sidecar-off  exists: v-link-preview is stopped
//   sidecar-hang exists: v-link-preview accepts and never answers
//   stop         exists: finish
// Every callback is appended to LIVE_DIR/audit.jsonl without ids or tokens in the clear.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const live=process.env.LIVE_DIR,runtime=process.env.VLAB_CANDIDATE_RUNTIME;
const gatewayState=(()=>{try{return execFileSync('systemctl',['is-active','openclaw-vlab-production-mirror-v8.service'],{encoding:'utf8'}).trim();}catch(e){return String(e.stdout??'').trim();}})();
if(gatewayState!=='inactive'&&gatewayState!=='failed')throw Error(`Shared Gateway is ${gatewayState}; it must be stopped under a lease first`);
const hash=v=>createHash('sha256').update(String(v)).digest('hex').slice(0,12);
const audit=entry=>{fs.appendFileSync(live+'/audit.jsonl',JSON.stringify({at:new Date().toISOString(),...entry})+'\n');console.log(JSON.stringify(entry));};
const dist=runtime+'/npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/';
const source=fs.readFileSync(dist+'monitor.account-WFdlCDhR.js','utf8');
if(!source.includes('v-feishu-link-preview-v1'))throw Error('Not the patched monitor');
fs.writeFileSync(dist+'link-preview-live-entry.mjs',source+'\nexport {registerEventHandlers as testRegister,createFeishuDurableIngress as testDurable,monitorWebSocket as testWebSocket,resolveFeishuRuntimeAccount as testAccount};\n');
const native=await import(pathToFileURL(dist+'link-preview-live-entry.mjs'));
const {n:createDispatcher}=await import(pathToFileURL(dist+'client-DMbIL3UH.js'));
const {startServer}=await import(pathToFileURL(path.resolve('apps/v-link-preview/server.mjs')));
const cfg=JSON.parse(fs.readFileSync(process.env.VLAB_SHARED_CONFIG_PATH,'utf8'));
const account=native.testAccount({cfg,accountId:'default'});
if(account.appId!=='cli_aae2c999c7789bd9')throw Error('Live acceptance only runs on the V-Lab app');
const publicBaseUrl='https://vlab-cloud-worker.tianyi.live/link-preview-lab/';
const board=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://board'),send=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
 const state=JSON.parse(fs.readFileSync(live+'/board.json','utf8'));
 if(url.pathname.startsWith('/api/instances/')){audit({kind:'board-read'});return send(200,state.project);}
 if(url.pathname==='/api/decisions')return send(200,{decisions:state.decisions??[]});
 send(404,{});
});
await new Promise(r=>board.listen(0,'127.0.0.1',r));
const config={publicBaseUrl,boardApiBaseUrl:`http://127.0.0.1:${board.address().port}`,port:0,refreshMs:10_000,cacheMs:2_000,credentials:{appId:account.appId,appSecret:account.appSecret}};
const sidecar=await startServer(config,{log:message=>audit({kind:'sidecar',message})});
const sidecarPort=sidecar.server.address().port;
// A front that can be switched off or made to hang, so the Gateway side sees exactly what it would.
const front=http.createServer((req,res)=>{
 if(fs.existsSync(live+'/sidecar-hang')){audit({kind:'front',mode:'hang'});return;}
 const up=http.request({host:'127.0.0.1',port:sidecarPort,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
 up.on('error',()=>res.destroy());req.pipe(up);
});
await new Promise(r=>front.listen(0,'127.0.0.1',r));
process.env.OPENCLAW_FEISHU_LINK_PREVIEW_URL=`http://127.0.0.1:${front.address().port}/v1/preview`;
const realFetch=globalThis.fetch;
globalThis.fetch=(url,init)=>fs.existsSync(live+'/sidecar-off')&&String(url)===process.env.OPENCLAW_FEISHU_LINK_PREVIEW_URL?Promise.reject(Object.assign(Error('ECONNREFUSED'),{code:'ECONNREFUSED'})):realFetch(url,init);
const controller=new AbortController();
const runtimeLog={log:m=>audit({kind:'gateway',message:String(m).slice(0,200)}),error:m=>audit({kind:'gateway-error',message:String(m).slice(0,200)})};
const dispatcher=createDispatcher(account);
native.testRegister(dispatcher,{cfg,accountId:'default',channelRuntime:{debounce:{resolveInboundDebounceMs:()=>0,createInboundDebouncer:()=>({enqueue:()=>{throw Error('no text dispatch here');}})}},runtime:runtimeLog,chatHistories:new Map(),fireAndForget:false,abortSignal:controller.signal});
const handler=dispatcher.handles.get('url.preview.get');
dispatcher.handles.set('url.preview.get',async data=>{
 const started=performance.now(),event=data.event??data,result=await handler(data);
 audit({kind:'callback',host:event.host,url:event.context?.url,operator:hash(event.operator?.open_id),chat:hash(event.context?.open_chat_id),message:hash(event.context?.open_message_id),token:hash(event.context?.preview_token),answered:result?{inline:result.inline?.title,card:!!result.card}:null,ms:Math.round(performance.now()-started)});
 return result;
});
// A message this process cannot handle must not be acknowledged, so Feishu pushes it again for the Gateway.
const durable=native.testDurable({accountId:'default',dispatcher,queue:()=>{throw Error('Message refused during link preview acceptance; Feishu will re-push');}});
void native.testWebSocket({account,accountId:'default',runtime:runtimeLog,abortSignal:controller.signal,eventDispatcher:Object.assign(Object.create(dispatcher),{invoke:durable.invoke})});
audit({kind:'started',publicBaseUrl});
const until=Date.now()+Number(process.env.LIVE_MAX_MS??1_200_000);
while(!fs.existsSync(live+'/stop')&&Date.now()<until)await new Promise(r=>setTimeout(r,500));
controller.abort();audit({kind:'finished'});process.exit(0);
