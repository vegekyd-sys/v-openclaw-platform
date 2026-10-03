import test from 'node:test';
import assert from 'node:assert/strict';
import {indexNativeToolPairs,mergeExactToolBodies,extractExecDateFromPairs,continuousPlaybackQuiet,explicitSpokenOffsets} from './evidence.mjs';

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
