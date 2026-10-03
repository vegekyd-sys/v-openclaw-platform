import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {indexNativeToolPairs,mergeExactToolBodies,mergeSessionToolEvidence,selectCommandLocalTimestamp,extractExecDateFromPairs,continuousPlaybackQuiet,explicitSpokenOffsets,resolveNativeControlOwner,resolveCanonicalFinalTrace,toolResultSucceeded,isExactTwoPlusTwoReply,nativeCountRequestsEighty,assessIndependentInputConvergence,matchesConsumedConditionBatch,extractQueuedConditionResume} from './evidence.mjs';
import {assessControlExecPending} from '../gpt-live-h5-control-evidence.mjs';

test('actual child envelopes keep source and observer clocks and exact identity',()=>{
  const event=(phase,ts,at,extra={})=>({event:'session.tool',at,payload:{runId:'child',sessionKey:'key',stream:'tool',ts,seq:ts,data:{phase,name:'exec',toolCallId:'id',...extra}}});
  const rows=indexNativeToolPairs([event('start',1000,1040,{args:{command:'sleep 45; date'}}),
    event('result',46000,46100,{isError:false,result:{content:[{type:'text',text:'2026-10-03 12:51:52 CST +0800'}],details:{status:'completed'}}})],{runId:'child',sessionKey:'key'});
  assert.equal(rows[0].calledAt,1000);assert.equal(rows[0].results[0].observedAt,46100);
  assert.equal(rows[0].results[0].at,46000);assert.equal(extractExecDateFromPairs(rows).offsetMinutes,480);
  assert.equal(indexNativeToolPairs(rows[0].rawEnvelopes,{runId:'other'}).length,0);
});
test('complete persisted bodies cannot replace native execution clocks or another child',()=>{
  const native=[{id:'a',name:'exec',runId:'one',sessionKey:'k',calledAt:1000,args:{command:'pwd'},results:[{at:1200,observedAt:1500,isError:false,text:'redacted',details:{status:'completed'}}]}];
  const full={id:'a',name:'exec',runId:'one',sessionKey:'k',calledAt:1800,args:{command:'pwd'},source:'SQLite',results:[{at:2000,isError:false,text:'/private',details:{status:'completed'}}]};
  const rows=mergeExactToolBodies(native,[full,{...full,runId:'two'}]);
  assert.equal(rows[0].calledAt,1000);assert.equal(rows[0].results[0].at,1200);assert.equal(rows[0].results[0].observedAt,1500);
  assert.equal(rows[0].results[0].text,'/private');assert.equal(rows[1].calledAt,null);assert.equal(rows[1].sourceExecutionTimingVerified,false);
});
test('final drain requires actual unmuted attached continuous tail; no filtered gaps',()=>{
  const frames=Array.from({length:17},(_,i)=>({pcIndex:0,at:1000+i*50,rms:.001,muted:false,paused:false,contextState:'running',receiverAttachedToPlayback:true,trackState:'live',connected:'connected',rtp:[{packetsReceived:i}]}));
  const assess=rows=>continuousPlaybackQuiet(rows,{pcIndex:0,after:1000,durationMs:750});
  assert.equal(assess(frames).durationMs,800);
  for(const bad of [{muted:true},{paused:true},{receiverAttachedToPlayback:false},{rms:.006}])assert.equal(assess(frames.map((f,i)=>i===10?{...f,...bad}:f)),null);
  assert.equal(assess(frames.filter((_,i)=>i<5||i>10)),null);
});
test('explicit spoken timezone is checked independently; CST alone is ambiguous',()=>{
  assert.deepEqual(explicitSpokenOffsets('CST，加零八零零'),[480]);
  assert.deepEqual(explicitSpokenOffsets('CST'),[]);
  assert.deepEqual(explicitSpokenOffsets('UTC，负零五三零'),[-330]);
});

test('same child split wait and date requires actual successful clocks and actor identity',()=>{
  const pair=(id,command,calledAt,at,text)=>({id,name:'exec',runId:'child',sessionKey:'child-key',sourceExecutionTimingVerified:true,
    calledAt,args:{command},results:[{at,isError:false,text,details:{status:'completed',exitCode:0}}]});
  const wait=pair('wait','sleep 45; echo wait-done',1000,46016,'wait-done');
  const date=pair('date','date +"%Y-%m-%d %H:%M:%S %Z %z"',46200,46300,'2026-10-03 14:05:12 CST +0800');
  const proof=extractExecDateFromPairs([wait,date]);
  assert.equal(proof.waitExecCallId,'wait');assert.equal(proof.execCallId,'date');assert.equal(proof.waitDurationMs,45016);assert.equal(proof.combinedCommand,false);
  for(const bad of [{runId:'other'},{sessionKey:'other'},{calledAt:45000},{sourceExecutionTimingVerified:false},{calledAt:null}])
    assert.equal(extractExecDateFromPairs([wait,{...date,...bad}]),null);
  for(const bad of [{at:45999},{at:null},{isError:true},{details:{status:'failed',exitCode:1}},{details:{status:'completed',exitCode:1}},{text:'{"status":"error"}'}])
    assert.equal(extractExecDateFromPairs([{...wait,results:[{...wait.results[0],...bad}]},date]),null);
  assert.equal(extractExecDateFromPairs([{...date,calledAt:1000,args:{command:'date; sleep 45'},results:[{...date.results[0],at:46016}]}]),null);
});

test('linked process completion cannot borrow a date from another actor',()=>{
  const exec={id:'exec',name:'exec',runId:'child',sessionKey:'child-key',sourceExecutionTimingVerified:true,
    calledAt:1000,args:{command:'sleep 45; date'},results:[{at:2000,isError:false,text:'still running',details:{status:'running',sessionId:'process1'}}]};
  const process={id:'poll',name:'process',runId:'other',sessionKey:'child-key',sourceExecutionTimingVerified:true,
    calledAt:46000,args:{sessionId:'process1'},results:[{at:47000,isError:false,text:'2026-10-03 14:05:12 CST +0800',details:{status:'completed'}}]};
  assert.equal(extractExecDateFromPairs([exec,process]),null);
  assert.equal(extractExecDateFromPairs([exec,{...process,runId:'child'}]).resultCallId,'poll');
});

test('standalone sleep is pending evidence only when explicitly requested by the caller',()=>{
  const call={type:'toolCall',id:'wait',name:'exec',arguments:{command:'sleep 60'}};
  const history={messages:[{role:'assistant',content:[call]}]};
  assert.equal(assessControlExecPending(history,60).pending,false);
  assert.equal(assessControlExecPending(history,60,{requireDateInCommand:false}).pending,true);
  history.messages.push({role:'toolResult',toolCallId:'wait',content:[{type:'text',text:'wait-done'}],details:{status:'completed'}});
  assert.equal(assessControlExecPending(history,60,{requireDateInCommand:false}).pending,false);
});

test('control owner joins real callback hash with distinct native and H5 identifiers',()=>{
  const backendRunId='talk-realtime-consult:123:full-id',voiceSessionId='voice',nativeItem='item_native';
  const hash=createHash('sha256').update(backendRunId).digest('hex');
  const diagnostic={stage:'backend-run-started',at:110,traceId:'trace',delegationId:nativeItem,generation:1,
    sourceRunIdSha256:hash,provenance:{runId:'redacted'}};
  const input={backendRunId,voiceSessionId,diagnostics:[diagnostic],events:[{pcIndex:0,type:'delegation.created',raw:{item:{id:nativeItem}}}],
    tools:[{at:100,raw:{type:'tool.call',callId:backendRunId,voiceSessionId}}]};
  const proof=resolveNativeControlOwner(input);assert.equal(proof.bridgeCallId,backendRunId);assert.equal(proof.delegationId,nativeItem);
  assert.equal(resolveNativeControlOwner({...input,backendRunId:'other'}),null);
  assert.equal(resolveNativeControlOwner({...input,voiceSessionId:'other'}),null);
  assert.equal(resolveNativeControlOwner({...input,events:[]}),null);
  assert.equal(resolveNativeControlOwner({...input,diagnostics:[{...diagnostic,sourceRunIdSha256:null,provenance:{sourceRunIdSha256:hash}}]}),null);
  assert.equal(resolveNativeControlOwner({...input,diagnostics:[{...diagnostic,stage:'backend-cancel-accepted'}]}),null);
  assert.equal(resolveNativeControlOwner({...input,diagnostics:[diagnostic,{...diagnostic,generation:2}]}),null);
});

test('tool transport success cannot hide a structured spawn or yield failure',()=>{
  for(const body of [{status:'error'},{status:'failed'},{error:'No pending child completion'},{isError:true}])
    assert.equal(toolResultSucceeded({isError:false,text:JSON.stringify(body)}),false);
  assert.equal(toolResultSucceeded({isError:true,text:'{"status":"yielded"}'}),false);
  assert.equal(toolResultSucceeded({isError:false,text:'{"status":"accepted","runId":"child"}'}),true);
});

test('actual native math sentence can include a follow-up without accepting uncertainty or counting',()=>{
  for(const text of ['四。你要我顺便把数数也开始吗?','二加二等于四。','答案是4。','四',
    '会告诉你结果。好的,我停下不数了,后台任务会继续跑。四。'])
    assert.equal(isExactTwoPlusTwoReply(text),true,text);
  for(const text of ['不是四。','可能四。','四？','一、二、三、四。','四、五、六。','一。二。三。四。',
    '四。不是四，刚才错了。','四。可能不对。','四。还是五？','四。答案是五。','四。其实是五。','先停下。二加二不等于四。'])
    assert.equal(isExactTwoPlusTwoReply(text),false,text);
});

test('parent body joins preserve actual result-before-web clocks, not generation timestamps',()=>{
  const event=(id,name,phase,ts,extra={})=>({event:'session.tool',at:ts+50,
    payload:{runId:'parent-run',sessionKey:'parent-key',stream:'tool',ts,seq:ts,data:{toolCallId:id,name,phase,...extra}}});
  const events=[event('memory','memory_search','start',1000,{args:{query:'Example'}}),
    event('memory','memory_search','result',2000,{isError:false,result:{content:[{type:'text',text:'redacted'}]}}),
    event('web','web_search','start',2500,{args:{query:'Official docs'}}),
    event('web','web_search','result',3000,{isError:false,result:{content:[{type:'text',text:'redacted'}]}})];
  const body=(id,name,calledAt,resultAt,text)=>({id,name,calledAt,args:{query:'Original complete query'},
    results:[{at:resultAt,isError:false,text}]});
  const pairs=mergeSessionToolEvidence(events,[body('memory','memory_search',500,3500,'Original memory result'),
    body('web','web_search',500,3600,'Original official source result')],'parent-key');
  assert.equal(pairs.length,2);assert.equal(pairs[0].results[0].text,'Original memory result');
  assert.equal(pairs[0].results[0].at,2000);assert.equal(pairs[1].calledAt,2500);
  assert.equal(pairs[0].results[0].persistedAt,3500);assert.equal(pairs[1].sourceExecutionTimingVerified,true);
  const missing=mergeSessionToolEvidence([], [body('memory','memory_search',500,3500,'Original memory result')],'parent-key');
  assert.equal(missing[0].calledAt,null);assert.equal(missing[0].results[0].at,null);assert.equal(missing[0].sourceExecutionTimingVerified,false);
  const neighbor=events.map(e=>({...e,payload:{...e.payload,runId:'neighbor'}}));
  const ambiguous=mergeSessionToolEvidence([...events,...neighbor],[body('memory','memory_search',500,3500,'Must not bind')],'parent-key');
  assert.equal(ambiguous.find(p=>p.runId===null).sourceExecutionTimingVerified,false);
});

test('the designated same-child local date is selected from multi-clock command output',()=>{
  const output='Sat Oct 3 18:40:35 CST 2026\n---\n2026-10-03 18:40:35 CST +0800\n---\n'+
    'Local time: Sat 2026-10-03 18:40:35 CST\nUniversal time: Sat 2026-10-03 10:40:35 UTC\nRTC time: Sat 2026-10-03 10:40:36';
  const selected=selectCommandLocalTimestamp(output);
  assert.equal(selected.fields.hour,18);assert.equal(selected.offsetMinutes,480);
  assert.equal(selected.originalLine,'2026-10-03 18:40:35 CST +0800');
  assert.equal(selectCommandLocalTimestamp(output+'\n2026-10-03 18:40:36 CST +0800'),null);
  const wait={id:'wait',name:'exec',runId:'child',sessionKey:'child-key',sourceExecutionTimingVerified:true,
    calledAt:1000,args:{command:'sleep 75; echo done'},results:[{at:76001,isError:false,text:'done',details:{status:'completed',exitCode:0}}]};
  const date={id:'date',name:'exec',runId:'child',sessionKey:'child-key',sourceExecutionTimingVerified:true,
    calledAt:76200,args:{command:'date; date +"%Y-%m-%d %H:%M:%S %Z %z"; timedatectl'},
    results:[{at:76300,isError:false,text:output,details:{status:'completed',exitCode:0}}]};
  const proof=extractExecDateFromPairs([wait,date],75);
  assert.equal(proof.execCallId,'date');assert.equal(proof.selectedDateOutputLine,selected.originalLine);
  assert.equal(extractExecDateFromPairs([wait,{...date,runId:'parent'}],75),null);
});

test('canonical final joins the actual terminal callback and every chunk to the same native owner',()=>{
  const initial='a'.repeat(64),resume='b'.repeat(64),owner={traceId:'trace',delegationId:'native-item',generation:2,sourceRunIdSha256:initial};
  const base={traceId:owner.traceId,delegationId:owner.delegationId,generation:owner.generation,sourceRunIdSha256:resume};
  const provenance={source:'canonical_final',role:'resume'};
  const started={...base,stage:'backend-run-started',at:100};
  const received={...base,stage:'backend-final-received',kind:'final',at:200,ownerRunIdSha256:initial,provenance,textSha256:'c'.repeat(64)};
  const chunk={...base,stage:'context-append-sent',kind:'final',at:220,ownerRunIdSha256:initial,provenance,appendId:'append',chunkCount:2,chunkIndex:0,role:'final_part'};
  const final={...chunk,at:230,chunkIndex:1,role:'final_complete'};
  const rows=[started,received,chunk,final];
  assert.equal(resolveCanonicalFinalTrace(rows,owner,resume).received,received);
  for(const changed of [{sourceRunIdSha256:null,provenance:{...provenance,sourceRunIdSha256:resume}},
    {ownerRunIdSha256:'d'.repeat(64)},{generation:3},{provenance:{source:'commentary'}},{at:null}])
    assert.equal(resolveCanonicalFinalTrace([started,{...received,...changed},chunk,final],owner),null);
  assert.equal(resolveCanonicalFinalTrace([received,chunk,final],owner),null);
  assert.equal(resolveCanonicalFinalTrace([started,received,final],owner),null);
  assert.equal(resolveCanonicalFinalTrace([started,received,{...chunk,chunkIndex:3},final],owner),null);
  assert.equal(resolveCanonicalFinalTrace(rows,owner,'d'.repeat(64)),null);
});

test('independent PCM inputs wait for native completion after actual speech, not a fixed pause',()=>{
  const input={startedAt:1000,completedAt:2000,exitCode:0};
  const events=[{pcIndex:0,type:'turn.done',role:'user',turnId:'first',at:2100}];
  const micFrames=Array.from({length:8},(_,i)=>({pcIndex:0,at:2000+i*50,rms:.001,trackState:'live',trackEnabled:true,trackId:'mic',senderTrackId:'mic'}));
  const params={input,events,micFrames,lastSpeechAt:1900,observedAt:2370};
  assert.equal(assessIndependentInputConvergence(params).turnId,'first');
  assert.equal(assessIndependentInputConvergence({...params,input:{...input,completedAt:null}}),null);
  assert.equal(assessIndependentInputConvergence({...params,events:[]}),null);
  assert.equal(assessIndependentInputConvergence({...params,events:[{...events[0],at:1800}]}),null);
  assert.equal(assessIndependentInputConvergence({...params,events:[...events,{pcIndex:0,type:'input_transcript.added',at:2150,text:'remaining tail'}]}),null);
  assert.equal(assessIndependentInputConvergence({...params,events:[...events,{pcIndex:0,type:'turn.created',role:'user',turnId:'tail',at:2150}]}),null);
  assert.equal(assessIndependentInputConvergence({...params,observedAt:2600}),null);
  for(const changed of [{rms:.01},{trackEnabled:false},{senderTrackId:null}])
    assert.equal(assessIndependentInputConvergence({...params,micFrames:micFrames.map((frame,i)=>i===4?{...frame,...changed}:frame)}),null);
  assert.equal(assessIndependentInputConvergence({...params,micFrames:micFrames.filter((_,i)=>i<3||i>5)}),null);
});

test('truncated count proof first requires the native user to request eighty, never ten',()=>{
  for(const text of ['后台继续做，别取消。先慢慢从一数到八十，中间不要停。','从1数到80','现在请直接慢慢数数。从一开始，数到八十。目标是八十，不是十。','从 一 开始， 数 到 八十'])
    assert.equal(nativeCountRequestsEighty(text),true,text);
  for(const text of ['别 取消,先 从 一数 到十','从一数到十','数到八十','从一数到八十一','从1数到800'])
    assert.equal(nativeCountRequestsEighty(text),false,text);
});

test('a new seventy-five-second case cannot borrow forty-five seconds or another actor',()=>{
  const wait={id:'wait',name:'exec',runId:'child',sessionKey:'child-key',sourceExecutionTimingVerified:true,calledAt:1000,
    args:{command:'sleep 75'},results:[{at:76001,isError:false,text:'wait completed',details:{status:'completed',exitCode:0}}]};
  const date={id:'date',name:'exec',runId:'child',sessionKey:'child-key',sourceExecutionTimingVerified:true,calledAt:76200,
    args:{command:'date +"%Y-%m-%d %H:%M:%S %Z %z"'},results:[{at:76300,isError:false,text:'2026-10-03 18:05:12 CST +0800',details:{status:'completed',exitCode:0}}]};
  assert.equal(extractExecDateFromPairs([wait,date],75).waitDurationMs,75001);
  assert.equal(extractExecDateFromPairs([{...wait,args:{command:'sleep 45'}},date],75),null);
  assert.equal(extractExecDateFromPairs([{...wait,results:[{...wait.results[0],at:75000}]},date],75),null);
  assert.equal(extractExecDateFromPairs([wait,{...date,runId:'parent'}],75),null);
});

test('retained steering is consumed only by the exact accepted owner and ordered original condition batch',()=>{
  const texts=['Use one sentence.','Finish with the test marker.'],owner={traceId:'trace',delegationId:'native-item',generation:3},source='a'.repeat(64);
  const event={...owner,stage:'backend-steering-consumed',sourceRunIdSha256:source,steeringConsumed:{sequence:2,count:2,textSha256:createHash('sha256').update(JSON.stringify(texts)).digest('hex')}};
  assert.equal(matchesConsumedConditionBatch(event,texts,owner,source),true);
  for(const changed of [{stage:'backend-run-started'},{stage:'backend-cancel-accepted'},{generation:4},{sourceRunIdSha256:'b'.repeat(64)},{steeringConsumed:{...event.steeringConsumed,count:1}},{steeringConsumed:{...event.steeringConsumed,sequence:1}},{steeringConsumed:{...event.steeringConsumed,textSha256:createHash('sha256').update(texts.join('')).digest('hex')}}])
    assert.equal(matchesConsumedConditionBatch({...event,...changed},texts,owner,source),false);
  assert.equal(matchesConsumedConditionBatch(event,[...texts].reverse(),owner,source),false);
});

test('a typed user message cannot stand in for the original child-completion resume input',()=>{
  const text='Use the requested output marker.',input={sequence:1,mode:'steer',text,receivedAt:1000};
  const batch={sequence:1,count:1,textSha256:createHash('sha256').update(JSON.stringify([text])).digest('hex')},child='Actual child completion date: 2026-10-03 18:05:12 CST +0800';
  const resume=child+'\n\nAdditional user conditions for this same authorized voice task (not child results).\nApply these in sequence; a later correction takes priority.\n'+JSON.stringify(input);
  assert.deepEqual(extractQueuedConditionResume(resume,batch,child).inputs,[input]);
  assert.equal(extractQueuedConditionResume(text,batch,child),null);
  assert.equal(extractQueuedConditionResume(resume,batch,'Neighbor child completion'),null);
  assert.equal(extractQueuedConditionResume(resume,{...batch,count:2},child),null);
  assert.equal(extractQueuedConditionResume(resume.replace(text,'Changed condition'),batch,child),null);
});
