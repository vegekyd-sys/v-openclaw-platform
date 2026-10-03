import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveEndCallToolWitness,resolveLifecycleUserTurn,assessLifecycleSpeech,hasLifecyclePlaybackTail,assessLifecycleFarewell,assessProactiveGreeting,assessAutomaticEnd,
  extractLifecycleToolPairs,resolveLifecycleMemoryUser,resolveLifecycleMemoryWeb,resolveLifecycleConsultResult} from './call-lifecycle-evidence.mjs';

const delegation=(text='{"name":"openclaw_end_call","arguments":{}}')=>({pcIndex:0,at:1000,type:'delegation.created',raw:{item:{id:'item-1',type:'delegation',target:'client',user_bidi_turn_id:'user-1',content:[{type:'input_text',text}]}}});
const tool=(type,at)=>({at,raw:{voiceSessionId:'voice-1',type,name:'openclaw_end_call',callId:'item-1',requestId:'item-1',...(type==='tool.result'?{closeAfterPlayback:true}:{})}});
const witness=()=>({events:[delegation()],tools:[tool('tool.call',1100),tool('tool.result',1200)],pcIndex:0,voiceSessionId:'voice-1'});
const frame=(at,rms=.02)=>({at,pcIndex:0,rms,digitalAudible:rms>.005,muted:false,paused:false,volume:1,contextState:'running',receiverAttachedToPlayback:true,trackState:'live',connected:'connected',rtp:[{packetsReceived:at}]});
function speechState() {
 return {events:[{pcIndex:0,at:1250,type:'turn.created',role:'assistant',turnId:'bye-1'},
   {pcIndex:0,at:1300,type:'output_transcript.added',text:'再见。',turnId:'bye-1'},
   {pcIndex:0,at:1500,type:'turn.done',role:'assistant',text:'再见。',turnId:'bye-1'}],
   audioFrames:Array.from({length:23},(_,i)=>frame(1200+i*50,i<7?.02:0)),
   micFrames:Array.from({length:30},(_,i)=>({at:1000+i*50,pcIndex:0,rms:0,trackState:'live',trackEnabled:true,trackId:'mic',senderTrackId:'mic'})),
   browserTimeOrigin:1000,duplex:{transitions:[{type:'model-end-call-playback-drained',at:1300,requestId:'item-1',originUserTurnId:'user-1',turnId:'bye-1'}]},
   api:[],pcStates:['connected'],remoteAudio:{attached:true}};
}
test('strict native delegation and exact same-owner host call/result are required',()=>{
 const w=resolveEndCallToolWitness(witness());assert.equal(w.requestId,'item-1');assert.equal(w.userTurnId,'user-1');
 for(const mutate of [v=>v.events[0].type='turn.done',v=>v.tools[1].raw.voiceSessionId='neighbor',v=>v.tools[1].raw.requestId='other',
   v=>v.tools[1].raw.closeAfterPlayback=false,v=>v.tools.push(tool('tool.error',1300)),v=>v.events.push(delegation())]){
  const input=witness();mutate(input);assert.equal(resolveEndCallToolWitness(input),null);
 }
});
test('USER caption, partial or extended JSON is never a tool invocation',()=>{
 for(const text of ['帮我挂电话','{"name":"openclaw_end_call","arguments":',
   '{"name":"openclaw_end_call","arguments":{"voiceSessionId":"neighbor"}}',
   '{"name":"openclaw_end_call","arguments":{},"owner":"voice-1"}',
   '{"name":"other_tool","arguments":{}}']){
  const input=witness();input.events=[delegation(text)];assert.equal(resolveEndCallToolWitness(input),null);
 }
});
test('same request host SSE may arrive before native data-channel declaration without changing identity',()=>{
 const input=witness();input.after=800;input.tools=[tool('tool.call',900),tool('tool.result',950)];
 const proof=resolveEndCallToolWitness(input);assert(proof);assert.equal(proof.receiptClockOrder.SSEBeforeNativeFrame,true);
 assert.equal(proof.delegation.at,1000);assert.equal(proof.call.at,900);
 input.tools[1].raw.voiceSessionId='neighbor';assert.equal(resolveEndCallToolWitness(input),null);
});
test('complete keep and explicit hang-up USER turns remain distinct',()=>{
 const e=(text,at=2000)=>({pcIndex:0,at,type:'turn.done',role:'user',turnId:'user-1',text});
 assert(resolveLifecycleUserTurn([e('今天先聊到这里，不过先别挂，我还想问你一件事。')],{pcIndex:0,after:1000,intent:'keep'}));
 assert.equal(resolveLifecycleUserTurn([e('今天先聊到这里')],{pcIndex:0,after:1000,intent:'keep'}),null);
 assert(resolveLifecycleUserTurn([e('今天就先这样，你帮我把电话挂掉吧。')],{pcIndex:0,after:1000,intent:'end'}));
 assert.equal(resolveLifecycleUserTurn([e('今天先聊到这里，不过先别挂，我还想问你一件事。')],{pcIndex:0,after:1000,intent:'end'}),null);
});
test('farewell requires complete player state and post-terminal 750ms real RTP quiet',()=>{
 const state=speechState(),proof=assessLifecycleSpeech(state,{pcIndex:0,after:1200,requireCreatedAfter:true});assert(proof);
 assert(proof.window.to>proof.terminal.at);assert(proof.quiet.durationMs>=750);
 for(const mutate of [s=>s.audioFrames[3].paused=true,s=>s.audioFrames[4].volume=0,
   s=>s.audioFrames[5].contextState='suspended',s=>s.audioFrames[6].receiverAttachedToPlayback=false,
   s=>s.audioFrames=s.audioFrames.slice(0,-4),s=>s.audioFrames[21].rms=.02]){
  const input=speechState();mutate(input);assert.equal(assessLifecycleSpeech(input,{pcIndex:0,after:1200,requireCreatedAfter:true}),null);
 }
});
test('a required same-stream speech boundary cannot accept an earlier created turn',()=>{
 const state=speechState();state.events[0].at=1100;
 assert.equal(assessLifecycleSpeech(state,{pcIndex:0,after:1200,requireCreatedAfter:true}),null);
});
test('tail readiness retains strict quiet and cannot replace full caption/player validation',()=>{
 const state=speechState();assert.equal(hasLifecyclePlaybackTail(state,{pcIndex:0,after:1200}),true);
 for(const change of [s=>s.audioFrames=s.audioFrames.slice(0,-4),s=>s.audioFrames[21].rms=.02,
   s=>s.audioFrames=s.audioFrames.filter(f=>![1800,1850].includes(f.at)),s=>s.audioFrames[21].paused=true,
   s=>s.audioFrames=s.audioFrames.map(f=>({...f,rtp:[]}))]){
  const input=speechState();change(input);assert.equal(hasLifecyclePlaybackTail(input,{pcIndex:0,after:1200}),false);
 }
 state.events=state.events.filter(e=>e.type!=='output_transcript.added');
 assert.equal(hasLifecyclePlaybackTail(state,{pcIndex:0,after:1200}),true);
 assert.equal(assessLifecycleSpeech(state,{pcIndex:0,after:1200,requireCreatedAfter:true}),null);
});
test('input-start boundary preserves response prefix received before complete USER terminal',()=>{
 const state=speechState();state.events.push({pcIndex:0,at:1400,type:'turn.done',role:'user',turnId:'u',text:'今天先聊到这里，不过先别挂，我还想问你一件事。'});
 assert(resolveLifecycleUserTurn(state.events,{pcIndex:0,after:1200,intent:'keep'}));
 assert(assessLifecycleSpeech(state,{pcIndex:0,after:1200,requireCreatedAfter:true}));
 assert.equal(assessLifecycleSpeech(state,{pcIndex:0,after:1400,requireCreatedAfter:true}),null);
});
test('whole-speech sampling gaps remain strict FAIL while retaining actual functional speech and tail',()=>{
 const state=speechState();state.audioFrames=state.audioFrames.filter(f=>![1300,1350].includes(f.at));
 const proof=assessLifecycleSpeech(state,{pcIndex:0,after:1200,requireCreatedAfter:true});
 assert(proof);assert.equal(proof.strictCompletePlaybackPassed,false);assert.equal(proof.playback.passed,false);
 assert.equal(proof.playback.gaps.length,1);assert(proof.quiet.durationMs>=750);
});
test('proactive greeting requires silent original microphone and no USER/delegation',()=>{
 const state=speechState(),params={pcIndex:0,owner:{connectedAt:1200},readyAt:1200};
 assert.equal(assessProactiveGreeting(state,params).passed,true);
 state.micFrames[8].rms=.03;assert.equal(assessProactiveGreeting(state,params).passed,false);
 const input=speechState();input.events.push({pcIndex:0,at:1400,type:'turn.done',role:'user',turnId:'u',text:'你好'});
 assert.equal(assessProactiveGreeting(input,params).passed,false);
 const other=speechState();other.events.push({...delegation(),at:1400});assert.equal(assessProactiveGreeting(other,params).passed,false);
});
test('tool accepted alone does not mean closed; same owner must close after entire farewell drain',()=>{
 const state=speechState(),tool=resolveEndCallToolWitness(witness()),farewell=assessLifecycleFarewell(state,{pcIndex:0,tool,before:2350});
 const owner={voiceSessionId:'voice-1'};assert.equal(assessAutomaticEnd(state,{pcIndex:0,owner,tool,farewell}).passed,false);
 state.pcStates[0]='closed';state.remoteAudio.attached=false;state.api=[{route:'/api/close',status:200,requestedAt:2350,at:2400,request:{voiceSessionId:'voice-1'}}];
 assert.equal(assessAutomaticEnd(state,{pcIndex:0,owner,tool,farewell}).passed,true);
 state.api[0].requestedAt=2250;assert.equal(assessAutomaticEnd(state,{pcIndex:0,owner,tool,farewell}).passed,false);
 state.api[0].requestedAt=2350;state.api[0].request.voiceSessionId='neighbor';assert.equal(assessAutomaticEnd(state,{pcIndex:0,owner,tool,farewell}).passed,false);
});
test('farewell may be received before delayed host SSE, joined by the actual native request',()=>{
 const input=witness();input.tools[1].at=1700;
 const tool=resolveEndCallToolWitness(input),state=speechState();state.pcStates[0]='closed';state.remoteAudio.attached=false;
 state.api=[{route:'/api/close',status:200,requestedAt:2350,request:{voiceSessionId:'voice-1'}}];
 const farewell=assessLifecycleFarewell(state,{pcIndex:0,tool,before:2350});assert(farewell);assert(farewell.window.created.at<tool.result.at);
 assert.equal(assessAutomaticEnd(state,{pcIndex:0,owner:{voiceSessionId:'voice-1'},tool,farewell}).passed,true);
});
test('original app drain with a 700ms observer phase tail retains core but not strict750ms proof',()=>{
 const tool=resolveEndCallToolWitness(witness()),state=speechState();state.audioFrames.pop();state.duplex.transitions[0].at=1250;
 state.pcStates[0]='closed';state.remoteAudio.attached=false;state.api=[{route:'/api/close',status:200,requestedAt:2275,request:{voiceSessionId:'voice-1'}}];
 const farewell=assessLifecycleFarewell(state,{pcIndex:0,tool,before:2275});assert(farewell);assert.equal(farewell.strictTailPassed,false);
 const automatic=assessAutomaticEnd(state,{pcIndex:0,owner:{voiceSessionId:'voice-1'},tool,farewell});
 assert.equal(automatic.passed,true);assert.equal(automatic.strictTailPassed,false);assert.equal(farewell.quiet,null);
 for(const change of [s=>s.duplex.transitions[0].requestId='other',s=>s.duplex.transitions[0].turnId='old',
  s=>s.browserTimeOrigin=null,s=>s.audioFrames[4].paused=true]){
  const value=structuredClone(state);change(value);assert.equal(assessLifecycleFarewell(value,{pcIndex:0,tool,before:2275}),null);
 }
});

function toolsFixture() {
 const sessionKey='agent:makaron:explicit:gpt-live-h5-experiment-own',runId='talk-realtime-consult:actual-own',memoryQuery='某同事';
 const result=name=>name==='memory_search'?{results:[{snippet:'某同事负责项目设计。'}]}:{content:'OpenAI Realtime API official docs describe realtime audio.'};
 const event=(name,id,phase,ts)=>({event:'session.tool',at:ts+7000,payload:{runId,sessionKey,stream:'tool',ts,seq:ts,
  data:{phase,name,toolCallId:id,...(phase==='start'?{args:{query:name==='memory_search'?memoryQuery:'OpenAI Realtime API official docs'}}:
    {result:{content:[{type:'text',text:JSON.stringify(result(name))}]},isError:false})}}});
 const events=[event('memory_search','m1','start',200000),event('memory_search','m1','result',201000),
  event('web_search','w1','start',201100),event('web_search','w1','result',203000)];
 const history={messages:[{role:'assistant',timestamp:1,content:[
  {type:'toolCall',id:'m1',name:'memory_search',arguments:{query:memoryQuery}},
  {type:'toolCall',id:'w1',name:'web_search',arguments:{query:'OpenAI Realtime API official docs'}}]},
  ...['memory_search','web_search'].map((name,i)=>({role:'toolResult',toolCallId:i===0?'m1':'w1',toolName:name,timestamp:10+i,
    isError:false,content:[{type:'text',text:JSON.stringify(result(name))}]}))]};
 return {events,history,sessionKey,memoryQuery,after:199000};
}
test('Memory/Web tool chain uses actual native source clocks and current complete results',()=>{
 const f=toolsFixture(),p=resolveLifecycleMemoryWeb(f);assert(p);
 assert.equal(p.memoryResult.at,201000);assert.equal(p.web.calledAt,201100);
 assert.equal(p.memory.calledAt,200000);assert.equal(p.sequentialExecutionVerified,true);
 assert.equal(extractLifecycleToolPairs(f.history)[0].calledAt,1000,'Persisted generation clock is retained only as persisted evidence');
});
test('parallel, stale, foreign, empty, errored and missing native tool evidence cannot pass',()=>{
 const changes=[f=>f.events[2].payload.ts=200500,f=>f.after=202000,
  f=>f.events[3].payload.sessionKey='neighbor',f=>f.events[2].payload.runId='neighbor',
  f=>f.history.messages[1].content[0].text=JSON.stringify({results:[]}),
  f=>f.history.messages[2].isError=true,f=>f.events=[],
  f=>f.history.messages[2].content[0].text=JSON.stringify({status:'blocked',content:'OpenAI Realtime denied'})];
 for(const change of changes){const f=toolsFixture();change(f);assert.equal(resolveLifecycleMemoryWeb(f),null);}
});
test('Memory/Web input is a complete original USER request and exact consult owner is required',()=>{
 const f=toolsFixture(),chain=resolveLifecycleMemoryWeb(f);
 const user={pcIndex:0,at:199900,role:'user',type:'turn.done',turnId:'u-tools',text:'先用 memory search 查某同事，再用 web search 查 OpenAI Realtime API，不要写入，也不要发消息。'};
 assert(resolveLifecycleMemoryUser([user],{pcIndex:0,after:199000,memoryQuery:f.memoryQuery}));
 assert.equal(resolveLifecycleMemoryUser([{...user,text:'查某同事。'}],{pcIndex:0,after:199000,memoryQuery:f.memoryQuery}),null);
 const state={events:[{pcIndex:0,at:200000,type:'delegation.created',raw:{item:{id:'native-owner',target:'client',user_bidi_turn_id:'u-tools'}}}],
  tools:[{at:200050,raw:{voiceSessionId:'voice-own',callId:chain.runId,type:'tool.call'}},
    {at:204000,raw:{voiceSessionId:'voice-own',callId:chain.runId,type:'tool.result'}}]};
 const params={pcIndex:0,voiceSessionId:'voice-own',userTurnId:'u-tools',toolChain:chain,after:199000};
 assert(resolveLifecycleConsultResult(state,params));
 for(const mutate of [s=>s.tools[1].raw.voiceSessionId='neighbor',s=>s.tools[1].raw.callId='other',
  s=>s.events[0].raw.item.user_bidi_turn_id='other',s=>s.tools.push({at:204001,raw:{voiceSessionId:'voice-own',callId:chain.runId,type:'tool.error'}})]){
  const input=structuredClone(state);mutate(input);assert.equal(resolveLifecycleConsultResult(input,params),null);
 }
});
