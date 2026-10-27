import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPrivatePhoneMenu,privatePhoneCard,PRIVATE_PHONE_MENU_KEY} from './feishu-private-phone-menu.mjs';
import {patchPrivatePhoneMenu} from './patch-feishu-private-phone-menu.mjs';
const now=1793080000000,account={accountId:'default',appId:'cli_fixture'},settings={appId:account.appId,privateMenu:{enabled:true,url:'https://voice.example/voice/feishu'}};
const event=(operator='ou_alice',timestamp=now)=>({event_key:PRIVATE_PHONE_MENU_KEY,timestamp,operator:{operator_id:{open_id:operator}}});
function fixture({mode='p2p',member=true,enabled=true}={}){
  const calls=[];let sequence=0;
  return {calls,handler:createPrivatePhoneMenu({account,now:()=>now,getSettings:async()=>enabled?settings:null,api:async(method,path,body)=>{
    calls.push({method,path,body});
    if(method==='POST')return {message_id:'om_'+(++sequence),chat_id:'oc_'+body.receive_id.slice(3)};
    if(path.endsWith('/members?member_id_type=open_id&page_size=100'))return {items:member?[{member_id:'ou_'+path.match(/oc_([a-z]+)/)[1]}]:[]};
    if(method==='GET')return {chat_mode:mode};
    if(method==='PATCH')return {};
    throw Error('unexpected_api');
  }})};
}
test('existing and first-time callers resolve through their actual bot DM, with no prior phone mapping',async()=>{
 const f=fixture();
 for(const user of ['ou_existing','ou_newuser'])assert.equal((await f.handler.run(event(user))).status,'ready');
 const patch=f.calls.filter(c=>c.method==='PATCH');assert.equal(patch.length,2);
 for(const [i,user] of ['existing','newuser'].entries()){
  const card=JSON.parse(patch[i].body.content),button=card.body.elements.find(e=>e.tag==='button');
  const url=new URL(button.behaviors[0].default_url);const value=JSON.parse(Buffer.from(url.searchParams.get('phone').slice(7),'base64url'));
  assert.deepEqual(value,['default','oc_'+user]);assert(!patch[i].body.content.includes('sessionKey'));
  assert.equal(new URL(button.behaviors[0].pc_url).searchParams.get('mode'),'sidebar-semi');
 }
 assert(f.calls.every(c=>!c.path.includes('/menu_tree')&&!c.path.includes('/chat_tabs')));
});
test('duplicate and concurrent delivery sends one card; unrelated menu never calls APIs',async()=>{
 const f=fixture();await Promise.all([f.handler.run(event()),f.handler.run(event())]);
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
 assert.equal((await f.handler.run(event())).status,'duplicate');
 assert.equal((await f.handler.run({...event(),event_key:'other'})).status,'ignored');
});
test('wrong app, expired event, malformed operator and disabled configuration are consumed without writes',async()=>{
 for(const value of [{...event(),header:{app_id:'cli_other'}},event('ou_alice',now-301000),event('user_not_open')]){
  const f=fixture();assert.equal((await f.handler.run(value)).status,'invalid_event');assert.equal(f.calls.length,0);
 }
 const f=fixture({enabled:false});assert.equal((await f.handler.run(event())).status,'disabled');assert.equal(f.calls.length,0);
});
test('a group result or wrong private member cannot receive a working phone link',async()=>{
 for(const args of [{mode:'group'},{member:false}]){
  const f=fixture(args);assert.equal((await f.handler.run(event())).status,'failed');
  assert.equal(f.calls.filter(c=>c.method==='PATCH').length,0);
 }
});
test('card has one direct URL action and no identity grant, automatic dial or top-tab dependency',()=>{
 const card=privatePhoneCard('https://voice.example/voice/feishu?phone=fixture');
 assert.equal(card.schema,'2.0');assert.equal(card.config.update_multi,true);
 const buttons=card.body.elements.filter(x=>x.tag==='button');assert.equal(buttons.length,1);
 assert.equal(buttons[0].type,'primary_filled');assert.equal(buttons[0].behaviors[0].type,'open_url');
 assert(!JSON.stringify(card).includes('identified='));assert(!JSON.stringify(card).includes('access='));
});
test('native hook is narrow, idempotent and runs before legacy menu/model handling',()=>{
 const baseline=readFileSync(new URL('../release/captured/v-feishu-phone-entry-20261026.feishu/dist/dist/monitor.account-WFdlCDhR.js',import.meta.url),'utf8');
 const patched=patchPrivatePhoneMenu(baseline);assert.equal(patchPrivatePhoneMenu(patched),patched);
 assert(patched.indexOf('if(vPrivatePhoneMenu.handles(data))')<patched.indexOf('const event = parseFeishuBotMenuEvent(data);'));
 assert.throws(()=>patchPrivatePhoneMenu('drifted'));
});
