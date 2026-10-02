import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCompleteTimestamps,assessFinalTimestamp,assessEarlyProgress} from './gpt-live-call-live-evidence.mjs';

test('real GNU date English output preserves month, AM/PM and all six fields',()=>{
  assert.deepEqual(parseCompleteTimestamps('Fri Oct  2 08:58:48 PM CST 2026'),[{year:2026,month:10,day:2,hour:20,minute:58,second:48}]);
  assert.deepEqual(parseCompleteTimestamps('Fri Oct  2 20:58:48 CST 2026'),[{year:2026,month:10,day:2,hour:20,minute:58,second:48}]);
  assert.deepEqual(parseCompleteTimestamps('Fri Oct  2 12:00:00 AM CST 2026'),[{year:2026,month:10,day:2,hour:0,minute:0,second:0}]);
  assert.deepEqual(parseCompleteTimestamps('Fri Oct  2 12:00:00 PM CST 2026'),[{year:2026,month:10,day:2,hour:12,minute:0,second:0}]);
  assert.deepEqual(parseCompleteTimestamps('Fri Feb  30 20:58:48 CST 2026'),[]);
  assert.deepEqual(parseCompleteTimestamps('Fri Oct  2 13:58:48 PM CST 2026'),[]);
});

test('Arabic backend and mixed spoken timestamp preserve all six fields',()=>{
  const expected={year:2026,month:10,day:2,hour:13,minute:58,second:9};
  assert.deepEqual(parseCompleteTimestamps('2026-10-02 13:58:09 CST'),[expected]);
  assert.deepEqual(parseCompleteTimestamps('2026年10月2日13点58分09秒'),[expected]);
});
test('Chinese numbers and afternoon conversion remain numeric, not text matching',()=>{
  assert.deepEqual(parseCompleteTimestamps('二〇二六年十月二日下午一点二十六分十五秒'),[{year:2026,month:10,day:2,hour:13,minute:26,second:15}]);
});
test('partial or invalid timestamp requires manual checking',()=>{
  assert.deepEqual(parseCompleteTimestamps('2026年10月2日下午一点二十六分'),[]);
  assert.deepEqual(parseCompleteTimestamps('2026-02-30 13:26:15'),[]);
  assert.equal(assessFinalTimestamp([{phase:'final',at:50,text:'2026-10-02 13:26:15'}],[{type:'turn.done',role:'assistant',at:60,text:'下午一点多'}]).status,'manual-required');
});
test('a changed spoken date fails numeric fidelity',()=>{
  const value=assessFinalTimestamp([{phase:'final',at:50,text:'2026-10-02 14:22:15'}],[{type:'turn.done',role:'assistant',at:60,text:'2025年12月31日下午一点二十六分十五秒'}]);
  assert.equal(value.status,'mismatch');
});
test('progress prefix can precede final while the same assistant turn completes later',()=>{
  const traces=[{phase:'progress',at:10},{phase:'final',at:50}];
  const events=[
    {type:'output_transcript.added',at:20,startMs:100,endMs:120,text:'后台说现在开始'},
    {type:'output_transcript.added',at:25,startMs:120,endMs:140,text:'执行等待测试。'},
    {type:'turn.done',role:'assistant',at:70,startMs:100,endMs:300,text:'后台说现在开始执行等待测试。最终结果。'},
  ];
  const result=assessEarlyProgress(traces,events,[{at:23,rms:4}]);
  assert.equal(result.status,'observed');assert.equal(result.progressTranscriptAt,25);assert.equal(result.assistantTurnAt,70);
});
test('ordinary acknowledgment or voice after final cannot prove early progress',()=>{
  const traces=[{phase:'progress',at:10},{phase:'final',at:50}];
  const events=[{type:'output_transcript.added',at:20,startMs:100,endMs:120,text:'我这就交给后台处理。'},
    {type:'turn.done',role:'assistant',at:40,startMs:100,endMs:200,text:'我这就交给后台处理。'}];
  assert.equal(assessEarlyProgress(traces,events,[{at:60,rms:4}]).status,'missing');
  const explicit=events.map(x=>({...x,text:'后台说现在开始执行等待测试。'}));
  assert.equal(assessEarlyProgress(traces,explicit,[{at:60,rms:4}]).status,'transcript-only');
});
