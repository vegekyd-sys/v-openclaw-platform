import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {indexNativeToolPairs,mergeExactToolBodies,extractExecDateFromPairs,continuousPlaybackQuiet,explicitSpokenOffsets,resolveNativeControlOwner,toolResultSucceeded} from './evidence.mjs';
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
