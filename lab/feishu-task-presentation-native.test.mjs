import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createTaskPresentationAccount} from './feishu-task-presentation-native.mjs';
import {patchTaskPresentationMonitor} from './patch-feishu-task-presentation.mjs';
import {CAPTURE} from './build-feishu-task-presentation.mjs';
function fixture(overrides={},progressRuntimes=[]){
 const calls=[],saved=[],record={id:'a'.repeat(64),agentId:'test',sessionKey:'agent:test:feishu:group:oc_test',source:'voice-direct',text:'用户任务',createdAt:1,runIds:['owned'],route:{kind:'group',accountId:'work',chatId:'oc_test',to:'chat:oc_test'}};
 const client={im:{chat:{get:async p=>{calls.push(['authorize',p]);return {code:0};}},message:{create:async p=>{calls.push(['anchor',p]);return {code:0,data:{message_id:'om_anchor'}};}}}};
 let params,settle;
 const native={replyOptions:{onModelSelected:m=>calls.push(['model',m]),onAgentRunStart:r=>calls.push(['run',r]),onPartialReply:p=>calls.push(['partial',p]),onToolStart:p=>calls.push(['tool',p])},
  dispatcherOptions:{onReplyStart:()=>calls.push(['start']),beforeDeliver:p=>p,onIdle:async()=>{calls.push(['idle']);settle?.({visibleReplySent:true});},onCleanup:()=>calls.push(['cleanup'])},
  delivery:{deliver:async p=>{calls.push(['deliver',p]);return {visibleReplySent:false,finalization:new Promise(r=>settle=r)};},onDelivered:(p,i,r)=>calls.push(['delivered',r])},
  snapshotTaskPresentation:()=>({stream:{cardId:'card_owned',messageId:'om_card',sequence:4}}),...overrides};
 const account=createTaskPresentationAccount({cfg:{},accountId:'work',runtime:{},createClient:()=>client,resolveAccount:()=>({accountId:'work',enabled:true}),resolveProgressRuntimes:()=>progressRuntimes,createReplyDispatcher:p=>{params=p;return native;}});
 return {account,record,calls,saved,client,native,params:()=>params,open:()=>account.open(record,async s=>saved.push(structuredClone(s)))};
}
test('native adapter uses one stable task anchor, native callbacks and finalized streaming receipt',async()=>{
 const f=fixture();await f.account.authorize(f.record.route);const s=await f.open();
 await s.start();await s.start({provider:'deepseek',model:'flash'});await s.partial({text:'真实进展'});await s.tool({name:'exec'});await s.finish([{text:'最终结果'},{mediaUrl:'https://example.test/file.pdf'}]);await s.cleanup();
 assert.equal(f.calls.filter(c=>c[0]==='anchor').length,1);assert.equal(f.calls.filter(c=>c[0]==='start').length,1);
 assert.equal(f.calls.filter(c=>c[0]==='deliver').length,2);assert.equal(f.calls.filter(c=>c[0]==='delivered').every(c=>c[1].visibleReplySent),true);
 assert.equal(f.params().sendTarget,'chat:oc_test');assert.equal(f.params().replyToMessageId,'om_anchor');
 assert.equal(f.calls.find(c=>c[0]==='anchor')[1].data.uuid,'a'.repeat(32));assert.equal(f.saved.at(-1).deliveredPayloads,2);
 assert(f.calls.some(c=>c[0]==='model'),'late model selection still updates the existing native footer');
});
test('native adapter restores acknowledged anchor, CardKit identity and payload cursor',async()=>{
 const f=fixture();Object.assign(f.record,{anchorId:'om_original',sinkState:{stream:{cardId:'original',sequence:12,messageId:'om_card'},deliveredPayloads:1}});
 const s=await f.open();await s.finish([{text:'already delivered'},{text:'remaining attachment'}]);
 assert.equal(f.calls.filter(c=>c[0]==='anchor').length,0);assert.equal(f.calls.filter(c=>c[0]==='deliver').length,1);
 assert.equal(f.params().boundTaskPresentation.state.deliveredPayloads,2);
});
test('cron native card identifies its own lifecycle instead of the conversation background summary',async()=>{
 const f=fixture();f.record.source='cron-continuation';await f.open();
 assert.equal(f.params().boundTaskPresentation.source,'cron-continuation');
 assert.match(f.calls.find(c=>c[0]==='anchor')[1].data.content,/自动续接/);
 const monitor=fs.readFileSync('lab/release-files/feishu-continuation-progress/monitor.account-WFdlCDhR.js','utf8');
 const line=monitor.split('\n').find(s=>s.includes('vTaskStatusAttach(params.sessionKey, session,'));
 let attached=0;const run=new Function('params','session','vTaskStatusAttach',line);
 for(const source of ['cron-continuation','subagent-announce','queued-followup','desktop-handback','voice-direct',undefined]){run({sessionKey:'source',runtime:{},boundTaskPresentation:source?{source}:undefined},{},()=>attached++);}
 assert.equal(attached,2,'ordinary and Voice cards retain their background summary; continuations own their individual lifecycle');
});
test('a failed idle close and finalization are both observed without an unhandled rejection',async()=>{
 const f=fixture({delivery:{deliver:async()=>({finalization:Promise.reject(Error('final ACK rejected'))})},
  dispatcherOptions:{onIdle:async()=>{throw Error('idle close rejected');}}});
 const s=await f.open();await assert.rejects(s.finish([{text:'real final'}]),/final ACK rejected/);
 await new Promise(r=>setImmediate(r));assert.equal(f.saved.at(-1)?.deliveredPayloads,undefined);
});
test('native adapter rejects an unacknowledged finalization and preserves retry cursor',async()=>{
 const f=fixture({delivery:{deliver:async()=>({finalization:Promise.resolve({visibleReplySent:false})})}}),s=await f.open();
 await assert.rejects(s.finish([{text:'result'}]),/did not confirm/);assert.equal(f.record.sinkState.deliveredPayloads,undefined);
});
test('a visible progress card or previous payload cannot acknowledge a failed final or attachment',async()=>{
 for(const failAt of [0,1]){
  let delivered=0;
  const f=fixture({getVisibleReplyState:()=>({visibleReplySent:true}),delivery:{deliver:async()=>({visibleReplySent:delivered++!==failAt})}}),s=await f.open();
  await assert.rejects(s.finish([{text:'text result'},{mediaUrl:'https://example.test/file.pdf'}]),/did not confirm/);
  assert.equal(f.record.sinkState.deliveredPayloads??0,failAt);
  assert.equal(f.record.sinkState.receipts?.length??0,failAt);
 }
});
test('account membership failure and anchor API failure cannot open the native renderer',async()=>{
 const f=fixture();f.client.im.chat.get=async()=>({code:403});await assert.rejects(f.account.authorize(f.record.route),/membership/);
 f.client.im.message.create=async()=>({code:429});await assert.rejects(f.open(),/not acknowledged/);assert.equal(f.params(),undefined);
});

// Execute the captured native class, patched with the actual release patcher.
// Only its API transport and utility boundary are injected; card/start/update/close code is unchanged.
function nativeStreamingClass(){
 const patched=patchTaskPresentationMonitor(fs.readFileSync(new URL('../'+CAPTURE+'.feishu/dist/dist/monitor.account-WFdlCDhR.js',import.meta.url),'utf8'));
 const source=patched.slice(patched.indexOf('var FeishuStreamingSession = class'),patched.indexOf('//#endregion',patched.indexOf('var FeishuStreamingSession = class')));
 const requests=[],messages=[],deps={STREAMING_UPDATE_THROTTLE_MS:1,VFEISHU_CARD_PRECREATE_ENABLED:true,
  resolveStreamingCardSendMode:o=>o.replyToMessageId?'reply':'create',requestFeishuApi:fn=>fn(),
  resolveApiBase:()=> 'https://candidate.invalid/open-apis',resolveAllowedHostnames:()=>['candidate.invalid'],getToken:async()=> 'synthetic-token',getFeishuUserAgent:()=> 'test',
  fetchWithSsrFGuard:async p=>{requests.push(p);return {response:new Response(JSON.stringify({code:0,data:{card_id:'new_card'}})),release:async()=>{}};},
  readFeishuJsonResponse:r=>r.json(),assertSuccessfulCardKitResponse:async r=>assert.equal((await r.json()).code,0),
  resolveFeishuCardTemplate:x=>x,shouldPushStreamingUpdate:()=>true,ocCardPhaseAwait:(_l,_id,_phase,fn)=>fn(),ocCardPhaseStart:()=>()=>{},truncateSummary:t=>t.slice(0,80)};
 const Class=new Function(...Object.keys(deps),source+';return FeishuStreamingSession;')(...Object.values(deps));
 const post=async p=>{messages.push(p);return {code:0,data:{message_id:'om_card'}};};
 const client={im:{message:{create:post,reply:post}}};return {Class,client,messages,requests};
}
test('captured native CardKit stream checkpoints before sending and preserves stable message uuid',async()=>{
 const f=nativeStreamingClass(),s=new f.Class(f.client,{domain:'test'}),checkpoints=[];
 await s.start('oc_test','chat_id',{taskUuid:'stable_task',taskCheckpoint:async r=>checkpoints.push({state:r,sends:f.messages.length})});
 assert.equal(checkpoints[0].sends,0);assert.equal(checkpoints[0].state.cardId,'new_card');assert.equal(checkpoints.at(-1).state.messageId,'om_card');assert.equal(f.messages[0].data.uuid,'stable_task');
 await s.update('公开进展');const receipt=await s.closeWithResult('最终结果');assert.equal(receipt.visibleReplySent,true);assert.equal(receipt.messageId,'om_card');
 assert(f.requests.some(p=>p.url.endsWith('/settings')));assert.equal(f.messages.length,1);
});
test('captured native CardKit stream restores the same card/message without another visible create',async()=>{
 const f=nativeStreamingClass(),s=new f.Class(f.client,{domain:'test'}),checkpoints=[];
 await s.start('oc_test','chat_id',{precreatedCardId:'old_card',precreatedSequence:10012,resumeMessageId:'om_original',taskCheckpoint:async state=>checkpoints.push(state)});
 assert(checkpoints.every(s=>s.messageId==='om_original'),'a retry checkpoint must never discard the acknowledged original message');
 assert.equal(f.messages.length,0);assert.equal(f.requests.length,0);assert.equal(s.state.sequence,10012);
 const r=await s.closeWithResult('恢复后的真实结果');assert.equal(r.messageId,'om_original');assert.equal(r.visibleReplySent,true);
 assert(f.requests.every(p=>p.url.includes('/old_card/')));
});
test('native final receipt uses the actual payload message identity before the existing progress card',async()=>{
 const f=fixture({delivery:{deliver:async()=>({visibleReplySent:true,receipt:{primaryPlatformMessageId:'om_attachment'},messageIds:['om_attachment']})}}),s=await f.open();
 await s.finish([{mediaUrl:'https://example.test/actual-file.pdf'}]);assert.equal(f.saved.at(-1).receipts[0].messageId,'om_attachment');
});
test('classified public process uses the native item hook for the selected runtime',async()=>{
 const items=[],f=fixture({},['codex']);f.native.replyOptions.onItemEvent=p=>items.push(p);const s=await f.open();
 await s.start({provider:'deepseek',model:'vds-deepseek-flash',agentRuntime:'codex'});
 await s.partial({kind:'preamble',itemId:'one',phase:'commentary',text:'工具已返回的事实'});
 assert.equal(items.length,1);assert.equal(items[0].progressText,'工具已返回的事实');assert(!f.calls.some(c=>c[0]==='partial'));
});
test('a direct user receive target uses the acknowledged oc chat for native conversation callbacks',async()=>{
 const f=fixture();Object.assign(f.record.route,{kind:'direct',chatId:'ou_user',to:'user:ou_user'});
 f.client.im.message.create=async()=>({code:0,data:{message_id:'om_dm',chat_id:'oc_actualdm'}});
 await f.open();assert.equal(f.params().chatId,'oc_actualdm');assert.equal(f.params().sendTarget,'user:ou_user');assert.equal(f.saved[0].conversationChatId,'oc_actualdm');
});

test('silent native close uses the skip lifecycle without a fabricated final receipt',async()=>{
 const f=fixture();f.native.dispatcherOptions.onSkip=(p,info)=>f.calls.push(['skip',info]);const s=await f.open();await s.partial({text:'已有真实进度'});await s.suppress();
 assert(f.calls.some(c=>c[0]==='skip'&&c[1].reason==='silent'));assert(f.calls.some(c=>c[0]==='idle'));assert(!f.calls.some(c=>c[0]==='deliver'));assert(!f.record.sinkState?.receipts?.length);
});

test('queue and admission status never retire the native commentary stream',async()=>{
 const f=fixture({},['codex']);f.native.setTaskPresentationStatus=text=>f.calls.push(['status',text]);f.native.replyOptions.onItemEvent=p=>f.calls.push(['item',p]);
 const s=await f.open();await s.partial({text:'请求已排队',kind:'status',phase:'commentary'});await s.start({provider:'openai',model:'gpt',agentRuntime:'codex'});await s.partial({text:'正在处理',kind:'status',phase:'commentary'});await s.partial({text:'实际公开进度',kind:'preamble',itemId:'real'});
 assert.deepEqual(f.calls.filter(c=>c[0]==='status').map(c=>c[1]),['请求已排队','正在处理','']);assert(!f.calls.some(c=>c[0]==='partial'));assert.equal(f.calls.find(c=>c[0]==='item')[1].progressText,'实际公开进度');
});

test('native renderer replays an early matching plan and rejects another run snapshot',()=>{
 const source=fs.readFileSync('lab/release-files/feishu-continuation-progress/monitor.account-WFdlCDhR.js','utf8');
 const begin=source.indexOf('const vProgressAttach = () => {'),end=source.indexOf('const vProgressDetach = () => {',begin);assert(begin>=0&&end>begin);
 const run=new Function('early',`
 const seen=[];let subscription, vProgressUnsubscribe=null, vProgressText='';
 const params={sessionKey:'s',runtime:{log(){}},boundTaskPresentation:{runId:()=> 'owned',progressEvent:()=>early}};
 const account={accountId:'a'};const previewStreamingEnabled=true, vProgressDispatcherId=1, streaming={isActive:()=>true}, streamingStartPromise=null, idleRequestedForReply=false, reasoningText='',streamText='';
 const vProgressSubscribe=(key,handler)=>{subscription=handler;return()=>{}};
 const renderFeishuProgressMarkdown=card=>card?.markdown??'';
 const startStreaming=()=>{};const buildCombinedStreamText=()=>vProgressText;const flushStreamingCardUpdate=text=>seen.push(text);
 ${source.slice(begin,end)}
 vProgressAttach();subscription({markdown:'FOREIGN_LATE'},{runId:'other'});return seen;
 `);
 assert.deepEqual(run({sessionKey:'s',runId:'owned',card:{markdown:'EARLY_REAL_PLAN'}}),['EARLY_REAL_PLAN']);
 assert.deepEqual(run({sessionKey:'s',runId:'other',card:{markdown:'FOREIGN_EARLY'}}),[]);
});
