// Live identity acceptance: exact native Feishu webhook and registered callback,
// real actor admission/catalog at the existing isolated Gateway, no model calls.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const runtime=process.env.VLAB_CANDIDATE_RUNTIME,root=process.env.VLAB_CANDIDATE_DATA;
const cfg=JSON.parse(fs.readFileSync(process.env.VOICE_CONFIRM_SOURCE_CONFIG));
const login=JSON.parse(fs.readFileSync(process.env.VOICE_CONFIRM_SOURCE_LOGIN));
const save=(p,value)=>fs.writeFileSync(p,JSON.stringify(value,null,2)+'\n',{mode:0o600});
const hash=value=>createHash('sha256').update(value).digest('hex');
const source=path.join(root,'voice');fs.mkdirSync(source);execFileSync('tar',['-xzf',process.env.VOICE_CONFIRM_ARTIFACT,'-C',source]);
fs.symlinkSync(path.join(runtime,'openclaw/node_modules'),source+'/node_modules');
const free=()=>new Promise(r=>{const s=http.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const [voicePort,hookPort,proxyPort]=await Promise.all([free(),free(),free()]);
const proxy=http.createServer((req,res)=>{const target=req.url.startsWith('/feishu/events')?hookPort:voicePort;const up=http.request({host:'127.0.0.1',port:target,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});up.on('error',()=>{res.writeHead(503);res.end();});req.pipe(up);});
await new Promise(r=>proxy.listen(proxyPort,'127.0.0.1',r));
const log=fs.openSync(root+'/tunnel.log','a',0o600),tunnel=spawn('/usr/local/bin/cloudflared',['tunnel','--url','http://127.0.0.1:'+proxyPort,'--protocol','http2','--no-autoupdate'],{stdio:['ignore',log,log]});
let origin;for(let i=0;i<60&&!origin;i++){await new Promise(r=>setTimeout(r,500));origin=fs.readFileSync(root+'/tunnel.log','utf8').match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];}assert(origin,'Tunnel unavailable');
const tabs=root+'/phone-tabs.private.json';save(tabs,{version:1,accounts:{default:{enabled:true,appId:login.appId,conversations:true,cardConfirmation:true,url:origin+'/voice/feishu'}}});process.env.OPENCLAW_FEISHU_PHONE_TABS_FILE=tabs;
const feishu=runtime+'/npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/';
const original=fs.readFileSync(feishu+'monitor.account-WFdlCDhR.js','utf8');
// Test-only exports: all webhook authentication and registered handler bodies
// remain byte-identical to the release artifact. No Gateway is restarted.
const testModule=feishu+'voice-confirm-test-entry.mjs';fs.writeFileSync(testModule,original+'\nexport {monitorWebhook as testWebhook,registerEventHandlers as testRegister};\n');
const native=await import(pathToFileURL(testModule)),{n:createDispatcher}=await import(pathToFileURL(feishu+'client-DMbIL3UH.js'));
const controller=new AbortController(),events=[];
Object.assign(cfg.channels.feishu,{webhookHost:'127.0.0.1',webhookPort:hookPort,webhookPath:'/feishu/events'});
const account=native.resolveVoiceFeishuAccount(cfg,'default');assert.equal(account.appId,login.appId);
// Only card callbacks are registered below; text/model dispatch is deliberately unavailable.
const channelRuntime={debounce:{resolveInboundDebounceMs:()=>0,createInboundDebouncer:()=>({enqueue:()=>{throw Error('Text dispatch disabled in identity acceptance');}})}};
let handlers;native.testRegister({register:value=>handlers=value},{cfg,accountId:'default',channelRuntime,runtime:{log:()=>{},error:()=>{}},chatHistories:new Map(),fireAndForget:false,abortSignal:controller.signal});
const dispatcher=createDispatcher(account);dispatcher.register({'card.action.trigger':async data=>{
 const event=data.event??data;
 const result=await handlers['card.action.trigger'](data);
 events.push({at:Date.now(),kind:'native-card-callback',operatorHash:hash(event.operator?.open_id??''),tenantPresent:!!event.operator?.tenant_key,chatHash:hash(event.context?.open_chat_id??''),toast:result?.toast?.type});save(root+'/audit.json',events);return result;
}});
void native.testWebhook({account,accountId:'default',runtime:{log:()=>{},error:()=>{}},abortSignal:controller.signal,eventDispatcher:dispatcher});
const {GatewayClient}=await import(pathToFileURL(source+'/lib/gateway-client.mjs'));
const {createFeishuActorGateway}=await import(pathToFileURL(source+'/lib/feishu-actor-gateway.mjs'));
let ready;const connected=new Promise(r=>ready=r);
const gateway=new GatewayClient({url:'ws://127.0.0.1:'+process.env.VOICE_CONFIRM_GATEWAY_PORT,token:cfg.gateway.auth.token,caps:['voice-direct-tools','tool-events','voice-feishu-actor-v1'],onHelloOk:()=>ready(),onConnectError:e=>console.log(JSON.stringify({gatewayError:e.code}))});gateway.start();await connected;
const observed={get ready(){return gateway.ready;},request:async(method,params,options)=>{
 const result=await gateway.request(method,params,options);
 if(method==='voice.feishu.resolve'){
  const actor=params.voiceActor.actor;
  const scoped=createFeishuActorGateway({gateway,appId:login.appId,appSecret:login.appSecret,accountId:'default',identity:actor,chatId:actor.chatId,sessionKey:result.sessionKey});
  const catalog=await scoped.request('tools.catalog',{agentId:result.agentId});
  events.push({at:Date.now(),kind:'live-admission-and-catalog',operatorHash:hash(actor.openId),tenantHash:hash(actor.tenantKey),chatHash:hash(actor.chatId),sessionHash:hash(result.sessionKey),conversationKind:result.kind,tools:(catalog.groups??[]).flatMap(g=>g.tools??[]).map(t=>t.id??t.name).sort()});save(root+'/audit.json',events);
 }
 return result;
}};
const {createLiveH5Server}=await import(pathToFileURL(source+'/lab/gpt-live-h5/server.mjs'));
const bridge=createLiveH5Server({gateway:observed,basePath:'/voice',publicOrigin:origin,accessToken:'candidate-identity-only-not-an-entry'.repeat(2),
 feishuLogin:{...login,cardConfirmation:true,allowUnidentified:true},iosBindingsFile:root+'/ios-bindings.private.json',iosPublicEntry:true,
 directVoice:{models:()=>[{id:'grok',available:true}],reserve:async()=>{throw Error('This identity acceptance does not dial');},close:async()=>{},dispose:async()=>{}},
 candidateRelease:{version:'feishu-card-confirm.candidate',title:'飞书点击确认身份验收',items:['内外部成员共用群入口，验证浏览器与 iOS 身份；本次不拨号。']}});
await new Promise(r=>bridge.server.listen(voicePort,'127.0.0.1',r));
save(root+'/ready.json',{origin,hookPort,voicePort,proxyPort,unit:process.env.VLAB_CANDIDATE_UNIT,root,voiceCommit:JSON.parse(fs.readFileSync(source+'/manifest.json')).commit,nativeMonitorSha:hash(original),sharedGatewayChanged:false,productionChanged:false,modelCallsEnabled:false});
console.log(JSON.stringify({stage:'ready',origin,root}));
const close=async()=>{controller.abort();await bridge.dispose();gateway.stop();proxy.close();tunnel.kill('SIGTERM');process.exit(0);};process.on('SIGTERM',close);process.on('SIGINT',close);setInterval(()=>{},60000);
