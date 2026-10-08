import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceDecisionRouter,createJevEvaluator,searchQueryCandidates} from './voice-decision-router.mjs';
import {createGatewayVoiceDecisionOwner} from './voice-decision-gateway.mjs';
import {createGptLiveCallLifecycle} from './gpt-live-call-lifecycle.mjs';
const response=(action,extra={})=>({model:'typesafe/jev-fixture',answers:{route:{type:'choice',choice:action,confidence:1},searchQuery:{type:'choice',choice:'query_0',confidence:1},endIntent:{type:'noul',noul:1},calendarRange:{type:'choice',choice:'tomorrow'},...extra}});
const input={request:'查一下十二是谁',requestId:'owned',available:['memory_search'],callActive:true};
test('search parameters are model-selected literal USER spans; identity and real constraints survive',async()=>{
 const request='用记忆搜索工具再查一次十二喜欢的玩具，不沿用上一轮答案';
 const candidates=searchQueryCandidates(request),target=candidates.find(s=>s.text==='十二喜欢的玩具');assert(target);
 for(const span of candidates)assert.equal(request.slice(span.start,span.end),span.text);
 const router=createVoiceDecisionRouter({evaluate:async()=>response('memory_search',{searchQuery:{type:'choice',choice:target.id,confidence:1}})});
 assert.equal((await router.decide({...input,request})).args.query,'十二喜欢的玩具');
 const constrained=searchQueryCandidates('查一下十二在上海的学校，不要台北的');
 assert(constrained.every(s=>s.text.includes('不要台北的')));
 const forged=await createVoiceDecisionRouter({evaluate:async()=>response('memory_search',{searchQuery:{type:'choice',choice:'查公司合同',confidence:1}})}).decide(input);
 assert.equal(forged.action,'clarify');
});
test('one request is evaluated once; changed request/capability cannot reuse its receipt',async()=>{
 let calls=0;const router=createVoiceDecisionRouter({evaluate:async()=>{calls++;return response('memory_search');}});
 const [a,b]=await Promise.all([router.decide(input),router.decide(input)]);assert.equal(a,b);assert.equal(calls,1);
 assert.throws(()=>router.decide({...input,request:'另一句话'}),/冲突/);
 assert.throws(()=>router.decide({...input,volumeControl:true}),/冲突/);
});
test('unavailable actions, malformed choice and stale or cancelled evaluation never execute',async()=>{
 for(const raw of [response('exec'),response('end_call',{route:{type:'choice',choice:'end_call',confidence:NaN}})]){
  await assert.rejects(createVoiceDecisionRouter({evaluate:async()=>raw}).decide(input),/无效/);
 }
 let current=true;await assert.rejects(createVoiceDecisionRouter({evaluate:async()=>{current=false;return response('memory_search');}}).decide({...input,isCurrent:()=>current}),/失效/);
 const abort=new AbortController();await assert.rejects(createVoiceDecisionRouter({evaluate:async()=>{abort.abort();return response('memory_search');}}).decide({...input,signal:abort.signal}),/abort/i);
});
test('intent uncertainty cannot end the call; timeout cannot silently launch an Agent',async()=>{
 const low=response('end_call',{endIntent:{type:'noul',noul:.6}});
 assert.equal((await createVoiceDecisionRouter({evaluate:async()=>low}).decide(input)).action,'clarify');
 const failed=await createVoiceDecisionRouter({evaluate:async()=>{throw Error('provider unavailable');}}).decide(input);
 assert.equal(failed.action,'clarify');assert(failed.fallback);
});
test('JEV transport pins endpoint and transmits server key only in authorization; real returned model required',async()=>{
 let request;const evaluate=createJevEvaluator({apiKey:'test-secret',fetchImpl:async(url,options)=>{request={url,options};return {ok:true,json:async()=>response('memory_search')};}});
 await evaluate({request:'查询'},{route:{}});assert.equal(request.options.headers.authorization,'Bearer test-secret');
 assert(!request.options.body.includes('test-secret'));assert.throws(()=>createJevEvaluator({apiKey:'test-secret',endpoint:'https://other.test'}),/未知/);
});
test('Gateway decision performs the authenticated direct tool without Agent; Agent binding stays request-owned',async()=>{
 const calls=[];let action='memory_search';const owner=createGatewayVoiceDecisionOwner({evaluate:async()=>response(action),invoke:async(...args)=>{calls.push(args);return {fact:'十二'};},isCallCurrent:()=>true});
 const signal=new AbortController().signal;
 const answer=await owner.run({request:'查十二',requestId:'direct',signal,isCurrent:()=>true});
 assert.equal(calls[0][0],'memory_search');assert.equal(answer.provenance.source,'direct_tool');
 action='delegate_to_v';const actual={text:'实际完整方案',provenance:{source:'canonical_final',ownerRunId:'actual'}};
 assert.equal(await owner.run({request:'做报告',requestId:'agent',signal,isCurrent:()=>true,delegate:async args=>{assert.equal(args.question,'做报告');return actual;}}),actual);
 assert.equal(owner.pending,false);
});
test('JEV end receipt is honest and owner-bound; goodbye still uses original native context and playback close',()=>{
 const events=[],frames=[];let current=true;
 const lifecycle=createGptLiveCallLifecycle({isCurrent:()=>current,onToolEvent:e=>events.push(e),sendDelegationContext:(id,text)=>{frames.push({id,text});return true;}});
 const proof={nativeDelegationId:'native-owned',originUserTurnId:'user-owned',delegationGeneration:1,decisionId:'real-decision-id',model:'typesafe/jev-fixture'};
 const receipt=lifecycle.acceptDecisionTool(proof);assert.equal(receipt.source,'decision_model_client_tool');assert(!('backendRunId' in receipt));
 assert.equal(lifecycle.acceptDecisionTool(proof),receipt);assert.equal(events.length,2);assert.equal(frames.length,1);
 assert.equal(lifecycle.acceptDecisionTool({...proof,decisionId:'foreign'}),false);current=false;
 assert.throws(()=>lifecycle.acceptDecisionTool({...proof,nativeDelegationId:'new'}),/no longer active/);
});


test('long Agent serialization does not block a new real decision or direct memory tool',async()=>{
 let completeFirst;const calls=[];
 const owner=createGatewayVoiceDecisionOwner({evaluate:async state=>response(state.request==='做报告'?'delegate_to_v':'memory_search'),invoke:async name=>{calls.push(name);return {fact:'实际工具结果'};},isCallCurrent:()=>true});
 const signal=new AbortController().signal;
 const long=owner.run({request:'做报告',requestId:'long',signal,isCurrent:()=>true,delegate:()=>new Promise(resolve=>{completeFirst=resolve})});
 for(let n=0;n<20&&!completeFirst;n++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(typeof completeFirst,'function');assert.equal(owner.pending,true);
 const quick=await owner.run({request:'查十二',requestId:'quick',signal,isCurrent:()=>true});
 assert.deepEqual(calls,['memory_search']);assert.equal(quick.provenance.source,'direct_tool');assert.equal(owner.pending,true);
 completeFirst({text:'报告最终内容',provenance:{source:'canonical_final'}});await long;assert.equal(owner.pending,false);
});
