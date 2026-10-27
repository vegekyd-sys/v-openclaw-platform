// No Gateway, WebSocket consumer, agent, call or chat write is started here.
// Native dispatcher receives a labelled synthetic entry for an already known
// pilot DM, then the actual SDK verifies p2p + membership through read-only API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {patchPrivateConversationContext} from '../patch-feishu-phone-tabs.mjs';
const runtime=process.env.VLAB_CANDIDATE_RUNTIME,state=process.env.OPENCLAW_STATE_DIR;
assert(runtime&&state);
const config=JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH,'utf8'));
const plugin=config.plugins.load.paths.find(v=>v.endsWith('/@openclaw/feishu'));assert(plugin?.startsWith(runtime+'/'));
const dist=path.join(plugin,'dist');
const monitor=path.join(dist,fs.readdirSync(dist).find(n=>/^monitor\.account-.*\.js$/u.test(n)));
const source=fs.readFileSync(monitor,'utf8');
fs.writeFileSync(monitor,patchPrivateConversationContext(source)+'\nexport {registerEventHandlers as directCandidateRegister};\n');
for(const [src,dest] of [['feishu-phone-tabs.mjs','v-feishu-phone-tabs.mjs'],['feishu-private-conversations.mjs','feishu-private-conversations.mjs']])fs.copyFileSync(new URL('../'+src,import.meta.url),path.join(dist,dest));
const clientFile=path.join(dist,fs.readdirSync(dist).find(n=>/^client-.*\.js$/u.test(n)));
const accountFile=path.join(dist,fs.readdirSync(dist).find(n=>/^accounts-.*\.js$/u.test(n)));
const [{createFeishuPhoneTabClient:createClient,n:createDispatcher},{o:resolveAccount}]=await Promise.all([import(clientFile),import(accountFile)]);
const account=resolveAccount({cfg:config,accountId:'default'});
const unit='vlab-voice-feishu-phone-b7950421-3807-42ab-9352-163e10305ab9.service';
const pid=execFileSync('systemctl',['show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();
const env=Object.fromEntries(fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0').filter(v=>v.includes('=')).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1)];}));
const login=JSON.parse(fs.readFileSync(env.VOICE_FEISHU_LOGIN_FILE,'utf8'));
const entries=JSON.parse(fs.readFileSync(env.VOICE_ENTRIES_FILE,'utf8'));
assert.equal(account.appId,login.appId);assert.equal(login.actors.length,1);
const actor=login.actors[0],entry=entries.find(r=>r.kind==='dm'&&actor.phoneIds.includes(r.id));
const chat=entry?.nativeChatId??process.env.PRIVATE_DIRECT_TEST_CHAT;
assert(/^oc_[A-Za-z0-9]+$/u.test(chat??''),'Pilot needs its verified native chat');
const file=path.join(state,'direct-conversations.private.json');
const settingsFile=path.join(state,'direct-phone-settings.private.json');
fs.writeFileSync(settingsFile,JSON.stringify({version:1,accounts:{default:{enabled:true,appId:account.appId,
  allowedOpenIds:['ou_candidateExcluded'],url:'https://voice.example/voice/feishu',privateConversationsFile:file}}}),{mode:0o600});
process.env.OPENCLAW_FEISHU_PHONE_TABS_FILE=settingsFile;
let handlers,resolveDone;const done=new Promise(r=>{resolveDone=r;});
const dispatcher=createDispatcher(account),register=dispatcher.register.bind(dispatcher);
dispatcher.register=v=>{handlers=v;return register(v);};
const {directCandidateRegister}=await import(monitor),abort=new AbortController();
directCandidateRegister(dispatcher,{cfg:config,accountId:'default',chatHistories:new Map(),fireAndForget:true,
  channelRuntime:{debounce:{resolveInboundDebounceMs:()=>0,createInboundDebouncer:()=>({enqueue(){throw Error('No message ingress');}})}},
  runtime:{log:line=>{try{const row=JSON.parse(line);if(row.type==='voice.phone-tab')resolveDone(row);}catch{}},error:()=>{throw Error('Native runtime error');}},abortSignal:abort.signal});
assert.equal(typeof handlers['im.chat.access_event.bot_p2p_chat_entered_v1'],'function');
const event={chat_id:chat,operator_id:{open_id:actor.openId}};
await dispatcher.invoke({schema:'2.0',header:{event_id:'private-direct-candidate',event_type:'im.chat.access_event.bot_p2p_chat_entered_v1',app_id:account.appId,token:account.verificationToken??'',create_time:String(Date.now()),tenant_key:actor.tenantKey},event});
let timer;try{
  const result=await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('native directory timeout')),30000);})]);
  assert.equal(result.status,'ignored_audience','Tab writes must remain excluded');
}finally{clearTimeout(timer);abort.abort();}
const value=JSON.parse(fs.readFileSync(file,'utf8'));
assert.equal(value.bindings.length,1);assert.equal(value.bindings[0].openId,actor.openId);assert.equal(value.bindings[0].chatId,chat);
if(process.env.PRIVATE_DIRECT_PREVIEW_FILE){
  assert(process.env.PRIVATE_DIRECT_PREVIEW_FILE.startsWith('/srv/vlab-production-mirror/labs/voice-private-direct-'));
  fs.writeFileSync(process.env.PRIVATE_DIRECT_PREVIEW_FILE,JSON.stringify(value),{mode:0o600});
}
console.log(JSON.stringify({nativeDispatcher:true,realFeishuReadApi:true,existingPrivateConversationVerified:true,
  syntheticEntryForExistingPilot:true,liveNewPrivateConversation:false,messagesSent:0,groupWrites:0,modelCalls:0,sharedGatewayChanged:false}));
