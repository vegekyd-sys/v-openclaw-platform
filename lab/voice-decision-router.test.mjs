import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceDecisionRouter,createJevEvaluator,searchQueryCandidates,createVoiceDecisionHistory,voiceDecisionQuestions,jevEvaluatorFromEnv} from './voice-decision-router.mjs';
import {createGatewayVoiceDecisionOwner,directToolText} from './voice-decision-gateway.mjs';
import {patchVoiceJevController} from './patch-voice-jev.mjs';
import {createGptLiveCallLifecycle} from './gpt-live-call-lifecycle.mjs';
const response=(action,extra={})=>({model:'typesafe/jev-fixture',answers:{route:{type:'choice',choice:action,confidence:1},searchQuery:{type:'choice',choice:'query_0',confidence:1},endIntent:{type:'noul',noul:1},calendarRange:{type:'choice',choice:'tomorrow'},...extra}});
const input={request:'查一下十二是谁',requestId:'owned',available:['memory_search'],callActive:true};
test('search parameters are model-selected literal USER spans; identity and real constraints survive',async()=>{
 const request='用记忆搜索工具再查一次十二喜欢的玩具，不沿用上一轮答案';
 const candidates=searchQueryCandidates(request),target=candidates.find(s=>s.text==='十二喜欢的玩具');assert(target);
 for(const span of candidates)assert.equal(request.slice(span.start,span.end),span.text);
 const router=createVoiceDecisionRouter({evaluate:async()=>response('memory_search',{searchQuery:{type:'choice',choice:target.id,confidence:.4}})});
 assert.equal((await router.decide({...input,request})).args.query,'十二喜欢的玩具');
 const constrained=searchQueryCandidates('查一下十二在上海的学校，不要台北的');
 assert(constrained.every(s=>s.text.includes('不要台北的')));
 const forged=await createVoiceDecisionRouter({evaluate:async()=>response('memory_search',{searchQuery:{type:'choice',choice:'查公司合同',confidence:1}})}).decide(input);
 assert.equal(forged.action,'clarify');
});
test('real ASR punctuation and replay-control variant stay literal without dropping a factual exclusion',()=>{
 const request='用记忆搜索工具再查一次。12。喜欢的玩具不言用上一轮答案。';
 const candidates=searchQueryCandidates(request);
 assert(candidates.some(s=>s.text==='12。喜欢的玩具'));
 for(const span of candidates)assert.equal(request.slice(span.start,span.end),span.text);
 assert(searchQueryCandidates('查一下十二喜欢的玩具，不要上一轮报告里的玩具').every(s=>s.text.includes('不要上一轮报告里的玩具')));
});
test('natural 看看 lookup preserves the literal person, topic and exclusions',()=>{
 const request='你看看十二喜欢什么玩具';
 assert(searchQueryCandidates(request).some(s=>s.text==='十二喜欢什么玩具'));
 assert(searchQueryCandidates('你看看十二在上海的学校，不要台北的').every(s=>s.text.includes('不要台北的')));
});
test('direct Memory evidence is unwrapped, keeps source and uncertainty, and bypasses Agent document summary',()=>{
 const result={content:[{type:'text',text:JSON.stringify({results:[{path:'memory/people/shi-er.md',startLine:2,endLine:8,snippet:'喜欢小汽车；卡牌偏好没有记录。'}]})}]};
 const text=directToolText('memory_search',{query:'十二 玩具'},result);
 assert(text.includes('喜欢小汽车；卡牌偏好没有记录。'));assert(text.includes('memory/people/shi-er.md:2-8'));
 assert(!text.includes('"results"'));assert(text.includes('无关命中不能作为答案'));
 assert(directToolText('memory_search',{query:'未记录'}, {details:{results:[]}}).includes('没有检索结果'));
 assert(directToolText('memory_search',{query:'十二'}, {isError:true,content:[{type:'text',text:'索引不可用'}]}).includes('工具没有成功完成'));
 const source='// voice-jev-concurrent-decisions-v1\nconst spoken=this.options.onBackendResult?.({delegationId:delegation.id,text:result.text});';
 const patched=patchVoiceJevController(source);assert.equal(patchVoiceJevController(patched),patched);
 let publications=0;const fn=new Function('result','delegation',patched+' return spoken;');
 assert.equal(fn.call({options:{onBackendResult:()=>{publications++;return '摘要';}}},{text,provenance:{source:'direct_tool'}},{id:'owned'}),undefined);
 assert.equal(publications,0);
 assert.equal(fn.call({options:{onBackendResult:()=>{publications++;return '摘要';}}},{text:'真实方案',provenance:{source:'canonical_final'}},{id:'owned'}),'摘要');assert.equal(publications,1);
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
test('route uncertainty is not reported as a missing caller target and never executes a tool',async()=>{
 for(const confidence of [.68,.48]){
  let calls=0;const owner=createGatewayVoiceDecisionOwner({evaluate:async()=>response('memory_search',{route:{type:'choice',choice:'memory_search',confidence}}),invoke:async()=>{calls++;},isCallCurrent:()=>true});
  const answer=await owner.run({request:'十二喜欢什么玩具',requestId:'uncertain-'+confidence,signal:new AbortController().signal,isCurrent:()=>true});
  assert.equal(calls,0);assert(answer.text.includes('尚未执行查询'));assert(!answer.text.includes('目标尚不明确'));
 }
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
test('restored native lifecycle does not expose experimental decision hangup acceptance',()=>{
 const lifecycle=createGptLiveCallLifecycle({isCurrent:()=>true});
 assert.equal(lifecycle.acceptDecisionTool,undefined);
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


test('OpenAI Decisions uses the same host gates and requires two query choices even for one literal',async()=>{
 const questions=voiceDecisionQuestions({available:['memory_search'],callActive:true,queryCandidates:searchQueryCandidates('十二是谁')});
 assert(Object.keys(questions.searchQuery.criteria).length>=2);
 let body;const evaluate=jevEvaluatorFromEnv({VOICE_DECISION_PROVIDER:'openai_decisions',VOICE_JEV_API_KEY:'private-test'});assert.equal(typeof evaluate,'function');
 const adapter=createJevEvaluator({apiKey:'private-test',model:'openai/gpt-6-luna-decisions',fetchImpl:async(url,options)=>{body=JSON.parse(options.body);return {ok:true,json:async()=>response('end_call',{model:'openai/gpt-6-luna-decisions-actual',endIntent:{type:'noul',noul:.6}})};}});
 assert.equal((await createVoiceDecisionRouter({evaluate:adapter}).decide(input)).action,'clarify');
 assert.equal(body.model,'openai/gpt-6-luna-decisions');assert(!JSON.stringify(body).includes('private-test'));
});
test('rolling USER references preserve antecedent and current exclusions without inventing facts',async()=>{
 const h=createVoiceDecisionHistory();h.append('user','十二是谁啊');h.append('assistant','模型猜测的名字不能当作USER');h.append('user','给他买个玩具，不要卡牌');
 const history=h.snapshot('给他买个玩具，不要卡牌');assert.equal(history.length,2);
 const candidates=searchQueryCandidates('给他买个玩具，不要卡牌',history),choice=candidates.find(c=>c.reference?.text==='十二');assert(choice);
 assert(candidates.filter(c=>c.reference).every(c=>c.text.includes('不要卡牌')));
 assert(!candidates.some(c=>c.reference?.text==='模型猜测'));
 const router=createVoiceDecisionRouter({evaluate:async()=>response('memory_search',{searchQuery:{type:'choice',choice:choice.id,confidence:1}})});
 assert.equal((await router.decide({...input,request:'给他买个玩具，不要卡牌',history})).args.query,'十二 给他买个玩具，不要卡牌');
 assert.throws(()=>router.decide({...input,request:'给他买个玩具，不要卡牌',history:[]}),/冲突/);
 const low=createVoiceDecisionRouter({evaluate:async()=>response('memory_search',{searchQuery:{type:'choice',choice:choice.id,confidence:.5}})});
 assert.equal((await low.decide({...input,request:'给他买个玩具，不要卡牌',history})).action,'clarify');
});
test('Gateway snapshots real rolling context independently for each request',async()=>{
 const h=createVoiceDecisionHistory();const states=[];
 const owner=createGatewayVoiceDecisionOwner({evaluate:async state=>{states.push(state);return response('noop');},invoke:async()=>assert.fail(),isCallCurrent:()=>true,getHistory:r=>h.snapshot(r)});
 h.append('user','十二是谁');await owner.run({request:'十二是谁',requestId:'first',signal:new AbortController().signal,isCurrent:()=>true});
 h.append('user','给他买玩具');await owner.run({request:'给他买玩具',requestId:'second',signal:new AbortController().signal,isCurrent:()=>true});
 assert.equal(states[0].history.length,0);assert.equal(states[1].history[0].text,'十二是谁');
 const other=createVoiceDecisionHistory();assert.equal(other.snapshot('给他买玩具').length,0);
});

test('spoken fillers and polite modal are query scaffolding; named private topic and exclusions survive',()=>{
 assert(searchQueryCandidates('呃,能查一下夜班模式吗').some(q=>q.text==='夜班模式'));
 assert(searchQueryCandidates('嗯，你可以查一下十二在上海的学校，不要台北的好吗').every(q=>q.text.includes('不要台北的')));
});
