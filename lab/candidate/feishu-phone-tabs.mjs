// Candidate only: load the actual patched Feishu monitor/SDK, then deliver a
// synthetic private-entry event for the operator's already authorized pilot DM.
// No second WebSocket consumer, Gateway, model turn, or message is started.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {patchFeishuPhoneTabs,patchFeishuPhoneTabClient} from '../patch-feishu-phone-tabs.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const state = process.env.OPENCLAW_STATE_DIR;
assert(runtime && state && process.env.PHONE_TAB_TEST_LOGIN_FILE && process.env.PHONE_TAB_TEST_MESSAGE_ID);
const config = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH,'utf8'));
const plugin = config.plugins.load.paths.find(value=>value.endsWith('/@openclaw/feishu'));
assert(plugin?.startsWith(runtime+'/'),'Only the private runtime may be patched');
const dist = path.join(plugin,'dist');
const monitorFile = path.join(dist,fs.readdirSync(dist).find(name=>/^monitor\.account-.*\.js$/u.test(name)));
const original = fs.readFileSync(monitorFile,'utf8');
const patched = patchFeishuPhoneTabs(original);
assert.equal(patchFeishuPhoneTabs(patched),patched);
fs.writeFileSync(monitorFile,patched+'\nexport {registerEventHandlers as candidateRegister};\n');
fs.copyFileSync(new URL('../feishu-phone-tabs.mjs',import.meta.url),path.join(dist,'v-feishu-phone-tabs.mjs'));
assert.equal(spawnSync(process.execPath,['--check',monitorFile]).status,0);

const accountFile=path.join(dist,fs.readdirSync(dist).find(name=>/^accounts-.*\.js$/u.test(name)));
const clientFile=path.join(dist,fs.readdirSync(dist).find(name=>/^client-.*\.js$/u.test(name)));
const originalClient=fs.readFileSync(clientFile,'utf8');
fs.writeFileSync(clientFile,patchFeishuPhoneTabClient(originalClient));
const {o:resolveAccount}=await import(accountFile);
const {createFeishuPhoneTabClient:createClient,n:createDispatcher}=await import(clientFile);
const account=resolveAccount({cfg:config,accountId:'default'});
const login=JSON.parse(fs.readFileSync(process.env.PHONE_TAB_TEST_LOGIN_FILE,'utf8'));
assert.equal(account.appId,login.appId,'The pilot and API account must be the same app');
assert.equal(login.actors.length,1,'This acceptance intentionally uses the existing single pilot actor');
const actor=login.actors[0];assert.equal(actor.callerId,'tianyi');
const client=createClient(account);
async function api(method,url,data){
  let result;
  try {result=await client.request({method,url,data:data??{},timeout:8000});}
  catch(error){throw Error('safe_api_failure '+JSON.stringify({method,path:url.replace(/oc_[A-Za-z0-9]+/g,'CHAT').replace(/om_[A-Za-z0-9]+/g,'MESSAGE'),http:error?.response?.status,code:error?.response?.data?.code,msg:error?.response?.data?.msg}));}
  assert.equal(result?.code,0,'Feishu API did not confirm success');return result.data;
}
// Exercise the SDK failure path too: its private client must not dump request headers.
let failedProbe=false;try{await api('GET','/open-apis/im/v1/chats/oc_phone_tab_candidate_missing');}
catch(error){assert.match(error.message,/safe_api_failure/);failedProbe=true;}
assert(failedProbe);
const message=await api('GET','/open-apis/im/v1/messages/'+process.env.PHONE_TAB_TEST_MESSAGE_ID);
assert.equal(message.items.length,1);const chat=message.items[0].chat_id;
assert.match(chat,/^oc_[A-Za-z0-9]+$/u);
assert.equal((await api('GET','/open-apis/im/v1/chats/'+chat)).chat_mode,'p2p');
const before=await api('GET',`/open-apis/im/v1/chats/${chat}/chat_tabs/list_tabs`);
const existing=before.chat_tabs.filter(tab=>tab.tab_name==='📞 打给 V');
assert.equal(existing.length,1,'This live probe must preserve the already installed pilot tab');
const url=existing[0].tab_content.url;
assert.equal(new URL(url).searchParams.get('phone'),actor.defaultPhoneId);
const settingsFile=path.join(state,'phone-tabs.private.json');
fs.writeFileSync(settingsFile,JSON.stringify({version:1,accounts:{default:{enabled:true,appId:account.appId,
  allowedOpenIds:[actor.openId],url}}}),{mode:0o600});
process.env.OPENCLAW_FEISHU_PHONE_TABS_FILE=settingsFile;

const events=[],errors=[];
const {candidateRegister}=await import(monitorFile);
const dispatcher=createDispatcher(account);
const registration=dispatcher.register.bind(dispatcher);let handlers;
dispatcher.register=value=>{handlers=value;return registration(value);};
const abort=new AbortController();
candidateRegister(dispatcher,{cfg:config,accountId:'default',chatHistories:new Map(),fireAndForget:true,
  channelRuntime:{debounce:{resolveInboundDebounceMs:()=>0,createInboundDebouncer:()=>({enqueue(){throw Error('message handler must never run');}})}},
  runtime:{log:line=>{try{const parsed=JSON.parse(line);if(parsed.type==='voice.phone-tab')events.push(parsed);}catch{}},
    error:()=>errors.push('runtime-error')},abortSignal:abort.signal});
assert.equal(typeof handlers['im.chat.access_event.bot_p2p_chat_entered_v1'],'function');

const event={chat_id:chat,operator_id:{open_id:actor.openId}};
const envelope={schema:'2.0',header:{event_id:'phone-tab-candidate-entry',
  event_type:'im.chat.access_event.bot_p2p_chat_entered_v1',app_id:account.appId,
  token:account.verificationToken??'',create_time:String(Date.now()),tenant_key:actor.tenantKey},event};
const started=performance.now();await dispatcher.invoke(envelope);
const ackMs=performance.now()-started;
assert(ackMs<3000,'Tab API must not delay channel acknowledgement');
const waitFor=async predicate=>{const deadline=Date.now()+20000;while(!predicate()){
  assert(Date.now()<deadline,'Timed out waiting for phone-tab completion');await new Promise(r=>setTimeout(r,100));}};
await waitFor(()=>events.length>0);
assert.deepEqual(events[0],{type:'voice.phone-tab',status:'verified',created:false});
for(let index=0;index<10;index++)await dispatcher.invoke({...envelope,header:{...envelope.header,event_id:'phone-tab-repeat-'+index}});
await waitFor(()=>events.length>1);
assert(events.slice(1).every(item=>item.status==='cached'));
await dispatcher.invoke({...envelope,header:{...envelope.header,event_id:'phone-tab-outside-audience'},
  event:{...event,operator_id:{open_id:'ou_notRegistered'}}});
await waitFor(()=>events.some(item=>item.status==='ignored_audience'));
const after=await api('GET',`/open-apis/im/v1/chats/${chat}/chat_tabs/list_tabs`);
assert.deepEqual(after,before,'Real pilot tabs must remain identical across repeated entries');
assert.equal(errors.length,0);abort.abort();
console.log(JSON.stringify({kind:'phone-tab-candidate-acceptance',source:'actual patched monitor + actual Feishu SDK dispatcher',
  input:'synthetic entry event for existing authorized pilot DM',realApi:true,secondBotConnection:false,
  beforeMonitorSha256:hash(original),patchedMonitorSha256:hash(patched),moduleSha256:hash(fs.readFileSync(new URL('../feishu-phone-tabs.mjs',import.meta.url))),
  sdkFailurePathExercised:true,acknowledgementMs:Math.round(ackMs*100)/100,existingTabVerified:true,repeatedEntryDidNotDuplicate:true,
  unauthorizedActorIgnored:true,allExistingTabsPreserved:true,realNewTabCreation:false,livePushAcceptance:false,
  agentTurns:0,messagesSent:0,sharedGatewayChanged:false}));
