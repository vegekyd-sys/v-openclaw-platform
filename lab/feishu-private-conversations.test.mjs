import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,chmod,symlink,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createPrivateConversationWriter,readPrivateConversations} from './feishu-private-conversations.mjs';
import {createPhoneTabHandler} from './feishu-phone-tabs.mjs';
import {patchPrivateConversationContext} from './patch-feishu-phone-tabs.mjs';

test('independent actor/app writers serialize without losing existing and first-time DMs',async t=>{
  const dir=await mkdtemp(tmpdir()+'/v-dm-directory-');t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=dir+'/directory.json',writeA=createPrivateConversationWriter({file}),writeB=createPrivateConversationWriter({file});
  await Promise.all([writeA({appId:'cli_a',openId:'ou_old',chatId:'oc_old'}),writeB({appId:'cli_b',openId:'ou_new',chatId:'oc_new'})]);
  assert.equal((await readPrivateConversations(file)).bindings.length,2);
  await writeA({appId:'cli_a',openId:'ou_old',chatId:'oc_old'});
  assert.equal((await readPrivateConversations(file)).bindings.length,2);
  await chmod(file,0o644);await assert.rejects(writeA({appId:'cli_a',openId:'ou_old',chatId:'oc_old'}));
  await chmod(file,0o600);await symlink(file,dir+'/alias');await assert.rejects(readPrivateConversations(dir+'/alias'));
});

test('native entered event records old and empty new DMs without sending messages; group paths remain unchanged',async()=>{
  for(const user of ['old','new']){
    const calls=[],records=[];
    const handler=createPhoneTabHandler({account:{accountId:'default',appId:'cli_app'},
      getSettings:()=>({appId:'cli_app',privateConversationsFile:'/fixture/private.json',allowedOpenIds:[]}),
      recordPrivateConversation:row=>records.push(row),api:async(method,path)=>{
        calls.push([method,path]);assert.equal(method,'GET');
        return path.includes('/members?')?{items:[{member_id:'ou_'+user}]}:{chat_mode:'p2p'};
      }});
    await handler.run({header:{event_type:'im.chat.access_event.bot_p2p_chat_entered_v1'},event:{chat_id:'oc_'+user,operator_id:{open_id:'ou_'+user}}});
    assert.deepEqual(records,[{appId:'cli_app',openId:'ou_'+user,chatId:'oc_'+user}]);assert.equal(calls.length,2);
    const before=calls.length;
    await handler.run({header:{event_type:'im.chat.member.bot.added_v1'},event:{chat_id:'oc_group',operator_id:{open_id:'ou_'+user}}});
    assert.equal(calls.length,before);assert.equal(records.length,1);
  }
});

test('wrong operator, group masquerading as DM and disabled recording never produce a mapping',async()=>{
  for(const variant of ['wrong_member','group','disabled']){
    let records=0,calls=0;
    const h=createPhoneTabHandler({account:{accountId:'default',appId:'cli_app'},
      getSettings:()=>({appId:'cli_app',allowedOpenIds:[],...(variant==='disabled'?{}:{privateConversationsFile:'/fixture/private.json'})}),
      recordPrivateConversation:()=>{records++;},api:async(_,path)=>{calls++;return path.includes('/members?')?{items:[{member_id:'ou_wrong'}]}:{chat_mode:variant==='group'?'group':'p2p'};}});
    await h.run({header:{event_type:'im.chat.access_event.bot_p2p_chat_entered_v1'},event:{chat_id:'oc_chat',operator_id:{open_id:'ou_actor'}}});
    assert.equal(records,0);if(variant==='disabled')assert.equal(calls,0);
  }
});

test('patch supplies explicit private-event provenance and leaves group/native message code intact',async()=>{
  const source=await readFile(new URL('./release-files/feishu-auto-phone-tab/monitor.account-WFdlCDhR.js',import.meta.url),'utf8');
  const result=patchPrivateConversationContext(source);
  assert.equal(patchPrivateConversationContext(result),result);
  assert(result.includes('event:data.event??data'));
  assert.equal(result.replace('// v-feishu-private-conversation-context-v1\n','').replace('"im.chat.access_event.bot_p2p_chat_entered_v1": data => vPhoneTab.schedule({header:{event_type:"im.chat.access_event.bot_p2p_chat_entered_v1"},event:data.event??data}),','"im.chat.access_event.bot_p2p_chat_entered_v1": data => vPhoneTab.schedule(data),'),source);
});
