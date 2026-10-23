import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createFeishuVoicePolicy} from '../feishu-voice-policy.mjs';
import {actorToolContext,actorClient} from '../feishu-voice-actor.mjs';
const runtime=process.env.VLAB_CANDIDATE_RUNTIME;
if(!runtime)throw Error('Run through the VLab candidate runner');
const load=relative=>import(pathToFileURL(runtime+'/'+relative));
const feishu='npm/projects/openclaw-feishu-dc69f44688__openclaw-generation__g-f7df18f5e5ab9a05/node_modules/@openclaw/feishu/dist/';
const [{voiceFeishuPolicyDependencies},{n:commandAuthorization},{s:resolveAgentRoute},{n:requesterPolicy}]=await Promise.all([
  load(feishu+'monitor.account-WFdlCDhR.js'),load('openclaw/dist/command-auth-DmNN2m2f.js'),
  load('openclaw/dist/resolve-route-BoSYT0_Y.js'),load('openclaw/dist/requester-tool-policy-BVN8f5lU.js')]);
const [{t:feishuPlugin},{k:setActivePluginRegistry},{t:createEmptyPluginRegistry}]=await Promise.all([
  load(feishu+'channel-DSYCNah8.js'),load('openclaw/dist/runtime-MupoouIC.js'),load('openclaw/dist/registry-empty-55wlVNzO.js')]);
const registry=createEmptyPluginRegistry();registry.channels.push({plugin:feishuPlugin});
setActivePluginRegistry(registry,'voice-fixture-channel');
const accountId='fixture',secret='fixture-only-app-secret';
const cfg={agents:{list:[{id:'makaron',default:true}]},session:{dmScope:'per-account-channel-peer'},
  commands:{ownerAllowFrom:['feishu:ou_alice']},channels:{feishu:{enabled:true,appId:'cli_fixture',appSecret:secret,
    dmPolicy:'allowlist',allowFrom:['ou_alice','ou_bob'],groupPolicy:'open',groupSenderAllowFrom:['ou_alice','ou_bob'],
    groups:{oc_groupa:{toolsBySender:{'id:ou_alice':{allow:['web_fetch']},'id:ou_bob':{deny:['memory_search','memory_get','exec']}}},
      oc_groupb:{tools:{deny:['memory_search','memory_get']}}}}}};
const account={accountId,appId:'cli_fixture',appSecret:secret,enabled:true,config:cfg.channels.feishu};
let membership=true;
const dependencies=voiceFeishuPolicyDependencies({commandAuthorization,api:()=>async(_,url)=>url.includes('/members?')?
  {items:membership?[{member_id:'ou_alice'},{member_id:'ou_bob'}]:[],has_more:false}:{chat_mode:url.includes('oc_dm')?'p2p':'group'}});
dependencies.runtime=()=>({channel:{routing:{resolveAgentRoute}}});
dependencies.pairing=()=>({readAllowFromStore:async()=>[]});
const policy=createFeishuVoicePolicy(dependencies);
const actor=(openId,chatId)=>({accountId,appId:'cli_fixture',tenantKey:'fixture_tenant',openId,chatId});

test('actual VLab Feishu ingress and canonical route isolate two fixture users and two groups',async()=>{
  const sessions=new Map();
  for(const subject of ['ou_alice','ou_bob'])for(const chat of ['oc_groupa','oc_groupb','oc_dma','oc_dmb']){
    const a=actor(subject,chat),p=await policy({cfg,account,actor:a});
    assert.equal(p.admitted,true);assert.equal(p.senderIsOwner,subject==='ou_alice');
    assert.match(p.sessionKey,chat.startsWith('oc_group')?new RegExp(chat+'$'):new RegExp(subject+'$'));
    sessions.set(subject+':'+chat,p.sessionKey);
  }
  assert.notEqual(sessions.get('ou_alice:oc_groupa'),sessions.get('ou_alice:oc_groupb'));
  assert.notEqual(sessions.get('ou_alice:oc_dma'),sessions.get('ou_bob:oc_dma'));
});

test('actual native group and sender tool policies receive the authenticated actor context',async()=>{
  const bob=actor('ou_bob','oc_groupa'),p=await policy({cfg,account,actor:bob});
  const scoped={...p,...bob},context=actorToolContext(scoped);
  const actual=requesterPolicy({config:cfg,sessionKey:p.sessionKey,agentId:p.agentId,messageProvider:context.messageChannel,
    accountId,groupId:context.groupId,senderId:context.channelContext.sender.id,senderPolicyMode:'when-sender-id'});
  assert(actual.groupPolicy?.deny?.includes('memory_search'));
  assert(actual.groupPolicy?.deny?.includes('exec'));
  const group=requesterPolicy({config:cfg,sessionKey:'agent:makaron:feishu:group:oc_groupb',agentId:'makaron',
    messageProvider:'feishu',accountId,groupId:'oc_groupb',senderId:'ou_bob',senderPolicyMode:'when-sender-id'});
  assert(group.groupPolicy?.deny?.includes('memory_get'));
});

test('native policy rejects revoked membership and unpaired fixture subjects without issuing a challenge',async()=>{
  membership=false;assert.equal((await policy({cfg,account,actor:actor('ou_alice','oc_groupa')})).admitted,false);membership=true;
  const changed={...account,config:{...account.config,dmPolicy:'pairing',allowFrom:[]}};
  assert.equal((await policy({cfg:{...cfg,channels:{feishu:changed.config}},account:changed,actor:actor('ou_bob','oc_dmb')})).admitted,false);
  assert.equal((await policy({cfg:{...cfg,session:{dmScope:'main'}},account,actor:actor('ou_bob','oc_dmb')})).admitted,false);
});

test('actual tools.invoke handler cannot use transport administrator scope to bypass a caller deny',async()=>{
  const {toolsInvokeHandlers}=await load('openclaw/dist/tools-invoke-ev4-EXmh.js');
  const a=actor('ou_bob','oc_groupa'),p=await policy({cfg,account,actor:a});
  for(const name of ['memory_search','exec']){
    const replies=[];
    await toolsInvokeHandlers['tools.invoke']({params:{name,agentId:p.agentId,sessionKey:p.sessionKey,
      args:name==='exec'?{command:'printf fixture_noop'}:{query:'fixture-no-private-data'}},context:{getRuntimeConfig:()=>cfg},
      client:actorClient({connId:'fixture-transport',connect:{scopes:['operator.admin'],caps:['voice-direct-tools']}},{...a,...p}),
      respond:(...reply)=>replies.push(reply)});
    assert.equal(replies.length,1);assert.equal(replies[0][1]?.ok,false,JSON.stringify(replies));
    assert(['forbidden','not_found'].includes(replies[0][1]?.error?.code),JSON.stringify(replies));
  }
});

test('patched real Gateway dispatcher loads and rejects a forged actor before native RPC execution',async()=>{
  const {i:handle}=await load('openclaw/dist/server-methods-CLElG7qF.js');
  const replies=[];
  await handle({req:{method:'tools.invoke',params:{voiceActor:{version:1}}},context:{getRuntimeConfig:()=>cfg},
    client:{connect:{scopes:['operator.admin'],caps:['voice-feishu-actor-v1']}},respond:(...args)=>replies.push(args)});
  assert.equal(replies.length,1);assert.equal(replies[0][0],false);
  assert.match(replies[0][2].message,/not authorized/);
});
