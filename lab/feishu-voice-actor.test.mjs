import test from 'node:test';
import assert from 'node:assert/strict';
import {signVoiceActor,authorizeVoiceActor,actorClient,actorToolContext,createVoiceActorMiddleware} from './feishu-voice-actor.mjs';
const secret='test-secret-for-this-fixture-only';
const now=1800000000000;
const client={connId:'voice-host',connect:{scopes:['operator.admin'],caps:['voice-feishu-actor-v1']},internal:{operatorRoleActor:{kind:'system'}}};
const actor={accountId:'lab',appId:'cli_fixture',tenantKey:'tenant_fixture',openId:'ou_alice',chatId:'oc_groupA'};
const session=a=>'agent:makaron:feishu:group:'+a.chatId;
const deps={cfg:{},client,now,resolveAccount:async()=>({enabled:true,accountId:'lab',appId:'cli_fixture',appSecret:secret}),
  resolvePolicy:async({actor:a})=>({admitted:true,agentId:'makaron',sessionKey:session(a),senderIsOwner:a.openId==='ou_alice',kind:'group'})};
const signed=(a,method,params)=>signVoiceActor({secret,actor:a,method,params,now});
const check=(a=actor,method='tools.invoke',params={sessionKey:session(a),name:'memory_search',args:{query:'test'}},extra={})=>
  authorizeVoiceActor({...deps,proof:signed(a,method,params),method,params,...extra});

test('two actors in two groups retain independent canonical context and owner identity',async()=>{
  for(const openId of ['ou_alice','ou_bob'])for(const chatId of ['oc_groupA','oc_groupB']){
    const a={...actor,openId,chatId},result=await check(a);
    assert.equal(result.sessionKey,session(a));assert.equal(result.openId,openId);
    assert.equal(result.senderIsOwner,openId==='ou_alice');
    const c=actorClient(client,result);
    assert.deepEqual(c.connect.scopes,['operator.read','operator.write']);
    assert.equal(c.internal.operatorRoleActor,undefined);
    assert.equal(actorToolContext(result).channelContext.sender.id,openId);
    assert.equal(actorToolContext(result).groupId,chatId);
  }
});

test('signed actor proof cannot change subject, chat, method, argument, account or exact session',async()=>{
  const method='tools.invoke',params={sessionKey:session(actor),name:'memory_get',args:{path:'fixture'}};
  const proof=signed(actor,method,params);
  for(const altered of [{...proof,actor:{...actor,openId:'ou_bob'}},{...proof,actor:{...actor,chatId:'oc_groupB'}},
    {...proof,signature:'x'.repeat(43)},{...proof,issuedAt:now-30001},{...proof,issuedAt:now+5001}]){
    await assert.rejects(authorizeVoiceActor({...deps,proof:altered,method,params}),/not_authorized/);
  }
  await assert.rejects(authorizeVoiceActor({...deps,proof,method:'chat.history',params}),/not_authorized/);
  await assert.rejects(authorizeVoiceActor({...deps,proof,method,params:{...params,args:{path:'other'}}}),/not_authorized/);
  await assert.rejects(check(actor,method,{...params,sessionKey:session({...actor,chatId:'oc_groupB'})}),/not_authorized/);
  await assert.rejects(check(actor,method,{...params,agentId:'other'}),/not_authorized/);
  await assert.rejects(check(actor,method,{...params,accountId:'personal'}),/not_authorized/);
});

test('optional undefined fields survive RPC JSON roundtrip without invalidating a signed proof',async()=>{
  const method='tools.invoke',params={sessionKey:session(actor),name:'fixture',unused:undefined,args:{unused:undefined,value:'fixture'}};
  const wire=JSON.parse(JSON.stringify({proof:signed(actor,method,params),params}));
  assert.equal((await authorizeVoiceActor({...deps,...wire,method})).openId,actor.openId);
});

test('membership, account revocation and owner changes are re-evaluated on every request',async()=>{
  const described=await check(actor,'sessions.describe',{key:session(actor),includeDerivedTitles:false,includeLastMessage:false});
  assert.equal(described.sessionKey,session(actor));
  await assert.rejects(check(actor,undefined,undefined,{resolvePolicy:async()=>({admitted:false})}),/not_authorized/);
  await assert.rejects(check(actor,undefined,undefined,{resolveAccount:async()=>({enabled:false})}),/not_authorized/);
  await assert.rejects(check(actor,undefined,undefined,{client:{...client,connect:{scopes:['operator.admin'],caps:[]}}}),/not_authorized/);
  await assert.rejects(check(actor,'chat.send',{sessionKey:session(actor),message:'bypass'}),/not_authorized/);
  const changed=await check(actor,undefined,undefined,{resolvePolicy:async()=>({admitted:true,agentId:'makaron',sessionKey:session(actor),senderIsOwner:false})});
  assert.equal(changed.senderIsOwner,false);
});

test('one transport cannot read or control another caller or group resources',async()=>{
  const middleware=createVoiceActorMiddleware({...deps,now:()=>now});
  const prepare=async(a,method,p={})=>{
    const params={sessionKey:session(a),...p},reply=[];
    const result=await middleware({req:{method,params:{...params,voiceActor:signed(a,method,params)}},client,
      context:{getRuntimeConfig:()=>({})},respond:(...args)=>reply.push(args)});
    return {result,reply};
  };
  const {result}=await prepare(actor,'talk.client.create');
  result.respond(true,{voiceSessionId:'voice-A',clientSecret:'secret-A'});
  await prepare(actor,'talk.client.close',{voiceSessionId:'voice-A'});
  for(const a of [{...actor,openId:'ou_bob'},{...actor,chatId:'oc_groupB'}]){
    await assert.rejects(prepare(a,'talk.client.close',{voiceSessionId:'voice-A'}),/not_authorized/);
    await assert.rejects(prepare(a,'voice.product.task-result',{clientSecret:'secret-A'}),/not_authorized/);
  }
  await assert.rejects(prepare(actor,'send',{channel:'feishu',accountId:'lab',to:'oc_groupB',message:'wrong group'}),/not_authorized/);
  const resolved=await prepare(actor,'voice.feishu.resolve');
  assert.equal(resolved.result,null);assert.equal(resolved.reply[0][1].sessionKey,session(actor));
});

test('membership denial exposes only a fixed recovery reason after verified actor admission',async()=>{
  await assert.rejects(check(actor,undefined,undefined,{resolvePolicy:async()=>({admitted:false,reason:'conversation_membership_required'})}),
    error=>error.code==='FEISHU_CONVERSATION_MEMBERSHIP_REQUIRED');
  await assert.rejects(check(actor,undefined,undefined,{resolvePolicy:async()=>({admitted:false,reason:'private-identifier'})}),
    error=>error.code===undefined&&!error.message.includes('private-identifier'));
});
