import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {indexNativeToolPairs} from './evidence.mjs';
import {confirmationArgsFingerprint,isOriginalControlSleep60,resolveControlExecConfirmationChallenge,
  resolveConfirmationUserTurn,resolveConfirmedControlExec,findDurableConfirmationUserMessage,
  parseVoiceConfirmationDiagnostics,assessControlConfirmationCoreReceipt} from './confirmation-evidence.mjs';

const hash=s=>createHash('sha256').update(s).digest('hex');
function fixture() {
  const args={command:'sleep 60; date +"%Y-%m-%d %H:%M:%S %Z %z"',yieldMs:1000,background:true};
  const event=(phase,ts,data)=>({event:'session.tool',at:ts+5,payload:{runId:'initial-run',sessionKey:'key',stream:'tool',ts,
    data:{phase,name:'exec',toolCallId:'initial-call',...data}}});
  const events=[event('start',1000,{args}),event('result',1010,{isError:true,result:{details:{status:'blocked',
    deniedReason:'client-voice-confirmation',reason:'VOICE_CONFIRMATION_REQUIRED:12345678-1234-1234-1234-123456789abc Action was not executed.'}}})];
  const options={sessionKey:'key',voiceSessionId:'voice',pcIndex:0,initialInput:{startedAt:500,completedAt:900,exitCode:0},
    diagnostics:[{stage:'backend-run-started',sourceRunIdSha256:hash('initial-run'),traceId:'trace',delegationId:'item',generation:1,at:950}],
    events:[{pcIndex:0,type:'delegation.created',raw:{item:{id:'item'}}}],
    tools:[{at:940,raw:{type:'tool.call',callId:'initial-run',voiceSessionId:'voice'}}]};
  return {events,pairs:indexNativeToolPairs(events),options,args};
}
test('confirmation playback requires exact actual exec60 challenge and bound native owner',()=>{
  const f=fixture(),challenge=resolveControlExecConfirmationChallenge(f.pairs,f.options);assert.equal(challenge.confirmationId,'12345678-1234-1234-1234-123456789abc');
  for(const change of [{alreadyAttempted:true},{sessionKey:'neighbor'},{voiceSessionId:'neighbor'},{diagnostics:[]},{events:[]},
    {initialInput:{startedAt:500,completedAt:900,exitCode:1}}])assert.equal(resolveControlExecConfirmationChallenge(f.pairs,{...f.options,...change}),null);
  for(const change of [{sourceExecutionTimingVerified:false},{runId:'neighbor'},{calledAt:null},{args:{command:'echo "sleep 60"'}}])
    assert.equal(resolveControlExecConfirmationChallenge([{...f.pairs[0],...change}],f.options),null);
  assert.equal(resolveControlExecConfirmationChallenge([...f.pairs,f.pairs[0]],f.options),null,'an ambiguous challenge is not approved');
});
test('blocked metadata cannot be borrowed from another result or a generic error',()=>{
  const f=fixture();for(const details of [{status:'failed',deniedReason:'client-voice-confirmation'},
    {status:'blocked',deniedReason:'permissions'},
    {status:'blocked',deniedReason:'client-voice-confirmation',reason:'VOICE_CONFIRMATION_REQUIRED:not-a-uuid'},
    {status:'blocked',deniedReason:'client-voice-confirmation',reason:'No challenge'}]){
    const altered=structuredClone(f.events);altered[1].payload.data.result.details=details;
    assert.equal(resolveControlExecConfirmationChallenge(indexNativeToolPairs(altered),f.options),null);
  }
  const altered=structuredClone(f.events);altered[1].payload.runId='neighbor';
  assert.equal(resolveControlExecConfirmationChallenge(indexNativeToolPairs(altered),f.options),null);
});
test('fixture matcher excludes quoted commands, a different wait and extra actions',()=>{
  for(const command of ['sleep 60','sleep 60; date','sleep 60 && date +"%Y-%m-%d %H:%M:%S %Z %z"'])assert.equal(isOriginalControlSleep60(command),true);
  for(const command of ['echo sleep 60','sleep 600','sleep 45; date','date; sleep 60','sleep 60; rm file','sleep 60; date; echo x'])assert.equal(isOriginalControlSleep60(command),false);
});
test('only one complete original USER confirmation after challenge qualifies',()=>{
  const f=fixture(),challenge=resolveControlExecConfirmationChallenge(f.pairs,f.options),input={startedAt:1200,completedAt:1800,exitCode:0};
  const turn={pcIndex:0,type:'turn.done',role:'user',turnId:'confirm-user',at:1900,text:'确认执行。'};
  assert.equal(resolveConfirmationUserTurn([turn],{pcIndex:0,input,challenge}),turn);
  for(const change of [{role:'assistant'},{pcIndex:1},{type:'output_transcript.added'},{at:1000},{text:'好的'},{text:'不确认执行'},{text:'他说确认执行'},{text:'确认执行吗'}])
    assert.equal(resolveConfirmationUserTurn([{...turn,...change}],{pcIndex:0,input,challenge}),null);
  assert.equal(resolveConfirmationUserTurn([turn,{...turn,turnId:'duplicate'}],{pcIndex:0,input,challenge}),null);
});
test('new run binding and unchanged parameters are independent of approval utterance',()=>{
  const f=fixture(),challenge=resolveControlExecConfirmationChallenge(f.pairs,f.options),input={startedAt:1200,completedAt:1800,exitCode:0};
  const userTurn={pcIndex:0,type:'turn.done',role:'user',turnId:'confirm-user',at:1900,text:'确认执行。'};
  const owner={voiceSessionId:'voice',backendRunId:'new-run',sourceRunIdSha256:hash('new-run'),delegationId:'new-item'};
  const envelope={event:'session.tool',at:2010,payload:{runId:'new-run',sessionKey:'key',stream:'tool',ts:2000,data:{phase:'start',name:'exec',toolCallId:'new-call',args:f.args}}};
  const pairs=indexNativeToolPairs([envelope]);assert.equal(resolveConfirmedControlExec(pairs,{challenge,userTurn,owner,input}),pairs[0]);
  for(const change of [{voiceSessionId:'neighbor'},{backendRunId:'initial-run'},{delegationId:'item'}])
    assert.equal(resolveConfirmedControlExec(pairs,{challenge,userTurn,owner:{...owner,...change},input}),null);
  assert.equal(resolveConfirmedControlExec([{...pairs[0],args:{...f.args,yieldMs:500}}],{challenge,userTurn,owner,input}),null);
  assert.equal(confirmationArgsFingerprint({...f.args}),confirmationArgsFingerprint({background:true,yieldMs:1000,command:f.args.command}));
});
test('a durable USER message needs exact private canonical identity and complete utterance',()=>{
  const userTurn={text:'确认执行。'},input={startedAt:1200},row={createdAt:1900,event:{message:{role:'user',content:'确认执行。'}}};
  const transcript={source:'private-sqlite-active-transcript',queryOnly:true,canonicalSessionKey:'key',rawEvents:[row]};
  assert.equal(findDurableConfirmationUserMessage(transcript,{sessionKey:'key',userTurn,input}),row);
  for(const change of [{source:'chat.history'},{canonicalSessionKey:'neighbor'},{queryOnly:false}])
    assert.equal(findDurableConfirmationUserMessage({...transcript,...change},{sessionKey:'key',userTurn,input}),null);
  for(const bad of [{...row,createdAt:NaN},{...row,createdAt:1000},
    {...row,event:{message:{role:'assistant',content:'确认执行。'}}},
    {...row,event:{message:{role:'user',content:'Quoted condition: 确认执行。'}}}])
    assert.equal(findDurableConfirmationUserMessage({...transcript,rawEvents:[bad]},{sessionKey:'key',userTurn,input}),null);
});

function coreFixture() {
  const f=fixture(),challenge=resolveControlExecConfirmationChallenge(f.pairs,f.options);
  const input={startedAt:1200,completedAt:1800,exitCode:0};
  const userTurn={pcIndex:0,type:'turn.done',role:'user',turnId:'confirmation',at:1900,text:'确认执行。'};
  const owner={voiceSessionId:'voice',backendRunId:'new-run',sourceRunIdSha256:hash('new-run'),delegationId:'new-item'};
  const raw={event:'session.tool',at:2010,payload:{runId:'new-run',sessionKey:'key',stream:'tool',ts:2000,
    data:{phase:'start',name:'exec',toolCallId:'new-call',args:f.args}}};
  const execPair=indexNativeToolPairs([raw])[0];
  const common={scopeSha256:hash('actual-core-scope'),fingerprint:'actual-core-policy-fingerprint'};
  const events=[{stage:'eligible',at:1960,...common,confirmationId:challenge.confirmationId,pendingCreatedAt:1005,
    durableUserObservedAt:1880,userTextSha256:hash('确认执行。'),callerInputAcceptedAt:1950},
   {stage:'bind',at:1980,...common,confirmationId:challenge.confirmationId,runId:'new-run',runIdSha256:hash('new-run')},
   {stage:'consume',at:2001,...common,runId:'new-run',runIdSha256:hash('new-run')}];
  const parse=events=>parseVoiceConfirmationDiagnostics(events.map(event=>'GPT_LIVE_VOICE_CONFIRMATION '+JSON.stringify(event)).join('\n'));
  return {events,parse,options:{challenge,userTurn,input,owner,execPair,
    durableUserMessage:{createdAt:1880,event:{message:{role:'user',content:'确认执行。'}}}}};
}
test('only the actual core trace prefix supplies confirmation stage receipts',()=>{
  const f=coreFixture();assert.equal(f.parse(f.events).length,3);
  assert.equal(parseVoiceConfirmationDiagnostics(JSON.stringify(f.events[0])).length,0);
  assert.equal(parseVoiceConfirmationDiagnostics('assistant: GPT_LIVE_VOICE_CONFIRMATION '+JSON.stringify(f.events[0])).length,0);
  assert.equal(parseVoiceConfirmationDiagnostics('GPT_LIVE_VOICE_CONFIRMATION {invalid').length,0);
});
test('core approval requires exact eligible, bind and consume with new run and source clocks',()=>{
  const f=coreFixture(),assess=events=>assessControlConfirmationCoreReceipt(f.parse(events),f.options);
  const complete=assess(f.events);assert.equal(complete.identityValid,true);assert.equal(complete.rawUserTextHashVerified,true);
  for(const events of [f.events.slice(0,1),f.events.slice(0,2),f.events.slice(1),[...f.events,f.events[2]]])
    assert.equal(assess(events).identityValid,false,'an ACK or ambiguous consumption never proves execution authorization');
  for(const [index,change] of [[0,{pendingCreatedAt:999}],[0,{durableUserObservedAt:1005}],
    [0,{callerInputAcceptedAt:NaN}],[0,{userTextSha256:'not-a-hash'}],[1,{confirmationId:'neighbor'}],
    [1,{runId:'neighbor'}],[1,{runIdSha256:hash('neighbor')}],[1,{at:2002}],
    [2,{fingerprint:'neighbor'}],[2,{scopeSha256:hash('neighbor')}],[2,{at:1999}]]){
    const events=structuredClone(f.events);Object.assign(events[index],change);assert.equal(assess(events).identityValid,false);
  }
  assert.equal(assessControlConfirmationCoreReceipt(f.parse(f.events),{...f.options,
    execPair:{...f.options.execPair,args:{...f.options.execPair.args,yieldMs:900}}}).identityValid,false);
});
test('core durable receipt is distinct from independently matched exact canonical USER text',()=>{
  const f=coreFixture();
  for(const durableUserMessage of [undefined,{event:{message:{role:'user',content:'确认执行'}}}]) {
    const result=assessControlConfirmationCoreReceipt(f.parse(f.events),{...f.options,durableUserMessage});
    assert.equal(result.identityValid,true);assert.equal(result.rawUserTextHashVerified,false);
  }
  const result=assessControlConfirmationCoreReceipt(f.parse(f.events),{...f.options,
    userTurn:{...f.options.userTurn,role:'assistant'}});assert.equal(result.identityValid,false);
});
