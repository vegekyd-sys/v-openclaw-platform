import {createHash} from 'node:crypto';
import {resolveNativeControlOwner} from './evidence.mjs';

const sha256=value=>createHash('sha256').update(value).digest('hex');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const normalized=value=>String(value??'').trim().replace(/[\s。.!！]/gu,'');
const textOf=message=>typeof message?.content==='string'?message.content:
  (message?.content??[]).filter(part=>part?.type==='text').map(part=>part.text??'').join('\n');

function canonical(value) {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}

// This is an observation fingerprint, never a grant or server policy receipt.
export function confirmationArgsFingerprint(args) {
  if(!args||typeof args!=='object'||Array.isArray(args)||typeof args.command!=='string')return null;
  return sha256(JSON.stringify(canonical(args)));
}

export function isOriginalControlSleep60(command) {
  // Only the requested sleep step, optionally followed by its date step. A
  // quoted/echoed command or another shell action is not this control fixture.
  return /^\s*sleep\s+["']?60(?:s)?["']?\s*(?:(?:;|&&)\s*date(?:\s+[^\n;&|]+)?)?\s*$/u.test(String(command??''));
}

export function resolveControlExecConfirmationChallenge(pairs,{sessionKey,voiceSessionId,pcIndex,
  diagnostics=[],events=[],tools=[],initialInput,alreadyAttempted=false}={}) {
  if(alreadyAttempted||!sessionKey||!voiceSessionId||!Number.isInteger(pcIndex)||
    ![initialInput?.startedAt,initialInput?.completedAt].every(Number.isFinite)||initialInput.exitCode!==0)return null;
  const candidates=[];
  for(const pair of pairs) {
    if(pair.name!=='exec'||pair.sessionKey!==sessionKey||!pair.runId||pair.sourceExecutionTimingVerified!==true||
      !Number.isFinite(pair.calledAt)||pair.calledAt<initialInput.startedAt||!isOriginalControlSleep60(pair.args?.command))continue;
    const start=pair.rawEnvelopes?.find(e=>['agent','session.tool'].includes(e.event)&&e.payload?.stream==='tool'&&
      e.payload.runId===pair.runId&&e.payload.sessionKey===sessionKey&&e.payload.ts===pair.calledAt&&
      e.payload.data?.phase==='start'&&e.payload.data?.name==='exec'&&e.payload.data?.toolCallId===pair.id);
    if(!start||confirmationArgsFingerprint(start.payload.data.args)!==confirmationArgsFingerprint(pair.args))continue;
    const blocked=pair.rawEnvelopes.filter(e=>['agent','session.tool'].includes(e.event)&&e.payload?.stream==='tool'&&
      e.payload.runId===pair.runId&&e.payload.sessionKey===sessionKey&&Number.isFinite(e.payload.ts)&&e.payload.ts>=pair.calledAt&&
      e.payload.data?.phase==='result'&&e.payload.data?.name==='exec'&&e.payload.data?.toolCallId===pair.id&&
      e.payload.data.isError===true&&e.payload.data.result?.details?.status==='blocked'&&
      e.payload.data.result.details.deniedReason==='client-voice-confirmation');
    if(blocked.length!==1)continue;
    const reason=blocked[0].payload.data.result.details.reason;
    const ids=typeof reason==='string'?[...reason.matchAll(/VOICE_CONFIRMATION_REQUIRED:([a-f0-9-]+)/giu)].map(m=>m[1]):[];
    if(ids.length!==1||!uuid.test(ids[0]))continue;
    const owner=resolveNativeControlOwner({diagnostics,events,tools,backendRunId:pair.runId,voiceSessionId,pcIndex});
    const argsObservationSha256=confirmationArgsFingerprint(pair.args);
    if(!owner||!argsObservationSha256)continue;
    candidates.push({confirmationId:ids[0],confirmationIdSha256:sha256(ids[0]),callId:pair.id,runId:pair.runId,
      sessionKey,voiceSessionId,pcIndex,calledAt:pair.calledAt,blockedAt:blocked[0].payload.ts,
      blockedObservedAt:blocked[0].at,args:pair.args,argsObservationSha256,commandSha256:sha256(pair.args.command),
      owner,startEnvelope:start,blockedEnvelope:blocked[0],source:'exact-native-exec-start-and-confirmation-blocked-result'});
  }
  return candidates.length===1?candidates[0]:null;
}

export function resolveConfirmationUserTurn(events,{pcIndex,input,challenge}={}) {
  if(!challenge||challenge.pcIndex!==pcIndex||![input?.startedAt,input?.completedAt,challenge.blockedAt].every(Number.isFinite)||
    input.exitCode!==0||input.completedAt<input.startedAt||input.startedAt<challenge.blockedAt)return null;
  const turns=events.filter(e=>e.pcIndex===pcIndex&&e.type==='turn.done'&&e.role==='user'&&e.turnId&&
    Number.isFinite(e.at)&&e.at>=input.startedAt&&normalized(e.text)==='确认执行');
  return turns.length===1?turns[0]:null;
}

export function resolveConfirmedControlExec(pairs,{challenge,userTurn,owner,input}={}) {
  if(!challenge||!userTurn||!owner||!Number.isFinite(input?.startedAt)||owner.voiceSessionId!==challenge.voiceSessionId||
    owner.backendRunId===challenge.runId||owner.sourceRunIdSha256===challenge.owner.sourceRunIdSha256||
    owner.delegationId===challenge.owner.delegationId)return null;
  const candidates=pairs.filter(pair=>pair.name==='exec'&&pair.sessionKey===challenge.sessionKey&&
    pair.runId===owner.backendRunId&&pair.sourceExecutionTimingVerified===true&&Number.isFinite(pair.calledAt)&&
    pair.calledAt>=input.startedAt&&confirmationArgsFingerprint(pair.args)===challenge.argsObservationSha256&&
    pair.rawEnvelopes?.some(e=>['agent','session.tool'].includes(e.event)&&e.payload?.stream==='tool'&&
      e.payload.runId===pair.runId&&e.payload.sessionKey===pair.sessionKey&&e.payload.ts===pair.calledAt&&
      e.payload.data?.phase==='start'&&e.payload.data?.name==='exec'&&e.payload.data?.toolCallId===pair.id));
  return candidates.length===1?candidates[0]:null;
}

export function findDurableConfirmationUserMessage(transcript,{sessionKey,userTurn,input}={}) {
  if(transcript?.source!=='private-sqlite-active-transcript'||transcript.queryOnly!==true||
    transcript.canonicalSessionKey!==sessionKey||!userTurn||!Number.isFinite(input?.startedAt))return null;
  const candidates=(transcript.rawEvents??[]).filter(row=>{
    const message=row.event?.message;
    return Number.isFinite(row.createdAt)&&row.createdAt>=input.startedAt&&message?.role==='user'&&
      normalized(textOf(message))===normalized(userTurn.text)&&normalized(textOf(message))==='确认执行';
  });
  return candidates.length===1?candidates[0]:null;
}

// These rows come only from the private Gateway's actual core tracer. Neither
// a provider event nor the observer can create a confirmation grant.
export function parseVoiceConfirmationDiagnostics(text) {
  const rows=[];
  for(const [lineIndex,line] of String(text??'').split('\n').entries()) {
    const prefix='GPT_LIVE_VOICE_CONFIRMATION ';
    if(!line.startsWith(prefix))continue;
    try {
      const event=JSON.parse(line.slice(prefix.length));
      if(event&&typeof event==='object'&&['eligible','bind','consume'].includes(event.stage))
        rows.push({...event,source:'private-gateway-core-confirmation-trace',lineIndex,rawLine:line});
    }catch{}
  }
  return rows;
}

export function assessControlConfirmationCoreReceipt(rows,{challenge,userTurn,input,owner,execPair,durableUserMessage}={}) {
  const missing=reason=>({identityValid:false,rawUserTextHashVerified:false,reason,receipt:null});
  if(!challenge||!userTurn||!owner||!execPair||
    ![input?.startedAt,input?.completedAt,userTurn.at,execPair.calledAt].every(Number.isFinite)||
    input.exitCode!==0||input.completedAt<input.startedAt||userTurn.role!=='user'||userTurn.type!=='turn.done'||
    userTurn.pcIndex!==challenge.pcIndex||!userTurn.turnId||userTurn.at<input.startedAt||normalized(userTurn.text)!=='确认执行'||
    owner.voiceSessionId!==challenge.voiceSessionId||
    execPair.runId!==owner.backendRunId||execPair.sessionKey!==challenge.sessionKey||
    execPair.sourceExecutionTimingVerified!==true||confirmationArgsFingerprint(execPair.args)!==challenge.argsObservationSha256||
    owner.backendRunId===challenge.runId||owner.sourceRunIdSha256!==sha256(execPair.runId)||
    owner.delegationId===challenge.owner.delegationId)return missing('Missing exact challenged USER, new native owner, or unchanged actual exec parameters');
  const sourced=(rows??[]).filter(row=>row.source==='private-gateway-core-confirmation-trace'&&Number.isFinite(row.at));
  const eligible=sourced.filter(row=>row.stage==='eligible'&&row.confirmationId===challenge.confirmationId&&
    /^[a-f0-9]{64}$/u.test(row.scopeSha256??'')&&typeof row.fingerprint==='string'&&row.fingerprint.length>0&&
    /^[a-f0-9]{64}$/u.test(row.userTextSha256??'')&&
    [row.pendingCreatedAt,row.durableUserObservedAt,row.callerInputAcceptedAt].every(Number.isFinite)&&
    row.pendingCreatedAt>=challenge.calledAt&&row.pendingCreatedAt<=challenge.blockedAt&&
    row.durableUserObservedAt>row.pendingCreatedAt&&row.durableUserObservedAt>=input.startedAt&&
    row.durableUserObservedAt<=row.callerInputAcceptedAt&&row.callerInputAcceptedAt<=row.at&&
    execPair.calledAt>=row.callerInputAcceptedAt);
  const chains=[];
  for(const first of eligible) {
    const same=row=>row.scopeSha256===first.scopeSha256&&row.fingerprint===first.fingerprint&&
      row.runId===execPair.runId&&row.runIdSha256===owner.sourceRunIdSha256&&row.runIdSha256===sha256(row.runId);
    const bindings=sourced.filter(row=>row.stage==='bind'&&same(row)&&row.confirmationId===challenge.confirmationId&&
      row.at>=first.at&&row.at<=execPair.calledAt);
    for(const bind of bindings) {
      const consumed=sourced.filter(row=>row.stage==='consume'&&same(row)&&row.at>=bind.at&&row.at>=execPair.calledAt);
      for(const consume of consumed)chains.push({eligible:first,bind,consume});
    }
  }
  if(chains.length!==1)return missing('Missing or ambiguous actual eligible/bind/consume chain for this exact new exec run');
  const receipt=chains[0],canonicalText=durableUserMessage?textOf(durableUserMessage.event?.message):null;
  const rawUserTextHashVerified=durableUserMessage?.event?.message?.role==='user'&&
    Number.isFinite(durableUserMessage?.createdAt)&&durableUserMessage.createdAt>=input.startedAt&&
    typeof canonicalText==='string'&&normalized(canonicalText)==='确认执行'&&
    sha256(canonicalText)===receipt.eligible.userTextSha256;
  return {identityValid:true,rawUserTextHashVerified,receipt,
    rawUserTextHashSource:rawUserTextHashVerified?'actual-private-canonical-USER-text':null,
    reason:rawUserTextHashVerified?null:'Core durable USER hash is retained; its exact canonical raw USER text was not independently matched',
    serverFingerprintIsNotObserverArgsHash:true,callerInputAcceptedAt:receipt.eligible.callerInputAcceptedAt,
    actualArgsObservationSha256:confirmationArgsFingerprint(execPair.args)};
}

// Parse only complete raw OS rows. The running writer can have an unfinished
// last line; it cannot turn malformed complete rows or an identity drift into
// successful process evidence.
export function parseControlProcessWitness(text) {
  const lines=String(text??'').split('\n'),partialTail=lines.pop(),rows=[];
  for(const [lineIndex,line] of lines.entries()) {
    if(!line)return {rows,valid:false,reason:'Empty complete OS witness row',lineIndex};
    try {
      const row=JSON.parse(line);
      if(!row||!['observer-start','process-profile','cgroup-sample','identity-drift','observer-end'].includes(row.type)||
        !Number.isFinite(row.at)||rows.length&&row.at<rows.at(-1).at)
        return {rows,valid:false,reason:'Malformed or unordered complete OS witness row',lineIndex};
      rows.push(row);
    }catch{return {rows,valid:false,reason:'Malformed complete OS witness JSON',lineIndex};}
  }
  return {rows,valid:true,partialTail:Boolean(partialTail)};
}

function controlObserverIdentity(witness,expected) {
  if(witness?.valid!==true||!expected)return null;
  const rows=witness.rows??[],starts=rows.filter(row=>row.type==='observer-start');
  if(starts.length!==1||rows[0]!==starts[0]||rows.some(row=>['identity-drift','observer-end'].includes(row.type)))return null;
  const start=starts[0];
  for(const key of ['candidateId','unit','owner','sourceCommit','gatewayPid','gatewayStartTimeTicks',
    'ownerBindingSha256','observerSourceSha256','planSha256','freezeSha256','pollMs','durationSeconds'])
    if(start[key]!==expected[key])return null;
  if(!/^candidate-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(start.candidateId??'')||
    start.unit!=='vlab-'+start.candidateId+'.service'||!start.owner||!Number.isSafeInteger(expected.uid)||
    !Number.isSafeInteger(start.gatewayPid)||start.gatewayPid<=1||!Number.isSafeInteger(start.gatewayStartTimeTicks)||
    start.gatewayStartTimeTicks<=0||!/^[a-f0-9]{40}$/u.test(start.sourceCommit??'')||
    !['ownerBindingSha256','observerSourceSha256','planSha256','freezeSha256'].every(key=>/^[a-f0-9]{64}$/u.test(start[key]??''))||
    start.pollMs!==50||start.durationSeconds!==1800||start.readOnly!==true||start.signalsSent!==false||
    start.gatewayCallsMade!==false||start.envRecorded!==false||start.fullCommandRecorded!==false||
    start.execCallBindingEstablished!==false||start.unitProperties?.ActiveState!=='active'||
    start.unitProperties?.User!==expected.user||!start.unitProperties?.ControlGroup?.endsWith('/'+start.unit))return null;
  return start;
}

const processKey=p=>`${p.pid}:${p.startTimeTicks}`;
const isProcess=p=>Number.isSafeInteger(p?.pid)&&p.pid>1&&Number.isSafeInteger(p.startTimeTicks)&&p.startTimeTicks>0&&
  Number.isSafeInteger(p.ppid)&&typeof p.state==='string';
function profilesAt(rows,at) {
  const profiles=new Map();for(const row of rows)if(row.type==='process-profile'&&row.at<=at&&
    Number.isSafeInteger(row.profile?.pid)&&Number.isSafeInteger(row.profile?.startTimeTicks))
    profiles.set(processKey(row.profile),{...row.profile,observedAt:row.at});
  return profiles;
}
function descendantsOf(processes,rootPid) {
  const pids=new Set([rootPid]);let changed=true;
  while(changed){changed=false;for(const p of processes)if(pids.has(p.ppid)&&!pids.has(p.pid)){pids.add(p.pid);changed=true;}}
  return processes.filter(p=>pids.has(p.pid));
}
function exactGatewayAncestor(shell,processes,start) {
  const byPid=new Map(processes.map(p=>[p.pid,p])),seen=new Set();let current=shell;
  while(current&&!seen.has(current.pid)) {
    if(current.pid===start.gatewayPid)return current.startTimeTicks===start.gatewayStartTimeTicks;
    seen.add(current.pid);current=byPid.get(current.ppid);
  }
  return false;
}
function completeSample(row) {
  return row?.type==='cgroup-sample'&&Array.isArray(row.processes)&&row.processes.every(isProcess)&&
    new Set(row.processes.map(p=>p.pid)).size===row.processes.length&&Array.isArray(row.readErrors);
}

// This join is independent of the model's acknowledgement and HTTP status. It
// requires a unique newly observed exact command beneath the actual Gateway,
// plus its real sleep60 child. It explicitly remains a correlation of native
// execution with OS source; the raw observer does not mint an exec capability.
export function assessControlProcessPending(witness,{execPair,expected,now,maxAgeMs=250}={}) {
  const missing=reason=>({passed:false,status:'unproven',reason});
  const start=controlObserverIdentity(witness,expected),rows=witness?.rows??[];
  if(!start)return missing('Missing exact live read-only OS observer identity');
  if(!Number.isFinite(now)||!Number.isFinite(execPair?.calledAt)||execPair.calledAt<start.at||
    execPair.name!=='exec'||!execPair.id||!execPair.runId||!execPair.sessionKey||execPair.sourceExecutionTimingVerified!==true||
    !isOriginalControlSleep60(execPair.args?.command))return missing('Missing exact original native exec60 start');
  const sourceStart=execPair.rawEnvelopes?.find(row=>['agent','session.tool'].includes(row.event)&&row.payload?.stream==='tool'&&
    row.payload.ts===execPair.calledAt&&row.payload.runId===execPair.runId&&row.payload.sessionKey===execPair.sessionKey&&
    row.payload.data?.phase==='start'&&row.payload.data.name==='exec'&&row.payload.data.toolCallId===execPair.id&&
    confirmationArgsFingerprint(row.payload.data.args)===confirmationArgsFingerprint(execPair.args));
  if(!sourceStart)return missing('Actual native exec source envelope is not independently retained');
  const sample=rows.filter(row=>row.type==='cgroup-sample'&&row.at<=now).at(-1);
  if(!completeSample(sample)||sample.at<execPair.calledAt||now-sample.at>maxAgeMs)
    return missing('Missing fresh complete OS sample after actual exec start');
  const before=rows.filter(row=>row.type==='cgroup-sample'&&row.at<execPair.calledAt).at(-1);
  if(!completeSample(before)||execPair.calledAt-before.at>1000||before.readErrors.length)
    return missing('No complete independent OS sample immediately before native exec');
  const commandSha256=sha256(execPair.args.command),profiles=profilesAt(rows,sample.at);
  const matches=[...profiles.values()].filter(profile=>profile.cgroupMembershipVerified===true&&profile.uid===expected.uid&&
    ['sh','bash','dash','zsh'].includes(profile.executableBasename)&&Number.isInteger(profile.shellCommandArgumentIndex)&&
    profile.argumentSha256?.[profile.shellCommandArgumentIndex]===commandSha256&&profile.observedAt>=execPair.calledAt&&
    profile.observedAt<=execPair.calledAt+3000);
  if(matches.length!==1)return missing('Exact exec command has no unique new OS shell profile');
  const profile=matches[0],shell=sample.processes.find(p=>processKey(p)===processKey(profile));
  if(!shell||['Z','X','x'].includes(shell.state)||before.processes.some(p=>processKey(p)===processKey(shell))||
    !exactGatewayAncestor(shell,sample.processes,start))return missing('Exact command is not a newly running descendant of this Gateway');
  const owned=descendantsOf(sample.processes,shell.pid),ownedIds=new Set(owned.map(p=>p.pid));
  if(owned.some(p=>['Z','X','x'].includes(p.state)||profiles.get(processKey(p))?.cgroupMembershipVerified!==true||
    profiles.get(processKey(p))?.uid!==expected.uid)||sample.readErrors.some(e=>ownedIds.has(e.pid)||e.kind!=='exited-during-read'))
    return missing('Owned process subtree has a dead process, identity failure, or incomplete read');
  const sleeps=owned.filter(p=>p.pid!==shell.pid&&profiles.get(processKey(p))?.executableBasename==='sleep'&&
    [sha256('60'),sha256('60s')].includes(profiles.get(processKey(p))?.argumentSha256?.[1]));
  if(sleeps.length!==1)return missing('No unique real sleep60 child is currently pending');
  return {passed:true,status:'observed-pending',observedAt:sample.at,checkedAt:now,execCallId:execPair.id,
    backendRunId:execPair.runId,sessionKey:execPair.sessionKey,actualExecStartedAt:execPair.calledAt,commandSha256,
    observerIdentity:start,expected,shell:profile,processes:owned,realSleep:sleeps[0],beforeSample:before,sample,
    nativePidWitness:false,correlationMethod:'exact native command SHA + unique new own-cgroup shell + Gateway ancestry + actual source clock',
    execCallBindingSource:'independent-native-and-read-only-OS-evidence-join'};
}

export function assessControlProcessExit(witness,{pending,cancelAt,trustedCancelAt,now,minQuietMs=500,maxGapMs=150}={}) {
  const missing=reason=>({passed:false,status:'unproven',reason});
  if(pending?.passed!==true||!controlObserverIdentity(witness,pending.expected)||
    ![cancelAt,trustedCancelAt,now].every(Number.isFinite)||cancelAt<pending.observedAt||cancelAt-pending.observedAt>1000||
    trustedCancelAt<cancelAt||trustedCancelAt>now)return missing('No fresh exact pending-to-trusted-cancel transition');
  const naturalDeadline=pending.actualExecStartedAt+60000;
  if(cancelAt>=naturalDeadline-5000)return missing('Cancellation is too close to the sleep60 natural completion deadline');
  const rows=witness.rows,tracked=new Map(pending.processes.map(p=>[processKey(p),p]));
  const samples=rows.filter(row=>row.type==='cgroup-sample'&&row.at>=pending.observedAt&&row.at<=now);
  if(!samples.length||samples.at(-1).at<now-250)return missing('OS observation is stale after cancellation');
  let absent=[],previous=pending.observedAt;
  for(const sample of samples) {
    if(!completeSample(sample)||sample.at-previous>maxGapMs)return missing('Process exit interval has missing or incomplete OS samples');
    previous=sample.at;
    const profiles=profilesAt(rows,sample.at);
    for(const root of tracked.values())for(const child of descendantsOf(sample.processes,root.pid)) {
      // A reused PID is never allowed to donate new descendants to the old exec.
      if(sample.processes.some(p=>p.pid===root.pid&&p.startTimeTicks!==root.startTimeTicks))continue;
      const profile=profiles.get(processKey(child));
      if(profile?.uid!==pending.expected.uid||profile.cgroupMembershipVerified!==true)
        return missing('Observed descendant lost its exact own-cgroup profile');
      tracked.set(processKey(child),child);
    }
    const ids=new Set([...tracked.values()].map(p=>p.pid));
    if(sample.readErrors.some(e=>ids.has(e.pid)||e.kind!=='exited-during-read'))
      return missing('Owned PID has a read error; absence is not exit');
    const live=sample.processes.filter(p=>tracked.has(processKey(p)));
    if(sample.at<cancelAt||sample.at<trustedCancelAt||live.length){absent=[];continue;}
    if(sample.at>=naturalDeadline-5000)return missing('Extinction was observed only near or after natural completion');
    absent.push(sample);
    if(absent.at(-1).at-absent[0].at>=minQuietMs)
      return {passed:true,status:'observed-extinct',cancelAt,trustedCancelAt,naturalDeadline,
        firstAbsentAt:absent[0].at,confirmedExtinctAt:sample.at,quietDurationMs:sample.at-absent[0].at,
        trackedProcesses:[...tracked.values()],samples:absent,signalsSentByObserver:false,nativePidWitness:false,
        correlationMethod:pending.correlationMethod,execCallId:pending.execCallId,backendRunId:pending.backendRunId};
  }
  return missing('Exact shell and every observed descendant have not remained absent for the complete exit window');
}

export function assessConfirmedControlCancel({api=[],tools=[],diagnostics=[],owner,sessionKey,cancelAt}={}) {
  const missing=reason=>({passed:false,reason});
  if(!owner?.voiceSessionId||!owner.bridgeCallId||!owner.backendRunId||!owner.traceId||!owner.delegationId||
    !Number.isInteger(owner.generation)||owner.sourceRunIdSha256!==sha256(owner.backendRunId)||
    !sessionKey||!Number.isFinite(cancelAt))return missing('Missing exact native cancellation owner');
  const responses=api.filter(row=>row.route==='/api/steer'&&row.requestedAt>=cancelAt&&
    row.request?.voiceSessionId===owner.voiceSessionId&&row.request.mode==='cancel');
  if(responses.length!==1)return missing('Missing or ambiguous original H5 cancel request');
  const response=responses[0];
  if(response.status!==200||response.responseBody?.ok!==true||response.responseBody.mode!=='cancel'||
    response.responseBody.aborted!==true||response.responseBody.active!==true||response.responseBody.sessionKey!==sessionKey)
    return missing('HTTP acknowledgement does not establish exact backend cancellation acceptance');
  const owned=row=>row.traceId===owner.traceId&&row.delegationId===owner.delegationId&&row.generation===owner.generation&&
    row.sourceRunIdSha256===owner.sourceRunIdSha256;
  const accepted=diagnostics.filter(row=>row.at>=cancelAt&&row.stage==='backend-cancel-accepted'&&owned(row));
  const terminal=tools.filter(row=>row.at>=cancelAt&&row.raw?.type==='tool.error'&&
    row.raw.callId===owner.bridgeCallId&&row.raw.voiceSessionId===owner.voiceSessionId);
  if(accepted.length!==1||terminal.length!==1)return missing('No unique exact source cancel receipt and original native bridge terminal');
  return {passed:true,response,trustedCancel:accepted[0],nativeCancel:terminal[0],
    sourceRunIdSha256:owner.sourceRunIdSha256,backendRunId:owner.backendRunId};
}
