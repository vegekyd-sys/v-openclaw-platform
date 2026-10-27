import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {confirmVoiceCard,voiceConfirmationIdentity,runtimeVoiceCardConfirmation} from './feishu-voice-confirm.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {patchFeishuVoiceConfirmation} from './patch-feishu-voice-confirm.mjs';
const account={accountId:'default',appId:'cli_app',appSecret:'fixture'},settings={appId:'cli_app',cardConfirmation:true,url:'https://voice.example/voice/feishu?phone=old'};
const event={header:{app_id:'cli_app'},event:{operator:{open_id:'ou_external',tenant_key:'externalTenant'},context:{open_chat_id:'oc_group',open_message_id:'om_card'},action:{value:{action:'v.voice.confirm.v1',request:'a'.repeat(43),callback:'https://attacker.invalid',openId:'ou_owner'}}}};
test('private candidate callback uses its separate configured destination while ordinary confirmation stays unchanged',async()=>{
 const dir=await mkdtemp(tmpdir()+'/voice-menu-confirm-'),file=dir+'/settings.json',old=process.env.OPENCLAW_FEISHU_PHONE_TABS_FILE,oldFetch=globalThis.fetch;const calls=[];
 const config={version:1,accounts:{default:{appId:account.appId,enabled:true,conversations:true,cardConfirmation:true,url:'https://original.example/voice/feishu',privateMenu:{enabled:true,url:'https://candidate.example/voice/feishu'}}}};
 try{
  await writeFile(file,JSON.stringify(config),{mode:0o600});process.env.OPENCLAW_FEISHU_PHONE_TABS_FILE=file;
  globalThis.fetch=async(url)=>{calls.push(String(url));return Response.json({confirmed:true});};
  assert.equal((await runtimeVoiceCardConfirmation(event,{account})).toast.type,'success');
  const privateEvent=structuredClone(event);privateEvent.event.action.value.action='v.voice.confirm.private.v1';
  assert.equal((await runtimeVoiceCardConfirmation(privateEvent,{account})).toast.type,'success');
  assert.deepEqual(calls,['https://original.example/voice/feishu/confirm/callback','https://candidate.example/voice/feishu/confirm/callback']);
  config.accounts.default.privateMenu.enabled=false;await writeFile(file,JSON.stringify(config));
  assert.equal((await runtimeVoiceCardConfirmation(privateEvent,{account})).toast.type,'error');assert.equal(calls.length,2);
 }finally{globalThis.fetch=oldFetch;if(old===undefined)delete process.env.OPENCLAW_FEISHU_PHONE_TABS_FILE;else process.env.OPENCLAW_FEISHU_PHONE_TABS_FILE=old;await rm(dir,{recursive:true});}
});
test('native card identity forwards the authenticated external operator, exact conversation and message to configured Voice only',async()=>{
 let call;const result=await confirmVoiceCard(event,{account,settings,now:()=>100,fetchImpl:async(url,init)=>{call={url:String(url),init};return Response.json({confirmed:true});}});
 assert.equal(result.toast.type,'success');assert.equal(call.url,'https://voice.example/voice/feishu/confirm/callback');assert.equal(call.init.redirect,'error');
 const body=JSON.parse(call.init.body);assert.equal(body.openId,'ou_external');assert.equal(body.tenantKey,'externalTenant');assert.equal(body.messageId,'om_card');assert.equal(body.issuedAt,100);assert.equal(body.userId,undefined);
 assert.equal(call.init.headers['x-voice-confirm-signature'],createHmac('sha256','fixture').update('voice-card-confirm-v1\n'+call.init.body).digest('base64url'));
 assert(!call.init.body.includes('attacker'));assert(!call.init.body.includes('ou_owner'));
});
test('wrong app, missing callback identity, disabled rollout and unrelated cards never forward',async()=>{
 let calls=0;const options={account,settings,fetchImpl:async()=>{calls++;throw Error('unexpected');}};
 for(const mutate of [x=>x.header.app_id='cli_other',x=>delete x.event.operator.tenant_key,x=>delete x.event.context.open_message_id,x=>delete x.event.context.open_chat_id]){
  const x=structuredClone(event);mutate(x);assert.equal((await confirmVoiceCard(x,options)).toast.type,'error');
 }
 assert.equal((await confirmVoiceCard(event,{...options,settings:{...settings,cardConfirmation:false}})).toast.type,'error');
 assert.equal(await confirmVoiceCard({event:{action:{value:{action:'other'}}}},options),null);assert.equal(calls,0);
});
test('transient forwarding errors expose no credentials and allow a later idempotent click',async()=>{
 const result=await confirmVoiceCard(event,{account,settings,fetchImpl:async()=>{throw Error('secret detail');}});assert.equal(result.toast.type,'error');assert(!JSON.stringify(result).includes('secret detail'));
});
test('callback patch runs before model or question dispatch, is idempotent and rejects drift',()=>{
 const original='"card.action.trigger": async (data) => {\n await existing(data);\n}';const patched=patchFeishuVoiceConfirmation(original);
 assert(patched.indexOf('if (vVoiceConfirmation) return')<patched.indexOf('await existing'));
 assert.equal(patchFeishuVoiceConfirmation(patched),patched);assert.throws(()=>patchFeishuVoiceConfirmation('other'));assert.equal(voiceConfirmationIdentity({},account),null);
});
