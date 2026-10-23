import test from 'node:test';import assert from 'node:assert/strict';
import {createPhoneLoginChallenges} from './feishu-phone-login-challenges.mjs';
import {createVoiceLoginGateway} from './feishu-voice-login.mjs';
const config={accountId:'default',appId:'cli_fixture',chatId:'oc_dm',clientId:'connection'};
const at=1800000000000;
const event=(code,extra={})=>({sender:{sender_type:'user',tenant_key:'external_tenant',sender_id:{open_id:'ou_external'}},
  message:{chat_type:'p2p',chat_id:'oc_dm',message_type:'text',create_time:String(at),content:JSON.stringify({text:'电话登录 '+code})},...extra});
test('a verified private message confirms the subject, once and only for the initiating connection',()=>{
  const c=createPhoneLoginChallenges({now:()=>at}),p=c.begin(config);
  assert.match(p.code,/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
  assert.equal(c.take({ticket:p.ticket,clientId:config.clientId}).status,'pending');
  assert.throws(()=>c.take({ticket:p.ticket,clientId:'other'}));
  assert.equal(c.observe({...config,event:event(p.code)}),true);
  const r=c.take({ticket:p.ticket,clientId:config.clientId});assert.equal(r.identity.openId,'ou_external');assert.equal(r.identity.tenantKey,'external_tenant');
  assert.throws(()=>c.take({ticket:p.ticket,clientId:config.clientId}));
});
test('expired, stale, wrong-app, group, bot and malformed commands cannot authenticate or invoke a model',()=>{
  let now=at;const c=createPhoneLoginChallenges({now:()=>now}),p=c.begin(config);
  for(const change of [{accountId:'other'},{appId:'cli_other'},
    {event:event(p.code,{sender:{sender_type:'app',sender_id:{open_id:'ou_external'},tenant_key:'external_tenant'}})},
    {event:event(p.code,{message:{...event(p.code).message,chat_type:'group'}})},
    {event:event(p.code,{message:{...event(p.code).message,create_time:String(at-6000)}})},
    {event:event(p.code,{sender:{sender_type:'user',sender_id:{open_id:'ou_external'}}})}]) {
    assert.equal(c.observe({...config,event:event(p.code),...change}),true);
    assert.equal(c.take({ticket:p.ticket,clientId:config.clientId}).status,'pending');
  }
  assert.equal(c.observe({...config,event:event('bad-code')}),true);
  const ordinary=event(p.code);ordinary.message.content=JSON.stringify({text:'hello'});assert.equal(c.observe({...config,event:ordinary}),false);
  now+=300001;assert.equal(c.observe({...config,event:event(p.code)}),true);assert.throws(()=>c.take({ticket:p.ticket,clientId:config.clientId}));
});
test('pending memory and per-chat starts are bounded',()=>{
  const c=createPhoneLoginChallenges({now:()=>at,maxPending:4});for(let i=0;i<3;i++)c.begin(config);
  assert.throws(()=>c.begin(config));c.begin({...config,chatId:'oc_other'});assert.throws(()=>c.begin({...config,chatId:'oc_third'}));
});
test('Gateway checks transport, current membership policy and exact private conversation before returning a subject',async()=>{
  const c=createPhoneLoginChallenges({now:()=>at});let admitted=true,enabled=true,kind='dm';
  const account={accountId:'default',appId:'cli_fixture',enabled:true};
  const run=createVoiceLoginGateway({phoneLoginChallenges:c,resolveAccount:()=>({...account,enabled}),
    resolvePolicy:async()=>({admitted,kind}),api:()=>async()=>({chat_mode:'p2p'}),prepareActor:async x=>x});
  const client={connId:config.clientId,connect:{scopes:['operator.admin'],caps:['voice-feishu-actor-v1']}};
  const call=async(method,params,caller=client)=>{let result;await run({req:{method,params},client:caller,context:{getRuntimeConfig:()=>({})},respond:(ok,data)=>{assert.equal(ok,true);result=data;}});return result;};
  await assert.rejects(call('voice.feishu.login.begin',config,{...client,connect:{scopes:['operator.read'],caps:[]}}));
  const p=await call('voice.feishu.login.begin',config);assert.equal((await call('voice.feishu.login.status',{ticket:p.ticket})).status,'pending');
  c.observe({...config,event:event(p.code)});const ok=await call('voice.feishu.login.status',{ticket:p.ticket});assert.equal(ok.identity.openId,'ou_external');assert(!JSON.stringify(ok).includes(p.ticket));
  const denied=await call('voice.feishu.login.begin',config);c.observe({...config,event:event(denied.code)});admitted=false;await assert.rejects(call('voice.feishu.login.status',{ticket:denied.ticket}));admitted=true;
  const wrong=await call('voice.feishu.login.begin',{...config,chatId:'oc_other'});c.observe({...config,event:event(wrong.code)});await assert.rejects(call('voice.feishu.login.status',{ticket:wrong.ticket}));
  const revoked=await call('voice.feishu.login.begin',{...config,chatId:'oc_revoked'});c.observe({...config,event:event(revoked.code)});enabled=false;await assert.rejects(call('voice.feishu.login.status',{ticket:revoked.ticket}));
});
