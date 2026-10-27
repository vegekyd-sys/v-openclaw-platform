import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {createFeishuVoicePolicy}=await import(process.env.VLAB_CANDIDATE_RUNTIME
 ?pathToFileURL(process.env.VLAB_CANDIDATE_RUNTIME+'/openclaw/dist/v-feishu-voice-policy.mjs')
 :new URL('./feishu-voice-policy.mjs',import.meta.url));

const account={accountId:'fixture',appId:'cli_fixture',appSecret:'fixture-only',config:{}};
const actor={chatId:'oc_fixture',openId:'ou_alice'};
const admitted={senderAccess:{decision:'allow'},ingress:{admission:'dispatch'}};
function fixture(api){
 const d={api:()=>api,runtime:()=>({channel:{routing:{resolveAgentRoute:({peer})=>({agentId:'makaron',sessionKey:'agent:makaron:feishu:'+peer.kind+':'+peer.id})}}}),
  pairing:()=>({readAllowFromStore:()=>[]}),dm:async()=>admitted,groupConfig:()=>({}),groupPolicy:()=>({groupPolicy:'open'}),defaultGroupPolicy:()=>undefined,
  groupConversation:async()=>admitted,explicitGroup:()=>false,groupSender:async()=>admitted,groupSession:({chatId})=>({peerId:chatId}),
  configuredRoute:({route})=>({route}),runtimeRoute:({route})=>({route}),commandAuthorization:()=>({senderIsOwner:false})};
 return {d,policy:createFeishuVoicePolicy(d),input:{cfg:{},account,actor}};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

test('chat info and first member page overlap, and neither alone admits a caller',async()=>{
 const info=deferred(),members=deferred(),started=[];
 const f=fixture((_method,path)=>{started.push(path);return path.includes('/members?')?members.promise:info.promise;});
 let settled=false;const work=f.policy(f.input).then(v=>{settled=true;return v;});
 await Promise.resolve();assert.equal(started.length,2);
 info.resolve({chat_mode:'p2p'});await Promise.resolve();assert.equal(settled,false);
 members.resolve({items:[{member_id:actor.openId}]});assert.equal((await work).admitted,true);
});

test('concurrent actors share outstanding reads but get separate membership decisions',async()=>{
 const gate=deferred(),calls=[];
 const f=fixture(async(_method,path)=>{calls.push(path);await gate.promise;return path.includes('/members?')?{items:[{member_id:actor.openId}]}:{chat_mode:'group'};});
 const alice=f.policy(f.input),bob=f.policy({...f.input,actor:{...actor,openId:'ou_bob'}});
 await Promise.resolve();assert.equal(calls.length,2);gate.resolve();
 assert.equal((await alice).admitted,true);assert.deepEqual(await bob,{admitted:false,reason:'conversation_membership_required'});
});

test('settled reads are discarded: revocation and current ingress apply on the next request',async()=>{
 let member=true,calls=0,allow=true;
 const f=fixture(async(_method,path)=>{calls++;return path.includes('/members?')?{items:member?[{member_id:actor.openId}]:[]}:{chat_mode:'p2p'};});
 f.d.dm=async()=>allow?admitted:{...admitted,senderAccess:{decision:'deny'}};
 assert.equal((await f.policy(f.input)).admitted,true);member=false;
 assert.equal((await f.policy(f.input)).reason,'conversation_membership_required');
 member=true;allow=false;assert.equal((await f.policy(f.input)).admitted,false);assert.equal(calls,6);
});

test('account, application, secret, domain and conversation boundaries never share reads',async()=>{
 const gate=deferred();let calls=0;
 const f=fixture(async(_method,path)=>{calls++;await gate.promise;return path.includes('/members?')?{items:[{member_id:actor.openId}]}:{chat_mode:'p2p'};});
 const inputs=[f.input,...['accountId','appId','appSecret','domain'].map(key=>({...f.input,account:{...account,[key]:'different'}})),{...f.input,actor:{...actor,chatId:'oc_other'}}];
 const work=inputs.map(input=>f.policy(input));await Promise.resolve();assert.equal(calls,12);gate.resolve();
 assert((await Promise.all(work)).every(v=>v.admitted));
});

test('pagination is live and malformed or failed member responses fail closed without poisoning retries',async()=>{
 let mode='paged',calls=0;
 const f=fixture(async(_method,path)=>{
  calls++;if(!path.includes('/members?'))return {chat_mode:'p2p'};
  if(mode==='failure')throw Error('fixture failure');
  if(mode==='malformed')return {};
  if(path.includes('page_token=next'))return {items:[{member_id:actor.openId}]};
  return {items:[],has_more:true,page_token:'next'};
 });
 assert.equal((await f.policy(f.input)).admitted,true);assert.equal(calls,3);
 mode='failure';await assert.rejects(f.policy(f.input),/fixture failure/);
 mode='malformed';await assert.rejects(f.policy(f.input),/members_unconfirmed/);
 mode='paged';assert.equal((await f.policy(f.input)).admitted,true);
});
