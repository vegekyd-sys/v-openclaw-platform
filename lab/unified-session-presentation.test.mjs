import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CAPTURE} from './build-feishu-task-presentation.mjs';
import {patchSessionsSendRelay} from './release-files/sessions-send-relay/patch.mjs';
import {patchTaskPresentationSessionsSend} from './patch-feishu-task-presentation.mjs';

test('relay fallback: target native card never consumes the original requester wake', async()=>{
 const patched=patchTaskPresentationSessionsSend(patchSessionsSendRelay(fs.readFileSync(CAPTURE+'/dist/sessions-spawn-tool-1FQMTkIo.js','utf8')));
 const start=patched.indexOf('async function runSessionsSendA2AFlow(params) {'),end=patched.indexOf('//#endregion',start);
 const original=process.env.V_FEISHU_TASK_PRESENTATION;process.env.V_FEISHU_TASK_PRESENTATION='1';
 try {for(const same of [false,true])for(const inline of [false,true])for(const owned of [false,true,'error']){
  const wakes=[],sends=[],queries=[];
  const deps={callAgentToolGatewayRequest:async()=>{},waitForAgentRun:async()=>({status:'ok',terminalReply:{disposition:'visible',text:'ACTUAL_RESULT'}}),
   isNonDeliverableSessionsReply:()=>false,sameOwnedSession:()=>same,resolveAnnounceTarget:async()=>({channel:'feishu'}),deliverAnnounceReply:async p=>sends.push(p),
   runAgentStep:async p=>wakes.push(p),resolveNestedAgentLaneForSession:()=> 'test',log$1:{warn:(message,data)=>{throw Error(message+JSON.stringify(data));}},formatErrorMessage:e=>e.message};
  const run=new Function(...Object.keys(deps),patched.slice(start,end)+';return runSessionsSendA2AFlow;')(...Object.values(deps));
  await run({roundOneReply:inline?'ACTUAL_RESULT':undefined,waitRunId:'target-run',baseline:{},requesterSessionKey:'agent:test:requester',targetSessionKey:same?'agent:test:requester':'agent:test:target',requesterAgentId:'test',targetAgentId:'test',requesterChannel:'feishu',
   callGateway:async p=>{queries.push(p);if(owned==='error')throw Error('offline');return{owned};}});
  assert.equal(wakes.length,!same&&!inline?1:0,JSON.stringify({same,inline,owned}));
  if(wakes.length){assert.equal(wakes[0].sessionKey,'agent:test:requester');assert.equal(wakes[0].message,'ACTUAL_RESULT');assert.equal(wakes[0].idempotencyKey,'sessions-send-result:target-run');}
  assert.equal(sends.length,same&&owned!==true?1:0);
  assert.equal(queries.length,same?1:0,'cross-session handback is independent of target presentation');
 }}finally{if(original===undefined)delete process.env.V_FEISHU_TASK_PRESENTATION;else process.env.V_FEISHU_TASK_PRESENTATION=original;}
});

test('followup adapter respects route/policy and routes final ACK through the same task owner',async()=>{
 const {openFollowupPresentation,followupPresentationOptions,deliverFollowupPresentation}=await import('./feishu-task-presentation-followup.mjs');
 const {TaskPresentationManager,PRESENTATION_KEY}=await import('./feishu-task-presentation.mjs');
 const entry={sessionId:'s',delivery:{kind:'external',context:{channel:'feishu',accountId:'default',to:'chat:oc_test'}}};
 const m=new TaskPresentationManager({getEntry:()=>entry});globalThis[PRESENTATION_KEY]=m;
 const calls=[];m.registerAccount('default',{open:async()=>({start:async()=>{},finish:async p=>calls.push(p)})});
 const turn={runId:'queued-1',sendPolicy:'allow',session:{kind:'session',key:'agent:test:feishu:group:oc_test'},queued:{messageId:'om_mock_123',originatingChannel:'feishu',originatingAccountId:'default',originatingTo:'chat:oc_test',run:{agentId:'test',sessionId:'s'}}};
 try {
  const old=()=>{throw Error('closed original dispatcher invoked');};
  assert.equal(await openFollowupPresentation({...turn,sendPolicy:'deny'},{}),null);
  assert.equal(await openFollowupPresentation({...turn,queued:{...turn.queued,originatingTo:'chat:oc_other'}},{}),null);
  assert.equal(await openFollowupPresentation(turn,{opts:{sourceReplyDeliveryMode:'message_tool_only'}}),null);
  const h=await openFollowupPresentation(turn,{});assert(h);assert.equal(h.record.anchorId,'om_mock_123');
  const options=followupPresentationOptions(turn,{onAgentRunStart:old,onToolStart:old,onItemEvent:old});options.onAgentRunStart();assert.equal(options.onToolStart,undefined);
  let observed=0;assert.equal(await deliverFollowupPresentation({turn,runId:turn.runId,defaults:{opts:{onObservedReplyDelivery:()=>observed++}}},[{text:'actual result'}]),true);
  assert.equal(observed,1);assert.equal(calls.length,1);assert(h.record.delivered);
 }finally{await m.close();delete globalThis[PRESENTATION_KEY];}
});

test('composed runtime artifacts preserve relay and presentation with one target and exact hashes',async()=>{
 const {buildUnifiedPresentation}=await import('./build-unified-session-presentation.mjs');
 const {createHash}=await import('node:crypto');const {execFileSync}=await import('node:child_process');
 const {files}=await buildUnifiedPresentation({write:false});assert.equal(new Set(files.map(f=>f.target)).size,files.length);
 for(const f of files){const b=fs.readFileSync(f.source);assert.equal(createHash('sha256').update(b).digest('hex'),f.sha256,f.source);if(/\.(?:m?js)$/u.test(f.source))execFileSync(process.execPath,['--check',f.source]);}
 const monitor=fs.readFileSync(files.find(f=>f.target.endsWith('/monitor.account-WFdlCDhR.js')).source,'utf8');
 assert(monitor.includes('v-feishu-inter-session-bridge-v1'));assert(monitor.includes('feishu-bound-task-presentation-v1'));assert(monitor.includes('event.runId !== ownerRunId'));
 const runner=fs.readFileSync(files.find(f=>f.target.endsWith('/agent-runner.runtime-CAdsMsQt.js')).source,'utf8');
 assert(runner.includes('v-inter-session-exclusive-v1'));assert(runner.includes('v-task-followup-presentation-v1'));
});

test('native progress observer rejects unowned and late progress-card events',async()=>{
 const {patchProgressRendererIdentity}=await import('./patch-task-progress-identity.mjs');
 const source=patchProgressRendererIdentity(fs.readFileSync(CAPTURE+'.feishu/dist/dist/monitor.account-WFdlCDhR.js','utf8'));
 const part=source.slice(source.indexOf('\tconst vProgressAttach = () => {'),source.indexOf('\tconst vProgressDetach = () => {'));
 for(const bound of [true,false]){
  let handler;const pushed=[];
  const deps={params:{sessionKey:'s',boundTaskPresentation:bound?{runId:()=> 'current'}:undefined,runtime:{}},vFirsttextE2e:{runId:'current'},previewStreamingEnabled:true,
   vProgressSubscribe:(_s,fn)=>{handler=fn;return()=>{};},renderFeishuProgressMarkdown:c=>c.markdown,streaming:{isActive:()=>true},streamingStartPromise:null,vProgressDispatcherId:1,account:{accountId:'default'},idleRequestedForReply:false,
   startStreaming:()=>{},flushStreamingCardUpdate:x=>pushed.push(x),buildCombinedStreamText:()=> 'rendered',reasoningText:'',streamText:''};
  new Function(...Object.keys(deps),'let vProgressUnsubscribe=null,vProgressText="";'+part+';vProgressAttach();')(...Object.values(deps));
  handler({markdown:'late'},{runId:'old'});assert.equal(pushed.length,0);
  handler({markdown:'unknown'},{});assert.equal(pushed.length,bound?0:1);
  handler({markdown:'current'},{runId:'current'});assert.equal(pushed.length,bound?1:2);
 }
});

test('command transport reports only actual final ACK and cannot fall back after owning a failed send',async()=>{
 const {deliverPresentedBatch}=await import('./feishu-task-presentation-delivery.mjs');
 const {TaskPresentationManager,PRESENTATION_KEY}=await import('./feishu-task-presentation.mjs');
 const entry={sessionId:'s',delivery:{kind:'external',context:{channel:'feishu',accountId:'default',to:'chat:oc_test'}}};
 const m=new TaskPresentationManager({getEntry:()=>entry});globalThis[PRESENTATION_KEY]=m;
 let failed=true,now=0,sends=0,fallbacks=0;m.now=()=>now;
 m.registerAccount('default',{open:async record=>({start:async()=>{},finish:async()=>{sends++;if(failed)throw Error('429');record.sinkState={receipts:[{payloadIndex:0,visibleReplySent:true,messageId:'om_actual'}]};}})});
 try {
  const h=await m.open({source:'subagent-announce',agentId:'test',sessionKey:'s',taskId:'task',runId:'run',text:'公开回报'},{trusted:true});
  const batch={channel:'feishu',accountId:'default',to:'oc_test',payloads:[{text:'actual output'}]},fallback=async()=>{fallbacks++;return{status:'sent',results:[]};};
  assert.equal((await deliverPresentedBatch({runId:'run'},batch,fallback)).status,'failed');assert(!h.record.delivered);assert.equal(sends,1);assert.equal(fallbacks,0);
  failed=false;now=61000;const r=await deliverPresentedBatch({runId:'run'},batch,fallback);assert.equal(r.status,'sent');assert.equal(r.results[0].messageId,'om_actual');assert.equal(sends,2);
  assert.equal((await deliverPresentedBatch({runId:'run'},batch,fallback)).status,'sent');assert.equal(sends,2,'terminal replay must not resend');
  assert.equal((await deliverPresentedBatch({runId:'run'},{...batch,to:'oc_other'},fallback)).status,'failed');assert.equal(fallbacks,0);
 }finally{await m.close();delete globalThis[PRESENTATION_KEY];}
});

test('empty normalized result cannot revive an earlier unfiltered or yielded result',async()=>{
 const {TaskPresentationManager}=await import('./feishu-task-presentation.mjs');const sent=[];
 const m=new TaskPresentationManager({getEntry:()=>({sessionId:'s',delivery:{kind:'external',context:{channel:'feishu',accountId:'a',to:'chat:oc_test'}}})});
 m.registerAccount('a',{open:async()=>({finish:async p=>sent.push(...p)})});
 try{const h=await m.open({source:'inter-session',agentId:'a',sessionKey:'s',taskId:'t',runId:'r'},{trusted:true});h.capture({payloads:[{text:'ALREADY_SENT_BY_MESSAGE_TOOL'}]});await h.finish({payloads:[],meta:{yielded:false}});assert(!JSON.stringify(sent).includes('ALREADY_SENT_BY_MESSAGE_TOOL'));assert(JSON.stringify(sent).includes('没有文字结果'));}finally{await m.close();}
});

test('a resumed task rejects an old run final and clears its prior yielded payloads',async()=>{
 const {TaskPresentationManager,PRESENTATION_KEY}=await import('./feishu-task-presentation.mjs');
 const {deliverPresentedBatch}=await import('./feishu-task-presentation-delivery.mjs');
 const m=new TaskPresentationManager({getEntry:()=>({sessionId:'s',delivery:{kind:'external',context:{channel:'feishu',accountId:'a',to:'chat:oc_test'}}})});
 globalThis[PRESENTATION_KEY]=m;const sent=[];
 m.registerAccount('a',{open:async r=>({finish:async p=>{sent.push(...p);r.sinkState={receipts:[{payloadIndex:0,visibleReplySent:true,messageId:'om_actual'}]};}})});
 try{
  const h=await m.open({source:'inter-session',agentId:'a',sessionKey:'s',taskId:'t',runId:'old'},{trusted:true});
  await h.finish({payloads:[{text:'OLD_WAITING_TEXT'}],meta:{yielded:true}});
  assert(h.bindRun('new'));assert.equal(h.record.payloads.length,0);assert.equal(h.record.yielded,false);
  const batch={channel:'feishu',accountId:'a',to:'oc_test',payloads:[{text:'LATE_OLD_FINAL'}]};
  const fallback=()=>{throw Error('must never fall back to duplicate transport');};
  assert.equal((await deliverPresentedBatch({runId:'old'},batch,fallback)).status,'failed');assert.equal(sent.length,0);
  assert.equal((await deliverPresentedBatch({runId:'new'},{...batch,payloads:[{text:'NEW_ACTUAL_FINAL'}]},fallback)).status,'sent');
  assert.deepEqual(sent,[{text:'NEW_ACTUAL_FINAL'}]);
 }finally{await m.close();delete globalThis[PRESENTATION_KEY];}
});

test('late final ACK settles durable custody and reconciles cached announce failure without another model run',async()=>{
 const {TaskPresentationManager,PRESENTATION_KEY}=await import('./feishu-task-presentation.mjs');
 const {deliverPresentedBatch,reconcilePresentedResult}=await import('./feishu-task-presentation-delivery.mjs');
 const hook=Symbol.for('openclaw.v.boundTaskDeliveryCompletion.v1');
 const completion={kind:'pending-final',sessionId:'s',sessionKey:'s',intentId:'intent',deliveryId:'delivery',storePath:'/private/session-store'};
 let failed=true,now=0,sends=0,settlements=0,settleFailed=true;
 globalThis[hook]={resolve:()=>completion,complete:async c=>{assert.deepEqual(c,completion);settlements++;if(settleFailed)throw Error('store temporarily unavailable');}};
 const m=new TaskPresentationManager({now:()=>now,getEntry:()=>({sessionId:'s',delivery:{kind:'external',context:{channel:'feishu',accountId:'a',to:'chat:oc_test'}}})});globalThis[PRESENTATION_KEY]=m;
 m.registerAccount('a',{open:async r=>({finish:async()=>{sends++;if(failed)throw Error('429');r.sinkState={receipts:[{visibleReplySent:true,messageId:'om_actual'}]};}})});
 try{
  const h=await m.open({source:'subagent-announce',agentId:'a',sessionKey:'s',runId:'announce-id',taskId:'announce-id'},{trusted:true});
  const cached={payloads:[{text:'REAL_RESULT'}],deliveryStatus:{status:'failed'}};
  assert.equal((await deliverPresentedBatch({runId:'announce-id'},{channel:'feishu',accountId:'a',to:'oc_test',payloads:cached.payloads},()=>{throw Error('duplicate fallback');})).status,'failed');
  assert.equal(reconcilePresentedResult('announce-id',cached),cached);assert.equal(settlements,0);
  failed=false;now=61000;await m.retryPending();assert(h.record.delivered);assert(!h.record.deliverySettled);assert.equal(sends,2);
  settleFailed=false;await m.retryPending();assert(h.record.deliverySettled);assert.equal(sends,2,'settlement retry cannot resend');
  const actual=reconcilePresentedResult('announce-id',cached);assert.equal(actual.deliveryStatus.status,'sent');assert.equal(actual.deliveryStatus.resultCount,1);assert.deepEqual(actual.payloads,cached.payloads);
  assert.equal(reconcilePresentedResult('unrelated',cached),cached);
 }finally{await m.close();delete globalThis[PRESENTATION_KEY];delete globalThis[hook];}
});
