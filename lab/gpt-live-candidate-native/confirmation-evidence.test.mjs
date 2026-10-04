import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {indexNativeToolPairs} from './evidence.mjs';
import {confirmationArgsFingerprint,isOriginalControlSleep60,resolveControlExecConfirmationChallenge,
  resolveConfirmationUserTurn,resolveConfirmedControlExec,findDurableConfirmationUserMessage,
  parseVoiceConfirmationDiagnostics,assessControlConfirmationCoreReceipt,parseControlProcessWitness,
  assessControlProcessPending,assessControlProcessExit,assessConfirmedControlCancel} from './confirmation-evidence.mjs';

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

function processFixture() {
  const {execPair}=coreFixture().options,candidateId='candidate-12345678-1234-1234-1234-123456789abc',
    unit='vlab-'+candidateId+'.service',uid=1001;
  const expected={candidateId,unit,owner:'exact-cli-owner',sourceCommit:'a'.repeat(40),gatewayPid:100,gatewayStartTimeTicks:50,
    ownerBindingSha256:hash('independent actual CLI binding'),observerSourceSha256:hash('raw readonly OS source'),
    planSha256:hash('plan'),freezeSha256:hash('freeze'),pollMs:50,durationSeconds:1800,user:'private-user',uid};
  const start={type:'observer-start',at:1000,...expected,unitProperties:{ActiveState:'active',User:'private-user',ControlGroup:'/user.slice/'+unit},
    readOnly:true,signalsSent:false,gatewayCallsMade:false,envRecorded:false,fullCommandRecorded:false,execCallBindingEstablished:false};
  const gateway={pid:100,startTimeTicks:50,state:'S',ppid:80,pgid:100,sid:80},
    shell={pid:200,startTimeTicks:70,state:'S',ppid:100,pgid:200,sid:80},
    sleep={pid:201,startTimeTicks:71,state:'S',ppid:200,pgid:200,sid:80};
  const profile=(process,executableBasename,argumentSha256,shellCommandArgumentIndex=null)=>({
    pid:process.pid,startTimeTicks:process.startTimeTicks,uid,cgroupMembershipVerified:true,
    executableBasename,argumentSha256,shellCommandArgumentIndex});
  const rows=[start,{type:'process-profile',at:1000,profile:profile(gateway,'node',[hash('node')])},
    {type:'cgroup-sample',at:1950,processes:[gateway],readErrors:[]},
    {type:'process-profile',at:2010,profile:profile(shell,'bash',[hash('bash'),hash('-c'),hash(execPair.args.command)],2)},
    {type:'process-profile',at:2020,profile:profile(sleep,'sleep',[hash('sleep'),hash('60')])}];
  for(let at=2050;at<=2450;at+=50)rows.push({type:'cgroup-sample',at,processes:[gateway,shell,sleep],readErrors:[]});
  const parse=rows=>parseControlProcessWitness(rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
  const options={execPair,expected,now:2500},pending=assessControlProcessPending(parse(rows),options);
  const exitRows=structuredClone(rows);
  for(let at=2500;at<=3250;at+=50)exitRows.push({type:'cgroup-sample',at,processes:at<2700?[gateway,shell,sleep]:[gateway],readErrors:[]});
  const exitOptions={pending,cancelAt:2600,trustedCancelAt:2650,now:3250};
  return {rows,parse,options,pending,exitRows,exitOptions,gateway,shell,sleep};
}
test('OS parser keeps incomplete live tail separate and rejects malformed, reordered or foreign rows',()=>{
  const f=processFixture(),text=f.rows.map(row=>JSON.stringify(row)).join('\n')+'\n';
  assert.equal(parseControlProcessWitness(text+'{"type":').valid,true);
  assert.equal(parseControlProcessWitness(text+'{"type":').partialTail,true);
  for(const suffix of ['{invalid}\n','{}\n','\n',JSON.stringify({type:'cgroup-sample',at:1})+'\n'])
    assert.equal(parseControlProcessWitness(text+suffix).valid,false);
});
test('actual native exec command joins a unique new own-cgroup shell and real sleep60 before cancellation',()=>{
  const f=processFixture();assert.equal(f.pending.passed,true);assert.equal(f.pending.realSleep.pid,201);
  assert.equal(f.pending.nativePidWitness,false,'OS correlation is recorded without inventing a native PID receipt');
  assert.equal(f.pending.shell.argumentSha256[2],hash(f.options.execPair.args.command));
  for(const change of [{sourceExecutionTimingVerified:false},{calledAt:999},{name:'process'},{rawEnvelopes:[]},
    {args:{...f.options.execPair.args,command:'sleep 60; echo x; date'}}])
    assert.equal(assessControlProcessPending(f.parse(f.rows),{...f.options,execPair:{...f.options.execPair,...change}}).passed,false);
  for(const change of [{candidateId:'neighbor'},{sourceCommit:'b'.repeat(40)},{ownerBindingSha256:hash('neighbor')},
    {freezeSha256:hash('neighbor')},{planSha256:hash('neighbor')},{gatewayPid:101},{uid:1002}])
    assert.equal(assessControlProcessPending(f.parse(f.rows),{...f.options,expected:{...f.options.expected,...change}}).passed,false);
});
test('OS pending cannot borrow neighbor command, dead/reused process, stale sample or incomplete ancestry',()=>{
  const f=processFixture(),assess=rows=>assessControlProcessPending(f.parse(rows),f.options);
  for(const mutation of [
    rows=>{rows[3].profile.uid=1002;},
    rows=>{rows[3].profile.cgroupMembershipVerified=false;},
    rows=>{rows[4].profile.argumentSha256[1]=hash('45');},
    rows=>{rows.at(-1).processes[1]={...f.shell,ppid:999};},
    rows=>{rows.at(-1).processes[2]={...f.sleep,state:'Z'};},
    rows=>{rows.at(-1).processes[1]={...f.shell,startTimeTicks:700};},
    rows=>{rows[2].processes.push(f.shell);},
    rows=>{rows.at(-1).readErrors=[{pid:201,kind:'exited-during-read'}];},
    rows=>{rows[0].readOnly=false;},
    rows=>{rows.push({type:'identity-drift',at:2451,kind:'AssertionError'});},
    rows=>{rows.push({type:'observer-end',at:2451,identityErrors:[]});},
    rows=>{rows.splice(4,0,{type:'process-profile',at:2015,profile:{...rows[3].profile,pid:300,startTimeTicks:80}});},
  ]){const rows=structuredClone(f.rows);mutation(rows);assert.equal(assess(rows).passed,false);}
  assert.equal(assessControlProcessPending(f.parse(f.rows),{...f.options,now:2800}).passed,false);
});
test('OS extinction requires all exact processes absent continuously before the real sleep deadline',()=>{
  const f=processFixture(),result=assessControlProcessExit(f.parse(f.exitRows),f.exitOptions);
  assert.equal(result.passed,true);assert.equal(result.firstAbsentAt,2700);assert.equal(result.confirmedExtinctAt,3200);
  assert.equal(result.quietDurationMs,500);assert.equal(result.signalsSentByObserver,false);
  assert.deepEqual(result.trackedProcesses.map(p=>p.pid),[200,201]);
  for(const change of [{cancelAt:2000},{cancelAt:7000},{trustedCancelAt:2599},{trustedCancelAt:Infinity},
    {now:3700},{pending:{...f.pending,passed:false}},
    {pending:{...f.pending,actualExecStartedAt:-53000}}])
    assert.equal(assessControlProcessExit(f.parse(f.exitRows),{...f.exitOptions,...change}).passed,false);
});
test('cancel ack, a missing/read-error PID, sampling gaps and lingering child cannot masquerade as process exit',()=>{
  const f=processFixture(),assess=rows=>assessControlProcessExit(f.parse(rows),f.exitOptions);
  for(const mutation of [
    rows=>{for(const row of rows)if(row.type==='cgroup-sample'&&row.at>=2700)row.processes.push(f.sleep);},
    rows=>{for(const row of rows)if(row.type==='cgroup-sample'&&row.at>=2700)row.readErrors=[{pid:201,kind:'exited-during-read'}];},
    rows=>{rows.splice(rows.findIndex(row=>row.type==='cgroup-sample'&&row.at===2750),4);},
    rows=>{rows.push({type:'identity-drift',at:3251,kind:'AssertionError'});},
    rows=>{for(const row of rows)if(row.type==='cgroup-sample'&&row.at>=2700)row.processes.push({...f.shell,state:'Z'});},
  ]){const rows=structuredClone(f.exitRows);mutation(rows);assert.equal(assess(rows).passed,false);}
  assert.equal(assess(f.exitRows.filter(row=>row.at<3050)).passed,false,'a short silent sample is not sustained OS extinction');
});
test('new observed descendants remain bound even if reparented after cancelling the original shell',()=>{
  const f=processFixture(),rows=structuredClone(f.exitRows),child={pid:202,startTimeTicks:72,ppid:201,state:'S'};
  rows.splice(rows.findIndex(row=>row.at===2500),0,{type:'process-profile',at:2490,
    profile:{pid:202,startTimeTicks:72,uid:1001,cgroupMembershipVerified:true,executableBasename:'helper',argumentSha256:[]}});
  for(const row of rows)if(row.type==='cgroup-sample'&&row.at>=2500)row.processes.push({...child,ppid:row.at<2700?201:1});
  assert.equal(assessControlProcessExit(f.parse(rows),f.exitOptions).passed,false);
});

function cancelFixture() {
  const owner={voiceSessionId:'voice',bridgeCallId:'bridge',backendRunId:'confirmed-run',sourceRunIdSha256:hash('confirmed-run'),
    traceId:'trace',delegationId:'item',generation:2};
  const api=[{route:'/api/steer',requestedAt:2601,at:2610,status:200,request:{voiceSessionId:'voice',mode:'cancel'},
    responseBody:{ok:true,mode:'cancel',active:true,aborted:true,sessionKey:'key'}}];
  const tools=[{at:2660,raw:{type:'tool.error',callId:'bridge',voiceSessionId:'voice'}}];
  const diagnostics=[{at:2650,stage:'backend-cancel-accepted',traceId:'trace',delegationId:'item',generation:2,
    sourceRunIdSha256:hash('confirmed-run')}];
  return {api,tools,diagnostics,owner,sessionKey:'key',cancelAt:2600};
}
test('cancel requires exact original response body, source run receipt and native owner terminal independently',()=>{
  const f=cancelFixture();assert.equal(assessConfirmedControlCancel(f).passed,true);
  for(const mutation of [
    options=>{options.api[0].responseBody={ok:true};},
    options=>{options.api[0].responseBody.aborted=false;},
    options=>{options.api[0].responseBody.sessionKey='neighbor';},
    options=>{options.api[0].request.voiceSessionId='neighbor';},
    options=>{options.api[0].status=409;},
    options=>{options.api.push(options.api[0]);},
    options=>{options.tools[0].raw.callId='neighbor';},
    options=>{options.tools[0].raw.type='tool.result';},
    options=>{options.diagnostics[0].generation=3;},
    options=>{options.diagnostics[0].sourceRunIdSha256=hash('neighbor');},
    options=>{options.diagnostics=[];},
    options=>{options.owner.sourceRunIdSha256=hash('neighbor');},
  ]){const options=structuredClone(f);mutation(options);assert.equal(assessConfirmedControlCancel(options).passed,false);}
});
